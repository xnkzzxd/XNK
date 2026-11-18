# XNK Pusat dan /adminxnk (Gelombang 2, T-2233…T-2234)

**XNK Pusat** adalah satu Apps Script di akun Google **pemilik** yang mengawasi semua coach di hub.
**xnk.web.id/adminxnk** adalah dasbornya (login PIN pemilik). Isinya hanya angka dan status: tidak ada nama, nomor
WA atau data kesehatan klien yang pernah sampai ke XNK Pusat.

| Bagian | Kode |
| --- | --- |
| XNK Pusat (doPost, cek harian, email, aksi GitHub) | `apps-script/xnk-pusat/src/Pusat.gs`, tes `apps-script/xnk-pusat/tests/` |
| Laporan tiap coach | `hubStatus(secret)` di `pt-scheduler/src/HubStatus.gs` (publik, dijaga `HUB_SECRET`; produksi selalu menolak) |
| Pendaftaran coach | wizard langkah 4 → `XNK.registerPusat` (`lib-extra/LibApi.gs`): rahasia baru disimpan hanya bila Pusat menerima |
| Backup mingguan (T-2250) | `hubExport(secret, req)` di `HubStatus.gs` (coach) → `runPusatBackup` di `Pusat.gs` (pemilik) |
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
bila pengingat menyala, tick terakhir < 3 jam. Ada masalah = **satu email** ke pemilik dengan daftar coach dan
link dasbor. Tanpa masalah = tanpa email. Backup yang gagal **2 kali berturut-turut** ikut masuk email itu.

## Backup mingguan (T-2250)

Setiap coach disalin seminggu sekali ke **Drive akun XNK Pusat** (akun pemilik), folder `XNK Backup/<slug>`, sebagai
spreadsheet baru bernama `<slug> YYYY-MM-DD` (tanggal WIB). **8 salinan terbaru** disimpan; yang lebih tua dipindah ke
sampah Drive (masih bisa dipulihkan 30 hari dari sampah).

- **Cara kerja.** Trigger `runPusatBackup` berjalan tiap jam dan mengerjakan **satu** coach yang jatuh tempo (backup
  terakhir > 7 hari, atau ditandai lewat tombol). Ia memanggil `hubExport(rahasia)` di /exec coach: dulu daftar
  sheet, lalu potongan maks 2.000 baris / ±4 MB per panggilan. Satu jalan bekerja ±4 menit; coach besar dilanjutkan
  jam berikutnya dari titik terakhir (`BK_CUR`). Coach yang gagal dicoba lagi 6 jam kemudian, jadi tidak menahan coach
  lain. Status per coach ada di Script Property `BKST_<slug>` (`at`, `okAt`, `fileUrl`, `rows`, `error`, `fails`).
- **Isi salinan.** Semua sheet, urutan dan nama sama, isi = **teks seperti tampil di layar** (`getDisplayValues`, format
  teks `@`): nomor 08… tetap utuh, tanggal tertulis seperti di sheet coach, rumus menjadi hasilnya. Sel yang diawali
  `=` diberi `'` agar tidak menjadi rumus. **Tidak** ikut: Script Properties (PIN, token, rahasia) dan foto progres
  (tetap di Drive coach; sheet `ProgressPhotos` hanya menyimpan ID-nya).
- **Privasi.** Salinan berisi data penuh klien dan hanya ada di Drive pemilik. /adminxnk hanya melihat tanggal backup
  terakhir dan link **Buka** (yang hanya bisa dibuka akun pemilik).
- **Backup sekarang.** Tombol per coach di /adminxnk (`pusatAction(token, 'backup', slug)`): menandai coach dan
  memasang trigger sekali jalan ±1 menit lagi (`runPusatBackupSoon`). Tanpa GitHub. Coach dengan Library lama
  menjawab "Library coach belum punya hubExport; perbarui coach." — jalankan **Perbarui** dulu.
- **Izin.** XNK Pusat memakai izin `spreadsheets` dan `drive.file` (hanya file yang dibuatnya sendiri; Drive lewat REST
  API karena DriveApp meminta akses Drive penuh). Setelah versi ini terpasang, **jalankan `setupPusat` sekali lagi**
  di editor XNK Pusat untuk memberi izin baru dan memasang trigger backup tiap jam.

## Memulihkan dari backup

1. Drive akun pemilik → `XNK Backup/<slug>` → buka salinan dengan tanggal yang diinginkan.
2. Siapkan spreadsheet coach yang baru (XNK Template, seperti coach baru) atau spreadsheet coach yang rusak setelah
   isinya dikosongkan.
3. Di salinan, untuk setiap sheet: klik kanan tab → **Salin ke → Spreadsheet yang ada** → pilih spreadsheet coach.
   Hapus sheet lama dengan nama yang sama di tujuan, lalu ganti nama "Salinan dari …" ke nama aslinya (nama sheet
   harus persis sama).
4. Bila spreadsheet tujuan baru: jalankan wizard setup coach (XNK → Mulai setup) agar Script Properties (PIN,
   pengaturan, HUB_SECRET) terisi lagi — pengaturan tidak ikut backup — lalu daftarkan ulang ke XNK Pusat.
5. Buka panel coach dan periksa jadwal, klien dan paket. Kolom tanggal kembali sebagai teks; aplikasi membacanya lewat
   `_isoDateCell_` / teks ISO seperti biasa.
