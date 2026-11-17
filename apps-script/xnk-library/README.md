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
node apps-script/xnk-library/tools/build-tenant.js <out> --config config.json        # situs satu coach
node --test apps-script/xnk-library/tests/*.test.js            # tes Library + penghubung
node apps-script/xnk-library/tools/check-compat.js              # seluruh tes produksi pada kode Library
NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/tenant-check.js          # situs coach di browser
```

## Isi folder

- `lib-extra/` — berkas khusus Library: konteks per spreadsheet (`Konteks.gs`) dan API publik `XNK.*` (`LibApi.gs`).
- `bridge-src/` — kode penghubung XNK Template: menu XNK, wizard setup (`Setup.html`), trigger, doGet/doPost.
- `site-template/` — isi repo **XNK Template Site** (workflow "Setup situs", `config.json`, `custom/`).
- `tools/`, `tests/` — pembangun dan tes. `dist/` tidak di-commit.
