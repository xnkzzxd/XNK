// ##############################################################################
// BAGIAN: Fase W6a — hangatkan cache di latar (T-1820…T-1824)
// ##############################################################################
// Pemicu waktu tiap 15 menit (05:00–22:00 WIB) mengisi cache hasil jadi yang sama dengan
// panggilan biasa: getAdminMore (bulan ini), getClientBundle dan getPortalMore untuk klien
// yang sesinya dekat atau baru aktif. Kunci cache sudah memuat versi data, jadi yang masih
// segar hanya dibaca (murah) dan yang basi dibangun ulang. Berhenti saat anggaran waktu habis.
// Mati bawaan (WARM_ENABLED, aturan 5); sakelar di Pengaturan → Tampilan memasang/melepas pemicu.
// Tidak mengirim apa pun ke luar dan tidak mengembalikan data klien (hanya angka).

const WARM_MIN_GAP_MS = 10 * 60 * 1000;
const WARM_MAX_CLIENTS = 25;

function _warmEnabled_() {
  return String(PropertiesService.getScriptProperties().getProperty('WARM_ENABLED') || '').trim().toLowerCase() === 'true';
}

/**
 * Urutan klien yang dihangatkan (murni): sesi mulai 6 jam lalu s.d. 48 jam lagi dulu (terdekat dulu),
 * lalu klien dengan sesi 7 hari terakhir (terbaru dulu). Tiap klien sekali.
 */
function _warmPick_(schedules, nowMs, max) {
  const soon = {}, recent = {};
  (schedules || []).forEach(function (s) {
    const id = String((s && s.memberId) || '').trim();
    const t = s ? new Date(s.start).getTime() : NaN;
    if (!id || isNaN(t)) return;
    if (t >= nowMs - 6 * 3600000 && t < nowMs + 48 * 3600000) {
      if (soon[id] == null || Math.abs(t - nowMs) < Math.abs(soon[id] - nowMs)) soon[id] = t;
    } else if (t >= nowMs - 7 * 86400000 && t < nowMs) {
      if (recent[id] == null || t > recent[id]) recent[id] = t;
    }
  });
  const a = Object.keys(soon).sort(function (x, y) { return Math.abs(soon[x] - nowMs) - Math.abs(soon[y] - nowMs); });
  const b = Object.keys(recent).filter(function (id) { return soon[id] == null; }).sort(function (x, y) { return recent[y] - recent[x]; });
  return a.concat(b).slice(0, max || WARM_MAX_CLIENTS);
}

/** Pemicu waktu (TRIGGER). Bisa dipanggil dari browser seperti semua fungsi publik, jadi dijaga sakelar, jam, kunci dan jeda. */
function runWarmTick() {
  const res = { skipped: '', admin: '', clients: 0, ms: 0 };
  if (!_warmEnabled_()) { res.skipped = 'nonaktif'; return res; }
  const hour = _wibParts_(new Date()).hour;
  if (hour < 5 || hour >= 22) { res.skipped = 'malam'; return res; }
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) { res.skipped = 'sibuk'; return res; }
  try {   // kunci hanya untuk jeda; penghangatan sendiri berjalan tanpa kunci supaya penulis tidak tertahan
    const last = Number(props.getProperty('WARM_LAST')) || 0;
    if (Date.now() - last < WARM_MIN_GAP_MS) { res.skipped = 'jeda'; return res; }
    props.setProperty('WARM_LAST', String(Date.now()));
  } finally {
    lock.releaseLock();
  }
  const t0 = Date.now();
  const budget = Math.max(5000, Math.min(300000, Math.floor(_numProp_('WARM_BUDGET_MS', 30000))));
  const left = function () { return budget - (Date.now() - t0); };
  const version = _adminPinVersion_();
  // Token admin sementara, hanya di memori server (tidak pernah dikirim ke mana pun), 10 menit.
  const token = version ? _issueToken_({ r: 'admin', v: version, exp: Date.now() + 600000 }) : '';
  if (token) {
    try {
      const r = getAdminMore(token);
      res.admin = r && r.ms && r.ms.hit ? 'hit' : 'built';
    } catch (e) { res.admin = 'gagal'; Logger.log('Warm getAdminMore: ' + e); }
  }
  let ids = [];
  try { ids = _warmPick_(_readSchedulesAll_(), Date.now(), WARM_MAX_CLIENTS); } catch (e) { Logger.log('Warm jadwal: ' + e); }
  for (let i = 0; i < ids.length && left() > 4000; i++) {
    const id = ids[i];
    try {
      if (token) getClientBundle(token, id);
      const row = _memberRowOrThrow_(id).row;
      _withMemberMemo_(function () { return getPortalMoreImpl_(row, null); });
      res.clients++;
    } catch (e) { Logger.log('Warm klien ' + id + ': ' + e); }
  }
  res.ms = Date.now() - t0;
  console.log(JSON.stringify({ warm: res }));
  return res;
}

/** Pasang satu pemicu runWarmTick tiap 15 menit (hapus duplikat). Kembalikan jumlah yang dihapus. */
function _installWarmTrigger_() {
  const removed = _removeWarmTrigger_();
  ScriptApp.newTrigger('runWarmTick').timeBased().everyMinutes(15).create();
  return removed;
}
function _removeWarmTrigger_() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runWarmTick') { ScriptApp.deleteTrigger(t); removed++; }
  });
  return removed;
}
