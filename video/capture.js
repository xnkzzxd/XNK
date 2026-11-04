// Captures demo screens for the reel. Serve the repo root first:
//   python3 -m http.server 8765   (from the repo root)
//   node video/capture.js
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, 'assets', 'screens');
const BASE = process.env.DEMO_URL || 'http://localhost:8765/demo/';
const wait = ms => new Promise(r => setTimeout(r, ms));

async function page(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'light', hasTouch: true, isMobile: true });
  const CDN = process.env.CDN_DIR;
  await ctx.route(u => !/^http:\/\/localhost/.test(u.href), r => {
    const u = r.request().url();
    if (CDN && /lucide/.test(u)) return r.fulfill({ path: path.join(CDN, 'lucide-1.48.0/dist/umd/lucide.min.js'), contentType: 'text/javascript' });
    if (CDN && /fullcalendar/.test(u)) return r.fulfill({ path: path.join(CDN, 'fullcalendar-6.1.11/index.global.min.js'), contentType: 'text/javascript' });
    if (/exercises\.min\.json|foods\.min\.json/.test(u)) return r.fulfill({ path: path.join(__dirname, '..', u.match(/(exercises|foods)\/[^?]+/)[0]) });
    return r.abort();
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto(url, { waitUntil: 'load' });
  await wait(4000);
  await p.evaluate(() => { try { localStorage.setItem('xnk_a2hs', '1'); } catch (e) {} document.querySelectorAll('body > div[style*="e11d48"]').forEach(n => n.remove()); });
  return p;
}
async function shot(p, name, js, ms, sel) {
  if (js) { try { await p.evaluate(js); } catch (e) { console.log('step', name, e.message); } }
  await wait(ms || 1500);
  await p.evaluate(() => { document.querySelectorAll('body > div[style*="e11d48"], #a2hs, #guide-scrim, .guide-card').forEach(n => n.remove()); });
  await p.evaluate(() => { const x = document.querySelector('#xnk-toast, .toast'); if (x) x.remove(); });
  if (sel) {
    await p.evaluate(() => document.querySelectorAll('body *').forEach(e => { const cs = getComputedStyle(e); if (cs.position === 'fixed' && e.getBoundingClientRect().top > 500) e.style.visibility = 'hidden'; }));
    const loc = p.locator(sel).first();
    try { await loc.scrollIntoViewIfNeeded({ timeout: 3000 }); await wait(400); await loc.screenshot({ path: path.join(OUT, name + '.png'), timeout: 5000 }); }
    catch (e) { console.log('miss', name, sel, e.message.split('\n')[0]); return; }
  } else await p.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('shot', name);
}

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const steps = JSON.parse(require('fs').readFileSync(process.argv[2] || path.join(__dirname, 'shots.json'), 'utf8'));
  const c = await page(browser, BASE + '?klien');
  for (const [name, js, ms, sel] of steps.klien) await shot(c, name, js, ms, sel);
  const a = await page(browser, BASE);
  for (const [name, js, ms, sel] of steps.admin) await shot(a, name, js, ms, sel);
  await browser.close();
})();
