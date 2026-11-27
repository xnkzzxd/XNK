'use strict';
// Fase AE (T-2500): login per coach. Token coach hanya untuk COACH_FNS lewat doPost, dan hanya data coach itu sendiri.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('./api-lists');
const { seededEnv, inDays, wibSlot } = require('./fixtures');

const post = (env, fn, args) => JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify({ fn, args: args || [] }) } }).content);

function twoCoaches() {
  const env = seededEnv();
  env.ss.seed('Coaches', [
    ['ID', 'Nama Coach', 'No WA', 'Spesialisasi', 'Foto URL', 'Bio', 'Pengalaman', 'Status Aktif', 'Headline', 'Sertifikasi', 'Prestasi', 'Lokasi', 'Instagram', 'Foto File ID', 'Bagi Hasil Tipe', 'Bagi Hasil Nilai'],
    ['C-1', 'Rizky', '6281112223334', 'Strength', '', '', '', true, '', '', '', '', '', '', 'persen', 50],
    ['C-2', 'Dewi', '6281112229999', 'Yoga', '', '', '', true, '', '', '', '', '', '', 'persen', 40],
  ]);
  const md = env.sheet('MemberData');
  md.rows.find(r => r[0] === 'PT-A')[10] = 'C-1';
  md.rows.find(r => r[0] === 'PT-B')[10] = 'C-2';
  const sc = env.sheet('Schedules');
  sc.rows.find(r => r[0] === 'SCH-B1')[8] = 'C-2';
  const owner = env.adminToken();
  assert.equal(env.call('setCoachPin', owner, 'C-1', '111111').hasPin, true);
  assert.equal(env.call('setCoachPin', owner, 'C-2', '222222').hasPin, true);
  const tokA = post(env, 'adminLogin', ['111111']).data.token;
  const tokB = post(env, 'adminLogin', ['222222']).data.token;
  return { env, owner, tokA, tokB };
}

test('coach: setiap nama di COACH_FNS ada di daftar ADMIN, dan setCoachPin khusus pemilik', () => {
  const env = seededEnv();
  const fns = env.call('_coachFnNames_');
  for (const n of fns) assert.ok(L.ADMIN.includes(n), n + ' di COACH_FNS harus fungsi admin');
  assert.ok(!fns.includes('setCoachPin'));
  for (const n of ['updateAppSettings', 'savePackage', 'deleteMember', 'saveCoachShare', 'exportMyData', 'getSettingsBundle', 'setMemberCoach', 'assignClientsToCoach', 'saveProgramTemplate', 'saveTaskTemplate', 'setCoachPin', 'saveCoach', 'saveContent']) assert.ok(!fns.includes(n), n + ' harus khusus pemilik');
});

test('coach: PIN coach login dengan me, PIN pemilik tetap pemilik, PIN kembar ditolak', () => {
  const { env, owner, tokA } = twoCoaches();
  assert.equal(post(env, 'adminLogin', ['111111']).data.me.coachId, 'C-1');
  assert.equal(post(env, 'getAdminBootstrap', [owner]).data.me.role, 'owner');
  assert.throws(() => env.call('setCoachPin', owner, 'C-2', '111111'), /sudah dipakai/);
  assert.throws(() => env.call('setCoachPin', owner, 'C-2', '246810'), /sudah dipakai/);
  assert.throws(() => env.call('setCoachPin', owner, 'C-2', '12'), /6 angka/);
  const r = post(env, 'setCoachPin', [tokA, 'C-1', '333333']);
  assert.equal(r.ok, false);
  assert.match(r.error, /Hanya pemilik/);
});

test('coach: bootstrap hanya klien dan jadwal sendiri, tanpa nomor coach lain', () => {
  const { env, owner, tokA, tokB } = twoCoaches();
  const a = post(env, 'getAdminBootstrap', [tokA]).data;
  assert.deepEqual(a.members.map(m => m.id), ['PT-A']);
  assert.deepEqual(a.schedules.map(s => s.id), ['SCH-A1']);
  assert.equal(a.me.role, 'coach');
  const other = a.coaches.coaches.find(c => c.id === 'C-2');
  assert.equal(other.phone, undefined);
  assert.equal(other.shareValue, undefined);
  const b = post(env, 'getAdminBootstrap', [tokB]).data;
  assert.deepEqual(b.members.map(m => m.id), ['PT-B']);
  const o = post(env, 'getAdminBootstrap', [owner]).data;
  assert.equal(o.members.length, 3);
  assert.ok(o.coaches.coaches.every(c => typeof c.hasPin === 'boolean'));
});

test('coach: data coach lain ditolak di setiap pintu', () => {
  const { env, tokA } = twoCoaches();
  const deny = (fn, args, re) => { const r = post(env, fn, [tokA, ...args]); assert.equal(r.ok, false, fn); assert.match(r.error, re, fn); };
  deny('getClientBundle', ['PT-B'], /Klien tidak ditemukan/);
  deny('getSessionBriefing', ['SCH-B1'], /Jadwal tidak ditemukan/);
  deny('completeSession', ['SCH-B1', 'PT-B'], /Jadwal tidak ditemukan/);
  deny('deleteSchedule', ['SCH-B1'], /Jadwal tidak ditemukan/);
  deny('saveWorkoutLog', ['PT-B', '2026-11-01', '', [], null], /Klien tidak ditemukan/);
  deny('addSchedule', [{ memberId: 'PT-B', start: inDays(5), end: inDays(5.04) }], /Klien tidak ditemukan/);
  deny('updateScheduleData', [{ id: 'SCH-B1', memberId: 'PT-A', start: inDays(5), end: inDays(5.04) }], /Jadwal tidak ditemukan/);
  deny('getCoachAvailability', ['C-2'], /Hanya pemilik/);
  deny('updateAppSettings', [{}], /Hanya pemilik/);
  deny('deleteMember', ['PT-B'], /Hanya pemilik/);
  deny('getMembers', [], /Hanya pemilik/);
  // Jadwal coach lain tetap utuh.
  assert.ok(env.sheet('Schedules').rows.find(r => r[0] === 'SCH-B1'));
});

test('coach: tanpa doPost (google.script.run) token coach selalu ditolak', () => {
  const { env, tokA } = twoCoaches();
  assert.throws(() => env.call('getAdminBootstrap', tokA), /Hanya pemilik/);
});

test('coach: booking ke klien sendiri memakai coach sendiri, meski minta coach lain', () => {
  const { env, tokA } = twoCoaches();
  const r = post(env, 'addSchedule', [tokA, { memberId: 'PT-A', memberName: 'Ani', phone: '0811', notes: '', ...wibSlot(6), coachId: 'C-2' }]);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.coachId, 'C-1');
  const row = env.sheet('Schedules').rows.find(x => x[0] === r.data.id);
  assert.equal(row[8], 'C-1');
});

test('coach: PIN dihapus = token coach mati', () => {
  const { env, owner, tokA } = twoCoaches();
  env.call('setCoachPin', owner, 'C-1', '');
  const r = post(env, 'getAdminBootstrap', [tokA]);
  assert.equal(r.ok, false);
  assert.equal(r.auth, true);
});

test('coach: keuangan hanya tagihan dan pengeluaran sendiri', () => {
  const { env, owner, tokA } = twoCoaches();
  env.props.FIN_ENABLED = 'true';
  env.call('_finEnsure_');
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  env.call('_finAppend_', 'Tagihan', { 'ID Tagihan': 'TG-A', 'Member ID': 'PT-A', 'Nama Klien': 'Ani', 'Coach ID': 'C-1', Tanggal: day, Total: 800000, Diskon: 0, Status: 'Belum bayar', 'Dibuat Pada': now, 'Diubah Pada': now });
  env.call('_finAppend_', 'Tagihan', { 'ID Tagihan': 'TG-B', 'Member ID': 'PT-B', 'Nama Klien': 'Budi', 'Coach ID': 'C-2', Tanggal: day, Total: 900000, Diskon: 0, Status: 'Belum bayar', 'Dibuat Pada': now, 'Diubah Pada': now });
  env.call('_bustFin_');
  const mm = Number(day.slice(5, 7)), yy = Number(day.slice(0, 4));
  const page = post(env, 'getFinancePage', [tokA, mm, yy, true]);
  assert.equal(page.ok, true, page.error);
  assert.deepEqual(page.data.bills.map(b => b.id), ['TG-A']);
  assert.equal(post(env, 'getBillDetail', [tokA, 'TG-B']).ok, false);
  assert.equal(post(env, 'savePayment', [tokA, { billId: 'TG-B', amount: 1000, date: day, method: 'Tunai' }]).ok, false);
  const free = post(env, 'savePayment', [tokA, { amount: 1000, date: day, method: 'Tunai', category: 'Lainnya' }]);
  if (free.ok) {
    const row = env.call('_finReadRaw_', 'Pembayaran').find(x => x['ID Bayar'] === free.data.id);
    assert.equal(row['Coach ID'], 'C-1', 'payment without a bill belongs to the coach');
    const tokB = post(env, 'adminLogin', ['222222']).data.token;
    const pageB = post(env, 'getFinancePage', [tokB, mm, yy, true]).data;
    assert.ok(!pageB.payments.some(x => x.id === free.data.id), 'coach B never sees coach A payment');
    const pageA = post(env, 'getFinancePage', [tokA, mm, yy, true]).data;
    assert.ok(pageA.payments.some(x => x.id === free.data.id));
  }
  const ex = post(env, 'saveExpense', [tokA, { amount: 5000, date: day, method: 'Tunai', category: 'Alat', coachId: 'C-2' }]);
  if (ex.ok) {
    const row = env.call('_finReadRaw_', 'Pengeluaran').find(e => e['ID Keluar'] === ex.data.id);
    assert.equal(row['Coach ID'], 'C-1');
  }
  const ownerPage = env.call('getFinancePage', owner, mm, yy, true);
  assert.equal(ownerPage.bills.length, 2);
});

test('coach gelombang 2: tambah klien dipaksa ke coach sendiri; nomor klien coach lain ditolak', () => {
  const { env, tokA } = twoCoaches();
  const r = post(env, 'addMember', [tokA, { name: 'Eka', phone: '6289999000111', goal: 'Sehat', packageId: 'P1', coachId: 'C-2' }]);
  assert.equal(r.ok, true, r.error);
  const row = env.sheet('MemberData').rows.find(x => x[1] === 'Eka');
  assert.equal(row[10], 'C-1');
  const bad = post(env, 'addMember', [tokA, { name: 'Budi', phone: '081222222222', goal: 'x', packageId: 'P1' }]);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /klien coach lain/);
});

test('coach gelombang 2: PR, program, gizi, cuti hanya untuk klien sendiri', () => {
  const { env, tokA } = twoCoaches();
  const ok = (fn, args) => { const r = post(env, fn, [tokA, ...args]); assert.equal(r.ok, true, fn + ': ' + r.error); return r.data; };
  const no = (fn, args) => { const r = post(env, fn, [tokA, ...args]); assert.equal(r.ok, false, fn + ' must refuse'); };
  ok('addTask', [{ memberId: 'PT-A', title: 'Jalan 30 menit', category: 'aktivitas' }]);
  no('addTask', [{ memberId: 'PT-B', title: 'x', category: 'aktivitas' }]);
  ok('getTasksForMember', ['PT-A']);
  no('getTasksForMember', ['PT-B']);
  ok('getMemberProgram', ['PT-A']);
  no('saveMemberProgram', ['PT-B', []]);
  no('getClientNutrition', ['PT-B']);
  no('setClientHold', ['PT-B', { jenis: 'cuti', mulai: '2026-12-01' }, {}]);
  no('getClientCare', ['PT-B']);
  no('deleteRecurringGroup', ['GRP-X']);
  no('getMemberReport', ['PT-B', {}]);
});

test('coach gelombang 2: tugas coach lain tidak bisa diubah atau dihapus', () => {
  const { env, owner, tokA } = twoCoaches();
  const t = env.call('addTask', owner, { memberId: 'PT-B', title: 'Milik B', category: 'aktivitas' });
  const id = t.id || (t.task && t.task.id) || env.sheet('Tasks').rows.find(r => r[1] === 'PT-B')[0];
  assert.equal(post(env, 'deleteTask', [tokA, id]).ok, false);
  assert.equal(post(env, 'updateTask', [tokA, { id: id, title: 'diubah' }]).ok, false);
  assert.ok(env.sheet('Tasks').rows.find(r => r[0] === id));
});

test('coach gelombang 2: Beranda Coach dan perpanjangan hanya klien sendiri', () => {
  const { env, tokA } = twoCoaches();
  const hub = post(env, 'getCoachHub', [tokA]);
  assert.equal(hub.ok, true, hub.error);
  assert.equal(hub.data.selfName, 'Rizky');
  assert.equal(hub.data.stats.activeClients, 1);
  assert.ok(hub.data.today.every(s => s.memberId === 'PT-A'));
  assert.deepEqual(hub.data.targets, []);
  const rr = post(env, 'getRenewalRequests', [tokA, {}]);
  assert.equal(rr.ok, true, rr.error);
  assert.ok(rr.data.every(q => q.memberId === 'PT-A' || q.coachId === 'C-1'));
});

test('pemilik: pindah coach memindahkan klien dan sesi mendatang, coach tidak boleh', () => {
  const { env, owner, tokA, tokB } = twoCoaches();
  assert.equal(post(env, 'setMemberCoach', [tokA, 'PT-A', 'C-2']).ok, false);
  const r = env.call('setMemberCoach', owner, 'PT-A', 'C-2', { moveSessions: true });
  assert.equal(r.coachId, 'C-2');
  assert.deepEqual(r.moved, ['SCH-A1']);
  assert.equal(env.sheet('MemberData').rows.find(x => x[0] === 'PT-A')[10], 'C-2');
  assert.equal(env.sheet('Schedules').rows.find(x => x[0] === 'SCH-A1')[8], 'C-2');
  const b = post(env, 'getAdminBootstrap', [tokB]).data;
  assert.deepEqual(b.members.map(m => m.id).sort(), ['PT-A', 'PT-B']);
  assert.deepEqual(post(env, 'getAdminBootstrap', [tokA]).data.members, []);
  const many = env.call('assignClientsToCoach', owner, ['PT-C'], 'C-1');
  assert.deepEqual(many.members, ['PT-C']);
});
