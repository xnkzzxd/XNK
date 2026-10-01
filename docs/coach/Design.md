# Design — Phase E: the coach hub, coach profile and client care

How the requirements in [PRD.md](PRD.md) get built. Tasks are in [TODO.md](TODO.md); coding rules are in [Agent.md](Agent.md) and the main [../Agent.md](../Agent.md). Everything in [../Design.md](../Design.md) (system recap, security rules, phone rules in §8) still applies.

## 0. Where the code is today

`file:line` references are from 2026-10-01 and will drift; search by function name.

| Area | Today |
| --- | --- |
| Coach records | `getCoaches` (public), `addCoach`, `updateCoach`, `deleteCoach` in `Kode.gs` (~756–825). Sheet `Coaches`, 7 columns **read by position**: ID, Nama Coach, No WA, Spesialisasi, Foto URL, Bio, Pengalaman. No validation, no lock. `deleteCoach` deletes the row. |
| Coach photo | `uploadCoachPhoto` + `_getCoachPhotoFolder_` (`XNK_CoachPhotos`, link-shared on purpose, unlike progress photos). Old files are never removed. |
| Coach on other sheets | `MemberData` K "Coach ID" / L "Nama Coach"; `Schedules` I / J; `Members` log H / I (written, never read). Names are copies. |
| Unassigned | `_addScheduleInternal_` writes `coachName \|\| "Belum Ditugaskan"` (~1717); `saveCoachAssignment` in `App.html` (~2413) sends the same text; the daily email and `_coachMonthlyStats_` also use it. `Reminder.gs` ~801 builds "dengan Coach {name}" from it. |
| Availability | `getPublicAvailability` (~3834): reads `Coaches` and `CoachAvailability` (Coach ID, Hari, Jam Mulai, Jam Selesai), **creates the sheet when read**, uses the first rule per coach per day, 14 days, 1-hour slots. No UI writes the sheet. No days off. |
| Free-slot math (3 copies) | `computeOpenSlots` in `LandingScript.html` (~686); `publicDayPanel` in `App.html` (~2274); `_nearestFreeSlots_` in `Reminder.gs` (~1032). Each uses the number of `Coaches` rows as capacity, or assumes one coach. |
| Stats | `coachStats` (`App.html` ~3269: booked sessions by *start* date) vs `_coachMonthlyStats_` (`Kode.gs` ~3579: completed sessions by *Completed At*). `getCoachMonthlyStats` has no UI. |
| Panel Coach tab | `NAV.admin` item `coaches`; `renderCoaches`, `openCoachProfile`, `#modal-add-coach`, crop flow (`cropContext='coach'`). Dashboard: `renderLeaderboard`, `renderMonthlyStats`. Session detail `openScheduleDetail` has the coach dropdown and "Chat coach". |
| Portal Coach tab | `NAV.public` item `public-coaches`; `renderPublicCoaches`, `contactPublicCoach`. `coachContactNumber()` falls back to the first coach in the list. |
| Reschedule rule | `RESCHEDULE_CUTOFF_HOURS = 2` (`Kode.gs` ~1947), used by `clientRescheduleSchedule`. |
| Columns still free | `MemberData` is used through R (Q "Badge Terlihat", R "Badge Diselamati"); `Progress` A–G. |

Reusable pieces:

| Piece | Reuse for |
| --- | --- |
| `_priceListSchema_` / `_ensurePriceListSchema_` | Header-mapped `Coaches` schema and idempotent migration. |
| `getOrCreateSheet_(name, headers)`, `LockService.getScriptLock()` | New sheets and every read-then-write. |
| `_completedWeeks_`, `_streak_`, `_bestStreak_` | The coach's own weekly streak. |
| `_revenueSummary_`, the `Members` log (type "Baru") | Revenue and new-client targets. |
| `REMINDER_JOBS`, `_dueJobs_`, `kirimTelegramTombol_`, `kirimNotifTelegram_`, `_waLink_`, MemberData column P opt-outs, `SET_RMD_JOBS` | New reminder types. |
| `_checkImageUpload_`, `openCropModal` | Profile photo. |
| `openSheet`, `openDetail`, `navigate`, `showConfirmModal`, `busy`, `emptyState`, `avatar`, `h()`, `icon()` | All new UI (the back stack comes for free). |
| Benefit chip input in the package editor | Certification and achievement chips. |
| Progress sheet and `saveMemberMeasurement` | Starting weight and waist. |
| `_readEvaluasiRows_` consent logic in `getPublicTestimonials` | Profile testimonials. |

## 1. Data

All sheet changes **append** columns or add sheets. Nothing is reordered or deleted. Reads never create sheets (the current `getPublicAvailability` side effect goes away). Dates are `YYYY-MM-DD` in WIB, hours are integers 0–24, and date and time columns are Plain Text.

### 1.1 `Coaches`

Read by **header name** (`_coachSchema_(headerRow)` returns column indexes; `_ensureCoachSchema_()` appends any missing header, under the script lock, idempotent). The first seven stay where they are.

| Col | Header | Notes |
| --- | --- | --- |
| A–G | ID, Nama Coach, No WA, Spesialisasi, Foto URL, Bio, Pengalaman | Unchanged. ID stays `COACH-<ms>`. |
| H | Status Aktif | `TRUE` / `FALSE`; **empty = active**, so old rows keep working. |
| I | Headline | Max 80. |
| J | Sertifikasi | List joined with `, `. Each item 1–60 chars, no comma, max 10. |
| K | Prestasi | Same list rules. |
| L | Lokasi | Max 60. |
| M | Instagram | Handle without `@` or a URL, stored as a handle, max 30. |
| N | Foto File ID | Drive file ID of the current photo, so the old file can be trashed. |

Specialty (D) is read as a list as well (`, ` separated, max 8 items) for the profile chips; the stored text is unchanged.

### 1.2 `CoachAvailability` (exists) and `CoachTimeOff` (new)

`CoachAvailability`: `Coach ID`, `Hari`, `Jam Mulai`, `Jam Selesai`. **Several rows per coach per day are allowed** (the first-rule-only bug goes away). `Hari` stays the lowercase Indonesian name (`minggu`…`sabtu`). Hours are written as `HH:00` text. A day with no rows is a **Libur** day *once the coach has any rows at all*; a coach with no rows follows the studio's opening hours (PRD CA-4).

`CoachTimeOff`:

| Col | Header | Notes |
| --- | --- | --- |
| A | ID | `OFF-<ms>-<rand>` |
| B | Coach ID | |
| C | Mulai | `YYYY-MM-DD`, first day |
| D | Selesai | `YYYY-MM-DD`, last day, inclusive, ≥ Mulai |
| E | Jam Mulai | empty = all day |
| F | Jam Selesai | empty = all day; both or neither |
| G | Catatan | Admin only, max 100. Never in a public response. |
| H | Dibuat Pada | ISO time |

### 1.3 Client care

| Where | Column / sheet | Notes |
| --- | --- | --- |
| `MemberData` | **S "Perhatian"** | Flag, max 80. |
| `MemberData` | **T "Catatan Privat"** | Free text, max 2000. |
| `MemberData` | **U "Tanggal Lahir"** | `YYYY-MM-DD`, optional (birthday message). |
| `MemberData` | **V "Perhatian Ditunda"** | `YYYY-MM-DD` until which the care row is hidden (CC-11). |
| `Progress` | **H "Lemak Tubuh (%)"**, **I "Dada"**, **J "Lengan"**, **K "Pinggul"** (cm) | Optional extras, coach entries only. |

`Assessments` (new): `ID` (`ASM-…`), `Member ID`, `Tanggal`, `Tujuan Utama`, `Riwayat Latihan`, `Preferensi Jadwal`, `Motivasi`, `Catatan Coach`, `Diubah Pada`. The latest row per member is current; older rows are history.

`FitnessTests` (long format): `ID` (`FIT-…`), `Member ID`, `Tanggal`, `Tes`, `Nilai` (number), `Dicatat Oleh` (always `coach` for now), `Diubah Pada`. One row per member, date and test; saving the same combination again updates it.

`FITNESS_TESTS` (server constant, sent with the care data):

| id | Label | Unit | Better |
| --- | --- | --- | --- |
| `pushup` | Push-up | kali / 1 menit | higher |
| `plank` | Plank | detik | higher |
| `squat` | Squat | kali / 1 menit | higher |
| `sit-reach` | Sit and reach | cm | higher |
| `nadi-istirahat` | Detak jantung istirahat | bpm | lower |

`HealthScreening` (new): `ID` (`KES-…`), `Member ID`, `Tanggal`, `Q1`…`Q7` (`ya` / `tidak`), `Cedera/Operasi`, `Obat Rutin`, `Kondisi Lain`, `Persetujuan` (`ya`), `Ditinjau Pada`, `Catatan Coach`, `Dibuat Pada`. The latest row per member is current. A new submission is a new row, so its `Ditinjau Pada` is empty (review cleared). The seven questions are a server constant `HEALTH_QUESTIONS` (Indonesian PAR-Q wording, owner may edit the text in code review, not at runtime).

### 1.4 Script Properties

| Key | Default | Meaning |
| --- | --- | --- |
| `COACH_SELF_ID` | empty | "Ini saya". Empty = first active coach by sheet order. Deleted or inactive IDs are ignored. |
| `COACH_TARGET_SESI`, `COACH_TARGET_KLIEN_AKTIF`, `COACH_TARGET_PENDAPATAN`, `COACH_TARGET_KLIEN_BARU` | empty | Monthly targets. Empty = not shown. Saved through `updateAppSettings({coachTargets})`; an empty value deletes the property (main Agent §4). |
| `RESCHEDULE_CUTOFF_HOURS` | 2 | Replaces the constant; the constant becomes the default. Bounds 0–72. |
| `RMD_TES_ULANG_ENABLED` / `_HOUR`, `RMD_ULANG_TAHUN_ENABLED` / `_HOUR`, `RMD_RINGKASAN_OWNER_ENABLED` / `_HOUR`, `RMD_TPL_<JENIS>` | off, per job | Standard reminder-job keys (§3.6). |

## 2. Server API

Guards follow main Agent rule 3. Every name goes into the right list in `tests/security.test.js`.

### 2.1 Public (no token)

| Function | Does |
| --- | --- |
| `getCoaches()` | **Active** coaches only, ordered, each passed through `_publicCoach_` (whitelist, CP-5). Never creates a sheet. |
| `getOpenSlots(opts)` | `{from?, days?}` → per day: `{date, hours: [{hour, free}], closed}`. Uses `_freeSlots_` with saved hours and days off. The browser never sees who is booked or why a day is off. |
| `getPublicAvailability()` | Kept for old callers; becomes an adapter over `_freeSlots_` with the same output shape. |
| `getCoachStatus()` | `{state: 'sesi' \| 'tersedia' \| 'cuti' \| 'libur' \| 'tutup', next?: 'HH:MM', until?: 'YYYY-MM-DD'}` for the self coach. No notes. |

### 2.2 Admin (`requireAdmin_(token)` first)

| Function | Does |
| --- | --- |
| `getCoachesAdmin(token)` | All coaches (active and inactive) with every field, `usage: {sessions, clients, logEntries}`, `isSelf`, and `solo` (bool). Replaces `getCoaches` in the panel's `loadAllData`. |
| `saveCoach(token, data)` | Create (no `data.id`) or update. Validates (§2.5), normalises the phone, writes under the lock, runs `_ensureCoachSchema_`, propagates a rename (§2.4), trashes the previous photo when `fotoFileId` changed. `addCoach` / `updateCoach` delegate to it so old callers keep working. |
| `setCoachActive(token, id, aktif)` | Toggles H. Refuses to deactivate the **last** active coach ("Harus ada satu coach aktif."). |
| `deleteCoach(token, id)` | Only when `usage` is all zero, else `Coach dipakai N jadwal / M klien. Nonaktifkan saja.` |
| `setSelfCoach(token, id)` | Writes `COACH_SELF_ID`; the coach must be active. |
| `assignUnassignedToSelf(token, {dryRun})` | Sets the self coach on every session and client with an empty coach ID that is not completed. `dryRun` returns counts only. Under the lock. |
| `saveCoachAvailability(token, coachId, week)` | `week` = `{minggu: [[6,10],[16,20]], senin: [...], …}`. Replaces that coach's rows. Validates ranges (inside opening hours, start < end, no overlap). An empty `week` removes all rows (back to studio hours). |
| `addCoachTimeOff(token, data)` / `deleteCoachTimeOff(token, id)` | Both return `{id?, clashes: [{scheduleId, memberName, start, end}]}` (booked, not completed sessions inside the range). Nothing is cancelled. |
| `getCoachHub(token)` | One round trip for the hub: `{self, status, today: [...], stats, targets, care: [...], hours, timeOff, solo}` (§3.1). |
| `getClientCare(token, memberId)` | `{flag, notes, birthDate, snoozedUntil, assessment, assessmentHistory, health: {latest, reviewed}, tests: {byTest}, extras, tests_list: FITNESS_TESTS}`. Loaded on demand when the client page opens its care sections. |
| `saveClientNotes(token, memberId, {flag, notes, birthDate})` | Validates lengths and the date; writes S, T, U. |
| `snoozeCare(token, memberId, days)` | Writes V (CC-11). |
| `saveAssessment(token, memberId, data)` | Appends a row. Optional `weight` / `waist` also call the existing `saveMemberMeasurement` path (marked *coach*); optional extras write Progress H–K on today's row. |
| `saveFitnessTests(token, memberId, {tanggal, values: {pushup: 24, …}})` / `deleteFitnessTest(token, id)` | Upsert per member, date and test. Value bounds per test (§2.5). |
| `markHealthReviewed(token, memberId, note)` | Sets `Ditinjau Pada` and `Catatan Coach` on the latest row. |
| `getSessionBriefing(token, scheduleId)` | `{flag, notes, goal, lastTest, healthReviewed}` for the session's client. Called when the session detail opens; **never** cached. |
| `previewCoachProfile(token)` | Returns the same object the portal profile page renders (CP-6), so the preview can't drift. |

Targets and the reschedule notice are saved through the existing `updateAppSettings` (partial payload: `coachTargets`, `rescheduleCutoffHours`) and returned by `getAppSettings`.

### 2.3 Member (`requireMember_(memberToken)` first statement; member ID from the token only)

| Function | Does |
| --- | --- |
| `getMyHealthForm(memberToken)` | `{questions: HEALTH_QUESTIONS, done: bool, date}`. Never returns the answers. |
| `submitMyHealthForm(memberToken, answers)` | Validates every question answered and the consent tick; appends a row; Telegram "🩺 Budi mengisi form kesehatan, perlu ditinjau" (**no answers**); throttled to one submission per member per minute. |
| `getMyAssessment(memberToken)` | `{goal, schedulePref, tests: [{id, label, unit, first, latest, change, better}]}`. **No** coach notes, flag, health answers or extras. |
| `getMyCoach(memberToken)` | The profile for the "Coach kamu" page: `_publicCoach_` of the self coach, `status` (from `getCoachStatus`), `testimonials` (from the consented evaluations, §4.2), `rescheduleCutoffHours`. |

`getMyProgress` and `_memberPublicProfile_` do **not** change and must not gain S–V (a test compares their key lists).

### 2.4 Changes to existing functions

| Function | Change |
| --- | --- |
| `_addScheduleInternal_` | Unassigned = `''` / `''`. In solo mode, no explicit coach → self coach. Otherwise the client's preferred coach, **if active and not on a day off**. Returns `warnings: []` for panel callers (outside hours; day off). |
| `clientBookSchedule`, `clientBookRecurring` | Validate the slot with `_slotIsBookable_` (hours, days off, capacity) and refuse with "Jam ini tidak tersedia." Unchanged otherwise. |
| `clientRescheduleSchedule` | Reads `RESCHEDULE_CUTOFF_HOURS` from the property (default 2) instead of the constant. Same message. |
| `updateScheduleCoach` | Takes the coach ID; derives the name on the server; `''` clears both. The browser's name argument is ignored. |
| Daily email, `_coachMonthlyStats_` | Read an empty coach as "tanpa coach" without storing it. Rows already saying "Belum Ditugaskan" are treated as empty on read (CS-1). |
| `getPublicSchedules` | Output keys unchanged (`start, end, status, coachId, coachName`). |
| `_nearestFreeSlots_` (Reminder.gs) | Calls the engine (`_freeSlots_`) instead of its own check. |

**Rename propagation (CP-3).** `saveCoach` with a changed name rewrites `Nama Coach` on `MemberData` (K = the coach's ID) and on `Schedules` rows with that coach whose status is not `completed`, in one pass under the lock. Completed rows and `Members` log rows keep their names.

### 2.5 Validation (Indonesian sentences ending with a period)

| Field | Rule |
| --- | --- |
| Name | 1–60 chars. |
| WhatsApp | Digits only after normalising (`08…` → `628…`), 10–15 digits. Not empty. |
| Headline | ≤ 80. Specialty list ≤ 8 items of ≤ 40. Experience ≤ 40. Bio ≤ 600. Location ≤ 60. |
| Certifications, achievements | ≤ 10 items, each 1–60 chars, no comma. |
| Instagram | `[A-Za-z0-9._]{1,30}` after stripping `@` and URL parts. |
| Hours range | Integers, start < end, inside the studio's hours for that weekday, no overlap. |
| Day off | Valid dates, Mulai ≤ Selesai, at most 120 days long, both hours or neither, hours start < end. |
| Flag | ≤ 80. Notes ≤ 2000. Birth date a real past date. |
| Test values | `pushup` 0–300, `plank` 0–3600, `squat` 0–300, `sit-reach` −40–80, `nadi-istirahat` 30–220. Decimal comma accepted in the browser, stored as a number. |
| Targets | Sessions 1–500, clients 1–200, revenue 0–1.000.000.000, new clients 1–100. |
| Reschedule notice | Integer 0–72. |

### 2.6 Slot engine

```js
// Pure; no SpreadsheetApp calls. Easy to test.
_freeSlots_({
  businessHours,   // {0:[6,12], 1:[6,21], …} from _businessHours_()
  coaches,         // active coaches [{id}]
  rules,           // CoachAvailability rows [{coachId, hari, startHour, endHour}]
  timeOff,         // CoachTimeOff rows [{coachId, from, to, hourFrom, hourTo}]
  bookings,        // schedules not 'available' [{start, end, coachId}]
  from, days, now  // WIB date string, count, Date
}) → [{ date, closed, hours: [{ hour, free }] }]
```

Rules, in order, per date and hour (WIB through `_wibParts_`):

1. The hour is inside the **studio's** opening hours, else not offered.
2. A coach is **available** for the hour if (a) they have no rules at all (follow the studio) or one of their ranges covers the hour, and (b) no day off covers it.
3. A booking **uses** an hour for its coach; a booking with no coach uses one unit of the shared capacity, as the landing page does today.
4. `free` = (number of available coaches) − (their bookings in that hour) − (unassigned bookings in that hour), never below 0. Past hours are not free.

With one coach and no rules this equals today's behavior. Hours stay whole numbers (a 1-hour slot grid, as today). `getOpenSlots`, `getPublicAvailability`, `_nearestFreeSlots_`, `_slotIsBookable_` and the panel's warnings all call this one function. The portal and landing keep their old browser-side logic as a **fallback** if `getOpenSlots` fails, until E2's browser checks pass and the fallback is removed in a later cleanup.

### 2.7 Coach hub payload

`getCoachHub` computes, from one read of `Schedules`, `MemberData`, `Members` and `Progress`/`FitnessTests`/`HealthScreening`:

- `today`: sessions on today's WIB date, not cancelled, in time order: `{id, memberId, memberName, start, end, status, flag, lastFocus}`. `lastFocus` is the client's latest assessment goal (session notes are Later).
- `stats`: `{weekSessions, weekHours, monthSessions, monthHours, activeClients, streak}`. A session counts when `status === 'completed'`, bucketed by the WIB date of `Completed At` (fallback: start time for old rows without it). Hours = sum of durations. `activeClients` = clients with sessions left (`Total Sesi` > `Sesi Terpakai`). `streak` = `_streak_` over completed weeks of all sessions of the coach.
- `targets`: for each set target `{key, goal, actual, pace}`. `pace` = `ceil(goal × dayOfMonth / daysInMonth)`; the line says "Di jalur" when `actual ≥ pace`, else "Kurang N dari jalur". Revenue uses `_revenueSummary_` for the current month; new clients count `Members` rows with type "Baru" and a date in the current month.
- `care`: see §3.2.

Everything is computed on the server so the browser doesn't need other clients' data.

## 3. Panel UI (phone first)

Breakpoint 768 px (`.only-mobile` / `.only-desktop`). Components come from `Theme.html` (`.card`, `.card-flat`, `.kv`, `.pill`, `.group-label`, `.toggle`, `.btn*`, `.field`, `.sheet`). New CSS only where noted. No hard-coded colors; errors use weight and icon, not red (main Design §1.5).

### 3.1 Coach hub (the Coach tab)

`renderCoaches` becomes `renderCoachHub`. The view id stays `view-coaches` so the tab bar, `navigate('coaches')` and `refreshAll` keep working. The page title is "Coach". In team mode (2+ active coaches) the hub keeps the same blocks for **the self coach**, and "Tim coach" (below) lists everyone.

```
┌ Coach ───────────────────────┐
│ Hari ini · Kamis 1 Okt       │
│ ┌──────────────────────────┐ │
│ │ 07:00  Budi        ⚠  [✓]│ │   ← row ≥ 56 px, ✓ = Selesai (44 px)
│ │ 08:00  Sari           [✓]│ │
│ │ 16:00  Andi  (selesai)   │ │
│ └──────────────────────────┘ │
│ Perlu perhatian · 3          │
│  Budi   [Form belum ditinjau]│
│  Rina   [Tes ulang]          │
│  Dito   [14 hari tanpa sesi] │
│ Target bulan ini     [Ubah]  │
│  Sesi   ▓▓▓▓▓░░░  31 / 80    │
│  Di jalur (hari ke-12 / 31)  │
│  Klien aktif  12 / 15        │
│ Minggu ini 9 sesi · 9 jam    │
│ 🔥 6 minggu · bulan ini 31   │
│ ┌ Profil ───────────────────┐│
│ │ (foto) Coach Jizdan       ││
│ │ ● Tersedia 16:00          ││
│ │ [Ubah] [Lihat seperti klien]
│ └───────────────────────────┘│
│ Jam kerja & cuti          ›  │
│ Tim coach                 ›  │
└──────────────────────────────┘
```

- **Hari ini** rows open the session detail (which has the briefing, §3.3). The ✓ button calls the existing `completeSession` with the same confirmation behavior as the calendar; when a session has already been completed, the row is dimmed and the button is gone. The empty state reads "Tidak ada sesi hari ini."
- **Perlu perhatian** is `care` from `getCoachHub`, sorted by urgency (flagged client training today, health not reviewed, retest due, no assessment, no health form, long gap). Each row shows up to two chips; "Nanti" in the ⋯ menu calls `snoozeCare`. Zero rows → the block says "Semua klien beres." and is a single line.
- **Target** block is hidden when no target is set; "Ubah" opens the targets sheet.
- **Profile card**: avatar, name, status chip, **Ubah** (opens the profile editor sheet), **Lihat seperti klien** (opens the portal profile renderer in a sheet, §4.1).
- **Jam kerja & cuti** opens a page (via `openDetail`) with two groups: the weekly hours rows (summary text, Ubah) and the days-off list (+ Tambah cuti).
- **Tim coach** opens a list: every coach (active first), "Ini saya" marker, active toggle, ⋯ (Ubah, Jadikan saya, Nonaktifkan / Aktifkan, Hapus when unused) and **+ Coach**. In solo mode this is the only place that mentions teams.

Data: `getCoachHub` loads when the view opens and on pull-to-refresh (`refreshAll`). It is **not** part of `xnk_admin_cache`.

### 3.2 The care list

Computed on the server in `getCoachHub`, for active clients (sessions left or a session in the last 30 days):

| Reason code | Chip | When |
| --- | --- | --- |
| `flag-today` | "Perhatian hari ini" | The client has a flag and a session today. |
| `health-review` | "Form belum ditinjau" | Latest health row exists and `Ditinjau Pada` is empty. |
| `retest` | "Tes ulang" | Last fitness test ≥ 28 days ago. |
| `no-assessment` | "Belum ada assessment" | No `Assessments` row and the client joined ≥ 3 days ago. |
| `no-health` | "Belum isi form" | No health row and the client joined ≥ 3 days ago. |
| `gap` | "14 hari tanpa sesi" | Active client with no session in the last 14 days. |

Rows with `Perhatian Ditunda` ≥ today are left out. A client appears once with up to three chips.

### 3.3 Session detail: briefing

`openScheduleDetail` gets a **Briefing** card at the very top, filled by `getSessionBriefing` after the sheet opens (the card shows a skeleton line meanwhile and never blocks the rest). It shows the flag in weight and an alert icon, the first 3 lines of notes, "Tujuan: …", the last fitness result, and "Form kesehatan belum ditinjau" when relevant. A client with nothing to show gets no card.

In solo mode the coach dropdown and "Simpan" under it are hidden; "Chat coach" is hidden.

### 3.4 Sheets

All are full-height bottom sheets on phones (`openSheet`) with a sticky footer (main Design §8.1). On desktop they are the usual dialogs.

**Profile editor** (replaces `#modal-add-coach`): photo (existing crop flow), name, WhatsApp (`type="tel"`), headline, specialties (chip input), experience, bio (textarea, counter), certifications and achievements (chip inputs, the package editor's benefit control), location, Instagram. Saving calls `saveCoach`; the photo upload keeps `uploadCoachPhoto` and passes the returned file ID.

**Hours editor**:

```
┌ ─────  Jam kerja               ✕ ┐
│ Salin jam operasional            │
│ Senin     [06]–[10]  [16]–[20] + │
│ Selasa    [06]–[10]            + │
│ Rabu      Libur            [on]  │
│ …                                │
│▓ [        Simpan jam kerja     ]▓│
└──────────────────────────────────┘
```

One row per day, ranges as two numeric fields, "+" adds a range (max 3), a Libur toggle clears the day. Validation mirrors §2.5 and shows under the row. A saved empty week means "ikut jam operasional" and says so in the hint.

**Day-off sheet**: two `type="date"` fields, a "Seharian" toggle, from–to hour fields when it is off, and a note. After saving, if `clashes` is not empty the sheet switches to a list: each clash shows the client, the time, **WA klien** (a `wa.me` button with the text "Hai {nama}, mohon maaf sesi {hari} jam {jam} perlu dipindah karena coach berhalangan. Boleh kita atur ulang?") and **Buka jadwal**. Nothing is cancelled.

**Targets sheet**: four numeric fields (placeholder "Tidak diatur"), each with a "Hapus" link; saved through `updateAppSettings({coachTargets})`.

**Client page sections** (the existing `openProfile`): three new groups after "Progres", each loaded by `getClientCare` when the page opens and **kept out of the client list cache**:

- **Catatan privat**: flag chip, notes text, Ubah (sheet with flag and notes) and the birth date field.
- **Kesehatan**: latest submission date and a summary ("Ada cedera / obat" or "Tidak ada catatan"), **Lihat jawaban** (opens a sheet with the answers), **Sudah ditinjau** with a note. When nothing is submitted: "Belum diisi" and a **Kirim pengingat** button (`wa.me` with the portal link).
- **Assessment & tes**: assessment summary with **Isi / Ubah** (sheet: goal, history, schedule preference, motivation, notes, optional weight and waist, optional extras), and a tests table (first, latest, change) with **+ Tes** (sheet: date, one decimal field per test, any may be empty; decimal keypad).

**Solo-mode hiding** (CS-4), by element:

| Element | Solo | Team |
| --- | --- | --- |
| Client forms: "Coach utama" | hidden; saves the self coach | shown |
| Session detail: coach dropdown, "Chat coach" | hidden | shown |
| Calendar coach filter and "· coachName" in event titles | hidden | shown |
| Dashboard "Coach tersibuk", "Performa coach" | replaced by a link to the hub | shown |
| Session rows: "Belum ada coach" | never shown | shown |
| Coach tab | hub | hub + Tim coach |

`window.isSoloCoach()` (new, in `App.html`) reads `solo` from the last `getCoachesAdmin` / `getCoachHub` response; everything above calls it.

## 4. Portal UI

### 4.1 Coach profile page (`public-coaches`)

`renderPublicCoaches` calls `renderCoachProfile(coach, opts)`, the same function the panel's **Lihat seperti klien** uses. Solo mode shows it full page; team mode shows the list, and a tap opens the same profile in a sheet.

```
┌ Coach ───────────────────────┐
│   (foto, round, 96 px)       │
│   Coach Jizdan               │
│   Fat loss & strength        │  ← headline
│   ● Tersedia 16:00           │  ← status chip
│ [Chat WA]  [Booking]         │
│ Tentang                      │
│  bio…                        │
│ Spesialisasi  (chip)(chip)   │
│ Sertifikasi                  │
│  • Pelatih Pencak Silat      │
│ Prestasi                     │
│ Lokasi   Banjarnegara  [IG]  │
│ Kata klien                   │
│  “…” — Rina                  │
│ Ganti jadwal: minimal 2 jam  │
│ sebelumnya                   │
└──────────────────────────────┘
```

Chat opens `wa.me` with the existing "Halo Coach …" text; Booking opens the booking sheet. The reschedule line comes from `getMyCoach.rescheduleCutoffHours` and is shown only for logged-in clients.

### 4.2 Testimonials

`getMyCoach` and the preview reuse the same evaluation rows and consent rules as `getPublicTestimonials` (consent starting with "Ya", anonymised names masked), limited to the 3 most recent. The preview in the panel shows the same three.

### 4.3 Health form and fitness card (portal home)

Two cards are added below the existing ones (after "Progres"):

- **Lengkapi form kesehatan** (only until a form exists): one sentence on why, **Isi sekarang** opens a full-height sheet with the seven questions as Ya/Tidak segments (44 px each), three text fields, a consent tick and a sticky **Kirim**. On submit the card disappears and a toast says "Terima kasih, coach akan membacanya."
- **Tes kebugaran** (only when at least one test exists): one row per test with first → latest and a plain change ("+6 kali sejak 1 Sep"), positive wording; for heart rate "turun 4 bpm" counts as improvement.

### 4.4 Booking and slots

`publicDayPanel` calls `getOpenSlots` and uses `free > 0` as "open"; in solo mode the coach filter is hidden. If the call fails it falls back to the old browser-side calculation. Booking calls `clientBookSchedule`, which re-checks on the server (CA-5).

## 5. Landing page

**Only slots change.** `loadSlots` in `LandingScript.html` calls `getOpenSlots` and falls back to `computeOpenSlots` on error. The coach section, copy, photo and `wa.me` numbers stay hand-written (D-13). `getCoaches` still feeds nothing there except the fallback's capacity count.

## 6. Reminder types

Same engine as Phase C/D. Each is a `REMINDER_JOBS` entry with `defaultEnabled: false`, so it appears in Pengaturan → Pengingat Klien through `SET_RMD_JOBS` with an on/off switch, an hour, a template with preview and a test button, and a per-client switch on the client page.

| jenis | When (default) | Who gets a button | Button | Placeholders |
| --- | --- | --- | --- | --- |
| `tes-ulang` | Mondays 08:00 | Active clients whose last fitness test is ≥ 28 days old (not never-tested; those are in the care list) | `Budi · tes ulang` | `{nama} {terakhir} {link}` |
| `ulang-tahun` | Daily 08:00 | Clients whose birth day and month are today | `Budi · ulang tahun` | `{nama}` |
| `ringkasan-owner` | Day 1 of the month 09:00 | **The owner** (a single Telegram message, no client buttons) | n/a | n/a (not editable) |

- `tes-ulang` default text: "Hai {nama}, sudah sebulan sejak tes kebugaranmu ({terakhir}). Yuk tes ulang di sesi berikutnya, biar kelihatan kemajuanmu. {link}".
- `ringkasan-owner` is a plain owner report through `kirimNotifTelegram_` (header "📊 Ringkasan {bulan}": sessions and hours, new clients, revenue estimate, each set target and its result). It skips quietly when there is nothing to report and has no template.
- Per-client opt-out for the first two uses MemberData column P like the other types.
- `{link}` is the portal URL, as in Phase D.

## 7. Security

- New admin functions: `getCoachesAdmin`, `saveCoach`, `setCoachActive`, `setSelfCoach`, `assignUnassignedToSelf`, `saveCoachAvailability`, `addCoachTimeOff`, `deleteCoachTimeOff`, `getCoachHub`, `getClientCare`, `saveClientNotes`, `snoozeCare`, `saveAssessment`, `saveFitnessTests`, `deleteFitnessTest`, `markHealthReviewed`, `getSessionBriefing`, `previewCoachProfile`. Existing: `deleteCoach`, `addCoach`, `updateCoach`.
- New member functions: `getMyHealthForm`, `submitMyHealthForm`, `getMyAssessment`, `getMyCoach` (member ID from the token only).
- New public functions: `getOpenSlots`, `getCoachStatus` (and the changed `getCoaches`, `getPublicAvailability`).
- Add each name to ADMIN / MEMBER / PUBLIC in `tests/security.test.js`. The existing loops then prove they reject missing, bogus and cross-role tokens.
- **Health data, flags, notes, assessments, fitness extras and day-off reasons** appear only in admin responses (and the member's own `getMyAssessment` subset). They are not in `_memberPublicProfile_`, `getMembers`, `getPublicSchedules`, `getMyProgress`, `xnk_admin_cache`, Telegram, email, logs or error messages. A test asserts exact key lists for each public or shared response.
- `submitMyHealthForm` stores answers in a sheet only the owner's account can read; the Telegram notice names the client and nothing else.
- Coach photos stay link-shared (intentional, they are public marketing images). Progress photos' rules (main Agent 7b) are unchanged.
- `getCoaches` no longer returns inactive coaches or unlisted fields (CP-5). Its WhatsApp number was already public.
- Throttles: `submitMyHealthForm` one per member per minute; nothing else new is member-writable.

## 8. Phone specifics

Everything in main Design §8.1 applies. Additional rules:

- **Hub** is one scroll. Sticky header is the app's own; no extra sticky bars.
- **Hari ini rows** are 56 px minimum, the Selesai button 44 × 44 px, 8 px from the row's own tap area so a row tap and a Selesai tap can't be confused.
- **Chip inputs** (specialties, certifications, achievements) wrap onto lines; the add field is 16 px; Enter adds a chip; each chip's × is a 44 px target via padding.
- **Hours editor** rows: day name 72 px, two number fields 56 px each with a dash, "+" 44 px. Under 400 px the second range wraps to its own line.
- **Health form**: one question per block, Ya/Tidak as a two-button segment, large text, the focused text field scrolls into view above the keyboard.
- **Test values** use `inputmode="decimal"`; the browser accepts a comma and sends a number.
- **Back stack**: hub → hours page → hours sheet; client page → care sheet. All through `openDetail` / `openSheet`, so the back gesture works (main Agent §7). Do not add `pushState` of your own.
- **Motion**: none new. Status chips don't animate.

## 9. Testing

Node tests in `apps-script/pt-scheduler/tests/` with the existing harness (`env.props`, `env.fetches`, `seededEnv()`; fixtures get a second, inactive coach and a day-off row):

| File | Covers |
| --- | --- |
| `coach.test.js` (new) | Header-mapped `Coaches` read and migration idempotent; legacy 7-column row stays active; validation per field; rename propagates to non-completed rows only; photo trashing; delete blocked when used; last active coach can't be deactivated; `assignUnassignedToSelf` dry run and apply; "Belum Ditugaskan" read as empty; `getCoaches` key whitelist; solo detection; auto-assign to self; inactive coach never auto-assigned. |
| `availability.test.js` (new) | `_freeSlots_`: no rules = studio hours; two ranges per day; Libur day; all-day and hourly day off; unassigned booking uses shared capacity; past hours; DST-free WIB; the three callers return the same hours for the same data; `getPublicAvailability` shape unchanged; bookings inside a day off refused for clients, warned for the owner; clashes listed. |
| `care.test.js` (new) | Notes, flag and birth date limits; briefing content; health submit (no answers in Telegram, review cleared by a new submission, throttle); assessment writes optional Progress row; fitness upsert and bounds; `getMyAssessment` key list (no notes); care list reasons, snooze and dedupe; `getMyProgress` and `_memberPublicProfile_` key lists unchanged. |
| `hub.test.js` (new) | `getCoachHub` stats use Completed At in WIB; week and month boundaries; targets, pace text and hidden when unset; new clients from the log; revenue matches `_revenueSummary_`. |
| `reminder.test.js` (extend) | The T-200 regression ("dengan Coach" absent when unassigned); `tes-ulang` (28-day rule, opt-out, never-tested skipped); `ulang-tahun`; `ringkasan-owner` once per month. |
| `security.test.js` (extend) | All new names classified. |
| `settings.test.js` (extend) | `coachTargets` and `rescheduleCutoffHours` partial saves, validation, empty deletes the property. |

`tools/browser-check.js` gets a phone pass (390 × 844, touch, both themes) and a desktop pass for: the hub (with and without targets, with and without sessions today), Selesai from Hari ini, the profile editor, hours editor, day-off sheet with clashes, targets sheet, the client page care sections, the briefing, the portal profile page, the health form with the keyboard open, the fitness card, solo-mode hiding, and team mode after adding a second coach. Checks stay the same as main Design §8.5 (no overflow, 44 px targets, back returns one level).

## 10. Rollout

1. **Back up the spreadsheet** (File → Make a copy) before the first deploy of E1.
2. Deploy E1. In Coach → Tim coach: open the former coach and **Nonaktifkan**, mark yourself **Ini saya**, then tap **Tetapkan jadwal tanpa coach ke saya** (check the counts first).
3. Fill in the profile (headline, certifications, achievements, location). Use **Lihat seperti klien**.
4. E2: save your weekly hours and any days off. Compare the landing page's free hours with the calendar for a week.
5. E3: set the targets you want. Turn on `ringkasan-owner` if you want the monthly message.
6. E4: fill in notes for clients who have injuries, ask clients to complete the health form (their portal shows the card), then use **Kirim tes** for `tes-ulang` and turn it on.
7. E5: check the portal profile page on a phone.

Every step is optional and reversible. Nothing sends to clients until a reminder type is switched on, and then only as buttons the owner taps.
