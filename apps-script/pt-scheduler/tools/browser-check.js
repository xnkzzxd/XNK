#!/usr/bin/env node
// End-to-end check of the real Index.html / Landing.html in headless Chromium.
// google.script.run is bridged to the real server code (src/*.gs) running in
// the Node test harness, and CDN scripts are replaced by tiny stubs, so this
// runs fully offline. Not part of CI (needs Playwright + Chromium):
//
//   NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/browser-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { seededEnv, KEY_A, ADMIN_PIN } = require('../tests/fixtures');

const SRC = path.join(__dirname, '..', 'src');
const ORIGIN = 'https://gas.test';
const SHOTS = process.env.SHOTS_DIR || '';
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
      window.__calendarOpts = opts; this.render = function() {}; this.destroy = function() {}; } };`,
  'cropper.min.js': 'window.Cropper = function() { return { destroy: function() {} }; };',
};

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

async function openPage(browser, env, pagePath, calls, storage) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN)) {
      const page = new URL(url).pathname.replace('/', '') || 'Index';
      return route.fulfill({ contentType: 'text/html', body: render(page) });
    }
    const stub = Object.keys(STUBS).find(k => url.includes(k));
    if (stub) return route.fulfill({ contentType: 'application/javascript', body: STUBS[stub] });
    return route.fulfill({ status: 204, body: '' }); // fonts, css, images, analytics
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(ORIGIN + pagePath);
  await page.waitForTimeout(700);
  return { page, context, errors };
}

const visible = (page, sel) => page.locator(sel).first().isVisible();

(async () => {
  const browser = await chromium.launch();

  // ── Panel PT (admin) ──────────────────────────────────────────────────────
  console.log('Panel PT (admin)');
  {
    const env = seededEnv();
    env.memberRow('PT-B')[1] = '<img src=x onerror="window.__xss=1">Budi';
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Index', calls);

    check(await visible(page, '#admin-login'), 'no token → PIN login screen is shown');
    check(!calls.includes('getMembers') && !calls.includes('getSchedules'), 'no client data requested before login');

    await page.fill('#admin-pin', '000000');
    await page.click('#admin-login-btn');
    await page.waitForTimeout(400);
    check((await page.textContent('#admin-login-error')).includes('PIN salah'), 'wrong PIN → "PIN salah."');

    await page.fill('#admin-pin', ADMIN_PIN);
    await page.click('#admin-login-btn');
    await page.waitForTimeout(900);
    check(!(await visible(page, '#admin-login')), 'right PIN → login screen closes');
    check((await page.evaluate(() => window.members.length)) === 3, 'clients loaded after login');
    check(!!(await page.evaluate(() => localStorage.getItem('xnk_admin_token'))), 'admin token stored on this device');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-dashboard.png') });

    await page.evaluate(() => window.navigate('clients'));
    await page.waitForTimeout(300);
    check((await page.evaluate(() => window.__xss)) === undefined, 'client name with <img onerror> is not executed');
    check((await page.textContent('#client-list')).includes('<img src=x'), 'client name is shown as plain text');

    await page.evaluate(() => window.openProfile('PT-C'));
    await page.click('text=Kirim Link Member');
    await page.waitForTimeout(400);
    const opened = await page.evaluate(() => window.__opened.map(w => w.location.href));
    const wa = opened.find(u => u.startsWith('https://wa.me/6283333333333'));
    check(!!wa && /k%3D[a-f0-9]{32}/.test(wa), '"Kirim Link Member" opens WhatsApp with the client\'s personal link');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'admin-profile.png') });

    // Session survives a reload; a changed PIN logs every device out.
    const token = await page.evaluate(() => localStorage.getItem('xnk_admin_token'));
    const reload = await openPage(browser, env, '/Index', [], { xnk_admin_token: token });
    check(!(await visible(reload.page, '#admin-login')), 'reload with saved token → straight into the panel');
    env.props.ADMIN_PIN = '99999999';
    const revoked = await openPage(browser, env, '/Index', [], { xnk_admin_token: token });
    check(await visible(revoked.page, '#admin-login'), 'ADMIN_PIN changed → saved token rejected, login shown');
    check((await revoked.page.textContent('#admin-login-error')).includes('Sesi admin berakhir'), 'explains why the PIN is needed again');
    check(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await context.close(); await reload.context.close(); await revoked.context.close();
  }

  // ── Portal klien (?view=public) ───────────────────────────────────────────
  console.log('Portal klien (?view=public)');
  {
    const env = seededEnv();
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Index?view=public', calls);
    const adminCalls = ['getMembers', 'getSchedules', 'getMemberTransactionLog', 'getPackageTrendStats', 'checkAdminSession'];
    check(!calls.some(c => adminCalls.includes(c)), 'no admin functions called: ' + calls.join(','));
    check(!(await visible(page, '#admin-login')), 'admin PIN screen never appears in the client portal');
    check((await page.evaluate(() => window.members.length)) === 0, 'no client list in the browser');
    const leaked = await page.evaluate(() => JSON.stringify(window.schedules));
    check(!leaked.includes('Ani') && !leaked.includes('Rahasia') && !leaked.includes('62811'), 'public calendar data has no names, notes or phone numbers');
    await page.evaluate(() => window.navigate('public-login'));
    check((await page.textContent('#view-public-login')).includes('link member pribadi'), 'login page explains the personal link');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'portal-login.png') });
    check(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await context.close();
  }
  {
    const env = seededEnv();
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Index?view=public&k=' + KEY_A, calls);
    await page.waitForTimeout(500);
    check((await page.evaluate(() => window.publicLoggedMember && window.publicLoggedMember.id)) === 'PT-A', 'personal link logs the client in');
    check((await page.evaluate(() => window.currentView)) === 'public-dashboard', 'opens "Dashboardku"');
    check((await page.textContent('#pub-dash-name')).includes('Ani'), 'shows the client\'s own name');
    const own = await page.evaluate(() => window.schedules.find(s => s.id === 'SCH-A1'));
    check(own && own.notes === 'Rahasia Ani', 'own bookings include their details');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'portal-dashboard.png') });

    // Book a session through the real form.
    await page.evaluate(() => window.handleFabClick());
    const d = new Date(Date.now() + 5 * 86400000);
    await page.fill('#edit-sch-date', d.toISOString().slice(0, 10));
    await page.fill('#edit-sch-time', '10:00');
    await page.fill('#edit-sch-notes', 'Leg day');
    await page.evaluate(() => document.querySelector('#form-edit-schedule button[type="submit"]').click());
    await page.waitForTimeout(500);
    const booked = env.sheet('Schedules').rows.find(r => r[6] === 'Leg day');
    check(!!booked && booked[1] === 'PT-A' && booked[7] === 'unread', 'booking is saved for the logged-in client');

    // Link reset by the PT → this device is logged out on next load.
    env.call('adminGetMemberLink', env.adminToken(), 'PT-A', true);
    const token = await page.evaluate(() => localStorage.getItem('xnk_member_token'));
    const again = await openPage(browser, env, '/Index?view=public', [], { xnk_member_token: token });
    check(!(await again.page.evaluate(() => window.publicLoggedMember)), 'after "Link Baru", the old session no longer works');
    check((await again.page.textContent('#member-link-message')).includes('tidak berlaku'), 'client is told to ask for a new link');
    check(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await context.close(); await again.context.close();
  }
  {
    const env = seededEnv();
    const { page, context } = await openPage(browser, env, '/Index?view=public&k=' + 'f'.repeat(32), []);
    check((await page.evaluate(() => window.currentView)) === 'public-login', 'unknown link → login page');
    check((await page.textContent('#member-link-message')).includes('tidak dikenal'), 'unknown link → clear message');
    await context.close();
  }

  // ── Landing ───────────────────────────────────────────────────────────────
  console.log('Landing');
  {
    const env = seededEnv();
    const calls = [];
    const { page, context, errors } = await openPage(browser, env, '/Landing', calls);
    await page.evaluate(() => { openMemberCheck(); goToBooking('existing'); });
    await page.waitForTimeout(200);
    check((await page.textContent('#member-check-modal')).includes('link member pribadi'), '"Member lama" explains the personal link');
    check(!calls.includes('getMembers'), 'no client list requested');

    await page.evaluate(() => openRegistration());
    await page.waitForTimeout(300);
    await page.fill('#reg-name', 'Fajar');
    await page.fill('#reg-wa', '81577777777');
    await page.selectOption('#reg-goal', 'Weight Loss');
    await page.evaluate(() => doRegisterStep1());
    await page.evaluate(() => doRegisterStep2());
    await page.waitForTimeout(500);
    const row = env.sheet('MemberData').rows.find(r => r[1] === 'Fajar');
    check(!!row && row[13] && /^[a-f0-9]{32}$/.test(row[13]), 'registration creates the client with a link key');
    check(await visible(page, '#reg-step-3'), 'shows "Registrasi Berhasil!"');
    check((await page.evaluate(() => window._newMemberLink || '')).includes('k=' + (row && row[13])), '"Lanjut Booking" goes to the new client\'s own link');
    check(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await context.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll browser checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
