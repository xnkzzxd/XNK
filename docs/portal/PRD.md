# PRD — Phase J: tab baru untuk klien

| | |
| --- | --- |
| Status | Disetujui 2026-10-07, dibangun bertahap J1 → J4 |
| Terkait | [Design.md](Design.md) · [TODO.md](TODO.md) · [../Agent.md](../Agent.md) · [../loop/PRD.md](../loop/PRD.md) |

## 1. Latar belakang

Portal klien hanya punya empat tab (Beranda, Jadwal, Paket, Coach) dan semua fitur lain menumpuk di Beranda. Klien sulit menemukan progres, PR, atau info, dan tidak punya alasan kuat membuka aplikasi tiap hari.

## 2. Tujuan

- **J-1** Tab **Progres**: streak, badge, tantangan bulanan, ukuran badan, foto, hasil dan tren tes, riwayat latihan.
- **J-2** Tab **Program**: program latihan dari coach (gerakan, set, rep, video), PR, dan makan hari ini; klien mencentang gerakan.
- **J-3** Tab **Info & Tips**: pengumuman, tips, dan video yang ditulis pemilik lewat halaman **Konten** di panel; titik "baru".
- **J-4** Bar bawah HP: Beranda · Jadwal · [+] · Progres · Lainnya; sidebar desktop menampilkan semua tab. **Lainnya** memuat Program, Info & Tips, Paket, Coach, Tampilan, Keluar.
- **J-5** Beranda lebih ringan: kuota, perpanjang, sesi berikutnya, penilaian, form kesehatan, dan teaser ke tab baru.

Bukan tujuan: poin atau tukar hadiah (hanya badge dan tantangan), pesan dua arah di aplikasi, API WhatsApp.

## 3. Aturan

Default = perilaku hari ini untuk data lama; tab baru tampil dengan keadaan kosong yang ramah. Semua data klien dari token; konten publik tidak memuat data pribadi. Phone first (360–430 px), 44 px, terang/gelap.
