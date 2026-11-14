# TODO — Fase Y (T-2000+)

- [x] T-2000 Mockup desktop (11 layar) + komentar pemilik diterapkan (kontras kalender, tanpa ruang kosong besar)
- [x] T-2001 Dok: PRD, Design, TODO, baris Fase Y di CLAUDE.md
- [x] T-2002 Bingkai: `html.desk`, sidebar, bilah judul + tombol per halaman, kepadatan, sheet → jendela terang
- [x] T-2003 Menu ＋, popover lonceng, menu klik kanan, hover
- [x] T-2004 Panel kanan untuk sesi, rutinitas, makanan, momen
- [x] T-2005 Tata letak enam halaman (Hari ini, Latihan, Makan, Progres, Saya, Jadwal) tanpa ruang kosong besar, kalender kontras
- [x] T-2006 Jendela booking dua panel; kepala pencatat latihan
- [x] T-2007 Cek (desktop, tablet, HP tidak berubah), demo, dok, tangkapan layar

## Lanjutan: halaman tingkat dua (pemilik: "Rapikan desktop dulu")

- [x] T-2008 Progres: kartu perjalanan jadi strip ringkas (judul kiri, tiga angka kanan), segmented control rapat
- [x] T-2009 Paket saya (paket aktif + paket lain sebagai kisi kecil di kiri, sesi terakhir di kanan; ubin Jadwal/Coach disembunyikan karena ada di sidebar) dan Coach (dua kolom: slot kosong 9 jam | Tentang, lalu Mendatang | Selesai)
- [x] T-2010 Info & Tips: kisi tiga kolom saat lebar, pengantar halaman disembunyikan (subjudul ada di bilah judul). Kartu saya sudah berkisi, tidak diubah
- [x] T-2011 Rencana makan: menu hari ini lebar di kiri; target, angka tubuh (2×2), aturan di kanan. Pencatat latihan sudah berkolom (T-2006), tidak diubah
- [x] T-2012 Cek browser per halaman (posisi kolom, blok `.desk-x` tersembunyi di HP), pembanding piksel HP 0 beda, demo, dok

Catatan: blok khusus desktop memakai kelas `.desk-x` (selalu `display:none`, tampil hanya di `html.desk`), jadi DOM HP boleh membawanya tanpa mengubah tampilan.
