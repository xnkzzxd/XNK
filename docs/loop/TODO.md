# Tasks — Phase I (putaran coach ↔ klien)

Status: `[ ]` todo · `[~]` berjalan · `[x]` selesai. ID mulai T-600.

## I1 — Ukuran badan, timer, hasil dan tren tes

| | ID | Task | Selesai bila |
| --- | --- | --- | --- |
| [x] | T-600 | Kolom ukuran badan di Progress, `PROGRESS_MEASURES`, simpan oleh klien dan coach | Tes progress lolos, sheet lama diperluas di tempat |
| [x] | T-601 | Asesmen menyimpan 8 ukuran; lemak tubuh dan pinggul tetap | Tes care lolos |
| [x] | T-602 | Timer 1 menit dan stopwatch plank di sheet tes | Browser check lolos di HP |
| [x] | T-603 | Tren tes (grafik) dan kartu "Hasil tes" di portal | Browser check |
| [x] | T-604 | `getTestResultMessage` dan tombol "Kirim hasil via WA" | Tes care lolos |

## I2 — Catatan sesi dan pesan pasca-sesi

| | ID | Task | Selesai bila |
| --- | --- | --- | --- |
| [x] | T-610 | Sheet `SessionNotes`, `saveSessionNote`, `getSessionNote`, `lastNote` di briefing | Tes lolos |
| [x] | T-611 | Sheet "Catatan sesi" setelah Selesai dan template `pasca-sesi` | Browser check |
| [x] | T-612 | "Fokus berikutnya" dan "Dilatih" di portal | Tes whitelist lolos |

## I3 — Penilaian cepat dan evaluasi paket

| | ID | Task | Selesai bila |
| --- | --- | --- | --- |
| [x] | T-620 | `SessionRatings`, `rateSession`, `pendingRating` di bootstrap | Tes lolos |
| [x] | T-621 | `PackageEvaluations`, `getMyPackageEval`, `submitMyPackageEval` | Tes lolos |
| [x] | T-622 | Telegram paket selesai, rating rendah, kartu penilaian di hub, saklar `FEEDBACK_ENABLED` | Tes lolos |

## I4 — Tambah ke kalender

| | ID | Task | Selesai bila |
| --- | --- | --- | --- |
| [x] | T-630 | `icsFor` dan tombol "Tambah ke kalender" | Browser check |
