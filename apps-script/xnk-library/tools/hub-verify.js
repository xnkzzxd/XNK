'use strict';
// T-2221: pemeriksaan hasil build hub SEBELUM tayang (dijalankan workflow hub setelah build-hub.js).
//   node apps-script/xnk-library/tools/hub-verify.js <siteDir> --config hub.json
// Memeriksa berkas yang benar-benar akan diunggah, untuk setiap coach di hub.json: panel dan portal ada, config.js
// memanggil /exec coach itu saja, awalan penyimpanan per slug terpasang sebelum skrip lain, awalan cache service
// worker unik, lib-latest.json terbaca, pustaka dari /_lib/ (T-2222), tidak ada alamat aplikasi xnk.my.id atau /exec
// coach lain. Satu masalah =
// keluar dengan kode 1, dan workflow berhenti sebelum mengunggah (situs lama tetap tayang).
const fs = require('fs');
const path = require('path');
const { readHub } = require('./build-hub');

const PROD_DEPLOYMENT = 'AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ';

function walk(dir, base, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const rel = base ? base + '/' + f : f;
    if (fs.statSync(p).isDirectory()) walk(p, rel, out); else out.push(rel);
  }
  return out;
}

/** Daftar masalah (Indonesia); kosong = boleh tayang. */
function verifySite(dir, cfg, opts) {
  const hub = readHub(cfg, opts);
  const problems = [];
  const has = rel => fs.existsSync(path.join(dir, rel));
  const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
  for (const f of ['index.html', '404.html', '_hub/versions.json']) if (!has(f)) problems.push(`${f} tidak ada.`);
  if (!problems.length) {
    const landing = read('index.html');
    for (const c of hub.coaches) {
      if (c.inactive && landing.includes(`href="/${c.slug}/info/"`)) problems.push(`Halaman depan masih menautkan coach tidak aktif /${c.slug}/info/.`);
      if (!c.inactive && !c.infoUrl && !landing.includes(`href="/${c.slug}/info/"`)) problems.push(`Halaman depan tidak menautkan /${c.slug}/info/.`);
    }
    try { JSON.parse(read('_hub/versions.json')); } catch (e) { problems.push('_hub/versions.json bukan JSON.'); }
    for (const f of ['index.html', '404.html']) if (!read(f).includes('http-equiv="Content-Security-Policy"')) problems.push(`${f}: Content-Security-Policy tidak terpasang.`);
  }
  const files = walk(dir, '', []);
  for (const rel of files.filter(f => /\.(html|js|json)$/.test(f))) {
    const t = read(rel);
    if (t.includes(PROD_DEPLOYMENT) && !hub.coaches.some(c => c.url && rel === `${c.slug}/info/index.html`)) problems.push(`${rel} memuat alamat aplikasi xnk.my.id.`);
    if (/https:\/\/xnk\.my\.id\/(exercises|foods|figure)\//.test(t)) problems.push(`${rel} masih memuat pustaka dari xnk.my.id (harus /_lib/).`);
  }
  if (hub.coaches.length) {
    for (const f of ['_lib/exercises/exercises.min.json', '_lib/foods/foods.min.json', '_lib/figure/figure.min.json', '_lib/figure/rig.min.json']) {
      if (!has(f)) { problems.push(`${f} tidak ada.`); continue; }
      try { JSON.parse(read(f)); } catch (e) { problems.push(`${f} bukan JSON.`); }
    }
  }
  for (const c of hub.coaches) {
    if (c.url) { if (!has(`${c.slug}/info/index.html`)) problems.push(`${c.slug}: /${c.slug}/info/ tidak ada.`); continue; }
    // T-2252: coach tidak aktif = halaman pemberitahuan (CSP ketat, noindex) dan worker pembersih; tidak ada aplikasi.
    if (c.inactive) {
      const st = c.storageSlug || c.slug;
      for (const sub of ['', 'klien/', 'info/']) {
        const f = `${c.slug}/${sub}index.html`;
        if (!has(f)) { problems.push(`${c.slug} (tidak aktif): /${c.slug}/${sub} tidak ada.`); continue; }
        const t = read(f);
        if (!t.includes('Situs coach ini tidak aktif lagi')) problems.push(`${f}: bukan halaman "tidak aktif".`);
        if (!t.includes('http-equiv="Content-Security-Policy"') || /script-src[^;]*unsafe-inline/.test(t) || !t.includes('name="robots" content="noindex"')) problems.push(`${f}: tanpa CSP ketat atau noindex.`);
        if (t.includes(c.exec)) problems.push(`${f}: masih memuat /exec coach.`);
      }
      for (const [sub, kind] of [['', 'panel'], ['klien/', 'klien']]) {
        const f = `${c.slug}/${sub}sw-app.js`;
        if (!has(f) || !read(f).includes(`var PREFIX = ${JSON.stringify('xnk-page-' + st + '~' + kind + '~')};`) || !read(f).includes('registration.unregister()')) problems.push(`${c.slug} (tidak aktif): worker pembersih /${f} tidak ada atau salah awalan.`);
        if (has(`${c.slug}/${sub}config.js`)) problems.push(`${c.slug} (tidak aktif): aplikasi masih ikut (${c.slug}/${sub}config.js).`);
      }
      continue;
    }
    for (const [sub, kind] of [['', 'panel'], ['klien/', 'klien']]) {
      const d = c.slug + '/' + sub;
      const need = [d + 'index.html', d + 'config.js', d + 'sw-app.js'];
      const miss = need.filter(f => !has(f));
      if (miss.length) { problems.push(`${c.slug} (${kind}): tidak ada ${miss.join(', ')}.`); continue; }
      const conf = read(d + 'config.js');
      if (!conf.includes(JSON.stringify(c.exec).slice(1, -1))) problems.push(`${c.slug} (${kind}): config.js tidak memanggil /exec coach ini.`);
      const html = read(d + 'index.html');
      if (!html.includes('http-equiv="Content-Security-Policy"')) problems.push(`${c.slug} (${kind}): Content-Security-Policy tidak terpasang.`);
      if (/googletagmanager\.com|G-93SRTYH3SG/.test(html)) problems.push(`${c.slug} (${kind}): masih memuat Google Analytics milik xnk.my.id.`);
      // T-2243: awalan = storageSlug (slug pertama coach; tetap walau slug diganti).
      const st = c.storageSlug || c.slug;
      const shim = html.indexOf(`'${st}:'`);
      const firstScript = html.indexOf('<script');
      if (shim < 0) problems.push(`${c.slug} (${kind}): awalan penyimpanan "${st}:" tidak terpasang.`);
      else if (html.lastIndexOf('<script', shim) !== firstScript) problems.push(`${c.slug} (${kind}): awalan penyimpanan bukan skrip pertama.`);
      if (!read(d + 'sw-app.js').includes(`var PREFIX = "xnk-page-${st}~${kind}~";`)) problems.push(`${c.slug} (${kind}): awalan cache service worker salah.`);
    }
    // T-2241/T-2242: halaman info dengan CSP ketat; logo coach ada bila diisi di hub.json.
    const info = c.slug + '/info/index.html';
    if (!has(info)) problems.push(`${c.slug}: halaman info (/${c.slug}/info/) tidak ada.`);
    else {
      const t = read(info);
      if (!t.includes('http-equiv="Content-Security-Policy"') || /script-src[^;]*unsafe-inline/.test(t)) problems.push(`${c.slug}: halaman info tanpa CSP ketat.`);
      if (!t.includes(JSON.stringify(c.exec).slice(1, -1))) problems.push(`${c.slug}: halaman info tidak memanggil /exec coach ini.`);
    }
    if (c.logoFile && !has(`${c.slug}/logo.${c.logoFile.ext}`)) problems.push(`${c.slug}: logo.${c.logoFile.ext} tidak ada.`);
    try {
      const l = JSON.parse(read(c.slug + '/lib-latest.json'));
      if (!/^[0-9a-f]{12}$/.test(l && l.library && l.library.hash || '')) problems.push(`${c.slug}: lib-latest.json tanpa sidik Library.`);
    } catch (e) { problems.push(`${c.slug}: lib-latest.json tidak ada atau rusak.`); }
    // T-2243: alamat lama mengalihkan ke slug sekarang (halaman + worker pengganti).
    for (const a of c.aliases || []) {
      for (const sub of ['', 'klien/', 'info/']) {
        const f = `${a}/${sub}index.html`;
        if (!has(f)) { problems.push(`${a}: halaman pengalih /${a}/${sub} tidak ada.`); continue; }
        const t = read(f);
        if (!t.includes(`location.replace(${JSON.stringify('/' + c.slug + '/' + sub)} + location.search + location.hash)`)) problems.push(`${f} tidak mengalihkan ke /${c.slug}/${sub}.`);
        if (!t.includes('http-equiv="Content-Security-Policy"') || !t.includes('name="robots" content="noindex"')) problems.push(`${f}: tanpa CSP ketat atau noindex.`);
      }
      for (const sub of ['', 'klien/']) if (!has(`${a}/${sub}sw-app.js`) || !read(`${a}/${sub}sw-app.js`).includes(`var TO = ${JSON.stringify('/' + c.slug + '/' + sub)};`)) problems.push(`${a}: worker pengganti /${a}/${sub}sw-app.js tidak ada atau salah tujuan.`);
    }
    // /exec coach lain tidak boleh ada di berkas coach ini (situs satu domain: salah sambung = data coach lain).
    const others = hub.coaches.filter(o => o.slug !== c.slug).map(o => o.exec);
    for (const rel of files.filter(f => f.startsWith(c.slug + '/') && /\.(html|js|json)$/.test(f))) {
      const t = read(rel);
      if (others.some(e => t.includes(e))) problems.push(`${rel} memuat /exec coach lain.`);
    }
  }
  return problems;
}

module.exports = { verifySite };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--config');
  const cfgFile = i >= 0 ? args.splice(i, 2)[1] : null;
  const dir = args[0];
  if (!dir || !cfgFile) { console.error('pakai: hub-verify.js <siteDir> --config hub.json'); process.exit(1); }
  const problems = verifySite(path.resolve(dir), JSON.parse(fs.readFileSync(cfgFile, 'utf8')), { baseDir: path.dirname(path.resolve(cfgFile)) });
  if (problems.length) {
    for (const p of problems) console.log('::error::' + p);
    console.log(`Hasil build hub tidak lolos pemeriksaan (${problems.length} masalah); situs lama tetap tayang.`);
    process.exit(1);
  }
  console.log('Hasil build hub lolos pemeriksaan.');
}
