# Phase AB — TODO (T-2200+)



- [x] T-2200 Library build from production source with per-spreadsheet context (`build-lib.js`, `Konteks.gs`).

- [x] T-2201 Library public API (`LibApi.gs`): run, handleGet/Post, initInstance, saveSetup, triggers, healthCheck, setupState.

- [x] T-2202 Isolation tests (two spreadsheets, copy wipe, owner-only setup) and the production suite on the Library (`check-compat.js`: 672 pass, 14 expected identity differences).

- [x] T-2203 Bridge for XNK Template: generated wrappers, menu, 4-step setup wizard, manifest with pinned Library.

- [x] T-2204 Coach site build (`build-tenant.js`) + browser check (`tenant-check.js`: PIN, own clients only, portal, offline).

- [x] T-2205 Site template repo contents (`site-template/`: one "Setup situs" workflow, `config.json`, `custom/`).

- [x] T-2206 Workflow `xnk-library.yml`: checks, one-time "buat", "perbarui" on every main change.

- [x] T-2207 Docs: Panduan (Indonesian), PRD, Design, index.

- [~] T-2208 Owner: create both spreadsheets (done 2026-11-17 from the laptop with clasp, Library version 1 = build 8d15e1860f86), save `XNK_LIB_SCRIPT_ID` / `XNK_TEMPLATE_SCRIPT_ID`, share both spreadsheets (viewer).

- [-] T-2209 Per-coach site repo from `site-template/`: replaced by the hub (T-2211); kept as an optional route for a coach with their own domain.

- [ ] T-2210 First real copy end to end (wizard, deploy, site, login, booking), including one second Google account.

- [x] T-2211 Hub xnk.web.id ([Hub.md](Hub.md)): `build-hub.js`, `hub-edit.js`, landing + 404, per-slug storage prefix, service worker prefix fix, `hub-repo/` (form workflow), `hub-check.js` (two coaches, one origin), tests.

- [x] T-2212 Library: the health-form WhatsApp text and the QR fallbacks no longer point clients of other coaches to the XNK portal; `library-build.test.js` scans the HTML too.

- [x] T-2213 Wizard step 4: pick the address name, save `SITE_URL = hub + slug`, copy the data to send to the owner; `wizard-check.js`.

- [ ] T-2214 Owner: put `hub-repo/` into `xnk-template-site` (Claude), Pages + DNS + custom domain `xnk.web.id`, `contactUrl`.

- [ ] T-2215 First coach `claudia` end to end on `xnk.web.id`.

- [x] T-2216 Brand: visible "XNK" text (page title, login screen, WhatsApp "ini Coach XNK", calendar title, share-card watermark, "Member XNK", weekly report) now uses the coach's business name in the Library build (`window.brandName()` in the browser, `_brandName_()` on the server); `library-build.test.js` and `hub-check.js` fail on a leftover. Found by opening the live `xnk.web.id/claudia/klien/`: its title became "XNK Personal Training".
- [x] T-2217 Landing xnk.web.id as a proper XNK brand page: hero with app screens, client/coach features, screenshot strip, how it works, privacy, coach list from `hub.json`, the same login form, FAQ, OG image. Screens come from the demo (sample data) via `tools/hub-shots.js`; `hub.test.js` and `hub-check.js` cover the coach list, escaping, images and no sideways scroll.
- [x] T-2218 Install XNK from the hub landing: PWA (manifest, icons, root `sw.js` limited to the landing), install button on `beforeinstallprompt`, iPhone hint, "Lanjutkan" to the last coach; downloads for Android (`android/ -PxnkHub`) and Windows/macOS (Pake) built by `apps.yml` into release `app-latest`.

## Audit 2026-11-17 — upgrade hub (rencana disetujui pemilik)

Keputusan pemilik: tetap Google + GitHub (tanpa Supabase/Firebase/Vercel/Netlify/Cloudflare); pemilik sendiri
membuat dan men-setup spreadsheet tiap coach, satu akun Gmail biasa per coach (Workspace ditolak); token `clasp`
tiap akun boleh jadi secret repo hub tanpa persetujuan per run; target 6–20 coach.

Gelombang 1 — stabil dan aman
- [x] T-2220 Halaman tiap coach mengikuti versi server coach itu: `getServerInfo` (publik, tanpa data; Library membawa
  commit penuh), doPost menjawab `code: 'unknown_fn'` untuk fungsi yang tidak ada (halaman menampilkan "Server sedang
  diperbarui"), `tools/hub-versions.js` (server → build sebelumnya `/_hub/versions.json` → kode terbaru),
  `build-hub.js --versions`, `<slug>/lib-latest.json` dari kode terbaru (dulu hilang di hub, jadi "Cek kesehatan"
  tidak pernah tahu ada versi baru).
- [x] T-2221 Hub hanya membangun dari commit yang lulus pemeriksaan: job `stable` di `xnk-library.yml` memindah tag `hub-stable` setelah `check` hijau di main (tidak pernah mundur); `hub.yml` mengambil tag itu (belum ada = main + peringatan) dan menjalankan `tools/hub-verify.js` pada hasil build sebelum mengunggah (panel/portal ada, /exec coach sendiri saja, awalan penyimpanan skrip pertama, awalan cache worker, `lib-latest.json`, tanpa alamat xnk.my.id).
- [x] T-2222 Pustaka gerakan/makanan/peta otot disajikan dari `xnk.web.id/_lib/` (disalin dari checkout XNK yang membangun hub; alamat di halaman coach dan `LIBS` service worker ditulis ulang, sidik worker ikut berubah); `hub-verify.js` dan `hub-check.js` gagal bila masih ada permintaan ke xnk.my.id. Berbagi berkas app antar coach (`/_app/<hash>/`) ditunda: untuk 6–20 coach (±1 MB per coach) belum perlu.
- [ ] T-2223 Content-Security-Policy di semua halaman hub; `hub-check.js` gagal pada pelanggaran.

Gelombang 2 — pemilik mengelola semua coach
- [ ] T-2230 Secret `CLASP_<SLUG>` per akun; `hub.json` + `scriptId`, `deploymentId`.
- [ ] T-2231 Workflow "Coach baru" (clasp create, push penghubung, deploy web app, hub.json, build).
- [ ] T-2232 Workflow "Perbarui semua coach" (kenari dulu, `/exec` tetap sama).
- [ ] T-2233 XNK Pusat (Apps Script di akun pemilik): pendaftaran coach, `hubStatus(secret)`, cek harian, email bila bermasalah, aksi ke Actions.
- [ ] T-2234 Dasbor `xnk.web.id/adminxnk` (login PIN ke XNK Pusat).

Gelombang 3 — fitur
- [ ] T-2240 Web Push di hub (relay per coach lewat XNK Pusat).
- [ ] T-2241 Halaman publik coach `/<slug>/info/` (profil, paket, jam kosong, daftar).
- [ ] T-2242 Logo + warna aksen per coach di `hub.json`.
- [ ] T-2243 Alias slug lama (redirect); `runWarmTick` opsional.

Gelombang 4 — operasional
- [ ] T-2250 Backup mingguan tiap coach ke Drive akun pemilik (lewat XNK Pusat), 8 minggu.
- [ ] T-2251 Langganan bulanan: jatuh tempo, pengingat, masa tenggang, mode baca saja (situs tidak dihapus).
- [ ] T-2252 Coach keluar: ekspor untuk coach, nonaktifkan situs, hapus akun H+30.
- [ ] T-2253 Kuota Gmail (menit trigger, fetch, email) dilaporkan; email di 70 %.
- [ ] T-2254 Notifikasi coach lewat Web Push + email ke email coach (Telegram opsional).
- [ ] T-2255 "Unduh data saya" (Excel) di Pengaturan panel coach.
- [ ] T-2256 Daftar periksa akun Gmail per coach (`Akun.md`) + pemakaian token bulanan.
- [ ] T-2257 "Didukung XNK" kecil di login dan kartu bagikan coach.
- Keputusan terbuka: UU PDP (kebijakan privasi, perjanjian pemroses data) ditunda oleh pemilik.
