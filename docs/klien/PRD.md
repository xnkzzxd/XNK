# PRD — Fase Q: upgrade tampilan Klien + interpretasi data

Tujuan: portal klien dan halaman Klien di panel lebih rapi, setiap tab dibuka dengan kartu hitam ringkasan, dan data yang sudah terkumpul (berat dan lingkar, asesmen, tes kebugaran, log latihan, rating, catat makan) ditafsirkan jadi kalimat dan angka yang enak dilihat.

Keputusan owner:
- Tetap hitam-putih; satu-satunya warna adalah merah kecil (`--danger`) untuk Habis, PR telat, perlu perhatian.
- Kartu hitam (`insightHeroHtml`) di semua tab portal, tiap tab detail klien, dan halaman Klien.
- Beranda: sesi berikutnya paling atas, kartu "Minggu ini".
- Interpretasi untuk klien dan coach, dihitung di server. Klien: nada menyemangati + satu saran; coach: faktual + RPE. Angka sensitif dengan bahasa lembut. Rentang 4 mgg · 3 bln · Semua. Data sedikit: ajak melengkapi.
- Panel: kartu klien (sisa, sesi berikutnya, tanda perhatian, tren), urut dan filter, sakelar Kartu/Daftar, detail 4 tab (Ringkasan, Progres, Latihan, Gizi).
- Urutan kerja: Q1 fondasi, Q2 mesin interpretasi (`Wawasan.gs`), Q3 portal, Q4 panel.
