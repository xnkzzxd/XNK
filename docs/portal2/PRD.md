# PRD — Fase X: portal klien baru untuk HP (T-1900+)

## Kenapa

Portal klien tumbuh fase demi fase. Bar bawahnya `Beranda · Jadwal · + · Progres · Lainnya`, sedangkan yang dipakai klien tiap hari (Latihan, Makan) tersembunyi di `Lainnya`, dan Beranda berisi lebih dari sepuluh kartu tanpa urutan. Pemilik minta alur yang benar-benar baru untuk HP, dengan tema yang sama, dan tab Saya yang terasa milik klien: bisa diatur sendiri, membuat bangga, dan mudah dibagikan.

Acuan tampilan: kanvas mockup "XNK Portal Klien — Mockup Fase X" (61 layar HP).

## Keputusan pemilik

| Hal | Keputusan |
| --- | --- |
| Tab bawah | Hari ini · Latihan · ＋ · Makan · Saya. Gizi mati: Makan diganti Progres |
| ＋ | Sheet empat aksi: Booking sesi, Mulai latihan, Catat makan, Catat ukuran |
| Hari ini | Kartu hitam sesi berikutnya paling atas. Lalu daftar centang "Tugas hari ini": latihan dan makan hari ini, PR dari coach, paket dan umpan balik (booking bila kosong, perpanjang saat sisa ≤ 2, nilai sesi, evaluasi paket, tagihan). Strip Minggu ini |
| Jadwal | Bukan tab. "Semua jadwal" dibuka dari kartu sesi: kalender bulan + daftar Mendatang dan Selesai |
| Booking | Layar penuh tiga langkah: Hari → Jam → Konfirmasi. Langkah Coach di depan hanya bila ada dua coach aktif atau lebih. Ubah jadwal memakai layar yang sama |
| Lonceng | Di band atas: info dan tips baru, ukur dan isi data, status paket dan jadwal, pencapaian |
| Latihan | Daftar rutinitas dengan tombol Mulai di tiap kartu, Buat rutinitas, Galeri template coach (Simpan → Rutinitas saya). Pencatat tetap daftar + tabel, hanya dirapikan |
| Makan | Cincin kalori, lalu buku harian per waktu makan dengan ＋ di tiap waktu. Tambah makanan: terakhir dan sering, saran menu hari ini, pilih banyak sekaligus |
| Rencana makan | Menu hari ini, belanja, aturan makan, dan angka tubuh pindah ke halaman sendiri di tab Saya |
| Saya | Kartu atlet (foto, nama panggilan, motto, level dan gelar, 3–4 statistik pilihan, 3 badge unggulan, gaya kartu, Ubah, Bagikan), lalu kisi kartu ikon |
| Kustomisasi | Disimpan di akun. Warna aksen tujuh pilihan (bawaan hitam) berlaku di seluruh portal |
| Level | Poin dari semua aktivitas; tidak pernah turun |
| Progres | Cerita perjalanan: kalimat tafsir, grafik dengan chip (Berat, Pinggang, Kuat, Bugar), Sebelum dan sesudah (angka; foto opsional), linimasa Momen. Tanpa target |
| Isi ukuran | Berat dulu dengan tombol −/＋ besar; lingkar dan foto opsional |
| Paket dan coach | Halaman Paket saya (aktif, sisa, tagihan, perpanjang dua langkah) dan halaman Coach |
| Masuk dan daftar | Satu kolom nomor WhatsApp. Nomor baru: nama → paket dan coach (akun dibuat di sini) → jadwal pertama → tubuh dan tujuan → form kesehatan. Langkah 3–5 boleh "Nanti saja" dan masuk lonceng. Panduan tunjuk-tombol diganti tiga kartu sambutan |
| Bagikan | Editor sederhana: pratinjau, geser gaya, tiga chip (Ukuran, Isi, Privasi). Kartu baru: Atlet, Naik level, Sebelum–sesudah. Ditawarkan di layar selesai latihan, perayaan pencapaian, dan ikon di tiap kartu hitam. PNG saja, tanpa unggah |
| Grafis | A geometri untuk kartu aksi, B kontur untuk band dan latar tenang, C tipografi raksasa untuk kartu atlet, level, perayaan, dan kartu bagikan. Tetap hitam-putih + warna aksen |
| Teks | Netral, tanpa "kamu" atau "Kak" |
| Cakupan | HP. Desktop hanya mengikuti agar tidak rusak |
| Rilis | Satu rilis, langsung mengganti portal lama (tanpa sakelar; pengecualian aturan 5 atas keputusan pemilik) |

## Bukan cakupan

- Halaman profil publik (tautan). Berbagi tetap berupa gambar.
- Target pribadi (misalnya berat tujuan).
- Perombakan panel admin dan layar offline di halaman pembungkus.
- WhatsApp otomatis ke klien.

## Privasi

Sama seperti sekarang: data gizi, latihan, ukuran, dan foto progres hanya untuk klien itu dan coach. Profil kartu (nama panggilan, motto, pilihan tampilan) adalah data klien sendiri; tidak masuk Telegram, jawaban publik, atau `xnk_admin_cache`.
