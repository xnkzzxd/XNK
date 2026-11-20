# XNK Library

Aplikasi PT Scheduler sebagai **Apps Script Library** untuk coach lain, plus spreadsheet **XNK Template** dan
template situs. Produksi (`apps-script/pt-scheduler/`, xnk.my.id) tidak diubah: Library dibangun dari kode
produksi setiap kali ada perubahan.

Panduan pemakaian (pemilik dan coach): [docs/library/Panduan.md](../../docs/library/Panduan.md).
Desain teknis: [docs/library/Design.md](../../docs/library/Design.md).

## Perintah

```sh
node apps-script/xnk-library/tools/build-lib.js                 # → dist/lib (kode Library)
node apps-script/xnk-library/tools/build-bridge.js --lib-id <id> --lib-version <n>   # → dist/bridge (XNK Template)
node apps-script/xnk-library/tools/build-tenant.js <out> --config config.json        # situs satu coach (domain sendiri)
node apps-script/xnk-library/tools/build-hub.js <out> --config hub.json              # situs hub xnk.web.id (semua coach)
node apps-script/xnk-library/tools/hub-edit.js hub.json simpan <slug> <nama> <link /exec>
node apps-script/xnk-library/tools/hub-edit.js hub.json ganti-slug <lama> <baru>     # T-2243: link lama tetap jalan
node apps-script/xnk-library/tools/hub-edit.js hub.json nonaktif <slug>              # T-2252: coach keluar (aktifkan = batal)
node --test apps-script/xnk-library/tests/*.test.js            # tes Library + penghubung
node apps-script/xnk-library/tools/check-compat.js              # seluruh tes produksi pada kode Library
NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/tenant-check.js          # situs coach di browser
NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/hub-check.js             # hub: dua coach, satu domain
NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/wizard-check.js          # wizard setup di spreadsheet
```

## Isi folder

- `lib-extra/` — berkas khusus Library: konteks per spreadsheet (`Konteks.gs`) dan API publik `XNK.*` (`LibApi.gs`).
- `bridge-src/` — kode penghubung XNK Template: menu XNK, wizard setup (`Setup.html`), trigger, doGet/doPost.
- `hub-site/`, `hub-repo/` — landing xnk.web.id dan isi repo hub (daftar coach + workflow Hub XNK); lihat [docs/library/Hub.md](../../docs/library/Hub.md).
- `site-template/` — alternatif: repo situs untuk satu coach dengan domain sendiri (bukan jalur utama).
- `tools/`, `tests/` — pembangun dan tes. `dist/` tidak di-commit.
