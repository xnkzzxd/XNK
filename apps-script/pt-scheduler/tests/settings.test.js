'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const DEFAULT_HOURS = { 0: [6, 12], 1: [6, 21], 2: [6, 21], 3: [6, 21], 4: [6, 21], 5: [6, 21], 6: [6, 21] };

test('getAppSettings returns today\'s defaults until the admin changes something', () => {
  const env = seededEnv();
  const token = env.adminToken();
  // seededEnv() pre-seeds TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_IDS for other tests' fixtures;
  // clear them here to check the true "nothing configured yet" default shape.
  delete env.props.TELEGRAM_BOT_TOKEN;
  delete env.props.TELEGRAM_CHAT_IDS;
  const s = env.call('getAppSettings', token);
  assert.deepEqual(s, {
    telegramEnabled: true, telegramBotToken: '', telegramChatIds: '', notifEmail: '',
    businessHours: DEFAULT_HOURS,
    loginMaxFails: 10, loginLockSeconds: 600, memberLoginMaxFails: 30, adminSessionDays: 30,
  });
});

test('updateAppSettings saves every field, and getAppSettings reflects it back', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const hours = Object.assign({}, DEFAULT_HOURS, { 0: [8, 10] });
  const res = env.call('updateAppSettings', token, {
    telegramEnabled: false, telegramBotToken: '123:abc', telegramChatIds: '1, 2',
    notifEmail: 'owner@gym.test', businessHours: hours,
    loginMaxFails: 3, loginLockSeconds: 120, memberLoginMaxFails: 5, adminSessionDays: 7,
  });
  const expected = {
    telegramEnabled: false, telegramBotToken: '123:abc', telegramChatIds: '1, 2',
    notifEmail: 'owner@gym.test', businessHours: hours,
    loginMaxFails: 3, loginLockSeconds: 120, memberLoginMaxFails: 5, adminSessionDays: 7,
  };
  assert.deepEqual(res, expected);
  assert.deepEqual(env.call('getAppSettings', token), expected);
});

test('updateAppSettings: an empty string deletes the property, reverting to default', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.call('updateAppSettings', token, { telegramBotToken: 'x', notifEmail: 'a@b.com', loginMaxFails: 4 });
  env.call('updateAppSettings', token, { telegramBotToken: '', notifEmail: '', loginMaxFails: '' });
  const s = env.call('getAppSettings', token);
  assert.equal(s.telegramBotToken, '');
  assert.equal(s.notifEmail, '');
  assert.equal(s.loginMaxFails, 10);
});

test('updateAppSettings rejects invalid business hours and saves nothing from that call', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.throws(() => env.call('updateAppSettings', token, {
    notifEmail: 'should-not-be-saved@x.com',
    businessHours: Object.assign({}, DEFAULT_HOURS, { 1: [10, 10] }), // start === end
  }), /Jam operasional/);
  assert.equal(env.call('getAppSettings', token).notifEmail, '');
  assert.deepEqual(env.call('getAppSettings', token).businessHours, DEFAULT_HOURS);

  assert.throws(() => env.call('updateAppSettings', token, {
    businessHours: Object.assign({}, DEFAULT_HOURS, { 6: [5, 26] }), // out of 0-24
  }), /Jam operasional/);
});

test('updateAppSettings rejects out-of-range numeric fields and saves nothing from that call', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.throws(() => env.call('updateAppSettings', token, {
    notifEmail: 'should-not-be-saved@x.com', loginMaxFails: 0,
  }), /loginMaxFails/);
  assert.equal(env.call('getAppSettings', token).notifEmail, '');
  assert.throws(() => env.call('updateAppSettings', token, { adminSessionDays: 9999 }), /adminSessionDays/);
});

test('getBusinessHours is public and reflects the saved override', () => {
  const env = seededEnv();
  assert.deepEqual(env.call('getBusinessHours'), DEFAULT_HOURS);
  const token = env.adminToken();
  const hours = Object.assign({}, DEFAULT_HOURS, { 0: [9, 11] });
  env.call('updateAppSettings', token, { businessHours: hours });
  assert.deepEqual(env.call('getBusinessHours'), hours);
});

test('kirimNotifTelegram_ honors the TELEGRAM_ENABLED toggle', () => {
  const env = seededEnv();
  env.props.TELEGRAM_BOT_TOKEN = '1:abc';
  env.props.TELEGRAM_CHAT_IDS = '111';
  env.props.TELEGRAM_ENABLED = 'false';
  env.call('kirimNotifTelegram_', 'halo');
  assert.equal(env.fetches.length, 0);

  env.props.TELEGRAM_ENABLED = 'true';
  env.call('kirimNotifTelegram_', 'halo');
  assert.equal(env.fetches.length, 1);
});

test('notification email falls back to the owner\'s account, or uses NOTIF_EMAIL when set', () => {
  const env = seededEnv();
  assert.equal(env.call('_notifEmailRecipient_'), 'owner@example.com');
  env.props.NOTIF_EMAIL = 'gym@custom.test';
  assert.equal(env.call('_notifEmailRecipient_'), 'gym@custom.test');
});

test('sendTelegramTest sends one message per given chat id, using the given (not saved) token', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.props.TELEGRAM_BOT_TOKEN = 'saved:token';
  const res = env.call('sendTelegramTest', token, 'fresh:token', '10, 20, 30');
  assert.equal(env.fetches.length, 3);
  assert.ok(env.fetches.every(f => f.url.includes('fresh:token')));
  assert.deepEqual(res, { results: [{ id: '10', ok: true }, { id: '20', ok: true }, { id: '30', ok: true }], sent: 3, total: 3 });
  assert.equal(env.props.TELEGRAM_BOT_TOKEN, 'saved:token'); // test does not persist anything
});

test('sendTelegramTest requires a token and at least one chat id', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.throws(() => env.call('sendTelegramTest', token, '', '111'), /token/);
  assert.throws(() => env.call('sendTelegramTest', token, 'abc', ''), /Chat ID/);
});

test('LOGIN_MAX_FAILS from Pengaturan actually changes admin lockout behavior', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.call('updateAppSettings', token, { loginMaxFails: 2 });
  assert.throws(() => env.call('adminLogin', '000000'), /PIN salah/);
  assert.throws(() => env.call('adminLogin', '000000'), /PIN salah/);
  assert.throws(() => env.call('adminLogin', '000000'), /Terlalu banyak/);
});

test('MEMBER_LOGIN_MAX_FAILS from Pengaturan actually changes client lockout behavior', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.call('updateAppSettings', token, { memberLoginMaxFails: 2 });
  assert.throws(() => env.call('memberLoginByPhone', '081900000001'), /tidak ditemukan/);
  assert.throws(() => env.call('memberLoginByPhone', '081900000002'), /tidak ditemukan/);
  assert.throws(() => env.call('memberLoginByPhone', '081900000003'), /Terlalu banyak/);
});

test('ADMIN_SESSION_DAYS from Pengaturan changes the issued token lifetime', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.call('updateAppSettings', token, { adminSessionDays: 1 });
  const before = Date.now();
  const { token: shortToken } = env.call('adminLogin', require('./fixtures').ADMIN_PIN);
  const payload = env.context._readToken_(shortToken);
  const expected = before + 1 * 86400000;
  assert.ok(Math.abs(payload.exp - expected) < 5000, `exp ${payload.exp} not close to ${expected}`);
});
