'use strict';
// Menambah, mengubah, atau menghapus satu coach di hub.json, dengan pemeriksaan penuh sebelum menulis:
//   node apps-script/xnk-library/tools/hub-edit.js <hub.json> simpan <slug> <nama usaha> <link /exec> [scriptId] [deploymentId] [--warna biru] [--logo logo/x.png]
//        [--tempat "Gold's Gym Kemang"] [--kota "Jakarta Selatan"]
//   (coach yang sudah ada: nama usaha dan link boleh kosong = tetap; --warna tetap|hitam|biru|…; --logo - = hapus logo;
//    T-2258: --tempat/--kota kosong = tempat tetap, --tempat - = hapus tempat)
//   node apps-script/xnk-library/tools/hub-edit.js <hub.json> hapus  <slug>
//   node apps-script/xnk-library/tools/hub-edit.js <hub.json> ganti-slug <slug lama> <slug baru>
//   (T-2243: slug lama jadi alamat pengalih, awalan penyimpanan dan secret clasp tetap; lihat docs/library/Hub.md)
//   node apps-script/xnk-library/tools/hub-edit.js <hub.json> nonaktif|aktifkan <slug>
//   (T-2252: coach keluar = "inactive": true, situsnya jadi halaman "tidak aktif lagi"; aktifkan = dihapus lagi)
// Dipakai workflow "Hub XNK" (form Actions) supaya pemilik tidak mengedit JSON dengan tangan.
const fs = require('fs');
const hub = require('./build-hub');

// T-2243: isian yang melekat pada coach (bukan pada link /exec-nya).
const IDENTITY = ['aliases', 'storageSlug', 'secret', 'inactive'];
/** Nama secret clasp bawaan untuk slug itu (sama dengan coach-ops.js / coach.yml). */
function coachSecret(slug) { return 'CLASP_' + String(slug).toUpperCase().replace(/-/g, '_'); }

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
    if (i >= 0 && keep !== coaches[i]) for (const k of ['accent', 'logo', 'place']) if (coaches[i][k]) row[k] = coaches[i][k];
    // T-2243: alamat lama, awalan penyimpanan dan secret clasp milik coach, bukan milik deployment: selalu ikut.
    if (i >= 0) for (const k of IDENTITY) if (coaches[i][k] != null) row[k] = coaches[i][k];
    const w = String(a.accent || '').trim().toLowerCase();
    if (w === 'hitam') delete row.accent; else if (w && w !== 'tetap') row.accent = w;
    const logo = String(a.logo || '').trim();
    if (logo === '-') delete row.logo; else if (logo) row.logo = logo;
    // T-2258: tempat latihan (nama + kota). Keduanya kosong = tetap; "-" = hapus; satu diisi = ganti (yang lain tetap).
    const tName = String(a.placeName == null ? '' : a.placeName).trim(), tCity = String(a.placeCity == null ? '' : a.placeCity).trim();
    if (tName === '-') delete row.place;
    else if (tName || tCity) {
      const old = row.place || {};
      const r = hub.cleanPlace({ name: tName || old.name || '', city: tCity || old.city || '' });
      if (r.error) throw new Error(r.error);
      if (r.place) row.place = r.place; else delete row.place;
    }
    if (i >= 0) { coaches[i] = row; message = `Coach "${slug}" diperbarui.`; }
    else { coaches.push(row); message = `Coach "${slug}" ditambahkan.`; }
  } else if (aksi === 'hapus') {
    const i = coaches.findIndex(c => c.slug === slug);
    if (i < 0) throw new Error(`Coach "${slug}" tidak ada di daftar.`);
    coaches.splice(i, 1);
    message = `Coach "${slug}" dihapus. Alamat /${slug}/ tidak aktif lagi, dan klien coach itu tidak bisa membukanya.`;
  } else if (aksi === 'ganti-slug') {
    const to = String(a && a.newSlug || '').trim().toLowerCase();
    const i = coaches.findIndex(c => c.slug === slug);
    if (i < 0) throw new Error(`Coach "${slug}" tidak ada di daftar.`);
    const err = hub.slugError(to);
    if (err) throw new Error(err);
    if (to === slug) throw new Error('Slug baru sama dengan slug sekarang.');
    const c = coaches[i];
    // Slug lama jadi alamat pengalih. Kembali ke nama yang dulu pernah dipakai = nama itu keluar dari daftar alamat lama.
    c.aliases = (c.aliases || []).filter(x => x !== to && x !== slug).concat([slug]);
    c.storageSlug = c.storageSlug || slug;
    c.secret = c.secret || coachSecret(slug);
    if (c.storageSlug === to) delete c.storageSlug;
    if (c.secret === coachSecret(to)) delete c.secret;
    c.slug = to;
    message = `Coach "${slug}" sekarang "${to}". Alamat lama xnk.web.id/${slug}/ tetap mengarah ke xnk.web.id/${to}/; klien dan coach tetap masuk.`;
  } else if (aksi === 'nonaktif' || aksi === 'aktifkan') {
    // T-2252: coach keluar. Hanya tanda di hub.json; data coach tidak disentuh (spreadsheet tetap di akun coach).
    const i = coaches.findIndex(c => c.slug === slug || (c.aliases || []).includes(slug));
    if (i < 0) throw new Error(`Coach "${slug}" tidak ada di daftar.`);
    const c = coaches[i];
    if (aksi === 'nonaktif') {
      c.inactive = true;
      message = `Coach "${c.slug}" tidak aktif lagi. xnk.web.id/${c.slug}/ (panel, portal, info) sekarang halaman "Situs coach ini tidak aktif lagi"; data coach tidak dihapus.`;
    } else {
      delete c.inactive;
      message = `Coach "${c.slug}" aktif lagi. xnk.web.id/${c.slug}/ kembali ke aplikasi setelah situs dibangun ulang.`;
    }
  } else {
    throw new Error('Aksi harus "simpan", "hapus", "ganti-slug", "nonaktif", atau "aktifkan".');
  }
  coaches.sort((x, y) => (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
  const next = Object.assign({}, base, { coaches });
  hub.readHub(next, opts);   // memeriksa seluruh daftar (link ganda, slug sistem, …) sebelum ada yang ditulis
  return { cfg: next, message };
}

module.exports = { edit, coachSecret };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ''; };
  const accent = flag('--warna'), logo = flag('--logo'), placeName = flag('--tempat'), placeCity = flag('--kota');
  const [file, aksi, slug, brand, exec, scriptId, deploymentId] = args;
  if (!file || !aksi) { console.error('pakai: hub-edit.js <hub.json> simpan|hapus|nonaktif|aktifkan <slug> [nama usaha] [link /exec] | ganti-slug <lama> <baru>'); process.exit(1); }
  try {
    const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { coaches: [] };
    // ganti-slug: argumen ke-2 setelah slug = slug baru (posisi "nama usaha" pada simpan).
    const r = edit(cur, aksi, { slug, brand, exec, scriptId, deploymentId, accent, logo, placeName, placeCity, newSlug: aksi === 'ganti-slug' ? brand : '' }, { baseDir: require('path').dirname(require('path').resolve(file)) });
    fs.writeFileSync(file, JSON.stringify(r.cfg, null, 2) + '\n');
    console.log(r.message);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
