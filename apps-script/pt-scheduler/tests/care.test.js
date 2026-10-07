'use strict';
// Client care (Phase E4): private notes, health form, assessment, fitness tests, briefing, care list.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const ANSWERS = (over) => Object.assign({ q: ['tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak'], injuries: 'Lutut kiri', medication: '', other: '', consent: 'ya' }, over);
const j = x => JSON.parse(JSON.stringify(x));

test('private notes round-trip with limits, and never appear in the shared member responses', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveClientNotes', t, 'PT-A', { flag: 'Cedera lutut kiri', notes: 'Hindari lunge dalam', birthDate: '1995-05-01' });
  const care = env.call('getClientCare', t, 'PT-A');
  assert.equal(care.flag, 'Cedera lutut kiri');
  assert.equal(care.birthDate, '1995-05-01');
  assert.throws(() => env.call('saveClientNotes', t, 'PT-A', { flag: 'x'.repeat(81) }), /Perhatian maksimal 80/);
  assert.throws(() => env.call('saveClientNotes', t, 'PT-A', { notes: 'x'.repeat(2001) }), /Catatan maksimal 2000/);
  assert.throws(() => env.call('saveClientNotes', t, 'PT-A', { birthDate: '2999-01-01' }), /Tanggal lahir/);
  const secret = ['Cedera lutut kiri', 'Hindari lunge dalam', '1995-05-01'];
  const blobs = [JSON.stringify(env.call('getMembers', t)), JSON.stringify(env.call('getMemberProfile', env.memberToken(KEY_A))), JSON.stringify(env.call('getPublicSchedules')), JSON.stringify(env.call('getMyProgress', env.memberToken(KEY_A)))];
  blobs.forEach(b => secret.forEach(sv => assert.ok(!b.includes(sv), 'leaked: ' + sv)));
});

test('health form: members read questions only, submit once per minute, Telegram never carries answers, a new submission clears the review', () => {
  const env = seededEnv();
  env.props.TELEGRAM_BOT_TOKEN = '123:abc'; env.props.TELEGRAM_CHAT_IDS = '1';
  const mt = env.memberToken(KEY_A), t = env.adminToken();
  const form = env.call('getMyHealthForm', mt);
  assert.equal(form.questions.length, 7);
  assert.equal(form.done, false);
  assert.ok(!('answers' in form));
  assert.throws(() => env.call('submitMyHealthForm', mt, ANSWERS({ q: ['ya'] })), /Jawab semua/);
  assert.throws(() => env.call('submitMyHealthForm', mt, ANSWERS({ consent: '' })), /persetujuan/);
  env.call('submitMyHealthForm', mt, ANSWERS({ q: ['ya', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak'] }));
  const sent = env.fetches.map(f => JSON.parse(f.options.payload).text).join('\n');
  assert.match(sent, /mengisi form kesehatan/);
  assert.ok(!sent.includes('Lutut kiri') && !/\bya\b/i.test(sent.replace('mengisi', '')));
  assert.throws(() => env.call('submitMyHealthForm', mt, ANSWERS()), /Tunggu sebentar/);
  assert.equal(env.call('getMyHealthForm', mt).done, true);
  env.call('markHealthReviewed', t, 'PT-A', 'aman');
  assert.ok(env.call('getClientCare', t, 'PT-A').health.reviewedAt);
});

test('a member cannot read another member\'s health form or care data (token decides the member)', () => {
  const env = seededEnv();
  env.call('submitMyHealthForm', env.memberToken(KEY_A), ANSWERS());
  assert.equal(env.call('getMyHealthForm', env.memberToken(KEY_B)).done, false);
  assert.throws(() => env.call('getClientCare', env.memberToken(KEY_A), 'PT-A'), /AUTH_REQUIRED/);
});

test('assessment: saved with optional measurements; members see goal and preference only, never coach notes', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.throws(() => env.call('saveAssessment', t, 'PT-A', {}), /minimal satu/);
  env.call('saveAssessment', t, 'PT-A', { goal: 'Turun 5 kg', history: 'Pernah gym', schedulePref: 'Pagi', motivation: 'Nikah', coachNotes: 'Bahu kaku', weight: '72,4', waist: '80', bodyFat: '24' });
  const care = env.call('getClientCare', t, 'PT-A');
  assert.equal(care.assessment.goal, 'Turun 5 kg');
  assert.equal(care.assessment.bodyFat, 24);
  const prog = env.call('getMemberProgress', t, 'PT-A');
  assert.equal(prog.entries.length, 1);
  const mine = env.call('getMyAssessment', env.memberToken(KEY_A));
  assert.deepEqual(Object.keys(mine).sort(), ['goal', 'schedulePref', 'tests']);
  assert.ok(!JSON.stringify(mine).includes('Bahu kaku'));
});

test('fitness tests: upsert per member, date and test; bounds; change shown with the right direction', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.throws(() => env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-08-01', values: {} }), /minimal satu/);
  assert.throws(() => env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-08-01', values: { pushup: 999 } }), /Push-up/);
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-08-01', values: { pushup: '20', 'nadi-istirahat': '80' } });
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-08-01', values: { pushup: '22' } });   // same day: update, not a new row
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-09-01', values: { pushup: '30', 'nadi-istirahat': '72' } });
  const care = env.call('getClientCare', t, 'PT-A');
  const push = j(care.tests).find(x => x.id === 'pushup');
  assert.equal(push.first.nilai, 22);
  assert.equal(push.latest.nilai, 30);
  assert.equal(push.change, 8);
  assert.equal(push.improved, true);
  const nadi = j(care.tests).find(x => x.id === 'nadi-istirahat');
  assert.equal(nadi.change, -8);
  assert.equal(nadi.improved, true);   // heart rate going down is better
  const mine = env.call('getMyAssessment', env.memberToken(KEY_A));
  assert.equal(j(mine.tests).find(x => x.id === 'pushup').latest.nilai, 30);
  env.call('deleteFitnessTest', t, push.latest.id);
  assert.equal(j(env.call('getClientCare', t, 'PT-A').tests).find(x => x.id === 'pushup').latest.nilai, 22);
});

test('session briefing shows the flag, goal and last test, and is admin only', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveClientNotes', t, 'PT-A', { flag: 'Cedera lutut', notes: '' });
  env.call('saveAssessment', t, 'PT-A', { goal: 'Turun 5 kg' });
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-09-01', values: { plank: '60' } });
  const b = env.call('getSessionBriefing', t, 'SCH-A1');
  assert.equal(b.flag, 'Cedera lutut');
  assert.equal(b.goal, 'Turun 5 kg');
  assert.equal(b.lastTest.label, 'Plank');
  assert.throws(() => env.call('getSessionBriefing', env.memberToken(KEY_A), 'SCH-A1'), /AUTH_REQUIRED/);
});

test('care list: reasons, snooze, and one row per client with all reasons', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const hub = () => j(env.call('getCoachHub', t).care);
  const a = hub().find(r => r.memberId === 'PT-A');
  assert.ok(a && a.reasons.includes('no-assessment') && a.reasons.includes('no-health'));
  assert.equal(hub().filter(r => r.memberId === 'PT-A').length, 1);
  env.call('submitMyHealthForm', env.memberToken(KEY_A), ANSWERS());
  assert.ok(hub().find(r => r.memberId === 'PT-A').reasons.includes('health-review'));
  env.call('snoozeCare', t, 'PT-A', 7);
  assert.ok(!hub().some(r => r.memberId === 'PT-A'));
});

test('test results: the member sees a dated history for trends; the owner gets a ready WhatsApp message (admin only)', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.throws(() => env.call('getTestResultMessage', t, 'PT-A'), /Belum ada hasil tes/);
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-08-01', values: { pushup: '20', 'nadi-istirahat': '80', plank: '45' } });
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-09-01', values: { pushup: '28', 'nadi-istirahat': '72' } });
  const mine = env.call('getMyAssessment', env.memberToken(KEY_A));
  const push = j(mine.tests).find(x => x.id === 'pushup');
  assert.deepEqual(push.history, [{ tanggal: '2026-08-01', nilai: 20 }, { tanggal: '2026-09-01', nilai: 28 }]);
  const res = env.call('getTestResultMessage', t, 'PT-A');
  assert.match(res.text, /Halo Ani,/);
  assert.match(res.text, /Push-up: 20 → 28 kali \/ 1 menit \(naik 8\)/);
  assert.match(res.text, /Detak jantung istirahat: 80 → 72 bpm \(turun 8\)/);
  assert.match(res.text, /Plank: 45 detik/);   // measured once: value only
  assert.match(res.waLink, /^https:\/\/wa\.me\/6281111111111\?text=/);
  assert.throws(() => env.call('getTestResultMessage', env.memberToken(KEY_A), 'PT-A'), /AUTH_REQUIRED/);
  assert.match(env.call('previewReminderText', t, 'hasil-tes', '').text, /hasil tes kebugaranmu/);
});
