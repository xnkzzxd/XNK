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
  exportFinanceCsv: ['x', 'x', 'x']
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
    return rows.filter(function(p) { return bills[String(p['ID Tagihan'] || '')]; });
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
        revenue: null,
        packageTrend: null,
        hub: null,
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
