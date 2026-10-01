'use strict';
// Client-ready reminders (Phase C): every reminder is one Telegram message to the owner whose
// buttons open WhatsApp to a client with a message written for that client.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, SCHEDULE_HEADERS, MEMBERDATA_HEADERS } = require('./fixtures');

// 2026-09-30 19:00 WIB (a Wednesday). "Tomorrow" is Thursday 1 Oct 2026.
const NOW_ISO = '2026-09-30T12:00:00Z';
const { runInContext } = require('node:vm');
const ctx = env => ({ now: runInContext("new Date('" + NOW_ISO + "')", env.context) });   // a Date from the server's own realm
const TASK_HEADERS = ['Task ID', 'Member ID', 'Judul', 'Deskripsi', 'Kategori', 'Tenggat', 'Status', 'Pengulangan', 'Dibuat Oleh', 'Dibuat Pada', 'Selesai Pada', 'Catatan Klien', 'Grup Ulang ID'];

const sched = (id, member, name, phone, startIso, status, coach) =>
  [id, member, name, phone, startIso, new Date(new Date(startIso).getTime() + 3600000).toISOString(), '', status || 'read', coach ? 'C-1' : '', coach || '', '', ''];

function withSchedules(rows) {
  const env = seededEnv();
  env.ss.seed('Schedules', [SCHEDULE_HEADERS].concat(rows));
  return env;
}
const messages = env => env.fetches.map(f => JSON.parse(f.options.payload));
const buttons = env => messages(env).flatMap(m => (m.reply_markup ? m.reply_markup.inline_keyboard.map(r => r[0]) : []));
const waText = b => decodeURIComponent(new URL(b.url).searchParams.get('text'));

// ── building blocks ──────────────────────────────────────────────────────────

test('button labels are "Nama · fakta", at most 30 characters, and keep the fact when the name is long', () => {
  const env = seededEnv();
  const label = (n, f) => env.call('_rmdButtonLabel_', n, f);
  assert.equal(label('Ani', '3 slot'), 'Ani · 3 slot');
  assert.equal(label('Ani', ''), 'Ani');
  const long = label('Maria Magdalena Christina Wijayakusuma', '07:00');
  assert.ok(long.length <= 30 && long.endsWith(' · 07:00') && long.includes('…'), long);
  assert.ok(label('X'.repeat(50), '').length <= 30);
  assert.ok(label('Ani', 'fakta yang terlalu panjang sekali untuk muat').length <= 30);
});

test('templates fill placeholders, tidy leftover spaces, and cap the length', () => {
  const env = seededEnv();
  const fill = (t, v) => env.call('_rmdFill_', t, v);
  assert.equal(fill('Hai {nama}, jam {jam} {coach}.', { nama: 'Budi', jam: '07:00', coach: '' }), 'Hai Budi, jam 07:00.');
  assert.equal(fill('Hai {nama}!', { nama: 'Budi' }), 'Hai Budi!');
  assert.equal(fill('a\n\n\n\nb', {}), 'a\n\nb');
  assert.equal(fill('{tak_dikenal} {nama}', { nama: 'X' }), '{tak_dikenal} X');
  assert.ok(fill('x'.repeat(2000), {}).length <= 900);
});

test('template validation rejects unknown placeholders, other types\' placeholders, stray braces, and long text', () => {
  const env = seededEnv();
  const v = (j, t) => env.call('_rmdValidateTpl_', j, t);
  assert.equal(v('pr', ' Hai {nama}: {pr} '), 'Hai {nama}: {pr}');
  assert.throws(() => v('pr', 'Hai {foo}'), /Placeholder \{foo\} tidak dikenal/);
  assert.throws(() => v('pr', 'Slot: {slot}'), /Placeholder \{slot\} tidak dikenal.*\{nama\}, \{pr\}/);
  assert.throws(() => v('pr', 'Hai {}'), /tidak dikenal/);
  assert.throws(() => v('pr', 'Hai {nama'), /Tanda \{ \}/);
  assert.throws(() => v('pr', 'x'.repeat(601)), /maksimal 600/);
  assert.throws(() => v('tidur', 'x'), /tidak punya template/);
});

test('the default client texts speak to the client: name first, key fact present, under 500 characters', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const facts = { 'sesi-besok': '07:00', 'booking-minggu': 'Rabu 1/10 07:00', 'pr': 'Latihan mobilitas', 'makan-pagi': 'Sarapan telur', 'makan-sore': 'Sarapan telur' };
  Object.keys(facts).forEach(j => {
    const text = env.call('previewReminderText', token, j, '').text;
    assert.match(text, /^(Hai|Halo) Budi/, j);
    assert.ok(text.includes(facts[j]) || j.startsWith('makan'), j + ' should contain ' + facts[j]);
    assert.ok(text.length < 500, j);
  });
});

// ── sesi besok ───────────────────────────────────────────────────────────────

test('sesi-besok: one button per client with a session tomorrow, addressed to the client, in time order', () => {
  const env = withSchedules([
    sched('S1', 'PT-A', 'Ani Anggraini', '6281111111111', '2026-09-30T23:00:00Z', 'read', 'Rizky'),   // 06:00 WIB Thu
    sched('S2', 'PT-B', 'Budi', '081222222222', '2026-10-01T00:00:00Z', 'read'),                       // 07:00
    sched('S3', 'PT-B', 'Budi', '081222222222', '2026-10-01T10:00:00Z', 'read'),                       // 17:00
    sched('S4', 'PT-C', 'Citra', '6283333333333', '2026-10-01T02:00:00Z', 'completed'),                // excluded
    sched('S5', 'PT-C', 'Citra', '6283333333333', '2026-10-02T02:00:00Z', 'read'),                     // day after
  ]);
  assert.equal(env.callRaw('sendSesiBesokDigest_', ctx(env)), true);
  const msgs = messages(env);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /^🔔 <b>Sesi besok<\/b> · Kamis 1 Okt · 2 klien\n/);
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Ani Anggraini · 06:00', 'Budi · 07:00']);
  assert.ok(bs[0].url.startsWith('https://wa.me/6281111111111?text='));
  assert.ok(bs[1].url.startsWith('https://wa.me/6281222222222?text='));   // 08… normalised to 628…
  assert.equal(waText(bs[0]), 'Hai Ani Anggraini, pengingat sesi besok jam 06:00 dengan Coach Rizky.\n\nSampai ketemu! 💪');
  assert.equal(waText(bs[1]), 'Hai Budi, pengingat sesi besok jam 07:00 dan 17:00.\n\nSampai ketemu! 💪');   // no coach → no stray " ."
});

test('sesi-besok: the old "Belum Ditugaskan" placeholder reads as no coach (T-200)', () => {
  const env = withSchedules([
    sched('S1', 'PT-B', 'Budi', '081222222222', '2026-10-01T00:00:00Z', 'read', 'Belum Ditugaskan'),
  ]);
  assert.equal(env.callRaw('sendSesiBesokDigest_', ctx(env)), true);
  assert.equal(waText(buttons(env)[0]), 'Hai Budi, pengingat sesi besok jam 07:00.\n\nSampai ketemu! 💪');
});

test('sesi-besok: the sleep sentence goes inside the client message', () => {
  const env = withSchedules([sched('S1', 'PT-A', 'Ani Anggraini', '6281111111111', '2026-09-30T23:00:00Z', 'read', 'Rizky')]);
  env.props.RMD_TPL_SLEEP = 'Tidur sebelum jam 10 ya.';
  env.callRaw('sendSesiBesokDigest_', ctx(env));
  assert.equal(waText(buttons(env)[0]), 'Hai Ani Anggraini, pengingat sesi besok jam 06:00 dengan Coach Rizky.\n\n😴 Tidur sebelum jam 10 ya.\n\nSampai ketemu! 💪');
});

test('sesi-besok: opted-out clients get no button, clients without a valid number are listed, nobody = no message', () => {
  const env = withSchedules([
    sched('S1', 'PT-A', 'Ani Anggraini', '6281111111111', '2026-09-30T23:00:00Z'),
    sched('S2', 'PT-B', 'Budi', '081222222222', '2026-10-01T00:00:00Z'),
  ]);
  env.memberRow('PT-A')[15] = 'sesi-besok';
  env.memberRow('PT-B')[2] = 'nomor salah';
  assert.equal(env.callRaw('sendSesiBesokDigest_', ctx(env)), true);
  assert.equal(env.fetches.length, 0);                      // nobody reachable: nothing sent

  const env2 = withSchedules([
    sched('S1', 'PT-A', 'Ani Anggraini', '6281111111111', '2026-09-30T23:00:00Z'),
    sched('S2', 'PT-B', 'Budi', '081222222222', '2026-10-01T00:00:00Z'),
  ]);
  env2.memberRow('PT-B')[2] = 'nomor salah';
  env2.callRaw('sendSesiBesokDigest_', ctx(env2));
  assert.match(messages(env2)[0].text, /\n📵 Tanpa nomor: Budi$/);
  assert.equal(buttons(env2).length, 1);
});

test('sesi-besok: no sessions tomorrow = no message and the job counts as done', () => {
  const env = withSchedules([]);
  assert.equal(env.callRaw('sendSesiBesokDigest_', ctx(env)), true);
  assert.equal(env.fetches.length, 0);
});

test('sesi-besok is a registered job (default 19:00, on) and can be tested from Pengaturan', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const job = env.call('getAppSettings', token).reminder.jobs['sesi-besok'];
  assert.equal(job.defaultHour, 19);
  assert.equal(job.enabled, true);
  assert.deepEqual(job.placeholders, ['nama', 'jam', 'coach', 'tidur']);
  const res = env.call('sendReminderTest', token, 'sesi-besok');
  assert.equal(res.jenis, 'sesi-besok');
  assert.ok(env.fetches.some(f => JSON.parse(f.options.payload).text.includes('TES pengingat')));
});

test('the tick sends sesi-besok at its hour and logs it once', () => {
  const env = withSchedules([sched('S1', 'PT-A', 'Ani Anggraini', '6281111111111', '2026-09-30T23:00:00Z', 'read', 'Rizky')]);
  env.props.RMD_ENABLED = 'true';
  // the tick uses the real clock, so drive the handler and the log directly
  assert.equal(env.callRaw('sendSesiBesokDigest_', ctx(env)), true);
  env.call('_logReminder_', 'sesi-besok', '2026-09-30T19', '*', 'ok');
  assert.equal(env.call('_alreadySent_', 'sesi-besok', '2026-09-30T19', '*'), true);
});

// ── booking minggu ───────────────────────────────────────────────────────────

test('booking-minggu: buttons say "Nama · sisa N", texts are addressed to the client, opt-outs skipped', () => {
  const env = withSchedules([]);
  env.memberRow('PT-C')[15] = 'booking-minggu';
  env.callRaw('sendBookingMingguDigest_', ctx(env));
  const msgs = messages(env);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /^🔔 <b>Booking minggu<\/b> · Rabu 30 Sep · 2 klien\n/);
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Ani Anggraini · sisa 5', 'Budi · sisa 8']);
  const text = waText(bs[0]);
  assert.match(text, /^Halo Ani Anggraini, minggu ini masih ada slot latihan kosong:\n• Rabu 30\/9 19:00\n• Rabu 30\/9 20:00\n• Kamis 1\/10 06:00\nMau booking yang mana\? 💪$/);
});

// ── PR ───────────────────────────────────────────────────────────────────────

function withTasks(rows) {
  const env = seededEnv();
  env.ss.seed('Tasks', [TASK_HEADERS].concat(rows));
  return env;
}
const task = (id, member, title, due) => [id, member, title, '', 'lain', due, 'todo', 'none', 'coach', '', '', '', ''];

test('pr: one button per client with a PR due, late first, text lists the PRs for that client', () => {
  const env = withTasks([
    task('T1', 'PT-A', 'Latihan mobilitas', '28/9/2026'),
    task('T2', 'PT-A', 'Catat makan', '1/10/2026'),
    task('T3', 'PT-B', 'Tidur 8 jam', '30/9/2026'),
    task('T4', 'PT-C', 'Terlalu jauh', '20/10/2026'),
  ]);
  assert.equal(env.callRaw('sendPrDigest_', ctx(env)), true);
  assert.match(messages(env)[0].text, /^🔔 <b>PR<\/b> · Rabu 30 Sep · 2 klien\n/);
  const bs = buttons(env);
  assert.deepEqual(bs.map(b => b.text), ['Ani Anggraini · 1 telat', 'Budi · 1 PR']);
  assert.equal(waText(bs[0]), 'Halo Ani Anggraini, pengingat PR kamu:\n• Latihan mobilitas (telat, tenggat 28/9)\n• Catat makan (tenggat 1/10)\nSemangat, kamu pasti bisa! 💪');
  assert.equal(waText(bs[1]), 'Halo Budi, pengingat PR kamu:\n• Tidur 8 jam (tenggat 30/9)\nSemangat, kamu pasti bisa! 💪');
});

test('pr: a client who turned PR reminders off gets no button', () => {
  const env = withTasks([task('T1', 'PT-A', 'Latihan', '28/9/2026'), task('T2', 'PT-B', 'Tidur', '28/9/2026')]);
  env.memberRow('PT-A')[15] = 'pr, booking-minggu';
  env.callRaw('sendPrDigest_', ctx(env));
  assert.deepEqual(buttons(env).map(b => b.text), ['Budi · 1 telat']);
});

// ── makan ────────────────────────────────────────────────────────────────────

function withCore() {
  const env = seededEnv();
  env.ss.seed('PriceList', [
    ['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
    ['P1', 'Core 8', 'core', 900000, 8, '1 Bulan', '', '', true],
  ]);
  env.ss.seed('MealTips', [['Waktu', 'Tip', 'Aktif'], ['pagi', 'Sarapan telur dan oatmeal', 'ya'], ['sore', 'Makan sore ringan', 'ya']]);
  return env;
}

test('makan: core clients get a button, texts carry the tip, both opt-out columns are honoured', () => {
  const env = withCore();
  env.callRaw('sendMakanPagiDigest_', ctx(env));
  assert.match(messages(env)[0].text, /^🔔 <b>Makan pagi<\/b> · Rabu 30 Sep · 2 klien\n/);
  assert.deepEqual(buttons(env).map(b => b.text), ['Ani Anggraini', 'Budi']);
  assert.equal(waText(buttons(env)[0]), 'Halo Ani Anggraini, pengingat makan pagi:\nSarapan telur dan oatmeal\nSemangat! 💪');

  const env2 = withCore();
  env2.memberRow('PT-A')[15] = 'makan-pagi';   // T-123 column P
  env2.memberRow('PT-B')[14] = 'tidak';         // T-73 column O
  assert.equal(env2.callRaw('sendMakanPagiDigest_', ctx(env2)), true);
  assert.equal(env2.fetches.length, 0);
  env2.callRaw('sendMakanSoreDigest_', ctx(env2));   // P only mutes pagi
  assert.deepEqual(buttons(env2).map(b => b.text), ['Ani Anggraini']);
});

// ── owner-facing layout ──────────────────────────────────────────────────────

test('20 clients: 3 Telegram messages (8 + 8 + 4), short labels, wa.me links with each client\'s number and text', () => {
  const env = seededEnv();
  const rows = [MEMBERDATA_HEADERS];
  const tasks = [];
  for (let i = 1; i <= 20; i++) {
    const id = 'PT-' + String(i).padStart(2, '0');
    rows.push([id, 'Klien Nomor ' + i, '62812000000' + String(i).padStart(2, '0'), '', '1/1/2026', '', 'P1', 'Regular 8', 10, 0, '', '', '1/1/2026', 'k'.repeat(31) + i % 10]);
    tasks.push(task('T' + i, id, 'Latihan ' + i, '28/9/2026'));
  }
  env.ss.seed('MemberData', rows);
  env.ss.seed('Tasks', [TASK_HEADERS].concat(tasks));
  assert.equal(env.callRaw('sendPrDigest_', ctx(env)), true);
  const msgs = messages(env);
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs.map(m => m.reply_markup.inline_keyboard.length), [8, 8, 4]);
  assert.match(msgs[0].text, /· 20 klien\n/);
  assert.match(msgs[1].text, /Lanjutan \(2\/3\)/);
  const bs = buttons(env);
  assert.equal(bs.length, 20);
  assert.ok(bs.every(b => b.text.length <= 30));
  const seen = new Set();
  bs.forEach(b => {
    const m = /^https:\/\/wa\.me\/62812000000(\d\d)\?text=/.exec(b.url);
    assert.ok(m, b.url);
    const n = parseInt(m[1], 10);
    seen.add(n);
    assert.ok(waText(b).startsWith('Halo Klien Nomor ' + n + ','), 'button for ' + n);   // the text belongs to the same client as the number
    assert.ok(b.text.startsWith('Klien Nomor ' + n));
  });
  assert.equal(seen.size, 20);
});

// ── per-client switches ──────────────────────────────────────────────────────

test('setMemberReminderPrefs stores the switched-off types in column P and the profile reports them', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const res = env.call('setMemberReminderPrefs', token, 'PT-A', { off: ['pr', 'sesi-besok', 'pr'] });
  assert.deepEqual(res, { id: 'PT-A', reminderOff: ['pr', 'sesi-besok'] });
  assert.equal(env.sheet('MemberData').rows[0][15], 'Pengingat Nonaktif');
  assert.equal(env.memberRow('PT-A')[15], 'pr,sesi-besok');
  assert.deepEqual(env.call('getMembers', token).find(m => m.id === 'PT-A').reminderOff, ['pr', 'sesi-besok']);
  env.call('setMemberReminderPrefs', token, 'PT-A', { off: [] });
  assert.equal(env.memberRow('PT-A')[15], '');
});

test('setMemberReminderPrefs rejects unknown types, unknown clients, and a column P used for something else', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.throws(() => env.call('setMemberReminderPrefs', token, 'PT-A', { off: ['spam'] }), /tidak dikenal/);
  assert.throws(() => env.call('setMemberReminderPrefs', token, 'PT-A', 'pr'), /tidak valid/);
  assert.throws(() => env.call('setMemberReminderPrefs', token, 'NOPE', { off: ['pr'] }), /tidak ditemukan/);
  env.sheet('MemberData').rows[0][15] = 'Catatan Saya';
  assert.throws(() => env.call('setMemberReminderPrefs', token, 'PT-A', { off: ['pr'] }), /Kolom P/);
});

// ── templates in Pengaturan ──────────────────────────────────────────────────

test('a saved template is used for the client text, and the default is stored as "no override"', () => {
  const env = withTasks([task('T1', 'PT-A', 'Latihan', '28/9/2026')]);
  const token = env.adminToken();
  const save = tpl => env.call('updateAppSettings', token, { reminder: { jobs: { pr: { tpl } } } });
  const s = save('{nama}, PR-mu: {pr} 🙏');
  assert.equal(env.props.RMD_TPL_PR, '{nama}, PR-mu: {pr} 🙏');
  assert.equal(s.reminder.jobs.pr.tpl, '{nama}, PR-mu: {pr} 🙏');
  assert.ok(s.reminder.jobs.pr.tplDefault.startsWith('Halo {nama}'));
  env.callRaw('sendPrDigest_', ctx(env));
  assert.equal(waText(buttons(env)[0]), 'Ani Anggraini, PR-mu: • Latihan (telat, tenggat 28/9) 🙏');
  save(s.reminder.jobs.pr.tplDefault);
  assert.equal(env.props.RMD_TPL_PR, undefined);
  save('{nama} lagi');
  save('');
  assert.equal(env.props.RMD_TPL_PR, undefined);
});

test('an invalid template is rejected and nothing else in that save is written', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.throws(() => env.call('updateAppSettings', token, { notifEmail: 'x@y.com', reminder: { jobs: { pr: { tpl: 'Hai {foo}' } } } }), /Placeholder \{foo\}/);
  assert.equal(env.props.NOTIF_EMAIL, undefined);
  assert.equal(env.props.RMD_TPL_PR, undefined);
});

test('previewReminderText shows the message with sample data, falls back to the default, and rejects bad templates', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.equal(env.call('previewReminderText', token, 'sesi-besok', '').text,
    'Hai Budi, pengingat sesi besok jam 07:00 dengan Coach Dika.\n\n😴 Tidur cukup malam ini ya.\n\nSampai ketemu! 💪');
  assert.equal(env.call('previewReminderText', token, 'makan-pagi', 'Pagi {nama}: {tip}').text, 'Pagi Budi: Sarapan telur dan oatmeal, minum air putih dulu.');
  assert.throws(() => env.call('previewReminderText', token, 'pr', '{slot}'), /tidak dikenal/);
  assert.throws(() => env.call('previewReminderText', token, 'tidur', 'x'), /tidak punya template/);
  env.props.RMD_TPL_SLEEP = 'Tidur jam 9 ya.';
  assert.ok(env.call('previewReminderText', token, 'sesi-besok', '').text.includes('😴 Tidur jam 9 ya.'));
});

// ── owner's daily email ──────────────────────────────────────────────────────

function withTomorrowSession() {
  const env = seededEnv();
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12, 0, 0);
  env.ss.seed('Schedules', [SCHEDULE_HEADERS, sched('S1', 'PT-A', 'Ani Anggraini', '6281111111111', t.toISOString(), 'read', 'Rizky')]);
  env.props.RMD_TPL_SLEEP = 'Tidur sebelum jam 10 ya.';
  return env;
}

test('daily owner email keeps its WhatsApp links and sleep line while sesi-besok is off (today\'s behaviour)', () => {
  const env = withTomorrowSession();
  env.call('sendDailyReminderEmail');
  assert.equal(env.mails.length, 1);
  assert.ok(env.mails[0].htmlBody.includes('wa.me'));
  assert.ok(messages(env).some(m => m.text.includes('Kirim WA Konfirmasi')));
});

test('daily owner email drops the client WhatsApp links once sesi-besok sends them from Telegram', () => {
  const env = withTomorrowSession();
  env.props.RMD_ENABLED = 'true';
  env.call('sendDailyReminderEmail');
  assert.equal(env.mails.length, 1);
  assert.ok(!env.mails[0].htmlBody.includes('wa.me'));
  assert.ok(!env.mails[0].htmlBody.includes('Kirim WA Konfirmasi'));
  assert.ok(env.mails[0].htmlBody.includes('Ani Anggraini'));
  assert.ok(!messages(env).some(m => m.text.includes('wa.me') || m.text.includes('Kirim WA Konfirmasi')));
  assert.ok(!env.mails[0].htmlBody.includes('Tidur sebelum jam 10'));     // the sleep line moved into the client message
});

test('turning sesi-besok off brings the links back even with reminders on', () => {
  const env = withTomorrowSession();
  env.props.RMD_ENABLED = 'true';
  env.props.RMD_SESI_BESOK_ENABLED = 'false';
  env.call('sendDailyReminderEmail');
  assert.ok(env.mails[0].htmlBody.includes('wa.me'));
});

// ── Phase E3: ulang-tahun and ringkasan-owner ────────────────────────────────

function telegramOn(env) {
  env.props.TELEGRAM_BOT_TOKEN = '123:abc';
  env.props.TELEGRAM_CHAT_IDS = '1';
}

test('ulang-tahun: only clients whose birthday is today get a button, addressed to the client; opt-out respected', () => {
  const env = seededEnv();
  telegramOn(env);
  const md = env.sheet('MemberData').rows;
  while (md[1].length < 21) md[1].push('');
  md[1][20] = '1990-09-30';   // Ani: today in WIB (2026-09-30)
  assert.equal(env.callRaw('sendUlangTahunDigest_', ctx(env)), true);
  const bs = buttons(env);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].text, 'Ani Anggraini · ulang tahun');
  assert.match(waText(bs[0]), /^Selamat ulang tahun Ani Anggraini!/);
  const other = seededEnv();
  telegramOn(other);
  const m2 = other.sheet('MemberData').rows;
  while (m2[1].length < 21) m2[1].push('');
  m2[1][20] = '1990-05-01';
  assert.equal(other.callRaw('sendUlangTahunDigest_', ctx(other)), true);
  assert.equal(buttons(other).length, 0);
});

test('the new types are off by default and listed with templates', () => {
  const env = seededEnv();
  const r = env.call('getAppSettings', env.adminToken()).reminder;
  assert.equal(r.jobs['ulang-tahun'].enabled, false);
  assert.equal(r.jobs['ringkasan-owner'].enabled, false);
  assert.match(env.call('previewReminderText', env.adminToken(), 'ulang-tahun', '').text, /^Selamat ulang tahun Budi/);
  assert.match(env.call('previewReminderText', env.adminToken(), 'ringkasan-owner', '').text, /^📊 Ringkasan September/);
});

test('ringkasan-owner: sends one owner message about last month, skips when nothing happened, retries when Telegram is off', () => {
  const env = seededEnv();
  assert.equal(env.callRaw('sendRingkasanOwner_', { now: runInContext("new Date('2026-10-01T02:30:00Z')", env.context) }), true);   // nothing last month → quiet
  assert.equal(env.fetches.length, 0);
  env.sheet('Schedules').rows.push(['S-SUM', 'PT-A', 'Ani', '1', '2026-09-10T01:00:00Z', '2026-09-10T02:00:00Z', '', 'completed', 'C-1', 'Rizky', '2026-09-10T02:00:00Z', '']);
  env.props.TELEGRAM_ENABLED = 'false';
  assert.equal(env.callRaw('sendRingkasanOwner_', { now: runInContext("new Date('2026-10-01T02:30:00Z')", env.context) }), false);   // Telegram off → retried next tick
  env.props.TELEGRAM_ENABLED = 'true';
  telegramOn(env);
  assert.equal(env.callRaw('sendRingkasanOwner_', { now: runInContext("new Date('2026-10-01T02:30:00Z')", env.context) }), true);
  const msgs = messages(env);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /Ringkasan September 2026/);
  assert.match(msgs[0].text, /Sesi selesai: 1 \(1 jam\)/);
  assert.ok(!msgs[0].reply_markup);
});

test('tes-ulang: only clients whose last fitness test is 28+ days old get a button; never-tested and opted-out clients do not', () => {
  const env = seededEnv();
  telegramOn(env);
  env.ss.seed('FitnessTests', [['ID', 'Member ID', 'Tanggal', 'Tes', 'Nilai', 'Dicatat Oleh', 'Diubah Pada'], ['F1', 'PT-A', '2026-08-20', 'pushup', 20, 'coach', '']]);
  assert.equal(env.callRaw('sendTesUlangDigest_', ctx(env)), true);
  const bs = buttons(env);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].text, 'Ani Anggraini · tes ulang');
  assert.match(waText(bs[0]), /^Hai Ani Anggraini, sudah sebulan sejak tes kebugaranmu \(20 Agu\)/);
  const fresh = seededEnv();
  telegramOn(fresh);
  fresh.ss.seed('FitnessTests', [['ID', 'Member ID', 'Tanggal', 'Tes', 'Nilai', 'Dicatat Oleh', 'Diubah Pada'], ['F1', 'PT-A', '2026-09-20', 'pushup', 20, 'coach', '']]);
  assert.equal(fresh.callRaw('sendTesUlangDigest_', ctx(fresh)), true);
  assert.equal(buttons(fresh).length, 0);
});
