'use strict';

const nock = require('nock');
const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const StereotypeClient = require('../src/stereotype_client');
const conf = require('../src/conf');

describe('Stereotype client', function() {
  let token = 'demo_Auth0_v2_token';
  let client = new StereotypeClient(token);
  let nockRequest;
  let templateName = 'testTemplate';
  let templBody = 'Hello {{name}}.';
  let contentType = 'text/mustache';

  beforeEach(function() {
    // All we need is the right URL and a valid auth token.
    nockRequest = nock(conf.BASE_URL, {
      reqheaders: {
        'Authorization': 'Bearer demo_Auth0_v2_token',
      },
    });
  });

  describe('Template', function() {
    describe('List', function() {
      it('lists all templates', function() {
        let templList = [{
          templateId: 'templ1',
          canCopy: true,
          canEdit: true,
        }, {
          templateId: 'templ2',
          canCopy: true,
          canEdit: true,
        }];

        nockRequest.get(`/${conf.VERSION}/templates/`)
          .reply(200, templList, {
            'content-type': 'application/json',
          });

        return client.listTemplates().then((list) => {
          expect(JSON.stringify(list)).to.equal(JSON.stringify(templList));
        });
      });
    });

    describe('Read', function() {
      it('reads a template', function() {
        nockRequest.get(`/${conf.VERSION}/templates/${templateName}`)
          .reply(200, templBody, {
            'content-type': contentType,
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
          },
        });
      });

      it('creates a new valid template', function() {
        nockRequest.put(`/${conf.VERSION}/templates/${templateName}`)
          .reply(201);

        return expect(client.putTemplate(templateName, templBody, contentType)).to.eventually.be.fulfilled;
      });

      it('updates an existing template - body', function() {
        nockRequest.put(`/${conf.VERSION}/templates/${templateName}`)
          .reply(200);

        return expect(client.putTemplate(templateName, templBody, contentType)).to.eventually.be.fulfilled;
      });

      it('fails to create a template with bad permissions', function() {
        nockRequest.put(`/${conf.VERSION}/templates/${templateName}`)
          .reply(403);

        return expect(client.putTemplate(templateName, templBody, contentType)).to.eventually.be.rejected;
      });
    });

    describe('Delete', function() {
      beforeEach(function() {
        // Here we need to also have headers with the right COAM permissions.
        nockRequest = nock(conf.BASE_URL, {
          reqheaders: {
            'Authorization': 'Bearer demo_Auth0_v2_token',
          },
        });
      });

      it('deletes a template', function() {
        nockRequest.delete(`/${conf.VERSION}/templates/${templateName}`)
          .reply(200);

        return expect(client.deleteTemplate(templateName)).to.eventually.be.fulfilled;
      });

      it('fails to delete a non-existant template', function() {
        nockRequest.delete(`/${conf.VERSION}/templates/NON-EXISTENT-TEMPLATE`)
          .reply(404);

        return expect(client.deleteTemplate(templateName)).to.eventually.be.rejected;
      });

      it('fails to delete a template with bad permissions', function() {
        nockRequest.delete(`/${conf.VERSION}/templates/${templateName}`)
          .reply(403);

        return expect(client.deleteTemplate(templateName)).to.eventually.be.rejected;
      });
    });

    describe('Materialize', function() {
      it('materializes a template', function() {
        let materializedBody = 'Hello Customer.';
        nockRequest.post(`/${conf.VERSION}/templates/${templateName}${conf.MATERIALIZATIONS}`)
          .reply(200, materializedBody, {
            'content-type': contentType,
          });

        return client.materialize(templateName).then((tpl) => expect(tpl).to.equal(materializedBody));
      });

      it('materializes a template to a materialization id', function() {
        let matId = 'a162538a-bcf2-4b43-9d53-12cb0dd04b7b';
        let propertyBag = {};
        nockRequest.post(`/${conf.VERSION}/templates/${templateName}${conf.MATERIALIZATIONS}`)
          .reply(200, matId, {
            'location': `/v1/materializations/${matId}`,
          });

        return client.materialize(templateName, propertyBag, 5000, true).then((tpl) => expect(tpl).to.equal(matId));
      });

      it('fetches a template that was previously materialized', function() {
        let materializedBody = 'Hello Customer.';
        let materializationId = 'test_mat_id';
        nockRequest.get(`/${conf.VERSION}/materializations/${materializationId}`)
          .reply(200, materializedBody, {
            'content-type': contentType,
          });

        return client.getMaterialization(materializationId).then((tpl) => expect(tpl).to.equal(materializedBody));
      });

      it('fails to materialize a template with bad permissions', function() {
        nockRequest.post(`/${conf.VERSION}/templates/${templateName}${conf.MATERIALIZATIONS}`)
          .reply(403);

        return expect(client.materialize(templateName)).to.eventually.be.rejected;
      });
    });
  });

  describe('Expand', function() {
    it('expands a propertyBag', function() {
      let propertyBag = {};
      let expanded = 'Hello Customer.';
      nockRequest.post('/' + conf.VERSION + conf.EXPAND)
        .reply(200, expanded);

      return client.expand(propertyBag, 5000).then((expansion) => expect(expansion).to.equal(expanded));
    });
  });

  describe('Livecheck', function() {
    it('is alive', function() {
      nockRequest.get('/livecheck').reply(200);
      return expect(client.livecheck()).to.eventually.equal(true);
    });

    it('handles 500', function() {
      nockRequest.get('/livecheck').reply(500);
      return expect(client.livecheck()).to.be.rejected;
    });
  });

  describe('Get Swagger', function() {
    it('has correct title', function() {
      nockRequest.get(`/${conf.VERSION}/swagger.json`).reply(200, {
        info: {
          title: 'Stereotype',
        },
      });

      return client.getSwagger().then((swagger) => expect(swagger.info.title).to.equal('Stereotype'));
    });

    it('handles 500', function() {
      nockRequest.get(`/${conf.VERSION}/swagger.json`).reply(500);
      return expect(client.getSwagger()).to.be.rejected;
    });
  });
});
