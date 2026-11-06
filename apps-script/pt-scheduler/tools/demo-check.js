'use strict';
// Checks demo/index.html in a real browser (Playwright, like share-check.js):
//   - the panel (/demo/) and the portal (/demo/?klien) open signed in, with no script errors,
//   - the demo's device state stays in memory: real localStorage keys of the app on the same origin
//     (xnk.my.id) are neither read, changed nor wiped, and no demo key is left behind.
// Run: NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/demo-check.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', '..');
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };

(async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const f = u.pathname === '/demo/' ? path.join(ROOT, 'demo', 'index.html') : u.pathname === '/blank' ? null : undefined;
    if (f === undefined) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(f ? fs.readFileSync(f) : '<!doctype html><title>blank</title>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.includes('lucide')) return r.fulfill({ contentType: 'application/javascript', body: 'window.lucide={createIcons(){}};' });
    if (u.includes('fullcalendar')) return r.fulfill({ contentType: 'application/javascript', body: 'window.FullCalendar={Calendar:function(){this.render=function(){};this.destroy=function(){}}};' });
    if (u.includes('cropper.min.js')) return r.fulfill({ contentType: 'application/javascript', body: 'window.Cropper=function(){};' });
    return r.fulfill({ status: 204, body: '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const keys = () => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });

  // A device that already holds the real app's state (same origin as the demo).
  await page.goto(base + '/blank');
  const REAL = { xnk_admin_token: 'real.admin.token', xnk_member_token: 'real.member.token', xnk_portal_cache: '{"real":"portal"}', xnk_client_cache: '{"real":"clients"}', xnk_wl_queue: '[{"id":"unsent workout"}]', xnk_theme: 'dark' };
  await page.evaluate(r => { for (const k in r) localStorage.setItem(k, r[k]); }, REAL);

  console.log('Demo · panel');
  await page.goto(base + '/demo/'); await page.waitForTimeout(3500);
  let st = await page.evaluate(() => ({ title: (document.title || ''), members: (window.members || []).length, transport: typeof window.XNK_TRANSPORT, google: typeof window.google, lsAdmin: localStorage.getItem('xnk_admin_token'), n: localStorage.length }));
  check(st.members > 0 && st.transport === 'function' && st.google === 'undefined', `the panel loads the sample clients through XNK_TRANSPORT (${st.members} clients)`);
  check(st.lsAdmin && st.lsAdmin !== REAL.xnk_admin_token, 'the demo uses its own admin session, not the real one');

  console.log('Demo · portal');
  await page.goto(base + '/demo/?klien'); await page.waitForTimeout(3500);
  st = await page.evaluate(() => ({ member: (window.publicLoggedMember || {}).name || null, tok: localStorage.getItem('xnk_member_token') }));
  check(st.member === 'Sari Wulandari', 'the portal opens signed in as the sample client');
  check(st.tok && st.tok !== REAL.xnk_member_token, 'the demo uses its own member session, not the real one');
  check(!(await page.evaluate(() => localStorage.getItem('xnk_client_cache') || localStorage.getItem('xnk_wl_queue'))), 'the demo cannot see the real app\'s cached clients or unsent workouts');
  check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors[0] : ''));

  console.log('Real state after the demo');
  await page.goto(base + '/blank');
  const after = await keys();
  for (const k of Object.keys(REAL)) check(after[k] === REAL[k], `${k} is untouched`);
  check(Object.keys(after).length === Object.keys(REAL).length, 'the demo left no keys behind (' + Object.keys(after).join(', ') + ')');

  await browser.close(); server.close();
  console.log(failures ? failures + ' check(s) failed' : 'demo-check OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
