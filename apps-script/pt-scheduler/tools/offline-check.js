#!/usr/bin/env node
// Pemeriksaan layar "Catat offline" di halaman pembungkus (Tahap 2).
// Pakai: NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/offline-check.js [folder BookingPT-Client]
// Menyajikan pembungkus coach (root XNK) dan, bila diberi, pembungkus klien di http://localhost, memasang service worker,
// lalu membuka lagi tanpa sinyal. Aplikasi Apps Script tidak dimuat: pesan jembatan dikirim langsung ke offline.js.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const XNK = path.resolve(__dirname, '../../..');
const CLIENT = process.argv[2] ? path.resolve(process.argv[2]) : null;
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const FOODS = fs.readFileSync(path.join(XNK, 'foods/foods.min.json'));
const EXS = fs.readFileSync(path.join(XNK, 'exercises/exercises.min.json'));

function serve(dir) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    srv.listen(0, () => resolve(srv));
  });
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

async function openWrapper(browser, dir) {
  const srv = await serve(dir);
  const base = 'http://localhost:' + srv.address().port;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Aplikasi Apps Script dan pustaka di xnk.my.id: tidak ke internet.
  // Aplikasi Apps Script tidak pernah selesai dimuat (lambat): service worker tetap harus terpasang.
  await context.route(/script\.google(usercontent)?\.com/, () => {});
  await context.route(/xnk\.my\.id\/foods\//, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: FOODS }));
  await context.route(/xnk\.my\.id\/exercises\//, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: EXS }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
  return { srv, base, context, page, errors };
}
// Pesan jembatan seperti dari aplikasi; balasan offline.js ditangkap di window.__replies.
const bridge = (page, data) => page.evaluate(d => {
  window.__replies = window.__replies || [];
  window.XNKOffline.message({ data: d, origin: 'https://n-x.script.googleusercontent.com', source: { postMessage: m => window.__replies.push(m) } });
}, data);

(async () => {
  const browser = await chromium.launch();
  const day = today();

  console.log('Pembungkus coach (xnk.my.id) · tanpa sinyal');
  {
    const w = await openWrapper(browser, XNK);
    check(await w.page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
    const start = new Date(Date.now() + 3600000).toISOString();
    await bridge(w.page, { xnk: 'offline-snap', snap: { mode: 'coach', sig: 'S1', at: Date.now(), today: [{ id: 'SCH-1', memberId: 'PT-A', name: 'Ani', start: start }],
      clients: { 'PT-A': { name: 'Ani', routines: [{ hari: 'Hari A', items: [{ gerakan: 'Squat', exId: '' }] }], last: { 'nm:squat': { sets: [{ berat: 40, rep: 8 }] } }, measures: [{ tanggal: '2026-10-01', berat: 70 }] } } } });
    await w.context.setOffline(true);
    await w.page.reload({ waitUntil: 'domcontentloaded' });
    await w.page.waitForTimeout(800);
    check(await w.page.isVisible('#xoff'), 'offline: the wrapper opens straight into "Catat offline"');
    check((await w.page.textContent('#xoff')).includes('Ani'), 'offline: today\'s schedule comes from the saved copy');
    await w.page.click('#xoff [data-act="client"][data-id="PT-A"]');
    await w.page.click('#xoff [data-act="wl-start"][data-r="0"]');
    check((await w.page.inputValue('#xoff [data-set="0:0:berat"]')) === '40', 'workout: sets start from last time');
    await w.page.check('#xoff [data-set="0:0:done"]');
    await w.page.click('#xoff [data-act="wl-finish"]');
    await w.page.click('#xoff [data-tab="ukuran"]');
    await w.page.fill('#xoff-m-berat', '69.5');
    await w.page.click('#xoff [data-act="measure-save"]');
    await w.page.click('#xoff [data-tab="catatan"]');
    await w.page.fill('#xoff-n-dilatih-SCH-1', 'Kaki');
    await w.page.click('#xoff [data-act="note-save"]');
    const q = await w.page.evaluate(() => JSON.parse(localStorage.getItem('xnk_off_queue') || '[]'));
    const wl = q.find(x => x.kind === 'wl'), ms = q.find(x => x.kind === 'measure'), nt = q.find(x => x.kind === 'note');
    check(q.length === 3 && q.every(x => x.sig === 'S1'), 'queue: three notes, all tagged with the account signature');
    check(wl && wl.memberId === 'PT-A' && wl.date === day && wl.entries[0].gerakan === 'Squat' && wl.entries[0].sets[0].berat === 40 && wl.session.cid === wl.id, 'queue: the workout has the app\'s queue shape (entries, session.cid)');
    check(ms && ms.data.berat === '69.5' && ms.data.tanggal === day && nt && nt.scheduleId === 'SCH-1' && nt.data.dilatih === 'Kaki', 'queue: measurement and session note carry what the server needs');
    check(await w.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no sideways scroll');
    await w.context.setOffline(false);
    await bridge(w.page, { xnk: 'offline-queue?' });
    const rep = await w.page.evaluate(() => window.__replies.find(m => m.xnk === 'offline-queue'));
    check(rep && rep.items.length === 3, 'bridge: the app gets the queue when it asks');
    await bridge(w.page, { xnk: 'offline-ack', ids: rep.items.map(x => x.id) });
    check(!(await w.page.evaluate(() => localStorage.getItem('xnk_off_queue'))), 'bridge: acknowledged notes leave the wrapper');
    await bridge(w.page, { xnk: 'offline-clear' });
    check(!(await w.page.evaluate(() => localStorage.getItem('xnk_off_snap'))), 'logout: the saved copy is removed');
    check(!w.errors.length, 'no page errors ' + w.errors.join('; '));
    await w.context.close(); w.srv.close();
  }

  if (CLIENT) {
    console.log('Pembungkus klien (book.xnkbooking.my.id) · tanpa sinyal');
    const w = await openWrapper(browser, CLIENT);
    await bridge(w.page, { xnk: 'offline-snap', snap: { mode: 'client', sig: 'M1', at: Date.now(), name: 'Ani', sisa: 5,
      sessions: [{ start: new Date(Date.now() + 86400000).toISOString(), coach: 'Rizky' }], routines: [{ hari: 'Hari A', items: [{ gerakan: 'Bench press', exId: '' }] }], last: {},
      target: { kal: 1800 }, log: { tanggal: day, items: [{ nama: 'Nasi', porsi: '1 piring', kal: 360, waktu: 'siang' }] }, measures: [{ tanggal: '2026-10-01', berat: 71 }, { tanggal: '2026-10-20', berat: 70 }] } });
    await w.context.setOffline(true);
    await w.page.reload({ waitUntil: 'domcontentloaded' });
    await w.page.waitForTimeout(800);
    check(await w.page.isVisible('#xoff'), 'offline: the client wrapper opens into "Catat offline"');
    await w.page.click('#xoff [data-tab="makan"]');
    check((await w.page.textContent('#xoff')).includes('Nasi') && (await w.page.textContent('#xoff')).includes('target 1800'), 'food: today\'s log and target come from the copy');
    await w.page.click('#xoff [data-act="food-add"][data-w="sarapan"]');
    await w.page.waitForTimeout(400);
    check((await w.page.locator('#xoff [data-act="food-pick"]').count()) > 0, 'food: the food list works offline (service worker cache)');
    await w.page.click('#xoff [data-act="food-pick"] >> nth=0');
    await w.page.fill('#xoff-gram', '100');
    await w.page.click('#xoff [data-act="food-pick-save"]');
    check((await w.page.textContent('#xoff')).includes('belum terkirim'), 'food: the new entry shows as not sent yet');
    await w.page.click('#xoff [data-tab="jadwal"]');
    check((await w.page.textContent('#xoff')).includes('Rizky') && (await w.page.textContent('#xoff')).includes('5'), 'schedule: upcoming sessions and sessions left, read-only');
    await w.page.click('#xoff [data-tab="progres"]');
    check((await w.page.textContent('#xoff')).includes('-1'), 'progress: last measurement with the change');
    const q = await w.page.evaluate(() => JSON.parse(localStorage.getItem('xnk_off_queue') || '[]'));
    check(q.length === 1 && q[0].kind === 'food' && q[0].entry.cid === q[0].id && q[0].entry.tanggal === day && q[0].entry.gram === 100 && q[0].view.kal > 0, 'queue: the food entry has cid, date and the computed calories');
    check(!w.errors.length, 'no page errors ' + w.errors.join('; '));
    await w.context.close(); w.srv.close();
  } else console.log('(lewati pembungkus klien: beri path ke clone BookingPT-Client)');

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll offline checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
