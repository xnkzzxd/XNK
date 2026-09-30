// =============================================================================
// Reminder.gs — SEMUA kode Fase 2 (Reminder) dalam satu file.
// Urutan bagian: T-41/43/42 dasar → T-40 pengaturan → T-44 tick → T-45 booking → T-46 PR.
// Hapus file terpisah (ReminderSettings/ReminderTick/ReminderBooking/ReminderPR.gs)
// dari proyek Apps Script; kalau tidak, nama fungsi akan bentrok.
// =============================================================================


// ##############################################################################
// BAGIAN: Fase 2 dasar: T-41 kirim Telegram, T-43 ReminderLog, T-42 pemilihan klien
// ##############################################################################

// =============================================================================
// Reminder.gs — Fase 2 (Reminder). T-41: kirim Telegram dengan tombol link.
// File baru; kirimNotifTelegram_ di Kode.gs TIDAK diubah.
// =============================================================================

var TELEGRAM_CHUNK_GAP_MS = 1100;      // T-78: jeda antar pesan lanjutan
var TELEGRAM_BUTTONS_PER_MESSAGE = 8;   // >8 tombol dipecah jadi beberapa pesan
var TELEGRAM_BUTTON_TEXT_MAX = 60;

/**
 * Bagi array jadi potongan berukuran `size` (fungsi murni, mudah dites).
 * [] -> [] ; 9 tombol, size 8 -> [8, 1].
 */
function _chunkButtons_(buttons, size) {
  var out = [];
  for (var i = 0; i < buttons.length; i += size) out.push(buttons.slice(i, i + size));
  return out;
}

/**
 * Tombol valid: teks tidak kosong & url http(s). Yang tidak valid dibuang
 * (Telegram menolak seluruh pesan kalau satu tombol saja tidak valid).
 */
function _cleanButtons_(buttons) {
  return (buttons || []).filter(function(b) {
    return b && String(b.text || '').trim() && /^https?:\/\//i.test(String(b.url || ''));
  }).map(function(b) {
    return { text: String(b.text).trim().slice(0, TELEGRAM_BUTTON_TEXT_MAX), url: String(b.url) };
  });
}

/**
 * Kirim pesan Telegram (HTML) ke semua TELEGRAM_CHAT_IDS dengan tombol link inline,
 * satu tombol per baris. Guard sama dengan kirimNotifTelegram_: dimatikan lewat
 * Pengaturan / bot belum diatur = dilewati diam-diam (tidak melempar error).
 * Lebih dari 8 tombol: dipecah; pesan pertama membawa `teks`, sisanya diberi
 * judul "lanjutan i/n".
 * @param {string} teks
 * @param {Array<{text:string,url:string}>} buttons
 * @returns {{sent:number, failed:number, parts:number, skipped:boolean}}
 */
function kirimTelegramTombol_(teks, buttons) {
  var props = PropertiesService.getScriptProperties();
  var result = { sent: 0, failed: 0, parts: 0, skipped: false };
  var tokenBot = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chatIds = String(props.getProperty('TELEGRAM_CHAT_IDS') || '')
    .split(',').map(function(id) { return id.trim(); }).filter(String);
  if (props.getProperty('TELEGRAM_ENABLED') === 'false' || !tokenBot || chatIds.length === 0) {
    Logger.log('Telegram tombol dilewati: dimatikan / belum diatur.');
    result.skipped = true;
    return result;
  }

  var chunks = _chunkButtons_(_cleanButtons_(buttons), TELEGRAM_BUTTONS_PER_MESSAGE);
  if (!chunks.length) chunks = [[]];               // tanpa tombol: satu pesan biasa
  result.parts = chunks.length;
  var url = 'https://api.telegram.org/bot' + tokenBot + '/sendMessage';

  chunks.forEach(function(chunk, idx) {
    if (idx > 0) Utilities.sleep(TELEGRAM_CHUNK_GAP_MS);   // T-78: Telegram membatasi ±1 pesan/detik per chat (429)
    var text = idx === 0 ? String(teks) : '↪️ <i>Lanjutan (' + (idx + 1) + '/' + chunks.length + ')</i>';
    chatIds.forEach(function(id) {
      var payload = { chat_id: id, text: text, parse_mode: 'HTML' };
      if (chunk.length) payload.reply_markup = { inline_keyboard: chunk.map(function(b) { return [b]; }) };
      try {
        var res = UrlFetchApp.fetch(url, {
          method: 'post', contentType: 'application/json',
          payload: JSON.stringify(payload), muteHttpExceptions: true
        });
        if (res.getResponseCode() === 200) result.sent++;
        else { result.failed++; Logger.log('Telegram tombol ' + res.getResponseCode() + ' ke ' + id + ': ' + res.getContentText().slice(0, 200)); }
      } catch (e) {
        result.failed++;
        Logger.log('Gagal kirim Telegram tombol ke ID ' + id + ': ' + e);
      }
    });
  });
  return result;
}


// =============================================================================
// T-43 — ReminderLog: cegah kirim ganda (idempotensi) + retensi 60 hari.
// Kunci unik = jenis | slot | target. Contoh: "booking-minggu|2026-09-27T17|*".
//   jenis  : 'booking-minggu', 'pr', 'malam', ...
//   slot   : penanda periode, mis. tanggal+jam 'YYYY-MM-DDTHH' (WIB)
//   target : ID klien, atau '*' untuk pesan ringkasan ke Coach
// Hanya baris hasil 'ok' yang dianggap terkirim; yang 'gagal' boleh dicoba lagi.
// =============================================================================

var REMINDER_LOG_HEADERS = ['Kunci', 'Jenis', 'Slot', 'Target', 'Waktu', 'Hasil'];
var REMINDER_LOG_RETENTION_DAYS = 60;

function _reminderKey_(jenis, slot, target) {
  return [jenis, slot, target == null || target === '' ? '*' : target].map(function(p) { return String(p).trim(); }).join('|');
}

/** Sheet ReminderLog; semua kolom Plain Text supaya slot "2026-09-27" tidak berubah jadi tanggal. */
function _reminderLogSheet_() {
  var sheet = getOrCreateSheet_('ReminderLog', REMINDER_LOG_HEADERS);
  sheet.getRange('A:F').setNumberFormat('@');
  return sheet;
}

/** True kalau kunci ini sudah tercatat terkirim ('ok'). */
function _alreadySent_(jenis, slot, target) {
  var sheet = _reminderLogSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var key = _reminderKey_(jenis, slot, target);
  var rows = sheet.getRange(2, 1, last - 1, 6).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === key && String(rows[i][5]) === 'ok') return true;
  }
  return false;
}

/** Catat percobaan kirim. hasil: 'ok' atau 'gagal' (default 'ok'). */
function _logReminder_(jenis, slot, target, hasil) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    _reminderLogSheet_().appendRow([
      _reminderKey_(jenis, slot, target), String(jenis), String(slot),
      target == null || target === '' ? '*' : String(target),
      new Date().toISOString(), hasil === 'gagal' ? 'gagal' : 'ok'
    ]);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fungsi murni: dari daftar waktu ISO (baris data pertama = indeks 0), kembalikan
 * rentang berurutan [{start, count}] (indeks 0-based) yang lebih tua dari cutoffMs,
 * diurutkan dari BAWAH ke atas supaya penghapusan tidak menggeser nomor baris.
 * Waktu kosong/tidak valid TIDAK dihapus (aman).
 */
function _oldRowRuns_(times, cutoffMs) {
  var runs = [], cur = null;
  for (var i = 0; i < times.length; i++) {
    var t = Date.parse(String(times[i]));
    var old = !isNaN(t) && t < cutoffMs;
    if (old) {
      if (cur) cur.count++; else { cur = { start: i, count: 1 }; runs.push(cur); }
    } else cur = null;
  }
  return runs.reverse();
}

/** Hapus catatan lebih tua dari 60 hari. Kembalikan jumlah baris terhapus. */
function _pruneReminderLog_(now) {
  var sheet = _reminderLogSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var cutoff = (now ? now.getTime() : Date.now()) - REMINDER_LOG_RETENTION_DAYS * 86400000;
  var times = sheet.getRange(2, 5, last - 1, 1).getValues().map(function(r) { return r[0]; });
  var runs = _oldRowRuns_(times, cutoff), removed = 0;
  runs.forEach(function(r) { sheet.deleteRows(r.start + 2, r.count); removed += r.count; });
  return removed;
}


// =============================================================================
// T-42 — Nomor WA & pemilihan klien untuk reminder.
//
// ASUMSI (PRD tidak ikut terunggah; ubah di sini bila A3/A4 berbeda):
//   A3 "aktif"    = nomor WA valid DAN sisa sesi > 0 (Total Sesi − Sesi Terpakai).
//   A4 "bisa booking" = aktif DAN sisa sesi − jadwal mendatang > 0.
//   Jadwal mendatang = jadwal milik klien dengan waktu mulai >= sekarang dan status
//   bukan 'completed'.
// Klien yang sisa sesinya > 0 tetapi nomornya tidak valid dilewati DAN dihitung
// (skipped), supaya Coach tahu ada klien yang tidak terjangkau.
// =============================================================================

/** Nomor WA Indonesia -> "628xxxxxxxxx" (digit saja), atau null kalau tidak valid. */
function _rmdNormalizePhone_(phone) {
  var p = String(phone == null ? '' : phone).replace(/\D/g, '');
  if (p.indexOf('620') === 0) p = '62' + p.slice(3);        // "6208…" salah ketik
  else if (p.indexOf('62') === 0) { /* sudah internasional */ }
  else if (p.charAt(0) === '0') p = '62' + p.slice(1);
  else if (p.charAt(0) === '8') p = '62' + p;
  return /^628\d{8,12}$/.test(p) ? p : null;
}

/** Link wa.me, dengan teks opsional. null kalau nomor tidak valid. */
function _waLink_(phone, text) {
  var n = _rmdNormalizePhone_(phone);
  if (!n) return null;
  return 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '');
}

/**
 * Fungsi murni (mudah dites). members = baris MemberData, schedules = hasil
 * _getSchedulesAll_(), now = Date.
 * @returns {{active:Array, bookable:Array, skipped:number}}
 */
function _buildClientPools_(members, schedules, now) {
  var upcoming = {};
  (schedules || []).forEach(function(s) {
    var start = new Date(s.start);
    if (isNaN(start.getTime()) || start < now) return;
    if (String(s.status || '').toLowerCase() === 'completed') return;
    var id = String(s.memberId).trim();
    upcoming[id] = (upcoming[id] || 0) + 1;
  });

  var active = [], bookable = [], skipped = 0;
  (members || []).forEach(function(row) {
    if (!row || !row[0]) return;
    var total = parseInt(row[8], 10); if (isNaN(total)) total = 10;   // sama dengan profil klien
    var used = parseInt(row[9], 10) || 0;
    var remaining = total - used;
    if (remaining <= 0) return;
    var phone = _rmdNormalizePhone_(row[2]);
    if (!phone) { skipped++; return; }
    var id = String(row[0]).trim();
    var c = {
      id: id, name: String(row[1] || '').trim(), phone: phone, mealOn: _mealOnFrom_(row[14]),
      remaining: remaining, upcoming: upcoming[id] || 0,
      slots: remaining - (upcoming[id] || 0),
      packageId: String(row[6] || ''), coachId: String(row[10] || '')
    };
    active.push(c);
    if (c.slots > 0) bookable.push(c);
  });
  return { active: active, bookable: bookable, skipped: skipped };
}

function _loadClientPools_() {
  var data = _getMemberDataSheet_().getDataRange().getValues().slice(1);
  return _buildClientPools_(data, _getSchedulesAll_(), new Date());
}

/** @returns {{clients:Array, skipped:number}} klien aktif (A3) */
function _selectActiveClients_() {
  var p = _loadClientPools_();
  return { clients: p.active, skipped: p.skipped };
}

/** @returns {{clients:Array, skipped:number}} klien yang masih bisa booking (A4) */
function _selectBookableClients_() {
  var p = _loadClientPools_();
  return { clients: p.bookable, skipped: p.skipped };
}


// ##############################################################################
// BAGIAN: T-40 Pengaturan reminder (RMD_*)
// ##############################################################################

// =============================================================================
// ReminderSettings.gs — T-40: pengaturan reminder (properti RMD_*).
// Bergantung: ReminderTick.gs (REMINDER_JOBS). Dipanggil dari getAppSettings /
// updateAppSettings di Kode.gs lewat 3 baris tambahan (lihat catatan T-40).
//
// Properti Script:
//   RMD_ENABLED                 'true' = master switch (default mati = perilaku lama)
//   RMD_<JENIS>_ENABLED         'false' mematikan satu jenis (default aktif bila master aktif)
//   RMD_<JENIS>_HOUR            jam WIB 0–23 (default = REMINDER_JOBS[].hour)
//   RMD_TPL_SLEEP               kalimat tidur di reminder malam (T-47); kosong = tidak ada
// <JENIS> = jenis.toUpperCase() dengan '-' → '_' (booking-minggu → BOOKING_MINGGU).
// Bentuk di form: reminder = { enabled, tplSleep, jobs: { 'pr': {enabled, hour}, ... } }
// =============================================================================

var RMD_TPL_MAX = 300;

function _rmdJobKey_(jenis) { return String(jenis).toUpperCase().replace(/-/g, '_'); }

/** Job aktif? Default true (master switch dicek terpisah di runReminderTick). */
function _rmdJobEnabled_(jenis) {
  return _rmdEnabledFrom_(PropertiesService.getScriptProperties().getProperty('RMD_' + _rmdJobKey_(jenis) + '_ENABLED'), jenis);
}

/** Nilai untuk form Pengaturan. Selalu lengkap dengan default. */
function _rmdRead_() {
  var props = PropertiesService.getScriptProperties();
  var jobs = {};
  REMINDER_JOBS.forEach(function(j) {
    var k = _rmdJobKey_(j.jenis);
    var h = parseInt(props.getProperty('RMD_' + k + '_HOUR'), 10);
    jobs[j.jenis] = {
      enabled: _rmdEnabledFrom_(props.getProperty('RMD_' + k + '_ENABLED'), j.jenis),
      hour: (!isNaN(h) && h >= 0 && h <= 23) ? h : j.hour,
      defaultHour: j.hour
    };
  });
  return {
    enabled: props.getProperty('RMD_ENABLED') === 'true',
    tplSleep: props.getProperty('RMD_TPL_SLEEP') || '',
    jobs: jobs
  };
}

/**
 * Validasi murni, TANPA menulis. Lempar error Indonesia bila salah.
 * @returns {Object<string,string>} properti → nilai string; '' = hapus properti (balik default).
 * Hanya kolom yang ada di input yang diproses (sama seperti updateAppSettings).
 */
function _rmdValidate_(r) {
  if (r == null) return {};
  if (typeof r !== 'object' || Array.isArray(r)) throw new Error('Pengaturan pengingat tidak valid.');
  var has = function(o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var out = {};

  if (has(r, 'enabled')) out['RMD_ENABLED'] = r.enabled ? 'true' : 'false';

  if (has(r, 'tplSleep')) {
    var t = String(r.tplSleep == null ? '' : r.tplSleep).trim();
    if (t.length > RMD_TPL_MAX) throw new Error('Kalimat tidur maksimal ' + RMD_TPL_MAX + ' karakter.');
    out['RMD_TPL_SLEEP'] = t;
  }

  if (has(r, 'jobs') && r.jobs != null) {
    if (typeof r.jobs !== 'object') throw new Error('Pengaturan jenis pengingat tidak valid.');
    var known = {};
    REMINDER_JOBS.forEach(function(j) { known[j.jenis] = true; });
    Object.keys(r.jobs).forEach(function(jenis) {
      if (!known[jenis]) throw new Error('Jenis pengingat tidak dikenal: ' + jenis + '.');
      var job = r.jobs[jenis] || {}, k = _rmdJobKey_(jenis);
      if (has(job, 'enabled')) out['RMD_' + k + '_ENABLED'] = job.enabled ? 'true' : 'false';
      if (has(job, 'hour')) {
        if (job.hour === '' || job.hour == null) out['RMD_' + k + '_HOUR'] = '';
        else {
          var n = Number(job.hour);
          if (!Number.isInteger(n) || n < 0 || n > 23) throw new Error('Jam pengingat harus bilangan bulat 0–23.');
          out['RMD_' + k + '_HOUR'] = String(n);
        }
      }
    });
  }
  return out;
}

/** Tulis hasil _rmdValidate_. Panggil SETELAH semua validasi lain lolos. */
function _rmdWrite_(map) {
  var props = PropertiesService.getScriptProperties();
  Object.keys(map || {}).forEach(function(k) {
    if (map[k] === '') props.deleteProperty(k); else props.setProperty(k, map[k]);
  });
}

/** Tes murni. Lempar error bila gagal. */
function testRmdValidate() {
  var bad = [];
  function eq(l, g, w) { if (JSON.stringify(g) !== JSON.stringify(w)) bad.push(l + ' → ' + JSON.stringify(g)); }
  function throws(l, fn) { try { fn(); bad.push(l + ' → tidak melempar'); } catch (e) {} }
  eq('kosong', _rmdValidate_(null), {});
  eq('master', _rmdValidate_({ enabled: true }), { RMD_ENABLED: 'true' });
  eq('job jam+aktif', _rmdValidate_({ jobs: { 'booking-minggu': { enabled: false, hour: '18' } } }),
     { RMD_BOOKING_MINGGU_ENABLED: 'false', RMD_BOOKING_MINGGU_HOUR: '18' });
  eq('jam kosong = hapus', _rmdValidate_({ jobs: { pr: { hour: '' } } }), { RMD_PR_HOUR: '' });
  eq('tidur dipangkas', _rmdValidate_({ tplSleep: '  Tidur cukup  ' }), { RMD_TPL_SLEEP: 'Tidur cukup' });
  throws('jam 24', function() { _rmdValidate_({ jobs: { pr: { hour: 24 } } }); });
  throws('jam desimal', function() { _rmdValidate_({ jobs: { pr: { hour: 7.5 } } }); });
  throws('jenis asing', function() { _rmdValidate_({ jobs: { xyz: { hour: 5 } } }); });
  throws('tidur kepanjangan', function() { _rmdValidate_({ tplSleep: new Array(302).join('a') }); });
  throws('bukan objek', function() { _rmdValidate_('x'); });
  if (bad.length) throw new Error('testRmdValidate GAGAL: ' + bad.join(' | '));
  Logger.log('testRmdValidate: 10/10 lulus');
}


// ##############################################################################
// BAGIAN: T-44 Dispatcher / trigger
// ##############################################################################

// =============================================================================
// ReminderTick.gs — T-44: dispatcher reminder (file baru, tempel/simpan di proyek).
// Bergantung pada Reminder.gs (_alreadySent_, _logReminder_) dan requireOwner_.
//
// Cara kerja: trigger per jam memanggil runReminderTick(). Tiap jenis reminder
// terdaftar di REMINDER_JOBS (hari, jam WIB, nama fungsi handler). Kalau jamnya
// tiba (toleransi 1 jam untuk trigger yang meleset) dan slot itu belum tercatat
// 'ok' di ReminderLog, handler dipanggil. Handler yang belum ada (T-45/46/47)
// dilewati diam-diam, jadi tick aman dipasang sekarang.
//
// ASUMSI (T-40 belum ada): master switch = properti RMD_ENABLED === 'true'
// (default mati = perilaku lama). Jam per jenis bisa ditimpa lewat properti
// RMD_<JENIS>_HOUR (mis. RMD_BOOKING_MINGGU_HOUR=17). T-40 nanti menggantikan ini.
// Handler menerima ({slot, now}) dan mengembalikan true (terkirim) / false (gagal
// atau tidak ada yang dikirim → dicatat 'gagal', boleh dicoba lagi di tick berikut).
// =============================================================================

var REMINDER_TZ = 'Asia/Jakarta';
var REMINDER_TICK_TOLERANCE_HOURS = 1;     // jam terlambat yang masih diterima
var REMINDER_TICK_MIN_GAP_MS = 5 * 60000;  // throttle: tick tidak diproses < 5 menit dari sebelumnya

// day: 0=Minggu..6=Sabtu, null = setiap hari. hour: jam WIB default.
var REMINDER_JOBS = [
  { jenis: 'booking-minggu', day: 0,    hour: 17, handler: 'sendBookingMingguDigest_' }, // T-45
  { jenis: 'pr',             day: null, hour: 8,  handler: 'sendPrDigest_' },           // T-46
  // T-72: bawaan MATI (defaultEnabled:false) sampai tip disetujui Coach (T-75) — aktifkan lewat
  // properti RMD_MAKAN_PAGI_ENABLED / RMD_MAKAN_SORE_ENABLED = 'true' (UI menyusul).
  { jenis: 'makan-pagi',     day: null, hour: 6,  handler: 'sendMakanPagiDigest_', defaultEnabled: false },
  { jenis: 'makan-sore',     day: null, hour: 16, handler: 'sendMakanSoreDigest_', defaultEnabled: false }
];

/** Nilai bawaan saklar satu jenis bila properti _ENABLED belum pernah diisi. */
function _rmdDefaultEnabled_(jenis) {
  for (var i = 0; i < REMINDER_JOBS.length; i++) {
    if (REMINDER_JOBS[i].jenis === jenis) return REMINDER_JOBS[i].defaultEnabled !== false;
  }
  return true;
}

/** Murni: nilai properti _ENABLED ('true'/'false'/kosong) → boolean, dengan bawaan per jenis. */
function _rmdEnabledFrom_(propValue, jenis) {
  if (propValue === 'true') return true;
  if (propValue === 'false') return false;
  return _rmdDefaultEnabled_(jenis);
}

/** Anti-tumpang-tindih: true kalau `key` belum jalan dalam minGapMs terakhir; sekaligus mencatat waktunya. */
function _rmdThrottle_(key, minGapMs, nowMs) {
  var props = PropertiesService.getScriptProperties();
  var pk = 'RMD_LAST_' + key, now = nowMs == null ? Date.now() : nowMs;
  var last = parseInt(props.getProperty(pk), 10);
  if (!isNaN(last) && now - last < minGapMs && now >= last) return false;
  props.setProperty(pk, String(now));
  return true;
}

/**
 * Fungsi murni (mudah dites): job mana yang jatuh tempo.
 * parts = {day:0-6, hour:0-23, date:'YYYY-MM-DD'}; hourOverride = {jenis: jam}.
 * Mengembalikan [{job, slot}] dengan slot = 'YYYY-MM-DDTHH' untuk jam TARGET job
 * (bukan jam tick), supaya tick terlambat tetap memakai kunci yang sama.
 */
function _dueJobs_(parts, jobs, hourOverride, tolerance) {
  var out = [];
  (jobs || []).forEach(function(job) {
    var hour = hourOverride && hourOverride[job.jenis] != null ? hourOverride[job.jenis] : job.hour;
    if (job.day != null && job.day !== parts.day) return;
    var late = parts.hour - hour;
    if (late < 0 || late > tolerance) return;
    out.push({ job: job, slot: parts.date + 'T' + ('0' + hour).slice(-2) });
  });
  return out;
}

function _wibParts_(now) {
  var d = Utilities.formatDate(now, REMINDER_TZ, 'yyyy-MM-dd');
  var h = parseInt(Utilities.formatDate(now, REMINDER_TZ, 'H'), 10);
  var u = parseInt(Utilities.formatDate(now, REMINDER_TZ, 'u'), 10); // 1=Senin..7=Minggu
  return { date: d, hour: h, day: u % 7 };
}

/**
 * Titik masuk trigger. Aman dipanggil berulang: idempotensi lewat ReminderLog,
 * satu tick pada satu waktu lewat lock. Tidak pernah melempar ke trigger
 * (kegagalan satu job tidak menghentikan job lain).
 * @returns {{ran:Array, skipped:string}}
 */
function runReminderTick() {
  var props = PropertiesService.getScriptProperties();
  var res = { ran: [], skipped: '' };
  if (props.getProperty('RMD_ENABLED') !== 'true') { res.skipped = 'nonaktif'; return res; }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { res.skipped = 'sibuk'; return res; }
  try {
    if (!_rmdThrottle_('tick', REMINDER_TICK_MIN_GAP_MS)) { res.skipped = 'throttle'; return res; }

    var now = new Date(), parts = _wibParts_(now), override = {};
    REMINDER_JOBS.forEach(function(j) {
      var h = parseInt(props.getProperty('RMD_' + j.jenis.toUpperCase().replace(/-/g, '_') + '_HOUR'), 10);
      if (!isNaN(h) && h >= 0 && h <= 23) override[j.jenis] = h;
    });

    _dueJobs_(parts, REMINDER_JOBS, override, REMINDER_TICK_TOLERANCE_HOURS).forEach(function(d) {
      if (!_rmdJobEnabled_(d.job.jenis)) return;                 // T-40: saklar per jenis
      var fn = globalThis[d.job.handler];
      if (typeof fn !== 'function') { Logger.log('Handler ' + d.job.handler + ' belum ada, dilewati.'); return; }
      if (_alreadySent_(d.job.jenis, d.slot, '*')) return;
      var ok = false;
      try { ok = fn({ slot: d.slot, now: now }) === true; }
      catch (e) { Logger.log('Reminder ' + d.job.jenis + ' error: ' + e); }
      _logReminder_(d.job.jenis, d.slot, '*', ok ? 'ok' : 'gagal');
      res.ran.push(d.job.jenis + '|' + d.slot + '|' + (ok ? 'ok' : 'gagal'));
    });

    try { if (parts.hour === 3) _pruneReminderLog_(now); } catch (e) { Logger.log('Prune gagal: ' + e); }
  } finally {
    lock.releaseLock();
  }
  return res;
}

/** Pemilik, dari editor: hapus trigger runReminderTick lama lalu pasang satu trigger per jam. */
function setupReminderTrigger() {
  requireOwner_();
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runReminderTick') { ScriptApp.deleteTrigger(t); removed++; }
  });
  ScriptApp.newTrigger('runReminderTick').timeBased().everyHours(1).inTimezone(REMINDER_TZ).create();
  Logger.log('Trigger runReminderTick dipasang (' + removed + ' duplikat dihapus). Aktifkan dengan properti RMD_ENABLED=true.');
}

/** Tes murni tanpa efek samping (T-60 akan memperluas). Lempar error bila gagal. */
function testDueJobs() {
  // Hanya jenis awal (T-44…46) supaya tes tidak bergantung pada jam job baru (T-72 makan-*).
  var jobs = REMINDER_JOBS.filter(function(j) { return j.jenis === 'booking-minggu' || j.jenis === 'pr'; });
  var tol = REMINDER_TICK_TOLERANCE_HOURS, bad = [];
  function eq(label, got, want) { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(label + ' → ' + JSON.stringify(got)); }
  var sun = '2026-09-27';   // Minggu
  eq('Minggu 17:00 booking',  _dueJobs_({day:0,hour:17,date:sun}, jobs, {}, tol).map(function(d){return d.slot;}), [sun+'T17']);
  eq('Minggu 18:00 masih ok', _dueJobs_({day:0,hour:18,date:sun}, jobs, {}, tol).map(function(d){return d.slot;}), [sun+'T17']);
  eq('Minggu 19:00 lewat',    _dueJobs_({day:0,hour:19,date:sun}, jobs, {}, tol).length, 0);
  eq('Senin 17:00 bukan booking', _dueJobs_({day:1,hour:17,date:'2026-09-28'}, jobs, {}, tol).length, 0);
  eq('override jam PR',       _dueJobs_({day:1,hour:20,date:'2026-09-28'}, jobs, {pr:20}, tol).map(function(d){return d.job.jenis;}), ['pr']);
  eq('sebelum jam',           _dueJobs_({day:0,hour:16,date:sun}, jobs, {}, tol).length, 0);
  if (bad.length) throw new Error('testDueJobs GAGAL: ' + bad.join(' | '));
  Logger.log('testDueJobs: 6/6 lulus');
}


// ##############################################################################
// BAGIAN: T-45 Digest Booking Minggu
// ##############################################################################

// =============================================================================
// ReminderBooking.gs — T-45: Digest "Booking Minggu" (F1) untuk Coach via Telegram.
// Dipanggil oleh runReminderTick (ReminderTick.gs) lewat REMINDER_JOBS.handler.
// Bergantung: Reminder.gs (_selectBookableClients_, _waLink_, kirimTelegramTombol_),
// ReminderTick.gs (_wibParts_), _getSchedulesAll_ (Kode.gs).
//
// ASUMSI (cocokkan dengan PRD/Kode.gs, ubah di sini bila beda):
//  - Satu sesi = 1 jam, satu Coach → slot jam terisi bila ada jadwal (status bukan
//    'cancelled'/'completed') yang MULAI di jam itu.
//  - Jam buka = _businessHours_() (Kode.gs; bisa diubah di Pengaturan, default Minggu 06–12, lainnya 06–21; jam akhir tidak dihitung).
//  - "3 slot kosong terdekat" = dari jam penuh berikutnya sampai 7 hari ke depan.
// Pesan ini untuk Coach: tiap tombol membuka WhatsApp ke satu klien yang masih
// bisa booking (A4), dengan teks berisi 3 slot tadi (Coach tinggal tekan kirim).
// =============================================================================

// Hanya untuk tes (testNearestFreeSlots) agar hasil deterministik; handler memakai _businessHours_().
var BOOKING_DAY_HOURS = { 0: [6, 12], 1: [6, 21], 2: [6, 21], 3: [6, 21], 4: [6, 21], 5: [6, 21], 6: [6, 21] };
var BOOKING_DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var BOOKING_MAX_SLOTS = 3;
var BOOKING_LOOKAHEAD_DAYS = 7;

// _escHtml_ dipakai dari Kode.gs (sudah ada di sana; duplikat dihapus agar tidak bentrok nama global).

/**
 * Fungsi murni (mudah dites). schedules = hasil _getSchedulesAll_(), now = Date.
 * @returns {Array<{date:string,hour:number,day:number,label:string}>} maks n slot kosong, urut waktu.
 */
function _nearestFreeSlots_(schedules, now, n, dayHours, lookaheadDays) {
  var busy = {};
  (schedules || []).forEach(function(s) {
    var st = String(s.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'completed') return;
    var d = new Date(s.start);
    if (isNaN(d.getTime())) return;
    var p = _wibParts_(d);
    busy[p.date + 'T' + p.hour] = true;
  });

  var hourMs = 3600000;
  var t = Math.ceil(now.getTime() / hourMs) * hourMs;    // jam penuh berikutnya
  var end = now.getTime() + lookaheadDays * 24 * hourMs;
  var out = [];
  for (; t <= end && out.length < n; t += hourMs) {
    var p = _wibParts_(new Date(t));
    var h = dayHours[p.day];
    if (!h || p.hour < h[0] || p.hour >= h[1]) continue;
    if (busy[p.date + 'T' + p.hour]) continue;
    var dm = p.date.split('-');
    out.push({
      date: p.date, hour: p.hour, day: p.day,
      label: BOOKING_DAY_NAMES[p.day] + ' ' + parseInt(dm[2], 10) + '/' + parseInt(dm[1], 10) + ' ' + ('0' + p.hour).slice(-2) + ':00'
    });
  }
  return out;
}

/** Teks WhatsApp ke klien (dikirim Coach). */
function _bookingWaText_(name, slots) {
  var lines = ['Halo ' + name + ', minggu ini masih ada slot latihan kosong:'];
  slots.forEach(function(s) { lines.push('• ' + s.label); });
  lines.push('Mau booking yang mana? 💪');
  return lines.join('\n');
}

/**
 * Handler REMINDER_JOBS 'booking-minggu'. ctx = {slot, now}.
 * @returns {boolean} true = selesai (terkirim, atau memang tidak ada yang perlu dikirim);
 *                    false = Telegram dilewati/gagal → dicatat 'gagal', dicoba lagi di tick berikut.
 */
function sendBookingMingguDigest_(ctx) {
  var now = (ctx && ctx.now) || new Date();
  var pools = _loadClientPools_();
  var clients = pools.bookable;
  if (!clients.length) { Logger.log('Booking Minggu: tidak ada klien yang bisa booking.'); return true; }

  var slots = _nearestFreeSlots_(_getSchedulesAll_(), now, BOOKING_MAX_SLOTS, _businessHours_(), BOOKING_LOOKAHEAD_DAYS);   // T-45: jam buka dari Pengaturan
  if (!slots.length) { Logger.log('Booking Minggu: tidak ada slot kosong.'); return true; }

  var text = '📅 <b>Booking Minggu Ini</b>\n' +
    clients.length + ' klien masih punya jatah sesi. Slot kosong terdekat:\n' +
    slots.map(function(s) { return '• ' + _escHtml_(s.label); }).join('\n') +
    '\n\nTekan nama klien untuk kirim ajakan lewat WhatsApp.';
  if (pools.skipped) text += '\n⚠️ ' + pools.skipped + ' klien dilewati (nomor WA tidak valid).';

  var buttons = clients.map(function(c) {
    return { text: '💬 ' + c.name + ' (sisa ' + c.slots + ')', url: _waLink_(c.phone, _bookingWaText_(c.name, slots)) };
  });

  var r = kirimTelegramTombol_(text, buttons);
  Logger.log('Booking Minggu: ' + JSON.stringify(r));
  return !r.skipped && r.sent > 0 && r.failed === 0;
}

/** Tes murni (tanpa sheet/Telegram). Lempar error bila gagal. */
function testNearestFreeSlots() {
  var bad = [];
  function eq(l, g, w) { if (JSON.stringify(g) !== JSON.stringify(w)) bad.push(l + ' → ' + JSON.stringify(g)); }
  var lbl = function(a) { return a.map(function(s) { return s.label; }); };
  // Minggu 2026-09-27 17:00 WIB (10:00 UTC): Minggu sudah tutup → slot pertama Senin 06:00
  var now = new Date('2026-09-27T10:00:00Z');
  eq('Minggu sore → Senin pagi', lbl(_nearestFreeSlots_([], now, 3, BOOKING_DAY_HOURS, 7)),
     ['Senin 28/9 06:00', 'Senin 28/9 07:00', 'Senin 28/9 08:00']);
  // Senin 06:00 & 07:00 WIB terisi (23:00 & 00:00 UTC), completed diabaikan, cancelled diabaikan
  var sch = [{ start: '2026-09-27T23:00:00Z', status: 'scheduled' }, { start: '2026-09-28T00:00:00Z', status: 'booked' },
             { start: '2026-09-28T01:00:00Z', status: 'cancelled' }];
  eq('slot terisi dilewati', lbl(_nearestFreeSlots_(sch, now, 3, BOOKING_DAY_HOURS, 7)),
     ['Senin 28/9 08:00', 'Senin 28/9 09:00', 'Senin 28/9 10:00']);
  eq('lookahead 0 hari', _nearestFreeSlots_([], now, 3, BOOKING_DAY_HOURS, 0).length, 0);
  if (bad.length) throw new Error('testNearestFreeSlots GAGAL: ' + bad.join(' | '));
  Logger.log('testNearestFreeSlots: 3/3 lulus');
}


// ##############################################################################
// BAGIAN: T-46 Digest PR
// ##############################################################################

// =============================================================================
// ReminderPR.gs — T-46: Digest "PR" (F3) untuk Coach via Telegram.
// Handler job 'pr' di REMINDER_JOBS (ReminderTick.gs), default tiap hari 08:00 WIB.
// Bergantung: Kode.gs (_tasksSheet_, _parseTanggalDMY_), Reminder.gs
// (_loadClientPools_, _waLink_, kirimTelegramTombol_), ReminderBooking.gs (_escHtml_).
//
// ASUMSI (PRD tidak terunggah; ubah di sini bila beda):
//  - PR yang diingatkan: status 'todo' dengan tenggat SEBELUM hari ini (telat),
//    hari ini, atau besok. PR tanpa tenggat / tenggat lebih jauh tidak diingatkan.
//  - Hanya klien aktif (A3: nomor WA valid & sisa sesi > 0). Klien lain dilewati.
//  - Ringkasan dikirim ke Coach; tiap tombol membuka WhatsApp ke satu klien
//    dengan daftar PR-nya (Coach tinggal menekan kirim).
// =============================================================================

var PR_DIGEST_MAX_TITLES = 4;      // judul PR per klien di teks WhatsApp
var PR_DIGEST_MAX_LINES = 40;      // baris klien di pesan Telegram (batas 4096 karakter)

/**
 * Fungsi murni (mudah dites).
 * taskRows = baris sheet Tasks (tanpa header, kolom A–M), activeClients = hasil
 * _loadClientPools_().active, today = Date tengah malam waktu skrip.
 * @returns {Array<{client:Object, late:Array, today:Array, tomorrow:Array}>}
 *          urut: paling banyak telat dulu, lalu nama.
 */
function _buildPrDigest_(taskRows, activeClients, today) {
  var byId = {};
  (activeClients || []).forEach(function(c) { byId[c.id] = { client: c, late: [], today: [], tomorrow: [] }; });
  var t0 = today.getTime(), DAY = 86400000;

  (taskRows || []).forEach(function(row) {
    if (!row || !row[0]) return;
    if (String(row[6] || 'todo') !== 'todo') return;
    var entry = byId[String(row[1]).trim()];
    if (!entry) return;
    var due = _parseTanggalDMY_(String(row[5] == null ? '' : row[5]).trim());
    if (!due) return;
    var d = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    var item = { title: String(row[2] || '').trim(), due: due };
    if (d < t0) entry.late.push(item);
    else if (d === t0) entry.today.push(item);
    else if (d === t0 + DAY) entry.tomorrow.push(item);
  });

  return Object.keys(byId).map(function(k) { return byId[k]; })
    .filter(function(e) { return e.late.length + e.today.length + e.tomorrow.length > 0; })
    .sort(function(a, b) { return (b.late.length - a.late.length) || a.client.name.localeCompare(b.client.name); });
}

function _prDueLabel_(d) { return d.getDate() + '/' + (d.getMonth() + 1); }

/** Ringkasan singkat per klien: "2 telat, 1 hari ini, 1 besok". */
function _prSummaryText_(e) {
  var p = [];
  if (e.late.length) p.push(e.late.length + ' telat');
  if (e.today.length) p.push(e.today.length + ' hari ini');
  if (e.tomorrow.length) p.push(e.tomorrow.length + ' besok');
  return p.join(', ');
}

/** Teks WhatsApp ke klien. */
function _prWaText_(e) {
  var lines = ['Halo ' + e.client.name + ', pengingat PR kamu:'];
  var all = e.late.concat(e.today, e.tomorrow), shown = all.slice(0, PR_DIGEST_MAX_TITLES);
  shown.forEach(function(t) {
    var tag = e.late.indexOf(t) >= 0 ? 'telat, ' : '';
    lines.push('• ' + t.title + ' (' + tag + 'tenggat ' + _prDueLabel_(t.due) + ')');
  });
  if (all.length > shown.length) lines.push('…dan ' + (all.length - shown.length) + ' PR lain.');
  lines.push('Semangat, kamu pasti bisa! 💪');
  return lines.join('\n');
}

/**
 * Handler REMINDER_JOBS 'pr'. ctx = {slot, now}.
 * @returns {boolean} true = selesai (terkirim / tidak ada yang perlu dikirim);
 *                    false = Telegram dilewati/gagal → dicoba lagi di tick berikut.
 */
function sendPrDigest_(ctx) {
  var now = (ctx && ctx.now) || new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var pools = _loadClientPools_();
  var rows = _tasksSheet_().getDataRange().getValues().slice(1);
  var list = _buildPrDigest_(rows, pools.active, today);
  if (!list.length) { Logger.log('PR digest: tidak ada PR yang perlu diingatkan.'); return true; }

  var shown = list.slice(0, PR_DIGEST_MAX_LINES);
  var text = '📝 <b>Pengingat PR</b>\n' + list.length + ' klien punya PR yang perlu ditindaklanjuti:\n\n' +
    shown.map(function(e) { return '• ' + _escHtml_(e.client.name) + ' — ' + _prSummaryText_(e); }).join('\n');
  if (list.length > shown.length) text += '\n…dan ' + (list.length - shown.length) + ' klien lain.';
  text += '\n\nTekan nama klien untuk kirim pengingat lewat WhatsApp.';
  if (pools.skipped) text += '\n⚠️ ' + pools.skipped + ' klien dilewati (nomor WA tidak valid).';

  var buttons = list.map(function(e) {
    return { text: '💬 ' + e.client.name + ' (' + _prSummaryText_(e) + ')', url: _waLink_(e.client.phone, _prWaText_(e)) };
  });
  var r = kirimTelegramTombol_(text, buttons);
  Logger.log('PR digest: ' + JSON.stringify(r));
  return !r.skipped && r.sent > 0 && r.failed === 0;
}

/** Tes murni (tanpa sheet/Telegram). Lempar error bila gagal. */
function testBuildPrDigest() {
  var bad = [];
  function eq(l, g, w) { if (JSON.stringify(g) !== JSON.stringify(w)) bad.push(l + ' → ' + JSON.stringify(g)); }
  var today = new Date(2026, 8, 28);                                   // 28 Sep 2026
  var clients = [{ id: 'A', name: 'Ani', phone: '628111111111' }, { id: 'B', name: 'Budi', phone: '628122222222' },
                 { id: 'C', name: 'Cici', phone: '628133333333' }];
  var rows = [
    ['1', 'A', 'PR satu',  '', 'lain', '27/9/2026', 'todo'],     // telat
    ['2', 'A', 'PR dua',   '', 'lain', '28/9/2026', 'todo'],     // hari ini
    ['3', 'A', 'sudah',    '', 'lain', '20/9/2026', 'done'],     // selesai → diabaikan
    ['4', 'B', 'PR besok', '', 'lain', '29/9/2026', 'todo'],     // besok
    ['5', 'B', 'jauh',     '', 'lain', '5/10/2026', 'todo'],     // terlalu jauh → diabaikan
    ['6', 'C', 'tanpa tenggat', '', 'lain', '', 'todo'],         // diabaikan
    ['7', 'Z', 'klien tak aktif', '', 'lain', '1/9/2026', 'todo'],
    ['8', 'A', 'dilewati', '', 'lain', '1/9/2026', 'skipped']
  ];
  var out = _buildPrDigest_(rows, clients, today);
  eq('klien terpilih', out.map(function(e) { return e.client.id; }), ['A', 'B']);
  eq('ringkasan Ani', _prSummaryText_(out[0]), '1 telat, 1 hari ini');
  eq('ringkasan Budi', _prSummaryText_(out[1]), '1 besok');
  eq('teks WA memuat tag telat', /PR satu \(telat, tenggat 27\/9\)/.test(_prWaText_(out[0])), true);
  eq('kosong', _buildPrDigest_([], clients, today).length, 0);
  if (bad.length) throw new Error('testBuildPrDigest GAGAL: ' + bad.join(' | '));
  Logger.log('testBuildPrDigest: 5/5 lulus');
}


// =============================================================================
// BAGIAN: T-47 Tidur di reminder malam
// =============================================================================
// Kalimat tidur (properti RMD_TPL_SLEEP, diatur lewat T-40) ditambahkan ke
// sendDailyReminderEmail HANYA di run malam (trigger 20:00). Run pagi (05:00)
// tidak berubah. Properti kosong (default) = perilaku lama persis.
// Sengaja tidak bergantung pada RMD_ENABLED: kalimat kosong sudah berarti mati.

var RMD_EVENING_FROM_HOUR = 12; // jam >= 12 (zona waktu skrip, WIB) dianggap run malam

/** Murni: kalimat tidur untuk jam tertentu, atau '' bila bukan malam / belum diisi. */
function _sleepLineFor_(hour, tpl) {
  var t = String(tpl == null ? '' : tpl).trim();
  if (!t) return '';
  return (hour >= RMD_EVENING_FROM_HOUR) ? t : '';
}

/** Dipanggil sendDailyReminderEmail. Tidak pernah melempar (gagal baca → ''). */
function _sleepLine_(hour) {
  try {
    return _sleepLineFor_(hour, PropertiesService.getScriptProperties().getProperty('RMD_TPL_SLEEP'));
  } catch (e) {
    Logger.log('Kalimat tidur dilewati: ' + e);
    return '';
  }
}

/** Tes T-47 (murni, tanpa efek samping). Jalankan dari editor. */
function testSleepLine() {
  var fails = [];
  var eq = function(l, a, b) { if (a !== b) fails.push(l + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  eq('malam 20 + isi', _sleepLineFor_(20, 'Tidur 7 jam ya'), 'Tidur 7 jam ya');
  eq('pagi 5 + isi', _sleepLineFor_(5, 'Tidur 7 jam ya'), '');
  eq('batas 12', _sleepLineFor_(12, 'x'), 'x');
  eq('11 belum malam', _sleepLineFor_(11, 'x'), '');
  eq('kosong', _sleepLineFor_(20, ''), '');
  eq('spasi saja', _sleepLineFor_(20, '   '), '');
  eq('null', _sleepLineFor_(20, null), '');
  eq('dipangkas', _sleepLineFor_(21, '  hai  '), 'hai');
  fails.forEach(function(f) { Logger.log('❌ ' + f); });
  Logger.log(fails.length ? '— GAGAL ' + fails.length + ' —' : '— testSleepLine 8/8 lulus —');
  if (fails.length) throw new Error('T-47 GAGAL: ' + fails[0]);
}


// =============================================================================
// BAGIAN: T-48 sendReminderTest (admin)
// =============================================================================
// Dipanggil dari tombol "Kirim tes" di Pengaturan → Pengingat (T-50):
//   google.script.run.sendReminderTest(token, 'pr' | 'booking-minggu' | 'tidur')
// Perilaku:
//   - requireAdmin_ di baris pertama; jenis di luar daftar → error Indonesia.
//   - Menjalankan handler asli SEKARANG, tanpa cek RMD_ENABLED / saklar jenis / jam,
//     dan TANPA menyentuh ReminderLog, jadi slot asli tidak "terpakai".
//   - Pesan asli didahului satu pesan Telegram "🧪 TES" agar jelas ini bukan jadwal.
//   - 'tidur' hanya mengirim pratinjau kalimat RMD_TPL_SLEEP (email malam asli tidak
//     dipicu, supaya tidak mengirim email ganda / menyentuh throttle harian).
//   - Throttle 15 detik per jenis (mencegah spam dari tombol).
// Hasil: {jenis, terkirim:boolean, pesan:string}. `terkirim` false + pesan = alasan.

var RMD_TEST_JENIS = ['booking-minggu', 'pr', 'tidur', 'makan-pagi', 'makan-sore'];
var RMD_TEST_MIN_GAP_MS = 15000;

/** Murni: nama jenis valid → jenis itu sendiri; selain itu lempar error. */
function _rmdTestResolve_(jenis) {
  var j = String(jenis == null ? '' : jenis).trim();
  if (RMD_TEST_JENIS.indexOf(j) < 0) {
    throw new Error('Jenis pengingat tidak dikenal: ' + (j || '(kosong)') + '. Pilihan: ' + RMD_TEST_JENIS.join(', ') + '.');
  }
  return j;
}

function _telegramReady_() {
  var props = PropertiesService.getScriptProperties();
  var ids = String(props.getProperty('TELEGRAM_CHAT_IDS') || '').split(',').map(function(x) { return x.trim(); }).filter(String);
  return props.getProperty('TELEGRAM_ENABLED') !== 'false' && !!props.getProperty('TELEGRAM_BOT_TOKEN') && ids.length > 0;
}

function sendReminderTest(token, jenis) {
  requireAdmin_(token);
  var j = _rmdTestResolve_(jenis);
  if (!_telegramReady_()) {
    return { jenis: j, terkirim: false, pesan: 'Telegram belum diatur atau dimatikan (cek TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS, dan saklar Telegram).' };
  }
  if (!_rmdThrottle_('test_' + j, RMD_TEST_MIN_GAP_MS)) {
    return { jenis: j, terkirim: false, pesan: 'Tunggu beberapa detik sebelum mengirim tes yang sama lagi.' };
  }

  kirimNotifTelegram_('🧪 <b>TES pengingat: ' + _escHtml_(j) + '</b>\nIni pesan percobaan, bukan jadwal otomatis.');

  if (j === 'tidur') {
    var line = String(PropertiesService.getScriptProperties().getProperty('RMD_TPL_SLEEP') || '').trim();
    if (!line) return { jenis: j, terkirim: false, pesan: 'Kalimat tidur belum diisi, jadi pengingat malam tidak menambahkan apa pun.' };
    kirimNotifTelegram_('😴 ' + _escHtml_(line));
    return { jenis: j, terkirim: true, pesan: 'Pratinjau kalimat tidur terkirim ke Telegram.' };
  }

  var handler = { 'pr': sendPrDigest_, 'booking-minggu': sendBookingMingguDigest_,
                  'makan-pagi': sendMakanPagiDigest_, 'makan-sore': sendMakanSoreDigest_ }[j];
  var ok;
  try {
    ok = handler({ slot: 'tes', now: new Date() }) === true;
  } catch (e) {
    Logger.log('sendReminderTest ' + j + ' error: ' + e);
    return { jenis: j, terkirim: false, pesan: 'Gagal menjalankan pengingat: ' + (e && e.message || e) };
  }
  // Handler mengembalikan true juga saat memang tidak ada yang perlu dikirim.
  return { jenis: j, terkirim: ok,
           pesan: ok ? 'Selesai. Bila tidak ada pesan digest di Telegram, berarti tidak ada klien/PR/slot yang memenuhi syarat saat ini.'
                     : 'Pengiriman ke Telegram gagal sebagian atau seluruhnya. Lihat log eksekusi.' };
}

/** Tes T-48 (murni, tanpa efek samping). Jalankan dari editor. */
function testRmdTestResolve() {
  var fails = [];
  var eq = function(l, a, b) { if (a !== b) fails.push(l + ': ' + a + ' != ' + b); };
  var thr = function(l, v) { try { _rmdTestResolve_(v); fails.push(l + ': tidak melempar'); } catch (e) {} };
  eq('pr', _rmdTestResolve_('pr'), 'pr');
  eq('booking', _rmdTestResolve_('booking-minggu'), 'booking-minggu');
  eq('tidur dipangkas', _rmdTestResolve_(' tidur '), 'tidur');
  thr('kosong', ''); thr('null', null); thr('undefined', undefined);
  thr('acak', 'malam-x'); thr('objek', { a: 1 });
  thr('huruf besar', 'PR');
  // Penjaga akses: token sampah harus ditolak SEBELUM apa pun terkirim.
  try { sendReminderTest('bukan-token', 'pr'); fails.push('token sampah: tidak ditolak'); }
  catch (e) { if (String(e.message || e).indexOf(AUTH_ERROR_PREFIX) !== 0) fails.push('token sampah: bukan error auth: ' + e); }
  fails.forEach(function(f) { Logger.log('❌ ' + f); });
  Logger.log(fails.length ? '— GAGAL ' + fails.length + ' —' : '— testRmdTestResolve 9/9 lulus —');
  if (fails.length) throw new Error('T-48 GAGAL: ' + fails[0]);
}


// ##############################################################################
// BAGIAN: T-70 MealTips + rotasi tip deterministik
// ##############################################################################

// =============================================================================
// T-70: sheet "MealTips" + _pickTip_(waktu, tanggal). Dipakai digest Makan (T-72)
// dan kartu portal (T-74). Bergantung: getOrCreateSheet_ (Kode.gs).
//
// Kolom: A Waktu ('pagi' | 'sore') · B Tip · C Aktif ('ya' = boleh dipakai).
// Sheet dibuat KOSONG; isi tip datang dari T-75 dan hanya baris Aktif='ya' yang
// dipakai (Coach menandai 'ya' setelah menyetujui). Tanpa tip aktif → '' (pemanggil
// melewati bagian tip, tidak error).
//
// Rotasi: indeks = (jumlah hari sejak 1970-01-01 dari `tanggal`) mod (jumlah tip
// aktif untuk waktu itu). Hasil sama untuk tanggal yang sama, berganti tiap hari,
// tidak butuh state. Menambah/menghapus tip menggeser urutan (wajar).
// =============================================================================

var MEALTIPS_HEADERS = ['Waktu', 'Tip', 'Aktif'];
var MEALTIPS_WAKTU = ['pagi', 'sore'];

/** Sheet MealTips (kosong bila baru). Semua kolom Plain Text. */
function _mealTipsSheet_() {
  var sheet = getOrCreateSheet_('MealTips', MEALTIPS_HEADERS);
  sheet.getRange('A:C').setNumberFormat('@');
  return sheet;
}

/** Murni: 'YYYY-MM-DD' → jumlah hari sejak epoch (UTC), atau null bila tidak valid. */
function _tipDayNumber_(tanggal) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tanggal == null ? '' : tanggal).trim());
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  var t = Date.UTC(y, mo - 1, d);
  var chk = new Date(t);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  return Math.floor(t / 86400000);
}

/**
 * Murni (mudah dites). rows = nilai sheet TANPA header ([[waktu, tip, aktif], ...]).
 * @returns {string} tip terpilih, atau '' bila waktu/tanggal tidak valid atau tak ada tip aktif.
 */
function _pickTipFrom_(rows, waktu, tanggal) {
  var w = String(waktu == null ? '' : waktu).trim().toLowerCase();
  if (MEALTIPS_WAKTU.indexOf(w) < 0) return '';
  var day = _tipDayNumber_(tanggal);
  if (day === null) return '';
  var pool = [];
  (rows || []).forEach(function(r) {
    if (!r) return;
    if (String(r[0] == null ? '' : r[0]).trim().toLowerCase() !== w) return;
    if (String(r[2] == null ? '' : r[2]).trim().toLowerCase() !== 'ya') return;
    var tip = String(r[1] == null ? '' : r[1]).trim();
    if (tip) pool.push(tip);
  });
  if (!pool.length) return '';
  return pool[((day % pool.length) + pool.length) % pool.length];
}

/**
 * Tip untuk waktu ('pagi'|'sore') & tanggal ('YYYY-MM-DD', WIB). Tidak pernah
 * melempar error: gagal baca sheet → ''.
 */
function _pickTip_(waktu, tanggal) {
  try {
    var sheet = _mealTipsSheet_();
    var last = sheet.getLastRow();
    if (last < 2) return '';
    return _pickTipFrom_(sheet.getRange(2, 1, last - 1, 3).getValues(), waktu, tanggal);
  } catch (e) {
    Logger.log('MealTips dilewati: ' + e);
    return '';
  }
}

/** Tes T-70 (murni, tanpa sheet). Jalankan dari editor. */
function testPickTip() {
  var fails = [];
  var eq = function(l, a, b) { if (a !== b) fails.push(l + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  var rows = [
    ['pagi', 'P1', 'ya'], ['pagi', 'P2', 'ya'], ['pagi', 'P3', 'ya'],
    ['sore', 'S1', 'ya'], ['sore', 'S2', 'ya'],
    ['pagi', 'DRAF', 'tidak'], ['pagi', 'KOSONG-AKTIF', ''], ['Pagi ', '  P4  ', ' YA '], ['pagi', '   ', 'ya'], ['malam', 'M1', 'ya'], null
  ];
  var d0 = _tipDayNumber_('2026-09-28');
  eq('hari epoch 1970-01-01', _tipDayNumber_('1970-01-01'), 0);
  eq('hari berikutnya +1', _tipDayNumber_('2026-09-29') - d0, 1);
  eq('tanggal 30 Feb tidak valid', _tipDayNumber_('2026-02-30'), null);
  eq('format salah', _tipDayNumber_('28/9/2026'), null);
  eq('null', _tipDayNumber_(null), null);

  var pool = ['P1', 'P2', 'P3', 'P4'];                       // baris aktif 'pagi', urut sheet
  var expect = pool[d0 % 4];
  eq('pagi: indeks = hari mod 4', _pickTipFrom_(rows, 'pagi', '2026-09-28'), expect);
  eq('deterministik (panggil ulang)', _pickTipFrom_(rows, 'pagi', '2026-09-28'), expect);
  eq('besok berganti tip', _pickTipFrom_(rows, 'pagi', '2026-09-29'), pool[(d0 + 1) % 4]);
  eq('siklus penuh kembali (4 hari)', _pickTipFrom_(rows, 'pagi', '2026-10-02'), expect);
  eq('sore terpisah dari pagi', _pickTipFrom_(rows, 'sore', '2026-09-28'), ['S1', 'S2'][d0 % 2]);
  eq('waktu dinormalisasi (huruf besar/spasi)', _pickTipFrom_(rows, ' SORE ', '2026-09-28'), ['S1', 'S2'][d0 % 2]);
  eq('draf (Aktif != ya) tidak dipakai', pool.indexOf('DRAF'), -1);
  var seen = {};
  for (var i = 0; i < 8; i++) seen[_pickTipFrom_(rows, 'pagi', '2026-10-' + ('0' + (1 + i)).slice(-2))] = true;
  eq('8 hari berurutan hanya memilih tip aktif', Object.keys(seen).sort().join(','), 'P1,P2,P3,P4');
  eq('waktu tak dikenal → \'\'', _pickTipFrom_(rows, 'malam', '2026-09-28'), '');
  eq('tanggal tidak valid → \'\'', _pickTipFrom_(rows, 'pagi', 'bukan-tanggal'), '');
  eq('tanpa baris → \'\'', _pickTipFrom_([], 'pagi', '2026-09-28'), '');
  eq('rows null → \'\'', _pickTipFrom_(null, 'pagi', '2026-09-28'), '');
  eq('semua draf → \'\'', _pickTipFrom_([['pagi', 'x', 'tidak']], 'pagi', '2026-09-28'), '');
  eq('satu tip aktif selalu dipilih', _pickTipFrom_([['sore', 'Satu', 'ya']], 'sore', '2026-09-28'), 'Satu');
  fails.forEach(function(f) { Logger.log('❌ ' + f); });
  Logger.log(fails.length ? '— GAGAL ' + fails.length + ' —' : '— testPickTip 19/19 lulus —');
  if (fails.length) throw new Error('T-70 GAGAL: ' + fails[0]);
}


// ##############################################################################
// BAGIAN: T-71 Klien paket core
// ##############################################################################

// =============================================================================
// T-71: _selectCoreClients_() — klien AKTIF (A3: nomor WA valid & sisa sesi > 0)
// yang paketnya berkategori `core` di PriceList (join MemberData.packageId ↔
// PriceList.id). Dipakai digest Makan (T-72), toggle profil (T-73), kartu portal (T-74).
//
// ASUMSI (ubah di sini bila beda):
//  - Kategori dicocokkan setelah trim + huruf kecil (getPriceList sudah menormalkan).
//  - getPriceList() hanya mengembalikan paket Status Aktif = TRUE. Klien yang paketnya
//    sudah dinonaktifkan di PriceList TIDAK dianggap core (tidak ketemu di join).
//  - Klien tanpa Paket ID Aktif tidak dianggap core.
//  - Tidak ada paket core sama sekali di PriceList → hasil kosong + log peringatan (T-01).
// =============================================================================

var CORE_CATEGORY = 'core';

/**
 * Murni (mudah dites). activeClients = pools.active (punya .packageId),
 * packages = hasil getPriceList() ({id, kategori}).
 * @returns {{clients:Array, corePackages:number}}
 */
function _filterCoreClients_(activeClients, packages) {
  var coreIds = {}, n = 0;
  (packages || []).forEach(function(p) {
    if (!p || String(p.kategori == null ? '' : p.kategori).trim().toLowerCase() !== CORE_CATEGORY) return;
    var id = String(p.id == null ? '' : p.id).trim();
    if (!id || coreIds[id]) return;
    coreIds[id] = true; n++;
  });
  var clients = (activeClients || []).filter(function(c) {
    var pid = String(c && c.packageId != null ? c.packageId : '').trim();
    return !!pid && coreIds[pid] === true;
  });
  return { clients: clients, corePackages: n };
}

/** @returns {{clients:Array, skipped:number, corePackages:number}} klien aktif berpaket core */
function _selectCoreClients_() {
  var pools = _loadClientPools_();
  var r = _filterCoreClients_(pools.active, getPriceList());
  if (!r.corePackages) Logger.log('Paket core: tidak ada paket berkategori "core" di PriceList (lihat T-01).');
  return { clients: r.clients, skipped: pools.skipped, corePackages: r.corePackages };
}

/** Tes T-71 (murni, tanpa sheet). Jalankan dari editor. */
function testFilterCoreClients() {
  var fails = [];
  var eq = function(l, a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(l + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  var ids = function(r) { return r.clients.map(function(c) { return c.id; }); };
  var packages = [
    { id: 'P1', kategori: 'core' }, { id: 'P2', kategori: 'reguler' }, { id: 7, kategori: ' Core ' },
    { id: 'P4', kategori: 'CORE' }, { id: '', kategori: 'core' }, null, { id: 'P1', kategori: 'core' }
  ];
  var active = [
    { id: 'A', packageId: 'P1' }, { id: 'B', packageId: 'P2' }, { id: 'C', packageId: '7' },
    { id: 'D', packageId: '' }, { id: 'E', packageId: 'P9' }, { id: 'F', packageId: ' P4 ' },
    { id: 'G', packageId: 7 }, { id: 'H' }, null
  ];
  var r = _filterCoreClients_(active, packages);
  eq('klien core = A,C,F,G (urut asli)', ids(r), ['A', 'C', 'F', 'G']);
  eq('paket core unik = 3 (P1, 7, P4; kosong & duplikat diabaikan)', r.corePackages, 3);
  eq('ID angka cocok dengan ID string', ids(_filterCoreClients_([{ id: 'X', packageId: '7' }], [{ id: 7, kategori: 'core' }])), ['X']);
  eq('tanpa paket core → kosong', _filterCoreClients_(active, [{ id: 'P2', kategori: 'reguler' }]), { clients: [], corePackages: 0 });
  eq('packages null → kosong', _filterCoreClients_(active, null), { clients: [], corePackages: 0 });
  eq('active null → kosong', _filterCoreClients_(null, packages), { clients: [], corePackages: 3 });
  eq('objek klien asli tidak diubah', active[0], { id: 'A', packageId: 'P1' });
  fails.forEach(function(f) { Logger.log('❌ ' + f); });
  Logger.log(fails.length ? '— GAGAL ' + fails.length + ' —' : '— testFilterCoreClients 7/7 lulus —');
  if (fails.length) throw new Error('T-71 GAGAL: ' + fails[0]);
}


// ##############################################################################
// BAGIAN: T-72 Digest Makan pagi & sore
// ##############################################################################

// =============================================================================
// T-72: digest "Makan" (F2) untuk Coach via Telegram, jenis 'makan-pagi' (bawaan
// 06:00 WIB) dan 'makan-sore' (bawaan 16:00 WIB). Bergantung: _selectCoreClients_ (T-71),
// _pickTip_ (T-70), _waLink_, kirimTelegramTombol_, _escHtml_, _wibParts_.
//
// Alur: pilih tip hari ini (rotasi) → tanpa tip aktif, TIDAK ada yang dikirim (return true,
// dilog) → tiap klien core (klien aktif berpaket core) dapat satu tombol WhatsApp berisi
// sapaan + tip. Tip hanya berasal dari sheet MealTips baris Aktif='ya' (T-75); kode ini
// tidak menambahkan angka kalori/berat apa pun.
//
// Opt-out per klien: kolom O MemberData (T-73); kosong = ikut, 'tidak' = tidak ikut.
// Jenis ini bawaan MATI, jadi tidak terkirim sebelum diaktifkan lewat properti.
// =============================================================================

var MAKAN_LABEL = { pagi: '🍳 Makan Pagi', sore: '🥗 Makan Sore' };

/** Teks WhatsApp ke klien (dikirim Coach). Murni. */
function _makanWaText_(name, waktu, tip) {
  var lines = ['Halo ' + name + ', pengingat ' + (waktu === 'pagi' ? 'makan pagi' : 'makan sore') + ':', tip, 'Semangat! 💪'];
  return lines.join('\n');
}

/**
 * Murni: susun pesan Telegram + tombol. clients = hasil _selectCoreClients_().clients.
 * @returns {{text:string, buttons:Array}|null} null bila tak ada klien atau tip kosong.
 */
function _buildMakanDigest_(clients, waktu, tip, skipped) {
  var t = String(tip == null ? '' : tip).trim();
  if (!clients || !clients.length || !t || !MAKAN_LABEL[waktu]) return null;
  var text = '<b>' + MAKAN_LABEL[waktu] + '</b>\n' + clients.length + ' klien paket core. Tip hari ini:\n' +
    _escHtml_(t) + '\n\nTekan nama klien untuk kirim lewat WhatsApp.';
  if (skipped) text += '\n⚠️ ' + skipped + ' klien dilewati (nomor WA tidak valid).';
  var buttons = clients.map(function(c) {
    return { text: '💬 ' + c.name, url: _waLink_(c.phone, _makanWaText_(c.name, waktu, t)) };
  });
  return { text: text, buttons: buttons };
}

/**
 * Handler bersama. @returns {boolean} true = selesai (terkirim / memang tak ada yang dikirim);
 * false = Telegram dilewati/gagal → dicoba lagi di tick berikut.
 */
function _sendMakanDigest_(waktu, ctx) {
  var now = (ctx && ctx.now) || new Date();
  var sel = _selectCoreClients_();
  sel.clients = sel.clients.filter(function(c) { return c.mealOn !== false; });   // T-73: opt-out per klien
  if (!sel.clients.length) { Logger.log('Makan ' + waktu + ': tidak ada klien core dengan reminder makan aktif.'); return true; }
  var tip = _pickTip_(waktu, _wibParts_(now).date);
  var d = _buildMakanDigest_(sel.clients, waktu, tip, sel.skipped);
  if (!d) { Logger.log('Makan ' + waktu + ': tidak ada tip aktif di MealTips, tidak ada yang dikirim.'); return true; }
  var r = kirimTelegramTombol_(d.text, d.buttons);
  Logger.log('Makan ' + waktu + ': ' + JSON.stringify(r));
  return !r.skipped && r.sent > 0 && r.failed === 0;
}

function sendMakanPagiDigest_(ctx) { return _sendMakanDigest_('pagi', ctx); }
function sendMakanSoreDigest_(ctx) { return _sendMakanDigest_('sore', ctx); }

/** Tes T-72 (murni, tanpa sheet/Telegram). Jalankan dari editor. */
function testBuildMakanDigest() {
  var fails = [];
  var eq = function(l, a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(l + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  var clients = [{ id: 'A', name: 'Ani', phone: '628111111111' }, { id: 'B', name: 'Budi <b>', phone: '628122222222' }];
  var d = _buildMakanDigest_(clients, 'pagi', 'Sarapan protein ya', 0);
  eq('tombol = jumlah klien', d.buttons.length, 2);
  eq('teks tombol', d.buttons[0].text, '💬 Ani');
  eq('link WA berisi nomor', d.buttons[0].url.indexOf('https://wa.me/628111111111?text=') === 0, true);
  eq('link WA berisi tip', decodeURIComponent(d.buttons[0].url.split('?text=')[1]).indexOf('Sarapan protein ya') > 0, true);
  eq('judul pagi', d.text.indexOf('Makan Pagi') > 0, true);
  eq('sore memakai judul sore', _buildMakanDigest_(clients, 'sore', 'x', 0).text.indexOf('Makan Sore') > 0, true);
  eq('tip di-escape di teks Telegram', _buildMakanDigest_(clients, 'pagi', 'a<b', 0).text.indexOf('a&lt;b') > 0, true);
  eq('peringatan klien dilewati', _buildMakanDigest_(clients, 'pagi', 'x', 2).text.indexOf('2 klien dilewati') > 0, true);
  eq('tanpa tip → null', _buildMakanDigest_(clients, 'pagi', '  ', 0), null);
  eq('tanpa klien → null', _buildMakanDigest_([], 'pagi', 'x', 0), null);
  eq('waktu asing → null', _buildMakanDigest_(clients, 'malam', 'x', 0), null);
  // Saklar bawaan: makan-* mati, jenis lama tetap aktif.
  eq('makan-pagi bawaan mati', _rmdEnabledFrom_(null, 'makan-pagi'), false);
  eq('makan-sore bawaan mati', _rmdEnabledFrom_('', 'makan-sore'), false);
  eq('makan-pagi diaktifkan', _rmdEnabledFrom_('true', 'makan-pagi'), true);
  eq('pr bawaan aktif', _rmdEnabledFrom_(null, 'pr'), true);
  eq('pr dimatikan', _rmdEnabledFrom_('false', 'pr'), false);
  eq('booking bawaan aktif', _rmdEnabledFrom_(undefined, 'booking-minggu'), true);
  fails.forEach(function(f) { Logger.log('❌ ' + f); });
  Logger.log(fails.length ? '— GAGAL ' + fails.length + ' —' : '— testBuildMakanDigest 17/17 lulus —');
  if (fails.length) throw new Error('T-72 GAGAL: ' + fails[0]);
}


// ##############################################################################
// BAGIAN: T-73 Kolom O "Reminder Makan Aktif" di MemberData
// ##############################################################################

// =============================================================================
// T-73: saklar reminder makan per klien. Kolom O (indeks 14) MemberData, di ujung
// kanan setelah "Kunci Link" (N). MEMBERDATA_HEADERS di Kode.gs SENGAJA tidak diubah
// (dipakai lebar setValues migrasi); header O ditulis di sini bila sel O1 masih kosong.
//
// Nilai sel: kosong / 'ya' = aktif (bawaan, klien lama tetap ikut), 'tidak' = nonaktif.
// Admin: setMemberMealReminder(token, memberId, aktif). Profil klien membawa
// `mealReminder` (boolean) lewat _memberPublicProfile_. Toggle di App.html hanya
// ditampilkan untuk klien paket core.
// =============================================================================

var MEMBER_MEAL_COL = 15;                                  // Kolom O (1-based)
var MEMBER_MEAL_HEADER = 'Reminder Makan Aktif';

/** Murni: nilai sel kolom O → boolean. Hanya 'tidak' (huruf apa pun, dipangkas) yang mematikan. */
function _mealOnFrom_(cell) {
  return String(cell == null ? '' : cell).trim().toLowerCase() !== 'tidak';
}

/** Murni: input toggle (true/false/'true'/'false'/'ya'/'tidak') → boolean, atau lempar error. */
function _parseMealFlag_(v) {
  if (v === true || v === 'true' || v === 'ya') return true;
  if (v === false || v === 'false' || v === 'tidak') return false;
  throw new Error('Nilai reminder makan tidak valid.');
}

/** Tulis header O1 bila masih kosong (tidak menimpa kolom buatan sendiri). */
function _ensureMealCol_(sheet) {
  var h = sheet.getRange(1, MEMBER_MEAL_COL);
  if (h.getValue() === '') { h.setValue(MEMBER_MEAL_HEADER); h.setFontWeight('bold'); }
  return h.getValue() === MEMBER_MEAL_HEADER;
}

/** Admin: nyalakan/matikan reminder makan satu klien. @returns {{id:string, mealReminder:boolean}} */
function setMemberMealReminder(token, memberId, aktif) {
  requireAdmin_(token);
  var on = _parseMealFlag_(aktif);
  var id = String(memberId == null ? '' : memberId).trim();
  if (!id) throw new Error('Klien tidak ditemukan');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    var sheet = _getMemberDataSheet_();
    if (!_ensureMealCol_(sheet)) throw new Error('Kolom O di MemberData sudah dipakai untuk hal lain. Kosongkan/ganti dulu.');
    var ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    for (var i = 1; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) {
        sheet.getRange(i + 1, MEMBER_MEAL_COL).setValue(on ? 'ya' : 'tidak');
        return { id: id, mealReminder: on };
      }
    }
    throw new Error('Klien tidak ditemukan');
  } finally {
    lock.releaseLock();
  }
}

/** Tes T-73 (murni, tanpa sheet). Jalankan dari editor. */
function testMealToggle() {
  var fails = [];
  var eq = function(l, a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(l + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  var thr = function(l, v) { try { _parseMealFlag_(v); fails.push(l + ': tidak melempar'); } catch (e) {} };
  eq('kosong = aktif', _mealOnFrom_(''), true);
  eq('undefined (kolom belum ada) = aktif', _mealOnFrom_(undefined), true);
  eq('null = aktif', _mealOnFrom_(null), true);
  eq("'ya' = aktif", _mealOnFrom_('ya'), true);
  eq("'tidak' = nonaktif", _mealOnFrom_('tidak'), false);
  eq("' Tidak ' = nonaktif", _mealOnFrom_(' Tidak '), false);
  eq('teks lain = aktif', _mealOnFrom_('mungkin'), true);
  eq('true', _parseMealFlag_(true), true);
  eq("'false'", _parseMealFlag_('false'), false);
  eq("'ya'", _parseMealFlag_('ya'), true);
  thr('kosong', ''); thr('null', null); thr('angka 1', 1); thr('objek', {});
  // _buildClientPools_ membawa mealOn dari kolom O (indeks 14).
  var row = function(id, o) { var r = [id, 'N' + id, '08123456789', '', '', '', 'PKG', '', 5, 0, 'C1', '', '', '']; r[14] = o; return r; };
  var p = _buildClientPools_([row('A', 'tidak'), row('B', 'ya'), row('C', undefined)], [], new Date(2026, 8, 28));
  eq('mealOn per klien', p.active.map(function(c) { return c.mealOn; }), [false, true, true]);
  // Penjaga akses: token sampah ditolak sebelum menyentuh sheet.
  try { setMemberMealReminder('bukan-token', 'A', true); fails.push('token sampah: tidak ditolak'); }
  catch (e) { if (String(e.message || e).indexOf(AUTH_ERROR_PREFIX) !== 0) fails.push('token sampah: bukan error auth: ' + e); }
  fails.forEach(function(f) { Logger.log('❌ ' + f); });
  Logger.log(fails.length ? '— GAGAL ' + fails.length + ' —' : '— testMealToggle 15/15 lulus —');
  if (fails.length) throw new Error('T-73 GAGAL: ' + fails[0]);
}


// ##############################################################################
// BAGIAN: T-74 Kartu "Makan hari ini" di portal klien
// ##############################################################################

// =============================================================================
// T-74: getMyMealToday(memberToken) — dibaca kartu "Makan hari ini" di Dashboardku
// portal. Hanya untuk klien itu sendiri (requireMember_). Isi: tip makan pagi & sore
// hari ini (rotasi T-70, tanggal WIB) bila klien berpaket core; klien non-core
// mendapat {core:false} dan kartu tidak ditampilkan. Tanpa tip aktif → '' (kartu
// menampilkan keadaan kosong). Tidak ada angka kalori/berat; teks tip datang apa adanya
// dari sheet MealTips (baris Aktif='ya' yang disetujui Coach, T-75).
// Kartu tidak bergantung pada saklar reminder (T-73): saklar hanya mengatur digest ke Coach.
// =============================================================================

/** Murni: paket `packageId` berkategori core di daftar packages ({id, kategori})? */
function _isCorePackage_(packageId, packages) {
  var pid = String(packageId == null ? '' : packageId).trim();
  if (!pid) return false;
  return (packages || []).some(function(p) {
    return p && String(p.id == null ? '' : p.id).trim() === pid &&
      String(p.kategori == null ? '' : p.kategori).trim().toLowerCase() === CORE_CATEGORY;
  });
}

/** Murni: bentuk respons. Non-core → hanya {core:false} (tip tidak bocor). */
function _mealTodayFor_(isCore, tipPagi, tipSore, tanggal) {
  if (!isCore) return { core: false };
  return { core: true, date: String(tanggal || ''), pagi: String(tipPagi || ''), sore: String(tipSore || '') };
}

/** @returns {{core:boolean, date?:string, pagi?:string, sore?:string}} */
function getMyMealToday(memberToken) {
  var row = requireMember_(memberToken).row;
  var core = _isCorePackage_(row[6], getPriceList());
  if (!core) return _mealTodayFor_(false);
  var date = _wibParts_(new Date()).date;
  return _mealTodayFor_(true, _pickTip_('pagi', date), _pickTip_('sore', date), date);
}

/** Tes T-74 (murni + penjaga akses, tanpa menulis apa pun). Jalankan dari editor. */
function testMealToday() {
  var fails = [];
  var eq = function(l, a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(l + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  var pk = [{ id: 'P1', kategori: 'core' }, { id: 'P2', kategori: 'reguler' }, { id: 7, kategori: ' CORE ' }, null];
  eq('P1 core', _isCorePackage_('P1', pk), true);
  eq('P2 bukan core', _isCorePackage_('P2', pk), false);
  eq('ID angka cocok string', _isCorePackage_('7', pk), true);
  eq('spasi di ID', _isCorePackage_(' P1 ', pk), true);
  eq('tanpa paket', _isCorePackage_('', pk), false);
  eq('paket tak dikenal', _isCorePackage_('P9', pk), false);
  eq('packages null', _isCorePackage_('P1', null), false);
  eq('non-core tidak membawa tip', _mealTodayFor_(false, 'rahasia', 'rahasia', '2026-09-28'), { core: false });
  eq('core membawa tip', _mealTodayFor_(true, 'A', 'B', '2026-09-28'), { core: true, date: '2026-09-28', pagi: 'A', sore: 'B' });
  eq('core tanpa tip → kosong', _mealTodayFor_(true, null, undefined, '2026-09-28'), { core: true, date: '2026-09-28', pagi: '', sore: '' });
  [undefined, null, '', 'bukan-token'].forEach(function(t, i) {
    try { getMyMealToday(t); fails.push('token #' + i + ': tidak ditolak'); }
    catch (e) { if (String(e.message || e).indexOf(AUTH_ERROR_PREFIX) !== 0) fails.push('token #' + i + ': bukan error auth: ' + e); }
  });
  try { getMyMealToday(_issueToken_({ r: 'admin', v: 'x', exp: Date.now() + 60000 })); fails.push('token admin di fungsi klien: tidak ditolak'); }
  catch (e) { if (String(e.message || e).indexOf(AUTH_ERROR_PREFIX) !== 0) fails.push('token admin: bukan error auth: ' + e); }
  fails.forEach(function(f) { Logger.log('❌ ' + f); });
  Logger.log(fails.length ? '— GAGAL ' + fails.length + ' —' : '— testMealToday 15/15 lulus —');
  if (fails.length) throw new Error('T-74 GAGAL: ' + fails[0]);
}