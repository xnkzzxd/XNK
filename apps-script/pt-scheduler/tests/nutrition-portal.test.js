'use strict';
// Phase P / T-1012: the client's own nutrition (portal).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

function setup() {
  const env = seededEnv();
  const ani = env.memberToken(KEY_A), budi = env.memberToken(KEY_B), admin = env.adminToken();
  return { env, ani, budi, admin };
}
function ready(s) {
  s.env.call('saveMyMeasurement', s.ani, { berat: 70, pinggang: 80 });
  s.env.call('saveMyNutritionProfile', s.ani, { tinggi: '170', jk: 'P', goal: 'turun', pantangan: ['telur'], anggaran: 'hemat', birthDate: '1996-03-10' });
}

test('new client: target says what is missing; nothing is guessed', () => {
  const s = setup();
  const r = j(s.env.call('getMyNutrition', s.ani));
  assert.equal(r.enabled, true);
  assert.equal(r.target.ok, false);
  assert.ok(r.target.missingLabels.includes('Tinggi badan'));
  assert.equal(r.menu, null);
});

test('onboarding writes only the client\'s own row and then returns target and menu', () => {
  const s = setup();
  ready(s);
  const r = j(s.env.call('getMyNutrition', s.ani));
  assert.equal(r.target.ok, true);
  assert.equal(r.profile.anggaran, 'hemat');
  assert.deepEqual(r.profile.pantangan, ['telur']);
  assert.equal(r.menu.meals.length, 3);
  assert.ok(Math.abs(r.menu.totals.kal - r.target.kal) <= r.target.kal * 0.05);
  r.menu.meals.forEach(m => m.items.forEach(i => assert.ok(!/telur/i.test(i.n), 'telur leaked: ' + i.n)));
  const budi = j(s.env.call('getMyNutrition', s.budi));
  assert.equal(budi.profile.tinggi, '');
  assert.equal(s.env.memberRow('PT-B')[23] || '', '');
});

test('client cannot set coach-only fields or someone else\'s data; bad values are rejected', () => {
  const s = setup();
  ready(s);
  s.env.call('saveClientNutrition', s.admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'turun', pantangan: ['telur'], kondisi: ['hamil'], anggaran: 'hemat', aktif: true });
  // the client saves again: the coach's condition tag stays
  s.env.call('saveMyNutritionProfile', s.ani, { tinggi: '171', jk: 'P', goal: 'jaga', pantangan: [], anggaran: 'standar' });
  const admin = j(s.env.call('getClientNutrition', s.admin, 'PT-A'));
  assert.deepEqual(admin.profile.kondisi, ['hamil']);
  assert.equal(admin.profile.tinggi, 171);
  const mine = j(s.env.call('getMyNutrition', s.ani));
  assert.equal(JSON.stringify(mine).includes('hamil'), false);
  assert.ok(mine.target.warnings.includes('kondisi'));
  assert.equal('kondisi' in mine.profile, false);
  assert.equal('advice' in mine, false);
  assert.throws(() => s.env.call('saveMyNutritionProfile', s.ani, { tinggi: 20 }), /Tinggi badan harus antara/);
  assert.throws(() => s.env.call('saveMyNutritionProfile', s.ani, { goal: 'bulking' }), /Goal gizi tidak dikenal/);
  assert.throws(() => s.env.call('saveMyNutritionProfile', s.ani, { birthDate: '2999-01-01' }), /Tanggal lahir tidak valid/);
  assert.throws(() => s.env.call('saveMyNutritionProfile', 'bad', { tinggi: 170 }));
  assert.throws(() => s.env.call('getMyNutrition', s.admin));
});

test('an existing birth date is not overwritten by the client', () => {
  const s = setup();
  s.env.call('saveClientNotes', s.admin, 'PT-A', { flag: '', notes: '', birthDate: '1990-01-01' });
  s.env.call('saveMyNutritionProfile', s.ani, { tinggi: 170, jk: 'P', goal: 'jaga', birthDate: '2000-05-05' });
  assert.equal(j(s.env.call('getClientCare', s.admin, 'PT-A')).birthDate, '1990-01-01');
});

test('getPortalMore carries the client\'s nutrition including today\'s menu', () => {
  const s = setup();
  ready(s);
  const more = j(s.env.call('getPortalMore', s.ani));
  assert.equal(more.nutrition.enabled, true);
  assert.equal(more.nutrition.menu.meals.length, 3);
  assert.equal(JSON.stringify(more.nutrition).includes('PT-B'), false);
});

test('the switch and the per-client flag hide everything', () => {
  const s = setup();
  ready(s);
  s.env.props.NUTRITION_ENABLED = 'false';
  assert.deepEqual(j(s.env.call('getMyNutrition', s.ani)), { enabled: false });
  assert.throws(() => s.env.call('saveMyNutritionProfile', s.ani, { tinggi: 170 }), /dimatikan/);
  assert.deepEqual(j(s.env.call('getMyShopping', s.ani)), { enabled: false, groups: [] });
  delete s.env.props.NUTRITION_ENABLED;
  s.env.call('saveClientNutrition', s.admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'turun', aktif: false });
  assert.equal(j(s.env.call('getMyNutrition', s.ani)).enabled, false);
});

test('shopping list is built on demand for seven days', () => {
  const s = setup();
  ready(s);
  const r = j(s.env.call('getMyShopping', s.ani));
  assert.equal(r.enabled, true);
  assert.ok(r.groups.length >= 3);
  r.groups.forEach(g => g.items.forEach(i => assert.ok(i.gram > 0 && i.jumlah >= 1 && !/telur/i.test(i.n))));
  const none = j(s.env.call('getMyShopping', s.budi));
  assert.equal(none.enabled, false);
});

test('swap respects the client\'s restrictions and validates input', () => {
  const s = setup();
  ready(s);
  const menu = j(s.env.call('getMyNutrition', s.ani)).menu;
  const protein = menu.meals[0].items.find(i => i.slot === 'protein');
  const alts = j(s.env.call('swapMyMenuItem', s.ani, { id: protein.id, slot: 'protein', gram: protein.gram }, 'sarapan', 0));
  assert.ok(alts.length >= 1 && alts.length <= 3, 'restricted pools may offer fewer than three');
  alts.forEach(a => assert.ok(!/telur/i.test(a.n)));
  assert.throws(() => s.env.call('swapMyMenuItem', s.ani, { id: 'XX999', slot: 'protein', gram: 50 }, 'siang', 0), /Makanan tidak dikenal/);
  assert.throws(() => s.env.call('swapMyMenuItem', s.ani, { id: protein.id, slot: 'minuman', gram: 50 }, 'siang', 0), /Bagian menu/);
  assert.throws(() => s.env.call('swapMyMenuItem', s.ani, { id: protein.id, slot: 'protein', gram: -5 }, 'siang', 0), /Porsi tidak valid/);
});

test('admin answers and public answers do not change shape', () => {
  const s = setup();
  ready(s);
  const boot = JSON.stringify(s.env.call('getAdminBootstrap', s.admin));
  assert.ok(!/Goal Gizi|"nutrition"|pantangan/i.test(boot));
});

test('a client who does not want to share a birth date can type an age; the coach\'s age also counts', () => {
  const s = setup();
  s.env.call('saveMyMeasurement', s.ani, { berat: 70 });
  const r = j(s.env.call('saveMyNutritionProfile', s.ani, { tinggi: 170, jk: 'P', goal: 'jaga', umur: '27' }));
  assert.equal(r.target.ok, true);
  assert.equal(r.age, 27);
  assert.equal(r.profile.umur, 27);
  assert.throws(() => s.env.call('saveMyNutritionProfile', s.ani, { tinggi: 170, jk: 'P', goal: 'jaga', umur: 3 }), /Umur harus/);
  // a later save without an age keeps it
  assert.equal(j(s.env.call('saveMyNutritionProfile', s.ani, { tinggi: 171, jk: 'P', goal: 'jaga' })).age, 27);
  // coach-entered age is enough for a client who never opened the sheet
  s.env.call('saveMyMeasurement', s.budi, { berat: 80 });
  s.env.call('saveClientNutrition', s.admin, 'PT-B', { tinggi: 175, jk: 'L', goal: 'naik', umur: 25 });
  assert.equal(j(s.env.call('getMyNutrition', s.budi)).target.ok, true);
});
