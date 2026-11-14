# Design — Fase Y

## Mode desktop
`html.portal.desk`, dipasang oleh `parts/app/16-desk.part` (`matchMedia('(min-width: 768px)')`, ikut berubah saat jendela diubah ukurannya). Semua gaya di `parts/theme/06-desk.part` diawali `html.desk`. HP tidak menjalankan aturan ini.

## Bingkai
- **Sidebar** (`#sidebar`): terang tembus pandang, 232 px berlabel di ≥ 1024 px, rel ikon 72 px di 768–1023 px. Grup utama (Hari ini, Latihan, Makan, Progres, Jadwal) dan grup Akun (Saya, Paket saya, Coach, Info & Tips, Kartu saya). Kaki: avatar + nama + level. Item aktif = pil warna aksen 14 %.
- **Bilah judul** (`#topbar`): 52 px, terang, garis bawah tipis; `‹` untuk halaman tingkat dua, judul + subjudul; kanan tombol bilah alat per halaman (`DESK_TOOLS`), ＋ (menu), lonceng (popover). `pxHead` dan band HP disembunyikan.
- **Kepadatan**: root 93,75 % (15 px), isian tetap 16 px; kontrol 32–36 px di `pointer: fine`, 44 px di layar sentuh; kartu sudut 12 px, garis 1 px.
- **Hover**: baris daftar disorot (`@media (hover: hover)`).

## Komponen
- `deskMenu(items, x, y)` — menu ala Mac (klik kanan dan menu ＋): Esc / klik luar menutup, panah atas/bawah + Enter memilih. Pemicu klik kanan: elemen ber-`data-ctx` (rutinitas, sesi, tugas, makanan).
- `deskPop(anchor, html)` — popover di bawah tombol bilah judul (lonceng).
- Panel kanan = `openDetail` yang sudah ada.
- Jendela tengah = sheet yang ada dengan kepala terang; booking = jendela dua panel.

## Pemeriksaan
`browser-check` bagian "Desktop ala Mac": ukuran 834×1194 (sentuh), 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1080, terang & gelap; klik kanan, popover, panel kanan, Esc, pindah ukuran HP↔desktop; HP 390 px dibandingkan piksel dengan sebelum perubahan.
