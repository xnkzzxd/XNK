# Phase AAA — TODO (T-1700+)

Legenda: `[ ]` belum, `[~]` sedang, `[x]` selesai. Ambil nomor terendah yang belum selesai dan dependensinya beres. Pemilik: 👤 = perlu pemilik.

## AAA0 — Dokumen dan ukur
- [x] T-1700 Dokumen fase (PRD, Design, TODO), baris di CLAUDE.md, catatan "digantikan" di Phase V.
- [x] T-1701 **Gerbang go/no-go: lolos (2026-11-06, Chrome pemilik, 12 panggilan berurutan).** CORS dan redirect `xnk.my.id` → `script.google.com` → `script.googleusercontent.com` jalan (status 200, jawaban JSON terbaca). `google.script.run.getPriceList()` median **3608 ms** (dingin 3183, min 2799, p90 3862). `fetch` ke `doPost` untuk `getPriceList` median **2156 ms** (dingin 2354, min 1767, p90 2592), tetapi panggilan itu **ditolak** oleh daftar putih lama, jadi tanpa kerja server; batas ±30 % = 4690 ms. Muat halaman Landing lewat GAS sekarang 7811 ms sampai tampil. `getPortalBootstrap` anonim lewat `fetch`: median 6415 ms, 130,62 KB. **Belum adil sepenuhnya:** ukur ulang fungsi yang sama dua arah (sukses) di T-1705 setelah `getPriceList` ada di daftar putih, lalu tulis angkanya di sini.

## AAA1 — Gerbang backend
- [ ] T-1702 `tests/api-lists.js` (daftar dipindah dari `security.test.js`, diimpor kedua pihak).
- [ ] T-1703 `tools/build-api.js` → `src/Api.gs`; tes gagal bila basi.
- [ ] T-1704 Perluas `doPost`: tabel penuh, batas ukuran per fungsi, `API_VERSION`, `_applyPendingConfig_`; `_appApi_` jadi alias.
- [ ] T-1705 Tes `doPost` (admin tanpa/dengan token member ditolak, `constructor`, OWNER/TRIGGER tidak terekspos, ukuran); perbarui tes lama.
- [ ] T-1706 Tes kontrak statis: nama di `adminCall/memberCall/publicCall/call/google.script.run` ada di tabel dengan kategori cocok.

## AAA2 — Lapisan rpc
- [ ] T-1707 `rpc` di `Scripts.html` (transport, error, timeout, retry aman).
- [ ] T-1708 `tokenRunner`/`call`/`publicCall` dan 3 panggilan langsung di `App.html`.
- [ ] T-1709 `LandingScript.html`, `isGas` → `hasServer`, parameter URL hanya `URLSearchParams`.
- [ ] T-1710 `browser-check.js` dua mode (fetch utama, smoke GAS); `demo-runtime.js` lewat `XNK_TRANSPORT`.

## AAA3 — Build statis dan Pages
- [ ] T-1711 `tools/build-static.js` + `config.js`.
- [ ] T-1712 `tests/build-static.test.js`.
- [ ] T-1713 `pages.yml`; `checks.yml` dan `check-syntax.js` memeriksa hasil build.
- [ ] T-1714 👤 Pages XNK: Source = "GitHub Actions".
- [ ] T-1715 Pratinjau pemilik `xnk.my.id/next/`.

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
