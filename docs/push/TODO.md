# Phase Z — Web Push (T-2100+)

Legenda: `[ ]` belum, `[~]` sedang, `[x]` selesai. 👤 = perlu pemilik. PRD: [PRD.md](PRD.md), desain: [Design.md](Design.md), pemasangan: [Setup.md](Setup.md).

- [x] T-2100 Server: `src/Push.gs` (sheet `PushSubs` / `PushOutbox`, validasi langganan, fungsi member dan admin, perencana sesi H-1 19:00 dan pagi H 06:00, PR, makan, kejadian perpanjangan, relay `pushRelayPull` / `pushRelayAck`); `getPortalBootstrap.pushKey`; daftar API dan tes (`tests/push.test.js`).
- [x] T-2101 Pengirim: `tools/push-send.js` (web-push, dites tanpa jaringan), `tools/push-keys.js`, workflow `.github/workflows/push.yml` (mati sampai `PUSH_ENABLED`).
- [x] T-2102 Service worker: handler `push` dan `notificationclick` di `tools/sw-app.template.js` (`tests/push-sw.test.js`).
- [x] T-2103 App: part `15-notifikasi-web-push-fase-x.part`, kartu di Lainnya (klien) dan Pengaturan → Notifikasi Admin (coach), pemeriksaan di `tools/browser-check.js`.
- [x] T-2104 Dokumen: PRD, Design, Setup, README Indonesia, Agent.md.
- [x] T-2104b Kunci VAPID dan rahasia relay diisi lewat file konfigurasi Drive (`CONFIG_KEYS`), pengirim mengambil kunci dari `pushRelayPull`; GitHub hanya butuh secret `PUSH_RELAY_SECRET`.
- [ ] T-2105 👤 Merge, buat file konfigurasi di Drive, pasang secret GitHub ([Setup.md](Setup.md)), jalankan workflow sekali, nyalakan di HP coach dan satu HP klien, cek sesi besok dan perpanjangan.
- [ ] T-2106 Setelah dipakai seminggu: bila telat cron terasa, pindahkan pengirim ke Cloudflare Worker (Phase V); alur dan format `pushRelayPull` / `Ack` tetap sama.
