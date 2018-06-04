'use-strict';

const request = require('superagent');

const conf = require('./conf');

const DEFAULT_NUM_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;

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
    this.curies = {};
  }

  /**
   * Provides a stub implementation of the X-Ray client. All used functions must be mocked here.
   */
  static _getDummyXray() {
    return {
      captureAsyncFunc: function(annot, callback) {
        let subsegment = {
          addAnnotation: function(annot, annotParam) {},
          close: function(err = null) {},
        };
        callback(subsegment);
      },
    };
  }

  static _isSupportedBodyType(bodyType) {
    for (let key in conf.BODY_TYPES) {
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

  setAcceptPreferenceHeader(headerValue) {
    this.acceptPreferenceHeader = String(headerValue);
  }

  setCurieHeader(headerValue) {
    this.curieHeader = String(headerValue);
  }

  /**
   * Specifies a curie for a given link relation.
   * If the curie header is set explicitly with setCurieHeader,
   * that value will overwrite curies set with this method.
   */
  setCurie(rel, replacement) {
    this.curies[rel] = replacement;
  }

  /**
   * Construct a curie header from the key-value pairs set with setCurie().
   */
  _constructCurieHeader() {
    return Object.keys(this.curies)
      .map((k) => k + conf.CURIE_SEPARATOR + this.curies[k])
      .join(',');
  }

  /**
   * Returns a list of JSON objects with the following fields:
   * - templateId: string
   * - canCopy: boolean
   * - canEdit: boolean
   *
   * @param {boolean} skipCache
   */
  listTemplates(skipCache = false) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.listTemplates', function(subsegment) {
        subsegment.addAnnotation('URL', conf.TEMPLATES_URL);
        subsegment.addAnnotation('REST Action', 'GET');

        request
          .get(conf.TEMPLATES_URL + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.body);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.close(err);
              reject(err);
            }
          );
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Returns a promise with a JSON object with two fields:
   * - templateType: text/dust, text/mustache, text/handlebars, etc.
   * - templateBody: the template itself
   *
   * Sometimes when creating a template and accessing it a very short time later,
   * it's possible to get a 404 'Template not found' because of caching along the way.
   * In order to avoid that you can use the `skipCache` parameter here.
   *
   * @param {string} idTemplate
   * @param {boolean} skipCache
   */
  getTemplate(idTemplate, skipCache = false) {
    if (!idTemplate) {
      return Promise.reject({
        status: 404,
        message: `Template not found! Empty template ID provided.`,
      });
    }
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getTemplate', function(subsegment) {
        subsegment.addAnnotation('URL', conf.TEMPLATES_URL);
        subsegment.addAnnotation('REST Action', 'GET');
        subsegment.addAnnotation('Template', idTemplate);

        request
          .get(conf.TEMPLATES_URL + idTemplate + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve({
                templateType: res.type,
                templateBody: res.text,
                isPublic: !!res.headers['x-cimpress-template-public'],
              });
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.close(err);
              reject(err);
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
  putTemplate(idTemplate, bodyTemplate = null, contentType = null, isPublic = false, skipCache = false) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.putTemplate', function(subsegment) {
        subsegment.addAnnotation('URL', conf.TEMPLATES_URL);
        subsegment.addAnnotation('RESTAction', 'PUT');
        subsegment.addAnnotation('Template', idTemplate);

        // Validate the body type, err via a Promise:
        if (!StereotypeClient._isSupportedBodyType(contentType)) {
          let err = new Error('Invalid content type: ' + contentType);
          subsegment.close(err);
          reject(err);
        }

        // Replace `null` or `undefined` with an empty string body.
        bodyTemplate = bodyTemplate || '';

        request.put(conf.TEMPLATES_URL + idTemplate + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', contentType)
          .set('x-cimpress-template-public', !!isPublic)
          .send(bodyTemplate) // the body is empty anyway, no need for superfluous conditionals
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.status);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.close(err);
              reject(err);
            }
          );
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Deletes a template.
   *
   * @param {string} idTemplate The name of the template we want to delete.
   */
  deleteTemplate(idTemplate, skipCache = false) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.deleteTemplate', function(subsegment) {
        subsegment.addAnnotation('URL', conf.TEMPLATES_URL);
        subsegment.addAnnotation('RESTAction', 'DELETE');
        subsegment.addAnnotation('Template', idTemplate);

        request.delete(conf.TEMPLATES_URL + idTemplate + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.status);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.close(err);
              reject(err);
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
  materialize(idTemplate, propertyBag, timeout = DEFAULT_TIMEOUT, getMaterializationId = false, skipCache = false) {
    return this.materializeSync(idTemplate, propertyBag, timeout, getMaterializationId, skipCache)
      .then((resultStruct) => resultStruct.result);
  }

  /**
   * Returns a promise that resolves to an object with two fields - `status` and `result`.
   * The `result` field holds the materialization, while the `status` field is expected to always be `201`.
   * The main purpose of the `status` field is uniformity with the `materializeAsync` method.
   *
   * @param {string} idTemplate
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   * @param {number} timeout Timeout value (ms) of how long the service should wait for a single link
   *    to be resolved before timing out. Default is 5000ms
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materializeSync(idTemplate, propertyBag, timeout = DEFAULT_TIMEOUT, getMaterializationId = false, skipCache = false) {
    return this._materialize(idTemplate, propertyBag, timeout, getMaterializationId, false, skipCache);
  }

  /**
   * Returns a promise that resolves to an object with two fields - `status` and `result`.
   * The `result` field holds either the location where the materialization will be available
   * or the materialization itself. The `status` field is expected to always be either `202`
   * in case the preference for async execution was respected or `201` in case the server
   * decided to ignore the preference and execute the request synchronously.
   *
   * @param {string} idTemplate
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   * @param {number} timeout Timeout value (ms) of how long the service should wait for a single link
   *    to be resolved before timing out. Default is 5000ms
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materializeAsync(idTemplate, propertyBag, timeout = DEFAULT_TIMEOUT, getMaterializationId = false, skipCache = false) {
    return this._materialize(idTemplate, propertyBag, timeout, getMaterializationId, true, skipCache);
  }

  _materialize(idTemplate, propertyBag, timeout = DEFAULT_TIMEOUT, getMaterializationId = false, preferAsync = false, skipCache = false) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.materialize', function(subsegment) {
        subsegment.addAnnotation('URL', conf.TEMPLATES_URL + idTemplate + conf.MATERIALIZATIONS);
        subsegment.addAnnotation('RESTAction', 'POST');
        subsegment.addAnnotation('Template', idTemplate);

        let req = request
          .post(conf.TEMPLATES_URL + idTemplate + conf.MATERIALIZATIONS + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', 'application/json')
          .set('x-cimpress-link-timeout', Number(timeout) > 0 ? Number(timeout) : DEFAULT_TIMEOUT);

        if (self.blacklistHeader) {
          req.set('x-cimpress-rel-blacklist', self.blacklistHeader);
        }
        if (self.whitelistHeader) {
          req.set('x-cimpress-rel-whitelist', self.whitelistHeader);
        }
        if (self.acceptPreferenceHeader) {
          req.set('x-cimpress-accept-preference', self.acceptPreferenceHeader);
        }
        if (self.curieHeader) {
          req.set('x-cimpress-rel-curies', self.curieHeader);
        } else if (Object.keys(self.curies).length) {
          req.set('x-cimpress-rel-curies', self._constructCurieHeader());
        }
        if (preferAsync) {
          req.set('prefer', 'respond-async');
        }

        req.send(propertyBag)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              if (getMaterializationId && res.headers && res.headers.location) {
                // the `+ 1` is for the leading `/`:
                let preStringLen = conf.VERSION.length + conf.MATERIALIZATIONS.length + 1;
                resolve({
                  status: res.status,
                  result: res.headers.location.substring(preStringLen),
                });
              } else if (res.status == 202) { // async
                resolve({
                  status: res.status,
                  result: res.headers.location,
                });
              } else { // sync
                resolve({
                  status: res.status,
                  result: res.text,
                });
              }
            })
          .catch(
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.close(err);
              reject(err);
            }); // Closes request chain
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Get an existing template materialization.
   *
   * @param {string} idMaterialization The id of the materialization, as returned by `materialize`.
   */
  getMaterialization(idMaterialization, skipCache = false) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getMaterialization', function(subsegment) {
        subsegment.addAnnotation('URL', conf.MATERIALIZATIONS_URL);
        subsegment.addAnnotation('RESTAction', 'GET');
        subsegment.addAnnotation('TemplateMaterialization', idMaterialization);

        request
          .get(conf.MATERIALIZATIONS_URL + idMaterialization + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.text);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.close(err);
              reject(err);
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
   * @param {number} numberOfRetries Number of times to try again if the expansion times out
   */
  expand(propertyBag, timeout = DEFAULT_TIMEOUT, numberOfRetries = DEFAULT_NUM_RETRIES, skipCache = false) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.expand', function(subsegment) {
        subsegment.addAnnotation('URL', conf.EXPAND_URL);
        subsegment.addAnnotation('RESTAction', 'POST');

        let req = request
          .post(conf.EXPAND_URL + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', 'application/json')
          .set('x-cimpress-link-timeout', Number(timeout) > 0 ? Number(timeout) : DEFAULT_TIMEOUT);

        if (self.blacklistHeader) {
          req.set('x-cimpress-rel-blacklist', self.blacklistHeader);
        }
        if (self.whitelistHeader) {
          req.set('x-cimpress-rel-whitelist', self.whitelistHeader);
        }
        if (self.acceptPreferenceHeader) {
          req.set('x-cimpress-accept-preference', self.acceptPreferenceHeader);
        }
        if (self.curieHeader) {
          req.set('x-cimpress-rel-curies', self.curieHeader);
        } else if (Object.keys(self.curies).length) {
          req.set('x-cimpress-rel-curies', self._constructCurieHeader());
        }

        req.send(propertyBag)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.text);
            },
            (err) => {
              let isTimeoutError = (err) => err.response.body.findIndex((e) => e.expandedMessage.includes('ESOCKETTIMEDOUT')) !== -1;

              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.addAnnotation('UnableToExpandPropertyBag: ' + err.message);

              if (err.status === 400 && numberOfRetries > 0 && isTimeoutError(err)) {
                subsegment.addAnnotation('WillRetry: true');
                subsegment.close(err);
                resolve(expand(propertyBag, timeout, numberOfRetries - 1));
              } else {
                subsegment.addAnnotation('WillRetry: false');
                subsegment.close(err);
                reject(err);
              }
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
  livecheck(skipCache = false) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.livecheck', function(subsegment) {
        subsegment.addAnnotation('URL', conf.BASE_URL + 'livecheck');
        subsegment.addAnnotation('RESTAction', 'GET');

        request
          .get(conf.BASE_URL + 'livecheck' + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res && res.status == 200);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.close(err);
              reject(err);
            }
          );
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Returns the swagger file of the service (via a promise).
   */
  getSwagger(skipCache = false) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getSwagger', function(subsegment) {
        subsegment.addAnnotation('URL', conf.BASE_URL + conf.VERSION + '/swagger.json');
        subsegment.addAnnotation('RESTAction', 'GET');

        request
          .get(conf.BASE_URL + conf.VERSION + '/swagger.json' + (skipCache ? `?skip_cache=${Date.now()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.body);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status);
              subsegment.close(err);
              reject(err);
            }
          );
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }
}

module.exports = StereotypeClient;
