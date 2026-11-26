'use strict';
// Fase AD1 (T-2404…T-2411): klien ditahan (cuti / sakit / berhenti). docs/coachkit/Design.md §AD1.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B, inDays, wibSlot } = require('./fixtures');

function setup() {
  const env = seededEnv();
  return { env, ani: env.memberToken(KEY_A), budi: env.memberToken(KEY_B), admin: env.adminToken() };
}
const j = x => JSON.parse(JSON.stringify(x));
const today = env => env.call('_todayWib_');
const day = (env, n) => env.call('_addDaysIso_', today(env), n);
const holdRows = env => (env.sheet('ClientHolds') ? env.sheet('ClientHolds').rows.slice(1) : []);
const unthrottle = (env, id) => env.context.CacheService.getScriptCache().remove('throttle_hold_' + id);

// ── pure helpers ───────────────────────────────────────────────────────────────

test('pure: covers, map, overlap, state and label follow the dates', () => {
  const { env } = setup();
  const H = (id, m, jenis, mulai, sampai, status) => ({ id, memberId: m, jenis, mulai, sampai, status: status || 'ok' });
  const hs = [H('1', 'A', 'cuti', '2026-12-05', '2026-12-12'), H('2', 'B', 'sakit', '2026-12-01', ''), H('3', 'C', 'cuti', '2026-12-05', '2026-12-12', 'tolak')];
  assert.equal(env.call('_holdActiveOn_', hs, 'A', '2026-12-04'), null);
  assert.equal(env.call('_holdActiveOn_', hs, 'A', '2026-12-05').id, '1');
  assert.equal(env.call('_holdActiveOn_', hs, 'A', '2026-12-12').id, '1');
  assert.equal(env.call('_holdActiveOn_', hs, 'A', '2026-12-13'), null, 'active again the day after Sampai');
  assert.equal(env.call('_holdActiveOn_', hs, 'B', '2030-01-01').id, '2', 'no end date = until ended');
  assert.deepEqual(Object.keys(env.call('_holdMap_', hs, '2026-12-06')).sort(), ['A', 'B'], 'rejected holds never count');
  assert.equal(env.call('_holdOverlap_', hs, 'A', '2026-12-10', '2026-12-20', ''), true);
  assert.equal(env.call('_holdOverlap_', hs, 'A', '2026-12-13', '2026-12-20', ''), false);
  assert.equal(env.call('_holdOverlap_', hs, 'A', '2026-12-10', '2026-12-20', '1'), false, 'editing itself is no overlap');
  assert.equal(env.call('_holdOverlap_', hs, 'B', '2031-01-01', '', ''), true, 'open end overlaps everything after');
  assert.equal(env.call('_holdState_', hs[0], '2026-12-01'), 'rencana');
  assert.equal(env.call('_holdState_', hs[0], '2026-12-08'), 'aktif');
  assert.equal(env.call('_holdState_', hs[0], '2026-12-13'), 'lewat');
  assert.equal(env.call('_holdLabel_', hs[0], '2026-12-08'), 'Cuti s/d Sab 12 Des');
  assert.equal(env.call('_holdLabel_', hs[0], '2026-12-01'), 'Cuti mulai Sab 5 Des');
  assert.equal(env.call('_holdLabel_', hs[1], '2026-12-08'), 'Sakit');
  assert.equal(env.call('_holdLabel_', H('4', 'D', 'berhenti', '2026-12-01', ''), '2026-12-08'), 'Nonaktif');
});

test('pure: a week counts as held from 4 held days; held days per month', () => {
  const { env } = setup();
  const hs = [{ id: '1', memberId: 'A', jenis: 'cuti', mulai: '2026-11-30', sampai: '2026-12-03', status: 'ok' },   // Mon–Thu
    { id: '2', memberId: 'A', jenis: 'cuti', mulai: '2026-12-10', sampai: '2026-12-12', status: 'ok' }];              // Thu–Sat (3 days)
  const w = j(env.call('_holdHeldWeeks_', hs, 'A', '2026-12-31'));
  assert.deepEqual(Object.keys(w), ['2026-11-30']);
  assert.deepEqual(j(env.call('_holdHeldWeeks_', hs, 'A', '2026-12-01')), {}, 'only days up to today count');
  assert.deepEqual(j(env.call('_holdDaysInMonth_', hs, 'A', '2026-12')), { held: 6, days: 31 });
  assert.deepEqual(j(env.call('_holdDaysInMonth_', hs, 'A', '2026-11')), { held: 1, days: 30 });
});

// ── admin ─────────────────────────────────────────────────────────────────────

test('coach puts a client on Cuti: validated, stored, shown in the bootstrap without the note', () => {
  const { env, admin } = setup();
  const res = env.call('setClientHold', admin, 'PT-A', { jenis: 'cuti', mulai: today(env), sampai: day(env, 6), note: 'Ke Bali' });
  assert.equal(res.status, 'success');
  assert.equal(res.hold.state, 'aktif');
  assert.equal(res.hold.note, 'Ke Bali', 'the coach sees the note on the client page');
  assert.equal(holdRows(env).length, 1);
  assert.equal(holdRows(env)[0][6], 'ok');
  const boot = j(env.call('getAdminBootstrap', admin));
  assert.equal(boot.holds.length, 1);
  assert.equal(boot.holds[0].memberId, 'PT-A');
  assert.ok(boot.holds[0].label.startsWith('Cuti s/d '));
  assert.ok(!('note' in boot.holds[0]), 'no note in the bootstrap (it lands in the device cache)');
  assert.ok(!JSON.stringify(boot).includes('Ke Bali'));
  const bundle = j(env.call('getClientBundle', admin, 'PT-A'));
  assert.equal(bundle.holds[0].note, 'Ke Bali');
  assert.throws(() => env.call('setClientHold', admin, 'PT-A', { jenis: 'cuti', mulai: day(env, 3), sampai: day(env, 9) }), /cuti lain/);
  assert.throws(() => env.call('setClientHold', admin, 'PT-B', { jenis: 'libur' }), /jenis/i);
  assert.throws(() => env.call('setClientHold', admin, 'PT-B', { jenis: 'cuti', mulai: day(env, 5), sampai: day(env, 2) }), /sebelum tanggal mulai/);
  assert.throws(() => env.call('setClientHold', admin, 'PT-B', { jenis: 'cuti', mulai: day(env, -40) }), /30 hari/);
  assert.throws(() => env.call('setClientHold', admin, 'PT-B', { jenis: 'cuti', note: 'x'.repeat(201) }), /Catatan/);
  assert.throws(() => env.call('setClientHold', '', 'PT-B', { jenis: 'cuti' }), /admin|sesi|login/i);
});

test('the dry run lists booked sessions in the range; the save cancels the checked ones and the quota comes back', () => {
  const { env, admin } = setup();
  const rows = env.sheet('Schedules').rows;
  rows.push(['SCH-A2', 'PT-A', 'Ani Anggraini', '6281111111111', inDays(20), inDays(20.04), '', 'read', 'C-1', 'Rizky', '', '']);
  const dry = env.call('setClientHold', admin, 'PT-A', { jenis: 'sakit', mulai: today(env), sampai: day(env, 10) }, { dry: true });
  assert.deepEqual(dry.inRange.map(s => s.id), ['SCH-A1'], 'only the session inside the range');
  assert.equal(holdRows(env).length || 0, 0, 'a dry run writes nothing');
  const res = env.call('setClientHold', admin, 'PT-A', { jenis: 'sakit', mulai: today(env), sampai: day(env, 10) }, { cancel: ['SCH-A1', 'SCH-A2', 'SCH-B1'] });
  assert.equal(res.cancelled, 1, 'sessions outside the range or of another client are left alone');
  const ids = env.sheet('Schedules').rows.slice(1).map(r => r[0]);
  assert.ok(!ids.includes('SCH-A1') && ids.includes('SCH-A2') && ids.includes('SCH-B1'));
  assert.equal(holdRows(env)[0][11], 'SCH-A1');
  assert.equal(res.inRange.length, 0);
});

test('editing a hold, ending it today, ending a planned one, deleting a mistake', () => {
  const { env, admin } = setup();
  const a = env.call('setClientHold', admin, 'PT-A', { jenis: 'cuti', mulai: day(env, -3), sampai: day(env, 5) });
  const ed = env.call('setClientHold', admin, 'PT-A', { id: a.hold.id, jenis: 'sakit', mulai: day(env, -3), sampai: '', note: 'Flu' });
  assert.equal(ed.hold.jenis, 'sakit');
  assert.equal(ed.hold.sampai, '');
  assert.equal(holdRows(env).length, 1, 'an edit does not add a row');
  const end = env.call('endClientHold', admin, a.hold.id);
  assert.equal(end.holds[0].sampai, day(env, -1), 'ends yesterday: active again today');
  assert.equal(end.holds[0].state, 'lewat');
  assert.equal(j(env.call('getAdminBootstrap', admin)).holds.length, 0);
  const p = env.call('setClientHold', admin, 'PT-B', { jenis: 'berhenti', mulai: day(env, 3) });
  assert.equal(p.hold.state, 'rencana');
  assert.equal(p.hold.sampai, '', 'berhenti never has an end date');
  const e2 = env.call('endClientHold', admin, p.hold.id);
  assert.equal(e2.holds.length, 0, 'a planned hold that never started becomes batal and leaves the history');
  const b = env.call('setClientHold', admin, 'PT-B', { jenis: 'cuti', mulai: today(env) });
  env.call('deleteClientHold', admin, b.hold.id);
  assert.equal(j(env.call('getAdminBootstrap', admin)).holds.length, 0);
});

// ── klien ─────────────────────────────────────────────────────────────────────

test('a client asks for Cuti; Telegram and push carry no note; the coach approves and the portal shows it', () => {
  const { env, ani, admin } = setup();
  env.props.TELEGRAM_BOT_TOKEN = 'x'; env.props.TELEGRAM_CHAT_ID = '1';
  assert.throws(() => env.call('requestMyHold', ani, { jenis: 'cuti', mulai: today(env) }), /sampai kapan/);
  assert.throws(() => env.call('requestMyHold', ani, { jenis: 'berhenti', mulai: today(env), sampai: day(env, 3) }), /jenis/i);
  const res = env.call('requestMyHold', ani, { jenis: 'cuti', mulai: day(env, 1), sampai: day(env, 7), note: 'Mudik, ibu sakit' });
  assert.equal(res.hold.request.status, 'minta');
  assert.equal(res.hold.request.note, 'Mudik, ibu sakit', 'the client sees their own note');
  const sent = JSON.stringify(env.fetches || []);
  assert.ok(sent.includes('MINTA CUTI') && sent.includes('Ani'), 'Telegram tells the coach');
  assert.ok(!sent.includes('Mudik') && !sent.includes('ibu sakit') && !sent.includes('Anggraini'), 'first name only, never the note');
  assert.equal(j(env.call('getAdminBootstrap', admin)).holds[0].status, 'minta');
  const boot = j(env.call('getPortalBootstrap', ani));
  assert.equal(boot.hold.request.status, 'minta');
  assert.equal(boot.hold.current, null);
  const dec = env.call('decideHoldRequest', admin, res.hold.request.id, true, { cancel: ['SCH-A1'] });
  assert.equal(dec.status, 'success');
  assert.equal(env.call('decideHoldRequest', admin, res.hold.request.id, true).status, 'success', 'the same decision again is a success (retry)');
  assert.throws(() => env.call('decideHoldRequest', admin, res.hold.request.id, false), /sudah diputuskan/);
  const after = j(env.call('getPortalBootstrap', ani));
  assert.equal(after.hold.current.state, 'rencana');
  assert.equal(after.hold.decided.status, 'ok');
  assert.equal(after.hold.request, null);
});

test('one open request at a time, the client can cancel it, a length limit applies, and other clients cannot touch it', () => {
  const { env, ani, budi } = setup();
  const res = env.call('requestMyHold', ani, { jenis: 'sakit', mulai: today(env), note: '' });
  assert.throws(() => env.call('requestMyHold', ani, { jenis: 'cuti', mulai: day(env, 20), sampai: day(env, 22) }), /Tunggu sebentar/, 'throttled');
  unthrottle(env, 'PT-A');
  assert.throws(() => env.call('requestMyHold', ani, { jenis: 'cuti', mulai: day(env, 20), sampai: day(env, 22) }), /menunggu jawaban coach/);
  assert.throws(() => env.call('cancelMyHoldRequest', budi, res.hold.request.id), /tidak ditemukan/);
  const c = env.call('cancelMyHoldRequest', ani, res.hold.request.id);
  assert.equal(c.hold.request, null);
  assert.throws(() => env.call('requestMyHold', ani, { jenis: 'cuti', mulai: today(env), sampai: day(env, 70) }), /paling lama 60 hari/);
  assert.throws(() => env.call('requestMyHold', ani, { jenis: 'cuti', mulai: day(env, -1), sampai: day(env, 3) }), /sebelum hari ini/);
});

test('"Saya sudah kembali" ends the own Cuti today; Nonaktif can only be ended by the coach', () => {
  const { env, ani, budi, admin } = setup();
  env.call('setClientHold', admin, 'PT-A', { jenis: 'cuti', mulai: day(env, -5), sampai: day(env, 5) });
  const r = env.call('endMyHold', ani);
  assert.equal(r.hold.current, null);
  assert.equal(holdRows(env)[0][4], day(env, -1));
  env.call('setClientHold', admin, 'PT-B', { jenis: 'berhenti', mulai: day(env, -2) });
  assert.throws(() => env.call('endMyHold', budi), /Hubungi coach/);
});

test('the hold note never reaches the portal of another client or public answers', () => {
  const { env, ani, budi, admin } = setup();
  env.call('setClientHold', admin, 'PT-A', { jenis: 'sakit', mulai: today(env), note: 'Cedera lutut' });
  assert.ok(!JSON.stringify(j(env.call('getPortalBootstrap', budi))).includes('Cedera'));
  assert.ok(!JSON.stringify(j(env.call('getPortalBootstrap', ani))).includes('Cedera'), 'a coach-made note stays with the coach');
  assert.ok(!JSON.stringify(j(env.call('getPortalBootstrap', ''))).includes('Cedera'));
});

// ── effects (T-2406, T-2407) ─────────────────────────────────────────────────────

test('reminders: a held client gets nothing except the birthday greeting and the reminder of a session that was kept', () => {
  const { env } = setup();
  const held = { id: 'X', hold: true, off: [] }, free = { id: 'Y', off: [] };
  for (const jenis of ['hidup-sehat', 'makan-pagi', 'makan-sore', 'pr', 'booking-minggu', 'waktunya-ukur', 'tes-ulang', 'rekap-bulanan', 'selamat-milestone', 'tagihan']) {
    assert.equal(env.call('_rmdIsOff_', held, jenis), true, jenis + ' skips a held client');
    assert.equal(env.call('_rmdIsOff_', free, jenis), false);
  }
  assert.equal(env.call('_rmdIsOff_', held, 'ulang-tahun'), false, 'birthday still goes (owner decision)');
  assert.equal(env.call('_rmdIsOff_', held, 'sesi-besok'), false, 'a session kept inside the hold is still reminded');
  const rows = env.sheet('MemberData').rows.slice(1);
  const pools = j(env.call('_buildClientPools_', rows, [], new Date(), { 'PT-A': { id: 'h' } }));
  assert.equal(pools.all.find(c => c.id === 'PT-A').hold, true);
  assert.equal(pools.all.find(c => c.id === 'PT-B').hold, false);
  const old = j(env.call('_buildClientPools_', rows, [], new Date()));
  assert.equal(old.all.find(c => c.id === 'PT-A').hold, false, 'without a hold map nothing changes');
});

test('the daily hidup-sehat digest leaves the held client out', () => {
  const { env, admin } = setup();
  env.props.TELEGRAM_BOT_TOKEN = 'x'; env.props.TELEGRAM_CHAT_ID = '1';
  env.call('setClientHold', admin, 'PT-A', { jenis: 'cuti', mulai: today(env), sampai: day(env, 3) });
  env.fetches.length = 0;
  env.call('sendHidupSehatDigest_', { now: new Date() });
  const sent = JSON.stringify(env.fetches);
  assert.ok(sent.includes('Budi'), 'other clients still get it');
  assert.ok(!sent.includes('Ani'), 'the held client is left out');
});

test('booking: the client cannot book inside a hold (soft conflict), the coach gets a warning, Nonaktif blocks every date', () => {
  const { env, ani, budi, admin } = setup();
  env.call('setClientHold', admin, 'PT-A', { jenis: 'cuti', mulai: today(env), sampai: day(env, 6) });
  const slot = wibSlot(4);
  const res = j(env.call('clientBookSchedule', ani, slot, { soft: true }));
  assert.equal(res.status, 'conflict');
  assert.equal(res.code, 'hold');
  assert.match(res.message, /masa cuti sampai/);
  assert.deepEqual(res.alternatives, []);
  assert.throws(() => env.call('clientBookSchedule', ani, slot), /masa cuti/);
  assert.equal(j(env.call('clientBookSchedule', ani, wibSlot(10))).status, 'success', 'after the hold is normal');
  const adm = j(env.call('addSchedule', admin, { memberId: 'PT-A', memberName: 'Ani', phone: '0811', notes: '', ...wibSlot(5) }));
  assert.ok((adm.warnings || []).some(w => /cuti/.test(w)), 'the coach may book but is told');
  env.call('setClientHold', admin, 'PT-B', { jenis: 'berhenti', mulai: today(env) });
  assert.throws(() => env.call('clientBookSchedule', budi, wibSlot(30)), /nonaktif/);
  assert.throws(() => env.call('clientBookRecurring', ani, { startDate: today(env), time: '10:00', duration: 60 }, { weekdays: [1], occurrences: 2 }), /masa cuti/);
});

test('streak: a week on Cuti bridges the streak; the monthly challenge shrinks with held days', () => {
  const { env, admin } = setup();
  const H = (id, mulai, sampai) => ({ id, memberId: 'A', jenis: 'cuti', mulai, sampai, status: 'ok' });
  const weeks = { '2026-11-02': true, '2026-11-16': true };   // week of 11-09 missing
  assert.equal(env.call('_streak_', weeks, '2026-11-25'), 1, 'without a hold the gap breaks it');
  const held = j(env.call('_holdHeldWeeks_', [H('1', '2026-11-09', '2026-11-15')], 'A', '2026-11-25'));
  assert.equal(env.call('_streak_', weeks, '2026-11-25', held), 2, 'the held week bridges, it does not add');
  assert.equal(env.call('_bestStreak_', weeks), 1);
  assert.equal(env.call('_bestStreak_', weeks, held), 2);
  const month = today(env).slice(0, 7);
  const first = month + '-01';
  env.call('setClientHold', admin, 'PT-A', { jenis: 'sakit', mulai: first < day(env, -30) ? day(env, -30) : first, sampai: env.call('_addDaysIso_', first, 14) });
  const ch = j(env.call('getMyProgress', env.memberToken(KEY_A)).challenge);
  assert.ok(ch.held > 0 && ch.target < 8, 'target shrinks: ' + JSON.stringify(ch));
});

test('signals: no inactivity or PR flags for a held client, and it does not count as active', () => {
  const { env } = setup();
  const base = { members: [{ id: 'A', total: 10, used: 2, joined: '2026-01-01' }, { id: 'B', total: 10, used: 2, joined: '2026-01-01' }],
    sessions: [], overdue: { A: true, B: true }, inactiveDays: 14 };
  const plain = j(env.call('_clientSignalsCalc_', base, '2026-11-25'));
  assert.ok(plain.byId.A.flags.includes('inaktif') && plain.byId.A.flags.includes('pr-telat'));
  const withHold = j(env.call('_clientSignalsCalc_', Object.assign({}, base, { holds: { A: {} } }), '2026-11-25'));
  assert.deepEqual(withHold.byId.A.flags, []);
  assert.equal(withHold.byId.A.held, true);
  assert.equal(withHold.totals.aktif, plain.totals.aktif - 1);
});

test('kembali-latihan (off by default): one WhatsApp button per client whose hold ended yesterday by itself', () => {
  const { env, admin } = setup();
  const H = (id, m, jenis, mulai, sampai, extra) => Object.assign({ id, memberId: m, jenis, mulai, sampai, status: 'ok', endedAt: '' }, extra || {});
  const t = '2026-11-25';
  const list = [H('1', 'A', 'cuti', '2026-11-20', '2026-11-24'), H('2', 'B', 'cuti', '2026-11-20', '2026-11-24', { endedAt: 'x' }),
    H('3', 'C', 'berhenti', '2026-11-01', '2026-11-24'), H('4', 'D', 'cuti', '2026-11-20', '2026-11-24'), H('5', 'D', 'sakit', '2026-11-25', ''),
    H('6', 'E', 'cuti', '2026-11-20', '2026-11-23')];
  assert.deepEqual(j(env.call('_holdReturning_', list, t)).map(h => h.memberId), ['A'], 'ended early, nonaktif, a follow-on hold and older ends are left out');
  assert.equal(j(env.call('getAppSettings', admin)).reminder.jobs['kembali-latihan'].enabled, false, 'off by default (rule 5)');
  env.props.TELEGRAM_BOT_TOKEN = 'x'; env.props.TELEGRAM_CHAT_ID = '1';
  env.ss.seed('ClientHolds', [['ID', 'Member ID', 'Jenis', 'Mulai', 'Sampai', 'Catatan', 'Status', 'Dibuat Oleh', 'Dibuat Pada', 'Diputuskan Pada', 'Diakhiri Pada', 'Sesi Dibatalkan'],
    ['H1', 'PT-A', 'cuti', day(env, -6), day(env, -1), 'Rahasia', 'ok', 'admin', 'x', '', '', '']]);
  env.fetches.length = 0;
  assert.equal(env.call('sendKembaliLatihanDigest_', { now: new Date() }), true);
  const sent = JSON.stringify(env.fetches);
  assert.ok(sent.includes('Kembali latihan') && sent.includes('Ani') && sent.includes('wa.me'), 'digest with a WhatsApp button');
  assert.ok(!sent.includes('Rahasia'), 'never the hold note');
});
