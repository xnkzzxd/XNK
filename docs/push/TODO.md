# Phase X — Web Push (T-1900+)

Legenda: `[ ]` belum, `[~]` sedang, `[x]` selesai. 👤 = perlu pemilik. PRD: [PRD.md](PRD.md), desain: [Design.md](Design.md), pemasangan: [Setup.md](Setup.md).

- [x] T-1900 Server: `src/Push.gs` (sheet `PushSubs` / `PushOutbox`, validasi langganan, fungsi member dan admin, perencana sesi H-1 19:00 dan pagi H 06:00, PR, makan, kejadian perpanjangan, relay `pushRelayPull` / `pushRelayAck`); `getPortalBootstrap.pushKey`; daftar API dan tes (`tests/push.test.js`).
- [x] T-1901 Pengirim: `tools/push-send.js` (web-push, dites tanpa jaringan), `tools/push-keys.js`, workflow `.github/workflows/push.yml` (mati sampai `PUSH_ENABLED`).
- [x] T-1902 Service worker: handler `push` dan `notificationclick` di `tools/sw-app.template.js` (`tests/push-sw.test.js`).
- [x] T-1903 App: part `15-notifikasi-web-push-fase-x.part`, kartu di Lainnya (klien) dan Pengaturan → Notifikasi Admin (coach), pemeriksaan di `tools/browser-check.js`.
- [x] T-1904 Dokumen: PRD, Design, Setup, README Indonesia, Agent.md.
- [ ] T-1905 👤 Pasang kunci dan variabel ([Setup.md](Setup.md)), jalankan workflow sekali, nyalakan di HP coach dan satu HP klien, cek sesi besok dan perpanjangan.
- [ ] T-1906 Setelah dipakai seminggu: bila telat cron terasa, pindahkan pengirim ke Cloudflare Worker (Phase V); alur dan format `pushRelayPull` / `Ack` tetap sama.
