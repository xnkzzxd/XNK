# Fase U — Program latihan otomatis: TODO (T-1600+)

Rencana lengkap: [PRD.md](PRD.md). Urutan rilis (keputusan owner): **Rilis 1** nama + otot, **Rilis 2** katalog + generator, **Rilis 3** animasi.

## Rilis 1 — nama gerakan ala Hevy + otot
- [ ] T-1600 Docs: Design.md, Rules.md (aturan §1 PRD dengan PMID [A]–[Q], angka pasti volume/kehadiran/level, baris ⚠ tetap konservatif), Alias.md (nama manual dari WorkoutLog → gerakan + otot), Otot.md (otot utama/pendukung per gerakan dari jurnal EMG/anatomi).
- [x] T-1601 Nama gerakan ala Hevy: `tools/exercise-names.js` (aturan) + `exercise-names-override.json` (±60 gerakan umum), library v2 (`n` = nama tampilan, `r` = nama mentah untuk pencarian), `build-exercises.js` memakai aturan yang sama, tampilan lewat `exNm` (baris lama dengan Exercise ID tampil nama baru, sheet tidak diubah), cache perangkat `xnk_ex_lib_v2`. Test `tests/exercise-names.test.js`. Field `m` (otot pendukung) pindah ke T-1603 (butuh sumber otot per gerakan).
- [ ] T-1603 Alias otot gerakan manual: `_exGuessMuscles_`, sheet `ExerciseAlias`, dipakai saat baca statistik, gabung riwayat otomatis hanya untuk kecocokan pasti, layar konfirmasi di Pengaturan, seed dari data asli.
- [ ] T-1610 Peta otot diam buatan sendiri (sumber berlisensi terbuka + `figure/CREDITS.md`), 16 otot, utama/pendukung, pria/wanita, ganti `wlMuscleSvg`, kartu bagikan, offline.

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
