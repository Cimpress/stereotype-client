'use-strict';

const request = require('superagent');

const conf = require('./conf');

class StereotypeClient {

  /**
   * Instantiates a StereotypeClient, ready to work with templates.
   *
   * @param {string} accessToken Auth0 authentication token
   * @param {string} idFulfiller Deprecated - this field is not used anymore but it's left as optional for backwards compatibility.
   * @param {string} xray An instance of AWS X-Ray (npm package aws-xray-sdk-core)
   */
  constructor(accessToken, idFulfiller = null, xray = null) {
    this.accessToken = String(accessToken);
    // Strip any token prefix, e.g. 'Bearer '. If no prefix is found this code won't have any effect.
    this.accessToken = this.accessToken.substring(this.accessToken.indexOf(' ') + 1);

    this.xray = xray || StereotypeClient._getDummyXray();
  }

  /**
   * Provides a stub implementation of the X-Ray client. All used functions must be mocked here.
   */
  static _getDummyXray() {
    return {
      captureAsyncFunc: function(annot, callback) {
        let subsegment = {
          addAnnotation: function(annot, annotParam) {},
          close: function(err = null) {}
        };
        callback(subsegment);
      }
    };
  }

  /**
   * A simple middleware layer that inserts permission headers needed for write operations.
   */
  static _mwCimpressHeaders(templateId) {
    return function() {
      let req = arguments[0];
      req.set('x-cimpress-read-permission', `stereotype-templates:${templateId}:read:templates`);
      req.set('x-cimpress-write-permission', `stereotype-templates:${templateId}:create:templates`);
      return req;
    };
  }

  static _isSupportedBodyType(bodyType) {
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
   */
  putTemplate(idTemplate, bodyTemplate = null, contentType = null) {
    // Validate the body type, err via a Promise:
    if (!StereotypeClient._isSupportedBodyType(contentType)) {
      return new Promise((resolve, reject) => {
        reject(new Error('Invalid content type: ' + contentType));
      });
    }

    let requestAction;
    if (bodyTemplate) {
      // We have a body - we should use the PUT endpoint.
      requestAction = request.put(conf.TEMPLATES_URL + idTemplate);
    } else {
      // We only have permissions - we can use the PATCH endpoint and avoid uploading the body again.
      requestAction = request.patch(conf.TEMPLATES_URL + idTemplate);
      // make sure we send an empty body and not `undefined` or `null`:
      bodyTemplate = '';
    }

    return requestAction
      .set('Authorization', 'Bearer ' + this.accessToken)
      .set('Content-Type', contentType)
      .use(StereotypeClient._mwCimpressHeaders(idTemplate))
      .send(bodyTemplate) // the body is empty anyway, no need for superfluous conditionals
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
    let self = this;

    return new Promise((resolve, reject) => {

      self.xray.captureAsyncFunc('Stereotype.getTemplateMaterialization', function(subsegment) {
        subsegment.addAnnotation('StereotypeTemplate', idTemplate);

        request
          .post(conf.TEMPLATES_URL + idTemplate + conf.MATERIALIZATIONS)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', 'application/json')
          .set('x-cimpress-link-timeout', Number(timeout) > 0 ? Number(timeout) : 5000)
          .send(propertyBag)
          .then(
            (res) => {
              subsegment.close();
              if (getMaterializationId) {
                // the `+ 1` is for the leading `/`:
                let preStringLen = conf.VERSION.length + conf.MATERIALIZATIONS.length + 1;
                resolve(res.headers.location.substring(preStringLen));
              } else {
                resolve(res.text);
              }
            },
            (err) => {
              subsegment.close(err);
              reject(new Error('Unable to materialize template: ' + err.message));
            }
          ); // Closes request chain

      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
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
