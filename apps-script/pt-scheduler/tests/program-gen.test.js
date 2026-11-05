'use strict';
// Fase U (T-1605): generator program otomatis — satu test atau lebih per aturan di docs/program/Rules.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const env = seededEnv();
const CAT = j(env.call('getGymCatalog', env.adminToken())).items;
const gen = (profile, extra) => j(env.call('_pgenProgram_', Object.assign({ profile: Object.assign({ level: 'pemula-banget', hari: 2, durasi: 45, tujuan: 'otot', fokus: [], pantangan: [], tukar: {}, blokKe: 1 }, profile), catalog: CAT, safety: { light: false, reasons: [] } }, extra || {})));
const names = d => d.items.map(i => i.gerakan);

test('rule 5: every targeted muscle reaches the level\'s weekly lower bound, never above the upper bound (2/3/4 days × 30/45/60 min)', () => {
  for (const hari of [2, 3, 4]) for (const durasi of [30, 45, 60]) for (const tujuan of ['otot', 'kekuatan', 'fatloss', 'bugar']) {
    const r = gen({ hari, durasi, tujuan });
    for (const m of Object.keys(r.targets)) {
      assert.ok(r.volume[m] >= 6 - 1e-9, `${m} ${r.volume[m]} < 6 (${hari}d ${durasi}m ${tujuan})`);
      assert.ok(r.volume[m] <= 8 + 1e-9, `${m} ${r.volume[m]} > 8`);
    }
    assert.deepEqual(Object.keys(r.targets).sort(), ['glutes', 'lats', 'pectorals', 'quads', 'upper back'], 'targets = muscles with a main exercise at this level');
  }
});

test('rule 5: intermediate level uses 12–20 and block number adds one set per block', () => {
  const pemula = CAT.map(x => Object.assign({}, x, { aktif: x.aktif || x.level === 'pemula' }));
  const r1 = gen({ level: 'pemula', blokKe: 1 }, { catalog: pemula });
  Object.values(r1.targets).forEach(t => assert.equal(t, 8));
  const r3 = gen({ level: 'pemula', blokKe: 3 }, { catalog: pemula });
  Object.values(r3.targets).forEach(t => assert.equal(t, 10));
  const r9 = gen({ level: 'pemula', blokKe: 9 }, { catalog: pemula });
  Object.values(r9.targets).forEach(t => assert.equal(t, 12), 'never above the upper bound');
});

test('rule 4: beginner sessions are compound-first: knee, hip, push, pull; no isolation when compounds cover the volume', () => {
  const r = gen({ hari: 3 });
  r.days.forEach(d => {
    assert.deepEqual(names(d).slice(0, 4).map(n => CAT.find(c => c.nama === n).pola).map(p => p.split('-')[0]), ['lutut', 'pinggul', 'dorong', 'tarik']);
    assert.ok(!names(d).includes('Leg Extension (Machine)') && !names(d).includes('Chest Fly (Machine)'));
  });
});

test('rule 4 + focus: a focus muscle gets the upper bound and may get one isolation exercise', () => {
  const r = gen({ hari: 2, fokus: ['quads'] });
  assert.equal(r.targets.quads, 8);
  assert.ok(r.volume.quads >= 8 - 1e-9);
  assert.equal(r.targets.pectorals, 6);
});

test('rule 3 + 9b: variants rotate systematically across days (A leg press / B machine squat, A pulldown / B row)', () => {
  const r = gen({ hari: 2 });
  assert.ok(names(r.days[0]).includes('Leg Press (45°)') && names(r.days[1]).includes('Squat (Machine)'));
  assert.ok(names(r.days[0]).includes('Lat Pulldown (Cable)') && names(r.days[1]).includes('Seated Cable Row'));
});

test('rule 16: the client\'s swap is kept', () => {
  const r = gen({ hari: 2, tukar: { lutut: 'gym:squat-machine' } });
  r.days.forEach(d => assert.ok(names(d).includes('Squat (Machine)')));
});

test('rule 10: movement restrictions remove exercises; a missing pattern is reported as a gap', () => {
  const r = gen({ pantangan: ['lutut'] });
  r.days.forEach(d => assert.ok(!names(d).some(n => /Leg Press|Squat|Leg Extension/.test(n))));
  assert.ok(r.gaps.includes('lutut'));
});

test('rule 6 + 7: reps and rest by level and goal; strength 4–6 only from level pemula', () => {
  const b = gen({ tujuan: 'kekuatan' }).days[0].items[0];
  assert.deepEqual([b.repMin, b.repMax, b.rest], [8, 12, 120], 'beginner strength still 8–12');
  const pemula = CAT.map(x => Object.assign({}, x, { aktif: x.aktif || x.level === 'pemula' }));
  const s = gen({ level: 'pemula', tujuan: 'kekuatan' }, { catalog: pemula }).days[0].items[0];
  assert.deepEqual([s.repMin, s.repMax, s.rest], [4, 6, 180]);
  gen({ hari: 3 }).days.forEach(d => d.items.forEach(i => { if (i.jenis !== 'waktu') assert.ok(i.rest >= 90); }));
});

test('rule 13 + 18: fat loss trains like muscle gain plus cardio; muscle gain has no cardio block', () => {
  const f = gen({ tujuan: 'fatloss', hari: 3 }), o = gen({ tujuan: 'otot', hari: 3 });
  f.days.forEach(d => assert.equal(d.items[d.items.length - 1].jenis, 'waktu'));
  assert.equal(f.days[0].items[f.days[0].items.length - 1].repMin, 600, '10 minutes in block 1');
  o.days.forEach(d => assert.ok(d.items.every(i => i.jenis !== 'waktu')));
  assert.deepEqual(f.days[0].items[0].repMin, o.days[0].items[0].repMin, 'no "high reps to burn fat"');
});

test('rule 1 / 19: light mode for PAR-Q yes, missing form, pregnancy and age; light = beginner, 12–15 reps, 4+ RIR, lowest volume', () => {
  assert.deepEqual(j(env.call('_pgenSafety_', null, 30, [])).reasons, ['form-belum']);
  assert.equal(j(env.call('_pgenSafety_', { answers: ['tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak', 'tidak'] }, 30, [])).light, false);
  assert.deepEqual(j(env.call('_pgenSafety_', { answers: ['ya'], injuries: 'lutut' }, 70, ['hamil'])).reasons, ['parq', 'cedera', 'hamil', 'lansia']);
  assert.equal(j(env.call('_pgenSafety_', { answers: [] }, 16, [])).remaja, true);
  const r = gen({ level: 'menengah', hari: 3 }, { safety: { light: true, reasons: ['parq'] } });
  assert.equal(r.level, 'pemula-banget');
  const it = r.days[0].items[0];
  assert.deepEqual([it.repMin, it.repMax], [12, 15]);
  assert.match(it.catatan, /4\+/);
  Object.values(r.targets).forEach(t => assert.equal(t, 6));
  const h = gen({}, { safety: { light: true, hamil: true, reasons: ['hamil'] } });
  h.days.forEach(d => assert.ok(!names(d).includes('Hip Thrust (Machine)'), 'pregnancy avoid-tag'));
});

test('rule 14: volume wins over the chosen session length, with a note', () => {
  const r = gen({ hari: 2, durasi: 30, fokus: ['quads', 'glutes'] });
  assert.ok(Math.max(...r.minutes) > 30);
  assert.ok(r.why.some(w => /Needs about \d+ min/.test(w)));
});

test('rule 22: back after 2+ weeks = lowest volume; 8+ weeks resets the block', () => {
  const r = gen({ blokKe: 4, level: 'pemula-banget' }, { absenceDays: 20 });
  Object.values(r.targets).forEach(t => assert.equal(t, 6));
  assert.ok(r.why.some(w => /Back after a break/.test(w)));
  assert.equal(gen({ blokKe: 4 }, { absenceDays: 60 }).block, 1);
});

test('output is a valid program for the existing validator (_parseProgramDays_), every rule hint in English', () => {
  for (const tujuan of ['otot', 'fatloss']) {
    const r = gen({ hari: 3, tujuan });
    const p = j(env.call('_parseProgramDays_', r.days));
    assert.equal(p.days.length, 3);
    r.days.forEach(d => d.items.forEach(i => assert.match(i.catatan, /^(Leave|Moderate)/)));
  }
});

test('rule 9a: overload order rep → set → load, load only with coach Form OK and no "unsure"', () => {
  const item = { repMin: 8, repMax: 12, jenis: 'beban' };
  const ok = { coachOk: true, lastForm: '' };
  const o = (last, gate, canAdd, sets) => j(env.call('_pgenOverload_', last, item, gate, canAdd, true, false, sets));
  assert.equal(o([], ok, true, 2).step, 'mulai');
  assert.equal(o([{ berat: 40, rep: 12 }, { berat: 40, rep: 10 }], ok, true, 2).step, 'rep');
  assert.equal(o([{ berat: 40, rep: 12 }, { berat: 40, rep: 12 }], ok, true, 2).step, 'set');
  const up = o([{ berat: 40, rep: 12 }, { berat: 40, rep: 12 }], ok, false, 3);
  assert.deepEqual([up.step, up.kg], ['beban', 45], '+5 kg lower body');
  assert.equal(o([{ berat: 40, rep: 12 }], { coachOk: false }, false, 3).step, 'tahan');
  assert.equal(o([{ berat: 40, rep: 12 }], { coachOk: true, lastForm: 'ragu' }, false, 3).step, 'tahan');
  assert.equal(o([{ berat: 40, rep: 6, jenis: 'w' }, { berat: 40, rep: 12 }], ok, false, 3).step, 'beban', 'warm-ups ignored');
  assert.equal(j(env.call('_pgenOverload_', [{ berat: 40, rep: 12 }], item, ok, false, false, true, 3)).step, 'tahan', 'first session back keeps the load');
  assert.equal(j(env.call('_pgenOverload_', [{ berat: 30, rep: 12 }], item, ok, false, false, false, 3)).kg, 32.5, '+2.5 kg upper body');
});

test('rule 9b: stall → add a set while volume allows, then one systematic swap per block, then the coach', () => {
  const flat = [{ e1rm: 50, reps: 10 }, { e1rm: 50, reps: 10 }, { e1rm: 49, reps: 10 }, { e1rm: 50, reps: 10 }];
  assert.equal(env.call('_pgenStall_', flat, true, false, ''), 'add-set');
  assert.equal(env.call('_pgenStall_', flat, false, false, ''), 'swap');
  assert.equal(env.call('_pgenStall_', flat, false, true, ''), 'coach');
  assert.equal(env.call('_pgenStall_', flat, true, false, 'ragu'), 'coach');
  assert.equal(env.call('_pgenStall_', flat.concat([{ e1rm: 52, reps: 10 }]).slice(1), true, false, ''), 'ok');
  assert.equal(env.call('_pgenStall_', flat.slice(0, 3), true, false, ''), 'ok', 'needs 3 sessions after the first');
});

test('rule 9 + 22: block review uses recorded volume, no attendance numbers', () => {
  const t = { quads: 6, lats: 6 };
  const wk = v => [{ quads: v, lats: v }, { quads: v, lats: v }];
  assert.equal(env.call('_pgenReview_', 10, 2, wk(6), t, 8, false, false, 'pemula-banget'), 'keep');
  assert.equal(env.call('_pgenReview_', 28, 2, wk(4), t, 8, false, false, 'pemula-banget'), 'repeat');
  assert.equal(env.call('_pgenReview_', 28, 2, wk(6), t, 8, false, false, 'pemula-banget'), 'next-block');
  assert.equal(env.call('_pgenReview_', 28, 2, wk(8), t, 8, true, false, 'pemula-banget'), 'level-up');
  assert.equal(env.call('_pgenReview_', 28, 2, wk(8), t, 8, true, true, 'pemula-banget'), 'next-block', 'light mode never levels up');
  assert.equal(env.call('_pgenReview_', 28, 2, wk(8), t, 8, false, false, 'pemula-banget'), 'next-block', 'level-up needs load progress with form OK');
  assert.equal(env.call('_pgenReview_', 5, 60, wk(8), t, 8, true, false, 'pemula-banget'), 'restart');
});

test('recorded volume: warm-ups excluded, helpers count half', () => {
  const mm = { 'Leg Press (45°)': { utama: ['quads'], pendukung: ['glutes', 'adductors'] } };
  const v = j(env.call('_pgenRecordedVolume_', [{ gerakan: 'Leg Press (45°)', sets: [{ jenis: 'w' }, {}, {}, {}] }], mm));
  assert.deepEqual(v, { quads: 3, glutes: 1.5, adductors: 1.5 });
});
