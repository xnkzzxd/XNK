'use strict';
// Checks the assembled site (tools/build-site.js) in a real browser, the way xnk.my.id serves it (Phase AAA, T-1722):
//   default build: / is the static panel with its service worker at the root, which must not take over /demo/, /app/ or
//   /legacy/; the old wrapper lives at /legacy/; the page at / opens without a network.
//   rollback build (ROOT_LEGACY): / is the old iframe wrapper again and none of the static-page files are at the root.
// Run: NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/site-check.js
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { buildSite } = require('./build-site');

let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };
const MIME = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', ico: 'image/x-icon', txt: 'text/plain', gif: 'image/gif' };
const EXEC = 'https://script.test/macros/s/X/exec';

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(dir, p);
      if (!f.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
        if (!p.endsWith('/')) { res.writeHead(301, { location: p + '/' }); res.end(); return; }
        f = path.join(f, 'index.html');
      }
      if (!fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[f.split('.').pop()] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port }));
  });
}
async function newContext(browser, base) {
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
  return ctx;
}

(async () => {
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-sitecheck-'));
  try {
    // ── default build ───────────────────────────────────────────────────────────────────────────
    console.log('Site · default build (the static panel at /)');
    const dirA = path.join(tmp, 'a');
    buildSite({ outDir: dirA, exec: EXEC, rootLegacy: false });
    const A = await serve(dirA);
    const ctx = await newContext(browser, A.base);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(A.base + '/');
    await page.waitForTimeout(1500);
    let s = await page.evaluate(() => ({ site: window.XNK_CONFIG && window.XNK_CONFIG.site, local: window.XNKHostLocal === true, login: !!document.getElementById('admin-login') && !document.getElementById('admin-login').classList.contains('hide'), iframe: !!document.querySelector('iframe#app'), manifest: !!document.querySelector('link[rel=manifest]') }));
    check(s.site === 'app' && s.local && s.login && !s.iframe, '/ is the static panel (no iframe), with the panel login');
    check(s.manifest, '/ carries the Home Screen manifest');
    const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/'); if (!r) return null; await navigator.serviceWorker.ready; return r.scope; });
    check(reg && reg.endsWith(':' + A.base.split(':')[2] + '/'), `its service worker has the root scope (${reg})`);
    await page.reload(); await page.waitForTimeout(800);   // controlled from now on

    await page.goto(A.base + '/demo/'); await page.waitForTimeout(3000);
    s = await page.evaluate(() => ({ title: document.title, transport: typeof window.XNK_TRANSPORT, config: !!window.XNK_CONFIG }));
    check(s.transport === 'function' && !s.config && /Dashboard/.test(s.title), `/demo/ is still the demo, not the panel (${s.title})`);
    await page.goto(A.base + '/app/'); await page.waitForTimeout(1200);
    check((await page.title()) === 'XNK Catat', '/app/ is still the standalone app');
    await page.goto(A.base + '/legacy/'); await page.waitForTimeout(800);
    s = await page.evaluate(() => { const f = document.querySelector('iframe#app'); return f ? f.src : ''; });
    check(/^https:\/\/script\.google\.com\/macros\//.test(s), '/legacy/ is the old wrapper (iframe to Apps Script)');
    await page.goto(A.base + '/next/'); await page.waitForTimeout(1200);
    check(await page.evaluate(() => window.XNKHostLocal === true && !!document.getElementById('admin-login')), '/next/ still opens the static panel');

    await ctx.setOffline(true);
    await page.goto(A.base + '/?view=public').catch(() => {});
    await page.waitForFunction(() => typeof window.navigate === 'function', null, { timeout: 8000 }).catch(() => {});
    check(await page.evaluate(() => typeof window.navigate === 'function' && window.XNKHostLocal === true), '/ opens without a network from the worker copy');
    await ctx.setOffline(false);
    check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors[0] : ''));
    await ctx.close(); A.server.close();

    // ── rollback build ──────────────────────────────────────────────────────────────────────────
    console.log('Site · rollback build (ROOT_LEGACY: the old wrapper at /)');
    const dirB = path.join(tmp, 'b');
    buildSite({ outDir: dirB, exec: EXEC, rootLegacy: true });
    const B = await serve(dirB);
    const ctx2 = await newContext(browser, B.base);
    const p2 = await ctx2.newPage();
    await p2.goto(B.base + '/'); await p2.waitForTimeout(1000);
    s = await p2.evaluate(() => { const f = document.querySelector('iframe#app'); return { iframe: f ? f.src : '', local: window.XNKHostLocal === true, config: !!window.XNK_CONFIG }; });
    check(/^https:\/\/script\.google\.com\/macros\//.test(s.iframe) && !s.local && !s.config, '/ is the old wrapper again');
    await p2.goto(B.base + '/next/'); await p2.waitForTimeout(1200);
    check(await p2.evaluate(() => window.XNKHostLocal === true), '/next/ still opens the static panel');
    await ctx2.close(); B.server.close();
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failures ? failures + ' check(s) failed' : 'site-check OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
