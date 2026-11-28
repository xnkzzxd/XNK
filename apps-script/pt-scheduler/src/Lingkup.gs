// Fase AE (T-2500+): login per coach. Pemilik tetap memakai ADMIN_PIN dan melihat semua data. Seorang coach
// login dengan PIN-nya sendiri (hash bergaram di Script Property COACH_PIN_<coachId>, tidak pernah ke browser
// atau ke sheet) dan hanya melihat klien, jadwal dan keuangannya sendiri.
//
// Keamanan = tolak dulu. Token coach hanya diterima oleh fungsi di COACH_FNS, dan HANYA lewat doPost / XNK.run
// (gerbang _coachGate_ memeriksa argumen sebelum fungsi berjalan). google.script.run tidak melewati gerbang, jadi
// token coach selalu ditolak di sana. Fungsi admin baru otomatis khusus pemilik sampai ditambahkan ke COACH_FNS
// beserta aturannya (tests/coach-scope.test.js).
//
// Aturan per argumen: 'm' = ID klien milik coach ini, 's' = ID jadwal milik coach ini, 'c' = ID coach ini sendiri,
// 'sl' = daftar ID jadwal (yang bukan miliknya dibuang), 'so' = objek jadwal {id?, memberId} (memberId harus miliknya,
// coachId dipaksa ke coach ini), 'x' = bebas (fungsinya sendiri sudah menyaring lewat lingkup).

let _coachScope_ = null;   // null = pemilik / belum login; {id, name} = coach yang sedang memanggil (sekali per eksekusi)
let _coachGateFn_ = null;  // nama fungsi yang sudah lolos gerbang pada eksekusi ini

const COACH_PIN_PREFIX = 'COACH_PIN_';
const COACH_FNS = {
  checkAdminSession: [],
  getAdminBootstrap: [],
  getAdminMore: ['x', 'x', 'x'],
  getClientBundle: ['m'],
  getSessionBriefing: ['s'],
  getSessionNote: ['s'],
  saveSessionNote: ['s', 'x'],
  completeSession: ['s', 'x'],
  addSchedule: ['so'],
  updateScheduleData: ['so'],
  deleteSchedule: ['s'],
  markSchedulesAsRead: ['sl'],
  getWorkoutLog: ['m'],
  saveWorkoutLog: ['m', 'x', 'x', 'x', 'x'],
  getMemberProgress: ['m'],
  saveMemberMeasurement: ['m', 'x'],
  saveClientNotes: ['m', 'x'],
  getCoachAvailability: ['c'],
  saveCoachAvailability: ['c', 'x'],
  getFinancePage: ['x', 'x', 'x'],
  getBills: ['x'],
  getBillDetail: ['x'],
  savePayment: ['x'],
  getExpenses: ['x'],
  saveExpense: ['x'],
  getFinanceCategories: [],
  getFinanceProof: ['x', 'x'],
  exportFinanceCsv: ['x', 'x', 'x'],
  // ── Gelombang 2 (T-2510+) ──
  // Klien: tambah / perpanjang (coach dipaksa ke coach ini; nomor klien coach lain ditolak), ubah profil.
  addMember: ['mnew'],
  updateMemberProfile: ['mo'],
  setMemberMealReminder: ['m', 'x'],
  setMemberReminderPrefs: ['m', 'x'],
  // PR / tugas. Templat hanya dibaca.
  addTask: ['mo'],
  updateTask: [['rowo', 'Tasks', 0, 1, 'id']],
  deleteTask: [['row', 'Tasks', 0, 1]],
  deleteTaskGroup: [['grp', 'Tasks', 12, 1]],
  getTasksForMember: ['m'],
  getTaskTemplates: [],
  // Program. Templat hanya dibaca dan dipakai.
  getMemberProgram: ['m'],
  saveMemberProgram: ['m', 'x'],
  applyProgramTemplate: ['m', 'x'],
  regenerateProgram: ['m'],
  setClientProgramAuto: ['m', 'x'],
  getProgramGenPreview: ['m'],
  setFormOk: ['m', 'x', 'x'],
  getProgramTemplates: [],
  getManualExercises: [],
  getGymCatalog: [],
  // Gizi.
  getClientNutrition: ['m'],
  saveClientNutrition: ['m', 'x'],
  decideNutritionAdvice: ['m', 'x', 'x'],
  getClientFoodLog: ['m', 'x'],
  logClientFood: ['m', 'x'],
  deleteClientFood: ['m', 'x', 'x'],
  saveFoodFeedback: ['m', 'x', 'x'],
  // Catat coach (AD3).
  saveExerciseNote: ['m', 'x', 'x'],
  deleteWorkoutEntries: ['m', 'x', 'x'],
  getWorkoutExerciseHistory: ['m', 'x'],
  getWorkoutSummaryMessage: ['m', 'x'],
  // Perawatan.
  getClientCare: ['m'],
  saveAssessment: ['m', 'x'],
  saveFitnessTests: ['m', 'x'],
  deleteFitnessTest: [['row', 'FitnessTests', 0, 1]],
  markHealthReviewed: ['m', 'x'],
  snoozeCare: ['m', 'x'],
  getTestResultMessage: ['m'],
  // Cuti klien (sesi yang dibatalkan hanya sesi coach ini: Cuti.gs).
  setClientHold: ['m', 'x', 'x'],
  endClientHold: [['row', 'ClientHolds', 0, 1]],
  deleteClientHold: [['row', 'ClientHolds', 0, 1]],
  decideHoldRequest: [['row', 'ClientHolds', 0, 1], 'x', 'x'],
  // Booking berulang.
  addRecurringSchedule: ['so', 'x'],
  deleteRecurringGroup: ['sg'],
  // Foto, ukuran, kartu, laporan.
  getMemberProgressPhoto: [['row', 'ProgressPhotos', 0, 1]],
  deleteMemberMeasurement: [['row', 'Progress', 0, 1]],
  getMemberShareData: ['m', 'x', 'x'],
  getMemberReport: ['m', 'x'],
  // Fase AG: poster. Coach selalu memakai profil dan kliennya sendiri (_posterCoach_ membaca lingkup), kisah klien hanya klien sendiri.
  getPosterData: ['x'],
  getPosterResults: ['x', 'x'],
  getPosterStory: ['m'],
  // Perpanjangan: klien sendiri, atau klien yang memilih coach ini.
  getRenewalRequests: ['x'],
  decideRenewal: ['rr', 'x'],
  // Beranda Coach (dihitung untuk coach ini saja).
  getCoachHub: [],
  // Keuangan: baris sudah dibatasi _finRead_ (_scopeFinRows_), jadi ID milik coach lain = "tidak ditemukan".
  archiveFinanceItem: ['x', 'x'],
  restoreFinanceItem: ['x', 'x'],
  saveBillAdjust: ['x', 'x'],
  getFinanceOverview: ['x', 'x'],
  // Jadwal milik sendiri.
  getPeakHourData: [],
  getCoachMonthlyStats: ['x', 'x']
};

function _coachPinKey_(coachId) { return COACH_PIN_PREFIX + String(coachId); }
function _coachPinHash_(salt, pin) { return _sha256Hex_('coach-pin:' + salt + ':' + String(pin)); }
/** Versi PIN coach (16 hex): berubah saat PIN diganti atau dihapus, jadi token lama langsung mati. */
function _coachPinVersion_(coachId) {
  const v = PropertiesService.getScriptProperties().getProperty(_coachPinKey_(coachId));
  return v ? _sha256Hex_('coach-ver:' + v).slice(0, 16) : null;
}
function _coachPinMatch_(stored, pin) {
  const p = String(stored || '').split(':');
  return p.length === 2 && _safeEqual_(_coachPinHash_(p[0], pin), p[1]);
}
/** Semua coach yang punya PIN: [{id, stored}]. */
function _coachPinsAll_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(all).filter(function(k) { return k.indexOf(COACH_PIN_PREFIX) === 0; })
    .map(function(k) { return { id: k.slice(COACH_PIN_PREFIX.length), stored: all[k] }; });
}
/** Coach aktif yang PIN-nya cocok, atau null. */
function _coachByPin_(pin) {
  const hit = _coachPinsAll_().filter(function(c) { return _coachPinMatch_(c.stored, pin); })[0];
  if (!hit) return null;
  const coach = _coachById_(hit.id);
  return coach && coach.aktif ? coach : null;
}
function _coachById_(id) {
  return _coachesAll_().filter(function(c) { return String(c.id) === String(id); })[0] || null;
}

/** Dipanggil requireAdmin_ untuk token ber-`c`. Mengembalikan payload atau melempar. */
function _requireCoachToken_(payload) {
  if (payload.v !== _coachPinVersion_(payload.c)) throw _authError_('Sesi coach berakhir. Silakan login lagi.');
  if (!_coachGateFn_ || !Object.prototype.hasOwnProperty.call(COACH_FNS, _coachGateFn_)) throw _ownerOnlyError_();
  const coach = _coachById_(payload.c);
  if (!coach || !coach.aktif) throw _authError_('Akun coach tidak aktif. Hubungi pemilik.');
  _coachScope_ = { id: String(coach.id), name: coach.name || '' };
  return payload;
}
function _ownerOnlyError_() {
  const e = new Error('Hanya pemilik yang bisa membuka ini.');
  e.code = 'owner_only';
  return e;
}

/**
 * Gerbang coach (doPost dan XNK.run). Token bukan milik coach → tidak berbuat apa-apa. Token coach →
 * fungsi harus di COACH_FNS dan setiap ID di argumennya harus milik coach itu.
 */
function _coachGate_(fn, args) {
  _coachScope_ = null;
  _coachGateFn_ = null;
  const payload = args && args.length ? _readToken_(args[0]) : null;
  if (!payload || payload.r !== 'admin' || !payload.c) return;
  const rules = COACH_FNS[fn];
  if (!rules) throw _ownerOnlyError_();
  if (payload.v !== _coachPinVersion_(payload.c)) throw _authError_('Sesi coach berakhir. Silakan login lagi.');
  const cid = String(payload.c);
  rules.forEach(function(rule, i) {
    const a = args[i + 1];
    if (rule === 'm') { if (!_coachOwnsMember_(cid, a)) throw new Error('Klien tidak ditemukan.'); }
    else if (rule === 's') { if (!_coachOwnsSchedule_(cid, a)) throw new Error('Jadwal tidak ditemukan.'); }
    else if (rule === 'c') { if (String(a) !== cid) throw _ownerOnlyError_(); }
    else if (rule === 'sl') { args[i + 1] = (Array.isArray(a) ? a : []).filter(function(id) { return _coachOwnsSchedule_(cid, id); }); }
    else if (Array.isArray(rule)) { _coachRowRule_(cid, rule, a); }
    else if (rule === 'mo') {
      const o = a && typeof a === 'object' ? a : {};
      const mid = o.memberId != null ? o.memberId : o.id;
      if (!_coachOwnsMember_(cid, mid)) throw new Error('Klien tidak ditemukan.');
      const coach = _coachById_(cid);
      // Coach tidak bisa memindahkan klien ke coach lain (pindah coach = pemilik, setMemberCoach).
      args[i + 1] = Object.assign({}, o, o.coachId !== undefined ? { coachId: cid, coachName: coach ? coach.name : '' } : {});
    }
    else if (rule === 'mnew') {
      const o = a && typeof a === 'object' ? a : {};
      const data = _memberValues_().data;
      const at = _findMemberRowIndexByPhone_(data, o.phone);
      if (at !== -1 && String(data[at][10] || '').trim() !== cid) throw new Error('Nomor ini klien coach lain. Hubungi pemilik.');
      const coach = _coachById_(cid);
      args[i + 1] = Object.assign({}, o, { coachId: cid, coachName: coach ? coach.name : '' });
    }
    else if (rule === 'sg') {
      const rows = _getSchedulesAll_().filter(function(x) { return String(x.recurringGroupId) === String(a || ''); });
      if (!rows.length || rows.some(function(x) { return String(x.coachId) !== cid; })) throw new Error('Jadwal tidak ditemukan.');
    }
    else if (rule === 'rr') {
      const row = _sheetRowsByName_('RenewalRequests').filter(function(r) { return String(r[0]) === String(a); })[0];
      if (!row || !(_coachOwnsMember_(cid, row[1]) || String(row[7] || '') === cid)) throw new Error('Permintaan tidak ditemukan.');
    }
    else if (rule === 'so') {
      const o = a && typeof a === 'object' ? a : {};
      if (o.id && !_coachOwnsSchedule_(cid, o.id)) throw new Error('Jadwal tidak ditemukan.');
      if (!_coachOwnsMember_(cid, o.memberId)) throw new Error('Klien tidak ditemukan.');
      const coach = _coachById_(cid);
      args[i + 1] = Object.assign({}, o, { coachId: cid, coachName: coach ? coach.name : '' });
    }
  });
  _coachGateFn_ = fn;
}

/** ID coach yang sedang memanggil, atau '' untuk pemilik. */
function _scopeCoach_() { return _coachScope_ ? _coachScope_.id : ''; }

function _coachOwnsMember_(coachId, memberId) {
  if (!memberId) return false;
  const row = _memberValues_().data.slice(1).filter(function(r) { return String(r[0]).trim() === String(memberId).trim(); })[0];
  return !!row && String(row[10] || '').trim() === String(coachId);
}
function _coachOwnsSchedule_(coachId, scheduleId) {
  if (!scheduleId) return false;
  const s = _getSchedulesAll_().filter(function(x) { return String(x.id) === String(scheduleId); })[0];
  return !!s && String(s.coachId) === String(coachId);
}

/** Klien yang terlihat oleh pemanggil (pemilik: semua). */
function _scopeMembers_(list) {
  const c = _scopeCoach_();
  return c ? list.filter(function(m) { return String(m.preferredCoachId) === c; }) : list;
}
function _scopeSchedules_(list) {
  const c = _scopeCoach_();
  return c ? list.filter(function(s) { return String(s.coachId) === c; }) : list;
}
/** Peta {memberId: …} atau daftar [{memberId}] → hanya klien milik coach. */
function _scopeByMember_(x, ids) {
  if (!x || x.error) return x;
  if (Array.isArray(x)) return x.filter(function(o) { return o && ids[String(o.memberId)]; });
  const out = {};
  Object.keys(x).forEach(function(k) { if (ids[k]) out[k] = x[k]; });
  return out;
}

/** Baris keuangan yang terlihat oleh coach (dipakai _finRead_). Pemilik: semua baris. */
function _scopeFinRows_(name, rows) {
  const c = _scopeCoach_();
  if (!c) return rows;
  if (name === 'Tagihan' || name === 'Pengeluaran') return rows.filter(function(r) { return String(r['Coach ID'] || '') === c; });
  if (name === 'Pembayaran') {
    const bills = {};
    _finReadRaw_('Tagihan').forEach(function(b) { if (String(b['Coach ID'] || '') === c) bills[String(b['ID Tagihan'])] = true; });
    return rows.filter(function(p) { return bills[String(p['ID Tagihan'] || '')] || String(p['Coach ID'] || '') === c; });
  }
  return rows;
}

/** getAdminMore untuk coach: hanya bagian yang bisa disaring per klien; omzet gabungan dan tren paket tidak ikut. */
function _adminMoreForCoach_(token) {
  const ids = {};
  _scopeMembers_(_getMembersAll_()).forEach(function(m) { ids[String(m.id)] = true; });
  const part = function (fn) { try { return fn(); } catch (err) { return { error: String(err && err.message || err) }; } };
  return _withMemberMemo_(function () {
    return _withSchedulesMemo_(function () {
      const finance = part(_finSettingsRead_);
      return {
        at: Date.now(),
        transactionLog: _scopeByMember_(part(function () { return getMemberTransactionLog(token); }), ids),
        taskSummary: _scopeByMember_(part(function () { return getTaskSummary(token); }), ids),
        renewals: _scopeByMember_(part(function () { return getRenewalRequests(token); }), ids),
        finance: finance,
        shareEnabled: _shareEnabled_(),
        posterEnabled: _posterEnabled_(),   // Fase AG
        revenue: null,
        packageTrend: null,
        hub: part(function () { return _coachHub_(new Date(), null); }),
        signals: _scopeByMember_(part(function () { return _clientSignals_(new Date()); }), ids),
        memberVers: _scopeByMember_(part(_memberVersAll_), ids),
        finVer: _finVer_()
      };
    });
  });
}

/** Siapa yang login: {role:'owner'} atau {role:'coach', coachId, name}. Ikut di getAdminBootstrap. */
function _adminMe_() {
  return _coachScope_ ? { role: 'coach', coachId: _coachScope_.id, name: _coachScope_.name } : { role: 'owner' };
}

/** Pemilik: atur (pin berisi 6 angka) atau hapus (pin kosong) PIN login seorang coach. */
function setCoachPin(token, coachId, pin) {
  requireAdmin_(token);
  if (_scopeCoach_()) throw _ownerOnlyError_();
  const coach = _coachById_(coachId);
  if (!coach) throw new Error('Coach tidak ditemukan.');
  const props = PropertiesService.getScriptProperties();
  const p = String(pin == null ? '' : pin).trim();
  return _locked_(function() {
    if (!p) { props.deleteProperty(_coachPinKey_(coach.id)); return { status: 'success', hasPin: false }; }
    if (!/^\d{6}$/.test(p)) throw new Error('PIN coach harus 6 angka.');
    if (_safeEqual_(p, String(props.getProperty('ADMIN_PIN') || ''))) throw new Error('PIN ini sudah dipakai. Pilih PIN lain.');
    const taken = _coachPinsAll_().some(function(c) { return String(c.id) !== String(coach.id) && _coachPinMatch_(c.stored, p); });
    if (taken) throw new Error('PIN ini sudah dipakai. Pilih PIN lain.');
    const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty(_coachPinKey_(coach.id), salt + ':' + _coachPinHash_(salt, p));
    return { status: 'success', hasPin: true };
  });
}

/** Coach mana yang sudah punya PIN: {coachId: true}. Untuk halaman Coach milik pemilik. */
function _coachPinFlags_() {
  const out = {};
  _coachPinsAll_().forEach(function(c) { out[c.id] = true; });
  return out;
}

/** Untuk tes: nama fungsi yang menerima token coach. */
function _coachFnNames_() { return Object.keys(COACH_FNS); }

/** Demo runtime: tutup lingkup coach setelah satu panggilan (doPost melakukannya di finally). */
function _coachScopeReset_() { _coachScope_ = null; _coachGateFn_ = null; }

/** Baris sheet (tanpa header) langsung dari sheet, untuk pengecekan gerbang. */
function _sheetRowsByName_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  return sh && sh.getLastRow() >= 2 ? sh.getDataRange().getValues().slice(1) : [];
}
/**
 * Aturan baris: ['row', sheet, kolomId, kolomMember] (nilai = ID baris), ['rowo', …, field] (nilai = objek, ID di field),
 * ['grp', sheet, kolomKunci, kolomMember] (semua baris berkunci itu harus milik klien coach ini).
 */
function _coachRowRule_(cid, rule, a) {
  const kind = rule[0], rows = _sheetRowsByName_(rule[1]), idc = rule[2], mc = rule[3];
  const key = kind === 'rowo' ? (a && typeof a === 'object' ? a[rule[4]] : '') : a;
  const hit = rows.filter(function(r) { return key !== '' && key != null && String(r[idc]).trim() === String(key).trim(); });
  const ok = hit.length && (kind === 'grp' ? hit.every : hit.some).call(hit, function(r) { return _coachOwnsMember_(cid, r[mc]); });
  if (!ok) throw new Error('Data tidak ditemukan.');
  if (kind === 'rowo' && a && a.memberId != null && !_coachOwnsMember_(cid, a.memberId)) throw new Error('Klien tidak ditemukan.');
}

/** Isi bersarang: buang setiap objek ber-memberId yang bukan klien coach ini (Beranda Coach). */
function _scopeDeep_(x, ids) {
  if (Array.isArray(x)) return x.filter(function(o) { return !(o && typeof o === 'object' && o.memberId != null && !ids[String(o.memberId)]); }).map(function(o) { return _scopeDeep_(o, ids); });
  if (x && typeof x === 'object') { const out = {}; Object.keys(x).forEach(function(k) { out[k] = _scopeDeep_(x[k], ids); }); return out; }
  return x;
}
function _scopeMemberIds_() {
  const ids = {};
  _scopeMembers_(_getMembersAll_()).forEach(function(m) { ids[String(m.id)] = true; });
  return ids;
}

/**
 * Pemilik: tetapkan atau pindahkan coach seorang klien. opts.moveSessions = sesi mendatang yang belum selesai ikut pindah
 * (yang bentrok dengan jadwal coach baru dibiarkan dan dilaporkan). Tagihan lama tetap milik coach lama.
 */
function setMemberCoach(token, memberId, coachId, opts) {
  requireAdmin_(token);
  if (_scopeCoach_()) throw _ownerOnlyError_();
  return _bumpAfter_('*', _setMembersCoach_([memberId], coachId, opts || {}));
}
/** Pemilik: tetapkan satu coach untuk banyak klien sekaligus (mis. semua yang belum punya coach). */
function assignClientsToCoach(token, memberIds, coachId, opts) {
  requireAdmin_(token);
  if (_scopeCoach_()) throw _ownerOnlyError_();
  if (!Array.isArray(memberIds) || !memberIds.length) throw new Error('Pilih klien dulu.');
  if (memberIds.length > 500) throw new Error('Terlalu banyak klien sekaligus.');
  return _bumpAfter_('*', _setMembersCoach_(memberIds, coachId, opts || {}));
}
function _setMembersCoach_(memberIds, coachId, opts) {
  const coach = _coachById_(coachId);
  if (!coach || !coach.aktif) throw new Error('Coach tidak ditemukan atau tidak aktif.');
  const want = {};
  memberIds.forEach(function(id) { want[String(id).trim()] = true; });
  return _locked_(function() {
    const sheet = _getMemberDataSheet_();
    const data = sheet.getDataRange().getValues();
    const changed = [];
    for (let i = 1; i < data.length; i++) {
      const id = String(data[i][0]).trim();
      if (!want[id]) continue;
      sheet.getRange(i + 1, 11, 1, 2).setValues([[coach.id, coach.name]]);
      changed.push(id);
    }
    if (!changed.length) throw new Error('Klien tidak ditemukan.');
    const moved = [], kept = [];
    if (opts.moveSessions) {
      const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
      const rows = sh ? sh.getDataRange().getValues() : [];
      const now = Date.now();
      const mine = {};
      changed.forEach(function(id) { mine[id] = true; });
      const busy = function(start, end, skipId) {
        const a = new Date(start).getTime(), b = new Date(end || start).getTime();
        return rows.slice(1).some(function(r) {
          if (String(r[0]) === skipId || String(r[8]) !== coach.id) return false;
          const st = String(r[7] || '').toLowerCase();
          if (st === 'cancelled' || st === 'available') return false;
          const x = new Date(r[4]).getTime(), y = new Date(r[5] || r[4]).getTime();
          return x < b && a < y;
        });
      };
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!mine[String(r[1]).trim()] || String(r[8]) === coach.id) continue;
        const st = String(r[7] || '').toLowerCase();
        if (st === 'completed' || st === 'cancelled' || new Date(r[4]).getTime() < now) continue;
        if (busy(r[4], r[5], String(r[0]))) { kept.push(String(r[0])); continue; }
        sh.getRange(i + 1, 9, 1, 2).setValues([[coach.id, coach.name]]);
        r[8] = coach.id;
        moved.push(String(r[0]));
      }
    }
    _bustSlots_();
    return { status: 'success', coachId: coach.id, coachName: coach.name, members: changed, moved: moved, kept: kept };
  });
}
