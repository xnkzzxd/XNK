'use strict';
// Membangun situs hub xnk.web.id: satu situs, banyak coach.
//   node apps-script/xnk-library/tools/build-hub.js <outDir> --config hub.json
// hub.json: { "contactUrl": "https://wa.me/…" (opsional), "coaches": [ { "slug": "claudia", "brand": "Claudia Fit", "exec": "https://script.google.com/macros/s/…/exec" } ] }
// Hasil:
//   /index.html, /404.html, /img/    landing XNK (hub-site/; gambar dari tools/hub-shots.js)
//   /<slug>/                         panel coach (PIN)
//   /<slug>/klien/                   portal klien
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
const RESERVED = ['admin', 'api', 'app', 'klien', 'demo', 'l', 'login', 'daftar', 'masuk', 'assets', 'static', 'www', 'xnk', 'hub',
  'index', '404', 'cname', 'img', 'coach', 'coaches', 'support', 'help', 'bantuan', 'legacy', 'next'];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Pesan galat (Indonesia) untuk satu slug, atau '' bila boleh dipakai. */
function slugError(slug) {
  const s = String(slug == null ? '' : slug);
  if (!SLUG_RE.test(s) || /--/.test(s)) return `Slug "${s}" tidak valid: huruf kecil, angka dan tanda hubung, 3 sampai 30 karakter, tanpa spasi, tidak diawali atau diakhiri tanda hubung.`;
  if (RESERVED.includes(s)) return `Slug "${s}" dipakai sistem; pilih nama lain.`;
  return '';
}

/** Periksa hub.json; lempar galat Indonesia pertama yang ditemukan. */
function readHub(cfg) {
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.coaches)) throw new Error('hub.json: "coaches" harus berupa daftar.');
  const contact = String(cfg.contactUrl || '').trim();
  if (contact && !/^https:\/\/[^\s'"<>\\]+$/.test(contact)) throw new Error('hub.json: "contactUrl" harus link https:// tanpa spasi.');
  const seen = new Set();
  const coaches = cfg.coaches.map((c, i) => {
    const slug = String(c && c.slug || '').trim();
    const err = slugError(slug);
    if (err) throw new Error(`hub.json, coach ke-${i + 1}: ${err}`);
    if (seen.has(slug)) throw new Error(`hub.json: slug "${slug}" dipakai dua kali.`);
    seen.add(slug);
    let conf;
    try { conf = tenant.readConfig({ exec: c.exec, brand: c.brand }); } catch (e) { throw new Error(`hub.json, "${slug}": ${e.message.replace(/^config\.json: /, '')}`); }
    return { slug, brand: conf.brand, exec: conf.exec };
  });
  const execs = coaches.map(c => c.exec);
  const dup = execs.find((e, i) => execs.indexOf(e) !== i);
  if (dup) throw new Error('hub.json: dua coach memakai link /exec yang sama; setiap coach harus punya spreadsheet sendiri.');
  return { contact, coaches };
}

/** Sisipkan penyimpanan per slug di awal <head> dan kunci service worker supaya hash dan awalan cache unik. */
function isolate(files, dir, slug, kind) {
  const shim = fs.readFileSync(path.join(SITE, 'storage-prefix.js'), 'utf8').split('__SLUG__').join(slug);
  if (shim.includes('__SLUG__')) throw new Error('build-hub: __SLUG__ tersisa');
  const idx = dir + 'index.html';
  if (!/<head>\n/.test(files[idx])) throw new Error('build-hub: <head> tidak ditemukan di ' + idx);
  files[idx] = files[idx].replace('<head>\n', '<head>\n<script>' + shim.replace(/\/\*[\s\S]*?\*\//, '').trim() + '</script>\n');
  const swf = dir + 'sw-app.js';
  let sw = files[swf];
  if (typeof sw !== 'string') throw new Error('build-hub: sw-app.js tidak ada di ' + dir);
  // Awalan cache bawaan diturunkan dari folder ("xnk-page-claudia-") dan bisa menjadi awalan cache coach lain
  // ("xnk-page-claudia-2-…"): worker yang aktif menghapus semua cache berawalan itu. "~" tidak boleh ada di slug.
  let n = 0;
  sw = sw.replace(/^var PREFIX = .*$/m, () => { n++; return `var PREFIX = ${JSON.stringify('xnk-page-' + slug + '~' + kind + '~')};`; });
  if (n !== 1) throw new Error('build-hub: baris PREFIX di sw-app.js tidak ditemukan; sesuaikan build-hub.js dengan tools/sw-app.template.js.');
  n = 0;
  sw = sw.replace(/^var HASH = "([0-9a-f]+)";$/m, (m, h) => { n++; return `var HASH = "${sha(h + shim)}";`; });
  if (n !== 1) throw new Error('build-hub: baris HASH di sw-app.js tidak ditemukan.');
  files[swf] = sw;
}

/** Kembalikan { files, coaches } untuk seluruh hub. */
function build(cfg) {
  const hub = readHub(cfg);
  const files = {};
  for (const c of hub.coaches) {
    const t = tenant.build({ exec: c.exec, brand: c.brand });
    const sub = {};
    for (const [n, body] of Object.entries(t.files)) {
      if (n === 'lib-latest.json' || n === '.nojekyll') continue;
      sub[c.slug + '/' + n] = body;
    }
    isolate(sub, c.slug + '/', c.slug, 'panel');
    isolate(sub, c.slug + '/klien/', c.slug, 'klien');
    Object.assign(files, sub);
  }
  let landing = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const contact = hub.contact
    ? `<a class="btn ghost" href="${esc(hub.contact)}" rel="noopener"><svg class="i" aria-hidden="true"><use href="#i-chat"/></svg>Hubungi XNK</a>`
    : '';
  if (!landing.includes('<!--CONTACT-->')) throw new Error('build-hub: <!--CONTACT--> tidak ada di hub-site/index.html');
  landing = landing.split('<!--CONTACT-->').join(contact);
  // Daftar coach (di bagian Masuk): kosong = daftar itu dan tautan "Coach" di menu hilang.
  const sec = /\r?\n *<div class="coach-list" id="coach" data-coaches>[\s\S]*?<\/div><!--\/coaches-->/;
  if (!sec.test(landing) || !landing.includes('<!--COACHES-->')) throw new Error('build-hub: bagian data-coaches / <!--COACHES--> tidak ada di hub-site/index.html');
  if (hub.coaches.length) {
    landing = landing.replace('<!--COACHES-->', hub.coaches.map(c =>
      `<a class="card coach" href="/${c.slug}/klien/"><span class="av" aria-hidden="true">${esc(c.brand.trim().charAt(0).toUpperCase() || '?')}</span>` +
      `<div><b>${esc(c.brand)}</b><span>xnk.web.id/${c.slug}</span></div><svg class="i go" aria-hidden="true"><use href="#i-arrow"/></svg></a>`).join(''));
  } else {
    landing = landing.replace(sec, '').split('<a href="#coach">Coach</a>').join('').replace('Bisa juga dicari di daftar coach di atas, atau tanyakan', 'Bisa juga ditanyakan');
  }
  files['index.html'] = landing;
  for (const n of fs.readdirSync(path.join(SITE, 'img'))) files['img/' + n] = fs.readFileSync(path.join(SITE, 'img', n));
  // Bisa dipasang (PWA): manifest + service worker yang hanya melayani halaman depan; nama cache ikut isi landing.
  files['manifest.webmanifest'] = fs.readFileSync(path.join(SITE, 'manifest.webmanifest'), 'utf8');
  const sw = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8');
  if (!sw.includes('__HASH__')) throw new Error('build-hub: __HASH__ tidak ada di hub-site/sw.js');
  files['sw.js'] = sw.replace('__HASH__', sha(landing + files['manifest.webmanifest']));
  files['404.html'] = fs.readFileSync(path.join(SITE, '404.html'), 'utf8');
  files['.nojekyll'] = '';
  return { files, coaches: hub.coaches };
}

function write(outDir, files) {
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [n, t] of Object.entries(files)) {
    const p = path.join(outDir, n);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, t);
  }
}

module.exports = { build, write, readHub, slugError, RESERVED, SLUG_RE };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--config');
  const cfgFile = i >= 0 ? args.splice(i, 2)[1] : null;
  const out = args[0];
  if (!out || !cfgFile) { console.error('pakai: build-hub.js <outDir> --config hub.json'); process.exit(1); }
  try {
    const r = build(JSON.parse(fs.readFileSync(cfgFile, 'utf8')));
    write(path.resolve(out), r.files);
    console.log(`Hub XNK: ${r.coaches.length} coach (${r.coaches.map(c => c.slug).join(', ') || '-'}), ${Object.keys(r.files).length} berkas → ${out}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
