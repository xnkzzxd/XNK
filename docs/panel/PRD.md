# PRD — Fase S: audit UI/UX panel admin (mobile + desktop)

Sumber: audit 2026-10-26 (tangkapan layar `browser-check.js`, 390 px dan 1440 px, terang dan gelap) atas Dashboard, Jadwal, Klien, profil klien, Coach, Keuangan, Pengaturan. Aturan tetap berlaku: hitam-putih, teks dalam rem, `min-height` bukan `height`, `var(--sa-*)`, ikon lewat `icon()`, backend-first (lihat Agent.md §4 dan Fase R).

## 1. Tujuan
Owner membuka panel untuk tiga hal: *apa jadwal hari ini*, *siapa klien yang perlu diurus*, *berapa uang masuk*. Fase ini membuat ketiganya terlihat di layar pertama, memperbaiki regresi visual sisa Fase R, dan mengurangi kebisingan (kartu dan angka ganda). Tidak ada fitur baru, tidak ada kolom sheet baru, tidak ada fungsi `.gs` baru.

## 2. Masalah yang dikerjakan

| # | Masalah | Layar | Berat |
|---|---|---|---|
| P1 | `.detail-head` putih di sebelah band hitam; cek `header lined up with the top bar` gagal | Desktop: profil klien, profil coach | Tinggi |
| P2 | Mode gelap: kartu "Sesi berikutnya" redup, label dan tombol "Ingatkan" nyaris tak terlihat; kartu lain justru terang (hirarki terbalik) | Dashboard desktop dan HP | Tinggi |
| P3 | Halaman Klien: ringkasan hitam + 4 tile + cari + sortir + chip sebelum klien pertama; angka ganda | Klien HP dan desktop | Tinggi |
| P4 | Judul grup bulan ("JANUARI 2026") tanpa penjelasan dasar pengelompokan | Klien | Tinggi |
| P5 | Bar tab bawah menutup konten, tidak ada padding bawah/bayangan yang cukup | Semua layar HP | Tinggi |
| P6 | Pengaturan HP tampak bergeser (band hitam ±60 px, kartu terpotong) | Pengaturan HP | Tinggi (verifikasi dulu) |
| P7 | Dashboard: "Sesi berikutnya" mengulang agenda "Hari ini"; agenda di bawah lipatan; 4 tile + hero memakan layar pertama | Dashboard | Sedang |
| P8 | Aksi sesi (Selesai/Ubah/WA) bobot sama; "Selesai" kontras rendah di kartu hitam; tombol menumpuk kiri | Dashboard, Jadwal | Sedang |
| P9 | Empty state besar ("Semua klien aman"); daftar "Perlu perhatian" Coach 3 baris identik + "Nanti" | Dashboard, Coach | Sedang |
| P10 | Keuangan HP: angka penuh turun 2 baris di tile; grafik 6 bulan hampir kosong | Keuangan | Sedang |
| P11 | Jadwal: kalender memakan layar HP; desktop punya ruang kosong besar di bawah | Jadwal | Sedang |
| P12 | Profil klien HP: hero + tab hitam ±40 % layar sebelum "Sorotan" | Profil klien | Sedang |
| P13 | Titik kecil tanpa label (sidebar/tab/Booking baru); ikon dekoratif di tile; label "Coach" ganda (sidebar + tab) | Lintas layar | Rendah |
| P14 | Gaya tombol "Selesai" tidak seragam; kartu hitam terlalu banyak | Lintas layar | Rendah |
| P15 | Cek otomatis `pull down: ends with a check mark` gagal; tentukan bug atau waktu tunggu | Pull-to-refresh HP | Verifikasi |

## 3. Keputusan desain
- **Agenda dulu.** Di HP, urutan Dashboard: salam, *Hari ini* (agenda), baris tile yang bisa digeser, kartu lain. Kartu "Sesi berikutnya" tetap ada hanya bila sesi berikutnya *bukan* sesi pertama di agenda hari ini; kalau sama, hero diganti sorotan di baris pertama agenda.
- **Satu ringkasan per halaman.** Halaman Klien: hapus 4 tile (chip filter sudah memuat hitungan). Ringkasan hitam jadi satu baris di HP. Cari dan sortir satu baris.
- **Grup klien diberi label** dasarnya (urut Terbaru → "Bergabung", Sisa sesi → "Sisa sesi", dst.), bukan sekadar nama bulan.
- **Satu aksi utama per baris sesi**: "Selesai" solid; "Ubah" dan "WA" ikon/teks sekunder. Kontras diperiksa di kartu hitam dan mode gelap (≥ 4.5:1 untuk teks).
- **Mode gelap**: kartu penting memakai permukaan lebih terang dari latar (bukan lebih gelap); tombol sekunder di atasnya punya batas terlihat.
- **Empty state** satu baris (ikon kecil + teks) bila ruangnya sempit atau data kosong; ilustrasi besar hanya di halaman yang kosong seluruhnya.
- **Tile uang** memakai format ringkas (`_rpShort`-style, "2,3 jt") di tile; angka penuh di detail.
- Tidak menambah warna. Titik tanpa label diganti angka atau label teks.

## 4. Di luar cakupan
Portal klien, Landing, logika server, layar Gizi/Latihan, redesain navigasi.

## 5. Ukuran sukses (tercapai, dicek oleh blok S17 di browser-check.js)
- [x] Layar pertama HP (390×844) memperlihatkan: Dashboard → ≥ 1 sesi hari ini; Klien → ≥ 1 baris klien.
- [x] `browser-check.js`: semua cek hijau, termasuk dua cek yang gagal sekarang; tidak ada overflow horizontal di 360/390/430 px dan 1280/1440 px, terang dan gelap.
- [x] Kontras teks dan tombol di kartu hitam ≥ 4.5:1 (diukur di tes browser).
- [x] Tidak ada perubahan di `.gs`, sheet, atau `tests/security.test.js`.
