'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const BH = { 0: [8, 12], 1: [6, 21], 2: [6, 21], 3: [6, 21], 4: [6, 21], 5: [6, 21], 6: [8, 14] };
const NOW = new Date('2030-01-01T00:00:00Z');
const MON = '2030-01-07';   // a Monday
const run = (env, o) => env.callRaw('_freeSlots_', Object.assign({ businessHours: BH, coaches: [{ id: 'C-1' }], rules: [], timeOff: [], bookings: [], from: MON, days: 1, now: NOW }, o));
const hoursOf = day => Array.from(day.hours).filter(h => h.free > 0).map(h => h.hour);
const at = (date, hour) => new Date(date + 'T' + ('0' + hour).slice(-2) + ':00:00+07:00').toISOString();
const wibDate = d => new Date(Date.now() + d * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
// A Monday 7–13 days ahead (WIB): inside the slot window and the booking horizon, whatever day the tests run.
const NEXT_MON = (() => { for (let d = 7; d < 14; d++) if (new Date(wibDate(d) + 'T00:00:00Z').getUTCDay() === 1) return wibDate(d); })();

test('no rules and no days off: every studio hour is free (today\'s behavior)', () => {
  const [d] = run(seededEnv(), {});
  assert.equal(d.closed, false);
  assert.deepEqual(JSON.parse(JSON.stringify(hoursOf(d))), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});

test('two ranges per day, and a day with no range is Libur once the coach has any rules', () => {
  const env = seededEnv();
  const rules = [{ coachId: 'C-1', hari: 'senin', startHour: 6, endHour: 8 }, { coachId: 'C-1', hari: 'senin', startHour: 16, endHour: 18 }];
  assert.deepEqual(JSON.parse(JSON.stringify(hoursOf(run(env, { rules })[0]))), [6, 7, 16, 17]);
  assert.equal(hoursOf(run(env, { rules, from: '2030-01-08' })[0]).length, 0);   // Tuesday: Libur
});

test('all-day and hourly days off block only what they cover', () => {
  const env = seededEnv();
  const allDay = [{ coachId: 'C-1', from: MON, to: MON, hourFrom: null, hourTo: null }];
  assert.equal(hoursOf(run(env, { timeOff: allDay })[0]).length, 0);
  const hourly = [{ coachId: 'C-1', from: MON, to: MON, hourFrom: 10, hourTo: 11 }];
  assert.ok(!hoursOf(run(env, { timeOff: hourly })[0]).includes(10));
  assert.ok(hoursOf(run(env, { timeOff: hourly })[0]).includes(11));
});

test('a coach\'s leave marks working hours as leave (shown full on the landing); hours outside working time stay hidden', () => {
  const env = seededEnv();
  const hourly = [{ coachId: 'C-1', from: MON, to: MON, hourFrom: 10, hourTo: 11 }];
  const rules = [{ coachId: 'C-1', hari: 'senin', startHour: 8, endHour: 14 }];
  const hrs = Array.from(run(env, { timeOff: hourly, rules: rules })[0].hours);
  const h = n => hrs.find(x => x.hour === n);
  assert.equal(h(10).leave, true);
  assert.equal(h(10).free, 0);
  assert.equal(h(11).leave, undefined);   // free
  assert.equal(h(16).off, true);          // outside working hours: off, not leave
  assert.equal(h(16).leave, undefined);
});

test('a booking uses its coach; an unassigned booking uses shared capacity; two coaches keep an hour open', () => {
  const env = seededEnv();
  const bk = [{ start: at(MON, 9), end: at(MON, 10), coachId: '' }];
  assert.ok(!hoursOf(run(env, { bookings: bk })[0]).includes(9));
  const two = run(env, { bookings: bk, coaches: [{ id: 'C-1' }, { id: 'C-2' }] })[0];
  assert.ok(hoursOf(two).includes(9));
  const both = [bk[0], { start: at(MON, 9), end: at(MON, 10), coachId: 'C-1' }];
  assert.ok(!hoursOf(run(env, { bookings: both, coaches: [{ id: 'C-1' }, { id: 'C-2' }] })[0]).includes(9));
});

test('past hours are never free and a closed day has no hours', () => {
  const env = seededEnv();
  const late = run(env, { now: new Date(at(MON, 9)) })[0];
  assert.ok(!hoursOf(late).includes(9) && hoursOf(late).includes(10));
  const closed = run(env, { businessHours: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null } })[0];
  assert.equal(closed.closed, true);
});

test('getOpenSlots matches the old behavior with no hours saved and shrinks after saveCoachAvailability', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const before = env.call('getOpenSlots', { from: NEXT_MON, days: 1 })[0];
  assert.equal(before.date, NEXT_MON);
  assert.equal(before.hours.length, 15);
  env.call('saveCoachAvailability', t, 'C-1', { senin: [[8, 10]] });
  const after = env.call('getOpenSlots', { from: NEXT_MON, days: 1 })[0];
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(after.hours).filter(h => h.free).map(h => h.hour))), [8, 9]);
  env.call('saveCoachAvailability', t, 'C-1', {});   // empty week = follow studio hours again
  assert.equal(env.call('getOpenSlots', { from: NEXT_MON, days: 1 })[0].hours.filter(h => h.free).length, 15);
});

test('saveCoachAvailability validates ranges', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.throws(() => env.call('saveCoachAvailability', t, 'C-1', { senin: [[10, 8]] }), /lebih kecil/);
  assert.throws(() => env.call('saveCoachAvailability', t, 'C-1', { senin: [[5, 9]] }), /jam operasional/);
  assert.throws(() => env.call('saveCoachAvailability', t, 'C-1', { senin: [[8, 12], [11, 14]] }), /tumpang tindih/);
  assert.throws(() => env.call('saveCoachAvailability', t, 'NOPE', {}), /coach yang aktif/);
});

test('days off: validation, clashes are listed (not cancelled), and delete works; notes stay admin-only', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.sheet('Schedules').rows.push(['S-X', 'PT-A', 'Ani', '1', at(MON, 9), at(MON, 10), '', 'read', 'C-1', 'Rizky', '', '']);
  assert.throws(() => env.call('addCoachTimeOff', t, { from: '2030-02-30', to: '2030-02-30' }), /tidak valid/);
  assert.throws(() => env.call('addCoachTimeOff', t, { from: MON, to: '2030-01-01' }), /sebelum/);
  const r = env.call('addCoachTimeOff', t, { from: MON, to: MON, note: 'dokter' });
  assert.equal(r.clashes.length, 1);
  assert.equal(r.clashes[0].scheduleId, 'S-X');
  assert.equal(env.sheet('Schedules').rows.find(x => x[0] === 'S-X')[7], 'read');
  assert.ok(!JSON.stringify(env.call('getOpenSlots', { from: MON, days: 1 })).includes('dokter'));
  assert.equal(env.call('getCoachAvailability', t).timeOff[0].note, 'dokter');
  env.call('deleteCoachTimeOff', t, r.id);
  assert.equal(env.call('getCoachAvailability', t).timeOff.length, 0);
});

test('a client cannot book inside a day off; the owner can, with a warning', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('addCoachTimeOff', t, { from: NEXT_MON, to: NEXT_MON });
  const mt = env.memberToken(require('./fixtures').KEY_A);
  assert.throws(() => env.call('clientBookSchedule', mt, { start: at(NEXT_MON, 9), end: at(NEXT_MON, 10) }), /Jam ini tidak tersedia\./);
  const r = env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '6281', start: at(NEXT_MON, 9), end: at(NEXT_MON, 10), notes: '' });
  assert.ok(r.warnings.length === 1 && /cuti/.test(r.warnings[0]));
  assert.equal(r.coachId, '');   // the only coach is on leave: never auto-assigned
});

test('getCoachStatus: tersedia, cuti and no note leak', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const s = env.call('getCoachStatus');
  assert.ok(['tersedia', 'tutup', 'libur', 'sesi'].includes(s.state));
  const today = new Date().toISOString().slice(0, 10);
  env.call('addCoachTimeOff', t, { from: today, to: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), note: 'rahasia' });
  const c = env.call('getCoachStatus');
  assert.equal(c.state, 'cuti');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(c.until));
  assert.ok(!JSON.stringify(c).includes('rahasia'));
});

test('the reschedule notice is a setting with default 2', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.equal(env.call('getAppSettings', t).rescheduleCutoffHours, 2);
  env.call('updateAppSettings', t, { rescheduleCutoffHours: 6 });
  assert.equal(env.call('getAppSettings', t).rescheduleCutoffHours, 6);
  assert.throws(() => env.call('updateAppSettings', t, { rescheduleCutoffHours: 100 }), /rescheduleCutoffHours/);
});

test('getPublicAvailability keeps its shape and no longer creates the sheet on read', () => {
  const env = seededEnv();
  assert.deepEqual(env.call('getPublicAvailability'), []);
  env.call('saveCoachAvailability', env.adminToken(), 'C-1', { senin: [[8, 10]], selasa: [[8, 10]], rabu: [[8, 10]], kamis: [[8, 10]], jumat: [[8, 10]], sabtu: [[8, 10]], minggu: [[8, 10]] });
  const rows = env.call('getPublicAvailability');
  assert.ok(rows.length > 0);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['availableSlots', 'coachId', 'coachName', 'date']);
});

// ── Client booking rules: hours, past, booked hour, reschedule, recurring ────

const FUT = (daysAhead, hour, min) => {
  const day = new Date(Date.now() + daysAhead * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  return new Date(day + 'T' + ('0' + hour).slice(-2) + ':' + ('0' + (min || 0)).slice(-2) + ':00+07:00').toISOString();
};
// env.bookCoach: the coach a client picks when two or more coaches are active (ignored in solo mode).
const book = (env, start, end) => env.call('clientBookSchedule', env.memberToken(require('./fixtures').KEY_A), { start, end: end || new Date(new Date(start).getTime() + 3600000).toISOString(), coachId: env.bookCoach });
const noSchedules = env => { env.sheet('Schedules').rows.length = 1; };

test('clients cannot book outside the opening hours or in the past', () => {
  const env = seededEnv();
  noSchedules(env);
  assert.throws(() => book(env, FUT(3, 3)), /di luar jam operasional/);     // 03:00 WIB
  assert.throws(() => book(env, FUT(3, 22)), /di luar jam operasional/);    // after closing
  assert.throws(() => book(env, FUT(3, 20), FUT(3, 21, 30)), /di luar jam operasional/);   // runs past closing
  assert.throws(() => book(env, new Date(Date.now() - 3600000).toISOString()), /sudah lewat/);
  assert.equal(book(env, FUT(3, 10)).status, 'success');                    // inside hours is fine
});

test('the opening hours set in Pengaturan are enforced for clients', () => {
  const env = seededEnv();
  noSchedules(env);
  const hours = { 0: [6, 12], 1: [9, 12], 2: [9, 12], 3: [9, 12], 4: [9, 12], 5: [9, 12], 6: [9, 12] };
  env.call('updateAppSettings', env.adminToken(), { businessHours: hours });
  assert.throws(() => book(env, FUT(3, 14)), /di luar jam operasional/);
  assert.equal(book(env, FUT(3, 10)).status, 'success');
});

test('clients cannot take an hour that is already booked, even partly, but a free neighbour hour is fine', () => {
  const env = seededEnv();
  noSchedules(env);
  env.sheet('Schedules').rows.push(['S-B', 'PT-B', 'Budi', '1', FUT(4, 10), FUT(4, 11), '', 'read', 'C-1', 'Rizky', '', '']);
  assert.throws(() => book(env, FUT(4, 10)), /sudah dibooking/);
  assert.throws(() => book(env, FUT(4, 9), FUT(4, 10, 30)), /sudah dibooking/);   // 90 min runs into the booked hour
  assert.throws(() => book(env, FUT(4, 10, 30), FUT(4, 11, 30)), /sudah dibooking/);   // 10:30 snaps to 10:00
  assert.equal(book(env, FUT(4, 11)).status, 'success');
  assert.equal(book(env, FUT(4, 9)).status, 'success');
});

test('the second of two identical bookings is refused (the check and the write are one step)', () => {
  const env = seededEnv();
  noSchedules(env);
  book(env, FUT(5, 15));
  assert.throws(() => env.call('clientBookSchedule', env.memberToken(require('./fixtures').KEY_B), { start: FUT(5, 15), end: FUT(5, 16) }), /sudah dibooking/);
  assert.equal(env.sheet('Schedules').rows.filter(r => r[4] === FUT(5, 15)).length, 1);
});

test('with two coaches the client must pick a coach, and each coach has their own seat for an hour', () => {
  const env = seededEnv();
  noSchedules(env);
  const dina = env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });
  const dinaId = dina.id || (dina.coach && dina.coach.id);
  env.sheet('Schedules').rows.push(['S-B', 'PT-X', 'Budi', '1', FUT(4, 10), FUT(4, 11), '', 'read', 'C-1', 'Rizky', '', '']);
  const B = env.memberToken(require('./fixtures').KEY_B);
  const win = { start: FUT(4, 10), end: FUT(4, 11) };
  assert.throws(() => env.call('clientBookSchedule', B, win), /Pilih coach dulu/);
  assert.throws(() => env.call('clientBookSchedule', B, Object.assign({ coachId: 'NOPE' }, win)), /Coach tidak ditemukan/);
  assert.throws(() => env.call('clientBookSchedule', B, Object.assign({ coachId: 'C-1' }, win)), /sudah dibooking/);   // Rizky is taken at 10
  assert.equal(env.call('clientBookSchedule', env.memberToken(require('./fixtures').KEY_A), Object.assign({ coachId: dinaId }, win)).coachId, dinaId);
  assert.throws(() => env.call('clientBookSchedule', B, Object.assign({ coachId: dinaId }, win)), /sudah dibooking/);   // now Dina is taken too
});

test('getOpenSlots({coachId}) shows only that coach\'s seat; the portal bootstrap carries one grid per coach', () => {
  const env = seededEnv();
  noSchedules(env);
  const dina = env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });
  const dinaId = dina.id || (dina.coach && dina.coach.id);
  env.sheet('Schedules').rows.push(['S-B', 'PT-X', 'Budi', '1', FUT(4, 10), FUT(4, 11), '', 'read', 'C-1', 'Rizky', '', '']);
  const date = new Date(FUT(4, 10)).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const free = (rows, h) => rows.find(d => d.date === date).hours.find(x => x.hour === h).free;
  assert.equal(free(env.call('getOpenSlots', { days: 7, fresh: true, coachId: 'C-1' }), 10), 0);
  assert.equal(free(env.call('getOpenSlots', { days: 7, fresh: true, coachId: dinaId }), 10), 1);
  assert.equal(free(env.call('getOpenSlots', { days: 7, fresh: true }), 10), 1);   // all coaches: one seat left
  assert.deepEqual(env.call('getOpenSlots', { days: 7, fresh: true, coachId: 'NOPE' }), []);
  const boot = env.call('getPortalBootstrap', env.memberToken(require('./fixtures').KEY_A));
  assert.deepEqual(Object.keys(boot.openSlotsByCoach).sort(), ['C-1', dinaId].sort());
  assert.equal(free(boot.openSlotsByCoach['C-1'], 10), 0);
  assert.equal(free(boot.openSlotsByCoach[dinaId], 10), 1);
});

test('clients cannot reschedule onto a booked hour or outside hours, but can onto a free hour or their own hour', () => {
  const env = seededEnv();
  noSchedules(env);
  const mine = book(env, FUT(6, 10));
  env.sheet('Schedules').rows.push(['S-B', 'PT-B', 'Budi', '1', FUT(6, 14), FUT(6, 15), '', 'read', 'C-1', 'Rizky', '', '']);
  const mt = env.memberToken(require('./fixtures').KEY_A);
  assert.throws(() => env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 14), FUT(6, 15)), /sudah dibooking/);
  assert.throws(() => env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 3), FUT(6, 4)), /di luar jam operasional/);
  assert.equal(env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 10), FUT(6, 11, 30)).status, 'success');   // overlaps only itself
  assert.equal(env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 16), FUT(6, 17)).status, 'success');
});

test('a recurring series books all dates or none', () => {
  const env = seededEnv();
  noSchedules(env);
  // The series date and time are WIB, as the portal sends them (the server builds the dates in WIB).
  const w = new Date(new Date(FUT(3, 10)).getTime() + 7 * 3600000).toISOString();
  const startDate = w.slice(0, 10), time = w.slice(11, 16);
  env.sheet('Schedules').rows.push(['S-B', 'PT-B', 'Budi', '1', FUT(5, 10), FUT(5, 11), '', 'read', 'C-1', 'Rizky', '', '']);   // blocks day 5
  const mt = env.memberToken(require('./fixtures').KEY_A);
  const before = env.sheet('Schedules').rows.length;
  assert.throws(() => env.call('clientBookRecurring', mt, { startDate, time, duration: 60 }, { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 4 }), /sudah dibooking.*Tidak ada sesi yang dibuat/);
  assert.equal(env.sheet('Schedules').rows.length, before);
});

test('the owner can still book outside hours or on a booked hour, with a warning', () => {
  const env = seededEnv();
  noSchedules(env);
  env.sheet('Schedules').rows.push(['S-B', 'PT-B', 'Budi', '1', FUT(4, 10), FUT(4, 11), '', 'read', 'C-1', 'Rizky', '', '']);
  const t = env.adminToken();
  const closed = env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '6281', start: FUT(4, 3), end: FUT(4, 4), notes: '' });
  assert.match(closed.warnings[0], /jam operasional/);
  const taken = env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '6281', start: FUT(4, 10), end: FUT(4, 11), notes: '' });
  assert.match(taken.warnings[0], /sudah ada booking/);
  const free = env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '6281', start: FUT(4, 8), end: FUT(4, 9), notes: '' });
  assert.equal(free.warnings.length, 0);
});

test('each hour carries a server-side past flag (WIB), so the browser clock never decides', () => {
  const env = seededEnv();
  // 2030-01-07 10:30 WIB = 03:30Z: hours up to 10:00 started already, 11:00 onward are ahead.
  const [d] = run(env, { now: new Date('2030-01-07T03:30:00Z') });
  const past = Array.from(d.hours).filter(h => h.past).map(h => h.hour);
  assert.deepEqual(JSON.parse(JSON.stringify(past)), [6, 7, 8, 9, 10]);
  assert.ok(Array.from(d.hours).filter(h => h.past).every(h => h.free === 0));
  assert.ok(Array.from(d.hours).filter(h => !h.past).every(h => h.free === 1));
});

test('booking-minggu digest slots come from the same engine as the landing', () => {
  const env = seededEnv();
  const now = new Date('2030-01-07T03:30:00Z');   // Monday 10:30 WIB
  const bookings = [{ start: at(MON, 11), end: at(MON, 12), coachId: 'C-1', status: 'read' }, { start: at(MON, 12), end: at(MON, 13), coachId: 'C-1', status: 'cancelled' }];
  const nearest = JSON.parse(JSON.stringify(env.callRaw('_nearestFreeSlots_', bookings, now, 3, BH, 7, { coaches: [{ id: 'C-1' }], rules: [], timeOff: [] })));
  const engine = Array.from(run(env, { now, bookings: bookings.filter(b => b.status !== 'cancelled'), days: 1 })[0].hours).filter(h => h.free > 0).slice(0, 3).map(h => h.hour);
  assert.deepEqual(nearest.map(s => s.hour), engine);
  assert.deepEqual(engine, [12, 13, 14]);   // 11:00 is booked, cancelled 12:00 stays free
});

test('an off-the-hour client booking is stored from the whole hour for the chosen duration', () => {
  const env = seededEnv();
  noSchedules(env);
  assert.equal(book(env, FUT(4, 7, 15), FUT(4, 8, 15)).status, 'success');
  const row = env.sheet('Schedules').rows.find(r => r[4] === FUT(4, 7));
  assert.ok(row);
  assert.equal(row[5], FUT(4, 8));
  assert.throws(() => env.call('clientBookSchedule', env.memberToken(require('./fixtures').KEY_B), { start: FUT(4, 7, 45), end: FUT(4, 8, 45) }), /sudah dibooking/);
});

test('a client cannot hold two overlapping sessions even with two coaches', () => {
  const env = seededEnv();
  noSchedules(env);
  // Two active coaches: a client must pick one; the own-overlap and duplicate rules still apply.
  const dina = env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });
  const dinaId = dina.id || (dina.coach && dina.coach.id);
  const A = env.memberToken(require('./fixtures').KEY_A);
  env.call('clientBookSchedule', A, { start: FUT(4, 10), end: FUT(4, 11), coachId: dinaId });
  assert.throws(() => env.call('clientBookSchedule', A, { start: FUT(4, 10, 30), end: FUT(4, 12), coachId: dinaId }), /sudah punya sesi/);   // 10:30–12:00 → 10:00–11:30
  assert.equal(env.call('clientBookSchedule', A, { start: FUT(4, 10, 30), end: FUT(4, 11, 30), coachId: dinaId }).duplicate, true);   // snaps to exactly the same session
});

// ── Slot cache (2 min, keyed by WIB hour), soft booking conflicts and alternatives ──

const { KEY_A, KEY_B, wibSlot } = require('./fixtures');
const verOf = env => (env.cache['openslots:ver'] || {}).value;
const slotKeys = env => Object.keys(env.cache).filter(k => k.startsWith('openslots:') && k !== 'openslots:ver');
const dayOf = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const hourOfIso = iso => Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23' }));
const freeAt = (rows, iso) => rows.find(d => d.date === dayOf(iso)).hours.find(h => h.hour === hourOfIso(iso)).free;
const plusMin = (iso, m) => new Date(new Date(iso).getTime() + m * 60000).toISOString();
const softBook = (env, key, start, end) => env.call('clientBookSchedule', env.memberToken(key), { start, end: end || plusMin(start, 60), coachId: env.bookCoach }, { soft: true });
const budiAt = (env, start, end, id) => env.sheet('Schedules').rows.push([id || 'S-BUDI', 'PT-B', 'Budi', '081222222222', start, end || plusMin(start, 60), 'Catatan Budi', 'read', 'C-1', 'Rizky', '', '']);
// Every day open 06–21, so the tests below do not depend on the weekday they run on.
const allWeek = env => { env.props.BUSINESS_HOURS_JSON = JSON.stringify({ 0: [6, 21], 1: [6, 21], 2: [6, 21], 3: [6, 21], 4: [6, 21], 5: [6, 21], 6: [6, 21] }); };
const slotEnv = () => { const env = seededEnv(); allWeek(env); noSchedules(env); return env; };
const noOtherClient = (text, label) => {
  for (const s of ['PT-B', 'Budi', '081222222222', 'S-BUDI', 'Catatan Budi']) assert.ok(!text.includes(s), label + ' leaks ' + s);
};

test('getOpenSlots is cached for 2 minutes; app writes bust it; fresh is ignored', () => {
  const env = slotEnv();
  env.now = Date.now();
  assert.equal(freeAt(env.call('getOpenSlots', { days: 7 }), FUT(4, 10)), 1);
  budiAt(env, FUT(4, 10));   // typed straight into the Sheet: no version bump
  assert.equal(freeAt(env.call('getOpenSlots', { days: 7 }), FUT(4, 10)), 1, 'served from the cache');
  assert.equal(freeAt(env.call('getOpenSlots', { days: 7, fresh: true }), FUT(4, 10)), 1, 'fresh is ignored');
  env.now += 121000;
  assert.equal(freeAt(env.call('getOpenSlots', { days: 7 }), FUT(4, 10)), 0, 'recomputed after 2 minutes');
  book(env, FUT(4, 12));   // an app write bumps the version at once
  assert.equal(freeAt(env.call('getOpenSlots', { days: 7 }), FUT(4, 12)), 0);
});

test('SLOTS_CACHE_SECONDS sets the server cache time, clamped to 10–300 s', () => {
  const env = slotEnv();
  env.now = Date.now();
  const ttl = () => { const k = slotKeys(env)[0]; const s = (env.cache[k].expires - env.now) / 1000; Object.keys(env.cache).forEach(x => { if (x !== 'openslots:ver') delete env.cache[x]; }); return s; };
  env.call('getOpenSlots', {});
  assert.equal(ttl(), 120);
  env.props.SLOTS_CACHE_SECONDS = '5';
  env.call('getOpenSlots', {});
  assert.equal(ttl(), 10);
  env.props.SLOTS_CACHE_SECONDS = '9999';
  env.call('getOpenSlots', {});
  assert.equal(ttl(), 300);
});

test('the server cache key holds the WIB hour, so an hour turns past at hh:00 without a bust', () => {
  const env = seededEnv();
  const h10 = days => Array.from(days[0].hours).find(h => h.hour === 10);
  const before = env.callRaw('_openSlotsCached_', { days: 1 }, new Date('2030-01-07T09:59:00+07:00'));
  const after = env.callRaw('_openSlotsCached_', { days: 1 }, new Date('2030-01-07T10:00:30+07:00'));
  assert.equal(h10(before).past, false);
  assert.equal(h10(before).free, 1);
  assert.equal(h10(after).past, true);
  assert.equal(h10(after).free, 0);
  const keys = slotKeys(env);
  assert.equal(keys.length, 2);
  assert.ok(keys.some(k => k.endsWith(':2030-01-07T9:2030-01-07:1:')), keys.join());   // last part: coach ('' = all)
  assert.ok(keys.some(k => k.endsWith(':2030-01-07T10:2030-01-07:1:')), keys.join());
});

test('from and days are normalised before the cache key is built', () => {
  const env = seededEnv();
  const today = wibDate(0);
  env.call('getOpenSlots', { from: 'x', days: 999 });
  env.call('getOpenSlots', { from: wibDate(100), days: 999 });
  env.call('getOpenSlots', { from: wibDate(-3), days: 62 });
  env.call('getOpenSlots', { from: '2026-02-31', days: '62' });
  const keys = slotKeys(env);
  assert.equal(keys.length, 1, keys.join());
  assert.ok(keys[0].endsWith(':' + today + ':62:'), keys[0]);
  const rows = env.call('getOpenSlots', { from: 'x', days: 999 });
  assert.equal(rows.length, 62);
  assert.equal(rows[0].date, today);
});

test('every app write that changes free hours bumps the slot version', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const bumps = (label, fn) => { const before = verOf(env); fn(); assert.notEqual(verOf(env), before, label); };
  bumps('updateScheduleCoach', () => env.call('updateScheduleCoach', t, 'SCH-A1', ''));
  env.sheet('Schedules').rows.push(['S-G1', 'PT-C', 'Citra', '1', FUT(9, 10), FUT(9, 11), '', 'read', 'C-1', 'Rizky', '', 'RGRP-T']);
  bumps('deleteRecurringGroup', () => env.call('deleteRecurringGroup', t, 'RGRP-T'));
  const dry = verOf(env);
  env.call('assignUnassignedToSelf', t, { dryRun: true });
  assert.equal(verOf(env), dry, 'a dry run writes nothing and keeps the version');
  bumps('assignUnassignedToSelf', () => env.call('assignUnassignedToSelf', t, {}));
  const dina = env.call('saveCoach', t, { name: 'Dina', phone: '081234567891' });
  bumps('setCoachActive', () => env.call('setCoachActive', t, dina.id, false));
  bumps('deleteCoach', () => env.call('deleteCoach', t, dina.id));
  bumps('updateScheduleData', () => env.call('updateScheduleData', t, { id: 'SCH-A1', start: FUT(9, 12), end: FUT(9, 13) }));
  bumps('deleteSchedule', () => env.call('deleteSchedule', t, 'SCH-B1'));
  bumps('deleteMember', () => env.call('deleteMember', t, 'PT-C'));
  bumps('updateAppSettings', () => env.call('updateAppSettings', t, { rescheduleCutoffHours: 3 }));
});

test('a client booking flushes the sheet before the slot version changes', () => {
  const env = slotEnv();
  env.cache['openslots:ver'] = { value: 'V0', expires: Date.now() + 3600000 };
  book(env, FUT(4, 10));
  assert.deepEqual(env.flushes, ['V0'], 'one flush, while the old version was still current');
  assert.notEqual(verOf(env), 'V0');
});

test('soft booking: a taken hour is a conflict with up to 3 alternatives; nothing is written or sent', () => {
  const env = slotEnv();
  budiAt(env, FUT(4, 10));
  const rows = env.sheet('Schedules').rows.length, fetches = env.fetches.length, mails = env.mails.length;
  const res = softBook(env, KEY_A, FUT(4, 10));
  assert.equal(res.status, 'conflict');
  assert.equal(res.code, 'taken');
  assert.match(res.message, /sudah dibooking/);
  assert.deepEqual(res.requested, { start: FUT(4, 10), end: FUT(4, 11) });
  assert.equal(res.openSlots.length, 60);
  assert.equal(freeAt(res.openSlots, FUT(4, 10)), 0);
  assert.equal(env.sheet('Schedules').rows.length, rows, 'no row');
  assert.equal(env.fetches.length, fetches, 'no Telegram');
  assert.equal(env.mails.length, mails, 'no email');
  // Same day nearest (the later hour wins the tie), then the same hour tomorrow.
  assert.deepEqual(res.alternatives.map(a => [a.start, a.group]), [[FUT(4, 11), 'day'], [FUT(4, 9), 'day'], [FUT(5, 10), 'hour']]);
  assert.deepEqual(Object.keys(res.alternatives[0]).sort(), ['date', 'end', 'group', 'hour', 'start']);
  noOtherClient(JSON.stringify(res), 'conflict');
  assert.throws(() => book(env, FUT(4, 10)), /sudah dibooking/);   // without soft: today's error
  for (const a of res.alternatives) assert.equal(softBook(env, KEY_A, a.start, a.end).status, 'success');
});

test('soft booking success: snapped times, the own row, and openSlots written through to the cache', () => {
  const env = slotEnv();
  const res = softBook(env, KEY_A, FUT(4, 7, 15), FUT(4, 8, 15));
  assert.equal(res.status, 'success');
  assert.equal(res.duplicate, undefined);
  assert.equal(res.schedule.id, res.id);
  assert.equal(res.schedule.start, FUT(4, 7));
  assert.equal(res.schedule.end, FUT(4, 8));
  assert.equal(res.schedule.status, 'unread');
  assert.equal(res.schedule.memberId, 'PT-A');
  assert.ok(!('phone' in res.schedule));
  assert.equal(freeAt(res.openSlots, FUT(4, 7)), 0);
  budiAt(env, FUT(4, 12));   // straight into the Sheet: only a cache hit can miss it
  assert.deepEqual(env.call('getOpenSlots', { days: 60 }), res.openSlots);
});

test('the same booking sent twice is one row and one notification (safe retry)', () => {
  const env = slotEnv();
  const first = softBook(env, KEY_A, FUT(4, 10));
  const fetches = env.fetches.length, mails = env.mails.length;
  const again = softBook(env, KEY_A, FUT(4, 10, 20), FUT(4, 11, 20));   // snaps to the same session
  assert.equal(again.status, 'success');
  assert.equal(again.duplicate, true);
  assert.equal(again.id, first.id);
  assert.equal(again.schedule.start, FUT(4, 10));
  assert.ok(Array.isArray(again.openSlots));
  assert.equal(book(env, FUT(4, 10)).duplicate, true, 'also without soft');
  assert.equal(env.sheet('Schedules').rows.filter(r => r[4] === FUT(4, 10)).length, 1);
  assert.equal(env.fetches.length, fetches);
  assert.equal(env.mails.length, mails);
});

test('soft booking: own overlap is "mine" and the alternatives skip the client\'s own hours; a passed hour is "past"', () => {
  const env = slotEnv();
  env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });   // 10:00 stays open for others
  env.bookCoach = 'C-1';   // two coaches: the client picks Rizky
  book(env, FUT(4, 10));
  const res = softBook(env, KEY_A, FUT(4, 10), FUT(4, 11, 30));   // 90 min over the client's own 10:00
  assert.equal(res.status, 'conflict');
  assert.equal(res.code, 'mine');
  assert.equal(res.alternatives.length, 3);
  const own = [new Date(FUT(4, 10)).getTime(), new Date(FUT(4, 11)).getTime()];
  for (const a of res.alternatives) {
    assert.ok(!(new Date(a.start).getTime() < own[1] && new Date(a.end).getTime() > own[0]), a.start);
    assert.equal(new Date(a.end) - new Date(a.start), 90 * 60000);
  }
  assert.throws(() => book(env, FUT(4, 10), FUT(4, 11, 30)), /sudah punya sesi/);

  const lastHour = new Date(Math.floor(Date.now() / 3600000) * 3600000 - 3600000).toISOString();
  const past = softBook(env, KEY_A, lastHour);
  assert.equal(past.status, 'conflict');
  assert.equal(past.code, 'past');
  assert.ok(past.alternatives.length >= 1 && past.alternatives.every(a => new Date(a.start).getTime() > Date.now()));
});

test('soft booking still throws for quota, horizon and invalid times', () => {
  const env = slotEnv();
  env.memberRow('PT-A')[9] = 10;
  assert.throws(() => softBook(env, KEY_A, FUT(4, 10)), /Sisa sesi paketmu habis/);
  env.memberRow('PT-A')[9] = 0;
  assert.throws(() => softBook(env, KEY_A, wibSlot(70).start, wibSlot(70).end), /paling jauh 60 hari/);
  assert.throws(() => env.call('clientBookSchedule', env.memberToken(KEY_A), { start: 'x', end: 'y' }, { soft: true }), /tidak valid/);
  assert.throws(() => softBook(env, KEY_A, FUT(4, 10), FUT(4, 15)), /maksimal 4 jam/);
});

// _slotAlternatives_ is pure: hand-made engine output, Monday 2030-01-07 onward.
const addDays = (iso, d) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
const H = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const mkDays = (n, edit) => Array.from({ length: n }, (_, i) => {
  const date = addDays(MON, i);
  return { date, hours: H.map(h => Object.assign({ hour: h, free: 1, off: false, past: false }, (edit && edit(date, h)) || {})) };
});
const alts = (env, days, start, end, o) => JSON.parse(JSON.stringify(env.callRaw('_slotAlternatives_', days, { start, end }, o || {}))).map(a => [a.date, a.hour, a.group]);
const TUE = addDays(MON, 1), WED = addDays(MON, 2);

test('_slotAlternatives_: same day nearest (later hour wins a tie, at most 2), then the same hour on later days', () => {
  const env = seededEnv();
  const days = mkDays(3, (d, h) => (d === MON && h === 10 ? { free: 0 } : null));
  assert.deepEqual(alts(env, days, at(MON, 10), at(MON, 11)), [[MON, 11, 'day'], [MON, 9, 'day'], [TUE, 10, 'hour']]);
  const out = env.callRaw('_slotAlternatives_', days, { start: at(MON, 10), end: at(MON, 11) }, {});
  assert.equal(out[0].start, at(MON, 11));
  assert.equal(out[0].end, at(MON, 12));
});

test('_slotAlternatives_: then the nearest anywhere', () => {
  const env = seededEnv();
  const days = mkDays(3, (d, h) => (d === MON || (d === TUE && h === 10) ? { free: 0 } : null));
  assert.deepEqual(alts(env, days, at(MON, 10), at(MON, 11)), [[WED, 10, 'hour'], [TUE, 6, 'near'], [TUE, 7, 'near']]);
});

test('_slotAlternatives_: a 120-minute request needs two free hours in a row', () => {
  const env = seededEnv();
  const days = mkDays(1, (d, h) => ([8, 12, 13].includes(h) ? null : { free: 0 }));
  const out = env.callRaw('_slotAlternatives_', days, { start: at(MON, 10), end: at(MON, 12) }, {});
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [{ start: at(MON, 12), end: at(MON, 14), date: MON, hour: 12, group: 'day' }]);
});

test('_slotAlternatives_: skips own sessions (from the whole hour), avoided starts, past and off hours, and the request itself', () => {
  const env = seededEnv();
  const days = mkDays(1, (d, h) => (h === 9 ? { past: true } : h === 11 ? { off: true } : null));
  const o = { own: [{ start: new Date(Date.parse(at(MON, 12)) + 30 * 60000).toISOString(), end: new Date(Date.parse(at(MON, 13)) + 30 * 60000).toISOString() }], avoid: [at(MON, 8)] };
  assert.deepEqual(alts(env, days, at(MON, 10), at(MON, 11), o), [[MON, 7, 'day'], [MON, 14, 'day'], [MON, 6, 'near']]);
});

test('_slotAlternatives_: at most n (default 3), none when nothing fits', () => {
  const env = seededEnv();
  const days = mkDays(7);
  assert.equal(alts(env, days, at(MON, 10), at(MON, 11)).length, 3);
  assert.equal(alts(env, days, at(MON, 10), at(MON, 11), { n: 1 }).length, 1);
  assert.deepEqual(alts(env, mkDays(2, () => ({ free: 0 })), at(MON, 10), at(MON, 11)), []);
});

test('soft reschedule: a clash keeps the old row and never offers the old start; success returns newEnd and openSlots', () => {
  const env = slotEnv();
  const mt = env.memberToken(KEY_A);
  const mine = book(env, FUT(6, 13));
  budiAt(env, FUT(6, 14));
  const res = env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 14), FUT(6, 15), { soft: true });
  assert.equal(res.status, 'conflict');
  assert.equal(res.code, 'taken');
  assert.equal(res.oldStart, FUT(6, 13));
  // 13:00 is the nearest free hour (the moved session's own seat) but it is the old start: 15:00, 16:00, then tomorrow 14:00.
  assert.deepEqual(res.alternatives.map(a => a.start), [FUT(6, 15), FUT(6, 16), FUT(7, 14)]);
  assert.equal(env.sheet('Schedules').rows.find(r => r[0] === mine.id)[4], FUT(6, 13), 'the old session is untouched');
  noOtherClient(JSON.stringify(res), 'reschedule conflict');
  assert.throws(() => env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 14), FUT(6, 15)), /sudah dibooking/);

  const ok = env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 16, 10), FUT(6, 17, 40), { soft: true });
  assert.equal(ok.status, 'success');
  assert.equal(ok.oldStart, FUT(6, 13));
  assert.equal(ok.newStart, FUT(6, 16));
  assert.equal(ok.newEnd, FUT(6, 17, 30));
  assert.equal(freeAt(ok.openSlots, FUT(6, 16)), 0);
  assert.equal(freeAt(ok.openSlots, FUT(6, 17)), 0);
  assert.equal(freeAt(ok.openSlots, FUT(6, 13)), 1);
  assert.deepEqual(env.call('getOpenSlots', { days: 60 }), ok.openSlots, 'written through to the cache');
});

test('soft reschedule onto the client\'s own other session is "mine"', () => {
  const env = slotEnv();
  env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });
  env.bookCoach = 'C-1';   // two coaches: the client picks Rizky
  const mt = env.memberToken(KEY_A);
  const a = book(env, FUT(6, 10));
  book(env, FUT(6, 12));
  const res = env.call('clientRescheduleSchedule', mt, a.id, FUT(6, 12), FUT(6, 13), { soft: true });
  assert.equal(res.code, 'mine');
  assert.ok(res.alternatives.every(x => x.start !== FUT(6, 12) && x.start !== FUT(6, 10)));
  assert.throws(() => env.call('clientRescheduleSchedule', mt, a.id, FUT(6, 12), FUT(6, 13)), /sudah punya sesi/);
});

// Recurring series start in WIB, like the portal sends it (the server builds the dates in WIB, whatever its own zone).
const series = (dayOffset, hour) => {
  const w = new Date(new Date(FUT(dayOffset, hour)).getTime() + 7 * 3600000).toISOString();
  return { startDate: w.slice(0, 10), time: w.slice(11, 16), duration: 60 };
};
const DAILY_4 = { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 4 };

test('soft recurring: every clash is listed and nothing is written; skipTaken books only the clear dates, within quota', () => {
  const env = slotEnv();
  const mt = env.memberToken(KEY_A);
  budiAt(env, FUT(4, 10), null, 'S-BUDI-4');
  budiAt(env, FUT(5, 10), null, 'S-BUDI-5');
  const rows = env.sheet('Schedules').rows.length, fetches = env.fetches.length;
  const res = env.call('clientBookRecurring', mt, series(3, 10), DAILY_4, { soft: true });
  assert.equal(res.status, 'conflict');
  assert.equal(res.code, 'series');
  assert.deepEqual(res.conflicts, [{ start: FUT(4, 10), code: 'taken' }, { start: FUT(5, 10), code: 'taken' }]);
  assert.equal(res.bookable, 2);
  assert.equal(res.total, 4);
  assert.equal(res.openSlots.length, 60);
  noOtherClient(JSON.stringify(res), 'series conflict');
  assert.equal(env.sheet('Schedules').rows.length, rows, 'nothing written');
  assert.equal(env.fetches.length, fetches, 'no Telegram');
  assert.throws(() => env.call('clientBookRecurring', mt, series(3, 10), DAILY_4), /sudah dibooking.*Tidak ada sesi yang dibuat/);

  env.memberRow('PT-A')[9] = 8;   // 10 total, 8 used: 2 left — too few for 4, enough for the 2 clear dates
  assert.throws(() => env.call('clientBookRecurring', mt, series(3, 10), DAILY_4, { soft: true }), /tinggal 2/);
  env.memberRow('PT-A')[9] = 9;   // 1 left: the quota is checked on the clear dates
  assert.throws(() => env.call('clientBookRecurring', mt, series(3, 10), DAILY_4, { soft: true, skipTaken: true }), /tinggal 1/);
  env.memberRow('PT-A')[9] = 8;
  const ok = env.call('clientBookRecurring', mt, series(3, 10), DAILY_4, { soft: true, skipTaken: true });
  assert.equal(ok.status, 'success');
  assert.equal(ok.count, 2);
  assert.equal(ok.skipped, 2);
  assert.deepEqual(ok.items.map(i => i.start), [FUT(3, 10), FUT(6, 10)]);
  assert.ok(ok.items.every(i => i.memberId === 'PT-A' && i.status === 'unread' && !('phone' in i)));
  assert.equal(freeAt(ok.openSlots, FUT(3, 10)), 0);
  assert.equal(freeAt(ok.openSlots, FUT(6, 10)), 0);
  assert.equal(env.sheet('Schedules').rows.filter(r => r[11] === ok.groupId).length, 2);
  assert.equal(env.fetches.length, fetches + 1, 'one summary');
  assert.throws(() => env.call('clientBookRecurring', mt, series(4, 10), { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 2 }, { soft: true, skipTaken: true }), /Semua tanggal sudah terisi/);
});

test('recurring now checks the client\'s own sessions on every date, with or without soft', () => {
  const env = slotEnv();
  env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });   // 10:00 stays open for others
  env.bookCoach = 'C-1';   // two coaches: the client picks Rizky
  book(env, FUT(4, 10));
  const mt = env.memberToken(KEY_A);
  const rows = env.sheet('Schedules').rows.length;
  assert.throws(() => env.call('clientBookRecurring', mt, series(3, 10), DAILY_4), /sudah punya sesi.*Tidak ada sesi yang dibuat/);
  const res = env.call('clientBookRecurring', mt, series(3, 10), DAILY_4, { soft: true });
  assert.deepEqual(res.conflicts, [{ start: FUT(4, 10), code: 'mine' }]);
  assert.equal(env.sheet('Schedules').rows.length, rows);
  const ok = env.call('clientBookRecurring', mt, series(3, 10), { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 3 }, { soft: true, skipTaken: true });
  assert.equal(ok.count, 2);
  assert.equal(ok.skipped, 1);
});

test('portal bootstrap: openSlots from the shared cache, the reschedule notice, and no other client in it', () => {
  const env = seededEnv();
  const mt = env.memberToken(KEY_A);
  const a = env.call('getPortalBootstrap', mt);
  assert.equal(a.rescheduleCutoffHours, 2);
  budiAt(env, FUT(4, 10));   // straight into the Sheet: the cached grid stays until a write or 2 minutes
  env.props.RESCHEDULE_CUTOFF_HOURS = '6';
  const b = env.call('getPortalBootstrap', mt);
  assert.deepEqual(b.openSlots, a.openSlots);
  assert.equal(b.rescheduleCutoffHours, 6);
  assert.deepEqual(env.call('getOpenSlots', { days: b.horizonDays }), a.openSlots, 'the Jadwal tab shares the key');
  noOtherClient(JSON.stringify(Object.assign({}, b, { profile: null })), 'bootstrap');
  assert.equal(env.call('getPortalBootstrap', null).rescheduleCutoffHours, 6);
});

test('a fractional series count books the same whole number the quota was checked for', () => {
  const env = slotEnv();
  const mt = env.memberToken(KEY_A);
  env.memberRow('PT-A')[9] = 6;   // 10 total, 6 used: 4 left
  const ok = env.call('clientBookRecurring', mt, series(3, 10), { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 4.5 }, { soft: true });
  assert.equal(ok.status, 'success');
  assert.equal(ok.count, 4);
});

test('repeating a recurring booking after a lost answer returns the sessions it already made, even with no quota left', () => {
  const env = slotEnv();
  const mt = env.memberToken(KEY_A);
  env.memberRow('PT-A')[9] = 7;   // 10 total, 7 used: 3 left
  const rule = { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 3 };
  const first = env.call('clientBookRecurring', mt, series(3, 10), rule, { soft: true });
  assert.equal(first.count, 3);
  const rows = env.sheet('Schedules').rows.length, fetches = env.fetches.length;
  const again = env.call('clientBookRecurring', mt, series(3, 10), rule, { soft: true });
  assert.equal(again.status, 'success');
  assert.equal(again.duplicate, true);
  assert.equal(again.count, 3);
  assert.deepEqual(again.items.map(i => i.id).sort(), first.items.map(i => i.id).sort());
  assert.ok(again.items.every(i => !('phone' in i)));
  assert.equal(env.sheet('Schedules').rows.length, rows, 'nothing written');
  assert.equal(env.fetches.length, fetches, 'no second Telegram');
  // Same for "Lewati tanggal penuh" sent twice: the second call adds nothing.
  env.memberRow('PT-A')[9] = 0;
  budiAt(env, FUT(7, 10), null, 'S-BUDI-7');
  const skip1 = env.call('clientBookRecurring', mt, series(6, 10), { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 2 }, { soft: true, skipTaken: true });
  assert.equal(skip1.count, 1);
  const skip2 = env.call('clientBookRecurring', mt, series(6, 10), { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 2 }, { soft: true, skipTaken: true });
  assert.equal(skip2.duplicate, true);
  assert.equal(skip2.count, 1);
});

test('the slot engine skips past history but gives the same hours', () => {
  const env = slotEnv();
  const rows = env.sheet('Schedules').rows;
  const base = env.call('getOpenSlots', { days: 14 });
  for (let i = 0; i < 400; i++) {   // old sessions, months ago
    const s = new Date(Date.now() - (30 + i) * 86400000);
    rows.push(['S-OLD-' + i, 'PT-B', 'Budi', '1', s.toISOString(), new Date(s.getTime() + 3600000).toISOString(), '', 'completed', 'C-1', 'Rizky', '', '']);
  }
  for (const k of Object.keys(env.cache)) if (k.indexOf('openslots') === 0) delete env.cache[k];
  assert.deepEqual(JSON.parse(JSON.stringify(env.call('getOpenSlots', { days: 14 }))), JSON.parse(JSON.stringify(base)));
});

test('per-coach view: a booking with no coach assigned takes a free coach\'s seat, and only closes the hour when none is left', () => {
  const env = seededEnv();
  noSchedules(env);
  const dina = env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });
  const dinaId = dina.id || (dina.coach && dina.coach.id);
  env.sheet('Schedules').rows.push(['S-U', 'PT-X', 'Budi', '1', FUT(4, 10), FUT(4, 11), '', 'unread', '', '', '', '']);   // nobody assigned
  const date = new Date(FUT(4, 10)).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const free = id => env.call('getOpenSlots', { days: 7, fresh: true, coachId: id }).find(d => d.date === date).hours.find(x => x.hour === 10).free;
  assert.equal(free('C-1'), 1);   // two coaches, one unassigned booking: each coach can still be chosen
  assert.equal(free(dinaId), 1);
  env.call('clientBookSchedule', env.memberToken(require('./fixtures').KEY_A), { start: FUT(4, 10), end: FUT(4, 11), coachId: 'C-1' });
  assert.equal(free('C-1'), 0);
  assert.equal(free(dinaId), 0);   // the unassigned booking now needs Dina's seat
});

test('a leave whose dates Sheets stored as real dates still blocks the coach', () => {
  const env = seededEnv();
  noSchedules(env);
  const date = new Date(FUT(4, 10)).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  env.ss.seed('CoachTimeOff', [['ID', 'Coach ID', 'Dari', 'Sampai', 'Jam Mulai', 'Jam Selesai', 'Catatan', 'Dibuat'],
    ['OFF-1', 'C-1', new Date(date + 'T00:00:00+07:00'), new Date(date + 'T00:00:00+07:00'), '', '', '', '']]);
  const free = env.call('getOpenSlots', { days: 7, fresh: true }).find(d => d.date === date).hours.find(x => x.hour === 10);
  assert.equal(free.free, 0);
});

test('two coaches: a soft conflict suggests the picked coach\'s free hours and carries per-coach slots', () => {
  const env = slotEnv();
  const dina = env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });
  const dinaId = dina.id || (dina.coach && dina.coach.id);
  // Rizky (C-1) is busy at 10:00 and 11:00; Dina is free all day.
  budiAt(env, FUT(4, 10), null, 'S-R10');
  budiAt(env, FUT(4, 11), null, 'S-R11');
  const res = env.call('clientBookSchedule', env.memberToken(KEY_A), { start: FUT(4, 10), end: FUT(4, 11), coachId: 'C-1' }, { soft: true });
  assert.equal(res.status, 'conflict');
  assert.equal(res.code, 'taken');
  assert.equal(res.coachId, 'C-1');
  assert.ok(res.openSlotsByCoach && res.openSlotsByCoach['C-1'] && res.openSlotsByCoach[dinaId], 'per-coach slots in the answer');
  assert.equal(freeAt(res.openSlotsByCoach['C-1'], FUT(4, 11)), 0);
  assert.equal(freeAt(res.openSlotsByCoach[dinaId], FUT(4, 10)), 1);
  assert.ok(res.alternatives.length >= 1);
  for (const a of res.alternatives) assert.ok(a.start !== FUT(4, 11), 'Rizky is busy at 11:00, so 11:00 is never offered');
  noOtherClient(JSON.stringify(res), 'multi-coach conflict');
  // The same hour with Dina books fine and is saved on Dina.
  const ok = env.call('clientBookSchedule', env.memberToken(KEY_A), { start: FUT(4, 10), end: FUT(4, 11), coachId: dinaId }, { soft: true });
  assert.equal(ok.status, 'success');
  assert.equal(ok.coachId, dinaId);
  assert.equal(freeAt(ok.openSlotsByCoach[dinaId], FUT(4, 10)), 0);
});

test('an owner-made off-the-hour session also blocks the next hour it really touches', () => {
  const env = seededEnv();
  noSchedules(env);
  const t = env.adminToken();
  env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '6281', start: FUT(4, 9, 30), end: FUT(4, 10, 30), notes: '' });
  const day = env.call('getOpenSlots', { days: 6 }).find(d => d.date === wibDate(4));
  const free = h => Array.from(day.hours).find(x => x.hour === h).free;
  assert.equal(free(9), 0);
  assert.equal(free(10), 0);   // 09:30–10:30 really overlaps 10:00
  assert.equal(free(11), 1);
  assert.throws(() => env.call('clientBookSchedule', env.memberToken(require('./fixtures').KEY_B), { start: FUT(4, 10), end: FUT(4, 11) }), /sudah dibooking/);
});
