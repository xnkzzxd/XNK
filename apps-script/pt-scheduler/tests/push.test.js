'use strict';
// Fase X: Web Push (langganan, perencana, relay GitHub). docs/push/Design.md
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const SECRET = 's'.repeat(32);
const P256 = 'B' + 'A'.repeat(86);
const AUTH = 'A'.repeat(22);
const sub = (n, host) => ({ endpoint: 'https://' + (host || 'fcm.googleapis.com') + '/fcm/send/' + n, keys: { p256dh: P256, auth: AUTH } });
const on = env => { env.props.PUSH_VAPID_PUBLIC = 'P'.repeat(87); env.props.PUSH_VAPID_PRIVATE = 'K'.repeat(43); env.props.PUSH_RELAY_SECRET = SECRET; return env; };
const setup = () => { const env = on(seededEnv()); return { env, ani: env.memberToken(KEY_A), budi: env.memberToken(KEY_B), admin: env.adminToken() }; };
const sched = (id, mid, name, start, status, coach) => [id, mid, name, '6281', start, start, '', status || 'read', 'C-1', coach || '', '', ''];
const withSchedules = rows => {
  const env = on(seededEnv());
  const s = env.sheet('Schedules');
  while (s.rows.length > 1) s.rows.pop();
  rows.forEach(r => s.rows.push(r));
  return env;
};
const outRows = env => (env.sheet('PushOutbox') ? env.sheet('PushOutbox').rows.slice(1) : []);

test('off until the key and the relay secret are set; the bootstrap key is empty then', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  assert.equal(env.call('getMyPushStatus', t, '').on, false);
  assert.throws(() => env.call('saveMyPush', t, sub(1)), /belum diaktifkan/);
  assert.equal(env.call('getPortalBootstrap', t).pushKey, '');
  env.props.PUSH_VAPID_PUBLIC = 'P'.repeat(87);
  assert.equal(env.call('getMyPushStatus', t, '').on, false, 'key alone is not enough');
  env.props.PUSH_RELAY_SECRET = 'short';
  assert.equal(env.call('getMyPushStatus', t, '').on, false, 'a short secret does not count');
  env.props.PUSH_RELAY_SECRET = SECRET;
  assert.equal(env.call('getPortalBootstrap', t).pushKey, 'P'.repeat(87));
  env.props.PUSH_ENABLED = 'false';
  assert.equal(env.call('getPortalBootstrap', t).pushKey, '');
});

test('subscribing: only real push services, well-formed keys, member from the token', () => {
  const { env, ani, budi } = setup();
  assert.throws(() => env.call('saveMyPush', ani, sub(1, 'evil.example.com')), /tidak valid/);
  assert.throws(() => env.call('saveMyPush', ani, sub(1, 'fcm.googleapis.com.evil.com')), /tidak valid/);
  assert.throws(() => env.call('saveMyPush', ani, { endpoint: 'http://fcm.googleapis.com/x', keys: { p256dh: P256, auth: AUTH } }), /tidak valid/);
  assert.throws(() => env.call('saveMyPush', ani, { endpoint: sub(1).endpoint, keys: { p256dh: 'x', auth: AUTH } }), /tidak valid/);
  assert.throws(() => env.call('saveMyPush', ani, null), /tidak valid/);
  ['updates.push.services.mozilla.com', 'web.push.apple.com', 'wns2-par02p.notify.windows.com'].forEach(h => env.call('saveMyPush', ani, sub(h, h)));
  const st = env.call('saveMyPush', ani, sub(1), 'Chrome di HP');
  assert.equal(st.on, true); assert.equal(st.current.subscribed, true);
  assert.deepEqual(st.kinds, ['sesi', 'pr', 'makan']);
  const rows = env.sheet('PushSubs').rows.slice(1);
  assert.ok(rows.some(r => r[1] === 'member' && r[2] === 'PT-A' && r[6] === 'Chrome di HP'));
  // another client cannot see or remove Ani's device
  assert.equal(env.call('getMyPushStatus', budi, sub(1).endpoint).current.subscribed, false);
  assert.equal(env.call('getMyPushStatus', budi, '').devices.length, 0);
  env.call('removeMyPush', budi, sub(1).endpoint);
  assert.equal(env.call('getMyPushStatus', ani, sub(1).endpoint).current.subscribed, true);
  env.call('removeMyPush', ani, sub(1).endpoint);
  assert.equal(env.call('getMyPushStatus', ani, sub(1).endpoint).current.subscribed, false);
});

test('a client keeps at most 5 devices (the longest unseen goes); the same device logging in as another client moves over', () => {
  const { env, ani, budi } = setup();
  for (let i = 1; i <= 6; i++) env.call('saveMyPush', ani, sub(i), 'HP ' + i);
  const st = env.call('getMyPushStatus', ani, '');
  assert.equal(st.devices.length, 5);
  assert.equal(env.call('getMyPushStatus', ani, sub(1).endpoint).current.subscribed, false, 'oldest dropped');
  env.call('saveMyPush', budi, sub(6), 'HP 6');
  assert.equal(env.call('getMyPushStatus', ani, sub(6).endpoint).current.subscribed, false);
  assert.equal(env.call('getMyPushStatus', budi, sub(6).endpoint).current.subscribed, true);
  assert.equal(env.sheet('PushSubs').rows.slice(1).filter(r => r[3] === sub(6).endpoint).length, 1, 'one row per device');
});

test('per-device switches keep their own groups and only accept groups of that role', () => {
  const { env, ani, admin } = setup();
  env.call('saveMyPush', ani, sub(1));
  let st = env.call('setMyPushPrefs', ani, sub(1).endpoint, ['makan', 'perpanjangan', 'makan', 'bogus']);
  assert.deepEqual(st.current.off, ['makan']);
  env.call('saveMyPush', ani, sub(1));           // re-sync keeps the switches
  assert.deepEqual(env.call('getMyPushStatus', ani, sub(1).endpoint).current.off, ['makan']);
  assert.throws(() => env.call('setMyPushPrefs', ani, sub(9).endpoint, []), /belum mengaktifkan/);
  env.call('saveAdminPush', admin, sub(2), 'Laptop');
  st = env.call('setAdminPushPrefs', admin, sub(2).endpoint, ['perpanjangan', 'pr']);
  assert.deepEqual(st.current.off, ['perpanjangan']);
  assert.deepEqual(st.kinds, ['sesi', 'perpanjangan']);
});

test('sesi besok: one short message per client (first name, times, coach) and one summary for the coach', () => {
  const env = withSchedules([
    sched('S1', 'PT-A', 'Ani Anggraini', '2026-09-30T23:00:00Z', 'read', 'Rizky Pratama'),    // 06:00 WIB 1 Okt
    sched('S2', 'PT-B', 'Budi', '2026-10-01T00:00:00Z', 'read'),
    sched('S3', 'PT-B', 'Budi', '2026-10-01T10:00:00Z', 'read'),
    sched('S4', 'PT-C', 'Citra', '2026-10-01T02:00:00Z', 'completed'),                         // not counted
    sched('S5', 'PT-C', 'Citra', '2026-10-02T02:00:00Z', 'read'),                              // day after
  ]);
  const now = new Date('2026-09-30T12:00:00Z');                                                // 19:00 WIB
  const msgs = env.callRaw('_pushPlanMessages_', now).filter(m => m.kind === 'sesi-besok');
  const byTarget = Object.fromEntries(msgs.map(m => [m.target, m]));
  assert.deepEqual(Object.keys(byTarget).sort(), ['admin', 'm:PT-A', 'm:PT-B']);
  assert.equal(byTarget['m:PT-A'].body, 'Kak Ani, besok jam 06:00 bersama Coach Rizky.');
  assert.equal(byTarget['m:PT-B'].body, 'Kak Budi, besok jam 07:00 dan 17:00.');
  assert.equal(byTarget['m:PT-A'].title, 'Sesi besok');
  assert.match(byTarget.admin.body, /^2 klien: Ani 06:00, Budi 07:00 \(\+1\)$/);
  assert.ok(msgs.every(m => !/Anggraini|Pratama|628|08\d{6}/.test(m.body)), 'no surname, no number');
  assert.equal(byTarget['m:PT-A'].slot, '2026-09-30T19');
});

test('sesi hari ini: only sessions still ahead, in the morning window; nothing outside the window', () => {
  const env = withSchedules([
    sched('S1', 'PT-A', 'Ani', '2026-09-30T20:00:00Z', 'read'),    // 03:00 WIB: already past at 06:00
    sched('S2', 'PT-B', 'Budi', '2026-10-01T00:00:00Z', 'read'),   // 07:00 WIB
  ]);
  const msgs = env.callRaw('_pushPlanMessages_', new Date('2026-09-30T23:00:00Z')).filter(m => m.kind === 'sesi-hari-ini');   // 06:00 WIB
  assert.deepEqual(Array.from(msgs.map(m => m.target).sort()), ['admin', 'm:PT-B']);
  assert.equal(msgs.find(m => m.target === 'm:PT-B').body, 'Kak Budi, hari ini jam 07:00.');
  assert.equal(env.callRaw('_pushPlanMessages_', new Date('2026-10-01T03:00:00Z')).filter(m => m.kind.indexOf('sesi') === 0).length, 0, '10:00 WIB: too late');
  assert.equal(env.callRaw('_pushPlanMessages_', new Date('2026-10-01T05:00:00Z')).filter(m => m.kind.indexOf('sesi') === 0).length, 0, '12:00 WIB: no session reminder');
  env.props.PUSH_HOUR_SESI_HARI_INI = '9';
  assert.equal(env.callRaw('_pushPlanMessages_', new Date('2026-09-30T23:00:00Z')).filter(m => m.kind === 'sesi-hari-ini').length, 0, 'hour is configurable');
});

test('a client who turned the session reminder off gets no session push, but the coach summary stays', () => {
  const env = withSchedules([sched('S1', 'PT-A', 'Ani', '2026-10-01T00:00:00Z', 'read')]);
  env.call('setMemberReminderPrefs', env.adminToken(), 'PT-A', { off: ['sesi-besok'] });
  const msgs = env.callRaw('_pushPlanMessages_', new Date('2026-09-30T12:00:00Z')).filter(m => m.kind === 'sesi-besok');
  assert.deepEqual(Array.from(msgs.map(m => m.target)), ['admin']);
});

test('PR and makan: counts only, and they follow the WhatsApp hours and the client switches', () => {
  const env = withSchedules([]);
  const list = [{ client: { id: 'PT-A', name: 'Ani Anggraini' }, late: [1], today: [2, 3], tomorrow: [] }, { client: { id: 'PT-B', name: 'Budi' }, late: [], today: [], tomorrow: [] }];
  const pr = env.callRaw('_pushPrMessages_', list, '2026-10-01T08');
  assert.equal(pr.length, 1);
  assert.equal(pr[0].body, 'Kak Ani, PR kamu: 1 terlambat, 2 hari ini.');
  const makan = env.callRaw('_pushMakanMessages_', 'pagi', [{ id: 'PT-A', name: 'Ani Anggraini', off: [], mealOn: true }, { id: 'PT-B', name: 'Budi', off: ['makan-pagi'] }, { id: 'PT-C', name: 'Citra', off: [], mealOn: false }], '2026-10-01T06');
  assert.deepEqual(Array.from(makan.map(m => m.target)), ['m:PT-A']);
  assert.equal(makan[0].title, 'Makan pagi');
  assert.match(makan[0].body, /^Kak Ani, waktunya makan pagi\./);
  const parts = { date: '2026-10-01', hour: 6, day: 4 };
  assert.equal(env.callRaw('_pushHour_', 'pr', parts), 8);
  assert.equal(env.callRaw('_pushHour_', 'makan-pagi', parts), 6);
  assert.equal(env.callRaw('_pushHour_', 'makan-sore', parts), 16);
  env.props.RMD_PR_HOUR = '10';
  assert.equal(env.callRaw('_pushHour_', 'pr', parts), 10);
  // the PR plan reads the real tasks sheet
  assert.equal(env.callRaw('_pushDue_', { hour: 8 }, 8), true);
  assert.equal(env.callRaw('_pushDue_', { hour: 10 }, 8), true);
  assert.equal(env.callRaw('_pushDue_', { hour: 11 }, 8), false);
  assert.equal(env.callRaw('_pushDue_', { hour: 7 }, 8), false);
});

test('enqueue: one row per device, groups switched off are skipped, the same message is never queued twice', () => {
  const { env, ani, admin } = setup();
  env.call('saveMyPush', ani, sub(1)); env.call('saveMyPush', ani, sub(2));
  env.call('saveAdminPush', admin, sub(3));
  env.call('setMyPushPrefs', ani, sub(2).endpoint, ['makan']);
  const msgs = [
    { target: 'm:PT-A', kind: 'makan-pagi', slot: '2026-10-01T06', title: 'Makan pagi', body: 'x' },
    { target: 'admin', kind: 'sesi-besok', slot: '2026-10-01T19', title: 'Sesi besok', body: 'y' },
  ];
  assert.equal(env.callRaw('_pushEnqueue_', msgs), 2);       // Ani device 1 + the coach device
  assert.equal(env.callRaw('_pushEnqueue_', msgs), 0);       // again: nothing new
  const rows = outRows(env);
  assert.deepEqual(rows.map(r => r[4]).sort(), ['makan-pagi', 'sesi-besok']);
  assert.ok(rows.every(r => r[8] === 'baru' && r[9] === 0));
});

test('the relay needs the secret; pull plans, leases and returns what the sender needs', () => {
  const { env, admin } = setup();
  env.call('saveAdminPush', admin, sub(3), 'Laptop');
  assert.throws(() => env.call('pushRelayPull', ''), /tidak valid/);
  assert.throws(() => env.call('pushRelayPull', 'x'.repeat(32)), /tidak valid/);
  assert.throws(() => env.call('pushRelayAck', 'x', []), /tidak valid/);
  env.props.PUSH_ENABLED = 'false';
  assert.deepEqual(env.call('pushRelayPull', SECRET), { messages: [], key: '', privateKey: '' }, 'switched off: an empty answer, no error, no keys');
  assert.throws(() => env.call('pushRelayPull', 'x'.repeat(32)), /tidak valid/, 'still guarded when off');
  delete env.props.PUSH_ENABLED;
  env.callRaw('_pushEnqueue_', [{ target: 'admin', kind: 'perpanjangan', slot: 'REN-1', title: 'Minta perpanjang paket', body: 'Ani minta perpanjang: Regular 8.' }]);
  const a = env.call('pushRelayPull', SECRET);
  assert.equal(a.key, 'P'.repeat(87));
  assert.equal(a.privateKey, 'K'.repeat(43), 'the sender gets the private key only through the secret-guarded answer');
  const m = a.messages.find(x => x.payload.kind === 'perpanjangan');
  assert.ok(m);
  assert.equal(m.endpoint, sub(3).endpoint); assert.equal(m.p256dh, P256); assert.equal(m.auth, AUTH);
  assert.deepEqual(Object.keys(m.payload).sort(), ['body', 'kind', 'tag', 'title', 'url']);
  const leased = outRows(env).find(r => r[0] === m.id);
  assert.equal(leased[8], 'diambil'); assert.equal(leased[9], 1);
  // a second pull right away does not hand the same row out again
  assert.equal(env.call('pushRelayPull', SECRET).messages.filter(x => x.id === m.id).length, 0);
  assert.deepEqual(env.call('pushRelayAck', SECRET, [{ id: m.id, s: 'ok' }]), { ok: 1, removed: 0 });
  assert.equal(outRows(env).find(r => r[0] === m.id)[8], 'terkirim');
});

test('ack: failures retry up to 4 times, 404/410 removes the device, a row older than 6 hours is dropped', () => {
  const { env, ani } = setup();
  env.call('saveMyPush', ani, sub(1));
  const q = n => env.callRaw('_pushEnqueue_', [{ target: 'm:PT-A', kind: 'pr', slot: 'slot' + n, title: 't', body: 'b' }]);
  q(1);
  const id = () => outRows(env)[0][0];
  for (let i = 1; i <= 4; i++) {
    const got = env.call('pushRelayPull', SECRET).messages.find(x => x.id === id());
    assert.ok(got, 'try ' + i);
    env.call('pushRelayAck', SECRET, [{ id: id(), s: 'fail' }]);
  }
  assert.equal(outRows(env)[0][8], 'gagal');
  assert.equal(env.call('pushRelayPull', SECRET).messages.filter(x => x.id === id()).length, 0);
  assert.equal(env.sheet('PushSubs').rows[1][10], 4, 'device failure count kept');
  // gone
  q(2);
  const row2 = outRows(env)[1];
  env.call('pushRelayPull', SECRET);
  assert.deepEqual(env.call('pushRelayAck', SECRET, [{ id: row2[0], s: 'gone' }]), { ok: 1, removed: 1 });
  assert.equal(env.call('getMyPushStatus', ani, sub(1).endpoint).current.subscribed, false);
  // stale
  env.call('saveMyPush', ani, sub(1));
  q(3);
  const row3 = outRows(env)[2];
  row3[2] = Date.now() - 7 * 3600000;
  assert.equal(env.call('pushRelayPull', SECRET).messages.filter(x => x.id === row3[0]).length, 0);
  assert.equal(row3[8], 'gagal');
});

test('a renewal request notifies the coach devices at once, and asks GitHub to send when a token is set', () => {
  const { env, ani, admin } = setup();
  env.call('saveAdminPush', admin, sub(3), 'Laptop');
  env.call('requestRenewal', ani, 'P1');
  const row = outRows(env).find(r => r[4] === 'perpanjangan');
  assert.ok(row, 'queued');
  assert.equal(row[5], 'Minta perpanjang paket');
  assert.equal(row[6], 'Ani minta perpanjang: Regular 8.');
  assert.ok(!env.fetches.some(f => /api\.github\.com/.test(f.url)), 'no token, no call');
  env.props.PUSH_GH_TOKEN = 'ghp_test';
  const b = env.call('requestRenewal', env.memberToken(KEY_B), 'P1');
  assert.ok(b.request);
  const kick = env.fetches.find(f => /api\.github\.com\/repos\/xnkzzxd\/xnk\/dispatches/.test(f.url));
  assert.ok(kick, 'repository_dispatch sent');
  assert.equal(JSON.parse(kick.options.payload).event_type, 'push-now');
  assert.equal(kick.options.headers.Authorization, 'Bearer ghp_test');
});

test('with push off, a renewal request works as before and queues nothing', () => {
  const env = seededEnv();
  env.call('requestRenewal', env.memberToken(KEY_A), 'P1');
  assert.equal(env.sheet('PushOutbox'), null);
});

test('the keys are installed from the Drive config file; a bad value is skipped and does not stop the others', () => {
  const { createEnv } = require('./harness');
  const env = createEnv();
  const file = { name: 'xnk-pt-config.json', owner: 'owner@example.com', trashed: false,
    content: JSON.stringify({ PUSH_VAPID_PUBLIC: 'P'.repeat(87), PUSH_VAPID_PRIVATE: 'K'.repeat(43), PUSH_RELAY_SECRET: 'short' }) };
  env.driveFiles.push(file);
  env.call('doGet', { parameter: {} });
  assert.equal(env.props.PUSH_VAPID_PUBLIC, 'P'.repeat(87));
  assert.equal(env.props.PUSH_VAPID_PRIVATE, 'K'.repeat(43));
  assert.equal(env.props.PUSH_RELAY_SECRET, undefined, 'a too short secret is skipped');
  assert.equal(file.trashed, true);
  assert.ok(!env.logs.some(l => l.includes('K'.repeat(43))), 'the log names keys, never values');
  const other = { name: 'xnk-pt-config.json', owner: 'owner@example.com', trashed: false, content: JSON.stringify({ PUSH_VAPID_PUBLIC: 'bad' }) };
  env.driveFiles.push(other);
  env.call('getPortalBootstrap', '');
  assert.equal(env.props.PUSH_VAPID_PUBLIC, 'P'.repeat(87), 'a bad public key does not replace the good one');
});
