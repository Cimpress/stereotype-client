'use strict';

const sinon = require("sinon");
const nock = require('nock');
const chai = require('chai');
const expect = chai.expect;
const StereotypeClient = require("../src/stereotype_client");

describe("Stereotype client", function() {

  this.timeout(10000);

  let token = '';

  let client = new StereotypeClient(token, '*');

  describe("gets Swagger", function() {

    it("fulfillerId", function() {
      client.getSwagger().then(
        (swagger) => expect(swagger).to.have.property("title", "Stereotype")
      );
    });

  });

});
