// =============================================================================
// Cuti.gs — Fase AC1 (T-2304…T-2311): klien ditahan (cuti, sakit, berhenti).
// Sheet ClientHolds adalah satu-satunya sumber (riwayat ikut). Status dihitung dari tanggal, jadi klien aktif lagi
// sendiri sehari sesudah tanggal "Sampai". Catatan bisa berisi info kesehatan: hanya untuk admin (getClientBundle),
// tidak pernah di bootstrap, Telegram, push, xnk_admin_cache, jawaban publik, atau laporan PDF.
// docs/coachkit/Design.md §AC1.
// =============================================================================

const HOLD_HEADERS = ['ID', 'Member ID', 'Jenis', 'Mulai', 'Sampai', 'Catatan', 'Status', 'Dibuat Oleh', 'Dibuat Pada', 'Diputuskan Pada', 'Diakhiri Pada', 'Sesi Dibatalkan'];
const HOLD_TYPES = ['cuti', 'sakit', 'berhenti'];
const HOLD_TYPE_LABEL = { cuti: 'Cuti', sakit: 'Sakit', berhenti: 'Nonaktif' };
// Status baris: minta (klien mengajukan) · ok (berlaku; direncanakan, aktif, atau lewat menurut tanggal) · tolak · batal.
const HOLD = { weekDays: 4, coachBackDays: 30, aheadDays: 365, noteMax: 200, requestMaxDefault: 60, throttleSec: 10 };
// Jenis pengingat yang tetap terkirim ke klien yang ditahan: ucapan ulang tahun (keputusan pemilik 2026-11-26) dan
// pengingat sesi besok — sesi di dalam masa cuti yang tidak dibatalkan coach memang tetap berjalan.
const HOLD_KEEP_TYPES = ['ulang-tahun', 'sesi-besok'];
const HOLD_DAYS_ = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HOLD_MONTHS_ = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function _holdSheet_() {
  const sh = getOrCreateSheet_('ClientHolds', HOLD_HEADERS);
  sh.getRange('D:E').setNumberFormat('@');
  return sh;
}

/** Murni: baris sheet (tanpa header) → daftar hold. */
function _holdParse_(rows) {
  return (rows || []).filter(function(r) { return r && r[0]; }).map(function(r) {
    return {
      id: String(r[0]), memberId: String(r[1] || '').trim(), jenis: String(r[2] || '').trim(),
      mulai: _isoDateCell_(r[3]), sampai: _isoDateCell_(r[4]), note: String(r[5] == null ? '' : r[5]),
      status: String(r[6] || '').trim(), by: String(r[7] || '').trim(), at: String(r[8] || ''),
      decidedAt: String(r[9] || ''), endedAt: String(r[10] || ''), cancelled: String(r[11] || '')
    };
  });
}
/** Semua hold (sekali per bundle lewat _sheetRowsMemo_). */
function _holdRows_() { return _holdParse_(_sheetRowsMemo_('ClientHolds')); }

/** Murni: hold berlaku (status ok) yang menutupi tanggal iso. */
function _holdCovers_(h, iso) { return h.status === 'ok' && h.mulai && h.mulai <= iso && (!h.sampai || iso <= h.sampai); }
function _holdActiveOn_(holds, memberId, iso) {
  const id = String(memberId).trim();
  return (holds || []).find(function(h) { return h.memberId === id && _holdCovers_(h, iso); }) || null;
}
/** Murni: { memberId: hold } yang aktif di tanggal iso. */
function _holdMap_(holds, iso) {
  const out = {};
  (holds || []).forEach(function(h) { if (_holdCovers_(h, iso) && !out[h.memberId]) out[h.memberId] = h; });
  return out;
}
/** Murni: rentang [mulai, sampai] (sampai kosong = tanpa akhir) bertumpuk dengan hold ok/minta lain milik klien itu? */
function _holdOverlap_(holds, memberId, mulai, sampai, exceptId) {
  const id = String(memberId).trim(), end = sampai || '9999-12-31';
  return (holds || []).some(function(h) {
    if (h.memberId !== id || h.id === exceptId || (h.status !== 'ok' && h.status !== 'minta')) return false;
    return h.mulai <= end && mulai <= (h.sampai || '9999-12-31');
  });
}
/** Murni: minggu (Senin, WIB) yang minimal HOLD.weekDays harinya ditahan, sampai hari ini. { 'YYYY-MM-DD': true }. */
function _holdHeldWeeks_(holds, memberId, todayIso) {
  const id = String(memberId).trim(), count = {};
  (holds || []).forEach(function(h) {
    if (h.memberId !== id || h.status !== 'ok' || !h.mulai || h.mulai > todayIso) return;
    const last = h.sampai && h.sampai < todayIso ? h.sampai : todayIso;
    let d = h.mulai, n = 0;
    while (d <= last && n < 1200) { const w = _weekStart_(d); count[w] = (count[w] || 0) + 1; d = _addDaysIso_(d, 1); n++; }
  });
  const out = {};
  Object.keys(count).forEach(function(w) { if (count[w] >= HOLD.weekDays) out[w] = true; });
  return out;
}
/** Murni: jumlah hari bulan `ym` (YYYY-MM) yang ditahan, sampai akhir bulan. */
function _holdDaysInMonth_(holds, memberId, ym) {
  const id = String(memberId).trim(), first = ym + '-01';
  const last = _addDaysIso_(_addDaysIso_(first, 32).slice(0, 7) + '-01', -1);
  const held = {};
  (holds || []).forEach(function(h) {
    if (h.memberId !== id || h.status !== 'ok') return;
    let d = h.mulai > first ? h.mulai : first;
    const end = h.sampai && h.sampai < last ? h.sampai : last;
    while (d <= end) { held[d] = true; d = _addDaysIso_(d, 1); }
  });
  return { held: Object.keys(held).length, days: Number(last.slice(8)) };
}

/** Murni: 'Jum 12 Des' dari 'YYYY-MM-DD'. */
function _holdDay_(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return HOLD_DAYS_[d.getUTCDay()] + ' ' + p[2] + ' ' + HOLD_MONTHS_[p[1] - 1];
}
/** Murni: keadaan hold di tanggal today: minta | tolak | batal | rencana | aktif | lewat. */
function _holdState_(h, today) {
  if (h.status !== 'ok') return h.status;
  if (h.mulai > today) return 'rencana';
  if (h.sampai && h.sampai < today) return 'lewat';
  return 'aktif';
}
/** Murni: label pendek untuk pil dan pita. */
function _holdLabel_(h, today) {
  const t = HOLD_TYPE_LABEL[h.jenis] || 'Ditahan', st = _holdState_(h, today);
  if (h.jenis === 'berhenti') return st === 'rencana' ? 'Nonaktif mulai ' + _holdDay_(h.mulai) : 'Nonaktif';
  if (st === 'rencana') return t + ' mulai ' + _holdDay_(h.mulai);
  if (st === 'minta') return 'Minta ' + t.toLowerCase() + ' ' + _holdDay_(h.mulai) + (h.sampai ? ' – ' + _holdDay_(h.sampai) : '');
  return h.sampai ? t + ' s/d ' + _holdDay_(h.sampai) : t;
}
/** Murni: bentuk keluar ke browser. withNote hanya untuk admin di halaman klien (dan klien untuk catatannya sendiri). */
function _holdOut_(h, today, withNote) {
  const o = { id: h.id, memberId: h.memberId, jenis: h.jenis, mulai: h.mulai, sampai: h.sampai, status: h.status, by: h.by,
    state: _holdState_(h, today), label: _holdLabel_(h, today), decidedAt: h.decidedAt, endedAt: h.endedAt,
    cancelled: h.cancelled ? h.cancelled.split(',').filter(String).length : 0 };
  if (withNote) o.note = h.note;
  return o;
}

/** Murni: periksa isian. by = 'admin' | 'klien'. Lempar error Indonesia; kembalikan { jenis, mulai, sampai, note }. */
function _holdValidate_(data, today, by, maxDays) {
  data = data || {};
  const jenis = String(data.jenis || '').trim();
  if (HOLD_TYPES.indexOf(jenis) === -1 || (by === 'klien' && jenis === 'berhenti')) throw new Error('Pilih jenis: cuti atau sakit' + (by === 'klien' ? '' : ' atau berhenti') + '.');
  const mulai = String(data.mulai || today).trim();
  if (!_validDate_(mulai)) throw new Error('Tanggal mulai tidak valid.');
  if (by === 'klien' && mulai < today) throw new Error('Tanggal mulai tidak boleh sebelum hari ini.');
  if (by !== 'klien' && mulai < _addDaysIso_(today, -HOLD.coachBackDays)) throw new Error('Tanggal mulai paling jauh ' + HOLD.coachBackDays + ' hari ke belakang.');
  if (mulai > _addDaysIso_(today, HOLD.aheadDays)) throw new Error('Tanggal mulai terlalu jauh di depan.');
  let sampai = jenis === 'berhenti' ? '' : String(data.sampai || '').trim();
  if (sampai) {
    if (!_validDate_(sampai)) throw new Error('Tanggal selesai tidak valid.');
    if (sampai < mulai) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  }
  if (by === 'klien') {
    if (jenis === 'cuti' && !sampai) throw new Error('Isi sampai kapan cutinya.');
    const end = sampai || _addDaysIso_(mulai, maxDays - 1);
    if (_daysBetweenIso_(mulai, end) + 1 > maxDays) throw new Error('Cuti paling lama ' + maxDays + ' hari. Hubungi coach untuk lebih lama.');
  }
  const note = _careStr_(data.note, HOLD.noteMax, 'Catatan');
  return { jenis: jenis, mulai: mulai, sampai: sampai, note: note };
}
function _daysBetweenIso_(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 864e5);
}
function _holdRequestMax_() { return Math.max(7, Math.min(180, Math.floor(_numProp_('HOLD_REQUEST_MAX_DAYS', HOLD.requestMaxDefault)))); }

/** Tanggal WIB 'YYYY-MM-DD' dari waktu mulai sesi. */
function _holdSessIso_(start) {
  const d = new Date(start);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
}
/** Sesi klien yang belum selesai, belum lewat, di dalam [mulai, sampai] (sampai kosong = tanpa akhir). */
function _holdSessionsIn_(memberId, mulai, sampai, schedules) {
  const id = String(memberId).trim(), now = new Date();
  return (schedules || _getSchedulesAll_()).filter(function(s) {
    if (String(s.memberId).trim() !== id || String(s.status || '').toLowerCase() === 'completed') return false;
    const st = new Date(s.start);
    if (isNaN(st.getTime()) || st < now) return false;
    const iso = _holdSessIso_(s.start);
    return iso >= mulai && (!sampai || iso <= sampai);
  }).map(function(s) { return { id: String(s.id), start: s.start, end: s.end, coachName: s.coachName || '' }; })
    .sort(function(a, b) { return String(a.start) < String(b.start) ? -1 : 1; });
}
/** Hapus sesi yang dicentang (milik klien, belum selesai, di dalam rentang). Di dalam lock. Kembalikan id yang dihapus. */
function _holdCancelSessions_(memberId, mulai, sampai, ids) {
  const want = {};
  (ids || []).forEach(function(x) { want[String(x)] = true; });
  if (!Object.keys(want).length) return [];
  const ok = _holdSessionsIn_(memberId, mulai, sampai, _readSchedulesAll_()).filter(function(s) { return want[s.id]; });
  ok.forEach(function(s) { _deleteSchedule_(s.id); });
  if (ok.length) _bustSlots_();
  return ok.map(function(s) { return s.id; });
}
/** Baris sheet (1-based) dan data hold dengan id. */
function _holdFind_(sheet, holdId) {
  const data = sheet.getDataRange().getValues(), id = String(holdId == null ? '' : holdId).trim();
  for (let i = 1; i < data.length; i++) if (String(data[i][0]) === id && id) return { rowNum: i + 1, h: _holdParse_([data[i]])[0], all: _holdParse_(data.slice(1)) };
  throw new Error('Data cuti tidak ditemukan.');
}
function _holdMemberHistory_(memberId, today, withNote) {
  const id = String(memberId).trim();
  return _holdRows_().filter(function(h) { return h.memberId === id && h.status !== 'batal'; })
    .sort(function(a, b) { return a.mulai < b.mulai ? 1 : (a.mulai > b.mulai ? -1 : 0); })
    .map(function(h) { return _holdOut_(h, today, withNote); });
}
/** Akhiri hold di baris itu mulai hari ini: Sampai = kemarin, atau batal bila belum sempat berjalan. Di dalam lock. */
function _holdEndRow_(sheet, rowNum, h, today) {
  const yesterday = _addDaysIso_(today, -1), now = new Date().toISOString();
  if (h.mulai > yesterday) sheet.getRange(rowNum, 7).setValue('batal');
  else sheet.getRange(rowNum, 5).setNumberFormat('@').setValue(yesterday);
  sheet.getRange(rowNum, 11).setValue(now);
}

// ── Booking ─────────────────────────────────────────────────────────────────

/** Kalimat penolakan bila klien tidak bisa booking di waktu `start` karena ditahan; '' bila boleh. forCoach = kalimat peringatan coach. */
function _holdBookBlock_(memberId, start, forCoach) {
  const holds = _holdRows_(), today = _todayWib_(), iso = _holdSessIso_(start) || today;
  const off = _holdActiveOn_(holds, memberId, today);
  if (off && off.jenis === 'berhenti') return forCoach ? 'Klien ini sedang nonaktif.' : 'Akun sedang nonaktif. Hubungi coach untuk aktif lagi.';
  const h = _holdActiveOn_(holds, memberId, iso);
  if (!h) return '';
  if (h.jenis === 'berhenti') return forCoach ? 'Klien ini nonaktif mulai ' + _holdDay_(h.mulai) + '.' : 'Akun nonaktif mulai ' + _holdDay_(h.mulai) + '. Hubungi coach.';
  const t = h.jenis === 'sakit' ? 'izin sakit' : 'cuti', until = h.sampai ? ' sampai ' + _holdDay_(h.sampai) : '';
  return forCoach ? 'Klien sedang ' + t + until + '.' : 'Tanggal itu termasuk masa ' + t + until + '. Pilih tanggal sesudahnya.';
}
/** Booking berulang: tolak bila rentang seri menyentuh masa cuti (atau akun nonaktif). */
function _holdSeriesBlock_(memberId, startDate, rule) {
  const first = /^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) ? String(startDate) : _todayWib_();
  const days = Math.max(1, ((rule && rule.weekdays) || []).length || 1), occ = parseInt(rule && rule.occurrences, 10) || 1;
  const last = _addDaysIso_(first, Math.ceil(occ / days) * 7 + 6);
  const holds = _holdRows_();
  const off = _holdActiveOn_(holds, memberId, _todayWib_());
  if (off && off.jenis === 'berhenti') throw new Error('Akun sedang nonaktif. Hubungi coach untuk aktif lagi.');
  const hit = holds.find(function(h) { return h.memberId === String(memberId).trim() && h.status === 'ok' && h.mulai <= last && first <= (h.sampai || '9999-12-31'); });
  if (hit) throw new Error('Jadwal berulang ini kena masa ' + (hit.jenis === 'sakit' ? 'izin sakit' : hit.jenis === 'berhenti' ? 'nonaktif' : 'cuti') + ' (' + _holdLabel_(hit, _todayWib_()) + '). Pilih tanggal mulai sesudahnya atau booking satu per satu.');
}

// ── Admin ─────────────────────────────────────────────────────────────────────

/**
 * Admin: buat atau ubah hold. data = { id?, jenis, mulai, sampai, note }. opts.dry = hanya kembalikan sesi di dalam rentang;
 * opts.cancel = [scheduleId] sesi yang ikut dibatalkan (kuota kembali karena belum terjadi).
 */
function setClientHold(token, memberId, data, opts) {
  requireAdmin_(token);
  opts = opts || {};
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim(), today = _todayWib_();
  const v = _holdValidate_(data, today, 'admin', 0);
  if (opts.dry) return { status: 'success', inRange: _holdSessionsIn_(id, v.mulai, v.sampai) };
  const out = _locked_(function() {
    const sheet = _holdSheet_(), editId = data && data.id ? String(data.id) : '';
    const all = _holdParse_(sheet.getDataRange().getValues().slice(1));
    if (_holdOverlap_(all, id, v.mulai, v.sampai, editId)) throw new Error('Sudah ada cuti lain di tanggal itu. Ubah yang lama atau pilih tanggal lain.');
    const cancelled = _holdCancelSessions_(id, v.mulai, v.sampai, opts.cancel);
    let holdId = editId;
    if (editId) {
      const f = _holdFind_(sheet, editId);
      if (f.h.memberId !== id || f.h.status !== 'ok') throw new Error('Data cuti tidak ditemukan.');
      sheet.getRange(f.rowNum, 3, 1, 4).setNumberFormat('@').setValues([[v.jenis, v.mulai, v.sampai, v.note]]);
      if (cancelled.length) sheet.getRange(f.rowNum, 12).setValue(f.h.cancelled ? f.h.cancelled + ',' + cancelled.join(',') : cancelled.join(','));
    } else {
      holdId = 'HLD-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
      _appendRow_(sheet, [holdId, id, v.jenis, v.mulai, v.sampai, v.note, 'ok', 'admin', new Date().toISOString(), '', '', cancelled.join(',')]);
    }
    return { holdId: holdId, cancelled: cancelled };
  });
  _bumpMember_(id);
  const hist = _holdMemberHistory_(id, today, true);
  return { status: 'success', hold: hist.find(function(x) { return x.id === out.holdId; }) || null, holds: hist, cancelled: out.cancelled.length,
    inRange: _holdSessionsIn_(id, v.mulai, v.sampai) };
}

/** Admin: akhiri hold mulai hari ini (berhenti → aktif lagi). */
function endClientHold(token, holdId) {
  requireAdmin_(token);
  const today = _todayWib_();
  const memberId = _locked_(function() {
    const sheet = _holdSheet_(), f = _holdFind_(sheet, holdId);
    if (f.h.status !== 'ok') throw new Error('Cuti ini sudah tidak berlaku.');
    if (f.h.sampai && f.h.sampai < today) return f.h.memberId;   // sudah lewat: tidak ada yang diubah
    _holdEndRow_(sheet, f.rowNum, f.h, today);
    return f.h.memberId;
  });
  _bumpMember_(memberId);
  return { status: 'success', holds: _holdMemberHistory_(memberId, today, true) };
}

/** Admin: hapus hold yang salah dibuat (jadi batal; baris tetap untuk riwayat). */
function deleteClientHold(token, holdId) {
  requireAdmin_(token);
  const memberId = _locked_(function() {
    const sheet = _holdSheet_(), f = _holdFind_(sheet, holdId);
    if (f.h.status !== 'batal') sheet.getRange(f.rowNum, 7).setValue('batal');
    return f.h.memberId;
  });
  _bumpMember_(memberId);
  return { status: 'success', holds: _holdMemberHistory_(memberId, _todayWib_(), true) };
}

/** Admin: setujui atau tolak permintaan cuti klien. opts.cancel seperti setClientHold. Mengulang keputusan yang sama = sukses. */
function decideHoldRequest(token, holdId, approve, opts) {
  requireAdmin_(token);
  opts = opts || {};
  const today = _todayWib_();
  const res = _locked_(function() {
    const sheet = _holdSheet_(), f = _holdFind_(sheet, holdId), want = approve ? 'ok' : 'tolak';
    if (f.h.status === want) return { memberId: f.h.memberId, cancelled: [] };
    if (f.h.status !== 'minta') throw new Error('Permintaan ini sudah diputuskan.');
    if (approve && _holdOverlap_(f.all, f.h.memberId, f.h.mulai, f.h.sampai, f.h.id)) throw new Error('Sudah ada cuti lain di tanggal itu.');
    const cancelled = approve ? _holdCancelSessions_(f.h.memberId, f.h.mulai, f.h.sampai, opts.cancel) : [];
    sheet.getRange(f.rowNum, 7).setValue(want);
    sheet.getRange(f.rowNum, 10).setValue(new Date().toISOString());
    if (cancelled.length) sheet.getRange(f.rowNum, 12).setValue(cancelled.join(','));
    return { memberId: f.h.memberId, cancelled: cancelled };
  });
  _bumpMember_(res.memberId);
  return { status: 'success', cancelled: res.cancelled.length, holds: _holdMemberHistory_(res.memberId, today, true) };
}

/** Bootstrap panel: hold yang aktif, direncanakan, atau diminta, untuk semua klien. Tanpa catatan. */
function _holdsForAdmin_() {
  const today = _todayWib_();
  return _holdRows_().filter(function(h) {
    const st = _holdState_(h, today);
    return st === 'aktif' || st === 'rencana' || st === 'minta';
  }).map(function(h) { return _holdOut_(h, today, false); });
}

/** Coach hub: klien yang sedang ditahan dan yang berakhir dalam 3 hari (nama depan saja). */
function _holdHubList_(members) {
  const today = _todayWib_(), names = {};
  (members || []).forEach(function(m) { names[String(m.id)] = String(m.name || '').trim().split(/\s+/)[0]; });
  return _holdRows_().filter(function(h) { return _holdState_(h, today) === 'aktif'; }).map(function(h) {
    const left = h.sampai ? _daysBetweenIso_(today, h.sampai) : null;
    return { memberId: h.memberId, name: names[h.memberId] || '', jenis: h.jenis, sampai: h.sampai, label: _holdLabel_(h, today), endsSoon: left !== null && left <= 2 };
  });
}

// ── Klien ─────────────────────────────────────────────────────────────────────

/** Bootstrap portal: hold sendiri (aktif/rencana), permintaan yang menunggu, dan keputusan 7 hari terakhir. */
function _holdForMember_(memberId) {
  const id = String(memberId).trim(), today = _todayWib_(), weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const mine = _holdRows_().filter(function(h) { return h.memberId === id; });
  const cur = mine.find(function(h) { const st = _holdState_(h, today); return st === 'aktif'; }) ||
    mine.filter(function(h) { return _holdState_(h, today) === 'rencana'; }).sort(function(a, b) { return a.mulai < b.mulai ? -1 : 1; })[0] || null;
  const req = mine.find(function(h) { return h.status === 'minta'; }) || null;
  const recent = mine.filter(function(h) { return h.by === 'klien' && (h.status === 'ok' || h.status === 'tolak') && h.decidedAt && h.decidedAt >= weekAgo; })
    .sort(function(a, b) { return a.decidedAt < b.decidedAt ? 1 : -1; })[0] || null;
  return {
    current: cur ? _holdOut_(cur, today, cur.by === 'klien') : null,
    request: req ? _holdOut_(req, today, true) : null,
    decided: recent ? { id: recent.id, status: recent.status, label: _holdLabel_(recent, today), at: recent.decidedAt } : null,
    maxDays: _holdRequestMax_()
  };
}

/** Klien: ajukan cuti/sakit. Klien dari token. Coach memutuskan di panel. */
function requestMyHold(memberToken, data) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim(), today = _todayWib_();
  const v = _holdValidate_(data, today, 'klien', _holdRequestMax_());   // isian salah tidak memakai jatah kirim
  if (!_throttle_('hold_' + id, HOLD.throttleSec)) throw new Error('Tunggu sebentar sebelum mengirim lagi.');
  const holdId = _locked_(function() {
    const sheet = _holdSheet_(), all = _holdParse_(sheet.getDataRange().getValues().slice(1));
    if (all.some(function(h) { return h.memberId === id && h.status === 'minta'; })) throw new Error('Masih ada permintaan cuti yang menunggu jawaban coach.');
    if (_holdOverlap_(all, id, v.mulai, v.sampai, '')) throw new Error('Tanggal itu sudah termasuk cuti yang lain.');
    const hid = 'HLD-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    _appendRow_(sheet, [hid, id, v.jenis, v.mulai, v.sampai, v.note, 'minta', 'klien', new Date().toISOString(), '', '', '']);
    return hid;
  });
  const first = String(row[1] || '').trim().split(/\s+/)[0] || 'Klien';
  const range = _holdDay_(v.mulai) + (v.sampai ? ' – ' + _holdDay_(v.sampai) : '');
  try {
    // Catatan tidak pernah ikut (bisa berisi info kesehatan).
    kirimNotifTelegram_('🌴 <b>MINTA ' + (v.jenis === 'sakit' ? 'IZIN SAKIT' : 'CUTI') + '</b>\n\n👤 <b>Klien:</b> ' + escapeHtmlTelegram(first) +
      '\n📅 ' + escapeHtmlTelegram(range) + '\n\nSetujui atau tolak di panel: Dashboard → Minta cuti.');
  } catch (e) { Logger.log('Notif cuti gagal: ' + e); }
  _pushEvent_({ target: 'admin', kind: 'cuti', slot: holdId, title: 'Minta ' + (v.jenis === 'sakit' ? 'izin sakit' : 'cuti'),
    body: _pushClip_(first + ': ' + range + '.', 140) });
  _bumpMember_(id);
  return { status: 'success', hold: _holdForMember_(id) };
}

/** Klien: batalkan permintaan yang belum dijawab. */
function cancelMyHoldRequest(memberToken, holdId) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim();
  _locked_(function() {
    const sheet = _holdSheet_(), f = _holdFind_(sheet, holdId);
    if (f.h.memberId !== id) throw new Error('Data cuti tidak ditemukan.');
    if (f.h.status === 'batal') return;
    if (f.h.status !== 'minta') throw new Error('Permintaan ini sudah dijawab coach.');
    sheet.getRange(f.rowNum, 7).setValue('batal');
  });
  _bumpMember_(id);
  return { status: 'success', hold: _holdForMember_(id) };
}

/** Klien: "Saya sudah kembali" — akhiri cuti/sakit sendiri mulai hari ini (bukan nonaktif). */
function endMyHold(memberToken) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim(), today = _todayWib_();
  const ended = _locked_(function() {
    const sheet = _holdSheet_(), data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const h = _holdParse_([data[i]])[0];
      if (!h || h.memberId !== id || !_holdCovers_(h, today)) continue;
      if (h.jenis === 'berhenti') throw new Error('Hubungi coach untuk aktif lagi.');
      _holdEndRow_(sheet, i + 1, h, today);
      return true;
    }
    return false;
  });
  if (ended) {
    const first = String(row[1] || '').trim().split(/\s+/)[0] || 'Klien';
    try { kirimNotifTelegram_('💪 <b>' + escapeHtmlTelegram(first) + '</b> sudah kembali latihan (cuti diakhiri hari ini).'); } catch (e) { Logger.log('Notif kembali gagal: ' + e); }
    _pushEvent_({ target: 'admin', kind: 'cuti', slot: 'kembali-' + id + '-' + today, title: 'Klien kembali', body: _pushClip_(first + ' sudah kembali latihan.', 140) });
    _bumpMember_(id);
  }
  return { status: 'success', hold: _holdForMember_(id) };
}

// ── Pengingat ─────────────────────────────────────────────────────────────────

/** Murni: hold yang berakhir kemarin dengan sendirinya (bukan diakhiri lebih awal, bukan nonaktif) → klien aktif lagi hari ini. */
function _holdReturning_(holds, today) {
  const yesterday = _addDaysIso_(today, -1), seen = {};
  return (holds || []).filter(function(h) {
    if (h.status !== 'ok' || h.jenis === 'berhenti' || h.endedAt || h.sampai !== yesterday || seen[h.memberId]) return false;
    // Cuti lain yang langsung menyambung: belum kembali.
    if (_holdActiveOn_(holds, h.memberId, today)) return false;
    seen[h.memberId] = true;
    return true;
  });
}

/** Handler 'kembali-latihan' (Fase AC1, bawaan mati): satu tombol WhatsApp per klien yang aktif lagi hari ini. */
function sendKembaliLatihanDigest_(ctx) {
  var now = (ctx && ctx.now) || new Date();
  var today = _wibParts_(now).date, members = _rmdMemberIndex_();
  var tpl = _rmdTemplate_('kembali-latihan'), items = [], noPhone = [];
  _holdReturning_(_holdRows_(), today).forEach(function(h) {
    var m = members[h.memberId];
    if (!m || _rmdIsOff_(m, 'kembali-latihan')) return;
    if (!m.phone) { noPhone.push(m.name); return; }
    items.push({ name: m.name, phone: m.phone, fact: 'kembali', text: _rmdFill_(tpl, { nama: m.name, link: RMD_PORTAL_URL }) });
  });
  return _rmdSendDigest_('Kembali latihan', _rmdDateLabel_(today), items, noPhone);
}
