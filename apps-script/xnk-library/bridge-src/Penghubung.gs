// XNK Template — kode penghubung lokal spreadsheet ini ke XNK Library.
// Semua logika aplikasi ada di Library (XNK). Berkas ini hanya:
//   - membawa layanan milik spreadsheet ini (ctx_) ke setiap panggilan Library, supaya PIN, cache, kunci dan
//     pengaturan spreadsheet ini tidak tercampur dengan spreadsheet lain yang memakai Library yang sama;
//   - halaman web (doGet/doPost), trigger, menu XNK, wizard setup dan cek kesehatan.
// Pembungkus fungsi untuk halaman web ada di PenghubungApi.gs (dibuat otomatis). Jangan menambah logika di sini.

/** Layanan milik spreadsheet ini. Dibuat baru di setiap panggilan. */
function ctx_() {
  return {
    props: PropertiesService.getScriptProperties(),
    cache: CacheService.getScriptCache(),
    lock: LockService.getScriptLock(),
    ss: SpreadsheetApp.getActiveSpreadsheet(),
    scriptApp: ScriptApp,
  };
}

// ── Halaman web ──────────────────────────────────────────────────────────────────────────────────────────

function doGet(e) { return XNK.handleGet(ctx_(), e); }
function doPost(e) { return XNK.handlePost(ctx_(), e); }

// ── Menu dan wizard ──────────────────────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('XNK')
    .addItem('Mulai setup', 'showSetup')
    .addItem('Cek kesehatan', 'menuHealth_')
    .addSeparator()
    .addItem('Pasang ulang trigger', 'menuTriggers_')
    .addItem('Versi Library', 'menuVersion_')
    .addToUi();
}

/** Buka wizard setup di samping spreadsheet. */
function showSetup() {
  const html = HtmlService.createHtmlOutputFromFile('Setup').setTitle('Setup XNK');
  SpreadsheetApp.getUi().showSidebar(html);
}

function menuHealth_() {
  safely_('Cek kesehatan', function () {
    const r = validateConfiguration();
    const lines = r.ok ? ['Semua beres ✅'] : r.problems.map(function (p) { return '• ' + p; });
    lines.push('', 'Versi Library: ' + r.version.hash + ' (' + r.version.builtAt + ')');
    if (r.setup.execUrl) lines.push('Link aplikasi: ' + r.setup.execUrl);
    SpreadsheetApp.getUi().alert('Cek kesehatan XNK', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  });
}

function menuTriggers_() {
  safely_('Pasang ulang trigger', function () {
    const r = setupTriggers();
    SpreadsheetApp.getActiveSpreadsheet().toast('Trigger terpasang: ' + r.installed.join(', '), 'XNK', 5);
  });
}

function menuVersion_() {
  safely_('Versi Library', function () {
    const v = getLibraryVersion();
    SpreadsheetApp.getUi().alert('XNK Library', 'Versi ' + v.hash + '\nDibuat ' + v.builtAt + ' (commit ' + String(v.commit).slice(0, 7) + ')', SpreadsheetApp.getUi().ButtonSet.OK);
  });
}

// ── Fungsi inisialisasi (bisa juga dijalankan dari editor) ──────────────────────────────────────────────

/** Siapkan spreadsheet ini: sheet dasar, kunci sesi, trigger. Aman diulang. Salinan baru = pengaturan lama dihapus. */
function initializeTemplate() {
  const init = XNK.initInstance(ctx_());
  const trig = XNK.installTriggers(ctx_());
  return { init: init, triggers: trig };
}

/** Library tersambung? Kembalikan versinya, atau lempar pesan yang jelas. */
function checkLibraryConnection() {
  if (typeof XNK === 'undefined' || !XNK.getLibraryVersion) {
    throw new Error('Library XNK tidak tersambung. Buka Editor → Library, pastikan "XNK" ada dan versinya dipilih.');
  }
  return XNK.getLibraryVersion();
}

/** Versi Library yang dipakai spreadsheet ini. */
function getLibraryVersion() { return checkLibraryConnection(); }

/** Pasang trigger (tanpa duplikat). */
function setupTriggers() { return XNK.installTriggers(ctx_()); }

/** Cek kesehatan lengkap: sheet, PIN, trigger, link aplikasi, versi terbaru. */
function validateConfiguration() {
  checkLibraryConnection();
  return XNK.healthCheck(ctx_(), { checkUpdate: true });
}

// ── Dipanggil wizard (Setup.html). Semua fungsi Library di bawah hanya untuk pemilik spreadsheet. ────────

function setupGetState() {
  checkLibraryConnection();
  const s = XNK.setupState(ctx_());
  s.hubUrl = XNK_HUB_URL;
  // Isian awal dari workflow "Coach XNK" (spreadsheet dibuat otomatis); kosong pada salinan XNK Template.
  s.defaultSlug = typeof XNK_DEFAULT_SLUG === 'string' ? XNK_DEFAULT_SLUG : '';
  s.defaultBrand = typeof XNK_DEFAULT_BRAND === 'string' ? XNK_DEFAULT_BRAND : '';
  return s;
}

function setupInit() {
  return initializeTemplate();
}

function setupSave(data) {
  return XNK.saveSetup(ctx_(), data);
}

function setupCheck() {
  return validateConfiguration();
}

// ── pembantu ────────────────────────────────────────────────────────────────────────────────────────────

/** Jalankan aksi menu; error ditampilkan sebagai pesan, bukan layar merah. */
function safely_(title, fn) {
  try {
    return fn();
  } catch (e) {
    console.error(title + ': ' + (e && e.stack ? e.stack : e));
    SpreadsheetApp.getUi().alert(title, 'Gagal: ' + (e && e.message ? e.message : e), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
