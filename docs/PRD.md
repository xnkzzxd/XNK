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
3. **Reminders are written for the owner, not the client.** The Telegram messages read as reports to the owner. Some types give no ready message for the client at all: the session-tomorrow list is an owner email, and the sleep tip is a line in that email. The owner has to rewrite or skip them. Every reminder should hand the owner a message addressed to the client, ready to send.

## 3. Goals and non-goals

**Goals**
- G1. Every setting the app uses can be viewed and changed from the panel, in small sections that save independently.
- G2. The owner can create, edit, reorder, deactivate and (when unused) delete packages from the panel, on a phone, without opening Sheets.
- G3. Every reminder type arrives in the owner's Telegram as a list of client buttons. Each button opens WhatsApp to that client with a finished message written to the client. The owner only taps the button, then Send.
- G4. Nothing changes for anyone until the owner turns a feature on. Existing sheets, links and sessions keep working.

**Non-goals (this round)**
- Sending WhatsApp messages automatically (no WhatsApp API or gateway). The owner always presses Send in WhatsApp.
- Two-way chat, or reading client replies.
- Online payment for packages.
- Multiple admin accounts or per-coach logins.
- Replacing Google Sheets as the database.

## 4. Users

| User | Where | Needs |
| --- | --- | --- |
| Owner / admin (PIN) | xnk.my.id, mostly on a phone | Configure the app, manage packages, trust that reminders go out without doing it by hand. |
| Client (WhatsApp login) | book.xnkbooking.my.id portal; receives the owner's WhatsApp messages | Clear, personal reminders; not getting the types that don't apply to them. |
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

### 5.3 Client reminders via Telegram buttons (priority 3)

**How it works (kept from today):** the reminder timer sends a Telegram message to the owner. It lists the clients who should get this reminder, with one button per client. The button opens `wa.me/<client number>?text=<message>`, so WhatsApp opens on the owner's phone with the client's chat and the message already typed. The owner presses Send. Nothing is sent to clients automatically.

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| R-1 | P0 | Every reminder type produces client buttons whose WhatsApp text is **addressed to the client** ("Hai Budi, besok jam 07:00 sesi dengan Coach Dika…"), never an owner report. | Tapping any button opens WhatsApp with a message the owner can send unchanged. |
| R-2 | P0 | Reminder types, each on/off with its own hour: **Sesi besok** (new, H-1 with time and coach; the sleep tip goes inside this message), **Booking minggu** (3 nearest free slots), **PR** (due or overdue homework), **Makan pagi / sore** (core-package clients). | Each type shows up in Settings and in Telegram at its hour. |
| R-3 | P0 | The Telegram message header is short and for the owner ("🔔 Sesi besok · Rabu 1 Okt · 12 klien"); the client-facing text lives only in the buttons. Button label = client name plus one fact ("Budi · 07:00"). | Owner sees at a glance who to message. |
| R-4 | P0 | Clients without a valid WhatsApp number are listed as text at the end ("Tanpa nomor: Sari, Andi") instead of silently dropped. | Owner knows who can't be reached. |
| R-5 | P0 | The owner can turn a reminder type off per client (client detail in the panel). Those clients get no button. | Opted-out client never appears in that type's message. |
| R-6 | P0 | Each run sends to Telegram once per slot (no duplicates after retries); a failed Telegram send is retried on the next tick. | Re-running a tick doesn't repeat the message. |
| R-7 | P0 | Owner schedule email (05:00 / 20:00) stays an owner report; its per-session WhatsApp links (and the sleep line) move to the Sesi besok reminder while that reminder is on. While it is off, nothing changes. | No duplicated client links across email and Telegram; default behavior unchanged. |
| R-8 | P1 | Editable message templates per type with placeholders (`{nama}`, `{jam}`, `{coach}`, `{slot}`, `{pr}`, `{tip}`, `{tidur}`) and a live preview. | Owner changes wording without code; unknown placeholders are rejected. |
| R-9 | P1 | "Kirim tes" per type sends the real Telegram message to the owner now, marked 🧪 TES. | Already exists for some types; extended to all. |
| R-10 | P1 | Clients can also switch reminder types off themselves in the portal. | Same effect as R-5. |
| R-11 | P2 | New type **Sisa sesi**: button for clients with 1–2 sessions left. | — |

### 5.4 Mobile view (applies to all three priorities)

The owner runs the gym from a phone and clients open the portal on a phone, so the phone layout is the main one, not an afterthought.

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| M-1 | P0 | Every new screen works at 360–430 px wide with no sideways scrolling, in light and dark. | Browser check at 360 and 390 px passes for each new screen. |
| M-2 | P0 | Settings on a phone: a section list, then one section full-screen with a back arrow. The phone's back gesture returns to the list, not out of the app. | Back from a section lands on the list. |
| M-3 | P0 | The save bar sits above the bottom tab bar and the phone's home indicator, and never covers the last field. | Last field of each section can be reached and edited with the keyboard open. |
| M-4 | P0 | Tap targets are at least 44 × 44 px (toggles, chips, list rows, ⋯ menus). | Measured in the browser check. |
| M-5 | P0 | Right keyboards: numbers (`inputmode="numeric"`) for price, sessions, hours and limits; phone keypad for WhatsApp numbers; email keyboard for email. | Checked per field. |
| M-6 | P0 | Package editor on a phone is a full-height bottom sheet with its Simpan button always visible. Reorder uses ↑/↓ buttons, not drag. | Owner can add and reorder a package one-handed. |
| M-7 | P1 | Client portal "Pengingat" card (R-10) fits the home screen without crowding the existing cards. | Checked at 360 px. |
| M-8 | P0 | Client messages read well on a phone's WhatsApp: short lines, the key fact (time, slot, PR title) in the first line, under ~500 characters. | Template preview in Settings is shown at phone width. |
| M-9 | P0 | The owner's Telegram message is easy to work through on a phone: one button per row, label short enough to fit (≤ 30 chars), at most 8 buttons per message (more are split into "lanjutan" messages). | Checked with 20 clients. |

## 6. Decisions

| ID | Question | Decision |
| --- | --- | --- |
| D-1 | How do reminders reach clients? | **Decided:** Telegram bot to the owner with one button per client; each opens WhatsApp with the message typed. No WhatsApp API or gateway. |
| D-2 | Default for existing clients? | Every type on, owner switches off per client (R-5). |
| D-3 | Should package categories stay fixed (student, college, regular, premium, core)? | **Decided:** fixed. The landing page only knows the four display categories, and `core` drives the meal reminders. Adding a category is a code change. |

## 7. Success measures

- Owner opens the Apps Script editor or the spreadsheet for settings or prices: **0 times a month**.
- Every reminder button opens a message the owner sends **without editing** it.
- No reminder type needs the owner to write a message from scratch.
- No change in past months' revenue numbers after a price edit (P-5).

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Telegram rate limits with many buttons (about 1 message per second per chat). | Existing 1.1 s gap between split messages; max 8 buttons per message. |
| Secrets (Telegram bot token) leak through the public repo. | Stored only in Script Properties, shown masked in Settings, never logged. |
| Editing prices corrupts revenue. | Price snapshot on each transaction (P-5), and delete blocked for used packages. |
| Sheet structure changes break old data. | Columns only appended, never reordered. Legacy formats still read. Migrations are idempotent. |

## 9. Release plan

| Phase | Scope | Ships when |
| --- | --- | --- |
| A | Settings UI (S-1…S-8, M-1…M-5) | Priority 1. No new behavior, only a new home for existing settings, plus S-5/S-7/S-8. |
| B | Pricelist CRUD (P-1…P-8, M-6) | Priority 2. Needs the Settings view from phase A for its section. |
| C | Client-ready reminders over Telegram (R-1…R-9, M-8, M-9) | Priority 3. No new services needed. |
| Later | S-9, S-10, P-9, R-10, R-11, M-7 | When phases A–C are stable. |

---

## 10. Phase D — Client progress & motivation

Added 2026-09-30 after the owner interview. Phases A–C are live.

### 10.1 Why

Everything so far helps the owner. Clients see a booking portal and get WhatsApp messages, but nothing shows them **how far they've come** or makes renewing easy. The owner wants upgrades a client can see and feel directly. Clients mostly experience the gym through **WhatsApp messages**, so each upgrade must also create a message the owner can send with one tap. The portal is where the detail lives.

Constraints from the owner: keep it simple (big buttons, few screens), Indonesian only, free only (Google Sheets + Apps Script, no paid services). Clients and coaches can both enter data.

### 10.2 Goals

- G5. A client can see their own progress (weight, waist, photos) as a simple chart in the portal.
- G6. A client feels rewarded for showing up: a weekly streak and milestone badges.
- G7. Renewing a package takes one tap for the client and one tap for the owner.
- G8. The owner gets new ready-to-send WhatsApp messages (monthly recap, milestone congrats, measure reminder) through the same Telegram buttons as Phase C.

Non-goals: automatic WhatsApp sending (still never), online payment, diet or workout logging, leaderboards comparing clients.

### 10.3 Requirements

**Progress tracker**

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| D-P1 | P0 | Client logs **weight (kg)** and **waist (cm)** in the portal: one card, two number fields, one Simpan button. Either field may be empty. | Entry appears in the chart right after saving. |
| D-P2 | P0 | Coach/owner can add, edit and delete entries for a client from the client page in the panel. | Owner-entered and client-entered values show together, marked by who entered them. |
| D-P3 | P0 | Portal shows a line chart per measure and the change since the first entry ("−2,1 kg sejak 1 Sep"). | Readable at 360 px, light and dark. |
| D-P4 | P0 | Client uploads **progress photos** (front/side). They are stored privately in the owner's Drive and are visible only to that client (portal) and the owner (panel). | A photo URL never works for anyone not logged in as that client or admin. |
| D-P5 | P1 | Client can delete their own entries and photos. | Deleted photo is trashed in Drive. |
| D-P6 | P1 | Sensible limits: one entry per day per client (a second save the same day updates it), weight 20–300 kg, waist 30–250 cm, photo max 5 MB, max 60 photos per client. | Out-of-range input shows an Indonesian error. |

**Streaks & milestones**

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| D-S1 | P0 | **Streak** = consecutive calendar weeks (Mon–Sun, WIB) with at least one completed session. The current week doesn't break the streak until it ends. | "🔥 5 minggu berturut-turut" on the portal home. |
| D-S2 | P0 | **Badges**: 10, 25, 50, 100 completed sessions; 4, 8, 12-week streaks. Earned badges stay earned. | Badge row on the portal home, locked ones shown faded. |
| D-S3 | P1 | First time a client sees a newly earned badge: a short celebration (confetti-style, respects reduced motion) and a "Bagikan" button that opens WhatsApp with a proud message. | Shown once per badge per client. |
| D-S4 | P1 | Owner sees each client's streak and badges on the client page. | — |

**Easy renewal**

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| D-R1 | P0 | When a client has ≤ 2 sessions left, the portal home shows "Sisa N sesi" with a **Perpanjang** button. It is also always reachable from the package catalog. | Visible at 2, 1 and 0 sessions left. |
| D-R2 | P0 | Tapping Perpanjang: client picks a package → a request is recorded **and** WhatsApp opens to the owner with "Saya mau perpanjang paket X" typed. | Request appears in the panel and as a Telegram notice. |
| D-R3 | P0 | Owner approves a request with one tap after payment. Approval does exactly what "Perpanjang" in the Tambah Klien form does today (reset quota, log transaction with the price). Owner can also reject. | Client's sessions update; transaction logged with price snapshot. |
| D-R4 | P1 | Client sees the request status in the portal: "Menunggu konfirmasi" → "Aktif". | — |

**New WhatsApp messages (Telegram buttons, like Phase C)**

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| D-W1 | P0 | **Rekap bulanan** (1st of the month, default 09:00): per active client, sessions last month, weight/waist change, current streak, link to the portal. Clients with no sessions and no measurements last month are skipped. | Message addressed to the client, ≤ 500 characters. |
| D-W2 | P0 | **Selamat milestone** (daily, default 18:00): one button per client who earned a badge since the last run. | A badge is congratulated once. |
| D-W3 | P0 | **Waktunya ukur** (every 2 weeks, default Monday 08:00): clients whose last measurement is 14+ days old (or never). | — |
| D-W4 | P0 | Each type has its own on/off switch, hour, editable template with placeholders and preview, test button, and per-client off switch, exactly like Phase C types. All are **off by default**. | Nothing changes until the owner turns them on. |

**Phone**: every screen above follows 5.4 (M-1…M-9). The portal is phone-first.

### 10.4 Decisions

| ID | Question | Status |
| --- | --- | --- |
| D-5 | Streak rule | **Decided:** 1 completed session per week. |
| D-6 | Who enters progress | **Decided:** both client and coach. |
| D-7 | Renewal flow | **Decided:** both a recorded request and WhatsApp to the owner. |
| D-8 | Renewal WhatsApp nudge at 2 sessions left (a Telegram button type) | **Open.** Not chosen in the interview; the plan assumes **no** (portal button only). Easy to add later as another type. |
| D-9 | Photo storage | **Open, assumed yes:** private Drive folder "XNK Progress" in the owner's Drive, files never shared by link. |
| D-10 | Build order | **Open, assumed:** progress → streaks & badges → renewal → WhatsApp messages. |

### 10.5 Success measures

- ≥ 50 % of active clients log at least one measurement in the first month.
- Renewals via the portal button, not typed chats, within two months.
- Monthly recap sent to every active client on the 1st, with the owner only tapping buttons.

### 10.6 Risks

| Risk | Mitigation |
| --- | --- |
| Body photos leak. | Never shared by link; served only through a function that checks the member or admin token; separate folder; client can delete. |
| Clients feel judged by numbers. | Positive wording, change shown only when they choose to log, no comparisons between clients. |
| Streak feels unfair after a holiday. | Weekly (not daily) rule; current week never breaks it early. |
| Renewal approved twice. | Request has a status; approve works once, under the script lock. |
| Drive / Apps Script quota. | Photos resized in the browser before upload (max 1600 px, JPEG); 5 MB and 60-photo limits. |

### 10.7 Release plan

| Phase | Scope |
| --- | --- |
| D1 | Progress tracker (D-P1…P6) |
| D2 | Streaks & milestones (D-S1…S4) |
| D3 | Easy renewal (D-R1…R4) |
| D4 | WhatsApp messages (D-W1…W4) |
