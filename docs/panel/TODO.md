# TODO — Fase S (T-1300+): audit UI/UX panel admin

Baca [PRD.md](PRD.md) dulu. **Satu task = satu session.** Ambil task terendah yang belum `[x]` dan dependensinya selesai, tandai `[~]`.
Setiap task: kerjakan di cabang sendiri (jangan `main`); ubah hanya `Index.html`, `App.html`, `Theme.html` dan `tools/browser-check.js` (+ docs); jalankan tiga cek Agent.md §5; ambil tangkapan layar sebelum/sesudah di 390 px dan 1440 px, terang dan gelap (`SHOTS_DIR`); centang di sini di commit yang sama. Jika desain salah, perbaiki PRD.md dan sebut di commit.

Perintah cek:
```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js
NODE_PATH=$(npm root -g) SHOTS_DIR=/tmp/s node apps-script/pt-scheduler/tools/browser-check.js
```

## S0 — Dasar (dulu, kecil, jelas)
- [ ] **T-1300** Sejajarkan `.detail-head` dengan `#topbar` (band hitam, tinggi sama) di panel klien dan coach, desktop dan HP. Cek `header lined up with the top bar` jadi hijau. Dep: —. (P1)
- [ ] **T-1301** Tangani `pull down: ends with a check mark`: reproduksi, tentukan bug app atau waktu tunggu tes, perbaiki yang benar, jelaskan di commit. Dep: —. (P15)
- [ ] **T-1302** Verifikasi Pengaturan HP (daftar dan sub-halaman) di 360/390/430 px: bukan tangkapan di tengah transisi; bila overflow/geser, perbaiki; tambah cek `elOverflow` dan posisi band. Dep: —. (P6)
- [ ] **T-1303** Padding bawah semua view HP = `var(--tabbar-space)` + bayangan/gradasi tipis di atas bar tab; tidak ada baris atau tombol terpotong separuh di scroll akhir. Cek di Dashboard, Jadwal, Klien, Coach, Keuangan. Dep: —. (P5)

## S1 — Kontras dan hirarki
- [ ] **T-1310** Mode gelap: kartu "Sesi berikutnya" dan kartu hero lain memakai permukaan lebih terang dari latar; label, badge, tombol "Ingatkan/Detail" ≥ 4.5:1. Tes browser mengukur kontras (terang dan gelap). Dep: —. (P2)
- [ ] **T-1311** Baris sesi (Dashboard, Jadwal, hub coach): "Selesai" solid sebagai aksi utama, "Ubah" dan "WA" sekunder (ikon + teks pendek, target 44 px), tombol rata kanan di desktop; kontras OK di kartu hitam dan gelap. Satu komponen `.sess-actions` bersama. Dep: T-1310. (P8, P14)

## S2 — Halaman Klien
- [ ] **T-1320** Rampingkan layar atas Klien: hapus 4 tile (`.client-top`), ringkasan hitam satu baris di HP (angka + "Lihat siapa"), cari + sortir + Kartu/Daftar satu baris; klien pertama terlihat di 390×844. Perbarui cek browser yang menyebut `.client-top`. Dep: T-1303. (P3)
- [ ] **T-1321** Label dasar pengelompokan klien ("Bergabung · Januari 2026", "Sisa sesi · Habis", dll.) mengikuti urutan terpilih; sembunyikan pembagi bila hanya satu grup. Dep: T-1320. (P4)
- [ ] **T-1322** Profil klien HP: hero lebih pendek (cincin sisa sesi dan tombol satu baris), tab hitam lebih rendah; "Sorotan" muncul dalam layar pertama. Dep: T-1300. (P12)

## S3 — Dashboard dan Jadwal
- [ ] **T-1330** Dashboard HP: agenda "Hari ini" naik tepat di bawah salam; tile jadi satu baris yang bisa digeser (snap, tanpa scroll sideways pada halaman). Dep: T-1311. (P7)
- [ ] **T-1331** Dashboard: hero "Sesi berikutnya" tidak menggandakan agenda (bila sama dengan sesi pertama agenda yang belum selesai, jadikan sorotan di baris itu); empty state "Perlu perhatian" jadi satu baris. Dep: T-1330. (P7, P9)
- [ ] **T-1332** Jadwal HP: kalender bulan bisa dilipat ke strip minggu (bawaan strip, ketuk judul untuk bulan penuh); sesi hari terpilih terlihat di layar pertama. Desktop: kalender + daftar mengisi tinggi, tanpa ruang kosong besar. Dep: T-1311. (P11)

## S4 — Coach dan Keuangan
- [ ] **T-1340** Hub coach: "Perlu perhatian" diringkas jadi satu baris per jenis ("3 klien belum punya assessment" + satu tombol), hapus tombol "Nanti" per baris dari tampilan awal (daftar bisa dibuka); tab "Klien | Coach" diganti nama yang tidak bentrok dengan sidebar ("Hari ini | Profil"). Dep: T-1300. (P9, P13)
- [ ] **T-1341** Keuangan: tile memakai angka ringkas ("2,3 jt", penuh di detail/aria-label), tidak turun baris di 360 px; grafik 6 bulan menyembunyikan bulan tanpa data atau tampil "Belum ada data". Dep: T-1303. (P10)

## S5 — Konsistensi dan penutup
- [ ] **T-1350** Titik tanpa label (sidebar, tab bar, "Booking baru") jadi angka atau teks berlabel + `aria-label`; ikon dekoratif di tile KPI dihapus atau dikecilkan agar angka punya ruang. Dep: T-1330. (P13)
- [ ] **T-1351** Kurangi kartu hitam yang bersaing: tentukan tingkat (band > hero tunggal per layar > permukaan netral); kalender Jadwal dan tile KPI memakai permukaan netral. Dep: T-1310…T-1332. (P14)
- [ ] **T-1352** Tes: tambah ke `browser-check.js` cek per layar admin di 360/390/430 dan 1280/1440 (terang + gelap): tanpa overflow horizontal, klien/sesi pertama di layar pertama, kontras hero. Dep: semua S1–S4.
- [ ] **T-1353** Dokumen: ringkas hasil di Agent.md §7 (Fase S), jalankan ulang audit tangkapan layar, centang PRD §5. Dep: T-1352.

## Urutan yang disarankan
T-1300 → T-1301 → T-1302 → T-1303 → T-1310 → T-1311 → T-1320 → T-1321 → T-1330 → T-1331 → T-1322 → T-1332 → T-1340 → T-1341 → T-1350 → T-1351 → T-1352 → T-1353.
T-1300…T-1303 saling lepas dan bisa paralel di session berbeda; jangan jalankan dua task yang menyentuh area yang sama bersamaan (T-1311/T-1330/T-1331 sama-sama Dashboard).
