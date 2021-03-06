'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');

var debug = Devebot.require('debug');
var debuglog = debug('devebot:co:rabbitmq:test:bdd:hooks');

var globalHooks = function () {

  this.World = require('./world.js').World;
  this.setDefaultTimeout(60000);

  this.Before(function (scenario, callback) {
    debuglog.isEnabled && debuglog(' -> start mock-http-server before scenario');
    callback();
  });

  this.After(function (scenario, callback) {
    debuglog.isEnabled && debuglog(' -> stop mock-http-server after scenario');
    callback();
  });
};

module.exports = globalHooks;
