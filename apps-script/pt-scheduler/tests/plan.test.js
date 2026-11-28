'use strict';
// Fase AF (docs/plan/): paket coach Starter / Pro / Studio. XNK HQ mengirim paket lewat hubPlan(HUB_SECRET, plan);
// server ini menegakkan fitur (gerbang doPost) dan batas klien / coach. Produksi tanpa HUB_SECRET tidak pernah dibatasi.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./api-lists');
const { seededEnv } = require('./fixtures');
const harga = require('../../xnk-library/tools/hub-harga.js');

const SECRET = 'h'.repeat(40);
const post = (env, fn, args) => JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify({ fn, args: args || [] }) } }).content);
const hubEnv = () => { const env = seededEnv(); env.props.HUB_SECRET = SECRET; return env; };
const newClient = (env, tok, n) => env.call('addMember', tok, { name: 'Klien ' + n, phone: '62812000000' + String(n).padStart(2, '0'), goal: 'x', packageId: 'P1' });

test('paket: setiap fungsi di PLAN_FN ada di API, sekali saja', () => {
  const env = seededEnv();
  const seen = new Set();
  for (const [f, fns] of Object.entries(env.context.PLAN_FN)) {
    assert.ok(env.context.PLAN_FEATURES.includes(f), f);
    for (const n of fns) { assert.ok(L.API_FUNCTIONS.includes(n), n + ' bukan fungsi API'); assert.ok(!seen.has(n), n + ' dua kali'); seen.add(n); }
  }
});

test('paket: isi Starter/Pro/Studio sama dengan tabel di halaman depan (hub-harga.js)', () => {
  const T = seededEnv().context.PLAN_TIERS;
  const row = name => { for (const [, rows] of harga.COMPARE) for (const r of rows) if (r[0] === name) return r.slice(1); throw new Error(name); };
  const keys = ['starter', 'pro', 'studio'];
  const check = (name, f) => row(name).forEach((v, i) => assert.equal(T[keys[i]].features.includes(f), v === true, name + ' / ' + keys[i]));
  check('Keuangan: tagihan, pembayaran, laporan, CSV', 'finance');
  check('Gizi: target kalori, menu, catat makan', 'nutrition');
  check('Laporan PDF progres klien', 'report');
  check('Program latihan otomatis', 'programAuto');
  check('Template program & Jelajahi', 'templates');
  check('Kartu bagikan untuk Instagram', 'share');
  check('Info & tips untuk klien', 'content');
  check('Foto progres privat, rapor tubuh, badge', 'photos');
  check('Asesmen & tes kebugaran', 'care');
  check('Banyak coach, klien pilih coach', 'multiCoach');
  check('Kelas grup & bagi hasil coach', 'classes');
  check('Kelas grup & bagi hasil coach', 'coachShare');
  assert.deepEqual(keys.map(k => T[k].clients), [Number(row('Klien aktif')[0]), 0, 0]);
  assert.deepEqual(keys.map(k => T[k].coaches), [1, 1, 5]);
});

test('paket: produksi tanpa HUB_SECRET tidak pernah dibatasi', () => {
  const env = seededEnv();
  assert.throws(() => env.call('hubPlan', SECRET, { tier: 'starter' }), /Permintaan tidak valid/);
  env.props.XNK_PLAN = JSON.stringify({ tier: 'starter' });
  assert.equal(env.call('_plan_'), null);
  const tok = env.adminToken();
  assert.equal(env.call('getAdminBootstrap', tok).plan, null);
  assert.notEqual(post(env, 'getFinancePage', [tok]).code, 'plan');
});

test('paket: Starter menolak fitur Pro di doPost, Pro mengizinkan, pengecualian menang', () => {
  const env = hubEnv(), tok = env.adminToken();
  env.call('hubPlan', SECRET, { tier: 'starter' });
  assert.equal(post(env, 'getFinancePage', [tok]).code, 'plan');
  assert.equal(post(env, 'getMemberReport', [tok, 'PT-A']).code, 'plan');
  assert.notEqual(post(env, 'getAdminBootstrap', [tok]).code, 'plan');
  env.call('hubPlan', SECRET, { tier: 'starter', add: ['finance'] });
  assert.notEqual(post(env, 'getFinancePage', [tok]).code, 'plan');
  env.call('hubPlan', SECRET, { tier: 'pro', off: ['report'] });
  assert.notEqual(post(env, 'getFinancePage', [tok]).code, 'plan');
  assert.equal(post(env, 'getMemberReport', [tok, 'PT-A']).code, 'plan');
  // Lifetime: daftar fitur beku menang atas isi paket.
  env.call('hubPlan', SECRET, { tier: 'pro', features: ['finance'] });
  assert.deepEqual(env.call('_planOn_', env.call('_plan_')), ['finance']);
});

test('paket: masa peringatan — sebelum enforceFrom tidak ada yang ditolak', () => {
  const env = hubEnv(), tok = env.adminToken();
  env.call('hubPlan', SECRET, { tier: 'starter', enforceFrom: '2999-01-01' });
  assert.notEqual(post(env, 'getFinancePage', [tok]).code, 'plan');
  const b = env.call('getAdminBootstrap', tok).plan;
  assert.equal(b.enforced, false);
  assert.equal(b.enforceFrom, '2999-01-01');
});

test('paket: batas klien aktif — klien baru ditolak, perpanjang klien aktif tetap boleh', () => {
  const env = hubEnv(), tok = env.adminToken();
  env.call('hubPlan', SECRET, { tier: 'starter', limits: { clients: 4 } });
  assert.equal(env.call('getAdminBootstrap', tok).plan.clients.used, 3);
  newClient(env, tok, 1);
  assert.throws(() => newClient(env, tok, 2), /Batas klien aktif/);
  // Perpanjang klien yang masih aktif (PT-A sisa 5 sesi) tidak menambah hitungan.
  assert.doesNotThrow(() => env.call('addMember', tok, { name: 'Ani Anggraini', phone: '6281111111111', goal: 'x', packageId: 'P1' }));
  // Klien yang sisa sesinya habis dan tanpa booking tidak dihitung.
  const row = env.memberRow('PT-C'); row[9] = 10;
  assert.doesNotThrow(() => newClient(env, tok, 3));
});

test('paket: pendaftaran mandiri saat penuh — pesan sopan, tanpa akun', () => {
  const env = hubEnv();
  env.call('hubPlan', SECRET, { tier: 'starter', limits: { clients: 3 } });
  const before = env.sheet('MemberData').rows.length;
  assert.throws(() => env.call('registerNewClient', { name: 'Dewi', phone: '6285555555555', packageId: 'P1' }), /Coach sedang penuh/);
  assert.equal(env.sheet('MemberData').rows.length, before);
});

test('paket: batas coach — coach aktif ke-2 ditolak di Starter, boleh di Studio', () => {
  const env = hubEnv(), tok = env.adminToken();
  env.call('hubPlan', SECRET, { tier: 'starter' });
  assert.throws(() => env.call('saveCoach', tok, { name: 'Coach Dua', phone: '6281234567890' }), /Batas coach/);
  env.call('hubPlan', SECRET, { tier: 'studio' });
  assert.doesNotThrow(() => env.call('saveCoach', tok, { name: 'Coach Dua', phone: '6281234567890' }));
});

test('paket: Starter hanya pengingat dasar', () => {
  const env = hubEnv();
  env.call('hubPlan', SECRET, { tier: 'starter' });
  assert.equal(env.call('_rmdIsOff_', {}, 'sesi-besok'), false);
  assert.equal(env.call('_rmdIsOff_', {}, 'booking-minggu'), false);
  assert.equal(env.call('_rmdIsOff_', {}, 'makan-pagi'), true);
  env.call('hubPlan', SECRET, { tier: 'pro' });
  assert.equal(env.call('_rmdIsOff_', {}, 'makan-pagi'), false);
});

test('paket: hubPlan gratis menghapus batas; isian dibersihkan', () => {
  const env = hubEnv();
  env.call('hubPlan', SECRET, { tier: 'pro', add: ['classes', 'bukan-fitur'], limits: { clients: '25' }, upgradeWa: '+62 812-3' });
  const p = JSON.parse(env.props.XNK_PLAN);
  assert.deepEqual(p.add, ['classes']);
  assert.equal(p.limits.clients, 25);
  assert.equal(p.upgradeWa, '628123');
  assert.throws(() => env.call('hubPlan', SECRET, { tier: 'emas' }), /Paket tidak dikenal/);
  env.call('hubPlan', SECRET, { tier: 'gratis' });
  assert.equal(env.props.XNK_PLAN, undefined);
  assert.equal(env.call('hubStatus', SECRET).plan, null);
});
