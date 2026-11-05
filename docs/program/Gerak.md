# Gerak — sudut sendi untuk animasi gerakan (Fase U, Rilis 3)

Animasi gerakan buatan sendiri dibangun oleh `tools/build-rig.js` → `figure/rig.min.json`. Tiap pola punya dua posisi
(awal = teregang, akhir = kontraksi) dan 13 frame di antaranya. **Sudut di tabel ini adalah satu-satunya angka gerak yang
dipakai**; `tests/rig.test.js` memeriksa hasil build terhadap tabel ini. Konvensi: lutut / siku 0° = lurus; pinggul / bahu
diukur dari garis badan (bahu 0° = lengan di samping badan, 180° = di atas kepala). Tampak samping, figur menghadap kanan.

Otot utama (gelap) dan pendukung (terang) diambil dari [Otot.md](Otot.md), sama dengan `MM_BY_EX` di App.html.

| Pola | Gerakan | Sudut yang dianimasikan | Sumber |
|---|---|---|---|
| `leg-extension` | Leg Extension (Machine) | Lutut 100° → 30° fleksi | Pedrosa 2021: knee extension "full ROM" = 100°–30° fleksi lutut (RCT, 45 perempuan tidak terlatih). Eur J Sport Sci 22:1250. PMID 33977835, [doi:10.1080/17461391.2021.1927199](https://doi.org/10.1080/17461391.2021.1927199) |
| `leg-press` | Leg Press (45°) | Lutut 100° → 5° fleksi, kaki di kereta 45° | Larsen 2025: leg press lutut ±5–100° sama efektif dengan ROM maksimal (±154°) untuk hipertrofi paha depan. J Sports Sci 43:986. PMID 40113586, [doi:10.1080/02640414.2025.2481534](https://doi.org/10.1080/02640414.2025.2481534) |
| `squat-machine` | Squat (Machine) — lever ala chair squat | Lutut 5° → 100° fleksi, kaki tetap | Rentang lutut sama dengan Larsen 2025 (paha depan); Kubo 2019: squat penuh menambah gluteus maximus dan adduktor lebih banyak daripada setengah squat (MRI). Eur J Appl Physiol 119:1933. PMID 31230110, [doi:10.1007/s00421-019-04181-y](https://doi.org/10.1007/s00421-019-04181-y). Kedalaman lebih dari 100° boleh bila mesin dan lutut klien mengizinkan; animasi memakai batas yang bersumber. |
| `hip-thrust-machine` | Hip Thrust (Machine) | Pinggul ±73° fleksi → 0° (ekstensi penuh di atas); punggung atas di bangku, kaki tetap | McCurdy 2021: aktivasi gluteus maximus dan hamstring tertinggi di posisi atas hip thrust. J Strength Cond Res 35:1201. PMID 33900255, [doi:10.1519/JSC.0000000000004035](https://doi.org/10.1519/JSC.0000000000004035). Sudut bawah tidak diberi angka oleh studi; ditentukan oleh tinggi bangku dan kaki (hasil hitung, bukan target). |
| `lat-pulldown` | Lat Pulldown (Cable) | Bahu ±163° (lengan di atas kepala) → siku turun di samping badan; bar lewat depan kepala ke dada atas | Di Fonza 2026 (narrative review EMG): jalur bar di depan (anterior) paling konsisten memberi aktivasi latissimus lebih tinggi; lebar pegangan tidak konsisten. J Funct Morphol Kinesiol 11:315. PMID 42647355, [doi:10.3390/jfmk11030315](https://doi.org/10.3390/jfmk11030315) |
| `seated-cable-row` | Seated Cable Row | Bahu ±90° (lengan lurus ke depan) → ekstensi di belakang badan, siku rapat ke badan | Di Fonza 2026: pegangan sempit dan abduksi bahu rendah masing-masing memberi aktivasi latissimus lebih tinggi pada seated row (sumber di atas) |
| `chest-fly-machine` | Chest Fly (Machine) | Lengan setinggi bahu, siku sedikit tekuk (15°, tetap); dari terbuka ke samping sampai pegangan bertemu di depan | Solstad 2020: fly mesin = pektoral + deltoid anterior, triseps jauh lebih rendah dari bench press (siku tidak bekerja). J Sports Sci Med 19:645. PMID 33239937. Gerak di bidang horizontal: di tampak samping lengan dipendekkan sesuai proyeksinya (bukan sudut yang diukur studi). |
| `incline-push-up` | Incline Push Up | Siku 4° (lurus penuh di atas) → 95° (dada dekat bangku); badan lurus, tangan dan kaki tetap | Kang 2019 (meta-analisis push-up plus): push-up di permukaan stabil dengan siku lurus penuh di posisi atas. J Athl Train 54:1156. PMID 31584855, [doi:10.4085/1062-6050-237-18](https://doi.org/10.4085/1062-6050-237-18). Sudut bawah = dada menyentuh / dekat bangku (definisi gerakan). |

### Pola tambahan (T-1612, level pemula)

| Pola | Gerakan | Sudut yang dianimasikan | Sumber |
|---|---|---|---|
| `push-up` | Push Up (lantai) | Siku 4° → 95°, badan lurus, tangan dan kaki tetap | Kang 2019 (di atas), sama dengan Incline Push Up |
| `seated-leg-curl` | Seated Leg Curl (Machine) | Duduk, pinggul ±90° fleksi; lutut 10° → 100° fleksi | Maeo 2021: leg curl **duduk** (pinggul fleksi) menumbuhkan hamstring lebih banyak daripada telungkup (+14 % vs +9 %, MRI, 12 minggu). Med Sci Sports Exerc 53:825. PMID 33009197, [doi:10.1249/MSS.0000000000002523](https://doi.org/10.1249/MSS.0000000000002523). Rentang lutut 10°–100° = batas mesin pada gambar, bukan angka studi. |
| `bicep-curl-cable` | Bicep Curl (Cable) | Siku 0° → 135° (ROM penuh), lengan atas di samping badan | Pedrosa 2023: ROM penuh arm curl = 0°–135° (0° = siku lurus). Sports 11:39. PMID 36828324, [doi:10.3390/sports11020039](https://doi.org/10.3390/sports11020039). Sudut bahu (fleksi ±50° vs ekstensi) tidak mengubah hipertrofi / kekuatan: Attarieh 2025, Eur J Sport Sci 25:e12279, PMID 40082069, [doi:10.1002/ejsc.12279](https://doi.org/10.1002/ejsc.12279) — jadi lengan atas digambar lurus ke bawah. |
| `triceps-pushdown` | Triceps Pushdown (Cable) | Siku 90° → 0°, lengan atas di samping badan (posisi netral) | Maeo 2022: elbow extension 90°–0° dengan kabel, posisi lengan netral (dan overhead). Eur J Sport Sci 23:1240. PMID 35819335, [doi:10.1080/17461391.2022.2100279](https://doi.org/10.1080/17461391.2022.2100279). Catatan studi yang sama: posisi overhead memberi hipertrofi triseps 1,4× lebih besar — bila owner menambah Overhead Triceps Extension ke katalog, pola baru dibuat. |
| `calf-raise-machine` | Standing Calf Raise (Machine) | Pergelangan kaki −25° (dorsofleksi) → +25° (plantarfleksi), ujung kaki tetap di pijakan | Kassiano 2023: calf raise ROM penuh −25° … +25° (0° = kaki 90° terhadap tibia). J Strength Cond Res 37:1746. PMID 37015016, [doi:10.1519/JSC.0000000000004460](https://doi.org/10.1519/JSC.0000000000004460) |
| `goblet-squat` | Goblet Squat (Dumbbell) | Lutut 5° → 100°, kaki tetap, beban di depan dada | Rentang sama dengan Squat (Machine): Larsen 2025, Kubo 2019 (di atas) |
| `seated-cable-row` | Seated Row (Machine) | Sama dengan Seated Cable Row (pola tarik horizontal yang sama) | Di Fonza 2026 (di atas) |

Otot utama / pendukung pola tambahan = kolom `Otot Utama` / `Otot Pendukung` katalog gym (`src/LatihanKatalog.gs`), diuji di `tests/rig.test.js`.

**Belum dianimasikan (butuh sumber atau tampak depan):** Romanian Deadlift, Chest Press (Machine), Bench Press (Dumbbell), Shoulder Press (Machine), Bent Over Row (Dumbbell), Lateral Raise dan Hip Abduction (gerak di bidang frontal, butuh tampak depan), Dead Bug, Treadmill, Stationary Bike. Gerakan itu tetap memakai GIF pustaka.

## Yang bukan dari studi (dicatat terus terang)
- Bentuk figur (kapsul sederhana), panjang ruas, dan bentuk alat adalah gambar kita sendiri, netral, tanpa merek, tidak meniru gambar mana pun.
- Posisi badan yang tidak diatur studi (sandaran kursi, condong badan pada squat mesin, posisi tangan memegang pegangan) dipilih agar gerakan terbaca; tidak dipakai sebagai aturan latihan.
- Tempo animasi 1,7 detik per arah hanya untuk tampilan. Tempo latihan bebas (Rules.md, Schoenfeld 2015).

## Pola berikutnya (T-1612b)
Hinge / RDL, bench / chest press, overhead press, dumbbell row, lateral raise dan hip abduction (tampak depan), dead bug,
treadmill, sepeda. Tiap pola baru butuh baris di tabel ini dengan sumber sebelum dianimasikan.
