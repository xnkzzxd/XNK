// #############################################################################
// 🏋️  XNK — PREMIUM FITNESS WORKSPACE
//     BACKEND SCRIPT (Code.gs) — Versi Rapi & Terstruktur
// #############################################################################
//
// 📁 PETA STRUKTUR FILE
//    (pakai Ctrl+F / Cmd+F, cari tag "📁" atau "📂" di bawah untuk lompat cepat)
//
//    📁 00_CORE                    → Entry point & template rendering
//       ├─ doGet()
//       └─ include()
//
//    📁 01_CONFIG_SECURITY         → Login admin (PIN), login klien (nomor WA), token sesi
//       ├─ adminLogin() / checkAdminSession() / changeAdminPin()
//       ├─ memberLoginByPhone() / memberLoginByKey() / getMemberProfile()
//       └─ requireAdmin_() / requireMember_() / requireOwner_()   ← penjaga akses
//
//    📁 02_UTILS                   → Helper umum lintas modul
//       ├─ getOrCreateSheet_()
//       ├─ sanitizeValue()
//       └─ testDriveAccess()
//
//    📁 03_COACHES                 → Data pelatih
//       ├─ 📂 CRUD
//       │    ├─ getCoaches()
//       │    ├─ addCoach()
//       │    ├─ updateCoach()
//       │    └─ deleteCoach()
//       └─ 📂 PHOTO_UPLOAD
//            ├─ _getCoachPhotoFolder_()
//            └─ uploadCoachPhoto()
//
//    📁 04_MEMBERS                 → Data klien
//       ├─ 📂 CRUD
//       │    ├─ getMemberSessions()
//       │    ├─ getMembers()
//       │    ├─ addMember()
//       │    ├─ updateMemberProfile()
//       │    ├─ registerNewClient()
//       │    └─ deleteMember()
//       └─ 📂 PHOTO_UPLOAD
//            ├─ migrateMembersAddPhotoColumn()
//            ├─ _getMemberPhotoFolder_()
//            ├─ uploadMemberPhoto()
//            └─ updateMemberPhoto()
//
//    📁 05_SCHEDULES               → Jadwal & transaksi sesi
//       ├─ 📂 CRUD
//       │    ├─ getSchedules()
//       │    ├─ addSchedule()
//       │    ├─ updateScheduleData()
//       │    ├─ updateScheduleCoach()
//       │    └─ clientBookSchedule()
//       └─ 📂 STATUS
//            ├─ markSchedulesAsRead()
//            ├─ completeSession()
//            └─ deleteSchedule()
//
//    📁 06_NOTIFICATIONS           → Reminder harian (Email + Telegram)
//       ├─ setupDailyTrigger()
//       └─ sendDailyReminderEmail()
//
//    📁 07_PRICELIST               → Katalog paket harga
//       └─ getPriceList()
//
//    📁 08_AVAILABILITY            → Slot jadwal tersedia (publik)
//       └─ getPublicAvailability()
//
//    📁 09_TASKS                   → PR (Task) klien di luar gym
//       ├─ _tasksSheet_()
//       ├─ addTask() / updateTask() / deleteTask()   (admin)
//       ├─ getTasksForMember() / getTaskSummary()    (admin)
//       ├─ getMyTasks() / completeMyTask()           (klien)
//       ├─ deleteTaskGroup()                         (admin, hapus seluruh PR berulang)
//       └─ PR berulang: _nextRecurrence_ / _spawnNextTaskInstance_ / _rolloverRecurringTasks_
//       └─ helper validasi: _taskText_ / _taskDueDate_ / _taskEnum_
//       └─ Template PR (T-76): getTaskTemplates() / saveTaskTemplate() / deleteTaskTemplate()   (admin)
//
//    ⚠️  ATURAN KEAMANAN (baca section 01_CONFIG_SECURITY):
//    Semua fungsi top-level TANPA akhiran "_" bisa dipanggil siapa saja dari
//    browser. Fungsi admin wajib diawali requireAdmin_(token), fungsi portal
//    klien requireMember_(token). Fungsi pembantu wajib berakhiran "_".
//    Tes otomatis (pt-scheduler/tests) gagal kalau ada fungsi baru yang lupa dijaga.
// #############################################################################


// #############################################################################
// 📁 00_CORE — Entry Point & Template Rendering
// #############################################################################

function doGet(e) {
  // Cermin harga untuk situs statis (GitHub Action BookingPT): JSON publik, tanpa data klien.
  if (e && e.parameter && e.parameter.view === 'prices') {
    return ContentService.createTextOutput(JSON.stringify(getPriceListPublic())).setMimeType(ContentService.MimeType.JSON);
  }
  var page = e && e.parameter && e.parameter.view ? e.parameter.view : 'Index';
  // Hanya file HTML yang benar-benar ada. Nilai lain (termasuk ?view=public untuk
  // portal klien) jatuh ke Index, yang membaca parameter view sendiri di browser.
  var validPages = ['Index', 'Landing'];
  if (validPages.indexOf(page) === -1) page = 'Index';

  try { _applyPendingConfig_(false); } catch (err) { Logger.log('Pengaturan dari Drive gagal: ' + err); }

  // Ikon tab untuk halaman yang dibuka langsung (landing: situs publik; panel: xnk.my.id).
  const faviconUrl = page === 'Landing' ? 'https://xnkbooking.my.id/favicon.ico' : 'https://xnk.my.id/favicon.ico';
  return HtmlService.createTemplateFromFile(page).evaluate()
    .setFaviconUrl(faviconUrl)
    .setTitle('XNK Personal Training')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include helper untuk modular HTML components.
 * Memungkinkan file GAS HTML dipisah menjadi partials.
 * Digunakan dalam template: <?!= include('Theme.html') ?>
 * Standard Google Apps Script pattern.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// #############################################################################
// 📁 01_CONFIG_SECURITY — Login Admin, Link Member, Token Sesi
// #############################################################################
//
// Web app ini dibuka "Anyone" dan berjalan sebagai akun pemilik, jadi SETIAP
// fungsi top-level di file .gs bisa dipanggil siapa saja lewat google.script.run.
// Karena itu:
//   - Fungsi admin wajib menerima `token` sebagai parameter pertama dan
//     memanggil requireAdmin_(token) di baris pertama.
//   - Fungsi portal klien menerima token member dan memanggil requireMember_().
//   - Fungsi pembantu internal diberi akhiran "_" (private: TIDAK bisa
//     dipanggil dari browser).
//   - Fungsi perawatan (migrasi, setup trigger, test) memanggil requireOwner_(),
//     jadi hanya bisa dijalankan pemilik dari editor Apps Script.
//
// Script Properties yang dipakai (Project Settings → Script Properties):
//   ADMIN_PIN          PIN login panel PT (wajib diisi, minimal 6 karakter).
//                      Mengganti PIN = semua perangkat admin otomatis logout.
//   SESSION_SECRET     Dibuat otomatis. Menghapusnya = semua sesi logout.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS   Notifikasi Telegram (lihat kirimNotifTelegram_).
//
// Property di atas juga bisa diisi tanpa membuka editor, lewat file
// CONFIG_FILE_NAME di Google Drive pemilik (lihat _applyPendingConfig_).
//
// Token = base64url(payload JSON) + "." + HMAC-SHA256(payload, SESSION_SECRET).
// Tidak ada data sesi yang disimpan di server; token berisi masa berlaku (exp)
// dan "versi" (sidik PIN admin / sidik kunci sesi member) sehingga mengganti
// PIN atau kunci sesi langsung membatalkan token lama.

const ADMIN_SESSION_DAYS = 30;
const MEMBER_SESSION_DAYS = 90;
const LOGIN_MAX_FAILS = 10;          // gagal berturut-turut sebelum dikunci
const LOGIN_LOCK_SECONDS = 600;      // lama kunci (dan jendela hitung gagal)
const AUTH_ERROR_PREFIX = 'AUTH_REQUIRED';

const MEMBER_LOGIN_MAX_FAILS = 30;   // nomor WA tak dikenal per 10 menit (dari semua pengunjung)
const REGISTER_MAX_PER_10MIN = 5;    // pendaftaran mandiri per 10 menit (dari semua pengunjung); Script Property menimpanya

// ── Pengaturan lewat file Drive ─────────────────────────────────────────────
// Script Properties hanya bisa diisi dari editor atau dari kode yang sedang
// berjalan. Supaya bisa diatur tanpa editor, buat file JSON bernama
// CONFIG_FILE_NAME di Google Drive akun pemilik, mis.
//   {"ADMIN_PIN":"123456","TELEGRAM_BOT_TOKEN":"…","TELEGRAM_CHAT_IDS":"1,2"}
// Saat halaman dibuka berikutnya (paling lambat CONFIG_CHECK_SECONDS kemudian)
// isinya dipindah ke Script Properties, lalu file dibuang ke Sampah.
// Nilai null = hapus property. Hanya file MILIK akun pemilik yang dibaca (file
// yang dibagikan orang lain diabaikan), dan hanya kunci di CONFIG_KEYS.
const CONFIG_FILE_NAME = 'xnk-pt-config.json';
const CONFIG_KEYS = ['ADMIN_PIN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_IDS'];
const CONFIG_CHECK_SECONDS = 300;

function _configValueError_(key, value) {
  if (key === 'ADMIN_PIN' && value.length < 6) return 'minimal 6 karakter';
  return null;
}

/** Pindahkan isi file pengaturan di Drive ke Script Properties. Mengembalikan nama kunci yang diubah. */
function _applyPendingConfig_(force) {
  const cache = CacheService.getScriptCache();
  if (!force && cache.get('config_checked')) return [];
  cache.put('config_checked', '1', CONFIG_CHECK_SECONDS);

  const owner = Session.getEffectiveUser().getEmail();
  if (!owner) return [];
  const props = PropertiesService.getScriptProperties();
  const changed = [];
  const files = DriveApp.searchFiles('title = "' + CONFIG_FILE_NAME + '" and trashed = false');
  while (files.hasNext()) {
    const file = files.next();
    const fileOwner = file.getOwner();
    if (!fileOwner || fileOwner.getEmail() !== owner) continue;
    let data;
    try {
      data = JSON.parse(file.getBlob().getDataAsString());
    } catch (e) {
      Logger.log(CONFIG_FILE_NAME + ' bukan JSON yang valid, dilewati.');
      continue;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    CONFIG_KEYS.forEach(function(key) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) return;
      if (data[key] === null) {
        props.deleteProperty(key);
        changed.push(key);
        return;
      }
      const value = String(data[key]).trim();
      const error = _configValueError_(key, value);
      if (error) {
        Logger.log(CONFIG_FILE_NAME + ': ' + key + ' dilewati (' + error + ').');
        return;
      }
      props.setProperty(key, value);
      changed.push(key);
    });
    file.setTrashed(true);
  }
  if (changed.length) {
    Logger.log('Pengaturan diperbarui dari ' + CONFIG_FILE_NAME + ': ' + changed.join(', '));
    try {
      kirimNotifTelegram_('⚙️ <b>Pengaturan aplikasi diperbarui</b>\n\n' + _escHtml_(changed.join(', ')));
    } catch (e) { Logger.log('Notif Telegram gagal: ' + e); }
  }
  return changed;
}

function _hex_(bytes) {
  return bytes.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function _sha256Hex_(text) {
  return _hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8));
}

// Perbandingan string yang waktunya tidak bergantung pada posisi karakter beda.
function _safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function _sessionSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET', secret);
  }
  return secret;
}

function _sign_(text) {
  return _hex_(Utilities.computeHmacSha256Signature(text, _sessionSecret_()));
}

function _issueToken_(payload) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8);
  return body + '.' + _sign_(body);
}

// Kembalikan payload kalau token sah & belum kedaluwarsa, selain itu null.
function _readToken_(token) {
  if (!token || typeof token !== 'string' || token.length > 2000) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !_safeEqual_(_sign_(parts[0]), parts[1])) return null;
  let payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

function _authError_(message) {
  return new Error(AUTH_ERROR_PREFIX + ': ' + message);
}

/** Angka dari Script Properties (diatur lewat Pengaturan), jatuh ke nilai default kalau belum diisi/tidak valid. */
function _numProp_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  const n = v === null || v === '' ? NaN : Number(v);
  return isNaN(n) ? fallback : n;
}

/** Alamat email tujuan notifikasi: NOTIF_EMAIL kalau diisi lewat Pengaturan, kalau tidak email pemilik akun (seperti sebelumnya). */
function _notifEmailRecipient_() {
  return PropertiesService.getScriptProperties().getProperty('NOTIF_EMAIL') || Session.getEffectiveUser().getEmail();
}

function _adminPinVersion_() {
  const pin = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  return pin ? _sha256Hex_('admin-pin:' + pin).slice(0, 16) : null;
}

/** Wajib dipanggil di baris pertama setiap fungsi admin. */
function requireAdmin_(token) {
  const payload = _readToken_(token);
  const version = _adminPinVersion_();
  if (!payload || payload.r !== 'admin' || !version || payload.v !== version) {
    throw _authError_('Sesi admin berakhir. Silakan login lagi.');
  }
  return payload;
}

/** Untuk fungsi perawatan yang dijalankan manual dari editor Apps Script. */
function requireOwner_() {
  const active = Session.getActiveUser().getEmail();
  const owner = Session.getEffectiveUser().getEmail();
  if (!active || active !== owner) {
    throw new Error('Fungsi ini hanya bisa dijalankan pemilik dari editor Apps Script.');
  }
}

/**
 * Login panel PT. Mengembalikan { token } yang disimpan browser (30 hari).
 * 10x PIN salah dalam 10 menit = login dikunci 10 menit + notif Telegram.
 */
function adminLogin(pin) {
  let stored = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!stored) {
    _applyPendingConfig_(true);
    stored = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  }
  if (!stored) {
    throw new Error('PIN admin belum diatur. Pemilik akun: isi ADMIN_PIN di Script Properties atau lewat file ' + CONFIG_FILE_NAME + ' di Google Drive.');
  }
  const cache = CacheService.getScriptCache();
  const loginMaxFails = _numProp_('LOGIN_MAX_FAILS', LOGIN_MAX_FAILS);
  const loginLockSeconds = _numProp_('LOGIN_LOCK_SECONDS', LOGIN_LOCK_SECONDS);
  const fails = parseInt(cache.get('admin_login_fails') || '0', 10);
  if (fails >= loginMaxFails) {
    throw new Error('Terlalu banyak percobaan PIN salah. Coba lagi dalam 10 menit.');
  }
  if (!_safeEqual_(String(pin == null ? '' : pin).trim(), stored)) {
    cache.put('admin_login_fails', String(fails + 1), loginLockSeconds);
    if (fails + 1 === loginMaxFails) {
      try {
        kirimNotifTelegram_('⚠️ <b>LOGIN ADMIN DIKUNCI</b>\n\n' + loginMaxFails +
          ' kali PIN salah dalam 10 menit. Login panel PT dikunci 10 menit.');
      } catch (e) { Logger.log('Notif Telegram gagal: ' + e); }
    }
    Utilities.sleep(700);
    throw new Error('PIN salah.');
  }
  cache.remove('admin_login_fails');
  return {
    token: _issueToken_({ r: 'admin', v: _adminPinVersion_(), exp: Date.now() + _numProp_('ADMIN_SESSION_DAYS', ADMIN_SESSION_DAYS) * 86400000 })
  };
}

/** Dipanggil saat panel dibuka: cek token tersimpan masih berlaku. */
function checkAdminSession(token) {
  requireAdmin_(token);
  return { ok: true };
}

/** Ganti PIN admin. Semua perangkat lain otomatis logout; perangkat ini dapat token baru. */
function changeAdminPin(token, oldPin, newPin) {
  requireAdmin_(token);
  const props = PropertiesService.getScriptProperties();
  if (!_safeEqual_(String(oldPin == null ? '' : oldPin).trim(), props.getProperty('ADMIN_PIN'))) {
    throw new Error('PIN lama salah.');
  }
  newPin = String(newPin == null ? '' : newPin).trim();
  if (newPin.length < 6) throw new Error('PIN baru minimal 6 karakter.');
  props.setProperty('ADMIN_PIN', newPin);
  return {
    token: _issueToken_({ r: 'admin', v: _adminPinVersion_(), exp: Date.now() + _numProp_('ADMIN_SESSION_DAYS', ADMIN_SESSION_DAYS) * 86400000 })
  };
}

// ── Pengaturan sistem (notifikasi, jam operasional, keamanan/sesi) ──────────
// Semua nilai punya default = perilaku sebelum fitur ini ada, jadi selama admin
// belum pernah buka Pengaturan, tidak ada yang berubah.
const DEFAULT_BUSINESS_HOURS = { 0: [6, 12], 1: [6, 21], 2: [6, 21], 3: [6, 21], 4: [6, 21], 5: [6, 21], 6: [6, 21] };
const SETTINGS_NUMERIC_BOUNDS = {
  loginMaxFails: { key: 'LOGIN_MAX_FAILS', fallback: LOGIN_MAX_FAILS, min: 1, max: 1000 },
  loginLockSeconds: { key: 'LOGIN_LOCK_SECONDS', fallback: LOGIN_LOCK_SECONDS, min: 10, max: 86400 },
  memberLoginMaxFails: { key: 'MEMBER_LOGIN_MAX_FAILS', fallback: MEMBER_LOGIN_MAX_FAILS, min: 1, max: 1000 },
  adminSessionDays: { key: 'ADMIN_SESSION_DAYS', fallback: ADMIN_SESSION_DAYS, min: 1, max: 365 },
  rescheduleCutoffHours: { key: 'RESCHEDULE_CUTOFF_HOURS', fallback: 2, min: 0, max: 72 }
};

function _businessHours_() {
  const raw = PropertiesService.getScriptProperties().getProperty('BUSINESS_HOURS_JSON');
  if (!raw) return DEFAULT_BUSINESS_HOURS;
  try {
    const parsed = JSON.parse(raw);
    return _validBusinessHours_(parsed) ? parsed : DEFAULT_BUSINESS_HOURS;
  } catch (e) {
    return DEFAULT_BUSINESS_HOURS;
  }
}

function _validBusinessHours_(hours) {
  if (!hours || typeof hours !== 'object') return false;
  for (let d = 0; d < 7; d++) {
    const range = hours[d];
    if (!Array.isArray(range) || range.length !== 2) return false;
    const [start, end] = range;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
    if (start < 0 || end > 24 || start >= end) return false;
  }
  return true;
}

/** Jam operasional per hari (0=Minggu..6=Sabtu), dipakai Landing & portal untuk slot kosong. */
function getBusinessHours() {
  return _businessHours_();
}

/** '••••1234' untuk rahasia yang tersimpan, '' kalau belum diisi. Tidak pernah membocorkan lebih dari 4 karakter terakhir. */
function _maskSecret_(value) {
  const v = String(value || '');
  if (!v) return '';
  return '••••' + (v.length > 8 ? v.slice(-4) : '');
}

/** Info Pengaturan buat form admin: notifikasi, jam operasional, keamanan/sesi. */
function getAppSettings(token) {
  requireAdmin_(token);
  const props = PropertiesService.getScriptProperties();
  const settings = {
    telegramEnabled: props.getProperty('TELEGRAM_ENABLED') !== 'false',
    telegramBotToken: '',   // T-105: token tidak pernah dikirim ke browser; lihat telegramBotTokenMask
    telegramBotTokenMask: _maskSecret_(props.getProperty('TELEGRAM_BOT_TOKEN')),
    telegramChatIds: props.getProperty('TELEGRAM_CHAT_IDS') || '',
    notifEmail: props.getProperty('NOTIF_EMAIL') || '',
    clientGuideEnabled: _guideEnabled_(),
    businessHours: _businessHours_()
  };
  settings.defaults = { businessHours: DEFAULT_BUSINESS_HOURS };
  Object.keys(SETTINGS_NUMERIC_BOUNDS).forEach(function (name) {
    const b = SETTINGS_NUMERIC_BOUNDS[name];
    settings[name] = _numProp_(b.key, b.fallback);
    settings.defaults[name] = b.fallback;
  });
  settings.reminder = _rmdRead_();   // T-40: lihat ReminderSettings.gs
  settings.finance = _finSettingsRead_();   // Fase H: lihat Keuangan.gs
  return settings;
}

/** Simpan Pengaturan. String kosong/null pada satu kolom = hapus properti itu (balik ke default). */
function updateAppSettings(token, payload) {
  requireAdmin_(token);
  payload = payload || {};
  const props = PropertiesService.getScriptProperties();

  if (Object.prototype.hasOwnProperty.call(payload, 'businessHours') && payload.businessHours != null) {
    if (!_validBusinessHours_(payload.businessHours)) {
      throw new Error('Jam operasional tidak valid: tiap hari perlu jam buka < jam tutup, antara 0 dan 24.');
    }
  }
  Object.keys(SETTINGS_NUMERIC_BOUNDS).forEach(function (name) {
    if (!Object.prototype.hasOwnProperty.call(payload, name) || payload[name] === '' || payload[name] == null) return;
    const b = SETTINGS_NUMERIC_BOUNDS[name];
    const n = Number(payload[name]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < b.min || n > b.max) {
      throw new Error('Nilai ' + name + ' harus bilangan bulat antara ' + b.min + ' dan ' + b.max + '.');
    }
  });

  const rmdMap = _rmdValidate_(payload.reminder);   // T-40: validasi dulu, tulis belakangan
  const finMap = _finValidate_(payload.finance);    // Fase H

  const setOrDelete = function (key, value) {
    if (value === '' || value == null) props.deleteProperty(key);
    else props.setProperty(key, String(value));
  };
  if (Object.prototype.hasOwnProperty.call(payload, 'telegramEnabled')) {
    props.setProperty('TELEGRAM_ENABLED', payload.telegramEnabled ? 'true' : 'false');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'telegramBotToken')) setOrDelete('TELEGRAM_BOT_TOKEN', String(payload.telegramBotToken || '').trim());
  if (Object.prototype.hasOwnProperty.call(payload, 'telegramChatIds')) setOrDelete('TELEGRAM_CHAT_IDS', String(payload.telegramChatIds || '').trim());
  if (Object.prototype.hasOwnProperty.call(payload, 'notifEmail')) setOrDelete('NOTIF_EMAIL', String(payload.notifEmail || '').trim());
  if (Object.prototype.hasOwnProperty.call(payload, 'clientGuideEnabled')) setOrDelete('CLIENT_GUIDE_ENABLED', payload.clientGuideEnabled ? '' : 'false');
  if (Object.prototype.hasOwnProperty.call(payload, 'businessHours')) {
    setOrDelete('BUSINESS_HOURS_JSON', payload.businessHours == null ? '' : JSON.stringify(payload.businessHours));
  }
  Object.keys(SETTINGS_NUMERIC_BOUNDS).forEach(function (name) {
    if (!Object.prototype.hasOwnProperty.call(payload, name)) return;
    setOrDelete(SETTINGS_NUMERIC_BOUNDS[name].key, payload[name] === '' || payload[name] == null ? '' : Math.trunc(Number(payload[name])));
  });
  _rmdWrite_(rmdMap);   // T-40
  _finWrite_(finMap);   // Fase H
  _bustSlots_();   // sesudah menulis (jam operasional): buang cache jam kosong

  return getAppSettings(token);
}

/** Tes token/Chat ID Telegram TANPA menyimpannya dulu (dari form Pengaturan). */
function sendTelegramTest(token, botToken, chatIds) {
  requireAdmin_(token);
  botToken = String(botToken || '').trim() || String(PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN') || '');   // kosong = pakai token tersimpan
  const ids = String(chatIds || '').split(',').map(function (id) { return id.trim(); }).filter(String);
  if (!botToken || ids.length === 0) throw new Error('Isi token bot dan minimal satu Chat ID dulu.');
  const url = 'https://api.telegram.org/bot' + botToken + '/sendMessage';
  const results = ids.map(function (id) {
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ chat_id: id, text: '✅ Tes notifikasi dari xnk.my.id — kalau pesan ini sampai, token & Chat ID sudah benar.' }),
        muteHttpExceptions: true
      });
      return { id: id, ok: res.getResponseCode() === 200 };
    } catch (e) {
      return { id: id, ok: false };
    }
  });
  return { results: results, sent: results.filter(function (r) { return r.ok; }).length, total: results.length };
}

// ── Login klien ─────────────────────────────────────────────────────────────
// Klien masuk portal dengan nomor WhatsApp yang terdaftar (dicek di server; daftar
// klien tidak pernah dikirim ke browser). Setiap klien punya kunci acak di kolom N
// MemberData ("Kunci Link"): sidiknya jadi "versi" token, jadi mengganti/menghapus
// kunci itu membatalkan semua sesi klien tersebut. Link lama ?k=KUNCI tetap bisa
// dipakai untuk masuk (memberLoginByKey).

const MEMBER_KEY_COL = 14; // Kolom N di MemberData (1-based)

function _newMemberKey_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function _memberKeyVersion_(key) {
  return _sha256Hex_('member-key:' + key).slice(0, 16);
}

// Versi sesi klien. create=true membuat kunci kalau belum ada (kolom N siap).
// Kolom N dipakai untuk hal lain = 'nokey' (sesi tetap jalan, tidak bisa dicabut).
function _memberSessionVersion_(found, create) {
  if (!_memberKeyColumnReady_(found.sheet)) return 'nokey';
  let key = String(found.row[MEMBER_KEY_COL - 1] || '');
  if (!/^[a-f0-9]{32}$/i.test(key)) {
    if (!create) return null;
    key = _newMemberKey_();
    found.sheet.getRange(found.rowNum, MEMBER_KEY_COL).setValue(key);
    found.row[MEMBER_KEY_COL - 1] = key;
  }
  return _memberKeyVersion_(key);
}

function _issueMemberSession_(found) {
  return {
    token: _issueToken_({
      r: 'member',
      m: String(found.row[0]).trim(),
      v: _memberSessionVersion_(found, true),
      exp: Date.now() + MEMBER_SESSION_DAYS * 86400000
    }),
    member: _memberPublicProfile_(found.row)
  };
}

// Cari baris member (1-based) + datanya. Kembalikan null kalau tidak ada.
function _findMemberRow_(predicate) {
  const sheet = _getMemberDataSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && predicate(data[i])) return { sheet: sheet, rowNum: i + 1, row: data[i] };
  }
  return null;
}

/** Wajib dipanggil di baris pertama setiap fungsi portal klien. */
function requireMember_(token) {
  const payload = _readToken_(token);
  if (!payload || payload.r !== 'member' || !payload.m) {
    throw _authError_('Sesi berakhir. Silakan masuk lagi dengan nomor WhatsApp.');
  }
  const found = _findMemberRow_(function(row) { return String(row[0]).trim() === String(payload.m); });
  const version = found ? _memberSessionVersion_(found, false) : null;
  if (!version || payload.v !== version) {
    throw _authError_('Sesi berakhir. Silakan masuk lagi dengan nomor WhatsApp.');
  }
  return found;
}

// Data profil yang boleh dilihat klien itu sendiri (tanpa kunci link).
function _memberPublicProfile_(row) {
  const joinDate = sanitizeValue(row[4]);
  return {
    id: sanitizeValue(row[0]),
    name: sanitizeValue(row[1]),
    phone: String(sanitizeValue(row[2])).trim(),
    goal: sanitizeValue(row[3]),
    joinDate: joinDate,
    lastActivityDate: sanitizeValue(row[12]) || joinDate,
    photo: sanitizeValue(row[5]) || '',
    packageId: sanitizeValue(row[6]) || '',
    packageName: sanitizeValue(row[7]) || '',
    totalSessions: parseInt(sanitizeValue(row[8])) || 10,
    usedSessions: parseInt(sanitizeValue(row[9])) || 0,
    preferredCoachId: sanitizeValue(row[10]) || '',
    preferredCoachName: sanitizeValue(row[11]) || '',
    mealReminder: _mealOnFrom_(row[14]),   // T-73: kolom O; kosong = aktif
    reminderOff: _rmdOffFrom_(row[15]),    // T-123: kolom P; jenis pengingat yang dimatikan
    guide: _guideFrom_(row[MEMBER_GUIDE_COL - 1])   // kolom W; null = tanpa panduan
  };
}

/**
 * Login portal klien dengan nomor WhatsApp yang terdaftar.
 * 30 nomor tak dikenal dalam 10 menit (dari siapa pun) = login nomor WA dikunci
 * 10 menit + notif Telegram, supaya data klien tidak bisa dipindai massal.
 * @returns {{token:string, member:Object}}
 */
function memberLoginByPhone(phone) {
  const target = _normalizePhone_(phone);
  if (!/^62\d{8,13}$/.test(target)) throw new Error('Nomor WhatsApp tidak valid.');
  const cache = CacheService.getScriptCache();
  const memberLoginMaxFails = _numProp_('MEMBER_LOGIN_MAX_FAILS', MEMBER_LOGIN_MAX_FAILS);
  const loginLockSeconds = _numProp_('LOGIN_LOCK_SECONDS', LOGIN_LOCK_SECONDS);
  const fails = parseInt(cache.get('member_login_fails') || '0', 10);
  if (fails >= memberLoginMaxFails) {
    throw new Error('Terlalu banyak percobaan. Coba lagi dalam 10 menit.');
  }
  const found = _findMemberRow_(function(row) { return _normalizePhone_(row[2]) === target; });
  if (!found) {
    cache.put('member_login_fails', String(fails + 1), loginLockSeconds);
    if (fails + 1 === memberLoginMaxFails) {
      try {
        kirimNotifTelegram_('⚠️ <b>LOGIN KLIEN DIKUNCI</b>\n\n' + memberLoginMaxFails +
          ' nomor WhatsApp tidak dikenal dalam 10 menit. Login klien dengan nomor WA dikunci 10 menit.');
      } catch (e) { Logger.log('Notif Telegram gagal: ' + e); }
    }
    Utilities.sleep(500);
    throw new Error('Nomor WhatsApp tidak ditemukan. Pastikan sudah didaftarkan oleh Coach.');
  }
  return _issueMemberSession_(found);
}

/**
 * Login portal klien dari link lama (?k=...).
 * @returns {{token:string, member:Object}}
 */
function memberLoginByKey(key) {
  key = String(key || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(key)) throw _authError_('Link tidak valid. Silakan masuk dengan nomor WhatsApp.');
  if (!_memberKeyColumnReady_(_getMemberDataSheet_())) throw _authError_('Link tidak valid. Silakan masuk dengan nomor WhatsApp.');
  const found = _findMemberRow_(function(row) {
    return _safeEqual_(String(row[MEMBER_KEY_COL - 1] || ''), key);
  });
  if (!found) throw _authError_('Link tidak valid. Silakan masuk dengan nomor WhatsApp.');
  return _issueMemberSession_(found);
}

/** Profil terbaru klien yang sedang login (dipakai saat portal dibuka ulang). */
function getMemberProfile(memberToken) {
  return _memberPublicProfile_(requireMember_(memberToken).row);
}

// ── Panduan klien baru ──────────────────────────────────────────────────────
// Portal menggelapkan layar dan menyorot tombol yang perlu diklik, per halaman,
// hanya untuk klien yang mendaftar sendiri. Kolom W MemberData "Panduan":
// kosong = tanpa panduan (klien lama, perpanjang, ditambah admin);
// 'baru|beranda|booking' = klien baru + halaman yang sudah selesai;
// 'selesai' = semua selesai atau dimatikan klien. Bisa dimatikan di Pengaturan
// (CLIENT_GUIDE_ENABLED = 'false'); bawaannya nyala.
const MEMBER_GUIDE_COL = 23;   // Kolom W
const GUIDE_PAGES = ['beranda', 'booking', 'jadwal', 'paket', 'coach'];

function _guideEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('CLIENT_GUIDE_ENABLED') !== 'false';
}

function _guideFrom_(cell) {
  const parts = String(cell == null ? '' : cell).trim().split('|');
  if (parts[0] !== 'baru' || !_guideEnabled_()) return null;
  const done = GUIDE_PAGES.filter(function(p) { return parts.indexOf(p) !== -1; });
  return done.length === GUIDE_PAGES.length ? null : { done: done };
}

function _ensureGuideColumn_(sheet) {
  const cell = sheet.getRange(1, MEMBER_GUIDE_COL);
  if (cell.getValue() === '') { cell.setValue('Panduan'); cell.setFontWeight('bold'); }
}

/** Klien menandai panduan satu halaman selesai/dilewati; 'semua' = matikan panduan. */
function markGuideSeen(memberToken, page) {
  const found = requireMember_(memberToken);
  page = String(page == null ? '' : page);
  if (page !== 'semua' && GUIDE_PAGES.indexOf(page) === -1) throw new Error('Halaman panduan tidak dikenal.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cell = found.sheet.getRange(found.rowNum, MEMBER_GUIDE_COL);
    const parts = String(cell.getValue() || '').trim().split('|');
    if (parts[0] !== 'baru') return null;
    if (page !== 'semua' && parts.indexOf(page) === -1) parts.push(page);
    const done = GUIDE_PAGES.filter(function(p) { return parts.indexOf(p) !== -1; });
    const value = page === 'semua' || done.length === GUIDE_PAGES.length ? 'selesai' : ['baru'].concat(done).join('|');
    cell.setValue(value);
    return _guideFrom_(value);
  } finally {
    lock.releaseLock();
  }
}

// Batasi fungsi yang tidak butuh login tapi mahal/berisiko di-spam
// (mis. trigger email): maksimal 1x per `seconds` detik.
function _throttle_(name, seconds) {
  const cache = CacheService.getScriptCache();
  const key = 'throttle_' + name;
  if (cache.get(key)) return false;
  cache.put(key, '1', seconds);
  return true;
}


// Jalankan fn di bawah script lock (baca-lalu-tulis sheet). Panggilan bersarang dalam
// satu eksekusi tidak mengambil lock lagi.
let _lockDepth_ = 0;
function _locked_(fn) {
  if (_lockDepth_ > 0) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  _lockDepth_++;
  try { return fn(); } finally { _lockDepth_--; lock.releaseLock(); }
}

// ── Kuota & batas booking klien ─────────────────────────────────────────────
const BOOKING_MAX_DAYS_AHEAD = 60;   // bawaan; Script Property BOOKING_MAX_DAYS_AHEAD menimpanya

/**
 * Sisa sesi yang masih boleh dibooking klien: Total Sesi − Sesi Terpakai − sesi mendatang
 * yang sudah dibooking (belum selesai/batal). null = paket tanpa jumlah sesi (tidak dibatasi).
 * Bisa negatif.
 */
function _memberQuotaLeft_(memberRow, schedules) {
  const total = parseInt(memberRow[8], 10);
  if (!(total > 0)) return null;
  const used = parseInt(memberRow[9], 10) || 0;
  const id = String(memberRow[0]).trim();
  const now = Date.now();
  const upcoming = (schedules || _getSchedulesAll_()).filter(function(s) {
    const st = String(s.status || '').toLowerCase();
    return String(s.memberId).trim() === id && st !== 'completed' && st !== 'cancelled' && st !== 'available' &&
      new Date(s.start).getTime() > now;
  }).length;
  return total - used - upcoming;   // bisa negatif kalau admin membooking melebihi kuota
}

/** all = isi Schedules yang sudah dibaca pemanggil (opsional). */
function _assertQuota_(memberRow, count, all) {
  const left = _memberQuotaLeft_(memberRow, all);
  if (left === null) return;
  if (left <= 0) throw new Error('Sisa sesi paketmu habis. Perpanjang paket dulu.');
  if (count > left) throw new Error('Sisa sesi paketmu tinggal ' + left + '. Kurangi jumlah sesi berulangnya.');
}

function _assertBookingHorizon_(start) {
  const days = _numProp_('BOOKING_MAX_DAYS_AHEAD', BOOKING_MAX_DAYS_AHEAD);
  if (new Date(start).getTime() > Date.now() + days * 86400000) {
    throw new Error('Booking paling jauh ' + days + ' hari ke depan.');
  }
}


// #############################################################################
// 📁 02_UTILS — Helper Umum (Sheets, Sanitizer, Diagnostik)
// #############################################################################

/**
 * Fungsi pembantu untuk membuat Sheet baru jika belum ada,
 * atau memastikan baris header sudah tertulis dengan benar.
 */
function getOrCreateSheet_(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  } else {
    const a1 = sheet.getRange(1, 1).getValue();
    if (a1 !== "" && a1 !== headers[0]) {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  }
  return sheet;
}

/**
 * Fungsi bantu untuk konversi tipe data yang aman saat dikirim ke frontend.
 */
function sanitizeValue(val) {
  if (val instanceof Date) {
    // Date yang corrupt/invalid (misal dari sel kosong berformat tanggal) akan melempar
    // RangeError kalau langsung dipanggil toISOString() — cegah dengan cek isNaN dulu.
    return isNaN(val.getTime()) ? "" : val.toISOString();
  }
  return val === undefined || val === null ? "" : val;
}

/**
 * Diagnostik cepat: cek apakah script punya akses ke Google Drive.
 * Folder test otomatis dihapus lagi setelah dijalankan.
 */
function testDriveAccess() {
  requireOwner_();
  var folder = DriveApp.createFolder('TEST_DRIVE_' + new Date().getTime());
  Logger.log('BERHASIL, folder id: ' + folder.getId());
  folder.setTrashed(true); // otomatis dihapus lagi setelah test
}

function escapeHtmlTelegram(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Escape untuk teks & atribut HTML (email dan Telegram). Pakai ini untuk SEMUA
// data yang diketik klien (nama, catatan, goal) sebelum dimasukkan ke HTML.
function _escHtml_(text) {
  return escapeHtmlTelegram(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Normalisasi nomor WA Indonesia ke "62xxxxxxxxxx" (digit saja).
function _normalizePhone_(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.indexOf('0') === 0) d = '62' + d.slice(1);
  else if (d.indexOf('8') === 0) d = '62' + d;
  return d;
}

// Fungsi untuk menulis log ke Spreadsheet
function logToSheet_(pesan, status = "INFO") {
  try {
    // Gunakan getActiveSpreadsheet() jika script terikat ke file Sheets
    // Atau ganti dengan SpreadsheetApp.openById('ID_SPREADSHEET_ANDA') jika standalone
    const ss = SpreadsheetApp.getActiveSpreadsheet(); 
    let sheet = ss.getSheetByName("Logs");
    
    // Jika sheet "Logs" belum ada, buat otomatis
    if (!sheet) {
      sheet = ss.insertSheet("Logs");
      sheet.appendRow(["Timestamp", "Status", "Pesan"]);
      sheet.getRange("A1:C1").setFontWeight("bold"); // Bold header
    }
    
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([timestamp, status, pesan]);
  } catch (e) {
    Logger.log("Gagal menulis log ke sheet: " + e.message);
  }
}

// #############################################################################
// 📁 03_COACHES — Manajemen Data Coach (Pelatih)
// #############################################################################

// ── 📂 CRUD ──────────────────────────────────────────────────────────────────

const COACH_HEADERS = ["ID", "Nama Coach", "No WA", "Spesialisasi", "Foto URL", "Bio", "Pengalaman", "Status Aktif", "Headline", "Sertifikasi", "Prestasi", "Lokasi", "Instagram", "Foto File ID", "Bagi Hasil Tipe", "Bagi Hasil Nilai"];
const COACH_KEYS = ['id', 'name', 'phone', 'specialty', 'photo', 'bio', 'experience', 'aktif', 'headline', 'certifications', 'achievements', 'location', 'instagram', 'photoFileId', 'shareType', 'shareValue'];
const COACH_PUBLIC_KEYS = ['id', 'name', 'phone', 'specialty', 'photo', 'bio', 'experience', 'headline', 'certifications', 'achievements', 'location', 'instagram'];
const COACH_LIST_KEYS = ['certifications', 'achievements'];
const COACH_UNASSIGNED_TEXT = 'Belum Ditugaskan';   // teks lama; tidak pernah ditulis lagi (T-200)

/** Peta kolom Coaches dari nama header; null kalau kolom inti tidak ada (tidak menebak posisi). */
function _coachSchema_(header) {
  const norm = function(v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  const names = COACH_HEADERS.map(norm);
  const idx = {};
  header.forEach(function(h, i) {
    const k = names.indexOf(norm(h));
    if (k !== -1 && idx[COACH_KEYS[k]] === undefined) idx[COACH_KEYS[k]] = i;
  });
  return ['id', 'name', 'phone'].every(function(k) { return idx[k] !== undefined; }) ? idx : null;
}

/** Membuat sheet bila perlu dan menambah header yang belum ada (hanya di akhir). Idempoten; panggil di dalam lock. */
function _ensureCoachSchema_() {
  const sheet = getOrCreateSheet_('Coaches', COACH_HEADERS);
  let header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  let idx = _coachSchema_(header);
  if (!idx) throw new Error('Header sheet Coaches tidak dikenali. Pastikan baris pertama berisi: ' + COACH_HEADERS.join(', ') + '.');
  COACH_HEADERS.forEach(function(name, k) {
    if (idx[COACH_KEYS[k]] !== undefined) return;
    const col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(name);
    sheet.getRange(1, col).setFontWeight('bold');
    header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    idx = _coachSchema_(header);
  });
  return { sheet: sheet, idx: idx };
}

function _coachList_(v) {
  return String(v == null ? '' : v).split(',').map(function(x) { return x.trim(); }).filter(Boolean);
}

/** Semua coach (aktif & nonaktif), dibaca per nama header. Tidak pernah membuat sheet. Baris lama tanpa "Status Aktif" = aktif. */
function _coachesAll_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Coaches');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const idx = _coachSchema_(data[0]);
  if (!idx) return [];
  const cell = function(row, key) { return idx[key] === undefined ? '' : sanitizeValue(row[idx[key]]); };
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (cell(row, 'id') === '') continue;
    out.push({
      id: String(cell(row, 'id')), name: String(cell(row, 'name')), phone: String(cell(row, 'phone')),
      specialty: String(cell(row, 'specialty')), photo: String(cell(row, 'photo')), bio: String(cell(row, 'bio')),
      experience: String(cell(row, 'experience')),
      aktif: String(cell(row, 'aktif')).trim().toUpperCase() !== 'FALSE',
      headline: String(cell(row, 'headline')), certifications: _coachList_(cell(row, 'certifications')),
      achievements: _coachList_(cell(row, 'achievements')), location: String(cell(row, 'location')),
      instagram: String(cell(row, 'instagram')), photoFileId: String(cell(row, 'photoFileId')),
      shareType: String(cell(row, 'shareType')), shareValue: cell(row, 'shareValue'), _row: i + 1
    });
  }
  return out;
}

function _activeCoaches_() { return _coachesAll_().filter(function(c) { return c.aktif; }); }

/** Coach "Ini saya": COACH_SELF_ID kalau masih aktif, kalau tidak coach aktif pertama; null kalau tidak ada. */
function _selfCoach_() {
  const active = _activeCoaches_();
  const saved = PropertiesService.getScriptProperties().getProperty('COACH_SELF_ID');
  return active.find(function(c) { return c.id === saved; }) || active[0] || null;
}

function _publicCoach_(c) {
  const out = {};
  COACH_PUBLIC_KEYS.forEach(function(k) { out[k] = c[k]; });
  return out;
}

/** Publik: hanya coach aktif dan hanya field whitelist (CP-5). */
function getCoaches() {
  return _activeCoaches_().map(_publicCoach_);
}

/** Murni: validasi + bersihkan data profil coach. Melempar kalimat Indonesia yang diakhiri titik. */
function _validateCoach_(d) {
  d = d || {};
  const str = function(v) { return String(v == null ? '' : v).trim(); };
  const maxLen = function(v, n, label) { if (v.length > n) throw new Error(label + ' maksimal ' + n + ' karakter.'); return v; };
  const name = str(d.name);
  if (!name || name.length > 60) throw new Error('Nama coach wajib diisi, maksimal 60 karakter.');
  const phone = _normalizePhone_(d.phone);
  if (phone.length < 10 || phone.length > 15) throw new Error('Nomor WhatsApp coach harus 10-15 angka.');
  const specialty = maxLen(str(d.specialty), 200, 'Spesialisasi');
  if (_coachList_(specialty).length > 8 || _coachList_(specialty).some(function(x) { return x.length > 40; })) {
    throw new Error('Spesialisasi maksimal 8 item, masing-masing 40 karakter.');
  }
  const out = {
    name: name, phone: phone, specialty: specialty,
    experience: maxLen(str(d.experience), 40, 'Pengalaman'), bio: maxLen(str(d.bio), 600, 'Bio'),
    headline: maxLen(str(d.headline), 80, 'Headline'), location: maxLen(str(d.location), 60, 'Lokasi')
  };
  COACH_LIST_KEYS.forEach(function(k) {
    const label = k === 'certifications' ? 'Sertifikasi' : 'Prestasi';
    const items = Array.isArray(d[k]) ? d[k].map(str).filter(Boolean) : _coachList_(d[k]);
    if (items.length > 10) throw new Error(label + ' maksimal 10 item.');
    items.forEach(function(x) {
      if (x.length > 60) throw new Error('Setiap item ' + label + ' maksimal 60 karakter.');
      if (x.indexOf(',') !== -1) throw new Error('Item ' + label + ' tidak boleh berisi koma.');
    });
    out[k] = items;
  });
  const ig = str(d.instagram).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[\/?].*$/, '');
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) throw new Error('Instagram harus berupa username (huruf, angka, titik, garis bawah; maks 30).');
  out.instagram = ig;
  return out;
}

function _coachPhotoFileId_(url, given) {
  if (given) return String(given);
  const m = /[?&]id=([^&]+)/.exec(String(url || ''));
  return m ? m[1] : '';
}

// ── 📂 CRUD ──────────────────────────────────────────────────────────────────

function addCoach(token, coachData) {
  requireAdmin_(token);
  const data = Object.assign({}, coachData || {});
  delete data.id;
  return saveCoach(token, data);
}

/** Update data profil coach (termasuk foto, bio, pengalaman). */
function updateCoach(token, coachData) {
  requireAdmin_(token);
  if (!coachData || !coachData.id) throw new Error('Coach tidak ditemukan.');
  return saveCoach(token, coachData);
}

/**
 * Tambah (tanpa data.id) atau ubah coach. Validasi dulu, tulis di dalam lock. Kalau nama berubah,
 * nama di klien (MemberData) dan jadwal yang belum selesai ikut diperbarui; jadwal selesai & log transaksi
 * tetap memakai nama saat itu. Foto lama dipindah ke tempat sampah bila diganti.
 */
function saveCoach(token, data) {
  requireAdmin_(token);
  const clean = _validateCoach_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ctx = _ensureCoachSchema_();
    const sheet = ctx.sheet, idx = ctx.idx;
    const photoGiven = Object.prototype.hasOwnProperty.call(data, 'photo');
    const photo = photoGiven ? String(data.photo || '') : null;
    const fileId = photoGiven ? _coachPhotoFileId_(photo, data.fotoFileId) : null;
    const values = {
      name: clean.name, phone: clean.phone, specialty: clean.specialty, bio: clean.bio, experience: clean.experience,
      headline: clean.headline, location: clean.location, instagram: clean.instagram,
      certifications: clean.certifications.join(', '), achievements: clean.achievements.join(', ')
    };
    if (photoGiven) { values.photo = photo; values.photoFileId = fileId; }

    if (!data.id) {
      const id = 'COACH-' + new Date().getTime();
      const row = [];
      for (let i = 0; i < sheet.getLastColumn(); i++) row.push('');
      row[idx.id] = id;
      row[idx.aktif] = true;
      Object.keys(values).forEach(function(k) { row[idx[k]] = values[k]; });
      sheet.appendRow(row);
      _bustSlots_();   // sesudah menulis: coach baru menambah kursi
      return { status: 'success', id: id };
    }

    const existing = _coachesAll_().find(function(c) { return c.id === String(data.id); });
    if (!existing) throw new Error('Coach tidak ditemukan.');
    Object.keys(values).forEach(function(k) { sheet.getRange(existing._row, idx[k] + 1).setValue(values[k]); });
    if (existing.name !== clean.name) _renameCoachEverywhere_(existing.id, clean.name);
    if (photoGiven && existing.photoFileId && existing.photoFileId !== fileId) {
      try { DriveApp.getFileById(existing.photoFileId).setTrashed(true); } catch (e) { Logger.log('Foto coach lama tidak bisa dihapus: ' + e); }
    }
    _bustSlots_();   // sesudah menulis: buang cache jam kosong
    return { status: 'success', id: existing.id };
  } finally {
    lock.releaseLock();
  }
}

/** Nama baru ke klien (MemberData K/L) dan jadwal yang belum selesai (Schedules I/J). Panggil di dalam lock. */
function _renameCoachEverywhere_(coachId, newName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const md = ss.getSheetByName('MemberData');
  if (md) {
    const rows = md.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) if (String(rows[i][10]) === coachId) md.getRange(i + 1, 12).setValue(newName);
  }
  const sc = ss.getSheetByName('Schedules');
  if (sc) {
    const rows = sc.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][8]) === coachId && String(rows[i][7]).toLowerCase() !== 'completed') sc.getRange(i + 1, 10).setValue(newName);
    }
  }
}

/** Berapa jadwal, klien, dan baris log yang masih menunjuk ke tiap coach: { coachId: {sessions, clients, logEntries} }. */
function _coachUsage_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usage = {};
  const bump = function(id, key) {
    id = String(id || '').trim();
    if (!id) return;
    (usage[id] || (usage[id] = { sessions: 0, clients: 0, logEntries: 0 }))[key]++;
  };
  const sc = ss.getSheetByName('Schedules');
  if (sc) sc.getDataRange().getValues().slice(1).forEach(function(r) { bump(r[8], 'sessions'); });
  const md = ss.getSheetByName('MemberData');
  if (md) md.getDataRange().getValues().slice(1).forEach(function(r) { bump(r[10], 'clients'); });
  const lg = ss.getSheetByName('Members');
  if (lg) lg.getDataRange().getValues().slice(1).forEach(function(r) { bump(r[7], 'logEntries'); });
  return usage;
}

/** Semua coach untuk panel: field lengkap, pemakaian, penanda "Ini saya", dan apakah mode solo. */
function getCoachesAdmin(token) {
  requireAdmin_(token);
  const usage = _coachUsage_();
  const self = _selfCoach_();
  const all = _coachesAll_();
  return {
    coaches: all.map(function(c) {
      const out = Object.assign({}, c);
      delete out._row;
      out.usage = usage[c.id] || { sessions: 0, clients: 0, logEntries: 0 };
      out.isSelf = !!self && self.id === c.id;
      return out;
    }),
    selfId: self ? self.id : '',
    solo: all.filter(function(c) { return c.aktif; }).length === 1
  };
}

function setCoachActive(token, id, aktif) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const all = _coachesAll_();
    const coach = all.find(function(c) { return c.id === String(id); });
    if (!coach) throw new Error('Coach tidak ditemukan.');
    if (!aktif && coach.aktif && all.filter(function(c) { return c.aktif; }).length <= 1) throw new Error('Harus ada satu coach aktif.');
    const ctx = _ensureCoachSchema_();
    const fresh = _coachesAll_().find(function(c) { return c.id === coach.id; });
    ctx.sheet.getRange(fresh._row, ctx.idx.aktif + 1).setValue(!!aktif);
    const props = PropertiesService.getScriptProperties();
    if (!aktif && props.getProperty('COACH_SELF_ID') === coach.id) props.deleteProperty('COACH_SELF_ID');
    _bustSlots_();   // sesudah menulis: jumlah coach aktif = jumlah kursi
    return { status: 'success' };
  } finally {
    lock.releaseLock();
  }
}

/** Hapus coach hanya kalau tidak dipakai di jadwal, klien, atau log. Kalau dipakai: Nonaktifkan saja. */
function deleteCoach(token, coachId) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const coach = _coachesAll_().find(function(c) { return c.id === String(coachId); });
    if (!coach) throw new Error('Coach tidak ditemukan.');
    const u = _coachUsage_()[coach.id] || { sessions: 0, clients: 0, logEntries: 0 };
    if (u.sessions || u.clients || u.logEntries) {
      throw new Error('Coach dipakai ' + u.sessions + ' jadwal / ' + u.clients + ' klien. Nonaktifkan saja.');
    }
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Coaches').deleteRow(coach._row);
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('COACH_SELF_ID') === coach.id) props.deleteProperty('COACH_SELF_ID');
    _bustSlots_();   // sesudah menulis: buang cache jam kosong
    return { status: 'success' };
  } finally {
    lock.releaseLock();
  }
}

function setSelfCoach(token, id) {
  requireAdmin_(token);
  const coach = _activeCoaches_().find(function(c) { return c.id === String(id); });
  if (!coach) throw new Error('Pilih coach yang aktif.');
  PropertiesService.getScriptProperties().setProperty('COACH_SELF_ID', coach.id);
  return { status: 'success' };
}

/** Beri coach "Ini saya" ke semua jadwal (belum selesai) dan klien yang belum punya coach. opts.dryRun = hanya hitung. */
function assignUnassignedToSelf(token, opts) {
  requireAdmin_(token);
  const dryRun = !!(opts && opts.dryRun);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const self = _selfCoach_();
    if (!self) throw new Error('Belum ada coach aktif.');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const blank = function(v) { const t = String(v == null ? '' : v).trim(); return t === '' || t === COACH_UNASSIGNED_TEXT; };
    let sessions = 0, clients = 0;
    const sc = ss.getSheetByName('Schedules');
    if (sc) {
      const rows = sc.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (!blank(rows[i][8]) || String(rows[i][7]).toLowerCase() === 'completed' || String(rows[i][0]) === '') continue;
        sessions++;
        if (!dryRun) { sc.getRange(i + 1, 9).setValue(self.id); sc.getRange(i + 1, 10).setValue(self.name); }
      }
    }
    const md = ss.getSheetByName('MemberData');
    if (md) {
      const rows = md.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === '' || !blank(rows[i][10])) continue;
        clients++;
        if (!dryRun) { md.getRange(i + 1, 11).setValue(self.id); md.getRange(i + 1, 12).setValue(self.name); }
      }
    }
    if (!dryRun) _bustSlots_();   // sesudah menulis: coach jadwal berubah
    return { status: 'success', dryRun: dryRun, sessions: sessions, clients: clients, coachName: self.name };
  } finally {
    lock.releaseLock();
  }
}

// ── 📂 PHOTO_UPLOAD ──────────────────────────────────────────────────────────

/**
 * Ambil (atau buat) folder Drive khusus foto coach. ID folder di-cache di
 * PropertiesService supaya tidak buat folder baru berulang kali.
 */
function _getCoachPhotoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('COACH_PHOTO_FOLDER_ID');

  if (savedId) {
    try {
      // Folder sudah pernah dibuat sebelumnya, langsung pakai ID-nya.
      return DriveApp.getFolderById(savedId);
    } catch (e) {
      // ID tersimpan sudah tidak valid (misal foldernya kehapus manual),
      // lanjut ke bawah untuk buat folder baru.
    }
  }

  // Baru dijalankan pertama kali (atau folder lama sudah hilang): buat folder baru.
  const folder = DriveApp.createFolder('XNK_CoachPhotos');
  props.setProperty('COACH_PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

// Validasi upload gambar dari browser: hanya format gambar umum, maks ~5 MB.
function _checkImageUpload_(base64Data, mimeType) {
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].indexOf(String(mimeType)) === -1) {
    throw new Error('Tipe file harus berupa gambar (JPG, PNG, WEBP, atau GIF)');
  }
  if (typeof base64Data !== 'string' || !base64Data || base64Data.length > 7000000) {
    throw new Error('Ukuran foto maksimal 5 MB');
  }
}

/**
 * Upload foto coach ke Google Drive (folder khusus, ID di-cache), kembalikan
 * link foto yang bisa langsung dipakai di tag <img>.
 * base64Data: string base64 TANPA prefix "data:image/...;base64,"
 */
function uploadCoachPhoto(token, base64Data, fileName, mimeType) {
  requireAdmin_(token);
  try {
    _checkImageUpload_(base64Data, mimeType);

    const folder = _getCoachPhotoFolder_();

    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    // Format ini paling stabil untuk ditampilkan langsung di <img src="...">
    const photoUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w500';

    return { status: 'success', url: photoUrl, fileId: fileId };
  } catch (err) {
    throw new Error('Gagal upload foto: ' + err.message);
  }
}


// #############################################################################
// 📁 04_MEMBERS — Manajemen Data Member (Klien)
// #############################################################################
//
// STRUKTUR DATA (sejak migrasi split-sheet):
//   Sheet "MemberData" = data master klien, 1 baris/klien (profil + kuota aktif).
//     Kolom: ID, Nama, No WA, Tujuan (Goal), Tanggal Gabung, Foto URL,
//            Paket ID Aktif, Nama Paket Aktif, Total Sesi, Sesi Terpakai,
//            Coach ID, Nama Coach
//   Sheet "Members" = log transaksi murni, banyak baris/klien (riwayat beli/perpanjang).
//     Kolom: Transaksi ID, Member ID, Tanggal, Jenis Transaksi, Paket ID,
//            Nama Paket, Jumlah Sesi, Coach ID, Nama Coach, Catatan
//
// SEMUA fungsi CRUD profil & kuota klien baca/tulis ke "MemberData".
// Sheet "Members" HANYA ditambah baris baru (append), tidak pernah di-update/overwrite,
// supaya riwayat transaksi (kapan daftar, kapan perpanjang) tetap utuh.

// ── 📂 MEMBERDATA (Sheet Master) ────────────────────────────────────────────

const MEMBERDATA_HEADERS = ["ID", "Nama", "No WA", "Tujuan (Goal)", "Tanggal Gabung", "Foto URL", "Paket ID Aktif", "Nama Paket Aktif", "Total Sesi", "Sesi Terpakai", "Coach ID", "Nama Coach", "Tanggal Update Terakhir", "Kunci Link"];
const MEMBERS_LOG_HEADERS = ["Transaksi ID", "Member ID", "Tanggal", "Jenis Transaksi", "Paket ID", "Nama Paket", "Jumlah Sesi", "Coach ID", "Nama Coach", "Catatan"];

/**
 * Ambil (atau buat) sheet "MemberData" — data master klien, 1 baris/klien.
 * Kolom tanggal (E: Tanggal Gabung, M: Tanggal Update Terakhir) dipaksa format
 * Plain Text, supaya Google Sheets TIDAK auto-convert nilai "D/M/YYYY" yang kita
 * tulis jadi tipe Date asli (yang bikin sanitizeValue() mengubahnya jadi ISO string
 * dan kacaukan parsing/sorting tanggal berbasis split "/").
 */
function _getMemberDataSheet_() {
  const sheet = getOrCreateSheet_('MemberData', MEMBERDATA_HEADERS);
  sheet.getRange('E:E').setNumberFormat('@');
  sheet.getRange('M:M').setNumberFormat('@');
  // Sheet lama belum punya kolom N "Kunci Link" (kunci sesi klien): tambahkan
  // headernya — HANYA kalau sel N1 masih kosong, supaya kolom buatan sendiri tidak tertimpa.
  const keyHeader = sheet.getRange(1, MEMBER_KEY_COL);
  if (keyHeader.getValue() === '') {
    keyHeader.setValue('Kunci Link');
    keyHeader.setFontWeight('bold');
  }
  return sheet;
}

// true kalau kolom N MemberData memang kolom "Kunci Link".
function _memberKeyColumnReady_(sheet) {
  return sheet.getRange(1, MEMBER_KEY_COL).getValue() === 'Kunci Link';
}

/**
 * Ambil (atau buat) sheet "Members" — log transaksi murni (append-only).
 * Kolom C (Tanggal) dipaksa Plain Text, sama alasannya seperti di MemberData:
 * mencegah Sheets auto-convert "D/M/YYYY" jadi tipe Date yang kacaukan parsing.
 */
const MEMBERS_LOG_PRICE_COL = 11;   // K "Harga": harga paket saat transaksi (untuk laporan pendapatan)
function _getMembersLogSheet_() {
  const sheet = getOrCreateSheet_('Members', MEMBERS_LOG_HEADERS);
  sheet.getRange('C:C').setNumberFormat('@');
  const priceHeader = sheet.getRange(1, MEMBERS_LOG_PRICE_COL);
  if (priceHeader.getValue() === '') { priceHeader.setValue('Harga'); priceHeader.setFontWeight('bold'); }
  return sheet;
}

/**
 * Tambah 1 baris log transaksi ke sheet "Members" (append-only, tidak pernah overwrite).
 * jenis: "Baru" | "Perpanjang" | "Ganti Paket"
 */
function _tulisLogTransaksiMember_(memberId, jenis, paketId, namaPaket, jumlahSesi, coachId, namaCoach, catatan, harga) {
  const sheet = _getMembersLogSheet_();
  const trxId = 'TRX-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
  const now = new Date();
  const dateStr = now.getDate() + '/' + (now.getMonth() + 1) + '/' + now.getFullYear();
  const price = (typeof harga === 'number' && isFinite(harga)) ? harga : '';   // harga saat transaksi; '' = tidak diketahui
  sheet.appendRow([trxId, memberId, dateStr, jenis, paketId || '', namaPaket || '', jumlahSesi || 0, coachId || '', namaCoach || '', catatan || '', price]);
  _finBillFromTransaction_({ trxId: trxId, memberId: memberId, paketId: paketId, namaPaket: namaPaket, coachId: coachId, dateStr: dateStr, price: price });   // Fase H: tagihan (hanya bila aktif)
  return trxId;
}

/**
 * Ambil seluruh riwayat transaksi klien (dari sheet "Members") untuk ditampilkan
 * sebagai "card arsip" di tab Klien — 1 card per transaksi SELAIN transaksi terakhir
 * tiap klien (transaksi terakhir sudah terwakili oleh card live dari getMembers()).
 *
 * Nama & foto diambil dari data klien saat ini (MemberData) via memberId, karena log
 * transaksi sendiri tidak menyimpan nama (menghindari data ganda yang bisa basi).
 */
function getMemberTransactionLog(token) {
  requireAdmin_(token);
  const logSheet = _getMembersLogSheet_();
  const logData = logSheet.getDataRange().getValues();
  if (logData.length <= 1) return [];

  // Index nama & foto klien saat ini, keyed by ID
  const membersById = {};
  _getMembersAll_().forEach(function(m) { membersById[String(m.id)] = m; });

  function parseTglFleksibel(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val) ? null : val;
    const parts = String(val).split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10), m = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
      if (d && m && y) return new Date(y, m - 1, d);
    }
    const fallback = new Date(val);
    return isNaN(fallback) ? null : fallback;
  }

  // Kumpulkan semua transaksi per member, urut berdasarkan tanggal
  const trxByMember = {}; // { memberId: [{...}, ...] }
  for (let i = 1; i < logData.length; i++) {
    const row = logData[i];
    const memberId = String(row[1] || '').trim();
    if (!memberId) continue;
    const tglObj = parseTglFleksibel(row[2]);
    if (!tglObj) continue;

    if (!trxByMember[memberId]) trxByMember[memberId] = [];
    trxByMember[memberId].push({
      trxId: sanitizeValue(row[0]),
      memberId: memberId,
      date: tglObj,
      dateStr: row[2] instanceof Date ? (tglObj.getDate() + '/' + (tglObj.getMonth() + 1) + '/' + tglObj.getFullYear()) : String(row[2]),
      jenis: sanitizeValue(row[3]),
      packageId: sanitizeValue(row[4]),
      packageName: sanitizeValue(row[5]),
      totalSessions: parseInt(row[6]) || 0
    });
  }

  // Untuk tiap member, semua transaksi KECUALI yang paling akhir jadi entri arsip.
  // Kalau cuma ada 1 transaksi (belum pernah perpanjang), tidak ada arsip sama sekali
  // — klien itu cukup diwakili card live.
  const archiveEntries = [];
  Object.keys(trxByMember).forEach(function(memberId) {
    const trxList = trxByMember[memberId];
    if (trxList.length < 2) return; // belum pernah perpanjang, tidak perlu arsip

    trxList.sort(function(a, b) { return a.date - b.date; });
    const member = membersById[memberId];
    if (!member) return; // klien sudah dihapus, jangan tampilkan arsipnya

    // Semua transaksi kecuali yang terakhir (index paling akhir = transaksi terbaru)
    for (let i = 0; i < trxList.length - 1; i++) {
      const trx = trxList[i];
      archiveEntries.push({
        id: member.id,
        trxId: trx.trxId,
        name: member.name,
        phone: member.phone,
        photo: member.photo,
        date: trx.dateStr,
        jenis: trx.jenis,
        packageName: trx.packageName || 'Paket Standar',
        totalSessions: trx.totalSessions
      });
    }
  });

  return archiveEntries;
}

/**
 * Migrasi satu kali: pindahkan data lama di sheet "Members" (1 baris/klien, format lama)
 * ke struktur baru: "MemberData" (data master) + "Members" jadi log transaksi "Baru".
 *
 * AMAN dijalankan berkali-kali: kalau "MemberData" sudah pernah diisi (ada baris data),
 * migrasi tidak akan jalan lagi supaya tidak dobel.
 *
 * CARA JALANKAN: buka Extensions > Apps Script > pilih fungsi ini di dropdown > Run.
 */
function migrateSplitMembersData() {
  requireOwner_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSheet = ss.getSheetByName('Members');
  if (!oldSheet) {
    Logger.log('Sheet Members lama tidak ditemukan, tidak ada yang dimigrasi.');
    return { status: 'skipped', reason: 'Sheet Members tidak ditemukan' };
  }

  const memberDataSheet = _getMemberDataSheet_();
  const existingRows = memberDataSheet.getDataRange().getValues();
  if (existingRows.length > 1) {
    Logger.log('MemberData sudah punya data, migrasi dibatalkan (supaya tidak dobel).');
    return { status: 'skipped', reason: 'MemberData sudah terisi' };
  }

  const oldData = oldSheet.getDataRange().getValues();
  if (oldData.length <= 1) {
    Logger.log('Sheet Members lama kosong, tidak ada yang dimigrasi.');
    return { status: 'skipped', reason: 'Members lama kosong' };
  }

  // 1. Salin tiap baris Members lama (format lama, 12 kolom) apa adanya ke MemberData
  //    Urutan lama: ID, Nama, No WA, Goal, JoinDate, TotalSesi, SesiTerpakai, FotoURL, PaketID, NamaPaket, CoachID, NamaCoach
  //    Urutan baru: ID, Nama, No WA, Goal, JoinDate, FotoURL, PaketID, NamaPaket, TotalSesi, SesiTerpakai, CoachID, NamaCoach
  const rowsForMemberData = [];
  const logEntries = []; // dikumpulkan dulu, ditulis setelah sheet Members lama di-reset

  for (let i = 1; i < oldData.length; i++) {
    const row = oldData[i];
    const id = row[0], nama = row[1], noWa = row[2], goal = row[3], joinDate = row[4];
    const totalSesi = row[5], sesiTerpakai = row[6], fotoUrl = row[7] || '';
    const paketId = row[8] || '', namaPaket = row[9] || '';
    const coachId = row[10] || '', namaCoach = row[11] || '';

    if (!id) continue; // lewati baris kosong

    const dateStr = joinDate instanceof Date
      ? (joinDate.getDate() + '/' + (joinDate.getMonth() + 1) + '/' + joinDate.getFullYear())
      : String(joinDate);

    rowsForMemberData.push([id, nama, noWa, goal, joinDate, fotoUrl, paketId, namaPaket, totalSesi, sesiTerpakai, coachId, namaCoach, dateStr, _newMemberKey_()]);

    logEntries.push(['TRX-' + id, id, dateStr, 'Baru', paketId, namaPaket, totalSesi, coachId, namaCoach, 'Migrasi dari data lama']);
  }

  if (rowsForMemberData.length > 0) {
    memberDataSheet.getRange(2, 1, rowsForMemberData.length, MEMBERDATA_HEADERS.length).setValues(rowsForMemberData);
  }

  // 2. Reset sheet "Members" jadi log transaksi murni: hapus semua baris lama, pasang header baru,
  //    lalu isi dengan 1 baris "Baru" per klien (histori tidak hilang, cuma berubah bentuk).
  const lastRow = oldSheet.getLastRow();
  if (lastRow > 1) {
    oldSheet.getRange(2, 1, lastRow - 1, oldSheet.getLastColumn()).clearContent();
  }
  oldSheet.getRange(1, 1, 1, MEMBERS_LOG_HEADERS.length).setValues([MEMBERS_LOG_HEADERS]);
  oldSheet.getRange(1, 1, 1, MEMBERS_LOG_HEADERS.length).setFontWeight('bold');

  if (logEntries.length > 0) {
    oldSheet.getRange(2, 1, logEntries.length, MEMBERS_LOG_HEADERS.length).setValues(logEntries);
  }

  Logger.log('Migrasi selesai: ' + rowsForMemberData.length + ' klien dipindah ke MemberData, ' + logEntries.length + ' log transaksi "Baru" ditulis ke Members.');
  return { status: 'success', migrated: rowsForMemberData.length };
}

// ── 📂 CRUD ──────────────────────────────────────────────────────────────────

// Urutan kolom MemberData: ID(0) Nama(1) NoWA(2) Goal(3) JoinDate(4) FotoURL(5)
//                           PaketID(6) NamaPaket(7) TotalSesi(8) SesiTerpakai(9) CoachID(10) NamaCoach(11)
function getMemberSessions(memberToken) {
  const row = requireMember_(memberToken).row;
  const total = parseInt(row[8]) || 0;
  const used = parseInt(row[9]) || 0;
  const namaPaket = row[7];
  return {
    total: total,
    used: used,
    remaining: total - used,
    pct: total > 0 ? Math.round((used / total) * 100) : 0,
    packageName: namaPaket ? namaPaket : 'Paket Standar'
  };
}

// Helper: parse tanggal yang bisa datang dalam 2 bentuk —
//   1) String "D/M/YYYY" (format yang sengaja kita tulis di sheet)
//   2) Date object / ISO string (kalau Sheets sempat auto-convert sebelum kolom
//      dipaksa Plain Text, atau data lama sebelum fix ini) — fallback ke Date() native.
// Dipakai untuk sorting kronologis yang aman, terlepas dari lokal/format Date bawaan Sheets.
function _parseTanggalDMY_(str) {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str) ? null : str;
  const parts = String(str).split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10), m = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
    if (d && m && y) return new Date(y, m - 1, d);
  }
  const fallback = new Date(str);
  return isNaN(fallback) ? null : fallback;
}

/** Admin: daftar semua klien (termasuk No WA). */
function getMembers(token) {
  requireAdmin_(token);
  return _getMembersAll_();
}

function _getMembersAll_() {
  const sheet = _getMemberDataSheet_();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  // Kunci sesi (kolom N) TIDAK ikut dikirim.
  const list = data.slice(1).filter(function(row) { return row[0]; }).map(_memberPublicProfile_);

  // Urutkan berdasarkan tanggal aktivitas terakhir (lama -> baru) supaya pengelompokan
  // bulan di tab Klien rapi: klien yang baru perpanjang otomatis pindah ke bawah/bulan terbaru.
  list.sort(function(a, b) {
    const da = _parseTanggalDMY_(a.lastActivityDate);
    const db = _parseTanggalDMY_(b.lastActivityDate);
    if (!da && !db) return 0;
    if (!da) return -1;
    if (!db) return 1;
    return da - db;
  });

  return list;
}

/**
 * Tambah klien baru, ATAU kalau No WA sudah terdaftar di MemberData, otomatis
 * dianggap PERPANJANG (paket & kuota di-reset sesuai paket baru, riwayat lama
 * tetap tersimpan sebagai log transaksi "Perpanjang" di sheet Members).
 */
/** Admin: tambah klien baru, atau perpanjang kalau No WA sudah terdaftar. */
function addMember(token, memberData) {
  requireAdmin_(token);
  return _addMemberInternal_(memberData);
}

function _findMemberRowIndexByPhone_(data, phone) {
  const target = _normalizePhone_(phone);
  if (!target) return -1;
  for (let i = 1; i < data.length; i++) {
    if (_normalizePhone_(data[i][2]) === target) return i;
  }
  return -1;
}

/**
 * @param {Object} memberData
 * @param {{newOnly?:boolean, silent?:boolean}} [options]
 *   newOnly: kalau No WA sudah terdaftar, JANGAN ubah apa pun → {status:'exists'}
 *            (dipakai pendaftaran publik supaya tidak bisa me-reset kuota orang lain).
 *   silent:  jangan kirim notif Telegram (pemanggil mengirim notifnya sendiri).
 */
function _addMemberInternal_(memberData, options) {
  options = options || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = _getMemberDataSheet_();
    const data = sheet.getDataRange().getValues();

    // 0. Cek apakah No WA ini sudah pernah terdaftar sebagai klien (deteksi klien lama)
    const existingRowIndex = _findMemberRowIndexByPhone_(data, memberData.phone); // index di `data` (0-based, termasuk header)
    const isPerpanjang = existingRowIndex !== -1;
    if (isPerpanjang && options.newOnly) return { status: 'exists' };
    const keyColumnReady = _memberKeyColumnReady_(sheet);

    const d = new Date();
    const dateStr = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();

    // 1. Cari data paket yang dipilih admin dari PriceList (jika ada)
    let paketId = '', paketNama = '', paketHarga = '';
    let totalSessions = memberData.totalSessions || 10;
    if (memberData.packageId) {
      const allPackages = getPriceList();
      const selectedPkg = allPackages.find(function(p) { return String(p.id) === String(memberData.packageId); });
      if (selectedPkg && selectedPkg.tipe === 'kelas' && selectedPkg.kapasitas) {
        // Kelas penuh: tolak, kecuali klien ini sudah memegang kursi di kelas yang sama (perpanjang).
        const holdsSeat = isPerpanjang && String(data[existingRowIndex][6] || '').trim() === String(selectedPkg.id) &&
          (parseInt(data[existingRowIndex][9], 10) || 0) < (parseInt(data[existingRowIndex][8], 10) || 0);
        if (!holdsSeat && selectedPkg.terisi >= selectedPkg.kapasitas) throw new Error('Kelas sudah penuh.');
      }
      if (selectedPkg) {
        paketId = selectedPkg.id;
        paketNama = selectedPkg.namaPaket;
        paketHarga = selectedPkg.harga;
        // Kalau admin tidak override Total Sesi secara manual, pakai jumlah sesi dari paket
        if (!memberData.totalSessions && selectedPkg.jumlahSesi) {
          totalSessions = selectedPkg.jumlahSesi;
        }
      }
    }

    // 2. Cari data coach yang dipilih admin sebagai coach default klien ini (jika ada)
    let coachId = '', coachNama = '';
    if (memberData.coachId) {
      const allCoaches = _coachesAll_();
      const selectedCoach = allCoaches.find(function(c) { return String(c.id) === String(memberData.coachId); });
      if (selectedCoach) {
        coachId = selectedCoach.id;
        coachNama = selectedCoach.name;
      }
    }

    let id, memberKey;
    const usedSessions = memberData.usedSessions || 0;

    if (isPerpanjang) {
      // ── PERPANJANG: update baris MemberData yang sudah ada, kuota di-RESET sesuai paket baru ──
      id = data[existingRowIndex][0];
      const rowNum = existingRowIndex + 1;
      if (keyColumnReady) {
        memberKey = String(data[existingRowIndex][MEMBER_KEY_COL - 1] || '');
        if (!/^[a-f0-9]{32}$/i.test(memberKey)) {
          memberKey = _newMemberKey_();
          sheet.getRange(rowNum, MEMBER_KEY_COL).setValue(memberKey);
        }
      }
      sheet.getRange(rowNum, 4).setValue(memberData.goal);            // Tujuan (boleh update)
      sheet.getRange(rowNum, 7).setValue(paketId || data[existingRowIndex][6]);
      sheet.getRange(rowNum, 8).setValue(paketNama || data[existingRowIndex][7]);
      sheet.getRange(rowNum, 9).setValue(totalSessions);              // Total Sesi (reset ke paket baru)
      sheet.getRange(rowNum, 10).setValue(usedSessions);              // Sesi Terpakai (reset)
      if (coachId) {
        sheet.getRange(rowNum, 11).setValue(coachId);
        sheet.getRange(rowNum, 12).setValue(coachNama);
      }
      // Tanggal Update Terakhir di-set ke HARI INI (bukan Tanggal Gabung asli, yang dibiarkan
      // tetap) supaya di tab Klien card ini pindah muncul di bulan & tanggal perpanjangan.
      sheet.getRange(rowNum, 13).setValue(dateStr);

      _tulisLogTransaksiMember_(id, 'Perpanjang', paketId, paketNama, totalSessions, coachId, coachNama, 'Perpanjang via form Tambah Klien', paketHarga);
    } else {
      // ── KLIEN BARU: baris baru di MemberData + log "Baru" di Members ──
      id = 'PT-' + new Date().getTime();
      const newRow = [
        id, memberData.name, memberData.phone.toString(), memberData.goal, dateStr,
        "", paketId, paketNama, totalSessions, usedSessions, coachId, coachNama, dateStr
      ];
      if (keyColumnReady) {
        memberKey = _newMemberKey_();
        newRow.push(memberKey);
      }
      sheet.appendRow(newRow);

      _tulisLogTransaksiMember_(id, 'Baru', paketId, paketNama, totalSessions, coachId, coachNama, 'Klien baru', paketHarga);
    }

    // 3. Format Nomor WA
    const noWa = _normalizePhone_(memberData.phone);

    // 4. Buat Template Chat WA + Link Booking (klien masuk pakai nomor WA ini)
    const templateWA = (isPerpanjang
        ? "Halo " + memberData.name + ", paket latihan kamu sudah diperpanjang! 🎉\n\n"
        : "Halo " + memberData.name + ", terima kasih sudah bergabung! 🎉\n\n") +
      "Untuk mengatur jadwal latihan, silakan booking jadwal sesi kamu melalui link berikut " +
      "(masuk pakai nomor WhatsApp ini):\n" +
      "👉 https://book.xnkbooking.my.id\n\n" +
      "Jika ada pertanyaan, silakan balas pesan ini ya. Terima kasih!";

    const waLink = "https://wa.me/" + noWa + "?text=" + encodeURIComponent(templateWA);

    // 5. Susun Pesan Notifikasi Telegram
    const pesanTelegram = (isPerpanjang ? "🔁 <b>KLIEN PERPANJANG PAKET!</b> 🔁\n\n" : "🚨 <b>MEMBER BARU DITAMBAHKAN!</b> 🚨\n\n") +
                          "👤 <b>Nama:</b> " + escapeHtmlTelegram(memberData.name) + "\n" +
                          "📞 <b>No WA:</b> +" + noWa + "\n" +
                          "🎯 <b>Tujuan:</b> " + escapeHtmlTelegram(memberData.goal) + "\n" +
                          (paketNama ? "🏷️ <b>Paket:</b> " + escapeHtmlTelegram(paketNama) + "\n" : "") +
                          (coachNama ? "🧑‍🏫 <b>Coach:</b> " + escapeHtmlTelegram(coachNama) + "\n" : "") +
                          "📦 <b>Total Sesi:</b> " + totalSessions + " Sesi\n\n" +
                          "👉 <a href='" + _escHtml_(waLink) + "'>Chat Klien & Minta Booking</a>";

    // 6. Kirim Notifikasi Telegram
    if (!options.silent) {
      try {
        kirimNotifTelegram_(pesanTelegram);
      } catch(e) {
        Logger.log("Notif Telegram gagal: " + e);
      }
    }

    return { status: 'success', id: id, renewed: isPerpanjang, packageId: paketId, packageName: paketNama, totalSessions: totalSessions, coachId: coachId, coachName: coachNama, waLink: waLink };
  } catch (error) {
    throw new Error('Gagal menyimpan klien: ' + error.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fungsi mengedit (update) profil klien secara penuh dari panel admin.
 * Update ini murni edit profil (bukan transaksi), jadi hanya menulis ke MemberData,
 * TIDAK menambah log transaksi baru di Members.
 */
function updateMemberProfile(token, memberData) {
  requireAdmin_(token);
  return _locked_(function() { return _updateMemberProfile_(memberData || {}); });
}

function _updateMemberProfile_(memberData) {
  const sheet = _getMemberDataSheet_();
  const data = sheet.getDataRange().getValues();
  const targetId = String(memberData.id).trim();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === targetId) {
      sheet.getRange(i + 1, 2).setValue(memberData.name);
      sheet.getRange(i + 1, 3).setValue(memberData.phone.toString());
      sheet.getRange(i + 1, 4).setValue(memberData.goal);
      sheet.getRange(i + 1, 9).setValue(memberData.totalSessions);
      sheet.getRange(i + 1, 10).setValue(memberData.usedSessions);

      if (memberData.packageId) {
        const allPackages = getPriceList();
        const selectedPkg = allPackages.find(function(p) { return String(p.id) === String(memberData.packageId); });
        sheet.getRange(i + 1, 7).setValue(memberData.packageId);
        sheet.getRange(i + 1, 8).setValue(selectedPkg ? selectedPkg.namaPaket : '');
      }

      if (typeof memberData.coachId !== 'undefined') {
        if (memberData.coachId) {
          const allCoaches = _coachesAll_();
          const selectedCoach = allCoaches.find(function(c) { return String(c.id) === String(memberData.coachId); });
          sheet.getRange(i + 1, 11).setValue(memberData.coachId);
          sheet.getRange(i + 1, 12).setValue(selectedCoach ? selectedCoach.name : '');
        } else {
          // Admin memilih "Belum Ditentukan" -> kosongkan coach favorit klien
          sheet.getRange(i + 1, 11).setValue('');
          sheet.getRange(i + 1, 12).setValue('');
        }
      }

      try {
        kirimNotifTelegram_("✏️ <b>PROFIL KLIEN DIUBAH</b>\n\n" +
          "👤 <b>Nama:</b> " + escapeHtmlTelegram(memberData.name) + "\n" +
          "🎯 <b>Tujuan:</b> " + escapeHtmlTelegram(memberData.goal) + "\n" +
          "📦 <b>Sesi:</b> " + memberData.usedSessions + "/" + memberData.totalSessions);
      } catch(e) { Logger.log("Notif Telegram gagal: " + e); }

      return { status: 'success' };
    }
  }
  throw new Error('Klien tidak ditemukan');
}

// Format "Rp 1.500.000" tanpa bergantung pada dukungan locale Intl di server.
function _formatRupiah_(n) {
  return 'Rp ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Pendaftaran mandiri klien dari halaman publik (Landing & katalog portal klien).
 * - Jumlah sesi & harga SELALU diambil dari PriceList di server berdasarkan
 *   packageId; nilai sesi/harga dari browser diabaikan.
 * - No WA baru: klien langsung aktif (seperti sebelumnya) dan langsung masuk portal.
 * - No WA yang sudah terdaftar: data & kuota klien itu TIDAK diubah. PT dikabari
 *   lewat Telegram/email untuk memproses perpanjangan setelah pembayaran diterima.
 * @param {{name:string, phone:string, goal:string, packageId:string}} data
 * @returns {{status:'success', id:string, token:string, member:Object} | {status:'exists'}}
 */
function registerNewClient(data) {
  data = data || {};
  const name = String(data.name || '').trim().slice(0, 100);
  const phone = _normalizePhone_(data.phone);
  const goal = String(data.goal || '').trim().slice(0, 200);
  if (!name) throw new Error('Nama wajib diisi.');
  if (!/^62\d{8,13}$/.test(phone)) throw new Error('Nomor WhatsApp tidak valid.');

  const pkg = getPriceList().find(function(p) { return String(p.id) === String(data.packageId); });
  if (!pkg) throw new Error('Paket tidak ditemukan. Muat ulang halaman lalu pilih paket lagi.');
  const pickedCoachId = _requireClientCoach_(data.coachId);   // dua coach aktif atau lebih: wajib pilih coach
  const sessions = parseInt(pkg.jumlahSesi, 10) || 1;
  const priceStr = _formatRupiah_(pkg.harga);

  // Anti-spam: satu nomor sekali per menit, dan maksimal REGISTER_MAX_PER_10MIN pendaftaran per 10 menit.
  if (!_throttle_('reg_' + phone, 60)) throw new Error('Pendaftaran baru saja dikirim. Tunggu sebentar.');
  const regCache = CacheService.getScriptCache();
  const regCount = parseInt(regCache.get('register_count') || '0', 10);
  if (regCount >= _numProp_('REGISTER_MAX_PER_10MIN', REGISTER_MAX_PER_10MIN)) {
    throw new Error('Sedang banyak pendaftaran. Coba lagi dalam 10 menit, atau hubungi Coach lewat WhatsApp.');
  }
  regCache.put('register_count', String(regCount + 1), 600);

  const result = _addMemberInternal_({
    name: name,
    phone: phone,
    goal: goal + ' | [' + pkg.namaPaket + ' - ' + sessions + ' Sesi]',
    packageId: pkg.id,
    totalSessions: sessions,
    usedSessions: 0,
    coachId: pickedCoachId
  }, { newOnly: true, silent: true });

  const isExisting = result.status === 'exists';
  const waLink = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(
    'Halo ' + name + ', terima kasih sudah mendaftar di XNK untuk paket ' + pkg.namaPaket +
    '. Silakan kirim bukti transfer ke sini ya.');
  const title = isExisting ? 'Klien Lama Minta Perpanjang 🔁' : 'Klien Baru Mendaftar! 💸';
  const note = isExisting
    ? 'Nomor ini sudah terdaftar. Kuota klien BELUM diubah. Setelah pembayaran diterima, perpanjang lewat form Tambah Klien di panel PT.'
    : 'Klien sudah aktif dengan kuota paket ini. Konfirmasi pembayaran via WA.';

  const body = `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111827;">
      <div style="background-color: white; padding: 30px; border-radius: 12px; max-width: 500px; margin: 0 auto; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <h2 style="margin-top:0; color: #000000;">${title}</h2>
        <p>${note}</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #000000;">
          <p style="margin:0 0 8px 0;"><b>Nama:</b> ${_escHtml_(name)}</p>
          <p style="margin:0 0 8px 0;"><b>No WA:</b> +${phone}</p>
          <p style="margin:0 0 8px 0;"><b>Goal:</b> ${_escHtml_(goal || '-')}</p>
          <p style="margin:0 0 8px 0;"><b>Paket Dipilih:</b> ${_escHtml_(pkg.namaPaket)} (${sessions} Sesi)</p>
          <p style="margin:0; color: #16a34a; font-weight:bold; font-size:18px;">Total Tagihan: ${priceStr}</p>
        </div>
        <a href="${_escHtml_(waLink)}" style="display: block; width: 100%; text-align: center; background-color: #000000; color: white; padding: 12px 0; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px;">Tanya Bukti Transfer via WA</a>
      </div>
    </div>
  `;

  try {
    MailApp.sendEmail({ to: _notifEmailRecipient_(), subject: (isExisting ? '🔁 Permintaan Perpanjang: ' : '💰 Pendaftaran PT Baru: ') + name, htmlBody: body });
  } catch (e) { Logger.log('Email pendaftaran gagal: ' + e); }

  try {
    kirimNotifTelegram_((isExisting ? '🔁 <b>KLIEN LAMA MINTA PERPANJANG</b> 🔁\n\n' : '🚨 <b>MEMBER BARU MENDAFTAR!</b> 🚨\n\n') +
      '👤 <b>Nama:</b> ' + _escHtml_(name) + '\n' +
      '📞 <b>No WA:</b> +' + phone + '\n' +
      '📦 <b>Paket:</b> ' + _escHtml_(pkg.namaPaket) + ' (' + sessions + ' Sesi)\n' +
      '💰 <b>Tagihan:</b> ' + priceStr + '\n\n' +
      (isExisting ? '⚠️ Kuota belum diubah — proses perpanjangan manual setelah bayar.\n' : '') +
      "👉 <a href='" + _escHtml_(waLink) + "'>Chat Klien Sekarang</a>");
  } catch (e) { Logger.log('Notif Telegram gagal: ' + e); }

  if (isExisting) return { status: 'exists' };
  const found = _findMemberRow_(function(row) { return String(row[0]).trim() === String(result.id); });
  if (!found) return { status: 'success', id: result.id };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    _ensureGuideColumn_(found.sheet);
    found.sheet.getRange(found.rowNum, MEMBER_GUIDE_COL).setValue('baru');
    found.row[MEMBER_GUIDE_COL - 1] = 'baru';
  } finally {
    lock.releaseLock();
  }
  const session = _issueMemberSession_(found);
  return { status: 'success', id: result.id, token: session.token, member: session.member };
}

/**
 * Menghapus data klien (member) secara permanen dari MemberData.
 * Riwayat transaksinya di sheet Members (log "Baru"/"Perpanjang") SENGAJA DIBIARKAN
 * sebagai arsip — tidak ikut dihapus, sesuai keputusan yang sudah dikonfirmasi.
 */
function deleteMember(token, memberId) {
  requireAdmin_(token);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const memSheet = _getMemberDataSheet_();

    const memData = memSheet.getDataRange().getValues();
    const targetId = String(memberId).trim();
    let rowToDelete = -1;
    let deletedName = '';

    for (let i = 1; i < memData.length; i++) {
      if (String(memData[i][0]).trim() === targetId) {
        rowToDelete = i + 1;
        deletedName = memData[i][1];
        break;
      }
    }
    if (rowToDelete === -1) throw new Error('Klien tidak ditemukan');
    memSheet.deleteRow(rowToDelete);

    const schSheet = ss.getSheetByName('Schedules');
    if (schSheet) {
      const schData = schSheet.getDataRange().getValues();
      for (let i = schData.length - 1; i >= 1; i--) {
        if (String(schData[i][1]).trim() === targetId) {
          schSheet.deleteRow(i + 1);
        }
      }
    }
    _bustSlots_();   // sesudah menulis: jadwal klien ini ikut terhapus

    try {
      kirimNotifTelegram_("🗑️ <b>KLIEN DIHAPUS</b>\n\n👤 <b>Nama:</b> " + escapeHtmlTelegram(deletedName) + "\n\nSemua jadwal terkait juga sudah dihapus. Riwayat transaksi tetap tersimpan sebagai arsip.");
    } catch(e) { Logger.log("Notif Telegram gagal: " + e); }

    return { status: 'success' };
  } catch (err) {
    throw new Error('Gagal menghapus klien: ' + err.message);
  }
}

// ── 📂 PHOTO_UPLOAD ──────────────────────────────────────────────────────────
// Catatan: migrateMembersAddPhotoColumn(), migrateMembersAddPaketColumns(), dan
// migrateMembersAddCoachColumns() sudah TIDAK DIPAKAI LAGI sejak split ke MemberData,
// karena sheet MemberData dibuat langsung dengan header lengkap (getOrCreateSheet_).
// Fungsi-fungsi itu dihapus supaya tidak ada yang salah pakai ke sheet Members (log transaksi).

function _getMemberPhotoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('MEMBER_PHOTO_FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (e) {}
  }
  const folder = DriveApp.createFolder('XNK_MemberPhotos');
  props.setProperty('MEMBER_PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * Portal klien: upload foto profil klien yang sedang login, langsung disimpan
 * ke profilnya (kolom F). Klien hanya bisa mengubah fotonya sendiri.
 */
function uploadMemberPhoto(memberToken, base64Data, fileName, mimeType) {
  const member = requireMember_(memberToken);
  try {
    _checkImageUpload_(base64Data, mimeType);
    const folder = _getMemberPhotoFolder_();
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
    const file = folder.createFile(blob);
    
    // Set akses publik agar dapat dirender oleh tag <img>
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();
    
    // Menggunakan Direct CDN URL Drive yang paling stabil
    const photoUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
    _saveMemberPhoto_(member, photoUrl);

    return { status: 'success', url: photoUrl, fileId: fileId };
  } catch (err) {
    throw new Error('Gagal upload foto: ' + err.message);
  }
}

function _saveMemberPhoto_(member, photoUrl) {
  member.sheet.getRange(member.rowNum, 6).setValue(photoUrl);
  try {
    kirimNotifTelegram_("🖼️ <b>FOTO KLIEN DIPERBARUI</b>\n\n👤 <b>Nama:</b> " + escapeHtmlTelegram(member.row[1]));
  } catch(e) { Logger.log("Notif Telegram gagal: " + e); }
}

// Portal klien: simpan URL foto (hasil uploadMemberPhoto) ke profil klien yang login.
// Hanya menerima URL foto Drive milik sistem ini, bukan URL sembarang.
function updateMemberPhoto(memberToken, photoUrl) {
  const member = requireMember_(memberToken);
  if (!/^https:\/\/lh3\.googleusercontent\.com\/d\/[A-Za-z0-9_-]+$/.test(String(photoUrl))) {
    throw new Error('URL foto tidak valid.');
  }
  _saveMemberPhoto_(member, photoUrl);
  return { status: 'success' };
}

/**
 * UTILITY LAMA — sudah tidak relevan untuk struktur baru.
 * MemberData sudah 1 baris/klien by design (dijaga lewat deteksi No WA di addMember),
 * jadi tidak akan ada No WA duplikat yang perlu "dibersihkan" lagi.
 * Fungsi ini DIBIARKAN (tidak dihapus) hanya untuk jaga-jaga bersihkan sisa data lama
 * kalau suatu saat masih ada duplikat manual di MemberData — TIDAK dipanggil otomatis
 * di mana pun, dan TIDAK boleh dijalankan ke sheet Members (karena Members sekarang
 * log transaksi yang MEMANG sengaja punya banyak baris per klien).
 */
function pertahankanWABaruMemberData() {
  requireOwner_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MemberData");
  if (!sheet) return;
  var range = sheet.getDataRange();
  var values = range.getValues();

  var waColumnIndex = 2; // Kolom C (No WA) di MemberData
  var seenWA = {};

  for (var i = values.length - 1; i >= 1; i--) {
    var waNumber = values[i][waColumnIndex].toString().trim();

    if (waNumber && waNumber !== "-") {
      if (seenWA[waNumber]) {
        sheet.getRange(i + 1, waColumnIndex + 1).setValue("-");
      } else {
        seenWA[waNumber] = true;
      }
    }
  }
}

// #############################################################################
// 📁 05_SCHEDULES — Manajemen Jadwal & Transaksi Sesi Latihan
// #############################################################################

// ── 📂 CRUD ──────────────────────────────────────────────────────────────────

/** Admin: semua jadwal lengkap (nama & No WA klien, catatan). */
function getSchedules(token) {
  requireAdmin_(token);
  return _getSchedulesAll_();
}

/**
 * Publik (portal klien & kalender): jadwal TANPA nama, No WA, atau catatan klien lain.
 * Kalau memberToken sah, jadwal milik klien itu sendiri ikut dikirim lengkap
 * (untuk riwayat & reschedule di "Dashboardku").
 */
function getPublicSchedules(memberToken) {
  let memberId = null;
  if (memberToken) {
    try { memberId = String(requireMember_(memberToken).row[0]).trim(); } catch (e) { memberId = null; }
  }
  return _getSchedulesAll_().map(function(s) {
    if (memberId && String(s.memberId) === memberId) {
      const own = Object.assign({}, s);
      delete own.phone;
      return own;
    }
    return { start: s.start, end: s.end, status: s.status, coachId: s.coachId, coachName: s.coachName };
  });
}

/**
 * Portal klien: SATU panggilan saat portal dibuka (backend-first, supaya cepat).
 * Token boleh kosong (layar masuk). Hanya jadwal milik klien itu sendiri yang dikirim;
 * jam penuh/kosong datang dari mesin slot server (openSlots), bukan dari booking klien lain.
 * Token yang tidak sah tidak melempar error: authLost berisi pesannya, supaya browser logout.
 * openSlots datang dari cache server bersama (versi dibaca SEBELUM Schedules dibaca).
 */
function getPortalBootstrap(memberToken) {
  let found = null, authLost = '';
  if (memberToken) {
    try { found = requireMember_(memberToken); } catch (e) { authLost = String(e.message || e); }
  }
  const memberId = found ? String(found.row[0]).trim() : null;
  const ver = _slotsVersion_();
  // Tanpa klien yang masuk, sheet Schedules hanya dibaca kalau cache jam kosong kosong (hemat kuota).
  const all = memberId ? _getSchedulesAll_() : undefined;
  const mine = memberId ? all.filter(function(x) { return String(x.memberId).trim() === memberId; }).map(_ownScheduleOut_) : [];
  const now = new Date();
  const horizon = _portalHorizonDays_();
  return {
    profile: found ? _memberPublicProfile_(found.row) : null,
    authLost: authLost.indexOf(AUTH_ERROR_PREFIX) !== -1 ? authLost : '',
    schedules: mine,
    openSlots: _openSlotsCached_({ days: horizon }, now, all, false, ver),
    openSlotsByCoach: _openSlotsByCoach_(all, ver, horizon, now, false),
    horizonDays: horizon,
    rescheduleCutoffHours: _rescheduleCutoff_(),
    coaches: getCoaches(),
    priceList: getPriceList(),
    businessHours: _businessHours_()
  };
}

/**
 * Dua coach aktif atau lebih: jam kosong per coach (klien memilih coach lebih dulu), lewat cache yang sama.
 * Solo: {} (tidak dipakai). refresh = hitung ulang & simpan (write-through sesudah booking).
 */
function _openSlotsByCoach_(all, ver, horizon, now, refresh) {
  const coaches = _activeCoaches_();
  const out = {};
  if (coaches.length < 2) return out;
  coaches.forEach(function(c) { out[c.id] = _openSlotsCached_({ days: horizon, coachId: c.id }, now, all, refresh, ver); });
  return out;
}

/** Jam kosong untuk jawaban booking klien: semua coach + per coach (kalau 2 coach atau lebih). */
function _slotsPayload_(all, ver, refresh) {
  const now = new Date(), horizon = _portalHorizonDays_();
  const out = { openSlots: _openSlotsCached_({ days: horizon }, now, all, refresh, ver) };
  const by = _openSlotsByCoach_(all, ver, horizon, now, refresh);
  if (Object.keys(by).length) out.openSlotsByCoach = by;
  return out;
}

/** Klien wajib memilih coach kalau ada dua coach aktif atau lebih. Mengembalikan coachId valid ('' di mode solo). */
function _requireClientCoach_(coachId) {
  const active = _activeCoaches_();
  if (active.length < 2) return '';
  const id = String(coachId == null ? '' : coachId).trim();
  if (!id) throw new Error('Pilih coach dulu.');
  if (!active.some(function(c) { return c.id === id; })) throw new Error('Coach tidak ditemukan atau sedang tidak aktif. Pilih coach lain.');
  return id;
}

/** Berapa hari jam kosong yang dikirim ke portal: sama dengan batas booking (maks 62). */
function _portalHorizonDays_() {
  return Math.max(1, Math.min(62, Math.floor(_numProp_('BOOKING_MAX_DAYS_AHEAD', BOOKING_MAX_DAYS_AHEAD))));
}

/** Panel admin: data utama dalam SATU panggilan (klien, jadwal, coach, paket, jam operasional). */
function getAdminBootstrap(token) {
  requireAdmin_(token);
  return {
    members: getMembers(token),
    schedules: _getSchedulesAll_(),
    coaches: getCoachesAdmin(token),
    priceList: getPriceList(),
    businessHours: _businessHours_()
  };
}

/** Panel admin: data susulan dalam SATU panggilan (riwayat transaksi, ringkasan PR, perpanjangan). */
function getAdminExtras(token) {
  requireAdmin_(token);
  return {
    transactionLog: getMemberTransactionLog(token),
    taskSummary: getTaskSummary(token),
    renewals: getRenewalRequests(token)
  };
}

/** T-200: coach kosong = ID kosong + nama kosong. Baris lama yang menyimpan teks placeholder dibaca sebagai kosong. */
function _coachNameOrEmpty_(v) {
  const n = sanitizeValue(v);
  return String(n).trim() === 'Belum Ditugaskan' ? '' : n;
}

/** Sheet Schedules lama belum punya kolom M "Kelas ID": beri header-nya (hanya kalau M1 masih kosong). */
function _ensureScheduleClassHeader_(sheet) {
  const c = sheet.getRange(1, 13);
  if (c.getValue() === '') { c.setValue('Kelas ID'); c.setFontWeight('bold'); }
}

function _getSchedulesAll_() {
  const headers = ["ID", "Member ID", "Nama Member", "No WA", "Waktu Mulai", "Waktu Selesai", "Catatan", "Status", "Coach ID", "Nama Coach", "Completed At", "Recurring Group ID", "Kelas ID"];
  const sheet = getOrCreateSheet_('Schedules', headers);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(function(row) {
    return {
      id: sanitizeValue(row[0]),
      memberId: sanitizeValue(row[1]),
      title: sanitizeValue(row[2]),
      phone: sanitizeValue(row[3]),
      start: sanitizeValue(row[4]),
      end: sanitizeValue(row[5]),
      notes: sanitizeValue(row[6]),
      status: sanitizeValue(row[7]) || 'read',
      coachId: sanitizeValue(row[8]),
      coachName: _coachNameOrEmpty_(row[9]),   // T-200: teks lama "Belum Ditugaskan" dibaca sebagai kosong
      completedAt: sanitizeValue(row[10]) || '',
      recurringGroupId: sanitizeValue(row[11]) || '',
      classId: sanitizeValue(row[12]) || ''
    };
  });
}

function addSchedule(token, scheduleData) {
  requireAdmin_(token);
  return _locked_(function() {
    const res = _addScheduleInternal_(scheduleData, 'read', false);
    try {
      const found = scheduleData && scheduleData.memberId ? _findMemberRow_(function(row) { return String(row[0]).trim() === String(scheduleData.memberId).trim(); }) : null;
      const left = found ? _memberQuotaLeft_(found.row) : null;
      if (left !== null && left < 0 && new Date(scheduleData.start).getTime() > Date.now()) res.warnings = (res.warnings || []).concat(['Sesi klien ini sudah habis terpakai/terbooking.']);
    } catch (e) { Logger.log('Cek kuota gagal: ' + e); }
    return res;
  });
}

/**
 * @param {Object} scheduleData
 * @param {string} [statusParam] - 'unread' untuk booking mandiri klien, default 'read'
 * @param {boolean} [silentNotif] - true untuk skip notif Telegram individual (dipakai saat
 *        dipanggil berkali-kali dari addRecurringSchedule, supaya tidak spam 1 notif per sesi;
 *        addRecurringSchedule mengirim 1 notif ringkasan sendiri setelah semua sesi dibuat)
 * @param {boolean} [deferBust] - true = pemanggil sendiri yang memanggil _bustSlots_() sesudah semua tulisannya
 *        (seri berulang: sekali di akhir; booking klien: supaya tahu versi barunya untuk write-through)
 */
function _addScheduleInternal_(scheduleData, statusParam, silentNotif, deferBust) {
  try {
    const headers = ["ID", "Member ID", "Nama Member", "No WA", "Waktu Mulai", "Waktu Selesai", "Catatan", "Status", "Coach ID", "Nama Coach", "Completed At", "Recurring Group ID", "Kelas ID"];
    const sheet = getOrCreateSheet_('Schedules', headers);
    const id = 'SCH-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    const status = statusParam || 'read';

    // Auto-assign Coach: kalau jadwal ini belum ditentukan coach-nya secara eksplisit,
    // pakai Coach favorit yang sudah dipilih admin saat klien ini didaftarkan/diedit.
    // Fitur assign coach manual (updateScheduleCoach, dsb) tetap berjalan seperti biasa
    // dan selalu bisa menimpa coach hasil auto-assign ini kapan saja.
    let coachId = scheduleData.coachId || "";
    let coachName = scheduleData.coachName || "";
    if (!coachId) {
      const allActive = _activeCoaches_();
      const rulesNow = _coachRules_(), offNow = _coachTimeOff_(false);
      // Coach yang sedang cuti / di luar jam kerjanya tidak dipilih otomatis.
      const actives = allActive.filter(function(c) { return _anyCoachAvailable_([c], rulesNow, offNow, scheduleData.start, scheduleData.end || scheduleData.start); });
      if (scheduleData.memberId) {
        try {
          const member = _getMembersAll_().find(function(m) { return String(m.id) === String(scheduleData.memberId); });
          const preferred = member && member.preferredCoachId ? actives.find(function(c) { return c.id === String(member.preferredCoachId); }) : null;
          if (preferred) { coachId = preferred.id; coachName = preferred.name; }
        } catch (e) {
          Logger.log("Gagal auto-assign coach dari preferensi klien: " + e);
        }
      }
      // Mode solo (satu coach aktif): semua sesi otomatis milik coach itu.
      if (!coachId && allActive.length === 1 && actives.length === 1) { coachId = actives[0].id; coachName = actives[0].name; }
    }

    sheet.appendRow([
      id, scheduleData.memberId, scheduleData.memberName, scheduleData.phone.toString(),
      scheduleData.start, scheduleData.end, scheduleData.notes, status,
      coachId, coachName || "", "", scheduleData.recurringGroupId || "", scheduleData.classId || ""
    ]);
    _ensureScheduleClassHeader_(sheet);
    if (!deferBust) _bustSlots_();   // sesudah menulis: buang cache jam kosong

    // Hanya notif di sini kalau BUKAN booking mandiri klien (statusParam 'unread') DAN bukan silent,
    // karena booking mandiri sudah dinotif detail di clientBookSchedule, dan batch recurring
    // punya notif ringkasannya sendiri di addRecurringSchedule.
    if (statusParam !== 'unread' && !silentNotif) {
      try {
        kirimNotifTelegram_("📅 <b>JADWAL BARU DIBUAT</b>\n\n" +
          "👤 <b>Klien:</b> " + escapeHtmlTelegram(scheduleData.memberName) + "\n" +
          "⏰ <b>Mulai:</b> " + escapeHtmlTelegram(scheduleData.start) + "\n" +
          (coachName ? "🧑‍🏫 <b>Coach:</b> " + escapeHtmlTelegram(coachName) + "\n" : "") +
          "📝 <b>Catatan:</b> " + escapeHtmlTelegram(scheduleData.notes || '-'));
      } catch(e) { Logger.log("Notif Telegram gagal: " + e); }
    }

    // Peringatan hanya untuk booking tunggal buatan pemilik; booking klien & seri berulang tidak memakainya
    // (hemat satu kali baca sheet per sesi).
    let warnings = [];
    if (statusParam !== 'unread' && !silentNotif) {
      try { warnings = _slotWarnings_(scheduleData.start, scheduleData.end || scheduleData.start, id); } catch (e) { warnings = []; }
    }
    return { status: 'success', id: id, coachId: coachId, coachName: coachName, warnings: warnings };
  } catch(error) {
    throw new Error('Gagal menyimpan jadwal: ' + error.message);
  }
}

/**
 * Booking berulang (recurring): generate beberapa jadwal sekaligus berdasarkan pola
 * hari-dalam-minggu yang dipilih, mulai dari tanggal dasar, sejumlah `occurrences` kali.
 * Semua sesi dalam 1 seri diberi `recurringGroupId` yang sama, supaya nanti bisa
 * dibatalkan bareng-bareng lewat deleteRecurringGroup().
 *
 * Reuse addSchedule() untuk tiap sesi (silent=true) — jadi auto-assign coach dan
 * penulisan sheet tetap konsisten dengan booking biasa. TIDAK ada pengecekan bentrok
 * slot, konsisten dengan addSchedule()/clientBookSchedule() yang juga belum punya
 * validasi itu.
 *
 * @param {Object} baseScheduleData
 *   { memberId, memberName, phone, notes, duration (menit),
 *     startDate ('YYYY-MM-DD' - tanggal sesi pertama), time ('HH:mm'),
 *     coachId?, coachName? }
 * @param {Object} recurrenceRule
 *   { weekdays: number[] (0=Minggu..6=Sabtu), occurrences: number (total sesi yang dibuat) }
 * @returns {{status:string, groupId:string, count:number, ids:string[], dates:string[]}}
 */
function addRecurringSchedule(token, baseScheduleData, recurrenceRule) {
  requireAdmin_(token);
  return _addRecurringInternal_(baseScheduleData, recurrenceRule, 'read');
}

/**
 * Portal klien: booking berulang untuk klien yang sedang login. Identitas klien
 * diambil dari token (bukan dari browser). Jadwal masuk berstatus 'unread'
 * (muncul sebagai booking baru di panel PT).
 * opts.soft: tanggal yang bentrok tidak dilempar sebagai error tapi dikembalikan semuanya
 *   ({status:'conflict', code:'series', conflicts, bookable, total, openSlots}); tidak ada yang ditulis.
 * opts.skipTaken: tulis hanya tanggal yang kosong; kuota dicek pada jumlah itu.
 * Tanpa opts: seperti dulu, bentrok pertama dilempar sebagai error.
 */
function clientBookRecurring(memberToken, baseScheduleData, recurrenceRule, opts) {
  const member = requireMember_(memberToken);
  if (_memberClassContext_(member.row)) throw new Error('Sesi kelas dipilih satu per satu, tidak bisa berulang. Pilih jam kelasnya.');
  const base = baseScheduleData || {};
  const soft = !!(opts && opts.soft), skipTaken = !!(opts && opts.skipTaken);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    const ver = _slotsVersion_();   // versi dulu, baru sheet (lihat _bustSlots_)
    const all = _getSchedulesAll_();
    return _addRecurringInternal_({
      memberId: String(member.row[0]).trim(),
      memberName: member.row[1],
      phone: String(member.row[2]),
      notes: String(base.notes || '').slice(0, 500),
      startDate: String(base.startDate || ''),
      time: String(base.time || ''),
      duration: base.duration
    }, recurrenceRule, 'unread', { soft: soft, skipTaken: skipTaken, memberRow: member.row, all: all, ver: ver });
  } finally {
    lock.releaseLock();
  }
}

/**
 * opts (hanya untuk status 'unread'): { soft, skipTaken, memberRow, all, ver } — lihat clientBookRecurring.
 * all & ver = isi Schedules dan versi cache yang sudah dibaca pemanggil di dalam lock (ver lebih dulu).
 */
function _addRecurringInternal_(baseScheduleData, recurrenceRule, status, opts) {
  opts = opts || {};
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(baseScheduleData.startDate)) || !/^\d{2}:\d{2}$/.test(String(baseScheduleData.time))) {
      throw new Error('Tanggal atau jam tidak valid.');
    }
    const weekdays = (recurrenceRule && recurrenceRule.weekdays) || [];
    // Bilangan bulat, sama dengan hitungan kuota di clientBookRecurring (4.5 tidak boleh jadi 5 sesi).
    const occurrences = parseInt(recurrenceRule && recurrenceRule.occurrences, 10) || 0;

    if (!weekdays.length) throw new Error('Pilih minimal 1 hari untuk pola berulang.');
    if (!occurrences || occurrences < 1) throw new Error('Jumlah pengulangan tidak valid.');
    if (occurrences > 52) throw new Error('Maksimal 52 sesi sekali buat (biar tidak kebablasan).');

    const groupId = 'RGRP-' + new Date().getTime();
    const [startY, startM, startD] = baseScheduleData.startDate.split('-').map(Number);
    const [hh, mm0] = baseScheduleData.time.split(':').map(Number);
    const mm = status === 'unread' ? 0 : mm0;   // klien: sesi mulai di jam bulat
    const durationMin = parseInt(baseScheduleData.duration, 10) || 60;

    const weekdaySet = {};
    weekdays.forEach(function(w) { weekdaySet[Number(w)] = true; });

    // Semua tanggal seri, berurutan.
    let plan = [];
    // Selalu WIB (sama dengan portal & mesin slot), tidak bergantung zona waktu server.
    const two = function(n) { return ('0' + n).slice(-2); };
    let cursor = new Date(Date.parse(startY + '-' + two(startM) + '-' + two(startD) + 'T' + two(hh) + ':' + two(mm) + ':00+07:00'));
    let safetyCounter = 0; // jaga-jaga supaya tidak infinite loop kalau weekdays kosong/aneh
    while (plan.length < occurrences && safetyCounter < 400) {
      safetyCounter++;
      if (weekdaySet[_wibParts_(cursor).day]) {
        const sessionStart = new Date(cursor);
        const sessionEnd = new Date(sessionStart.getTime() + durationMin * 60000);
        plan.push({
          start: sessionStart.toISOString(), end: sessionEnd.toISOString(),
          label: sessionStart.toLocaleDateString('id-ID', {weekday:'short', day:'numeric', month:'short'}) + ' ' + baseScheduleData.time
        });
      }
      cursor = new Date(cursor.getTime() + 24 * 60 * 60000); // maju 1 hari
    }

    // Booking mandiri klien: tiap tanggal harus boleh dibooking (batas hari, sesi sendiri, jam kosong).
    // Tanpa soft/skipTaken: bentrok pertama dilempar dan tidak ada yang dibuat (seperti dulu).
    let rows = null, ver = '', skipped = 0;
    if (status === 'unread') {
      ver = opts.all ? opts.ver : _slotsVersion_();
      rows = opts.all || _getSchedulesAll_();
      const collect = !!(opts.soft || opts.skipTaken);
      // Coba lagi setelah jawaban hilang: tanggal yang sudah jadi sesi klien ini (mulai & selesai sama) tidak dibuat lagi.
      const exact = plan.map(function(item) {
        const s = new Date(item.start).getTime(), e = new Date(item.end).getTime();
        return rows.find(function(x) {
          const st = String(x.status || '').toLowerCase();
          return st !== 'available' && st !== 'cancelled' && String(x.memberId).trim() === String(baseScheduleData.memberId).trim() &&
            new Date(x.start).getTime() === s && new Date(x.end).getTime() === e;
        }) || null;
      });
      const already = exact.filter(Boolean);
      const duplicateOut = function() {
        return Object.assign({
          status: 'success', duplicate: true, groupId: String(already[0].recurringGroupId || ''), count: already.length, skipped: plan.length - already.length,
          ids: already.map(function(x) { return x.id; }), dates: [], items: already.map(_ownScheduleOut_)
        }, _slotsPayload_(rows, ver, false));
      };
      if (plan.length && already.length === plan.length) return duplicateOut();
      // Kuota dicek sesudah aturan duplikat (sama dengan booking satu sesi); "Lewati" mengecek jumlah tanggal yang kosong saja.
      if (!opts.skipTaken && opts.memberRow) _assertQuota_(opts.memberRow, plan.length, rows);
      const clashes = [];
      plan.forEach(function(item) {
        _assertBookingHorizon_(item.start);
        const p = _ownOverlap_(baseScheduleData.memberId, item.start, item.end, '', rows)
          ? { code: 'mine', message: 'Kamu sudah punya sesi di jam itu.' }
          : _slotProblem_(item.start, item.end, '', false, '', rows);
        if (!p) return;
        if (!collect) throw new Error(p.message.replace(/\.$/, '') + ' (' + item.label + '). Tidak ada sesi yang dibuat.');
        item.code = p.code;
        clashes.push(item);
      });
      // "Lewati tanggal penuh" diulang: tidak ada tanggal baru, sebagian sudah jadi sesinya → sama dengan yang sudah dibuat.
      if (opts.skipTaken && already.length && clashes.length === plan.length) return duplicateOut();
      if (clashes.length && !opts.skipTaken) {
        return Object.assign({
          status: 'conflict', code: 'series',
          conflicts: clashes.map(function(c) { return { start: c.start, code: c.code }; }),
          bookable: plan.length - clashes.length, total: plan.length
        }, _slotsPayload_(rows, ver, true));
      }
      if (clashes.length) {
        skipped = clashes.length;
        plan = plan.filter(function(item) { return !item.code; });
        if (!plan.length) throw new Error('Semua tanggal sudah terisi.');
      }
      if (opts.skipTaken && opts.memberRow) _assertQuota_(opts.memberRow, plan.length, rows);
    }

    const ids = [];
    const dates = [];
    const items = [];
    let slotsVer = '';
    try {
      plan.forEach(function(item) {
        const result = _addScheduleInternal_({
          memberId: baseScheduleData.memberId,
          memberName: baseScheduleData.memberName,
          phone: baseScheduleData.phone,
          notes: baseScheduleData.notes,
          start: item.start,
          end: item.end,
          coachId: baseScheduleData.coachId,
          coachName: baseScheduleData.coachName,
          recurringGroupId: groupId
        }, status, true, true); // silent=true, notif ringkasan dikirim sekali di bawah; cache dibuang sekali di akhir

        ids.push(result.id);
        dates.push(item.label);
        items.push({
          id: result.id, memberId: baseScheduleData.memberId, title: baseScheduleData.memberName,
          start: item.start, end: item.end, notes: baseScheduleData.notes || '', status: status,
          coachId: result.coachId || '', coachName: result.coachName || '', completedAt: '', recurringGroupId: groupId, classId: ''
        });
      });
    } finally {
      if (ids.length) slotsVer = _bustSlots_();   // sesudah semua tulisan
    }

    if (ids.length === 0) throw new Error('Tidak ada tanggal yang cocok dengan pola berulang ini.');

    try {
      kirimNotifTelegram_((status === 'unread' ? "🔁 <b>KLIEN BOOKING BERULANG</b>\n\n" : "🔁 <b>JADWAL BERULANG DIBUAT</b>\n\n") +
        "👤 <b>Klien:</b> " + escapeHtmlTelegram(baseScheduleData.memberName) + "\n" +
        "📦 <b>Total Sesi:</b> " + ids.length + "\n" +
        (skipped ? "⏭️ <b>Dilewati (sudah terisi):</b> " + skipped + " tanggal\n" : "") +
        "📅 <b>Tanggal:</b>\n" + dates.map(function(d) { return "• " + d; }).join("\n"));
    } catch (e) { Logger.log("Notif Telegram gagal: " + e); }

    const out = { status: 'success', groupId: groupId, count: ids.length, ids: ids, dates: dates, items: items };
    if (status === 'unread') {
      out.skipped = skipped;
      // Write-through: data dibaca di dalam lock + sesi baru, disimpan di bawah versi yang baru saja dinaikkan.
      Object.assign(out, _slotsPayload_(rows.concat(items), slotsVer, true));
    }
    return out;
  } catch (err) {
    throw new Error(err.message || 'Gagal membuat jadwal berulang.');
  }
}

/**
 * Batalkan/hapus semua sesi dalam 1 seri recurring booking sekaligus (berdasarkan
 * recurringGroupId). Sesi yang statusnya 'completed' tetap ikut dihapus TAPI kuota
 * klien dikembalikan (-1 usedSessions per sesi completed yang dihapus), sama seperti
 * logika deleteSchedule() untuk jadwal tunggal — supaya kuota tidak salah hitung.
 *
 * @param {string} groupId
 * @returns {{status:string, deletedCount:number}}
 */
function deleteRecurringGroup(token, groupId) {
  requireAdmin_(token);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const schSheet = ss.getSheetByName('Schedules');
    if (!schSheet) throw new Error('Sheet Schedules tidak ditemukan');

    const schData = schSheet.getDataRange().getValues();
    const rowsToDelete = []; // simpan index (1-based row number di sheet), urut DESC biar aman saat deleteRow berturut-turut
    const completedMemberIds = []; // memberId yang sesinya completed & perlu dikembalikan kuotanya
    let memberName = '';

    for (let i = 1; i < schData.length; i++) {
      if (String(schData[i][11]) === String(groupId)) {
        rowsToDelete.push(i + 1);
        memberName = schData[i][2];
        if (String(schData[i][7]).toLowerCase() === 'completed') {
          completedMemberIds.push(schData[i][1]);
        }
      }
    }

    if (rowsToDelete.length === 0) throw new Error('Seri jadwal berulang tidak ditemukan.');

    // Hapus dari baris paling bawah dulu supaya index baris di atasnya tidak bergeser
    rowsToDelete.sort(function(a, b) { return b - a; });
    rowsToDelete.forEach(function(rowNum) { schSheet.deleteRow(rowNum); });
    _bustSlots_();   // sesudah menulis: buang cache jam kosong

    // Kembalikan kuota untuk tiap sesi completed yang ikut terhapus
    if (completedMemberIds.length > 0) {
      const memSheet = _getMemberDataSheet_();
      const memData = memSheet.getDataRange().getValues();
      completedMemberIds.forEach(function(memberId) {
        for (let i = 1; i < memData.length; i++) {
          if (memData[i][0] === memberId) {
            const currentUsed = parseInt(memData[i][9]) || 0;
            const newUsed = Math.max(0, currentUsed - 1);
            memSheet.getRange(i + 1, 10).setValue(newUsed);
            memData[i][9] = newUsed; // update cache lokal biar akurat kalau ada duplikat memberId di loop
            break;
          }
        }
      });
    }

    try {
      kirimNotifTelegram_("🗑️ <b>SERI JADWAL BERULANG DIHAPUS</b>\n\n" +
        "👤 <b>Klien:</b> " + escapeHtmlTelegram(memberName) + "\n" +
        "📦 <b>Jumlah Sesi Dihapus:</b> " + rowsToDelete.length);
    } catch (e) { Logger.log("Notif Telegram gagal: " + e); }

    return { status: 'success', deletedCount: rowsToDelete.length };
  } catch (err) {
    throw new Error(err.message || 'Gagal menghapus seri jadwal berulang.');
  }
}

/**
 * Fungsi untuk mengedit (update) detail tanggal, jam, atau durasi sesi di kalender.
 * Mendukung penuh sinkronisasi Drag & Drop serta Resize dari Kalender Frontend.
 */
function updateScheduleData(token, scheduleData) {
  requireAdmin_(token);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
    if (!sheet) throw new Error('Sheet Schedules tidak ditemukan');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === scheduleData.id) {
        sheet.getRange(i + 1, 5).setValue(scheduleData.start);
        sheet.getRange(i + 1, 6).setValue(scheduleData.end);

        const currentNotes = data[i][6];
        sheet.getRange(i + 1, 7).setValue(scheduleData.notes || currentNotes);
        _bustSlots_();   // sesudah menulis: buang cache jam kosong

        try {
          kirimNotifTelegram_("🔄 <b>JADWAL DIUBAH</b>\n\n" +
            "👤 <b>Klien:</b> " + escapeHtmlTelegram(data[i][2]) + "\n" +
            "⏰ <b>Waktu Baru:</b> " + scheduleData.start + " - " + scheduleData.end);
        } catch(e) { Logger.log("Notif Telegram gagal: " + e); }

        return { status: 'success' };
      }
    }
    throw new Error('Jadwal tidak ditemukan');
  } catch (err) {
    throw new Error('Gagal mengubah jadwal: ' + err.message);
  }
}

// Batas waktu minimal sebelum jadwal mulai, supaya klien masih boleh reschedule mandiri.
// Di bawah batas ini, klien harus hubungi admin langsung (via WA) untuk reschedule.
const RESCHEDULE_CUTOFF_HOURS = 2;   // bawaan; bisa diubah lewat Pengaturan (RESCHEDULE_CUTOFF_HOURS di Script Properties)
function _rescheduleCutoff_() { return _numProp_('RESCHEDULE_CUTOFF_HOURS', RESCHEDULE_CUTOFF_HOURS); }

/**
 * Reschedule mandiri oleh klien (member portal), TANPA lewat admin.
 * Beda dengan updateScheduleData() (yang full-power, dipakai admin lewat drag&drop
 * kalender), fungsi ini divalidasi ketat dulu sebelum mengubah data:
 *   1. Jadwal harus benar milik memberId yang mengajukan (cegah klien A mengubah jadwal klien B).
 *   2. Jadwal belum berstatus 'completed' (sesi yang sudah lewat tidak bisa direschedule).
 *   3. Waktu sekarang masih di luar RESCHEDULE_CUTOFF_HOURS sebelum jadwal LAMA
 *      (kalau sudah terlalu mepet, klien diarahkan untuk hubungi admin manual).
 *   4. Waktu BARU boleh dibooking (batas hari, sesi sendiri, jam operasional, coach, belum terisi);
 *      jadwal ini sendiri tidak dihitung.
 *
 * opts.soft: bentrok di langkah 4 (kecuali batas hari) tidak dilempar tapi dikembalikan sebagai
 *   {status:'conflict', code, message, requested, alternatives, openSlots, oldStart}; jadwal lama tetap.
 *
 * @param {string} scheduleId
 * @param {string} newStart - ISO string waktu mulai baru
 * @param {string} newEnd - ISO string waktu selesai baru
 * @returns {{status:string, oldStart:string, newStart:string, newEnd:string, openSlots:Array}}
 */
function clientRescheduleSchedule(memberToken, scheduleId, newStart, newEnd, opts) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  const soft = !!(opts && opts.soft);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    return _clientReschedule_(memberId, scheduleId, newStart, newEnd, soft);
  } finally {
    lock.releaseLock();
  }
}

function _clientReschedule_(memberId, scheduleId, newStart, newEnd, soft) {
  try {
    const snapped = _snapSlot_(newStart, newEnd);
    newStart = snapped.start; newEnd = snapped.end;
    _validateSlot_(newStart, newEnd);
    const ver = _slotsVersion_();   // versi dulu, baru sheet (lihat _bustSlots_)
    const all = _getSchedulesAll_();
    const id = String(scheduleId == null ? '' : scheduleId);
    const idx = id ? all.findIndex(function(x) { return String(x.id) === id; }) : -1;
    if (idx === -1) throw new Error('Jadwal tidak ditemukan');
    const row = all[idx];

    // 1. Verifikasi kepemilikan
    if (String(row.memberId).trim() !== String(memberId).trim()) {
      throw new Error('Jadwal ini bukan milik Anda.');
    }

    if (String(row.classId || '').trim()) throw new Error('Sesi kelas tidak bisa dipindah sendiri. Hubungi Coach atau batalkan lalu pilih sesi kelas lain.');

    // 2. Tidak boleh reschedule sesi yang sudah selesai
    if (String(row.status).toLowerCase() === 'completed') {
      throw new Error('Sesi yang sudah selesai tidak bisa direschedule.');
    }

    // 3. Cek cutoff waktu dari jadwal LAMA
    const hoursUntilOldStart = (new Date(row.start) - new Date()) / (1000 * 60 * 60);
    if (hoursUntilOldStart < _rescheduleCutoff_()) {
      throw new Error('Reschedule mandiri sudah lewat batas waktu (minimal ' + _rescheduleCutoff_() + ' jam sebelum jadwal). Silakan hubungi Coach langsung via WhatsApp.');
    }

    // 4. Waktu BARU harus boleh dibooking; jadwal ini sendiri tidak dihitung.
    _assertBookingHorizon_(newStart);
    const keepCoach = _activeCoaches_().length > 1 ? String(row.coachId || '') : '';   // pindah jadwal: coach tetap sama
    const p = _ownOverlap_(memberId, newStart, newEnd, id, all)
      ? { code: 'mine', message: 'Kamu sudah punya sesi di jam itu.' }
      : _slotProblem_(newStart, newEnd, id, false, '', all, keepCoach);
    if (p) {
      if (!soft) throw new Error(p.message);
      const out = _bookConflict_(p.code, p.message, { start: newStart, end: newEnd }, all, ver,
        _ownActiveRows_(memberId, all, id), id, [row.start, newStart], keepCoach);
      out.oldStart = row.start;
      return out;
    }

    const memberName = row.title;
    const oldStartStr = row.start;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
    sheet.getRange(idx + 2, 5).setValue(newStart); // Waktu Mulai
    sheet.getRange(idx + 2, 6).setValue(newEnd);   // Waktu Selesai
    const slotsVer = _bustSlots_();   // sesudah menulis
    row.start = newStart; row.end = newEnd;
    // Write-through: data dibaca di dalam lock + perubahan ini, disimpan di bawah versi yang baru saja dinaikkan.
    const payload = _slotsPayload_(all, slotsVer, true);

    try {
      const oldFormatted = new Date(oldStartStr).toLocaleString('id-ID', {weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'});
      const newFormatted = new Date(newStart).toLocaleString('id-ID', {weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'});
      kirimNotifTelegram_("🔄 <b>KLIEN RESCHEDULE MANDIRI</b>\n\n" +
        "👤 <b>Klien:</b> " + escapeHtmlTelegram(memberName) + "\n" +
        "⏰ <b>Dari:</b> " + oldFormatted + "\n" +
        "⏰ <b>Ke:</b> " + newFormatted);
    } catch (e) { Logger.log("Notif Telegram gagal: " + e); }

    return Object.assign({ status: 'success', oldStart: oldStartStr, newStart: newStart, newEnd: newEnd }, payload);
  } catch (err) {
    throw new Error(err.message || 'Gagal reschedule jadwal.');
  }
}

/**
 * Menugaskan pelatih (Assign Coach) ke dalam sesi latihan tertentu.
 */
function updateScheduleCoach(token, scheduleId, coachId) {
  requireAdmin_(token);
  coachId = String(coachId || '');
  const picked = coachId ? _coachesAll_().find(function(c) { return c.id === coachId; }) : null;
  if (coachId && !picked) throw new Error('Coach tidak ditemukan.');
  const coachName = picked ? picked.name : '';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
  if (!sheet) throw new Error('Sheet Jadwal tidak ditemukan');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === scheduleId) {
      sheet.getRange(i + 1, 9).setValue(coachId);
      sheet.getRange(i + 1, 10).setValue(coachName);
      _bustSlots_();   // sesudah menulis: kursi coach berpindah

      try {
        kirimNotifTelegram_("🏋️ <b>COACH DITUGASKAN</b>\n\n" +
          "👤 <b>Klien:</b> " + escapeHtmlTelegram(data[i][2]) + "\n" +
          "🧑‍🏫 <b>Coach:</b> " + escapeHtmlTelegram(coachName || 'Tanpa coach'));
      } catch(e) { Logger.log("Notif Telegram gagal: " + e); }

      return { status: 'success' };
    }
  }
  throw new Error('Jadwal tidak ditemukan');
}

// Validasi slot dari browser: tanggal sah, selesai > mulai, maks 4 jam.
/** Klien boleh memilih jam berapa saja (07.15); sesi dicatat mulai dari jam bulat (07.00) selama durasi yang dipilih. */
function _snapSlot_(start, end) {
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return { start: start, end: end };
  const a = Math.floor(s.getTime() / 3600000) * 3600000;
  return { start: new Date(a).toISOString(), end: new Date(a + (e.getTime() - s.getTime())).toISOString() };
}

/**
 * Sesi klien sendiri yang bertumpuk dengan [start,end) (mis. dua coach), atau null. excludeId = jadwal yang sedang
 * dipindah. all = isi Schedules yang sudah dibaca pemanggil (opsional).
 */
function _ownOverlap_(memberId, start, end, excludeId, all) {
  const s = new Date(start).getTime(), e = new Date(end).getTime();
  return (all || _getSchedulesAll_()).find(function(x) {
    const st = String(x.status || '').toLowerCase();
    if (st === 'available' || st === 'cancelled' || String(x.memberId).trim() !== String(memberId).trim() || String(x.id) === String(excludeId || '')) return false;
    const bs = Math.floor(new Date(x.start).getTime() / 3600000) * 3600000, be = bs + (new Date(x.end || x.start).getTime() - new Date(x.start).getTime());
    return bs < e && be > s;
  }) || null;
}

/** Klien tidak boleh punya dua sesi yang bertumpuk (mis. dua coach). excludeId = jadwal yang sedang dipindah. */
function _assertNoOwnOverlap_(memberId, start, end, excludeId, all) {
  if (_ownOverlap_(memberId, start, end, excludeId, all)) throw new Error('Kamu sudah punya sesi di jam itu.');
}

function _validateSlot_(start, end) {
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) throw new Error('Waktu jadwal tidak valid.');
  if (e - s > 4 * 60 * 60000) throw new Error('Durasi sesi maksimal 4 jam.');
}

/**
 * Portal klien: booking 1 sesi untuk klien yang sedang login. Nama, No WA, dan
 * Member ID diambil dari token + sheet (bukan dari browser), jadi klien tidak
 * bisa booking atas nama orang lain.
 * opts.soft: jam yang bentrok (taken/past/closed/unavailable/mine/full/duration) tidak dilempar sebagai error
 *   tapi dikembalikan sebagai {status:'conflict', code, message, requested, alternatives, openSlots}; tidak ada
 *   yang ditulis. Kuota, batas hari, waktu tidak sah, sibuk, dan "sudah terdaftar di kelas" tetap dilempar.
 * Booking yang sama persis (mulai & selesai sama) dari klien yang sama = sukses dengan duplicate:true, tanpa
 *   tulis/notifikasi lagi (aman untuk "Coba lagi").
 * @param {string} memberToken
 * @param {{start:string, end:string, duration:number, notes:string}} scheduleData
 * @param {{soft:boolean}} [opts]
 * @returns sukses: {status:'success', duplicate?, id, coachId, coachName, schedule, openSlots}
 */
function clientBookSchedule(memberToken, scheduleData, opts) {
  const member = requireMember_(memberToken);
  const soft = !!(opts && opts.soft);
  scheduleData = scheduleData || {};
  const pickedCoachId = _requireClientCoach_(scheduleData.coachId);   // dua coach aktif atau lebih: wajib pilih coach
  const snapped = _snapSlot_(scheduleData.start, scheduleData.end);
  scheduleData = { start: snapped.start, end: snapped.end, notes: scheduleData.notes };
  _validateSlot_(scheduleData.start, scheduleData.end);

  const memberId = String(member.row[0]).trim();
  const memberName = String(member.row[1]);
  const phone = _normalizePhone_(member.row[2]);
  const notes = String(scheduleData.notes || '').slice(0, 500);
  const duration = Math.round((new Date(scheduleData.end) - new Date(scheduleData.start)) / 60000);
  const req = { start: scheduleData.start, end: scheduleData.end };
  const sMs = new Date(req.start).getTime(), eMs = new Date(req.end).getTime();

  // Cek + tulis dalam satu lock supaya dua klien tidak bisa mengambil jam yang sama bersamaan.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  let addResult, out;
  try {
    const ver = _slotsVersion_();   // versi dulu, baru sheet (lihat _bustSlots_)
    const all = _getSchedulesAll_();   // satu kali baca untuk semua pengecekan di bawah
    const horizon = _portalHorizonDays_();
    const conflict = function(code, message, alternatives) {
      const c = _bookConflict_(code, message, req, all, ver, _ownActiveRows_(memberId, all, ''), '', [], pickedCoachId);
      if (alternatives) c.alternatives = alternatives;
      return c;
    };

    // Ketuk dua kali / coba lagi setelah sinyal putus: jadwal yang sama persis sudah ada → kembalikan yang itu.
    const dup = all.find(function(x) {
      const st = String(x.status || '').toLowerCase();
      return st !== 'available' && st !== 'cancelled' && String(x.memberId).trim() === memberId &&
        new Date(x.start).getTime() === sMs && new Date(x.end).getTime() === eMs;
    });
    if (dup) {
      return Object.assign({
        status: 'success', duplicate: true, id: dup.id, coachId: dup.coachId || '', coachName: dup.coachName || '',
        schedule: _ownScheduleOut_(dup)
      }, _slotsPayload_(all, ver, false));
    }

    // Klien di paket kelas: sesinya memakai Kelas ID (kelas, atau grup privat). Jam yang sudah dipakai kelas yang sama
    // tetap bisa diikuti selama Kapasitas belum penuh; jam baru memakai aturan slot biasa.
    const cls = _memberClassContext_(member.row);
    let classKey = '';
    if (cls) {
      classKey = String(cls.classId) + '|' + sMs;
      const same = all.filter(function(x) {
        const st = String(x.status || '').toLowerCase();
        return st !== 'available' && st !== 'cancelled' && _classKey_(x) === classKey;
      });
      if (same.some(function(x) { return String(x.memberId).trim() === memberId; })) throw new Error('Kamu sudah terdaftar di sesi kelas ini.');
      if (same.length && same.length >= cls.kapasitas) {
        const msg = 'Sesi kelas ini sudah penuh. Pilih jam lain.';
        if (!soft) throw new Error(msg);
        return conflict('full', msg);
      }
      if (same.length && new Date(same[0].end).getTime() !== eMs) {
        const msg = 'Durasi harus sama dengan sesi kelas yang sudah ada.';
        if (!soft) throw new Error(msg);
        // Satu-satunya tawaran: ikut sesi kelas itu dengan durasi yang sama.
        const w = _wibParts_(new Date(same[0].start));
        return conflict('duration', msg, [{
          start: new Date(same[0].start).toISOString(), end: new Date(same[0].end).toISOString(), date: w.date, hour: w.hour, group: 'day'
        }]);
      }
    }
    _assertQuota_(member.row, 1, all);
    _assertBookingHorizon_(req.start);
    if (_ownOverlap_(memberId, req.start, req.end, '', all)) {
      const msg = 'Kamu sudah punya sesi di jam itu.';
      if (!soft) throw new Error(msg);
      return conflict('mine', msg);
    }
    const p = _slotProblem_(req.start, req.end, '', false, classKey, all, pickedCoachId);
    if (p) {
      if (!soft) throw new Error(p.message);
      return conflict(p.code, p.message);
    }

    let slotsVer = '';
    const pickedCoach = pickedCoachId ? _activeCoaches_().find(function(c) { return c.id === pickedCoachId; }) : null;
    try {
      addResult = _addScheduleInternal_({
        coachId: pickedCoach ? pickedCoach.id : '',
        coachName: pickedCoach ? pickedCoach.name : '',
        memberId: memberId,
        memberName: memberName,
        phone: phone,
        start: req.start,
        end: req.end,
        notes: notes,
        classId: cls ? cls.classId : ''
      }, 'unread', false, true);
    } finally {
      slotsVer = _bustSlots_();   // sesudah menulis (flush, lalu versi naik)
    }
    const row = {
      id: addResult.id, memberId: memberId, title: memberName, phone: phone, start: req.start, end: req.end, notes: notes,
      status: 'unread', coachId: addResult.coachId || '', coachName: addResult.coachName || '', completedAt: '',
      recurringGroupId: '', classId: cls ? String(cls.classId) : ''
    };
    all.push(row);
    // Write-through: data dibaca di dalam lock + sesi baru ini, disimpan di bawah versi yang baru saja dinaikkan.
    out = Object.assign({
      status: 'success', id: addResult.id, coachId: row.coachId, coachName: row.coachName,
      schedule: _ownScheduleOut_(row)
    }, _slotsPayload_(all, slotsVer, true));
  } finally {
    lock.releaseLock();
  }
  const assignedCoachName = addResult.coachName || '';
  const startTime = new Date(scheduleData.start);
  const formattedTime = startTime.toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long'}) + ' jam ' + startTime.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) + ' WIB';
  const subject = "📅 Booking Baru: " + memberName;
  const waLink = "https://wa.me/" + phone + "?text=" + encodeURIComponent("Halo " + memberName + ", booking jadwal latihan kamu untuk " + formattedTime + " sudah Coach terima ya! Sampai jumpa!");

  const body = `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111827;">
      <div style="background-color: white; padding: 30px; border-radius: 12px; max-width: 500px; margin: 0 auto; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <h2 style="margin-top:0; color: #000000;">Ada Booking Sesi Baru! 🎉</h2>
        <p>Klien Anda <b>${_escHtml_(memberName)}</b> baru saja mem-booking jadwal latihan secara mandiri. ${assignedCoachName ? 'Sesi ini otomatis ter-assign ke Coach ' + _escHtml_(assignedCoachName) + '.' : 'Segera buka aplikasi untuk Assign Coach!'}</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #000000;">
          <p style="margin:0 0 8px 0;"><b>Jadwal:</b> ${formattedTime}</p>
          <p style="margin:0 0 8px 0;"><b>Durasi:</b> ${duration} Menit</p>
          <p style="margin:0;"><b>Fokus/Catatan:</b> ${_escHtml_(notes || '-')}</p>
        </div>
        <a href="${_escHtml_(waLink)}" style="display: block; width: 100%; text-align: center; background-color: #000000; color: white; padding: 12px 0; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px;">Kirim WA Konfirmasi ke Klien</a>
      </div>
    </div>
  `;

  // 1. Email ke pemilik akun (getEffectiveUser — getActiveUser kosong untuk pengunjung anonim)
  try { MailApp.sendEmail({ to: _notifEmailRecipient_(), subject: subject, htmlBody: body }); } catch(e) { Logger.log('Email booking gagal: ' + e); }

  // 2. Notifikasi Telegram
  const pesanTelegram = "📅 <b>BOOKING SESI BARU!</b> 🎉\n\n" +
                        "👤 <b>Klien:</b> " + _escHtml_(memberName) + "\n" +
                        "⏰ <b>Jadwal:</b> " + formattedTime + "\n" +
                        "⏳ <b>Durasi:</b> " + duration + " Menit\n" +
                        (assignedCoachName ? "🧑‍🏫 <b>Coach:</b> " + _escHtml_(assignedCoachName) + " (auto-assign)\n" : "") +
                        "📝 <b>Catatan:</b> " + _escHtml_(notes || '-') + "\n\n" +
                        "👉 <a href='" + _escHtml_(waLink) + "'>Chat Konfirmasi Klien</a>";

  try {
    kirimNotifTelegram_(pesanTelegram);
  } catch(e) {
    Logger.log("Notif Telegram gagal: " + e);
  }

  return out;
}

// ── 📂 STATUS ────────────────────────────────────────────────────────────────

function markSchedulesAsRead(token, ids) {
  requireAdmin_(token);
  if (!Array.isArray(ids)) ids = [];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (ids.includes(data[i][0])) {
      sheet.getRange(i + 1, 8).setValue('read');
    }
  }
  return {status: 'success'};
}

/**
 * Pastikan sheet Schedules punya kolom ke-11 "Completed At" (dipakai untuk
 * data akurat di getCoachMonthlyStats). Sheet lama yang dibuat sebelum kolom ini
 * ada tidak akan auto-migrasi header-nya lewat getOrCreateSheet_, jadi dicek manual
 * di sini — aman dipanggil berkali-kali, hanya menulis kalau memang belum ada.
 */
function _ensureCompletedAtColumn_(sheet) {
  const headerCell = sheet.getRange(1, 11);
  if (headerCell.getValue() !== 'Completed At') {
    headerCell.setValue('Completed At');
    headerCell.setFontWeight('bold');
  }
}

/**
 * Tandai Selesai & Potong Sesi Klien (Manajemen Transaksi Kuota).
 * Mengubah status jadwal di kalender menjadi hijau ('completed') dan menambah
 * Sesi Terpakai Klien (+1).
 */
function completeSession(token, scheduleId, memberId) {
  requireAdmin_(token);
  // memberId dari browser diabaikan: klien yang dipotong selalu pemilik jadwal ini (kolom B).
  return _locked_(function() { return _completeSession_(scheduleId); });
}

function _completeSession_(scheduleId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schSheet = ss.getSheetByName('Schedules');
  if(!schSheet) throw new Error('Sheet Schedules tidak ditemukan');
  _ensureCompletedAtColumn_(schSheet);
  const schData = schSheet.getDataRange().getValues();
  let schRow = -1;
  for (let i = 1; i < schData.length; i++) {
    if (schData[i][0] === scheduleId) { schRow = i; break; }
  }
  if (schRow === -1) throw new Error('Jadwal tidak ditemukan');
  const memberName = schData[schRow][2];
  const memberId = String(schData[schRow][1]).trim();
  const alreadyDone = String(schData[schRow][7]).toLowerCase() === 'completed';

  const memSheet = _getMemberDataSheet_();
  const memData = memSheet.getDataRange().getValues();
  let memRow = -1;
  for (let i = 1; i < memData.length; i++) {
    if (String(memData[i][0]).trim() === memberId) { memRow = i; break; }
  }
  if (memRow === -1) throw new Error('Klien tidak ditemukan');

  let usedAfter = parseInt(memData[memRow][9]) || 0;
  const totalSesi = parseInt(memData[memRow][8]) || 0;
  // Sudah selesai (mis. tombol ditekan dua kali): jangan potong sesi lagi.
  if (!alreadyDone) {
    schSheet.getRange(schRow + 1, 8).setValue('completed');
    schSheet.getRange(schRow + 1, 11).setValue(new Date()); // Completed At — dipakai getCoachMonthlyStats
    usedAfter += 1;
    memSheet.getRange(memRow + 1, 10).setValue(usedAfter);

    try {
      kirimNotifTelegram_("✅ <b>SESI SELESAI</b>\n\n" +
        "👤 <b>Klien:</b> " + escapeHtmlTelegram(memberName) + "\n" +
        "📦 <b>Sesi Terpakai:</b> " + usedAfter + "/" + totalSesi);
    } catch(e) { Logger.log("Notif Telegram gagal: " + e); }
  }

  // Data untuk reminder WA sisa sesi (dikirim manual oleh admin via tombol di frontend,
  // bukan auto-send, karena WA tidak punya API kirim otomatis tanpa WhatsApp Business API).
  const remaining = Math.max(0, totalSesi - usedAfter);
  const reminderMessage = "Halo " + memberName + ", sesi kamu tersisa " + remaining + " dari " + totalSesi + " ya.";

  return {
    status: 'success',
    memberId: memberId,
    alreadyCompleted: alreadyDone,
    memberName: memberName,
    usedSessions: usedAfter,
    totalSessions: totalSesi,
    remainingSessions: remaining,
    reminderMessage: reminderMessage
  };
}

/**
 * Menghapus jadwal (schedule) berdasarkan ID.
 * Jika jadwal berstatus 'completed', otomatis mengembalikan (-1) Sesi Terpakai
 * klien agar kuota member tidak salah hitung setelah jadwal dihapus.
 */
function deleteSchedule(token, scheduleId) {
  requireAdmin_(token);
  return _locked_(function() {
    const res = _deleteSchedule_(scheduleId);
    _bustSlots_();   // sesudah menulis, masih di dalam lock: buang cache jam kosong
    return res;
  });
}

function _deleteSchedule_(scheduleId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const schSheet = ss.getSheetByName('Schedules');
    if (!schSheet) throw new Error('Sheet Schedules tidak ditemukan');

    const schData = schSheet.getDataRange().getValues();
    let rowToDelete = -1;
    let memberId = null;
    let wasCompleted = false;
    let memberName = '';

    for (let i = 1; i < schData.length; i++) {
      if (schData[i][0] === scheduleId) {
        rowToDelete = i + 1;
        memberId = schData[i][1];
        memberName = schData[i][2];
        wasCompleted = String(schData[i][7]).toLowerCase() === 'completed';
        break;
      }
    }

    if (rowToDelete === -1) throw new Error('Jadwal tidak ditemukan');

    schSheet.deleteRow(rowToDelete);

    if (wasCompleted && memberId) {
      const memSheet = _getMemberDataSheet_();
      const memData = memSheet.getDataRange().getValues();
      for (let i = 1; i < memData.length; i++) {
        if (memData[i][0] === memberId) {
          let currentUsed = parseInt(memData[i][9]) || 0;
          let newUsed = Math.max(0, currentUsed - 1);
          memSheet.getRange(i + 1, 10).setValue(newUsed);
          break;
        }
      }
    }

    try {
      kirimNotifTelegram_("🗑️ <b>JADWAL DIHAPUS</b>\n\n👤 <b>Klien:</b> " + escapeHtmlTelegram(memberName));
    } catch(e) { Logger.log("Notif Telegram gagal: " + e); }

    return { status: 'success' };
  } catch (err) {
    throw new Error('Gagal menghapus jadwal: ' + err.message);
  }
}


// #############################################################################
// 📁 06_NOTIFICATIONS — Notifikasi Email Harian (Scheduler H-1)
// #############################################################################

function setupDailyTrigger() {
  requireOwner_();
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyReminderEmail') ScriptApp.deleteTrigger(triggers[i]);
  }
  // Reminder jam 05:00 (pagi)
  ScriptApp.newTrigger('sendDailyReminderEmail').timeBased().everyDays(1).atHour(5).create();
  // Reminder jam 20:00
  ScriptApp.newTrigger('sendDailyReminderEmail').timeBased().everyDays(1).atHour(20).create();
}

/**
 * Mengirimkan pengingat jadwal harian untuk besok via Email dan Telegram.
 * Berjalan di Google Apps Script backend.
 */
function sendDailyReminderEmail() {
  // Fungsi trigger ini bisa dipanggil dari browser juga; batasi supaya tidak bisa
  // dipakai untuk spam email/Telegram (trigger aslinya jalan 2x sehari).
  if (!_throttle_('daily_reminder', 3000)) return;
  try { _rolloverRecurringTasks_(); } catch (e) { Logger.log('Rollover PR berulang gagal: ' + e); }
  logToSheet_("Memulai fungsi sendDailyReminderEmail", "INFO");

  try {
    // 1. Ambil timezone dan jadwal
    const timeZone = Session.getScriptTimeZone();
    const emailTujuan = _notifEmailRecipient_();
    const schedules = _getSchedulesAll_();

    logToSheet_(`Berhasil mengambil total ${schedules.length} jadwal dari _getSchedulesAll_()`, "INFO");

    // 2. Tentukan batas waktu untuk besok (00:00:00 - 23:59:59)
    const now = new Date();
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);

    // 3. Filter jadwal khusus untuk besok saja
    const schedulesBesok = schedules.filter(sch => {
      const schDate = new Date(sch.start);
      return schDate >= tomorrowStart && schDate <= tomorrowEnd;
    });

    logToSheet_(`Ditemukan ${schedulesBesok.length} jadwal untuk besok`, "INFO");

    // 4. PERSIAPAN WADAH PESAN
    let emailBody = "";
    let pesanTelegram = "";

    // JIKA TIDAK ADA JADWAL: Siapkan pesan bahwa jadwal kosong
    if (schedulesBesok.length === 0) {
      logToSheet_("Jadwal kosong, menyiapkan notifikasi tidak ada jadwal", "INFO");
      
      emailBody = `<h3>🔔 Pengingat Jadwal Latihan Besok</h3>
                   <p>Halo, tidak ada jadwal latihan klien untuk besok. Selamat istirahat! 🏖️</p>`;
                   
      pesanTelegram = `🔔 <b>PENGINGAT JADWAL LATIHAN BESOK</b> 🔔\n\nHalo Coach, tidak ada jadwal latihan klien untuk besok. Selamat istirahat! 🏖️`;
    } 
    // JIKA ADA JADWAL: Masukkan list jadwal ke dalam pesan
    else {
      logToSheet_("Menyiapkan draft email dan Telegram beserta list jadwal", "INFO");
      
      emailBody = `<h3>🔔 Pengingat Jadwal Latihan Besok</h3><ul style="line-height: 1.6;">`;
      pesanTelegram = `🔔 <b>PENGINGAT JADWAL LATIHAN BESOK</b> 🔔\n\n`;

      const waInReminder = !_rmdJobActive_('sesi-besok');   // T-122: kalau pengingat 'sesi-besok' aktif, tombol WA klien ada di Telegram-nya
      schedulesBesok.forEach(sch => {
        const schDate = new Date(sch.start);
        const notes = sch.notes ? ` (${sch.notes})` : '';
        const coachName = _escHtml_(sch.coachName || 'Belum Ditugaskan');
        const title = _escHtml_(sch.title);

        const jam = Utilities.formatDate(schDate, timeZone, "HH:mm");
        const noWa = sch.phone ? sch.phone.toString().replace(/^0/, '62').replace(/\D/g, '') : '';
        const rawMessage = `Halo ${sch.title}, ini Coach. Mengingatkan jadwal latihan kita besok jam ${jam} WIB${notes}. Tolong konfirmasi ya!`;
        const textWA = encodeURIComponent(rawMessage);
        const linkWA = `https://wa.me/${noWa}?text=${textWA}`;

        emailBody += `
          <li style="margin-bottom: 15px;">
            <b>${jam} WIB</b> - ${title} <br>
            Coach Ditugaskan: <i>${coachName}</i> <br>
            ${waInReminder ? `<a href="${_escHtml_(linkWA)}" style="color: #25D366; font-weight: bold; text-decoration: none;">
              [📱 Kirim WA Konfirmasi ke Klien]
            </a>` : ''}
          </li>`;

        pesanTelegram += `⏰ <b>${jam} WIB</b> - ${title}\n🏋️ <b>Coach:</b> ${coachName}\n` + (waInReminder ? `👉 <a href="${_escHtml_(linkWA)}">Kirim WA Konfirmasi</a>\n` : '') + `\n`;
      });

      emailBody += `</ul>`;
    }

    // 4b. T-47: kalimat tidur (RMD_TPL_SLEEP), hanya di run malam. Kosong = tidak ada perubahan.
    const sleepLine = _rmdJobActive_('sesi-besok') ? '' : _sleepLine_(now.getHours());   // T-122: kalau 'sesi-besok' aktif, kalimat tidur ikut pesan klien
    if (sleepLine) {
      emailBody += `<p>😴 ${_escHtml_(sleepLine)}</p>`;
      pesanTelegram += `\n\n😴 ${_escHtml_(sleepLine)}`;
    }

    // 5. EKSEKUSI PENGIRIMAN EMAIL
    logToSheet_(`Mencoba mengirim email ke ${emailTujuan}`, "INFO");
    MailApp.sendEmail({
      to: emailTujuan,
      subject: "🔔 Pengingat Jadwal PT Besok",
      htmlBody: emailBody
    });
    logToSheet_("Email berhasil terkirim", "SUCCESS");

    // 6. EKSEKUSI PENGIRIMAN TELEGRAM
    try {
      logToSheet_("Mencoba mengirim notif Telegram", "INFO");
      kirimNotifTelegram_(pesanTelegram);
      logToSheet_("Telegram berhasil terkirim", "SUCCESS");
    } catch(e) {
      logToSheet_(`Telegram gagal terkirim: ${e.message}`, "ERROR");
    }

  } catch(errorUtama) {
    logToSheet_(`Error pada sistem utama: ${errorUtama.message}`, "FATAL ERROR");
  }
  
  logToSheet_("Fungsi sendDailyReminderEmail selesai", "INFO");
}

/**
 * Pasang trigger mingguan buat sendWeeklyReportEmail().
 * Jalan tiap Senin jam 07:00 (waktu timezone project).
 * Aman dijalankan berkali-kali: trigger lama untuk fungsi ini dihapus dulu
 * sebelum yang baru dipasang, supaya tidak dobel-dobel kalau di-run ulang.
 *
 * CARA AKTIFKAN: buka Extensions > Apps Script > pilih fungsi ini di dropdown > Run (sekali saja).
 */
function setupWeeklyReportTrigger() {
  requireOwner_();
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendWeeklyReportEmail') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('sendWeeklyReportEmail')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .create();
}

/**
 * Kirim ringkasan performa 7 hari terakhir ke email admin, tiap Senin pagi.
 * Isi laporan: total sesi selesai, member baru, coach paling aktif, dan paket
 * terlaris — semuanya reuse fungsi analytics yang sudah ada (getCoachMonthlyStats,
 * getPackageTrendStats), bukan logic hitung baru, supaya angkanya konsisten
 * dengan yang tampil di Dashboard Admin.
 *
 * Catatan: getCoachMonthlyStats & getPackageTrendStats sebenarnya dihitung per
 * bulan kalender (1 - akhir bulan), bukan rolling 7 hari, jadi di laporan ini
 * dipakai sebagai konteks "progres bulan berjalan", sedangkan angka "minggu ini"
 * (sesi selesai & member baru) dihitung terpisah dari rentang 7 hari terakhir yang sebenarnya.
 */
function sendWeeklyReportEmail() {
  if (!_throttle_('weekly_report', 21600)) return; // lihat catatan di sendDailyReminderEmail
  logToSheet_("Memulai fungsi sendWeeklyReportEmail", "INFO");

  try {
    const timeZone = Session.getScriptTimeZone();
    const emailTujuan = _notifEmailRecipient_();
    const now = new Date();

    // Rentang 7 hari terakhir (H-7 sampai sekarang)
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Sesi selesai minggu ini (dari Completed At, konsisten dengan getCoachMonthlyStats)
    const schedules = _getSchedulesAll_();
    const completedThisWeek = schedules.filter(function(s) {
      if (String(s.status).toLowerCase() !== 'completed' || !s.completedAt) return false;
      const d = new Date(s.completedAt);
      return !isNaN(d.getTime()) && d >= weekStart && d <= now;
    });

    // 2. Member baru minggu ini (dari Tanggal Gabung di MemberData)
    const members = _getMembersAll_();
    const newMembersThisWeek = members.filter(function(m) {
      if (!m.joinDate) return false;
      const d = new Date(m.joinDate);
      return !isNaN(d.getTime()) && d >= weekStart && d <= now;
    });

    // 3. Konteks bulan berjalan: coach paling aktif & paket terlaris (reuse fungsi existing)
    const coachStats = _coachMonthlyStats_(now.getMonth() + 1, now.getFullYear());
    const packageStats = _packageTrendStats_(now.getMonth() + 1, now.getFullYear());
    const topCoach = coachStats.length > 0 ? coachStats[0] : null;
    const topPackage = packageStats.length > 0 ? packageStats[0] : null;

    const periodeLabel = Utilities.formatDate(weekStart, timeZone, "d MMM") + " - " + Utilities.formatDate(now, timeZone, "d MMM yyyy");

    // 4. Compose email (HTML sederhana, konsisten gaya sama sendDailyReminderEmail)
    let emailBody = `<h3>📊 Laporan Mingguan XNK Gym OS</h3>
      <p style="color:#666;">Periode: <b>${periodeLabel}</b></p>
      <ul style="line-height: 1.8;">
        <li>✅ <b>Sesi Selesai Minggu Ini:</b> ${completedThisWeek.length}</li>
        <li>🆕 <b>Member Baru Minggu Ini:</b> ${newMembersThisWeek.length}</li>
        <li>🏆 <b>Coach Paling Aktif Bulan Ini:</b> ${topCoach ? _escHtml_(topCoach.coachName) + ' (' + topCoach.totalSessions + ' sesi)' : '-'}</li>
        <li>📦 <b>Paket Terlaris Bulan Ini:</b> ${topPackage ? _escHtml_(topPackage.namaPaket) + ' (' + topPackage.count + 'x dipilih)' : '-'}</li>
      </ul>
      <p style="color:#999; font-size:12px;">Laporan otomatis, dikirim tiap Senin pagi. Buka Dashboard Admin untuk detail lengkap.</p>`;

    let pesanTelegram = `📊 <b>LAPORAN MINGGUAN</b> (${periodeLabel})\n\n` +
      `✅ Sesi Selesai: ${completedThisWeek.length}\n` +
      `🆕 Member Baru: ${newMembersThisWeek.length}\n` +
      `🏆 Coach Teraktif: ${topCoach ? _escHtml_(topCoach.coachName) + ' (' + topCoach.totalSessions + ' sesi)' : '-'}\n` +
      `📦 Paket Terlaris: ${topPackage ? _escHtml_(topPackage.namaPaket) + ' (' + topPackage.count + 'x)' : '-'}`;

    // 5. Kirim email
    logToSheet_(`Mencoba mengirim laporan mingguan ke ${emailTujuan}`, "INFO");
    MailApp.sendEmail({ to: emailTujuan, subject: "📊 Laporan Mingguan XNK Gym OS - " + periodeLabel, htmlBody: emailBody });
    logToSheet_("Laporan mingguan email berhasil terkirim", "SUCCESS");

    // 6. Kirim juga ke Telegram (dual-channel, konsisten sama pola reminder harian)
    try {
      kirimNotifTelegram_(pesanTelegram);
      logToSheet_("Laporan mingguan Telegram berhasil terkirim", "SUCCESS");
    } catch(e) {
      logToSheet_(`Laporan mingguan Telegram gagal terkirim: ${e.message}`, "ERROR");
    }

  } catch(errorUtama) {
    logToSheet_(`Error pada sendWeeklyReportEmail: ${errorUtama.message}`, "FATAL ERROR");
  }

  logToSheet_("Fungsi sendWeeklyReportEmail selesai", "INFO");
}

/**
 * Fungsi untuk mengirim pesan ke Telegram Admin
 * @param {string} pesan - Teks yang ingin dikirim
 */
function kirimNotifTelegram_(pesan) {
  // Token bot & chat ID admin disimpan di Script Properties (Project Settings),
  // BUKAN di kode: TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_IDS (dipisah koma).
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TELEGRAM_ENABLED') === 'false') {
    Logger.log("Notif Telegram dilewati: dimatikan lewat Pengaturan.");
    return;
  }
  const tokenBot = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatIdAdmin = String(props.getProperty('TELEGRAM_CHAT_IDS') || '')
    .split(',').map(function(id) { return id.trim(); }).filter(String);
  if (!tokenBot || chatIdAdmin.length === 0) {
    Logger.log("Notif Telegram dilewati: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_IDS belum diatur di Script Properties.");
    return;
  }
  
  const url = "https://api.telegram.org/bot" + tokenBot + "/sendMessage";
  
  // Lakukan perulangan (looping) untuk setiap ID di dalam array
  chatIdAdmin.forEach(function(id) {
    
    const payload = {
      "chat_id": id, // Gunakan 'id' satuan dari hasil perulangan
      "text": pesan,
      "parse_mode": "HTML" 
    };
    
    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };
    
    try {
      UrlFetchApp.fetch(url, options);
    } catch(e) {
      Logger.log("Gagal kirim notif ke ID " + id + ": " + e);
    }
    
  });
}

// ==========================================
// FUNGSI UNTUK UJI COBA (JALANKAN FUNGSI INI)
// ==========================================
function testNotif() {
  requireOwner_();
  const teks = "🚨 <b>Ada Booking Baru!</b>\n\nNama: Budi\nJadwal: Senin, 10:00\nStatus: Menunggu Persetujuan.\n\nSilakan cek di Dashboard!";
  kirimNotifTelegram_(teks);
}

// #############################################################################
// 📁 07_PRICELIST — Manajemen Pricelist (Katalog Paket)
// #############################################################################

// Kategori paket TETAP (semuanya tampil sebagai tab di landing; `core` juga memicu pengingat makan).
const PACKAGE_CATEGORIES = [
  { id: 'student', label: 'Student', onLanding: true },
  { id: 'college', label: 'College', onLanding: true },
  { id: 'regular', label: 'Regular', onLanding: true },
  { id: 'premium', label: 'Premium', onLanding: true },
  { id: 'core', label: 'Core', onLanding: true }
];
const PRICELIST_HEADERS = ["ID", "Nama Paket", "Kategori", "Harga", "Jumlah Sesi", "Durasi", "Deskripsi", "Benefit", "Status Aktif", "Urutan", "Tipe", "Kapasitas", "Jadwal Kelas", "Kelas Privat"];
const PRICELIST_KEYS = ['id', 'nama', 'kategori', 'harga', 'sesi', 'durasi', 'deskripsi', 'benefit', 'aktif', 'urutan', 'tipe', 'kapasitas', 'jadwal', 'privat'];
const PACKAGE_MAX = { nama: 60, durasi: 40, deskripsi: 300, benefitItem: 60, benefitCount: 10, harga: 100000000, sesi: 200, kapasitas: 50, jadwal: 80 };
// Kolom opsional kelas (diurutkan setelah "Urutan"); ditambahkan idempoten di _ensurePriceListSchema_.
const PRICELIST_CLASS_COLS = [['tipe', 'Tipe'], ['kapasitas', 'Kapasitas'], ['jadwal', 'Jadwal Kelas'], ['privat', 'Kelas Privat']];

/**
 * Peta kolom PriceList berdasarkan NAMA header (bukan posisi), supaya menambah kolom tidak menggeser bacaan.
 * Kembalian: { kunci: indeks kolom 0-based }. Kalau nama header tidak dikenali, pakai posisi lama
 * (9 kolom, atau 8 kolom tanpa "Jumlah Sesi").
 */
function _priceListColumns_(headerRow) {
  const norm = function(v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  const names = PRICELIST_HEADERS.map(norm);
  const idx = {};
  (headerRow || []).forEach(function(h, i) {
    const k = names.indexOf(norm(h));
    if (k !== -1 && idx[PRICELIST_KEYS[k]] === undefined) idx[PRICELIST_KEYS[k]] = i;
  });
  if (['id', 'nama', 'kategori', 'harga', 'aktif'].every(function(k) { return idx[k] !== undefined; })) return idx;
  const filled = (headerRow || []).filter(function(h) { return String(h == null ? '' : h).trim() !== ''; }).length;
  return filled >= 9
    ? { id: 0, nama: 1, kategori: 2, harga: 3, sesi: 4, durasi: 5, deskripsi: 6, benefit: 7, aktif: 8 }
    : { id: 0, nama: 1, kategori: 2, harga: 3, durasi: 4, deskripsi: 5, benefit: 6, aktif: 7 };
}

function _priceListSheetAndColumns_() {
  const sheet = getOrCreateSheet_('PriceList', PRICELIST_HEADERS);
  const header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  return { sheet: sheet, idx: _priceListColumns_(header), header: header };
}

/** Sama dengan di atas, tapi melengkapi kolom "Jumlah Sesi" dan "Urutan" bila belum ada. Idempoten; panggil di dalam lock. */
function _ensurePriceListSchema_() {
  const ctx = _priceListSheetAndColumns_();
  const named = _priceListNamedColumns_(ctx.header);
  if (!named) throw new Error('Header sheet PriceList tidak dikenali. Pastikan baris pertama berisi: ' + PRICELIST_HEADERS.join(', ') + '.');
  const sheet = ctx.sheet;
  if (named.sesi === undefined) {
    sheet.insertColumnAfter(named.harga + 1);
    sheet.getRange(1, named.harga + 2).setValue('Jumlah Sesi');
    sheet.getRange(1, named.harga + 2).setFontWeight('bold');
  }
  let header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  let cols = _priceListNamedColumns_(header);
  if (cols.urutan === undefined) {
    const col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue('Urutan');
    sheet.getRange(1, col).setFontWeight('bold');
    header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    cols = _priceListNamedColumns_(header);
    // Kolom baru: beri nomor urut sesuai urutan tampil sekarang, supaya paket baru masuk paling akhir (bukan paling depan).
    const perCat = {};
    _readPackages_(sheet, cols).forEach(function(p) {
      perCat[p.kategori] = (perCat[p.kategori] || 0) + 1;
      sheet.getRange(p._row, cols.urutan + 1).setValue(perCat[p.kategori]);
    });
  }
  // Kolom kelas (Tipe, Kapasitas, Jadwal Kelas, Kelas Privat): hanya ditambah di ujung kanan, baris lama dibiarkan kosong (= paket biasa).
  let added = false;
  PRICELIST_CLASS_COLS.forEach(function(c) {
    if (cols[c[0]] !== undefined) return;
    const col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(c[1]);
    sheet.getRange(1, col).setFontWeight('bold');
    cols[c[0]] = col - 1;
    added = true;
  });
  if (added) {
    header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    cols = _priceListNamedColumns_(header);
  }
  return { sheet: sheet, idx: cols };
}

/** Peta kolom hanya dari nama header; null kalau kolom inti tidak ada (tidak menebak posisi). */
function _priceListNamedColumns_(header) {
  const norm = function(v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  const names = PRICELIST_HEADERS.map(norm);
  const idx = {};
  header.forEach(function(h, i) {
    const k = names.indexOf(norm(h));
    if (k !== -1 && idx[PRICELIST_KEYS[k]] === undefined) idx[PRICELIST_KEYS[k]] = i;
  });
  return ['id', 'nama', 'kategori', 'harga', 'aktif'].every(function(k) { return idx[k] !== undefined; }) ? idx : null;
}

function _plCell_(row, idx, key) { return idx[key] === undefined ? '' : row[idx[key]]; }

/** Semua paket (aktif & nonaktif) dalam urutan tampil: kategori menurut kemunculan pertama, lalu Urutan, lalu baris sheet. */
function _readPackages_(sheet, idx) {
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = String(sanitizeValue(_plCell_(row, idx, 'id')) || '').trim();
    if (!id) continue;
    const ur = _plCell_(row, idx, 'urutan');
    const sesi = sanitizeValue(_plCell_(row, idx, 'sesi'));
    const aktifRaw = _plCell_(row, idx, 'aktif');
    list.push({
      _row: i + 1,
      id: id,
      namaPaket: sanitizeValue(_plCell_(row, idx, 'nama')),
      kategori: sanitizeValue(_plCell_(row, idx, 'kategori')).toLowerCase().trim(),
      harga: parseFloat(_plCell_(row, idx, 'harga')) || 0,
      jumlahSesi: sesi !== '' ? parseInt(sesi, 10) : '',
      durasi: sanitizeValue(_plCell_(row, idx, 'durasi')),
      deskripsi: sanitizeValue(_plCell_(row, idx, 'deskripsi')),
      benefit: sanitizeValue(_plCell_(row, idx, 'benefit')).split(',').map(function(b) { return b.trim(); }).filter(String),
      aktif: aktifRaw === true || String(aktifRaw).toUpperCase() === 'TRUE',
      urutan: ur === '' || isNaN(Number(ur)) ? '' : Number(ur),
      tipe: String(sanitizeValue(_plCell_(row, idx, 'tipe'))).toLowerCase().trim() === 'kelas' ? 'kelas' : 'paket',
      kapasitas: _kapasitasFrom_(_plCell_(row, idx, 'kapasitas')),
      jadwal: String(sanitizeValue(_plCell_(row, idx, 'jadwal'))).trim(),
      privat: _truthyCell_(_plCell_(row, idx, 'privat'))
    });
  }
  const catRank = {};
  list.forEach(function(p) { if (catRank[p.kategori] === undefined) catRank[p.kategori] = Object.keys(catRank).length; });
  list.forEach(function(p, n) { p._n = n; });
  list.sort(function(a, b) {
    if (catRank[a.kategori] !== catRank[b.kategori]) return catRank[a.kategori] - catRank[b.kategori];
    const ua = a.urutan === '' ? Infinity : a.urutan, ub = b.urutan === '' ? Infinity : b.urutan;
    if (ua !== ub) return ua < ub ? -1 : 1;
    return a._n - b._n;
  });
  return list;
}

function _kapasitasFrom_(v) {
  const n = parseInt(sanitizeValue(v), 10);
  return n > 0 ? n : '';
}

function _truthyCell_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }

/** Kursi terisi per paket: klien yang masih punya sisa sesi di paket itu (klien yang kuotanya habis melepas kursi). */
function _packageSeats_() {
  const seats = {};
  _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    const id = String(r[6] || '').trim();
    if (!id || String(r[0]).trim() === '') return;
    if ((parseInt(r[9], 10) || 0) >= (parseInt(r[8], 10) || 0)) return;
    seats[id] = (seats[id] || 0) + 1;
  });
  return seats;
}

function getPriceList() {
  const ctx = _priceListSheetAndColumns_();
  const list = _readPackages_(ctx.sheet, ctx.idx).filter(function(p) { return p.aktif; });
  const seats = list.some(function(p) { return p.tipe === 'kelas'; }) ? _packageSeats_() : {};
  return list.map(function(p) {
    const out = {
      id: p.id, namaPaket: p.namaPaket, kategori: p.kategori, harga: p.harga, jumlahSesi: p.jumlahSesi,
      durasi: p.durasi, deskripsi: p.deskripsi, benefit: p.benefit.length ? p.benefit : [''], aktif: true
    };
    if (p.tipe === 'kelas') {
      out.tipe = 'kelas';
      out.kapasitas = p.kapasitas;
      out.jadwal = p.jadwal;
      out.privat = p.privat;
      out.terisi = seats[p.id] || 0;
    }
    return out;
  });
}

/** Publik: paket aktif + kategori yang tampil di landing (urut tetap), untuk landing dan halaman /harga. */
function getPriceListPublic() {
  const cats = PACKAGE_CATEGORIES.filter(function(c) { return c.onLanding; }).map(function(c) { return { id: c.id, label: c.label }; });
  const ids = {};
  cats.forEach(function(c) { ids[c.id] = true; });
  return {
    categories: cats,
    packages: getPriceList().filter(function(p) { return ids[p.kategori]; })
  };
}

// ── Pricelist: kelola dari panel (admin) ─────────────────────────────────────

function _packageUsage_() {
  const members = {}, log = {};
  _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    const id = String(r[6] || '').trim();
    if (id) members[id] = (members[id] || 0) + 1;
  });
  _getMembersLogSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    const id = String(r[4] || '').trim();
    if (id) log[id] = (log[id] || 0) + 1;
  });
  return { members: members, log: log };
}

function _adminPackage_(p, usage) {
  return {
    id: p.id, namaPaket: p.namaPaket, kategori: p.kategori, harga: p.harga, jumlahSesi: p.jumlahSesi,
    durasi: p.durasi, deskripsi: p.deskripsi, benefit: p.benefit, aktif: p.aktif, urutan: p.urutan,
    tipe: p.tipe, kapasitas: p.kapasitas, jadwal: p.jadwal, privat: p.privat,
    usage: { activeMembers: usage.members[p.id] || 0, logEntries: usage.log[p.id] || 0 }
  };
}

/** Semua paket untuk halaman Pengaturan → Paket & Harga (nonaktif ikut, diurutkan setelah yang aktif di tiap kategori). */
function getPriceListAdmin(token) {
  requireAdmin_(token);
  const ctx = _priceListSheetAndColumns_();
  const usage = _packageUsage_();
  const list = _readPackages_(ctx.sheet, ctx.idx);
  const rank = {};
  list.forEach(function(p) { if (rank[p.kategori] === undefined) rank[p.kategori] = Object.keys(rank).length; });
  list.forEach(function(p, n) { p._m = n; });
  list.sort(function(a, b) {
    if (rank[a.kategori] !== rank[b.kategori]) return rank[a.kategori] - rank[b.kategori];
    if (a.aktif !== b.aktif) return a.aktif ? -1 : 1;
    return a._m - b._m;
  });
  return { categories: PACKAGE_CATEGORIES, packages: list.map(function(p) { return _adminPackage_(p, usage); }) };
}

function _wholeNumber_(v, min, max, msg) {
  const n = Number(v);
  if (v === '' || v == null || typeof v === 'boolean' || !Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) throw new Error(msg);
  return n;
}

function _validatePackage_(data, existing) {
  const nama = String(data.namaPaket == null ? '' : data.namaPaket).trim();
  if (!nama || nama.length > PACKAGE_MAX.nama) throw new Error('Nama paket wajib diisi (maksimal ' + PACKAGE_MAX.nama + ' karakter).');
  const kategori = String(data.kategori == null ? '' : data.kategori).trim().toLowerCase();
  const known = PACKAGE_CATEGORIES.some(function(c) { return c.id === kategori; });
  if (!known && !(existing && existing.kategori === kategori)) throw new Error('Kategori tidak dikenal. Pilih salah satu: ' + PACKAGE_CATEGORIES.map(function(c) { return c.id; }).join(', ') + '.');
  const harga = _wholeNumber_(data.harga, 0, PACKAGE_MAX.harga, 'Harga harus bilangan bulat Rupiah antara 0 dan 100.000.000.');
  const sesiRaw = data.jumlahSesi;
  const sesi = (sesiRaw === '' || sesiRaw == null) ? '' : _wholeNumber_(sesiRaw, 1, PACKAGE_MAX.sesi, 'Jumlah sesi harus bilangan bulat 1–' + PACKAGE_MAX.sesi + ', atau kosongkan untuk fleksibel.');
  const durasi = String(data.durasi == null ? '' : data.durasi).trim();
  if (durasi.length > PACKAGE_MAX.durasi) throw new Error('Durasi maksimal ' + PACKAGE_MAX.durasi + ' karakter.');
  const deskripsi = String(data.deskripsi == null ? '' : data.deskripsi).trim();
  if (deskripsi.length > PACKAGE_MAX.deskripsi) throw new Error('Deskripsi maksimal ' + PACKAGE_MAX.deskripsi + ' karakter.');
  const rawBenefit = Array.isArray(data.benefit) ? data.benefit : [];
  const benefit = rawBenefit.map(function(b) { return String(b == null ? '' : b).trim(); }).filter(String);
  if (benefit.length > PACKAGE_MAX.benefitCount) throw new Error('Benefit maksimal ' + PACKAGE_MAX.benefitCount + ' butir.');
  benefit.forEach(function(b) {
    if (b.length > PACKAGE_MAX.benefitItem) throw new Error('Setiap benefit maksimal ' + PACKAGE_MAX.benefitItem + ' karakter.');
    if (b.indexOf(',') !== -1) throw new Error('Benefit tidak boleh berisi koma.');
  });
  const tipe = String(data.tipe == null ? '' : data.tipe).trim().toLowerCase() === 'kelas' ? 'kelas' : 'paket';
  let kapasitas = '', jadwal = '', privat = false;
  if (tipe === 'kelas') {
    kapasitas = _wholeNumber_(data.kapasitas, 2, PACKAGE_MAX.kapasitas, 'Kapasitas kelas harus bilangan bulat 2–' + PACKAGE_MAX.kapasitas + '.');
    jadwal = String(data.jadwal == null ? '' : data.jadwal).trim();
    if (jadwal.length > PACKAGE_MAX.jadwal) throw new Error('Jadwal kelas maksimal ' + PACKAGE_MAX.jadwal + ' karakter.');
    privat = data.privat === true;
  }
  return { namaPaket: nama, kategori: kategori, harga: harga, jumlahSesi: sesi, durasi: durasi, deskripsi: deskripsi, benefit: benefit, tipe: tipe, kapasitas: kapasitas, jadwal: jadwal, privat: privat };
}

function _newPackageId_(taken) {
  const day = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd');
  for (let n = 0; n < 50; n++) {
    const id = 'PKG-' + day + '-' + (Math.random().toString(36) + '0000').slice(2, 6).toUpperCase();
    if (!taken[id]) return id;
  }
  throw new Error('Gagal membuat ID paket. Coba lagi.');
}

function _withPriceListLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try { return fn(_ensurePriceListSchema_()); } finally { lock.releaseLock(); }
}

function _writePackageRow_(sheet, idx, rowNum, v) {
  const set = function(key, val) { if (idx[key] !== undefined) sheet.getRange(rowNum, idx[key] + 1).setValue(val); };
  set('nama', v.namaPaket); set('kategori', v.kategori); set('harga', v.harga); set('sesi', v.jumlahSesi);
  set('durasi', v.durasi); set('deskripsi', v.deskripsi); set('benefit', v.benefit.join(', '));
  set('tipe', v.tipe === 'kelas' ? 'kelas' : ''); set('kapasitas', v.kapasitas); set('jadwal', v.jadwal); set('privat', v.privat ? true : '');
  if (v.aktif !== undefined) set('aktif', v.aktif);
  if (v.urutan !== undefined) set('urutan', v.urutan);
}

/** Tambah (tanpa data.id) atau ubah (dengan data.id) satu paket. Paket baru nonaktif kecuali data.aktif === true. */
function savePackage(token, data) {
  requireAdmin_(token);
  data = data || {};
  return _withPriceListLock_(function(ctx) {
    const list = _readPackages_(ctx.sheet, ctx.idx);
    const id = String(data.id == null ? '' : data.id).trim();
    const existing = id ? list.filter(function(p) { return p.id === id; })[0] : null;
    if (id && !existing) throw new Error('Paket tidak ditemukan. Muat ulang halaman.');
    const v = _validatePackage_(data, existing);
    let savedId = id;
    if (existing) {
      if (Object.prototype.hasOwnProperty.call(data, 'aktif')) v.aktif = !!data.aktif;
      if (v.kategori !== existing.kategori) v.urutan = _nextPackageOrder_(list, v.kategori);
      _writePackageRow_(ctx.sheet, ctx.idx, existing._row, v);
    } else {
      const taken = {};
      list.forEach(function(p) { taken[p.id] = true; });
      savedId = _newPackageId_(taken);
      const width = Math.max(ctx.sheet.getLastColumn(), Math.max.apply(null, Object.keys(ctx.idx).map(function(k) { return ctx.idx[k]; })) + 1);
      const row = [];
      for (let c = 0; c < width; c++) row.push('');
      row[ctx.idx.id] = savedId;
      ctx.sheet.appendRow(row);
      v.aktif = data.aktif === true;
      v.urutan = _nextPackageOrder_(list, v.kategori);
      _writePackageRow_(ctx.sheet, ctx.idx, ctx.sheet.getLastRow(), v);
    }
    const saved = _readPackages_(ctx.sheet, ctx.idx).filter(function(p) { return p.id === savedId; })[0];
    return _adminPackage_(saved, _packageUsage_());
  });
}

function _nextPackageOrder_(list, kategori) {
  let max = 0, count = 0;
  list.forEach(function(p) {
    if (p.kategori !== kategori) return;
    count++;
    if (p.urutan !== '' && p.urutan > max) max = p.urutan;
  });
  return Math.max(max, count) + 1;
}

function _findPackage_(ctx, id) {
  const pid = String(id == null ? '' : id).trim();
  const p = _readPackages_(ctx.sheet, ctx.idx).filter(function(x) { return x.id === pid; })[0];
  if (!p) throw new Error('Paket tidak ditemukan. Muat ulang halaman.');
  return p;
}

function setPackageActive(token, id, aktif) {
  requireAdmin_(token);
  return _withPriceListLock_(function(ctx) {
    const p = _findPackage_(ctx, id);
    ctx.sheet.getRange(p._row, ctx.idx.aktif + 1).setValue(!!aktif);
    p.aktif = !!aktif;
    return _adminPackage_(p, _packageUsage_());
  });
}

/** Hapus permanen hanya kalau tidak ada klien aktif & tidak ada transaksi yang memakai paket ini. */
function deletePackage(token, id) {
  requireAdmin_(token);
  return _withPriceListLock_(function(ctx) {
    const p = _findPackage_(ctx, id);
    const u = _adminPackage_(p, _packageUsage_()).usage;
    if (u.activeMembers > 0 || u.logEntries > 0) {
      throw new Error('Paket dipakai ' + u.activeMembers + ' klien / ' + u.logEntries + ' transaksi. Nonaktifkan saja.');
    }
    ctx.sheet.deleteRow(p._row);
    return { status: 'success', id: p.id };
  });
}

/** Simpan urutan tampil satu kategori: `ids` dulu (sesuai urutan yang dikirim), sisanya menyusul. */
function reorderPackages(token, category, ids) {
  requireAdmin_(token);
  const cat = String(category == null ? '' : category).trim().toLowerCase();
  if (!Array.isArray(ids)) throw new Error('Daftar urutan tidak valid.');
  return _withPriceListLock_(function(ctx) {
    const inCat = _readPackages_(ctx.sheet, ctx.idx).filter(function(p) { return p.kategori === cat; });
    const byId = {};
    inCat.forEach(function(p) { byId[p.id] = p; });
    const seen = {};
    const order = [];
    ids.forEach(function(raw) {
      const id = String(raw == null ? '' : raw).trim();
      if (!byId[id]) throw new Error('Paket ' + id + ' tidak ada di kategori ' + cat + '.');
      if (!seen[id]) { seen[id] = true; order.push(byId[id]); }
    });
    inCat.forEach(function(p) { if (!seen[p.id]) order.push(p); });
    order.forEach(function(p, n) { ctx.sheet.getRange(p._row, ctx.idx.urutan + 1).setValue(n + 1); });
    return { status: 'success', order: order.map(function(p) { return p.id; }) };
  });
}


// #############################################################################
// 📁 08_PROGRESS — Progres klien (berat, pinggang, foto) — Fase D1
// #############################################################################
// Sheet "Progress": satu baris per klien per tanggal (simpan kedua di hari yang sama = ubah).
// Sheet "ProgressPhotos": metadata foto; berkasnya di folder Drive PRIVAT "XNK Progress"
// (TIDAK PERNAH dibagikan lewat link). Foto hanya keluar lewat fungsi yang memeriksa token
// klien (fotonya sendiri) atau token admin.

const PROGRESS_HEADERS = ["ID", "Member ID", "Tanggal", "Berat (kg)", "Pinggang (cm)", "Dicatat Oleh", "Diubah Pada"];
const PROGRESS_PHOTO_HEADERS = ["ID", "Member ID", "Tanggal", "Sisi", "File ID", "Dicatat Oleh"];
const PROGRESS_LIMITS = { beratMin: 20, beratMax: 300, pinggangMin: 30, pinggangMax: 250, photosPerMember: 60, backDaysClient: 7, entriesShown: 120 };
const PROGRESS_SIDES = ['depan', 'samping'];

function _progressSheet_() {
  const sheet = getOrCreateSheet_('Progress', PROGRESS_HEADERS);
  sheet.getRange('C:C').setNumberFormat('@');
  return sheet;
}
function _progressPhotosSheet_() {
  const sheet = getOrCreateSheet_('ProgressPhotos', PROGRESS_PHOTO_HEADERS);
  sheet.getRange('C:C').setNumberFormat('@');
  return sheet;
}

function _todayWib_(now) { return Utilities.formatDate(now || new Date(), 'Asia/Jakarta', 'yyyy-MM-dd'); }
function _addDaysIso_(iso, days) {
  const p = String(iso).split('-');
  const d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) + days));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

/** Murni: nilai ukur → angka 1 desimal, '' kalau kosong; lempar error Indonesia kalau di luar batas. */
function _parseMeasure_(v, min, max, label) {
  if (v === '' || v == null) return '';
  const n = Number(String(v).replace(',', '.'));
  if (typeof v === 'boolean' || !isFinite(n) || n < min || n > max) throw new Error(label + ' harus angka antara ' + min + ' dan ' + max + '.');
  return Math.round(n * 10) / 10;
}

/** Murni: tanggal 'YYYY-MM-DD' valid dan tidak di masa depan; batasan mundur (hari) opsional. */
function _validProgressDate_(iso, today, maxBackDays) {
  const t = String(iso == null || iso === '' ? today : iso).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || _addDaysIso_(t, 0) !== t) throw new Error('Tanggal tidak valid.');
  if (t > today) throw new Error('Tanggal tidak boleh di masa depan.');
  if (maxBackDays != null && t < _addDaysIso_(today, -maxBackDays)) throw new Error('Klien hanya bisa mencatat sampai ' + maxBackDays + ' hari ke belakang.');
  return t;
}

function _readProgress_(memberId) {
  const id = String(memberId).trim();
  const out = [];
  _progressSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    if (String(r[1]).trim() !== id || !r[0]) return;
    out.push({
      id: String(r[0]), tanggal: String(r[2]),
      berat: r[3] === '' ? '' : Number(r[3]), pinggang: r[4] === '' ? '' : Number(r[4]),
      oleh: String(r[5] || 'klien')
    });
  });
  out.sort(function(a, b) { return a.tanggal < b.tanggal ? -1 : (a.tanggal > b.tanggal ? 1 : 0); });
  return out;
}

function _readProgressPhotos_(memberId) {
  const id = String(memberId).trim();
  const out = [];
  _progressPhotosSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    if (String(r[1]).trim() !== id || !r[0]) return;
    out.push({ id: String(r[0]), tanggal: String(r[2]), sisi: String(r[3]), oleh: String(r[5] || 'klien') });
  });
  out.sort(function(a, b) { return a.tanggal < b.tanggal ? 1 : (a.tanggal > b.tanggal ? -1 : 0); });   // terbaru dulu
  return out;
}

/** Murni: perubahan sejak catatan pertama untuk satu ukuran ('berat' | 'pinggang'). null kalau belum ada data. */
function _measureChange_(entries, key) {
  const pts = entries.filter(function(e) { return e[key] !== ''; });
  if (!pts.length) return null;
  const first = pts[0], last = pts[pts.length - 1];
  return { first: { tanggal: first.tanggal, nilai: first[key] }, last: { tanggal: last.tanggal, nilai: last[key] },
           change: Math.round((last[key] - first[key]) * 10) / 10, count: pts.length };
}

function _progressPayload_(memberId) {
  const all = _readProgress_(memberId);
  const info = _streakInfo_(memberId);
  return {
    entries: all.slice(-PROGRESS_LIMITS.entriesShown),
    photos: _readProgressPhotos_(memberId),
    summary: { berat: _measureChange_(all, 'berat'), pinggang: _measureChange_(all, 'pinggang') },
    streak: info.streak, bestStreak: info.bestStreak, completed: info.completed, badges: info.badges
  };
}

/** Simpan/ubah catatan (satu baris per klien per tanggal). Nilai kosong tidak menimpa nilai lama. */
function _saveMeasurement_(memberId, tanggal, berat, pinggang, oleh) {
  if (berat === '' && pinggang === '') throw new Error('Isi berat atau lingkar pinggang.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    const sheet = _progressSheet_();
    const data = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === String(memberId).trim() && String(data[i][2]) === tanggal) {
        if (berat !== '') sheet.getRange(i + 1, 4).setValue(berat);
        if (pinggang !== '') sheet.getRange(i + 1, 5).setValue(pinggang);
        sheet.getRange(i + 1, 6).setValue(oleh);
        sheet.getRange(i + 1, 7).setValue(now);
        return { id: String(data[i][0]), tanggal: tanggal, updated: true };
      }
    }
    const id = 'PRG-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    sheet.appendRow([id, String(memberId).trim(), tanggal, berat, pinggang, oleh, now]);
    return { id: id, tanggal: tanggal, updated: false };
  } finally {
    lock.releaseLock();
  }
}

function _deleteMeasurement_(id, memberIdOrNull) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    const sheet = _progressSheet_();
    const data = sheet.getDataRange().getValues();
    const rid = String(id == null ? '' : id).trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== rid) continue;
      if (memberIdOrNull !== null && String(data[i][1]).trim() !== String(memberIdOrNull).trim()) break;   // bukan milik klien ini
      sheet.deleteRow(i + 1);
      return { status: 'success', id: rid };
    }
    throw new Error('Catatan tidak ditemukan.');
  } finally {
    lock.releaseLock();
  }
}

// ── Streak & badge (D2) ─────────────────────────────────────────────────────
// Streak = minggu berurutan (Senin–Minggu, WIB) dengan minimal 1 sesi selesai. Minggu berjalan tidak
// memutus streak sebelum minggunya berakhir. Badge dihitung, bukan disimpan; badge yang sudah diraih
// tidak pernah hilang karena dihitung dari total sesi dan streak TERBAIK.

const MEMBER_BADGE_SEEN_COL = 17;   // Kolom Q "Badge Terlihat"
const MEMBER_BADGE_SEEN_HEADER = 'Badge Terlihat';
const BADGE_DEFS = [
  { id: 'sesi-10', kind: 'sesi', need: 10, label: '10 sesi' },
  { id: 'sesi-25', kind: 'sesi', need: 25, label: '25 sesi' },
  { id: 'sesi-50', kind: 'sesi', need: 50, label: '50 sesi' },
  { id: 'sesi-100', kind: 'sesi', need: 100, label: '100 sesi' },
  { id: 'streak-4', kind: 'streak', need: 4, label: '4 minggu berturut-turut' },
  { id: 'streak-8', kind: 'streak', need: 8, label: '8 minggu berturut-turut' },
  { id: 'streak-12', kind: 'streak', need: 12, label: '12 minggu berturut-turut' }
];

/** Murni: tanggal 'YYYY-MM-DD' → tanggal Senin di minggu itu. */
function _weekStart_(iso) {
  const p = String(iso).split('-');
  const dow = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))).getUTCDay();   // 0 = Minggu
  return _addDaysIso_(iso, -((dow + 6) % 7));
}

/** Murni: dari jadwal → { weeks: {senin: true}, completed: jumlah sesi selesai } untuk satu klien. */
function _completedWeeks_(schedules, memberId) {
  const id = String(memberId).trim();
  const weeks = {};
  let completed = 0;
  (schedules || []).forEach(function(sc) {
    if (String(sc.memberId).trim() !== id || String(sc.status || '').toLowerCase() !== 'completed') return;
    const d = new Date(sc.start);
    if (isNaN(d.getTime())) return;
    weeks[_weekStart_(Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd'))] = true;
    completed++;
  });
  return { weeks: weeks, completed: completed };
}

/** Murni: streak saat ini (minggu berurutan sampai hari ini). */
function _streak_(weeks, todayIso) {
  const thisWeek = _weekStart_(todayIso);
  let n = 0, w = _addDaysIso_(thisWeek, -7);
  while (weeks[w]) { n++; w = _addDaysIso_(w, -7); }
  if (weeks[thisWeek]) n++;
  return n;
}

/** Murni: streak terpanjang sepanjang riwayat. */
function _bestStreak_(weeks) {
  const keys = Object.keys(weeks).sort();
  let best = 0, run = 0, prev = null;
  keys.forEach(function(k) {
    run = (prev !== null && _addDaysIso_(prev, 7) === k) ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  });
  return best;
}

/** Murni: daftar badge dengan status earned. */
function _badges_(completed, bestStreak) {
  return BADGE_DEFS.map(function(b) {
    const have = b.kind === 'sesi' ? completed : bestStreak;
    return { id: b.id, kind: b.kind, need: b.need, label: b.label, earned: have >= b.need };
  });
}

function _streakInfo_(memberId) {
  const cw = _completedWeeks_(_getSchedulesAll_(), memberId);
  const best = _bestStreak_(cw.weeks);
  return { streak: _streak_(cw.weeks, _todayWib_()), bestStreak: best, completed: cw.completed, badges: _badges_(cw.completed, best) };
}

// ── Klien (token member; ID klien selalu dari token, bukan dari argumen) ────

/** Payload klien + badge yang sudah diraih tapi belum pernah dirayakan (kolom Q). */
function _myPayload_(row) {
  const memberId = String(row[0]).trim();
  const p = _progressPayload_(memberId);
  const seen = _rmdOffFrom_(row[MEMBER_BADGE_SEEN_COL - 1]);
  p.newBadges = p.badges.filter(function(b) { return b.earned && seen.indexOf(b.id) === -1; }).map(function(b) { return b.id; });
  return p;
}

function _myPayloadFor_(memberId) {
  const found = _findMemberRow_(function(r) { return String(r[0]).trim() === String(memberId).trim(); });
  return found ? _myPayload_(found.row) : _progressPayload_(memberId);
}

function getMyProgress(memberToken) {
  return _myPayload_(requireMember_(memberToken).row);
}

/** Tandai badge sudah dirayakan supaya tidak muncul lagi. Hanya badge yang benar-benar sudah diraih. */
function markBadgesSeen(memberToken, ids) {
  const row = requireMember_(memberToken).row;
  const memberId = String(row[0]).trim();
  const earned = _streakInfo_(memberId).badges.filter(function(b) { return b.earned; }).map(function(b) { return b.id; });
  const want = (Array.isArray(ids) ? ids : []).map(function(x) { return String(x).trim(); }).filter(function(x) { return earned.indexOf(x) !== -1; });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    const sheet = _getMemberDataSheet_();
    const head = sheet.getRange(1, MEMBER_BADGE_SEEN_COL);
    if (head.getValue() === '') { head.setValue(MEMBER_BADGE_SEEN_HEADER); head.setFontWeight('bold'); }
    else if (head.getValue() !== MEMBER_BADGE_SEEN_HEADER) throw new Error('Kolom Q di MemberData sudah dipakai untuk hal lain. Kosongkan/ganti dulu.');
    const ids2 = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    for (let i = 1; i < ids2.length; i++) {
      if (String(ids2[i][0]).trim() !== memberId) continue;
      const cell = sheet.getRange(i + 1, MEMBER_BADGE_SEEN_COL);
      const cur = _rmdOffFrom_(cell.getValue());
      want.forEach(function(b) { if (cur.indexOf(b) === -1) cur.push(b); });
      cell.setValue(cur.join(','));
      row[MEMBER_BADGE_SEEN_COL - 1] = cur.join(',');
      break;
    }
  } finally {
    lock.releaseLock();
  }
  return _myPayload_(row);
}

function saveMyMeasurement(memberToken, data) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  data = data || {};
  const today = _todayWib_();
  const tanggal = _validProgressDate_(data.tanggal, today, PROGRESS_LIMITS.backDaysClient);
  const berat = _parseMeasure_(data.berat, PROGRESS_LIMITS.beratMin, PROGRESS_LIMITS.beratMax, 'Berat');
  const pinggang = _parseMeasure_(data.pinggang, PROGRESS_LIMITS.pinggangMin, PROGRESS_LIMITS.pinggangMax, 'Lingkar pinggang');
  _saveMeasurement_(memberId, tanggal, berat, pinggang, 'klien');
  return _myPayloadFor_(memberId);
}

function deleteMyMeasurement(memberToken, id) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  _deleteMeasurement_(id, memberId);
  return _myPayloadFor_(memberId);
}

/** Folder Drive privat untuk foto progres. TIDAK ada setSharing di mana pun untuk folder/berkas ini. */
function _progressFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('PROGRESS_PHOTO_FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (e) { /* folder hilang: buat baru di bawah */ }
  }
  const folder = DriveApp.createFolder('XNK Progress');
  props.setProperty('PROGRESS_PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function uploadMyProgressPhoto(memberToken, base64Data, mimeType, sisi) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  const side = String(sisi == null ? '' : sisi).trim().toLowerCase();
  if (PROGRESS_SIDES.indexOf(side) === -1) throw new Error('Pilih foto depan atau samping.');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(String(mimeType)) === -1) throw new Error('Foto harus berupa JPG, PNG, atau WEBP.');
  if (typeof base64Data !== 'string' || !base64Data || base64Data.length > 7000000) throw new Error('Ukuran foto maksimal 5 MB.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    if (_readProgressPhotos_(memberId).length >= PROGRESS_LIMITS.photosPerMember) {
      throw new Error('Maksimal ' + PROGRESS_LIMITS.photosPerMember + ' foto. Hapus foto lama dulu.');
    }
    const tanggal = _todayWib_();
    const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, 'PRG_' + memberId + '_' + tanggal + '_' + side + '.' + ext);
    const file = _progressFolder_().createFile(blob);     // sengaja tanpa setSharing: berkas tetap privat
    const id = 'PHT-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    _progressPhotosSheet_().appendRow([id, memberId, tanggal, side, file.getId(), 'klien']);
  } finally {
    lock.releaseLock();
  }
  return _myPayloadFor_(memberId);
}

function _photoDataUrl_(fileId) {
  const blob = DriveApp.getFileById(fileId).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function _findPhotoRow_(photoId) {
  const rid = String(photoId == null ? '' : photoId).trim();
  const data = _progressPhotosSheet_().getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === rid) return { rowNum: i + 1, memberId: String(data[i][1]).trim(), fileId: String(data[i][4]) };
  }
  return null;
}

function getMyProgressPhoto(memberToken, photoId) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  const p = _findPhotoRow_(photoId);
  if (!p || p.memberId !== memberId) throw new Error('Foto tidak ditemukan.');
  return { id: String(photoId), dataUrl: _photoDataUrl_(p.fileId) };
}

function deleteMyProgressPhoto(memberToken, photoId) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    const p = _findPhotoRow_(photoId);
    if (!p || p.memberId !== memberId) throw new Error('Foto tidak ditemukan.');
    try { DriveApp.getFileById(p.fileId).setTrashed(true); } catch (e) { Logger.log('Foto progres sudah tidak ada di Drive: ' + e); }
    _progressPhotosSheet_().deleteRow(p.rowNum);
  } finally {
    lock.releaseLock();
  }
  return _myPayloadFor_(memberId);
}

// ── Admin / coach ───────────────────────────────────────────────────────────

function getMemberProgress(token, memberId) {
  requireAdmin_(token);
  return _progressPayload_(memberId);
}

function saveMemberMeasurement(token, memberId, data) {
  requireAdmin_(token);
  data = data || {};
  const id = String(memberId == null ? '' : memberId).trim();
  if (!_findMemberRow_(function(row) { return String(row[0]).trim() === id; })) throw new Error('Klien tidak ditemukan.');
  const tanggal = _validProgressDate_(data.tanggal, _todayWib_(), null);
  const berat = _parseMeasure_(data.berat, PROGRESS_LIMITS.beratMin, PROGRESS_LIMITS.beratMax, 'Berat');
  const pinggang = _parseMeasure_(data.pinggang, PROGRESS_LIMITS.pinggangMin, PROGRESS_LIMITS.pinggangMax, 'Lingkar pinggang');
  _saveMeasurement_(id, tanggal, berat, pinggang, 'coach');
  return _progressPayload_(id);
}

function deleteMemberMeasurement(token, id) {
  requireAdmin_(token);
  const sheetRow = (function() {
    const rid = String(id == null ? '' : id).trim();
    const data = _progressSheet_().getDataRange().getValues();
    for (let i = 1; i < data.length; i++) if (String(data[i][0]) === rid) return String(data[i][1]).trim();
    return null;
  })();
  if (sheetRow === null) throw new Error('Catatan tidak ditemukan.');
  _deleteMeasurement_(id, null);
  return _progressPayload_(sheetRow);
}

function getMemberProgressPhoto(token, photoId) {
  requireAdmin_(token);
  const p = _findPhotoRow_(photoId);
  if (!p) throw new Error('Foto tidak ditemukan.');
  return { id: String(photoId), dataUrl: _photoDataUrl_(p.fileId) };
}


// #############################################################################
// 📁 09_RENEWAL — Permintaan perpanjang paket dari portal klien (Fase D3)
// #############################################################################
// Klien memilih paket di portal → permintaan tercatat (status "menunggu") + notif Telegram + WhatsApp ke
// coach. Setelah pembayaran diterima, admin menyetujui dengan satu ketukan: persis jalur "Perpanjang" di
// form Tambah Klien (kuota di-reset sesuai paket, transaksi dicatat dengan harga saat itu).

const RENEWAL_HEADERS = ["ID", "Member ID", "Paket ID", "Status", "Dibuat Pada", "Diputuskan Pada", "Harga", "Coach ID"];
const RENEWAL_THROTTLE_SECONDS = 20;

function _renewalSheet_() {
  const sheet = getOrCreateSheet_('RenewalRequests', RENEWAL_HEADERS);
  // Kolom "Coach ID" ditambahkan di ujung kanan untuk sheet lama (idempoten).
  if (sheet.getLastColumn() < RENEWAL_HEADERS.length || String(sheet.getRange(1, RENEWAL_HEADERS.length).getValue()).trim() === '') {
    sheet.getRange(1, RENEWAL_HEADERS.length).setValue('Coach ID');
    sheet.getRange(1, RENEWAL_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function _renewalFromRow_(r) {
  return { id: String(r[0]), memberId: String(r[1]).trim(), packageId: String(r[2]), status: String(r[3]), createdAt: String(r[4]), decidedAt: String(r[5] || ''), harga: Number(r[6]) || 0, coachId: String(r[7] || '').trim() };
}

/** Klien: minta perpanjang. Satu permintaan terbuka per klien (yang baru membatalkan yang lama). */
function requestRenewal(memberToken, packageId, coachId) {
  const row = requireMember_(memberToken).row;
  const pickedCoachId = _requireClientCoach_(coachId);   // dua coach aktif atau lebih: wajib pilih coach
  const memberId = String(row[0]).trim();
  const pid = String(packageId == null ? '' : packageId).trim();
  const pkg = getPriceList().find(function(p) { return String(p.id) === pid; });
  if (!pkg) throw new Error('Paket tidak ditemukan atau sudah tidak aktif. Muat ulang halaman lalu pilih lagi.');
  if (!_throttle_('renewal_' + memberId, RENEWAL_THROTTLE_SECONDS)) throw new Error('Permintaan baru saja dikirim. Tunggu sebentar.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  let id;
  try {
    const sheet = _renewalSheet_();
    const data = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === memberId && String(data[i][3]) === 'menunggu') {
        sheet.getRange(i + 1, 4).setValue('dibatalkan');
        sheet.getRange(i + 1, 6).setValue(now);
      }
    }
    id = 'REN-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    sheet.appendRow([id, memberId, pkg.id, 'menunggu', now, '', pkg.harga, pickedCoachId]);
  } finally {
    lock.releaseLock();
  }
  const name = String(row[1] || '').trim();
  try {
    kirimNotifTelegram_('🔁 <b>MINTA PERPANJANG PAKET</b>\n\n👤 <b>Klien:</b> ' + escapeHtmlTelegram(name) + '\n📦 <b>Paket:</b> ' + escapeHtmlTelegram(pkg.namaPaket) +
      ' (' + _formatRupiah_(pkg.harga) + ')\n\nSetelah pembayaran diterima, setujui di panel: Dashboard → Minta perpanjang.');
  } catch (e) { Logger.log('Notif perpanjang gagal: ' + e); }
  return {
    request: { id: id, status: 'menunggu', packageId: pkg.id, packageName: pkg.namaPaket, harga: pkg.harga },
    text: 'Halo Coach, saya ' + name + '. Saya mau perpanjang paket ' + pkg.namaPaket + ' (' + _formatRupiah_(pkg.harga) + ').'
  };
}

/** Klien: permintaan perpanjang terbaru (untuk status di beranda). null kalau belum pernah. */
function getMyRenewal(memberToken) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  let last = null;
  _renewalSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    if (!r[0] || String(r[1]).trim() !== memberId || String(r[3]) === 'dibatalkan') return;
    last = _renewalFromRow_(r);
  });
  if (!last) return null;
  const pkg = getPriceList().find(function(p) { return String(p.id) === last.packageId; });
  last.packageName = pkg ? pkg.namaPaket : '';
  return last;
}

/** Admin: daftar permintaan, yang menunggu dulu. opts: { status, limit (bawaan 50, maks 200) }. */
function getRenewalRequests(token, opts) {
  requireAdmin_(token);
  opts = opts || {};
  const want = opts.status ? String(opts.status) : '';
  let limit = parseInt(opts.limit, 10);
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;
  const members = {};
  _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(r) { if (r[0]) members[String(r[0]).trim()] = { name: String(r[1] || '').trim(), phone: String(r[2] || '').trim() }; });
  const pkgNames = {};
  const ctx = _priceListSheetAndColumns_();
  _readPackages_(ctx.sheet, ctx.idx).forEach(function(p) { pkgNames[p.id] = p.namaPaket; });
  const list = [];
  _renewalSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    if (!r[0]) return;
    const q = _renewalFromRow_(r);
    if (want ? q.status !== want : q.status === 'dibatalkan') return;
    const m = members[q.memberId] || { name: 'Klien dihapus', phone: '' };
    q.name = m.name; q.phone = m.phone; q.packageName = pkgNames[q.packageId] || '(paket dihapus)';
    q._n = list.length;
    list.push(q);
  });
  list.sort(function(a, b) {
    if ((a.status === 'menunggu') !== (b.status === 'menunggu')) return a.status === 'menunggu' ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return b._n - a._n;   // sama persis: baris yang lebih baru dulu
  });
  return list.slice(0, limit).map(function(q) { delete q._n; return q; });
}

/**
 * Admin: setujui atau tolak. Setuju = jalur Perpanjang di form Tambah Klien (kuota di-reset sesuai paket,
 * transaksi + harga dicatat). Hanya bisa diputuskan sekali; kalau perpanjangan gagal, status kembali "menunggu".
 */
function decideRenewal(token, id, approve) {
  requireAdmin_(token);
  const rid = String(id == null ? '' : id).trim();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  let req, rowNum;
  try {
    const sheet = _renewalSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== rid) continue;
      req = _renewalFromRow_(data[i]); rowNum = i + 1;
      break;
    }
    if (!req) throw new Error('Permintaan tidak ditemukan.');
    if (req.status !== 'menunggu') throw new Error('Permintaan ini sudah diputuskan (' + req.status + ').');
    sheet.getRange(rowNum, 4).setValue(approve ? 'disetujui' : 'ditolak');
    sheet.getRange(rowNum, 6).setValue(new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
  if (!approve) return { status: 'ditolak', id: rid };
  // Di luar lock: _addMemberInternal_ memakai lock yang sama.
  try {
    const found = _findMemberRow_(function(r) { return String(r[0]).trim() === req.memberId; });
    if (!found) throw new Error('Klien sudah dihapus.');
    if (!getPriceList().some(function(p) { return String(p.id) === req.packageId; })) {
      throw new Error('Paket sudah tidak aktif. Aktifkan paketnya dulu, atau tolak permintaan ini.');
    }
    const row = found.row;
    const res = _addMemberInternal_({
      name: String(row[1] || ''), phone: String(row[2] || ''), goal: String(row[3] || ''),
      packageId: req.packageId, usedSessions: 0, coachId: req.coachId || String(row[10] || '')
    }, { silent: true });
    return { status: 'disetujui', id: rid, packageName: res.packageName, totalSessions: res.totalSessions };
  } catch (e) {
    const l2 = LockService.getScriptLock();
    if (l2.tryLock(10000)) {
      try {
        const sheet = _renewalSheet_();
        sheet.getRange(rowNum, 4).setValue('menunggu');
        sheet.getRange(rowNum, 6).setValue('');
      } finally { l2.releaseLock(); }
    }
    throw new Error(e.message.replace(/^Gagal menyimpan klien: /, ''));
  }
}

// #############################################################################
// 📁 07B_LANDING_STATS — Statistik & Testimoni Real untuk Landing Page
// #############################################################################
//
// Sumber data: spreadsheet TERPISAH "Evaluasi & Testimoni Sesi Personal Training"
// (Google Form response sheet), BUKAN spreadsheet utama XNK_Personal_Trainer.
// Kolom sheet (header baris 1):
//   A Timestamp | B Email | C Nama Lengkap | D Jumlah Sesi Selesai |
//   E Motivasi(1-5) | F Keselamatan(1-5) | G Kepuasan Program(1-5) |
//   H Komunikasi(1-5) | I Profesionalisme(1-5) | J Intensitas | K Progres |
//   L Hal Disukai | M Kritik & Saran | N Saran Target | O Testimoni (cerita) |
//   P Consent Promosi ("Ya, boleh mencantumkan nama saya" / "Ya, tapi tolong
//     samarkan nama saya (Anonim)" / lainnya = tidak boleh dipakai)

const EVAL_SHEET_ID = '1tyEjraoYNXV8nEMNylT9xSUUpLiLHw7bpcWfiQ3J6Uo';

/**
 * Samarkan nama jadi "Nama Depan + Inisial Belakang" (mis. "Amalia Arumsari" -> "Amalia A."),
 * dipakai untuk testimoni yang consent-nya minta anonim.
 */
function _maskNamaTestimoni_(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Klien XNK';
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
}

/**
 * Baca semua baris response evaluasi, kembalikan raw rows (dipakai bareng oleh
 * getLandingStats() dan getPublicTestimonials() supaya sheet cuma dibaca sekali per call).
 */
function _readEvaluasiRows_() {
  const ss = SpreadsheetApp.openById(EVAL_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  return data.slice(1).filter(function(row) { return row[2]; }); // skip header & baris kosong (tanpa Nama Lengkap)
}

/**
 * Rata-rata 5 kolom rating (Motivasi, Keselamatan, Kepuasan, Komunikasi, Profesionalisme)
 * untuk satu baris response.
 */
function _avgRatingRow_(row) {
  const vals = [row[4], row[5], row[6], row[7], row[8]]
    .map(function(v) { return parseFloat(v); })
    .filter(function(v) { return !isNaN(v); });
  if (vals.length === 0) return null;
  return vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
}

// #############################################################################
// 📁 07_ANALYTICS — Peak Hour Heatmap (Dashboard Admin)
// #############################################################################

/**
 * Hitung distribusi jam booking (semua status, semua waktu) untuk ditampilkan
 * sebagai heatmap 7 hari x jam operasional di Dashboard Admin.
 *
 * Jam operasional:
 *   Senin–Sabtu : 06:00 - 21:00 (kolom jam 6..20, tiap booking dihitung di jam mulainya)
 *   Minggu      : 06:00 - 12:00 (kolom jam 6..11)
 *
 * Booking di luar jam operasional (data lama/anomali) tetap dihitung tapi
 * dikumpulkan di field "outsideHours" per hari, bukan dibuang diam-diam,
 * supaya total count di frontend tetap bisa dicocokkan kalau perlu.
 *
 * @returns {{days: Array, totalBookings: number}}
 *   days[i] = { key, label, hours: [{hour, count}], outsideHours: number }
 */
function getPeakHourData(token) {
  requireAdmin_(token);
  try {
    const DAY_CONFIG = [
      { key: 'mon', label: 'Senin',  jsDay: 1, startHour: 6, endHour: 21 },
      { key: 'tue', label: 'Selasa', jsDay: 2, startHour: 6, endHour: 21 },
      { key: 'wed', label: 'Rabu',   jsDay: 3, startHour: 6, endHour: 21 },
      { key: 'thu', label: 'Kamis',  jsDay: 4, startHour: 6, endHour: 21 },
      { key: 'fri', label: 'Jumat',  jsDay: 5, startHour: 6, endHour: 21 },
      { key: 'sat', label: 'Sabtu',  jsDay: 6, startHour: 6, endHour: 21 },
      { key: 'sun', label: 'Minggu', jsDay: 0, startHour: 6, endHour: 12 }
    ];

    // Inisialisasi struktur kosong dulu (supaya heatmap tetap render walau data 0)
    const dayMap = {}; // jsDay -> { config, counts: {hour: count}, outsideHours: 0 }
    DAY_CONFIG.forEach(function(cfg) {
      dayMap[cfg.jsDay] = { config: cfg, counts: {}, outsideHours: 0 };
      for (let h = cfg.startHour; h < cfg.endHour; h++) {
        dayMap[cfg.jsDay].counts[h] = 0;
      }
    });

    const schedules = _getSchedulesAll_(); // semua status ikut dihitung
    let totalBookings = 0;

    schedules.forEach(function(sch) {
      if (!sch.start) return;
      const d = new Date(sch.start);
      if (isNaN(d.getTime())) return; // skip data corrupt/kosong

      const jsDay = d.getDay(); // 0=Minggu..6=Sabtu
      const hour = d.getHours();
      const bucket = dayMap[jsDay];
      if (!bucket) return;

      totalBookings++;

      if (hour >= bucket.config.startHour && hour < bucket.config.endHour) {
        bucket.counts[hour] = (bucket.counts[hour] || 0) + 1;
      } else {
        bucket.outsideHours++;
      }
    });

    const days = DAY_CONFIG.map(function(cfg) {
      const bucket = dayMap[cfg.jsDay];
      const hours = [];
      for (let h = cfg.startHour; h < cfg.endHour; h++) {
        hours.push({ hour: h, count: bucket.counts[h] || 0 });
      }
      return {
        key: cfg.key,
        label: cfg.label,
        hours: hours,
        outsideHours: bucket.outsideHours
      };
    });

    return { days: days, totalBookings: totalBookings };
  } catch (err) {
    Logger.log('getPeakHourData error: ' + err);
    // Fallback aman: jangan sampai dashboard error, return struktur kosong
    return { days: [], totalBookings: 0 };
  }
}

/**
 * Ringkasan performa tiap coach untuk bulan & tahun tertentu, dipakai di
 * Dashboard Bulanan (Admin): total sesi completed dan jumlah klien unik yang ditangani.
 *
 * Menggunakan kolom "Completed At" (waktu actual sesi ditandai selesai) sebagai acuan
 * bulan, BUKAN "Waktu Mulai" (tanggal booking) — supaya laporan bulan X mencerminkan
 * sesi yang benar-benar terjadi/selesai di bulan itu, bukan sekadar dijadwalkan di bulan itu.
 * Data lama (sebelum kolom ini ada) tidak akan punya Completed At, jadi otomatis
 * tidak ikut terhitung di laporan bulanan manapun — ini disengaja demi akurasi.
 *
 * @param {number} month - 1-12
 * @param {number} year - contoh 2026
 * @returns {Array<{coachId:string, coachName:string, totalSessions:number, uniqueClients:number}>}
 *          diurutkan dari totalSessions terbanyak
 */
function getCoachMonthlyStats(token, month, year) {
  requireAdmin_(token);
  return _coachMonthlyStats_(month, year);
}

function _coachMonthlyStats_(month, year) {
  try {
    const schedules = _getSchedulesAll_(); // sudah termasuk field completedAt

    const statsMap = {}; // coachId -> { coachName, totalSessions, clientSet }

    schedules.forEach(function(sch) {
      if (String(sch.status).toLowerCase() !== 'completed') return;
      if (!sch.completedAt) return; // data lama tanpa timestamp, skip (lihat catatan di atas)

      const d = new Date(sch.completedAt);
      if (isNaN(d.getTime())) return;
      if ((d.getMonth() + 1) !== Number(month) || d.getFullYear() !== Number(year)) return;

      const coachId = sch.coachId || '_unassigned';
      const coachName = sch.coachName || 'Belum Ditugaskan';

      if (!statsMap[coachId]) {
        statsMap[coachId] = { coachId: coachId, coachName: coachName, totalSessions: 0, clientSet: {} };
      }
      statsMap[coachId].totalSessions++;
      if (sch.memberId) statsMap[coachId].clientSet[sch.memberId] = true;
    });

    const results = Object.keys(statsMap).map(function(coachId) {
      const entry = statsMap[coachId];
      return {
        coachId: entry.coachId,
        coachName: entry.coachName,
        totalSessions: entry.totalSessions,
        uniqueClients: Object.keys(entry.clientSet).length
      };
    });

    results.sort(function(a, b) { return b.totalSessions - a.totalSessions; });
    return results;
  } catch (err) {
    Logger.log('getCoachMonthlyStats error: ' + err);
    return [];
  }
}

/**
 * Ringkasan paket PT terlaris untuk bulan & tahun tertentu, dipakai di Dashboard
 * Bulanan (Admin): berapa kali tiap paket "dipilih" dalam transaksi (baik member
 * baru, perpanjangan, maupun ganti paket), diurutkan dari yang paling laku.
 *
 * Sumber data: sheet log transaksi "Members" (bukan MemberData), yang berisi SEMUA
 * riwayat transaksi member (append-only) — bukan cuma paket yang aktif sekarang.
 * Kolom "Tanggal" disimpan sebagai string "d/M/yyyy" (lihat _tulisLogTransaksiMember_),
 * jadi di-parse manual, bukan lewat Date object langsung dari sheet.
 *
 * @param {number} month - 1-12
 * @param {number} year - contoh 2026
 * @returns {Array<{paketId:string, namaPaket:string, count:number, totalSesi:number}>}
 *          diurutkan dari count terbanyak
 */
function getPackageTrendStats(token, month, year) {
  requireAdmin_(token);
  return _packageTrendStats_(month, year);
}

function _packageTrendStats_(month, year) {
  try {
    const sheet = _getMembersLogSheet_();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const statsMap = {}; // paketId -> { namaPaket, count, totalSesi }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const tanggalStr = String(row[2] || '').trim();
      const paketId = String(row[4] || '').trim();
      const namaPaket = String(row[5] || '').trim();
      const jumlahSesi = parseInt(row[6], 10) || 0;

      if (!paketId && !namaPaket) continue; // baris tanpa info paket (jaga-jaga data kotor)

      // Parse "d/M/yyyy" manual (bukan new Date(tanggalStr) supaya tidak salah locale)
      const parts = tanggalStr.split('/');
      if (parts.length !== 3) continue;
      const rowMonth = parseInt(parts[1], 10);
      const rowYear = parseInt(parts[2], 10);
      if (rowMonth !== Number(month) || rowYear !== Number(year)) continue;

      const key = paketId || namaPaket;
      if (!statsMap[key]) {
        statsMap[key] = { paketId: paketId, namaPaket: namaPaket || '(Tanpa Nama)', count: 0, totalSesi: 0 };
      }
      statsMap[key].count++;
      statsMap[key].totalSesi += jumlahSesi;
    }

    const results = Object.values(statsMap);
    results.sort(function(a, b) { return b.count - a.count; });
    return results;
  } catch (err) {
    Logger.log('getPackageTrendStats error: ' + err);
    return [];
  }
}

// Bagian PT dari harga paket: pendapatan = harga Price List × 65%.
const REVENUE_SHARE = 0.65;

/**
 * Estimasi pendapatan paket untuk dashboard admin: 65% (REVENUE_SHARE) dari jumlah
 * harga Price List setiap transaksi paket (klien baru & perpanjangan) di log
 * "Members" pada bulan itu. Harga diambil dari Price List SAAT INI (termasuk paket
 * nonaktif), jadi ini estimasi — harga lama yang sudah diubah tidak tersimpan di log.
 * `grossTotal` = jumlah harga penuh (100%), `total` = bagian 65%.
 * @returns {{total:number, grossTotal:number, share:number, count:number, byPackage:Array<{paketId:string, namaPaket:string, count:number, total:number, grossTotal:number}>}}
 */
function getRevenueSummary(token, month, year) {
  requireAdmin_(token);
  return _revenueSummary_(month, year);
}

function _allPackagePrices_() {
  const prices = { byId: {}, byName: {} };
  const ctx = _priceListSheetAndColumns_();
  _readPackages_(ctx.sheet, ctx.idx).forEach(function(p) {
    if (p.id) prices.byId[p.id] = p.harga;
    const name = String(p.namaPaket || '').trim().toLowerCase();
    if (name) prices.byName[name] = p.harga;
  });
  return prices;
}

function _revenueSummary_(month, year) {
  const result = { total: 0, grossTotal: 0, share: REVENUE_SHARE, count: 0, byPackage: [] };
  const log = _getMembersLogSheet_().getDataRange().getValues();
  if (log.length <= 1) return result;
  const prices = _allPackagePrices_();
  const map = {};
  for (let i = 1; i < log.length; i++) {
    const row = log[i];
    const tgl = row[2];
    let m, y;
    if (tgl instanceof Date) { m = tgl.getMonth() + 1; y = tgl.getFullYear(); }
    else {
      const parts = String(tgl || '').trim().split('/');
      if (parts.length !== 3) continue;
      m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
    }
    if (m !== Number(month) || y !== Number(year)) continue;
    const paketId = String(row[4] || '').trim();
    const namaPaket = String(row[5] || '').trim();
    if (!paketId && !namaPaket) continue;
    const snap = parseFloat(row[MEMBERS_LOG_PRICE_COL - 1]);   // harga saat transaksi; kosong (data lama) = harga sekarang
    const harga = (row[MEMBERS_LOG_PRICE_COL - 1] !== '' && isFinite(snap)) ? snap
      : (prices.byId[paketId] !== undefined ? prices.byId[paketId] : (prices.byName[namaPaket.toLowerCase()] || 0));
    const key = paketId || namaPaket;
    if (!map[key]) map[key] = { paketId: paketId, namaPaket: namaPaket || '(Tanpa Nama)', count: 0, total: 0, grossTotal: 0 };
    map[key].count++;
    map[key].grossTotal += harga;
    result.count++;
    result.grossTotal += harga;
  }
  result.total = Math.round(result.grossTotal * REVENUE_SHARE);
  result.byPackage = Object.keys(map).map(function(k) {
    map[k].total = Math.round(map[k].grossTotal * REVENUE_SHARE);
    return map[k];
  }).sort(function(a, b) { return b.grossTotal - a.grossTotal; });
  return result;
}

/**
 * Statistik untuk Hero Stats di Landing Page: total klien, total sesi selesai,
 * rata-rata kepuasan (dari evaluasi), dan rating (skala 5).
 * Dipanggil dari Landing.txt via google.script.run, mirip pola getPriceList().
 */
function getLandingStats() {
  try {
    const rows = _readEvaluasiRows_();
    let sum = 0, count = 0;
    rows.forEach(function(row) {
      const avg = _avgRatingRow_(row);
      if (avg !== null) { sum += avg; count++; }
    });
    const avgRating = count > 0 ? (sum / count) : 0;

    const memberSheet = _getMemberDataSheet_();
    const totalClients = Math.max(0, memberSheet.getLastRow() - 1);

    let completedSessions = 0;
    const schSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
    if (schSheet) {
      const schData = schSheet.getDataRange().getValues();
      for (let i = 1; i < schData.length; i++) {
        if (String(schData[i][7]).toLowerCase() === 'completed') completedSessions++;
      }
    }

    return {
      totalClients: totalClients,
      completedSessions: completedSessions,
      satisfactionPct: count > 0 ? Math.round((avgRating / 5) * 100) : null,
      avgRating: count > 0 ? Math.round(avgRating * 10) / 10 : null,
      reviewCount: count
    };
  } catch (err) {
    Logger.log('getLandingStats error: ' + err);
    // Fallback aman: jangan sampai landing page error, tampilkan apa adanya (null = disembunyikan di frontend)
    return { totalClients: 0, completedSessions: 0, satisfactionPct: null, avgRating: null, reviewCount: 0 };
  }
}

/**
 * Testimoni untuk section "Hasil Klien Kami" di Landing Page.
 * Hanya mengembalikan response yang consent-nya "Ya" (boleh dipakai promosi).
 * Nama disamarkan otomatis kalau consent-nya minta anonim.
 */
function getPublicTestimonials() {
  try {
    const rows = _readEvaluasiRows_();
    const results = [];

    rows.forEach(function(row) {
      const consent = String(row[15] || '').trim().toLowerCase();
      if (consent.indexOf('ya') !== 0) return; // hanya yang consent-nya diawali "Ya"

      const testimoni = String(row[14] || '').trim();
      if (!testimoni) return; // tanpa cerita testimoni, skip

      const isAnonim = consent.indexOf('anonim') !== -1 || consent.indexOf('samarkan') !== -1;
      const namaAsli = String(row[2] || '').trim();
      const displayName = isAnonim ? _maskNamaTestimoni_(namaAsli) : namaAsli;

      const avg = _avgRatingRow_(row);
      const ratingBulat = avg !== null ? Math.round(avg) : 5;

      results.push({
        name: displayName || 'Klien XNK',
        rating: ratingBulat,
        text: testimoni,
        sessionsCompleted: sanitizeValue(row[3]) || ''
      });
    });

    // Terbaru duluan (baris paling bawah sheet = response terbaru)
    results.reverse();
    return results;
  } catch (err) {
    Logger.log('getPublicTestimonials error: ' + err);
    return [];
  }
}


// #############################################################################
// 📁 08_AVAILABILITY — Public Availability (Jadwal Tersedia untuk Klien)
// #############################################################################

function getPublicAvailability() {
  return _availabilityAdapter_();
}


// #############################################################################
// 📁 09_TASKS — PR (Task) Klien di Luar Gym
// #############################################################################
//
// STRUKTUR DATA: sheet "Tasks", 1 baris per PR (atau per instance PR berulang).
//   Kolom A-M: Task ID, Member ID, Judul, Deskripsi, Kategori, Tenggat, Status,
//              Pengulangan, Dibuat Oleh, Dibuat Pada, Selesai Pada,
//              Catatan Klien, Grup Ulang ID
//   Nilai yang diizinkan:
//     Kategori   : nutrisi | tidur | mobilitas | aktivitas | lain
//     Status     : todo | done | skipped
//     Pengulangan: none | daily | weekly
//   Tenggat disimpan sebagai teks "D/M/YYYY" (Plain Text), sama seperti
//   tanggal di MemberData, supaya Sheets tidak mengubahnya jadi tipe Date.
// Urutan kolom di atas JANGAN digeser: fungsi CRUD Task membaca per indeks.

const TASKS_HEADERS = ["Task ID", "Member ID", "Judul", "Deskripsi", "Kategori", "Tenggat", "Status", "Pengulangan", "Dibuat Oleh", "Dibuat Pada", "Selesai Pada", "Catatan Klien", "Grup Ulang ID"];
const TASK_CATEGORIES = ['nutrisi', 'tidur', 'mobilitas', 'aktivitas', 'lain'];
const TASK_STATUSES = ['todo', 'done', 'skipped'];
const TASK_REPEATS = ['none', 'daily', 'weekly'];

/**
 * Ambil (atau buat) sheet "Tasks". Kolom teks-tanggal dipaksa Plain Text:
 * F (Tenggat, format D/M/YYYY), J (Dibuat Pada) dan K (Selesai Pada), yang
 * ditulis sebagai string ISO. Fungsi internal (akhiran "_"), tidak bisa
 * dipanggil dari browser.
 */
function _tasksSheet_() {
  const sheet = getOrCreateSheet_('Tasks', TASKS_HEADERS);
  sheet.getRange('F:F').setNumberFormat('@');
  sheet.getRange('J:K').setNumberFormat('@');
  return sheet;
}


// ── 📂 CRUD (admin) ──────────────────────────────────────────────────────────

const TASK_TITLE_MAX = 80;
const TASK_DESC_MAX = 500;

/** Teks wajib/opsional dengan batas panjang (dicek di server, bukan hanya di form). */
function _taskText_(value, max, label, required) {
  const text = String(value == null ? '' : value).trim();
  if (required && !text) throw new Error(label + ' wajib diisi.');
  if (text.length > max) throw new Error(label + ' maksimal ' + max + ' karakter.');
  return text;
}

/**
 * Validasi tenggat "D/M/YYYY" (tanggal harus benar-benar ada). Kosong = tanpa tenggat.
 * Kembalikan string "D/M/YYYY" tanpa angka nol di depan (format yang sama dengan
 * tanggal di MemberData). allowPast=false menolak tanggal sebelum hari ini.
 */
function _taskDueDate_(value, allowPast) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!m) throw new Error('Format tenggat harus D/M/YYYY, contoh 5/10/2026.');
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    throw new Error('Tanggal tenggat tidak valid.');
  }
  if (!allowPast) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (date < today) throw new Error('Tenggat tidak boleh di masa lalu.');
  }
  return d + '/' + mo + '/' + y;
}

/** Nilai harus salah satu dari daftar yang diizinkan. */
function _taskEnum_(value, allowed, label) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  if (allowed.indexOf(v) === -1) throw new Error(label + ' tidak valid. Pilihan: ' + allowed.join(', ') + '.');
  return v;
}

/** Jalankan fungsi tulis dengan kunci skrip, supaya baris tidak bergeser oleh penulisan bersamaan. */
function _withTaskLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Cari baris Task (1-based di sheet) berdasarkan ID. null kalau tidak ada. */
function _findTaskRow_(sheet, taskId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(taskId)) return { rowNum: i + 1, row: data[i] };
  }
  return null;
}

/**
 * Admin: tambah PR untuk satu klien.
 * data: { memberId, title, description?, category, dueDate? ("D/M/YYYY"), repeat? }
 * PR berulang (repeat daily/weekly) wajib punya dueDate dan mendapat Grup Ulang ID;
 * instance berikutnya dibuat otomatis, lihat _spawnNextTaskInstance_.
 * @returns {{status:string, id:string}}
 */
function addTask(token, data) {
  requireAdmin_(token);
  data = data || {};
  const memberId = String(data.memberId == null ? '' : data.memberId).trim();
  if (!memberId) throw new Error('Klien wajib dipilih.');
  if (!_findMemberRow_(function(row) { return String(row[0]).trim() === memberId; })) {
    throw new Error('Klien tidak ditemukan.');
  }
  const title = _taskText_(data.title, TASK_TITLE_MAX, 'Judul', true);
  const description = _taskText_(data.description, TASK_DESC_MAX, 'Deskripsi', false);
  const category = _taskEnum_(data.category, TASK_CATEGORIES, 'Kategori');
  const dueDate = _taskDueDate_(data.dueDate, false);
  const repeat = data.repeat == null || data.repeat === '' ? 'none' : _taskEnum_(data.repeat, TASK_REPEATS, 'Pengulangan');
  if (repeat !== 'none' && !dueDate) throw new Error('PR berulang wajib punya tenggat awal.');

  return _withTaskLock_(function() {
    const sheet = _tasksSheet_();
    const id = 'TSK-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    const groupId = repeat === 'none' ? '' : _newTaskGroupId_();
    sheet.appendRow([id, memberId, title, description, category, dueDate, 'todo', repeat, 'coach', new Date().toISOString(), '', '', groupId]);
    return { status: 'success', id: id };
  });
}

/**
 * Admin: ubah PR. Hanya field yang ada di data yang diubah; Member ID tidak bisa dipindah.
 * data: { id, title?, description?, category?, dueDate?, status?, repeat? }
 * dueDate '' menghapus tenggat. status 'done' mengisi Selesai Pada; status lain mengosongkannya.
 * Tenggat lama (sudah lewat) boleh dipertahankan saat mengubah PR.
 */
function updateTask(token, data) {
  requireAdmin_(token);
  data = data || {};
  const has = function(key) { return Object.prototype.hasOwnProperty.call(data, key); };
  const taskId = String(data.id == null ? '' : data.id).trim();
  if (!taskId) throw new Error('ID PR wajib diisi.');

  // Validasi dulu semua input sebelum menyentuh sheet.
  const changes = {};
  if (has('title')) changes.title = _taskText_(data.title, TASK_TITLE_MAX, 'Judul', true);
  if (has('description')) changes.description = _taskText_(data.description, TASK_DESC_MAX, 'Deskripsi', false);
  if (has('category')) changes.category = _taskEnum_(data.category, TASK_CATEGORIES, 'Kategori');
  if (has('dueDate')) changes.dueDate = _taskDueDate_(data.dueDate, true);
  if (has('status')) changes.status = _taskEnum_(data.status, TASK_STATUSES, 'Status');
  if (has('repeat')) changes.repeat = _taskEnum_(data.repeat, TASK_REPEATS, 'Pengulangan');

  return _withTaskLock_(function() {
    const sheet = _tasksSheet_();
    const found = _findTaskRow_(sheet, taskId);
    if (!found) throw new Error('PR tidak ditemukan.');
    const row = found.row.slice(0, TASKS_HEADERS.length);
    while (row.length < TASKS_HEADERS.length) row.push('');

    if (has('title')) row[2] = changes.title;
    if (has('description')) row[3] = changes.description;
    if (has('category')) row[4] = changes.category;
    if (has('dueDate')) row[5] = changes.dueDate;
    if (has('repeat')) row[7] = changes.repeat;
    let statusChanged = false;
    if (has('status') && changes.status !== String(row[6])) {
      row[6] = changes.status;
      row[10] = changes.status === 'done' ? new Date().toISOString() : '';
      statusChanged = true;
    }
    const rowRepeat = String(row[7] || 'none');
    if (rowRepeat !== 'none') {
      if (!String(row[5]).trim()) throw new Error('PR berulang wajib punya tenggat.');
      if (!row[12]) row[12] = _newTaskGroupId_();
    }
    sheet.getRange(found.rowNum, 1, 1, TASKS_HEADERS.length).setValues([row]);
    if (statusChanged && (row[6] === 'done' || row[6] === 'skipped')) _spawnNextTaskInstance_(sheet, row);
    return { status: 'success' };
  });
}

/** Admin: hapus satu PR. Kalau ini instance terbuka dari PR berulang, ulangannya berhenti; hapus seluruh grup lewat deleteTaskGroup. */
function deleteTask(token, taskId) {
  requireAdmin_(token);
  taskId = String(taskId == null ? '' : taskId).trim();
  if (!taskId) throw new Error('ID PR wajib diisi.');
  return _withTaskLock_(function() {
    const sheet = _tasksSheet_();
    const found = _findTaskRow_(sheet, taskId);
    if (!found) throw new Error('PR tidak ditemukan.');
    sheet.deleteRow(found.rowNum);
    return { status: 'success' };
  });
}


// ── 📂 BACA (admin) ──────────────────────────────────────────────────────────

/** Baris sheet Tasks -> objek PR untuk frontend. Tenggat tetap teks "D/M/YYYY". */
function _taskRowToObj_(row) {
  const dueDate = String(row[5] == null ? '' : row[5]).trim();
  const due = _parseTanggalDMY_(dueDate);
  const status = String(row[6] || 'todo');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    id: String(row[0]),
    memberId: String(row[1]),
    title: String(row[2] || ''),
    description: String(row[3] || ''),
    category: String(row[4] || 'lain'),
    dueDate: dueDate,
    status: status,
    repeat: String(row[7] || 'none'),
    createdBy: String(row[8] || ''),
    createdAt: String(row[9] || ''),
    completedAt: String(row[10] || ''),
    clientNote: String(row[11] || ''),
    groupId: String(row[12] || ''),
    overdue: status === 'todo' && !!due && due < today
  };
}

/**
 * Admin: semua PR satu klien (termasuk yang sudah selesai/dilewati).
 * Urutan: todo dulu (tenggat terdekat di atas, tanpa tenggat di bawah), lalu
 * done/skipped dengan yang terbaru selesai di atas.
 * @returns {Array<Object>} lihat _taskRowToObj_
 */
function getTasksForMember(token, memberId) {
  requireAdmin_(token);
  memberId = String(memberId == null ? '' : memberId).trim();
  if (!memberId) throw new Error('Klien wajib dipilih.');

  const data = _tasksSheet_().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && String(data[i][1]).trim() === memberId) list.push(_taskRowToObj_(data[i]));
  }

  const FAR = 8.64e15; // tanpa tenggat -> paling bawah
  list.sort(function(a, b) {
    const aTodo = a.status === 'todo', bTodo = b.status === 'todo';
    if (aTodo !== bTodo) return aTodo ? -1 : 1;
    if (aTodo) {
      const da = _parseTanggalDMY_(a.dueDate), db = _parseTanggalDMY_(b.dueDate);
      return (da ? da.getTime() : FAR) - (db ? db.getTime() : FAR);
    }
    return String(b.completedAt).localeCompare(String(a.completedAt));
  });
  return list;
}

/**
 * Admin: ringkasan PR semua klien dalam SATU panggilan (untuk pill di daftar klien).
 * open = PR berstatus todo; overdue = todo yang tenggatnya sebelum hari ini.
 * Klien tanpa PR terbuka tidak ikut dikembalikan (frontend anggap 0).
 * @returns {Object<string,{open:number, overdue:number}>}
 */
function getTaskSummary(token) {
  requireAdmin_(token);
  const data = _tasksSheet_().getDataRange().getValues();
  const summary = {};
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const t = _taskRowToObj_(data[i]);
    if (t.status !== 'todo' || !t.memberId) continue;
    if (!summary[t.memberId]) summary[t.memberId] = { open: 0, overdue: 0 };
    summary[t.memberId].open++;
    if (t.overdue) summary[t.memberId].overdue++;
  }
  return summary;
}


// ── 📂 PORTAL KLIEN ──────────────────────────────────────────────────────────
// Identitas klien SELALU diambil dari token (requireMember_), bukan dari parameter,
// jadi klien tidak bisa membaca atau menyelesaikan PR klien lain.

const TASK_CLIENT_NOTE_MAX = 300;
const TASK_CLIENT_DONE_LIMIT = 20; // PR selesai/dilewati yang ikut dikirim ke portal

/**
 * Klien: daftar PR milik sendiri. PR todo dulu (tenggat terdekat di atas),
 * lalu maksimal 20 PR selesai/dilewati terbaru. Field khusus admin tidak ikut.
 * @returns {Array<{id,title,description,category,dueDate,status,repeat,completedAt,clientNote,overdue}>}
 */
function getMyTasks(memberToken) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  const data = _tasksSheet_().getDataRange().getValues();
  const todo = [], finished = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0] || String(data[i][1]).trim() !== memberId) continue;
    const t = _taskRowToObj_(data[i]);
    (t.status === 'todo' ? todo : finished).push({
      id: t.id, title: t.title, description: t.description, category: t.category,
      dueDate: t.dueDate, status: t.status, repeat: t.repeat,
      completedAt: t.completedAt, clientNote: t.clientNote, overdue: t.overdue
    });
  }
  const FAR = 8.64e15;
  todo.sort(function(a, b) {
    const da = _parseTanggalDMY_(a.dueDate), db = _parseTanggalDMY_(b.dueDate);
    return (da ? da.getTime() : FAR) - (db ? db.getTime() : FAR);
  });
  finished.sort(function(a, b) { return String(b.completedAt).localeCompare(String(a.completedAt)); });
  return todo.concat(finished.slice(0, TASK_CLIENT_DONE_LIMIT));
}

/**
 * Klien: tandai PR milik sendiri selesai, dengan catatan opsional (maks 300 karakter).
 * PR klien lain dijawab "PR tidak ditemukan." (sama dengan ID yang tidak ada).
 * @returns {{status:string}}
 */
function completeMyTask(memberToken, taskId, note) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  const id = String(taskId == null ? '' : taskId).trim();
  if (!id) throw new Error('ID PR wajib diisi.');
  const clientNote = _taskText_(note, TASK_CLIENT_NOTE_MAX, 'Catatan', false);

  return _withTaskLock_(function() {
    const sheet = _tasksSheet_();
    const found = _findTaskRow_(sheet, id);
    if (!found || String(found.row[1]).trim() !== memberId) throw new Error('PR tidak ditemukan.');
    if (String(found.row[6]) !== 'todo') throw new Error('PR ini sudah selesai atau dilewati.');
    sheet.getRange(found.rowNum, 7).setValue('done');
    sheet.getRange(found.rowNum, 11, 1, 2).setValues([[new Date().toISOString(), clientNote]]);
    _spawnNextTaskInstance_(sheet, found.row);
    return { status: 'success' };
  });
}


// ── 📂 PR BERULANG ───────────────────────────────────────────────────────────
// Satu PR berulang = satu "grup" (kolom M, Grup Ulang ID). Tiap instance adalah
// baris sendiri, jadi riwayat (done/skipped) tetap utuh. Selalu paling banyak
// SATU instance todo per grup. Instance berikutnya dibuat saat:
//   - instance sebelumnya diselesaikan (klien lewat completeMyTask, atau admin
//     lewat updateTask status done/skipped), atau
//   - tenggatnya lewat: _rolloverRecurringTasks_ menandainya 'skipped' lalu
//     membuat instance baru (dipanggil dari trigger harian sendDailyReminderEmail).

function _newTaskGroupId_() {
  return 'GRP-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
}

/**
 * Tenggat instance berikutnya ("D/M/YYYY"): tenggat lama + 1 hari (daily) atau
 * + 7 hari (weekly), dimajukan lagi selama masih sebelum hari ini supaya
 * instance baru tidak langsung telat. Kosong kalau repeat 'none' atau tenggat tidak valid.
 */
function _nextRecurrence_(dueDate, repeat, fromDate) {
  const step = repeat === 'daily' ? 1 : (repeat === 'weekly' ? 7 : 0);
  const base = _parseTanggalDMY_(dueDate);
  if (!step || !base) return '';
  const now = fromDate || new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + step);
  while (next < today) next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + step);
  return next.getDate() + '/' + (next.getMonth() + 1) + '/' + next.getFullYear();
}

/**
 * Buat instance todo berikutnya dari baris PR berulang yang baru selesai/dilewati.
 * Tidak melakukan apa-apa kalau PR tidak berulang/tanpa grup, atau grup itu sudah
 * punya instance todo (aman dipanggil dua kali). Harus dipanggil DI DALAM _withTaskLock_.
 * @returns {string|null} ID instance baru, atau null
 */
function _spawnNextTaskInstance_(sheet, row) {
  const repeat = String(row[7] || 'none');
  const groupId = String(row[12] || '').trim();
  if (repeat === 'none' || !groupId) return null;
  const next = _nextRecurrence_(String(row[5] == null ? '' : row[5]).trim(), repeat);
  if (!next) return null;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][12]).trim() === groupId && String(data[i][6]) === 'todo') return null;
  }
  const id = 'TSK-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
  sheet.appendRow([id, row[1], row[2], row[3], row[4], next, 'todo', repeat, row[8], new Date().toISOString(), '', '', groupId]);
  return id;
}

/**
 * Instance PR berulang yang tenggatnya sudah lewat dan belum dikerjakan ditandai
 * 'skipped', lalu instance berikutnya dibuat. Internal (dipanggil trigger harian).
 * @returns {number} jumlah instance yang digulirkan
 */
function _rolloverRecurringTasks_() {
  return _withTaskLock_(function() {
    const sheet = _tasksSheet_();
    const data = sheet.getDataRange().getValues();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] || String(row[6]) !== 'todo' || String(row[7] || 'none') === 'none' || !String(row[12]).trim()) continue;
      const due = _parseTanggalDMY_(String(row[5] == null ? '' : row[5]).trim());
      if (!due || due >= today) continue;
      sheet.getRange(i + 1, 7).setValue('skipped');
      const skippedRow = row.slice();
      skippedRow[6] = 'skipped';
      _spawnNextTaskInstance_(sheet, skippedRow);
      count++;
    }
    return count;
  });
}

/** Admin: hapus SEMUA instance (riwayat + yang terbuka) dari satu grup PR berulang. */
function deleteTaskGroup(token, groupId) {
  requireAdmin_(token);
  const gid = String(groupId == null ? '' : groupId).trim();
  if (!gid) throw new Error('ID grup PR wajib diisi.');
  return _withTaskLock_(function() {
    const sheet = _tasksSheet_();
    const data = sheet.getDataRange().getValues();
    let deleted = 0;
    for (let i = data.length - 1; i >= 1; i--) { // dari bawah supaya nomor baris tidak bergeser
      if (String(data[i][12]).trim() === gid) { sheet.deleteRow(i + 1); deleted++; }
    }
    if (!deleted) throw new Error('Grup PR tidak ditemukan.');
    return { status: 'success', deleted: deleted };
  });
}

// ── 📂 Template PR (T-76, admin) ─────────────────────────────────────────────
// Sheet "TaskTemplates": A-F = Template ID, Judul, Deskripsi, Kategori,
// Pengulangan, Dibuat Pada. Template TIDAK berisi klien maupun tenggat: dipakai
// dengan mengisi form PR (frontend), lalu disimpan lewat addTask seperti biasa,
// jadi semua validasi addTask tetap berlaku. Semua fungsi khusus admin.

const TASK_TEMPLATES_HEADERS = ["Template ID", "Judul", "Deskripsi", "Kategori", "Pengulangan", "Dibuat Pada"];
const TASK_TEMPLATE_LIMIT = 50;

function _taskTemplatesSheet_() {
  const sheet = getOrCreateSheet_('TaskTemplates', TASK_TEMPLATES_HEADERS);
  sheet.getRange('A:F').setNumberFormat('@');
  return sheet;
}

/** Admin: daftar template PR (terbaru di atas). */
function getTaskTemplates(token) {
  requireAdmin_(token);
  const data = _taskTemplatesSheet_().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!String(r[0]).trim()) continue;
    list.push({
      id: String(r[0]), title: String(r[1]), description: String(r[2] == null ? '' : r[2]),
      category: String(r[3]), repeat: String(r[4] || 'none')
    });
  }
  return list.reverse();
}

/**
 * Admin: simpan template. data: { title, description?, category, repeat? }.
 * Judul yang sama (tanpa membedakan huruf besar/kecil) menimpa template lama,
 * jadi tombol "simpan sebagai template" tidak menumpuk duplikat.
 * @returns {{status:string, id:string, updated:boolean}}
 */
function saveTaskTemplate(token, data) {
  requireAdmin_(token);
  data = data || {};
  const title = _taskText_(data.title, TASK_TITLE_MAX, 'Judul', true);
  const description = _taskText_(data.description, TASK_DESC_MAX, 'Deskripsi', false);
  const category = _taskEnum_(data.category, TASK_CATEGORIES, 'Kategori');
  const repeat = data.repeat == null || data.repeat === '' ? 'none' : _taskEnum_(data.repeat, TASK_REPEATS, 'Pengulangan');

  return _withTaskLock_(function() {
    const sheet = _taskTemplatesSheet_();
    const rows = sheet.getDataRange().getValues();
    const key = title.toLowerCase();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).trim().toLowerCase() === key) {
        sheet.getRange(i + 1, 2, 1, 4).setValues([[title, description, category, repeat]]);
        return { status: 'success', id: String(rows[i][0]), updated: true };
      }
    }
    if (rows.length - 1 >= TASK_TEMPLATE_LIMIT) {
      throw new Error('Template sudah mencapai batas ' + TASK_TEMPLATE_LIMIT + '. Hapus yang tidak terpakai dulu.');
    }
    const id = 'TPL-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    sheet.appendRow([id, title, description, category, repeat, new Date().toISOString()]);
    return { status: 'success', id: id, updated: false };
  });
}

/** Admin: hapus satu template. Tidak memengaruhi PR yang sudah dibuat darinya. */
function deleteTaskTemplate(token, templateId) {
  requireAdmin_(token);
  const tid = String(templateId == null ? '' : templateId).trim();
  if (!tid) throw new Error('ID template wajib diisi.');
  return _withTaskLock_(function() {
    const sheet = _taskTemplatesSheet_();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === tid) { sheet.deleteRow(i + 1); return { status: 'success' }; }
    }
    throw new Error('Template tidak ditemukan.');
  });
}

// #############################################################################
// 📁 10_COACH_HOURS — Jam kerja coach, cuti, dan satu mesin slot (Phase E2)
// #############################################################################
//
// Satu fungsi murni, _freeSlots_, menjawab "jam mana yang masih kosong". Dipakai getOpenSlots
// (Landing & portal), pengingat booking-minggu, dan pengecekan booking di server.
// Tanpa jam kerja & cuti tersimpan, hasilnya sama dengan perilaku lama: jam operasional studio,
// kapasitas = jumlah coach aktif (atau 1 kalau belum ada coach).

const COACH_AVAIL_HEADERS = ["Coach ID", "Hari", "Jam Mulai", "Jam Selesai"];
const COACH_TIMEOFF_HEADERS = ["ID", "Coach ID", "Mulai", "Selesai", "Jam Mulai", "Jam Selesai", "Catatan", "Dibuat Pada"];
const COACH_DAY_NAMES = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

function _hourCell_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? 0 : v.getHours();
  return parseInt(String(v).split(':')[0], 10) || 0;
}

/** Aturan jam kerja dari sheet CoachAvailability (hanya baca; tidak membuat sheet). */
function _coachRules_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CoachAvailability');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const out = [];
  sheet.getDataRange().getValues().slice(1).forEach(function(r) {
    if (String(r[0]).trim() === '') return;
    out.push({ coachId: String(r[0]).trim(), hari: String(r[1]).toLowerCase().trim(), startHour: _hourCell_(r[2]), endHour: _hourCell_(r[3]) });
  });
  return out;
}

/** Sel tanggal cuti sebagai 'YYYY-MM-DD' (WIB), juga kalau Sheets mengubahnya jadi tanggal sungguhan. */
function _isoDateCell_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, REMINDER_TZ, 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim().slice(0, 10);
}

/** Cuti dari sheet CoachTimeOff (hanya baca). adminView=true menyertakan catatan. */
function _coachTimeOff_(adminView) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CoachTimeOff');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const out = [];
  sheet.getDataRange().getValues().slice(1).forEach(function(r) {
    if (String(r[0]).trim() === '') return;
    const row = {
      id: String(r[0]), coachId: String(r[1]).trim(), from: _isoDateCell_(r[2]), to: _isoDateCell_(r[3]),
      hourFrom: String(r[4]) === '' ? null : _hourCell_(r[4]), hourTo: String(r[5]) === '' ? null : _hourCell_(r[5])
    };
    if (adminView) row.note = String(r[6] || '');
    out.push(row);
  });
  return out;
}

/** Murni: apakah coach ini bisa melayani jam itu (jam kerja + cuti)? date 'YYYY-MM-DD' WIB, dow 0=Minggu. */
function _coachAvailableAt_(coachId, rules, timeOff, date, hour, dow) {
  const mine = (rules || []).filter(function(r) { return r.coachId === coachId; });
  if (mine.length) {
    const day = COACH_DAY_NAMES[dow];
    if (!mine.some(function(r) { return r.hari === day && hour >= r.startHour && hour < r.endHour; })) return false;
  }
  return !(timeOff || []).some(function(o) {
    return o.coachId === coachId && o.from <= date && date <= o.to && (o.hourFrom === null || (hour >= o.hourFrom && hour < o.hourTo));
  });
}

/**
 * Murni. in: { businessHours, coaches:[{id}], rules, timeOff, bookings:[{start,end,coachId}], from:'YYYY-MM-DD', days, now:Date }
 * out: [{ date, dow, closed, hours:[{hour, free}] }] — hanya jam di dalam jam operasional studio.
 */
function _freeSlots_(o) {
  let coaches = (o.coaches && o.coaches.length) ? o.coaches : [{ id: '' }];
  // onlyCoach: jam kosong SATU coach (klien memilih coach dulu). Kursinya terpakai oleh booking coach itu; booking
  // yang belum ditugaskan mengambil kursi coach lain yang masih kosong, dan baru menutup jam ini kalau tidak ada lagi.
  const known = {};
  coaches.forEach(function(c) { if (c.id) known[c.id] = true; });
  // Hanya booking yang menyentuh rentang ini (riwayat lama dilewati), jam dibaca sekali per booking.
  // Booking dihitung dari jam penuh awalnya selama durasinya (07.15–08.15 → 07.00–08.00).
  const rangeA = Date.parse(o.from + 'T00:00:00+07:00'), rangeB = rangeA + o.days * 86400000;
  const books = [];
  (o.bookings || []).forEach(function(bk) {
    const s = new Date(bk.start).getTime();
    const bs = Math.floor(s / 3600000) * 3600000;
    const be = bs + (new Date(bk.end || bk.start).getTime() - s);
    if (bs < rangeB && be > rangeA) books.push({ bs: bs, be: be, coachId: bk.coachId, classKey: bk.classKey });
  });
  const out = [];
  for (let i = 0; i < o.days; i++) {
    const date = _addDaysIso_(o.from, i);
    const p = date.split('-');
    const dow = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))).getUTCDay();
    const range = o.businessHours[dow];
    const hours = [];
    if (range) {
      for (let h = range[0]; h < range[1]; h++) {
        const a = Date.parse(date + 'T' + ('0' + h).slice(-2) + ':00:00+07:00'), b = a + 3600000;
        let free = 0, off = false;
        const past = a <= o.now.getTime();
        if (!past) {
          const avail = coaches.filter(function(c) { return !c.id || _coachAvailableAt_(c.id, o.rules, o.timeOff, date, h, dow); });
          const availIds = {};
          avail.forEach(function(c) { availIds[c.id] = true; });
          let used = 0, unassigned = 0;
          const usedBy = {};
          const seenClass = {};
          books.forEach(function(bk) {
            if (!(bk.bs < b && bk.be > a)) return;
            // Sesi kelas yang sama (kelas + jam mulai sama) berbagi SATU kursi coach; peserta dibatasi Kapasitas.
            if (bk.classKey) { if (seenClass[bk.classKey]) return; seenClass[bk.classKey] = true; }
            // Booking milik coach yang sedang tidak tersedia tidak memakai kursi; tanpa coach (atau coach tak dikenal) memakai kursi bersama.
            if (!bk.coachId || !known[bk.coachId]) { used++; unassigned++; }
            else if (availIds[bk.coachId]) { used++; usedBy[bk.coachId] = (usedBy[bk.coachId] || 0) + 1; }
          });
          if (o.onlyCoach) {
            const mineFree = availIds[o.onlyCoach] && !usedBy[o.onlyCoach];
            const othersFree = avail.filter(function(c) { return c.id !== o.onlyCoach && !usedBy[c.id]; }).length;
            free = mineFree && othersFree >= unassigned ? 1 : 0;
            off = !availIds[o.onlyCoach];
          } else {
            free = Math.max(0, avail.length - used);
            off = avail.length === 0;
          }
        }
        const slot = { hour: h, free: free, off: off, past: past };
        // Jam kerja coach yang tertutup cuti: tampil sebagai PENUH (bukan disembunyikan), tidak bisa dipilih.
        if (off && !past && (o.onlyCoach ? coaches.filter(function(c) { return c.id === o.onlyCoach; }) : coaches).some(function(c) { return c.id && _coachAvailableAt_(c.id, o.rules, [], date, h, dow); })) slot.leave = true;
        hours.push(slot);
      }
    }
    out.push({ date: date, dow: dow, closed: hours.length === 0, hours: hours });
  }
  return out;
}

function _slotBookings_(all) {
  return (all || _getSchedulesAll_()).filter(function(s) {
    const st = String(s.status || '').toLowerCase();
    return st !== 'available' && st !== 'cancelled';
  }).map(function(s) { return { start: s.start, end: s.end, coachId: String(s.coachId || ''), classKey: _classKey_(s) }; });
}

/** Kunci satu sesi kelas: kelas/grup + jam mulai. Kosong untuk sesi biasa. */
function _classKey_(s) {
  return s && s.classId ? String(s.classId) + '|' + new Date(s.start).getTime() : '';
}

/**
 * Publik: jam kosong tiap hari (7 hari default, maks 62). Tidak membuka siapa yang booking atau alasan cuti.
 * Dari cache server bersama (SLOTS_CACHE_SECONDS, bawaan 120 detik); opts.fresh diabaikan: pengecekan
 * sungguhan terjadi saat booking, di dalam lock.
 */
function getOpenSlots(opts) {
  return _openSlotsCached_(opts || {}, new Date());
}

const SLOTS_CACHE_SECONDS = 120;   // bawaan; Script Property SLOTS_CACHE_SECONDS menimpanya (10–300)

/**
 * Jam kosong lewat cache server. Kunci = versi + tanggal & jam WIB sekarang + from + days, jadi flag `past`
 * berganti tepat di jam bulat tanpa ada yang membuang cache. from/days dinormalkan dulu (from: hari ini..+62,
 * days: 1..62) supaya kunci tidak bisa dibuat sembarangan.
 * all = isi Schedules yang sudah dibaca pemanggil (tidak dibaca lagi). ver = versi yang dibaca SEBELUM sheet
 * dibaca; tanpa ver, versi dibaca di sini lebih dulu. refresh = hitung ulang lalu simpan (write-through).
 */
function _openSlotsCached_(opts, now, all, refresh, ver) {
  opts = opts || {};
  now = now || new Date();
  ver = ver || _slotsVersion_();
  const today = _wibParts_(now);
  let from = String(opts.from || '');
  if (!_validDate_(from) || from < today.date || from > _addDaysIso_(today.date, 62)) from = today.date;
  const days = Math.max(1, Math.min(62, parseInt(opts.days, 10) || 7));
  // coachId: jam kosong satu coach (dua coach aktif atau lebih). Coach tidak aktif: tidak ada jam.
  const coaches = _activeCoaches_().map(function(c) { return { id: c.id }; });
  const only = String(opts.coachId || '').trim();
  if (only && !coaches.some(function(c) { return c.id === only; })) return [];
  const key = 'openslots:' + ver + ':' + today.date + 'T' + today.hour + ':' + from + ':' + days + ':' + only;
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache && !refresh) {
    try { const hit = cache.get(key); if (hit) return JSON.parse(hit); } catch (e) {}
  }
  const out = _freeSlots_({
    businessHours: _businessHours_(), coaches: coaches, onlyCoach: only,
    rules: _coachRules_(), timeOff: _coachTimeOff_(false), bookings: _slotBookings_(all), from: from, days: days, now: now
  });
  if (cache) {
    const ttl = Math.max(10, Math.min(300, Math.round(_numProp_('SLOTS_CACHE_SECONDS', SLOTS_CACHE_SECONDS))));
    try { cache.put(key, JSON.stringify(out), ttl); } catch (e) {}   // 62 hari ≈ 40 KB, di bawah batas 100 KB
  }
  return out;
}

function _slotsVersion_() {
  try { return CacheService.getScriptCache().get('openslots:ver') || '0'; } catch (e) { return '0'; }
}

/**
 * Setiap perubahan jadwal / jam kerja / coach membuang cache jam kosong dengan menaikkan versinya.
 * Panggil SESUDAH menulis: flush dulu supaya tulisan sudah terbaca, baru versi naik. Pembaca membaca versi
 * sebelum membaca sheet, jadi tidak ada yang bisa menyimpan data lama di bawah versi baru.
 * Mengembalikan versi baru (untuk write-through oleh pemanggil yang sudah memegang datanya).
 */
function _bustSlots_() {
  try { SpreadsheetApp.flush(); } catch (e) {}
  const ver = String(Date.now()) + '.' + Math.floor(Math.random() * 1000000);
  try { CacheService.getScriptCache().put('openslots:ver', ver, 21600); } catch (e) {}
  return ver;
}

/** Publik: status singkat coach "Ini saya": sesi | tersedia (+next) | cuti (+until) | libur | tutup. Tanpa catatan cuti. */
function getCoachStatus(coachId) {
  const self = coachId ? (_activeCoaches_().find(function(c) { return c.id === String(coachId); }) || null) : _selfCoach_();
  if (!self) return { state: 'tutup' };
  const now = new Date();
  const wib = _wibParts_(now);
  const rules = _coachRules_(), timeOff = _coachTimeOff_(false);
  const off = timeOff.find(function(o) { return o.coachId === self.id && o.from <= wib.date && wib.date <= o.to && o.hourFrom === null; });
  if (off) return { state: 'cuti', until: off.to };
  const nowMs = now.getTime();
  const busy = _slotBookings_().some(function(bk) { return bk.coachId === self.id && new Date(bk.start).getTime() <= nowMs && new Date(bk.end || bk.start).getTime() > nowMs; });
  if (busy) return { state: 'sesi' };
  const mine = rules.filter(function(r) { return r.coachId === self.id; });
  if (mine.length && !mine.some(function(r) { return r.hari === COACH_DAY_NAMES[wib.day]; })) return { state: 'libur' };
  const day = _freeSlots_({ businessHours: _businessHours_(), coaches: [{ id: self.id }], rules: rules, timeOff: timeOff, bookings: _slotBookings_(), from: wib.date, days: 1, now: now })[0];
  const next = day.hours.find(function(x) { return x.free > 0; });
  return next ? { state: 'tersedia', next: ('0' + next.hour).slice(-2) + ':00' } : { state: 'tutup' };
}

/** Publik (adapter lama): bentuk keluaran getPublicAvailability dari mesin slot, 14 hari, per coach. */
function _availabilityAdapter_() {
  const now = new Date();
  const coaches = _activeCoaches_();
  const rules = _coachRules_(), timeOff = _coachTimeOff_(false), bookings = _slotBookings_();
  const results = [];
  coaches.forEach(function(c) {
    if (!rules.some(function(r) { return r.coachId === c.id; })) return;   // tanpa aturan: perilaku lama = tidak ada baris
    _freeSlots_({ businessHours: _businessHours_(), coaches: [{ id: c.id }], rules: rules, timeOff: timeOff, bookings: bookings, from: _wibParts_(now).date, days: 14, now: now }).forEach(function(day) {
      const slots = day.hours.filter(function(x) { return x.free > 0; }).map(function(x) { return ('0' + x.hour).slice(-2) + ':00'; });
      if (slots.length) results.push({ coachId: c.id, coachName: c.name, date: day.date, availableSlots: slots });
    });
  });
  return results;
}

/** Murni: ada coach yang tersedia untuk SEMUA jam di [start,end)? Tanpa aturan & cuti selalu true. */
function _anyCoachAvailable_(coaches, rules, timeOff, start, end) {
  if (!(rules || []).length && !(timeOff || []).length) return true;
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return true;
  const list = (coaches && coaches.length) ? coaches : [];
  if (!list.length) return true;
  return list.some(function(c) {
    for (let t = Math.floor(s.getTime() / 3600000) * 3600000; t < e.getTime(); t += 3600000) {
      const w = _wibParts_(new Date(t));
      if (!_coachAvailableAt_(c.id, rules, timeOff, w.date, w.hour, w.day)) return false;
    }
    return true;
  });
}

/**
 * Satu-satunya aturan "boleh dibooking?" untuk SATU jadwal: kembalikan null kalau boleh, atau {code, message}.
 * code: 'past' | 'closed' | 'unavailable' | 'taken'. Memakai mesin slot yang sama dengan Landing & portal.
 * excludeId = jadwal yang sedang dipindah / baru dibuat (tidak dihitung sebagai bentrok).
 * all = isi Schedules yang sudah dibaca pemanggil (opsional; tanpa itu sheet dibaca di sini).
 */
function _slotProblem_(start, end, excludeId, allowPast, joinClassKey, all, coachId) {
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return { code: 'closed', message: 'Waktu jadwal tidak valid.' };
  if (!allowPast && s.getTime() <= Date.now()) return { code: 'past', message: 'Jam ini sudah lewat.' };
  const bh = _businessHours_();
  const coaches = _activeCoaches_().map(function(c) { return { id: c.id }; });
  const rules = _coachRules_(), off = _coachTimeOff_(false);
  const bookings = (all || _getSchedulesAll_()).filter(function(x) {
    const st = String(x.status || '').toLowerCase();
    return st !== 'available' && st !== 'cancelled' && String(x.id) !== String(excludeId || '') && !(joinClassKey && _classKey_(x) === joinClassKey);
  }).map(function(x) { return { start: x.start, end: x.end, coachId: String(x.coachId || ''), classKey: _classKey_(x) }; });
  const cache = {};
  for (let t = Math.floor(s.getTime() / 3600000) * 3600000; t < e.getTime(); t += 3600000) {
    const w = _wibParts_(new Date(t));
    const range = bh[w.day];
    if (!range || w.hour < range[0] || w.hour >= range[1]) return { code: 'closed', message: 'Jam ini di luar jam operasional.' };
    const day = cache[w.date] || (cache[w.date] = _freeSlots_({ businessHours: bh, coaches: coaches, onlyCoach: String(coachId || ''), rules: rules, timeOff: off, bookings: bookings, from: w.date, days: 1, now: new Date(0) })[0]);
    const hr = Array.from(day.hours).find(function(x) { return x.hour === w.hour; });
    if (!hr || hr.off) return { code: 'unavailable', message: 'Jam ini tidak tersedia.' };
    if (hr.free <= 0) return { code: 'taken', message: 'Jam ini sudah dibooking. Pilih jam lain.' };
  }
  return null;
}

/** Peringatan (tidak memblokir) untuk booking buatan pemilik. */
function _slotWarnings_(start, end, excludeId) {
  const p = _slotProblem_(start, end, excludeId, true);
  if (!p) return [];
  if (p.code === 'closed') return ['Di luar jam operasional.'];
  if (p.code === 'taken') return ['Jam ini sudah ada booking.'];
  return [_coachTimeOff_(false).length ? 'Di luar jam kerja atau bertepatan dengan cuti.' : 'Di luar jam kerja.'];
}

/**
 * Murni: jam pengganti untuk booking yang bentrok. Hanya waktu yang keluar (tanpa nama, nomor, ID).
 * days = keluaran _freeSlots_; req = {start, end} (sudah dibulatkan); o = { own:[{start,end}], avoid:[ISO], n:3 }.
 * Jam h cocok kalau jam h .. h+ceil(durasi/60)-1 di hari itu semuanya kosong (free>0, bukan off, bukan past).
 * Urutan: 'day' = hari yang sama, paling dekat ke jam diminta (jam yang lebih siang menang kalau seri), maks 2;
 * 'hour' = jam yang sama 1–7 hari berikutnya; 'near' = sisanya, paling dekat ke waktu diminta. Total maks n.
 * → [{ start, end, date, hour, group }]
 */
function _slotAlternatives_(days, req, o) {
  o = o || {};
  const n = o.n || 3;
  const rs = new Date(req && req.start).getTime(), re = new Date(req && req.end).getTime();
  if (isNaN(rs) || isNaN(re) || re <= rs) return [];
  const dur = re - rs, need = Math.max(1, Math.ceil(dur / 3600000));
  const rw = _wibParts_(new Date(rs));
  const own = [];
  (o.own || []).forEach(function(b) {
    const s = new Date(b.start).getTime(), e = new Date(b.end || b.start).getTime();
    if (isNaN(s) || isNaN(e)) return;
    const bs = Math.floor(s / 3600000) * 3600000;   // sama dengan server: dihitung dari jam bulat
    own.push({ s: bs, e: bs + (e - s) });
  });
  const avoid = {};
  (o.avoid || []).forEach(function(a) { const t = new Date(a).getTime(); if (!isNaN(t)) avoid[t] = true; });
  const pool = [];
  (days || []).forEach(function(d) {
    const byHour = {};
    Array.from(d.hours || []).forEach(function(x) { byHour[x.hour] = x; });
    Array.from(d.hours || []).forEach(function(x) {
      for (let k = 0; k < need; k++) {
        const y = byHour[x.hour + k];
        if (!y || !(y.free > 0) || y.off || y.past) return;
      }
      const s = Date.parse(d.date + 'T' + ('0' + x.hour).slice(-2) + ':00:00+07:00'), e = s + dur;
      if (s === rs || avoid[s]) return;
      if (own.some(function(b) { return b.s < e && b.e > s; })) return;
      pool.push({ s: s, e: e, date: d.date, hour: x.hour });
    });
  });
  const dayGap = function(date) { return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(rw.date + 'T00:00:00Z')) / 86400000); };
  const picked = [], seen = {};
  const take = function(c, group) {
    if (picked.length >= n || seen[c.s]) return;
    seen[c.s] = true;
    picked.push({ start: new Date(c.s).toISOString(), end: new Date(c.e).toISOString(), date: c.date, hour: c.hour, group: group });
  };
  pool.filter(function(c) { return c.date === rw.date; })
    .sort(function(a, b) { return Math.abs(a.hour - rw.hour) - Math.abs(b.hour - rw.hour) || b.hour - a.hour; })
    .slice(0, 2).forEach(function(c) { take(c, 'day'); });
  pool.filter(function(c) { const g = dayGap(c.date); return c.hour === rw.hour && g >= 1 && g <= 7; })
    .sort(function(a, b) { return a.s - b.s; })
    .forEach(function(c) { take(c, 'hour'); });
  pool.slice().sort(function(a, b) { return Math.abs(a.s - rs) - Math.abs(b.s - rs) || b.s - a.s; })
    .forEach(function(c) { take(c, 'near'); });
  return picked;
}

/**
 * Jawaban "bentrok" untuk booking klien dengan opts.soft (tidak ada yang ditulis). all & ver dibaca di dalam lock
 * (ver lebih dulu), jadi openSlots langsung ditulis ulang ke cache. own = jadwal klien itu sendiri ({start,end});
 * excludeId = jadwal yang sedang dipindah (kursinya dianggap kosong untuk jam pengganti); avoid = jam yang tidak
 * boleh ditawarkan (ISO).
 */
function _bookConflict_(code, message, req, all, ver, own, excludeId, avoid, coachId) {
  const now = new Date();
  const horizon = _portalHorizonDays_();
  const payload = _slotsPayload_(all, ver, true);
  coachId = String(coachId || '');
  // Saran jam: dari jam kosong coach yang dipilih (dua coach atau lebih), atau semua coach (solo).
  let days = coachId && payload.openSlotsByCoach && payload.openSlotsByCoach[coachId] ? payload.openSlotsByCoach[coachId] : payload.openSlots;
  if (excludeId) {
    const rest = all.filter(function(x) { return String(x.id) !== String(excludeId); });
    days = _freeSlots_({
      businessHours: _businessHours_(), coaches: _activeCoaches_().map(function(c) { return { id: c.id }; }), onlyCoach: coachId,
      rules: _coachRules_(), timeOff: _coachTimeOff_(false), bookings: _slotBookings_(rest), from: _wibParts_(now).date, days: horizon, now: now
    });
  }
  return Object.assign({
    status: 'conflict', code: code, message: message, coachId: coachId,
    requested: { start: req.start, end: req.end },
    alternatives: _slotAlternatives_(days, req, { own: own || [], avoid: avoid || [], n: 3 })
  }, payload);
}

/** Jadwal milik klien sendiri untuk browser: semua kolom kecuali nomor WA. */
function _ownScheduleOut_(x) {
  const own = Object.assign({}, x);
  delete own.phone;
  return own;
}

/** Jadwal klien sendiri yang masih aktif (bukan batal/available), opsional tanpa satu ID. Bentuk {start,end}. */
function _ownActiveRows_(memberId, all, excludeId) {
  return all.filter(function(x) {
    const st = String(x.status || '').toLowerCase();
    return st !== 'available' && st !== 'cancelled' && String(x.memberId).trim() === String(memberId).trim() &&
      String(x.id) !== String(excludeId || '');
  }).map(function(x) { return { start: x.start, end: x.end }; });
}

// ── 📂 Admin: jam kerja & cuti ──────────────────────────────────────────────

function _validDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const p = String(s).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

/** Jam kerja mingguan + cuti satu coach (default: coach "Ini saya"). Termasuk catatan cuti. */
function getCoachAvailability(token, coachId) {
  requireAdmin_(token);
  const id = String(coachId || (_selfCoach_() || {}).id || '');
  const week = {};
  COACH_DAY_NAMES.forEach(function(d) { week[d] = []; });
  _coachRules_().filter(function(r) { return r.coachId === id; }).forEach(function(r) {
    if (week[r.hari]) week[r.hari].push([r.startHour, r.endHour]);
  });
  const today = _wibParts_(new Date()).date, cutoff = _addDaysIso_(today, -30);
  return {
    coachId: id, week: week, hasRules: _coachRules_().some(function(r) { return r.coachId === id; }),
    timeOff: _coachTimeOff_(true).filter(function(o) { return o.coachId === id && o.to >= cutoff; }),
    businessHours: _businessHours_()
  };
}

/** week = { senin: [[6,10],[16,20]], ... }. Menggantikan semua aturan coach itu. week kosong = ikut jam operasional. */
function saveCoachAvailability(token, coachId, week) {
  requireAdmin_(token);
  coachId = String(coachId || '');
  if (!_activeCoaches_().some(function(c) { return c.id === coachId; })) throw new Error('Pilih coach yang aktif.');
  week = week || {};
  const bh = _businessHours_();
  const rows = [];
  COACH_DAY_NAMES.forEach(function(day, dow) {
    const ranges = (week[day] || []).map(function(r) { return [Number(r[0]), Number(r[1])]; }).sort(function(a, b) { return a[0] - b[0]; });
    if (ranges.length > 3) throw new Error('Maksimal 3 rentang jam per hari.');
    ranges.forEach(function(r, i) {
      if (!Number.isInteger(r[0]) || !Number.isInteger(r[1]) || r[0] >= r[1]) throw new Error('Jam mulai harus lebih kecil dari jam selesai (' + day + ').');
      if (!bh[dow] || r[0] < bh[dow][0] || r[1] > bh[dow][1]) throw new Error('Jam kerja ' + day + ' harus di dalam jam operasional studio.');
      if (i > 0 && r[0] < ranges[i - 1][1]) throw new Error('Rentang jam ' + day + ' tidak boleh saling tumpang tindih.');
      rows.push([coachId, day, ('0' + r[0]).slice(-2) + ':00', ('0' + r[1]).slice(-2) + ':00']);
    });
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('CoachAvailability', COACH_AVAIL_HEADERS);
    sheet.getRange('C:D').setNumberFormat('@');
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) if (String(data[i][0]).trim() === coachId) sheet.deleteRow(i + 1);
    rows.forEach(function(r) { sheet.appendRow(r); });
    _bustSlots_();   // sesudah menulis: buang cache jam kosong
    return { status: 'success', count: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function _timeOffClashes_(coachId, o) {
  const out = [];
  _getSchedulesAll_().forEach(function(s) {
    const st = String(s.status || '').toLowerCase();
    if (st === 'completed' || st === 'cancelled' || st === 'available') return;
    if (s.coachId && s.coachId !== coachId) return;
    const d = new Date(s.start);
    if (isNaN(d.getTime())) return;
    const w = _wibParts_(d);
    if (w.date < o.from || w.date > o.to) return;
    if (o.hourFrom !== null && !(w.hour >= o.hourFrom && w.hour < o.hourTo)) return;
    out.push({ scheduleId: s.id, memberId: s.memberId, memberName: s.title, phone: s.phone, start: s.start, end: s.end });
  });
  return out;
}

/** data = { coachId?, from, to, hourFrom?, hourTo?, note? }. Mengembalikan jadwal yang bentrok; tidak ada yang dibatalkan. */
function addCoachTimeOff(token, data) {
  requireAdmin_(token);
  data = data || {};
  const coachId = String(data.coachId || (_selfCoach_() || {}).id || '');
  if (!_activeCoaches_().some(function(c) { return c.id === coachId; })) throw new Error('Pilih coach yang aktif.');
  const from = String(data.from || ''), to = String(data.to || data.from || '');
  if (!_validDate_(from) || !_validDate_(to)) throw new Error('Tanggal cuti tidak valid.');
  if (to < from) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  const days = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1;
  if (days > 120) throw new Error('Cuti maksimal 120 hari.');
  const hasH = !(data.hourFrom === '' || data.hourFrom == null) || !(data.hourTo === '' || data.hourTo == null);
  let hourFrom = null, hourTo = null;
  if (hasH) {
    hourFrom = Number(data.hourFrom); hourTo = Number(data.hourTo);
    if (!Number.isInteger(hourFrom) || !Number.isInteger(hourTo) || hourFrom < 0 || hourTo > 24 || hourFrom >= hourTo) throw new Error('Jam cuti tidak valid: jam mulai harus lebih kecil dari jam selesai.');
  }
  const note = String(data.note || '').trim();
  if (note.length > 100) throw new Error('Catatan maksimal 100 karakter.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('CoachTimeOff', COACH_TIMEOFF_HEADERS);
    sheet.getRange('C:F').setNumberFormat('@');
    const id = 'OFF-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    sheet.appendRow([id, coachId, from, to, hourFrom === null ? '' : ('0' + hourFrom).slice(-2) + ':00', hourTo === null ? '' : ('0' + hourTo).slice(-2) + ':00', note, new Date().toISOString()]);
    _bustSlots_();   // sesudah menulis: buang cache jam kosong
    return { status: 'success', id: id, clashes: _timeOffClashes_(coachId, { from: from, to: to, hourFrom: hourFrom, hourTo: hourTo }) };
  } finally {
    lock.releaseLock();
  }
}

function deleteCoachTimeOff(token, id) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CoachTimeOff');
    if (!sheet) throw new Error('Cuti tidak ditemukan.');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        _bustSlots_();   // sesudah menulis: buang cache jam kosong
        return { status: 'success' };
      }
    }
    throw new Error('Cuti tidak ditemukan.');
  } finally {
    lock.releaseLock();
  }
}


// #############################################################################
// 📁 11_COACH_HUB — Beranda Coach: hari ini, statistik, target (Phase E3)
// #############################################################################

const COACH_TARGETS = {
  sesi: { key: 'COACH_TARGET_SESI', label: 'Sesi', min: 1, max: 500 },
  klienAktif: { key: 'COACH_TARGET_KLIEN_AKTIF', label: 'Klien aktif', min: 1, max: 200 },
  pendapatan: { key: 'COACH_TARGET_PENDAPATAN', label: 'Pendapatan (estimasi)', min: 0, max: 1000000000 },
  klienBaru: { key: 'COACH_TARGET_KLIEN_BARU', label: 'Klien baru', min: 1, max: 100 }
};

/** Simpan target bulanan. Nilai kosong menghapus target (tidak ditampilkan). */
function saveCoachTargets(token, targets) {
  requireAdmin_(token);
  targets = targets || {};
  const clean = {};
  Object.keys(COACH_TARGETS).forEach(function(k) {
    if (!Object.prototype.hasOwnProperty.call(targets, k)) return;
    const v = targets[k];
    if (v === '' || v == null) { clean[k] = ''; return; }
    const n = Number(v), b = COACH_TARGETS[k];
    if (!Number.isInteger(n) || n < b.min || n > b.max) throw new Error('Target ' + b.label + ' harus bilangan bulat antara ' + b.min + ' dan ' + b.max + '.');
    clean[k] = n;
  });
  const props = PropertiesService.getScriptProperties();
  Object.keys(clean).forEach(function(k) {
    if (clean[k] === '') props.deleteProperty(COACH_TARGETS[k].key); else props.setProperty(COACH_TARGETS[k].key, String(clean[k]));
  });
  return { status: 'success' };
}

/** Murni: pesan "di jalur" untuk target bulanan. */
function _targetPace_(goal, actual, day, daysInMonth) {
  const pace = Math.ceil(goal * day / daysInMonth);
  return { pace: pace, onPace: actual >= pace };
}

/** Murni-ish: ringkasan Beranda Coach untuk tanggal `now`. */
function _coachHub_(now) {
  const self = _selfCoach_();
  const wib = _wibParts_(now);
  const mine = function(s) { return !s.coachId || (self && s.coachId === self.id); };
  const all = _getSchedulesAll_().filter(mine);
  const done = all.filter(function(s) { return String(s.status || '').toLowerCase() === 'completed'; });
  const dateOf = function(s) {
    const d = new Date(s.completedAt || s.start);
    return isNaN(d.getTime()) ? null : Utilities.formatDate(d, REMINDER_TZ, 'yyyy-MM-dd');
  };
  const hoursOf = function(s) {
    const a = new Date(s.start), b = new Date(s.end || s.start);
    return isNaN(a.getTime()) || isNaN(b.getTime()) ? 0 : Math.max(0, (b - a) / 3600000);
  };
  const monthKey = wib.date.slice(0, 7), weekStart = _weekStart_(wib.date), weekEnd = _addDaysIso_(weekStart, 6);
  const stats = { weekSessions: 0, weekHours: 0, monthSessions: 0, monthHours: 0, activeClients: 0, streak: 0 };
  const weeks = {};
  done.forEach(function(s) {
    const d = dateOf(s);
    if (!d) return;
    weeks[_weekStart_(d)] = true;
    if (d >= weekStart && d <= weekEnd) { stats.weekSessions++; stats.weekHours += hoursOf(s); }
    if (d.slice(0, 7) === monthKey) { stats.monthSessions++; stats.monthHours += hoursOf(s); }
  });
  stats.weekHours = Math.round(stats.weekHours * 10) / 10;
  stats.monthHours = Math.round(stats.monthHours * 10) / 10;
  stats.streak = _streak_(weeks, wib.date);
  const members = _getMembersAll_();
  stats.activeClients = members.filter(function(m) { return Number(m.totalSessions) > Number(m.usedSessions); }).length;

  const today = all.filter(function(s) {
    const st = String(s.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'available') return false;
    const d = new Date(s.start);
    return !isNaN(d.getTime()) && Utilities.formatDate(d, REMINDER_TZ, 'yyyy-MM-dd') === wib.date;
  }).sort(function(a, b) { return new Date(a.start) - new Date(b.start); }).map(function(s) {
    return { id: s.id, memberId: s.memberId, memberName: s.title, start: s.start, end: s.end, status: String(s.status || '').toLowerCase() };
  });

  const props = PropertiesService.getScriptProperties();
  const p = wib.date.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  const targets = [];
  Object.keys(COACH_TARGETS).forEach(function(k) {
    const goal = _numProp_(COACH_TARGETS[k].key, NaN);
    if (isNaN(goal) || goal <= 0) return;
    let actual = 0;
    if (k === 'sesi') actual = stats.monthSessions;
    else if (k === 'klienAktif') actual = stats.activeClients;
    else if (k === 'pendapatan') actual = _revenueSummary_(p[1], p[0]).total;
    else if (k === 'klienBaru') {
      _getMembersLogSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
        if (String(r[3]) !== 'Baru') return;
        const t = r[2] instanceof Date ? [0, r[2].getMonth() + 1, r[2].getFullYear()] : String(r[2] || '').trim().split('/');
        if (t.length === 3 && parseInt(t[1], 10) === p[1] && parseInt(t[2], 10) === p[0]) actual++;
      });
    }
    const pace = k === 'klienAktif' ? { pace: goal, onPace: actual >= goal } : _targetPace_(goal, actual, p[2], daysInMonth);
    targets.push({ key: k, label: COACH_TARGETS[k].label, goal: goal, actual: actual, pace: pace.pace, onPace: pace.onPace });
  });
  return {
    selfName: self ? self.name : '', solo: _activeCoaches_().length === 1, date: wib.date,
    today: today, stats: stats, targets: targets, care: _careList_(now),
    rawTargets: Object.keys(COACH_TARGETS).reduce(function(o, k) { const n = _numProp_(COACH_TARGETS[k].key, NaN); o[k] = isNaN(n) ? '' : n; return o; }, {})
  };
}

/** Ringkasan satu bulan (y, m=1-12): sesi & jam selesai, klien baru, pendapatan, dan hasil tiap target. */
function _monthSummary_(y, m) {
  const self = _selfCoach_();
  const key = y + '-' + ('0' + m).slice(-2);
  let sessions = 0, hours = 0, newClients = 0;
  _getSchedulesAll_().forEach(function(s) {
    if (String(s.status || '').toLowerCase() !== 'completed') return;
    if (s.coachId && self && s.coachId !== self.id) return;
    const d = new Date(s.completedAt || s.start);
    if (isNaN(d.getTime()) || Utilities.formatDate(d, REMINDER_TZ, 'yyyy-MM') !== key) return;
    sessions++;
    const a = new Date(s.start), b = new Date(s.end || s.start);
    if (!isNaN(a.getTime()) && !isNaN(b.getTime())) hours += Math.max(0, (b - a) / 3600000);
  });
  _getMembersLogSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    if (String(r[3]) !== 'Baru') return;
    const t = r[2] instanceof Date ? [0, r[2].getMonth() + 1, r[2].getFullYear()] : String(r[2] || '').trim().split('/');
    if (t.length === 3 && parseInt(t[1], 10) === m && parseInt(t[2], 10) === y) newClients++;
  });
  const revenue = _revenueSummary_(m, y).total;
  hours = Math.round(hours * 10) / 10;
  const actual = { sesi: sessions, pendapatan: revenue, klienBaru: newClients };
  const targets = [];
  ['sesi', 'pendapatan', 'klienBaru'].forEach(function(k) {
    const goal = _numProp_(COACH_TARGETS[k].key, NaN);
    if (!isNaN(goal) && goal > 0) targets.push({ key: k, label: COACH_TARGETS[k].label, goal: goal, actual: actual[k] });
  });
  return { sessions: sessions, hours: hours, newClients: newClients, revenue: revenue, targets: targets };
}

function getCoachHub(token) {
  requireAdmin_(token);
  return _coachHub_(new Date());
}


// #############################################################################
// 📁 12_CLIENT_CARE — Catatan privat, form kesehatan, assessment, tes kebugaran (Phase E4)
// #############################################################################
//
// DATA SENSITIF. Hanya admin (atau klien itu sendiri untuk bagiannya) yang boleh membacanya.
// Tidak boleh masuk: _memberPublicProfile_, getMembers, getPublicSchedules, getMyProgress,
// cache panel, Telegram, email, atau log (lihat docs/coach/Agent.md aturan 5 dan 6).

const MEMBER_FLAG_COL = 19, MEMBER_NOTES_COL = 20, MEMBER_BIRTH_COL = 21, MEMBER_SNOOZE_COL = 22;   // S, T, U, V
const MEMBER_CARE_HEADERS = { 19: 'Perhatian', 20: 'Catatan Privat', 21: 'Tanggal Lahir', 22: 'Perhatian Ditunda' };
const ASSESSMENT_HEADERS = ["ID", "Member ID", "Tanggal", "Tujuan Utama", "Riwayat Latihan", "Preferensi Jadwal", "Motivasi", "Catatan Coach", "Diubah Pada", "Lemak Tubuh (%)", "Dada (cm)", "Lengan (cm)", "Pinggul (cm)"];
const FITNESS_HEADERS = ["ID", "Member ID", "Tanggal", "Tes", "Nilai", "Dicatat Oleh", "Diubah Pada"];
const HEALTH_HEADERS = ["ID", "Member ID", "Tanggal", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Cedera/Operasi", "Obat Rutin", "Kondisi Lain", "Persetujuan", "Ditinjau Pada", "Catatan Coach", "Dibuat Pada"];
const FITNESS_TESTS = [
  { id: 'pushup', label: 'Push-up', unit: 'kali / 1 menit', better: 'higher', min: 0, max: 300 },
  { id: 'plank', label: 'Plank', unit: 'detik', better: 'higher', min: 0, max: 3600 },
  { id: 'squat', label: 'Squat', unit: 'kali / 1 menit', better: 'higher', min: 0, max: 300 },
  { id: 'sit-reach', label: 'Sit and reach', unit: 'cm', better: 'higher', min: -40, max: 80 },
  { id: 'nadi-istirahat', label: 'Detak jantung istirahat', unit: 'bpm', better: 'lower', min: 30, max: 220 }
];
const HEALTH_QUESTIONS = [
  'Pernah dikatakan dokter bahwa jantungmu bermasalah, dan sebaiknya berolahraga hanya dengan pengawasan?',
  'Apakah dadamu terasa sakit saat berolahraga atau beraktivitas?',
  'Dalam sebulan terakhir, apakah kamu pernah nyeri dada saat tidak sedang berolahraga?',
  'Apakah kamu pernah hilang keseimbangan karena pusing, atau pernah pingsan?',
  'Apakah ada masalah tulang atau sendi yang bisa memburuk karena olahraga?',
  'Apakah kamu sedang minum obat untuk tekanan darah atau masalah jantung?',
  'Apakah ada alasan lain kamu sebaiknya tidak berolahraga berat (hamil, baru operasi, dll)?'
];

function _careStr_(v, max, label) {
  const t = String(v == null ? '' : v).trim();
  if (t.length > max) throw new Error(label + ' maksimal ' + max + ' karakter.');
  return t;
}

function _memberRowOrThrow_(memberId) {
  const id = String(memberId == null ? '' : memberId).trim();
  const found = _findMemberRow_(function(row) { return String(row[0]).trim() === id; });
  if (!found) throw new Error('Klien tidak ditemukan.');
  return found;
}

function _ensureCareColumns_(sheet) {
  Object.keys(MEMBER_CARE_HEADERS).forEach(function(col) {
    const cell = sheet.getRange(1, Number(col));
    if (cell.getValue() === '') { cell.setValue(MEMBER_CARE_HEADERS[col]); cell.setFontWeight('bold'); }
  });
}

function _careSheet_(name, headers) { return getOrCreateSheet_(name, headers); }

/** Baris terbaru (terakhir ditulis) milik klien dari sheet; null kalau belum ada. */
function _latestRowFor_(sheetName, memberId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (String(rows[i][1]).trim() === memberId) return { row: rows[i], rowNum: i + 1, sheet: sheet };
  return null;
}

function _fitnessByMember_(memberId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FitnessTests');
  const out = {};
  FITNESS_TESTS.forEach(function(t) { out[t.id] = []; });
  if (!sheet) return out;
  sheet.getDataRange().getValues().slice(1).forEach(function(r) {
    if (String(r[1]).trim() !== memberId || !out[String(r[3])]) return;
    out[String(r[3])].push({ id: String(r[0]), tanggal: String(r[2]), nilai: Number(r[4]) });
  });
  Object.keys(out).forEach(function(k) { out[k].sort(function(a, b) { return a.tanggal < b.tanggal ? -1 : (a.tanggal > b.tanggal ? 1 : 0); }); });
  return out;
}

function _fitnessSummary_(byTest) {
  return FITNESS_TESTS.map(function(t) {
    const list = byTest[t.id] || [];
    const first = list.length ? list[0] : null, latest = list.length ? list[list.length - 1] : null;
    const change = (first && latest && list.length > 1) ? Math.round((latest.nilai - first.nilai) * 10) / 10 : null;
    const improved = change === null ? null : (t.better === 'lower' ? change < 0 : change > 0);
    return { id: t.id, label: t.label, unit: t.unit, better: t.better, first: first, latest: latest, change: change, improved: improved, count: list.length };
  }).filter(function(x) { return x.count > 0; });
}

/** Admin: semua data perawatan satu klien (catatan privat, kesehatan, assessment, tes). */
function getClientCare(token, memberId) {
  requireAdmin_(token);
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  const asm = _latestRowFor_('Assessments', id), hs = _latestRowFor_('HealthScreening', id);
  const byTest = _fitnessByMember_(id);
  const a = asm ? asm.row : null, hr = hs ? hs.row : null;
  return {
    flag: String(m.row[MEMBER_FLAG_COL - 1] || ''), notes: String(m.row[MEMBER_NOTES_COL - 1] || ''),
    birthDate: String(m.row[MEMBER_BIRTH_COL - 1] || ''), snoozedUntil: String(m.row[MEMBER_SNOOZE_COL - 1] || ''),
    assessment: a ? { tanggal: String(a[2]), goal: a[3], history: a[4], schedulePref: a[5], motivation: a[6], coachNotes: a[7], bodyFat: a[9], chest: a[10], arm: a[11], hip: a[12] } : null,
    health: hr ? {
      tanggal: String(hr[2]), answers: [3, 4, 5, 6, 7, 8, 9].map(function(i) { return String(hr[i]); }),
      injuries: hr[10], medication: hr[11], other: hr[12], reviewedAt: String(hr[14] || ''), reviewNote: String(hr[15] || '')
    } : null,
    tests: _fitnessSummary_(byTest), testHistory: byTest, testList: FITNESS_TESTS, questions: HEALTH_QUESTIONS
  };
}

/** Admin: flag singkat + catatan privat + tanggal lahir. */
function saveClientNotes(token, memberId, data) {
  requireAdmin_(token);
  data = data || {};
  const flag = _careStr_(data.flag, 80, 'Perhatian'), notes = _careStr_(data.notes, 2000, 'Catatan');
  let birth = String(data.birthDate == null ? '' : data.birthDate).trim();
  if (birth && (!_validDate_(birth) || birth > _todayWib_())) throw new Error('Tanggal lahir tidak valid.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const m = _memberRowOrThrow_(memberId);
    _ensureCareColumns_(m.sheet);
    m.sheet.getRange(m.rowNum, MEMBER_FLAG_COL).setValue(flag);
    m.sheet.getRange(m.rowNum, MEMBER_NOTES_COL).setValue(notes);
    m.sheet.getRange(m.rowNum, MEMBER_BIRTH_COL).setNumberFormat('@').setValue(birth);
    return { status: 'success' };
  } finally {
    lock.releaseLock();
  }
}

/** Admin: sembunyikan klien dari daftar "Perlu perhatian" selama `days` hari (1-30). */
function snoozeCare(token, memberId, days) {
  requireAdmin_(token);
  const n = Math.max(1, Math.min(30, parseInt(days, 10) || 7));
  const m = _memberRowOrThrow_(memberId);
  _ensureCareColumns_(m.sheet);
  m.sheet.getRange(m.rowNum, MEMBER_SNOOZE_COL).setNumberFormat('@').setValue(_addDaysIso_(_todayWib_(), n));
  return { status: 'success' };
}

/** Admin: assessment pertama / perubahan. Berat & pinggang (opsional) masuk ke Progres sebagai catatan coach. */
function saveAssessment(token, memberId, data) {
  requireAdmin_(token);
  data = data || {};
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  const row = [
    'ASM-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000), id, _todayWib_(),
    _careStr_(data.goal, 200, 'Tujuan utama'), _careStr_(data.history, 500, 'Riwayat latihan'), _careStr_(data.schedulePref, 200, 'Preferensi jadwal'),
    _careStr_(data.motivation, 300, 'Motivasi'), _careStr_(data.coachNotes, 1000, 'Catatan coach'), new Date().toISOString()
  ];
  [['bodyFat', 'Lemak tubuh', 3, 60], ['chest', 'Lingkar dada', 40, 200], ['arm', 'Lingkar lengan', 15, 80], ['hip', 'Lingkar pinggul', 40, 200]].forEach(function(f) {
    row.push(_parseMeasure_(data[f[0]], f[2], f[3], f[1]));
  });
  const berat = _parseMeasure_(data.weight, PROGRESS_LIMITS.beratMin, PROGRESS_LIMITS.beratMax, 'Berat');
  const pinggang = _parseMeasure_(data.waist, PROGRESS_LIMITS.pinggangMin, PROGRESS_LIMITS.pinggangMax, 'Lingkar pinggang');
  if (!row[3] && !row[4] && !row[5] && !row[6] && !row[7] && berat === '' && pinggang === '' && !row.slice(9).some(function(v) { return v !== ''; })) throw new Error('Isi minimal satu bagian assessment.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _careSheet_('Assessments', ASSESSMENT_HEADERS);
    sheet.getRange('C:C').setNumberFormat('@');
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  if (berat !== '' || pinggang !== '') _saveMeasurement_(id, _todayWib_(), berat, pinggang, 'coach');
  return { status: 'success' };
}

/** Admin: nilai tes kebugaran. values = { pushup: 24, plank: 60 }; kosong diabaikan. Upsert per klien, tanggal, dan tes. */
function saveFitnessTests(token, memberId, data) {
  requireAdmin_(token);
  data = data || {};
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  const tanggal = _validProgressDate_(data.tanggal, _todayWib_(), null);
  const values = {};
  FITNESS_TESTS.forEach(function(t) {
    const raw = data.values ? data.values[t.id] : '';
    if (raw === '' || raw == null) return;
    values[t.id] = _parseMeasure_(String(raw).replace(',', '.'), t.min, t.max, t.label);
  });
  if (!Object.keys(values).length) throw new Error('Isi minimal satu hasil tes.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _careSheet_('FitnessTests', FITNESS_HEADERS);
    sheet.getRange('C:C').setNumberFormat('@');
    const rows = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    Object.keys(values).forEach(function(tid) {
      let found = 0;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][1]).trim() === id && String(rows[i][2]) === tanggal && String(rows[i][3]) === tid) { found = i + 1; break; }
      }
      if (found) { sheet.getRange(found, 5).setValue(values[tid]); sheet.getRange(found, 7).setValue(now); }
      else sheet.appendRow(['FIT-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000), id, tanggal, tid, values[tid], 'coach', now]);
    });
  } finally {
    lock.releaseLock();
  }
  return { status: 'success', tests: _fitnessSummary_(_fitnessByMember_(id)) };
}

function deleteFitnessTest(token, testId) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FitnessTests');
    if (!sheet) throw new Error('Hasil tes tidak ditemukan.');
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === String(testId)) { sheet.deleteRow(i + 1); return { status: 'success' }; }
    throw new Error('Hasil tes tidak ditemukan.');
  } finally {
    lock.releaseLock();
  }
}

/** Admin: tandai form kesehatan terbaru sudah dibaca. */
function markHealthReviewed(token, memberId, note) {
  requireAdmin_(token);
  const id = String(_memberRowOrThrow_(memberId).row[0]).trim();
  const hs = _latestRowFor_('HealthScreening', id);
  if (!hs) throw new Error('Klien ini belum mengisi form kesehatan.');
  hs.sheet.getRange(hs.rowNum, 15).setValue(new Date().toISOString());
  hs.sheet.getRange(hs.rowNum, 16).setValue(_careStr_(note, 300, 'Catatan'));
  return { status: 'success' };
}

/** Admin: ringkasan untuk kartu "Briefing" di atas detail sesi. Tidak pernah di-cache di browser. */
function getSessionBriefing(token, scheduleId) {
  requireAdmin_(token);
  const s = _getSchedulesAll_().find(function(x) { return String(x.id) === String(scheduleId); });
  if (!s || !s.memberId) return { flag: '', notes: '', goal: '', lastTest: null, healthPending: false };
  const m = _findMemberRow_(function(row) { return String(row[0]).trim() === String(s.memberId).trim(); });
  if (!m) return { flag: '', notes: '', goal: '', lastTest: null, healthPending: false };
  const id = String(m.row[0]).trim();
  const asm = _latestRowFor_('Assessments', id), hs = _latestRowFor_('HealthScreening', id);
  const tests = _fitnessSummary_(_fitnessByMember_(id));
  let last = null;
  tests.forEach(function(t) { if (!last || t.latest.tanggal > last.tanggal) last = { label: t.label, unit: t.unit, nilai: t.latest.nilai, tanggal: t.latest.tanggal }; });
  return {
    flag: String(m.row[MEMBER_FLAG_COL - 1] || ''), notes: String(m.row[MEMBER_NOTES_COL - 1] || ''),
    goal: asm ? String(asm.row[3] || '') : '', lastTest: last, healthPending: !!hs && !hs.row[14]
  };
}

// ── Klien (portal) ──────────────────────────────────────────────────────────

/** Klien: pertanyaan form kesehatan dan apakah sudah diisi. TIDAK mengembalikan jawaban. */
function getMyHealthForm(memberToken) {
  const id = String(requireMember_(memberToken).row[0]).trim();
  const hs = _latestRowFor_('HealthScreening', id);
  return { questions: HEALTH_QUESTIONS, done: !!hs, date: hs ? String(hs.row[2]) : '' };
}

/** Klien: kirim form kesehatan. answers = { q: ['ya'|'tidak' x7], injuries, medication, other, consent }. */
function submitMyHealthForm(memberToken, answers) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim();
  answers = answers || {};
  const q = Array.isArray(answers.q) ? answers.q.map(function(v) { return String(v).toLowerCase(); }) : [];
  if (q.length !== HEALTH_QUESTIONS.length || q.some(function(v) { return v !== 'ya' && v !== 'tidak'; })) throw new Error('Jawab semua pertanyaan dengan Ya atau Tidak.');
  if (String(answers.consent) !== 'ya') throw new Error('Centang persetujuan sebelum mengirim.');
  const inj = _careStr_(answers.injuries, 300, 'Cedera/operasi'), med = _careStr_(answers.medication, 300, 'Obat rutin'), oth = _careStr_(answers.other, 300, 'Kondisi lain');
  if (!_throttle_('health_' + id, 60)) throw new Error('Form baru saja dikirim. Tunggu sebentar.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    const sheet = _careSheet_('HealthScreening', HEALTH_HEADERS);
    sheet.getRange('C:C').setNumberFormat('@');
    const now = new Date().toISOString();
    sheet.appendRow(['KES-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000), id, _todayWib_()].concat(q, [inj, med, oth, 'ya', '', '', now]));
  } finally {
    lock.releaseLock();
  }
  // Hanya nama klien; jawaban tidak pernah dikirim ke Telegram.
  try { kirimNotifTelegram_('🩺 <b>' + _escHtml_(String(row[1] || '').trim()) + '</b> mengisi form kesehatan. Perlu ditinjau di panel.'); } catch (e) { Logger.log('Notif Telegram gagal: ' + e); }
  return { status: 'success' };
}

/** Klien: tujuan & preferensi dari assessment, dan hasil tes (pertama → terbaru). Tanpa catatan coach. */
function getMyAssessment(memberToken) {
  const id = String(requireMember_(memberToken).row[0]).trim();
  const asm = _latestRowFor_('Assessments', id);
  return {
    goal: asm ? String(asm.row[3] || '') : '', schedulePref: asm ? String(asm.row[5] || '') : '',
    tests: _fitnessSummary_(_fitnessByMember_(id)).map(function(t) {
      return { id: t.id, label: t.label, unit: t.unit, better: t.better, first: t.first, latest: t.latest, change: t.change, improved: t.improved };
    })
  };
}

// ── Daftar "Perlu perhatian" (dipakai Beranda Coach) ─────────────────────────

/** Murni-ish: alasan yang perlu diperhatikan per klien aktif. */
function _careList_(now) {
  const today = _wibParts_(now).date;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const md = ss.getSheetByName('MemberData');
  if (!md) return [];
  const asmIds = {}, healthRows = {}, lastTest = {};
  const asm = ss.getSheetByName('Assessments');
  if (asm) asm.getDataRange().getValues().slice(1).forEach(function(r) { asmIds[String(r[1]).trim()] = true; });
  const hs = ss.getSheetByName('HealthScreening');
  if (hs) hs.getDataRange().getValues().slice(1).forEach(function(r) { healthRows[String(r[1]).trim()] = r; });
  const ft = ss.getSheetByName('FitnessTests');
  if (ft) ft.getDataRange().getValues().slice(1).forEach(function(r) { const k = String(r[1]).trim(); if (!lastTest[k] || String(r[2]) > lastTest[k]) lastTest[k] = String(r[2]); });
  const lastSession = {}, todaySession = {};
  _getSchedulesAll_().forEach(function(s) {
    const st = String(s.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'available') return;
    const d = new Date(s.start);
    if (isNaN(d.getTime())) return;
    const day = Utilities.formatDate(d, REMINDER_TZ, 'yyyy-MM-dd'), k = String(s.memberId).trim();
    if (day === today) todaySession[k] = true;
    if (st === 'completed' && (!lastSession[k] || day > lastSession[k])) lastSession[k] = day;
  });
  const out = [];
  md.getDataRange().getValues().slice(1).forEach(function(r) {
    const id = String(r[0] || '').trim();
    if (!id) return;
    const rem = (parseInt(r[8], 10) || 0) - (parseInt(r[9], 10) || 0);
    if (rem <= 0) return;   // hanya klien yang masih punya sisa sesi
    if (String(r[MEMBER_SNOOZE_COL - 1] || '') >= today) return;
    const reasons = [];
    const joined = _parseTanggalDMY_(r[4]);
    const joinedDays = joined ? Math.floor((now.getTime() - joined.getTime()) / 86400000) : 999;
    if (r[MEMBER_FLAG_COL - 1] && todaySession[id]) reasons.push('flag-today');
    if (healthRows[id] && !healthRows[id][14]) reasons.push('health-review');
    if (lastTest[id] && _daysBetween_(lastTest[id], today) >= 28) reasons.push('retest');
    if (!asmIds[id] && joinedDays >= 3) reasons.push('no-assessment');
    if (!healthRows[id] && joinedDays >= 3) reasons.push('no-health');
    if (lastSession[id] ? _daysBetween_(lastSession[id], today) >= 14 : joinedDays >= 14) reasons.push('gap');
    if (reasons.length) out.push({ memberId: id, name: String(r[1] || '').trim(), reasons: reasons, flag: String(r[MEMBER_FLAG_COL - 1] || '') });
  });
  const order = ['flag-today', 'health-review', 'retest', 'no-assessment', 'no-health', 'gap'];
  out.sort(function(a, b) { return order.indexOf(a.reasons[0]) - order.indexOf(b.reasons[0]); });
  return out;
}


// #############################################################################
// 📁 13_COACH_PROFILE_PAGE — Halaman profil coach untuk portal & pratinjau panel (Phase E5)
// #############################################################################

/** Murni-ish: isi halaman profil coach "Ini saya" (hanya field publik + status + 3 testimoni + batas reschedule). */
function _coachProfilePage_(coachId) {
  const picked = coachId ? _activeCoaches_().find(function(c) { return c.id === String(coachId); }) : null;
  const self = picked || _selfCoach_();
  return {
    coach: self ? _publicCoach_(self) : null,
    solo: _activeCoaches_().length === 1,
    status: getCoachStatus(self ? self.id : ''),
    testimonials: getPublicTestimonials().slice(0, 3),
    stats: (function() { const st = getLandingStats(); return { clients: st.totalClients || 0, sessions: st.completedSessions || 0, rating: st.avgRating }; })(),
    rescheduleCutoffHours: _rescheduleCutoff_()
  };
}

/** Klien: halaman profil coach. */
function getMyCoach(memberToken, coachId) {
  requireMember_(memberToken);
  return _coachProfilePage_(coachId);
}

/** Admin: persis isi yang dilihat klien ("Lihat seperti klien"). */
function previewCoachProfile(token) {
  requireAdmin_(token);
  return _coachProfilePage_();
}


// #############################################################################
// 📁 13_CLASSES — Kelas (paket bertipe "kelas") dan grup privat
// #############################################################################
//
// Kelas = baris PriceList dengan Tipe "kelas" (Kapasitas, Jadwal Kelas, Kelas Privat). Klien ikut kelas lewat alur paket biasa.
// Grup privat: klien membuat grup dari paket kelas "privat", membagikan kode, teman yang sudah memegang paket yang sama bergabung.
// Sesi satu kelas/grup pada jam yang sama berbagi satu kursi coach (Schedules kolom M "Kelas ID").

const CLASS_GROUP_HEADERS = ["ID", "Kode", "Paket ID", "Pembuat Member ID", "Status", "Dibuat Pada", "Anggota"];
const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function _classGroupSheet_() { return getOrCreateSheet_('ClassGroups', CLASS_GROUP_HEADERS); }

function _classGroupFromRow_(r) {
  return {
    id: String(r[0]), code: String(r[1]), packageId: String(r[2]), creatorId: String(r[3]).trim(), status: String(r[4]),
    createdAt: String(r[5]), members: String(r[6] || '').split(',').map(function(x) { return x.trim(); }).filter(String)
  };
}

function _newClassCode_(taken) {
  for (let n = 0; n < 50; n++) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CLASS_CODE_CHARS.charAt(Math.floor(Math.random() * CLASS_CODE_CHARS.length));
    if (!taken[c]) return c;
  }
  throw new Error('Gagal membuat kode grup. Coba lagi.');
}

/** Paket kelas (aktif) dari PriceList menurut ID; null kalau bukan kelas. */
function _classPackage_(packageId) {
  const pid = String(packageId == null ? '' : packageId).trim();
  const pkg = getPriceList().find(function(p) { return String(p.id) === pid; });
  return pkg && pkg.tipe === 'kelas' ? pkg : null;
}

/** Grup terbuka milik / berisi klien ini ({sheetRow, ...group}) atau null. */
function _openGroupOf_(memberId) {
  const data = _classGroupSheet_().getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const g = _classGroupFromRow_(data[i]);
    if (g.status === 'buka' && g.members.indexOf(String(memberId).trim()) !== -1) { g._row = i + 1; return g; }
  }
  return null;
}

/**
 * Konteks kelas klien: null kalau paketnya bukan kelas. Kalau klien ada di grup privat untuk paket yang sama,
 * Kelas ID = ID grup (sesinya tidak bercampur dengan kelas umum); selain itu Kelas ID = ID paket.
 */
function _memberClassContext_(row) {
  const pkg = _classPackage_(row[6]);
  if (!pkg) return null;
  const g = _openGroupOf_(row[0]);
  const group = g && g.packageId === pkg.id ? g : null;
  return { classId: group ? group.id : pkg.id, kapasitas: pkg.kapasitas || 1, package: pkg, group: group };
}

function _publicGroup_(g, memberId) {
  const names = {};
  _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(r) { names[String(r[0]).trim()] = String(r[1] || '').trim().split(/\s+/)[0]; });
  const pkg = _classPackage_(g.packageId);
  return {
    id: g.id, code: g.code, packageId: g.packageId, packageName: pkg ? pkg.namaPaket : '', capacity: pkg ? pkg.kapasitas : '',
    isOwner: g.creatorId === String(memberId).trim(),
    members: g.members.map(function(m) { return names[m] || 'Anggota'; })   // nama depan saja, tanpa nomor WA
  };
}

/** Klien: buat grup privat dari paket kelas yang sedang dipegang. Mengembalikan kode untuk dibagikan. */
function createClassGroup(memberToken) {
  const row = requireMember_(memberToken).row;
  const memberId = String(row[0]).trim();
  const pkg = _classPackage_(row[6]);
  if (!pkg) throw new Error('Pilih paket kelas dulu sebelum membuat grup.');
  if (!pkg.privat) throw new Error('Kelas ini tidak menyediakan grup privat.');
  if ((parseInt(row[9], 10) || 0) >= (parseInt(row[8], 10) || 0)) throw new Error('Sesi kelasmu sudah habis. Perpanjang dulu.');
  if (!_throttle_('classgroup_' + memberId, 10)) throw new Error('Permintaan baru saja dikirim. Tunggu sebentar.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  let g;
  try {
    if (_openGroupOf_(memberId)) throw new Error('Kamu sudah punya grup. Keluar dari grup itu dulu.');
    const sheet = _classGroupSheet_();
    const data = sheet.getDataRange().getValues();
    const taken = {};
    data.slice(1).forEach(function(r) { taken[String(r[1])] = true; });
    g = { id: 'GRP-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000), code: _newClassCode_(taken), packageId: pkg.id, creatorId: memberId, status: 'buka', createdAt: new Date().toISOString(), members: [memberId] };
    sheet.appendRow([g.id, g.code, g.packageId, g.creatorId, g.status, g.createdAt, g.members.join(',')]);
  } finally {
    lock.releaseLock();
  }
  return _publicGroup_(g, memberId);
}

/** Klien: gabung grup pakai kode. Wajib sudah memegang paket kelas yang sama (sisa sesi) dan grup belum penuh. */
function joinClassGroup(memberToken, code) {
  const row = requireMember_(memberToken).row;
  const memberId = String(row[0]).trim();
  const kode = String(code == null ? '' : code).trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(kode)) throw new Error('Kode grup tidak valid.');
  if (!_throttle_('classjoin_' + memberId, 3)) throw new Error('Terlalu cepat. Tunggu sebentar.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  let g;
  try {
    const sheet = _classGroupSheet_();
    const data = sheet.getDataRange().getValues();
    let rowNum = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === kode && String(data[i][4]) === 'buka') { g = _classGroupFromRow_(data[i]); rowNum = i + 1; break; }
    }
    if (!g) throw new Error('Kode grup tidak ditemukan.');
    if (g.members.indexOf(memberId) !== -1) return _publicGroup_(g, memberId);
    if (_openGroupOf_(memberId)) throw new Error('Kamu sudah ada di grup lain. Keluar dulu.');
    const pkg = _classPackage_(g.packageId);
    if (!pkg || !pkg.privat) throw new Error('Grup ini sudah tidak tersedia.');
    if (String(row[6]).trim() !== pkg.id || (parseInt(row[9], 10) || 0) >= (parseInt(row[8], 10) || 0)) {
      throw new Error('Ambil paket "' + pkg.namaPaket + '" dulu (Beli / Perpanjang), lalu masukkan kode lagi.');
    }
    if (g.members.length >= (pkg.kapasitas || 1)) throw new Error('Grup sudah penuh.');
    g.members.push(memberId);
    sheet.getRange(rowNum, 7).setValue(g.members.join(','));
  } finally {
    lock.releaseLock();
  }
  return _publicGroup_(g, memberId);
}

/** Klien: keluar dari grup. Pembuat yang keluar menutup grup; sesi yang sudah dibooking tetap berlaku. */
function leaveClassGroup(memberToken) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    const g = _openGroupOf_(memberId);
    if (!g) return { status: 'success' };
    const sheet = _classGroupSheet_();
    if (g.creatorId === memberId) {
      sheet.getRange(g._row, 5).setValue('tutup');
    } else {
      sheet.getRange(g._row, 7).setValue(g.members.filter(function(m) { return m !== memberId; }).join(','));
    }
  } finally {
    lock.releaseLock();
  }
  return { status: 'success' };
}

/** Klien: grup saya (atau null). Hanya nama depan anggota. */
function getMyClassGroup(memberToken) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  const g = _openGroupOf_(memberId);
  return g ? _publicGroup_(g, memberId) : null;
}

/** Admin: semua grup privat terbuka beserta anggotanya. */
function getClassGroups(token) {
  requireAdmin_(token);
  const names = {};
  _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(r) { names[String(r[0]).trim()] = String(r[1] || '').trim(); });
  return _classGroupSheet_().getDataRange().getValues().slice(1).filter(function(r) { return r[0] && String(r[4]) === 'buka'; }).map(function(r) {
    const g = _classGroupFromRow_(r);
    const pkg = _classPackage_(g.packageId);
    return { id: g.id, code: g.code, packageId: g.packageId, packageName: pkg ? pkg.namaPaket : '', capacity: pkg ? pkg.kapasitas : '', createdAt: g.createdAt, members: g.members.map(function(m) { return { id: m, name: names[m] || '' }; }) };
  });
}
