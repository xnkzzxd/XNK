# Akun Google coach dan token clasp (Gelombang 2, T-2230, T-2256)

Pemilik membuat **satu akun Gmail biasa per coach** dan mengelola spreadsheet coach dari GitHub Actions (repo hub,
workflow **Coach XNK**). GitHub tidak pernah menyimpan kata sandi: yang disimpan hanya **token clasp** (berkas
`.clasprc.json`), dan token itu bisa dicabut kapan saja tanpa mengganti kata sandi.

**Jangan pernah mengirim kata sandi akun lewat chat, email atau GitHub.** Bila pernah terkirim, ganti kata sandinya.

## Sekali per akun coach (di laptop pemilik, ±5 menit)

1. Masuk ke akun Google coach di browser (jendela samaran boleh).
2. Buka https://script.google.com/home/usersettings → nyalakan **Google Apps Script API**.
3. Di terminal laptop (PowerShell boleh, perintah satu per satu):
   ```
   npx @google/clasp@2.4.2 login
   ```
   Browser terbuka → pilih akun coach → Izinkan. Token tersimpan di `C:\Users\<nama>\.clasprc.json`
   (macOS/Linux: `~/.clasprc.json`).
4. Buka berkas itu dengan Notepad, salin **seluruh isinya**.
5. Repo hub `xnk-template-site` → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `CLASP_<SLUG>` dengan huruf besar dan `-` diganti `_` (contoh: `claudia` → `CLASP_CLAUDIA`,
     `gym-andi` → `CLASP_GYM_ANDI`).
   - Secret: tempel isi berkas tadi → **Add secret**.
6. Hapus berkas `.clasprc.json` dari laptop (atau jalankan `npx @google/clasp@2.4.2 logout`) sebelum login akun
   coach berikutnya, supaya token akun tidak tertukar.

## Lalu, di repo hub → Actions → Coach XNK → Run workflow

| Keadaan | Aksi | Isian |
| --- | --- | --- |
| Coach yang sudah ada dari XNK Template (mis. `claudia`) | `hubungkan` | slug |
| Coach baru | `baru` | slug + nama usaha |
| Pasang Library terbaru (otomatis tiap hari 02:37 WIB) | `perbarui` | slug, atau kosong = semua |

Setelah `baru`: ringkasan run berisi link proyek. Buka spreadsheet-nya (Drive akun coach) → menu **XNK → Mulai
setup** → beri izin Google, isi PIN. Nama usaha dan nama di alamat sudah terisi.

## Supaya akun tidak ditangguhkan Google

- Isi **nomor HP dan email pemulihan** di setiap akun, dan nyalakan **verifikasi 2 langkah**.
- Buat **paling banyak satu akun baru per hari** dari HP/laptop yang sama.
- Catat akun di tempat aman milik Anda (pengelola sandi), bukan di repo atau chat.
- Workflow `perbarui` memakai token setiap hari; token yang mati (sandi diganti, akses dicabut) muncul sebagai gagal
  di ringkasan run dengan pesan "clasp login ulang".
- GitHub: pasang **2FA (kunci keamanan / aplikasi)** di akun GitHub pemilik. Token semua akun coach ada di repo hub
  tanpa langkah persetujuan per run (keputusan pemilik); akun GitHub adalah kuncinya.
