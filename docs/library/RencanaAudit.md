> Disimpan 2026-11-20 atas permintaan pemilik, untuk dijalankan Rabu depan. Belum ada yang dijalankan. Berkas ini dihapus lagi di PR dokumen hasil audit.

# Rencana: audit menyeluruh xnk.web.id + onboarding coach ke-3

## Konteks
Sejak 2026-11-19 masuk 8 PR XNK (#180–#187) dan hub #8–#11, sebagian dari sesi berbeda yang berjalan bersamaan. Pemilik minta dua hal berurutan: (1) audit ulang semuanya tanpa mengganggu coach aktif (claudia, vinna), lalu (2) memandu coach ke-3 masuk.

Fakta yang sudah dicek (read-only):
- Clone lokal XNK = `origin/main` = `4901144` (merge #187). Tag `lib-v31` dan `hub-stable` keduanya menunjuk `4901144` ✅.
- Hub (`xnk-template-site`) di `a596fa6` (merge #11); `hub.json` berisi claudia (Serpong) dan vinna (Tanjung Pinang); workflow `coach.yml` (aksi perbarui/baru/hubungkan, cron `37 19 * * *` UTC = 02:37 WIB), `hub.yml`, `push.yml`.
- `RESERVED` ada di `apps-script/xnk-library/tools/build-hub.js:24`.
- Jaringan ke xnk.web.id dan script.google.com terbuka; workflow bisa dibaca/dijalankan lewat GitHub MCP (`actions_list`, `actions_run_trigger`).
- Sudah terlihat basi: `docs/library/Panduan.md:76` (push "belum ada" padahal T-2240; halaman depan "baru berisi pengenalan singkat" padahal ada kartu coach + cari/kota sejak T-2260), dan Agent.md §7 "Tests: 705".

## Bagian 1 — Audit (baca saja)
Semua langkah tidak mengubah data coach/klien; tidak login, tidak membaca data klien.

1. **Kode & tes di main** (di clone lokal, `origin/main`):
   - `node apps-script/pt-scheduler/tools/check-syntax.js`
   - `node --test` untuk `pt-scheduler/tests`, `xnk-library/tests`, `xnk-pusat/tests` → catat jumlah, bandingkan dengan 705 di Agent.md §7.
   - `node apps-script/xnk-library/tools/check-compat.js`
   - `build-api.js` dan `build-parts.js` lalu `git status --porcelain` harus kosong (kemudian `git checkout .` bila ada).
   - `hub-check.js`, `share-check.js` (produksi dan `SHARE_SRC=apps-script/xnk-library/dist/lib`), `browser-check.js` penuh di latar (tanpa timeout pendek, ~10 menit).
2. **Live**:
   - `getServerInfo` claudia & vinna: POST ke `exec` dari hub.json tanpa follow redirect, GET ke `Location`; bandingkan commit dengan `4901144`.
   - Skrip Playwright di scratchpad: 9 halaman (`/claudia/`, `/claudia/klien/`, `/claudia/info/`, sama untuk vinna, `/adminxnk/`, `/`) × 390×844 dan 1440×900 → error konsol, `securitypolicyviolation`, `scrollWidth > clientWidth`, teks "Didukung XNK" di halaman coach, `6288221254305` tidak ada di HTML/teks halaman coach.
   - `hubStatus`, `hubReadonly`, `hubExport` dengan rahasia salah → harus JSON `Permintaan tidak valid.`.
   - `/<slug>/sw-app.js` (atau nama berkas sebenarnya dari build-hub) dan `/_hub/push.json` menjawab 200.
3. **Workflow** (GitHub MCP): run terakhir XNK Library, checks.yml, Coach XNK (jadwal 02:37 WIB), Hub XNK, Push XNK hijau; tidak ada `action_required`; tag `hub-stable`/`lib-v31` di commit benar.
4. **Dokumen**: baca `docs/library/*`, `docs/README.md`, Agent.md §7, README hub; daftar kalimat basi. Pindai repo publik untuk rahasia/data pribadi (`grep` pola token, nomor HP, email selain yang sengaja); scriptId/deploymentId di hub.json boleh.
5. **Keamanan ringan**: diff #180–#187 → setiap fungsi publik baru ada di daftar yang tepat di `tests/api-lists.js` dan tepat satu dari `WRITE`/`READ_OK`; semua `hub*` memanggil `_hubAuth_`; `_readonlyGate_` tidak bisa menyala tanpa `HUB_SECRET` (produksi xnk.my.id); diff `CSP_APP` sejak sebelum #180 → setiap host baru ada alasannya.
6. **Hasil**: laporan Indonesia (✅/⚠/❌ per butir) di chat (salinan di scratchpad; tidak masuk repo). Bug nyata → satu PR kecil per bug. Dokumen basi → satu PR dokumen (Panduan.md §E, Agent.md jumlah tes, dll.).

### Aturan merge (bila ada PR)
Branch `claude/wizardly-keller-nzapc9` (atau turunan per PR), draft PR → gabung `origin/main` terbaru → CI hijau → pastikan tidak ada run XNK Library / Coach XNK / Hub XNK berjalan → tandai siap → merge satu per satu. Setelah merge yang menyentuh kode: tunggu XNK Library hijau → `coach.yml {aksi:perbarui, slug:""}` (ulang sekali jika kenari gagal hanya karena versi belum terbaca) → `hub.yml {aksi:bangun}` → cek `getServerInfo` kedua coach = commit baru (bangun sekali lagi bila belum) + semua halaman terbuka. PR dokumen saja: tanpa perbarui/bangun (keputusan pemilik), cukup cek XNK Library hijau + halaman live. Masalah → revert, perbarui + bangun, lapor.

### Keputusan pemilik (tanya-jawab)
- PR yang hanya mengubah dokumen: **tidak** menjalankan perbarui + bangun; cukup pastikan XNK Library hijau dan halaman live tetap terbuka.
- Temuan ⚠ (bukan bug): **hanya dilaporkan**, tidak dibuatkan PR.
- Laporan: **di chat saja**.
- Coach ke-3: akun **belum** ada; pemilik hanya ingin tahu **alur terbaru**. Bagian 2 = penjelasan alur (dicek ulang dari Akun.md / Panduan.md / coach.yml / hub.yml setelah audit), **tanpa** menjalankan workflow `baru` atau `simpan`.

## Bagian 2 — Coach ke-3: penjelasan alur terbaru (tidak dijalankan sekarang)
Setelah audit, saya tulis di chat alur di bawah ini dalam bahasa sederhana, disesuaikan dengan isi Akun.md, coach.yml, dan hub.yml saat itu. Langkah sesi 5–9 baru dijalankan nanti, saat pemilik kembali dengan akun yang sudah siap.
Langkah pemilik (Akun.md): Gmail baru + 2FA + pemulihan; nyalakan Apps Script API; `npx @google/clasp@2.4.2 login` → isi `.clasprc.json` ke secret hub `CLASP_<SLUG>` → `clasp logout`; kirim slug, nama usaha, aksen/logo/tempat (opsional). **Sandi tidak pernah lewat chat.**

Langkah sesi:
5. Cek slug: pola huruf kecil/`-`, tidak di `RESERVED` (`build-hub.js:24`), tidak sama dengan slug/alias di hub.json.
6. `coach.yml {aksi:baru, slug, brand}` → tunggu hijau → berikan link spreadsheet dari ringkasan run.
7. Pemilik: spreadsheet → XNK → Mulai setup (izin, PIN, email coach, daftar ke Pusat).
8. `hub.yml` simpan (aksen/logo/tempat bila ada) lalu bangun → cek live `getServerInfo`, `/<slug>/`, `/klien/`, `/info/`, CSP bersih; pastikan job `coach.yml` perbarui mencakup slug baru (daftar dari hub.json).
9. Ingatkan pemilik: No WA di profil coach, Langganan di /adminxnk (bawaan gratis), kartu coach di /adminxnk, bagikan link `/klien/`.
Coach lama tidak disentuh: `baru` hanya membuat proyek baru; perbarui tetap memakai kenari claudia.

## Verifikasi
Semua hasil cek di atas dicatat dengan bukti (output tes, kode HTTP, nama run). Laporan akhir dalam bahasa sederhana untuk non-engineer.
