'use-strict';

const request = require('superagent');
const Base64 = require('js-base64').Base64;
const contentTypeParser = require('content-type');
const qs = require('qs');

const defaultConf = {
  baseUrl: 'https://stereotype.trdlnk.cimpress.io',
  timeout: 5000, // Wait 5 seconds for the server to start sending,
  deadline: 60000, // but allow 1 minute for the file to finish loading.
  numRetries: 3,
};

const supportedContentTypes = {
  dust: ['text/dust'],
  mustache: ['text/mustache'],
  handlebars: ['text/handlebars', 'text/x-handlebars-template'],
  edie: ['application/vnd.cimpress.edie+json', 'application/vnd.cimpress.ediecsv+json'],
};

const supportedPostProcessors = [
  'mjml',
  'xlsx',
];

const CURIE_SEPARATOR = ';';

class StereotypeClient {
  /**
   * Instantiates a StereotypeClient, ready to work with templates.
   *
   * @param {string} accessToken Auth0 authentication token
   * @param {string} xray An instance of AWS X-Ray (npm package aws-xray-sdk-core)
   */
  constructor(accessToken, options = {}) {
    this.accessToken = String(accessToken);

    // Strip any token prefix, e.g. 'Bearer '. If no prefix is found this code won't have any effect.
    this.accessToken = this.accessToken.substring(this.accessToken.indexOf(' ') + 1);

    // Options
    this.baseUrl = options.baseUrl || defaultConf.baseUrl;
    if (this.baseUrl[this.baseUrl.length - 1] === '/') {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }

    this.xray = options.xray || StereotypeClient._getDummyXray();
    this.timeout = options.timeout || defaultConf.timeout;
    this.deadline = options.deadline || defaultConf.deadline;
    this.numRetries = options.numRetries || defaultConf.numRetries;
    this.isBinaryResponse = options.isBinaryResponse || false;

    this.curies = {};
  }

  /**
   * Provides a stub implementation of the X-Ray client. All used functions must be mocked here.
   */
  static _getDummyXray() {
    return {
      captureAsyncFunc: function(annot, callback) {
        let subsegment = {
          addAnnotation: function(annot, annotParam) {
          },
          close: function(err = null) {
          },
        };
        callback(subsegment);
      },
    };
  }

  static _isSupportedContentType(contentType) {
    const parsedContentType = contentTypeParser.parse(contentType);
    let validContentType = false;
    for (let key in supportedContentTypes) {
      if (supportedContentTypes[key].includes(parsedContentType.type)) {
        validContentType = true;
      }
    }

    const postProcessors = ((parsedContentType.parameters || {}).postprocessors || '')
      .split(',')
      .map((pp) => pp.toLowerCase().trim())
      .filter((pp) => pp !== '');

    let validPostProcessor = true;
    postProcessors.forEach( (pp) => {
      if (!supportedPostProcessors.includes(pp)) {
        validPostProcessor = false;
      }
    });

    return validContentType && validPostProcessor;
  }

  setBlacklistHeader(headerValue) {
    this.blacklistHeader = String(headerValue);
  }

  setWhitelistHeader(headerValue) {
    this.whitelistHeader = String(headerValue);
  }

  setAcceptHeader(headerValue) {
    this.acceptHeader = String(headerValue);
  }

  setAcceptPreferenceHeader(headerValue) {
    this.acceptPreferenceHeader = String(headerValue);
  }

  setCurieHeader(headerValue) {
    this.curieHeader = String(headerValue);
  }

  setMaximumCrawlDepthHeader(headerValue) {
    this.maximumCrawlDepthHeader = String(headerValue);
  }

  setCrawlerSoftErrors(headerValue) {
    this.crawlerSoftErrors = String(headerValue);
  }

  handleBinaryResponse(binary) {
    this.isBinaryResponse = Boolean(binary);
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
      .map((k) => k + CURIE_SEPARATOR + this.curies[k])
      .join(',');
  }

  /**
   * Returns a list of JSON objects with the following fields:
   * - templateId: string
   * - canCopy: boolean
   * - canEdit: boolean
   *
   * @param {boolean} skipCache
   * @param {boolean} includePublic
   */
  listTemplates(skipCache = false, includePublic = false) {
    let self = this;
    let templatesUrl = this._getUrl('/v1/templates');
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.listTemplates', function(subsegment) {
        subsegment.addAnnotation('URL', templatesUrl);
        subsegment.addAnnotation('REST Action', 'GET');

        let paramsObj = {'public': includePublic};
        if (skipCache) {
          paramsObj.skip_cache = Math.random();
        }
        let params = qs.stringify(paramsObj);
        request
          .get(templatesUrl + `?${params}`)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.body);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
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
   * @param {string} templateUrl
   * @param {boolean} skipCache
   */
  getTemplateById(templateId, skipCache = false, doNotAddBody = false) {
    const templateUrl = this._getUrl(`/v1/templates/${encodeURIComponent(templateId)}`);
    return this.getTemplate(templateUrl, skipCache, doNotAddBody);
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
   * @param {string} templateUrl
   * @param {boolean} skipCache
   */
  getTemplate(templateUrl, skipCache = false, doNotAddBody = false) {
    if (!templateUrl) {
      return Promise.reject({
        status: 404,
        message: `Template not found! Empty template ID provided.`,
      });
    }

    if (doNotAddBody) {
      return this._getTemplateInfo(templateUrl, skipCache);
    }

    return Promise.all([
      this._getTemplateInfo(templateUrl, skipCache),
      this._getTemplateBody(templateUrl, skipCache),
    ]).then((data) => Object.assign({}, data[0], {templateBody: Base64.encode(data[1])}));
  }

  _getTemplateBody(templateUrl, skipCache) {
    let self = this;
    let verifiedTemplateUrl = this._verifyTemplateUrl('/v1/templates', templateUrl);
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getTemplateBody', function(subsegment) {
        subsegment.addAnnotation('URL', verifiedTemplateUrl);
        subsegment.addAnnotation('REST Action', 'GET');
        request
          .get(verifiedTemplateUrl + (skipCache ? `?skip_cache=${Math.random()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.text);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
              subsegment.close(err);
              reject(err);
            }
          );
      });
    });
  }

  _getTemplateInfo(templateUrl, skipCache) {
    let self = this;
    let verifiedTemplateUrl = this._verifyTemplateUrl('/v1/templates', templateUrl);
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getTemplateBody', function(subsegment) {
        subsegment.addAnnotation('URL', verifiedTemplateUrl);
        subsegment.addAnnotation('REST Action', 'GET');

        request
          .get(verifiedTemplateUrl + (skipCache ? `?skip_cache=${Math.random()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Accept', 'application/json')
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.body);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
              subsegment.close(err);
              reject(err);
            }
          );
      });
    });
  }

  /**
   * Create or update a template. When bodyTemplate is null only the permissions are updated.
   *
   * @param {string} templateId The id of the template we want to create or update.
   * @param {string} bodyTemplate The body of the template.
   * @param {string} contentType The content type of the template, e.g. text/handlebars. Required
   *    when bodyTemplate is passed.
   * @param {bool} isPublic Shows whether to set the tempalte as public or not. Optional, defaults to false.
   * @param {bool} skipCache Shows whether to explicitly bypass caching by adding a random query param.
   *    Optional, defaults to false.
   */
  putTemplateById(templateId, bodyTemplate = null, contentType = null, isPublic = false, skipCache = false) {
    const templateUrl = this._getUrl(`/v1/templates/${encodeURIComponent(templateId)}`);
    return this.putTemplate(templateUrl, bodyTemplate, contentType, isPublic, skipCache);
  }

  /**
   * Create or update a template. When bodyTemplate is null only the permissions are updated.
   *
   * @param {string} templateUrl The name of the template we want to create or update.
   * @param {string} bodyTemplate The body of the template.
   * @param {string} contentType The content type of the template, e.g. text/handlebars. Required
   *    when bodyTemplate is passed.
   * @param {bool} isPublic Shows whether to set the tempalte as public or not. Optional, defaults to false.
   * @param {bool} skipCache Shows whether to explicitly bypass caching by adding a random query param.
   *    Optional, defaults to false.
   */
  putTemplate(templateUrl, bodyTemplate = null, contentType = null, isPublic = false, skipCache = false) {
    let verifiedTemplateUrl = this._verifyTemplateUrl('/v1/templates', templateUrl);
    return new Promise((resolve, reject) => {
      this.xray.captureAsyncFunc('Stereotype.putTemplate', (subsegment) => {
        subsegment.addAnnotation('URL', verifiedTemplateUrl);
        subsegment.addAnnotation('RESTAction', 'PUT');
        subsegment.addAnnotation('Template', templateUrl);

        this._createTemplate(verifiedTemplateUrl, 'PUT', bodyTemplate, contentType, isPublic)
          .then((res) => {
            subsegment.addAnnotation('ResponseCode', res.status);
            subsegment.close();
            resolve(res.body);
          })
          .catch((err) => {
            subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
            subsegment.close(err);
            reject(err);
          });
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  _createTemplate(templateURL, method, bodyTemplate = null, contentType = null, isPublic = false) {
    const isPublicFlag = isPublic && (isPublic.toString().toLowerCase() === 'true');

    if (!['POST', 'PUT'].includes(method)) {
      return Promise.reject(new Error('You should pass POST or PUT for the method parameter'));
    }

    if (!StereotypeClient._isSupportedContentType(contentType)) {
      return Promise.reject(new Error('Invalid content type: ' + contentType));
    }
    return request(method, templateURL)
      .set('Authorization', 'Bearer ' + this.accessToken)
      .set('Content-Type', contentType)
      .set('x-cimpress-template-public', isPublicFlag.toString())
      .set('Accept', 'application/json')
      .send(bodyTemplate || '');
  }

  /**
   * Create a template. When bodyTemplate is null only the permissions are updated.
   *
   * @param {string} bodyTemplate The body of the template.
   * @param {string} contentType The content type of the template, e.g. text/handlebars. Required
   *    when bodyTemplate is passed.
   * @param {bool} isPublic Shows whether to set the template as public or not. Optional, defaults to false.
   */
  createTemplate(bodyTemplate = null, contentType = null, isPublic = false) {
    const templatesUrl = this._getUrl('/v1/templates');
    return new Promise((resolve, reject) => {
      this.xray.captureAsyncFunc('Stereotype.postTemplate', (subsegment) => {
        subsegment.addAnnotation('URL', templatesUrl);
        subsegment.addAnnotation('RESTAction', 'POST');

        this._createTemplate(templatesUrl, 'POST', bodyTemplate, contentType, isPublic)
        .then((res) => {
          subsegment.addAnnotation('ResponseCode', res.status);
          subsegment.addAnnotation('TemplateLocation', res.headers.location);
          subsegment.close();
          resolve(res.body);
        })
        .catch((err) => {
          subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
          subsegment.close(err);
          reject(err);
        });
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Deletes a template.
   *
   * @param {string} templateUrl The name of the template we want to delete.
   */
  deleteTemplateById(templateId, skipCache = false) {
    const templateUrl = this._getUrl(`/v1/templates/${templateId}`);
    return this.deleteTemplate(templateUrl, skipCache);
  }
    /**
   * Deletes a template.
   *
   * @param {string} templateUrl The name of the template we want to delete.
   */
  deleteTemplate(templateUrl, skipCache = false) {
    let self = this;
    let verifiedTemplateUrl = this._verifyTemplateUrl('/v1/templates', templateUrl);
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.deleteTemplate', function(subsegment) {
        subsegment.addAnnotation('URL', verifiedTemplateUrl);
        subsegment.addAnnotation('RESTAction', 'DELETE');
        subsegment.addAnnotation('Template', templateUrl);

        request.delete(verifiedTemplateUrl + (skipCache ? `?skip_cache=${Math.random()}` : ''))
          .set('Authorization', 'Bearer ' + self.accessToken)
          .timeout({
            response: self.timeout,
            deadline: self.deadline,
          })
          .retry(self.numRetries)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.status);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
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
   * @param {string} templateUrl
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   *    to be resolved before timing out. Default is 5000ms
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materializeById(templateId, propertyBag, getMaterializationId = false, skipCache = false) {
    return this.materializeSyncById(templateId, propertyBag, getMaterializationId, skipCache)
      .then((resultStruct) => resultStruct.result);
  }

  /**
   * Creates a template materialization by populating a template with data.
   *
   * @param {string} templateUrl
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   *    to be resolved before timing out. Default is 5000ms
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materialize(templateUrl, propertyBag, getMaterializationId = false, skipCache = false) {
    return this.materializeSync(templateUrl, propertyBag, getMaterializationId, skipCache)
      .then((resultStruct) => resultStruct.result);
  }

  /**
   *
   * @param {object} template An object that contains template content and type. { contentType: x, content: y }
   *    contentType can be one of 'text/mustache', 'text/dust' or 'text/handlebars'
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materializeDirect(template, propertyBag, skipCache = false, preferAsync = false) {
    let self = this;
    let materializationsUrl = this._getUrl('/v1/materializations');
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.materialize', function(subsegment) {
        subsegment.addAnnotation('URL', materializationsUrl);
        subsegment.addAnnotation('RESTAction', 'POST');

        let req = request
          .post(materializationsUrl + (skipCache ? `?skip_cache=${Math.random()}` : ''))
          .timeout({
            response: self.timeout,
            deadline: self.deadline,
          })
          .retry(self.numRetries)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', 'application/json')
          .set('x-cimpress-link-timeout', self.timeout);

        if (self.blacklistHeader) {
          req.set('x-cimpress-rel-blacklist', self.blacklistHeader);
        }
        if (self.whitelistHeader) {
          req.set('x-cimpress-rel-whitelist', self.whitelistHeader);
        }
        if (self.acceptHeader) {
          req.set('accept', self.acceptHeader);
        }
        if (self.acceptPreferenceHeader) {
          req.set('x-cimpress-accept-preference', self.acceptPreferenceHeader);
        }
        if (self.curieHeader) {
          req.set('x-cimpress-rel-curies', self.curieHeader);
        } else if (Object.keys(self.curies).length) {
          req.set('x-cimpress-rel-curies', self._constructCurieHeader());
        }
        if (self.maximumCrawlDepthHeader) {
          req.set('x-cimpress-max-depth', self.maximumCrawlDepthHeader);
        }
        if (self.crawlerSoftErrors) {
          req.set('x-cimpress-crawler-soft-errors', self.crawlerSoftErrors);
        }
        if (preferAsync) {
          req.set('prefer', 'respond-async');
        }

        req.send({
          template: {
            body: Base64.encode(template.content),
            contentType: template.contentType,
          },
          templatePayload: propertyBag,
        })
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve({
                status: res.status,
                result: res.text,
              });
            })
          .catch(
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
              subsegment.close(err);
              reject(err);
            }); // Closes request chain
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }

  /**
   * Returns a promise that resolves to an object with two fields - `status` and `result`.
   * The `result` field holds the materialization, while the `status` field is expected to always be `201`.
   * The main purpose of the `status` field is uniformity with the `materializeAsync` method.
   *
   * @param {string} templateUrl
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materializeSyncById(templateId, propertyBag, getMaterializationId = false, skipCache = false) {
    const templateUrl = this._getUrl(`/v1/templates/${encodeURIComponent(templateId)}`);
    return this._materialize(templateUrl, propertyBag, getMaterializationId, false, skipCache);
  }

  /**
   * Returns a promise that resolves to an object with two fields - `status` and `result`.
   * The `result` field holds the materialization, while the `status` field is expected to always be `201`.
   * The main purpose of the `status` field is uniformity with the `materializeAsync` method.
   *
   * @param {string} templateUrl
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materializeSync(templateUrl, propertyBag, getMaterializationId = false, skipCache = false) {
    return this._materialize(templateUrl, propertyBag, getMaterializationId, false, skipCache);
  }

  /**
   * Returns a promise that resolves to an object with two fields - `status` and `result`.
   * The `result` field holds either the location where the materialization will be available
   * or the materialization itself. The `status` field is expected to always be either `202`
   * in case the preference for async execution was respected or `201` in case the server
   * decided to ignore the preference and execute the request synchronously.
   *
   * @param {string} templateUrl
   * @param {object} propertyBag A JSON object that contains the data to be populated in the template.
   * @param {boolean} getMaterializationId Return the materialization id instead of the materialization
   *    body. We can use that id later to fetch the materialized template without resending the properties.
   *    Defaults to false.
   */
  materializeAsync(templateUrl, propertyBag, getMaterializationId = false, skipCache = false) {
    return this._materialize(templateUrl, propertyBag, getMaterializationId, true, skipCache);
  }

  _getUrl(path) {
    return this.baseUrl + path;
  }

  _verifyTemplateUrl(path, templateUrl) {
    const parts = templateUrl.split('/');
    if (parts.length <= 0) {
      throw new Error('Invalid template URL (parts)');
    }
    if (templateUrl !== (this.baseUrl + path + '/' + parts[parts.length-1])) {
      throw new Error(`Invalid template URL (format) ${templateUrl} :: ${this.baseUrl + path + '/' + parts[parts.length-1]}`);
    }
    return templateUrl;
  }

  _materialize(templateUrl, propertyBag, getMaterializationId = false, preferAsync = false, skipCache = false) {
    // TODO: we have to store materialization link at template to avoid URL construction
    let verifiedTemplateUrl = this._verifyTemplateUrl('/v1/templates', templateUrl);
    const parts = verifiedTemplateUrl.split('/');
    const templateId = parts[parts.length-1];

    let self = this;
    let templatesMaterializationUrl = this._getUrl('/v1/templates' + '/' + templateId + '/materializations');
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.materialize', function(subsegment) {
        subsegment.addAnnotation('URL', templatesMaterializationUrl);
        subsegment.addAnnotation('RESTAction', 'POST');
        subsegment.addAnnotation('Template', templateUrl);

        let req = request.post(templatesMaterializationUrl + (skipCache ? `?skip_cache=${Math.random()}` : ''))
          .timeout({
            response: self.timeout,
            deadline: self.deadline,
          })
          .retry(self.numRetries)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', 'application/json')
          .set('x-cimpress-link-timeout', self.timeout);

        if (self.isBinaryResponse) {
          req.responseType('blob');
        }
        if (self.blacklistHeader) {
          req.set('x-cimpress-rel-blacklist', self.blacklistHeader);
        }
        if (self.whitelistHeader) {
          req.set('x-cimpress-rel-whitelist', self.whitelistHeader);
        }
        if (self.acceptHeader) {
          req.set('accept', self.acceptHeader);
        }
        if (self.acceptPreferenceHeader) {
          req.set('x-cimpress-accept-preference', self.acceptPreferenceHeader);
        }
        if (self.curieHeader) {
          req.set('x-cimpress-rel-curies', self.curieHeader);
        } else if (Object.keys(self.curies).length) {
          req.set('x-cimpress-rel-curies', self._constructCurieHeader());
        }
        if (self.maximumCrawlDepthHeader) {
          req.set('x-cimpress-max-depth', self.maximumCrawlDepthHeader);
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
                let preStringLen = 'v1'.length + '/materializations/'.length + 1;
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
                  result: self.isBinaryResponse ? res.body : res.text,
                });
              }
            })
          .catch(
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
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
  getMaterializationById(idMaterialization, skipCache = false) {
    let self = this;
    let materializationsUrl = this._getUrl('/v1/materializations');
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getMaterialization', function(subsegment) {
        subsegment.addAnnotation('URL', materializationsUrl);
        subsegment.addAnnotation('RESTAction', 'GET');
        subsegment.addAnnotation('TemplateMaterialization', idMaterialization);

        let req = request
          .get(materializationsUrl + '/' + idMaterialization + (skipCache ? `?skip_cache=${Math.random()}` : ''));

        if (self.isBinaryResponse) {
          req.responseType('blob');
        }

        req.timeout({
            response: self.timeout,
            deadline: self.deadline,
          })
          .retry(self.numRetries)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(self.isBinaryResponse ? res.body : res.text);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
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
   */
  expand(propertyBag, skipCache = false) {
    let self = this;
    let expandUrl = this._getUrl('/v1/expand');
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.expand', function(subsegment) {
        subsegment.addAnnotation('URL', expandUrl);
        subsegment.addAnnotation('RESTAction', 'POST');

        let req = request
          .post(expandUrl + (skipCache ? `?skip_cache=${Math.random()}` : ''))
          .timeout({
            response: self.timeout,
            deadline: self.deadline,
          })
          .retry(self.numRetries)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .set('Content-Type', 'application/json')
          .set('x-cimpress-link-timeout', self.timeout);

        if (self.blacklistHeader) {
          req.set('x-cimpress-rel-blacklist', self.blacklistHeader);
        }
        if (self.whitelistHeader) {
          req.set('x-cimpress-rel-whitelist', self.whitelistHeader);
        }
        if (self.acceptHeader) {
          req.set('accept', self.acceptHeader);
        }
        if (self.acceptPreferenceHeader) {
          req.set('x-cimpress-accept-preference', self.acceptPreferenceHeader);
        }
        if (self.curieHeader) {
          req.set('x-cimpress-rel-curies', self.curieHeader);
        } else if (Object.keys(self.curies).length) {
          req.set('x-cimpress-rel-curies', self._constructCurieHeader());
        }
        if (self.maximumCrawlDepthHeader) {
          req.set('x-cimpress-max-depth', self.maximumCrawlDepthHeader);
        }

        req.send(propertyBag)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.text);
            },
            (err) => {
              let isTimeoutError = (err) => err.response.text.includes('ESOCKETTIMEDOUT');

              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
              subsegment.addAnnotation('UnableToExpandPropertyBag: ' + err.message);

              if (err.status === 400 && self.numRetries > 0 && isTimeoutError(err)) {
                subsegment.addAnnotation('WillRetry: true');
                subsegment.close(err);
                resolve(self.expand(propertyBag, skipCache));
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
    let baseUrl = this._getUrl('/');
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.livecheck', function(subsegment) {
        subsegment.addAnnotation('URL', baseUrl + 'livecheck');
        subsegment.addAnnotation('RESTAction', 'GET');

        request
          .get(baseUrl + 'livecheck' + (skipCache ? `?skip_cache=${Math.random()}` : ''))
          .timeout({
            response: self.timeout,
            deadline: self.deadline,
          })
          .retry(self.numRetries)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res && res.status == 200);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
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
    let swaggerUrl = this._getUrl('/v1/swagger.json');
    return new Promise((resolve, reject) => {
      self.xray.captureAsyncFunc('Stereotype.getSwagger', function(subsegment) {
        subsegment.addAnnotation('URL', swaggerUrl);
        subsegment.addAnnotation('RESTAction', 'GET');

        request
          .get(swaggerUrl + (skipCache ? `?skip_cache=${Math.random()}` : ''))
          .timeout({
            response: self.timeout,
            deadline: self.deadline,
          })
          .retry(self.numRetries)
          .set('Authorization', 'Bearer ' + self.accessToken)
          .then(
            (res) => {
              subsegment.addAnnotation('ResponseCode', res.status);
              subsegment.close();
              resolve(res.body);
            },
            (err) => {
              subsegment.addAnnotation('ResponseCode', err.status || 'n/a');
              subsegment.close(err);
              reject(err);
            }
          );
      }); // Closes self.xray.captureAsyncFunc()
    }); // Closes new Promise()
  }
}

module.exports = StereotypeClient;
