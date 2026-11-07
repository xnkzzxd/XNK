# Phase AAA — jalan kembali (rollback)

Tiga situs sekarang memakai halaman statis. Halaman Apps Script lama tidak pernah dihapus, jadi tiap situs bisa dikembalikan sendiri-sendiri tanpa mengubah backend.

| Situs | Sekarang | Cara kembali |
| --- | --- | --- |
| xnk.my.id (panel) | `/` = panel statis (`sw-app.js`) | Repo XNK → Settings → Secrets and variables → Actions → Variables → buat `ROOT_LEGACY` = `true`, lalu Actions → "Pages" → Run workflow. `/` jadi pembungkus iframe lama lagi. Atau PR yang membalik `rootLegacy` di `tools/build-site.js`. `/legacy/` selalu ada. |
| xnkbooking.my.id (landing) | iframe `index.html` memuat `/l/` (landing statis, ditarik dari xnk.my.id/landing-pub/) | Repo BookingPT: ganti `src="/l/"` pada `<iframe id="app">` di `index.html` dengan alamat Apps Script `…/exec?view=Landing` (alamat ada di `tools/sync-prices.js`, konstanta `EXEC`) dan ubah tes `tests/build.test.js` yang memeriksa `src`. Hentikan juga workflow "Tarik landing dari XNK" bila perlu (Actions → Disable). |
| book.xnkbooking.my.id (portal) | `index.html` = portal statis (ditarik dari xnk.my.id/client/) | Repo BookingPT-Client: salin `legacy.html` menjadi `index.html`, commit, dan nonaktifkan workflow "Tarik portal dari XNK" (kalau tidak, jam berikutnya ia menimpa lagi). Atau balik (revert) PR cutover. |

## Hal yang perlu diingat

- Pemakai yang sudah membuka versi statis punya service worker (`sw-app.js`) yang menyimpan halaman. Halaman diambil jaringan-dulu, jadi setelah rollback mereka mendapat halaman lama pada pembukaan berikutnya (salinan hanya dipakai saat offline).
- Token login dan antrean offline tersimpan per alamat situs (localStorage). Pindah bolak-balik antara versi lama (iframe di `script.googleusercontent.com`) dan versi statis membuat klien login ulang; antrean offline yang belum terkirim di versi yang ditinggalkan tidak ikut. Ini sudah diterima pemilik.
- Backend (Apps Script) tidak berubah oleh cutover mana pun, jadi tidak ada yang perlu dikembalikan di sana. Urutan rilis tetap: backend dulu (selalu kompatibel mundur), frontend sesudahnya; `API_VERSION` / `XNK_API_MIN` menjaga selisih versi.
- Landing dan portal memperbarui diri dari xnk.my.id tiap jam (workflow tarik). Percepat dengan Actions → "Tarik …" → Run workflow di repo masing-masing. Rilis frontend yang rusak bisa dihentikan di sumbernya: perbaiki di repo XNK, atau nonaktifkan workflow tarik supaya repo tujuan berhenti mengikuti.
- Halaman Apps Script sendiri (`/exec`, `/exec?view=Landing`, `/exec?view=public`) tetap hidup dan ikut ter-deploy oleh `pt-scheduler.yml`; itu jalur lama yang dipakai tes mode `gas` di CI.
