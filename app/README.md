# XNK Catat (app klien mandiri)

PWA statis, jalan tanpa sinyal. Dilayani GitHub Pages di `xnk.my.id/app/`.

- Data lokal di `localStorage`: token, salinan `getPortalMore`, antrian, draf latihan.
- Setiap simpan masuk antrian (`x_queue`) dengan `cid`; dikirim berurutan saat online lewat `doPost` (Kode.gs, daftar putih `_appApi_`). Server idempoten lewat `cid`.
- Pustaka gerakan dan makanan diambil dari `../exercises` dan `../foods` (di-cache `sw.js`).
- Kartu bagikan lengkap: `share.html` (dibuat oleh `apps-script/pt-scheduler/tools/build-app-share.js` dari Theme.html + Bagikan.html; jangan diedit; tes `app-share.test.js` menjaganya tetap baru) berjalan di iframe, dengan `share-shim.js` sebagai jembatan. Setelah mengubah Bagikan.html atau Theme.html, jalankan tool itu.
- Layar: Latihan (program coach, cari gerakan, set, kartu bagikan PNG), Makan (target, menu, cari TKPI, hapus), Ukuran, Foto (foto progres privat, item ditolak, keluar). Data di IndexedDB. Foto hanya online (lewat `uploadMyProgressPhoto`, diperkecil 1280 px).
- Fungsi baru untuk app ini harus ditambah ke `_appApi_` dan tes `doPost` di `tests/security.test.js`.
