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

  static _isSupportedBodyType(bodyType) {
    for (var key in conf.BODY_TYPES) {
      if (conf.BODY_TYPES[key] === bodyType) return true;
    }
    return false;
  }

  setBlacklistHeader(headerValue) {
    this.blacklistHeader = String(headerValue);
  }

  setWhitelistHeader(headerValue) {
    this.whitelistHeader = String(headerValue);
  }

  /**
   * Returns a promise with a JSON object with two fields:
   * - templateType: text/dust, text/mustache, text/handlebars, etc.
   * - templateBody: the template itself
   *
   * @param {string} idTemplate
   */
  getTemplate(idTemplate) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getTemplate', function(subsegment) {
        subsegment.addAnnotation('URL', conf.TEMPLATES_URL);
        subsegment.addAnnotation('REST Action', 'GET');
        subsegment.addAnnotation('Template', idTemplate);

        request
          .get(conf.TEMPLATES_URL + idTemplate)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('Response Code', res.status);
              subsegment.close();
              resolve({
                templateType: res.type,
                templateBody: res.text,
              });
            },
            (err) => {
              subsegment.addAnnotation('Response Code', err.status);
              subsegment.addAnnotation('Error Message', 'Unable to get template: ' + err.message);
              subsegment.close(err);
              reject(new Error('Unable to get template: ' + err.message));
            }
          );

      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
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
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.putTemplate', function(subsegment) {
        subsegment.addAnnotation('URL', conf.TEMPLATES_URL);
        subsegment.addAnnotation('REST Action', 'PUT');
        subsegment.addAnnotation('Template', idTemplate);

        // Validate the body type, err via a Promise:
        if (!StereotypeClient._isSupportedBodyType(contentType)) {
          let err = new Error('Invalid content type: ' + contentType);
          subsegment.addAnnotation('Error Message', 'Invalid content type: ' + contentType);
          subsegment.close(err);
          reject(err);
        }

        // Replace `null` or `undefined` with an empty string body.
        bodyTemplate = bodyTemplate || '';

        request.put(conf.TEMPLATES_URL + idTemplate)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', contentType)
          .send(bodyTemplate) // the body is empty anyway, no need for superfluous conditionals
          .then(
            (res) => {
              subsegment.addAnnotation('Response Code', res.status);
              subsegment.close();
              resolve(res.status);
            },
            (err) => {
              subsegment.addAnnotation('Response Code', err.status);
              subsegment.addAnnotation('Error Message', 'Unable to create/update template: ' + err.message);
              subsegment.close(err);
              reject(new Error('Unable to create/update template: ' + err.message));
            }
          );

      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
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
      self.xray.captureAsyncFunc('Stereotype.materialize', function(subsegment) {
        subsegment.addAnnotation('URL', conf.TEMPLATES_URL + idTemplate + conf.MATERIALIZATIONS);
        subsegment.addAnnotation('REST Action', 'POST');
        subsegment.addAnnotation('Template', idTemplate);

        let req = request
          .post(conf.TEMPLATES_URL + idTemplate + conf.MATERIALIZATIONS)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', 'application/json')
          .set('x-cimpress-link-timeout', Number(timeout) > 0 ? Number(timeout) : 5000);

        if (self.blacklistHeader)
          req.set('x-cimpress-rel-blacklist', self.blacklistHeader);
        if (self.whitelistHeader)
          req.set('x-cimpress-rel-whitelist', self.whitelistHeader);

        req.send(propertyBag)
          .then(
            (res) => {
              subsegment.addAnnotation('Response Code', res.status);
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
              subsegment.addAnnotation('Response Code', err.status);
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
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getMaterialization', function(subsegment) {
        subsegment.addAnnotation('URL', conf.MATERIALIZATIONS_URL);
        subsegment.addAnnotation('REST Action', 'GET');
        subsegment.addAnnotation('Template Materialization', idMaterialization);

        request
          .get(conf.MATERIALIZATIONS_URL + idMaterialization)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('Response Code', res.status);
              subsegment.close();
              resolve(res.text);
            },
            (err) => {
              subsegment.addAnnotation('Response Code', err.status);
              subsegment.addAnnotation('Error Message', 'Unable to get materialization: ' + err.message);
              subsegment.close(err);
              reject(new Error('Unable to get materialization: ' + err.message));
            }
          );

      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Expands the given propertyBag, so the client can see how all the fields would look right before
   * they are populated into the target template.
   *
   * @param {object} propertyBag A JSON object that contains the data to be populated in a template.
   * @param {number} timeout Timeout value (ms) of how long the service should wait for a single link
   *    to be resolved before timing out. Default is 5000ms
   */
  expand(propertyBag, timeout = 5000) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.expand', function(subsegment) {
        subsegment.addAnnotation('URL', conf.EXPAND_URL);
        subsegment.addAnnotation('REST Action', 'POST');

        let req = request
          .post(conf.EXPAND_URL)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', 'application/json')
          .set('x-cimpress-link-timeout', Number(timeout) > 0 ? Number(timeout) : 5000);

        if (self.blacklistHeader)
          req.set('x-cimpress-rel-blacklist', self.blacklistHeader);
        if (self.whitelistHeader)
          req.set('x-cimpress-rel-whitelist', self.whitelistHeader);

        req.send(propertyBag)
          .then(
            (res) => {
              subsegment.addAnnotation('Response Code', res.status);
              subsegment.close();
              resolve(res.text);
            },
            (err) => {
              subsegment.addAnnotation('Response Code', err.status);
              subsegment.addAnnotation('Unable to expand propertyBag: ' + err.message);
              subsegment.close(err);
              reject(new Error('Unable to expand propertyBag: ' + err.message));
            }
          ); // Closes request chain

      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Returns the status of the service as a boolean (alive/dead) (via a promise).
   *
   * @returns boolean
   */
  livecheck() {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.livecheck', function(subsegment) {
        subsegment.addAnnotation('URL', conf.BASE_URL + 'livecheck');
        subsegment.addAnnotation('REST Action', 'GET');

        request
          .get(conf.BASE_URL + 'livecheck')
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('Response Code', res.status);
              subsegment.close();
              resolve(res && res.status == 200);
            },
            (err) => {
              subsegment.addAnnotation('Response Code', err.status);
              subsegment.addAnnotation('Error Message', 'Unable to get livecheck data: ' + err.message);
              subsegment.close(err);
              reject(new Error('Unable to get livecheck data: ' + err.message));
            }
          );

      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Returns the swagger file of the service (via a promise).
   */
  getSwagger() {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getSwagger', function(subsegment) {
        subsegment.addAnnotation('URL', conf.BASE_URL + conf.VERSION + '/swagger.json');
        subsegment.addAnnotation('REST Action', 'GET');

        request
          .get(conf.BASE_URL + conf.VERSION + '/swagger.json')
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('Response Code', res.status);
              subsegment.close();
              resolve(res.body);
            },
            (err) => {
              subsegment.addAnnotation('Response Code', err.status);
              subsegment.addAnnotation('Error Message', ('Unable to get swagger: ' + err.message));
              subsegment.close(err);
              reject(new Error('Unable to get swagger: ' + err.message));
            }
          );

      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }
}

module.exports = StereotypeClient;
