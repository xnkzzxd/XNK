'use strict';
// T-2254: ringkasan pengingat juga ke email coach (NOTIF_EMAIL_REMINDERS = off | on | auto). Bawaan off = perilaku lama.
const test = require('node:test');
const assert = require('node:assert/strict');
const { runInContext } = require('node:vm');
const { seededEnv } = require('./fixtures');

const SLOT = '2026-09-30T19';
const items = () => [
  { name: 'Ani Anggraini', phone: '6281111111111', fact: '06:00', text: 'Halo Kak Ani, sampai besok jam 06:00.' },
  { name: 'Budi', phone: '081222222222', fact: '07:00', text: 'Halo Kak Budi.' },
];
const setJob = (env, jenis) => runInContext('_rmdCurJob_ = ' + (jenis ? JSON.stringify({ jenis, slot: SLOT }) : 'null'), env.context);
const send = (env, list) => env.callRaw('_rmdSendDigest_', 'Sesi besok', 'Kamis 1 Okt', list || items(), []);
const tgCount = env => env.fetches.filter(f => /api\.telegram\.org/.test(f.url)).length;
const logRows = env => (env.sheet('ReminderLog') ? env.sheet('ReminderLog').getDataRange().getValues().slice(1) : []);
const noTelegram = env => { delete env.props.TELEGRAM_BOT_TOKEN; delete env.props.TELEGRAM_CHAT_IDS; };

function mk(mode, opts) {
  const env = seededEnv();
  env.props.TELEGRAM_CHAT_IDS = '111';
  if (mode) env.props.NOTIF_EMAIL_REMINDERS = mode;
  env.props.NOTIF_EMAIL = 'coach@gym.test';
  if (opts && opts.noTelegram) noTelegram(env);
  setJob(env, 'sesi-besok');
  return env;
}

test('bawaan (off): hanya Telegram, tanpa email dan tanpa baris log tambahan', () => {
  const env = mk(null);
  assert.equal(send(env), true);
  assert.equal(tgCount(env), 1);
  assert.equal(env.mails.length, 0);
  assert.equal(logRows(env).length, 0, 'jalur lama tidak menulis baris per saluran');
  const env2 = mk('off', { noTelegram: true });
  assert.equal(send(env2), false, 'tanpa Telegram dan email mati: gagal seperti dulu');
  assert.equal(env2.mails.length, 0);
});

test('on: email dikirim bersama Telegram, satu email per jenis, subjek dan tombol wa.me', () => {
  const env = mk('on');
  assert.equal(send(env), true);
  assert.equal(tgCount(env), 1);
  assert.equal(env.mails.length, 1);
  const m = env.mails[0];
  assert.equal(m.to, 'coach@gym.test');
  assert.equal(m.subject, 'Pengingat: sesi besok (2 klien)');
  const hrefs = [...m.htmlBody.matchAll(/href="([^"]+)"/g)].map(x => x[1].replace(/&amp;/g, '&'));
  assert.equal(hrefs.length, 2);
  assert.ok(hrefs[0].startsWith('https://wa.me/6281111111111?text='));
  assert.ok(hrefs[1].startsWith('https://wa.me/6281222222222?text='));
  assert.match(m.htmlBody, /<strong>Sesi besok<\/strong>/);
  assert.match(m.htmlBody, />Ani Anggraini · 06:00</);
  const keys = logRows(env).map(r => r[0] + '=' + r[5]).sort();
  assert.deepEqual(keys, ['sesi-besok|' + SLOT + '|email=ok', 'sesi-besok|' + SLOT + '|telegram=ok']);
});

test('auto: email hanya bila Telegram belum diatur', () => {
  const withTg = mk('auto');
  assert.equal(send(withTg), true);
  assert.equal(withTg.mails.length, 0);
  assert.equal(tgCount(withTg), 1);
  const noTg = mk('auto', { noTelegram: true });
  assert.equal(send(noTg), true);
  assert.equal(noTg.mails.length, 1);
  assert.equal(tgCount(noTg), 0);
  const off = mk('auto');
  off.props.TELEGRAM_ENABLED = 'false';
  assert.equal(send(off), true, 'Telegram dimatikan = dianggap belum diatur');
  assert.equal(off.mails.length, 1);
});

test('tick ulang tidak mengirim dua kali: hanya saluran yang belum ok', () => {
  const env = mk('on');
  env.fetchCode = 500;                       // Telegram gagal, email terkirim
  assert.equal(send(env), false);
  assert.equal(env.mails.length, 1);
  env.fetchCode = null;
  assert.equal(send(env), true);
  assert.equal(env.mails.length, 1, 'email tidak dikirim lagi');
  assert.equal(tgCount(env), 2, 'Telegram dicoba lagi');

  const env2 = mk('on');
  env2.mailError = 'Service invoked too many times';   // email gagal, Telegram terkirim
  assert.equal(send(env2), false);
  assert.equal(tgCount(env2), 1);
  env2.mailError = null;
  assert.equal(send(env2), true);
  assert.equal(tgCount(env2), 1, 'Telegram tidak dikirim lagi');
  assert.equal(env2.mails.length, 1);
  assert.equal(send(env2), true);
  assert.equal(env2.mails.length, 1, 'sudah ok: tidak ada kiriman lagi');
  assert.equal(tgCount(env2), 1);
});

test('label dan teks di-escape; nomor WA hanya di dalam href wa.me', () => {
  const env = mk('on', { noTelegram: true });
  const list = [{ name: '<script>alert(1)</script> & "Ani"', phone: '6281111111111', fact: '06:00', text: 'Halo <b>Kak</b>' }];
  assert.equal(send(env, list), true);
  const m = env.mails[0];
  assert.ok(!/<script/i.test(m.htmlBody), m.htmlBody);
  assert.match(m.htmlBody, /&lt;script&gt;/);
  assert.ok(!/\d{8,}/.test(m.subject), 'subjek tanpa nomor');
  const outside = m.htmlBody.replace(/href="[^"]*"/g, '');
  assert.ok(!/62\d{8,}|08\d{8,}/.test(outside), 'tidak ada nomor di luar href');
  assert.ok(!/javascript:/i.test(m.htmlBody));
});

test('hanya tombol wa.me yang masuk email; tag Telegram lain dibuang', () => {
  const r = seededEnv().callRaw('_rmdEmailFromDigest_', '🔔 <b>PR</b> <a href="x">y</a>\n<i>catatan</i>',
    [{ text: 'A', url: 'https://wa.me/6281?text=a' }, { text: 'B', url: 'https://evil.test/x' }], 'PR', 2);
  assert.equal(r.subject, 'Pengingat: pr (2 klien)');
  assert.equal((r.html.match(/href=/g) || []).length, 1);
  assert.match(r.html, /<strong>PR<\/strong> y<br><em>catatan<\/em>/);
});

test('kuota email di bawah cadangan: email dilewati, Telegram tetap membawa ringkasan', () => {
  const env = mk('on');
  env.mailQuota = 5;                          // cadangan bawaan 10
  assert.equal(send(env), true, 'Telegram sukses menutup job');
  assert.equal(env.mails.length, 0);
  assert.equal(tgCount(env), 1);
  const noTg = mk('auto', { noTelegram: true });
  noTg.mailQuota = 5;
  assert.equal(send(noTg), false, 'tanpa Telegram: gagal, dicoba lagi tick berikutnya');
  assert.equal(noTg.mails.length, 0);
});

test('tanpa job aktif (tes dari Pengaturan): email tetap dikirim tanpa baris log per saluran', () => {
  const env = mk('on');
  setJob(env, null);
  assert.equal(send(env), true);
  assert.equal(env.mails.length, 1);
  assert.equal(logRows(env).length, 0);
});

test('Pengaturan: pilihan email ringkasan divalidasi, kosong = bawaan off, email salah ditolak', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.equal(env.call('getAppSettings', token).notifEmailReminders, 'off');
  env.call('updateAppSettings', token, { notifEmailReminders: 'auto', notifEmail: 'coach@gym.test' });
  assert.equal(env.props.NOTIF_EMAIL_REMINDERS, 'auto');
  assert.equal(env.call('getAppSettings', token).notifEmailReminders, 'auto');
  assert.throws(() => env.call('updateAppSettings', token, { notifEmailReminders: 'kadang', notifEmail: 'x@y.co' }), /Pilihan email ringkasan tidak dikenal/);
  assert.equal(env.props.NOTIF_EMAIL, 'coach@gym.test', 'tidak ada yang ditulis dari panggilan yang ditolak');
  assert.throws(() => env.call('updateAppSettings', token, { notifEmail: 'bukan email' }), /Alamat email tidak valid/);
  env.call('updateAppSettings', token, { notifEmailReminders: '' });
  assert.equal(env.props.NOTIF_EMAIL_REMINDERS, undefined);
  assert.equal(env.call('getAppSettings', token).notifEmailReminders, 'off');
});
