'use strict';
// Tangkapan layar untuk landing xnk.web.id (hub-site/img/), diambil dari demo (data contoh, bukan klien asli).
// Jalankan ulang hanya bila tampilan app berubah banyak:
//   node apps-script/pt-scheduler/tools/build-demo.js
//   NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/hub-shots.js
// Butuh playwright (atau playwright-core + Chrome terpasang: CHROME=/path/ke/chrome).
const http = require('http');
const fs = require('fs');
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(__dirname, '..', 'hub-site', 'img');
const DEMO = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'));

// [file, url, view, lebar, tinggi, aksi]; view = id untuk navigate(), kosong = layar pertama; tanpa lebar = HP 390 × 844;
// aksi (T-2265) = nama di ACTS, dijalankan setelah halaman siap.
const SHOTS = [
  ['klien-hari-ini', '/demo/?klien', ''],
  ['klien-latihan', '/demo/?klien', 'public-program'],
  ['klien-makan', '/demo/?klien', 'public-food'],
  ['klien-progres', '/demo/?klien', 'public-progress'],
  ['coach-dashboard', '/demo/', ''],
  ['coach-jadwal', '/demo/', 'calendar'],
  // T-2265: halaman klien di panel coach dan laporan PDF progres (Fase AD).
  ['coach-klien', '/demo/', '', 0, 0, 'klien'],
  ['coach-laporan', '/demo/', '', 0, 0, 'laporan'],
  // Tampilan desktop (portal klien ala Mac app) untuk gambar laptop di bagian Aplikasi.
  ['klien-desktop', '/demo/?klien', '', 1280, 800],
];

// Klien contoh yang datanya paling lengkap di demo (sama dengan pt-scheduler/tools/report-check.js).
const SAMPLE = () => (window.members.find(m => /Sari/.test(m.name)) || window.members[0]).id;
const ACTS = {
  klien: async page => { await page.evaluate(`window.openProfile((${SAMPLE})())`); await page.waitForTimeout(2500); },
  laporan: async page => {
    await page.evaluate(`window.reportOpen('admin', (${SAMPLE})())`);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.rpBuild());
    await page.waitForFunction(() => !!(window.rpBlob && window.rpBlob()) && document.querySelectorAll('#rp-preview img').length > 0, null, { timeout: 30000 });
    await page.evaluate(() => Promise.all([...document.querySelectorAll('#rp-preview img')].map(i => i.decode ? i.decode().catch(() => {}) : 0)));
    // Halaman laporan yang tampil, bukan pilihan di atasnya.
    await page.evaluate(() => document.querySelector('#rp-preview').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(800);
  },
};

(async () => {
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://x').pathname !== '/demo/') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(DEMO);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, url, view, w, h, act] of SHOTS) {
    const desk = !!w;
    const ctx = await browser.newContext(desk ? { viewport: { width: w, height: h }, deviceScaleFactor: 1.5, colorScheme: 'light' }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(base + url);
    await page.waitForTimeout(4000);
    // Perayaan badge, petunjuk sekali pakai dan pil DEMO tidak ikut difoto.
    const tidy = () => page.evaluate(() => {
      if (window.closeModal) try { window.closeModal(); } catch (e) {}
      document.querySelectorAll('div[style*="z-index:99999"], #a2hs, .toast').forEach(e => e.remove());
    });
    await tidy(); await page.waitForTimeout(600);
    if (view) { await page.evaluate(v => window.navigate(v), view); await page.waitForTimeout(2500); await tidy(); }
    if (act) await ACTS[act](page);
    await page.waitForTimeout(600);
    // JPEG kualitas 82: ±4x lebih kecil dari PNG, tanpa paket tambahan.
    fs.writeFileSync(path.join(OUT, name + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 82 }));
    console.log('  ' + name);
    await ctx.close();
  }
  // Ikon aplikasi (PWA, favicon, header, desktop) dibuat dari logo.png di akar repo, di atas latar hitam:
  //   magick logo.png -background "#0b0b0b" -flatten -resize 512x512 hub-site/img/icon-512.png   (juga 192, logo-64)
  //   magick logo.png -background "#0b0b0b" -flatten -define icon:auto-resize=256,128,64,48,32,16 hub-site/desktop.ico
  // og.jpg 1200×630 untuk pratinjau link (WhatsApp, Facebook): dua layar di atas latar hitam.
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const page = await ctx.newPage();
  const img = n => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(OUT, n + '.jpg')).toString('base64');
  await page.setContent(`<body style="margin:0;width:1200px;height:630px;background:#0b0b0b;color:#f5f5f3;font-family:system-ui,'Segoe UI',sans-serif;display:flex;align-items:center;overflow:hidden">
    <div style="padding:0 0 0 80px;width:620px"><img src="data:image/png;base64,${fs.readFileSync(path.join(OUT, 'icon-192.png')).toString('base64')}" style="width:88px;height:88px;border-radius:22px;box-shadow:inset 0 0 0 1px #2e2e2c">
    <h1 style="font-size:72px;line-height:1.02;letter-spacing:-2px;margin:36px 0 20px">Anda melatih.<br>Sisanya beres.</h1>
    <p style="font-size:26px;color:#a3a39e;margin:0">xnk.web.id</p></div>
    <div style="display:flex;gap:24px;align-items:flex-start;margin-top:120px">${['klien-hari-ini', 'klien-latihan'].map((n, i) =>
      `<img src="${img(n)}" style="width:240px;border-radius:30px;border:8px solid #1f1f1e;${i ? 'margin-top:-60px' : ''}">`).join('')}</div></body>`);
  fs.writeFileSync(path.join(OUT, 'og.jpg'), await page.screenshot({ type: 'jpeg', quality: 85 }));
  console.log('  og');
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
