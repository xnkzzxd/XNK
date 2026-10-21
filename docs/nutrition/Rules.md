# Gizi — aturan (Rules)

Aturan inilah yang dibaca kode (`Nutrisi.gs`, konstanta `NUT_*`). Ubah di sini dan di konstanta sekaligus. Semua angka adalah **estimasi**, bukan pengganti ahli gizi.
Status: **draf untuk disetujui owner**. Baris bertanda ⚠ harus dicek ke sumber aslinya sebelum rilis (jangan dipercaya dari ingatan).

| # | Aturan | Sumber |
| --- | --- | --- |
| 1 | BMR: Mifflin-St Jeor (pria 10·BB + 6,25·TB − 5·usia + 5; wanita … − 161). Bila lemak tubuh ada: Katch-McArdle (370 + 21,6·massa bebas lemak). | Mifflin 1990; Katch-McArdle |
| 2 | TDEE = BMR × faktor aktivitas otomatis dari sesi/minggu (jadwal + log latihan 4 minggu): 0–1 → 1,2 · 2–3 → 1,375 · 4–5 → 1,55 · 6+ → 1,725. Kalori mingguan tetap; karbo ±10–15 % hari latihan vs istirahat. | Harris-Benedict/FAO |
| 3 | Kalori menurut goal: turun lemak TDEE −15–20 % (maks −25 %) · jaga = TDEE · naik otot +10–15 % · recomp −5 %. Batas bawah 1.200 (wanita) / 1.500 (pria) dan tidak di bawah BMR. | ISSN/ACSM ⚠ |
| 4 | Protein 1,6–2,2 g/kg (recomp 2,0–2,2); BMI ≥ 30 pakai berat target (BMI 25); minimum 0,8 g/kg; sebar 3–4 kali makan, 20–40 g. | ISSN ⚠ |
| 5 | Lemak 20–30 % kalori (min 0,6 g/kg); karbo sisanya; serat 14 g/1.000 kkal (min 25 g); natrium < 2.000 mg; air ~30–35 ml/kg (info saja). | AKG 2019, WHO ⚠ |
| 6 | BMI Asia-Pasifik: <18,5 kurus · 18,5–22,9 normal · 23–24,9 lebih · 25–29,9 obesitas I · ≥30 obesitas II. WHtR (pinggang/tinggi): <0,5 baik · 0,5–0,59 waspada · ≥0,6 tinggi. Penanda, bukan diagnosis. | WHO Asia-Pasifik; Ashwell |
| 7 | Adaptif: 3 minggu berat tidak bergerak sesuai goal → saran ±100–150 kkal **ke coach** (coach setuju dulu). Turun > 1 %/minggu 2 minggu berturut → saran naik. Berat mingguan, pinggang tiap 2 minggu. | praktik umum |
| 8 | Waktu latihan: karbo + protein ringan 1–3 jam sebelum; protein 20–40 g + karbo ≤ 2 jam sesudah. Makan terbesar dekat sesi. | ISSN/ACSM ⚠ |
| 9 | Ramadan: buka, sahur, camilan malam; kalori tetap, tanpa defisit lebih dalam. | praktik umum |
| 10 | Pengaman (tetap hitung + banner kuning, defisit maks −10 %): hamil/menyusui, usia < 18 atau > 65, penyakit kronis (diabetes, ginjal, jantung, hipertensi), riwayat gangguan makan, BMI < 17,5. Teks: "estimasi, bukan pengganti ahli gizi/dokter". | kehati-hatian |
| 11 | Rekomendasi: urut protein per 100 kkal, serat, natrium rendah; saring alergi (telur, seafood, kacang, susu), laktosa, babi (semua menu halal); gorengan/manis maks 1 porsi/hari; bahan lokal murah; anggaran Hemat/Standar/Bebas. Menu 1 hari (3 makan, ~30/40/30 %): kalori ±5 %, protein ≥ 95 % target. | Isi Piringku |
| 12 | Aturan umum ke klien: Isi Piringku (½ sayur-buah, ¼ karbo, ¼ lauk); batas harian gula 50 g, garam 5 g, lemak 67 g ⚠; makan teratur, jangan lewat sarapan; batasi alkohol & minuman manis. 80/20 + 1 hari bebas per minggu opsional (rata-rata mingguan dihitung). | Kemenkes Gizi Seimbang ⚠ |
| 13 | Bahasa: ramah, singkat ("Kak {nama}, target hari ini 1.900 kkal"); porsi rumah tangga + gram; makanan estimasi diberi tanda. Suplemen tidak dibahas. | — |

Sumber data makanan: TKPI 2017 (Kemenkes). ~50 menu jadi (nasi padang, bakso, gorengan, kopi susu, …) **bukan** dari TKPI: ditandai `estimasi` dan dicek owner.
