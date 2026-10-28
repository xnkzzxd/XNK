'use strict';
// Versi data per klien (2026-10): salinan di perangkat dipakai selama versinya sama; setiap penulis data klien menaikkan versi.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B, wibSlot } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const boot = (env, key) => j(env.call('getPortalBootstrap', env.memberToken(key)));

// Penulis yang TIDAK menyentuh data getPortalMore / getClientBundle (atau datanya selalu dikirim segar oleh bootstrap).
// Fungsi baca (get*, preview*, export*, check*) tidak perlu didaftar. Fungsi baru yang menulis data klien harus memanggil
// _bumpMember_ / _bumpAfter_; kalau tidak, daftarkan di sini dengan alasan.
const NO_MEMBER_DATA = [
  // login, sesi, pengaturan akun
  'adminLogin', 'memberLoginByKey', 'memberLoginByPhone', 'registerNewClient', 'changeAdminPin', 'markGuideSeen',
  // profil & foto profil ikut getPortalBootstrap (selalu segar)
  'uploadMemberPhoto', 'updateMemberPhoto', 'deleteMember',
  // coach, paket, konten, pengaturan: cache bersama (_bustShared_ masuk versi) atau bootstrap
  'addCoach', 'updateCoach', 'deleteCoach', 'uploadCoachPhoto', 'saveCoach', 'setCoachActive', 'setSelfCoach', 'assignUnassignedToSelf',
  'saveCoachAvailability', 'addCoachTimeOff', 'deleteCoachTimeOff', 'saveCoachTargets', 'saveCoachShare',
  'savePackage', 'setPackageActive', 'deletePackage', 'reorderPackages', 'saveContent', 'deleteContent', 'updateAppSettings',
  // data panel saja (tidak di portal maupun halaman klien)
  'saveTaskTemplate', 'deleteTaskTemplate', 'setMemberReminderPrefs', 'markSchedulesAsRead', 'saveExpense', 'saveFinanceCategory',
  'deleteFinanceCategory', 'uploadFinanceProof', 'swapMyMenuItem',
  // tanda badge sudah dirayakan: jawaban sudah lengkap, portal menambalnya sendiri
  'markBadgesSeen',
  // pengingat, trigger, perawatan pemilik
  'installReminderTrigger', 'runReminderTick', 'sendReminderTest', 'sendTelegramTest', 'sendDailyReminderEmail', 'sendWeeklyReportEmail',
  'setupDailyTrigger', 'setupReminderTrigger', 'setupWeeklyReportTrigger', 'testDriveAccess', 'testNotif', 'migrateSplitMembersData',
  'pertahankanWABaru', 'pertahankanWABaruMemberData',
];

test('every public writer bumps the member version or is listed as not touching member data', () => {
  const env = seededEnv();
  const names = Object.keys(env.context).filter(k => typeof env.context[k] === 'function' && !k.endsWith('_') && /^[a-z]/.test(k))
    .filter(n => !/^(get|preview|export|check|include|doGet|sanitize|escape)/.test(n));
  const missing = names.filter(n => NO_MEMBER_DATA.indexOf(n) === -1 && !/_bump(Member|After)_\(/.test(env.context[n].toString()));
  assert.deepEqual(missing, [], 'call _bumpMember_ / _bumpAfter_ after the write, or list the function in NO_MEMBER_DATA');
  const stale = NO_MEMBER_DATA.filter(n => typeof env.context[n] !== 'function');
  assert.deepEqual(stale, [], 'NO_MEMBER_DATA lists functions that no longer exist');
});

test('bootstrap carries a stable moreVer; getPortalMore carries the same ver', () => {
  const env = seededEnv();
  const a = boot(env, KEY_A), b = boot(env, KEY_A);
  assert.ok(a.moreVer && a.moreVer === b.moreVer, 'same version while nothing changes');
  const more = j(env.call('getPortalMore', env.memberToken(KEY_A)));
  assert.equal(more.ver, a.moreVer);
  assert.equal(more.day, env.call('_todayWib_'));
  assert.ok(a.coachStatus && a.coachStatus.status, 'coach status comes with the bootstrap');
  assert.equal(j(env.call('getPortalBootstrap', '')).moreVer, '', 'no member, no version');
});

test('a client write bumps only that client; a shared write bumps everyone', () => {
  const env = seededEnv(), t = env.memberToken(KEY_A);
  const a0 = boot(env, KEY_A).moreVer, b0 = boot(env, KEY_B).moreVer;
  env.call('saveMyMeasurement', t, { berat: 70 });
  const a1 = boot(env, KEY_A).moreVer;
  assert.notEqual(a1, a0);
  assert.equal(boot(env, KEY_B).moreVer, b0, 'other client unchanged');
  env.call('saveContent', env.adminToken(), { tipe: 'tips', judul: 'Air', isi: 'Minum.' });
  assert.notEqual(boot(env, KEY_A).moreVer, a1);
  assert.notEqual(boot(env, KEY_B).moreVer, b0);
});

test('workout, food and coach writes bump the client version', () => {
  const env = seededEnv(), t = env.memberToken(KEY_A), adm = env.adminToken();
  env.props.NUTRITION_ENABLED = 'true';
  const steps = [
    ['logMyWorkout', () => env.call('logMyWorkout', t, '', [{ gerakan: 'Squat', sets: [{ berat: 40, rep: 8 }] }], { cid: 'wl-1' })],
    ['logMyFood', () => env.call('logMyFood', t, { waktu: 'siang', custom: { nama: 'Bakso', kal: 300 }, jumlah: 1 })],
    ['saveWorkoutLog', () => env.call('saveWorkoutLog', adm, 'PT-A', '', '', [{ gerakan: 'Row', sets: [{ berat: 30, rep: 10 }] }])],
    ['saveMemberMeasurement', () => env.call('saveMemberMeasurement', adm, 'PT-A', { berat: 69 })],
    ['saveClientNutrition', () => env.call('saveClientNutrition', adm, 'PT-A', { tinggi: 165, jk: 'p', goal: 'turun', umur: 30 })],
    ['addTask', () => env.call('addTask', adm, { memberId: 'PT-A', title: 'Jalan kaki', category: 'aktivitas' })],
  ];
  let prev = boot(env, KEY_A).moreVer;
  steps.forEach(([name, fn]) => {
    fn();
    const now = boot(env, KEY_A).moreVer;
    assert.notEqual(now, prev, name + ' bumps');
    prev = now;
  });
});

test('completeSession bumps the schedule owner', () => {
  const env = seededEnv(), adm = env.adminToken();
  const s = wibSlot(-1);
  env.sheet('Schedules').rows.push(['SCH-X', 'PT-B', 'Budi', '081222222222', s.start, s.end, '', 'read', '', '', '', '', '']);
  const b0 = boot(env, KEY_B).moreVer, a0 = boot(env, KEY_A).moreVer;
  env.call('completeSession', adm, 'SCH-X');
  assert.notEqual(boot(env, KEY_B).moreVer, b0);
  assert.equal(boot(env, KEY_A).moreVer, a0);
});

test('panel: getClientBundle.ver and getAdminMore.memberVers match the portal version', () => {
  const env = seededEnv(), adm = env.adminToken();
  const v = boot(env, KEY_A).moreVer;
  assert.equal(j(env.call('getClientBundle', adm, 'PT-A')).ver, v);
  const more = j(env.call('getAdminMore', adm));
  assert.equal(more.memberVers['PT-A'], v);
  assert.ok(more.memberVers['PT-B'] && more.memberVers['PT-B'] !== v);
});

test('logMyWorkout returns the routines too (no follow-up getMyProgram)', () => {
  const env = seededEnv(), t = env.memberToken(KEY_A);
  const r = j(env.call('logMyWorkout', t, '', [{ gerakan: 'Squat', sets: [{ berat: 40, rep: 8 }] }]));
  assert.deepEqual(r.program, j(env.call('getMyProgram', t)));
});

test('a failing CacheService means "unknown" (always fetch), never a crash', () => {
  const env = seededEnv(), t = env.memberToken(KEY_A);
  env.context.CacheService = { getScriptCache() { throw new Error('boom'); } };
  assert.equal(j(env.call('getPortalBootstrap', t)).moreVer, '');
  env.call('saveMyMeasurement', t, { berat: 70 });
});
