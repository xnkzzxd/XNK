'use strict';
// Cek browser (Playwright) untuk situs hub xnk.web.id: dua coach di SATU domain, server Apps Script palsu yang menjalankan
// KODE LIBRARY dengan spreadsheet masing-masing:
//   NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/hub-check.js
// Dicek: landing (isian nama coach, kontak), 404, alamat tanpa garis miring, login panel bergantian di satu browser
// tanpa saling logout, kunci penyimpanan berawalan slug, portal klien hanya mengenal klien coach itu, cache service worker
// panel dan portal tidak saling menghapus, dan portal terbuka tanpa sinyal.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const hub = require('./build-hub');
const { makeCtx, createLibEnv } = require('../tests/lib-harness');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXEC_A = 'https://script.google.com/macros/s/AKfycbHUBclaudiaTestDeployment00000001/exec';
const EXEC_B = 'https://script.google.com/macros/s/AKfycbHUBclaudia2TestDeployment0000002/exec';
const PRICE = [['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
  ['P1', 'Regular 8', 'regular', 800000, 8, '1 Bulan', 'desc', 'a,b', true]];

let fails = 0;
function check(ok, label) { console.log((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) fails++; }

function backend() {
  const env = createLibEnv();
  const A = makeCtx('SS_CLAUDIA', { execUrl: EXEC_A }), B = makeCtx('SS_CLAUDIA2', { execUrl: EXEC_B });
  for (const [X, brand, pin, phone, name] of [[A, 'Claudia Fit', '111111', '081111111111', 'Ani'], [B, 'Claudia Dua', '222222', '082222222222', 'Bima']]) {
    env.lib('initInstance', X.ctx);
    env.lib('saveSetup', X.ctx, { brand, pin });
    X.ss.getSheetByName('PriceList').rows = PRICE.map(r => r.slice());
    const r = env.run(X.ctx, 'registerNewClient', { name, phone, goal: 'x', packageId: 'P1' });
    if (r.status !== 'success') throw new Error('seed gagal: ' + JSON.stringify(r));
  }
  return { env, A, B };
}

// Seperti GitHub Pages: /nama diarahkan ke /nama/, alamat yang tidak ada menjawab 404.html.
function serve(files) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
    if (p !== '' && !p.endsWith('/') && !path.extname(p) && files[p + '/index.html'] != null) { res.writeHead(301, { Location: '/' + p + '/' }); return res.end(); }
    if (p === '' || p.endsWith('/')) p += 'index.html';
    if (p.startsWith('_lib/')) LIB_HITS.push(p);
    const body = files[p];
    if (body == null) { res.writeHead(404, { 'Content-Type': types['.html'] }); return res.end(files['404.html']); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

const XNK_HITS = [], LIB_HITS = [];

async function newContext(browser, be, seen) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route(/^https:\/\/script\.google(usercontent)?\.com\//, route => {
    const u = route.request().url();
    if (route.request().method() !== 'POST') return route.fulfill({ status: 404, body: '' });
    seen.push(u);
    const ctx = u.startsWith(EXEC_A) ? be.A.ctx : u.startsWith(EXEC_B) ? be.B.ctx : null;
    if (!ctx || context.__down) return route.abort('failed');
    const out = be.env.lib('handlePost', ctx, { postData: { contents: route.request().postData() || '' } });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: out.content });
  });
  // T-2222: pustaka dari /_lib/ di hub sendiri; permintaan ke xnk.my.id dicatat dan dianggap gagal.
  await context.route(/^https:\/\/xnk\.my\.id\//, route => { XNK_HITS.push(route.request().url()); return route.abort('failed'); });
  await context.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)\//, r => r.fulfill({ status: 200, body: '' }));
  return context;
}

async function open(context, url, errors) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return page;
}

async function panelLogin(page, pin) {
  await page.fill('#admin-pin', pin);
  await page.click('#admin-login-btn');
  await page.waitForTimeout(1500);
}

(async () => {
  const be = backend();
  const cfg = { contactUrl: 'https://wa.me/6281234567890', coaches: [
    { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC_A },
    { slug: 'claudia-2', brand: 'Claudia Dua', exec: EXEC_B },
  ] };
  const site = hub.build(cfg);
  // Uji-diri: HUB_CHECK_NOSHIM=1 mencopot penyimpanan per slug; cek isolasi di bawah HARUS gagal (membuktikan tesnya tidak kosong).
  if (process.env.HUB_CHECK_NOSHIM) for (const n of Object.keys(site.files)) if (n.endsWith('index.html')) site.files[n] = site.files[n].replace(/<script>\(function \(\) \{\n  var P = [\s\S]*?<\/script>\n/, '');
  const server = await serve(site.files);
  const O = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    console.log('Hub · landing dan alamat');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      const page = await open(context, O + '/', errors);
      check((await page.title()) === 'XNK', 'judul landing = XNK');
      check(await page.isVisible('#slug'), 'ada isian nama coach');
      check((await page.textContent('body')).includes('Hubungi XNK'), 'tombol kontak tampil (kontak diisi)');
      check(await page.locator('a.coach[href="/claudia/klien/"]').count() === 1, 'daftar coach menautkan portal /claudia/klien/');
      check(await page.evaluate(() => [...document.querySelectorAll('.phones img')].filter(i => i.offsetParent).every(i => i.naturalWidth > 0)), 'gambar hero termuat');
      // Berbagai rasio layar: HP tegak/mendatar, tablet, laptop, ultrawide, monitor tegak.
      for (const [w, h] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1024, 768], [1366, 768], [1920, 1080], [2560, 1080], [1080, 1920], [3440, 1440]]) {
        await page.setViewportSize({ width: w, height: h });
        const r = await page.evaluate(() => { const hb = document.querySelector('.hero').getBoundingClientRect().bottom; return { sw: document.documentElement.scrollWidth, ph: document.querySelector('.phones').getBoundingClientRect().top + scrollY, pad: Math.min(hb - document.querySelector('.facts').getBoundingClientRect().bottom, hb - document.querySelector('.phones').getBoundingClientRect().bottom) }; });
        check(r.sw <= w, `landing ${w}×${h}: tanpa scroll ke samping`);
        if (w > h) check(r.ph < h, `landing ${w}×${h}: mockup HP terlihat di layar pertama`);
        if (w > h) check(r.pad >= 32, `landing ${w}×${h}: pita hitam hero turun di bawah teks dan HP (${Math.round(r.pad)} px)`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.fill('#slug', 'a b!');
      await page.click('button[data-to="klien"]');
      check(((await page.textContent('#err')) || '').includes('tidak valid'), 'nama tidak valid → pesan, tidak pindah halaman');
      await page.fill('#slug', 'Claudia ');
      await page.click('button[data-to="klien"]');
      await page.waitForURL('**/claudia/klien/', { timeout: 8000 }).catch(() => {});
      check(page.url() === O + '/claudia/klien/', '"Claudia " (huruf besar, spasi) → /claudia/klien/');
      await page.goto(O + '/claudia', { waitUntil: 'domcontentloaded' });
      check(page.url() === O + '/claudia/', '/claudia diarahkan ke /claudia/ (garis miring)');
      const r = await page.goto(O + '/tidak-ada/', { waitUntil: 'domcontentloaded' });
      check(r.status() === 404 && (await page.textContent('h1')).includes('tidak ditemukan'), 'coach yang tidak ada → halaman 404 yang ramah');
      check(errors.length === 0, 'tanpa error JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await context.close();
    }

    console.log('Hub · dua coach di satu browser');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      const a = await open(context, O + '/claudia/', errors);
      check((await a.title()) === 'Claudia Fit', '/claudia/ berjudul nama usahanya');
      await panelLogin(a, '222222');
      check(((await a.textContent('#admin-login-error')) || '').includes('PIN salah'), 'PIN coach lain ditolak di /claudia/');
      const atitle = await a.title();
      check(atitle.includes('Claudia Fit') && !/XNK/.test(atitle) && !/XNK/.test(await a.evaluate(() => document.body.innerText)), 'layar PIN panel: judul dan teks memakai nama usaha, tanpa "XNK"');
      await panelLogin(a, '111111');
      check(!(await a.isVisible('#admin-login')), 'PIN claudia masuk di /claudia/');
      check(JSON.stringify(await a.evaluate(() => (window.members || []).map(m => m.name))) === '["Ani"]', 'panel claudia hanya menampilkan klien claudia');

      const b = await open(context, O + '/claudia-2/', errors);
      check(await b.isVisible('#admin-login'), '/claudia-2/ di browser yang sama TIDAK ikut login (token tidak bocor antar coach)');
      await panelLogin(b, '222222');
      check(!(await b.isVisible('#admin-login')), 'PIN claudia-2 masuk di /claudia-2/');
      check(JSON.stringify(await b.evaluate(() => (window.members || []).map(m => m.name))) === '["Bima"]', 'panel claudia-2 hanya menampilkan klien claudia-2');

      await a.reload({ waitUntil: 'domcontentloaded' });
      await a.waitForTimeout(1500);
      check(!(await a.isVisible('#admin-login')), 'claudia tetap login setelah claudia-2 login dan keluar masuk');
      await b.evaluate(() => { try { window.adminLogout && window.adminLogout(); } catch (e) {} });
      await b.waitForTimeout(800);
      await a.reload({ waitUntil: 'domcontentloaded' });
      await a.waitForTimeout(1500);
      check(!(await a.isVisible('#admin-login')), 'logout di claudia-2 tidak mengeluarkan claudia');

      const keys = await a.evaluate(() => Object.keys(localStorage));
      check(keys.length > 0 && keys.every(k => k.startsWith('claudia:') || k.startsWith('claudia-2:')), 'semua kunci localStorage berawalan slug: ' + keys.slice(0, 4).join(', ') + (keys.length > 4 ? '…' : ''));
      check(seen.every(u => u.startsWith(EXEC_A) || u.startsWith(EXEC_B)), 'semua panggilan server hanya ke dua /exec coach');
      check(XNK_HITS.length === 0, 'tidak ada permintaan ke xnk.my.id' + (XNK_HITS.length ? ': ' + XNK_HITS.slice(0, 2).join(', ') : ''));
      check(LIB_HITS.some(p => p.startsWith('_lib/exercises/')), 'pustaka gerakan dimuat dari /_lib/ hub sendiri');
      check(errors.length === 0, 'tanpa error JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await context.close();
    }

    console.log('Hub · portal klien, cache, dan tanpa sinyal');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      const p = await open(context, O + '/claudia/klien/', errors);
      check(await p.waitForSelector('#login-phone', { state: 'visible', timeout: 8000 }).then(() => true, () => false), 'portal /claudia/klien/ meminta nomor WhatsApp');
      await p.fill('#login-phone', '82222222222');
      await p.click('#login-submit-btn');
      await p.waitForTimeout(900);
      check(((await p.textContent('#member-link-message')) || '').includes('tidak ditemukan'), 'klien claudia-2 tidak dikenal di portal claudia');
      await p.evaluate(() => window.closeModal && window.closeModal());
      await p.waitForTimeout(400);
      await p.fill('#login-phone', '81111111111');
      await p.click('#login-submit-btn');
      await p.waitForTimeout(1800);
      check((await p.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.name)) === 'Ani', 'klien claudia masuk');
      const title = await p.title();
      check(title.includes('Claudia Fit') && !/XNK/.test(title), 'judul halaman memakai nama usaha, bukan "XNK": ' + title);
      const body = await p.evaluate(() => document.body.innerText);
      check(!/XNK/.test(body), 'tidak ada tulisan "XNK" di layar portal klien');

      await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      check(await p.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)), 'service worker portal aktif');
      // Buka panel coach yang sama dan tunggu worker-nya aktif: tidak boleh menghapus cache portal (dan sebaliknya).
      const panel = await open(context, O + '/claudia/', errors);
      await panel.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      await panel.waitForTimeout(1500);
      const names = await panel.evaluate(() => caches.keys());
      check(names.some(n => n.startsWith('xnk-page-claudia~panel~')) && names.some(n => n.startsWith('xnk-page-claudia~klien~')), 'cache panel dan portal ada berdampingan: ' + names.filter(n => n.startsWith('xnk-page')).join(', '));
      const other = await open(context, O + '/claudia-2/klien/', errors);
      await other.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      await other.waitForTimeout(1500);
      const names2 = await other.evaluate(() => caches.keys());
      check(names2.some(n => n.startsWith('xnk-page-claudia~klien~')) && names2.some(n => n.startsWith('xnk-page-claudia-2~klien~')), 'worker claudia-2 tidak menghapus cache claudia (awalan "claudia" vs "claudia-2")');

      context.__down = true;
      await context.setOffline(true);
      await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await p.waitForTimeout(2500);
      check((await p.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.name)) === 'Ani', 'tanpa sinyal: portal terbuka dari salinan, klien tetap masuk');
      check(errors.length === 0, 'tanpa error JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fails ? `\n${fails} cek gagal.` : '\nSemua cek hub lolos.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
