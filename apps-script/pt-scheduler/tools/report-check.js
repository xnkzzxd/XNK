'use strict';
// Fase AC4 (T-2344): builds the PDF report in a real browser (the demo build, portal and panel) and checks it:
//   - the file is a PDF 1.4 with one JPEG image per A4 page and a valid cross-reference table,
//   - every page image is a JPEG (FFD8) of 1240 × 1754 at most ~400 KB, and the outer page margin stays white,
//   - the coach's message is drawn on page 1 only in coach reports.
// Rebuild the demo first (node apps-script/pt-scheduler/tools/build-demo.js).
// Run: NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/report-check.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', '..');
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };

function pdfInfo(buf) {
  const s = buf.toString('latin1');
  const out = { header: s.slice(0, 8), pages: (s.match(/\/Type \/Page /g) || []).length, images: [], xrefOk: true, eof: /%%EOF\s*$/.test(s) };
  const sx = s.lastIndexOf('startxref'), xref = Number(s.slice(sx + 9).trim().split(/\s+/)[0]);
  const xt = s.slice(xref).split('\n');
  out.xrefOk = xt[0] === 'xref';
  const total = Number(xt[1].split(' ')[1]);
  for (let k = 1; k < total; k++) {
    const off = Number(xt[2 + k].slice(0, 10));
    if (!s.startsWith(k + ' 0 obj', off)) out.xrefOk = false;
  }
  const re = /\/Width (\d+) \/Height (\d+)[^>]*\/Length (\d+) >>\nstream\n/g;
  let m;
  while ((m = re.exec(s))) out.images.push({ w: +m[1], h: +m[2], len: +m[3], jpeg: buf[m.index + m[0].length] === 0xff && buf[m.index + m[0].length + 1] === 0xd8 });
  return out;
}

(async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/demo/') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(path.join(ROOT, 'demo', 'index.html')));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  for (const [mode, url] of [['client', '/demo/?klien'], ['admin', '/demo/']]) {
    console.log('Laporan PDF · ' + mode);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u.startsWith(base)) return r.continue();
      if (u.includes('lucide')) return r.fulfill({ contentType: 'application/javascript', body: 'window.lucide={createIcons(){}};' });
      if (u.includes('fullcalendar')) return r.fulfill({ contentType: 'application/javascript', body: 'window.FullCalendar={Calendar:function(){this.render=function(){};this.destroy=function(){};this.getEvents=function(){return []};this.removeAllEvents=function(){};this.addEventSource=function(){};this.changeView=function(){};this.gotoDate=function(){};this.updateSize=function(){};}};' });
      if (u.includes('cropper.min.js')) return r.fulfill({ contentType: 'application/javascript', body: 'window.Cropper=function(){};' });
      return r.fulfill({ status: 204, body: '' });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base + url);
    await page.waitForTimeout(4000);
    if (mode === 'admin') {
      const id = await page.evaluate(() => (window.members.find(m => /Sari/.test(m.name)) || window.members[0]).id);
      await page.evaluate(id => window.reportOpen('admin', id), id);
      await page.waitForTimeout(300);
      await page.fill('#rp-msg', 'Pesan coach untuk tes laporan.');
    } else {
      await page.evaluate(() => window.reportOpen('client'));
      await page.waitForTimeout(300);
    }
    check(await page.locator('#sheet-report:not(.hide)').count() === 1, 'the report sheet opens');
    check(await page.locator('#rp-msg-wrap.hide').count() === (mode === 'admin' ? 0 : 1), mode === 'admin' ? 'coach sees the message box' : 'clients have no message box');
    await page.evaluate(() => window.rpBuild());
    await page.waitForFunction(() => !!(window.rpBlob && window.rpBlob()), null, { timeout: 30000 }).catch(() => {});
    const bytes = await page.evaluate(async () => { const b = window.rpBlob && window.rpBlob(); return b ? Array.from(new Uint8Array(await b.arrayBuffer())) : null; });
    check(!!bytes, 'a PDF is built on the device');
    if (bytes) {
      const buf = Buffer.from(bytes), info = pdfInfo(buf);
      check(info.header === '%PDF-1.4', 'header %PDF-1.4');
      check(info.eof && info.xrefOk, 'cross-reference table points at every object');
      check(info.pages >= 2 && info.pages <= 8 && info.images.length === info.pages, info.pages + ' A4 pages, one image each');
      check(info.images.every(i => i.jpeg && i.w === 1240 && i.h === 1754), 'every page is a 1240 × 1754 JPEG');
      check(info.images.every(i => i.len < 420 * 1024), 'every page stays under ~400 KB (' + info.images.map(i => Math.round(i.len / 1024)).join(', ') + ' KB)');
      // Margins: the outer 48 px band of each page is white (nothing is drawn outside the page frame).
      const white = await page.evaluate(async () => {
        const imgs = [...document.querySelectorAll('#rp-preview img')];
        const out = [];
        for (const im of imgs) {
          await (im.decode ? im.decode().catch(() => {}) : Promise.resolve());
          const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
          const edge = (x, y, w, h) => { const d = g.getImageData(x, y, w, h).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) return false; return true; };
          out.push(edge(0, 0, cv.width, 48) && edge(0, cv.height - 48, cv.width, 48) && edge(0, 0, 48, cv.height) && edge(cv.width - 48, 0, 48, cv.height));
        }
        return out;
      });
      check(white.length && white.every(Boolean), 'nothing is drawn in the outer page margin');
    }
    check(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(failures ? '\n' + failures + ' check(s) FAILED' : '\nAll report checks passed');
  process.exit(failures ? 1 : 0);
})();
