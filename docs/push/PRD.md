# Phase Z — Notifikasi Web Push (PRD)

**Permintaan pemilik (2026-11-15):** notifikasi native di HP dan komputer untuk **coach dan klien**, lewat Chrome, tanpa WhatsApp dan tanpa Telegram, dikirim dari GitHub.

## Yang dikirim

| Penerima | Jenis | Kapan | Isi (singkat, nama depan saja) |
| --- | --- | --- | --- |
| Klien | `sesi-besok` | **H-1, 19:00 WIB** | "Kak Ani, besok jam 07:00 bersama Coach Rizky." |
| Klien | `sesi-hari-ini` | **Pagi hari H, 06:00 WIB**, hanya bila sesi belum lewat | "Kak Ani, hari ini jam 07:00." |
| Klien | `pr` | jam pengingat PR WhatsApp (bawaan 08:00) | "Kak Ani, PR kamu: 1 terlambat, 2 hari ini." |
| Klien | `makan-pagi`, `makan-sore` | jam pengingat makan (bawaan 06:00 / 16:00; Ramadan 03:00 / 17:00) | "Kak Ani, waktunya makan pagi. Catat makananmu di Latihan → Makan." |
| Coach | `sesi-besok`, `sesi-hari-ini` | sama seperti klien, satu ringkasan | "3 klien: Ani 06:00, Budi 07:00 (+1)" |
| Coach | `perpanjangan` | **seketika** saat klien menekan minta perpanjang | "Ani minta perpanjang: Regular 8." |

**Sesi hanya dua kali: H-1 dan pagi hari H** (keputusan pemilik). Tidak ada pengingat "1 jam lagi".

## Keputusan

| # | Keputusan |
| --- | --- |
| X1 | **Web Push** (Chrome / Edge / Firefox di Android dan komputer; Safari iPhone hanya dari Layar Utama, iOS 16.4+). FCM/APNs native menunggu Phase V. |
| X2 | **Pengirim = GitHub Actions** (`.github/workflows/push.yml`, `tools/push-send.js`). Apps Script tidak punya ECDSA P-256 (VAPID) dan tidak bisa mengenkripsi isi push. |
| X3 | **Mati sampai dipasang.** Kartu notifikasi baru muncul bila server punya `PUSH_VAPID_PUBLIC` + `PUSH_RELAY_SECRET` (aturan 5; diisi lewat file konfigurasi Drive, satu secret di GitHub). Pengguna harus menyalakan sendiri per perangkat (izin browser). |
| X4 | Tidak mengganti Telegram atau tombol WhatsApp; semuanya tetap jalan. Pengingat WhatsApp yang dimatikan klien (MemberData kolom P) juga mematikan push jenis itu. |
| X5 | Isi push pendek, **nama depan saja**, tanpa nomor, tanpa data tubuh, kalori, atau catatan. Lewat layanan push browser (terenkripsi ujung ke ujung). |
| X6 | Klien dan coach memilih jenis per perangkat: klien Sesi / PR / Makan, coach Sesi / Perpanjangan. |
| X7 | Keluar dari akun melepas perangkat dari akun itu (langganan dihapus). |
| X8 | Pesan yang belum terkirim setelah 6 jam dibuang (sudah basi). Maksimal 4 percobaan. |

## Di luar cakupan
- Tombol di dalam notifikasi, badge angka, suara khusus.
- Notifikasi saat aplikasi dibuka di iframe pembungkus lama (`/legacy/`, Apps Script `doGet`): hanya halaman statis (`/`, portal klien) yang punya service worker.
- iPhone di Safari biasa (tanpa Layar Utama): Apple tidak mengizinkan.

## Batas yang diketahui
- Jadwal GitHub (`cron`) paling cepat 5 menit dan sering telat 5–20 menit; pesan sesi dan makan tidak terlalu peka. Perpanjangan seketika bila `PUSH_GH_TOKEN` dipasang (lihat [Setup.md](Setup.md)).
- GitHub menonaktifkan workflow terjadwal setelah 60 hari tanpa aktivitas repo; commit apa pun mengaktifkannya lagi.
