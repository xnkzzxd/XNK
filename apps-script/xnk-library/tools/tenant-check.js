'use strict';
// Cek browser (Playwright) untuk situs coach hasil build-tenant.js, dengan server Apps Script palsu yang menjalankan
// KODE LIBRARY lewat XNK.handlePost dan konteks spreadsheet coach itu sendiri:
//   NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/tenant-check.js
// Situs disajikan di http://localhost:<port>/gym-andi/ (seperti GitHub Pages proyek). Dicek:
//   panel: PIN salah ditolak, PIN coach ini masuk, judul = nama usaha, tidak ada panggilan ke xnk.my.id;
//   portal /klien/: klien coach ini masuk dengan nomor WA, klien coach lain tidak dikenal;
//   offline: service worker aktif, halaman terbuka lagi tanpa sinyal, layar "Catat offline" muncul.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const tenant = require('./build-tenant');
const { makeCtx, createLibEnv } = require('../tests/lib-harness');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXEC_A = 'https://script.google.com/macros/s/AKfycbGYMANDItestDeployment000000001/exec';
const EXEC_B = 'https://script.google.com/macros/s/AKfycbSTUDIOBUNGAtestDeployment0002/exec';
const BASE = '/gym-andi/';
const PRICE = [['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
  ['P1', 'Regular 8', 'regular', 800000, 8, '1 Bulan', 'desc', 'a,b', true]];

let fails = 0;
function check(ok, label) { console.log((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) fails++; }

function backend() {
  const env = createLibEnv();
  const A = makeCtx('SS_ANDI', { execUrl: EXEC_A }), B = makeCtx('SS_BUNGA', { execUrl: EXEC_B });
  for (const [X, brand, pin, phone, name] of [[A, 'Gym Andi', '111111', '081111111111', 'Ani'], [B, 'Studio Bunga', '222222', '082222222222', 'Bima']]) {
    env.lib('initInstance', X.ctx);
    env.lib('saveSetup', X.ctx, { brand, pin });
    X.ss.getSheetByName('PriceList').rows = PRICE.map(r => r.slice());
    const r = env.run(X.ctx, 'registerNewClient', { name, phone, goal: 'x', packageId: 'P1' });
    if (r.status !== 'success') throw new Error('seed gagal: ' + JSON.stringify(r));
  }
  return { env, A, B };
}

function serve(files) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(BASE)) { res.writeHead(404); return res.end(); }
    p = p.slice(BASE.length);
    if (p === '' || p.endsWith('/')) p += 'index.html';
    const body = files[p];
    if (body == null) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function open(browser, url, be, seen) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const libJson = { 'exercises.min.json': { v: 2, base: '', credit: 't', items: [] }, 'foods.min.json': { v: 1, items: [] } };
  await context.route(/^https:\/\/script\.google(usercontent)?\.com\//, route => {
    const u = route.request().url();
    if (route.request().method() !== 'POST') return route.fulfill({ status: 404, body: '' });
    seen.push(u);
    const ctx = u.startsWith(EXEC_A) ? be.A.ctx : u.startsWith(EXEC_B) ? be.B.ctx : null;
    if (!ctx || context.__down) return route.abort('failed');
    const out = be.env.lib('handlePost', ctx, { postData: { contents: route.request().postData() || '' } });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: out.content });
  });
  await context.route(/^https:\/\/xnk\.my\.id\//, route => {
    const name = route.request().url().split('/').pop();
    const fig = path.join(ROOT, 'figure', name);
    const body = libJson[name] ? JSON.stringify(libJson[name]) : fs.existsSync(fig) ? fs.readFileSync(fig, 'utf8') : '{}';
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body });
  });
  await context.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)\//, r => r.fulfill({ status: 200, body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { context, page, errors };
}

(async () => {
  const be = backend();
  const site = tenant.build({ exec: EXEC_A, brand: 'Gym Andi' });
  const server = await serve(site.files);
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    console.log('Situs coach · panel');
    {
      const seen = [];
      const { context, page, errors } = await open(browser, origin + BASE, be, seen);
      check((await page.title()) === 'Gym Andi', 'judul halaman = nama usaha');
      check(await page.isVisible('#admin-login'), 'layar PIN tampil');
      check(await page.isVisible('#admin-login .xnk-by'), 'tanda "Didukung XNK" di layar PIN (T-2257)');
      await page.fill('#admin-pin', '222222');
      await page.click('#admin-login-btn');
      await page.waitForTimeout(800);
      check(((await page.textContent('#admin-login-error')) || '').includes('PIN salah'), 'PIN coach lain ditolak');
      await page.fill('#admin-pin', '111111');
      await page.click('#admin-login-btn');
      await page.waitForTimeout(1500);
      check(!(await page.isVisible('#admin-login')), 'PIN coach ini masuk');
      const names = await page.evaluate(() => (window.members || []).map(m => m.name));
      check(names.length === 1 && names[0] === 'Ani', 'hanya klien coach ini yang tampil: ' + names.join(','));
      check(seen.length > 0 && seen.every(u => u.startsWith(EXEC_A)), 'semua panggilan ke /exec milik coach ini');
      check(errors.length === 0, 'tanpa error JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await context.close();
    }

    console.log('Situs coach · portal klien (/klien/)');
    {
      const seen = [];
      const { context, page, errors } = await open(browser, origin + BASE + 'klien/', be, seen);
      check(await page.isVisible('#login-phone'), 'portal meminta nomor WhatsApp');
      check(await page.isVisible('#view-public-login .xnk-by'), 'tanda "Didukung XNK" di layar masuk portal (T-2257)');
      await page.fill('#login-phone', '82222222222');
      await page.click('#login-submit-btn');
      await page.waitForTimeout(900);
      check(((await page.textContent('#member-link-message')) || '').includes('tidak ditemukan'), 'klien coach lain tidak dikenal');
      await page.evaluate(() => window.closeModal && window.closeModal());
      await page.waitForTimeout(400);
      await page.fill('#login-phone', '81111111111');
      await page.click('#login-submit-btn');
      await page.waitForTimeout(1800);
      const who = await page.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.name);
      check(who === 'Ani', 'klien coach ini masuk ke portal');
      check(errors.length === 0, 'tanpa error JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

      console.log('Situs coach · tanpa sinyal');
      await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      check(await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)), 'service worker aktif di /klien/');
      await page.waitForTimeout(1000);
      context.__down = true;
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2500);
      const body = await page.evaluate(() => document.body ? document.body.innerText.length : 0);
      check(body > 50, 'halaman tetap terbuka tanpa sinyal');
      // Sama dengan xnk.my.id: aplikasi dari salinan (service worker) menyapa → aplikasi tampil dengan data di HP;
      // layar "Catat offline" hanya bila aplikasi tidak menyapa atau ada catatan yang menunggu.
      const who2 = await page.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.name);
      check(who2 === 'Ani', 'tanpa sinyal: portal terbuka dari salinan di HP, klien tetap masuk');
      const offScreen = await page.evaluate(() => !!(window.XNKOffline && typeof window.XNKOffline.show === 'function'));
      check(offScreen, 'layar "Catat offline" ikut termuat (cadangan bila aplikasi tidak terbuka)');
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fails ? `\n${fails} cek gagal.` : '\nSemua cek situs coach lolos.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
