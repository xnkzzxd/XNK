'use strict';
// Phase D3: renewal requests from the client portal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const setup = () => { const env = seededEnv(); return { env, ani: env.memberToken(KEY_A), budi: env.memberToken(KEY_B), admin: env.adminToken() }; };
const sheetRows = env => env.sheet('RenewalRequests').rows;

test('a client requests a renewal: it is recorded with the current price, the owner gets a Telegram notice, and WhatsApp text is returned', () => {
  const { env, ani } = setup();
  const res = env.call('requestRenewal', ani, 'P1');
  assert.equal(res.request.status, 'menunggu');
  assert.equal(res.request.packageName, 'Regular 8');
  assert.equal(res.request.harga, 800000);
  assert.match(res.text, /^Halo Coach, saya Ani Anggraini\. Saya mau perpanjang paket Regular 8 \(Rp\s?800\.000\)\.$/);
  const row = sheetRows(env)[1];
  assert.deepEqual([row[1], row[2], row[3], row[6]], ['PT-A', 'P1', 'menunggu', 800000]);
  const notice = env.fetches.map(f => JSON.parse(f.options.payload).text).find(t => t.includes('MINTA PERPANJANG'));
  assert.ok(notice && notice.includes('Ani Anggraini') && notice.includes('Regular 8'));
  assert.deepEqual(Array.from(sheetRows(env)[0]), ['ID', 'Member ID', 'Paket ID', 'Status', 'Dibuat Pada', 'Diputuskan Pada', 'Harga']);
});

test('only active packages can be requested', () => {
  const { env, ani } = setup();
  assert.throws(() => env.call('requestRenewal', ani, 'P3'), /tidak ditemukan atau sudah tidak aktif/);   // P3 is inactive
  assert.throws(() => env.call('requestRenewal', ani, 'NOPE'), /tidak ditemukan/);
  assert.throws(() => env.call('requestRenewal', ani, ''), /tidak ditemukan/);
  assert.equal(env.sheet('RenewalRequests'), null);
});

test('requests are throttled, and a new request cancels the previous open one', () => {
  const { env, ani } = setup();
  env.now = Date.now();
  env.call('requestRenewal', ani, 'P1');
  assert.throws(() => env.call('requestRenewal', ani, 'P2'), /Tunggu sebentar/);
  env.now += 25000;
  env.call('requestRenewal', ani, 'P2');
  const rows = sheetRows(env).slice(1);
  assert.deepEqual(rows.map(r => r[3]), ['dibatalkan', 'menunggu']);
  assert.equal(rows[1][2], 'P2');
  assert.equal(env.call('getMyRenewal', ani).packageName, 'Flex');
});

test('a client sees only their own latest request; cancelled ones are hidden', () => {
  const { env, ani, budi } = setup();
  assert.equal(env.call('getMyRenewal', ani), null);
  env.call('requestRenewal', ani, 'P1');
  assert.equal(env.call('getMyRenewal', ani).status, 'menunggu');
  assert.equal(env.call('getMyRenewal', budi), null);
});

test('the owner lists requests with names, pending first, and the member cannot call the admin functions', () => {
  const { env, ani, budi, admin } = setup();
  env.now = Date.now();
  env.call('requestRenewal', ani, 'P1');
  env.call('requestRenewal', budi, 'P2');
  const list = env.call('getRenewalRequests', admin);
  assert.deepEqual(list.map(r => [r.name, r.packageName, r.status]), [['Budi', 'Flex', 'menunggu'], ['Ani Anggraini', 'Regular 8', 'menunggu']]);
  assert.ok(list[0].phone);
  const id = list[1].id;
  env.call('decideRenewal', admin, id, false);
  const after = env.call('getRenewalRequests', admin);
  assert.deepEqual(after.map(r => r.status), ['menunggu', 'ditolak']);
  assert.deepEqual(env.call('getRenewalRequests', admin, { status: 'ditolak' }).map(r => r.name), ['Ani Anggraini']);
  assert.throws(() => env.call('getRenewalRequests', ani), /AUTH_REQUIRED/);
  assert.throws(() => env.call('decideRenewal', ani, id, true), /AUTH_REQUIRED/);
});

test('approving does what "Perpanjang" does today: quota reset to the package, transaction logged with the price', () => {
  const { env, ani, admin } = setup();
  env.call('requestRenewal', ani, 'P1');
  const id = env.call('getRenewalRequests', admin)[0].id;
  assert.equal(env.memberRow('PT-A')[9], 5);                    // 5 sessions used before
  const res = env.call('decideRenewal', admin, id, true);
  assert.equal(res.status, 'disetujui');
  assert.equal(res.totalSessions, 8);
  const m = env.memberRow('PT-A');
  assert.deepEqual([m[6], m[8], m[9]], ['P1', 8, 0]);          // package, total sessions, used sessions
  const log = env.sheet('Members').rows.filter(r => r[1] === 'PT-A' && r[3] === 'Perpanjang');
  assert.equal(log.length, 1);
  assert.equal(log[0][10], 800000);                             // price snapshot
  assert.equal(sheetRows(env)[1][3], 'disetujui');
  assert.ok(sheetRows(env)[1][5]);
  assert.equal(env.call('getMyRenewal', ani).status, 'disetujui');
  // no extra client-facing Telegram spam: only the request notice was sent
  assert.equal(env.fetches.length, 1);
});

test('a request can be decided only once', () => {
  const { env, ani, admin } = setup();
  env.call('requestRenewal', ani, 'P1');
  const id = env.call('getRenewalRequests', admin)[0].id;
  env.call('decideRenewal', admin, id, true);
  assert.throws(() => env.call('decideRenewal', admin, id, true), /sudah diputuskan \(disetujui\)/);
  assert.throws(() => env.call('decideRenewal', admin, id, false), /sudah diputuskan/);
  assert.equal(env.sheet('Members').rows.filter(r => r[3] === 'Perpanjang').length, 1);   // not renewed twice
  assert.throws(() => env.call('decideRenewal', admin, 'REN-NOPE', true), /tidak ditemukan/);
});

test('rejecting changes nothing about the client', () => {
  const { env, ani, admin } = setup();
  env.call('requestRenewal', ani, 'P1');
  const before = JSON.stringify(env.memberRow('PT-A'));
  const id = env.call('getRenewalRequests', admin)[0].id;
  assert.equal(env.call('decideRenewal', admin, id, false).status, 'ditolak');
  assert.equal(JSON.stringify(env.memberRow('PT-A')), before);
  assert.equal(env.sheet('Members'), null);
});

test('if the renewal cannot be done, the request goes back to "menunggu" instead of being lost', () => {
  const { env, ani, admin } = setup();
  env.call('requestRenewal', ani, 'P1');
  const id = env.call('getRenewalRequests', admin)[0].id;
  env.call('setPackageActive', admin, 'P1', false);              // package switched off before approval
  assert.throws(() => env.call('decideRenewal', admin, id, true), /sudah tidak aktif/);
  assert.equal(sheetRows(env)[1][3], 'menunggu');
  assert.equal(sheetRows(env)[1][5], '');
  assert.equal(env.memberRow('PT-A')[9], 5);                     // client untouched
  env.call('setPackageActive', admin, 'P1', true);
  assert.equal(env.call('decideRenewal', admin, id, true).status, 'disetujui');
});

test('a deleted client cannot be renewed, and the request stays open', () => {
  const { env, ani, admin } = setup();
  env.call('requestRenewal', ani, 'P1');
  const id = env.call('getRenewalRequests', admin)[0].id;
  env.call('deleteMember', admin, 'PT-A');
  assert.throws(() => env.call('decideRenewal', admin, id, true), /Klien sudah dihapus/);
  assert.equal(sheetRows(env)[1][3], 'menunggu');
});
