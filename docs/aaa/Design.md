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
`host-local.js` untuk halaman top-level: safe-area, `kb` dari `visualViewport`, `standalone`/`ios`, share/copy langsung, `theme-color`, HTTPS; memanggil `applyHostInfo(d)`. Offline: `offline.js` dipanggil langsung same-origin; `offline-host.js` mendukung mode tanpa iframe. Perubahan pada empat berkas offline harus kompatibel mundur dengan pembungkus iframe dan disalin ke BookingPT-Client lewat `sync-offline.js` di PR yang sama.

## Rollback
Pembungkus iframe lama tetap ada (`/legacy/` untuk panel, `legacy.html` di repo lain). Kembali = menyalin `legacy.html` menjadi `index.html`.
