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

// [file, url, view]; view = id untuk navigate(), kosong = layar pertama.
const SHOTS = [
  ['klien-hari-ini', '/demo/?klien', ''],
  ['klien-latihan', '/demo/?klien', 'public-program'],
  ['klien-makan', '/demo/?klien', 'public-food'],
  ['klien-progres', '/demo/?klien', 'public-progress'],
  ['coach-dashboard', '/demo/', ''],
  ['coach-jadwal', '/demo/', 'calendar'],
];

(async () => {
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://x').pathname !== '/demo/') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(DEMO);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, url, view] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
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
    await page.waitForTimeout(600);
    // JPEG kualitas 82: ±4x lebih kecil dari PNG, tanpa paket tambahan.
    fs.writeFileSync(path.join(OUT, name + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 82 }));
    console.log('  ' + name);
    await ctx.close();
  }
  // Ikon aplikasi (PWA, desktop): X putih di kotak hitam; area aman 80 % supaya cocok untuk "maskable".
  for (const px of [192, 512]) {
    const c = await browser.newContext({ viewport: { width: px, height: px } });
    const pg = await c.newPage();
    await pg.setContent(`<body style="margin:0;width:${px}px;height:${px}px;background:#0b0b0b;display:grid;place-items:center;font-family:system-ui,'Segoe UI',Arial,sans-serif">
      <b style="color:#fff;font-size:${Math.round(px * 0.52)}px;line-height:1;font-weight:800">X</b></body>`);
    fs.writeFileSync(path.join(OUT, `icon-${px}.png`), await pg.screenshot({ type: 'png' }));
    await c.close();
  }
  console.log('  ikon');
  // og.jpg 1200×630 untuk pratinjau link (WhatsApp, Facebook): dua layar di atas latar hitam.
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const page = await ctx.newPage();
  const img = n => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(OUT, n + '.jpg')).toString('base64');
  await page.setContent(`<body style="margin:0;width:1200px;height:630px;background:#0b0b0b;color:#f5f5f3;font-family:system-ui,'Segoe UI',sans-serif;display:flex;align-items:center;overflow:hidden">
    <div style="padding:0 0 0 80px;width:620px"><div style="width:72px;height:72px;border-radius:20px;background:#f5f5f3;color:#0b0b0b;display:grid;place-items:center;font-weight:800;font-size:40px">X</div>
    <h1 style="font-size:64px;line-height:1.02;letter-spacing:-2px;margin:36px 0 20px">Latihan, makan, dan jadwal PT di satu aplikasi.</h1>
    <p style="font-size:26px;color:#a3a39e;margin:0">xnk.web.id</p></div>
    <div style="display:flex;gap:24px;align-items:flex-start;margin-top:120px">${['klien-hari-ini', 'klien-latihan'].map((n, i) =>
      `<img src="${img(n)}" style="width:240px;border-radius:30px;border:8px solid #1f1f1e;${i ? 'margin-top:-60px' : ''}">`).join('')}</div></body>`);
  fs.writeFileSync(path.join(OUT, 'og.jpg'), await page.screenshot({ type: 'jpeg', quality: 85 }));
  console.log('  og');
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
