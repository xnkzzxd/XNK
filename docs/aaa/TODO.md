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

## AAA4 — Panel (xnk.my.id)
- [ ] T-1716 `host-local.js` (safe-area, keyboard, share/copy, theme, HTTPS).
- [ ] T-1717 Offline same-origin; `offline-host.js` tanpa iframe; sinkron ke BookingPT-Client.
- [ ] T-1718 `sw.js` precache `dist` (`xnk-off-v3`).
- [ ] T-1719 `offline-check.js`, bagian pembungkus `browser-check.js`, `share-check.js` disesuaikan.
- [ ] T-1720 Pembungkus lama ke `/legacy/`.
- [ ] T-1721 👤 Setujui waktu cutover.
- [ ] T-1722 Cutover panel: `index.html` root = panel statis.

## AAA5 — Landing (xnkbooking.my.id)
- [ ] T-1723 `add_repo` BookingPT; build `site=landing`.
- [ ] T-1724 `redirectToBooking`, `IMG_BASE`, cermin harga (`?view=prices`) tetap.
- [ ] T-1725 Serah-terima landing → portal lewat URL (`?k=` / `memberLoginByKey`).
- [ ] T-1726 Cutover landing.

## AAA6 — Portal (book.xnkbooking.my.id)
- [ ] T-1727 👤 Secret token untuk mendorong build ke BookingPT-Client dan BookingPT.
- [ ] T-1728 Build `site=client` ke BookingPT-Client; `legacy.html`.
- [ ] T-1729 `sync-offline.js --check`, `offline-check.js ../BookingPT-Client`.
- [ ] T-1730 Cek ulang `android/`, `ios/` (UA `XNKAndroid`/`XNKiOS`), `app/`, Capacitor.
- [ ] T-1731 Cutover portal (jam sepi).

## AAA7 — Dokumen dan dua jalur
- [ ] T-1732 Tes dua mode tetap di CI.
- [ ] T-1733 Panduan rollback tertulis.
- [ ] T-1734 Perbarui `docs/Agent.md` §1 dan §7, `README.md`, `apps-script/README.md`, `platform/CI.md`.
- [ ] T-1735 Ukur muat awal sebelum vs sesudah; tulis di sini.
