# Design — PT Scheduler upgrade

How the requirements in [PRD.md](PRD.md) get built. Tasks are in [Task.md](Task.md); coding rules are in [Agent.md](Agent.md).

## 0. System recap

```
xnk.my.id ─┐                                   ┌─ Google Sheets (MemberData, MembersLog, PriceList,
xnkbooking ─┼─ iframe ─► Apps Script web app ──┤   Schedules, Tasks, ReminderLog, MealTips, …)
book.xnk… ─┘   (one deployment, runs as owner)  ├─ Script Properties (settings + secrets)
                                                ├─ Time triggers (daily email, weekly report, runReminderTick)
                                                └─ UrlFetchApp → Telegram (today), WhatsApp channel (new)
```

- `Kode.gs` is the server; `Reminder.gs` holds the reminder engine.
- `Index.html` holds the markup for the panel and portal, `App.html` their logic, and `Theme.html` the tokens and components.
- Any `.gs` function without a trailing `_` can be called from any browser, so every new public function needs a guard (see §5).
- Settings live in Script Properties. `updateAppSettings` already accepts **partial** payloads (only keys present are touched), and phase A builds on that.

## 1. Settings view (priority 1)

### 1.1 Navigation

Settings moves out of the bottom sheet `#sheet-settings` into a real admin view `settings`:

- Add `'settings'` to `VIEWS` in `App.html`, rendered by `renderSettings()`.
- The sidebar "Pengaturan" button and the top-bar gear call `window.navigate('settings')` instead of `openSettings()`.
- Client portal keeps the small sheet, with theme and logout only. `#sheet-settings` stays for clients and loses its admin block.
- The URL hash carries the open section (`#settings/paket`) so a refresh or the back button returns to it.

### 1.2 Layout

Breakpoint: the app switches at **768 px** (`.only-mobile` / `.only-desktop` in Theme.html); use the same one. Desktop (≥ 768 px): section list on the left, open section on the right, max width 640 px.

```
┌ Sidebar ┐┌ Pengaturan ─────────────────────────────────────────────┐
│Dashboard││ ┌───────────────────┐ ┌──────────────────────────────────┐│
│Jadwal   ││ │ Tampilan          │ │ Pengingat Klien                  ││
│Klien    ││ │ Paket & Harga     │ │ ┌──────────────────────────────┐ ││
│Coach    ││ │▸Pengingat Klien   │ │ │ Kanal  [Manual ▾]  status ●  │ ││
│         ││ │ Notifikasi Admin  │ │ └──────────────────────────────┘ ││
│Pengatur.││ │ Jam Operasional   │ │ ┌ Sesi besok ─────────── [on] ┐ ││
│         ││ │ Keamanan          │ │ │ Jam 19  · template · Kirim tes│ ││
│         ││ │ Akun              │ │ └──────────────────────────────┘ ││
│         ││ └───────────────────┘ │ …                                ││
│         ││                       │ ▓ Perubahan belum disimpan [Batal][Simpan] ▓
└─────────┘└─────────────────────────────────────────────────────────┘
```

Phone (< 768 px): the list is a page of its own. Tapping a row opens the section full-width with a back arrow in the page head. The save bar is sticky above the tab bar. Full phone rules are in §8.

```
┌ Pengaturan ──────────┐     ┌ ← Jam Operasional ───┐
│ Tampilan          ›  │     │ Minggu   06 – 12  [ ]│
│ Paket & Harga  12 ›  │ ──► │ Senin    06 – 21  [ ]│
│ Pengingat Klien ● ›  │     │ …          Tutup ─┘  │
│ Notifikasi Admin  ›  │     │                      │
│ Jam Operasional   ›  │     │▓ Belum disimpan  [Simpan]▓
│ Keamanan          ›  │     └──────────────────────┘
│ Akun              ›  │
└──────────────────────┘
```

Each list row shows a one-line status: the number of active packages, the reminder channel and whether the trigger is installed, and Telegram on/off.

### 1.3 Sections and what each one saves

| Section | Controls | Saves through |
| --- | --- | --- |
| Tampilan | Theme segment (existing `#theme-seg`) | Local only, instant, no save bar |
| Paket & Harga | Package list and editor (§2) | Pricelist functions, one call per action |
| Pengingat Klien | Master switch, channel and credentials, quiet hours, pacing, one card per type (on/off, hour, template, test), trigger status, history | `updateAppSettings({reminder: …})`, `installReminderTrigger`, `getReminderLog` |
| Notifikasi Admin | Telegram on/off, token, chat IDs, test, notification email | `updateAppSettings({telegram…, notifEmail})` |
| Jam Operasional | 7 rows: open, close, Tutup (S-9, later) | `updateAppSettings({businessHours})` |
| Keamanan | PIN change (existing form); lockout and session numbers | `changeAdminPin`, `updateAppSettings({loginMaxFails, …})` |
| Akun | Logout | existing `logoutCurrent()` |

### 1.4 Form behavior

- **Load once, per view open:** `getAppSettings` fills every section. Pricelist and reminder log load lazily when their section opens.
- **Dirty tracking:** on load, snapshot each section's values (`serialize(section)` returns a plain object). An `input` event compares against the snapshot; if they differ, show the save bar for that section. **Batal** restores the snapshot. Navigating away from a dirty section asks through the existing `window.showConfirmModal` ("Buang perubahan?").
- **Partial save:** the save button sends only the changed keys of the open section, and the response refreshes the snapshot. For example, saving Jam Operasional sends `{businessHours}`.
- **Validation:** client-side rules mirror the server (`SETTINGS_NUMERIC_BOUNDS`, hours 0–23, open < close, email). Errors appear under the field (`.field.has-error .hint`). The server remains the authority; its error text appears in the save bar.
- **Defaults:** numeric and hour fields show the default as the placeholder ("Bawaan 17:00"). A small "Bawaan" link empties the field, which deletes the property.
- **Secrets:** tokens come back masked (`••••••3f9a`). The field is empty with the mask as placeholder, and an empty field on save means "keep". This replaces today's behavior of sending the Telegram token to the browser in clear text.

### 1.5 New reusable pieces (Theme.html)

Reuse the existing `.card-flat`, `.row-between`, `.toggle`, `.field`, `.label`, `.input`, `.hint`, `.group-label`, `.btn*`, `.seg` and `.form-grid`/`.two`. Add only:

- `.settings-layout` is a two-column grid on desktop and a single column on phone.
- `.settings-nav` and `.settings-nav-item` are list rows with a title, status sub-line and chevron. The active one uses `--ink`/`--on-ink`.
- `.save-bar` is sticky at the bottom with `--surface`, a top border and a shadow. It is hidden unless dirty, slides in with `--t-base` `--ease-out`, and respects `prefers-reduced-motion`.
- `.field.has-error` gets a 2 px `--fg` border and an alert icon before the hint. The theme is monochrome and has no red token, so errors are shown by weight and icon, not color.
- `.status-dot` is `ok`, `warn` or `off`, for trigger and channel state.

All colors come from the existing tokens (`--bg`, `--surface`, `--border`, `--fg`, `--fg-muted`, `--ink`, `--on-ink`) so light and dark both work. There are no new fonts or icons beyond Lucide names already loaded.

### 1.6 Trigger status and history (S-7, S-8)

- `getReminderStatus(token)` (admin) returns `{ triggerInstalled, tickEveryMinutes, lastTickAt, channel, channelReady, sentToday, cap }`. It reads `ScriptApp.getProjectTriggers()` and `RMD_LAST_tick`.
- `installReminderTrigger(token)` (admin) does the same as `setupReminderTrigger`: it removes duplicate triggers and creates one every 15 minutes. This works from the web app because the deployment runs as the owner. `setupReminderTrigger` stays for the editor.
- `getReminderLog(token, {onlyFailed, limit})` (admin) returns the newest rows of `ReminderLog` (max 200). The target is shown as the client name (joined server-side). Phone numbers are not included.

## 2. Pricelist CRUD (priority 2)

### 2.1 Data

`PriceList` sheet, columns **appended only**:

| Col | Header | Notes |
| --- | --- | --- |
| A | ID | Server-generated `PKG-<yyyyMMdd>-<4 random>`, immutable. Existing IDs kept as they are. |
| B | Nama Paket | 1–60 chars |
| C | Kategori | One of `PACKAGE_CATEGORIES` |
| D | Harga | Integer Rupiah ≥ 0, stored as a number |
| E | Jumlah Sesi | Integer 1–200, or empty for "fleksibel" |
| F | Durasi | Free text, max 40 (e.g. "1 Bulan") |
| G | Deskripsi | Max 300 |
| H | Benefit | Items joined with `, `. Each item 1–60 chars with no comma, max 10 items. |
| I | Status Aktif | Checkbox TRUE/FALSE |
| **J** | **Urutan** | New. Integer display order within a category, empty = after numbered ones. |

**Legacy format:** `getPriceList` currently guesses the 8-column layout (no Jumlah Sesi) from `row.length`. Appending column J to such a sheet would make it look 9 columns wide and misread every row. So:

- `_priceListSchema_(headerRow)` maps columns by **header name**, not position.
- `_ensurePriceListSchema_()` runs on every admin write, under the script lock. If "Jumlah Sesi" is missing it inserts it at E. If "Urutan" is missing it appends it. It is idempotent.
- `getPriceList()` and `_allPackagePrices_()` switch to header mapping. Public output shape doesn't change, apart from also being sorted by Urutan.

`PACKAGE_CATEGORIES` (server constant, sent with the admin list):

| id | label | Shown on landing | Notes |
| --- | --- | --- | --- |
| student | Student | yes | |
| college | College | yes | |
| regular | Regular | yes | |
| premium | Premium | yes | |
| core | Core | no (landing has no core tab) | Drives meal reminders |

**Price snapshot (P-5):** `MembersLog` gets column **K "Harga"**. All log rows are written by `_tulisLogTransaksiMember_` (Kode.gs), so that one helper gains a `harga` argument, and its callers pass the package price at that moment. `_revenueSummary_` uses `row[10]` when it is a number, and otherwise falls back to today's price. Old rows behave as before, and new rows are stable.

### 2.2 Server API

All admin functions call `requireAdmin_(token)` first and write under `LockService.getScriptLock()`.

| Function | Returns / does |
| --- | --- |
| `getPriceListAdmin(token)` | `{ categories, packages: [{…package, aktif, urutan, usage: {activeMembers, logEntries}}] }`, all rows, inactive included |
| `savePackage(token, data)` | No `data.id` creates (inactive unless `data.aktif`); with `data.id` updates that row. Validates everything (§2.1) and returns the saved package. |
| `setPackageActive(token, id, aktif)` | Toggles column I |
| `deletePackage(token, id)` | Deletes the row only when `usage.activeMembers === 0 && usage.logEntries === 0`, else throws `Paket dipakai N klien / M transaksi. Nonaktifkan saja.` |
| `reorderPackages(token, category, ids)` | Writes Urutan 1..n for those IDs. Unknown or foreign-category IDs are rejected. |

`usage` is computed in one pass over MemberData (col G) and MembersLog (col E).

### 2.3 UI (section "Paket & Harga")

- Toolbar: category chips (Semua · Student · College · Regular · Premium · Core), a "Tampilkan nonaktif" toggle, and **+ Paket**.
- A list row shows the name, a price formatted `Rp 1.200.000`, "12 sesi · 1 Bulan", a usage chip "8 klien", an active toggle and a ⋯ menu (Ubah, Duplikat, Hapus). On desktop, rows can be dragged to reorder; on phone, ↑/↓ buttons appear in edit mode.
- The editor is a bottom sheet on phone and the right detail pane on desktop, with the fields from §2.1. The price input formats thousands as you type and stores digits only. Benefits are a chip input (Enter adds a chip, × removes one). Sessions has a "Fleksibel" checkbox that clears the number.
- Delete is shown disabled with the reason when the package is in use.
- After any change, refresh `window.priceListData` so member forms and the portal catalog see it without a reload.

## 3. Client reminders (priority 3)

### 3.1 Flow

```
time trigger (every 15 min) ─► runReminderTick
    │  RMD_ENABLED? quiet hours? daily cap left?
    ▼
_dueJobs_ (per type: day, hour, tolerance)
    ▼
handler(ctx) builds the recipient list
    ▼
for each client: opted in? already sent (ReminderLog jenis|slot|memberId = ok)? cap?
    │   yes ► sendToClient_(client, text) via channel adapter ► log ok/gagal
    ▼
job complete when every eligible client has an ok/skip row ► log jenis|slot|* = ok
    ▼
owner summary to Telegram (sent / failed / no number / waiting) + wa.me buttons for failures
```

### 3.2 Channel adapter

One entry point, `_sendToClient_(client, jenis, text, vars)`, returns `{ ok, error, retry }`. The provider is chosen by `RMD_CHANNEL`:

| Channel | Behavior | Properties |
| --- | --- | --- |
| `manual` (default) | Sends nothing to clients. The job produces today's owner digest with `wa.me` buttons (current code path). | — |
| `wa-gateway` | HTTP POST to the gateway with target number and text. Provider details live only in `_gatewaySend_`. | `WA_GATEWAY_TOKEN` (secret) |
| `wa-cloud` | Meta Cloud API template message. `vars` fill the template parameters; the free-text template is ignored. | `WA_CLOUD_TOKEN` (secret), `WA_CLOUD_PHONE_ID`, `WA_CLOUD_TPL_<JENIS>` |

Rules:

- Tokens are Script Properties only. Settings shows them masked, and they're never written to logs or ReminderLog.
- HTTP 429 or 5xx means `retry: true`. Other 4xx means `retry: false` (bad number or template), logged as `gagal` with a short reason.
- A pause of `RMD_SEND_GAP_MS` (default 3000) comes between messages. `RMD_DAILY_CAP` (default 150) counts `ok` rows for today across all types.
- Each run stops starting new sends after about 4.5 minutes and leaves the rest for the next tick, safely under the 6-minute Apps Script limit.

### 3.3 Reminder types

| jenis | When (default) | Who | Message vars |
| --- | --- | --- | --- |
| `sesi-besok` (new; replaces the per-session links in `sendDailyReminderEmail`) | Daily 19:00 | Clients with a session tomorrow (not cancelled) | `{nama} {jam} {coach} {tidur}` |
| `booking-minggu` | Sunday 17:00 | Bookable clients (A4) | `{nama} {slot}` (3 nearest free slots) |
| `pr` | Daily 08:00 | Active clients with PR overdue, due today or due tomorrow | `{nama} {pr}` (max 4 titles) |
| `makan-pagi` / `makan-sore` | 06:00 / 16:00 | Core-package clients with meal reminder on | `{nama} {tip}` |
| `sisa-sesi` (later) | Daily 10:00 | Clients with 1–2 sessions left, once per level | `{nama} {sisa}` |

`tidur` stops being a separate line in the owner email. `RMD_TPL_SLEEP` becomes the `{tidur}` var in `sesi-besok`. The owner's own 05:00/20:00 schedule email stays, without the per-session WhatsApp links once the channel isn't manual.

**Templates:** `RMD_TPL_<JENIS>` holds free text with placeholders. Built-in defaults come from today's `_bookingWaText_`, `_prWaText_` and `_makanWaText_`. On save, unknown `{…}` placeholders are rejected, and the maximum is 600 characters. Settings shows a live preview filled with a sample client.

**Quiet hours:** `RMD_QUIET_FROM` = 21 and `RMD_QUIET_TO` = 6 (WIB). A job whose hour is set inside quiet hours is rejected on save. Retries that would fall into quiet hours wait for the next allowed tick while still within tolerance (`RMD_TOLERANCE_HOURS`, default 3); after that they are logged `lewat`.

### 3.4 Idempotency (per client)

`ReminderLog` already has a `Target` column; today it is always `*`. Changes:

- Each client send is logged with target = member ID and result `ok` | `gagal` | `skip-optout` | `skip-nomor` | `lewat`.
- `_alreadySent_(jenis, slot, memberId)` is checked before each send, so a rerun only covers the rest.
- The job-level `*` row is written `ok` only when no eligible client is left without an `ok` or `skip-*` row. Until then, each tick in the tolerance window continues the job.
- Reading ReminderLog once per run into a `Set` of keys avoids one sheet read per client.

### 3.5 Client preferences (R-6)

- `MemberData` gets column **P "Pengingat Nonaktif"**: a comma list of jenis the client turned off, e.g. `pr,booking-minggu`. Empty means everything is on. Column O (meal flag) keeps working, and `makan-*` counts as off if either O says `tidak` or P lists it.
- Portal: a "Pengingat WhatsApp" card on the client home with one toggle per type the client is eligible for. It uses `getMyReminderPrefs(memberToken)` and `setMyReminderPrefs(memberToken, prefs)`, both of which call `requireMember_` first.
- Panel: the same toggles on the client detail, via `setMemberReminderPrefs(token, memberId, prefs)` (admin).
- The first automatic message to a client ends with one line saying how to turn reminders off in the portal. A `RMD_INTRO_<memberId>` flag isn't needed: the absence of any earlier `ok` row for that member in ReminderLog is the signal.

### 3.6 Owner summary

After each job completes (or reaches the cap), send one Telegram message through `kirimTelegramTombol_`:

```
🔔 Sesi besok · Rabu 1 Okt
✅ 12 terkirim   ⚠️ 1 gagal   📵 2 tanpa nomor valid   ⏸ 0 menunggu
[WA Budi (gagal)]  [WA Sari (nomor?)]
```

Buttons appear only for clients the channel couldn't reach. In `manual` mode the summary *is* today's digest.

### 3.7 Tests for the owner

`sendReminderTest(token, jenis, phone)` gains an optional `phone`. With a phone and a non-manual channel, it sends the sample to that number only; it is never logged against a client. The existing 15-second throttle is kept.

## 4. Settings keys added

| Key | Default | Section |
| --- | --- | --- |
| `RMD_CHANNEL` | `manual` | Pengingat Klien |
| `WA_GATEWAY_TOKEN` | — (secret) | Pengingat Klien |
| `WA_CLOUD_TOKEN`, `WA_CLOUD_PHONE_ID`, `WA_CLOUD_TPL_<JENIS>` | — | Pengingat Klien |
| `RMD_TPL_<JENIS>` | built-in text | Pengingat Klien |
| `RMD_QUIET_FROM`, `RMD_QUIET_TO` | 21, 6 | Pengingat Klien |
| `RMD_SEND_GAP_MS`, `RMD_DAILY_CAP`, `RMD_TOLERANCE_HOURS` | 3000, 150, 3 | Pengingat Klien |
| `RMD_SESI_BESOK_ENABLED`, `RMD_SESI_BESOK_HOUR` | on, 19 | Pengingat Klien |

`getAppSettings` returns them under `reminder` (secrets masked); `_rmdValidate_` validates them. `CONFIG_KEYS` (the Drive config file import) gains `WA_GATEWAY_TOKEN` and `WA_CLOUD_TOKEN`, so tokens can also be set without the UI.

## 5. Security

- New admin functions take `token` first and call `requireAdmin_(token);` on the first line: `getReminderStatus`, `installReminderTrigger`, `getReminderLog`, `getPriceListAdmin`, `savePackage`, `setPackageActive`, `deletePackage`, `reorderPackages`, `setMemberReminderPrefs`.
- New member functions call `requireMember_(memberToken)` first and only touch that member's row: `getMyReminderPrefs`, `setMyReminderPrefs`.
- Everything else gets a trailing `_`.
- Add each name to the right list in `tests/security.test.js` (ADMIN / MEMBER). The existing loops then prove they reject missing, bogus and cross-role tokens.
- No phone numbers go to the browser except in admin responses that already contain them (client detail). The reminder log shows names.
- `runReminderTick` stays a public trigger handler: gated by `RMD_ENABLED`, lock and throttle; with the channel on, also by the daily cap.

## 6. Testing

Node tests in `apps-script/pt-scheduler/tests/` using the existing harness (`env.fetches` records UrlFetchApp calls; `env.props` is Script Properties):

- Settings: a partial save touches only its keys; masked secrets round-trip without being overwritten; reminder keys validate (quiet hours, template placeholders).
- Pricelist: create/update/validate; delete blocked when used; legacy 8-column sheet is migrated once and read correctly; `getPriceList` sort order; price snapshot written; revenue uses the snapshot.
- Reminders: manual mode sends zero client fetches and one owner digest; gateway mode sends one fetch per eligible client; opt-out and no-number are skipped and logged; a run cut off halfway resumes without duplicates; the cap stops sends; quiet hours defer; 429 is retried and 400 is not.
- Security lists updated.

Plus `tools/browser-check.js` at phone and desktop widths in both themes (phone checks listed in §8.5).

## 8. Mobile view

The phone is the main device for both the owner and clients. Everything below is **< 768 px**, the app's existing breakpoint. Test widths: 360, 390 and 430 px.

### 8.1 Shared phone rules

- **Frame:** page padding `--page-pad` (16 px), no sideways scroll, and content never hides behind the tab bar (`--tabbar-h`) or the home indicator (`env(safe-area-inset-bottom)`).
- **Touch:** targets at least 44 × 44 px, and 8 px between neighboring targets. Toggles keep the existing `.toggle` size.
- **Keyboards:** `inputmode="numeric"` for prices, sessions, hours and limits; `type="tel"` for WhatsApp numbers; `type="email"` for email. Enter moves to the next field; the last one submits.
- **Keyboard open:** the focused field scrolls into view above the keyboard (`scrollIntoView({block:'center'})` on focus). The save bar stays attached to the bottom of the visible area.
- **Back:** each level pushes a history entry (`#settings`, `#settings/paket`, `#settings/paket/edit`), so the phone's back gesture steps back one level and closes an open sheet before leaving the section.
- **Sheets:** use the existing bottom sheet (`.sheet`, `.sheet-handle`); a tall form uses a full-height sheet with a sticky footer holding the main button.
- **Text:** body stays at `--fs-md` (14 px) or larger; inputs are 16 px so iOS doesn't zoom on focus.
- **Motion:** slide-in for sections and sheets uses `--t-base`, and is turned off under `prefers-reduced-motion`.

### 8.2 Settings on a phone

```
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ Pengaturan               │   │ ← Pengingat Klien        │   │ ← Pengingat Klien        │
│──────────────────────────│   │──────────────────────────│   │ Sesi besok          [on] │
│ ◐ Tampilan            ›  │   │ Pengingat otomatis  [on] │   │ Jam kirim   [ 19 ]       │
│ ▤ Paket & Harga       ›  │   │ Kanal: Manual        ›   │   │ Pesan                    │
│   12 paket aktif         │   │ ● Trigger terpasang      │   │ ┌──────────────────────┐ │
│ 🔔 Pengingat Klien    ›  │ ► │   tick terakhir 10:15    │ ► │ │Hai {nama}, besok ... │ │
│   Manual · ● terpasang   │   │──────────────────────────│   │ └──────────────────────┘ │
│ ✈ Notifikasi Admin    ›  │   │ Sesi besok  19:00   [on] │   │ Pratinjau (lebar HP)     │
│ 🕘 Jam Operasional     ›  │   │ Booking     Min 17  [on] │   │ [ Kirim tes ]            │
│ 🔒 Keamanan            ›  │   │ PR          08:00   [on] │   │                          │
│ ⎋ Akun                ›  │   │ Makan pagi  06:00  [off] │   │▓ Belum disimpan [Batal][Simpan]▓
│                          │   │ Riwayat pengingat     ›  │   │──────────────────────────│
│──────────────────────────│   │──────────────────────────│   │ ▢  ▢   (+)   ▢  ▢  tabbar│
│ ▢  ▢   (+)   ▢  ▢  tabbar│   │ ▢  ▢   (+)   ▢  ▢  tabbar│   └──────────────────────────┘
└──────────────────────────┘   └──────────────────────────┘
   list                           section (compact rows)         type opened (details)
```

- **List:** full-width rows with an icon, a title, a status sub-line and a chevron. There is no save bar on the list.
- **Section:** the page head shows ← and the section title, and the tab bar stays visible. Long sections (Pengingat Klien) show one compact row per type; tapping a row expands it in place, one open at a time.
- **Save bar:** fixed at `bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom))` with full width, 56 px tall, "Belum disimpan" on the left, and Batal/Simpan on the right. The section gets matching bottom padding so the bar never covers the last field.
- **Jam Operasional:** one row per day: the day name, then two number inputs (open, close) side by side, 72 px each, then the Tutup toggle (later, S-9). No grid wider than the screen.
- **Keamanan:** the PIN form stays one field per row. The numeric limits are stacked (not `.two`) below 400 px.
- **Tests:** "Kirim tes" buttons are full width, and show their result as a toast above the save bar.

### 8.3 Paket & Harga on a phone

```
┌──────────────────────────┐   ┌──────────────────────────┐
│ ← Paket & Harga    [+ ]  │   │ ─────  Paket baru      ✕ │
│ [Semua][Student][Regu›   │   │ Nama paket               │
│ Tampilkan nonaktif  [ ]  │   │ [ Pro 8 Sesi           ] │
│──────────────────────────│   │ Kategori                 │
│ Pro 8 Sesi          [on] │   │ [ Regular            ▾ ] │
│ Rp 800.000               │   │ Harga (Rp)               │
│ 8 sesi · 1 Bulan · 5 klien ⋯│ │ [ 800.000              ] │
│──────────────────────────│   │ Jumlah sesi  [ 8 ] □Fleks│
│ Advanced 12        [on]  │   │ Durasi   [ 1 Bulan     ] │
│ Rp 1.200.000             │   │ Benefit                  │
│ 12 sesi · 1 Bulan · 2 kl ⋯│  │ (1-on-1 ×)(Program ×) [+]│
│──────────────────────────│   │ Deskripsi                │
│ Starter          (nonaktif)│ │ [                      ] │
│ ...                      │   │──────────────────────────│
│ ▢  ▢   (+)   ▢  ▢  tabbar│   │ [      Simpan paket    ] │
└──────────────────────────┘   └──────────────────────────┘
   list                           editor (full-height sheet)
```

- **Category chips:** one horizontal row that scrolls sideways inside itself (the only allowed sideways scroll), with snap to each chip.
- **Package row:** two lines plus a meta line, with the active toggle top-right and the ⋯ menu bottom-right. Tapping the row opens the editor.
- **⋯ menu:** opens a small action sheet (Ubah, Duplikat, Urutkan, Hapus). Hapus is disabled with its reason on one line when the package is in use.
- **Reorder mode:** "Urutkan" switches the list to show ↑/↓ buttons (44 px) on every row and a "Selesai" button in the head. There is no drag on phones.
- **Editor:** a full-height bottom sheet with the handle and ✕, fields one per row, and a sticky footer holding **Simpan paket**. Price uses the numeric keypad and shows thousands separators as you type. Benefit chips wrap onto new lines.
- **Delete confirm:** the existing confirm modal.

### 8.4 Reminders on a phone

- **Owner, Settings:** as in §8.2. The template editor is a textarea, 4 rows tall, growing with the text. Under it is a preview bubble styled like a WhatsApp message, capped at 320 px wide so the owner sees the real line breaks.
- **Owner, reminder history:** a list with one row per send: client name, type, time, and a result chip (Terkirim / Gagal / Dilewati). A "Hanya gagal" toggle sits at the top. Rows load 50 at a time, with a "Muat lagi" button.
- **Owner, Telegram summary:** at most 6 short lines, then buttons (max 8 per message, one per row). This already matches `kirimTelegramTombol_`.
- **Client, portal home:** the "Pengingat WhatsApp" card sits below the existing "Makan hari ini" card, collapsed to one line ("Pengingat WhatsApp · 4 aktif ›"). Tapping it opens a bottom sheet with one toggle row per type the client is eligible for, each with a one-line explanation. Changes save instantly, with a toast.
- **Client, WhatsApp message:** the key fact goes in the first line ("Besok 07:00 sesi dengan Coach Dika"). The message has a short greeting, at most ~500 characters and no long links. The opt-out line comes last.

### 8.5 Mobile checks

`tools/browser-check.js` gains a phone pass (390 × 844, touch enabled) for every new screen, in both themes. For each one it checks:

- No element is wider than the viewport.
- Every button, toggle and chip is at least 44 × 44 px.
- The save bar doesn't overlap the last input.
- Back from a section returns to the list.

## 9. Rollout

1. Phase A ships with no new behavior. The existing values show in the new view.
2. Phase B: the first admin write migrates the PriceList schema. Before deploying, copy the spreadsheet (File → Make a copy) as a backup.
3. Phase C1: deploy with `RMD_CHANNEL=manual` so the owner sees the new summary format while nothing goes to clients.
4. Phase C2: set up the sender number, enter the token, send tests to your own number, then switch the channel. Start with one type (`sesi-besok`) for a week before turning on the rest.
