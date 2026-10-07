# Agent guide — XNK

Instructions for any AI agent (Claude Code or another) or developer changing this repo. Read this first, then [PRD.md](PRD.md) for *what*, [Design.md](Design.md) for *how*, and [Task.md](Task.md) for *what's next*.

## 1. What this repo is

- **xnk.my.id**: a GitHub Pages site (root `index.html`) that shows the Apps Script web app full-screen. Pushing to `main` publishes it.
- **PT Scheduler**: the Google Apps Script app in `apps-script/pt-scheduler/`. One deployment (`AKfycbyVOm1…BgJ`) serves three sites:

| Site | Page | Who |
| --- | --- | --- |
| xnk.my.id | `/exec` → Index (panel) | Owner / admin, PIN login |
| xnkbooking.my.id (repo BookingPT) | `/exec?view=Landing` | Visitors |
| book.xnkbooking.my.id (repo BookingPT-Client) | `/exec?view=public` (portal) | Clients, WhatsApp-number login |

`apps-script/pt-scheduler/src/`:

| File | Role |
| --- | --- |
| `Kode.gs` | Server: data, login, security, settings, tasks/PR, revenue, notifications |
| `Keuangan.gs` | Finance (Phase H): bills, payments, expenses, categories, coach share, summary, CSV, proofs |
| `Reminder.gs` | Reminder engine: `runReminderTick`, jobs, ReminderLog, meal tips |
| `Update No WA.gs` | Old one-off maintenance helper |
| `Index.html` | Markup for panel and portal (views, sheets, forms) |
| `App.html` | Panel and portal logic (`adminCall`, `memberCall`, `publicCall`, `h()` = escape HTML, `icon()`, `setHTML`) |
| `Theme.html` | Design tokens and components (monochrome, light/dark) |
| `Landing.html`, `LandingStyle.html`, `LandingScript.html` | Marketing page |
| `Scripts.html` | Helpers shared by Index and Landing |

Data lives in Google Sheets (MemberData, MembersLog, PriceList, schedules, Tasks, TaskTemplates, ReminderLog, MealTips). Settings and secrets live in Script Properties.

## 2. Rules you must not break

1. **Edit Apps Script code only in `apps-script/pt-scheduler/src/`.** A merge to `main` runs `.github/workflows/pt-scheduler.yml`, which does `clasp push` and redeploys the same deployment. That overwrites the online editor completely.
2. **No secrets in code.** Tokens, PINs and passwords go in Script Properties only. The repo is public.
3. **Every `.gs` function without a trailing `_` is callable from any browser.** So each new public function must start with exactly one of:
   - admin: `function x(token, …) { requireAdmin_(token); …`
   - client: `function x(memberToken, …) { … requireMember_(memberToken) …` (first statement)
   - editor-only maintenance: `requireOwner_();`
   - otherwise, name it with a trailing `_`.

   Then add the name to the matching list in `tests/security.test.js`. The test fails on any unclassified function.
4. **Sheets: append columns, never reorder or delete.** Existing rows and IDs stay valid. New code maps columns by header name where it can. Migrations must be idempotent and run under `LockService.getScriptLock()`.
5. **Default = today's behavior.** A new feature is off (or `manual`) until the owner turns it on in Settings.
6. **Don't reintroduce `Test.gs` or in-editor `test*` functions.** They were removed on purpose; tests live in `tests/` (Node).
7. **Don't send client phone numbers to the browser** except in admin responses that already carry them.
7b. **Progress photos are private.** Never give them link sharing (unlike coach photos). Serve them only as data URLs through a function that checks the member or admin token, and a member function must read the member ID from the token, never from its arguments.
8. **Don't commit to `main` directly.** Work on a branch and open a pull request, which runs the checks.

## 3. How to work a task

1. Open [Task.md](Task.md) and take the lowest-numbered unchecked task in the current phase whose dependencies are done. Mark it `[~]`. **Phase E (coach) tasks are in [coach/TODO.md](coach/TODO.md); read [coach/Agent.md](coach/Agent.md) before starting one. Phase H (Keuangan) tasks are in [finance/TODO.md](finance/TODO.md).**
2. Read the matching section in [Design.md](Design.md). If the design is wrong or unclear, fix the design text in the same change and say so; don't silently build something else.
3. Implement it, following §4. For UI, build the phone layout first, then widen to desktop.
4. Add or update tests in `apps-script/pt-scheduler/tests/`.
5. Run the checks (§5) until they're clean.
6. Update docs that the change makes stale: `apps-script/README.md` (Indonesian, for the owner), root `README.md` (English), and §7 of this file.
7. Tick the task `[x]` in Task.md in the same commit.
8. Commit message: an imperative summary line, then what changed and why.

## 4. Code conventions

**Server (`.gs`)**
- Match the file you are in: `Kode.gs` uses `const`/`let` and function declarations; `Reminder.gs` uses `var` (ES5 style).
- User-facing errors are Indonesian sentences ending with a period: `throw new Error('Harga harus bilangan bulat.');`.
- Read settings with `_numProp_(key, fallback)` or `PropertiesService.getScriptProperties()`. When saving, an empty value deletes the property, so the code default applies again.
- Validate everything first, then write (see `updateAppSettings` + `_rmdValidate_` / `_rmdWrite_`).
- Use `getOrCreateSheet_(name, headers)` for sheets and `LockService.getScriptLock()` around writes that read-then-write.
- Time zone for reminders is `Asia/Jakarta` (`REMINDER_TZ`, `_wibParts_`).
- Telegram to the owner goes through `kirimNotifTelegram_` / `kirimTelegramTombol_`. Both skip quietly when Telegram is off.

**Client (`.html`)**
- Call the server only through `adminCall(name, …)` (adds the admin token), `memberCall` or `publicCall`.
- Escape every dynamic string with `h()` before putting it in HTML.
- Use tokens and components from `Theme.html` (`.card-flat`, `.field`, `.toggle`, `.btn*`, `.group-label`, …). Don't use hard-coded colors; everything must work in light and dark.
- UI text is Indonesian, short and friendly ("Simpan", "Batal", "Bawaan 17:00").
- **Phone first.** The owner and clients mostly use phones. Every UI change must work at 360–430 px as well as desktop, split at the app's 768 px breakpoint (`.only-mobile` / `.only-desktop`). Follow Design.md §8: 44 px touch targets, no sideways scroll, inputs at 16 px, the right keyboard (`inputmode="numeric"`, `type="tel"`, `type="email"`), sticky bars above the tab bar and `env(safe-area-inset-bottom)`, the phone back gesture stepping back one level, and bottom sheets for editors.
- Use Lucide icons through `icon('name')`.
- **Backend-first, fast frontend** (owner's rule). Do every check and calculation that can run on the server there (quota, slots, limits, validation). The browser only renders what it gets back. Open each screen with **one** bootstrap call (`getPortalBootstrap` for the portal, `getAdminBootstrap` + `getAdminExtras` for the panel), not many parallel calls, and don't send data the screen doesn't show (the portal never receives other clients' bookings, only free slots). Server-only limits are Script Properties with code defaults, not new UI fields.

## 5. Checks before every push

```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js
# UI changes (needs Playwright); includes the phone pass at 390 × 844:
NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/browser-check.js
```

The test harness (`tests/harness.js`) fakes Apps Script: `env.props` is Script Properties, `env.fetches` records `UrlFetchApp` calls, and `seededEnv()` gives sample data. Mock network calls; never hit Telegram or WhatsApp from tests.

## 6. Syncing with the online editor

If the owner edited code in the Apps Script editor, pull it into the repo **before** merging anything, or the deploy will erase it:

```powershell
cd C:\Users\erlan\XNK\apps-script\pt-scheduler
clasp pull
```

- `clasp pull` saves server files as `.js`. Rename them back to `.gs` (`Kode.js` → `Kode.gs`) before committing, or the repo ends up with both.
- Windows PowerShell 5 doesn't accept `&&`. Run commands one per line.
- clasp version must match the deploy robot: `@google/clasp@2.4.2`.

## 7. Current state (2026-09-30)

- Phase A is built: Pengaturan is its own admin page with 7 sections (Tampilan, Paket & Harga, Pengingat Klien, Notifikasi Admin, Jam Operasional, Keamanan, Akun), per-section saves, dirty tracking, masked Telegram token, reminder trigger install/status/history. The client portal keeps the small settings sheet. 
- Phase B is built: Pengaturan → Paket & Harga manages packages (add/edit/duplicate/reorder/activate/delete-when-unused). PriceList columns are read by header name; the first admin write adds "Jumlah Sesi" and "Urutan". Transactions store the price in `Members` column K; revenue uses it (older rows fall back to the current price).
- Phase C is built: reminders go to the owner's Telegram as one message per type with one `wa.me` button per client; the button carries a message written to the client (editable templates with placeholders, server preview). Types: sesi-besok (new, 19:00), booking-minggu, pr, makan-pagi/sore. Per-client off switches live in MemberData column P. This is the chosen design: **never add a WhatsApp API or gateway** or send to clients automatically.
- Phase D1 (progress tracker) is **built**: `Progress` / `ProgressPhotos` sheets, private Drive folder `XNK Progress`, portal "Progres" card with chart, entry sheet and photo sheets, and a "Progres" section on the panel's client page. D2 (streak, badges, celebration; MemberData column Q "Badge Terlihat") is **built**. D4 (three new reminder types: `rekap-bulanan` 09:00 on the 1st, `selamat-milestone` daily 18:00 with MemberData column R "Badge Diselamati", `waktunya-ukur` every other Monday 08:00; all off by default) is **built**. D3 (renewal requests: `RenewalRequests` sheet, portal renew sheet, dashboard "Minta perpanjang" card with approve/reject) is **built**. Phase D is complete.
- Phase D overall was **built** (PRD §10, Design §10, Task.md T-150…T-185): client progress tracker (weight, waist, private photos), weekly streak and badges, one-tap renewal, and three new WhatsApp message types (monthly recap, milestone congrats, measure reminder). Build order D1 → D4. Decided: no WhatsApp nudge when sessions run low (renewal is a portal button only); photos in a private Drive folder.
- Tasks/PR for clients with recurring tasks and templates are live; the client portal shows them and a "Makan hari ini" card.
- `runReminderTick` is a public trigger handler, gated by `RMD_ENABLED`, a lock and a throttle.
- Sessions: admin 30 days, member 90 days (defaults). Revenue estimate = 65 % of package price.
- Phone UX (2026-10): login shows one loader (the button, no splash); the panel opens from a localStorage copy (`xnk_admin_cache`, admin only, cleared on logout/auth loss) with no separate `checkAdminSession` call; secondary data (transaction log, tasks, renewals, revenue) loads after the first screen; pull-to-refresh (`refreshAll`) on `#main-scroll-area`; Android back stack (`syncBack`) closes sheet → detail → page → dashboard. New sheets/details/views get this for free through `openSheet`/`openDetail`/`navigate`; don't add your own `pushState` except for the settings sub-page.
- Phase E (solo coach hub, coach profile, client care) is **built** (T-200…T-243): see [coach/PRD.md](coach/PRD.md), [coach/Design.md](coach/Design.md), [coach/TODO.md](coach/TODO.md) for the deviations. The app has one coach, the owner (solo mode when exactly one coach is active). `Coaches` is read by header name; unassigned = empty coach ID and name; one slot engine (`_freeSlots_`, `getOpenSlots`) serves landing, portal, booking-minggu and booking checks; client care data (MemberData S–V, `Assessments`, `FitnessTests`, `HealthScreening`) is admin-only and never goes to Telegram, email, the admin cache or public responses. New reminder types (off by default): `tes-ulang`, `ulang-tahun`, `ringkasan-owner`.
- Phase F (landing upgrade): slots on the landing come only from `getOpenSlots` (server `past` flag in WIB, refresh every 2 min); `_nearestFreeSlots_` wraps `_freeSlots_`; Paket reads `getPriceListPublic` (categories with `onLanding`, active packages) and `/exec?view=prices` serves the same JSON for the static price page in BookingPT (T-310). Tests that need a bookable time use `wibSlot()` from `tests/fixtures.js`.
- Phase G (classes, T-250…T-254) is **built**: PriceList columns `Tipe`/`Kapasitas`/`Jadwal Kelas`/`Kelas Privat`; sheet `ClassGroups` (members in column G, first names only to clients); Schedules column M `Kelas ID` (same class or group at the same start shares one coach seat via `_classKey_`). Class members book single sessions only. Default = no class until the owner turns "Ini kelas" on.
- Phase H (Keuangan: bills, payments, expenses, categories, coach share, reports, CSV, private proofs, optional portal card) is **built** (T-400…T-431, docs/finance): [finance/PRD.md](finance/PRD.md), [finance/Design.md](finance/Design.md), [finance/TODO.md](finance/TODO.md). Off by default (`FIN_ENABLED`); server code is in `Keuangan.gs`; finance data stays out of public responses, the admin cache and Telegram (except first name, package and remaining amount in the `tagihan` reminder). New admin functions are listed in `tests/security.test.js`; `getMyBills` is the only member one and returns `[]` unless `FIN_PORTAL_VISIBLE`.
- New-client guide (portal, T-500): self-registered clients get a dark-screen, one-button-at-a-time guide per page (beranda, booking, jadwal, paket, coach). MemberData column W "Panduan" (`baru|<pages>` → `selesai`), written only by `registerNewClient` for a new number; member function `markGuideSeen`; profile field `guide`. **On by default** (owner's choice, a deliberate exception to rule 5); `CLIENT_GUIDE_ENABLED=false` (Pengaturan → Tampilan) turns it off. Steps live in `GUIDE_STEPS` in App.html (`sel`/`selDesktop`, `text`/`textDesktop`, `{klik}` becomes "ketuk" on phones); a step whose target isn't on screen is skipped. The dark layer is an SVG path with a hole (`#guide-scrim`), not a box-shadow; on phones the card docks above the tab bar (or under the topbar) and the target is scrolled clear of it, on desktop it floats beside the target with an arrow.
- Audit fixes (2026-10): client booking checks the session quota (`_memberQuotaLeft_`: total − used − upcoming; empty total = unlimited; the admin gets a warning instead) and a booking horizon (`BOOKING_MAX_DAYS_AHEAD`, default 60); `registerNewClient` is throttled (1 per number per minute, `REGISTER_MAX_PER_10MIN` default 5 overall); `completeSession` is idempotent, takes the member from the schedule row and runs under `_locked_`, as do `deleteSchedule`, `updateMemberProfile` and `addSchedule`; the finance CSV neutralises `= + - @` cells. The portal opens with one `getPortalBootstrap` call (own sessions + free slots up to the horizon, no other clients' bookings; `getPublicSchedules` is kept but unused by the portal); the panel uses `getAdminBootstrap` + `getAdminExtras`.
- Booking flow (2026-10): slots are loaded when the landing page or the portal's Jadwal tab is opened and reused for 2 minutes in the browser (no polling); the server caches `getOpenSlots` in `CacheService` under a key with the cache version, the WIB date and hour, `from`, `days` and the coach (`coachId`, multi-coach only) (TTL `SLOTS_CACHE_SECONDS`, default 120, clamp 10–300; `opts.fresh` is ignored). Readers read the version (`_slotsVersion_`) before the Schedules sheet; every writer that changes availability calls `_bustSlots_()` (flush, then bump) **after** its write — keep that order in new writers. Client bookings are one call: `clientBookSchedule` / `clientRescheduleSchedule` / `clientBookRecurring` accept `opts.soft`; with it, a slot problem returns `{status:'conflict', code, alternatives (max 3, from the pure `_slotAlternatives_`), openSlots}` instead of throwing (quota, horizon, auth and lock-busy still throw); without it they behave as before. Success and conflict answers carry fresh `openSlots` (and `openSlotsByCoach` with two or more coaches; alternatives then come from the picked coach's hours, and a reschedule keeps its coach), so the portal needs no follow-up call. The same member + same start/end returns the existing row (`duplicate:true`), so retries never double-book. Clients may type any time; `_snapSlot_` stores it from the whole hour. Deferred: the landing→portal pick is not re-checked by `getPortalBootstrap` (the soft conflict covers it); several coaches over one span still use the per-hour seat count.
- Slot overlap (2026-10 audit): a booked session blocks every hour its real span touches (`_freeSlots_`, `_ownOverlap_`, `_slotAlternatives_` and the portal grid use start-floored-to-the-hour **through the real end**), so an owner-made 09:30–10:30 also closes 10:00. Client sessions are always whole-hour, so nothing changes for them. `addRecurringSchedule` now runs under the script lock like every other schedule writer.
- Multi-coach booking (2+ active coaches): clients must choose a coach before the hour. `getOpenSlots({coachId})` and `getPortalBootstrap.openSlotsByCoach` give per-coach free hours (`_freeSlots_` `onlyCoach`; a booking with no coach takes a free coach's seat). `clientBookSchedule`, `requestRenewal` (RenewalRequests column "Coach ID") and `registerNewClient` require `coachId` via `_requireClientCoach_` (solo mode is unchanged); approving a renewal sets the member's coach. Landing and portal show coach chips first. A coach's leave shows as full on the landing (`leave: true`).
- Phase I (coach–client loop, [loop/](loop/PRD.md), T-600+): I1 is **built**: `Progress` has eight body measures (`PROGRESS_MEASURES`, columns H–M appended by `_ensureProgressColumns_`; client and coach both write them; `saveAssessment` stores them as coach entries, `Assessments` keeps body fat and hip); a 1-minute countdown / plank stopwatch lives in the fitness-test sheet (browser only); fitness history feeds trend charts (`getMyAssessment.tests[].history`); `getTestResultMessage` builds the WhatsApp result text from the `hasil-tes` template (manual messages `hasil-tes`, `pasca-sesi`, `evaluasi-paket` are in `RMD_TPL_DEFAULT` but are not scheduled jobs). I2 is **built**: sheet `SessionNotes` (one row per session, upsert, empty = delete), admin `saveSessionNote` / `getSessionNote` (the member comes from the schedule row), `getSessionBriefing.lastNote` and `getCoachHub().today[].fokus` show the previous session's focus, the portal gets only `dilatih` / `fokus` per own completed session (`_sharedNotesFor_`; RPE and private notes are admin-only and never in Telegram), and `saveSessionNote` returns the `pasca-sesi` WhatsApp text (manual `wa.me`). I3 is **built**: sheets `SessionRatings` (one row per own completed session, upsert, 3 s throttle) and `PackageEvaluations` (five aspects like the old Google form, `Dibuat Pada` decides whether a finished package was already evaluated: eligible = remaining 0, total > 0, and no evaluation newer than the last completed session); member functions `rateSession`, `getMyPackageEval`, `submitMyPackageEval` (the member comes from the token; another client's session answers "Sesi tidak ditemukan"); `getPortalBootstrap` carries `feedbackEnabled`, `pendingRating` (finished within 7 days, not yet rated) and `packageEval.eligible`; `completeSession` returns `packageDone`, `evalText`, `evalWaLink`; admin sees comments in `getClientCare.feedback` and `getCoachHub().feedback`; Telegram gets first name + number only (rating ≤ 3, evaluation received, package finished), never a comment. `FEEDBACK_ENABLED` (Pengaturan → Tampilan) is **on by default** (a deliberate exception to rule 5, like the client guide). I4 is planned in [loop/TODO.md](loop/TODO.md).
- Tests: 307 passing (`node --test`), plus the browser check with a phone pass for Pengaturan and the guide.
