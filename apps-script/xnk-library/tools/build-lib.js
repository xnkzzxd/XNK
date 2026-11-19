'use strict';
// Membangun XNK Library dari kode produksi, TANPA mengubah produksi:
//   node apps-script/xnk-library/tools/build-lib.js [outDir]      (bawaan: apps-script/xnk-library/dist/lib)
// Sumber: apps-script/pt-scheduler/src (hanya dibaca). Perubahan hanya di salinan:
//   1. Layanan bersama diganti dengan layanan milik spreadsheet pemanggil (lib-extra/Konteks.gs):
//      PropertiesService.getScriptProperties() -> _props_(), CacheService.getScriptCache() -> _cache_(),
//      LockService.getScriptLock() -> _lock_(), SpreadsheetApp.getActiveSpreadsheet() -> _ss_(), ScriptApp. -> _scriptApp_().
//   2. Identitas XNK yang tertanam (alamat portal, judul, ikon, ID sheet evaluasi) diganti pengaturan per spreadsheet.
//   3. Halaman landing pemilik (foto, harga) tidak ikut.
//   4. Ditambah lib-extra/*.gs, LibTabel.gs (daftar fungsi untuk XNK.run) dan LibVersi.gs (sidik versi).
// Gagal keras bila pola yang dicari tidak ditemukan atau masih ada layanan bersama yang tersisa,
// supaya perubahan di produksi yang mematahkan Library langsung ketahuan di CI.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const HERE = path.join(__dirname, '..');
const PROD = path.join(HERE, '..', 'pt-scheduler');
const SRC = path.join(PROD, 'src');
const EXTRA = path.join(HERE, 'lib-extra');
const DEFAULT_OUT = path.join(HERE, 'dist', 'lib');

const DROP_FILES = ['Landing.html', 'LandingScript.html', 'LandingStyle.html'];
const SERVICE_SWAPS = [
  [/PropertiesService\.getScriptProperties\(\)/g, '_props_()'],
  [/CacheService\.getScriptCache\(\)/g, '_cache_()'],
  [/LockService\.getScriptLock\(\)/g, '_lock_()'],
  [/SpreadsheetApp\.getActiveSpreadsheet\(\)/g, '_ss_()'],
  [/\bScriptApp\./g, '_scriptApp_().'],
];
// Setelah diganti, tidak boleh ada lagi pemakaian langsung layanan ini di kode produksi yang disalin.
const FORBIDDEN = [/\bPropertiesService\b/, /\bCacheService\b/, /\bLockService\b/, /\bScriptApp\b/, /getActiveSpreadsheet/];
// Memo per eksekusi yang dikosongkan Konteks.gs setiap konteks dipasang.
const MEMOS = ['_memberMemo_', '_schedMemo_', '_readMemo_', '_progMemo_', '_exAliasMemo_', '_lockDepth_', '_quotaAcc_', '_quotaHold_', '_rmdCurJob_'];
// Fungsi produksi yang dipakai LibApi.gs.
const NEEDED = ['_ensureCoachSchema_', '_getMemberDataSheet_', '_getMembersLogSheet_', '_readSchedulesAll_',
  '_priceListSheetAndColumns_', '_sessionSecret_', '_locked_', '_bustShared_', '_bustSlots_', '_installReminderTrigger_',
  'requireOwner_', 'doGet', 'doPost', '_tidyRun_', '_tidyText_'];

// [berkas, cari (teks persis), ganti, jumlah yang diharapkan]
const TEXT_SWAPS = [
  // Google Analytics milik xnk.my.id tidak ikut ke coach lain (data kunjungan klien coach bukan milik XNK; T-2223).
  ['Index.html', `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-93SRTYH3SG"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-93SRTYH3SG');
  </script>
`, '\n', 1],
  // Identitas usaha
  ['Kode.gs', "const faviconUrl = page === 'Landing' ? 'https://xnkbooking.my.id/favicon.ico' : 'https://xnk.my.id/favicon.ico';",
    "const faviconUrl = _faviconUrl_() || 'https://www.gstatic.com/images/branding/product/1x/apps_script_48dp.png';", 1],
  ['Kode.gs', ".setTitle('XNK Personal Training')", '.setTitle(_brandName_())', 1],
  ['Kode.gs', "var validPages = ['Index', 'Landing'];", "var validPages = ['Index'];", 1],
  ['Kode.gs', "text: '✅ Tes notifikasi dari xnk.my.id — kalau pesan ini sampai, token & Chat ID sudah benar.'",
    "text: '✅ Tes notifikasi dari ' + _brandName_() + ' — kalau pesan ini sampai, token & Chat ID sudah benar.'", 1],
  ['Kode.gs', '"👉 https://book.xnkbooking.my.id\\n\\n" +', '"👉 " + _siteUrl_() + "\\n\\n" +', 1],
  ['Reminder.gs', "var RMD_PORTAL_URL = 'https://book.xnkbooking.my.id';", '// RMD_PORTAL_URL: di Library diganti _siteUrl_() (alamat per spreadsheet).', 1],
  ['BagikanData.gs', "const SHARE_QR_DEFAULT = 'https://xnkbooking.my.id';", '// SHARE_QR_DEFAULT: di Library diganti _siteUrl_().', 1],
  // ID sheet evaluasi pemilik: di Library jadi Script Property EVAL_SHEET_ID (kosong = tanpa testimoni dari form).
  ['Kode.gs', "const EVAL_SHEET_ID = '1tyEjraoYNXV8nEMNylT9xSUUpLiLHw7bpcWfiQ3J6Uo';", '// EVAL_SHEET_ID: di Library dibaca dari Script Property spreadsheet pemanggil.', 1],
  ['Kode.gs', 'const ss = SpreadsheetApp.openById(EVAL_SHEET_ID);',
    "const _evalId_ = _props_().getProperty('EVAL_SHEET_ID'); if (!_evalId_) return []; const ss = SpreadsheetApp.openById(_evalId_);", 1],
  // Teks di halaman (App.html)
  ['App.html', "'Dibooking lewat book.xnkbooking.my.id. Ubah jadwal lewat portal.'", "'Dibooking lewat portal klien. Ubah jadwal lewat portal.'", 1],
  ['App.html', "'Dibooking lewat book.xnkbooking.my.id'", "'Dibooking lewat portal klien'", 1],
  // Nomor WA pemilik XNK tidak ikut ke coach lain: kosong = tombol WA klien memakai No WA di profil coach (panel → Coach).
  ['App.html', "const COACH_WA_NUMBER = '6288221254305';", "const COACH_WA_NUMBER = '';", 1],
  ['App.html', "'https://book.xnkbooking.my.id (Beranda → Form kesehatan) sebelum sesi ya.'", "'portal klien (Beranda → Form kesehatan) sebelum sesi ya.'", 1],
  // Merek: setiap teks yang tampil ke coach atau klien memakai nama usaha coach itu, bukan "XNK".
  // Browser: window.brandName() (config.js "brand", atau judul halaman yang diisi server) dibuat di awal App.html.
  ['App.html', "(function () {\n  'use strict';\n", `(function () {
  'use strict';
  // Library: nama usaha coach, dari config.js ("brand") atau judul halaman yang diisi server; menggantikan "XNK" di semua teks.
  window.XNK_BRAND = String((window.XNK_CONFIG && window.XNK_CONFIG.brand) || document.title || '').trim() || 'Personal Training';
  window.brandName = function () { return window.XNK_BRAND; };
  Array.prototype.forEach.call(document.querySelectorAll('[data-brand]'), function (el) { el.textContent = window.XNK_BRAND; });
`, 1],
  ['App.html', "+ 'XNK Personal Training';", "+ window.brandName();", 1],
  ['App.html', "TITLES[viewId] || 'XNK';", "TITLES[viewId] || window.brandName();", 1],
  ['App.html', "', ini Coach XNK. Mengingatkan", "', ini Coach ' + window.brandName() + '. Mengingatkan", 1],
  ['App.html', "', ini Coach XNK. ';", "', ini Coach ' + window.brandName() + '. ';", 1],
  ['App.html', '<p class="eyebrow">XNK Personal Training</p>', `<p class="eyebrow">' + h(window.brandName()) + '</p>`, 1],
  ['App.html', '<b>XNK Personal Training</b>', `<b>' + h(window.brandName()) + '</b>`, 1],
  ['App.html', "'Sesi latihan XNK' +", "'Sesi latihan ' + window.brandName() +", 1],
  ['App.html', "' di XNK Personal Training! 💪'", "' di ' + window.brandName() + '! 💪'", 1],
  ['App.html', "'Member XNK'", "'Member'", 5],
  ['App.html', ' Menu XNK: santan', ' Menu: santan', 1],
  ['App.html', "' (member XNK).'", "' (member ' + window.brandName() + ').'", 1],
  ['App.html', ": 'XNK') + '\">';", ": window.brandName().toUpperCase().slice(0, 12)) + '\">';", 1],
  ['Index.html', '    <p>XNK Personal Training</p>', '    <p data-brand>Personal Training</p>', 1],
  ['Index.html', '<span class="brand-name">XNK</span>', '<span class="brand-name" data-brand>Personal Training</span>', 1],
  ['Index.html', 'id="page-title">XNK</h1>', 'id="page-title" data-brand>Personal Training</h1>', 1],
  ['Index.html', 'Pasang XNK di Layar Utama', 'Pasang aplikasi ini di Layar Utama', 1],
  ['Index.html', '<b>XNK Personal Training</b>', '<b data-brand>Personal Training</b>', 1],
  ['Bagikan.html', "ctx.measureText('XNK')", "ctx.measureText(window.brandName().slice(0, 16))", 1],
  ['Bagikan.html', "Tx(ctx, 'XNK', x0", "Tx(ctx, window.brandName().slice(0, 16), x0", 1],
  ['Bagikan.html', "'Logo XNK'", "'Logo'", 1],
  ['Kode.gs', "di XNK untuk paket '", "di ' + _brandName_() + ' untuk paket '", 1],
  ['Kode.gs', '<h3>📊 Laporan Mingguan XNK Gym OS</h3>', '<h3>📊 Laporan Mingguan ${_brandName_()}</h3>', 1],
  ['Kode.gs', '"📊 Laporan Mingguan XNK Gym OS - "', '"📊 Laporan Mingguan " + _brandName_() + " - "', 1],
  ['Kode.gs', "'Klien XNK'", "'Klien'", 2],
  ['Level.gs', "' minggu bersama XNK'", "' minggu bersama kami'", 1],
  // Cadangan alamat QR kartu bila server tidak mengirim alamat: kosong (QR tidak digambar), bukan situs XNK.
  ['App.html', "setState.data.shareQrDefault || 'https://xnkbooking.my.id'", "setState.data.shareQrDefault || ''", 2],
  ['Bagikan.html', "(st.src.share && st.src.share.qrUrl) || 'https://xnkbooking.my.id'", "(st.src.share && st.src.share.qrUrl) || ''", 1],
  ['Bagikan.html', 'if (qr) drawQr(ctx, o.qrUrl,', 'if (qr && o.qrUrl) drawQr(ctx, o.qrUrl,', 1],
  ['App.html', 'Gabung grup kelas privatku di XNK (', 'Gabung grup kelas privatku (', 1],
  ['App.html', 'Ambil paketnya di https://book.xnkbooking.my.id lalu', 'Ambil paketnya di portal klien lalu', 1],
];
// Pengenal yang diganti di semua .gs (bukan deklarasinya, itu sudah dihapus di atas).
const IDENT_SWAPS = [[/\bRMD_PORTAL_URL\b/g, '_siteUrl_()'], [/\bSHARE_QR_DEFAULT\b/g, '_siteUrl_()']];

// Checkout Windows (core.autocrlf) memberi akhiran CRLF: dinormalkan ke LF supaya pola, pemeriksaan komentar dan
// sidik build sama persis dengan CI (Linux). Apps Script sendiri menerima keduanya.
const lf = s => String(s).replace(/\r\n?/g, '\n');

function count(text, needle) { let n = 0, i = 0; while ((i = text.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; }
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function commitOf() {
  // Commit penuh (40 huruf): build-hub.js mengambil commit ini dari GitHub untuk membangun halaman yang cocok (T-2220).
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execSync('git rev-parse HEAD', { cwd: HERE, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return 'lokal'; }
}

function libTable() {
  const L = require(path.join(PROD, 'tests', 'api-lists.js'));
  const groups = [['publik', L.PUBLIC_API], ['admin', L.ADMIN], ['member', L.MEMBER], ['pemilik', L.OWNER], ['trigger', L.TRIGGER]];
  const seen = new Set();
  const lines = [];
  for (const [title, names] of groups) {
    const fresh = names.filter(n => !seen.has(n));
    fresh.forEach(n => seen.add(n));
    lines.push(`    // ${title} (${fresh.length})`);
    fresh.forEach(n => lines.push(`    ${n}: ${n},`));
  }
  return { names: [...seen], text: `// DIBUAT OTOMATIS oleh apps-script/xnk-library/tools/build-lib.js dari tests/api-lists.js. Jangan diubah.
// Fungsi yang boleh dijalankan XNK.run(ctx, nama, args). Setiap fungsi tetap menjaga dirinya sendiri
// (requireAdmin_ / requireMember_ / requireOwner_).
function _libTable_() {
  return {
${lines.join('\n')}
  };
}
` };
}

/** Kembalikan { files: {nama: isi}, hash, names } tanpa menulis apa pun. */
function build() {
  const files = {};
  for (const f of fs.readdirSync(SRC).sort()) {
    if (DROP_FILES.includes(f)) continue;
    if (!/\.(gs|html|json)$/.test(f)) continue;
    files[f] = lf(fs.readFileSync(path.join(SRC, f), 'utf8'));
  }
  for (const [f, find, repl, n] of TEXT_SWAPS) {
    if (!files[f]) throw new Error(`build-lib: ${f} tidak ada`);
    const c = count(files[f], find);
    if (c !== n) throw new Error(`build-lib: di ${f} diharapkan ${n}× "${find.slice(0, 70)}…", ditemukan ${c}. Perbarui TEXT_SWAPS.`);
    files[f] = files[f].split(find).join(repl);
  }
  const all = Object.keys(files).filter(f => f.endsWith('.gs')).map(f => files[f]).join('\n');
  for (const m of MEMOS) if (!new RegExp('^let ' + m.replace(/\$/g, '\\$') + ' = ', 'm').test(all)) throw new Error(`build-lib: memo ${m} tidak ditemukan; perbarui MEMOS dan Konteks.gs.`);
  for (const fn of NEEDED) if (!new RegExp('^function ' + fn + '\\(', 'm').test(all)) throw new Error(`build-lib: fungsi ${fn} tidak ditemukan di produksi.`);

  for (const f of Object.keys(files)) {
    if (!f.endsWith('.gs')) continue;
    let t = files[f];
    for (const [re, to] of SERVICE_SWAPS) t = t.replace(re, to);
    for (const [re, to] of IDENT_SWAPS) t = t.replace(re, to);
    t.split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\*)/.test(line)) return;   // baris komentar blok
      const code = line.replace(/\/\/.*$/, '');
      for (const re of FORBIDDEN) if (re.test(code)) throw new Error(`build-lib: ${f}:${i + 1} masih memakai layanan bersama: ${line.trim().slice(0, 120)}`);
    });
    files[f] = t;
  }

  // Manifest Library: zona waktu, runtime dan izin sama dengan produksi; bukan web app.
  const man = JSON.parse(files['appsscript.json']);
  delete man.webapp;
  files['appsscript.json'] = JSON.stringify(man, null, 2) + '\n';

  for (const f of fs.readdirSync(EXTRA).sort()) {
    if (files[f]) throw new Error(`build-lib: ${f} bentrok dengan berkas produksi.`);
    files[f] = lf(fs.readFileSync(path.join(EXTRA, f), 'utf8'));
  }
  const tbl = libTable();
  files['LibTabel.gs'] = tbl.text;

  // Apps Script menyimpan .gs dan .html dalam satu ruang nama.
  const bases = {};
  for (const f of Object.keys(files)) {
    if (f === 'appsscript.json') continue;
    const b = f.replace(/\.(gs|html)$/, '');
    if (bases[b]) throw new Error(`build-lib: ${f} dan ${bases[b]} bernama sama tanpa ekstensi.`);
    bases[b] = f;
  }

  const hash = sha(Object.keys(files).sort().map(f => f + '\n' + files[f]).join('\n\u0000')).slice(0, 12);
  files['LibVersi.gs'] = `// DIBUAT OTOMATIS oleh apps-script/xnk-library/tools/build-lib.js. Jangan diubah.
// hash = sidik isi Library (tanpa berkas ini); dipakai healthCheck untuk tahu ada versi baru atau tidak.
var LIB_BUILD = ${JSON.stringify({ hash, commit: commitOf(), builtAt: new Date().toISOString().slice(0, 10) })};
`;
  return { files, hash, names: tbl.names };
}

function write(outDir, files) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), t);
}

module.exports = { build, write, lf, DEFAULT_OUT, TEXT_SWAPS, DROP_FILES };

if (require.main === module) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT;
  const r = build();
  write(out, r.files);
  console.log(`XNK Library ${r.hash}: ${Object.keys(r.files).length} berkas, ${r.names.length} fungsi di XNK.run → ${path.relative(process.cwd(), out)}`);
}
