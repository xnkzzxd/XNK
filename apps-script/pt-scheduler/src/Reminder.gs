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
var TELEGRAM_BUTTON_TEXT_MAX = 30;      // T-121: label tombol muat satu baris di HP

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

  var active = [], bookable = [], skipped = 0, skippedNames = [];
  (members || []).forEach(function(row) {
    if (!row || !row[0]) return;
    var total = parseInt(row[8], 10); if (isNaN(total)) total = 10;   // sama dengan profil klien
    var used = parseInt(row[9], 10) || 0;
    var remaining = total - used;
    if (remaining <= 0) return;
    var phone = _rmdNormalizePhone_(row[2]);
    if (!phone) { skipped++; skippedNames.push(String(row[1] || '').trim()); return; }
    var id = String(row[0]).trim();
    var c = {
      id: id, name: String(row[1] || '').trim(), phone: phone, mealOn: _mealOnFrom_(row[14]),
      remaining: remaining, upcoming: upcoming[id] || 0,
      slots: remaining - (upcoming[id] || 0),
      packageId: String(row[6] || ''), coachId: String(row[10] || ''),
      off: _rmdOffFrom_(row[15])                       // T-123: jenis pengingat yang dimatikan untuk klien ini (kolom P)
    };
    active.push(c);
    if (c.slots > 0) bookable.push(c);
  });
  return { active: active, bookable: bookable, skipped: skipped, skippedNames: skippedNames };
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
      defaultHour: j.hour,
      tpl: String(props.getProperty('RMD_TPL_' + k) || ''),          // T-124: kosong = pakai bawaan
      tplDefault: RMD_TPL_DEFAULT[j.jenis] || '',
      placeholders: RMD_PLACEHOLDERS[j.jenis] || []
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
      if (has(job, 'tpl')) {
        var tv = String(job.tpl == null ? '' : job.tpl).trim();
        out['RMD_TPL_' + k] = (tv === '' || tv === RMD_TPL_DEFAULT[jenis]) ? '' : _rmdValidateTpl_(jenis, tv);
      }
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
  { jenis: 'sesi-besok',     day: null, hour: 19, handler: 'sendSesiBesokDigest_' },    // T-122
  { jenis: 'booking-minggu', day: 0,    hour: 17, handler: 'sendBookingMingguDigest_' }, // T-45
  { jenis: 'pr',             day: null, hour: 8,  handler: 'sendPrDigest_' },           // T-46
  // T-72: bawaan MATI (defaultEnabled:false) sampai tip disetujui Coach (T-75) — aktifkan lewat
  // properti RMD_MAKAN_PAGI_ENABLED / RMD_MAKAN_SORE_ENABLED = 'true' (UI menyusul).
  { jenis: 'makan-pagi',     day: null, hour: 6,  handler: 'sendMakanPagiDigest_', defaultEnabled: false },
  { jenis: 'makan-sore',     day: null, hour: 16, handler: 'sendMakanSoreDigest_', defaultEnabled: false },
  // Fase D4: bawaan MATI sampai pemilik menyalakannya di Pengaturan → Pengingat Klien.
  { jenis: 'rekap-bulanan',     day: null, hour: 9,  dayOfMonth: 1, handler: 'sendRekapBulananDigest_', defaultEnabled: false },
  { jenis: 'selamat-milestone', day: null, hour: 18, handler: 'sendMilestoneDigest_', defaultEnabled: false },
  { jenis: 'waktunya-ukur',     day: 1,    hour: 8,  evenWeek: true, handler: 'sendUkurDigest_', defaultEnabled: false }
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
    if (job.dayOfMonth != null && parseInt(String(parts.date).slice(8, 10), 10) !== job.dayOfMonth) return;
    if (job.evenWeek && _weekParity_(parts.date) !== 0) return;
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

/** Hapus trigger runReminderTick lama lalu pasang satu trigger per jam. Kembalikan jumlah duplikat yang dihapus. */
function _installReminderTrigger_() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runReminderTick') { ScriptApp.deleteTrigger(t); removed++; }
  });
  ScriptApp.newTrigger('runReminderTick').timeBased().everyHours(1).inTimezone(REMINDER_TZ).create();
  return removed;
}

/** Pemilik, dari editor: pasang trigger pengingat. */
function setupReminderTrigger() {
  requireOwner_();
  var removed = _installReminderTrigger_();
  Logger.log('Trigger runReminderTick dipasang (' + removed + ' duplikat dihapus). Aktifkan dengan properti RMD_ENABLED=true.');
}

/** Status pengingat untuk Pengaturan: trigger terpasang? kapan tick terakhir? Telegram siap? */
function getReminderStatus(token) {
  requireAdmin_(token);
  var props = PropertiesService.getScriptProperties();
  var installed = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'runReminderTick'; }).length;
  var last = parseInt(props.getProperty('RMD_LAST_tick'), 10);
  return {
    triggerInstalled: installed > 0,
    tickEveryMinutes: 60,
    lastTickAt: isNaN(last) ? '' : new Date(last).toISOString(),
    telegramReady: _telegramReady_(),
    enabled: props.getProperty('RMD_ENABLED') === 'true'
  };
}

/** Pasang trigger pengingat dari panel (aplikasi berjalan sebagai pemilik). */
function installReminderTrigger(token) {
  requireAdmin_(token);
  _installReminderTrigger_();
  return getReminderStatus(token);
}

/**
 * Riwayat pengingat terbaru (paling baru dulu). Nomor telepon tidak ikut; target klien
 * ditampilkan sebagai nama. opts: { onlyFailed: boolean, limit: 1..200 (bawaan 50) }.
 */
function getReminderLog(token, opts) {
  requireAdmin_(token);
  opts = opts || {};
  var limit = parseInt(opts.limit, 10);
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;
  var sheet = _reminderLogSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, 6).getValues();
  var names = null;
  var out = [];
  for (var i = rows.length - 1; i >= 0 && out.length < limit; i--) {
    var r = rows[i];
    if (opts.onlyFailed && String(r[5]) !== 'gagal') continue;
    var target = String(r[3] || '*');
    var label = 'Semua';
    if (target !== '*') {
      if (!names) {
        names = {};
        _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(m) { if (m[0]) names[String(m[0]).trim()] = String(m[1] || '').trim(); });
      }
      label = names[target] || 'Klien dihapus';
    }
    out.push({ jenis: String(r[1]), slot: String(r[2]), target: label, waktu: String(r[4]), hasil: String(r[5]) });
  }
  return out;
}

/** Tes murni tanpa efek samping (T-60 akan memperluas). Lempar error bila gagal. */


// ##############################################################################
// BAGIAN: T-120…T-125 Pesan siap kirim ke klien (lewat tombol WhatsApp di Telegram)
// ##############################################################################
// Telegram Coach menerima SATU pesan ringkas per jenis; tiap klien = satu tombol yang
// membuka WhatsApp ke klien itu dengan teks yang SUDAH ditulis untuk klien. Tidak ada
// pengiriman otomatis ke klien: Coach menekan tombol lalu Kirim di WhatsApp.

var RMD_MSG_MAX = 600;            // panjang template pesan
var RMD_CLIENT_TEXT_MAX = 900;    // batas keras teks yang masuk link wa.me
var RMD_TPL_DEFAULT = {
  'sesi-besok': 'Hai {nama}, pengingat sesi besok jam {jam} {coach}.{tidur}\n\nSampai ketemu! 💪',
  'booking-minggu': 'Halo {nama}, minggu ini masih ada slot latihan kosong:\n{slot}\nMau booking yang mana? 💪',
  'pr': 'Halo {nama}, pengingat PR kamu:\n{pr}\nSemangat, kamu pasti bisa! 💪',
  'makan-pagi': 'Halo {nama}, pengingat makan pagi:\n{tip}\nSemangat! 💪',
  'makan-sore': 'Halo {nama}, pengingat makan sore:\n{tip}\nSemangat! 💪',
  'rekap-bulanan': 'Halo {nama}, rekap latihan bulan {bulan}:\n💪 {sesi} sesi latihan{berat}{pinggang}{streak}\n\nLihat progresmu di {link}\nTerus semangat!',
  'selamat-milestone': 'Selamat {nama}! 🎉 Kamu baru meraih badge {badge}.\nBangga banget sama progresmu, terus semangat! 💪',
  'waktunya-ukur': 'Halo {nama}, waktunya catat progres! Timbang berat dan ukur lingkar pinggang ya.{terakhir}\nCatat di {link} (Beranda → Progres).'
};
var RMD_PLACEHOLDERS = {
  'sesi-besok': ['nama', 'jam', 'coach', 'tidur'],
  'booking-minggu': ['nama', 'slot'],
  'pr': ['nama', 'pr'],
  'makan-pagi': ['nama', 'tip'],
  'makan-sore': ['nama', 'tip'],
  'rekap-bulanan': ['nama', 'bulan', 'sesi', 'berat', 'pinggang', 'streak', 'link'],
  'selamat-milestone': ['nama', 'badge'],
  'waktunya-ukur': ['nama', 'terakhir', 'link']
};
var MEMBER_REMIND_OFF_COL = 16;                            // Kolom P (1-based)
var MEMBER_REMIND_OFF_HEADER = 'Pengingat Nonaktif';
var RMD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Template aktif untuk satu jenis: properti RMD_TPL_<JENIS> bila diisi, kalau tidak bawaan. */
function _rmdTemplate_(jenis) {
  var custom = String(PropertiesService.getScriptProperties().getProperty('RMD_TPL_' + _rmdJobKey_(jenis)) || '').trim();
  return custom || RMD_TPL_DEFAULT[jenis] || '';
}

/** Murni: isi placeholder {nama}… lalu rapikan spasi. Placeholder tak dikenal dibiarkan apa adanya. */
function _rmdFill_(tpl, vars) {
  var out = String(tpl == null ? '' : tpl).replace(/\{([a-z]+)\}/g, function(m, k) {
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
  });
  out = out.replace(/[ \t]+([.,!?;:])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (out.length > RMD_CLIENT_TEXT_MAX) out = out.slice(0, RMD_CLIENT_TEXT_MAX - 1) + '…';
  return out;
}

/** Murni: validasi template. Lempar error Indonesia; kembalikan teks yang sudah dipangkas. */
function _rmdValidateTpl_(jenis, text) {
  var allowed = RMD_PLACEHOLDERS[jenis];
  if (!allowed) throw new Error('Jenis pengingat ini tidak punya template pesan.');
  var t = String(text == null ? '' : text).trim();
  if (t.length > RMD_MSG_MAX) throw new Error('Pesan maksimal ' + RMD_MSG_MAX + ' karakter.');
  var bad = null;
  var rest = t.replace(/\{([a-z]*)\}/g, function(m, k) {
    if (allowed.indexOf(k) < 0 && bad === null) bad = m;
    return '';
  });
  if (bad) throw new Error('Placeholder ' + bad + ' tidak dikenal. Yang boleh: ' + allowed.map(function(k) { return '{' + k + '}'; }).join(', ') + '.');
  if (/[{}]/.test(rest)) throw new Error('Tanda { } hanya untuk placeholder, misalnya {nama}.');
  return t;
}

/** Murni: kolom P → daftar jenis yang dimatikan. */
function _rmdOffFrom_(cell) {
  return String(cell == null ? '' : cell).split(',').map(function(x) { return x.trim().toLowerCase(); }).filter(String);
}
function _rmdIsOff_(client, jenis) { return ((client && client.off) || []).indexOf(jenis) !== -1; }

/** Murni: label tombol "Nama · fakta" maksimal TELEGRAM_BUTTON_TEXT_MAX karakter; fakta dipertahankan, nama dipotong. */
function _rmdButtonLabel_(name, fact) {
  var max = TELEGRAM_BUTTON_TEXT_MAX;
  var n = String(name == null ? '' : name).trim(), f = String(fact == null ? '' : fact).trim();
  if (!f) return n.length > max ? n.slice(0, max - 1) + '…' : n;
  var suffix = ' · ' + f;
  if ((n + suffix).length <= max) return n + suffix;
  var room = max - suffix.length;
  if (room >= 3) return n.slice(0, room - 1) + '…' + suffix;
  return (n + suffix).slice(0, max - 1) + '…';
}

/** 'YYYY-MM-DD' → 'Rabu 1 Okt'. */
function _rmdDateLabel_(dateStr) {
  var p = String(dateStr).split('-');
  var d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  return BOOKING_DAY_NAMES[d.getUTCDay()] + ' ' + parseInt(p[2], 10) + ' ' + RMD_MONTHS[parseInt(p[1], 10) - 1];
}

/**
 * Murni: pesan Telegram untuk Coach + tombol. items = [{name, phone (62…), fact, text}].
 * Header pendek untuk Coach; teks untuk klien hanya ada di dalam link tombol.
 */
function _rmdDigestMessage_(title, dateLabel, items, noPhoneNames) {
  var text = '🔔 <b>' + _escHtml_(title) + '</b> · ' + _escHtml_(dateLabel) + ' · ' + items.length + ' klien\n' +
    'Tekan nama → WhatsApp terbuka dengan pesan siap kirim.';
  if (noPhoneNames && noPhoneNames.length) {
    text += '\n📵 Tanpa nomor: ' + noPhoneNames.slice(0, 8).map(_escHtml_).join(', ') +
      (noPhoneNames.length > 8 ? ' dan ' + (noPhoneNames.length - 8) + ' lainnya' : '');
  }
  var buttons = items.map(function(it) { return { text: _rmdButtonLabel_(it.name, it.fact), url: _waLink_(it.phone, it.text) }; });
  return { text: text, buttons: buttons };
}

/** Kirim digest. Tanpa penerima = tidak ada pesan, dianggap selesai. @returns {boolean} true = selesai. */
function _rmdSendDigest_(title, dateLabel, items, noPhoneNames) {
  if (!items.length) { Logger.log(title + ': tidak ada penerima, tidak ada yang dikirim.'); return true; }
  var m = _rmdDigestMessage_(title, dateLabel, items, noPhoneNames);
  var r = kirimTelegramTombol_(m.text, m.buttons);
  Logger.log(title + ': ' + JSON.stringify(r));
  return !r.skipped && r.sent > 0 && r.failed === 0;
}

/** Job aktif sekarang? (saklar utama + saklar jenis). */
function _rmdJobActive_(jenis) {
  return PropertiesService.getScriptProperties().getProperty('RMD_ENABLED') === 'true' && _rmdJobEnabled_(jenis);
}

/** Contoh isi placeholder untuk pratinjau di Pengaturan (memakai kalimat tidur asli bila sudah diisi). */
function _rmdSampleVars_(jenis) {
  var sleep = String(PropertiesService.getScriptProperties().getProperty('RMD_TPL_SLEEP') || '').trim();
  var v = { nama: 'Budi' };
  if (jenis === 'sesi-besok') { v.jam = '07:00'; v.coach = 'dengan Coach Dika'; v.tidur = '\n\n😴 ' + (sleep || 'Tidur cukup malam ini ya.'); }
  else if (jenis === 'booking-minggu') v.slot = '• Rabu 1/10 07:00\n• Rabu 1/10 08:00\n• Kamis 2/10 17:00';
  else if (jenis === 'rekap-bulanan') { v.bulan = 'September'; v.sesi = '8'; v.berat = '\n⚖️ Berat −2,1 kg'; v.pinggang = '\n📏 Pinggang −3 cm'; v.streak = '\n🔥 Streak 5 minggu'; v.link = RMD_PORTAL_URL; }
  else if (jenis === 'selamat-milestone') v.badge = '25 sesi';
  else if (jenis === 'waktunya-ukur') { v.terakhir = ' Terakhir kamu catat tanggal 12 Sep.'; v.link = RMD_PORTAL_URL; }
  else if (jenis === 'pr') v.pr = '• Latihan mobilitas (telat, tenggat 28/9)\n• Catat makan 3 hari (tenggat 2/10)';
  else v.tip = 'Sarapan telur dan oatmeal, minum air putih dulu.';
  return v;
}

/** Admin: pratinjau teks klien dari template (kosong = bawaan) dengan contoh data. */
function previewReminderText(token, jenis, tpl) {
  requireAdmin_(token);
  var j = String(jenis == null ? '' : jenis).trim();
  if (!RMD_PLACEHOLDERS[j]) throw new Error('Jenis pengingat ini tidak punya template pesan.');
  var t = String(tpl == null ? '' : tpl).trim() === '' ? RMD_TPL_DEFAULT[j] : _rmdValidateTpl_(j, tpl);
  return { text: _rmdFill_(t, _rmdSampleVars_(j)) };
}

/** Tulis header P1 bila masih kosong (tidak menimpa kolom buatan sendiri). */
function _ensureRemindOffCol_(sheet) {
  var h = sheet.getRange(1, MEMBER_REMIND_OFF_COL);
  if (h.getValue() === '') { h.setValue(MEMBER_REMIND_OFF_HEADER); h.setFontWeight('bold'); }
  return h.getValue() === MEMBER_REMIND_OFF_HEADER;
}

/** Admin: jenis pengingat yang dimatikan untuk satu klien. prefs = { off: ['pr', 'booking-minggu'] }. */
function setMemberReminderPrefs(token, memberId, prefs) {
  requireAdmin_(token);
  var id = String(memberId == null ? '' : memberId).trim();
  if (!id) throw new Error('Klien tidak ditemukan');
  var known = REMINDER_JOBS.map(function(j) { return j.jenis; });
  var off = (prefs && Array.isArray(prefs.off)) ? prefs.off : null;
  if (!off) throw new Error('Pengaturan pengingat klien tidak valid.');
  var clean = [];
  off.forEach(function(x) {
    var k = String(x == null ? '' : x).trim().toLowerCase();
    if (known.indexOf(k) < 0) throw new Error('Jenis pengingat tidak dikenal: ' + k + '.');
    if (clean.indexOf(k) < 0) clean.push(k);
  });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    var sheet = _getMemberDataSheet_();
    if (!_ensureRemindOffCol_(sheet)) throw new Error('Kolom P di MemberData sudah dipakai untuk hal lain. Kosongkan/ganti dulu.');
    var ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    for (var i = 1; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) {
        sheet.getRange(i + 1, MEMBER_REMIND_OFF_COL).setValue(clean.join(','));
        return { id: id, reminderOff: clean };
      }
    }
    throw new Error('Klien tidak ditemukan');
  } finally {
    lock.releaseLock();
  }
}

/** Indeks klien untuk pengingat sesi: { id: {id, name, phone (62… atau null), off} }. */
function _rmdMemberIndex_() {
  var idx = {};
  _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(row) {
    if (!row || !row[0]) return;
    var id = String(row[0]).trim();
    idx[id] = { id: id, name: String(row[1] || '').trim(), phone: _rmdNormalizePhone_(row[2]), off: _rmdOffFrom_(row[15]) };
  });
  return idx;
}

/**
 * Handler 'sesi-besok' (T-122): satu tombol per klien yang punya sesi besok.
 * Jam & coach dari jadwal; kalimat tidur (RMD_TPL_SLEEP) ikut di dalam pesan klien.
 */
function sendSesiBesokDigest_(ctx) {
  var now = (ctx && ctx.now) || new Date();
  var tomorrow = _wibParts_(new Date(now.getTime() + 86400000)).date;
  var groups = {}, order = [];
  _getSchedulesAll_().forEach(function(s) {
    var st = String(s.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'completed') return;
    var d = new Date(s.start);
    if (isNaN(d.getTime()) || _wibParts_(d).date !== tomorrow) return;
    var key = String(s.memberId).trim() || ('tel:' + s.phone);
    if (!groups[key]) { groups[key] = { key: key, title: s.title, phone: s.phone, coach: s.coachName || '', times: [], t0: d.getTime() }; order.push(key); }
    groups[key].times.push({ t: d.getTime(), label: Utilities.formatDate(d, REMINDER_TZ, 'HH:mm') });
    if (!groups[key].coach && s.coachName) groups[key].coach = s.coachName;
  });
  if (!order.length) { Logger.log('Sesi besok: tidak ada sesi besok.'); return true; }

  var members = _rmdMemberIndex_();
  var sleep = String(PropertiesService.getScriptProperties().getProperty('RMD_TPL_SLEEP') || '').trim();
  var tpl = _rmdTemplate_('sesi-besok');
  var groupsSorted = order.map(function(k) { return groups[k]; }).sort(function(a, b) { return a.t0 - b.t0; });
  var items = [], noPhone = [];
  groupsSorted.forEach(function(g) {
    var m = members[g.key];
    var name = (m && m.name) || String(g.title || '').trim() || 'Klien';
    if (m && _rmdIsOff_(m, 'sesi-besok')) return;
    var phone = m ? m.phone : _rmdNormalizePhone_(g.phone);
    if (!phone) { noPhone.push(name); return; }
    g.times.sort(function(a, b) { return a.t - b.t; });
    var jam = g.times.map(function(x) { return x.label; }).join(' dan ');
    items.push({
      name: name, phone: phone, fact: g.times[0].label,
      text: _rmdFill_(tpl, { nama: name, jam: jam, coach: g.coach ? 'dengan Coach ' + g.coach : '', tidur: sleep ? '\n\n😴 ' + sleep : '' })
    });
  });
  return _rmdSendDigest_('Sesi besok', _rmdDateLabel_(tomorrow), items, noPhone);
}

// ##############################################################################
// BAGIAN: D4 Rekap bulanan, Selamat milestone, Waktunya ukur
// ##############################################################################
// Sama seperti jenis lain: satu pesan Telegram ke Coach, satu tombol WhatsApp per klien dengan
// pesan yang sudah ditulis untuk klien. Data dari Progress (Kode.gs), jadwal selesai, badge.

var RMD_PORTAL_URL = 'https://book.xnkbooking.my.id';
var RMD_MONTHS_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var MEMBER_BADGE_GIVEN_COL = 18;            // Kolom R "Badge Diselamati" (1-based)
var MEMBER_BADGE_GIVEN_HEADER = 'Badge Diselamati';
var UKUR_EVERY_DAYS = 14;
var MILESTONE_RECENT_DAYS = 14;             // hanya klien yang masih aktif berlatih yang diselamati

/** Murni: 0 atau 1, berganti tiap minggu (Senin–Minggu), dihitung sejak Senin 5 Jan 2026. Minggu genap (0) = jadwal "tiap dua minggu". */
function _weekParity_(iso) {
  var a = _weekStart_(iso).split('-'), b = [2026, 1, 5];
  var weeks = Math.round((Date.UTC(+a[0], +a[1] - 1, +a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2;
}

/** Murni: bulan sebelum tanggal ini → { from, to, label } */
function _prevMonthRange_(todayIso) {
  var p = String(todayIso).split('-').map(Number), y = p[0], m = p[1] - 1;
  if (m === 0) { m = 12; y--; }
  var pad = function(n) { return ('0' + n).slice(-2); };
  var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: y + '-' + pad(m) + '-01', to: y + '-' + pad(m) + '-' + pad(last), label: RMD_MONTHS_FULL[m - 1] };
}

function _daysBetween_(fromIso, toIso) {
  var a = String(fromIso).split('-'), b = String(toIso).split('-');
  return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
}

/** Murni: 72.4 → "72,4"; -2.1 → "−2,1"; tanda plus untuk naik. */
function _rmdSigned_(v) {
  var n = Math.round(Math.abs(v) * 10) / 10, t = String(n).replace('.', ',');
  if (n === 0) return '0';
  return v < 0 ? '−' + t : (v > 0 ? '+' + t : t);
}

/**
 * Murni: perubahan satu ukuran selama satu bulan. Pembanding = catatan terakhir SEBELUM bulan itu, atau catatan
 * pertama di bulan itu kalau belum ada. null kalau kurang dari dua titik data.
 */
function _monthChange_(entries, key, from, to) {
  var pts = (entries || []).filter(function(e) { return e[key] !== '' && e[key] != null; });
  var inMonth = pts.filter(function(e) { return e.tanggal >= from && e.tanggal <= to; });
  if (!inMonth.length) return null;
  var before = pts.filter(function(e) { return e.tanggal < from; });
  var base = before.length ? before[before.length - 1] : inMonth[0];
  var last = inMonth[inMonth.length - 1];
  if (base === last) return null;
  return Math.round((last[key] - base[key]) * 10) / 10;
}

/** Satu kali baca sheet Progress → { memberId: [entri urut tanggal] }. */
function _progressByMember_() {
  var out = {};
  _progressSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    if (!r[0]) return;
    var id = String(r[1]).trim();
    (out[id] = out[id] || []).push({ tanggal: String(r[2]), berat: r[3] === '' ? '' : Number(r[3]), pinggang: r[4] === '' ? '' : Number(r[4]) });
  });
  Object.keys(out).forEach(function(k) { out[k].sort(function(a, b) { return a.tanggal < b.tanggal ? -1 : (a.tanggal > b.tanggal ? 1 : 0); }); });
  return out;
}

/** Handler 'rekap-bulanan': tiap tanggal 1, klien yang latihan atau mencatat progres bulan lalu. */
function sendRekapBulananDigest_(ctx) {
  var now = (ctx && ctx.now) || new Date();
  var today = _wibParts_(now).date, range = _prevMonthRange_(today);
  var schedules = _getSchedulesAll_(), members = _rmdMemberIndex_(), byMember = _progressByMember_();
  var sessions = {};
  schedules.forEach(function(sc) {
    if (String(sc.status || '').toLowerCase() !== 'completed') return;
    var d = new Date(sc.start);
    if (isNaN(d.getTime())) return;
    var day = Utilities.formatDate(d, REMINDER_TZ, 'yyyy-MM-dd');
    if (day < range.from || day > range.to) return;
    var id = String(sc.memberId).trim();
    sessions[id] = (sessions[id] || 0) + 1;
  });
  var tpl = _rmdTemplate_('rekap-bulanan'), items = [], noPhone = [];
  Object.keys(members).map(function(k) { return members[k]; }).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(m) {
    var entries = byMember[m.id] || [];
    var n = sessions[m.id] || 0;
    var hasEntry = entries.some(function(e) { return e.tanggal >= range.from && e.tanggal <= range.to; });
    if (!n && !hasEntry) return;
    if (_rmdIsOff_(m, 'rekap-bulanan')) return;
    if (!m.phone) { noPhone.push(m.name); return; }
    var db = _monthChange_(entries, 'berat', range.from, range.to), dp = _monthChange_(entries, 'pinggang', range.from, range.to);
    var streak = _streak_(_completedWeeks_(schedules, m.id).weeks, today);
    items.push({
      name: m.name, phone: m.phone, fact: n + ' sesi',
      text: _rmdFill_(tpl, {
        nama: m.name, bulan: range.label, sesi: n,
        berat: db === null ? '' : '\n⚖️ Berat ' + (db === 0 ? 'tetap' : _rmdSigned_(db) + ' kg'),
        pinggang: dp === null ? '' : '\n📏 Pinggang ' + (dp === 0 ? 'tetap' : _rmdSigned_(dp) + ' cm'),
        streak: streak >= 2 ? '\n🔥 Streak ' + streak + ' minggu' : '',
        link: RMD_PORTAL_URL
      })
    });
  });
  return _rmdSendDigest_('Rekap bulanan', range.label, items, noPhone);
}

/** Tulis "sudah diselamati" di kolom R. Tanpa lock sendiri: dipanggil dari runReminderTick yang sudah memegang lock skrip. */
function _rmdMarkBadgesGiven_(map) {
  var ids = Object.keys(map);
  if (!ids.length) return;
  var sheet = _getMemberDataSheet_();
  var head = sheet.getRange(1, MEMBER_BADGE_GIVEN_COL);
  if (head.getValue() === '') { head.setValue(MEMBER_BADGE_GIVEN_HEADER); head.setFontWeight('bold'); }
  else if (head.getValue() !== MEMBER_BADGE_GIVEN_HEADER) throw new Error('Kolom R di MemberData sudah dipakai untuk hal lain. Kosongkan/ganti dulu.');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!map[id]) continue;
    var cur = _rmdOffFrom_(data[i][MEMBER_BADGE_GIVEN_COL - 1]);
    map[id].forEach(function(b) { if (cur.indexOf(b) === -1) cur.push(b); });
    sheet.getRange(i + 1, MEMBER_BADGE_GIVEN_COL).setValue(cur.join(','));
  }
}

/** Murni: dari daftar badge baru, yang tertinggi per jenis (sesi / streak). */
function _highestFreshBadges_(fresh) {
  var best = {};
  fresh.forEach(function(b) { if (!best[b.kind] || b.need > best[b.kind].need) best[b.kind] = b; });
  return Object.keys(best).map(function(k) { return best[k]; });
}

/**
 * Handler 'selamat-milestone': klien yang meraih badge dan belum diselamati (kolom R).
 * Hanya badge tertinggi per jenis yang disebut; yang lebih rendah ikut ditandai. Klien yang sudah lama
 * tidak berlatih ditandai diam-diam (bukan diselamati). Penandaan baru ditulis SETELAH Telegram terkirim.
 */
function sendMilestoneDigest_(ctx) {
  var now = (ctx && ctx.now) || new Date();
  var isTest = !!(ctx && ctx.slot === 'tes');
  var today = _wibParts_(now).date, since = _addDaysIso_(today, -MILESTONE_RECENT_DAYS);
  var schedules = _getSchedulesAll_();
  var data = _getMemberDataSheet_().getDataRange().getValues().slice(1);
  var tpl = _rmdTemplate_('selamat-milestone'), items = [], noPhone = [], toMark = {};
  data.forEach(function(row) {
    if (!row || !row[0]) return;
    var id = String(row[0]).trim(), given = _rmdOffFrom_(row[MEMBER_BADGE_GIVEN_COL - 1]);
    var cw = _completedWeeks_(schedules, id);
    var fresh = _badges_(cw.completed, _bestStreak_(cw.weeks)).filter(function(b) { return b.earned && given.indexOf(b.id) === -1; });
    if (!fresh.length) return;
    toMark[id] = fresh.map(function(b) { return b.id; });
    var lastDay = '';
    schedules.forEach(function(sc) {
      if (String(sc.memberId).trim() !== id || String(sc.status || '').toLowerCase() !== 'completed') return;
      var d = new Date(sc.start);
      if (isNaN(d.getTime())) return;
      var day = Utilities.formatDate(d, REMINDER_TZ, 'yyyy-MM-dd');
      if (day > lastDay) lastDay = day;
    });
    if (!lastDay || lastDay < since) return;                      // lama tidak berlatih: tandai diam-diam
    var member = { id: id, name: String(row[1] || '').trim(), phone: _rmdNormalizePhone_(row[2]), off: _rmdOffFrom_(row[15]) };
    if (_rmdIsOff_(member, 'selamat-milestone')) return;
    if (!member.phone) { noPhone.push(member.name); return; }
    var top = _highestFreshBadges_(fresh);
    items.push({
      name: member.name, phone: member.phone, fact: top[0].label.replace(' berturut-turut', ''),
      text: _rmdFill_(tpl, { nama: member.name, badge: top.map(function(b) { return b.label; }).join(' dan ') })
    });
  });
  var ok = _rmdSendDigest_('Selamat milestone', _rmdDateLabel_(today), items, noPhone);
  if (ok && !isTest) _rmdMarkBadgesGiven_(toMark);
  return ok;
}

/** Handler 'waktunya-ukur': klien aktif yang catatan terakhirnya 14+ hari lalu (atau belum pernah). */
function sendUkurDigest_(ctx) {
  var now = (ctx && ctx.now) || new Date();
  var today = _wibParts_(now).date;
  var pools = _loadClientPools_(), byMember = _progressByMember_();
  var tpl = _rmdTemplate_('waktunya-ukur'), items = [];
  pools.active.filter(function(c) { return !_rmdIsOff_(c, 'waktunya-ukur'); }).forEach(function(c) {
    var list = byMember[c.id] || [];
    var last = list.length ? list[list.length - 1].tanggal : '';
    var days = last ? _daysBetween_(last, today) : null;
    if (last && days < UKUR_EVERY_DAYS) return;
    var dm = last ? last.split('-') : null;
    items.push({
      name: c.name, phone: c.phone, fact: last ? days + ' hari' : 'baru',
      text: _rmdFill_(tpl, { nama: c.name, link: RMD_PORTAL_URL, terakhir: last ? ' Terakhir kamu catat tanggal ' + parseInt(dm[2], 10) + ' ' + RMD_MONTHS[parseInt(dm[1], 10) - 1] + '.' : '' })
    });
  });
  return _rmdSendDigest_('Waktunya ukur', _rmdDateLabel_(today), items, pools.skippedNames);
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

/**
 * Handler REMINDER_JOBS 'booking-minggu'. ctx = {slot, now}.
 * @returns {boolean} true = selesai (terkirim, atau memang tidak ada yang perlu dikirim);
 *                    false = Telegram dilewati/gagal → dicatat 'gagal', dicoba lagi di tick berikut.
 */
function sendBookingMingguDigest_(ctx) {
  var now = (ctx && ctx.now) || new Date();
  var pools = _loadClientPools_();
  var clients = pools.bookable.filter(function(c) { return !_rmdIsOff_(c, 'booking-minggu'); });
  if (!clients.length) { Logger.log('Booking Minggu: tidak ada klien yang bisa booking.'); return true; }

  var slots = _nearestFreeSlots_(_getSchedulesAll_(), now, BOOKING_MAX_SLOTS, _businessHours_(), BOOKING_LOOKAHEAD_DAYS);
  if (!slots.length) { Logger.log('Booking Minggu: tidak ada slot kosong.'); return true; }

  var slotText = slots.map(function(s) { return '• ' + s.label; }).join('\n');
  var tpl = _rmdTemplate_('booking-minggu');
  var items = clients.map(function(c) {
    return { name: c.name, phone: c.phone, fact: 'sisa ' + c.slots, text: _rmdFill_(tpl, { nama: c.name, slot: slotText }) };
  });
  return _rmdSendDigest_('Booking minggu', _rmdDateLabel_(_wibParts_(now).date), items, pools.skippedNames);
}

/** Tes murni (tanpa sheet/Telegram). Lempar error bila gagal. */


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

/** Isi placeholder {pr}: daftar judul PR klien (maks PR_DIGEST_MAX_TITLES). */
function _prItemsText_(e) {
  var all = e.late.concat(e.today, e.tomorrow), shown = all.slice(0, PR_DIGEST_MAX_TITLES);
  var lines = shown.map(function(t) {
    var tag = e.late.indexOf(t) >= 0 ? 'telat, ' : '';
    return '• ' + t.title + ' (' + tag + 'tenggat ' + _prDueLabel_(t.due) + ')';
  });
  if (all.length > shown.length) lines.push('…dan ' + (all.length - shown.length) + ' PR lain.');
  return lines.join('\n');
}

/** Fakta singkat untuk label tombol: "2 telat" atau "3 PR". */
function _prFact_(e) {
  return e.late.length ? e.late.length + ' telat' : (e.today.length + e.tomorrow.length) + ' PR';
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
  var active = pools.active.filter(function(c) { return !_rmdIsOff_(c, 'pr'); });
  var rows = _tasksSheet_().getDataRange().getValues().slice(1);
  var list = _buildPrDigest_(rows, active, today);
  if (!list.length) { Logger.log('PR digest: tidak ada PR yang perlu diingatkan.'); return true; }

  var tpl = _rmdTemplate_('pr');
  var items = list.map(function(e) {
    return { name: e.client.name, phone: e.client.phone, fact: _prFact_(e), text: _rmdFill_(tpl, { nama: e.client.name, pr: _prItemsText_(e) }) };
  });
  return _rmdSendDigest_('PR', _rmdDateLabel_(_wibParts_(now).date), items, pools.skippedNames);
}

/** Tes murni (tanpa sheet/Telegram). Lempar error bila gagal. */


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

var RMD_TEST_JENIS = ['sesi-besok', 'booking-minggu', 'pr', 'tidur', 'makan-pagi', 'makan-sore', 'rekap-bulanan', 'selamat-milestone', 'waktunya-ukur'];
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

  var handler = { 'rekap-bulanan': sendRekapBulananDigest_, 'selamat-milestone': sendMilestoneDigest_, 'waktunya-ukur': sendUkurDigest_, 'sesi-besok': sendSesiBesokDigest_, 'pr': sendPrDigest_, 'booking-minggu': sendBookingMingguDigest_,
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
  return { clients: r.clients, skipped: pools.skipped, skippedNames: pools.skippedNames, corePackages: r.corePackages };
}

/** Tes T-71 (murni, tanpa sheet). Jalankan dari editor. */


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

/**
 * Handler bersama. @returns {boolean} true = selesai (terkirim / memang tak ada yang dikirim);
 * false = Telegram dilewati/gagal → dicoba lagi di tick berikut.
 */
function _sendMakanDigest_(waktu, ctx) {
  var now = (ctx && ctx.now) || new Date();
  var jenis = 'makan-' + waktu;
  var sel = _selectCoreClients_();
  var clients = sel.clients.filter(function(c) { return c.mealOn !== false && !_rmdIsOff_(c, jenis); });   // T-73 (kolom O) + T-123 (kolom P)
  if (!clients.length) { Logger.log('Makan ' + waktu + ': tidak ada klien core dengan reminder makan aktif.'); return true; }
  var tip = String(_pickTip_(waktu, _wibParts_(now).date) || '').trim();
  if (!tip) { Logger.log('Makan ' + waktu + ': tidak ada tip aktif di MealTips, tidak ada yang dikirim.'); return true; }
  var tpl = _rmdTemplate_(jenis);
  var items = clients.map(function(c) {
    return { name: c.name, phone: c.phone, fact: '', text: _rmdFill_(tpl, { nama: c.name, tip: tip }) };
  });
  return _rmdSendDigest_(waktu === 'pagi' ? 'Makan pagi' : 'Makan sore', _rmdDateLabel_(_wibParts_(now).date), items, sel.skippedNames);
}

function sendMakanPagiDigest_(ctx) { return _sendMakanDigest_('pagi', ctx); }
function sendMakanSoreDigest_(ctx) { return _sendMakanDigest_('sore', ctx); }

/** Tes T-72 (murni, tanpa sheet/Telegram). Jalankan dari editor. */


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