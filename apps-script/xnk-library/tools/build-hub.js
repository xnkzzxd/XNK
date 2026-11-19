'use strict';
// Membangun situs hub xnk.web.id: satu situs, banyak coach.
//   node apps-script/xnk-library/tools/build-hub.js <outDir> --config hub.json
// hub.json: { "contactUrl": "https://wa.me/…" (opsional), "coaches": [ { "slug": "claudia", "brand": "Claudia Fit", "exec": "https://script.google.com/macros/s/…/exec" } ] }
// Hasil:
//   /index.html, /404.html, /img/    landing XNK (hub-site/; gambar dari tools/hub-shots.js)
//   /<slug>/                         panel coach (PIN)
//   /<slug>/klien/                   portal klien
//   /<alias>/, /<alias>/klien/, /<alias>/info/   T-2243: slug lama coach yang ganti nama → halaman pengalih ke slug baru
//   coach dengan "inactive": true (T-2252, coach keluar): /<slug>/, /<slug>/klien/, /<slug>/info/ = halaman kecil
//   "Situs coach ini tidak aktif lagi" (CSP ketat, noindex, tanpa aplikasi) + worker pembersih di alamat worker lama
// Setiap coach memakai halaman yang sama dengan xnk.my.id (build-tenant.js → build-static.js produksi), memanggil
// /exec miliknya sendiri. Karena semua coach satu domain, setiap halaman diberi awalan penyimpanan per slug
// (hub-site/storage-prefix.js, inline) dan service worker diberi awalan cache yang tidak bisa saling menghapus.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tenant = require('./build-tenant');

const HERE = path.join(__dirname, '..');
const SITE = path.join(HERE, 'hub-site');

// Kata yang dipakai sistem atau mudah menipu; dan nama berkas di akar situs.
const RESERVED = ['_hub', '_lib', '_app', 'adminxnk', 'admin', 'api', 'app', 'klien', 'demo', 'l', 'login', 'daftar', 'masuk', 'assets', 'static', 'www', 'xnk', 'hub',
  'index', '404', 'cname', 'img', 'coach', 'coaches', 'support', 'help', 'bantuan', 'legacy', 'next'];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
// T-2243: nama secret clasp coach (CLASP_<SLUG>); disimpan di hub.json saat slug diganti supaya secret lama tetap dipakai.
const SECRET_RE = /^CLASP_[A-Z0-9_]{3,40}$/;
const HUB_ORIGIN = 'https://xnk.web.id';
// T-2242: warna aksen coach = tujuh pilihan portal Fase X (pt-scheduler/parts/theme/05-portal-x.part; 'hitam' = tanpa).
// Nilai disalin dari sana (dicek tests/hub.test.js): [terang --accent, --on-accent, gelap --accent, --on-accent, --accent-on-ink].
const ACCENTS = {
  biru: ['#1d4ed8', '#ffffff', '#60a5fa', '#0b0b0b', '#60a5fa'],
  hijau: ['#15803d', '#ffffff', '#4ade80', '#0b0b0b', '#4ade80'],
  toska: ['#0f766e', '#ffffff', '#2dd4bf', '#0b0b0b', '#2dd4bf'],
  ungu: ['#6d28d9', '#ffffff', '#a78bfa', '#0b0b0b', '#a78bfa'],
  pink: ['#be185d', '#ffffff', '#f472b6', '#0b0b0b', '#f472b6'],
  oranye: ['#c2410c', '#ffffff', '#fb923c', '#0b0b0b', '#fb923c'],
};
const ACCENT_NAMES = ['hitam'].concat(Object.keys(ACCENTS));
const LOGO_MAX = 200 * 1024;
const LOGO_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Pesan galat (Indonesia) untuk satu slug, atau '' bila boleh dipakai. */
function slugError(slug) {
  const s = String(slug == null ? '' : slug);
  if (!SLUG_RE.test(s) || /--/.test(s)) return `Slug "${s}" tidak valid: huruf kecil, angka dan tanda hubung, 3 sampai 30 karakter, tanpa spasi, tidak diawali atau diakhiri tanda hubung.`;
  if (RESERVED.includes(s)) return `Slug "${s}" dipakai sistem; pilih nama lain.`;
  return '';
}

/** Jenis gambar dari isi berkas (bukan dari nama): 'png' | 'jpeg' | 'webp' | ''. */
function imageKind(b) {
  if (b.length >= 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return '';
}

/** Lebar × tinggi dari kepala berkas (untuk "sizes" di manifest); null bila tidak terbaca. */
function imageSize(b, kind) {
  try {
    if (kind === 'png') return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (kind === 'webp') {
      const f = b.toString('latin1', 12, 16);
      if (f === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
      if (f === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
      if (f === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    }
    if (kind === 'jpeg') {
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (e) {}
  return null;
}

// T-2258: tempat latihan coach (publik): satu nama tempat + kota, tampil di halaman depan hub dan halaman info.
const PLACE_MAX = { name: 60, city: 40 };
/**
 * Rapikan { name, city } (spasi dirapatkan). Kembalikan { place } (null = tanpa tempat) atau { error } (pesan Indonesia).
 * Sama dengan cleanPlace_ di xnk-pusat/src/Pusat.gs (dicek tests).
 */
function cleanPlace(p) {
  if (p == null || p === '') return { place: null };
  if (typeof p !== 'object' || Array.isArray(p)) return { error: 'place harus berisi { "name": nama tempat, "city": kota }.' };
  const t = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const name = t(p.name), city = t(p.city);
  if (!name && !city) return { place: null };
  for (const [k, v, label] of [['name', name, 'Nama tempat'], ['city', city, 'Kota']]) {
    if (/[\u0000-\u001f\u007f<>]/.test(v)) return { error: `${label} tidak boleh berisi tanda < > atau karakter kontrol.` };
    if (v.length > PLACE_MAX[k]) return { error: `${label} paling panjang ${PLACE_MAX[k]} karakter.` };
  }
  if (!name || !city) return { error: "Isi nama tempat dan kota (mis. Gold's Gym Kemang, Jakarta Selatan)." };
  return { place: { name, city } };
}

/** T-2242: periksa logo coach (berkas di repo hub). Kembalikan { ext, type, body, size, sig }. */
function readLogo(rel, baseDir, slug) {
  const where = `hub.json, "${slug}": logo "${rel}"`;
  if (!/^[A-Za-z0-9._\/-]{1,120}$/.test(rel) || /\\/.test(rel) || rel.startsWith('/') || rel.split('/').some(x => x === '..' || x === '.' || x === ''))
    throw new Error(`${where} tidak valid: tulis jalur berkas di repo hub, mis. logo/${slug}.png (huruf, angka, titik, tanda hubung, garis miring; tanpa "..").`);
  const ext = (rel.match(/\.([a-z]+)$/i) || ['', ''])[1].toLowerCase();
  if (ext === 'svg') throw new Error(`${where}: SVG tidak boleh dipakai (bisa berisi skrip). Pakai PNG, JPEG atau WebP.`);
  if (!LOGO_TYPES[ext]) throw new Error(`${where}: jenis berkas harus .png, .jpg, .jpeg atau .webp.`);
  const file = path.join(baseDir, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`${where} tidak ditemukan di repo hub. Unggah dulu berkasnya (Add file → Upload files), lalu jalankan lagi.`);
  const body = fs.readFileSync(file);
  if (body.length > LOGO_MAX) throw new Error(`${where} terlalu besar (${Math.ceil(body.length / 1024)} KB); maksimal 200 KB. Perkecil gambarnya dulu.`);
  const kind = imageKind(body);
  if (/^\s*</.test(body.toString('latin1', 0, 64))) throw new Error(`${where} berisi teks/SVG, bukan gambar. Pakai PNG, JPEG atau WebP.`);
  if (!kind) throw new Error(`${where} bukan gambar PNG, JPEG atau WebP yang utuh.`);
  if (LOGO_TYPES[ext] !== LOGO_TYPES[kind === 'jpeg' ? 'jpg' : kind]) throw new Error(`${where}: isi berkas ${kind.toUpperCase()}, tetapi namanya .${ext}. Samakan nama dengan jenisnya.`);
  return { ext: kind === 'jpeg' ? 'jpg' : kind, type: LOGO_TYPES[ext], body, size: imageSize(body, kind), sig: crypto.createHash('sha256').update(body).digest('hex').slice(0, 10) };
}

/**
 * Periksa hub.json; lempar galat Indonesia pertama yang ditemukan.
 * opts.baseDir = folder repo hub (tempat hub.json), untuk berkas logo; bawaan = folder kerja.
 */
function readHub(cfg, opts) {
  const baseDir = (opts && opts.baseDir) || process.cwd();
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.coaches)) throw new Error('hub.json: "coaches" harus berupa daftar.');
  const contact = String(cfg.contactUrl || '').trim();
  if (contact && !/^https:\/\/[^\s'"<>\\]+$/.test(contact)) throw new Error('hub.json: "contactUrl" harus link https:// tanpa spasi.');
  // T-2234: link /exec XNK Pusat untuk xnk.web.id/adminxnk (bukan rahasia; login tetap PIN pemilik).
  const pusat = String(cfg.pusatUrl || '').trim();
  if (pusat && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(pusat)) throw new Error('hub.json: "pusatUrl" harus link /exec Apps Script XNK Pusat.');
  // T-2240: kunci publik VAPID seluruh hub (satu origin = satu pasang kunci); kunci privat hanya di secret repo hub.
  const vapid = String(cfg.vapidPublic == null ? '' : cfg.vapidPublic).trim();
  if (vapid && !VAPID_RE.test(vapid)) throw new Error('hub.json: "vapidPublic" harus kunci publik VAPID (base64url, 87 karakter, diawali B). Jalankan workflow Push XNK aksi "kunci".');
  const seen = new Set();
  const coaches = cfg.coaches.map((c, i) => {
    const slug = String(c && c.slug || '').trim();
    const err = slugError(slug);
    if (err) throw new Error(`hub.json, coach ke-${i + 1}: ${err}`);
    if (seen.has(slug)) throw new Error(`hub.json: slug "${slug}" dipakai dua kali.`);
    seen.add(slug);
    let conf;
    try { conf = tenant.readConfig({ exec: c.exec, brand: c.brand }); } catch (e) { throw new Error(`hub.json, "${slug}": ${e.message.replace(/^config\.json: /, '')}`); }
    // T-2230: ID proyek Apps Script dan deployment coach (bukan rahasia) untuk workflow "Coach XNK" (coach-ops.js).
    const out = { slug, brand: conf.brand, exec: conf.exec };
    for (const k of ['scriptId', 'deploymentId']) {
      if (c[k] == null || c[k] === '') continue;
      if (!/^[A-Za-z0-9_-]{20,120}$/.test(String(c[k]))) throw new Error(`hub.json, "${slug}": ${k} tidak valid.`);
      out[k] = String(c[k]);
    }
    if (out.deploymentId && !conf.exec.includes('/s/' + out.deploymentId + '/exec')) throw new Error(`hub.json, "${slug}": deploymentId tidak cocok dengan link /exec.`);
    // T-2242: warna aksen dan logo (keduanya boleh kosong).
    const accent = String(c.accent == null ? '' : c.accent).trim().toLowerCase();
    if (accent && !ACCENT_NAMES.includes(accent)) throw new Error(`hub.json, "${slug}": warna "${accent}" tidak dikenal; pilih ${ACCENT_NAMES.slice(0, -1).join(', ')}, atau ${ACCENT_NAMES[ACCENT_NAMES.length - 1]}.`);
    if (accent && accent !== 'hitam') out.accent = accent;
    const logo = String(c.logo == null ? '' : c.logo).trim();
    if (logo) { out.logo = logo; out.logoFile = readLogo(logo, baseDir, slug); }
    const pl = cleanPlace(c.place);
    if (pl.error) throw new Error(`hub.json, "${slug}": ${pl.error}`);
    if (pl.place) out.place = pl.place;
    // T-2243: slug lama (alamat yang masih dialihkan), awalan penyimpanan (tetap saat slug diganti) dan secret clasp.
    if (c.aliases != null && !Array.isArray(c.aliases)) throw new Error(`hub.json, "${slug}": aliases harus berupa daftar slug lama.`);
    const aliases = (c.aliases || []).map(a => String(a == null ? '' : a).trim());
    for (const a of aliases) {
      const e = slugError(a);
      if (e) throw new Error(`hub.json, "${slug}": alamat lama ${e.charAt(0).toLowerCase() + e.slice(1)}`);
      if (a === slug) throw new Error(`hub.json, "${slug}": alamat lama tidak boleh sama dengan slug-nya sendiri.`);
    }
    if (aliases.length) out.aliases = aliases;
    const store = c.storageSlug == null || c.storageSlug === '' ? slug : String(c.storageSlug).trim();
    if (!SLUG_RE.test(store) || /--/.test(store)) throw new Error(`hub.json, "${slug}": storageSlug "${store}" tidak valid.`);
    out.storageSlug = store;
    if (c.secret != null && c.secret !== '') {
      if (!SECRET_RE.test(String(c.secret))) throw new Error(`hub.json, "${slug}": secret harus nama secret repo hub berbentuk CLASP_NAMA (huruf besar, angka, garis bawah).`);
      out.secret = String(c.secret);
    }
    // T-2252: coach keluar = situs tidak aktif (halaman pemberitahuan saja, tanpa aplikasi). Hanya true/false.
    if (c.inactive != null && c.inactive !== true && c.inactive !== false) throw new Error(`hub.json, "${slug}": inactive harus true atau false.`);
    if (c.inactive === true) out.inactive = true;
    return out;
  });
  // Satu nama di alamat hanya untuk satu tujuan: slug dan alamat lama semua coach tidak boleh bertabrakan.
  const owner = {};
  for (const c of coaches) {
    for (const n of [c.slug].concat(c.aliases || [])) {
      if (owner[n] != null) throw new Error(`hub.json: "${n}" dipakai dua kali (${owner[n] === c.slug ? 'coach "' + c.slug + '"' : 'coach "' + owner[n] + '" dan "' + c.slug + '"'}); slug dan alamat lama harus unik.`);
      owner[n] = c.slug;
    }
  }
  // Awalan penyimpanan dua coach tidak boleh sama: login dan salinan offline mereka akan bercampur.
  const stores = {};
  for (const c of coaches) {
    if (stores[c.storageSlug]) throw new Error(`hub.json: storageSlug "${c.storageSlug}" dipakai "${stores[c.storageSlug]}" dan "${c.slug}"; login klien kedua coach akan bercampur.`);
    stores[c.storageSlug] = c.slug;
  }
  const execs = coaches.map(c => c.exec);
  const dup = execs.find((e, i) => execs.indexOf(e) !== i);
  if (dup) throw new Error('hub.json: dua coach memakai link /exec yang sama; setiap coach harus punya spreadsheet sendiri.');
  if (pusat && execs.includes(pusat)) throw new Error('hub.json: "pusatUrl" tidak boleh sama dengan /exec coach.');
  return { contact, coaches, pusat, vapid };
}

const VAPID_RE = /^B[A-Za-z0-9_-]{86}$/;

/**
 * T-2252: berkas coach yang tidak aktif lagi (coach keluar). /<slug>/, /<slug>/klien/ dan /<slug>/info/ = halaman kecil
 * "Situs coach ini tidak aktif lagi" (CSP ketat bersidik, noindex, tanpa aplikasi dan tanpa /exec coach), dengan tombol
 * kontak pengelola (contactUrl) dan halaman depan. Skrip inline satu-satunya melepas service worker lama di cakupan coach
 * ini. /<slug>/sw-app.js dan /<slug>/klien/sw-app.js = worker pembersih (hub-site/inactive-sw.js): HP yang masih punya
 * worker aplikasi lama menggantinya, cache halaman coach dihapus, worker dilepas, jendela dimuat ulang.
 */
function inactiveFiles(c, contact) {
  const out = {};
  const tpl = fs.readFileSync(path.join(SITE, 'inactive-sw.js'), 'utf8');
  const btn = contact ? `<a class="btn" href="${esc(contact)}" rel="noopener">Hubungi pengelola XNK</a>` : '';
  // Lepas worker lama di cakupan /<slug>/ dan hapus cache halaman coach ini (awalan xnk-page-<storageSlug>~; "~" tidak ada
  // di slug, jadi cache coach lain yang namanya berawalan sama tidak ikut).
  const unreg = `try{navigator.serviceWorker&&navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){if(r.scope.indexOf(location.origin+${JSON.stringify('/' + c.slug + '/')})===0)r.unregister();});});}catch(e){}` +
    `try{window.caches&&caches.keys().then(function(ks){ks.forEach(function(k){if(k.indexOf(${JSON.stringify('xnk-page-' + c.storageSlug + '~')})===0)caches.delete(k);});});}catch(e){}`;
  const page = ['<!doctype html>', '<html lang="id">', '<head>',
    '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', '<meta name="robots" content="noindex">',
    `<title>${esc(c.brand)} · tidak aktif</title>`, '<link rel="icon" href="/img/logo-64.png">',
    '<style>:root{--bg:#fafaf9;--fg:#0b0b0b;--mut:#5f5f5b;--ink:#0b0b0b;--on-ink:#fff;--line:#e6e6e3}@media (prefers-color-scheme:dark){:root{--bg:#0b0b0b;--fg:#f5f5f3;--mut:#a3a39e;--ink:#f5f5f3;--on-ink:#0b0b0b;--line:#2a2a28}}' +
    'body{margin:0;background:var(--bg);color:var(--fg);font:1rem/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}main{max-width:30rem;margin:0 auto;padding:4rem 1rem calc(2rem + env(safe-area-inset-bottom))}' +
    'h1{font-size:1.6rem;line-height:1.25;margin:0 0 .75rem}p{color:var(--mut);margin:0 0 1.25rem}.who{color:var(--fg);font-weight:600;margin-bottom:.4rem;overflow-wrap:anywhere}' +
    '.acts{display:flex;flex-wrap:wrap;gap:.6rem}.btn{display:inline-flex;align-items:center;min-height:2.9rem;padding:.6rem 1.1rem;border-radius:.8rem;background:var(--ink);color:var(--on-ink);font-weight:600;text-decoration:none}' +
    '.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}</style>',
    `<script>${unreg}</script>`,
    '</head>', '<body>', '<main>',
    `<p class="who">${esc(c.brand)} · xnk.web.id/${esc(c.slug)}</p>`,
    '<h1>Situs coach ini tidak aktif lagi</h1>',
    '<p>Coach ini sudah tidak memakai XNK, jadi aplikasi booking, latihan dan progres di alamat ini tidak bisa dibuka lagi. Untuk pertanyaan tentang sesi atau data Anda, hubungi coach Anda langsung atau pengelola XNK.</p>',
    `<div class="acts">${btn}<a class="btn${btn ? ' ghost' : ''}" href="/?hub">Ke halaman depan XNK</a></div>`,
    '</main>', '</body>', '</html>', ''].join('\n');
  const html = cspStatic(page);
  for (const sub of ['', 'klien/', 'info/']) out[`${c.slug}/${sub}index.html`] = html;
  for (const [sub, kind] of [['', 'panel'], ['klien/', 'klien']]) {
    if (tpl.split('var PREFIX = __PREFIX__;').length !== 2) throw new Error('build-hub: baris "var PREFIX = __PREFIX__;" harus ada tepat sekali di inactive-sw.js');
    const sw = tpl.replace('var PREFIX = __PREFIX__;', 'var PREFIX = ' + JSON.stringify('xnk-page-' + c.storageSlug + '~' + kind + '~') + ';');
    if (/__[A-Z]+__/.test(sw)) throw new Error('build-hub: penanda tersisa di inactive-sw.js');
    out[`${c.slug}/${sub}sw-app.js`] = sw;
  }
  return out;
}

/**
 * T-2243: berkas untuk alamat lama coach yang ganti slug. Untuk setiap alias: halaman pengalih (CSP ketat, noindex,
 * location.replace dengan ?query dan #hash, cadangan <meta refresh>) di /<alias>/, /<alias>/klien/ dan /<alias>/info/,
 * worker pengganti (hub-site/alias-sw.js) di alamat worker lama, dan lib-latest.json (SITE_URL lama tetap terbaca).
 */
function aliasFiles(c, latestJson) {
  const out = {};
  const tpl = fs.readFileSync(path.join(SITE, 'alias-sw.js'), 'utf8');
  const icon = c.logoFile ? `/${c.slug}/logo.${c.logoFile.ext}` : '/img/icon-192.png';
  for (const a of c.aliases || []) {
    for (const sub of ['', 'klien/', 'info/']) {
      const to = `/${c.slug}/${sub}`;
      out[`${a}/${sub}index.html`] = cspStatic(['<!doctype html>', '<html lang="id">', '<head>',
        '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="robots" content="noindex">',
        `<meta http-equiv="refresh" content="1; url=${esc(to)}">`, `<link rel="canonical" href="${esc(HUB_ORIGIN + to)}">`, `<title>${esc(c.brand)}</title>`,
        `<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>`,
        '<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:48px 16px;text-align:center;color:#0b0b0b;background:#fafaf9}a{color:inherit}@media (prefers-color-scheme:dark){body{color:#f5f5f4;background:#0b0b0b}}</style>',
        '</head>', '<body>', `<p>Alamat ini sudah pindah ke <a href="${esc(to)}">xnk.web.id${esc(to)}</a>.</p>`, '</body>', '</html>', ''].join('\n'));
      if (sub === 'info/') continue;
      const sw = tpl.split('__TO__').join(JSON.stringify(to)).split('__ICON__').join(JSON.stringify(icon));
      if (/__[A-Z]+__/.test(sw.replace(/\/\*[\s\S]*?\*\//, ''))) throw new Error('build-hub: penanda tersisa di alias-sw.js');
      out[`${a}/${sub}sw-app.js`] = sw;
    }
    if (latestJson) out[`${a}/lib-latest.json`] = latestJson;
  }
  return out;
}

/**
 * T-2240: Web Push di halaman coach (kode versi mana pun). Push.gs mengirim url '/', yang di hub berarti halaman depan
 * xnk.web.id: worker lama diarahkan ke cakupannya sendiri (/<slug>/ atau /<slug>/klien/), dan ikon notifikasi memakai
 * logo coach (PNG/JPEG/WebP) atau ikon hub, karena /icon-192.png tidak ada di xnk.web.id. Penanda yang tidak ada dilewati.
 */
function pushPage(files, dir, c) {
  const f = dir + 'sw-app.js';
  if (typeof files[f] !== 'string') return;
  const icon = c.logoFile ? `/${c.slug}/logo.${c.logoFile.ext}` : '/img/icon-192.png';
  files[f] = files[f]
    .replace("icon: '/icon-192.png', badge: '/icon-192.png'", `icon: ${JSON.stringify(icon)}, badge: '/img/icon-192.png'`)
    .replace("var u = new URL((e.notification.data && e.notification.data.url) || '/', SCOPE);",
      "var raw = (e.notification.data && e.notification.data.url) || '/'; var u = new URL(raw === '/' ? SCOPE : raw, SCOPE);")
    .replace("if (list[i].url.indexOf(SCOPE) === 0 && 'focus' in list[i]) return list[i].focus();",
      "if (list[i].url.indexOf(SCOPE) === 0 && list[i].url.indexOf(SCOPE + 'klien/') !== 0 && 'focus' in list[i]) return list[i].focus();");
}

// T-2222: pustaka gerakan, makanan dan peta otot disajikan dari hub sendiri (/_lib/), bukan dari xnk.my.id, supaya
// situs coach tetap jalan bila xnk.my.id mati atau berubah. Diambil dari checkout XNK yang menjalankan build ini.
const REPO = path.join(HERE, '..', '..');
const LIB_DIRS = ['exercises', 'foods', 'figure'];
const LIB_FROM = /https:\/\/xnk\.my\.id\/(exercises|foods|figure)\//g;
const LIB_MARK = 'lib1';   // ikut sidik service worker: berkas yang ditulis ulang dimuat ulang di HP

/** Tulis ulang alamat pustaka xnk.my.id → /_lib/ di halaman satu coach. */
function localLibs(files, prefix) {
  for (const n of Object.keys(files)) {
    if (!n.startsWith(prefix) || !/\.(html|js|json)$/.test(n) || typeof files[n] !== 'string') continue;
    // Service worker membandingkan alamat lengkap (origin + path) dengan daftar LIBS-nya: tetap alamat penuh.
    if (/(^|\/)sw-app\.js$/.test(n)) files[n] = files[n].replace(/'https:\/\/xnk\.my\.id\/(exercises|foods|figure)\//g, "self.location.origin + '/_lib/$1/");
    files[n] = files[n].replace(LIB_FROM, '/_lib/$1/');
  }
}

/** Berkas pustaka untuk /_lib/ (json + kredit/lisensi). */
function libFiles() {
  const out = {};
  for (const d of LIB_DIRS) {
    const dir = path.join(REPO, d);
    if (!fs.existsSync(dir)) throw new Error('build-hub: folder pustaka ' + d + '/ tidak ada di checkout XNK.');
    for (const f of fs.readdirSync(dir)) if (/\.(json|md|txt)$/.test(f)) out['_lib/' + d + '/' + f] = fs.readFileSync(path.join(dir, f));
  }
  return out;
}

// T-2223: Content-Security-Policy. Semua coach berbagi satu domain, jadi skrip asing di satu halaman bisa membaca
// login coach lain. Halaman aplikasi memakai ratusan onclick="…" yang dibuat di JavaScript, jadi 'unsafe-inline'
// tetap perlu di sana; yang dikunci: dari mana skrip dimuat, ke mana data boleh dikirim (connect/img/form) dan
// tanpa <object>/<base>. Halaman depan dan 404 tidak memakai onclick: skripnya dikunci dengan sidik sha256.
const CSP_APP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://raw.githubusercontent.com https://drive.google.com https://*.googleusercontent.com",
  "media-src 'self' data: blob: https://raw.githubusercontent.com",
  "connect-src 'self' data: blob: https://script.google.com https://script.googleusercontent.com https://raw.githubusercontent.com",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

function cspMeta(policy) { return `<meta http-equiv="Content-Security-Policy" content="${policy}">`; }

/**
 * CSP ketat untuk halaman statis hub: hanya skrip inline yang sidiknya cocok.
 * extra: string = host connect tambahan (adminxnk → Apps Script), atau { connect, img } (halaman info coach).
 */
function cspStatic(html, extra) {
  const ex = typeof extra === 'string' ? { connect: extra } : (extra || {});
  const extraConnect = ex.connect;
  const hashes = [];
  html.replace(/<script>([\s\S]*?)<\/script>/g, (m, body) => { hashes.push(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`); return m; });
  if (/<script\s+[^>]*src=/i.test(html.replace(/<script\s+src="\/sw\.js"/g, ''))) throw new Error('build-hub: halaman hub memuat skrip luar; perbarui CSP di build-hub.js.');
  if (/\son[a-z]+="/i.test(html)) throw new Error('build-hub: halaman hub memakai onclick="…"; CSP ketatnya menolak itu.');
  const policy = ["default-src 'self'", `script-src 'self' ${hashes.join(' ')}`.trim(), "style-src 'self' 'unsafe-inline'", `img-src 'self' data:${ex.img ? ' ' + ex.img : ''}`,
    `connect-src 'self'${extraConnect ? ' ' + extraConnect : ''}`, "manifest-src 'self'", "worker-src 'self'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'self'"].join('; ');
  if (!/<head>\n/.test(html)) throw new Error('build-hub: <head> tidak ditemukan di halaman hub.');
  return html.replace('<head>\n', '<head>\n' + cspMeta(policy) + '\n');
}

/** Sisipkan penyimpanan per slug di awal <head> dan kunci service worker supaya hash dan awalan cache unik. */
function isolate(files, dir, slug, kind, extraSig) {
  const shim = fs.readFileSync(path.join(SITE, 'storage-prefix.js'), 'utf8').split('__SLUG__').join(slug);
  if (shim.includes('__SLUG__')) throw new Error('build-hub: __SLUG__ tersisa');
  const idx = dir + 'index.html';
  if (!/<head>\n/.test(files[idx])) throw new Error('build-hub: <head> tidak ditemukan di ' + idx);
  files[idx] = files[idx].replace('<head>\n', '<head>\n' + cspMeta(CSP_APP) + '\n<script>' + shim.replace(/\/\*[\s\S]*?\*\//, '').trim() + '</script>\n');
  const swf = dir + 'sw-app.js';
  let sw = files[swf];
  if (typeof sw !== 'string') throw new Error('build-hub: sw-app.js tidak ada di ' + dir);
  // Awalan cache bawaan diturunkan dari folder ("xnk-page-claudia-") dan bisa menjadi awalan cache coach lain
  // ("xnk-page-claudia-2-…"): worker yang aktif menghapus semua cache berawalan itu. "~" tidak boleh ada di slug.
  let n = 0;
  sw = sw.replace(/^var PREFIX = .*$/m, () => { n++; return `var PREFIX = ${JSON.stringify('xnk-page-' + slug + '~' + kind + '~')};`; });
  if (n !== 1) throw new Error('build-hub: baris PREFIX di sw-app.js tidak ditemukan; sesuaikan build-hub.js dengan tools/sw-app.template.js.');
  n = 0;
  sw = sw.replace(/^var HASH = "([0-9a-f]+)";$/m, (m, h) => { n++; return `var HASH = "${sha(h + shim + LIB_MARK + (extraSig || ''))}";`; });
  if (n !== 1) throw new Error('build-hub: baris HASH di sw-app.js tidak ditemukan.');
  files[swf] = sw;
}

/** CSS aksen untuk halaman hub (terang, gelap sistem, gelap pilihan), sama dengan Theme.html. */
function accentCss() {
  return Object.entries(ACCENTS).map(([k, v]) =>
    `html[data-accent="${k}"] { --accent: ${v[0]}; --on-accent: ${v[1]}; --accent-on-ink: ${v[4]}; }\n` +
    `  @media (prefers-color-scheme: dark) { html:not([data-theme="light"])[data-accent="${k}"] { --accent: ${v[2]}; --on-accent: ${v[3]}; } }\n` +
    `  html[data-theme="dark"][data-accent="${k}"] { --accent: ${v[2]}; --on-accent: ${v[3]}; }`).join('\n  ');
}

/** Sidik warna + logo: ikut HASH service worker, supaya HP memuat ulang halaman bila tampilannya berubah. */
function brandSig(c) { return (c.accent || '') + '|' + (c.logoFile ? c.logoFile.sig : ''); }

function manifestFor(c, start, kind) {
  const icons = c.logoFile
    ? [{ src: `/${c.slug}/logo.${c.logoFile.ext}`, type: c.logoFile.type, sizes: c.logoFile.size ? c.logoFile.size.join('x') : 'any', purpose: 'any' }]
    : [{ src: `/${c.slug}/icon.svg`, type: 'image/svg+xml', sizes: 'any', purpose: 'any' }];
  return JSON.stringify({ name: c.brand + (kind === 'panel' ? ' · Coach' : ''), short_name: c.brand.slice(0, 12), start_url: start, scope: start, display: 'standalone',
    background_color: '#fafaf9', theme_color: c.accent ? ACCENTS[c.accent][0] : '#0b0b0b', icons }, null, 1) + '\n';
}

/**
 * T-2242: warna aksen dan logo coach di halaman panel/portal yang sudah dibangun (versi kode mana pun). Penanda yang
 * tidak ada di halaman lama dilewati diam-diam: halaman tetap jalan, hanya tanpa tambahan itu.
 */
function brandPage(files, dir, c, kind) {
  const idx = dir + 'index.html';
  let html = files[idx];
  if (c.accent) html = html.replace(/<html lang="id">/, `<html lang="id" data-accent="${c.accent}" data-brand-accent="${c.accent}">`);
  const icon = c.logoFile ? `/${c.slug}/logo.${c.logoFile.ext}` : `/${c.slug}/icon.svg`;
  const head = [`<link rel="manifest" href="/${c.slug}/${dir.endsWith('klien/') ? 'klien/' : ''}manifest.webmanifest">`];
  if (c.logoFile) {
    html = html.replace(/<link rel="icon" href="(\.\.\/)?icon\.svg" type="image\/svg\+xml">/, `<link rel="icon" href="${icon}" type="${c.logoFile.type}">`);
    head.push(`<link rel="apple-touch-icon" href="${icon}">`);
    // Logo menggantikan tanda XNK (.logo-mark: layar masuk, sidebar, bar atas, layar pembuka, gambar layar masuk klien).
    head.push(`<style>.logo-mark{background:url("${icon}") center/cover no-repeat!important;-webkit-mask:none!important;mask:none!important;border-radius:22%}` +
      `.auth-logo:has(.logo-mark),.avatar:has(>.logo-mark){background:transparent!important;box-shadow:none!important}` +
      `.auth-logo>.logo-mark,.avatar>.logo-mark{width:100%!important;height:100%!important;border-radius:inherit}</style>`);
  }
  if (/<\/head>/.test(html)) html = html.replace('</head>', head.join('\n') + '\n</head>');
  files[idx] = html;
  files[dir + 'manifest.webmanifest'] = manifestFor(c, dir.endsWith('klien/') ? `/${c.slug}/klien/` : `/${c.slug}/`, kind);
  // Logo ikut salinan offline service worker (baris ASSETS ada sejak Fase AAA; tidak ketemu = dilewati).
  if (c.logoFile && typeof files[dir + 'sw-app.js'] === 'string') {
    files[dir + 'sw-app.js'] = files[dir + 'sw-app.js'].replace(/^var ASSETS = \[(.*)\];/m, (m, inner) => `var ASSETS = [${inner}${inner.trim() ? ', ' : ''}${JSON.stringify(icon)}];`);
  }
}

/** T-2241/T-2259: halaman publik /<slug>/info/ (profil, tempat, paket, jam kosong, daftar), CSP ketat. */
function infoPage(c) {
  let t = fs.readFileSync(path.join(SITE, 'info.html'), 'utf8');
  const url = `${HUB_ORIGIN}/${c.slug}/info/`;
  const pl = c.place || null;
  const desc = `${c.brand}: personal trainer${pl ? ` di ${pl.name}, ${pl.city}` : ''}. Lihat paket, harga, dan jam kosong, lalu daftar online.`;
  // T-2258: tempat latihan dari hub.json langsung di HTML (tampil sebelum data coach dimuat). Tanpa tempat = bagian
  // tersembunyi yang diisi skrip dari kolom Lokasi profil coach, bila ada.
  const maps = pl ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(pl.name + ', ' + pl.city) : '#';
  const where = `<p class="where" id="where"${pl ? '' : ' hidden'}><svg class="i" aria-hidden="true"><use href="#i-pin"/></svg><span>${pl ? esc(pl.name + ' · ' + pl.city) : ''}</span></p>`;
  const placeSec = `<section id="tempat" aria-labelledby="h-tempat"${pl ? '' : ' hidden'}>\n      <p class="kicker">Tempat</p>\n      <h2 id="h-tempat">Tempat latihan</h2>\n` +
    `      <div class="card place"><span class="pin" aria-hidden="true"><svg class="i"><use href="#i-pin"/></svg></span><div style="min-width:0"><b>${pl ? esc(pl.name) : ''}</b><span>${pl ? esc(pl.city) : ''}</span></div>` +
    `<a class="btn ghost" href="${esc(maps)}" target="_blank" rel="noopener"><svg class="i" aria-hidden="true"><use href="#i-map"/></svg>Buka di Maps</a></div>\n    </section>`;
  const logo = c.logoFile ? `/${c.slug}/logo.${c.logoFile.ext}` : '';
  const ini = esc((c.brand.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase());
  const cfg = { exec: c.exec, slug: c.slug, brand: c.brand, klien: `/${c.slug}/klien/`, place: pl };
  const swaps = {
    '__ACCENT_ATTR__': c.accent ? ` data-accent="${c.accent}"` : '',
    '__THEME_KEY__': JSON.stringify(c.storageSlug + ':xnk_theme'),
    '__TITLE__': esc(c.brand + ' · Personal trainer'),
    '__DESC__': esc(desc), '__URL__': esc(url), '__BRAND__': esc(c.brand), '__KLIEN__': esc(cfg.klien),
    '<!--OGIMAGE-->': logo ? `<meta property="og:image" content="${esc(HUB_ORIGIN + logo)}">` : '',
    '<!--ICON-->': `<link rel="icon" href="${logo || `/${c.slug}/icon.svg`}" type="${logo ? c.logoFile.type : 'image/svg+xml'}">`,
    '<!--MARK-->': `<span class="mark" aria-hidden="true">${logo ? `<img src="${logo}" alt="">` : ini}</span>`,
    '/*ACCENTS*/': accentCss(),
    '<!--PLACE-->': where, '<!--PLACESEC-->': placeSec, '<!--PLACENAV-->': pl ? '' : ' hidden',
    '/*__CFG__*/null': JSON.stringify(cfg).replace(/</g, '\\u003c'),
  };
  for (const [k, v] of Object.entries(swaps)) {
    if (!t.includes(k)) throw new Error('build-hub: penanda ' + k + ' tidak ada di hub-site/info.html');
    t = t.split(k).join(v);
  }
  if (/__[A-Z_]+__/.test(t)) throw new Error('build-hub: penanda tersisa di halaman info ' + c.slug);
  // Foto coach dari Drive (lh3.googleusercontent.com / drive.google.com); data hanya ke Apps Script coach.
  return cspStatic(t, { connect: 'https://script.google.com https://script.googleusercontent.com', img: 'https://drive.google.com https://*.googleusercontent.com' });
}

/**
 * Kembalikan { files, coaches } untuk seluruh hub.
 * opts.versions (T-2220, dari tools/hub-versions.js): { <slug>: { commit, dir } } — halaman coach itu dibangun dengan
 * build-tenant.js dari checkout XNK di `dir` (commit yang sama dengan Library di spreadsheet coach itu), supaya
 * halaman tidak memanggil fungsi yang belum ada di servernya. Tanpa entri = kode XNK yang menjalankan build ini.
 */
function build(cfg, opts) {
  opts = opts || {};
  const versions = opts.versions || {};
  const hub = readHub(cfg, { baseDir: opts.baseDir });
  const files = {};
  const built = {};
  let latest = null;   // sidik Library dari kode terbaru (dibaca "Cek kesehatan" di spreadsheet coach)
  for (const c of hub.coaches) {
    // T-2252: coach keluar = halaman pemberitahuan + worker pembersih; tidak ada aplikasi, tidak ada versi server.
    if (c.inactive) { Object.assign(files, inactiveFiles(c, hub.contact)); continue; }
    const v = versions[c.slug];
    const t = tenantFor(v).build({ exec: c.exec, brand: c.brand });
    if (!v || !v.dir) latest = t.hash;
    const sub = {};
    for (const [n, body] of Object.entries(t.files)) {
      if (n === 'lib-latest.json' || n === '.nojekyll') continue;
      sub[c.slug + '/' + n] = body;
    }
    localLibs(sub, c.slug + '/');
    // T-2243: awalan penyimpanan dan cache = storageSlug (slug pertama coach), supaya ganti slug tidak mengeluarkan siapa pun.
    isolate(sub, c.slug + '/', c.storageSlug, 'panel', brandSig(c));
    isolate(sub, c.slug + '/klien/', c.storageSlug, 'klien', brandSig(c));
    brandPage(sub, c.slug + '/', c, 'panel');
    brandPage(sub, c.slug + '/klien/', c, 'klien');
    pushPage(sub, c.slug + '/', c);
    pushPage(sub, c.slug + '/klien/', c);
    if (c.logoFile) sub[`${c.slug}/logo.${c.logoFile.ext}`] = c.logoFile.body;
    sub[c.slug + '/info/index.html'] = infoPage(c);
    Object.assign(files, sub);
    built[c.slug] = { commit: v && v.commit || 'terbaru', hash: t.hash };
  }
  if (hub.coaches.length) {
    Object.assign(files, libFiles());
    if (!latest) latest = require('./build-lib').build().hash;
    // SITE_URL coach = xnk.web.id/<slug>; healthCheck membaca SITE_URL/lib-latest.json untuk tahu ada versi baru.
    const latestJson = JSON.stringify({ library: { hash: latest } }) + '\n';
    for (const c of hub.coaches) {
      files[c.slug + '/lib-latest.json'] = latestJson;
      Object.assign(files, aliasFiles(c, latestJson));
    }
  }
  // Commit tiap coach yang terakhir dibangun: build berikutnya memakainya bila server coach tidak menjawab.
  files['_hub/versions.json'] = JSON.stringify(built, null, 1) + '\n';
  // T-2240: kunci publik push (bukan rahasia) untuk pemeriksaan; coach menerimanya dari XNK Pusat (hubPushKey).
  if (hub.vapid) files['_hub/push.json'] = JSON.stringify({ vapidPublic: hub.vapid }) + '\n';
  let landing = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const contact = hub.contact
    ? `<a class="btn ghost" href="${esc(hub.contact)}" rel="noopener"><svg class="i" aria-hidden="true"><use href="#i-chat"/></svg>Hubungi XNK</a>`
    : '';
  if (!landing.includes('<!--CONTACT-->')) throw new Error('build-hub: <!--CONTACT--> tidak ada di hub-site/index.html');
  landing = landing.split('<!--CONTACT-->').join(contact);
  // Daftar coach (di bagian Masuk): kosong = daftar itu dan tautan "Coach" di menu hilang.
  const sec = /\r?\n *<div class="coach-list" id="coach" data-coaches>[\s\S]*?<\/div><!--\/coaches-->/;
  if (!sec.test(landing) || !landing.includes('<!--COACHES-->')) throw new Error('build-hub: bagian data-coaches / <!--COACHES--> tidak ada di hub-site/index.html');
  // T-2252: coach yang tidak aktif lagi tidak tampil di halaman depan.
  const listed = hub.coaches.filter(c => !c.inactive);
  if (listed.length) {
    // T-2241/T-2242: kartu coach membuka halaman info; logo (bila ada) atau huruf pertama di atas warna aksen coach.
    // T-2260: tempat latihan (nama · kota) di bawah nama; data-city / data-q untuk cari dan saring kota di halaman.
    const low = s => s.toLowerCase();
    landing = landing.replace('<!--COACHES-->', listed.map(c =>
      `<a class="card coach" href="/${c.slug}/info/" data-city="${c.place ? esc(low(c.place.city)) : ''}" data-q="${esc(low([c.brand, c.slug].concat(c.aliases || [], c.place ? [c.place.name, c.place.city] : []).join(' ')))}">` +
      `<span class="av${c.accent ? ' acc-' + c.accent : ''}${c.logoFile ? ' logo' : ''}" aria-hidden="true">` +
      (c.logoFile ? `<img src="/${c.slug}/logo.${c.logoFile.ext}" alt="" width="48" height="48">` : esc(c.brand.trim().charAt(0).toUpperCase() || '?')) + '</span>' +
      `<div><b>${esc(c.brand)}</b>` +
      (c.place ? `<span class="pl"><svg class="i" aria-hidden="true"><use href="#i-pin"/></svg><span>${esc(c.place.name)} <em>· ${esc(c.place.city)}</em></span></span>` : '') +
      `<span>xnk.web.id/${c.slug}</span></div><svg class="i go" aria-hidden="true"><use href="#i-arrow"/></svg></a>`).join(''));
    // Kotak cari (≥ 2 coach) dan pilihan kota (≥ 2 coach yang punya tempat). Kota sama tanpa beda huruf besar/kecil.
    const byCity = new Map();
    for (const c of listed) if (c.place) {
      const k = low(c.place.city);
      if (!byCity.has(k)) byCity.set(k, { label: c.place.city, n: 0 });
      byCity.get(k).n++;
    }
    const withPlace = listed.filter(c => c.place).length;
    const chips = withPlace >= 2 ? `<div class="cities" id="cities" role="group" aria-label="Saring per kota"><button type="button" data-city="" aria-pressed="true">Semua<span>${listed.length}</span></button>` +
      [...byCity.entries()].sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label, 'id')).map(([k, v]) =>
        `<button type="button" data-city="${esc(k)}" aria-pressed="false">${esc(v.label)}<span>${v.n}</span></button>`).join('') + '</div>' : '';
    const find = listed.length >= 2 ? '<div class="find"><label class="row" for="coach-q" style="margin:0;font-weight:400"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg>' +
      '<input id="coach-q" type="search" autocomplete="off" placeholder="Cari nama coach, tempat, atau kota" aria-label="Cari coach"></label>' + chips + '</div>' : '';
    if (!landing.includes('<!--FIND-->')) throw new Error('build-hub: <!--FIND--> tidak ada di hub-site/index.html');
    landing = landing.replace('<!--FIND-->', find);
  } else {
    landing = landing.replace(sec, '').split('<a href="#coach">Coach</a>').join('').replace('Bisa juga dicari di daftar coach di atas, atau tanyakan', 'Bisa juga ditanyakan');
  }
  // T-2243: login yang tersimpan di awalan lama (storageSlug) membuka slug baru langsung, tanpa lewat halaman pengalih.
  if (!landing.includes('/*SLUGMAP*/{}')) throw new Error('build-hub: /*SLUGMAP*/{} tidak ada di hub-site/index.html');
  const slugMap = {};
  for (const c of hub.coaches) {
    if (c.storageSlug !== c.slug) slugMap[c.storageSlug] = c.slug;
    for (const a of c.aliases || []) if (!slugMap[a]) slugMap[a] = c.slug;
  }
  landing = landing.split('/*SLUGMAP*/{}').join(JSON.stringify(slugMap));
  // T-2252: awalan penyimpanan dan slug lama coach yang tidak aktif: login tersimpan tidak membuka situsnya otomatis.
  if (!landing.includes('/*SLUGOFF*/[]')) throw new Error('build-hub: /*SLUGOFF*/[] tidak ada di hub-site/index.html');
  const off = [];
  for (const c of hub.coaches) if (c.inactive) for (const n of [c.storageSlug].concat(c.aliases || [])) if (!off.includes(n)) off.push(n);
  landing = landing.split('/*SLUGOFF*/[]').join(JSON.stringify(off));
  if (!landing.includes('/*ACCENTS*/')) throw new Error('build-hub: /*ACCENTS*/ tidak ada di hub-site/index.html');
  landing = landing.replace('/*ACCENTS*/', Object.entries(ACCENTS).map(([k, v]) =>
    `.coach .av.acc-${k} { background: ${v[0]}; color: ${v[1]}; } @media (prefers-color-scheme: dark) { .coach .av.acc-${k} { background: ${v[2]}; color: ${v[3]}; } }`).join('\n  '));
  files['index.html'] = cspStatic(landing);
  for (const n of fs.readdirSync(path.join(SITE, 'img'))) files['img/' + n] = fs.readFileSync(path.join(SITE, 'img', n));
  // Bisa dipasang (PWA): manifest + service worker yang hanya melayani halaman depan; nama cache ikut isi landing.
  files['manifest.webmanifest'] = fs.readFileSync(path.join(SITE, 'manifest.webmanifest'), 'utf8');
  const sw = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8');
  if (!sw.includes('__HASH__')) throw new Error('build-hub: __HASH__ tidak ada di hub-site/sw.js');
  files['sw.js'] = sw.replace('__HASH__', sha(landing + files['manifest.webmanifest']));
  // Dasbor pemilik: halaman statis tanpa data; datanya dari XNK Pusat setelah login PIN.
  const adm = fs.readFileSync(path.join(SITE, 'adminxnk.html'), 'utf8')
    .split("'__PUSAT_URL__'").join(JSON.stringify(hub.pusat))
    .split('__HUB_COACHES__').join(JSON.stringify(Object.fromEntries(hub.coaches.map(c => [c.slug, c.brand]))).replace(/</g, '\\u003c'));
  if (adm.includes('__PUSAT_URL__') || adm.includes('__HUB_COACHES__')) throw new Error('build-hub: penanda adminxnk.html tersisa.');
  files['adminxnk/index.html'] = cspStatic(adm, 'https://script.google.com https://script.googleusercontent.com');
  files['404.html'] = cspStatic(fs.readFileSync(path.join(SITE, '404.html'), 'utf8'));
  files['.nojekyll'] = '';
  return { files, coaches: hub.coaches };
}

/** build-tenant.js dari checkout XNK lain (commit coach itu), atau milik build ini. */
function tenantFor(v) {
  if (!v || !v.dir) return tenant;
  const file = path.join(path.resolve(v.dir), 'apps-script', 'xnk-library', 'tools', 'build-tenant.js');
  if (!fs.existsSync(file)) throw new Error('build-hub: ' + file + ' tidak ada (commit ' + v.commit + ').');
  return require(file);
}

function write(outDir, files) {
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [n, t] of Object.entries(files)) {
    const p = path.join(outDir, n);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, t);
  }
}

module.exports = { build, write, readHub, slugError, readLogo, cleanPlace, PLACE_MAX, imageKind, imageSize, RESERVED, SLUG_RE, SECRET_RE, CSP_APP, ACCENTS, ACCENT_NAMES, LOGO_MAX, VAPID_RE, pushPage, aliasFiles, inactiveFiles };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const cfgFile = flag('--config');
  const verFile = flag('--versions');
  const out = args[0];
  if (!out || !cfgFile) { console.error('pakai: build-hub.js <outDir> --config hub.json [--versions versions.json]'); process.exit(1); }
  try {
    const versions = verFile ? JSON.parse(fs.readFileSync(verFile, 'utf8')) : {};
    const r = build(JSON.parse(fs.readFileSync(cfgFile, 'utf8')), { versions, baseDir: path.dirname(path.resolve(cfgFile)) });
    write(path.resolve(out), r.files);
    console.log(`Hub XNK: ${r.coaches.length} coach (${r.coaches.map(c => c.slug).join(', ') || '-'}), ${Object.keys(r.files).length} berkas → ${out}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
