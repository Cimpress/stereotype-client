'use-strict';

var request = require('superagent');

const BASE_URL = 'https://stereotype.trdlnk.cimpress.io/';
const VERSION = 'v1';
const TEMPLATES_URL = BASE_URL + VERSION + '/templates/';
const MATERIALIZATIONS_URL = BASE_URL + VERSION + '/materializations/';
const MATERIALIZATIONS = 'materializations/';

const BODY_TYPES = {
  dust: 'text/dust',
  mustache: 'text/mustache',
  handlebars: 'text/handlebars'
};

class StereotypeClient {

  /**
   * Instantiates a StereotypeClient, ready to work with templates.
   *
   * @accessToken Auth0 authentication token
   * @idFulfiller The id of the fulfiller we would like to access
   */
  constructor(accessToken, idFulfiller) {
    this.accessToken = accessToken;
    this.fulfillerId = idFulfiller;
  }

  _mwCimpressHeaders() {
    let self = this;
    return function() {
      let req = arguments[0];
      req.set('x-cimpress-read-permission', `fulfillers:${self.fulfillerId}:create`);
      req.set('x-cimpress-write-permission', `fulfillers:${self.fulfillerId}:create`);
      return req;
    }
  }

  /**
   * Returns a JSON object with two fields:
   * - templateType: text/dust, text/mustache, text/handlebars, etc.
   * - templateBody: the template itself
   */
  getTemplate(idTemplate) {
    return request
      .get(TEMPLATES_URL + idTemplate)
      .set('Authorization', 'Bearer ' + this.accessToken)
      .then(
        (res) => ({
          templateType: res.type,
          templateBody: res.text,
        }),
        (err) => Promise.reject(new Error('Unable to get template: ' + err.message))
      );
  }

  /**
   * Create or update a template.
   *
   * @idTemplate The name of the template we want to create or update.
   * @bodyTemplate The body of the template.
   * @bodyType The content type of the template, e.g. text/handlebars
   */
  putTemplate(idTemplate, bodyTemplate, bodyType) {
    // Validate the body type:
    if (Object.values(BODY_TYPES).indexOf(bodyType) === -1) {
      throw new Error('Invalid body type: ' + bodyType);
    }

    return request.put(TEMPLATES_URL + idTemplate)
      .set('Authorization', 'Bearer ' + this.accessToken)
      .set('Content-Type', bodyType)
      .use(this._mwCimpressHeaders())
      .send(bodyTemplate)
      .then(
        (res) => res.status,
        (err) => Promise.reject(new Error('Unable to create/update template: ' + err.message)) // Promise.reject(err)
      );
  }

  /**
   * Returns a promise that returns a boolean result or throws an error.
   */
  livecheck() {
    return request
      .get(BASE_URL + 'livecheck')
      .set('Authorization', 'Bearer ' + this.accessToken)
      .then(
        (res) => res && res.status == 200,
        (err) => Promise.reject(new Error('Unable to get livecheck data: ' + err.message))
      );
  }

  /**
   * Returns the swagger file of the service.
   */
  getSwagger() {
    return request
      .get(BASE_URL + VERSION + '/swagger.json')
      .set('Authorization', 'Bearer ' + this.accessToken)
      .then(
        (res) => res.body,
        (err) => Promise.reject(new Error('Unable to get swagger: ' + err.message))
      );
  }
}

module.exports = StereotypeClient;

