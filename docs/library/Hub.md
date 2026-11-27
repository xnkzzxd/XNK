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
| `hub-site/adminxnk.html` | Dasbor pemilik `xnk.web.id/adminxnk/` (data dari XNK HQ, [Pusat.md](Pusat.md)). |
| `tools/coach-ops.js` | Workflow **Coach XNK**: coach baru, hubungkan, perbarui ([Akun.md](Akun.md)). |
| `tools/hub-edit.js` | Tambah, ubah, hapus satu coach di `hub.json` dengan pemeriksaan penuh (dipakai form Actions). |
| `hub-site/` | `index.html` (landing profil brand XNK: hero, fitur klien/coach, tangkapan layar, cara kerja, privasi, daftar coach dari `hub.json` di `<!--COACHES-->` (bagian hilang bila kosong), kotak masuk, tanya jawab, tombol kontak dari `contactUrl` di `<!--CONTACT-->`; sejak T-2265 juga harga, coba demo, form daftar, Instagram — lihat [Halaman depan](#halaman-depan-harga-demo-daftar-t-2265)), `img/` (tangkapan layar demo + `og.jpg`, dibuat oleh `tools/hub-shots.js`; jalankan ulang bila tampilan app berubah banyak), `404.html`, `storage-prefix.js`, `manifest.webmanifest` + `sw.js` (landing bisa dipasang dari Chrome/Edge; service worker hanya melayani `/`, `/manifest.webmanifest`, `/img/*`, tidak pernah halaman coach atau cache coach), `desktop.ico`. Ikon (`img/icon-192.png`, `img/icon-512.png`, `img/logo-64.png`, `desktop.ico`) dibuat dari `logo.png` di akar repo di atas latar hitam; perintahnya ada di `tools/hub-shots.js`. Bagian "Aplikasi" menautkan `github.com/xnkzzxd/XNK/releases/download/app-latest/` (`XNK-Android.apk`, `XNK-Windows.msi`, `XNK-macOS.dmg`), dibangun oleh workflow `apps.yml` di repo XNK. Slug `img` dipakai sistem. |
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
- T-2259: pita atas dengan tempat dan ringkasan (pengalaman, harga per sesi termurah, jumlah jam kosong), menu bagian
  *Profil · Tempat · Paket · Jadwal* yang menempel di atas (HP), bio terpotong 5 baris dengan "Baca selengkapnya",
  paket dengan harga per sesi, **Paling hemat** (harga per sesi terendah per kategori) dan **Pilih paket**, jam kosong
  sebagai deret 7 hari (ketuk hari → jamnya). Foto coach di pita atas desktop bila hanya ada satu coach.
- Service worker panel `/<slug>/` hanya menjawab navigasi ke alamat scope-nya sendiri, jadi `/<slug>/info/` selalu
  dari jaringan (dicek `hub-check.js` dengan worker panel aktif).

## Tempat latihan coach (T-2258…T-2260)

Satu tempat per coach di `hub.json` (publik): `"place": { "name": "Gold's Gym Kemang", "city": "Jakarta Selatan" }`.
Nama ≤ 60 dan kota ≤ 40 karakter, keduanya wajib bila salah satu diisi, tanpa `< >` dan karakter kontrol; spasi
dirapatkan (`cleanPlace` di `build-hub.js`, sama dengan `cleanPlace_` di XNK HQ, dicek tes). Diisi dari
`/adminxnk` → **Tempat** (XNK HQ menjalankan Hub XNK aksi `simpan` dengan isian `tempat` dan `kota`), atau langsung
lewat form Actions (*tempat* kosong = tetap, `-` = hapus). Tempat ikut terbawa saat link /exec coach diganti.

- Halaman info: tempat dirender saat build (`<!--PLACE-->`, `<!--PLACESEC-->`, `<!--PLACENAV-->`) di pita atas, bagian
  **Tempat latihan** dengan **Buka di Maps** (link pencarian Google Maps, bukan peta tertanam, jadi CSP tidak berubah)
  dan deskripsi halaman. Tanpa tempat di `hub.json`, kolom *Lokasi* profil coach (`getCoaches`) dipakai bila ada.
- Halaman depan: tiap kartu coach menampilkan tempat; `data-city` / `data-q` dipakai kotak cari (≥ 2 coach) dan
  pilihan kota (≥ 2 coach bertempat, kota digabung tanpa beda huruf besar/kecil). Tidak ada yang disimpan di perangkat.

## Halaman depan: harga, demo, daftar (T-2265)

Halaman depan adalah proposal coach yang selalu terbaru (proposal PDF 29 Okt 2026 sudah lewat masa berlakunya).

- **Harga** (`<!--HARGA-->`): dirender dari `tools/hub-harga.js` (`TIERS`, `SETUP`, `COMPARE`, `FIRST_MONTH_FREE`).
  Angkanya **harus sama** dengan `PUSAT_TIERS` / `PUSAT_SETUP` di `xnk-pusat/src/Pusat.gs`; `tests/hub.test.js` gagal
  bila berbeda, dan `hub-site/index.html` tidak boleh menulis "Rp …" sendiri (`{{mulai}}` = harga bulanan termurah).
  Saklar Bulanan / Tahunan hanya mengganti kelas `#harga.yr` (tanpa JavaScript = bulanan). Fitur per paket mengikuti
  proposal, dengan teks yang benar untuk hub: halaman info publik di semua paket, notifikasi coach lewat push / email /
  Telegram, Laporan PDF dan program otomatis di Pro dan Studio, akun Google + spreadsheet dibuatkan pemilik.
- **Coba demo**: tautan ke `https://xnk.my.id/demo/` (panel, PIN 123456) dan `…/demo/?klien`, tab baru. `hub-check.js`
  tidak membukanya (permintaan ke xnk.my.id dihitung gagal di sana).
- **Daftar** (`<!--DAFTAR-->…<!--/DAFTAR-->`): form hanya dipasang bila `contactUrl` berbentuk `https://wa.me/<nomor>`
  (`data-wa`); isinya disusun di browser menjadi pesan WhatsApp (`?text=`), tidak ada yang dikirim ke server atau
  disimpan. Kontak lain = kartu dengan tombol kontak; tanpa kontak = kartu teks saja. Tombol **Pilih <paket>** mengisi
  paket dan cara bayar yang sedang dipilih.
- **Instagram**: `hub.json` `instagramUrl` (opsional, `https://instagram.com/<nama>` atau `www.`; `IG_RE`) →
  `<!--IG-->` (tombol di bagian Daftar) dan `<!--IG-FOOT-->` (kaki halaman).
- **Mesin pencari**: `robots.txt` (semua boleh kecuali `/adminxnk/`, `/_hub/`, `/_lib/` dan panel / portal tiap coach
  aktif; `/<slug>/info/` boleh) dan `sitemap.xml` (halaman depan + `/<slug>/info/` coach aktif, tanpa `lastmod` supaya
  build tetap sama). Halaman depan membawa JSON-LD `SoftwareApplication` (harga bulanan per paket) dan `FAQPage` (dari
  `.faq`, bentuk `<details><summary>…</summary><p>…</p></details>` harus tetap). JSON-LD tidak dijalankan browser, jadi
  tidak perlu sidik CSP.
- **Gambar**: `tools/hub-shots.js` mengambil 8 layar HP (+ `coach-klien` = `openProfile`, `coach-laporan` =
  `reportOpen` + `rpBuild`), satu layar desktop dan `og.jpg` dari demo; bangun ulang demo dulu.

## Web Push (T-2240)

Satu kunci VAPID untuk seluruh hub (satu origin): `hub.json` `vapidPublic` (diperiksa `readHub`, diterbitkan di `/_hub/push.json`), kunci privat hanya di secret repo hub `HUB_VAPID_PRIVATE`. Kartu notifikasi di panel dan portal muncul begitu coach menerima kunci dari XNK HQ (`hubPushKey`, `PUSH_ENABLED=true`); tidak ada host baru di CSP (berlangganan push tidak memakai `connect-src`). `pushPage` di `build-hub.js` membetulkan worker versi coach mana pun: url `/` dari Push.gs membuka cakupan worker (`/<slug>/` atau `/<slug>/klien/`, bukan halaman depan hub), worker panel tidak mengambil alih jendela `/<slug>/klien/`, ikon = logo coach atau `/img/icon-192.png`. Workflow **Push XNK** (`push.yml`) mengirim; lihat [push/Setup.md](../push/Setup.md).

## Slug

`^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$`, tanpa `--`; kata sistem dicadangkan (`admin`, `api`, `app`, `klien`, `demo`,
`l`, `login`, `daftar`, `masuk`, `assets`, `static`, `www`, `xnk`, `hub`, `index`, `404`, `coach`, …, daftar di
`build-hub.js` `RESERVED`). Slug boleh diganti tanpa memutus link lama: lihat bagian berikut (T-2243).

## Ganti slug coach (T-2243)

Link `xnk.web.id/<lama>/…` yang sudah dibagikan ke klien (WhatsApp, kode QR, bio Instagram) **tetap jalan** dan
mengarah ke alamat baru. Klien dan coach **tidak perlu masuk ulang**, catatan offline dan antrean di HP tetap ada.
Coach lain tidak terpengaruh.

### Langkah untuk pemilik (paling mudah)

1. Buka `xnk.web.id/adminxnk` dan masuk dengan PIN.
2. Di kartu coach itu tekan **Ganti slug**, ketik nama baru (huruf kecil, angka, tanda hubung, 3 sampai 30 karakter),
   lalu **OK** dan konfirmasi.
3. XNK HQ mengerjakan semuanya: pendaftaran, status, backup dan push pindah ke nama baru; folder Drive
   `XNK Backup/<lama>` berganti nama jadi `XNK Backup/<baru>` (salinan lama tetap di dalamnya); coach menerima alamat
   situs baru (`SITE_URL`, dipakai link WhatsApp, kode QR kartu dan Cek kesehatan); workflow **Hub XNK** dijalankan
   dengan aksi `ganti-slug`.
4. Tunggu ±2 menit sampai situs dibangun ulang. Selama itu kartu nama lama di `/adminxnk` tampil "belum terdaftar";
   tekan **Cek ulang** sesudahnya.
5. Beri tahu coach alamat barunya. Coach yang memasang panel di Layar Utama HP sebaiknya memasang ulang dari alamat baru
   (yang lama tetap terbuka, hanya dengan bilah alamat).

Bila XNK HQ tidak punya `GITHUB_TOKEN`, langkah 3 berhenti sebelum workflow; pesannya menyuruh menjalankan
**repo hub → Actions → Hub XNK → Run workflow**, aksi `ganti-slug`, *slug* = nama lama, *slug_baru* = nama baru.
Bila coach memakai Library lama (tanpa `hubSiteUrl`), alamat baru dikirim lagi setiap pagi sampai diterima (perbarui
coach dulu: **Coach XNK → perbarui**). Workflow itu juga bisa dijalankan sendiri lebih dulu; XNK HQ lalu tidak
menjalankannya dua kali.

Kembali ke nama lama boleh (Ganti slug lagi ke nama itu). Nama lama tidak bisa dipakai coach lain selama tercatat
sebagai alamat lama.

### Cara kerjanya

- `hub.json` coach mendapat tiga isian, ditulis `tools/hub-edit.js ganti-slug <lama> <baru>`:
  `"aliases": ["<lama>"]` (alamat yang dialihkan), `"storageSlug": "<lama>"` (awalan penyimpanan, selalu slug
  pertama coach), `"secret": "CLASP_<LAMA>"` (secret clasp yang sudah ada; job *plan* `coach.yml` dan `coach-ops.js`
  memakainya, jadi secret tidak perlu dibuat ulang). `readHub` menolak alias yang tidak valid, kata sistem, atau nama
  yang sudah dipakai slug/alias coach mana pun, dan dua coach dengan `storageSlug` sama. `simpan` (warna, logo, link
  /exec baru) tidak membuang isian itu.
- `build-hub.js` (pasca-proses; `build-tenant.js` dan build versi lama tidak berubah): awalan `localStorage` dan cache
  service worker memakai `storageSlug`, halaman tetap di `/<baru>/`. Untuk setiap alias:
  `/<lama>/`, `/<lama>/klien/`, `/<lama>/info/` = halaman pengalih kecil (CSP ketat bersidik, `noindex`,
  `location.replace` ke alamat baru dengan `?query` dan `#hash`, `<meta refresh>` sebagai cadangan), dan
  `/<lama>/lib-latest.json`.
- **Worker pengganti** (`hub-site/alias-sw.js`) di `/<lama>/sw-app.js` dan `/<lama>/klien/sw-app.js`: HP yang pernah
  membuka alamat lama memeriksa berkas itu dan memasangnya. Ia membuka halaman dari jaringan (halaman pengalih), tanpa
  sinyal langsung mengalihkan ke alamat baru (yang punya salinan offline sendiri), dan **meneruskan notifikasi push**:
  langganan push terikat ke cakupan lama, jadi push yang masih dikirim ke langganan itu tampil di sini dan ketukannya
  membuka alamat baru. Push memakai tag = jenis, jadi bila HP juga berlangganan di alamat baru, notifikasi yang sama
  menggantikan yang lain (tidak dobel). Cache tidak disentuh.
- Halaman depan: login yang tersimpan dengan awalan lama (`<lama>:xnk_admin_token`) langsung membuka `/<baru>/`
  (peta `MAP` disisipkan saat build).
- `hub-verify.js` memeriksa halaman pengalih, worker pengganti dan awalan `storageSlug` sebelum tayang;
  `hub-check.js` menguji ganti slug di situs yang sedang tayang (link lama `?x=1#y`, login lama, tanpa sinyal).

## Coach tidak aktif (T-2252)

Coach yang keluar (`/adminxnk` → **Coach keluar…**, [Pusat.md](Pusat.md#coach-keluar-t-2252)) mendapat
`"inactive": true` di `hub.json` lewat workflow **Hub XNK** aksi `nonaktif` (`hub-edit.js nonaktif <slug>`; slug lama
juga diterima). Aksi `aktifkan` menghapusnya lagi. `simpan` dan `ganti-slug` mempertahankan tanda itu.

- `build-hub.js`: coach tidak aktif **tidak dibangun sebagai aplikasi** (tanpa `build-tenant`, tanpa `config.js`, tanpa
  `/exec` coach). `/<slug>/`, `/<slug>/klien/` dan `/<slug>/info/` = satu halaman kecil "Situs coach ini tidak aktif
  lagi" (CSP ketat bersidik, `noindex`, tombol **Hubungi pengelola XNK** dari `contactUrl` dan halaman depan `/?hub`).
  Skrip inline-nya melepas service worker di cakupan `/<slug>/` dan menghapus cache `xnk-page-<storageSlug>~…`.
- **Worker pembersih** (`hub-site/inactive-sw.js`) di `/<slug>/sw-app.js` dan `/<slug>/klien/sw-app.js`: HP yang masih
  punya worker aplikasi lama memasangnya pada pemeriksaan berikutnya; ia menghapus cache halaman coach itu, melepas
  dirinya dan memuat ulang jendelanya, jadi salinan aplikasi lama tidak tampil lagi. Tanpa pengendali fetch.
  `localStorage` tidak disentuh.
- Halaman depan: kartu coach tidak aktif hilang, dan login tersimpan coach itu (`OFF`, awalan `storageSlug` dan slug
  lama) tidak membuka situsnya otomatis. Alamat lama (`aliases`) tetap mengalihkan ke `/<slug>/` (halaman tidak aktif).
- Dilewati untuk coach tidak aktif: `hub-versions.js` (server tidak ditanya, tidak ada di `_hub/versions.json`),
  **Coach XNK** `perbarui` (`coach-ops.js` "dilewati: coach tidak aktif"; rencana `coach.yml` tidak memasukkannya, jadi
  tidak pernah jadi kenari), **Push XNK** (`hub-push.js`, juga XNK HQ). `lib-latest.json` tetap dibuat.
- `hub-verify.js` memeriksa halaman tidak aktif (CSP ketat, noindex, tanpa `/exec`, tanpa `config.js`), awalan worker
  pembersih, dan bahwa halaman depan tidak menautkannya. Coach lain dibangun **byte demi byte sama**
  (`tests/hub-leave.test.js`); `hub-check.js` menguji coach aktif yang menjadi tidak aktif di browser sungguhan.

## Batas dan keputusan terbuka

- Satu `/exec` hanya boleh milik satu coach (build menolak link ganda).
- Pustaka gerakan/makanan/peta otot disajikan dari `xnk.web.id/_lib/` sejak T-2222 (tidak lagi bergantung pada xnk.my.id). GIF gerakan tetap dari GitHub (dataset asli).
- Setiap coach membawa salinan halaman sendiri (±1 MB); ratusan coach masih jauh di bawah batas GitHub Pages. Bila perlu, berkas berhash yang sama bisa dipakai bersama.
- Direktori "cari coach" ditunda (butuh persetujuan tiap coach dan moderasi).
