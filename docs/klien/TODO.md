# TODO — Fase Q (T-1100+)

Q1 fondasi
- [x] T-1100 Token `--danger` / `--danger-soft` (terang + dua blok gelap)
- [x] T-1101 `insightHeroHtml`, `.insight-hero`
- [x] T-1102 `clientStateInfo`, `.state-pill`, `.flag`
- [x] T-1103 `pageHead`, `errorState`, `.icon-chip`, `.stat-strip`, `details.fold`, `sparkHtml`, `heatHtml`
- [x] T-1104 Kerapian awal (`#fff`, override KPI HP)
- [x] T-1105 `tests/theme.test.js`

Q2 mesin tafsir (`Wawasan.gs`)
- [x] T-1110…T-1116 tubuh, kebugaran, hubungan, latihan, aktivitas, minggu ini; part `week` + `insight` di `getPortalMore`, `insight` coach di `getClientBundle`; `tests/insight.test.js`

Q3 portal klien
- [x] T-1120 Beranda: sesi berikutnya di atas, hero ringkas, kartu "Minggu ini"
- [x] T-1121 Progres, Latihan, Makan: kartu hitam + kartu tafsir
- [x] T-1122 Jadwal, Info, Lainnya, Paket, Tim coach: kartu hitam
- [x] T-1123 Judul seragam (`pageHead`/`pageIntro`), skeleton/empty/error seragam

Q4 halaman Klien di panel
- [x] T-1130 `_clientSignals_` + part `signals` di `getAdminMore`
- [x] T-1131 Kartu hitam, tile filter (Perlu perhatian), urutkan, sakelar Kartu/Daftar
- [x] T-1132 Kartu klien: status, tanda perhatian, sesi berikutnya (HP), tren 4 minggu
- [x] T-1133 Detail klien 4 tab, Sorotan, Pengingat WA dilipat, Riwayat di Ringkasan
- [x] T-1134 Kartu hitam + tafsir coach di Progres, Latihan, Gizi

- [x] T-1140 Redesign desktop: kartu ramping, judul di top bar, sub-tab Progres, Makan, Coach ringkas, accordion di halaman klien, Gizi, kalender kecil

Belum: login portal dan tab bar masih seperti sebelumnya (hanya dirapikan lewat token); lihat catatan di PR.
