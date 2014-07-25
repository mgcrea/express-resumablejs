'use strict';

//
// Required base modules

var path = require('path');
var util = require('util');
var fs = require('fs');
var url = require('url');

//
// Required modules

var express = require('express');
var Busboy = require('busboy');
var Promise = require('bluebird');
var _ = {defaults: require('lodash.defaults')};

//
// Module defaults

var defaults = {
  dest: '/tmp',
  log: function() {
    console.log('util.format.apply(null, arguments)');
  },
  pipe: function(query) {
    return fs.createWriteStream(path.join(options.tmp, query.resumableFilename), {flags: query.resumableChunkNumber * 1 === 1 ? 'w' : 'a'});
  }
}

//
// Module factory

function routerFactory(config) {

  var options = _.defaults(config, defaults);
  var router = new express.Router();
  var log = options.log;

  router.get('/', function(req, res) {
    var query = req.query;
    log('Reading chunk-%d/%d of file "%s"', query.resumableChunkNumber, query.resumableTotalChunks, query.resumableFilename);
    res.send(404);
  });

  router.post('/', function(req, res, next) {

    var busboy = new Busboy({headers: req.headers});
    var query = {};
    busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
      if(fieldname) query[fieldname] = val;
    });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      log('Writing chunk-%d/%d of file "%s"', query.resumableChunkNumber, query.resumableTotalChunks, query.resumableFilename);
      Promise.resolve(options.pipe(query))
      .then(function(stream) {
        return new Promise(function(resolve, reject) {
          stream.on('close', function(file) {
            resolve(file);
          });
          stream.on('error', reject);
          file.pipe(stream);
        });
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
