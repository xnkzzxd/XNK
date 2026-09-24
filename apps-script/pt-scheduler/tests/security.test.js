'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B, ADMIN_PIN, inDays } = require('./fixtures');

// Every top-level function without a trailing "_" can be called from any
// browser through google.script.run. Each one must be classified here, so a
// new server function added without a guard makes this test fail.
const PUBLIC = [
  'doGet', 'include', 'adminLogin', 'memberLoginByPhone', 'memberLoginByKey', 'registerNewClient', 'getPublicSchedules',
  'getPriceList', 'getCoaches', 'getLandingStats', 'getPublicTestimonials', 'getPublicAvailability',
  'sanitizeValue', 'escapeHtmlTelegram',
];
const ADMIN = [
  'checkAdminSession', 'changeAdminPin',
  'getMembers', 'getMemberTransactionLog', 'getSchedules',
  'addCoach', 'updateCoach', 'deleteCoach', 'uploadCoachPhoto',
  'addMember', 'updateMemberProfile', 'deleteMember',
  'addSchedule', 'addRecurringSchedule', 'deleteRecurringGroup', 'updateScheduleData', 'updateScheduleCoach',
  'markSchedulesAsRead', 'completeSession', 'deleteSchedule',
  'getPeakHourData', 'getCoachMonthlyStats', 'getPackageTrendStats',
];
const MEMBER = [
  'getMemberProfile', 'getMemberSessions', 'clientBookSchedule', 'clientBookRecurring',
  'clientRescheduleSchedule', 'uploadMemberPhoto', 'updateMemberPhoto',
];
const OWNER = [
  'testDriveAccess', 'migrateSplitMembersData', 'pertahankanWABaruMemberData', 'pertahankanWABaru',
  'setupDailyTrigger', 'setupWeeklyReportTrigger', 'testNotif',
];
const TRIGGER = ['sendDailyReminderEmail', 'sendWeeklyReportEmail'];

const AUTH = /AUTH_REQUIRED/;

test('every browser-callable server function is classified', () => {
  const env = seededEnv();
  const callable = Object.keys(env.context)
    .filter(k => typeof env.context[k] === 'function' && !k.endsWith('_'))
    .sort();
  const known = [...PUBLIC, ...ADMIN, ...MEMBER, ...OWNER, ...TRIGGER].sort();
  assert.deepEqual(callable, known);
});

test('admin functions reject missing, bogus, member and tampered tokens', () => {
  const env = seededEnv();
  const admin = env.adminToken();
  const member = env.memberToken(KEY_A);
  const [body, sig] = admin.split('.');
  const tampered = body + '.' + (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
  for (const fn of ADMIN) {
    for (const bad of [undefined, null, '', 'nope', member, tampered]) {
      assert.throws(() => env.call(fn, bad, 'x', 'y', 'z'), AUTH, `${fn} accepted token ${String(bad).slice(0, 12)}`);
    }
  }
});

test('admin token expires and is revoked by changing ADMIN_PIN', () => {
  const env = seededEnv();
  const { _issueToken_, _adminPinVersion_ } = env.context;
  const expired = _issueToken_({ r: 'admin', v: _adminPinVersion_(), exp: Date.now() - 1000 });
  assert.throws(() => env.call('checkAdminSession', expired), AUTH);

  const token = env.adminToken();
  assert.deepEqual(env.call('checkAdminSession', token), { ok: true });
  env.props.ADMIN_PIN = '999999';
  assert.throws(() => env.call('checkAdminSession', token), AUTH);
});

test('adminLogin: requires ADMIN_PIN, rejects wrong PIN, locks after 10 failures', () => {
  const env = seededEnv();
  delete env.props.ADMIN_PIN;
  assert.throws(() => env.call('adminLogin', '0000'), /PIN admin belum diatur/);

  env.props.ADMIN_PIN = ADMIN_PIN;
  for (let i = 0; i < 10; i++) assert.throws(() => env.call('adminLogin', '000000'), /PIN salah/);
  assert.throws(() => env.call('adminLogin', ADMIN_PIN), /Terlalu banyak/);
  assert.ok(env.fetches.some(f => JSON.parse(f.options.payload).text.includes('LOGIN ADMIN DIKUNCI')));

  env.cache = {}; // lock expired
  assert.ok(env.call('adminLogin', ADMIN_PIN).token);
});

test('changeAdminPin needs the old PIN, min 6 chars, and returns a fresh token', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.throws(() => env.call('changeAdminPin', token, 'wrong', '1234567'), /PIN lama salah/);
  assert.throws(() => env.call('changeAdminPin', token, ADMIN_PIN, '123'), /minimal 6/);
  const res = env.call('changeAdminPin', token, ADMIN_PIN, '13579246');
  assert.equal(env.props.ADMIN_PIN, '13579246');
  assert.deepEqual(env.call('checkAdminSession', res.token), { ok: true });
  assert.throws(() => env.call('checkAdminSession', token), AUTH);
});

test('member functions reject missing and admin tokens', () => {
  const env = seededEnv();
  const admin = env.adminToken();
  for (const fn of MEMBER) {
    for (const bad of [undefined, 'nope', admin]) {
      assert.throws(() => env.call(fn, bad, 'x', 'y', 'z'), AUTH, `${fn} accepted ${String(bad).slice(0, 12)}`);
    }
  }
});

test('owner-only maintenance functions refuse web visitors', () => {
  const env = seededEnv(); // anonymous visitor: active user email is blank
  for (const fn of OWNER) {
    assert.throws(() => env.call(fn), /hanya bisa dijalankan pemilik/, fn);
  }
  const owner = seededEnv({ activeUserEmail: 'owner@example.com' });
  assert.doesNotThrow(() => owner.call('testNotif'));
});

test('trigger handlers cannot be spammed', () => {
  const env = seededEnv();
  env.call('sendDailyReminderEmail');
  env.call('sendDailyReminderEmail');
  env.call('sendDailyReminderEmail');
  assert.equal(env.mails.length, 1);
});

test('clients log in with their WhatsApp number in any common format', () => {
  const env = seededEnv();
  // PT-A is stored as 6281111111111, PT-B as 081222222222.
  for (const phone of ['6281111111111', '081111111111', '81111111111', '+62 811-1111-1111']) {
    assert.equal(env.call('memberLoginByPhone', phone).member.id, 'PT-A', phone);
  }
  assert.equal(env.call('memberLoginByPhone', '6281222222222').member.id, 'PT-B');

  const login = env.call('memberLoginByPhone', '081111111111');
  assert.equal(login.member.name, 'Ani Anggraini');
  assert.equal(JSON.stringify(login).includes(KEY_A), false, 'login must not echo the session key');
  assert.equal(env.call('getMemberProfile', login.token).usedSessions, 5);
});

test('phone login: unknown or invalid numbers are refused', () => {
  const env = seededEnv();
  assert.throws(() => env.call('memberLoginByPhone', '6289999999999'), /tidak ditemukan/);
  assert.throws(() => env.call('memberLoginByPhone', '123'), /tidak valid/);
  assert.throws(() => env.call('memberLoginByPhone', ''), /tidak valid/);
});

test('phone login locks for everyone after 30 unknown numbers, and alerts Telegram', () => {
  const env = seededEnv();
  for (let i = 0; i < 30; i++) {
    assert.throws(() => env.call('memberLoginByPhone', '62899000000' + String(i).padStart(2, '0')), /tidak ditemukan/);
  }
  assert.throws(() => env.call('memberLoginByPhone', '6281111111111'), /Terlalu banyak percobaan/);
  assert.ok(env.fetches.some(f => JSON.parse(f.options.payload).text.includes('LOGIN KLIEN DIKUNCI')));
  env.now = Date.now() + 11 * 60 * 1000;
  assert.equal(env.call('memberLoginByPhone', '6281111111111').member.id, 'PT-A');
});

test('phone login gives old clients a session key, and changing it ends their sessions', () => {
  const env = seededEnv();
  const login = env.call('memberLoginByPhone', '6283333333333'); // PT-C has no key yet
  const key = env.memberRow('PT-C')[13];
  assert.match(key, /^[a-f0-9]{32}$/);
  assert.equal(env.call('getMemberProfile', login.token).id, 'PT-C');
  // Same key on the next login.
  env.call('memberLoginByPhone', '6283333333333');
  assert.equal(env.memberRow('PT-C')[13], key);
  // Owner clears / changes the key in the sheet: old sessions stop working.
  env.memberRow('PT-C')[13] = 'd'.repeat(32);
  assert.throws(() => env.call('getMemberProfile', login.token), AUTH);
});

test('old ?k= links still log in', () => {
  const env = seededEnv();
  assert.throws(() => env.call('memberLoginByKey', 'x'.repeat(32)), AUTH);
  assert.throws(() => env.call('memberLoginByKey', 'c'.repeat(32)), AUTH);
  const login = env.call('memberLoginByKey', KEY_A);
  assert.equal(login.member.id, 'PT-A');
  assert.equal(env.call('getMemberProfile', login.token).id, 'PT-A');
});

test('getMembers (admin) never returns link keys', () => {
  const env = seededEnv();
  const list = env.call('getMembers', env.adminToken());
  assert.equal(list.length, 3);
  assert.ok(!JSON.stringify(list).includes(KEY_A));
});

test('public schedules hide other clients; own bookings come back in full', () => {
  const env = seededEnv();
  const anon = env.call('getPublicSchedules');
  assert.equal(anon.length, 2);
  for (const s of anon) {
    assert.deepEqual(Object.keys(s).sort(), ['coachId', 'coachName', 'end', 'start', 'status']);
  }
  const asAni = env.call('getPublicSchedules', env.memberToken(KEY_A));
  const own = asAni.find(s => s.id === 'SCH-A1');
  assert.equal(own.notes, 'Rahasia Ani');
  assert.equal(own.memberId, 'PT-A');
  assert.equal(own.phone, undefined);
  const other = asAni.find(s => s.id !== 'SCH-A1');
  assert.equal(other.notes, undefined);
  assert.equal(other.memberId, undefined);
  // A bad token just means "not logged in", not an error.
  assert.equal(env.call('getPublicSchedules', 'garbage').length, 2);
});

test('clientBookSchedule books as the token owner, ignoring forged identity', () => {
  const env = seededEnv();
  const res = env.call('clientBookSchedule', env.memberToken(KEY_A), {
    memberId: 'PT-B', memberName: 'Budi', phone: '081222222222',
    start: inDays(5), end: inDays(5.04), duration: 60, notes: '<script>x</script>',
  });
  const row = env.sheet('Schedules').rows.find(r => r[0] === res.id);
  assert.equal(row[1], 'PT-A');
  assert.equal(row[2], 'Ani Anggraini');
  assert.equal(row[3], '6281111111111');
  assert.equal(row[7], 'unread');
  assert.ok(env.mails.length === 1 && !env.mails[0].htmlBody.includes('<script>'));
  assert.equal(env.mails[0].to, 'owner@example.com');
});

test('clientBookSchedule validates the slot', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  assert.throws(() => env.call('clientBookSchedule', t, { start: 'x', end: 'y' }), /tidak valid/);
  assert.throws(() => env.call('clientBookSchedule', t, { start: inDays(5), end: inDays(4) }), /tidak valid/);
  assert.throws(() => env.call('clientBookSchedule', t, { start: inDays(5), end: inDays(6) }), /maksimal 4 jam/);
});

test("clients can only reschedule their own sessions", () => {
  const env = seededEnv();
  const ani = env.memberToken(KEY_A);
  assert.throws(() => env.call('clientRescheduleSchedule', ani, 'SCH-B1', inDays(6), inDays(6.04)), /bukan milik Anda/);
  const newStart = inDays(6);
  env.call('clientRescheduleSchedule', ani, 'SCH-A1', newStart, inDays(6.04));
  assert.equal(env.sheet('Schedules').rows.find(r => r[0] === 'SCH-A1')[4], newStart);
});

test('clientBookRecurring books for the token owner as unread', () => {
  const env = seededEnv();
  const d = new Date(Date.now() + 86400000);
  const startDate = d.toISOString().slice(0, 10);
  const res = env.call('clientBookRecurring', env.memberToken(KEY_B),
    { memberId: 'PT-A', startDate, time: '09:00', duration: 60, notes: 'x' },
    { weekdays: [0, 1, 2, 3, 4, 5, 6], occurrences: 3 });
  assert.equal(res.count, 3);
  const rows = env.sheet('Schedules').rows.filter(r => r[11] === res.groupId);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r[1] === 'PT-B' && r[7] === 'unread'));
});

test('updateMemberPhoto only accepts Drive photo URLs and only for yourself', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  assert.throws(() => env.call('updateMemberPhoto', t, 'javascript:alert(1)'), /tidak valid/);
  env.call('updateMemberPhoto', t, 'https://lh3.googleusercontent.com/d/abc_123');
  assert.equal(env.memberRow('PT-A')[5], 'https://lh3.googleusercontent.com/d/abc_123');
  assert.equal(env.memberRow('PT-B')[5], '');
});

test('uploadMemberPhoto rejects non-images and oversize files', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  assert.throws(() => env.call('uploadMemberPhoto', t, 'aGVsbG8=', 'a.html', 'text/html'), /gambar/);
  assert.throws(() => env.call('uploadMemberPhoto', t, 'A'.repeat(7000001), 'a.png', 'image/png'), /5 MB/);
  const res = env.call('uploadMemberPhoto', t, 'aGVsbG8=', 'a.png', 'image/png');
  assert.equal(env.memberRow('PT-A')[5], res.url);
});

test('doGet serves only real pages; unknown views fall back to Index', () => {
  const env = seededEnv();
  const index = env.call('doGet', { parameter: {} }).content;
  for (const view of ['Admin', 'Booking', 'PTBooking', 'public', '../x']) {
    assert.equal(env.call('doGet', { parameter: { view } }).content, index, view);
  }
  assert.notEqual(env.call('doGet', { parameter: { view: 'Landing' } }).content, index);
});
