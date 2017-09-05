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
  let nockRequest;
  let templateName = 'testTemplate';
  var templBody = 'Hello {{name}}.';
  var contentType = 'text/mustache';

  beforeEach(function() {
    // All we need is the right URL and a valid auth token.
    nockRequest = nock(conf.BASE_URL, {
      reqheaders: {
        'Authorization': 'Bearer demo_Auth0_v2_token'
      }
    });
  });

  describe('Template', function() {

    describe('Read', function() {

      it('reads a template', function() {
        nockRequest.get(`/${conf.VERSION}/templates/${templateName}`)
          .reply(200, templBody, {
            'content-type': contentType
          });

        return client.getTemplate(templateName).then((tpl) => {
          expect(tpl.templateBody).to.equal(templBody);
          expect(tpl.templateType).to.equal(contentType);
        });
      });

      it('fails to read a nonexistent template', function() {
        nockRequest.get(`/${conf.VERSION}/templates/${templateName}`)
          .reply(404);

        return expect(client.getTemplate(templateName)).to.eventually.be.rejected;
      });

      it('fails to read a template due to bad permissions', function() {
        nockRequest.get(`/${conf.VERSION}/templates/${templateName}`)
          .reply(403);

        return expect(client.getTemplate(templateName)).to.eventually.be.rejected;
      });
    });

    describe('Write', function() {

      beforeEach(function() {
        // Here we need to also have headers with the right COAM permissions.
        nockRequest = nock(conf.BASE_URL, {
          reqheaders: {
            'Authorization': 'Bearer demo_Auth0_v2_token',
            'x-cimpress-read-permission': `fulfillers:${fulfillerId}:create`,
            'x-cimpress-write-permission': `fulfillers:${fulfillerId}:create`
          }
        });
      });

      it('creates a new valid template', function() {
        nockRequest.put(`/${conf.VERSION}/templates/${templateName}`)
          .reply(201);

        return expect(client.putTemplate(templateName, templBody, contentType)).to.eventually.succeed;
      });

      it('updates an existing template - body', function() {
        nockRequest.put(`/${conf.VERSION}/templates/${templateName}`)
          .reply(200);

        return expect(client.putTemplate(templateName, templBody, contentType)).to.eventually.succeed;
      });

      it('updates an existing template - permissions only (hit the PATCH endpoint)', function() {
        nockRequest.patch(`/${conf.VERSION}/templates/${templateName}`)
          .reply(200);

        return expect(client.putTemplate(templateName, null, null, 'custom-r-perm', 'custom-w-perm')).to.eventually.succeed;
      });

      it('fails to create a template with bad permissions', function() {
        nockRequest.put(`/${conf.VERSION}/templates/${templateName}`)
          .reply(403);

        return expect(client.putTemplate(templateName, templBody, contentType)).to.eventually.be.rejected;
      });
    });

  });

  describe("livecheck", function() {

    it('is alive', function() {
      nockRequest.get('/livecheck').reply(200);
      return expect(client.livecheck()).to.eventually.equal(true);
    });

    it('handles 500', function() {
      nockRequest.get('/livecheck').reply(500);
      return expect(client.livecheck()).to.be.rejected;
    });
  });

  describe("get Swagger", function() {
    it('has correct title', function() {
      nockRequest.get(`/${conf.VERSION}/swagger.json`).reply(200, {
        info: {
          title: 'Stereotype'
        }
      });

      return client.getSwagger().then((swagger) => expect(swagger.info.title).to.equal('Stereotype'));
    });

    it('handles 500', function() {
      nockRequest.get(`/${conf.VERSION}/swagger.json`).reply(500);
      return expect(client.getSwagger()).to.be.rejected;
    });
  });

});
