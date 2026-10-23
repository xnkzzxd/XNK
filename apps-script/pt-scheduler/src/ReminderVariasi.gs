// =============================================================================
// ReminderVariasi.gs — variasi pesan pengingat klien supaya tidak terasa seperti bot.
// Jenis: hidup-sehat, makan-pagi, makan-sore, sesi-besok, pr, booking-minggu.
// Teks diambil dari sheet PesanVariasi (Jenis | Hari | Teks | Aktif); sheet itu diisi sekali
// dari RMD_VARIANTS_DEFAULT (ReminderTeks.gs) saat tick pertama. Variasi SELALU dipakai untuk
// jenis di atas (template di Pengaturan hanya untuk jenis lain).
//
// Pilihan teks: urutan per hari (weekday / weekend terpisah) + geser per klien (hash nomor),
// jadi teks berganti tiap hari, satu klien melewati seluruh daftar sebelum ada ulangan, dan
// klien berbeda mendapat teks berbeda di hari yang sama.
// Kunci khusus: <jenis>-banyak (2+ sesi / 2+ PR), booking-habis (paket habis),
// ramadan-<jenis>, libur (Hari = kunci hari libur), personal-kangen|sisa|streak (satu baris
// tambahan di {personal}).
// =============================================================================

var RMD_VARIASI_SHEET = 'PesanVariasi';
var RMD_VARIASI_HEADERS = ['Jenis', 'Hari', 'Teks', 'Aktif'];
var RMD_VARIASI_JENIS = ['hidup-sehat', 'makan-pagi', 'makan-sore', 'sesi-besok', 'pr', 'booking-minggu'];
var RMD_PERSONAL_PH = ['nama', 'sisa', 'minggu'];
var RMD_KANGEN_DAYS = 14;     // tanpa sesi selesai selama ini → baris "kangen"
var RMD_SISA_MAX = 2;         // sisa sesi 1–2 → baris "sisa"
var RMD_STREAK_MIN = 3;       // streak minggu ≥ ini → baris "streak"
var RMD_RAMADAN_HOURS = { 'makan-pagi': 3, 'makan-sore': 17 };   // sahur & menjelang berbuka (WIB)

/** Murni: "Kak Rina Wulandari" / "Rina Wulandari" → "Rina". */
function _rmdSapa_(name) {
  var w = String(name == null ? '' : name).trim().split(/\s+/).filter(String);
  if (w.length > 1 && /^(kak|ka|kakak)\.?$/i.test(w[0])) w.shift();
  return w[0] || '';
}

/** Murni: jenis dasar untuk placeholder sebuah kunci variasi (null untuk baris personal). */
function _rmdVarBase_(key) {
  var k = String(key || '');
  if (/^personal-/.test(k)) return null;
  if (k === 'libur') return 'hidup-sehat';
  if (k === 'booking-habis') return 'booking-minggu';
  return k.replace(/^ramadan-/, '').replace(/-banyak$/, '');
}

/** Murni: validasi satu teks variasi; lempar error Indonesia. */
function _rmdVarCheck_(key, text) {
  var base = _rmdVarBase_(key);
  var allowed = base === null ? RMD_PERSONAL_PH : RMD_PLACEHOLDERS[base];
  if (!allowed || (base !== null && RMD_VARIASI_JENIS.indexOf(base) < 0)) throw new Error('Jenis variasi tidak dikenal: ' + key + '.');
  var t = _rmdCheckTpl_(allowed, text);
  if (!t) throw new Error('Teks kosong.');
  return t;
}

// ── Kalender ────────────────────────────────────────────────────────────────
function _rmdDayNum_(iso) {
  var p = String(iso).split('-');
  return Math.floor(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)) / 86400000);
}
function _rmdIsWeekend_(iso) { var d = (_rmdDayNum_(iso) + 4) % 7; return d === 0 || d === 6; }   // 1970-01-01 = Kamis
/** Murni: nomor urut hari dalam kelompoknya (weekday naik 1 tiap hari kerja, weekend tiap Sabtu/Minggu). */
function _rmdSeq_(iso, group) {
  var n = _rmdDayNum_(iso), mi = (n + 3) % 7, wk = Math.floor((n + 3) / 7);   // mi: 0 = Senin
  if (group === 'weekday') return wk * 5 + Math.min(mi, 4);
  if (group === 'weekend') return wk * 2 + Math.max(mi - 5, 0);
  return n;
}
function _rmdHash_(s) {
  var h = 0, t = String(s == null ? '' : s);
  for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function _rmdHoliday_(iso) {
  return RMD_HOLIDAYS.dates[iso] || RMD_HOLIDAYS.fixed[String(iso).slice(5)] || '';
}
function _rmdIsRamadan_(iso) {
  return RMD_HOLIDAYS.ramadan.some(function(r) { return iso >= r[0] && iso <= r[1]; });
}

// ── Sheet ───────────────────────────────────────────────────────────────────
/** Isi sheet PesanVariasi dari bawaan bila belum ada barisnya. Dipanggil di runReminderTick (lock dipegang). */
function _rmdSeedVariasi_() {
  var sh = getOrCreateSheet_(RMD_VARIASI_SHEET, RMD_VARIASI_HEADERS);
  if (sh.getLastRow() > 1) return 0;
  var rows = [];
  Object.keys(RMD_VARIANTS_DEFAULT).forEach(function(key) {
    var g = RMD_VARIANTS_DEFAULT[key];
    Object.keys(g).forEach(function(hari) {
      g[hari].forEach(function(t) { rows.push([key, hari, t, 'ya']); });
    });
  });
  sh.getRange(2, 1, rows.length, RMD_VARIASI_HEADERS.length).setValues(rows);
  return rows.length;
}

/** Murni: baris sheet → pool {kunci: {hari: [teks]}}; baris salah dilewati (dicatat di log). */
function _rmdPoolFromRows_(values) {
  var pool = {};
  if (!values || values.length < 2) return pool;
  var hdr = values[0].map(function(x) { return String(x).trim().toLowerCase(); });
  var cJ = hdr.indexOf('jenis'), cH = hdr.indexOf('hari'), cT = hdr.indexOf('teks'), cA = hdr.indexOf('aktif');
  if (cJ < 0 || cT < 0) return pool;
  values.slice(1).forEach(function(r, i) {
    var key = String(r[cJ] || '').trim().toLowerCase();
    var hari = cH < 0 ? 'semua' : (String(r[cH] || '').trim().toLowerCase() || 'semua');
    if (!key || (cA >= 0 && /^(tidak|no|false|0|off)$/i.test(String(r[cA]).trim()))) return;
    var t;
    try { t = _rmdVarCheck_(key, String(r[cT] == null ? '' : r[cT]).replace(/\r\n/g, '\n')); }
    catch (e) { Logger.log('PesanVariasi baris ' + (i + 2) + ' dilewati: ' + e.message); return; }
    if (!pool[key]) pool[key] = {};
    (pool[key][hari] = pool[key][hari] || []).push(t);
  });
  return pool;
}

/** Pool aktif: sheet bila ada isinya per kunci, kalau tidak bawaan kode. */
function _rmdVariantPool_() {
  var pool = {};
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RMD_VARIASI_SHEET);
    if (sh && sh.getLastRow() > 1) pool = _rmdPoolFromRows_(_vals_(sh));
  } catch (e) { Logger.log('PesanVariasi dilewati: ' + e); }
  Object.keys(RMD_VARIANTS_DEFAULT).forEach(function(k) { if (!pool[k]) pool[k] = RMD_VARIANTS_DEFAULT[k]; });
  return pool;
}

// ── Pilih teks ──────────────────────────────────────────────────────────────
/** Murni: daftar + nomor urut untuk satu kunci pada tanggal itu, atau null. */
function _rmdVarList_(pool, key, iso, hari) {
  var g = pool && pool[key];
  if (!g) return null;
  if (hari) return (g[hari] && g[hari].length) ? { list: g[hari], seq: parseInt(String(iso).slice(0, 4), 10) } : null;
  var first = _rmdIsWeekend_(iso) ? 'weekend' : 'weekday', second = first === 'weekend' ? 'weekday' : 'weekend';
  if (g[first] && g[first].length) return { list: g[first], seq: _rmdSeq_(iso, first) };
  if (g.semua && g.semua.length) return { list: g.semua, seq: _rmdDayNum_(iso) };
  if (g[second] && g[second].length) return { list: g[second], seq: _rmdDayNum_(iso) };
  return null;
}
function _rmdPickFrom_(r, key) { return r.list[(r.seq + _rmdHash_(key)) % r.list.length]; }

/**
 * Murni (selain fallback template): template untuk satu klien pada tanggal iso.
 * opts = { banyak, habis }. Paket habis tanpa teks booking-habis → '' (klien dilewati).
 */
function _rmdVariant_(pool, jenis, iso, clientKey, opts) {
  opts = opts || {};
  var tries = [], hol = _rmdHoliday_(iso), ram = _rmdIsRamadan_(iso);
  if (jenis === 'hidup-sehat') { if (hol) tries.push(['libur', hol]); if (ram) tries.push(['ramadan-hidup-sehat']); }
  if ((jenis === 'makan-pagi' || jenis === 'makan-sore') && ram) tries.push(['ramadan-' + jenis]);
  if ((jenis === 'sesi-besok' || jenis === 'pr') && opts.banyak) tries.push([jenis + '-banyak']);
  tries.push([jenis === 'booking-minggu' && opts.habis ? 'booking-habis' : jenis]);
  for (var i = 0; i < tries.length; i++) {
    var r = _rmdVarList_(pool, tries[i][0], iso, tries[i][1]);
    if (r) return _rmdPickFrom_(r, clientKey + '|' + tries[i][0]);
  }
  return opts.habis ? '' : _rmdTemplate_(jenis);
}

// ── Baris personal ──────────────────────────────────────────────────────────
/** Dari jadwal: { memberId: { last: 'YYYY-MM-DD' sesi selesai terakhir, weeks: {senin: true} } }. */
function _rmdActivity_(schedules) {
  var out = {};
  (schedules || []).forEach(function(s) {
    if (String(s.status || '').toLowerCase() !== 'completed') return;
    var d = new Date(s.completedAt || s.start);
    if (isNaN(d.getTime())) return;
    var id = String(s.memberId).trim(), iso = Utilities.formatDate(d, REMINDER_TZ, 'yyyy-MM-dd');
    var o = out[id] || (out[id] = { last: '', weeks: {} });
    if (iso > o.last) o.last = iso;
    o.weeks[_weekStart_(iso)] = true;
  });
  return out;
}

/** Murni: satu baris tambahan (kangen → sisa → streak) atau ''. opts.noKangen untuk sesi-besok. */
function _rmdPersonalLine_(pool, client, iso, act, opts) {
  var a = act && act[String(client.id || '').trim()], kind = '', vars = { nama: client.name };
  var rem = Number(client.remaining);
  if (a && a.last && !(opts && opts.noKangen) && _rmdDayNum_(iso) - _rmdDayNum_(a.last) >= RMD_KANGEN_DAYS) kind = 'kangen';
  else if (rem > 0 && rem <= RMD_SISA_MAX) { kind = 'sisa'; vars.sisa = String(rem); }
  else if (a) {
    var st = _streak_(a.weeks, iso);
    if (st >= RMD_STREAK_MIN) { kind = 'streak'; vars.minggu = String(st); }
  }
  if (!kind) return '';
  var r = _rmdVarList_(pool, 'personal-' + kind, iso);
  return r ? '\n\n' + _rmdFill_(_rmdPickFrom_(r, (client.phone || client.name) + '|p-' + kind), vars) : '';
}

/** Teks WhatsApp untuk satu klien. client = {id, name, phone, remaining}; vars = isi placeholder lain. */
function _rmdClientText_(pool, jenis, iso, client, vars, act, opts) {
  var tpl = _rmdVariant_(pool, jenis, iso, client.phone || client.name, opts);
  if (!tpl) return '';
  var v = {};
  Object.keys(vars || {}).forEach(function(k) { v[k] = vars[k]; });
  v.nama = client.name;
  v.personal = act ? _rmdPersonalLine_(pool, client, iso, act, opts) : '';
  return _rmdFill_(tpl, v);
}
