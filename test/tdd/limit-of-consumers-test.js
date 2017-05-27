'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var assert = require('chai').assert;
var expect = require('chai').expect;
var util = require('util');
var debugx = require('debug')('devebot:co:rabbitmq:rabbitmqHandler:test');
var RabbitmqHandler = require('../../lib/bridges/rabbitmq-handler');
var Loadsync = require('loadsync');

describe('rabbitmq-handler:', function() {
	var rabbitmqHandlerConfig = {
		host: 'amqp://master:zaq123edcx@192.168.56.56',
		exchangeType: 'direct',
		exchange: 'tdd-recoverable-exchange',
		routingKey: 'tdd-recoverable',
		queue: 'tdd-recoverable-queue',
		durable: true,
		noAck: false
	};

	describe('no limit of consumers if maxConsumers is undefined', function() {
		var handler;

		before(function() {
			handler = new RabbitmqHandler(lodash.merge({}, rabbitmqHandlerConfig, {
			}));
		});

		beforeEach(function(done) {
			Promise.all([
				handler.prepare(), handler.purgeChain()
			]).then(function() {
				done();
			});
		});

		afterEach(function(done) {
			handler.destroy().then(function() {
				debugx.enabled && debugx('Handler has been destroyed');
				done();
			});
		});

		it('no limit of consumers', function(done) {
			var total = 10;
			var index = 0;
			Promise.mapSeries(lodash.range(total), function(count) {
				return handler.process(function(message, info, finish) {
					setTimeout(finish, 10);
				}).then(function(result) {
					assert.isNotNull(result.consumerTag);
					return result;
				});
			}).then(function() {
				handler.checkChain().then(function(info) {
					assert.equal(info.consumerCount, total, 'no limit of consumers');
					done();
				});
			});
		});
	});

	describe('exceeding quota limits of consumers', function() {
		var handler;
		var total = 10;
		var limit = 7;

		before(function() {
			handler = new RabbitmqHandler(lodash.merge({}, rabbitmqHandlerConfig, {
				maxConsumers: limit
			}));
		});

		beforeEach(function(done) {
			Promise.all([
				handler.prepare(), handler.purgeChain()
			]).then(function() {
				done();
			});
		});

		afterEach(function(done) {
			handler.destroy().then(function() {
				debugx.enabled && debugx('Handler has been destroyed');
				done();
			});
		});

		it('limit of consumers to ' + limit, function(done) {
			var index = 0;
			Promise.mapSeries(lodash.range(total), function(count) {
				return handler.process(function(message, info, finish) {
					setTimeout(finish, 10);
				}).then(function(success) {
					assert.isNotNull(success.consumerTag);
					return success;
				}).catch(function(failure) {
					assert.equal(failure.maxConsumers, limit);
					return failure;
				});
			}).then(function() {
				handler.checkChain().then(function(info) {
					assert.equal(info.consumerCount, limit, 'limit of consumers to ' + limit);
					done();
				});
			});
		});
	});

	describe('no limit of recyclers if maxConsumers is undefined', function() {
		var handler;
		var total = 10;

		before(function() {
			handler = new RabbitmqHandler(lodash.merge({}, rabbitmqHandlerConfig, {
				recycler: {
					queue: 'tdd-recoverable-trash',
					noAck: false
				}
			}));
		});

		beforeEach(function(done) {
			Promise.all([
				handler.prepare(), handler.purgeChain(), handler.purgeTrash()
			]).then(function() {
				done();
			});
		});

		afterEach(function(done) {
			handler.destroy().then(function() {
				debugx.enabled && debugx('Handler has been destroyed');
				done();
			});
		});

		it('no limit of recyclers', function(done) {
			var index = 0;
			Promise.mapSeries(lodash.range(total), function(count) {
				return handler.recycle(function(message, info, finish) {
					setTimeout(finish, 10);
				}).then(function(result) {
					assert.isNotNull(result.consumerTag);
					return result;
				});
			}).then(function() {
				handler.checkTrash().then(function(info) {
					assert.equal(info.consumerCount, total, 'no limit of recyclers');
					done();
				});
			});
		});
	});

	describe('exceeding quota limits of recyclers', function() {
		var handler;
		var total = 10;
		var limit = 8;

		before(function() {
			handler = new RabbitmqHandler(lodash.merge({}, rabbitmqHandlerConfig, {
				recycler: {
					queue: 'tdd-recoverable-trash',
					noAck: false,
					maxConsumers: limit
				}
			}));
		});

		beforeEach(function(done) {
			Promise.all([
				handler.prepare(), handler.purgeChain(), handler.purgeTrash()
			]).then(function() {
				done();
			});
		});

		afterEach(function(done) {
			handler.destroy().then(function() {
				debugx.enabled && debugx('Handler has been destroyed');
				done();
			});
		});

		it('limit of recyclers to ' + limit, function(done) {
			var index = 0;
			Promise.mapSeries(lodash.range(total), function(count) {
				return handler.recycle(function(message, info, finish) {
					setTimeout(finish, 10);
				}).then(function(success) {
					assert.isNotNull(success.consumerTag);
					return success;
				}).catch(function(failure) {
					assert.equal(failure.maxConsumers, limit);
					return failure;
				});
			}).then(function() {
				handler.checkTrash().then(function(info) {
					assert.equal(info.consumerCount, limit, 'limit of recyclers to ' + limit);
					done();
				});
			});
		});
	});
});
