'use strict';
// Fase X (T-1902): fungsi murni level, momen, cerita, tugas hari ini, dan lonceng (src/Level.gs).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const env = seededEnv();
const f = name => (...a) => JSON.parse(JSON.stringify(env.context[name](...a)));
const level = f('_levelCalc_'), moments = f('_momentsCalc_'), journey = f('_journeyCalc_'), todo = f('_todoCalc_'), notif = f('_notifCalc_');

test('level: points add up and the ladder matches the mockup (640 points = level 4 Konsisten, 160 to go)', () => {
  const l = level({ sesi: 48, latihan: 20, makan: 30, ukur: 5, minggu: 4 });   // 480 + 80 + 30 + 10 + 20 = 620
  assert.equal(l.poin, 620);
  assert.equal(l.level, 4);
  assert.equal(l.gelar, 'Konsisten');
  assert.deepEqual([l.dari, l.sampai, l.sisa], [400, 800, 180]);
  assert.equal(l.pct, 55);
  assert.deepEqual(l.next, { level: 5, gelar: 'Tangguh' });
  assert.equal(l.rinci.length, 5);
});

test('level: empty input is level 1, the top of the ladder has no next step, bad numbers count as zero', () => {
  const z = level({});
  assert.deepEqual([z.poin, z.level, z.gelar, z.pct], [0, 1, 'Pemula', 0]);
  const top = level({ sesi: 1000 });
  assert.equal(top.level, 10);
  assert.equal(top.next, null);
  assert.deepEqual([top.sampai, top.sisa, top.pct], [null, 0, 100]);
  assert.equal(level({ sesi: -5, latihan: 'x', makan: 2.9 }).poin, 2);
});

test('level never goes down when a count grows', () => {
  let prev = 0;
  for (let n = 0; n < 400; n += 7) { const p = level({ sesi: n, latihan: n, makan: n, ukur: n, minggu: Math.min(n, 52) }).level; assert.ok(p >= prev); prev = p; }
});

test('moments: PRs, session milestones and body changes, newest first', () => {
  const dates = Array.from({ length: 12 }, (x, i) => '2026-09-' + String(i + 1).padStart(2, '0'));
  const m = moments({
    prs: [{ tanggal: '2026-10-02', gerakan: 'Bench Press (Barbell)', berat: 52.5, rep: 5 }],
    sessionDates: dates,
    weight: { first: { tanggal: '2026-09-01', nilai: 80 }, last: { tanggal: '2026-10-05', nilai: 77 }, change: -3 },
    waist: { first: { tanggal: '2026-09-01', nilai: 90 }, last: { tanggal: '2026-09-01', nilai: 90 }, change: 0 }
  });
  assert.deepEqual(m.map(x => x.title), ['Berat turun 3 kg', 'Rekor baru: Bench Press (Barbell) 52,5 kg', 'Sesi ke-10', 'Sesi pertama']);
  assert.equal(m[2].tanggal, '2026-09-10');
  assert.deepEqual(moments({}), []);
  assert.equal(moments({ prs: Array.from({ length: 30 }, (x, i) => ({ tanggal: '2026-08-' + String(i + 1).padStart(2, '0'), gerakan: 'Squat', berat: 40 })) }).length, 12);
});

test('journey: headline from the biggest fact, tiles from weight, a nudge when there is nothing yet', () => {
  const j = journey({ today: '2026-11-13', since: '2026-08-21', streak: 5, completed: 48,
    weight: { first: { tanggal: '2026-09-01', nilai: 72.4 }, last: { tanggal: '2026-11-07', nilai: 68.2 }, change: -4.2 },
    strength: { gerakan: 'Bench Press (Barbell)', first: 40, last: 52 } });
  assert.equal(j.weeks, 12);
  assert.equal(j.eyebrow, '12 minggu bersama XNK');
  assert.equal(j.headline, 'Turun 4,2 kg');
  assert.equal(j.sub, 'Bench Press (Barbell) naik 12 kg · 5 minggu beruntun');
  assert.deepEqual(j.tiles, [{ l: 'Awal', v: '72,4' }, { l: 'Sekarang', v: '68,2' }, { l: 'Selisih', v: '−4,2 kg' }]);
  const e = journey({ today: '2026-11-13' });
  assert.equal(e.headline, 'Mulai catat hari ini');
  assert.ok(e.sub.length > 0);
  assert.deepEqual(e.tiles, []);
});

test('todo: workout, food, coach tasks, booking, rating, renewal and bill rows; done rows go last', () => {
  const t = todo({
    today: '2026-11-13', nextRoutine: 'Push A', workedToday: false,
    nutrition: { on: true, ok: true, eaten: 1240, target: 1900, missing: ['Makan malam'] },
    tasks: [{ id: 'T1', title: 'Jalan 8.000 langkah', dueDate: '2026-11-13', status: 'todo', overdue: false },
      { id: 'T2', title: 'Peregangan', dueDate: '', status: 'done', completedAt: '2026-11-13T01:00:00.000Z' },
      { id: 'T3', title: 'Lama', dueDate: '', status: 'done', completedAt: '2026-11-01T01:00:00.000Z' }],
    hasUpcoming: true, quotaLeft: 2, total: 12, renewalOpen: false, pendingRating: { scheduleId: 'S9' }, evalEligible: false, billsRemaining: 150000
  });
  assert.deepEqual(t.map(x => x.id), ['latihan', 'makan', 'pr:T1', 'nilai', 'perpanjang', 'tagihan', 'pr:T2']);
  assert.equal(t[0].act, 'Mulai');
  assert.equal(t[1].title, 'Makan: 1.240 dari 1.900 kkal');
  assert.equal(t[1].sub, 'Makan malam belum dicatat');
  assert.equal(t[2].sub, 'Tenggat hari ini');
  assert.equal(t[4].sub, 'Sisa 2 sesi');
  assert.ok(t[4].danger);
  assert.equal(t[5].sub, 'Sisa Rp 150.000');
  assert.ok(t[6].done);
});

test('todo: booking only when nothing is upcoming and quota allows; no renewal for unlimited packages or while one is pending', () => {
  const ids = c => todo(c).map(x => x.id);
  assert.deepEqual(ids({ hasUpcoming: false, quotaLeft: 3, total: 12 }), ['booking']);
  assert.deepEqual(ids({ hasUpcoming: false, quotaLeft: null, total: 0 }), ['booking']);
  assert.deepEqual(ids({ hasUpcoming: false, quotaLeft: 0, total: 12 }), ['perpanjang']);
  assert.deepEqual(ids({ hasUpcoming: true, quotaLeft: 1, total: 12, renewalOpen: true }), []);
  assert.deepEqual(ids({ hasUpcoming: true, quotaLeft: 0, remaining: 5, total: 12 }), [], 'booked ahead but 5 sessions still unused: no renewal yet');
  assert.deepEqual(todo({ hasUpcoming: true, quotaLeft: 0, remaining: 2, total: 12 }).map(x => x.sub), ['Sisa 2 sesi']);
  assert.deepEqual(ids({ hasUpcoming: true, nutrition: { on: true, ok: false } }), ['gizi-data']);
  const done = todo({ hasUpcoming: true, workedToday: true, nextRoutine: 'Pull A', nutrition: { on: true, ok: true, eaten: 1800, target: 1900 } });
  assert.ok(done.every(x => x.done));
});

test('notif: dated items are fresh after the last open, reminders once a day, old items drop out', () => {
  const base = {
    today: '2026-11-13', seenAt: '2026-11-12T08:00:00.000Z',
    content: [{ id: 'C1', judul: 'Libur akhir tahun', tipe: 'pengumuman', dibuat: '2026-11-12T09:00:00.000Z' }, { id: 'C0', judul: 'Lama', tipe: 'tips', dibuat: '2026-10-01T00:00:00.000Z' }],
    lastWeighDate: '2026-11-01', nutrition: { on: true, ok: true }, healthDone: false,
    renewal: { status: 'disetujui', decidedAt: '2026-11-02T03:00:00.000Z', createdAt: '2026-11-01T03:00:00.000Z', packageName: 'Privat 12 sesi' },
    billsRemaining: 0, moments: [{ id: 'pr:x', tanggal: '2026-11-12', title: 'Rekor baru: Squat 60 kg' }]
  };
  const n = notif(base);
  assert.deepEqual(n.items.map(x => x.id), ['info:C1', 'ukur', 'kesehatan', 'capai:pr:x', 'paket:2026-11-02T03:00:00.000Z']);
  assert.equal(n.count, 3);
  assert.equal(n.items[1].sub, 'Terakhir 12 hari lalu');
  assert.equal(n.items[3].fresh, false);                              // momen bertanggal 12 Nov, lonceng dibuka 12 Nov 08.00 (tanggal saja ≤ waktu buka)
  const seenToday = notif(Object.assign({}, base, { seenAt: '2026-11-13T02:00:00.000Z' }));
  assert.equal(seenToday.count, 0);
  const lateNight = notif(Object.assign({}, base, { today: '2026-11-14', seenAt: '2026-11-13T17:30:00.000Z', content: [], moments: [], renewal: null }));
  assert.equal(lateNight.count, 0, 'opened at 00:30 WIB on the 14th: the daily reminders are already seen that day');
  const lateBefore = notif(Object.assign({}, base, { today: '2026-11-14', seenAt: '2026-11-13T16:30:00.000Z', content: [], moments: [], renewal: null }));
  assert.ok(lateBefore.count > 0, 'opened at 23:30 WIB on the 13th: the reminders are new again on the 14th');
  const never = notif(Object.assign({}, base, { seenAt: '', lastWeighDate: '' }));
  assert.equal(never.count, never.items.length);
  assert.equal(never.items.find(x => x.id === 'ukur').title, 'Catat berat pertama');
});
