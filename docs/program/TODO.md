# Fase U — Program latihan otomatis: TODO (T-1600+)

Rencana lengkap: [PRD.md](PRD.md). Urutan rilis (keputusan owner): **Rilis 1** nama + otot, **Rilis 2** katalog + generator, **Rilis 3** animasi.

## Rilis 1 — nama gerakan ala Hevy + otot
- [x] T-1600 Docs: [Rules.md](Rules.md) (aturan dengan PMID/DOI [A]–[Q], daftar ⚠ yang masih harus dicek sebelum Rilis 2 dinyalakan), [Otot.md](Otot.md) (otot utama/pendukung 8 gerakan gym dari studi EMG; seated row dan chest fly masih ⚠), [Design.md](Design.md) (apa yang dibangun berbeda dari PRD + rencana Rilis 2). Peta otot logger memakai tabel Otot.md (`MM_BY_EX`).
- [x] T-1601 Nama gerakan ala Hevy: `tools/exercise-names.js` (aturan) + `exercise-names-override.json` (±60 gerakan umum), library v2 (`n` = nama tampilan, `r` = nama mentah untuk pencarian), `build-exercises.js` memakai aturan yang sama, tampilan lewat `exNm` (baris lama dengan Exercise ID tampil nama baru, sheet tidak diubah), cache perangkat `xnk_ex_lib_v2`. Test `tests/exercise-names.test.js`. Field `m` (otot pendukung) pindah ke T-1603 (butuh sumber otot per gerakan).
- [x] T-1603 Otot gerakan manual (`src/LatihanAlias.gs`, data pustaka server `src/LatihanData.gs` dari `tools/exercise-names.js`): saat baca, nama yang persis sama dengan pustaka (`_exNorm_`: huruf kecil, sinonim alat, urutan kata bebas) digabung ke Exercise ID itu (riwayat, PR, saran beban satu); alias coach di sheet `ExerciseAlias` (admin `getManualExercises`, `saveExerciseAlias`); sisanya tebakan otot `_exGuessMuscles_` yang hanya mengisi yang kosong. Sheet log/program tidak diubah; menyimpan ulang satu hari mengganti baris manual yang tergabung (tidak dobel). Pengaturan → **Latihan & Alat** menampilkan semua nama manual asli dari WorkoutLog untuk dipastikan coach (ini pengganti seed Alias.md: datanya langsung dari sheet). Test `tests/exercise-alias.test.js`.
- [x] T-1610 Peta otot diam sendiri: `figure/figure.min.json` (pria/wanita, depan/belakang, 16 otot target, ±56 KB gzip) dibangun `tools/build-figure.js` dari react-muscle-highlighter (MIT, `figure/CREDITS.md`); di App `figEnsure`/`figSync` (localStorage `xnk_fig_v1`, dimuat malas), `mmLevels` (otot utama = gelap, pendukung = terang; pendukung masih peta umum per otot sampai Otot.md), `mmFigSvg`; logger memakai figur sesuai jenis kelamin klien (profil Gizi `jk`), kartu bagikan menggambar figur yang sama di canvas. Bentuk lama tetap jadi cadangan sebelum file figur ada di perangkat. Test `tests/figure.test.js` + browser check.

## Rilis 2 — katalog gym + generator
- [ ] T-1602 Sheet `GymExercises` + seed 8 gerakan pemula banget + usulan level pemula/menengah (dicek owner), Pengaturan → Latihan & Alat, admin CRUD.
- [ ] T-1604 MemberData AG–AQ, ProgramItems V `Sumber`, WorkoutLog U `Form`, registrasi menyimpan level.
- [ ] T-1605 `src/ProgramGen.gs` fungsi murni (`_pgenSafety_`, `_pgenSplit_`, `_pgenPick_`, `_pgenDose_`, `_pgenVolume_`, `_pgenOverload_`, `_pgenStall_`, `_pgenReview_`, `_pgenProgram_`) + `tests/program-gen.test.js` (tiap aturan ≥ 1 test).
- [ ] T-1606 Fungsi publik member/admin (+ `_appApi_`, security & cache-version tests), job `program-otomatis` 04:00, bagian `programGen` di `getPortalMore` / `getClientBundle`, `tools/api-check.js`.
- [ ] T-1607 UI portal (profil 3 langkah, kartu program otomatis, tukar gerakan, Form rapi/ragu, opt-out, tawaran untuk klien lama) + panel (badge, Buat ulang, Form OK, pantangan) + hub.
- [ ] T-1608 Browser check phone 390×844 + desktop, demo seed, READMEs, Agent.md §7.

## Rilis 3 — animasi otot sendiri
- [ ] T-1611 Rig figur (samping + depan, pria/wanita), alat netral, `poses.json`, `tools/figure-check.js`; 8 pola pemula banget dulu.
- [ ] T-1612 Pola sisanya, `Gerak.md` dengan sumber sudut sendi.
- [ ] T-1613 Ganti GIF bertahap; hapus hotlink setelah semua pola selesai (keputusan owner).

## Rencana berikutnya (bukan fase ini)
- Migrasi frontend ke GitHub Pages: API admin lewat `doPost` (daftar putih, token di body, batas laju). Catatan CORS di PRD §2d.
