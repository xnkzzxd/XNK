'use strict';
// Session notes (Phase I2): coach notes per session, the post-session WhatsApp text, and what clients may see.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

test('a coach saves a session note; one row per session, empty fields remove it, limits are enforced', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const r = env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'Squat 3x10, plank', fokus: 'Perdalam teknik squat', rpe: '7', pribadi: 'Lutut kiri agak nyeri' });
  assert.equal(r.status, 'success');
  assert.equal(env.sheet('SessionNotes').rows.length, 2);
  assert.equal(env.sheet('SessionNotes').rows[1][2], 'PT-A');   // the member comes from the schedule row
  env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'Squat 4x10', fokus: '' });   // same session: update, not a new row
  assert.equal(env.sheet('SessionNotes').rows.length, 2);
  const n = env.call('getSessionNote', t, 'SCH-A1');
  assert.deepEqual(j(n), { scheduleId: 'SCH-A1', dilatih: 'Squat 4x10', fokus: '', rpe: '', pribadi: '' });
  assert.throws(() => env.call('saveSessionNote', t, 'SCH-A1', { rpe: 11 }), /RPE harus bilangan bulat 1 sampai 10/);
  assert.throws(() => env.call('saveSessionNote', t, 'SCH-A1', { rpe: '5,5' }), /RPE/);
  assert.throws(() => env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'x'.repeat(501) }), /maksimal 500/);
  assert.throws(() => env.call('saveSessionNote', t, 'NOPE', { dilatih: 'x' }), /Jadwal tidak ditemukan/);
  env.call('saveSessionNote', t, 'SCH-A1', {});
  assert.equal(env.sheet('SessionNotes').rows.length, 1, 'an empty note deletes the row');
});

test('the post-session message fills the template, shows what was trained and the remaining sessions, and is only a link', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const fetches = env.fetches.length;
  const r = env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'Squat, lunges', fokus: 'Teknik squat' });
  assert.match(r.text, /^Halo Ani, terima kasih untuk sesi hari ini!/);
  assert.match(r.text, /🏋️ Hari ini: Squat, lunges/);
  assert.match(r.text, /🎯 Berikutnya: Teknik squat/);
  assert.match(r.text, /Sisa sesimu 5 dari 10\./);
  assert.match(r.waLink, /^https:\/\/wa\.me\/6281111111111\?text=/);
  const bare = env.call('saveSessionNote', t, 'SCH-A1', { rpe: 6 });
  assert.ok(!/Hari ini:|Berikutnya:/.test(bare.text), 'no empty headings when nothing was written');
  assert.equal(env.fetches.length, fetches, 'nothing is sent automatically (no Telegram, no WhatsApp)');
  assert.match(env.call('previewReminderText', t, 'pasca-sesi', '').text, /terima kasih untuk sesi hari ini/);
  env.props.RMD_TPL_PASCA_SESI = 'Makasih {nama}! Sisa {sisa}.';
  assert.equal(env.call('saveSessionNote', t, 'SCH-A1', { rpe: 6 }).text, 'Makasih Ani! Sisa 5 dari 10.');
});

test('the briefing shows the focus from the previous session, not the current one', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'Squat', fokus: 'Teknik squat', rpe: 8 });
  env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '6281', start: new Date(Date.now() + 5 * 86400000).toISOString(), end: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(), notes: '' });
  const next = env.sheet('Schedules').rows[env.sheet('Schedules').rows.length - 1][0];
  const b = env.call('getSessionBriefing', t, next);
  assert.deepEqual(j(b.lastNote), { tanggal: b.lastNote.tanggal, dilatih: 'Squat', fokus: 'Teknik squat', rpe: 8 });
  assert.equal(env.call('getSessionBriefing', t, 'SCH-A1').lastNote, null, 'a session is not its own "previous" note');
});

test('clients see only "dilatih" and "fokus" on their own sessions: never RPE, private notes or other clients\' notes', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'Squat', fokus: 'Teknik', rpe: 9, pribadi: 'RAHASIA-LUTUT' });
  env.call('saveSessionNote', t, 'SCH-B1', { dilatih: 'Deadlift-Budi', fokus: 'Punggung-Budi', pribadi: 'RAHASIA-BUDI' });
  const boot = env.call('getPortalBootstrap', env.memberToken(KEY_A));
  const mine = boot.schedules.find(s => s.id === 'SCH-A1');
  assert.equal(mine.dilatih, 'Squat');
  assert.equal(mine.fokus, 'Teknik');
  const wire = JSON.stringify(boot);
  assert.ok(!wire.includes('RAHASIA') && !wire.includes('Deadlift-Budi') && !wire.includes('"rpe"'), 'no private data or other clients in the portal response');
  assert.throws(() => env.call('saveSessionNote', env.memberToken(KEY_A), 'SCH-A1', { dilatih: 'x' }), /AUTH_REQUIRED/);
  assert.throws(() => env.call('getSessionNote', env.memberToken(KEY_B), 'SCH-A1'), /AUTH_REQUIRED/);
  const other = env.call('getPortalBootstrap', env.memberToken(KEY_B)).schedules.find(s => s.id === 'SCH-A1');
  assert.equal(other, undefined, 'another client does not get the schedule at all');
});

test('notes never reach Telegram, and a session note save sends nothing', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const before = env.fetches.length;
  env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'Squat', pribadi: 'RAHASIA-LUTUT' });
  env.call('completeSession', t, 'SCH-A1', 'PT-A');
  const texts = env.fetches.slice(before).map(f => JSON.stringify(f));
  assert.ok(texts.every(x => !x.includes('RAHASIA')), 'private notes stay out of Telegram');
});
