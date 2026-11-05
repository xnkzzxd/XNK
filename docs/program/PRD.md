# Fase U — PRD: program latihan otomatis (berbasis bukti), katalog alat gym, nama gerakan ala Hevy

## Konteks
Sekarang program latihan hanya dibuat manual oleh coach (form `#modal-program`, template, Jelajahi) atau klien (Rutinitas saya). Tidak ada generator, tidak ada data alat gym, dan level pengalaman klien dari form daftar (`LandingScript.html:285`) **dibuang** oleh `registerNewClient`. Library gerakan (`exercises/exercises.min.json`, 1.324 item) punya nama mentah huruf kecil, kadang rusak (`sled 45в° leg press`), dan tidak punya *Squat Machine* / *Hip Thrust Machine*. Gerakan yang diketik manual di log (`WorkoutLog` kolom G kosong, I sering kosong) jatuh ke "Lainnya" di statistik, peta otot dan kartu bagikan.

Keputusan owner (jawaban pertanyaan):
- Daftar yang diberikan = **level "Pemula banget"**; level lain menyusul dari alat yang ada di gym.
- **Otomatis penuh**: program dibuat dan dikirim ke klien tanpa dicek coach.
- Nama gerakan: **Inggris, semua** gerakan, gaya Hevy ("Seated Cable Row", "Leg Press (45°)"). Nama ditulis sendiri mengikuti pola itu, bukan salinan database Hevy.
- Alat yang tidak ada di library jadi **gerakan gym XNK** dengan ID sendiri.

- Hari/minggu 2–4 dan durasi 30/45/60 dipilih klien; tujuan mengubah program sejak awal.
- PAR-Q "ya" / cedera / obat → tetap dibuat, **mode ringan**.
- **Nyala bawaan untuk semua klien.**
- Pemula banget = **fokus compound**; **aturan harus dari jurnal** (PMID), bukan praktik umum, dan **tanpa aturan old school** (tabel di §1).
- Acuan: ACSM (utama), APKI dan ISSA (pendukung), jurnal (pendukung).
- Tanpa pemanasan/pendinginan; kardio sesuai tujuan (treadmill, sepeda statis); aturan populasi khusus ACSM untuk lansia/remaja.
- Beban awal kosong; klien boleh tukar gerakan (pola sama); level dipilih bebas klien; sesi PT tetap diatur coach.
- Pemberitahuan: klien di portal + coach di hub.

Karena otomatis penuh, aturan ketat dan pengaman (PAR-Q, cedera, usia) adalah satu-satunya rem. Pola dokumen meniru Fase P (Gizi): `Rules.md` + konstanta + fungsi murni yang menyebut nomor baris aturan.

Fase **U**, dokumen di `docs/program/` (PRD, Design, Rules, TODO), tugas **T-1600+**. Tambah baris Fase U di `CLAUDE.md`.

---

## 1. Aturan (docs/program/Rules.md → konstanta `PGEN` di `src/ProgramGen.gs`)
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
1. **ACSM** — acuan utama: *ACSM's Guidelines for Exercise Testing and Prescription* (edisi 11, 2021: skrining pra-partisipasi, FITT, populasi khusus) dan Position Stand 2009 [A]. **Pengecualian**: angka ACSM 2009 yang dibantah meta-analisis lebih baru (tabel di atas) diganti; Rules.md menulis kedua angka dan alasannya. Ini menyimpang dari "ACSM menang" demi "tanpa aturan old school" — owner memastikan di T-1600.
2. **APKI** (Asosiasi Pelatih Kebugaran Indonesia) dan **ISSA** — pendukung; dipakai bila tidak bertentangan dengan ACSM. Owner belum punya dokumennya di Drive: T-1600 mencari materi publik resmi; bila tidak ada, baris itu ditulis "APKI/ISSA: belum ada dokumen" dan tidak memengaruhi angka. Owner boleh menaruh PDF di Drive kapan saja untuk dikutip.
3. **Jurnal** (PMID) — pendukung: menjelaskan alasan dan mengisi hal yang tidak diatur guideline.

Kolom Sumber di Rules.md jadi `ACSM (bab/halaman) · APKI · ISSA · jurnal`.

**Keputusan owner: aturan wajib dari sumber tertulis.** Tiap angka di `PGEN` harus punya baris di Rules.md dengan sitasi jurnal peer-review / position stand + PMID. Tidak ada baris "praktik umum": angka yang tidak didukung jurnal tidak dipakai. T-1600 membaca abstrak/teks penuh (PubMed) dan mencocokkan angka; baris yang belum cocok diberi ⚠ dan konstanta-nya dipilih ke sisi paling konservatif sampai dicek. Rujukan yang sudah dipastikan ada di PubMed:

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
**Kembali setelah absen ≥ 2 minggu**: aturan diambil dari jurnal detraining/retraining (dicari di T-1600: meta-analisis detraining 2019+ dan studi *periodic retraining*, mis. Ogasawara 2013). Sampai baris itu terverifikasi: kembali di batas bawah volume level dan beban terakhir yang tercatat, naik lagi lewat aturan 9a (paling konservatif).
**Jenis kelamin**: aturan sama untuk perempuan dan laki-laki (Roberts 2020, J Strength Cond Res 34:1448, PMID 32218059, doi:10.1519/JSC.0000000000003521: hipertrofi dan kekuatan tubuh bawah naik setara). Yang membedakan hanya **otot fokus pilihan klien** di profil (mis. glutes, dada, lengan; MemberData AQ `Otot Fokus`, maks 2): otot fokus mendapat volume di **batas atas** level, otot lain di **batas bawah**, supaya sesi tetap wajar.
Otot fokus dipilih dari **16 otot detail** (label Indonesia + nama Inggris); di pemula-banget otot fokus **boleh** mendapat gerakan isolasi (pengecualian aturan 4, hanya untuk otot fokus).
**Waktu pembuatan**: program dibuat **langsung** setelah klien menyimpan profil (level, tujuan, hari, durasi, fokus); bila form kesehatan belum diisi → mode ringan sampai diisi, lalu dibuat ulang otomatis.
**Tempo**: bebas (durasi rep 0,5–8 dtk memberi hipertrofi serupa — Schoenfeld 2015, Sports Med 45:577, dicek PMID di T-1600); estimasi durasi sesi 3 dtk/rep.
**Bahasa (keputusan owner, pengecualian aturan "UI Indonesia" di Agent.md §4)**: nama gerakan, nama otot, dan petunjuk latihan di logger / program / katalog **Inggris** ("Seated Cable Row", "Upper Back", "Leave 2–3 reps in reserve"). Navigasi, tombol umum, dan pesan error tetap Indonesia. Dicatat di Agent.md §7.
**Gambar gerakan gym tanpa GIF** (Squat (Machine), Hip Thrust (Machine)): **ikon peta otot** kecil (otot utama disorot), bukan GIF mirip — kolom "gambar contoh 0750" di tabel katalog dibuang.
**Peta otot logger**: otot utama gelap, otot pendukung terang (`wlMuscleSvg` mendapat dua tingkat; Theme.html token, bukan warna keras).
**Nama lama**: sheet tidak diubah; saat tampil, nama manual yang cocok alias diganti nama baru.
**Gabung riwayat otomatis**: alias yang cocok (exact setelah normalisasi: huruf kecil, tanpa tanda baca, sinonim alat seperti "cable"/"kabel"/"mesin"→"machine") menyatukan kunci riwayat (`_workoutKey_` → `ex:<id>` / `gym:<id>`) untuk PR, grafik, dan saran beban. Tebakan yang tidak pasti (kata kunci saja) **tidak** digabung otomatis — hanya mengisi otot, dan tampil di daftar Pengaturan untuk dikonfirmasi (lebih aman agar PR tidak tercampur).
**APKI / ISSA**: hanya materi publik resmi; bila tidak ada, ACSM + jurnal saja (dicatat di Rules.md).
**Hamil**: tetap otomatis dalam **mode ringan + aturan kehamilan** (ACOG Committee Opinion 804, 2020, dicek di T-1600): intensitas sedang (bisa bicara selama latihan), tanpa gerakan telentang lama setelah trimester 1, tanpa gerakan berisiko jatuh/benturan perut, kardio sedang 150 menit/minggu; banner "konsultasikan dengan dokter/bidan". Tag `hamil` sudah ada di Gizi (`Pantangan Makanan`) dan dipakai juga di sini.
**RIR**: target tampil di logger ("Sisakan 2–3 rep"), tidak dicatat.
**Opt-out klien**: tombol "Matikan otomatis" (member `setMyProgramAuto(memberToken, false)`); program terakhir tetap ada sebagai program biasa (`Sumber` dikosongkan), bisa dinyalakan lagi.
**Gerakan berat badan mentok** (rep + set di batas): progresi lewat varian lebih berat dengan pola sama, berurutan (Incline Push Up → Incline Push Up lebih rendah → Push Up), mengikuti aturan 9b tukar sistematis. Katalog mendapat kolom `Varian Berikut` (gym ID) untuk rantai ini.
**Penjelasan perubahan ke klien**: tiap perubahan otomatis (set/beban naik, tukar, blok baru) punya satu kalimat + sumber singkat, mis. "Set Leg Press naik ke 3: volume paha depan 6 → 7,5 set/minggu (Pelland 2026)"; coach melihat kalimat yang sama. Per sesi ≤ 6 gerakan; > 10 set langsung per otot per sesi dipecah ke hari lain. Mode ringan: batas bawah pemula-banget. | [L]; [B] |
| 9a | **PRIORITAS #1 — Progressive overload dengan form dulu** (keputusan owner). Urutan per gerakan: **rep → set → beban**: (1) rep naik sampai batas atas rentang pada semua set kerja; (2) lalu +1 set, selama volume mingguan otot itu masih di bawah batas atas level (aturan 5); (3) bila set sudah di batas, beban naik (+2,5 kg tubuh atas / +5 kg tubuh bawah, `_workoutSuggest_`) dan rep kembali ke batas bawah. **Gerbang form**: beban hanya boleh naik bila (a) coach sudah menandai gerakan itu *Form OK* di sesi PT, **dan** (b) di latihan sendiri terakhir klien tidak menjawab "ragu" pada "Form terasa rapi?" (ditanya **setelah set terakhir tiap gerakan** di logger, dua tombol Rapi / Ragu, bawaan tidak dijawab = tidak menghalangi). Tanpa gerbang, progresi berhenti di rep dan set. | [A] (progresi beban 2–10 %); [L] (volume) |
| 9b | Stagnan (e1RM dan rep tidak naik 3 sesi berturut pada satu gerakan, form OK): (1) bila volume otot di bawah batas atas → +1 set [L]; (2) bila sudah di batas atas → tukar ke varian dengan pola sama yang memberi rangsangan berbeda (sudut/alat lain), **sistematis, tidak acak, paling sering sekali per blok** [Q]; (3) bila form "ragu" → tanda ke coach, beban tidak naik. Tidak ada reset beban otomatis atau deload (tidak ada bukti kuat untuk pemula). | [L]; [Q] |
| 6 | Rep & usaha: compound 6–12 rep, isolasi 10–20; tujuan kekuatan 3–6 rep pada compound mulai level `pemula`. Usaha diatur dengan RIR, bukan %1RM: pemula-banget RIR 2–3, pemula 1–3, menengah 0–2 pada isolasi; mode ringan RIR ≥ 4. | [H]; [D]; [A] |
| 7 | Istirahat: minimal 90 dtk; compound 2–3 menit; isolasi 90 dtk. Durasi sesi (aturan 14) tidak memotong istirahat di bawah 90 dtk — gerakan yang dipangkas. | [J]; [K] |
| 8 | Urutan: gerakan prioritas tujuan di awal (compound untuk kekuatan/pemula); dorong:tarik seimbang per minggu (volume fractional). | [A]; [L] |
| 9 | Blok 4 minggu (unit tinjauan, bukan periodisasi kaku): di akhir blok, volume mingguan tiap otot naik 1–2 set bila aturan 9a sudah sampai tahap set dan kehadiran baik; naik level bila volume sudah di batas atas level dan ada progresi beban dengan form OK. Ambang kehadiran ditetapkan di T-1600 dari [A]. | [A]; [L] |
| 10 | Pilihan gerakan: hanya dari **katalog gym** (§2), level ≤ level klien, aktif, tidak kena tag pantangan gerakan (mis. `lutut` → tanpa Squat Machine). Slot compound yang tak punya alat di level itu (mulai level `pemula`) dicatat sebagai celah untuk owner. | keputusan owner (alat) |
| 11 | Info ke klien: latihan otot ≥ 2 hari/minggu + 150–300 menit aerobik sedang per minggu. | [E] |
| 13 | Tujuan mengubah program sejak awal (dari MemberData D / Goal Gizi): **kekuatan** → rep rendah pada compound, istirahat 3 menit, frekuensi lebih tinggi; **otot** → volume di ujung atas batas level; **fat loss** → latihan beban **sama seperti tujuan otot** (menjaga massa otot, tanpa "rep tinggi untuk membakar lemak") + blok kardio (aturan 18) + target kalori dari Fase Gizi; **kebugaran** → nilai tengah + kardio. Tujuan tidak pernah melanggar batas level dan mode ringan. | [H]; [L]; [I] + [E] |
| 14 | Durasi sesi: **klien pilih 30 / 45 / 60 menit**. Waktu per set = kerja (≈ 3 dtk/rep) + istirahat aturan 7; gerakan dan set dipangkas dari isolasi dulu, lalu set compound, tapi tidak di bawah 1 set per pola compound. 30 menit pada pemula-banget = 4 compound × 2 set. | [A] (istirahat, urutan) |
| 15 | Beban awal: kolom kg **kosong** di sesi pertama tiap gerakan; petunjuk "pilih beban yang masih sanggup ±3 rep lagi" (RIR sesuai level). Setelah ada log, `_workoutSuggest_` mengisi. | [D]; [A] |
| 16 | Tukar gerakan oleh klien: hanya ke gerakan lain dengan **pola sama**, level ≤ level klien, aktif, tidak kena pantangan. Pilihan disimpan dan dipakai lagi di blok berikut. | aturan 4, 10 |
| 17 | Pemanasan/pendinginan **tidak** ditulis di program (coach yang mengurus). | keputusan owner |
| 18 | Kardio masuk program sesuai tujuan, alat: **Treadmill** dan **Sepeda statis** (gerakan gym `jenis waktu`, katalog `kardio`). Fat loss/kebugaran: blok kardio intensitas sedang di akhir sesi (sisa waktu dari aturan 14), total menuju 150–300 menit/minggu; otot/kekuatan: kardio opsional singkat. Pemula-banget mulai pendek dan naik per blok. | ACSM Guidelines (FITT aerobik) · [E] · [I] |
| 19 | Populasi khusus ACSM: **lansia > 65** → mode ringan + gerakan keseimbangan/fungsional dari katalog, intensitas ringan–sedang; **remaja < 18** → mode ringan, teknik dulu, beban ringan, catatan "diawasi coach". | ACSM Guidelines (populasi khusus) · [E] |
| 20 | Program otomatis untuk **hari latihan sendiri** saja; sesi PT diatur coach di tempat. "Hari/minggu" yang dipilih klien = hari latihan sendiri. Volume sesi PT yang tercatat di log ikut dihitung di volume mingguan per otot (aturan 5), sehingga hari sendiri mengisi kekurangan, bukan menumpuk. | [L] |
| 21 | Level dipilih **bebas oleh klien** (3 level); mode ringan (aturan 1, 19) tetap memaksa `pemula-banget`. Gerakan berat badan untuk keseimbangan lansia boleh (sit-to-stand, single-leg stand, step-up rendah) dan masuk katalog sebagai `badan`. | keputusan owner · ACSM Guidelines |
| 12 | Coach selalu menang: program yang disimpan coach (`Sumber` kosong) tidak pernah ditimpa; coach bisa matikan otomatis per klien. | keputusan owner |

## 2. Katalog gym + nama gerakan

**Nama ala Hevy (semua 1.324):**
- `tools/exercise-names.js` (murni, diuji): pola `<Gerakan> (<Alat>)`; peta alat `barbell→Barbell, dumbbell→Dumbbell, cable→Cable, leverage machine/sled machine→Machine, smith machine→Smith Machine, band→Band, kettlebell→Kettlebell`, body weight tanpa label; buang kata alat dari nama, Title Case, perbaiki mojibake (`в°`→`°`), "v. 2" → varian, ganda diberi pembeda. Plus `tools/exercise-names-override.json` untuk ±150 gerakan umum (mis. `0861 Seated Cable Row`, `2330 Lat Pulldown (Cable)`, `0739 Leg Press (45°)`, `0585 Leg Extension (Machine)`, `0596 Chest Fly (Machine)`, `0493 Incline Push Up`).
- (Dibangun di T-1601: `n` = nama tampilan, `r` = nama mentah; bukan field `d`.) `build-exercises.js` menambah field `d` (nama tampilan) dan `m` (otot pendukung, dari peta target → otot); `n` tetap untuk pencarian (cari pakai `n` dan `d`). Jangan edit `exercises.min.json` manual.
- App: `exCap` (`App.html:5232`) diganti `exName(it)` = `it.d || exCap(it.n)` di picker, logger, rutinitas, kartu bagikan. Baris lama di ProgramItems/WorkoutLog tetap; bila ada `exId`, tampilan pakai `d`.

**Katalog gym XNK** — sheet `GymExercises` (kolom: ID `gym:<slug>`, Nama, Exercise ID library (opsional, untuk GIF), Level Min, Pola (`lutut|pinggul|dorong-h|dorong-v|tarik-h|tarik-v|isolasi`), Otot Utama, Otot Pendukung, Jenis, Rep Min/Max bawaan, Hindari Bila (tag), Aktif, Urutan). Seed idempoten (di bawah `LockService`) dengan 8 gerakan pemula-banget:

| Gerakan | Pola | Utama | Pendukung | Library |
|---|---|---|---|---|
| Chest Fly (Machine) | isolasi dorong | chest | shoulders | 0596 |
| Incline Push Up | dorong-h | chest | shoulders, upper arms (triceps), waist | 0493 |
| Lat Pulldown (Cable) | tarik-v | back (lats) | upper arms (biceps), shoulders | 2330 |
| Seated Cable Row | tarik-h | back (upper back) | upper arms, shoulders | 0861 |
| Squat (Machine) — lever, duduk/bersandar ala *chair squat*, bukan pendulum | lutut | upper legs (quads) | glutes, adductors | — (gym; ikon otot) |
| Leg Press (45°) | lutut | upper legs (quads) | glutes, hamstrings | 0739 |
| Hip Thrust (Machine) | pinggul | glutes | hamstrings | — (gym) |
| Leg Extension (Machine) | isolasi lutut | upper legs (quads) | — | 0585 |

**Usulan level berikut (owner minta diusulkan; dicoret/ditambah owner di T-1600 sebelum seed, hanya yang alatnya ada di gym):**

| Level | Pola | Usulan (ID library) |
|---|---|---|
| pemula | dorong-h | Chest Press (Machine) 0577 · Bench Press (Dumbbell) 0289 · Incline Bench Press (Dumbbell) 0314 |
| pemula | dorong-v | Shoulder Press (Machine) 0603 · Seated Shoulder Press (Dumbbell) 0405 |
| pemula | tarik-h | T-Bar Row (Machine) 0606 · Seated Row (Machine) 1350 · One Arm Row (Dumbbell) |
| pemula | pinggul | Romanian Deadlift (Dumbbell) 1459 · Glute Bridge |
| pemula | lutut | Goblet Squat (Dumbbell) 1760 |
| pemula | isolasi | Seated Leg Curl (Machine) 0599 · Lateral Raise (Dumbbell) 0334 · Bicep Curl (Cable) 0868 · Triceps Pushdown (Cable) 0201 · Hip Abduction (Machine) 0597 · Standing Calf Raise (Machine) 0605 · Dead Bug 0276 |
| menengah | compound | Bench Press (Barbell) 0025 · Squat (Barbell) 0043 · Romanian Deadlift (Barbell) 0085 · Deadlift (Barbell) 0032 · Bent Over Row (Barbell) 0027 · Overhead Press (Barbell) 1457 · Pull Up 0652 |
| menengah | isolasi | Preacher Curl (Machine) 0592 · Triceps Extension (Machine) 0607 · Lateral Raise (Machine) 0584 · Lying Leg Curl (Machine) 0586 |

Contoh hasil pemula-banget, 3 hari (A/B/A lalu B/A/B):
- **A**: Leg Press (45°) · Lat Pulldown (Cable) · Incline Push Up · Hip Thrust (Machine) · (Leg Extension, opsional di akhir)
- **B**: Squat (Machine) · Seated Cable Row · Incline Push Up · Hip Thrust (Machine) · (Chest Fly, opsional di akhir)

Pengaturan → section baru **Latihan & Alat** (`SET_SECTIONS`, `App.html:791`): katalog per level, tambah/ubah/aktif, toggle global `PROGRAM_AUTO_ENABLED`. **Nyala bawaan untuk semua klien** (keputusan owner, pengecualian aturan 5 Agent.md seperti Gizi): berlaku untuk klien yang belum punya program dari coach; `PROGRAM_AUTO_ENABLED=false` mematikan untuk semua, `Program Otomatis = tidak` per klien.

**Otot untuk gerakan manual di log** (`WorkoutLog` G kosong):
- Pure `_exGuessMuscles_(name)` (kata kunci: pulldown→back/lats, row→back, press+leg→upper legs, fly/chest/push up→chest, thrust/glute/bridge→glutes, curl→upper arms, extension+leg→quads, …) + sheet `ExerciseAlias` (Nama kecil → Exercise ID / gym ID, Body Part, Otot Pendukung, Dikonfirmasi).
- Admin `getManualExercises(token)` = nama unik tanpa exId + jumlah set + tebakan; `saveExerciseAlias(token, list)` (konfirmasi sekali ketuk di Pengaturan → Latihan & Alat).
- Dipakai **saat baca** di `_workoutGroup_`/`_workoutStats_` (`Kode.gs:7398`, `7436`): bodyPart kosong → alias → tebakan. Tidak menulis ulang WorkoutLog.
- Saat implementasi (pilihan owner: "ambil dari sheet"): baca semua nama gerakan tanpa Exercise ID dari sheet "XNK Personal Trainer" → WorkoutLog (370 baris) lewat Google Drive, tebak otot utama + pendukung tiap nama, tulis ke `docs/program/Alias.md` (tabel nama → gerakan library/gym, otot) untuk dicek owner, lalu jadikan seed `ExerciseAlias`. Hanya nama gerakan yang dibaca, tidak ada data klien yang masuk repo.

## 2b. Gambar & animasi otot buatan sendiri (keputusan owner)
Tujuan: "GIF sendiri" untuk **semua pola gerakan**, monokrom (token Theme.html, light/dark), mengganti GIF Gym visual **bertahap**.

**Hak cipta**: gambar contoh owner (watermark dreamstime, gaya Gym visual) **tidak dijiplak**. Bentuk anatomi diambil dari sumber berlisensi terbuka (kandidat: peta otot SVG berlisensi MIT, ilustrasi anatomi CC-BY/CC-BY-SA Wikimedia; T-1610 memilih dan mencatat lisensi + atribusi di `figure/CREDITS.md`), lalu digambar ulang dan disederhanakan.

**Bagian 1 — peta otot diam** (`figure/muscles.svg` → dibangun ke `figure/figure.min.json` oleh `tools/build-figure.js`, disajikan GitHub Pages dan di-cache seperti `exercises.min.json`, termasuk untuk mode offline `sw.js`):
- Depan + belakang, 16 otot target (id path = nama otot library: `pectorals`, `lats`, `upper-back`, `traps`, `delts`, `biceps`, `triceps`, `forearms`, `abs`, `spine`, `quads`, `glutes`, `hamstrings`, `adductors`, `abductors`, `calves`).
- Utama = `--fg` penuh, pendukung = `--fg` 35 %, sisanya `--line`; denyut pelan pada otot utama; `prefers-reduced-motion` = diam.
- Menggantikan `WL_MM_FRONT/BACK` + `wlMuscleSvg` (`App.html:5707-5726`) di logger, statistik, kartu bagikan (`Bagikan.html`, gambar ke canvas), dan sebagai gambar gerakan gym XNK.

**Bagian 2 — figur bergerak per pola** (`figure/rig.svg` + `figure/poses.json`):
- Figur sisi (sagittal) dan depan tersusun dari segmen (kepala, torso, panggul, lengan atas/bawah, tangan, paha, betis, kaki), tiap segmen `<g>` dengan `transform-origin` di sendi; otot di permukaan segmen ikut berputar dan menyala sesuai otot utama/pendukung gerakan.
- Alat sederhana sebagai bentuk netral (bangku, mesin, kabel, barbel, dumbbell, platform leg press 45°, kursi lever squat) — tanpa merek.
- Animasi = keyframe sudut sendi per pola (CSS `@keyframes` dibangkitkan dari `poses.json`, 2 detik naik-turun, loop): squat (mesin/bebas), leg press 45°, hinge/RDL, hip thrust, lunge/split squat, leg extension, leg curl, calf raise, push up (incline/biasa), bench/chest press, chest fly, overhead/shoulder press, lateral raise, pulldown, row (kabel/mesin/dumbbell), pull up, biceps curl, triceps pushdown/extension, crunch/plank, hip abduction/adduction, kardio (treadmill, sepeda).
- **Akurasi**: rentang sudut sendi tiap pola dari literatur biomekanik (mis. sudut lutut/pinggul squat dan leg press, ROM bahu pada pulldown/row), dicatat di `docs/program/Gerak.md` dengan sumber; diuji di `tools/figure-check.js` (Playwright: tiap pola tampil, sendi dalam batas anatomi, tidak ada segmen terlepas, 360 px dan desktop, light/dark).
- **Tampak**: samping sebagai bawaan, tombol putar ke depan/belakang (rig kedua untuk bidang frontal) pada gerakan yang perlu (lateral raise, abduction/adduction, fly).
- **Figur**: dua figur, **pria dan wanita**, sesuai `Jenis Kelamin` klien (MemberData Y); kosong → pria/wanita dipilih di pengaturan perangkat. Peta otot diam juga punya dua versi.
- **Kartu bagikan**: figur/peta otot kita boleh dipakai di kartu Latihan/Exercises (PNG + video 6 detik) lewat canvas (`Bagikan.html`), dicek `tools/share-check.js`.
- Pemetaan gerakan → pola + varian alat di katalog/library (`pola`, `alat`); gerakan library yang punya animasi kita memakai animasi itu, sisanya tetap GIF hotlink sampai polanya selesai.

## 2c. Anggaran kecepatan (dicek otomatis)
- Pembukaan portal/panel: **tidak ada panggilan server baru**; data program otomatis ikut `getPortalMore` / `getClientBundle` (versi data, salinan perangkat). Generator hanya jalan saat simpan profil, tukar gerakan, dan job 04:00 — tidak pernah saat baca.
- `figure.min.json` (peta otot + rig + pose semua pola, dua figur) ≤ **250 KB** gzip; dimuat malas (saat logger/rutinitas/kartu dibuka pertama kali), di-cache di localStorage/`sw.js` seperti `exercises.min.json`. `exercises.min.json` v2 (field `r`): 30 → 39 KB gzip (+30 %, diterima); field `m` nanti ≤ +10 KB gzip.
- Animasi hanya `transform`/`opacity` (GPU); maks satu figur bergerak sekaligus, sisanya diam; berhenti di luar layar (`IntersectionObserver`) dan saat tab tersembunyi; `prefers-reduced-motion` = diam.
- `tools/figure-check.js` dan `browser-check.js` mengukur: ukuran file, waktu render peta otot < 16 ms per frame di emulasi HP 4× CPU throttle, tidak ada layout shift di logger.
- Job `program-otomatis` di bawah batas waktu Apps Script: diproses per kelompok klien dengan penanda lanjut (seperti reminder), satu baca sheet per jalan.

## 2d. Siap untuk frontend di GitHub Pages (migrasi = rencana berikutnya, bukan fase ini)
Owner: migrasi ke GitHub disimpan untuk rencana berikutnya. Fase U hanya menjaga agar kode baru tidak menghalanginya (poin di bawah); tidak ada pemindahan hosting di sini.
CORS sudah terbukti: `app/app.js:49` (GitHub Pages) → `doPost` (`Kode.gs:129`) dengan `Content-Type: text/plain` (tanpa preflight; Apps Script menjawab lewat redirect ke googleusercontent dengan `Access-Control-Allow-Origin: *`). Batas: token di body (tanpa header `Authorization`), hanya GET/POST, ±1–3 dtk per panggilan, `doPost` hanya untuk fungsi klien di `_appApi_`.
Aturan untuk Fase U:
- Semua fungsi **member** baru (`getMyProgramProfile`, `saveMyProgramProfile`, `acceptAutoProgram`, `setMyProgramAuto`, `getMySwapOptions`, `swapMyProgramExercise`, `setMyFormCheck`) masuk `_appApi_` + test `doPost`, jadi bisa dipanggil dari halaman GitHub Pages.
- Semua logika aturan di fungsi murni `ProgramGen.gs` tanpa `SpreadsheetApp` (data masuk sebagai argumen), supaya nanti bisa dipindah ke backend lain (Phase V) tanpa ditulis ulang; test Node sudah menjalankannya di luar Apps Script.
- Aset statis (library gerakan, `figure.min.json`, katalog publik) di GitHub Pages, bukan Apps Script.
- Fungsi **admin** tidak dibuka lewat `doPost` di fase ini. Membuka API admin untuk panel di GitHub Pages adalah keputusan keamanan terpisah (daftar putih admin + token di body + batas laju), dicatat sebagai tugas lanjutan di `docs/platform/TODO.md`.
- T-1606 menambah `tools/api-check.js`: memanggil `doPost` dari origin lokal lewat Playwright (`fetch` text/plain) ke deployment uji, untuk memastikan jawaban terbaca (CORS) — dijalankan manual, bukan di CI (CI tidak memanggil jaringan).

## 3. Data klien
MemberData kolom baru (append, `_ensure…Columns_`): AG `Level Latihan`, AH `Hari Latihan` (2–4), AM `Durasi Sesi` (30/45/60), AN `Tujuan Latihan` (`kekuatan|otot|fatloss|bugar`, diisi dari teks goal lama bila kosong), AI `Program Otomatis` (kosong = ikut global, `tidak` = mati), AJ `Blok Mulai` (ISO), AK `Blok Ke`, AL `Pantangan Gerakan` (tag: lutut, punggung-bawah, bahu; hanya coach), AO `Tukar Gerakan` (JSON `{pola: gymId}`, aturan 16), AP `Form OK` (JSON `{exKey: tanggal}`, ditulis coach, aturan 9a).
WorkoutLog kolom U `Form` (`ok|ragu`, per gerakan per sesi, set pertama saja; jawaban klien di layar Selesai/logger, aturan 9a).
Admin `setFormOk(token, memberId, exKey, ok)` — tombol "Form OK" per gerakan di catatan sesi / logger coach; `_bumpMember_`. `_workoutSuggest_` diberi argumen gerbang form (tanpa gerbang → `null` untuk beban, saran rep/set tetap).
ProgramItems kolom V `Sumber` (`auto:<versi aturan>` atau kosong = manual). `_programWrite_` menulis `Sumber`; `saveMemberProgram` (coach) mengosongkannya → aturan 12.
Registrasi: `doRegisterStep2` (`LandingScript.html:407`) ikut kirim pengalaman → `registerNewClient` simpan ke AG (Pemula→`pemula-banget`, Menengah→`pemula`, Lanjutan→`menengah`, konservatif).

## 4. Server — `src/ProgramGen.gs` (nama unik, bukan bentrok dengan .html)
Murni (diuji):
- `_pgenSafety_(health, profile)` → `{ok, reasons[]}` (aturan 1).
- `_pgenSplit_(level, daysPerWeek)` → kerangka hari + slot pola (aturan 3, 7).
- `_pgenPick_(slots, catalog, level, avoidTags, block)` → gerakan per slot, rotasi varian per blok, celah (aturan 10).
- `_pgenDose_(level, item, block, deload)` → set, repMin/Max, rest, catatan RIR (aturan 4–6, 9); hasil dicek batas volume per otot/minggu memakai otot utama (1 set) + pendukung (0,5 set).
- `_pgenProgram_(profile, catalog, health, history, today)` → `{days, gaps, block, why}` dalam bentuk `_parseProgramDays_` (`Kode.gs:6744`), lalu divalidasi lewat fungsi itu.
- `_pgenVolume_(days, catalog, pastLogs)` → set fractional per otot per minggu (aturan 5, termasuk sesi PT tercatat, aturan 20); dipakai generator **dan** test.
- `_pgenOverload_(item, lastSessions, formGate, volumeLeft)` → `{step: 'rep'|'set'|'beban'|'tahan', target}` (aturan 9a).
- `_pgenStall_(history, formGate, volumeLeft)` → `add-set | swap | coach` (aturan 9b).
- `_pgenReview_(profile, attendance, workoutDays, today)` → `keep | next-block | level-up` (aturan 9).

Publik:
- Member `getMyProgramProfile` / `saveMyProgramProfile(memberToken, {level, tujuan, hari, durasi, fokus})`, `acceptAutoProgram`, `setMyProgramAuto`, `setMyFormCheck(memberToken, tanggal, exKey, 'ok'|'ragu')` (atau ikut `logMyWorkout` entri `form`) (member dari token; klien tidak bisa set pantangan gerakan) → langsung generate. Member `getMySwapOptions(memberToken, hari, urutan)` / `swapMyProgramExercise(memberToken, hari, urutan, gymId)`: server cek aturan 16, tulis baris ProgramItems (tetap `Sumber auto`) + AO, `_bumpMember_`.
- Program otomatis di portal tidak bisa diubah bebas: tombol ⇄ per gerakan (tukar) dan "Salin ke Rutinitas saya" (sudah ada, `copyRoutineToMine`).
- Admin `getProgramGenPreview(token, memberId)`, `regenerateProgram(token, memberId)`, `setClientProgramAuto(token, memberId, on, opts)`, `getGymCatalog`, `saveGymExercise`, `setGymExerciseActive`, `getManualExercises`, `saveExerciseAlias`.
- Job harian di `runReminderTick` (`Reminder.gs`): `program-otomatis` 04:00 WIB, di bawah lock, kecuali `PROGRAM_AUTO_ENABLED=false`: klien aktif (yang belum isi profil memakai level dari registrasi dan 2 hari sampai mereka memilih) tanpa program / blok selesai → `_pgenReview_` → tulis program, `_bumpMember_(id)`. Tidak ada Telegram ke klien; owner hanya dapat ringkasan jumlah (tanpa data kesehatan).
- Semua writer: `_bumpMember_` / `_bumpAfter_`; writer katalog/alias: `_bumpMember_('*')` + `_bustShared_()` bila katalog ikut cache. Daftarkan di `tests/security.test.js` (ADMIN/MEMBER) dan `tests/cache-version.test.js`.
- Bagian baru `programGen` (profil, status aman, blok, celah, alasan) masuk `getPortalMore` dan `getClientBundle` (bukan panggilan baru).

## 5. UI
- **Pemberitahuan** (pilihan owner): klien di portal (titik "baru" + kartu "Program baru / Blok baru" di Latihan) dan coach di hub (daftar program baru, naik level, mode ringan). Tanpa Telegram, tanpa WhatsApp.
- **Portal → Latihan**: kartu "Program otomatis" di atas rutinitas: bila profil belum ada → sheet 3 langkah (level dengan penjelasan singkat, tujuan, hari/minggu + durasi 30/45/60); bila tidak aman → "Coach akan menyiapkan programmu" + tombol isi form kesehatan; bila aktif → "Blok 1 · minggu 2 dari 4", alasan singkat dan (i) sumber per aturan. Program muncul di *Dari coach* dengan label "Otomatis".
- **Panel → klien → Latihan**: badge "Otomatis · blok N", tombol Buat ulang, Matikan otomatis, pantangan gerakan, celah alat. Coach hub: daftar klien tertahan pengaman.
- **Pengaturan → Latihan & Alat**: katalog per level, toggle global, daftar gerakan manual + tebakan otot (konfirmasi).
- Phone first (360–430 px), `h()`, token `Theme.html`, Indonesian copy.

## 6. Urutan tugas (docs/program/TODO.md)
**Rilis 1 (keputusan owner): nama + otot dulu** = T-1600 (docs bagian nama/otot), T-1601, T-1603, T-1610 → PR sendiri. **Rilis 2**: T-1602, T-1604–T-1608 (katalog + generator). **Rilis 3**: T-1611–T-1613 (animasi, bertahap per pola).
- T-1610 Peta otot diam sendiri (lisensi, `muscles.svg`, build, ganti `wlMuscleSvg`, kartu bagikan, offline).
- T-1611 Rig figur + alat netral + `poses.json` + `figure-check.js`; pola pemula banget dulu (lever squat, leg press 45°, hip thrust, leg extension, chest fly, incline push up, pulldown, seated row).
- T-1612 Pola sisanya (daftar §2b), `Gerak.md` dengan sumber sudut sendi.
- T-1613 Ganti GIF bertahap: gerakan dengan pola selesai memakai animasi sendiri; hapus hotlink bila semua pola selesai (keputusan owner nanti).
- T-1600 Docs: PRD, Design, Rules dengan PMID [A]–[G]; baca abstrak/teks penuh lewat PubMed, isi angka pasti (volume per level, ambang kehadiran, lama per level); baris yang belum cocok tetap ⚠ dan konservatif. Alias.md.
- T-1601 Nama gerakan: `exercise-names.js` + override + build, `exName` di semua tampilan. Test `tests/exercise-names.test.js`.
- T-1602 `GymExercises` + seed + Pengaturan Latihan & Alat + admin CRUD.
- T-1603 Alias otot gerakan manual (tebakan, sheet, baca-saat-statistik, layar konfirmasi) + seed dari data asli.
- T-1604 MemberData AG–AL, ProgramItems V, registrasi simpan level.
- T-1605 `ProgramGen.gs` fungsi murni + `tests/program-gen.test.js` (tiap aturan ≥ 1 test; wajib: volume fractional tiap otot dalam 6–8 / 8–12 / 12–20 untuk 2/3/4 hari × 30/45/60 menit, urutan rep→set→beban, beban tidak naik tanpa Form OK coach atau dengan "ragu", stagnan → +set lalu tukar maks 1×/blok, PAR-Q → mode ringan, 2/3/4 hari, frekuensi 2×, volume dalam batas, urutan multi→isolasi, dorong:tarik, pantangan, celah, aturan 12 tidak menimpa manual).
- T-1606 Publik + job `program-otomatis` + `getPortalMore`/`getClientBundle` bagian `programGen`.
- T-1607 UI portal + panel + hub.
- T-1608 Browser check (phone 390×844 + desktop), demo seed, READMEs, Agent.md §7.

## File utama
`src/ProgramGen.gs` (baru), `src/Kode.gs` (`_programWrite_`, `PROGRAM_HEADERS`, `registerNewClient`, `getPortalMore`, `getClientBundle`, `_workoutGroup_`), `src/Reminder.gs`, `src/App.html`, `src/Index.html`, `src/LandingScript.html`, `tools/build-exercises.js`, `tools/exercise-names.js` (baru), `exercises/exercises.min.json` (generate), `tools/demo-runtime.js`, `tests/security.test.js`, `tests/cache-version.test.js`, `docs/program/*`, `CLAUDE.md`, `docs/Agent.md` §7, `apps-script/README.md`, `README.md`.

## Verifikasi
```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js
NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/browser-check.js
node apps-script/pt-scheduler/tools/build-demo.js   # demo: klien pemula-banget 3 hari → program Full Body A/B dari 8 gerakan
```
Cek manual di demo: klien dengan PAR-Q "ya" dapat program mode ringan + banner; klien pemula-banget 2 hari → 2 hari full body, 4 compound per sesi, isolasi maks 1 di akhir, tiap pola 2×/minggu; coach ubah program → job berikut tidak menimpa; nama di picker tampil "Seated Cable Row"; gerakan manual "Lat pulldown" di log masuk "Punggung" di statistik.
Kerja di branch `claude/automated-workout-program-science-01hbqd`, PR ke `main` setelah checks hijau.
