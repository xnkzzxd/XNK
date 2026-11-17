'use strict';
// Menambah, mengubah, atau menghapus satu coach di hub.json, dengan pemeriksaan penuh sebelum menulis:
//   node apps-script/xnk-library/tools/hub-edit.js <hub.json> simpan <slug> <nama usaha> <link /exec>
//   node apps-script/xnk-library/tools/hub-edit.js <hub.json> hapus  <slug>
// Dipakai workflow "Hub XNK" (form Actions) supaya pemilik tidak mengedit JSON dengan tangan.
const fs = require('fs');
const hub = require('./build-hub');

/** Kembalikan { cfg, message } baru tanpa mengubah masukan. Melempar galat Indonesia bila ada yang salah. */
function edit(cfg, aksi, a) {
  const base = cfg && typeof cfg === 'object' ? cfg : { coaches: [] };
  const coaches = Array.isArray(base.coaches) ? base.coaches.map(c => Object.assign({}, c)) : [];
  const slug = String(a && a.slug || '').trim();
  let message;
  if (aksi === 'simpan') {
    const brand = String(a.brand || '').trim(), exec = String(a.exec || '').trim();
    const err = hub.slugError(slug);
    if (err) throw new Error(err);
    if (!brand) throw new Error('Nama usaha wajib diisi.');
    if (!exec) throw new Error('Link /exec wajib diisi.');
    const i = coaches.findIndex(c => c.slug === slug);
    if (i >= 0) { coaches[i] = { slug, brand, exec }; message = `Coach "${slug}" diperbarui.`; }
    else { coaches.push({ slug, brand, exec }); message = `Coach "${slug}" ditambahkan.`; }
  } else if (aksi === 'hapus') {
    const i = coaches.findIndex(c => c.slug === slug);
    if (i < 0) throw new Error(`Coach "${slug}" tidak ada di daftar.`);
    coaches.splice(i, 1);
    message = `Coach "${slug}" dihapus. Alamat /${slug}/ tidak aktif lagi, dan klien coach itu tidak bisa membukanya.`;
  } else {
    throw new Error('Aksi harus "simpan" atau "hapus".');
  }
  coaches.sort((x, y) => (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
  const next = Object.assign({}, base, { coaches });
  hub.readHub(next);   // memeriksa seluruh daftar (link ganda, slug sistem, …) sebelum ada yang ditulis
  return { cfg: next, message };
}

module.exports = { edit };

if (require.main === module) {
  const [file, aksi, slug, brand, exec] = process.argv.slice(2);
  if (!file || !aksi) { console.error('pakai: hub-edit.js <hub.json> simpan|hapus <slug> [nama usaha] [link /exec]'); process.exit(1); }
  try {
    const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { coaches: [] };
    const r = edit(cur, aksi, { slug, brand, exec });
    fs.writeFileSync(file, JSON.stringify(r.cfg, null, 2) + '\n');
    console.log(r.message);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
