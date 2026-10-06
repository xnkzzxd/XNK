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
  const before = env.call('getOpenSlots', { from: MON, days: 1 })[0];
  assert.equal(before.hours.length, 15);
  env.call('saveCoachAvailability', t, 'C-1', { senin: [[8, 10]] });
  const after = env.call('getOpenSlots', { from: MON, days: 1 })[0];
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(after.hours).filter(h => h.free).map(h => h.hour))), [8, 9]);
  env.call('saveCoachAvailability', t, 'C-1', {});   // empty week = follow studio hours again
  assert.equal(env.call('getOpenSlots', { from: MON, days: 1 })[0].hours.filter(h => h.free).length, 15);
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
  env.call('addCoachTimeOff', t, { from: MON, to: MON });
  const mt = env.memberToken(require('./fixtures').KEY_A);
  assert.throws(() => env.call('clientBookSchedule', mt, { start: at(MON, 9), end: at(MON, 10) }), /Jam ini tidak tersedia\./);
  const r = env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '6281', start: at(MON, 9), end: at(MON, 10), notes: '' });
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
const book = (env, start, end) => env.call('clientBookSchedule', env.memberToken(require('./fixtures').KEY_A), { start, end: end || new Date(new Date(start).getTime() + 3600000).toISOString() });
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
  assert.throws(() => book(env, FUT(4, 10, 30), FUT(4, 11, 30)), /jam bulat/);     // off-the-hour starts are refused
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

test('with two coaches an hour stays open until both are taken', () => {
  const env = seededEnv();
  noSchedules(env);
  env.call('saveCoach', env.adminToken(), { name: 'Dina', phone: '081234567891' });
  env.sheet('Schedules').rows.push(['S-B', 'PT-B', 'Budi', '1', FUT(4, 10), FUT(4, 11), '', 'read', 'C-1', 'Rizky', '', '']);
  assert.equal(book(env, FUT(4, 10)).status, 'success');
  assert.throws(() => env.call('clientBookSchedule', env.memberToken(require('./fixtures').KEY_B), { start: FUT(4, 10), end: FUT(4, 11) }), /sudah dibooking/);
});

test('clients cannot reschedule onto a booked hour or outside hours, but can onto a free hour or their own hour', () => {
  const env = seededEnv();
  noSchedules(env);
  const mine = book(env, FUT(6, 10));
  env.sheet('Schedules').rows.push(['S-B', 'PT-B', 'Budi', '1', FUT(6, 14), FUT(6, 15), '', 'read', 'C-1', 'Rizky', '', '']);
  const mt = env.memberToken(require('./fixtures').KEY_A);
  assert.throws(() => env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 14), FUT(6, 15)), /sudah dibooking/);
  assert.throws(() => env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 3), FUT(6, 4)), /di luar jam operasional/);
  assert.throws(() => env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 16, 15), FUT(6, 17, 15)), /jam bulat/);
  assert.equal(env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 10), FUT(6, 11, 30)).status, 'success');   // overlaps only itself
  assert.equal(env.call('clientRescheduleSchedule', mt, mine.id, FUT(6, 16), FUT(6, 17)).status, 'success');
});

test('a recurring series books all dates or none', () => {
  const env = seededEnv();
  noSchedules(env);
  const start = new Date(FUT(3, 10));
  const z = n => String(n).padStart(2, '0');
  const local = new Date(start);
  const startDate = local.getFullYear() + '-' + z(local.getMonth() + 1) + '-' + z(local.getDate());
  const time = z(local.getHours()) + ':' + z(local.getMinutes());
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
  const free = env.call('addSchedule', t, { memberId: 'PT-A', memberName: 'Ani', phone: '6281', start: FUT(4, 13), end: FUT(4, 14), notes: '' });
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
