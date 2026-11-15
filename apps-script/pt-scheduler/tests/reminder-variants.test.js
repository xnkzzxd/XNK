'use strict';
// Daily-changing client reminder texts (PesanVariasi): tone, day groups, tags, meal context, sheet upgrade.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runInContext } = require('node:vm');
const { seededEnv, SCHEDULE_HEADERS } = require('./fixtures');

const NOW_ISO = '2026-09-30T12:00:00Z';   // Wednesday
const at = (env, iso) => ({ now: runInContext("new Date('" + iso + "')", env.context) });
const ctx = env => at(env, NOW_ISO);
const messages = env => env.fetches.map(f => JSON.parse(f.options.payload));
const buttons = env => messages(env).flatMap(m => (m.reply_markup ? m.reply_markup.inline_keyboard.map(r => r[0]) : []));
const waText = b => decodeURIComponent(new URL(b.url).searchParams.get('text'));
const V = env => runInContext('RMD_VARIANTS_DEFAULT', env.context);
const T = e => (typeof e === 'string' ? e : e.t);
const texts = list => Array.from(list).map(T);
const JENIS = ['hidup-sehat', 'makan-pagi', 'makan-sore', 'sesi-besok', 'pr', 'booking-minggu'];
const DAY_GROUPS = { weekday: 30, senin: 8, jumat: 8, sabtu: 10, minggu: 10, weekend: 10 };   // hidup-sehat, makan-pagi, makan-sore
const NEED = { 'sesi-besok': ['{jam}', '{coach}', '{tidur}'], 'pr': ['{pr}'], 'booking-minggu': ['{slot}'], 'makan-pagi': ['{tip}'], 'makan-sore': ['{tip}'] };
const BANNED = /\b(aku|kamu|nggak|udah|banget)\b|no excuse|deal\?|kalap|rebahan|good (morning|evening)|see you|weekend|jangan sampai/i;
const EMOJI = /\p{Extended_Pictographic}/gu;
const TAGS = ['turun', 'naik', 'jaga', 'recomp', 'telur', 'seafood', 'kacang', 'susu', 'mahal', 'porsi'];
const SUMBER = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'reminder', 'Sumber.md'), 'utf8');

test('daily types have their day groups, and every text is valid, greets "Kak {nama}" and carries its data', () => {
  const env = seededEnv();
  const all = V(env);
  JENIS.forEach(j => {
    const groups = ['hidup-sehat', 'makan-pagi', 'makan-sore'].includes(j) ? DAY_GROUPS : { weekday: 44, weekend: 18 };
    assert.deepEqual(Object.keys(all[j]).sort(), Object.keys(groups).sort(), j);
    Object.keys(groups).forEach(g => assert.equal(all[j][g].length, groups[g], j + '/' + g));
    const list = [].concat(...Object.keys(groups).map(g => texts(all[j][g])));
    assert.equal(new Set(list.map(t => t.toLowerCase().trim())).size, list.length, j + ' has duplicates');
    list.forEach(t => {
      assert.equal(env.call('_rmdVarCheck_', j, t), t.trim());
      assert.ok(t.includes('Kak {nama}'), j + ': ' + t);
      (NEED[j] || []).forEach(p => assert.ok(t.includes(p), j + ' needs ' + p + ': ' + t));
      assert.ok(t.includes('\n'), j + ' should be several short lines: ' + t);
    });
  });
});

test('tone: "saya" voice, Indonesian only, no scolding, at most one emoji, 2–5 lines', () => {
  const env = seededEnv();
  const all = V(env);
  Object.keys(all).forEach(key => Object.keys(all[key]).forEach(hari => texts(all[key][hari]).forEach(t => {
    assert.ok(!BANNED.test(t), key + ': "' + (t.match(BANNED) || [])[0] + '" in ' + t);
    assert.ok((t.match(EMOJI) || []).length <= 1, key + ' has more than one emoji: ' + t);
    const lines = t.split('\n').length;
    if (!/^personal-/.test(key) && !/\{pr\}|\{slot\}/.test(t)) assert.ok(lines >= 2 && lines <= 5, key + ' has ' + lines + ' lines: ' + t);
  })));
});

test('every extra set is valid and unique; tags are known and every science tip has its source in docs/reminder/Sumber.md', () => {
  const env = seededEnv();
  const all = V(env);
  let withSrc = 0;
  Object.keys(all).forEach(key => {
    Object.keys(all[key]).forEach(hari => {
      const list = Array.from(all[key][hari]);
      assert.ok(list.length > 0, key + '/' + hari);
      assert.equal(new Set(list.map(T)).size, list.length, key + '/' + hari + ' has duplicates');
      list.forEach(e => {
        env.call('_rmdVarCheck_', key, T(e));
        if (typeof e === 'string') return;
        String(e.tag || '').split(',').filter(String).forEach(tag => assert.ok(TAGS.includes(tag), key + ' unknown tag ' + tag));
        if (e.src) { withSrc++; assert.ok(new RegExp('^\\| ' + e.src + ' \\|', 'm').test(SUMBER), key + ': ' + e.src + ' is not in Sumber.md'); }
      });
    });
  });
  assert.ok(withSrc >= 30, 'science tips: ' + withSrc);
  ['makan-pagi-latihan', 'makan-pagi-pulih', 'makan-sore-latihan', 'makan-cek'].forEach(k => assert.equal(all[k].semua.length, 12, k));
  ['makan-pagi-baru', 'makan-sore-baru'].forEach(k => assert.equal(all[k].semua.length, 14, k));
  texts(all['makan-pagi-latihan'].semua).forEach(t => assert.ok(t.includes('{jam}'), t));
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

test('day groups: Senin, Jumat, Sabtu and Minggu have their own texts; a tanggal merah on a weekday reads like a day off', () => {
  const env = seededEnv();
  const pool = V(env);
  const pick = (j, iso, key) => env.call('_rmdVariant_', pool, j, iso, key || '6281', {});
  const inGroup = (j, g, iso) => assert.ok(texts(pool[j][g]).includes(pick(j, iso)), j + ' ' + iso + ' should use ' + g);
  ['hidup-sehat', 'makan-pagi', 'makan-sore'].forEach(j => {
    inGroup(j, 'senin', '2026-10-05');
    inGroup(j, 'weekday', '2026-10-06');
    inGroup(j, 'weekday', '2026-10-08');
    inGroup(j, 'jumat', '2026-10-09');
    inGroup(j, 'sabtu', '2026-10-03');
    inGroup(j, 'minggu', '2026-10-04');
    inGroup(j, 'weekend', '2027-05-06');                                   // Kenaikan Yesus Kristus, a Thursday
  });
  inGroup('sesi-besok', 'weekday', '2026-10-05');                          // no senin texts → weekday
  inGroup('sesi-besok', 'weekend', '2026-10-04');
  inGroup('sesi-besok', 'weekend', '2027-05-06');
  assert.notEqual(pick('hidup-sehat', '2026-10-06'), pick('hidup-sehat', '2026-10-07'));
  assert.notEqual(pick('hidup-sehat', '2026-10-06', '6281111111111'), pick('hidup-sehat', '2026-10-06', '6282222222222'));
});

test('the picker walks a whole list before repeating (30 Selasa–Kamis texts, 44 Senin–Jumat texts)', () => {
  const env = seededEnv();
  const pool = V(env);
  const walk = (j, days, want) => {
    const seen = new Set();
    let d = new Date(Date.UTC(2026, 9, 5));
    while (seen.size < want && d < new Date(Date.UTC(2026, 11, 24))) {
      const iso = d.toISOString().slice(0, 10);
      if (days.includes(d.getUTCDay())) {
        const t = env.call('_rmdVariant_', pool, j, iso, '6281', {});
        assert.ok(!seen.has(t), j + ' repeats on ' + iso); seen.add(t);
      }
      d = new Date(d.getTime() + 86400000);
    }
    assert.equal(seen.size, want, j);
  };
  walk('hidup-sehat', [2, 3, 4], 30);
  walk('sesi-besok', [1, 2, 3, 4, 5], 44);
});

test('a sheet that only has weekday / weekend rows keeps working on every day', () => {
  const env = seededEnv();
  const pool = { 'hidup-sehat': { weekday: ['Pagi Kak {nama}.\nHari kerja.'], weekend: ['Pagi Kak {nama}.\nAkhir pekan.'] } };
  const pick = iso => env.call('_rmdVariant_', pool, 'hidup-sehat', iso, '6281', {});
  assert.match(pick('2026-10-05'), /Hari kerja/);                           // Senin
  assert.match(pick('2026-10-09'), /Hari kerja/);                           // Jumat
  assert.match(pick('2026-10-03'), /Akhir pekan/);
  assert.match(pick('2026-10-04'), /Akhir pekan/);
});

test('holidays and Ramadan switch to their own texts; booking for a finished package asks to renew', () => {
  const env = seededEnv();
  const pool = V(env);
  const v = (j, iso, opts) => env.call('_rmdVariant_', pool, j, iso, '6281', opts || {});
  assert.ok(texts(pool.libur.natal).includes(v('hidup-sehat', '2026-12-25')));
  assert.ok(texts(pool.libur['idul-fitri']).includes(v('hidup-sehat', '2027-03-10')));
  assert.ok(texts(pool['ramadan-hidup-sehat'].semua).includes(v('hidup-sehat', '2027-02-20')));
  assert.ok(texts(pool['ramadan-makan-pagi'].semua).includes(v('makan-pagi', '2027-02-20')));
  assert.ok(texts(pool['ramadan-makan-sore'].semua).includes(v('makan-sore', '2027-02-20')));
  assert.ok(texts(pool['sesi-besok-banyak'].semua).includes(v('sesi-besok', '2026-10-06', { banyak: true })));
  assert.ok(texts(pool['pr-banyak'].semua).includes(v('pr', '2026-10-06', { banyak: true })));
  assert.ok(texts(pool['booking-habis'].semua).includes(v('booking-minggu', '2026-10-06', { habis: true })));
  assert.equal(env.call('_rmdIsRamadan_', '2026-10-06'), false);
});

test('tags: pantangan, goal, budget and care flags decide which texts a client can get', () => {
  const env = seededEnv();
  const ok = (tags, profil) => env.call('_rmdTagOk_', tags, profil);
  assert.equal(ok(['telur'], { pantang: ['telur'] }), false);
  assert.equal(ok(['telur'], { pantang: ['susu'] }), true);
  assert.equal(ok(['susu'], { pantang: ['laktosa'] }), false);
  assert.equal(ok(['turun'], { goal: 'turun' }), true);
  assert.equal(ok(['turun'], { goal: 'naik' }), false);
  assert.equal(ok(['turun'], {}), false);                                   // no goal known → only untagged goal texts
  assert.equal(ok(['naik', 'recomp'], { goal: 'recomp' }), true);
  assert.equal(ok(['mahal'], { hemat: true }), false);
  assert.equal(ok(['porsi'], { hatiHati: true }), false);
  assert.equal(ok([], { goal: 'turun', hemat: true, pantang: ['telur'], hatiHati: true }), true);

  // Over two months no egg text reaches a client who avoids egg, and no weight-loss text reaches a muscle-gain client.
  const pool = V(env);
  const tagged = tag => new Set([].concat(...['makan-pagi', 'makan-sore', 'makan-pagi-pulih', 'makan-sore-latihan'].map(k =>
    [].concat(...Object.keys(pool[k]).map(g => Array.from(pool[k][g]).filter(e => typeof e !== 'string' && String(e.tag || '').split(',').includes(tag)).map(T))))));
  const egg = tagged('telur'), turun = tagged('turun');
  assert.ok(egg.size >= 8 && turun.size >= 3);
  const profil = { goal: 'naik', pantang: ['telur'] };
  let sawEggForOthers = false;
  for (let i = 0; i < 60; i++) {
    const iso = new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);
    ['makan-pagi', 'makan-sore'].forEach(j => {
      const t = env.call('_rmdVariant_', pool, j, iso, '6281', { profil });
      assert.ok(!egg.has(t) && !turun.has(t), iso + ' ' + j + ': ' + t);
      if (egg.has(env.call('_rmdVariant_', pool, j, iso, '6281', { profil: {} }))) sawEggForOthers = true;
    });
  }
  assert.ok(sawEggForOthers, 'egg texts still reach clients without the pantangan');
  // Nothing fits → the untagged texts are used.
  const tiny = { 'makan-pagi': { weekday: [{ t: 'Kak {nama}\ntelur', tag: 'telur' }, 'Kak {nama}\nnetral'] } };
  assert.equal(env.call('_rmdVariant_', tiny, 'makan-pagi', '2026-10-06', '6281', { profil: { pantang: ['telur'] } }), 'Kak {nama}\nnetral');
});

test('meal texts follow the client: session today, session yesterday, first 14 days, Wednesday check-in; Ramadan still wins', () => {
  const env = seededEnv();
  const pool = V(env);
  const v = (j, iso, opts) => env.call('_rmdVariant_', pool, j, iso, '6281', opts);
  assert.ok(texts(pool['makan-pagi-latihan'].semua).includes(v('makan-pagi', '2026-10-06', { sesi: 'latihan' })));
  assert.ok(texts(pool['makan-pagi-pulih'].semua).includes(v('makan-pagi', '2026-10-06', { sesi: 'pulih' })));
  assert.ok(texts(pool['makan-sore-latihan'].semua).includes(v('makan-sore', '2026-10-06', { sesi: 'latihan' })));
  assert.ok(texts(pool['makan-sore'].weekday).includes(v('makan-sore', '2026-10-06', { sesi: 'pulih' })));   // no such set for sore → normal text
  assert.equal(v('makan-pagi', '2026-10-06', { baruHari: 3, sesi: 'latihan' }), T(pool['makan-pagi-baru'].semua[2]));
  assert.equal(v('makan-sore', '2026-10-06', { baruHari: 14 }), T(pool['makan-sore-baru'].semua[13]));
  assert.ok(texts(pool['makan-cek'].semua).includes(v('makan-sore', '2026-10-07', { cek: true, baruHari: 3, sesi: 'latihan' })));
  assert.ok(texts(pool['ramadan-makan-sore'].semua).includes(v('makan-sore', '2027-02-24', { cek: true, baruHari: 3, sesi: 'latihan' })));

  const sched = [
    { memberId: 'PT-A', status: 'read', start: '2026-10-06T10:00:00Z' },        // 17:00 WIB today
    { memberId: 'PT-A', status: 'read', start: '2026-10-06T00:00:00Z' },        // 07:00 WIB today (earlier)
    { memberId: 'PT-B', status: 'completed', start: '2026-10-05T03:00:00Z' },   // done yesterday
    { memberId: 'PT-C', status: 'cancelled', start: '2026-10-06T03:00:00Z' },
    { memberId: 'PT-C', status: 'read', start: '2026-10-05T03:00:00Z' }         // yesterday but not completed
  ];
  const s = env.call('_rmdSesiCtx_', sched, '2026-10-06');
  assert.deepEqual(JSON.parse(JSON.stringify(s)), { 'PT-A': { today: '07:00', doneYesterday: false }, 'PT-B': { today: '', doneYesterday: true } });
  const text = env.call('_rmdClientText_', pool, 'makan-pagi', '2026-10-06', { id: 'PT-A', name: 'Ani', phone: '6281', remaining: 5 }, { tip: '', jam: '07:00' }, null, { sesi: 'latihan' });
  assert.match(text, /Kak Ani\b/);
  assert.ok(text.includes('07:00') && !text.includes('{'), text);
});

test('rhythm: new clients get pagi and sore for 14 days, then one meal message a day; Wednesday is the sore check-in', () => {
  const env = seededEnv();
  const turn = (c, iso, w) => env.call('_rmdMakanTurn_', c, iso, w);
  assert.equal(env.call('_rmdJoinIso_', '25/9/2026'), '2026-09-25');
  assert.equal(env.call('_rmdJoinIso_', '2026-09-25T00:00:00.000Z'), '2026-09-25');
  assert.equal(env.call('_rmdJoinIso_', 'entah'), '');
  assert.equal(env.call('_rmdNewDay_', '2026-09-25', '2026-09-25'), 1);
  assert.equal(env.call('_rmdNewDay_', '2026-09-25', '2026-10-08'), 14);
  assert.equal(env.call('_rmdNewDay_', '2026-09-25', '2026-10-09'), 0);
  assert.equal(env.call('_rmdNewDay_', '', '2026-10-09'), 0);
  const baru = { phone: '6281', join: '2026-10-01' }, lama = { phone: '6281', join: '2026-01-01' };
  ['2026-10-05', '2026-10-07', '2026-10-10'].forEach(iso => assert.ok(turn(baru, iso, 'pagi') && turn(baru, iso, 'sore'), iso));
  let pagi = 0;
  for (let i = 0; i < 14; i++) {
    const iso = new Date(Date.UTC(2026, 10, 2) + i * 86400000).toISOString().slice(0, 10);
    const p = turn(lama, iso, 'pagi'), s = turn(lama, iso, 'sore');
    assert.notEqual(p, s, iso + ': exactly one of pagi / sore');
    if (new Date(iso + 'T00:00:00Z').getUTCDay() === 3) assert.equal(s, true, iso + ' is Rabu → sore');
    if (p) pagi++;
  }
  assert.ok(pagi >= 5 && pagi <= 8, 'pagi and sore alternate: ' + pagi);
});

test('one personal line at most: kangen, sessions left, thanks for the food log, streak, then a gentle invite on Senin / Kamis', () => {
  const env = seededEnv();
  const pool = V(env);
  const line = (client, act, opts, iso) => env.call('_rmdPersonalLine_', pool, client, iso || '2026-10-06', act, opts || {});
  const c = { id: 'PT-A', name: 'Ani', phone: '6281', remaining: 2 }, c5 = Object.assign({}, c, { remaining: 5 });
  const isOf = (key, l) => texts(pool[key].semua).some(t => l === '\n\n' + t);
  assert.ok(isOf('personal-kangen', line(c, { 'PT-A': { last: '2026-09-01', weeks: {} } }, { catat: 'ya' })));
  assert.match(line(c, {}, { catat: 'ya' }), /\b2\b/);                                     // sisa 2 before the food line
  assert.equal(line(c5, {}), '');
  const weeks = { '2026-09-21': true, '2026-09-28': true, '2026-10-05': true }, act = { 'PT-A': { last: '2026-10-05', weeks } };
  assert.match(line(c5, act), /\b3\b/);
  assert.ok(isOf('personal-catat', line(c5, act, { catat: 'ya' })));                      // thanks before the streak
  assert.match(line(c5, act, { catat: 'yuk' }, '2026-10-05'), /\b3\b/);                   // streak before the invite
  assert.ok(isOf('personal-catat-yuk', line(c5, {}, { catat: 'yuk' }, '2026-10-05')));    // Senin
  assert.ok(isOf('personal-catat-yuk', line(c5, {}, { catat: 'yuk' }, '2026-10-08')));    // Kamis
  assert.equal(line(c5, {}, { catat: 'yuk' }, '2026-10-06'), '');                         // other days: nothing
  assert.match(line(c, { 'PT-A': { last: '2026-09-01', weeks: {} } }, { noKangen: true }), /\b2\b/);
});

test('the PesanVariasi sheet is seeded once with Tag and Sumber, edited rows are used, bad rows are skipped', () => {
  const env = seededEnv();
  const n = env.call('_rmdSeedVariasi_');
  assert.ok(n > 600);
  assert.equal(env.call('_rmdSeedVariasi_'), 0);
  assert.equal(env.call('_rmdUpgradeVariasi_'), -1);                           // a fresh sheet is already the current version
  const rows = env.sheet('PesanVariasi').rows;
  assert.deepEqual(Array.from(rows[0]), ['Jenis', 'Hari', 'Teks', 'Aktif', 'Tag', 'Sumber']);
  assert.ok(rows.some(r => r[4] === 'telur') && rows.some(r => /^S\d\d$/.test(r[5])));
  env.ss.seed('PesanVariasi', [rows[0],
    ['hidup-sehat', 'weekday', 'Pagi Kak {nama}!\nTeks dari sheet.', 'ya', '', ''],
    ['hidup-sehat', 'weekday', 'Kak {nama} {slot}', 'ya', '', ''],
    ['hidup-sehat', 'weekday', 'Kak {nama}\ntag salah', 'ya', 'entah', ''],
    ['hidup-sehat', 'weekend', 'Mati', 'tidak', '', ''],
    ['makan-pagi', 'weekday', 'Kak {nama}\nTelur.{tip}', 'ya', 'Telur, turun', 'S07']]);
  const pool = env.call('_rmdVariantPool_');
  assert.deepEqual(Array.from(pool['hidup-sehat'].weekday), ['Pagi Kak {nama}!\nTeks dari sheet.']);
  assert.equal(pool['hidup-sehat'].weekend, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(pool['makan-pagi'].weekday)), [{ t: 'Kak {nama}\nTelur.{tip}', tag: 'telur,turun', src: 'S07' }]);
  assert.ok(pool['makan-sore'].weekday.length === 30);                         // missing keys fall back to the built-in texts
  env.callRaw('sendHidupSehatDigest_', ctx(env));
  assert.equal(waText(buttons(env)[0]), 'Pagi Kak Ani!\nTeks dari sheet.');
});

test('upgrade: old built-in rows are replaced once, rows the owner edited or added stay', () => {
  const env = seededEnv();
  const OLD = 'Pagi Kak {nama}! ☀️\nHari ini sempatkan cardio 20 menit ya.\nJalan cepat juga udah cukup.\nJangan lupa sarapan dan minum air putih.{personal}';
  const OLD2 = 'Kak {nama}, waktunya sahur. 🌙\nJangan lupa protein dan air putih yang cukup ya.{tip}{personal}';
  env.ss.seed('PesanVariasi', [['Jenis', 'Hari', 'Teks', 'Aktif'],
    ['hidup-sehat', 'weekday', OLD, 'ya'],
    ['hidup-sehat', 'weekday', OLD.replace('20 menit', '25 menit'), 'ya'],     // edited by the owner
    ['ramadan-makan-pagi', 'semua', OLD2.replace(/\n/g, '\r\n'), 'ya'],
    ['pr', 'weekend', 'Kak {nama}, PR buatan pemilik:\n{pr}', 'tidak']]);      // added by the owner, switched off
  assert.equal(env.call('_rmdSeedVariasi_'), 0);                               // the sheet has rows: no seeding
  assert.equal(env.call('_rmdUpgradeVariasi_'), 2);
  const rows = env.sheet('PesanVariasi').rows;
  assert.deepEqual(Array.from(rows[0]), ['Jenis', 'Hari', 'Teks', 'Aktif', 'Tag', 'Sumber']);
  const all = rows.map(r => r[2]);
  assert.ok(!all.includes(OLD) && !all.some(t => String(t).includes('waktunya sahur. 🌙\r')));
  assert.deepEqual(Array.from(rows[1]), ['hidup-sehat', 'weekday', OLD.replace('20 menit', '25 menit'), 'ya', '', '']);
  assert.deepEqual(Array.from(rows[2]), ['pr', 'weekend', 'Kak {nama}, PR buatan pemilik:\n{pr}', 'tidak', '', '']);
  const defaults = env.call('_rmdDefaultRows_').length;
  assert.equal(rows.length, 1 + 2 + defaults);
  assert.equal(env.props.RMD_VARIASI_VER, '2');
  assert.equal(env.call('_rmdUpgradeVariasi_'), -1);
  assert.equal(env.sheet('PesanVariasi').rows.length, 1 + 2 + defaults);
  const pool = env.call('_rmdVariantPool_');
  assert.equal(pool['hidup-sehat'].weekday.length, 31);                        // the owner's row + 30 new ones
  assert.equal(pool.pr.weekend.length, 18);                                    // the switched-off row is not used
});

test('makan digest: long-time clients get one message a day, new clients both, without MealTips; on by default', () => {
  const env = seededEnv();
  env.memberRow('PT-A')[9] = env.memberRow('PT-A')[8];        // PT-A used all sessions: still gets meal messages
  env.memberRow('PT-C')[4] = '28/9/2026';                     // Citra joined 3 days before Thursday 1 Oct
  const thu = '2026-10-01T03:00:00Z';
  assert.equal(env.callRaw('sendMakanPagiDigest_', at(env, thu)), true);
  const pagi = buttons(env).map(b => [b.text, waText(b)]);
  env.fetches.length = 0;
  env.callRaw('sendMakanSoreDigest_', at(env, thu));
  const sore = buttons(env).map(b => [b.text, waText(b)]);
  const names = l => l.map(x => x[0]);
  ['Ani Anggraini', 'Budi'].forEach(nm => assert.equal(names(pagi).includes(nm) + names(sore).includes(nm), 1, nm + ' gets exactly one'));
  assert.ok(names(pagi).includes('Citra') && names(sore).includes('Citra'));
  const pool = V(env), first = t => t.split('\n\n')[0];
  const fill = t => t.replace('{nama}', 'Citra').replace('{tip}', '').replace('{personal}', '');
  assert.equal(first(pagi.find(x => x[0] === 'Citra')[1]), first(fill(T(pool['makan-pagi-baru'].semua[3]))));   // day 4
  assert.equal(first(sore.find(x => x[0] === 'Citra')[1]), first(fill(T(pool['makan-sore-baru'].semua[3]))));
  pagi.concat(sore).forEach(x => assert.ok(!x[1].includes('💡') && !x[1].includes('{'), x[1]));
  const r = env.call('getAppSettings', env.adminToken()).reminder;
  assert.equal(r.jobs['makan-pagi'].enabled, true);
  assert.equal(r.jobs['makan-sore'].enabled, true);
});

test('makan digest on Rabu: long-time clients get only the sore check-in, which gives no advice', () => {
  const env = seededEnv();
  assert.equal(env.callRaw('sendMakanPagiDigest_', ctx(env)), true);
  assert.equal(buttons(env).length, 0);
  env.callRaw('sendMakanSoreDigest_', ctx(env));
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Ani Anggraini', 'Budi', 'Citra']);
  const cek = texts(V(env)['makan-cek'].semua).map(t => t.replace('{personal}', '').split('\n').slice(1).join('\n'));
  bs.forEach(b => assert.ok(cek.some(t => waText(b).includes(t)), waText(b)));
});

test('makan digest uses the schedule and the food log, and sends neither a goal nor a food name', () => {
  const env = seededEnv();
  const thu = '2026-10-01T03:00:00Z';                          // Kamis 10:00 WIB
  env.sheet('MemberData').rows.slice(1).forEach(r => { r[4] = '1/1/2026'; r[8] = 20; r[9] = 5; });   // long-time, plenty of sessions left
  env.ss.seed('Schedules', [SCHEDULE_HEADERS, ['SCH-T', 'PT-B', 'Budi', '6282222222222', '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z', '', 'read', 'C-1', 'Rizky', '', '']]);
  env.call('saveClientNutrition', env.adminToken(), 'PT-B', { tinggi: 170, jk: 'L', goal: 'turun', pantangan: ['telur'], anggaran: 'hemat' });
  env.call('saveClientNutrition', env.adminToken(), 'PT-A', { tinggi: 160, jk: 'P', goal: 'jaga', aktif: false });
  env.ss.seed('FoodLog', [['ID', 'Member ID', 'Tanggal', 'Waktu', 'Food ID', 'Nama', 'Gram', 'Porsi', 'Kal', 'Protein', 'Lemak', 'Karbo', 'Sumber', 'Dibuat Pada', 'CID'],
    ['FL-1', 'PT-B', '2026-09-30', 'pagi', '', 'Nasi rahasia', 100, '1 porsi', 180, 3, 0, 40, 'sendiri', '', '']]);
  assert.deepEqual(JSON.parse(JSON.stringify(env.callRaw('_nutBulkLogged_', '2026-09-30'))), { 'PT-B': true });
  const prof = JSON.parse(JSON.stringify(env.callRaw('_nutBulkProfile_')));
  assert.deepEqual(prof['PT-B'], { goal: 'turun', hemat: true, pantang: ['telur'], hatiHati: false });
  assert.equal(prof['PT-A'], undefined);                       // Gizi off for this client
  env.callRaw('sendMakanPagiDigest_', at(env, thu));
  env.callRaw('sendMakanSoreDigest_', at(env, thu));
  const budi = buttons(env).filter(b => b.text === 'Budi');
  assert.equal(budi.length, 1);
  const text = waText(budi[0]), pool = V(env);
  const latihan = texts(pool['makan-pagi-latihan'].semua).concat(texts(pool['makan-sore-latihan'].semua))
    .map(t => t.split('\n')[1].replace('{jam}', '17:00'));
  assert.ok(latihan.some(l => text.includes(l)), text);
  assert.ok(texts(pool['personal-catat'].semua).some(t => text.includes(t)), text);   // thanks for yesterday's log
  assert.ok(!/turun|hemat|Nasi rahasia|180/.test(text), text);
  const ani = buttons(env).find(b => b.text.startsWith('Ani'));
  assert.ok(!texts(pool['personal-catat'].semua).concat(texts(pool['personal-catat-yuk'].semua)).some(t => waText(ani).includes(t)));
  env.props.NUTRITION_ENABLED = 'false';
  assert.deepEqual(JSON.parse(JSON.stringify(env.callRaw('_nutBulkProfile_'))), {});
  assert.deepEqual(JSON.parse(JSON.stringify(env.callRaw('_nutBulkLogged_', '2026-09-30'))), {});
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
