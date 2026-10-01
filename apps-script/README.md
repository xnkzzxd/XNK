# Apps Script (kode aplikasi di balik xnk.my.id)

Kode sumber aplikasi Google Apps Script milik XNK, disimpan di GitHub supaya
setiap perubahan tercatat dan **otomatis di-deploy**.

| Folder | Aplikasi |
| --- | --- |
| `apps-script/pt-scheduler/` | XNK Personal Trainer Scheduler (panel PT, landing, portal klien) |

Ketiga situs ini membungkus **deployment yang sama** (`AKfycbyVOm1…BgJ`), jadi satu kali
deploy memperbarui semuanya:

| Situs | Repo | Halaman Apps Script |
| --- | --- | --- |
| https://xnk.my.id | xnkzzxd/XNK | `/exec` → Index (panel PT, login PIN) |
| https://xnkbooking.my.id | xnkzzxd/BookingPT | `/exec?view=Landing` (marketing + daftar) |
| https://book.xnkbooking.my.id | xnkzzxd/BookingPT-Client | `/exec?view=public` (portal klien, login nomor WA) |

## Cara kerja

```
PR di GitHub ──► cek otomatis (sintaks + tes) ──► merge ke main
                                                     │
                                                     ▼
                         GitHub Actions: clasp push ──► clasp deploy
                                                     │
                                                     ▼
                  Apps Script: versi baru di deployment yang SAMA (link /exec tidak berubah)
```

- `apps-script/pt-scheduler/src/` = isi proyek Apps Script, 1:1 dengan file di editor:
  - `Kode.gs` — server (data, login, keamanan, PR klien).
  - `Reminder.gs` — pengingat Telegram terjadwal (`runReminderTick`).
  - `Index.html` + `Theme.html` + `App.html` — panel PT & portal klien (desain hitam-putih,
    terang/gelap otomatis, tata letak HP & desktop berbeda).
  - `Landing.html` + `LandingStyle.html` + `LandingScript.html` — halaman xnkbooking.my.id
    (terang galeri, hero foto coach dengan cahaya WebGL, animasi GSAP; HP & desktop berbeda).
    Foto hero ada di repo BookingPT (`img/`), dibuat dengan `tools/make-landing-images.py`.
  - `Scripts.html` — helper kecil yang dipakai bersama Index & Landing.
- `apps-script/pt-scheduler/.clasp.json` = ID proyek Apps Script (bukan rahasia).
- `apps-script/pt-scheduler/tests/` = tes otomatis (tidak ikut di-push ke Apps Script).
- `.github/workflows/pt-scheduler.yml` = alur cek + deploy.

## ⚠️ Aturan penting

**Setelah deploy otomatis aktif, ubah kode HANYA lewat repo ini.**
Setiap deploy menimpa seluruh kode di editor Apps Script dengan isi `apps-script/pt-scheduler/src/`.
Perubahan yang diketik langsung di editor online akan hilang pada deploy berikutnya.

Rahasia (token bot, PIN, password) **tidak boleh** ditulis di kode. Simpan di
Apps Script → ⚙️ Project Settings → **Script Properties**.

**Repo ini publik.** Siapa pun bisa membaca kodenya, dan itu aman selama tidak ada
rahasia di kode: semua akses data dicek di server (login PIN admin / nomor WA klien).
Secret GitHub (`CLASPRC_JSON`) tidak terlihat publik dan tidak dipakai untuk PR dari fork;
deploy hanya jalan saat ada push ke `main`, yang hanya bisa dilakukan pemilik repo.

## Setup sekali (dilakukan pemilik akun Google)

### 1. Script Properties (di editor Apps Script, sebelum deploy pertama)

Buka proyek *XNK Personal Trainer Scheduler* → ⚙️ **Project Settings** →
**Script Properties** → *Add script property*:

| Property | Isi |
| --- | --- |
| `ADMIN_PIN` | **Wajib.** PIN login panel PT, minimal 6 karakter. Tanpa ini tidak ada yang bisa masuk panel. Mengganti PIN = semua perangkat PT otomatis logout. |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram (salin dari `kirimNotifTelegram` versi lama di editor, sebelum ditimpa) |
| `TELEGRAM_CHAT_IDS` | Chat ID admin, dipisah koma, mis. `12345678,87654321` |

Pengaturan lain **tidak perlu** diisi manual: panel PT → **Pengaturan** (halaman sendiri, dibagi
per bagian, tiap bagian punya tombol Simpan sendiri) bisa mengubah:

- **Pengingat Klien**: saklar utama, tiap jenis (Booking Minggu, PR, Makan pagi/sore) dengan jam
  dan tombol tes, kalimat tidur, tombol **Pasang** trigger (tanpa membuka editor), dan riwayat
  pengingat (nama klien, bukan nomor).
- **Pesan ke klien**: tiap jenis pengingat punya isi pesan yang bisa diubah (placeholder seperti
  `{nama}`, `{jam}`, `{coach}`, `{slot}`, `{pr}`, `{tip}`, `{tidur}`) dengan pratinjau. **Cara pakai**: bot
  Telegram mengirim satu pesan per jenis dengan satu tombol per klien; tekan nama klien → WhatsApp
  terbuka ke klien itu dengan pesan siap kirim → tekan Kirim. Klien tanpa nomor WA yang valid
  tercantum di baris "📵 Tanpa nomor". Jenis yang ada: **Sesi besok** (19:00), **Booking Minggu**,
  **PR**, **Makan pagi/sore**. Di halaman klien, tiap jenis bisa dimatikan per klien (kolom P
  "Pengingat Nonaktif" di MemberData). Selama **Sesi besok** aktif, tombol WA dan kalimat tidur
  pindah dari email harian ke pesan ini; kalau dimatikan, email harian seperti biasa.
- **Progres klien** (di portal klien dan halaman klien di panel): klien mencatat berat dan lingkar pinggang
  (satu catatan per hari; catatan di hari yang sama diperbarui) dan melihat grafik perubahannya. Klien juga
  bisa mengunggah foto progres (depan/samping); foto disimpan di folder Drive **privat** "XNK Progress"
  (tidak pernah dibagikan lewat link) dan hanya bisa dilihat klien itu dan Anda. Coach bisa menambah atau
  menghapus catatan dari halaman klien. Data ada di sheet `Progress` dan `ProgressPhotos`.
- **Streak & badge** (portal klien, kartu "Pencapaian"): streak = minggu berturut-turut (Senin–Minggu) dengan
  minimal satu sesi selesai; minggu yang sedang berjalan tidak memutus streak sebelum berakhir. Badge:
  10/25/50/100 sesi selesai dan streak 4/8/12 minggu (dihitung otomatis, tidak pernah hilang). Saat klien
  pertama kali membuka beranda setelah meraih badge baru, muncul perayaan sekali saja dengan tombol
  Bagikan (WhatsApp). Halaman klien di panel menampilkan streak dan badge klien itu.
- **Perpanjang paket** (portal klien): saat sisa sesi ≤ 2 muncul tombol **Perpanjang** (juga ada di halaman Paket).
  Klien memilih paket → permintaan tercatat (sheet `RenewalRequests`), Telegram Anda menerima notif, dan
  WhatsApp ke coach terbuka dengan pesan siap kirim. Di panel, kartu **Minta perpanjang** di Dashboard
  menampilkan permintaan; setelah pembayaran diterima tekan **Setujui**: sesi klien direset sesuai paket dan
  transaksi dicatat dengan harga saat itu (sama seperti Perpanjang di form Tambah Klien). **Tolak** tidak
  mengubah data klien. Satu permintaan hanya bisa diputuskan sekali.
- **Pesan baru ke klien** (Pengaturan → Pengingat Klien, semuanya **mati** sampai Anda menyalakannya): **Rekap bulanan**
  (tanggal 1, 09:00: sesi bulan lalu, perubahan berat/pinggang, streak), **Selamat milestone** (tiap hari 18:00:
  klien yang baru meraih badge; tiap badge hanya diselamati sekali) dan **Waktunya ukur** (tiap dua minggu,
  Senin 08:00: klien yang belum mencatat berat/pinggang 14 hari). Cara kerjanya sama: satu pesan Telegram dengan
  satu tombol per klien; tekan nama → WhatsApp terbuka dengan pesan siap kirim. Isi pesan bisa diubah dan tiap
  jenis bisa dimatikan per klien di halaman klien.
- **Notifikasi Admin**: Telegram (saklar, token, chat ID, tombol tes) dan email notifikasi
  (`NOTIF_EMAIL`, kosong = email pemilik akun). Token yang tersimpan hanya tampil sebagai
  `••••1234`; dikosongkan berarti token lama tetap dipakai.
- **Paket & Harga**: tambah, ubah, gandakan, urutkan, tampil/sembunyikan, dan hapus paket tanpa membuka
  spreadsheet. Paket hanya bisa dihapus kalau tidak ada klien atau transaksi yang memakainya;
  kalau tidak, **nonaktifkan** saja (klien lama tidak terpengaruh). Kategori tetap: student, college,
  regular, premium, core. Harga tiap transaksi disimpan di sheet `Members` kolom K ("Harga"), jadi
  mengubah harga paket **tidak** mengubah laporan pendapatan bulan-bulan lalu. Saat pertama kali
  dipakai, sheet `PriceList` dilengkapi kolom "Jumlah Sesi" (kalau belum ada) dan "Urutan".
  **Salin spreadsheet dulu** (File → Buat salinan) sebelum menyimpan perubahan pertama.
- **Jam Operasional** per hari (`BUSINESS_HOURS_JSON`).
- **Keamanan**: ganti PIN, `LOGIN_MAX_FAILS`, `LOGIN_LOCK_SECONDS`, `MEMBER_LOGIN_MAX_FAILS`,
  `ADMIN_SESSION_DAYS`. Kolom angka yang dikosongkan kembali ke nilai bawaan ("Bawaan …").

Semuanya disimpan sebagai Script Properties; kosong = nilai bawaan di `Kode.gs`. Di HP, bagian
dibuka satu per satu dan gerakan kembali di HP menutup bagian itu.

`SESSION_SECRET` dibuat otomatis oleh aplikasi. Menghapusnya = semua PT & klien logout.

**Tanpa membuka editor:** buat file bernama `xnk-pt-config.json` di Google Drive akun
pemilik (jangan dibagikan), isinya JSON, mis.
`{"ADMIN_PIN":"135790","TELEGRAM_CHAT_IDS":"12345678,87654321"}`. Paling lambat 5 menit
setelah halaman aplikasi dibuka, isinya dipindah ke Script Properties, file dibuang ke
Sampah, dan Telegram menerima notif "Pengaturan aplikasi diperbarui". Hanya tiga
property di tabel atas yang diterima; `null` menghapus property. File milik akun lain
(yang dibagikan ke Anda) diabaikan.

### 2. Izinkan Apps Script API

Buka https://script.google.com/home/usersettings → **Google Apps Script API** → **On**.

### 3. Login clasp di komputer

Butuh [Node.js](https://nodejs.org). Pakai versi clasp yang sama dengan robot deploy:

```sh
npm install -g @google/clasp@2.4.2
clasp login
```

Browser terbuka, login dengan akun Google pemilik proyek. Setelah selesai, ada file
`~/.clasprc.json` (Windows: `C:\Users\<nama>\.clasprc.json`).

### 4. Simpan kunci di GitHub

Repo ini → **Settings** → **Secrets and variables** → **Actions**:

- Tab **Secrets** → *New repository secret*
  - Name: `CLASPRC_JSON`
  - Secret: **seluruh isi** file `.clasprc.json`
- Opsional, tab **Variables**: `PT_DEPLOYMENT_ID` hanya perlu diisi kalau web app
  pindah ke deployment lain. Tanpa variable ini, robot deploy memakai deployment
  xnk.my.id saat ini (`AKfycbyVOm1…BgJ`).

Selesai. Merge berikutnya ke `main` akan otomatis ter-deploy. Untuk deploy ulang
manual: tab **Actions** → *PT Scheduler* → **Run workflow**.

> `CLASPRC_JSON` memberi akses ke proyek Apps Script & Drive akun Google Anda.
> Jangan dibagikan. Bisa dicabut kapan saja di https://myaccount.google.com/permissions
> (cari "clasp"), lalu ulangi langkah 3–4.

## Tab Coach (Beranda Coach)

Tab **Coach** di panel adalah berandamu sebagai coach.

- **Hari ini**: sesi hari ini berurutan. Ketuk ✓ untuk menandai selesai (sama seperti di detail sesi).
- **Perlu perhatian**: klien yang perlu disapa (form kesehatan belum ditinjau, tes ulang, belum ada assessment, 14 hari tanpa sesi, dll). Ketuk **Nanti** untuk menyembunyikannya 7 hari.
- **Target bulan ini**: sesi, klien aktif, pendapatan (estimasi), klien baru. Semua opsional; target yang kosong tidak tampil.
- **Jam kerja & cuti**: atur jam kerjamu per hari (boleh beberapa rentang) dan tanggal cuti. Tanpa jam kerja tersimpan, jam yang tampil mengikuti **Pengaturan → Jam Operasional**. Landing, portal, pengingat Booking Minggu, dan booking klien semua memakai satu perhitungan yang sama. Klien tidak bisa booking di luar jam operasional, di jam yang sudah terisi, di jam yang sudah lewat, atau di jam cuti (booking berulang: semua tanggal harus lolos, kalau tidak, tidak ada yang dibuat; ganti jadwal juga dicek). Kamu tetap bisa booking apa pun sebagai pemilik, dengan peringatan.
- **Mode solo**: kalau hanya ada satu coach aktif, pilihan coach, filter coach, dan peringkat coach disembunyikan, dan semua sesi otomatis atas namamu. Coach lama: buka kartunya → **Nonaktifkan** (riwayat tetap aman). Coach yang masih dipakai jadwal atau klien tidak bisa dihapus.
- **Tetapkan ke saya**: memberi coach "Ini saya" ke semua jadwal yang belum punya coach.
- **Lihat seperti klien**: pratinjau halaman coach yang dilihat klien di portal. Halaman itu tampil premium: kartu hero gelap dengan status hari ini, angka klien/sesi/rating, slot kosong terdekat, sertifikasi, prestasi, dan testimoni.

**Halaman klien** sekarang punya kartu hero gelap (sisa sesi, Chat WA, Booking) dan empat tab: Ringkasan, Progres, Perawatan, Riwayat. Tab **Klien** punya empat kotak ringkas (Aktif, Hampir habis, Habis, PR telat) yang juga menjadi filter. Di portal, klien melihat Beranda bergaya dashboard dan tombol **Profil saya** (foto, angka ringkas, kontak, tema, keluar).

**Perawatan klien** (tab Perawatan di halaman klien): catatan privat (tanda perhatian, catatan, tanggal lahir), form kesehatan (diisi klien di portal, kamu tandai **Sudah ditinjau**), assessment, dan tes kebugaran. Semua ini hanya kamu yang bisa baca; Telegram hanya memberi tahu bahwa form diisi, tanpa jawabannya. Di **Pengaturan → Pengingat Klien** ada jenis baru (semua mati bawaan): **Tes ulang** (tiap Senin, 28 hari sejak tes terakhir), **Ulang tahun**, dan **Ringkasan bulanan** untukmu. **Keamanan** punya batas "ganti jadwal klien" (jam sebelum sesi, bawaan 2).

Sebelum deploy pertama fase ini, salin spreadsheet (File → Buat salinan). Sheet baru dibuat otomatis: `CoachTimeOff`, `Assessments`, `FitnessTests`, `HealthScreening`; sheet `Coaches` dan `MemberData` hanya ditambah kolom di kanan.

## Di HP: pasang dari Chrome, tarik untuk muat ulang, tombol back

- **Pasang dari Chrome** (lebih baik daripada bungkus Kodular): buka xnk.my.id di Chrome → menu ⋮ → *Instal aplikasi* / *Tambahkan ke layar utama*. Ikonnya sama, selalu versi terbaru, dan tombol back bekerja normal.
- **Tarik ke bawah** dari paling atas halaman untuk memuat ulang data (tanpa memuat ulang seluruh halaman).
- **Tombol back Android** menutup lapisan paling atas dulu (sheet, panel detail), lalu kembali ke Beranda. Di Beranda, back keluar dari aplikasi.
- Panel menyimpan salinan data terakhir di perangkat admin supaya langsung terisi saat dibuka; data baru menyusul di belakang layar. Salinan dihapus saat keluar atau sesi habis.

## Rollback (kalau versi baru bermasalah)

- **Cepat (tanpa kode):** Apps Script → **Deploy → Manage deployments** → ✏️ Edit →
  *Version*: pilih versi sebelumnya → **Deploy**. Link tetap sama.
- **Lewat repo:** revert PR-nya di GitHub → merge → robot men-deploy versi lama lagi.

## Keamanan (wajib dibaca sebelum menambah fungsi server)

Web app ini terbuka untuk siapa saja dan berjalan sebagai akun pemilik, jadi **setiap
fungsi di `.gs` yang namanya tidak berakhiran `_` bisa dipanggil siapa saja dari browser**.

- Fungsi admin (panel PT): parameter pertama `token`, baris pertama `requireAdmin_(token);`.
- Fungsi portal klien: parameter pertama token member, baris pertama `requireMember_(token)`.
- Fungsi pembantu: beri akhiran `_` (private).
- Fungsi perawatan yang dijalankan manual dari editor: `requireOwner_();`.

Tes `security.test.js` gagal kalau ada fungsi baru yang belum masuk salah satu daftar di atas.

Klien masuk portal dengan **nomor WhatsApp** yang terdaftar (di book.xnkbooking.my.id atau
tombol *Member Lama* di xnkbooking.my.id). Nomor dicek di server; daftar klien tidak pernah
dikirim ke browser. HP klien mengingat login 90 hari. Siapa pun yang tahu nomor WA seorang
klien bisa masuk sebagai klien itu — risiko ini disengaja supaya tanpa link/PIN klien.
Untuk mencegah pemindaian massal: 30 nomor tak dikenal dalam 10 menit = login nomor WA
dikunci 10 menit + notif Telegram. Mengosongkan kolom N ("Kunci Link") seorang klien di
sheet MemberData mengeluarkan klien itu dari semua HP.

## Cek lokal

```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js

# Opsional: uji halaman asli di Chromium (butuh Playwright terpasang global)
NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/browser-check.js
```
