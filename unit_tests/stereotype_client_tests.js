'use strict';

const nock = require('nock');
const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const StereotypeClient = require('../src/stereotype_client');
const StereotypeOptions = {
  baseUrl: 'https://stereotype.trdlnk.cimpress.io',
};

let token = 'demo_Auth0_v2_token';
let client = new StereotypeClient(token, StereotypeOptions);
let nockRequest;
let templateName = 'testTemplate';
let templBody = 'Hello {{name}}.';
let templateType = 'text/x-handlebars-template';
let contentType = 'text/x-handlebars-template; charset=utf-8; postProcessor=mjml';


describe('Stereotype client', function() {
  beforeEach(function() {
    // All we need is the right URL and a valid auth token.
    nock.cleanAll();
    nockRequest = nock(StereotypeOptions.baseUrl, {
      reqheaders: {
        'Authorization': 'Bearer demo_Auth0_v2_token',
      },
    });
  });

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

    nockRequest.get(`/v1/templates?public=false`)
      .reply(200, templList, {
        'content-type': 'application/json',
      });

    return client.listTemplates().then((list) => {
      expect(JSON.stringify(list)).to.equal(JSON.stringify(templList));
    });
  });

  it('reads a template', function() {

    // Important: Mock the request with more headers first!
    nock(StereotypeOptions.baseUrl, {
      reqheaders: {
        'Authorization': 'Bearer demo_Auth0_v2_token',
        'Accept': 'application/json',
      },
    })
      .get(`/v1/templates/${templateName}`)
      .reply(200, {
        contentType: templateType,
        isPublic: false
      });

    nock(StereotypeOptions.baseUrl, {
      reqheaders: {
        'Authorization': 'Bearer demo_Auth0_v2_token',
      },
    })
      .get(`/v1/templates/${templateName}`)
      .reply(200, templBody);

    return client.getTemplate(templateName).then((tpl) => {
      expect(tpl.templateBody).to.equal(Base64.encode(templBody));
      expect(tpl.contentType).to.equal(templateType);
      expect(tpl.isPublic).to.be.false;
    });
  });

  it('fails to read a nonexistent template', function() {
    nockRequest.get(`/v1/templates/${templateName}`)
      .reply(404);
    return expect(client.getTemplate(templateName)).to.eventually.be.rejected;
  });

  it('fails to read a template with an empty name', function() {
    return expect(client.getTemplate('')).to.eventually.be.rejected;
  });

  it('fails to read a template due to bad permissions', function() {
    nockRequest.get(`/v1/templates/${templateName}`)
      .reply(403);

    return expect(client.getTemplate(templateName)).to.eventually.be.rejected;
  });

  [true, 'true', 'True'].forEach((isPublic) => {
    it(`creates a new valid public ${isPublic} template PUT`, function() {
      nockRequest.put(`/v1/templates/${templateName}`)
        .matchHeader('x-cimpress-template-public', 'true')
        .reply(201);

      return expect(client.putTemplate(templateName, templBody, contentType, isPublic)).to.eventually.be.fulfilled;
    });

    it(`creates a new valid public ${isPublic} template POST`, function(done) {
      const templateId = 'mytemplateid';
      nockRequest.post(`/v1/templates`)
        .matchHeader('x-cimpress-template-public', 'true')
        .reply(201, templateId, {
          'location': `/v1/templates/${templateId}`,
        });

      client.createTemplate(templBody, contentType, isPublic)
        .then((res) => {
          expect(res.status).to.equal(201);
          expect(res.templateId).to.equal(templateId);
          done();
        });
    });
  });

  [undefined, 'false', false, 'False'].forEach((isPublic) => {
    it(`creates a new valid private (${isPublic}) template PUT`, function() {
      nockRequest
        .matchHeader('x-cimpress-template-public', 'false')
        .put(`/v1/templates/${templateName}`)
        .reply(201);

      return expect(client.putTemplate(templateName, templBody, contentType, isPublic)).to.eventually.be.fulfilled;
    });

    it(`creates a new valid private (${isPublic}) template POST`, function(done) {
      const templateId = 'mytemplateid';
      nockRequest
        .matchHeader('x-cimpress-template-public', 'false')
        .post(`/v1/templates`)
        .reply(201, templateId, {
          'location': `/v1/templates/${templateId}`,
        });

        client.createTemplate(templBody, contentType, isPublic)
        .then((res) => {
          expect(res.status).to.equal(201);
          expect(res.templateId).to.equal(templateId);
          done();
        });
    });
  });

  it('updates an existing template - body', function() {
    nockRequest.put(`/v1/templates/${templateName}`)
      .reply(200);

    return expect(client.putTemplate(templateName, templBody, contentType)).to.eventually.be.fulfilled;
  });

  ['mjml', '"mjml"', 'MJml'].forEach((pp) => {
    it(`updates an existing template - body / with post processors: ${pp}`, function() {
      nockRequest.put(`/v1/templates/${templateName}`)
        .reply(200);

      return expect(client.putTemplate(templateName, templBody, contentType + `; postProcessors=${pp}`)).to.eventually.be.fulfilled;
    });
  });

  ['xml', 'json', 'bub'].forEach((pp) => {
    it(`updates an existing template - body / with not supported post processors: ${pp}`, function() {
      nockRequest.put(`/v1/templates/${templateName}`)
        .reply(200);

      return expect(client.putTemplate(templateName, templBody, contentType + `; postProcessors=${pp}`)).to.eventually.be.rejected;
    });
  });

  it('fails to create a template with bad permissions PUT', function() {
    let noPermissionsTemplateId = 'no-permissions';
    nockRequest.put(`/v1/templates/${noPermissionsTemplateId}`)
      .reply(403);

    return expect(client.putTemplate(noPermissionsTemplateId, templBody, contentType)).to.eventually.be.rejected;
  });

  it('fails to create a template with bad permissions POST', function() {
    nockRequest.post(`/v1/templates`)
      .reply(403);

    return expect(client.createTemplate(templBody, contentType)).to.eventually.be.rejected;
  });

  it('deletes a template', function() {
    nockRequest.delete(`/v1/templates/${templateName}`)
      .reply(200);

    return expect(client.deleteTemplate(templateName)).to.eventually.be.fulfilled;
  });

  it('fails to delete a non-existant template', function() {
    nockRequest.delete(`/v1/templates/NON-EXISTENT-TEMPLATE`)
      .reply(404);

    return expect(client.deleteTemplate(templateName)).to.eventually.be.rejected;
  });

  it('fails to delete a template with bad permissions', function() {
    nockRequest.delete(`/v1/templates/${templateName}`)
      .reply(403);

    return expect(client.deleteTemplate(templateName)).to.eventually.be.rejected;
  });

  it('materializes a template', function() {
    let materializedBody = 'Hello Customer.';
    nockRequest.post(`/v1/templates/${templateName}/materializations`)
      .reply(200, materializedBody, {
        'content-type': contentType,
      });

    return client.materialize(templateName).then((tpl) => expect(tpl).to.equal(materializedBody));
  });

  it('materializes a template to a materialization id', function() {
    let matId = 'a162538a-bcf2-4b43-9d53-12cb0dd04b7b';
    let propertyBag = {};
    nockRequest.post(`/v1/templates/${templateName}/materializations`)
      .reply(200, matId, {
        'location': `/v1/materializations/${matId}`,
      });

    return client.materialize(templateName, propertyBag, true).then((tpl) => expect(tpl).to.equal(matId));
  });

  it('materializes a template based on content', function() {
    let materializedTemplate = 'data data data';
    nockRequest.post(`/v1/materializations`)
      .reply(200, materializedTemplate);

    let propertyBag = {key: 'value'};
    let template = {
      contentType: 'text/handlebars',
      content: materializedTemplate,
    };

    return client.materializeDirect(template, propertyBag, false).then((tpl) => expect(tpl).to.deep.equal({
      result: materializedTemplate,
      status: 200,
    }));
  });

  it('fetches a template that was previously materialized', function() {
    let materializedBody = 'Hello Customer.';
    let materializationId = 'test_mat_id';
    nockRequest.get(`/v1/materializations/${materializationId}`)
      .reply(200, materializedBody, {
        'content-type': contentType,
      });

    return client.getMaterialization(materializationId).then((tpl) => expect(tpl).to.equal(materializedBody));
  });

  it('fails to materialize a template with bad permissions', function() {
    nockRequest.post(`/v1/templates/${templateName}/materializations`)
      .reply(403);

    return expect(client.materialize(templateName)).to.eventually.be.rejected;
  });

  it('expands a propertyBag', function() {
    let propertyBag = {};
    let expanded = 'Hello Customer.';
    nockRequest.post('/v1/expand')
      .reply(200, expanded);

    return client.expand(propertyBag).then((expansion) => expect(expansion).to.equal(expanded));
  });

  it('is alive', function() {
    nockRequest.get('/livecheck').reply(200);
    return expect(client.livecheck()).to.eventually.equal(true);
  });

  it('handles 500', function() {
    nockRequest.get('/livecheck').reply(500);
    return expect(client.livecheck()).to.be.rejected;
  });

  it('has correct title', function() {
    nockRequest.get(`/v1/swagger.json`).reply(200, {
      info: {
        title: 'Stereotype',
      },
    });

    return client.getSwagger().then((swagger) => expect(swagger.info.title).to.equal('Stereotype'));
  });

  it('handles 500', function() {
    nockRequest.get(`/v1/swagger.json`).reply(500);
    return expect(client.getSwagger()).to.be.rejected;
  });
});
