# Phase L — exercise library, workout log, charts (T-800+)

Plan: library picker → per-set workout log (coach + client) → stats/charts → PRs/badges. Decided with the owner: log weight×reps, duration/distance, RPE and a note per exercise; charts for per-exercise progress (weight, est. 1RM), weekly volume by muscle group, PRs/badges and session summary; logging extends the Program (items carry an exercise ID).

## L1 — Exercise library (built)
- [x] T-800 `tools/build-exercises.js` slims hasaneyldrm/exercises-dataset into `exercises/exercises.min.json` (id, name, body part, equipment, target, gif file; ~150 KB, English only). Served by GitHub Pages, so Apps Script and the bootstraps never carry it.
- [x] T-801 Admin picker in the Program editor (`#ex-pick`): lazy `fetch` on first open, cached in `localStorage` (`xnk_ex_lib_v1`), search + body-part chips, 30 rows at a time. Tapping adds `Name | 3x10 | ex:<id>`.
- [x] T-802 Program text token `ex:<id>`; `ProgramItems` column L "Exercise ID" (appended, idempotent). Free-typed exercises keep an empty ID.
- Media: GIFs are © Gym visual and are **hotlinked for admin preview only**, never stored in a program or shown to clients (their terms are not MIT). Show "Exercises Dataset (MIT) · media © Gym visual" next to the picker. To refresh the data, re-run the build script on the upstream `data/exercises.json`.

## L2 — Workout log (built)
- [x] T-810 Sheet `WorkoutLog` (one row per set; `Oleh` = admin|klien) + admin `saveWorkoutLog` / `getWorkoutLog`, member `logMyWorkout` / `getMyWorkout` (member from the token). Validation in the pure `_parseWorkoutEntries_` (≤ 12 exercises, ≤ 20 sets, 0–500 kg in 0.5 steps, rep, durasi, jarak, RPE 1–10, note ≤ 200). Same day + exercise is replaced inside `_locked_`; a client replaces only their own rows, the coach can replace all. Dates: client today … 7 days back, coach up to 90 days; a coach-supplied `scheduleId` must belong to the client. The part `workout` rides in `getPortalMore` and `getClientBundle`; nothing goes to Telegram or the admin cache.
- [x] T-811 One shared sheet `#modal-workout`: coach ("Catat latihan" on the session detail and the client's Program tab, day picker prefilled from the program, free exercises via the library search) and client ("Catat set" per program exercise). Last-time sets appear as placeholders. Logging every planned set today also ticks the program item (add only).

## L3 — Stats and charts (built)
- [x] T-820 Pure `_workoutStats_` (Epley est. 1RM for sets up to 12 reps, volume = kg × rep, 8 weeks Monday-start, volume by body part for the last 4 weeks, PR per exercise, last 10 sessions) computed on the server and returned as `stats` inside every workout read, so it rides in `getPortalMore` / `getClientBundle` with no new call.
- [x] T-821 One renderer `workoutStatsHtml(w, scope)`: summary of the last session, exercise picker with PR and a line chart (reuses `pgChartSvg`), weekly volume bars, body-part bars. Mounted in the portal Progres tab (`#pub-workout-wrap`) and on the coach's client Program tab (`#wk-admin-stats`). Monochrome tokens, works in light and dark; exercises without weight get no strength chart.

## L4 — PRs, badges, sharing (built)
- [x] T-830 Personal records: a record is a higher estimated 1RM than the best earlier day for the same exercise (the first log is only the baseline; re-saving the same data repeats nothing). `saveWorkoutLog` / `logMyWorkout` return `prs`, shown as a toast. Optional Telegram note (first name + exercise, no weights) only when Script Property `WORKOUT_PR_NOTIFY=true`; off by default.
- [x] T-831 Four badges computed from the log (not stored): `catat-5`, `catat-20` (days with a logged workout) and `pr-1`, `pr-10` (records). They join the existing Pencapaian grid (11 badges); the `selamat-milestone` reminder still only congratulates session and streak badges.
- [x] T-832 Admin `getWorkoutSummaryMessage(token, memberId, date)` fills the manual template `ringkasan-latihan` (sets, new records, total volume); the client page's "Kirim ringkasan WA" opens a `wa.me` link for the last logged day. Nothing is sent automatically.

# Phase M — live workout logger, program form editor (T-840+)

Plan with the owner (2026-10): [PRD.md](PRD.md) (what), [Design.md](Design.md) (how). Replaces the L2 sheet for coach and client.

- [x] T-840 Docs: PRD, Design, this list.
- [x] T-841 Server: ProgramItems columns M–S (`_ensureProgramColumns_`), pure `_parseProgramDays_`, structured `saveMemberProgram` / `saveProgramTemplate` (text still accepted), WorkoutLog `Jenis Set` (warm-ups out of volume/1RM/PR), sheet `WorkoutSessions` (upsert per day, `CID`), `session` argument on both saves, 20 exercises, reads carry `sessions`, `next`, `suggest`, `best`; coach hub `workouts`. Tests.
- [ ] T-842 Program form editor in `#modal-program` (days, rows, scheme, superset, drag + ↑/↓, library picker, templates). Text editor removed.
- [ ] T-843 Live logger core `#wl-screen`: list, set rows, prefill + ✓, number pad, set kinds, supersets, stopwatch, skip / add / reorder, device draft.
- [ ] T-844 Rest timer, vibrate, beep, Wake Lock.
- [ ] T-845 Finish sheet (summary vs last time, PRs, feeling, note, WA), send queue with auto-retry, coach views (client page, hub).
- [ ] T-846 Entry points (Beranda card, Program "Mulai", resume bar, centre +, session detail), backfill date chip, edit past day, exercise history, desktop two columns, guide steps.
- [ ] T-847 Remove `#modal-workout`, update READMEs and Agent.md §7.
