# Design — Fase X: portal klien baru untuk HP

Apa dan kenapa: [PRD.md](PRD.md). Daftar kerja: [TODO.md](TODO.md).

## 1. Server (T-1902, built)

Tidak ada sheet baru. MemberData mendapat empat kolom di ujung (nomor tetap, ditambah idempoten oleh `_ensureProfileColumns_`):

| Kolom | Header | Isi |
| --- | --- | --- |
| AR (44) | Nama Panggilan | teks ≤ 20 |
| AS (45) | Motto | teks ≤ 60 |
| AT (46) | Kartu Profil | JSON `{a: aksen, g: gaya, s: [statistik], b: [badge], f: foto}` |
| AU (47) | Notif Dilihat | ISO, kapan lonceng terakhir dibuka |

`src/Profil.gs`
- `PF_ACCENTS` (hitam, biru, hijau, toska, ungu, pink, oranye), `PF_STYLES` (polos, aksen, garis), `PF_STATS` (sesi, minggu, berat, latihan, kuat, pr, makan, level), `PF_LIMITS`.
- Murni: `_pfFrom_(row)`, `_pfValidate_(data, earned)`, `_pfText_` (tanpa karakter kontrol; tidak boleh diawali `= + - @`).
- Member (member dari token, di bawah `_locked_`, lalu `_bumpAfter_`): `saveMyProfileCard(memberToken, data)` (hanya kunci yang dikirim yang berubah; badge unggulan harus sudah diraih) dan `markNotifSeen(memberToken)`.
- `_portalXFor_(row, pre)` menyusun enam part dari part `getPortalMore` yang sudah dihitung.

`src/Level.gs` — semuanya murni, angka ada di konstanta `LEVEL`:
- `_levelCalc_(counts)`: poin = sesi × 10 + latihan × 4 + hari makan × 1 + catatan ukuran × 2 + minggu beruntun terbaik × 5. Tangga `[0, 60, 180, 400, 800, 1300, 2000, 2900, 4000, 5500]`, gelar Pemula → Legenda. Jumlahnya sepanjang waktu, jadi level tidak turun.
- `_momentsCalc_`: rekor (dari `_workoutEvents_`), sesi pertama / ke-10 / 25 / 50 / 100, perubahan berat dan pinggang.
- `_journeyCalc_`: kalimat utama dan pendukung untuk halaman Progres, tiga tile berat.
- `_todoCalc_`: "Tugas hari ini" (latihan, makan, PR coach, booking, nilai sesi, evaluasi, perpanjang saat sisa ≤ 2, tagihan); yang selesai di bawah.
- `_notifCalc_`: lonceng. Item bertanggal (info, status perpanjangan, pencapaian) baru bila lebih baru dari "Notif Dilihat" dan tidak lebih tua dari 14 hari; pengingat (timbang ≥ 7 hari, data makan, form kesehatan, tagihan) baru sekali sehari.

`getPortalMore` membawa part `profile`, `level`, `moments`, `journey`, `notif`, `todo` (satu galat = keenamnya `{error}`, tidak di-cache). `getClientBundle.athlete = { profile, level }` supaya coach melihat yang sama.

## 2. Klien

Peta layar mockup → kode:

| Mockup | View / layar | Catatan |
| --- | --- | --- |
| Hari ini | `public-dashboard` | `todo` dari server; kartu sesi (gaya A) |
| Latihan, Galeri, detail/menu/buat rutinitas | `public-program` + sheet | segmen Latihan/Makan dihapus |
| Makan, Tambah makanan, Ubah porsi | `public-food` (baru), `#food-add` | antrean offline `xnk_food_queue` tetap |
| Saya, Ubah profil, Badge, Statistik, Tampilan | `public-more`, `#sheet-profile-edit` | simpan lewat `optimistic({q})` |
| Rencana makan, Belanja, Ganti menu, Penjelasan angka | `public-plan` (baru) | isi `makanInner` lama |
| Paket saya, Perpanjang 2 langkah | `public-pack` (baru) | dari `renderCatalog` + `sheet-renew` |
| Jadwal | `calendar` (halaman kedua) | kalender bulan + daftar |
| Booking 1–3, Jam terisi | `#bk-screen` (pola `#wl-screen`) | `clientBookSchedule` soft, `showConflict` |
| Lonceng | `#sheet-notif` | `markNotifSeen` saat dibuka |
| Progres, Catat ukuran, Foto progres | `public-progress` | `journey` + `moments` |
| Masuk, Daftar 1–5, Sambutan | `public-login`, `#reg-screen` | `GUIDE_STEPS` lama dihapus |
| Bagikan, Latihan selesai, Naik level | `Bagikan.html`, layar perayaan | kartu ikut aksen dan gaya |

Tema (`parts/theme/05-portal-x.part`):
- Aksen: `html[data-accent="biru"]` dst. menimpa `--accent` dan `--on-accent` (terang dan gelap, kontras ≥ 4,5:1). Bawaan `--accent: var(--ink)`. Dipakai tombol utama, cincin, meter, tab aktif. `--danger` tetap satu-satunya merah.
- Grafis: `.gfx-geo` (A), `.gfx-kontur` (B), `.gfx-tipo` (C) sebagai lapisan `::before` / elemen `aria-hidden` dengan token, tidak pernah menutupi teks.
- Aturan lama tetap: ukuran teks rem, `min-height`, 44 px, `var(--sa-*)`, `var(--tabbar-space)`, `:hover` di `@media (hover: hover)`.

Ganti tab tidak memanggil server. Semua data layar baru datang dari `getPortalBootstrap` + `getPortalMore`.
