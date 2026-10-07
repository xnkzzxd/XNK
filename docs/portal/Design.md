# Design — Phase J

Rujukan kode: `apps-script/pt-scheduler/src/`.

## 1. Navigasi (J1)

- `NAV.public` (sidebar) = Beranda, Jadwal, Progres, Program, Info & Tips, Paket, Coach. `PUBLIC_TABS` (bar bawah HP) = Beranda, Jadwal, Progres, Lainnya, dengan tombol + di tengah. Tab Lainnya membawa `data-group` (`MORE_GROUP`) sehingga ikut menyala di Program, Info, Paket, dan Coach.
- View: `public-progress`, `public-program`, `public-info`, `public-more` (`Index.html`, `VIEWS`, `TITLES`, `renderView`). Halaman ini butuh login (seperti Beranda).
- Kartu yang pindah: pencapaian, progres, dan hasil tes → Progres (`pub-badges-wrap`, `pub-progress-wrap`, `pub-tests-wrap`); PR dan makan → Program (`pub-tasks-wrap`, `pub-meal-slot`); insight konsistensi dan riwayat latihan → Progres. Kartu form kesehatan tetap di Beranda (`pub-care-wrap`).
- Beranda tetap memanggil `loadMyProgress` supaya perayaan badge baru muncul di sana; kartunya sendiri hanya dirender di Progres. Kartu teaser `pub-teasers` menampilkan jumlah PR dan tantangan bulan ini.
- `getMyProgress.challenge = { target, done, month }` dihitung server (`_monthlyChallenge_`): sesi selesai pada bulan WIB ini; target dari Script Property `MONTHLY_CHALLENGE_SESSIONS` (bawaan 8, batas 1–31). Tidak ada data baru.

## 2. Program (J2)

- Sheet `ProgramItems` (`ID, Member ID, Template, Hari, Urutan, Gerakan, Set, Rep, Catatan, Video URL, Diubah Pada`): Member ID terisi = program klien, Member ID kosong + Template terisi = template. `ProgramLog` (`ID, Member ID, Tanggal, Hari, Selesai, Dibuat Pada`) menyimpan urutan gerakan yang dicentang per klien, hari, dan tanggal WIB.
- Editor berbasis teks: `# Nama hari`, lalu satu gerakan per baris `Gerakan | 3x10 | catatan | https://link`. `_parseProgramText_` (murni) memvalidasi dan melempar error Indonesia dengan nomor baris (maks 7 hari × 12 gerakan; hanya link https; selain itu teks biasa). `_programToText_` untuk mengisi kotak edit; program ditulis ulang seluruhnya di dalam lock (`_programWrite_`).
- Admin: `getMemberProgram`, `saveMemberProgram` (teks kosong = hapus), `getProgramTemplates`, `saveProgramTemplate` (nama tak peka huruf, maks 30), `deleteProgramTemplate`, `applyProgramTemplate`. Klien: `getMyProgram` (program + centang hari ini), `logMyProgramDay(memberToken, hari, selesai[])` (klien dari token; hari dan gerakan harus milik programnya; daftar kosong menghapus; Telegram hanya nama depan + nama hari saat hari selesai pertama kali).
- Portal: kartu per hari dengan kotak centang 44 px, set × rep, tombol video (`rel=noopener`), simpan setelah jeda 600 ms. Panel: tab Program di halaman klien, editor dengan "Muat dari template" dan "Simpan sebagai template".

## 3. Info & Tips (J3)

- Sheet `Content` (`ID, Tipe, Judul, Isi, URL, Kategori, Sematkan, Tampil Mulai, Tampil Sampai, Aktif, Dibuat Pada`). Tipe: `pengumuman`, `tips`, `video`; video wajib punya link https; pengumuman dan tips wajib punya isi; maks 200 item.
- Admin: `getContentAdmin` (status `tayang`/`terjadwal`/`berakhir`/`mati`), `saveContent` (buat atau ubah, validasi Indonesia), `deleteContent`. Halaman **Konten** di panel: sidebar desktop dan tombol **+** di HP, daftar dengan status, lembar editor penuh tinggi.
- Klien: `getMyContent(memberToken)` hanya yang aktif dan sedang tayang (`_contentVisible_`), disematkan dulu lalu terbaru (`_contentSort_`); tanpa data klien. `getPortalBootstrap.info.latestAt` = waktu pembuatan terbaru yang tayang. Titik "baru" (tab Lainnya, sidebar, baris Lainnya, teaser Beranda) membandingkannya dengan `localStorage` `xnk_info_seen`; membuka tab Info menandai sudah dilihat. Chip kategori menyaring daftar di browser.
