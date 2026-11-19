# XNK HQ dan /adminxnk (Gelombang 2, T-2233…T-2234)

**XNK HQ** (dulu *XNK Pusat*; nama kode, folder `xnk-pusat/` dan Script Properties `PUSAT_*` tidak berubah) adalah satu Apps Script di akun Google **pemilik** yang mengawasi semua coach di hub.
**xnk.web.id/adminxnk** adalah dasbornya (login PIN pemilik). Isinya hanya angka dan status: tidak ada nama, nomor
WA atau data kesehatan klien yang pernah sampai ke XNK HQ.

| Bagian | Kode |
| --- | --- |
| XNK HQ (doPost, cek harian, email, aksi GitHub) | `apps-script/xnk-pusat/src/Pusat.gs`, tes `apps-script/xnk-pusat/tests/` |
| Laporan tiap coach | `hubStatus(secret)` di `pt-scheduler/src/HubStatus.gs` (publik, dijaga `HUB_SECRET`; produksi selalu menolak) |
| Pendaftaran coach | wizard langkah 4 → `XNK.registerPusat` (`lib-extra/LibApi.gs`): rahasia baru disimpan hanya bila Pusat menerima |
| Backup mingguan (T-2250) | `hubExport(secret, req)` di `HubStatus.gs` (coach) → `runPusatBackup` di `Pusat.gs` (pemilik) |
| Dasbor | `hub-site/adminxnk.html` → `xnk.web.id/adminxnk/` (CSP ketat, token di `sessionStorage` `adminxnk:`) |
| Pasang / perbarui | workflow **XNK Library**: aksi `buat-pusat` sekali, lalu job `pusat` di setiap push ke main |

## Dasbor /adminxnk (T-2261)

Bergaya aplikasi Mac, satu file `hub-site/adminxnk.html` (CSP ketat: tanpa skrip luar, tanpa `onclick`, ikon SVG di dalam file).

- **Layar lebar (≥ 900 px):** bilah samping dengan saringan (Semua coach, Perlu dicek, Belum terdaftar, Backup terlambat,
  Push menyala; angka merah = ada masalah), **Siapkan XNK HQ** (titik merah bila kurang) dan **Keluar**; bilah judul
  dengan ringkasan, kotak cari (`/`), **Cek semua** dan menu ⋯ (Perbarui semua coach, Bangun ulang situs, Siapkan,
  Keluar); ringkasan angka; tabel coach (masalah di atas, ↑/↓ memilih); daftar **Semua masalah**; inspektur di kanan:
  status, Panel / Portal klien, angka klien dan sesi, kuota hari ini, backup, push, tempat, sistem, lalu **Cek ulang**,
  **Backup sekarang** dan menu ⋯ coach (push, tempat, Perbarui, Hubungkan, Ganti slug). 900–1180 px: bilah samping
  hanya ikon.
- **HP:** chip saringan, daftar coach, ringkasan di bawahnya; ketuk coach = lembar detail penuh, tombol kembali HP
  menutupnya.
- Konfirmasi memakai dialog sendiri (bukan `window.confirm`), Ganti slug dan Tempat memakai form kecil di inspektur.
  Pilihan coach dan saringan disimpan di `sessionStorage` `adminxnk:ui`. Diperiksa `tools/hub-check.js` (1440 px dan
  390 px; `HUB_SHOTS=<folder>` menyimpan tangkapan layar).
- Proyek Apps Script yang sudah ada masih bernama "XNK Pusat" di editor; ganti namanya di editor bila ingin (tidak wajib).

### Grafik dan riwayat (T-2262)

Kontras tinggi: bilah samping, pita judul dan kepala inspektur hitam; teks abu minimal 7:1. Hanya merah (masalah) dan
titik hijau kecil (beres) yang berwarna. Ringkasan di atas: **Kesehatan** (cincin beres / ada masalah / belum
terdaftar + daftar masalah, klik = buka coach) dan **Pertumbuhan · 30 hari** (klien aktif semua coach, sesi selesai dan
akan datang), lalu **Perbandingan coach** (batang, Klien aktif | Sesi 7 hari, 8 teratas). Tabel coach memakai garis
kecil, batang sesi, meteran kuota dan batang umur backup; inspektur punya empat ubin dengan garis 30 hari, tiga
meteran kuota dan batang backup. Semua grafik punya tooltip (arahkan / fokus) dan tabel tersembunyi untuk pembaca layar.

Riwayatnya: setiap cek (`checkAll_`, termasuk Cek ulang) menulis satu baris per hari WIB ke Script Property
`HIST_<slug>`: `[tanggal, klien aktif 30 hari, total klien, sesi selesai 7 hari, sesi 7 hari ke depan, email, UrlFetch,
menit trigger, beres 1|0]`, 30 hari terakhir, angka saja. Ganti slug ikut memindahkannya (`PUSAT_SLUG_KEYS`). Grafik
terisi hari demi hari sejak versi ini terpasang.

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
3. Di editor, pilih fungsi **setupPusat** → Run → beri izin. (Kunci sesi + trigger harian 06:00 WIB.) Sesudah itu,
   izin atau trigger yang kurang bisa disiapkan dari `/adminxnk` → **Siapkan XNK HQ** (lihat di bawah).
4. Repo hub → `hub.json`: tambahkan `"pusatUrl": "<XNK_PUSAT_URL>"`. Situs dibangun ulang dan
   `xnk.web.id/adminxnk/` aktif.
5. Setiap coach: spreadsheet → **XNK → Mulai setup → langkah 4 → Daftarkan ke XNK HQ** (isi kode daftar).
   Kotak **Link aplikasi (/exec)** terisi otomatis; bila XNK HQ menolak dengan "tidak bisa dibuka tanpa login", tempel
   link dari **Deploy → Kelola deployment** (akses "Siapa saja"), bukan link uji. XNK HQ mencoba link itu dulu
   (`getServerInfo`) sebelum menyimpan, dan untuk coach yang ada di `hub.json` selalu memakai link dari `hub.json`
   (`hubExec_`, dibaca dari repo hub, disimpan 10 menit) — link dari `ScriptApp.getService().getUrl()` di editor bisa
   berupa link uji yang meminta login Google. Galat pemeriksaan menyebut kode HTTP, host, dan judul halaman.
   Coach yang dibuat workflow **Coach XNK** setelah langkah 4 di atas sudah membawa alamat Pusat; XNK Template
   membawanya setelah versi Library berikutnya terbit.

## Yang dicek setiap pagi

Server menjawab; versi Library = versi terbaru (tag `lib-v<N>`); trigger `runReminderTick` terpasang tepat satu;
bila pengingat menyala, tick terakhir < 3 jam; **kuota Google hari ini** (T-2253) di bawah 70 % untuk email
(batas `QUOTA_MAIL`, bawaan 100), UrlFetch (`QUOTA_FETCH`, 20.000) dan menit trigger (`QUOTA_TRIGGER_MIN`, 90) —
batas bisa ditimpa di Script Properties XNK HQ. Ada masalah = **satu email** ke pemilik dengan daftar coach dan
link dasbor. Tanpa masalah = tanpa email. Backup yang gagal **2 kali berturut-turut** ikut masuk email itu.

Angka kuota datang dari `hubStatus().quota = {date, mail, fetch, triggerMin, mailRemaining, mailSkipped}` (hari WIB,
angka saja). Di `/adminxnk` tiap kartu coach punya tiga ubin kecil: *email hari ini*, *UrlFetch hari ini*, *menit
trigger hari ini* (angka / batas; merah ≥ 70 %). Coach dengan Library lama tanpa kuota tidak dicek dan tanpa ubin.

## Email ringkasan coach (T-2254)

Wizard setup punya isian **Email coach (opsional)** (disimpan `NOTIF_EMAIL`) dan memasang
`NOTIF_EMAIL_REMINDERS=auto` bila belum pernah diatur: tanpa Telegram, ringkasan pengingat dikirim ke email itu
(kosong = email akun Google coach). Coach bisa mengubahnya di Pengaturan → Notifikasi Admin (*Mati / Otomatis /
Selalu*); wizard tidak menimpa pilihan itu.

## Backup mingguan (T-2250)

Setiap coach disalin seminggu sekali ke **Drive akun XNK HQ** (akun pemilik), folder `XNK Backup/<slug>`, sebagai
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
- **Izin.** XNK HQ memakai izin `spreadsheets` dan `drive.file` (hanya file yang dibuatnya sendiri; Drive lewat REST
  API karena DriveApp meminta akses Drive penuh). Setelah versi ini terpasang, buka `/adminxnk` → **Siapkan XNK HQ**
  (atau jalankan `setupPusat` di editor) untuk memberi izin baru dan memasang trigger backup tiap jam.

## Siapkan XNK HQ dari /adminxnk
`pusatOverview.setup` = `{auth, daily, backup, ok, editor}`. `auth` diuji langsung: satu permintaan kecil ke Drive dengan token skrip (berhasil = disimpan 10 menit). **Jangan pakai `ScriptApp.getAuthorizationInfo`** di sini: dari web app "Siapa saja" ia memeriksa pengunjung anonim, jadi selalu "perlu izin" walau pemilik sudah memberi izin.
Bila ada yang kurang, `/adminxnk` menampilkan pita "XNK HQ perlu disiapkan" (tombol yang sama juga ada di bilah atas).
Tombol membuka tab baru (dibuka saat diklik, supaya tidak diblokir) ke `<pusatUrl>?setup=<tanda siap>`: tanda sekali
pakai `setup.<exp>.<hmac>` dari `pusatAction(token, 'setup')`, berlaku 10 menit, bukan token sesi. `doGet` memeriksanya
lalu menjalankan `setupPusat_()` (sama dengan `setupPusat` di editor): **trigger** terpasang dari sini. **Izin Google baru
(Drive/Spreadsheet) tidak bisa diberikan lewat link web** — Google hanya menampilkan layar izin di editor (dicoba
2026-11-18). Karena itu, bila `setup.auth` false, pita menampilkan langkah editor dan tombol **Buka editor XNK HQ**
(`setup.editor` = `https://script.google.com/d/<scriptId>/edit`): pilih `setupPusat` → Run → Izinkan, sekali saja.
Tab `?setup` juga mengatakan hal yang sama bila izin masih kurang (tidak lagi "izin Google diberikan").

## Memulihkan dari backup

1. Drive akun pemilik → `XNK Backup/<slug>` → buka salinan dengan tanggal yang diinginkan.
2. Siapkan spreadsheet coach yang baru (XNK Template, seperti coach baru) atau spreadsheet coach yang rusak setelah
   isinya dikosongkan.
3. Di salinan, untuk setiap sheet: klik kanan tab → **Salin ke → Spreadsheet yang ada** → pilih spreadsheet coach.
   Hapus sheet lama dengan nama yang sama di tujuan, lalu ganti nama "Salinan dari …" ke nama aslinya (nama sheet
   harus persis sama).
4. Bila spreadsheet tujuan baru: jalankan wizard setup coach (XNK → Mulai setup) agar Script Properties (PIN,
   pengaturan, HUB_SECRET) terisi lagi — pengaturan tidak ikut backup — lalu daftarkan ulang ke XNK HQ.
5. Buka panel coach dan periksa jadwal, klien dan paket. Kolom tanggal kembali sebagai teks; aplikasi membacanya lewat
   `_isoDateCell_` / teks ISO seperti biasa.

## Notifikasi push coach (T-2240)

XNK HQ membagikan kunci publik VAPID hub (dari `hub.json` → `vapidPublic`) ke coach lewat `hubPushKey(rahasia, kunci, menyala)`: setiap pagi untuk coach yang menyala (atau masih aktif dan perlu dimatikan) dan saat tombol **Nyalakan/Matikan push** di `/adminxnk` ditekan (`pusatAction` `push-on` / `push-off`). Coach yang tidak pernah dinyalakan tidak dihubungi. Jawabannya (rahasia relay coach, jumlah perangkat) disimpan di `PUSH_<slug>`; `/adminxnk` hanya melihat menyala/aktif, jumlah perangkat, waktu dan galat.

`pusatPushTargets(PUSAT_PUSH_SECRET)` (perbandingan waktu-konstan, min 32 karakter) memberi workflow Push XNK daftar `{slug, exec, relay}` coach yang menyala, tanpa UrlFetch. Workflow lalu memanggil coach langsung. Galat push masuk email harian. Semua UrlFetch XNK HQ dihitung per hari WIB (`fetch_`, tampil sebagai `fetchToday` di `pusatOverview`). Langkah pasang: [push/Setup.md](../push/Setup.md#hub-xnkwebid-notifikasi-untuk-semua-coach-t-2240).

## Tempat latihan coach (T-2258)

`/adminxnk` → **Tempat** (form kecil di kartu coach: nama tempat + kota, Simpan / Hapus tempat) memanggil
`pusatSetPlace(token, slug, nama, kota)` (hanya pemilik; coach harus ada di `hub.json`; isian diperiksa sama dengan
`build-hub.js`). XNK HQ menjalankan `hub.yml` dengan `{aksi: 'simpan', slug, warna: 'tetap', tempat, kota}`
(hapus = `tempat: '-'`); tanpa `GITHUB_TOKEN` atau bila GitHub menolak, jawabannya berisi langkah manual.
`pusatOverview.places` = tempat tiap coach di `hub.json` (slug → `{name, city}` atau `null`). Langkah untuk pemilik:
[Hub.md](Hub.md#tempat-latihan-coach-t-2258t-2260).

## Ganti slug coach (T-2243)

`/adminxnk` → **Ganti slug** memanggil `pusatRename(token, lama, baru)` (hanya pemilik). Nama baru diperiksa sama dengan
`build-hub.js` (pola slug, `PUSAT_RESERVED` = `RESERVED`, tidak dipakai slug atau alamat lama coach lain di `hub.json`).
Di bawah script lock: `COACHES[lama]` → `COACHES[baru]` (link /exec dan rahasia tetap), `ST_`, `BKST_`, `BKNOW_`,
`PUSH_`, `SITEQ_` pindah, `BK_DIRS` dan `BK_CUR` (backup yang sedang berjalan lanjut) ikut. Sesudahnya: folder Drive
backup diganti namanya (ID sama; gagal = folder lama tetap dipakai dan disebut di pesan), alamat
`<HUB_URL>/<baru>` dikirim ke coach lewat `hubSiteUrl(HUB_SECRET, url)` (antrean `SITEQ_<baru>`, dicoba lagi di
`runPusatDaily` dan masuk email bila belum diterima), lalu workflow `hub.yml` dijalankan dengan
`{aksi: 'ganti-slug', slug, slug_baru}` (tanpa `GITHUB_TOKEN` = pesan langkah manual; sudah diganti di hub.json =
dilewati). Jawabannya `{slug, from, site, folder, hub}`, masing-masing `'ok'` atau pesan. Langkah untuk pemilik:
[Hub.md](Hub.md#ganti-slug-coach-t-2243).
