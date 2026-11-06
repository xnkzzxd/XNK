'use strict';
// The assembled GitHub Pages site (tools/build-site.js). It replaces the branch deploy, so it must
// publish exactly what the live site serves today, plus /next/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSite, PUBLISHED, NOT_PUBLISHED, ROOT } = require('../tools/build-site');

test('every root file or folder of the repo is either published or deliberately not', () => {
  const known = new Set([...PUBLISHED, ...NOT_PUBLISHED]);
  const unknown = fs.readdirSync(ROOT).filter(n => !known.has(n));
  assert.deepEqual(unknown, [], 'new root entries must be added to PUBLISHED or NOT_PUBLISHED in tools/build-site.js: ' + unknown.join(', '));
});

test('the site holds the published files and the two static builds, and nothing private', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-'));
  try {
    buildSite({ outDir: dir, exec: 'https://script.test/exec' });
    const has = p => fs.existsSync(path.join(dir, p));
    for (const p of PUBLISHED) assert.ok(has(p), p + ' missing');
    assert.equal(fs.readFileSync(path.join(dir, 'CNAME'), 'utf8').trim(), 'xnk.my.id');
    assert.ok(has('.nojekyll'));
    for (const p of ['next/index.html', 'next/config.js', 'next/landing/index.html', 'next/landing/config.js']) assert.ok(has(p), p);
    assert.match(fs.readFileSync(path.join(dir, 'next', 'config.js'), 'utf8'), /"site":"app"/);
    assert.match(fs.readFileSync(path.join(dir, 'next', 'landing', 'config.js'), 'utf8'), /"site":"landing"/);
    for (const p of ['docs', 'apps-script', 'android', 'ios', 'capacitor', '.github', 'CLAUDE.md', 'README.md', '_config.yml', '.git']) assert.ok(!has(p), p + ' must not be published');
    // the wrapper page at the root is untouched
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the site build is repeatable', () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-a-')), b = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-b-'));
  try {
    buildSite({ outDir: a, exec: 'https://script.test/exec' }); buildSite({ outDir: b, exec: 'https://script.test/exec' });
    const list = d => fs.readdirSync(d, { recursive: true }).sort();
    assert.deepEqual(list(a), list(b));
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});
