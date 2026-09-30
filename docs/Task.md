# Tasks — PT Scheduler upgrade

Work items for [PRD.md](PRD.md), built as described in [Design.md](Design.md). Rules for whoever picks a task are in [Agent.md](Agent.md).

- IDs start at **T-100**, because code comments already use T-40 … T-78 from the earlier reminder work.
- Size: **S** ≈ under 2 h, **M** ≈ half a day, **L** ≈ a day or more.
- Status: `[ ]` todo · `[~]` in progress · `[x]` done. Update the box in the same commit that finishes the task.
- One task = one commit (or a few), with tests passing. A phase = one pull request.
- **Every UI task is only done when it also works on a phone** (Design.md §8, PRD M-1…M-9): 360–430 px, both themes, 44 px targets, the right keyboard, and back gesture handled. "Done when" below states the phone check where it matters.

## Phase A — Settings UI (priority 1)

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | T-100 | Add the `settings` admin view: route in `VIEWS`, `renderSettings()`, hash `#settings/<section>` with one history entry per level (so the phone back gesture steps back), sidebar and top-bar gear navigate to it. Client portal keeps the small sheet (theme and logout only). | App.html, Index.html | — | M | Gear opens the view on phone and desktop; refresh keeps the section; phone back from a section returns to the list; portal unchanged. |
| [ ] | T-101 | Layout pieces: `.settings-layout`, `.settings-nav(-item)`, `.save-bar`, `.field.has-error`, `.status-dot`, all from existing tokens, light and dark, reduced-motion safe. | Theme.html | T-100 | S | Browser check at 360, 390 and 1280 px in both themes shows no overflow; save bar sits above the tab bar and safe area. |
| [ ] | T-102 | Section framework: `serialize(section)`, snapshot on load, dirty detection, save bar (Batal/Simpan), leave-guard via `showConfirmModal`, partial payload of changed keys only. | App.html | T-100 | M | Edit then revert hides the bar; Batal restores; leaving a dirty section (including by phone back gesture) asks; with the phone keyboard open the focused field stays visible. |
| [ ] | T-103 | Move existing controls into sections: Tampilan, Notifikasi Admin, Jam Operasional, Keamanan (PIN form and numbers), Akun. Delete the old admin block from `#sheet-settings`. | Index.html, App.html | T-102 | M | Every control from the old sheet exists in exactly one section and saves; phone layout per Design §8.2 (days one per row, limits stacked below 400 px, numeric keyboards). |
| [ ] | T-104 | Client-side validation mirroring server bounds, and "Bawaan" reset links that clear a field to its default. | App.html | T-103 | S | Out-of-range values can't be submitted; cleared fields delete the property (test). |
| [ ] | T-105 | Mask secrets: `getAppSettings` returns `••••<last4>` for the Telegram token; an empty token field on save means keep; `sendTelegramTest` falls back to the stored token when the field is empty. | Kode.gs, App.html, tests/settings.test.js | — | S | The token never reaches the browser in full; saving other fields keeps it (test). |
| [ ] | T-106 | Pengingat Klien section, first cut: master switch, one card per existing type **including makan-pagi / makan-sore**, hour and test button, sleep line. | Index.html, App.html | T-102 | M | No `RMD_*` setting needs the editor or Script Properties. |
| [ ] | T-107 | `getReminderStatus(token)` and `installReminderTrigger(token)` (admin), with a status row and a Pasang button. Trigger runs every 15 min. | Reminder.gs, App.html, tests/security.test.js | T-106 | S | Owner installs the trigger from the phone; status shows the last tick. |
| [ ] | T-108 | `getReminderLog(token, opts)` (admin), with a history list in the section showing names, not phone numbers, and a "Hanya gagal" filter. | Reminder.gs, App.html, tests | T-106 | S | Last 50 rows visible; test proves no phone numbers in the response. |
| [ ] | T-108a | Phone pass in `tools/browser-check.js`: 390 × 844 touch viewport, both themes, checks overflow, 44 px targets, save bar overlap and back navigation for every Settings section. | tools/browser-check.js | T-103 | S | Script fails on any of those problems and passes on the finished phase A. |
| [ ] | T-109 | Docs: update `apps-script/README.md` (Pengaturan section), root README, CLAUDE.md state. Tick the boxes above. | docs | T-100…T-108 | S | Docs match the shipped UI. |

## Phase B — Pricelist CRUD (priority 2)

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | T-110 | Header-based schema: `_priceListSchema_`, `_ensurePriceListSchema_` (insert Jumlah Sesi if missing, append Urutan). Switch `getPriceList` and `_allPackagePrices_` to header mapping and sort by Urutan. | Kode.gs, tests/pricelist.test.js (new) | — | M | Legacy 8-column and current 9-column sheets both read correctly; migration is idempotent. |
| [ ] | T-111 | `PACKAGE_CATEGORIES` constant and validation `_validatePackage_` (name, category, integer price, sessions or fleksibel, durasi, deskripsi, benefits without commas). | Kode.gs, tests | T-110 | S | Every bad input gets an Indonesian error (tests). |
| [ ] | T-112 | Admin API: `getPriceListAdmin` (with usage counts), `savePackage`, `setPackageActive`, `deletePackage` (blocked when used), `reorderPackages`. Server-generated IDs `PKG-yyyyMMdd-xxxx`. Script lock on writes. | Kode.gs, tests, tests/security.test.js | T-111 | M | CRUD tests pass; the security test lists the five functions as ADMIN. |
| [ ] | T-113 | Price snapshot: MembersLog column K "Harga" written by `_tulisLogTransaksiMember_`; `_revenueSummary_` prefers it. | Kode.gs, tests/revenue.test.js | — | S | Changing a price leaves last month's revenue unchanged (test). |
| [ ] | T-114 | "Paket & Harga" section: category chips, show-inactive toggle, list rows with usage chip and active toggle, ⋯ menu. | Index.html, App.html, Theme.html | T-112, T-102 | M | On a phone: chips scroll sideways inside their row only, rows show price/sessions/usage in two lines, ⋯ opens an action sheet. |
| [ ] | T-115 | Package editor (sheet on phone, pane on desktop): Rupiah input, fleksibel sessions, benefit chips, duplicate, delete-with-reason. Refresh `window.priceListData` after save. | Index.html, App.html | T-114 | M | New package shows up on landing and portal without a reload; on a phone the editor is a full-height sheet with a sticky Simpan and a numeric keypad for price and sessions. |
| [ ] | T-116 | Reorder: drag on desktop, "Urutkan" mode with 44 px ↑/↓ buttons on phone, saved via `reorderPackages`. | App.html | T-114 | S | Order is the same on landing, portal and panel; reorder works one-handed on a phone. |
| [ ] | T-116a | Extend the phone pass (T-108a) to Paket & Harga: list, action sheet, editor sheet, reorder mode. | tools/browser-check.js | T-108a, T-115 | S | Passes at 360 and 390 px. |
| [ ] | T-117 | Docs and backup note (copy the spreadsheet before the first deploy of phase B). | docs, apps-script/README.md | T-110…T-116 | S | — |

## Phase C1 — Client reminder foundation (priority 3, no messages to clients yet)

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | T-120 | Per-client logging: results `ok / gagal / skip-optout / skip-nomor / lewat`; load ReminderLog keys once per run into a Set; job `*` row only when every eligible client is resolved. | Reminder.gs, tests/reminder.test.js (new) | — | M | A run cut halfway resumes without duplicates (test). |
| [ ] | T-121 | Channel adapter `_sendToClient_` with `manual` only; handlers refactored to "build recipients → send each → summary". Manual output equals today's digest. | Reminder.gs, tests | T-120 | L | Manual mode: zero client fetches, one owner digest per job (test). |
| [ ] | T-122 | New type `sesi-besok` (daily 19:00): clients with a session tomorrow; `{tidur}` from `RMD_TPL_SLEEP`. In manual mode, owner gets the digest with wa.me buttons. | Reminder.gs, Kode.gs, tests | T-121 | M | Tomorrow's sessions produce one entry per client. |
| [ ] | T-123 | Client preferences: MemberData column P "Pengingat Nonaktif"; merge with column O for meals; `getMyReminderPrefs` / `setMyReminderPrefs` (member), `setMemberReminderPrefs` (admin). | Kode.gs, Reminder.gs, tests, tests/security.test.js | — | M | Opted-out client is logged `skip-optout` and never messaged (test). |
| [ ] | T-124 | Portal card "Pengingat WhatsApp" (toggles for eligible types) and the same toggles on client detail in the panel. | Index.html, App.html | T-123 | M | Client can turn PR reminders off from the portal on a phone: one-line card under "Makan hari ini", bottom sheet with toggles, instant save with toast. |
| [ ] | T-125 | Quiet hours, tolerance, pacing, daily cap and time budget (stop new sends after ~4.5 min). Settings keys and validation. | Reminder.gs, Kode.gs, tests | T-120 | M | Cap and quiet-hours tests pass. |
| [ ] | T-126 | Owner summary message (sent / gagal / tanpa nomor / menunggu) with buttons only for unreachable clients. | Reminder.gs, tests | T-121 | S | One Telegram message per job run. |
| [ ] | T-127 | Templates `RMD_TPL_<JENIS>` with placeholder validation and preview in the Pengingat Klien section; defaults equal today's texts. | Reminder.gs, App.html, tests | T-106, T-121 | M | Unknown placeholder is rejected; preview is a WhatsApp-style bubble at phone width and matches what gets sent. |

## Phase C2 — Real WhatsApp channel (needs decision D-1 in PRD)

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | T-130 | **Decide D-1, D-2, D-3** with the owner; set up the sender number and account. | — | — | — | Written into PRD §6. |
| [ ] | T-131 | `wa-gateway` provider in `_gatewaySend_`: request format for the chosen service, retry on 429/5xx, no retry on 4xx, token from `WA_GATEWAY_TOKEN`. | Reminder.gs, tests | T-121, T-130 | M | Mocked fetch tests for success, 429, 400. |
| [ ] | T-132 | Channel settings UI: channel select, masked token, "Kirim tes ke nomor saya" (`sendReminderTest(token, jenis, phone)`), channel-ready status. | Index.html, App.html, Reminder.gs | T-131, T-106 | M | Test reaches the owner's number only. |
| [ ] | T-133 | First-message opt-out line; `CONFIG_KEYS` accepts the WhatsApp tokens. | Reminder.gs, Kode.gs, tests | T-131 | S | First message to a client carries the line; later ones don't (test). |
| [ ] | T-134 | Rollout: one week `sesi-besok` only, then the other types. Remove the per-session wa.me links from the owner's schedule email when the channel isn't manual. | Kode.gs | T-131…T-133 | S | Owner confirms clients receive messages. |
| [ ] | T-135 | (Only if D-1 = Cloud API) `wa-cloud` provider with template mapping `WA_CLOUD_TPL_<JENIS>`. | Reminder.gs, tests | T-130 | M | Mocked fetch test with template parameters. |

## Later

| | ID | Task | PRD |
| --- | --- | --- | --- |
| [ ] | T-140 | Closed days in business hours ("Tutup"), respected by landing, portal and booking. | S-9 |
| [ ] | T-141 | Meal tips editor for the `MealTips` sheet (add, edit, approve, delete). | S-10 |
| [ ] | T-142 | Landing-card live preview in the package editor. | P-9 |
| [ ] | T-143 | `sisa-sesi` reminder (1–2 sessions left). | R-11 |
