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
- [-] T-2209 Per-coach site repo from `site-template/`: replaced by the hub (T-2211); kept as an optional route for a coach with their own domain.
- [ ] T-2210 First real copy end to end (wizard, deploy, site, login, booking), including one second Google account.
- [x] T-2211 Hub xnk.web.id ([Hub.md](Hub.md)): `build-hub.js`, `hub-edit.js`, landing + 404, per-slug storage prefix, service worker prefix fix, `hub-repo/` (form workflow), `hub-check.js` (two coaches, one origin), tests.
- [x] T-2212 Library: the health-form WhatsApp text and the QR fallbacks no longer point clients of other coaches to the XNK portal; `library-build.test.js` scans the HTML too.
- [x] T-2213 Wizard step 4: pick the address name, save `SITE_URL = hub + slug`, copy the data to send to the owner; `wizard-check.js`.
- [ ] T-2214 Owner: put `hub-repo/` into `xnk-template-site` (Claude), Pages + DNS + custom domain `xnk.web.id`, `contactUrl`.
- [ ] T-2215 First coach `claudia` end to end on `xnk.web.id`.
- [x] T-2216 Brand: visible "XNK" text (page title, login screen, WhatsApp "ini Coach XNK", calendar title, share-card watermark, "Member XNK", weekly report) now uses the coach's business name in the Library build (`window.brandName()` in the browser, `_brandName_()` on the server); `library-build.test.js` and `hub-check.js` fail on a leftover. Found by opening the live `xnk.web.id/claudia/klien/`: its title became "XNK Personal Training".
- [x] T-2217 Landing xnk.web.id as a proper XNK brand page: hero with app screens, client/coach features, screenshot strip, how it works, privacy, coach list from `hub.json`, the same login form, FAQ, OG image. Screens come from the demo (sample data) via `tools/hub-shots.js`; `hub.test.js` and `hub-check.js` cover the coach list, escaping, images and no sideways scroll.
