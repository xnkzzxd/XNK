// Paket coach di hub xnk.web.id (Fase AF, docs/plan/): Starter / Pro / Studio.
// XNK HQ memilih paket + pengecualian per coach dan mengirimnya lewat hubPlan(HUB_SECRET, plan) (sama seperti
// hubReadonly). Server ini yang menegakkan: _planGate_ (di doPost dan XNK.run, sesudah _readonlyGate_) menolak fungsi
// milik fitur yang mati, _planAssertClientRoom_ menolak klien baru di atas batas, _planAssertCoachRoom_ menolak coach
// aktif / login coach di atas batas. Fitur mati = disembunyikan, data tetap ada.
// Produksi xnk.my.id tidak punya HUB_SECRET: tidak pernah dibatasi, walau XNK_PLAN terisi tangan.
// Sebelum `enforceFrom` (masa peringatan 30 hari saat peluncuran) gerbang hanya memberi tahu, tidak menolak.

var PLAN_FEATURES = ['finance', 'nutrition', 'care', 'photos', 'report', 'share', 'content', 'programAuto',
  'telegramFull', 'templates', 'classes', 'coachShare', 'multiCoach'];

// Isi paket = tabel "Bandingkan semua fitur" di xnk-library/tools/hub-harga.js (tests/plan.test.js menjaga keduanya).
// clients/coaches: 0 = tanpa batas.
var PLAN_TIERS = {
  starter: { name: 'Starter', clients: 15, coaches: 1, features: [] },
  pro: { name: 'Pro', clients: 0, coaches: 1,
    features: ['finance', 'nutrition', 'care', 'photos', 'report', 'share', 'content', 'programAuto', 'telegramFull', 'templates'] },
  studio: { name: 'Studio', clients: 0, coaches: 5,
    features: ['finance', 'nutrition', 'care', 'photos', 'report', 'share', 'content', 'programAuto', 'telegramFull', 'templates',
      'classes', 'coachShare', 'multiCoach'] },
};

// Fungsi API milik tiap fitur. Fungsi yang tidak tercantum = inti (selalu jalan).
var PLAN_FN = {
  finance: ['syncFinanceTransactions', 'getBills', 'getBillDetail', 'saveBillAdjust', 'savePayment', 'saveExpense', 'getExpenses',
    'getFinanceCategories', 'saveFinanceCategory', 'deleteFinanceCategory', 'archiveFinanceItem', 'restoreFinanceItem',
    'getFinanceOverview', 'getFinancePage', 'uploadFinanceProof', 'getFinanceProof', 'exportFinanceCsv', 'getMyBills'],
  nutrition: ['getClientNutrition', 'saveClientNutrition', 'decideNutritionAdvice', 'getClientFoodLog', 'logClientFood', 'deleteClientFood',
    'saveFoodFeedback', 'getMyNutrition', 'saveMyNutritionProfile', 'setMyMenuStyle', 'getMyShopping', 'swapMyMenuItem', 'swapMyMenuMeal',
    'logMyFood', 'deleteMyFood', 'getMyFoodLog', 'copyMyFoodYesterday'],
  care: ['getClientCare', 'saveClientNotes', 'snoozeCare', 'saveAssessment', 'saveFitnessTests', 'deleteFitnessTest', 'markHealthReviewed',
    'saveSessionNote', 'getSessionNote', 'getMyHealthForm', 'submitMyHealthForm', 'getMyAssessment', 'rateSession',
    'getMyPackageEval', 'submitMyPackageEval'],
  templates: ['getProgramTemplates', 'saveProgramTemplate', 'deleteProgramTemplate', 'applyProgramTemplate', 'setTemplateExplore'],
  photos: ['getMemberProgressPhoto', 'uploadMyProgressPhoto', 'getMyProgressPhoto', 'deleteMyProgressPhoto'],
  report: ['getMemberReport', 'getMyReport'],
  share: ['getMemberShareData', 'getMyShareData'],
  content: ['getContentAdmin', 'saveContent', 'deleteContent'],
  programAuto: ['getProgramGenPreview', 'regenerateProgram', 'setClientProgramAuto', 'setFormOk', 'getMyProgramProfile',
    'saveMyProgramProfile', 'acceptAutoProgram', 'swapMyProgramExercise'],
  classes: ['createClassGroup', 'joinClassGroup'],
  coachShare: ['saveCoachShare'],
  multiCoach: ['setCoachPin'],
};

// Pengingat WhatsApp (digest Telegram) yang tetap jalan di Starter; jenis lain butuh telegramFull.
var PLAN_BASIC_REMINDERS = ['sesi-besok', 'booking-minggu', 'booking-habis'];
var PLAN_MSG_FEATURE = 'Fitur ini belum termasuk paket Anda.';
var PLAN_MSG_CLIENTS = 'Batas klien aktif paket Anda sudah penuh.';
var PLAN_MSG_COACHES = 'Batas coach paket Anda sudah penuh.';

let _planMemo_ = null;   // per eksekusi (Library: MEMOS + _resetLibMemos_)

/** Paket tersimpan, atau null (tanpa batas: produksi, coach gratis, atau belum diatur). */
function _plan_() {
  if (_planMemo_ !== null) return _planMemo_ || null;
  var props = PropertiesService.getScriptProperties();
  var p = null;
  if (String(props.getProperty('HUB_SECRET') || '').length >= 32) {
    try { p = JSON.parse(props.getProperty('XNK_PLAN') || 'null'); } catch (e) { p = null; }
    if (p && !PLAN_TIERS[p.tier]) p = null;
  }
  _planMemo_ = p || false;
  return p;
}

/** Fitur yang menyala untuk paket p: `features` (daftar beku lifetime) atau isi paket, lalu tambah/kurang. */
function _planOn_(p) {
  if (!p) return PLAN_FEATURES.slice();
  var base = Array.isArray(p.features) ? p.features : PLAN_TIERS[p.tier].features;
  var on = {};
  base.forEach(function (f) { on[f] = 1; });
  (p.add || []).forEach(function (f) { on[f] = 1; });
  (p.off || []).forEach(function (f) { delete on[f]; });
  return PLAN_FEATURES.filter(function (f) { return on[f]; });
}

/** Batas angka: pengecualian HQ menang atas isi paket. 0 = tanpa batas. */
function _planLimit_(p, key) {
  if (!p) return 0;
  var v = p.limits && p.limits[key] != null ? Number(p.limits[key]) : PLAN_TIERS[p.tier][key];
  return v > 0 ? Math.floor(v) : 0;
}

/** true bila batas sudah ditegakkan (lewat masa peringatan). */
function _planEnforced_(p) {
  if (!p) return false;
  return !p.enforceFrom || _todayWib_() >= String(p.enforceFrom);
}

function _planFeatureOn_(f) { return _planOn_(_plan_()).indexOf(f) !== -1; }

function _planFnFeature_(fn) {
  for (var f in PLAN_FN) if (PLAN_FN[f].indexOf(fn) !== -1) return f;
  return '';
}

function _planError_(msg, code) {
  var err = new Error(msg);
  err.code = code;
  return err;
}

/** Tolak fungsi milik fitur yang mati. fn = nama fungsi API. */
function _planGate_(fn) {
  var p = _plan_();
  if (!p || !_planEnforced_(p)) return;
  var f = _planFnFeature_(fn);
  if (f && _planOn_(p).indexOf(f) === -1) throw _planError_(PLAN_MSG_FEATURE, 'plan');
}

/** Klien yang dihitung: masih punya sisa sesi atau booking mendatang, dan tidak sedang cuti. */
function _planActiveClients_(members, schedules, holds) {
  var now = Date.now(), upcoming = {};
  (schedules || []).forEach(function (s) {
    var st = String(s.status || '').toLowerCase();
    if (st === 'completed' || st === 'cancelled' || st === 'available') return;
    if (new Date(s.start).getTime() > now && s.memberId) upcoming[String(s.memberId).trim()] = 1;
  });
  return (members || []).filter(function (r) {
    var id = String(r[0] || '').trim();
    if (!id || (holds && holds[id])) return false;
    var total = parseInt(r[8], 10), used = parseInt(r[9], 10) || 0;
    return upcoming[id] || !(total > 0) || total - used > 0;
  }).map(function (r) { return String(r[0]).trim(); });
}

function _planActiveCount_() {
  var data = _getMemberDataSheet_().getDataRange().getValues().slice(1);
  return _planActiveClients_(data, _getSchedulesAll_(), _holdMapToday_()).length;
}

/**
 * Tolak klien yang menambah hitungan di atas batas. row = baris MemberData lama (perpanjang) atau null (baru).
 * Perpanjang klien yang masih aktif tidak menambah hitungan, jadi selalu boleh.
 */
function _planAssertClientRoom_(row) {
  var p = _plan_(), max = _planLimit_(p, 'clients');
  if (!max || !_planEnforced_(p)) return;
  var ids = _planActiveClients_(_getMemberDataSheet_().getDataRange().getValues().slice(1), _getSchedulesAll_(), _holdMapToday_());
  if (row && ids.indexOf(String(row[0]).trim()) !== -1) return;
  if (ids.length >= max) throw _planError_(PLAN_MSG_CLIENTS, 'plan_clients');
}

/** Tolak coach aktif ke-(batas + 1). */
function _planAssertCoachRoom_() {
  var p = _plan_(), max = _planLimit_(p, 'coaches');
  if (!max || !_planEnforced_(p)) return;
  if (_activeCoaches_().length >= max) throw _planError_(PLAN_MSG_COACHES, 'plan_coaches');
}

/** Jenis pengingat ini boleh dikirim paket sekarang? */
function _planReminderOk_(type) {
  var p = _plan_();
  if (!p || !_planEnforced_(p)) return true;
  if (PLAN_BASIC_REMINDERS.indexOf(type) !== -1) return true;
  return _planOn_(p).indexOf('telegramFull') !== -1;
}

// Bagian getPortalMore / getClientBundle milik fitur berbayar: null saat fiturnya mati.
var PLAN_PARTS = { nutrition: 'nutrition', foodLog: 'nutrition', bills: 'finance', content: 'content', programGen: 'programAuto',
  share: 'share', assessment: 'care', healthForm: 'care', care: 'care', notes: 'care' };

function _planPartOff_(name) {
  var f = PLAN_PARTS[name];
  if (!f) return false;
  var p = _plan_();
  return !!p && _planEnforced_(p) && _planOn_(p).indexOf(f) === -1;
}

/** Web Push termasuk Starter; hanya jenis milik fitur yang mati yang dilewati (makan → Gizi). */
function _planPushOk_(kind) {
  var p = _plan_();
  if (!p || !_planEnforced_(p)) return true;
  if (String(kind).indexOf('makan-') === 0) return _planOn_(p).indexOf('nutrition') !== -1;
  return true;
}

/** Untuk bootstrap panel dan portal: null = tanpa batas. */
function _planInfo_(withUsage) {
  var p = _plan_();
  if (!p) return null;
  var out = { tier: p.tier, name: PLAN_TIERS[p.tier].name, on: _planOn_(p), enforced: _planEnforced_(p),
    enforceFrom: String(p.enforceFrom || ''), upgradeWa: String(p.upgradeWa || '') };
  if (withUsage) {
    out.clients = { used: _planActiveCount_(), max: _planLimit_(p, 'clients') };
    out.coaches = { used: _activeCoaches_().length, max: _planLimit_(p, 'coaches') };
  }
  return out;
}

/**
 * Simpan paket coach ini (dipanggil XNK HQ). plan = null / {tier:'gratis'} menghapus batas.
 * @param {string} secret HUB_SECRET spreadsheet ini
 * @param {{tier:string, features?:string[], add?:string[], off?:string[], limits?:{clients?:number, coaches?:number},
 *   enforceFrom?:string, upgradeWa?:string}} plan
 */
function hubPlan(secret, plan) {
  _hubAuth_(secret);
  var props = PropertiesService.getScriptProperties();
  _planMemo_ = null;
  if (!plan || plan.tier === 'gratis' || !plan.tier) {
    props.deleteProperty('XNK_PLAN');
    _bumpMember_('*');   // portal dan halaman klien dihitung ulang dengan fitur baru
    return { plan: null };
  }
  if (!PLAN_TIERS[plan.tier]) throw new Error('Paket tidak dikenal.');
  var feats = function (a) {
    if (a == null) return undefined;
    if (!Array.isArray(a)) throw new Error('Daftar fitur tidak valid.');
    return a.map(String).filter(function (f) { return PLAN_FEATURES.indexOf(f) !== -1; });
  };
  var num = function (v) { return v == null || v === '' ? undefined : Math.max(0, Math.min(10000, Math.floor(Number(v) || 0))); };
  var limits = plan.limits || {};
  var clean = { tier: plan.tier };
  if (plan.features != null) clean.features = feats(plan.features);
  if (plan.add) clean.add = feats(plan.add);
  if (plan.off) clean.off = feats(plan.off);
  var l = { clients: num(limits.clients), coaches: num(limits.coaches) };
  if (l.clients != null || l.coaches != null) clean.limits = JSON.parse(JSON.stringify(l));
  if (plan.enforceFrom) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plan.enforceFrom))) throw new Error('Tanggal tidak valid.');
    clean.enforceFrom = String(plan.enforceFrom);
  }
  var wa = String(plan.upgradeWa || '').replace(/\D/g, '');
  if (wa) clean.upgradeWa = wa.slice(0, 15);
  props.setProperty('XNK_PLAN', JSON.stringify(clean));
  _planMemo_ = null;
  _bumpMember_('*');
  return { plan: _planInfo_(true) };
}
