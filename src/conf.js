const BASE_URL = 'https://stereotype.trdlnk.cimpress.io/';
const VERSION = 'v1';
const TEMPLATES_URL = BASE_URL + VERSION + '/templates/';
const MATERIALIZATIONS_URL = BASE_URL + VERSION + '/materializations/';
const MATERIALIZATIONS = '/materializations/';

const BODY_TYPES = {
  dust: 'text/dust',
  mustache: 'text/mustache',
  handlebars: 'text/handlebars'
};

module.exports = {
  BASE_URL,
  VERSION,
  TEMPLATES_URL,
  MATERIALIZATIONS,
  MATERIALIZATIONS_URL,
  BODY_TYPES
};
