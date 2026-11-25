'use strict';
// Fase AC (T-2301): halaman klien di panel coach — satu panggilan membuka halaman, penulis menjawab dengan bagian yang
// diubahnya (tanpa bacaan susulan), tugas coach per klien dihitung di server, Pengaturan dalam satu panggilan.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const HEALTH = { q: ['tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak'], injuries: '', medication: '', other: '', consent: 'ya' };
const base = over => Object.assign({ today: '2026-11-25', total: 12, remaining: 5, joinedDays: 60, lastDone: '2026-11-20', hasUpcoming: true, sessionToday: false,
  inactiveDays: 14, renewal: null, overdueTasks: 0, lowRating: false, health: 'ok', assessment: true, lastTest: '2026-11-10', flag: '', snoozed: false,
  nutrition: { advice: false, stale: false }, hasProgram: true }, over);
const kinds = env => ctx => env.call('_coachTodoCalc_', ctx).map(r => r.kind);

test('coach to-do: nothing to do = empty list', () => {
  const env = seededEnv();
  assert.deepEqual(kinds(env)(base()), []);
});

test('coach to-do: package, renewal, health review, late PR and gizi advice come first, in that order', () => {
  const env = seededEnv(), k = kinds(env);
  assert.deepEqual(k(base({ remaining: 0, health: 'review', overdueTasks: 2, nutrition: { advice: true, stale: false } })), ['paket', 'kesehatan', 'pr', 'gizi']);
  const rows = env.call('_coachTodoCalc_', base({ renewal: { id: 'RN-1', packageName: 'Regular 8' }, remaining: 0 }));
  assert.equal(rows[0].kind, 'perpanjang');
  assert.equal(rows[0].ref, 'RN-1');
  assert.equal(rows[0].id, 'perpanjang:RN-1');
  assert.equal(rows[0].sub, 'Regular 8');
  assert.ok(!rows.some(r => r.kind === 'paket'), 'an open renewal replaces the "paket habis" row');
  const habis = env.call('_coachTodoCalc_', base({ remaining: 0 }))[0];
  assert.equal(habis.danger, true);
  assert.equal(habis.act, 'WA');
});

test('coach to-do: low sessions only without a booked session; idle clients get a WA row, others a booking row', () => {
  const env = seededEnv(), k = kinds(env);
  assert.deepEqual(k(base({ remaining: 2 })), []);
  assert.deepEqual(k(base({ remaining: 2, hasUpcoming: false })), ['paket', 'booking']);
  const idle = env.call('_coachTodoCalc_', base({ hasUpcoming: false, lastDone: '2026-11-01' }));
  assert.deepEqual(idle.map(r => r.kind), ['inaktif']);
  assert.equal(idle[0].title, '24 hari tidak latihan');
  assert.deepEqual(k(base({ hasUpcoming: false, lastDone: '', joinedDays: 20 })), ['inaktif']);
  assert.equal(env.call('_coachTodoCalc_', base({ hasUpcoming: false, lastDone: '', joinedDays: 20 }))[0].title, 'Belum pernah latihan');
});

test('coach to-do: care rows follow the Beranda Coach rules (after 3 days, not snoozed, retest after 28 days)', () => {
  const env = seededEnv(), k = kinds(env);
  assert.deepEqual(k(base({ assessment: false, health: 'none', lastTest: '2026-10-01' })), ['tes', 'assessment', 'form-kesehatan']);
  assert.deepEqual(k(base({ assessment: false, health: 'none', joinedDays: 1 })), []);
  assert.deepEqual(k(base({ assessment: false, health: 'none', snoozed: true })), []);
  assert.deepEqual(k(base({ assessment: false, remaining: 0 })), ['paket'], 'no care rows once the package is used up');
  assert.deepEqual(k(base({ hasProgram: false, lowRating: true, nutrition: { advice: false, stale: true } })), ['rating', 'timbang', 'program']);
  assert.deepEqual(k(base({ flag: 'Lutut kiri nyeri', sessionToday: true })), ['catatan']);
  assert.ok(env.call('_coachTodoCalc_', base({ remaining: 0, health: 'review', overdueTasks: 1, assessment: false, flag: 'x', sessionToday: true, hasUpcoming: false, lowRating: true, nutrition: { advice: true, stale: true } })).length <= 8);
});

test('client bundle carries the coach to-do and the last session notes (private fields stay admin-only)', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const b = j(env.call('getClientBundle', t, 'PT-A'));
  assert.ok(Array.isArray(b.todo), 'todo part');
  assert.ok(Array.isArray(b.notes), 'notes part');
  b.todo.forEach(r => { assert.ok(r.kind && r.title && 'act' in r && 'ref' in r); });
  env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'Squat', fokus: 'Kedalaman squat', rpe: 7, pribadi: 'catatan privat' });
  const b2 = j(env.call('getClientBundle', t, 'PT-A'));
  const n = b2.notes.find(x => x.scheduleId === 'SCH-A1');
  assert.ok(n, 'the saved note is in the bundle (saveSessionNote bumps the client version)');
  assert.equal(n.fokus, 'Kedalaman squat');
  assert.equal(n.pribadi, 'catatan privat');
  assert.ok(!j(env.call('getClientBundle', t, 'PT-B')).notes.length, 'another client\'s notes never mix in');
  assert.throws(() => env.call('getClientBundle', env.memberToken(KEY_A), 'PT-A'), /AUTH_REQUIRED/);
});

test('PR writers answer with the client\'s fresh list and counts (no getTasksForMember / getTaskSummary afterwards)', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const a = j(env.call('addTask', t, { memberId: 'PT-A', title: 'Tidur 7 jam', category: 'tidur' }));
  assert.equal(a.status, 'success');
  assert.equal(a.memberId, 'PT-A');
  assert.deepEqual(a.tasks, j(env.call('getTasksForMember', t, 'PT-A')));
  assert.equal(a.taskSummary.open, a.tasks.filter(x => x.status === 'todo').length);
  const u = j(env.call('updateTask', t, { id: a.id, status: 'done' }));
  assert.equal(u.tasks.find(x => x.id === a.id).status, 'done');
  assert.equal(u.taskSummary.open, a.taskSummary.open - 1);
  const d = j(env.call('deleteTask', t, a.id));
  assert.ok(!d.tasks.some(x => x.id === a.id));
});

test('care writers answer with fresh care data (no getClientCare afterwards)', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const n = j(env.call('saveClientNotes', t, 'PT-A', { flag: 'Lutut', notes: 'Hindari lompat', birthDate: '' }));
  assert.equal(n.status, 'success');
  assert.equal(n.care.flag, 'Lutut');
  assert.equal(n.care.notes, 'Hindari lompat');
  const s = j(env.call('saveAssessment', t, 'PT-A', { goal: 'Turun berat badan' }));
  assert.equal(s.care.assessment.goal, 'Turun berat badan');
  env.call('submitMyHealthForm', env.memberToken(KEY_A), HEALTH);
  const h = j(env.call('markHealthReviewed', t, 'PT-A', 'aman'));
  assert.ok(h.care.health.reviewedAt);
  assert.deepEqual(h.care, j(env.call('getClientCare', t, 'PT-A')));
});

test('program-auto writers answer with the saved program too (no getMemberProgram afterwards)', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const a = j(env.call('setClientProgramAuto', t, 'PT-A', { auto: true, pantangan: ['lutut'] }));
  assert.deepEqual(a.pantangan, ['lutut']);
  assert.deepEqual(a.program, j(env.call('getMemberProgram', t, 'PT-A')));
  const r = j(env.call('regenerateProgram', t, 'PT-A'));
  assert.ok(r.program && Array.isArray(r.program.days));
  assert.deepEqual(r.program, j(env.call('getMemberProgram', t, 'PT-A')));
});

test('approving a renewal answers with the updated client', () => {
  const env = seededEnv();
  env.call('requestRenewal', env.memberToken(KEY_A), 'P1');
  const t = env.adminToken();
  const req = env.call('getRenewalRequests', t)[0];
  const r = j(env.call('decideRenewal', t, req.id, true));
  assert.equal(r.status, 'disetujui');
  assert.equal(r.member.id, 'PT-A');
  assert.equal(Number(r.member.totalSessions), r.totalSessions);
  assert.ok(!('sessionKey' in r.member) && !JSON.stringify(r.member).includes('xnk_'), 'only the public profile fields');
});

test('getSettingsBundle = the three Settings reads in one call; a failing part becomes {error}', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const b = j(env.call('getSettingsBundle', t));
  assert.deepEqual(b.settings, j(env.call('getAppSettings', t)));
  assert.deepEqual(b.status, j(env.call('getReminderStatus', t)));
  assert.deepEqual(b.packages, j(env.call('getPriceListAdmin', t)));
  assert.throws(() => env.call('getSettingsBundle', env.memberToken(KEY_A)), /AUTH_REQUIRED/);
});

test('client bundle carries the client\'s recent wins (athlete.moments) for the coach Progres tab', () => {
  const env = seededEnv();
  const t = env.adminToken(), mt = env.memberToken(KEY_A);
  env.call('saveMyMeasurement', mt, { berat: 72, pinggang: 84 });
  const b = j(env.call('getClientBundle', t, 'PT-A'));
  assert.ok(b.athlete && Array.isArray(b.athlete.moments), 'moments part');
  b.athlete.moments.forEach(m => assert.ok(m.kind && m.title && m.tanggal));
});
