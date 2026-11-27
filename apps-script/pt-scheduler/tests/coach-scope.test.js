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
  for (const n of ['updateAppSettings', 'savePackage', 'deleteMember', 'addMember', 'saveCoachShare', 'exportMyData', 'getSettingsBundle']) assert.ok(!fns.includes(n), n + ' harus khusus pemilik');
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
  assert.equal(post(env, 'savePayment', [tokA, { amount: 1000, date: day, method: 'Tunai', category: 'Lainnya' }]).ok, false);
  const ex = post(env, 'saveExpense', [tokA, { amount: 5000, date: day, method: 'Tunai', category: 'Alat', coachId: 'C-2' }]);
  if (ex.ok) {
    const row = env.call('_finReadRaw_', 'Pengeluaran').find(e => e['ID Keluar'] === ex.data.id);
    assert.equal(row['Coach ID'], 'C-1');
  }
  const ownerPage = env.call('getFinancePage', owner, mm, yy, true);
  assert.equal(ownerPage.bills.length, 2);
});
