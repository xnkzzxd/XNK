'use strict';
// T-2243: ganti slug coach di hub tanpa memutus link lama — alias (halaman pengalih + worker pengganti), storageSlug
// (login dan salinan offline tetap), aksi ganti-slug di hub-edit, secret clasp lama di coach-ops / coach.yml.
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
const { verifySite } = require('../tools/hub-verify');

const EXEC = n => `https://script.google.com/macros/s/AKfycbHUBTEST${String(n).padStart(12, '0')}abcdef/exec`;
// "lama" diganti jadi "baru" lewat hub-edit (persis seperti workflow Hub XNK aksi ganti-slug).
const BEFORE = { coaches: [{ slug: 'lama', brand: 'Coach Lama', exec: EXEC(1) }, { slug: 'dina', brand: 'Dina', exec: EXEC(2) }] };
const AFTER = edit(BEFORE, 'ganti-slug', { slug: 'lama', newSlug: 'baru' }).cfg;

let built = null;
const site = () => built || (built = hub.build(AFTER).files);

test('hub.json: aliases, storageSlug dan secret diperiksa; tabrakan nama ditolak', () => {
  const mk = (extra, more) => ({ coaches: [Object.assign({ slug: 'baru', brand: 'B', exec: EXEC(1) }, extra)].concat(more || []) });
  const r = hub.readHub(mk({ aliases: ['lama'], storageSlug: 'lama', secret: 'CLASP_LAMA' })).coaches[0];
  assert.deepEqual([r.aliases, r.storageSlug, r.secret], [['lama'], 'lama', 'CLASP_LAMA']);
  assert.equal(hub.readHub(mk({})).coaches[0].storageSlug, 'baru', 'bawaan = slug');
  const other = { slug: 'dina', brand: 'D', exec: EXEC(2) };
  for (const [extra, more, re] of [
    [{ aliases: 'lama' }, null, /aliases harus berupa daftar/],
    [{ aliases: ['Lama'] }, null, /alamat lama slug "Lama" tidak valid/],
    [{ aliases: ['admin'] }, null, /dipakai sistem/],
    [{ aliases: ['baru'] }, null, /sama dengan slug-nya sendiri/],
    [{ aliases: ['lama', 'lama'] }, null, /"lama" dipakai dua kali/],
    [{ aliases: ['dina'] }, [other], /"dina" dipakai dua kali/],
    [{ aliases: ['lama'] }, [Object.assign({ aliases: ['lama'] }, other)], /"lama" dipakai dua kali/],
    [{ storageSlug: 'a b' }, null, /storageSlug "a b" tidak valid/],
    [{ storageSlug: 'dina' }, [other], /storageSlug "dina" dipakai/],
    [{ secret: 'clasp_x' }, null, /secret harus nama secret/],
    [{ secret: 'CLASP_X; rm' }, null, /secret harus nama secret/],
  ]) assert.throws(() => hub.readHub(mk(extra, more)), re, JSON.stringify(extra));
});

test('build: /<alias>/, /<alias>/klien/, /<alias>/info/ = halaman pengalih (CSP ketat, noindex) yang menjaga ?query dan #hash', () => {
  const files = site();
  for (const sub of ['', 'klien/', 'info/']) {
    const html = files[`lama/${sub}index.html`];
    assert.ok(html, 'lama/' + sub);
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'CSP ketat');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.equal(scripts.length, 1);
    assert.ok(csp.includes(crypto.createHash('sha256').update(scripts[0]).digest('base64')), 'skrip pengalih bersidik');
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, new RegExp(`<meta http-equiv="refresh" content="1; url=/baru/${sub}">`));
    assert.ok(html.includes(`<link rel="canonical" href="https://xnk.web.id/baru/${sub}">`));
    let went = '';
    vm.runInNewContext(scripts[0], { location: { search: '?x=1', hash: '#y', replace: u => { went = u; } } });
    assert.equal(went, `/baru/${sub}?x=1#y`);
    assert.ok(!/\son[a-z]+="/.test(html), 'tanpa onclick');
  }
  assert.equal(files['lama/lib-latest.json'], files['baru/lib-latest.json'], 'SITE_URL lama tetap menemukan lib-latest.json');
  for (const f of ['lama/config.js', 'lama/klien/config.js', 'lama/info/sw-app.js']) assert.ok(!(f in files), f + ' bukan aplikasi');
  // Halaman coach yang sekarang tetap lengkap di slug baru.
  for (const f of ['baru/index.html', 'baru/klien/index.html', 'baru/info/index.html', 'baru/sw-app.js', 'baru/klien/sw-app.js']) assert.ok(files[f], f);
});

test('build: penyimpanan dan cache service worker memakai storageSlug, jadi login dan salinan offline lama tetap terbaca', () => {
  const files = site(), before = hub.build(BEFORE).files;
  for (const [sub, kind] of [['', 'panel'], ['klien/', 'klien']]) {
    assert.ok(files[`baru/${sub}index.html`].includes("var P = 'lama:';"), kind + ': awalan penyimpanan lama');
    assert.ok(!files[`baru/${sub}index.html`].includes("'baru:'"));
    assert.ok(files[`baru/${sub}sw-app.js`].includes(`var PREFIX = "xnk-page-lama~${kind}~";`), kind + ': awalan cache lama');
    const shim = h => h.match(/<script>\(function \(\) \{\n  var P = [\s\S]*?<\/script>/)[0];
    assert.equal(shim(files[`baru/${sub}index.html`]), shim(before[`lama/${sub}index.html`]), kind + ': skrip awalan sama persis dengan sebelum ganti slug');
  }
  assert.ok(files['baru/info/index.html'].includes('localStorage.getItem("lama:xnk_theme")'), 'tema halaman info dari awalan lama');
  assert.ok(files['dina/index.html'].includes("var P = 'dina:';"), 'coach lain tidak berubah');
  const m = files['index.html'].match(/var MAP = (\{[^}]*\});/);
  assert.deepEqual(JSON.parse(m[1]), { lama: 'baru' }, 'landing: login berawalan lama membuka /baru/');
  assert.deepEqual(JSON.parse(hub.build(BEFORE).files['index.html'].match(/var MAP = (\{[^}]*\});/)[1]), {}, 'tanpa ganti slug: peta kosong');
  // Manifest dan halaman memakai alamat baru.
  assert.equal(JSON.parse(files['baru/klien/manifest.webmanifest']).start_url, '/baru/klien/');
});

/** Jalankan worker pengganti di vm dengan self/clients/caches palsu. */
function runAliasSw(src, scope, online) {
  const on = {}, opened = [], shown = [];
  const self = {
    location: { origin: 'https://xnk.web.id' }, registration: { scope, showNotification: (t, o) => { shown.push([t, o]); return Promise.resolve(); } },
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([{ url: 'https://xnk.web.id/baru/klien/', focus() { opened.push('focus:' + this.url); } }]), openWindow: u => { opened.push(u); return Promise.resolve(); } },
    addEventListener: (k, f) => { on[k] = f; }, skipWaiting() {},
  };
  const Response = { redirect: (u, s) => ({ redirect: u, status: s }) };
  vm.runInNewContext(src, { self, URL, Response, fetch: () => (online ? Promise.resolve({ page: true }) : Promise.reject(new Error('offline'))), caches: null });
  const fire = async (k, e) => { const w = []; e.waitUntil = p => w.push(p); e.respondWith = p => w.push(p); on[k](e); return Promise.all(w); };
  return { on, opened, shown, fire };
}

test('worker pengganti di alamat lama: tanpa sinyal dialihkan, notifikasi push tetap tampil dan membuka alamat baru', async () => {
  const files = site();
  for (const [sub, to] of [['', '/baru/'], ['klien/', '/baru/klien/']]) {
    const src = files[`lama/${sub}sw-app.js`];
    assert.ok(src.includes(`var TO = ${JSON.stringify(to)};`));
    assert.ok(!/caches\.(delete|keys)/.test(src), 'tidak menghapus cache (milik worker di alamat baru)');
    const scope = 'https://xnk.web.id/lama/' + sub;
    const off = runAliasSw(src, scope, false);
    const [res] = await off.fire('fetch', { request: { mode: 'navigate', method: 'GET', url: scope + '?x=1' } });
    assert.deepEqual(res, { redirect: 'https://xnk.web.id' + to + '?x=1', status: 302 });
    const onl = runAliasSw(src, scope, true);
    assert.deepEqual((await onl.fire('fetch', { request: { mode: 'navigate', method: 'GET', url: scope } }))[0], { page: true }, 'dengan sinyal: halaman pengalih dari jaringan');
    await off.fire('push', { data: { json: () => ({ title: 'Sesi besok', body: 'Hai Ani', url: '/', tag: 'sesi-besok' }) } });
    assert.equal(off.shown[0][0], 'Sesi besok');
    assert.equal(off.shown[0][1].tag, 'sesi-besok', 'tag sama = menggantikan notifikasi dari langganan baru');
    assert.equal(off.shown[0][1].icon, '/img/icon-192.png');
    await off.fire('notificationclick', { notification: { close() {}, data: { url: '/' } } });
    if (sub === 'klien/') assert.deepEqual(off.opened, ['focus:https://xnk.web.id/baru/klien/'], 'jendela portal baru yang terbuka difokuskan');
    else assert.deepEqual(off.opened, ['https://xnk.web.id/baru/'], 'panel: jendela portal bukan miliknya, buka alamat baru');
    const ext = runAliasSw(src, scope, false);
    await ext.fire('notificationclick', { notification: { close() {}, data: { url: 'https://jahat.example/' } } });
    assert.ok(ext.opened.every(u => /^(focus:)?https:\/\/xnk\.web\.id\//.test(u)), 'hanya alamat di situs ini');
  }
});

test('build lama (versi per coach): pasca-proses ganti slug tetap jalan dengan build-tenant commit lama', () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-old-'));
  const tools = path.join(fake, 'apps-script', 'xnk-library', 'tools');
  fs.mkdirSync(tools, { recursive: true });
  // Antarmuka lama build({exec, brand}) → {files, hash}; tidak tahu apa-apa soal slug atau alias.
  fs.writeFileSync(path.join(tools, 'build-tenant.js'), `const real = require(${JSON.stringify(require.resolve('../tools/build-tenant'))});
module.exports = { build(c) { const r = real.build({ exec: c.exec, brand: c.brand }); return { files: r.files, hash: 'oldhash00000' }; } };`);
  const { files } = hub.build(AFTER, { versions: { baru: { commit: 'a'.repeat(40), dir: fake } } });
  assert.ok(files['baru/index.html'].includes("var P = 'lama:';"));
  assert.ok(files['lama/klien/index.html'].includes('location.replace("/baru/klien/"'));
  assert.equal(JSON.parse(files['_hub/versions.json']).baru.hash, 'oldhash00000');
  fs.rmSync(fake, { recursive: true, force: true });
});

test('hub-verify: hasil ganti slug lolos; pengalih yang salah tujuan atau awalan yang tertukar ditolak', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-'));
  hub.write(dir, site());
  assert.deepEqual(verifySite(dir, AFTER), []);
  const ed = (rel, fn) => fs.writeFileSync(path.join(dir, rel), fn(fs.readFileSync(path.join(dir, rel), 'utf8')));
  ed('lama/klien/index.html', t => t.replace('location.replace("/baru/klien/"', 'location.replace("/dina/klien/"'));
  ed('lama/sw-app.js', t => t.replace('var TO = "/baru/";', 'var TO = "/dina/";'));
  ed('baru/klien/index.html', t => t.replace("var P = 'lama:';", "var P = 'baru:';"));
  fs.rmSync(path.join(dir, 'lama', 'info', 'index.html'));
  const p = verifySite(dir, AFTER).join('\n');
  assert.match(p, /lama\/klien\/index\.html tidak mengalihkan ke \/baru\/klien\//);
  assert.match(p, /worker pengganti \/lama\/sw-app\.js/);
  assert.match(p, /baru \(klien\): awalan penyimpanan "lama:"/);
  assert.match(p, /halaman pengalih \/lama\/info\/ tidak ada/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hub-edit ganti-slug: alias + storageSlug + secret lama; kembali ke nama lama; tabrakan ditolak; simpan menjaga isian itu', () => {
  assert.deepEqual(BEFORE.coaches.map(c => c.slug), ['lama', 'dina'], 'masukan tidak diubah');
  const c = AFTER.coaches.find(x => x.slug === 'baru');
  assert.deepEqual(c, { slug: 'baru', brand: 'Coach Lama', exec: EXEC(1), aliases: ['lama'], storageSlug: 'lama', secret: 'CLASP_LAMA' });
  assert.deepEqual(AFTER.coaches.map(x => x.slug), ['baru', 'dina'], 'terurut');
  // Ganti lagi: semua alamat lama tetap, awalan dan secret tetap yang pertama.
  const again = edit(AFTER, 'ganti-slug', { slug: 'baru', newSlug: 'ketiga' }).cfg.coaches.find(x => x.slug === 'ketiga');
  assert.deepEqual([again.aliases, again.storageSlug, again.secret], [['lama', 'baru'], 'lama', 'CLASP_LAMA']);
  // Kembali ke nama pertama: "lama" keluar dari alias, awalan dan secret bawaan cocok lagi (isian dibuang).
  const back = edit(AFTER, 'ganti-slug', { slug: 'baru', newSlug: 'lama' });
  assert.deepEqual(back.cfg.coaches.find(x => x.slug === 'lama'), { slug: 'lama', brand: 'Coach Lama', exec: EXEC(1), aliases: ['baru'] });
  assert.match(back.message, /tetap masuk/);
  for (const [a, re] of [[{ slug: 'baru', newSlug: 'dina' }, /"dina" dipakai dua kali/], [{ slug: 'baru', newSlug: 'admin' }, /dipakai sistem/],
    [{ slug: 'baru', newSlug: 'baru' }, /sama dengan slug sekarang/], [{ slug: 'nobody', newSlug: 'x-y' }, /tidak ada di daftar/], [{ slug: 'baru', newSlug: 'A B' }, /tidak valid/]]) {
    assert.throws(() => edit(AFTER, 'ganti-slug', a), re, JSON.stringify(a));
  }
  assert.throws(() => edit(AFTER, 'simpan', { slug: 'lama', brand: 'X', exec: EXEC(9) }), /"lama" dipakai dua kali/, 'slug lama tidak bisa dipakai coach baru');
  // simpan (warna / link /exec baru) tidak membuang alamat lama, awalan, atau secret.
  for (const a of [{ slug: 'baru', accent: 'biru' }, { slug: 'baru', exec: EXEC(5) }]) {
    const row = edit(AFTER, 'simpan', a).cfg.coaches.find(x => x.slug === 'baru');
    assert.deepEqual([row.aliases, row.storageSlug, row.secret], [['lama'], 'lama', 'CLASP_LAMA'], JSON.stringify(a));
  }
  // CLI seperti workflow Hub XNK.
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-hubjson-')), 'hub.json');
  fs.writeFileSync(f, JSON.stringify(BEFORE));
  const out = execFileSync('node', [require.resolve('../tools/hub-edit'), f, 'ganti-slug', 'lama', 'baru'], { encoding: 'utf8' });
  assert.match(out, /sekarang "baru"/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), AFTER);
});

test('coach-ops dan coach.yml: coach yang ganti slug tetap memakai secret lamanya; slug lama menunjuk coach yang sama', async () => {
  assert.equal(ops.secretOf({ slug: 'baru', secret: 'CLASP_LAMA' }), 'CLASP_LAMA');
  assert.equal(ops.secretOf({ slug: 'gym-andi' }), 'CLASP_GYM_ANDI');
  assert.deepEqual(ops.planRows(AFTER, 'perbarui', ''), [{ slug: 'baru', secret: 'CLASP_LAMA', kenari: true }, { slug: 'dina', secret: 'CLASP_DINA', kenari: false }]);
  assert.deepEqual(ops.planRows(AFTER, 'perbarui', 'lama'), [{ slug: 'baru', secret: 'CLASP_LAMA', kenari: false }], 'slug lama diketik = coach sekarang');
  assert.throws(() => ops.planRows(AFTER, 'hubungkan', ''), /butuh slug/);
  // Skrip rencana di coach.yml (repo hub) harus menghasilkan baris yang sama.
  const yml = fs.readFileSync(path.join(__dirname, '..', 'hub-repo', '.github', 'workflows', 'coach.yml'), 'utf8');
  const script = yml.match(/node -e '\n([\s\S]*?)\n\s*'\n/)[1];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-plan-'));
  fs.writeFileSync(path.join(dir, 'hub.json'), JSON.stringify(AFTER));
  for (const one of ['', 'lama', 'dina']) {
    const outFile = path.join(dir, 'out-' + (one || 'semua'));
    execFileSync('node', ['-e', script], { cwd: dir, env: Object.assign({}, process.env, { IN_AKSI: 'perbarui', IN_SLUG: one, GITHUB_OUTPUT: outFile }) });
    const m = fs.readFileSync(outFile, 'utf8').match(/^matrix=(.*)$/m);
    assert.deepEqual(JSON.parse(m[1]).include, ops.planRows(AFTER, 'perbarui', one), 'coach.yml = planRows untuk "' + one + '"');
  }
  fs.writeFileSync(path.join(dir, 'hub.json'), JSON.stringify({ coaches: [{ slug: 'baru', secret: 'CLASP_X; rm -rf /' }] }));
  assert.throws(() => execFileSync('node', ['-e', script], { cwd: dir, stdio: 'pipe', env: Object.assign({}, process.env, { IN_AKSI: 'perbarui', IN_SLUG: '', GITHUB_OUTPUT: path.join(dir, 'x') }) }), 'nama secret aneh = gagal');
  fs.rmSync(dir, { recursive: true, force: true });
  // perbarui memakai kredensial CLASP_LAMA untuk "baru" (lewat slug lama juga).
  const cfg = JSON.parse(JSON.stringify(AFTER));
  Object.assign(cfg.coaches[0], { scriptId: '1SA' + 'A'.repeat(40), deploymentId: 'AKfycbHUBTEST000000000001abcdef' });
  cfg.coaches[0].exec = 'https://script.google.com/macros/s/AKfycbHUBTEST000000000001abcdef/exec';
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-hubjson-')), 'hub.json');
  fs.writeFileSync(file, JSON.stringify(cfg));
  const RC = JSON.stringify({ token: { access_token: 'x' } });
  const calls = [];
  const runner = (args, o) => { calls.push(fs.readFileSync(path.join(o.home, '.clasprc.json'), 'utf8')); return { code: 0, out: args[0] === 'version' ? 'Created version 3.' : '' }; };
  const lib = { version: 7, libId: '1LibScriptIdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', commit: 'b'.repeat(40) };
  const r = await ops.perbarui(file, 'lama', lib, { env: { SECRETS_JSON: JSON.stringify({ CLASP_LAMA: RC }) }, runner, ask: async () => null });
  assert.equal(r[0].slug, 'baru');
  assert.notEqual(r[0].status, 'gagal', r[0].error);
  assert.ok(calls.length && calls.every(x => x === RC));
  const r2 = await ops.perbarui(file, 'baru', lib, { env: { SECRETS_JSON: '{}' }, runner, ask: async () => null });
  assert.match(r2[0].error, /Secret CLASP_LAMA belum ada/, 'pesan menyebut secret yang benar');
});
