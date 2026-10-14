# Design — Phase M (live logger, program form)

Code: `apps-script/pt-scheduler/src/`. Rules from [../Agent.md](../Agent.md) apply (append-only columns, member from the token, backend-first, phone first).

## 1. Data

### ProgramItems (append M–S)
`… Exercise ID (L), Rep Min, Rep Max, Target Kg, Istirahat, Superset, Jenis, Skema`

| Column | Meaning |
| --- | --- |
| Rep Min / Rep Max | rep range (Max empty = fixed reps). |
| Target Kg | starting weight when the client has no history (0–500, 0.5 steps). |
| Istirahat | rest in seconds (0–600; empty = 90 s in the logger). |
| Superset | group letter `A`–`Z`; adjacent items with the same letter form one superset. |
| Jenis | `beban` (weight × rep), `badan` (bodyweight rep), `waktu` (seconds), `jarak` (metres). Empty = guess (`dtk`/`s` → waktu, `m` → jarak, else beban). |
| Skema | JSON `[{rep, kg, w}]`, one per set (per-set reps/kg, `w:1` = planned warm-up). Empty = uniform. |

`Set` (number of sets) and `Rep` (display text: `10`, `8–12`, `45 dtk`, `12/10/8`) are still written, so old readers and the client checklist keep working. Columns are added by `_ensureProgramColumns_` (idempotent, inside the write lock). Old rows read with the new fields empty.

### WorkoutLog (append T)
`Jenis Set`: `''` (normal), `w` (warm-up), `drop`, `gagal`. Warm-up sets are left out of volume, estimated 1RM, PRs and badges.

### WorkoutSessions (new)
`ID, Member ID, Tanggal, Schedule ID, Hari, Mulai, Selesai, Durasi, Rasa, Catatan, Oleh, Diubah Pada, CID`
One row per member and date (upsert). `Rasa` 1–5 (faces), `Durasi` seconds (0–6 h), `CID` = browser-made workout ID (retries of the same workout replace, never double).

## 2. Server

- `_parseProgramDays_(days)` (pure): structured days → clean days or an Indonesian error naming day and exercise. Limits: `PROGRAM_LIMITS` + rest 0–600, target 0–500 (0.5), reps 1–999, scheme ≤ 20 sets, superset letter, a superset group needs ≥ 2 adjacent items.
- `saveMemberProgram(token, memberId, program)` / `saveProgramTemplate(token, name, program)`: `program` is the days array (form). A string is still accepted and parsed as the old text (compatibility).
- `_programDays_` returns the new fields; `getMemberProgram`, `getProgramTemplates`, `getMyProgram`, `applyProgramTemplate` carry them.
- `saveWorkoutLog(token, memberId, date, scheduleId, entries, session)` / `logMyWorkout(memberToken, date, entries, session)`: `session = {cid, hari, mulai, selesai, rasa, catatan}` optional. Sets accept `jenis`. Max 20 exercises.
- Workout reads (`getMyWorkout`, `getWorkoutLog`, part `workout` of `getPortalMore` / `getClientBundle`) add:
  - `sessions`: latest 20 `{tanggal, hari, durasi, rasa, catatan, oleh}`.
  - `next`: suggested program day (`_workoutNextDay_`: day after the last logged or ticked one, rotating).
  - `suggest`: `{key: {kg, why}}` from the pure `_workoutSuggest_(lastSets, repMax, bodyPart)`.
  - `best`: `{key: e1rm}` best estimated 1RM so far (for the live 🏆 hint).
- Coach hub: `getCoachHub().workouts` (last 7 days: first name, day, feeling, duration). Client page reads `workout.sessions`.

## 3. Browser

### State and storage
`wl = {v:1, cid, mode:'client'|'admin', memberId, date, hari, scheduleId, startedAt, live, entries:[…], open, note, rasa}`; each entry `{key, n, hari, exId, gerakan, bodyPart, target, kind, rest, ss, repMin, repMax, skipped, own, rpeOn, sets:[{berat, rep, durasi, jarak, rpe, jenis, done}]}`.
- Draft: `localStorage xnk_wl_<scope>` (client scope = member token signature, admin `adm:<memberId>`), written on every change, cleared after a successful save, on logout and on auth loss.
- Queue: `xnk_wl_queue` (list of pending saves). Sent on app open, on `online`, and from "Kirim ulang". Each item carries its `cid`.

### Screen `#wl-screen` (full screen, own back step)
```
┌ ← Latihan A ▾   12:34      [Selesai] ┐   top bar (date chip in backfill)
│ ✓ Squat            4 × 60 kg   ▸     │   done: one line
│ ▼ Bench press  A1   ⋮  ⟲             │   open exercise
│   Terakhir 40×10 · 40×10 · Naik 42,5 │
│   1  [40 kg] × [10]        ✓         │
│   2  [40 kg] × [10]        ✓         │
│ W 3  [42,5]  × [ 8]   🏆   ○         │
│   + Set                              │
│ ▸ Row  A2   3 × 10                   │   next: preview
│ ▸ Plank     3 × 45 dtk               │
│ + Tambah gerakan                     │
└ Istirahat ████░░ 0:52  −15  +15  Lewati ┘ sticky, above the tab bar
```
Desktop ≥ 768 px: `grid-template-columns: minmax(260px, 340px) 1fr`; the left column is the exercise list (one line each), the right column the open exercise and its history.

- Set row: kind chip (number, `W`, `D`, `F`; tap cycles), weight chip, rep chip (or stopwatch for `waktu`, metres for `jarak`), ✓ (44 px). Tapping a chip opens the number pad sheet `#wl-pad` (−/+ steps: kg 2.5, rep 1, seconds 5, metres 50; field `inputmode="decimal"`).
- ✓ marks the set done, copies its values into the next empty set, starts rest, vibrates. When all sets are done the exercise collapses and the next one (or the next in the superset) opens.
- Exercise menu ⋮: RPE on/off, rest time, move up/down, skip / un-skip, remove (own exercise only), history.
- Drag handle (pointer events) and ↑/↓ reorder.
- Rest bar: pinned to the bottom of the full-screen logger (`env(safe-area-inset-bottom)`). The logger covers the tab bar on phones, so the bar sits where the tab bar was (built that way instead of above the tab bar). End = vibrate + WebAudio beep. Wake Lock while the screen is open and live.
- Resume bar `#wl-resume`: above the tab bar (phone) or bottom-right (desktop) while a draft exists or a save is queued.
- Entry from the client **+**: a small sheet `sheet-quick-client` (Booking, Mulai latihan, Catat yang lewat); in-page Booking buttons keep opening the booking sheet directly.
- Finish sheet `#wl-finish`: duration, sets, volume, ↑/↓ per exercise vs last time, PRs (celebration), feeling (5 faces), note, "Simpan". After saving: summary, "Kirim ke coach (WA)" (client) / "Kirim ringkasan WA" (coach).
- Backfill: date chip (client 7 days, coach 90), no timer or rest, "✓ semua" per exercise.

### Program form `#modal-program`
Days as sections (rename, delete, ↑/↓). Each exercise a row: summary line (`Bench press · 3 × 8–12 · 60 kg · 90 dtk`) that expands to fields: Sets, Rep min, Rep max, Target kg, Istirahat, Jenis (chips), "Gabung superset dengan atas" toggle, Skema per set (optional table), Catatan, Video. "+ Gerakan" opens the library picker (adds a row) or a free name. Templates load into and save from the form.

## 4. Privacy
Workout data stays out of Telegram (except the existing opt-in PR note: first name + exercise), the admin cache and public responses. A member function always takes the member from the token.

## 5. Phase M2 (shorter screens)

- **Logger cards** (`wlExHtml`): header (grip, name + superset label, pencil, ⋯), one line (suggestion, last time or target), then `.wl-tiles`: one 48 px tile per set (`80×8`, `8 rep`, `0:45`, `400 m`, prefix W/D/F, corner check when done, 🏆 when above the best 1RM) and a narrow "+" tile. Tap = `wlTick` (undo when done; empty → pad); a running stopwatch tile stops and ticks. The top bar has ⋯ (`wlTopMenu`: day, date, add exercise, discard). The `.wl-bar` row and the list/detail split on PC are gone; PC shows the cards in a grid (`minmax(360px, 1fr)`).
- **Pad** (`wlPad(i, j)`): set chips, one −/+ row per field of the kind (+ RPE when on), "Mulai stopwatch" for timed exercises, kind chips, foot "Hapus set" and "Simpan & ✓" (only "Simpan" for a ticked set). New values carry to later unticked sets of the same kind.
- **Exercise search** (`exSearchOpen(onPick, {title, admin, ret, extra})`): sheet `#ex-search`; empty box shows recent chips (`xnk_ex_recent`, device only, max 12) plus the current program's exercises; `ret` makes close/back/pick return to that sheet (`ui.sheetReturn`, checked in `closeModal`). GIF thumbnails for the admin only.
- **Program form**: open item = kind `<select>` + delete, `.pf-grid` of numbers, `<details class="pf-more">` "Lainnya" (name, scheme toggle, superset, note, video; open state kept in `pf.more`).
