'use strict';
// Membangun situs statis untuk satu coach (GitHub Pages), dari kode XNK yang sama dengan xnk.my.id:
//   node apps-script/xnk-library/tools/build-tenant.js <outDir> --config <config.json> [--custom <folder>]
// config.json: { "exec": "https://script.google.com/macros/s/…/exec", "brand": "Gym Andi" }
// Hasil:
//   /            panel coach (PIN) dan portal klien (?view=public), offline + service worker
//   /klien/      portal klien di alamatnya sendiri (link untuk klien)
//   icon.svg     ikon dari huruf pertama nama usaha
//   lib-latest.json  sidik Library terbaru (dibaca "Cek kesehatan" di spreadsheet untuk tahu ada versi baru)
//   + isi folder custom/ (bila ada) disalin terakhir: berkas milik coach sendiri tidak pernah ditimpa XNK.
// Halaman memakai berkas Library hasil build (identitas XNK sudah diganti) dan memanggil /exec milik coach.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const lib = require('./build-lib');

const HERE = path.join(__dirname, '..');
const PROD_TOOLS = path.join(HERE, '..', 'pt-scheduler', 'tools');
const PROD_DEPLOYMENT = 'AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ';
const EXEC_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

/** build-static.js produksi, dengan folder sumbernya diarahkan ke berkas Library (produksi tidak diubah). */
function loadStaticBuilder(srcDir) {
  const file = path.join(PROD_TOOLS, 'build-static.js');
  const text = fs.readFileSync(file, 'utf8');
  const line = "const SRC = path.join(__dirname, '..', 'src');";
  if (!text.includes(line)) throw new Error('build-static.js: baris SRC berubah; perbarui build-tenant.js');
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(PROD_TOOLS);
  m._compile(text.replace(line, 'const SRC = ' + JSON.stringify(srcDir) + ';'), file);
  return m.exports;
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function readConfig(cfg) {
  const exec = String(cfg.exec || '').trim();
  const brand = String(cfg.brand || '').trim();
  if (!EXEC_RE.test(exec)) throw new Error('config.json: "exec" harus link /exec Apps Script (https://script.google.com/macros/s/…/exec).');
  if (exec.includes(PROD_DEPLOYMENT)) throw new Error('config.json: itu link aplikasi xnk.my.id; pakai link /exec dari salinan XNK Template milik coach ini.');
  if (!brand || brand.length > 60) throw new Error('config.json: "brand" (nama usaha) wajib, maksimal 60 huruf.');
  return { exec, brand };
}

function iconSvg(brand) {
  const ch = (brand.match(/[A-Za-z0-9]/) || ['X'])[0].toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0b0b"/>` +
    `<text x="32" y="43" text-anchor="middle" font-family="system-ui,Segoe UI,Roboto,Arial,sans-serif" font-size="34" font-weight="700" fill="#fff">${ch}</text></svg>\n`;
}

/** Ganti identitas XNK di <head> halaman statis: judul, ikon, nama di Home Screen. */
function brandHead(html, brand, iconPath) {
  const swaps = [
    ['<title>XNK Personal Training</title>', `<title>${esc(brand)}</title>`],
    ['<link rel="icon" href="https://xnk.my.id/favicon.ico">', `<link rel="icon" href="${iconPath}" type="image/svg+xml">`],
    ['<meta name="apple-mobile-web-app-title" content="XNK">', `<meta name="apple-mobile-web-app-title" content="${esc(brand.slice(0, 20))}">`],
  ];
  for (const [a, b] of swaps) {
    if (!html.includes(a)) throw new Error('build-tenant: tidak ditemukan di halaman: ' + a);
    html = html.split(a).join(b);
  }
  // Ikon PNG dan manifest milik xnk.my.id tidak dipakai di situs coach.
  html = html.replace(/\s*<link rel="icon" type="image\/png" sizes="192x192" href="https:\/\/xnk\.my\.id\/icon-192\.png">/g, '')
    .replace(/\s*<link rel="apple-touch-icon" href="https:\/\/xnk\.my\.id\/apple-touch-icon\.png">/g, '')
    .replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest">/g, '');
  return html;
}

function copyDir(from, to, files, prefix) {
  for (const f of fs.readdirSync(from)) {
    const p = path.join(from, f);
    const rel = prefix ? prefix + '/' + f : f;
    if (fs.statSync(p).isDirectory()) copyDir(p, to, files, rel);
    else files[rel] = fs.readFileSync(p);
  }
}

/** Kembalikan { files: {path: isi}, hash } untuk satu coach. */
function build(cfg, opts) {
  opts = opts || {};
  const c = readConfig(cfg);
  const l = lib.build();
  const libDir = path.join(HERE, 'dist', 'tenant-src-' + l.hash);
  if (!fs.existsSync(libDir)) {
    const tmp = libDir + '.tmp-' + process.pid;
    lib.write(tmp, l.files);
    try { fs.renameSync(tmp, libDir); } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); if (!fs.existsSync(libDir)) throw e; }
  }
  const S = loadStaticBuilder(libDir);
  const files = {};
  const sites = [['', 'app', 'icon.svg'], ['klien/', 'client', '../icon.svg']];
  for (const [dir, site, icon] of sites) {
    const out = S.build({ site, exec: c.exec });
    out['index.html'] = brandHead(out['index.html'], c.brand, icon);
    const conf = JSON.parse(out['config.js'].replace(/^window\.XNK_CONFIG = /, '').replace(/;\s*$/, ''));
    conf.brand = c.brand;
    out['config.js'] = `window.XNK_CONFIG = ${JSON.stringify(conf)};\n`;
    for (const [n, t] of Object.entries(out)) files[dir + n] = t;
  }
  files['icon.svg'] = iconSvg(c.brand);
  files['lib-latest.json'] = JSON.stringify({ library: { hash: l.hash } }) + '\n';
  files['.nojekyll'] = '';
  if (opts.custom && fs.existsSync(opts.custom)) copyDir(opts.custom, null, files, '');
  for (const [n, t] of Object.entries(files)) {
    if (typeof t === 'string' && t.includes(PROD_DEPLOYMENT)) throw new Error('build-tenant: ' + n + ' masih memuat alamat aplikasi xnk.my.id.');
  }
  return { files, hash: l.hash, config: c };
}

function write(outDir, files) {
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [n, t] of Object.entries(files)) {
    const p = path.join(outDir, n);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, t);
  }
}

module.exports = { build, write, readConfig, brandHead, iconSvg };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const cfgFile = flag('--config');
  const custom = flag('--custom');
  const out = args[0];
  if (!out || !cfgFile) { console.error('pakai: build-tenant.js <outDir> --config <config.json> [--custom <folder>]'); process.exit(1); }
  try {
    const r = build(JSON.parse(fs.readFileSync(cfgFile, 'utf8')), { custom: custom && path.resolve(custom) });
    write(path.resolve(out), r.files);
    console.log(`Situs ${r.config.brand}: ${Object.keys(r.files).length} berkas, Library ${r.hash} → ${out}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
