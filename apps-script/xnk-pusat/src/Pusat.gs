// XNK Pusat (Gelombang 2, T-2233): satu Apps Script di akun Google pemilik yang mengawasi semua coach di hub
// xnk.web.id. Dibaca halaman xnk.web.id/adminxnk lewat doPost (login PIN pemilik).
//   - Pendaftaran: wizard setup di spreadsheet coach membuat rahasia acak (HUB_SECRET di spreadsheet coach) dan
//     mengirimnya ke sini bersama slug dan link /exec, dengan kode daftar pemilik (PUSAT_ENROLL_CODE).
//   - Setiap pagi (runPusatDaily) semua coach ditanya hubStatus(rahasia): versi Library, trigger, pengingat, angka
//     klien/sesi. Ada masalah = satu email ke pemilik. Tidak ada nama atau nomor klien yang pernah sampai ke sini.
//   - Aksi dari /adminxnk (perbarui coach, hubungkan, bangun hub) menjalankan workflow repo hub lewat token GitHub
//     fine-grained (GITHUB_TOKEN, hanya Actions: write di xnk-template-site).
//   - Backup mingguan (T-2250, runPusatBackup tiap jam): satu coach per jalan disalin lewat hubExport(rahasia) ke
//     spreadsheet baru di Drive akun ini (XNK Backup/<slug>), 8 terbaru disimpan. Isinya data penuh klien: hanya di
//     Drive pemilik; /adminxnk hanya melihat tanggal dan link.
// Script Properties (diisi di editor: Project Settings → Script Properties, lalu jalankan setupPusat sekali):
//   PUSAT_PIN (min 8), PUSAT_ENROLL_CODE (min 8), PUSAT_EMAIL (opsional; bawaan = akun ini), GITHUB_TOKEN (opsional),
//   HUB_URL (bawaan https://xnk.web.id), HUB_REPO (bawaan xnkzzxd/xnk-template-site), XNK_REPO (bawaan xnkzzxd/XNK).
// Disimpan sendiri: SESSION_SECRET, COACHES (JSON slug → {exec, secret, at}), ST_<slug> (status terakhir), LATEST_LIB,
//   BKST_<slug> (backup terakhir), BKNOW_<slug> (backup sekarang), BK_CUR (backup yang sedang berjalan), BK_DIRS (ID
//   folder Drive), BK_RUN (tanda backup sedang berjalan).

var PUSAT_SESSION_MS = 12 * 3600 * 1000;
var PUSAT_TICK_LATE_MS = 3 * 3600 * 1000;      // pengingat menyala tapi tick terakhir lebih lama dari ini = masalah
// T-2253: batas harian akun Gmail biasa; ≥ 70 % dari salah satunya = masalah. Bisa ditimpa Script Properties.
var PUSAT_QUOTA_WARN = 0.7;
var PUSAT_QUOTA_DEFAULTS = { mail: 100, fetch: 20000, triggerMin: 90 };
var PUSAT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
var PUSAT_EXEC_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

function props_() { return PropertiesService.getScriptProperties(); }
function prop_(k, d) { var v = props_().getProperty(k); return v == null || v === '' ? (d == null ? '' : d) : String(v); }
function json_(k, d) { try { var v = props_().getProperty(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function quotaLimits_() {
  var n = function (k, d) { var v = Number(prop_(k, '')); return isFinite(v) && v > 0 ? v : d; };
  return { mail: n('QUOTA_MAIL', PUSAT_QUOTA_DEFAULTS.mail), fetch: n('QUOTA_FETCH', PUSAT_QUOTA_DEFAULTS.fetch), triggerMin: n('QUOTA_TRIGGER_MIN', PUSAT_QUOTA_DEFAULTS.triggerMin) };
}
function hubUrl_() { return prop_('HUB_URL', 'https://xnk.web.id').replace(/\/+$/, ''); }

// ── Pintu JSON untuk /adminxnk dan wizard coach ──────────────────────────────────────────────────────────────

var PUSAT_API = { pusatLogin: pusatLogin, pusatOverview: pusatOverview, pusatCheck: pusatCheck, pusatAction: pusatAction, pusatRegister: pusatRegister };

function doPost(e) {
  var out;
  try {
    var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!raw || raw.length > 20000) throw new Error('Permintaan tidak valid.');
    var req = JSON.parse(raw);
    if (typeof req.fn !== 'string' || !Object.prototype.hasOwnProperty.call(PUSAT_API, req.fn)) throw new Error('Permintaan tidak valid.');
    out = { ok: true, data: PUSAT_API[req.fn].apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    out = { ok: false, error: msg.replace(/^AUTH: /, ''), auth: msg.indexOf('AUTH: ') === 0 };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * GET /exec. Dengan ?setup=<tanda siap> (dibuat pusatAction 'setup', berlaku 10 menit): jalankan setupPusat_ lalu
 * tampilkan teks singkat. Web app berjalan sebagai pemilik, jadi bila ada izin Google baru, Google menampilkan layar
 * izin kepada pemilik yang membuka link ini. Tanpa/ tanda salah = teks "XNK Pusat" saja.
 */
function doGet(e) {
  var t = e && e.parameter && e.parameter.setup;
  if (!t) return ContentService.createTextOutput('XNK Pusat');
  try { requireSetupTicket_(t); } catch (err) { return ContentService.createTextOutput('Link siapkan XNK Pusat sudah tidak berlaku. Buka lagi dari xnk.web.id/adminxnk.'); }
  setupPusat_();
  // Izin baru (Drive/Spreadsheet) TIDAK bisa diberikan lewat link web: Google hanya menampilkan layar izin di editor.
  if (!setupState_().auth) return ContentService.createTextOutput('Trigger XNK Pusat sudah terpasang (cek harian 06:00 WIB, backup tiap jam), tetapi izin Google baru (Drive/Spreadsheet untuk backup) belum diberikan. Izin itu hanya bisa diberikan dari editor: buka ' + editorUrl_() + ' , pilih fungsi setupPusat, tekan Run, lalu Izinkan.');
  return ContentService.createTextOutput('XNK Pusat siap: izin Google lengkap, cek harian 06:00 WIB dan backup tiap jam terpasang. Tutup tab ini dan kembali ke xnk.web.id/adminxnk.');
}

var PUSAT_SETUP_MS = 10 * 60 * 1000;
/** Tanda siap sekali pakai dari /adminxnk: "setup.<exp>.<hmac>", 10 menit. Bukan token sesi (tidak masuk riwayat). */
function setupTicket_() { var exp = String(Date.now() + PUSAT_SETUP_MS); return 'setup.' + exp + '.' + sign_('setup.' + exp); }
function requireSetupTicket_(t) {
  var p = String(t || '').split('.');
  var exp = Number(p[1]);
  if (p.length !== 3 || p[0] !== 'setup' || !exp || exp < Date.now() || !eq_(p[2], sign_('setup.' + p[1]))) throw new Error('Tanda siap tidak berlaku.');
}

/** Link editor Apps Script XNK Pusat (tempat pemilik memberi izin baru). */
function editorUrl_() { try { return 'https://script.google.com/d/' + ScriptApp.getScriptId() + '/edit'; } catch (e) { return 'https://script.google.com/home'; } }

/** Izin Google + trigger yang dibutuhkan XNK Pusat; untuk pita peringatan di /adminxnk. */
function setupState_() {
  var h = {};
  try { ScriptApp.getProjectTriggers().forEach(function (t) { h[t.getHandlerFunction()] = 1; }); } catch (e) { /* tanpa izin trigger */ }
  var auth = true;
  try {
    var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    auth = info.getAuthorizationStatus() !== ScriptApp.AuthorizationStatus.REQUIRED;
  } catch (e) { auth = true; }
  var st = { auth: auth, daily: !!h.runPusatDaily, backup: !!h.runPusatBackup, editor: editorUrl_() };
  st.ok = st.auth && st.daily && st.backup;
  return st;
}

// ── Login pemilik ────────────────────────────────────────────────────────────────────────────────────────────

function sign_(s) {
  var key = prop_('SESSION_SECRET');
  if (key.length < 32) throw new Error('XNK Pusat belum disiapkan: jalankan setupPusat di editor.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, key)).replace(/=+$/, '');
}
function eq_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < a.length && i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function requireOwnerToken_(token) {
  var parts = String(token || '').split('.');
  var exp = Number(parts[0]);
  if (parts.length !== 2 || !exp || exp < Date.now() || !eq_(parts[1], sign_(parts[0]))) throw new Error('AUTH: Sesi berakhir. Masuk lagi.');
}
/** Batasi tebakan: maks 5 percobaan salah per 15 menit (untuk PIN dan kode daftar). */
function guard_(key) {
  var c = CacheService.getScriptCache(), n = Number(c.get('fail:' + key) || 0);
  if (n >= 5) throw new Error('Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
  return function () { c.put('fail:' + key, String(n + 1), 900); };
}

/** @return {{token: string, exp: number}} */
function pusatLogin(pin) {
  var fail = guard_('pin');
  var want = prop_('PUSAT_PIN');
  if (want.length < 8) throw new Error('PIN XNK Pusat belum diatur (Script Property PUSAT_PIN, minimal 8 karakter).');
  if (!eq_(String(pin || ''), want)) { fail(); throw new Error('PIN salah.'); }
  var exp = String(Date.now() + PUSAT_SESSION_MS);
  return { token: exp + '.' + sign_(exp), exp: Number(exp) };
}

// ── Pendaftaran coach (dipanggil wizard setup spreadsheet coach) ─────────────────────────────────────────────

/** Simpan coach: slug, link /exec, rahasia hubStatus. Hanya dengan kode daftar pemilik. */
function pusatRegister(code, slug, exec, secret) {
  var fail = guard_('enroll');
  var want = prop_('PUSAT_ENROLL_CODE');
  if (want.length < 8 || !eq_(String(code || ''), want)) { fail(); throw new Error('Kode daftar XNK Pusat salah.'); }
  slug = String(slug || '').trim(); exec = String(exec || '').trim(); secret = String(secret || '');
  if (!PUSAT_SLUG_RE.test(slug) || /--/.test(slug)) throw new Error('Nama di alamat tidak valid.');
  if (!PUSAT_EXEC_RE.test(exec)) throw new Error('Link /exec tidak valid.');
  if (secret.length < 32 || !/^[A-Za-z0-9_-]+$/.test(secret)) throw new Error('Rahasia tidak valid.');
  // Link dari hub.json menang: getService().getUrl() di spreadsheet coach bisa memberi link uji (HEAD) yang minta login.
  exec = hubExec_(slug) || exec;
  // Pastikan link itu bisa dibuka tanpa login sebelum disimpan (jawaban JSON apa pun = aplikasi web terbuka).
  try { askApps_(exec, { fn: 'getServerInfo', args: [] }); } catch (e) {
    throw new Error('Link /exec coach tidak bisa dibuka tanpa login (' + String(e && e.message ? e.message : e).slice(0, 120) + '). Pakai link dari Deploy → Kelola deployment (bukan link uji), akses "Siapa saja".');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var all = json_('COACHES', {});
    Object.keys(all).forEach(function (s) { if (s !== slug && all[s].exec === exec) throw new Error('Link /exec itu sudah terdaftar untuk coach lain.'); });
    all[slug] = { exec: exec, secret: secret, at: new Date().toISOString() };
    props_().setProperty('COACHES', JSON.stringify(all));
  } finally { lock.releaseLock(); }
  return { slug: slug, registered: true };
}

// ── Pemeriksaan ──────────────────────────────────────────────────────────────────────────────────────────────

/** Versi Library terbaru dari tag lib-v<N> repo XNK (GitHub API publik): {version, commit}; disimpan 1 jam. */
function latestLib_() {
  var c = json_('LATEST_LIB', null);
  if (c && Date.now() - c.at < 3600 * 1000) return c;
  try {
    var repo = prop_('XNK_REPO', 'xnkzzxd/XNK');
    var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/git/matching-refs/tags/lib-v', { muteHttpExceptions: true, headers: gh_() });
    if (res.getResponseCode() !== 200) return c;
    var best = null;
    JSON.parse(res.getContentText()).forEach(function (r) {
      var m = String(r.ref).match(/refs\/tags\/lib-v(\d+)$/);
      if (m && (!best || Number(m[1]) > best.version)) best = { version: Number(m[1]), obj: r.object };
    });
    if (!best) return c;
    var commit = best.obj.sha;
    if (best.obj.type === 'tag') {
      var t = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/git/tags/' + best.obj.sha, { muteHttpExceptions: true, headers: gh_() });
      if (t.getResponseCode() === 200) commit = JSON.parse(t.getContentText()).object.sha;
    }
    var out = { version: best.version, commit: commit, at: Date.now() };
    props_().setProperty('LATEST_LIB', JSON.stringify(out));
    return out;
  } catch (e) {
    return c;
  }
}

function gh_() {
  var h = { Accept: 'application/vnd.github+json', 'User-Agent': 'xnk-pusat' };
  var t = prop_('GITHUB_TOKEN');
  if (t) h.Authorization = 'Bearer ' + t;
  return h;
}

/**
 * POST JSON ke /exec Apps Script lalu ambil jawabannya. Apps Script menjawab POST dengan 302 ke
 * script.googleusercontent.com/macros/echo; UrlFetchApp mengikuti 302 tetap sebagai POST dan mendapat halaman HTML
 * Google ("Unexpected token '<'"). Jadi: POST tanpa mengikuti, lalu GET ke alamat Location. doPost tujuan sudah
 * berjalan pada permintaan pertama.
 */
function postAppsRaw_(url, body) {
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: false });
  var code = res.getResponseCode(), at = url;
  if (code >= 300 && code < 400) {
    var h = (res.getHeaders && res.getHeaders()) || {};
    var loc = h.Location || h.location;
    if (!loc) throw new Error('HTTP ' + code + ' tanpa alamat pengalihan');
    at = loc;
    res = UrlFetchApp.fetch(loc, { muteHttpExceptions: true, followRedirects: true });
    code = res.getResponseCode();
  }
  return { code: code, url: at, text: res.getContentText() };
}

/**
 * POST lalu baca JSON. Bukan JSON = galat yang bisa dibaca: kode HTTP, host, dan judul halaman HTML (mis. "Sign in"),
 * bukan "Unexpected token '<'".
 */
function askApps_(url, body) {
  var r = postAppsRaw_(url, body), text = r.text;
  try { var j = JSON.parse(text); if (j && typeof j === 'object') return j; } catch (e) { /* di bawah */ }
  var t = String(text || '').match(/<title[^>]*>([^<]{0,80})/i);
  var host = String(r.url || '').replace(/^https?:\/\/([^\/?#]+).*$/, '$1');
  throw new Error('HTTP ' + r.code + ' dari ' + host + (t ? ', halaman "' + t[1].trim() + '"' : text ? ', bukan JSON' : ', kosong'));
}

/** Link /exec coach di hub.json publik repo hub (disimpan 10 menit); kosong bila tidak ada atau gagal dibaca. */
function hubExec_(slug) {
  var c = CacheService.getScriptCache(), raw = c.get('hubjson');
  if (raw == null) {
    raw = '';
    try {
      var res = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + prop_('HUB_REPO', 'xnkzzxd/xnk-template-site') + '/main/hub.json', { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) raw = res.getContentText();
    } catch (e) { raw = ''; }
    try { c.put('hubjson', raw, 600); } catch (e) { /* cache penuh: baca lagi lain kali */ }
  }
  try {
    var hit = (JSON.parse(raw).coaches || []).filter(function (x) { return x && x.slug === slug; })[0];
    return hit && PUSAT_EXEC_RE.test(String(hit.exec || '')) ? String(hit.exec) : '';
  } catch (e) { return ''; }
}

/** Tanya satu coach; kembalikan status {at, ok, problems[], data}. */
function checkOne_(slug, c, latest) {
  var st = { at: new Date().toISOString(), ok: false, problems: [], data: null };
  try {
    var j = askApps_(hubExec_(slug) || c.exec, { fn: 'hubStatus', args: [c.secret] });
    if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'tanpa jawaban');
    st.data = j.data;
  } catch (e) {
    st.problems.push('Server tidak menjawab (' + String(e && e.message ? e.message : e).slice(0, 160) + ').');
    return st;
  }
  var d = st.data;
  if (latest && d.lib && d.lib.commit && d.lib.commit !== latest.commit) st.problems.push('Library tertinggal (terbaru v' + latest.version + ').');
  if (!d.triggers || d.triggers.runReminderTick !== 1) st.problems.push('Trigger pengingat ' + (d.triggers && d.triggers.runReminderTick ? 'terpasang ' + d.triggers.runReminderTick + ' kali' : 'tidak terpasang') + '.');
  if (d.reminders && d.reminders.enabled) {
    var last = new Date(d.reminders.lastTickAt || 0).getTime();
    if (!last || Date.now() - last > PUSAT_TICK_LATE_MS) st.problems.push('Pengingat menyala tetapi tidak berjalan sejak ' + (last ? new Date(last).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'awal') + '.');
  }
  if (d.quota && typeof d.quota === 'object') {   // Library lama tanpa kuota = tidak dicek
    var lim = quotaLimits_(), names = { mail: 'Kuota email', fetch: 'Kuota UrlFetch', triggerMin: 'Menit trigger' };
    Object.keys(names).forEach(function (k) {
      var v = Number(d.quota[k]) || 0;
      if (v >= lim[k] * PUSAT_QUOTA_WARN) st.problems.push(names[k] + ' hari ini ' + v + ' dari ' + lim[k] + ' (≥ 70 %).');
    });
  }
  st.ok = st.problems.length === 0;
  return st;
}

function checkAll_(only) {
  var all = json_('COACHES', {}), latest = latestLib_(), out = {};
  Object.keys(all).sort().forEach(function (slug) {
    if (only && slug !== only) return;
    out[slug] = checkOne_(slug, all[slug], latest);
    props_().setProperty('ST_' + slug, JSON.stringify(out[slug]));
  });
  return out;
}

/** Trigger harian: periksa semua, email pemilik hanya bila ada masalah. */
function runPusatDaily() {
  var res = checkAll_();
  var all = json_('COACHES', {});
  Object.keys(all).forEach(function (s) {
    var b = json_('BKST_' + s, null);
    if (!b || !(b.fails >= 2)) return;
    if (!res[s]) res[s] = { ok: true, problems: [] };
    res[s].problems.push('Backup gagal ' + b.fails + ' kali berturut-turut (' + (b.error || '-') + ').');
    res[s].ok = false;
  });
  var bad = Object.keys(res).sort().filter(function (s) { return !res[s].ok; });
  if (!bad.length) return { problems: 0 };
  var to = prop_('PUSAT_EMAIL') || Session.getEffectiveUser().getEmail();
  var lines = bad.map(function (s) { return '• ' + s + ': ' + res[s].problems.join(' '); });
  MailApp.sendEmail(to, 'XNK Pusat: ' + bad.length + ' coach perlu dicek', lines.join('\n') + '\n\nDasbor: ' + hubUrl_() + '/adminxnk/');
  return { problems: bad.length };
}

// ── Untuk /adminxnk ──────────────────────────────────────────────────────────────────────────────────────────

/** Daftar coach + status terakhir (tanpa rahasia). */
function pusatOverview(token) {
  requireOwnerToken_(token);
  var all = json_('COACHES', {}), hub = hubUrl_();
  return {
    hub: hub,
    latest: latestLib_(),
    canAct: !!prop_('GITHUB_TOKEN'),
    quotaLimits: quotaLimits_(),
    coaches: Object.keys(all).sort().map(function (slug) {
      return { slug: slug, exec: all[slug].exec, registeredAt: all[slug].at, panel: hub + '/' + slug + '/', klien: hub + '/' + slug + '/klien/', status: json_('ST_' + slug, null), backup: backupView_(slug) };
    }),
    setup: setupState_(),
  };
}

/** Periksa sekarang (satu coach atau semua). */
function pusatCheck(token, slug) {
  requireOwnerToken_(token);
  if (slug && !json_('COACHES', {})[slug]) throw new Error('Coach tidak terdaftar.');
  checkAll_(slug || '');
  return pusatOverview(token);
}

/** Jalankan workflow repo hub: perbarui | hubungkan (slug) atau bangun. */
function pusatAction(token, action, slug) {
  requireOwnerToken_(token);
  if (action === 'backup') return backupNow_(String(slug || ''));
  if (action === 'setup') return { ticket: setupTicket_() };   // /adminxnk membuka <pusatUrl>?setup=<ticket> di tab baru
  var t = prop_('GITHUB_TOKEN');
  if (!t) throw new Error('Token GitHub belum diatur di XNK Pusat (Script Property GITHUB_TOKEN).');
  slug = String(slug || '');
  var wf, inputs;
  if (action === 'bangun') { wf = 'hub.yml'; inputs = { aksi: 'bangun' }; }
  else if (action === 'perbarui' || action === 'hubungkan') {
    if (slug && !PUSAT_SLUG_RE.test(slug)) throw new Error('Nama di alamat tidak valid.');
    if (action === 'hubungkan' && !slug) throw new Error('Pilih coach.');
    wf = 'coach.yml'; inputs = { aksi: action, slug: slug };
  } else throw new Error('Aksi tidak dikenal.');
  var repo = prop_('HUB_REPO', 'xnkzzxd/xnk-template-site');
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/actions/workflows/' + wf + '/dispatches', {
    method: 'post', contentType: 'application/json', headers: gh_(), muteHttpExceptions: true, payload: JSON.stringify({ ref: 'main', inputs: inputs }),
  });
  if (res.getResponseCode() !== 204) throw new Error('GitHub menolak (' + res.getResponseCode() + '). Periksa token GitHub di XNK Pusat.');
  return { started: action, slug: slug };
}

// ── Backup mingguan (T-2250) ────────────────────────────────────────────────────────────────────────────────
// Tiap jam runPusatBackup menyalin SATU coach yang jatuh tempo (backup terakhir > 7 hari, atau ditandai "sekarang")
// lewat hubExport(rahasia) ke spreadsheet baru "<slug> YYYY-MM-DD" di Drive akun ini (XNK Backup/<slug>), maks ±4
// menit per jalan; sisanya dilanjutkan jalan berikutnya lewat BK_CUR. 8 salinan terbaru disimpan, sisanya ke sampah.
// Drive lewat REST API v3 + ScriptApp.getOAuthToken() (cukup izin drive.file untuk file buatan skrip ini; DriveApp
// meminta izin Drive penuh). Nilai = teks tampilan sel (format @), jadi angka 08… dan tanggal tetap seperti di layar.

var PUSAT_BK_DAYS = 7 * 864e5;            // jarak backup per coach
var PUSAT_BK_KEEP = 8;                    // salinan yang disimpan per coach
var PUSAT_BK_BUDGET_MS = 4 * 60 * 1000;   // waktu kerja per jalan (batas Apps Script 6 menit)
var PUSAT_BK_RETRY_MS = 6 * 3600 * 1000;  // coach yang gagal dicoba lagi setelah ini (tidak menahan coach lain)
var PUSAT_BK_STALE_MS = 2 * 864e5;        // backup setengah jadi yang lebih tua dari ini dibuang
var PUSAT_BK_LOCK_MS = 7 * 60 * 1000;     // BK_RUN lebih muda dari ini = jalan lain masih bekerja
var DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
var MIME_SHEET = 'application/vnd.google-apps.spreadsheet', MIME_DIR = 'application/vnd.google-apps.folder';

/** Panggil Drive REST v3; null bila 404. */
function drive_(method, path, body) {
  var o = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(DRIVE_API + path, o), code = res.getResponseCode();
  if (code === 404) return null;
  if (code < 200 || code >= 300) throw new Error('Drive menolak (' + code + '). Jalankan setupPusat sekali lagi untuk memberi izin.');
  var t = res.getContentText();
  return t ? JSON.parse(t) : {};
}
function driveTrash_(id) { drive_('patch', '/' + encodeURIComponent(id) + '?fields=id', { trashed: true }); }
function driveMkdir_(name, parent) {
  return drive_('post', '?fields=id', { name: name, mimeType: MIME_DIR, parents: parent ? [parent] : undefined }).id;
}

/** Folder XNK Backup/<slug> (ID disimpan; dibuat lagi bila hilang atau di sampah). */
function bkDir_(slug) {
  var dirs = json_('BK_DIRS', {}) || {};
  var alive = function (id) { if (!id) return false; var f = drive_('get', '/' + encodeURIComponent(id) + '?fields=id,trashed'); return !!(f && !f.trashed); };
  if (!alive(dirs.root)) dirs = { root: driveMkdir_('XNK Backup', null) };
  if (!alive(dirs[slug])) dirs[slug] = driveMkdir_(slug, dirs.root);
  props_().setProperty('BK_DIRS', JSON.stringify(dirs));
  return dirs[slug];
}

/** Tanya hubExport coach. Library lama tanpa fungsi itu = pesan yang menyuruh memperbarui coach. */
function bkAsk_(slug, c, req) {
  var j = askApps_(hubExec_(slug) || c.exec, { fn: 'hubExport', args: req ? [c.secret, req] : [c.secret] });
  if (j && j.ok) return j.data || {};
  if (j && j.code === 'unknown_fn') throw new Error('Library coach belum punya hubExport; perbarui coach.');
  throw new Error(j && j.error ? j.error : 'tanpa jawaban');
}

/** Coach berikutnya: yang ditandai "sekarang" dulu, lalu yang jatuh tempo dengan backup tertua. */
function bkPick_(all) {
  var now = Date.now(), slugs = Object.keys(all).sort(), best = '', bestOk = Infinity;
  for (var i = 0; i < slugs.length; i++) if (prop_('BKNOW_' + slugs[i])) return slugs[i];
  slugs.forEach(function (s) {
    var b = json_('BKST_' + s, null) || {};
    var ok = Date.parse(b.okAt || '') || 0, at = Date.parse(b.at || '') || 0;
    if (ok && now - ok < PUSAT_BK_DAYS) return;
    if (b.error && at && now - at < PUSAT_BK_RETRY_MS) return;
    if (ok < bestOk) { best = s; bestOk = ok; }
  });
  return best;
}

/** Sheet tujuan: sheet pertama bawaan diganti namanya untuk sheet pertama, sisanya dibuat. */
function bkSheet_(ss, name, i) {
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  if (i === 0) { sh = ss.getSheets()[0]; sh.setName(name); return sh; }
  return ss.insertSheet(name);
}

/** Tulis satu potong sebagai teks; sel berawalan "=" diberi ' agar tidak jadi rumus. */
function bkWrite_(sh, from, rows) {
  var w = rows[0] ? rows[0].length : 0;
  if (!w) return;
  var vals = rows.map(function (r) {
    var line = [];
    for (var k = 0; k < w; k++) { var v = r[k] == null ? '' : String(r[k]); line.push(v.charAt(0) === '=' ? "'" + v : v); }
    return line;
  });
  var needR = from + vals.length - 1 - sh.getMaxRows();
  if (needR > 0) sh.insertRowsAfter(sh.getMaxRows(), needR);
  var needC = w - sh.getMaxColumns();
  if (needC > 0) sh.insertColumnsAfter(sh.getMaxColumns(), needC);
  sh.getRange(from, 1, vals.length, w).setNumberFormat('@').setValues(vals);
}

function bkSave_(cur) { props_().setProperty('BK_CUR', JSON.stringify(cur)); }

/** Gagal: buang salinan setengah jadi, catat galat, hitung gagal berturut-turut. */
function bkFail_(cur, e) {
  var msg = String(e && e.message ? e.message : e).slice(0, 160);
  if (cur.fileId) { try { driveTrash_(cur.fileId); } catch (x) { /* biarkan; bisa dihapus manual */ } }
  props_().deleteProperty('BK_CUR');
  var prev = json_('BKST_' + cur.slug, null) || {};
  props_().setProperty('BKST_' + cur.slug, JSON.stringify({ at: new Date().toISOString(), okAt: prev.okAt || '', fileUrl: prev.fileUrl || '', rows: prev.rows || 0, error: msg, fails: (prev.fails || 0) + 1 }));
  return { slug: cur.slug, error: msg };
}

/** Simpan 8 salinan terbaru di folder coach, sisanya ke sampah. */
function bkPrune_(dir) {
  var q = "'" + dir + "' in parents and trashed=false and mimeType='" + MIME_SHEET + "'";
  var r = drive_('get', '?q=' + encodeURIComponent(q) + '&orderBy=' + encodeURIComponent('createdTime desc') + '&pageSize=100&fields=' + encodeURIComponent('files(id,name,createdTime)'));
  var files = ((r && r.files) || []).slice().sort(function (a, b) { return String(b.createdTime).localeCompare(String(a.createdTime)); });
  files.slice(PUSAT_BK_KEEP).forEach(function (f) { driveTrash_(f.id); });
  return Math.max(0, files.length - PUSAT_BK_KEEP);
}

/** Trigger tiap jam: lanjutkan atau mulai backup satu coach. */
function runPusatBackup() {
  var run = Number(prop_('BK_RUN') || 0);
  if (run && Date.now() - run < PUSAT_BK_LOCK_MS) return { busy: true };
  props_().setProperty('BK_RUN', String(Date.now()));
  try { return backupStep_(); } finally { props_().deleteProperty('BK_RUN'); }
}

/** Trigger sekali dari tombol "Backup sekarang": hapus dirinya lalu jalan seperti biasa. */
function runPusatBackupSoon() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runPusatBackupSoon') ScriptApp.deleteTrigger(t); });
  return runPusatBackup();
}

function backupStep_() {
  var t0 = Date.now(), all = json_('COACHES', {}), cur = json_('BK_CUR', null);
  if (cur && !all[cur.slug]) {   // coach dihapus dari daftar: buang salinan setengah jadi tanpa status
    if (cur.fileId) { try { driveTrash_(cur.fileId); } catch (x) { /* abaikan */ } }
    props_().deleteProperty('BK_CUR');
    cur = null;
  }
  if (cur && t0 - cur.started > PUSAT_BK_STALE_MS) return bkFail_(cur, 'Backup terhenti di tengah jalan; dimulai lagi nanti.');
  if (!cur) {
    var slug = bkPick_(all);
    if (!slug) return { idle: true };
    props_().deleteProperty('BKNOW_' + slug);
    cur = { slug: slug, started: t0, dir: '', fileId: '', fileUrl: '', sheets: [], i: 0, from: 1, rows: 0 };
    try {
      var list = bkAsk_(slug, all[slug], null);
      cur.sheets = (list.sheets || []).map(function (x) { return { name: String(x.name), rows: Number(x.rows) || 0 }; });
      if (!cur.sheets.length) throw new Error('Spreadsheet coach tanpa sheet.');
      cur.dir = bkDir_(slug);
      var day = new Date(t0 + 7 * 3600 * 1000).toISOString().slice(0, 10);   // tanggal WIB
      var f = drive_('post', '?fields=id,webViewLink', { name: slug + ' ' + day, mimeType: MIME_SHEET, parents: [cur.dir] });
      cur.fileId = f.id;
      cur.fileUrl = f.webViewLink || 'https://docs.google.com/spreadsheets/d/' + f.id + '/edit';
      bkSave_(cur);
    } catch (e) { return bkFail_(cur, e); }
  }
  try {
    var c = all[cur.slug], ss = SpreadsheetApp.openById(cur.fileId);
    do {
      var meta = cur.sheets[cur.i], sh = bkSheet_(ss, meta.name, cur.i);
      if (meta.rows > 0) {
        var part = bkAsk_(cur.slug, c, { sheet: meta.name, from: cur.from });
        var rows = Array.isArray(part.rows) ? part.rows : [];
        if (rows.length) bkWrite_(sh, cur.from, rows);
        cur.rows += rows.length;
        if (part.next && part.next <= cur.from) throw new Error('Jawaban hubExport tidak maju.');
        if (part.next) cur.from = part.next; else { cur.i++; cur.from = 1; }
      } else { cur.i++; cur.from = 1; }
      bkSave_(cur);
    } while (cur.i < cur.sheets.length && Date.now() - t0 < PUSAT_BK_BUDGET_MS);
  } catch (e) { return bkFail_(cur, e); }
  if (cur.i < cur.sheets.length) return { slug: cur.slug, running: true, rows: cur.rows };

  props_().deleteProperty('BK_CUR');
  var at = new Date().toISOString();
  props_().setProperty('BKST_' + cur.slug, JSON.stringify({ at: at, okAt: at, fileUrl: cur.fileUrl, rows: cur.rows, error: '', fails: 0 }));
  var pruned = 0;
  try { pruned = bkPrune_(cur.dir); } catch (e) { /* salinan lama dicoba lagi minggu depan */ }
  return { slug: cur.slug, done: true, rows: cur.rows, pruned: pruned };
}

/** Status backup untuk /adminxnk: tanggal, link, jumlah baris, galat. Tanpa isi data. */
function backupView_(slug) {
  var b = json_('BKST_' + slug, null) || {}, cur = json_('BK_CUR', null);
  return { at: b.at || '', okAt: b.okAt || '', fileUrl: b.fileUrl || '', rows: b.rows || 0, error: b.error || '', fails: b.fails || 0, queued: !!prop_('BKNOW_' + slug), running: !!(cur && cur.slug === slug) };
}

/** Tombol "Backup sekarang": tandai coach dan jalankan backup ±1 menit lagi (tanpa GitHub). */
function backupNow_(slug) {
  if (!PUSAT_SLUG_RE.test(slug) || !json_('COACHES', {})[slug]) throw new Error('Coach tidak terdaftar.');
  props_().setProperty('BKNOW_' + slug, String(Date.now()));
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'runPusatBackupSoon'; });
  if (!has) ScriptApp.newTrigger('runPusatBackupSoon').timeBased().after(60 * 1000).create();
  return { started: 'backup', slug: slug, queued: true };
}

// ── Pemasangan (dijalankan pemilik dari editor) ─────────────────────────────────────────────────────────────

/** Sekali (dan lagi setelah izin baru): kunci sesi + trigger harian 06:00 WIB + trigger backup tiap jam. Aman diulang.
 *  Dari editor, atau dari /adminxnk → "Siapkan XNK Pusat" (doGet ?setup). */
function setupPusat() { return setupPusat_(); }
function setupPusat_() {
  if (prop_('SESSION_SECRET').length < 32) props_().setProperty('SESSION_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); if (h === 'runPusatDaily' || h === 'runPusatBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runPusatDaily').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Jakarta').create();
  ScriptApp.newTrigger('runPusatBackup').timeBased().everyHours(1).create();
  return 'XNK Pusat siap (cek harian 06:00 WIB, backup tiap jam). Isi PUSAT_PIN dan PUSAT_ENROLL_CODE di Script Properties bila belum, lalu terbitkan sebagai aplikasi web.';
}
