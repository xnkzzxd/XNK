'use strict';
// Cek browser (Playwright) untuk situs hub xnk.web.id: dua coach di SATU domain, server Apps Script palsu yang menjalankan
// KODE LIBRARY dengan spreadsheet masing-masing:
//   NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/hub-check.js
// Dicek: landing (isian nama coach, kontak), 404, alamat tanpa garis miring, login panel bergantian di satu browser
// tanpa saling logout, kunci penyimpanan berawalan slug, portal klien hanya mengenal klien coach itu, cache service worker
// panel dan portal tidak saling menghapus, dan portal terbuka tanpa sinyal. T-2241/T-2242: warna aksen dan logo per coach,
// halaman info /<slug>/info/ (HP dan desktop, CSP ketat, tetap dari jaringan walau service worker panel aktif).
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
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
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

const XNK_HITS = [], LIB_HITS = [], CSP_HITS = [];
// XNK Pusat palsu untuk /adminxnk (T-2234): jawaban berbentuk sama dengan apps-script/xnk-pusat/src/Pusat.gs.
const PUSAT = 'https://script.google.com/macros/s/AKfycbPUSATHUBCHECK00000000000/exec';
const PUSAT_CALLS = [];
function fakePusat(req) {
  PUSAT_CALLS.push(req.fn);
  if (req.fn === 'pusatLogin') return req.args[0] === 'pin-pusat-1' ? { ok: true, data: { token: 'T1', exp: Date.now() + 3600e3 } } : { ok: false, error: 'PIN salah.' };
  if (req.args[0] !== 'T1') return { ok: false, auth: true, error: 'Sesi berakhir. Masuk lagi.' };
  if (req.fn === 'pusatAction' && req.args[1] === 'setup') return { ok: true, data: { ticket: 'setup.1.sig' } };
  if (req.fn === 'pusatAction') { if (req.args[1] === 'backup') PUSAT_CALLS.backup = true; return { ok: true, data: { started: req.args[1], slug: req.args[2] } }; }
  const st = (ok, problems) => ({ at: new Date().toISOString(), ok, problems, data: { lib: { commit: 'c'.repeat(40) }, api: 1, triggers: { runReminderTick: 1 }, reminders: { enabled: true, lastTickAt: new Date().toISOString() }, clients: { total: 21, active30d: 13 }, sessions: { done7d: 17, next7d: 9 } } });
  return { ok: true, data: { hub: 'https://xnk.web.id', latest: { version: 11, commit: 'c'.repeat(40) }, canAct: true, setup: { ok: false, auth: false, daily: true, backup: true, editor: 'https://script.google.com/d/SCRIPTPUSAT/edit' }, coaches: [
    { slug: 'claudia', exec: EXEC_A, registeredAt: new Date().toISOString(), panel: 'https://xnk.web.id/claudia/', klien: 'https://xnk.web.id/claudia/klien/', status: st(true, []),
      backup: { at: '2026-11-15T03:00:00.000Z', okAt: '2026-11-15T03:00:00.000Z', fileUrl: 'https://docs.google.com/spreadsheets/d/BACKUPHUBCHECK/edit', rows: 321, error: '', fails: 0, queued: !!PUSAT_CALLS.backup, running: false } },
  ] } };
}

async function newContext(browser, be, seen) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route(/^https:\/\/script\.google(usercontent)?\.com\//, route => {
    const u = route.request().url();
    if (u.startsWith(PUSAT + '?setup=')) return route.fulfill({ status: 200, contentType: 'text/plain', body: 'XNK Pusat siap (palsu)' });
    if (u === PUSAT) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(fakePusat(JSON.parse(route.request().postData() || '{}'))) });
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
  // T-2223: setiap penolakan CSP dihitung sebagai error (kecuali permintaan ke xnk.my.id yang memang diblokir tes ini).
  page.on('console', m => { const t = m.text(); if (/Content Security Policy/i.test(t)) { CSP_HITS.push(t); errors.push('CSP: ' + t.slice(0, 160)); } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return page;
}

async function panelLogin(page, pin) {
  await page.fill('#admin-pin', pin);
  await page.click('#admin-login-btn');
  await page.waitForTimeout(1500);
}

/** Logo uji (PNG dan WebP asli, digambar di Chromium) di folder "repo hub" sementara. */
async function makeLogos(browser) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'xnk-hubcheck-'));
  fs.mkdirSync(path.join(dir, 'logo'));
  const page = await browser.newPage();
  for (const [file, type, color, txt] of [['claudia.png', 'image/png', '#1d4ed8', 'CF'], ['dua.webp', 'image/webp', '#15803d', 'CD']]) {
    const b64 = await page.evaluate(([type, color, txt]) => { const c = document.createElement('canvas'); c.width = c.height = 192; const x = c.getContext('2d');
      x.fillStyle = color; x.fillRect(0, 0, 192, 192); x.fillStyle = '#fff'; x.font = 'bold 90px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 96, 100);
      return c.toDataURL(type, 0.9).split(',')[1]; }, [type, color, txt]);
    fs.writeFileSync(path.join(dir, 'logo', file), Buffer.from(b64, 'base64'));
  }
  await page.close();
  return dir;
}

(async () => {
  const be = backend();
  const cfg = { contactUrl: 'https://wa.me/6281234567890', pusatUrl: PUSAT, coaches: [
    { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC_A, accent: 'biru', logo: 'logo/claudia.png' },
    { slug: 'claudia-2', brand: 'Claudia Dua', exec: EXEC_B, accent: 'hijau', logo: 'logo/dua.webp' },
  ] };
  const browser = await chromium.launch();
  const logoDir = await makeLogos(browser);
  const site = hub.build(cfg, { baseDir: logoDir });
  // Uji-diri: HUB_CHECK_NOSHIM=1 mencopot penyimpanan per slug; cek isolasi di bawah HARUS gagal (membuktikan tesnya tidak kosong).
  if (process.env.HUB_CHECK_NOSHIM) for (const n of Object.keys(site.files)) if (n.endsWith('index.html')) site.files[n] = site.files[n].replace(/<script>\(function \(\) \{\n  var P = [\s\S]*?<\/script>\n/, '');
  const server = await serve(site.files);
  const O = 'http://127.0.0.1:' + server.address().port;
  try {
    console.log('Hub · landing dan alamat');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      const page = await open(context, O + '/', errors);
      check((await page.title()) === 'XNK', 'judul landing = XNK');
      check(await page.isVisible('#slug'), 'ada isian nama coach');
      check((await page.textContent('body')).includes('Hubungi XNK'), 'tombol kontak tampil (kontak diisi)');
      check(await page.locator('a.coach[href="/claudia/info/"]').count() === 1 && await page.locator('a.coach[href="/claudia-2/info/"]').count() === 1, 'daftar coach menautkan halaman info /<slug>/info/');
      check(await page.evaluate(() => [...document.querySelectorAll('a.coach .av img')].map(i => i.naturalWidth > 0 && i.getAttribute('src')).join(',')) === '/claudia/logo.png,/claudia-2/logo.webp', 'kartu coach memuat logo PNG dan WebP');
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

    console.log('Hub · /adminxnk (XNK Pusat)');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      const page = await open(context, O + '/adminxnk/', errors);
      check(await page.isVisible('#pin') && !(await page.isVisible('#dash')), 'awal: hanya form PIN, tanpa data');
      await page.fill('#pin', 'salah');
      await page.click('#go');
      await page.waitForFunction(() => document.getElementById('lm').textContent.includes('PIN salah'), null, { timeout: 5000 }).catch(() => {});
      check(((await page.textContent('#lm')) || '').includes('PIN salah'), 'PIN salah → pesan');
      await page.fill('#pin', 'pin-pusat-1');
      await page.click('#go');
      await page.waitForSelector('#list article', { timeout: 5000 }).catch(() => {});
      const text = await page.textContent('#list');
      check(text.includes('Claudia Fit') && text.includes('Semua beres') && text.includes('13'), 'kartu coach: nama usaha dari hub.json, status, angka klien');
      check(text.includes('Claudia Dua') && text.includes('Belum terdaftar di XNK Pusat'), 'coach di hub.json yang belum mendaftar ditandai');
      check(((await page.textContent('#sum')) || '').includes('Library terbaru v11'), 'ringkasan: versi Library terbaru');
      page.once('dialog', d => d.accept());
      await page.click('[data-act="perbarui"][data-slug="claudia"]');
      await page.waitForFunction(() => document.getElementById('dm').textContent.includes('GitHub Actions'), null, { timeout: 5000 }).catch(() => {});
      check(PUSAT_CALLS.includes('pusatAction'), 'tombol Perbarui menjalankan aksi lewat XNK Pusat');
      check(((await page.textContent('#list')) || '').includes('Backup terakhir') && (await page.getAttribute('#list .bk a', 'href')) === 'https://docs.google.com/spreadsheets/d/BACKUPHUBCHECK/edit', 'kartu coach: tanggal backup terakhir + link Buka');
      page.once('dialog', d => d.accept());
      await page.click('[data-act="backup"][data-slug="claudia"]');
      await page.waitForFunction(() => document.getElementById('dm').textContent.includes('1 menit'), null, { timeout: 5000 }).catch(() => {});
      check(((await page.textContent('#dm')) || '').includes('1 menit') && ((await page.textContent('#list')) || '').includes('menunggu giliran'), 'Backup sekarang (tanpa onclick, lolos CSP): pesan + "menunggu giliran"');
      check(await page.isVisible('#setup') && ((await page.textContent('#setupWhy')) || '').includes('Izin Google'), 'pita "XNK Pusat perlu disiapkan" saat izin belum diberikan');
      check(await page.isVisible('#setupEditor') && (await page.getAttribute('#setupEditor', 'href')) === 'https://script.google.com/d/SCRIPTPUSAT/edit', 'izin belum ada: langkah editor + link editor XNK Pusat');
      const [tab] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.click('.bar [data-act="setup"]')]);
      if (tab) await tab.waitForURL(/[?]setup=/, { timeout: 5000 }).catch(() => {});
      check(!!tab && tab.url() === PUSAT + '?setup=setup.1.sig', 'Siapkan XNK Pusat: tab baru ke XNK Pusat dengan tanda siap (bukan token sesi)');
      if (tab) await tab.close();
      check(await page.evaluate(() => Object.keys(sessionStorage).every(k => k.startsWith('adminxnk:'))), 'token pemilik di sessionStorage berawalan adminxnk:');
      await page.click('#out');
      check(await page.isVisible('#pin') && (await page.textContent('#list')) === '', 'keluar: data dihapus dari layar');
      check(errors.length === 0, 'tanpa error JavaScript / CSP' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
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
      const look = pg => pg.evaluate(() => ({ acc: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        logo: getComputedStyle(document.querySelector('#admin-login .auth-logo .logo-mark')).backgroundImage, icon: document.querySelector('link[rel="icon"]').getAttribute('href') }));
      const la = await look(a);
      check(la.acc === '#1d4ed8' && /\/claudia\/logo\.png/.test(la.logo) && la.icon === '/claudia/logo.png', 'layar PIN claudia: aksen biru, logo coach, favicon logo (' + JSON.stringify(la) + ')');
      await panelLogin(a, '111111');
      check(!(await a.isVisible('#admin-login')), 'PIN claudia masuk di /claudia/');
      check(await a.evaluate(() => document.documentElement.getAttribute('data-accent')) === 'biru', 'panel claudia tetap biru setelah masuk dan pindah halaman');
      check(JSON.stringify(await a.evaluate(() => (window.members || []).map(m => m.name))) === '["Ani"]', 'panel claudia hanya menampilkan klien claudia');

      const b = await open(context, O + '/claudia-2/', errors);
      const lb = await look(b);
      check(lb.acc === '#15803d' && /\/claudia-2\/logo\.webp/.test(lb.logo), 'layar PIN claudia-2: aksen hijau, logo WebP sendiri (' + JSON.stringify(lb) + ')');
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

      // Sudah masuk: xnk.web.id langsung membuka panel coach; #masuk dan ?hub tetap menampilkan landing.
      await a.goto(O + '/', { waitUntil: 'domcontentloaded' });
      await a.waitForTimeout(300);
      check(a.url() === O + '/claudia/', 'coach sudah masuk: xnk.web.id langsung ke /claudia/ (' + a.url() + ')');
      await a.goto(O + '/#masuk', { waitUntil: 'domcontentloaded' });
      check(a.url() === O + '/#masuk' && await a.isVisible('#slug'), 'xnk.web.id/#masuk tetap menampilkan landing');
      await a.goto(O + '/?hub', { waitUntil: 'domcontentloaded' });
      check(a.url() === O + '/?hub', 'xnk.web.id/?hub tetap menampilkan landing');

      // Tombol kembali di HP: browser melompati dua entri sekaligus (Chrome Android) -> aplikasi tidak boleh keluar ke landing.
      await a.setViewportSize({ width: 390, height: 844 });
      await a.goto(O + '/claudia/', { waitUntil: 'domcontentloaded' });
      await a.waitForFunction(() => Array.isArray(window.members) && window.members.length > 0, null, { timeout: 10000 }).catch(() => {});
      await a.evaluate(() => window.navigate('clients'));
      await a.waitForTimeout(300);
      await a.click('#client-list [data-key^="client:"]').catch(() => {});
      await a.waitForTimeout(500);
      const opened = await a.evaluate(() => document.getElementById('detail-panel').classList.contains('open'));
      await a.evaluate(() => history.go(-2));
      await a.waitForTimeout(700);
      const st = await a.evaluate(() => ({ open: document.getElementById('detail-panel').classList.contains('open'), view: window.currentView }));
      check(opened && !st.open && st.view === 'dashboard', 'back melompati 2 entri: panel detail dan halaman Klien ikut tertutup (' + JSON.stringify(st) + ')');
      await a.evaluate(() => window.navigate('clients'));
      await a.waitForTimeout(300);
      await a.evaluate(() => window.navigate('dashboard'));
      await a.waitForTimeout(900);
      check(a.url() === O + '/claudia/', 'sesudahnya kembali ke Dashboard tetap di /claudia/, tidak keluar ke landing (' + a.url() + ')');
      await a.setViewportSize({ width: 1280, height: 800 });

      const keys = await a.evaluate(() => Object.keys(localStorage));
      check(keys.length > 0 && keys.every(k => k.startsWith('claudia:') || k.startsWith('claudia-2:')), 'semua kunci localStorage berawalan slug: ' + keys.slice(0, 4).join(', ') + (keys.length > 4 ? '…' : ''));
      check(seen.every(u => u.startsWith(EXEC_A) || u.startsWith(EXEC_B)), 'semua panggilan server hanya ke dua /exec coach');
      check(XNK_HITS.length === 0, 'tidak ada permintaan ke xnk.my.id' + (XNK_HITS.length ? ': ' + XNK_HITS.slice(0, 2).join(', ') : ''));
      check(LIB_HITS.some(p => p.startsWith('_lib/exercises/')), 'pustaka gerakan dimuat dari /_lib/ hub sendiri');
      check(CSP_HITS.length === 0, 'tanpa penolakan Content-Security-Policy' + (CSP_HITS.length ? ': ' + CSP_HITS[0].slice(0, 160) : ''));
      check(errors.length === 0, 'tanpa error JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await context.close();
    }

    console.log('Hub · halaman info /<slug>/info/');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      // Service worker panel aktif dulu: halaman info di dalam scope-nya tetap harus datang dari jaringan.
      const panel = await open(context, O + '/claudia/', errors);
      await panel.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      await panel.close();
      for (const [slug, acc] of [['claudia', '#1d4ed8'], ['claudia-2', '#15803d']]) {
        const page = await open(context, O + '/' + slug + '/info', errors);
        check(page.url() === O + '/' + slug + '/info/', `/${slug}/info diarahkan ke /${slug}/info/`);
        await page.waitForSelector('#packages .pk', { timeout: 8000 }).catch(() => {});
        await page.waitForSelector('#slots .day, #slots p', { timeout: 8000 }).catch(() => {});
        const t = await page.title();
        check(t.includes(slug === 'claudia' ? 'Claudia Fit' : 'Claudia Dua') && !/XNK/.test(t), slug + ': judul halaman info = nama usaha: ' + t);
        const r = await page.evaluate(() => ({ pk: [...document.querySelectorAll('#packages .pk b')].map(b => b.textContent), days: document.querySelectorAll('#slots .day').length,
          err: !!document.querySelector('.err'), acc: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
          mark: (document.querySelector('.mark img') || {}).naturalWidth || 0, daftar: document.querySelector('.bar a.btn').getAttribute('href'),
          xnk: /XNK/.test(document.body.innerText), og: (document.querySelector('meta[property="og:title"]') || {}).content }));
        check(r.pk.includes('Regular 8') && r.days === 7 && !r.err, `${slug}: paket dan 7 hari jam kosong dari /exec coach itu (${JSON.stringify({ pk: r.pk, days: r.days, err: r.err })})`);
        check(r.acc === acc && r.mark > 0, `${slug}: warna aksen coach dan logo di halaman info`);
        check(r.daftar === '/' + slug + '/klien/' && !r.xnk, `${slug}: Daftar / Booking → /${slug}/klien/, tanpa tulisan "XNK"`);
        for (const [w, h] of [[360, 740], [390, 844], [430, 932], [1280, 800], [1920, 1080]]) {
          await page.setViewportSize({ width: w, height: h });
          await page.waitForTimeout(150);
          const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth,
            small: [...document.querySelectorAll('a.btn, button, a.hr')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).length,
            bar: getComputedStyle(document.querySelector('.bar')).display }));
          check(m.sw <= w && m.small === 0 && (w < 900 ? m.bar !== 'none' : m.bar === 'none'), `${slug} info ${w}×${h}: tanpa scroll ke samping, tombol ≥ 44 px, tombol bawah ${w < 900 ? 'tampil' : 'diganti tombol atas'} (${JSON.stringify(m)})`);
        }
        await page.close();
      }
      check(seen.every(u => u.startsWith(EXEC_A) || u.startsWith(EXEC_B)), 'halaman info hanya memanggil /exec coach');
      check(errors.length === 0, 'halaman info: tanpa error JavaScript / CSP' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
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
      await p.waitForFunction(() => window.myX && window.myX.profile, null, { timeout: 8000 }).catch(() => {});
      check(await p.evaluate(() => document.documentElement.getAttribute('data-accent')) === 'biru', 'klien yang belum memilih warna memakai warna coach (biru)');
      const home = await open(context, O + '/', errors);
      await home.waitForTimeout(300);
      check(home.url() === O + '/claudia/klien/', 'klien sudah masuk: xnk.web.id langsung ke /claudia/klien/ (' + home.url() + ')');
      await home.close();
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
    fs.rmSync(logoDir, { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} cek gagal.` : '\nSemua cek hub lolos.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
