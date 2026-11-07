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
- [ ] T-1802 Cache payload `getPortalMore` / `getClientBundle` / `getAdminMore` di CacheService, kunci `_memberVer_`; payload > ~90 KB dipecah per bagian. `getClientBundle` (data kesehatan/perawatan) boleh disimpan dengan TTL pendek 120–300 dtk (izin pemilik); tetap tidak ke Telegram, `xnk_admin_cache`, atau jawaban publik.
- [ ] T-1803 Satu baca `MemberData` per request (`requireMember_` → `_memberRowOrThrow_` → `_memberVersAll_`).
- [ ] T-1804 Perluas `_sharedCached_` ke `getCoaches`, `getPriceList`, `_businessHours_`. (WorkoutLog dll. sudah memo per bundle lewat `_sheetRowsMemo_`.)

## W2 — Hitung saat menulis (mulai dari satu sheet)
- [ ] T-1805 Sheet `MemberStats` (1 baris/klien), `rebuildStats_` idempoten, pembaca memakai baris + fallback hitung lama. Ukur ulang; `RevenueMonthly`/`FinanceMonthly` hanya bila W0 menunjukkan masih mahal.

## W4 — Kurangi panggilan
- [ ] T-1806 Panel: gabung panggilan keuangan ke bootstrap/`getAdminMore`.
- [ ] T-1807 Landing: JSON harga statis hanya untuk tampilan pertama, tetap segarkan dari server.
- [ ] T-1808 Tes regresi: tidak ada `getPortalMore` bila `moreVer` sama; hitung panggilan per layar di `browser-check.js`.

## W5 — Frontend
- [ ] T-1809 `defer` lucide; fullcalendar dan cropper lazy; preconnect font.
- [ ] T-1810 `Bagikan.html` keluar dari inline (cek `build-static.js`, `share-check.js`, `build-demo.js` dulu).
- [ ] T-1811 Skeleton konsisten; landing menunda SplitText/lenis.
- [ ] T-1812 Pecah `App.html`/`Theme.html`: paling akhir, bersama AAA4 (alat build dan tes bergantung pada satu blok script/style per berkas include).
