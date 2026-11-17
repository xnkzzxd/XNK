# XNK hub (xnk.web.id)

Satu situs untuk semua coach:

| Alamat | Isi |
| --- | --- |
| `xnk.web.id/` | Halaman depan XNK: kotak "nama coach" untuk masuk |
| `xnk.web.id/<slug>/` | Panel coach (masuk dengan PIN) |
| `xnk.web.id/<slug>/klien/` | Portal klien (masuk dengan nomor WhatsApp). Link ini yang dibagikan ke klien |

`<slug>` = nama coach di alamat, mis. `claudia`: huruf kecil, angka, tanda hubung, 3 sampai 30 karakter.

Repo ini **hanya berisi daftar coach** (`hub.json`). Halamannya dibangun dari kode XNK yang publik. Data klien tidak pernah ada di sini: tiap coach menyimpannya di spreadsheet miliknya sendiri.

## Menambah coach

Syarat: coach sudah membuat salinan **XNK Template**, menyelesaikan **XNK → Mulai setup**, dan memberi Anda link `/exec` dari wizard.

1. Repo ini → **Actions → Hub XNK → Run workflow**.
2. Isi: *aksi* = `simpan`, *slug* (mis. `claudia`), *nama usaha* (mis. `Claudia Fit`), *link /exec*.
3. Klik **Run workflow** dan tunggu ±1 menit sampai centang hijau.
4. Alamat `xnk.web.id/claudia/` dan `xnk.web.id/claudia/klien/` sudah aktif.

Bila isian salah (slug dipakai sistem, link bukan `/exec`, dua coach memakai link yang sama), workflow berhenti dengan pesan yang jelas dan **situs lama tidak berubah**.

- **Mengubah** nama usaha atau link: jalankan lagi dengan aksi `simpan` dan slug yang sama.
- **Menghapus**: aksi `hapus` dan slug. Alamat itu langsung tidak aktif, jadi klien coach itu tidak bisa membukanya.
- **Jangan mengganti slug** coach yang sudah dipakai: link yang sudah dibagikan ke klien akan putus. Bila terpaksa, tambahkan slug baru dan hapus yang lama setelah klien diberi tahu.

## Pasang domain (sekali)

1. **Settings → Pages → Source**: pilih **GitHub Actions**. Lalu jalankan **Hub XNK** sekali (aksi `bangun`).
2. **DNS `xnk.web.id`** (di tempat Anda mendaftarkan domain), tambahkan:

   | Jenis | Nama | Nilai |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `<akun-GitHub-Anda>.github.io` |

   Bila GitHub mengubah alamat ini, ikuti dokumentasi *GitHub Pages → custom domain* yang terbaru.
3. **Settings → Pages → Custom domain**: isi `xnk.web.id`, Simpan, tunggu centang DNS hijau, lalu centang **Enforce HTTPS**. DNS bisa butuh beberapa menit sampai beberapa jam.
4. (Disarankan) **Verifikasi domain** di pengaturan akun GitHub (Settings → Pages → Add a domain), supaya orang lain tidak bisa memasang domain Anda di repo mereka.

## Halaman depan: tombol "Hubungi XNK"

Isi `contactUrl` di `hub.json` dengan link `https://` (mis. link WhatsApp bisnis `https://wa.me/62…`). Kosong = tombolnya tidak tampil.

## Catatan

- Semua coach berbagi satu domain, jadi tiap halaman coach diberi awalan penyimpanan per slug di browser (login, salinan offline, antrean catatan). Karena itu **coach tidak boleh memasang JavaScript sendiri** di situs ini. Tampilan hanya bisa diubah lewat nama usaha.
- Situs dibangun ulang setiap hari dari kode XNK terbaru, dan setiap kali `hub.json` berubah.
- Pustaka gerakan dan makanan masih dimuat dari `xnk.my.id`; bila situs itu mati, pencarian gerakan dan makanan di semua coach ikut terganggu.
- Notifikasi push ke HP belum tersedia di situs coach.
