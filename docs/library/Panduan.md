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
| Salinan coach yang sudah ada | **Tidak** (versi tersemat, aturan Google) | Di salinan: Ekstensi → Apps Script → Library → XNK → pilih versi terbaru → Simpan. Lalu Terapkan → Kelola deployment → edit → Versi: Baru → Terapkan. |
| Situs hub (halaman semua coach) | Ya, setiap hari | Atau Actions → Hub XNK → Run workflow (aksi `bangun`). Halaman tiap coach mengikuti versi Library di spreadsheet coach itu, jadi coach yang belum diperbarui tetap aman; setelah Library dan deployment-nya dinaikkan, build berikutnya memberi halaman terbaru. |

Bila alamat sudah diisi di wizard, **XNK → Cek kesehatan** di spreadsheet coach memberi tahu bila ada versi Library baru.

## D. Yang tetap manual (aturan Google / GitHub)

- Izin pertama dan **Deploy → Aplikasi web** di setiap salinan.
- Menaikkan versi Library di salinan yang sudah ada.
- Alternatif tanpa hub: repo situs per coach dari `apps-script/xnk-library/site-template/` (domain sendiri, `build-tenant.js`). Tidak dipakai sebagai jalur utama.
- Menambah coach ke hub: Anda menjalankan workflow Hub XNK (satu formulir).

## E. Batasan saat ini

- Notifikasi push ke HP belum ada di situs coach. Halaman depan `xnk.web.id` baru berisi pengenalan singkat dan kotak masuk.
- Coach tidak boleh memasang JavaScript sendiri di hub (syarat isolasi penyimpanan); tampilan hanya nama usaha.
- Pustaka gerakan dan makanan masih dimuat dari `xnk.my.id`.
- Testimoni dari Google Form evaluasi: isi Script Property `EVAL_SHEET_ID` di salinan bila dipakai (kosong = tidak ada).
- Library sedikit lebih lambat dari kode yang berdiri sendiri (catatan Google untuk semua Library).
