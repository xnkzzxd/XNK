# fig3d — figur gerakan 3D (Fase U, Rilis 5, T-1630+)

Status: **spike** (T-1630). Satu gerakan (Seated Cable Row) untuk dinilai owner; belum dipakai aplikasi, belum ada gambar
di `figure/`. Rencana lengkap: `docs/program/TODO.md` → Rilis 5.

## Sumber model (tidak ada di repo)

- **Z-Anatomy** (https://github.com/Z-Anatomy/Models-of-human-anatomy, `Z-Anatomy.zip` → `Startup.blend`),
  lisensi **CC BY-SA 4.0**; turunan **BodyParts3D** (The Database Center for Life Science, CC BY-SA 2.1 Japan).
- Gambar hasil render adalah karya turunan: wajib kredit dan lisensi CC BY-SA 4.0 (ditulis di `figure/CREDITS.md`
  saat gambar pertama masuk repo). Kode di repo ini tidak terpengaruh.

## Alat

- Blender sebagai modul Python: `pip install bpy` (dicoba dengan 5.3.0, Python 3.13), `pip install pillow`.
- Render CPU (Cycles), ±8 detik per frame 640 px di 4 core.

## Langkah

```sh
# 1. Pilih otot, tulang, kulit kepala/tangan/kaki dari model; tandai tiap otot dengan 16 otot target pustaka.
python -I prep.py <Startup.blend> work.blend
# 2. Frame pose 2D bersumber (Gerak.md) dari build-rig.js
node -e "const r=require('../build-rig.js');const d=r.build();console.log(JSON.stringify({frames:d.pats['seated-cable-row'].frames}))" > row-frames.json
# 3. Kepala polos, rangka + bobot sendiri, pose, alat 3D, render dasar (b00…) + topeng otot (m00…)
python -I spike-row.py -- work.blend row-frames.json out/row 0,1,2,3,4,5,6,7,8,9,10,11,12 640
# 4. Lembar kontak (terang / gelap × 3 aksen), animasi WebP, uji ukuran strip
python -I preview.py out/row preview
```

## Cara kerja singkat

- **Tubuh**: 369 mesh otot Z-Anatomy tetap terpisah (celah antar otot terlihat), tulang mengisi sela, kepala diganti
  bentuk polos (bola yang dibungkuskan ke kulit kepala lalu dihaluskan: tanpa wajah), tangan dan kaki dari kulit model.
- **Gerak**: tanpa armature Blender. Tiap bagian tubuh punya ruas diam; bobot titik = jarak ke ruas yang boleh untuk
  otot itu (mis. latissimus: pinggang, dada, lengan atas), lalu linear blend skinning di numpy.
- **Pose**: arah bahu→tangan dan sudut siku tiap frame diambil dari frame 2D `build-rig.js` (sudut bersumber), lalu
  diselesaikan dengan IK dua ruas 3D. Lebar pegangan, arah siku, pronasi dan tekuk jari = pilihan gambar.
- **Alat**: bentuk prosedural sendiri (bangku, rel, pijakan, menara, tumpukan beban yang ikut naik, katrol, kabel, pegangan V).
- **Dua lapis**: `b*.png` tubuh abu-abu dengan otot aktif hampir putih; `m*.png` topeng (putih = otot utama, abu = otot
  pendukung). Di aplikasi warna aksen dikalikan (multiply) lewat topeng, jadi bayangan otot tetap ada.

## Temuan spike

- Lutut pola `seated-cable-row` di rig 2D menekuk ke bawah (lutut di bawah garis pinggul–pergelangan kaki); di 3D lutut
  ditekuk ke atas ±32° (pilihan gambar, bukan angka studi). Rig 2D perlu dibetulkan di T-1631.
- Strip 13 frame × 480 px: dasar ±237 KB + topeng ±49 KB = di atas anggaran 180 KB. Pilihan di T-1631: kualitas lebih
  rendah, 400 px, atau alat diam dipisah dari tubuh.
- Daerah pinggul saat duduk masih kusut (bobot gluteus / paha); bahu belum ikut retraksi.
