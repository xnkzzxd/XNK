// XNK Pusat (Gelombang 2, T-2233): satu Apps Script di akun Google pemilik yang mengawasi semua coach di hub
// xnk.web.id. Dibaca halaman xnk.web.id/adminxnk lewat doPost (login PIN pemilik).
//   - Pendaftaran: wizard setup di spreadsheet coach membuat rahasia acak (HUB_SECRET di spreadsheet coach) dan
//     mengirimnya ke sini bersama slug dan link /exec, dengan kode daftar pemilik (PUSAT_ENROLL_CODE).
//   - Setiap pagi (runPusatDaily) semua coach ditanya hubStatus(rahasia): versi Library, trigger, pengingat, angka
//     klien/sesi. Ada masalah = satu email ke pemilik. Tidak ada nama atau nomor klien yang pernah sampai ke sini.
//   - Aksi dari /adminxnk (perbarui coach, hubungkan, bangun hub) menjalankan workflow repo hub lewat token GitHub
//     fine-grained (GITHUB_TOKEN, hanya Actions: write di xnk-template-site).
// Script Properties (diisi di editor: Project Settings → Script Properties, lalu jalankan setupPusat sekali):
//   PUSAT_PIN (min 8), PUSAT_ENROLL_CODE (min 8), PUSAT_EMAIL (opsional; bawaan = akun ini), GITHUB_TOKEN (opsional),
//   HUB_URL (bawaan https://xnk.web.id), HUB_REPO (bawaan xnkzzxd/xnk-template-site), XNK_REPO (bawaan xnkzzxd/XNK).
// Disimpan sendiri: SESSION_SECRET, COACHES (JSON slug → {exec, secret, at}), ST_<slug> (status terakhir), LATEST_LIB.

var PUSAT_SESSION_MS = 12 * 3600 * 1000;
var PUSAT_TICK_LATE_MS = 3 * 3600 * 1000;      // pengingat menyala tapi tick terakhir lebih lama dari ini = masalah
var PUSAT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
var PUSAT_EXEC_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

function props_() { return PropertiesService.getScriptProperties(); }
function prop_(k, d) { var v = props_().getProperty(k); return v == null || v === '' ? (d == null ? '' : d) : String(v); }
function json_(k, d) { try { var v = props_().getProperty(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
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

function doGet() { return ContentService.createTextOutput('XNK Pusat'); }

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
  var bad = Object.keys(res).filter(function (s) { return !res[s].ok; });
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
    coaches: Object.keys(all).sort().map(function (slug) {
      return { slug: slug, exec: all[slug].exec, registeredAt: all[slug].at, panel: hub + '/' + slug + '/', klien: hub + '/' + slug + '/klien/', status: json_('ST_' + slug, null) };
    }),
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

// ── Pemasangan (dijalankan pemilik dari editor) ─────────────────────────────────────────────────────────────

/** Sekali: kunci sesi + trigger harian 06:00 WIB. Aman diulang. */
function setupPusat() {
  if (prop_('SESSION_SECRET').length < 32) props_().setProperty('SESSION_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runPusatDaily') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runPusatDaily').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Jakarta').create();
  return 'XNK Pusat siap. Isi PUSAT_PIN dan PUSAT_ENROLL_CODE di Script Properties bila belum, lalu terbitkan sebagai aplikasi web.';
}
