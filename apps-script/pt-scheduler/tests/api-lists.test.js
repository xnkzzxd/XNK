'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./api-lists');

test('api lists: every function is in exactly one list', () => {
  const all = [...L.PUBLIC, ...L.ADMIN, ...L.MEMBER, ...L.OWNER, ...L.TRIGGER];
  assert.equal(new Set(all).size, all.length, 'a function is listed twice');
});

test('api lists: the doPost set never includes owner, trigger or entry-point helpers', () => {
  for (const n of [...L.OWNER, ...L.TRIGGER, ...L.NOT_API]) {
    assert.ok(!L.API_FUNCTIONS.includes(n), n + ' must not be reachable through doPost');
  }
  assert.equal(L.API_FUNCTIONS.length, L.PUBLIC_API.length + L.ADMIN.length + L.MEMBER.length);
  assert.ok(L.API_FUNCTIONS.includes('adminLogin') && L.API_FUNCTIONS.includes('getMembers'));
});
