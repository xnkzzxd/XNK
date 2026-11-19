// Langganan coach di hub xnk.web.id (T-2251): mode baca saja.
// XNK Pusat (akun pemilik) menghitung langganan tiap coach dan mengirim keadaannya lewat hubReadonly(HUB_SECRET, …).
// Saat menyala, SATU gerbang menolak setiap fungsi tulis (_readonlyGate_, dipanggil dari doPost dan dari XNK.run di
// Library); baca, login dan melihat data tetap jalan. Daftar fungsi tulis = tests/api-lists.js WRITE → _apiWrites_()
// di Api.gs (dibuat tools/build-api.js). Situs dan data tidak pernah dihapus.
// Produksi xnk.my.id tidak punya HUB_SECRET: hubReadonly selalu menolak dan _readonlyOn_ selalu false, walau Script
// Property XNK_READONLY terisi tangan.
// T-2252 (coach keluar): argumen ke-4 `left` = coach sudah berhenti memakai XNK (XNK_LEFT). Baca saja tetap sama; yang
// berbeda hanya pekerjaan latar yang tidak perlu lagi (runWarmTick dilewati). Data tidak pernah dihapus.

var READONLY_MSG = 'Mode baca saja: data bisa dilihat, tetapi belum bisa diubah untuk sementara.';

/** true bila baca saja menyala. Hanya spreadsheet hub (HUB_SECRET terpasang). */
function _readonlyOn_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('XNK_READONLY') !== 'true') return false;
  return String(props.getProperty('HUB_SECRET') || '').length >= 32;
}

/** T-2252: true bila XNK Pusat menandai coach ini keluar (hanya spreadsheet hub, sama seperti baca saja). */
function _hubLeft_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('XNK_LEFT') !== 'true') return false;
  return String(props.getProperty('HUB_SECRET') || '').length >= 32;
}

/** Untuk getAdminBootstrap: null bila mati, {on, note} bila menyala. */
function _readonlyInfo_() {
  if (!_readonlyOn_()) return null;
  return { on: true, note: String(PropertiesService.getScriptProperties().getProperty('XNK_READONLY_NOTE') || '') };
}

/** Tolak fungsi tulis saat baca saja menyala. fn = nama fungsi API. */
function _readonlyGate_(fn) {
  if (!Object.prototype.hasOwnProperty.call(_apiWrites_(), fn)) return;
  if (!_readonlyOn_()) return;
  var err = new Error(READONLY_MSG);
  err.code = 'readonly';
  throw err;
}

/**
 * Nyalakan/matikan mode baca saja (dipanggil XNK Pusat).
 * @param {string} secret HUB_SECRET spreadsheet ini
 * @param {boolean} on true = baca saja; selain true = mati
 * @param {string=} note catatan singkat untuk pita di panel coach (maks 200 huruf)
 * @param {boolean=} left T-2252: true = coach keluar (hanya bersama on = true); selain itu tanda keluar dihapus
 * @return {{on: boolean, note: string, changed: boolean, left: boolean}}
 */
function hubReadonly(secret, on, note, left) {
  _hubAuth_(secret);
  var props = PropertiesService.getScriptProperties();
  var want = on === true;
  var n = want ? String(note == null ? '' : note).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) : '';
  var was = props.getProperty('XNK_READONLY') === 'true';
  var wasNote = String(props.getProperty('XNK_READONLY_NOTE') || '');
  if (want) props.setProperty('XNK_READONLY', 'true'); else props.deleteProperty('XNK_READONLY');
  if (n) props.setProperty('XNK_READONLY_NOTE', n); else props.deleteProperty('XNK_READONLY_NOTE');
  var wantLeft = want && left === true;
  var wasLeft = props.getProperty('XNK_LEFT') === 'true';
  if (wantLeft) props.setProperty('XNK_LEFT', 'true'); else props.deleteProperty('XNK_LEFT');
  var changed = was !== want || wasNote !== n || wasLeft !== wantLeft;
  if (changed) props.setProperty('XNK_READONLY_AT', new Date().toISOString());
  return { on: _readonlyOn_(), note: n, changed: changed, left: _hubLeft_() };
}
