'use strict';
// Daily-changing client reminder texts (PesanVariasi) and the "Kak <first name>" greeting.
const test = require('node:test');
const assert = require('node:assert/strict');
const { runInContext } = require('node:vm');
const { seededEnv, SCHEDULE_HEADERS } = require('./fixtures');

const NOW_ISO = '2026-09-30T12:00:00Z';   // Wednesday
const ctx = env => ({ now: runInContext("new Date('" + NOW_ISO + "')", env.context) });
const messages = env => env.fetches.map(f => JSON.parse(f.options.payload));
const buttons = env => messages(env).flatMap(m => (m.reply_markup ? m.reply_markup.inline_keyboard.map(r => r[0]) : []));
const waText = b => decodeURIComponent(new URL(b.url).searchParams.get('text'));
const V = env => runInContext('RMD_VARIANTS_DEFAULT', env.context);
const JENIS = ['hidup-sehat', 'makan-pagi', 'makan-sore', 'sesi-besok', 'pr', 'booking-minggu'];
const NEED = { 'sesi-besok': ['{jam}', '{coach}', '{tidur}'], 'pr': ['{pr}'], 'booking-minggu': ['{slot}'], 'makan-pagi': ['{tip}'], 'makan-sore': ['{tip}'] };

test('each daily type has 62 different texts (44 weekday + 18 weekend), valid, with "Kak {nama}" and its data', () => {
  const env = seededEnv();
  const all = V(env);
  JENIS.forEach(j => {
    assert.equal(all[j].weekday.length, 44, j);
    assert.equal(all[j].weekend.length, 18, j);
    const list = all[j].weekday.concat(all[j].weekend);
    assert.equal(new Set(list.map(t => t.toLowerCase().trim())).size, 62, j + ' has duplicates');
    list.forEach(t => {
      assert.equal(env.call('_rmdVarCheck_', j, t), t.trim());
      assert.ok(t.includes('Kak {nama}'), j + ': ' + t);
      (NEED[j] || []).forEach(p => assert.ok(t.includes(p), j + ' needs ' + p + ': ' + t));
      assert.ok(t.includes('\n'), j + ' should be several short lines: ' + t);
    });
  });
});

test('every extra set (banyak, habis, Ramadan, holidays, personal lines) is valid and unique', () => {
  const env = seededEnv();
  const all = V(env);
  Object.keys(all).forEach(key => {
    Object.keys(all[key]).forEach(hari => {
      const list = all[key][hari];
      assert.ok(list.length > 0, key + '/' + hari);
      assert.equal(new Set(list).size, list.length, key + '/' + hari + ' has duplicates');
      list.forEach(t => env.call('_rmdVarCheck_', key, t));
    });
  });
  assert.throws(() => env.call('_rmdVarCheck_', 'pr', 'Kak {nama} {slot}'), /tidak dikenal/);
  assert.throws(() => env.call('_rmdVarCheck_', 'spam', 'x'), /tidak dikenal/);
});

test('clients are greeted by first name, and a "Kak" already in the sheet is not doubled', () => {
  const env = seededEnv();
  assert.equal(env.call('_rmdSapa_', 'Rina Wulandari'), 'Rina');
  assert.equal(env.call('_rmdSapa_', 'Kak Rina'), 'Rina');
  assert.equal(env.call('_rmdSapa_', '  '), '');
  assert.equal(env.call('_rmdFill_', 'Halo Kak {nama}, hai.', { nama: 'Kak Rina Wulandari' }), 'Halo Kak Rina, hai.');
});

test('the picker changes every day, walks the whole list before repeating, and differs between clients', () => {
  const env = seededEnv();
  const pool = V(env);
  const pick = (iso, key) => env.call('_rmdVariant_', pool, 'hidup-sehat', iso, key, {});
  assert.ok(pool['hidup-sehat'].weekend.includes(pick('2026-10-03', '6281')));   // Saturday
  assert.ok(pool['hidup-sehat'].weekday.includes(pick('2026-10-05', '6281')));   // Monday
  // 44 weekdays in a row (no holiday, no Ramadan): every weekday text once
  const seen = new Set();
  let d = new Date(Date.UTC(2026, 9, 5));
  while (seen.size < 44 && d < new Date(Date.UTC(2026, 11, 20))) {
    const iso = d.toISOString().slice(0, 10), dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) { const t = pick(iso, '6281'); assert.ok(!seen.has(t), 'repeat on ' + iso); seen.add(t); }
    d = new Date(d.getTime() + 86400000);
  }
  assert.equal(seen.size, 44);
  assert.notEqual(pick('2026-10-06', '6281'), pick('2026-10-07', '6281'));
  assert.notEqual(pick('2026-10-06', '6281111111111'), pick('2026-10-06', '6282222222222'));
});

test('holidays and Ramadan switch to their own texts; booking for a finished package asks to renew', () => {
  const env = seededEnv();
  const pool = V(env);
  const v = (j, iso, opts) => env.call('_rmdVariant_', pool, j, iso, '6281', opts || {});
  assert.ok(pool.libur.natal.includes(v('hidup-sehat', '2026-12-25')));
  assert.ok(pool.libur['idul-fitri'].includes(v('hidup-sehat', '2027-03-10')));
  assert.ok(pool['ramadan-hidup-sehat'].semua.includes(v('hidup-sehat', '2027-02-20')));
  assert.ok(pool['ramadan-makan-pagi'].semua.includes(v('makan-pagi', '2027-02-20')));
  assert.ok(pool['ramadan-makan-sore'].semua.includes(v('makan-sore', '2027-02-20')));
  assert.ok(pool['sesi-besok-banyak'].semua.includes(v('sesi-besok', '2026-10-06', { banyak: true })));
  assert.ok(pool['pr-banyak'].semua.includes(v('pr', '2026-10-06', { banyak: true })));
  assert.ok(pool['booking-habis'].semua.includes(v('booking-minggu', '2026-10-06', { habis: true })));
  assert.equal(env.call('_rmdIsRamadan_', '2026-10-06'), false);
});

test('one personal line at most: kangen, then sessions left, then streak', () => {
  const env = seededEnv();
  const pool = V(env);
  const line = (client, act, opts) => env.call('_rmdPersonalLine_', pool, client, '2026-10-06', act, opts || {});
  const c = { id: 'PT-A', name: 'Ani', phone: '6281', remaining: 2 };
  assert.match(line(c, { 'PT-A': { last: '2026-09-01', weeks: {} } }), /^\n\n/);
  assert.ok(pool['personal-kangen'].semua.some(t => line(c, { 'PT-A': { last: '2026-09-01', weeks: {} } }) === '\n\n' + t));
  assert.match(line(c, {}), /\b2\b/);                                                     // sisa 2
  assert.equal(line(Object.assign({}, c, { remaining: 5 }), {}), '');
  const weeks = { '2026-09-21': true, '2026-09-28': true, '2026-10-05': true };
  assert.match(line(Object.assign({}, c, { remaining: 5 }), { 'PT-A': { last: '2026-10-05', weeks } }), /\b3\b/);
  assert.match(line(c, { 'PT-A': { last: '2026-09-01', weeks: {} } }, { noKangen: true }), /\b2\b/);
});

test('the PesanVariasi sheet is seeded once, edited rows are used, bad rows are skipped', () => {
  const env = seededEnv();
  const n = env.call('_rmdSeedVariasi_');
  assert.ok(n > 372);
  assert.equal(env.call('_rmdSeedVariasi_'), 0);
  const rows = env.sheet('PesanVariasi').rows;
  assert.deepEqual(Array.from(rows[0]), ['Jenis', 'Hari', 'Teks', 'Aktif']);
  env.ss.seed('PesanVariasi', [rows[0], ['hidup-sehat', 'weekday', 'Pagi Kak {nama}!\nTeks dari sheet.', 'ya'], ['hidup-sehat', 'weekday', 'Kak {nama} {slot}', 'ya'], ['hidup-sehat', 'weekend', 'Mati', 'tidak']]);
  const pool = env.call('_rmdVariantPool_');
  assert.deepEqual(Array.from(pool['hidup-sehat'].weekday), ['Pagi Kak {nama}!\nTeks dari sheet.']);
  assert.equal(pool['hidup-sehat'].weekend, undefined);
  assert.ok(pool['makan-pagi'].weekday.length === 44);                         // missing keys fall back to the built-in texts
  env.callRaw('sendHidupSehatDigest_', ctx(env));
  assert.equal(waText(buttons(env)[0]), 'Pagi Kak Ani!\nTeks dari sheet.');
});

test('makan works without MealTips, goes to every client including finished packages, and is on by default', () => {
  const env = seededEnv();
  env.memberRow('PT-A')[9] = env.memberRow('PT-A')[8];        // PT-A used all sessions
  assert.equal(env.callRaw('sendMakanPagiDigest_', ctx(env)), true);
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Ani Anggraini', 'Budi', 'Citra']);
  assert.ok(!waText(bs[0]).includes('💡') && !waText(bs[0]).includes('{'));
  const r = env.call('getAppSettings', env.adminToken()).reminder;
  assert.equal(r.jobs['makan-pagi'].enabled, true);
  assert.equal(r.jobs['makan-sore'].enabled, true);
});

test('booking-minggu: a finished package gets a renew text without the slot list', () => {
  const env = seededEnv();
  env.ss.seed('Schedules', [SCHEDULE_HEADERS]);
  env.memberRow('PT-A')[9] = env.memberRow('PT-A')[8];
  env.callRaw('sendBookingMingguDigest_', ctx(env));
  const a = buttons(env).find(b => b.text.startsWith('Ani'));
  assert.equal(a.text, 'Ani Anggraini · paket habis');
  assert.ok(!waText(a).includes('•') && /Kak Ani\b/.test(waText(a)), waText(a));
});
