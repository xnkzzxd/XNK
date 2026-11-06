# Phase AAA — PRD: frontend statis di GitHub Pages, backend tetap Apps Script

Status: **planned** (rencana disetujui pemilik). Tugas T-1700+ di [TODO.md](TODO.md), desain di [Design.md](Design.md). Fase ini berdiri sendiri, di luar Phase V.

## 1. Masalah
- GitHub Pages hanya menyimpan pembungkus iframe. Isi aplikasi (`App.html` ±796 KB, `Theme.html` ±180 KB, dst., total ±1,3 MB) dirender per permintaan oleh Apps Script (`HtmlService`) dan jalan di dalam iframe `script.googleusercontent.com`.
- Akibatnya: buka lambat dan tidak bisa di-cache, perlu jembatan iframe (`hostBridge`, safe-area iOS, keyboard, share, offline), dan frontend tidak bisa di-deploy terpisah dari backend.

## 2. Tujuan
1. UI dilayani sebagai **file statis** dari GitHub Pages.
2. Semua panggilan server memakai `fetch` ke `doPost` Apps Script. Backend (logika, Sheets, trigger) tidak berubah.
3. **Domain tetap**: `xnk.my.id` (panel), `xnkbooking.my.id` (landing), `book.xnkbooking.my.id` (portal klien).
4. Tampilan dan perilaku sama persis (pixel diff, tes browser).

## 3. Keputusan pemilik
| # | Keputusan |
| --- | --- |
| 1 | Urutan: panel dulu, lalu landing, lalu portal klien. |
| 2 | Domain yang ada dipertahankan; tidak ada domain baru. |
| 3 | Pindah origin: **tanpa penanganan khusus**. Login ulang sekali (klien dengan nomor WA); antrean offline dan draf lokal yang belum terkirim di origin lama hilang. Risiko diterima. |
| 4 | Repo XNK membangun semua situs dan **mendorong hasil build** ke BookingPT-Client dan BookingPT (satu secret token). |
| 5 | Versi lama (halaman GAS via `doGet`, pembungkus iframe) **disimpan permanen** sebagai jalan kembali. Tes dua mode tetap di CI. |
| 6 | AAA0 adalah **gerbang go/no-go**: bila median panggilan `fetch` lebih dari ±30 % lebih lambat dari `google.script.run`, berhenti dan putuskan bersama. |

## 4. Bukan tujuan
- Tidak memindahkan data atau backend (itu Phase V).
- Tidak mengubah UI, teks, atau alur.
- Tidak menghapus kode `google.script.run`, `hostBridge`, atau halaman GAS.

## 5. Kriteria selesai
- Panel, landing, dan portal berjalan dari file statis, dengan tes browser, offline, dan bagikan lolos.
- Setiap situs bisa kembali ke versi iframe dengan menyalin satu berkas.
- Tes kontrak: setiap fungsi yang dipanggil UI ada di gerbang `doPost` dengan kategori yang benar.
- Muat awal lebih cepat dari sekarang (diukur sebelum dan sesudah).
