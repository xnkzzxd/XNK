# PRD — Phase M: live workout logger and program form editor

## Problem
The Phase L2 logger (`#modal-workout`) is a bottom sheet with typed inputs. Clients open it once per exercise, every set means typing kg / rep / RPE, last time's numbers are faint placeholders, and closing the sheet loses everything. There is no rest timer, finish summary, set type, or protection against bad gym signal. The program is written as text, so the coach cannot prescribe rep ranges, per-set schemes, target weight, rest or supersets.

## Goals
1. One **"Mulai latihan"** live mode for the whole program day, used by the client between sets, by the coach during a PT session, and by either after the fact.
2. Logging a set is **one tap** (✓) on numbers that are already right: last time → previous set → coach target, with a heavier-weight suggestion when earned.
3. **Nothing is lost**: every tap is kept on the device; a failed save waits and retries.
4. The coach writes programs in a **form**, with the fields the logger needs.

## Users and moments
| Who | When | Entry |
| --- | --- | --- |
| Client | live at the gym, phone in hand | Beranda "Latihan hari ini", Program day "Mulai", the centre **+**, resume bar |
| Client | after the workout (≤ 7 days back) | "Catat latihan yang sudah lewat", history → edit |
| Coach | during a PT session | Session detail "Catat latihan", client Program tab |
| Coach | after the session (≤ 90 days back) | Same, date chip |

## Decisions (with the owner, 2026-10)
- Replaces the old logger for coach and client; no setting (an upgrade of an existing feature, data format compatible).
- Phone: one full-screen scrolling list, current exercise open, done ones collapsed to one line, next ones previewed. Desktop ≥ 768 px: two columns (exercise list | open exercise's sets + history), timer in the top bar.
- Set row: prefilled kg × rep, ✓ to confirm, tap a number for −/+ and keypad. RPE per set behind a per-exercise toggle.
- Rest timer starts after each ✓: coach's rest for that exercise or 90 s, ±15 s, skip; vibrate, beep, screen stays on while a workout runs.
- Set kinds: normal, warm-up (W, not counted in volume/PR), drop set, to failure. Supersets from the program; the logger moves to the next exercise in the group after a set.
- Timed exercises get a stopwatch per set; the exercise kind (weight / bodyweight / timed / distance) comes from the program or the library; no checkbox.
- Client may add/remove sets, skip, add own exercises from the library, reorder (drag + ↑/↓).
- Suggestions: prefill from last time; +2.5 kg (upper body) / +5 kg (lower body) when every working set reached the top of the rep range last time; live 🏆 hint when a set beats the best estimated 1RM.
- Saving: device draft after every change, one server save on **Selesai**; failed saves queue as "Belum terkirim", retry automatically, "Kirim ulang" button.
- Finish: summary vs last time, PR celebration, 5-face feeling + workout note, client "Kirim ke coach (WA)" (manual `wa.me`).
- Coach sees the finished workout and feeling in the panel only (client page, coach hub). No Telegram (the existing opt-in PR note stays).
- "Latihan hari ini" = the next program day in rotation after the last logged or ticked day; the client can switch day.
- Extras: exercise history (last 5 + PR), edit past workouts, workout note. Not now: class (multi-client) logging.
- Program editor: form only (text editor removed). Per exercise: sets, rep range or per-set scheme (incl. planned warm-ups), target kg, rest, kind, superset, note, video. Drag + ↑/↓.

## Non-goals
- GIFs for clients (library media licence: admin preview only). Superseded in Phase O: the owner chose to show them to clients too.
- Automatic WhatsApp or Telegram messages.
- Multi-client (class) logging.

## Success
- A client logs a 5-exercise workout with ≤ 1 tap per set when following the plan.
- Reloading or closing the app mid-workout loses nothing.
- Phone (360–430 px) and desktop both pass the browser check in light and dark.

# PRD — Phase O: Latihan ala Hevy (access, routines, logger, search, settings)

## Problem
The owner sent five Hevy screenshots (Workout tab, Log Workout, Add Exercise, Workout Settings, Routine) and asked for the same layout, UX, access and features. Phase M/M2 works but the program lives in a checklist page, clients cannot build their own routines, the set tiles hide the previous numbers, and there are no per-device workout settings.

## Decisions (with the owner, 2026-10-21)
- Access: the bottom bar stays; the **Program** page becomes **Latihan** (sidebar, Lainnya, guide).
- Clients may **create their own routines** (max 10); coach routines stay coach-only. The coach can open a template to clients in **Jelajahi** (off by default).
- Set rows become a **table** `SET | SEBELUMNYA | KG | REP | ✓`; the M2 tiles and pad are removed.
- Exercise **GIFs are shown to clients too** (the owner accepts the Gym visual licence risk; hotlinked, never stored).
- Colours stay monochrome (theme tokens), not Hevy blue.

## Screens
1. **Latihan**: Mulai latihan kosong · Rutinitas (Rutinitas baru, Jelajahi) · *Dari coach (n)* · *Rutinitas saya (n)* (fold, remembered per device) · Riwayat latihan; PR and meal cards stay.
2. **Log latihan**: top bar ⌄ · title · ⏱ · ⋯ · Selesai; strip Durasi / Volume / Set + muscle map; empty state "Mulai dulu" with Tambah gerakan, Pilih rutinitas, Pengaturan, Buang latihan; per exercise: picture, coach note, rest, suggestion, plates, table, Tambah set.
3. **Tambah gerakan**: Batal · title · Buat; search, Semua alat / Semua otot; Gerakan terakhir then A–Z; multi-select; 📈 history inline; Buat = custom exercise (name, kind, muscle).
4. **Pengaturan latihan** (device only): sound, vibrate, default rest, previous values (last time / same routine), warm-up calculator, keep awake, plate calculator + bar weight, RPE.
5. **Routine detail**: Mulai rutinitas, chart Volume / Rep / Durasi (90 days), exercises with rest and a SET / KG / REP table, Edit (own) or Salin ke rutinitas saya (coach).

## Non-goals
Folders of routines, social feed, sharing routines between clients, multi-client logging.
