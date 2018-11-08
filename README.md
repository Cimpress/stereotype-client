# Cimpress Stereotype Client [![Build Status](https://travis-ci.org/Cimpress/stereotype-client.svg?branch=master)](https://travis-ci.org/Cimpress/stereotype-client) [![NPM version](https://img.shields.io/npm/v/stereotype-client.svg)](https://www.npmjs.com/package/stereotype-client)


This project contains a client library for Cimpress' Stereotype service.

## Usage

```javascript
let sc = new StereotypeClient(AUTH0_V2_TOKEN);

// Create a template:
sc.createTemplate('Hello {{name}}!', 'text/mustache')
  .then(
    (response) => {
      console.log(response.status);
      console.log(response.templateId);
    },
    (err) => console.log("ERROR:\n", err));

// Create or update a template:
sc.putTemplate('Greeting', 'Hello {{name}}!', 'text/mustache')
  .then(
    (status) => console.log(status),
    (err) => console.log("ERROR:\n", err));

// Get an existing template:
sc.getTemplate('Greeting')
  .then(
    (template) => console.log(template),
    (err) => console.log('ERROR:\n', err.message));

// Get a list of templates:
let skipCache = false;
let includePublic = false; //Include public templates
sc.listTemplates(skipCache, includePublic)
  .then(
    (template) => {
      console.log(template.templateId);
      console.log(template.canCopy); // Boolean
      console.log(template.canEdit); // Boolean
    },
    (err) => console.log('ERROR:\n', err.message));

// Materialize a template:
sc.materialize('Greeting', {
  "name": "Zoidberg"
}).then(
  (mat) => console.log(mat),
  (err) => console.log("ERROR:\n", err));

// Materialize a template and fetch its materialization id:
let matId = sc.materialize('Greeting', {
  "name": "Zoidberg"
}, true).then(
  (matId) => console.log(matId),
  (err) => console.log("ERROR:\n", err));

// Fetch an existing materialization:
sc.getMaterialization(matId)
  .then(
    (mat) => console.log(mat),
    (err) => console.log('ERROR:\n', err));
```

## Support

For any inquiries, we invite you to reach out to the Trdelnik Squad at TrdelnikSquad@cimpress.com.
