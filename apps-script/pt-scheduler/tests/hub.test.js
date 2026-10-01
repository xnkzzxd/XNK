'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const iso = d => d.toISOString();
const sch = (id, startIso, status, completedIso, coach) => [id, 'PT-A', 'Ani', '6281', startIso, new Date(new Date(startIso).getTime() + 3600000).toISOString(), '', status, coach || '', coach ? 'Rizky' : '', completedIso || '', ''];

test('stats count completed sessions by completion date in WIB, with hours and streak', () => {
  const env = seededEnv();
  const now = new Date();
  const rows = env.sheet('Schedules').rows;
  rows.length = 1;   // header only
  rows.push(sch('A', iso(new Date(now.getTime() - 3600000)), 'completed', iso(now), 'C-1'));
  rows.push(sch('B', iso(new Date(now.getTime() - 40 * 86400000)), 'completed', iso(new Date(now.getTime() - 40 * 86400000)), 'C-1'));
  const hub = env.call('getCoachHub', env.adminToken());
  assert.equal(hub.stats.monthSessions >= 1, true);
  assert.equal(hub.stats.weekSessions, 1);
  assert.equal(hub.stats.weekHours, 1);
  assert.ok(hub.stats.streak >= 1);
  assert.equal(hub.solo, true);
});

test('Hari ini lists today\'s sessions in time order and leaves out cancelled ones', () => {
  const env = seededEnv();
  const rows = env.sheet('Schedules').rows;
  rows.length = 1;
  const wibNoon = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + 'T12:00:00+07:00');
  rows.push(sch('L', iso(new Date(wibNoon.getTime() + 3600000)), 'read', '', 'C-1'));
  rows.push(sch('E', iso(wibNoon), 'read', '', 'C-1'));
  rows.push(sch('X', iso(wibNoon), 'cancelled', '', 'C-1'));
  const hub = env.call('getCoachHub', env.adminToken());
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(hub.today).map(s => s.id))), ['E', 'L']);
});

test('targets: absent when unset, validated, saved, cleared; pace line data', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.equal(env.call('getCoachHub', t).targets.length, 0);
  assert.throws(() => env.call('saveCoachTargets', t, { sesi: 0 }), /Target Sesi/);
  assert.throws(() => env.call('saveCoachTargets', t, { klienAktif: 1.5 }), /Klien aktif/);
  env.call('saveCoachTargets', t, { sesi: 80, klienAktif: 15 });
  const hub = env.call('getCoachHub', t);
  assert.deepEqual(Array.from(hub.targets).map(x => x.key), ['sesi', 'klienAktif']);
  assert.equal(hub.targets[0].goal, 80);
  assert.ok(hub.targets[0].pace >= 1);
  env.call('saveCoachTargets', t, { sesi: '' });
  assert.equal(env.call('getCoachHub', t).targets.length, 1);
});

test('pace is ceil(goal * day / days in month)', () => {
  const env = seededEnv();
  const r = env.callRaw('_targetPace_', 80, 31, 12, 31);
  assert.equal(r.pace, 31);
  assert.equal(r.onPace, true);
  assert.equal(env.callRaw('_targetPace_', 80, 30, 12, 31).onPace, false);
});
