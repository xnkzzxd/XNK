// XNK HQ (Gelombang 2, T-2233): satu Apps Script di akun Google pemilik yang mengawasi semua coach di hub
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
//   HUB_URL (bawaan https://xnk.web.id), HUB_REPO (bawaan xnkzzxd/xnk-template-site), XNK_REPO (bawaan xnkzzxd/XNK),
//   PUSAT_PUSH_SECRET (opsional, min 32; sama dengan secret repo hub, untuk workflow Push XNK, T-2240).
// Disimpan sendiri: SESSION_SECRET, COACHES (JSON slug → {exec, secret, at}), ST_<slug> (status terakhir), LATEST_LIB,
//   BKST_<slug> (backup terakhir), BKNOW_<slug> (backup sekarang), BK_CUR (backup yang sedang berjalan), BK_DIRS (ID
//   folder Drive), BK_RUN (tanda backup sedang berjalan), PUSH_<slug> (push coach: menyala?, rahasia relay, T-2240),
//   SITEQ_<slug> (alamat situs baru yang belum diterima coach setelah ganti slug, dicoba lagi tiap pagi, T-2243),
//   SUB_<slug> (langganan: paket, harga, jatuh tempo, email coach, baca saja, riwayat bayar; tanpa = gratis, T-2251),
//   OUT_<slug> (coach keluar: tanggal, jadwal hapus akun H+30, backup akhir + Excel, tanda hub; tanpa = aktif, T-2252).

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
/** Semua UrlFetch XNK HQ lewat sini: dihitung per hari WIB (CacheService fq:<tanggal>, tampil di /adminxnk). */
function fetch_(url, o) {
  try {
    var c = CacheService.getScriptCache(), k = 'fq:' + new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    c.put(k, String(Number(c.get(k) || 0) + 1), 2 * 86400);
  } catch (e) { /* hitungan tidak boleh menggagalkan permintaan */ }
  return UrlFetchApp.fetch(url, o);
}
function fetchToday_() {
  try { return Number(CacheService.getScriptCache().get('fq:' + new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)) || 0); } catch (e) { return 0; }
}
function hubUrl_() { return prop_('HUB_URL', 'https://xnk.web.id').replace(/\/+$/, ''); }

// ── Pintu JSON untuk /adminxnk dan wizard coach ──────────────────────────────────────────────────────────────

var PUSAT_API = { pusatPlanSave: pusatPlanSave, pusatLogin: pusatLogin, pusatOverview: pusatOverview, pusatCheck: pusatCheck, pusatAction: pusatAction, pusatRegister: pusatRegister, pusatPushTargets: pusatPushTargets, pusatRename: pusatRename, pusatSubSave: pusatSubSave, pusatSubPay: pusatSubPay, pusatSetPlace: pusatSetPlace, pusatLeave: pusatLeave };

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
 * izin kepada pemilik yang membuka link ini. Tanpa/ tanda salah = teks "XNK HQ" saja.
 */
function doGet(e) {
  var t = e && e.parameter && e.parameter.setup;
  if (!t) return ContentService.createTextOutput('XNK HQ');
  try { requireSetupTicket_(t); } catch (err) { return ContentService.createTextOutput('Link siapkan XNK HQ sudah tidak berlaku. Buka lagi dari xnk.web.id/adminxnk.'); }
  setupPusat_();
  // Izin baru (Drive/Spreadsheet) TIDAK bisa diberikan lewat link web: Google hanya menampilkan layar izin di editor.
  if (!setupState_().auth) return ContentService.createTextOutput('Trigger XNK HQ sudah terpasang (cek harian 06:00 WIB, backup tiap jam, pembangun push tiap 10 menit), tetapi izin Google baru (Drive/Spreadsheet untuk backup) belum diberikan. Izin itu hanya bisa diberikan dari editor: buka ' + editorUrl_() + ' , pilih fungsi setupPusat, tekan Run, lalu Izinkan.');
  return ContentService.createTextOutput('XNK HQ siap: izin Google lengkap, cek harian 06:00 WIB, backup tiap jam dan pembangun push tiap 10 menit terpasang. Tutup tab ini dan kembali ke xnk.web.id/adminxnk.');
}

var PUSAT_SETUP_MS = 10 * 60 * 1000;
/** Tanda siap sekali pakai dari /adminxnk: "setup.<exp>.<hmac>", 10 menit. Bukan token sesi (tidak masuk riwayat). */
function setupTicket_() { var exp = String(Date.now() + PUSAT_SETUP_MS); return 'setup.' + exp + '.' + sign_('setup.' + exp); }
function requireSetupTicket_(t) {
  var p = String(t || '').split('.');
  var exp = Number(p[1]);
  if (p.length !== 3 || p[0] !== 'setup' || !exp || exp < Date.now() || !eq_(p[2], sign_('setup.' + p[1]))) throw new Error('Tanda siap tidak berlaku.');
}

/** Link editor Apps Script XNK HQ (tempat pemilik memberi izin baru). */
function editorUrl_() { try { return 'https://script.google.com/d/' + ScriptApp.getScriptId() + '/edit'; } catch (e) { return 'https://script.google.com/home'; } }

/** Izin Google + trigger yang dibutuhkan XNK HQ; untuk pita peringatan di /adminxnk. */
function setupState_() {
  var h = {};
  try { ScriptApp.getProjectTriggers().forEach(function (t) { h[t.getHandlerFunction()] = 1; }); } catch (e) { /* tanpa izin trigger */ }
  // Dicoba langsung ke Drive dengan token skrip ini: getAuthorizationInfo dari web app "Siapa saja" memeriksa
  // pengunjung anonim, jadi selalu "perlu izin" walau pemilik sudah memberi izin di editor. Hasil baik disimpan 10 menit.
  var c = CacheService.getScriptCache(), auth = c.get('auth-ok') === '1';
  if (!auth) {
    try { drive_('get', '?pageSize=1&fields=files(id)'); auth = true; c.put('auth-ok', '1', 600); } catch (e) { auth = false; }
  }
  var st = { auth: auth, daily: !!h.runPusatDaily, backup: !!h.runPusatBackup, pushKick: !!h.runPusatPushKick, editor: editorUrl_() };
  st.ok = st.auth && st.daily && st.backup && st.pushKick;
  return st;
}

// ── Login pemilik ────────────────────────────────────────────────────────────────────────────────────────────

function sign_(s) {
  var key = prop_('SESSION_SECRET');
  if (key.length < 32) throw new Error('XNK HQ belum disiapkan: jalankan setupPusat di editor.');
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
  if (want.length < 8) throw new Error('PIN XNK HQ belum diatur (Script Property PUSAT_PIN, minimal 8 karakter).');
  if (!eq_(String(pin || ''), want)) { fail(); throw new Error('PIN salah.'); }
  var exp = String(Date.now() + PUSAT_SESSION_MS);
  return { token: exp + '.' + sign_(exp), exp: Number(exp) };
}

// ── Pendaftaran coach (dipanggil wizard setup spreadsheet coach) ─────────────────────────────────────────────

/** Simpan coach: slug, link /exec, rahasia hubStatus. Hanya dengan kode daftar pemilik. */
function pusatRegister(code, slug, exec, secret) {
  var fail = guard_('enroll');
  var want = prop_('PUSAT_ENROLL_CODE');
  if (want.length < 8 || !eq_(String(code || ''), want)) { fail(); throw new Error('Kode daftar XNK HQ salah.'); }
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
function latestLib_(fresh) {
  var c = json_('LATEST_LIB', null);
  // fresh: salinan 1 jam bisa tertinggal dari tag baru (coach sudah di v52, salinan masih v51), jadi baca ulang.
  if (c && Date.now() - c.at < (fresh ? 60 * 1000 : 3600 * 1000)) return c;
  try {
    var repo = prop_('XNK_REPO', 'xnkzzxd/XNK');
    var res = fetch_('https://api.github.com/repos/' + repo + '/git/matching-refs/tags/lib-v', { muteHttpExceptions: true, headers: gh_() });
    if (res.getResponseCode() !== 200) return c;
    var best = null;
    JSON.parse(res.getContentText()).forEach(function (r) {
      var m = String(r.ref).match(/refs\/tags\/lib-v(\d+)$/);
      if (m && (!best || Number(m[1]) > best.version)) best = { version: Number(m[1]), obj: r.object };
    });
    if (!best) return c;
    var commit = best.obj.sha;
    if (best.obj.type === 'tag') {
      var t = fetch_('https://api.github.com/repos/' + repo + '/git/tags/' + best.obj.sha, { muteHttpExceptions: true, headers: gh_() });
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
  var res = fetch_(url, { method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: false });
  var code = res.getResponseCode(), at = url;
  if (code >= 300 && code < 400) {
    var h = (res.getHeaders && res.getHeaders()) || {};
    var loc = h.Location || h.location;
    if (!loc) throw new Error('HTTP ' + code + ' tanpa alamat pengalihan');
    at = loc;
    res = fetch_(loc, { muteHttpExceptions: true, followRedirects: true });
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

/** hub.json publik repo hub (disimpan 10 menit); {} bila tidak ada atau gagal dibaca. */
function hubJson_() {
  var c = CacheService.getScriptCache(), raw = c.get('hubjson');
  if (raw == null) {
    raw = '';
    try {
      var res = fetch_('https://raw.githubusercontent.com/' + prop_('HUB_REPO', 'xnkzzxd/xnk-template-site') + '/main/hub.json', { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) raw = res.getContentText();
    } catch (e) { raw = ''; }
    try { c.put('hubjson', raw, 600); } catch (e) { /* cache penuh: baca lagi lain kali */ }
  }
  try { var j = JSON.parse(raw); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; }
}

/** Link /exec coach di hub.json; kosong bila tidak ada. */
function hubExec_(slug) {
  var hit = (hubJson_().coaches || []).filter(function (x) { return x && x.slug === slug; })[0];
  return hit && PUSAT_EXEC_RE.test(String(hit.exec || '')) ? String(hit.exec) : '';
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
  // T-2252: coach keluar tidak diperbarui lagi; yang dicek hanya baca saja yang harus tetap menyala.
  if (outState_(slug)) {
    if (d.readonly !== true) st.problems.push('Coach keluar, tetapi mode baca saja belum menyala.');
    st.ok = st.problems.length === 0;
    return st;
  }
  if (latest && d.lib && d.lib.commit && d.lib.commit !== latest.commit) {
    // Commit coach beda dengan salinan "terbaru": mungkin coach justru lebih baru dari salinan itu.
    var fresh = latestLib_(true);
    if (fresh) { latest.version = fresh.version; latest.commit = fresh.commit; }
  }
  if (latest && d.lib && d.lib.commit && d.lib.commit !== latest.commit) st.problems.push('Library tertinggal (terbaru v' + latest.version + ').');
  if (!d.triggers || d.triggers.runReminderTick !== 1) st.problems.push('Trigger pengingat ' + (d.triggers && d.triggers.runReminderTick ? 'terpasang ' + d.triggers.runReminderTick + ' kali' : 'tidak terpasang') + '.');
  if (d.reminders && d.reminders.enabled) {
    var last = new Date(d.reminders.lastTickAt || 0).getTime();
    if (!last || Date.now() - last > PUSAT_TICK_LATE_MS) st.problems.push('Pengingat menyala tetapi tidak berjalan sejak ' + (last ? new Date(last).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'awal') + '.');
  }
  if (d.quota && typeof d.quota === 'object') {   // Library lama tanpa kuota = tidak dicek
    var lim = quotaLimits_(), names = { mail: 'Kuota email', fetch: 'Kuota UrlFetch', triggerMin: 'Menit trigger' };
    // Cek pagi: "hari ini" baru berisi beberapa jam, jadi hari kemarin yang penuh (quotaDays[0]) ikut dicek.
    var y = Array.isArray(d.quotaDays) && d.quotaDays[0] && typeof d.quotaDays[0] === 'object' ? d.quotaDays[0] : null;
    [['hari ini', d.quota], ['kemarin', y]].forEach(function (p) {
      if (!p[1]) return;
      Object.keys(names).forEach(function (k) {
        var v = Number(p[1][k]) || 0;
        if (v >= lim[k] * PUSAT_QUOTA_WARN) st.problems.push(names[k] + ' ' + p[0] + ' ' + v + ' dari ' + lim[k] + ' (≥ 70 %).');
      });
    });
  }
  st.ok = st.problems.length === 0;
  return st;
}

function checkAll_(only) {
  var all = json_('COACHES', {}), latest = latestLib_(), out = {};
  Object.keys(all).sort().forEach(function (slug) {
    if (only && slug !== only) return;
    var o = outState_(slug);
    if (o && o.done) return;   // T-2252: akun coach sudah dihapus pemilik; tidak ditanya lagi
    out[slug] = checkOne_(slug, all[slug], latest);
    props_().setProperty('ST_' + slug, JSON.stringify(out[slug]));
    histPush_(slug, out[slug]);
  });
  return out;
}

// T-2262: riwayat harian untuk grafik /adminxnk. Hanya angka (tanpa data klien), satu baris per hari WIB, 30 hari.
// Baris: [yyyy-mm-dd, klien aktif 30 hari, total klien, sesi selesai 7 hari, sesi 7 hari ke depan, email, UrlFetch,
// menit trigger, beres 1|0]. Cek ulang di hari yang sama menimpa baris hari itu. Gagal = angka null.
// Kuota di baris hari-hari sebelumnya ditimpa angka hari penuh dari quotaDays (cek pagi hanya melihat 00:00–06:00).
var PUSAT_HIST_DAYS = 30;
function histPush_(slug, st) {
  var d = st && st.data, day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  var n = function (v) { var x = Number(v); return v == null || !isFinite(x) ? null : x; };
  var q = d && d.quota && typeof d.quota === 'object' ? d.quota : {};
  var row = [day, n(d && d.clients && d.clients.active30d), n(d && d.clients && d.clients.total), n(d && d.sessions && d.sessions.done7d),
    n(d && d.sessions && d.sessions.next7d), n(q.mail), n(q.fetch), n(q.triggerMin), st && st.ok ? 1 : 0];
  var h = json_('HIST_' + slug, []);
  if (!Array.isArray(h)) h = [];
  h = h.filter(function (r) { return Array.isArray(r) && r[0] !== day; });
  // Hari-hari sebelumnya: angka kuota hari penuh dari coach (quotaDays) menimpa potongan pagi yang terekam dulu.
  (d && Array.isArray(d.quotaDays) ? d.quotaDays : []).forEach(function (x) {
    var dd = x && String(x.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dd) || dd >= day) return;
    var hit = h.filter(function (r) { return r[0] === dd; })[0];
    if (!hit) return;
    hit[5] = n(x.mail); hit[6] = n(x.fetch); hit[7] = n(x.triggerMin);
  });
  h.push(row);
  h.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  props_().setProperty('HIST_' + slug, JSON.stringify(h.slice(-PUSAT_HIST_DAYS)));
}

/** Trigger harian: periksa semua, email pemilik hanya bila ada masalah. */
function runPusatDaily() {
  var res = checkAll_();
  var all = json_('COACHES', {});
  // T-2243: alamat situs baru yang belum diterima coach (coach tidak menjawab saat ganti slug) dikirim lagi.
  Object.keys(all).forEach(function (s) {
    if (!prop_('SITEQ_' + s)) return;
    var r = siteSync_(s, all[s]);
    if (r.error) {
      if (!res[s]) res[s] = { ok: true, problems: [] };
      res[s].problems.push('Alamat baru belum diterima coach: ' + r.error);
      res[s].ok = false;
    }
  });
  var push = pushSyncAll_();
  Object.keys(push).forEach(function (s) {
    if (!push[s].error) return;
    if (!res[s]) res[s] = { ok: true, problems: [] };
    res[s].problems.push('Notifikasi push: ' + push[s].error);
    res[s].ok = false;
  });
  // T-2251: pengingat langganan, keadaan baca saja ke coach, masa tenggang / baca saja masuk email pemilik.
  var sub = subDaily_();
  Object.keys(sub).forEach(function (s) {
    if (!res[s]) res[s] = { ok: true, problems: [] };
    res[s].problems = res[s].problems.concat(sub[s]);
    res[s].ok = false;
  });
  // T-2252: coach keluar — pengingat hapus akun mulai H-3, backup akhir gagal, hub.json belum menandai tidak aktif.
  var outP = outDaily_();
  Object.keys(outP).forEach(function (s) {
    if (!res[s]) res[s] = { ok: true, problems: [] };
    res[s].problems = res[s].problems.concat(outP[s]);
    res[s].ok = false;
  });
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
  MailApp.sendEmail(to, 'XNK HQ: ' + bad.length + ' coach perlu dicek', lines.join('\n') + '\n\nDasbor: ' + hubUrl_() + '/adminxnk/');
  return { problems: bad.length };
}

// ── Untuk /adminxnk ──────────────────────────────────────────────────────────────────────────────────────────

/** Daftar coach + status terakhir (tanpa rahasia). */
function pusatOverview(token) {
  requireOwnerToken_(token);
  var all = json_('COACHES', {}), hub = hubUrl_(), hubCoaches = hubJson_().coaches || [];
  return {
    hub: hub,
    latest: latestLib_(),
    canAct: !!prop_('GITHUB_TOKEN'),
    quotaLimits: quotaLimits_(),
    fetchToday: fetchToday_(),
    push: { secret: prop_('PUSAT_PUSH_SECRET').length >= 32 },
    // T-2258: tempat latihan tiap coach di hub.json (juga yang belum terdaftar di sini), slug → {name, city} | null.
    places: hubCoaches.reduce(function (m, x) { if (x && PUSAT_SLUG_RE.test(String(x.slug))) m[x.slug] = hubPlace_(x.slug, hubCoaches); return m; }, {}),
    coaches: Object.keys(all).sort().map(function (slug) {
      return { slug: slug, exec: all[slug].exec, registeredAt: all[slug].at, panel: hub + '/' + slug + '/', klien: hub + '/' + slug + '/klien/', status: json_('ST_' + slug, null), hist: json_('HIST_' + slug, []), backup: backupView_(slug), push: pushView_(slug), sub: subView_(slug), plan: planView_(slug, subState_(slug)), out: outView_(slug, hubCoaches) };
    }),
    setup: setupState_(),
    money: moneyView_(),   // T-2264
    tiers: PUSAT_TIERS, setupPrices: PUSAT_SETUP,
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
  if (action === 'push-on' || action === 'push-off') { pushSet_(String(slug || ''), action === 'push-on'); return pusatOverview(token); }
  if (action === 'leave-undo' || action === 'leave-done') {   // T-2252: aktifkan lagi / akun coach sudah dihapus
    var leaveNote = action === 'leave-undo' ? leaveUndo_(String(slug || '')) : leaveDone_(String(slug || ''));
    var lov = pusatOverview(token);
    if (leaveNote) lov.notice = leaveNote;
    return lov;
  }
  if (/^sub-/.test(String(action))) {   // T-2251: langganan (tanpa GitHub)
    var subErr = subAction_(String(action), String(slug || ''));
    var ov = pusatOverview(token);
    if (subErr) ov.notice = subErr;
    return ov;
  }
  var t = prop_('GITHUB_TOKEN');
  if (!t) throw new Error('Token GitHub belum diatur di XNK HQ (Script Property GITHUB_TOKEN).');
  slug = String(slug || '');
  var wf, inputs;
  if (action === 'bangun') { wf = 'hub.yml'; inputs = { aksi: 'bangun' }; }
  else if (action === 'perbarui' || action === 'hubungkan') {
    if (slug && !PUSAT_SLUG_RE.test(slug)) throw new Error('Nama di alamat tidak valid.');
    if (action === 'hubungkan' && !slug) throw new Error('Pilih coach.');
    wf = 'coach.yml'; inputs = { aksi: action, slug: slug };
  } else throw new Error('Aksi tidak dikenal.');
  var repo = prop_('HUB_REPO', 'xnkzzxd/xnk-template-site');
  var res = fetch_('https://api.github.com/repos/' + repo + '/actions/workflows/' + wf + '/dispatches', {
    method: 'post', contentType: 'application/json', headers: gh_(), muteHttpExceptions: true, payload: JSON.stringify({ ref: 'main', inputs: inputs }),
  });
  if (res.getResponseCode() !== 204) throw new Error('GitHub menolak (' + res.getResponseCode() + '). Periksa token GitHub di XNK HQ.');
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

/** Panggil Drive REST v3; null bila 404. Galat membawa alasan Google (e.driveCode, e.reason) dan langkahnya. */
function drive_(method, path, body, step) {
  var o = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var res = fetch_(DRIVE_API + path, o), code = res.getResponseCode();
  if (code === 404) return null;
  if (code < 200 || code >= 300) throw driveErr_(code, res.getContentText(), step);
  var t = res.getContentText();
  return t ? JSON.parse(t) : {};
}

// Alasan Google yang berarti "berkas/folder ini bukan milik XNK HQ lagi" (izin drive.file hanya untuk berkas buatan
// proyek ini; folder lama dari proyek/izin sebelumnya ditolak 403 walau pemilik akun yang sama).
var DRIVE_NOT_MINE = ['appNotAuthorizedToFile', 'insufficientFilePermissions', 'forbidden'];

/** Galat Drive yang bisa dibaca pemilik: alasan Google + saran yang cocok (bukan selalu "setupPusat"). */
function driveErr_(code, text, step) {
  var reason = '', gmsg = '';
  try { var j = JSON.parse(text || '{}').error || {}; reason = String(((j.errors || [])[0] || {}).reason || j.status || ''); gmsg = String(j.message || ''); } catch (e) { /* bukan JSON */ }
  var hint = reason === 'storageQuotaExceeded' ? 'Penyimpanan Google penuh.'
    : /rateLimit|RateLimit|dailyLimit/.test(reason) ? 'Google membatasi sementara; dicoba lagi otomatis.'
    : reason === 'accessNotConfigured' || /has not been used|disabled/.test(gmsg) ? 'Drive API belum aktif di proyek Google XNK HQ.'
    : DRIVE_NOT_MINE.indexOf(reason) >= 0 ? 'Berkas/folder ini tidak bisa diakses XNK HQ; folder backup dibuat baru.'
    : code === 401 || reason === 'insufficientPermissions' || /insufficient authentication scopes/i.test(gmsg) ? 'Izin Drive kurang: jalankan setupPusat sekali lagi.'
    : gmsg ? gmsg.slice(0, 80) : '';
  var e = new Error('Drive menolak (' + code + (reason ? ' ' + reason : '') + ')' + (step ? ' saat ' + step : '') + '.' + (hint ? ' ' + hint : ''));
  e.driveCode = code; e.reason = reason;
  return e;
}
function driveNotMine_(e) { return !!(e && e.driveCode === 403 && DRIVE_NOT_MINE.indexOf(e.reason) >= 0); }
function driveTrash_(id) { drive_('patch', '/' + encodeURIComponent(id) + '?fields=id', { trashed: true }, 'membuang salinan lama'); }
function driveMkdir_(name, parent) {
  return drive_('post', '?fields=id', { name: name, mimeType: MIME_DIR, parents: parent ? [parent] : undefined }, 'membuat folder ' + name).id;
}

/** Folder XNK Backup/<slug> (ID disimpan; dibuat lagi bila hilang, di sampah, atau tidak bisa diakses XNK HQ lagi). */
function bkDir_(slug, fresh) {
  var dirs = fresh ? {} : (json_('BK_DIRS', {}) || {});
  var alive = function (id) {
    if (!id) return false;
    try { var f = drive_('get', '/' + encodeURIComponent(id) + '?fields=id,trashed', null, 'memeriksa folder backup'); return !!(f && !f.trashed); }
    catch (e) { if (driveNotMine_(e)) return false; throw e; }
  };
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
    // T-2252: coach keluar tidak dibackup mingguan lagi; hanya backup akhir yang belum jadi (dicoba lagi setelah gagal).
    var o = outState_(s);
    if (o && (o.done || !o.final || o.final.state === 'selesai')) return;
    if (o) ok = 0;
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
  outFinalMark_(cur.slug, 'gagal', msg);
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
  var run = Number(prop_('BK_RUN') || 0), r;
  if (run && Date.now() - run < PUSAT_BK_LOCK_MS) r = { busy: true };
  else {
    props_().setProperty('BK_RUN', String(Date.now()));
    try { r = backupStep_(); } finally { props_().deleteProperty('BK_RUN'); }
  }
  // T-2252: backup akhir coach keluar dijalankan terus (trigger sekali jalan ±1 menit) sampai selesai, tidak menunggu jam.
  if (!r.idle && !r.error && outPending_()) soonTrigger_();
  return r;
}

/** Trigger sekali jalan runPusatBackupSoon ±1 menit lagi (tidak dobel). */
function soonTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'runPusatBackupSoon'; });
  if (!has) ScriptApp.newTrigger('runPusatBackupSoon').timeBased().after(60 * 1000).create();
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
    outFinalMark_(slug, 'jalan', '');   // T-2252: backup akhir coach keluar sedang dibuat
    try {
      var list = bkAsk_(slug, all[slug], null);
      cur.sheets = (list.sheets || []).map(function (x) { return { name: String(x.name), rows: Number(x.rows) || 0 }; });
      if (!cur.sheets.length) throw new Error('Spreadsheet coach tanpa sheet.');
      cur.dir = bkDir_(slug);
      var day = new Date(t0 + 7 * 3600 * 1000).toISOString().slice(0, 10);   // tanggal WIB
      var mk = function () { return drive_('post', '?fields=id,webViewLink', { name: slug + ' ' + day, mimeType: MIME_SHEET, parents: [cur.dir] }, 'membuat salinan'); };
      var f;
      try { f = mk(); }
      catch (e) { if (!driveNotMine_(e)) throw e; cur.dir = bkDir_(slug, true); f = mk(); }   // folder lama bukan milik XNK HQ lagi: folder baru
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
  // T-2252: backup akhir coach keluar → folder Akhir + salinan Excel (sebelum pangkas, supaya tidak ikut dibuang).
  var fin = outFinalize_(cur);
  var pruned = 0;
  try { pruned = bkPrune_(cur.dir); } catch (e) { /* salinan lama dicoba lagi minggu depan */ }
  var done = { slug: cur.slug, done: true, rows: cur.rows, pruned: pruned };
  if (fin) done.final = fin;
  return done;
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
  soonTrigger_();
  return { started: 'backup', slug: slug, queued: true };
}

// ── Pemasangan (dijalankan pemilik dari editor) ─────────────────────────────────────────────────────────────

/** Sekali (dan lagi setelah izin baru): kunci sesi + trigger harian 06:00 WIB + trigger backup tiap jam + pembangun
 *  push tiap 10 menit (runPusatPushKick). Aman diulang.
 *  Dari editor, atau dari /adminxnk → "Siapkan XNK HQ" (doGet ?setup). */
function setupPusat() { return setupPusat_(); }
function setupPusat_() {
  if (prop_('SESSION_SECRET').length < 32) props_().setProperty('SESSION_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); if (h === 'runPusatDaily' || h === 'runPusatBackup' || h === 'runPusatPushKick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runPusatDaily').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Jakarta').create();
  ScriptApp.newTrigger('runPusatBackup').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('runPusatPushKick').timeBased().everyMinutes(PUSHKICK_EVERY_MIN).create();
  return 'XNK HQ siap (cek harian 06:00 WIB, backup tiap jam, pembangun push tiap ' + PUSHKICK_EVERY_MIN + ' menit). Isi PUSAT_PIN dan PUSAT_ENROLL_CODE di Script Properties bila belum, lalu terbitkan sebagai aplikasi web.';
}

// ── Web Push di hub (T-2240) ────────────────────────────────────────────────────────────────────────────────
// Satu pasang kunci VAPID untuk seluruh xnk.web.id: kunci publik di hub.json (vapidPublic), kunci privat hanya di secret
// repo hub (HUB_VAPID_PRIVATE). XNK HQ membagikan kunci publik ke coach lewat hubPushKey(rahasia hub, kunci, menyala)
// setiap pagi dan saat pemilik menekan "Nyalakan/Matikan push" di /adminxnk; jawabannya membawa rahasia relay coach.
// Workflow Push XNK (repo hub, tiap 5 menit) memanggil pusatPushTargets(PUSAT_PUSH_SECRET) sekali per putaran: daftar
// {slug, exec, relay} coach yang menyala, lalu memanggil pushRelayPull/pushRelayAck tiap coach langsung. Jadi:
//   - XNK HQ tidak memakai UrlFetch per putaran kirim (20 coach × 12 putaran/jam tetap 0 fetch); hanya 2 fetch per
//     coach menyala per hari (dan per tombol), plus hub.json yang disimpan 10 menit.
//   - HUB_SECRET (yang membuka hubExport = data penuh) tidak pernah keluar dari sini; rahasia relay hanya membuka antrean push.
// Coach mati dan belum pernah menyala tidak pernah dihubungi.

/** Status push coach yang tersimpan: {on, active, relay, exec, subs, at, error}. */
function pushState_(slug) { return json_('PUSH_' + slug, null) || {}; }
function pushView_(slug) {
  var p = pushState_(slug);
  return { on: !!p.on, active: !!p.active, subs: Number(p.subs) || 0, at: p.at || '', error: p.error || '' };
}

/** Kunci publik VAPID hub dari hub.json; kosong bila belum dibuat (workflow Push XNK aksi "kunci"). */
function hubVapid_() {
  var k = String(hubJson_().vapidPublic || '');
  return /^B[A-Za-z0-9_-]{86}$/.test(k) ? k : '';
}

/** Kirim kunci + pilihan menyala ke satu coach (2 fetch), simpan hasilnya. */
function pushSync_(slug, c, key) {
  var p = pushState_(slug), exec = hubExec_(slug) || c.exec;
  p.at = new Date().toISOString();
  try {
    if (!key) throw new Error('Kunci publik hub belum ada (jalankan workflow Push XNK aksi "kunci").');
    var j = askApps_(exec, { fn: 'hubPushKey', args: [c.secret, key, !!p.on] });
    if (j && j.code === 'unknown_fn') throw new Error('Library coach belum punya hubPushKey; perbarui coach.');
    if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'tanpa jawaban');
    var d = j.data || {};
    if (p.on && (typeof d.relay !== 'string' || d.relay.length < 24)) throw new Error('Jawaban coach tanpa rahasia relay.');
    p.active = !!d.on;
    if (typeof d.relay === 'string' && d.relay.length >= 24) p.relay = d.relay;
    p.exec = exec;
    p.subs = Number(d.subs) || 0;
    p.error = '';
  } catch (e) {
    p.error = String(e && e.message ? e.message : e).slice(0, 160);
  }
  props_().setProperty('PUSH_' + slug, JSON.stringify(p));
  return p;
}

/** Semua coach yang menyala (atau masih aktif dan perlu dimatikan). Coach yang tidak pernah menyala dilewati. */
function pushSyncAll_() {
  var all = json_('COACHES', {}), out = {}, key = null;
  Object.keys(all).sort().forEach(function (slug) {
    var p = pushState_(slug);
    if (!p.on && !p.active) return;
    if (key === null) key = hubVapid_();
    out[slug] = pushSync_(slug, all[slug], key);
  });
  return out;
}

/** Tombol /adminxnk: nyalakan/matikan push satu coach, langsung dikirim ke coach itu. */
function pushSet_(slug, on) {
  var all = json_('COACHES', {});
  if (!PUSAT_SLUG_RE.test(slug) || !all[slug]) throw new Error('Coach tidak terdaftar.');
  if (on && outState_(slug)) throw new Error('Coach ini sudah keluar. Tekan "Aktifkan lagi" dulu.');
  var key = hubVapid_();
  if (on && !key) throw new Error('Kunci publik hub belum ada. Jalankan workflow Push XNK di repo hub dengan aksi "kunci" dulu.');
  var p = pushState_(slug);
  p.on = !!on;
  props_().setProperty('PUSH_' + slug, JSON.stringify(p));
  var r = pushSync_(slug, all[slug], key);
  if (r.error) throw new Error('Pilihan disimpan, tetapi coach belum menerimanya: ' + r.error);
  return pushView_(slug);
}

/**
 * Untuk workflow Push XNK (repo hub). Dijaga PUSAT_PUSH_SECRET (min 32, perbandingan waktu-konstan). Tanpa UrlFetch.
 * @return {{coaches: Array<{slug: string, exec: string, relay: string}>}}
 */
function pusatPushTargets(pushSecret) {
  var want = prop_('PUSAT_PUSH_SECRET');
  if (want.length < 32 || !eq_(String(pushSecret == null ? '' : pushSecret), want)) throw new Error('Permintaan tidak valid.');
  return { coaches: pushTargets_() };
}

/** Coach yang push-nya menyala dan siap dikirimi: [{slug, exec, relay}]. Satu sumber untuk pusatPushTargets dan pembangun. */
function pushTargets_() {
  var all = json_('COACHES', {});
  return Object.keys(all).sort().map(function (slug) {
    var p = pushState_(slug);
    if (outState_(slug)) return null;   // T-2252: coach keluar tidak pernah dikirimi push
    return p.on && p.active && p.relay && PUSAT_EXEC_RE.test(String(p.exec || '')) ? { slug: slug, exec: p.exec, relay: p.relay } : null;
  }).filter(Boolean);
}

// ── Pembangun Push XNK (2026-11-25) ─────────────────────────────────────────────────────────────────────────
// Jadwal "tiap 5 menit" GitHub sering tertunda berjam-jam (audit 2026-11-25: Push XNK hanya ±3–4 kali sehari), padahal
// pesan push coach baru dibuat saat workflow memanggil pushRelayPull. Jam Google tepat waktu: trigger ini (tiap 10 menit,
// dipasang setupPusat) menjalankan workflow Push XNK lewat workflow_dispatch, hanya 05:00–22:59 WIB dan hanya bila ada
// coach yang push-nya menyala. Cron di workflow tetap jadi cadangan; concurrency "push" di sana mencegah kiriman ganda.
var PUSHKICK_EVERY_MIN = 10;
var PUSHKICK_HOURS = [5, 23];   // jam WIB [mulai, selesai) — 05:00 sampai 22:59

function runPusatPushKick() {
  var hour = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
  if (hour < PUSHKICK_HOURS[0] || hour >= PUSHKICK_HOURS[1]) return { skipped: 'jam' };
  if (!prop_('GITHUB_TOKEN')) return { skipped: 'token' };
  if (!pushTargets_().length) return { skipped: 'mati' };
  var code = 0;
  try {
    var repo = prop_('HUB_REPO', 'xnkzzxd/xnk-template-site');
    var res = fetch_('https://api.github.com/repos/' + repo + '/actions/workflows/push.yml/dispatches', {
      method: 'post', contentType: 'application/json', headers: gh_(), muteHttpExceptions: true,
      payload: JSON.stringify({ ref: 'main', inputs: { aksi: 'kirim' } }),
    });
    code = res.getResponseCode();
  } catch (e) { code = -1; }
  if (code !== 204) props_().setProperty('PUSHKICK_LAST', JSON.stringify({ at: new Date().toISOString(), code: code }));
  else props_().deleteProperty('PUSHKICK_LAST');
  return { started: code === 204, code: code };
}

// ── Ganti slug coach (T-2243) ───────────────────────────────────────────────────────────────────────────────
// /adminxnk → Ganti slug: XNK HQ memindahkan semua yang memakai slug sebagai kunci (pendaftaran, status, backup, push),
// mengganti nama folder backup, mengirim alamat situs baru ke coach (hubSiteUrl, dijaga HUB_SECRET), lalu menjalankan
// workflow Hub XNK aksi ganti-slug (hub.json: slug lama jadi alamat pengalih, awalan penyimpanan dan secret clasp tetap).
// Pemeriksaan nama sama dengan tools/build-hub.js (RESERVED dicek sama oleh tests/pusat.test.js).

var PUSAT_RESERVED = ['_hub', '_lib', '_app', 'adminxnk', 'admin', 'api', 'app', 'klien', 'demo', 'l', 'login', 'daftar', 'masuk', 'assets', 'static', 'www', 'xnk', 'hub',
  'index', '404', 'cname', 'img', 'fonts', 'coach', 'coaches', 'support', 'help', 'bantuan', 'legacy', 'next'];
var PUSAT_SLUG_KEYS = ['ST_', 'HIST_', 'BKST_', 'BKNOW_', 'PUSH_', 'SITEQ_', 'SUB_', 'OUT_'];

/** Kirim SITEQ_<slug> (alamat situs baru) ke coach; berhasil = antrean dihapus. {ok} atau {error}. */
function siteSync_(slug, c) {
  var url = prop_('SITEQ_' + slug);
  if (!url) return { ok: true };
  try {
    var j = askApps_(hubExec_(slug) || c.exec, { fn: 'hubSiteUrl', args: [c.secret, url] });
    if (j && j.code === 'unknown_fn') throw new Error('Library coach belum punya hubSiteUrl; perbarui coach (dicoba lagi besok pagi).');
    if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'tanpa jawaban');
    props_().deleteProperty('SITEQ_' + slug);
    return { ok: true, siteUrl: url };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e).slice(0, 160) };
  }
}

/**
 * Ganti slug coach. Hanya pemilik (token /adminxnk).
 * @return {{slug: string, from: string, site: string, folder: string, hub: string}} site/folder/hub = 'ok' | pesan
 */
function pusatRename(token, oldSlug, newSlug) {
  requireOwnerToken_(token);
  var from = String(oldSlug == null ? '' : oldSlug).trim(), to = String(newSlug == null ? '' : newSlug).trim().toLowerCase();
  if (!PUSAT_SLUG_RE.test(to) || /--/.test(to)) throw new Error('Nama baru tidak valid: huruf kecil, angka dan tanda hubung, 3 sampai 30 karakter.');
  if (PUSAT_RESERVED.indexOf(to) !== -1) throw new Error('Nama "' + to + '" dipakai sistem; pilih nama lain.');
  if (to === from) throw new Error('Nama baru sama dengan nama sekarang.');
  // Nama yang sudah dipakai coach lain di hub.json (slug atau alamat lama) ditolak. Kembali ke alamat lama sendiri boleh.
  var hubCoaches = hubJson_().coaches || [];
  var mine = hubCoaches.filter(function (x) { return x && (x.slug === from || x.slug === to && (x.aliases || []).indexOf(from) !== -1); })[0];
  hubCoaches.forEach(function (x) {
    if (!x || x === mine) return;
    if (x.slug === to || (x.aliases || []).indexOf(to) !== -1) throw new Error('Nama "' + to + '" sudah dipakai coach "' + x.slug + '" di hub.');
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var c;
  try {
    var all = json_('COACHES', {});
    if (!PUSAT_SLUG_RE.test(from) || !all[from]) throw new Error('Coach tidak terdaftar.');
    if (all[to]) throw new Error('Nama "' + to + '" sudah terdaftar di XNK HQ.');
    c = all[from];
    all[to] = c;
    delete all[from];
    props_().setProperty('COACHES', JSON.stringify(all));
    PUSAT_SLUG_KEYS.forEach(function (k) {
      var v = props_().getProperty(k + from);
      if (v != null) props_().setProperty(k + to, v);
      props_().deleteProperty(k + from);
    });
    var cur = json_('BK_CUR', null);
    if (cur && cur.slug === from) { cur.slug = to; bkSave_(cur); }   // backup yang sedang berjalan lanjut dengan nama baru
    var dirs = json_('BK_DIRS', null);
    if (dirs && dirs[from]) { dirs[to] = dirs[from]; delete dirs[from]; props_().setProperty('BK_DIRS', JSON.stringify(dirs)); }
    props_().setProperty('SITEQ_' + to, hubUrl_() + '/' + to);
  } finally { lock.releaseLock(); }

  var out = { slug: to, from: from, site: 'ok', folder: 'ok', hub: 'ok' };
  // Folder backup ikut berganti nama (ID tetap, salinan lama tetap di dalamnya). Gagal = folder lama tetap dipakai.
  var dirId = (json_('BK_DIRS', {}) || {})[to];
  if (!dirId) out.folder = 'Belum ada folder backup.';
  else { try { drive_('patch', '/' + encodeURIComponent(dirId) + '?fields=id', { name: to }); } catch (e) { out.folder = 'Nama folder tetap "' + from + '" (' + String(e && e.message ? e.message : e).slice(0, 100) + '); backup tetap masuk ke sana.'; } }
  var r = siteSync_(to, c);
  if (r.error) out.site = r.error + ' Dicoba lagi tiap pagi.';
  // hub.json: lewat workflow Hub XNK, kecuali sudah diganti di sana (pemilik menjalankan workflow itu lebih dulu).
  if (mine && mine.slug === to) out.hub = 'hub.json sudah memakai nama baru.';
  else if (!prop_('GITHUB_TOKEN')) out.hub = 'Jalankan sendiri: repo hub → Actions → Hub XNK → aksi ganti-slug, slug ' + from + ', slug_baru ' + to + '.';
  else {
    try {
      hubDispatch_({ aksi: 'ganti-slug', slug: from, slug_baru: to });
    } catch (e) {
      out.hub = String(e && e.message ? e.message : e).slice(0, 100) + '. Jalankan sendiri: Hub XNK → aksi ganti-slug, slug ' + from + ', slug_baru ' + to + '.';
    }
  }
  return out;
}

// ── Langganan bulanan (T-2251) ──────────────────────────────────────────────────────────────────────────────
// Per coach: paket (gratis | bulanan), harga Rp, jatuh tempo (YYYY-MM-DD, WIB), email coach, riwayat bayar, dan sakelar
// baca saja (auto | on | off). Disimpan di SUB_<slug>. Coach TANPA baris = gratis = tidak pernah baca saja (bawaan untuk
// semua coach lama). Bulanan: H-7 dan H-1 email pengingat ke coach (kosong = email pemilik); 7 hari tenggang setelah jatuh
// tempo, lalu baca saja (situs tidak pernah dihapus). Pemilik bisa menyalakan/mematikan baca saja kapan saja (on/off
// menimpa hitungan otomatis; "Tandai lunas" memajukan jatuh tempo satu bulan dan kembali ke otomatis).
// Keadaan dikirim ke coach lewat hubReadonly(HUB_SECRET, menyala, catatan) saat berubah dan di cek harian.

var PUSAT_SUB_GRACE_DAYS = 7;
var PUSAT_SUB_STARTER_DAYS = 14;      // Fase AF: sesudah tenggang, 14 hari batas Starter, baru baca saja
var PUSAT_SUB_REMIND = [7, 1];          // email pengingat H-7 dan H-1
var PUSAT_SUB_HISTORY = 24;             // (lama) riwayat bayar langganan
var PUSAT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// T-2264: paket dan harga dari "XNK Proposal Coach" (29 Okt 2026). UBAH BERSAMA proposal dan
// xnk-library/tools/hub-harga.js (harga di halaman depan xnk.web.id, T-2265; tests/hub.test.js membandingkan keduanya).
// Harga hanya bawaan saat paket dipilih; pemilik boleh mengisi harga lain per coach.
var PUSAT_TIERS = {
  starter: { name: 'Starter', bulanan: 149000, tahunan: 1490000, lifetime: 3900000, putus: 2900000 },
  pro: { name: 'Pro', bulanan: 249000, tahunan: 2490000, lifetime: 6900000, putus: 4900000 },
  studio: { name: 'Studio', bulanan: 549000, tahunan: 5490000, lifetime: 14900000, putus: 10900000 },
};
var PUSAT_TIER_KEYS = ['gratis', 'starter', 'pro', 'studio', 'lain'];
var PUSAT_CYCLES = ['bulanan', 'tahunan', 'lifetime', 'putus'];   // bulanan/tahunan punya jatuh tempo; lifetime/putus sekali bayar
var PUSAT_SETUP = { standar: 400000, custom: 2100000 };
var PUSAT_PAY_KINDS = ['langganan', 'setup', 'lifetime', 'putus'];
var PUSAT_PAY_KEEP = 60;                // catatan pembayaran yang disimpan per coach

/** Tanggal hari ini (WIB) sebagai YYYY-MM-DD. */
function todayWib_() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
/** Selisih hari b − a (keduanya YYYY-MM-DD). */
function dayDiff_(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
/** Tanggal yang sama bulan berikutnya; 31 Jan → 28/29 Feb. */
function addMonth_(d) { return addMonths_(d, 1); }
/** Tanggal yang sama n bulan kemudian (hari dipotong ke akhir bulan). */
function addMonths_(d, n) {
  var y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1 + n, day = Number(d.slice(8, 10));
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12 + 1;
  var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + Math.min(day, last)).slice(-2);
}
/** Paket dari harga bulanan (data lama tanpa `tier`). */
function tierFromPrice_(price) {
  var hit = ['starter', 'pro', 'studio'].filter(function (k) { return PUSAT_TIERS[k].bulanan === price; })[0];
  return hit || 'lain';
}
/** plan turunan: bulanan = ada jatuh tempo (bulanan/tahunan), sekali = lifetime/beli putus, gratis. */
function planOf_(tier, cycle) { return tier === 'gratis' ? 'gratis' : (cycle === 'bulanan' || cycle === 'tahunan') ? 'bulanan' : 'sekali'; }
function validDate_(d) { return PUSAT_DATE_RE.test(String(d || '')) && !isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d; }

/**
 * Data langganan tersimpan; tanpa baris = gratis. T-2264: `tier` (paket proposal), `cycle` (cara bayar), `setup`, dan
 * `pay` (semua pembayaran). Data lama {plan, price, history} dibaca apa adanya: plan bulanan → cycle bulanan, paket
 * ditebak dari harga, history → pay jenis langganan. Bentuk baru ditulis pada simpan berikutnya.
 */
function subState_(slug) {
  var s = json_('SUB_' + slug, null);
  if (!s || typeof s !== 'object') s = {};
  var price = Math.max(0, Math.floor(Number(s.price) || 0));
  var tier = PUSAT_TIER_KEYS.indexOf(s.tier) !== -1 ? s.tier : s.plan === 'bulanan' ? tierFromPrice_(price) : 'gratis';
  var cycle = PUSAT_CYCLES.indexOf(s.cycle) !== -1 ? s.cycle : 'bulanan';
  var pay = Array.isArray(s.pay) ? s.pay : (Array.isArray(s.history) ? s.history : []).map(function (h) {
    return { at: String(h.at || ''), date: String(h.at || '').slice(0, 10), amount: Math.max(0, Math.floor(Number(h.price) || 0)), kind: 'langganan', due: h.due || '', next: h.next || '', note: '' };
  });
  var su = s.setup && typeof s.setup === 'object' ? s.setup : {};
  var sk = su.kind === 'standar' || su.kind === 'custom' ? su.kind : 'none';
  return {
    tier: tier, cycle: cycle, plan: planOf_(tier, cycle),
    price: price,
    due: validDate_(s.due) ? s.due : '',
    email: String(s.email || ''),
    ro: s.ro === 'on' || s.ro === 'off' ? s.ro : 'auto',
    setup: { kind: sk, price: Math.max(0, Math.floor(Number(su.price) || 0)), paidAt: validDate_(su.paidAt) ? su.paidAt : '' },
    pay: pay.filter(function (x) { return x && typeof x === 'object'; }),
    sent: s.sent && typeof s.sent === 'object' ? s.sent : {},
    pushed: s.pushed && typeof s.pushed === 'object' ? s.pushed : null,
  };
}
function subSave_(slug, s) {
  s.pay = (s.pay || []).slice(-PUSAT_PAY_KEEP);
  delete s.history;
  props_().setProperty('SUB_' + slug, JSON.stringify(s));
}
/** Pembayaran langganan saja, bentuk lama {at, due, next, price} (untuk tampilan dan tes lama). */
function subHistory_(s) {
  return (s.pay || []).filter(function (p) { return p.kind === 'langganan'; }).map(function (p) { return { at: p.at, due: p.due || '', next: p.next || '', price: p.amount }; });
}

/**
 * Hitung status (murni). gratis/tanpa jatuh tempo = tidak pernah baca saja kecuali pemilik menyalakannya sendiri.
 * @return {{state: string, days: ?number, graceLeft: ?number, readonly: boolean, manual: string}}
 *   state: gratis | aktif | segera (≤ 7 hari) | tenggang (lewat, ≤ 7 hari) | lewat (baca saja otomatis)
 *          | lunas / belum (lifetime atau beli putus: sekali bayar, tidak pernah baca saja karena tanggal)
 */
function subStatus_(s, today) {
  var out = { state: 'gratis', days: null, graceLeft: null, readonly: false, manual: s.ro };
  if (s.plan === 'bulanan' && s.due) {
    var days = dayDiff_(today, s.due);
    out.days = days;
    if (days > PUSAT_SUB_REMIND[0]) out.state = 'aktif';
    else if (days >= 0) out.state = 'segera';
    else if (-days <= PUSAT_SUB_GRACE_DAYS) { out.state = 'tenggang'; out.graceLeft = PUSAT_SUB_GRACE_DAYS + days; }
    else if (-days <= PUSAT_SUB_GRACE_DAYS + PUSAT_SUB_STARTER_DAYS) { out.state = 'turun'; out.graceLeft = PUSAT_SUB_GRACE_DAYS + PUSAT_SUB_STARTER_DAYS + days; }
    else { out.state = 'lewat'; out.readonly = true; }
  } else if (s.plan === 'bulanan') out.state = 'aktif';
  else if (s.plan === 'sekali') out.state = (s.pay || []).some(function (p) { return p.kind === s.cycle; }) ? 'lunas' : 'belum';   // lifetime / beli putus
  if (s.ro === 'on') out.readonly = true;
  if (s.ro === 'off') out.readonly = false;
  return out;
}

/** Catatan singkat untuk pita coach (tanpa angka uang). */
function subNote_(s, st) {
  if (!st.readonly) return '';
  if (s.ro === 'on') return 'Dinyalakan oleh pengelola XNK.';
  return 'Langganan lewat jatuh tempo ' + s.due + '.';
}

/** Untuk /adminxnk: tanpa rahasia. */
function subView_(slug) {
  var s = subState_(slug), st = subStatus_(s, todayWib_());
  return {
    plan: s.plan, tier: s.tier, tierName: (PUSAT_TIERS[s.tier] || {}).name || (s.tier === 'lain' ? 'Lainnya' : 'Gratis'), cycle: s.cycle,
    price: s.price, due: s.due, email: s.email, ro: s.ro,
    state: st.state, days: st.days, graceLeft: st.graceLeft, readonly: st.readonly,
    setup: s.setup, pay: s.pay.slice(-10),
    history: subHistory_(s).slice(-6),
    pushed: s.pushed ? { on: !!s.pushed.on, at: s.pushed.at || '', error: s.pushed.error || '' } : null,
  };
}

/**
 * Kirim keadaan baca saja ke coach bila perlu: berubah, galat sebelumnya, atau `force` (cek harian, coach bulanan).
 * Coach gratis yang belum pernah dikirimi apa pun tidak dihubungi. Mengembalikan state pushed (atau null bila dilewati).
 */
function subSync_(slug, c, force) {
  var s = subState_(slug), w = roWant_(slug, s), p = s.pushed;
  var need = !p ? w.on : (!!p.on !== w.on || (p.note || '') !== w.note || !!p.left !== w.left || !!p.error || (force && (s.plan === 'bulanan' || p.on)));
  if (!need) return null;
  var out = { on: w.on, note: w.note, left: w.left, at: new Date().toISOString(), error: '' };
  try {
    var j = askApps_(hubExec_(slug) || c.exec, { fn: 'hubReadonly', args: w.left ? [c.secret, w.on, w.note, true] : [c.secret, w.on, w.note] });
    if (j && j.code === 'unknown_fn') throw new Error('Library coach belum punya hubReadonly; perbarui coach.');
    if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'tanpa jawaban');
    if (!!(j.data && j.data.on) !== w.on) throw new Error('Coach menjawab keadaan lain.');
  } catch (e) {
    out.error = String(e && e.message ? e.message : e).slice(0, 160);
  }
  s = subState_(slug);   // baca lagi: hanya pushed yang diganti
  s.pushed = out;
  subSave_(slug, s);
  return out;
}

/**
 * Keadaan baca saja yang harus ada di coach: coach keluar (T-2252) selalu menyala dengan tanda keluar, menimpa langganan
 * dan sakelar tangan; selain itu hitungan langganan (T-2251).
 */
function roWant_(slug, s) {
  var o = outState_(slug);
  if (o) return { on: true, note: PUSAT_OUT_NOTE, left: true };
  var st = subStatus_(s || subState_(slug), todayWib_());
  return { on: st.readonly, note: subNote_(s || subState_(slug), st), left: false };
}

/** Email pengingat H-7 / H-1 (sekali per jatuh tempo per jenis). */
function subRemind_(slug) {
  if (outState_(slug)) return '';   // T-2252: coach keluar tidak ditagih
  var s = subState_(slug), st = subStatus_(s, todayWib_());
  if (s.plan !== 'bulanan' || !s.due || st.days == null || st.days < 0) return '';
  var kind = st.days <= PUSAT_SUB_REMIND[1] ? PUSAT_SUB_REMIND[1] : st.days <= PUSAT_SUB_REMIND[0] ? PUSAT_SUB_REMIND[0] : 0;
  if (!kind) return '';
  var key = s.due + '|' + kind;
  if (s.sent[key]) return '';
  // H-1 sudah terkirim = H-7 tidak dikirim lagi (mis. jatuh tempo diubah mendadak).
  if (kind === PUSAT_SUB_REMIND[0] && s.sent[s.due + '|' + PUSAT_SUB_REMIND[1]]) return '';
  var to = s.email || prop_('PUSAT_EMAIL') || Session.getEffectiveUser().getEmail();
  var name = String(((hubJson_().coaches || []).filter(function (x) { return x && x.slug === slug; })[0] || {}).name || slug);
  var when = st.days === 0 ? 'hari ini' : st.days === 1 ? 'besok' : st.days + ' hari lagi';
  var paket = ((PUSAT_TIERS[s.tier] || {}).name ? ' (paket ' + PUSAT_TIERS[s.tier].name + ', ' + s.cycle + ')' : s.cycle === 'tahunan' ? ' (tahunan)' : '');
  var body = 'Halo ' + name + ',\n\nLangganan XNK Coach' + paket + ' untuk ' + hubUrl_() + '/' + slug + '/ jatuh tempo ' + when + ' (' + s.due + ')' +
    (s.price ? ', sebesar Rp ' + s.price.toLocaleString('id-ID') : '') + '.\n\n' +
    'Setelah jatuh tempo ada masa tenggang ' + PUSAT_SUB_GRACE_DAYS + ' hari. Bila belum diperpanjang, aplikasi masuk mode baca saja: ' +
    'semua data tetap aman dan bisa dilihat, tetapi belum bisa diubah. Situs tidak pernah dihapus.\n\nTerima kasih.\nXNK';
  MailApp.sendEmail(to, 'XNK: langganan ' + name + ' jatuh tempo ' + when, body);
  s.sent[key] = new Date().toISOString();
  Object.keys(s.sent).forEach(function (k) { if (!validDate_(k.slice(0, 10)) || dayDiff_(k.slice(0, 10), todayWib_()) > 60) delete s.sent[k]; });
  subSave_(slug, s);
  return to;
}

/** Bagian cek harian: pengingat, kirim keadaan, masalah untuk email pemilik. {slug: [masalah]} */
function subDaily_() {
  var all = json_('COACHES', {}), out = {};
  Object.keys(all).sort().forEach(function (slug) {
    var probs = [], o = outState_(slug);
    if (o && o.done) return;   // T-2252: akun coach sudah dihapus
    try { subRemind_(slug); } catch (e) { probs.push('Email pengingat langganan gagal (' + String(e && e.message ? e.message : e).slice(0, 100) + ').'); }
    var r = subSync_(slug, all[slug], true);
    if (r && r.error) probs.push('Mode baca saja belum diterima coach: ' + r.error);
    var pr = planSync_(slug, all[slug], true);
    if (pr && pr.error) probs.push('Paket belum diterima coach: ' + pr.error);
    if (!o && st0_(slug) === 'turun') probs.push('Langganan lewat tenggang; coach memakai batas Starter.');
    var st = subStatus_(subState_(slug), todayWib_());
    if (!o && st.state === 'tenggang') probs.push('Langganan lewat jatuh tempo; masa tenggang ' + st.graceLeft + ' hari lagi.');
    if (probs.length) out[slug] = probs;
  });
  return out;
}

/**
 * Simpan pengaturan langganan dari /adminxnk. Hanya pemilik.
 * data: {tier, cycle, price, due, email, setupKind, setupPrice} (T-2264); bentuk lama {plan: gratis|bulanan, …} tetap diterima.
 * Harga kosong = harga proposal untuk paket + cara bayar itu.
 * @return {Object} pusatOverview
 */
function pusatSubSave(token, slug, data) {
  requireOwnerToken_(token);
  slug = String(slug || '');
  var all = json_('COACHES', {});
  if (!PUSAT_SLUG_RE.test(slug) || !all[slug]) throw new Error('Coach tidak terdaftar.');
  if (outState_(slug)) throw new Error('Coach ini sudah keluar; langganan tidak bisa diubah. Tekan "Aktifkan lagi" dulu.');
  data = data && typeof data === 'object' ? data : {};
  var rupiah = function (v, what) {
    var n = Number(String(v == null ? '' : v).replace(/[.\s]/g, '') || 0);
    if (!isFinite(n) || n < 0 || Math.floor(n) !== n || n > 100000000) throw new Error(what + ' harus bilangan bulat Rp.');
    return n;
  };
  var tier, cycle = PUSAT_CYCLES.indexOf(data.cycle) !== -1 ? data.cycle : 'bulanan';
  if (data.tier != null && data.tier !== '') {
    if (PUSAT_TIER_KEYS.indexOf(data.tier) === -1) throw new Error('Pilih paket: gratis, Starter, Pro, Studio atau lainnya.');
    tier = data.tier;
  } else if (data.plan === 'gratis') tier = 'gratis';
  else if (data.plan === 'bulanan') tier = null;   // bentuk lama: paket ditebak dari harga di bawah
  else throw new Error('Pilih paket: gratis atau bulanan.');
  var priceRaw = String(data.price == null ? '' : data.price).trim();
  var price = rupiah(priceRaw, 'Harga');
  if (tier === null) tier = tierFromPrice_(price);
  if (!priceRaw && PUSAT_TIERS[tier]) price = PUSAT_TIERS[tier][cycle];
  var plan = planOf_(tier, cycle);
  var due = String(data.due || '').trim();
  if (due && !validDate_(due)) throw new Error('Tanggal jatuh tempo tidak valid.');
  if (plan === 'bulanan' && !due) throw new Error('Isi tanggal jatuh tempo untuk paket ' + cycle + '.');
  var email = String(data.email || '').trim();
  if (email && (email.length > 120 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email))) throw new Error('Email coach tidak valid.');
  var s = subState_(slug);
  if (data.setupKind != null) {
    var sk = data.setupKind === 'standar' || data.setupKind === 'custom' ? data.setupKind : data.setupKind === 'none' || data.setupKind === '' ? 'none' : null;
    if (!sk) throw new Error('Jenis setup tidak dikenal.');
    var spRaw = String(data.setupPrice == null ? '' : data.setupPrice).trim();
    s.setup = { kind: sk, price: sk === 'none' ? 0 : spRaw ? rupiah(spRaw, 'Biaya setup') : PUSAT_SETUP[sk], paidAt: sk === 'none' ? '' : s.setup.paidAt };
  }
  s.tier = tier; s.cycle = cycle; s.plan = plan; s.price = price; s.due = plan === 'bulanan' ? due : ''; s.email = email;
  subSave_(slug, s);
  subSync_(slug, all[slug], false);
  planSync_(slug, all[slug], false);
  brandSync_(slug);
  return pusatOverview(token);
}

/**
 * Catat pembayaran (T-2264, "Tandai lunas" di /adminxnk). Hanya pemilik.
 * data: {kind: langganan|setup|lifetime|putus, amount (kosong = harga), date (YYYY-MM-DD, kosong = hari ini WIB), note}.
 * langganan memajukan jatuh tempo 1 bulan (bulanan) atau 12 bulan (tahunan) dan mengembalikan baca saja ke otomatis.
 * @return {Object} pusatOverview (+ notice bila coach belum menerima keadaan baca saja)
 */
function pusatSubPay(token, slug, data) {
  requireOwnerToken_(token);
  var notice = subPay_(String(slug || ''), data && typeof data === 'object' ? data : {});
  var ov = pusatOverview(token);
  if (notice) ov.notice = notice;
  return ov;
}

/** Inti pencatatan pembayaran; mengembalikan pesan bila coach belum menerima keadaan baca saja. */
function subPay_(slug, data) {
  var all = json_('COACHES', {});
  if (!PUSAT_SLUG_RE.test(slug) || !all[slug]) throw new Error('Coach tidak terdaftar.');
  if (outState_(slug)) throw new Error('Coach ini sudah keluar; langganan tidak bisa diubah. Tekan "Aktifkan lagi" dulu.');
  var kind = data.kind || 'langganan';
  if (PUSAT_PAY_KINDS.indexOf(kind) === -1) throw new Error('Jenis pembayaran tidak dikenal.');
  var s = subState_(slug);
  if (kind === 'langganan' && (s.plan !== 'bulanan' || !s.due)) throw new Error('Atur paket bulanan atau tahunan dan jatuh tempo dulu.');
  if (kind === 'setup' && s.setup.kind === 'none') throw new Error('Atur jenis setup (Standar / Custom) dulu.');
  if ((kind === 'lifetime' || kind === 'putus') && s.cycle !== kind) throw new Error('Cara bayar coach ini bukan ' + (kind === 'putus' ? 'beli putus' : 'lifetime') + '.');
  var raw = String(data.amount == null ? '' : data.amount).trim();
  var amount = raw ? Number(raw.replace(/[.\s]/g, '')) : kind === 'setup' ? s.setup.price : s.price;
  if (!isFinite(amount) || amount <= 0 || Math.floor(amount) !== amount || amount > 1000000000) throw new Error('Jumlah harus bilangan bulat Rp lebih dari 0.');
  var date = String(data.date || '').trim() || todayWib_();
  if (!validDate_(date) || dayDiff_(todayWib_(), date) > 1) throw new Error('Tanggal bayar tidak valid.');
  var note = String(data.note || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  var entry = { at: new Date().toISOString(), date: date, amount: amount, kind: kind, note: note };
  if (kind === 'langganan') {
    entry.due = s.due; entry.next = addMonths_(s.due, s.cycle === 'tahunan' ? 12 : 1);
    s.due = entry.next; s.ro = 'auto';
  } else if (kind === 'setup') s.setup.paidAt = date;
  s.pay.push(entry);
  subSave_(slug, s);
  brandSync_(slug);   // Fase AF: Setup Custom lunas = logo, warna, tanpa "Didukung XNK"
  var r = subSync_(slug, all[slug], false);
  return r && r.error ? 'Pembayaran dicatat, tetapi coach belum menerima keadaan baca saja: ' + r.error + ' (dicoba lagi besok pagi).' : '';
}

/**
 * Ringkasan uang untuk /adminxnk (T-2264), angka dan slug saja. Pendapatan rutin per bulan = bulanan + tahunan/12
 * (coach keluar tidak dihitung); uang masuk dari catatan pembayaran (termasuk coach yang sudah keluar).
 */
function moneyView_() {
  var all = json_('COACHES', {}), today = todayWib_(), monthKey = today.slice(0, 7);
  var months = [];
  for (var i = 5; i >= 0; i--) months.push({ key: addMonths_(monthKey + '-01', -i).slice(0, 7), amount: 0 });
  var byKey = {}; months.forEach(function (m) { byKey[m.key] = m; });
  var out = { mrr: 0, monthIn: 0, monthKey: monthKey, months: months, upcoming: [], setupUnpaid: [], payments: [] };
  Object.keys(all).sort().forEach(function (slug) {
    var s = subState_(slug), left = !!outState_(slug);
    if (!left && s.plan === 'bulanan') {
      out.mrr += s.cycle === 'tahunan' ? Math.round(s.price / 12) : s.price;
      if (s.due) { var st = subStatus_(s, today); out.upcoming.push({ slug: slug, due: s.due, amount: s.price, cycle: s.cycle, state: st.state, days: st.days }); }
    }
    if (!left && s.setup.kind !== 'none' && !s.setup.paidAt) out.setupUnpaid.push(slug);
    s.pay.forEach(function (p, i) {
      var d = validDate_(p.date) ? p.date : String(p.at || '').slice(0, 10), amt = Number(p.amount) || 0;
      if (!validDate_(d)) return;
      if (byKey[d.slice(0, 7)]) byKey[d.slice(0, 7)].amount += amt;
      if (d.slice(0, 7) === monthKey) out.monthIn += amt;
      out.payments.push({ slug: slug, date: d, at: String(p.at || ''), amount: amt, kind: p.kind || 'langganan', note: p.note || '', i: i });
    });
  });
  out.upcoming.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  out.payments.sort(function (a, b) { var x = a.date + a.at, y = b.date + b.at; return x < y ? 1 : x > y ? -1 : b.i - a.i; });   // terbaru dulu; waktu sama = yang dicatat belakangan dulu
  out.payments.forEach(function (p) { delete p.i; });
  out.payments = out.payments.slice(0, 20);
  return out;
}

/** Aksi langganan: sub-paid (lunas = jatuh tempo +1 bulan, kembali otomatis), sub-ro-on / sub-ro-off / sub-ro-auto. */
function subAction_(action, slug) {
  var all = json_('COACHES', {});
  if (!PUSAT_SLUG_RE.test(slug) || !all[slug]) throw new Error('Coach tidak terdaftar.');
  if (outState_(slug)) throw new Error('Coach ini sudah keluar; langganan tidak bisa diubah. Tekan "Aktifkan lagi" dulu.');
  var s = subState_(slug);
  if (action === 'sub-paid') return subPay_(slug, { kind: 'langganan' });   // T-2264: = catat pembayaran langganan, jumlah = harga
  if (action === 'sub-ro-on') s.ro = 'on';
  else if (action === 'sub-ro-off') s.ro = 'off';
  else if (action === 'sub-ro-auto') s.ro = 'auto';
  else throw new Error('Aksi tidak dikenal.');
  subSave_(slug, s);
  var r = subSync_(slug, all[slug], false);
  return r && r.error ? 'Pilihan disimpan, tetapi coach belum menerimanya: ' + r.error + ' (dicoba lagi besok pagi).' : '';
}

/** Jalankan workflow Hub XNK (hub.yml) dengan isian itu; hub.json di cache dibuang. Melempar bila GitHub menolak. */
function hubDispatch_(inputs) {
  var res = fetch_('https://api.github.com/repos/' + prop_('HUB_REPO', 'xnkzzxd/xnk-template-site') + '/actions/workflows/hub.yml/dispatches', {
    method: 'post', contentType: 'application/json', headers: gh_(), muteHttpExceptions: true,
    payload: JSON.stringify({ ref: 'main', inputs: inputs }),
  });
  if (res.getResponseCode() !== 204) throw new Error('GitHub menolak (' + res.getResponseCode() + ')');
  try { CacheService.getScriptCache().remove('hubjson'); } catch (e) { /* hub.json dibaca lagi paling lambat 10 menit */ }
}

// ── Tempat latihan coach (T-2258) ───────────────────────────────────────────────────────────────────────────
// Satu tempat per coach (nama + kota), publik: disimpan di hub.json lewat workflow Hub XNK (aksi simpan, isian
// tempat/kota), tampil di daftar coach xnk.web.id (dengan saringan kota) dan di halaman /<slug>/info/.

var PUSAT_PLACE_MAX = { name: 60, city: 40 };

/** Sama dengan cleanPlace di xnk-library/tools/build-hub.js: { place } (null = tanpa tempat) atau { error }. */
function cleanPlace_(p) {
  if (p == null || p === '') return { place: null };
  if (typeof p !== 'object' || Array.isArray(p)) return { error: 'place harus berisi { "name": nama tempat, "city": kota }.' };
  var t = function (v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); };
  var name = t(p.name), city = t(p.city);
  if (!name && !city) return { place: null };
  var parts = [['name', name, 'Nama tempat'], ['city', city, 'Kota']];
  for (var i = 0; i < parts.length; i++) {
    if (/[\u0000-\u001f\u007f<>]/.test(parts[i][1])) return { error: parts[i][2] + ' tidak boleh berisi tanda < > atau karakter kontrol.' };
    if (parts[i][1].length > PUSAT_PLACE_MAX[parts[i][0]]) return { error: parts[i][2] + ' paling panjang ' + PUSAT_PLACE_MAX[parts[i][0]] + ' karakter.' };
  }
  if (!name || !city) return { error: 'Isi nama tempat dan kota (mis. Gold\'s Gym Kemang, Jakarta Selatan).' };
  return { place: { name: name, city: city } };
}

/** Tempat coach di hub.json; null bila belum diisi. */
function hubPlace_(slug, hubCoaches) {
  var hit = (hubCoaches || hubJson_().coaches || []).filter(function (x) { return x && x.slug === slug; })[0];
  var r = hit ? cleanPlace_(hit.place) : { place: null };
  return r.place || null;
}

/**
 * Isi, ganti, atau hapus (nama dan kota kosong) tempat latihan coach. Hanya pemilik (token /adminxnk).
 * @return {{slug: string, place: ?{name: string, city: string}, hub: string}} hub = 'ok' | langkah manual
 */
function pusatSetPlace(token, slug, name, city) {
  requireOwnerToken_(token);
  slug = String(slug == null ? '' : slug).trim();
  if (!PUSAT_SLUG_RE.test(slug)) throw new Error('Nama di alamat tidak valid.');
  var r = cleanPlace_({ name: name, city: city });
  if (r.error) throw new Error(r.error);
  if (!(hubJson_().coaches || []).some(function (x) { return x && x.slug === slug; })) throw new Error('Coach "' + slug + '" belum ada di hub.json. Tambahkan dulu lewat Hub XNK (aksi simpan).');
  var p = r.place;
  // Tanpa tempat = "-" (hapus tempat di hub.json); isian kosong di workflow berarti "tetap".
  var inputs = { aksi: 'simpan', slug: slug, warna: 'tetap', tempat: p ? p.name : '-', kota: p ? p.city : '' };
  var manual = 'Jalankan sendiri: repo hub → Actions → Hub XNK → aksi simpan, slug ' + slug + ', tempat ' + inputs.tempat + (inputs.kota ? ', kota ' + inputs.kota : '') + '.';
  var out = { slug: slug, place: p, hub: 'ok' };
  if (!prop_('GITHUB_TOKEN')) { out.hub = manual; return out; }
  try { hubDispatch_(inputs); } catch (e) { out.hub = String(e && e.message ? e.message : e).slice(0, 100) + '. ' + manual; }
  return out;
}

// ── Coach keluar (T-2252) ───────────────────────────────────────────────────────────────────────────────────
// /adminxnk → "Coach keluar…" (konfirmasi: ketik slug) → pusatLeave:
//   1. OUT_<slug> dicatat: tanggal keluar dan jadwal hapus akun Google coach H+30 (DIHAPUS PEMILIK SENDIRI; XNK HQ
//      tidak pernah menghapus akun Google, spreadsheet, atau data klien).
//   2. Baca saja permanen ke coach lewat hubReadonly(rahasia, true, catatan, left=true); cek harian selalu mengirim
//      keadaan yang sama (roWant_), jadi langganan atau sakelar tangan tidak bisa mematikannya.
//   3. Push coach dimatikan dan coach tidak pernah masuk pusatPushTargets lagi.
//   4. Backup akhir: folder XNK Backup/<slug>/Akhir dibuat sekarang (linknya langsung dikembalikan), backup ditandai
//      "sekarang" dan dijalankan terus lewat trigger sekali jalan sampai selesai; hasilnya (spreadsheet + salinan .xlsx)
//      dipindah ke folder Akhir (tidak ikut dipangkas) dan pemilik mendapat email berisi link-nya untuk dikirim ke coach.
//   5. Workflow Hub XNK aksi "nonaktif" (hub.json "inactive": true): situs coach jadi halaman "tidak aktif lagi".
// Email harian pemilik memuat "hapus akun Google coach <slug>" mulai H-3 sampai pemilik menekan "Akun sudah dihapus".
// "Aktifkan lagi" (sebelum H+30, akun belum dihapus) membatalkan 2, 5 dan tanda keluar; push tetap mati sampai dinyalakan.

var PUSAT_OUT_DAYS = 30;                  // hapus akun Google coach H+30 (manual)
var PUSAT_OUT_WARN = 3;                   // pengingat di email harian mulai H-3
var PUSAT_OUT_NOTE = 'Coach ini sudah tidak aktif di XNK. Data bisa dilihat, tetapi tidak bisa diubah lagi.';
var MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/** OUT_<slug>: null = coach aktif. */
function outState_(slug) { var o = json_('OUT_' + slug, null); return o && typeof o === 'object' ? o : null; }
function outSave_(slug, o) { props_().setProperty('OUT_' + slug, JSON.stringify(o)); }
/** Tanggal + n hari (YYYY-MM-DD). */
function addDays_(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
function folderUrl_(id) { return 'https://drive.google.com/drive/folders/' + id; }

/** Untuk /adminxnk (tanpa rahasia). hubInactive = hub.json sudah menandai coach ini tidak aktif. */
function outView_(slug, hubCoaches) {
  var hit = (hubCoaches || []).filter(function (x) { return x && x.slug === slug; })[0];
  var o = outState_(slug), inactive = !!(hit && hit.inactive === true);
  if (!o) return inactive ? { hubInactive: true } : null;
  var left = dayDiff_(todayWib_(), o.deleteOn), f = o.final || {};
  return {
    at: o.at, day: o.day, deleteOn: o.deleteOn, daysLeft: left, done: o.done || '', hub: o.hub || '', hubInactive: inactive,
    canUndo: !o.done && left > 0,
    final: { state: f.state || '', dirUrl: f.dirUrl || '', fileUrl: f.fileUrl || '', xlsxUrl: f.xlsxUrl || '', xlsxError: f.xlsxError || '', error: f.error || '', at: f.at || '' },
  };
}

/** Ada backup akhir yang belum selesai? (rantai trigger sekali jalan di runPusatBackup) */
function outPending_() {
  return Object.keys(json_('COACHES', {})).some(function (s) {
    var o = outState_(s);
    return !!(o && !o.done && o.final && (o.final.state === 'antre' || o.final.state === 'jalan'));
  });
}

/** Tandai keadaan backup akhir (hanya untuk coach keluar yang backup akhirnya belum selesai). */
function outFinalMark_(slug, state, err) {
  var o = outState_(slug);
  if (!o || o.done || !o.final || o.final.state === 'selesai') return;
  o.final.state = state;
  o.final.error = err ? String(err).slice(0, 160) : '';
  outSave_(slug, o);
}

/**
 * Coach keluar. Hanya pemilik; `confirm` harus sama persis dengan slug (diketik di /adminxnk).
 * @return {{slug, day, deleteOn, dirUrl, readonly, push, backup, hub}} readonly/push/backup/hub = 'ok' | pesan
 */
function pusatLeave(token, slug, confirm) {
  requireOwnerToken_(token);
  slug = String(slug == null ? '' : slug).trim();
  var all = json_('COACHES', {});
  if (!PUSAT_SLUG_RE.test(slug) || !all[slug]) throw new Error('Coach tidak terdaftar.');
  if (String(confirm == null ? '' : confirm).trim() !== slug) throw new Error('Ketik "' + slug + '" persis untuk memastikan coach ini keluar.');
  var day = todayWib_(), o;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (outState_(slug)) throw new Error('Coach "' + slug + '" sudah ditandai keluar.');
    o = { at: new Date().toISOString(), day: day, deleteOn: addDays_(day, PUSAT_OUT_DAYS), done: '', hub: '', final: { state: 'antre', dir: '', dirUrl: '', fileUrl: '', xlsxUrl: '', error: '' } };
    outSave_(slug, o);
  } finally { lock.releaseLock(); }
  var c = all[slug];
  var res = { slug: slug, day: o.day, deleteOn: o.deleteOn, dirUrl: '', readonly: 'ok', push: 'ok', backup: 'ok', hub: 'ok' };

  var r = subSync_(slug, c, true);   // baca saja permanen + tanda keluar
  if (r && r.error) res.readonly = r.error + ' Dicoba lagi tiap pagi.';

  var p = pushState_(slug);
  if (p.on || p.active) {
    p.on = false;
    props_().setProperty('PUSH_' + slug, JSON.stringify(p));
    var pr = pushSync_(slug, c, hubVapid_());
    if (pr.error) res.push = pr.error + ' Dicoba lagi tiap pagi.';
  }

  // Folder Akhir dibuat sekarang supaya linknya bisa langsung dipakai; berkasnya masuk setelah backup selesai.
  try {
    var dir = driveMkdir_('Akhir', bkDir_(slug));
    o = outState_(slug);
    o.final.dir = dir; o.final.dirUrl = folderUrl_(dir);
    outSave_(slug, o);
    res.dirUrl = o.final.dirUrl;
  } catch (e) {
    res.backup = 'Folder Drive belum bisa dibuat (' + String(e && e.message ? e.message : e).slice(0, 100) + '); backup akhir tetap dicoba.';
  }
  backupNow_(slug);

  res.hub = hubSet_(slug, 'nonaktif');
  o = outState_(slug); o.hub = res.hub; outSave_(slug, o);
  return res;
}

/** Workflow Hub XNK aksi nonaktif / aktifkan; 'ok' atau pesan dengan langkah manual. */
function hubSet_(slug, aksi) {
  var manual = 'Jalankan sendiri: repo hub → Actions → Hub XNK → aksi ' + aksi + ', slug ' + slug + '.';
  if (!prop_('GITHUB_TOKEN')) return manual;
  try { hubDispatch_({ aksi: aksi, slug: slug }); return 'ok'; } catch (e) { return String(e && e.message ? e.message : e).slice(0, 100) + '. ' + manual; }
}

/**
 * Backup selesai: bila coach keluar dan backup akhirnya belum jadi, pindahkan spreadsheet ke folder Akhir, buat salinan
 * .xlsx di sana, catat link-nya, email pemilik. Mengembalikan {fileUrl, xlsxUrl, dirUrl} atau null (bukan backup akhir).
 * Galat Excel tidak menggagalkan backup: spreadsheet akhir tetap ada.
 */
function outFinalize_(cur) {
  var o = outState_(cur.slug);
  if (!o || o.done || !o.final || o.final.state === 'selesai') return null;
  // Backup yang dimulai sebelum coach keluar (data masih bisa berubah saat itu) bukan backup akhir: BKNOW masih menunggu.
  if (cur.started < Date.parse(o.at)) { props_().setProperty('BKNOW_' + cur.slug, String(Date.now())); return null; }
  var f = o.final;
  try {
    if (!f.dir) { f.dir = driveMkdir_('Akhir', cur.dir); f.dirUrl = folderUrl_(f.dir); }
    drive_('patch', '/' + encodeURIComponent(cur.fileId) + '?addParents=' + encodeURIComponent(f.dir) + '&removeParents=' + encodeURIComponent(cur.dir) + '&fields=id', {});
  } catch (e) { /* tetap di folder coach; link spreadsheet tetap benar */ }
  f.fileUrl = cur.fileUrl;
  f.xlsxUrl = ''; f.xlsxError = '';
  try { f.xlsxUrl = xlsxCopy_(cur.fileId, cur.slug + ' ' + new Date(cur.started + 7 * 3600 * 1000).toISOString().slice(0, 10) + '.xlsx', f.dir || cur.dir); }
  catch (e) { f.xlsxError = String(e && e.message ? e.message : e).slice(0, 160); }
  f.state = 'selesai'; f.error = ''; f.at = new Date().toISOString();
  o.final = f;
  outSave_(cur.slug, o);
  try {
    var to = prop_('PUSAT_EMAIL') || Session.getEffectiveUser().getEmail();
    MailApp.sendEmail(to, 'XNK HQ: backup akhir ' + cur.slug + ' siap',
      'Backup akhir coach ' + cur.slug + ' (keluar ' + o.day + ') sudah jadi.\n\n' +
      (f.xlsxUrl ? 'Excel (untuk dikirim ke coach): ' + f.xlsxUrl + '\n' : 'Excel belum bisa dibuat (' + f.xlsxError + '); spreadsheet di bawah bisa diunduh sebagai .xlsx (File → Download).\n') +
      'Spreadsheet: ' + f.fileUrl + '\nFolder: ' + (f.dirUrl || '-') + '\n\n' +
      'Cara mengirim: buka link Excel → titik tiga → Bagikan (masukkan email coach) atau Download lalu kirim lewat email/WhatsApp.\n' +
      'Jadwal hapus akun Google coach: ' + o.deleteOn + ' (manual; XNK HQ mengingatkan mulai H-' + PUSAT_OUT_WARN + ').\n\nDasbor: ' + hubUrl_() + '/adminxnk/');
  } catch (e) { /* email gagal: link tetap tampil di /adminxnk */ }
  return { fileUrl: f.fileUrl, xlsxUrl: f.xlsxUrl, dirUrl: f.dirUrl };
}

/** Ekspor spreadsheet (buatan skrip ini) ke .xlsx dan unggah ke folder; link berkas .xlsx. Batas ekspor Drive 10 MB. */
function xlsxCopy_(fileId, name, dir) {
  var auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  var ex = fetch_(DRIVE_API + '/' + encodeURIComponent(fileId) + '/export?mimeType=' + encodeURIComponent(MIME_XLSX), { muteHttpExceptions: true, headers: auth });
  if (ex.getResponseCode() !== 200) throw new Error('Ekspor Excel ditolak Drive (' + ex.getResponseCode() + ')' + (ex.getResponseCode() === 403 ? '; berkas mungkin lebih dari 10 MB' : '') + '.');
  var bytes = ex.getContent();
  var b = 'xnk' + Utilities.getUuid().replace(/-/g, '');
  var head = Utilities.newBlob('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: name, parents: [dir], mimeType: MIME_XLSX }) + '\r\n--' + b + '\r\nContent-Type: ' + MIME_XLSX + '\r\n\r\n').getBytes();
  var tail = Utilities.newBlob('\r\n--' + b + '--').getBytes();
  var up = fetch_(DRIVE_UPLOAD + '?uploadType=multipart&fields=id,webViewLink', { method: 'post', contentType: 'multipart/related; boundary=' + b, payload: head.concat(bytes).concat(tail), muteHttpExceptions: true, headers: auth });
  if (up.getResponseCode() < 200 || up.getResponseCode() >= 300) throw new Error('Unggah Excel ditolak Drive (' + up.getResponseCode() + ').');
  var j = JSON.parse(up.getContentText());
  return j.webViewLink || 'https://drive.google.com/file/d/' + j.id + '/view';
}

/** "Aktifkan lagi": sebelum H+30 dan akun belum dihapus. Pesan untuk /adminxnk ('' = semua beres). */
function leaveUndo_(slug) {
  var all = json_('COACHES', {});
  if (!PUSAT_SLUG_RE.test(slug) || !all[slug]) throw new Error('Coach tidak terdaftar.');
  var o = outState_(slug);
  if (!o) throw new Error('Coach ini tidak sedang keluar.');
  if (o.done) throw new Error('Akun Google coach ini sudah ditandai dihapus; tidak bisa diaktifkan lagi.');
  if (dayDiff_(todayWib_(), o.deleteOn) <= 0) throw new Error('Lewat ' + PUSAT_OUT_DAYS + ' hari (jadwal hapus akun ' + o.deleteOn + '); tidak bisa diaktifkan lagi dari sini.');
  props_().deleteProperty('OUT_' + slug);
  var notes = [];
  var r = subSync_(slug, all[slug], true);   // baca saja kembali ke hitungan langganan (gratis = mati), tanda keluar hilang
  if (r && r.error) notes.push('Baca saja belum dimatikan di coach: ' + r.error + ' (dicoba lagi tiap pagi).');
  var h = hubSet_(slug, 'aktifkan');
  if (h !== 'ok') notes.push('Situs: ' + h);
  return notes.join(' ');
}

/** "Akun sudah dihapus": pengingat berhenti, coach tidak ditanya lagi. Pesan untuk /adminxnk. */
function leaveDone_(slug) {
  var o = outState_(slug);
  if (!PUSAT_SLUG_RE.test(slug) || !o) throw new Error('Coach ini tidak sedang keluar.');
  if (!o.done) { o.done = todayWib_(); outSave_(slug, o); }
  return '';
}

/** Bagian cek harian: {slug: [masalah]} untuk coach keluar. */
function outDaily_() {
  var all = json_('COACHES', {}), hubCoaches = null, out = {}, today = todayWib_();
  Object.keys(all).sort().forEach(function (slug) {
    var o = outState_(slug);
    if (!o || o.done) return;
    var probs = [], left = dayDiff_(today, o.deleteOn);
    if (left <= PUSAT_OUT_WARN) {
      probs.push('Hapus akun Google coach ' + slug + ' (' + (left > 0 ? 'jadwal ' + o.deleteOn + ', ' + left + ' hari lagi' : left === 0 ? 'jadwal hari ini, ' + o.deleteOn : 'lewat jadwal ' + o.deleteOn) +
        '). Manual oleh pemilik: masuk ke akun Google coach → myaccount.google.com → Data & privasi → Hapus akun Google. Lalu tekan "Akun sudah dihapus" di /adminxnk.');
    }
    if (o.final && o.final.state === 'gagal') probs.push('Backup akhir gagal (' + (o.final.error || '-') + '); dicoba lagi otomatis.');
    if (hubCoaches === null) hubCoaches = hubJson_().coaches || [];
    var hit = hubCoaches.filter(function (x) { return x && x.slug === slug; })[0];
    if (hit && hit.inactive !== true && dayDiff_(o.day, today) >= 1) probs.push('Situs coach masih aktif di hub.json. Jalankan Hub XNK aksi nonaktif, slug ' + slug + '.');
    if (probs.length) out[slug] = probs;
  });
  return out;
}


// ── Paket & fitur (Fase AF, docs/plan/) ─────────────────────────────────────────────────────────────────────────────
// Per coach PLAN_<slug> = {add, off, limits, enforceFrom, features (salinan beku lifetime), pushed}. Paket dasar diambil dari
// langganan (SUB_). Yang dikirim ke coach lewat hubPlan(HUB_SECRET, plan): gratis / lainnya = tanpa batas; lewat tenggang
// = Starter (state 'turun', PUSAT_SUB_STARTER_DAYS hari) lalu baca saja. Isi paket di sini SAMA dengan PLAN_TIERS di
// pt-scheduler/src/Plan.gs (tests/pusat.test.js membandingkan).
var PUSAT_PLAN_FEATURES = ['finance', 'nutrition', 'care', 'photos', 'report', 'share', 'content', 'programAuto',
  'telegramFull', 'templates', 'classes', 'coachShare', 'multiCoach'];
var PUSAT_PLAN_LABELS = { finance: 'Keuangan', nutrition: 'Gizi', care: 'Asesmen & catatan sesi', photos: 'Foto progres', report: 'Laporan PDF',
  share: 'Kartu bagikan', content: 'Info & tips', programAuto: 'Program otomatis', telegramFull: 'Semua pengingat WA', templates: 'Template program',
  classes: 'Kelas grup', coachShare: 'Bagi hasil coach', multiCoach: 'Banyak coach' };
var PUSAT_PLAN_TIER = {
  starter: { clients: 15, coaches: 1, features: [] },
  pro: { clients: 0, coaches: 1, features: ['finance', 'nutrition', 'care', 'photos', 'report', 'share', 'content', 'programAuto', 'telegramFull', 'templates'] },
  studio: { clients: 0, coaches: 5, features: ['finance', 'nutrition', 'care', 'photos', 'report', 'share', 'content', 'programAuto', 'telegramFull', 'templates', 'classes', 'coachShare', 'multiCoach'] },
};
var PUSAT_PLAN_WARN_DAYS = 30;

function planState_(slug) { var p = json_('PLAN_' + slug, null); return p && typeof p === 'object' ? p : {}; }
function planSave_(slug, p) { props_().setProperty('PLAN_' + slug, JSON.stringify(p)); }
function st0_(slug) { return subStatus_(subState_(slug), todayWib_()).state; }

/** Paket yang harus ada di coach (murni terhadap SUB_ dan PLAN_). */
function planWant_(slug, s) {
  s = s || subState_(slug);
  var p = planState_(slug), st = subStatus_(s, todayWib_());
  var tier = PUSAT_PLAN_TIER[s.tier] ? s.tier : 'gratis';
  if (tier === 'gratis') return { tier: 'gratis' };
  if (st.state === 'turun') return { tier: 'starter', enforceFrom: p.enforceFrom || '', upgradeWa: prop_('PUSAT_WA') };
  var want = { tier: tier };
  if (Array.isArray(p.features) && (s.cycle === 'lifetime' || s.cycle === 'putus')) want.features = p.features.slice();
  if (p.add && p.add.length) want.add = p.add.slice();
  if (p.off && p.off.length) want.off = p.off.slice();
  if (p.limits && (p.limits.clients != null || p.limits.coaches != null)) want.limits = p.limits;
  if (p.enforceFrom) want.enforceFrom = p.enforceFrom;
  if (prop_('PUSAT_WA')) want.upgradeWa = prop_('PUSAT_WA');
  return want;
}

/** Kirim paket ke coach bila berubah, galat, atau `force` (cek harian). */
function planSync_(slug, c, force) {
  var p = planState_(slug), want = planWant_(slug), key = JSON.stringify(want), was = p.pushed;
  if (!was && want.tier === 'gratis') return null;   // coach gratis yang belum pernah dikirimi: tidak dihubungi
  if (was && was.key === key && !was.error && !force) return null;
  var out = { key: key, at: new Date().toISOString(), error: '' };
  try {
    var j = askApps_(hubExec_(slug) || c.exec, { fn: 'hubPlan', args: [c.secret, want] });
    if (j && j.code === 'unknown_fn') throw new Error('Library coach belum punya hubPlan; perbarui coach.');
    if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'tanpa jawaban');
    if (j.data && j.data.plan) out.usage = { clients: j.data.plan.clients || null, coaches: j.data.plan.coaches || null };
  } catch (e) {
    out.error = String(e && e.message ? e.message : e).slice(0, 160);
  }
  p = planState_(slug);
  p.pushed = out;
  planSave_(slug, p);
  return out;
}

/** Untuk /adminxnk. */
function planView_(slug, s) {
  var p = planState_(slug), want = planWant_(slug, s), base = PUSAT_PLAN_TIER[want.tier];
  var st = json_('ST_' + slug, null), live = st && st.plan ? st.plan : null;
  var on = !base ? PUSAT_PLAN_FEATURES.slice() : PUSAT_PLAN_FEATURES.filter(function (f) {
    var b = (want.features || base.features).indexOf(f) !== -1;
    if ((want.add || []).indexOf(f) !== -1) b = true;
    if ((want.off || []).indexOf(f) !== -1) b = false;
    return b;
  });
  return {
    tier: want.tier, lapse: want.tier === 'starter' && s && s.tier !== 'starter', frozen: !!want.features,
    base: base ? base.features : PUSAT_PLAN_FEATURES, on: on, add: p.add || [], off: p.off || [],
    limits: { clients: p.limits && p.limits.clients != null ? p.limits.clients : null, coaches: p.limits && p.limits.coaches != null ? p.limits.coaches : null },
    tierLimits: base ? { clients: base.clients, coaches: base.coaches } : null,
    brand: { ok: brandOk_(s || subState_(slug)), pushed: json_('BRAND_' + slug, null) },
    enforceFrom: p.enforceFrom || '',
    usage: live ? { clients: live.clients || null, coaches: live.coaches || null } : (p.pushed && p.pushed.usage) || null,
    pushed: p.pushed ? { at: p.pushed.at, error: p.pushed.error || '' } : null,
    labels: PUSAT_PLAN_LABELS, features: PUSAT_PLAN_FEATURES,
  };
}

/**
 * Simpan pengecualian paket dari /adminxnk. Hanya pemilik.
 * data: {on: [fitur], clients, coaches (kosong = ikut paket, 0 = tanpa batas), enforceFrom (YYYY-MM-DD | '' | 'warn' = 30 hari lagi)}
 * `on` dibandingkan dengan isi paket: selisihnya jadi add / off. Lifetime / beli putus: simpan pertama membekukan daftar fitur.
 */
function pusatPlanSave(token, slug, data) {
  requireOwnerToken_(token);
  slug = String(slug || '');
  var all = json_('COACHES', {});
  if (!PUSAT_SLUG_RE.test(slug) || !all[slug]) throw new Error('Coach tidak terdaftar.');
  if (outState_(slug)) throw new Error('Coach ini sudah keluar. Tekan "Aktifkan lagi" dulu.');
  data = data && typeof data === 'object' ? data : {};
  var s = subState_(slug), base = PUSAT_PLAN_TIER[s.tier];
  if (!base) throw new Error('Pilih paket Starter, Pro atau Studio di Langganan dulu.');
  var p = planState_(slug);
  var lifetime = s.cycle === 'lifetime' || s.cycle === 'putus';
  if (lifetime && !Array.isArray(p.features)) p.features = base.features.slice();
  var ref = lifetime ? p.features : base.features;
  if (data.on != null) {
    if (!Array.isArray(data.on)) throw new Error('Daftar fitur tidak valid.');
    var on = data.on.map(String);
    on.forEach(function (f) { if (PUSAT_PLAN_FEATURES.indexOf(f) === -1) throw new Error('Fitur tidak dikenal: ' + f); });
    p.add = on.filter(function (f) { return ref.indexOf(f) === -1; });
    p.off = ref.filter(function (f) { return on.indexOf(f) === -1; });
  }
  var num = function (v, what) {
    var t = String(v == null ? '' : v).trim();
    if (t === '') return null;
    var n = Number(t);
    if (!isFinite(n) || n < 0 || Math.floor(n) !== n || n > 10000) throw new Error(what + ' harus bilangan bulat 0–10000.');
    return n;
  };
  p.limits = { clients: num(data.clients, 'Batas klien'), coaches: num(data.coaches, 'Batas coach') };
  if (data.enforceFrom === 'warn') p.enforceFrom = addDays_(todayWib_(), PUSAT_PLAN_WARN_DAYS);
  else if (data.enforceFrom != null) {
    var d = String(data.enforceFrom).trim();
    if (d && !validDate_(d)) throw new Error('Tanggal mulai berlaku tidak valid.');
    p.enforceFrom = d;
  }
  planSave_(slug, p);
  planSync_(slug, all[slug], false);
  return pusatOverview(token);
}


/** Murni: Setup Custom sudah dibayar? */
function brandOk_(s) { return !!(s && s.setup && s.setup.kind === 'custom' && s.setup.paidAt); }

/**
 * Fase AF: tulis customBrand di hub.json (workflow Hub XNK, isian merek ya/tidak) bila berbeda dari yang terakhir dikirim.
 * Coach yang belum pernah diatur (tanpa BRAND_<slug>) dan tanpa Setup Custom tidak disentuh: halaman lamanya tetap.
 * Mengembalikan '' | 'ok' | pesan langkah manual. Tidak pernah melempar (simpan tetap berhasil).
 */
function brandSync_(slug) {
  var want = brandOk_(subState_(slug)), was = json_('BRAND_' + slug, null);
  if (was && was.on === want && !was.error) return '';
  if (!was && !want && subState_(slug).setup.kind !== 'custom') return '';
  var out = { on: want, at: new Date().toISOString(), error: '' };
  var manual = 'Jalankan sendiri: repo hub → Actions → Hub XNK → aksi simpan, slug ' + slug + ', merek ' + (want ? 'ya' : 'tidak') + '.';
  if (!prop_('GITHUB_TOKEN')) out.error = manual;
  else try { hubDispatch_({ aksi: 'simpan', slug: slug, warna: 'tetap', merek: want ? 'ya' : 'tidak' }); } catch (e) { out.error = String(e && e.message ? e.message : e).slice(0, 100) + '. ' + manual; }
  props_().setProperty('BRAND_' + slug, JSON.stringify(out));
  return out.error || 'ok';
}
