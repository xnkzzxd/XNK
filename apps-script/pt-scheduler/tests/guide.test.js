'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const GUIDE_COL = 22; // W, 0-based

function register(env, phone) {
  return env.call('registerNewClient', { name: 'Dewi', phone: phone || '6281444444444', goal: 'x', packageId: 'P1' });
}

test('self-registered client gets the guide; column W is "baru" with a header', () => {
  const env = seededEnv();
  const res = register(env);
  assert.deepEqual(res.member.guide, { done: [] });
  assert.equal(env.memberRow(res.id)[GUIDE_COL], 'baru');
  assert.equal(env.sheet('MemberData').rows[0][GUIDE_COL], 'Panduan');
  assert.deepEqual(env.call('getMemberProfile', res.token).guide, { done: [] });
  // Logging in again by phone (same new client, another device) keeps the guide.
  assert.deepEqual(env.call('memberLoginByPhone', '081444444444').member.guide, { done: [] });
});

test('existing clients, renewals and admin-added clients get no guide', () => {
  const env = seededEnv();
  assert.equal(env.call('memberLoginByPhone', '6281111111111').member.guide, null);
  const before = env.memberRow('PT-A').slice();
  assert.deepEqual(env.call('registerNewClient', { name: 'A', phone: '6281111111111', goal: 'x', packageId: 'P1' }), { status: 'exists' });
  assert.deepEqual(env.memberRow('PT-A'), before);
  const added = env.call('addMember', env.adminToken(), { name: 'Budi', phone: '6287777777777', goal: 'x', packageId: 'P1' });
  assert.equal(env.call('memberLoginByPhone', '6287777777777').member.guide, null);
  assert.ok(added);
});

test('markGuideSeen records pages, is idempotent and finishes after the last page', () => {
  const env = seededEnv();
  const res = register(env);
  assert.deepEqual(env.call('markGuideSeen', res.token, 'beranda'), { done: ['beranda'] });
  assert.deepEqual(env.call('markGuideSeen', res.token, 'beranda'), { done: ['beranda'] });
  assert.deepEqual(env.call('markGuideSeen', res.token, 'paket'), { done: ['beranda', 'paket'] });
  assert.equal(env.memberRow(res.id)[GUIDE_COL], 'baru|beranda|paket');
  ['booking', 'jadwal'].forEach(p => env.call('markGuideSeen', res.token, p));
  assert.equal(env.call('markGuideSeen', res.token, 'coach'), null);
  assert.equal(env.memberRow(res.id)[GUIDE_COL], 'selesai');
  assert.equal(env.call('getMemberProfile', res.token).guide, null);
});

test('"semua" turns the guide off; unknown pages and bad tokens are rejected', () => {
  const env = seededEnv();
  const res = register(env);
  assert.throws(() => env.call('markGuideSeen', res.token, 'admin'), /Halaman panduan tidak dikenal/);
  assert.throws(() => env.call('markGuideSeen', 'nope', 'beranda'), /Sesi berakhir/);
  assert.equal(env.call('markGuideSeen', res.token, 'semua'), null);
  assert.equal(env.memberRow(res.id)[GUIDE_COL], 'selesai');
  // An existing client cannot switch the guide on for themselves.
  const old = env.call('memberLoginByPhone', '6281111111111');
  assert.equal(env.call('markGuideSeen', old.token, 'beranda'), null);
  assert.equal(env.memberRow('PT-A')[GUIDE_COL] || '', '');
});

test('owner can switch the guide off and on in Pengaturan (on by default)', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const res = register(env);
  assert.equal(env.call('getAppSettings', token).clientGuideEnabled, true);
  assert.equal(env.call('updateAppSettings', token, { clientGuideEnabled: false }).clientGuideEnabled, false);
  assert.equal(env.props.CLIENT_GUIDE_ENABLED, 'false');
  assert.equal(env.call('getMemberProfile', res.token).guide, null);
  assert.equal(env.call('updateAppSettings', token, { clientGuideEnabled: true }).clientGuideEnabled, true);
  assert.equal(env.props.CLIENT_GUIDE_ENABLED, undefined);
  assert.deepEqual(env.call('getMemberProfile', res.token).guide, { done: [] });
});
