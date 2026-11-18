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
- [x] T-2223 Content-Security-Policy di semua halaman hub (`build-hub.js` `CSP_APP` / `cspStatic`): halaman coach mengunci asal skrip (sendiri + unpkg, jsdelivr, cdnjs), tujuan data (`connect-src` hanya Apps Script + GitHub raw, `img-src` hanya host foto/GIF yang dipakai), tanpa `<object>`, `<base>`, iframe; halaman depan dan 404 hanya skrip inline bersidik sha256. `hub-check.js` gagal pada penolakan CSP, `hub-verify.js` bila CSP hilang. Google Analytics milik xnk.my.id (G-93SRTYH3SG) tidak lagi ikut ke Library/hub (`TEXT_SWAPS`).
- [ ] T-2224 (baru, dari T-2223) Ganti `onclick="…"` yang dibuat di JavaScript dengan event delegation, supaya halaman coach bisa memakai `script-src` tanpa `'unsafe-inline'` (perlindungan penuh terhadap XSS di satu domain). Besar: ±550 handler di produksi; perlu keputusan pemilik.

Gelombang 2 — pemilik mengelola semua coach
- [x] T-2230 Secret `CLASP_<SLUG>` per akun ([Akun.md](Akun.md)); `hub.json` boleh berisi `scriptId`, `deploymentId` (diperiksa `readHub`, dipertahankan `hub-edit`, dibuang bila link /exec berubah).
- [x] T-2231 Workflow **Coach XNK** aksi `baru` (`tools/coach-ops.js`: clasp create → penghubung dengan Library terbaru dan isian awal wizard `XNK_DEFAULT_SLUG`/`XNK_DEFAULT_BRAND` → versi → deploy web app → hub.json → build hub) dan `hubungkan` (coach lama: cari proyek dari deployment link /exec).
- [x] T-2232 Aksi `perbarui` (harian 02:37 WIB + manual): deployment yang sama (`clasp deploy -i`), kenari dulu (berhenti bila server kenari tidak menjawab commit terbaru), coach yang sudah terbaru dilewati. Versi terbaru dari tag `lib-v<N>` yang dipasang job deploy `xnk-library.yml` (pesan tag = scriptId Library).
- [x] T-2233 XNK Pusat ([Pusat.md](Pusat.md)): `apps-script/xnk-pusat` (login PIN, `pusatRegister` dengan kode daftar, cek harian 06:00 + email hanya bila ada masalah, aksi `perbarui`/`hubungkan`/`bangun` ke workflow repo hub), `hubStatus(secret)` di produksi (`HubStatus.gs`, angka saja), `XNK.registerPusat` + langkah wizard, job `pusat` + aksi `buat-pusat` di `xnk-library.yml`.
- [x] T-2234 Dasbor `xnk.web.id/adminxnk` (`hub-site/adminxnk.html`, `pusatUrl` di hub.json): status, angka, link, coach yang belum mendaftar, tombol cek/perbarui/hubungkan/bangun; CSP ketat; dicek `hub-check.js`.

Gelombang 3 — fitur
- [ ] T-2240 Web Push di hub (relay per coach lewat XNK Pusat).
- [ ] T-2241 Halaman publik coach `/<slug>/info/` (profil, paket, jam kosong, daftar).
- [ ] T-2242 Logo + warna aksen per coach di `hub.json`.
- [ ] T-2243 Alias slug lama (redirect); `runWarmTick` opsional.

Gelombang 4 — operasional
- [ ] T-2250 Backup mingguan tiap coach ke Drive akun pemilik (lewat XNK Pusat), 8 minggu.
- [ ] T-2251 Langganan bulanan: jatuh tempo, pengingat, masa tenggang, mode baca saja (situs tidak dihapus).
- [ ] T-2252 Coach keluar: ekspor untuk coach, nonaktifkan situs, hapus akun H+30.
- [x] T-2253 Kuota Gmail (menit trigger, fetch, email) dilaporkan; email di 70 %. `src/Kuota.gs` (`QUOTA_<yyyymmdd>`, `MAIL_RESERVE`), `hubStatus().quota`, cek 70 % di XNK Pusat, ubin di `/adminxnk` ([Pusat.md](Pusat.md)).
- [x] T-2254 Notifikasi coach lewat Web Push + email ke email coach (Telegram opsional). Web Push coach sudah ada (Fase Z); email: `NOTIF_EMAIL_REMINDERS` off/on/auto (Pengaturan → Notifikasi Admin, wizard = auto), `kirimEmailTombol_`, ReminderLog per saluran.
- [ ] T-2255 "Unduh data saya" (Excel) di Pengaturan panel coach.
- [x] T-2256 Daftar periksa akun Gmail per coach ([Akun.md](Akun.md)); token dipakai harian oleh `perbarui`, jadi token mati langsung terlihat.
- [ ] T-2257 "Didukung XNK" kecil di login dan kartu bagikan coach.
- Keputusan terbuka: UU PDP (kebijakan privasi, perjanjian pemroses data) ditunda oleh pemilik.
