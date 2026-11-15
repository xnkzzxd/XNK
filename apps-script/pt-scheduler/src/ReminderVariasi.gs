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
// Kelompok hari: senin, jumat, sabtu, minggu (bila ada teksnya), lalu weekday / weekend; tanggal
// merah (RMD_HOLIDAYS.merah) memakai weekend.
// Kunci khusus: <jenis>-banyak (2+ sesi / 2+ PR), booking-habis (paket habis),
// ramadan-<jenis>, libur (Hari = kunci hari libur), personal-kangen|sisa|streak|catat|catat-yuk
// (satu baris tambahan di {personal}).
// Makan (2026-11): makan-<waktu>-latihan (ada sesi hari ini), makan-pagi-pulih (sesi selesai
// kemarin), makan-<waktu>-baru (14 hari pertama, urut per hari), makan-cek (sapaan Rabu).
// Kolom Tag menyaring teks per klien (tujuan gizi, pantangan, anggaran); lihat ReminderTeks.gs.
// =============================================================================

var RMD_VARIASI_SHEET = 'PesanVariasi';
var RMD_VARIASI_HEADERS = ['Jenis', 'Hari', 'Teks', 'Aktif', 'Tag', 'Sumber'];
var RMD_VARIASI_VER = 2;      // versi teks bawaan; _rmdUpgradeVariasi_ mengganti baris bawaan lama satu kali
var RMD_TAG_GOALS = ['turun', 'naik', 'jaga', 'recomp'];
var RMD_TAG_BAHAN = ['telur', 'seafood', 'kacang', 'susu'];
var RMD_TAGS = RMD_TAG_GOALS.concat(RMD_TAG_BAHAN, ['mahal', 'porsi']);
var RMD_NEW_DAYS = 14;        // klien baru: makan pagi + sore selama ini, sesudahnya satu kali sehari
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
  if (k === 'makan-cek') return 'makan-sore';
  return k.replace(/^ramadan-/, '').replace(/-(banyak|latihan|pulih|baru)$/, '');
}

/** Murni: teks sebuah entri (string atau {t, tag, src}). */
function _rmdT_(e) { return e && typeof e === 'object' ? String(e.t == null ? '' : e.t) : String(e == null ? '' : e); }
/** Murni: daftar tag sebuah entri / sel Tag. */
function _rmdTagList_(tag) {
  return String(tag == null ? '' : tag).split(',').map(function(x) { return x.trim().toLowerCase(); }).filter(String);
}
function _rmdTagsOf_(e) { return e && typeof e === 'object' ? _rmdTagList_(e.tag) : []; }

/**
 * Murni: apakah teks bertag ini cocok untuk klien. profil = { goal, hemat, pantang: [], hatiHati }.
 * Tag tujuan → hanya klien dengan Goal Gizi itu; tag bahan → dilewati bila berpantang (laktosa ikut susu);
 * mahal → dilewati untuk anggaran hemat; porsi → dilewati untuk penanda hamil / gangguan-makan.
 */
function _rmdTagOk_(tags, profil) {
  var p = profil || {}, ban = p.pantang || [];
  var goals = tags.filter(function(t) { return RMD_TAG_GOALS.indexOf(t) >= 0; });
  if (goals.length && goals.indexOf(String(p.goal || '')) < 0) return false;
  if (tags.indexOf('mahal') >= 0 && p.hemat) return false;
  if (tags.indexOf('porsi') >= 0 && p.hatiHati) return false;
  return !tags.some(function(t) {
    return RMD_TAG_BAHAN.indexOf(t) >= 0 && (ban.indexOf(t) >= 0 || (t === 'susu' && ban.indexOf('laktosa') >= 0));
  });
}
/** Murni: entri yang cocok untuk klien; bila tidak ada, entri tanpa tag. */
function _rmdFilter_(list, profil) {
  if (!list || !list.length) return [];
  var ok = list.filter(function(e) { return _rmdTagOk_(_rmdTagsOf_(e), profil); });
  return ok.length ? ok : list.filter(function(e) { return !_rmdTagsOf_(e).length; });
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
function _rmdIsMerah_(iso) { return (RMD_HOLIDAYS.merah || []).indexOf(String(iso)) >= 0; }
/** Murni: 0 = Senin … 6 = Minggu. */
function _rmdDow_(iso) { return (_rmdDayNum_(iso) + 3) % 7; }
function _rmdIsoOf_(dayNum) { return new Date(dayNum * 86400000).toISOString().slice(0, 10); }
function _rmdIsRamadan_(iso) {
  return RMD_HOLIDAYS.ramadan.some(function(r) { return iso >= r[0] && iso <= r[1]; });
}

// ── Sheet ───────────────────────────────────────────────────────────────────
/** Isi sheet PesanVariasi dari bawaan bila belum ada barisnya. Dipanggil di runReminderTick (lock dipegang). */
function _rmdSeedVariasi_() {
  var sh = getOrCreateSheet_(RMD_VARIASI_SHEET, RMD_VARIASI_HEADERS);
  if (sh.getLastRow() > 1) return 0;
  var rows = _rmdDefaultRows_();
  sh.getRange(2, 1, rows.length, RMD_VARIASI_HEADERS.length).setValues(rows);
  PropertiesService.getScriptProperties().setProperty('RMD_VARIASI_VER', String(RMD_VARIASI_VER));
  return rows.length;
}

/** Murni: teks bawaan sebagai baris sheet. */
function _rmdDefaultRows_() {
  var rows = [];
  Object.keys(RMD_VARIANTS_DEFAULT).forEach(function(key) {
    var g = RMD_VARIANTS_DEFAULT[key];
    Object.keys(g).forEach(function(hari) {
      g[hari].forEach(function(e) {
        rows.push([key, hari, _rmdT_(e), 'ya', _rmdTagsOf_(e).join(','), e && typeof e === 'object' ? String(e.src || '') : '']);
      });
    });
  });
  return rows;
}

/**
 * Sekali per versi teks bawaan (Script Property RMD_VARIASI_VER): baris yang masih sama dengan teks bawaan
 * versi 1 (sidik di RMD_VARIASI_V1_HASH) diganti teks bawaan baru; baris yang diubah / ditambah pemilik tetap.
 * Dipanggil di runReminderTick (lock dipegang). @returns {number} baris lama yang diganti, -1 bila tidak perlu.
 */
function _rmdUpgradeVariasi_() {
  var props = PropertiesService.getScriptProperties();
  if (Number(props.getProperty('RMD_VARIASI_VER')) >= RMD_VARIASI_VER) return -1;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RMD_VARIASI_SHEET), replaced = 0;
  if (sh && sh.getLastRow() > 1) {
    var values = sh.getDataRange().getValues();
    var hdr = values[0].map(function(x) { return String(x).trim().toLowerCase(); });
    var col = RMD_VARIASI_HEADERS.map(function(h) { return hdr.indexOf(h.toLowerCase()); });
    var old = {};
    RMD_VARIASI_V1_HASH.forEach(function(h) { old[h] = true; });
    var keep = [];
    values.slice(1).forEach(function(r) {
      var t = String(col[2] < 0 || r[col[2]] == null ? '' : r[col[2]]).replace(/\r\n/g, '\n').trim();
      if (!t) return;
      if (old[_rmdHash_(t)]) { replaced++; return; }
      keep.push(col.map(function(c) { return c < 0 || r[c] == null ? '' : r[c]; }));
    });
    var rows = [RMD_VARIASI_HEADERS].concat(keep, _rmdDefaultRows_());
    sh.getRange(1, 1, rows.length, RMD_VARIASI_HEADERS.length).setValues(rows);   // selalu lebih panjang dari isi lama
  }
  props.setProperty('RMD_VARIASI_VER', String(RMD_VARIASI_VER));
  return replaced;
}

/** Murni: baris sheet → pool {kunci: {hari: [teks]}}; baris salah dilewati (dicatat di log). */
function _rmdPoolFromRows_(values) {
  var pool = {};
  if (!values || values.length < 2) return pool;
  var hdr = values[0].map(function(x) { return String(x).trim().toLowerCase(); });
  var cJ = hdr.indexOf('jenis'), cH = hdr.indexOf('hari'), cT = hdr.indexOf('teks'), cA = hdr.indexOf('aktif'), cG = hdr.indexOf('tag'), cS = hdr.indexOf('sumber');
  if (cJ < 0 || cT < 0) return pool;
  values.slice(1).forEach(function(r, i) {
    var key = String(r[cJ] || '').trim().toLowerCase();
    var hari = cH < 0 ? 'semua' : (String(r[cH] || '').trim().toLowerCase() || 'semua');
    if (!key || (cA >= 0 && /^(tidak|no|false|0|off)$/i.test(String(r[cA]).trim()))) return;
    var t, tags = cG < 0 ? [] : _rmdTagList_(r[cG]);
    try {
      t = _rmdVarCheck_(key, String(r[cT] == null ? '' : r[cT]).replace(/\r\n/g, '\n'));
      tags.forEach(function(x) { if (RMD_TAGS.indexOf(x) < 0) throw new Error('Tag tidak dikenal: ' + x + '.'); });
    } catch (e) { Logger.log('PesanVariasi baris ' + (i + 2) + ' dilewati: ' + e.message); return; }
    if (!pool[key]) pool[key] = {};
    (pool[key][hari] = pool[key][hari] || []).push(tags.length ? { t: t, tag: tags.join(','), src: cS < 0 ? '' : String(r[cS] || '') } : t);
  });
  return pool;
}

/** Pool aktif: sheet bila ada isinya per kunci, kalau tidak bawaan kode. */
function _rmdVariantPool_() {
  var pool = {};
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RMD_VARIASI_SHEET);
    if (sh && sh.getLastRow() > 1) pool = _rmdPoolFromRows_(sh.getDataRange().getValues());
  } catch (e) { Logger.log('PesanVariasi dilewati: ' + e); }
  Object.keys(RMD_VARIANTS_DEFAULT).forEach(function(k) { if (!pool[k]) pool[k] = RMD_VARIANTS_DEFAULT[k]; });
  return pool;
}

// ── Pilih teks ──────────────────────────────────────────────────────────────
var RMD_DAY_KEYS = ['senin', '', '', '', 'jumat', 'sabtu', 'minggu'];   // indeks = _rmdDow_

/**
 * Murni: daftar + nomor urut untuk satu kunci pada tanggal itu, atau null. profil menyaring teks bertag.
 * Urutan: kunci hari (senin/jumat/sabtu/minggu) → weekday/weekend (tanggal merah = weekend) → semua → kelompok lain.
 * Nomor urut weekday/weekend hanya menghitung hari yang memakai daftar itu, jadi seluruh daftar dilewati sebelum berulang.
 */
function _rmdVarList_(pool, key, iso, hari, profil) {
  var g = pool && pool[key];
  if (!g) return null;
  var pick = function(name, seq) { var l = _rmdFilter_(g[name], profil); return l.length ? { list: l, seq: seq } : null; };
  if (hari) return pick(hari, parseInt(String(iso).slice(0, 4), 10));
  var n = _rmdDayNum_(iso), dow = _rmdDow_(iso), wk = Math.floor((n + 3) / 7), merah = _rmdIsMerah_(iso);
  var has = function(name) { return !!(name && g[name] && g[name].length); };
  var first = merah || dow >= 5 ? 'weekend' : 'weekday', second = first === 'weekend' ? 'weekday' : 'weekend';
  var slots = (first === 'weekend' ? [5, 6] : [0, 1, 2, 3, 4]).filter(function(d) { return !has(RMD_DAY_KEYS[d]); });
  var idx = merah ? -1 : slots.indexOf(dow);
  return (!merah && has(RMD_DAY_KEYS[dow]) && pick(RMD_DAY_KEYS[dow], wk))
    || pick(first, idx < 0 ? n : wk * slots.length + idx)
    || pick('semua', n)
    || pick(second, n);
}
function _rmdPickFrom_(r, key) { return _rmdT_(r.list[(r.seq + _rmdHash_(key)) % r.list.length]); }

/**
 * Murni (selain fallback template): template untuk satu klien pada tanggal iso.
 * opts = { banyak, habis, profil, cek, baruHari (1…RMD_NEW_DAYS), sesi: 'latihan' | 'pulih' }.
 * Paket habis tanpa teks booking-habis → '' (klien dilewati).
 */
function _rmdVariant_(pool, jenis, iso, clientKey, opts) {
  opts = opts || {};
  var tries = [], hol = _rmdHoliday_(iso), ram = _rmdIsRamadan_(iso), makan = jenis === 'makan-pagi' || jenis === 'makan-sore';
  if (jenis === 'hidup-sehat') { if (hol) tries.push(['libur', hol]); if (ram) tries.push(['ramadan-hidup-sehat']); }
  if (makan && ram) tries.push(['ramadan-' + jenis]);
  if (makan && !ram && opts.cek) tries.push(['makan-cek']);
  if (makan && !ram && !opts.cek && opts.baruHari > 0) {
    var seri = pool && pool[jenis + '-baru'] && pool[jenis + '-baru'].semua;
    if (seri && seri.length) return _rmdT_(seri[(opts.baruHari - 1) % seri.length]);   // seri urut per hari, bukan rotasi
  }
  if (makan && opts.sesi) tries.push([jenis + '-' + opts.sesi]);
  if ((jenis === 'sesi-besok' || jenis === 'pr') && opts.banyak) tries.push([jenis + '-banyak']);
  tries.push([jenis === 'booking-minggu' && opts.habis ? 'booking-habis' : jenis]);
  for (var i = 0; i < tries.length; i++) {
    var r = _rmdVarList_(pool, tries[i][0], iso, tries[i][1], opts.profil);
    if (r) return _rmdPickFrom_(r, clientKey + '|' + tries[i][0]);
  }
  return opts.habis ? '' : _rmdTemplate_(jenis);
}

/**
 * Murni: konteks sesi per klien pada tanggal iso (WIB): { memberId: { today: 'HH:mm' sesi pertama hari ini | '',
 * doneYesterday: true bila ada sesi selesai kemarin } }. Sesi batal dilewati.
 */
function _rmdSesiCtx_(schedules, iso) {
  var out = {}, kemarin = _rmdIsoOf_(_rmdDayNum_(iso) - 1);
  (schedules || []).forEach(function(s) {
    var st = String(s.status || '').toLowerCase();
    if (st === 'cancelled') return;
    var d = new Date(s.start);
    if (isNaN(d.getTime())) return;
    var id = String(s.memberId).trim(), day = Utilities.formatDate(d, REMINDER_TZ, 'yyyy-MM-dd');
    if (!id || (day !== iso && !(day === kemarin && st === 'completed'))) return;
    var o = out[id] || (out[id] = { today: '', doneYesterday: false });
    if (day === iso) { var jam = Utilities.formatDate(d, REMINDER_TZ, 'HH:mm'); if (!o.today || jam < o.today) o.today = jam; }
    else o.doneYesterday = true;
  });
  return out;
}

/** Murni: tanggal gabung (Date, 'yyyy-MM-dd…' atau 'd/m/yyyy') → 'yyyy-MM-dd', '' bila tak terbaca. */
function _rmdJoinIso_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, REMINDER_TZ, 'yyyy-MM-dd');
  var t = String(v == null ? '' : v).trim(), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
/** Murni: hari ke-berapa sejak gabung (1 = hari gabung) selama masih klien baru, selain itu 0. */
function _rmdNewDay_(joinIso, iso) {
  if (!joinIso) return 0;
  var d = _rmdDayNum_(iso) - _rmdDayNum_(joinIso);
  return d >= 0 && d < RMD_NEW_DAYS ? d + 1 : 0;
}
/**
 * Murni: apakah klien mendapat pesan makan <waktu> ('pagi' | 'sore') hari ini.
 * Klien baru: keduanya. Lainnya satu kali sehari: Rabu = sore (sapaan), hari lain bergantian per hari,
 * digeser per klien supaya dua digest coach tetap seimbang.
 */
function _rmdMakanTurn_(client, iso, waktu) {
  if (_rmdNewDay_(client.join, iso)) return true;
  if (_rmdDow_(iso) === 2) return waktu === 'sore';
  return ((_rmdDayNum_(iso) + _rmdHash_(client.phone || client.name)) % 2 === 0) === (waktu === 'pagi');
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

/**
 * Murni: satu baris tambahan atau ''. Urutan: kangen → sisa → catat (terima kasih) → streak → catat-yuk (hanya Senin & Kamis).
 * opts.noKangen untuk sesi-besok; opts.catat = 'ya' (kemarin mencatat makan) | 'yuk' (Gizi aktif, kemarin tidak mencatat).
 */
function _rmdPersonalLine_(pool, client, iso, act, opts) {
  var a = act && act[String(client.id || '').trim()], kind = '', vars = { nama: client.name };
  var rem = Number(client.remaining);
  if (a && a.last && !(opts && opts.noKangen) && _rmdDayNum_(iso) - _rmdDayNum_(a.last) >= RMD_KANGEN_DAYS) kind = 'kangen';
  else if (rem > 0 && rem <= RMD_SISA_MAX) { kind = 'sisa'; vars.sisa = String(rem); }
  else if (opts && opts.catat === 'ya') kind = 'catat';
  else {
    var st = a ? _streak_(a.weeks, iso) : 0, dow = _rmdDow_(iso);
    if (st >= RMD_STREAK_MIN) { kind = 'streak'; vars.minggu = String(st); }
    else if (opts && opts.catat === 'yuk' && (dow === 0 || dow === 3)) kind = 'catat-yuk';
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
