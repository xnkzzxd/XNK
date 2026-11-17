# Panduan XNK Library & Template

Untuk pemilik (sekali) dan untuk setiap coach baru. Spreadsheet dan xnk.my.id milik pemilik **tidak tersentuh**.

## Gambaran

| | Isi | Siapa yang memakai |
| --- | --- | --- |
| **XNK Library** (spreadsheet) | Seluruh kode aplikasi, dibangun otomatis dari kode produksi | Tidak ada; hanya rumah kode |
| **XNK Template** (spreadsheet) | Sheet kosong + kode penghubung kecil + menu **XNK** | Digandakan untuk setiap coach |
| **XNK Template Site** (repo GitHub) | Situs statis (panel + portal + offline) | Dipakai lewat "Use this template" |
| Salinan coach | Hasil gandakan Template + repo situsnya | Coach dan kliennya |

PIN, kunci sesi, Telegram, cache, dan data klien tersimpan di spreadsheet **masing-masing** coach. Library tidak
pernah memakai tempat penyimpanannya sendiri, jadi tidak ada yang tercampur.

## A. Pemilik: pasang sekali

1. **Buat dua spreadsheet.** GitHub → Actions → **XNK Library** → Run workflow → aksi **buat**. Tunggu centang
   hijau. Ringkasan run menampilkan dua scriptId.
2. **Simpan dua ID itu.** Settings → Secrets and variables → Actions → **Variables** → New variable:
   `XNK_LIB_SCRIPT_ID` dan `XNK_TEMPLATE_SCRIPT_ID`.
3. **Bagikan.** Di Google Drive, buka spreadsheet **XNK Library** dan **XNK Template** → Bagikan → *Siapa saja yang
   memiliki link* → **Pelihat**. (Library harus bisa dilihat supaya salinan coach di akun lain bisa memakainya.)
4. **Repo situs.** Buat repo kosong `xnk-template-site`, isi dengan folder `apps-script/xnk-library/site-template/`
   (Claude bisa mengisinya), lalu Settings → centang **Template repository**.
5. **Coba sekali sendiri**: ikuti bagian B dengan salinan pertama.

Setelah itu, setiap merge ke `main` yang mengubah kode aplikasi otomatis menerbitkan versi Library baru dan
menyematkan XNK Template ke versi itu.

## B. Coach baru: 3 langkah

**1. Spreadsheet (±3 menit)**
- Buka XNK Template → **File → Buat salinan**.
- Di salinan: menu **XNK → Mulai setup** (tunggu beberapa detik setelah spreadsheet terbuka sampai menu muncul).
- Ikuti 4 langkah di panel kanan: siapkan (beri izin) → nama usaha dan PIN → terbitkan aplikasi (Deploy →
  Aplikasi web) → salin link `/exec`.

**2. Situs (±2 menit)**
- Buka repo XNK Template Site → **Use this template** → repo baru.
- Settings → Pages → Source: **GitHub Actions**.
- Actions → **Setup situs** → Run workflow → tempel link `/exec` dan nama usaha.

**3. Buka situsnya**: `https://<akun>.github.io/<repo>/` (panel, PIN) dan `/klien/` (untuk klien).
Lalu, di spreadsheet, isi alamat situs di **Mulai setup → langkah 4**.

## C. Memperbarui

| Bagian | Otomatis? | Caranya |
| --- | --- | --- |
| Library (kode server) | Ya, untuk XNK Template | Merge ke `main` → workflow XNK Library |
| Salinan coach yang sudah ada | **Tidak** (versi tersemat, aturan Google) | Di salinan: Ekstensi → Apps Script → Library → XNK → pilih versi terbaru → Simpan. Lalu Terapkan → Kelola deployment → edit → Versi: Baru → Terapkan. |
| Situs coach | Ya, setiap hari | Atau Actions → Setup situs → Run workflow |

Bila alamat situs sudah diisi di spreadsheet, **XNK → Cek kesehatan** memberi tahu bila ada versi Library baru.

## D. Yang tetap manual (aturan Google / GitHub)

- Izin pertama dan **Deploy → Aplikasi web** di setiap salinan.
- Menaikkan versi Library di salinan yang sudah ada.
- Menyalakan GitHub Pages (Settings → Pages → GitHub Actions) di setiap repo situs.

## E. Batasan saat ini

- Notifikasi push ke HP dan halaman landing/penjualan belum ada di situs coach.
- Testimoni dari Google Form evaluasi: isi Script Property `EVAL_SHEET_ID` di salinan bila dipakai (kosong = tidak ada).
- Library sedikit lebih lambat dari kode yang berdiri sendiri (catatan Google untuk semua Library).
