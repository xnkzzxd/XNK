# Situs XNK untuk coach

Situs aplikasi personal training (panel coach + portal klien), sama dengan xnk.my.id, tetapi tersambung ke
spreadsheet **Anda sendiri**. Bisa dibuka tanpa sinyal, dan gratis lewat GitHub Pages.

- `/` → panel coach (masuk dengan PIN)
- `/klien/` → portal klien (masuk dengan nomor WhatsApp). Link inilah yang dibagikan ke klien.

## Setup (sekali, ±5 menit)

Sebelumnya: spreadsheet salinan **XNK Template** Anda sudah selesai **XNK → Mulai setup**, dan Anda punya
link aplikasi `/exec`.

1. Di halaman repo template ini, klik **Use this template → Create a new repository**. Beri nama, misalnya `gym-andi`.
2. Di repo baru: **Settings → Pages → Source**, pilih **GitHub Actions**.
3. **Actions → Setup situs → Run workflow**. Isi:
   - *Link aplikasi /exec*: tempel link dari wizard spreadsheet.
   - *Nama usaha*: misalnya `Gym Andi`.

   Klik **Run workflow**, tunggu ±1 menit sampai centang hijau.
4. Situs Anda: `https://<nama-akun>.github.io/<nama-repo>/`. Buka, lalu masuk dengan PIN.
5. (Disarankan) Di spreadsheet: **XNK → Mulai setup → langkah 4**, isi alamat utama situs ini (tanpa `/klien/`).
   Link di pesan WhatsApp ke klien otomatis menuju `<alamat>/klien/`, dan *Cek kesehatan* bisa memberi tahu bila
   ada versi baru.

## Mengubah situs

| Mau mengubah | Caranya |
| --- | --- |
| Link /exec atau nama usaha | Jalankan lagi **Setup situs**, isi yang berubah saja. Atau ubah `config.json` langsung. |
| Ikon, halaman tambahan | Taruh berkas di folder `custom/` (lihat `custom/README.md`). |
| Domain sendiri (mis. `booking.gymandi.com`) | Settings → Pages → Custom domain. Ikuti petunjuk DNS GitHub. |

Setiap perubahan di `main` membangun ulang situs otomatis.

## Pembaruan

Situs dibangun ulang **setiap hari** dari kode XNK terbaru, jadi perbaikan tampilan masuk sendiri. `config.json`
dan `custom/` tidak pernah ditimpa. Untuk memperbarui sekarang juga: jalankan **Setup situs** tanpa isian.

## Kalau ada masalah

- **Workflow merah "GitHub Pages belum dinyalakan"**: ulangi langkah 2, lalu jalankan workflow lagi.
- **"exec harus link /exec Apps Script"**: link harus berbentuk `https://script.google.com/macros/s/…/exec`.
- **Masuk dengan PIN gagal terus**: cek PIN di spreadsheet (**XNK → Mulai setup → langkah 2**).
- **Halaman lama masih tampil**: tutup lalu buka lagi situsnya (salinan offline diperbarui di latar).

Yang tidak ada di situs ini (belum): notifikasi push ke HP, dan halaman landing/penjualan.
