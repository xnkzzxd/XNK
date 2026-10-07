# Design — Phase J

Rujukan kode: `apps-script/pt-scheduler/src/`.

## 1. Navigasi (J1)

- `NAV.public` (sidebar) = Beranda, Jadwal, Progres, Program, Info & Tips, Paket, Coach. `PUBLIC_TABS` (bar bawah HP) = Beranda, Jadwal, Progres, Lainnya, dengan tombol + di tengah. Tab Lainnya membawa `data-group` (`MORE_GROUP`) sehingga ikut menyala di Program, Info, Paket, dan Coach.
- View: `public-progress`, `public-program`, `public-info`, `public-more` (`Index.html`, `VIEWS`, `TITLES`, `renderView`). Halaman ini butuh login (seperti Beranda).
- Kartu yang pindah: pencapaian, progres, dan hasil tes → Progres (`pub-badges-wrap`, `pub-progress-wrap`, `pub-tests-wrap`); PR dan makan → Program (`pub-tasks-wrap`, `pub-meal-slot`); insight konsistensi dan riwayat latihan → Progres. Kartu form kesehatan tetap di Beranda (`pub-care-wrap`).
- Beranda tetap memanggil `loadMyProgress` supaya perayaan badge baru muncul di sana; kartunya sendiri hanya dirender di Progres. Kartu teaser `pub-teasers` menampilkan jumlah PR dan tantangan bulan ini.
- `getMyProgress.challenge = { target, done, month }` dihitung server (`_monthlyChallenge_`): sesi selesai pada bulan WIB ini; target dari Script Property `MONTHLY_CHALLENGE_SESSIONS` (bawaan 8, batas 1–31). Tidak ada data baru.

## 2. Program (J2)

Lihat bagian J2 di [TODO.md](TODO.md); dirancang saat dibangun.

## 3. Info & Tips (J3)

Lihat bagian J3 di [TODO.md](TODO.md); dirancang saat dibangun.
