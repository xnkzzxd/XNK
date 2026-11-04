# Otot per gerakan gym (Fase U)

Otot **utama** (dihitung 1 set) dan **pendukung** (dihitung 0,5 set, aturan 5 di [Rules.md](Rules.md) / Pelland 2026, PMID 41343037).
Nama otot = otot target pustaka (`t`). Sumber dari PubMed (studi EMG); baris ⚠ masih perkiraan anatomi sampai ada studi yang dicek.
Data yang sama dipakai kode di `MM_BY_EX` (App.html) dan nanti di katalog `GymExercises`.

| Gerakan | ID | Utama | Pendukung | Sumber |
|---|---|---|---|---|
| Incline Push Up | 0493 | pectorals | delts, triceps, abs | Calatayud 2014, Phys Sportsmed 42:106, PMID 25419894 (pektoral, deltoid anterior, triseps, perut); Calatayud 2015, J Strength Cond Res 29:246, PMID 24983847 |
| Lat Pulldown (Cable) | 2330 | lats | upper back, biceps, delts | Lusk 2010, J Strength Cond Res 24:1895, PMID 20543740 (latissimus, trapezius tengah, biseps); Andersen 2014, J Strength Cond Res 28:1135, PMID 24662157 (+ infraspinatus); Signorile 2002, J Strength Cond Res 16:539, PMID 12423182 (deltoid posterior, teres major) |
| Leg Press (45°) | 0739 | quads | glutes | Augustsson 2003, J Strength Cond Res 17:411, PMID 12741886 (rectus femoris, vastus lateralis, gluteus maximus) |
| Squat (Machine) | gym | quads | glutes, hamstrings, adductors | Delgado 2019, J Strength Cond Res 33:2595, PMID 31356511 (squat: vastus lateralis + gluteus maximus bersamaan) — ⚠ studinya back squat, bukan mesin |
| Hip Thrust (Machine) | gym | glutes | hamstrings | Delgado 2019, PMID 31356511 (hip thrust: gluteus maximus tertinggi, biceps femoris) — ⚠ studinya barbel |
| Leg Extension (Machine) | 0585 | quads | — | sendi tunggal (ekstensi lutut); Augustsson 2003 memakai knee extension sebagai isolasi paha depan |
| Seated Cable Row | 0861 | upper back | lats, biceps, delts | ⚠ belum ada studi EMG yang dicek |
| Chest Fly (Machine) | 0596 | pectorals | delts | ⚠ belum ada studi EMG yang dicek |

Gerakan lain di pustaka: utama = field `t`; pendukung = peta umum per otot (`MM_SECONDARY`) sampai diberi baris di sini.
