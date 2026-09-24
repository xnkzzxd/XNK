# Apps Script (kode aplikasi di balik xnk.my.id)

Kode sumber aplikasi Google Apps Script milik XNK, disimpan di GitHub supaya
setiap perubahan tercatat dan **otomatis di-deploy**.

| Folder | Aplikasi | Dipakai di |
| --- | --- | --- |
| `apps-script/pt-scheduler/` | XNK Personal Trainer Scheduler (panel PT + halaman klien) | https://xnk.my.id dan link `/exec?view=Landing` |

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
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram (salin dari `kirimNotifTelegram` versi lama di editor, sebelum ditimpa) |
| `TELEGRAM_CHAT_IDS` | Chat ID admin, dipisah koma, mis. `12345678,87654321` |

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

## Cek lokal

```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js
```
