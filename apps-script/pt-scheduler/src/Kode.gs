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
  var page = e && e.parameter && e.parameter.view ? e.parameter.view : 'Index';
  // Hanya file HTML yang benar-benar ada. Nilai lain (termasuk ?view=public untuk
  // portal klien) jatuh ke Index, yang membaca parameter view sendiri di browser.
  var validPages = ['Index', 'Landing'];
  if (validPages.indexOf(page) === -1) page = 'Index';

  try { _applyPendingConfig_(false); } catch (err) { Logger.log('Pengaturan dari Drive gagal: ' + err); }

  return HtmlService.createTemplateFromFile(page).evaluate()
    .setTitle('XNK Personal Training')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include helper untuk modular HTML components.
 * Memungkinkan file GAS HTML dipisah menjadi partials.
 * Digunakan dalam template: <?!= include('Styles.html') ?>
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
  const fails = parseInt(cache.get('admin_login_fails') || '0', 10);
  if (fails >= LOGIN_MAX_FAILS) {
    throw new Error('Terlalu banyak percobaan PIN salah. Coba lagi dalam 10 menit.');
  }
  if (!_safeEqual_(String(pin == null ? '' : pin).trim(), stored)) {
    cache.put('admin_login_fails', String(fails + 1), LOGIN_LOCK_SECONDS);
    if (fails + 1 === LOGIN_MAX_FAILS) {
      try {
        kirimNotifTelegram_('⚠️ <b>LOGIN ADMIN DIKUNCI</b>\n\n' + LOGIN_MAX_FAILS +
          ' kali PIN salah dalam 10 menit. Login panel PT dikunci 10 menit.');
      } catch (e) { Logger.log('Notif Telegram gagal: ' + e); }
    }
    Utilities.sleep(700);
    throw new Error('PIN salah.');
  }
  cache.remove('admin_login_fails');
  return {
    token: _issueToken_({ r: 'admin', v: _adminPinVersion_(), exp: Date.now() + ADMIN_SESSION_DAYS * 86400000 })
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
    token: _issueToken_({ r: 'admin', v: _adminPinVersion_(), exp: Date.now() + ADMIN_SESSION_DAYS * 86400000 })
  };
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
    preferredCoachName: sanitizeValue(row[11]) || ''
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
  const fails = parseInt(cache.get('member_login_fails') || '0', 10);
  if (fails >= MEMBER_LOGIN_MAX_FAILS) {
    throw new Error('Terlalu banyak percobaan. Coba lagi dalam 10 menit.');
  }
  const found = _findMemberRow_(function(row) { return _normalizePhone_(row[2]) === target; });
  if (!found) {
    cache.put('member_login_fails', String(fails + 1), LOGIN_LOCK_SECONDS);
    if (fails + 1 === MEMBER_LOGIN_MAX_FAILS) {
      try {
        kirimNotifTelegram_('⚠️ <b>LOGIN KLIEN DIKUNCI</b>\n\n' + MEMBER_LOGIN_MAX_FAILS +
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

// Batasi fungsi yang tidak butuh login tapi mahal/berisiko di-spam
// (mis. trigger email): maksimal 1x per `seconds` detik.
function _throttle_(name, seconds) {
  const cache = CacheService.getScriptCache();
  const key = 'throttle_' + name;
  if (cache.get(key)) return false;
  cache.put(key, '1', seconds);
  return true;
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

function getCoaches() {
  const headers = ["ID", "Nama Coach", "No WA", "Spesialisasi", "Foto URL", "Bio", "Pengalaman"];
  const sheet = getOrCreateSheet_('Coaches', headers);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(function(row) {
    return {
      id: sanitizeValue(row[0]),
      name: sanitizeValue(row[1]),
      phone: sanitizeValue(row[2]),
      specialty: sanitizeValue(row[3]),
      photo: sanitizeValue(row[4]),
      bio: sanitizeValue(row[5]),
      experience: sanitizeValue(row[6])
    };
  });
}

function addCoach(token, coachData) {
  requireAdmin_(token);
  const headers = ["ID", "Nama Coach", "No WA", "Spesialisasi", "Foto URL", "Bio", "Pengalaman"];
  const sheet = getOrCreateSheet_('Coaches', headers);
  const id = 'COACH-' + new Date().getTime();
  sheet.appendRow([
    id, coachData.name, coachData.phone.toString(), coachData.specialty,
    coachData.photo || '', coachData.bio || '', coachData.experience || ''
  ]);
  return { status: 'success', id: id };
}

/**
 * Update data profil coach (termasuk foto, bio, pengalaman).
 */
function updateCoach(token, coachData) {
  requireAdmin_(token);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Coaches');
  if (!sheet) throw new Error('Sheet Coaches tidak ditemukan');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === coachData.id) {
      sheet.getRange(i + 1, 2).setValue(coachData.name);
      sheet.getRange(i + 1, 3).setValue(coachData.phone.toString());
      sheet.getRange(i + 1, 4).setValue(coachData.specialty);
      sheet.getRange(i + 1, 5).setValue(coachData.photo || '');
      sheet.getRange(i + 1, 6).setValue(coachData.bio || '');
      sheet.getRange(i + 1, 7).setValue(coachData.experience || '');
      return { status: 'success' };
    }
  }
  throw new Error('Coach tidak ditemukan');
}

/**
 * Hapus data coach. Jadwal (Schedules) yang sudah pernah pakai coach ini
 * dibiarkan (histori tetap ada), hanya penugasan baru yang tidak bisa pilih
 * coach ini lagi.
 */
function deleteCoach(token, coachId) {
  requireAdmin_(token);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Coaches');
  if (!sheet) throw new Error('Sheet Coaches tidak ditemukan');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === coachId) {
      sheet.deleteRow(i + 1);
      return { status: 'success' };
    }
  }
  throw new Error('Coach tidak ditemukan');
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
function _getMembersLogSheet_() {
  const sheet = getOrCreateSheet_('Members', MEMBERS_LOG_HEADERS);
  sheet.getRange('C:C').setNumberFormat('@');
  return sheet;
}

/**
 * Tambah 1 baris log transaksi ke sheet "Members" (append-only, tidak pernah overwrite).
 * jenis: "Baru" | "Perpanjang" | "Ganti Paket"
 */
function _tulisLogTransaksiMember_(memberId, jenis, paketId, namaPaket, jumlahSesi, coachId, namaCoach, catatan) {
  const sheet = _getMembersLogSheet_();
  const trxId = 'TRX-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
  const now = new Date();
  const dateStr = now.getDate() + '/' + (now.getMonth() + 1) + '/' + now.getFullYear();
  sheet.appendRow([trxId, memberId, dateStr, jenis, paketId || '', namaPaket || '', jumlahSesi || 0, coachId || '', namaCoach || '', catatan || '']);
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
    let paketId = '', paketNama = '';
    let totalSessions = memberData.totalSessions || 10;
    if (memberData.packageId) {
      const allPackages = getPriceList();
      const selectedPkg = allPackages.find(function(p) { return String(p.id) === String(memberData.packageId); });
      if (selectedPkg) {
        paketId = selectedPkg.id;
        paketNama = selectedPkg.namaPaket;
        // Kalau admin tidak override Total Sesi secara manual, pakai jumlah sesi dari paket
        if (!memberData.totalSessions && selectedPkg.jumlahSesi) {
          totalSessions = selectedPkg.jumlahSesi;
        }
      }
    }

    // 2. Cari data coach yang dipilih admin sebagai coach default klien ini (jika ada)
    let coachId = '', coachNama = '';
    if (memberData.coachId) {
      const allCoaches = getCoaches();
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

      _tulisLogTransaksiMember_(id, 'Perpanjang', paketId, paketNama, totalSessions, coachId, coachNama, 'Perpanjang via form Tambah Klien');
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

      _tulisLogTransaksiMember_(id, 'Baru', paketId, paketNama, totalSessions, coachId, coachNama, 'Klien baru');
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
          const allCoaches = getCoaches();
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
  const sessions = parseInt(pkg.jumlahSesi, 10) || 1;
  const priceStr = _formatRupiah_(pkg.harga);

  const result = _addMemberInternal_({
    name: name,
    phone: phone,
    goal: goal + ' | [' + pkg.namaPaket + ' - ' + sessions + ' Sesi]',
    packageId: pkg.id,
    totalSessions: sessions,
    usedSessions: 0
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
    MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: (isExisting ? '🔁 Permintaan Perpanjang: ' : '💰 Pendaftaran PT Baru: ') + name, htmlBody: body });
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

function _getSchedulesAll_() {
  const headers = ["ID", "Member ID", "Nama Member", "No WA", "Waktu Mulai", "Waktu Selesai", "Catatan", "Status", "Coach ID", "Nama Coach", "Completed At", "Recurring Group ID"];
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
      coachName: sanitizeValue(row[9]),
      completedAt: sanitizeValue(row[10]) || '',
      recurringGroupId: sanitizeValue(row[11]) || ''
    };
  });
}

/**
 * @param {Object} scheduleData
 * @param {string} [statusParam] - 'unread' untuk booking mandiri klien, default 'read'
 * @param {boolean} [silentNotif] - true untuk skip notif Telegram individual (dipakai saat
 *        dipanggil berkali-kali dari addRecurringSchedule, supaya tidak spam 1 notif per sesi;
 *        addRecurringSchedule mengirim 1 notif ringkasan sendiri setelah semua sesi dibuat)
 */
function addSchedule(token, scheduleData) {
  requireAdmin_(token);
  return _addScheduleInternal_(scheduleData, 'read', false);
}

function _addScheduleInternal_(scheduleData, statusParam, silentNotif) {
  try {
    const headers = ["ID", "Member ID", "Nama Member", "No WA", "Waktu Mulai", "Waktu Selesai", "Catatan", "Status", "Coach ID", "Nama Coach", "Completed At", "Recurring Group ID"];
    const sheet = getOrCreateSheet_('Schedules', headers);
    const id = 'SCH-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    const status = statusParam || 'read';

    // Auto-assign Coach: kalau jadwal ini belum ditentukan coach-nya secara eksplisit,
    // pakai Coach favorit yang sudah dipilih admin saat klien ini didaftarkan/diedit.
    // Fitur assign coach manual (updateScheduleCoach, dsb) tetap berjalan seperti biasa
    // dan selalu bisa menimpa coach hasil auto-assign ini kapan saja.
    let coachId = scheduleData.coachId || "";
    let coachName = scheduleData.coachName || "";
    if (!coachId && scheduleData.memberId) {
      try {
        const member = _getMembersAll_().find(function(m) { return String(m.id) === String(scheduleData.memberId); });
        if (member && member.preferredCoachId) {
          coachId = member.preferredCoachId;
          coachName = member.preferredCoachName || coachName;
        }
      } catch (e) {
        Logger.log("Gagal auto-assign coach dari preferensi klien: " + e);
      }
    }

    sheet.appendRow([
      id, scheduleData.memberId, scheduleData.memberName, scheduleData.phone.toString(),
      scheduleData.start, scheduleData.end, scheduleData.notes, status,
      coachId, coachName || "Belum Ditugaskan", "", scheduleData.recurringGroupId || ""
    ]);

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

    return { status: 'success', id: id, coachId: coachId, coachName: coachName };
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
 */
function clientBookRecurring(memberToken, baseScheduleData, recurrenceRule) {
  const member = requireMember_(memberToken);
  const base = baseScheduleData || {};
  return _addRecurringInternal_({
    memberId: String(member.row[0]).trim(),
    memberName: member.row[1],
    phone: String(member.row[2]),
    notes: String(base.notes || '').slice(0, 500),
    startDate: String(base.startDate || ''),
    time: String(base.time || ''),
    duration: base.duration
  }, recurrenceRule, 'unread');
}

function _addRecurringInternal_(baseScheduleData, recurrenceRule, status) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(baseScheduleData.startDate)) || !/^\d{2}:\d{2}$/.test(String(baseScheduleData.time))) {
      throw new Error('Tanggal atau jam tidak valid.');
    }
    const weekdays = (recurrenceRule && recurrenceRule.weekdays) || [];
    const occurrences = (recurrenceRule && recurrenceRule.occurrences) || 0;

    if (!weekdays.length) throw new Error('Pilih minimal 1 hari untuk pola berulang.');
    if (!occurrences || occurrences < 1) throw new Error('Jumlah pengulangan tidak valid.');
    if (occurrences > 52) throw new Error('Maksimal 52 sesi sekali buat (biar tidak kebablasan).');

    const groupId = 'RGRP-' + new Date().getTime();
    const [startY, startM, startD] = baseScheduleData.startDate.split('-').map(Number);
    const [hh, mm] = baseScheduleData.time.split(':').map(Number);
    const durationMin = parseInt(baseScheduleData.duration, 10) || 60;

    const weekdaySet = {};
    weekdays.forEach(function(w) { weekdaySet[Number(w)] = true; });

    const ids = [];
    const dates = [];
    let cursor = new Date(startY, startM - 1, startD, hh, mm, 0);
    let safetyCounter = 0; // jaga-jaga supaya tidak infinite loop kalau weekdays kosong/aneh

    while (ids.length < occurrences && safetyCounter < 400) {
      safetyCounter++;
      if (weekdaySet[cursor.getDay()]) {
        const sessionStart = new Date(cursor);
        const sessionEnd = new Date(sessionStart.getTime() + durationMin * 60000);

        const result = _addScheduleInternal_({
          memberId: baseScheduleData.memberId,
          memberName: baseScheduleData.memberName,
          phone: baseScheduleData.phone,
          notes: baseScheduleData.notes,
          start: sessionStart.toISOString(),
          end: sessionEnd.toISOString(),
          coachId: baseScheduleData.coachId,
          coachName: baseScheduleData.coachName,
          recurringGroupId: groupId
        }, status, true); // silent=true, notif ringkasan dikirim sekali di bawah

        ids.push(result.id);
        dates.push(sessionStart.toLocaleDateString('id-ID', {weekday:'short', day:'numeric', month:'short'}) + ' ' + baseScheduleData.time);
      }
      cursor = new Date(cursor.getTime() + 24 * 60 * 60000); // maju 1 hari
    }

    if (ids.length === 0) throw new Error('Tidak ada tanggal yang cocok dengan pola berulang ini.');

    try {
      kirimNotifTelegram_((status === 'unread' ? "🔁 <b>KLIEN BOOKING BERULANG</b>\n\n" : "🔁 <b>JADWAL BERULANG DIBUAT</b>\n\n") +
        "👤 <b>Klien:</b> " + escapeHtmlTelegram(baseScheduleData.memberName) + "\n" +
        "📦 <b>Total Sesi:</b> " + ids.length + "\n" +
        "📅 <b>Tanggal:</b>\n" + dates.map(function(d) { return "• " + d; }).join("\n"));
    } catch (e) { Logger.log("Notif Telegram gagal: " + e); }

    return { status: 'success', groupId: groupId, count: ids.length, ids: ids, dates: dates };
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
const RESCHEDULE_CUTOFF_HOURS = 2;

/**
 * Reschedule mandiri oleh klien (member portal), TANPA lewat admin.
 * Beda dengan updateScheduleData() (yang full-power, dipakai admin lewat drag&drop
 * kalender), fungsi ini divalidasi ketat dulu sebelum mengubah data:
 *   1. Jadwal harus benar milik memberId yang mengajukan (cegah klien A mengubah jadwal klien B).
 *   2. Jadwal belum berstatus 'completed' (sesi yang sudah lewat tidak bisa direschedule).
 *   3. Waktu sekarang masih di luar RESCHEDULE_CUTOFF_HOURS sebelum jadwal LAMA
 *      (kalau sudah terlalu mepet, klien diarahkan untuk hubungi admin manual).
 *
 * Tidak melakukan pengecekan bentrok slot baru (double-booking) karena sistem ini
 * memang belum punya validasi bentrok di alur booking manapun (termasuk addSchedule),
 * jadi perilakunya tetap konsisten dengan booking normal.
 *
 * @param {string} scheduleId
 * @param {string} memberId - dipakai untuk verifikasi kepemilikan jadwal
 * @param {string} newStart - ISO string waktu mulai baru
 * @param {string} newEnd - ISO string waktu selesai baru
 * @returns {{status:string, oldStart:string, newStart:string}}
 */
function clientRescheduleSchedule(memberToken, scheduleId, newStart, newEnd) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  try {
    _validateSlot_(newStart, newEnd);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
    if (!sheet) throw new Error('Sheet Schedules tidak ditemukan');
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] !== scheduleId) continue;

      // 1. Verifikasi kepemilikan
      if (String(data[i][1]) !== String(memberId)) {
        throw new Error('Jadwal ini bukan milik Anda.');
      }

      // 2. Tidak boleh reschedule sesi yang sudah selesai
      const status = String(data[i][7]).toLowerCase();
      if (status === 'completed') {
        throw new Error('Sesi yang sudah selesai tidak bisa direschedule.');
      }

      // 3. Cek cutoff waktu dari jadwal LAMA
      const oldStart = new Date(data[i][4]);
      const now = new Date();
      const hoursUntilOldStart = (oldStart - now) / (1000 * 60 * 60);
      if (hoursUntilOldStart < RESCHEDULE_CUTOFF_HOURS) {
        throw new Error('Reschedule mandiri sudah lewat batas waktu (minimal ' + RESCHEDULE_CUTOFF_HOURS + ' jam sebelum jadwal). Silakan hubungi Coach langsung via WhatsApp.');
      }

      const memberName = data[i][2];
      const oldStartStr = data[i][4];

      sheet.getRange(i + 1, 5).setValue(newStart); // Waktu Mulai
      sheet.getRange(i + 1, 6).setValue(newEnd);   // Waktu Selesai

      try {
        const oldFormatted = new Date(oldStartStr).toLocaleString('id-ID', {weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'});
        const newFormatted = new Date(newStart).toLocaleString('id-ID', {weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'});
        kirimNotifTelegram_("🔄 <b>KLIEN RESCHEDULE MANDIRI</b>\n\n" +
          "👤 <b>Klien:</b> " + escapeHtmlTelegram(memberName) + "\n" +
          "⏰ <b>Dari:</b> " + oldFormatted + "\n" +
          "⏰ <b>Ke:</b> " + newFormatted);
      } catch (e) { Logger.log("Notif Telegram gagal: " + e); }

      return { status: 'success', oldStart: oldStartStr, newStart: newStart };
    }

    throw new Error('Jadwal tidak ditemukan');
  } catch (err) {
    throw new Error(err.message || 'Gagal reschedule jadwal.');
  }
}

/**
 * Menugaskan pelatih (Assign Coach) ke dalam sesi latihan tertentu.
 */
function updateScheduleCoach(token, scheduleId, coachId, coachName) {
  requireAdmin_(token);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
  if (!sheet) throw new Error('Sheet Jadwal tidak ditemukan');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === scheduleId) {
      sheet.getRange(i + 1, 9).setValue(coachId);
      sheet.getRange(i + 1, 10).setValue(coachName);

      try {
        kirimNotifTelegram_("🏋️ <b>COACH DITUGASKAN</b>\n\n" +
          "👤 <b>Klien:</b> " + escapeHtmlTelegram(data[i][2]) + "\n" +
          "🧑‍🏫 <b>Coach:</b> " + escapeHtmlTelegram(coachName));
      } catch(e) { Logger.log("Notif Telegram gagal: " + e); }

      return { status: 'success' };
    }
  }
  throw new Error('Jadwal tidak ditemukan');
}

// Validasi slot dari browser: tanggal sah, selesai > mulai, maks 4 jam.
function _validateSlot_(start, end) {
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) throw new Error('Waktu jadwal tidak valid.');
  if (e - s > 4 * 60 * 60000) throw new Error('Durasi sesi maksimal 4 jam.');
}

/**
 * Portal klien: booking 1 sesi untuk klien yang sedang login. Nama, No WA, dan
 * Member ID diambil dari token + sheet (bukan dari browser), jadi klien tidak
 * bisa booking atas nama orang lain.
 * @param {string} memberToken
 * @param {{start:string, end:string, duration:number, notes:string}} scheduleData
 */
function clientBookSchedule(memberToken, scheduleData) {
  const member = requireMember_(memberToken);
  scheduleData = scheduleData || {};
  _validateSlot_(scheduleData.start, scheduleData.end);

  const memberName = String(member.row[1]);
  const phone = _normalizePhone_(member.row[2]);
  const notes = String(scheduleData.notes || '').slice(0, 500);
  const duration = Math.round((new Date(scheduleData.end) - new Date(scheduleData.start)) / 60000);

  const addResult = _addScheduleInternal_({
    memberId: String(member.row[0]).trim(),
    memberName: memberName,
    phone: phone,
    start: scheduleData.start,
    end: scheduleData.end,
    notes: notes
  }, 'unread');
  const newId = addResult.id;
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
  try { MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: subject, htmlBody: body }); } catch(e) { Logger.log('Email booking gagal: ' + e); }

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

  return { status: 'success', id: newId, coachId: addResult.coachId || '', coachName: assignedCoachName };
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schSheet = ss.getSheetByName('Schedules');
  if(!schSheet) throw new Error('Sheet Schedules tidak ditemukan');
  _ensureCompletedAtColumn_(schSheet);
  const schData = schSheet.getDataRange().getValues();
  let scheduleFound = false;
  let memberName = '';
  const completedAt = new Date();
  for (let i = 1; i < schData.length; i++) {
    if (schData[i][0] === scheduleId) {
      schSheet.getRange(i + 1, 8).setValue('completed');
      schSheet.getRange(i + 1, 11).setValue(completedAt); // Completed At — dipakai getCoachMonthlyStats
      memberName = schData[i][2];
      scheduleFound = true; break;
    }
  }
  if(!scheduleFound) throw new Error('Jadwal tidak ditemukan');

  const memSheet = _getMemberDataSheet_();
  const memData = memSheet.getDataRange().getValues();
  let memberFound = false;
  let usedAfter = 0, totalSesi = 0;
  for (let i = 1; i < memData.length; i++) {
    if (memData[i][0] === memberId) {
      let currentUsed = parseInt(memData[i][9]) || 0;
      usedAfter = currentUsed + 1;
      totalSesi = parseInt(memData[i][8]) || 0;
      memSheet.getRange(i + 1, 10).setValue(usedAfter);
      memberFound = true; break;
    }
  }
  if(!memberFound) throw new Error('Klien tidak ditemukan');

  try {
    kirimNotifTelegram_("✅ <b>SESI SELESAI</b>\n\n" +
      "👤 <b>Klien:</b> " + escapeHtmlTelegram(memberName) + "\n" +
      "📦 <b>Sesi Terpakai:</b> " + usedAfter + "/" + totalSesi);
  } catch(e) { Logger.log("Notif Telegram gagal: " + e); }

  // Data untuk reminder WA sisa sesi (dikirim manual oleh admin via tombol di frontend,
  // bukan auto-send, karena WA tidak punya API kirim otomatis tanpa WhatsApp Business API).
  const remaining = Math.max(0, totalSesi - usedAfter);
  const reminderMessage = "Halo " + memberName + ", sesi kamu tersisa " + remaining + " dari " + totalSesi + " ya.";

  return {
    status: 'success',
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
  // Reminder jam 12:00
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
  logToSheet_("Memulai fungsi sendDailyReminderEmail", "INFO");

  try {
    // 1. Ambil timezone dan jadwal
    const timeZone = Session.getScriptTimeZone();
    const emailTujuan = Session.getEffectiveUser().getEmail();
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
            <a href="${_escHtml_(linkWA)}" style="color: #25D366; font-weight: bold; text-decoration: none;">
              [📱 Kirim WA Konfirmasi ke Klien]
            </a>
          </li>`;

        pesanTelegram += `⏰ <b>${jam} WIB</b> - ${title}\n🏋️ <b>Coach:</b> ${coachName}\n👉 <a href="${_escHtml_(linkWA)}">Kirim WA Konfirmasi</a>\n\n`;
      });

      emailBody += `</ul>`;
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
    const emailTujuan = Session.getEffectiveUser().getEmail();
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

function getPriceList() {
  const headers = ["ID", "Nama Paket", "Kategori", "Harga", "Jumlah Sesi", "Durasi", "Deskripsi", "Benefit", "Status Aktif"];
  const sheet = getOrCreateSheet_('PriceList', headers);
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  let packages = [];
  // Mulai dari baris kedua (index 1) untuk melewati header
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // BACKWARD COMPATIBILITY: Cegah error jika admin belum menambah kolom Jumlah Sesi
    let id, namaPaket, kategori, harga, jumlahSesi, durasi, deskripsi, benefitStr, statusAktif;
    if (row.length >= 9) {
      id = row[0]; namaPaket = row[1]; kategori = row[2]; harga = row[3];
      jumlahSesi = row[4]; durasi = row[5]; deskripsi = row[6]; benefitStr = row[7]; statusAktif = row[8];
    } else {
      id = row[0]; namaPaket = row[1]; kategori = row[2]; harga = row[3];
      jumlahSesi = ''; durasi = row[4]; deskripsi = row[5]; benefitStr = row[6]; statusAktif = row[7];
    }

    // Hanya ambil paket yang Status Aktif-nya dicentang / diisi TRUE
    if (statusAktif === true || String(statusAktif).toUpperCase() === 'TRUE') {
      packages.push({
        id: sanitizeValue(id),
        namaPaket: sanitizeValue(namaPaket),
        kategori: sanitizeValue(kategori).toLowerCase().trim(),
        harga: parseFloat(harga) || 0,
        jumlahSesi: sanitizeValue(jumlahSesi) !== '' ? parseInt(sanitizeValue(jumlahSesi)) : '',
        durasi: sanitizeValue(durasi),
        deskripsi: sanitizeValue(deskripsi),
        // Memecah teks benefit yang dipisah dengan koma menjadi array
        benefit: sanitizeValue(benefitStr).split(',').map(function(b) { return b.trim(); }),
        aktif: true
      });
    }
  }

  return packages;
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
  const sheet = getOrCreateSheet_('PriceList', ["ID", "Nama Paket", "Kategori", "Harga", "Jumlah Sesi", "Durasi", "Deskripsi", "Benefit", "Status Aktif"]);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const harga = parseFloat(data[i][3]) || 0;
    const id = String(sanitizeValue(data[i][0]) || '').trim();
    const name = String(sanitizeValue(data[i][1]) || '').trim().toLowerCase();
    if (id) prices.byId[id] = harga;
    if (name) prices.byName[name] = harga;
  }
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
    const harga = prices.byId[paketId] !== undefined ? prices.byId[paketId] : (prices.byName[namaPaket.toLowerCase()] || 0);
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Ambil Data Semua Coach
  const coachSheet = ss.getSheetByName('Coaches');
  let coaches = [];
  if (coachSheet) {
    const cData = coachSheet.getDataRange().getValues();
    for (let i = 1; i < cData.length; i++) {
      coaches.push({ id: cData[i][0], name: cData[i][1] });
    }
  }

  // 2. Ambil Aturan Ketersediaan Jam Kerja Coach (Sheet Baru)
  const availHeaders = ["Coach ID", "Hari", "Jam Mulai", "Jam Selesai"];
  let availSheet = ss.getSheetByName('CoachAvailability');
  if (!availSheet) {
    availSheet = ss.insertSheet('CoachAvailability');
    availSheet.appendRow(availHeaders);
  }
  const availData = availSheet.getDataRange().getValues();
  let rules = [];
  for (let i = 1; i < availData.length; i++) {
    let sH = 0, sM = 0, eH = 0, eM = 0;

    // Parsing Jam Mulai dengan aman (Handle String maupun Object Date)
    if (Object.prototype.toString.call(availData[i][2]) === '[object Date]') {
      sH = availData[i][2].getHours(); sM = availData[i][2].getMinutes();
    } else {
      let s = String(availData[i][2]).split(':');
      sH = parseInt(s[0]) || 0; sM = parseInt(s[1]) || 0;
    }

    // Parsing Jam Selesai dengan aman
    if (Object.prototype.toString.call(availData[i][3]) === '[object Date]') {
      eH = availData[i][3].getHours(); eM = availData[i][3].getMinutes();
    } else {
      let e = String(availData[i][3]).split(':');
      eH = parseInt(e[0]) || 0; eM = parseInt(e[1]) || 0;
    }

    rules.push({
      coachId: availData[i][0],
      hari: String(availData[i][1]).toLowerCase().trim(),
      startHour: sH, startMin: sM,
      endHour: eH, endMin: eM
    });
  }

  // 3. Ambil Daftar Jadwal yang sudah dibooking
  const schSheet = ss.getSheetByName('Schedules');
  let bookings = [];
  if (schSheet) {
    const sData = schSheet.getDataRange().getValues();
    for (let i = 1; i < sData.length; i++) {
      let status = String(sData[i][7]).toUpperCase();
      // Status dianggap Tidak Tersedia (Overlap): HOLD, CONFIRMED, UNREAD, READ, COMPLETED
      if (['UNREAD', 'READ', 'COMPLETED', 'CONFIRMED', 'HOLD'].includes(status)) {
        bookings.push({
          start: new Date(sData[i][4]),
          end: new Date(sData[i][5]),
          coachId: sData[i][8]
        });
      }
    }
  }

  // 4. Kalkulasi Slot Tersedia (untuk 14 hari ke depan)
  const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  let results = [];
  const today = new Date();
  today.setHours(0,0,0,0);

  for (let d = 0; d < 14; d++) {
    let currentDate = new Date(today.getTime() + d * 24 * 60 * 60 * 1000);
    let dayName = dayNames[currentDate.getDay()];
    let dateString = currentDate.getFullYear() + '-' + String(currentDate.getMonth()+1).padStart(2,'0') + '-' + String(currentDate.getDate()).padStart(2,'0');

    coaches.forEach(coach => {
      let rule = rules.find(r => r.coachId === coach.id && r.hari === dayName);
      if (rule) {
        let slots = [];
        let currentSlot = new Date(currentDate);
        currentSlot.setHours(rule.startHour, rule.startMin, 0, 0);

        let endTime = new Date(currentDate);
        endTime.setHours(rule.endHour, rule.endMin, 0, 0);

        while (currentSlot < endTime) {
          let nextSlot = new Date(currentSlot.getTime() + 60 * 60 * 1000); // Durasi per sesi: 1 Jam

          let isBooked = bookings.some(b => {
             return b.coachId === coach.id &&
                    ((currentSlot >= b.start && currentSlot < b.end) ||
                     (nextSlot > b.start && nextSlot <= b.end) ||
                     (currentSlot <= b.start && nextSlot >= b.end));
          });

          if (!isBooked && currentSlot > new Date()) {
             slots.push(String(currentSlot.getHours()).padStart(2,'0') + ':' + String(currentSlot.getMinutes()).padStart(2,'0'));
          }
          currentSlot = nextSlot;
        }

        if (slots.length > 0) {
          results.push({
            coachId: coach.id,
            coachName: coach.name,
            date: dateString,
            availableSlots: slots
          });
        }
      }
    });
  }

  return results;
}