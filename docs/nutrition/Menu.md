# Gizi — paket menu rumahan (Menu)

Status: **dibangun** (T-1040…T-1046). Menu harian klien sekarang tersusun dari **paket menu** masakan rumahan Jawa–Sunda dan menu sehat sehari-hari (ayam goreng bawang putih, ayam rebus, ayam panggang sambal hijau, soto, bakso, sop, pepes, pindang, bakar), bukan lagi gabungan bahan acak. Aturan batasnya ada di [Rules.md](Rules.md) baris 14–17. Riset di balik daftar ini: laporan "Menu rumahan Jawa Sunda bergizi" (November 2026).

## Cara kerja

1. **Data** (`tools/foods-curated.json`, dibangun `tools/build-foods.js` → `foods/foods.min.json` + `src/NutrisiData.gs`):
   - `tkpi`: baris TKPI 2020 (PDF Kemenkes/Persagi, angka dengan desimal).
   - `rujukan`: baris **panganku.org** (TKPI daring Kemenkes, kode 4 digit) untuk masakan dan bahan yang tidak ada di PDF 2020: dada ayam rebus/bakar, bakso, opor, semur, garang asem, pindang, pepes, tumis, sambal, garam. panganku membulatkan protein/lemak/karbo/serat ke bawah ke bilangan bulat; energi dan natrium tepat. Ditandai `pk:true`.
   - `resep`: 20 resep yang **gizinya dihitung saat build** dari bahan-bahannya (baris TKPI 2020 atau panganku × gram bahan, dibagi berat matang satu porsi). Ditandai `r:true`, daftar bahan ikut (`b`), dan di aplikasi diberi label **resep**. Gram bahan adalah resep rumahan XNK (bukan resep standar Poltekkes); minyak serapan dan garam ditulis sebagai bahan, jadi natrium resep sudah termasuk garam.
   - `paket`: 47 paket (12 sarapan, 30 makan utama, 5 camilan). Tiap paket: satu karbo, satu lauk (`protein`), sayur, kadang buah/pelengkap (tahu bacem, tempe bakar, sambal, lalap). `base` = lauk utama untuk aturan pengulangan.
   - `tag`: `santan`, `goreng`, `manis`, `asin` per makanan; tag paket = gabungan tag isinya. Build menolak paket santan + goreng sekaligus, paket tanpa tepat satu karbo dan satu lauk, dan makan utama tanpa sayur (tes).
   - `koreksi`: sel PDF yang tergeser parser (contoh: natrium telur dadar 36 mg adalah kolom retinol; di TKPI 2020 selnya kosong).
2. **Generator** (`src/Nutrisi.gs`): `_nutMenu_` memilih satu paket per waktu makan (`_nutPickPack_`: urutan acak per klien dan tanggal, porsi wajar didahulukan), lalu menskalakan karbo dan lauk (`_nutPackMeal_`, dua persamaan kalori + protein; lauk ≤ 2 porsi dan karbo ≤ 2,5 porsi dianggap wajar). `_nutFitDay_` merapikan total hari (kalori ±5 %, protein ≥ 95 %). Sarapan dan camilan mendapat 0,8 × bagian protein (sarapan rumahan lebih ringan), sisanya ke makan utama. Bila tidak ada paket yang cocok sama sekali, cara lama (bahan dari `NUT_SLOTS`) dipakai.
3. **Minggu**: `_nutPlanDays_` menghitung menu dari Senin minggu itu sampai hari yang diminta, jadi batas mingguan berlaku dan menu hari ini selalu sama walau dibuka berkali-kali. Daftar belanja 7 hari memakai rencana yang sama.
4. **Aturan longgar bertahap** (`_nutPackOk_`): level 0 semua aturan → 1 tanpa batas lauk mingguan → 2 tanpa anggaran dan batas mingguan paket/santan/goreng → 3 boleh lauk/asin yang sudah ada hari ini. Pantangan, paket yang sama di hari yang sama, dan santan/goreng maks 1 per hari **tidak pernah** dilonggarkan.
5. **Portal**: tiap waktu makan menampilkan nama paket + label (santan, gorengan, manis, asin) dan tombol **Ganti menu** (`swapMyMenuMeal`: tiga paket lain dengan kalori dan protein yang sama; santan/gorengan dihindari bila waktu makan lain hari itu sudah memakainya). Ketuk satu makanan = tukar makanan itu saja (resep menampilkan bahannya). Pengganti hanya di layar; besok menu dihitung ulang dari server.

## Resep (dihitung dari bahan)

Angka per satu porsi resep. P = protein, L = lemak, KH = karbohidrat (g). Sumber bahan: TKPI 2020 (kode 3 digit) dan panganku (kode 4 digit).

| Kode | Resep | Porsi | Bahan satu porsi (g) | kkal | P | L | KH | Serat | Na mg |
|---|---|---|---|---|---|---|---|---|---|
| R01 | Ayam goreng bawang putih (dada) · goreng | 1 potong, 85 g | Dada ayam rebus 80, Bawang putih 6, Minyak kelapa sawit 6, Garam 0,8 | 214 | 22,7 | 12,4 | 1,4 | 0 | 377 |
| R02 | Ayam rebus bumbu kuning (dada) | 1 potong, 85 g | Dada ayam rebus 80, Kunyit 2, Bawang merah 5, Bawang putih 3, Garam 0,7 | 162 | 22,6 | 6,5 | 1,4 | 0,1 | 337 |
| R03 | Ayam panggang sambal hijau (dada) | 1 potong dengan sambal, 100 g | Dada ayam bakar 80, Sambal hijau 20 | 218 | 18,8 | 11,8 | 7,8 | 1,2 | 372 |
| R04 | Ayam bakar kecap (dada) · manis | 1 potong, 85 g | Dada ayam rebus 80, Kecap 10, Gula aren 3, Minyak kelapa sawit 2 | 190 | 23 | 8,5 | 3,7 | 0 | 176 |
| R05 | Pepes ayam (dada) | 1 bungkus, 100 g | Dada ayam rebus 80, Tomat 15, Bawang merah 5, Cabai merah 5, Garam 0,7 | 162 | 22,7 | 6,5 | 1,5 | 0,4 | 338 |
| R06 | Soto ayam bening (tanpa nasi) | 1 mangkuk, 350 g | Dada ayam rebus 60, Tauge kedelai 30, Kol rebus 30, Bihun (mentah) 10, Seledri 3, Bawang merah 4, Bawang putih 3, Kunyit 1, Minyak kelapa sawit 3, Garam 1,5 | 214 | 20,7 | 8,8 | 13 | 0,7 | 644 |
| R07 | Sop ayam sayur | 1 mangkuk, 350 g | Dada ayam rebus 60, Wortel 40, Kentang 40, Kol rebus 30, Buncis 20, Seledri 3, Bawang putih 3, Minyak kelapa sawit 2, Garam 1,5 | 193 | 18,9 | 7,4 | 12,3 | 1,4 | 672 |
| R08 | Bakso ayam kuah (tanpa mi) | 1 mangkuk, 330 g | Bakso ayam 75, Sawi hijau 30, Seledri 2, Bawang putih 3, Minyak kelapa sawit 2, Garam 1,2 | 178 | 14,2 | 7,3 | 10,9 | 0,7 | 980 |
| R09 | Bakso sapi kuah (tanpa mi) | 1 mangkuk, 330 g | Bakso sapi 75, Sawi hijau 30, Seledri 2, Bawang putih 3, Minyak kelapa sawit 2, Garam 1,2 | 155 | 12,2 | 7,3 | 7,9 | 0,7 | 993 |
| R10 | Sup ikan nila | 1 mangkuk, 300 g | Ikan nila (mentah) 100, Tomat 30, Bawang merah 5, Bawang putih 3, Minyak kelapa sawit 2, Garam 1,2 | 117 | 19,5 | 3,3 | 2,7 | 0,6 | 558 |
| R11 | Nila bakar kecap | 1 ekor sedang, 100 g | Ikan nila (mentah) 120, Kecap 10, Minyak kelapa sawit 3, Bawang putih 3 | 141 | 23,5 | 4,3 | 1,6 | 0 | 217 |
| R12 | Lele bakar | 1 ekor, 95 g | Ikan lele (mentah) 110, Kecap 8, Minyak kelapa sawit 3, Garam 0,5 | 156 | 22,4 | 5,3 | 2,9 | 0 | 402 |
| R13 | Tempe bacem (tidak digoreng) · manis | 1 potong, 55 g | Tempe (mentah) 50, Gula aren 6, Kecap 5, Bawang putih 2, Garam 0,3 | 128 | 10,8 | 4,5 | 13,2 | 0,7 | 178 |
| R14 | Tempe bakar kecap | 1 potong, 55 g | Tempe (mentah) 50, Kecap 5, Minyak kelapa sawit 2 | 122 | 10,7 | 6,5 | 7,2 | 0,7 | 60 |
| R15 | Pepes tahu | 1 bungkus, 120 g | Tahu putih 100, Telur ayam ras 20, Bawang merah 5, Cabai merah 3, Garam 0,6 | 114 | 13,4 | 6,8 | 1,6 | 0,2 | 264 |
| R16 | Telur dadar sayur (sedikit minyak) | 1 butir, 75 g | Telur ayam ras 55, Wortel 15, Daun bawang merah 5, Minyak kelapa sawit 3, Garam 0,3 | 119 | 7,1 | 9,1 | 2 | 0,2 | 206 |
| R17 | Capcay kuah | 1 mangkuk, 180 g | Wortel 30, Kol rebus 40, Sawi putih 40, Jamur tiram 20, Buncis 20, Bawang putih 3, Maizena 3, Minyak kelapa sawit 4, Garam 0,8 | 88 | 2,2 | 4,3 | 10,8 | 2,3 | 351 |
| R18 | Oseng tempe kacang panjang | 1 porsi, 100 g | Tempe (mentah) 40, Kacang panjang 50, Minyak kelapa sawit 5, Kecap 5, Bawang merah 4, Cabai merah 3 | 147 | 9,8 | 8,7 | 9,1 | 2 | 75 |
| R19 | Bubur ayam (dada, tanpa kerupuk) | 1 mangkuk, 300 g | Beras giling 40, Dada ayam rebus 30, Kecap 5, Minyak kelapa sawit 2, Seledri 2, Garam 1 | 222 | 12 | 5,1 | 31,5 | 0 | 480 |
| R20 | Nasi liwet teri | 1 porsi, 170 g | Beras giling 60, Ikan teri segar 15, Minyak kelapa sawit 3, Bawang merah 3, Garam 0,8 | 253 | 6,6 | 4,3 | 47,1 | 0,2 | 410 |

## Paket menu

Angka untuk **porsi dasar** paket (yang tertulis). Di aplikasi, nasi/karbo dan lauk diskalakan ke target klien, jadi gramnya berbeda per orang. "≥" = ada bahan tanpa data serat. Lemak % = persen energi dari lemak (batas resmi ≤ 25 % per hari, bukan per makan).

### Sarapan

| Kode | Paket | Lauk | Isi porsi dasar (g) | kkal | P | L | KH | Serat | Lemak % | Tag |
|---|---|---|---|---|---|---|---|---|---|---|
| S01 | Nasi urap, telur rebus, tahu bacem | telur | Nasi putih 100, Telur rebus 55, Urap sayur 100, Tahu bacem 50 | 389 | 17,2 | 10,7 | 49,9 | 1,2 | 25 | manis |
| S02 | Bubur ayam dan telur rebus | ayam | Bubur ayam (dada, tanpa kerupuk) 300, Telur rebus 55 | 298 | 19,2 | 9,5 | 32,6 | 0 | 29 | – |
| S03 | Nasi liwet teri, tahu bacem, lalap | tahu | Nasi liwet teri 170, Tahu bacem 75, Ketimun 50, Tomat 20 | 338 | 14,5 | 7,5 | 51,7 | 0,6 | 20 | manis |
| S04 | Rebusan ubi, telur rebus, kacang | telur | Ubi jalar rebus 150, Telur rebus 55, Kacang tanah rebus 30 | 314 | 13,2 | 13,8 | 34,9 | ≥0 | 39 | – |
| S05 | Nasi, telur dadar sayur, tumis kangkung | telur | Nasi putih 100, Telur dadar sayur (sedikit minyak) 75, Tumis kangkung 80 | 362 | 12,5 | 12,6 | 46,6 | 2 | 31 | – |
| S06 | Roti gandum, telur rebus, pisang | telur | Roti gandum 60, Telur rebus 110, Pisang ambon 80 | 398 | 23,1 | 11,4 | 49,7 | ≥1,5 | 26 | – |
| S07 | Oatmeal, telur rebus, pisang | telur | Oatmeal dimasak dengan air 200, Telur rebus 55, Pisang ambon 80 | 312 | 13 | 8 | 47,5 | ≥1,5 | 23 | – |
| S08 | Nasi uduk, pindang telur, tempe bacem | telur | Nasi uduk 150, Pindang telur 55, Tempe bacem (tidak digoreng) 55, Ketimun 30 | 457 | 21,9 | 19 | 51,1 | ≥0,8 | 37 | asin, manis, santan |
| S09 | Nasi merah, pepes tahu, kol rebus | tahu | Nasi merah 100, Pepes tahu 120, Kol rebus 80 | 286 | 17 | 7,2 | 38,1 | 1,3 | 23 | – |
| S10 | Ubi rebus, tempe bakar, pepaya | tempe | Ubi jalar rebus 150, Tempe bakar kecap 55, Pepaya 150 | 288 | 15,5 | 6,8 | 42,8 | ≥2,2 | 21 | – |
| S11 | Nasi merah, ayam suwir bumbu kuning, tumis kangkung | ayam | Nasi merah 100, Ayam rebus bumbu kuning (dada) 85, Tumis kangkung 80 | 374 | 27,8 | 10,1 | 38,7 | 2 | 24 | – |
| S12 | Nasi, pepes teri, tahu bacem, lalap | teri | Nasi putih 100, Pepes teri 75, Tahu bacem 50, Ketimun 30 | 307 | 15,6 | 3,9 | 47,5 | 1 | 11 | manis |

### Makan siang / malam

| Kode | Paket | Lauk | Isi porsi dasar (g) | kkal | P | L | KH | Serat | Lemak % | Tag |
|---|---|---|---|---|---|---|---|---|---|---|
| U01 | Ayam goreng bawang putih, sayur asem, sambal, lalap | ayam | Nasi putih 150, Ayam goreng bawang putih (dada) 85, Sayur asem 200, Sambal terasi 10, Ketimun 50 | 555 | 28,9 | 14,2 | 73,7 | 1,9 | 23 | asin, goreng |
| U02 | Ayam rebus bumbu kuning, sayur sop | ayam | Nasi putih 150, Ayam rebus bumbu kuning (dada) 85, Sayur sop 200 | 486 | 29,7 | 10,9 | 63,1 | 1 | 20 | – |
| U03 | Ayam panggang sambal hijau, nasi merah, tumis buncis | ayam | Nasi merah 150, Ayam panggang sambal hijau (dada) 100, Tumis buncis 80 | 518 | 24,6 | 15,6 | 64,6 | 3,3 | 27 | – |
| U04 | Ayam bakar kecap, sayur bening, tempe bakar | ayam | Nasi putih 150, Ayam bakar kecap (dada) 85, Sayur bening bayam 150, Tempe bakar kecap 55 | 616 | 38,1 | 15,4 | 76,6 | 1 | 23 | manis |
| U05 | Pepes ayam, tumis kangkung, lalap | ayam | Nasi putih 150, Pepes ayam (dada) 100, Tumis kangkung 80, Ketimun 50 | 499 | 29,7 | 10,3 | 66,7 | 2,5 | 18 | – |
| U06 | Soto ayam bening, nasi, tempe bacem | ayam | Nasi putih 100, Soto ayam bening (tanpa nasi) 350, Tempe bacem (tidak digoreng) 55, Ketimun 50 | 526 | 34,5 | 13,6 | 66,7 | 1,8 | 23 | manis |
| U07 | Sop ayam sayur, nasi, tahu bacem | ayam | Nasi putih 100, Sop ayam sayur 350, Tahu bacem 50, Tomat 50 | 435 | 27,6 | 9,9 | 56,4 | 2,4 | 20 | manis |
| U08 | Bakso ayam kuah dengan mi | ayam | Mi basah 100, Bakso ayam kuah (tanpa mi) 330, Sawi hijau 50 | 280 | 15,9 | 10,7 | 26,9 | 2 | 34 | – |
| U09 | Bakso sapi kuah dengan bihun | sapi | Bihun (mentah) 30, Bakso sapi kuah (tanpa mi) 330, Sawi hijau 50 | 274 | 14,8 | 7,4 | 34,6 | 2,3 | 24 | – |
| U10 | Pepes ikan kembung, sayur asem, sambal, lalap | kembung | Nasi putih 150, Pepes ikan kembung 100, Sayur asem 200, Sambal terasi 10, Ketimun 50 | 489 | 25,2 | 5,8 | 78,3 | 2,9 | 11 | asin |
| U11 | Nila bakar kecap, sayur bening, sambal | nila | Nasi putih 150, Nila bakar kecap 100, Sayur bening bayam 150, Sambal terasi 10 | 455 | 28,2 | 4,8 | 69,2 | 0,5 | 9 | asin |
| U12 | Sup ikan nila, nasi, tumis labu siam | nila | Nasi putih 150, Sup ikan nila 300, Tumis labu siam 80 | 453 | 24,8 | 7 | 68,8 | 1,7 | 14 | – |
| U13 | Bandeng pindang, tumis kangkung, tempe bacem | bandeng | Nasi putih 150, Bandeng pindang 80, Tumis kangkung 100, Tempe bacem (tidak digoreng) 55 | 603 | 38,3 | 13,7 | 78,9 | 3 | 20 | manis |
| U14 | Lele bakar, sayur bening, sambal, lalap | lele | Nasi putih 150, Lele bakar 95, Sayur bening bayam 150, Sambal terasi 10, Ketimun 50 | 473 | 27,2 | 5,9 | 71,2 | 0,7 | 11 | asin |
| U15 | Mujair bakar, botok tahu, lalap | mujair | Nasi putih 150, Mujair bakar 100, Botok tahu 100, Ketimun 50 | 561 | 30,6 | 12,5 | 72,4 | 5,5 | 20 | santan |
| U16 | Pepes tongkol, capcay kuah | tongkol | Nasi putih 150, Pepes tongkol 100, Capcay kuah 180 | 474 | 18,7 | 6,8 | 80,5 | 3,6 | 13 | – |
| U17 | Sop daging, nasi, tahu bacem, sambal | sapi | Nasi putih 150, Sop daging sapi 250, Tahu bacem 50, Sambal terasi 10, Tumis kangkung 80 | 515 | 26,6 | 6,9 | 81,6 | ≥2,1 | 12 | asin, manis |
| U18 | Semur daging, sayur bening, tahu bacem | sapi | Nasi putih 150, Semur daging 75, Sayur bening bayam 150, Tahu bacem 50 | 611 | 25,3 | 19,7 | 75,2 | 0,3 | 29 | asin, manis |
| U19 | Opor ayam, urap | ayam | Nasi putih 150, Opor ayam 100, Urap sayur 100 | 661 | 18,5 | 31,5 | 69,7 | 1,3 | 43 | santan |
| U20 | Garang asem ayam, sayur bening | ayam | Nasi putih 150, Garang asem ayam 100, Sayur bening bayam 150 | 573 | 17,5 | 22,5 | 67,7 | 0,3 | 35 | santan |
| U21 | Sayur lodeh, pindang telur, tempe bakar | telur | Nasi putih 150, Pindang telur 55, Sayur lodeh 150, Tempe bakar kecap 55 | 715 | 26,3 | 30,4 | 78,9 | 4 | 38 | asin, santan |
| U22 | Pepes tahu, oseng tempe kacang panjang, sayur asem | tahu | Nasi merah 150, Pepes tahu 120, Oseng tempe kacang panjang 100, Sayur asem 200 | 543 | 28,8 | 17,3 | 69,4 | 3,9 | 29 | – |
| U23 | Lotek, nasi, telur rebus | telur | Nasi putih 100, Telur rebus 55, Lotek 200 | 580 | 22,2 | 20,7 | 66,9 | 4,2 | 32 | – |
| U24 | Telur balado, tumis sawi putih | telur | Nasi putih 150, Telur balado 60, Tumis sawi putih 80 | 497 | 13,1 | 17,5 | 66,3 | 1,1 | 32 | goreng |
| U25 | Ayam goreng dada, sayur asem, sambal, lalap | ayam | Nasi putih 150, Ayam goreng (dada) 80, Sayur asem 200, Sambal terasi 10, Ketimun 50 | 538 | 36,5 | 9 | 72,9 | 1,9 | 15 | asin, goreng |
| U26 | Pepes bandeng, sayur sop, lalap | bandeng | Nasi putih 150, Pepes bandeng 100, Sayur sop 200, Ketimun 50 | 463 | 24,2 | 9,5 | 65,4 | 2,1 | 19 | – |
| U27 | Ikan kembung bakar, tumis wortel, sambal hijau | kembung | Nasi putih 150, Ikan kembung bakar 80, Tumis wortel 80, Sambal hijau 15 | 481 | 22,4 | 8,7 | 71,6 | 2,8 | 16 | – |
| U28 | Pepes teri, tumis brokoli, tahu bacem | teri | Nasi putih 150, Pepes teri 75, Tumis brokoli 80, Tahu bacem 50 | 465 | 18,6 | 7,2 | 72,5 | 2,7 | 14 | manis |
| U29 | Nila pindang, tumis brokoli | nila | Nasi putih 150, Nila pindang 100, Tumis brokoli 80 | 453 | 30,1 | 4,7 | 65,3 | 1,9 | 9 | asin |
| U30 | Sup ikan kakap, nasi, tempe bakar | kakap | Nasi putih 150, Sup ikan kakap 250, Tempe bakar kecap 55, Tumis kangkung 80 | 622 | 42,6 | 12,6 | 76,7 | 2,6 | 18 | – |

### Camilan (camilan malam Ramadan)

| Kode | Paket | Lauk | Isi porsi dasar (g) | kkal | P | L | KH | Serat | Lemak % | Tag |
|---|---|---|---|---|---|---|---|---|---|---|
| C01 | Ubi rebus dan telur rebus | telur | Ubi jalar rebus 100, Telur rebus 55 | 163 | 8,5 | 4,4 | 21,1 | ≥0 | 24 | – |
| C02 | Singkong kukus dan tahu bacem | tahu | Singkong kukus 100, Tahu bacem 50 | 204 | 6,2 | 2,3 | 38,4 | 1,3 | 10 | manis |
| C03 | Roti gandum dan telur rebus | telur | Roti gandum 30, Telur rebus 55 | 156 | 11,1 | 5,4 | 15,1 | ≥0 | 31 | – |
| C04 | Pisang dan yoghurt | susu | Pisang ambon 80, Yoghurt 125 | 151 | 4,9 | 3,8 | 24,4 | 1,5 | 22 | – |
| C05 | Jagung rebus dan kedelai rebus | kedelai | Jagung manis muda 100, Kacang kedelai rebus 50 | 242 | 15,2 | 4,8 | 37,9 | 2,1 | 18 | – |

Paket bertanda santan (U19 opor, U20 garang asem, U21 lodeh, U15 botok, S08 nasi uduk) dan gorengan (U01, U24, U25) tetap ada karena itu masakan rumahan biasa, tetapi dibatasi aturan harian dan mingguan. Paket yang jadi andalan untuk klien fitness: pepes, pindang, bakar, sop bening, ayam rebus/panggang.

## Data panganku yang dipakai

Per 100 g, dari halaman panganku.org (diambil November 2026). Kolom asal/keterangan di panganku kosong; angka makro dibulatkan ke bawah oleh situsnya.

| Kode panganku | Nama di XNK | Nama di panganku | kkal | P | L | KH | Serat | Na mg (per 100 g) |
|---|---|---|---|---|---|---|---|---|
| FP0122 | Dada ayam rebus | Ayam, daging, bagian dada, rebus | 193 | 28 | 8 | 0 | 0 | 80 |
| FP0120 | Dada ayam bakar | Ayam, daging, bagian dada, bakar | 234 | 23 | 13 | 6 | 0 | 298 |
| FP0146 | Bakso ayam | Bakso ayam | 196 | 18 | 7 | 12 | 0 | 676 |
| FP0149 | Bakso sapi | Bakso sapi | 166 | 15 | 7 | 8 | 0 | 692 |
| FP0456 | Opor ayam | Opor | 308 | 12 | 27 | 3 | 0 | 233 |
| FP0449 | Ayam kecap | Ayam kecap | 301 | 16 | 24 | 4 | 0 | 742 |
| FP0453 | Garang asem ayam | Garang asem | 268 | 13 | 22 | 2 | 0 | 221 |
| FP0467 | Semur daging | Semur daging | 341 | 21 | 23 | 10 | 0 | 1.345 |
| FP0074 | Soto bandung (kuah, tanpa nasi) | Soto bandung, masakan | 42 | 3 | 1 | 2 | 0 | 253 |
| FP0079 | Soto madura (kuah, tanpa nasi) | Soto madura, masakan | 60 | 3 | 4 | 1 | 0 | 76 |
| GR0164 | Ikan nila (mentah) | Ikan nila/kamboja/nila merah, segar | 87 | 19 | 1 | 0 | 0 | 87 |
| GR0312 | Ikan lele (mentah) | Lele, segar | 112 | 20 | 2 | 2 | 0 | 108 |
| GR0212 | Nila pindang | Ikan nila pindang | 113 | 24 | 1 | 0 | 0 | 839 |
| GR0107 | Bandeng pindang | Ikan bandeng pindang | 157 | 25 | 6 | 0 | 0 | 104 |
| GP0111 | Bandeng bakar | Bandeng, ikan, bakar | 149 | 19 | 5 | 4 | 1 | 443 |
| GP0113 | Pepes bandeng | Bandeng, ikan, pepes | 135 | 17 | 5 | 3 | 1 | 385 |
| GP1221 | Ikan kembung bakar | Kembung (oci), ikan, bakar | 161 | 21 | 5 | 6 | 1 | 176 |
| GP1223 | Pepes ikan kembung | Kembung (oci), ikan, pepes | 148 | 19 | 4 | 6 | 1 | 124 |
| GP1295 | Mujair bakar | Mujahir, ikan, bakar | 104 | 16 | 2 | 3 | 1 | 398 |
| GP1408 | Pepes tongkol | Tongkol, segar, ikan, pepes | 116 | 12 | 2 | 10 | 1 | 490 |
| GP1068 | Pepes teri | Ikan seribu/ikan teri segar, pepes | 99 | 10 | 2 | 7 | 1 | 320 |
| GP0963 | Pepes ikan peda | Ikan peda, pepes | 106 | 11 | 3 | 7 | 1 | 635 |
| GP1481 | Sup ikan kakap | Sup ikan kakap merah | 67 | 10 | 1 | 2 | 0 | 448 |
| HP0022 | Telur rebus | Telur ayam ras, rebus | 138 | 13 | 8 | 2 | 0 | 139 |
| HP0052 | Pindang telur | Pindang telur | 144 | 12 | 10 | 0 | 0 | 886 |
| HP0054 | Telur balado | Telur balado | 284 | 13 | 23 | 3 | 0 | 326 |
| CP0211 | Tahu bacem | Tahu bacem | 101 | 10 | 4 | 4 | 0 | 154 |
| CP0202 | Botok tahu | Botok tahu | 183 | 10 | 10 | 9 | 4 | 292 |
| DP0663 | Sayur bening bayam | Sayur bening bayam | 23 | 0 | 0 | 4 | 0 | 141 |
| DP0665 | Sayur lodeh | Sayur lodeh | 163 | 3 | 12 | 8 | 2 | 89 |
| DP0662 | Lotek | Lotek | 162 | 6 | 8 | 13 | 2 | 45 |
| DP0644 | Urap sayur | Urap sayuran | 83 | 2 | 4 | 7 | 1 | 24 |
| DP0457 | Kol rebus | Kol merah, kol putih, rebus | 29 | 1 | 0 | 5 | 1 | 26 |
| DP0419 | Tumis kangkung | Kangkung, tumis | 79 | 3 | 4 | 6 | 2 | 143 |
| DP0095 | Tumis buncis | Buncis, tumis | 96 | 2 | 4 | 10 | 2 | 388 |
| DP0090 | Tumis brokoli | Brokoli, tumis | 88 | 2 | 4 | 7 | 2 | 400 |
| DP0494 | Tumis labu siam | Labu siam/gambas, tumis | 82 | 1 | 4 | 8 | 1 | 385 |
| DP0566 | Tumis sawi putih | Sawi putih/pecai, tumis | 71 | 1 | 4 | 6 | 1 | 270 |
| DP0645 | Tumis wortel | Wortel, tumis | 74 | 1 | 4 | 6 | 1 | 385 |
| NP0150 | Sambal terasi | Sambal/sambal terasi | 92 | 2 | 0 | 19 | 2 | 1.340 |
| NP0177 | Sambal hijau | Sambal hijau | 152 | 2 | 7 | 15 | 6 | 667 |
| NR0077 | Garam | Garam | 0 | 0 | 0 | 0 | 0 | 38.758 |

## Menambah atau mengubah menu

1. Ubah `tools/foods-curated.json` (bagian `resep`, `rujukan`, `paket`, `tag`). Bahan resep boleh baris TKPI 2020 mana pun (tidak harus ada di daftar kurasi) atau baris `rujukan`.
2. Jalankan `node apps-script/pt-scheduler/tools/build-foods.js <tkpi.txt>` (teks PDF TKPI 2020; tanpa itu build tidak bisa jalan). Jangan edit `foods/foods.min.json` dan `src/NutrisiData.gs` dengan tangan.
3. `node --test apps-script/pt-scheduler/tests/foods.test.js apps-script/pt-scheduler/tests/nutrition-menu.test.js`.
4. Perbarui tabel di dokumen ini.

## Belum dikerjakan

- Pengecekan resep oleh ahli gizi (gram bahan adalah resep rumahan XNK).
- Natrium banyak baris masakan TKPI tampaknya belum termasuk garam dapur (sayur asem 16 mg/100 g); di paket ditampilkan apa adanya.
- Serat hari contoh masih di bawah AKG 25–37 g; paket menambah sayur, tetapi data serat masakan TKPI sering 0.
- Coach belum bisa memilih atau mengunci paket untuk klien (bisa menyusul).
