'use-strict';

var request = require('superagent');

const conf = require('./conf');

class StereotypeClient {

  /**
   * Instantiates a StereotypeClient, ready to work with templates.
   *
   * @param {string} accessToken Auth0 authentication token
   * @param {string} idFulfiller Deprecated - this field is not used anymore but it's left as optional for backwards compatibility.
   */
  constructor(accessToken, idFulfiller = null) {
    this.accessToken = accessToken;
  }

  /**
   * A simple middleware layer that inserts permission headers needed for write operations.
   */
  _mwCimpressHeaders(templateId, read, write) {
    let self = this;
    return function() {
      let req = arguments[0];
      req.set('x-cimpress-read-permission', read ? read : `stereotype-templates:${templateId}:read:templates`);
      req.set('x-cimpress-write-permission', write ? write : `stereotype-templates:${templateId}:create:templates`);
      return req;
    };
  }

  _isValidBodyType(bodyType) {
    for (var key in conf.BODY_TYPES) {
      if (conf.BODY_TYPES[key] === bodyType) return true;
    }
    return false;
  }

  /**
   * Returns a promise with a JSON object with two fields:
   * - templateType: text/dust, text/mustache, text/handlebars, etc.
   * - templateBody: the template itself
   *
   * @param {string} idTemplate
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
   * @param {string} idTemplate The name of the template we want to create or update.
   * @param {string} bodyTemplate The body of the template.
   * @param {string} contentType The content type of the template, e.g. text/handlebars. Required
   *    when bodyTemplate is passed.
   * @param {string} xReadPermission Set a custom read permission. Optional.
   * @param {string} xWritePermission Set a custom write permission. Optional.
   */
  putTemplate(idTemplate, bodyTemplate = null, contentType = null, xReadPermission = null, xWritePermission = null) {
    // Validate the body type, err via a Promise:
    if (bodyTemplate && !this._isValidBodyType(contentType)) {
      return new Promise((resolve, reject) => {
        reject(new Error('Content type is required when passing a template body. Invalid body type: ' + contentType));
      });
    }

    let requestAction;
    if (bodyTemplate) {
      // We have a body - we can use the PUT endpoint.
      requestAction = request.put(conf.TEMPLATES_URL + idTemplate);
    } else {
      // We only have permission - we can use the PATCH endpoint and avoid uploading the body again.
      requestAction = request.patch(conf.TEMPLATES_URL + idTemplate);
    }

    return requestAction
      .set('Authorization', 'Bearer ' + this.accessToken)
      .set('Content-Type', contentType)
      .use(this._mwCimpressHeaders(idTemplate, xReadPermission, xWritePermission))
      .send(bodyTemplate)
      .then(
        (res) => res.status,
        (err) => Promise.reject(new Error('Unable to create/update template: ' + err.message))
      );
  }

  /**
   * Creates a template materialization by populating a template with data.
   *
   * @param {string} idTemplate
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   * @param {number} timeout Timeout value (ms) of how long the service should wait for a single link
   *    to be resolved before timing out. Default is 5000ms
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materialize(idTemplate, propertyBag, timeout = 5000, getMaterializationId = false) {
    return request
      .post(conf.TEMPLATES_URL + idTemplate + conf.MATERIALIZATIONS)
      .set('Authorization', 'Bearer ' + this.accessToken)
      .set('Content-Type', 'application/json')
      .set('x-cimpress-link-timeout', Number(timeout) > 0 ? Number(timeout) : 5000)
      .send(propertyBag)
      .then(
        (res) => {
          if (getMaterializationId) {
            // the `+ 1` is for the leading `/`:
            let preStringLen = conf.VERSION.length + conf.MATERIALIZATIONS.length + 1;
            return res.headers.location.substring(preStringLen);
          } else {
            return res.text;
          }
        },
        (err) => Promise.reject(new Error('Unable to materialize template: ' + err.message))
      );
  }

  /**
   * Get an existing template materialization.
   *
   * @param {string} idMaterialization The id of the materialization, as returned by `materialize`.
   */
  getMaterialization(idMaterialization) {
    return request
      .get(conf.MATERIALIZATIONS_URL + idMaterialization)
      .set('Authorization', 'Bearer ' + this.accessToken)
      .then(
        (res) => (res.text),
        (err) => Promise.reject(new Error('Unable to get materialization: ' + err.message))
      );
  }

  /**
   * Returns the status of the service as a boolean (alive/dead) (via a promise).
   *
   * @returns boolean
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
