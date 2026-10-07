'use strict';
// Quick rating after a session and the package evaluation (Phase I3).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B, inDays } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const A = env => env.memberToken(KEY_A);
const tgTexts = (env, from) => env.fetches.slice(from).map(f => JSON.stringify(f));

/** Ani has SCH-A1 two days ahead; make it a finished session from yesterday. */
function finished(env, opts) {
  opts = opts || {};
  const sh = env.sheet('Schedules');
  const row = sh.rows.find(r => r[0] === 'SCH-A1');
  row[4] = inDays(-1); row[5] = inDays(-1 + 1 / 24); row[7] = 'completed'; row[10] = opts.completedAt || inDays(-1 + 1 / 24);
  return row;
}

test('a finished session offers one pending rating for 7 days, and only to its owner', () => {
  const env = seededEnv();
  assert.equal(env.call('getPortalBootstrap', A(env)).pendingRating, null, 'nothing finished yet');
  finished(env);
  const b = j(env.call('getPortalBootstrap', A(env)));
  assert.equal(b.feedbackEnabled, true);
  assert.equal(b.pendingRating.scheduleId, 'SCH-A1');
  assert.equal(j(env.call('getPortalBootstrap', env.memberToken(KEY_B))).pendingRating, null);
  assert.equal(env.call('getPortalBootstrap', null).pendingRating, null);
  env.sheet('Schedules').rows.find(r => r[0] === 'SCH-A1')[10] = inDays(-9);
  assert.equal(env.call('getPortalBootstrap', A(env)).pendingRating, null, 'older than 7 days: no more asking');
});

test('rateSession: 1-5 stars, own completed session only, one rating per session (the newer one replaces)', () => {
  const env = seededEnv();
  finished(env);
  assert.throws(() => env.call('rateSession', A(env), 'SCH-A1', 0, ''), /1 sampai 5 bintang/);
  assert.throws(() => env.call('rateSession', A(env), 'SCH-A1', 4.5, ''), /1 sampai 5 bintang/);
  assert.throws(() => env.call('rateSession', A(env), 'SCH-A1', 5, 'x'.repeat(301)), /maksimal 300/);
  assert.throws(() => env.call('rateSession', env.memberToken(KEY_B), 'SCH-A1', 5, ''), /Sesi tidak ditemukan/);   // another client's session = unknown
  assert.throws(() => env.call('rateSession', A(env), 'NOPE', 5, ''), /Sesi tidak ditemukan/);
  assert.throws(() => env.call('rateSession', null, 'SCH-A1', 5, ''), /AUTH_REQUIRED/);
  assert.throws(() => env.call('rateSession', env.memberToken(KEY_B), 'SCH-B1', 5, ''), /belum selesai/);
  assert.equal(env.call('rateSession', A(env), 'SCH-A1', 5, 'Mantap, makin kuat!', true).status, 'success');
  const rows = env.sheet('SessionRatings').rows;
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[1][1], rows[1][2], rows[1][4], rows[1][5], rows[1][6]], ['SCH-A1', 'PT-A', 5, 'Mantap, makin kuat!', 'ya']);
  assert.equal(env.call('getPortalBootstrap', A(env)).pendingRating, null, 'rated: no longer pending');
  env.context.CacheService.getScriptCache().remove('throttle_rate_PT-A');
  env.call('rateSession', A(env), 'SCH-A1', 4, '');
  assert.equal(env.sheet('SessionRatings').rows.length, 2, 'same session: update, not a new row');
  assert.equal(env.sheet('SessionRatings').rows[1][4], 4);
  assert.throws(() => env.call('rateSession', A(env), 'SCH-A1', 3, ''), /Tunggu sebentar/);   // throttle
});

test('a low rating tells the owner by first name and stars only; the comment never reaches Telegram', () => {
  const env = seededEnv();
  finished(env);
  const before = env.fetches.length;
  env.call('rateSession', A(env), 'SCH-A1', 2, 'RAHASIA-KOMENTAR coach telat');
  const texts = tgTexts(env, before);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /Ani memberi 2 dari 5 bintang/);
  assert.ok(!texts[0].includes('RAHASIA') && !texts[0].includes('Anggraini'));
  env.context.CacheService.getScriptCache().remove('throttle_rate_PT-A');
  const n = env.fetches.length;
  env.call('rateSession', A(env), 'SCH-A1', 5, '');
  assert.equal(env.fetches.length, n, 'a good rating sends nothing');
});

test('the switch FEEDBACK_ENABLED turns the cards and the calls off (default on)', () => {
  const env = seededEnv();
  finished(env);
  assert.equal(env.call('getAppSettings', env.adminToken()).feedbackEnabled, true);
  env.call('updateAppSettings', env.adminToken(), { feedbackEnabled: false });
  assert.equal(env.props.FEEDBACK_ENABLED, 'false');
  const b = j(env.call('getPortalBootstrap', A(env)));
  assert.equal(b.feedbackEnabled, false);
  assert.equal(b.pendingRating, null);
  assert.equal(b.packageEval.eligible, false);
  assert.throws(() => env.call('rateSession', A(env), 'SCH-A1', 5, ''), /dimatikan/);
  env.call('updateAppSettings', env.adminToken(), { feedbackEnabled: true });
  assert.equal(env.props.FEEDBACK_ENABLED, undefined);
});

const ALL5 = { motivasi: 5, keselamatan: 4, kepuasan: 5, komunikasi: 5, profesionalisme: 4, komentar: 'Terima kasih coach', consent: true };

test('package evaluation opens only when the remaining sessions hit 0, and only once per finished package', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.equal(env.call('getPortalBootstrap', A(env)).packageEval.eligible, false, '5 of 10 used');
  assert.deepEqual(j(env.call('getMyPackageEval', A(env))), { eligible: false });
  assert.throws(() => env.call('submitMyPackageEval', A(env), ALL5), /belum tersedia atau sudah diisi/);
  // The last session: complete it through the real flow.
  env.memberRow('PT-A')[9] = 9;
  const done = env.call('completeSession', t, 'SCH-A1', 'PT-A');
  assert.equal(done.packageDone, true);
  assert.match(done.evalText, /semua sesi paketmu sudah selesai/);
  assert.match(done.evalWaLink, /^https:\/\/wa\.me\/6281111111111\?text=/);
  const mid = env.call('completeSession', t, 'SCH-A1', 'PT-A');
  assert.equal(mid.packageDone, false, 'a repeated tap is not a new completion');
  assert.equal(env.call('getPortalBootstrap', A(env)).packageEval.eligible, true);
  const ev = j(env.call('getMyPackageEval', A(env)));
  assert.equal(ev.eligible, true);
  assert.equal(ev.total, 10);
  assert.deepEqual(ev.aspects.map(a => a.key), ['motivasi', 'keselamatan', 'kepuasan', 'komunikasi', 'profesionalisme']);
  assert.throws(() => env.call('submitMyPackageEval', A(env), Object.assign({}, ALL5, { kepuasan: 0 })), /bintang untuk kepuasan/);
  assert.throws(() => env.call('submitMyPackageEval', A(env), Object.assign({}, ALL5, { komentar: 'x'.repeat(501) })), /maksimal 500/);
  assert.equal(env.call('submitMyPackageEval', A(env), ALL5).status, 'success');
  assert.equal(env.sheet('PackageEvaluations').rows.length, 2);
  assert.equal(env.call('getPortalBootstrap', A(env)).packageEval.eligible, false, 'answered: not asked again');
  env.context.CacheService.getScriptCache().remove('throttle_eval_PT-A');
  assert.throws(() => env.call('submitMyPackageEval', A(env), ALL5), /belum tersedia atau sudah diisi/);
});

test('evaluation summary shows the client\'s own progress; the owner sees ratings with comments, Telegram only a name and a number', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-08-01', berat: 80, pinggang: 90 });
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-09-20', berat: 76, pinggang: 86 });
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-08-01', values: { pushup: 20 } });
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-09-20', values: { pushup: 30 } });
  env.memberRow('PT-A')[9] = 10;
  finished(env);
  const ev = j(env.call('getMyPackageEval', A(env)));
  assert.deepEqual(ev.measures.map(m => [m.key, m.first, m.last, m.change]), [['berat', 80, 76, -4], ['pinggang', 90, 86, -4]]);
  assert.deepEqual(ev.tests.map(x => [x.label, x.first, x.latest, x.change, x.improved]), [['Push-up', 20, 30, 10, true]]);
  const before = env.fetches.length;
  env.call('submitMyPackageEval', A(env), Object.assign({}, ALL5, { komentar: 'RAHASIA-EVAL' }));
  const texts = tgTexts(env, before);
  assert.match(texts[0], /Ani · rata-rata 4,6 dari 5/);
  assert.ok(!texts.join().includes('RAHASIA'));
  env.call('rateSession', A(env), 'SCH-A1', 5, 'Sesi hebat');
  const care = j(env.call('getClientCare', t, 'PT-A'));
  assert.equal(care.feedback.ratings[0].komentar, 'Sesi hebat');
  assert.equal(care.feedback.evals[0].komentar, 'RAHASIA-EVAL');
  assert.equal(care.feedback.evals[0].izin, true);
  const hub = j(env.call('getCoachHub', t));
  assert.equal(hub.feedback.count, 1);
  assert.equal(hub.feedback.avg, 5);
  assert.equal(hub.feedback.recent[0].name, 'Ani Anggraini');
  assert.throws(() => env.call('getClientCare', A(env), 'PT-A'), /AUTH_REQUIRED/);
});

test('renewing starts a new evaluation cycle: a new finished package asks again', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.memberRow('PT-A')[9] = 9;
  env.call('completeSession', t, 'SCH-A1', 'PT-A');
  env.call('submitMyPackageEval', A(env), ALL5);
  assert.equal(env.call('getPortalBootstrap', A(env)).packageEval.eligible, false);
  // New package: counters restart, then the last session of that package is completed later.
  env.memberRow('PT-A')[9] = 9;
  env.sheet('Schedules').rows.push(['SCH-A2', 'PT-A', 'Ani Anggraini', '6281111111111', inDays(2), inDays(2.04), '', 'read', 'C-1', 'Rizky', '', '']);
  env.call('completeSession', t, 'SCH-A2', 'PT-A');
  assert.equal(env.call('getPortalBootstrap', A(env)).packageEval.eligible, true, 'a later finished package is asked about again');
});
