# TODO — Fase X (T-1900+): portal klien baru untuk HP

Baca [PRD.md](PRD.md) dan [Design.md](Design.md) dulu.

- [x] T-1900 Mockup 61 layar HP (kanvas "XNK Portal Klien — Mockup Fase X"), gaya grafis A/B/C dipilih pemilik
- [x] T-1901 Dokumen: PRD, Design, TODO, baris Fase X di CLAUDE.md
- [x] T-1902 Server: `Profil.gs`, `Level.gs`, part `profile`/`level`/`moments`/`journey`/`notif`/`todo` di `getPortalMore`, tes
- [x] T-1903 Tema: warna aksen, grafis `.gfx-*`, komponen baru; kerangka lima tab + lonceng + sheet ＋ empat aksi
- [x] T-1904 Hari ini (kartu sesi, tugas hari ini, strip minggu, kartu paket) + Jadwal (kalender bulan, jam kosong, daftar Mendatang dan Selesai)
- [x] T-1905 Booking tiga langkah (`#bk-screen`: coach bila 2+ → hari → jam → periksa), ubah jadwal lewat layar yang sama; kirim dan bentrok tetap lewat form lama
- [x] T-1906 Latihan: kartu hitam "Berikutnya" (`#pub-lat-hero`: Mulai / Latihan kosong) → daftar rutinitas dengan tombol Mulai → Buat rutinitas · Galeri (dulu Jelajahi) → program otomatis → tafsir minggu ini. Pencatat dan layar selesai tidak diubah (bagikan sudah ditawarkan setelah simpan; editor bagikan dirapikan di T-1911)
- [x] T-1907 Makan: cincin + buku harian per waktu makan (saran menu bila kosong); layar tambah dengan saran menu "Catat semua" dan pilih banyak; Rencana makan (`public-plan`: target, menu, belanja, angka tubuh, aturan) di bawah Saya
- [x] T-1908 Saya: kartu atlet + kisi; Ubah profil (`#sheet-profile-edit`, awalan `pc-`: aksen, gaya kartu, nama panggilan, motto, 3–4 statistik, ≤ 3 badge; pratinjau langsung, batal = kembali); Paket saya (`public-pack`: paket aktif, sisa, status perpanjangan, tagihan; Perpanjang memakai `#sheet-renew` yang ada, satu langkah); Coach = halaman `public-coaches` yang ada; Tampilan = lembar Pengaturan + warna aksen (`setAccent`)
- [x] T-1909 Progres: kartu cerita perjalanan (`#pub-journey-card`: kalimat utama, Awal / Sekarang / Selisih, Catat ukuran, Bagikan), linimasa Momen (4 teratas + Lihat semua), isi ukuran berat dulu dengan tombol −/＋ (`pgStep`, mulai dari berat terakhir). Empat bagian (Ringkasan, Ukuran, Tes, Riwayat) dan foto tetap seperti sebelumnya
- [x] T-1910 Tiga kartu sambutan (panduan lama dihapus); layar masuk satu kolom ("Masuk atau daftar"); nomor baru → lembar `#sheet-reg` lima langkah (nama → paket & coach, akun dibuat → jadwal pertama → tubuh & tujuan → form kesehatan; langkah 3–5 membuka layar yang ada dan boleh "Nanti saja"; kartu sambutan dan tombol WA ke coach muncul setelah selesai). Daftar dari katalog (`modal-public-register`) tetap ada
- [~] T-1911 Bagikan: kartu **Atlet** (level, gelar, statistik pilihan; tombol Bagikan di kartu atlet langsung membukanya) sudah jadi. Belum: editor disederhanakan, kartu Naik level dan Sebelum–sesudah, layar perayaan, kartu ikut warna aksen
- [~] T-1912 Tes browser, demo, dan Agent.md §7 diperbarui per langkah. Belum: README ×2, `apps-script/README.md`, grafis untuk layar yang masih polos dan ilustrasi keadaan kosong
