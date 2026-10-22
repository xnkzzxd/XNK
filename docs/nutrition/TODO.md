# Gizi — TODO (T-1000+)

Urutan: coach dulu → pustaka & menu → log klien → pengingat. Ambil nomor terendah yang belum selesai.

- [ ] **T-1000** Setujui [Rules.md](Rules.md); verifikasi baris ⚠ ke sumber (AKG 2019, Gizi Seimbang, ISSN/ACSM).
- [x] **T-1001** `tools/build-foods.js` + `foods/foods.min.json` + `tests/foods.test.js`. Memuat 1.046 dari 1.088 baris TKPI yang lolos cek energi; daftar 150–300 bahan umum (kurasi) menyusul di T-1010.
- [x] **T-1002** `Nutrisi.gs`: `_nutBmi_`, `_nutWhtr_`, `_nutBmr_`, `_nutActivity_`, `_nutTarget_`, `_nutAge_`, kolom MemberData X–AC (`_ensureNutritionColumns_`) + `tests/nutrition.test.js`. Belum ada fungsi publik (T-1003).
- [x] **T-1003** Admin `getClientNutrition`/`saveClientNutrition` (Nutrisi.gs), bagian `nutrition` di `getClientBundle`, tab Gizi di profil klien (ringkasan, target, input coach, sheet `modal-nut-edit`). Tab profil kini 6 (3 kolom di HP, 6 di PC). Tes: `tests/nutrition-admin.test.js`.
- [x] **T-1004** Saran adaptif: `_nutAdvise_` (tren berat 28 hari, ±125 kkal), sheet `NutritionAdvice`, kolom MemberData "Penyesuaian Kalori" (maks ±300), admin `decideNutritionAdvice`, `getCoachHub().nutrition` (nama depan saja) + kartu "Saran target gizi" di dashboard dan di tab Gizi klien. Tes: `tests/nutrition-advice.test.js`.
- [x] **T-1010** `tools/foods-curated.json` (120 bahan TKPI + 50 menu jadi estimasi), `foods/foods.min.json` berisi 170 item dengan porsi rumah tangga, harga 1–3, tag alergen/laktosa. Daftar estimasi untuk dicek owner: [Estimasi.md](Estimasi.md).
- [ ] **T-1011** `_nutMenu_` (menu 1 hari, tukar item, Ramadan, belanja) + tes.
- [ ] **T-1012** Portal: segmen Latihan | Makan, cincin/makro, onboarding, menu, aturan makan, (i).
- [ ] **T-1020** `FoodLog`: `logMyFood`/`deleteMyFood`, sheet cari/porsi, favorit, salin kemarin, makanan sendiri; log di tab coach.
- [ ] **T-1030** Baris personal di pengingat makan; `NUTRITION_ENABLED` di Pengaturan; saklar per klien.
- [ ] **T-1031** Docs (Agent.md §7, READMEs), `tests/security.test.js`, browser-check 390×844 + desktop.
