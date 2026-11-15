# Memasang notifikasi (sekali, pemilik)

Semua ini dilakukan sekali. Sebelum langkah 3 selesai, kartu notifikasi tidak muncul di mana pun.

1. **Buat kunci** di komputer Anda (di folder repo):
   ```sh
   node apps-script/pt-scheduler/tools/push-keys.js
   ```
   Hasilnya hanya dicetak. Jangan tempel di chat dan jangan di-commit.
2. **GitHub** → repo `xnk` → Settings → Secrets and variables → Actions:
   - Secrets: `PUSH_VAPID_PRIVATE`, `PUSH_VAPID_PUBLIC`, `PUSH_RELAY_SECRET` (nilai dari langkah 1).
   - Variables: `PUSH_ENABLED` = `true`. (`PT_DEPLOYMENT_ID` sudah ada.)
3. **Apps Script** → Project Settings → Script Properties:
   - `PUSH_VAPID_PUBLIC` dan `PUSH_RELAY_SECRET` (nilai yang sama).
   - Opsional, agar permintaan perpanjang paket sampai seketika (bukan menunggu cron): `PUSH_GH_TOKEN` = token GitHub *fine-grained* untuk repo `xnk` dengan izin **Actions: Read and write**. `PUSH_GH_REPO` hanya perlu bila nama repo bukan `xnkzzxd/xnk`.
   - Opsional: `PUSH_HOUR_SESI_BESOK` (bawaan 19), `PUSH_HOUR_SESI_HARI_INI` (bawaan 6); `PUSH_ENABLED=false` mematikan semuanya.
4. **Jalankan sekali** workflow Push (GitHub → Actions → Push → Run workflow) dan pastikan hijau.
5. **Nyalakan di tiap perangkat:** coach di Pengaturan → Notifikasi Admin; klien di tab Lainnya. Ketuk saklar "Notifikasi di perangkat ini" lalu pilih **Izinkan**.
   - iPhone: buka situsnya di Safari → Bagikan → **Tambah ke Layar Utama**, buka lewat ikonnya, baru nyalakan.
   - Jika terlanjur menekan "Blokir": Chrome → ikon gembok di alamat → Izin → Notifikasi → Izinkan.

Mengganti kunci VAPID: pasang pasangan baru di kedua tempat; semua perangkat harus menyalakan lagi (klien: kartu memasang ulang sendiri bila diketuk; coach: matikan lalu nyalakan lagi).
