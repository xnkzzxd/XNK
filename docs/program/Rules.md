# Program otomatis — aturan (Rules)

Aturan inilah yang dibaca kode (`src/ProgramGen.gs`, konstanta `PGEN`, Rilis 2). Ubah di sini dan di konstanta sekaligus.
Status: **semua aturan bersumber** (PubMed PMID/DOI di daftar rujukan). Yang bukan dari jurnal ditulis terang sebagai *keputusan owner*, bukan ⚠.
Otot per gerakan: [Otot.md](Otot.md).

**Penutupan sumber (2026-11-05):**
- **Volume 6–8 / 8–12 / 12–20 set/otot/minggu**: batas menengah 12–20 = rentang optimal pada orang terlatih ≥ 1 tahun [R] (> 20 tidak lebih baik untuk paha depan dan biseps). Hasil naik dengan volume dengan *diminishing returns* [L], dan kelompok 5–9 set sudah lebih baik dari < 5 [B] → batas pemula banget dan pemula berada di bagian kurva dengan hasil per set terbesar. Angka pastinya = keputusan owner di dalam rentang bukti.
- **Ambang blok / naik level** (aturan 9): tidak memakai angka kehadiran atau lama bulan (tidak ada sumbernya). Blok berikut = volume tercatat rata-rata mencapai batas bawah level; naik level = volume sudah di batas atas level **dan** ada progresi beban dengan Form OK (aturan 9a).
- **Kembali setelah absen**: aturan 22, dari [S] dan [T].
- **Kehamilan**: ACOG Committee Opinion 804 [U]. Teks penuh tidak bisa dibuka dari sesi ini; rincian modifikasi (posisi telentang, risiko jatuh/benturan, intensitas "masih bisa bicara") wajib dicek owner/bidan sebelum dipakai di UI.
- **Tempo**: [V].
- **APKI / ISSA**: dicari, tidak ada dokumen publik resmi (ISSA = bahan kursus berbayar; APKI tidak menerbitkan standar program latihan yang bisa dikutip). **Tidak dipakai sebagai sumber angka.** Bila owner mengunggah modulnya ke Drive, ditambahkan di sini.
- **ACSM Guidelines ed. 11 (buku)**: tidak dapat dibaca dari sesi ini; tidak ada angka yang bergantung padanya. Skrining = [F], aerobik dan lansia = [E] + [P], progresi = [A].

**Tanpa aturan "old school" (keputusan owner).** Aturan yang sudah dibantah meta-analisis baru tidak dipakai, walau ada di ACSM 2009:

| Aturan lama (dibuang) | Pengganti berbasis bukti terbaru |
|---|---|
| Hipertrofi wajib 8–12 rep / 60–70 % 1RM | Hipertrofi serupa pada beban ringan–berat bila set dekat gagal; rentang rep praktis 6–15 (isolasi sampai 20), kekuatan butuh beban lebih berat [H] |
| Istirahat 1–2 menit untuk hipertrofi | > 60 dtk sedikit lebih baik, tidak ada beda di atas ±90 dtk → minimal 90 dtk, compound 2–3 menit [J], [K] |
| "Fat loss = rep tinggi, beban ringan / toning" | Latihan beban sama seperti tujuan otot (menjaga massa otot); lemak turun dari defisit kalori (Fase Gizi) + kardio [I], [E] |
| Tiap otot wajib 2×/minggu, aturan 48 jam | Bila volume sama, frekuensi hampir tidak berpengaruh pada hipertrofi; frekuensi lebih tinggi membantu kekuatan → frekuensi = alat untuk membagi volume, bukan syarat [L], [M] |
| Urutan kaku "otot besar dulu" | Urutan untuk prioritas tujuan/skill (gerakan prioritas di awal), bukan dogma |
| Pemula harus barbel / mesin "kurang efektif" | Mesin dan free weight setara untuk hipertrofi dan kekuatan umum; pilih yang aman dan disukai [N], [O]; lansia: mesin efek terbesar [P] |
| Volume dihitung per gerakan saja | Hitung per otot: set langsung = 1, set tidak langsung (otot pendukung) = 0,5 [L] |
| Wajib latihan sampai gagal / "no pain no gain" | RIR 0–3 cukup; pemula RIR 2–3 untuk teknik [D] |
| Deload terjadwal, periodisasi kaku | Tidak dipakai (tidak ada bukti kuat untuk pemula); naik bertahap berdasar log |

**Hierarki acuan (keputusan owner):**
1. **ACSM** — acuan utama: Position Stand 2009 [A] dan skrining 2015 [F]. **Pengecualian**: angka ACSM 2009 yang dibantah meta-analisis lebih baru (tabel di atas) diganti, sesuai keputusan owner "tanpa aturan old school".
2. **APKI** dan **ISSA** — diminta owner, tetapi tidak ada dokumen publik resmi; tidak dipakai sampai owner mengunggah modulnya.
3. **Jurnal** (PMID) — pendukung: menjelaskan alasan dan mengisi hal yang tidak diatur guideline.

Kolom Sumber berisi kode rujukan di bawah.

**Keputusan owner: aturan wajib dari sumber tertulis.** Tiap angka di `PGEN` harus punya baris di Rules.md dengan sitasi jurnal peer-review / position stand + PMID. Tidak ada baris "praktik umum": angka yang tidak didukung jurnal tidak dipakai. Rujukan (semua dicek di PubMed):

- **[A]** ACSM Position Stand, Progression models in resistance training for healthy adults. Med Sci Sports Exerc 2009;41:687 — PMID 19204579
- **[B]** Schoenfeld, Ogborn, Krieger. Dose-response weekly RT volume & muscle mass. J Sports Sci 2017;35:1073 — PMID 27433992
- **[C]** Schoenfeld, Ogborn, Krieger. Effects of RT frequency on hypertrophy. Sports Med 2016;46:1689 — PMID 27102172
- **[D]** Refalo dkk. Proximity-to-failure & hypertrophy. Sports Med 2023;53:649 — PMID 36334240
- **[E]** Bull dkk. WHO 2020 guidelines on physical activity. Br J Sports Med 2020;54:1451 — PMID 33239350
- **[F]** Riebe dkk. Updating ACSM's exercise preparticipation health screening. Med Sci Sports Exerc 2015;47:2473 — PMID 26473759
- **[G]** Gentil dkk. Single-joint exercise tidak menambah hasil lengan pada pemula yang sudah latihan multi-sendi. Appl Physiol Nutr Metab 2013;38:341 — PMID 23537028
- **[H]** Schoenfeld dkk. Strength & hypertrophy, low- vs high-load. J Strength Cond Res 2017;31:3508 — PMID 28834797
- **[I]** Willis dkk. Aerobic vs resistance vs combined training on body mass & fat mass (STRRIDE AT/RT). J Appl Physiol 2012;113:1831 — PMID 23019316
- **[J]** Singer dkk. Inter-set rest interval & hypertrophy, Bayesian meta-analysis. Front Sports Act Living 2024;6:1429789 — PMID 39205815, doi:10.3389/fspor.2024.1429789
- **[K]** Schoenfeld dkk. Longer inter-set rest periods enhance hypertrophy. J Strength Cond Res 2016;30:1805 — PMID 26605807
- **[L]** Pelland dkk. RT dose response: weekly volume & frequency meta-regressions (set tidak langsung = 0,5). Sports Med 2026;56:481 — PMID 41343037, doi:10.1007/s40279-025-02344-w
- **[M]** Schoenfeld dkk. RT frequency & hypertrophy (volume-equated). J Sports Sci 2019;37:1286 — PMID 30558493
- **[N]** Haugen dkk. Free-weight vs machine training, meta-analysis. BMC Sports Sci Med Rehabil 2023;15:103 — PMID 37582807, doi:10.1186/s13102-023-00713-4
- **[O]** Heidel dkk. Machines vs free weights, meta-analysis. J Sports Med Phys Fitness 2022;62:1061 — PMID 34609100, doi:10.23736/S0022-4707.21.12929-9
- **[Q]** Kassiano dkk. Varying resistance exercises & hypertrophy/strength, systematic review. J Strength Cond Res 2022;36:1753 — PMID 35438660, doi:10.1519/JSC.0000000000004258 (variasi sistematis membantu, rotasi acak/terlalu sering merugikan)
- **[P]** Wiedenmann dkk. RT modalities in older adults, network meta-analysis. Gerontology 2025;71:576 — PMID 40452461, doi:10.1159/000546346
- **[R]** Baz-Valle dkk. Systematic review: volume latihan dan hipertrofi (12–20 set/minggu optimal pada orang terlatih). J Hum Kinet 2022;81:199 — PMID 35291645, doi:10.2478/hukin-2022-0017
- **[S]** Ogasawara dkk. Jeda 3 minggu + latihan lagi vs terus-menerus: hipertrofi setara setelah 24 minggu. Eur J Appl Physiol 2013;113:975 — PMID 23053130, doi:10.1007/s00421-012-2511-9
- **[T]** Halonen dkk. RCT pemula: jeda 10 minggu menurunkan kekuatan dan ukuran otot, kembali cepat dalam 5 minggu latihan. Scand J Med Sci Sports 2024;34:e14739 — PMID 39364857, doi:10.1111/sms.14739
- **[U]** ACOG Committee Opinion 804: Physical Activity and Exercise During Pregnancy and the Postpartum Period. Obstet Gynecol 2020;135:e178 — PMID 32217980, doi:10.1097/AOG.0000000000003772
- **[V]** Schoenfeld dkk. Durasi repetisi 0,5–8 dtk memberi hipertrofi serupa; > 10 dtk lebih buruk. Sports Med 2015;45:577 — PMID 25601394, doi:10.1007/s40279-015-0304-0
- **[W]** Roberts dkk. Perbedaan jenis kelamin dalam latihan beban (hipertrofi setara). J Strength Cond Res 2020;34:1448 — PMID 32218059, doi:10.1519/JSC.0000000000003521

| # | Aturan | Sumber |
|---|---|---|
| 1 | Pengaman: jawaban "ya" di PAR-Q (HealthScreening Q1–Q7), Cedera/Operasi, Obat Rutin, Kondisi Lain, hamil, usia < 18 atau > 65, atau form kesehatan belum diisi → **tetap dibuat, mode ringan**: level dipaksa `pemula-banget`, intensitas ringan–sedang (RIR ≥ 4, rep 12–15), volume batas bawah, tanpa naik level otomatis, banner "Program ringan — konsultasikan dengan coach/dokter" untuk klien dan tanda di hub coach. Tag pantangan gerakan dari coach tetap berlaku. | [F] |
| 2 | Level: `pemula-banget` (< 3 bln latihan beban), `pemula` (3–12 bln), `menengah` (> 1 thn konsisten). Awal dipilih klien (aturan 21); setelah itu naik level lewat aturan 9. | [A] (novice / intermediate) |
| 3 | Frekuensi: **klien pilih 2, 3 atau 4 hari**. 2–3 hari → Full Body (A/B bergantian); 4 hari → Upper/Lower ×2 atau Full Body ×4. Frekuensi hanya cara membagi volume mingguan (aturan 5) agar tiap sesi tidak terlalu panjang; tujuan kekuatan memilih pola yang lebih sering. | [L]; [M]; [C] |
| 4 | **Fokus compound untuk pemula-banget**: tiap sesi = 1 lutut-dominan + 1 pinggul-dominan + 1 dorong + 1 tarik (multi-sendi). Isolasi (Chest Fly, Leg Extension) maksimal 1 per sesi, di akhir, dan hanya bila waktu/volume masih di bawah batas. Bahu, lengan, inti dianggap terlatih tidak langsung oleh compound — **tidak** dilaporkan sebagai celah di level ini. | [A] (multi-sendi diutamakan); [G] |
| 5 | **PRIORITAS #1 — Volume set per otot per minggu** (keputusan owner), dihitung *fractional* (set langsung = 1, otot pendukung = 0,5): **pemula-banget 6–8 · pemula 8–12 · menengah 12–20**. Generator mulai di batas bawah dan naik lewat aturan 9; semua aturan lain (durasi, frekuensi, pilihan gerakan) menyesuaikan diri agar target ini tercapai. **Volume menang atas durasi** (keputusan owner): bila durasi pilihan klien tidak muat untuk batas bawah, sesi dibuat lebih lama dan klien diberi tahu ("Butuh ±45 menit untuk volume minimal"); batas aman 75 menit, di atas itu set dipindah ke hari lain. **Otot dihitung detail** (16 otot target library: pectorals, lats, upper back, traps, delts, biceps, triceps, forearms, abs, spine, quads, glutes, hamstrings, adductors, abductors, calves; `cardiovascular system`, `serratus anterior`, `levator scapulae` tidak dihitung). Target penuh berlaku untuk otot yang punya gerakan **utama** di katalog level itu; otot yang hanya kena sebagai pendukung (mis. biceps dari Lat Pulldown) dihitung tapi tidak memaksa gerakan isolasi di pemula-banget (aturan 4); otot tanpa gerakan sama sekali tampil sebagai info untuk coach. Peta otot pendukung per gerakan ada di katalog (`Otot Pendukung`), disusun berlapis (pilihan owner): (1) field library yang ada (`t` target, `b` bagian tubuh); (2) library otot pendukung terbuka tambahan — T-1601 menilai dataset berlisensi terbuka yang punya `secondaryMuscles` (mis. ExerciseDB/free-exercise-db, cek lisensi dulu) dan menggabungkan lewat `build-exercises.js` ke field `m`; (3) untuk 8 gerakan gym + semua gerakan katalog: otot utama/pendukung dari studi EMG/anatomi di jurnal (dicari lewat PubMed per pola gerakan: leg press, hip thrust, lat pulldown, seated row, push up, chest fly, leg extension, machine squat), dicatat per gerakan di `docs/program/Otot.md` dengan PMID. Lapis 3 menang bila berbeda.
**Rep pemula-banget**: compound 8–12, isolasi 10–15 (keputusan owner, dalam rentang aturan 6).
**Klien lama dengan program coach**: tidak diganti diam-diam; klien melihat kartu "Coba program otomatis" — bila setuju, program coach disalin ke *Rutinitas saya* (`copyRoutineToMine`) lalu program otomatis dibuat. Member `acceptAutoProgram(memberToken)`.
**Unilateral**: volume dihitung **per sisi** (set kiri dan kanan masing-masing 1 set untuk sisi itu; volume otot = rata-rata kedua sisi agar tetap sebanding dengan gerakan bilateral). Katalog dan library mendapat tanda `Unilateral`.
**Dasar hitung volume**: set kerja yang **benar-benar dicatat** di WorkoutLog (tanpa pemanasan, `_isWarmup_`), termasuk sesi PT; program menambah set bila yang tercatat di bawah target.
**Kembali setelah absen**: lihat aturan 22.
**Jenis kelamin**: aturan sama untuk perempuan dan laki-laki (Roberts 2020, J Strength Cond Res 34:1448, PMID 32218059, doi:10.1519/JSC.0000000000003521: hipertrofi dan kekuatan tubuh bawah naik setara). Yang membedakan hanya **otot fokus pilihan klien** di profil (mis. glutes, dada, lengan; MemberData AQ `Otot Fokus`, maks 2): otot fokus mendapat volume di **batas atas** level, otot lain di **batas bawah**, supaya sesi tetap wajar.
Otot fokus dipilih dari **16 otot detail** (label Indonesia + nama Inggris); di pemula-banget otot fokus **boleh** mendapat gerakan isolasi (pengecualian aturan 4, hanya untuk otot fokus).
**Waktu pembuatan**: program dibuat **langsung** setelah klien menyimpan profil (level, tujuan, hari, durasi, fokus); bila form kesehatan belum diisi → mode ringan sampai diisi, lalu dibuat ulang otomatis.
**Tempo**: bebas (durasi rep 0,5–8 dtk memberi hipertrofi serupa — [V]); tempo sangat lambat (> 10 dtk/rep) tidak dipakai; estimasi durasi sesi 3 dtk/rep.
**Bahasa (keputusan owner, pengecualian aturan "UI Indonesia" di Agent.md §4)**: nama gerakan, nama otot, dan petunjuk latihan di logger / program / katalog **Inggris** ("Seated Cable Row", "Upper Back", "Leave 2–3 reps in reserve"). Navigasi, tombol umum, dan pesan error tetap Indonesia. Dicatat di Agent.md §7.
**Gambar gerakan gym tanpa GIF** (Squat (Machine), Hip Thrust (Machine)): **ikon peta otot** kecil (otot utama disorot), bukan GIF mirip — kolom "gambar contoh 0750" di tabel katalog dibuang.
**Peta otot logger**: otot utama gelap, otot pendukung terang (`wlMuscleSvg` mendapat dua tingkat; Theme.html token, bukan warna keras).
**Nama lama**: sheet tidak diubah; saat tampil, nama manual yang cocok alias diganti nama baru.
**Gabung riwayat otomatis**: alias yang cocok (exact setelah normalisasi: huruf kecil, tanpa tanda baca, sinonim alat seperti "cable"/"kabel"/"mesin"→"machine") menyatukan kunci riwayat (`_workoutKey_` → `ex:<id>` / `gym:<id>`) untuk PR, grafik, dan saran beban. Tebakan yang tidak pasti (kata kunci saja) **tidak** digabung otomatis — hanya mengisi otot, dan tampil di daftar Pengaturan untuk dikonfirmasi (lebih aman agar PR tidak tercampur).
**Hamil**: tetap otomatis dalam **mode ringan + aturan kehamilan** ([U]; rincian dicek owner/bidan): intensitas sedang (bisa bicara selama latihan), tanpa gerakan telentang lama setelah trimester 1, tanpa gerakan berisiko jatuh/benturan perut, kardio sedang 150 menit/minggu; banner "konsultasikan dengan dokter/bidan". Tag `hamil` sudah ada di Gizi (`Pantangan Makanan`) dan dipakai juga di sini.
**RIR**: target tampil di logger ("Sisakan 2–3 rep"), tidak dicatat.
**Opt-out klien**: tombol "Matikan otomatis" (member `setMyProgramAuto(memberToken, false)`); program terakhir tetap ada sebagai program biasa (`Sumber` dikosongkan), bisa dinyalakan lagi.
**Gerakan berat badan mentok** (rep + set di batas): progresi lewat varian lebih berat dengan pola sama, berurutan (Incline Push Up → Incline Push Up lebih rendah → Push Up), mengikuti aturan 9b tukar sistematis. Katalog mendapat kolom `Varian Berikut` (gym ID) untuk rantai ini.
**Penjelasan perubahan ke klien**: tiap perubahan otomatis (set/beban naik, tukar, blok baru) punya satu kalimat + sumber singkat, mis. "Set Leg Press naik ke 3: volume paha depan 6 → 7,5 set/minggu (Pelland 2026)"; coach melihat kalimat yang sama. Per sesi ≤ 6 gerakan; > 10 set langsung per otot per sesi dipecah ke hari lain. Mode ringan: batas bawah pemula-banget. | [L]; [B] |
| 9a | **PRIORITAS #1 — Progressive overload dengan form dulu** (keputusan owner). Urutan per gerakan: **rep → set → beban**: (1) rep naik sampai batas atas rentang pada semua set kerja; (2) lalu +1 set, selama volume mingguan otot itu masih di bawah batas atas level (aturan 5); (3) bila set sudah di batas, beban naik (+2,5 kg tubuh atas / +5 kg tubuh bawah, `_workoutSuggest_`) dan rep kembali ke batas bawah. **Gerbang form**: beban hanya boleh naik bila (a) coach sudah menandai gerakan itu *Form OK* di sesi PT, **dan** (b) di latihan sendiri terakhir klien tidak menjawab "ragu" pada "Form terasa rapi?" (ditanya **setelah set terakhir tiap gerakan** di logger, dua tombol Rapi / Ragu, bawaan tidak dijawab = tidak menghalangi). Tanpa gerbang, progresi berhenti di rep dan set. | [A] (progresi beban 2–10 %); [L] (volume) |
| 9b | Stagnan (e1RM dan rep tidak naik 3 sesi berturut pada satu gerakan, form OK): (1) bila volume otot di bawah batas atas → +1 set [L]; (2) bila sudah di batas atas → tukar ke varian dengan pola sama yang memberi rangsangan berbeda (sudut/alat lain), **sistematis, tidak acak, paling sering sekali per blok** [Q]; (3) bila form "ragu" → tanda ke coach, beban tidak naik. Tidak ada reset beban otomatis atau deload (tidak ada bukti kuat untuk pemula). | [L]; [Q] |
| 6 | Rep & usaha: compound 6–12 rep, isolasi 10–20; tujuan kekuatan 3–6 rep pada compound mulai level `pemula`. Usaha diatur dengan RIR, bukan %1RM: pemula-banget RIR 2–3, pemula 1–3, menengah 0–2 pada isolasi; mode ringan RIR ≥ 4. | [H]; [D]; [A] |
| 7 | Istirahat: minimal 90 dtk; compound 2–3 menit; isolasi 90 dtk. Durasi sesi (aturan 14) tidak memotong istirahat di bawah 90 dtk — gerakan yang dipangkas. | [J]; [K] |
| 8 | Urutan: gerakan prioritas tujuan di awal (compound untuk kekuatan/pemula); dorong:tarik seimbang per minggu (volume fractional). | [A]; [L] |
| 9 | Blok 4 minggu (unit tinjauan, bukan periodisasi kaku): di akhir blok, volume mingguan tiap otot naik 1–2 set bila aturan 9a sudah sampai tahap set dan kehadiran baik; naik level bila volume sudah di batas atas level dan ada progresi beban dengan form OK. Tanpa angka kehadiran/bulan: blok berikut bila volume tercatat rata-rata mencapai batas bawah level; naik level bila volume di batas atas + progresi beban dengan Form OK. | [A]; [L] |
| 10 | Pilihan gerakan: hanya dari **katalog gym** (§2), level ≤ level klien, aktif, tidak kena tag pantangan gerakan (mis. `lutut` → tanpa Squat Machine). Slot compound yang tak punya alat di level itu (mulai level `pemula`) dicatat sebagai celah untuk owner. | keputusan owner (alat) |
| 11 | Info ke klien: latihan otot ≥ 2 hari/minggu + 150–300 menit aerobik sedang per minggu. | [E] |
| 13 | Tujuan mengubah program sejak awal (dari MemberData D / Goal Gizi): **kekuatan** → rep rendah pada compound, istirahat 3 menit, frekuensi lebih tinggi; **otot** → volume di ujung atas batas level; **fat loss** → latihan beban **sama seperti tujuan otot** (menjaga massa otot, tanpa "rep tinggi untuk membakar lemak") + blok kardio (aturan 18) + target kalori dari Fase Gizi; **kebugaran** → nilai tengah + kardio. Tujuan tidak pernah melanggar batas level dan mode ringan. | [H]; [L]; [I] + [E] |
| 14 | Durasi sesi: **klien pilih 30 / 45 / 60 menit**. Waktu per set = kerja (≈ 3 dtk/rep) + istirahat aturan 7; gerakan dan set dipangkas dari isolasi dulu, lalu set compound, tapi tidak di bawah 1 set per pola compound. 30 menit pada pemula-banget = 4 compound × 2 set. | [A] (istirahat, urutan) |
| 15 | Beban awal: kolom kg **kosong** di sesi pertama tiap gerakan; petunjuk "pilih beban yang masih sanggup ±3 rep lagi" (RIR sesuai level). Setelah ada log, `_workoutSuggest_` mengisi. | [D]; [A] |
| 16 | Tukar gerakan oleh klien: hanya ke gerakan lain dengan **pola sama**, level ≤ level klien, aktif, tidak kena pantangan. Pilihan disimpan dan dipakai lagi di blok berikut. | aturan 4, 10 |
| 17 | Pemanasan/pendinginan **tidak** ditulis di program (coach yang mengurus). | keputusan owner |
| 18 | Kardio masuk program sesuai tujuan, alat: **Treadmill** dan **Sepeda statis** (gerakan gym `jenis waktu`, katalog `kardio`). Fat loss/kebugaran: blok kardio intensitas sedang di akhir sesi (sisa waktu dari aturan 14), total menuju 150–300 menit/minggu; otot/kekuatan: kardio opsional singkat. Pemula-banget mulai pendek dan naik per blok. | [E]; [I] |
| 19 | Populasi khusus ACSM: **lansia > 65** → mode ringan + gerakan keseimbangan/fungsional dari katalog, intensitas ringan–sedang; **remaja < 18** → mode ringan, teknik dulu, beban ringan, catatan "diawasi coach". | [E]; [P]; [F] |
| 20 | Program otomatis untuk **hari latihan sendiri** saja; sesi PT diatur coach di tempat. "Hari/minggu" yang dipilih klien = hari latihan sendiri. Volume sesi PT yang tercatat di log ikut dihitung di volume mingguan per otot (aturan 5), sehingga hari sendiri mengisi kekurangan, bukan menumpuk. | [L] |
| 21 | Level dipilih **bebas oleh klien** (3 level); mode ringan (aturan 1, 19) tetap memaksa `pemula-banget`. Gerakan berat badan untuk keseimbangan lansia boleh (sit-to-stand, single-leg stand, step-up rendah) dan masuk katalog sebagai `badan`. | keputusan owner; [P] |
| 22 | **Kembali setelah absen ≥ 2 minggu** (tidak ada set tercatat): sesi pertama memakai volume batas bawah level, beban **tidak** dinaikkan otomatis dan kolom kg diisi lewat petunjuk RIR (beban terakhir hanya sebagai referensi); progresi aturan 9a jalan lagi mulai sesi kedua. Absen ≥ 8 minggu: blok mulai dari 1 (volume batas bawah). Tidak ada pemotongan beban persentase tetap (tidak ada sumbernya). | [S]; [T]; [D] |
| 12 | Coach selalu menang: program yang disimpan coach (`Sumber` kosong) tidak pernah ditimpa; coach bisa matikan otomatis per klien. | keputusan owner |
