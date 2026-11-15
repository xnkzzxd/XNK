# Sumber tips di pesan pengingat

Teks pengingat klien ada di `apps-script/pt-scheduler/src/ReminderTeks.gs` (lalu di sheet `PesanVariasi`).
Teks yang berisi klaim kesehatan membawa `src: 'Sxx'` (kolom **Sumber** di sheet) dan nomornya harus ada di
tabel ini; `tests/reminder-variants.test.js` gagal bila tidak ada.

Aturan (keputusan pemilik, 2026-11):

- Di pesan, tipsnya ditulis polos tanpa nama jurnal. Sumbernya dicatat di sini.
- Hanya **pedoman resmi** (Kemenkes, WHO) dan **position stand / tinjauan sistematis / meta-analisis**. Bukan satu penelitian tunggal.
- Klaim ditulis lebih hati-hati daripada sumbernya ("membantu", "cenderung"), tanpa angka hasil.
- Tips baru tanpa sumber yang sudah dicek: jangan ditulis.

Kolom **Dicek**: `PubMed` = judul, jurnal, tahun dan DOI dicocokkan dengan PubMed pada 2026-11-16.
`Dokumen` = pedoman pemerintah / WHO yang tidak ada di PubMed; dikutip dari judul dan nomor resminya dan **belum
dibuka ulang** saat daftar ini dibuat. Periksa angka di kolom Klaim terhadap dokumennya sebelum mengubah teksnya.

| No | Klaim yang dipakai di pesan | Sumber | Tahun | DOI / PMID / nomor | Dicek |
| --- | --- | --- | --- | --- | --- |
| S01 | Isi Piringku: setengah piring sayur dan buah; biasakan sarapan; minum air sekitar 8 gelas sehari; aktif bergerak 30 menit sehari | Kementerian Kesehatan RI, Pedoman Gizi Seimbang | 2014 | Permenkes No. 41 Tahun 2014 | Dokumen |
| S02 | Batas sehari: gula 4 sendok makan, garam 1 sendok teh, lemak 5 sendok makan | Kementerian Kesehatan RI, Pencantuman Informasi Kandungan Gula, Garam, dan Lemak | 2013 | Permenkes No. 30 Tahun 2013 | Dokumen |
| S03 | Gula tambahan sebaiknya di bawah 10 % energi sehari (belum dipakai di teks) | WHO, Guideline: Sugars intake for adults and children | 2015 | ISBN 978-92-4-154902-8 | Dokumen |
| S04 | Garam di bawah 5 g sehari (belum dipakai di teks) | WHO, Guideline: Sodium intake for adults and children | 2012 | ISBN 978-92-4-150483-6 | Dokumen |
| S05 | Protein yang cukup dan dibagi rata di tiap waktu makan membantu menjaga dan memulihkan otot yang dilatih | Jäger R, dkk. International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr | 2017 | 10.1186/s12970-017-0177-8 · PMID 28642676 | PubMed |
| S06 | Makan ringan berkarbohidrat sebelum latihan membantu tenaga; makan dalam 1–2 jam setelah latihan membantu pemulihan | Kerksick CM, dkk. International society of sports nutrition position stand: nutrient timing. J Int Soc Sports Nutr | 2017 | 10.1186/s12970-017-0189-4 · PMID 28919842 | PubMed |
| S07 | Makan dengan protein lebih banyak membuat rasa kenyang lebih lama | Dhillon J, dkk. The Effects of Increased Protein Intake on Fullness: A Meta-Analysis and Its Limitations. J Acad Nutr Diet | 2016 | 10.1016/j.jand.2016.01.003 · PMID 26947338 | PubMed |
| S08 | Makan lebih pelan cenderung membuat makan secukupnya | Robinson E, dkk. A systematic review and meta-analysis examining the effect of eating rate on energy intake and hunger. Am J Clin Nutr | 2014 | 10.3945/ajcn.113.081745 · PMID 24847856 | PubMed |
| S09 | Serat dari sayur, buah dan biji-bijian utuh baik untuk kesehatan dan pencernaan | Reynolds A, dkk. Carbohydrate quality and human health: a series of systematic reviews and meta-analyses. Lancet | 2019 | 10.1016/S0140-6736(18)31809-9 · PMID 30638909 | PubMed |
| S10 | Kurang tidur cenderung membuat makan lebih banyak keesokan harinya | Al Khatib HK, dkk. The effects of partial sleep deprivation on energy balance: a systematic review and meta-analysis. Eur J Clin Nutr | 2017 | 10.1038/ejcn.2016.201 · PMID 27804960 | PubMed |
| S11 | Makan sambil terdistraksi (layar) cenderung membuat makan lebih banyak; makan dengan sadar membantu merasa cukup | Robinson E, dkk. Eating attentively: a systematic review and meta-analysis of the effect of food intake memory and awareness on eating. Am J Clin Nutr | 2013 | 10.3945/ajcn.112.045245 · PMID 23446890 | PubMed |
| S12 | Mencatat makan membantu mengenali pola makan sendiri | Burke LE, dkk. Self-monitoring in weight loss: a systematic review of the literature. J Am Diet Assoc | 2011 | 10.1016/j.jada.2010.10.008 · PMID 21185970 | PubMed |
| S13 | Sekitar 150 menit gerak sedang per minggu; gerak sedikit lebih baik daripada tidak sama sekali | Bull FC, dkk. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med | 2020 | 10.1136/bjsports-2020-102955 · PMID 33239350 | PubMed |
| S14 | Mulai latihan dalam keadaan cukup minum | American College of Sports Medicine position stand. Exercise and fluid replacement. Med Sci Sports Exerc | 2007 | 10.1249/mss.0b013e31802ca597 · PMID 17277604 | PubMed |
| S15 | Menyela duduk lama dengan berdiri atau jalan ringan membantu gula darah lebih stabil | Buffey AJ, dkk. The Acute Effects of Interrupting Prolonged Sitting Time in Adults with Standing and Light-Intensity Walking on Biomarkers of Cardiometabolic Health in Adults: A Systematic Review and Meta-analysis. Sports Med | 2022 | 10.1007/s40279-022-01649-4 · PMID 35147898 | PubMed |
| S16 | Minuman manis menyumbang banyak gula dan berkaitan dengan kenaikan berat badan | Malik VS, dkk. Sugar-sweetened beverages and weight gain in children and adults: a systematic review and meta-analysis. Am J Clin Nutr | 2013 | 10.3945/ajcn.113.058362 · PMID 23966427 | PubMed |
| S17 | Piring / porsi yang lebih kecil membuat orang makan lebih sedikit tanpa terasa | Hollands GJ, dkk. Portion, package or tableware size for changing selection and consumption of food, alcohol and tobacco. Cochrane Database Syst Rev | 2015 | 10.1002/14651858.CD011045.pub2 · PMID 26368271 | PubMed |
| S18 | Pola makan yang berhasil adalah yang bisa dijalani terus (belum dipakai di teks) | Aragon AA, dkk. International society of sports nutrition position stand: diets and body composition. J Int Soc Sports Nutr | 2017 | 10.1186/s12970-017-0174-y · PMID 28630601 | PubMed |
| S19 | Sayur dan buah sekitar 5 porsi (400 g) sehari | WHO, Healthy diet (fact sheet); WHO Technical Report Series 916 | 2003 / 2020 | TRS 916 | Dokumen |

Menambah tips: tulis teksnya di sheet `PesanVariasi`, isi kolom **Sumber** dengan nomor baru, dan tambahkan barisnya di sini.
