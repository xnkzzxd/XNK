# Phase AB — Hub xnk.web.id

Keputusan pemilik (2026-11-17): satu situs untuk semua coach, `xnk.web.id/<slug>/` (panel) dan
`xnk.web.id/<slug>/klien/` (portal klien); `xnk.web.id/` = halaman depan **XNK** (bukan "coach hub" atau
"fitness hub"). Hanya pemilik yang menambah coach. Coach tidak memasang JavaScript sendiri. Coach pertama: `claudia`.

## Bagian

| Berkas (`apps-script/xnk-library/`) | Peran |
| --- | --- |
| `tools/build-hub.js` | Membangun seluruh situs dari `hub.json`: untuk setiap coach `build-tenant.js` (halaman xnk.my.id → `/exec` coach itu), awalan penyimpanan, awalan cache service worker; landing dan 404. Memeriksa slug dan daftar sebelum membangun. |
| `tools/hub-versions.js` | Menentukan commit XNK tiap coach dari server coach (T-2220); hasilnya untuk `build-hub.js --versions`. |
| `tools/hub-verify.js` | Memeriksa hasil build hub sebelum diunggah (T-2221). |
| `hub-site/adminxnk.html` | Dasbor pemilik `xnk.web.id/adminxnk/` (data dari XNK Pusat, [Pusat.md](Pusat.md)). |
| `tools/coach-ops.js` | Workflow **Coach XNK**: coach baru, hubungkan, perbarui ([Akun.md](Akun.md)). |
| `tools/hub-edit.js` | Tambah, ubah, hapus satu coach di `hub.json` dengan pemeriksaan penuh (dipakai form Actions). |
| `hub-site/` | `index.html` (landing profil brand XNK: hero, fitur klien/coach, tangkapan layar, cara kerja, privasi, daftar coach dari `hub.json` di `<!--COACHES-->` (bagian hilang bila kosong), kotak masuk, tanya jawab, tombol kontak dari `contactUrl` di `<!--CONTACT-->`), `img/` (tangkapan layar demo + `og.jpg`, dibuat oleh `tools/hub-shots.js`; jalankan ulang bila tampilan app berubah banyak), `404.html`, `storage-prefix.js`, `manifest.webmanifest` + `sw.js` (landing bisa dipasang dari Chrome/Edge; service worker hanya melayani `/`, `/manifest.webmanifest`, `/img/*`, tidak pernah halaman coach atau cache coach), `desktop.ico`. Ikon (`img/icon-192.png`, `img/icon-512.png`, `img/logo-64.png`, `desktop.ico`) dibuat dari `logo.png` di akar repo di atas latar hitam; perintahnya ada di `tools/hub-shots.js`. Bagian "Aplikasi" menautkan `github.com/xnkzzxd/XNK/releases/download/app-latest/` (`XNK-Android.apk`, `XNK-Windows.msi`, `XNK-macOS.dmg`), dibangun oleh workflow `apps.yml` di repo XNK. Slug `img` dipakai sistem. |
| `hub-repo/` | Isi repo hub `xnk-template-site`: `hub.json`, workflow `hub.yml` (form simpan/hapus/bangun, harian 03:17 WIB), README (DNS, cara menambah coach). |
| `hub-site/info.html` | Halaman info publik per coach `/<slug>/info/` (T-2241). |
| `tools/hub-check.js`, `tests/hub.test.js`, `tests/hub-brand.test.js` | Cek browser dan tes. |
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

## Versi halaman = versi server coach (T-2220)

Server tiap coach terkunci di versi Library yang tersemat di spreadsheet-nya, sedangkan hub dibangun setiap hari.
Supaya halaman tidak memanggil fungsi yang belum ada di server coach itu, workflow menjalankan
`tools/hub-versions.js` dulu: untuk setiap coach ia memanggil `getServerInfo` (publik, tanpa data) dan membaca
`lib.commit`; tidak menjawab (atau Library lama tanpa fungsi itu) = commit build sebelumnya dari
`xnk.web.id/_hub/versions.json`; tidak ada keduanya = kode terbaru dengan peringatan. Commit lain diambil dari
GitHub dan dibuka sebagai worktree `_xnk-<sha>`, lalu `build-hub.js --versions` memakai `build-tenant.js` dari
checkout itu. `<slug>/lib-latest.json` selalu berisi sidik kode **terbaru**, jadi **XNK → Cek kesehatan** di
spreadsheet coach tahu bila ada versi baru. Bila halaman tetap bertemu fungsi yang tidak dikenal, doPost menjawab
`code: 'unknown_fn'` dan halaman menulis "Server sedang diperbarui…", bukan "Permintaan tidak valid".

## Build aman (T-2221)

Hub tidak lagi mengambil `main` mentah. Job `stable` di workflow **XNK Library** (repo XNK) memindah tag
`hub-stable` ke commit main setelah pemeriksaan Library, kompatibilitas produksi dan cek browser hub lulus; tag
tidak pernah mundur. `hub.yml` membangun dari tag itu (worktree commit coach dari T-2220 tetap commit persisnya),
lalu `tools/hub-verify.js` memeriksa berkas yang akan diunggah. Satu masalah = workflow berhenti sebelum unggah,
situs lama tetap tayang.

## Content-Security-Policy (T-2223)

Setiap halaman coach mendapat `<meta http-equiv="Content-Security-Policy">` sebagai baris pertama `<head>`
(`CSP_APP` di `build-hub.js`). Aplikasi masih memakai ±550 `onclick="…"` yang dibuat di JavaScript, jadi
`script-src` tetap `'unsafe-inline'`; yang dikunci: skrip hanya dari situs sendiri dan tiga CDN, data hanya boleh
dikirim ke Apps Script dan GitHub raw (`connect-src`, `img-src` terbatas), tanpa `<object>`, `<base>` dan iframe.
Halaman depan dan 404 memakai CSP ketat dengan sidik sha256 skrip inline. **Host baru** (CDN, gambar, API) harus
ditambahkan ke `CSP_APP`, atau `hub-check.js` gagal dengan "tanpa penolakan Content-Security-Policy". Perlindungan
penuh (tanpa `'unsafe-inline'`) menunggu T-2224. Google Analytics milik xnk.my.id tidak ikut ke halaman coach.

## Warna aksen dan logo per coach (T-2242)

`hub.json` boleh memberi tiap coach dua isian tambahan:

```json
{ "slug": "claudia", "brand": "Claudia Fit", "exec": "https://script.google.com/macros/s/…/exec",
  "accent": "biru", "logo": "logo/claudia.png" }
```

- `accent`: salah satu warna portal Fase X: `hitam` (= tanpa warna, sama dengan kosong), `biru`, `hijau`, `toska`,
  `ungu`, `pink`, `oranye`. Nilainya ditulis `build-hub.js` sebagai `<html data-accent="…" data-brand-accent="…">`
  di panel dan portal coach itu, dan dipakai halaman info serta kartu di halaman depan. Di aplikasi
  (`applyAccent`, `parts/app/16-portal-x.part`) warna coach adalah **bawaan**: panel, layar masuk, dan klien yang
  belum pernah memilih warna (`profile.aksenSet === false`, dari `_pfFrom_` di `Profil.gs`). Warna yang dipilih
  klien sendiri, termasuk hitam, selalu menang. Menyimpan kartu atlet tanpa mengganti warna tidak lagi menyimpan
  "hitam" sebagai pilihan. Nilai warna disalin di `ACCENTS` (`build-hub.js`); `tests/hub-brand.test.js`
  membandingkannya dengan `parts/theme/05-portal-x.part` dan `PF_ACCENTS`, jadi ubah ketiganya bersama.
- `logo`: jalur berkas **di repo hub** (mis. `logo/claudia.png`). Diperiksa saat build: PNG, JPEG atau WebP
  (isi berkas harus cocok dengan namanya), maksimal 200 KB, tanpa `..`; **SVG ditolak** karena bisa berisi skrip.
  Logo disalin ke `/<slug>/logo.<ext>` dan menggantikan huruf/tanda XNK di favicon, apple-touch-icon, manifest
  (`/<slug>/manifest.webmanifest` dan `/<slug>/klien/manifest.webmanifest`, dibuat untuk setiap coach), kartu
  halaman depan, layar masuk, sidebar dan bar atas (lewat satu `<style>` yang mengganti `.logo-mark`), dan ikut
  salinan offline service worker (`ASSETS`). Sebaiknya persegi, 192–512 px.

**Menambah logo:** di repo hub, **Add file → Upload files**, taruh gambar di folder `logo/`, Commit. Lalu
**Actions → Hub XNK → Run workflow**: aksi `simpan`, slug, isian *logo* = `logo/<nama berkas>` (dan/atau *warna*).
Nama usaha dan link /exec boleh dikosongkan untuk coach yang sudah ada. *warna* `tetap` = tidak diubah,
`hitam` = hapus warna; *logo* kosong = tidak diubah, `-` = hapus logo.

**Halaman dari commit lama.** Semua ini dikerjakan `build-hub.js` setelah `build-tenant.js` (antarmuka
`build({exec, brand})` tidak berubah). Penanda yang tidak ada di halaman dari commit Library lama dilewati. Halaman
lama memakai `applyAccent` lama, yang menghapus warna coach setelah pindah halaman, sampai coach itu memperbarui
Library-nya. Logo tetap tampil karena hanya lewat CSS.

## Halaman info coach `/<slug>/info/` (T-2241)

Halaman publik untuk dibagikan coach (Instagram, WhatsApp): profil, foto dan bio coach, paket dan harga, jam
kosong 7 hari, tombol **Daftar / Booking** ke `/<slug>/klien/`, dan tombol **WhatsApp** bila profil coach punya
nomor. Kartu coach di halaman depan sekarang menautkan halaman ini; kotak "Masuk" tetap ke `/klien/`.

- Sumber: `hub-site/info.html` (template), diisi `infoPage()` di `build-hub.js` (nama usaha, `/exec`, warna, logo,
  deskripsi, canonical, Open Graph; `og:image` = logo bila ada). Data dibaca langsung dari `/exec` coach lewat
  `doPost`: `getCoaches`, `getPriceListPublic`, `getOpenSlots({days: 7})`, ketiganya publik dan tanpa data klien.
- Bukan `Landing.html` produksi: landing itu memakai `onclick="…"`, SEO/JSON-LD, Analytics dan iframe BookingPT
  milik xnk.my.id, sedangkan halaman ini memakai CSP ketat. Halaman baru yang ramping lebih aman dan lebih mudah dijaga.
- CSP: skrip inline hanya dengan sidik sha256, `connect-src 'self' https://script.google.com
  https://script.googleusercontent.com`, gambar dari situs sendiri dan foto Drive (`drive.google.com`,
  `*.googleusercontent.com`). Tanpa `onclick`, tanpa skrip luar, tanpa tulisan "XNK".
- HP dulu (360–430 px, tombol bawah dengan `safe-area`, tombol ≥ 44 px), dua kolom mulai 900 px, terang/gelap
  mengikuti sistem atau pilihan tema di aplikasi coach itu (`<slug>:xnk_theme`, hanya dibaca).
- Service worker panel `/<slug>/` hanya menjawab navigasi ke alamat scope-nya sendiri, jadi `/<slug>/info/` selalu
  dari jaringan (dicek `hub-check.js` dengan worker panel aktif).

## Slug

`^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$`, tanpa `--`; kata sistem dicadangkan (`admin`, `api`, `app`, `klien`, `demo`,
`l`, `login`, `daftar`, `masuk`, `assets`, `static`, `www`, `xnk`, `hub`, `index`, `404`, `coach`, …, daftar di
`build-hub.js` `RESERVED`). Slug tidak diganti setelah dipakai (link klien putus).

## Batas dan keputusan terbuka

- Satu `/exec` hanya boleh milik satu coach (build menolak link ganda).
- Pustaka gerakan/makanan/peta otot disajikan dari `xnk.web.id/_lib/` sejak T-2222 (tidak lagi bergantung pada xnk.my.id). GIF gerakan tetap dari GitHub (dataset asli).
- Setiap coach membawa salinan halaman sendiri (±1 MB); ratusan coach masih jauh di bawah batas GitHub Pages. Bila perlu, berkas berhash yang sama bisa dipakai bersama.
- Push ke HP belum ada di hub.
- Direktori "cari coach" ditunda (butuh persetujuan tiap coach dan moderasi).
