'use strict';
// Fase AG (T-2700+): data poster coach. docs/poster/Design.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');
const HARGA = require('../../xnk-library/tools/hub-harga');

const j = x => JSON.parse(JSON.stringify(x));
const post = (env, fn, args) => JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify({ fn, args: args || [] }) } }).content);
const today = env => env.call('_todayWib_');
const day = (env, n) => env.call('_addDaysIso_', today(env), n);
const RATING_HEADERS = ['ID', 'Schedule ID', 'Member ID', 'Tanggal', 'Bintang', 'Komentar', 'Izin Testimoni', 'Dibuat Pada'];

function setup() {
  const env = seededEnv();
  return { env, admin: env.adminToken(), ani: env.memberToken(KEY_A), budi: env.memberToken(KEY_B) };
}

test('getPosterData: coach profile, packages, free hours, results; no client phone numbers or notes', () => {
  const { env, admin } = setup();
  const d = j(env.call('getPosterData', admin, {}));
  assert.equal(d.coach.name, 'Rizky');
  assert.ok(d.packages.length >= 1 && d.packages.every(p => p.nama && p.harga >= 0));
  assert.equal(d.slots.length, 7);
  assert.ok(d.slots.every(s => Array.isArray(s.hours)));
  assert.equal(d.results.period, 'bulan');
  assert.ok(d.qrUrl.startsWith('https://'));
  const s = JSON.stringify(d);
  for (const secret of ['6281111111111', '081222222222', 'Rahasia Ani', 'Catatan Budi']) assert.ok(!s.includes(secret), secret);
  assert.deepEqual(d.stories, [], 'no client has given consent yet');
});

test('testimonials: only comments the client allowed, first name + initial', () => {
  const { env, admin } = setup();
  env.ss.seed('SessionRatings', [RATING_HEADERS,
    ['R1', 'SCH-A1', 'PT-A', day(env, -3), 5, 'Coach sabar dan jelas.', 'ya', ''],
    ['R2', 'SCH-B1', 'PT-B', day(env, -2), 4, 'Rahasia jangan dipakai', '', '']]);
  const t = j(env.call('getPosterData', admin, {})).testimonials;
  assert.equal(t.length, 1);
  assert.equal(t[0].text, 'Coach sabar dan jelas.');
  assert.equal(t[0].name, 'Ani A.');
  assert.equal(t[0].stars, 5);
});

test('results (pure): sessions, clients, rating, PRs and kg / cm down inside the range', () => {
  const { env } = setup();
  const range = { period: 'bulan', from: '2026-11-01', to: '2026-11-30' };
  const r = j(env.call('_posterResults_', {
    range, members: ['A', 'B'],
    schedules: [
      { memberId: 'A', status: 'completed', completedAt: '2026-11-05T03:00:00Z', start: '2026-11-05T03:00:00Z' },
      { memberId: 'B', status: 'completed', completedAt: '2026-11-06T03:00:00Z', start: '2026-11-06T03:00:00Z' },
      { memberId: 'B', status: 'completed', completedAt: '2026-10-06T03:00:00Z', start: '2026-10-06T03:00:00Z' },
      { memberId: 'C', status: 'completed', completedAt: '2026-11-06T03:00:00Z', start: '2026-11-06T03:00:00Z' },
      { memberId: 'A', status: 'booked', start: '2026-11-07T03:00:00Z' }],
    ratings: [{ memberId: 'A', bintang: 5, tanggal: '2026-11-05' }, { memberId: 'B', bintang: 4, tanggal: '2026-11-06' }, { memberId: 'B', bintang: 1, tanggal: '2026-10-01' }],
    workout: {},
    progress: { A: [{ tanggal: '2026-10-20', berat: 80, pinggang: 90 }, { tanggal: '2026-11-20', berat: 77.5, pinggang: 88 }], B: [{ tanggal: '2026-11-02', berat: 60, pinggang: '' }, { tanggal: '2026-11-25', berat: 61, pinggang: '' }] }
  }));
  assert.equal(r.sessions, 2);
  assert.equal(r.clients, 2);
  assert.equal(r.totalClients, 2);
  assert.equal(r.rating, 4.5);
  assert.equal(r.ratings, 2);
  assert.equal(r.kgDown, 2.5, 'only decreases count, start = last entry before the range');
  assert.equal(r.kgClients, 1);
  assert.equal(r.cmDown, 2);
});

test('ranges: this month, last month (year wrap), 90 days, all time', () => {
  const { env } = setup();
  assert.deepEqual(j(env.call('_posterRange_', 'bulan', '2026-11-28')), { period: 'bulan', from: '2026-11-01', to: '2026-11-28' });
  assert.deepEqual(j(env.call('_posterRange_', 'bulanLalu', '2026-01-10')), { period: 'bulanLalu', from: '2025-12-01', to: '2025-12-31' });
  assert.equal(j(env.call('_posterRange_', '3bulan', '2026-11-28')).from, '2026-08-31');
  assert.equal(j(env.call('_posterRange_', 'semua', '2026-11-28')).from, '');
  assert.equal(j(env.call('_posterRange_', 'x', '2026-11-28')).period, 'bulan');
});

test('client story: only after the client turns on consent in the portal; first name and numbers only', () => {
  const { env, admin, ani } = setup();
  env.call('saveMemberMeasurement', admin, 'PT-A', { tanggal: day(env, -40), berat: 72, pinggang: 82 });
  env.call('saveMemberMeasurement', admin, 'PT-A', { tanggal: day(env, -2), berat: 68.5, pinggang: 78 });
  assert.throws(() => env.call('getPosterStory', admin, 'PT-A'), /belum mengizinkan/);
  env.call('saveMyProfileCard', ani, { poster: true });
  const more = j(env.call('getPortalMore', ani));
  assert.equal(more.profile.poster, true);
  assert.deepEqual(j(env.call('getPosterData', admin, {})).stories, [{ id: 'PT-A', first: 'Ani' }]);
  const st = j(env.call('getPosterStory', admin, 'PT-A'));
  assert.equal(st.first, 'Ani');
  assert.equal(st.berat.change, -3.5);
  assert.equal(st.pinggang.change, -4);
  assert.ok(st.weeks >= 5);
  const s = JSON.stringify(st);
  assert.ok(!s.includes('Anggraini') && !s.includes('6281111111111'), 'no last name, no phone');
  // izin bisa dicabut
  Object.keys(env.cache).filter(k => /pf_/.test(k)).forEach(k => delete env.cache[k]);   // jeda simpan 2 detik
  env.call('saveMyProfileCard', ani, { poster: false });
  assert.throws(() => env.call('getPosterStory', admin, 'PT-A'), /belum mengizinkan/);
  assert.throws(() => env.call('getPosterStory', '', 'PT-A'), /admin|sesi|login/i);
});

test('coach login: own profile and own clients only; no XNK Coach poster', () => {
  const env = seededEnv();
  env.ss.seed('Coaches', [
    ['ID', 'Nama Coach', 'No WA', 'Spesialisasi', 'Foto URL', 'Bio', 'Pengalaman', 'Status Aktif', 'Headline', 'Sertifikasi', 'Prestasi', 'Lokasi', 'Instagram', 'Foto File ID', 'Bagi Hasil Tipe', 'Bagi Hasil Nilai'],
    ['C-1', 'Rizky', '6281112223334', 'Strength', '', '', '', true, '', '', '', '', '', '', 'persen', 50],
    ['C-2', 'Dewi', '6281112229999', 'Yoga', '', '', '', true, '', '', '', '', '', '', 'persen', 40]]);
  const md = env.sheet('MemberData');
  md.rows.find(r => r[0] === 'PT-A')[10] = 'C-1';
  md.rows.find(r => r[0] === 'PT-B')[10] = 'C-2';
  const owner = env.adminToken();
  env.call('setCoachPin', owner, 'C-2', '222222');
  env.call('saveMyProfileCard', env.memberToken(KEY_A), { poster: true });
  const tok = post(env, 'adminLogin', ['222222']).data.token;
  const d = post(env, 'getPosterData', [tok, { coachId: 'C-1' }]).data;
  assert.equal(d.coach.id, 'C-2', 'a coach can never make a poster for another coach');
  assert.deepEqual(d.stories, [], 'Ani belongs to C-1');
  assert.equal(d.xnkCoach, null);
  assert.deepEqual(d.coaches, []);
  assert.equal(post(env, 'getPosterStory', [tok, 'PT-A']).ok, false);
  const o = j(env.call('getPosterData', owner, { coachId: 'C-1' }));
  assert.equal(o.coach.id, 'C-1', 'the owner picks a coach');
  assert.deepEqual(o.coaches.map(c => c.id), ['C-1', 'C-2']);
  assert.deepEqual(o.stories.map(x => x.id), ['PT-A']);
});

test('owner on xnk.my.id gets the XNK Coach poster; prices equal the hub landing', () => {
  const { env, admin } = setup();
  const x = j(env.call('getPosterData', admin, {})).xnkCoach;
  assert.ok(x && x.url === 'https://xnk.web.id');
  assert.deepEqual(x.tiers.map(t => [t.key, t.name, t.bulanan, t.limit]), HARGA.TIERS.map(t => [t.key, t.name, t.bulanan, t.limit]));
});

test('POSTER_ENABLED=false turns the poster off', () => {
  const { env, admin } = setup();
  env.props.POSTER_ENABLED = 'false';
  assert.throws(() => env.call('getPosterData', admin, {}), /dimatikan/);
  assert.equal(env.call('getAppSettings', admin).posterEnabled, false);
});
