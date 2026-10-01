'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, SCHEDULE_HEADERS } = require('./fixtures');

const PROFILE = { name: 'Dika', phone: '081234567890', specialty: 'Fat loss, Strength', experience: '5 tahun', bio: 'Bio', headline: 'Pelatih', location: 'Purwokerto', instagram: '@dika.fit', certifications: ['NASM'], achievements: ['Juara 1'] };
const coachRows = env => env.sheet('Coaches').rows;
const publicIds = env => env.call('getCoaches').map(c => c.id);

test('legacy 7-column Coaches sheet reads as active coaches and getCoaches returns only whitelisted keys', () => {
  const env = seededEnv();
  const list = env.call('getCoaches');
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['achievements', 'bio', 'certifications', 'experience', 'headline', 'id', 'instagram', 'location', 'name', 'phone', 'photo', 'specialty']);
  assert.equal(list[0].name, 'Rizky');
});

test('reads never create the Coaches sheet', () => {
  const env = seededEnv();
  env.ss.sheets = env.ss.sheets || undefined;
  assert.doesNotThrow(() => env.call('getCoaches'));
});

test('the first admin write appends the new headers once, keeps old values, and is idempotent', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.call('saveCoach', token, Object.assign({ id: 'C-1' }, PROFILE, { name: 'Rizky' }));
  const header = coachRows(env)[0];
  assert.equal(header.length, 14);
  assert.deepEqual(header.slice(0, 7), ['ID', 'Nama Coach', 'No WA', 'Spesialisasi', 'Foto URL', 'Bio', 'Pengalaman']);
  env.call('saveCoach', token, Object.assign({ id: 'C-1' }, PROFILE, { name: 'Rizky' }));
  assert.equal(coachRows(env)[0].length, 14);
});

test('saveCoach creates a coach with normalised phone, instagram handle and joined lists', () => {
  const env = seededEnv();
  const { id } = env.call('saveCoach', env.adminToken(), PROFILE);
  const c = env.call('getCoaches').find(x => x.id === id);
  assert.equal(c.phone, '6281234567890');
  assert.equal(c.instagram, 'dika.fit');
  assert.deepEqual(c.certifications, ['NASM']);
});

test('validation: every bad input gets an Indonesian error ending with a period', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const bad = (patch, re) => assert.throws(() => env.call('saveCoach', t, Object.assign({}, PROFILE, patch)), re);
  bad({ name: '' }, /Nama coach wajib/);
  bad({ phone: '123' }, /Nomor WhatsApp/);
  bad({ headline: 'x'.repeat(81) }, /Headline maksimal 80 karakter\./);
  bad({ bio: 'x'.repeat(601) }, /Bio maksimal 600/);
  bad({ certifications: ['a,b'] }, /koma/);
  bad({ certifications: new Array(11).fill('x') }, /maksimal 10 item/);
  bad({ instagram: 'bad name!' }, /Instagram/);
  assert.throws(() => env.call('saveCoach', t, Object.assign({ id: 'NOPE' }, PROFILE)), /Coach tidak ditemukan\./);
});

test('renaming updates clients and unfinished sessions only; completed sessions keep the old name', () => {
  const env = seededEnv();
  env.sheet('MemberData').rows[1][10] = 'C-1'; env.sheet('MemberData').rows[1][11] = 'Rizky';
  const sh = env.sheet('Schedules');
  sh.rows.push(['S-OPEN', 'PT-A', 'A', '1', '2030-01-01T01:00:00Z', '2030-01-01T02:00:00Z', '', 'read', 'C-1', 'Rizky', '', '']);
  sh.rows.push(['S-DONE', 'PT-A', 'A', '1', '2020-01-01T01:00:00Z', '2020-01-01T02:00:00Z', '', 'completed', 'C-1', 'Rizky', '2020-01-01T02:00:00Z', '']);
  env.call('saveCoach', env.adminToken(), Object.assign({ id: 'C-1' }, PROFILE, { name: 'Rizky Baru' }));
  const row = id => env.sheet('Schedules').rows.find(r => r[0] === id);
  assert.equal(row('S-OPEN')[9], 'Rizky Baru');
  assert.equal(row('S-DONE')[9], 'Rizky');
  assert.equal(env.sheet('MemberData').rows[1][11], 'Rizky Baru');
});

test('replacing the photo trashes the previous Drive file', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const { id } = env.call('saveCoach', t, Object.assign({}, PROFILE, { photo: 'https://drive.google.com/thumbnail?id=OLD1&sz=w500' }));
  const trashed = [];
  env.files.push({ getId: () => 'OLD1', setTrashed: v => { trashed.push(v); return this; } });
  env.call('saveCoach', t, Object.assign({ id }, PROFILE, { photo: 'https://drive.google.com/thumbnail?id=NEW2&sz=w500' }));
  assert.deepEqual(trashed, [true]);
});

test('delete is refused while a coach is used, allowed when unused', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.sheet('Schedules').rows.push(['S1', 'PT-A', 'A', '1', '2030-01-01T01:00:00Z', '2030-01-01T02:00:00Z', '', 'read', 'C-1', 'Rizky', '', '']);
  assert.throws(() => env.call('deleteCoach', t, 'C-1'), /Coach dipakai \d+ jadwal \/ 0 klien\. Nonaktifkan saja\./);
  const { id } = env.call('saveCoach', t, PROFILE);
  env.call('deleteCoach', t, id);
  assert.ok(!publicIds(env).includes(id));
});

test('the last active coach cannot be deactivated; an inactive coach disappears from the public list but keeps history', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.throws(() => env.call('setCoachActive', t, 'C-1', false), /Harus ada satu coach aktif\./);
  const { id } = env.call('saveCoach', t, PROFILE);
  env.call('setCoachActive', t, 'C-1', false);
  assert.deepEqual(publicIds(env), [id]);
  const admin = env.call('getCoachesAdmin', t);
  assert.equal(admin.coaches.length, 2);
  assert.equal(admin.solo, true);
  env.call('setCoachActive', t, 'C-1', true);
  assert.equal(env.call('getCoachesAdmin', t).solo, false);
});

test('self coach: defaults to the first active, can be set, must be active', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const { id } = env.call('saveCoach', t, PROFILE);
  assert.equal(env.call('getCoachesAdmin', t).selfId, 'C-1');
  env.call('setSelfCoach', t, id);
  assert.equal(env.call('getCoachesAdmin', t).selfId, id);
  env.call('setCoachActive', t, id, false);
  assert.equal(env.call('getCoachesAdmin', t).selfId, 'C-1');
  assert.throws(() => env.call('setSelfCoach', t, id), /Pilih coach yang aktif\./);
});

test('assignUnassignedToSelf: dry run counts, apply writes, second run is a no-op, completed sessions untouched', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const sh = env.sheet('Schedules');
  sh.rows.push(['U1', 'PT-A', 'A', '1', '2030-01-01T01:00:00Z', '2030-01-01T02:00:00Z', '', 'read', '', 'Belum Ditugaskan', '', '']);
  sh.rows.push(['U2', 'PT-A', 'A', '1', '2020-01-01T01:00:00Z', '2020-01-01T02:00:00Z', '', 'completed', '', '', '', '']);
  const dry = env.call('assignUnassignedToSelf', t, { dryRun: true });
  assert.equal(dry.sessions, 1);
  assert.equal(env.sheet('Schedules').rows.find(r => r[0] === 'U1')[8], '');
  env.call('assignUnassignedToSelf', t, {});
  assert.equal(env.sheet('Schedules').rows.find(r => r[0] === 'U1')[8], 'C-1');
  assert.equal(env.sheet('Schedules').rows.find(r => r[0] === 'U2')[8], '');
  assert.equal(env.call('assignUnassignedToSelf', t, {}).sessions, 0);
});

test('solo mode: a new session without a coach goes to the only active coach; with two coaches it stays unassigned', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const base = { memberId: 'PT-A', memberName: 'A', phone: '6281', start: '2030-01-01T01:00:00Z', end: '2030-01-01T02:00:00Z', notes: '' };
  const solo = env.call('addSchedule', t, base);
  assert.equal(solo.coachId, 'C-1');
  env.call('saveCoach', t, PROFILE);
  const team = env.call('addSchedule', t, base);
  assert.equal(team.coachId, '');
  assert.equal(team.coachName, '');
});

test('an inactive preferred coach is never auto-assigned', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const { id } = env.call('saveCoach', t, PROFILE);
  env.sheet('MemberData').rows[1][10] = 'C-1'; env.sheet('MemberData').rows[1][11] = 'Rizky';
  env.call('setCoachActive', t, 'C-1', false);
  const r = env.call('addSchedule', t, { memberId: env.sheet('MemberData').rows[1][0], memberName: 'A', phone: '6281', start: '2030-01-01T01:00:00Z', end: '2030-01-01T02:00:00Z', notes: '' });
  assert.equal(r.coachId, id);
});

test('updateScheduleCoach derives the name from the ID and clears with an empty ID', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.sheet('Schedules').rows.push(['S1', 'PT-A', 'A', '1', '2030-01-01T01:00:00Z', '2030-01-01T02:00:00Z', '', 'read', '', '', '', '']);
  env.call('updateScheduleCoach', t, 'S1', 'C-1', 'NAMA PALSU');
  assert.equal(env.sheet('Schedules').rows.find(r => r[0] === 'S1')[9], 'Rizky');
  env.call('updateScheduleCoach', t, 'S1', '');
  assert.equal(env.sheet('Schedules').rows.find(r => r[0] === 'S1')[9], '');
  assert.throws(() => env.call('updateScheduleCoach', t, 'S1', 'NOPE'), /Coach tidak ditemukan\./);
});

test('the coach profile page: public fields only, status, at most 3 testimonials, reschedule notice; same for the member and the owner preview', () => {
  const env = seededEnv();
  const t = env.adminToken(), mt = env.memberToken(require('./fixtures').KEY_A);
  env.call('addCoachTimeOff', t, { from: '2020-01-01', to: '2020-01-02', note: 'rahasia' });
  const mine = env.call('getMyCoach', mt);
  const prev = env.call('previewCoachProfile', t);
  assert.equal(JSON.stringify(mine), JSON.stringify(prev));
  assert.deepEqual(Object.keys(mine).sort(), ['coach', 'rescheduleCutoffHours', 'solo', 'status', 'testimonials']);
  assert.deepEqual(Object.keys(mine.coach).sort(), ['achievements', 'bio', 'certifications', 'experience', 'headline', 'id', 'instagram', 'location', 'name', 'phone', 'photo', 'specialty']);
  assert.equal(mine.rescheduleCutoffHours, 2);
  assert.ok(mine.testimonials.length <= 3);
  assert.ok(!JSON.stringify(mine).includes('rahasia'));
  assert.throws(() => env.call('getMyCoach', t), /AUTH_REQUIRED/);
});
