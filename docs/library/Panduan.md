# Panduan XNK Library & Template

Untuk pemilik (sekali) dan untuk setiap coach baru. Spreadsheet dan xnk.my.id milik pemilik **tidak tersentuh**.

## Gambaran

| | Isi | Siapa yang memakai |
| --- | --- | --- |
| **XNK Library** (spreadsheet) | Seluruh kode aplikasi, dibangun otomatis dari kode produksi | Tidak ada; hanya rumah kode |
| **XNK Template** (spreadsheet) | Sheet kosong + kode penghubung kecil + menu **XNK** | Digandakan untuk setiap coach |
| **Hub xnk.web.id** (repo GitHub `xnk-template-site`) | Satu situs untuk semua coach: `xnk.web.id/<nama>/` (panel) dan `xnk.web.id/<nama>/klien/` (portal klien) | Coach dan kliennya; hanya Anda yang mengelola daftarnya |
| Salinan coach | Hasil gandakan XNK Template (satu spreadsheet per coach) | Coach |

Coach **tidak perlu GitHub**. PIN, kunci sesi, Telegram, cache, dan data klien tersimpan di spreadsheet
**masing-masing** coach. Library tidak pernah memakai tempat penyimpanannya sendiri, dan di browser setiap coach
punya penyimpanan sendiri walau satu domain (lihat [Hub.md](Hub.md)).

## A. Pemilik: pasang sekali

1. **Dua spreadsheet** (sudah dibuat 2026-11-17): XNK Library dan XNK Template, dibagikan "siapa saja yang memiliki
   link: Pelihat". Dua ID-nya tersimpan sebagai repo variable `XNK_LIB_SCRIPT_ID` dan `XNK_TEMPLATE_SCRIPT_ID`.
2. **Hub.** Repo `xnk-template-site` berisi `hub.json` dan workflow **Hub XNK**. Ikuti README repo itu: nyalakan
   Pages (GitHub Actions), arahkan DNS `xnk.web.id`, isi Custom domain, centang Enforce HTTPS.
3. **Coba sekali sendiri**: ikuti bagian B dengan salinan pertama (slug `claudia`).

Setelah itu, setiap merge ke `main` yang mengubah kode aplikasi otomatis menerbitkan versi Library baru dan
menyematkan XNK Template ke versi itu.

## B. Coach baru

**Cara cepat (Gelombang 2):** simpan token clasp akun coach ([Akun.md](Akun.md)), lalu repo hub → Actions → **Coach XNK** → `baru` (slug + nama usaha). Spreadsheet, penghubung, web app dan alamat hub dibuat otomatis; Anda tinggal membuka spreadsheet → XNK → Mulai setup. Cara manual di bawah tetap bisa dipakai.

**Coach (±5 menit)**
- Buka XNK Template → **File → Buat salinan**.
- Di salinan: menu **XNK → Mulai setup** (tunggu beberapa detik sampai menu muncul).
- Ikuti 4 langkah di panel kanan: siapkan (beri izin) → nama usaha dan PIN → terbitkan aplikasi (Deploy → Aplikasi
  web) → pilih nama di alamat. Wizard menampilkan **data untuk dikirim ke pengelola XNK** (nama di alamat, nama
  usaha, link /exec) dengan tombol Salin.

**Anda (±1 menit)**
- Repo hub → **Actions → Hub XNK → Run workflow** → aksi `simpan`, isi slug, nama usaha, link `/exec`.
- Selesai: `xnk.web.id/<slug>/` dan `xnk.web.id/<slug>/klien/` aktif. Bagikan link `/klien/` ke klien coach itu.

Bila isian salah, workflow berhenti dengan pesan yang jelas dan situs lama tidak berubah.

## C. Memperbarui

| Bagian | Otomatis? | Caranya |
| --- | --- | --- |
| Library (kode server) | Ya, untuk XNK Template | Merge ke `main` → workflow XNK Library |
| Salinan coach yang sudah ada | **Ya**, setiap hari 02:37 WIB, bila token clasp akun coach tersimpan ([Akun.md](Akun.md)) | Repo hub → Actions → **Coach XNK** → `perbarui` (manual kapan saja). Tanpa token: Ekstensi → Apps Script → Library → XNK → versi terbaru → Simpan, lalu Terapkan → Kelola deployment → edit → Versi: Baru. |
| Situs hub (halaman semua coach) | Ya, setiap hari | Atau Actions → Hub XNK → Run workflow (aksi `bangun`). Halaman tiap coach mengikuti versi Library di spreadsheet coach itu, jadi coach yang belum diperbarui tetap aman; setelah Library dan deployment-nya dinaikkan, build berikutnya memberi halaman terbaru. |

Bila alamat sudah diisi di wizard, **XNK → Cek kesehatan** di spreadsheet coach memberi tahu bila ada versi Library baru.

## C2. Spreadsheet berat dibuka di Chrome: XNK → Rapikan sheet

Spreadsheet yang lama dipakai sering membawa ribuan baris dan kolom kosong, format sisa, validasi data dan format bersyarat yang menyebar ke area kosong. Semua itu ikut dimuat Chrome walau tidak berisi apa pun.

1. Buka spreadsheet coach → menu **XNK → Rapikan sheet** (menu muncul setelah salinan diperbarui, lihat C).
2. Dialog menampilkan laporan, tanpa mengubah apa pun: jumlah sel sekarang → sesudah dirapikan, persen dari batas Google (10 juta sel per spreadsheet), dan per sheet: data yang terisi (baris × kolom) serta baris/kolom kosong, format bersyarat, sel berformat dan catatan yang akan dibuang.
3. Tekan **Rapikan sekarang**. Hasilnya tampil di dialog yang sama.
4. **Tutup spreadsheet lalu buka lagi** supaya Chrome memuat ukuran baru.

Yang dijaga: sel berisi, baris judul kolom, dan sheet tidak pernah dihapus. Disisakan 50 baris dan 2 kolom kosong di luar data (kolom tidak dikecilkan di bawah 26, MemberData di bawah 60, karena aplikasi menulis judul kolom di nomor kolom tetap). Format dan validasi per kolom di 50 baris cadangan dibiarkan supaya baris baru mewarisinya. Sheet kosong yang tidak dipakai aplikasi hanya disebut di laporan; hapus sendiri bila memang tidak perlu. Dijalankan lagi = "Tidak ada yang perlu dirapikan". Hanya pemilik spreadsheet. Di produksi (xnk.my.id): editor Apps Script → jalankan `rapikanSheet` (laporan di Log), lalu `rapikanSheetSekarang`.

## D. Yang tetap manual (aturan Google / GitHub)

- Izin pertama di setiap salinan (XNK → Mulai setup). **Deploy → Aplikasi web** hanya manual bila salinan dibuat tanpa Coach XNK `baru`.
- Menaikkan versi Library hanya di salinan yang tidak punya token clasp tersimpan (yang punya diperbarui otomatis, lihat C).
- Alternatif tanpa hub: repo situs per coach dari `apps-script/xnk-library/site-template/` (domain sendiri, `build-tenant.js`). Tidak dipakai sebagai jalur utama.
- Menambah coach ke hub: Anda menjalankan workflow Hub XNK (satu formulir).

## E. Batasan saat ini

- Notifikasi push ke HP ada sejak T-2240, tetapi menyala per coach hanya setelah Anda menekan **Nyalakan push** di `/adminxnk` ([../push/Setup.md](../push/Setup.md)). Halaman depan `xnk.web.id` berisi daftar kartu coach dengan pencarian dan pilihan kota (T-2260).
- Coach tidak boleh memasang JavaScript sendiri di hub (syarat isolasi penyimpanan); tampilan diatur lewat nama usaha, warna aksen, logo dan tempat di `hub.json`.
- Pustaka gerakan dan makanan di hub disajikan dari `xnk.web.id/_lib/`.
- Testimoni dari Google Form evaluasi: isi Script Property `EVAL_SHEET_ID` di salinan bila dipakai (kosong = tidak ada).
- Library sedikit lebih lambat dari kode yang berdiri sendiri (catatan Google untuk semua Library).
