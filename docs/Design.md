# Design — PT Scheduler upgrade

How the requirements in [PRD.md](PRD.md) get built. Tasks are in [Task.md](Task.md); coding rules are in [Agent.md](Agent.md).

## 0. System recap

```
xnk.my.id ─┐                                   ┌─ Google Sheets (MemberData, MembersLog, PriceList,
xnkbooking ─┼─ iframe ─► Apps Script web app ──┤   Schedules, Tasks, ReminderLog, MealTips, …)
book.xnk… ─┘   (one deployment, runs as owner)  ├─ Script Properties (settings + secrets)
                                                ├─ Time triggers (daily email, weekly report, runReminderTick)
                                                └─ UrlFetchApp → Telegram bot → owner taps wa.me button → WhatsApp
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
- On a phone, opening a section pushes a browser history entry (state only, no URL hash, because Apps Script pages run in a sandboxed iframe), so the back gesture returns to the list. The open section is kept in memory while the app is open; a page refresh returns to the list.

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

Phone (< 768 px): the list is a page of its own. Tapping a row opens the section full-width with a back arrow in the page head. The save bar is a fixed element outside the page (a page animation would otherwise trap fixed children), sitting above the tab bar. Full phone rules are in §8.

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
| Pengingat Klien | Master switch, one card per type (on/off, hour, template with preview, test), trigger status, history | `updateAppSettings({reminder: …})`, `installReminderTrigger`, `getReminderLog` |
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

- `getReminderStatus(token)` (admin) returns `{ triggerInstalled, tickEveryMinutes, lastTickAt, telegramReady }`. It reads `ScriptApp.getProjectTriggers()` and `RMD_LAST_tick`.
- `installReminderTrigger(token)` (admin) does the same as `setupReminderTrigger`: it removes duplicate triggers and creates one hourly trigger (the reminder hours are whole hours, so hourly is enough). This works from the web app because the deployment runs as the owner. `setupReminderTrigger` stays for the editor.
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
- `getPriceList()` and `_allPackagePrices_()` switch to header mapping. Public output shape doesn't change, apart from also being sorted (categories in order of first appearance in the sheet, then Urutan). The first admin write also numbers the existing packages (Urutan 1..n per category, in their current order) so a newly added package goes last, not first.

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
- A list row shows the name, a price formatted `Rp 1.200.000`, "12 sesi · 1 Bulan", a usage chip "8 klien", an active toggle and a ⋯ menu (Ubah, Duplikat, Hapus). Reordering uses ↑/↓ buttons on every screen size ("Urutkan" mode, one category at a time); drag-and-drop is not built.
- The editor is a bottom sheet (full height on phone, a centered dialog on desktop), with the fields from §2.1. The price input formats thousands as you type and stores digits only. Benefits are a chip input (Enter adds a chip, × removes one). Sessions has a "Fleksibel" checkbox that clears the number.
- Delete is shown disabled with the reason when the package is in use.
- After any change, refresh `window.priceListData` so member forms and the portal catalog see it without a reload.

## 3. Client reminders via Telegram buttons (priority 3)

No WhatsApp API. The owner's Telegram gets one message per reminder run; each client is a button that opens WhatsApp with a message **written to the client**. The owner presses Send.

### 3.1 Flow

```
time trigger (hourly) ─► runReminderTick ─► RMD_ENABLED? due jobs (_dueJobs_)?
    ▼
handler(ctx): recipients = eligible clients − per-client opt-outs
    ▼
for each client: text = fill(template, vars)  →  button { "Budi · 07:00", wa.me/62…?text=… }
    ▼
kirimTelegramTombol_(header, buttons)   (8 buttons per message, split into "lanjutan")
    ▼
ReminderLog  jenis|slot|*  = ok / gagal  (gagal → retried next tick within tolerance)
```

This is today's engine (`kirimTelegramTombol_`, `_waLink_`, `ReminderLog`, `_dueJobs_`). The changes are in *what* the messages say and which types exist.

### 3.2 Reminder types

| jenis | When (default) | Who gets a button | Button label | Client message (default template) |
| --- | --- | --- | --- | --- |
| `sesi-besok` (new) | Daily 19:00 | Clients with a session tomorrow (not cancelled) | `Budi · 07:00` | `Hai {nama}, pengingat sesi besok jam {jam} dengan Coach {coach}. {tidur} Sampai ketemu!` |
| `booking-minggu` | Sunday 17:00 | Bookable clients (A4) | `Budi · 3 slot` | today's `_bookingWaText_` with `{slot}` |
| `pr` | Daily 08:00 | Active clients with PR overdue, due today or tomorrow | `Budi · 2 PR` | today's `_prWaText_` with `{pr}` |
| `makan-pagi` / `makan-sore` | 06:00 / 16:00 | Core-package clients with meal reminder on | `Budi` | today's `_makanWaText_` with `{tip}` |
| `sisa-sesi` (later) | Daily 10:00 | Clients with 1–2 sessions left | `Budi · sisa 1` | `Hai {nama}, sesi kamu tinggal {sisa}. Mau lanjut paket?` |

- `sesi-besok` replaces the "Kirim WA Konfirmasi" links in `sendDailyReminderEmail`, but only while it is active (reminders on and this type on). While it is off, the 05:00/20:00 owner email and Telegram message keep their links, exactly as before. Either way the email stays a schedule report for the owner.
- `RMD_TPL_SLEEP` moves from the owner's email into `{tidur}` inside `sesi-besok` while that reminder is active; otherwise it stays in the email as before.
- Rewrite each existing text so it speaks to the client (greeting with `{nama}`, key fact in the first line, ≤ 500 characters).

### 3.3 Telegram message layout (for the owner)

```
🔔 Sesi besok · Kamis 1 Okt · 12 klien
Tekan nama → WhatsApp terbuka dengan pesan siap kirim.
📵 Tanpa nomor: Andi, Rina          ← only when someone has no valid number
[ Budi · 07:00 ]
[ Sari · 08:00 ]
… (max 8 per message, then "↪️ Lanjutan (2/3)")
```

The header is for the owner; client-facing words only live inside the button links. Button labels ≤ 30 characters (`TELEGRAM_BUTTON_TEXT_MAX` is now 30; a long name is shortened with … and the fact is kept). The "Tanpa nomor" line sits under the header because Telegram cannot put text after the buttons. A run with zero recipients sends nothing and logs `ok`.

### 3.4 Templates

`RMD_TPL_<JENIS>` holds the client message with placeholders. Empty = built-in default above (saving the default text stores nothing, so future wording fixes reach you). On save: unknown or other-type `{…}` rejected, stray braces rejected, max 600 characters. The rendered client text is capped at 900 characters. Settings shows a preview with sample data, styled as a WhatsApp bubble; it comes from the server (`previewReminderText`), so it is exactly what the button will carry.

### 3.5 Per-client opt-out

- `MemberData` gets column **P "Pengingat Nonaktif"**: comma list of jenis switched off, e.g. `pr,booking-minggu`. Empty = all on. Column O (meal flag) keeps working; `makan-*` counts as off if either says so.
- Panel: toggles on the client detail (sesi besok, booking mingguan, PR; meal keeps its own switch), via `setMemberReminderPrefs(token, memberId, { off: [...] })` (admin). Other entries already in column P (for example `makan-pagi`) are preserved.
- Later (R-10): the same toggles in the portal via `getMyReminderPrefs` / `setMyReminderPrefs` (member).

### 3.6 Test sends

`sendReminderTest(token, jenis)` already runs a handler now and prefixes "🧪 TES". Extend `RMD_TEST_JENIS` with `sesi-besok` and make every type testable from its card.

## 4. Settings keys added

| Key | Default | Section |
| --- | --- | --- |
| `RMD_TPL_<JENIS>` | built-in text | Pengingat Klien |
| `RMD_SESI_BESOK_ENABLED`, `RMD_SESI_BESOK_HOUR` | on, 19 | Pengingat Klien |

`getAppSettings` returns them under `reminder`; `_rmdValidate_` validates them.

## 5. Security

- New admin functions take `token` first and call `requireAdmin_(token);` on the first line: `getReminderStatus`, `installReminderTrigger`, `getReminderLog`, `getPriceListAdmin`, `savePackage`, `setPackageActive`, `deletePackage`, `reorderPackages`, `setMemberReminderPrefs`.
- Later (R-10), member functions `getMyReminderPrefs` / `setMyReminderPrefs` call `requireMember_(memberToken)` first and only touch that member's row.
- Everything else gets a trailing `_`.
- Add each name to the right list in `tests/security.test.js` (ADMIN / MEMBER). The existing loops then prove they reject missing, bogus and cross-role tokens.
- Client phone numbers only appear inside Telegram button links (owner's chat) and admin responses that already carry them. The reminder log in Settings shows names.
- `runReminderTick` stays a public trigger handler, gated by `RMD_ENABLED`, a lock and a throttle.

## 6. Testing

Node tests in `apps-script/pt-scheduler/tests/` using the existing harness (`env.fetches` records UrlFetchApp calls; `env.props` is Script Properties):

- Settings: a partial save touches only its keys; masked secrets round-trip without being overwritten; templates reject unknown placeholders.
- Pricelist: create/update/validate; delete blocked when used; legacy 8-column sheet is migrated once and read correctly; `getPriceList` sort order; price snapshot written; revenue uses the snapshot.
- Reminders: each type sends one Telegram message (split at 8 buttons) whose button URLs are `wa.me` links with the client's number and client-addressed text; opted-out clients get no button; no-number clients are listed; re-running a tick doesn't resend; `sesi-besok` picks tomorrow's sessions only.
- Security lists updated.

Plus `tools/browser-check.js` at phone and desktop widths in both themes (phone checks listed in §8.5).

## 8. Mobile view

The phone is the main device for both the owner and clients. Everything below is **< 768 px**, the app's existing breakpoint. Test widths: 360, 390 and 430 px.

### 8.1 Shared phone rules

- **Frame:** page padding `--page-pad` (16 px), no sideways scroll, and content never hides behind the tab bar (`--tabbar-h`) or the home indicator (`env(safe-area-inset-bottom)`).
- **Touch:** targets at least 44 × 44 px, and 8 px between neighboring targets. Toggles keep the existing `.toggle` size.
- **Keyboards:** `inputmode="numeric"` for prices, sessions, hours and limits; `type="tel"` for phone numbers; `type="email"` for email. Enter moves to the next field; the last one submits.
- **Keyboard open:** the focused field scrolls into view above the keyboard (`scrollIntoView({block:'center'})` on focus). The save bar stays attached to the bottom of the visible area.
- **Back:** each level pushes a history entry (state only, no hash: list → section → editor), so the phone's back gesture steps back one level and closes an open sheet before leaving the section.
- **Sheets:** use the existing bottom sheet (`.sheet`, `.sheet-handle`); a tall form uses a full-height sheet with a sticky footer holding the main button.
- **Text:** body stays at `--fs-md` (14 px) or larger; inputs are 16 px so iOS doesn't zoom on focus.
- **Motion:** slide-in for sections and sheets uses `--t-base`, and is turned off under `prefers-reduced-motion`.

### 8.2 Settings on a phone

```
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ Pengaturan               │   │ ← Pengingat Klien        │   │ ← Pengingat Klien        │
│──────────────────────────│   │──────────────────────────│   │ Sesi besok          [on] │
│ ◐ Tampilan            ›  │   │ Pengingat otomatis  [on] │   │ Jam kirim   [ 19 ]       │
│ ▤ Paket & Harga       ›  │   │ Telegram: aktif      ›   │   │ Pesan                    │
│   12 paket aktif         │   │ ● Trigger terpasang      │   │ ┌──────────────────────┐ │
│ 🔔 Pengingat Klien    ›  │ ► │   tick terakhir 10:15    │ ► │ │Hai {nama}, besok ... │ │
│   Telegram · ● terpasang   │   │──────────────────────────│   │ └──────────────────────┘ │
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

- **Owner, Telegram (the main screen for this feature):** one button per row, labels ≤ 30 chars so they don't wrap, a two-line header, the "Tanpa nomor" line last. Tapping a button leaves Telegram for WhatsApp; after Send, the phone's back returns to Telegram at the same spot for the next client.
- **Owner, Settings:** as in §8.2. Template editor is a textarea, 4 rows, growing with the text; under it a WhatsApp-style preview bubble capped at 320 px so the owner sees real line breaks.
- **Owner, reminder history:** rows of type, slot time, result chip (Terkirim ke Telegram / Gagal), "Hanya gagal" toggle, 50 at a time.
- **Owner, client detail:** a "Pengingat" group with one toggle per type (44 px rows).
- **Client, WhatsApp:** the key fact in the first line ("Besok 07:00 sesi dengan Coach Dika"), short greeting, ≤ 500 characters, no long links.
- **Client, portal (later, R-10):** a one-line "Pengingat · 4 aktif ›" card below "Makan hari ini", opening a bottom sheet of toggles.

### 8.5 Mobile checks

`tools/browser-check.js` gains a phone pass (390 × 844, touch enabled) for every new screen, in both themes. For each one it checks:

- No element is wider than the viewport.
- Every button, toggle and chip is at least 44 × 44 px.
- The save bar doesn't overlap the last input.
- Back from a section returns to the list.

## 9. Rollout

1. Phase A ships with no new behavior. The existing values show in the new view.
2. Phase B: the first admin write migrates the PriceList schema. Before deploying, copy the spreadsheet (File → Make a copy) as a backup.
3. Phase C: deploy, use "Kirim tes" for each type, read the messages on the phone, adjust templates, then turn the types on.

---

## 10. Phase D — Client progress & motivation

Builds [PRD §10](PRD.md#10-phase-d--client-progress--motivation). Same rules as before: guards on every public function, append-only sheets, off by default, phone first.

### 10.1 Data

New sheets (created by `getOrCreateSheet_`, all columns Plain Text except numbers):

**`Progress`** (one row per client per day)

| Col | Header | Notes |
| --- | --- | --- |
| A | ID | `PRG-<ms>-<rand>` |
| B | Member ID | |
| C | Tanggal | `YYYY-MM-DD` (WIB); one row per member per date, a second save updates it |
| D | Berat (kg) | number with one decimal, or empty |
| E | Pinggang (cm) | number with one decimal, or empty |
| F | Dicatat Oleh | `klien` or `coach` |
| G | Diubah Pada | ISO time |

**`ProgressPhotos`**

| Col | Header | Notes |
| --- | --- | --- |
| A | ID | `PHT-<ms>-<rand>` |
| B | Member ID | |
| C | Tanggal | `YYYY-MM-DD` |
| D | Sisi | `depan` / `samping` |
| E | File ID | Drive file ID in the private folder |
| F | Dicatat Oleh | `klien` / `coach` |

**`RenewalRequests`**

| Col | Header | Notes |
| --- | --- | --- |
| A | ID | `REN-<ms>-<rand>` |
| B | Member ID | |
| C | Paket ID | must be an active package |
| D | Status | `menunggu` / `disetujui` / `ditolak` / `dibatalkan` |
| E | Dibuat Pada | ISO time |
| F | Diputuskan Pada | ISO time |
| G | Harga | package price at request time |

**`MemberData` column Q "Badge Terlihat"**: comma list of badge IDs the client has already seen celebrated. Column R **"Badge Diselamati"**: badge IDs already sent in a "Selamat milestone" button. Badges themselves are **computed**, not stored.

**Photos folder**: `XNK Progress` in the owner's Drive, ID kept in Script Property `PROGRESS_PHOTO_FOLDER_ID` (created on first upload, like `COACH_PHOTO_FOLDER_ID`). Files are **never** given link sharing. That is unlike coach photos, which use `ANYONE_WITH_LINK`, so don't reuse that helper as is.

### 10.2 Streak and badges (pure functions, easy to test)

- `_completedWeeks_(schedules, memberId)`: a set of ISO week keys (`2026-W40`, Monday-start, WIB) with at least one schedule `status === 'completed'` for that member.
- `_streak_(weeks, now)`: count back from the last **finished** week. If the current week already has a session, add it. So a streak never drops on Monday morning just because this week hasn't had a session yet.
- `_badges_(completedCount, bestStreak)`: `sesi-10/25/50/100` from the lifetime completed count, and `streak-4/8/12` from the **best** streak ever. Earned badges never disappear.
- `getMyProgress(memberToken)` returns `{ entries, photos:[{id,tanggal,sisi}], streak, bestStreak, completed, badges:[{id,label,earned}], newBadges:[ids not in col Q] }`.

### 10.3 Server API

| Function | Guard | Does |
| --- | --- | --- |
| `getMyProgress(memberToken)` | member | See 10.2. |
| `saveMyMeasurement(memberToken, {tanggal?, berat, pinggang})` | member | Upsert today's row (a client cannot pick a future date or one more than 7 days back). |
| `deleteMyMeasurement(memberToken, id)` | member | Only own rows. |
| `uploadMyProgressPhoto(memberToken, base64, mime, sisi)` | member | Reuse `_checkImageUpload_`; 5 MB; 60 photos per member; private file. |
| `getMyProgressPhoto(memberToken, id)` | member | Returns `data:` URL (base64) of own photo only. |
| `deleteMyProgressPhoto(memberToken, id)` | member | Trashes the Drive file and removes the row. |
| `markBadgesSeen(memberToken, ids)` | member | Adds to column Q. |
| `requestRenewal(memberToken, packageId)` | member | One open request per member (a new one cancels the old); Telegram notice to the owner; returns the owner's WhatsApp link text. |
| `getMemberProgress(token, memberId)` | admin | Same shape as `getMyProgress` plus who entered each value. |
| `saveMemberMeasurement(token, memberId, data)` / `deleteMemberMeasurement(token, id)` | admin | Coach entries. |
| `getMemberProgressPhoto(token, id)` | admin | Any client's photo, as a data URL. |
| `getRenewalRequests(token, {status})` | admin | Pending first. |
| `decideRenewal(token, id, approve)` | admin | Approve = same path as Perpanjang (`_addMemberInternal_` renewal branch, price snapshot); once only, under the script lock. |

All go into `tests/security.test.js` (MEMBER / ADMIN lists). The owner's WhatsApp number for renewal comes from Script Property `OWNER_WA` (new Settings field under Notifikasi Admin; if empty, the button explains that renewal requests go to the panel only).

### 10.4 Portal (client) screens, phone first

The portal home (`public-dashboard`) gets three new cards in this order, below the existing session card:

```
┌ Beranda ───────────────────────┐
│ Sisa 2 sesi        [Perpanjang]│  ← only when ≤ 2 left (D-R1)
│────────────────────────────────│
│ 🔥 5 minggu berturut-turut      │
│ ○10 ●25 ○50 ○100  ●4 ○8 ○12    │  ← badges, locked faded
│────────────────────────────────│
│ Progres                        │
│ Berat 72,4 kg  (−2,1 sejak 1/9)│
│ ╭──╮_   line chart (SVG)       │
│ [Catat hari ini]  [Foto]       │
└────────────────────────────────┘
```

- **Catat hari ini** opens a bottom sheet with two big number fields (`inputmode="decimal"`, 16 px), Simpan.
- **Foto** opens a sheet with Depan / Samping, the camera or gallery picker, and a grid of past photos (tap to view full screen, delete from there). Images are resized in the browser to max 1600 px JPEG before upload.
- **Chart:** inline SVG, no library. One line per measure, dots per entry, muted grid, `--fg` stroke. Tap a dot to see the value. At most the last 26 entries.
- **Celebration:** on load, if `newBadges` isn't empty, show a centered card "Badge baru: 25 sesi! 🎉" with a light confetti burst (CSS only, off under reduced motion), a **Bagikan** button (WhatsApp share text) and **Tutup**. Then call `markBadgesSeen`.
- **Renewal sheet:** active packages from `getPriceList` as big rows (name, price, sessions). Choosing one calls `requestRenewal` then opens `wa.me/<OWNER_WA>?text=…`. Afterwards the card shows "Menunggu konfirmasi".

### 10.5 Panel (owner) screens

- **Client page**, new section "Progres": the same chart, a list of entries with a *klien* / *coach* chip, **+ Catat** (sheet), a photo grid, and the streak and badges line.
- **Dashboard**: a "Minta perpanjang (N)" card when requests are pending; tapping it lists them with **Setujui** / **Tolak**.
- **Telegram notice** on each new request: "🔁 Budi minta perpanjang Regular 8 (Rp 800.000)".

### 10.6 New reminder types (same engine as Phase C)

| jenis | When (default) | Who | Button | Placeholders |
| --- | --- | --- | --- | --- |
| `rekap-bulanan` | Day 1 of month, 09:00 | Active clients with a session or measurement last month | `Budi · 8 sesi` | `{nama} {sesi} {berat} {pinggang} {streak} {link}` |
| `selamat-milestone` | Daily 18:00 | Clients with a badge not yet in column R | `Budi · 25 sesi` | `{nama} {badge}` |
| `waktunya-ukur` | Every other Monday (even ISO week), 08:00 | Active clients whose last measurement is ≥ 14 days old or missing | `Budi` | `{nama} {terakhir} {link}` |

- `REMINDER_JOBS` gains the three types with `defaultEnabled: false`. `_dueJobs_` gets a `dayOfMonth` option and an `evenWeek` option.
- `{berat}` renders as "berat −2,1 kg" or empty when there's no data; the template tidying from Phase C removes leftover spaces.
- `{link}` is the portal URL (`https://book.xnkbooking.my.id`).
- `selamat-milestone` writes column R after the Telegram message succeeds, so a failed send is retried.
- Settings (Pengingat Klien) shows the three cards automatically from `SET_RMD_JOBS`. The client page's per-client switches gain the three types.

### 10.7 Security

- Photos: no link sharing; data URLs only through the member/admin functions; the member function checks the photo's Member ID equals the token's member.
- Every member function reads the member ID from the token, never from the arguments.
- `requestRenewal` is throttled (one per member per minute) and capped at one open request.

### 10.8 Testing

- Pure: `_completedWeeks_`, `_streak_` (holiday gap, current-week rule, Monday morning), `_badges_`.
- Server: measurement upsert and limits; client can't touch another client's rows or photos; photo file is never shared; renewal approve-once and price snapshot; reminder types (skip rules, badge column R only after success, even-week rule).
- Browser (phone first): portal cards at 360/390 px in both themes, measurement sheet keyboard, chart without sideways scroll, celebration card and reduced motion, renewal flow opening WhatsApp, panel Progres section and renewal approval.
