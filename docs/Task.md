# Tasks — PT Scheduler upgrade

Work items for [PRD.md](PRD.md), built as described in [Design.md](Design.md). Rules for whoever picks a task are in [Agent.md](Agent.md).

- Phase E (coach hub, profile, client care) has its own list: [coach/TODO.md](coach/TODO.md), IDs T-200+.
- IDs start at **T-100**, because code comments already use T-40 … T-78 from the earlier reminder work.
- Size: **S** ≈ under 2 h, **M** ≈ half a day, **L** ≈ a day or more.
- Status: `[ ]` todo · `[~]` in progress · `[x]` done. Update the box in the same commit that finishes the task.
- One task = one commit (or a few), with tests passing. A phase = one pull request.
- **Every UI task is only done when it also works on a phone** (Design.md §8, PRD M-1…M-9): 360–430 px, both themes, 44 px targets, the right keyboard, and back gesture handled. "Done when" below states the phone check where it matters.

## Phase A — Settings UI (priority 1)

Built on branch `claude/wonderful-wozniak-it2gzt`. The list has 6 sections; "Paket & Harga" is added in phase B (T-114).

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-100 | Add the `settings` admin view: route in `VIEWS`, `renderSettings()`, one browser history entry per level (state only, no URL hash) so the phone back gesture steps back, sidebar and top-bar gear navigate to it. Client portal keeps the small sheet (theme and logout only). | App.html, Index.html | — | M | Gear opens the view on phone and desktop; refresh keeps the section; phone back from a section returns to the list; portal unchanged. |
| [x] | T-101 | Layout pieces: `.settings-layout`, `.settings-nav(-item)`, `.save-bar`, `.field.has-error`, `.status-dot`, all from existing tokens, light and dark, reduced-motion safe. | Theme.html | T-100 | S | Browser check at 360, 390 and 1280 px in both themes shows no overflow; save bar sits above the tab bar and safe area. |
| [x] | T-102 | Section framework: `serialize(section)`, snapshot on load, dirty detection, save bar (Batal/Simpan), leave-guard via `showConfirmModal`, partial payload of changed keys only. | App.html | T-100 | M | Edit then revert hides the bar; Batal restores; leaving a dirty section (including by phone back gesture) asks; with the phone keyboard open the focused field stays visible. |
| [x] | T-103 | Move existing controls into sections: Tampilan, Notifikasi Admin, Jam Operasional, Keamanan (PIN form and numbers), Akun. Delete the old admin block from `#sheet-settings`. | Index.html, App.html | T-102 | M | Every control from the old sheet exists in exactly one section and saves; phone layout per Design §8.2 (days one per row, limits stacked below 400 px, numeric keyboards). |
| [x] | T-104 | Client-side validation mirroring server bounds, and "Bawaan" reset links that clear a field to its default. | App.html | T-103 | S | Out-of-range values can't be submitted; cleared fields delete the property (test). |
| [x] | T-105 | Mask secrets: `getAppSettings` returns `••••<last4>` for the Telegram token; an empty token field on save means keep; `sendTelegramTest` falls back to the stored token when the field is empty. | Kode.gs, App.html, tests/settings.test.js | — | S | The token never reaches the browser in full; saving other fields keeps it (test). |
| [x] | T-106 | Pengingat Klien section, first cut: master switch, one card per existing type **including makan-pagi / makan-sore**, hour and test button, sleep line. | Index.html, App.html | T-102 | M | No `RMD_*` setting needs the editor or Script Properties. |
| [x] | T-107 | `getReminderStatus(token)` and `installReminderTrigger(token)` (admin), with a status row and a Pasang button. Trigger runs hourly. | Reminder.gs, App.html, tests/security.test.js | T-106 | S | Owner installs the trigger from the phone; status shows the last tick. |
| [x] | T-108 | `getReminderLog(token, opts)` (admin), with a history list in the section showing names, not phone numbers, and a "Hanya gagal" filter. | Reminder.gs, App.html, tests | T-106 | S | Last 50 rows visible; test proves no phone numbers in the response. |
| [x] | T-108a | Phone pass in `tools/browser-check.js`: 390 × 844 touch viewport, both themes, checks overflow, 44 px targets, save bar overlap and back navigation for every Settings section. | tools/browser-check.js | T-103 | S | Script fails on any of those problems and passes on the finished phase A. |
| [ ] | T-109 | Docs: update `apps-script/README.md` (Pengaturan section), root README, CLAUDE.md state. Tick the boxes above. | docs | T-100…T-108 | S | Docs match the shipped UI. |

## Phase B — Pricelist CRUD (priority 2)

Built on branch `claude/wonderful-wozniak-it2gzt`. Deviations from the first plan: drag-and-drop reordering was dropped (↑/↓ everywhere); the editor is a sheet on desktop too; other sheets do not yet close on the phone's back gesture.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-110 | Header-based schema: `_priceListSchema_`, `_ensurePriceListSchema_` (insert Jumlah Sesi if missing, append Urutan). Switch `getPriceList` and `_allPackagePrices_` to header mapping and sort by Urutan. | Kode.gs, tests/pricelist.test.js (new) | — | M | Legacy 8-column and current 9-column sheets both read correctly; migration is idempotent. |
| [x] | T-111 | `PACKAGE_CATEGORIES` constant and validation `_validatePackage_` (name, category, integer price, sessions or fleksibel, durasi, deskripsi, benefits without commas). | Kode.gs, tests | T-110 | S | Every bad input gets an Indonesian error (tests). |
| [x] | T-112 | Admin API: `getPriceListAdmin` (with usage counts), `savePackage`, `setPackageActive`, `deletePackage` (blocked when used), `reorderPackages`. Server-generated IDs `PKG-yyyyMMdd-xxxx`. Script lock on writes. | Kode.gs, tests, tests/security.test.js | T-111 | M | CRUD tests pass; the security test lists the five functions as ADMIN. |
| [x] | T-113 | Price snapshot: MembersLog column K "Harga" written by `_tulisLogTransaksiMember_`; `_revenueSummary_` prefers it. | Kode.gs, tests/revenue.test.js | — | S | Changing a price leaves last month's revenue unchanged (test). |
| [x] | T-114 | "Paket & Harga" section: category chips, show-inactive toggle, list rows with usage chip and active toggle, ⋯ menu. | Index.html, App.html, Theme.html | T-112, T-102 | M | On a phone: chips scroll sideways inside their row only, rows show price/sessions/usage in two lines, ⋯ opens an action sheet. |
| [x] | T-115 | Package editor (sheet on phone, pane on desktop): Rupiah input, fleksibel sessions, benefit chips, duplicate, delete-with-reason. Refresh `window.priceListData` after save. | Index.html, App.html | T-114 | M | New package shows up on landing and portal without a reload; on a phone the editor is a full-height sheet with a sticky Simpan and a numeric keypad for price and sessions. |
| [x] | T-116 | Reorder: drag on desktop, "Urutkan" mode with 44 px ↑/↓ buttons on phone, saved via `reorderPackages`. | App.html | T-114 | S | Order is the same on landing, portal and panel; reorder works one-handed on a phone. |
| [x] | T-116a | Extend the phone pass (T-108a) to Paket & Harga: list, action sheet, editor sheet, reorder mode. | tools/browser-check.js | T-108a, T-115 | S | Passes at 360 and 390 px. |
| [ ] | T-117 | Docs and backup note (copy the spreadsheet before the first deploy of phase B). | docs, apps-script/README.md | T-110…T-116 | S | — |

## Phase C — Client-ready reminders over Telegram (priority 3)

Built on branch `claude/wonderful-wozniak-it2gzt`. Note: the default client texts already addressed the client, so T-120 mostly moved them into templates.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-120 | Rewrite every client text (`_bookingWaText_`, `_prWaText_`, `_makanWaText_`) to address the client: greeting with name, key fact first, ≤ 500 chars. | Reminder.gs, tests/reminder.test.js (new) | — | S | Tests check each text starts with the client's name and contains the key fact. |
| [x] | T-121 | Owner-facing Telegram layout: short header with type, date and count; button label `Nama · fakta` ≤ 30 chars; "📵 Tanpa nomor: …" line; zero recipients = no message. | Reminder.gs, tests | T-120 | S | Test with 20 clients: 3 messages, correct labels, wa.me URLs with client number and text. |
| [x] | T-122 | New type `sesi-besok` (daily 19:00): one button per client with a session tomorrow; `{tidur}` from `RMD_TPL_SLEEP`. Remove the "Kirim WA Konfirmasi" links and the sleep line from `sendDailyReminderEmail`. | Reminder.gs, Kode.gs, tests | T-121 | M | Tomorrow's sessions produce one button per client; owner email has no WhatsApp links. |
| [x] | T-123 | Per-client opt-out: MemberData column P, merged with column O for meals; `setMemberReminderPrefs` (admin); toggles on client detail in the panel. | Kode.gs, Reminder.gs, App.html, Index.html, tests, tests/security.test.js | — | M | Opted-out client gets no button (test); toggles are 44 px rows on a phone. |
| [x] | T-124 | Templates `RMD_TPL_<JENIS>` with placeholder validation; template editor and WhatsApp-style preview in the Pengingat Klien section. | Reminder.gs, App.html, Index.html, tests | T-106, T-120 | M | Unknown placeholder rejected; preview at phone width matches the button's text. |
| [x] | T-125 | "Kirim tes" for every type including `sesi-besok` and the meal types. | Reminder.gs, App.html | T-122 | S | Each card's test button delivers a 🧪 TES message. |
| [ ] | T-126 | Docs for phase C and `apps-script/README.md` (how to use the buttons). | docs | T-120…T-125 | S | — |

## Phase D — Client progress & motivation (see PRD §10, Design §10)

All decisions are made (PRD §10.4): no WhatsApp nudge when sessions run low, photos in a private Drive folder, build order D1 → D4.

### D1 — Progress tracker

Built. Deviations from the first plan: the photo list shows rows with a **Lihat** button (a photo is fetched only when opened, so 60 photos never load at once); the panel lets the coach **view** photos but not upload them.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-150 | `Progress` sheet, `saveMyMeasurement` / `deleteMyMeasurement` / `getMyProgress` (entries only), limits and one-row-per-day upsert. | Kode.gs, tests/progress.test.js (new), tests/security.test.js | — | M | Tests cover limits, upsert, and that a client can't touch another client's rows. |
| [x] | T-151 | Admin side: `getMemberProgress`, `saveMemberMeasurement`, `deleteMemberMeasurement` (marked `coach`). | Kode.gs, tests | T-150 | S | Coach and client entries show together with who entered them. |
| [x] | T-152 | Private photo folder, `uploadMyProgressPhoto`, `getMyProgressPhoto`, `deleteMyProgressPhoto`, `getMemberProgressPhoto`; limits 5 MB / 60 photos. | Kode.gs, tests | T-150 | M | Test proves no link sharing and no cross-client access. |
| [x] | T-153 | Portal "Progres" card: SVG line chart, change since first entry, "Catat hari ini" sheet, photo sheet with in-browser resize. | Index.html, App.html, Theme.html | T-150, T-152 | L | Works at 360 px in both themes; decimal keypad; no sideways scroll. |
| [x] | T-154 | Panel client page "Progres" section with the same chart, entry list, + Catat, photo grid. | Index.html, App.html | T-151, T-153 | M | Owner can add and fix entries on a phone. |

### D2 — Streaks & milestones

Built. The old four "lencana" tiles (4/8/12/24 sessions) in the portal insights card were removed, so clients see one badge set only. The celebration is marked as seen on the server the moment it is shown.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-160 | Pure `_completedWeeks_`, `_streak_`, `_badges_`; add streak/badges/newBadges to `getMyProgress` and `getMemberProgress`. | Kode.gs, tests | T-150 | M | Tests: holiday gap, current-week rule, best streak keeps badges. |
| [x] | T-161 | MemberData column Q, `markBadgesSeen`. | Kode.gs, tests, tests/security.test.js | T-160 | S | Seen badges aren't celebrated again. |
| [x] | T-162 | Portal streak line, badge row, celebration card (CSS confetti, reduced motion) with Bagikan. | App.html, Index.html, Theme.html | T-160, T-161 | M | Celebration shows once; reduced motion shows no animation. |
| [x] | T-163 | Streak and badges on the panel client page. | App.html | T-160 | S | — |

### D3 — Easy renewal

Built. Deviation: no new `OWNER_WA` setting. The WhatsApp goes to the client's preferred coach, or to the app's existing contact number (`coachContactNumber()`), exactly like the existing "Chat coach" button. The renewal notice now shows at 2 sessions left or fewer (was 1) and replaces the old chat-only button.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-170 | `RenewalRequests` sheet, `requestRenewal` (throttle, one open request, Telegram notice), `OWNER_WA` setting. | Kode.gs, App.html, tests, tests/security.test.js | — | M | Tests: second request cancels the first; notice sent. |
| [x] | T-171 | `getRenewalRequests`, `decideRenewal` (approve once, reuses the Perpanjang path with price snapshot, reject). | Kode.gs, tests | T-170 | M | Approving twice is refused; quota and log match today's Perpanjang. |
| [x] | T-172 | Portal "Sisa N sesi · Perpanjang" card and package sheet; opens WhatsApp to the owner; status "Menunggu konfirmasi". | App.html, Index.html | T-170 | M | Flow works on a phone end to end. |
| [x] | T-173 | Panel "Minta perpanjang (N)" card with Setujui / Tolak. | App.html | T-171 | S | One tap approves; client sees "Aktif". |

### D4 — WhatsApp messages

Built. Notes: "every other Monday" counts weeks from Monday 5 Jan 2026 (so it keeps alternating across New Year); the recap header names the month it summarises; milestone messages name only the highest new badge per kind, and clients who stopped training (no session in 14 days) are marked silently instead of being congratulated late.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-180 | `_dueJobs_` gains `dayOfMonth` and `evenWeek`; three new `REMINDER_JOBS` (off by default) with templates and placeholders. | Reminder.gs, tests | T-150, T-160 | M | Tests for the new schedule rules; Settings shows the three cards. |
| [x] | T-181 | `rekap-bulanan` handler (last month's sessions, weight/waist change, streak, portal link). | Reminder.gs, tests | T-180 | M | Skips clients with nothing last month. |
| [x] | T-182 | `selamat-milestone` handler; MemberData column R written only after a successful send. | Reminder.gs, tests | T-180, T-160 | M | A badge is congratulated exactly once. |
| [x] | T-183 | `waktunya-ukur` handler (last measurement ≥ 14 days or none). | Reminder.gs, tests | T-180 | S | — |
| [x] | T-184 | Per-client switches for the three types on the client page; test buttons. | App.html, Reminder.gs | T-181…T-183 | S | — |
| [x] | T-185 | Browser check: portal cards, celebration, renewal and panel Progres at phone and desktop; docs (README, Agent §7). | tools/browser-check.js, docs | all above | M | All browser checks pass. |

## Phase F — Classes in the price list

Owner request: classes in the price list; clients can join a class, or make a private group (join code). Sheets stay as they are: only columns are appended. Decisions: a class is a PriceList package with a fixed schedule; a class has its own session count (`Jumlah Sesi`); a private group is made by sharing a code; a friend joins only after taking the same class package (the normal Beli / Perpanjang flow), then enters the code. Deviation from the first plan: group members live in `ClassGroups` column G (no new MemberData column).

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-250 | PriceList columns `Tipe`, `Kapasitas`, `Jadwal Kelas`, `Kelas Privat` (appended, idempotent); public `getPriceList` returns them plus seats taken; full class refused in `_addMemberInternal_`. | Kode.gs, tests | — | M | Old rows stay plain packages; migration runs once. |
| [x] | T-251 | Package editor: "Ini kelas" switch with capacity, schedule, private-group switch. | Index.html, App.html | T-250 | S | Saves and reloads on a phone. |
| [x] | T-252 | `ClassGroups` sheet, `createClassGroup`, `joinClassGroup`, `leaveClassGroup`, `getMyClassGroup`, admin `getClassGroups`; first names only. | Kode.gs, tests/security.test.js | T-250 | M | Full group, wrong package and bad code refused. |
| [x] | T-253 | Schedules column M `Kelas ID`; same class (or group) at the same start shares one coach seat up to capacity; class members book single sessions only. | Kode.gs, tests | T-250 | M | Booking flow for regular packages unchanged. |
| [x] | T-254 | Portal: class badge and seats on cards, "Ikut kelas", Kelas card with group create / join / share / leave. | App.html, Index.html | T-252 | M | Works at 390 px. |

## Later

| | ID | Task | PRD |
| --- | --- | --- | --- |
| [ ] | T-140 | Closed days in business hours ("Tutup"), respected by landing, portal and booking. (Coach days off in Phase E cover the coach's own closed days.) | S-9 |
| [ ] | T-141 | Meal tips editor for the `MealTips` sheet (add, edit, approve, delete). | S-10 |
| [ ] | T-142 | Landing-card live preview in the package editor. | P-9 |
| [ ] | T-143 | `sisa-sesi` reminder (1–2 sessions left). | R-11 |
| [ ] | T-144 | Portal card where clients switch reminder types off themselves (`getMyReminderPrefs` / `setMyReminderPrefs`). | R-10, M-7 |
