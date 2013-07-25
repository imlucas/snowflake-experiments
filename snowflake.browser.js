"use strict";
var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    Long = require("long"),
    profiler = require('profiler');

// @todo (lucas) claim worker id with a mambo lock in dynamo.
function Worker(workerId, datacenterId, sequence){
    // sanity check for workerId
    if (workerId > Worker.MAX_WORKER_ID || workerId < 0) {
        throw new Error('worker Id can\'t be greater than ' +
            Worker.MAX_WORKER_ID + ' or less than 0');
    }

    if (datacenterId > Worker.MAX_DATACENTER_ID || datacenterId < 0) {
        throw new Error('datacenter Id can\'t be greater than ' +
            Worker.MAX_DATACENTER_ID + ' or less than 0');
    }

    this.log = require('plog')('snowflake:worker:' + datacenterId + ':' + workerId);

    this.workerId = workerId;
    this.datacenterId = datacenterId;
    this.sequence = sequence || 0;
    this.lastTimestamp = -1;

    this.epoch = Long.fromNumber(Worker.EPOCH);

    this.datacenterBit = Long.fromNumber(this.datacenterId).shiftLeft(Worker.DATACENTER_ID_SHIFT);
    this.workerBit = Long.fromNumber(this.workerId).shiftLeft(Worker.WORKER_ID_SHIFT);

    this.log.info('worker starting...', this.getStats());
}
util.inherits(Worker, EventEmitter);

Worker.EPOCH = 1288834974657;
Worker.WORKER_ID_BITS = 5;
Worker.DATACENTER_ID_BITS = 5;
Worker.SEQUENCE_BITS = 12;
Worker.SEQUENCE_MASK = (1 << Worker.SEQUENCE_BITS);
Worker.MAX_SEQUENCE = (1 << Worker.SEQUENCE_BITS) - 1;
Worker.MAX_WORKER_ID = (1 << Worker.WORKER_ID_BITS) - 1;
Worker.MAX_DATACENTER_ID = (1 << Worker.DATACENTER_ID_BITS) - 1;
Worker.WORKER_ID_SHIFT = Worker.SEQUENCE_BITS;
Worker.DATACENTER_ID_SHIFT = Worker.SEQUENCE_BITS + Worker.WORKER_ID_BITS;
Worker.TIMESTAMP_SHIFT = Worker.SEQUENCE_BITS + Worker.WORKER_ID_BITS + Worker.DATACENTER_ID_BITS;

Worker.prototype.getStats = function(){
    return {
        'worker id': this.workerId,
        'worker id bits': Worker.WORKER_ID_BITS,
        'max worker id': Worker.MAX_WORKER_ID,
        'datacenter id': this.datacenterId,
        'datacenter id bits': Worker.DATACENTER_ID_BITS,
        'max datacenter id': Worker.MAX_DATACENTER_ID,
        'sequence': this.sequence,
        'sequence bits': Worker.SEQUENCE_BITS,
        'max sequence': Worker.MAX_SEQUENCE,
        'last timestamp': this.lastTimestamp,
        'timestamp shift': Worker.TIMESTAMP_SHIFT
    };
};

// API to expose to the network.
//
// @todo (lucas) Shoe or dnode or something?
Worker.prototype.server = function(){
    var self = this;
    return {
        'getWorkerId': function(){
            return self.workerId;
        },
        'getDatacenterId': function(){
            return self.datacenterId;
        },
        'getTimestamp': function(){
            return self.getTimestamp();
        },
        'getId': function(useragent){
            return self.getId(useragent).toString();
        }
    };
};

// JVM... I don't even...
Worker.prototype.getWorkerId = function(){
    return this.workerId;
};

Worker.prototype.getDatacenterId = function(){
    return this.datacenterId;
};

Worker.prototype.getTimestamp = function(){
    return Date.now();
};

// generate a new id
Worker.prototype.getId = function(useragent){
    if(!this.isValidUseragent(useragent)){
        throw new Error('invalid useragent');
    }
    var id = this.getNextId();

    // @todo (lucas) should capture runtime in microseconds.
    // @todo (lucas) can just emit one event thats caught by an
    //               ostrich like service?
    this.emit('stat', {'name': 'ids_generated'});
    this.emit('stat', {'name': 'ids_generated_' + useragent});
    return id;
};

// actually generate an id.
Worker.prototype.getNextId = function(){
    // stupid? yes.  but makes it easy to test.
    var timestamp = this.getTimestamp(),
        id = -1;

    if(timestamp < this.lastTimestamp){
        this.log.error('clock is moving backwards. ' +
            'Rejecting requests until ' + this.lastTimestamp);
        throw new Error('clock moved backwards. '+
            'Refusing to generate id for '+ (this.lastTimestamp - timestamp) +
            ' ms');
    }

    if(this.lastTimestamp === timestamp){
        this.sequence = (this.sequence + 1) & Worker.SEQUENCE_MASK;
        if(this.sequence === 0){
            timestamp = this.tilNextMillis(this.lastTimestamp);
        }
    }
    else {
        this.sequence = 0;
    }
    this.lastTimestamp = timestamp;
    profiler.resume();
    // console.time('bake id');
    id = Long.fromNumber(timestamp).subtract(this.epoch)
            .shiftLeft(Worker.TIMESTAMP_SHIFT)
            .or(this.datacenterBit)
            .or(this.workerBit)
            .or(this.sequence);
    profiler.pause();
    // console.timeEnd('bake id');

    // this.log.debug('generated id', id.toString(), {
    //     'timestamp': Long.fromNumber(timestamp).toString(),
    //     'timestamp less epoch': Long.fromNumber(timestamp).subtract(Long.fromNumber(Worker.EPOCH)).toString(),
    //     'datacenter id': this.datacenterId,
    //     'worker id': this.workerId,
    //     'sequence': this.sequence
    // });
    return id;
};

// block until the clock turns over.
Worker.prototype.tilNextMillis = function(lastTimestamp){
    var timestamp = Date.now();
    while (timestamp <= lastTimestamp){
        timestamp = Date.now();
    }
    return timestamp;
};

// query dynamo to find all other workers that are alive
//
// @todo (lucas) implement peers
Worker.prototype.getPeers = function(){
    // val children = zkClient.getChildren(workerIdZkPath)
    // children.foreach { i =>
    //   val peer = zkClient.get("%s/%s".format(workerIdZkPath, i))
    //   val list = new String(peer).split(':')
    //   peerMap(i.toInt) = new Peer(new String(list(0)), list(1).toInt)
    // }
};

// get a list of all the peers
// try and connect to each peer and make sure
// their clocks, workerIds and datacenterIds are all good.
Worker.prototype.sanityCheckPeers = function(){
    // var peerCount = 0
    // val timestamps = peers().filter{ case (id: Int, peer: Peer) =>
    //   !(peer.hostname == getHostname && peer.port == serverPort)
    // }.map { case (id: Int, peer: Peer) =>
    //   try {
    //     log.info("connecting to %s:%s".format(peer.hostname, peer.port))
    //     var (t, c) = SnowflakeClient.create(peer.hostname, peer.port, 1000)
    //     val reportedWorkerId = c.get_worker_id()
    //     if (reportedWorkerId != id) {
    //       log.error("Worker at %s:%s has id %d in zookeeper, but via rpc it says %d", peer.hostname, peer.port, id, reportedWorkerId)
    //       throw new IllegalStateException("Worker id insanity.")
    //     }

    //     val reportedDatacenterId = c.get_datacenter_id()
    //     if (reportedDatacenterId != datacenterId) {
    //       log.error("Worker at %s:%s has datacenter_id %d, but ours is %d",
    //         peer.hostname, peer.port, reportedDatacenterId, datacenterId)
    //       throw new IllegalStateException("Datacenter id insanity.")
    //     }

    //     peerCount = peerCount + 1
    //     c.get_timestamp().toLong
    //   } catch {
    //     case e: TTransportException => {
    //       log.error("Couldn't talk to peer %s at %s:%s", workerId, peer.hostname, peer.port)
    //       throw e
    //     }
    //   }
    // }

    // if (timestamps.toSeq.size > 0) {
    //   val avg = timestamps.foldLeft(0L)(_ + _) / peerCount
    //   if (math.abs(System.currentTimeMillis - avg) > 10000) {
    //     log.error("Timestamp sanity check failed. Mean timestamp is %d, but mine is %d, " +
    //               "so I'm more than 10s away from the mean", avg, System.currentTimeMillis)
    //     throw new IllegalStateException("timestamp sanity check failed")
    //   }
    // }
};

// this seems to be an internal twitter thing just for tracking
// what other services are using id generation and how often.
var useragentRegex = /([a-zA-Z][a-zA-Z\-0-9]*)/g;
Worker.prototype.isValidUseragent = function(useragent){
    return useragentRegex.test(useragent);
};

module.exports = Worker;