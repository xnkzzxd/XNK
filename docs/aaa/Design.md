# Phase AAA — Design

Ringkasan; rencana lengkap ada di rencana yang disetujui (lihat [TODO.md](TODO.md)). Setiap perubahan desain ditulis di sini dalam PR yang sama.

## Transport (`rpc`)
Di `Scripts.html`: `rpc(fn, args)` memilih berurutan `window.XNK_TRANSPORT` (override demo/tes) → `google.script.run` (halaman disajikan GAS) → `fetch(XNK_CONFIG.exec)` POST `text/plain` `{fn,args}`. `window.isGas` menjadi `window.hasServer`. Bila balasan `auth:true`, bangun ulang `Error('AUTH_REQUIRED: …')` (`isAuthError` mencocokkan substring). Jawaban `null` ditolak. Timeout 60 dtk; coba ulang otomatis hanya untuk baca dan tulis ber-`cid`.

## Gerbang backend
`src/Api.gs` (dihasilkan `tools/build-api.js` dari `tests/api-lists.js`): tabel nama → fungsi untuk ADMIN + MEMBER + fungsi publik asli. Tanpa OWNER, TRIGGER, `doGet`, `doPost`, `include`, `sanitizeValue`, `escapeHtmlTelegram`. Guard `hasOwnProperty`. Batas ukuran per fungsi (unggahan foto/bukti boleh besar, lainnya 200 KB). Balasan memuat `v: API_VERSION`. `doPost` menjalankan `_applyPendingConfig_(false)` (try/catch, sudah throttle). `_appApi_` menjadi alias agar `app/` tetap jalan. Setiap fungsi tetap menjaga dirinya (`requireAdmin_`/`requireMember_`); `requireOwner_` tetap menolak karena `doPost` anonim.

## Versi
Frontend membandingkan `v` dengan `XNK_CONFIG.apiMin`; bila tidak cocok tampil "Muat ulang aplikasi". Urutan deploy: backend dulu (kompatibel mundur), lalu frontend.

## Build dan deploy
`tools/build-static.js`: `src/Index.html` / `Landing.html` → `dist/` (include diganti, `<style>`/`<script>` besar dipecah jadi `theme.<hash>.css` / `app.<hash>.js`, `config.js` berisi `exec`, `apiMin`, `site`, berkas statis disalin). Sumber kebenaran tetap `src/*.html`. Workflow `pages.yml`: build → artefak Pages; situs lain didorong oleh repo ini. Setelah `pt-scheduler.yml` (clasp).

## Build statis (T-1711..T-1713)
`tools/build-static.js app|landing` mengubah `src/Index.html` / `Landing.html`: setiap `<?!= include() ?>` menjadi berkas `<nama>.<hash10>.css|js` (satu blok `<style>`/`<script>` per berkas, urutan dan isi sama), ditambah `config.js` (`window.XNK_CONFIG = {exec, site}`, tanpa hash). Panel dan portal klien satu halaman (`?view=public&k=`), jadi hanya dua build: `app` dan `landing`. `tools/build-site.js` merakit seluruh situs (daftar putih berkas root yang diterbitkan hari ini + `next/` dan `next/landing/`). `pages.yml` membangun tiap push ke `main` dan menerbitkan bila `PAGES_ACTIONS=true` (setelah backend selesai). Landing memakai judul dan deskripsinya sendiri.

## Situs lain: tarik, bukan dorong (2026-11-07)
Rencana awal: workflow di repo ini mendorong hasil build ke BookingPT-Client dan BookingPT memakai secret token. Itu butuh langkah pemilik (membuat token), dan pemilik meminta AAA diselesaikan tanpa keterlibatannya. Gantinya: repo ini menerbitkan varian `client/` dan `landing-pub/` plus `manifest.json` di `xnk.my.id`; workflow di repo tujuan menariknya sendiri (jadwal tiap jam + `workflow_dispatch`, `GITHUB_TOKEN` miliknya) dan commit ke `main` bila manifest berubah. Konsekuensi: pembaruan di situs lain tertunda sampai satu jam (bisa dipercepat dengan memicu workflow tarik secara manual saat cutover). Aplikasi mendapat satu aturan baru: dengan `XNK_CONFIG.site === 'client'` halaman membuka portal klien tanpa `?view=public`.

## Adaptor host lokal
`host-local.js` (satu sumber di akar repo, dimuat `build-static.js` sebelum skrip aplikasi, hanya situs `app`): halaman di level atas menjawab **protokol pesan pembungkus yang sama** dari window-nya sendiri. App.html mengirim ke `window.top` (di sini window itu sendiri); `hostLocal()` melonggarkan tiga penjaga lama. Dilayani hanya pesan dari window dan origin yang sama: `host?` (zona aman dari `env()` lewat probe, keyboard dari `visualViewport`, `ios`, `standalone`, `share:false`), `theme`, `offline-*` (relay ke `XNKOffline.message`). Karena `share:false`, kartu bagikan memakai `navigator.share` dan clipboard langsung (benar di level atas), jadi `Bagikan.html` tidak berubah. Logika `offline-host.js` (daftar service worker, layar offline saat dibuka tanpa sinyal, tombol "Catat offline", sambung lagi) dipindah ke berkas yang sama tanpa iframe. Berkas yang disinkronkan ke BookingPT-Client (`offline.js`, `offline-host.js`, `offline.css`, `sw.js`) **tidak diubah**: halaman statis memakai salinan berhash dari `offline.js`/`offline.css` dan service worker sendiri (`sw-app.js`, cakupan folder halaman), jadi tidak ada PR kembar. `localStorage` kunci `xnk_off_*` ada di origin `xnk.my.id`, sama dengan pembungkus lama, jadi catatan offline yang dibuat di pembungkus lama masih terbaca setelah cutover panel.

## Cutover `/` dan service worker bersama (T-1720..T-1722)
`build-site.js` menerbitkan build `app` di akar (halaman `/`, berkas berhash, `config.js`, `sw-app.js`, manifest Layar Utama) dan tetap di `/next/`. Pembungkus lama (`index.html` di akar repo) diterbitkan di `/legacy/` tanpa `offline-host.js` (skrip itu mendaftarkan `/sw.js` bercakupan `/` dan akan menggantikan worker panel). **Penyimpanan cache satu per origin**, jadi tiap service worker hanya boleh menghapus awalannya sendiri: `app/sw.js` hanya `xnk-app-v…`, pembungkus lama `xnk-off-…`, worker halaman `xnk-page-<cakupan>-…` (awalan mengikuti cakupan: `root`, `next`); tes `build-static.test.js` menjaga tidak ada awalan yang saling mengawali. Rollback: variabel repo `ROOT_LEGACY=true` + jalankan ulang workflow Pages mengembalikan pembungkus lama ke `/`.

## Rollback
Pembungkus iframe lama tetap ada (`/legacy/` untuk panel, `legacy.html` di repo lain). Kembali = menyalin `legacy.html` menjadi `index.html`.
