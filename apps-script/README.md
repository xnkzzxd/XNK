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
| https://book.xnkbooking.my.id | xnkzzxd/BookingPT-Client | `/exec?view=public` (portal klien, login link member) |

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

- `apps-script/pt-scheduler/src/` = isi proyek Apps Script, 1:1 dengan file di editor
  (`Kode.gs`, `Index.html`, `Landing.html`, `Scripts.html`, …).
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
rahasia di kode: semua akses data dicek di server (login PIN / link member).
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
| `MEMBER_LINK_BASE` | Alamat portal klien untuk link member pribadi. Isi salah satu: `https://book.xnkbooking.my.id/` (hanya setelah BookingPT-Client meneruskan `?k=…` ke iframe), atau `https://script.google.com/macros/s/AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ/exec?view=public` (langsung, pasti jalan). Kalau kosong, aplikasi menebak alamat /exec sendiri — lebih baik diisi. |

`SESSION_SECRET` dibuat otomatis oleh aplikasi. Menghapusnya = semua PT & klien logout.

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
- Tab **Variables** → *New repository variable*
  - Name: `PT_DEPLOYMENT_ID`
  - Value: ID deployment web app, yaitu bagian `AKfy…` dari link `/exec` yang dipakai
    xnk.my.id (cek di Apps Script → **Deploy → Manage deployments**).

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

Klien masuk portal lewat **link pribadi** (`…?k=KUNCI`). PT mengirim link itu dari
Profil Klien → **Kirim Link Member**; **Link Baru** membatalkan link lama.

## Cek lokal

```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js

# Opsional: uji halaman asli di Chromium (butuh Playwright terpasang global)
NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/browser-check.js
```
