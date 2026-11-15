# Phase X — Desain

## Alur

```
Apps Script (Push.gs)                         GitHub Actions (push.yml)            Browser / HP
  sheet PushSubs  ← saveMyPush/saveAdminPush ←──────────────────────────────────── klien / coach menyalakan
  perencana _pushPlan_  ─► sheet PushOutbox
  _pushEvent_ (perpanjangan) ─► PushOutbox ─► _pushKick_ (repository_dispatch, opsional)
        ▲                                         │ tiap 5 menit / dibangunkan
        └── pushRelayPull(secret) ◄───────────────┤ tools/push-send.js
            (rencanakan, pinjamkan ≤ 60 baris)    │  web-push: enkripsi + VAPID
        ┌── pushRelayAck(secret, hasil) ◄─────────┘  ───────────► layanan push ───► sw-app.js (push) ─► notifikasi
```

## Server (`src/Push.gs`)

- **Sheet `PushSubs`** (kolom tetap): `Sub ID` (sha256 endpoint, 16 hex), `Peran` (`member`|`admin`), `Member ID` (`admin` untuk coach), `Endpoint`, `p256dh`, `auth`, `Label`, `Dibuat`, `Terakhir Terlihat` (ms), `Mati` (grup yang dimatikan, dipisah koma), `Gagal` (gagal beruntun).
- **Sheet `PushOutbox`**: `ID`, `Kunci` (`jenis|slot|subId`, satu pesan satu kali), `Dibuat` (ms), `Sub ID`, `Jenis`, `Judul`, `Isi`, `URL`, `Status` (`baru` → `diambil` → `terkirim` | `gagal`), `Percobaan`, `Diambil` (ms). Satu baris per perangkat, dibuat saat merencanakan; waktu disimpan sebagai angka (bukan teks ISO) agar Sheets tak mengubahnya jadi tanggal.
- **Grup** (`_pushGroupOf_`): `sesi` (sesi-besok, sesi-hari-ini), `pr`, `makan` (makan-pagi, makan-sore), `perpanjangan`. Klien: sesi/pr/makan; coach: sesi/perpanjangan.
- **Langganan**: `_pushCleanSub_` hanya menerima `https` ke `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`, kunci `p256dh` 80–100 dan `auth` 16–32 karakter base64url (agar relay tidak bisa dipakai menembak alamat sembarang). Satu perangkat satu baris; perangkat yang sama dipakai akun lain ikut pindah ke akun itu; klien maksimal 5 perangkat, coach 10 (yang paling lama tak terlihat diganti).
- **Perencana** (`_pushPlanMessages_`, murni sebagian besar, dites): jam sesi dari Script Properties `PUSH_HOUR_SESI_BESOK` (19) dan `PUSH_HOUR_SESI_HARI_INI` (6); PR dan makan memakai jam pengingat WhatsApp-nya (`RMD_<JENIS>_HOUR`, Ramadan, bawaan). Jatuh tempo bila jam sekarang ∈ [jam, jam + 2]; kunci `jenis|slot|subId` membuat tick berulang tidak menggandakan. Sesi hari ini hanya untuk sesi yang belum mulai.
- **Relay** (`pushRelayPull`, `pushRelayAck`): fungsi `PUBLIC` yang dijaga rahasia relay (perbandingan waktu-konstan, `PUSH_RELAY_SECRET` ≥ 24 karakter), bukan token. `pushRelayPull` merencanakan (throttle 60 dtk) lalu meminjamkan baris `baru` (atau `diambil` > 10 menit). Baris > 6 jam atau ≥ 4 percobaan → `gagal`. `pushRelayAck`: `ok` → `terkirim`; `gone` (404/410) → perangkat dihapus; `fail` → `baru` lagi (perangkat dihapus bila gagal beruntun 8 kali).
- **Kejadian**: `requestRenewal` memanggil `_pushEvent_` (antre untuk semua perangkat coach) lalu `_pushKick_` bila `PUSH_GH_TOKEN` terpasang (repository_dispatch `push-now`).
- Pembersihan: baris outbox > 3 hari (bukan `baru`) dihapus sekitar 03:00 WIB.
- `getPortalBootstrap.pushKey` = kunci publik VAPID, kosong bila fitur mati. Kartu panel memanggil `getAdminPushStatus` saat Pengaturan → Notifikasi Admin dibuka.

## Pengirim (`tools/push-send.js`, `.github/workflows/push.yml`)
`pushRelayPull` → kirim 5 sekaligus dengan `web-push` (TTL 4 jam, isi JSON, kunci VAPID dari jawaban server) → `pushRelayAck`. Tanpa secret `PUSH_RELAY_SECRET` langkah kirim selesai tanpa melakukan apa-apa; `PUSH_ENABLED=false` di server menjawab kosong. Tidak mencatat alamat langganan atau isi. Kunci dibuat `tools/push-keys.js`.

## Klien (app)
- `sw-app.js` (templat `tools/sw-app.template.js`): handler `push` (judul ≤ 80, isi ≤ 200, tag ≤ 40; tag yang sama menggantikan) dan `notificationclick` (fokus jendela aplikasi atau buka; hanya alamat di situs yang sama). Portal klien dan panel memakai build yang sama, jadi BookingPT-Client mendapatkannya lewat tarikan per jam, tanpa perubahan di repo itu.
- `parts/app/15-notifikasi-web-push-fase-x.part`: kartu `.push-wrap` (satu saklar "Notifikasi di perangkat ini", "Atur jenis notifikasi"). Tampil hanya bila halaman statis (`XNK_CONFIG.sw`), browser mendukung, dan server punya kunci. iPhone di Safari biasa: kartu meminta Layar Utama dulu. Saklar menunggu ketukan (izin harus diminta langsung dari ketukan). Portal menyambungkan ulang langganan yang ada ke akun yang sedang masuk (≤ tiap 3 hari). Keluar memanggil `pushForget` (hapus dari server selagi token ada, lalu `unsubscribe`).
- Tanpa panggilan baru saat membuka tab: kunci datang dengan bootstrap; pilihan jenis diambil hanya saat "Atur jenis notifikasi" dibuka.

## Keamanan
Kunci publik, kunci privat, dan rahasia relay di Script Properties (diisi lewat file konfigurasi Drive, tidak di kode); GitHub hanya menyimpan rahasia relay. `pushRelayPull` mengembalikan kunci privat hanya bila rahasia benar; pengirim memakainya di memori. (Keputusan 2026-11: GitHub Secrets tidak bisa diisi dari sesi agen, dan satu secret lebih sederhana bagi pemilik.) Langganan (alamat push) bersifat rahasia: tidak pernah dikirim ke browser selain milik akunnya sendiri (status hanya memuat id, label, pilihan). Fungsi member mengambil member dari token. Data push tidak masuk `getPortalMore`/`getClientBundle`, jadi tidak ada versi cache yang perlu dinaikkan.
