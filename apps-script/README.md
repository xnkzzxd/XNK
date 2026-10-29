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
  - `ReminderVariasi.gs`, `ReminderTeks.gs` — variasi pesan harian ke klien (sheet `PesanVariasi`).
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

Setiap deploy selalu mengirim isi **`main` terbaru**, bukan commit yang memicu run itu.
Jadi kalau beberapa PR di-merge berdekatan, run yang lebih lambat tidak bisa lagi
mengembalikan kode lama; versi terakhir di Apps Script selalu berisi semua PR yang
sudah masuk `main`. Tutup atau muat ulang tab editor Apps Script yang lama sebelum
menyimpan apa pun di sana, karena tab lama masih memegang kode versi lama.

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
- **Variasi pesan harian**: Hidup sehat, Makan pagi/sore, Sesi besok, PR dan Booking Minggu
  memakai 62 teks berbeda (44 hari kerja + 18 akhir pekan) yang berganti tiap hari, dan tiap
  klien dapat teks yang berbeda. Teksnya ada di sheet **PesanVariasi** (dibuat otomatis saat
  pengingat pertama jalan): kolom `Jenis`, `Hari` (`weekday`, `weekend`, `semua`, atau nama hari
  libur), `Teks`, `Aktif` (`tidak` = tidak dipakai). Boleh diubah atau ditambah; baris yang salah
  dilewati. Kunci khusus: `sesi-besok-banyak` / `pr-banyak` (2+ sesi atau PR), `booking-habis`
  (paket habis → ajakan perpanjang), `ramadan-…`, `libur`, dan `personal-kangen` / `personal-sisa`
  / `personal-streak` (satu baris tambahan bila klien lama tidak latihan, sisa sesi ≤ 2, atau
  streak ≥ 3 minggu). Isi pesan di Pengaturan tidak dipakai untuk jenis ini.
- Semua pesan menyapa klien **"Kak <nama depan>"**.
- Hidup sehat, makan dan Booking Minggu dikirim ke **semua klien** bernomor, termasuk yang paketnya
  habis. Makan pagi/sore **aktif bawaan** dan tetap jalan walau MealTips kosong (tip ditambahkan
  bila ada). Selama Ramadan (tabel 2026–2030, bisa beda sehari dari sidang isbat) makan pagi jadi
  pengingat sahur jam 03:00 dan makan sore jadi berbuka jam 17:00, kecuali jamnya sudah diatur.
  Saklar utama pengingat tetap harus menyala.
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
- **Ukuran badan (Fase I1)**: selain berat dan pinggang, klien dan coach bisa mencatat lingkar **lengan kanan, lengan kiri, perut, paha kanan, paha kiri, dan dada** (terlipat di bawah "Lingkar badan lainnya"). Kolom baru ditambahkan otomatis di sheet `Progress` (H–M); catatan lama tetap aman. Pinggul dan lemak tubuh tetap bisa diisi di asesmen.
- **Timer tes kebugaran**: di sheet **Tes kebugaran** (dan otomatis setelah asesmen pertama disimpan) push-up dan squat punya tombol **1:00** (hitung mundur, jeda, ulang, bunyi dan getar saat habis); plank punya **Stopwatch** yang mengisi detiknya ke kolom.
- **Hasil dan tren tes**: portal menampilkan kartu **Hasil tes** (awal → terbaru, selisih, grafik tren). Di halaman klien ada tombol **Kirim hasil via WA** yang membuka WhatsApp dengan ringkasan hasil; kalimatnya bisa diganti lewat Script Property `RMD_TPL_HASIL_TES`.
- **Catatan sesi & pesan pasca-sesi (Fase I2)**: setelah Anda menekan **Selesai** (di Beranda Coach atau detail sesi), muncul lembar **Catatan sesi**: *Yang dilatih*, *Fokus berikutnya*, *RPE* (1–10) dan *Catatan pribadi*. **Simpan & kirim WA** membuka WhatsApp dengan pesan terima kasih yang memuat apa yang dilatih, fokus berikutnya, dan sisa sesi klien; Anda yang menekan kirim, tidak ada pengiriman otomatis. Catatan juga bisa dibuka lagi dari detail sesi yang sudah selesai. Klien hanya melihat *Yang dilatih* dan *Fokus berikutnya* di jadwalnya; RPE dan catatan pribadi hanya Anda. *Fokus berikutnya* tampil di briefing sesi klien berikutnya dan di baris "Hari ini". Data ada di sheet `SessionNotes`. Kalimat pesan bisa diganti lewat Script Property `RMD_TPL_PASCA_SESI` (placeholder `{nama}`, `{dilatih}`, `{fokus}`, `{sisa}`).
- **Penilaian cepat & evaluasi paket (Fase I3)**: setelah sesi selesai, beranda portal klien menanyakan **"Bagaimana sesi tadi?"** (1–5 bintang, satu ketukan, lalu satu kalimat opsional) selama 7 hari. Saat **sisa sesi paket 0**, klien melihat kartu **Evaluasi paket**: ringkasan kemajuannya (sesi selesai, ukuran badan dan tes awal vs terbaru), lima bintang (motivasi, keselamatan, kepuasan, komunikasi, profesionalisme), cerita singkat, izin testimoni, dan tombol **Perpanjang paket**. Saat Anda menekan **Selesai** pada sesi terakhir, lembar catatan sesi menawarkan tombol WhatsApp untuk mengajak klien mengisi evaluasi. Komentar hanya terlihat oleh Anda di halaman klien (kartu **Penilaian klien**) dan ringkasan 30 hari ada di Beranda Coach; Telegram hanya memberi tahu nama depan dan angka (penilaian 3 bintang ke bawah, evaluasi masuk, paket selesai). Data di sheet `SessionRatings` dan `PackageEvaluations`. Bisa dimatikan di **Pengaturan → Tampilan → Penilaian sesi & evaluasi paket** (bawaan menyala). Izin testimoni hanya disimpan; belum tampil di landing.
- **Tambah ke kalender (Fase I4)**: di portal klien, sesi mendatang punya tombol **kalender** (ikon di baris Jadwalku dan tombol *Kalender* di kartu Sesi berikutnya). Setelah booking, pindah jadwal, atau booking berulang berhasil, muncul lembar *Tambah ke kalender*: **Google Kalender** (satu sesi) atau file **.ics** untuk Apple/Outlook (semua sesi berulang dalam satu file, dengan pengingat 1 jam sebelumnya). Semuanya dibuat di browser klien; tidak ada panggilan server dan tidak ada data baru di sheet.
- **Tab baru di portal klien (Fase J1)**: bar bawah HP sekarang **Beranda · Jadwal · + · Progres · Lainnya**; di desktop sidebar menampilkan semuanya (Beranda, Jadwal, Progres, Program, Info & Tips, Paket, Coach). **Lainnya** membuka daftar Program, Info & Tips, Paket, Coach, Tampilan, dan Keluar. Tab **Progres** memuat pencapaian dan badge, **Tantangan bulan ini** (selesaikan 8 sesi per bulan; ubah angkanya lewat Script Property `MONTHLY_CHALLENGE_SESSIONS`), ukuran badan, foto, hasil dan tren tes, grafik konsistensi, dan riwayat latihan. Tab **Program** memuat PR dan makan hari ini. Beranda jadi lebih ringkas dan punya tombol ke tab-tab itu.
- **Program latihan (Fase J2, form sejak Fase M)**: di halaman klien (panel) ada tab **Program**. Program disusun lewat **form**: **Tambah hari**, lalu **+ Gerakan** membuka lembar cari (ketik nama, pilih otot dari daftar, atau ketuk gerakan di *Sering dipakai*; bisa juga memakai nama sendiri). Tiap gerakan punya jenis (**Beban**, **Badan**, **Waktu**, **Jarak**), set, rep min–maks (mis. 8–12), kg, dan istirahat dalam satu baris; nama, catatan, link video (https), **Atur tiap set** (piramida mis. 12/10/8 atau set pemanasan) dan **Superset dengan gerakan di atas** ada di **Lainnya**. Urutan bisa diseret (pegangan di kiri) atau pakai ↑/↓. Bisa disimpan sebagai **template** dan dimuat ke klien lain. Klien melihatnya di tab **Latihan** portal (dulu *Program*) sebagai kartu rutinitas. Centang **Tampilkan di Jelajahi klien** saat menyimpan template supaya klien bisa menyalinnya jadi rutinitas sendiri (mati bawaan). Rutinitas buatan klien terlihat (baca saja) di bagian *Rutinitas buatan klien* pada tab Program halaman klien. Data di sheet `ProgramItems` (kolom baru *Pemilik* dan *Jelajahi*) dan `ProgramLog`.
- **Tab Latihan klien (Fase O, ala Hevy)**: **Mulai latihan kosong**, lalu *Rutinitas* dengan **Rutinitas baru** dan **Jelajahi**. *Dari coach* berisi satu kartu per hari program (nama gerakan dan **Mulai rutinitas**; hari berikutnya bertanda *Berikutnya*), *Rutinitas saya* berisi rutinitas buatan klien (maks. 10, bisa diubah, diduplikat, dihapus). Ketuk kartu untuk detail: grafik **Volume / Rep / Durasi** tiap kali rutinitas dicatat dan daftar gerakan dengan istirahat dan tabel set. Hari program coach bisa **disalin ke rutinitas saya** tanpa mengubah program Anda. Di bawahnya ada *Riwayat latihan*. Ikon gerigi membuka **Pengaturan latihan** (disimpan di HP itu): suara, getar, istirahat bawaan, nilai sebelumnya (terakhir / rutinitas yang sama), kalkulator pemanasan (40·60·80 % atau 50·75 %), layar tetap menyala, kalkulator piringan (bar 20/15/10 kg), dan catat RPE.
- **Mode latihan (Fase M)**: klien menekan **Mulai latihan** (kartu *Latihan hari ini* di Beranda, kartu hari di tab Program, atau tombol **+**), Anda menekan **Mulai latihan** di tab Program halaman klien atau **Catat latihan** di detail sesi. Layar penuh menampilkan semua gerakan hari itu (hari berikutnya dalam rotasi dipilih otomatis, bisa diganti). Tiap set sudah terisi dari latihan terakhir; bila semua set terakhir mencapai rep teratas, beban otomatis naik (+2,5 kg tubuh atas, +5 kg kaki) dengan tulisan *Naik beban*. Sejak Fase O layarnya ala Hevy: di bawah bar atas ada **Durasi**, **Volume**, **Set**, dan **peta otot** (otot yang sudah dilatih jadi gelap). Tiap gerakan punya gambar, catatan coach, **Istirahat: 1m 30d** (ketuk untuk mengubah), lalu **tabel** `SET | SEBELUMNYA | KG | REP | ✓`: angka abu-abu adalah isian bawaan, ketik untuk mengubah (angka baru ikut ke set berikutnya), ketuk ✓ untuk mencentang dan ketuk lagi untuk membatalkan. Ketuk angka *Sebelumnya* untuk memakainya lagi. Ketuk **nomor set** untuk menandai **W** (pemanasan, tidak dihitung volume dan rekor), **D** (drop set), **F** (sampai gagal), atau menghapus set. Gerakan berjenis waktu punya tombol stopwatch di kolomnya. **Tambah set** di bawah tabel. Setelah ✓, **timer istirahat** berjalan (sesuai program atau istirahat bawaan, ±15 detik, Lewati) dengan getar dan bunyi; ikon ⏱ di bar atas memulai timer manual. Superset bergantian otomatis. Gerakan barbell menampilkan piringan per sisi. Menu ⋯ tiap gerakan: target dan catatan coach, video, catatan gerakan, RPE per set, lama istirahat, pindah urutan, lewati, riwayat. Menu ⋯ di bar atas: ganti rutinitas, ganti tanggal, tambah gerakan, pengaturan, buang latihan. **Tambah gerakan** membuka lembar cari dengan **Batal · Buat**: saring **Semua alat** / **Semua otot**, *Gerakan terakhir* di atas, pilih beberapa sekaligus lalu **Tambah N gerakan**, ikon grafik membuka riwayat gerakan itu, dan **Buat** untuk gerakan sendiri (nama, jenis, otot). Gambar gerakan kini tampil juga untuk klien (diambil langsung dari pustaka, tidak disimpan). Klien boleh menambah gerakan sendiri. Semua ketukan tersimpan di HP; kalau aplikasi ditutup, bar **Lanjut** muncul di atas menu bawah. **Selesai** menampilkan ringkasan dibanding latihan sebelumnya, rekor baru, pilihan rasa (5 wajah), dan catatan; latihan dikirim sekali ke server. Kalau sinyal hilang, bar **belum terkirim** muncul dan latihan dikirim ulang otomatis (atau tekan **Kirim ulang**). Klien bisa **Kirim ke coach** lewat WhatsApp; Anda bisa **Kirim ringkasan WA**. Latihan yang lewat dicatat lewat **Catat yang lewat** atau tombol **Ubah** di *Riwayat latihan* (klien 7 hari, Anda 90 hari). Beranda Coach menampilkan *Latihan klien (7 hari)* dengan rasa dan durasi. Data: sheet `WorkoutLog` (kolom baru *Jenis Set*) dan `WorkoutSessions`; tidak ada yang dikirim ke Telegram.
- **Konten & Info untuk klien (Fase J3)**: menu **Konten** di panel (sidebar desktop, atau tombol **+** lalu *Konten* di HP). Tambahkan **Pengumuman** (mis. libur), **Tips**, atau **Video** (tempel link YouTube/Instagram, harus https). Bisa diberi kategori, **disematkan** di atas, dan dijadwalkan (tampil mulai/sampai tanggal) atau dimatikan. Klien melihatnya di tab **Info & Tips** (lewat *Lainnya* di HP); titik kecil menandai konten baru. Data di sheet `Content`.
- **Portal lebih cepat (Fase K1)**: portal klien kini terbuka dari salinan terakhir di HP (data diri sendiri saja; dihapus saat keluar) dengan kerangka abu bila belum ada, lalu diperbarui diam-diam. Server hanya dipanggil 2 kali saat dibuka (sebelumnya ±9) dan pindah tab tidak memanggil server sama sekali, jadi jatah Apps Script lebih hemat. Data boleh datang sedikit belakangan.
- **Halaman Klien di PC/laptop**: daftar klien tampil sebagai kartu (3–4 per baris) dengan jadwal berikutnya, coach (kalau coach lebih dari satu), terakhir aktif, PR, sisa sesi, dan tanda **Minta perpanjang**. Klik kartu → profil terbuka lebar di kanan (±60% layar), dan daftar di kiri berubah jadi daftar nama ringkas (foto, nama, sisa sesi) dengan klien yang dibuka ditandai, jadi pindah klien cukup sekali klik (atau tombol ↑/↓ setelah mengklik daftar). Isi profil dibagi dua kolom kalau layarnya cukup lebar (mulai ±1366 px); di layar yang lebih kecil tetap satu kolom yang lebih lega. Tab yang sedang dibuka tidak kembali ke Ringkasan saat data diperbarui, dan teks pencarian tidak hilang. Profil yang dibuka dari Dashboard, Jadwal, atau Coach tetap panel kecil. Di HP tidak ada yang berubah.
- **Panel lebih cepat (Fase K2)**: panel kini membuka dengan 2 panggilan server (sebelumnya ±7), halaman klien hanya 1 panggilan (sebelumnya 4), dan Pengaturan baru dimuat saat dibuka. Ini juga menghemat jatah Apps Script.
- **Cache bersama (Fase K3)**: testimoni, daftar paket, daftar coach, dan konten untuk klien disimpan beberapa menit di server (otomatis dibuang saat Anda menyimpan perubahan), jadi landing dan portal tidak membuka sheet berulang kali. Lama simpan bisa diatur lewat Script Property `SHARED_CACHE_SECONDS` (bawaan 180 detik).
- **Salinan di perangkat & versi data (2026-10)**: portal klien dan halaman klien di panel menyimpan data terakhir di HP/PC, jadi log latihan, log makan, dan progres langsung tampil tanpa memuat. Server memberi setiap klien "versi data"; data berat hanya diambil ulang kalau versinya berubah (ada yang menyimpan), hari berganti, atau salinan sudah lama. Di perangkat coach disimpan maksimal 15 klien terakhir dan dihapus saat keluar. Tarik layar ke bawah selalu mengambil data terbaru.
- **Catat tanpa sinyal (2026-10)**: catatan latihan dan makan tetap bisa dibuat walau sinyal hilang. Catatan langsung tampil dengan tanda "belum terkirim / menunggu sinyal" dan dikirim otomatis saat sinyal kembali, tanpa dobel. Catatan dari antrean diterima sampai 30 hari ke belakang.
- **Dibuka tanpa sinyal (2026-10)**: xnk.my.id (coach) dan book.xnkbooking.my.id (klien) sekarang bisa dibuka walau tidak ada sinyal sama sekali. Yang tampil layar "Catat offline" dari salinan terakhir: klien bisa catat latihan dan makan serta melihat jadwal, sisa sesi, dan progres; coach bisa melihat jadwal hari ini lalu mencatat latihan, ukuran tubuh, dan catatan sesi klien. Catatan itu dikirim otomatis begitu aplikasi dibuka lagi dengan sinyal. Kalau sinyal lemah, tombol "Catat offline" muncul setelah 10 detik. Berkas layar offline ada di repo XNK (`offline.js`, `offline-host.js`, `offline.css`, `sw.js`); salinan di BookingPT-Client dibuat dengan `node apps-script/pt-scheduler/tools/sync-offline.js ../BookingPT-Client`.
- **Panduan klien baru (Fase J4)**: klien yang baru daftar sekarang dipandu juga di tab **Progres**, **Program**, dan **Info & Tips** (sekali per tab; klien yang sudah menyelesaikan atau mematikan panduan tidak melihatnya). Langkah "Menu" di Beranda menyebut Progres dan Lainnya.
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
- **Kelas** (di Paket & Harga): nyalakan **Ini kelas** pada sebuah paket, isi **Kapasitas** (jumlah kursi),
  **Jadwal kelas** (teks, mis. "Sen & Rab 18:00") dan, kalau mau, **Boleh buat grup privat**. Kelas punya
  jumlah sesi sendiri (kolom "Jumlah Sesi"). Klien ikut kelas lewat alur paket biasa; kelas yang penuh
  tidak bisa dipilih lagi. Di portal, klien kelas privat bisa **Buat grup** (dapat kode 6 karakter) dan
  membagikannya; teman yang sudah mengambil paket kelas yang sama memasukkan kode itu. Sesi kelas yang sama
  pada jam yang sama memakai satu kursi coach (sheet `Schedules` kolom M "Kelas ID"; sheet `ClassGroups`
  baru). Booking untuk klien kelas dilakukan satu per satu (tidak berulang, tidak bisa dipindah sendiri).
  Kolom baru PriceList: "Tipe", "Kapasitas", "Jadwal Kelas", "Kelas Privat" (ditambah otomatis).
- **Jam Operasional** per hari (`BUSINESS_HOURS_JSON`).
- **Keamanan**: ganti PIN, `LOGIN_MAX_FAILS`, `LOGIN_LOCK_SECONDS`, `MEMBER_LOGIN_MAX_FAILS`,
  `ADMIN_SESSION_DAYS`. Kolom angka yang dikosongkan kembali ke nilai bawaan ("Bawaan …").

Semuanya disimpan sebagai Script Properties; kosong = nilai bawaan di `Kode.gs`. Di HP, bagian
dibuka satu per satu dan gerakan kembali di HP menutup bagian itu.

**Batas yang hanya diatur di server** (tidak ada kolomnya di Pengaturan; isi lewat Script Properties
kalau perlu diubah, kosong = bawaan):

- `BOOKING_MAX_DAYS_AHEAD` (bawaan 60): klien hanya bisa booking/pindah jadwal sampai sekian hari ke depan.
  Portal menampilkan jam kosong sampai batas ini.
- `SLOTS_CACHE_SECONDS` (bawaan 120, boleh 10–300): berapa detik server menyimpan daftar jam kosong
  bersama untuk semua pengunjung. Setiap booking, pindah jadwal, hapus jadwal, atau perubahan jam kerja
  langsung membuang simpanan itu, jadi angka ini hanya berpengaruh kalau sheet diubah langsung.
- `REGISTER_MAX_PER_10MIN` (bawaan 5): pendaftaran mandiri maksimal sekian per 10 menit (dari semua
  pengunjung); satu nomor WA hanya bisa mendaftar sekali per menit. Mencegah spam akun & email.

Klien tidak bisa booking kalau sisa sesinya habis (Total Sesi − Sesi Terpakai − sesi mendatang yang
sudah dibooking). Paket tanpa jumlah sesi tidak dibatasi. Admin tetap bisa membuat jadwal, dengan
peringatan. "Selesai" yang ditekan dua kali tidak memotong sesi dua kali, dan sesi selalu dipotong dari
klien pemilik jadwal itu.

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
- **Jam kerja & cuti**: atur jam kerjamu per hari (boleh beberapa rentang) dan tanggal cuti. Tanpa jam kerja tersimpan, jam yang tampil mengikuti **Pengaturan → Jam Operasional**. Landing, portal, pengingat Booking Minggu, dan booking klien semua memakai satu perhitungan yang sama. Jam kosong di Landing dan portal dimuat saat halaman dibuka lalu dipakai ulang 2 menit (tanpa cek berkala, supaya kuota Apps Script hemat), dan memakai jam WIB, jadi tidak tergantung jam di HP pengunjung. Setiap booking klien tetap diperiksa server saat disimpan. Kalau jamnya baru saja terisi, klien tidak melihat pesan gagal: sheet booking tetap terbuka dengan maksimal 3 jam kosong terdekat (durasi sama) yang bisa langsung dipilih. Jam seperti 07.15 dicatat dari 07.00 selama durasi yang dipilih. Paket di Landing diambil dari Pengaturan → Paket & Harga (kategori yang bertanda tampil di Landing, urutan sesuai pengaturan), lengkap dengan perkiraan harga per sesi. Klien tidak bisa booking di luar jam operasional, di jam yang sudah terisi, di jam yang sudah lewat, atau di jam cuti (booking berulang: semua tanggal harus lolos, kalau tidak, tidak ada yang dibuat; ganti jadwal juga dicek). Kamu tetap bisa booking apa pun sebagai pemilik, dengan peringatan.
- **Mode solo**: kalau hanya ada satu coach aktif, pilihan coach, filter coach, dan peringkat coach disembunyikan, dan semua sesi otomatis atas namamu. Coach lama: buka kartunya → **Nonaktifkan** (riwayat tetap aman). Coach yang masih dipakai jadwal atau klien tidak bisa dihapus.
- **Tetapkan ke saya**: memberi coach "Ini saya" ke semua jadwal yang belum punya coach.
- **Lihat seperti klien**: pratinjau halaman coach yang dilihat klien di portal. Halaman itu tampil premium: kartu hero gelap dengan status hari ini, angka klien/sesi/rating, slot kosong terdekat, sertifikasi, prestasi, dan testimoni.

**Halaman klien** sekarang punya kartu hero gelap (sisa sesi, Chat WA, Booking) dan lima tab: Ringkasan, Progres, Program, Perawatan, Riwayat. Tab **Klien** punya empat kotak ringkas (Aktif, Hampir habis, Habis, PR telat) yang juga menjadi filter. Di portal, klien melihat Beranda bergaya dashboard dan tombol **Profil saya** (foto, angka ringkas, kontak, tema, keluar).

**Perawatan klien** (tab Perawatan di halaman klien): catatan privat (tanda perhatian, catatan, tanggal lahir), form kesehatan (diisi klien di portal, kamu tandai **Sudah ditinjau**), assessment, dan tes kebugaran. Semua ini hanya kamu yang bisa baca; Telegram hanya memberi tahu bahwa form diisi, tanpa jawabannya. Di **Pengaturan → Pengingat Klien** ada jenis baru (semua mati bawaan): **Tes ulang** (tiap Senin, 28 hari sejak tes terakhir), **Ulang tahun**, dan **Ringkasan bulanan** untukmu. **Keamanan** punya batas "ganti jadwal klien" (jam sebelum sesi, bawaan 2).

Sebelum deploy pertama fase ini, salin spreadsheet (File → Buat salinan). Sheet baru dibuat otomatis: `CoachTimeOff`, `Assessments`, `FitnessTests`, `HealthScreening`; sheet `Coaches` dan `MemberData` hanya ditambah kolom di kanan.

## Panduan klien baru (portal)

Klien yang **mendaftar sendiri** (dari landing atau katalog portal) mendapat panduan langkah demi langkah di portal: layar digelapkan dan hanya tombol yang perlu diklik yang terang, dengan teks singkat dan tombol **Lanjut** / **Lewati**. Panduan muncul sekali per halaman (Beranda, form Booking, Jadwal, Paket, Coach). Klien lama yang masuk dengan nomor WA, klien yang perpanjang, dan klien yang kamu tambahkan sendiri **tidak** melihat panduan.

- Di HP kartu panduan menempel di bawah (atau atas) layar dan halaman digulir supaya tombol yang disorot tidak tertutup; di desktop kartu muncul di samping tombol dengan panah. Ada titik progres, **Kembali**, **Lanjut**, dan **×** untuk menutup (di desktop juga tombol panah ← → dan Esc).
- Klien bisa menekan **Jangan tampilkan lagi** (di langkah pertama), dan memutar ulang kapan saja dari **Profil saya → Lihat panduan halaman ini**.
- Tercatat di kolom W `Panduan` sheet `MemberData` (`baru|beranda|…`, lalu `selesai`), jadi tetap jalan kalau klien ganti HP. Kolom dibuat otomatis saat pendaftaran pertama.
- Nyala sejak awal. Matikan di **Pengaturan → Tampilan → Panduan klien baru** (langsung tersimpan; Script Property `CLIENT_GUIDE_ENABLED` = `false`).

## Kartu bagikan (Fase T)

Klien (dan kamu, lewat halaman klien) bisa membuat gambar PNG untuk Story Instagram atau Status WhatsApp, seperti kartu Strava dan Hevy.

- **Kartu:** Latihan (satu hari), Daftar gerakan, Rekor, Progres, Gizi hari ini, Rekap bulan ini, Badge baru. Gaya: Transparan, Transparan + grafik, Kartu gelap, Foto (angka ditempel di foto dari HP). Ukuran Story 9:16 atau Kotak 1:1.
- **Tombol:** di kartu hitam Progres, Latihan, dan Makan, dan otomatis terbuka setelah klien menekan **Selesai** latihan (tombol "Ringkasan" membuka ringkasan lama). Perubahan berat/pinggang baru tampil kalau klien menyalakannya.
- **Bagikan / Salin / Simpan:** memakai menu bagikan bawaan HP lewat halaman pembungkus (`index.html`). Gambar dibuat di HP dan tidak diunggah.
- **Nyala sejak awal.** Matikan di **Pengaturan → Tampilan → Kartu bagikan** (Script Property `SHARE_ENABLED` = `false`). Minta izin klien sebelum memposting kartu klien di akun XNK.

**Versi lengkap (Fase T2):**
- **Kartu baru:** Ukuran tubuh (8 lingkar + berat, grafik per ukuran atau sebelum–sesudah), Koleksi badge (semua badge dengan ikon dan nama), Konsistensi (kalender + batang per minggu), Foto progres (sebelum–sesudah dari foto progres; hanya klien sendiri). Gaya baru **Kartu terang**, ukuran baru **Portrait 4:5**.
- **Editor:** di HP layar penuh gelap: pratinjau memenuhi layar, di bawahnya bilah alat ringkas (Kartu, Template, Gaya, Ukuran, Tata letak, Isi, Teks, Ekspor) yang panelnya baru muncul saat diketuk. Geser pratinjau untuk ganti kartu, ketuk untuk layar penuh. Di laptop: pratinjau besar di kiri, kolom alat ramping di kanan, panah ←/→ ganti kartu.
- **Atur sendiri:** template (Minimal, Bold, Strava, Hevy, Polos), angka mana yang tampil dan urutannya, jenis grafik, judul, rata kiri/tengah, posisi, ukuran teks, sudut, bingkai, bahasa kartu English/Indonesia, periode (latihan ini, minggu, bulan, 3 bulan, tanggal), perbandingan (bawaan: vs periode lalu), nama, foto profil, "Coached by" + foto coach, kode QR.
- **Privasi:** angka tubuh mati bawaan (bisa perubahan atau nilai), "Sembunyikan beban", mozaik/potong wajah di kartu foto. Foto tidak pernah diunggah.
- **Ekspor:** Gambar, Gambar HQ, **Video 6 detik** (angka naik, grafik tergambar), dan sampai 5 kartu sekaligus (tombol **+ Set**).
- **Kartu saya:** menu di Lainnya berisi semua kartu siap bagi. Sesudah rekor baru, ukur badan, atau target kalori tercapai muncul ajakan kecil "Bagikan?" (maks sekali sehari; bisa dimatikan di Pengaturan latihan klien).
- **Premium (Fase T3):** angka besar dan judul memakai huruf Anton; kartu gelap/terang/foto diberi butir film dan cahaya lembut (bisa dimatikan: Gaya → Efek → Polos). Video punya dua gaya animasi: **Minimal** (angka naik, grafik tergambar) dan **Kinetic** (judul dan angka raksasa masuk satu per satu ala Nike, medali "Rekor baru", lalu kartu lengkap), panjang **6 / 10 / 15 detik**, dan tombol **Putar pratinjau** di Ekspor.
- **Kode QR:** mati bawaan di tiap kartu. Alamatnya di **Pengaturan → Tampilan → Kartu bagikan** (kosong = `https://xnkbooking.my.id`).

## Gizi & catat makan (Fase P)

Tab **Latihan** klien punya dua bagian: **Latihan** dan **Makan**. Di Makan klien mengisi tinggi, jenis kelamin, tujuan, dan pantangan sekali (berat dan lingkar pinggang diambil dari tab Progres), lalu melihat BMI, WHtR, BMR, TDEE, target kalori dan makro, menu satu hari (bisa ditukar), daftar belanja 7 hari, dan catatan makan harian. Datanya dari **Tabel Komposisi Pangan Indonesia 2020** (Kemenkes); ±50 menu jadi (nasi padang, bakso, gorengan, dll.) adalah **perkiraan** dan diberi tanda "perkiraan".

- **Kamu (coach):** tab **Gizi** di halaman klien menampilkan angkanya, input (tinggi, goal, pantangan, kondisi khusus seperti hamil), dan catatan makan 7 hari. Target selalu dihitung otomatis; kamu mengubah inputnya saja. Kalau berat tidak bergerak sesuai tujuan, dashboard menampilkan kartu **Saran target gizi** (±125 kkal) yang kamu setujui atau tolak.
- **Pengingat makan pagi/sore** ditambah satu baris "Target hari ini N kkal." untuk klien yang datanya lengkap. Hanya kalori; tidak ada berat, BMI, atau kondisi di pesan.
- **Nyala sejak awal.** Matikan untuk semua klien di **Pengaturan → Tampilan → Gizi & catat makan** (Script Property `NUTRITION_ENABLED` = `false`; data tetap tersimpan). Per klien: matikan "Gizi aktif" di tab Gizi.
- **Perlu kamu cek sebelum diumumkan:** angka 50 menu perkiraan di `docs/nutrition/Estimasi.md`, dan aturan di `docs/nutrition/Rules.md` (baris bertanda ⚠ belum diverifikasi ke sumbernya: serat AKG 2019, persentase defisit, waktu makan sekitar latihan). Semua angka adalah estimasi, bukan pengganti ahli gizi atau dokter.
- Sheet baru dibuat otomatis: `FoodLog`, `NutritionAdvice`; `MemberData` bertambah kolom X–AF (termasuk Umur). Data gizi bersifat privat (tidak ke Telegram, kecuali baris kalori di teks pengingat).
- Mengubah daftar makanan: edit `apps-script/pt-scheduler/tools/foods-curated.json`, lalu jalankan `node tools/build-foods.js <teks-TKPI.txt>` (menulis `foods/foods.min.json` dan `src/NutrisiData.gs`; jangan diedit tangan).

## Di HP: pasang dari Chrome, tarik untuk muat ulang, tombol back

- **Pasang dari Chrome** (lebih baik daripada bungkus Kodular): buka xnk.my.id di Chrome → menu ⋮ → *Instal aplikasi* / *Tambahkan ke layar utama*. Ikonnya sama, selalu versi terbaru, dan tombol back bekerja normal.
- **Tarik ke bawah** dari paling atas halaman untuk memuat ulang data (tanpa memuat ulang seluruh halaman).
- **Tombol back Android** menutup lapisan paling atas dulu (sheet, panel detail), lalu kembali ke Beranda. Di Beranda, back keluar dari aplikasi.
- Panel menyimpan salinan data terakhir di perangkat admin supaya langsung terisi saat dibuka; data baru menyusul di belakang layar. Salinan dihapus saat keluar atau sesi habis.

## Di iPhone (Safari)

- **Pasang ke Layar Utama** supaya bar Safari hilang: buka xnk.my.id (atau book.xnkbooking.my.id untuk klien) di Safari → ketuk **Bagikan** → **Tambahkan ke Layar Utama**. Di iPhone, aplikasi menampilkan ajakan ini sekali saja; "Nanti" menanyakan lagi 7 hari kemudian.
- Bar menu bawah menempel di tepi bawah layar (di atas garis home), tidak melayang. Bagian atas memberi ruang untuk poni/Dynamic Island.
- Saat keyboard terbuka, lembar isian naik di atas keyboard dan menu bawah disembunyikan sementara.
- Dari Layar Utama tidak ada tombol back Safari: **geser dari tepi kiri** untuk kembali satu langkah (menutup sheet, panel, atau halaman).
- Warna bar status mengikuti tema terang/gelap aplikasi.

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

### Keuangan (tagihan, pembayaran, pengeluaran)

Pengaturan → **Keuangan** (mati sampai Anda menyalakannya):

- Saat pertama dinyalakan, semua transaksi lama dicatat **Lunas**. Sesudahnya tiap paket baru atau perpanjangan
  otomatis jadi tagihan (status **Belum bayar → DP → Lunas** dihitung dari pembayaran yang dicatat).
- Menu **Keuangan** (sidebar di laptop; kartu pendapatan di Dashboard dan tombol **+** di HP): catat pembayaran
  (bisa dicicil) dan pengeluaran, lihat Masuk, Keluar, Laba, Tunggakan, grafik 6 bulan, daftar tunggakan, ekspor CSV.
- Yang dihapus hanya **diarsipkan** dan bisa dipulihkan (filter **Arsip**).
- Foto bukti transfer/nota disimpan di folder Drive privat **XNK Keuangan**.
- Bagi hasil coach diatur per coach (persen atau rupiah per sesi); kosong = 65%.
- **Klien bisa lihat tagihan** (mati): kartu Tagihan read-only di portal klien.
- Pengingat **Tagihan** (Pengingat Klien, mati): tombol WA ke klien yang belum lunas lebih dari 3 hari.
- Sheet baru: `Tagihan`, `Pembayaran`, `Pengeluaran`, `KategoriKeuangan`; `Coaches` mendapat 2 kolom bagi hasil.

## Tampilan Klien baru (Fase Q)

- **Portal klien:** tiap tab dibuka dengan **kartu hitam** ringkasan. Beranda menampilkan sesi berikutnya paling atas, lalu kartu **Minggu ini** (sesi, latihan mandiri, catat makan, streak, tantangan). Tab **Progres** punya rapor tubuh (4 mgg · 3 bln · Semua) dengan kalimat kesimpulan, BMI/rasio pinggang dengan bahasa lembut, lingkar badan dan simetri, kemajuan tes, serta hubungan konsistensi dengan hasil. Tab **Latihan** punya perbandingan minggu ini vs biasanya, kalender aktivitas 12 minggu, kekuatan per gerakan (termasuk tanda mandek), dan keseimbangan otot.
- **Panel Klien:** kartu hitam ringkasan, filter **Perlu perhatian** (tidak latihan ≥ 14 hari, kuota habis/hampir tanpa jadwal, PR telat, minta perpanjang, rating ≤ 3), urutkan, dan sakelar Kartu/Daftar di laptop. Halaman klien kini 4 tab: **Ringkasan** (Sorotan, data, PR, jadwal, Riwayat, pengingat WA yang dilipat), **Progres**, **Latihan**, **Gizi**.
- Satu-satunya warna adalah merah kecil untuk tanda bahaya. Batas "tidak latihan" bisa diubah lewat Script Property `CLIENT_INACTIVE_DAYS` (bawaan 14, 3–90). Tidak ada sheet atau kolom baru.
