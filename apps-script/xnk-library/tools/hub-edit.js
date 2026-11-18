'use strict';
// Menambah, mengubah, atau menghapus satu coach di hub.json, dengan pemeriksaan penuh sebelum menulis:
//   node apps-script/xnk-library/tools/hub-edit.js <hub.json> simpan <slug> <nama usaha> <link /exec> [scriptId] [deploymentId] [--warna biru] [--logo logo/x.png]
//   (coach yang sudah ada: nama usaha dan link boleh kosong = tetap; --warna tetap|hitam|biru|…; --logo - = hapus logo)
//   node apps-script/xnk-library/tools/hub-edit.js <hub.json> hapus  <slug>
// Dipakai workflow "Hub XNK" (form Actions) supaya pemilik tidak mengedit JSON dengan tangan.
const fs = require('fs');
const hub = require('./build-hub');

/** Kembalikan { cfg, message } baru tanpa mengubah masukan. Melempar galat Indonesia bila ada yang salah. */
function edit(cfg, aksi, a, opts) {
  const base = cfg && typeof cfg === 'object' ? cfg : { coaches: [] };
  const coaches = Array.isArray(base.coaches) ? base.coaches.map(c => Object.assign({}, c)) : [];
  const slug = String(a && a.slug || '').trim();
  let message;
  if (aksi === 'simpan') {
    const err = hub.slugError(slug);
    if (err) throw new Error(err);
    const i = coaches.findIndex(c => c.slug === slug);
    // Coach yang sudah ada: isian kosong = nilai lama (mis. hanya mengganti warna).
    const brand = String(a.brand || '').trim() || (i >= 0 ? coaches[i].brand : '');
    const exec = String(a.exec || '').trim() || (i >= 0 ? coaches[i].exec : '');
    if (!brand) throw new Error('Nama usaha wajib diisi.');
    if (!exec) throw new Error('Link /exec wajib diisi.');
    const extra = {};
    for (const k of ['scriptId', 'deploymentId']) if (a[k]) extra[k] = String(a[k]).trim();
    // Link /exec berubah = deployment lain: ID lama dibuang supaya tidak salah sambung.
    const keep = i >= 0 && coaches[i].exec === exec ? coaches[i] : {};
    const row = Object.assign({}, keep, { slug, brand, exec }, extra);
    // T-2242: warna (kosong/"tetap" = tetap, "hitam" = tanpa warna) dan logo (kosong = tetap, "-" = hapus).
    if (i >= 0 && keep !== coaches[i]) for (const k of ['accent', 'logo']) if (coaches[i][k]) row[k] = coaches[i][k];
    const w = String(a.accent || '').trim().toLowerCase();
    if (w === 'hitam') delete row.accent; else if (w && w !== 'tetap') row.accent = w;
    const logo = String(a.logo || '').trim();
    if (logo === '-') delete row.logo; else if (logo) row.logo = logo;
    if (i >= 0) { coaches[i] = row; message = `Coach "${slug}" diperbarui.`; }
    else { coaches.push(row); message = `Coach "${slug}" ditambahkan.`; }
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
  hub.readHub(next, opts);   // memeriksa seluruh daftar (link ganda, slug sistem, …) sebelum ada yang ditulis
  return { cfg: next, message };
}

module.exports = { edit };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ''; };
  const accent = flag('--warna'), logo = flag('--logo');
  const [file, aksi, slug, brand, exec, scriptId, deploymentId] = args;
  if (!file || !aksi) { console.error('pakai: hub-edit.js <hub.json> simpan|hapus <slug> [nama usaha] [link /exec]'); process.exit(1); }
  try {
    const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { coaches: [] };
    const r = edit(cur, aksi, { slug, brand, exec, scriptId, deploymentId, accent, logo }, { baseDir: require('path').dirname(require('path').resolve(file)) });
    fs.writeFileSync(file, JSON.stringify(r.cfg, null, 2) + '\n');
    console.log(r.message);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
