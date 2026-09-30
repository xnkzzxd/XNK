'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

test('getReminderStatus reports trigger, last tick and Telegram readiness', () => {
  const env = seededEnv();
  const token = env.adminToken();
  let st = env.call('getReminderStatus', token);
  assert.equal(st.triggerInstalled, false);
  assert.equal(st.lastTickAt, '');
  assert.equal(st.telegramReady, true);
  assert.equal(st.enabled, false);

  env.props.RMD_LAST_tick = String(Date.parse('2026-09-30T03:00:00Z'));
  env.props.RMD_ENABLED = 'true';
  delete env.props.TELEGRAM_BOT_TOKEN;
  st = env.call('getReminderStatus', token);
  assert.equal(st.lastTickAt, '2026-09-30T03:00:00.000Z');
  assert.equal(st.telegramReady, false);
  assert.equal(st.enabled, true);
});

test('installReminderTrigger installs exactly one trigger, even when run twice', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const first = env.call('installReminderTrigger', token);
  assert.equal(first.triggerInstalled, true);
  assert.equal(env.triggers.length, 1);
  env.call('installReminderTrigger', token);
  assert.equal(env.triggers.length, 1);
  assert.equal(env.triggers[0].getHandlerFunction(), 'runReminderTick');
});

function seedLog(env) {
  env.ss.seed('ReminderLog', [
    ['Kunci', 'Jenis', 'Slot', 'Target', 'Waktu', 'Hasil'],
    ['pr|2026-09-28T08|*', 'pr', '2026-09-28T08', '*', '2026-09-28T01:00:00.000Z', 'ok'],
    ['pr|2026-09-29T08|PT-A', 'pr', '2026-09-29T08', 'PT-A', '2026-09-29T01:00:00.000Z', 'gagal'],
    ['pr|2026-09-30T08|PT-GONE', 'pr', '2026-09-30T08', 'PT-GONE', '2026-09-30T01:00:00.000Z', 'ok'],
  ]);
}

test('getReminderLog returns newest first, names instead of ids, and never phone numbers', () => {
  const env = seededEnv();
  seedLog(env);
  const rows = env.call('getReminderLog', env.adminToken());
  assert.deepEqual(rows.map(r => r.target), ['Klien dihapus', 'Ani Anggraini', 'Semua']);
  assert.deepEqual(rows.map(r => r.hasil), ['ok', 'gagal', 'ok']);
  const json = JSON.stringify(rows);
  assert.ok(!json.includes('6281111111111') && !json.includes('081222222222'));
});

test('getReminderLog honors onlyFailed and limit', () => {
  const env = seededEnv();
  seedLog(env);
  const token = env.adminToken();
  assert.equal(env.call('getReminderLog', token, { onlyFailed: true }).length, 1);
  assert.equal(env.call('getReminderLog', token, { limit: 2 }).length, 2);
  assert.equal(env.call('getReminderLog', token, { limit: 9999 }).length, 3);
});

test('getReminderLog on a fresh sheet is empty', () => {
  const env = seededEnv();
  assert.deepEqual(env.call('getReminderLog', env.adminToken()), []);
});
