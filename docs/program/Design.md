# Fase U — Design

Apa: [PRD.md](PRD.md). Aturan: [Rules.md](Rules.md). Otot per gerakan: [Otot.md](Otot.md). Tugas: [TODO.md](TODO.md).

## Rilis 1 — sudah dibangun (berbeda dari rencana awal di PRD)
- **Nama gerakan (T-1601)**: pustaka v2 memakai `n` = nama tampilan ala Hevy dan `r` = nama mentah dataset (bukan field `d` seperti di PRD). Sumber: `tools/exercise-names.js` + `tools/exercise-names-override.json`. Cache perangkat `xnk_ex_lib_v2`. Tampilan lewat `exNm(o)`.
- **Otot gerakan manual (T-1603)**: tidak ada `Alias.md`; daftar nama manual diambil langsung dari WorkoutLog asli di Pengaturan → Latihan & Alat (`getManualExercises`), coach memastikan di sana (`saveExerciseAlias`, sheet `ExerciseAlias`). Gabung otomatis hanya untuk nama yang persis sama dengan pustaka (`_exNorm_`); tebakan kata kunci hanya mengisi otot. Semua saat baca (`src/LatihanAlias.gs`), sheet tidak diubah.
- **Peta otot (T-1610)**: `figure/figure.min.json` dari react-muscle-highlighter (MIT), bukan `muscles.svg` buatan tangan. Pendukung per gerakan: `MM_BY_EX` (8 gerakan gym, dari Otot.md), lainnya `MM_SECONDARY`.

## Rilis 2 — rencana
**Data** (append kolom, idempoten, di bawah lock):
- Sheet `GymExercises`: ID `gym:<slug>`, Nama, Exercise ID, Level Min, Pola, Otot Utama, Otot Pendukung, Jenis, Rep Min, Rep Max, Hindari Bila, Varian Berikut, Unilateral, Aktif, Urutan. Seed 8 gerakan pemula banget (Otot.md).
- MemberData AG–AQ: Level Latihan, Hari Latihan, Program Otomatis, Blok Mulai, Blok Ke, Pantangan Gerakan, Durasi Sesi, Tujuan Latihan, Tukar Gerakan, Form OK, Otot Fokus (dipetakan per nama header).
- ProgramItems V `Sumber` (`auto:<versi aturan>`; kosong = manual coach, tidak pernah ditimpa). WorkoutLog U `Form` (`ok|ragu`).

**Server** `src/ProgramGen.gs`: fungsi murni tanpa `SpreadsheetApp` (`_pgenSafety_`, `_pgenSplit_`, `_pgenPick_`, `_pgenDose_`, `_pgenVolume_`, `_pgenOverload_`, `_pgenStall_`, `_pgenReview_`, `_pgenProgram_`), konstanta `PGEN` per baris Rules.md; hasil divalidasi `_parseProgramDays_`. Publik member (juga di `_appApi_`): `getMyProgramProfile`, `saveMyProgramProfile`, `acceptAutoProgram`, `setMyProgramAuto`, `getMySwapOptions`, `swapMyProgramExercise`, `setMyFormCheck`. Admin: `getGymCatalog`, `saveGymExercise`, `setGymExerciseActive`, `getProgramGenPreview`, `regenerateProgram`, `setClientProgramAuto`, `setFormOk`. Job `program-otomatis` 04:00 WIB di `runReminderTick`. Bagian `programGen` di `getPortalMore` / `getClientBundle`; setiap penulis memanggil `_bumpMember_`.

**UI**: portal Latihan (kartu Program otomatis, profil 3 langkah, ⇄ tukar, Rapi/Ragu setelah set terakhir, opt-out, tawaran untuk klien lama); panel klien → Latihan (badge Otomatis · blok N, Buat ulang, Form OK, pantangan); hub (mode ringan, program baru); Pengaturan → Latihan & Alat (katalog per level, `PROGRAM_AUTO_ENABLED`, nyala bawaan).
