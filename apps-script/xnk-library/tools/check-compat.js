'use strict';
// Menjalankan SELURUH tes produksi (apps-script/pt-scheduler/tests) terhadap kode Library hasil build.
// Lolos bila semua tes lolos, kecuali daftar EXPECTED di bawah: tes yang memang sengaja berbeda di Library
// (identitas XNK diganti pengaturan per spreadsheet, landing pemilik tidak ikut, ada fungsi API Library baru).
// Tes lain yang gagal = perilaku Library menyimpang dari produksi, dan CI gagal.
//   node apps-script/xnk-library/tools/check-compat.js
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const HERE = path.join(__dirname, '..');
const PROD_TESTS = path.join(HERE, '..', 'pt-scheduler', 'tests');

const EXPECTED = {
  // Fungsi API Library baru (run, handleGet, initInstance, …): dijaga requireOwner_/konteks, bukan daftar produksi.
  'every public writer bumps the member version or is listed as not touching member data': 'fungsi API Library',
  'every browser-callable server function is classified': 'fungsi API Library',
  // Link portal di pesan WhatsApp = alamat situs spreadsheet itu (SITE_URL / /exec), bukan book.xnkbooking.my.id.
  'a column N the owner already uses is never overwritten': 'link portal per spreadsheet',
  'admin addMember still renews an existing client (resets quota, keeps key)': 'link portal per spreadsheet',
  'the three new types are registered, off by default, with editable messages and previews': 'link portal per spreadsheet',
  'rekap-bulanan: one button per client who trained or logged last month, with a personal message': 'link portal per spreadsheet',
  'rekap-bulanan: measurements alone qualify, missing data leaves lines out, opt-outs and no-number clients are handled': 'link portal per spreadsheet',
  'waktunya-ukur: clients whose last entry is 14+ days old (or missing) get a button; recent ones do not': 'link portal per spreadsheet',
  // Alamat QR bawaan kartu = alamat situs spreadsheet itu.
  "getAppSettings returns today's defaults until the admin changes something": 'alamat QR per spreadsheet',
  'updateAppSettings saves every field, and getAppSettings reflects it back': 'alamat QR per spreadsheet',
  'QR address: https only, empty falls back to the default': 'alamat QR per spreadsheet',
  // Judul dan ikon halaman Apps Script = nama usaha spreadsheet itu; landing pemilik tidak ikut.
  'the page title is XNK Personal Training': 'nama usaha per spreadsheet',
  'doGet serves only real pages; unknown views fall back to Index': 'landing pemilik tidak ikut',
  'doGet sets the tab icon per site, and the landing draws the real X mark (no chevron)': 'ikon per spreadsheet',
};

function main() {
  const files = fs.readdirSync(PROD_TESTS).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(PROD_TESTS, f));
  const r = spawnSync(process.execPath, ['--require', path.join(HERE, 'tests', 'compat-hook.js'), '--test', '--test-reporter=tap', ...files],
    { cwd: HERE, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = [], passed = [];
  for (const line of out.split('\n')) {
    let m = /^\s*not ok \d+ - (.+?)(?: # .*)?$/.exec(line);
    if (m) { failed.push(m[1].trim()); continue; }
    m = /^\s*ok \d+ - (.+?)(?: # .*)?$/.exec(line);
    if (m) passed.push(m[1].trim());
  }
  // Baris induk per berkas ("../x.test.js") ikut gagal bila salah satu anaknya gagal: abaikan.
  const real = failed.filter(t => !/\.test\.js$/.test(t));
  const unexpected = real.filter(t => !EXPECTED[t]);
  const missing = Object.keys(EXPECTED).filter(t => !real.includes(t) && !passed.includes(t));
  console.log(`Tes produksi pada kode Library: ${passed.length} lolos, ${real.length} berbeda (diharapkan ${Object.keys(EXPECTED).length}).`);
  if (missing.length) console.log('Catatan: tes di EXPECTED tidak ditemukan lagi (judulnya berubah?):\n  ' + missing.join('\n  '));
  if (unexpected.length || passed.length < 600) {
    console.error('Perilaku Library menyimpang dari produksi pada tes berikut:\n  ' + unexpected.join('\n  '));
    if (passed.length < 600) console.error('Terlalu sedikit tes yang berjalan (' + passed.length + '); keluaran:\n' + out.slice(-3000));
    process.exit(1);
  }
}

main();
