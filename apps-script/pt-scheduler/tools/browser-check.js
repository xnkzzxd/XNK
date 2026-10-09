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
const { seededEnv, KEY_A, KEY_B, ADMIN_PIN, inDays, wibSlot } = require('../tests/fixtures');

const SRC = path.join(__dirname, '..', 'src');
const ORIGIN = 'https://gas.test';
const SHOTS = process.env.SHOTS_DIR || '';
const ASSETS = process.env.ASSETS_DIR || '';
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const DESKTOP_W = DESKTOP.width;
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
    hasTouch: !!opts.touch, isMobile: !!opts.touch, timezoneId: opts.timezoneId,
    recordVideo: opts.video ? { dir: opts.video, size: opts.viewport || MOBILE } : undefined,
  });
  if (storage) await context.addInitScript(s => { for (const k in s) localStorage.setItem(k, s[k]); }, storage);
  await context.exposeFunction('__gasCall', async (name, argsJson) => {
    calls.push(name);
    if (opts.delay && opts.delay[name]) await new Promise(r => setTimeout(r, opts.delay[name]));
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
  if (opts.clock) await page.clock.install();
  await page.goto(ORIGIN + pagePath);
  await page.waitForTimeout(opts.wait || 900);
  if (pagePath.includes('view=public') && !opts.keepCelebration) {
    // A client with new badges gets a celebration sheet on the home screen; other flows don't care about it.
    await page.waitForTimeout(500);
    await page.evaluate(() => { const b = document.getElementById('sheet-badge'); if (b && !b.classList.contains('hide') && window.closeModal) window.closeModal(); }).catch(() => {});
    await page.waitForTimeout(500);
  }
  return { page, context, errors, navigations };
}

// Average brightness (0–255) of a small screenshot area, read back through a canvas.
async function brightness(page, x, y) {
  const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 6, height: 6 } });
  return page.evaluate(b64 => new Promise(res => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = 6; c.height = 6; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, 6, 6).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += (d[i] + d[i + 1] + d[i + 2]) / 3; res(t / 36); };
    img.src = 'data:image/png;base64,' + b64;
  }), png.toString('base64'));
}
const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
// Overflow inside one element (.main and the detail panel clip their content, so overflowX misses it).
const elOverflow = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.scrollWidth - e.clientWidth : -1; }, sel);
const gridTracks = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); const g = e ? getComputedStyle(e).gridTemplateColumns : 'none'; return g === 'none' ? 0 : g.split(' ').length; }, sel);
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
    check(!calls.includes('getAdminBootstrap') && !calls.includes('getMembers') && !calls.includes('getSchedules'), 'no client data requested before login');
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
    const phoneList = await page.evaluate(() => {
      const l = document.querySelector('#client-list > .list'), c = document.querySelector('#client-list .client-card');
      return { list: getComputedStyle(l).display + '/' + getComputedStyle(l).flexDirection, card: getComputedStyle(c).display, meter: getComputedStyle(c.querySelector('.cc-meter')).maxWidth,
        meta: Array.from(document.querySelectorAll('#client-list .cc-meta, #client-list .cc-renew')).filter(e => e.getClientRects().length).length };
    });
    check(phoneList.list === 'flex/column' && phoneList.card === 'flex' && phoneList.meter === '220px' && phoneList.meta === 0, 'phone: the client list is the same one-column list (no desktop card details) ' + JSON.stringify(phoneList));
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
    const phoneProf = await page.evaluate(() => ({
      tabs: getComputedStyle(document.querySelector('#detail-body .cp-tabs')).gridTemplateColumns.split(' ').length,
      cols: Array.from(document.querySelectorAll('#detail-body .cp-col')).map(e => getComputedStyle(e).display),
      pad: parseFloat(getComputedStyle(document.getElementById('detail-body')).paddingBottom),
      wide: document.getElementById('app').classList.contains('detail-wide') && getComputedStyle(document.getElementById('detail-panel')).width,
    }));
    check(phoneProf.tabs === 4 && phoneProf.cols.length >= 2 && phoneProf.cols.every(d => d === 'contents') && phoneProf.pad >= 100, 'phone: the client page keeps the phone layout (4-column tab tiles, one column, room for the tab bar) ' + JSON.stringify(phoneProf));
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

  // ── Panel PT, HP: satu loading, tarik untuk muat ulang, tombol back ───────
  console.log('Panel PT · HP (login, tarik, back)');
  {
    const env = richEnv();
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Index', calls, undefined, { touch: true });
    await page.waitForFunction(() => document.getElementById('global-loader').classList.contains('gone'));
    await page.evaluate(() => {
      window.__splashShown = false;
      const el = document.getElementById('global-loader');
      new MutationObserver(() => { if (!el.classList.contains('gone')) window.__splashShown = true; }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    await page.fill('#admin-pin', ADMIN_PIN);
    await page.click('#admin-login-btn');
    await page.waitForTimeout(1500);
    check(!(await page.evaluate(() => window.__splashShown)), 'login: only the button loads, the full-screen splash never shows');
    check(!(await visible(page, '#admin-login')) && (await page.evaluate(() => window.members.length)) === 3, 'login: dashboard is ready when the login box closes');
    check(calls.filter(c => c === 'getAdminBootstrap').length === 1 && calls.includes('getAdminMore'), 'login: one call for the first screen, one for the secondary data');
    check(calls.filter(c => /^get/.test(c)).length === 2 || calls.filter(c => /^get/.test(c)).join() === 'getAdminBootstrap,getAdminMore', 'fast: the panel opens with exactly two server calls (' + calls.join(',') + ')');
    await page.evaluate(() => window.openProfile('PT-A'));
    await page.waitForTimeout(700);
    const prof = calls.filter(c => /^get/.test(c)).slice(2);
    await page.evaluate(() => window.closeDetail());
    await page.waitForTimeout(300);
    check(prof.length === 1 && prof[0] === 'getClientBundle', 'fast: opening a client page makes one call (' + prof.join(',') + ')');

    // Buka lagi dengan token: panel langsung terisi dari salinan, tanpa cek sesi terpisah
    const token = await page.evaluate(() => localStorage.getItem('xnk_admin_token'));
    const cache = await page.evaluate(() => localStorage.getItem('xnk_admin_cache'));
    check(!!cache && JSON.parse(cache).members.length === 3, 'open: a copy of the last data is kept on this device');
    const calls2 = [];
    const again = await openPage(browser, env, '/Index', calls2, { xnk_admin_token: token, xnk_admin_cache: cache }, { touch: true, wait: 700 });
    check(!calls2.includes('checkAdminSession'), 'open: no separate session check before loading data');
    check((await again.page.evaluate(() => window.members.length)) === 3 && !(await visible(again.page, '#admin-login')), 'open: the dashboard shows right away');
    await again.context.close();

    // Tarik ke bawah
    const before = calls.filter(c => c === 'getAdminBootstrap').length;
    const touch = (type, y) => page.evaluate(([type, y]) => {
      const sc = document.getElementById('main-scroll-area');
      const t = new Touch({ identifier: 1, target: sc, clientX: 100, clientY: y });
      sc.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    }, [type, y]);
    await touch('touchstart', 200); await touch('touchmove', 230); await touch('touchmove', 280);
    const mid = await page.evaluate(() => ({ t: document.getElementById('main-scroll-area').style.transform, o: +getComputedStyle(document.querySelector('.ptr')).opacity }));
    check(/translate3d/.test(mid.t) && mid.o > 0, 'pull down: the page follows the finger and the indicator fades in');
    await shot(page, 'admin-mobile-pulling');
    await touch('touchmove', 420);
    check(await page.evaluate(() => document.querySelector('.ptr').classList.contains('armed')), 'pull down: the indicator flips when the pull is long enough');
    await touch('touchend', 420);
    await page.waitForTimeout(250);
    check(await page.evaluate(() => document.querySelector('.ptr').classList.contains('spinning')), 'pull down: spins while loading');
    await shot(page, 'admin-mobile-refreshing');
    await page.waitForTimeout(1300);
    check(await page.evaluate(() => document.querySelector('.ptr').classList.contains('ok')), 'pull down: ends with a check mark');
    await page.waitForTimeout(900);
    check(await page.evaluate(() => document.getElementById('main-scroll-area').style.transform === '' && document.querySelector('.ptr').className === 'ptr'), 'pull down: the page settles back and the indicator resets');
    check(calls.filter(c => c === 'getAdminBootstrap').length === before + 1, 'pull down: data is reloaded in place');
    check((await page.evaluate(() => window.currentView)) === 'dashboard', 'pull down: stays on the same page');

    // Tombol back
    await page.evaluate(() => window.navigate('clients'));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.openNotificationModal());
    await page.waitForTimeout(450);
    await page.goBack();
    await page.waitForTimeout(700);
    check(!(await page.evaluate(() => document.getElementById('sheet-layer').classList.contains('open'))), 'back: closes the open sheet first');
    check((await page.evaluate(() => window.currentView)) === 'clients', 'back: the page stays on Klien after closing the sheet');
    await page.goBack();
    await page.waitForTimeout(400);
    check((await page.evaluate(() => window.currentView)) === 'dashboard', 'back: from another page returns to the dashboard');
    const hist = await page.evaluate(() => history.length);
    await page.evaluate(() => window.navigate('clients'));
    await page.evaluate(() => window.navigate('dashboard'));
    await page.waitForTimeout(500);
    check((await page.evaluate(() => history.length)) <= hist + 1, 'back: tab switches do not pile up history entries');
    check(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await context.close();
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

    // ── Klien di PC: grid kartu → profil lebar + daftar nama ringkas ─────────────
    await page.evaluate(() => window.navigate('clients'));
    await page.waitForTimeout(600);
    const sideW = (await page.locator('#sidebar').boundingBox()).width;
    const cards0 = await page.evaluate(() => Array.from(document.querySelectorAll('#client-list .client-card')).map(c => { const r = c.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; }));
    check((await gridTracks(page, '#client-list > .list')) >= 3 && cards0.length >= 3 && cards0[0].y === cards0[1].y && cards0[0].x !== cards0[1].x, 'Klien on PC: clients are a grid of cards, three or more per row');
    const meta0 = await page.evaluate(() => ({
      shown: Array.from(document.querySelectorAll('#client-list .cc-meta')).filter(e => e.getClientRects().length).length,
      cards: document.querySelectorAll('#client-list .client-card[data-key]').length,
      times: Array.from(document.querySelectorAll('#client-list .cc-next')).filter(e => /\d{2}\.\d{2}/.test(e.textContent)).length,
      coach: document.querySelectorAll('#client-list .cc-coach').length, solo: window.isSoloCoach(),
    }));
    check(meta0.shown === meta0.cards && meta0.times >= 1 && meta0.coach === (meta0.solo ? 0 : meta0.cards), 'Klien on PC: each card shows the next session, last activity (and coach only with 2+ coaches) ' + JSON.stringify(meta0));
    check((await elOverflow(page, '#client-list')) <= 1, 'Klien on PC: the card grid has no sideways overflow');
    await shot(page, 'admin-desktop-' + scheme + '-clients-grid');

    await page.evaluate(() => window.openProfile('PT-A'));
    await page.waitForTimeout(900);
    const panel = await page.locator('#detail-panel').boundingBox();
    const listBox = await page.locator('#client-list').boundingBox();
    check(await page.evaluate(() => document.getElementById('app').classList.contains('detail-wide')) && !!panel && panel.width >= 0.55 * (DESKTOP_W - sideW) && Math.abs(panel.x + panel.width - DESKTOP_W) <= 1 && listBox.width >= 340,
      'client detail opens as a wide right-hand column (' + Math.round(panel.width) + ' px), the list keeps ' + Math.round(listBox.width) + ' px');
    check(await visible(page, '#client-list'), 'client list stays visible next to the detail');
    check((await page.locator('#client-list .selected').count()) === 1, 'selected client is highlighted in the list');
    const compact = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#client-list .client-card')), sc = document.getElementById('main-scroll-area').getBoundingClientRect();
      const sel = document.querySelector('#client-list .selected').getBoundingClientRect();
      return { lefts: new Set(cards.map(c => Math.round(c.getBoundingClientRect().left))).size, meta: Array.from(document.querySelectorAll('#client-list .cc-meta, #client-list .cc-meter, #client-list .grow > .li-sub')).filter(e => e.getClientRects().length).length,
        kpis: document.querySelector('#view-clients .client-kpis').getClientRects().length, selIn: sel.top >= sc.top && sel.bottom <= sc.bottom };
    });
    check(compact.lefts === 1 && compact.meta === 0 && compact.kpis === 0 && compact.selIn, 'open client: the list becomes one column of names (no details, no summary tiles) and the open client is in view ' + JSON.stringify(compact));
    check((await elOverflow(page, '#detail-body')) <= 1 && (await elOverflow(page, '#client-list')) <= 1, 'open client: nothing overflows sideways in the panel or the list');
    const wideProf = await page.evaluate(() => {
      const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const main = r('#detail-body .cp-col-main'), side = r('#detail-body .cp-col-side'), id = r('#detail-body .client-hero-id'), ring = r('#detail-body .client-ring-row');
      return { cols: !!main && !!side && side.left >= main.right && Math.abs(side.top - main.top) <= 2, hero: !!id && !!ring && ring.left >= id.right,
        btns: Array.from(document.querySelectorAll('#detail-body .client-hero-actions .btn')).every(b => b.getBoundingClientRect().width < 200),
        tabs: new Set(Array.from(document.querySelectorAll('#detail-body [data-cptab]')).map(b => Math.round(b.getBoundingClientRect().top))).size,
        tabBg: getComputedStyle(document.querySelector('#detail-body .cp-tabs')).backgroundColor === getComputedStyle(document.getElementById('detail-panel')).backgroundColor,
        head: Math.round(r('.detail-head').height) === Math.round(r('#topbar').height), pad: parseFloat(getComputedStyle(document.getElementById('detail-body')).paddingBottom) };
    });
    check(wideProf.cols && wideProf.hero && wideProf.btns && wideProf.tabs === 1 && wideProf.tabBg && wideProf.head && wideProf.pad <= 48, 'open client: two-column Ringkasan, wide hero, one row of tabs, header lined up with the top bar ' + JSON.stringify(wideProf));
    await shot(page, 'admin-desktop-' + scheme + '-clients');

    // ↑/↓ in the list opens the neighbouring client; arrows inside the panel keep scrolling it.
    await page.focus('#client-list .selected');
    const order = await page.evaluate(() => Array.from(document.querySelectorAll('#client-list [data-key^="client:"]')).map(e => e.getAttribute('data-key')));
    const at = order.indexOf('client:PT-A'), dir = at < order.length - 1 ? 'ArrowDown' : 'ArrowUp', back = dir === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown';
    const nb = order[at + (dir === 'ArrowDown' ? 1 : -1)];
    await page.keyboard.press(dir);
    await page.waitForTimeout(500);
    const k1 = await page.evaluate(() => ({ sel: (document.querySelector('#client-list .selected') || {}).getAttribute && document.querySelector('#client-list .selected').getAttribute('data-key'), act: document.activeElement && document.activeElement.getAttribute('data-key') }));
    await page.keyboard.press(back);
    await page.waitForTimeout(500);
    const k2 = await page.evaluate(() => document.querySelector('#client-list .selected').getAttribute('data-key'));
    check(k1.sel === nb && k1.act === nb && k2 === 'client:PT-A', 'keyboard: ' + dir + ' opens the next client in the list, ' + back + ' goes back ' + JSON.stringify([k1, k2]));
    await page.click('#detail-body .profile-name');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    check((await page.evaluate(() => document.querySelector('#client-list .selected').getAttribute('data-key'))) === 'client:PT-A', 'keyboard: arrows pressed inside the panel do not switch clients');

    // Data refresh keeps the open tab, the search text and caret, and the summary tile state.
    await page.evaluate(() => window.cpTab('progres'));
    await page.evaluate(() => window.updateUI());
    await page.waitForTimeout(500);
    check(await page.evaluate(() => document.querySelector('#detail-body [data-cptab="progres"]').classList.contains('active') && !document.querySelector('#detail-body [data-cppane="progres"]').classList.contains('hide') && document.querySelector('#detail-body [data-cppane="ringkasan"]').classList.contains('hide')),
      'client page: a data refresh keeps the open tab (no jump back to Ringkasan)');
    await page.evaluate(() => window.cpTab('ringkasan'));
    await page.focus('#search-client');
    await page.keyboard.type('an');
    await page.evaluate(() => window.updateUI());
    await page.waitForTimeout(300);
    const caretState = await page.evaluate(() => ({ id: document.activeElement && document.activeElement.id, v: document.getElementById('search-client').value, s: document.getElementById('search-client').selectionStart }));
    check(caretState.id === 'search-client' && caretState.v === 'an' && caretState.s === 2, 'Klien: a background refresh keeps typing in the search box ' + JSON.stringify(caretState));
    await page.fill('#search-client', '');
    await page.evaluate(() => window.filterClients());
    await page.evaluate(() => window.setClientFilter('low'));
    const kLow = await page.locator('#view-clients .kpi.active[data-filter="low"]').count();
    await page.evaluate(() => window.setClientFilter('all'));
    check(kLow === 1 && (await page.locator('#view-clients .kpi.active').count()) === 0 && (await page.locator('#view-clients .chip.active[data-filter="all"]').count()) === 1, 'Klien: the summary tiles and chips follow the chosen filter');

    // Closing returns to the grid; a profile opened from another page keeps the normal 420 px panel.
    await page.click('.detail-head .icon-btn[aria-label="Tutup detail"]');
    await page.waitForTimeout(700);
    check(!(await page.evaluate(() => document.getElementById('app').classList.contains('detail-wide'))) && (await gridTracks(page, '#client-list > .list')) >= 3, 'closing the client returns to the card grid');
    await page.evaluate(() => window.navigate('dashboard'));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openProfile('PT-A'));
    await page.waitForTimeout(900);
    const dPanel = await page.locator('#detail-panel').boundingBox();
    const dTabs = await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#detail-body [data-cptab]')); return { rows: new Set(t.map(b => Math.round(b.getBoundingClientRect().top))).size, over: t.map(b => b.scrollWidth - b.clientWidth).filter(x => x > 1).length }; });
    check(!(await page.evaluate(() => document.getElementById('app').classList.contains('detail-wide'))) && dPanel.width > 380 && dPanel.width < 460 && dTabs.rows === 1 && dTabs.over === 0,
      'a client opened from the dashboard keeps the 420 px panel, five tabs on one row ' + JSON.stringify(dTabs));
    await page.evaluate(() => window.closeDetail());
    await page.waitForTimeout(600);

    // 1280 × 720: the list keeps room, the profile falls back to one column where two would not fit.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.navigate('clients'));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openProfile('PT-A'));
    await page.waitForTimeout(900);
    const p1280 = await page.locator('#detail-panel').boundingBox(), l1280 = await page.locator('#client-list').boundingBox();
    const one1280 = await page.evaluate(() => getComputedStyle(document.querySelector('#detail-body [data-cppane="ringkasan"]')).display);
    check(p1280.width >= 0.55 * (1280 - sideW) && l1280.width >= 340 && (await elOverflow(page, '#detail-body')) <= 1 && (await elOverflow(page, '#client-list')) <= 1 && one1280 === 'flex',
      '1280 × 720: wide panel ' + Math.round(p1280.width) + ' px, list ' + Math.round(l1280.width) + ' px, Ringkasan in one column (' + one1280 + ')');
    await shot(page, 'admin-desktop-' + scheme + '-clients-1280');
    await page.evaluate(() => window.closeDetail());
    await page.setViewportSize(DESKTOP);
    await page.waitForTimeout(600);

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
    check(await page.evaluate(() => window.isSoloCoach()), 'one active coach = solo mode');
    check((await page.textContent('#detail-panel')).includes('Nonaktifkan coach'), 'coach detail offers Nonaktifkan');
    await page.evaluate(() => { window.closeDetail(); window.openEditCoachModal('C-1'); });
    await page.waitForTimeout(500);
    check(await visible(page, '#coach-headline') && await visible(page, '#coach-instagram'), 'coach editor has the new profile fields');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.navigate('calendar'));
    await page.waitForTimeout(400);
    check(!(await visible(page, '#calendar-coach-filter')), 'solo mode hides the calendar coach filter');
    await page.evaluate(() => window.navigate('coaches'));
    await page.waitForTimeout(400);
    await page.waitForTimeout(500);
    check((await page.textContent('#view-coaches')).includes('Hari ini'), 'coach hub shows Hari ini');
    check((await page.textContent('#view-coaches')).includes('Atur target'), 'coach hub offers to set targets');
    // Catatan sesi (Fase I2): sheet bawah, RPE angka, simpan & kirim WA membuka WhatsApp dengan pesan pasca-sesi.
    await page.evaluate(() => { window.__wa = []; window.sendToParentWA = (ph, text) => window.__wa.push({ ph, text }); window.openSessionNote('SCH-A1', true); });
    await page.waitForTimeout(500);
    check(await visible(page, '#sn-dilatih') && (await page.textContent('#sn-title')).includes('Sesi selesai'), 'session note: the sheet opens after "Selesai"');
    check((await page.getAttribute('#sn-rpe', 'inputmode')) === 'numeric', 'session note: RPE uses the numeric keypad');
    const snBtn = await page.locator('#modal-session-note .sheet-foot .btn').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5).length);
    check(snBtn === 0 && (await overflowX(page)) <= 0, 'session note: buttons are at least 44 px and nothing scrolls sideways');
    await page.fill('#sn-rpe', '12');
    await page.click('#sn-wa-btn');
    check((await page.textContent('#sn-err')).includes('RPE harus bilangan bulat 1 sampai 10'), 'session note: a bad RPE is refused before saving');
    await page.fill('#sn-dilatih', 'Squat 3x10');
    await page.fill('#sn-fokus', 'Teknik squat');
    await page.fill('#sn-rpe', '7');
    await page.click('#sn-wa-btn');
    await page.waitForTimeout(900);
    const sentWa = await page.evaluate(() => window.__wa);
    check(sentWa.length === 1 && sentWa[0].text.includes('terima kasih untuk sesi hari ini') && sentWa[0].text.includes('Squat 3x10') && sentWa[0].text.includes('Teknik squat'), 'session note: "Simpan & kirim WA" hands the ready message to WhatsApp');
    const snRow = env.sheet('SessionNotes').rows.find(r => r[1] === 'SCH-A1');
    check(!!snRow && snRow[2] === 'PT-A' && snRow[6] === 7, 'session note: saved for the right client with RPE 7');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);
    // Konten untuk klien (Fase J3): halaman Konten di panel.
    check(await visible(page, '#side-nav .nav-item[data-view="content"]') || (await page.locator('#side-nav .nav-item[data-view="content"]').count()) === 1, 'content: the panel sidebar has Konten');
    await page.evaluate(() => window.navigate('content'));
    await page.waitForTimeout(800);
    check((await page.textContent('#view-content')).includes('Belum ada konten'), 'content: the page starts with a friendly empty state');
    await page.evaluate(() => window.openContentEditor(''));
    await page.waitForTimeout(500);
    check(await visible(page, '#cn-judul') && (await page.locator('#cn-tipe .chip').count()) === 3, 'content: the editor offers three types');
    await page.click('#cn-save');
    await page.waitForTimeout(500);
    check((await page.textContent('#cn-err')).includes('Judul wajib'), 'content: saving without a title is refused in Indonesian');
    await page.click('#cn-tipe .chip[data-v="video"]');
    await page.fill('#cn-judul', 'Teknik squat');
    await page.fill('#cn-url', 'http://tidak-aman.id/v');
    await page.click('#cn-save');
    await page.waitForTimeout(500);
    check((await page.textContent('#cn-err')).includes('Link harus diawali https'), 'content: a non-https link is refused');
    await page.fill('#cn-url', 'https://youtu.be/squat');
    await page.fill('#cn-kategori', 'Latihan');
    await page.check('#cn-sematkan');
    const cnBad = await page.locator('#modal-content .sheet-foot .btn, #cn-tipe .chip').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.width && r.height < 43.5).length);
    check(cnBad === 0 && (await overflowX(page)) <= 0, 'content: editor buttons are at least 44 px and nothing scrolls sideways');
    await page.click('#cn-save');
    await page.waitForTimeout(900);
    check((await page.textContent('#view-content')).includes('Teknik squat') && (await page.textContent('#view-content')).includes('Tayang') && env.sheet('Content').rows.length === 2, 'content: the saved item is listed as "Tayang"');
    await page.evaluate(() => window.navigate('dashboard'));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openTargetsSheet());
    await page.waitForTimeout(400);
    check(await visible(page, '#tg-sesi'), 'targets sheet opens');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openHoursPage());
    await page.waitForTimeout(700);
    check((await page.textContent('#detail-panel')).includes('Ikut jam studio'), 'hours page says the coach follows studio hours when nothing is saved');
    await page.evaluate(() => window.openHoursEditor());
    await page.waitForTimeout(500);
    check(await visible(page, '#coach-hours-rows'), 'hours editor opens');
    await page.evaluate(() => { window.hoursCopyStudio(); window.saveHours(); });
    await page.waitForTimeout(900);
    check((await page.textContent('#detail-panel')).includes('Jam kerja'), 'hours saved and the page reloads');
    await page.evaluate(() => window.openTimeOffSheet());
    await page.waitForTimeout(500);
    check(await visible(page, '#off-from'), 'time-off sheet opens');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);

    // Closing a sheet stacked on top of the detail panel must not leave a full-viewport
    // ghost overlay eating the very next click (was: #sheet-layer kept pointer-events:auto
    // for ~280ms after .open was removed, silently swallowing clicks meant for whatever
    // was underneath, incl. the detail panel's own close button).
    await page.evaluate(() => window.navigate('clients'));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openProfile('PT-A'));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openSheet('modal-edit-schedule'));
    await page.waitForTimeout(400);
    const detailCloseBox = await page.locator('.detail-head .icon-btn[aria-label="Tutup detail"]').boundingBox();
    await page.click('#modal-edit-schedule .icon-btn');
    check((await page.evaluate(() => getComputedStyle(document.getElementById('sheet-layer')).pointerEvents)) === 'none',
      'closing a sheet drops pointer-events on #sheet-layer immediately (no ghost overlay)');
    await page.mouse.click(detailCloseBox.x + detailCloseBox.width / 2, detailCloseBox.y + detailCloseBox.height / 2);
    check(!(await page.evaluate(() => document.getElementById('detail-panel').classList.contains('open'))),
      'a click right under a just-closed sheet reaches the detail panel\'s own close button (not swallowed by a ghost overlay)');
    await page.waitForTimeout(500);

    // Same ghost-overlay check for the confirm modal ("Yakin?").
    await page.evaluate(() => window.showConfirmModal('Yakin?'));
    await page.waitForTimeout(300);
    await page.click('#btn-confirm-modal-no');
    check((await page.evaluate(() => getComputedStyle(document.getElementById('modal-confirm')).pointerEvents)) === 'none',
      'closing the confirm modal drops pointer-events immediately (no ghost overlay)');
    await page.waitForTimeout(500);

    // ── Pengaturan (halaman penuh): daftar + bagian berdampingan di desktop ───
    await page.click('#side-foot .nav-item[data-view="settings"]');
    await page.waitForTimeout(600);
    check(await visible(page, '#view-settings'), 'sidebar "Pengaturan" opens the full settings page');
    check(await visible(page, '#settings-nav') && await visible(page, '#settings-pane'), 'desktop shows the section list and the open section side by side');
    check((await page.locator('#settings-nav .settings-nav-item').count()) === 8, 'settings list has 8 sections');
    check(!(await visible(page, '#settings-savebar')), 'no save bar until something changes');
    await page.click('.settings-nav-item[data-section="notifikasi"]');
    check((await page.inputValue('#set-tgToken')) === '', 'the saved Telegram token is never put in the form');
    check(((await page.getAttribute('#set-tgToken', 'placeholder')) || '').startsWith('••••'), 'the stored token shows only as a mask');
    check((await page.inputValue('#set-tgChat')) === '111', 'Settings pre-fills the saved Telegram chat IDs');
    check(await page.isChecked('[data-k="tgEnabled"]'), 'Telegram toggle defaults to on');
    await page.click('[data-k="tgEnabled"]');
    check(await visible(page, '#settings-savebar'), 'changing a field shows the save bar');
    await page.fill('#set-email', 'not-an-email');
    check(await page.locator('[data-fk="email"].has-error').count() === 1 && await page.isDisabled('#settings-save-btn'), 'invalid email shows an error and blocks saving');
    await page.fill('#set-email', 'gym-owner@example.com');
    check(await page.locator('[data-fk="email"].has-error').count() === 0, 'fixing the email clears the error');
    await page.click('#settings-save-btn');
    await page.waitForTimeout(500);
    check(env.props.TELEGRAM_ENABLED === 'false', 'turning the toggle off is saved');
    check(env.props.NOTIF_EMAIL === 'gym-owner@example.com', 'notification email is saved');
    check(env.props.TELEGRAM_BOT_TOKEN === '1:x', 'saving Notifikasi leaves the stored token alone');
    check((await page.textContent('#toast-msg')).includes('disimpan'), 'a confirmation toast is shown after saving');
    check(!(await visible(page, '#settings-savebar')), 'save bar hides after saving');

    await page.fill('#set-tgChat', '999');
    await page.click('#btn-telegram-test');
    await page.waitForTimeout(400);
    check((await page.textContent('#toast-msg')).includes('Chat ID'), 'the "kirim pesan tes" button reports how many chat IDs received the test');
    check(env.fetches.some(f => f.url.includes('bot1:x')), 'the test uses the stored token when the token field is empty');

    // Jam operasional
    await page.click('.settings-nav-item[data-section="jam"]');   // dirty (chat ID) → confirm
    await page.waitForTimeout(400);
    check(await visible(page, '#modal-confirm'), 'leaving a section with unsaved changes asks first');
    await page.click('#btn-confirm-modal-no');
    await page.waitForTimeout(500);
    check((await page.inputValue('#set-tgChat')) === '999', 'Batal on the question keeps the unsaved edit');
    await page.click('#settings-savebar .btn-secondary');
    check((await page.inputValue('#set-tgChat')) === '111', 'Batal on the save bar restores the saved value');
    await page.click('.settings-nav-item[data-section="jam"]');
    check((await page.inputValue('[data-k="h1s"]')) === '6' && (await page.inputValue('[data-k="h1e"]')) === '21', 'Settings pre-fills today\'s business hours (Senin 06–21)');
    await page.fill('[data-k="h0s"]', '12'); await page.fill('[data-k="h0e"]', '11');
    check(await page.locator('[data-fk="hours0"].has-error').count() === 1 && await page.isDisabled('#settings-save-btn'), 'open ≥ close shows an error and blocks saving');
    await page.fill('[data-k="h0s"]', '8');
    await page.click('#settings-save-btn');
    await page.waitForTimeout(500);
    check(JSON.parse(env.props.BUSINESS_HOURS_JSON)['0'][0] === 8 && JSON.parse(env.props.BUSINESS_HOURS_JSON)['0'][1] === 11, 'business hours override is saved');
    check(env.props.NOTIF_EMAIL === 'gym-owner@example.com', 'saving Jam Operasional leaves other settings alone');

    // Keamanan
    await page.click('.settings-nav-item[data-section="keamanan"]');
    check((await page.getAttribute('#set-loginMaxFails', 'placeholder')) === 'Bawaan 10' && (await page.inputValue('#set-loginMaxFails')) === '', 'a default number shows as the "Bawaan" placeholder');
    await page.fill('#set-loginMaxFails', '4');
    await page.click('#settings-save-btn');
    await page.waitForTimeout(500);
    check(env.props.LOGIN_MAX_FAILS === '4', 'login lockout threshold is saved');
    await page.fill('#set-loginMaxFails', '');
    await page.click('#settings-save-btn');
    await page.waitForTimeout(500);
    check(env.props.LOGIN_MAX_FAILS === undefined, 'clearing a number returns to the default');

    // Pengingat
    await page.click('.settings-nav-item[data-section="pengingat"]');
    await page.waitForTimeout(500);
    check((await page.locator('#settings-body .card-flat .toggle').count()) >= 5, 'Pengingat has a master switch and a card per reminder type (incl. makan pagi/sore)');
    check((await page.textContent('#rmd-status')).includes('belum terpasang'), 'reminder status says the trigger is not installed');
    await page.click('#rmd-status .btn');
    await page.waitForTimeout(500);
    check(env.triggers.length === 1 && (await page.textContent('#rmd-status')).includes('Trigger terpasang'), '"Pasang" installs the reminder trigger from the panel');
    await page.click('[data-k="job-makan-pagi-enabled"]');
    await page.fill('[data-k="job-makan-pagi-hour"]', '7');
    await page.click('#settings-save-btn');
    await page.waitForTimeout(500);
    check(env.props.RMD_MAKAN_PAGI_ENABLED === 'true' && env.props.RMD_MAKAN_PAGI_HOUR === '7', 'meal reminders can be switched on and timed from the panel');

    // ── Pesan ke klien: template + pratinjau, dan saklar per klien ────────────
    await page.click('.settings-nav-item[data-section="pengingat"]');
    await page.waitForTimeout(700);
    check(await page.locator('[data-k="job-sesi-besok-enabled"]').count() === 1, 'Pengingat has a "Sesi besok" card');
    check((await page.locator('#settings-body textarea[data-k$="-tpl"]').count()) === 12, 'every reminder type has an editable client message');
    check((await page.textContent('#pv-pr')).startsWith('Halo Budi, pengingat PR kamu'), 'the preview shows the default client message with sample data');
    check((await page.locator('[data-k="job-rekap-bulanan-enabled"]:not(:checked), [data-k="job-selamat-milestone-enabled"]:not(:checked), [data-k="job-waktunya-ukur-enabled"]:not(:checked)').count()) === 3, 'the three new message types (rekap, milestone, ukur) start switched off');
    check((await page.textContent('#pv-rekap-bulanan')).includes('rekap latihan bulan September') && (await page.textContent('#pv-selamat-milestone')).includes('badge 25 sesi') && (await page.textContent('#pv-waktunya-ukur')).includes('waktunya catat progres'), 'the new types show a preview of their client message');
    await page.click('[data-k="job-waktunya-ukur-enabled"]');
    await page.click('#settings-save-btn');
    await page.waitForTimeout(700);
    check(env.props.RMD_WAKTUNYA_UKUR_ENABLED === 'true', 'a new message type can be switched on from Pengaturan');
    await page.fill('#set-job-pr-tpl', 'Hai {nama}, PR: {pr}');
    await page.waitForTimeout(800);
    check((await page.textContent('#pv-pr')).startsWith('Hai Budi, PR: •'), 'the preview updates while typing');
    await page.fill('#set-job-pr-tpl', 'Hai {foo}');
    check((await page.locator('[data-fk="job-pr-tpl"].has-error').count()) === 1 && await page.isDisabled('#settings-save-btn'), 'an unknown placeholder shows an error and blocks saving');
    await page.fill('#set-job-pr-tpl', 'Hai {nama}, PR: {pr}');
    await page.click('#settings-save-btn');
    await page.waitForTimeout(700);
    check(env.props.RMD_TPL_PR === 'Hai {nama}, PR: {pr}', 'the message template is saved');
    await page.click('#set-job-pr-tpl ~ .link-btn');
    check((await page.inputValue('#set-job-pr-tpl')).startsWith('Halo {nama}'), '"Kembalikan pesan bawaan" restores the default text');
    await page.click('#settings-save-btn');
    await page.waitForTimeout(600);
    check(env.props.RMD_TPL_PR === undefined, 'saving the default text stores no override');

    // ── Paket & Harga (desktop) ───────────────────────────────────────────────
    await page.click('.settings-nav-item[data-section="paket"]');
    await page.waitForTimeout(600);
    check((await page.locator('#pkg-list .pkg-row').count()) === 2, 'Paket & Harga lists the 2 active packages by default');
    await page.click('#pkg-show-inactive');
    check((await page.locator('#pkg-list .pkg-row').count()) === 3 && (await page.locator('.pkg-inactive').count()) === 1, '"Tampilkan nonaktif" adds the inactive package, marked as such');
    await page.click('.chip[data-cat="regular"]');
    check((await page.locator('#pkg-list .pkg-row').count()) === 2, 'category chip filters the list');
    await page.click('#pkg-add');
    await page.waitForTimeout(500);
    check(await visible(page, '#sheet-package'), '"+ Paket" opens the editor');
    await page.click('#pkg-save-btn');
    check((await page.locator('#pkg-f-name.has-error').count()) === 1 && (await page.locator('#pkg-f-price.has-error').count()) === 1, 'saving an empty form shows errors on name and price');
    await page.fill('#pkg-name', 'Pro 12');
    await page.selectOption('#pkg-cat', 'premium');
    await page.fill('#pkg-price', '1200000');
    check((await page.inputValue('#pkg-price')) === '1.200.000', 'price is formatted with thousand separators as you type');
    await page.click('#pkg-flex');
    check(await page.isDisabled('#pkg-sessions'), '"Fleksibel" disables the sessions field');
    await page.click('#pkg-flex');
    await page.fill('#pkg-sessions', '12');
    await page.fill('#pkg-duration', '1 Bulan');
    await page.fill('#pkg-benefit-input', '1-on-1');
    await page.press('#pkg-benefit-input', 'Enter');
    await page.fill('#pkg-benefit-input', 'Diet');
    await page.click('#form-package .pkg-benefit-add .btn');
    check((await page.locator('#pkg-benefits .chip').count()) === 2, 'Enter and "Tambah" add benefit chips');
    await page.click('#pkg-save-btn');
    await page.waitForTimeout(700);
    const newRow = env.sheet('PriceList').rows.find(r => r[1] === 'Pro 12');
    check(!!newRow && newRow[3] === 1200000 && newRow[4] === 12 && newRow[7] === '1-on-1, Diet' && newRow[8] === false, 'new package is saved to the sheet (inactive, price as a number, benefits joined)');
    check(/^PKG-\d{8}-/.test(newRow[0]), 'the package ID is generated by the server');
    check(!(await visible(page, '#sheet-package')), 'the editor closes after saving');
    check(!(await page.evaluate(() => window.priceListData.some(p => p.namaPaket === 'Pro 12'))), 'an inactive package is not in the public price list');
    await page.click('.chip[data-cat="premium"]');
    await page.click('#pkg-list [data-pkg="' + newRow[0] + '"]');
    await page.waitForTimeout(600);
    check(await page.evaluate(() => window.priceListData.some(p => p.namaPaket === 'Pro 12')), 'switching a package on updates the price list in the panel without a reload');
    check(env.call('getPriceList').some(p => p.namaPaket === 'Pro 12'), 'and it appears on the public price list');
    await page.click('.chip[data-cat="regular"]');
    await page.click('[data-pkg-row="P1"] .icon-btn[aria-label^="Menu"]');
    await page.waitForTimeout(500);
    check(await page.isDisabled('#pkg-menu-delete') && (await page.textContent('#pkg-menu-delete-note')).includes('Dipakai 2 klien'), 'a package in use cannot be deleted, and the reason is shown');
    await page.click('#sheet-pkg-menu .icon-btn');
    await page.waitForTimeout(500);

    // ── Saklar pengingat per klien (halaman klien) ─────────────────────────────
    await page.evaluate(() => window.navigate('clients', { force: true }));
    await page.waitForTimeout(400);
    check((await page.locator('#view-clients .client-kpis .kpi').count()) === 4, 'Klien list: four summary tiles that also filter');
    await page.evaluate(() => { window.navigate('clients'); window.openProfile('PT-A'); });
    await page.waitForTimeout(700);
    check((await page.locator('#profile-remind-prefs input[data-remind]:checked').count()) === 8, 'client page: all eight reminder switches start on');
    await page.click('#profile-remind-prefs input[data-remind="pr"]');
    await page.waitForTimeout(600);
    check(env.memberRow('PT-A')[15] === 'pr', 'client page: switching PR off is saved for that client (MemberData column P)');
    await page.click('#profile-remind-prefs input[data-remind="pr"]');
    await page.waitForTimeout(500);
    check(env.memberRow('PT-A')[15] === '', 'client page: switching it back on clears it');

    // ── Progres di halaman klien (panel) ───────────────────────────────────────
    check(await visible(page, '.client-hero') && (await page.locator('#detail-body [data-cptab]').count()) === 5, 'client page: dark hero and five tabs (Ringkasan, Progres, Program, Perawatan, Riwayat)');
    const tabBox = await page.evaluate(() => { const t = document.querySelector('#detail-body .cp-tabs'), d = document.querySelector('#detail-body'); if (!t || !d) return null; const r = t.getBoundingClientRect(), dr = d.getBoundingClientRect(); return { l: Math.round(r.left - dr.left), r: Math.round(dr.right - r.right), over: t.scrollWidth - t.clientWidth, chips: Array.from(t.children).map(c => Math.round(c.scrollWidth - c.clientWidth)) }; });
    check(!!tabBox && tabBox.l >= 0 && tabBox.r >= 0 && tabBox.over <= 1 && tabBox.chips.every(x => x <= 1), 'client page: the tab pills stay inside the panel (no bleed) ' + JSON.stringify(tabBox));
    await page.evaluate(() => { const b = document.querySelector('#detail-body'); if (b) b.scrollTop = 0; });
    await shot(page, 'admin-client-tabs');
    await page.evaluate(() => window.cpTab('progres'));
    await page.waitForTimeout(300);
    check(await visible(page, '#profile-progress-wrap') && (await page.textContent('#profile-progress-wrap')).includes('Belum ada catatan'), 'client page: a Progres section is shown');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.cpTab('perawatan'));
    await page.waitForTimeout(300);
    check((await page.textContent('#profile-care-wrap')).includes('Catatan privat') && (await page.textContent('#profile-care-wrap')).includes('Tes kebugaran'), 'client page: private notes, health, assessment and fitness sections');
    const careCols = await page.evaluate(() => Array.from(document.querySelectorAll('#profile-care-wrap > .cp-col')).map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
    check(careCols.length === 2 && careCols[1][0] > careCols[0][0] && Math.abs(careCols[1][1] - careCols[0][1]) <= 2 && (await page.evaluate(() => getComputedStyle(document.querySelector('#detail-body [data-cppane="ringkasan"]')).display)) === 'none',
      'wide client page: Perawatan in two columns, hidden tabs stay hidden ' + JSON.stringify(careCols));
    await page.evaluate(() => window.openCareTests('PT-A'));
    await page.waitForTimeout(500);
    check(await visible(page, '#ft-pushup') && (await page.getAttribute('#ft-pushup', 'inputmode')) === 'decimal', 'fitness test sheet opens with a decimal keypad');
    // Timer 1 menit di tes kebugaran: hitung mundur, jeda, ulang, selesai (jam sistem digeser), plank = stopwatch.
    check(!(await visible(page, '#ft-timer')) && (await page.locator('#ft-fields .tm-start').count()) === 3, 'fitness tests: push-up, squat and plank each get a timer button');
    await page.click('#ft-pushup >> xpath=following-sibling::button');
    check(await visible(page, '#ft-timer') && (await page.textContent('#ft-timer-time')) === '1:00' && (await page.textContent('#ft-timer-label')).includes('Push-up'), 'timer: opens for push-up at 1:00');
    await page.click('#ft-timer-toggle');
    await page.waitForTimeout(1300);
    const running = await page.textContent('#ft-timer-time');
    check(/^0:5[7-9]$/.test(running), 'timer: counts down from 1:00 (' + running + ')');
    await page.click('#ft-timer-toggle');
    const paused = await page.textContent('#ft-timer-time');
    await page.waitForTimeout(800);
    check((await page.textContent('#ft-timer-time')) === paused && (await page.textContent('#ft-timer-toggle')) === 'Lanjut', 'timer: pause holds the time and offers "Lanjut"');
    await page.click('#ft-timer-toggle');
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 61000; });
    await page.waitForTimeout(500);
    check((await page.textContent('#ft-timer-time')) === '0:00' && (await page.locator('#ft-timer.done').count()) === 1, 'timer: finishes at 0:00');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'ft-pushup', 'timer: focus moves to the push-up field when time is up');
    const tmBtn = await page.locator('#ft-timer .btn, #ft-fields .tm-start').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.width && r.height < 43.5).length);
    check(tmBtn === 0, 'timer: every timer button is at least 44 px');
    await page.click('#ft-timer .btn-outline');
    check((await page.textContent('#ft-timer-time')) === '1:00', 'timer: "Ulang" returns to 1:00');
    await page.click('#ft-plank >> xpath=following-sibling::button');
    await page.click('#ft-timer-toggle');
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 42000; });
    await page.waitForTimeout(400);
    await page.click('#ft-timer-toggle');
    check(parseInt(await page.inputValue('#ft-plank'), 10) >= 42, 'timer: the plank stopwatch writes its seconds into the field');
    check((await overflowX(page)) <= 0, 'fitness tests sheet: no sideways scroll on the phone');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.openAssessment('PT-A'));
    await page.waitForTimeout(500);
    check(await visible(page, '#as-goal'), 'assessment sheet opens');
    check((await page.locator('#modal-care-assess input[inputmode=decimal]').count()) === 10, 'assessment: weight, waist, six body measures, body fat and hip');
    check(!(await page.locator('#as-chest').count()) && (await page.locator('#as-lenganKanan').count()) === 1, 'assessment: the old chest and arm fields are replaced by right/left arm, abdomen, thighs and chest');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);
    // Program latihan (Fase J2): tab Program di halaman klien, editor teks, template.
    await page.evaluate(() => window.cpTab('program'));
    await page.waitForTimeout(300);
    check((await page.textContent('#profile-program-wrap')).includes('Belum ada') && (await page.textContent('#profile-program-wrap')).includes('Buat program'), 'client page: the Program tab starts empty with a "Buat program" button');
    await page.click('#profile-program-wrap .btn-primary');
    await page.waitForTimeout(600);
    check(await visible(page, '#prg-text') && (await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('prg-text')).fontSize))) >= 16, 'program editor: opens with a 16 px text box');
    await page.fill('#prg-text', 'Squat');
    await page.click('#prg-save');
    await page.waitForTimeout(600);
    check((await page.textContent('#prg-err')).includes('Baris 1: tulis set dan rep'), 'program editor: a bad line is named with its number');
    await page.fill('#prg-text', '# Hari A\nBench press | 3x10 | turun pelan | https://youtu.be/abc\nPush-up | 3x12\n\n# Hari B\nSquat | 4x8');
    await page.click('#modal-program details > summary');
    await page.fill('#prg-tpl-name', 'Pemula 2 hari');
    await page.click('#prg-tpl-save');
    await page.waitForTimeout(700);
    check(env.sheet('ProgramItems').rows.some(r => !r[1] && r[2] === 'Pemula 2 hari'), 'program editor: "Simpan template" stores a reusable template');
    const prgBad = await page.locator('#modal-program .sheet-foot .btn').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.width && r.height < 43.5).length);
    check(prgBad === 0 && (await overflowX(page)) <= 0, 'program editor: footer buttons are at least 44 px and nothing scrolls sideways');
    await page.click('#prg-save');
    await page.waitForTimeout(800);
    check((await page.textContent('#profile-program-wrap')).includes('2 hari · 3 gerakan') && env.sheet('ProgramItems').rows.filter(r => r[1] === 'PT-A').length === 3, 'program: saved for the client and summarised on the client page');
    const prgDays = await page.evaluate(() => Array.from(document.querySelectorAll('#profile-program-wrap .prg-days > div')).map(d => { const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
    check(prgDays.length === 2 && prgDays[0][1] === prgDays[1][1] && prgDays[0][0] !== prgDays[1][0], 'wide client page: program days sit side by side ' + JSON.stringify(prgDays));
    await page.evaluate(() => window.cpTab('progres'));
    await page.waitForTimeout(300);
    check((await page.textContent('#profile-progress-wrap')).includes('sesi selesai') && (await page.textContent('#profile-progress-wrap')).includes('10 sesi'), 'client page: streak, completed sessions and earned badges are summarised');
    await page.click('#profile-progress-wrap .btn-outline');
    await page.waitForTimeout(600);
    check(await visible(page, '#pg-date-field'), 'client page: the coach can choose the date');
    await page.fill('#pg-berat', '73');
    await page.click('#pg-save-btn');
    await page.waitForTimeout(800);
    const crow = env.sheet('Progress').rows.find(r => r[1] === 'PT-A' && r[5] === 'coach');
    check(!!crow && crow[3] === 73, 'client page: a coach entry is saved and marked "coach"');
    check((await page.textContent('#profile-progress-wrap')).includes('coach') && (await page.textContent('#profile-progress-wrap')).includes('73'), 'client page: the entry and its author are listed');
    const chartW = await page.evaluate(() => { const c = document.querySelector('#profile-progress-wrap .pg-chart'); return c ? Math.round(c.getBoundingClientRect().width) : 0; });
    check(chartW >= 200 && chartW <= 420, 'wide client page: the progress chart keeps a sensible size (' + chartW + ' px)');
    await page.click('#profile-progress-wrap .list-item .icon-btn');
    await page.waitForTimeout(300);
    await page.click('#btn-confirm-modal-yes');
    await page.waitForTimeout(700);
    check(!env.sheet('Progress').rows.some(r => r[1] === 'PT-A' && r[5] === 'coach'), 'client page: a coach can delete an entry');
    noErrors(errors);
    await context.close();
  }

  // ── Keuangan · HP (touch, terang & gelap) + desktop ───────────────────────
  for (const scheme of ['light', 'dark']) {
    console.log('Keuangan · HP · ' + scheme);
    const env = richEnv();
    const token = env.adminToken();
    const wib = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    env.call('updateAppSettings', token, { finance: { enabled: true } });
    env.call('addMember', token, { name: 'Budi Keuangan', phone: '081399990001', goal: 'Fit', packageId: 'P1' });
    env.call('saveExpense', token, { amount: 250000, date: wib, category: 'Sewa tempat', method: 'Tunai', note: 'Sewa gym' });
    const { page, errors } = await openPage(browser, env, '/Index', [], { xnk_admin_token: token, xnk_fin_on: '1' }, { touch: true, colorScheme: scheme, wait: 1400 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const small = sel => page.evaluate(s => {
      const bad = [];
      document.querySelectorAll(s).forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
        if (r.height < 43.5) bad.push((el.className || el.tagName) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
      });
      return bad;
    }, sel);
    check((await page.evaluate(() => !!document.querySelector('.fin-tile:not(.hide)'))), 'phone: the + sheet offers Pembayaran and Pengeluaran when Keuangan is on');
    await page.evaluate(() => window.navigate('finance'));
    await page.waitForTimeout(900);
    check(await visible(page, '#view-finance'), 'phone: the Keuangan page opens');
    check(((await page.textContent('#fin-head')) || '').includes('Tunggakan'), 'phone: the four summary tiles are shown');
    check(((await page.textContent('#fin-list')) || '').includes('Budi Keuangan'), 'phone: the open bill is listed under Belum lunas');
    check((await overflow()) <= 0, 'phone: Keuangan has no sideways scroll');
    check((await small('#view-finance button.chip, #view-finance .list-item, #view-finance .btn')).length === 0, 'phone: Keuangan touch targets are at least 44 px (' + (await small('#view-finance button.chip, #view-finance .list-item, #view-finance .btn')).join(', ') + ')');
    await shot(page, 'finance-mobile-' + scheme);
    // detail tagihan + bayar
    await page.click('#fin-list .list-item');
    await page.waitForTimeout(700);
    check(((await page.textContent('#detail-body')) || '').includes('Belum bayar'), 'phone: the bill detail shows its status');
    await page.click('#detail-body .btn-primary');
    await page.waitForTimeout(600);
    check(await visible(page, '#sheet-fin-payment'), 'phone: Bayar opens the payment sheet');
    check((await page.getAttribute('#fin-pay-amount', 'inputmode')) === 'numeric', 'phone: the amount field uses the numeric keyboard');
    check((await small('#sheet-fin-payment .chip, #sheet-fin-payment .btn, #sheet-fin-payment input:not([type=file]), #sheet-fin-payment select')).length === 0, 'phone: payment sheet targets are at least 44 px (' + (await small('#sheet-fin-payment .chip, #sheet-fin-payment .btn, #sheet-fin-payment input:not([type=file]), #sheet-fin-payment select')).join(', ') + ')');
    await page.fill('#fin-pay-amount', '300000');
    check((await page.inputValue('#fin-pay-amount')) === '300.000', 'phone: the amount shows thousand separators while typing');
    await shot(page, 'finance-payment-mobile-' + scheme);
    await page.click('#fin-pay-save');
    await page.waitForTimeout(900);
    check(!(await visible(page, '#sheet-fin-payment')), 'phone: a saved payment closes the sheet');
    check(((await page.textContent('#detail-body')) || '').includes('DP'), 'phone: the bill becomes DP after a part payment');
    // pengeluaran + laporan
    await page.evaluate(() => { window.closeDetail(); window.finTab('exps'); });
    await page.waitForTimeout(700);
    check(((await page.textContent('#fin-list')) || '').includes('Sewa tempat'), 'phone: the expense list shows the recorded expense');
    await page.evaluate(() => window.finTab('report'));
    await page.waitForTimeout(700);
    check(((await page.textContent('#fin-list')) || '').includes('Ekspor CSV'), 'phone: the report tab offers CSV export');
    check((await overflow()) <= 0, 'phone: the report tab has no sideways scroll');
    await shot(page, 'finance-report-mobile-' + scheme);
    // Pengaturan → Keuangan
    await page.evaluate(() => window.navigate('settings', { force: true }));
    await page.waitForTimeout(500);
    await page.click('.settings-nav-item[data-section="keuangan"]');
    await page.waitForTimeout(900);
    check(((await page.textContent('#settings-body')) || '').includes('Metode bayar'), 'phone: Pengaturan → Keuangan shows methods, categories and coach share');
    check((await overflow()) <= 0, 'phone: Pengaturan → Keuangan has no sideways scroll');
    check(errors.length === 0, 'Keuangan: no page errors (' + errors.join(' | ') + ')');
    await page.context().close();
  }
  console.log('Keuangan · desktop');
  {
    const env = richEnv();
    const token = env.adminToken();
    env.call('updateAppSettings', token, { finance: { enabled: true } });
    const { page, errors } = await openPage(browser, env, '/Index', [], { xnk_admin_token: token, xnk_fin_on: '1' }, { viewport: DESKTOP, wait: 1400 });
    check(await visible(page, '#side-nav .nav-item[data-view="finance"]'), 'desktop: the sidebar has Keuangan');
    await page.click('#side-nav .nav-item[data-view="finance"]');
    await page.waitForTimeout(800);
    check(await visible(page, '#view-finance'), 'desktop: Keuangan opens');
    await shot(page, 'finance-desktop');
    check(errors.length === 0, 'desktop Keuangan: no page errors (' + errors.join(' | ') + ')');
    await page.context().close();
  }
  console.log('Keuangan mati: menu tersembunyi');
  {
    const env = richEnv();
    const { page } = await openPage(browser, env, '/Index', [], { xnk_admin_token: env.adminToken() }, { viewport: DESKTOP, wait: 1200 });
    check(!(await visible(page, '#side-nav .nav-item[data-view="finance"]')), 'off by default: no Keuangan in the sidebar');
    check(!(await page.evaluate(() => !!document.querySelector('.fin-tile:not(.hide)'))), 'off by default: no finance tiles in the + sheet');
    await page.context().close();
  }

  // ── Pengaturan · HP (touch, terang & gelap) ───────────────────────────────
  for (const scheme of ['light', 'dark']) {
    console.log('Pengaturan · HP · ' + scheme);
    const env = richEnv();
    const token = env.adminToken();
    const { page, context, errors } = await openPage(browser, env, '/Index', [], { xnk_admin_token: token }, { touch: true, colorScheme: scheme, wait: 1400 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // Tombol/kolom yang bisa disentuh di bagian yang terbuka harus ≥ 44 px
    const smallTargets = () => page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#settings-pane button, #settings-pane input:not([type=hidden]), #settings-pane textarea, #settings-nav button').forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
        if (r.height < 43.5 || r.width < 43.5) bad.push((el.getAttribute('data-k') || el.className || el.tagName) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
      });
      return bad;
    });

    await page.click('#topbar-actions .icon-btn[aria-label="Pengaturan"]');
    await page.waitForTimeout(700);
    check(await visible(page, '#view-settings') && await visible(page, '#settings-nav'), 'phone: the gear opens Pengaturan with the section list');
    check(!(await visible(page, '#settings-pane')), 'phone: only the list is shown until a section is chosen');
    check(await visible(page, '#tabbar'), 'phone: the bottom bar stays visible');
    check((await overflow()) <= 0, 'phone: settings list has no sideways scroll');
    check((await smallTargets()).length === 0, 'phone: list rows are at least 44 px tall (' + (await smallTargets()).join(', ') + ')');
    await shot(page, 'settings-mobile-list-' + scheme);

    for (const id of ['tampilan', 'paket', 'pengingat', 'notifikasi', 'jam', 'keamanan', 'akun']) {
      await page.click('.settings-nav-item[data-section="' + id + '"]');
      await page.waitForTimeout(500);
      check(await visible(page, '#settings-pane') && !(await visible(page, '#settings-nav')), 'phone: "' + id + '" opens full-width with the list hidden');
      check((await overflow()) <= 0, 'phone: "' + id + '" has no sideways scroll');
      const bad = await smallTargets();
      check(bad.length === 0, 'phone: "' + id + '" touch targets ≥ 44 px' + (bad.length ? ' — ' + bad.join(', ') : ''));
      const fs = await page.evaluate(() => Array.from(document.querySelectorAll('#settings-body input.input, #settings-body textarea')).filter(e => e.getBoundingClientRect().width).map(e => parseFloat(getComputedStyle(e).fontSize)));
      check(fs.every(x => x >= 16), 'phone: "' + id + '" inputs are 16 px (no iOS zoom)');
      if (id === 'jam') await shot(page, 'settings-mobile-jam-' + scheme);
      if (id === 'pengingat') await shot(page, 'settings-mobile-pengingat-' + scheme);
      await page.goBack();
      await page.waitForTimeout(400);
      check(await visible(page, '#settings-nav') && !(await visible(page, '#settings-pane')), 'phone: back gesture from "' + id + '" returns to the list');
    }

    // Paket & Harga di HP
    await page.click('.settings-nav-item[data-section="paket"]');
    await page.waitForTimeout(600);
    const chipsBox = await page.locator('#pkg-chips').boundingBox();
    check(chipsBox.width <= MOBILE.width && (await overflow()) <= 0, 'phone: category chips scroll inside their own row, not the page');
    await page.click('.chip[data-cat="regular"]');
    await page.click('#pkg-show-inactive');
    await page.click('#pkg-reorder-btn');
    check((await page.locator('#pkg-list .icon-btn[aria-label^="Turunkan"]').count()) === 2, 'phone: "Urutkan" shows up/down buttons (no drag on phones)');
    const arrows = await page.evaluate(() => Array.from(document.querySelectorAll('#pkg-list .icon-btn')).map(e => e.getBoundingClientRect()).filter(r => r.width).every(r => r.width >= 44 && r.height >= 44));
    check(arrows, 'phone: reorder buttons are at least 44 px');
    const first = await page.evaluate(() => document.querySelector('#pkg-list .pkg-row').getAttribute('data-pkg-row'));
    await page.click('#pkg-list .pkg-row .icon-btn[aria-label^="Turunkan"]');
    await page.waitForTimeout(600);
    const afterFirst = await page.evaluate(() => document.querySelector('#pkg-list .pkg-row').getAttribute('data-pkg-row'));
    check(afterFirst !== first, 'phone: moving a package down changes the order');
    check(env.sheet('PriceList').rows.find(r => r[0] === first)[9] === 2, 'phone: the new order is saved (Urutan)');
    await page.click('#pkg-reorder-btn');
    await page.click('[data-pkg-row="P1"] .icon-btn[aria-label^="Menu"]');
    await page.waitForTimeout(500);
    check(await visible(page, '#sheet-pkg-menu'), 'phone: the ⋯ button opens an action sheet');
    await page.click('#sheet-pkg-menu .list-item:first-of-type');
    await page.waitForTimeout(900);
    const sheet = await page.locator('#sheet-package').boundingBox();
    check(!!sheet && sheet.height >= MOBILE.height * 0.9, 'phone: the editor is a full-height sheet (' + Math.round(sheet && sheet.height) + ' px)');
    const foot = await page.locator('#sheet-package .sheet-foot').boundingBox();
    check(!!foot && foot.y + foot.height <= MOBILE.height + 1, 'phone: "Simpan paket" stays visible at the bottom of the sheet');
    check((await page.getAttribute('#pkg-price', 'inputmode')) === 'numeric' && (await page.getAttribute('#pkg-sessions', 'inputmode')) === 'numeric', 'phone: price and sessions open the numeric keypad');
    const sheetBad = await page.evaluate(() => Array.from(document.querySelectorAll('#sheet-package button, #sheet-package input:not([type=checkbox]), #sheet-package select, #sheet-package textarea, #sheet-package .pkg-flex')).map(e => ({ n: e.id || e.className, r: e.getBoundingClientRect() })).filter(x => x.r.width && x.r.height && (x.r.height < 43.5 || x.r.width < 43.5)).map(x => x.n + ' ' + Math.round(x.r.width) + '×' + Math.round(x.r.height)));
    check(sheetBad.length === 0, 'phone: editor touch targets ≥ 44 px' + (sheetBad.length ? ' — ' + sheetBad.join(', ') : ''));
    const fsz = await page.evaluate(() => Array.from(document.querySelectorAll('#sheet-package input.input, #sheet-package textarea, #sheet-package select')).map(e => parseFloat(getComputedStyle(e).fontSize)));
    check(fsz.every(x => x >= 16), 'phone: editor inputs are 16 px (no iOS zoom)');
    check((await overflow()) <= 0, 'phone: the editor has no sideways scroll');
    await shot(page, 'settings-mobile-paket-editor-' + scheme);
    await page.click('#sheet-package .icon-btn');
    await page.waitForTimeout(600);
    await page.goBack();
    await page.waitForTimeout(400);

    // Keyboards
    await page.click('.settings-nav-item[data-section="jam"]');
    check((await page.getAttribute('[data-k="h0s"]', 'inputmode')) === 'numeric', 'phone: hour fields open the numeric keypad');
    await page.goBack(); await page.waitForTimeout(300);
    await page.click('.settings-nav-item[data-section="notifikasi"]');
    check((await page.getAttribute('#set-email', 'type')) === 'email', 'phone: email field opens the email keyboard');
    await page.goBack(); await page.waitForTimeout(300);

    // Bar simpan di atas bar bawah, tidak menutup kolom terakhir
    await page.click('.settings-nav-item[data-section="keamanan"]');
    await page.waitForTimeout(300);
    await page.fill('#set-adminSessionDays', '14');
    check(await visible(page, '#settings-savebar'), 'phone: editing shows the save bar');
    await page.evaluate(() => { const m = document.getElementById('main-scroll-area'); m.scrollTo({ top: m.scrollHeight }); });
    await page.waitForTimeout(300);
    const geo = await page.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const inputs = Array.from(document.querySelectorAll('#settings-body .input')).filter(e => e.getBoundingClientRect().width);
      const last = inputs[inputs.length - 1].getBoundingClientRect();
      return { barTop: r('settings-savebar').top, barBottom: r('settings-savebar').bottom, tabTop: r('tabbar').top, lastBottom: last.bottom };
    });
    check(geo.barBottom <= geo.tabTop, 'phone: the save bar sits above the bottom bar (' + Math.round(geo.barBottom) + ' ≤ ' + Math.round(geo.tabTop) + ')');
    check(geo.lastBottom <= geo.barTop, 'phone: the save bar does not cover the last field (' + Math.round(geo.lastBottom) + ' ≤ ' + Math.round(geo.barTop) + ')');
    await shot(page, 'settings-mobile-savebar-' + scheme);

    // Gerakan kembali dengan perubahan belum disimpan → tanya dulu
    await page.goBack();
    await page.waitForTimeout(500);
    check(await visible(page, '#modal-confirm'), 'phone: back gesture with unsaved changes asks before leaving');
    check(await visible(page, '#settings-pane'), 'phone: the section stays open while the question is shown');
    await page.click('#btn-confirm-modal-yes');
    await page.waitForTimeout(700);
    check(await visible(page, '#settings-nav') && !(await visible(page, '#settings-pane')), 'phone: confirming discards the edit and returns to the list');
    check(env.props.ADMIN_SESSION_DAYS === undefined, 'phone: the discarded edit was never saved');

    // Pindah tab saat ada perubahan belum disimpan
    await page.click('.settings-nav-item[data-section="keamanan"]');
    await page.fill('#set-adminSessionDays', '9');
    await page.click('#tabbar .tab[data-view="dashboard"]');
    await page.waitForTimeout(400);
    check(await visible(page, '#modal-confirm'), 'phone: switching tab with unsaved changes asks first');
    await page.click('#btn-confirm-modal-no');
    await page.waitForTimeout(500);
    check((await page.evaluate(() => window.currentView)) === 'settings', 'phone: choosing Batal stays on Pengaturan');

    // Pesan ke klien & saklar per klien di HP
    await page.evaluate(() => window.navigate('dashboard', { force: true }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.navigate('settings', { force: true }));
    await page.waitForTimeout(500);
    await page.click('.settings-nav-item[data-section="pengingat"]');
    await page.waitForTimeout(700);
    const bub = await page.locator('#pv-pr').boundingBox();
    check(!!bub && bub.width <= 322 && (await overflow()) <= 0, 'phone: the message preview is a WhatsApp-style bubble (' + Math.round(bub && bub.width) + ' px wide) without sideways scroll');
    check(((await page.textContent('#pv-pr')) || '').startsWith('Halo Budi'), 'phone: the preview text is loaded');
    await page.evaluate(() => window.navigate('clients', { force: true }));
    await page.evaluate(() => window.openProfile('PT-A'));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.cpTab('ringkasan'));
    const remind = await page.evaluate(() => Array.from(document.querySelectorAll('#profile-remind-prefs .list-item')).map(e => Math.round(e.getBoundingClientRect().height)));
    check(remind.length === 8 && remind.every(x => x >= 44), 'phone: client reminder switches are 44 px+ rows (' + remind.join(', ') + ')');
    const hit = await page.evaluate(() => Array.from(document.querySelectorAll('#profile-remind-prefs input[data-remind]')).map(e => e.getBoundingClientRect()).every(r => r.height >= 43.5 && r.width >= 43.5));
    check(hit, 'phone: the switch touch area is at least 44 × 44 px');
    check((await overflow()) <= 0, 'phone: the client page has no sideways scroll');
    await shot(page, 'client-reminders-mobile-' + scheme);
    for (const tab of ['ringkasan', 'progres', 'perawatan', 'riwayat']) {
      await page.evaluate(t => { window.cpTab(t); const b = document.querySelector('#detail-body'); if (b) b.scrollTop = 0; }, tab);
      await page.waitForTimeout(250);
      await shot(page, 'phone-client-' + tab + '-' + scheme);
    }
    await page.evaluate(() => { window.cpTab('ringkasan'); window.closeDetail(); window.navigate('clients', { force: true }); });
    await page.waitForTimeout(500);
    await shot(page, 'phone-klien-' + scheme);
    noErrors(errors);
    await context.close();
  }

  // ── Perpanjang paket (Fase D3): klien minta di HP, admin menyetujui di desktop ───
  console.log('Perpanjang paket · portal HP + panel desktop');
  {
    const env = richEnv();
    env.memberRow('PT-A')[9] = 9;                     // 1 session left
    const memberToken = env.memberToken(KEY_A);
    const { page, context, errors } = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: memberToken }, { wait: 1500 });
    check(await visible(page, '#pub-quota-warning') && (await page.textContent('#pub-quota-warning-text')).includes('Sisa 1 sesi'), 'renewal: with 1 session left the home screen offers to renew');
    await shot(page, 'renew-mobile-notice');
    await page.click('#pub-renew-btn');
    await page.waitForTimeout(600);
    check(await visible(page, '#sheet-renew') && (await page.locator('#renew-list .list-item').count()) === 2, 'renewal: the renew sheet lists the active packages');
    const rowH = await page.evaluate(() => Array.from(document.querySelectorAll('#renew-list .list-item')).map(e => Math.round(e.getBoundingClientRect().height)));
    check(rowH.every(x => x >= 56), 'renewal: package rows are big enough to tap (' + rowH.join(', ') + ' px)');
    check((await page.textContent('#renew-list')).includes('Rp'), 'renewal: each package shows its price');
    check((await overflowX(page)) <= 0, 'renewal: the sheet has no sideways scroll');
    await shot(page, 'renew-mobile-sheet');
    await page.click('#renew-list .list-item');
    await page.waitForTimeout(400);
    check(await visible(page, '#modal-confirm'), 'renewal: choosing a package asks to confirm first');
    await page.click('#btn-confirm-modal-yes');
    await page.waitForTimeout(900);
    const req = env.sheet('RenewalRequests') && env.sheet('RenewalRequests').rows[1];
    check(!!req && req[1] === 'PT-A' && req[3] === 'menunggu', 'renewal: the request is recorded for this client');
    check(await visible(page, '#wa-prompt') && ((await page.getAttribute('#wa-prompt a', 'href')) || '').startsWith('https://wa.me/') && decodeURIComponent(await page.getAttribute('#wa-prompt a', 'href')).includes('perpanjang paket'), 'renewal: a WhatsApp button with the typed order appears');
    check((await page.textContent('#pub-renew-slot')).includes('Menunggu konfirmasi'), 'renewal: the home screen now says "Menunggu konfirmasi"');
    check(env.fetches.some(f => JSON.parse(f.options.payload).text.includes('MINTA PERPANJANG')), 'renewal: the owner gets a Telegram notice');
    await shot(page, 'renew-mobile-pending');
    await page.reload();
    await page.waitForTimeout(1600);
    check((await page.textContent('#pub-renew-slot')).includes('Menunggu konfirmasi'), 'renewal: the pending status survives a reload');
    noErrors(errors);
    await context.close();

    const adminToken = env.adminToken();
    const adm = await openPage(browser, env, '/Index', [], { xnk_admin_token: adminToken }, { viewport: DESKTOP, wait: 1500 });
    check(await visible(adm.page, '#renewals-card') && (await adm.page.textContent('#renewals-card')).includes('Ani Anggraini'), 'renewal: the dashboard shows "Minta perpanjang" with the client');
    await adm.page.evaluate(() => window.navigate('clients'));
    await adm.page.waitForTimeout(400);
    check(await visible(adm.page, '#client-list [data-key="client:PT-A"] .cc-renew'), 'renewal: the client\'s card on the Klien page says "Minta perpanjang"');
    await adm.page.evaluate(() => window.navigate('dashboard'));
    await adm.page.waitForTimeout(400);
    await adm.page.click('#renewals-card .btn-primary');
    await adm.page.waitForTimeout(400);
    check(await visible(adm.page, '#modal-confirm'), 'renewal: approving asks for confirmation first');
    await adm.page.click('#btn-confirm-modal-yes');
    await adm.page.waitForTimeout(1200);
    check(env.memberRow('PT-A')[9] === 0 && env.memberRow('PT-A')[8] === 8, 'renewal: approving resets the client\'s sessions to the new package');
    check(env.sheet('RenewalRequests').rows[1][3] === 'disetujui', 'renewal: the request is marked as approved');
    check(!(await visible(adm.page, '#renewals-card')), 'renewal: the card disappears once nothing is pending');
    check(env.sheet('Members').rows.some(r => r[1] === 'PT-A' && r[3] === 'Perpanjang' && r[10] === 800000), 'renewal: the transaction is logged with the package price');
    noErrors(adm.errors);
    await adm.context.close();
  }

  // ── Panduan klien baru (portal): layar gelap, satu tombol disorot ─────────
  console.log('Panduan klien baru · portal HP');
  {
    const env = richEnv();
    const reg = env.call('registerNewClient', { name: 'Nadia Baru', phone: '6289900000001', goal: 'Weight Loss', packageId: 'P1' });
    const guideCol = () => String(env.memberRow(reg.id)[22] || '');
    const tipTitle = page => page.textContent('#guide-title').catch(() => '');
    const { page, context, errors } = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: reg.token }, { wait: 1500 });
    await page.waitForTimeout(800);
    check(await visible(page, '#guide-layer'), 'guide: a new client sees the guide on the home screen');
    check((await tipTitle(page)) === 'Sisa sesimu', 'guide: the first step points at the remaining sessions');
    const geo = await page.evaluate(() => {
      const spot = document.getElementById('guide-spot').getBoundingClientRect();
      const tip = document.getElementById('guide-tip').getBoundingClientRect();
      const ring = document.querySelector('.portal-hero .ring-wrap').getBoundingClientRect();
      const btns = Array.from(document.querySelectorAll('#guide-tip .btn, #guide-tip .guide-x, #guide-tip .guide-off')).map(b => Math.round(b.getBoundingClientRect().height));
      return { spotOk: spot.left <= ring.left && spot.right >= ring.right && spot.top <= ring.top && spot.bottom >= ring.bottom,
        tipIn: tip.left >= 0 && tip.right <= innerWidth && tip.top >= 0 && tip.bottom <= innerHeight,
        overlap: !(tip.bottom <= spot.top || tip.top >= spot.bottom), btns: btns,
        dark: getComputedStyle(document.querySelector('#guide-hole')).fill.includes('0.85') };
    });
    check(geo.spotOk, 'guide: the bright box surrounds the highlighted element');
    check(geo.tipIn && !geo.overlap, 'guide: the text card fits the phone screen and does not cover the highlighted element');
    check(geo.btns.every(x => x >= 44), 'guide: guide buttons are at least 44 px (' + geo.btns.join(', ') + ')');
    check(geo.dark, 'guide: the rest of the screen is dark');
    check((await brightness(page, 20, 470)) < 64, 'guide: the screen outside the highlight is really dark (light theme)');
    check((await page.locator('#guide-tip .guide-dots i').count()) === 5 && (await page.textContent('#guide-tip .guide-count')) === '1/5', 'guide: progress dots show step 1 of 5');
    check((await overflowX(page)) <= 0, 'guide: no sideways scroll');
    await shot(page, 'guide-mobile-home');
    // Tapping the dark area does nothing.
    await page.mouse.click(10, 10);
    await page.waitForTimeout(200);
    check((await tipTitle(page)) === 'Sisa sesimu', 'guide: tapping the dark area does nothing');
    await page.click('#guide-next');
    await page.waitForTimeout(600);
    check((await tipTitle(page)) === 'Sesi berikutnya' && await visible(page, '#guide-tip .guide-prev'), 'guide: step 2 has a "Kembali" button');
    await page.click('#guide-tip .guide-prev');
    await page.waitForTimeout(600);
    check((await tipTitle(page)) === 'Sisa sesimu', 'guide: "Kembali" goes back one step');
    let clash = [];
    for (let i = 0; i < 6 && (await tipTitle(page)) !== 'Booking latihan'; i++) {
      await page.click('#guide-next'); await page.waitForTimeout(700);
      const bad = await page.evaluate(() => { const a = document.getElementById('guide-spot').getBoundingClientRect(), b = document.getElementById('guide-tip').getBoundingClientRect();
        return (b.top < a.bottom - 2 && b.bottom > a.top + 2) || b.bottom > innerHeight || b.top < 0 ? document.getElementById('guide-title').textContent : ''; });
      if (bad) clash.push(bad);
    }
    check(!clash.length, 'guide: on the phone the card never covers the highlighted part' + (clash.length ? ' (' + clash.join(', ') + ')' : ''));
    check((await tipTitle(page)) === 'Booking latihan', 'guide: "Lanjut" steps through to the Booking button');
    await shot(page, 'guide-mobile-booking-button');
    const b = await page.evaluate(() => { const r = document.querySelector('.portal-actions .btn-primary').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(1600);
    check(guideCol().split('|').includes('beranda'), 'guide: finishing the home guide is saved for this client');
    check(await visible(page, '#modal-edit-schedule'), 'guide: tapping the highlighted Booking button opens the booking form');
    check(await visible(page, '#guide-layer') && (await tipTitle(page)) === 'Pilih tanggal & jam', 'guide: the booking form gets its own guide');
    await shot(page, 'guide-mobile-booking-form');
    await page.click('#guide-tip .guide-x');
    await page.waitForTimeout(400);
    check(!(await visible(page, '#guide-layer')) && guideCol().split('|').includes('booking'), 'guide: the × button closes the guide and saves it');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(600);
    await page.evaluate(() => window.navigate('public-catalog'));
    await page.waitForTimeout(1400);
    check(await visible(page, '#guide-layer'), 'guide: the Paket page shows its guide the first time');
    await page.goBack();
    await page.waitForTimeout(500);
    check(!(await visible(page, '#guide-layer')) && guideCol().split('|').includes('paket'), 'guide: the phone back gesture closes the guide');
    await page.evaluate(() => window.navigate('public-coaches'));
    await page.waitForTimeout(1600);
    check(await visible(page, '#guide-layer'), 'guide: the Coach page shows its guide');
    await page.click('#guide-tip .guide-x');
    await page.waitForTimeout(500);
    // Tab baru (Fase J4): tiap tab punya panduannya sendiri, sekali saja.
    for (const [view, page_, title] of [['public-progress', 'progres', 'Pencapaian'], ['public-program', 'program', 'Program latihan'], ['public-info', 'info', 'Info & Tips']]) {
      await page.evaluate(v => window.navigate(v), view);
      await page.waitForTimeout(1700);
      check(await visible(page, '#guide-layer') && (await tipTitle(page)) === title, 'guide: the ' + page_ + ' tab shows its own guide first (' + title + ')');
      await page.click('#guide-tip .guide-x');
      await page.waitForTimeout(500);
      check(guideCol().split('|').includes(page_), 'guide: closing it saves "' + page_ + '"');
    }
    await page.evaluate(() => window.navigate('public-progress'));
    await page.waitForTimeout(1500);
    check(!(await visible(page, '#guide-layer')), 'guide: a tab guide is not shown twice');
    await page.evaluate(() => window.navigate('calendar'));   // the one page not seen yet
    await page.waitForTimeout(1600);
    await page.click('#guide-tip .guide-off');
    await page.waitForTimeout(500);
    check(guideCol() === 'selesai', 'guide: "Jangan tampilkan panduan lagi" turns it off for good');
    await page.reload();
    await page.waitForTimeout(2200);
    await page.evaluate(() => window.navigate('calendar'));
    await page.waitForTimeout(1200);
    check(!(await visible(page, '#guide-layer')), 'guide: after that, no page shows the guide');
    // Replay from the profile sheet, without saving anything.
    await page.evaluate(() => window.navigate('public-dashboard'));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.openMyProfile());
    await page.waitForTimeout(500);
    await page.click('#sheet-my-profile button:has-text("Lihat panduan")');
    await page.waitForTimeout(1400);
    check(await visible(page, '#guide-layer') && (await tipTitle(page)) === 'Sisa sesimu', 'guide: "Lihat panduan" in the profile replays the guide');
    check(!(await page.locator('#guide-tip .guide-off').count()), 'guide: a replay has no "Jangan tampilkan lagi" link');
    await page.click('#guide-tip .guide-x');
    await page.waitForTimeout(300);
    check(guideCol() === 'selesai', 'guide: a replay does not change what is saved');
    noErrors(errors);
    await context.close();

    // Dark theme: the guide still reads well.
    const reg2 = env.call('registerNewClient', { name: 'Raka Baru', phone: '6289900000002', goal: 'x', packageId: 'P1' });
    const dark = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: reg2.token }, { wait: 1500, colorScheme: 'dark' });
    await dark.page.waitForTimeout(800);
    check(await visible(dark.page, '#guide-layer'), 'guide: shows in the dark theme too');
    check((await brightness(dark.page, 20, 470)) < 64, 'guide: the screen outside the highlight is really dark (dark theme)');
    await shot(dark.page, 'guide-mobile-home-dark');
    noErrors(dark.errors);
    await dark.context.close();

    // Desktop: floating card with an arrow, beside the sidebar for the menu step.
    const reg3 = env.call('registerNewClient', { name: 'Dina Desktop', phone: '6289900000003', goal: 'x', packageId: 'P1' });
    for (const scheme of ['light', 'dark']) {
      const dk = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: reg3.token }, { viewport: DESKTOP, wait: 1500, colorScheme: scheme });
      await dk.page.waitForTimeout(900);
      check(await visible(dk.page, '#guide-layer'), 'guide desktop (' + scheme + '): the home guide shows');
      check((await brightness(dk.page, 700, 880)) < 64, 'guide desktop (' + scheme + '): the screen outside the highlight is dark');
      await shot(dk.page, 'guide-desktop-home-' + scheme);
      const seen = [];
      for (let i = 0; i < 6 && (await tipTitle(dk.page)) !== 'Booking latihan'; i++) {
        await dk.page.keyboard.press('ArrowRight'); await dk.page.waitForTimeout(700);
        seen.push(await dk.page.evaluate(() => { const a = document.getElementById('guide-spot').getBoundingClientRect(), b = document.getElementById('guide-tip').getBoundingClientRect();
          return { t: document.getElementById('guide-title').textContent, side: document.getElementById('guide-tip').getAttribute('data-side') || '',
            clash: b.left < a.right - 2 && b.right > a.left + 2 && b.top < a.bottom - 2 && b.bottom > a.top + 2,
            inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight }; }));
        if (seen[seen.length - 1].t === 'Menu') await shot(dk.page, 'guide-desktop-menu-' + scheme);
      }
      const menu = seen.find(x => x.t === 'Menu');
      check(!!menu && !!menu.side && !menu.clash && (await dk.page.evaluate(() => !!document.querySelector('#side-nav'))), 'guide desktop (' + scheme + '): the menu step highlights the side menu, with an arrowed card beside it (' + (menu && menu.side) + ')');
      check(seen.every(x => !x.clash && x.inside), 'guide desktop (' + scheme + '): the card stays on screen and never covers the highlight');
      check((await dk.page.textContent('#guide-tip')).includes('Atau klik'), 'guide desktop (' + scheme + '): desktop wording says "klik"');
      await dk.page.keyboard.press('ArrowLeft'); await dk.page.waitForTimeout(500);
      check((await tipTitle(dk.page)) !== 'Booking latihan', 'guide desktop (' + scheme + '): the left arrow key goes back');
      await dk.page.keyboard.press('Escape'); await dk.page.waitForTimeout(400);
      check(!(await visible(dk.page, '#guide-layer')), 'guide desktop (' + scheme + '): Esc closes the guide');
      noErrors(dk.errors);
      await dk.context.close();
      env.memberRow(reg3.id)[22] = 'baru';   // show it again for the other theme
    }

    // An existing client logging in by WhatsApp never sees the guide.
    const old = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: env.memberToken(KEY_A) }, { wait: 1500 });
    await old.page.waitForTimeout(900);
    check(!(await visible(old.page, '#guide-layer')), 'guide: an existing client does not see the guide');
    noErrors(old.errors);
    await old.context.close();

    // Owner switch in Pengaturan → Tampilan.
    const adm = await openPage(browser, env, '/Index', [], { xnk_admin_token: env.adminToken() }, { viewport: DESKTOP, wait: 1500 });
    await adm.page.evaluate(() => window.navigate('settings'));
    await adm.page.waitForTimeout(1200);
    await adm.page.evaluate(() => window.settingsOpen('tampilan'));
    await adm.page.waitForTimeout(600);
    check(await adm.page.isChecked('#set-client-guide'), 'guide: Pengaturan → Tampilan shows "Panduan klien baru" switched on');
    await adm.page.click('#set-client-guide');
    await adm.page.waitForTimeout(800);
    check(env.props.CLIENT_GUIDE_ENABLED === 'false', 'guide: switching it off is saved');
    noErrors(adm.errors);
    await adm.context.close();
    const off = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: reg2.token }, { wait: 1500 });
    await off.page.waitForTimeout(900);
    check(!(await visible(off.page, '#guide-layer')), 'guide: with the switch off, new clients see no guide');
    noErrors(off.errors);
    await off.context.close();
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
    const adminCalls = ['getAdminBootstrap', 'getAdminExtras', 'getAdminMore', 'getMembers', 'getSchedules', 'getMemberTransactionLog', 'getPackageTrendStats', 'getRevenueSummary', 'checkAdminSession'];
    check(!calls.some(c => adminCalls.includes(c)), 'no admin functions called: ' + calls.join(','));
    check(!(await visible(page, '#admin-login')), 'admin PIN screen never appears in the client portal');
    check((await page.evaluate(() => window.members.length)) === 0, 'no client list in the browser');
    const leaked = await page.evaluate(() => JSON.stringify(window.schedules));
    check(!leaked.includes('Ani') && !leaked.includes('Rahasia') && !leaked.includes('62811'), 'public calendar data has no names, notes or phone numbers');
    check(calls.filter(c => c === 'getPortalBootstrap').length === 1 && !calls.includes('getPublicSchedules'), 'portal opens with one server call: ' + calls.join(','));
    check(await visible(page, '#login-phone'), 'login page asks for the WhatsApp number');
    await shot(page, 'portal-mobile-login');

    await page.fill('#login-phone', '89999999999');
    await page.click('#login-submit-btn');
    await page.waitForTimeout(600);
    check((await page.textContent('#member-link-message')).includes('tidak ditemukan'), 'unknown number → "Nomor WhatsApp tidak ditemukan"');
    await page.fill('#login-phone', '81111111111');
    await page.click('#login-submit-btn');
    await page.waitForTimeout(1400);
    check((await page.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.id)) === 'PT-A', 'registered WhatsApp number logs the client in');
    check((await page.evaluate(() => window.currentView)) === 'public-dashboard', 'opens "Beranda"');
    check((await page.textContent('#pub-dash-name')).includes('Ani'), 'shows the client\'s own name');
    check((await page.evaluate(() => window.members.length)) === 0, 'still no client list in the browser after login');
    const own = await page.evaluate(() => window.schedules.find(s => s.id === 'SCH-A1'));
    check(own && own.notes === 'Rahasia Ani', 'own bookings include their details');
    check(((await page.textContent('#pub-next-countdown')) || '').trim().length > 0, 'next-session countdown is filled');
    await page.evaluate(() => window.navigate('public-progress'));
    await page.waitForTimeout(500);
    check((await page.textContent('#pub-consistency-score')).includes('%'), 'consistency insight shown on the Progres tab');
    await page.evaluate(() => window.navigate('public-dashboard'));
    await page.waitForTimeout(400);
    await shot(page, 'portal-mobile-home');


    // ── Streak, badge dan perayaan (Fase D2) ───────────────────────────────────
    check(await visible(page, '#sheet-badge'), 'portal: a newly earned badge is celebrated when the client opens the home screen');
    check((await page.textContent('#pg-badge-list')).includes('10 sesi'), 'portal: the celebration names the badge (10 sesi)');
    check((await page.locator('#sheet-badge .confetti i').count()) === 16, 'portal: the celebration has confetti');
    check((env.memberRow('PT-A')[16] || '').includes('sesi-10'), 'portal: the badge is marked as seen right away, so it is celebrated only once');
    const shareBad = await page.evaluate(() => Array.from(document.querySelectorAll('#sheet-badge .btn')).map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5).length);
    check(shareBad === 0, 'portal: celebration buttons are at least 44 px');
    await page.click('#pg-badge-share');
    await page.waitForTimeout(300);
    const shared = await page.evaluate(() => window.__opened.map(w => w.location.href).pop() || '');
    check(shared.startsWith('https://wa.me/?text=') && decodeURIComponent(shared).includes('10 sesi'), 'portal: "Bagikan" opens WhatsApp with a proud message (contact chosen by the client)');
    await shot(page, 'portal-mobile-celebration');
    await page.click('#sheet-badge .btn-secondary');
    await page.waitForTimeout(700);
    check(!(await visible(page, '#sheet-badge')), 'portal: the celebration closes');
    // Info & Tips (Fase J3): konten dari pemilik, titik "baru".
    env.call('saveContent', env.adminToken(), { tipe: 'pengumuman', judul: 'Studio libur 17 Agustus', isi: 'Kami libur di hari kemerdekaan.', sematkan: true });
    env.call('saveContent', env.adminToken(), { tipe: 'tips', judul: 'Minum cukup', isi: 'Minum 2 liter air tiap hari.', kategori: 'Nutrisi' });
    env.call('saveContent', env.adminToken(), { tipe: 'video', judul: 'Teknik squat', url: 'https://youtu.be/squat', kategori: 'Latihan' });
    env.call('saveContent', env.adminToken(), { tipe: 'tips', judul: 'Rahasia nanti', isi: 'x', mulai: '2099-01-01' });
    await page.evaluate(() => { try { localStorage.removeItem('xnk_info_seen'); } catch (e) {} });
    await page.evaluate(() => window.refreshPortalSchedules().then(() => window.updateUI()));
    await page.waitForTimeout(700);
    check(await visible(page, '#tab-more-new'), 'info: the Lainnya tab shows a dot when there is new content');
    check((await page.textContent('#pub-teasers')).includes('Ada info baru dari coach'), 'info: the Beranda teaser says there is new info');
    // ── Tab klien (Fase J1): bar bawah Beranda · Jadwal · + · Progres · Lainnya ───────────────
    check((await page.locator('#tabbar .tab').allTextContents()).map(t => t.trim()).join(',') === 'Beranda,Jadwal,Progres,Lainnya' && (await page.locator('#tabbar .tab-fab').count()) === 1, 'nav: the phone bar has Beranda, Jadwal, +, Progres, Lainnya');
    check((await page.locator('#side-nav .nav-item').allTextContents()).map(t => t.trim()).join(',') === 'Beranda,Jadwal,Progres,Program,Info & Tips,Paket,Coach', 'nav: the sidebar lists every tab');
    check(!(await page.locator('#view-public-dashboard #pub-progress-wrap, #view-public-dashboard #pub-tasks-wrap, #view-public-dashboard #pub-meal-slot').count()) && (await page.locator('#pub-teasers .teaser-row').count()) === 3, 'nav: Beranda is lighter, the moved cards leave teasers behind');
    await page.click('#tabbar .tab[data-view="public-more"]');
    await page.waitForTimeout(500);
    check((await page.evaluate(() => window.currentView)) === 'public-more' && (await page.locator('#view-public-more .more-row').count()) === 6, 'nav: Lainnya opens a list of six rows');
    const moreBad = await page.locator('#view-public-more .more-row').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5 || r.right > window.innerWidth).length);
    check(moreBad === 0 && (await overflowX(page)) <= 0, 'nav: Lainnya rows are at least 44 px and fit the phone');
    check((await page.getAttribute('#tabbar .tab[data-view="public-more"]', 'aria-current')) === 'page', 'nav: the Lainnya tab is lit on its own page');
    await page.click('#view-public-more .more-row:nth-child(1)');
    await page.waitForTimeout(600);
    check((await page.evaluate(() => window.currentView)) === 'public-program' && (await page.getAttribute('#tabbar .tab[data-view="public-more"]', 'aria-current')) === 'page', 'nav: Program opens and Lainnya stays lit');
    check(await visible(page, '#pub-tasks-wrap') && (await page.textContent('#view-public-program')).includes('PR'), 'nav: the Program tab holds the PR card');
    await page.evaluate(() => window.navigate('public-info'));
    await page.waitForTimeout(900);
    check(await visible(page, '#view-public-info') && (await page.textContent('#view-public-info')).includes('Info & Tips'), 'nav: the Info & Tips tab opens');
    check((await page.locator('#pub-info-wrap .content-card').count()) === 3 && !(await page.textContent('#pub-info-wrap')).includes('Rahasia nanti'), 'info: three items show; scheduled content stays hidden');
    check((await page.locator('#pub-info-wrap .content-card').first().getAttribute('data-tipe')) === 'pengumuman', 'info: the pinned announcement comes first');
    const vrel = await page.getAttribute('#pub-info-wrap a[href="https://youtu.be/squat"]', 'rel');
    check(!!vrel && vrel.includes('noopener') && (await page.textContent('#pub-info-wrap')).includes('Tonton video'), 'info: the video opens outside with rel=noopener');
    await page.click('#pub-info-wrap .chip[data-k="Nutrisi"]');
    check((await page.locator('#pub-info-wrap .content-card').count()) === 1, 'info: a category chip filters the list');
    check((await overflowX(page)) <= 0, 'info: no sideways scroll');
    check(!(await visible(page, '#tab-more-new')), 'info: the dot is gone after reading');
    await page.evaluate(() => window.navigate('public-dashboard'));
    await page.waitForTimeout(400);
    check(!(await page.textContent('#pub-teasers')).includes('Ada info baru'), 'info: the Beranda teaser no longer shouts');
    await page.click('#tabbar .tab[data-view="public-progress"]');
    await page.waitForTimeout(500);
    check((await page.evaluate(() => window.currentView)) === 'public-progress' && (await page.getAttribute('#tabbar .tab[data-view="public-progress"]', 'aria-current')) === 'page' && !(await page.getAttribute('#tabbar .tab[data-view="public-more"]', 'aria-current')), 'nav: the Progres tab is lit alone');
    await page.click('#tabbar .tab[data-view="public-dashboard"]');
    await page.waitForTimeout(500);
    // Program latihan di portal: kartu per hari, centang tersimpan.
    env.call('saveMemberProgram', env.adminToken(), 'PT-A', '# Hari A\nBench press | 3x10 | turun pelan | https://youtu.be/abc\nPush-up | 3x12\n\n# Hari B\nSquat | 4x8');
    await page.evaluate(() => { window.myProgram = null; window.loadMyProgram(true); });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.navigate('public-program'));
    await page.waitForTimeout(900);
    check((await page.locator('#pub-program-wrap .card').count()) === 2 && (await page.textContent('#pub-program-wrap')).includes('Bench press') && (await page.textContent('#pub-program-wrap')).includes('3 × 10'), 'program: the client sees both days with sets × reps');
    const vid = await page.getAttribute('#pub-program-wrap a[href^="https://youtu.be/abc"]', 'rel');
    check(!!vid && vid.includes('noopener'), 'program: the video link opens outside with rel=noopener');
    const progBtn = await page.locator('#pub-program-wrap .prog-hit').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.width < 43.5 || r.height < 43.5).length);
    check(progBtn === 0 && (await overflowX(page)) <= 0, 'program: check buttons are at least 44 px and nothing scrolls sideways');
    await page.locator('#pub-program-wrap .card').first().locator('.prog-hit').nth(0).click();
    await page.locator('#pub-program-wrap .card').first().locator('.prog-hit').nth(1).click();
    await page.waitForTimeout(1300);
    const logRow = env.sheet('ProgramLog') && env.sheet('ProgramLog').rows.find(r => r[1] === 'PT-A');
    check(!!logRow && logRow[3] === 'Hari A' && logRow[4] === '1,2', 'program: two taps are saved as one row for the day');
    check((await page.textContent('#pub-program-wrap .card')).includes('Selesai'), 'program: the finished day shows "Selesai"');
    check((await page.locator('#pub-tasks-wrap').count()) === 1 && (await page.locator('#pub-meal-slot').count()) === 1, 'program: PR and meal cards live in the same tab');
    await page.evaluate(() => window.navigate('public-dashboard'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.navigate('public-progress'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.loadMyProgress(true));
    await page.waitForTimeout(800);
    check(!(await visible(page, '#sheet-badge')), 'portal: the same badge is not celebrated again');
    check(await visible(page, '#pub-badges-wrap') && (await page.locator('#pub-badges-wrap .pg-badge').count()) === 7, 'portal: the Pencapaian card shows all 7 badges');
    check((await page.locator('#pub-badges-wrap .pg-badge.earned').count()) >= 1 && (await page.locator('#pub-badges-wrap .pg-badge.locked').count()) >= 1, 'portal: earned badges are solid and locked ones are faded');
    const streakTxt = await page.textContent('#pub-badges-wrap');
    check(streakTxt.includes('berturut-turut') || streakTxt.includes('Mulai streak'), 'portal: the streak line is shown');
    const lockedOpacity = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#pub-badges-wrap .pg-badge.locked')).opacity));
    check(lockedOpacity < 0.6, 'portal: locked badges are visibly faded');
    check((await overflowX(page)) <= 0, 'portal: the Pencapaian card has no sideways scroll');
    check(!(await page.textContent('#pub-insights-card, body').then(t => t.includes('Selesaikan 24 sesi')).catch(() => false)), 'portal: the old separate badge tiles are gone');
    check((await page.textContent('#pub-badges-wrap')).includes('Tantangan bulan ini') && await visible(page, '#pub-badges-wrap .challenge-bar'), 'portal: the monthly challenge card shows on the Progres tab');

    // ── Penilaian cepat dan evaluasi paket (Fase I3) ────────────────────────────
    // Data uji: SCH-H1 selesai 3 hari lalu (paling baru), jadi portal menanyakan penilaiannya.
    await page.evaluate(() => window.navigate('public-dashboard'));
    await page.waitForTimeout(400);
    const fbRefresh = async () => { await page.evaluate(() => window.refreshPortalSchedules().then(() => window.updateUI())); await page.waitForTimeout(700); };
    await fbRefresh();
    check(await visible(page, '#pub-feedback-card') && (await page.textContent('#pub-feedback-card')).includes('Bagaimana sesi tadi?'), 'feedback: a recently finished session asks "Bagaimana sesi tadi?"');
    const starBox = await page.locator('#pub-feedback-card .star').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.width < 43.5 || r.height < 43.5).length);
    check(starBox === 0 && (await page.locator('#pub-feedback-card .star').count()) === 5, 'feedback: five stars, each at least 44 px');
    check((await overflowX(page)) <= 0, 'feedback: the card has no sideways scroll');
    await page.click('#pub-feedback-card .star[data-v="5"]');
    await page.waitForTimeout(700);
    const rrow = env.sheet('SessionRatings').rows.find(r => r[1] === 'SCH-H1');
    check(!!rrow && rrow[2] === 'PT-A' && rrow[4] === 5, 'feedback: one tap on the fifth star saves a 5-star rating');
    check(await visible(page, '#fb-comment') && (await page.textContent('#pub-feedback-card')).includes('Terima kasih'), 'feedback: after the tap the card thanks and offers an optional sentence');
    await page.fill('#fb-comment', 'Latihannya seru');
    await page.waitForTimeout(3300);   // the server keeps a 3 s gap between two saves of the same client
    await page.click('#fb-send');
    await page.waitForTimeout(900);
    check(env.sheet('SessionRatings').rows.find(r => r[1] === 'SCH-H1')[5] === 'Latihannya seru' && !(await visible(page, '#pub-feedback-card')), 'feedback: the sentence is saved and the card goes away');
    // Paket habis: kartu evaluasi paket membuka lembar dengan ringkasan, bintang per aspek, dan Perpanjang.
    const usedBefore = env.memberRow('PT-A')[9];
    env.memberRow('PT-A')[9] = env.memberRow('PT-A')[8];
    await fbRefresh();
    check(await visible(page, '#pub-feedback-card') && (await page.textContent('#pub-feedback-card')).includes('Evaluasi paket'), 'evaluation: a finished package shows the "Evaluasi paket" card');
    await page.click('#pub-feedback-card .btn-primary');
    await page.waitForTimeout(900);
    check(await visible(page, '#modal-pkg-eval') && (await page.locator('#pe-body .stars').count()) === 5, 'evaluation: the sheet shows five rated aspects');
    await page.click('#pe-send');
    check((await page.textContent('#pe-err')).includes('Beri bintang untuk motivasi'), 'evaluation: sending without stars names what is missing');
    for (const key of ['motivasi', 'keselamatan', 'kepuasan', 'komunikasi', 'profesionalisme']) await page.click('#pe-st-' + key + ' .star[data-v="4"]');
    await page.fill('#pe-comment', 'Terima kasih coach');
    check((await overflowX(page)) <= 0, 'evaluation: the sheet has no sideways scroll on the phone');
    const peBtn = await page.locator('#pe-foot .btn').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5).length);
    check(peBtn === 0, 'evaluation: footer buttons are at least 44 px');
    await page.click('#pe-send');
    await page.waitForTimeout(900);
    const erow = env.sheet('PackageEvaluations').rows[1];
    check(!!erow && erow[1] === 'PT-A' && erow[4] === 4 && erow[9] === 'Terima kasih coach', 'evaluation: the answers are saved for the right client');
    check(!(await page.textContent('#pub-feedback-slot')).includes('Evaluasi paket'), 'evaluation: the package card is gone once the package is evaluated');
    // Saklar: dimatikan, kartu hilang untuk sisa pengecekan.
    env.memberRow('PT-A')[9] = usedBefore;
    env.props.FEEDBACK_ENABLED = 'false';
    await fbRefresh();
    check(!(await visible(page, '#pub-feedback-card')), 'feedback: the owner switch hides the cards');

    // ── Tambah ke kalender (Fase I4) ───────────────────────────────────────────
    const calId = await page.evaluate(() => (window.schedules.filter(s => new Date(s.start) > new Date())[0] || {}).id);
    check(!!calId && (await page.locator('#pub-next-cal').count()) === 1, 'calendar: the next-session card has a Kalender button');
    await page.evaluate(id => window.openAddToCalendar([id]), calId);
    await page.waitForTimeout(500);
    check(await visible(page, '#modal-add-cal') && await visible(page, '#cal-google') && await visible(page, '#cal-ics'), 'calendar: the sheet offers Google Kalender and .ics');
    const gUrl = await page.getAttribute('#cal-google', 'href');
    check(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Sesi%20latihan%20XNK&dates=\d{8}T\d{6}Z\/\d{8}T\d{6}Z/.test(gUrl), 'calendar: the Google link carries the title and UTC start/end');
    const calBtn = await page.locator('#modal-add-cal .btn').evaluateAll(els => els.map(e => e.getBoundingClientRect()).filter(r => r.width && r.height < 43.5).length);
    check(calBtn === 0 && (await overflowX(page)) <= 0, 'calendar: buttons are at least 44 px and nothing scrolls sideways');
    const dl = page.waitForEvent('download');
    await page.click('#cal-ics');
    const download = await dl;
    const icsText = fs.readFileSync(await download.path(), 'utf8');
    check(download.suggestedFilename() === 'sesi-xnk.ics' && icsText.startsWith('BEGIN:VCALENDAR\r\n') && icsText.includes('\r\nEND:VCALENDAR\r\n'), 'calendar: the .ics file downloads with CRLF lines');
    check(icsText.includes('UID:' + calId + '@xnk.my.id') && /DTSTART:\d{8}T\d{6}Z/.test(icsText) && icsText.includes('SUMMARY:Sesi latihan XNK') && icsText.includes('TRIGGER:-PT1H'), 'calendar: the event has a stable UID, UTC times, a title and a 1-hour alarm');
    const multi = await page.evaluate(() => window.buildIcs([{ id: 'A', start: '2030-01-07T00:00:00.000Z', end: '2030-01-07T01:00:00.000Z', coachName: 'Rizky, "Coach"; Satu' }, { id: 'B', start: '2030-01-08T00:00:00.000Z' }], new Date('2030-01-01T00:00:00Z')));
    check((multi.match(/BEGIN:VEVENT/g) || []).length === 2 && multi.includes('DTSTART:20300107T000000Z') && multi.includes('DTEND:20300108T010000Z'), 'calendar: several sessions make one file, a missing end defaults to one hour');
    check(multi.split('\r\n').every(l => l.length <= 75), 'calendar: long lines are folded to 75 characters');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);

    // ── Progres klien (Fase D1) ────────────────────────────────────────────────
    await page.evaluate(() => window.navigate('public-progress'));
    await page.waitForTimeout(600);
    check(await visible(page, '#pub-progress-wrap') && (await page.textContent('#pub-progress-wrap')).includes('Belum ada catatan'), 'portal: the Progres card starts with a friendly empty state');
    await page.evaluate(() => window.navigate('public-dashboard'));
    await page.waitForTimeout(600);
    check((await page.textContent('#pub-care-wrap')).includes('Form kesehatan'), 'portal: the health form card asks until a form is submitted');
    check((await page.textContent('#view-public-dashboard .my-coach-card')).includes('Coach kamu'), 'portal home: a "Coach kamu" card shows the coach');
    await page.locator('#view-public-dashboard .my-coach-card').click();
    await page.waitForTimeout(700);
    check((await page.textContent('#coach-sheet-body')).includes('Rizky') && await visible(page, '#coach-sheet-body .coach-hero'), 'tapping "Coach kamu" opens the full coach profile in a sheet');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);
    check(await visible(page, '#view-public-dashboard .portal-hero') && (await page.locator('#view-public-dashboard .portal-kpis .kpi').count()) === 3 && (await page.locator('#view-public-dashboard .portal-actions .btn').count()) === 3, 'portal home: dark hero, three KPI tiles and three quick actions');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'portal home: no sideways page scroll');
    await shot(page, 'portal-mobile-home-premium');
    await page.evaluate(() => window.openMyProfile());
    await page.waitForTimeout(600);
    check((await page.textContent('#sheet-my-profile')).includes('Keluar') && (await page.textContent('#sheet-my-profile')).includes('Sisa sesi'), 'portal: "Profil saya" sheet shows identity, numbers and logout');
    await shot(page, 'portal-mobile-my-profile');
    await page.evaluate(() => window.closeModal());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.navigate('calendar'));
    await page.waitForTimeout(500);
    check((await page.locator('#view-calendar .portal-kpis .kpi').count()) >= 2, 'portal Jadwal: KPI tiles above the calendar');
    await page.evaluate(() => window.navigate('public-progress'));
    await page.waitForTimeout(400);
    await page.click('#pub-progress-wrap .btn-primary');
    await page.waitForTimeout(600);
    check(await visible(page, '#sheet-progress'), 'portal: "Catat hari ini" opens the entry sheet');
    check((await page.getAttribute('#pg-berat', 'inputmode')) === 'decimal' && (await page.getAttribute('#pg-pinggang', 'inputmode')) === 'decimal', 'portal: weight and waist open the decimal keypad');
    check(!(await visible(page, '#pg-date-field')), 'portal: a client cannot pick the date (always today)');
    await page.click('#pg-save-btn');
    check((await page.textContent('#pg-err')).includes('Isi minimal satu ukuran'), 'portal: saving an empty form explains what to fill');
    await page.fill('#pg-berat', '10');
    await page.click('#pg-save-btn');
    check((await page.textContent('#pg-err')).includes('antara 20 dan 300'), 'portal: an impossible weight is refused with a clear message');
    await page.fill('#pg-berat', '');
    check(!(await visible(page, '#pg-lenganKiri')), 'portal: the extra body measures start folded away');
    await page.click('#pg-more > summary');
    await page.fill('#pg-lenganKiri', '5');
    await page.click('#pg-save-btn');
    check((await page.textContent('#pg-err')).includes('Lengan kiri harus antara 10 dan 80') && (await page.evaluate(() => document.getElementById('pg-more').open)), 'portal: a bad arm value is refused and the extra measures open');
    await page.fill('#pg-lenganKiri', '');
    await page.fill('#pg-berat', '');
    const bigFont = await page.evaluate(() => ['pg-berat', 'pg-pinggang'].every(id => parseFloat(getComputedStyle(document.getElementById(id)).fontSize) >= 16));
    check(bigFont, 'portal: entry fields are 16 px or larger (no iOS zoom)');
    const pastDay = env.call('_addDaysIso_', env.call('_todayWib_'), -6);
    env.call('saveMemberMeasurement', env.adminToken(), 'PT-A', { tanggal: pastDay, berat: 74.5, pinggang: 84 });
    await page.fill('#pg-berat', '72,4');
    await page.fill('#pg-pinggang', '80');
    await page.click('#pg-save-btn');
    await page.waitForTimeout(700);
    const prow = env.sheet('Progress').rows.find(r => r[2] === env.call('_todayWib_') && r[1] === 'PT-A');
    check(!!prow && prow[3] === 72.4 && prow[4] === 80 && prow[5] === 'klien', 'portal: the entry is saved for the logged-in client (72,4 kg, comma accepted)');
    await page.evaluate(() => window.loadMyProgress(true));
    await page.waitForTimeout(500);
    const ptxt = await page.textContent('#pub-progress-wrap');
    check(ptxt.includes('72,4') && ptxt.includes('−2,1 kg sejak'), 'portal: shows the latest value and the change since the first entry');
    check((await page.locator('#pub-progress-wrap svg.pg-chart').count()) === 2, 'portal: a line chart for weight and one for waist');
    const chartBox = await page.locator('#pub-progress-wrap svg.pg-chart').first().boundingBox();
    check(!!chartBox && chartBox.width <= MOBILE.width && chartBox.height > 60, 'portal: the chart fits the phone width (' + Math.round(chartBox && chartBox.width) + ' px)');
    await page.locator('#pub-progress-wrap .pg-block').first().locator('.pg-dot').last().click();
    check((await page.textContent('#toast-msg')).includes('72,4'), 'portal: tapping a dot shows its value');
    // Foto
    await page.click('#pub-progress-wrap .btn-outline');
    await page.waitForTimeout(600);
    check(await visible(page, '#sheet-progress-photos') && (await page.textContent('#pg-photo-list')).includes('Belum ada foto'), 'portal: the photo sheet opens with an empty list and a privacy note');
    const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.click('#pg-side-samping');
    await page.setInputFiles('#pg-photo-input', { name: 'foto.png', mimeType: 'image/png', buffer: PNG1 });
    await page.waitForTimeout(1200);
    check(env.files.length === 1 && env.files[0].sharing === null, 'portal: the photo is uploaded to Drive and is not shared by link');
    check(env.sheet('ProgressPhotos').rows[1][3] === 'samping' && env.sheet('ProgressPhotos').rows[1][1] === 'PT-A', 'portal: the photo is recorded for this client on the chosen side');
    check((await page.textContent('#pg-photo-list')).includes('Samping'), 'portal: the new photo appears in the list');
    const photoBad = await page.evaluate(() => Array.from(document.querySelectorAll('#sheet-progress-photos button, #sheet-progress-photos .chip')).map(e => e.getBoundingClientRect()).filter(r => r.width && (r.height < 43.5 || r.width < 43.5)).length);
    check(photoBad === 0, 'portal: photo sheet buttons are at least 44 px');
    await page.click('#pg-photo-list .btn');
    await page.waitForTimeout(800);
    check(((await page.getAttribute('#pg-view-img', 'src')) || '').startsWith('data:image/'), 'portal: viewing a photo loads it as a private data URL');
    await page.click('#pg-view-del');
    await page.waitForTimeout(300);
    await page.click('#btn-confirm-modal-yes');
    await page.waitForTimeout(800);
    check(env.files[0].trashed === true && env.sheet('ProgressPhotos').rows.length === 1, 'portal: deleting a photo trashes the Drive file');
    check((await overflowX(page)) <= 0, 'portal: Progres screens have no sideways scroll');
    await shot(page, 'portal-mobile-progress');
    await page.click('#sheet-progress-photos .icon-btn').catch(() => {});
    await page.waitForTimeout(500);

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
    const callsBeforeBook = calls.length;
    await page.click('#form-edit-schedule button[type="submit"]');
    await page.waitForTimeout(700);
    const booked = env.sheet('Schedules').rows.find(r => r[6] === 'Leg day');
    check(!!booked && booked[1] === 'PT-A' && booked[7] === 'unread', 'booking is saved for the logged-in client');
    await page.waitForTimeout(600); await page.evaluate(() => { const s = document.getElementById('modal-add-cal'); if (s && !s.classList.contains('hide')) window.closeModal(); }); await page.waitForTimeout(350);   // booking offers "Tambah ke kalender" (I4)
    const bookCalls = calls.slice(callsBeforeBook);
    check(bookCalls.length === 1 && bookCalls[0] === 'clientBookSchedule', 'booking is one server call (no pre-check, no reload afterwards): ' + bookCalls.join(','));
    check(await page.evaluate(id => window.schedules.some(s => s.id === id && s.memberId === 'PT-A'), booked && booked[0]), 'the new booking is on screen straight from the answer');
    check((await page.textContent('#toast-msg')).includes('Booking terkirim'), 'booking: "Booking terkirim ke coach!"');

    // FAB booking still works.
    await page.evaluate(() => window.handleFabClick());
    await page.waitForTimeout(400);
    await page.fill('#edit-sch-date', inDays(6).slice(0, 10));
    await page.fill('#edit-sch-time', '10:00');
    await page.fill('#edit-sch-notes', 'Fab booking');
    await page.evaluate(() => document.querySelector('#form-edit-schedule button[type="submit"]').click());
    await page.waitForTimeout(700);
    check(!!env.sheet('Schedules').rows.find(r => r[6] === 'Fab booking' && r[1] === 'PT-A'), '"+" booking is saved too');
    await page.waitForTimeout(600); await page.evaluate(() => { const s = document.getElementById('modal-add-cal'); if (s && !s.classList.contains('hide')) window.closeModal(); }); await page.waitForTimeout(350);   // booking offers "Tambah ke kalender" (I4)

    await page.evaluate(() => window.navigate('public-coaches'));
    await page.waitForTimeout(400);
    await page.waitForTimeout(500);
    const coachPage = await page.textContent('#view-public-coaches');
    check(coachPage.includes('Rizky') && coachPage.includes('Booking'), 'portal Coach tab is one profile page in solo mode');
    check(await visible(page, '#coach-profile-page .card-ink.coach-hero'), 'portal coach page: ink hero');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'portal coach page: no sideways page scroll');
    check((await page.locator('#coach-profile-page .btn-row .btn').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 44))), 'portal coach page: buttons are 44 px or taller');
    await shot(page, 'portal-mobile-coach-premium');
    await page.locator('#coach-profile-page .btn-inverse').first().click();
    check((await page.evaluate(() => window.__opened.map(w => w.location.href))).some(u => u.startsWith('https://wa.me/6281112223334')), '"Chat WA" on the coach page opens WhatsApp to the coach');
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
  console.log('Portal klien · cepat (Fase K): panggilan, salinan, kerangka');
  {
    const env = richEnv();
    const tokA = env.memberToken(KEY_A), tokB = env.memberToken(KEY_B);
    const TK = 'xnk_member_token', CK = 'xnk_portal_cache';
    // 1) Pembukaan dingin: tepat dua panggilan (bootstrap + more), tidak ada panggilan per-kartu.
    const calls1 = [];
    const cold = await openPage(browser, env, '/Index?view=public', calls1, { [TK]: tokA });
    await cold.page.waitForTimeout(800);
    const reads1 = () => calls1.filter(n => /^get/.test(n) && n !== 'getMyCoach');
    check(reads1().length === 2 && calls1.includes('getPortalBootstrap') && calls1.includes('getPortalMore'), 'fast: opening the portal makes exactly two server calls (' + calls1.join(',') + ')');
    for (const v of ['public-progress', 'public-program', 'public-info', 'public-more', 'public-catalog', 'public-coaches', 'public-dashboard']) {
      await cold.page.evaluate(x => window.navigate(x), v);
      await cold.page.waitForTimeout(350);
    }
    check(reads1().length === 2, 'fast: switching through all seven tabs reads nothing more from the server (' + calls1.join(',') + ')');
    check((await cold.page.textContent('#pub-tasks-wrap, #pub-teasers')).length > 0 && (await cold.page.evaluate(() => !!window.myProgram && window.myProgram.state === 'ok' && !!window.myContent && !!window.myTasks)), 'fast: every tab already has its data from the one call');
    const store = await cold.page.evaluate(() => Object.assign({}, localStorage));
    check(!!store[CK] && store[CK].includes('Ani') && !store[CK].includes('openSlots'), 'fast: a copy is kept on the device (own data only, no free-hours grid)');
    await cold.context.close();
    // 2) Salinan ada: layar terisi SEBELUM server menjawab (server sengaja diperlambat 4 detik).
    const calls2 = [];
    const warm = await openPage(browser, env, '/Index?view=public', calls2, store, { delay: { getPortalBootstrap: 4000, getPortalMore: 4000 }, wait: 200, keepCelebration: true });
    await warm.page.waitForTimeout(700);
    check((await warm.page.textContent('#pub-dash-name')).includes('Ani') && !(await visible(warm.page, '#global-loader')), 'fast: with a copy, Beranda shows the client\'s own name while the server is still answering');
    check((await warm.page.locator('#view-public-dashboard .portal-hero').count()) === 1 && !(await warm.page.locator('#view-public-dashboard .skel').count()), 'fast: the home screen is filled from the copy, no skeletons');
    await warm.page.evaluate(() => window.navigate('public-program'));
    await warm.page.waitForTimeout(300);
    check((await warm.page.textContent('#pub-program-wrap')).includes('Program latihan') && !(await warm.page.locator('#pub-program-wrap .skel').count()), 'fast: other tabs also open filled while the server is slow');
    check(!(await visible(warm.page, '#sheet-badge')), 'fast: a badge celebration never comes from the copy, only from fresh data');
    await warm.page.waitForTimeout(4500);
    check(calls2.length === 2 && calls2.includes('getPortalMore'), 'fast: the fresh data still arrives in the same two calls');
    // 3) Keluar menghapus salinan.
    await warm.page.evaluate(() => window.logoutPublic());
    await warm.page.waitForTimeout(500);
    check(!(await warm.page.evaluate(k => localStorage.getItem(k), CK)), 'fast: logging out removes the copy from the device');
    await warm.context.close();
    // 4) Salinan akun lain tidak dipakai.
    const calls3 = [];
    const other = await openPage(browser, env, '/Index?view=public', calls3, { [TK]: tokB, [CK]: store[CK] }, { delay: { getPortalBootstrap: 1500, getPortalMore: 1500 }, wait: 300, keepCelebration: true });
    await other.page.waitForTimeout(300);
    const nm = await other.page.evaluate(() => (document.getElementById('pub-dash-name') || {}).textContent || '');
    check(!nm.includes('Ani'), 'fast: a copy that belongs to another login is never shown');
    await other.page.waitForTimeout(3000);
    check((await other.page.textContent('#pub-dash-name')).includes('Budi'), 'fast: the right client appears once the server answers');
    await other.context.close();
    // 5) Tanpa salinan: kerangka abu muncul di tab selagi data menyusul.
    const calls4 = [];
    const skel = await openPage(browser, env, '/Index?view=public', calls4, { [TK]: tokA }, { delay: { getPortalMore: 3000 }, wait: 300, keepCelebration: true });
    await skel.page.waitForTimeout(500);
    await skel.page.evaluate(() => window.navigate('public-program'));
    await skel.page.waitForTimeout(300);
    check((await skel.page.locator('#pub-program-wrap .skel').count()) > 0, 'fast: without a copy the Program tab shows grey skeletons while the data comes');
    await skel.page.evaluate(() => window.navigate('public-progress'));
    await skel.page.waitForTimeout(300);
    check((await skel.page.locator('#pub-progress-wrap .skel').count()) > 0 && (await overflowX(skel.page)) <= 0, 'fast: the Progres tab shows skeletons too, with no sideways scroll');
    await skel.page.waitForTimeout(3500);
    check(!(await skel.page.locator('#pub-progress-wrap .skel').count()), 'fast: the skeletons are replaced when the data arrives');
    await skel.context.close();
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
  // ── Portal: jam yang baru saja terisi → saran jam di dalam sheet (HP) ─────
  console.log('Portal klien · booking bentrok · HP');
  {
    const env = seededEnv();
    const calls = [];
    const token = env.memberToken(KEY_A);
    const { page, context, errors } = await openPage(browser, env, '/Index?view=public', calls, { xnk_member_token: token }, { timezoneId: 'Asia/Jakarta', wait: 1300 });
    const slot = wibSlot(4);                       // 10.00–11.00 WIB, 4 hari lagi
    const day = new Date(slot.start).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await page.evaluate(() => window.navigate('calendar'));
    await page.waitForTimeout(400);
    await page.evaluate(d => window.selectDate(d), day);
    await page.waitForTimeout(400);
    const hour10 = page.locator('#day-panel .slot-grid .slot', { hasText: '10.00' }).first();
    check(await hour10.isEnabled(), 'conflict: 10.00 shows as free in the grid');
    check(/\d+ jam kosong · diperbarui \d{2}\.\d{2}/.test((await page.textContent('#slots-meta')) || ''), 'Jadwal: header says how many hours are free and when the list was updated');
    // Someone else books 10.00 after this screen loaded (the grid still shows it free).
    env.sheet('Schedules').rows.push(['SCH-X1', 'PT-B', 'Budi', '081222222222', slot.start, slot.end, '', 'unread', 'C-1', 'Rizky', '', '']);
    await hour10.click();
    await page.waitForTimeout(500);
    check(await visible(page, '#modal-edit-schedule'), 'conflict: tapping the hour opens the booking sheet');
    await page.fill('#edit-sch-time', '10:15');
    check(((await page.textContent('#edit-sch-time-hint')) || '').includes('Dicatat mulai 10.00 (dihitung dari jam penuh).'), 'time field: 10:15 shows "Dicatat mulai 10.00 (dihitung dari jam penuh)."');
    const callsBefore = calls.length;
    await page.click('#form-edit-schedule button[type="submit"]');
    await page.waitForTimeout(900);
    check(calls.slice(callsBefore).join(',') === 'clientBookSchedule', 'conflict: one server call, no pre-check: ' + calls.slice(callsBefore).join(','));
    check(await visible(page, '#modal-edit-schedule .conflict-panel'), 'conflict: the sheet stays open with a notice');
    check(((await page.textContent('.conflict-panel .li-title')) || '').includes('Jam 10.00 baru saja terisi'), 'conflict: "Jam 10.00 baru saja terisi" (10:15 is counted from 10.00)');
    check(!env.sheet('Schedules').rows.some(r => r[1] === 'PT-A' && new Date(r[4]).getTime() === new Date(slot.start).getTime()), 'conflict: nothing was saved for the taken hour');
    const chips = page.locator('.conflict-panel .slot');
    check((await chips.count()) >= 1 && (await chips.count()) <= 3, 'conflict: 1 to 3 other hours are offered (' + (await chips.count()) + ')');
    check(await visible(page, '.conflict-panel [data-act="all"]'), 'conflict: "Lihat semua jam" is offered');
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('.conflict-panel button')).map(b => b.getBoundingClientRect()).filter(r => r.width && r.height < 43.5).length);
    check(small === 0, 'conflict: chips and buttons are at least 44 px');
    check((await overflowX(page)) <= 0, 'conflict: no sideways scroll');
    check(await page.evaluate(() => !document.getElementById('modal-edit-schedule').querySelector('input:disabled, select:disabled, textarea:disabled')), 'conflict: the form is usable again');
    check(await page.evaluate(d => window.openSlotsByDate[d] && window.openSlotsByDate[d][10] === 0, day), 'conflict: the answer updates the hour grid (10.00 now full)');
    await shot(page, 'portal-mobile-booking-conflict');
    await chips.first().click();
    await page.waitForTimeout(200);
    const btnText = ((await page.textContent('#sch-submit-btn')) || '').trim();
    check(/^Booking .+ · \d{2}\.00$/.test(btnText), 'conflict: tapping a suggestion only selects it; the button reads "' + btnText + '"');
    check(await page.evaluate(() => document.querySelector('.conflict-panel .slot.active') !== null), 'conflict: the chosen suggestion is highlighted');
    const pick = { date: await page.inputValue('#edit-sch-date'), time: await page.inputValue('#edit-sch-time') };
    check(!env.sheet('Schedules').rows.some(r => r[1] === 'PT-A' && r[0] !== 'SCH-A1'), 'conflict: selecting a suggestion does not book yet');
    const callsBefore2 = calls.length;
    await page.click('#form-edit-schedule button[type="submit"]');
    await page.waitForTimeout(900);
    const pickIso = new Date(pick.date + 'T' + pick.time + ':00+07:00').getTime();
    const saved = env.sheet('Schedules').rows.find(r => r[1] === 'PT-A' && new Date(r[4]).getTime() === pickIso);
    check(!!saved && saved[7] === 'unread', 'conflict: the suggested hour is booked (' + pick.date + ' ' + pick.time + ')');
    await page.waitForTimeout(600); await page.evaluate(() => { const s = document.getElementById('modal-add-cal'); if (s && !s.classList.contains('hide')) window.closeModal(); }); await page.waitForTimeout(350);   // booking offers "Tambah ke kalender" (I4)
    check(calls.slice(callsBefore2).join(',') === 'clientBookSchedule', 'conflict: booking the suggestion is one more call: ' + calls.slice(callsBefore2).join(','));
    check(!(await page.evaluate(() => document.getElementById('sheet-layer').classList.contains('open'))), 'conflict: the sheet closes after booking');
    check((await page.textContent('#toast-msg')).includes('Booking terkirim'), 'conflict: "Booking terkirim ke coach!"');

    // Jadwal berulang: tanggal yang sudah terisi → "Lewati tanggal penuh".
    await page.evaluate(d => window.openBookingSheet({ date: d, time: '10:00' }), day);
    await page.waitForTimeout(500);
    check(!(await visible(page, '#modal-edit-schedule .conflict-panel')), 'a new booking sheet starts without the old notice');
    await page.evaluate(() => { const t = document.getElementById('edit-sch-recurring-toggle'); t.checked = true; window.toggleRecurringOptions(); });
    const dow = new Date(day + 'T12:00:00+07:00').getUTCDay();
    await page.click('.recurring-day-btn[data-day="' + dow + '"]');
    await page.fill('#edit-sch-recurring-occurrences', '2');
    const rowsBefore = env.sheet('Schedules').rows.length;
    await page.click('#form-edit-schedule button[type="submit"]');
    await page.waitForTimeout(900);
    check(await visible(page, '.conflict-panel[data-kind="series"]') && ((await page.textContent('.conflict-panel .li-title')) || '').includes('1 dari 2 tanggal sudah terisi'), 'recurring: "1 dari 2 tanggal sudah terisi" and nothing is written');
    check(env.sheet('Schedules').rows.length === rowsBefore, 'recurring: no session is created on a clash');
    const skip = page.locator('.conflict-panel [data-act="skip"]');
    check(((await skip.textContent().catch(() => '')) || '').includes('Lewati tanggal penuh (1 sesi)'), 'recurring: "Lewati tanggal penuh (1 sesi)" is offered');
    check((await overflowX(page)) <= 0, 'recurring: no sideways scroll');
    await skip.click().catch(() => {});
    await page.waitForTimeout(900);
    check(env.sheet('Schedules').rows.length === rowsBefore + 1, 'recurring: "Lewati" books only the free date');
    check((await page.textContent('#toast-msg')).includes('1 sesi dibuat, 1 tanggal dilewati'), 'recurring: "1 sesi dibuat, 1 tanggal dilewati."');
    await page.waitForTimeout(600); await page.evaluate(() => { const s = document.getElementById('modal-add-cal'); if (s && !s.classList.contains('hide')) window.closeModal(); }); await page.waitForTimeout(350);   // booking offers "Tambah ke kalender" (I4)
    noErrors(errors);
    await context.close();
  }
  {
    // Pindah jadwal ke jam yang terisi: tetap di sheet (tanpa "Lihat semua jam"), saran jam memindahkan sesi yang sama.
    const env = seededEnv();
    const token = env.memberToken(KEY_A);
    const own = wibSlot(5), taken = wibSlot(6);
    const mine = env.call('clientBookSchedule', token, { start: own.start, end: own.end, notes: '' }, { soft: true });
    env.sheet('Schedules').rows.push(['SCH-X2', 'PT-B', 'Budi', '081222222222', taken.start, taken.end, '', 'unread', 'C-1', 'Rizky', '', '']);
    for (const k of Object.keys(env.cache)) if (k.indexOf('openslots') === 0) delete env.cache[k];
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Index?view=public', calls, { xnk_member_token: token }, { timezoneId: 'Asia/Jakarta', wait: 1300 });
    await page.evaluate(id => window.openRescheduleModal(id), mine.id);
    await page.waitForTimeout(500);
    const takenDay = new Date(taken.start).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await page.fill('#edit-sch-date', takenDay);
    await page.fill('#edit-sch-time', '10:00');
    const rowsBefore = env.sheet('Schedules').rows.length;
    await page.click('#form-edit-schedule button[type="submit"]');
    await page.waitForTimeout(900);
    check(await visible(page, '.conflict-panel'), 'reschedule: a taken hour shows the conflict notice in the sheet');
    check(((await page.textContent('.conflict-panel')) || '').includes('tetap aman'), 'reschedule: the notice says the old session is safe');
    check((await page.locator('.conflict-panel [data-act="all"]').count()) === 0 && (await page.locator('.conflict-panel [data-act="time"]').count()) === 1,
      'reschedule: "Ganti jam" instead of "Lihat semua jam" (the grid would book an extra session)');
    await page.locator('.conflict-panel .slot[data-i]').first().click();
    check(((await page.textContent('#sch-submit-btn')) || '').startsWith('Pindah ke '), 'reschedule: a suggestion makes the button "Pindah ke …"');
    await page.click('#form-edit-schedule button[type="submit"]');
    await page.waitForTimeout(900);
    const row = env.sheet('Schedules').rows.find(r => r[0] === mine.id);
    check(env.sheet('Schedules').rows.length === rowsBefore && !!row && new Date(row[4]).toISOString() !== new Date(own.start).toISOString(),
      'reschedule: the same session moved, no extra session');
    check((await page.locator('.conflict-panel [data-act="time"]').count()) === 0 && (await page.textContent('#toast-msg')).includes('Jadwal dipindah'), 'reschedule: "Jadwal dipindah …"');
    await page.waitForTimeout(600); await page.evaluate(() => { const s = document.getElementById('modal-add-cal'); if (s && !s.classList.contains('hide')) window.closeModal(); }); await page.waitForTimeout(350);   // booking offers "Tambah ke kalender" (I4)
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
    check((await page.locator('#slot-hours .slot-band').count()) > 0, 'hours grouped into time-of-day bands (Pagi/Siang/Sore/Malam)');
    check((await page.locator('#slot-hours .slot-h:not(.taken):not(.past)').count()) > 0, 'free hours listed');
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
    await page.locator('#slot-hours .slot-h:not(.taken):not(.past)').first().click();
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
    // No polling: the free hours load once; time passing alone sends no new request.
    const env = seededEnv();
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Landing', calls, null, { touch: true, clock: true, wait: LANDING_WAIT });
    const first = calls.filter(c => c === 'getOpenSlots').length;
    await page.clock.runFor(20000);
    await page.waitForTimeout(400);
    const later = calls.filter(c => c === 'getOpenSlots').length;
    check(first === 1 && later === first, 'Landing: free hours load once, no getOpenSlots after 20 s (' + first + ' → ' + later + ')');
    noErrors(errors);
    await context.close();
  }
  {
    // The first load fails: "Coba lagi" in the box loads the hours (no polling otherwise).
    const env = seededEnv();
    const orig = env.call.bind(env);
    let failOnce = true;
    env.call = (name, ...args) => {
      if (name === 'getOpenSlots' && failOnce) { failOnce = false; throw new Error('Server error'); }
      return orig(name, ...args);
    };
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Landing', calls, null, { touch: true, wait: LANDING_WAIT });
    check(await visible(page, '#slot-hours .slot-retry'), 'Landing: a failed first load shows "Coba lagi"');
    const box = await page.locator('#slot-hours .slot-retry').boundingBox();
    check(!!box && box.height >= 44, 'Landing: "Coba lagi" is a 44 px tap target');
    await page.click('#slot-hours .slot-retry');
    await page.waitForTimeout(600);
    check((await page.locator('#slot-hours .slot-h').count()) > 0, 'Landing: "Coba lagi" loads the free hours');
    noErrors(errors);
    await context.close();
  }
  {
    // Pick within 2 minutes: checked on screen, no call. After 2 minutes: one reload; a taken hour offers nearby free hours.
    const env = seededEnv();
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Landing', calls, null, { touch: true, clock: true, wait: LANDING_WAIT });
    const count = () => calls.filter(c => c === 'getOpenSlots').length;
    await page.click('#slot-days [data-day="1"]');
    await page.waitForTimeout(200);
    const free = await page.locator('#slot-hours .slot-h:not(.taken):not(.past)').evaluateAll(els => els.map(e => Number(e.getAttribute('data-h'))));
    check(free.length >= 3, 'Landing: tomorrow has free hours to pick (' + free.length + ')');
    const before = count();
    await page.locator('#slot-hours .slot-h[data-h="' + free[0] + '"]').first().click();
    await page.waitForTimeout(200);
    check(count() === before && await visible(page, '#member-check-modal'), 'Landing: a pick within 2 minutes opens the member check with no server call');
    await page.keyboard.press('Escape');
    await page.clock.runFor(600);
    check(count() === before, 'Landing: closing the member check within 2 minutes sends no call');
    // Someone books the next free hour; the server cache is cleared as an app write would do.
    const h = free[1];
    const day = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const st = new Date(day + 'T' + String(h).padStart(2, '0') + ':00:00+07:00');
    env.sheet('Schedules').rows.push(['SCH-LT', 'PT-B', 'Budi', '081222222222', st.toISOString(), new Date(st.getTime() + 3600000).toISOString(), '', 'read', 'C-1', 'Rizky', '', '']);
    for (const k of Object.keys(env.cache)) if (k.indexOf('openslots') === 0) delete env.cache[k];
    await page.clock.runFor(121000);
    await page.locator('#slot-hours .slot-h[data-h="' + h + '"]').first().click();
    await page.waitForTimeout(600);
    const msg = (await page.textContent('#slot-msg')) || '';
    check(count() === before + 1, 'Landing: a pick after 2 minutes reloads the hours once (' + before + ' → ' + count() + ')');
    check(msg.includes('Jam ' + String(h).padStart(2, '0') + '.00 sudah terisi') && (await page.locator('#slot-msg .slot-alt').count()) >= 1, 'Landing: a taken hour shows "sudah terisi" with nearby free hours: ' + msg.trim());
    const altBox = await page.locator('#slot-msg .slot-alt').first().boundingBox();
    check(!!altBox && altBox.height >= 44, 'Landing: alternative hours are 44 px tap targets');
    await page.click('#slot-days [data-day="2"]');
    await page.waitForTimeout(200);
    check(await page.locator('#slot-msg').evaluate(el => el.hidden), 'Landing: switching day clears the "sudah terisi" message');
    // A second hour is taken; after 2 minutes, picking it reloads once and offers hours for that same day.
    const h2 = free[2];
    const st2 = new Date(day + 'T' + String(h2).padStart(2, '0') + ':00:00+07:00');
    env.sheet('Schedules').rows.push(['SCH-LT2', 'PT-C', 'Citra', '6283333333333', st2.toISOString(), new Date(st2.getTime() + 3600000).toISOString(), '', 'read', 'C-1', 'Rizky', '', '']);
    for (const k of Object.keys(env.cache)) if (k.indexOf('openslots') === 0) delete env.cache[k];
    await page.clock.runFor(121000);
    await page.click('#slot-days [data-day="1"]');
    await page.waitForTimeout(200);
    await page.locator('#slot-hours .slot-h[data-h="' + h2 + '"]').first().click();
    await page.waitForTimeout(600);
    const altH = Number(await page.locator('#slot-msg .slot-alt').first().getAttribute('data-h'));
    await page.locator('#slot-msg .slot-alt').first().click();
    await page.waitForTimeout(300);
    check(await visible(page, '#member-check-modal'), 'Landing: tapping an alternative hour opens the member check');
    const pick = JSON.parse((await page.evaluate(() => localStorage.getItem('xnk_pending_slot'))) || '{}');
    check(pick.date === day && pick.time === String(altH).padStart(2, '0') + ':00' && pick.at > 0, 'Landing: the picked alternative keeps its own day and hour (' + JSON.stringify(pick) + ')');
    noErrors(errors);
    await context.close();
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
    await page.waitForTimeout(200);

    // Program latihan: prev/next buttons next to the "01/04" counter.
    check(await page.evaluate(() => document.getElementById('program-prev').disabled), 'previous-program button disabled at the first card');
    check(!(await page.evaluate(() => document.getElementById('program-next').disabled)), 'next-program button enabled when more cards remain');
    await page.click('#program-next');
    await page.waitForTimeout(600);
    check((await page.textContent('#program-idx')) !== '01', 'clicking the next-program button advances the slider');
    await page.click('#program-prev');
    await page.waitForTimeout(600);
    check((await page.textContent('#program-idx')) === '01', 'clicking the previous-program button goes back');
    await page.evaluate(() => { const vp = document.getElementById('program-viewport'); vp.scrollLeft = vp.scrollWidth; vp.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(200);
    check(await page.evaluate(() => document.getElementById('program-next').disabled), 'next-program button disabled at the last card');
    await page.evaluate(() => { const vp = document.getElementById('program-viewport'); vp.scrollLeft = 0; vp.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(200);

    if (ASSETS) {
      const ty = () => page.evaluate(() => getComputedStyle(document.getElementById('figure-desk')).getPropertyValue('--ty'));
      const initialTy = await ty();
      await scrollLanding(page, 900 * 0.8);
      check((await ty()) !== initialTy, 'the photo gets a subtle parallax while scrolling past the hero (no pin)');
      await shot(page, 'landing-desktop-scroll');
      await scrollLanding(page, (await sectionY(page, '#program')) + 40);
      await shot(page, 'landing-desktop-program');

      // Proses & FAQ live on the info page (overlay), not as sections of the landing.
      check(!(await page.evaluate(() => !!document.getElementById('method') || !!document.getElementById('faq') || !!document.querySelector('.marquee'))), 'landing no longer has the process, FAQ and ticker sections');
      await page.evaluate(() => document.querySelector('[data-info="proses"]').click());
      await page.waitForTimeout(200);
      check(await page.evaluate(() => !document.getElementById('info-page').hidden && document.querySelectorAll('#steps .step').length === 4), 'info page opens on the process tab with 4 steps');
      await page.evaluate(() => document.querySelector('[data-info-tab="faq"]').click());
      check(await page.evaluate(() => !document.querySelector('[data-info-pane="faq"]').hidden && document.querySelector('[data-info-pane="proses"]').hidden), 'info page FAQ tab shows the FAQ');
      await shot(page, 'landing-desktop-info');
      await page.evaluate(() => document.querySelector('[data-info-close]').click());
      check(await page.evaluate(() => document.getElementById('info-page').hidden), 'info page closes');
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

  console.log('Landing · slot kosong (kapasitas per coach, bukan sekadar hitung kepala)');
  {
    const env = seededEnv();
    env.ss.seed('Coaches', [
      ['ID', 'Nama Coach', 'No WA', 'Spesialisasi', 'Foto URL', 'Bio', 'Pengalaman'],
      ['C-1', 'Rizky', '6281112223334', 'Strength', '', 'Bio', '3 Tahun'],
      ['C-2', 'Dina', '6281112223335', 'Cardio', '', 'Bio', '2 Tahun'],
    ]);
    // Jam dihitung di WIB, seperti mesin slot server (mesin ini tidak harus berzona waktu WIB).
    const wibDate = days => new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const at = (days, h) => new Date(wibDate(days) + 'T' + ('0' + h).slice(-2) + ':00:00+07:00').toISOString();
    const plusH = (iso, h) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();
    const rows = env.sheet('Schedules').rows;
    // Hari ke-4: cuma C-1 sibuk jam 10 — C-2 masih bisa, jadi jam itu HARUS tetap kosong
    // (dulu, kalau ada coach terdaftar lain yang jadi hantu/tidak dipakai, ini akan salah dianggap penuh).
    rows.push(['SCH-M1', 'PT-A', 'Ani Anggraini', '6281111111111', at(4, 10), plusH(at(4, 10), 1), '', 'read', 'C-1', 'Rizky', '', '']);
    // Hari ke-5: C-1 sibuk + 1 booking yang belum ditugaskan admin (coachId kosong) jam 10 —
    // dua "kursi" dari dua coach terpakai, jadi jam itu HARUS penuh (booking tanpa coach dulu tidak menghalangi apa-apa).
    rows.push(['SCH-M2', 'PT-B', 'Budi', '081222222222', at(5, 10), plusH(at(5, 10), 1), '', 'read', 'C-1', 'Rizky', '', '']);
    rows.push(['SCH-M3', 'PT-C', 'Citra', '6283333333333', at(5, 10), plusH(at(5, 10), 1), '', 'unread', '', '']);
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { viewport: DESKTOP, wait: LANDING_WAIT });

    // Dua coach aktif: pilih coach dulu, jam baru muncul.
    check((await page.textContent('#slot-hours')).includes('Pilih coach dulu'), 'dua coach aktif: jam tidak ditampilkan sebelum coach dipilih');
    await page.click('#slot-coaches .slot-coach[data-coach="C-2"]');
    await page.waitForSelector('#slot-days [data-day="4"]');
    await page.click('#slot-days [data-day="4"]');
    await page.waitForTimeout(300);
    check(!(await page.locator('#slot-hours .slot-h[data-h="10"]').first().evaluate(el => el.disabled)),
      'hari ke-4: jam 10 tetap kosong karena coach lain (C-2) masih bisa — bukan sekadar hitung kepala booking');

    await page.click('#slot-days [data-day="5"]');
    await page.waitForTimeout(300);
    check(await page.locator('#slot-hours .slot-h[data-h="10"]').first().evaluate(el => el.disabled && el.classList.contains('taken')),
      'hari ke-5: jam 10 penuh — booking tanpa coach tetap makan satu kursi kapasitas');
    await shot(page, 'landing-desktop-slot-multicoach');
    noErrors(errors);
    await context.close();
  }

  console.log('Landing · slot kosong (jam kerja asli coach, CoachAvailability)');
  {
    const env = seededEnv();
    const dow = new Date(new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + 'T12:00:00+07:00').getUTCDay();
    const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    env.ss.seed('CoachAvailability', [
      ['Coach ID', 'Hari', 'Jam Mulai', 'Jam Selesai'],
      ['C-1', dayNames[dow], '08:00', '10:00'],
    ]);
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { viewport: DESKTOP, wait: LANDING_WAIT });
    await page.click('#slot-days [data-day="1"]');
    await page.waitForTimeout(300);
    const hours = await page.locator('#slot-hours .slot-h').evaluateAll(els => els.map(e => e.getAttribute('data-h')).sort());
    check(hours.length === 2 && hours.includes('8') && hours.includes('9'),
      'jam kerja asli coach (08–10, diisi admin di CoachAvailability) mempersempit jendela hari itu, bukan jam buka default (' + hours.join(',') + ')');
    await shot(page, 'landing-desktop-slot-envelope');
    noErrors(errors);
    await context.close();
  }
  {
    // Sheet CoachAvailability masih kosong (kondisi nyata saat ini, belum ada UI admin untuk isi) →
    // tidak boleh ada regresi: jendela jam tetap DAY_HOURS seperti sebelumnya.
    const env = seededEnv();
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { viewport: DESKTOP, wait: LANDING_WAIT });
    await page.click('#slot-days [data-day="1"]');
    await page.waitForTimeout(300);
    const hours = await page.locator('#slot-hours .slot-h').evaluateAll(els => els.map(e => Number(e.getAttribute('data-h'))));
    const dow = new Date(new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + 'T12:00:00+07:00').getUTCDay();
    const expected = ({ 0: [6, 12], 1: [6, 21], 2: [6, 21], 3: [6, 21], 4: [6, 21], 5: [6, 21], 6: [6, 21] })[dow];
    check(hours.length === expected[1] - expected[0], 'no CoachAvailability rules → falls back to the default opening hours, no regression (' + hours.length + ' jam)');
    noErrors(errors);
    await context.close();
  }
  console.log('Landing · jam operasional dari Pengaturan admin (BUSINESS_HOURS_JSON)');
  {
    const env = seededEnv();
    const dow = new Date(new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + 'T12:00:00+07:00').getUTCDay();   // WIB, like the server
    const hoursMap = { 0: [6, 12], 1: [6, 21], 2: [6, 21], 3: [6, 21], 4: [6, 21], 5: [6, 21], 6: [6, 21] };
    hoursMap[dow] = [9, 12];
    env.props.BUSINESS_HOURS_JSON = JSON.stringify(hoursMap);
    const { page, context, errors } = await openPage(browser, env, '/Landing', [], null, { viewport: DESKTOP, wait: LANDING_WAIT });
    await page.click('#slot-days [data-day="1"]');
    await page.waitForTimeout(300);
    const hours = await page.locator('#slot-hours .slot-h').evaluateAll(els => els.map(e => Number(e.getAttribute('data-h'))).sort((a, b) => a - b));
    check(hours.length === 3 && hours[0] === 9 && hours[hours.length - 1] === 11,
      'jam operasional yang diatur admin lewat Pengaturan (09–12) dipakai Landing, bukan jam buka default (' + hours.join(',') + ')');
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
