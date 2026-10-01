# Tasks — Phase E (coach hub, coach profile, client care)

Work items for [PRD.md](PRD.md), built as described in [Design.md](Design.md). Rules for whoever picks a task are in [Agent.md](Agent.md) (and the main [../Agent.md](../Agent.md)). The main task list is [../Task.md](../Task.md).

- IDs start at **T-200** (main tasks end at T-185; T-140…T-144 are "Later" there).
- Size: **S** ≈ under 2 h, **M** ≈ half a day, **L** ≈ a day or more.
- Status: `[ ]` todo · `[~]` in progress · `[x]` done. Update the box in the same commit that finishes the task.
- One task = one commit (or a few), with tests passing. A phase = one pull request.
- **Every UI task is only done when it also works on a phone** (main Design §8, PRD CM-1…CM-6): 360–430 px, both themes, 44 px targets, the right keyboard, back gesture handled.
- Build order: **E1 → E2 → E3 → E4 → E5**. Defaults equal today's behavior; new reminder types are off.

## E1 — Solo mode and coach data

Requirements: CS-1…CS-9, CP-1…CP-5. Starts with the bug fix, because every later phase depends on clean coach data.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-200 | **Fix "Belum Ditugaskan".** Write `''` / `''` for an unassigned session; read the old text as empty everywhere (daily email, `_coachMonthlyStats_`, `sendSesiBesokDigest_`, `saveCoachAssignment`). | Kode.gs, Reminder.gs, App.html, tests/reminder.test.js | — | S | Sesi-besok text for an unassigned session has no "Coach …" words; a row that already says "Belum Ditugaskan" reads as unassigned (tests). |
| [x] | T-201 | **Header-mapped `Coaches`.** `_coachSchema_`, idempotent `_ensureCoachSchema_` (appends Status Aktif … Foto File ID under the lock on admin writes). `getCoaches` reads by header; reads never create a sheet. | Kode.gs, tests/coach.test.js (new) | — | M | Legacy 7-column sheet and the new layout both read correctly; migration is idempotent; a legacy row counts as active. |
| [x] | T-202 | **`saveCoach` and validation** (Design §2.5), phone normalisation, script lock, rename propagation to `MemberData` and non-completed `Schedules`, trashing the replaced photo (`Foto File ID`). `addCoach` / `updateCoach` delegate. | Kode.gs, tests/coach.test.js, tests/security.test.js | T-201 | M | Every bad input has an Indonesian error (tests); a renamed coach shows the new name on tomorrow's session and the old name on a completed one; old photo is trashed. |
| [x] | T-203 | **Active flag and admin API.** `getCoachesAdmin` (usage counts, `isSelf`, `solo`), `setCoachActive` (never the last one), `deleteCoach` blocked when used, `setSelfCoach`, `assignUnassignedToSelf` (with dry run), `_publicCoach_` whitelist and `getCoaches` returning active coaches only. | Kode.gs, tests, tests/security.test.js | T-202 | M | Deleting a used coach is refused with the reason; the last active coach can't be deactivated; `getCoaches` key list matches the whitelist exactly. |
| [x] | T-204 | **Solo-mode behavior.** Server: auto-assign the self coach when solo, never an inactive coach; `updateScheduleCoach` derives the name from the ID. Panel: `window.isSoloCoach()` and the hiding rules of Design §3.4 (client forms, session detail, calendar filter, dashboard blocks, "Belum ada coach"); capacity = active coaches. Panel `loadAllData` uses `getCoachesAdmin`. | Kode.gs, App.html, Index.html, tests | T-203 | M | A portal booking creates a session with the owner's ID and name; with a second active coach the pickers and filter come back without a reload; no data changes either way. |
| [x] | T-205 | **"Tim coach" list and profile editor sheet.** Replaces `#modal-add-coach`: new fields (headline, specialty chips, certifications and achievements chips, location, Instagram), crop flow kept; Tim coach rows with active toggle, "Ini saya", ⋯ menu, **+ Coach**, and the **Tetapkan jadwal tanpa coach ke saya** action with counts. | Index.html, App.html, Theme.html | T-203 | L | On a phone the editor is a full-height sheet with sticky Simpan, chips wrap, keyboards are right; the former coach can be deactivated and "Ini saya" set from the phone. |
| [x] | T-206 | **Browser phone pass for E1** (Tim coach, editor, solo hiding, team mode after adding a coach). | tools/browser-check.js | T-205 | S | Passes at 360 and 390 px, both themes, and on desktop. |

## E2 — Hours, days off and the slot engine

Requirements: CA-1…CA-10. Built. Deviations: the calendar's shaded days off (CA-8) and the portal's reschedule-notice line (CA-10, moves to T-240) are not built yet; the browser-side slot fallbacks stay (landing falls back when `getOpenSlots` fails; the portal falls back to its old overlap count). Hours the coach is not working are returned with `off: true` so the landing page can hide them, as it did with the old narrowed window.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-210 | **Pure `_freeSlots_`** (Design §2.6), `getOpenSlots`, `getCoachStatus`, and `getPublicAvailability` as an adapter with the same output shape; no sheet creation on read. | Kode.gs, tests/availability.test.js (new), tests/security.test.js | T-201 | L | No rules = today's hours (before/after test on the same data); several ranges per day; Libur day; unassigned booking uses shared capacity; status chip states correct at boundary minutes (WIB). |
| [x] | T-211 | **Hours and days-off API.** `CoachTimeOff` sheet, `saveCoachAvailability`, `addCoachTimeOff` / `deleteCoachTimeOff` returning `clashes`; validation per Design §2.5. | Kode.gs, tests, tests/security.test.js | T-210 | M | A one-hour day off blocks just that hour; clashes list booked, not-completed sessions only; nothing is cancelled. |
| [x] | T-212 | **Booking rules and warnings.** `_slotIsBookable_` used by `clientBookSchedule` / `clientBookRecurring` ("Jam ini tidak tersedia."); auto-assign skips a coach on a day off; panel schedule writes return `warnings`; `RESCHEDULE_CUTOFF_HOURS` becomes a property (default 2) saved via `updateAppSettings({rescheduleCutoffHours})`. | Kode.gs, tests/settings.test.js, tests | T-210 | M | A client can't book inside a day off; the owner can, with a warning; changing the notice changes the refusal; default behavior unchanged. |
| [x] | T-213 | **Hours editor sheet** (7 rows, ranges, Libur, "Salin jam operasional") and the "Jam kerja & cuti" page. | Index.html, App.html, Theme.html | T-211, T-205 | M | At 360 px a row doesn't overflow (second range wraps); saved hours show again after reload. |
| [x] | T-214 | **Day-off sheet and clash list** with the **WA klien** button and **Buka jadwal**; shaded days off in the calendar. | App.html, Index.html | T-211 | M | Saving a day off over booked sessions lists them, each with a ready WhatsApp text; the calendar shows the shaded range. |
| [x] | T-215 | **One engine everywhere.** Landing `loadSlots`, portal `publicDayPanel`, and `_nearestFreeSlots_` call the engine; browser fallbacks kept until T-216 passes. Portal shows the reschedule notice. | LandingScript.html, App.html, Reminder.gs, tests | T-210 | M | The three screens show the same free hours for the same data (test and browser check). |
| [x] | T-216 | **Browser checks for E2**, then remove the old browser-side slot logic. | tools/browser-check.js, LandingScript.html, App.html | T-213…T-215 | S | Existing CoachAvailability checks still pass; new day-off and clash checks pass. |

## E3 — Coach hub

Requirements: CH-1…CH-7, CC-10 (birthday), CM-2. Built. Deviations: targets are saved by their own `saveCoachTargets` (not through `updateAppSettings`); the birth-date column is filled from the private-notes sheet in E4 (T-230), so `ulang-tahun` has no data until then; the dashboard blocks were already hidden in solo mode by T-204, so T-222 only needed the hub to exist; the profile card and "Tim coach" list stay as the Coach tab's card grid.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-220 | **`getCoachHub`** (today, stats, targets with pace, hours, days off) and `coachTargets` in `getAppSettings` / `updateAppSettings`. One definition of "session counts" (completed, by Completed At in WIB). | Kode.gs, tests/hub.test.js (new), tests/settings.test.js, tests/security.test.js | T-201 | L | Hub, dashboard and weekly report agree on the month's sessions; week and month boundaries are right; revenue equals `_revenueSummary_`; new clients come from the log; unset target = absent. |
| [x] | T-221 | **Hub layout** replacing `renderCoaches`: Hari ini rows with one-tap Selesai, targets block and sheet, stats line, profile card (Ubah; the Lihat seperti klien button is added by T-241), links to Jam kerja & cuti and Tim coach. Pull-to-refresh reloads the hub. | Index.html, App.html, Theme.html | T-220, T-205 | L | One scroll on a phone; rows ≥ 56 px, Selesai 44 × 44 px; Selesai completes exactly like the calendar's; empty states for no sessions and no targets. |
| [x] | T-222 | **Replace dashboard "Coach tersibuk" and "Performa coach"** with a link to the hub in solo mode; keep them in team mode. | App.html | T-221, T-204 | S | Solo dashboard has no coach ranking; team mode unchanged. |
| [x] | T-223 | **`ulang-tahun` and `ringkasan-owner`.** MemberData U "Tanggal Lahir" (client form field, `type="date"`), reminder job `ulang-tahun`; reminder job `ringkasan-owner` (owner Telegram on the 1st). Both off by default, in Pengaturan with test buttons. | Kode.gs, Reminder.gs, App.html, Index.html, tests/reminder.test.js | T-220 | M | Only today's birthdays get a button; the summary is sent once per month and retried on failure; nothing is sent while off. |
| [x] | T-224 | **Browser checks for E3** (hub with and without data, Selesai, targets sheet, solo dashboard). | tools/browser-check.js | T-221, T-222 | S | Passes at 360 and 390 px, both themes. |

## E4 — Client care

Requirements: CC-1…CC-9, CC-11, CM-3…CM-6. Built. Deviations: the optional body extras (body fat, chest, arm, hip) live on the `Assessments` row, not in `Progress` H–K (weight and waist still go to Progress as *coach* entries); there is no delete button for a fitness result in the panel yet (`deleteFitnessTest` exists); the birth date (`ulang-tahun`) is edited in the private-notes sheet.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-230 | **Private notes.** MemberData S "Perhatian", T "Catatan Privat" (V "Perhatian Ditunda"), `getClientCare` (first cut), `saveClientNotes`, `snoozeCare`. Key-list tests proving S–V stay out of `_memberPublicProfile_`, `getMembers`, `getMyProgress`, `getPublicSchedules`. | Kode.gs, tests/care.test.js (new), tests/security.test.js | T-201 | M | Notes round-trip; limits enforced; no leak path (tests). |
| [x] | T-231 | **Health screening.** `HealthScreening` sheet, `HEALTH_QUESTIONS`, `getMyHealthForm`, `submitMyHealthForm` (throttled, Telegram without answers), `markHealthReviewed`. | Kode.gs, tests, tests/security.test.js | T-230 | M | A new submission clears the review; Telegram text contains no answer (test); a member can't read another member's form. |
| [x] | T-232 | **Assessment, extras and fitness tests.** `Assessments`, Progress H–K, `FitnessTests`, `FITNESS_TESTS`, `saveAssessment` (optional weight/waist via the Progress path), `saveFitnessTests`, `deleteFitnessTest`, `getMyAssessment`. | Kode.gs, tests, tests/security.test.js | T-230 | M | Upsert per member, date and test; bounds enforced; `getMyAssessment` key list has no coach notes; heart rate improves downward. |
| [x] | T-233 | **Session briefing.** `getSessionBriefing` and the Briefing card at the top of `openScheduleDetail`. | Kode.gs, App.html, tests | T-230, T-232 | S | A flagged client's session shows the flag first; the card never blocks the rest of the sheet. |
| [x] | T-234 | **Client page sections** (panel): Catatan privat, Kesehatan (answers sheet, Sudah ditinjau, Kirim pengingat), Assessment & tes (assessment sheet, tests table, + Tes sheet). Loaded on demand, never cached. | Index.html, App.html, Theme.html | T-230…T-232 | L | Owner can fill a first assessment and a retest one-handed on a phone; decimal keypad for values; sheets are full height with sticky Simpan; nothing lands in `xnk_admin_cache`. |
| [x] | T-235 | **Portal health form** card and full-height sheet (Ya/Tidak segments, consent, sticky Kirim). | Index.html, App.html | T-231 | M | Keyboard never covers the focused field; the card disappears after submit. |
| [x] | T-236 | **Portal "Tes kebugaran" card** (first → latest, positive wording). | Index.html, App.html | T-232 | S | Heart rate "turun N bpm" reads as improvement; hidden until a test exists. |
| [x] | T-237 | **`tes-ulang` reminder** (Mondays 08:00, last test ≥ 28 days, off by default, template, preview, test button, per-client switch). | Reminder.gs, App.html, Index.html, tests/reminder.test.js | T-232 | M | Opted-out clients get no button; never-tested clients are skipped (they're in the care list). |
| [x] | T-238 | **Care list in the hub** (`care` in `getCoachHub`, reasons of Design §3.2, snooze). | Kode.gs, App.html, tests | T-220, T-230…T-232 | M | A client with two reasons appears once with both chips; a snoozed row returns after 7 days. |
| [x] | T-239 | **Browser checks for E4** (client page sections, sheets, briefing, portal health form with keyboard open, fitness card, care list). | tools/browser-check.js | T-233…T-238 | M | Passes at 360 and 390 px, both themes. |

## E5 — Portal coach page

Requirements: CP-6…CP-10.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | T-240 | **`getMyCoach`** (profile, status, three testimonials, reschedule notice) and the shared `renderCoachProfile`. `previewCoachProfile` for the panel. | Kode.gs, App.html, tests, tests/security.test.js | T-203, T-210 | M | Testimonials respect consent and anonymisation (test); the preview and the portal use the same renderer. |
| [x] | T-241 | **Portal Coach tab**: full profile page in solo mode, list + profile sheet in team mode; Chat and Booking buttons; **Lihat seperti klien** in the hub opens the same page. | App.html, Index.html, Theme.html | T-240, T-221 | M | At 360 px in both themes the page has no sideways scroll and Booking opens the booking sheet. |
| [x] | T-242 | **Browser checks for E5.** | tools/browser-check.js | T-241 | S | Passes. |
| [x] | T-243 | **Docs**: `apps-script/README.md` (Indonesian: Coach hub, jam kerja, form kesehatan, tes ulang, targets), root `README.md`, [../Agent.md](../Agent.md) §7 and this folder's Agent §6, tick the boxes. | docs | all above | S | Docs match the shipped UI. |

| [x] | T-244 | **Premium client coach page**: dark hero card with live status pill, KPI tiles (clients, sessions, rating from `getLandingStats`), nearest free slots from the slot engine, icon sections, testimonial cards with stars. Same renderer for the owner preview. | App.html, Theme.html, Kode.gs, tests/coach.test.js, tools/browser-check.js | T-241 | M | Portal Coach tab at 390 px has no sideways scroll, 44 px buttons, Chat WA still opens WhatsApp. (The sticky Booking bar was not built; the hero buttons are the call to action.) |
| [x] | T-245 | **Booking rules enforced on the server for clients**: one rule (`_slotProblem_`) refuses a past time, a time outside Jam Operasional, an hour no coach works or on a day off, and an hour that is already booked (also partly overlapping). Applies to `clientBookSchedule` (check + write under one lock), every date of `clientBookRecurring` (all or none) and the new time in `clientRescheduleSchedule`. The owner's own bookings only get warnings. | Kode.gs, tests/availability.test.js | T-212 | M | Tests prove each refusal and each allowed case. |

## Later

Not in this phase (PRD §10). Pick one up only after E1–E5 are stable and its design is written.

| | ID | Task |
| --- | --- | --- |
| [ ] | T-260 | No-show status ("Tidak hadir") with a rule for whether the session is used up; two in a row goes to the care list. |
| [ ] | T-261 | Buffer between sessions and recurring break blocks (lunch, Friday prayer) in the slot engine. |
| [ ] | T-262 | Workout templates attached to a session; the client sees them in the portal. |
| [ ] | T-263 | Client goal date with pace; off-pace clients in the care list. |
| [ ] | T-264 | Exercise log and personal bests, with "PR baru" celebrations. |
| [ ] | T-265 | Payment log (amount, method, "belum bayar") at renewal. |
| [ ] | T-266 | Client risk list (few sessions left, no booking, long gap). |
| [ ] | T-267 | Backup button: daily spreadsheet copy to Drive and "Cadangkan sekarang". |
| [ ] | T-268 | Referral codes. |
| [ ] | T-269 | Waiting list for full slots. |
| [ ] | T-270 | Trial follow-up message 24 h after a trial session. |
| [ ] | T-271 | Session notes ("apa yang dilatih", "fokus berikutnya") shown to the client and used in sesi-besok. |
| [ ] | T-272 | Substitute finder when a day off clashes with booked sessions. |
| [ ] | T-273 | Per-coach Telegram schedule (needed only with a team). |
| [ ] | T-274 | Workload view and smart auto-assign (team only). |
| [ ] | T-275 | Certificate expiry dates and a reminder 30 days before. |
| [ ] | T-276 | Read-only calendar link per coach (revocable; needs a security review). |
| [ ] | T-277 | Session feedback rating (private; public average only with 5+ ratings and owner opt-in). |
| [ ] | T-278 | Coach match quiz on the landing page or sign-up. |
| [ ] | T-279 | Change-coach request from the portal (team only). |
| [ ] | T-280 | "Coba trial dengan Coach X" booking button. |
| [ ] | T-281 | Intro video link on the profile (loads on tap). |
| [ ] | T-282 | Coach level badge (Head / Senior / Coach). |
| [ ] | T-283 | Performance and pay summary per coach (the `Members` log already stores coach columns). |
| [ ] | T-284 | Landing coach section built from the profile (decision D-13 says no for now). |
| [ ] | T-285 | Coach logins (decision D-11 says no; revisit only if the team grows). |
