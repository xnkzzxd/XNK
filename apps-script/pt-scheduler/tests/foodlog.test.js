'use strict';
// Phase P / T-1020: the client's daily food log.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
function setup() {
  const env = seededEnv();
  const s = { env, ani: env.memberToken(KEY_A), budi: env.memberToken(KEY_B), admin: env.adminToken() };
  s.log = (tok, e) => { env.context.CacheService.getScriptCache().remove('throttle_foodlog_' + (tok === s.ani ? 'PT-A' : 'PT-B')); return j(env.call('logMyFood', tok, e)); };
  return s;
}

test('log a TKPI food by gram or by household portion: numbers are copied from the table', () => {
  const s = setup();
  const r = s.log(s.ani, { waktu: 'sarapan', id: 'HR002', porsi: 2 });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].gram, 110);
  assert.equal(r.items[0].nama, 'Telur ayam ras');
  assert.equal(r.items[0].kal, Math.round(154 * 1.1));
  assert.equal(r.items[0].p, 13.6);
  assert.match(r.items[0].porsi, /^2 butir$/);
  const r2 = s.log(s.ani, { waktu: 'siang', id: 'AP001', gram: 250 });
  assert.equal(r2.items.length, 2);
  assert.equal(r2.totals.kal, r.items[0].kal + Math.round(180 * 2.5));
  const sheet = s.env.sheet('FoodLog').rows;
  assert.equal(sheet[0][1], 'Member ID');
  assert.equal(sheet[1][1], 'PT-A');
});

test('own food (from a label) is stored per portion times the amount', () => {
  const s = setup();
  const r = s.log(s.ani, { waktu: 'camilan', custom: { nama: 'Keripik singkong', kal: '150', p: '2', l: '8', k: '18' }, jumlah: 2 });
  assert.equal(r.items[0].kal, 300);
  assert.equal(r.items[0].sumber, 'sendiri');
  assert.equal(r.items[0].foodId, '');
});

test('validation: Indonesian messages, nothing written', () => {
  const s = setup();
  const bad = (e, re) => assert.throws(() => s.log(s.ani, e), re);
  bad({ waktu: 'subuh', id: 'AP001', gram: 100 }, /Pilih waktu makan/);
  bad({ waktu: 'siang', id: 'ZZ999', gram: 100 }, /Makanan tidak dikenal/);
  bad({ waktu: 'siang', id: 'AP001', gram: 0 }, /Porsi harus antara/);
  bad({ waktu: 'siang', id: 'AP001', gram: 99999 }, /Porsi harus antara/);
  bad({ waktu: 'siang', custom: { nama: '', kal: 10 } }, /Isi nama makanan/);
  bad({ waktu: 'siang', custom: { nama: 'x', kal: 99999 } }, /Kalori harus antara/);
  bad({ waktu: 'siang', custom: { nama: 'x', kal: 10, p: -1 } }, /Protein harus antara/);
  bad({ waktu: 'siang', id: 'AP001', gram: 100, tanggal: '2000-01-01' }, /Tanggal catatan tidak valid/);
  bad({ waktu: 'siang', id: 'AP001', gram: 100, tanggal: '2999-01-01' }, /Tanggal catatan tidak valid/);
  assert.equal(s.env.sheet('FoodLog') ? s.env.sheet('FoodLog').rows.length : 1, 1);
});

test('throttle, per-day cap and an off switch', () => {
  const s = setup();
  s.log(s.ani, { waktu: 'siang', id: 'AP001', gram: 100 });
  assert.throws(() => s.env.call('logMyFood', s.ani, { waktu: 'siang', id: 'AP001', gram: 100 }), /Terlalu cepat/);
  s.env.props.NUTRITION_ENABLED = 'false';
  assert.throws(() => s.log(s.ani, { waktu: 'siang', id: 'AP001', gram: 100 }), /dimatikan/);
  assert.deepEqual(j(s.env.call('getMyFoodLog', s.ani)), { enabled: false });
});

test('delete: own rows only; other client gets "tidak ditemukan"; the day is returned', () => {
  const s = setup();
  const r = s.log(s.ani, { waktu: 'siang', id: 'AP001', gram: 100 });
  s.log(s.budi, { waktu: 'siang', id: 'AP001', gram: 100 });
  assert.throws(() => s.env.call('deleteMyFood', s.budi, r.items[0].id), /Catatan tidak ditemukan/);
  const after = j(s.env.call('deleteMyFood', s.ani, r.items[0].id));
  assert.equal(after.items.length, 0);
  assert.equal(j(s.env.call('getMyFoodLog', s.budi)).items.length, 1);
  assert.throws(() => s.env.call('deleteMyFood', s.admin, r.items[0].id));
});

test('isolation: each client sees only their own log, also inside getPortalMore', () => {
  const s = setup();
  s.log(s.ani, { waktu: 'sarapan', id: 'HR002', gram: 55 });
  assert.equal(j(s.env.call('getMyFoodLog', s.budi)).items.length, 0);
  const more = j(s.env.call('getPortalMore', s.ani));
  assert.equal(more.nutrition.log.items.length, 1);
  const budi = JSON.stringify(j(s.env.call('getPortalMore', s.budi)).nutrition.log);
  assert.ok(!budi.includes('Telur'));
});

test('back-dated entries within 7 days land on that day', () => {
  const s = setup();
  const day = s.env.call('_addDaysIso_', s.env.call('_todayWib_'), -2);
  s.log(s.ani, { waktu: 'malam', id: 'AP001', gram: 100, tanggal: day });
  assert.equal(j(s.env.call('getMyFoodLog', s.ani)).items.length, 0);
  assert.equal(j(s.env.call('getMyFoodLog', s.ani, day)).items.length, 1);
});

test('copy yesterday: whole day or one meal, only once, with a clear message when empty', () => {
  const s = setup();
  const y = s.env.call('_addDaysIso_', s.env.call('_todayWib_'), -1);
  const copyOk = (...a) => { s.env.context.CacheService.getScriptCache().remove('throttle_foodcopy_PT-A'); return j(s.env.call('copyMyFoodYesterday', s.ani, ...a)); };
  assert.throws(() => copyOk(), /Kemarin belum ada catatan/);
  s.log(s.ani, { waktu: 'sarapan', id: 'HR002', gram: 55, tanggal: y });
  s.log(s.ani, { waktu: 'siang', id: 'AP001', gram: 200, tanggal: y });
  const r = copyOk('siang');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].waktu, 'siang');
  assert.equal(copyOk().items.length, 2);                 // only the missing meal (sarapan) is added
  assert.equal(copyOk().items.length, 2);                 // nothing doubles when copied again
  assert.throws(() => copyOk('subuh'), /Waktu makan tidak dikenal/);
});

test('favorites (2+ times) and recent come from the last 30 days', () => {
  const s = setup();
  const t = s.env.call('_todayWib_');
  s.log(s.ani, { waktu: 'sarapan', id: 'HR002', gram: 55, tanggal: s.env.call('_addDaysIso_', t, -3) });
  s.log(s.ani, { waktu: 'sarapan', id: 'HR002', gram: 55, tanggal: s.env.call('_addDaysIso_', t, -2) });
  s.log(s.ani, { waktu: 'siang', id: 'AP001', gram: 100, tanggal: s.env.call('_addDaysIso_', t, -1) });
  const r = j(s.env.call('getMyFoodLog', s.ani));
  assert.deepEqual(r.favorites.map(f => f.foodId), ['HR002']);
  assert.deepEqual(r.recent.map(f => f.foodId), ['AP001', 'HR002']);
});

test('admin sees seven days of one client; members and the bootstrap do not', () => {
  const s = setup();
  s.log(s.ani, { waktu: 'siang', id: 'AP001', gram: 100 });
  const a = j(s.env.call('getClientFoodLog', s.admin, 'PT-A'));
  assert.equal(a.days.length, 7);
  assert.equal(a.days[0].items.length, 1);
  assert.throws(() => s.env.call('getClientFoodLog', s.ani, 'PT-A'));
  assert.ok(!/FoodLog|Nasi/.test(JSON.stringify(s.env.call('getAdminBootstrap', s.admin))));
});
