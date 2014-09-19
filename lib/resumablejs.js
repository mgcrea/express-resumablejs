'use strict';

//
// Required modules

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
  strict: false
};

//
// Module factory

var fsProxy = require('./modules/fs');

function routerFactory(config, proxy) {

  var options = _.defaults(config || {}, defaults);
  if(!proxy) proxy = fsProxy;
  var router = new express.Router();
  var log = options.log;

  router.get('/', function(req, res, next) {

    var query = req.query;
    log('Reading chunk-%d/%d of file "%s"', query.resumableChunkNumber, query.resumableTotalChunks, query.resumableFilename);
    Promise.resolve(proxy.testStream(req, res, options))
    .then(function(file) {
      if(file && query.resumableChunkNumber === query.resumableTotalChunks) {
        return res.json(file);
      }
      res.status(file ? 200 : 404).end();
    })
    .catch(next);

  });

  router.get('/*', function(req, res, next) {

    var query = req.query;
    Promise.resolve(proxy.readStream(req, res, options))
    .then(function(stream) {
      if(!stream) {
        return res.status(404).end();
      }
      stream.on('error', function(err) {
        res.status(404).end();
      });
      stream.pipe(res);
    })
    .catch(next);

  });

  router.post('/', function(req, res, next) {

    var busboy = new Busboy({headers: req.headers});
    var query = req.query;
    busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
      if(fieldname) query[fieldname] = val;
    });
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      log('Writing chunk-%d/%d of file "%s"', query.resumableChunkNumber, query.resumableTotalChunks, query.resumableFilename);
      Promise.resolve(proxy.writeStream(req, res, options))
      .then(function(stream) {
        return new Promise(function(resolve, reject) {
          stream.on('close', function(file) {
            resolve(file);
          });
          stream.on('error', function(err) {
            res.status(404).end();
          });
          file.pipe(stream);
        });
      })
      .then(function(file) {
        if(query.resumableChunkNumber === query.resumableTotalChunks) {
          return res.json(file);
        }
        res.status(200).end();
      })
      .catch(next);

    });

    // Parse multipart request
    busboy.on('finish', function() {});
    busboy.on('error', function(err) {
      res.status(400).end();
    });
    req.pipe(busboy);

  });

  return router;

}

module.exports = routerFactory;
module.exports.defaults = defaults;
