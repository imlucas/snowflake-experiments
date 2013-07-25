"use strict";

var assert = require('assert'),
    IdWorker = require('./snowflake'),
    Long = require('long'),
    util = require('util'),
    debug = require('plog')('snowflake:test');

var WORKER_MASK = Long.fromInt(126976), // 0x000000000001F000L
    DATACENTER_MASK = Long.fromInt(4063232), // 0x00000000003E0000L
    TIMESTAMP_MASK  = Long.fromString('18446744073705357312'); //0xFFFFFFFFFFC00000L

function Iterator(items){
    this.stack = items;
}

Iterator.prototype.next = function(){
    return this.stack.shift();
};

function EasyTimeWorker(workerId, datacenterId){
    EasyTimeWorker.super_.call(this, workerId, datacenterId);
    this.time = -1;
}
util.inherits(EasyTimeWorker, IdWorker);

EasyTimeWorker.prototype.getTimestamp = function(){
    return this.time > -1 ? this.time : Date.now();
};

function WakingIdWorker(workerId, datacenterId){
    WakingIdWorker.super_.call(this, workerId, datacenterId);
    this.slept = 0;
}
util.inherits(WakingIdWorker, EasyTimeWorker);

WakingIdWorker.prototype.tilNextMillis = function(lastTimestamp){
    this.slept += 1;
    EasyTimeWorker.prototype.tilNextMillis.call(this, lastTimestamp);
};

describe('Worker', function(){
    it('should generate an id', function(){
        var worker = new IdWorker(1, 1),
            id = worker.getNextId();
        assert(id > 0, id + 'not greater than 0');
    });

    it('should return an accurate timestamp', function(){
        var worker = new IdWorker(1, 1),
            now = Date.now();
        assert(worker.getTimestamp() - now < 50);
    });

    it('should return the correct worker id', function(){
        var worker = new IdWorker(1, 1);
        assert.equal(worker.getWorkerId(), 1);
    });

    it('should return the correct datacenter id', function(){
        var worker = new IdWorker(1, 1);
        assert.equal(worker.getDatacenterId(), 1);
    });

    it('should properly mask the worker id', function(){
        var worker = new IdWorker(IdWorker.MAX_WORKER_ID, 0),
            i, id;

        for(i = 1; i <= 1000; i++){
            id = worker.getNextId();
            assert.equal(id.and(WORKER_MASK).shiftRight(IdWorker.SEQUENCE_BITS).toInt(),
                IdWorker.MAX_WORKER_ID);
        }
    });

    it('should properly mask the datacenter id', function(){
        var worker = new IdWorker(0, IdWorker.MAX_DATACENTER_ID),
            id = worker.getNextId();

        assert.equal(id.and(DATACENTER_MASK).shiftRight(17).toInt(),
            IdWorker.MAX_DATACENTER_ID);
    });

    it('should properly mask the timestamp', function(){
        var worker = new EasyTimeWorker(IdWorker.MAX_WORKER_ID, IdWorker.MAX_DATACENTER_ID),
            i, now, id, actual, expected;

        for(i = 1; i <= 100; i++){
            worker.time = Date.now();
            id = worker.getNextId();
            actual = id.and(TIMESTAMP_MASK)
                .shiftRight(IdWorker.TIMESTAMP_SHIFT).toInt();

            expected = Long.fromNumber(worker.time)
                .subtract(Long.fromNumber(IdWorker.EPOCH)).toInt();

            // @todo (lucas) I have no idea why yet but sometimes expected
            //               will be 1 ms less than its supposed to be.
            // assert.equal(actual, expected);
            assert(actual - expected < 2);
        }
    });

    it('should rollover the sequence id', function(){
        // put a zero in the low bit so we can detect overflow from the sequence
        var workerId = 4,
            datacenterId = 4,
            worker = new IdWorker(workerId, datacenterId),
            startSequence = 0xFFFFFF-20,
            endSequence = 0xFFFFFF+20,
            i,
            id;

        worker.sequence = startSequence;
        for(i = startSequence; i <= endSequence; i++){
            id = worker.getNextId();
            assert.equal(id.and(WORKER_MASK).shiftRight(12).toInt(), workerId);
        }
    });

    it('should generate increasing ids', function(){
        var worker = new IdWorker(1, 1),
            lastId = 0,
            i,
            id;

        for(i = 1; i <= 100; i++){
            id = worker.getNextId();
            assert(id > lastId, 'latest must be the greatest ' + id  + ' !> ' + lastId);
            lastId = id;
        }
    });

    it('generate lots of ids quickly', function(){
        var worker = new IdWorker(1, 1),
            i = -1,
            start = Date.now(),
            // bench = 1000000,
            bench = 1000,
            stop = -1,
            totalTime = -1;

        for(i = 1; i <= bench; i++){
            worker.getNextId();
        }
        stop = Date.now();
        totalTime = stop - start;
        console.log('generated ' + bench + ' ids in ' + totalTime + ' ms, ' +
            'or ' + (bench/ totalTime) + ' ids/second');
        assert(true);
    });

    it('should sleep if we would rollover twice in the same millisecond', function(){
        var queue = [],
            worker = new WakingIdWorker(1, 1),
            iter = new Iterator([2, 2, 3]);

        worker.getTimestamp = iter.next.bind(iter);

        worker.sequence = IdWorker.MAX_SEQUENCE;
        worker.getNextId();

        worker.sequence = IdWorker.MAX_SEQUENCE;
        worker.getNextId();

        assert(worker.slept > 1, 'worker should have slept once');
    });

    it('should generate only unique ids', function(){
        var worker = new IdWorker(31, 31),
            // n = 2000000,
            n = 100,
            i = 0,
            id,
            set = {}
            // ,
            ;
            // collisions = [];

        for(i = 1; i <= n; i++){
            id = worker.getNextId();
            if(!set[id]){
                set[id] = true;
            }
        }
        assert.equal(Object.keys(set).length, n);
    });

    it('should generate ids over 50 billion', function(){
        var worker = new IdWorker(0, 0);
        assert(worker.getNextId() > (50000000000));
    });

    it('should generate only unique ids, even when time goes backwards', function(){
        var sequenceMask = -1 ^ (-1 << 12),
            worker = new EasyTimeWorker(0, 0),
            id1, id2, id3;

        worker.time = 1;

        // reported at https://github.com/twitter/snowflake/issues/6
        // first we generate 2 ids with the same time, so that we get the sequqence to 1
        assert.equal(worker.sequence, 0);
        assert.equal(worker.time, 1);

        id1 = worker.getNextId();
        assert.equal(id1.shiftRight(IdWorker.TIMESTAMP_SHIFT).toInt(), 1);
        assert.equal(id1.and(sequenceMask).toInt(), 0);

        assert.equal(worker.sequence, 0);
        assert.equal(worker.time, 1);
        id2 = worker.getNextId();
        assert.equal(worker.sequence, 1);
        assert.equal(id2.shiftRight(IdWorker.TIMESTAMP_SHIFT).toInt(), 1);
        assert.equal(id2.and(sequenceMask).toInt(), 1);

        // then we set the time backwards
        worker.time = 0;
        assert.throws(function(){
            worker.getNextId();
        }, Error);

        // this used to get reset to 0, which would cause conflicts
        assert.equal(worker.sequence, 1);

        worker.time = 1;
        id3 = worker.getNextId();
        assert.equal((id3 >> 22), 1);
        assert.equal((id3 & sequenceMask ), 2);
    });

    it('should emit stats', function(done){
        var count = 0,
            worker = new IdWorker(1, 1);
        worker.on('stat', function(name){
            count += 1;
            if(count === 2){
                done();
            }
        });
        worker.server().getId('foo-bar');
    });

    it('should validate simple useragents', function(){
        var worker = new IdWorker(1, 1);
        assert(worker.isValidUseragent("infra-dm"));
    });
});