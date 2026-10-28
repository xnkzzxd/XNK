#!/usr/bin/env node
// Draws every share card (Phase T) in headless Chromium and checks size and transparency.
//   NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/share-check.js   (SHOTS_DIR=dir saves the PNGs)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let failures = 0; const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };
const SRC = path.join(__dirname, '..', 'src');
(async () => {
  const theme = fs.readFileSync(path.join(SRC, 'Theme.html'), 'utf8');
  const mask = /--logo-mask:[^\n]+/.exec(theme)[0];
  const share = fs.readFileSync(path.join(SRC, 'Bagikan.html'), 'utf8');
  const html = `<!doctype html><html><head><style>:root{${mask}}</style></head><body><h2 id="share-title"></h2><div id="share-body"></div><div id="share-foot"></div>${share}
  <script>window.openSheet=function(){};window.showToast=function(m){console.log('toast',m)};</script></body></html>`;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
   p.on('pageerror', e => console.log('ERR', e.message));
  await p.setContent(html); await p.waitForTimeout(300);
  const src = {
    today: '2026-10-28', date: '2026-10-28', first: 'Jenny',
    share: { coach: 'Erlan', month: { label: '2026-10', sessions: 5, target: 8, workoutDays: 6, volume: 41200, prs: 4, foodDays: 12 }, body: { weight: { change: -3.2, since: '2026-08-01' }, waist: { change: -4, since: '2026-08-01' } } },
    workout: { days: [{ tanggal: '2026-10-28', items: [
      { key: 'a', gerakan: 'Barbell Squat', bodyPart: 'upper legs', sets: [{ berat: 100, rep: 5 }, { berat: 100, rep: 5 }] },
      { key: 'b', gerakan: 'Bench Press', bodyPart: 'chest', sets: [{ berat: 60, rep: 8 }] },
      { key: 'c', gerakan: 'Lat Pulldown', bodyPart: 'back', sets: [{ berat: 50, rep: 10 }] },
      { key: 'd', gerakan: 'Plank', bodyPart: 'waist', sets: [{ durasi: 60 }] }] }],
      stats: { sessions: [{ tanggal: '2026-10-28', hari: 'Push Day', durasi: 2580, volume: 2950, sets: 9, prs: 2, parts: { legs: 1000, chest: 480, back: 500, core: 0 } }],
        weeks: [1,2,3,4,5,6,7,8].map(i => ({ volume: i * 900 % 7000 + 1500 })),
        exercises: [{ key: 'a', gerakan: 'Barbell Squat', points: [{ tanggal: '2026-10-01', e1rm: 100 }, { tanggal: '2026-10-14', e1rm: 108 }, { tanggal: '2026-10-28', e1rm: 116.7 }], pr: { e1rm: 116.7, tanggal: '2026-10-28', berat: 100, rep: 5 } }] } },
    progress: { streak: 6, bestStreak: 8, completed: 42, badges: Array.from({ length: 11 }, (_, i) => ({ earned: i < 7 })), entries: [{ berat: 80 }, { berat: 79 }, { berat: 77.5 }, { berat: 76.8 }] },
    nutrition: { target: { ok: true, kal: 2200, protein: 150, karbo: 250, lemak: 70 }, log: { totals: { kal: 1850, p: 120, k: 200, l: 55 } } },
    badge: { id: 'sesi-25', label: '25 sesi' }
  };
  const OUT = process.env.SHOTS_DIR || '';
  const ph = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d'); const g = x.createLinearGradient(0,0,600,400); g.addColorStop(0,'#c0e0ff'); g.addColorStop(1,'#406080'); x.fillStyle = g; x.fillRect(0,0,600,400); const i = new Image(); i.src = c.toDataURL(); window.__ph = i; return new Promise(r => i.onload = () => r(1)); });
  const cases = [];
  for (const kind of ['latihan', 'exercises', 'record', 'progres', 'gizi', 'rekap', 'badge'])
    for (const [style, size] of [['teks', 'story'], ['grafik', 'story'], ['grafik', 'kotak'], ['gelap', 'kotak'], ['foto', 'story']]) cases.push([kind, style, size]);
  for (const [kind, style, size] of cases) {
    const data = await p.evaluate(async ([kind, style, size, src]) => {
      window.shareOpen(kind, Object.assign({}, src, kind === 'progres' ? {} : {}), {});
      if (style !== 'foto') window.shareSet('style', style); window.shareSet('size', size);
      if (kind === 'progres') window.shareSet('body', true);
      if (style === 'foto') {
        window.shareSet('style', 'foto');
        const c = document.createElement('canvas'); c.width = 600; c.height = 900; const x = c.getContext('2d'); const g = x.createLinearGradient(0,0,600,900); g.addColorStop(0,'#e8d8c0'); g.addColorStop(1,'#50607a'); x.fillStyle = g; x.fillRect(0,0,600,900);
        const bl = await new Promise(r => c.toBlob(r)); const dt = new DataTransfer(); dt.items.add(new File([bl], 'p.png', { type: 'image/png' }));
        const inp = document.getElementById('share-file'); inp.files = dt.files; window.shareFile(inp);
      }
      await new Promise(r => setTimeout(r, 400));
      const img = document.getElementById('share-img'); if (!img) return null;
      const bl = await fetch(img.src).then(r => r.blob());
      const buf = new Uint8Array(await bl.arrayBuffer()); let s = ''; buf.forEach(b => s += String.fromCharCode(b));
      const im = await createImageBitmap(bl); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      return { b64: btoa(s), w: im.width, h: im.height, a0: x.getImageData(2, 2, 1, 1).data[3], a1: x.getImageData(im.width / 2, im.height / 2, 1, 1).data[3] };
    }, [kind, style, size, src]);
    if (!data) { console.log('NO IMG', kind, style, size); continue; }
    if (OUT) fs.writeFileSync(path.join(OUT, `${kind}-${style}-${size}.png`), Buffer.from(data.b64, 'base64'));
    const H = style === 'gelap' || size === 'kotak' ? 1080 : 1920, transparent = style === 'teks' || style === 'grafik';
    check(data.w === 1080 && data.h === H, `${kind} ${style} ${size}: ${data.w}x${data.h}`);
    check(transparent ? data.a0 === 0 : style === 'gelap' ? data.a0 === 0 && data.a1 === 255 : data.a0 === 255, `${kind} ${style} ${size}: ${transparent ? 'transparent background' : style === 'gelap' ? 'rounded black card' : 'photo fills the frame'}`);
  }
  await b.close(); console.log(failures ? failures + ' failed' : 'all share cards OK'); process.exit(failures ? 1 : 0);
})();
