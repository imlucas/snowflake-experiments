"use strict";

var IdWorker = require('./snowflake.js');

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