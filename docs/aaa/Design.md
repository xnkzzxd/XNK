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

## Adaptor host lokal
`host-local.js` untuk halaman top-level: safe-area, `kb` dari `visualViewport`, `standalone`/`ios`, share/copy langsung, `theme-color`, HTTPS; memanggil `applyHostInfo(d)`. Offline: `offline.js` dipanggil langsung same-origin; `offline-host.js` mendukung mode tanpa iframe. Perubahan pada empat berkas offline harus kompatibel mundur dengan pembungkus iframe dan disalin ke BookingPT-Client lewat `sync-offline.js` di PR yang sama.

## Rollback
Pembungkus iframe lama tetap ada (`/legacy/` untuk panel, `legacy.html` di repo lain). Kembali = menyalin `legacy.html` menjadi `index.html`.
