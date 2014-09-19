'use strict';

//
// Required modules

var path = require('path');
var util = require('util');
var url = require('url');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));

module.exports = {

  log: function(options) {
    console.log(new Date().toISOString() + ' - ' + util.format.apply(null, arguments));
  },
  testStream: function(req, res, options) {
    var query = req.query;
    var start = (query.resumableChunkNumber - 1) * query.resumableChunkSize;
    var seek = start + query.resumableCurrentChunkSize * 1;
    var filePath = path.resolve(options.dest, query.resumableFilename);
    return fs.statAsync(filePath)
    .then(function(stats) {
      return seek <= stats.size ? {file: filePath, size: stats.size} : false;
    })
    .catch(function(err) {
      return false;
    });
  },
  writeStream: function(req, res, options) {
    var query = req.query;
    return fs.createWriteStream(path.join(options.dest, query.resumableFilename), {flags: query.resumableChunkNumber * 1 === 1 ? 'w' : 'a'});
  },
  readStream: function(req, res, options) {
    var query = req.query;
    var parsed = url.parse(req.url);
    var filePath = path.join(options.dest, parsed.pathname);
    // An example to read the last 10 bytes of a file which is 100 bytes long:
    // fs.createReadStream('sample.txt', {start: 90, end: 99});
    return fs.createReadStream(filePath);
  }
};
