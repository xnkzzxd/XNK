# Design — Phase AC: Klien list + client profile (coach panel)

Code: `apps-script/pt-scheduler/parts/app/20-klien-ac.part` (panel-only renderers), rewrites in parts 05/06/07/09/11, styles in `parts/theme/09-klien-ac.part`, sheets in `src/Index.html`, server in `src/Kode.gs` / `src/Wawasan.gs`.

## 1. Rules

1. **One black zone per screen**: the band plus the client card. Everything below is light (`--surface`, `--border`). Red (`--danger`) stays the only colour.
2. **No card inside a card.** Inside a card: rows with dividers, `.kv`, or a strip.
3. **Action before information**: to-dos and the next session first, numbers next, history in folds or "Tampilkan semua".
4. **Each number once per screen.**
5. **Buttons have four homes** (§2).
6. Existing rules hold: 44 px targets, rem text, `min-height`, `var(--sa-*)`, back gesture through `openSheet`/`openDetail`, light + dark, `big-text`.
7. **The portal is untouched.** Shared renderers (`insightHeroHtml`, `insProgressHero`, `insTrainingHero`, `ins*Card`, `workoutStatsHtml(w,'me')`, `shareBtns`, `pgBlocksHtml`, `todoHtml`, `weekStripHtml`) are not changed; the panel has its own functions that reuse the portal's CSS classes (`.px-sec`, `.px-bar`, `.todo`, `.week-x`, `.px-tiles`, `.gfx-kontur`).

## 2. Buttons: one home per kind of action

| Home | Holds | Where |
| --- | --- | --- |
| Action bar | Chat WA · Booking · Mulai latihan · Catat ukuran | In the client card at every width: four equal tiles on phones and in the 420 px panel, one row with "Mulai latihan" solid when the panel is ≥ 620 px wide. Same on every tab, never repeated in a tab. |
| Share icon | Bagikan kartu: opens the share editor on the card for the open tab (Ringkasan → Rekap, Progres → Progres or Ukuran, Latihan → Latihan, Gizi → Gizi; `cpShare`) | Head right, next to ⋯, on every tab (owner's request after Wave 3: share in one neat place) |
| ⋯ menu (`#sheet-cp-more`) | Tambah: PR baru, Tes kebugaran, Latihan yang lewat, Catatan privat · Kirim lewat WA: ringkasan latihan, hasil tes, pengingat form kesehatan · Klien: Ubah data, Hapus klien | Head right on every tab |
| The thing itself | A row opens its own sheet (view / Ubah / Hapus): measurement, workout day, session, PR, photo, test | — |
| One link per section | "+ PR", "Atur program", "Ubah data gizi" | Right of the section head (`.px-sec`) |

Plus the **Tugas coach** rows on Ringkasan: one action each.

Old → new:

| Old button | New home |
| --- | --- |
| Pencil in the head, "Ubah data" | ⋯ → Ubah data (and Data → Profil) |
| "Hapus klien" | ⋯ → Hapus klien |
| Chat WA, Booking | Action bar |
| Mulai latihan (Latihan tab) | Action bar |
| Catat ×2 in Progres | Action bar → Catat ukuran |
| Three share buttons in Progres | Share icon in the head |
| Foto | Progres › Foto (rows → private viewer; only the client uploads) |
| + Tes, Kirim hasil via WA | ⋯ → Tes kebugaran / ⋯ → Hasil tes |
| Six share buttons | Share icon in the head |
| Delete per measurement | Tap the row → Hapus |
| "Ubah" per workout day | Tap the row → Ubah |
| Ubah program, Lainnya (auto, pantangan, regenerate) | "Atur program" → one sheet (`#sheet-cp-prog`); catat yang lewat / WA summary → ⋯ |
| Three share buttons in Latihan | Share icon in the head |
| Care Ubah / Lihat jawaban / Isi / Kirim pengingat | Data tiles; reminder to fill → ⋯ |
| Ten reminder switches on Ringkasan | Data → Pengingat WhatsApp |
| PR "Tambah" | "+ PR" on the PR head (and ⋯) |
| Gizi "Ubah" | "Ubah data gizi" on its head |

## 3. Klien list

Phone:
```
███ Klien                       [+ Klien baru] ███
███ 6 klien · 1 perlu perhatian                ███
[🔍 Cari klien…            ] [Terbaru ▾]   ← sticky
(Semua 6)(Perlu perhatian ● 1)(Hampir habis 1)(Habis 1)(Aktif 4)(Riwayat 0) →
┌──────────────────────────────────────────────┐
│ (SW) Sari Wulandari                     5/12 │
│      Intensif 12 · Jum 27 Nov 10.00   ▓▓▓▓░░ │
│      ● 14 hari tidak latihan    (only if flag)│
└──────────────────────────────────────────────┘
```
- No black summary card: its numbers are in the band subtitle (phones) and small band stats (PC). "Perlu perhatian" is the second chip, with a red dot when > 0.
- Rows: name alone on its line; count + small meter on the right with the state as text under it ("Hampir habis", red "Habis"); flags on their own line only when present; no phone number.
- PC without a profile: the card grid, same row structure plus `.cc-meta` and the 4-week bars.
- PC split (`#app.detail-wide`): icon-only "Klien baru"; search on its own row; **Filter** and **Urutkan** as two selects (chips and Kartu/Daftar hidden; `setClientFilter` keeps chips and select in sync); 56 px rows with a muted second line (next session, or the first flag in red).

## 4. Client profile

```
PHONE                                        PC (panel ±790 px at 1440)
███ ←  Sari Wulandari                 ⋯ ███  ███ ✕  Sari Wulandari                                         ⋯ ███
 ┌───────────────────────────────────────┐    ┌──────────────────────────────────────────────────────────────────────┐
 │(SW) [Aktif][Intensif 12]    ◎ gfx      │    │(SW) [Aktif][Intensif 12]                 5 dari 12 sesi · 7 selesai │
 │     Turun berat badan · +62…           │    │     Turun berat badan · +62…             ▓▓▓▓▓▓▓░░░░░░             │
 │ 5 dari 12 sesi · 7 selesai             │    │                                          Berikutnya Jum 27 Nov 10.00 │
 │ ▓▓▓▓▓▓▓░░░░  Berikutnya Jum 27 Nov     │    │ [WA] [Booking] [▶ Mulai latihan] [Catat ukuran]                      │
 │[ WA ][Booking][Latihan][Ukur]          │    └──────────────────────────────────────────────────────────────────────┘
 └───────────────────────────────────────┘     Ringkasan  Progres  Latihan  Gizi  Data   (sticky, light)
 Ringkasan Progres Latihan Gizi Data   ← sticky, light, 48 px
```
- Head title = the client's name; ⋯ opens `#sheet-cp-more`.
- Client card: black, hangs over the band, `.gfx-kontur`; avatar, state pill, goal, phone, package row (package name, sessions left, **Perpanjang** `#profile-renew` → `openRenewMember`, white when the quota is used up; owner's choice from PR #200), sessions meter (`#profile-remaining`, `#profile-total`, fills by sessions left), next session, the four actions. The tabs stick under the head while scrolling; the card scrolls away.
- Five light text tabs, sticky inside `#detail-body`, arrow keys switch. Legacy names: `perawatan → data`, `program → latihan`, `riwayat → ringkasan`.

### Ringkasan
1. **Sesi berikutnya**: date, time, countdown, status, planned program day, **Fokus terakhir** (bundle part `notes`); `sessActions` when it is today, otherwise Ubah and WA; none = "Belum ada jadwal" + Booking.
2. **Tugas coach**: `.todo` rows from the bundle part `todo` (`_coachTodoCalc_`); one action per row through `cpTodoGo(kind, ref)`; nothing = "Semua beres".
3. **Minggu ini**: `.week-x` strip + one line, bundle part `week`.
4. **PR (Task)**: open tasks (round check = done, tap = edit), "+ PR" on the head.
5. **Sesi**: *Mendatang | Riwayat* segment, compact rows (tap → session detail), 8 then "Tampilkan semua".

On PC from a panel ≥ 760 px wide: 1–2 left (`.cp-col-main`), 3–5 right (`.cp-col-side`).

### Progres (Wave 2)
A light segment **Ringkasan · Ukuran · Tes · Foto** at the top of the pane (`cpPgSegHtml`, `window.cpPgSeg`). The choice and the picked measure are kept per client (`cpg` in part 20; another client starts on Ringkasan / Berat) and survive `refreshDetail`. Switching makes no call: every sub-tab is rendered from the bundle already in memory.
- **Ringkasan**: *Rapor tubuh* (`cpRaporHtml`: the same numbers, range switch, sparkline and sentence as the portal's rapor, without Catat or share buttons; light through the client-page CSS), *Indikator* tiles, *Momen* (5 latest of bundle `athlete.moments`: records, measurement changes, session milestones; `.mom` list from the portal, neutral icon disc), *Yang berkaitan dengan hasil* fold.
- **Ukuran**: *Grafik ukuran*: one `pgChartSvg` at a time, chips *Berat · Pinggang* plus a "Lainnya…" select for the other six measures that have data (`cpPgPick`). *Lingkar & simetri* (`insMeasuresBody`) when there is data. *Riwayat catatan*: rows (date, coach/klien, first three values), 5 then "Tampilkan semua"; a tap opens `#sheet-cp-row` (all values, author, **Hapus catatan** → the existing optimistic `pgDeleteAdminEntry` with its confirm).
- **Tes**: the coach fitness insight (`insFitnessCard`) and `#profile-tests-wrap` (Wave 1). Adding a test and sending results stay in ⋯.
- **Foto**: photo rows (date, side). A tap sets `pg.mode = 'admin'` and opens the existing private viewer (`pgViewPhoto`: one `getMemberProgressPhoto`, data URL, no Hapus for the coach); closing returns to the sub-tab (`pg.fromTab`). No thumbnail grid, so no extra photo calls. *Badge* pills below.
- Removed from the tab: Catat ×2 (action bar), Foto button (sub-tab), three share buttons (share icon in the head), the per-entry delete icons (row sheet). ⋯ → Tambah no longer lists "Foto progres": only the client uploads photos.
- Server: `getClientBundle.athlete` now also carries `moments` (computed by `_portalXFor_` already; one additive field).

### Latihan (Wave 3)
Phone order: Program → Minggu ini → Kekuatan → Volume & keseimbangan → Riwayat. From a panel ≥ 700 px wide: two columns, Program + Riwayat left (lists), the numbers right (`.cp-col` with `display: contents` and `order` on phones).
- **Program** (`programAdminInner0`, admin only): head with the status pill (Otomatis · blok n / Otomatis mati / Program coach / Belum ada) and the **Atur program** link; one muted profile line (level · tujuan · n× / minggu · durasi) for auto programs; mode-ringan and missing-equipment notes; one card per day. The next day (`workout.next`, else the first day) is open with every exercise (thumbnail → `exView`) and a solid **Berikutnya** pill: that is what *Mulai latihan* on the client card starts. Other days are `<details>` cards showing one line of exercise names; a tap opens the full list. A muted foot line: last logged day · last day the client ticked. Empty: one line pointing to Atur program.
- **Atur program** (`#sheet-cp-prog`, `cpProgSheet`): a settings list in the ⋯ menu's style (`.cpm-group` / `.cpm-row`, no pill buttons; owner's request): *Program* → Ubah / Buat program (closes, then `openProgramEditor`); *Otomatis* → a Program otomatis switch row (`pgAdminAuto`) and a Buat ulang otomatis row (`pgAdminRegen`), with the latest "why" line under it; *Pantangan gerakan* → one switch row per tag (`pgAdminTag`); the client's own routines as text rows. It re-renders in place after each answer (`renderProgramAdmin` → `cpProgSheetRefresh`); a failed answer re-renders too, so a switch never shows a state that was not saved.
- **Minggu ini vs biasanya** (`cpLatWeekHtml`): the portal's numbers (days, working sets, volume, then RPE, feeling or duration) and sentence in the light hero, no share buttons; below it one *Aktivitas* card: the 12-week heatmap stretched across the whole card (columns `1fr`, 14 px rows, so no empty space beside it; owner's request) and two numbers under it (active days of 84, program days this week).
- **Kekuatan** (`cpStrengthHtml`): one list (up to 8 lifts from `insight.training.strength`): name, est. 1RM, × body weight, red *mandek*, sparkline, change %. A row is a `<details>`: opening it shows the PR and the full e1RM chart from `workout.stats.exercises` (same key), so the old exercise picker and the second strength card are gone.
- **Volume & keseimbangan** (`cpVolumeHtml`): weekly volume bars, push / pull / legs / core shares over 4 weeks, the push:pull note and lifts missed for 2 weeks, in one card (the old "volume per otot" duplicate is dropped).
- **Riwayat latihan** (`cpWkHistHtml`): rows (date + feeling, day name, exercises · sets · minutes, note); 5 then "Tampilkan semua"; a row within 90 days opens `workoutEditDay`; queued workouts show "Menunggu sinyal" / "Gagal".
- Removed: Mulai latihan and Ubah program buttons (client card / Atur program), the "Lainnya" fold (Atur program; *Catat yang lewat* and *Kirim ringkasan WA* were already in ⋯), three share buttons (share icon in the head), the last-session number tiles (the first history row says the same).
- `cpLatRender(id)` redraws Kekuatan, Volume and Riwayat when the workout data changes (called from `renderProgramAdmin`); the insight parts redraw through `renderClientInsight` as before. No new calls.

### Gizi (Wave 4)
`nutInner` (admin only; the portal Makan tab is untouched) renders two `.cp-col` columns (one column on phones, two from the existing `#profile-nut-wrap` container rule):
- **Saran penyesuaian** first when one is pending: the reason, ±kkal and Setuju / Tolak (`nutAdviceRow`, unchanged, also used by Beranda Coach).
- **Hari ini**: a light calorie ring (`nutRingHtml`, eaten / target from today's food log) next to Protein, Karbo and Lemak bars (`x / target g`); the head says how much is left. Ring and bars stay side by side on phones (no empty space).
- **7 hari**: the 7-day calorie bars against the target (`kcalBarsHtml`) and one sentence (average vs target, or "weigh again" when the weight is older than 4 weeks); the head carries days logged and the average. This replaces the old black/light "Gizi klien" hero (`cpGiziHero` removed).
- **Buku harian**: one `<details>` row per logged day (newest open), grouped per meal (Sarapan, Makan siang, Makan malam, Camilan) with each food, portion and kkal. Read-only.
- **Data & dasar** (right column on PC): BMI, waist/height, BMR, TDEE as plain numbers (no boxes), weight / waist / sessions per week, fibre / sodium / water, safety flags, then the coach inputs as one-line label–value rows. The head link **Ubah data gizi** opens `openNutEdit`; with incomplete data a *Lengkapi data* section lists what is missing with an **Isi data gizi** link.
- Last decided advice as one muted line. No share buttons (header icon), no button rows, no new calls.

### Data
Portal "Saya" style hub: tiles on phones, grouped list rows on PC. Profil (→ `openEditProfileModal`), Kesehatan (→ `openCareHealth`), Assessment (→ `openAssessment`), Catatan privat (→ `openCareNotes`), Masukan klien (→ `#sheet-cp-feedback`), Pengingat WhatsApp (→ `#sheet-cp-remind`, keeps `#profile-meal-wrap`, `#profile-meal-toggle`, `#profile-remind-prefs`). Each tile shows its status.

## 5. Calls

One call opens the page; every write answers with the part it changed and the page patches memory and `xnk_client_cache` (`ccPatch`) with no follow-up read.

`getClientBundle` gained (additive, optional for `bundleOk`; the week summary was already in `insight.week`):
- `notes`: last 10 session notes of the client (`scheduleId, tanggal, dilatih, fokus, rpe, pribadi`). Used by "Fokus terakhir", the session-detail briefing and the session-note sheet prefill. Those read memory only when the in-memory copy matches the server version (`ccBundleOf` → `ccFresh`); otherwise they call `getSessionBriefing` / `getSessionNote` as before, so a note written on another device is never overwritten by an empty form.
- `todo`: `_coachTodoCalc_(ctx)` in `Wawasan.gs` (pure; every threshold in `COACH_TODO`).

Writers that now return their part (additive fields only):

| Writer | Returns | Read it replaces |
| --- | --- | --- |
| `addTask`, `updateTask`, `deleteTask` | `memberId`, `tasks`, `taskSummary` (this client) | `getTasksForMember` + `getTaskSummary` |
| `saveClientNutrition`, `decideNutritionAdvice` | `nutrition` | `getClientNutrition` (+ `getCoachHub`, now only when Beranda Coach is open) |
| `markHealthReviewed`, `saveClientNotes`, `saveAssessment` | `care` | `getClientCare` |
| `regenerateProgram`, `setClientProgramAuto` | `program` (next to the old fields) | `getMemberProgram` |
| `decideRenewal` | `member` (approve) | reject: no reload at all; approve: the client updates at once and the panel reloads once in the background (transactions and revenue change too), no separate `getRenewalRequests` |

The coach to-do is not recomputed by writers (that would read many sheets on every save): the page removes the finished row at once (`cpTodoDrop(memberId, kind)`) and the server recomputes it with the next bundle.

Other:
- The logger opened outside the client page loads the client through `loadClientBundle` (one cached call) instead of `getWorkoutLog` + `getMemberProgram`.
- Panel boot: `getSettingsBundle` (`{settings, status, packages}`, a failing part = `{error}`) replaces three Settings prefetch calls.

Budget (checked in `browser-check`): boot 3 · open Klien 0 · open client 1 · tab switch 0 · Progres sub-tab switch 0 · photo view 1 · session detail / note of a loaded client 0 · PR tick 1 · gizi decision 1 · health reviewed 1.
