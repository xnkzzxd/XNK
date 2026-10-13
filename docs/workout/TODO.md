# Phase L — exercise library, workout log, charts (T-800+)

Plan: library picker → per-set workout log (coach + client) → stats/charts → PRs/badges. Decided with the owner: log weight×reps, duration/distance, RPE and a note per exercise; charts for per-exercise progress (weight, est. 1RM), weekly volume by muscle group, PRs/badges and session summary; logging extends the Program (items carry an exercise ID).

## L1 — Exercise library (built)
- [x] T-800 `tools/build-exercises.js` slims hasaneyldrm/exercises-dataset into `exercises/exercises.min.json` (id, name, body part, equipment, target, gif file; ~150 KB, English only). Served by GitHub Pages, so Apps Script and the bootstraps never carry it.
- [x] T-801 Admin picker in the Program editor (`#ex-pick`): lazy `fetch` on first open, cached in `localStorage` (`xnk_ex_lib_v1`), search + body-part chips, 30 rows at a time. Tapping adds `Name | 3x10 | ex:<id>`.
- [x] T-802 Program text token `ex:<id>`; `ProgramItems` column L "Exercise ID" (appended, idempotent). Free-typed exercises keep an empty ID.
- Media: GIFs are © Gym visual and are **hotlinked for admin preview only**, never stored in a program or shown to clients (their terms are not MIT). Show "Exercises Dataset (MIT) · media © Gym visual" next to the picker. To refresh the data, re-run the build script on the upstream `data/exercises.json`.

## L2 — Workout log (todo)
- [ ] T-810 Sheet `WorkoutLog` (one row per set) + admin `saveWorkoutLog` / `getWorkoutLog`, member `logMyWorkout` (member from the token).
- [ ] T-811 Admin and client entry sheets prefilled from the day's program.

## L3 — Stats and charts (todo)
- [ ] T-820 Pure `_workoutStats_` (est. 1RM, volume, weekly volume by body part, PRs, session summary), returned inside `getPortalMore` / `getClientBundle`.
- [ ] T-821 SVG charts in the portal Progres tab and the panel client page.

## L4 — PRs, badges, sharing (todo)
- [ ] T-830 PR detection, badges, manual `wa.me` session summary.
