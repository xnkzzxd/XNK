# XNK Catat (app klien mandiri)

PWA statis, jalan tanpa sinyal. Dilayani GitHub Pages di `xnk.my.id/app/`.

- Data lokal di `localStorage`: token, salinan `getPortalMore`, antrian, draf latihan.
- Setiap simpan masuk antrian (`x_queue`) dengan `cid`; dikirim berurutan saat online lewat `doPost` (Kode.gs, daftar putih `_appApi_`). Server idempoten lewat `cid`.
- Pustaka gerakan dan makanan diambil dari `../exercises` dan `../foods` (di-cache `sw.js`).
- Layar: Latihan (cari gerakan, set, riwayat), Makan (cari TKPI, gram, total kkal), Ukuran.
- Fungsi baru untuk app ini harus ditambah ke `_appApi_` dan tes `doPost` di `tests/security.test.js`.
