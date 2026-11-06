'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { build, OUT } = require('../tools/build-api');
const { seededEnv } = require('./fixtures');
const L = require('./api-lists');

test('src/Api.gs is generated from tests/api-lists.js and is up to date', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), build(), 'run node apps-script/pt-scheduler/tools/build-api.js');
});

test('_apiTable_ holds exactly the doPost set, each entry a real function', () => {
  const env = seededEnv();
  const table = env.callRaw('_apiTable_');
  assert.deepEqual(Object.keys(table).sort(), [...L.API_FUNCTIONS].sort());
  for (const [name, fn] of Object.entries(table)) assert.equal(typeof fn, 'function', name);
  for (const n of [...L.OWNER, ...L.TRIGGER, ...L.NOT_API]) assert.ok(!(n in table), n + ' leaked into the table');
});
