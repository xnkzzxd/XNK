# Phase AB — TODO (T-2200+)

- [x] T-2200 Library build from production source with per-spreadsheet context (`build-lib.js`, `Konteks.gs`).
- [x] T-2201 Library public API (`LibApi.gs`): run, handleGet/Post, initInstance, saveSetup, triggers, healthCheck, setupState.
- [x] T-2202 Isolation tests (two spreadsheets, copy wipe, owner-only setup) and the production suite on the Library (`check-compat.js`: 672 pass, 14 expected identity differences).
- [x] T-2203 Bridge for XNK Template: generated wrappers, menu, 4-step setup wizard, manifest with pinned Library.
- [x] T-2204 Coach site build (`build-tenant.js`) + browser check (`tenant-check.js`: PIN, own clients only, portal, offline).
- [x] T-2205 Site template repo contents (`site-template/`: one "Setup situs" workflow, `config.json`, `custom/`).
- [x] T-2206 Workflow `xnk-library.yml`: checks, one-time "buat", "perbarui" on every main change.
- [x] T-2207 Docs: Panduan (Indonesian), PRD, Design, index.
- [~] T-2208 Owner: create both spreadsheets (done 2026-11-17 from the laptop with clasp, Library version 1 = build 8d15e1860f86), save `XNK_LIB_SCRIPT_ID` / `XNK_TEMPLATE_SCRIPT_ID`, share both spreadsheets (viewer).
- [ ] T-2209 Owner: create the `xnk-template-site` repo; fill it from `site-template/`; mark it Template repository.
- [ ] T-2210 First real copy end to end (wizard, deploy, site, login, booking), including one second Google account.
