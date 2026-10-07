# PRD — Phase I: putaran coach ↔ klien

| | |
| --- | --- |
| Status | Disetujui 2026-10-07, dibangun bertahap (I1 → I4) |
| Terkait | [Design.md](Design.md) · [TODO.md](TODO.md) · [../Agent.md](../Agent.md) · [../coach/PRD.md](../coach/PRD.md) |

## 1. Latar belakang

Audit interaksi coach–klien (2026-10) menemukan celah: tidak ada catatan sesi dari coach, penilaian hanya lewat form Google di luar aplikasi, tidak ada pesan pasca-sesi, progres tubuh hanya berat dan pinggang, hasil tes tanpa tren, dan klien tidak bisa menyimpan sesi ke kalender.

## 2. Tujuan

- **L1.** Setiap sesi punya putaran: catatan coach → pesan WA siap kirim → penilaian cepat dari klien.
- **L2.** Setiap paket punya evaluasi akhir saat sisa sesi 0.
- **L3.** Progres tubuh dan kebugaran terlihat sebagai tren (8 ukuran badan, grafik tes).
- **L4.** Asesmen awal punya timer 1 menit untuk tes push-up, squat, dan stopwatch plank.
- **L5.** Sesi bisa ditambahkan ke kalender klien (Google Kalender atau `.ics`).

Bukan tujuan: API WhatsApp atau pengiriman otomatis ke klien (tetap tombol `wa.me`), penayangan testimoni baru di landing, login coach.

## 3. Kebutuhan

| ID | Prioritas | Kebutuhan |
| --- | --- | --- |
| I-1 | P0 | Ukuran badan: berat, pinggang, lengan kanan, lengan kiri, perut, paha kanan, paha kiri, dada. Diisi coach dan klien, satu baris per klien per tanggal, nilai kosong tidak menimpa. |
| I-2 | P0 | Pinggul dan lemak tubuh tetap bisa diisi di asesmen sebagai tambahan. Data lama tetap terbaca. |
| I-3 | P0 | Timer 1 menit (hitung mundur, jeda, ulang, bunyi dan getar saat habis) untuk tes "kali / 1 menit"; stopwatch untuk plank. Berjalan di HP. |
| I-4 | P0 | Tren kebugaran: grafik per tes di portal dan halaman klien. Kartu "Hasil tes" di portal. |
| I-5 | P0 | Pesan WA hasil tes siap kirim dari halaman klien (template, tanpa kirim otomatis). |
| I-6 | P0 | Catatan sesi: dilatih, fokus berikutnya, RPE, catatan pribadi (admin saja). Fokus berikutnya tampil di briefing sesi berikutnya. |
| I-7 | P0 | Pesan pasca-sesi lewat template dan tombol WA setelah "Selesai". |
| I-8 | P0 | Penilaian cepat 1–5 bintang + satu kalimat setelah sesi selesai (portal). |
| I-9 | P0 | Evaluasi paket (5 aspek + komentar) saat sisa sesi 0, dengan tombol perpanjang. |
| I-10 | P1 | Tombol "Tambah ke kalender" (Google Kalender dan `.ics`). |
| I-11 | P1 | Saklar `FEEDBACK_ENABLED` untuk penilaian dan evaluasi (bawaan hidup, pengecualian sadar dari aturan 5). |

## 4. Privasi

Catatan pribadi, RPE, dan komentar penilaian tidak pernah masuk Telegram, email, cache admin, atau respons publik. Telegram hanya memuat nama depan dan jumlah bintang. Klien hanya melihat "dilatih" dan "fokus berikutnya" miliknya.
