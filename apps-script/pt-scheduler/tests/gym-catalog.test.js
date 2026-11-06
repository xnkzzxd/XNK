'use strict';
// Fase U (T-1602): katalog alat gym (GymExercises): seed, validasi, ubah, aktif/nonaktif.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { seededEnv } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

test('seed: the owner\'s 8 beginner exercises, cardio and the owner\'s equipment are active; chest/shoulder machines and later levels are off', () => {
  const env = seededEnv();
  const c = j(env.call('getGymCatalog', env.adminToken()));
  const on = c.items.filter(x => x.aktif);
  assert.deepEqual(on.filter(x => x.level === 'pemula-banget' && x.pola !== 'kardio').map(x => x.nama).sort(), ['Chest Fly (Machine)', 'Hip Thrust (Machine)', 'Incline Push Up', 'Lat Pulldown (Cable)', 'Leg Extension (Machine)', 'Leg Press (45°)', 'Seated Cable Row', 'Squat (Machine)']);
  assert.deepEqual(on.filter(x => x.pola === 'kardio').map(x => x.nama).sort(), ['Stationary Bike', 'Treadmill']);
  // T-1615: owner's equipment (dumbbells + bench, cables, abductor, row / leg curl / calf machines) and bodyweight lifts
  assert.deepEqual(on.filter(x => x.level === 'pemula').map(x => x.id).sort(), ['gym:cable-curl', 'gym:calf-raise-machine', 'gym:db-bench-press', 'gym:db-lateral-raise',
    'gym:db-rdl', 'gym:db-row', 'gym:db-shoulder-press', 'gym:dead-bug', 'gym:goblet-squat', 'gym:hip-abduction', 'gym:push-up', 'gym:seated-leg-curl', 'gym:seated-row-machine', 'gym:triceps-pushdown']);
  const by = Object.fromEntries(c.items.map(x => [x.id, x]));
  assert.equal(by['gym:chest-press-machine'].aktif, false, 'no chest press machine in the gym');
  assert.equal(by['gym:shoulder-press-machine'].aktif, false, 'no shoulder press machine in the gym');
  assert.ok(c.items.filter(x => x.level === 'menengah').every(x => !x.aktif), 'intermediate lifts wait for the owner');
  j(env.call('getGymCatalog', env.adminToken()));
  assert.equal(env.sheet('GymExercises').rows.length, c.items.length + 1, 'seeding happens once');
});

test('an older seeded sheet gets the owner\'s equipment once; lifts the owner turns off later stay off', () => {
  const env = seededEnv();
  j(env.call('getGymCatalog', env.adminToken()));
  const sh = env.sheet('GymExercises');
  // simulate the sheet as seeded before T-1615: proposals off, no shoulder press row, no marker
  sh.rows = sh.rows.filter(r => r[0] !== 'gym:db-shoulder-press');
  sh.rows.forEach((r, i) => { if (i && String(r[3]) === 'pemula') r[13] = 'tidak'; });
  delete env.props.GYM_OWNER_EQUIP_V1;
  let c = j(env.call('getGymCatalog', env.adminToken()));
  let by = Object.fromEntries(c.items.map(x => [x.id, x]));
  assert.equal(by['gym:db-bench-press'].aktif, true);
  assert.equal(by['gym:db-shoulder-press'].aktif, true, 'missing seed row is added');
  assert.equal(by['gym:db-shoulder-press'].pola, 'dorong-v');
  assert.equal(by['gym:chest-press-machine'].aktif, false);
  assert.equal(sh.rows.filter(r => r[0] === 'gym:db-shoulder-press').length, 1);
  env.call('setGymExerciseActive', env.adminToken(), 'gym:cable-curl', false);
  c = j(env.call('getGymCatalog', env.adminToken()));
  by = Object.fromEntries(c.items.map(x => [x.id, x]));
  assert.equal(by['gym:cable-curl'].aktif, false, 'the one-time switch-on never runs again');
  assert.equal(sh.rows.filter(r => r[0] === 'gym:db-shoulder-press').length, 1);
});

test('seed muscles match docs/program/Otot.md for the gym exercises', () => {
  const env = seededEnv();
  const by = Object.fromEntries(j(env.call('getGymCatalog', env.adminToken())).items.map(x => [x.id, x]));
  assert.deepEqual([by['gym:leg-press-45'].utama, by['gym:leg-press-45'].pendukung], [['quads'], ['glutes', 'adductors']]);
  assert.deepEqual([by['gym:hip-thrust-machine'].utama, by['gym:hip-thrust-machine'].pendukung], [['glutes'], ['hamstrings']]);
  assert.deepEqual(by['gym:leg-extension'].pendukung, []);
  const otot = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'program', 'Otot.md'), 'utf8');
  ['Leg Press (45°)', 'Squat (Machine)', 'Hip Thrust (Machine)', 'Incline Push Up', 'Lat Pulldown (Cable)', 'Seated Cable Row', 'Leg Extension (Machine)', 'Chest Fly (Machine)']
    .forEach(n => assert.ok(otot.includes('| ' + n + ' |'), n));
});

test('save: new item gets a slug id, edit keeps order, validation messages', () => {
  const env = seededEnv();
  const t = env.adminToken();
  let c = j(env.call('saveGymExercise', t, { nama: 'Leg Curl Lying', level: 'pemula', pola: 'isolasi', utama: ['hamstrings'], jenis: 'beban', repMin: 10, repMax: 15 }));
  const added = c.items.find(x => x.nama === 'Leg Curl Lying');
  assert.equal(added.id, 'gym:leg-curl-lying');
  assert.equal(added.aktif, true);
  c = j(env.call('saveGymExercise', t, Object.assign({}, added, { nama: 'Lying Leg Curl (Machine)', exId: '0586' })));
  assert.equal(c.items.find(x => x.id === 'gym:leg-curl-lying').nama, 'Lying Leg Curl (Machine)');
  const bad = (o, re) => assert.throws(() => env.call('saveGymExercise', t, Object.assign({ nama: 'X', level: 'pemula', pola: 'isolasi', utama: ['quads'] }, o)), re);
  bad({ level: 'pro' }, /Level tidak dikenal/);
  bad({ pola: 'lompat' }, /Pola gerakan/);
  bad({ utama: [] }, /Otot utama wajib/);
  bad({ utama: ['jantung'] }, /tidak dikenal/);
  bad({ pendukung: ['quads'] }, /utama dan pendukung/);
  bad({ repMin: 12, repMax: 8 }, /Rep maksimal/);
  bad({ hindari: ['lutut', 'kepala'] }, /Tag hindari/);
  bad({ varian: 'gym:tidak-ada' }, /Varian berikut/);
  bad({ id: 'gym:nope' }, /tidak ditemukan/);
});

test('active switch: owner marks equipment the gym has', () => {
  const env = seededEnv();
  const t = env.adminToken();
  let c = j(env.call('setGymExerciseActive', t, 'gym:chest-press-machine', true));
  assert.equal(c.items.find(x => x.id === 'gym:chest-press-machine').aktif, true);
  c = j(env.call('setGymExerciseActive', t, 'gym:leg-extension', false));
  assert.equal(c.items.find(x => x.id === 'gym:leg-extension').aktif, false);
  assert.throws(() => env.call('setGymExerciseActive', t, 'gym:nope', true), /tidak ditemukan/);
});
