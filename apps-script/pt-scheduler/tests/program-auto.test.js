'use strict';
// Fase U (T-1606): program otomatis end-to-end lewat fungsi publik (klien dari token, coach selalu menang, job harian).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const HEALTH_OK = { q: ['tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak'], injuries: '', medication: '', other: '', consent: 'ya' };
const PROFILE = { level: 'pemula-banget', hari: 3, durasi: 45, tujuan: 'otot', fokus: [] };
const setup = () => { const env = seededEnv(); const mt = env.memberToken(KEY_A); return { env, mt }; };

test('client saves the profile → a program is written at once, marked auto, with a light mode until the health form is in', () => {
  const { env, mt } = setup();
  let r = j(env.call('saveMyProgramProfile', mt, PROFILE));
  assert.equal(r.programGen.isAuto, true);
  assert.equal(r.programGen.light, true, 'no health form yet → light mode');
  assert.equal(r.program.days.length, 3);
  assert.equal(r.program.days[0].items[0].repMin, 12, 'light mode reps');
  env.call('submitMyHealthForm', mt, HEALTH_OK);
  env.now = Date.now() + 10000;   // past the 2 s save throttle
  r = j(env.call('saveMyProgramProfile', mt, PROFILE));
  assert.equal(r.programGen.light, false);
  assert.equal(r.program.days[0].items[0].repMin, 8);
  assert.ok(env.sheet('ProgramItems').rows.slice(1).every(x => x[21] === 'auto:1'));
});

test('client never sees health answers or sets coach-only restrictions; level/goal validated', () => {
  const { env, mt } = setup();
  env.call('submitMyHealthForm', mt, Object.assign({}, HEALTH_OK, { q: ['ya', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak'], injuries: 'Lutut kiri' }));
  const r = j(env.call('saveMyProgramProfile', mt, Object.assign({}, PROFILE, { pantangan: ['lutut'], auto: false })));
  assert.equal(r.programGen.light, true);
  assert.equal(r.programGen.reasons, undefined, 'reasons are coach-only');
  assert.equal(JSON.stringify(r).includes('Lutut kiri'), false);
  assert.equal(r.programGen.auto, true, 'auto cannot be switched through the profile call');
  assert.ok(r.program.days[0].items.some(i => /Leg Press|Squat/.test(i.gerakan)), 'client cannot add coach restrictions');
  env.now = Date.now() + 10000;
  assert.throws(() => env.call('saveMyProgramProfile', mt, { hari: 6 }), /2, 3, atau 4/);
  const admin = j(env.call('getProgramGenPreview', env.adminToken(), 'PT-A'));
  assert.deepEqual(admin.reasons, ['parq', 'cedera']);
});

test('coach always wins: a coach program is not overwritten; the client can accept auto, coach days move to own routines', () => {
  const { env, mt } = setup();
  env.call('saveMemberProgram', env.adminToken(), 'PT-A', '# Hari Coach\nSquat | 3x10');
  let r = j(env.call('saveMyProgramProfile', mt, PROFILE));
  assert.equal(r.skipped, 'coach');
  assert.equal(r.program.days[0].hari, 'Hari Coach');
  assert.equal(r.programGen.hasCoachProgram, true);
  r = j(env.call('acceptAutoProgram', mt));
  assert.equal(r.programGen.isAuto, true);
  assert.deepEqual(r.program.own.map(d => d.hari), ['Hari Coach']);
  assert.ok(r.program.days[0].hari.startsWith('Full Body'));
});

test('switching auto off keeps the program as a normal one; swap keeps the choice; coach can regenerate and restrict', () => {
  const { env, mt } = setup();
  env.call('submitMyHealthForm', mt, HEALTH_OK);
  env.call('saveMyProgramProfile', mt, Object.assign({}, PROFILE, { hari: 2 }));
  let r = j(env.call('swapMyProgramExercise', mt, 'lutut', 'gym:squat-machine'));
  r.program.days.forEach(d => assert.ok(d.items.some(i => i.gerakan === 'Squat (Machine)')));
  assert.throws(() => env.call('swapMyProgramExercise', mt, 'lutut', 'gym:lat-pulldown'), /tidak bisa dipakai/);
  r = j(env.call('setMyProgramAuto', mt, false));
  assert.equal(r.programGen.isAuto, false);
  assert.equal(r.program.days.length, 2, 'program kept');
  assert.ok(env.sheet('ProgramItems').rows.slice(1).every(x => x[21] === ''));
  const t = env.adminToken();
  let a = j(env.call('setClientProgramAuto', t, 'PT-A', { auto: true, pantangan: ['lutut'] }));
  assert.deepEqual(a.pantangan, ['lutut']);
  a = j(env.call('regenerateProgram', t, 'PT-A'));
  a.preview.forEach(d => assert.ok(!d.items.some(i => /Leg Press|Squat|Leg Extension/.test(i.gerakan))));
  assert.ok(a.gaps.includes('lutut'));
});

test('load goes up only after the coach marks Form OK and the client is not unsure (rule 9a)', () => {
  const { env, mt } = setup();
  env.call('submitMyHealthForm', mt, HEALTH_OK);
  env.call('saveMyProgramProfile', mt, Object.assign({}, PROFILE, { hari: 2 }));
  const t = env.adminToken();
  const prog = j(env.call('getMemberProgram', t, 'PT-A'));
  const lp = prog.days[0].items.find(i => i.gerakan === 'Leg Press (45°)');
  const full = Array.from({ length: lp.set }, () => ({ berat: 60, rep: 12 }));
  const today = env.call('_todayWib_');
  env.call('saveWorkoutLog', t, 'PT-A', today, '', [{ exId: '0739', gerakan: 'Leg Press (45°)', sets: full }]);
  let w = j(env.call('getWorkoutLog', t, 'PT-A'));
  assert.notEqual(w.progress['ex:0739'].step, 'beban', 'no load step without Form OK');
  assert.equal(w.suggest['ex:0739'], undefined);
  env.call('setFormOk', t, 'PT-A', 'ex:0739', true);
  w = j(env.call('getWorkoutLog', t, 'PT-A'));
  assert.ok(['set', 'beban'].includes(w.progress['ex:0739'].step));
  env.call('saveWorkoutLog', t, 'PT-A', today, '', [{ exId: '0739', gerakan: 'Leg Press (45°)', form: 'ragu', sets: full }]);
  w = j(env.call('getWorkoutLog', t, 'PT-A'));
  if (w.progress['ex:0739'].step !== 'set') assert.equal(w.progress['ex:0739'].step, 'tahan');
  assert.throws(() => env.call('setFormOk', t, 'PT-A', 'bad', true), /tidak valid/);
});

test('portal and panel bundles carry programGen; owner switch off hides generation', () => {
  const { env, mt } = setup();
  const more = j(env.call('getPortalMore', mt));
  assert.equal(more.programGen.enabled, true);
  assert.equal(more.programGen.needsProfile, true);
  assert.ok(more.programGen.options.lutut.length >= 2);
  const bundle = j(env.call('getClientBundle', env.adminToken(), 'PT-A'));
  assert.ok(Array.isArray(bundle.programGen.preview));
  env.props.PROGRAM_AUTO_ENABLED = 'false';
  const r = j(env.call('saveMyProgramProfile', mt, PROFILE));
  assert.equal(r.programGen.enabled, false);
  assert.equal(r.program.days.length, 0, 'no program written while the owner has it off');
});

test('daily job: generates for profiled clients without a program, never touches coach programs, runs once a day', () => {
  const { env, mt } = setup();
  const md = env.sheet('MemberData').rows;
  const a = md.find(r => r[0] === 'PT-A'), b = md.find(r => r[0] === 'PT-B');
  while (a.length < 43) a.push(''); while (b.length < 43) b.push('');
  a[32] = 'pemula-banget'; a[33] = '2'; b[32] = 'pemula-banget';
  env.call('saveMemberProgram', env.adminToken(), 'PT-B', '# Coach\nSquat | 3x10');
  assert.equal(env.call('runProgramAutoJob_', {}), true);
  assert.ok(j(env.call('getMyProgram', mt)).days.length >= 2);
  assert.equal(j(env.call('getMemberProgram', env.adminToken(), 'PT-B')).days[0].hari, 'Coach');
});

test('doPost whitelist exposes the new member functions only', () => {
  const env = seededEnv();
  const mt = env.memberToken(KEY_A);
  const post = body => JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify(body) } }).content);
  const r = post({ fn: 'getMyProgramProfile', args: [mt] });
  assert.equal(r.ok, true);
  assert.equal(r.data.needsProfile, true);
  assert.equal(post({ fn: 'getMyProgramProfile', args: ['nope'] }).auth, true);
  ['regenerateProgram', 'setFormOk', 'getProgramGenPreview'].forEach(fn => assert.equal(post({ fn, args: [env.adminToken(), 'PT-A'] }).ok, false, fn));
});

test('coach hub lists light-mode auto clients and new-program events, first names only, no health answers', () => {
  const { env, mt } = setup();
  env.call('submitMyHealthForm', mt, Object.assign({}, HEALTH_OK, { q: ['ya', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak'], injuries: 'Lutut kiri' }));
  env.call('saveMyProgramProfile', mt, PROFILE);
  const hub = j(env.call('getCoachHub', env.adminToken()));
  assert.equal(hub.programAuto.light.length, 1);
  assert.equal(hub.programAuto.light[0].memberId, 'PT-A');
  assert.equal(/\s/.test(hub.programAuto.light[0].name), false, 'first name only');
  assert.equal(hub.programAuto.events[0].jenis, 'baru');
  assert.equal(JSON.stringify(hub.programAuto).includes('Lutut'), false);
  assert.equal(JSON.stringify(hub.programAuto).includes('parq'), false);
  // a second generation of an already-auto program is not a new event
  env.now = Date.now() + 10000;
  env.call('saveMyProgramProfile', mt, Object.assign({}, PROFILE, { hari: 2 }));
  assert.equal(j(env.call('getCoachHub', env.adminToken())).programAuto.events.length, 1);
  // owner switch off → empty
  env.props.PROGRAM_AUTO_ENABLED = 'false';
  assert.deepEqual(j(env.call('getCoachHub', env.adminToken())).programAuto, { light: [], events: [] });
});

test('T-1615: a "pemula" client gets a full program from the owner\'s equipment (dumbbells, cables) with no missing pattern', () => {
  const { env, mt } = setup();
  env.call('submitMyHealthForm', mt, HEALTH_OK);
  env.call('saveMyProgramProfile', mt, Object.assign({}, PROFILE, { level: 'pemula', hari: 3, durasi: 60 }));
  const g = j(env.call('getProgramGenPreview', env.adminToken(), 'PT-A'));
  assert.equal(g.light, false);
  assert.deepEqual(g.gaps.filter(x => x !== 'kardio'), [], 'no equipment gap: ' + JSON.stringify(g.gaps));
  const names = g.preview.flatMap(d => d.items.map(i => i.gerakan));
  assert.ok(names.some(n => /Dumbbell|Cable|Push Up|Seated Row \(Machine\)/.test(n)), 'uses the newly switched-on equipment: ' + names.join(', '));
  assert.ok(!names.some(n => /Chest Press \(Machine\)|Shoulder Press \(Machine\)/.test(n)), 'never machines the gym does not have');
});
