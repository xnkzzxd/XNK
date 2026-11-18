'use strict';
// T-2253: hitungan kuota harian (email, UrlFetch, menit trigger) per hari WIB di QUOTA_<yyyymmdd>, 7 hari.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const SECRET = 'a'.repeat(40);
const day = env => env.call('_quotaDay_');
const read = env => JSON.parse(env.props['QUOTA_' + day(env)] || 'null');

test('di luar tick setiap hitungan langsung ditulis ke hari WIB ini', () => {
  const env = seededEnv();
  env.callRaw('_quotaFetch_');
  env.callRaw('_quotaMail_', 2);
  assert.deepEqual(read(env), { mail: 2, fetch: 1, triggerMs: 0, mailSkipped: 0 });
  assert.match(day(env), /^\d{8}$/);
});

test('selama tick hitungan ditampung lalu ditulis sekali di akhir, termasuk lama berjalan', () => {
  const env = seededEnv();
  env.callRaw('_quotaHoldStart_');
  for (let i = 0; i < 5; i++) env.callRaw('_quotaFetch_');
  assert.equal(env.props['QUOTA_' + day(env)], undefined, 'belum ditulis di tengah tick');
  env.callRaw('_quotaHoldEnd_', Date.now() - 1500);
  const q = read(env);
  assert.equal(q.fetch, 5);
  assert.ok(q.triggerMs >= 1500, String(q.triggerMs));
});

test('runReminderTick tetap menjawab seperti dulu lewat pembungkus kuota; Telegram ikut terhitung', () => {
  const env = seededEnv();
  assert.equal(env.call('runReminderTick').skipped, 'nonaktif');
  assert.equal(env.call('runWarmTick').skipped, 'nonaktif');
  env.props.TELEGRAM_CHAT_IDS = '1,2';
  env.callRaw('kirimNotifTelegram_', 'hai');
  assert.equal(read(env).fetch, 2);
});

test('hari baru menghapus catatan lebih tua dari 7 hari', () => {
  const env = seededEnv();
  const old = env.callRaw('_quotaDay_', new Date(Date.now() - 8 * 864e5));
  const keep = env.callRaw('_quotaDay_', new Date(Date.now() - 3 * 864e5));
  env.props['QUOTA_' + old] = '{"mail":1}';
  env.props['QUOTA_' + keep] = '{"mail":1}';
  env.callRaw('_quotaFetch_');
  assert.equal(env.props['QUOTA_' + old], undefined);
  assert.ok(env.props['QUOTA_' + keep]);
});

test('email biasa dilewati bila sisa kuota di bawah MAIL_RESERVE, dan dicatat', () => {
  const env = seededEnv();
  env.mailQuota = 9;
  assert.equal(env.callRaw('_mailSend_', { to: 'a@b.co', subject: 's', htmlBody: 'x' }), false);
  assert.equal(env.mails.length, 0);
  assert.equal(read(env).mailSkipped, 1);
  env.props.MAIL_RESERVE = '2';
  assert.equal(env.callRaw('_mailSend_', { to: 'a@b.co, c@d.co', subject: 's', htmlBody: 'x' }), true);
  assert.equal(env.mails.length, 1);
  assert.equal(read(env).mail, 2, 'dua penerima');
});

test('hubStatus membawa kuota hari ini: hanya tanggal dan angka', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  env.mailQuota = 87;
  env.callRaw('_quotaMail_', 13);
  env.callRaw('_quotaTrigger_', 90000);
  const q = env.call('hubStatus', SECRET).quota;
  assert.match(q.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(q.mail, 13);
  assert.equal(q.fetch, 0);
  assert.equal(q.triggerMin, 1.5);
  assert.equal(q.mailRemaining, 87);
  for (const k of Object.keys(q)) if (k !== 'date') assert.equal(typeof q[k], 'number', k);
});
