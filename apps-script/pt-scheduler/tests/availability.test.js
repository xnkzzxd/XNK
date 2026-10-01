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
