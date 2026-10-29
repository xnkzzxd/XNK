#!/usr/bin/env node
// Cut carousel.html (one 8640×1350 panorama) into eight 1080×1350 Instagram slides.
//
//   NODE_PATH=$(npm root -g) node promo/carousel/render.js [--out dir]
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const i = process.argv.indexOf('--out');
const out = path.resolve(i < 0 ? path.join(__dirname, 'out') : process.argv[i + 1]);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 8640, height: 1350 } });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'carousel.html'));
  await page.evaluate(() => window.ready);
  await page.screenshot({ path: path.join(out, 'panorama.png') });
  for (let k = 0; k < 8; k++) {
    await page.screenshot({ path: path.join(out, `slide-${k + 1}.png`), clip: { x: k * 1080, y: 0, width: 1080, height: 1350 } });
  }
  await browser.close();
  console.log('slides in', out);
})();
