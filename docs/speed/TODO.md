# Phase W — Kecepatan (T-1800+)

Tujuan: panel dan portal terasa lebih cepat tanpa mengubah tampilan. Prinsip: ukur dulu, hanya optimalkan bagian yang terbukti mahal.
Fakta dasar (dari Phase AAA): satu panggilan Apps Script punya batas bawah ~1,2–1,8 dtk, baca sheet menambah ~1,3 dtk, `fetch` ke `doPost` ~0,35–0,47 dtk lebih lambat dari `google.script.run`. Jumlah panggilan per layar tidak boleh naik.
Plan lengkap: lihat riwayat sesi; ringkasan fase di bawah. W3 (rumus spreadsheet) dicoret: tidak bisa dites dan tercakup W2.

Legenda: `[ ]` belum, `[~]` sedang, `[x]` selesai. 👤 = perlu pemilik.

## W0 — Ukur baseline
- [x] T-1800 `ms` per bagian di `getPortalMore`, `getAdminMore`, `getClientBundle` (`_traceStart_` / `_tp_` / `_traceEnd_` di `Kode.gs`; angka saja, satu baris `console.log`, `SPEED_TRACE=false` mematikan; bawaan nyala, pengecualian sadar dari aturan 5 karena dipakai untuk mengukur). Tes: `tests/speed-trace.test.js`.
- [ ] T-1801 👤 Setelah di-merge dan ter-deploy: buka portal dan panel di perangkat pemilik, ambil `ms` (tab Network di /next/: respons berisi `ms`; atau Executions di editor Apps Script: baris `speed getPortalMore …`), 5+ panggilan dingin dan hangat per fungsi. Tulis median per bagian di sini. Bagian < ~100 ms tidak disentuh.

Baseline (diisi T-1801):
| Fungsi | Total | Bagian terbesar |
| --- | --- | --- |
| getPortalMore | ? | ? |
| getAdminMore | ? | ? |
| getClientBundle | ? | ? |

## W1 — Cache hasil jadi di server
- [x] T-1802 Hasil jadi `getPortalMore` (kunci klien + hari WIB + versi) dan `getClientBundle` (TTL 30–300 dtk, bawaan 180; izin pemilik untuk data perawatan) di CacheService, dipecah 30.000 karakter per nilai; `coachStatus` selalu segar (tergantung jam); bundel yang ada bagian `{error}` tidak disimpan; `PAYLOAD_CACHE=false` mematikan, `PAYLOAD_CACHE_SECONDS` (bawaan 300, 30–1800). `getAdminMore` tidak di-cache: tidak ada versi yang menutup semua penulisnya (dikerjakan bersama W2). Tes: `tests/payload-cache.test.js`.
- [x] T-1803 `_withMemberMemo_` + `_memberValues_`: MemberData dibaca sekali per bundle (`getPortalMore`, `getAdminMore`, `getClientBundle`); penulis tidak memakai memo.
- [-] T-1804 Ditunda: `getPriceList`/`getCoaches`/`_businessHours_` dibaca juga oleh penulis dan pemeriksa harga; tidak semua penulisnya lewat `_bustShared_`. Dikerjakan setelah baseline menunjukkan perlu. (WorkoutLog dll. sudah memo per bundle lewat `_sheetRowsMemo_`.)

## W2 — Hitung saat menulis (mulai dari satu sheet)
- [ ] T-1805 Sheet `MemberStats` (1 baris/klien), `rebuildStats_` idempoten, pembaca memakai baris + fallback hitung lama. Ukur ulang; `RevenueMonthly`/`FinanceMonthly` hanya bila W0 menunjukkan masih mahal.

## W4 — Kurangi panggilan
- [x] T-1806 Sudah beres: buka panel = `getAdminBootstrap` + `getAdminMore` (keuangan/omzet sudah di dalam `getAdminMore`; `getFinanceOverview` hanya dipanggil saat tombol Keuangan dinyalakan).
- [x] T-1807 Landing: harga tampil dari salinan di perangkat (`xnk_landing_prices`), disegarkan dari server dan diganti hanya bila beda. (Kunjungan pertama tetap menunggu server; berkas JSON statis belum dibuat.)
- [ ] T-1808 Tes regresi: tidak ada `getPortalMore` bila `moreVer` sama; hitung panggilan per layar di `browser-check.js`.

## W5 — Frontend
- [~] T-1809 FullCalendar dan cropper `defer` (kalender menunggu `load` bila dipanggil lebih awal). Lucide sengaja tetap sinkron: tanpa itu ikon muncul belakangan dan layout bergeser. Belum terukur.
- [ ] T-1810 `Bagikan.html` keluar dari inline (cek `build-static.js`, `share-check.js`, `build-demo.js` dulu).
- [ ] T-1811 Skeleton konsisten; landing menunda SplitText/lenis.
- [ ] T-1812 Pecah `App.html`/`Theme.html`: paling akhir, bersama AAA4 (alat build dan tes bergantung pada satu blok script/style per berkas include).
