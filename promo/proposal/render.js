#!/usr/bin/env node
// Print proposal.html to an A4 PDF, plus one PNG per page for checking.
//
//   NODE_PATH=$(npm root -g) node promo/proposal/render.js [--out dir]
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const i = process.argv.indexOf('--out');
const out = path.resolve(i < 0 ? path.join(__dirname, 'out') : process.argv[i + 1]);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'proposal.html'));
  await page.evaluate(() => window.ready);
  // overflow check: flowing content that runs into a page's bottom margin (placed elements are skipped)
  const over = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, k) => {
    const r = p.getBoundingClientRect();
    const placed = e => { for (let n = e; n && n !== p; n = n.parentElement) if (getComputedStyle(n).position === 'absolute') return true; return false; };
    const bad = [...p.querySelectorAll('*')].filter(e => !placed(e) && e.getBoundingClientRect().bottom > r.bottom - 66);
    return bad.length ? k + 1 : 0;
  }).filter(Boolean));
  if (over.length) console.warn('content too long on page', over.join(', '));
  const pages = await page.$$('.page');
  for (let k = 0; k < pages.length; k++) await pages[k].screenshot({ path: path.join(out, `page-${String(k + 1).padStart(2, '0')}.png`) });
  await page.pdf({ path: path.join(out, 'XNK-Proposal-Coach.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(pages.length, 'pages →', path.join(out, 'XNK-Proposal-Coach.pdf'));
})();
