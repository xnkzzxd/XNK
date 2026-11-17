# Phase AB — Hub xnk.web.id

Keputusan pemilik (2026-11-17): satu situs untuk semua coach, `xnk.web.id/<slug>/` (panel) dan
`xnk.web.id/<slug>/klien/` (portal klien); `xnk.web.id/` = halaman depan **XNK** (bukan "coach hub" atau
"fitness hub"). Hanya pemilik yang menambah coach. Coach tidak memasang JavaScript sendiri. Coach pertama: `claudia`.

## Bagian

| Berkas (`apps-script/xnk-library/`) | Peran |
| --- | --- |
| `tools/build-hub.js` | Membangun seluruh situs dari `hub.json`: untuk setiap coach `build-tenant.js` (halaman xnk.my.id → `/exec` coach itu), awalan penyimpanan, awalan cache service worker; landing dan 404. Memeriksa slug dan daftar sebelum membangun. |
| `tools/hub-edit.js` | Tambah, ubah, hapus satu coach di `hub.json` dengan pemeriksaan penuh (dipakai form Actions). |
| `hub-site/` | `index.html` (landing + kotak masuk + tombol kontak dari `contactUrl`), `404.html`, `storage-prefix.js`. |
| `hub-repo/` | Isi repo hub `xnk-template-site`: `hub.json`, workflow `hub.yml` (form simpan/hapus/bangun, harian 03:17 WIB), README (DNS, cara menambah coach). |
| `tools/hub-check.js`, `tests/hub.test.js` | Cek browser dan tes. |
| `bridge-src/Setup.html` | Langkah 4 wizard: pilih slug, simpan `SITE_URL = https://xnk.web.id/<slug>`, salin data untuk pengelola. |

## Kenapa awalan penyimpanan

Browser memisahkan `localStorage` per domain, bukan per folder. Tanpa awalan, `xnk_admin_token`,
`xnk_portal_cache` dan antrean offline coach A dan B saling menimpa (diuji: tanpa awalan, coach A ikut keluar saat
coach B keluar masuk). `hub-site/storage-prefix.js` disisipkan **inline** di awal `<head>` setiap halaman coach dan
memberi awalan `<slug>:` pada `getItem/setItem/removeItem/key/length/clear`. Syaratnya: aplikasi hanya memakai
metode itu, tanpa IndexedDB, cookie, atau event `storage` (dijaga `tests/hub.test.js`). Coach tidak boleh menambah
JavaScript sendiri: skrip bebas di domain yang sama bisa membaca penyimpanan coach lain.

## Service worker

`build-static.js` menurunkan awalan cache dari nama folder (`xnk-page-claudia-`), dan worker yang aktif menghapus
semua cache berawalan itu. Awalan `claudia` adalah awalan `claudia-2`, dan panel `/claudia/` memuat portal
`/claudia/klien/`, jadi worker saling menghapus cache. `build-hub.js` mengganti baris `PREFIX` dengan
`xnk-page-<slug>~<panel|klien>~` (`~` tidak boleh ada di slug) dan memperbarui `HASH` karena isi halaman berubah.
Bila `tools/sw-app.template.js` mengubah dua baris itu, build berhenti dengan pesan.

## Slug

`^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$`, tanpa `--`; kata sistem dicadangkan (`admin`, `api`, `app`, `klien`, `demo`,
`l`, `login`, `daftar`, `masuk`, `assets`, `static`, `www`, `xnk`, `hub`, `index`, `404`, `coach`, …, daftar di
`build-hub.js` `RESERVED`). Slug tidak diganti setelah dipakai (link klien putus).

## Batas dan keputusan terbuka

- Satu `/exec` hanya boleh milik satu coach (build menolak link ganda).
- Pustaka gerakan/makanan/peta otot masih dimuat dari `xnk.my.id`; bila mati, pencarian gerakan dan makanan semua coach terganggu.
- Setiap coach membawa salinan halaman sendiri (±1 MB); ratusan coach masih jauh di bawah batas GitHub Pages. Bila perlu, berkas berhash yang sama bisa dipakai bersama.
- Push ke HP belum ada di hub.
- Direktori "cari coach" ditunda (butuh persetujuan tiap coach dan moderasi).
