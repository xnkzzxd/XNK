# Phase W — Kecepatan (T-1800+)

Tujuan: panel dan portal terasa lebih cepat tanpa mengubah tampilan. Prinsip: ukur dulu, hanya optimalkan bagian yang terbukti mahal.
Fakta dasar (dari Phase AAA): satu panggilan Apps Script punya batas bawah ~1,2–1,8 dtk, baca sheet menambah ~1,3 dtk, `fetch` ke `doPost` ~0,35–0,47 dtk lebih lambat dari `google.script.run`. Jumlah panggilan per layar tidak boleh naik.
Plan lengkap: lihat riwayat sesi; ringkasan fase di bawah. W3 (rumus spreadsheet) dicoret: tidak bisa dites dan tercakup W2.

Legenda: `[ ]` belum, `[~]` sedang, `[x]` selesai. 👤 = perlu pemilik.

## W0 — Ukur baseline
- [x] T-1800 `ms` per bagian di `getPortalMore`, `getAdminMore`, `getClientBundle` (`_traceStart_` / `_tp_` / `_traceEnd_` di `Kode.gs`; angka saja, satu baris `console.log`, `SPEED_TRACE=false` mematikan; bawaan nyala, pengecualian sadar dari aturan 5 karena dipakai untuk mengukur). Tes: `tests/speed-trace.test.js`.
- [x] T-1801 Baseline langsung diukur 2026-11-07 dari pane browser pemilik (panel `/next/`, 57 klien). `getPortalMore` tidak diukur (butuh kunci klien; cache dan tes memakai logika yang sama dengan `getClientBundle`).

Baseline (T-1801, waktu server dari field `ms`, jam dinding dari browser):
| Fungsi | Dinding | Server | Bagian terbesar (ms) |
| --- | --- | --- | --- |
| getAdminMore (n=6 dinding, 2 dengan ms) | 19,8–33,6 dtk (median ~25) | 19,0–22,2 dtk | hub 8.600–10.000, signals 3.100–3.300, revenue 1.800–1.900, transactionLog 1.300–1.900, renewals 1.200–1.300, packageTrend 600, taskSummary 450–570, memberVers 480–570 |
| getClientBundle (n=7 dinding, 3 dengan ms) | 13,0–17,5 dtk (median ~14) | 10,3–12,3 dtk | insight 1.600–2.200, nutrition 1.400–2.000, care 1.200–1.400, progress 1.000–1.200, workout 850–1.300, share 600–1.300, program 590–990, foodLog 700–900, programGen 470–740, tasks 400–450 |
| getPortalMore | belum diukur | — | — |

Temuan: (1) dinding − server ≈ 3 dtk (alihan Apps Script + jaringan), tak bisa dihindari. (2) Setiap bagian bundel ≈ 0,4–2 dtk, kira-kira satu baca sheet; jadi bundel mahal karena jumlah baca sheet, bukan satu fungsi lambat. (3) `getAdminMore` memakai ~20 dtk server dan itu jalan di latar saat panel dibuka; hub (~9 dtk) adalah target pertama. Hub dipecah per bagian (`hub.care`, `hub.nutrition`, …) di commit berikutnya untuk menemukan yang paling mahal.

## W1 — Cache hasil jadi di server
- [x] T-1802 Hasil jadi `getPortalMore` (kunci klien + hari WIB + versi) dan `getClientBundle` (TTL 30–300 dtk, bawaan 180; izin pemilik untuk data perawatan) di CacheService, dipecah 30.000 karakter per nilai; `coachStatus` selalu segar (tergantung jam); bundel yang ada bagian `{error}` tidak disimpan; `PAYLOAD_CACHE=false` mematikan, `PAYLOAD_CACHE_SECONDS` (bawaan 300, 30–1800). `getAdminMore` tidak di-cache: tidak ada versi yang menutup semua penulisnya (dikerjakan bersama W2). Tes: `tests/payload-cache.test.js`.
- [x] T-1803 `_withMemberMemo_` + `_memberValues_`: MemberData dibaca sekali per bundle (`getPortalMore`, `getAdminMore`, `getClientBundle`); penulis tidak memakai memo.
- [-] T-1804 Ditunda: `getPriceList`/`getCoaches`/`_businessHours_` dibaca juga oleh penulis dan pemeriksa harga; tidak semua penulisnya lewat `_bustShared_`. Dikerjakan setelah baseline menunjukkan perlu. (WorkoutLog dll. sudah memo per bundle lewat `_sheetRowsMemo_`.)

## W1b — Panel (hasil ukur 2026-11-07)
- [x] T-1813 `getAdminMore` di-cache (TTL `ADMIN_MORE_CACHE_SECONDS`, bawaan 90, 15–600; kunci hari + bulan + tahun + versi admin + versi bersama). Versi admin naik di `_bumpMember_`, `_bustSlots_`, `_bustShared_` dan `_finLocked_` (penulis keuangan); `memberVers` selalu segar; tarik-untuk-segarkan mengirim `fresh=true`. Penulis yang tidak lewat salah satunya bisa terlihat basi sampai TTL habis (paling lama 90 dtk).
- [x] T-1814 Baca sheet berulang di bundle jadi sekali: log `Members` (`_membersLogValues_`), `SessionNotes` (N+1 per sesi hari ini di hub), `SessionRatings`/`PackageEvaluations` (`_readSheetRows_`) lewat memo per bundle; `MemberData` dibaca sekali di hub, signals, renewals, gizi dan program otomatis. Hasil ukur setelah T-1803 (`getAdminMore` server): `memberVers` 480–570 → 40–76 ms; total 19–22 → 16–19 dtk. Pemecahan hub (warm): self 0,3, members 0,3, revenue 0,7–0,9, care 0,8–1,5, feedback 0,5–0,7, workouts 0,5–0,9, programAuto 0,7–0,9, nutrition 0,3–0,5 (4,0 dtk saat pemindaian saran gizi 10-menitan jalan).

## Hasil setelah W1 + W1b (2026-11-07, panel hidup, 57 klien)
| Fungsi | Sebelum (dinding / server) | Cache hit (dinding / server) | Miss sesudah perbaikan |
| --- | --- | --- | --- |
| getAdminMore | ~25 dtk / 19–22 dtk | 3,5–4,2 dtk / 1,0–1,3 dtk | 22–29 dtk / 16–26 dtk (turun-naik; hub 7–16 dtk, naik saat pemindaian gizi jalan) |
| getClientBundle | ~14 dtk / 10–12 dtk | 2,5–2,8 dtk / 0,2 dtk | ±12,6 dtk / 9,6 dtk |
Panggilan berulang (buka klien yang sama, buka panel lagi dalam 90/180 dtk) kini sekitar 4–6 kali lebih cepat; sisa ~2,3–3 dtk adalah alihan Apps Script + jaringan yang tak bisa dihindari. Miss pertama hampir tidak membaik (baca sheet masih banyak).

## W1c — Miss panel
- [x] T-1815 Pemindaian saran gizi di hub (3–8 dtk, penyebab hub 15 dtk pada miss tertentu) jalan tiap 30 menit, bukan 10 (`NUT_SCAN_SECONDS`, bawaan 1800, 600–7200). Saran berubah per minggu; keputusan coach tetap menghapus tanda pindai.

- [x] T-1816 `Tasks`, `RenewalRequests`, `Progress`, `Assessments`, `HealthScreening`, `FitnessTests` dibaca sekali per bundle lewat `_sheetRowsMemo_` (ringkasan PR, perpanjangan, sinyal klien dan daftar perhatian memakai data yang sama). Diukur 2026-11-07 (`getAdminMore` miss, `fresh=true`, 3 kali): `signals` 2.000–3.300 → 920–1.200 ms; total server 15,4–20,9 dtk (jam dinding 18,4–24,0 dtk), masih turun-naik. Sisa terbesar: hub 7,9–10,3 dtk (`hub.nutrition` 4,6 dtk tepat setelah pemindaian gizi kedaluwarsa, selain itu 0,3–0,5; bagian hub yang tercatat hanya ±4,5 dtk, sisa ±3 dtk ada di badan `_coachHub_` sendiri, belum dipecah), `transactionLog` 1,5–3,8, `revenue` 1,6–2,4, `hub.care` 1,1–2,2, `renewals` 0,7–1,1, `packageTrend` 0,5–1,0. Calon berikutnya bila miss pertama dianggap masalah: pecah sisa ±3 dtk di `_coachHub_`, lalu `MemberStats`.
- [x] T-1817 `_wibDate_` (UTC+7 lewat hitungan) menggantikan `Utilities.formatDate` / `_wibParts_` (3 panggilan layanan per baris) di loop atas semua sesi: `_coachHub_` (dua loop), `_careList_`, `_monthSummary_` dan sinyal klien. Diukur 2026-11-07 (miss, `fresh=true`, 2 kali): `signals` 300–800 ms (sebelumnya ~1 dtk); hub 5,9–9,2 dtk dengan selisih tak tercatat ±1 dtk (sebelumnya ±3 dtk); total server 13,3–17,2 dtk. Turun-naik antar panggilan masih besar (revenue 1,5–2,3, transactionLog ~2,1, hub.care 0,8–2,3). Tes: `tests/wib-date.test.js`.

## W6 — Portal klien (diukur 2026-11-07 dengan klien uji milik pemilik)
Ukuran awal (jam dinding dari browser pemilik): login 4,0 dtk; `getPortalBootstrap` 14,3 dtk, 132 KB; `getPortalMore` miss pertama 24,2 dtk (server 20,8: auth 1,2, progress 2,0, workout 2,4, nutrition 2,1, bills 2,3, coachStatus 1,4, tiap bagian lain 0,4–1,2); panggilan kedua **hit** 6,4 dtk (server 3,7: auth 1,5 + coachStatus yang dihitung ulang ~1,4–2); panggilan ketiga miss lagi 9,7 dtk (penyebab belum diketahui: versi data berubah atau entri cache terbuang).
- [x] T-1818 Cache hit `getPortalMore` tidak lagi menghitung ulang `coachStatus` (bootstrap selalu membawanya segar; klien memakai `coachStatus` dari More hanya bila ada). Bootstrap diberi `ms` per bagian (auth, ver, schedules, notes, pendingRating, packageEval, content, openSlots, slotsByCoach, coaches, priceList, coachStatus) dan dibungkus memo `MemberData`. `ms.ver` (versi data yang dipakai kunci cache) ikut di balasan `getPortalMore` untuk menelusuri miss tak terduga. Belum diukur ulang.
- [x] T-1818b Hasil ukur setelah #130 (klien uji, 2026-11-07): `getPortalMore` hit server 3,7 → 1,3 dtk (jam dinding 6,4 → 4,0–4,4), `auth` 1,1 dtk dari 1,3 itu; dua hit berturut-turut, miss ketiga tidak terulang. Bootstrap server 7,2–8,2 dtk (dinding 9,9–11,3): slotsByCoach 1,1–2,4, coachStatus 1,2–1,5, openSlots 0,5–1,1, auth 0,8–1,2, schedules 0,5, notes 0,5, pendingRating 0,5, content 0,4–0,5, priceList 0,3–0,5.
- [x] T-1820 Bundel baca-saja (`_withMemberMemo_`) kini juga mengaktifkan memo baca: `Coaches`, `CoachAvailability`, `CoachTimeOff` dan `Schedules` dibaca sekali per bundle (bootstrap membaca `_activeCoaches_`, aturan, cuti dan jadwal beberapa kali lewat slotsByCoach, openSlots dan coachStatus). Tes: bootstrap membaca `Schedules` ≤ 1 dan `MemberData` 1 kali. Diukur setelah #131 (klien uji, 2026-11-07): bootstrap server 7,2–8,2 → 4,4–4,5 dtk (dinding 9,9–11,3 → 6,8–7,1); slotsByCoach 1,1–2,4 → 0,04–0,34 dtk; coachStatus 1,2–1,5 → 0,004–0,7 dtk. Sisa: auth 0,8–1,0, openSlots 0,4–1,0, pendingRating ~0,65, priceList/schedules/notes/content ~0,3 masing-masing. `getPortalMore` miss 10,5 dtk server (dinding 13,4), hit 2,0 dtk (dinding 5,1; auth 1,8 dtk pada pengukuran ini).
- [~] T-1819 Selesai diukur (lihat di atas); miss ketiga tidak terulang pada dua pengukuran berikutnya. Terbuka: `requireMember_` (0,8–1,8 dtk membaca seluruh MemberData tiap panggilan) kini bagian terbesar dari hit dan bootstrap. Cache validasi sesi menyentuh keamanan (logout-semua harus tetap langsung berlaku), jadi hanya dikerjakan bila pemilik meminta.
- [-] T-1821 Dicoba dan **dibatalkan** (#133, di-revert): cache baris klien untuk autentikasi bundel baca-saja membuat `browser-check` "changed session key → old session no longer works" gagal, karena mengubah kunci sesi di sheet harus mencabut sesi lama seketika dan cache menundanya sampai 60 dtk. Itu kontrak yang sengaja dites; jangan di-cache lagi tanpa jalur pencabutan yang bisa dibaca cepat (mis. membaca hanya sel kunci klien itu, bukan seluruh MemberData). `requireMember_` tetap membaca seluruh `MemberData` (0,8–1,8 dtk).

## W2 — Hitung saat menulis (mulai dari satu sheet)
- [-] T-1805 Ditunda dengan sengaja. Alasan: cache W1/W1b sudah mengubah panggilan berulang jadi 2,5–4 dtk, dan `getAdminMore` berjalan di latar saat panel dibuka sehingga miss 16–26 dtk tidak menahan layar pertama. `MemberStats` menyentuh banyak penulis data (selesai sesi, latihan, progres, transaksi, keuangan) dan hanya mempercepat miss; risiko selisih data lebih besar daripada untungnya sekarang. Buka lagi bila pemilik mengeluh soal miss pertama atau jumlah klien naik jauh. Calon pertama: `hub.care`, `hub.programAuto`, `signals` (masing-masing 1–3 dtk).

## W4 — Kurangi panggilan
- [x] T-1806 Sudah beres: buka panel = `getAdminBootstrap` + `getAdminMore` (keuangan/omzet sudah di dalam `getAdminMore`; `getFinanceOverview` hanya dipanggil saat tombol Keuangan dinyalakan).
- [x] T-1807 Landing: harga tampil dari salinan di perangkat (`xnk_landing_prices`), disegarkan dari server dan diganti hanya bila beda. (Kunjungan pertama tetap menunggu server; berkas JSON statis belum dibuat.)
- [x] T-1808 Gate panggilan per layar sudah dijaga `browser-check.js` (mode `fetch` dan `RPC_MODE=gas`, lolos di CI #115); tes regresi `moreVer` sudah ada di `cache-version.test.js`.

## W5 — Frontend
- [x] T-1809 FullCalendar dan cropper `defer` (kalender menunggu `load` bila dipanggil lebih awal); `browser-check` lolos. Lucide sengaja tetap sinkron: tanpa itu ikon muncul belakangan dan layout bergeser.
- [-] T-1810 Tidak dikerjakan: `Bagikan.html` hanya ~113 KB skrip yang di-parse sekali (puluhan ms); di mode Apps Script berkas ini inline, dan mengeluarkannya mengubah `build-static.js`, `share-check.js`, `build-demo.js` demi untung kecil.
- [-] T-1811 Tidak dikerjakan: skeleton portal/panel sudah ada (`skel()`); landing menunda animasi karena `defer`. Tanpa ukuran yang menunjukkan masalah.
- [x] T-1812 Dikerjakan 2026-11-07 setelah AAA: sumber `App.html` (14 bagian) dan `Theme.html` (4 bagian) kini ada di `apps-script/pt-scheduler/parts/` dan digabung byte demi byte oleh `tools/build-parts.js` ke `src/App.html` / `src/Theme.html`. Berkas hasil tetap satu blok, jadi semua alat build, tes dan Apps Script tidak berubah; `tests/parts.test.js` menjaga agar hasil tidak basi. (App.html satu IIFE besar, jadi dipecah di tingkat berkas sumber, bukan di tingkat skrip.)

## W6 — Backend lebih cepat: hitung di latar, simpan ringan, ringkasan per klien (rencana 2026-11-07)
Latar: tampilan sudah "langsung berhasil" (PR #135, #136), jadi yang tersisa adalah (a) buka pertama setelah cache kedaluwarsa (`getAdminMore` 13–17 dtk, `getClientBundle` ±10 dtk di server) dan (b) lamanya simpan di belakang. Batas Apps Script (±1,2–1,8 dtk per panggilan + ±2–3 dtk alihan/jaringan) tidak berubah; itu hanya hilang di Phase V.
Urutan: W6a → W6b → W6c. W6c memakai pemicu W6a.

### W6a — Hangatkan cache di latar (poin 1)
- [x] T-1820 Pemicu baru `runWarmTick` (nama publik tanpa `_`, digolongkan TRIGGER di `tests/api-lists.js`) tiap 15 menit, hanya 05:00–22:00 WIB, dipasang/dilepas dari Pengaturan bersama pemicu pengingat. **Mati bawaan** (`WARM_ENABLED`, aturan 5).
- [x] T-1821 (`src/Hangat.gs`; admin lewat token sementara di memori server, klien lewat `getClientBundle` + `getPortalMoreImpl_` — pembangun yang sama, tidak perlu dipecah; urutan klien `_warmPick_`) Isi pekerjaan, berhenti saat anggaran waktu habis (`WARM_BUDGET_MS`, bawaan 30.000): (1) `getAdminMore` bulan ini bila kuncinya belum ada di cache; (2) `getClientBundle` dan `getPortalMore` untuk klien dengan sesi hari ini/besok, lalu klien aktif 7 hari terakhir, terbaru dulu, hanya bila versi kliennya berubah sejak dihangatkan. Memakai fungsi isi yang sama (dipecah jadi `…Build_` tanpa token) supaya hasil identik dengan panggilan biasa.
- [x] T-1822 (`CLIENT_BUNDLE_CACHE_SECONDS` juga 180 → 900, batas 1.800) TTL dinaikkan karena kunci sudah memuat versi: `ADMIN_MORE_CACHE_SECONDS` bawaan 90 → 900, `PAYLOAD_CACHE_SECONDS` 300 → 1800. Bagian yang tergantung jam (hub "hari ini", `coachStatus`) tetap segar: `coachStatus` sudah dihitung ulang tiap hit; hub dicek ulang bila kunci jamnya beda (tambah jam WIB ke kunci `am:`).
- [~] T-1823 (sebagian: tiap putaran mencatat `{warm:{admin,clients,ms}}` di log; perpanjangan jeda otomatis belum, tunggu angka nyata) Kuota: akun Gmail biasa ±90 menit jalan pemicu per hari. 68 putaran × ≤30 dtk ≈ 34 menit, ditambah pengingat. Catat `ms` tiap putaran di log; bila total harian > 60 menit, perpanjang jeda otomatis.
- [x] T-1824 (`tests/warm.test.js`; ukur hit nyata setelah pemilik menyalakan) Tes: hasil hangat = hasil panggilan biasa (byte sama tanpa `at`/`ms`), anggaran dihormati, mati bawaan, jam malam dilewati. Ukur sesudahnya: persentase hit `getAdminMore` / `getClientBundle` dari jejak `SPEED_TRACE` (target ≥ 90 %).

### W6b — Simpan yang ringan (poin 3)
- [x] T-1825 (2026-11-07: `doPost` mencatat `speed rpc <fn> {run, json}` untuk setiap panggilan dari halaman statis; `saveMyMeasurement` dan `logMyWorkout` dipecah `write`/`reply` (+ `tick`, `program`). Angka nyata menunggu log server beberapa hari; T-1826/T-1827 diputuskan dari angka itu, bukan ditebak.) Ukur dulu: `_traceStart_`/`_traceEnd_` di penulis yang paling sering (`saveMyMeasurement`, `saveMemberMeasurement`, `logMyFood`, `logMyWorkout`, `completeMyTask`, `saveSessionNote`, `completeSession`, `clientBookSchedule`, `updateMemberProfile`). Pisahkan waktu tulis, `flush`, versi, dan hitung jawaban.
- [ ] T-1826 Penulis yang menghabiskan > 0,5 dtk untuk menyusun jawaban (mis. riwayat progres lengkap setelah simpan ukuran) menerima `opts.lite`: jawab `{ ok, id, ver }` saja. Browser (helper `optimistic`) mengirim `lite` bila layar tidak butuh jawaban penuh, dan menandai salinan perangkat basi supaya ringkasan dihitung sekali di latar (pola `patchPortalMore` sekarang). Tanpa `lite` perilaku lama tetap (aplikasi `app/` dan antrean offline tidak berubah).
- [ ] T-1827 Kerja yang tidak perlu ditunggu klien dipindah ke belakang jawaban: notifikasi Telegram (rating rendah, paket habis) dan pemindaian lain dicatat ke antrean kecil yang diproses `runWarmTick`. Pengecualian: yang mengubah data yang langsung dibaca lagi.
- [ ] T-1828 Tes: `lite` dan penuh menulis baris yang sama; versi tetap naik; tes `cache-version` tetap lolos.

### W6c — Ringkasan per klien yang disimpan (poin 4, dulu T-1805)
- [ ] T-1829 Sheet `MemberStats` (satu baris per klien, kolom ditambah di akhir saja): sisa sesi, sesi terpakai, sesi akan datang, sesi terakhir, streak minggu, berat terakhir + tanggal, latihan terakhir, tanda perhatian (`gap`, `retest`, `no-health`, …), versi klien saat dihitung, `Dihitung Pada`.
- [ ] T-1830 Kapan dihitung: `_bumpMember_(id)` sudah dipanggil setiap penulis data klien (dijaga `tests/cache-version.test.js`). Di sana klien hanya **ditandai kotor** (daftar di CacheService), tanpa menambah waktu simpan. `runWarmTick` menghitung ulang baris kotor dengan fungsi yang sama yang dipakai sekarang.
- [ ] T-1831 Pembaca (`_clientSignals_`, `hub.care`, `hub.programAuto`, daftar perhatian) memakai baris `MemberStats` bila versinya sama dengan versi klien sekarang; bila tidak (kotor/kosong), hitung seperti sekarang. Jadi angka tidak pernah salah, paling buruk sama lambatnya dengan hari ini.
- [ ] T-1832 Tes: hasil dari baris tersimpan = hasil hitung langsung untuk data contoh; baris kotor dilewati; migrasi idempoten di bawah kunci skrip. Ukur `getAdminMore` miss sebelum/sesudah (target: `signals` + `hub` turun dari ±7–10 dtk ke < 3 dtk).

### Pemilik
- 👤 Nyalakan `WARM_ENABLED` dan pasang pemicu dari Pengaturan setelah W6a di-merge.
- 👤 Pastikan jenis akun (Gmail biasa atau Workspace) untuk batas kuota pemicu.
