#!/usr/bin/env node
// Draws every share card (Phase T + T2) in headless Chromium and checks size, transparency, layout bounds,
// the QR code, HQ export and the 6-second video.
//   NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/share-check.js   (SHOTS_DIR=dir saves the PNGs)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let failures = 0; const check = (ok, msg) => { if (!ok || process.env.VERBOSE) console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };
const SRC = path.join(__dirname, '..', 'src');
const OUT = process.env.SHOTS_DIR || '';
(async () => {
  const theme = fs.readFileSync(path.join(SRC, 'Theme.html'), 'utf8');
  const app = fs.readFileSync(path.join(SRC, 'App.html'), 'utf8');
  const mask = /--logo-mask:[^\n]+/.exec(theme)[0];
  const mm = app.slice(app.indexOf('const WL_MM_FRONT = ['), app.indexOf('window.WL_MM = '));
  const share = fs.readFileSync(path.join(SRC, 'Bagikan.html'), 'utf8');
  const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>:root{${mask}}</style></head><body><div class="sheet hide" id="sheet-share"></div><div id="share-nudge" class="hide"><p id="share-nudge-msg"></p></div>
  <script>${mm} window.WL_MM = { front: WL_MM_FRONT, back: WL_MM_BACK };</script>${share}
  <script>window.openSheet=function(id){document.getElementById(id).classList.remove('hide')};window.showToast=function(m){console.log('toast',m)};window.icon=function(){return ''};</script></body></html>`;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => { console.log('ERR', e.message); failures++; });
  await p.setContent(html); await p.waitForTimeout(300);
  const badges = [['sesi', 10], ['sesi', 25], ['sesi', 50], ['sesi', 100], ['streak', 4], ['streak', 8], ['streak', 12], ['catat', 5], ['catat', 20], ['pr', 1], ['pr', 10]]
    .map(([kind, need], i) => ({ id: kind + '-' + need, kind, need, label: kind + ' ' + need, earned: i < 7 || i === 9 }));
  const entries = ['2026-08-01', '2026-08-29', '2026-09-26', '2026-10-24'].map((t, i) => ({ tanggal: t, berat: 80 - i * 1.1, pinggang: 92 - i * 1.5, perut: 95 - i, dada: 100 - i * .5, lenganKanan: 33 + i * .3, lenganKiri: 33 + i * .2, pahaKanan: 58 - i * .4, pahaKiri: 58 - i * .4 }));
  const sum = {}; Object.keys(entries[0]).filter(k => k !== 'tanggal').forEach(k => { const f = entries[0], l = entries[3]; sum[k] = { count: 4, change: Math.round((l[k] - f[k]) * 10) / 10, first: { tanggal: f.tanggal, nilai: f[k] }, last: { tanggal: l.tanggal, nilai: l[k] } }; });
  const actDays = []; for (let i = 0; i < 60; i += 2) { const d = new Date(Date.UTC(2026, 9, 28) - i * 86400000).toISOString().slice(0, 10); actDays.unshift({ d, s: i % 4 === 0 ? 1 : 0, w: 1 }); }
  const src = {
    today: '2026-10-28', date: '2026-10-28', first: 'Jenny',
    share: { coach: 'Erlan', qrUrl: 'https://xnkbooking.my.id', month: { label: '2026-10', sessions: 5, target: 8, workoutDays: 6, volume: 41200, prs: 4, foodDays: 12 }, prevMonth: { label: '2026-09', sessions: 4, workoutDays: 5, volume: 36000, prs: 2 },
      body: { weight: { change: -3.2, since: '2026-08-01' }, waist: { change: -4, since: '2026-08-01' } },
      activity: { weeks: Array.from({ length: 12 }, (_, i) => ({ start: '', n: (i * 7) % 4, logged: i % 3 })), days: actDays } },
    workout: { days: [{ tanggal: '2026-10-28', items: [
      { key: 'a', gerakan: 'Barbell Squat', bodyPart: 'upper legs', sets: [{ berat: 100, rep: 5 }, { berat: 100, rep: 5 }, { berat: 40, rep: 10, jenis: 'w' }] },
      { key: 'b', gerakan: 'Bench Press', bodyPart: 'chest', sets: [{ berat: 60, rep: 8 }] },
      { key: 'c', gerakan: 'Lat Pulldown', bodyPart: 'back', sets: [{ berat: 50, rep: 10 }] },
      { key: 'd', gerakan: 'Plank', bodyPart: 'waist', sets: [{ durasi: 60 }] }] }],
      stats: { sessions: [{ tanggal: '2026-10-28', hari: 'Push Day', durasi: 2580, volume: 2950, sets: 9, prs: 2, exercises: 4, parts: { legs: 1000, chest: 480, back: 500, core: 0 } }, { tanggal: '2026-10-21', hari: 'Push Day', durasi: 2400, volume: 2600, sets: 8, exercises: 4 }],
        weeks: [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ volume: i * 900 % 7000 + 1500 })),
        exercises: [{ key: 'a', gerakan: 'Barbell Squat', points: [{ tanggal: '2026-10-01', e1rm: 100 }, { tanggal: '2026-10-14', e1rm: 108 }, { tanggal: '2026-10-28', e1rm: 116.7 }], pr: { e1rm: 116.7, tanggal: '2026-10-28', berat: 100, rep: 5 } },
          { key: 'b', gerakan: 'Bench Press', points: [{ tanggal: '2026-10-07', e1rm: 70 }, { tanggal: '2026-10-28', e1rm: 76 }], pr: { e1rm: 76, tanggal: '2026-10-28', berat: 60, rep: 8 } }] } },
    progress: { streak: 6, bestStreak: 8, completed: 42, badges, entries, summary: sum, photos: [] },
    nutrition: { target: { ok: true, kal: 2200, protein: 150, karbo: 250, lemak: 70 }, log: { totals: { kal: 1850, p: 120, k: 200, l: 55 } } },
    badge: { id: 'sesi-25', kind: 'sesi', need: 25, label: '25 sesi' }
  };
  // Period data shape from getMyShareData (used for latihan/gizi/ukuran when a period is chosen).
  const per = { period: { key: 'bulan', from: '2026-10-01', to: '2026-10-28', days: 28 },
    workout: { workoutDays: 9, volume: 24000, sets: 80, reps: 640, durasi: 25000, prs: 3, parts: { legs: 9000, chest: 6000, back: 5000, arms: 2000, shoulders: 1500, core: 500 }, exercises: [{ gerakan: 'Squat', sets: 12, best: { berat: 100, rep: 5 }, pr: true }, { gerakan: 'Bench', sets: 10, best: { berat: 60, rep: 8 } }] },
    lifts: [], nutrition: { days: 20, avgKal: 2100, avgP: 140, avgK: 230, avgL: 66, onTarget: 12, target: 2200, daily: Array.from({ length: 20 }, (_, i) => ({ tanggal: '2026-10-' + String(i + 1).padStart(2, '0'), kal: 1800 + (i * 97) % 600 })) },
    body: { berat: { unit: 'kg', first: 78.9, last: 76.7, change: -2.2, pts: [{ v: 78.9 }, { v: 77.8 }, { v: 76.7 }], start: { v: 80, change: -3.3 } } }, sessionsDone: 6,
    compare: { prev: { sessionsDone: 4, workout: { workoutDays: 7, volume: 20000, sets: 70, reps: 560, durasi: 21000, prs: 1 }, nutrition: { days: 15, avgKal: 2300, avgP: 120, onTarget: 6 } }, start: { sessionsDone: 42 }, target: { sessions: 8, kal: 2200, protein: 150 } } };
  await p.evaluate(per => { window.__per = per; }, per);
  const kinds = await p.evaluate(src => { const s = Object.assign({}, src, { loadPeriod: () => Promise.resolve(window.__per) }); window.__src = s; window.shareOpen('latihan', s, {}); return window.shareCheck.kinds(); }, src);
  const want = ['latihan', 'exercises', 'record', 'progres', 'ukuran', 'konsistensi', 'badges', 'gizi', 'rekap', 'foto', 'badge'];
  check(want.every(k => kinds.includes(k)), 'all 11 cards are offered: ' + kinds.join(', '));

  // Photos for the photo card and photo style.
  await p.evaluate(async () => {
    const mk = (w, h, a, b) => new Promise(r => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, w, h); const i = new Image(); i.onload = () => r(i); i.src = c.toDataURL(); });
    window.__photo = await mk(600, 900, '#e8d8c0', '#50607a'); window.__a = await mk(600, 900, '#d0b090', '#806040'); window.__b = await mk(600, 900, '#c0d0e0', '#304060');
  });

  const run = (args) => p.evaluate(async ([kind, style, size, align, lang, extra]) => {
    document.getElementById('share-img').removeAttribute('src');
    window.shareSet('kind', kind);
    window.shareSet('lang', lang); window.shareSet('size', size); window.shareSet('align', align);
    if (style === 'foto') { window.shareSet('style', 'grafik'); } else window.shareSet('style', style);
    if (extra.body) window.shareSet('body', true);
    if (extra.hideKg) window.shareSet('hideKg', true);
    if (extra.qr) window.shareSet('f:qr', true);
    if (extra.period) window.shareSet('period', extra.period);
    if (kind === 'foto') window.shareCheck.setPhotos(window.__a, window.__b);
    await new Promise(r => setTimeout(r, extra.period ? 250 : 120));
    if (style === 'foto') {
      const c = document.createElement('canvas'); c.width = 600; c.height = 900; c.getContext('2d').drawImage(window.__photo, 0, 0);
      const bl = await new Promise(r => c.toBlob(r)); const dt = new DataTransfer(); dt.items.add(new File([bl], 'p.png', { type: 'image/png' }));
      window.sharePick = function () {}; window.shareSet('style', 'foto');
      const inp = document.getElementById('share-file'); inp.files = dt.files; window.shareFile(inp);
      await new Promise(r => setTimeout(r, 250));
    }
    await new Promise(r => setTimeout(r, 200));
    const img = document.getElementById('share-img');
    for (let i = 0; i < 100 && !img.getAttribute('src'); i++) await new Promise(r => setTimeout(r, 50));
    const bl = await fetch(img.src).then(r => r.blob());
    const im = await createImageBitmap(bl); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const card = window.shareCheck.card(), L = window.shareCheck.layout();
    const blocks = ['head', 'stats', 'graph', 'foot'].filter(k => L[k]).map(k => Object.assign({ k }, L[k]));
    // count non-transparent pixels in the graph area (graph actually drawn)
    let ink = 0;
    if (L.graph && L.graph.h > 10) { const d = x.getImageData(L.graph.x, L.graph.y, L.graph.w, Math.min(L.graph.h, c.height - L.graph.y)).data; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 0) ink++; }
    // horizontal centre of the drawn head + stats (for centred cards)
    let mid = null;
    if (L.head && L.stats) { const y0 = Math.round(L.head.y), hh = Math.round(L.stats.y + L.stats.h - L.head.y); const d = x.getImageData(0, y0, c.width, hh).data; let mn = c.width, mx = 0; for (let yy = 0; yy < hh; yy += 3) for (let xx = 0; xx < c.width; xx += 2) if (d[(yy * c.width + xx) * 4 + 3] > 200) { if (xx < mn) mn = xx; if (xx > mx) mx = xx; } if (mx > mn) mid = (mn + mx) / 2; }
    let b64 = ''; if (window.__save) { const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; u.forEach(v => s += String.fromCharCode(v)); b64 = btoa(s); }
    // reset per-card options so the next case starts clean
    if (extra.body) window.shareSet('body', false); if (extra.hideKg) window.shareSet('hideKg', false); if (extra.qr) window.shareSet('f:qr', false); if (extra.period) window.shareSet('period', 'hari');
    return { w: im.width, h: im.height, a0: x.getImageData(2, 2, 1, 1).data[3], a1: x.getImageData(im.width / 2, im.height / 2, 1, 1).data[3],
      blocks, H: L.H, gtype: card.g && card.g.type, ink, stats: card.stats.map(s => s.v), b64, mid };
  }, args);
  await p.evaluate(save => { window.__save = save; }, !!OUT);

  const SIZES = { story: 1920, portrait: 1350, kotak: 1080 };
  const cases = [];
  for (const kind of want) {
    for (const [style, size] of [['teks', 'story'], ['grafik', 'story'], ['grafik', 'kotak'], ['grafik', 'portrait'], ['gelap', 'kotak'], ['gelap', 'story'], ['terang', 'portrait'], ['foto', 'story']]) cases.push([kind, style, size, 'kiri', 'en', {}]);
    cases.push([kind, 'grafik', 'story', 'tengah', 'id', {}]);
    cases.push([kind, 'teks', 'kotak', 'tengah', 'en', {}]);
  }
  cases.push(['progres', 'grafik', 'story', 'kiri', 'en', { body: true }]);
  cases.push(['latihan', 'grafik', 'story', 'kiri', 'en', { period: 'bulan' }]);
  cases.push(['gizi', 'grafik', 'story', 'kiri', 'id', { period: 'bulan' }]);
  cases.push(['exercises', 'gelap', 'kotak', 'kiri', 'en', { hideKg: true }]);
  cases.push(['latihan', 'grafik', 'story', 'kiri', 'en', { qr: true }]);
  for (const c of cases) {
    const [kind, style, size, align, lang, extra] = c;
    const tag = `${kind} ${style} ${size} ${align} ${lang}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`;
    const d = await run(c);
    if (OUT) fs.writeFileSync(path.join(OUT, `${kind}-${style}-${size}-${align}-${lang}${extra.body ? '-body' : ''}${extra.period ? '-' + extra.period : ''}${extra.hideKg ? '-nokg' : ''}${extra.qr ? '-qr' : ''}.png`), Buffer.from(d.b64, 'base64'));
    const H = SIZES[size];
    check(d.w === 1080 && d.h === H, `${tag}: ${d.w}x${d.h}`);
    const boxed = style === 'gelap' || style === 'terang', transparent = style === 'teks' || style === 'grafik';
    check(transparent ? d.a0 === 0 : d.a1 === 255, `${tag}: background`);
    const inside = d.blocks.every(bk => bk.y >= 0 && bk.y + bk.h <= H + 1 && bk.x >= 0 && bk.x + bk.w <= 1080);
    check(inside, `${tag}: every block inside the canvas ${JSON.stringify(d.blocks.map(x => [x.k, Math.round(x.y), Math.round(x.h)]))}`);
    const sorted = d.blocks.slice().sort((a, b2) => a.y - b2.y);
    check(sorted.every((bk, i) => !i || sorted[i - 1].y + sorted[i - 1].h <= bk.y + 1), `${tag}: blocks do not overlap`);
    if (align === 'tengah' && style === 'teks' && d.mid != null) check(Math.abs(d.mid - 540) < 40, `${tag}: centred text is centred (middle at ${Math.round(d.mid)})`);
    if (d.gtype && d.gtype !== 'photos') check(d.ink > 20, `${tag}: graph ${d.gtype} drawn (${d.ink})`);
    if ((kind === 'badges' || (kind === 'progres' && !extra.body)) && style !== 'teks') check(d.gtype === 'badges', `${tag}: badge grid shown`);
    if (kind === 'progres' && !extra.body) check(!d.stats.some(v => / kg$| cm$/.test(v)), `${tag}: body numbers stay off by default`);
    if (extra.body) check(d.stats.some(v => /kg$/.test(v)), `${tag}: body change shown when turned on`);
    if (extra.hideKg) check(!d.stats.some(v => /kg/.test(v)), `${tag}: no kg with "Sembunyikan beban"`);
    if (extra.period) check(d.stats.length > 0, `${tag}: period data used`);
  }

  // Motion graphics (T3): both styles × 6/10/15 s on every card; the last frame is the still card.
  for (const kind of want) {
    for (const anim of ['minimal', 'kinetic']) for (const dur of [6, 10, 15]) {
      const keep = !!OUT && dur === 10 && ['latihan', 'progres', 'record', 'gizi'].includes(kind);
      const r = await p.evaluate(async ([kind, anim, dur, keep]) => {
        window.shareSet('kind', kind); window.shareSet('style', 'gelap'); window.shareSet('size', 'story');
        await new Promise(res => setTimeout(res, 60));
        const ts = keep ? Array.from({ length: 12 }, (_, i) => i * dur / 11) : [0, dur * .25, dur * .5, dur * .75, dur];
        return await window.shareCheck.anim(anim, dur, ts, keep);
      }, [kind, anim, dur, keep]);
      check(r.endIsStill, `${kind} ${anim} ${dur}s: frames render and the last frame equals the still card`);
      if (keep) r.frames.forEach((u, i) => fs.writeFileSync(path.join(OUT, `anim-${kind}-${anim}-${String(i).padStart(2, '0')}.png`), Buffer.from(u.split(',')[1], 'base64')));
    }
  }
  const anton = await p.evaluate(() => document.fonts.check('400 60px Anton'));
  console.log('  · Anton loaded in the check page: ' + anton + ' (falls back to Impact/sans-serif offline)');

  // QR: finder patterns in the three corners, version fits the URL.
  const qr = await p.evaluate(() => { const q = window.shareCheck.qr('https://xnkbooking.my.id'); const f = (x, y) => [0, 1, 2, 3, 4, 5, 6].every(i => q.mods[y][x + i] && q.mods[y + 6][x + i] && q.mods[y + i][x] && q.mods[y + i][x + 6]); return { size: q.size, ok: f(0, 0) && f(q.size - 7, 0) && f(0, q.size - 7) }; });
  check(qr.ok && qr.size >= 21, `QR has finder patterns (${qr.size}×${qr.size})`);

  // HQ export and video.
  const hq = await p.evaluate(async () => { window.shareSet('kind', 'latihan'); window.shareSet('style', 'gelap'); window.shareSet('size', 'story'); const o = await window.shareCheck.render('hq'); const im = await createImageBitmap(o.blob); return [im.width, im.height]; });
  check(hq[0] === 2160 && hq[1] === 3840, `HQ export is 2160×3840 (${hq})`);
  const vid = await p.evaluate(async () => { const o = await window.shareCheck.video(1500); return o ? { type: o.blob.type, size: o.blob.size, name: o.name } : null; });
  check(vid && /^video\//.test(vid.type) && vid.size > 10000, `video export works ${JSON.stringify(vid)}`);

  await b.close(); console.log(failures ? failures + ' failed' : 'all share cards OK (' + cases.length + ' cases)'); process.exit(failures ? 1 : 0);
})();
