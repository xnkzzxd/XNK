# Phase AB — Design

## Files (`apps-script/xnk-library/`)
| Path | Role |
| --- | --- |
| `tools/build-lib.js` | Copies `pt-scheduler/src` → `dist/lib`, swaps shared services for context getters, swaps owner identity, drops the landing, adds `lib-extra/*`, `LibTabel.gs`, `LibVersi.gs`. Fails loudly when a pattern is missing or a shared service remains. |
| `lib-extra/Konteks.gs` | `_props_ _cache_ _lock_ _ss_ _scriptApp_` read the context installed by `_withCtx_`; per-execution memos are reset at the outermost entry and exit. `_brandName_`, `_siteUrl_`, `_faviconUrl_`. |
| `lib-extra/LibApi.gs` | Public API (`XNK.*`): `run`, `handleGet`, `handlePost`, `getLibraryVersion`, `healthCheck`, `initInstance`, `saveSetup`, `installTriggers`, `removeTriggers`, `setupState`. |
| `tools/build-bridge.js` | `dist/bridge`: `bridge-src/Penghubung.gs` + `Setup.html`, generated `PenghubungApi.gs`, manifest with the pinned Library version. |
| `tools/build-tenant.js` | Coach site from the Library HTML through production `build-static.js` (its `SRC` redirected in memory): `/`, `/klien/`, `icon.svg`, `lib-latest.json`, `custom/` overlay. |
| `tools/check-compat.js` | Runs every production test against the Library build; only the `EXPECTED` identity differences may fail. |
| `tools/tenant-check.js` | Playwright: coach site against a fake `/exec` that runs the Library with the coach's context. |
| `site-template/` | Contents of the XNK Template Site repo (`situs.yml`, `config.json`, `custom/`, README). |
| `tests/` | `library-isolation`, `bridge`, `library-build`; `lib-harness.js` loads the production harness with `SRC` redirected. |

## Service swaps (Library build only)
`PropertiesService.getScriptProperties()` → `_props_()`, `CacheService.getScriptCache()` → `_cache_()`,
`LockService.getScriptLock()` → `_lock_()`, `SpreadsheetApp.getActiveSpreadsheet()` → `_ss_()`, `ScriptApp.` →
`_scriptApp_().`. Reason: in a Library these resources are one instance shared by every including script.
The bridge passes its own: `{props, cache, lock, ss, scriptApp}`.

## Identity swaps
`RMD_PORTAL_URL`, `SHARE_QR_DEFAULT` and the new-client WhatsApp link → `_siteUrl_()` (Script Property `SITE_URL`,
else this spreadsheet's `/exec?view=public`); page title → `BRAND_NAME`; favicon → `FAVICON_URL` or the Apps Script
icon; `EVAL_SHEET_ID` → Script Property (empty = no form testimonials); the landing files are dropped and
`?view=Landing` falls back to Index. On the coach site: title, icon and Home Screen name come from `config.json`.

## Copies and versions
`initInstance` stores `XNK_INSTANCE_SS_ID`. A different spreadsheet ID means a copy: every Script Property is
deleted, then base sheets, `SESSION_SECRET` and the new ID are written. Copies pin a Library version; the XNK
Template is re-pinned by `xnk-library.yml` after each `clasp version`. `healthCheck({checkUpdate})` compares
`LIB_BUILD.hash` with `SITE_URL/lib-latest.json`, which every coach site build writes from the newest XNK code.

## Keep in sync
- A new production per-execution memo (`let _xMemo_ = null`) must be added to `MEMOS` (build-lib) and `_resetLibMemos_`.
- A new hardcoded owner URL or ID in `src` must get a `TEXT_SWAPS` entry, or `check-compat` / `library-build` flags it.
- A new API function needs nothing extra: `LibTabel.gs` and the bridge wrappers are generated from `tests/api-lists.js`.

## Merek di teks (2026-11-17)
Teks yang tampil ke coach atau klien memakai nama usaha coach itu. Browser: `window.brandName()` (dibuat di awal `App.html` Library dari `XNK_CONFIG.brand`, atau judul halaman yang diisi server); elemen statis memakai `data-brand`. Server: `_brandName_()` (Script Property `BRAND_NAME`). Yang sengaja tetap: pengenal teknis (`XNK_CONFIG`, `xnk_*`), `PRODID` kalender, nama folder Drive di akun coach sendiri. Teks "XNK" baru di `src` harus diberi `TEXT_SWAPS`; `library-build.test.js` gagal bila ada yang tersisa.
