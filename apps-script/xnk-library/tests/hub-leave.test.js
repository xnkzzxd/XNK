'use strict';
// T-2252: coach keluar di hub. hub.json "inactive": true → /<slug>/, /<slug>/klien/, /<slug>/info/ = halaman kecil
// "Situs coach ini tidak aktif lagi" (CSP ketat, noindex, tanpa aplikasi) + worker pembersih di alamat worker lama;
// coach aktif dibangun persis sama; perbarui (coach-ops, coach.yml), push dan hub-versions melewati coach itu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const hub = require('../tools/build-hub');
const { edit } = require('../tools/hub-edit');
const ops = require('../tools/coach-ops');
const hp = require('../tools/hub-push');
const versions = require('../tools/hub-versions');
const { verifySite } = require('../tools/hub-verify');

const EXEC = n => `https://script.google.com/macros/s/AKfycbHUBTEST${String(n).padStart(12, '0')}abcdef/exec`;
const ACTIVE = {
  contactUrl: 'https://wa.me/6281200000000',
  coaches: [
    { slug: 'claudia', brand: 'Claudia', exec: EXEC(1), place: { name: 'Serpong', city: 'Tangerang Selatan' } },
    { slug: 'vinna', brand: 'Coach Vinna', exec: EXEC(2), accent: 'biru' },
  ],
};
// Coach ketiga keluar lewat hub-edit (persis seperti workflow Hub XNK aksi nonaktif); pernah ganti slug.
const WITH = edit({ contactUrl: ACTIVE.contactUrl, coaches: ACTIVE.coaches.concat([{ slug: 'pergi', brand: 'Coach Pergi', exec: EXEC(3), aliases: ['pergi-lama'], storageSlug: 'pergi-lama' }]) }, 'nonaktif', { slug: 'pergi' }).cfg;

let cache = null;
const sites = () => cache || (cache = { a: hub.build(ACTIVE).files, b: hub.build(WITH).files });

test('hub.json: inactive hanya true/false; hub-edit nonaktif/aktifkan (juga lewat slug lama); simpan menjaga tandanya', () => {
  const mk = v => ({ coaches: [{ slug: 'pergi', brand: 'P', exec: EXEC(3), inactive: v }] });
  assert.equal(hub.readHub(mk(true)).coaches[0].inactive, true);
  assert.equal(hub.readHub(mk(false)).coaches[0].inactive, undefined);
  for (const v of ['true', 1, 'ya']) assert.throws(() => hub.readHub(mk(v)), /inactive harus true atau false/);
  assert.equal(WITH.coaches.find(c => c.slug === 'pergi').inactive, true);
  const viaAlias = edit(WITH, 'aktifkan', { slug: 'pergi-lama' });
  assert.equal('inactive' in viaAlias.cfg.coaches.find(c => c.slug === 'pergi'), false);
  assert.match(viaAlias.message, /aktif lagi/);
  assert.match(edit(ACTIVE, 'nonaktif', { slug: 'claudia' }).message, /tidak aktif lagi.*data coach tidak dihapus/);
  assert.throws(() => edit(ACTIVE, 'nonaktif', { slug: 'zaki' }), /tidak ada di daftar/);
  // simpan (warna, logo, link baru) tidak membuang tanda tidak aktif.
  const s = edit(WITH, 'simpan', { slug: 'pergi', accent: 'hijau', exec: EXEC(9) }).cfg.coaches.find(c => c.slug === 'pergi');
  assert.deepEqual([s.inactive, s.accent, s.exec], [true, 'hijau', EXEC(9)]);
  assert.equal(ACTIVE.coaches.some(c => 'inactive' in c), false, 'input not mutated');
});

test('build: coach tanpa inactive dibangun persis sama (byte demi byte), dengan atau tanpa coach tidak aktif di hub', () => {
  const { a, b } = sites();
  const mine = f => Object.keys(f).filter(k => /^(claudia|vinna)\//.test(k)).sort();
  assert.deepEqual(mine(b), mine(a));
  for (const k of mine(a)) assert.ok(Buffer.compare(Buffer.from(a[k]), Buffer.from(b[k])) === 0, k);
  for (const k of ['404.html', '_hub/versions.json', '_lib/foods/foods.min.json']) assert.ok(Buffer.compare(Buffer.from(a[k]), Buffer.from(b[k])) === 0, k);
  assert.deepEqual(Object.keys(JSON.parse(b['_hub/versions.json'])).sort(), ['claudia', 'vinna'], 'inactive coach has no server version');
});

test('build: /<slug>/, /klien/, /info/ coach tidak aktif = halaman "tidak aktif lagi" (CSP ketat, noindex, kontak, tanpa aplikasi dan /exec)', () => {
  const { b } = sites();
  for (const sub of ['', 'klien/', 'info/']) {
    const html = b[`pergi/${sub}index.html`];
    assert.ok(html, sub);
    assert.match(html, /<h1>Situs coach ini tidak aktif lagi<\/h1>/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.ok(html.includes('href="https://wa.me/6281200000000"'), 'owner contact');
    assert.ok(html.includes('href="/?hub"'), 'landing link that does not auto-open a coach');
    assert.ok(html.includes('Coach Pergi'));
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    assert.ok(!/unsafe-inline[^;]*;/.test(csp.split('; ').find(x => x.startsWith('script-src'))), 'strict CSP');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.equal(scripts.length, 1);
    assert.ok(csp.includes(crypto.createHash('sha256').update(scripts[0]).digest('base64')), 'hashed');
    assert.ok(!html.includes(EXEC(3)) && !/config\.js|sw-app|<script src/.test(html), 'no app');
    // Skrip inline melepas worker lama di cakupan /pergi/ saja.
    const gone = [];
    const regs = ['https://xnk.web.id/pergi/', 'https://xnk.web.id/pergi/klien/', 'https://xnk.web.id/claudia/', 'https://xnk.web.id/pergi-2/'].map(scope => ({ scope, unregister() { gone.push(scope); } }));
    let then, keys;
    const dropped = [];
    const caches = { keys: () => ({ then: f => { keys = f; } }), delete: k => dropped.push(k) };
    vm.runInNewContext(scripts[0], { location: { origin: 'https://xnk.web.id' }, navigator: { serviceWorker: { getRegistrations: () => ({ then: f => { then = f; } }) } }, caches, window: { caches } });
    then(regs);
    assert.deepEqual(gone, ['https://xnk.web.id/pergi/', 'https://xnk.web.id/pergi/klien/']);
    keys(['xnk-page-pergi-lama~panel~a', 'xnk-page-pergi-lama~klien~b', 'xnk-page-pergi-lama-2~panel~c', 'xnk-page-claudia~panel~d', 'xnk-gif-v1']);
    assert.deepEqual(dropped, ['xnk-page-pergi-lama~panel~a', 'xnk-page-pergi-lama~klien~b'], 'only this coach page caches');
  }
  for (const f of Object.keys(b).filter(k => k.startsWith('pergi/'))) assert.ok(/^pergi\/((klien\/|info\/)?index\.html|(klien\/)?sw-app\.js|lib-latest\.json)$/.test(f), 'only notice pages + cleanup workers: ' + f);
  // Alamat lama coach itu tetap mengalihkan ke /pergi/ (yang kini halaman tidak aktif).
  assert.ok(b['pergi-lama/index.html'].includes('location.replace("/pergi/"'));
});

test('build: halaman depan tanpa coach tidak aktif; login tersimpan coach itu tidak dibuka otomatis', () => {
  const { b } = sites();
  const landing = b['index.html'];
  assert.ok(!landing.includes('href="/pergi/info/"') && !landing.includes('Coach Pergi'));
  assert.ok(landing.includes('href="/claudia/info/"') && landing.includes('href="/vinna/info/"'));
  assert.ok(landing.includes('var OFF = ["pergi-lama"];'), 'storage prefix and old slugs of the inactive coach');
  assert.ok(hub.build(ACTIVE).files['index.html'].includes('var OFF = [];'));
  // Jalankan skrip kepala: hanya login coach tidak aktif = tetap di halaman depan; ada coach lain = coach lain.
  const head = landing.match(/<script>([\s\S]*?)<\/script>/)[1];
  const run = keys => {
    let went = null;
    const store = Object.assign({}, keys);
    const ls = { get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i], getItem: k => (k in store ? store[k] : null) };
    vm.runInNewContext(head, { location: { hash: '', search: '', origin: 'https://xnk.web.id', replace: u => { went = u; } }, document: { referrer: '' }, performance: {}, localStorage: ls, addEventListener() {} });
    return went;
  };
  assert.equal(run({ 'pergi-lama:xnk_member_token': 't' }), null);
  assert.equal(run({ 'pergi-lama:xnk_member_token': 't', 'claudia:xnk_member_token': 't' }), '/claudia/klien/');
});

test('worker pembersih: menghapus cache halaman coach itu saja, melepas dirinya, memuat ulang jendela; tanpa pengendali fetch', async () => {
  const { b } = sites();
  for (const [sub, kind] of [['', 'panel'], ['klien/', 'klien']]) {
    const src = b[`pergi/${sub}sw-app.js`];
    const prefix = `xnk-page-pergi-lama~${kind}~`;
    assert.ok(src.includes(`var PREFIX = ${JSON.stringify(prefix)};`), 'storageSlug prefix');
    const on = {}, deleted = [], log = [];
    const names = [prefix + 'abc', prefix + 'def', 'xnk-page-pergi-lama~' + (kind === 'panel' ? 'klien' : 'panel') + '~x', 'xnk-page-claudia~panel~1', 'xnk-gif-v1'];
    const self = {
      registration: { scope: 'https://xnk.web.id/pergi/' + sub, unregister: () => { log.push('unregister'); return Promise.resolve(true); } },
      clients: { claim: () => { log.push('claim'); return Promise.resolve(); }, matchAll: () => Promise.resolve([{ url: 'https://xnk.web.id/pergi/' + sub, navigate(u) { log.push('reload ' + u); return Promise.resolve(); } }]) },
      addEventListener: (k, f) => { on[k] = f; }, skipWaiting() { log.push('skip'); },
    };
    const caches = { keys: () => Promise.resolve(names), delete: k => { deleted.push(k); return Promise.resolve(true); } };
    vm.runInNewContext(src, { self, caches });
    assert.deepEqual(Object.keys(on).sort(), ['activate', 'install'], 'no fetch handler: network only');
    on.install({});
    let p;
    on.activate({ waitUntil: x => { p = x; } });
    await p;
    assert.deepEqual(deleted, [prefix + 'abc', prefix + 'def'], 'only this page cache');
    assert.deepEqual(log, ['skip', 'claim', 'unregister', 'reload https://xnk.web.id/pergi/' + sub]);
  }
});

test('hub-verify: hasil dengan coach tidak aktif lolos; aplikasi yang tertinggal, kartu di halaman depan, worker salah ditolak', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-'));
  hub.write(dir, sites().b);
  assert.deepEqual(verifySite(dir, WITH), []);
  const ed = (rel, fn) => fs.writeFileSync(path.join(dir, rel), fn(fs.readFileSync(path.join(dir, rel), 'utf8')));
  fs.writeFileSync(path.join(dir, 'pergi', 'klien', 'config.js'), 'x');
  ed('pergi/sw-app.js', t => t.replace('xnk-page-pergi-lama~panel~', 'xnk-page-pergi~panel~'));
  ed('pergi/info/index.html', t => t.replace('Situs coach ini tidak aktif lagi', 'Halo'));
  ed('index.html', t => t.replace('</body>', '<a href="/pergi/info/">x</a></body>'));
  const p = verifySite(dir, WITH).join('\n');
  assert.match(p, /aplikasi masih ikut \(pergi\/klien\/config\.js\)/);
  assert.match(p, /worker pembersih \/pergi\/sw-app\.js/);
  assert.match(p, /pergi\/info\/index\.html: bukan halaman "tidak aktif"/);
  assert.match(p, /masih menautkan coach tidak aktif/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('perbarui: coach tidak aktif dilewati dan tidak pernah jadi kenari (coach-ops dan coach.yml sama)', async () => {
  const cfg = JSON.parse(JSON.stringify(WITH));
  cfg.coaches = [cfg.coaches.find(c => c.slug === 'pergi')].concat(cfg.coaches.filter(c => c.slug !== 'pergi'));   // tidak aktif di depan
  cfg.coaches.forEach((c, i) => { c.scriptId = '1S' + 'ABC'[i] + 'A'.repeat(40); });
  assert.deepEqual(ops.planRows(cfg, 'perbarui', ''), [{ slug: 'pergi', secret: 'CLASP_PERGI', kenari: true }, { slug: 'claudia', secret: 'CLASP_CLAUDIA', kenari: false }, { slug: 'vinna', secret: 'CLASP_VINNA', kenari: false }].filter(r => r.slug !== 'pergi').map((r, i) => Object.assign(r, { kenari: i === 0 })));
  assert.deepEqual(ops.planRows(cfg, 'perbarui', 'pergi'), [{ slug: 'pergi', secret: 'CLASP_PERGI', kenari: false }], 'explicit slug still planned (then skipped by coach-ops)');
  const yml = fs.readFileSync(path.join(__dirname, '..', 'hub-repo', '.github', 'workflows', 'coach.yml'), 'utf8');
  const script = yml.match(/node -e '\n([\s\S]*?)\n\s*'\n/)[1];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-plan-'));
  fs.writeFileSync(path.join(dir, 'hub.json'), JSON.stringify(cfg));
  for (const one of ['', 'pergi', 'vinna']) {
    const outFile = path.join(dir, 'out-' + (one || 'semua'));
    execFileSync('node', ['-e', script], { cwd: dir, env: Object.assign({}, process.env, { IN_AKSI: 'perbarui', IN_SLUG: one, GITHUB_OUTPUT: outFile }) });
    assert.deepEqual(JSON.parse(fs.readFileSync(outFile, 'utf8').match(/^matrix=(.*)$/m)[1]).include, ops.planRows(cfg, 'perbarui', one), 'coach.yml = planRows "' + one + '"');
  }
  // coach-ops perbarui: tidak aktif = "dilewati", tanpa clasp; coach aktif tetap diperbarui (claudia = kenari).
  cfg.coaches.forEach((c, i) => { c.deploymentId = 'AKfycbHUBTEST' + String(i + 1).padStart(12, '0') + 'abcdef'; c.exec = EXEC(i + 1); });
  const file = path.join(dir, 'hub.json');
  fs.writeFileSync(file, JSON.stringify(cfg));
  const touched = [];
  const runner = (args, o) => { touched.push(JSON.parse(fs.readFileSync(path.join(o.cwd || o.home, '.clasp.json'), 'utf8')).scriptId); return { code: 0, out: args[0] === 'version' ? 'Created version 4.' : args[0] === 'deploy' ? '- x @4.' : '' }; };
  const lib = { version: 7, libId: '1LibScriptIdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', commit: 'b'.repeat(40) };
  const ask = async () => ({ lib: { commit: lib.commit } });   // server menjawab commit baru setelah deploy
  const rc = JSON.stringify({ token: { access_token: 'x' } });
  const env = { SECRETS_JSON: JSON.stringify({ CLASP_PERGI: rc, CLASP_CLAUDIA: rc, CLASP_VINNA: rc }) };
  const r = await ops.perbarui(file, 'semua', lib, { env, runner, ask, force: true });
  assert.deepEqual(r[0], { slug: 'pergi', status: 'dilewati: coach tidak aktif' });
  assert.deepEqual(r.slice(1).map(x => x.slug), ['claudia', 'vinna']);
  assert.ok(!touched.includes(cfg.coaches[0].scriptId), 'inactive coach never touched by clasp');
  const one = await ops.perbarui(file, 'pergi', lib, { env, runner, ask });
  assert.deepEqual(one, [{ slug: 'pergi', status: 'dilewati: coach tidak aktif' }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('push dan hub-versions: coach tidak aktif tidak dikirimi dan servernya tidak ditanya', async () => {
  const PASS = 'kata-sandi-acak-yang-panjang-sekali-123';
  const PUSAT = 'https://script.google.com/macros/s/AKfycbPUSAT00000000000000/exec';
  const keys = hp.deriveKeys(PASS);
  const calls = [];
  const fetchImpl = async (url, o) => {
    const req = JSON.parse(o.body);
    calls.push([url, req.fn]);
    const ok = data => ({ text: async () => JSON.stringify({ ok: true, data }), json: async () => ({ ok: true, data }), status: 200, ok: true, headers: { get: () => null } });
    if (url === PUSAT) return ok({ coaches: [{ slug: 'pergi', exec: EXEC(3), relay: 'r'.repeat(40) }, { slug: 'claudia', exec: EXEC(1), relay: 's'.repeat(40) }] });
    if (req.fn === 'pushRelayPull') return ok({ items: [], vapid: null });
    if (req.fn === 'getServerInfo') return ok({ lib: { commit: 'z' } });
    return ok({});
  };
  const webpush = { setVapidDetails() {}, sendNotification: async () => {} };
  const r = await hp.send({ hub: Object.assign({}, WITH, { vapidPublic: keys.publicKey, pusatUrl: PUSAT }), pushSecret: 'p'.repeat(40), vapidSecret: PASS, fetchImpl, webpush });
  assert.equal(r.coaches.pergi, undefined);
  assert.ok(!calls.some(c => c[0] === EXEC(3)), 'inactive coach never contacted for push');
  calls.length = 0;
  const v = await versions.resolve(WITH, path.join(__dirname, '..', '..', '..'), { fetch: fetchImpl });
  assert.ok(!calls.some(c => c[0] === EXEC(3)), 'inactive coach server not asked');
  assert.equal(v.versions.pergi, undefined);
});
