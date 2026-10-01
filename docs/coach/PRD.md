# PRD — Phase E: the coach hub, coach profile and client care

| | |
| --- | --- |
| Product | XNK Personal Trainer Scheduler (Apps Script web app behind xnk.my.id, xnkbooking.my.id, book.xnkbooking.my.id) |
| Owner | xnkzzxd (also the only coach) |
| Status | Draft, 2026-10-01 |
| Related | [Design.md](Design.md) · [TODO.md](TODO.md) · [Agent.md](Agent.md) · main docs: [../PRD.md](../PRD.md), [../Design.md](../Design.md), [../Task.md](../Task.md), [../Agent.md](../Agent.md) |

Phases A–D are live (see [../PRD.md](../PRD.md)). This is **Phase E**. Numbering continues from the main docs: goals from G9, decisions from D-11, tasks from T-200.

## 1. Where we are today

**The app was built for a team of coaches. It now has one coach: the owner.** The code still treats "coach" as a list.

- **Coach tab (panel).** A card grid of coaches (`renderCoaches`) and a detail page (`openCoachProfile`) with sessions this month, upcoming sessions, number of clients, WhatsApp, bio, Ubah and Hapus. With one coach this is a single card that says little the dashboard doesn't.
- **Coach profile.** Seven fields: name, WhatsApp, specialty, photo, bio, experience. Nothing about certifications, achievements or location. There is no way to see the profile the way a client sees it.
- **Coach records are fragile.**
  - `addCoach` and `updateCoach` check nothing and take no lock.
  - `deleteCoach` removes the row, but clients and sessions keep the deleted coach's ID, so new sessions can still be assigned to a coach who no longer exists.
  - Renaming a coach doesn't update the names already copied into clients and sessions.
  - Replaced photos stay in Drive forever.
- **Unassigned sessions store a fake name.** "Belum Ditugaskan" is written into the coach-name column, so the "sesi besok" reminder can say "dengan Coach Belum Ditugaskan".
- **Hours and days off can't be set.** A sheet `CoachAvailability` exists but has no screen and is empty. There are no days off at all. Opening hours are global (Pengaturan → Jam Operasional).
- **Free slots are calculated three different ways** (landing page, client portal, the weekly booking reminder). All three use the **number of rows in the Coaches sheet** as capacity, so a former coach who is still listed makes an hour look free while the owner is already booked.
- **Client portal.** The "Coach" tab is a "Tim coach" list with a "Tanya program" button. There is no page about the coach and no "your coach" view.
- **Landing page.** The coach section is hand-written (Coach Jizdan: photo, text, WhatsApp number). It does not read from the app. This stays as it is (D-13).
- **Client knowledge lives in the owner's head.** The app has goals and progress (weight, waist, photos), but no first assessment, no health screening, no injury notes, no fitness tests. A client with a bad knee looks the same as any other in the schedule.
- **Reschedule notice is hard-coded** at 2 hours (`RESCHEDULE_CUTOFF_HOURS`) and not visible to clients until they hit the error.

## 2. Problems, in priority order

1. **The coach side assumes a team that no longer exists.** Pickers, filters, a leaderboard and "assign coach" add taps and room for mistakes (an unassigned session, a deleted coach still being picked).
2. **The owner has no single place for "me as a coach".** Profile, working hours, days off, targets and today's work are spread across the dashboard, the calendar and a sheet.
3. **Slots can be wrong.** No days off, no per-coach hours, and three different capacity calculations.
4. **What the coach knows about each client isn't in the app.** Health, injuries, starting level and retests are in memory or chat history. A new client has no structured start.
5. **Clients can't see who their coach is** beyond a name on a session.

## 3. Goals and non-goals

**Goals**
- G9. **Solo mode.** With one active coach, the panel and portal show no coach pickers, filters, rankings or "assign" steps, and every session belongs to the owner. Adding a coach later brings the team features back.
- G10. **One coach hub.** The Coach tab becomes the owner's home: today's sessions, profile, hours and days off, targets, and who needs attention.
- G11. **A structured start and a visible loop for every client.** First assessment, private health screening, injury notes, and fitness tests repeated every four weeks, with a ready WhatsApp message when a retest is due.
- G12. **Slots follow reality.** Hours and days off feed one slot calculation used by the landing page, the portal, the weekly booking message and the server's booking checks.
- G13. **Clients see a real coach page** in the portal: photo, bio, certifications, today's status and testimonials, with Chat and Booking buttons.
- G14. **Nothing changes until the owner turns it on or fills it in** (same rule as the main PRD, G4). New reminder types are off by default.

**Non-goals (this phase)**
- Coach logins or a coach-only app. The owner is the coach and uses the admin PIN (D-11).
- Landing page built from the coach profile (D-13). Only its **slots** follow the new hours.
- Automatic WhatsApp sending. Still never. Every message is a `wa.me` button the owner taps.
- Pay, commission or payout reports. The 65 % revenue estimate stays as it is.
- Everything in §10 "Later".

## 4. Users

| User | Where | Needs |
| --- | --- | --- |
| Owner-coach (PIN) | xnk.my.id, mostly on a phone, often standing in the gym | See today at a glance, mark sessions done in one tap, know each client's injuries before the session, set hours and days off in a minute. |
| Client (WhatsApp login) | book.xnkbooking.my.id on a phone | Know who the coach is, fill in the health form once, see test results improve, only be offered slots that are really free. |
| Visitor | xnkbooking.my.id | See only slots that are really free. (The landing copy doesn't change.) |

There is no coach user. A future second coach is reached only through `wa.me` links the owner opens.

## 5. Requirements

Priority: **P0** = must ship for the phase to count, **P1** = should, **P2** = nice to have. IDs are new in this document.

### 5.1 Solo mode (`CS`)

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| CS-1 | P0 | **Unassigned means empty.** A session or client with no coach has an empty coach ID and an empty coach name. "Belum Ditugaskan" is never stored. Existing rows with that text are read as empty. | The sesi-besok message for an unassigned session has no "Coach …" words (test). |
| CS-2 | P0 | **Solo detection.** Solo mode is on when exactly one coach is active. One coach is marked **Ini saya** (`COACH_SELF_ID`); with none marked, the first active coach counts. | Setting a coach inactive or adding a second one switches the mode without a reload. |
| CS-3 | P0 | In solo mode every new session (panel, portal booking, recurring) gets the owner as coach automatically. | A client booking from the portal creates a session with the owner's ID and name. |
| CS-4 | P0 | In solo mode the panel hides: coach dropdowns (client forms, session detail, calendar filter), "Assign coach", "Coach tersibuk" and "Performa coach" on the dashboard. The portal hides the coach name on every session row and "Menunggu coach". | Browser check at phone and desktop widths. Data is untouched; only the UI is hidden. |
| CS-5 | P0 | A coach can be set **inactive** instead of deleted. Inactive coaches disappear from lists, pickers, slots and the public list but stay valid in history. | Setting the former coach inactive changes no past session or revenue figure. |
| CS-6 | P0 | **Delete only when unused** (no session, no client, no log row refers to the coach). Otherwise explain why and offer **Nonaktifkan**. Same pattern as packages (main PRD P-4). | Deleting a used coach is impossible. |
| CS-7 | P0 | One tap, **"Tetapkan jadwal tanpa coach ke saya"**, gives the owner every session that has no coach. | Counts shown before confirming; a second tap does nothing. |
| CS-8 | P0 | Free-slot capacity = number of **active** coaches (solo = 1). | An hour with a booking is not offered again on the landing page, portal or booking message. |
| CS-9 | P1 | Adding another coach later is possible from the Coach tab ("Tim coach") and brings back the team UI. | Adding a coach re-shows pickers and filter. |

### 5.2 Coach profile (`CP`)

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| CP-1 | P0 | New fields next to the existing ones: **headline** (one line), **certifications** (list), **achievements** (list), **location**, **Instagram**. All optional except name and WhatsApp. | Saved profile reloads identically, on a phone, without touching the sheet. |
| CP-2 | P0 | Server validation with Indonesian errors, lengths capped, WhatsApp number normalised, writes under the script lock. | Every bad input has a test. |
| CP-3 | P0 | Renaming the coach updates the name on clients and on sessions that are not completed. Completed sessions keep the name they had. | A renamed coach shows the new name on tomorrow's session and the old name in last month's. |
| CP-4 | P0 | Replacing the photo moves the old Drive file to the trash. | The folder doesn't keep growing. |
| CP-5 | P0 | **Public output is a whitelist.** `getCoaches` returns only: id, name, headline, specialty, experience, bio, certifications, achievements, location, Instagram, photo, WhatsApp. No internal fields, no notes, no day-off reasons. | Test compares the exact key list. |
| CP-6 | P0 | **"Lihat seperti klien"** in the hub opens the profile page exactly as the portal shows it (same renderer). | The preview and the portal can't drift apart because they share one function. |
| CP-7 | P0 | **Portal Coach tab = one profile page** in solo mode: photo, name, headline, bio, specialties, certifications, achievements, location, Instagram, today's status, testimonials, **Chat** and **Booking** buttons. With two or more active coaches it becomes the list + profile sheet. | Works at 360 px in both themes; Booking opens the booking sheet. |
| CP-8 | P1 | **Today's status** chip, computed from hours, days off and sessions: `Sedang sesi`, `Tersedia 16:00`, `Cuti sampai 5 Okt`, `Libur hari ini`. The reason for a day off is never shown. | Status changes at the right minute (WIB) in tests. |
| CP-9 | P1 | **Testimonials** on the profile page, from the existing consented evaluations (the same data as the landing page). No new consent flow. | Only entries with consent appear; anonymised names stay anonymised. |
| CP-10 | P1 | Instagram opens in a new tab; WhatsApp Chat uses the existing `wa.me` helper. | — |

### 5.3 Hours and days off (`CA`)

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| CA-1 | P0 | Weekly **working hours** per day, with **several ranges** per day (for example 06–10 and 16–20) and a **Libur** switch per day, all inside the studio's opening hours. | Saved ranges show again after reload; a range outside opening hours is refused. |
| CA-2 | P0 | **Days off**: a date range, all day or from–to hours, with a private note. Past ones are kept for a month, then hidden. | A one-hour dentist visit blocks just that hour. |
| CA-3 | P0 | **One slot engine** (`_freeSlots_`) used by the landing page, the portal, the weekly booking message and the server's booking checks. No other slot math anywhere. | The three screens show the same free hours for the same data (test). |
| CA-4 | P0 | No hours saved = today's behavior (the global opening hours). Availability only starts to matter after the owner saves hours or a day off. | Existing data gives identical slots before and after deploy (test). |
| CA-5 | P0 | The server refuses a client booking inside a day off or outside hours ("Jam ini tidak tersedia."). Auto-assign never picks a coach on a day off. | Booking an hour inside a day off fails from the portal. |
| CA-6 | P0 | Panel bookings made by the owner are **allowed but warned** ("Di luar jam kerja" / "Bertepatan dengan cuti"). The response carries `warnings`; the sheet shows them. | The owner can still book a favour outside hours. |
| CA-7 | P0 | When a day off overlaps sessions that are already booked, the sheet lists them with **WA klien** (ready message) and **Buka jadwal**. Nothing is cancelled automatically. | The list matches the calendar. |
| CA-8 | P1 | Days off show as a shaded background in the calendar. | — |
| CA-9 | P1 | **"Salin jam operasional"** fills the weekly hours from the studio's opening hours in one tap. | — |
| CA-10 | P1 | **Reschedule notice** is a setting (hours, default 2, the value that is hard-coded today). The portal shows the rule next to the reschedule button, and a change inside the notice window is refused with the same message as today. | Changing the setting changes the refusal; default behavior is unchanged. |

### 5.4 Coach hub (`CH`)

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| CH-1 | P0 | The Coach tab opens the **hub**. Order: **Hari ini**, **Perlu perhatian**, **Target bulan ini**, stats, profile card, Jam kerja & cuti, Tim coach. | One scroll on a phone; nothing hidden behind a second tap for the first three blocks. |
| CH-2 | P0 | **Hari ini**: today's sessions in time order with client name, time, a ⚠ flag chip when the client has a private flag, the focus from last time when known, and a one-tap **Selesai**. | Tapping Selesai completes the session exactly like today's "Selesai" (same function, same quota rules). |
| CH-3 | P0 | **Stats:** sessions and hours coached this week and this month, active clients, the coach's weekly streak. One definition everywhere: a session counts when it is **completed**, in the WIB week or month of its completion time. | The hub, dashboard and weekly report show the same number. |
| CH-4 | P0 | **Targets**: sessions per month, active clients, revenue (estimate), new clients. Each is optional. A progress bar and one pace line ("Di jalur: 31 dari 80, hari ke-12 dari 31"). A target left empty is not shown. | With no target set, the card is hidden. |
| CH-5 | P0 | **New clients** are counted from the transaction log (type "Baru") in the current month. **Revenue** uses the existing revenue estimate. | Matches the dashboard revenue figure. |
| CH-6 | P1 | **Monthly summary for the owner**: a Telegram message on the 1st (default 09:00) with last month's sessions, new clients, revenue estimate and each target's result. Off by default. | Sent once per month, retried on failure. |
| CH-7 | P1 | Dashboard "Coach tersibuk" and "Performa coach" are replaced by a link to the hub in solo mode (CS-4). | — |

### 5.5 Client care (`CC`)

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| CC-1 | P0 | **Private notes** per client: a short **Perhatian** flag (for example "Cedera lutut kiri", max 80 characters) and free text (max 2000). | Shown on the client page, the session briefing and the care list. Not in the portal, landing page, Telegram, email or `xnk_admin_cache`. |
| CC-2 | P0 | **Session briefing:** the top of a session's detail shows the client's flag, private notes, last assessment goal and last fitness result. | A flagged client's session shows the flag before anything else. |
| CC-3 | P0 | **Health screening** (PAR-Q style, Indonesian wording): seven yes/no questions, injuries/surgery, regular medication, other conditions, and a consent tick. The client fills it in the portal. A card asks until it is done. | Submitting twice keeps both, the latest counts. |
| CC-4 | P0 | The owner reviews it on the client page (**Sudah ditinjau**, with a note). A new submission clears the review. Telegram gets "Budi mengisi form kesehatan, perlu ditinjau" **without any answers**. | Telegram text never contains an answer (test). |
| CC-5 | P0 | **First assessment** (filled by the coach): main goal, training history, schedule preference, motivation, coach notes. | Saved on the client page; the client sees only goal and preference, not coach notes. |
| CC-6 | P0 | **Body measurements.** Starting weight and waist go into the existing Progress tracker (marked *coach*). Optional extras: body fat %, chest, arm, hip. | Extras show in the client page; the portal's own entry form stays weight and waist. |
| CC-7 | P0 | **Fitness tests** from a fixed list (push-up, plank, squat, sit-and-reach, resting heart rate). Entered by the coach, any date. The portal shows first result, latest result and change per test, in positive wording. | Heart rate improves downward and is shown that way. |
| CC-8 | P0 | **Retest every 28 days.** Reminder type `tes-ulang` (Telegram button → WhatsApp to the client), weekly Monday 08:00, for clients whose last test is 28+ days old. **Off by default**, own hour, template with preview, test button and per-client off switch, exactly like the Phase C types. | Opted-out clients get no button. |
| CC-9 | P0 | **Perlu perhatian** list in the hub, with a reason chip per client: no assessment, no health form, health form not reviewed, retest due, flagged client training today, 14+ days without a session. Tapping a row opens the client page. | A client with two reasons appears once, with both chips. |
| CC-10 | P1 | **Birthday message**: new optional birth date on the client form; reminder type `ulang-tahun` (daily 08:00, off by default) gives a Telegram button → WhatsApp greeting. | Only clients whose birthday is today. |
| CC-11 | P1 | The care list can be dismissed per client for 7 days ("Nanti"). | A dismissed row returns after 7 days. |

### 5.6 Phone (`CM`)

The owner works from a phone and so do clients. These add to main PRD §5.4 (M-1…M-9).

| ID | Pri | Requirement | Acceptance |
| --- | --- | --- | --- |
| CM-1 | P0 | Every new screen works at 360–430 px, no sideways scroll, light and dark. | Browser check at 360 and 390 px. |
| CM-2 | P0 | **Hari ini** is usable one-handed: each row is at least 56 px tall, the Selesai button is 44 × 44 px or larger. | Measured in the browser check. |
| CM-3 | P0 | Editors (profile, hours, day off, assessment, tests, health form, targets) are full-height bottom sheets with a sticky Simpan. Back closes the sheet first. | Back gesture steps back one level. |
| CM-4 | P0 | Right keyboards: `inputmode="decimal"` for test values and percentages, `numeric` for hours and targets, `type="date"` for days off and birth date, `type="tel"` for WhatsApp. | Checked per field. |
| CM-5 | P0 | Hours editor: one row per day, two number fields per range side by side, no grid wider than the screen. | No overflow at 360 px. |
| CM-6 | P0 | The health form uses large Ya/Tidak segments (44 px), one question per block, and the keyboard never covers the focused field. | Browser check with the keyboard open. |

## 6. Decisions

| ID | Question | Decision |
| --- | --- | --- |
| D-11 | Do coaches get their own login? | **Decided: no.** The owner is the coach and uses the admin PIN. |
| D-12 | One coach or a team? | **Decided: solo mode, a coach can be added later.** Solo mode only hides UI; no data is deleted. The former coach is set inactive. |
| D-13 | Should the landing page's coach section read from the profile? | **Decided: no.** It stays hand-written, WhatsApp number included. Landing slots still use the shared slot engine. |
| D-14 | Where may private notes and health data appear? | **Decided:** client page, session briefing and the care list, in the admin panel only. Never in Telegram, email, the portal, the landing page or the local admin cache. |
| D-15 | Retest cycle | **Decided:** every 28 days, with a WhatsApp button. Off by default. |
| D-16 | Targets | **Decided:** sessions, active clients, revenue (estimate), new clients. All optional. |
| D-17 | What is the portal's Coach tab? | **Decided:** one coach profile page (a list + sheet only when there are 2+ active coaches). |
| D-18 | Studio hours vs coach hours | Pengaturan → Jam Operasional is the studio window. Coach hours sit inside it. Days off cover the "closed day" idea of main task T-140 for the coach. |
| D-19 | Is there a master switch for availability? | **No.** Availability matters only after hours or a day off are saved (CA-4). |
| D-20 | Reschedule notice | Becomes a setting with default 2 hours. The rule itself exists today. |

## 7. Success measures

- Every active client has an assessment and a reviewed health form within one month of the feature going live.
- At least half of the `tes-ulang` buttons lead to a recorded retest.
- Zero client bookings inside a day off.
- Owner opens the spreadsheet for coach data, hours or days off: **0 times a month**.
- The owner marks sessions done from **Hari ini** rather than from the calendar.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Health data or injury notes leak (Telegram, email, cache, public functions). | Admin-only functions, fields kept out of `_memberPublicProfile_`, the admin client list and `xnk_admin_cache`; Telegram carries no answers; tests for each path. |
| The slot engine changes what visitors see. | No hours saved = identical behavior (CA-4); the old logic stays as a fallback in the browser until the engine ships; browser checks compare both. |
| Names go stale after a rename or delete. | Rename propagation (CP-3), no deleting used coaches (CS-6), names derived from the ID on the server. |
| Solo mode hides something the owner needs. | It hides UI only; a coach can be re-activated or added in one place (Tim coach). |
| Clients feel judged by fitness tests. | Positive wording, change shown from the first result, no comparison between clients, nothing sent unless the owner turns it on. |
| Health form feels intrusive. | Short, Indonesian, explains why, consent tick, can be skipped by the client but the card keeps asking (only visible to the client). |
| Sheet structure changes break old data. | Columns only appended, read by header, migrations idempotent and under the lock (main Agent rule 4). |

## 9. Release plan

| Phase | Scope | Ships when |
| --- | --- | --- |
| E1 | Solo mode and coach data: CS-1…CS-9, CP-1…CP-5 | First. Fixes the stale-coach bug and prepares everything else. |
| E2 | Hours, days off and the slot engine: CA-1…CA-10 | After E1. Needs the coach data cleaned up. |
| E3 | Coach hub: CH-1…CH-7, CC-10, CM-2 | After E2 (today's status and pace use hours). |
| E4 | Client care: CC-1…CC-9, CC-11, CM-3…CM-6 | After E3 (the care list lives in the hub). |
| E5 | Portal coach page: CP-6…CP-10 | Last. Needs hours, days off and testimonials wiring. |

## 10. Later (not this phase)

No-show handling · buffer and break blocks · workout templates · goal date with pace · exercise log and personal bests · payment log · client risk list · backup button · referral codes · waiting list · trial follow-up · session notes · substitute finder · per-coach Telegram schedule · workload and smart assign · certificate expiry · calendar link per coach · session feedback · coach match quiz · change-coach request · trial with a coach · intro video · coach level · performance and pay · landing page built from the profile. See [TODO.md](TODO.md) for the matching task IDs.
