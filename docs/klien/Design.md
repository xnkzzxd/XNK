# Design — Fase Q: tampilan Klien + tafsir data

Kode: `apps-script/pt-scheduler/src/` (`Theme.html`, `App.html`, `Wawasan.gs`, bagian di `Kode.gs`).

## 1. Aturan visual

- Hitam-putih. Satu-satunya warna adalah `--danger` / `--danger-soft` (terang `#c4261b`, gelap `#ff6b5e`), hanya untuk Habis, PR telat, dan tanda perhatian. Kontras AA dijaga `tests/theme.test.js`.
- **Kartu hitam** (`insightHeroHtml(cfg)`, kelas `.card-ink.insight-hero`) membuka tiap tab: eyebrow, 2–4 angka, kalimat kesimpulan, opsional sparkline, segmen rentang `4 mgg · 3 bln · Semua` (`insRange`, ganti di browser tanpa panggilan baru) dan tombol. Data sedikit: `cfg.empty` + tombol ajakan.
- Status klien satu sumber: `clientStateInfo(m)` → `aktif` (pill garis), `hampir` (pill hitam), `habis` (titik merah). Tanda perhatian: `.flag` (titik merah).
- Komponen: `pageHead`/`pageIntro` (judul kecil disembunyikan di HP karena top bar sudah memuat judulnya), `errorState`, `.icon-chip`, `.stat-strip`, `details.fold`, `sparkHtml`, `heatHtml`.
- Meter: `.meter.low` (arsir) dan `.meter.empty` (merah). Animasi hanya transisi lebar meter dan ring; `prefers-reduced-motion` mematikannya.

## 2. Mesin tafsir (`Wawasan.gs`)

Semua fungsi `_ins*_` murni dan menghitung tiga rentang sekaligus (`w4` = 28 hari, `m3` = 90, `all`). `audience` `client` atau `coach`.

| Fungsi | Isi | Ambang |
| --- | --- | --- |
| `_insightBody_` | Δ tiap ukuran, laju kg/minggu, BMI, WHtR, lemak tubuh, kesesuaian dengan tujuan | butuh ≥ 2 catatan berat; laju butuh jarak ≥ 7 hari. Tujuan `turun` sesuai bila Δ < −0,2 kg; `naik` bila > +0,2; `jaga` bila \|Δ\| ≤ 1 |
| `_insightFitness_` | % tes pertama → terakhir (arah mengikuti `better`), simetri lengan/paha | simetri ditandai bila selisih > 1,5 cm atau > 5 % |
| `_insightLinks_` | rata-rata Δ berat per minggu: minggu rutin (≥ 2 aktivitas) vs jarang; kalori ≤ vs > target | ≥ 6 minggu ber-Δ berat dan ≥ 2 minggu di tiap kelompok. Kalimat selalu "berkaitan dengan" |
| `_insightTraining_` | minggu ini vs rata-rata 4 minggu (hari, set kerja, volume, durasi), kekuatan (e1RM awal→kini, ×berat badan), mandek, keseimbangan dorong/tarik/kaki/inti/lengan | mandek: ≥ 3 catatan dalam 21 hari tanpa melampaui e1RM terbaik sebelumnya. Otot terlewat: tidak dilatih 14 hari |
| `_insightActivity_` | 84 hari (Senin pertama) level 0–4 dari sesi coach + latihan mandiri + catat makan, kepatuhan hari program per minggu | |
| `_portalWeek_` | sesi selesai/terjadwal, hari latihan, hari makan, kalori hari ini vs target, streak, tantangan | minggu WIB Senin–Minggu |
| `_clientSignalsCalc_` | `lastDone`, sesi 4 minggu, Δ berat 7–45 hari, `flags`, total untuk kartu hitam halaman Klien | `inaktif` ≥ `CLIENT_INACTIVE_DAYS` (bawaan 14, batas 3–90); `hampir` ≤ 2 sesi tanpa sesi terjadwal; `rating-rendah` ≤ 3 dalam 14 hari |

Nada: klien mendapat kalimat menyemangati + satu saran; coach mendapat angka faktual, kategori mentah BMI/WHtR, RPE rata-rata, dan rasa latihan. Klien hanya melihat label lembut ("dalam rentang sehat", "sedikit di atas…", "di atas…").

## 3. Pengiriman data

- Portal: `getPortalMore` memuat `week` dan `insight` (hanya versi klien). `insight` dihitung dari part yang sudah ada (`_insightFor_(row, audience, pre)`), jadi tidak ada bacaan sheet berlebih (tes anggaran `portal-more.test.js`). Keduanya ikut salinan perangkat `xnk_portal_cache` seperti `progress` dan `workout` (data milik klien sendiri).
- Panel: `getClientBundle.insight` (versi coach) disimpan di memori (`window.clientInsight`); `getAdminMore.signals` di `window.clientSignals`. Keduanya **tidak** masuk `xnk_admin_cache` dan dihapus saat keluar.

## 4. Panel Klien

- Halaman Klien: kartu hitam ringkasan (klien, sesi minggu ini, aktif 14 hari, perlu perhatian), `.stat-strip` filter (Aktif, Hampir habis, Habis, Perlu perhatian), cari, urutkan (Terbaru bawaan, Perlu perhatian, Nama, Sisa sesi, Lama tidak latihan; `xnk_client_sort`), sakelar Kartu/Daftar di PC (`xnk_client_view`).
- Kartu: status, sisa + meter, tanda perhatian, sesi berikutnya (juga HP), batang 4 minggu + perubahan berat.
- Detail klien: 4 tab. `Ringkasan` (Sorotan, data, PR, jadwal, Riwayat, Pengingat WA dilipat), `Progres` (rapor + tafsir, catatan progres, perawatan), `Latihan` (minggu ini + tafsir, program), `Gizi`. Nama tab lama dipetakan: `program`→`latihan`, `perawatan`→`progres`, `riwayat`→`ringkasan`.

## 5. Redesign desktop (2026-10, masukan owner)

- Kartu hitam **ramping** (`insightHeroHtml({slim:true})`, satu baris judul+kalimat | angka | tombol) untuk Ringkasan klien, Jadwal, Info, Paket, Lainnya, Tim coach. Kartu Coach ringkas (`.coach-hero.compact`, angka di dalam kartu).
- Portal: judul tab ada di top bar (`html.portal` membuat `.topbar-title` selalu tampil dan menyembunyikan judul di isi halaman). Progres dibagi sub-tab `Ringkasan · Ukuran · Tes · Riwayat` (`pgSeg`, `setPgSeg`); panduan klien baru menunjuk `#ph-progress`, `#pg-seg`, tombol Catat. Makan dibuka kartu hitam (cincin kalori, sisa, makro), menu per waktu makan (`.meal-blk`), "Tubuhmu" sebagai tile, aturan makan dilipat.
- Panel: Ringkasan klien dua kolom, kanan berisi lipatan (`foldHtml`) PR, Jadwal mendatang, Riwayat, Pengingat WA. Progres berurutan: rapor → tile (`mtileHtml`) → grafik → lipatan (riwayat catatan, badge, lingkar & simetri, catatan privat, form kesehatan, asesmen, tes, penilaian). Gizi: tile dasar dan kebutuhan harian, grafik kalori 7 hari (`kcalBarsHtml`), input coach di kanan. Kalender aktivitas ukuran tetap (13 px per hari).
