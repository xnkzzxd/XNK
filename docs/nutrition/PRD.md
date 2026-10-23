# Gizi (Phase P) — PRD

Sumber: `TKPI 2020.pdf` = Tabel Komposisi Pangan Indonesia (TKPI) 2020: ~1.000 bahan per 100 g. Itu data angka, bukan aturan; aturan ada di [Rules.md](Rules.md).

## Tujuan
Coach melihat kebutuhan gizi tiap klien (BMI, WHtR, BMR, TDEE, target) yang menyesuaikan goal dan program klien. Klien mendapat target, menu 1 hari, dan catatan makan yang bisa dipakai tanpa ahli gizi.

## Keputusan owner
- Di **profil klien** (tab Gizi) dan **dashboard** (kartu saran penyesuaian target); klien: segmen `Latihan | Makan` di tab Latihan.
- Target **otomatis**; coach hanya mengubah input (goal, aktivitas, pantangan). Perubahan target adaptif = saran yang coach setujui.
- Klien melihat semua angka (BMI, WHtR, BMR, TDEE, target) dengan tombol (i) berisi penjelasan + sumber.
- Data kurasi 150–300 bahan TKPI + ~50 menu jadi estimasi. Pantangan: alergi (telur, seafood, kacang, susu), laktosa, tanpa babi/halal. Anggaran Hemat/Standar/Bebas.
- Menu 1 hari penuh (3 makan, bisa ditukar), daftar belanja mingguan, mode Ramadan, catat makan (cari, dari menu, makanan sendiri; favorit, salin kemarin, porsi rumah tangga). Tanpa foto, barcode, pencatat air, suplemen.
- Pengingat makan yang ada ditambah satu baris personal; tanpa jenis pengingat baru.
- Aktif untuk semua klien (pengecualian aturan 5, seperti panduan klien); `NUTRITION_ENABLED=false` mematikan; ada saklar per klien.
- Privat: tidak ke Telegram, cache admin, atau respons publik.

## Di luar fase ini
Vegetarian, foto makanan, barcode, air, suplemen, pesan WhatsApp otomatis.
