'use strict';
// Fixes from the 2026-10 audit: session quota, booking horizon, registration
// throttle, completeSession, CSV formulas, and the one-call bootstraps.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B, wibSlot } = require('./fixtures');

const plain = v => JSON.parse(JSON.stringify(v));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const wibDate = d => new Date(Date.now() + d * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

test('quota: a client with no sessions left cannot book; upcoming bookings count', () => {
  const env = seededEnv();
  const mt = env.memberToken(KEY_A);
  // PT-A: 10 total, 5 used, 1 upcoming (SCH-A1) → 4 left.
  for (let d = 5; d < 9; d++) env.call('clientBookSchedule', mt, wibSlot(d));
  assert.throws(() => env.call('clientBookSchedule', mt, wibSlot(9)), /Sisa sesi paketmu habis/);

  env.memberRow('PT-B')[9] = 10;   // 10/10 used
  assert.throws(() => env.call('clientBookSchedule', env.memberToken(KEY_B), wibSlot(5)), /Sisa sesi paketmu habis/);
});

test('quota: recurring booking is capped by sessions left', () => {
  const env = seededEnv();
  const mt = env.memberToken(KEY_A);   // 4 left
  const base = { startDate: wibDate(5), time: '10:00', duration: 60 };
  const MON_SAT = [1, 2, 3, 4, 5, 6];
  assert.throws(() => env.call('clientBookRecurring', mt, base, { weekdays: MON_SAT, occurrences: 5 }), /tinggal 4/);
  assert.equal(env.call('clientBookRecurring', mt, base, { weekdays: MON_SAT, occurrences: 4 }).count, 4);
});

test('quota: the owner can still book over quota, with a warning', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.memberRow('PT-B')[9] = 10;
  const r = env.call('addSchedule', t, { memberId: 'PT-B', memberName: 'Budi', phone: '0812', notes: '', ...wibSlot(6) });
  assert.equal(r.status, 'success');
  assert.ok(r.warnings.some(w => /habis/.test(w)), JSON.stringify(r.warnings));
  const ok = env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '0811', notes: '', ...wibSlot(7) });
  assert.ok(!ok.warnings.some(w => /habis/.test(w)));
});

test('a package without a session count is not limited', () => {
  const env = seededEnv();
  env.memberRow('PT-A')[8] = '';
  env.memberRow('PT-A')[9] = 50;
  assert.equal(env.call('clientBookSchedule', env.memberToken(KEY_A), wibSlot(5)).status, 'success');
});

test('booking horizon: 60 days by default, Script Property overrides', () => {
  const env = seededEnv();
  const mt = env.memberToken(KEY_A);
  assert.throws(() => env.call('clientBookSchedule', mt, wibSlot(70)), /paling jauh 60 hari/);
  assert.equal(env.call('clientBookSchedule', mt, wibSlot(50)).status, 'success');
  env.props.BOOKING_MAX_DAYS_AHEAD = '10';
  assert.throws(() => env.call('clientBookSchedule', mt, wibSlot(20)), /paling jauh 10 hari/);
  assert.throws(() => env.call('clientBookRecurring', mt, { startDate: wibDate(9), time: '10:00', duration: 60 }, { weekdays: [1, 2, 3, 4, 5, 6], occurrences: 3 }), /paling jauh 10 hari/);
});

test('registration: one per number per minute, and a global cap per 10 minutes', () => {
  const env = seededEnv();
  const reg = phone => env.call('registerNewClient', { name: 'X', phone, packageId: 'P1' });
  assert.equal(reg('081900000001').status, 'success');
  assert.throws(() => reg('081900000001'), /baru saja dikirim/);
  for (let i = 2; i <= 5; i++) reg('08190000000' + i);
  const rows = env.sheet('MemberData').rows.length;
  const mails = env.mails.length;
  assert.throws(() => reg('081900000009'), /banyak pendaftaran/);
  assert.equal(env.sheet('MemberData').rows.length, rows, 'no row written');
  assert.equal(env.mails.length, mails, 'no email sent');
});

test('registration cap is configurable', () => {
  const env = seededEnv();
  env.props.REGISTER_MAX_PER_10MIN = '1';
  env.call('registerNewClient', { name: 'X', phone: '081900000001', packageId: 'P1' });
  assert.throws(() => env.call('registerNewClient', { name: 'Y', phone: '081900000002', packageId: 'P1' }), /banyak pendaftaran/);
});

test('completeSession: a second tap does not deduct again', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const first = env.call('completeSession', t, 'SCH-A1', 'PT-A');
  assert.equal(first.usedSessions, 6);
  const again = env.call('completeSession', t, 'SCH-A1', 'PT-A');
  assert.equal(again.alreadyCompleted, true);
  assert.equal(again.usedSessions, 6);
  assert.equal(env.memberRow('PT-A')[9], 6);
});

test('completeSession charges the schedule owner, whatever memberId the browser sends', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const r = env.call('completeSession', t, 'SCH-A1', 'PT-B');
  assert.equal(r.memberId, 'PT-A');
  assert.equal(env.memberRow('PT-A')[9], 6);
  assert.equal(env.memberRow('PT-B')[9], 2);
});

test('CSV export neutralises formulas typed into text fields', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('updateAppSettings', t, { finance: { enabled: true } });
  env.call('saveExpense', t, { amount: 1500, date: today(), category: 'Alat', method: 'Tunai', note: '=HYPERLINK("http://x")' });
  env.call('saveExpense', t, { amount: 2500, date: today(), category: 'Alat', method: 'Tunai', note: '@SUM(1)' });
  const csv = env.call('exportFinanceCsv', t, 'pengeluaran', today(), today()).csv;
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/);
  assert.match(csv, /;'@SUM\(1\)/);
  assert.match(csv, /;1500;/);   // numbers are untouched
});

test('portal bootstrap: one call, own sessions only, no other client data', () => {
  const env = seededEnv();
  const b = plain(env.call('getPortalBootstrap', env.memberToken(KEY_A)));
  assert.equal(b.profile.id, 'PT-A');
  assert.equal(b.authLost, '');
  assert.deepEqual(b.schedules.map(s => s.id), ['SCH-A1']);
  assert.ok(!('phone' in b.schedules[0]));
  const text = JSON.stringify(Object.assign({}, b, { profile: null }));   // the profile is the client's own
  assert.ok(!text.includes('PT-B') && !text.includes('Budi') && !text.includes('Catatan Budi'), 'nothing about another client');
  assert.ok(!text.includes('6281111111111') && !text.includes('081222222222'), 'no client phone numbers');
  assert.equal(b.openSlots.length, b.horizonDays);
  assert.equal(b.horizonDays, 60);
  assert.ok(b.coaches.length && b.priceList.length && b.businessHours);
});

test('portal bootstrap without or with a bad token: public parts only', () => {
  const env = seededEnv();
  const anon = plain(env.call('getPortalBootstrap', null));
  assert.equal(anon.profile, null);
  assert.deepEqual(anon.schedules, []);
  assert.equal(anon.authLost, '');
  const bad = plain(env.call('getPortalBootstrap', 'nope.nope'));
  assert.equal(bad.profile, null);
  assert.deepEqual(bad.schedules, []);
  assert.match(bad.authLost, /AUTH_REQUIRED/);
});

test('admin bootstrap and extras match the separate calls', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const b = plain(env.call('getAdminBootstrap', t));
  assert.deepEqual(b.members, plain(env.call('getMembers', t)));
  assert.deepEqual(b.schedules, plain(env.call('getSchedules', t)));
  assert.deepEqual(b.coaches, plain(env.call('getCoachesAdmin', t)));
  const x = plain(env.call('getAdminExtras', t));
  assert.deepEqual(x.transactionLog, plain(env.call('getMemberTransactionLog', t)));
  assert.deepEqual(x.taskSummary, plain(env.call('getTaskSummary', t)));
  assert.deepEqual(x.renewals, plain(env.call('getRenewalRequests', t)));
});
