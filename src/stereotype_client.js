'use-strict';

var request = require('superagent');

const conf = require('./conf');

class StereotypeClient {

  /**
   * Instantiates a StereotypeClient, ready to work with templates.
   *
   * @accessToken Auth0 authentication token
   * @idFulfiller The id of the fulfiller you would like to access
   */
  constructor(accessToken, idFulfiller) {
    this.accessToken = accessToken;
    this.fulfillerId = idFulfiller;
  }

  /**
   * A simple middleware layer that inserts permission headers needed for write operations.
   */
  _mwCimpressHeaders() {
    let self = this;
    return function() {
      let req = arguments[0];
      req.set('x-cimpress-read-permission', `fulfillers:${self.fulfillerId}:create`);
      req.set('x-cimpress-write-permission', `fulfillers:${self.fulfillerId}:create`);
      return req;
    };
  }

  /**
   * Returns a promise with a JSON object with two fields:
   * - templateType: text/dust, text/mustache, text/handlebars, etc.
   * - templateBody: the template itself
   */
  getTemplate(idTemplate) {
    return request
      .get(conf.TEMPLATES_URL + idTemplate)
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
   * Create or update a template. When bodyTemplate is null only the permissions are updated.
   *
   * @idTemplate The name of the template we want to create or update.
   * @bodyTemplate The body of the template.
   * @contentType The content type of the template, e.g. text/handlebars. Required when bodyTemplate is passed.
   * @xReadPermission Set a custom read permission. Optional.
   * @xWritePermission Set a custom write permission. Optional.
   */
  putTemplate(idTemplate, bodyTemplate = null, contentType = null, xReadPermission = null, xWritePermission = null) {
    // Validate the body type, err via a Promise:
    if (bodyTemplate && Object.values(conf.BODY_TYPES).indexOf(contentType) === -1) {
      return new Promise((resolve, reject) => {
        reject(new Error('COntent type is required when passing a template body. Invalid body type: ' + contentType));
      });
    }

    let requestAction;
    if (bodyTemplate)
      // We have a body - we can use the PUT endpoint.
      requestAction = request.put(conf.TEMPLATES_URL + idTemplate);
    else
      // We only have permission - we can use the PATCH endpoint and avoid uploading the same body again.
      requestAction = request.patch(conf.TEMPLATES_URL + idTemplate);

    return requestAction
      .set('Authorization', 'Bearer ' + this.accessToken)
      .set('Content-Type', contentType)
      .use(this._mwCimpressHeaders())
      .send(bodyTemplate)
      .then(
        (res) => res.status,
        (err) => Promise.reject(new Error('Unable to create/update template: ' + err.message))
      );
  }

  /**
   * Returns the status of the service as a boolean (alive/dead) (via a promise).
   */
  livecheck() {
    return request
      .get(conf.BASE_URL + 'livecheck')
      .set('Authorization', 'Bearer ' + this.accessToken)
      .then(
        (res) => res && res.status == 200,
        (err) => Promise.reject(new Error('Unable to get livecheck data: ' + err.message))
      );
  }

  /**
   * Returns the swagger file of the service (via a promise).
   */
  getSwagger() {
    return request
      .get(conf.BASE_URL + conf.VERSION + '/swagger.json')
      .set('Authorization', 'Bearer ' + this.accessToken)
      .then(
        (res) => res.body,
        (err) => Promise.reject(new Error('Unable to get swagger: ' + err.message))
      );
  }
}

module.exports = StereotypeClient;
