'use strict';

//
// Required base modules

var os = require('os');
var path = require('path');
var util = require('util');
var url = require('url');
var express = require('express');
var Busboy = require('busboy');
var Promise = require('bluebird');
var _ = {defaults: require('lodash.defaults')};
var fs = Promise.promisifyAll(require('fs'));

//
// Module defaults

var defaults = {
  dest: os.tmpdir(),
  log: function(options) {
    console.log(new Date().toISOString() + ' - ' + util.format.apply(null, arguments));
  },
  testStream: function(req, options) {
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
  writeStream: function(req, options) {
    var query = req.query;
    return fs.createWriteStream(path.join(options.dest, query.resumableFilename), {flags: query.resumableChunkNumber * 1 === 1 ? 'w' : 'a'});
  },
  readStream: function(req, options) {
    var query = req.query;
    var parsed = url.parse(req.url);
    var filePath = path.join(options.dest, parsed.pathname);
    // An example to read the last 10 bytes of a file which is 100 bytes long:
    // fs.createReadStream('sample.txt', {start: 90, end: 99});
    return fs.createReadStream(filePath);
  }
}

//
// Module factory

function routerFactory(config) {

  var options = _.defaults(config || {}, defaults);
  var router = new express.Router();
  var log = options.log;

  router.get('/', function(req, res, next) {

    var query = req.query;
    log('Reading chunk-%d/%d of file "%s"', query.resumableChunkNumber, query.resumableTotalChunks, query.resumableFilename);
    Promise.resolve(options.testStream(req, options))
    .then(function(file) {
      if(query.resumableChunkNumber === query.resumableTotalChunks) {
        return res.send(file);
      }
      res.send(file ? 200 : 404);
    })
    .catch(next);

  });

  router.get('/*', function(req, res, next) {

    var query = req.query;
    Promise.resolve(options.readStream(req, options))
    .then(function(stream) {
      stream.on('error', function(err) {
        res.send(404);
      })
      stream.pipe(res);
    })
    .catch(next);

  })

  router.post('/', function(req, res, next) {

    var busboy = new Busboy({headers: req.headers});
    var query = {};
    busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
      if(fieldname) query[fieldname] = val;
    });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      log('Writing chunk-%d/%d of file "%s"', query.resumableChunkNumber, query.resumableTotalChunks, query.resumableFilename);
      Promise.resolve(options.writeStream(req, options))
      .then(function(stream) {
        return new Promise(function(resolve, reject) {
          stream.on('close', function(file) {
            resolve(file);
          });
          stream.on('error', reject);
          file.pipe(stream);
        })
      })
      .then(function(file) {
        if(query.resumableChunkNumber === query.resumableTotalChunks) {
          return res.json(file)
        }
        res.send(200);
      })
      .catch(next);

    });

    // Parse multipart request
    busboy.on('finish', function() {});
    busboy.on('error', function(err) {
      res.send(400);
    });
    req.pipe(busboy);

  });

  return router;

};

module.exports = routerFactory;
module.exports.defaults = defaults;
