'use strict';
// Situs hub xnk.web.id: aturan slug, hasil build, dan isolasi penyimpanan antar coach di satu domain.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const hub = require('../tools/build-hub');

const EXEC = n => `https://script.google.com/macros/s/AKfycbHUBTEST${String(n).padStart(12, '0')}abcdef/exec`;
const CFG = {
  contactUrl: 'https://wa.me/6281234567890',
  coaches: [
    { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1) },
    { slug: 'claudia-2', brand: 'Claudia Dua', exec: EXEC(2) },
  ],
};

test('slug: huruf kecil, angka, tanda hubung; 3 sampai 30; kata sistem ditolak', () => {
  for (const ok of ['claudia', 'gym-andi', 'budi2', 'a1b', 'x'.repeat(30)]) assert.equal(hub.slugError(ok), '', ok);
  for (const bad of ['', 'ab', 'x'.repeat(31), 'Claudia', 'gym andi', '-abc', 'abc-', 'a--b', 'a_b', 'a/b', 'a.b', 'claudia/', '../x', 'été']) {
    assert.notEqual(hub.slugError(bad), '', JSON.stringify(bad));
  }
  for (const r of hub.RESERVED.filter(x => /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(x))) assert.match(hub.slugError(r), /dipakai sistem/, r);
  assert.match(hub.slugError('admin'), /dipakai sistem/);
  assert.match(hub.slugError('klien'), /dipakai sistem/);
});

test('hub.json: galat berbahasa Indonesia sebelum apa pun dibangun', () => {
  const mk = c => ({ coaches: [Object.assign({ slug: 'claudia', brand: 'C', exec: EXEC(1) }, c)] });
  assert.throws(() => hub.readHub(null), /coaches/);
  assert.throws(() => hub.readHub({ coaches: 'x' }), /coaches/);
  assert.throws(() => hub.readHub(mk({ slug: 'Admin' })), /coach ke-1.*tidak valid/);
  assert.throws(() => hub.readHub(mk({ slug: 'api' })), /dipakai sistem/);
  assert.throws(() => hub.readHub(mk({ exec: 'https://contoh.com/exec' })), /"claudia".*\/exec/);
  assert.throws(() => hub.readHub(mk({ exec: 'https://script.google.com/macros/s/AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ/exec' })), /xnk\.my\.id/);
  assert.throws(() => hub.readHub(mk({ brand: '' })), /nama usaha/);
  assert.throws(() => hub.readHub(mk({ contactUrl: 'x' }).coaches && { coaches: [], contactUrl: 'http://x.y' }), /contactUrl/);
  assert.throws(() => hub.readHub({ coaches: [mk({}).coaches[0], mk({}).coaches[0]] }), /dua kali/);
  assert.throws(() => hub.readHub({ coaches: [mk({}).coaches[0], Object.assign({}, mk({}).coaches[0], { slug: 'budi' })] }), /\/exec yang sama/);
  assert.deepEqual(hub.readHub({ coaches: [] }).coaches, []);
});

test('build: landing di akar, panel di /<slug>/, portal di /<slug>/klien/, 404 ada', () => {
  const { files } = hub.build(CFG);
  for (const n of ['index.html', '404.html', '.nojekyll']) assert.ok(n in files, n);
  for (const s of ['claudia', 'claudia-2']) {
    for (const d of [s + '/', s + '/klien/']) for (const n of ['index.html', 'config.js', 'sw-app.js', 'icon.svg'].filter(n => !(n === 'icon.svg' && d.endsWith('klien/')))) assert.ok(d + n in files, d + n);
  }
  assert.match(files['claudia/config.js'], /"site":"app"/);
  assert.match(files['claudia/klien/config.js'], /"site":"client"/);
  assert.ok(files['claudia/config.js'].includes(EXEC(1)) && !files['claudia/config.js'].includes(EXEC(2)));
  assert.ok(files['claudia-2/klien/config.js'].includes(EXEC(2)));
  assert.match(files['claudia/index.html'], /<title>Claudia Fit<\/title>/);
  assert.match(files['index.html'], /href="https:\/\/wa\.me\/6281234567890"/);
  assert.ok(!hub.build({ coaches: [] }).files['index.html'].includes('Hubungi XNK'), 'tanpa kontak, tombolnya tidak ada');
  assert.ok(!files['index.html'].includes('<!--CONTACT-->'));
  // Tanpa coach pun situs jadi (hanya landing).
  const empty = hub.build({ coaches: [] }).files;
  assert.deepEqual(Object.keys(empty).filter(n => !n.startsWith('img/')).sort(), ['.nojekyll', '404.html', '_hub/versions.json', 'adminxnk/index.html', 'index.html', 'manifest.webmanifest', 'sw.js']);
  assert.ok(Buffer.isBuffer(empty['img/og.jpg']) && empty['img/og.jpg'].length > 1000, 'gambar landing ikut dibangun');
});

test('landing: daftar coach dari hub.json, nama di-escape, gambar yang dirujuk ada', () => {
  const { files } = hub.build(CFG);
  const html = files['index.html'];
  // T-2241: kartu coach membuka halaman info coach itu.
  assert.match(html, /href="\/claudia\/info\/"[\s\S]*Claudia Fit/);
  assert.match(html, /href="\/claudia-2\/info\/"/);
  assert.ok(!html.includes('<!--COACHES-->') && !html.includes('<!--CONTACT-->'));
  assert.equal(html.split('Hubungi XNK').length - 1, 2, 'kontak di hero dan di penutup');
  for (const m of html.matchAll(/(?:src|content)="(?:https:\/\/xnk\.web\.id\/)?(img\/[^"]+)"/g)) assert.ok(m[1] in files, m[1]);
  // Form masuk tetap sama (hub-check dan link lama bergantung padanya).
  for (const id of ['id="f"', 'id="slug"', 'id="err"', 'data-to="klien"', 'data-to="panel"', '<title>XNK</title>']) assert.ok(html.includes(id), id);
  const evil = hub.build({ coaches: [{ slug: 'evil', brand: '<img src=x onerror=alert(1)>', exec: EXEC(3) }] }).files['index.html'];
  assert.ok(!evil.includes('<img src=x') && evil.includes('&lt;img src=x'), 'nama usaha di-escape');
  const evilInfo = hub.build({ coaches: [{ slug: 'evil', brand: '<img src=x onerror=alert(1)>', exec: EXEC(3) }] }).files['evil/info/index.html'];
  assert.ok(!evilInfo.includes('<img src=x') && evilInfo.includes('&lt;img src=x'), 'nama usaha di-escape di halaman info');
  const none = hub.build({ coaches: [] }).files['index.html'];
  assert.ok(!none.includes('data-coaches') && !none.includes('href="#coach"'), 'tanpa coach, bagian dan tautannya hilang');
  assert.match(hub.slugError('img'), /dipakai sistem/);
});

test('landing bisa dipasang: manifest, ikon, service worker hanya untuk halaman depan, link unduhan aplikasi', () => {
  const { files } = hub.build(CFG);
  const m = JSON.parse(files['manifest.webmanifest']);
  assert.equal(m.display, 'standalone');
  for (const i of m.icons) assert.ok(i.src.slice(1) in files, i.src);
  assert.ok(m.icons.some(i => i.sizes === '512x512') && m.icons.some(i => i.sizes === '192x192'));
  assert.ok(files['index.html'].includes('<link rel="manifest" href="/manifest.webmanifest">'));
  const sw = files['sw.js'];
  assert.ok(!sw.includes('__HASH__'));
  const own = new Function(sw.match(/var OWN = .*;/)[0] + ' return OWN;')();
  for (const ok of ['/', '/index.html', '/img/og.jpg', '/manifest.webmanifest']) assert.ok(own.test(ok), ok);
  for (const no of ['/claudia/', '/claudia/klien/', '/claudia/sw-app.js', '/claudia/klien/index.html', '/404.html']) assert.ok(!own.test(no), no);
  assert.ok(sw.includes("k.indexOf('xnk-hub-') === 0 && k !== CACHE"), 'hanya menghapus cache miliknya sendiri');
  assert.notEqual(hub.build({ coaches: [] }).files['sw.js'], sw, 'nama cache ikut isi landing');
  for (const f of ['XNK-Android.apk', 'XNK-Windows.msi', 'XNK-macOS.dmg']) assert.ok(files['index.html'].includes('/releases/download/app-latest/' + f), f);
});

test('build: penyimpanan per slug dipasang inline sebelum skrip apa pun, service worker punya awalan dan hash unik', () => {
  const { files } = hub.build(CFG);
  const prefixes = new Set(), hashes = new Set();
  for (const s of ['claudia', 'claudia-2']) for (const [d, kind] of [[s + '/', 'panel'], [s + '/klien/', 'klien']]) {
    const html = files[d + 'index.html'];
    const shimAt = html.indexOf("var P = '" + s + ":';");
    assert.ok(shimAt > 0, d + ' memuat penyimpanan per slug');
    for (const needle of ['<script src=', '<link rel="stylesheet"']) assert.ok(html.indexOf(needle) > shimAt, `${d}: ${needle} harus setelah skrip penyimpanan`);
    assert.ok(!html.includes('__SLUG__'));
    const sw = files[d + 'sw-app.js'];
    const prefix = /^var PREFIX = "([^"]+)";$/m.exec(sw)[1];
    assert.equal(prefix, `xnk-page-${s}~${kind}~`);
    prefixes.add(prefix);
    hashes.add(/^var HASH = "([0-9a-f]+)";$/m.exec(sw)[1]);
  }
  assert.equal(prefixes.size, 4);
  assert.equal(hashes.size, 4, 'setiap worker punya versi cache sendiri');
  // Tidak ada awalan yang merupakan awalan awalan lain: worker yang aktif menghapus semua cache berawalan miliknya.
  for (const a of prefixes) for (const b of prefixes) if (a !== b) assert.ok(!b.startsWith(a), `${a} adalah awalan ${b}`);
});

test('build: tidak ada alamat aplikasi XNK atau berkas milik coach lain di halaman coach', () => {
  const { files } = hub.build(CFG);
  for (const [n, t] of Object.entries(files)) {
    if (typeof t !== 'string') continue;
    assert.ok(!t.includes('AKfycbyVOm1'), n + ' memuat link /exec produksi');
    if (n.startsWith('claudia/')) assert.ok(!t.includes(EXEC(2)), n + ' memuat link /exec coach lain');
    if (n.startsWith('claudia-2/')) assert.ok(!t.includes(EXEC(1)), n + ' memuat link /exec coach lain');
  }
});

test('aplikasi hanya memakai metode Storage yang ditangani awalan (getItem, setItem, removeItem, key, length, clear)', () => {
  const SRC = path.join(__dirname, '..', '..', 'pt-scheduler', 'src');
  const roots = [path.join(__dirname, '..', '..', '..')];
  const files = [...fs.readdirSync(SRC).filter(f => f.endsWith('.html')).map(f => path.join(SRC, f)),
    path.join(roots[0], 'host-local.js'), path.join(roots[0], 'offline.js')];
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    const bad = t.match(/\b(?:localStorage|sessionStorage)\s*(?:\[|\.(?!getItem\b|setItem\b|removeItem\b|key\b|length\b|clear\b)[A-Za-z_]+)/g) || [];
    assert.deepEqual(bad, [], path.basename(f) + ' mengakses penyimpanan dengan cara lain');
    assert.ok(!/indexedDB|document\.cookie|addEventListener\(\s*['"]storage['"]/.test(t), path.basename(f) + ' memakai IndexedDB/cookie/event storage');
  }
});

// Penyimpanan palsu yang dipakai bersama oleh semua halaman satu domain.
function sharedStorage() {
  const data = new Map();
  class Storage {
    get length() { return data.size; }
    key(i) { return [...data.keys()][i] ?? null; }
    getItem(k) { return data.has(String(k)) ? data.get(String(k)) : null; }
    setItem(k, v) { data.set(String(k), String(v)); }
    removeItem(k) { data.delete(String(k)); }
    clear() { data.clear(); }
  }
  return { Storage, data };
}
function page(slug, shared) {
  // Setiap "halaman" punya kelas Storage sendiri (seperti jendela browser sendiri) yang berbagi data yang sama.
  const Base = shared.Storage;
  const Own = class extends Base {};
  // Di browser asli metode dan "length" adalah milik langsung Storage.prototype (bukan warisan).
  for (const m of ['getItem', 'setItem', 'removeItem', 'key', 'clear', 'length']) Object.defineProperty(Own.prototype, m, Object.getOwnPropertyDescriptor(Base.prototype, m));
  const ctx = { Storage: Own, Object };
  vm.createContext(ctx);
  const shim = fs.readFileSync(path.join(__dirname, '..', 'hub-site', 'storage-prefix.js'), 'utf8').split('__SLUG__').join(slug);
  vm.runInContext(shim, ctx);
  return new Own();
}

test('penyimpanan per slug: dua coach satu domain tidak saling melihat, menimpa, atau menghapus', () => {
  const shared = sharedStorage();
  const a = page('claudia', shared), b = page('claudia-2', shared), c = page('budi', shared);
  a.setItem('xnk_admin_token', 'TOKEN-A');
  b.setItem('xnk_admin_token', 'TOKEN-B');
  assert.equal(a.getItem('xnk_admin_token'), 'TOKEN-A');
  assert.equal(b.getItem('xnk_admin_token'), 'TOKEN-B');
  assert.equal(c.getItem('xnk_admin_token'), null);
  assert.deepEqual([...shared.data.keys()].sort(), ['claudia-2:xnk_admin_token', 'claudia:xnk_admin_token']);
  // "claudia" tidak boleh melihat kunci "claudia-2" walau namanya diawali sama.
  assert.equal(a.length, 1);
  assert.equal(a.key(0), 'xnk_admin_token');
  assert.equal(a.key(1), null);
  a.removeItem('xnk_admin_token');
  assert.equal(a.getItem('xnk_admin_token'), null);
  assert.equal(b.getItem('xnk_admin_token'), 'TOKEN-B');
  a.setItem('x', '1'); a.setItem('y', '2');
  a.clear();
  assert.equal(a.length, 0);
  assert.equal(b.getItem('xnk_admin_token'), 'TOKEN-B', 'clear() satu coach tidak menghapus data coach lain');
});

test('hub-edit: tambah, ubah, hapus; diperiksa penuh dan masukan tidak berubah', () => {
  const { edit } = require('../tools/hub-edit');
  const empty = { contactUrl: 'https://wa.me/62811', coaches: [] };
  const added = edit(empty, 'simpan', { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1) });
  assert.deepEqual(empty.coaches, [], 'masukan tidak diubah');
  assert.equal(added.cfg.contactUrl, 'https://wa.me/62811', 'pengaturan lain tetap');
  assert.match(added.message, /ditambahkan/);
  const two = edit(added.cfg, 'simpan', { slug: 'budi', brand: 'Budi', exec: EXEC(2) });
  assert.deepEqual(two.cfg.coaches.map(c => c.slug), ['budi', 'claudia'], 'terurut');
  const changed = edit(two.cfg, 'simpan', { slug: 'claudia', brand: 'Claudia Baru', exec: EXEC(3) });
  assert.match(changed.message, /diperbarui/);
  assert.equal(changed.cfg.coaches.length, 2);
  assert.equal(changed.cfg.coaches.find(c => c.slug === 'claudia').brand, 'Claudia Baru');
  const removed = edit(changed.cfg, 'hapus', { slug: 'budi' });
  assert.deepEqual(removed.cfg.coaches.map(c => c.slug), ['claudia']);
  assert.match(removed.message, /tidak aktif lagi/);
  // Galat: semuanya berbahasa Indonesia, tidak ada yang tertulis.
  assert.throws(() => edit(empty, 'simpan', { slug: 'Admin', brand: 'X', exec: EXEC(1) }), /tidak valid/);
  assert.throws(() => edit(empty, 'simpan', { slug: 'api', brand: 'X', exec: EXEC(1) }), /dipakai sistem/);
  assert.throws(() => edit(empty, 'simpan', { slug: 'claudia', brand: '', exec: EXEC(1) }), /Nama usaha wajib/);
  assert.throws(() => edit(empty, 'simpan', { slug: 'claudia', brand: 'X', exec: '' }), /Link \/exec wajib/);
  assert.throws(() => edit(empty, 'simpan', { slug: 'claudia', brand: 'X', exec: 'https://contoh.com/exec' }), /\/exec/);
  assert.throws(() => edit(two.cfg, 'simpan', { slug: 'ani', brand: 'Ani', exec: EXEC(1) }), /\/exec yang sama/, 'dua coach tidak boleh berbagi spreadsheet');
  assert.throws(() => edit(empty, 'hapus', { slug: 'nobody' }), /tidak ada di daftar/);
  assert.throws(() => edit(empty, 'ubah', { slug: 'claudia' }), /Aksi harus/);
});

test('versi per coach (T-2220): halaman coach dibangun dari checkout commit Library-nya; lib-latest dan versions.json ditulis', () => {
  const os = require('os');
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-old-'));
  const tools = path.join(fake, 'apps-script', 'xnk-library', 'tools');
  fs.mkdirSync(tools, { recursive: true });
  // "Commit lama": build-tenant yang sama, ditandai supaya kelihatan halaman mana yang memakainya.
  fs.writeFileSync(path.join(tools, 'build-tenant.js'), `const real = require(${JSON.stringify(require.resolve('../tools/build-tenant'))});
module.exports = Object.assign({}, real, { build(c, o) { const r = real.build(c, o); r.files['lama.txt'] = 'lama'; r.hash = 'oldhash00000'; return r; } });`);
  const sha = 'a'.repeat(40);
  const { files } = hub.build(CFG, { versions: { claudia: { commit: sha, dir: fake } } });
  assert.equal(files['claudia/lama.txt'], 'lama');
  assert.ok(!('claudia-2/lama.txt' in files), 'coach lain memakai kode terbaru');
  const v = JSON.parse(files['_hub/versions.json']);
  assert.deepEqual(v.claudia, { commit: sha, hash: 'oldhash00000' });
  assert.equal(v['claudia-2'].commit, 'terbaru');
  // Cek kesehatan di spreadsheet coach membaca SITE_URL/lib-latest.json = sidik kode TERBARU, bukan versi coach itu.
  for (const s of ['claudia', 'claudia-2']) assert.equal(JSON.parse(files[s + '/lib-latest.json']).library.hash, v['claudia-2'].hash);
  assert.throws(() => hub.build(CFG, { versions: { claudia: { commit: sha, dir: path.join(fake, 'tidak-ada') } } }), /build-tenant\.js tidak ada/);
  fs.rmSync(fake, { recursive: true, force: true });
});

test('hub-versions: commit dari server, lalu build sebelumnya, lalu kode terbaru; isian aneh diabaikan', async () => {
  const hv = require('../tools/hub-versions');
  const { execSync } = require('child_process');
  const repo = path.join(__dirname, '..', '..', '..');
  const head = execSync('git rev-parse HEAD', { cwd: repo }).toString().trim();
  const reply = obj => ({ text: async () => JSON.stringify(obj) });
  const answers = {
    [EXEC(1)]: reply({ ok: true, v: 1, data: { api: 1, lib: { hash: 'x', commit: head } } }),
    [EXEC(2)]: reply({ ok: false, v: 1, error: 'Permintaan tidak valid.', code: 'unknown_fn' }),
  };
  const fetchImpl = async url => { if (answers[url]) return answers[url]; throw new Error('offline'); };
  assert.equal(await hv.askServer(EXEC(1), fetchImpl), head);
  assert.equal(await hv.askServer(EXEC(2), fetchImpl), '');
  assert.equal(await hv.askServer(EXEC(9), fetchImpl), '');
  assert.equal(await hv.askServer(EXEC(1), async () => reply({ ok: true, data: { lib: { commit: '../../etc' } } })), '', 'bukan sha 40 huruf');
  const prevFile = path.join(require('os').tmpdir(), 'xnk-prev-' + process.pid + '.json');
  fs.writeFileSync(prevFile, JSON.stringify({ 'claudia-2': { commit: head }, claudia: { commit: 'jelek' } }));
  const r = await hv.resolve(CFG, repo, { fetch: fetchImpl, previous: prevFile });
  assert.deepEqual(r.versions.claudia, { commit: head, source: 'server' }, 'commit = checkout ini: tanpa worktree');
  assert.deepEqual(r.versions['claudia-2'], { commit: head, source: 'sebelumnya' });
  const none = await hv.resolve(CFG, repo, { fetch: fetchImpl });
  assert.ok(!none.versions['claudia-2'] && none.notes.some(n => /claudia-2.*kode terbaru/.test(n)));
  fs.rmSync(prevFile, { force: true });
});

test('hub-verify (T-2221): build asli lolos; berkas yang rusak atau salah sambung ditolak sebelum tayang', () => {
  const { verifySite } = require('../tools/hub-verify');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-'));
  hub.write(dir, hub.build(CFG).files);
  assert.deepEqual(verifySite(dir, CFG), []);
  const edit = (rel, fn) => fs.writeFileSync(path.join(dir, rel), fn(fs.readFileSync(path.join(dir, rel), 'utf8')));
  // /exec coach lain di config claudia, awalan penyimpanan hilang di portal, cache worker tertukar.
  edit('claudia/config.js', t => t.split(EXEC(1)).join(EXEC(2)));
  edit('claudia-2/klien/index.html', t => t.replace("'claudia-2:'", "'x:'"));
  edit('claudia/sw-app.js', t => t.replace('xnk-page-claudia~panel~', 'xnk-page-claudia-'));
  fs.rmSync(path.join(dir, 'claudia-2', 'lib-latest.json'));
  const p = verifySite(dir, CFG).join('\n');
  assert.match(p, /claudia \(panel\): config\.js tidak memanggil/);
  assert.match(p, /claudia\/config\.js memuat \/exec coach lain/);
  assert.match(p, /claudia-2 \(klien\): awalan penyimpanan/);
  assert.match(p, /claudia \(panel\): awalan cache/);
  assert.match(p, /claudia-2: lib-latest\.json/);
  fs.rmSync(path.join(dir, 'index.html'));
  assert.match(verifySite(dir, CFG).join('\n'), /index\.html tidak ada/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pustaka sendiri (T-2222): gerakan, makanan, peta otot di /_lib/; halaman coach tidak memuatnya dari xnk.my.id', () => {
  const { files } = hub.build(CFG);
  for (const f of ['_lib/exercises/exercises.min.json', '_lib/foods/foods.min.json', '_lib/figure/figure.min.json', '_lib/figure/rig.min.json', '_lib/figure/CREDITS.md']) assert.ok(f in files, f);
  const coach = Object.keys(files).filter(n => /^claudia(-2)?\//.test(n) && typeof files[n] === 'string');
  assert.ok(coach.every(n => !/https:\/\/xnk\.my\.id\/(exercises|foods|figure)\//.test(files[n])), 'tidak ada pustaka dari xnk.my.id');
  assert.ok(coach.some(n => files[n].includes('/_lib/exercises/exercises.min.json')), 'halaman memakai /_lib/');
  assert.match(files['claudia/sw-app.js'], /var LIBS = \[self\.location\.origin \+ '\/_lib\/exercises\/exercises\.min\.json'/, 'worker tetap mencocokkan alamat lengkap');
  new Function('self', files['claudia/sw-app.js'].match(/var LIBS = [\s\S]*?\];/)[0] + 'return LIBS;');   // tetap JavaScript yang sah
  assert.ok(!('_lib/exercises/exercises.min.json' in hub.build({ coaches: [] }).files), 'tanpa coach tidak perlu pustaka');
});

test('CSP (T-2223): halaman coach terkunci sumber skrip dan tujuan data; halaman depan dan 404 hanya skrip bersidik; tanpa Analytics XNK', () => {
  const crypto = require('crypto');
  const { files } = hub.build(CFG);
  for (const d of ['claudia/', 'claudia/klien/', 'claudia-2/']) {
    const html = files[d + 'index.html'];
    const head = html.slice(html.indexOf('<head>'));
    assert.ok(head.startsWith('<head>\n<meta http-equiv="Content-Security-Policy"'), d + ': CSP paling awal');
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), d + ': CSP sebelum skrip apa pun');
    assert.ok(!/googletagmanager|G-93SRTYH3SG/.test(html), d + ': tanpa Google Analytics xnk.my.id');
  }
  for (const want of ["object-src 'none'", "base-uri 'none'", "frame-src 'none'", 'connect-src \'self\' data: blob: https://script.google.com']) assert.ok(hub.CSP_APP.includes(want), want);
  assert.ok(!/connect-src[^;]*(\*|https:)(;|\s|$)/.test(hub.CSP_APP), 'connect-src tanpa wildcard: data tidak bisa dikirim ke sembarang host');
  for (const f of ['index.html', '404.html']) {
    const html = files[f];
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(m, f);
    assert.ok(!m[1].includes('unsafe-inline') || !/script-src[^;]*unsafe-inline/.test(m[1]), f + ': skrip tanpa unsafe-inline');
    for (const [, body] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      assert.ok(m[1].includes(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`), f + ': sidik skrip inline cocok');
    }
  }
});

test('adminxnk (T-2234): halaman statis tanpa data, alamat XNK HQ dari hub.json, CSP ketat + Apps Script, nama di-escape', () => {
  const crypto = require('crypto');
  const PUSAT = 'https://script.google.com/macros/s/AKfycbPUSAT0000000000000000000/exec';
  assert.throws(() => hub.readHub({ pusatUrl: 'https://contoh.id/exec', coaches: [] }), /pusatUrl/);
  assert.throws(() => hub.readHub({ pusatUrl: EXEC(1), coaches: [{ slug: 'claudia', brand: 'C', exec: EXEC(1) }] }), /tidak boleh sama/);
  const cfg = Object.assign({}, CFG, { pusatUrl: PUSAT, coaches: [CFG.coaches[0], { slug: 'evil', brand: '</script><img src=x onerror=alert(1)>', exec: EXEC(3) }] });
  const html = hub.build(cfg).files['adminxnk/index.html'];
  assert.ok(html.includes(`var PUSAT = ${JSON.stringify(PUSAT)};`));
  assert.ok(!html.includes('</script><img'), 'nama usaha tidak bisa menutup <script>');
  assert.ok(!/\son[a-z]+="/.test(html), 'tanpa onclick');
  const csp = html.match(/content="([^"]+)"/)[1];
  assert.match(csp, /connect-src 'self' https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com/);
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp));
  for (const [, body] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.ok(csp.includes(crypto.createHash('sha256').update(body).digest('base64')));
  assert.match(html, /noindex/);
  assert.match(html, /<title>XNK HQ<\/title>/);
  assert.ok(!/window\.(confirm|prompt)\(/.test(html), 'dialog sendiri, bukan window.confirm / prompt');
  assert.ok(hub.build(CFG).files['adminxnk/index.html'].includes('var PUSAT = "";'), 'tanpa pusatUrl: halaman memberi tahu, tidak memanggil apa pun');
});

test('workflow Coach XNK: satu secret per job (secrets[matrix.secret]), tidak pernah toJSON(secrets)', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const files = [path.join(__dirname, '..', 'hub-repo', '.github', 'workflows', 'coach.yml')]
    .concat(fs.readdirSync(path.join(root, '.github', 'workflows')).map(f => path.join(root, '.github', 'workflows', f)));
  for (const f of files) assert.ok(!/toJSON\(\s*secrets\s*\)/.test(fs.readFileSync(f, 'utf8')), f + ': GitHub menandai pengiriman semua secret sebagai berbahaya');
  const y = fs.readFileSync(files[0], 'utf8');
  assert.match(y, /CLASP_RC: \$\{\{ secrets\[matrix\.secret\] \}\}/);
  assert.match(y, /max-parallel: 1/);
  assert.match(y, /fail-fast: true/);
});
