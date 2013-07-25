var addon = require('./build/Release/addon');

module.exports = function(workerId, datacenterId){
    "use strict";
    return new addon.IdWorker(workerId, datacenterId);
};

var datacenterIds = {
        'beta': [31, 30, 29, 28, 27, 26],
        'production': [19, 18, 17, 16, 15, 14, 13, 12, 11, 10]
    },
    datacenterId = datacenterIds[process.env.NODE_ENV] || 0;

if(Array.isArray(datacenterId)){
    datacenterId = datacenterId[Math.floor(Math.random() * datacenterId.length)];
}

var workerId = Math.floor(Math.random()*31);

var worker;

var i = -1,
    start = Date.now(),
    bench = 1000000,
    stop = -1,
    totalTime = -1,
    worker = new addon.IdWorker(workerId, datacenterId);

for(i = 1; i <= bench; i++){
    worker.getNextId();
}

// var os = require('os'),
//     ifaces=os.networkInterfaces(),
//     name;

// for (name in ifaces) {
//     ifaces[name].forEach(function(details){
//         if (details.family == 'IPv4' && details.name === 'eth') {
//             console.log(details.address);
//         }
//     });
// }
stop = Date.now();
totalTime = stop - start;
console.log('generated ' + bench + ' ids in ' + totalTime + ' ms, ' +
    'or ' + (bench/ totalTime) + ' ids/second');

var alpha = 'abcdefghijklmnopqrstuvwxyz'.toUpperCase().split(''),
    vowels = 'aeiouy'.toUpperCase().split('');