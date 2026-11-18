'use strict';
// T-2241 (halaman info /<slug>/info/) dan T-2242 (warna aksen + logo per coach di hub.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const hub = require('../tools/build-hub');
const hubEdit = require('../tools/hub-edit');

const EXEC = n => `https://script.google.com/macros/s/AKfycbHUBTEST${String(n).padStart(12, '0')}abcdef/exec`;
const ROOT = path.join(__dirname, '..', '..', '..');

/** PNG w×h satu warna (berkas asli, bisa dibaca browser). */
function png(w, h) {
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([29, 78, 216], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** Kepala WebP VP8X (cukup untuk magic bytes dan ukuran). */
function webp(w, h) {
  const b = Buffer.alloc(30); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(22, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b;
}

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-hubrepo-'));
  fs.mkdirSync(path.join(dir, 'logo'));
  fs.writeFileSync(path.join(dir, 'logo', 'claudia.png'), png(64, 64));
  fs.writeFileSync(path.join(dir, 'logo', 'dua.webp'), webp(512, 512));
  return dir;
}
const CFG = () => ({ coaches: [
  { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1), accent: 'biru', logo: 'logo/claudia.png' },
  { slug: 'claudia-2', brand: 'Claudia Dua', exec: EXEC(2), accent: 'hijau', logo: 'logo/dua.webp' },
  { slug: 'polos', brand: 'Gym Polos', exec: EXEC(3) },
] });

test('ACCENTS sama dengan warna portal Fase X (Theme part) dan PF_ACCENTS server', () => {
  const css = fs.readFileSync(path.join(ROOT, 'apps-script/pt-scheduler/parts/theme/05-portal-x.part'), 'utf8');
  for (const [k, v] of Object.entries(hub.ACCENTS)) {
    assert.ok(css.includes(`html[data-accent="${k}"] { --accent: ${v[0]}; --on-accent: ${v[1]}; --accent-on-ink: ${v[4]}; }`), k + ' terang');
    assert.ok(css.includes(`html[data-theme="dark"][data-accent="${k}"] { --accent: ${v[2]}; --on-accent: ${v[3]}; }`), k + ' gelap');
  }
  const prof = fs.readFileSync(path.join(ROOT, 'apps-script/pt-scheduler/src/Profil.gs'), 'utf8');
  assert.deepEqual(JSON.parse(prof.match(/const PF_ACCENTS = (\[[^\]]+\]);/)[1].replace(/'/g, '"')), hub.ACCENT_NAMES);
});

test('accent dan logo: galat berbahasa Indonesia sebelum apa pun dibangun', () => {
  const dir = repo();
  const one = extra => ({ coaches: [Object.assign({ slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1) }, extra)] });
  const bad = (extra, re) => assert.throws(() => hub.readHub(one(extra), { baseDir: dir }), re);
  bad({ accent: 'merah' }, /warna "merah" tidak dikenal; pilih hitam, biru, .*atau oranye/);
  assert.equal(hub.readHub(one({ accent: 'hitam' }), { baseDir: dir }).coaches[0].accent, undefined, 'hitam = tanpa aksen');
  assert.equal(hub.readHub(one({ accent: ' Biru ' }), { baseDir: dir }).coaches[0].accent, 'biru');
  bad({ logo: 'logo/tidak-ada.png' }, /tidak ditemukan di repo hub/);
  bad({ logo: '../luar.png' }, /tidak valid/);
  bad({ logo: '/etc/logo.png' }, /tidak valid/);
  fs.writeFileSync(path.join(dir, 'logo', 'x.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  bad({ logo: 'logo/x.svg' }, /SVG tidak boleh/);
  fs.writeFileSync(path.join(dir, 'logo', 'svg.png'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  bad({ logo: 'logo/svg.png' }, /berisi teks\/SVG/);
  fs.writeFileSync(path.join(dir, 'logo', 'salah.jpg'), png(8, 8));
  bad({ logo: 'logo/salah.jpg' }, /isi berkas PNG, tetapi namanya \.jpg/);
  fs.writeFileSync(path.join(dir, 'logo', 'rusak.png'), Buffer.from('bukan gambar sama sekali'));
  bad({ logo: 'logo/rusak.png' }, /bukan gambar PNG, JPEG atau WebP/);
  fs.writeFileSync(path.join(dir, 'logo', 'besar.png'), Buffer.concat([png(8, 8), Buffer.alloc(hub.LOGO_MAX)]));
  bad({ logo: 'logo/besar.png' }, /terlalu besar .*maksimal 200 KB/);
  bad({ logo: 'logo/claudia.gif' }, /\.png, \.jpg, \.jpeg atau \.webp/);
  const ok = hub.readHub(one({ logo: 'logo/dua.webp' }), { baseDir: dir }).coaches[0];
  assert.deepEqual([ok.logoFile.ext, ok.logoFile.type, ok.logoFile.size], ['webp', 'image/webp', [512, 512]]);
  assert.deepEqual(hub.imageSize(png(64, 32), 'png'), [64, 32]);
  assert.equal(hub.imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('warna + logo di panel, portal, manifest, favicon, service worker; coach tanpa isian tidak berubah', () => {
  const dir = repo();
  const { files } = hub.build(CFG(), { baseDir: dir });
  const plain = hub.build({ coaches: [{ slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1) }] }).files;
  for (const d of ['claudia/', 'claudia/klien/']) {
    const html = files[d + 'index.html'];
    assert.match(html, /<html lang="id" data-accent="biru" data-brand-accent="biru">/, d);
    assert.ok(html.includes('<link rel="icon" href="/claudia/logo.png" type="image/png">') && !html.includes('icon.svg" type="image/svg+xml"'), d + ' favicon = logo');
    assert.ok(html.includes('<link rel="apple-touch-icon" href="/claudia/logo.png">'), d);
    assert.match(html, /\.logo-mark\{background:url\("\/claudia\/logo\.png"\)/, d + ' logo menggantikan tanda XNK');
    assert.ok(html.indexOf('http-equiv="Content-Security-Policy"') < html.indexOf('<script'), d + ' CSP tetap baris pertama');
    const man = JSON.parse(files[d + 'manifest.webmanifest']);
    assert.equal(man.start_url, '/' + d);
    assert.equal(man.scope, '/' + d);
    assert.deepEqual(man.icons[0], { src: '/claudia/logo.png', type: 'image/png', sizes: '64x64', purpose: 'any' });
    assert.equal(man.theme_color, hub.ACCENTS.biru[0]);
    assert.ok(html.includes(`<link rel="manifest" href="/${d}manifest.webmanifest">`), d);
    assert.match(files[d + 'sw-app.js'], /^var ASSETS = \[.*"\/claudia\/logo\.png"\];/m, d + ' logo ikut salinan offline');
    assert.notEqual(files[d + 'sw-app.js'].match(/var HASH = "(\w+)"/)[1], plain[d + 'sw-app.js'].match(/var HASH = "(\w+)"/)[1], d + ' HASH berubah');
  }
  assert.ok(Buffer.isBuffer(files['claudia/logo.png']) && Buffer.isBuffer(files['claudia-2/logo.webp']));
  assert.match(files['claudia-2/index.html'], /data-brand-accent="hijau"/);
  const p = files['polos/index.html'];
  assert.ok(!/data-accent|logo\.(png|webp)/.test(p), 'tanpa warna dan logo: tidak ada tambahan');
  assert.ok(p.includes('<link rel="icon" href="icon.svg" type="image/svg+xml">'));
  assert.equal(JSON.parse(files['polos/manifest.webmanifest']).icons[0].src, '/polos/icon.svg');
  // Kartu di halaman depan: logo, atau huruf di atas warna aksen; tautan ke halaman info.
  const land = files['index.html'];
  assert.match(land, /<a class="card coach" href="\/claudia\/info\/"><span class="av acc-biru logo" aria-hidden="true"><img src="\/claudia\/logo\.png"/);
  assert.match(land, /<a class="card coach" href="\/polos\/info\/"><span class="av" aria-hidden="true">G<\/span>/);
  assert.ok(land.includes('.coach .av.acc-biru {') && !land.includes('/*ACCENTS*/'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('halaman info per coach: data dari /exec coach itu, CSP ketat bersidik, tanpa xnk.my.id dan tanpa "XNK"', () => {
  const dir = repo();
  const { files } = hub.build(CFG(), { baseDir: dir });
  for (const [slug, exec, accent] of [['claudia', EXEC(1), 'biru'], ['claudia-2', EXEC(2), 'hijau'], ['polos', EXEC(3), '']]) {
    const t = files[slug + '/info/index.html'];
    assert.ok(t, slug);
    const csp = t.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    const hashes = [...t.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
    assert.ok(hashes.length >= 2 && hashes.every(h => csp.includes(h)), slug + ': setiap skrip inline bersidik di CSP');
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp) && !/\son[a-z]+="/.test(t), slug + ': tanpa skrip inline bebas');
    assert.equal(csp.match(/connect-src ([^;]+)/)[1], "'self' https://script.google.com https://script.googleusercontent.com");
    assert.ok(t.includes(JSON.stringify(exec)), slug + ': memanggil /exec sendiri');
    for (const o of [EXEC(1), EXEC(2), EXEC(3)].filter(e => e !== exec)) assert.ok(!t.includes(o), slug + ': tanpa /exec coach lain');
    assert.ok(!/xnk\.my\.id/.test(t), slug + ': tanpa xnk.my.id');
    assert.ok(!/XNK/.test(t), slug + ': tanpa tulisan XNK');
    for (const fn of ['getCoaches', 'getPriceListPublic', 'getOpenSlots']) assert.ok(t.includes(`'${fn}'`), fn);
    assert.ok(t.includes(`<link rel="canonical" href="https://xnk.web.id/${slug}/info/">`) && t.includes(`<meta property="og:url" content="https://xnk.web.id/${slug}/info/">`));
    assert.ok(t.includes(`href="/${slug}/klien/"`), 'tombol Daftar / Booking');
    assert.ok(accent ? t.includes(`<html lang="id" data-accent="${accent}">`) : t.includes('<html lang="id">'));
    assert.ok(!/__[A-Z_]+__|<!--(OGIMAGE|ICON|MARK)-->|\/\*ACCENTS\*\//.test(t), 'semua penanda terisi');
  }
  assert.ok(files['claudia/info/index.html'].includes('<meta property="og:image" content="https://xnk.web.id/claudia/logo.png">'));
  assert.ok(!files['polos/info/index.html'].includes('og:image'));
  assert.ok(files['claudia/info/index.html'].includes('<meta name="description" content="Claudia Fit: personal trainer.'));
  // Halaman info di luar jangkauan service worker panel: worker hanya menjawab navigasi ke scope-nya sendiri.
  assert.match(files['claudia/sw-app.js'], /page === SCOPE \|\| page === SCOPE \+ 'index\.html'/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('build-tenant lama (commit coach lama) tanpa penanda baru: build tetap jalan, tambahan dilewati', () => {
  const dir = repo();
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-old-'));
  const tools = path.join(fake, 'apps-script', 'xnk-library', 'tools');
  fs.mkdirSync(tools, { recursive: true });
  // "Commit lama": halaman tanpa <html lang="id">, tanpa favicon icon.svg, tanpa baris ASSETS.
  fs.writeFileSync(path.join(tools, 'build-tenant.js'), `const real = require(${JSON.stringify(require.resolve('../tools/build-tenant'))});
module.exports = Object.assign({}, real, { build(c, o) { const r = real.build(c, o);
  for (const d of ['', 'klien/']) { r.files[d + 'index.html'] = r.files[d + 'index.html'].replace('<html lang="id">', '<html>').replace(/<link rel="icon"[^>]*>/, '');
    r.files[d + 'sw-app.js'] = r.files[d + 'sw-app.js'].replace(/^var ASSETS = .*$/m, 'var ASSETS = OLD;'); }
  r.hash = 'oldhash00000'; return r; } });`);
  const { files } = hub.build(CFG(), { baseDir: dir, versions: { claudia: { commit: 'b'.repeat(40), dir: fake } } });
  const html = files['claudia/index.html'];
  assert.ok(!html.includes('data-accent') && html.startsWith('<!DOCTYPE html>\n<html>'), 'tanpa <html lang="id">: warna dilewati');
  assert.ok(html.includes('.logo-mark{background:url("/claudia/logo.png")'), 'logo tetap lewat CSS');
  assert.match(files['claudia/sw-app.js'], /^var ASSETS = OLD;/m);
  assert.ok(files['claudia/info/index.html'] && files['claudia/manifest.webmanifest']);
  assert.match(files['claudia-2/index.html'], /data-accent="hijau"/, 'coach lain memakai kode terbaru');
  fs.rmSync(fake, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hub-verify: halaman info dan logo diperiksa', () => {
  const { verifySite } = require('../tools/hub-verify');
  const dir = repo();
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-site-'));
  hub.write(site, hub.build(CFG(), { baseDir: dir }).files);
  assert.deepEqual(verifySite(site, CFG(), { baseDir: dir }), []);
  fs.rmSync(path.join(site, 'claudia', 'info', 'index.html'));
  fs.rmSync(path.join(site, 'claudia-2', 'logo.webp'));
  const p = verifySite(site, CFG(), { baseDir: dir }).join('\n');
  assert.match(p, /claudia: halaman info/);
  assert.match(p, /claudia-2: logo\.webp tidak ada/);
  fs.rmSync(site, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hub-edit: warna dan logo; kosong = tetap, hitam = hapus warna, "-" = hapus logo; nama dan link boleh kosong untuk coach lama', () => {
  const dir = repo();
  const o = { baseDir: dir };
  let cfg = hubEdit.edit({ coaches: [] }, 'simpan', { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1), accent: 'biru', logo: 'logo/claudia.png' }, o).cfg;
  assert.deepEqual(cfg.coaches[0], { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1), accent: 'biru', logo: 'logo/claudia.png' });
  cfg = hubEdit.edit(cfg, 'simpan', { slug: 'claudia', accent: 'ungu' }, o).cfg;
  assert.deepEqual(cfg.coaches[0], { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1), accent: 'ungu', logo: 'logo/claudia.png' }, 'hanya warna berubah');
  cfg = hubEdit.edit(cfg, 'simpan', { slug: 'claudia', accent: 'tetap', logo: '' }, o).cfg;
  assert.equal(cfg.coaches[0].accent, 'ungu');
  cfg = hubEdit.edit(cfg, 'simpan', { slug: 'claudia', accent: 'hitam', logo: '-' }, o).cfg;
  assert.deepEqual(cfg.coaches[0], { slug: 'claudia', brand: 'Claudia Fit', exec: EXEC(1) });
  assert.throws(() => hubEdit.edit(cfg, 'simpan', { slug: 'claudia', accent: 'merah' }, o), /warna "merah" tidak dikenal/);
  assert.throws(() => hubEdit.edit(cfg, 'simpan', { slug: 'claudia', logo: 'logo/tidak.png' }, o), /tidak ditemukan/);
  assert.throws(() => hubEdit.edit(cfg, 'simpan', { slug: 'baru', accent: 'biru' }, o), /Nama usaha wajib/);
  fs.rmSync(dir, { recursive: true, force: true });
});
