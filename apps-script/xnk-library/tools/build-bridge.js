'use strict';
// Membangun kode penghubung untuk spreadsheet XNK Template:
//   node apps-script/xnk-library/tools/build-bridge.js [outDir] --lib-id <scriptId Library> --lib-version <N>
// Isi: bridge-src/* (kode lokal + wizard), PenghubungApi.gs (pembungkus satu baris untuk setiap fungsi di
// tests/api-lists.js, supaya halaman web dan trigger memanggil Library dengan konteks spreadsheet ini) dan
// appsscript.json (Library XNK dengan versi tersemat; web app dan izin sama dengan produksi + menu/sidebar).
const fs = require('fs');
const path = require('path');

const HERE = path.join(__dirname, '..');
const PROD = path.join(HERE, '..', 'pt-scheduler');
const BRIDGE_SRC = path.join(HERE, 'bridge-src');
const DEFAULT_OUT = path.join(HERE, 'dist', 'bridge');
const DEFAULT_TEMPLATE_SITE = 'https://github.com/xnkzzxd/xnk-template-site';

function apiNames() {
  const L = require(path.join(PROD, 'tests', 'api-lists.js'));
  const seen = new Set();
  return [...L.PUBLIC_API, ...L.ADMIN, ...L.MEMBER, ...L.OWNER, ...L.TRIGGER].filter(n => !seen.has(n) && seen.add(n));
}

/** Nama fungsi tingkat atas di sebuah berkas .gs. */
function topFunctions(text) {
  const out = [];
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

function build(opts) {
  opts = opts || {};
  const libId = opts.libId || 'LIB_SCRIPT_ID_BELUM_DIATUR';
  const libVersion = String(opts.libVersion || '1');
  if (!/^[\w-]+$/.test(libId)) throw new Error('build-bridge: --lib-id tidak valid');
  if (!/^\d+$/.test(libVersion)) throw new Error('build-bridge: --lib-version harus angka');
  const site = opts.templateSite || process.env.XNK_TEMPLATE_SITE || DEFAULT_TEMPLATE_SITE;
  if (!/^https:\/\/[^\s'"\\]+$/.test(site)) throw new Error('build-bridge: alamat template situs tidak valid');

  const files = {};
  for (const f of fs.readdirSync(BRIDGE_SRC).sort()) files[f] = fs.readFileSync(path.join(BRIDGE_SRC, f), 'utf8');

  const local = new Set(topFunctions(files['Penghubung.gs']));
  const names = apiNames();
  const clash = names.filter(n => local.has(n));
  if (clash.length) throw new Error('build-bridge: nama fungsi lokal bentrok dengan API: ' + clash.join(', '));

  files['PenghubungApi.gs'] = `// DIBUAT OTOMATIS oleh apps-script/xnk-library/tools/build-bridge.js dari tests/api-lists.js. Jangan diubah.
// Satu pembungkus per fungsi server: halaman web (google.script.run) dan trigger memanggil Library dengan
// layanan milik spreadsheet ini (ctx_). Tidak ada logika aplikasi di sini; setiap fungsi tetap menjaga
// dirinya sendiri di Library (token admin/klien, pemilik).
var XNK_TEMPLATE_SITE = ${JSON.stringify(site)};
var XNK_LIB_VERSION_PINNED = ${JSON.stringify(libVersion)};
${names.map(n => `function ${n}() { return XNK.run(ctx_(), ${JSON.stringify(n)}, Array.prototype.slice.call(arguments)); }`).join('\n')}
`;

  const prodMan = JSON.parse(fs.readFileSync(path.join(PROD, 'src', 'appsscript.json'), 'utf8'));
  const scopes = [...new Set([...(prodMan.oauthScopes || []), 'https://www.googleapis.com/auth/script.container.ui'])];
  files['appsscript.json'] = JSON.stringify({
    timeZone: prodMan.timeZone,
    dependencies: { libraries: [{ userSymbol: 'XNK', libraryId: libId, version: libVersion }] },
    exceptionLogging: prodMan.exceptionLogging,
    runtimeVersion: prodMan.runtimeVersion,
    webapp: prodMan.webapp,
    oauthScopes: scopes,
  }, null, 2) + '\n';
  return { files, names, local: [...local] };
}

function write(outDir, files) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), t);
}

module.exports = { build, write, topFunctions, apiNames, DEFAULT_OUT };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const libId = flag('--lib-id') || process.env.XNK_LIB_SCRIPT_ID;
  const libVersion = flag('--lib-version') || process.env.XNK_LIB_VERSION;
  const out = args[0] ? path.resolve(args[0]) : DEFAULT_OUT;
  const r = build({ libId, libVersion });
  write(out, r.files);
  console.log(`Kode penghubung: ${r.names.length} pembungkus + ${r.local.length} fungsi lokal → ${path.relative(process.cwd(), out)}`);
}
