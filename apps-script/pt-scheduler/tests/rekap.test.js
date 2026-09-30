'use strict';
// Phase D4: monthly recap, milestone congrats and "time to measure" reminders.
const test = require('node:test');
const assert = require('node:assert/strict');
const { runInContext } = require('node:vm');
const { seededEnv, SCHEDULE_HEADERS } = require('./fixtures');

const PROGRESS_HEADERS = ['ID', 'Member ID', 'Tanggal', 'Berat (kg)', 'Pinggang (cm)', 'Dicatat Oleh', 'Diubah Pada'];
const ctxAt = (env, iso, slot) => ({ now: runInContext("new Date('" + iso + "')", env.context), slot: slot || 'x' });
const messages = env => env.fetches.map(f => JSON.parse(f.options.payload));
const buttons = env => messages(env).flatMap(m => (m.reply_markup ? m.reply_markup.inline_keyboard.map(r => r[0]) : []));
const waText = b => decodeURIComponent(new URL(b.url).searchParams.get('text'));
const done = (id, member, day) => [id, member, '', '', day + 'T05:00:00Z', day + 'T06:00:00Z', '', 'completed', '', '', '', ''];
const progress = (env, rows) => env.ss.seed('Progress', [PROGRESS_HEADERS].concat(rows.map((r, i) => ['PRG-' + i, r[0], r[1], r[2] === undefined ? '' : r[2], r[3] === undefined ? '' : r[3], 'klien', ''])));
const schedules = (env, rows) => env.ss.seed('Schedules', [SCHEDULE_HEADERS].concat(rows));

// ── pure helpers ─────────────────────────────────────────────────────────────

test('"every other week" alternates weekly, counted from Monday 5 Jan 2026, across the year boundary too', () => {
  const env = seededEnv();
  const par = d => env.call('_weekParity_', d);
  assert.equal(par('2026-01-05'), 0);
  assert.equal(par('2026-01-11'), 0);        // Sunday of the same week
  assert.equal(par('2026-01-12'), 1);
  assert.equal(par('2026-01-19'), 0);
  assert.equal(par('2025-12-29'), 1);        // the week before the start
  assert.equal(par('2025-12-22'), 0);
  assert.notEqual(par('2026-12-28'), par('2027-01-04'));   // still alternating over New Year
});

test('the previous-month range handles January, short months and leap years', () => {
  const env = seededEnv();
  const r = d => env.call('_prevMonthRange_', d);
  assert.deepEqual(r('2026-10-01'), { from: '2026-09-01', to: '2026-09-30', label: 'September' });
  assert.deepEqual(r('2026-01-01'), { from: '2025-12-01', to: '2025-12-31', label: 'Desember' });
  assert.equal(r('2026-03-01').to, '2026-02-28');
  assert.equal(r('2028-03-01').to, '2028-02-29');
});

test('signed numbers use a comma and a real minus sign', () => {
  const env = seededEnv();
  assert.equal(env.call('_rmdSigned_', -2.14), '−2,1');
  assert.equal(env.call('_rmdSigned_', 3), '+3');
  assert.equal(env.call('_rmdSigned_', 0.04), '0');
});

test('a month change is measured against the last entry before the month, or the first one inside it', () => {
  const env = seededEnv();
  const ch = (entries, key) => env.call('_monthChange_', entries, key, '2026-09-01', '2026-09-30');
  const e = (t, berat, pinggang) => ({ tanggal: t, berat: berat === undefined ? '' : berat, pinggang: pinggang === undefined ? '' : pinggang });
  assert.equal(ch([e('2026-08-28', 75), e('2026-09-10', 74), e('2026-09-28', 73.4)], 'berat'), -1.6);   // baseline: last entry before September
  assert.equal(ch([e('2026-09-05', 75), e('2026-09-28', 73)], 'berat'), -2);                           // baseline: first entry in September
  assert.equal(ch([e('2026-09-10', 74)], 'berat'), null);                                              // one point only
  assert.equal(ch([e('2026-08-10', 74)], 'berat'), null);                                              // nothing in the month
  assert.equal(ch([e('2026-09-10', 74)], 'pinggang'), null);                                           // no waist values
  assert.equal(ch([e('2026-08-28', 75), e('2026-09-28', 75)], 'berat'), 0);
});

test('only the highest new badge of each kind is mentioned', () => {
  const env = seededEnv();
  const fresh = [{ id: 'sesi-10', kind: 'sesi', need: 10 }, { id: 'sesi-25', kind: 'sesi', need: 25 }, { id: 'streak-4', kind: 'streak', need: 4 }];
  assert.deepEqual(env.call('_highestFreshBadges_', fresh).map(b => b.id).sort(), ['sesi-25', 'streak-4']);
});

test('the scheduler knows "day 1 of the month" and "every other Monday", with the usual one-hour tolerance', () => {
  const env = seededEnv();
  const due = (date, hour, day) => env.call('_dueJobs_', { date, hour, day }, env.context.REMINDER_JOBS, {}, 1).map(d => d.job.jenis);
  assert.ok(due('2026-10-01', 9, 4).includes('rekap-bulanan'));
  assert.ok(due('2026-10-01', 10, 4).includes('rekap-bulanan'));      // one hour late is still accepted
  assert.ok(!due('2026-10-01', 11, 4).includes('rekap-bulanan'));
  assert.ok(!due('2026-10-02', 9, 5).includes('rekap-bulanan'));      // not the 1st
  const even = env.call('_weekParity_', '2026-10-12') === 0 ? '2026-10-12' : '2026-10-05';
  const odd = even === '2026-10-12' ? '2026-10-05' : '2026-10-12';
  assert.ok(due(even, 8, 1).includes('waktunya-ukur'));
  assert.ok(!due(odd, 8, 1).includes('waktunya-ukur'));               // the off week
  assert.ok(!due(even, 8, 2).includes('waktunya-ukur'));              // Tuesday
  assert.ok(due('2026-10-03', 18, 6).includes('selamat-milestone'));  // daily
});

test('the three new types are registered, off by default, with editable messages and previews', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const jobs = env.call('getAppSettings', token).reminder.jobs;
  assert.deepEqual(['rekap-bulanan', 'selamat-milestone', 'waktunya-ukur'].map(j => [jobs[j].enabled, jobs[j].defaultHour]), [[false, 9], [false, 18], [false, 8]]);
  assert.deepEqual(jobs['rekap-bulanan'].placeholders, ['nama', 'bulan', 'sesi', 'berat', 'pinggang', 'streak', 'link']);
  assert.match(env.call('previewReminderText', token, 'rekap-bulanan', '').text, /^Halo Budi, rekap latihan bulan September:\n💪 8 sesi latihan\n⚖️ Berat −2,1 kg\n📏 Pinggang −3 cm\n🔥 Streak 5 minggu\n\nLihat progresmu di https:\/\/book\.xnkbooking\.my\.id\nTerus semangat!$/);
  assert.equal(env.call('previewReminderText', token, 'selamat-milestone', '').text, 'Selamat Budi! 🎉 Kamu baru meraih badge 25 sesi.\nBangga banget sama progresmu, terus semangat! 💪');
  assert.match(env.call('previewReminderText', token, 'waktunya-ukur', '').text, /^Halo Budi, waktunya catat progres!.* Terakhir kamu catat tanggal 12 Sep\.\nCatat di https:\/\/book\.xnkbooking\.my\.id \(Beranda → Progres\)\.$/);
  assert.throws(() => env.call('previewReminderText', token, 'rekap-bulanan', '{badge}'), /tidak dikenal/);   // {badge} belongs to another type
  assert.deepEqual(env.call('setMemberReminderPrefs', token, 'PT-A', { off: ['rekap-bulanan', 'waktunya-ukur'] }).reminderOff, ['rekap-bulanan', 'waktunya-ukur']);   // per-client switches accept the new types
});

// ── rekap bulanan ────────────────────────────────────────────────────────────

const OCT1 = '2026-10-01T02:00:00Z';   // 09:00 WIB, Thursday 1 Oct 2026

function recapEnv() {
  const env = seededEnv();
  schedules(env, [
    done('S1', 'PT-A', '2026-09-03'), done('S2', 'PT-A', '2026-09-10'), done('S3', 'PT-A', '2026-09-17'),
    done('S4', 'PT-A', '2026-09-24'), done('S5', 'PT-A', '2026-09-29'),      // five weeks in a row, this week included
    done('S6', 'PT-C', '2026-08-20'),                                          // August: not last month
  ]);
  progress(env, [['PT-A', '2026-08-25', 75, 86], ['PT-A', '2026-09-05', 74.5, 84], ['PT-A', '2026-09-28', 73.9, 82]]);
  return env;
}

test('rekap-bulanan: one button per client who trained or logged last month, with a personal message', () => {
  const env = recapEnv();
  assert.equal(env.callRaw('sendRekapBulananDigest_', ctxAt(env, OCT1)), true);
  const msgs = messages(env);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /^🔔 <b>Rekap bulanan<\/b> · September · 1 klien\n/);   // the header names the month being summarised
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Ani Anggraini · 5 sesi']);
  assert.equal(waText(bs[0]), 'Halo Ani Anggraini, rekap latihan bulan September:\n💪 5 sesi latihan\n⚖️ Berat −1,1 kg\n📏 Pinggang −4 cm\n🔥 Streak 5 minggu\n\nLihat progresmu di https://book.xnkbooking.my.id\nTerus semangat!');
});

test('rekap-bulanan: measurements alone qualify, missing data leaves lines out, opt-outs and no-number clients are handled', () => {
  const env = recapEnv();
  progress(env, [['PT-B', '2026-09-12', 90, undefined]]);          // Budi only logged one weight in September
  env.memberRow('PT-A')[15] = 'rekap-bulanan';                     // Ani opted out
  env.callRaw('sendRekapBulananDigest_', ctxAt(env, OCT1));
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Budi · 0 sesi']);
  assert.equal(waText(bs[0]), 'Halo Budi, rekap latihan bulan September:\n💪 0 sesi latihan\n\nLihat progresmu di https://book.xnkbooking.my.id\nTerus semangat!');

  const env2 = recapEnv();
  progress(env2, [['PT-A', '2026-09-05', 74.5], ['PT-B', '2026-09-12', 90]]);
  env2.memberRow('PT-B')[2] = 'nomor salah';
  env2.callRaw('sendRekapBulananDigest_', ctxAt(env2, OCT1));
  assert.match(messages(env2)[0].text, /\n📵 Tanpa nomor: Budi$/);
  assert.equal(buttons(env2).length, 1);
});

test('rekap-bulanan: nobody to write to = no message, and January looks back at December', () => {
  const env = seededEnv();
  schedules(env, []);
  progress(env, []);
  assert.equal(env.callRaw('sendRekapBulananDigest_', ctxAt(env, OCT1)), true);
  assert.equal(env.fetches.length, 0);
  schedules(env, [done('S1', 'PT-A', '2025-12-15')]);
  env.callRaw('sendRekapBulananDigest_', ctxAt(env, '2026-01-01T02:00:00Z'));
  assert.match(waText(buttons(env)[0]), /rekap latihan bulan Desember/);
});

// ── selamat milestone ────────────────────────────────────────────────────────

function recentSessions(member, from, count, prefix) {
  const rows = [];
  for (let i = 0; i < count; i++) rows.push(done(prefix + i, member, from));
  return rows;
}

test('selamat-milestone: a new badge is congratulated once, then remembered in column R', () => {
  const env = seededEnv();
  schedules(env, recentSessions('PT-A', '2026-09-28', 10, 'A'));
  assert.equal(env.callRaw('sendMilestoneDigest_', ctxAt(env, '2026-10-01T11:00:00Z')), true);
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Ani Anggraini · 10 sesi']);
  assert.equal(waText(bs[0]), 'Selamat Ani Anggraini! 🎉 Kamu baru meraih badge 10 sesi.\nBangga banget sama progresmu, terus semangat! 💪');
  assert.equal(env.sheet('MemberData').rows[0][17], 'Badge Diselamati');
  assert.equal(env.memberRow('PT-A')[17], 'sesi-10');
  const sent = env.fetches.length;
  assert.equal(env.callRaw('sendMilestoneDigest_', ctxAt(env, '2026-10-02T11:00:00Z')), true);
  assert.equal(env.fetches.length, sent);                          // not again
});

test('selamat-milestone: only the highest badge per kind is named, but the lower ones are marked too', () => {
  const env = seededEnv();
  schedules(env, recentSessions('PT-A', '2026-09-28', 26, 'A'));
  env.callRaw('sendMilestoneDigest_', ctxAt(env, '2026-10-01T11:00:00Z'));
  assert.equal(waText(buttons(env)[0]).includes('badge 25 sesi.'), true);
  assert.ok(!waText(buttons(env)[0]).includes('10 sesi'));
  assert.equal(env.memberRow('PT-A')[17], 'sesi-10,sesi-25');
});

test('selamat-milestone: clients who stopped training are marked silently, not congratulated late', () => {
  const env = seededEnv();
  schedules(env, recentSessions('PT-B', '2026-08-01', 25, 'B'));    // long ago
  assert.equal(env.callRaw('sendMilestoneDigest_', ctxAt(env, '2026-10-01T11:00:00Z')), true);
  assert.equal(env.fetches.length, 0);
  assert.equal(env.memberRow('PT-B')[17], 'sesi-10,sesi-25');
});

test('selamat-milestone: nothing is marked when Telegram fails or when it is only a test send', () => {
  const env = seededEnv();
  schedules(env, recentSessions('PT-A', '2026-09-28', 10, 'A'));
  delete env.props.TELEGRAM_BOT_TOKEN;                              // Telegram not ready: the send is skipped
  assert.equal(env.callRaw('sendMilestoneDigest_', ctxAt(env, '2026-10-01T11:00:00Z')), false);
  assert.equal(env.memberRow('PT-A')[17], undefined);
  env.props.TELEGRAM_BOT_TOKEN = '1:x';
  assert.equal(env.callRaw('sendMilestoneDigest_', ctxAt(env, '2026-10-01T11:00:00Z', 'tes')), true);   // test send
  assert.equal(env.fetches.length, 1);
  assert.equal(env.memberRow('PT-A')[17], undefined);               // a test does not use up the congratulation
  env.callRaw('sendMilestoneDigest_', ctxAt(env, '2026-10-01T11:00:00Z'));
  assert.equal(env.memberRow('PT-A')[17], 'sesi-10');
});

test('selamat-milestone: an opted-out client is not messaged, and a used column R is never overwritten', () => {
  const env = seededEnv();
  schedules(env, recentSessions('PT-A', '2026-09-28', 10, 'A'));
  env.memberRow('PT-A')[15] = 'selamat-milestone';
  env.callRaw('sendMilestoneDigest_', ctxAt(env, '2026-10-01T11:00:00Z'));
  assert.equal(env.fetches.length, 0);
  assert.equal(env.memberRow('PT-A')[17], 'sesi-10');            // marked so it isn't sent after switching back on

  const env2 = seededEnv();
  schedules(env2, recentSessions('PT-A', '2026-09-28', 10, 'A'));
  env2.sheet('MemberData').rows[0][17] = 'Catatan Saya';
  assert.throws(() => env2.callRaw('sendMilestoneDigest_', ctxAt(env2, '2026-10-01T11:00:00Z')), /Kolom R/);
});

// ── waktunya ukur ────────────────────────────────────────────────────────────

test('waktunya-ukur: clients whose last entry is 14+ days old (or missing) get a button; recent ones do not', () => {
  const env = seededEnv();
  progress(env, [['PT-A', '2026-09-25', 72], ['PT-B', '2026-09-10', 90]]);
  assert.equal(env.callRaw('sendUkurDigest_', ctxAt(env, '2026-10-05T01:00:00Z')), true);
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Budi · 25 hari', 'Citra · baru']);
  assert.equal(waText(bs[0]), 'Halo Budi, waktunya catat progres! Timbang berat dan ukur lingkar pinggang ya. Terakhir kamu catat tanggal 10 Sep.\nCatat di https://book.xnkbooking.my.id (Beranda → Progres).');
  assert.equal(waText(bs[1]), 'Halo Citra, waktunya catat progres! Timbang berat dan ukur lingkar pinggang ya.\nCatat di https://book.xnkbooking.my.id (Beranda → Progres).');
  assert.match(messages(env)[0].text, /^🔔 <b>Waktunya ukur<\/b> · Senin 5 Okt · 2 klien\n/);
});

test('waktunya-ukur: exactly 14 days counts, opt-outs and clients with no sessions left are skipped', () => {
  const env = seededEnv();
  progress(env, [['PT-A', '2026-09-21', 72], ['PT-B', '2026-09-22', 90]]);
  env.memberRow('PT-C')[15] = 'waktunya-ukur';
  env.memberRow('PT-A')[9] = 10;                                     // Ani used every session: not active
  env.callRaw('sendUkurDigest_', ctxAt(env, '2026-10-05T01:00:00Z'));
  assert.equal(env.fetches.length, 0);                               // Budi: 13 days (too soon); Ani: no sessions left; Citra: opted out
  const env2 = seededEnv();
  progress(env2, [['PT-A', '2026-09-21', 72], ['PT-B', '2026-09-30', 90]]);
  env2.callRaw('sendUkurDigest_', ctxAt(env2, '2026-10-05T01:00:00Z'));
  assert.deepEqual(buttons(env2).map(b => b.text), ['Ani Anggraini · 14 hari', 'Citra · baru']);
});

test('each new type can be test-sent from Pengaturan (marked as a test)', () => {
  const env = seededEnv();
  const token = env.adminToken();
  ['rekap-bulanan', 'selamat-milestone', 'waktunya-ukur'].forEach(j => {
    const res = env.call('sendReminderTest', token, j);
    assert.equal(res.jenis, j);
  });
  assert.equal(messages(env).filter(m => m.text.includes('TES pengingat')).length, 3);
});
