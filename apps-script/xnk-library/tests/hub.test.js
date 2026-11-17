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
  assert.deepEqual(Object.keys(empty).filter(n => !n.startsWith('img/')).sort(), ['.nojekyll', '404.html', 'index.html']);
  assert.ok(Buffer.isBuffer(empty['img/og.jpg']) && empty['img/og.jpg'].length > 1000, 'gambar landing ikut dibangun');
});

test('landing: daftar coach dari hub.json, nama di-escape, gambar yang dirujuk ada', () => {
  const { files } = hub.build(CFG);
  const html = files['index.html'];
  assert.match(html, /href="\/claudia\/klien\/"[\s\S]*Claudia Fit/);
  assert.match(html, /href="\/claudia-2\/klien\/"/);
  assert.ok(!html.includes('<!--COACHES-->') && !html.includes('<!--CONTACT-->'));
  assert.equal(html.split('Hubungi XNK').length - 1, 2, 'kontak di hero dan di penutup');
  for (const m of html.matchAll(/(?:src|content)="(?:https:\/\/xnk\.web\.id\/)?(img\/[^"]+)"/g)) assert.ok(m[1] in files, m[1]);
  // Form masuk tetap sama (hub-check dan link lama bergantung padanya).
  for (const id of ['id="f"', 'id="slug"', 'id="err"', 'data-to="klien"', 'data-to="panel"', '<title>XNK</title>']) assert.ok(html.includes(id), id);
  const evil = hub.build({ coaches: [{ slug: 'evil', brand: '<img src=x onerror=alert(1)>', exec: EXEC(3) }] }).files['index.html'];
  assert.ok(!evil.includes('<img src=x') && evil.includes('&lt;img src=x'), 'nama usaha di-escape');
  const none = hub.build({ coaches: [] }).files['index.html'];
  assert.ok(!none.includes('data-coaches') && !none.includes('href="#coach"'), 'tanpa coach, bagian dan tautannya hilang');
  assert.match(hub.slugError('img'), /dipakai sistem/);
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
