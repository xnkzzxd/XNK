// Laporan angka untuk XNK HQ (hub xnk.web.id, T-2233). Spreadsheet coach di hub mendaftar ke XNK HQ dengan
// rahasia acak (Script Property HUB_SECRET, ditulis wizard setup lewat Library); XNK HQ memanggil hubStatus setiap
// pagi untuk dasbor /adminxnk dan email peringatan pemilik.
// Publik tanpa token admin/klien; satu-satunya penjaga adalah HUB_SECRET (perbandingan waktu-konstan, seperti relay
// push). Tanpa HUB_SECRET (produksi xnk.my.id) selalu menolak. Isi jawaban hanya angka dan status: tidak ada nama,
// nomor WA, catatan atau data kesehatan klien.

/** Tolak bila rahasia tidak cocok (pesan sama dengan permintaan tak dikenal). */
function _hubAuth_(secret) {
  var want = String(PropertiesService.getScriptProperties().getProperty('HUB_SECRET') || '');
  var got = String(secret == null ? '' : secret);
  var ok = want.length >= 32 && got.length === want.length;
  var diff = 0;
  for (var i = 0; i < want.length && i < got.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  if (!ok || diff !== 0) throw new Error('Permintaan tidak valid.');
}

/** Waktu (ms) dari sel tanggal/teks ISO; NaN bila kosong. */
function _hubMs_(v) {
  if (v instanceof Date) return v.getTime();
  var t = new Date(String(v || '')).getTime();
  return isNaN(t) ? NaN : t;
}

/**
 * Status spreadsheet ini untuk XNK HQ. Hanya angka.
 * @param {string} secret HUB_SECRET spreadsheet ini
 * @return {{at: string, lib: ?Object, api: number, triggers: Object, reminders: Object, clients: Object, sessions: Object, quota: Object}}
 */
function hubStatus(secret) {
  _hubAuth_(secret);
  var props = PropertiesService.getScriptProperties();
  var now = Date.now(), day = 864e5;
  var b = typeof LIB_BUILD !== 'undefined' ? LIB_BUILD : null;
  var handlers = ScriptApp.getProjectTriggers().map(function(t) { return t.getHandlerFunction(); });
  var count = function(n) { return handlers.filter(function(h) { return h === n; }).length; };
  var last = parseInt(props.getProperty('RMD_LAST_tick'), 10);

  var sched = _readSchedulesAll_();
  var active = {}, done7 = 0, next7 = 0;
  sched.forEach(function(s) {
    var t = _hubMs_(s.start);
    if (isNaN(t)) return;
    if (t >= now - 30 * day && s.memberId) active[s.memberId] = 1;
    if (s.status === 'completed' && t >= now - 7 * day && t <= now) done7++;
    if (s.status !== 'completed' && t > now && t <= now + 7 * day) next7++;
  });
  var md = _getMemberDataSheet_();

  return {
    at: new Date(now).toISOString(),
    lib: b ? { hash: String(b.hash || ''), commit: String(b.commit || '') } : null,
    api: API_VERSION,
    triggers: { runReminderTick: count('runReminderTick'), runWarmTick: count('runWarmTick') },
    reminders: { enabled: props.getProperty('RMD_ENABLED') === 'true', lastTickAt: isNaN(last) ? '' : new Date(last).toISOString() },
    clients: { total: Math.max(0, md.getLastRow() - 1), active30d: Object.keys(active).length },
    sessions: { done7d: done7, next7d: next7 },
    quota: _quotaToday_(),   // T-2253: email, fetch, menit trigger hari ini (WIB)
    readonly: _readonlyOn_(),   // T-2251: mode baca saja (langganan)
    left: _hubLeft_(),          // T-2252: coach keluar
  };
}

// ── Backup mingguan (T-2250) ────────────────────────────────────────────────────────────────────────────────
// XNK HQ menyalin seluruh spreadsheet ini ke Drive pemilik seminggu sekali. Beda dengan hubStatus, jawaban ini
// berisi data penuh (nilai tampilan sel), tetap hanya untuk pemegang HUB_SECRET. Script Properties tidak pernah
// diekspor; foto progres tetap di Drive coach (ProgressPhotos hanya menyimpan ID).
var HUB_EXPORT_ROWS = 2000;        // baris per panggilan
var HUB_EXPORT_BYTES = 4000000;    // perkiraan ukuran JSON per panggilan

/**
 * Ekspor spreadsheet ini untuk backup XNK HQ.
 * Tanpa req: daftar sheet. Dengan {sheet, from}: baris mulai `from` (1 = baris judul), maks HUB_EXPORT_ROWS baris dan
 * ±HUB_EXPORT_BYTES; next = baris berikutnya, 0 bila selesai. Nilai = getDisplayValues() (teks, tanpa objek Date).
 * @param {string} secret HUB_SECRET spreadsheet ini
 * @param {?{sheet: string, from: number}} req
 */
function hubExport(secret, req) {
  _hubAuth_(secret);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!req || req.sheet == null || req.sheet === '') {
    return {
      at: new Date().toISOString(),
      sheets: ss.getSheets().map(function(s) { return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() }; }),
    };
  }
  var from = req.from == null ? 1 : Number(req.from);
  if (typeof req.sheet !== 'string' || !isFinite(from) || from < 1 || Math.floor(from) !== from) throw new Error('Permintaan tidak valid.');
  var sh = ss.getSheetByName(req.sheet);
  if (!sh) throw new Error('Sheet tidak ditemukan.');
  var last = sh.getLastRow(), cols = sh.getLastColumn();
  if (from > last || cols < 1) return { rows: [], cols: cols, next: 0 };
  var n = Math.min(HUB_EXPORT_ROWS, last - from + 1);
  var vals = sh.getRange(from, 1, n, cols).getDisplayValues();
  var out = [], size = 0;
  for (var i = 0; i < vals.length; i++) {
    var len = JSON.stringify(vals[i]).length + 1;
    if (out.length && size + len > HUB_EXPORT_BYTES) break;
    out.push(vals[i]);
    size += len;
  }
  var next = from + out.length;
  return { rows: out, cols: cols, next: next > last ? 0 : next };
}

// ── Web Push di hub (T-2240) ────────────────────────────────────────────────────────────────────────────────
// Semua coach di xnk.web.id berbagi satu origin, jadi satu pasang kunci VAPID untuk seluruh hub. Kunci privat hanya ada
// di secret repo hub (HUB_VAPID_PRIVATE); spreadsheet coach hanya menyimpan kunci publik. XNK HQ memanggil
// hubPushKey setiap pagi (dan saat pemilik menyalakan/mematikan push coach di /adminxnk). Jawabannya membawa rahasia
// relay lokal (PUSH_RELAY_SECRET): workflow push repo hub mengambilnya dari XNK HQ lalu memanggil pushRelayPull /
// pushRelayAck spreadsheet ini langsung, jadi HUB_SECRET tidak pernah keluar dari XNK HQ dan XNK HQ tidak memakai
// kuota UrlFetch untuk setiap putaran kirim.

/**
 * Pasang kunci publik hub dan nyalakan/matikan push coach ini.
 * @param {string} secret HUB_SECRET spreadsheet ini
 * @param {string} publicKey kunci publik VAPID hub (base64url, 65 bita)
 * @param {boolean} on true = push menyala (pilihan pemilik di /adminxnk); selain true = mati (aturan 5)
 * @return {{on: boolean, relay: string, subs: number}}
 */
function hubPushKey(secret, publicKey, on) {
  _hubAuth_(secret);
  var key = String(publicKey == null ? '' : publicKey).trim();
  if (!/^B[A-Za-z0-9_-]{86}$/.test(key)) throw new Error('Kunci publik tidak valid.');
  var props = PropertiesService.getScriptProperties();
  var relay = String(props.getProperty('PUSH_RELAY_SECRET') || '');
  if (relay.length < 24) {
    relay = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('PUSH_RELAY_SECRET', relay);
  }
  var changed = props.getProperty('PUSH_VAPID_PUBLIC') !== key || (props.getProperty('PUSH_ENABLED') === 'true') !== (on === true);
  props.setProperty('PUSH_VAPID_PUBLIC', key);
  props.setProperty('PUSH_ENABLED', on === true ? 'true' : 'false');
  props.deleteProperty('PUSH_VAPID_PRIVATE');   // coach hub tidak pernah memegang kunci privat
  // Kunci publik ada di getPortalBootstrap (kartu notifikasi): jawaban tersimpan dibuang supaya kartu muncul/hilang.
  if (changed) { try { _bumpMember_('*'); } catch (e) { /* cache mati: jawaban lama habis sendiri */ } }
  var subs = 0;
  try { subs = _pushSubsAll_().length; } catch (e) { subs = 0; }
  return { on: _pushOn_(), relay: relay, subs: subs };
}

// ── Ganti slug di hub (T-2243) ──────────────────────────────────────────────────────────────────────────────
// Pemilik mengganti nama di alamat coach (xnk.web.id/<lama> → /<baru>) lewat XNK HQ. Alamat lama tetap mengarah ke
// yang baru (halaman pengalih di hub), tetapi link baru di pesan WhatsApp, kode QR kartu dan "Cek kesehatan" memakai
// SITE_URL. XNK HQ mengirim alamat baru lewat fungsi ini, dijaga HUB_SECRET seperti hubStatus.

/**
 * Simpan alamat situs coach yang baru (SITE_URL).
 * @param {string} secret HUB_SECRET spreadsheet ini
 * @param {string} url alamat utama situs coach, mis. https://xnk.web.id/baru ('/klien' di ujung dibuang)
 * @return {{siteUrl: string, changed: boolean}}
 */
function hubSiteUrl(secret, url) {
  _hubAuth_(secret);
  var site = String(url == null ? '' : url).trim().replace(/\/+$/, '').replace(/\/klien$/i, '');
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[A-Za-z0-9._~-]+)*$/i.test(site) || site.length > 200) throw new Error('Alamat situs tidak valid.');
  var props = PropertiesService.getScriptProperties();
  var changed = props.getProperty('SITE_URL') !== site;
  props.setProperty('SITE_URL', site);
  if (changed) {
    // Alamat portal ada di jawaban yang disimpan (link WhatsApp, kode QR kartu): semuanya dibangun ulang.
    try { _bustShared_(); _bumpMember_('*'); } catch (e) { /* cache mati: jawaban lama habis sendiri */ }
  }
  return { siteUrl: site, changed: changed };
}
