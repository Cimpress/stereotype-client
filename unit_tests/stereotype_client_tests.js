'use strict';

const nock = require('nock');
const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const StereotypeClient = require('../src/stereotype_client');
const conf = require('../src/conf');

describe('Stereotype client', function() {

  this.timeout(10000);

  let token = 'demo_Auth0_v2_token';
  let fulfillerId = 1234;
  let client = new StereotypeClient(token, fulfillerId);
  let mock;

  beforeEach(function() {
    // All we need is the right URL and a valid auth token.
    mock = nock(conf.BASE_URL, {
      reqheaders: {
        'Authorization': 'Bearer demo_Auth0_v2_token'
      }
    });
  });

  describe('Template', function() {

    describe('Read operations', function() {
      it('reads a template');
      it('fails to read a template due to bad permissions');
      it('fails to read an inexisting template');
    });

    describe('Write operations', function() {

      beforeEach(function() {
        // Here we need to also have headers with the right COAM permissions.
        mock = nock(conf.BASE_URL, {
          reqheaders: {
            'Authorization': 'Bearer demo_Auth0_v2_token',
            'x-cimpress-read-permission': `fulfillers:${fulfillerId}:create`,
            'x-cimpress-write-permission': `fulfillers:${fulfillerId}:create`
          }
        });
      });

      it('creates a new valid template');
      it('updates an existing template');
      it('fails to create an invalid template');
      it('fails to create a template with bad permissions');
    });
  });

  describe('Materialize', function() {
    it('materializaes a template');
  });

  describe("livecheck", function() {

    it('is alive', function() {
      mock.get('/livecheck').reply(200);
      return expect(client.livecheck()).to.eventually.equal(true);
    });

    it('throws an error', function() {
      mock.get('/livecheck').reply(500);
      return expect(client.livecheck()).to.be.rejected;
    });
  });

  describe("get Swagger", function() {
    it('has correct title', function() {
      mock.get(`/${conf.VERSION}/swagger.json`).reply(200, {
        info: {
          title: 'Stereotype'
        }
      });

      return client.getSwagger().then((swagger) => expect(swagger.info.title).to.equal('Stereotype'));
    });

    it('returns server error', function() {
      mock.get(`/${conf.VERSION}/swagger.json`).reply(500);
      return expect(client.getSwagger()).to.be.rejected;
    });
  });

});
