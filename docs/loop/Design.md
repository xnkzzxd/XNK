# Design — Phase I

Rujukan kode: `apps-script/pt-scheduler/src/`.

## 1. Ukuran badan (I1)

- `Progress` mendapat kolom di kanan (H–M): Lengan Kanan, Lengan Kiri, Perut, Paha Kanan, Paha Kiri, Dada (cm). Berat (D) dan Pinggang (E) tetap. Header ditambahkan oleh `_ensureProgressColumns_` (idempotent, di dalam lock `_saveMeasurement_`).
- `PROGRESS_MEASURES` (kunci, label, satuan, kolom, batas) adalah satu-satunya daftar ukuran. `_saveMeasurement_(memberId, tanggal, vals, oleh)`, `_readProgress_`, `_progressPayload_` (`summary` per ukuran, `measures`) membacanya.
- `saveMyMeasurement` (klien, 7 hari ke belakang) dan `saveMemberMeasurement` (coach) memakai `_parseMeasures_`.
- `saveAssessment` menyimpan ukuran ke Progress sebagai catatan coach; `Assessments` J (lemak) dan M (pinggul) tetap, K dan L (dada, lengan lama) tidak diisi lagi.

## 2. Timer dan tren (I1)

- Timer murni di browser (`ftOpen/ftToggle/ftReset`, `App.html`): waktu dihitung dari `Date.now()`, bunyi lewat WebAudio, getar `navigator.vibrate`, layar tetap menyala lewat `wakeLock`. Berhenti sendiri bila sheet ditutup.
- `getMyAssessment.tests[].history` (tanggal + nilai) dan `getClientCare.testHistory` memberi data grafik; `pgChartSvg` dipakai ulang.
- `getTestResultMessage` memakai template `hasil-tes` (`RMD_TPL_DEFAULT`, override lewat Script Property `RMD_TPL_HASIL_TES`).

## 3. Catatan sesi dan pesan pasca-sesi (I2)

- Sheet `SessionNotes`: `ID, Schedule ID, Member ID, Tanggal, Dilatih, Fokus Berikutnya, RPE, Catatan Pribadi, Diubah Pada`. Satu baris per sesi; menyimpan semua kolom kosong menghapus baris.
- `saveSessionNote(token, scheduleId, data)` mengambil klien dari baris jadwal. Membalas `{text, waLink}` dari template `pasca-sesi` (`{nama}`, `{dilatih}`, `{fokus}`, `{sisa}`); tidak ada yang dikirim.
- Klien: `getPortalBootstrap.schedules[]` mendapat `dilatih` dan `fokus` untuk sesi miliknya (`_sharedNotesFor_`). RPE dan catatan pribadi tidak keluar dari fungsi admin.
- Panel: setelah **Selesai** lembar catatan terbuka otomatis (`openSessionNote(id, true)`); briefing dan baris Hari ini menampilkan fokus dari sesi sebelumnya.

## 4. Penilaian dan evaluasi (I3)

- `SessionRatings` (`ID, Schedule ID, Member ID, Tanggal, Bintang, Komentar, Izin Testimoni, Dibuat Pada`): satu baris per sesi selesai milik klien; `rateSession(memberToken, scheduleId, stars, comment, consent)` mengganti penilaian lama. Klien lain yang menebak ID sesi mendapat "Sesi tidak ditemukan.".
- `PackageEvaluations` (`ID, Member ID, Paket, Tanggal, Motivasi, Keselamatan, Kepuasan, Komunikasi, Profesionalisme, Komentar, Izin Testimoni, Dibuat Pada`). Berhak mengisi bila total > 0, terpakai ≥ total, dan evaluasi terakhir lebih lama dari sesi selesai terakhir (`_packageEvalEligibleFrom_`), jadi paket baru setelah perpanjangan diminta lagi.
- Bootstrap portal: `feedbackEnabled`, `pendingRating` (sesi selesai ≤ 7 hari belum dinilai), `packageEval.eligible`. Ringkasan evaluasi baru dimuat saat lembar dibuka (`getMyPackageEval`).
- Pemilik: `completeSession` mengembalikan `packageDone`, `evalText`, `evalWaLink`; komentar hanya di `getClientCare.feedback` dan `getCoachHub().feedback`. Telegram hanya memuat nama depan dan angka.
- Saklar `FEEDBACK_ENABLED` (Pengaturan → Tampilan), bawaan hidup.

## 5. Kalender (I4)

Murni browser: `.ics` dan tautan Google Kalender dari data sesi; tanpa panggilan server.
