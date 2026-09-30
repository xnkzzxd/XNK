# PRD — PT Scheduler upgrade (Settings, Pricelist, Client reminders)

| | |
| --- | --- |
| Product | XNK Personal Trainer Scheduler (Apps Script web app behind xnk.my.id, xnkbooking.my.id, book.xnkbooking.my.id) |
| Owner | xnkzzxd |
| Status | Draft, 2026-09-30 |
| Related | [Design.md](Design.md) · [Task.md](Task.md) · [Agent.md](Agent.md) |

## 1. Where we are today

- **Settings** (`Pengaturan`) is one long bottom sheet in the PT panel. It stacks the theme, PIN change, Telegram, email, reminders, business hours and security numbers, with one **Simpan** button at the very bottom that saves everything at once.
- Some settings have no UI. The meal reminders (`makan-pagi`, `makan-sore`) can only be turned on through Script Properties. Meal tips are edited directly in the `MealTips` sheet. The reminder trigger can only be installed by running `setupReminderTrigger` in the Apps Script editor.
- **Pricelist** is read-only in the app. Packages are added, priced and switched off by editing the `PriceList` sheet by hand. Typos (a wrong category, a price with dots, a missing session count) show up directly on the landing page and in registrations.
- Revenue reports price every past transaction at the package's **current** price. Changing a price in the sheet silently rewrites past months' revenue.
- **Reminders** go to the admin, not to clients. Every reminder type is a Telegram message or email to the owner, with one WhatsApp (`wa.me`) button per client. The owner opens each link and presses send, so the owner does the sending by hand for:
  - Session tomorrow (`sendDailyReminderEmail`, 05:00 and 20:00).
  - Weekly booking invite with the 3 nearest free slots (`booking-minggu`, Sunday 17:00).
  - Homework/PR due or overdue (`pr`, daily 08:00).
  - Meal tips for core-package clients (`makan-pagi` 06:00, `makan-sore` 16:00, off by default).
  - Sleep line appended to the evening schedule message (`tidur`).

## 2. Problems, in priority order

1. **Settings are hard to use.** One scroll with 30+ fields mixes rare and frequent settings. Saving one field re-saves all of them, and there's no feedback on what changed. Some features can't be configured from the app at all.
2. **Prices can't be managed in the app.** The owner has to open the spreadsheet, which is error-prone on a phone and unsafe for revenue history.
3. **Reminders need the owner's hands.** Every client message is sent manually from the owner's phone. With N clients that's N taps per reminder run, several times a day, so reminders get skipped. Clients should get them directly.

## 3. Goals and non-goals

**Goals**
- G1. Every setting the app uses can be viewed and changed from the panel, in small sections that save independently.
- G2. The owner can create, edit, reorder, deactivate and (when unused) delete packages from the panel, on a phone, without opening Sheets.
- G3. Client reminders reach the client's WhatsApp automatically. The owner gets one summary instead of N buttons.
- G4. Nothing changes for anyone until the owner turns a feature on. Existing sheets, links and sessions keep working.

**Non-goals (this round)**
- Two-way chat, or reading client replies.
- Online payment for packages.
- Multiple admin accounts or per-coach logins.
- Replacing Google Sheets as the database.

## 4. Users

| User | Where | Needs |
| --- | --- | --- |
| Owner / admin (PIN) | xnk.my.id, mostly on a phone | Configure the app, manage packages, trust that reminders go out without doing it by hand. |
| Client (WhatsApp login) | book.xnkbooking.my.id portal | Get timely reminders, be able to turn off the ones they don't want. |
| Visitor | xnkbooking.my.id landing | See correct, current packages and prices. |

## 5. Requirements

Priority: **P0** = must ship for the phase to count, **P1** = should, **P2** = nice to have.

### 5.1 Settings UI (priority 1)

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| S-1 | P0 | Settings becomes its own admin view with a section list: Tampilan, Paket & Harga, Pengingat Klien, Notifikasi Admin, Jam Operasional, Keamanan, Akun. | Desktop shows the list and the open section side by side. Phone shows the list, then the section full-screen with a back button. |
| S-2 | P0 | Each section saves on its own and only sends its own fields. | Saving Jam Operasional doesn't touch Telegram or reminder properties (verified by test). |
| S-3 | P0 | Unsaved-change tracking. A sticky bar shows "Perubahan belum disimpan" with **Batal** and **Simpan** only when something changed. Leaving a dirty section asks for confirmation. | Editing then reverting a field hides the bar. |
| S-4 | P0 | Inline validation that mirrors the server rules (hour 0–23, open < close, numeric bounds, email format). Server errors show next to the section's save button. | Invalid input can't be submitted, and the message is in Indonesian. |
| S-5 | P0 | Every setting that exists in code has a control, including meal reminders on/off and hour. | No `RMD_*` or settings property is reachable only through the editor. |
| S-6 | P1 | "Kembali ke bawaan" per numeric/hour field clears the property so the code default applies. The default is shown as the placeholder. | Cleared field shows "Bawaan 17:00" and the property is deleted. |
| S-7 | P1 | Reminder trigger status with an install button: "Terpasang ✓ · tick terakhir 10:00" or "Belum terpasang [Pasang]". | Owner never needs the Apps Script editor to start reminders. |
| S-8 | P1 | Reminder history: the last 50 `ReminderLog` rows (type, time, target, result), filterable by failed. | The owner can see why a client didn't get a message. |
| S-9 | P2 | Business hours: mark a day **Tutup** (closed). | Landing, portal and booking show no slots on a closed day. |
| S-10 | P2 | Meal tips editor (add, edit, approve, delete rows of `MealTips`). | Owner approves tips in the app instead of typing `ya` in the sheet. |

### 5.2 Pricelist CRUD (priority 2)

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| P-1 | P0 | List all packages, active and inactive, grouped by category, with price, sessions, duration and how many clients currently use each. | Inactive packages are visibly marked and sorted last. |
| P-2 | P0 | Create/edit a package: name, category (from the known list), price (Rupiah, integer), sessions (integer or "fleksibel"), duration text, description, benefits (list). | Saved package appears on landing, portal catalog and member forms without touching the sheet. |
| P-3 | P0 | Activate/deactivate a package. Inactive packages disappear from landing, portal and registration but stay valid for existing clients and history. | Deactivating doesn't change any client's package or past revenue. |
| P-4 | P0 | Delete only when nothing references the package (no client has it active, no log entry uses it). Otherwise the app explains why and offers Nonaktifkan. | Deleting a used package is impossible. |
| P-5 | P0 | Price history is kept. New transactions record the price paid, and revenue uses the recorded price when present. | Changing a price today doesn't change last month's revenue report. |
| P-6 | P0 | Package IDs are generated by the server and never change or get reused. | Existing IDs (already stored in MemberData and MembersLog) are untouched. |
| P-7 | P1 | Reorder packages within a category (display order on landing and portal). | Order persists and is the same on all three sites. |
| P-8 | P1 | Duplicate a package as a starting point. | Copy opens in the editor as inactive with "(salinan)". |
| P-9 | P2 | Live preview of the package card as it will look on the landing page. | — |

### 5.3 Client reminders (priority 3)

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| R-1 | P0 | Reminders are sent **to each client's WhatsApp number** through a configurable channel. The channel is chosen in Settings; see decision D-1. | With the channel on, a due reminder reaches the client with no owner action. |
| R-2 | P0 | Reminder types for clients: **Sesi besok** (H-1, with time and coach, plus the sleep line), **Booking minggu** (3 nearest free slots), **PR** (due or overdue homework), **Makan pagi / sore** (core-package clients). | Each type can be switched on/off and has an hour in Settings. |
| R-3 | P0 | Per-client delivery log. A client gets each reminder at most once per slot. A failed send is retried on the next tick. Clients already served are never sent twice. | Killing a run halfway and re-running sends only to the clients who were missed. |
| R-4 | P0 | Owner summary instead of buttons: one Telegram message per run, e.g. "Sesi besok: 12 terkirim · 1 gagal · 2 tanpa nomor valid". Failed/no-number clients still get a `wa.me` button so the owner can send by hand. | The owner's Telegram gets one message per run, not N buttons. |
| R-5 | P0 | **Manual mode** stays available and is the default: the channel "Manual (lewat Coach)" keeps today's behavior exactly. | Upgrading without configuring a channel changes nothing. |
| R-6 | P0 | Clients can turn off each reminder type in the portal. The owner can also switch it off per client. | A client who turned off PR reminders never gets one. The switch shows in the client's profile in the panel. |
| R-7 | P0 | Quiet hours: no automatic client messages between 21:00 and 06:00 WIB (configurable). | A reminder due in quiet hours waits for the next allowed hour or is skipped, as configured. |
| R-8 | P1 | Editable message templates per type, with placeholders such as `{nama}`, `{jam}`, `{coach}`, `{slot}`, `{pr}`, `{tip}` and a live preview. | Owner changes wording without code. Unknown placeholders are rejected on save. |
| R-9 | P1 | "Kirim tes ke nomor saya": sends a sample of each type to a number the owner types in, not to clients. | Test never reaches a real client. |
| R-10 | P1 | Send pacing and daily cap per channel (delay between messages, max messages per day) to protect the WhatsApp number from being flagged. | Run stops at the cap and the summary says how many are waiting. |
| R-11 | P2 | New type **Sisa sesi**: tell a client when they have 1–2 sessions left. | — |

## 6. Decisions needed from the owner

| ID | Question | Options | Recommendation |
| --- | --- | --- | --- |
| **D-1** | How do messages reach the client's WhatsApp? | **a) WhatsApp gateway** (Indonesian services such as Fonnte or Wablas: link a WhatsApp number by QR, send through a simple HTTP API, monthly fee). Unofficial, so the number can be banned if clients report spam. **b) WhatsApp Cloud API** (Meta, official): needs a Meta Business account, a dedicated number, and pre-approved message templates; Meta charges per message. **c) Stay manual** (today). | Build the channel as a switchable adapter (see Design.md). Start with **a)** on a separate business number, with pacing and a daily cap. Move to **b)** if volume grows or the number gets flagged. |
| D-2 | Are reminders on or off by default for existing clients? | On (clients opt out in the portal), or off (clients opt in). | **On** for Sesi besok (it's about an appointment they booked). **On** for the others as well, with a one-time first message that says how to turn them off. |
| D-3 | Who is the sender? | The gym's business number, or the owner's personal number. | A separate business number, so a ban never hits the owner's personal WhatsApp. |
| D-4 | Should package categories stay fixed (student, college, regular, premium, core)? | Fixed list, or owner-defined categories. | Fixed list for now. The landing page only knows these four display categories, and `core` drives the meal reminders. |

## 7. Success measures

- Owner opens the Apps Script editor or the spreadsheet for settings or prices: **0 times a month**.
- Share of due reminders delivered without owner action: **≥ 90 %** once the channel is on.
- Owner time spent sending reminders: from about N taps per run to **reading one summary**.
- No change in past months' revenue numbers after a price edit (P-5).

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| WhatsApp number banned for bulk messages (D-1a). | Separate number, pacing, daily cap, opt-out in portal, only transactional content, no links in the first message. Manual mode stays one switch away. |
| Apps Script limits (about 6 min per run, daily URL-fetch and trigger-time quotas). | Per-client log lets a run stop early and continue next tick. Tick every 15 min. Cap per run. |
| Secrets (gateway token) leak through the public repo. | Stored only in Script Properties, shown masked in Settings, never logged. |
| Editing prices corrupts revenue. | Price snapshot on each transaction (P-5), and delete blocked for used packages. |
| Sheet structure changes break old data. | Columns only appended, never reordered. Legacy formats still read. Migrations are idempotent. |

## 9. Release plan

| Phase | Scope | Ships when |
| --- | --- | --- |
| A | Settings UI (S-1…S-8) | Priority 1. No new behavior, only a new home for existing settings, plus S-5/S-7/S-8. |
| B | Pricelist CRUD (P-1…P-8) | Priority 2. Needs the Settings view from phase A for its section. |
| C1 | Client reminder foundation: channel adapter with Manual mode, per-client log, opt-outs, summary, quiet hours (R-3…R-7) | Can ship before D-1 is decided; behavior stays manual. |
| C2 | Real channel (R-1, R-2, R-8…R-10) | After D-1 is decided and the sender number exists. |
| Later | S-9, S-10, P-9, R-11 | When phases A–C are stable. |
