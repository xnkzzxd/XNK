'use strict';
// Cek browser (Playwright) untuk situs hub xnk.web.id: dua coach di SATU domain, server Apps Script palsu yang menjalankan
// KODE LIBRARY dengan spreadsheet masing-masing:
//   NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/hub-check.js
// Dicek: landing (isian nama coach, kontak), 404, alamat tanpa garis miring, login panel bergantian di satu browser
// tanpa saling logout, kunci penyimpanan berawalan slug, portal klien hanya mengenal klien coach itu, cache service worker
// panel dan portal tidak saling menghapus, dan portal terbuka tanpa sinyal. T-2241/T-2242: warna aksen dan logo per coach,
// halaman info /<slug>/info/ (HP dan desktop, CSP ketat, tetap dari jaringan walau service worker panel aktif).
// T-2258…T-2260: tempat latihan di halaman info (deret hari, menu bagian, Maps) dan cari/saring kota di halaman depan,
// tombol Tempat di /adminxnk.
// T-2243: ganti slug di situs yang sedang tayang: link lama (?query#hash) mendarat di alamat baru, login dan salinan
// offline dari sebelum ganti tetap terbaca, link lama tanpa sinyal tetap terbuka, tombol Ganti slug di /adminxnk.
// T-2252: coach keluar — tombol "Coach keluar…" (ketik slug) dan "Aktifkan lagi" di /adminxnk; coach yang tadinya aktif
// (klien masuk, service worker terpasang) menjadi tidak aktif: worker lama tidak menyajikan aplikasi lagi, cache-nya
// hilang, panel/portal/info = halaman "tidak aktif lagi" tanpa penolakan CSP, halaman depan tidak membukanya otomatis,
// coach lain tetap jalan.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const hub = require('./build-hub');
const { edit: hubEdit } = require('./hub-edit');
const { makeCtx, createLibEnv } = require('../tests/lib-harness');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXEC_A = 'https://script.google.com/macros/s/AKfycbHUBclaudiaTestDeployment00000001/exec';
const EXEC_B = 'https://script.google.com/macros/s/AKfycbHUBclaudia2TestDeployment0000002/exec';
const PRICE = [['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
  ['P1', 'Regular 8', 'regular', 800000, 8, '1 Bulan', 'desc', 'a,b', true],
  ['P2', 'Regular 16', 'regular', 1440000, 16, '2 Bulan', '', 'a,b,c', true]];

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
function serve(state) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    const files = state.files;   // T-2243: situs bisa diganti di tengah tes (ganti slug), seperti build hub baru yang tayang
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
// XNK HQ palsu untuk /adminxnk (T-2234): jawaban berbentuk sama dengan apps-script/xnk-pusat/src/Pusat.gs.
const PUSAT = 'https://script.google.com/macros/s/AKfycbPUSATHUBCHECK00000000000/exec';
const PUSAT_CALLS = [];
// T-2262: 30 hari riwayat palsu untuk grafik (angka saja).
const HIST_A = Array.from({ length: 30 }, (_, i) => [new Date(Date.now() + 7 * 3600e3 - (29 - i) * 86400e3).toISOString().slice(0, 10), 6 + Math.round(i / 4), 15 + Math.round(i / 5), 8 + (i % 5) + Math.round(i / 6), 5 + (i % 4), 3, 9000 + i * 200, 12, 1]);
let PUSAT_OUT = null;   // T-2252: keadaan coach keluar claudia di XNK HQ palsu
// T-2251 / T-2264: langganan palsu claudia (bawaan gratis), bentuk sama dengan subView_ di Pusat.gs.
// T-2265: paket dan harga dari satu sumber (sama dengan PUSAT_TIERS di Pusat.gs, dicek tests/hub.test.js).
const PUSAT_TIERS = require('./hub-harga').pusatShape().tiers;
const PUSAT_SUB = { plan: 'gratis', tier: 'gratis', tierName: 'Gratis', cycle: 'bulanan', price: 0, due: '', email: '', ro: 'auto', state: 'gratis', days: null, graceLeft: null, readonly: false,
  setup: { kind: 'none', price: 0, paidAt: '' }, pay: [], history: [], pushed: null };
const todayWibHC = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
function fakeMoney() {
  const v = PUSAT_SUB, sum = v.pay.reduce((m, p) => m + p.amount, 0), mk = todayWibHC().slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return { key: d.toISOString().slice(0, 7), amount: 0 }; });
  months[5].key = mk; months[5].amount = sum;
  return { mrr: PUSAT_OUT || v.plan !== 'bulanan' ? 0 : v.cycle === 'tahunan' ? Math.round(v.price / 12) : v.price, monthIn: sum, monthKey: mk, months,
    upcoming: !PUSAT_OUT && v.plan === 'bulanan' && v.due ? [{ slug: 'claudia', due: v.due, amount: v.price, cycle: v.cycle, state: v.state, days: v.days }] : [],
    setupUnpaid: !PUSAT_OUT && v.setup.kind !== 'none' && !v.setup.paidAt ? ['claudia'] : [],
    payments: v.pay.slice().reverse().map(p => Object.assign({ slug: 'claudia' }, p)) };
}
function fakePusat(req) {
  PUSAT_CALLS.push(req.fn);
  if (req.fn === 'pusatLogin') return req.args[0] === 'pin-pusat-1' ? { ok: true, data: { token: 'T1', exp: Date.now() + 3600e3 } } : { ok: false, error: 'PIN salah.' };
  if (req.args[0] !== 'T1') return { ok: false, auth: true, error: 'Sesi berakhir. Masuk lagi.' };
  if (req.fn === 'pusatSetPlace') { PUSAT_CALLS.place = req.args.slice(1); return { ok: true, data: { slug: req.args[1], place: req.args[2] ? { name: req.args[2], city: req.args[3] } : null, hub: 'ok' } }; }
  if (req.fn === 'pusatRename') { PUSAT_CALLS.rename = req.args.slice(1); return { ok: true, data: { slug: req.args[2], from: req.args[1], site: 'ok', folder: 'ok', hub: 'ok' } }; }
  if (req.fn === 'pusatAction' && req.args[1] === 'setup') return { ok: true, data: { ticket: 'setup.1.sig' } };
  if (req.fn === 'pusatLeave') {
    PUSAT_CALLS.leave = req.args.slice(1);
    PUSAT_OUT = { at: new Date().toISOString(), day: '2026-11-19', deleteOn: '2026-12-19', daysLeft: 30, done: '', hub: 'ok', hubInactive: false, canUndo: true,
      final: { state: 'jalan', dirUrl: 'https://drive.google.com/drive/folders/AKHIRHUBCHECK', fileUrl: '', xlsxUrl: '', xlsxError: '', error: '', at: '' } };
    return { ok: true, data: { slug: req.args[1], day: PUSAT_OUT.day, deleteOn: PUSAT_OUT.deleteOn, dirUrl: PUSAT_OUT.final.dirUrl, readonly: 'ok', push: 'ok', backup: 'ok', hub: 'ok' } };
  }
  // T-2251: langganan (bawaan gratis); simpan dan aksi menjawab overview baru.
  if (req.fn === 'pusatSubSave') {
    PUSAT_CALLS.sub = req.args.slice(1);
    const d = req.args[2], t = PUSAT_TIERS[d.tier], price = Number(String(d.price).replace(/\D/g, '')) || (t ? t[d.cycle] : 0);
    const plan = d.tier === 'gratis' ? 'gratis' : (d.cycle === 'bulanan' || d.cycle === 'tahunan') ? 'bulanan' : 'sekali';
    Object.assign(PUSAT_SUB, { tier: d.tier, tierName: t ? t.name : d.tier === 'gratis' ? 'Gratis' : 'Lainnya', cycle: d.cycle, plan, price, due: plan === 'bulanan' ? d.due : '', email: d.email,
      state: plan === 'bulanan' ? 'aktif' : plan === 'sekali' ? 'belum' : 'gratis', days: plan === 'bulanan' ? 30 : null,
      setup: { kind: d.setupKind, price: Number(d.setupPrice) || 0, paidAt: '' } });
  }
  else if (req.fn === 'pusatSubPay') {
    PUSAT_CALLS.pay = req.args.slice(1);
    const d = req.args[2];
    PUSAT_SUB.pay.push({ at: new Date().toISOString(), date: d.date, amount: Number(String(d.amount).replace(/\D/g, '')), kind: d.kind, note: d.note });
    if (d.kind === 'setup') PUSAT_SUB.setup.paidAt = d.date;
  }
  else if (req.fn === 'pusatAction' && /^sub-/.test(req.args[1])) { PUSAT_CALLS.subAct = req.args[1]; if (req.args[1] === 'sub-ro-on') Object.assign(PUSAT_SUB, { ro: 'on', readonly: true }); }
  else if (req.fn === 'pusatAction' && req.args[1] === 'leave-undo') { PUSAT_CALLS.undo = req.args[2]; PUSAT_OUT = null; }
  else if (req.fn === 'pusatAction') { if (req.args[1] === 'backup') PUSAT_CALLS.backup = true; return { ok: true, data: { started: req.args[1], slug: req.args[2] } }; }
  const st = (ok, problems) => ({ at: new Date().toISOString(), ok, problems, data: { lib: { commit: 'c'.repeat(40) }, api: 1, triggers: { runReminderTick: 1 }, reminders: { enabled: true, lastTickAt: new Date().toISOString() }, clients: { total: 21, active30d: 13 }, sessions: { done7d: 17, next7d: 9 }, quota: { date: '2026-11-19', mail: 12, fetch: 15200, triggerMin: 20, mailRemaining: 84 }, quotaDays: [{ date: '2026-11-18', mail: 31, fetch: 18400, triggerMin: 0.05 }], readonly: !!PUSAT_SUB.readonly, left: !!PUSAT_OUT } });
  return { ok: true, data: { hub: 'https://xnk.web.id', latest: { version: 11, commit: 'c'.repeat(40) }, canAct: true, fetchToday: 34, money: fakeMoney(), tiers: PUSAT_TIERS, setupPrices: require('./hub-harga').pusatShape().setup, quotaLimits: { mail: 100, fetch: 20000, triggerMin: 90 }, setup: { ok: false, auth: false, daily: true, backup: true, editor: 'https://script.google.com/d/SCRIPTPUSAT/edit' },
    places: { claudia: { name: 'Gold Gym Kemang', city: 'Jakarta Selatan' }, 'claudia-2': null }, coaches: [
    { slug: 'claudia', exec: EXEC_A, hist: HIST_A, registeredAt: new Date().toISOString(), panel: 'https://xnk.web.id/claudia/', klien: 'https://xnk.web.id/claudia/klien/', status: st(true, []),
      backup: { at: '2026-11-15T03:00:00.000Z', okAt: '2026-11-15T03:00:00.000Z', fileUrl: 'https://docs.google.com/spreadsheets/d/BACKUPHUBCHECK/edit', rows: 321, error: '', fails: 0, queued: !!PUSAT_CALLS.backup, running: false }, push: PUSAT_OUT ? { on: false, active: false, subs: 0, at: '', error: '' } : { on: true, active: true, subs: 3, at: new Date().toISOString(), error: '' }, sub: Object.assign({}, PUSAT_SUB), out: PUSAT_OUT },
  ] } };
}

async function newContext(browser, be, seen) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route(/^https:\/\/script\.google(usercontent)?\.com\//, route => {
    const u = route.request().url();
    if (u.startsWith(PUSAT + '?setup=')) return route.fulfill({ status: 200, contentType: 'text/plain', body: 'XNK HQ siap (palsu)' });
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
    { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC_A, accent: 'biru', logo: 'logo/claudia.png', place: { name: 'Gold Gym Kemang', city: 'Jakarta Selatan' } },
    { slug: 'claudia-2', brand: 'Claudia Dua', exec: EXEC_B, accent: 'hijau', logo: 'logo/dua.webp', place: { name: 'Studio Dua', city: 'Bandung' } },
  ] };
  const browser = await chromium.launch();
  const logoDir = await makeLogos(browser);
  const site = hub.build(cfg, { baseDir: logoDir });
  // Uji-diri: HUB_CHECK_NOSHIM=1 mencopot penyimpanan per slug; cek isolasi di bawah HARUS gagal (membuktikan tesnya tidak kosong).
  if (process.env.HUB_CHECK_NOSHIM) for (const n of Object.keys(site.files)) if (n.endsWith('index.html')) site.files[n] = site.files[n].replace(/<script>\(function \(\) \{\n  var P = [\s\S]*?<\/script>\n/, '');
  const state = { files: site.files };
  const server = await serve(state);
  const O = 'http://127.0.0.1:' + server.address().port;
  try {
    console.log('Hub · landing dan alamat');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      const page = await open(context, O + '/', errors);
      check((await page.title()) === 'XNK · aplikasi personal trainer dan kliennya', 'judul landing');
      // T-2265: nama coach dan daftar coach ada di lembar Masuk (bilah atas, "Masuk di sini", kaki halaman, #masuk).
      check(!(await page.isVisible('#slug')), 'lembar Masuk tertutup saat halaman dibuka');
      await page.click('.top-cta a[href="#masuk"]');
      await page.waitForTimeout(500);
      check(await page.isVisible('#slug') && page.url().endsWith('#masuk'), 'Masuk di bilah atas membuka lembar (alamat #masuk)');
      check((await page.textContent('body')).includes('Hubungi XNK'), 'tombol kontak tampil (kontak diisi)');
      check(await page.locator('a.coach[href="/claudia/info/"]').count() === 1 && await page.locator('a.coach[href="/claudia-2/info/"]').count() === 1, 'daftar coach menautkan halaman info /<slug>/info/');
      check(await page.evaluate(() => [...document.querySelectorAll('a.coach .av img')].map(i => i.naturalWidth > 0 && i.getAttribute('src')).join(',')) === '/claudia/logo.png,/claudia-2/logo.webp', 'kartu coach memuat logo PNG dan WebP');
      // T-2260: tempat di kartu, cari dan saring kota.
      check(((await page.textContent('a.coach[href="/claudia/info/"] .pl')) || '').includes('Gold Gym Kemang') , 'kartu coach: tempat latihan di bawah nama');
      const vis = () => page.evaluate(() => [...document.querySelectorAll('#coaches .coach')].filter(a => !a.hidden && a.offsetParent).map(a => a.getAttribute('href')).join(','));
      await page.click('#cities button[data-city="bandung"]');
      check(await vis() === '/claudia-2/info/' && await page.getAttribute('#cities button[data-city="bandung"]', 'aria-pressed') === 'true', 'pilih kota Bandung → hanya coach di Bandung');
      await page.click('#cities button[data-city=""]');
      await page.fill('#coach-q', 'kemang');
      check(await vis() === '/claudia/info/', 'cari "kemang" → coach dengan tempat itu');
      await page.fill('#coach-q', 'tidak ada');
      check(await vis() === '' && await page.isVisible('#no-hit'), 'tidak cocok → pesan "Tidak ada coach yang cocok"');
      await page.fill('#coach-q', '');
      check(await vis() === '/claudia/info/,/claudia-2/info/' && !(await page.isVisible('#no-hit')), 'kosongkan cari → semua coach lagi');
      check(await page.evaluate(() => [...document.querySelectorAll('#cities button')].every(b => b.getBoundingClientRect().height >= 43.5)), 'pilihan kota ≥ 44 px');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      check(!(await page.isVisible('#slug')) && !page.url().includes('#masuk'), 'Esc menutup lembar Masuk dan #masuk hilang dari alamat');
      await page.click('.hero-in a[href="#masuk"]');
      await page.waitForTimeout(500);
      await page.goBack();
      await page.waitForTimeout(600);
      check(!(await page.isVisible('#slug')) && page.url() === O + '/', 'tombol kembali HP menutup lembar, tetap di halaman depan');
      check(await page.evaluate(() => [...document.querySelectorAll('.phones img')].filter(i => i.offsetParent).every(i => i.naturalWidth > 0)), 'gambar hero termuat');
      // T-2265: tabel perbandingan dan pilihan bayar dibuka, supaya ikut dicek tanpa scroll ke samping.
      await page.evaluate(() => document.querySelectorAll('details.more').forEach(d => { d.open = true; }));
      // Berbagai rasio layar: HP tegak/mendatar, tablet, laptop, ultrawide, monitor tegak.
      for (const [w, h] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1024, 768], [1366, 768], [1920, 1080], [2560, 1080], [1080, 1920], [3440, 1440]]) {
        await page.setViewportSize({ width: w, height: h });
        const r = await page.evaluate(() => { const hb = document.querySelector('.hero').getBoundingClientRect().bottom; return { sw: document.documentElement.scrollWidth, ph: document.querySelector('.phones').getBoundingClientRect().top + scrollY, pad: Math.min(hb - document.querySelector('.facts').getBoundingClientRect().bottom, hb - document.querySelector('.phones').getBoundingClientRect().bottom) }; });
        check(r.sw <= w, `landing ${w}×${h}: tanpa scroll ke samping`);
        if (w > h) check(r.ph < h, `landing ${w}×${h}: mockup HP terlihat di layar pertama`);
        if (w > h) check(r.pad >= 32, `landing ${w}×${h}: pita hitam hero turun di bawah teks dan HP (${Math.round(r.pad)} px)`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      // T-2265: harga bulanan / tahunan, "Pilih Pro" mengisi form daftar, form membuka WhatsApp (window.open ditangkap).
      {
        const T = require('./hub-harga').TIERS, pro = T.find(t => t.key === 'pro');
        const shown = () => page.evaluate(() => [...document.querySelectorAll('#paket-pro .price')].filter(p => p.offsetParent).map(p => p.querySelector('b').textContent).join('|'));
        check(await shown() === require('./hub-harga').rp(pro.bulanan) && await page.getAttribute('#cyc button[data-cyc="bulanan"]', 'aria-pressed') === 'true', 'harga: bulanan tampil lebih dulu (' + await shown() + ')');
        check(await page.isVisible('#paket-pro .free'), 'harga: "Bulan pertama gratis" di bulanan');
        await page.click('#cyc button[data-cyc="tahunan"]');
        check(await shown() === require('./hub-harga').rp(pro.tahunan) && !(await page.isVisible('#paket-pro .free')), 'harga: Tahunan → harga tahunan Pro, tanpa "bulan pertama gratis"');
        check(await page.evaluate(() => [...document.querySelectorAll('#cyc button, a[data-plan], #df select, #df input:not([type=checkbox]), #df .chk, #df button')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 43.5)), 'harga dan form: tombol dan isian ≥ 44 px');
        await page.click('a[data-plan="pro"]');
        await page.waitForTimeout(300);
        check(await page.inputValue('#df-paket') === 'pro' && await page.inputValue('#df-bayar') === 'tahunan', '"Pilih Pro" (tahunan) → form daftar terisi Pro, tahunan');
        // Gulir halus (scroll-behavior: smooth): tunggu sampai bagian Daftar sampai di bawah bilah atas.
        check(await page.waitForFunction(() => location.hash === '#daftar' && Math.abs(document.getElementById('daftar').getBoundingClientRect().top) < 150, null, { timeout: 5000 }).then(() => true, () => false), '"Pilih Pro" membawa ke form daftar');
        await page.evaluate(() => { window.__wa = []; window.open = function (u) { window.__wa.push(u); return {}; }; });
        await page.click('#df button[type="submit"]');
        check(((await page.textContent('#df-err')) || '').includes('nama') && (await page.evaluate(() => window.__wa.length)) === 0, 'form tanpa nama → pesan, WhatsApp tidak dibuka');
        await page.fill('#df-nama', 'Rina & Co');
        await page.fill('#df-kota', 'Bandung');
        await page.selectOption('#df-klien', { label: '5–15' });
        await page.click('#df button[type="submit"]');
        const wa = await page.evaluate(() => window.__wa[0] || '');
        const msg = wa.includes('?text=') ? decodeURIComponent(wa.split('?text=')[1]) : '';
        check(wa.startsWith('https://wa.me/6281234567890?text=') && msg === ['Halo XNK, saya tertarik memakai XNK.', 'Nama: Rina & Co', 'Kota / tempat: Bandung', 'Klien aktif: 5–15', 'Paket: Pro', 'Cara bayar: Tahunan', 'Mau demo 30 menit dulu: ya'].join('\n'),
          'form → wa.me dengan pesan terisi' + (msg ? '' : ' (' + wa + ')'));
        check(await page.getAttribute('a[href="https://xnk.my.id/demo/"]', 'target') === '_blank' && await page.locator('a[href="https://xnk.my.id/demo/?klien"]').count() === 1, 'coba demo: panel dan portal contoh (tab baru)');
        check(await page.evaluate(() => Promise.all([...document.querySelectorAll('.dscr img')].map(i => fetch(i.getAttribute('src') || i.getAttribute('data-src')).then(r => r.ok, () => false))).then(a => a.length === 9 && a.every(Boolean))), 'fitur: 9 layar ada (coach dan klien)');
        // Fitur bertab: tab diketuk = layar, keterangan dan lencana berganti; sisi Untuk klien punya tabnya sendiri.
        await page.evaluate(() => document.getElementById('fitur').scrollIntoView());
        await page.click('#t-uang');
        await page.waitForTimeout(500);
        check(await page.evaluate(() => document.querySelector('.dscr img.on').getAttribute('data-k') === 'uang' && document.querySelector('.cap2.on').getAttribute('data-k') === 'uang'
          && document.querySelectorAll('.chip.on[data-k="uang"]').length === 2 && document.getElementById('t-uang').getAttribute('aria-selected') === 'true'), 'fitur: tab Keuangan → layar, keterangan, dan lencana Keuangan');
        await page.click('[data-g2="klien"]');
        await page.waitForTimeout(400);
        check(await page.isVisible('#t-latihan') && !(await page.isVisible('#t-uang')) && await page.evaluate(() => document.querySelector('.cap2.on').getAttribute('data-k') === 'hari'), 'fitur: Untuk klien → tab klien, mulai dari Hari ini');
        check(await page.evaluate(() => [...document.querySelectorAll('#show [role="tab"], .seg button')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 43.5)), 'fitur: tab dan pilihan sisi ≥ 44 px');
        // Gerak: 5 -> 1 saat daftar alat digulir, "Capek." jadi "Beres."; tanpa sisa animasi setelah berhenti menggulir.
        await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, document.querySelector('.tool.xnk').getBoundingClientRect().top + scrollY - innerHeight * .4); });
        await page.waitForTimeout(900);
        check(await page.evaluate(() => document.querySelectorAll('.tool.x').length === 5 && document.querySelector('.roll').style.getPropertyValue('--k') === '4' && document.querySelector('.pb').classList.contains('done')), '5 aplikasi → 1 aplikasi, "Capek." → "Beres." setelah semua alat digulir');
        await page.evaluate(() => scrollTo(0, document.getElementById('masalah').offsetTop - 200));
        await page.waitForTimeout(900);
        check(await page.evaluate(() => document.querySelectorAll('.tool.x').length === 0 && !document.querySelector('.pb').classList.contains('done')), 'gulir kembali ke atas → 5 aplikasi lagi');
        await page.evaluate(() => scrollTo(0, document.getElementById('tanya').offsetTop));
        await page.waitForTimeout(2500);
        const idle = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').map(a => { const t = a.effect && a.effect.target; return (t && (t.className || t.tagName)) + ':' + (a.animationName || a.transitionProperty); }));
        check(idle.length === 0, 'diam di Tanya jawab: tidak ada animasi berjalan (pita dan tab fitur berhenti di luar layar)' + (idle.length ? ': ' + idle.slice(0, 3).join(', ') : ''));
        await page.goto(O + '/?hub', { waitUntil: 'load' });
      }
      await page.click('.top-cta a[href="#masuk"]');
      await page.waitForTimeout(500);
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

    console.log('Hub · landing dengan "kurangi gerakan"');
    {
      const errors = [];
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      await context.route(/^https:\/\/xnk\.my\.id\//, route => { XNK_HITS.push(route.request().url()); return route.abort('failed'); });
      const page = await open(context, O + '/?hub', errors);
      const still = async () => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
      check(await still() === 0, 'kurangi gerakan: tidak ada animasi saat dibuka');
      check(await page.evaluate(() => getComputedStyle(document.querySelector('.hero h1')).opacity === '1' && getComputedStyle(document.querySelector('#harga-judul .w > span')).transform === 'none'), 'kurangi gerakan: judul langsung tampil');
      await page.evaluate(() => scrollTo(0, document.getElementById('fitur').offsetTop));
      await page.waitForTimeout(800);
      check(await still() === 0 && await page.evaluate(() => document.querySelectorAll('.tool.x').length === 5), 'kurangi gerakan: fitur tidak berganti sendiri, daftar alat langsung tercoret');
      check(errors.length === 0, 'tanpa error JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await context.close();
    }

    console.log('Hub · /adminxnk (XNK HQ)');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      const page = await open(context, O + '/adminxnk/', errors);
      await page.setViewportSize({ width: 1440, height: 900 });
      const SH = process.env.HUB_SHOTS, shot = async n => { if (SH) await page.screenshot({ path: path.join(SH, n + '.png') }); };
      const dlgOk = async () => { await page.waitForSelector('#dlg[open]', { timeout: 5000 }).catch(() => {}); await page.click('#dlgOk'); };
      const dm = async () => (await page.textContent('#dm')) || '';
      const clearDm = () => page.evaluate(() => { document.getElementById('dm').textContent = ''; });
      // Tidak ada ruang kosong di bawah kaki halaman (tabel pembaca layar dulu menjulur ±600 px).
      const noTail = async (where) => {
        const m = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, foot: Math.round(document.getElementById('hqfoot').getBoundingClientRect().bottom + window.scrollY) }));
        check(Math.abs(m.doc - m.foot) <= 1, where + ': tidak ada ruang di bawah kaki halaman (' + JSON.stringify(m) + ')');
      };
      const waitDm = t => page.waitForFunction(x => document.getElementById('dm').textContent.includes(x), t, { timeout: 5000 }).catch(() => {});
      const txt = async sel => (await page.textContent(sel).catch(() => '')) || '';
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      check(await page.isVisible('#pin') && !(await page.isVisible('#dash')), 'awal: hanya form PIN, tanpa data');
      check((await page.title()) === 'XNK HQ' && (await txt('#login')).includes('Masuk ke XNK HQ'), 'nama: XNK HQ');
      await page.fill('#pin', 'salah');
      await page.click('#go');
      await page.waitForFunction(() => document.getElementById('lm').textContent.includes('PIN salah'), null, { timeout: 5000 }).catch(() => {});
      check((await txt('#lm')).includes('PIN salah'), 'PIN salah → pesan');
      await page.fill('#pin', 'pin-pusat-1');
      await page.click('#go');
      await page.waitForSelector('#list .ccard', { timeout: 5000 }).catch(() => {});
      // T-2264: dibuka = ringkasan semua coach di kanan, tanpa panel kosong.
      check(await page.isVisible('#sumbox') && !(await page.isVisible('#insp')), 'dibuka: ringkasan semua coach di kanan, bukan panel kosong');
      check((await page.$$eval('#list .ccard', rs => rs.map(r => r.dataset.sel))).join() === 'claudia-2,claudia' && (await txt('#list')).includes('Claudia Fit'), 'daftar ringkas: nama dari hub.json, masalah di atas');
      check((await txt('#issues')).includes('Belum terdaftar di XNK HQ') && await page.$('#sumbox svg.ring') !== null, 'Kesehatan: cincin + daftar masalah');
      check((await txt('#moneySum')).includes('Rutin / bulan') && (await txt('#sum')).includes('Library v11'), 'ringkasan Uang + versi Library');
      check((await page.$$('#growth svg.line')).length === 2, 'Pertumbuhan: dua grafik garis 30 hari');
      check(!(await page.$('#cmp')), 'perbandingan coach disembunyikan bila hanya satu coach berangka');
      const chips = await page.$$eval('#chips [data-filter]', bs => bs.map(b => b.dataset.filter));
      check(chips.join() === 'all,bad', 'saringan: hanya yang berisi (Semua, Perlu dicek), tanpa saringan kosong (' + chips.join() + ')');
      await page.click('#chips [data-filter="bad"]');
      check((await page.$$('#list .ccard')).length === 1, 'saringan Perlu dicek: satu coach');
      await page.click('#chips [data-filter="all"]');
      const look = await page.evaluate(() => {
        const lum = c => { const m = c.match(/\d+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const small = document.querySelector('.ccard .pl'), card = document.querySelector('.ccard');
        const dark = [...document.querySelectorAll('body *')].filter(el => { const c = getComputedStyle(el).backgroundColor; const m = c.match(/\d+/g); return m && +(m[3] || 1) > 0.5 && +m[0] < 40 && +m[1] < 40 && +m[2] < 40 && el.offsetWidth > 200 && el.offsetHeight > 40; }).length;
        return { mut: ratio(getComputedStyle(small).color, getComputedStyle(card).backgroundColor), side: getComputedStyle(document.querySelector('.side')).backgroundColor, dark };
      });
      check(look.mut >= 7 && look.side === 'rgb(255, 255, 255)' && look.dark === 0, 'terang lembut: teks abu ≥ 7:1, bilah samping terang, tanpa blok hitam besar (' + look.mut.toFixed(1) + ', ' + look.side + ', ' + look.dark + ')');
      // T-2264 ronde 5: tanpa ruang kosong — baris kartu coach selebar halaman, kartu sebaris sama tinggi, kaki halaman.
      const lay = await page.evaluate(() => {
        const strip = document.getElementById('list').getBoundingClientRect(), pg = document.getElementById('page-coach').getBoundingClientRect();
        const h = id => { const el = document.getElementById(id); return el ? Math.round(el.getBoundingClientRect().height) : -1; };
        return { strip: strip.width / (pg.width - 48), health: h('health'), money: h('moneySum') };
      });
      check(lay.strip >= 0.9 && Math.abs(lay.health - lay.money) <= 2, 'baris kartu coach selebar halaman; Kesehatan dan Uang sama tinggi (' + JSON.stringify(lay) + ')');
      check(((await txt('#hqfoot')) || '').includes('XNK HQ') && (await txt('#hqfoot')).includes('Library v11'), 'kaki halaman: XNK HQ, waktu cek, versi Library');
      await noTail('Coach · ringkasan 1440');
      await shot('hq-1440-ringkasan');
      await page.emulateMedia({ colorScheme: 'dark' }); await shot('hq-1440-dark'); await page.emulateMedia({ colorScheme: 'light' });
      // Detail coach
      await page.click('#list .ccard[data-sel="claudia"]');
      const insp = await txt('#insp');
      check(await page.isVisible('#insp') && !(await page.isVisible('#sumbox')) && insp.includes('Beres'), 'pilih coach → detail di kanan, ringkasan disembunyikan');
      check((await page.$$('#insp .tile svg.spark path.ln')).length === 4 && (await page.$$('#insp .g')).length === 6 && (await page.$('#insp .g.bad')) !== null && insp.includes('Kemarin (sehari penuh)') && insp.includes('<1%'), 'detail: 4 ubin dengan garis 30 hari, 6 meteran kuota kemarin + hari ini (≥ 70 % merah, <1%)');
      check(insp.includes('15 Nov 2026') && (await page.getAttribute('#insp .bk a', 'href')) === 'https://docs.google.com/spreadsheets/d/BACKUPHUBCHECK/edit' && insp.includes('perangkat · menyala'), 'detail: backup + link Buka, push');
      check(insp.includes('Gratis') && insp.includes('Tanpa langganan'), 'langganan: bawaan gratis');
      // T-2264: Atur paket (harga dari proposal) → pusatSubSave
      await page.click('#insp [data-act="sub-edit"]');
      await page.selectOption('#sb-claudia-t', 'pro');
      check((await page.inputValue('#sb-claudia-h')) === '249000', 'Atur paket: harga Pro bulanan terisi dari proposal');
      await page.selectOption('#sb-claudia-c', 'tahunan');
      check((await page.inputValue('#sb-claudia-h')) === '2490000', 'Atur paket: tahunan → Rp 2.490.000');
      await page.fill('#sb-claudia-d', '2026-12-19');
      await page.selectOption('#sb-claudia-s', 'standar');
      check((await page.inputValue('#sb-claudia-sp')) === '400000', 'Atur paket: setup Standar Rp 400.000');
      await clearDm();
      await page.click('#insp .sub-form button[type="submit"]');
      await waitDm('disimpan');
      check(JSON.stringify(PUSAT_CALLS.sub) === JSON.stringify(['claudia', { tier: 'pro', cycle: 'tahunan', price: '2490000', due: '2026-12-19', email: '', setupKind: 'standar', setupPrice: '400000' }]) &&
        (await txt('#insp')).includes('Pro') && (await txt('#insp')).includes('tahunan') && (await txt('#list .ccard[data-sel="claudia"]')).includes('Pro'),
        'Atur paket → pusatSubSave (paket, cara bayar, setup), detail dan daftar diperbarui (' + JSON.stringify(PUSAT_CALLS.sub) + ')');
      check((await txt('#insp')).includes('belum lunas'), 'setup Standar tampil belum lunas');
      // Tandai lunas = catat pembayaran → pusatSubPay
      await page.click('#insp [data-act="pay-open"]');
      check((await page.inputValue('#py-claudia-a')) === '2490000' && (await page.$$eval('#py-claudia-k option', os => os.map(o => o.value))).join() === 'langganan,setup', 'Tandai lunas: jenis langganan + setup, jumlah terisi');
      await page.selectOption('#py-claudia-k', 'setup');
      check((await page.inputValue('#py-claudia-a')) === '400000', 'Tandai lunas: jumlah ikut jenis (setup)');
      await page.fill('#py-claudia-n', 'transfer');
      await clearDm();
      await page.click('#insp .pay-form button[type="submit"]');
      await waitDm('dicatat');
      check(JSON.stringify(PUSAT_CALLS.pay) === JSON.stringify(['claudia', { kind: 'setup', amount: '400000', date: today, note: 'transfer' }]) && (await txt('#insp')).includes('transfer'),
        'Tandai lunas → pusatSubPay, pembayaran tampil di detail (' + JSON.stringify(PUSAT_CALLS.pay) + ')');
      await noTail('Coach · detail 1440');
      await shot('hq-1440-coach');
      // Halaman Uang
      await page.click('#nav-uang');
      const uScroll = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight, v: window.innerHeight }));
      check(uScroll.y === 0, 'pindah halaman: mulai dari atas (' + JSON.stringify(uScroll) + ')');
      const uang = await txt('#page-uang');
      check(await page.isVisible('#page-uang') && !(await page.isVisible('#page-coach')) && uang.includes('Rp 207.500') && uang.includes('Rp 400.000') && (await txt('#payLog')).includes('transfer') && (await txt('#moneyTab')).includes('Pro'),
        'halaman Uang: rutin/bulan (tahunan ÷ 12), masuk bulan ini, catatan bayar, tabel per coach');
      const ueq = await page.evaluate(() => { const cs = [...document.querySelectorAll('#page-uang .grid2 > .card')].map(c => Math.round(c.getBoundingClientRect().height)); return cs; });
      check(ueq.length === 2 && Math.abs(ueq[0] - ueq[1]) <= 2, 'Uang: 6 bulan dan Pembayaran terakhir sama tinggi (' + ueq.join(',') + ')');
      const foot = await page.evaluate(() => { const f = document.getElementById('hqfoot').getBoundingClientRect(); return { bottom: Math.round(f.bottom), vh: window.innerHeight }; });
      check(Math.abs(foot.bottom - foot.vh) <= 2, 'halaman pendek: kaki halaman menempel di bawah layar, tanpa latar kosong (' + JSON.stringify(foot) + ')');
      await noTail('Uang 1440');
      await shot('hq-1440-uang');
      await page.click('#moneyTab tr[data-sel="claudia"]');
      check(await page.isVisible('#page-coach') && await page.isVisible('#insp'), 'klik coach di Uang → detail coach');
      await page.click('#backSum');
      check(await page.isVisible('#sumbox') && !(await page.isVisible('#insp')), '← Ringkasan kembali ke ringkasan');
      // Baca saja lewat menu ⋯ + dialog sendiri
      await page.click('#list .ccard[data-sel="claudia"]');
      await page.click('#insp [data-menu="coach"]');
      await page.click('#menu [data-act="sub-ro-on"]');
      await clearDm(); await dlgOk(); await waitDm('Selesai');
      check(PUSAT_CALLS.subAct === 'sub-ro-on' && (await txt('#insp')).includes('dinyalakan tangan') && (await txt('#list .ccard[data-sel="claudia"]')).includes('Baca saja'), 'Baca saja nyala lewat menu + dialog (bukan confirm)');
      // T-2258: tempat
      check((await txt('#insp')).includes('Tempat: Gold Gym Kemang · Jakarta Selatan'), 'detail: tempat dari hub.json');
      await page.click('#insp [data-act="tempat"]');
      await page.fill('#pl-n-claudia', '  Studio   Dua ');
      await page.fill('#pl-c-claudia', 'Bandung');
      await clearDm();
      await page.click('.pl-form button[type="submit"]');
      await waitDm('disimpan');
      check(JSON.stringify(PUSAT_CALLS.place) === '["claudia","Studio Dua","Bandung"]' && (await txt('#insp')).includes('Tempat: Studio Dua · Bandung'), 'Tempat: simpan → pusatSetPlace (spasi dirapikan)');
      await page.click('#insp [data-act="tempat"]');
      await page.click('[data-act="tempat-hapus"]');
      await clearDm(); await dlgOk(); await waitDm('disimpan');
      check(JSON.stringify(PUSAT_CALLS.place) === '["claudia","",""]', 'Hapus tempat → pusatSetPlace dengan isian kosong');
      // T-2243: Ganti slug
      await page.click('#insp [data-menu="coach"]');
      await page.click('#menu [data-act="ganti-slug"]');
      await page.fill('#rn-claudia', 'Claudia Baru');
      await page.click('.rn-form button[type="submit"]');
      check(!(await page.isVisible('#dlg')) && (await dm()).includes('tidak valid'), 'Ganti slug: nama tidak valid ditolak sebelum dialog');
      await page.fill('#rn-claudia', 'Claudia-Baru');
      await page.click('.rn-form button[type="submit"]');
      await dlgOk();
      await waitDm('Selesai di XNK HQ');
      check(JSON.stringify(PUSAT_CALLS.rename) === '["claudia","claudia-baru"]', 'Ganti slug → pusatRename (' + JSON.stringify(PUSAT_CALLS.rename) + ')');
      // T-2252: Coach keluar
      await page.click('#list .ccard[data-sel="claudia"]');
      await page.click('#insp [data-menu="coach"]');
      await page.click('#menu [data-act="leave"]');
      await page.fill('#lv-claudia', 'Claudia');
      check(await page.isDisabled('#lv-go') && !PUSAT_CALLS.leave, 'Coach keluar: slug salah → tombol mati');
      await page.fill('#lv-claudia', 'claudia');
      await clearDm();
      await page.click('#lv-go');
      await waitDm('keluar.');
      const inspOut = await txt('#insp');
      check(JSON.stringify(PUSAT_CALLS.leave) === '["claudia","claudia"]' && inspOut.includes('Coach keluar') && inspOut.includes('Hapus akun Google coach') && (await page.getAttribute('#insp .outbox a', 'href')) === 'https://drive.google.com/drive/folders/AKHIRHUBCHECK',
        'Coach keluar → pusatLeave, kotak keluar + Folder Akhir');
      check(!(await page.$('#insp [data-act="backup"]')) && !(await page.$('#insp .subcard')) && (await page.$$eval('#chips [data-filter]', bs => bs.map(b => b.dataset.filter))).includes('out'), 'Coach keluar: tanpa Backup sekarang dan langganan, saringan Keluar muncul');
      await clearDm();
      await page.click('#insp [data-act="leave-undo"]');
      await dlgOk(); await waitDm('aktif lagi');
      check(PUSAT_CALLS.undo === 'claudia' && !(await page.$('#insp .outbox')), 'Aktifkan lagi → leave-undo');
      // Halaman Sistem
      await page.click('#nav-sistem');
      check(await page.isVisible('#page-sistem') && await page.isVisible('#setup') && (await txt('#setupWhy')).includes('Izin Google') && (await page.getAttribute('#setupEditor', 'href')) === 'https://script.google.com/d/SCRIPTPUSAT/edit',
        'Sistem: XNK HQ perlu disiapkan + langkah editor');
      check((await page.$$('#sysQuota .g')).length === 6 && (await txt('#sysQuota')).includes('Kemarin') && (await txt('#sysQuota')).includes('18,4 rb / 20 rb') && (await txt('#sysNums')).includes('v11'), 'Sistem: kuota per coach (kemarin + hari ini, angka pendek) + versi Library');
      const seq = await page.evaluate(() => [...document.querySelectorAll('#page-sistem .grid3 > .card')].map(c => Math.round(c.getBoundingClientRect().height)));
      check(seq.length === 3 && Math.max(...seq) - Math.min(...seq) <= 2, 'Sistem: tiga kartu atas sama tinggi (' + seq.join(',') + ')');
      await noTail('Sistem 1440');
      await shot('hq-1440-sistem');
      const [tab] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.click('#sysSetup')]);
      if (tab) await tab.waitForURL(/[?]setup=/, { timeout: 5000 }).catch(() => {});
      check(!!tab && tab.url() === PUSAT + '?setup=setup.1.sig', 'Siapkan XNK HQ: tab baru dengan tanda siap');
      if (tab) await tab.close();
      check(await page.evaluate(() => Object.keys(sessionStorage).every(k => k.startsWith('adminxnk:'))), 'sessionStorage berawalan adminxnk:');
      check(await page.evaluate(() => !/window\.(confirm|prompt)\(/.test(document.documentElement.innerHTML)), 'tanpa window.confirm / window.prompt');
      await page.click('#nav-coach');
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.waitForTimeout(200);
      await noTail('1024');
      await shot('hq-1024');
      // HP 390 × 844
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      const ph = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth <= window.innerWidth, bar: getComputedStyle(document.querySelector('.side')).position,
        order: document.getElementById('list').getBoundingClientRect().top < document.getElementById('sumbox').getBoundingClientRect().top }));
      check(ph.wide && ph.bar === 'fixed' && ph.order, 'HP: tanpa geser ke samping, bilah bawah, kartu coach lalu ringkasan (' + JSON.stringify(ph) + ')');
      await shot('hq-390-ringkasan');
      await page.click('#list .ccard[data-sel="claudia"]');
      await page.waitForTimeout(350);
      check(await page.evaluate(() => document.getElementById('dash').classList.contains('insp-open')), 'HP: ketuk coach → lembar detail penuh');
      await shot('hq-390-detail');
      await page.goBack();
      await page.waitForTimeout(350);
      check(await page.evaluate(() => !document.getElementById('dash').classList.contains('insp-open')) && page.url().endsWith('/adminxnk/'), 'HP: tombol kembali menutup lembar, tetap di /adminxnk');
      await page.click('#nav-sistem');
      await page.click('#page-sistem [data-act="keluar"]');
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
      // T-2257: satu-satunya "XNK" yang boleh tampil adalah tanda kecil "Didukung XNK" (.xnk-by).
      const pinText = await a.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('.xnk-by').forEach(e => e.remove()); return c.innerText; });
      check(atitle.includes('Claudia Fit') && !/XNK/.test(atitle) && !/XNK/.test(pinText), 'layar PIN panel: judul dan teks memakai nama usaha, tanpa "XNK" (selain tanda "Didukung XNK")');
      check(await a.isVisible('#admin-login .xnk-by') && /^Didukung XNK$/.test((await a.textContent('#admin-login .xnk-by')).trim()), 'layar PIN panel: tanda kecil "Didukung XNK" tampil (T-2257)');
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
        // T-2259: tempat, ringkasan, paket termurah per sesi, deret hari, menu bagian.
        const place = slug === 'claudia' ? ['Gold Gym Kemang', 'Jakarta Selatan'] : ['Studio Dua', 'Bandung'];
        const q = await page.evaluate(() => ({ where: (document.getElementById('where') || {}).textContent, sec: !document.getElementById('tempat').hidden,
          maps: (document.querySelector('#tempat a.btn') || {}).href, facts: [...document.querySelectorAll('#facts li')].map(l => l.getAttribute('data-k')).join(','),
          best: [...document.querySelectorAll('.pk.best b')].map(b => b.textContent).join(','), per: (document.querySelector('.pk.best .per') || {}).textContent,
          nav: [...document.querySelectorAll('.sec-nav a')].filter(a => !a.hidden).map(a => a.textContent).join(',') }));
        check(q.where === place.join(' · ') && q.sec && q.maps === 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place.join(', ')),
          `${slug}: tempat di pita atas dan bagian Tempat dengan link Maps (${JSON.stringify([q.where, q.maps])})`);
        check(q.facts === 'per,jam' && q.best === 'Regular 16' && q.per === 'Rp 90.000 / sesi', `${slug}: ringkasan (harga per sesi, jam kosong) dan "Paling hemat" (${JSON.stringify(q)})`);
        check(q.nav === 'Profil,Tempat,Jadwal,Paket', `${slug}: menu bagian Profil · Tempat · Jadwal · Paket`);
        check(await page.evaluate(() => { const y = id => document.getElementById(id).getBoundingClientRect().top; return y('profil') < y('tempat') && y('tempat') < y('jadwal') && y('jadwal') < y('paket'); }),
          `${slug}: di HP Jadwal tampil sebelum Paket`);
        const strip = await page.evaluate(() => { const b = [...document.querySelectorAll('#slots .day')]; const on = b.findIndex(x => x.getAttribute('aria-pressed') === 'true');
          const other = b.findIndex((x, i) => i !== on); return { on, other, n: b.length, hours: document.querySelectorAll('#pick .hr').length }; });
        await page.click(`#slots .day[data-i="${strip.other}"]`);
        const after = await page.evaluate(() => ({ on: [...document.querySelectorAll('#slots .day')].findIndex(x => x.getAttribute('aria-pressed') === 'true'), head: document.querySelector('#pick .dh').textContent,
          link: (document.querySelector('#pick .hr') || { getAttribute: () => '' }).getAttribute('href') }));
        check(strip.n === 7 && strip.on >= 0 && after.on === strip.other && !!after.head, `${slug}: deret 7 hari, ketuk hari lain → jam hari itu (${JSON.stringify([strip, after])})`);
        check(after.link === '' || after.link === '/' + slug + '/klien/', `${slug}: jam kosong → portal klien`);
        await page.click('.sec-nav a[data-sec="paket"]');
        await page.waitForTimeout(700);
        check(await page.evaluate(() => { const r = document.getElementById('paket').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight / 2; }), `${slug}: menu bagian Paket menggulir ke paket`);
        for (const [w, h] of [[360, 740], [390, 844], [430, 932], [1280, 800], [1920, 1080]]) {
          await page.setViewportSize({ width: w, height: h });
          await page.waitForTimeout(150);
          const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth,
            small: [...document.querySelectorAll('a.btn, button, a.hr')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).length,
            bar: getComputedStyle(document.querySelector('.bar')).display }));
          check(m.sw <= w && m.small === 0 && (w < 900 ? m.bar !== 'none' : m.bar === 'none'), `${slug} info ${w}×${h}: tanpa scroll ke samping, tombol ≥ 44 px, tombol bawah ${w < 900 ? 'tampil' : 'diganti tombol atas'} (${JSON.stringify(m)})`);
          if (w >= 900) {
            // Pita atas tanpa bidang kosong di kanan (kotak jam kosong terdekat), Jadwal di kolom kanan sejajar Profil.
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            await page.waitForTimeout(100);
            const d = await page.evaluate(() => { const hs = document.getElementById('hero-side'), r = hs.getBoundingClientRect(), wr = document.querySelector('.hero .wrap').getBoundingClientRect();
              const j = document.getElementById('jadwal').getBoundingClientRect(), p = document.getElementById('profil').getBoundingClientRect();
              return { side: getComputedStyle(hs).display !== 'none' && r.width > 150, right: Math.round(wr.right - r.right), next: document.getElementById('hs-next').textContent,
                col: j.left > p.right && Math.abs(j.top - p.top) < 4 }; });
            check(d.side && d.right < 40 && /\d\d\.00|Belum ada/.test(d.next) && d.col, `${slug} info ${w}×${h}: kotak kanan pita atas (jam terdekat), Jadwal di kolom kanan (${JSON.stringify(d)})`);
          }
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
      check(await p.isVisible('#view-public-login .xnk-by'), 'layar masuk portal: tanda kecil "Didukung XNK" tampil (T-2257)');
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

    console.log('Hub · ganti slug (T-2243)');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      const p = await open(context, O + '/claudia-2/klien/', errors);
      await p.waitForSelector('#login-phone', { state: 'visible', timeout: 8000 }).catch(() => {});
      await p.fill('#login-phone', '82222222222');
      await p.click('#login-submit-btn');
      await p.waitForTimeout(1800);
      check((await p.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.name)) === 'Bima', 'sebelum ganti slug: klien claudia-2 masuk di /claudia-2/klien/');
      await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      // Pemilik mengganti slug (Hub XNK aksi ganti-slug) dan situs baru tayang.
      const renamed = hubEdit(cfg, 'ganti-slug', { slug: 'claudia-2', newSlug: 'dua' }, { baseDir: logoDir }).cfg;
      state.files = hub.build(renamed, { baseDir: logoDir }).files;
      await p.goto(O + '/claudia-2/klien/?x=1#y', { waitUntil: 'domcontentloaded' });
      await p.waitForURL('**/dua/klien/**', { timeout: 8000 }).catch(() => {});
      check(p.url() === O + '/dua/klien/?x=1#y', 'link lama /claudia-2/klien/?x=1#y mendarat di /dua/klien/?x=1#y (' + p.url() + ')');
      await p.waitForFunction(() => window.publicLoggedMember && window.publicLoggedMember.name, null, { timeout: 10000 }).catch(() => {});
      check((await p.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.name)) === 'Bima', 'token yang disimpan sebelum ganti slug tetap terbaca: klien tetap masuk');
      const keys = await p.evaluate(() => Object.keys(localStorage));
      check(keys.length > 0 && keys.every(k => k.startsWith('claudia-2:')), 'kunci penyimpanan tetap berawalan claudia-2: ' + keys.slice(0, 3).join(', '));
      check((await p.title()).includes('Claudia Dua'), 'alamat baru tetap halaman coach yang sama');
      await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.includes('/dua/klien/'), null, { timeout: 10000 }).catch(() => {});
      // Worker lama di /claudia-2/klien/ diperbarui jadi worker pengganti.
      await p.evaluate(() => navigator.serviceWorker.getRegistration('/claudia-2/klien/').then(r => r && r.update()).catch(() => {}));
      await p.waitForTimeout(1500);
      for (const [from, to] of [['/claudia-2/', '/dua/'], ['/claudia-2/info/', '/dua/info/']]) {
        const q = await open(context, O + from, errors);
        await q.waitForURL('**' + to, { timeout: 8000 }).catch(() => {});
        check(q.url() === O + to, from + ' → ' + to + ' (' + q.url() + ')');
        await q.close();
      }
      const home = await open(context, O + '/', errors);
      await home.waitForURL('**/dua/klien/', { timeout: 5000 }).catch(() => {});
      check(home.url() === O + '/dua/klien/', 'xnk.web.id dengan login berawalan lama langsung ke /dua/klien/ (' + home.url() + ')');
      await home.close();
      context.__down = true;
      await context.setOffline(true);
      await p.goto(O + '/claudia-2/klien/', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await p.waitForTimeout(2500);
      check(p.url().startsWith(O + '/dua/klien/') && (await p.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.name).catch(() => '')) === 'Bima', 'tanpa sinyal: link lama dialihkan worker pengganti, portal terbuka dari salinan (' + p.url() + ')');
      await context.setOffline(false);
      check(errors.length === 0, 'tanpa error JavaScript / CSP' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await context.close();
    }

    console.log('Hub · coach keluar (T-2252)');
    {
      const seen = [], errors = [];
      const context = await newContext(browser, be, seen);
      // Situs sebelum coach keluar (setelah ganti slug di atas): claudia aktif, klien masuk, worker portal terpasang.
      const before = hubEdit(cfg, 'ganti-slug', { slug: 'claudia-2', newSlug: 'dua' }, { baseDir: logoDir }).cfg;
      state.files = hub.build(before, { baseDir: logoDir }).files;
      const p = await open(context, O + '/claudia/klien/', errors);
      await p.waitForSelector('#login-phone', { state: 'visible', timeout: 8000 }).catch(() => {});
      await p.fill('#login-phone', '81111111111');
      await p.click('#login-submit-btn');
      await p.waitForTimeout(1800);
      await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      const panel = await open(context, O + '/claudia/', errors);
      await panel.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      await panel.close();
      const pre = await p.evaluate(() => caches.keys());
      check((await p.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.name)) === 'Ani' && pre.some(n => n.startsWith('xnk-page-claudia~klien~')) && pre.some(n => n.startsWith('xnk-page-claudia~panel~')),
        'sebelum keluar: klien claudia masuk, cache panel + portal claudia ada');
      // Pemilik: Coach keluar → Hub XNK aksi nonaktif → situs baru tayang.
      const off = hubEdit(before, 'nonaktif', { slug: 'claudia' }, { baseDir: logoDir }).cfg;
      state.files = hub.build(off, { baseDir: logoDir }).files;
      await p.goto(O + '/claudia/klien/', { waitUntil: 'domcontentloaded' });
      await p.evaluate(() => navigator.serviceWorker.getRegistration('/claudia/klien/').then(r => r && r.update()).catch(() => {}));
      await p.waitForFunction(() => /Situs coach ini tidak aktif lagi/.test(document.body ? document.body.innerText : ''), null, { timeout: 15000 }).catch(() => {});
      check(/Situs coach ini tidak aktif lagi/.test(await p.evaluate(() => document.body.innerText)), 'worker portal lama tidak menyajikan aplikasi lagi: /claudia/klien/ = halaman "tidak aktif lagi"');
      await p.waitForTimeout(1500);
      for (const sub of ['', 'info/']) {
        const q = await open(context, O + '/claudia/' + sub, errors);
        await q.waitForFunction(() => /Situs coach ini tidak aktif lagi/.test(document.body ? document.body.innerText : ''), null, { timeout: 15000 }).catch(() => {});
        check(/Situs coach ini tidak aktif lagi/.test(await q.evaluate(() => document.body.innerText)) && await q.isVisible('a[href="https://wa.me/6281234567890"]'), '/claudia/' + sub + ' = halaman "tidak aktif lagi" dengan kontak pengelola');
        check(await q.evaluate(() => !window.adminCall && !document.querySelector('#admin-pin, #login-phone')), '/claudia/' + sub + ': tanpa aplikasi');
        await q.close();
      }
      await p.waitForTimeout(1500);
      const left = await p.evaluate(() => caches.keys());
      check(!left.some(n => /^xnk-page-claudia~(klien|panel)~/.test(n)), 'cache halaman panel + portal claudia dihapus worker pembersih: ' + (left.filter(n => n.startsWith('xnk-page')).join(', ') || 'kosong'));
      const regs = await p.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => new URL(r.scope).pathname)));
      check(!regs.some(s => s.startsWith('/claudia/')), 'service worker di /claudia/ dilepas: ' + regs.join(', '));
      const home = await open(context, O + '/', errors);
      await home.waitForTimeout(800);
      check(home.url() === O + '/' && await home.locator('a.coach[href="/claudia/info/"]').count() === 0, 'halaman depan: login klien claudia tidak membuka situs tidak aktif, kartu claudia hilang (' + home.url() + ')');
      await home.close();
      const other = await open(context, O + '/dua/klien/', errors);
      check(await other.waitForSelector('#login-phone', { state: 'visible', timeout: 8000 }).then(() => true, () => false), 'coach lain (/dua/klien/) tetap jalan');
      await other.close();
      check(errors.length === 0, 'tanpa error JavaScript / CSP' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
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
