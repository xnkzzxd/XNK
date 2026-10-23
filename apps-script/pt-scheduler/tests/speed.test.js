'use strict';
// Kecepatan: skema dicek sekali, isi sheet dibaca sekali per bundle, data jarang berubah dari cache.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

test('bootstrap reads each sheet once: MemberData once, Schedules once', () => {
  const env = seededEnv();
  const tok = env.memberToken(KEY_A);
  env.call('getPortalBootstrap', tok);   // warms the schema and shared caches
  env.resetReads();
  env.call('getPortalBootstrap', tok);
  const r = env.reads();
  assert.equal(r.bySheet.MemberData, 1);
  assert.ok(r.bySheet.Schedules <= 1);
  assert.ok(!r.bySheet.PriceList, 'package list comes from the shared cache');
  env.resetReads();
  env.call('getAdminBootstrap', env.adminToken());
  assert.equal(env.reads().bySheet.MemberData, 1);
});

test('schema checks run once: no per-call column-format writes on MemberData', () => {
  const env = seededEnv();
  const tok = env.memberToken(KEY_A);
  env.call('getPortalBootstrap', tok);
  let formats = 0;
  const sheet = env.ss.getSheetByName('MemberData');
  const orig = sheet.getRange.bind(sheet);
  sheet.getRange = function (...a) { const r = orig(...a); const f = r.setNumberFormat; r.setNumberFormat = function (...b) { formats++; return f.apply(this, b); }; return r; };
  for (let i = 0; i < 5; i++) env.call('getPortalBootstrap', tok);
  assert.equal(formats, 0);
});

test('the read memo never leaks into writers: a booking is visible to the next read', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const before = j(env.call('getAdminBootstrap', t)).schedules.length;
  env.call('addSchedule', t, { memberId: 'PT-A', title: 'Andi', phone: '6281111111111', start: new Date(Date.now() + 5 * 864e5).toISOString(), end: new Date(Date.now() + 5 * 864e5 + 36e5).toISOString() });
  assert.equal(j(env.call('getAdminBootstrap', t)).schedules.length, before + 1);
});

test('package list: cached copy is dropped when a package changes', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const first = j(env.call('getPriceList'));
  env.call('setPackageActive', t, first[0].id, false);
  const after = j(env.call('getPriceList'));
  assert.equal(after.length, first.length - 1);
});
