const BASE_URL = 'https://stereotype.trdlnk.cimpress.io/';
const VERSION = 'v1';
const TEMPLATES_URL = BASE_URL + VERSION + '/templates/';
const MATERIALIZATIONS = '/materializations/';
const MATERIALIZATIONS_URL = BASE_URL + VERSION + MATERIALIZATIONS;
const EXPAND = '/expand';
const EXPAND_URL = BASE_URL + VERSION + EXPAND;

const BODY_TYPES = {
  dust: ['text/dust'],
  mustache: ['text/mustache'],
  handlebars: ['text/handlebars','text/x-handlebars-template']
};

const CURIE_SEPARATOR = ';';

module.exports = {
  BASE_URL,
  VERSION,
  TEMPLATES_URL,
  MATERIALIZATIONS,
  MATERIALIZATIONS_URL,
  EXPAND,
  EXPAND_URL,
  BODY_TYPES,
  CURIE_SEPARATOR,
};
