# Memasang notifikasi (sekali, pemilik)

Setelah kode ini di-merge ke `main` dan terdeploy, ada dua hal saja. Sebelum itu selesai, kartu notifikasi tidak muncul di mana pun.

1. **Kunci ke Apps Script (lewat Google Drive, tanpa membuka editor).** Buat kunci dengan `node apps-script/pt-scheduler/tools/push-keys.js`, lalu buat file teks bernama `xnk-pt-config.json` di Google Drive akun pemilik Apps Script berisi JSON yang dicetak (`PUSH_VAPID_PUBLIC`, `PUSH_VAPID_PRIVATE`, `PUSH_RELAY_SECRET`). Server memindahkannya ke Script Properties pada panggilan berikutnya (paling lambat 5 menit) lalu membuang file itu ke Sampah. **Buat file ini setelah deploy selesai**: versi lama mengabaikan kunci ini tetapi tetap membuang file.
2. **Satu secret di GitHub.** Repo `xnk` → Settings → Secrets and variables → Actions → New repository secret: `PUSH_RELAY_SECRET` dengan nilai yang sama seperti di file tadi. Workflow *Push* (tiap 5 menit) mengambil kunci VAPID dari server dengan rahasia ini, jadi tidak ada secret lain.

Opsional:
- `PUSH_GH_TOKEN` di Script Properties (token GitHub *fine-grained* untuk repo `xnk`, izin **Actions: Read and write**) supaya permintaan perpanjang paket sampai seketika, bukan menunggu jadwal GitHub (telat 5–20 menit). `PUSH_GH_REPO` hanya perlu bila nama repo bukan `xnkzzxd/xnk`.
- `PUSH_HOUR_SESI_BESOK` (bawaan 19), `PUSH_HOUR_SESI_HARI_INI` (bawaan 6); `PUSH_ENABLED=false` mematikan semuanya (workflow tetap hijau, tidak mengirim apa pun).

Lalu: jalankan workflow Push sekali (GitHub → Actions → Push → Run workflow) dan pastikan hijau, dan **nyalakan di tiap perangkat**: coach di Pengaturan → Notifikasi Admin; klien di tab Lainnya. Ketuk saklar "Notifikasi di perangkat ini" lalu pilih **Izinkan**.
- iPhone: buka situsnya di Safari → Bagikan → **Tambah ke Layar Utama**, buka lewat ikonnya, baru nyalakan.
- Jika terlanjur menekan "Blokir": Chrome → ikon gembok di alamat → Izin → Notifikasi → Izinkan.

Mengganti kunci VAPID: kirim file konfigurasi baru; semua perangkat harus menyalakan lagi (klien: kartu memasang ulang sendiri bila diketuk; coach: matikan lalu nyalakan lagi).

Keamanan: kunci privat VAPID ada di Script Properties (seperti PIN dan token Telegram) dan hanya keluar lewat jawaban `pushRelayPull` yang dijaga rahasia relay; pengirim memakainya di memori. Bocornya rahasia relay berarti kunci itu dan daftar langganan bisa dibaca, jadi simpan hanya di GitHub Secrets. Mengganti rahasia: kirim file konfigurasi baru dan perbarui secret GitHub.
