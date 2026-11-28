'use strict';
// Fase AG (T-2706): draws every coach poster in a real browser (the demo build, panel) and checks it:
//   - every type × size (9:16, 4:5) × style (gelap, terang) draws; the content box ends above the footer and the
//     footer ends inside the 72 px page margin,
//   - on xnk.my.id the bottom corner strip stays empty (the small "Didukung" mark is Library only) and the brand is XNK,
//     and the owner also gets the "XNK Coach" type,
//   - the editor opens on a phone and on a desktop, every tool pane renders, and Bagikan is enabled.
// Rebuild the demo first (node apps-script/pt-scheduler/tools/build-demo.js).
// Run: NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/poster-check.js [outDir for PNGs]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = process.argv[2] || '';
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };

(async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/demo/') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(ROOT, 'demo', 'index.html')));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  for (const vp of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]) {
    console.log('Poster · ' + vp.name);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u.startsWith(base)) return r.continue();
      if (u.includes('lucide')) return r.fulfill({ contentType: 'application/javascript', body: 'window.lucide={createIcons(){},icons:{},createElement(){return document.createElementNS("http://www.w3.org/2000/svg","svg")}};' });
      if (u.includes('fullcalendar')) return r.fulfill({ contentType: 'application/javascript', body: 'window.FullCalendar={Calendar:function(){this.render=function(){};this.destroy=function(){};this.getEvents=function(){return []};this.removeAllEvents=function(){};this.addEventSource=function(){};this.changeView=function(){};this.gotoDate=function(){};this.updateSize=function(){};}};' });
      if (u.includes('cropper.min.js')) return r.fulfill({ contentType: 'application/javascript', body: 'window.Cropper=function(){};' });
      return r.fulfill({ status: 204, body: '' });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base + '/demo/');
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.posterOpen());
    await page.waitForFunction(() => { const b = document.getElementById('po-go'); return b && !b.disabled; }, null, { timeout: 20000 }).catch(() => {});
    check(await page.locator('#sheet-poster:not(.hide)').count() === 1, 'the poster editor opens');
    check(await page.locator('#po-go:not([disabled])').count() === 1, 'data loaded, Bagikan is enabled');
    await page.waitForFunction(() => { const im = document.getElementById('po-img'); return im && im.naturalWidth > 0; }, null, { timeout: 10000 }).catch(() => {});
    check(await page.evaluate(() => document.getElementById('po-img').naturalWidth === 1080), 'the preview is a 1080 px wide PNG');
    for (const tool of ['jenis', 'isi', 'teks', 'gaya', 'ukuran']) {
      await page.click('.sh-tool[data-tool="' + tool + '"]');
      await page.waitForTimeout(80);
      const ok = await page.evaluate(t => !!document.querySelector('#po-body .sh-pane[data-pane="' + t + '"]'), tool);
      check(ok, 'tool pane "' + tool + '" renders');
      if (vp.name === 'phone') await page.click('.sh-tool[data-tool="' + tool + '"]');
    }
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check(scroll, 'no sideways scroll');
    if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, 'editor-' + vp.name + '.png') }); }
    if (vp.name === 'phone') {
      const types = await page.evaluate(() => window.posterCheck.types());
      check(types.includes('xnk') && types.length === 7, 'owner on xnk.my.id: 7 types including XNK Coach (' + types.join(', ') + ')');
      check(await page.evaluate(() => window.posterCheck.brand()) === 'XNK', 'brand on xnk.my.id is XNK');
      // kisah klien: give the first client consent through the demo server, then load the story
      const sid = await page.evaluate(() => (window.members[0] || {}).id);
      await page.evaluate(async id => { window.posterCheck.setStory({ first: 'Sari', weeks: 12, sessions: 24, prs: 5, berat: { from: 72, to: 67.4, change: -4.6 }, pinggang: { from: 84, to: 78, change: -6 }, lift: { gerakan: 'Leg Press (Machine)', from: 60, to: 95 } }); }, sid);
      await page.evaluate(() => { const d = window.posterCheck.data(); d.testimonials = [{ name: 'Sari W.', stars: 5, text: 'Latihannya terarah dan coach selalu menjelaskan alasan tiap gerakan. Dalam tiga bulan berat turun dan punggung tidak pegal lagi.', date: '2026-11-20' }]; });
      for (const type of types) for (const size of ['story', 'portrait']) for (const style of ['gelap', 'terang']) {
        const r = await page.evaluate(a => window.posterCheck.draw(a[0], a[1], a[2]), [type, size, style]);
        const H = size === 'story' ? 1920 : 1350;
        const inBox = r.box.y + r.box.h <= r.foot.y && r.foot.y + r.foot.h <= H - 72 + 1 && r.H === H;
        const corner = await page.evaluate(async a => {
          const im = new Image(); im.src = a.url; await im.decode();
          const c = document.createElement('canvas'); c.width = 1080; c.height = a.H; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
          const d = g.getImageData(0, a.H - 60, 1080, 60).data, bg = g.getImageData(4, a.H - 4, 1, 1).data;
          for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) > 8 || Math.abs(d[i + 1] - bg[1]) > 8 || Math.abs(d[i + 2] - bg[2]) > 8) return false;
          return true;
        }, { url: r.url, H: H });
        check(inBox && corner, type + ' · ' + size + ' · ' + style + ': layout inside the margins, empty corner strip');
        if (OUT) fs.writeFileSync(path.join(OUT, type + '-' + size + '-' + style + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
      }
    }
    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(failures ? failures + ' check(s) failed' : 'all poster checks passed');
  process.exit(failures ? 1 : 0);
})();
