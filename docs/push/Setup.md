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

# Hub xnk.web.id: notifikasi untuk semua coach (T-2240)

Semua coach di `xnk.web.id` berbagi satu origin, jadi **satu pasang kunci VAPID untuk seluruh hub**. Kunci privat hanya di secret repo hub; spreadsheet coach hanya menyimpan kunci publik dan rahasia relay buatan sendiri.

Alur: workflow **Push XNK** di repo hub (`xnk-template-site`, tiap 5 menit) memanggil `pusatPushTargets(PUSAT_PUSH_SECRET)` di XNK HQ → daftar `{slug, exec, relay}` coach yang push-nya menyala → untuk tiap coach `pushRelayPull(relay)` → web-push dengan kunci hub → `pushRelayAck(relay, hasil)` ke coach yang sama (`apps-script/xnk-library/tools/hub-push.js`, memakai `push-send.js`). XNK HQ membagikan kunci publik dan menyalakan/mematikan coach lewat `hubPushKey(HUB_SECRET, kunci, menyala)` setiap pagi dan saat tombol di `/adminxnk` ditekan; jawabannya membawa rahasia relay coach.

Kenapa tidak lewat XNK HQ setiap putaran: 20 coach × 12 putaran/jam × 2 panggilan × 2 fetch = ±23.000 UrlFetch sehari, di atas kuota akun Gmail (20.000). Sekarang XNK HQ memakai **0 fetch per putaran** dan 2 fetch per coach menyala per hari. `HUB_SECRET` (yang membuka `hubExport`, data penuh) tidak pernah keluar dari XNK HQ; rahasia relay hanya membuka antrean push coach itu.

Pasang sekali (pemilik):
1. **Kata sandi kunci.** Buat kata sandi acak minimal 32 karakter (pengelola kata sandi). Repo hub → Settings → Secrets and variables → Actions → New repository secret: `HUB_VAPID_PRIVATE`. Kunci P-256 diturunkan dari kata sandi itu (SHA-256), jadi tidak ada kunci yang perlu disalin. Kunci web-push 43 karakter juga diterima apa adanya.
2. **Kunci publik ke hub.json.** Actions → Push XNK → Run workflow → aksi **kunci**. Workflow menghitung kunci publik, menulisnya ke `hub.json` (`vapidPublic`) dan mencetaknya; kunci privat tidak pernah dicetak.
3. **Rahasia Pusat.** Buat kata sandi acak lain (≥ 32). Simpan sebagai secret `PUSAT_PUSH_SECRET` di repo hub **dan** sebagai Script Property `PUSAT_PUSH_SECRET` di XNK HQ (editor → Project Settings → Script Properties).
4. **Nyalakan per coach.** `xnk.web.id/adminxnk` → kartu coach → **Nyalakan push** (aturan 5: mati sampai ditekan). Coach dengan Library lama mendapat pesan "perbarui coach".
5. **Perangkat.** Coach: Pengaturan → Notifikasi Admin; klien: Saya / Lainnya → saklar "Notifikasi di perangkat ini" → Izinkan. Klik notifikasi membuka `/<slug>/` (coach) atau `/<slug>/klien/` (klien).
6. **Tepat waktu.** Jadwal "tiap 5 menit" GitHub sering tertunda berjam-jam (audit 2026-11-25: ±3–4 run sehari), padahal pesan push baru dibuat saat workflow berjalan. Karena itu XNK HQ punya trigger `runPusatPushKick` (tiap 10 menit, 05:00–22:59 WIB) yang menjalankan Push XNK lewat `workflow_dispatch` dengan `GITHUB_TOKEN` XNK HQ, hanya bila ada coach yang push-nya menyala. Dipasang oleh `setupPusat` / `/adminxnk` → **Siapkan XNK HQ** (sekali). Cron tetap jadi cadangan. Penolakan GitHub dicatat di Script Property `PUSHKICK_LAST` (`{at, code}`).

Mengganti kunci hub: ganti `HUB_VAPID_PRIVATE`, jalankan aksi **kunci**; XNK HQ membagikan kunci baru keesokan paginya (atau tekan Matikan lalu Nyalakan push), dan semua perangkat harus menyalakan lagi.
