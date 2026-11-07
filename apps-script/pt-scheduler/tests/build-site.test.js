'use strict';
// The assembled GitHub Pages site (tools/build-site.js). It replaces the branch deploy, so it must
// publish exactly what the live site serves today, plus /next/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSite, legacyWrapper, PUBLISHED, NOT_PUBLISHED, ROOT } = require('../tools/build-site');

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
    // the root page is the static panel; the old wrapper is kept at /legacy/ (source: index.html at the repo root)
    const rootHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    assert.match(rootHtml, /<script src="config\.js"><\/script>/);
    assert.match(rootHtml, /<script src="host-local\.[0-9a-f]{10}\.js"><\/script>/);
    assert.ok(rootHtml.includes('<link rel="manifest" href="/manifest.webmanifest">'), 'the root page carries the Home Screen manifest');
    assert.ok(!fs.readFileSync(path.join(dir, 'next', 'index.html'), 'utf8').includes('manifest.webmanifest'), '/next/ stays without it');
    assert.ok(has('sw-app.js') && has('config.js') && fs.readdirSync(dir).some(n => /^app\.[0-9a-f]{10}\.js$/.test(n)), 'the root page has its hashed files and its worker next to it');
    const legacy = fs.readFileSync(path.join(dir, 'legacy', 'index.html'), 'utf8');
    assert.equal(legacy, legacyWrapper());
    assert.ok(!legacy.includes('<script src="/offline-host.js">') && legacy.includes('iframe id="app"'), '/legacy/ is the wrapper without the script that would register /sw.js over the panel worker');
    // the files the old wrapper loads from the root are still there, so /legacy/ works
    for (const f of ['offline.js', 'offline-host.js', 'offline.css', 'sw.js', 'logo.png', 'icon-192.png']) assert.ok(has(f), f + ' (used by /legacy/)');
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

test('rollback: with rootLegacy (repo variable ROOT_LEGACY=true) the old wrapper is the root page again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-rb-'));
  try {
    buildSite({ outDir: dir, exec: 'https://script.test/exec', rootLegacy: true });
    const wrapper = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), wrapper);
    assert.equal(fs.readFileSync(path.join(dir, 'legacy', 'index.html'), 'utf8'), legacyWrapper());
    assert.ok(wrapper.includes('/offline-host.js'), 'the root wrapper (rollback) keeps its offline host');
    assert.ok(!fs.existsSync(path.join(dir, 'sw-app.js')) && !fs.existsSync(path.join(dir, 'config.js')), 'no static-page files at the root');
    assert.ok(fs.existsSync(path.join(dir, 'next', 'index.html')), '/next/ is still there');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rollback: the ROOT_LEGACY environment variable does the same as the option', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-env-'));
  const keep = process.env.ROOT_LEGACY;
  try {
    process.env.ROOT_LEGACY = 'true';
    buildSite({ outDir: dir, exec: 'https://script.test/exec' });
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    process.env.ROOT_LEGACY = 'false';
    buildSite({ outDir: dir, exec: 'https://script.test/exec' });
    assert.notEqual(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  } finally { if (keep === undefined) delete process.env.ROOT_LEGACY; else process.env.ROOT_LEGACY = keep; fs.rmSync(dir, { recursive: true, force: true }); }
});
