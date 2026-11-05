# Otot per gerakan gym (Fase U)

Otot **utama** (dihitung 1 set) dan **pendukung** (dihitung 0,5 set, aturan 5 di [Rules.md](Rules.md) / Pelland 2026, PMID 41343037).
Nama otot = otot target pustaka (`t`). Semua sumber dari PubMed (studi EMG / MRI). Untuk dua mesin gym yang tidak punya studi persis, dipakai studi gerakan dengan pola dan jenis beban yang sama (dicatat di kolom Sumber).
Data yang sama dipakai kode di `MM_BY_EX` (App.html) dan nanti di katalog `GymExercises`.

| Gerakan | ID | Utama | Pendukung | Sumber |
|---|---|---|---|---|
| Incline Push Up | 0493 | pectorals | delts, triceps, abs | Calatayud 2014, Phys Sportsmed 42:106, PMID 25419894 (pektoral, deltoid anterior, triseps, perut); Calatayud 2015, J Strength Cond Res 29:246, PMID 24983847 |
| Lat Pulldown (Cable) | 2330 | lats | upper back, biceps, delts | Lusk 2010, J Strength Cond Res 24:1895, PMID 20543740 (latissimus, trapezius tengah, biseps); Andersen 2014, J Strength Cond Res 28:1135, PMID 24662157 (+ infraspinatus); Signorile 2002, J Strength Cond Res 16:539, PMID 12423182 (deltoid posterior, teres major) |
| Leg Press (45°) | 0739 | quads | glutes, adductors | Kinoshita 2026, Med Sci Sports Exerc 58:1566, PMID 41630124, doi:10.1249/MSS.0000000000003957 (MRI 12 minggu pada pemula: vasti tumbuh, gluteus maximus +15 %, adductor magnus +6 %, rectus femoris hampir tidak); Augustsson 2003, J Strength Cond Res 17:411, PMID 12741886; Stien 2021, J Sports Sci Med 20:56, PMID 33707987 |
| Squat (Machine) | gym | quads | glutes, adductors | Evans 2019, J Strength Cond Res 33:S52, PMID 28595237 (squat di mesin/belt squat: quadriceps setara back squat, gluteus maximus sedikit lebih rendah); Neto 2020 (systematic review), J Sports Sci Med 19:195, PMID 32132843 (belt squat termasuk aktivasi gluteus maximus sangat tinggi); Delgado 2019, PMID 31356511. Catatan: studi memakai belt squat, mesin gym XNK = lever squat bersandar — pola dan beban mesin sama |
| Hip Thrust (Machine) | gym | glutes | hamstrings | Neto 2020, PMID 32132843 (semua varian hip thrust — barbel, band, rotasi — ≥ 60 % MVIC gluteus maximus); Williams 2021, J Strength Cond Res 35:16, PMID 33332802 (gluteus maximus hip thrust > back squat dan split squat); Delgado 2019, PMID 31356511 (+ biceps femoris) |
| Leg Extension (Machine) | 0585 | quads | — | Kinoshita 2026, PMID 41630124 (knee extension menumbuhkan rectus femoris +13 %, leg press tidak; alasan isolasi ini tetap dipakai); Stien 2021, PMID 33707987 |
| Seated Cable Row | 0861 | upper back | lats, biceps, delts | Fujita 2020, Percept Mot Skills 127:925, PMID 32448047, doi:10.1177/0031512520926369 (seated row: latissimus, teres major, biceps, deltoid posterior); dos Anjos 2024, Appl Psychophysiol Biofeedback 49:577, PMID 39177899 (trapezius tiga bagian) |
| Chest Fly (Machine) | 0596 | pectorals | delts | Solstad 2020, J Sports Sci Med 19:645, PMID 33239937 (fly: pektoral + deltoid anterior, triseps jauh lebih rendah dari bench press); Bergquist 2018, J Hum Kinet 61:5, PMID 29599855 |

Gerakan lain di pustaka: utama = field `t`; pendukung = peta umum per otot (`MM_SECONDARY`) sampai diberi baris di sini.
