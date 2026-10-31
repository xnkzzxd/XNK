'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { build, OUT } = require('../tools/build-app-share');

test('app/share.html is generated from Theme.html and Bagikan.html and is up to date', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), build(), 'run node apps-script/pt-scheduler/tools/build-app-share.js');
});
