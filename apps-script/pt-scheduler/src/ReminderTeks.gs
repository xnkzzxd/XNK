// =============================================================================
// ReminderTeks.gs — teks bawaan untuk variasi pesan pengingat klien (lihat ReminderVariasi.gs).
// Isi awal sheet PesanVariasi; sheet itu yang dipakai setelah dibuat (pemilik bisa ubah/tambah).
// Kunci = jenis variasi, lalu kelompok hari: senin, jumat, sabtu, minggu, weekday (Selasa–Kamis
// dan cadangan hari kerja), weekend (hari libur umum / tanggal merah dan cadangan akhir pekan),
// semua (tiap hari), atau kunci hari libur (RMD_HOLIDAYS).
//
// Satu teks = string, atau { t: 'teks', tag: 'turun,telur', src: 'S07' }:
//   tag tujuan  turun | naik | jaga | recomp  → hanya untuk klien dengan Goal Gizi itu
//   tag bahan   telur | seafood | kacang | susu → dilewati untuk klien yang berpantang
//   mahal       → dilewati untuk anggaran hemat
//   porsi       → dilewati untuk klien dengan penanda hamil / gangguan-makan
//   src         → tips berdasar pedoman atau jurnal; nomornya ada di docs/reminder/Sumber.md
//
// Aturan nada (keputusan pemilik 2026-11): coach menyebut diri "saya", klien "Kak {nama}" / "Kakak",
// bahasa Indonesia saja, mengajak bukan menyuruh, tidak menebak pekerjaan / keluarga / apa yang
// klien lakukan, 3–4 baris pendek dipisah \n, paling banyak satu emoji, hanya placeholder jenisnya.
// =============================================================================

var RMD_VARIANTS_DEFAULT = {

  // ── Hidup sehat (05:00) ─────────────────────────────────────────────────────
  'hidup-sehat': {
    weekday: [
      'Selamat pagi Kak {nama}.\nKalau hari ini ada waktu 20 menit, jalan cepat sudah termasuk cardio yang baik.\nSemoga harinya lancar ya.{personal}',
      'Pagi Kak {nama}, semoga tidurnya cukup semalam.\nSegelas air putih setelah bangun membantu badan terasa lebih segar.\nSelamat beraktivitas.{personal}',
      { t: 'Selamat pagi Kak {nama}.\nGerak sedikit tetap lebih baik daripada tidak sama sekali.\nSepuluh menit jalan kaki hari ini pun sudah berarti.{personal}', src: 'S13' },
      'Pagi Kak {nama}.\nKalau ada tangga di dekat Kakak hari ini, boleh dicoba dipakai sekali dua kali.\nPelan saja, yang penting nyaman.{personal}',
      { t: 'Selamat pagi Kak {nama}.\nKalau hari ini banyak duduk, berdiri dan jalan sebentar tiap jam membantu gula darah lebih stabil.\nSemoga harinya ringan.{personal}', src: 'S15' },
      'Pagi Kak {nama}, apa kabar hari ini?\nCardio tidak harus lari. Sepeda, renang, atau jalan cepat sama baiknya.\nPilih yang paling Kakak sukai ya.{personal}',
      { t: 'Selamat pagi Kak {nama}.\nSekitar 8 gelas air sehari membantu badan bekerja dengan baik.\nBotol minum di dekat Kakak bisa jadi pengingat yang halus.{personal}', src: 'S01' },
      'Pagi Kak {nama}.\nPeregangan 5 menit setelah bangun sering membuat badan lebih enak seharian.\nBoleh dicoba kalau sempat.{personal}',
      'Selamat pagi Kak {nama}.\nKalau hari ini padat, cardio boleh dicicil, dua kali 10 menit juga baik.\nSaya doakan urusannya lancar.{personal}',
      { t: 'Pagi Kak {nama}.\nTarget yang dianjurkan itu sekitar 150 menit gerak dalam seminggu, kira-kira 20–30 menit sehari.\nHari ini kita ambil bagian kecilnya ya.{personal}', src: 'S13' },
      'Selamat pagi Kak {nama}.\nJalan santai 10 menit setelah makan siang enak untuk pencernaan.\nSemoga harinya menyenangkan.{personal}',
      'Pagi Kak {nama}.\nKalau sempat keluar sebentar, sinar matahari pagi dan sedikit jalan kaki bagus untuk badan dan suasana hati.{personal}',
      { t: 'Selamat pagi Kak {nama}.\nTidur yang cukup malam ini membantu mengatur rasa lapar besok.\nKalau bisa, istirahat sedikit lebih awal ya.{personal}', src: 'S10' },
      'Pagi Kak {nama}.\nHari ini satu hal kecil saja: gerak sedikit lebih banyak dari kemarin.\nSaya yakin Kakak bisa.{personal}',
      'Selamat pagi Kak {nama}.\nKalau badan terasa lelah, cardio ringan atau jalan santai sudah cukup.\nMendengarkan badan juga bagian dari hidup sehat.{personal}',
      'Pagi Kak {nama}, semoga sehat hari ini.\nMusik atau siniar kesukaan bisa membuat 20 menit cardio terasa singkat.\nSelamat mencoba ya.{personal}',
      { t: 'Selamat pagi Kak {nama}.\nMinuman manis kemasan sering menyumbang banyak gula tanpa terasa.\nAir putih atau teh tawar bisa jadi pilihan hari ini.{personal}', src: 'S16' },
      'Pagi Kak {nama}.\nKalau bepergian hari ini, turun sedikit lebih awal dan berjalan kaki bisa menambah langkah.\nHati-hati di jalan ya.{personal}',
      'Selamat pagi Kak {nama}.\nKonsisten sedikit demi sedikit lebih berarti daripada sempurna sesekali.\nTerima kasih sudah terus berusaha.{personal}',
      'Pagi Kak {nama}.\nKalau hari ini di rumah, jalan keliling lingkungan 20 menit bisa menyegarkan kepala.\nSemoga harinya tenang.{personal}',
      'Selamat pagi Kak {nama}.\nSarapan, air putih, lalu sedikit gerak.\nTiga hal kecil yang membuat hari terasa lebih bertenaga.{personal}',
      'Pagi Kak {nama}.\nKalau ada yang terasa pegal dari latihan, gerak ringan justru membantu pemulihan.\nKabari saya kalau ada yang mengganggu ya.{personal}',
      'Selamat pagi Kak {nama}.\nNapas dalam beberapa kali sebelum memulai hari membantu badan lebih rileks.\nSemoga harinya berjalan baik.{personal}',
      'Pagi Kak {nama}.\nLompat tali atau naik turun tangga 10 menit di rumah juga cardio yang baik.\nBoleh dipilih yang paling mudah untuk Kakak.{personal}',
      { t: 'Selamat pagi Kak {nama}.\nSetengah piring sayur dan buah saat makan membantu badan tetap bugar.\nHari ini boleh dicoba di satu waktu makan dulu.{personal}', src: 'S01' },
      'Pagi Kak {nama}.\nKalau sore nanti masih ada tenaga, jalan kaki 20–30 menit sudah sangat baik.\nKalau belum sempat, besok masih ada.{personal}',
      'Selamat pagi Kak {nama}.\nSemoga hari ini badannya terasa enak.\nSedikit cardio dan cukup minum, sisanya kita jalani pelan-pelan.{personal}',
      'Pagi Kak {nama}.\nMengurangi makan larut malam membantu tidur lebih nyenyak.\nKalau bisa, makan terakhir sekitar 3 jam sebelum tidur ya.{personal}',
      'Selamat pagi Kak {nama}.\nLangkah kaki hari ini bisa dilihat di ponsel atau jam tangan.\nBerapa pun angkanya, itu sudah usaha yang baik.{personal}',
      'Pagi Kak {nama}.\nSaya hanya ingin menyapa dan mengingatkan untuk menjaga badan hari ini.\nSemoga sehat selalu ya.{personal}'
    ],
    senin: [
      'Selamat pagi Kak {nama}, selamat memulai minggu baru.\nKita mulai dari yang ringan: jalan kaki 15–20 menit hari ini.\nSemoga minggunya lancar.{personal}',
      'Pagi Kak {nama}.\nSenin tidak perlu langsung berat.\nSegelas air, sarapan, dan sedikit gerak sudah awal yang baik.{personal}',
      'Selamat pagi Kak {nama}.\nMinggu ini boleh pilih satu kebiasaan kecil untuk dijaga, misalnya jalan kaki tiap sore.\nSaya temani dari sini ya.{personal}',
      'Pagi Kak {nama}, semoga akhir pekannya menyenangkan.\nHari ini kita kembali pelan-pelan: cardio ringan dan cukup minum.{personal}',
      { t: 'Selamat pagi Kak {nama}.\nUntuk minggu ini, sekitar 150 menit gerak sudah sesuai anjuran kesehatan.\nDicicil tiap hari terasa lebih ringan.{personal}', src: 'S13' },
      'Pagi Kak {nama}.\nAwal minggu waktu yang enak untuk merencanakan kapan mau bergerak.\nDua atau tiga jadwal kecil sudah cukup.{personal}',
      'Selamat pagi Kak {nama}.\nKalau Senin terasa padat, 10 menit peregangan dan jalan kaki tetap berarti.\nSemoga urusannya dimudahkan.{personal}',
      'Pagi Kak {nama}.\nMinggu baru, kesempatan baru untuk merawat badan.\nTerima kasih sudah mau memulai lagi hari ini.{personal}'
    ],
    jumat: [
      'Selamat pagi Kak {nama}.\nSudah sampai Jumat, terima kasih sudah menjaga badan minggu ini.\nJalan santai sore nanti bisa jadi penutup yang enak.{personal}',
      'Pagi Kak {nama}.\nMenjelang akhir pekan, cardio ringan 20 menit membantu badan tetap segar.\nSemoga harinya lancar.{personal}',
      'Selamat pagi Kak {nama}.\nKalau minggu ini belum banyak bergerak, tidak apa-apa.\nHari ini masih bisa jalan kaki sebentar.{personal}',
      'Pagi Kak {nama}, semoga Jumatnya membawa berkah.\nCukup minum dan sedikit gerak hari ini ya.{personal}',
      'Selamat pagi Kak {nama}.\nKalau ada rencana akhir pekan, boleh diselipkan satu kegiatan yang banyak jalan kakinya.\nSelamat beraktivitas.{personal}',
      'Pagi Kak {nama}.\nBadan sudah bekerja keras seminggu ini.\nPeregangan dan jalan santai hari ini bisa jadi cara berterima kasih.{personal}',
      'Selamat pagi Kak {nama}.\nSatu hari lagi sebelum akhir pekan.\nKalau sempat, 20 menit cardio ringan sudah sangat baik.{personal}',
      'Pagi Kak {nama}.\nTidur cukup malam ini membuat akhir pekan lebih bertenaga.\nSemoga hari ini berjalan baik.{personal}'
    ],
    sabtu: [
      'Selamat pagi Kak {nama}, selamat menikmati hari Sabtu.\nKalau ada waktu, jalan pagi 30 menit enak sekali untuk membuka hari.{personal}',
      'Pagi Kak {nama}.\nSabtu waktu yang longgar untuk bergerak tanpa terburu-buru.\nSepeda santai atau jalan cepat, mana yang Kakak suka.{personal}',
      'Selamat pagi Kak {nama}.\nKalau hari ini ingin istirahat, itu juga baik.\nJalan santai sebentar sudah cukup supaya badan tidak kaku.{personal}',
      'Pagi Kak {nama}.\nMumpung libur, boleh coba olahraga yang berbeda: renang, bulu tangkis, atau naik bukit.\nSelamat bersenang-senang.{personal}',
      'Selamat pagi Kak {nama}.\nBelanja ke pasar dengan berjalan kaki juga cardio yang menyenangkan.\nSemoga Sabtunya hangat.{personal}',
      'Pagi Kak {nama}.\nKalau ada teman atau keluarga yang mau diajak, jalan pagi bersama biasanya lebih seru.\nSendiri pun tetap baik.{personal}',
      'Selamat pagi Kak {nama}.\nUdara pagi di akhir pekan biasanya lebih segar.\nBoleh keluar sebentar dan berjalan 20–30 menit.{personal}',
      'Pagi Kak {nama}.\nKalau hari ini banyak acara, cukup jaga minum air dan sempatkan berjalan kaki.\nSelamat menikmati harinya.{personal}',
      'Selamat pagi Kak {nama}.\nSabtu pagi, joging pelan 20 menit lalu peregangan 10 menit.\nBadan terasa lebih ringan untuk seharian.{personal}',
      'Pagi Kak {nama}.\nTerima kasih sudah menjaga diri minggu ini.\nHari ini bergerak secukupnya dan nikmati waktunya ya.{personal}'
    ],
    minggu: [
      'Selamat pagi Kak {nama}, selamat hari Minggu.\nJalan santai pagi ini bisa menenangkan sebelum minggu baru.\nSemoga harinya damai.{personal}',
      'Pagi Kak {nama}.\nMinggu waktu yang baik untuk istirahat dan gerak ringan.\nPeregangan dan jalan kaki sebentar sudah cukup.{personal}',
      'Selamat pagi Kak {nama}.\nKalau ada hari bebas kendaraan di dekat Kakak, jalan pagi di sana menyenangkan.\nHati-hati dan selamat menikmati.{personal}',
      'Pagi Kak {nama}.\nSambil bersantai hari ini, boleh dipikirkan kapan mau bergerak minggu depan.\nRencana kecil membuatnya lebih mudah.{personal}',
      'Selamat pagi Kak {nama}.\nIstirahat yang cukup hari ini adalah bagian dari latihan juga.\nSemoga besok badannya segar.{personal}',
      'Pagi Kak {nama}.\nKalau cuaca mendukung, jalan kaki 30 menit pagi ini enak untuk badan dan pikiran.\nSelamat berhari Minggu.{personal}',
      'Selamat pagi Kak {nama}.\nMinggu pagi, cari sarapan sambil berjalan kaki bisa jadi kegiatan ringan yang menyenangkan.{personal}',
      'Pagi Kak {nama}.\nTidur lebih awal malam ini membantu Senin terasa lebih ringan.\nSemoga hari Minggunya menyenangkan.{personal}',
      'Selamat pagi Kak {nama}.\nHari ini cukup gerak ringan dan minum air yang cukup.\nSisanya waktu untuk Kakak beristirahat.{personal}',
      'Pagi Kak {nama}.\nTerima kasih untuk usahanya minggu ini.\nSemoga hari ini bisa mengisi tenaga untuk minggu depan.{personal}'
    ],
    weekend: [
      'Selamat pagi Kak {nama}, selamat menikmati hari libur.\nKalau sempat, jalan pagi 20–30 menit enak untuk membuka hari.{personal}',
      'Pagi Kak {nama}.\nHari libur waktu yang longgar untuk bergerak dengan santai.\nPilih kegiatan yang Kakak sukai ya.{personal}',
      'Selamat pagi Kak {nama}.\nLibur boleh dipakai istirahat.\nJalan santai sebentar membantu badan tetap enak.{personal}',
      'Pagi Kak {nama}.\nKalau hari ini bepergian, pilih yang banyak jalan kakinya bisa jadi cardio tanpa terasa.\nHati-hati di jalan.{personal}',
      'Selamat pagi Kak {nama}.\nSemoga liburnya menyenangkan.\nCukup minum air dan sedikit gerak hari ini ya.{personal}',
      'Pagi Kak {nama}.\nHari libur, joging pelan atau sepeda santai 30 menit terasa lebih nikmat karena tidak dikejar waktu.{personal}',
      'Selamat pagi Kak {nama}.\nKalau ada acara makan hari ini, jalan kaki sebentar sesudahnya membantu badan lebih nyaman.{personal}',
      'Pagi Kak {nama}.\nBoleh ajak orang terdekat berjalan pagi kalau ada.\nBergerak bersama biasanya lebih menyenangkan.{personal}',
      'Selamat pagi Kak {nama}.\nHari ini tidak perlu target apa pun.\nGerak ringan dan istirahat yang cukup sudah baik.{personal}',
      'Pagi Kak {nama}.\nSelamat berlibur.\nSemoga badan dan pikiran Kakak sama-sama segar setelah hari ini.{personal}'
    ]
  },

  // ── Makan pagi ──────────────────────────────────────────────────────────────
  'makan-pagi': {
    weekday: [
      { t: 'Selamat pagi Kak {nama}.\nKalau sempat, sarapan dengan lauk protein ya, tempe atau tahu sudah cukup.\nProtein di pagi hari membantu kenyang lebih lama.{tip}{personal}', src: 'S07' },
      { t: 'Pagi Kak {nama}.\nTelur dadar dan tumis kangkung dengan nasi secukupnya bisa jadi sarapan yang sederhana.\nSemoga harinya lancar.{tip}{personal}', tag: 'telur' },
      { t: 'Selamat pagi Kak {nama}.\nNasi pecel dengan tempe, sarapan yang mudah dicari dan sayurnya banyak.\nBumbunya boleh secukupnya saja.{tip}{personal}', tag: 'kacang' },
      'Pagi Kak {nama}.\nSegelas air putih sebelum sarapan membantu badan yang baru bangun.\nSetelah itu makan dengan tenang ya.{tip}{personal}',
      { t: 'Selamat pagi Kak {nama}.\nMembiasakan sarapan membantu tenaga dan konsentrasi sampai siang.\nPorsi kecil pun sudah baik.{tip}{personal}', src: 'S01' },
      'Pagi Kak {nama}.\nBubur ayam dengan suwiran ayam yang cukup bisa jadi pilihan sarapan hari ini.\nKerupuknya boleh sedikit saja.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKalau beli sarapan di luar, pilih yang ada lauknya, bukan hanya nasi atau mi.\nSemoga harinya menyenangkan.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nMakan pelan dan dikunyah lebih lama membuat rasa kenyang lebih terasa.\nBoleh dicoba di sarapan hari ini.{tip}{personal}', src: 'S08' },
      'Selamat pagi Kak {nama}.\nSatu buah di pagi hari, pisang atau pepaya, tambahan yang mudah dan murah.\nSelamat sarapan ya.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nTelur rebus dua butir dengan nasi atau roti, sarapan cepat yang proteinnya cukup.\nSemoga urusannya dimudahkan hari ini.{tip}{personal}', tag: 'telur' },
      'Selamat pagi Kak {nama}.\nSayur bening bayam dengan tahu dan nasi hangat enak untuk pagi.\nRingan di perut dan bergizi.{tip}{personal}',
      'Pagi Kak {nama}.\nKalau pagi belum berselera, mulai dari yang kecil saja: satu buah dan segelas air.\nNanti makan lagi saat sudah lapar.{tip}{personal}',
      { t: 'Selamat pagi Kak {nama}.\nKopi atau teh pagi tetap boleh.\nGulanya saja yang dikurangi sedikit demi sedikit, karena batas sehari sekitar 4 sendok makan.{tip}{personal}', src: 'S02' },
      'Pagi Kak {nama}.\nLontong sayur boleh untuk sarapan.\nKuah santannya secukupnya dan tambah lauk protein ya.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nUbi atau singkong rebus dengan tempe bisa jadi variasi sarapan yang mengenyangkan.\nSupaya tidak bosan.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nSarapan dengan lauk protein membantu menjaga otot yang sedang dilatih.\nTempe, tahu, atau ayam, mana yang ada saja.{tip}{personal}', tag: 'naik,recomp', src: 'S05' },
      { t: 'Selamat pagi Kak {nama}.\nSarapan yang berprotein biasanya membuat ngemil sebelum siang berkurang dengan sendirinya.\nBoleh dicoba hari ini.{tip}{personal}', tag: 'turun', src: 'S07' },
      'Pagi Kak {nama}.\nNasi dengan orek tempe dan sayur, sarapan warung yang lengkap.\nPorsi nasinya sesuai kebutuhan Kakak saja.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKalau membawa bekal, sarapan dan makan siang jadi lebih mudah diatur.\nKalau belum sempat, tidak apa-apa.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nSayur dan buah yang cukup membantu pencernaan lancar.\nSarapan hari ini boleh ditambah sedikit sayur.{tip}{personal}', src: 'S09' },
      'Selamat pagi Kak {nama}.\nPilihan sarapan yang dikukus atau direbus biasanya lebih ringan di perut.\nGorengan boleh sesekali saja.{tip}{personal}',
      'Pagi Kak {nama}.\nSarapan tidak harus banyak.\nYang penting ada sumber tenaga, lauk, dan sedikit sayur atau buah.{tip}{personal}',
      { t: 'Selamat pagi Kak {nama}.\nSegelas susu atau kedelai hangat bisa menemani sarapan.\nPilih yang gulanya sedikit ya.{tip}{personal}', tag: 'susu' },
      'Pagi Kak {nama}.\nKetupat tahu atau tahu campur juga sarapan yang baik.\nKuah dan kecapnya boleh secukupnya.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKalau waktu sempit, roti dengan isian tempe atau ayam bisa dimakan cepat.\nYang penting perut tidak kosong terlalu lama.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nMakan sambil duduk tenang, tanpa layar, membantu kita sadar kapan sudah cukup.\nSelamat sarapan.{tip}{personal}', src: 'S11' },
      { t: 'Selamat pagi Kak {nama}.\nNasi hangat, ikan pindang, dan lalapan, sarapan sederhana yang proteinnya baik.\nSemoga hari ini berjalan baik.{tip}{personal}', tag: 'seafood' },
      'Pagi Kak {nama}.\nKalau kemarin makannya kurang teratur, tidak perlu dipikirkan.\nHari ini kita mulai lagi dari sarapan.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nSoto ayam bening dengan nasi secukupnya enak untuk pagi.\nHangat dan ada proteinnya.{tip}{personal}',
      'Pagi Kak {nama}.\nSaya ingatkan dengan lembut ya, jangan lupa sarapan.\nSemoga sehat dan lancar hari ini.{tip}{personal}'
    ],
    senin: [
      'Selamat pagi Kak {nama}, semoga awal minggunya ringan.\nSarapan sederhana dengan lauk protein membantu Senin terasa lebih bertenaga.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nMemulai minggu dengan sarapan yang baik.\nTelur dadar, sayur, dan nasi secukupnya sudah lengkap.{tip}{personal}', tag: 'telur' },
      'Selamat pagi Kak {nama}.\nKalau akhir pekan kemarin makannya lebih bebas, tidak apa-apa.\nHari ini kita kembali ke pola biasa, mulai dari sarapan.{tip}{personal}',
      'Pagi Kak {nama}.\nSenin sering terburu-buru.\nKalau tidak sempat duduk, buah dan sepotong tempe pun sudah membantu.{tip}{personal}',
      { t: 'Selamat pagi Kak {nama}.\nMinggu ini boleh coba satu hal: setengah piring diisi sayur dan buah.\nMulai dari satu waktu makan dulu.{tip}{personal}', src: 'S01' },
      'Pagi Kak {nama}, selamat memulai minggu.\nAir putih dulu, lalu sarapan dengan tenang.\nSemoga minggunya lancar.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nNasi dengan tahu, tempe, dan sayur bening, sarapan yang ramah di kantong dan cukup gizinya.{tip}{personal}',
      'Pagi Kak {nama}.\nSaya doakan minggu ini berjalan baik.\nKita awali dengan sarapan ya.{tip}{personal}'
    ],
    jumat: [
      'Selamat pagi Kak {nama}.\nSudah Jumat, terima kasih sudah menjaga makan minggu ini.\nSarapan hari ini seperti biasa ya.{tip}{personal}',
      'Pagi Kak {nama}.\nKalau siang ini ada acara makan bersama, sarapan yang ringan dan berprotein membantu badan tetap nyaman.{tip}{personal}',
      { t: 'Selamat pagi Kak {nama}.\nNasi kuning boleh untuk Jumat pagi.\nTambah telur atau tempe supaya proteinnya cukup.{tip}{personal}', tag: 'telur' },
      'Pagi Kak {nama}, semoga Jumatnya penuh berkah.\nSarapan dan air putih yang cukup untuk menemani hari ini.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nMenjelang akhir pekan, sarapan teratur membantu pola makan tetap enak.\nSemoga harinya lancar.{tip}{personal}',
      'Pagi Kak {nama}.\nBubur kacang hijau tanpa banyak santan bisa jadi sarapan hangat hari ini.\nSelamat menikmati.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKalau minggu ini ada sarapan yang terlewat, tidak perlu merasa bersalah.\nHari ini kita isi lagi.{tip}{personal}',
      'Pagi Kak {nama}.\nSayur sop dengan ayam dan nasi secukupnya, sarapan hangat yang bergizi.\nSemoga Jumatnya menyenangkan.{tip}{personal}'
    ],
    sabtu: [
      'Selamat pagi Kak {nama}, selamat hari Sabtu.\nMumpung tidak terburu-buru, sarapan bisa dinikmati pelan-pelan.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nSabtu pagi enak untuk memasak sarapan sendiri.\nTelur dadar dengan sayur mudah dan cepat.{tip}{personal}', tag: 'telur' },
      'Selamat pagi Kak {nama}.\nKalau bangun lebih siang, tetap makan sesuatu dulu ya sebelum makan siang.\nBuah pun cukup.{tip}{personal}',
      'Pagi Kak {nama}.\nKalau ke pasar pagi ini, sekalian beli buah dan sayur untuk beberapa hari ke depan.\nSelamat berbelanja.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKalau sarapan di luar, pilih yang ada lauk proteinnya dan minumnya air putih.\nSelamat menikmati Sabtunya.{tip}{personal}',
      'Pagi Kak {nama}.\nNasi uduk boleh untuk akhir pekan.\nPorsinya biasa saja dan tambah lauk yang tidak digoreng kalau ada.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nSetelah olahraga pagi, sarapan dengan protein dan nasi membantu badan pulih.\nSemoga harinya menyenangkan.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nGado-gado atau karedok bisa jadi sarapan agak siang yang sayurnya banyak.\nBumbu kacangnya secukupnya.{tip}{personal}', tag: 'kacang' },
      'Selamat pagi Kak {nama}.\nHari libur, sarapan tetap jadi awal yang baik.\nSemoga Sabtunya hangat bersama orang-orang terdekat.{tip}{personal}',
      'Pagi Kak {nama}.\nBubur ayam, lontong, atau nasi uduk, pilih satu yang Kakak suka.\nDinikmati tanpa rasa bersalah ya.{tip}{personal}'
    ],
    minggu: [
      'Selamat pagi Kak {nama}, selamat hari Minggu.\nSarapan santai hari ini, yang penting tetap ada lauk dan sayurnya.{tip}{personal}',
      'Pagi Kak {nama}.\nMinggu pagi enak untuk sarapan pelan-pelan.\nTidak perlu terburu-buru, dinikmati saja.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKalau hari ini sempat, menyiapkan bahan sarapan untuk beberapa hari bisa memudahkan minggu depan.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nTelur rebus dan sayur yang disiapkan hari ini bisa jadi bekal sarapan Senin.\nKalau sempat saja ya.{tip}{personal}', tag: 'telur' },
      'Selamat pagi Kak {nama}.\nKalau sarapan bersama orang terdekat, ambil lauk dan sayur dulu, nasinya menyusul.\nSelamat menikmati.{tip}{personal}',
      'Pagi Kak {nama}.\nJajanan pasar boleh untuk Minggu pagi.\nPilih satu atau dua yang paling Kakak inginkan.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nSoto atau sop hangat dengan nasi secukupnya enak untuk sarapan hari libur.\nSemoga harinya tenang.{tip}{personal}',
      'Pagi Kak {nama}.\nBuah potong di pagi hari menyegarkan.\nPepaya, semangka, atau pisang, mana yang ada di rumah.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nTerima kasih sudah menjaga makan minggu ini.\nHari ini sarapan dengan santai ya.{tip}{personal}',
      'Pagi Kak {nama}.\nSemoga hari Minggunya menyenangkan.\nJangan lupa sarapan dan minum air yang cukup.{tip}{personal}'
    ],
    weekend: [
      'Selamat pagi Kak {nama}, selamat hari libur.\nSarapan tetap jadi awal yang baik walau harinya santai.{tip}{personal}',
      'Pagi Kak {nama}.\nHari libur, sarapan bisa dinikmati tanpa terburu-buru.\nLauk protein dan sedikit sayur sudah cukup.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKalau hari ini bepergian, sarapan dulu sebelum berangkat membantu badan tetap bertenaga.{tip}{personal}',
      'Pagi Kak {nama}.\nKalau bangun lebih siang, buah dan segelas air bisa jadi pembuka sebelum makan berikutnya.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nMakan di luar hari ini tetap bisa seimbang.\nPilih yang ada lauk dan sayurnya, minumnya air putih.{tip}{personal}',
      'Pagi Kak {nama}.\nLibur waktu yang enak untuk memasak sarapan sederhana di rumah.\nTumis sayur dan tahu, misalnya.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKalau ada hidangan khusus hari ini, dinikmati saja secukupnya.\nSemoga liburnya menyenangkan.{tip}{personal}',
      'Pagi Kak {nama}.\nSarapan ringan pagi ini membantu makan siang nanti lebih terkendali.\nSelamat berlibur.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nNasi hangat, tempe, dan sayur bening, sederhana dan menenangkan untuk pagi hari libur.{tip}{personal}',
      'Pagi Kak {nama}.\nSemoga hari liburnya membawa istirahat yang cukup.\nJangan lupa sarapan ya.{tip}{personal}'
    ]
  },

  // ── Makan sore ──────────────────────────────────────────────────────────────
  'makan-sore': {
    weekday: [
      'Selamat sore Kak {nama}.\nSebentar lagi waktu makan malam.\nSetengah piring sayur membuat makan terasa ringan dan tetap kenyang.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nSayur bening dengan ikan pindang dan nasi secukupnya bisa jadi makan malam yang ringan.\nSelamat beristirahat nanti.{tip}{personal}', tag: 'seafood' },
      'Selamat sore Kak {nama}.\nPepes tahu atau tempe bacem dengan lalapan, lauk malam yang mudah dicari.\nSemoga harinya menyenangkan.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nLauk protein saat makan malam membantu otot pulih selama tidur.\nAyam, tahu, atau tempe sama baiknya.{tip}{personal}', src: 'S05' },
      'Selamat sore Kak {nama}.\nKalau bisa, makan malam sekitar 3 jam sebelum tidur supaya tidurnya lebih nyaman.{tip}{personal}',
      'Sore Kak {nama}.\nKalau sudah lapar sebelum makan malam, buah atau segenggam kacang rebus bisa mengganjal dulu.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nMakan pelan-pelan membantu badan sempat merasa kenyang.\nNikmati setiap suapannya ya.{tip}{personal}', src: 'S08' },
      'Sore Kak {nama}.\nSup sayur hangat dengan ayam, ringan tetapi mengenyangkan.\nCocok setelah hari yang panjang.{tip}{personal}',
      'Selamat sore Kak {nama}.\nKalau membeli makan di warung, lauk tumis atau sayur bening dengan nasi secukupnya pilihan yang baik.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nPiring yang sedikit lebih kecil membantu porsi terasa pas tanpa perlu menghitung.\nBoleh dicoba malam ini.{tip}{personal}', tag: 'turun,porsi', src: 'S17' },
      'Selamat sore Kak {nama}.\nSayur dimakan lebih dulu, baru nasi dan lauk.\nCara sederhana supaya sayurnya tidak terlewat.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nPecel lele dengan lalapan boleh untuk malam ini.\nLalapannya dihabiskan ya, sambalnya sesuai selera.{tip}{personal}', tag: 'seafood' },
      'Selamat sore Kak {nama}.\nHari ini sudah cukup minum?\nSegelas air sebelum makan malam membantu melengkapinya.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nMakanan yang terlalu asin membuat badan menahan air.\nGaram sehari cukup sekitar satu sendok teh.{tip}{personal}', src: 'S02' },
      'Selamat sore Kak {nama}.\nTumis buncis dengan tempe dan nasi hangat, cepat dimasak dan seimbang.\nSelamat makan malam nanti.{tip}{personal}',
      'Sore Kak {nama}.\nKalau siang tadi makannya banyak, malam ini boleh yang lebih ringan.\nBadan biasanya tahu kebutuhannya.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nMakan tanpa sambil melihat layar membantu kita sadar kapan sudah cukup.\nBoleh dicoba malam ini.{tip}{personal}', src: 'S11' },
      'Sore Kak {nama}.\nCapek setelah seharian?\nMakan malam yang hangat dan sederhana sudah cukup, tidak perlu repot.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nTelur ceplok air atau telur rebus dengan sayur bisa jadi lauk malam yang cepat.\nSemoga istirahatnya nyenyak.{tip}{personal}', tag: 'telur' },
      'Sore Kak {nama}.\nKalau memesan makanan malam ini, pilih yang ada sayurnya ya.\nSelamat menikmati.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nProtein yang dibagi rata di tiap waktu makan lebih baik untuk otot daripada dikumpulkan di satu waktu.\nMalam ini jangan lupa lauknya.{tip}{personal}', tag: 'naik,recomp', src: 'S05' },
      { t: 'Sore Kak {nama}.\nSayur dan lauk protein yang cukup membuat makan malam mengenyangkan walau nasinya tidak banyak.{tip}{personal}', tag: 'turun', src: 'S07' },
      'Selamat sore Kak {nama}.\nBuah potong setelah makan malam bisa jadi penutup yang manis dan segar.{tip}{personal}',
      'Sore Kak {nama}.\nSayur asem dengan tahu, tempe, dan nasi secukupnya enak untuk malam ini.\nSelamat beristirahat.{tip}{personal}',
      'Selamat sore Kak {nama}.\nKalau malam ini masih ada pekerjaan, sempatkan makan dulu ya.\nBadan perlu diisi supaya tetap kuat.{tip}{personal}',
      'Sore Kak {nama}.\nMasakan berkuah santan lebih enak dinikmati siang hari.\nMalam ini boleh pilih yang kuahnya bening.{tip}{personal}',
      'Selamat sore Kak {nama}.\nAyam bakar atau ayam kecap dengan lalapan, makan malam yang mudah dicari.\nNasinya sesuai kebutuhan Kakak.{tip}{personal}',
      'Sore Kak {nama}.\nKalau setelah makan masih ingin tambah, tunggu beberapa menit dulu.\nRasa kenyang kadang datang belakangan.{tip}{personal}',
      'Selamat sore Kak {nama}.\nJalan santai 10 menit setelah makan malam membantu pencernaan.\nKalau sempat saja ya.{tip}{personal}',
      'Sore Kak {nama}.\nSemoga harinya berjalan baik.\nKita tutup dengan makan malam yang tenang dan bergizi.{tip}{personal}'
    ],
    senin: [
      'Selamat sore Kak {nama}.\nSenin sudah hampir selesai, terima kasih sudah melewatinya.\nMakan malam yang hangat dan sederhana ya.{tip}{personal}',
      'Sore Kak {nama}.\nAwal minggu, makan malam dengan sayur dan lauk protein membantu badan pulih untuk esok.{tip}{personal}',
      'Selamat sore Kak {nama}.\nKalau hari ini terasa panjang, tidak perlu memasak yang rumit.\nSayur bening dan tahu tempe sudah cukup.{tip}{personal}',
      'Sore Kak {nama}.\nMinggu ini boleh coba makan malam sedikit lebih awal dari biasanya.\nTidur biasanya jadi lebih enak.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nTumis kangkung dan telur dadar, makan malam Senin yang cepat dan mengenyangkan.{tip}{personal}', tag: 'telur' },
      'Sore Kak {nama}.\nSemoga Seninnya lancar.\nSegelas air sebelum makan malam dan makan dengan tenang ya.{tip}{personal}',
      'Selamat sore Kak {nama}.\nSop ayam dengan wortel dan kentang, hangat untuk menutup hari pertama minggu ini.{tip}{personal}',
      'Sore Kak {nama}.\nSatu hari sudah terlewati dengan baik.\nSelamat makan malam dan beristirahat.{tip}{personal}'
    ],
    jumat: [
      'Selamat sore Kak {nama}.\nAkhir minggu kerja sudah di depan.\nKalau malam ini makan di luar, pilih yang ada sayurnya ya.{tip}{personal}',
      'Sore Kak {nama}.\nJumat malam boleh makan yang Kakak suka.\nDinikmati pelan-pelan supaya puasnya terasa.{tip}{personal}',
      'Selamat sore Kak {nama}.\nTerima kasih sudah menjaga makan sepanjang minggu ini.\nMalam ini makan dengan santai ya.{tip}{personal}',
      'Sore Kak {nama}.\nKalau ada acara makan malam ini, lauk yang dibakar atau dikukus biasanya lebih ringan di perut.{tip}{personal}',
      'Selamat sore Kak {nama}.\nSate ayam dengan lontong secukupnya dan lalapan bisa jadi pilihan Jumat malam.\nSelamat menikmati.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nMinuman manis di tempat makan sering lebih banyak gulanya daripada yang kita kira.\nAir putih atau teh tawar bisa jadi teman makan.{tip}{personal}', src: 'S16' },
      'Selamat sore Kak {nama}.\nKalau minggu ini melelahkan, makan malam hangat di rumah dan tidur lebih awal terasa menyenangkan.{tip}{personal}',
      'Sore Kak {nama}.\nSemoga akhir pekannya menyenangkan.\nMalam ini makan secukupnya dan istirahat yang baik.{tip}{personal}'
    ],
    sabtu: [
      'Selamat sore Kak {nama}.\nMalam Minggu boleh makan enak.\nSayurnya tetap diajak ya supaya badan nyaman.{tip}{personal}',
      'Sore Kak {nama}.\nKalau malam ini makan di luar, menu bakar atau kukus pilihan yang ringan.\nSelamat menikmati.{tip}{personal}',
      'Selamat sore Kak {nama}.\nMakanan kesukaan boleh dinikmati malam ini.\nSatu kali makan yang menyenangkan tidak merusak usaha Kakak.{tip}{personal}',
      'Sore Kak {nama}.\nMartabak atau jajanan malam enak dibagi bersama.\nBeberapa potong sudah cukup untuk menikmatinya.{tip}{personal}',
      'Selamat sore Kak {nama}.\nKalau berkumpul malam ini, ambil lauk dan sayur dulu.\nObrolannya dinikmati, makannya jadi lebih pelan.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nIkan bakar dengan lalapan dan sambal, makan malam akhir pekan yang nikmat dan bergizi.{tip}{personal}', tag: 'seafood,mahal' },
      'Selamat sore Kak {nama}.\nSabtu sore enak untuk memasak sesuatu yang baru di rumah.\nTumisan sayur dengan ayam, misalnya.{tip}{personal}',
      'Sore Kak {nama}.\nKalau seharian banyak di luar, jangan lupa minum air putih yang cukup malam ini.{tip}{personal}',
      'Selamat sore Kak {nama}.\nMakan malam akhir pekan tidak perlu terlalu larut walau besok libur.\nTidurnya jadi lebih enak.{tip}{personal}',
      'Sore Kak {nama}.\nSelamat menikmati malam Minggu.\nMakan yang menyenangkan, secukupnya saja.{tip}{personal}'
    ],
    minggu: [
      'Selamat sore Kak {nama}.\nMinggu malam enaknya makan yang ringan dan hangat.\nSemoga besok memulai minggu dengan badan segar.{tip}{personal}',
      'Sore Kak {nama}.\nSayur bening dan lauk sederhana malam ini membantu perut nyaman untuk Senin pagi.{tip}{personal}',
      'Selamat sore Kak {nama}.\nKalau sempat, menyiapkan lauk untuk bekal besok bisa memudahkan awal minggu.\nKalau tidak sempat, tidak apa-apa.{tip}{personal}',
      'Sore Kak {nama}.\nTerima kasih untuk usahanya minggu ini.\nMalam ini makan dengan tenang dan istirahat lebih awal ya.{tip}{personal}',
      'Selamat sore Kak {nama}.\nSop sayur dengan tahu, penutup akhir pekan yang ringan.\nSelamat beristirahat.{tip}{personal}',
      'Sore Kak {nama}.\nKalau akhir pekan ini makannya lebih banyak, itu wajar.\nBesok kita kembali ke pola biasa dengan santai.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nTidur yang cukup malam ini membantu mengatur rasa lapar besok.\nMakan malam lebih awal bisa membantu.{tip}{personal}', src: 'S10' },
      'Sore Kak {nama}.\nBuah dan air putih yang cukup malam ini, persiapan kecil untuk minggu baru.{tip}{personal}',
      'Selamat sore Kak {nama}.\nNasi hangat, tempe, dan sayur, makan malam sederhana untuk menutup hari Minggu.{tip}{personal}',
      'Sore Kak {nama}.\nSemoga akhir pekannya menyenangkan.\nSelamat makan malam dan sampai jumpa di minggu yang baru.{tip}{personal}'
    ],
    weekend: [
      'Selamat sore Kak {nama}.\nHari libur boleh makan enak.\nSayur dan lauk protein tetap diajak ya.{tip}{personal}',
      'Sore Kak {nama}.\nKalau hari ini ada hidangan khusus, dinikmati saja secukupnya.\nSelamat berkumpul.{tip}{personal}',
      'Selamat sore Kak {nama}.\nMakan malam di hari libur, menu bakar atau berkuah bening biasanya lebih ringan.{tip}{personal}',
      'Sore Kak {nama}.\nKalau seharian banyak camilan, makan malam yang ringan dengan sayur sudah cukup.{tip}{personal}',
      'Selamat sore Kak {nama}.\nSemoga liburnya menyenangkan.\nJangan lupa minum air putih yang cukup malam ini.{tip}{personal}',
      'Sore Kak {nama}.\nMakanan kesukaan boleh dinikmati hari ini.\nPelan-pelan saja supaya puasnya terasa.{tip}{personal}',
      'Selamat sore Kak {nama}.\nKalau besok kembali beraktivitas, makan malam yang tidak terlalu larut membantu tidur lebih nyenyak.{tip}{personal}',
      'Sore Kak {nama}.\nSayur sop atau sayur bening dengan lauk sederhana, pilihan yang menenangkan untuk malam hari libur.{tip}{personal}',
      'Selamat sore Kak {nama}.\nBuah potong bisa jadi penutup makan malam yang segar hari ini.{tip}{personal}',
      'Sore Kak {nama}.\nSelamat menikmati sisa hari liburnya.\nMakan malam yang tenang dan istirahat yang cukup ya.{tip}{personal}'
    ]
  },

  // ── Makan sesuai jadwal latihan (dipilih dari data jadwal klien) ────────────
  'makan-pagi-latihan': {
    semua: [
      { t: 'Pagi Kak {nama}.\nHari ini kita latihan jam {jam}.\nMakan ringan 1–2 jam sebelumnya, pisang atau roti, membantu tenaganya lebih enak.{tip}{personal}', src: 'S06' },
      'Selamat pagi Kak {nama}.\nNanti jam {jam} kita latihan.\nSarapan dengan nasi dan lauk protein secukupnya supaya badan siap.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nAda sesi jam {jam} hari ini.\nMinum air yang cukup dari pagi supaya latihan dimulai dalam keadaan segar.{tip}{personal}', src: 'S14' },
      'Selamat pagi Kak {nama}.\nUntuk sesi jam {jam} nanti, makan besar sebaiknya selesai 2–3 jam sebelumnya.\nSupaya perut nyaman saat bergerak.{tip}{personal}',
      'Pagi Kak {nama}.\nHari latihan, jam {jam}.\nSarapan seperti biasa ya, tidak perlu dikurangi. Badan butuh tenaganya.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nKita bertemu jam {jam}.\nKalau sesinya pagi, buah atau roti sebelum berangkat sudah cukup.{tip}{personal}',
      'Pagi Kak {nama}.\nSesi hari ini jam {jam}.\nKalau ada yang terasa kurang enak di badan, kabari saya ya, nanti kita sesuaikan.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nJam {jam} nanti kita latihan.\nNasi, lauk, dan sayur di waktu makan sebelum sesi sudah bekal yang baik.{tip}{personal}',
      'Pagi Kak {nama}.\nHari ini ada latihan jam {jam}.\nBawa air minum ya, dan makan dulu sebelum berangkat.{tip}{personal}',
      { t: 'Selamat pagi Kak {nama}.\nSebelum sesi jam {jam}, pisang dengan segelas air bisa jadi bekal tenaga yang praktis.{tip}{personal}', src: 'S06' },
      'Pagi Kak {nama}.\nSampai bertemu jam {jam}.\nSarapan yang cukup membantu latihan terasa lebih kuat.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nHari ini jadwal kita jam {jam}.\nMakan teratur dan minum cukup, sisanya kita kerjakan bersama.{tip}{personal}'
    ]
  },
  'makan-pagi-pulih': {
    semua: [
      { t: 'Pagi Kak {nama}, terima kasih untuk latihannya kemarin.\nSarapan dengan lauk protein membantu otot pulih.\nTempe, tahu, atau ayam, mana yang ada.{tip}{personal}', src: 'S05' },
      'Selamat pagi Kak {nama}.\nBagaimana badannya setelah latihan kemarin?\nSarapan yang cukup dan air putih membantu pemulihan.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nSetelah latihan kemarin, telur dan nasi hangat bisa jadi sarapan pemulihan yang sederhana.{tip}{personal}', tag: 'telur' },
      'Selamat pagi Kak {nama}.\nKalau hari ini agak pegal, itu wajar setelah latihan.\nMakan teratur dan gerak ringan membantu.{tip}{personal}',
      'Pagi Kak {nama}.\nKemarin Kakak sudah berusaha dengan baik.\nHari ini kita isi lagi tenaganya, mulai dari sarapan.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nHari setelah latihan, badan masih bekerja memperbaiki otot.\nJangan lupa sarapan ya.{tip}{personal}',
      'Pagi Kak {nama}.\nMinum air yang cukup hari ini membantu badan pulih setelah sesi kemarin.\nSarapannya juga ya.{tip}{personal}',
      { t: 'Selamat pagi Kak {nama}.\nProtein di setiap waktu makan hari ini membantu hasil latihan kemarin.\nSarapan bisa jadi awalnya.{tip}{personal}', src: 'S05' },
      'Pagi Kak {nama}.\nTerima kasih sudah datang latihan kemarin.\nSarapan hari ini boleh ditambah sedikit lauk.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nSayur, lauk, dan nasi secukupnya pagi ini.\nBadan yang habis berlatih senang diberi makan yang baik.{tip}{personal}',
      'Pagi Kak {nama}.\nKalau ada bagian yang terasa nyeri tidak biasa setelah kemarin, kabari saya ya.\nSelamat sarapan.{tip}{personal}',
      'Selamat pagi Kak {nama}.\nSatu sesi lagi sudah terlewati.\nKita lanjutkan dengan sarapan yang baik hari ini.{tip}{personal}'
    ]
  },
  'makan-sore-latihan': {
    semua: [
      { t: 'Sore Kak {nama}, terima kasih untuk latihan hari ini.\nMakan malamnya boleh ditambah lauk protein ya, untuk membantu pemulihan otot.{tip}{personal}', src: 'S05' },
      'Selamat sore Kak {nama}.\nHari ini hari latihan.\nMakan malam dengan nasi, lauk, dan sayur membantu badan mengisi tenaga lagi.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nSetelah berlatih, makan dalam satu sampai dua jam membantu pemulihan.\nTidak perlu menunggu terlalu lama.{tip}{personal}', src: 'S06' },
      'Selamat sore Kak {nama}.\nDi hari latihan, minum air yang cukup sampai malam ya.\nBadan kehilangan cairan lewat keringat.{tip}{personal}',
      'Sore Kak {nama}.\nHari latihan bukan hari untuk mengurangi makan.\nMakan malam yang cukup membantu hasilnya.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nTelur, tahu, atau tempe dengan sayur dan nasi, makan malam yang pas untuk hari latihan.{tip}{personal}', tag: 'telur' },
      'Sore Kak {nama}.\nTerima kasih sudah meluangkan waktu untuk latihan hari ini.\nSelamat makan malam dan beristirahat.{tip}{personal}',
      'Selamat sore Kak {nama}.\nAyam atau tempe dengan sayur dan nasi malam ini membantu otot yang tadi bekerja.{tip}{personal}',
      'Sore Kak {nama}.\nKalau sesinya malam, makan ringan dulu sekarang dan makan lagi sesudahnya.\nSupaya tenaganya terjaga.{tip}{personal}',
      'Selamat sore Kak {nama}.\nTidur cukup malam ini sama pentingnya dengan latihannya.\nMakan malam jangan terlalu larut ya.{tip}{personal}',
      'Sore Kak {nama}.\nHari latihan, badan senang diberi sayur, lauk, dan nasi yang cukup.\nSelamat menikmati makan malamnya.{tip}{personal}',
      'Selamat sore Kak {nama}.\nUsaha Kakak hari ini saya hargai.\nSekarang giliran makan yang baik dan istirahat.{tip}{personal}'
    ]
  },

  // ── Klien baru: 14 hari pertama, satu dasar per hari (urut hari ke-1 … ke-14) ──
  'makan-pagi-baru': {
    semua: [
      'Selamat pagi Kak {nama}, selamat bergabung.\nSelama dua minggu ini saya kirim satu hal kecil tentang makan tiap hari.\nHari ini cukup satu: sarapan, apa pun yang ada.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nHal kecil hari ini: segelas air putih setelah bangun.\nSekitar 8 gelas sehari sudah baik untuk badan.{tip}{personal}', src: 'S01' },
      { t: 'Selamat pagi Kak {nama}.\nHari ini kita kenalan dengan Isi Piringku: setengah piring sayur dan buah, setengahnya lagi nasi dan lauk.\nTidak harus langsung pas.{tip}{personal}', src: 'S01' },
      { t: 'Pagi Kak {nama}.\nHal kecil hari ini: ada lauk protein di sarapan.\nTempe, tahu, atau ayam membantu kenyang lebih lama.{tip}{personal}', src: 'S07' },
      'Selamat pagi Kak {nama}.\nBagaimana empat hari pertamanya?\nHari ini coba tambah satu buah, kapan saja.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nHal kecil hari ini: makan sedikit lebih pelan.\nMengunyah lebih lama membantu badan merasa cukup.{tip}{personal}', src: 'S08' },
      'Selamat pagi Kak {nama}, sudah satu minggu.\nTerima kasih sudah mengikuti sampai sini.\nHari ini sarapan seperti biasa saja ya.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nMinggu kedua, hal kecil hari ini: minuman manis diganti air putih satu kali saja.\nPelan-pelan sudah cukup.{tip}{personal}', src: 'S16' },
      'Selamat pagi Kak {nama}.\nHal kecil hari ini: sayur di dua waktu makan.\nSayur bening atau lalapan pun terhitung.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nHari ini tentang gula: batasnya sekitar 4 sendok makan sehari, termasuk yang ada di minuman.\nCukup diperhatikan dulu, belum perlu diubah.{tip}{personal}', src: 'S02' },
      'Selamat pagi Kak {nama}.\nHal kecil hari ini: makan sebelum terlalu lapar.\nMakan teratur membuat porsi lebih mudah terasa pas.{tip}{personal}',
      { t: 'Pagi Kak {nama}.\nKalau Kakak mencatat makan di portal, itu membantu saya memahami pola Kakak.\nSebisanya saja, tidak perlu lengkap.{tip}{personal}', src: 'S12' },
      'Selamat pagi Kak {nama}.\nHampir dua minggu.\nDari hal-hal kecil kemarin, pilih satu yang paling mudah untuk terus dijaga.{tip}{personal}',
      'Pagi Kak {nama}, hari ke-14.\nTerima kasih sudah berusaha dua minggu ini.\nMulai besok saya menyapa sekali sehari, dan Kakak selalu boleh bertanya kapan saja.{tip}{personal}'
    ]
  },
  'makan-sore-baru': {
    semua: [
      'Selamat sore Kak {nama}.\nHari pertama, tidak ada yang perlu diubah dulu.\nMakan malam seperti biasa dan istirahat yang cukup ya.{tip}{personal}',
      'Sore Kak {nama}.\nMalam ini cukup satu hal: ada sayur di piring.\nSedikit pun sudah awal yang baik.{tip}{personal}',
      'Selamat sore Kak {nama}.\nIngat Isi Piringku tadi pagi?\nMalam ini boleh dicoba kira-kira saja, tidak perlu diukur.{tip}{personal}',
      { t: 'Sore Kak {nama}.\nMalam ini lauk proteinnya jangan terlewat ya.\nProtein membantu otot pulih setelah mulai berlatih.{tip}{personal}', src: 'S05' },
      'Selamat sore Kak {nama}.\nKalau bisa, makan malam sekitar 3 jam sebelum tidur.\nTidur biasanya lebih nyenyak.{tip}{personal}',
      'Sore Kak {nama}.\nMalam ini coba makan tanpa terburu-buru.\nNikmati rasanya, berhenti saat sudah nyaman.{tip}{personal}',
      'Selamat sore Kak {nama}.\nSatu minggu sudah lewat, saya senang Kakak masih bersama saya.\nMalam ini makan yang Kakak suka, secukupnya.{tip}{personal}',
      'Sore Kak {nama}.\nMalam ini air putih jadi teman makan ya.\nKebiasaan kecil yang mudah dijaga.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nSayur dan buah sekitar lima porsi sehari itu anjurannya.\nMalam ini kita tambah satu porsi dulu.{tip}{personal}', src: 'S19' },
      'Sore Kak {nama}.\nLauk yang direbus, dikukus, atau dibakar bisa jadi selingan dari yang digoreng.\nBoleh dicoba malam ini.{tip}{personal}',
      'Selamat sore Kak {nama}.\nKalau lapar sebelum makan malam, buah bisa mengganjal dulu.\nSupaya makannya tetap tenang.{tip}{personal}',
      'Sore Kak {nama}.\nKalau hari ini makannya tidak sesuai rencana, tidak apa-apa.\nSatu hari tidak menghapus usaha Kakak.{tip}{personal}',
      { t: 'Selamat sore Kak {nama}.\nTidur cukup membantu mengatur rasa lapar.\nMalam ini boleh istirahat sedikit lebih awal.{tip}{personal}', src: 'S10' },
      'Sore Kak {nama}.\nDua minggu pertama selesai, terima kasih.\nKalau ada yang terasa sulit soal makan, cerita saja ya. Kita cari cara yang nyaman untuk Kakak.{tip}{personal}'
    ]
  },

  // ── Sapaan Rabu: tanpa saran, hanya menanyakan kabar ───────────────────────
  'makan-cek': {
    semua: [
      'Sore Kak {nama}.\nSaya hanya ingin menanyakan kabar, bagaimana makannya minggu ini?\nKalau ada yang terasa sulit, cerita saja ya.{personal}',
      'Selamat sore Kak {nama}.\nSudah pertengahan minggu.\nAda yang ingin Kakak tanyakan atau ceritakan soal makan? Saya senang mendengarnya.{personal}',
      'Sore Kak {nama}, apa kabar?\nTidak ada saran hari ini, saya hanya ingin tahu bagaimana perasaan Kakak dengan pola makannya.{personal}',
      'Selamat sore Kak {nama}.\nBagaimana badannya minggu ini, bertenaga atau mudah lelah?\nKabari saya ya, supaya bisa saya sesuaikan.{personal}',
      'Sore Kak {nama}.\nKalau ada makanan yang sulit dihindari atau jadwal yang membuat makan tidak teratur, ceritakan saja.\nKita cari jalan tengahnya.{personal}',
      'Selamat sore Kak {nama}.\nTerima kasih sudah berusaha sampai pertengahan minggu ini.\nAda yang bisa saya bantu?{personal}',
      'Sore Kak {nama}.\nSaya ingin memastikan Kakak baik-baik saja.\nBagaimana makan dan istirahatnya beberapa hari ini?{personal}',
      'Selamat sore Kak {nama}.\nApa yang paling mudah dijalani minggu ini, dan apa yang paling berat?\nJawab sesempatnya saja ya.{personal}',
      'Sore Kak {nama}.\nTidak perlu sempurna, saya hanya ingin tahu kabarnya.\nKalau ada yang mengganjal, saya siap mendengarkan.{personal}',
      'Selamat sore Kak {nama}.\nKalau saran saya ada yang kurang cocok dengan keseharian Kakak, beri tahu saya ya.\nSupaya bisa saya perbaiki.{personal}',
      'Sore Kak {nama}, semoga sehat.\nBagaimana selera makannya minggu ini?\nCerita sedikit pun sangat membantu saya.{personal}',
      'Selamat sore Kak {nama}.\nSaya menghargai usaha Kakak selama ini.\nAda kabar yang ingin dibagikan hari ini?{personal}'
    ]
  },

  // ── Sesi besok (19:00) ──────────────────────────────────────────────────────
  'sesi-besok': {
    weekday: [
      'Kak {nama}, besok kita latihan jam {jam} {coach} ya.\nTidur cukup malam ini\nsupaya besok bugar. 💪{tidur}{personal}',
      'Selamat malam Kak {nama}.\nMengingatkan sesi latihan besok pukul {jam} {coach}.\nSampai bertemu besok.{tidur}{personal}',
      'Halo Kak {nama}!\nJangan lupa besok jam {jam} ada sesi {coach}.\nBawa botol minum sama handuk kecil ya.{tidur}{personal}',
      'Malam Kak {nama}.\nBesok jam {jam} kita latihan {coach}.\nMakan ringan 1–2 jam sebelumnya ya.{tidur}{personal}',
      'Kak {nama}, saya ingatkan ya:\nbesok sesi jam {jam} {coach}.\nSampai bertemu besok.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok kita bertemu jam {jam} {coach}.\nSiapkan sepatu dan baju latihannya dari sekarang ya.{tidur}{personal}',
      'Halo Kak {nama}.\nSesi latihan besok jam {jam} {coach}.\nKalau ada kendala, kabari saja ya.{tidur}{personal}',
      'Kak {nama}, malam! 😊\nBesok jam {jam} jadwal latihan kita {coach}.\nIstirahat yang cukup ya malam ini.{tidur}{personal}',
      'Malam Kak {nama}.\nPengingat kecil: besok latihan jam {jam} {coach}.\nUsahakan tidur lebih awal ya.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok pukul {jam} kita lanjut latihan {coach}.\nTerima kasih sudah konsisten.{tidur}{personal}',
      'Kak {nama}, besok jam {jam} ya {coach}.\nMinum air yang cukup dari sekarang,\nsupaya besok tidak mudah capek.{tidur}{personal}',
      'Halo Kak {nama}!\nBesok jam {jam} kita latihan {coach}.\nSiap-siap berkeringat ya. 😄{tidur}{personal}',
      'Malam Kak {nama}.\nBesok ada sesi jam {jam} {coach}.\nKalau perlu ganti jadwal, kabari secepatnya ya.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nIzin mengingatkan, besok ada sesi latihan jam {jam} {coach}.\nSelamat beristirahat.{tidur}{personal}',
      'Kak {nama}, jangan lupa ya.\nBesok jam {jam} latihan {coach}.\nDatang 5–10 menit lebih awal supaya sempat pemanasan.{tidur}{personal}',
      'Halo Kak {nama}.\nBesok kita latihan lagi jam {jam} {coach}.\nBagaimana badannya, masih pegal dari sesi kemarin?{tidur}{personal}',
      'Malam Kak {nama}! 💪\nBesok jam {jam} {coach}.\nTidur cepat, bangun segar, latihan maksimal.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nJadwal Kakak besok: latihan jam {jam} {coach}.\nSampai jumpa.{tidur}{personal}',
      'Kak {nama}, malam.\nBesok jam {jam} ada sesi {coach}.\nJangan makan berat mepet sebelum latihan ya.{tidur}{personal}',
      'Halo Kak {nama}, selamat malam.\nBesok jam {jam}, latihan {coach}.\nSampai bertemu di sana.{tidur}{personal}',
      'Malam Kak {nama}.\nSesi besok jam {jam} {coach}.\nSiapkan juga baju ganti kalau langsung berangkat kerja ya.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok kita bertemu pukul {jam} {coach} untuk sesi latihan.\nSemoga istirahatnya nyenyak.{tidur}{personal}',
      'Kak {nama}, besok jam {jam} kita latihan {coach} ya.\nSaya tunggu ya. 😊{tidur}{personal}',
      'Halo Kak {nama}.\nBesok jam {jam} latihan {coach}.\nKalau lagi kurang sehat, kabari ya, supaya sesinya bisa disesuaikan.{tidur}{personal}',
      'Malam Kak {nama}.\nIngat ya, besok jam {jam} {coach}.\nBawa semangatnya juga. 💪{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok sesi latihan jam {jam} {coach}.\nJangan lupa pasang alarm ya.{tidur}{personal}',
      'Kak {nama}, malam! 🌙\nBesok jam {jam} kita latihan {coach}.\nMalam ini kurangi kafein supaya tidurnya enak.{tidur}{personal}',
      'Halo Kak {nama}.\nPengingat sesi besok jam {jam} {coach}.\nSampai bertemu di tempat latihan.{tidur}{personal}',
      'Malam Kak {nama}.\nBesok jam {jam} {coach}.\nSatu sesi lagi, satu langkah lebih dekat ke target Kakak.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok ada jadwal latihan jam {jam} {coach}.\nTerima kasih dan selamat beristirahat.{tidur}{personal}',
      'Kak {nama}, pengingat singkat.\nBesok jam {jam} latihan {coach}.\nJangan lupa sarapan ringan kalau sesinya pagi ya.{tidur}{personal}',
      'Halo Kak {nama}! 😄\nBesok jam {jam} kita bertemu lagi {coach}.\nSiap?{tidur}{personal}',
      'Malam Kak {nama}.\nBesok latihan jam {jam} {coach}.\nSiapkan tas latihannya malam ini supaya besok tidak buru-buru.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nMengingatkan kembali, sesi besok pukul {jam} {coach}.\nSampai bertemu.{tidur}{personal}',
      'Kak {nama}, malam.\nBesok jam {jam} ada sesi {coach}.\nMinum air putih lebih banyak hari ini ya.{tidur}{personal}',
      'Halo Kak {nama}.\nBesok jam {jam} latihan {coach}.\nKita lanjutkan progresnya ya. 💪{tidur}{personal}',
      'Malam Kak {nama}! 🌙\nBesok jam {jam} {coach}.\nIstirahat yang cukup, besok kita berlatih dengan semangat.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok kita ada latihan jam {jam} {coach}.\nKalau berhalangan, mohon dikabari ya.{tidur}{personal}',
      'Kak {nama}, besok jam {jam} ya.\nLatihan {coach}.\nSampai besok!{tidur}{personal}',
      'Halo Kak {nama}, selamat malam.\nSesi besok jam {jam} {coach}.\nSelamat beristirahat malam ini. 😊{tidur}{personal}',
      'Malam Kak {nama}.\nBesok jam {jam} kita latihan {coach}.\nPakai sepatu yang nyaman ya.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok pukul {jam} {coach}.\nSemoga besok badannya segar dan siap latihan.{tidur}{personal}',
      'Kak {nama}, malam!\nBesok jam {jam} sesi {coach}.\nYang penting datang dulu, sisanya kita kerjakan bersama. 💪{tidur}{personal}',
      'Halo Kak {nama}.\nBesok jam {jam} latihan {coach}.\nSelamat istirahat dan sampai jumpa besok.{tidur}{personal}'
    ],
    weekend: [
      'Kak {nama}, besok akhir pekan\ntapi kita tetap latihan ya.\nJam {jam} {coach}. Sampai bertemu.{tidur}{personal}',
      'Malam Kak {nama}.\nBesok sesi akhir pekan jam {jam} {coach}.\nSarapan ringan dulu sebelum datang ya.{tidur}{personal}',
      'Halo Kak {nama}!\nBesok jam {jam} kita latihan {coach}.\nSetelah itu akhir pekannya bisa dinikmati dengan tenang. 😊{tidur}{personal}',
      'Selamat malam Kak {nama}.\nMengingatkan sesi akhir pekan besok pukul {jam} {coach}.\nSampai bertemu.{tidur}{personal}',
      'Kak {nama}, malam minggu boleh santai,\ntapi usahakan tidur lebih awal ya. 😄\nBesok jam {jam} latihan {coach}.{tidur}{personal}',
      'Malam Kak {nama}.\nBesok jam {jam} {coach}.\nLatihan akhir pekan itu bonus untuk progres Kakak.{tidur}{personal}',
      'Halo Kak {nama}.\nBesok libur kerja, tapi latihan jalan terus. 💪\nJam {jam} {coach} ya.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok kita latihan jam {jam} {coach}.\nSelamat beristirahat malam ini.{tidur}{personal}',
      'Kak {nama}, selamat berakhir pekan.\nJangan lupa besok jam {jam} ada sesi {coach}.\nSampai bertemu.{tidur}{personal}',
      'Malam Kak {nama}.\nBesok jam {jam} {coach}.\nMulai akhir pekan dengan latihan, sisanya untuk keluarga. 😊{tidur}{personal}',
      'Halo Kak {nama}, selamat malam.\nSesi akhir pekan besok jam {jam} {coach}.\nSaya tunggu ya.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok pukul {jam} kita latihan {coach}.\nKalau ada acara mendadak, kabari ya.{tidur}{personal}',
      'Kak {nama}, malam.\nBesok jam {jam} latihan {coach}.\nTidur cukup walau besok libur ya.{tidur}{personal}',
      'Malam Kak {nama}! 🌙\nBesok sesi akhir pekan jam {jam} {coach}.\nBawa minum yang banyak ya.{tidur}{personal}',
      'Halo Kak {nama}.\nPengingat sesi besok jam {jam} {coach}.\nLatihan pagi di hari libur itu rasanya beda, enak sekali.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok jam {jam} {coach}.\nTerima kasih sudah sisihkan waktu akhir pekan untuk latihan.{tidur}{personal}',
      'Kak {nama}, jangan lupa ya.\nBesok jam {jam} latihan {coach}.\nSetelah latihan, hadiahi diri dengan istirahat. 😊{tidur}{personal}',
      'Malam Kak {nama}.\nBesok jam {jam} kita bertemu {coach}.\nSelamat menikmati malam akhir pekan.{tidur}{personal}'
    ]
  },
  'sesi-besok-banyak': {
    semua: [
      'Kak {nama}, besok jadwal latihannya:\njam {jam} {coach}.\nIstirahat yang cukup malam ini. 💪{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok sesi latihan Kakak pukul {jam} {coach}.\nSampai bertemu besok.{tidur}{personal}',
      'Halo Kak {nama}!\nBesok jadwalnya padat:\n{jam} {coach}.\nSiapkan tenaga ya. 😄{tidur}{personal}',
      'Malam Kak {nama}.\nPengingat sesi besok jam {jam} {coach}.\nBawa minum dan baju ganti ya.{tidur}{personal}',
      'Kak {nama}, besok kita bertemu lebih dari sekali ya:\njam {jam} {coach}.\nSampai bertemu.{tidur}{personal}',
      'Selamat malam Kak {nama}.\nBesok ada beberapa sesi: jam {jam} {coach}.\nJangan lupa makan di antara sesinya ya.{tidur}{personal}',
      'Halo Kak {nama}.\nBesok dua sesi jam {jam} {coach}.\nTidur cepat malam ini ya. 🌙{tidur}{personal}',
      'Malam Kak {nama}.\nJadwal besok: jam {jam} {coach}.\nKalau ada yang perlu digeser, kabari ya.{tidur}{personal}',
      'Kak {nama}, pengingat:\nbesok latihan jam {jam} {coach}.\nSemangat untuk besok! 💪{tidur}{personal}',
      'Selamat malam Kak {nama}.\nIzin mengingatkan sesi besok pukul {jam} {coach}.\nSelamat beristirahat.{tidur}{personal}',
      'Halo Kak {nama}, besok sibuk latihan. 😄\nJam {jam} {coach}.\nSiapkan bekal dan air minum ya.{tidur}{personal}',
      'Malam Kak {nama}.\nBesok ada sesi jam {jam} {coach}.\nIstirahat cukup supaya dua-duanya maksimal.{tidur}{personal}'
    ]
  },

  // ── PR ──────────────────────────────────────────────────────────────────────
  'pr': {
    weekday: [
      'Kak {nama}, PR latihannya jangan lupa ya:\n{pr}\nPelan-pelan saja,\nyang penting dikerjakan.{personal}',
      'Halo Kak {nama}, ini PR untuk hari ini:\n{pr}\nKabari kalau ada gerakan yang kurang jelas ya.{personal}',
      'Kak {nama}, pengingat singkat untuk PR-nya:\n{pr}\nSemoga lancar. 💪{personal}',
      'Selamat pagi Kak {nama}.\nPengingat PR Kakak:\n{pr}\nSemoga lancar hari ini.{personal}',
      'Pagi Kak {nama}!\nAda PR yang menunggu:\n{pr}\n10–15 menit juga cukup.{personal}',
      'Halo Kak {nama}.\nPR minggu ini:\n{pr}\nKalau sudah selesai, centang di portal ya.{personal}',
      'Kak {nama}, jangan lupa PR-nya ya:\n{pr}\nIni yang membuat hasil latihan makin kelihatan.{personal}',
      'Selamat pagi Kak {nama}.\nIzin mengingatkan PR berikut:\n{pr}\nTerima kasih.{personal}',
      'Kak {nama}, pagi! 😊\nPR hari ini:\n{pr}\nBisa dicicil pagi atau sore.{personal}',
      'Halo Kak {nama}!\nPR-nya sudah dikerjakan belum?\n{pr}\nKalau belum, masih ada waktu.{personal}',
      'Pagi Kak {nama}.\nLatihan di luar sesi itu penting sekali.\nIni PR Kakak:\n{pr}{personal}',
      'Kak {nama}, pengingat kecil:\n{pr}\nSedikit tapi rutin, itu kuncinya.{personal}',
      'Selamat pagi Kak {nama}.\nBerikut PR yang perlu dikerjakan:\n{pr}\nSemangat!{personal}',
      'Halo Kak {nama}. 📋\nPR untuk Kakak:\n{pr}\nKalau ada yang sakit pas dikerjakan, stop dan kabari ya.{personal}',
      'Kak {nama}, selamat pagi.\nPR Kakak:\n{pr}\nSaya yakin Kakak bisa. 💪{personal}',
      'Pagi Kak {nama}.\nPR-nya bisa dikerjakan sebelum mandi pagi, cepat selesai:\n{pr}{personal}',
      'Halo Kak {nama}, selamat pagi.\nIni PR dari sesi kemarin:\n{pr}\nSampai bertemu di sesi berikutnya.{personal}',
      'Kak {nama}, saya ingatkan lagi ya:\n{pr}\nLebih ringan kalau dikerjakan hari ini.{personal}',
      'Selamat pagi Kak {nama}.\nPengingat tugas latihan:\n{pr}\nSemoga hari Kakak menyenangkan.{personal}',
      'Pagi Kak {nama}! ☀️\nPR hari ini:\n{pr}\nSambil dengar musik supaya seru.{personal}',
      'Halo Kak {nama}.\nPR kecil, dampak besar:\n{pr}\nYuk dikerjakan.{personal}',
      'Kak {nama}, pagi.\nSebelum lupa, ini PR-nya ya:\n{pr}{personal}',
      'Selamat pagi Kak {nama}.\nKonsistensi PR membuat progres lebih cepat.\nPR Kakak:\n{pr}{personal}',
      'Kak {nama}, halo! 😄\nPR menanti:\n{pr}\nTidak perlu sempurna, yang penting jalan.{personal}',
      'Pagi Kak {nama}.\nIni PR yang kita bahas di sesi:\n{pr}\nKalau lupa caranya, tanya saja ya.{personal}',
      'Halo Kak {nama}, selamat pagi.\nPR untuk Kakak:\n{pr}\nCatat di portal kalau sudah ya.{personal}',
      'Kak {nama}, pengingat PR:\n{pr}\nBisa diselipkan di jam istirahat kerja.{personal}',
      'Selamat pagi Kak {nama}.\nMengingatkan PR berikut:\n{pr}\nSemoga tidak memberatkan.{personal}',
      'Pagi Kak {nama}! 💪\nPR-nya:\n{pr}\nSetelah selesai, rasanya pasti puas.{personal}',
      'Halo Kak {nama}.\nPR ini bantu sesi kita berikutnya jadi lebih maksimal:\n{pr}{personal}',
      'Kak {nama}, pagi.\nMulai hari dengan centang satu PR yuk:\n{pr}{personal}',
      'Selamat pagi Kak {nama}.\nPR Kakak hari ini:\n{pr}\nPelan dan benar lebih baik daripada cepat.{personal}',
      'Kak {nama}, halo!\nJangan lupa PR-nya ya:\n{pr}\nSaya percaya Kakak bisa. 😊{personal}',
      'Pagi Kak {nama}.\nPR yang masih terbuka:\n{pr}\nSemoga sempat hari ini.{personal}',
      'Halo Kak {nama}, selamat pagi.\nCek PR:\n{pr}\nTerus semangat ya.{personal}',
      'Kak {nama}, selamat pagi.\nPR sederhana untuk hari ini:\n{pr}\nKalau lagi sibuk, kerjakan sebagian dulu.{personal}',
      'Selamat pagi Kak {nama}.\nPR berikut sudah memenunggu:\n{pr}\nTerima kasih sudah rajin.{personal}',
      'Pagi Kak {nama}! 📝\nIni dia PR-nya:\n{pr}\nKabari kalau sudah ya.{personal}',
      'Halo Kak {nama}.\nPR hari ini tidak lama kok:\n{pr}{personal}',
      'Kak {nama}, pagi.\nSupaya sesi berikutnya makin lancar, kerjakan PR ini ya:\n{pr}{personal}',
      'Selamat pagi Kak {nama}.\nPengingat PR:\n{pr}\nJangan lupa pemanasan sebentar sebelumnya.{personal}',
      'Kak {nama}, halo! ☀️\nPR yang perlu dicek:\n{pr}\nSemangat hari ini.{personal}',
      'Pagi Kak {nama}.\nPR Kakak masih ada:\n{pr}\nYuk diselesaikan.{personal}',
      'Halo Kak {nama}, selamat pagi.\nIni PR-nya:\n{pr}\nSedikit demi sedikit, lama-lama jadi kebiasaan.{personal}'
    ],
    weekend: [
      'Akhir pekan santai boleh,\ntapi PR-nya tetap ya Kak {nama} 😄\n{pr}{personal}',
      'Selamat pagi Kak {nama}.\nMumpung libur, ada waktu untuk PR ini:\n{pr}\nSemoga lancar.{personal}',
      'Kak {nama}, selamat berakhir pekan.\nPR-nya bisa dikerjakan santai di rumah:\n{pr}{personal}',
      'Pagi Kak {nama}.\nAkhir pekan cocok untuk kejar PR:\n{pr}\nSetelah itu bebas santai. 😊{personal}',
      'Halo Kak {nama}.\nPR akhir pekan:\n{pr}\nPagi-pagi dikerjakan, sisa hari bebas.{personal}',
      'Kak {nama}, selamat pagi.\nJangan lupa PR di sela liburan ya:\n{pr}{personal}',
      'Selamat pagi Kak {nama}.\nPR berikut bisa dikerjakan hari ini:\n{pr}\nSelamat berakhir pekan.{personal}',
      'Pagi Kak {nama}! ☀️\nPR akhir pekan:\n{pr}\nSantai saja, dikerjakan sesempatnya ya.{personal}',
      'Halo Kak {nama}, selamat pagi.\nMinggu ini tinggal sedikit lagi.\nPR yang tersisa:\n{pr}{personal}',
      'Kak {nama}, pagi.\nWaktu luang akhir pekan bisa untuk PR ini:\n{pr}\nHanya sebentar.{personal}',
      'Selamat pagi Kak {nama}.\nPengingat PR akhir pekan:\n{pr}\nTerima kasih.{personal}',
      'Pagi Kak {nama}.\nPR-nya bisa sambil ajak keluarga ikut gerak:\n{pr}\nLebih seru! 😊{personal}',
      'Halo Kak {nama}! 💪\nSabtu/Minggu pun progres jalan terus:\n{pr}{personal}',
      'Kak {nama}, selamat pagi.\nSebelum jalan-jalan, kerjakan PR ini dulu ya:\n{pr}{personal}',
      'Selamat pagi Kak {nama}.\nAkhir pekan adalah waktu yang pas untuk PR berikut:\n{pr}{personal}',
      'Pagi Kak {nama}.\nPR ringan untuk akhir pekan:\n{pr}\nSelamat menikmati liburnya.{personal}',
      'Halo Kak {nama}.\nSapaan akhir pekan:\n{pr}\nKalau sudah beres, kabari ya. 😄{personal}',
      'Kak {nama}, pagi! 🌤️\nPR-nya masih ada:\n{pr}\nYuk diselesaikan sebelum Senin.{personal}'
    ]
  },
  'pr-banyak': {
    semua: [
      'Kak {nama}, ada beberapa PR:\n{pr}\nTidak harus sekaligus, dicicil saja ya.{personal}',
      'Halo Kak {nama}.\nPR yang masih terbuka:\n{pr}\nMulai dari yang paling mudah dulu.{personal}',
      'Selamat pagi Kak {nama}.\nBerikut daftar PR Kakak:\n{pr}\nSatu per satu ya.{personal}',
      'Pagi Kak {nama}! 📋\nList PR-nya:\n{pr}\nCentang yang sudah selesai di portal ya.{personal}',
      'Kak {nama}, PR-nya lumayan banyak 😄\n{pr}\nPelan-pelan, yang penting jalan.{personal}',
      'Halo Kak {nama}, selamat pagi.\nIni PR yang perlu dikerjakan:\n{pr}\nKalau berat, kabari ya, nanti kita sesuaikan.{personal}',
      'Selamat pagi Kak {nama}.\nIzin mengingatkan beberapa PR berikut:\n{pr}\nTerima kasih.{personal}',
      'Kak {nama}, pagi.\nPR kita:\n{pr}\nPilih satu untuk hari ini dulu juga boleh.{personal}',
      'Halo Kak {nama}! 💪\nDaftar PR Kakak:\n{pr}\nSelangkah demi selangkah ya.{personal}',
      'Pagi Kak {nama}.\nAda yang mendekati tenggat:\n{pr}\nYuk dikejar.{personal}',
      'Kak {nama}, selamat pagi.\nPR-PR berikut memenunggu:\n{pr}\nSemangat, Kak!{personal}',
      'Selamat pagi Kak {nama}.\nDaftar PR Kakak minggu ini:\n{pr}\nSemoga lancar semua.{personal}'
    ]
  },

  // ── Booking minggu ──────────────────────────────────────────────────────────
  'booking-minggu': {
    weekday: [
      'Kak {nama}, minggu ini masih ada jadwal kosong:\n{slot}\nMau ambil yang mana?{personal}',
      'Halo Kak {nama}.\nSlot latihan minggu ini yang masih tersedia:\n{slot}\nSilakan kabari jam yang cocok ya.{personal}',
      'Kak {nama}, supaya latihannya tetap rutin,\nyuk booking dari sekarang. 📅\nYang masih kosong:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nIni jadwal yang masih bisa dipilih:\n{slot}\nBisa booking langsung di portal.{personal}',
      'Halo Kak {nama}!\nMinggu ini mau latihan kapan?\nPilihannya:\n{slot}{personal}',
      'Kak {nama}, slot minggu ini cepat penuh. 😄\nYang masih ada:\n{slot}{personal}',
      'Pagi Kak {nama}.\nSudah booking sesi minggu ini?\nKalau belum, ini pilihannya:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nIzin menginformasikan jadwal yang masih kosong:\n{slot}\nTerima kasih.{personal}',
      'Kak {nama}, halo!\nAmankan jadwal latihan dulu yuk:\n{slot}\nSupaya minggu ini tetap terjaga.{personal}',
      'Halo Kak {nama}, selamat pagi.\nJam yang masih tersedia:\n{slot}\nPilih yang paling pas untuk Kakak ya.{personal}',
      'Kak {nama}, pagi! 💪\nMinggu ini kita latihan berapa kali?\nSlot yang ada:\n{slot}{personal}',
      'Pagi Kak {nama}.\nJadwal latihan masih ada yang kosong:\n{slot}\nBooking-nya bisa lewat portal ya.{personal}',
      'Selamat pagi Kak {nama}.\nBerikut slot latihan yang tersedia minggu ini:\n{slot}\nSilakan dipilih.{personal}',
      'Halo Kak {nama}.\nAturan kecil supaya konsisten: booking di awal minggu. 😊\nPilihan:\n{slot}{personal}',
      'Kak {nama}, selamat pagi.\nJadwal kosong minggu ini:\n{slot}\nKabari saya ya.{personal}',
      'Pagi Kak {nama}.\nKalau minggu ini sibuk, ambil satu sesi dulu juga tidak apa-apa:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nMasih ada slot kosong:\n{slot}\nKabari saja kalau mau diambil.{personal}',
      'Halo Kak {nama}! 📅\nYuk rencanakan latihan minggu ini.\nYang kosong:\n{slot}{personal}',
      'Kak {nama}, pagi.\nJam favorit Kakak masih ada tidak ya?\nCek di sini:\n{slot}{personal}',
      'Pagi Kak {nama}.\nSupaya sisa sesinya terpakai dengan baik,\nyuk booking:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nPilihan jadwal minggu ini:\n{slot}\nSemoga ada yang cocok.{personal}',
      'Halo Kak {nama}.\nMinggu ini ayo latihan lagi.\nSlot tersedia:\n{slot}{personal}',
      'Kak {nama}, halo! 😊\nSaya bantu ingatkan, slot yang masih ada:\n{slot}{personal}',
      'Pagi Kak {nama}.\nSupaya tidak kehabisan, booking dari sekarang ya:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nKami informasikan slot latihan yang kosong:\n{slot}\nSilakan booking melalui portal.{personal}',
      'Kak {nama}, pagi! ☀️\nLatihan minggu ini kapan?\n{slot}{personal}',
      'Halo Kak {nama}, selamat pagi.\nAda beberapa pilihan jam:\n{slot}\nPilih satu atau dua ya.{personal}',
      'Kak {nama}, semoga minggu ini sempat latihan ya.\nSlot yang ada:\n{slot}{personal}',
      'Pagi Kak {nama}.\nKabar jadwal kosong:\n{slot}\nKabari kalau mau booking.{personal}',
      'Selamat pagi Kak {nama}.\nJadwal minggu ini yang masih tersedia:\n{slot}\nDitunggu ya.{personal}',
      'Halo Kak {nama}! 💪\nTarget minggu ini: minimal satu sesi.\nPilihannya:\n{slot}{personal}',
      'Kak {nama}, pagi.\nKalau jam di bawah tidak cocok, kabari saja,\nnanti kita cari jalan:\n{slot}{personal}',
      'Pagi Kak {nama}.\nSlot latihan terbaru:\n{slot}\nBooking sekarang supaya tenang.{personal}',
      'Selamat pagi Kak {nama}.\nSemoga minggunya lancar.\nIni slot yang bisa dipilih:\n{slot}{personal}',
      'Halo Kak {nama}.\nMinggu baru, jadwal baru:\n{slot}\nYang mana? 😄{personal}',
      'Kak {nama}, selamat pagi.\nRutin latihan itu kuncinya.\nSlot minggu ini:\n{slot}{personal}',
      'Pagi Kak {nama}! 📅\nBooking sesi yuk.\nPilihan:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nUntuk minggu ini, jadwal yang masih kosong adalah:\n{slot}{personal}',
      'Halo Kak {nama}, selamat pagi.\nMasih tersedia:\n{slot}\nSampai bertemu.{personal}',
      'Kak {nama}, pagi.\nSlot pagi dan sore masih ada:\n{slot}\nSesuaikan dengan kesibukan Kakak ya.{personal}',
      'Pagi Kak {nama}.\nAyo lanjut latihan minggu ini.\nYang tersedia:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nIni pilihan jadwal latihan:\n{slot}\nSilakan pilih yang paling nyaman.{personal}',
      'Halo Kak {nama}! 😊\nSaya tunggu booking-nya ya.\nSlot:\n{slot}{personal}',
      'Kak {nama}, pagi.\nMasih ada tempat untuk Kakak minggu ini:\n{slot}{personal}'
    ],
    weekend: [
      'Selamat akhir pekan Kak {nama}.\nSambil santai, boleh dicek jadwal minggu depan:\n{slot}{personal}',
      'Kak {nama}, yuk rencanakan latihan minggu depan.\nSlot yang masih ada:\n{slot}{personal}',
      'Halo Kak {nama}, selamat berakhir pekan.\nSupaya Senin tidak bingung, booking dari sekarang:\n{slot}{personal}',
      'Pagi Kak {nama}.\nAkhir pekan enaknya untuk rencanain minggu depan.\nJadwal kosong:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nBerikut slot latihan yang tersedia:\n{slot}\nSelamat berakhir pekan.{personal}',
      'Kak {nama}, halo! 😊\nSambil minum kopi santai, pilih jadwal latihan yuk:\n{slot}{personal}',
      'Halo Kak {nama}.\nMinggu depan mau latihan kapan?\nPilihan:\n{slot}{personal}',
      'Kak {nama}, selamat pagi.\nAmankan slot minggu depan dari sekarang ya:\n{slot}{personal}',
      'Pagi Kak {nama}! ☀️\nYang masih kosong:\n{slot}\nBooking di portal hanya sebentar.{personal}',
      'Selamat pagi Kak {nama}.\nIzin menginformasikan jadwal kosong:\n{slot}\nTerima kasih.{personal}',
      'Halo Kak {nama}, selamat berakhir pekan.\nJadwal minggu depan:\n{slot}\nSilakan pilih satu ya.{personal}',
      'Kak {nama}, pagi.\nMulai minggu depan dengan latihan yuk.\nSlot:\n{slot}{personal}',
      'Selamat akhir pekan Kak {nama}.\nKalau sudah tahu jadwal minggu depan, langsung booking ya:\n{slot}{personal}',
      'Pagi Kak {nama}.\nJadwal latihan yang tersedia:\n{slot}\nSemoga ada yang pas.{personal}',
      'Halo Kak {nama}! 📅\nRencana minggu depan:\n{slot}\nKabari pilihan Kakak ya.{personal}',
      'Kak {nama}, selamat pagi.\nSlot ini masih bisa diambil:\n{slot}{personal}',
      'Selamat pagi Kak {nama}.\nSelamat menikmati libur.\nIni slot latihan yang kosong:\n{slot}{personal}',
      'Pagi Kak {nama}.\nSupaya minggu depan tetap rutin, booking yuk:\n{slot}{personal}'
    ]
  },
  // Klien yang paketnya sudah habis: ajakan perpanjang, tanpa daftar slot.
  'booking-habis': {
    semua: [
      'Kak {nama}, sesi paket Kakak sudah habis.\nMau lanjut latihan lagi?\nPerpanjang bisa lewat portal ya.{personal}',
      'Halo Kak {nama}.\nKangen latihan bersama. 😊\nKalau mau lanjut, tinggal perpanjang paket di portal.{personal}',
      'Selamat pagi Kak {nama}.\nPaket latihan Kakak sudah selesai.\nKalau ingin melanjutkan, silakan perpanjang melalui portal.{personal}',
      'Kak {nama}, apa kabar?\nProgres kemarin sayang kalau berhenti di sini.\nYuk lanjut, perpanjang paketnya ya.{personal}',
      'Halo Kak {nama}! 💪\nJadwal minggu ini masih ada yang kosong.\nPerpanjang paket dulu, nanti langsung booking.{personal}',
      'Pagi Kak {nama}.\nBadan masih ingat gerakannya kan? 😄\nAyo lanjut latihan, perpanjangan bisa di portal.{personal}',
      'Selamat pagi Kak {nama}.\nTerima kasih untuk paket yang sudah selesai.\nKalau siap lanjut, saya tunggu ya.{personal}',
      'Kak {nama}, halo.\nMinggu ini mau mulai latihan lagi?\nTombol perpanjang ada di Beranda portal.{personal}',
      'Halo Kak {nama}, selamat pagi.\nKalau mau coba paket lain, kabari saja ya.\nNanti saya bantu pilih.{personal}',
      'Pagi Kak {nama}! ☀️\nSudah siap balik latihan?\nPerpanjang paketnya, kita atur jadwalnya bersama.{personal}',
      'Kak {nama}, selamat pagi.\nKonsistensi Kakak kemarin keren sekali.\nYuk dilanjutkan dengan paket baru.{personal}',
      'Halo Kak {nama}.\nHanya mau menyapa dan mengingatkan,\nkalau ingin latihan lagi, perpanjangan bisa kapan saja.{personal}'
    ]
  },

  // ── Baris personal (ditambahkan di akhir pesan bila berlaku, maksimal satu) ──
  'personal-kangen': {
    semua: [
      'Sudah lama kita tidak bertemu, Kak.\nKangen latihan bersama!',
      'Btw, terakhir latihan sudah lumayan lama ya, Kak.\nYuk mulai lagi pelan-pelan.',
      'Sesi terakhir sudah beberapa minggu lalu.\nBadan pasti kangen gerak juga. 😄',
      'Kalau lagi sibuk, tidak apa-apa.\nTapi saya tunggu Kakak balik latihan ya.',
      'Sudah agak lama tidak latihan, Kak.\nSatu sesi minggu ini cukup untuk mulai lagi.',
      'Kangen lihat progres Kakak.\nYuk atur jadwal latihan lagi.',
      'Tidak terasa sudah lama kita tidak sesi, Kak.\nSemoga sehat selalu ya.',
      'Kalau ada kendala untuk latihan, cerita saja ya, Kak.\nNanti kita cari jadwal yang pas.'
    ]
  },
  'personal-sisa': {
    semua: [
      'Oh ya, sisa sesi Kakak tinggal {sisa} lagi ya, Kak.',
      'Info kecil: sesi paket Kakak tersisa {sisa}.',
      'Paketnya tinggal {sisa} sesi lagi, Kak.\nKalau mau lanjut, perpanjang bisa lewat portal.',
      'Sisa {sisa} sesi lagi, Kak.\nKita maksimalkan ya!',
      'Oh ya, sesi Kakak tinggal {sisa}.\nKabari kalau mau perpanjang ya.',
      'Tinggal {sisa} sesi lagi di paket ini, Kak.\nSemangat sampai selesai!',
      'Sekadar info, sisa sesi Kakak {sisa}.',
      'Sesi tersisa: {sisa}.\nYuk dijadwalkan supaya tidak terlewat.'
    ]
  },
  'personal-streak': {
    semua: [
      'Sudah {minggu} minggu rutin latihan, keren sekali! 🔥',
      'Oh ya, Kakak sudah konsisten {minggu} minggu berturut-turut.\nMantap!',
      '{minggu} minggu tanpa putus latihan, Kak.\nSaya bangga.',
      'Streak latihan Kakak {minggu} minggu.\nPertahankan ya! 💪',
      'Tidak terasa sudah {minggu} minggu rutin.\nHasilnya pasti makin kelihatan.',
      'Konsisten {minggu} minggu itu tidak mudah, Kak.\nKerja bagus.',
      'Sudah {minggu} minggu berturut-turut latihan.\nLanjutkan, Kak!',
      'Streak {minggu} minggu! 🔥\nTerima kasih sudah disiplin.'
    ]
  },

  // Catatan makan (hanya ya/tidak): terima kasih bila kemarin mencatat, ajakan halus bila belum.
  'personal-catat': {
    semua: [
      'Terima kasih kemarin sudah mencatat makannya, Kak.\nItu sangat membantu saya.',
      'Saya lihat kemarin Kakak mencatat makan.\nTerima kasih, itu usaha yang baik.',
      'Catatan makan kemarin sudah saya terima, Kak.\nTerima kasih sudah meluangkan waktu.',
      'Terima kasih sudah rajin mencatat makan, Kak.\nPelan-pelan polanya jadi lebih jelas.',
      'Catatan makan Kakak kemarin sangat membantu saya memberi saran yang lebih pas.',
      'Terima kasih untuk catatan makannya kemarin, Kak.\nTidak harus lengkap, yang penting apa adanya.',
      'Saya menghargai catatan makan kemarin, Kak.\nSemoga hari ini juga sempat.',
      'Kemarin catatan makannya masuk, Kak.\nTerima kasih sudah konsisten.'
    ]
  },
  'personal-catat-yuk': {
    semua: [
      'Kalau sempat, boleh catat makan hari ini di portal ya, Kak.\nSebisanya saja.',
      'Oh ya, catatan makan di portal membantu saya memahami pola Kakak.\nSatu kali makan pun sudah cukup.',
      'Kalau ada waktu, catat makan hari ini ya, Kak.\nTidak perlu lengkap.',
      'Boleh dicoba catat satu waktu makan hari ini di portal, Kak.\nKalau belum sempat, tidak apa-apa.',
      'Catatan makan tidak untuk menilai, Kak.\nHanya supaya saran saya lebih cocok untuk Kakak.',
      'Kalau Kakak berkenan, catat makan hari ini di portal ya.\nSaya baca dengan senang hati.',
      'Sesempatnya saja, Kak, catat makan di portal membantu kita melihat kemajuannya.',
      'Mencatat makan satu dua kali seminggu pun sudah membantu, Kak.\nKapan pun Kakak sempat.'
    ]
  },

  // ── Ramadan ─────────────────────────────────────────────────────────────────
  'ramadan-hidup-sehat': {
    semua: [
      'Selamat pagi Kak {nama}, semoga puasanya lancar.\nCardio ringan 15–20 menit menjelang berbuka saja ya.\nJangan yang terlalu berat.{personal}',
      'Kak {nama}, selamat menunaikan ibadah puasa.\nJalan santai sore sebelum berbuka itu pas untuk cardio.\nMinumnya nanti cukupi pas buka ya.{personal}',
      'Pagi Kak {nama}.\nPuasa bukan alasan berhenti gerak. 😊\nCardio ringan 30 menit sebelum buka,\natau setelah tarawih.{personal}',
      'Halo Kak {nama}, semoga sehat selalu di bulan Ramadan.\nTarget hari ini:\n• cardio ringan sore\n• 8 gelas air dari buka sampai sahur{personal}',
      'Selamat pagi Kak {nama}.\nKalau lemas, cardio diganti jalan kaki santai dulu ya.\nDengarkan badan.{personal}',
      'Kak {nama}, pagi.\nSetelah tarawih juga bisa cardio ringan 15 menit.\nPilih waktu yang paling nyaman.{personal}',
      'Pagi Kak {nama}.\nPuasa hari ini semoga lancar.\nNgabuburit sambil jalan sore, cardio pun dapat. 😄{personal}',
      'Selamat pagi Kak {nama}.\nIngat ya, cardio saat puasa intensitasnya rendah saja.\nYang penting tetap gerak.{personal}',
      'Halo Kak {nama}.\nCardio ringan 20 menit menjelang berbuka,\nlalu buka dengan air putih dan kurma.{personal}',
      'Kak {nama}, selamat pagi.\nTidur siang sebentar boleh,\ntapi sore tetap jalan kaki ya.{personal}',
      'Pagi Kak {nama}.\nPuasa itu juga latihan disiplin.\nCardio ringan hari ini, dan sahur jangan dilewat.{personal}',
      'Selamat pagi Kak {nama}, semoga ibadahnya diterima.\nTetap aktif ya: jalan kaki, naik tangga, cardio ringan sore.{personal}',
      'Halo Kak {nama}! ☀️\nHindari olahraga berat siang hari saat puasa.\nCardio ringan sore saja ya.{personal}',
      'Kak {nama}, pagi.\nKalau cardio setelah buka, tunggu 1–2 jam dulu ya.\nSupaya perut nyaman.{personal}',
      'Selamat pagi Kak {nama}.\nPuasa hari ini, cardionya cukup jalan santai 20 menit.\nBadan tetap bugar.{personal}',
      'Pagi Kak {nama}.\nSemoga puasanya kuat sampai maghrib. 💪\nSore nanti gerak sebentar ya.{personal}',
      'Halo Kak {nama}, selamat pagi.\nRamadan tetap sehat:\n• cardio ringan\n• minum cukup saat malam\n• tidur cukup{personal}',
      'Kak {nama}, selamat pagi.\nCoba stretching dan jalan kaki menjelang berbuka.\nRingan, tapi rutin.{personal}',
      'Pagi Kak {nama}! 🌙\nCardio ringan sebelum buka bisa bantu jaga stamina selama Ramadan.{personal}',
      'Selamat pagi Kak {nama}.\nKalau hari ini sibuk, cardio 10 menit setelah tarawih juga sudah bagus.{personal}',
      'Halo Kak {nama}.\nPuasa lancar, badan tetap aktif.\nSore nanti jalan sore yuk.{personal}',
      'Kak {nama}, pagi.\nJangan paksakan latihan berat saat puasa ya.\nCardio ringan saja, yang penting konsisten.{personal}',
      'Selamat pagi Kak {nama}.\nSemoga hari ini penuh berkah.\nSelipkan cardio ringan menjelang buka ya.{personal}',
      'Pagi Kak {nama}.\nNgabuburit paling sehat: jalan sore 30 menit. 😄\nCoba hari ini ya.{personal}',
      'Halo Kak {nama}, selamat pagi.\nTetap gerak di bulan puasa membuat badan tidak kaku.\nCardio ringan sore ya.{personal}',
      'Kak {nama}, selamat pagi. ☀️\nHari ini cardio ringan, besok juga.\nSedikit tapi tiap hari.{personal}',
      'Pagi Kak {nama}.\nKalau pusing atau lemas saat cardio, berhenti dan istirahat ya.\nKeselamatan nomor satu.{personal}',
      'Selamat pagi Kak {nama}.\nSemoga puasanya lancar.\nSore nanti gerak sebentar, malam cukupi minumnya.{personal}',
      'Halo Kak {nama}! 🌙\nMenjelang akhir Ramadan, tetap semangat jaga gerak ya.\nCardio ringan sore.{personal}',
      'Kak {nama}, pagi.\nSatu kebiasaan baik selama Ramadan:\njalan kaki 20 menit tiap sore.\nYuk dijaga.{personal}'
    ]
  },
  'ramadan-makan-pagi': {
    semua: [
      'Kak {nama}, waktunya sahur. 🌙\nJangan lupa protein dan air putih yang cukup ya.{tip}{personal}',
      'Selamat sahur Kak {nama}.\nPilih karbo kompleks seperti nasi merah atau oat,\nsupaya kenyang lebih lama.{tip}{personal}',
      'Sahur Kak {nama}!\nTelur, tempe, atau ayam bisa jadi lauk yang pas.\nMinum 2–3 gelas air ya.{tip}{personal}',
      'Kak {nama}, selamat sahur.\nJangan sahur terlalu asin,\nsupaya siang tidak cepat haus.{tip}{personal}',
      'Halo Kak {nama}, sudah bangun sahur?\nMakan secukupnya, tidak perlu sampai kekenyangan ya.{tip}{personal}',
      'Selamat sahur Kak {nama}. 🍳\nTambahkan buah di menu sahur,\nseperti pisang atau pepaya.{tip}{personal}',
      'Kak {nama}, sahur dulu yuk.\nKurangi gorengan dan makanan pedas,\nsupaya perut nyaman sampai sore.{tip}{personal}',
      'Sahur Kak {nama}.\nKopi boleh sedikit,\ntapi air putihnya yang utama ya.{tip}{personal}',
      'Selamat sahur Kak {nama}.\nSahur di akhir waktu lebih baik,\nenergi bertahan lebih lama.{tip}{personal}',
      'Kak {nama}, waktunya sahur.\nSayur juga jangan lupa ya, seratnya membuat kenyang.{tip}{personal}',
      'Halo Kak {nama}! 🌙\nSahur yang seimbang:\nkarbo, protein, sayur, dan air putih.{tip}{personal}',
      'Selamat sahur Kak {nama}.\nKalau tidak nafsu makan, minimal minum susu dan makan buah ya.{tip}{personal}',
      'Kak {nama}, sahur yuk.\nYoghurt atau susu bisa bantu tambahan protein.{tip}{personal}',
      'Sahur Kak {nama}.\nMakan pelan-pelan, masih ada waktu sebelum imsak. 😊{tip}{personal}',
      'Selamat sahur Kak {nama}.\nKurangi teh manis saat sahur,\nsupaya tidak cepat lapar.{tip}{personal}',
      'Kak {nama}, bangun sahur dulu ya.\nTelur rebus + nasi + sayur, simpel dan cukup.{tip}{personal}',
      'Halo Kak {nama}, selamat sahur.\nSemoga puasa hari ini lancar.\nJangan lupa minum yang cukup.{tip}{personal}',
      'Selamat sahur Kak {nama}. 🥚\nProtein waktu sahur bantu jaga otot selama puasa.{tip}{personal}',
      'Kak {nama}, sahur.\nKurma 2–3 butir juga bagus untuk energi.{tip}{personal}',
      'Sahur Kak {nama}.\nHindari mie instan untuk sahur ya,\ncepat lapar dan membuat haus.{tip}{personal}',
      'Selamat sahur Kak {nama}.\nOatmeal dengan susu dan pisang,\nsahur praktis yang mengenyangkan.{tip}{personal}',
      'Kak {nama}, waktunya sahur. 🌙\nSemoga kuat sampai maghrib.{tip}{personal}',
      'Halo Kak {nama}.\nSahur jangan dilewat ya,\nwalau hanya sedikit.{tip}{personal}',
      'Selamat sahur Kak {nama}.\nAir kelapa bisa bantu jaga cairan tubuh.\nCoba sesekali.{tip}{personal}',
      'Kak {nama}, sahur yuk.\nLauk dikukus atau direbus lebih ringan di perut.{tip}{personal}',
      'Sahur Kak {nama}.\nIngat ya: minum air sedikit-sedikit, jangan sekaligus banyak.{tip}{personal}',
      'Selamat sahur Kak {nama}.\nTempe dan tahu, protein murah yang pas untuk sahur.{tip}{personal}',
      'Kak {nama}, bangun sahur ya. 😊\nHari ini semoga lancar puasanya.{tip}{personal}',
      'Halo Kak {nama}, selamat sahur.\nPorsi secukupnya, isi gizinya lengkap.{tip}{personal}',
      'Selamat sahur Kak {nama}.\nTinggal beberapa hari lagi, tetap jaga pola sahur ya. 🌙{tip}{personal}'
    ]
  },
  'ramadan-makan-sore': {
    semua: [
      'Kak {nama}, sebentar lagi berbuka. 🌙\nBuka dengan air putih dan kurma dulu ya.{tip}{personal}',
      'Selamat menjelang berbuka Kak {nama}.\nJangan langsung makan berat,\nmulai dari yang manis alami dulu.{tip}{personal}',
      'Kak {nama}, buka puasa sebentar lagi.\nKurangi gorengan ya,\nwalau memang menggoda. 😄{tip}{personal}',
      'Halo Kak {nama}.\nBerbuka secukupnya, nanti makan besar setelah sholat maghrib.{tip}{personal}',
      'Kak {nama}, siap-siap berbuka.\nEs buah boleh,\ntapi sirupnya jangan banyak ya.{tip}{personal}',
      'Selamat berbuka nanti Kak {nama}.\nMinum air putih yang cukup dari buka sampai sahur.{tip}{personal}',
      'Kak {nama}, menjelang buka.\nTakjil buah lebih segar dan sehat. 🍉{tip}{personal}',
      'Halo Kak {nama}.\nMakan buka pelan-pelan ya,\nperut butuh waktu setelah seharian kosong.{tip}{personal}',
      'Kak {nama}, sebentar lagi maghrib.\nMenu buka: lauk protein, sayur, dan karbo secukupnya.{tip}{personal}',
      'Selamat menjelang berbuka Kak {nama}.\nKurangi minuman bersoda saat buka ya.{tip}{personal}',
      'Kak {nama}, buka puasa nanti jangan balas dendam ya. 😄\nPorsinya normal saja.{tip}{personal}',
      'Halo Kak {nama}, semoga puasanya lancar sampai maghrib.\nBuka dengan yang hangat juga enak, seperti sup.{tip}{personal}',
      'Kak {nama}, menjelang berbuka.\nKolak boleh sedikit,\nlanjut makan yang ada proteinnya.{tip}{personal}',
      'Selamat berbuka nanti Kak {nama}. 🌙\nJangan lupa sayur di piring ya.{tip}{personal}',
      'Kak {nama}, siap buka?\nSantan dan gorengan dikurangi,\nsupaya malam tetap nyaman.{tip}{personal}',
      'Halo Kak {nama}.\nSetelah buka dan tarawih, camilan malam pilih buah atau yoghurt ya.{tip}{personal}',
      'Kak {nama}, sebentar lagi berbuka.\nKalau buka bersama di luar, pilih menu bakar atau kukus ya.{tip}{personal}',
      'Selamat menjelang berbuka Kak {nama}.\nMinum air jangan sekaligus banyak,\nbertahap saja.{tip}{personal}',
      'Kak {nama}, buka puasa nanti.\nKurma 3 butir + air putih, sesuai sunnah dan bagus untuk energi.{tip}{personal}',
      'Halo Kak {nama}! 🌙\nSemoga puasa hari ini diterima.\nBuka yang sehat ya.{tip}{personal}',
      'Kak {nama}, menjelang maghrib.\nIkan atau ayam panggang pas untuk menu buka.{tip}{personal}',
      'Selamat berbuka nanti Kak {nama}.\nMakan malam jangan terlalu dekat dengan tidur ya.{tip}{personal}',
      'Kak {nama}, sebentar lagi buka.\nTakjil manis secukupnya, supaya masih ada tempat untuk makan utama. 😄{tip}{personal}',
      'Halo Kak {nama}.\nBuka puasa: air putih, kurma, lalu makan utama setelah maghrib.{tip}{personal}',
      'Kak {nama}, siap berbuka.\nTambah buah di menu buka supaya segar.{tip}{personal}',
      'Selamat menjelang berbuka Kak {nama}.\nKalau lapar sekali, makan pelan dan kunyah lama ya.{tip}{personal}',
      'Kak {nama}, menjelang buka. 🍲\nSup ayam sayur, hangat dan bergizi.{tip}{personal}',
      'Halo Kak {nama}, semoga sehat selalu.\nBuka secukupnya, sahur jangan lupa.{tip}{personal}',
      'Kak {nama}, sebentar lagi maghrib.\nMinuman manis cukup satu gelas ya, sisanya air putih.{tip}{personal}',
      'Selamat berbuka nanti Kak {nama}. 🌙\nTinggal sedikit lagi Ramadan, tetap jaga pola makannya ya.{tip}{personal}'
    ]
  },

  // ── Hari libur (menggantikan hidup-sehat pada tanggalnya) ───────────────────
  'libur': {
    'tahun-baru': [
      'Selamat tahun baru Kak {nama}! 🎉\nSemoga tahun ini lebih sehat dan bahagia.\nAwali dengan jalan pagi atau cardio ringan yuk.{personal}',
      'Kak {nama}, selamat tahun baru.\nTahun baru, semangat baru.\nYuk jaga kebiasaan sehat dari hari pertama.{personal}',
      'Selamat tahun baru Kak {nama}.\nTerima kasih sudah latihan bersama tahun lalu.\nSemoga tahun ini makin kuat dan sehat. 💪{personal}'
    ],
    'idul-fitri': [
      'Selamat Hari Raya Idul Fitri Kak {nama}. 🌙\nMohon maaf lahir dan batin.\nSemoga sehat selalu bersama keluarga.{personal}',
      'Kak {nama}, selamat Lebaran!\nMinal aidin wal faizin.\nNikmati opornya, tapi porsinya tetap dijaga ya. 😄{personal}',
      'Selamat Idul Fitri Kak {nama}.\nMohon maaf lahir batin.\nSemoga Lebaran ini penuh berkah dan kebahagiaan.{personal}'
    ],
    'idul-adha': [
      'Selamat Hari Raya Idul Adha Kak {nama}.\nSemoga berkah untuk Kakak dan keluarga.\nJangan lupa sayur di antara sate ya. 😄{personal}',
      'Kak {nama}, selamat Idul Adha.\nSemoga sehat selalu.\nNikmati hidangannya secukupnya ya.{personal}',
      'Selamat Idul Adha Kak {nama}. 🐑\nSemoga ibadahnya diterima.\nSore nanti jalan santai supaya badan tetap enak.{personal}'
    ],
    'kemerdekaan': [
      'Dirgahayu Indonesia, Kak {nama}! 🇮🇩\nIkut lomba 17-an hari ini?\nItu juga cardio. 😄{personal}',
      'Selamat Hari Kemerdekaan Kak {nama}.\nMerdeka juga dari kebiasaan malas gerak ya.\nCardio 20 menit hari ini!{personal}',
      'Kak {nama}, selamat 17 Agustus! 🇮🇩\nSemoga sehat dan semangat selalu.\nYuk ramaikan dengan gerak bersama warga.{personal}'
    ],
    'natal': [
      'Selamat Natal Kak {nama}. 🎄\nSemoga damai dan sukacita menyertai Kakak dan keluarga.{personal}',
      'Selamat merayakan Natal, Kak {nama}.\nNikmati waktu bersama keluarga.\nJalan santai sore supaya tetap aktif ya.{personal}',
      'Kak {nama}, selamat Hari Natal.\nSemoga sehat selalu dan penuh berkah. 🎄{personal}'
    ]
  }
};

// Hari libur & Ramadan 2026–2030 (perkiraan; bisa beda satu hari dengan sidang isbat/SKB).
// merah = libur nasional dan cuti bersama lain (2027: SKB 3 Menteri No. 1205/3/2 Tahun 2026). Hari itu memakai
// teks kelompok 'weekend'. Tambahkan tanggal tahun berikutnya tiap SKB baru terbit.
var RMD_HOLIDAYS = {
  fixed: { '01-01': 'tahun-baru', '08-17': 'kemerdekaan', '12-25': 'natal' },
  dates: {
    '2026-03-20': 'idul-fitri', '2026-05-27': 'idul-adha',
    '2027-03-10': 'idul-fitri', '2027-05-17': 'idul-adha',
    '2028-02-27': 'idul-fitri', '2028-05-05': 'idul-adha',
    '2029-02-15': 'idul-fitri', '2029-04-24': 'idul-adha',
    '2030-02-04': 'idul-fitri', '2030-04-13': 'idul-adha'
  },
  merah: ['2027-01-05', '2027-02-05', '2027-02-06', '2027-03-08', '2027-03-09', '2027-03-11', '2027-03-12', '2027-03-15',
    '2027-03-25', '2027-03-26', '2027-03-28', '2027-05-01', '2027-05-06', '2027-05-18', '2027-05-19', '2027-05-20',
    '2027-06-01', '2027-06-06', '2027-08-15', '2027-12-24', '2027-12-26'],
  ramadan: [
    ['2026-02-19', '2026-03-19'], ['2027-02-08', '2027-03-09'], ['2028-01-28', '2028-02-26'],
    ['2029-01-16', '2029-02-14'], ['2030-01-05', '2030-02-03']
  ]
};
