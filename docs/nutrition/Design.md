# Gizi — Design

## Data
- `foods/foods.min.json` (GitHub Pages, lazy-load seperti `exercises/`), dibangun `tools/build-foods.js` dari teks TKPI. Field: `id` (kode TKPI), `nama`, `kelompok`, `per100` {kal, protein, lemak, karbo, serat, natrium, kalsium, besi}, `porsi` [{nama, gram}], `harga` 1–3, `alergen[]`, `laktosa`, `babi`, `estimasi`. Tes mencocokkan ~20–30 baris dengan PDF.
- MemberData kolom baru (append, `_ensureNutritionColumns_`, idempotent, di bawah lock): Tinggi, Jenis Kelamin, Goal Gizi (`turun|naik|jaga|recomp`), Alergi/Pantangan, Anggaran, Gizi Aktif. Tanggal lahir = kolom U yang sudah ada. Goal teks lama tidak diubah.
- Sheet `FoodLog` (satu baris per item, snapshot kal/makro), `NutritionAdvice` (saran adaptif: status setuju/tolak), `FoodFavorites` bila perlu. Berat dari `Progress` terakhir (> 4 minggu = minta timbang).

## Server (`Nutrisi.gs`, fungsi murni diuji)
`_nutBmi_`, `_nutWhtr_`, `_nutBmr_`, `_nutActivity_`, `_nutTarget_` (+ `warnings`), `_nutAdvise_`, `_nutMenu_` (3 makan, penukar, variasi harian, hari latihan/istirahat, Ramadan), `_nutShopping_`.
Admin: `getClientNutrition`, `saveClientNutrition`, `decideNutritionAdvice`. Member: `getMyNutrition`, `saveMyNutritionProfile`, `logMyFood`, `deleteMyFood`. Semua masuk daftar `tests/security.test.js`; member dari token. Bagian `nutrition` ikut `getPortalMore` dan `getClientBundle`; `getCoachHub().nutrition` = saran menunggu. Pengingat makan: baris personal dari `_nutTarget_`.

## UI
- Portal: segmen sticky `Latihan | Makan` di `public-program`. Makan: cincin kalori + 3 batang makro (+ (i)) → Menu hari ini (tombol + per makan) → Catat → Aturan makan → Belanja. Sheet cari makanan, sheet porsi (chip rumah tangga + stepper 0,5 + gram), sheet tukar item (3 pengganti, "Acak lagi"), sheet onboarding 3 langkah, banner kuning pengaman. Monokrom; warna hanya data. 44 px, `var(--sa-*)`, light/dark.
- Panel: tab Gizi di profil klien: Ringkasan → Input coach → Saran adaptif → Log 7 hari; dua kolom hanya lewat container query. Kartu dashboard: saran menunggu.
