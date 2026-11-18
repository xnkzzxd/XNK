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
function verifySite(dir, cfg) {
  const hub = readHub(cfg);
  const problems = [];
  const has = rel => fs.existsSync(path.join(dir, rel));
  const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
  for (const f of ['index.html', '404.html', '_hub/versions.json']) if (!has(f)) problems.push(`${f} tidak ada.`);
  if (!problems.length) {
    const landing = read('index.html');
    for (const c of hub.coaches) if (!landing.includes(`href="/${c.slug}/klien/"`)) problems.push(`Halaman depan tidak menautkan /${c.slug}/klien/.`);
    try { JSON.parse(read('_hub/versions.json')); } catch (e) { problems.push('_hub/versions.json bukan JSON.'); }
  }
  const files = walk(dir, '', []);
  for (const rel of files.filter(f => /\.(html|js|json)$/.test(f))) {
    const t = read(rel);
    if (t.includes(PROD_DEPLOYMENT)) problems.push(`${rel} memuat alamat aplikasi xnk.my.id.`);
    if (/https:\/\/xnk\.my\.id\/(exercises|foods|figure)\//.test(t)) problems.push(`${rel} masih memuat pustaka dari xnk.my.id (harus /_lib/).`);
  }
  if (hub.coaches.length) {
    for (const f of ['_lib/exercises/exercises.min.json', '_lib/foods/foods.min.json', '_lib/figure/figure.min.json', '_lib/figure/rig.min.json']) {
      if (!has(f)) { problems.push(`${f} tidak ada.`); continue; }
      try { JSON.parse(read(f)); } catch (e) { problems.push(`${f} bukan JSON.`); }
    }
  }
  for (const c of hub.coaches) {
    for (const [sub, kind] of [['', 'panel'], ['klien/', 'klien']]) {
      const d = c.slug + '/' + sub;
      const need = [d + 'index.html', d + 'config.js', d + 'sw-app.js'];
      const miss = need.filter(f => !has(f));
      if (miss.length) { problems.push(`${c.slug} (${kind}): tidak ada ${miss.join(', ')}.`); continue; }
      const conf = read(d + 'config.js');
      if (!conf.includes(JSON.stringify(c.exec).slice(1, -1))) problems.push(`${c.slug} (${kind}): config.js tidak memanggil /exec coach ini.`);
      const html = read(d + 'index.html');
      const shim = html.indexOf(`'${c.slug}:'`);
      const firstScript = html.indexOf('<script');
      if (shim < 0) problems.push(`${c.slug} (${kind}): awalan penyimpanan "${c.slug}:" tidak terpasang.`);
      else if (html.lastIndexOf('<script', shim) !== firstScript) problems.push(`${c.slug} (${kind}): awalan penyimpanan bukan skrip pertama.`);
      if (!read(d + 'sw-app.js').includes(`var PREFIX = "xnk-page-${c.slug}~${kind}~";`)) problems.push(`${c.slug} (${kind}): awalan cache service worker salah.`);
    }
    try {
      const l = JSON.parse(read(c.slug + '/lib-latest.json'));
      if (!/^[0-9a-f]{12}$/.test(l && l.library && l.library.hash || '')) problems.push(`${c.slug}: lib-latest.json tanpa sidik Library.`);
    } catch (e) { problems.push(`${c.slug}: lib-latest.json tidak ada atau rusak.`); }
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
  const problems = verifySite(path.resolve(dir), JSON.parse(fs.readFileSync(cfgFile, 'utf8')));
  if (problems.length) {
    for (const p of problems) console.log('::error::' + p);
    console.log(`Hasil build hub tidak lolos pemeriksaan (${problems.length} masalah); situs lama tetap tayang.`);
    process.exit(1);
  }
  console.log('Hasil build hub lolos pemeriksaan.');
}
