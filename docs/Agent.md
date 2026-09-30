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

1. Open [Task.md](Task.md) and take the lowest-numbered unchecked task in the current phase whose dependencies are done. Mark it `[~]`.
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
- Phase D is **planned, not built** (PRD §10, Design §10, Task.md T-150…T-185): client progress tracker (weight, waist, private photos), weekly streak and badges, one-tap renewal, and three new WhatsApp message types (monthly recap, milestone congrats, measure reminder). Build order D1 → D4. Decisions D-8…D-10 are assumed until the owner confirms.
- Tasks/PR for clients with recurring tasks and templates are live; the client portal shows them and a "Makan hari ini" card.
- `runReminderTick` is a public trigger handler, gated by `RMD_ENABLED`, a lock and a throttle.
- Sessions: admin 30 days, member 90 days (defaults). Revenue estimate = 65 % of package price.
- Tests: 109 passing (`node --test`), plus the browser check with a phone pass for Pengaturan.
