# Apps Script (kode aplikasi di balik xnk.my.id)

Kode sumber aplikasi Google Apps Script milik XNK, disimpan di GitHub supaya
setiap perubahan tercatat dan **otomatis di-deploy**.

| Folder | Aplikasi |
| --- | --- |
| `apps-script/pt-scheduler/` | XNK Personal Trainer Scheduler (panel PT, landing, portal klien) |

Ketiga situs ini membungkus **deployment yang sama** (`AKfycbyVOm1…BgJ`), jadi satu kali
deploy memperbarui semuanya:

| Situs | Repo | Halaman Apps Script |
| --- | --- | --- |
| https://xnk.my.id | xnkzzxd/XNK | `/exec` → Index (panel PT, login PIN) |
| https://xnkbooking.my.id | xnkzzxd/BookingPT | `/exec?view=Landing` (marketing + daftar) |
| https://book.xnkbooking.my.id | xnkzzxd/BookingPT-Client | `/exec?view=public` (portal klien, login nomor WA) |

## Cara kerja

```
PR di GitHub ──► cek otomatis (sintaks + tes) ──► merge ke main
                                                     │
                                                     ▼
                         GitHub Actions: clasp push ──► clasp deploy
                                                     │
                                                     ▼
                  Apps Script: versi baru di deployment yang SAMA (link /exec tidak berubah)
```

- `apps-script/pt-scheduler/src/` = isi proyek Apps Script, 1:1 dengan file di editor:
  - `Kode.gs` — server (data, login, keamanan).
  - `Index.html` + `Theme.html` + `App.html` — panel PT & portal klien (desain hitam-putih,
    terang/gelap otomatis, tata letak HP & desktop berbeda).
  - `Landing.html` + `LandingStyle.html` + `LandingScript.html` — halaman xnkbooking.my.id
    (terang galeri, hero foto coach dengan cahaya WebGL, animasi GSAP; HP & desktop berbeda).
    Foto hero ada di repo BookingPT (`img/`), dibuat dengan `tools/make-landing-images.py`.
  - `Scripts.html` — helper kecil yang dipakai bersama Index & Landing.
- `apps-script/pt-scheduler/.clasp.json` = ID proyek Apps Script (bukan rahasia).
- `apps-script/pt-scheduler/tests/` = tes otomatis (tidak ikut di-push ke Apps Script).
- `.github/workflows/pt-scheduler.yml` = alur cek + deploy.

## ⚠️ Aturan penting

**Setelah deploy otomatis aktif, ubah kode HANYA lewat repo ini.**
Setiap deploy menimpa seluruh kode di editor Apps Script dengan isi `apps-script/pt-scheduler/src/`.
Perubahan yang diketik langsung di editor online akan hilang pada deploy berikutnya.

Rahasia (token bot, PIN, password) **tidak boleh** ditulis di kode. Simpan di
Apps Script → ⚙️ Project Settings → **Script Properties**.

**Repo ini publik.** Siapa pun bisa membaca kodenya, dan itu aman selama tidak ada
rahasia di kode: semua akses data dicek di server (login PIN admin / nomor WA klien).
Secret GitHub (`CLASPRC_JSON`) tidak terlihat publik dan tidak dipakai untuk PR dari fork;
deploy hanya jalan saat ada push ke `main`, yang hanya bisa dilakukan pemilik repo.

## Setup sekali (dilakukan pemilik akun Google)

### 1. Script Properties (di editor Apps Script, sebelum deploy pertama)

Buka proyek *XNK Personal Trainer Scheduler* → ⚙️ **Project Settings** →
**Script Properties** → *Add script property*:

| Property | Isi |
| --- | --- |
| `ADMIN_PIN` | **Wajib.** PIN login panel PT, minimal 6 karakter. Tanpa ini tidak ada yang bisa masuk panel. Mengganti PIN = semua perangkat PT otomatis logout. |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram (salin dari `kirimNotifTelegram` versi lama di editor, sebelum ditimpa) |
| `TELEGRAM_CHAT_IDS` | Chat ID admin, dipisah koma, mis. `12345678,87654321` |

`SESSION_SECRET` dibuat otomatis oleh aplikasi. Menghapusnya = semua PT & klien logout.

**Tanpa membuka editor:** buat file bernama `xnk-pt-config.json` di Google Drive akun
pemilik (jangan dibagikan), isinya JSON, mis.
`{"ADMIN_PIN":"135790","TELEGRAM_CHAT_IDS":"12345678,87654321"}`. Paling lambat 5 menit
setelah halaman aplikasi dibuka, isinya dipindah ke Script Properties, file dibuang ke
Sampah, dan Telegram menerima notif "Pengaturan aplikasi diperbarui". Hanya tiga
property di tabel atas yang diterima; `null` menghapus property. File milik akun lain
(yang dibagikan ke Anda) diabaikan.

### 2. Izinkan Apps Script API

Buka https://script.google.com/home/usersettings → **Google Apps Script API** → **On**.

### 3. Login clasp di komputer

Butuh [Node.js](https://nodejs.org). Pakai versi clasp yang sama dengan robot deploy:

```sh
npm install -g @google/clasp@2.4.2
clasp login
```

Browser terbuka, login dengan akun Google pemilik proyek. Setelah selesai, ada file
`~/.clasprc.json` (Windows: `C:\Users\<nama>\.clasprc.json`).

### 4. Simpan kunci di GitHub

Repo ini → **Settings** → **Secrets and variables** → **Actions**:

- Tab **Secrets** → *New repository secret*
  - Name: `CLASPRC_JSON`
  - Secret: **seluruh isi** file `.clasprc.json`
- Opsional, tab **Variables**: `PT_DEPLOYMENT_ID` hanya perlu diisi kalau web app
  pindah ke deployment lain. Tanpa variable ini, robot deploy memakai deployment
  xnk.my.id saat ini (`AKfycbyVOm1…BgJ`).

Selesai. Merge berikutnya ke `main` akan otomatis ter-deploy. Untuk deploy ulang
manual: tab **Actions** → *PT Scheduler* → **Run workflow**.

> `CLASPRC_JSON` memberi akses ke proyek Apps Script & Drive akun Google Anda.
> Jangan dibagikan. Bisa dicabut kapan saja di https://myaccount.google.com/permissions
> (cari "clasp"), lalu ulangi langkah 3–4.

## Rollback (kalau versi baru bermasalah)

- **Cepat (tanpa kode):** Apps Script → **Deploy → Manage deployments** → ✏️ Edit →
  *Version*: pilih versi sebelumnya → **Deploy**. Link tetap sama.
- **Lewat repo:** revert PR-nya di GitHub → merge → robot men-deploy versi lama lagi.

## Keamanan (wajib dibaca sebelum menambah fungsi server)

Web app ini terbuka untuk siapa saja dan berjalan sebagai akun pemilik, jadi **setiap
fungsi di `.gs` yang namanya tidak berakhiran `_` bisa dipanggil siapa saja dari browser**.

- Fungsi admin (panel PT): parameter pertama `token`, baris pertama `requireAdmin_(token);`.
- Fungsi portal klien: parameter pertama token member, baris pertama `requireMember_(token)`.
- Fungsi pembantu: beri akhiran `_` (private).
- Fungsi perawatan yang dijalankan manual dari editor: `requireOwner_();`.

Tes `security.test.js` gagal kalau ada fungsi baru yang belum masuk salah satu daftar di atas.

Klien masuk portal dengan **nomor WhatsApp** yang terdaftar (di book.xnkbooking.my.id atau
tombol *Member Lama* di xnkbooking.my.id). Nomor dicek di server; daftar klien tidak pernah
dikirim ke browser. HP klien mengingat login 90 hari. Siapa pun yang tahu nomor WA seorang
klien bisa masuk sebagai klien itu — risiko ini disengaja supaya tanpa link/PIN klien.
Untuk mencegah pemindaian massal: 30 nomor tak dikenal dalam 10 menit = login nomor WA
dikunci 10 menit + notif Telegram. Mengosongkan kolom N ("Kunci Link") seorang klien di
sheet MemberData mengeluarkan klien itu dari semua HP.

## Cek lokal

```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js

# Opsional: uji halaman asli di Chromium (butuh Playwright terpasang global)
NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/browser-check.js
```
