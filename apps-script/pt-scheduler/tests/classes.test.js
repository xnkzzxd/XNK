'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B, wibSlot } = require('./fixtures');

const CLASS_PKG = { namaPaket: 'Group HIIT', kategori: 'regular', harga: 300000, jumlahSesi: 8, durasi: '1 Bulan', deskripsi: '', benefit: [], aktif: true, tipe: 'kelas', kapasitas: 3, jadwal: 'Sen & Rab 18:00', privat: true };

// A seeded env plus one active class package and PT-A / PT-B / PT-C all holding it (sessions left).
function classEnv(kapasitas) {
  const env = seededEnv();
  const admin = env.adminToken();
  const pkg = env.call('savePackage', admin, Object.assign({}, CLASS_PKG, { kapasitas: kapasitas || 3 }));
  const rows = env.sheet('MemberData').rows;
  ['PT-A', 'PT-B', 'PT-C'].forEach(id => { const r = rows.find(x => x[0] === id); r[6] = pkg.id; r[7] = pkg.namaPaket; r[8] = 8; r[9] = 0; });
  return { env, admin, pkg };
}

test('class columns are appended to PriceList, old packages stay plain packages', () => {
  const env = seededEnv();
  env.call('savePackage', env.adminToken(), CLASS_PKG);
  const pub = env.call('getPriceList');
  assert.equal(pub.find(p => p.id === 'P1').tipe, undefined);
  const cls = pub.find(p => p.namaPaket === 'Group HIIT');
  assert.equal(cls.tipe, 'kelas');
  assert.equal(cls.kapasitas, 3);
  assert.equal(cls.privat, true);
  assert.equal(cls.terisi, 0);
});

test('a class needs a capacity of at least 2', () => {
  const env = seededEnv();
  assert.throws(() => env.call('savePackage', env.adminToken(), Object.assign({}, CLASS_PKG, { kapasitas: 1 })), /Kapasitas/);
  assert.throws(() => env.call('savePackage', env.adminToken(), Object.assign({}, CLASS_PKG, { kapasitas: '' })), /Kapasitas/);
});

test('joining a full class is refused; a client who already holds a seat can renew', () => {
  const { env, pkg } = classEnv(2);
  // PT-A and PT-B hold the 2 seats; PT-C is moved off the class so a newcomer is turned away.
  env.sheet('MemberData').rows.find(r => r[0] === 'PT-C')[6] = '';
  assert.throws(() => env.call('registerNewClient', { name: 'Dewi', phone: '081300000001', goal: 'x', packageId: pkg.id }), /Kelas sudah penuh/);
  const renew = env.call('registerNewClient', { name: 'Ani', phone: '6281111111111', goal: 'x', packageId: pkg.id });
  assert.equal(renew.status, 'exists');   // public sign-up never touches existing clients
});

test('private group: create, join by code, leave, full', () => {
  const { env } = classEnv(2);
  const a = env.memberToken(KEY_A), b = env.memberToken(KEY_B);
  const g = env.call('createClassGroup', a);
  assert.match(g.code, /^[A-Z2-9]{6}$/);
  assert.equal(g.isOwner, true);
  assert.throws(() => env.call('createClassGroup', a), /sudah punya grup|Tunggu/);
  const joined = env.call('joinClassGroup', b, g.code.toLowerCase());
  assert.deepEqual(joined.members, ['Ani', 'Budi']);
  assert.equal(joined.isOwner, false);
  assert.ok(!JSON.stringify(joined).includes('0812'));   // no phone numbers
  // group (capacity 2) is full for a third member
  env.sheet('MemberData').rows.find(r => r[0] === 'PT-C').push(...Array(10).fill(''));
  assert.equal(env.call('getMyClassGroup', b).members.length, 2);
  assert.throws(() => env.call('joinClassGroup', a, 'ZZZZZZ'), /tidak ditemukan/);
  env.call('leaveClassGroup', b);
  assert.equal(env.call('getMyClassGroup', b), null);
  assert.equal(env.call('getMyClassGroup', a).members.length, 1);
});

test('joining a group requires the class package', () => {
  const { env } = classEnv(3);
  const g = env.call('createClassGroup', env.memberToken(KEY_A));
  env.sheet('MemberData').rows.find(r => r[0] === 'PT-B')[6] = 'P1';
  assert.throws(() => env.call('joinClassGroup', env.memberToken(KEY_B), g.code), /Ambil paket/);
});

test('a group cannot be created from a regular package or a non-private class', () => {
  const env = seededEnv();
  assert.throws(() => env.call('createClassGroup', env.memberToken(KEY_A)), /paket kelas/);
  const { env: e2, admin, pkg } = classEnv(3);
  e2.call('savePackage', admin, Object.assign({}, CLASS_PKG, { id: pkg.id, privat: false }));
  assert.throws(() => e2.call('createClassGroup', e2.memberToken(KEY_A)), /tidak menyediakan grup privat/);
});

test('class sessions at the same time share one coach seat, up to capacity', () => {
  const { env } = classEnv(2);
  const a = env.memberToken(KEY_A), b = env.memberToken(KEY_B);
  const { start, end } = wibSlot(5);
  env.call('clientBookSchedule', a, { start, end });
  env.call('clientBookSchedule', b, { start, end });
  const rows = env.sheet('Schedules').rows.filter(r => r[12] && r[0] !== 'ID');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r[12] === rows[0][12]));
});

test('a full class session is refused and members cannot book twice', () => {
  const { env } = classEnv(2);
  const a = env.memberToken(KEY_A), b = env.memberToken(KEY_B);
  const { start, end } = wibSlot(5);
  const first = env.call('clientBookSchedule', a, { start, end });
  const again = env.call('clientBookSchedule', a, { start, end });   // the same request again (retry, double tap)
  assert.equal(again.duplicate, true);
  assert.equal(again.id, first.id);
  const longer = new Date(new Date(end).getTime() + 30 * 60000).toISOString();
  assert.throws(() => env.call('clientBookSchedule', a, { start, end: longer }), /sudah terdaftar/);
  env.call('clientBookSchedule', b, { start, end });
  // a third member (PT-C has no link key: give one)
  const cRow = env.sheet('MemberData').rows.find(r => r[0] === 'PT-C');
  cRow[13] = 'c'.repeat(32);
  assert.throws(() => env.call('clientBookSchedule', env.memberToken('c'.repeat(32)), { start, end }), /sudah penuh/);
});

test('class members cannot book recurring or reschedule class sessions alone', () => {
  const { env } = classEnv(2);
  const a = env.memberToken(KEY_A);
  assert.throws(() => env.call('clientBookRecurring', a, { startDate: '2030-01-01', time: '10:00', duration: 60 }, { weekdays: [1], occurrences: 2 }), /satu per satu/);
  const res = env.call('clientBookSchedule', a, wibSlot(6));
  assert.throws(() => env.call('clientRescheduleSchedule', a, res.id, wibSlot(7).start, wibSlot(7).end), /Sesi kelas tidak bisa dipindah/);
});

test('group sessions use the group as Kelas ID, separate from the open class', () => {
  const { env, pkg } = classEnv(3);
  const a = env.memberToken(KEY_A), b = env.memberToken(KEY_B);
  const g = env.call('createClassGroup', a);
  const { start, end } = wibSlot(5);
  env.call('clientBookSchedule', a, { start, end });
  env.call('clientBookSchedule', b, wibSlot(6));   // B is not in the group: open class id
  const ids = env.sheet('Schedules').rows.filter(r => r[12] && r[0] !== 'ID').map(r => r[12]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.equal(ids[1], pkg.id);
  assert.match(ids[0], /^GRP-/);
  assert.equal(env.call('getClassGroups', env.adminToken())[0].code, g.code);
});

test('regular package members book exactly as before', () => {
  const env = seededEnv();
  const res = env.call('clientBookSchedule', env.memberToken(KEY_A), wibSlot(5));
  assert.equal(env.sheet('Schedules').rows.find(r => r[0] === res.id)[12] || '', '');
});

test('soft booking: a full class session is "full" with free-hour alternatives; without soft it still throws', () => {
  const { env } = classEnv(2);
  const a = env.memberToken(KEY_A), b = env.memberToken(KEY_B);
  const { start, end } = wibSlot(5);
  env.call('clientBookSchedule', a, { start, end });
  env.call('clientBookSchedule', b, { start, end });
  env.sheet('MemberData').rows.find(r => r[0] === 'PT-C')[13] = 'c'.repeat(32);
  const c = env.memberToken('c'.repeat(32));
  const rows = env.sheet('Schedules').rows.length;
  const res = env.call('clientBookSchedule', c, { start, end }, { soft: true });
  assert.equal(res.status, 'conflict');
  assert.equal(res.code, 'full');
  assert.ok(res.alternatives.length >= 1 && res.alternatives.length <= 3);
  for (const x of res.alternatives) {
    assert.notEqual(x.start, start);
    const day = res.openSlots.find(d => d.date === x.date);
    assert.ok(day.hours.find(h => h.hour === x.hour).free > 0, 'a free hour');
  }
  assert.ok(!JSON.stringify(res).includes('Budi') && !JSON.stringify(res).includes('PT-A'), 'no other member');
  assert.equal(env.sheet('Schedules').rows.length, rows);
  assert.throws(() => env.call('clientBookSchedule', c, { start, end }), /Sesi kelas ini sudah penuh\. Pilih jam lain\./);
});

test('soft booking: another length than the class session is "duration", offering exactly that session', () => {
  const { env } = classEnv(3);
  const a = env.memberToken(KEY_A), b = env.memberToken(KEY_B);
  const { start, end } = wibSlot(5);
  env.call('clientBookSchedule', a, { start, end });
  const longer = new Date(new Date(end).getTime() + 30 * 60000).toISOString();
  const res = env.call('clientBookSchedule', b, { start, end: longer }, { soft: true });
  assert.equal(res.status, 'conflict');
  assert.equal(res.code, 'duration');
  assert.deepEqual(res.alternatives, [{ start, end, date: new Date(start).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }), hour: 10, group: 'day' }]);
  assert.throws(() => env.call('clientBookSchedule', b, { start, end: longer }), /Durasi harus sama dengan sesi kelas yang sudah ada\./);
  const ok = env.call('clientBookSchedule', b, { start: res.alternatives[0].start, end: res.alternatives[0].end }, { soft: true });
  assert.equal(ok.status, 'success');
  assert.equal(ok.schedule.classId, env.sheet('Schedules').rows.find(r => r[0] === ok.id)[12]);
});
