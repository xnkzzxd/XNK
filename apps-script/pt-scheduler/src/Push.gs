// =============================================================================
// Fase X: Web Push (notifikasi di HP / komputer lewat Chrome, tanpa WhatsApp dan tanpa Telegram)
// docs/push/PRD.md, docs/push/Design.md
//
// Apps Script tidak bisa menandatangani VAPID (ES256 / ECDSA P-256) dan tidak bisa mengenkripsi isi push, jadi
// pengirimannya dikerjakan GitHub Actions (tools/push-send.js, .github/workflows/push.yml):
//   1. Server ini MERENCANAKAN notifikasi dan menaruhnya di sheet PushOutbox (satu baris per perangkat).
//   2. Workflow memanggil pushRelayPull(secret): server merencanakan yang jatuh tempo lalu meminjamkan baris siap kirim.
//   3. Workflow mengirim (web-push) dan melapor lewat pushRelayAck(secret, hasil).
// Semua kunci (publik, privat, rahasia relay) ada di Script Properties; GitHub hanya menyimpan rahasia relay.
//
// Properti Script:
//   PUSH_VAPID_PUBLIC   kunci publik VAPID (base64url). Kosong = fitur mati (bawaan).
//   PUSH_VAPID_PRIVATE  kunci privat VAPID; hanya dikirim ke pengirim lewat pushRelayPull (dijaga rahasia relay).
//   PUSH_RELAY_SECRET   rahasia bersama dengan GitHub (>= 24 karakter). Kosong = fitur mati.
//   PUSH_ENABLED        'false' mematikan walau dua properti di atas ada.
//   PUSH_HOUR_SESI_BESOK / PUSH_HOUR_SESI_HARI_INI   jam WIB (bawaan 19 dan 6).
//   PUSH_GH_TOKEN, PUSH_GH_REPO   opsional: token GitHub (Actions: write) agar permintaan perpanjang terkirim seketika.
// Jenis (kind) dikelompokkan jadi "grup" yang bisa dimatikan per perangkat: sesi, pr, makan, perpanjangan.
// =============================================================================

var PUSH_SUBS_SHEET = 'PushSubs';
var PUSH_OUT_SHEET = 'PushOutbox';
var PUSH_SUBS_HEADERS = ['Sub ID', 'Peran', 'Member ID', 'Endpoint', 'p256dh', 'auth', 'Label', 'Dibuat', 'Terakhir Terlihat', 'Mati', 'Gagal'];
var PUSH_OUT_HEADERS = ['ID', 'Kunci', 'Dibuat', 'Sub ID', 'Jenis', 'Judul', 'Isi', 'URL', 'Status', 'Percobaan', 'Diambil'];
var PUSH_GROUPS_MEMBER = ['sesi', 'pr', 'makan'];
var PUSH_GROUPS_ADMIN = ['sesi', 'perpanjangan'];
var PUSH_MAX_DEVICES_MEMBER = 5;
var PUSH_MAX_DEVICES_ADMIN = 10;
var PUSH_HOST_OK = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
var PUSH_LATE_HOURS = 2;               // tick yang terlambat sampai 2 jam masih boleh merencanakan
var PUSH_EXPIRE_MS = 6 * 3600000;      // notifikasi yang belum terkirim setelah 6 jam dibuang (sudah basi)
var PUSH_LEASE_MS = 10 * 60000;        // baris yang dipinjam tapi tak pernah dilapor boleh dipinjam lagi
var PUSH_MAX_TRIES = 4;
var PUSH_PULL_LIMIT = 60;
var PUSH_FAIL_DROP = 8;                // perangkat yang gagal beruntun sebanyak ini dihapus

// ---- konfigurasi ------------------------------------------------------------

function _pushProp_(k) { return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); }

function _pushOn_() {
  return !!(_pushProp_('PUSH_VAPID_PUBLIC') && _pushProp_('PUSH_RELAY_SECRET').length >= 24 && _pushProp_('PUSH_ENABLED') !== 'false');
}

/** Kunci publik untuk browser; kosong bila fitur mati (kartu notifikasi tersembunyi). */
function _pushPublicKey_() { return _pushOn_() ? _pushProp_('PUSH_VAPID_PUBLIC') : ''; }

function _pushGroupOf_(kind) {
  kind = String(kind);
  if (kind.indexOf('sesi-') === 0) return 'sesi';
  if (kind.indexOf('makan-') === 0) return 'makan';
  return kind;   // pr, perpanjangan
}

function _pushGroupsFor_(role) { return role === 'admin' ? PUSH_GROUPS_ADMIN : PUSH_GROUPS_MEMBER; }

function _pushFirst_(name) {
  var s = String(name || '').trim().split(/\s+/)[0] || '';
  return s.length > 20 ? s.slice(0, 20) : s;
}

function _pushClip_(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ---- langganan (PushSubs) ---------------------------------------------------

function _pushSubsSheet_() { return getOrCreateSheet_(PUSH_SUBS_SHEET, PUSH_SUBS_HEADERS); }
function _pushOutSheet_() { return getOrCreateSheet_(PUSH_OUT_SHEET, PUSH_OUT_HEADERS); }

function _pushOffFrom_(cell) {
  return String(cell || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean);
}

/** Murni: periksa langganan dari browser. Kembalikan {endpoint, p256dh, auth} atau lempar error Indonesia. */
function _pushCleanSub_(sub) {
  var bad = new Error('Langganan notifikasi tidak valid.');
  if (!sub || typeof sub !== 'object') throw bad;
  var endpoint = String(sub.endpoint || '').trim();
  var keys = sub.keys || {};
  var p256dh = String(keys.p256dh || '').trim(), auth = String(keys.auth || '').trim();
  var m = /^https:\/\/([^\/:?#@]+)(?::443)?\/[^\s]*$/.exec(endpoint);
  if (!m || endpoint.length > 600) throw bad;
  var host = m[1].toLowerCase();
  if (!PUSH_HOST_OK.some(function(re) { return re.test(host); })) throw bad;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) throw bad;
  return { endpoint: endpoint, p256dh: p256dh, auth: auth };
}

function _pushSubId_(endpoint) { return _sha256Hex_('push:' + endpoint).slice(0, 16); }

/** Semua langganan sebagai objek: {id, role, memberId, endpoint, p256dh, auth, label, created, seen, off:[], fails, rowNum}. */
function _pushSubsAll_() {
  var data = _pushSubsSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[0]) continue;
    out.push({ id: String(r[0]), role: String(r[1]), memberId: String(r[2]), endpoint: String(r[3]), p256dh: String(r[4]), auth: String(r[5]),
      label: String(r[6] || ''), created: Number(r[7]) || 0, seen: Number(r[8]) || 0, off: _pushOffFrom_(r[9]), fails: Number(r[10]) || 0, rowNum: i + 1 });
  }
  return out;
}

function _pushDeviceView_(s) { return { id: s.id, label: s.label, off: s.off, created: s.created, seen: s.seen }; }

function _pushStatus_(role, memberId, endpoint) {
  if (!_pushOn_()) return { on: false, key: '', kinds: [], devices: [], current: { subscribed: false, off: [] } };
  var mine = _pushSubsAll_().filter(function(s) { return s.role === role && s.memberId === memberId; });
  var cur = null;
  if (endpoint) { var id = _pushSubId_(String(endpoint)); mine.forEach(function(s) { if (s.id === id) cur = s; }); }
  return { on: true, key: _pushPublicKey_(), kinds: _pushGroupsFor_(role).slice(),
    devices: mine.map(_pushDeviceView_), current: { subscribed: !!cur, off: cur ? cur.off : [] } };
}

function _pushSave_(role, memberId, sub, label) {
  if (!_pushOn_()) throw new Error('Notifikasi belum diaktifkan oleh admin.');
  var s = _pushCleanSub_(sub);
  var id = _pushSubId_(s.endpoint);
  var name = _pushClip_(String(label || '').replace(/[\r\n]+/g, ' ').trim(), 60);
  var cap = role === 'admin' ? PUSH_MAX_DEVICES_ADMIN : PUSH_MAX_DEVICES_MEMBER;
  _locked_(function() {
    var sheet = _pushSubsSheet_();
    var all = _pushSubsAll_();
    var now = Date.now();
    var same = null;
    all.forEach(function(x) { if (x.id === id) same = x; });
    if (same) {
      // Perangkat yang sama, mungkin akun lain yang masuk: ikut akun yang sekarang. Pilihan grup dipertahankan bila akun sama.
      var keepOff = (same.role === role && same.memberId === memberId) ? same.off.join(',') : '';
      sheet.getRange(same.rowNum, 2, 1, 10).setValues([[role, memberId, s.endpoint, s.p256dh, s.auth, name || same.label, same.created || now, now, keepOff, 0]]);
      return;
    }
    // Penuh: hapus yang paling lama tidak terlihat (dari bawah ke atas supaya nomor baris tetap benar).
    var mine = all.filter(function(x) { return x.role === role && x.memberId === memberId; }).sort(function(a, b) { return a.seen - b.seen; });
    var drop = mine.slice(0, Math.max(0, mine.length - cap + 1)).map(function(x) { return x.rowNum; }).sort(function(a, b) { return b - a; });
    drop.forEach(function(n) { sheet.deleteRow(n); });
    _appendRow_(sheet, [id, role, memberId, s.endpoint, s.p256dh, s.auth, name, now, now, '', 0]);
  });
  return _pushStatus_(role, memberId, s.endpoint);
}

function _pushRemove_(role, memberId, endpoint) {
  var id = _pushSubId_(String(endpoint || ''));
  _locked_(function() {
    var sheet = _pushSubsSheet_();
    _pushSubsAll_().filter(function(x) { return x.id === id && x.role === role && x.memberId === memberId; })
      .map(function(x) { return x.rowNum; }).sort(function(a, b) { return b - a; }).forEach(function(n) { sheet.deleteRow(n); });
  });
  return _pushStatus_(role, memberId, '');
}

function _pushPrefs_(role, memberId, endpoint, off) {
  var allowed = _pushGroupsFor_(role);
  var clean = (Array.isArray(off) ? off : []).map(String).filter(function(g, i, a) { return allowed.indexOf(g) !== -1 && a.indexOf(g) === i; });
  var id = _pushSubId_(String(endpoint || ''));
  var found = false;
  _locked_(function() {
    var sheet = _pushSubsSheet_();
    _pushSubsAll_().forEach(function(x) {
      if (x.id === id && x.role === role && x.memberId === memberId) { sheet.getRange(x.rowNum, 10).setValue(clean.join(',')); found = true; }
    });
  });
  if (!found) throw new Error('Perangkat ini belum mengaktifkan notifikasi.');
  return _pushStatus_(role, memberId, endpoint);
}

// ---- fungsi publik: klien (member dari token) ---------------------------------

function getMyPushStatus(memberToken, endpoint) { var m = requireMember_(memberToken); return _pushStatus_('member', String(m.row[0]).trim(), endpoint); }
function saveMyPush(memberToken, sub, label) { var m = requireMember_(memberToken); return _pushSave_('member', String(m.row[0]).trim(), sub, label); }
function removeMyPush(memberToken, endpoint) { var m = requireMember_(memberToken); return _pushRemove_('member', String(m.row[0]).trim(), endpoint); }
function setMyPushPrefs(memberToken, endpoint, off) { var m = requireMember_(memberToken); return _pushPrefs_('member', String(m.row[0]).trim(), endpoint, off); }

// ---- fungsi publik: coach (admin) --------------------------------------------

function getAdminPushStatus(token, endpoint) { requireAdmin_(token); return _pushStatus_('admin', 'admin', endpoint); }
function saveAdminPush(token, sub, label) { requireAdmin_(token); return _pushSave_('admin', 'admin', sub, label); }
function removeAdminPush(token, endpoint) { requireAdmin_(token); return _pushRemove_('admin', 'admin', endpoint); }
function setAdminPushPrefs(token, endpoint, off) { requireAdmin_(token); return _pushPrefs_('admin', 'admin', endpoint, off); }

// ---- perencana (murni di sebagian besar) ---------------------------------------

/** Jam WIB sebuah jenis: properti -> Ramadan -> bawaan. */
function _pushHour_(kind, parts) {
  var prop = { 'sesi-besok': 'PUSH_HOUR_SESI_BESOK', 'sesi-hari-ini': 'PUSH_HOUR_SESI_HARI_INI' }[kind];
  var fallback = { 'sesi-besok': 19, 'sesi-hari-ini': 6 }[kind];
  var h;
  if (prop) { h = parseInt(_pushProp_(prop), 10); if (!isNaN(h) && h >= 0 && h <= 23) return h; return fallback; }
  // pr, makan-pagi, makan-sore: sama dengan pengingat WhatsApp-nya
  h = parseInt(_pushProp_('RMD_' + _rmdJobKey_(kind) + '_HOUR'), 10);
  if (!isNaN(h) && h >= 0 && h <= 23) return h;
  if (typeof RMD_RAMADAN_HOURS !== 'undefined' && RMD_RAMADAN_HOURS[kind] != null && _rmdIsRamadan_(parts.date)) return RMD_RAMADAN_HOURS[kind];
  var def = REMINDER_JOBS.filter(function(j) { return j.jenis === kind; })[0];
  return def ? def.hour : 8;
}

/** Murni: jatuh tempo bila jam sekarang antara jam target dan target + PUSH_LATE_HOURS. */
function _pushDue_(parts, hour) { var late = parts.hour - hour; return late >= 0 && late <= PUSH_LATE_HOURS; }

function _pushJoinTimes_(list) { return list.length === 1 ? list[0] : list.slice(0, -1).join(', ') + ' dan ' + list[list.length - 1]; }

/**
 * Murni. Sesi besok / sesi hari ini. mode = 'besok' | 'hari-ini'. members = {id: {name, off:[]}}.
 * Klien: satu pesan per orang. Coach (target 'admin'): satu ringkasan. Hanya nama depan.
 * @returns {Array<{target, kind, slot, title, body}>}
 */
function _pushSesiMessages_(schedules, members, mode, parts, now, slotHour) {
  var tomorrow = _wibParts_(new Date(now.getTime() + 86400000)).date;
  var day = mode === 'besok' ? tomorrow : parts.date;
  var kind = mode === 'besok' ? 'sesi-besok' : 'sesi-hari-ini';
  var slot = parts.date + 'T' + ('0' + slotHour).slice(-2);
  var groups = {}, order = [];
  (schedules || []).forEach(function(s) {
    var st = String(s.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'completed') return;
    var d = new Date(s.start);
    if (isNaN(d.getTime()) || _wibParts_(d).date !== day) return;
    if (mode === 'hari-ini' && d.getTime() < now.getTime()) return;   // sudah lewat: tak perlu diingatkan
    var key = String(s.memberId).trim() || ('tel:' + s.phone);
    if (!groups[key]) { groups[key] = { id: String(s.memberId).trim(), title: s.title, coach: s.coachName || '', times: [] }; order.push(key); }
    groups[key].times.push({ t: d.getTime(), label: Utilities.formatDate(d, REMINDER_TZ, 'HH:mm') });
    if (!groups[key].coach && s.coachName) groups[key].coach = s.coachName;
  });
  var out = [], all = [];
  order.forEach(function(k) {
    var g = groups[k], m = members[g.id];
    g.times.sort(function(a, b) { return a.t - b.t; });
    var name = _pushFirst_((m && m.name) || g.title) || 'Klien';
    var labels = g.times.map(function(x) { return x.label; });
    all.push({ name: name, t: g.times[0].t, label: labels[0], n: labels.length });
    if (!m || (m.off || []).indexOf('sesi-besok') !== -1) return;    // klien mematikan pengingat sesi
    var when = (mode === 'besok' ? 'besok' : 'hari ini') + ' jam ' + _pushJoinTimes_(labels);
    out.push({ target: 'm:' + g.id, kind: kind, slot: slot, title: mode === 'besok' ? 'Sesi besok' : 'Sesi hari ini',
      body: _pushClip_('Kak ' + name + ', ' + when + (g.coach ? ' bersama Coach ' + _pushFirst_(g.coach) : '') + '.', 140) });
  });
  if (all.length) {
    all.sort(function(a, b) { return a.t - b.t; });
    var list = all.map(function(x) { return x.name + ' ' + x.label + (x.n > 1 ? ' (+' + (x.n - 1) + ')' : ''); }).join(', ');
    out.push({ target: 'admin', kind: kind, slot: slot, title: mode === 'besok' ? 'Sesi besok' : 'Sesi hari ini',
      body: _pushClip_(all.length + ' klien: ' + list, 160) });
  }
  return out;
}

/** Murni. PR terlambat / hari ini / besok per klien (entri dari _buildPrDigest_). */
function _pushPrMessages_(list, slot) {
  var out = [];
  (list || []).forEach(function(e) {
    var bits = [];
    if (e.late.length) bits.push(e.late.length + ' terlambat');
    if (e.today.length) bits.push(e.today.length + ' hari ini');
    if (e.tomorrow.length) bits.push(e.tomorrow.length + ' besok');
    if (!bits.length) return;
    out.push({ target: 'm:' + e.client.id, kind: 'pr', slot: slot, title: 'PR dari coach',
      body: _pushClip_('Kak ' + (_pushFirst_(e.client.name) || 'Klien') + ', PR kamu: ' + bits.join(', ') + '.', 140) });
  });
  return out;
}

/** Murni. Waktu makan untuk klien yang tidak mematikannya. waktu = 'pagi' | 'sore'. */
function _pushMakanMessages_(waktu, clients, slot) {
  var kind = 'makan-' + waktu, out = [];
  (clients || []).forEach(function(c) {
    if (c.mealOn === false || _rmdIsOff_(c, kind)) return;
    out.push({ target: 'm:' + c.id, kind: kind, slot: slot, title: waktu === 'pagi' ? 'Makan pagi' : 'Makan sore',
      body: 'Kak ' + (_pushFirst_(c.name) || 'Klien') + ', waktunya makan ' + waktu + '. Catat makananmu di Latihan → Makan.' });
  });
  return out;
}

/** Hasil rencana jam ini (tanpa menulis). now = Date. */
function _pushPlanMessages_(now) {
  var parts = _wibParts_(now), msgs = [];
  var hBesok = _pushHour_('sesi-besok', parts), hIni = _pushHour_('sesi-hari-ini', parts);
  var needSesi = _pushDue_(parts, hBesok) || _pushDue_(parts, hIni);
  var hPr = _pushHour_('pr', parts), hPg = _pushHour_('makan-pagi', parts), hSr = _pushHour_('makan-sore', parts);
  var needPools = _pushDue_(parts, hPr) || _pushDue_(parts, hPg) || _pushDue_(parts, hSr);
  if (!needSesi && !needPools) return msgs;
  var slotOf = function(h) { return parts.date + 'T' + ('0' + h).slice(-2); };
  if (needSesi) {
    var schedules = _getSchedulesAll_(), members = _rmdMemberIndex_();
    if (_pushDue_(parts, hBesok)) msgs = msgs.concat(_pushSesiMessages_(schedules, members, 'besok', parts, now, hBesok));
    if (_pushDue_(parts, hIni)) msgs = msgs.concat(_pushSesiMessages_(schedules, members, 'hari-ini', parts, now, hIni));
  }
  if (needPools) {
    var pools = _loadClientPools_();
    if (_pushDue_(parts, hPr)) {
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var rows = _tasksSheet_().getDataRange().getValues().slice(1);
      msgs = msgs.concat(_pushPrMessages_(_buildPrDigest_(rows, pools.active.filter(function(c) { return !_rmdIsOff_(c, 'pr'); }), today), slotOf(hPr)));
    }
    if (_pushDue_(parts, hPg)) msgs = msgs.concat(_pushMakanMessages_('pagi', pools.all, slotOf(hPg)));
    if (_pushDue_(parts, hSr)) msgs = msgs.concat(_pushMakanMessages_('sore', pools.all, slotOf(hSr)));
  }
  return msgs;
}

/**
 * Taruh pesan di PushOutbox: satu baris per perangkat yang tidak mematikan grup jenisnya.
 * Kunci "<jenis>|<slot>|<subId>" menjaga satu pesan satu kali, berapa pun kali perencana jalan.
 * @returns {number} jumlah baris baru
 */
function _pushEnqueue_(msgs, subs) {
  if (!msgs.length) return 0;
  subs = subs || _pushSubsAll_();
  if (!subs.length) return 0;
  var sheet = _pushOutSheet_();
  var have = {};
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) if (data[i][1]) have[String(data[i][1])] = true;
  var now = Date.now(), rows = [], n = data.length;
  msgs.forEach(function(m) {
    var group = _pushGroupOf_(m.kind);
    subs.forEach(function(s) {
      if (m.target === 'admin' ? s.role !== 'admin' : (s.role !== 'member' || 'm:' + s.memberId !== m.target)) return;
      if (s.off.indexOf(group) !== -1) return;
      var key = m.kind + '|' + m.slot + '|' + s.id;
      if (have[key]) return;
      have[key] = true;
      rows.push(['PO-' + now + '-' + (n + rows.length), key, now, s.id, m.kind, m.title, m.body, '/', 'baru', 0, 0]);
    });
  });
  if (!rows.length) return 0;
  _ensureRoomRows_(sheet, rows.length);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, PUSH_OUT_HEADERS.length).setValues(rows);
  return rows.length;
}

/** Jalankan perencana sekali (dipanggil dari pushRelayPull di bawah lock). */
function _pushPlan_(now) {
  if (!_pushOn_()) return 0;
  var subs = _pushSubsAll_();
  if (!subs.length) return 0;
  return _pushEnqueue_(_pushPlanMessages_(now), subs);
}

/** Kejadian seketika (mis. permintaan perpanjang): satu pesan ke semua perangkat coach, lalu bangunkan workflow. */
function _pushEvent_(msg) {
  try {
    if (!_pushOn_()) return 0;
    var n = _pushEnqueue_([msg]);
    if (n) _pushKick_();
    return n;
  } catch (e) { Logger.log('Push seketika gagal: ' + e); return 0; }
}

/** Opsional: PUSH_GH_TOKEN = token GitHub dengan izin Actions (write). Tanpa itu pesan menunggu giliran cron (<= ~15 menit). */
function _pushKick_() {
  var token = _pushProp_('PUSH_GH_TOKEN');
  if (!token || !_throttle_('push-kick', 20)) return false;
  var repo = _pushProp_('PUSH_GH_REPO') || 'xnkzzxd/xnk';
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) return false;
  try {
    _quotaFetch_();
    UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ event_type: 'push-now' })
    });
    return true;
  } catch (e) { Logger.log('Push kick gagal: ' + e); return false; }
}

// ---- relay: dipanggil GitHub Actions lewat doPost ---------------------------------

function _pushRelayAuth_(secret) {
  var want = _pushProp_('PUSH_RELAY_SECRET'), got = String(secret == null ? '' : secret);
  var ok = want.length >= 24 && got.length === want.length;
  var diff = 0;
  for (var i = 0; i < want.length && i < got.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  if (!ok || diff !== 0) throw new Error('Permintaan tidak valid.');
}

/**
 * Relay: rencanakan yang jatuh tempo, lalu pinjamkan baris siap kirim. Jawaban: {messages:[{id, endpoint, p256dh, auth, payload}], key}.
 * Tanpa token admin/klien; satu-satunya penjaga adalah rahasia relay.
 */
function pushRelayPull(secret) {
  _pushRelayAuth_(secret);
  // Dimatikan (PUSH_ENABLED=false) atau kunci publik belum ada: jawab kosong supaya workflow tetap hijau.
  if (!_pushOn_()) return { messages: [], key: '', privateKey: '' };
  return _locked_(function() {
    var now = Date.now();
    if (_throttle_('push-plan', 60)) { try { _pushPlan_(new Date(now)); } catch (e) { Logger.log('Rencana push gagal: ' + e); } }
    var sheet = _pushOutSheet_();
    var data = sheet.getDataRange().getValues();
    var subs = {};
    _pushSubsAll_().forEach(function(s) { subs[s.id] = s; });
    var out = [];
    for (var i = 1; i < data.length && out.length < PUSH_PULL_LIMIT; i++) {
      var r = data[i], st = String(r[8]);
      var ready = st === 'baru' || (st === 'diambil' && now - (Number(r[10]) || 0) > PUSH_LEASE_MS);
      if (!ready) continue;
      var tries = Number(r[9]) || 0;
      if (now - (Number(r[2]) || 0) > PUSH_EXPIRE_MS || tries >= PUSH_MAX_TRIES || !subs[String(r[3])]) {
        sheet.getRange(i + 1, 9).setValue('gagal');
        continue;
      }
      var s = subs[String(r[3])];
      sheet.getRange(i + 1, 9, 1, 3).setValues([['diambil', tries + 1, now]]);
      out.push({ id: String(r[0]), endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth,
        payload: { title: String(r[5]), body: String(r[6]), url: String(r[7] || '/'), tag: String(r[4]), kind: String(r[4]) } });
    }
    try { if (_wibParts_(new Date(now)).hour === 3) _pushPrune_(now); } catch (e) { Logger.log('Prune push gagal: ' + e); }
    // Kunci privat VAPID hanya keluar lewat jawaban yang dijaga rahasia relay; pengirim memakainya di memori dan tidak menyimpannya.
    // Coach di hub (HUB_SECRET ada, T-2240): kunci privat hanya di secret repo hub, tidak pernah dari sini.
    return { messages: out, key: _pushPublicKey_(), privateKey: _pushProp_('HUB_SECRET') ? '' : _pushProp_('PUSH_VAPID_PRIVATE') };
  });
}

/** Relay: hasil kirim. hasil = [{id, s: 'ok' | 'gone' | 'fail'}]. 'gone' (404/410) menghapus perangkat. */
function pushRelayAck(secret, hasil) {
  _pushRelayAuth_(secret);
  var list = (Array.isArray(hasil) ? hasil : []).slice(0, 200);
  return _locked_(function() {
    var sheet = _pushOutSheet_();
    var data = sheet.getDataRange().getValues();
    var rowOf = {};
    for (var i = 1; i < data.length; i++) rowOf[String(data[i][0])] = i;
    var subSheet = _pushSubsSheet_(), subs = {};
    _pushSubsAll_().forEach(function(s) { subs[s.id] = s; });
    var gone = {}, counted = 0;
    list.forEach(function(x) {
      var i = rowOf[String(x && x.id)];
      if (i == null) return;
      var subId = String(data[i][3]), sub = subs[subId], tries = Number(data[i][9]) || 0, res = String(x.s);
      if (res === 'ok') {
        sheet.getRange(i + 1, 9).setValue('terkirim');
        if (sub && sub.fails) subSheet.getRange(sub.rowNum, 11).setValue(0);
      } else if (res === 'gone') {
        sheet.getRange(i + 1, 9).setValue('gagal');
        if (sub) gone[subId] = sub.rowNum;
      } else {
        sheet.getRange(i + 1, 9).setValue(tries >= PUSH_MAX_TRIES ? 'gagal' : 'baru');
        if (sub) {
          var f = sub.fails + 1; sub.fails = f;
          if (f >= PUSH_FAIL_DROP) gone[subId] = sub.rowNum; else subSheet.getRange(sub.rowNum, 11).setValue(f);
        }
      }
      counted++;
    });
    Object.keys(gone).map(function(k) { return gone[k]; }).sort(function(a, b) { return b - a; }).forEach(function(n) { subSheet.deleteRow(n); });
    return { ok: counted, removed: Object.keys(gone).length };
  });
}

/** Buang baris outbox yang lebih tua dari 3 hari (dari bawah ke atas). */
function _pushPrune_(now) {
  var sheet = _pushOutSheet_(), data = sheet.getDataRange().getValues(), cut = now - 3 * 86400000, n = 0;
  for (var i = data.length - 1; i >= 1 && n < 300; i--) {
    if ((Number(data[i][2]) || 0) < cut && String(data[i][8]) !== 'baru') { sheet.deleteRow(i + 1); n++; }
  }
  return n;
}
