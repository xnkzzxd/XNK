# XNK Pusat dan /adminxnk (Gelombang 2, T-2233…T-2234)

**XNK Pusat** adalah satu Apps Script di akun Google **pemilik** yang mengawasi semua coach di hub.
**xnk.web.id/adminxnk** adalah dasbornya (login PIN pemilik). Isinya hanya angka dan status: tidak ada nama, nomor
WA atau data kesehatan klien yang pernah sampai ke XNK Pusat.

| Bagian | Kode |
| --- | --- |
| XNK Pusat (doPost, cek harian, email, aksi GitHub) | `apps-script/xnk-pusat/src/Pusat.gs`, tes `apps-script/xnk-pusat/tests/` |
| Laporan tiap coach | `hubStatus(secret)` di `pt-scheduler/src/HubStatus.gs` (publik, dijaga `HUB_SECRET`; produksi selalu menolak) |
| Pendaftaran coach | wizard langkah 4 → `XNK.registerPusat` (`lib-extra/LibApi.gs`): rahasia baru disimpan hanya bila Pusat menerima |
| Dasbor | `hub-site/adminxnk.html` → `xnk.web.id/adminxnk/` (CSP ketat, token di `sessionStorage` `adminxnk:`) |
| Pasang / perbarui | workflow **XNK Library**: aksi `buat-pusat` sekali, lalu job `pusat` di setiap push ke main |

## Pasang sekali (pemilik)

1. Repo XNK → **Actions → XNK Library → Run workflow → `buat-pusat`**. Ringkasan run berisi tiga nilai; simpan
   sebagai *repo variable* (Settings → Secrets and variables → Actions → Variables): `XNK_PUSAT_SCRIPT_ID`,
   `XNK_PUSAT_DEPLOYMENT_ID`, `XNK_PUSAT_URL`. Lupa nilainya? Jalankan aksi `info-pusat` (isi `pusat_script`
   dengan scriptId): log run mencetak ID deployment dan link /exec, tanpa mengubah apa pun.
2. Buka proyeknya (link di ringkasan) → **Project Settings → Script Properties**:
   - `PUSAT_PIN` — PIN dasbor, minimal 8 karakter.
   - `PUSAT_ENROLL_CODE` — kode daftar yang Anda ketik di wizard coach, minimal 8 karakter.
   - `PUSAT_EMAIL` — opsional; bawaan = akun ini.
   - `GITHUB_TOKEN` — opsional, untuk tombol aksi: *fine-grained token* hanya untuk repo `xnk-template-site`,
     izin **Actions: Read and write**.
3. Di editor, pilih fungsi **setupPusat** → Run → beri izin. (Kunci sesi + trigger harian 06:00 WIB.)
4. Repo hub → `hub.json`: tambahkan `"pusatUrl": "<XNK_PUSAT_URL>"`. Situs dibangun ulang dan
   `xnk.web.id/adminxnk/` aktif.
5. Setiap coach: spreadsheet → **XNK → Mulai setup → langkah 4 → Daftarkan ke XNK Pusat** (isi kode daftar).
   Kotak **Link aplikasi (/exec)** terisi otomatis; bila XNK Pusat menolak dengan "tidak bisa dibuka tanpa login", tempel
   link dari **Deploy → Kelola deployment** (akses "Siapa saja"), bukan link uji. XNK Pusat mencoba link itu dulu
   (`getServerInfo`) sebelum menyimpan, dan untuk coach yang ada di `hub.json` selalu memakai link dari `hub.json`
   (`hubExec_`, dibaca dari repo hub, disimpan 10 menit) — link dari `ScriptApp.getService().getUrl()` di editor bisa
   berupa link uji yang meminta login Google. Galat pemeriksaan menyebut kode HTTP, host, dan judul halaman.
   Coach yang dibuat workflow **Coach XNK** setelah langkah 4 di atas sudah membawa alamat Pusat; XNK Template
   membawanya setelah versi Library berikutnya terbit.

## Yang dicek setiap pagi

Server menjawab; versi Library = versi terbaru (tag `lib-v<N>`); trigger `runReminderTick` terpasang tepat satu;
bila pengingat menyala, tick terakhir < 3 jam; **kuota Google hari ini** (T-2253) di bawah 70 % untuk email
(batas `QUOTA_MAIL`, bawaan 100), UrlFetch (`QUOTA_FETCH`, 20.000) dan menit trigger (`QUOTA_TRIGGER_MIN`, 90) —
batas bisa ditimpa di Script Properties XNK Pusat. Ada masalah = **satu email** ke pemilik dengan daftar coach dan
link dasbor. Tanpa masalah = tanpa email.

Angka kuota datang dari `hubStatus().quota = {date, mail, fetch, triggerMin, mailRemaining, mailSkipped}` (hari WIB,
angka saja). Di `/adminxnk` tiap kartu coach punya tiga ubin kecil: *email hari ini*, *UrlFetch hari ini*, *menit
trigger hari ini* (angka / batas; merah ≥ 70 %). Coach dengan Library lama tanpa kuota tidak dicek dan tanpa ubin.

## Email ringkasan coach (T-2254)

Wizard setup punya isian **Email coach (opsional)** (disimpan `NOTIF_EMAIL`) dan memasang
`NOTIF_EMAIL_REMINDERS=auto` bila belum pernah diatur: tanpa Telegram, ringkasan pengingat dikirim ke email itu
(kosong = email akun Google coach). Coach bisa mengubahnya di Pengaturan → Notifikasi Admin (*Mati / Otomatis /
Selalu*); wizard tidak menimpa pilihan itu.
