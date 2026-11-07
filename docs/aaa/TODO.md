# Phase AAA — TODO (T-1700+)

Legenda: `[ ]` belum, `[~]` sedang, `[x]` selesai. Ambil nomor terendah yang belum selesai dan dependensinya beres. Pemilik: 👤 = perlu pemilik.

## AAA0 — Dokumen dan ukur
- [x] T-1700 Dokumen fase (PRD, Design, TODO), baris di CLAUDE.md, catatan "digantikan" di Phase V.
- [x] T-1701 **Gerbang go/no-go: lolos (2026-11-06, Chrome pemilik, 12 panggilan berurutan).** CORS dan redirect `xnk.my.id` → `script.google.com` → `script.googleusercontent.com` jalan (status 200, jawaban JSON terbaca). `google.script.run.getPriceList()` median **3608 ms** (dingin 3183, min 2799, p90 3862). `fetch` ke `doPost` untuk `getPriceList` median **2156 ms** (dingin 2354, min 1767, p90 2592), tetapi panggilan itu **ditolak** oleh daftar putih lama, jadi tanpa kerja server; batas ±30 % = 4690 ms. Muat halaman Landing lewat GAS sekarang 7811 ms sampai tampil. `getPortalBootstrap` anonim lewat `fetch`: median 6415 ms, 130,62 KB. **Belum adil sepenuhnya:** ukur ulang fungsi yang sama dua arah (sukses) di T-1705 setelah `getPriceList` ada di daftar putih, lalu tulis angkanya di sini.

## AAA1 — Gerbang backend
- [x] T-1702 `tests/api-lists.js` (daftar dipindah dari `security.test.js`, diimpor kedua pihak).
- [x] T-1703 `tools/build-api.js` → `src/Api.gs`; tes gagal bila basi.
- [x] T-1704 Perluas `doPost`: tabel penuh, batas ukuran per fungsi, `API_VERSION`, `_applyPendingConfig_`; `_appApi_` jadi alias.
- [x] T-1705 Tes `doPost` (semua fungsi admin/member menolak token buruk dan token member lewat `doPost`, `constructor`/OWNER/TRIGGER/helper tidak terekspos, putaran login admin, `v` di balasan, batas ukuran per fungsi); tes lama diperbarui (554 lolos).
- [x] T-1705b **Ukur ulang yang adil (2026-11-07, Chromium headless di sesi cloud, 2 putaran x 12 panggilan berurutan, keduanya sukses, urutan fetch/run ditukar antar putaran).** `getPriceList`: `fetch` median ~3507 ms vs `google.script.run` ~3154 ms (rasio **1,11**). `getPriceListPublic`: ~2318 ms vs ~1845 ms (rasio **1,26**). Gerbang ±30 % **lolos, tetapi tipis**: lewat `fetch` tiap panggilan ±0,35–0,47 dtk lebih lambat (pengalihan `script.google.com` → `script.googleusercontent.com`; tidak bisa dihindari di web app Apps Script). Angka T-1701 (2156 vs 3608 ms) menyesatkan karena panggilan `fetch` waktu itu ditolak (tanpa kerja server); pakai angka ini. Konsekuensi: jaga jumlah panggilan per layar tetap kecil (satu bootstrap, aturan "backend-first" di Agent.md §4) dan jangan menambah panggilan beruntun.
- [x] T-1706 Tes kontrak statis: nama di `adminCall/memberCall/publicCall/call/google.script.run` ada di tabel dengan kategori cocok.

## AAA2 — Lapisan rpc
- [x] T-1707 `rpc` di `Scripts.html` (transport, galat, timeout; tanpa coba ulang otomatis, sejajar `google.script.run`; 10 tes di `tests/rpc.test.js`).
- [x] T-1708 `tokenRunner`/`publicCall` dan 3 panggilan langsung di `App.html` lewat `rpc`.
- [x] T-1709 `LandingScript.html` lewat `rpc`; `isGas` → `hasServer()`; parameter URL lewat `URLSearchParams` bila tidak ada `google.script.url`.
- [x] T-1710 `browser-check.js` dua mode (`fetch` bawaan lewat `doPost` sungguhan, `RPC_MODE=gas` jalan lama; 1135 centang lolos di keduanya, ±9 menit per mode), `demo-runtime.js` lewat `XNK_TRANSPORT`, `checks.yml` menjalankan kedua mode.

## AAA3 — Build statis dan Pages
- [x] T-1711 `tools/build-static.js app|landing`: includes jadi berkas berhash (`theme/scripts/app/bagikan` atau `landing`), `config.js` (`exec`, `site`), head meniru yang ditambah `doGet` dan pembungkus lama. Landing tetap memakai judul dan deskripsi sendiri (`Coach Jizdan · XNK Personal Training`) dan tanpa `noindex`, bukan judul `doGet`, karena halaman ini nanti jadi halaman publik sendiri.
- [x] T-1712 `tests/build-static.test.js` (13 tes) dan mode `PAGES=static` di `browser-check.js` (halaman disajikan dari hasil build; semua centang berjalan terhadap keluaran build).
- [x] T-1713 `tools/build-site.js` (daftar putih berkas yang diterbitkan Pages hari ini + `next/` dan `next/landing/`, `.nojekyll`; `tests/build-site.test.js` gagal bila ada berkas root baru yang belum diklasifikasi), `.github/workflows/pages.yml` (build tiap push ke `main`; deploy hanya bila variabel `PAGES_ACTIONS=true`, menunggu deploy backend commit yang sama), `checks.yml` (langkah build + `PAGES=static` + `RPC_MODE=gas`), `dist/` di `.gitignore`.
- [x] T-1714 Source Pages = GitHub Actions dan variabel `PAGES_ACTIONS=true` (2026-11-06, lewat agen panel Chrome pemilik); run Pages #2 hijau (build 13 dtk, deploy 49 dtk).
- [x] T-1715 Pratinjau terbit: `/next/` (login panel), `/next/?view=public`, `/next/landing/`, `/app/`, `/demo/`, `foods|exercises|figure` JSON semua terbuka tanpa galat, `/` tetap pembungkus lama. Waktu sampai halaman bisa dipakai (2026-11-07, Chromium headless, kontainer cloud, cache dingin, median 5 putaran, CDN dikosongkan di kedua sisi): panel statis `/next/` **614 ms** vs pembungkus lama `/` **3685 ms** (±6x lebih cepat); landing statis **880 ms** vs Apps Script `?view=Landing` **3264 ms** (±3,7x). Pengukuran di jaringan rumah akan berbeda, tetapi rasio ini yang relevan; data server tetap menunggu panggilan pertama (±2–3,5 dtk). Temuan: lihat T-1715b.

- [x] T-1715b Temuan dari pratinjau: `/demo/` dan `/next/` satu origin (`xnk.my.id`), dan demo dulu menghapus semua kunci `xnk_*` di localStorage (token admin, `xnk_client_cache`, antrean latihan yang belum terkirim) lalu menulis data contoh; `/next/?view=public` sempat menampilkan data Sari dari salinan perangkat. Perbaikan: `demo-runtime.js` menyimpan state perangkat demo hanya di memori (localStorage diganti Proxy; hanya `xnk_theme` dibagi; bila browser menolak, demo tidak jalan). `tools/demo-check.js` (Playwright, dijalankan di `checks.yml`) membuktikan demo terbuka masuk, tidak menyentuh kunci asli, dan tidak meninggalkan kunci; pada demo lama pengecekan ini gagal 6 kali. Harus beres sebelum AAA4 karena panel akan berbagi origin dengan `/demo/`.

- [x] T-1715c CI dipecah: `checks.yml` jadi tiga job paralel (`fast checks`, `browser check (static build)`, `browser check (Apps Script fallback)`) plus job `checks` yang hanya mengumpulkan hasilnya (nama itu tetap satu-satunya yang diwajibkan branch protection); Playwright lewat composite action `.github/actions/setup-playwright`. Sebelumnya satu job ±30 menit dari batas 40; sekarang tiap job ±10–12 menit.

## Gerbang W: AAA4 menunggu Phase W (keputusan pemilik 2026-11-07)

Pemilik menyuruh Claude menyelesaikan AAA tanpa keterlibatan pemilik, dan **menunggu Phase W** ([../speed/TODO.md](../speed/TODO.md)) karena keduanya menyentuh berkas yang sama (`Index.html`, `App.html`, `Bagikan.html`, `Theme.html`, `sw.js`, `offline*.js`, `tools/browser-check.js`, `tools/build-static.js`, `tools/demo-runtime.js`). Pekerjaan server Phase W (`Kode.gs` dan lainnya) tidak bentrok dengan AAA.

AAA4 mulai hanya bila semua ini benar di `main`:
1. `docs/speed/TODO.md`: T-1805 (W2), T-1810 (Bagikan keluar dari inline) dan T-1811 (skeleton, landing) berstatus `[x]` atau `[-]`. T-1812 (memecah `App.html`/`Theme.html`) dikerjakan **bersama AAA4**, bukan ditunggu.
2. Tidak ada PR terbuka (mis. dari cabang `claude/speed-*`) yang mengubah berkas di daftar atas.
3. `main` hijau (workflow `Checks` terakhir sukses).

Selama menunggu, Claude hanya mengerjakan hal yang tidak menyentuh berkas itu (dokumen AAA, rencana). Pemeriksaan dilakukan berkala oleh tugas terjadwal "Cek gerbang W (AAA4)". Syarat belum terpenuhi = tidak melakukan apa pun dan tidak mengirim pesan.

Cutover (T-1722, T-1726, T-1731) dilakukan Claude sendiri sesuai instruksi pemilik, hanya bila: semua tes dan CI hijau, pratinjau `/next/` diperiksa dengan Chromium headless (termasuk jalur galat login memakai PIN/nomor salah ke backend sungguhan, yang bisa diuji tanpa kredensial), dan jalan kembali (`legacy`) sudah ada dan dicoba. **Celah yang diketahui:** login berhasil dengan PIN/nomor sungguhan tidak bisa diuji oleh Claude; jalurnya sama dengan jalur galat dan sudah dicakup tes `doPost`, dan pemulihan = menyalin `legacy.html` menjadi `index.html`.

## AAA4 — Panel (xnk.my.id)
- [x] T-1716 `host-local.js` (root, satu sumber): halaman statis di level atas menjawab protokol pembungkus dari window-nya sendiri (`host?` → zona aman, keyboard, iOS/standalone; `theme`; relay `offline-*`); tanpa iframe `share:false`, jadi kartu bagikan memakai `navigator.share`/clipboard langsung dan `Bagikan.html` tidak diubah. `App.html`: tiga penjaga `window.top === window` dilonggarkan lewat `hostLocal()`. Di dalam bingkai berkas ini tidak melakukan apa pun.
- [x] T-1717 Offline tanpa iframe: logika `offline-host.js` (daftar service worker, layar offline saat dibuka tanpa sinyal, tombol "Catat offline" setelah 10 dtk, sambung lagi = muat ulang halaman) ada di `host-local.js`. **Berkas yang disinkronkan ke BookingPT-Client (`offline.js`, `offline-host.js`, `offline.css`, `sw.js`) sengaja tidak diubah**, supaya `sync-offline.js --check` tetap hijau dan BookingPT-Client tidak perlu PR bersamaan; `build-static.js` menyalin `offline.js`/`offline.css` ke keluaran dengan hash (mode `coach` atau `client` dari URL).
- [x] T-1718 Service worker halaman statis: `sw-app.js` (dibuat dari `tools/sw-app.template.js`) di folder halaman, cakupannya hanya folder itu (`/next/`), terpisah dari `sw.js` di akar yang tidak berubah. Menyimpan halaman, semua berkas berhash, `config.js` dan pustaka statis; halaman jaringan-dulu dengan salinan saat offline; nama cache berubah mengikuti isi (`xnk-app-<hash>`). Saat cutover akar (T-1722) service worker di akar harus diganti; lihat catatan di T-1722.
- [~] T-1719 `tools/host-check.js` (Playwright, di `checks.yml`): halaman menjawab pesan host-nya sendiri, zona aman berubah sampai `--sa-*`, tema, relay offline, pesan dari bingkai lain diabaikan, service worker aktif dan halaman terbuka tanpa jaringan, tidak berbuat apa pun di dalam bingkai. `browser-check`/`offline-check`/`share-check` untuk pembungkus akar tetap karena akar belum berubah; disesuaikan saat cutover (T-1722). Hasil 2026-11-07: `browser-check` 1139 centang, 0 gagal di mode statis (dengan `host-local` aktif) dan di `RPC_MODE=gas`; `host-check` 14 centang lolos; `browser-check` memblokir service worker (dicek tersendiri oleh `host-check`).
- [x] T-1720 Pembungkus lama diterbitkan di `/legacy/` oleh `build-site.js` (sumbernya tetap `index.html` di akar repo). Salinan `/legacy/` tidak memuat `offline-host.js`: skrip itu mendaftarkan `/sw.js` dengan cakupan `/` dan akan menggantikan service worker panel setiap kali `/legacy/` dibuka (ditemukan oleh `site-check`).
- [x] T-1721 Keputusan pemilik 2026-11-07: dilakukan Claude tanpa persetujuan waktu. Sakelar rollback: variabel repo `ROOT_LEGACY=true` lalu jalankan ulang workflow Pages (`/` jadi pembungkus lama lagi); atau PR yang membalik `rootLegacy`.
- [x] T-1722 Cutover `/` = panel statis: `build-site.js` menulis build `app` (varian akar: manifest Layar Utama) ke akar situs; `/next/` tetap. Berlaku saat PR ini di-merge dan Pages terbit. Ditemukan dan diperbaiki saat menyiapkan: (1) cache dipakai bersama semua service worker di origin yang sama dan `app/sw.js` menghapus setiap cache selain miliknya, jadi membuka `/app/` menghapus cache panel (dan cache pembungkus lama): `app/sw.js` kini hanya menghapus `xnk-app-v…`; (2) awalan cache worker halaman mengikuti cakupan (`xnk-page-root-`, `xnk-page-next-`) karena salinan di `/` dan `/next/` saling menghapus; (3) `/legacy/` tanpa `offline-host.js`. `tools/site-check.js` (di `checks.yml`) menguji semuanya. Situs hidup diperiksa 2026-11-07 dengan Chromium headless: `/` = panel statis (login, `sw-app.js` di akar, manifest), `getPriceListPublic` ke backend sungguhan 28 paket, galat login "Nomor WhatsApp tidak ditemukan", `/legacy/` pembungkus lama, `/demo/`, `/app/`, `/next/` tetap, tanpa galat skrip. Jalan kembali: variabel repo `ROOT_LEGACY=true` lalu jalankan ulang Pages.

## AAA5 — Landing (xnkbooking.my.id)
- [x] T-1723 BookingPT ada di sesi (add_repo); build `site=landing`. Temuan: BookingPT `index.html` adalah halaman SEO (dibuat `tools/build.js`) yang memuat landing Apps Script dalam satu iframe; yang diganti hanya `src` iframe itu (teks SEO dan tata letak tetap), ke landing statis same-origin di `/l/`.
- [~] T-1724 `redirectToBooking`, `IMG_BASE`, cermin harga (`?view=prices`) tetap.
- [x] T-1725 Serah-terima landing → portal: landing hanya membuka `BOOKING_URL` (tanpa token); `?k=` dipakai tautan pengingat dan dibaca `startPublicPortal`, tidak berubah. Tidak ada localStorage bersama yang diandalkan.
- [ ] T-1726 Cutover landing.

## AAA6 — Portal (book.xnkbooking.my.id)
- [~] T-1727 **Tarik, bukan dorong (perubahan desain 2026-11-07, agar tidak perlu secret dari pemilik).** `build-site.js` menerbitkan juga `client/` (`site=client`: tanpa query membuka portal) dan `landing-pub/` (`site=landing`) beserta `manifest.json` (daftar berkas dan hash) di `xnk.my.id`. Repo BookingPT-Client (dan BookingPT) punya workflow sendiri (`schedule` tiap jam + `workflow_dispatch`) yang mengunduh berkas dari `https://xnk.my.id/…` ke `main`-nya bila `manifest.json` berubah, memakai `GITHUB_TOKEN` repo itu sendiri (`contents: write`). Pilihan lama (XNK mendorong ke repo lain dengan secret) tetap bisa dipakai nanti bila pemilik membuat tokennya.
- [ ] T-1728 Build `site=client` ke BookingPT-Client; `legacy.html`.
- [ ] T-1729 `sync-offline.js --check`, `offline-check.js ../BookingPT-Client`.
- [ ] T-1730 Cek ulang `android/`, `ios/` (UA `XNKAndroid`/`XNKiOS`), `app/`, Capacitor.
- [ ] T-1731 Cutover portal (jam sepi).

## AAA7 — Dokumen dan dua jalur
- [ ] T-1732 Tes dua mode tetap di CI.
- [ ] T-1733 Panduan rollback tertulis.
- [ ] T-1734 Perbarui `docs/Agent.md` §1 dan §7, `README.md`, `apps-script/README.md`, `platform/CI.md`.
- [ ] T-1735 Ukur muat awal sebelum vs sesudah; tulis di sini.
