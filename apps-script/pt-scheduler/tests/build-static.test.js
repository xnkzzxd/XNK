'use strict';
// The static build of the Apps Script pages for GitHub Pages (Phase AAA, tools/build-static.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { build, write, SITES, DEFAULT_DEPLOYMENT } = require('../tools/build-static');

const SRC = path.join(__dirname, '..', 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const EXEC = 'https://script.google.com/macros/s/TEST/exec';
const inner = (f, tag) => { const t = read(f); return t.slice(t.indexOf('<' + tag + '>') + tag.length + 2, t.lastIndexOf('</' + tag + '>')); };

for (const site of Object.keys(SITES)) {
  const def = SITES[site];

  test(`${site}: no template tag is left and every local file the page names is in the output`, () => {
    const files = build({ site, exec: EXEC });
    const html = files['index.html'];
    assert.ok(!html.includes('<?'), 'template tag left');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:|\/\/|#|mailto:|tel:)/.test(u));
    assert.ok(refs.length >= 3, 'expected local files, got ' + refs.join(','));
    for (const r of refs) assert.ok(files[r] !== undefined, `${site}: ${r} is not in the build`);
  });

  test(`${site}: file names carry a hash of their content and the build is deterministic`, () => {
    const a = build({ site, exec: EXEC }), b = build({ site, exec: EXEC });
    assert.deepEqual(a, b);
    const crypto = require('crypto');
    for (const [name, text] of Object.entries(a)) {
      const m = /^(.+)\.([0-9a-f]{10})\.(css|js)$/.exec(name);
      if (!m) continue;
      assert.equal(crypto.createHash('sha256').update(text).digest('hex').slice(0, 10), m[2], name);
    }
    const names = Object.keys(a);
    assert.ok(names.includes('index.html') && names.includes('config.js'));
  });

  test(`${site}: the css and js files are the unchanged blocks of the include files, in the original order`, () => {
    const files = build({ site, exec: EXEC });
    const html = files['index.html'];
    const bases = new Set(Object.values(def.out).map(o => o.base));
    const order = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="(?!https?:)([^"]+\.(?:js|css))"/g)].map(m => m[1]).filter(n => bases.has(n.split('.')[0]) && !/^(offline|host-local)\./.test(n));
    assert.equal(order.length, Object.keys(def.out).length);
    // order of appearance = order of the include tags in the template
    const tags = [...read(def.page).matchAll(/include\('([^']+)'\)/g)].map(m => m[1]);
    tags.forEach((f, i) => {
      const o = def.out[f];
      assert.ok(order[i].startsWith(o.base + '.'), `${f} -> ${order[i]}`);
      assert.equal(files[order[i]], inner(f, o.kind === 'css' ? 'style' : 'script'), f);
    });
  });

  test(`${site}: config.js sets XNK_CONFIG with the exec address and the site; it comes first`, () => {
    const files = build({ site, exec: EXEC });
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(files['config.js'], ctx);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.XNK_CONFIG)), Object.assign({ exec: EXEC, site }, def.local ? { sw: 'sw-app.js' } : {}));
    const html = files['index.html'];
    assert.ok(html.indexOf('src="config.js"') > 0 && html.indexOf('src="config.js"') < html.search(/src="(scripts|app|landing)\./));
  });

  test(`${site}: the head keeps what Apps Script added (viewport minimum-scale, favicon) and every JS file parses`, () => {
    const files = build({ site, exec: EXEC });
    const html = files['index.html'];
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover">/);
    assert.ok(html.includes(`<link rel="icon" href="${def.favicon}">`));
    for (const [name, text] of Object.entries(files)) if (name.endsWith('.js')) assert.doesNotThrow(() => new vm.Script(text, { filename: name }), name);
  });
}

test('both pages open the connections the first server call needs (exec host and the redirect target)', () => {
  for (const site of Object.keys(SITES)) {
    const html = build({ site, exec: EXEC })['index.html'];
    assert.ok(html.includes('<link rel="preconnect" href="https://script.google.com">'), site + ': preconnect to the exec host');
    assert.ok(html.includes('<link rel="preconnect" href="https://script.googleusercontent.com" crossorigin>'), site + ': preconnect to the redirect target');
  }
});

test('app: panel page is private (noindex, app meta); the landing is public and keeps its own title', () => {
  const app = build({ site: 'app', exec: EXEC })['index.html'];
  assert.match(app, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(app, /apple-mobile-web-app-title/);
  assert.match(app, /<title>XNK Personal Training<\/title>/);
  assert.ok(!app.includes('manifest.webmanifest'), 'the manifest is bound to /');
  const land = build({ site: 'landing', exec: EXEC })['index.html'];
  assert.ok(!/noindex/.test(land));
  assert.match(land, /<title>Coach Jizdan/);
  assert.match(land, /<meta name="description"/);
});

test('exec: defaults to the deployment of pt-scheduler.yml; XNK_EXEC and PT_DEPLOYMENT_ID override', () => {
  const keep = { e: process.env.XNK_EXEC, d: process.env.PT_DEPLOYMENT_ID };
  try {
    delete process.env.XNK_EXEC; delete process.env.PT_DEPLOYMENT_ID;
    assert.match(build({ site: 'app' })['config.js'], new RegExp('macros/s/' + DEFAULT_DEPLOYMENT + '/exec'));
    const wf = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'pt-scheduler.yml'), 'utf8');
    assert.ok(wf.includes(DEFAULT_DEPLOYMENT), 'default deployment differs from pt-scheduler.yml');
    process.env.PT_DEPLOYMENT_ID = 'ABC';
    assert.match(build({ site: 'app' })['config.js'], /macros\/s\/ABC\/exec/);
    process.env.XNK_EXEC = 'https://z/exec';
    assert.match(build({ site: 'app' })['config.js'], /https:\/\/z\/exec/);
  } finally {
    for (const [k, v] of [['XNK_EXEC', keep.e], ['PT_DEPLOYMENT_ID', keep.d]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('write puts every file on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-static-'));
  try {
    const files = build({ site: 'landing', exec: EXEC });
    write(dir, files);
    for (const [n, t] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(dir, n), 'utf8'), t);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('app: the static page does the old wrapper\'s jobs itself (host-local, offline screen, service worker)', () => {
  const files = build({ site: 'app', exec: EXEC });
  const html = files['index.html'];
  const root = f => fs.readFileSync(path.join(__dirname, '..', '..', '..', f), 'utf8');
  const hl = Object.keys(files).find(n => /^host-local\.[0-9a-f]{10}\.js$/.test(n));
  const oj = Object.keys(files).find(n => /^offline\.[0-9a-f]{10}\.js$/.test(n));
  const oc = Object.keys(files).find(n => /^offline\.[0-9a-f]{10}\.css$/.test(n));
  assert.ok(hl && oj && oc, 'host-local, offline.js and offline.css are in the build');
  assert.equal(files[hl], root('host-local.js'));      // one source each, at the repo root
  assert.equal(files[oj], root('offline.js'));
  assert.equal(files[oc], root('offline.css'));
  // host-local runs before the app scripts; offline.js is written with the mode that fits the URL
  assert.ok(html.indexOf(hl) > 0 && html.indexOf(hl) < html.indexOf('src="scripts.'));
  assert.match(html, /data-mode="' \+ \(\/\[\?&\]\(view=public\|k=\)\/\.test\(location\.search\)/);
  assert.ok(html.includes(`<script>document.write('<script src="${oj}"`));
  // the landing needs none of it
  const land = Object.keys(build({ site: 'landing', exec: EXEC }));
  assert.ok(!land.some(n => /^(host-local|offline|sw-app)/.test(n)));
});

test('app: sw-app.js precaches the page, every hashed file and config.js, and its cache name follows the content', () => {
  const a = build({ site: 'app', exec: EXEC });
  const sw = a['sw-app.js'];
  assert.doesNotThrow(() => new vm.Script(sw, { filename: 'sw-app.js' }));
  const assets = JSON.parse(/var ASSETS = (\[.*?\]);/.exec(sw)[1]);
  assert.deepEqual(assets.sort(), Object.keys(a).filter(n => n !== 'index.html' && n !== 'sw-app.js').sort());
  assert.ok(assets.includes('config.js') && assets.some(n => /^app\./.test(n)) && assets.some(n => /^theme\./.test(n)));
  assert.ok(!sw.includes('__HASH__') && !sw.includes('__ASSETS__'));
  const cacheOf = f => /var HASH = "([0-9a-f]{10})"/.exec(f['sw-app.js'])[1];
  assert.equal(cacheOf(a), cacheOf(build({ site: 'app', exec: EXEC })));                    // stable for the same build
  assert.notEqual(cacheOf(a), cacheOf(build({ site: 'app', exec: 'https://other/exec' })));  // config.js changed -> new cache
});

test('app: built for the site root (root: true) it also links the Home Screen manifest; landing never does', () => {
  assert.ok(build({ site: 'app', exec: EXEC, root: true })['index.html'].includes('<link rel="manifest" href="/manifest.webmanifest">'));
  assert.ok(!build({ site: 'app', exec: EXEC })['index.html'].includes('manifest.webmanifest'));
  assert.ok(!build({ site: 'landing', exec: EXEC, root: true })['index.html'].includes('manifest.webmanifest'));
});

test('service workers on xnk.my.id share one cache storage: each deletes only its own prefix', () => {
  const root = f => fs.readFileSync(path.join(__dirname, '..', '..', '..', f), 'utf8');
  const pageSw = build({ site: 'app', exec: EXEC })['sw-app.js'];
  assert.ok(pageSw.includes('k.indexOf(PREFIX) === 0 && k !== CACHE'));
  // the page worker's prefix follows its scope: the same file runs at / and at /next/ and the two must not delete each other's cache
  const prefixAt = scope => { const ctx = vm.createContext({ self: { registration: { scope } }, URL }); vm.runInContext(pageSw.slice(pageSw.indexOf('var HASH'), pageSw.indexOf('var ASSETS')), ctx); return ctx.PREFIX; };
  const rootPrefix = prefixAt('https://xnk.my.id/'), nextPrefix = prefixAt('https://xnk.my.id/next/');
  assert.equal(rootPrefix, 'xnk-page-root-');
  assert.equal(nextPrefix, 'xnk-page-next-');
  const appSw = root('app/sw.js');
  assert.ok(appSw.includes("k.indexOf('xnk-app-v') === 0 && k !== V"), "app/sw.js must not delete other workers' caches");
  assert.match(root('sw.js'), /k\.indexOf\('xnk-off-'\) === 0 && k !== CACHE/);
  // no prefix starts with another one, so a prefix test can never catch a neighbour's cache
  const names = [rootPrefix, nextPrefix, 'xnk-app-v', 'xnk-off-'];
  for (const a of names) for (const b of names) if (a !== b) assert.ok(!a.startsWith(b) && !b.startsWith(a), `${a} and ${b} overlap`);
});
