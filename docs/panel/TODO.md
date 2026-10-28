# TODO — Fase S (S1–S18): audit UI/UX panel admin

Baca [PRD.md](PRD.md) dulu. **Satu task = satu session.** Ambil task terendah yang belum `[x]` dan dependensinya selesai, tandai `[~]`.
Setiap task: kerjakan di cabang sendiri (jangan `main`); ubah hanya `Index.html`, `App.html`, `Theme.html` dan `tools/browser-check.js` (+ docs); jalankan tiga cek Agent.md §5; ambil tangkapan layar sebelum/sesudah di 390 px dan 1440 px, terang dan gelap (`SHOTS_DIR`); centang di sini di commit yang sama. Jika desain salah, perbaiki PRD.md dan sebut di commit.

Perintah cek:
```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js
NODE_PATH=$(npm root -g) SHOTS_DIR=/tmp/s node apps-script/pt-scheduler/tools/browser-check.js
```

## A — Dasar (dulu, kecil, jelas)
- [x] **S1** Sejajarkan `.detail-head` dengan `#topbar` (band hitam, tinggi sama) di panel klien dan coach, desktop dan HP. Cek `header lined up with the top bar` jadi hijau. Dep: —. (P1)
- [x] **S2** Tangani `pull down: ends with a check mark`: reproduksi, tentukan bug app atau waktu tunggu tes, perbaiki yang benar, jelaskan di commit. Dep: —. (P15)
- [x] **S3** Verifikasi Pengaturan HP (daftar dan sub-halaman) di 360/390/430 px: bukan tangkapan di tengah transisi; bila overflow/geser, perbaiki; tambah cek `elOverflow` dan posisi band. Dep: —. (P6)
  - Hasil: P6 nyata, bukan transisi. `#app` (`overflow:hidden`) tergulir 330 px ke kanan (fokus/`scrollIntoView` ke panel di luar layar), jadi band dan kartu tampak bergeser. Perbaikan: `overflow: clip` pada `.app`. Cek baru di `browser-check.js`: `scrollLeft` app = 0, top bar di x=0, band tepat di bawah top bar, tak ada elemen melebihi layar (360/390/430 dan tiap sub-halaman; chip kategori Paket boleh menggulir di barisnya sendiri).
- [x] **S4** Padding bawah semua view HP = `var(--tabbar-space)` + bayangan/gradasi tipis di atas bar tab; tidak ada baris atau tombol terpotong separuh di scroll akhir. Cek di Dashboard, Jadwal, Klien, Coach, Keuangan. Dep: —. (P5)

## B — Kontras dan hirarki
- [x] **S5** Mode gelap: kartu "Sesi berikutnya" dan kartu hero lain memakai permukaan lebih terang dari latar; label, badge, tombol "Ingatkan/Detail" ≥ 4.5:1. Tes browser mengukur kontras (terang dan gelap). Dep: —. (P2)
  - Hasil: penyebab: `.card-ink` dipaksa ke `--band-card` tetapi tombol/label di dalamnya masih memakai `--on-ink` (gelap di mode gelap), jadi "Ingatkan" dan badge hilang. Perbaikan: `.card-ink`, `.insight-hero`, `.kpi.ink` memetakan ulang `--ink/--on-ink/--on-ink-muted` ke token band; `--band-card` gelap jadi `#2a2a2a` (lebih terang dari latar). Cek baru: kartu "Sesi berikutnya" lebih terang dari halaman (gelap) dan semua teks/tombol ≥ 4.5:1 (terang dan gelap). Dua cek gagal yang tersisa (pull down, header lined up) milik S2 dan S1.
- [x] **S6** Baris sesi (Dashboard, Jadwal, hub coach): "Selesai" solid sebagai aksi utama, "Ubah" dan "WA" sekunder (ikon + teks pendek, target 44 px), tombol rata kanan di desktop; kontras OK di kartu hitam dan gelap. Satu komponen `.sess-actions` bersama. Dep: S5. (P8, P14)
  - Hasil: komponen bersama `sessActions()` / `.sess-actions` (App.html, Theme.html) dipakai Dashboard, Jadwal dan hub coach: "Selesai" solid (`btn-primary`, selalu pertama), "Ubah" dan "WA" outline ikon + teks pendek, tinggi 44 px, rata kanan ≥ 768 px. Hub coach kini juga berteks "Selesai" (sebelumnya ikon centang saja). Cek baru di `browser-check.js`: Selesai solid pertama, semua tombol ≥ 44 px, kontras ≥ 4.5:1, rata kanan di desktop (terang dan gelap).

## C — Halaman Klien
- [x] **S7** Rampingkan layar atas Klien: hapus 4 tile (`.client-top`), ringkasan hitam satu baris di HP (angka + "Lihat siapa"), cari + sortir + Kartu/Daftar satu baris; klien pertama terlihat di 390×844. Perbarui cek browser yang menyebut `.client-top`. Dep: S4. (P3)
- [x] **S8** Label dasar pengelompokan klien ("Bergabung · Januari 2026", "Sisa sesi · Habis", dll.) mengikuti urutan terpilih; sembunyikan pembagi bila hanya satu grup. Dep: S7. (P4)
  - Hasil: `groupOf` di `renderClientList`: 'Aktif terakhir · bulan' (Terbaru), 'Sisa sesi · Habis / 1–2 lagi / 3 atau lebih', 'Perlu perhatian / Aman'; satu grup = tanpa pembagi.
- [x] **S9** Profil klien HP: hero lebih pendek (cincin sisa sesi dan tombol satu baris), tab hitam lebih rendah; "Sorotan" muncul dalam layar pertama. Dep: S1. (P12)
  - Hasil: HP: hero grid (identitas + cincin 72 px, aksi di bawah), tab 44 px tanpa ikon; 'Sorotan' muncul di layar pertama (dicek di tes).

## D — Dashboard dan Jadwal
- [x] **S10** Dashboard HP: agenda "Hari ini" naik tepat di bawah salam; tile jadi satu baris yang bisa digeser (snap, tanpa scroll sideways pada halaman). Dep: S6. (P7)
  - Hasil: Agenda `#dash-agenda` order -1 di HP, KPI satu baris geser (`.dash-kpis`), pembaruan tes S17.
- [x] **S11** Dashboard: hero "Sesi berikutnya" tidak menggandakan agenda (bila sama dengan sesi pertama agenda yang belum selesai, jadikan sorotan di baris itu); empty state "Perlu perhatian" jadi satu baris. Dep: S10. (P7, P9)
  - Hasil: `nextInAgenda`: hero tidak digandakan; baris agenda yang disorot memuat hitung mundur; `emptyLine()` untuk kartu kecil.
- [x] **S12** Jadwal HP: kalender bulan bisa dilipat ke strip minggu (bawaan strip, ketuk judul untuk bulan penuh); sesi hari terpilih terlihat di layar pertama. Desktop: kalender + daftar mengisi tinggi, tanpa ruang kosong besar. Dep: S6. (P11)
  - Hasil: HP admin: strip minggu (`ui.calStrip`, tombol Bulan/Minggu, `shiftWeek`); desktop: kalender setinggi layar, sel 52 px.

## E — Coach dan Keuangan
- [x] **S13** Hub coach: "Perlu perhatian" diringkas jadi satu baris per jenis ("3 klien belum punya assessment" + satu tombol), hapus tombol "Nanti" per baris dari tampilan awal (daftar bisa dibuka); tab "Klien | Coach" diganti nama yang tidak bentrok dengan sidebar ("Hari ini | Profil"). Dep: S1. (P9, P13)
  - Hasil: `careListHtml` per alasan (`details.care-group`), tab Hari ini | Profil.
- [x] **S14** Keuangan: tile memakai angka ringkas ("2,3 jt", penuh di detail/aria-label), tidak turun baris di 360 px; grafik 6 bulan menyembunyikan bulan tanpa data atau tampil "Belum ada data". Dep: S4. (P10)
  - Hasil: `finRpShort`, `title`/`aria-label` angka penuh, grafik menyembunyikan bulan kosong atau 'belum ada data'.

## F — Konsistensi dan penutup
- [x] **S15** Titik tanpa label (sidebar, tab bar, "Booking baru") jadi angka atau teks berlabel + `aria-label`; ikon dekoratif di tile KPI dihapus atau dikecilkan agar angka punya ruang. Dep: S10. (P13)
  - Hasil: Tab Jadwal memakai badge berangka + aria-label, 'Booking baru' memakai pill 'Baru', ikon KPI disembunyikan di HP dan dikecilkan di desktop.
- [x] **S16** Kurangi kartu hitam yang bersaing: tentukan tingkat (band > hero tunggal per layar > permukaan netral); kalender Jadwal dan tile KPI memakai permukaan netral. Dep: S5…S12. (P14)
  - Hasil: Tingkat: band > satu hero > permukaan netral; `.month-cal.neutral` dan tile pendapatan netral.
- [x] **S17** Tes: tambah ke `browser-check.js` cek per layar admin di 360/390/430 dan 1280/1440 (terang + gelap): tanpa overflow horizontal, klien/sesi pertama di layar pertama, kontras hero. Dep: semua S1–S4.
  - Hasil: Blok S17 di `browser-check.js`: 5 lebar x terang/gelap, tanpa scroll samping, elemen pertama di layar pertama, target sentuh, tanpa error JS. Cek lama (Klien, lipatan coach, Makan, ganti menu) mengikuti markup baru; run penuh tidak lagi berhenti di tengah.
- [x] **S18** Dokumen: ringkas hasil di Agent.md §7 (Fase S), jalankan ulang audit tangkapan layar, centang PRD §5. Dep: S17.
  - Hasil: Agent.md §7 (Fase S) ditulis; PRD §5 dicentang.

## Urutan yang disarankan
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S10 → S11 → S9 → S12 → S13 → S14 → S15 → S16 → S17 → S18.
S1…S4 saling lepas dan bisa paralel di session berbeda; jangan jalankan dua task yang menyentuh area yang sama bersamaan (S6/S10/S11 sama-sama Dashboard).
