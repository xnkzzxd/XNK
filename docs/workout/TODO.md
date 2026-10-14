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

## L3 — Stats and charts (todo)
- [ ] T-820 Pure `_workoutStats_` (est. 1RM, volume, weekly volume by body part, PRs, session summary), returned inside `getPortalMore` / `getClientBundle`.
- [ ] T-821 SVG charts in the portal Progres tab and the panel client page.

## L4 — PRs, badges, sharing (todo)
- [ ] T-830 PR detection, badges, manual `wa.me` session summary.
