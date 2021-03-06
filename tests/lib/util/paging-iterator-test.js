/**
 * @fileoverview Paging Iterator Tests
 */
'use strict';

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------
var assert = require('chai').assert,
	sinon = require('sinon'),
	mockery = require('mockery'),
	Promise = require('bluebird'),
	leche = require('leche'),
	BoxClient = require('../../../lib/box-client');


// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

var sandbox = sinon.createSandbox(),
	PagingIterator,
	clientFake,
	MODULE_FILE_PATH = '../../../lib/util/paging-iterator';

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

describe('PagingIterator', function() {

	beforeEach(function() {
		clientFake = leche.fake(BoxClient.prototype);

		// Enable Mockery
		mockery.enable({
			useCleanCache: true,
			warnOnUnregistered: false
		});

		// Register Module Under Test
		mockery.registerAllowable(MODULE_FILE_PATH);

		// Setup File Under Test
		PagingIterator = require(MODULE_FILE_PATH);
	});

	afterEach(function() {
		sandbox.verifyAndRestore();
		mockery.deregisterAll();
		mockery.disable();
	});

	describe('isIterable', function() {

		it('should return false when response body is empty', function() {

			var response = {
				request: {
					method: 'GET'
				}
			};

			assert.isFalse(PagingIterator.isIterable(response));
		});

		it('should return false when request method cannot be validated', function() {

			var response = {
				body: {
					entries: []
				}
			};

			assert.isFalse(PagingIterator.isIterable(response));
		});

		it('should return false when response body does not contain a collection', function() {

			var response = {
				body: {
					type: 'file',
					id: '12345'
				},
				request: {
					method: 'GET'
				}
			};

			assert.isFalse(PagingIterator.isIterable(response));
		});

		it('should return false when request method is not GET or POST', function() {

			var response = {
				body: {
					entries: [
						{
							type: 'file',
							id: '12345'
						}
					]
				},
				request: {
					method: 'DELETE'
				}
			};

			assert.isFalse(PagingIterator.isIterable(response));
		});

		it('should return false when the collection is from the event stream', function() {
			var response = {
				body: {
					next_stream_position: '123456',
					chunk_size: 1,
					entries: [
						{
							type: 'event',
							event_id: '98765'
						}
					]
				},
				request: {
					method: 'GET'
				}
			};

			assert.isFalse(PagingIterator.isIterable(response));
		});

		it('should return true when collection is valid', function() {

			var response = {
				body: {
					entries: []
				},
				request: {
					method: 'GET'
				}
			};

			assert.isTrue(PagingIterator.isIterable(response));
		});
	});

	describe('constructor', function() {

		it('should throw an error when response is not a collection', function() {

			var response = {
				body: {
					id: '1234',
					name: 'thing 1'
				},
				request: {
					method: 'GET'
				}
			};

			assert.throws(function() {
				/* eslint-disable no-unused-vars*/
				var iterator = new PagingIterator(response, clientFake);
				/* eslint-enable no-unused-vars*/
			}, Error);
		});

		it('should default to a finished collection when response paging strategy cannot be determined', function() {

			var chunk = [{}];
			var response = {
				request: {
					href: 'https://api.box.com/2.0/items?limit=1',
					uri: {
						query: 'limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk,
					limit: 1
				}
			};

			var iterator = new PagingIterator(response, clientFake);

			assert.propertyVal(iterator, 'limit', 1);
			assert.propertyVal(iterator, 'done', true);
			assert.propertyVal(iterator, 'buffer', chunk);
			assert.propertyVal(iterator, 'nextField', 'marker');
			assert.propertyVal(iterator, 'nextValue', null);
			assert.nestedPropertyVal(iterator, 'options.qs.limit', 1);
			assert.nestedPropertyVal(iterator, 'options.qs.marker', null);
			assert.notNestedProperty(iterator, 'options.headers.Authorization');
		});

		it('should correctly set up iterator when response is limit/offset type', function() {

			var chunk = [{}];
			var response = {
				request: {
					href: 'https://api.box.com/2.0/items?limit=1',
					uri: {
						query: 'limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk,
					total_count: 100,
					limit: 1,
					offset: 0
				}
			};

			var iterator = new PagingIterator(response, clientFake);

			assert.propertyVal(iterator, 'limit', 1);
			assert.propertyVal(iterator, 'done', false);
			assert.propertyVal(iterator, 'buffer', chunk);
			assert.propertyVal(iterator, 'nextField', 'offset');
			assert.propertyVal(iterator, 'nextValue', 1);
			assert.nestedPropertyVal(iterator, 'options.qs.limit', 1);
			assert.nestedPropertyVal(iterator, 'options.qs.offset', 1);
			assert.notNestedProperty(iterator, 'options.headers.Authorization');
		});

		it('should correctly set up iterator when limit/offset response fits in one page', function() {

			var chunk = [{}];
			var response = {
				request: {
					href: 'https://api.box.com/2.0/items?limit=1',
					uri: {
						query: 'limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk,
					total_count: 1,
					limit: 1,
					offset: 0
				}
			};

			var iterator = new PagingIterator(response, clientFake);

			assert.propertyVal(iterator, 'limit', 1);
			assert.propertyVal(iterator, 'done', true);
			assert.propertyVal(iterator, 'buffer', chunk);
			assert.propertyVal(iterator, 'nextField', 'offset');
			assert.propertyVal(iterator, 'nextValue', 1);
			assert.nestedPropertyVal(iterator, 'options.qs.limit', 1);
			assert.nestedPropertyVal(iterator, 'options.qs.offset', 1);
			assert.notNestedProperty(iterator, 'options.headers.Authorization');
		});

		it('should correctly set up iterator when response is marker type', function() {

			var chunk = [{}];
			var response = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk,
					limit: 1,
					next_marker: 'vwxyz'
				}
			};

			var iterator = new PagingIterator(response, clientFake);

			assert.propertyVal(iterator, 'limit', 1);
			assert.propertyVal(iterator, 'done', false);
			assert.propertyVal(iterator, 'buffer', chunk);
			assert.propertyVal(iterator, 'nextField', 'marker');
			assert.propertyVal(iterator, 'nextValue', 'vwxyz');
			assert.nestedPropertyVal(iterator, 'options.qs.limit', 1);
			assert.nestedPropertyVal(iterator, 'options.qs.marker', 'vwxyz');
			assert.notNestedProperty(iterator, 'options.headers.Authorization');
		});

		it('should correctly set up iterator when marker response fits on one page', function() {

			var chunk = [{}];
			var response = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					next_marker: null,
					entries: chunk,
					limit: 1
				}
			};

			var iterator = new PagingIterator(response, clientFake);

			assert.propertyVal(iterator, 'limit', 1);
			assert.propertyVal(iterator, 'done', true);
			assert.propertyVal(iterator, 'buffer', chunk);
			assert.propertyVal(iterator, 'nextField', 'marker');
			assert.propertyVal(iterator, 'nextValue', null);
			assert.nestedPropertyVal(iterator, 'options.qs.limit', 1);
			assert.nestedPropertyVal(iterator, 'options.qs.marker', null);
			assert.notNestedProperty(iterator, 'options.headers.Authorization');
		});
	});

	describe('next()', function() {

		it('should return the first item in original page of results when called for the first time', function() {

			var item = {},
				chunk = [item];
			var response = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk,
					limit: 1,
					next_marker: 'vwxyz'
				}
			};

			var iterator = new PagingIterator(response, clientFake);

			return iterator.next()
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item);
				});
		});

		it('should return done flag when all results fit on one page and all items are consumed', function() {

			var item = {},
				chunk = [item];
			var response = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk,
					limit: 1,
					next_marker: ''
				}
			};

			var iterator = new PagingIterator(response, clientFake);

			return iterator.next()
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'value', undefined);
					assert.propertyVal(data, 'done', true);
				});
		});

		it('should fetch second page of results when initial buffer is exhausted for GET requests', function() {

			var item1 = {foo: 'bar'},
				item2 = {foo: 'baz'};
			var chunk1 = [item1],
				chunk2 = [item2];
			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk1,
					limit: 1,
					next_marker: 'vwxyz'
				}
			};
			var response2 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?marker=vwxyz&limit=1',
					uri: {
						query: 'marker=vwxyz&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk2,
					limit: 1,
					next_marker: ''
				}
			};

			var expectedURL = 'https://api.box.com/2.0/items';
			var expectedOptions1 = {
				headers: {},
				qs: {
					limit: 1,
					marker: 'vwxyz'
				}
			};

			sandbox.mock(clientFake).expects('get')
				.withArgs(expectedURL, expectedOptions1)
				.returns(Promise.resolve(response2));

			var iterator = new PagingIterator(response1, clientFake);

			return iterator.next()
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item1);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item2);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'value', undefined);
					assert.propertyVal(data, 'done', true);
				});
		});

		it('should fetch second page of results when initial buffer is exhausted for POST requests', function() {

			var item1 = {foo: 'bar'},
				item2 = {foo: 'baz'};
			var chunk1 = [item1],
				chunk2 = [item2];
			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items',
					uri: {},
					headers: {},
					body: {
						marker: 'abcdef',
						limit: 1
					},
					method: 'POST'
				},
				body: {
					entries: chunk1,
					limit: 1,
					next_marker: 'vwxyz'
				}
			};
			var response2 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items',
					uri: {},
					headers: {},
					body: {
						marker: 'vwxyz',
						limit: 1
					},
					method: 'POST'
				},
				body: {
					entries: chunk2,
					limit: 1,
					next_marker: ''
				}
			};

			var expectedURL = 'https://api.box.com/2.0/items';
			var expectedOptions1 = {
				headers: {
					'content-length': 28
				},
				qs: {},
				body: {
					limit: 1,
					marker: 'vwxyz'
				}
			};

			sandbox.mock(clientFake).expects('post')
				.withArgs(expectedURL, expectedOptions1)
				.returns(Promise.resolve(response2));

			var iterator = new PagingIterator(response1, clientFake);

			return iterator.next()
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item1);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item2);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'value', undefined);
					assert.propertyVal(data, 'done', true);
				});
		});

		it('should fetch second page of offset-based results when original call specified excessive limit', function() {

			var item1 = {foo: 'bar'},
				item2 = {foo: 'baz'};
			var chunk1 = [item1],
				chunk2 = [item2];
			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items?offset=0&limit=99999',
					uri: {
						query: 'offset=0&limit=99999'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk1,
					limit: 1,
					offset: 0,
					total_count: 2
				}
			};
			var response2 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?offset=1&limit=99999',
					uri: {
						query: 'offset=1&limit=99999'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk2,
					limit: 1,
					offset: 1,
					total_count: 2
				}
			};

			var expectedURL = 'https://api.box.com/2.0/items';
			var expectedOptions = {
				headers: {},
				qs: {
					limit: 99999,
					offset: 1
				}
			};

			sandbox.mock(clientFake).expects('get')
				.withArgs(expectedURL, expectedOptions)
				.returns(Promise.resolve(response2));

			var iterator = new PagingIterator(response1, clientFake);

			return iterator.next()
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item1);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item2);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'value', undefined);
					assert.propertyVal(data, 'done', true);
				});
		});

		it('should properly terminate offset-based results when total_count field is not present', function() {

			var item1 = {foo: 'bar'},
				item2 = {foo: 'baz'};
			var chunk1 = [item1],
				chunk2 = [item2];
			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items?offset=0&limit=1',
					uri: {
						query: 'offset=0&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk1,
					limit: 1,
					offset: 0
				}
			};
			var response2 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?offset=1&limit=1',
					uri: {
						query: 'offset=1&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk2,
					limit: 1,
					offset: 1
				}
			};
			var response3 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?offset=1&limit=1',
					uri: {
						query: 'offset=2&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: [],
					limit: 1,
					offset: 2
				}
			};

			var expectedURL = 'https://api.box.com/2.0/items';
			var expectedOptions1 = {
				headers: {},
				qs: {
					limit: 1,
					offset: 1
				}
			};
			var expectedOptions2 = {
				headers: {},
				qs: {
					limit: 1,
					offset: 2
				}
			};

			var clientMock = sandbox.mock(clientFake);
			clientMock.expects('get').withArgs(expectedURL, expectedOptions1)
				.returns(Promise.resolve(response2));
			clientMock.expects('get').withArgs(expectedURL, expectedOptions2)
				.returns(Promise.resolve(response3));

			var iterator = new PagingIterator(response1, clientFake);

			return iterator.next()
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item1);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item2);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'value', undefined);
					assert.propertyVal(data, 'done', true);
				});
		});

		it('should continue paging when intermediate pages are empty', function() {

			var item1 = {foo: 'bar'},
				item2 = {foo: 'baz'};
			var chunk1 = [item1],
				chunk2 = [item2];
			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items?offset=0&limit=1',
					uri: {
						query: 'offset=0&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk1,
					limit: 1,
					offset: 0,
					total_count: 3
				}
			};
			var response2 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?offset=1&limit=1',
					uri: {
						query: 'offset=1&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: [],
					limit: 1,
					offset: 1,
					total_count: 3
				}
			};
			var response3 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?offset=1&limit=1',
					uri: {
						query: 'offset=2&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk2,
					limit: 1,
					offset: 2,
					total_count: 3
				}
			};

			var expectedURL = 'https://api.box.com/2.0/items';
			var expectedOptions1 = {
				headers: {},
				qs: {
					limit: 1,
					offset: 1
				}
			};
			var expectedOptions2 = {
				headers: {},
				qs: {
					limit: 1,
					offset: 2
				}
			};

			var clientMock = sandbox.mock(clientFake);
			clientMock.expects('get').withArgs(expectedURL, expectedOptions1)
				.returns(Promise.resolve(response2));
			clientMock.expects('get').withArgs(expectedURL, expectedOptions2)
				.returns(Promise.resolve(response3));

			var iterator = new PagingIterator(response1, clientFake);

			return iterator.next()
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item1);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item2);

					return iterator.next();
				});
		});

		it('should return rejected promise when fetching page of results fails', function() {

			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: [],
					limit: 1,
					next_marker: 'vwxyz'
				}
			};

			var error = new Error('Could not connect to API');

			sandbox.stub(clientFake, 'get').returns(Promise.reject(error));

			var iterator = new PagingIterator(response1, clientFake);

			return iterator.next()
				.catch(err => assert.instanceOf(err, Error));
		});

		it('should return rejected promise when fetching page of results returns non-200 status code', function() {

			var chunk1 = [{foo: 'bar'}];
			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk1,
					limit: 1,
					next_marker: 'vwxyz'
				}
			};

			var errorResponse = {
				statusCode: 400
			};

			sandbox.stub(clientFake, 'get').returns(Promise.resolve(errorResponse));

			var iterator = new PagingIterator(response1, clientFake);

			return iterator.next()
				.then(() => iterator.next())
				.catch(err => assert.instanceOf(err, Error));
		});

		it('should fetch next page of results when fetched results are exhausted', function() {

			var item1 = {foo: 'bar'},
				item2 = {foo: 'baz'},
				item3 = {foo: 'quux'};
			var chunk1 = [item1],
				chunk2 = [item2],
				chunk3 = [item3];
			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk1,
					limit: 1,
					next_marker: 'vwxyz'
				}
			};
			var response2 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?marker=vwxyz&limit=1',
					uri: {
						query: 'marker=vwxyz&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk2,
					limit: 1,
					next_marker: 'qwerty'
				}
			};
			var response3 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?marker=qwerty&limit=1',
					uri: {
						query: 'marker=qwerty&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk3,
					limit: 1,
					next_marker: ''
				}
			};

			var expectedURL = 'https://api.box.com/2.0/items';
			var expectedOptions1 = {
				headers: {},
				qs: {
					limit: 1,
					marker: 'vwxyz'
				}
			};
			var expectedOptions2 = {
				headers: {},
				qs: {
					limit: 1,
					marker: 'qwerty'
				}
			};

			var clientMock = sandbox.mock(clientFake);
			clientMock.expects('get').withArgs(expectedURL, expectedOptions1)
				.returns(Promise.resolve(response2));
			clientMock.expects('get').withArgs(expectedURL, expectedOptions2)
				.returns(Promise.resolve(response3));

			var iterator = new PagingIterator(response1, clientFake);

			return iterator.next()
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item1);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item2);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'done', false);
					assert.propertyVal(data, 'value', item3);

					return iterator.next();
				})
				.then(data => {
					assert.propertyVal(data, 'value', undefined);
					assert.propertyVal(data, 'done', true);
				});
		});

		it('should queue requests when called consecutively', function() {


			var item1 = {foo: 'bar'},
				item2 = {foo: 'baz'};
			var chunk1 = [item1],
				chunk2 = [item2];
			var response1 = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk1,
					limit: 1,
					next_marker: 'vwxyz'
				}
			};
			var response2 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?marker=vwxyz&limit=1',
					uri: {
						query: 'marker=vwxyz&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk2,
					limit: 1,
					next_marker: 'qwerty'
				}
			};
			var response3 = {
				statusCode: 200,
				request: {
					href: 'https://api.box.com/2.0/items?marker=qwerty&limit=1',
					uri: {
						query: 'marker=qwerty&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: [],
					limit: 1,
					next_marker: null
				}
			};

			var expectedURL = 'https://api.box.com/2.0/items';
			var expectedOptions1 = {
				headers: {},
				qs: {
					limit: 1,
					marker: 'vwxyz'
				}
			};
			var expectedOptions2 = {
				headers: {},
				qs: {
					limit: 1,
					marker: 'qwerty'
				}
			};

			var clientMock = sandbox.mock(clientFake);
			clientMock.expects('get').withArgs(expectedURL, expectedOptions1)
				.returns(Promise.resolve(response2));
			clientMock.expects('get').withArgs(expectedURL, expectedOptions2)
				.returns(Promise.resolve(response3));

			var iterator = new PagingIterator(response1, clientFake);

			return Promise.all([
				iterator.next()
					.then(data => {
						assert.propertyVal(data, 'done', false);
						assert.propertyVal(data, 'value', item1);
					}),
				iterator.next()
					.then(data => {
						assert.propertyVal(data, 'done', false);
						assert.propertyVal(data, 'value', item2);
					}),
				iterator.next()
					.then(data => {
						assert.propertyVal(data, 'done', true);
					})
			]);
		});
	});

	describe('getNextMarker()', function() {

		it('should return the next marker', function() {

			var item = {foo: 'bar'},
				chunk = [item];
			var response = {
				request: {
					href: 'https://api.box.com/2.0/items?marker=abcdef&limit=1',
					uri: {
						query: 'marker=abcdef&limit=1'
					},
					headers: {},
					method: 'GET'
				},
				body: {
					entries: chunk,
					limit: 1,
					next_marker: 'vwxyz'
				}
			};

			var iterator = new PagingIterator(response, clientFake);
			var nextMarker = iterator.getNextMarker();
			return assert.equal(nextMarker, 'vwxyz');
		});
	});
});
