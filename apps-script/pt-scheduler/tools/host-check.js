'use strict';
// Checks the static page's local host (host-local.js, sw-app.js; Phase AAA) in a real browser:
//   - the page answers its own "host?" message (safe area, keyboard, iOS flags) and applies it as --sa-* / --kb,
//   - the theme message sets the browser bar colour, offline messages reach the offline screen's storage,
//   - the service worker installs and the page opens again without a network,
//   - a page inside an iframe is left alone (the real wrapper answers there).
// Run: NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/host-check.js
const http = require('http');
const { chromium } = require('playwright');
const { build } = require('./build-static');

let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };
const TYPE = { js: 'application/javascript', css: 'text/css', html: 'text/html' };

(async () => {
  const files = build({ site: 'app', exec: 'https://script.test/macros/s/X/exec' });
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/frame') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<iframe id="f" src="/next/" style="width:400px;height:700px"></iframe>'); return; }
    if (p === '/next' ) { res.writeHead(301, { location: '/next/' }); res.end(); return; }
    if (!p.startsWith('/next/')) { res.writeHead(404); res.end(); return; }
    const f = p.slice('/next/'.length) || 'index.html';
    if (files[f] === undefined) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPE[f.split('.').pop()] || 'text/plain' });
    res.end(files[f]);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://script.test/')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'Sesi tidak berlaku.', auth: true, v: 1 }) });
    if (u.includes('lucide')) return r.fulfill({ contentType: 'application/javascript', body: 'window.lucide={createIcons(){}};' });
    if (u.includes('fullcalendar')) return r.fulfill({ contentType: 'application/javascript', body: 'window.FullCalendar={Calendar:function(){this.render=function(){};this.destroy=function(){}}};' });
    if (u.includes('cropper.min.js')) return r.fulfill({ contentType: 'application/javascript', body: 'window.Cropper=function(){};' });
    return r.fulfill({ status: 204, body: '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  console.log('Local host · top-level page');
  await page.goto(base + '/next/');
  await page.waitForTimeout(1500);
  let s = await page.evaluate(() => ({
    local: window.XNKHostLocal === true, probe: !!document.getElementById('sa-probe'),
    vars: ['t', 'r', 'b', 'l'].map(k => document.documentElement.style.getPropertyValue('--sa-' + k)), kb: document.documentElement.style.getPropertyValue('--kb'),
    offline: !!window.XNKOffline, login: !!document.getElementById('admin-login') && !document.getElementById('admin-login').classList.contains('hide'),
  }));
  check(s.local && s.probe && s.offline, 'host-local, the safe-area probe and the offline screen are loaded');
  check(s.login, 'the panel login shows');
  check(s.vars.join() === '0px,0px,0px,0px' && s.kb === '0px', `the app got the host answer (insets ${s.vars.join(' ')}, keyboard ${s.kb})`);

  // A notch / home bar: the probe's padding is what env(safe-area-inset-*) gives on an iPhone.
  await page.addStyleTag({ content: '#sa-probe{padding:47px 0px 34px 0px !important}' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(400);
  s = await page.evaluate(() => ['t', 'b'].map(k => document.documentElement.style.getPropertyValue('--sa-' + k)));
  check(s[0] === '47px' && s[1] === '34px', `a changed safe area reaches --sa-t / --sa-b (${s.join(' ')})`);

  // Theme colour: the app asks, the page answers by setting the browser bar colour.
  await page.evaluate(() => window.postMessage({ xnk: 'theme', color: '#123456' }, location.origin));
  await page.waitForTimeout(200);
  check((await page.getAttribute('meta[name="theme-color"]', 'content')) === '#123456', 'the theme message sets the theme-color meta');
  await page.evaluate(() => window.postMessage({ xnk: 'theme', color: 'red' }, location.origin));
  await page.waitForTimeout(100);
  check((await page.getAttribute('meta[name="theme-color"]', 'content')) === '#123456', 'a bad colour value is ignored');

  // Offline relay: snapshot and queue go through the same messages the wrapper handled.
  const rt = await page.evaluate(async () => {
    window.__got = [];
    window.addEventListener('message', e => { if (e.data && e.data.xnk === 'offline-queue') window.__got.push(e.data); });
    window.postMessage({ xnk: 'offline-queue?' }, location.origin);
    await new Promise(r => setTimeout(r, 300));
    return window.__got.length;
  });
  check(rt === 1, 'offline-queue? is answered by the page itself');
  // Messages from another origin or window are ignored.
  const foreign = await page.evaluate(async () => {
    const f = document.createElement('iframe'); f.srcdoc = '<script>parent.postMessage({xnk:"theme",color:"#abcdef"},"*")<\/script>'; document.body.appendChild(f);
    await new Promise(r => setTimeout(r, 400)); f.remove();
    return document.querySelector('meta[name="theme-color"]').getAttribute('content');
  });
  check(foreign === '#123456', 'a message from another frame is ignored');

  console.log('Local host · service worker and offline open');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller === null ? false : true, null, { timeout: 5000 }).catch(() => {});
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); if (!r) return null; await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; });
  check(reg && reg.active && reg.scope.endsWith('/next/'), `the service worker is active in the page's folder (${reg && reg.scope})`);
  const cached = await page.evaluate(async () => { const keys = await caches.keys(); const k = keys.find(x => x.indexOf('xnk-page-') === 0); if (!k) return null; const c = await caches.open(k); return (await c.keys()).map(r => new URL(r.url).pathname); });
  check(cached && cached.includes('/next/') && cached.some(p => /\/app\.[0-9a-f]{10}\.js$/.test(p)) && cached.some(p => /\/theme\.[0-9a-f]{10}\.css$/.test(p)), `the page and its hashed files are in the cache (${cached ? cached.length : 0} entries)`);
  await page.reload();   // under the worker's control from now on
  await page.waitForTimeout(800);
  const xoffHidden = () => page.waitForFunction(() => { const x = document.getElementById('xoff'); return !x || x.hidden; }, null, { timeout: 8000 }).then(() => true, () => false);
  const xoffShown = () => page.waitForFunction(() => { const x = document.getElementById('xoff'); return !!x && !x.hidden; }, null, { timeout: 8000 }).then(() => true, () => false);
  // A: opened without signal, nothing waiting: the cached app opens and the offline screen does not cover it.
  await ctx.setOffline(true);
  await page.goto(base + '/next/?view=public').catch(() => {});
  await page.waitForFunction(() => typeof window.navigate === 'function', null, { timeout: 8000 }).catch(() => {});
  const app = await page.evaluate(() => ({ title: document.title, app: typeof window.navigate === 'function' }));
  check(app.app, `the page opens without a network (${app.title})`);
  check(await xoffHidden(), 'nothing waiting: the offline screen gives way to the app once it has greeted');
  await page.waitForTimeout(800);
  check(await page.evaluate(() => { const x = document.getElementById('xoff'); return !x || x.hidden; }), '... and stays out of the way');
  await ctx.setOffline(false);
  // B: a note made offline is waiting: the offline screen stays, so it can be sent when the signal is back.
  await page.goto(base + '/next/');
  await page.evaluate(() => localStorage.setItem('xnk_off_queue', JSON.stringify([{ id: 'ms-t1', kind: 'measure', memberId: 'PT-A', date: '2026-11-07', data: { tanggal: '2026-11-07', berat: '70', cid: 'ms-t1' }, sig: '', at: Date.now() }])));
  await ctx.setOffline(true);
  await page.goto(base + '/next/').catch(() => {});
  check(await xoffShown(), 'a note waiting to be sent: the "Catat offline" screen shows when opened without signal');
  await page.waitForTimeout(800);
  check(await page.evaluate(() => { const x = document.getElementById('xoff'); return !!x && !x.hidden; }), '... and stays, even after the app has greeted');
  await ctx.setOffline(false);
  await page.evaluate(() => localStorage.removeItem('xnk_off_queue'));

  console.log('Local host · inside a frame');
  await ctx.unroute('**/*');
  const p2 = await ctx.newPage();
  await p2.route('**/*', r => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); return r.fulfill({ status: 204, body: '' }); });
  await p2.goto(base + '/frame');
  await p2.waitForTimeout(1500);
  const fr = p2.frames().find(f => f.url().endsWith('/next/'));
  const inner = fr ? await fr.evaluate(() => ({ local: !!window.XNKHostLocal, probe: !!document.getElementById('sa-probe') })) : null;
  check(inner && !inner.local && !inner.probe, 'host-local does nothing when the page is inside a frame');

  check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors[0] : ''));
  await browser.close(); server.close();
  console.log(failures ? failures + ' check(s) failed' : 'host-check OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
