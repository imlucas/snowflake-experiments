var addon = require('./build/Release/addon');

module.exports = function(workerId, datacenterId){
    "use strict";
    return new addon.IdWorker(workerId, datacenterId);
};