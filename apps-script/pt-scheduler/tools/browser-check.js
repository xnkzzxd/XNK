#!/usr/bin/env node
// End-to-end check of the real Index.html (panel PT, portal klien) and Landing.html
// (xnkbooking.my.id: phone & desktop layouts, animations, WebGL, flows) in headless Chromium.
// google.script.run is bridged to the real server code (src/*.gs) running in
// the Node test harness, so this runs fully offline. Not part of CI (needs
// Playwright + Chromium):
//
//   NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/browser-check.js
//
// Optional:
//   ASSETS_DIR=dir  use real lucide.min.js, fullcalendar.global.min.js,
//                   cropper.min.js/.css, inter-latin-wght-normal.woff2, and for the
//                   Landing gsap.min.js, ScrollTrigger.min.js, SplitText.min.js,
//                   lenis.min.js, anton-latin-400-normal.woff2, hero-cutout.webp,
//                   hero-normal.webp from that folder instead of tiny stubs / empty
//                   responses (for realistic screenshots and the animated Landing)
//   SHOTS_DIR=dir   save screenshots of every main screen there
//   VIDEO_DIR=dir   record the Landing scroll-through (desktop + phone) as .webm
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { seededEnv, KEY_A, ADMIN_PIN, inDays } = require('../tests/fixtures');

const SRC = path.join(__dirname, '..', 'src');
const ORIGIN = 'https://gas.test';
const SHOTS = process.env.SHOTS_DIR || '';
const ASSETS = process.env.ASSETS_DIR || '';
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };

function render(page) {
  const read = f => fs.readFileSync(path.join(SRC, f.endsWith('.html') ? f : f + '.html'), 'utf8');
  return read(page).replace(/<\?!=\s*include\('([^']+)'\)\s*\?>/g, (_, f) => read(f));
}

const STUBS = {
  'cdn.tailwindcss.com': 'window.tailwind = window.tailwind || {};',
  'unpkg.com/lucide': 'window.lucide = { createIcons: function() {} };',
  'fullcalendar': `window.FullCalendar = { Calendar: function(el, opts) {
      window.__calendarOpts = opts; this.render = function() { el.setAttribute('data-fc', 'stub'); }; this.destroy = function() {}; } };`,
  'cropper.min.js': 'window.Cropper = function() { return { destroy: function() {}, getCroppedCanvas: function() { return document.createElement("canvas"); } }; };',
};
const REAL = {
  'unpkg.com/lucide': ['lucide.min.js', 'application/javascript'],
  'fullcalendar': ['fullcalendar.global.min.js', 'application/javascript'],
  'cropper.min.js': ['cropper.min.js', 'application/javascript'],
  'cropper.min.css': ['cropper.min.css', 'text/css'],
  'assets.test/inter.woff2': ['inter-latin-wght-normal.woff2', 'font/woff2'],
  'assets.test/anton.woff2': ['anton-latin-400-normal.woff2', 'font/woff2'],
  'dist/gsap.min.js': ['gsap.min.js', 'application/javascript'],
  'dist/ScrollTrigger.min.js': ['ScrollTrigger.min.js', 'application/javascript'],
  'dist/SplitText.min.js': ['SplitText.min.js', 'application/javascript'],
  'dist/lenis.min.js': ['lenis.min.js', 'application/javascript'],
  'xnkbooking.my.id/img/hero-cutout.webp': ['hero-cutout.webp', 'image/webp'],
  'xnkbooking.my.id/img/hero-normal.webp': ['hero-normal.webp', 'image/webp'],
};
const CDN_ANIMATION = ['dist/gsap.min.js', 'dist/ScrollTrigger.min.js', 'dist/SplitText.min.js', 'dist/lenis.min.js'];
const INTER_CSS = "@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(https://assets.test/inter.woff2) format('woff2');}" +
  "@font-face{font-family:'Anton';font-style:normal;font-weight:400;font-display:swap;src:url(https://assets.test/anton.woff2) format('woff2');}";

// Runs in the page before any app script: google.script.* bridge + window.open capture.
function gasShim() {
  const params = {};
  new URLSearchParams(location.search).forEach((v, k) => { params[k] = v; });
  const makeRunner = (ok, fail) => new Proxy({}, {
    get(_, prop) {
      if (prop === 'withSuccessHandler') return fn => makeRunner(fn, fail);
      if (prop === 'withFailureHandler') return fn => makeRunner(ok, fn);
      if (prop === 'withUserObject') return () => makeRunner(ok, fail);
      return (...args) => {
        window.__gasCall(prop, JSON.stringify(args)).then(raw => {
          const res = JSON.parse(raw);
          if (res.ok) { if (ok) ok(res.value); } else if (fail) fail(new Error(res.error));
        });
      };
    },
  });
  window.google = { script: {
    run: makeRunner(null, null),
    url: { getLocation: cb => setTimeout(() => cb({ parameter: params, hash: '' }), 0) },
  } };
  window.__opened = [];
  window.open = url => {
    const w = { location: { href: url || '' }, closed: false, close() { this.closed = true; } };
    window.__opened.push(w);
    return w;
  };
}

async function openPage(browser, env, pagePath, calls, storage, opts) {
  opts = opts || {};
  const context = await browser.newContext({
    viewport: opts.viewport || MOBILE, colorScheme: opts.colorScheme || 'light', reducedMotion: opts.reducedMotion || 'no-preference',
    hasTouch: !!opts.touch, isMobile: !!opts.touch,
    recordVideo: opts.video ? { dir: opts.video, size: opts.viewport || MOBILE } : undefined,
  });
  if (storage) await context.addInitScript(s => { for (const k in s) localStorage.setItem(k, s[k]); }, storage);
  await context.exposeFunction('__gasCall', (name, argsJson) => {
    calls.push(name);
    try {
      return JSON.stringify({ ok: true, value: env.call(name, ...JSON.parse(argsJson)) });
    } catch (e) {
      return JSON.stringify({ ok: false, error: e.message });
    }
  });
  await context.addInitScript(gasShim);
  const navigations = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (route.request().isNavigationRequest()) navigations.push(url);
    if (url.startsWith(ORIGIN)) {
      const page = new URL(url).pathname.replace('/', '') || 'Index';
      return route.fulfill({ contentType: 'text/html', body: render(page) });
    }
    if (opts.blockCdn && CDN_ANIMATION.some(k => url.includes(k))) return route.fulfill({ status: 404, body: '' });
    if (ASSETS) {
      if (url.includes('fonts.googleapis.com/css')) return route.fulfill({ contentType: 'text/css', body: INTER_CSS });
      const real = Object.keys(REAL).find(k => url.includes(k));
      if (real && fs.existsSync(path.join(ASSETS, REAL[real][0]))) {
        return route.fulfill({ contentType: REAL[real][1], headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(path.join(ASSETS, REAL[real][0])) });
      }
    }
    const stub = Object.keys(STUBS).find(k => url.includes(k));
    if (stub) return route.fulfill({ contentType: 'application/javascript', body: STUBS[stub] });
    return route.fulfill({ status: 204, body: '' }); // fonts, images, analytics
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(ORIGIN + pagePath);
  await page.waitForTimeout(opts.wait || 900);
  return { page, context, errors, navigations };
}

const visible = (page, sel) => page.locator(sel).first().isVisible();
async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(700); // let entrance animations finish
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function shownUrls(page, navigations) {
  const opened = await page.evaluate(() => window.__opened.map(w => w.location.href));
  return opened.concat(navigations).map(u => { try { return decodeURIComponent(u); } catch (e) { return u; } });
}
const noScriptGoogle = urls => !urls.some(u => u.includes('script.google'));
const noErrors = errors => check(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors.join(' | ') : ''));

// Extra seed so every dashboard block has something to show.
function richEnv() {
  const env = seededEnv();
  const at = (days, h, m) => { const d = new Date(Date.now() + days * 86400000); d.setHours(h, m || 0, 0, 0); return d.toISOString(); };
  const plusH = (iso, h) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();
  const rows = env.sheet('Schedules').rows;
  const add = (id, member, name, phone, start, notes, status, coach, coachName, completedAt) =>
    rows.push([id, member, name, phone, start, plusH(start, 1), notes, status, coach, coachName, completedAt || '', '']);
  add('SCH-T1', 'PT-B', 'Budi', '081222222222', at(0, 7), 'Upper body', 'completed', 'C-1', 'Rizky', at(0, 8));
  add('SCH-T2', 'PT-A', 'Ani Anggraini', '6281111111111', at(0, 17), 'Cardio', 'read', 'C-1', 'Rizky');
  add('SCH-T3', 'PT-C', 'Citra', '6283333333333', at(0, 19), '', 'unread', '', '');
  for (let i = 1; i <= 10; i++) add('SCH-H' + i, 'PT-A', 'Ani Anggraini', '6281111111111', at(-i * 3, 7 + (i % 3) * 5), '', 'completed', 'C-1', 'Rizky', at(-i * 3, 9));
  env.ss.seed('Members', [
    ['ID Transaksi', 'ID Member', 'Tanggal', 'Jenis', 'Paket ID', 'Nama Paket', 'Jumlah Sesi', 'Coach ID', 'Nama Coach', 'Catatan'],
    ['T1', 'PT-A', (() => { const d = new Date(); return '1/' + (d.getMonth() + 1) + '/' + d.getFullYear(); })(), 'Baru', 'P1', 'Regular 8', 8, '', '', ''],
    ['T2', 'PT-B', (() => { const d = new Date(); return '2/' + (d.getMonth() + 1) + '/' + d.getFullYear(); })(), 'Perpanjang', 'P2', 'Flex', 1, '', '', ''],
  ]);
  return env;
}

// WCAG contrast of the theme tokens, read from the rendered page.
async function contrastReport(page) {
  return page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const hex = v => v.trim();
    const lum = h => {
      const m = h.replace('#', '');
      const c = [0, 2, 4].map(i => parseInt(m.substr(i, 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => { const x = lum(hex(css.getPropertyValue(a))), y = lum(hex(css.getPropertyValue(b))); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    return {
      fgOnBg: ratio('--fg', '--bg'),
      mutedOnSurface: ratio('--fg-muted', '--surface'),
      mutedOnBg: ratio('--fg-muted', '--bg'),
      mutedOnSurface2: ratio('--fg-muted', '--surface-2'),
      onInk: ratio('--on-ink', '--ink'),
      onInkMuted: ratio('--on-ink-muted', '--ink'),
    };
  });
}

(async () => {
  const browser = await chromium.launch();

  // ── Panel PT, HP ──────────────────────────────────────────────────────────
  console.log('Panel PT · HP');
  {
    const env = richEnv();
    env.memberRow('PT-B')[1] = '<img src=x onerror="window.__xss=1">Budi';
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Index', calls);

    check(await visible(page, '#admin-login'), 'no token → PIN login screen');
    check(!calls.includes('getMembers') && !calls.includes('getSchedules'), 'no client data requested before login');
    await shot(page, 'admin-mobile-login');
    await page.fill('#admin-pin', '000000');
    await page.click('#admin-login-btn');
    await page.waitForTimeout(500);
    check((await page.textContent('#admin-login-error')).includes('PIN salah'), 'wrong PIN → "PIN salah."');
    await page.fill('#admin-pin', ADMIN_PIN);
    await page.click('#admin-login-btn');
    await page.waitForTimeout(1200);
    check(!(await visible(page, '#admin-login')), 'right PIN → login screen closes');
    check((await page.evaluate(() => window.members.length)) === 3, 'clients loaded after login');
    check(!!(await page.evaluate(() => localStorage.getItem('xnk_admin_token'))), 'admin token stored on this device');
    check(await visible(page, '#tabbar'), 'floating bottom bar visible on phone');
    check(!(await visible(page, '#sidebar')), 'sidebar hidden on phone');
    check((await page.textContent('#view-dashboard')).includes('Perlu perhatian'), 'dashboard shows "Perlu perhatian"');
    const revenueText = await page.evaluate(() => document.querySelector('#kpi-revenue-tile').textContent);
    check(revenueText.includes('Rp'), 'revenue KPI loaded');
    check(revenueText.includes('65% dari harga paket'), 'revenue KPI says it is 65% of the package price');
    check(await page.evaluate(() => !document.getElementById('unread-badge').classList.contains('hide')), 'new-booking badge shown');
    await shot(page, 'admin-mobile-dashboard');

    await page.click('#client-booking-fab');
    await page.waitForTimeout(400);
    check(await visible(page, '#sheet-quick'), '"+" opens the quick-add sheet');
    await shot(page, 'admin-mobile-quick');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);

    await page.evaluate(() => window.navigate('clients'));
    await page.waitForTimeout(500);
    check((await page.evaluate(() => window.__xss)) === undefined, 'client name with <img onerror> is not executed');
    check((await page.textContent('#client-list')).includes('<img src=x'), 'client name is shown as plain text');
    await shot(page, 'admin-mobile-clients');
    await page.fill('#search-client', 'citra');
    await page.waitForTimeout(200);
    check((await page.locator('#client-list .client-card').count()) === 1, 'search narrows the client list');
    await page.fill('#search-client', '');
    await page.evaluate(() => window.filterClients());

    await page.evaluate(() => window.openProfile('PT-C'));
    await page.waitForTimeout(700);
    const box = await page.locator('#detail-panel').boundingBox();
    check(!!box && box.width >= MOBILE.width - 1, 'client detail opens full-screen on phone');
    const detail = await page.textContent('#detail-panel');
    check(detail.includes('Citra') && !detail.includes('Kirim Link') && !detail.includes('Link Baru'), 'client detail shows the client, no member-link buttons');
    await shot(page, 'admin-mobile-client-detail');
    await page.evaluate(() => window.closeDetail());

    await page.evaluate(() => window.navigate('calendar'));
    await page.waitForTimeout(500);
    check(await visible(page, '#month-cal'), 'schedule shows the month calendar');
    check(!(await visible(page, '#sched-seg')), 'week view switch is desktop-only');
    await shot(page, 'admin-mobile-calendar');

    // Book from the "+" sheet: pick the client, save.
    await page.evaluate(() => window.openBookingSheet({}));
    await page.waitForTimeout(400);
    check(await visible(page, '#sch-member'), 'admin booking asks which client');
    await page.selectOption('#sch-member', 'PT-B');
    await page.fill('#edit-sch-date', inDays(4).slice(0, 10));
    await page.fill('#edit-sch-time', '09:00');
    await page.fill('#edit-sch-notes', 'Admin booking');
    await page.click('#form-edit-schedule button[type="submit"]');
    await page.waitForTimeout(600);
    const adminBooked = env.sheet('Schedules').rows.find(r => r[6] === 'Admin booking');
    check(!!adminBooked && adminBooked[1] === 'PT-B', 'admin booking saved for the chosen client');

    // Session survives a reload; a changed PIN logs every device out.
    const token = await page.evaluate(() => localStorage.getItem('xnk_admin_token'));
    const reload = await openPage(browser, env, '/Index', [], { xnk_admin_token: token });
    check(!(await visible(reload.page, '#admin-login')), 'reload with saved token → straight into the panel');
    env.props.ADMIN_PIN = '99999999';
    const revoked = await openPage(browser, env, '/Index', [], { xnk_admin_token: token });
    check(await visible(revoked.page, '#admin-login'), 'ADMIN_PIN changed → saved token rejected, login shown');
    check((await revoked.page.textContent('#admin-login-error')).includes('Sesi admin berakhir'), 'explains why the PIN is needed again');
    noErrors(errors.concat(reload.errors, revoked.errors));
    await context.close(); await reload.context.close(); await revoked.context.close();
  }

  // ── Panel PT, desktop (terang & gelap) ────────────────────────────────────
  for (const scheme of ['light', 'dark']) {
    console.log('Panel PT · desktop · ' + scheme);
    const env = richEnv();
    const calls = [];
    const token = env.adminToken();
    const { page, context, errors } = await openPage(browser, env, '/Index', calls, { xnk_admin_token: token }, { viewport: DESKTOP, colorScheme: scheme, wait: 1400 });
    check(await visible(page, '#sidebar'), 'sidebar visible on desktop');
    check(!(await visible(page, '#tabbar')), 'bottom bar hidden on desktop');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const dark = /rgb\((\d+), (\d+), (\d+)\)/.exec(bg);
    const luma = dark ? (Number(dark[1]) + Number(dark[2]) + Number(dark[3])) / 3 : 255;
    check(scheme === 'dark' ? luma < 40 : luma > 200, scheme + ' theme follows the device (' + bg + ')');
    const c = await contrastReport(page);
    check(c.fgOnBg >= 7 && c.onInk >= 7, 'text contrast ≥ 7:1 (' + c.fgOnBg.toFixed(1) + ', ink ' + c.onInk.toFixed(1) + ')');
    check(c.mutedOnSurface >= 4.5 && c.mutedOnBg >= 4.5 && c.mutedOnSurface2 >= 4.5, 'muted text contrast ≥ 4.5:1 (' + [c.mutedOnSurface, c.mutedOnBg, c.mutedOnSurface2].map(x => x.toFixed(1)).join(', ') + ')');
    check(c.onInkMuted >= 4.5, 'muted text on black cards ≥ 4.5:1 (' + c.onInkMuted.toFixed(1) + ')');
    await shot(page, 'admin-desktop-' + scheme + '-dashboard');

    await page.evaluate(() => window.navigate('clients'));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openProfile('PT-A'));
    await page.waitForTimeout(800);
    const panel = await page.locator('#detail-panel').boundingBox();
    check(!!panel && panel.x > 900 && panel.width > 380 && panel.width < 460, 'client detail opens as a right-hand column');
    check(await visible(page, '#client-list'), 'client list stays visible next to the detail');
    check((await page.locator('#client-list .selected').count()) === 1, 'selected client is highlighted in the list');
    await shot(page, 'admin-desktop-' + scheme + '-clients');

    await page.evaluate(() => window.navigate('calendar'));
    await page.waitForTimeout(500);
    check(await visible(page, '#sched-seg'), 'desktop has the Bulan | Minggu switch');
    await shot(page, 'admin-desktop-' + scheme + '-calendar');
    await page.evaluate(() => window.setSchedMode('week'));
    await page.waitForTimeout(700);
    check(await page.evaluate(() => !!window.calendarInstance), 'week tab builds the drag-and-drop calendar');
    await shot(page, 'admin-desktop-' + scheme + '-week');
    await page.evaluate(() => { window.setSchedMode('month'); window.openScheduleDetail('SCH-T3'); });
    await page.waitForTimeout(700);
    check((await page.textContent('#detail-panel')).includes('Tandai selesai'), 'session detail has the complete action');
    check(env.sheet('Schedules').rows.find(r => r[0] === 'SCH-T3')[7] !== 'unread', 'opening a new booking marks it read');
    await shot(page, 'admin-desktop-' + scheme + '-session');

    await page.evaluate(() => window.navigate('coaches'));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openCoachProfile('C-1'));
    await page.waitForTimeout(600);
    check((await page.textContent('#detail-panel')).includes('Rizky'), 'coach detail opens');
    await shot(page, 'admin-desktop-' + scheme + '-coach');
    noErrors(errors);
    await context.close();
  }

  // ── Tema manual ───────────────────────────────────────────────────────────
  console.log('Tema manual');
  {
    const env = seededEnv();
    const token = env.adminToken();
    const { page, context } = await openPage(browser, env, '/Index', [], { xnk_admin_token: token }, { viewport: DESKTOP, colorScheme: 'dark' });
    await page.evaluate(() => window.setTheme('light'));
    check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light', 'switch to light while the device is dark');
    check((await page.evaluate(() => localStorage.getItem('xnk_theme'))) === 'light', 'theme choice saved on the device');
    await context.close();
    const again = await openPage(browser, env, '/Index', [], { xnk_admin_token: token, xnk_theme: 'light' }, { viewport: DESKTOP, colorScheme: 'dark', wait: 100 });
    check((await again.page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light', 'saved theme applied before the page draws');
    await again.context.close();
  }

  // ── Portal klien ──────────────────────────────────────────────────────────
  console.log('Portal klien · HP');
  {
    const env = richEnv();
    const calls = [];
    const { page, context, errors, navigations } = await openPage(browser, env, '/Index?view=public', calls);
    const adminCalls = ['getMembers', 'getSchedules', 'getMemberTransactionLog', 'getPackageTrendStats', 'getRevenueSummary', 'checkAdminSession'];
    check(!calls.some(c => adminCalls.includes(c)), 'no admin functions called: ' + calls.join(','));
    check(!(await visible(page, '#admin-login')), 'admin PIN screen never appears in the client portal');
    check((await page.evaluate(() => window.members.length)) === 0, 'no client list in the browser');
    const leaked = await page.evaluate(() => JSON.stringify(window.schedules));
    check(!leaked.includes('Ani') && !leaked.includes('Rahasia') && !leaked.includes('62811'), 'public calendar data has no names, notes or phone numbers');
    check(await visible(page, '#login-phone'), 'login page asks for the WhatsApp number');
    await shot(page, 'portal-mobile-login');

    await page.fill('#login-phone', '89999999999');
    await page.click('#login-submit-btn');
    await page.waitForTimeout(600);
    check((await page.textContent('#member-link-message')).includes('tidak ditemukan'), 'unknown number → "Nomor WhatsApp tidak ditemukan"');
    await page.fill('#login-phone', '81111111111');
    await page.click('#login-submit-btn');
    await page.waitForTimeout(1000);
    check((await page.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.id)) === 'PT-A', 'registered WhatsApp number logs the client in');
    check((await page.evaluate(() => window.currentView)) === 'public-dashboard', 'opens "Beranda"');
    check((await page.textContent('#pub-dash-name')).includes('Ani'), 'shows the client\'s own name');
    check((await page.evaluate(() => window.members.length)) === 0, 'still no client list in the browser after login');
    const own = await page.evaluate(() => window.schedules.find(s => s.id === 'SCH-A1'));
    check(own && own.notes === 'Rahasia Ani', 'own bookings include their details');
    check(((await page.textContent('#pub-next-countdown')) || '').trim().length > 0, 'next-session countdown is filled');
    check((await page.textContent('#pub-consistency-score')).includes('%'), 'consistency insight shown');
    await shot(page, 'portal-mobile-home');

    // Book through a free time slot on the Jadwal tab.
    await page.evaluate(() => window.navigate('calendar'));
    await page.waitForTimeout(400);
    const day = inDays(5).slice(0, 10);
    await page.evaluate(d => window.selectDate(d), day);
    await page.waitForTimeout(400);
    check((await page.locator('#day-panel .slot:not([disabled])').count()) > 0, 'free time slots listed for the chosen day');
    await shot(page, 'portal-mobile-calendar');
    await page.locator('#day-panel .slot:not([disabled])').first().click();
    await page.waitForTimeout(500);
    check(await visible(page, '#modal-edit-schedule'), 'tapping a slot opens the booking sheet');
    check((await page.inputValue('#edit-sch-date')) === day, 'booking sheet has the chosen date');
    await page.fill('#edit-sch-notes', 'Leg day');
    await shot(page, 'portal-mobile-booking');
    await page.click('#form-edit-schedule button[type="submit"]');
    await page.waitForTimeout(700);
    const booked = env.sheet('Schedules').rows.find(r => r[6] === 'Leg day');
    check(!!booked && booked[1] === 'PT-A' && booked[7] === 'unread', 'booking is saved for the logged-in client');

    // FAB booking still works.
    await page.evaluate(() => window.handleFabClick());
    await page.waitForTimeout(400);
    await page.fill('#edit-sch-date', inDays(6).slice(0, 10));
    await page.fill('#edit-sch-time', '10:00');
    await page.fill('#edit-sch-notes', 'Fab booking');
    await page.evaluate(() => document.querySelector('#form-edit-schedule button[type="submit"]').click());
    await page.waitForTimeout(700);
    check(!!env.sheet('Schedules').rows.find(r => r[6] === 'Fab booking' && r[1] === 'PT-A'), '"+" booking is saved too');

    await page.evaluate(() => window.navigate('public-coaches'));
    await page.waitForTimeout(400);
    await page.locator('#public-coach-list button').first().click();
    check((await page.evaluate(() => window.__opened.map(w => w.location.href))).some(u => u.startsWith('https://wa.me/6281112223334')), '"Tanya program" opens WhatsApp to the coach');
    await shot(page, 'portal-mobile-coaches');
    await page.evaluate(() => window.navigate('public-catalog'));
    await page.waitForTimeout(400);
    check((await page.locator('#pricelist-container .btn').count()) > 0, 'package catalog lists packages');
    await shot(page, 'portal-mobile-catalog');
    check(noScriptGoogle(await shownUrls(page, navigations)), 'no script.google link shown to the client');

    // Next visit on the same phone: straight in. Changed session key: asked to log in again.
    const token = await page.evaluate(() => localStorage.getItem('xnk_member_token'));
    const again = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: token });
    check((await again.page.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.id)) === 'PT-A', 'next visit on this phone logs in automatically');
    env.memberRow('PT-A')[13] = 'e'.repeat(32);
    const revoked = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: token });
    check(!(await revoked.page.evaluate(() => window.publicLoggedMember)), 'changed session key → old session no longer works');
    check((await revoked.page.textContent('#member-link-message')).includes('nomor WhatsApp'), 'client is told to log in with the WhatsApp number');
    noErrors(errors.concat(again.errors, revoked.errors));
    await context.close(); await again.context.close(); await revoked.context.close();
  }
  console.log('Portal klien · desktop');
  for (const scheme of ['light', 'dark']) {
    const env = richEnv();
    const token = env.memberToken(KEY_A);
    const { page, context, errors } = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: token }, { viewport: DESKTOP, colorScheme: scheme, wait: 1300 });
    const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.portal-grid')).gridTemplateColumns.split(' ').length);
    check(cols === 2, scheme + ': Beranda uses two columns on desktop');
    await shot(page, 'portal-desktop-' + scheme + '-home');
    await page.evaluate(() => window.navigate('calendar'));
    await page.waitForTimeout(500);
    await shot(page, 'portal-desktop-' + scheme + '-calendar');
    await page.evaluate(() => window.logoutPublic());
    await page.waitForTimeout(700);
    await shot(page, 'portal-desktop-' + scheme + '-login');
    noErrors(errors);
    await context.close();
  }
  {
    const env = seededEnv();
    const old = await openPage(browser, env, '/Index?view=public&k=' + KEY_A, []);
    check((await old.page.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.id)) === 'PT-A', 'an old ?k= link still logs in');
    const bad = await openPage(browser, env, '/Index?view=public&k=' + 'f'.repeat(32), []);
    check((await bad.page.evaluate(() => window.currentView)) === 'public-login', 'unknown link → login page');
    check((await bad.page.textContent('#member-link-message')).includes('nomor WhatsApp'), 'unknown link → asked to log in with the number');
    await old.context.close(); await bad.context.close();
  }

  // ── Landing xnkbooking.my.id ─────────────────────────────────────────────
  const scrollLanding = async (page, y, wait) => {
    await page.evaluate(top => {
      const l = window.__landing && window.__landing.lenis();
      if (l) l.scrollTo(top, { immediate: true, force: true }); else window.scrollTo(0, top);
    }, y);
    await page.waitForTimeout(wait || 1400); // scrub:1 menghaluskan ±1 detik
  };
  const sectionY = (page, sel) => page.evaluate(s => document.querySelector(s).getBoundingClientRect().top + window.pageYOffset, sel);
  const LANDING_WAIT = ASSETS ? 3200 : 1200; // intro 00–100

  console.log('Landing · HP');
  {
    const env = seededEnv();
    const calls = [];
    const { page, context, errors, navigations } = await openPage(browser, env, '/Landing', calls, null, { touch: true, wait: LANDING_WAIT });
    check(await visible(page, '#hero-m'), 'typographic hero on the phone');
    check((await page.locator('#hero-m img').count()) === 0, 'no photo in the phone hero');
    check(!(await visible(page, '#hero-desk')), 'desktop hero (photo + JIZDAN) hidden on the phone');
    check(await visible(page, '#m-bar'), 'sticky bottom bar with "Mulai Sekarang" + WhatsApp');
    check(await visible(page, '#burger') && !(await visible(page, '.nav-links')), 'burger menu instead of desktop links');
    check(!(await page.evaluate(() => document.body.classList.contains('has-cursor'))), 'no custom cursor on the phone');
    check((await page.locator('#pricing-track .price').count()) === 1, 'packages from the Price List (active only, per category)');
    check((await page.locator('.toggle-btn').count()) === 2, 'category switch only lists categories that have packages');
    check((await page.locator('#testimonial-grid .testi, #testimonial-grid .empty-note').count()) > 0, 'testimonials section rendered');
    check((await page.locator('#slot-days .slot-day').count()) === 7, 'free-slot strip shows the next 7 days');
    check((await page.locator('#slot-hours .slot-h').count()) > 0, 'free hours listed');
    check(!calls.includes('getMembers') && !calls.includes('getSchedules'), 'no client list or admin schedule requested');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'nothing sticks out sideways on the phone');
    check(!(await page.getAttribute('#figure-desk', 'data-gl')), 'no WebGL on the phone');
    check(await page.evaluate(() => getComputedStyle(document.body, '::after').content === 'none'), 'no film-grain layer on the phone');
    check(!(await page.evaluate(() => [...document.querySelectorAll('.sec')].some(el => getComputedStyle(el).position === 'sticky'))), 'sections scroll normally (no stacked sticky cards)');
    await shot(page, 'landing-mobile-hero');

    await scrollLanding(page, await sectionY(page, '#coach'), 900);
    await shot(page, 'landing-mobile-coach');
    await scrollLanding(page, await sectionY(page, '#program'), 900);
    await shot(page, 'landing-mobile-program');
    await scrollLanding(page, await sectionY(page, '#paket'), 900);
    await shot(page, 'landing-mobile-paket');

    // Menu.
    await page.click('#burger');
    await page.waitForTimeout(900);
    check(await page.evaluate(() => document.body.classList.contains('menu-open')), 'burger opens the full-screen menu');
    await shot(page, 'landing-mobile-menu');
    await page.click('#m-menu [data-go="jadwal"]');
    await page.waitForTimeout(1200);
    check(!(await page.evaluate(() => document.body.classList.contains('menu-open'))), 'menu link closes the menu');

    // Slot → saved for the portal → "Sudah member?".
    await page.locator('#slot-hours .slot-h').first().click();
    await page.waitForTimeout(700);
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('xnk_pending_slot') || 'null'));
    check(!!pending && /^\d{4}-\d{2}-\d{2}$/.test(pending.date) && /^\d{2}:00$/.test(pending.time), 'picking an hour saves it for the booking page');
    check((await page.textContent('#member-check-modal')).includes('Jam dipilih'), 'modal shows the chosen hour');
    await shot(page, 'landing-mobile-slot-modal');

    // Member lama.
    await page.evaluate(() => goToBooking('existing'));
    await page.waitForTimeout(300);
    check(await visible(page, '#verify-phone'), '"Member lama" asks for the WhatsApp number');
    await page.fill('#verify-phone', '0899 9999 9999');
    await page.click('#verify-btn');
    await page.waitForTimeout(500);
    check((await page.textContent('#verify-error')).includes('tidak ditemukan'), 'unknown number → clear message');
    await page.fill('#verify-phone', '081111111111');
    await page.click('#verify-btn');
    await page.waitForTimeout(500);
    const card = await page.textContent('#member-check-modal');
    check(card.includes('Ani Anggraini') && card.includes('Sisa Sesi') && card.includes('5'), 'registered number → member card with remaining sessions');
    const saved = await page.evaluate(() => localStorage.getItem('xnk_member_token'));
    check(!!saved && env.call('getMemberProfile', saved).id === 'PT-A', 'member session saved for the booking site');
    await shot(page, 'landing-mobile-member');

    // Closing and reopening starts at the "Sudah member?" chooser again.
    await page.evaluate(() => closeMemberCheck());
    await page.waitForTimeout(600);
    check(!(await visible(page, '#member-check-modal')), 'modal closes');
    await page.evaluate(() => openMemberCheck());
    await page.waitForTimeout(300);
    check((await page.textContent('#member-check-modal')).includes('Sudah member?'), 'reopening shows the chooser again');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    check(!(await visible(page, '#member-check-modal')), 'Esc closes the modal');

    await page.evaluate(() => { openMemberCheck(); showMemberCard({ name: 'Ani Anggraini', id: 'PT-A', totalSessions: 10, usedSessions: 5 }); });
    await page.click('#member-card-booking');
    await page.waitForTimeout(300);
    check(navigations.some(u => u.startsWith('https://book.xnkbooking.my.id')), '"Lanjut Booking" goes to book.xnkbooking.my.id');
    noErrors(errors);
    await context.close();

    // The portal opens the booking form at the hour picked on the Landing.
    const portal = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: saved, xnk_pending_slot: JSON.stringify(pending) }, { wait: 1800 });
    check(await visible(portal.page, '#modal-edit-schedule'), 'booking page opens the booking form for the picked hour');
    check((await portal.page.inputValue('#edit-sch-date')) === pending.date && (await portal.page.inputValue('#edit-sch-time')) === pending.time, 'booking form has the picked date and hour');
    check((await portal.page.evaluate(() => localStorage.getItem('xnk_pending_slot'))) === null, 'picked hour is used once');
    noErrors(portal.errors);
    await portal.context.close();
  }
  {
    const env = seededEnv();
    const { page, context, errors, navigations } = await openPage(browser, env, '/Landing', [], null, { touch: true });
    await page.evaluate(() => openRegistration());
    await page.waitForTimeout(400);
    await page.fill('#reg-name', 'Fajar');
    await page.fill('#reg-wa', '81577777777');
    await page.selectOption('#reg-goal', 'Weight Loss');
    await shot(page, 'landing-mobile-register');
    await page.evaluate(() => doRegisterStep1());
    await page.evaluate(() => doRegisterStep2());
    await page.waitForTimeout(500);
    const row = env.sheet('MemberData').rows.find(r => r[1] === 'Fajar');
    check(!!row && row[13] && /^[a-f0-9]{32}$/.test(row[13]), 'registration creates the client with a session key');
    check(await visible(page, '#reg-step-3'), 'shows "Registrasi Berhasil!"');
    const saved = await page.evaluate(() => localStorage.getItem('xnk_member_token'));
    check(!!saved && env.call('getMemberProfile', saved).name === 'Fajar', 'new client is logged in on this device');
    await page.click('#reg-open-member');
    await page.waitForTimeout(300);
    check(navigations.some(u => u.startsWith('https://book.xnkbooking.my.id')), '"Lanjut Booking" goes to book.xnkbooking.my.id');
    check(noScriptGoogle(await shownUrls(page, navigations)), 'no script.google link shown to the client');

    // Program card → registration with that goal preselected.
    await page.evaluate(() => { closeMemberCheck(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('[data-goal="Muscle Building"]').click());
    await page.evaluate(() => goToBooking('new'));
    await page.waitForTimeout(300);
    check((await page.inputValue('#reg-goal')) === 'Muscle Building', 'program card preselects the training goal');
    noErrors(errors);
    await context.close();
  }
  {
    // HTML in the Price List is shown as text, never run.
    const env = seededEnv();
    env.sheet('PriceList').rows.push(['P9', '<img src=x onerror="window.__xss=1">', 'regular', 1, 1, '<b>x</b>', '<img src=x onerror="window.__xss=2">', 'a', true]);
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { touch: true });
    check(!(await page.evaluate(() => window.__xss)), 'package names/descriptions are escaped');
    check((await page.locator('#pricing-track img').count()) === 0, 'no HTML injected into package cards');
    noErrors(errors);
    await context.close();
  }

  console.log('Landing · desktop');
  {
    const env = seededEnv();
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { viewport: DESKTOP, wait: LANDING_WAIT });
    check(await visible(page, '#hero-desk'), 'desktop hero visible');
    check((await page.textContent('.giant')).replace(/\s/g, '') === 'JIZDAN', 'giant "JIZDAN" behind the body');
    check(!(await page.locator('.callout, .hero-tag').count()), 'no muscle labels or tagline');
    check(!(await visible(page, '#hero-m')) && !(await visible(page, '#m-bar')), 'phone hero and bottom bar hidden on desktop');
    check(await visible(page, '.nav-links'), 'desktop nav links visible');
    check(await page.evaluate(() => {
      const f = document.getElementById('figure-desk').getBoundingClientRect();
      return Math.abs(f.left + f.width / 2 - window.innerWidth / 2) < 4;
    }), 'photo centred');
    if (ASSETS) {
      check(await page.evaluate(() => document.documentElement.classList.contains('js-motion')), 'scroll animations active');
      check(await page.evaluate(() => document.body.classList.contains('has-cursor')), 'custom cursor on desktop');
      check(['on', 'fallback'].includes(await page.getAttribute('#figure-desk', 'data-gl')), 'WebGL muscle light (' + (await page.getAttribute('#figure-desk', 'data-gl')) + ')');
      await page.mouse.move(900, 300);
      await page.waitForTimeout(900);
    }
    await shot(page, 'landing-desktop-hero');

    // Program latihan: a plain slider (native drag/scroll), never scroll-jacked —
    // holds regardless of whether the animation libraries loaded.
    check(await page.evaluate(() => getComputedStyle(document.getElementById('program-track')).transform === 'none'), 'the program cards are never transformed by JS (native slider, not scroll-jacked)');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.program-viewport')).overflowX === 'auto'), 'the program slider can be scrolled/dragged sideways');
    await page.evaluate(() => { const vp = document.getElementById('program-viewport'); vp.scrollLeft = vp.scrollWidth; vp.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(200);
    check((await page.textContent('#program-idx')) === '04', 'the "01/04" counter follows manual scrolling of the slider');
    await page.evaluate(() => { const vp = document.getElementById('program-viewport'); vp.scrollLeft = 0; vp.dispatchEvent(new Event('scroll')); });

    if (ASSETS) {
      const ty = () => page.evaluate(() => getComputedStyle(document.getElementById('figure-desk')).getPropertyValue('--ty'));
      const initialTy = await ty();
      await scrollLanding(page, 900 * 0.8);
      check((await ty()) !== initialTy, 'the photo gets a subtle parallax while scrolling past the hero (no pin)');
      await shot(page, 'landing-desktop-scroll');
      await scrollLanding(page, (await sectionY(page, '#program')) + 40);
      await shot(page, 'landing-desktop-program');

      // Proses: color change as the scroll line passes, never a pinned sequence.
      // Sample the whole crossing range (from just before the section enters the
      // viewport to just after it leaves), since a step's own trigger window can
      // sit before the section's top edge reaches the top of the viewport.
      const methodTop = await sectionY(page, '#method');
      const methodHeight = await page.evaluate(() => document.getElementById('method').offsetHeight);
      const rectTop = () => page.evaluate(() => document.getElementById('method').getBoundingClientRect().top);
      const seen = new Set();
      let maxActiveAtOnce = 0;
      const scanFrom = methodTop - DESKTOP.height, scanTo = methodTop + methodHeight;
      const rectAtStart = await rectTop();
      for (let y = scanFrom; y <= scanTo; y += (scanTo - scanFrom) / 14) {
        await scrollLanding(page, y, 220);
        const idxs = await page.evaluate(() => [...document.querySelectorAll('#steps .step')].flatMap((s, i) => s.classList.contains('is-active') ? [i] : []));
        idxs.forEach(i => seen.add(i));
        maxActiveAtOnce = Math.max(maxActiveAtOnce, idxs.length);
      }
      check(maxActiveAtOnce <= 1, 'at most one process step is highlighted at a time');
      check(seen.size === 4, 'every step gets highlighted once as the scan line passes it, no more (' + [...seen].sort().join(',') + ')');
      check((await rectTop()) !== rectAtStart, 'the process section itself keeps scrolling on screen (not pinned in place)');
      await shot(page, 'landing-desktop-method');
    }
    await scrollLanding(page, await sectionY(page, '#paket'));
    await shot(page, 'landing-desktop-paket');
    await scrollLanding(page, await sectionY(page, '#jadwal'));
    await shot(page, 'landing-desktop-jadwal');
    await scrollLanding(page, await sectionY(page, '#cta'));
    await shot(page, 'landing-desktop-cta');
    await page.evaluate(() => document.querySelector('#pricing-track .price').click());
    await page.waitForTimeout(900);
    check((await page.textContent('#member-check-modal')).includes('Sudah member?'), 'package card opens "Sudah member?"');
    await shot(page, 'landing-desktop-modal');
    await page.evaluate(() => goToBooking('new'));
    await page.waitForTimeout(400);
    await page.fill('#reg-name', 'Gita');
    await page.fill('#reg-wa', '81566666666');
    await page.selectOption('#reg-goal', 'Weight Loss');
    await page.evaluate(() => doRegisterStep1());
    await page.waitForTimeout(300);
    check((await page.locator('#reg-packages input:checked').inputValue()) === '0', 'the clicked package is preselected');
    noErrors(errors);
    await context.close();
  }
  // Hero text never overlaps the giant JIZDAN, also on short laptop screens.
  for (const vp of [DESKTOP, { width: 1366, height: 657 }, { width: 1280, height: 720 }, { width: 1024, height: 640 }]) {
    const env = seededEnv();
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { viewport: vp, wait: LANDING_WAIT });
    const hit = await page.evaluate(() => {
      const r = sel => document.querySelector(sel).getBoundingClientRect();
      const cross = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const g = r('.giant');
      const labels = [...document.querySelectorAll('.hero-labels span')].map(e => e.getBoundingClientRect());
      return ['.hero-labels', '.hero-copy', '.hero-side'].filter(sel => cross(r(sel), g))
        .concat(cross(labels[0], labels[1]) ? ['labels'] : []);
    });
    check(!hit.length, vp.width + '×' + vp.height + ': hero text does not overlap JIZDAN' + (hit.length ? ' (' + hit.join(', ') + ')' : ''));
    if (vp.height < 700) await shot(page, 'landing-desktop-hero-' + vp.width + 'x' + vp.height);
    noErrors(errors);
    await context.close();
  }
  {
    // Reduced motion: no intro, no scroll animations, static photo.
    const env = seededEnv();
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { viewport: DESKTOP, reducedMotion: 'reduce' });
    check(!(await page.locator('#intro').count()), 'reduced motion: no intro');
    check(!(await page.evaluate(() => document.documentElement.classList.contains('js-motion'))), 'reduced motion: no scroll animations');
    check(!(await page.getAttribute('#figure-desk', 'data-gl')), 'reduced motion: static photo');
    noErrors(errors);
    await context.close();
  }
  if (ASSETS) {
    // Animation libraries unreachable: page still works (static).
    const env = seededEnv();
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { viewport: DESKTOP, blockCdn: true, wait: 5200 });
    check(!(await visible(page, '#intro')), 'without GSAP the intro still goes away');
    check((await page.locator('#pricing-track .price').count()) > 0, 'without GSAP the content still loads');
    await page.evaluate(() => { openMemberCheck(); goToBooking('existing'); });
    await page.waitForTimeout(300);
    check(await visible(page, '#verify-phone'), 'without GSAP the member flow still works');
    noErrors(errors);
    await context.close();
  }
  if (process.env.VIDEO_DIR) {
    // Scroll-through recordings for review.
    for (const [name, opts] of [['landing-desktop', { viewport: DESKTOP }], ['landing-mobile', { touch: true }]]) {
      const env = seededEnv();
      const dir = path.join(process.env.VIDEO_DIR, name);
      const { page, context } = await openPage(browser, env, '/Landing', [], null, Object.assign({ video: dir, wait: 3600 }, opts));
      const h = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      if (opts.viewport) { for (let x = 300; x <= 1100; x += 40) { await page.mouse.move(x, 250 + (x % 200)); await page.waitForTimeout(25); } }
      for (let y = 0; y <= h; y += opts.viewport ? 60 : 45) {
        await page.evaluate(top => { const l = window.__landing.lenis(); if (l) l.scrollTo(top, { immediate: true, force: true }); else window.scrollTo(0, top); }, y);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(1200);
      await context.close();
      const file = fs.readdirSync(dir).find(f => f.endsWith('.webm'));
      if (file) fs.renameSync(path.join(dir, file), path.join(process.env.VIDEO_DIR, name + '.webm'));
    }
  }

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll browser checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
