// Renders reel.html to MP4. Serve the repo root first (python3 -m http.server 8765), then:
//   node video/render.js <ref-audio.wav> <out dir> [fps]
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const [audio, outDir, fpsArg, only] = process.argv.slice(2);
const FPS = Number(fpsArg || 30);
const URL = process.env.REEL_URL || 'http://localhost:8765/video/reel.html';
const SIZES = [['9x16', 1080, 1920], ['1x1', 1080, 1080]].filter(s => !only || s[0] === only);
const BEATS = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'beats.json'), 'utf8'));
const DUR = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio]).toString());
const N = Math.floor(DUR * FPS), LEN = N / FPS;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const [name, w, h] of SIZES) {
    const tmp = fs.mkdtempSync(path.join(outDir, 'frames-' + name + '-'));
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    p.on('pageerror', e => console.log('pageerror', e.message));
    await p.addInitScript(([b, d]) => { window.BEATS = b; window.DUR = d; }, [BEATS.beats, LEN]);
    await p.goto(URL); await p.evaluate(() => window.ready);
    for (let i = 0; i < N; i++) {
      await p.evaluate(t => window.seek(t), i / FPS);
      await p.screenshot({ path: path.join(tmp, String(i).padStart(5, '0') + '.png') });
      if (i % 100 === 0) console.log(name, i, '/', N);
    }
    await p.close();
    const base = path.join(outDir, 'xnk-reel-' + name);
    const v = ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(tmp, '%05d.png')];
    const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart'];
    execFileSync('ffmpeg', [...v, '-i', audio, '-map', '0:v', '-map', '1:a', ...enc, '-c:a', 'aac', '-b:a', '192k',
      '-af', 'afade=t=in:d=0.005,afade=t=out:st=' + (LEN - 0.02).toFixed(3) + ':d=0.02', '-t', LEN.toFixed(3), base + '.mp4']);
    execFileSync('ffmpeg', [...v, ...enc, '-an', base + '-silent.mp4']);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('wrote', base + '.mp4', base + '-silent.mp4');
  }
  await browser.close();
})();
