'use strict';

const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const StereotypeClient = require('../src/stereotype_client');

describe('Stereotype client', function() {

  this.timeout(10000);

  let token = 'demo_Auth0_v2_token';
  let client = new StereotypeClient(token, '*');

  // NOTE These are just examples, as they make network calls. To be replaced.
  // describe("livecheck", function() {
  //   it('is alive', function() {
  //     let statusPromise = client.livecheck();
  //     return expect(statusPromise).to.eventually.equal(true);
  //   });
  // });
  //
  // describe("get Swagger", function() {
  //   it('has correct title', function() {
  //     let swaggerPromise = client.getSwagger();
  //     return swaggerPromise.then((swagger) => expect(swagger.info.title).to.equal('Stereotype'));
  //   });
  // });

});
