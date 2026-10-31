# XNK Catat (app klien mandiri)

PWA statis, jalan tanpa sinyal. Dilayani GitHub Pages di `xnk.my.id/app/`.

- Data lokal di `localStorage`: token, salinan `getPortalMore`, antrian, draf latihan.
- Setiap simpan masuk antrian (`x_queue`) dengan `cid`; dikirim berurutan saat online lewat `doPost` (Kode.gs, daftar putih `_appApi_`). Server idempoten lewat `cid`.
- Pustaka gerakan dan makanan diambil dari `../exercises` dan `../foods` (di-cache `sw.js`).
- Layar: Latihan (program coach, cari gerakan, set, kartu bagikan PNG), Makan (target, menu, cari TKPI, hapus), Ukuran, Foto (foto progres privat, item ditolak, keluar). Data di IndexedDB. Foto hanya online (lewat `uploadMyProgressPhoto`, diperkecil 1280 px).
- Fungsi baru untuk app ini harus ditambah ke `_appApi_` dan tes `doPost` di `tests/security.test.js`.

## APK (Capacitor)

`capacitor/` wraps this folder; workflow `capacitor-apk.yml` builds a debug APK (artifact `xnk-catat-apk`) on every change to `app/` or `capacitor/`. `tools/build-www.js` copies `app/`, `foods/` and `exercises/` into `www/`, so the APK works without signal. Install the APK directly; a Play Store upload needs a signed release build (keystore as a GitHub secret), not set up yet.
