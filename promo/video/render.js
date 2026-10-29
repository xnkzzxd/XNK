#!/usr/bin/env node
// Render ad.html to an MP4 frame by frame (Playwright + ffmpeg).
//
//   node promo/video/render.js --out xnk-iklan-30s.mp4 --work /tmp/xnk-frames
//   node promo/video/render.js --preview --work /tmp/xnk-frames           (key stills with safe-area guides)
//   node promo/video/render.js --preview 3.5,11 --work /tmp/xnk-frames    (chosen stills)
//
// Music: python3 promo/video/music.py <work>/music.wav runs first unless --music is given.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const FPS = 30, DUR = 30, FRAMES = FPS * DUR;
const work = path.resolve(opt('--work', 'frames'));
const preview = opt('--preview', false);
const workers = +opt('--workers', 4);
const out = path.resolve(opt('--out', path.join(work, 'xnk-iklan-30s.mp4')));
const page = 'file://' + path.join(__dirname, 'ad.html') + (preview ? '?safe=1' : '');
fs.mkdirSync(work, { recursive: true });

async function shoot(browser, frames, file) {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await p.goto(page);
  await p.evaluate(() => window.ready);
  for (const f of frames) {
    await p.evaluate(async t => {
      window.seek(t);
      await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
    }, f.t);
    await p.screenshot({ path: file(f), type: 'png' });
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  if (preview) {
    const times = (preview === true ? '1,3.5,4.9,5.7,6.2,6.6,7.5,8.3,8.6,10.4,11.0,12.6,14.7,15.2,16.5,17.2,18.9,20.6,21.2,22.1,23.3,24.6,25.4,25.9,28' : preview)
      .split(',').map(Number);
    await shoot(browser, times.map(t => ({ t })), f => path.join(work, `still-${f.t.toFixed(2)}.png`));
    await browser.close();
    console.log('stills in', work);
    return;
  }
  const dir = path.join(work, 'png');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  const all = [...Array(FRAMES).keys()].map(i => ({ i, t: i / FPS }));
  const t0 = Date.now();
  await Promise.all([...Array(workers).keys()].map(w =>
    shoot(browser, all.filter(f => f.i % workers === w), f => path.join(dir, `f${String(f.i).padStart(4, '0')}.png`))));
  await browser.close();
  console.log(`${FRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  let music = opt('--music', null);
  if (!music) {
    music = path.join(work, 'music.wav');
    execFileSync('python3', ['-I', path.join(__dirname, 'music.py'), music], { stdio: 'inherit' });
  }
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-i', music,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log('wrote', out);
})();
