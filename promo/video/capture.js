#!/usr/bin/env node
// Screenshots of the real app (Index.html, panel + portal) with invented demo data, for the ad.
// Same offline bridge as apps-script/pt-scheduler/tools/browser-check.js: google.script.run calls
// the real src/*.gs code in the Node test harness. Light theme, 390 × 808 CSS px at 2×
// (the phone in ad.html adds its own 44 px status bar on top).
//
//   NODE_PATH=$(npm root -g) node promo/video/capture.js --lucide <lucide.min.js> [--out promo/video/ui]
//
// lucide.min.js: `npm pack lucide@1.48.0` (the version Index.html loads) and take package/dist/umd/.
// All names, numbers and phone numbers below are made up.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps-script', 'pt-scheduler');
const SRC = path.join(APP, 'src');
const { seededEnv, KEY_A } = require(path.join(APP, 'tests', 'fixtures'));

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const LUCIDE = opt('--lucide', '');
const OUT = path.resolve(opt('--out', path.join(__dirname, 'ui')));
const ORIGIN = 'https://gas.test';
const VIEW = { width: 390, height: 808 };
if (!LUCIDE || !fs.existsSync(LUCIDE)) { console.error('need --lucide <path to lucide.min.js>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

function render(page) {
  const read = f => fs.readFileSync(path.join(SRC, f.endsWith('.html') ? f : f + '.html'), 'utf8');
  return read(page).replace(/<\?!=\s*include\('([^']+)'\)\s*\?>/g, (_, f) => read(f));
}
// Runs in the page before the app: google.script.* → window.__gasCall (same as browser-check.js).
function gasShim() {
  const params = {};
  new URLSearchParams(location.search).forEach((v, k) => { params[k] = v; });
  const makeRunner = (ok, fail) => new Proxy({}, {
    get(_, prop) {
      if (prop === 'withSuccessHandler') return fn => makeRunner(fn, fail);
      if (prop === 'withFailureHandler') return fn => makeRunner(ok, fn);
      if (prop === 'withUserObject') return () => makeRunner(ok, fail);
      return (...a) => {
        window.__gasCall(prop, JSON.stringify(a)).then(raw => {
          const res = JSON.parse(raw);
          if (res.ok) { if (ok) ok(res.value); } else if (fail) fail(new Error(res.error));
        });
      };
    },
  });
  window.google = { script: { run: makeRunner(null, null), url: { getLocation: cb => setTimeout(() => cb({ parameter: params, hash: '' }), 0) } } };
  window.open = url => ({ location: { href: url || '' }, closed: false, close() {} });
}

/* ------------------------------------------------------------------ demo data */
const pad = n => String(n).padStart(2, '0');
const wibDay = d => new Date(Date.now() + d * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const wibAt = (d, h, m = 0) => new Date(`${wibDay(d)}T${pad(h)}:${pad(m)}:00+07:00`).toISOString();
const plusH = (iso, h) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();

const CLIENTS = [ // name, phone, goal
  ['Dimas Pratama', '081300000011', 'Strength'], ['Maya Kusuma', '081300000012', 'Weight Loss'],
  ['Yoga Tirta', '081300000013', 'Muscle Gain'], ['Nadia Putri', '081300000014', 'Weight Loss'],
  ['Fajar Aditya', '081300000015', 'General'], ['Hendra Rahman', '081300000016', 'Strength'],
];

function demoEnv() {
  const env = seededEnv();
  const md = env.sheet('MemberData').rows;
  const rename = { 'PT-A': 'Rina Saraswati', 'PT-B': 'Budi Hartono', 'PT-C': 'Sari Wulandari' };
  md.forEach(r => { if (rename[r[0]]) r[1] = rename[r[0]]; });
  env.sheet('Schedules').rows.forEach(r => { if (rename[r[1]]) r[2] = rename[r[1]]; });
  const pl = env.sheet('PriceList').rows;
  pl.forEach(r => { if (r[0] === 'P1') { r[1] = 'Regular 12'; r[3] = 1800000; r[4] = 12; } if (r[0] === 'P2') r[1] = 'Premium Flex'; });
  const rina = env.memberRow('PT-A'); rina[8] = 12; rina[9] = 7; rina[10] = 'C-1'; rina[11] = 'Rizky';
  const t = env.adminToken();
  env.call('updateAppSettings', t, { finance: { enabled: true } });
  for (const [name, phone, goal] of CLIENTS) env.call('addMember', t, { name, phone, goal, packageId: 'P1' });
  const ids = env.sheet('MemberData').rows.slice(1).map(r => [r[0], r[1], r[2]]);
  const byName = n => ids.find(r => r[1] === n);

  // Schedules: a full today, the rest of the week, and Rina's history (3× a week for 8 weeks).
  const rows = env.sheet('Schedules').rows;
  rows.splice(1);
  let n = 0;
  const add = (who, start, notes, status, done) => {
    const [id, name, phone] = byName(who);
    rows.push(['SCH-D' + (++n), id, name, phone, start, plusH(start, 1), notes, status, 'C-1', 'Rizky', done ? plusH(start, 1) : '', '']);
  };
  const nowH = +new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false });
  const today = [[6, 'Budi Hartono', 'Upper body'], [7, 'Rina Saraswati', 'Push day'], [8, 'Maya Kusuma', 'Cardio + core'],
    [16, 'Dimas Pratama', 'Leg day'], [17, 'Nadia Putri', 'Full body'], [18, 'Yoga Tirta', 'Pull day'], [19, 'Hendra Rahman', 'Mobility']];
  today.forEach(([h, who, notes]) => add(who, wibAt(0, h), notes, h < nowH ? 'completed' : 'read', h < nowH));
  const week = [[1, 7, 'Rina Saraswati'], [1, 16, 'Budi Hartono'], [1, 18, 'Maya Kusuma'], [2, 6, 'Dimas Pratama'], [2, 17, 'Yoga Tirta'],
    [3, 7, 'Rina Saraswati'], [3, 8, 'Nadia Putri'], [3, 16, 'Fajar Aditya'], [3, 19, 'Hendra Rahman'], [4, 17, 'Budi Hartono'], [5, 9, 'Maya Kusuma']];
  week.forEach(([d, h, who]) => add(who, wibAt(d, h), '', d === 1 ? 'unread' : 'read'));
  for (let w = 1; w <= 8; w++) for (const off of [0, 2, 4]) add('Rina Saraswati', wibAt(-w * 7 + off, 7), 'Latihan', 'completed', true);
  for (let d = 1; d <= 20; d++) add(CLIENTS[d % CLIENTS.length][0], wibAt(-d, [6, 8, 16, 17, 18][d % 5]), '', 'completed', true);

  // Rina: weight 78.4 → 74.2 over eight weeks, waist 86 → 80.
  const W = [78.4, 78.0, 77.1, 76.9, 76.0, 75.4, 74.9, 74.2];
  W.forEach((b, k) => env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: wibDay(-(7 - k) * 7 - 1), berat: b, pinggang: 86 - k * 0.85 }));
  // Program + workout history (bench press climbing to 80 kg).
  env.call('saveMemberProgram', t, 'PT-A', '# Push Day\nBench Press | 4x5\nIncline DB Press | 3x10\nShoulder Press | 3x10\nTricep Pushdown | 3x12\n\n# Leg Day\nSquat | 4x8\nRomanian Deadlift | 3x10\nLeg Press | 3x12\n\n# Pull Day\nLat Pulldown | 4x10\nSeated Row | 3x10');
  [60, 65, 70, 72.5, 75, 77.5].forEach((kg, k) => {
    env.call('saveWorkoutLog', t, 'PT-A', wibDay(-(6 - k) * 7 - 3), '', [
      { gerakan: 'Bench Press', sets: [{ berat: kg - 20, rep: 10 }, { berat: kg - 10, rep: 8 }, { berat: kg - 5, rep: 6 }, { berat: kg, rep: 5 }] },
      { gerakan: 'Incline DB Press', sets: [{ berat: 18, rep: 10 }, { berat: 20, rep: 10 }, { berat: 20, rep: 9 }] },
      { gerakan: 'Shoulder Press', sets: [{ berat: 30, rep: 10 }, { berat: 32.5, rep: 9 }, { berat: 32.5, rep: 8 }] },
    ]);
  });
  // Nutrition: profile + today's food.
  env.call('saveClientNutrition', t, 'PT-A', { tinggi: 165, jk: 'p', goal: 'turun', umur: 29, anggaran: 'standar', pantangan: [], kondisi: [] });
  const mt = env.memberToken(KEY_A);
  [['sarapan', 'Oat, telur rebus, pisang', 380, 22, 9, 52], ['siang', 'Nasi, ayam bakar, sayur asem', 540, 38, 14, 62], ['camilan', 'Yogurt + almond', 190, 12, 9, 14]]
    .forEach(([waktu, nama, kal, p, l, k]) => { try { env.call('logMyFood', mt, { waktu, custom: { nama, kal, p, l, k }, jumlah: 1 }); } catch (e) { console.warn('logMyFood', waktu, e.message); } });

  // Finance: pay most of the new bills, and six months of income.
  const bills = env.call('getBills', t, {});
  bills.forEach((b, k) => {
    const amount = k % 4 === 3 ? 800000 : b.total;
    try { env.call('savePayment', t, { billId: b.id, amount, date: wibDay(-k), method: k % 2 ? 'Tunai' : 'Transfer bank' }); } catch (e) { console.warn('pay', e.message); }
  });
  const month = (back, day) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`; };
  [[5, 6200000], [4, 7400000], [3, 7100000], [2, 9300000], [1, 10800000]].forEach(([back, total]) => {
    for (let k = 0; k < 4; k++) env.call('savePayment', t, { amount: Math.round(total / 4 / 1000) * 1000, date: month(back, 3 + k * 6), method: 'Transfer bank', category: 'Sesi satuan' });
    try { env.call('saveExpense', t, { amount: 1500000, date: month(back, 5), category: 'Sewa tempat', method: 'Transfer bank' }); } catch (e) { console.warn('expense', e.message); }
  });
  return env;
}

/* ------------------------------------------------------------------ browser */
async function open(browser, env, url) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, colorScheme: 'light', hasTouch: true, isMobile: true, timezoneId: 'Asia/Jakarta' });
  await ctx.addInitScript(() => { localStorage.setItem('xnk_theme', 'light'); localStorage.setItem('xnk_a2hs', '1'); });
  await ctx.exposeFunction('__gasCall', async (name, a) => {
    try { return JSON.stringify({ ok: true, value: env.call(name, ...JSON.parse(a)) }); } catch (e) { return JSON.stringify({ ok: false, error: e.message }); }
  });
  await ctx.addInitScript(gasShim);
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(ORIGIN)) return route.fulfill({ contentType: 'text/html', body: render(new URL(u).pathname.replace('/', '') || 'Index') });
    if (u.includes('unpkg.com/lucide')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(LUCIDE) });
    if (u.includes('cdn.tailwindcss.com')) return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind={};' });
    if (u.includes('fullcalendar')) return route.fulfill({ contentType: 'application/javascript', body: 'window.FullCalendar={Calendar:function(){this.render=function(){};this.destroy=function(){};}};' });
    for (const lib of ['exercises/exercises.min.json', 'foods/foods.min.json']) {
      if (u.includes(lib)) return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(ROOT, lib)) });
    }
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.warn('page error:', e.message));
  await page.goto(ORIGIN + url);
  await page.waitForTimeout(1200);
  return { page, ctx };
}
const wait = (page, ms = 700) => page.waitForTimeout(ms);
const rects = {};
async function snap(page, name) {
  await wait(page, 700);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('  ' + name);
}
async function rect(page, name, sel) {
  const r = await page.locator(sel).first().boundingBox();
  if (r) rects[name] = { x: r.x / VIEW.width, y: r.y / VIEW.height, w: r.width / VIEW.width, h: r.height / VIEW.height };
}
const closeSheets = page => page.evaluate(() => { const b = document.getElementById('sheet-badge'); if (b && !b.classList.contains('hide') && window.closeModal) window.closeModal(); });

(async () => {
  const env = demoEnv();
  const browser = await chromium.launch();

  console.log('panel');
  {
    const { page, ctx } = await open(browser, env, '/Index');
    await page.evaluate(tok => { localStorage.setItem('xnk_admin_token', tok); }, env.adminToken());
    await page.reload(); await wait(page, 1800);
    await snap(page, 'coach-dashboard');
    await page.evaluate(() => window.navigate('calendar')); await wait(page, 900);
    await snap(page, 'coach-jadwal');
    await page.evaluate(() => { const s = document.getElementById('main-scroll-area'); if (s) s.scrollTop = 420; }); await wait(page, 400);
    await snap(page, 'coach-jadwal-today');
    await page.evaluate(() => { const s = document.getElementById('main-scroll-area'); if (s) s.scrollTop = 0; window.navigate('clients'); }); await wait(page, 900);
    await snap(page, 'coach-klien');
    await page.evaluate(() => window.openProfile('PT-A')); await wait(page, 1200);
    await snap(page, 'coach-client');
    await page.evaluate(() => window.cpTab('progres')); await wait(page, 900);
    await snap(page, 'coach-client-progres');
    await page.evaluate(() => { window.cpTab('ringkasan'); window.closeDetail(); window.navigate('finance'); }); await wait(page, 1200);
    await snap(page, 'coach-keuangan');
    await page.evaluate(() => { const s = document.getElementById('main-scroll-area'); if (s) s.scrollTop = 460; }); await wait(page, 400);
    await snap(page, 'coach-keuangan-2');
    await ctx.close();
  }

  console.log('portal');
  {
    const { page, ctx } = await open(browser, env, '/Index?view=public');
    await page.fill('#login-phone', '81111111111');
    await page.click('#login-submit-btn'); await wait(page, 1800);
    await closeSheets(page); await wait(page, 3500);
    await snap(page, 'client-beranda');
    // booking: Jadwal tab → a day → a free hour → the booking sheet
    await page.evaluate(() => window.navigate('calendar')); await wait(page, 700);
    await page.evaluate(d => window.selectDate(d), wibDay(3)); await wait(page, 700);
    await snap(page, 'client-jadwal');
    await rect(page, 'slot', '#day-panel .slot:not([disabled])');
    await page.locator('#day-panel .slot:not([disabled])').first().click(); await wait(page, 700);
    await page.fill('#edit-sch-notes', 'Leg day');
    await snap(page, 'client-booking');
    await rect(page, 'kirim', '#modal-edit-schedule .btn-primary');
    await page.locator('#modal-edit-schedule .btn-primary').first().click(); await wait(page, 900);
    await snap(page, 'client-booked');
    await page.evaluate(() => window.closeModal && window.closeModal()); await wait(page, 500);
    // Latihan, Makan, Progres (before the workout, so no draft bar shows)
    await page.evaluate(() => window.navigate('public-program')); await wait(page, 1000);
    await snap(page, 'client-latihan');
    // Makan
    await page.evaluate(() => { window.setLatSeg && window.setLatSeg('makan'); const s = document.getElementById('main-scroll-area'); if (s) s.scrollTop = 0; }); await wait(page, 1200);
    await snap(page, 'client-makan');
    await page.evaluate(() => { const s = document.getElementById('main-scroll-area'); if (s) s.scrollTop = 520; }); await wait(page, 400);
    await snap(page, 'client-makan-2');
    await page.evaluate(() => { const s = document.getElementById('main-scroll-area'); if (s) s.scrollTop = 0; window.setLatSeg && window.setLatSeg('latihan'); window.navigate('public-progress'); }); await wait(page, 1200);
    await snap(page, 'client-progres');
    // Latihan → Push Day → live workout, one set at a time
    await page.evaluate(() => { window.navigate('public-program'); const s = document.getElementById('main-scroll-area'); if (s) s.scrollTop = 0; }); await wait(page, 1000);
    await page.locator('#pub-program-wrap .rt-card >> nth=0 >> .rt-go').click(); await wait(page, 1200);
    const sets = [[60, 10], [70, 8], [75, 6], [80, 5]];
    for (let j = 0; j < 4; j++) {
      await page.fill(`#wl-screen .wl-ex >> nth=0 >> .wl-in[data-j="${j}"][data-f="berat"]`, String(sets[j][0])).catch(() => {});
      await page.fill(`#wl-screen .wl-ex >> nth=0 >> .wl-in[data-j="${j}"][data-f="rep"]`, String(sets[j][1])).catch(() => {});
    }
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await snap(page, 'client-workout-0');
    for (let j = 0; j < 4; j++) {
      await rect(page, 'tick' + j, `#wl-screen .wl-ck >> nth=${j}`);
      await page.click(`#wl-screen .wl-ck >> nth=${j}`); await wait(page, 300);
      await snap(page, 'client-workout-' + (j + 1));
    }
    // the app scrolls on to the next exercise after the last set; scroll back while the PR toast is still up
    await page.evaluate(() => { const b = document.getElementById('wl-body'); if (b) b.scrollTop = 0; });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, 'client-workout-pr.png') });
    await page.click('#wl-screen .wl-top .icon-btn').catch(() => {}); await wait(page, 600);
    await ctx.close();
  }
  // tap targets (fractions of the screen) for ad.html, which loads this as a plain script
  fs.writeFileSync(path.join(OUT, 'rects.js'), 'window.UI_RECTS = ' + JSON.stringify(rects, null, 1) + ';\n');
  await browser.close();
  console.log('saved in', OUT);
})();
