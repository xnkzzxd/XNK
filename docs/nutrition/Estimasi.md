# Gizi — menu jadi estimasi (untuk dicek owner)

Angka di bawah **perkiraan Claude, bukan dari TKPI**. Cek tiap baris (per porsi) dan koreksi bila beda dengan kenyataan di tempatmu; koreksi dilakukan di `apps-script/pt-scheduler/tools/foods-curated.json` (bagian `estimasi`), lalu bangun ulang dengan `tools/build-foods.js`. Di aplikasi, item ini diberi tanda "estimasi".

| Kode | Menu | Porsi | Kkal | Protein g | Lemak g | Karbo g | Harga (1-3) | Alergen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E01 | Nasi goreng | 1 piring (250 g) | 480 | 12 | 16 | 70 | 1 | telur |
| E02 | Nasi uduk | 1 porsi (200 g) | 330 | 6 | 12 | 50 | 1 | - |
| E03 | Nasi kuning | 1 porsi (200 g) | 300 | 5 | 8 | 52 | 1 | - |
| E04 | Nasi padang (nasi, rendang, sayur, sambal) | 1 bungkus (400 g) | 752 | 30 | 35.2 | 80 | 3 | - |
| E05 | Lontong sayur | 1 mangkuk (300 g) | 330 | 8.1 | 12 | 48 | 1 | telur |
| E06 | Bubur ayam | 1 mangkuk (300 g) | 300 | 12 | 9 | 42 | 1 | - |
| E07 | Ketoprak | 1 porsi (300 g) | 381 | 14.1 | 18 | 39.9 | 1 | telur, kacang |
| E08 | Pecel sayur | 1 porsi (200 g) | 220 | 9 | 10 | 25 | 1 | kacang |
| E09 | Soto ayam (tanpa nasi) | 1 mangkuk (300 g) | 201 | 15.9 | 8.1 | 14.1 | 2 | - |
| E10 | Bakso sapi dengan mi | 1 mangkuk (350 g) | 382 | 20 | 11.9 | 45.2 | 2 | - |
| E11 | Sate ayam bumbu kacang | 10 tusuk (150 g) | 330 | 28.1 | 18 | 12 | 2 | kacang |
| E12 | Ayam bakar | 1 potong (100 g) | 190 | 25 | 9 | 2 | 2 | - |
| E13 | Ayam geprek (tanpa nasi) | 1 porsi (150 g) | 380 | 24 | 26 | 12 | 2 | telur |
| E14 | Gulai ayam | 1 porsi (150 g) | 251 | 18 | 17 | 6 | 2 | - |
| E15 | Opor ayam | 1 porsi (150 g) | 281 | 20 | 20 | 5 | 2 | - |
| E16 | Lele goreng | 1 ekor (100 g) | 250 | 20 | 18 | 2 | 1 | seafood |
| E17 | Nila bakar | 1 ekor (150 g) | 200 | 30 | 8 | 0 | 2 | seafood |
| E18 | Pecel lele (lele goreng, lalap, sambal) | 1 porsi (200 g) | 300 | 25 | 19 | 5 | 1 | seafood |
| E19 | Tempe mendoan | 1 buah (30 g) | 80 | 3 | 5 | 6 | 1 | - |
| E20 | Tahu isi (gorengan) | 1 buah (40 g) | 110 | 4 | 7 | 8 | 1 | - |
| E21 | Pisang goreng | 1 buah (50 g) | 140 | 1 | 6 | 22 | 1 | - |
| E22 | Risoles | 1 buah (60 g) | 170 | 4 | 9 | 18 | 1 | telur, susu (laktosa) |
| E23 | Martabak telur | 1 potong (100 g) | 240 | 10 | 15 | 15 | 2 | telur |
| E24 | Siomay dengan saus kacang | 4 buah (150 g) | 300 | 15 | 10.1 | 35 | 2 | telur, seafood, kacang |
| E25 | Batagor | 5 buah (150 g) | 350 | 16.1 | 18 | 30 | 2 | telur, seafood |
| E26 | Kopi susu gula aren | 1 gelas (250 g) | 150 | 4 | 5 | 22 | 2 | susu (laktosa) |
| E27 | Teh manis | 1 gelas (250 g) | 80 | 0 | 0 | 20 | 1 | - |
| E28 | Kopi hitam tanpa gula | 1 cangkir (200 g) | 6 | 0 | 0 | 1 | 1 | - |
| E29 | Susu cokelat kotak | 1 kotak (200 g) | 150 | 6 | 4 | 22 | 2 | susu (laktosa) |
| E30 | Jus jeruk tanpa gula | 1 gelas (250 g) | 110 | 2 | 0 | 26 | 2 | - |
| E31 | Jus alpukat | 1 gelas (250 g) | 300 | 4 | 18 | 28 | 2 | susu (laktosa) |
| E32 | Es campur | 1 mangkuk (300 g) | 201 | 2.1 | 3 | 44.1 | 2 | susu (laktosa) |
| E33 | Roti bakar cokelat | 2 lembar (100 g) | 300 | 7 | 9 | 48 | 1 | telur, susu (laktosa) |
| E34 | Roti isi telur (sandwich) | 1 buah (120 g) | 280 | 12 | 12 | 30 | 2 | telur |
| E35 | Oatmeal dimasak dengan air | 1 mangkuk (200 g) | 150 | 5 | 3 | 27 | 2 | - |
| E36 | Dada ayam tanpa kulit rebus | 100 g (100 g) | 165 | 31 | 4 | 0 | 2 | - |
| E37 | Telur rebus | 1 butir (55 g) | 78 | 6 | 5 | 1 | 1 | telur |
| E38 | Nasi merah matang | 1 centong (100 g) | 111 | 3 | 1 | 23 | 2 | - |
| E39 | Tuna kaleng dalam air | 1 kaleng (100 g) | 116 | 26 | 1 | 0 | 2 | seafood |
| E40 | Salmon panggang | 1 potong (100 g) | 206 | 22 | 12 | 0 | 3 | seafood |
| E41 | Roti gandum | 1 lembar (30 g) | 80 | 4 | 1 | 14 | 2 | - |
| E42 | Brokoli rebus | 1 mangkuk (100 g) | 35 | 2 | 0 | 7 | 2 | - |
| E43 | Almond | 1 genggam (30 g) | 175 | 6 | 15 | 6 | 3 | kacang |
| E44 | Mi instan goreng | 1 bungkus (85 g) | 380 | 8 | 14 | 56 | 1 | - |
| E45 | Bubur kacang hijau | 1 mangkuk (200 g) | 240 | 6 | 5 | 44 | 1 | - |
| E46 | Kolak pisang | 1 mangkuk (200 g) | 260 | 2 | 7 | 48 | 1 | - |
| E47 | Ubi jalar rebus | 1 buah sedang (150 g) | 131 | 2 | 0 | 30 | 1 | - |
| E48 | Nasi putih tambah (1 piring penuh) | 1 piring penuh (300 g) | 390 | 6.9 | 0.9 | 86.1 | 1 | - |
| E49 | Telur mata sapi | 1 butir (60 g) | 110 | 7 | 9 | 0 | 1 | telur |
| E50 | Tahu bacem | 1 buah (50 g) | 100 | 6 | 5 | 8 | 1 | - |

Catatan: serat, kalsium, zat besi, dan natrium tidak diisi untuk menu estimasi. Nilai mikro bahan TKPI yang tampak bergeser di PDF sengaja dikosongkan (8 dari 120 bahan).
