'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var assert = require('chai').assert;
var expect = require('chai').expect;
var faker = require('faker');
var util = require('util');
var debugx = require('debug')('devebot:co:rabbitmq:rabbitmqHandler:test');
var RabbitmqHandler = require('../../lib/bridges/rabbitmq-handler');
var appCfg = require('./app-configuration');
var Loadsync = require('loadsync');

describe('rabbitmq-handler:', function() {

	describe('constructor', function() {
		before(function() {
			checkSkip.call(this, 'constructor');
		});
	});

	describe('process', function() {
		var handler;

		before(function() {
			checkSkip.call(this, 'process');
			handler = new RabbitmqHandler(appCfg.extend());
		});

		beforeEach(function(done) {
			handler.prepare().then(function() {
				done();
			});
		});

		afterEach(function(done) {
			handler.destroy().then(function() {
				debugx.enabled && debugx('Handler has been destroyed');
				done();
			});
		});

		it('preserve the order of elements', function(done) {
			var total = 10;
			var index = 0;
			handler.consume(function(message, info, finish) {
				message = JSON.parse(message);
				assert(message.code === index++);
				finish();
				if (index >= total) done();
			}).then(function() {
				return handler.purgeChain();
			}).then(function() {
				Promise.mapSeries(lodash.range(total), function(count) {
					return handler.publish({ code: count, msg: 'Hello world' }).delay(1);
				});
			});
		});

		it('push elements to queue massively', function(done) {
			var max = 5000;
			var idx = lodash.range(max);
			var n0to9 = lodash.range(10);
			var count = 0;
			handler.consume(function(message, info, finish) {
				message = JSON.parse(message);
				var pos = idx.indexOf(message.code);
				if (pos >= 0) idx.splice(pos, 1);
				finish();
				count++;
				if (count >= max * 10) {
					assert(idx.length === 0);
					done();
				}
			}).then(function() {
				return handler.purgeChain();
			}).then(function() {
				Promise.reduce(lodash.range(max), function(state, n) {
					return Promise.each(n0to9, function(k) {
						handler.publish({ code: (10*n + k), msg: 'Hello world' });
					}).delay(1);
				}, {});
			});
			this.timeout(60*max);
		});

		it('push large elements to queue', function(done) {
			var total = 10;
			var index = 0;
			var fields = generateFields(1000);
			handler.consume(function(message, info, finish) {
				message = JSON.parse(message);
				assert(message.code === index++);
				finish();
				if (index >= total) done();
			}).then(function() {
				return handler.purgeChain();
			}).then(function() {
				Promise.mapSeries(lodash.range(total), function(count) {
					var randobj = generateObject(fields);
					randobj.code = count;
					return handler.publish(randobj).delay(1);
				});
			});
		});
	});

	describe('customize enqueue() routingKey', function() {
		var handler0;
		var handler1;

		before(function() {
			handler0 = new RabbitmqHandler(appCfg.extend());
			handler1 = new RabbitmqHandler(appCfg.extend({
				routingKey: 'tdd-backup',
				queue: 'tdd-recoverable-clone'
			}));
		});

		beforeEach(function(done) {
			Promise.all([
				handler0.prepare(),
				handler1.prepare()
			]).then(function() {
				done();
			});
		});

		afterEach(function(done) {
			Promise.all([
				handler0.destroy(),
				handler1.destroy()
			]).then(function() {
				debugx.enabled && debugx('Handler has been destroyed');
				done();
			});
		});

		it('copy message to another queue (CC)', function(done) {
			var total = 10;

			var loadsync = new Loadsync([{
				name: 'testsync',
				cards: ['handler0', 'handler1']
			}]);

			var index0 = 0;
			var ok0 = handler0.consume(function(message, info, finish) {
				message = JSON.parse(message);
				assert(message.code === index0++);
				finish();
				if (index0 >= total) loadsync.check('handler0', 'testsync');
			}).then(function() {
				return handler0.purgeChain();
			});

			var index1 = 0;
			var ok1 = handler1.process(function(message, info, finish) {
				message = JSON.parse(message);
				assert(message.code === index1++);
				finish();
				if (index1 >= total) loadsync.check('handler1', 'testsync');
			}).then(function() {
				return handler1.purgeChain();
			});

			loadsync.ready(function(info) {
				done();
			}, 'testsync');

			Promise.all([ok0, ok1]).then(function() {
				lodash.range(total).forEach(function(count) {
					handler0.enqueue({ code: count, msg: 'Hello world' }, {CC: 'tdd-backup'});
				});
			});
		});

		it('redirect to another queue by changing routingKey', function(done) {
			var total = 10;
			var index = 0;
			var ok1 = handler1.process(function(message, info, finish) {
				message = JSON.parse(message);
				assert(message.code === index++);
				finish();
				if (index >= total) done();
			}).then(function() {
				return handler1.purgeChain();
			});
			ok1.then(function() {
				lodash.range(total).forEach(function(count) {
					handler0.enqueue({ code: count, msg: 'Hello world' }, {}, {
						routingKey: 'tdd-backup'
					});
				});
			});
		});
	});
});

var checkSkip = function(name) {
	if (process.env.TDD_EXEC && process.env.TDD_EXEC.indexOf(name) < 0) {
		this.skip();
	}
}

var generateFields = function(num) {
	return lodash.range(num).map(function(index) {
		return {
			name: 'field_' + index,
			type: 'string'
		}
	});
}

var generateObject = function(fields) {
	var obj = {};
	fields = fields || {};
	fields.forEach(function(field) {
		obj[field.name] = faker.lorem.sentence();
	});
	return obj;
}