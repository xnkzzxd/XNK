# Phase AD — Design

What and why: [PRD.md](PRD.md). Tasks: [TODO.md](TODO.md). Every rule in [../Agent.md](../Agent.md) §2 and §4 applies (public functions guarded and listed in `tests/api-lists.js` + `WRITE`/`READ_OK`, `tools/build-api.js`, `_appendRow_`, `_bumpMember_` after writes, `optimistic({q})` for browser writes, new creators in `IDEM_DURABLE`, phone first, `h()`, tokens only).

---

## AD1 — Hold a client (built 2026-11-26)

Built as below, with these changes: `HOLD_KEEP_TYPES = ['ulang-tahun', 'sesi-besok']` (a session the coach kept inside a hold is still reminded); the return-day message is the normal reminder type `kembali-latihan` (off by default) instead of a separate job; no "Ditahan:" digest footer; reminders skip held clients through `_rmdIsOff_` (pools and `_rmdMemberIndex_` carry `hold`); the hold sheet lists sessions from `window.schedules` in the browser (no dry-run call); browser code is part `22-tahan-klien.part`, styles `11-tahan-klien.part`.

### Data
New sheet **`ClientHolds`** (the only truth; history included). Headers:

`ID | Member ID | Jenis | Mulai | Sampai | Catatan | Status | Dibuat Oleh | Dibuat Pada | Diputuskan Pada | Diakhiri Pada | Sesi Dibatalkan`

- `Jenis`: `cuti | sakit | berhenti`.
- `Mulai`, `Sampai`: ISO text dates (`_appendRow_`, read with `_isoDateCell_`). `Sampai` empty = open-ended (always empty for `berhenti`).
- `Status`: `minta` (client request, waiting) · `ok` (in force: planned, active or past depending on dates) · `tolak` · `batal` (request cancelled, or a planned hold deleted).
- `Dibuat Oleh`: `admin | klien`. `Diakhiri Pada`: set when ended early (then `Sampai` is rewritten to the day before, so the dates stay the truth).
- `Sesi Dibatalkan`: comma list of schedule IDs cancelled with this hold (audit, and for the report).
- Join `TIDY_KNOWN_SHEETS`; not in `UNDUH_SKIP` (the coach may download it).

No MemberData column: readers get holds through one memoised read.

### Server (`src/Cuti.gs`, ES6 style like `Kode.gs`)
Pure helpers (tested directly):
- `_holdRows_()` → parsed rows, memoised per execution through `_sheetRowsMemo_('ClientHolds')` (Library: add to `MEMOS` / `_resetLibMemos_`).
- `_holdActiveOn_(holds, memberId, iso)` → the `ok` hold covering `iso` or null. `_holdMap_(holds, iso)` → `{ memberId: hold }` for one day.
- `_holdOverlap_(holds, memberId, mulai, sampai, exceptId)` → bool.
- `_holdHeldWeeks_(holds, memberId)` → set of week-start ISO dates with ≥ 4 held days (`HOLD.weekDays` = 4).
- `_holdLabel_(hold, todayIso)` → "Cuti s/d Jum 12 Des" / "Sakit" / "Nonaktif" / "Mulai Sen 8 Des".
- `HOLD` constants: `weekDays: 4`, `coachBackDays: 30`, `requestMaxDays` (Script Property `HOLD_REQUEST_MAX_DAYS`, default 60, clamp 7–180), `noteMax: 200`, `returnLightDays: 14`.

Public functions:

| Function | Guard | List | Notes |
| --- | --- | --- | --- |
| `setClientHold(token, memberId, data, opts)` | `requireAdmin_` | WRITE, `IDEM_DURABLE` | create or edit (`data.id`); validates type, dates, overlap, note length; `opts.cancel = [scheduleId]` cancels those sessions (must belong to the member, not completed, inside the range) in the same `_locked_` block, then `_bustSlots_()`; returns `{hold, holds, inRange}` where `inRange` = this member's not-completed sessions inside the range (the sheet calls once with `opts.dry` to show them) |
| `endClientHold(token, holdId, iso)` | admin | WRITE | ends today (default) or on `iso`; berhenti → reactivate |
| `deleteClientHold(token, holdId)` | admin | WRITE | only planned holds or same-day mistakes → `batal` |
| `decideHoldRequest(token, holdId, approve, opts)` | admin | WRITE, `IDEM_DURABLE` | like `decideRenewal`; `opts.cancel` as above |
| `requestMyHold(memberToken, data)` | `requireMember_` first | WRITE, `IDEM_DURABLE` | member from the token; one open `minta`; `cuti` needs `Sampai`; ≤ `requestMaxDays`; start ≥ today; throttle 1/10 s; Telegram first name + type + dates; push kind `cuti` to the coach |
| `cancelMyHoldRequest(memberToken, holdId)` | member | WRITE | own `minta` only → `batal` |
| `endMyHold(memberToken)` | member | WRITE | ends the own active `cuti`/`sakit` today (not `berhenti`); coach Telegram line + push |

Every writer: `_bumpMember_(id)` after the write; holds also change the Klien list, so `getAdminBootstrap` readers see them through the member version.

Where holds are read:
- `getAdminBootstrap`: `holds` = active + planned + `minta` rows for all clients (`{id, memberId, jenis, mulai, sampai, status, by}`; **no `Catatan`**). The note comes only in `getClientBundle.holds` (client page, admin only, full history).
- `getPortalBootstrap`: `hold` = own active/planned hold and own pending request (`{jenis, mulai, sampai, status}`; the client's own note is returned to them only).
- `getPortalMore` / `getClientBundle` version: bumped by the writers above.

### Effects (one place each)
1. **Reminder pools**: `_buildClientPools_(members, schedules, now, holdMap)` (pure, already the single source for every pool-based job, `Push.gs` and `ProgramAuto.gs`): held clients leave `active`, `bookable` and `all` and go to `held` + `heldNames`. `_loadClientPools_` passes `_holdMap_(_holdRows_(), today)`. `ulang-tahun` iterates `active.concat(held)` (owner can flip `HOLD_KEEP_TYPES`). Jobs that do not use pools (e.g. `sesi-besok`, `rekap-bulanan`, `selamat-milestone`, meal planner paths) get an explicit `_holdMap_` check. `_rmdSendDigest_` gets an optional footer "Ditahan: …" (first names). **Test**: for every job in `REMINDER_JOBS` and every push kind, a held client gets nothing (and `ulang-tahun` follows `HOLD_KEEP_TYPES`).
2. **Push planner** (`_pushPlanMessages_`): same pools, plus a hold check for session pushes.
3. **Booking**: `clientBookSchedule`, `clientRescheduleSchedule`, `clientBookRecurring` check `_holdActiveOn_` for the session date (and any active `berhenti`): with `opts.soft` → `{status:'conflict', code:'hold', message}`; without → throw the same Indonesian sentence. Admin `addSchedule` returns `warning: 'Klien sedang cuti s/d …'` and saves.
4. **Streak**: `_streak_(weeks, todayIso, heldWeeks)` and `_bestStreak_(weeks, heldWeeks)`: a held week with no session is skipped (neither counts nor breaks); a held week with a session counts. Old signature (no third argument) behaves as today.
5. **Monthly challenge**: `_monthlyChallenge_` → `target = ceil(target × freeDays / daysInMonth)`, `hidden: true` when `freeDays < 7`.
6. **Signals / hub**: `_clientSignalsCalc_` drops inactivity flags for held clients and sets `hold`; `getCoachHub().holds` = active + ending within 3 days (first name, type, end).
7. **Auto program**: `runProgramAutoJob_` skips held clients. Lighter return: only after a sourced rule is added to [../program/Rules.md](../program/Rules.md) and `PGEN` (task T-2409 is blocked on that source).
8. **Warm cache**: `_warmPick_` skips held clients.
9. **Return day**: inside `runReminderTick`, a daily step at 07:00 WIB (`runHoldReturnJob_`, not a reminder type, guarded by ReminderLog key `kembali|<date>`) sends the coach one Telegram digest "Aktif lagi hari ini" with, when `kembali-latihan` is on, one `wa.me` button per client (template in `RMD_TPL_DEFAULT`, tone rules of `tests/reminder-variants.test.js`). Planned holds starting today get one line too ("Mulai cuti hari ini").

### Panel UI
- **Klien list**: `clientState(m)` gains `'held'` (checked first, from `window.holds`); chip **Ditahan**; `statePillHtml` shows `_holdLabel_` text (computed in the browser from the same rules, or sent as `label`); counts exclude held from Aktif/Hampir/Habis.
- **Client page**: band `.hold-band` under the hero (label + **Ubah** + **Akhiri** / **Aktifkan lagi**); "Tahan klien" in the hero ⋯ menu. History fold in Ringkasan.
- **Sheet `#sheet-hold`** (bottom sheet on phones): type segmented control (Cuti · Sakit · Berhenti), Mulai (default today), Sampai (date + quick chips "1 minggu", "2 minggu", "Belum tahu"), Catatan (private, "hanya terlihat coach"), then the list of sessions in range with check boxes (from a `dry` call, ≤ 1 call), **Simpan**. Saves through `optimistic({q, tmp})`; the list pill changes at once; undo restores.
- **Dashboard**: "Minta cuti" card next to "Minta perpanjang" (same component), approve opens the session list when there are sessions in range.
- **Coach hub**: fold "Ditahan (n)".
- Desktop: the same sheet as a side panel; the band spans the hero grid (`grid-area`).

### Portal UI
- Hari ini: hold card (accent-free, calm) with **Saya sudah kembali** (`optimistic({q})`, confirm first).
- Saya and the ＋ sheet: **Ajukan cuti** → `#sheet-cuti` (prefix `cu-`; check no clash): type, dates, note, **Kirim**. Pending state card with **Batalkan**. Approved / rejected shows once (notif list through `_notifCalc_`).
- Booking wizard: hold days in the calendar are shown as unavailable with the reason.
- Offline snapshot: add `hold` label only.

### Tests
`tests/hold.test.js`: pure helpers, overlap, week rule, label; writers (guards, validation, idempotency, cancel sessions + quota, bump); pools (every job/push kind); booking soft conflict; streak bridging; challenge; request → decide → end flow; note never in bootstrap / Telegram / push payloads. `api-lists.js`, `cache-version.test.js`, `security.test.js` updated. Browser-check section "Tahan klien" (phone + 1440, light/dark).

---

## AD2 — Measurement guide + Pinggul

### Pinggul as a measure
- `PROGRESS_HEADERS` gains `"Pinggul (cm)"` at column 14 (N); `PROGRESS_MEASURES` gains `{ key: 'pinggul', label: 'Lingkar pinggul', short: 'Pinggul', unit: 'cm', col: 14, min: 40, max: 200 }` (same limits as `saveAssessment`). `_ensureProgressColumns_` adds the header (append-only, rule 4).
- `saveAssessment`: the hip value also goes into the coach's Progress entry for that date (Assessments column M keeps being written, so old readers still work).
- One-time copy `_hipCopyOnce_()` (Script Property `HIP_COPY_V1`, under the script lock, idempotent): every Assessments row with a hip value and no Progress `pinggul` on that member + date becomes a coach Progress entry (or fills that cell). Run from `getAdminMore` like `_repairDateCells_`.
- Everything that maps over `PROGRESS_MEASURES` picks it up (portal form, chart, insights `Wawasan.gs`, share cards `BagikanData.gs`, offline snapshot). Check `share-check.js` still fits the Ukuran tubuh card with 9 measures.
- Library compat: `check-compat.js` stays green.

### Guide (built)
- Part `parts/app/21-cara-ukur.part` (closes the App IIFE now) and theme part `10-cara-ukur.part` (closes `</style>`).
- `UKUR_LINE[sex][line] = [y %, x1 %, x2 %]` on the front view of `figure/figure.min.json` (viewBox 724 × 1448); `lengan` and `paha` are drawn on the client's right side (viewer's left) and mirrored around `UKUR_MID[sex]` for *kiri*. `UKUR_STEPS` (3 steps per line, Berat has rules only and a scale icon), `UKUR_UMUM` (4 general rules). Sex from `figSexOf` (nutrition profile), male by default. When the figure is not on the device yet a grey skeleton shows and `figEnsure()` redraws it.
- Every measure label in `#sheet-progress` and `#modal-care-assess` is wrapped in `.lbl-help` with a 44 px `.help-btn` (`circle-help`) calling `window.ukurOpen(key)`. The sheet `#sheet-ukur` (prefix `uk-`) has a chip row to switch measures; closing it returns to the sheet it was opened from (`ui.sheetReturn`, handled in `closeModal`), with typed values kept.
- The assessment's separate hip field is gone: `as-pinggul` sits with the other measures and is empty on open like them (the old prefill would have written yesterday's hip as a new measurement).
- Sources: [Sumber.md](Sumber.md).

### Tests
`progress.test.js` (pinggul save/read/limits, assessment writes it, copy-once idempotent), `browser-check` "Cara ukur" (phone: every measure has a ? button, sheet opens, figure present, no sideways scroll).

---

## AD3 — Coach logger upgrade (coach panel only; built 2026-11-26)

Built as below, with these changes: server code is `src/CatatCoach.gs`, browser code part `23-catat-coach.part`, styles `12-catat-coach.part`. W2 = ⋯ "Isi seperti terakhir", a "Pakai" link on the "Naik ke … kg" line and top-menu "Ulangi latihan terakhir" (`wlRebuild` with the last logged routine). W4: deleting one exercise already existed through "Ubah" on a past day (⋯ → Hapus catatan gerakan ini); new is the trash button for a whole day (`deleteWorkoutEntries` with no keys, which also removes the `WorkoutSessions` row). W5 = "Riwayat lengkap gerakan ini" under the strength chart, sheet `#sheet-wkx`. W6 = top-menu "Ganti klien" (clients with a session within 60 minutes of this one, plus any open coach draft; each keeps its own `adm:<id>` draft). F1 marks coach entries with a `coach-` CID (no new FoodLog column). F3: `getClientFoodLog(token, id, days)` returns `{days, n, feedback, stats}`; the Gizi tab has a 7 / 31 day switch.

Boundary: the client logger (`mode: 'client'`), `logMyWorkout`, `logMyFood`, their queues (`xnk_wl_queue`, `xnk_food_queue`), storage keys and cids are **not changed**. Coach code goes into a new part `parts/app/21-coach-catat.part` plus small hooks in the existing logger (`mode === 'admin'` branches only). Server functions are admin-only. Client-visible additions (W3 cue line, F2 food note) are read-only (owner: yes).

### Workout
- **W1** `wlFinish` in admin mode with `wl.scheduleId`: a check "Selesaikan sesi juga" (default on when the session is today and not completed) → after the log save, `completeSession` through the same queue (`optimistic({q})`), then the session note as today. No server change.
- **W2** "Isi seperti terakhir" (per exercise ⋯ and the top menu "Ulangi latihan terakhir") fills sets from `wkAdmin[id].best/last`; +kg chip from `suggest`. Browser only.
- **W3** sheet **`ExerciseNotes`**: `ID | Member ID | Exercise Key | Setelan | Cue | Diubah Pada | Oleh` (key = `_exKeyOf_`, canonical through `exCanon`). Admin `saveExerciseNote(token, memberId, exKey, data)` (upsert, empty both = delete; WRITE); read in `getClientBundle.workout.notes` and the coach logger data. Optional client read: `getPortalMore.workout.notes` (`{key: {setelan, cue}}`), rendered as one line in the client logger card (owner decision 2026-11-26: yes).
- **W4** admin `deleteWorkoutEntries(token, memberId, date, keys)` (`keys` empty = whole day; rows by any author; `_locked_`, bump, WRITE) → history ⋯ "Hapus gerakan" / "Hapus latihan hari ini", `optimistic({q})` with undo (undo re-saves the removed sets through `saveWorkoutLog`).
- **W5** client page Latihan tab: exercise picker (from the client's own history) → table + e1RM sparkline; data already in `_workoutFor_` (90 days); add `readDays` 365 for this view only through admin `getWorkoutExerciseHistory(token, memberId, exKey)` (READ_OK) when older data is asked for.
- **W6** logger top bar in admin mode: client switcher (clients of the same session start / class key, or "Tambah klien"); each client is its own `wl` state under `adm:<memberId>` (already separate drafts); Selesai saves each through its own queue item. The rest timer is shared.

### Food
- **F1** admin `logClientFood(token, memberId, entry)` and `deleteClientFood(token, memberId, logId)`: same validation as `logMyFood` (`_foodLogEntry_`, cid, date ≤ 30 days back), `Sumber` = `coach`; `IDEM_DURABLE` for the creator; bump. Panel Gizi tab: **+ Catat** with the existing food search (shared component, admin call).
- **F2** sheet **`FoodFeedback`**: `ID | Member ID | Tanggal | Tanda | Catatan | Oleh | Diubah Pada` (`Tanda`: `pas | kurang | lebih | ''`; one row per member + date, upsert, empty = delete). Admin `saveFoodFeedback(token, memberId, date, data)` (WRITE). Client read in `getPortalMore.nutrition.feedback` (last 14 days), one line under that day in Makan.
- **F3** `getClientFoodLog(token, memberId, days)`: optional `days` (7 default, max 31); the Gizi tab draws a month calendar (filled = target ±10 %, outline = logged, empty = none; monochrome + `--danger` only for far over), weekly averages and top foods computed on the server (`_foodMonthStats_`, pure).

### Tests
`coach-log.test.js` (guards, cue upsert/delete, delete entries + undo path, food log by coach, feedback upsert, 31-day log, stats), `api-lists.js`, `cache-version.test.js`, `idempotency.test.js`. Browser-check "Catat coach" (phone + desktop: repeat last, switch clients, finish + complete session, food + feedback). A check that the client logger DOM at 390 px is unchanged (screenshot compare, like Phase Y) unless W3/F2 client lines are on.

---

## AD4 — PDF report on demand (built 2026-11-26)

Built as below, with these changes: no server cache (made only on a tap); no Cetak button; Bagikan uses `navigator.share` with the PDF file and falls back to a download (the iframe wrappers only accept PNG / video, so on the old wrapper pages the PDF downloads); the report counts a week as active when it has a coach session **or** a logged workout; sections start a new page only when the remaining space is too small; the footer brand goes through `TEXT_SWAPS` (`window.brandName()` on the Library). Check: `tools/report-check.js` (CI step "PDF report check").

### Server (`src/Laporan.gs`)
- Pure `_reportCalc_(src, from, to, tone)` → `{ period, prev, headline:[{key,label,value,unit,delta}], attendance, holds, training, body, nutrition, tests, notes, text:{summary:[…], next:[…]} }`. Reuses `_workoutStats_`, `_insightBody_`, `_insightTraining_`, `_insightActivity_`, `_completedWeeks_`, `_foodLogTotals_`, `_sharedNotesFor_` (client-safe notes only). Interpretation sentences follow the client tone rules (no RPE, soft labels).
- Member `getMyReport(memberToken, req)` and admin `getMemberReport(token, memberId, req)` (both READ_OK, read-only; `req = {from, to}` max 400 days; admin also gets the client tone, because the report is for the client). Reads through `_sheetRowsMemo_`; result cached by `(memberId, from, to, member version)` for 10 min (`_reportCache_`), never shared across clients.
- Nothing is stored; no Drive, no email.

### Browser (`parts/app/22-laporan.part`)
- Sheet `#sheet-report` (prefix `rp-`): period chips, section switches (saved in `localStorage xnk_report_prefs`, device only), coach message (draft in `xnk_report_draft:<memberId>`, device only, cleared on logout with the other caches), **Buat PDF**.
- Layout: pages drawn on canvas at A4 150 dpi (1240 × 1754) with the share-card drawing helpers in `Bagikan.html` (fonts Anton / Inter, `caps()`, chart helpers), black and white + `--accent` read from the page (never a hex in code). Text wraps with a measured line breaker; a section that does not fit moves to the next page.
- PDF writer: a small built-in writer (no library, like the .xlsx builder in part 18): each page = one JPEG image object (`canvas.toBlob('image/jpeg', 0.85)`), PDF 1.4 with `/MediaBox [0 0 595 842]`, xref, trailer; target ≤ 400 KB per page. File name `Laporan-<NamaDepan>-<yyyy-mm>.pdf`.
- Preview: the page images in a scrollable full-screen view; **Bagikan** through the wrapper share (`{xnk:'share', files}`; in-frame `navigator.share` fallback), **Unduh** (`a[download]`), desktop also **Cetak** (prints the images).
- Library / hub: brand name via `window.brandName()`; "Didukung XNK" footer only through `TEXT_SWAPS` (production byte-identical).

### Tests
`report.test.js` (pure calc on `seededEnv`, deltas, hold and nutrition sections, privacy: no phone, no RPE, no private notes, no hold note; guards; member reads only own data). `tools/report-check.js` (Playwright): builds a PDF in both modes, checks it starts with `%PDF-`, page count, size limit, and that every section stays inside the page margins (like `share-check.js`).

## AD5 — Clearer client report (built 2026-11-27)

Owner's brief: the AD4 PDF showed many numbers with no story; clients felt lost. One report, client tone, same privacy as AD4 (no RPE, private notes, hold notes, phone, photos).

### Server (`_reportAnalysis_` in `src/Laporan.gs`, pure)
- `skor = {total, status, vonis, pilar[]}`: four pillars 0–100, status `baik` ≥ 75, `cukup` ≥ 50, else `perlu` (`REPORT.baik/cukup`). A pillar without data is `null` and not counted.
  - Konsistensi = 70 × active weeks / non-hold weeks + 30 × min(1, sessions per week / `sesiTarget` 2).
  - Kekuatan = 50 + 5 × median e1RM % change (lifts logged ≥ 2×) + 5 per PR (max 20).
  - Tubuh = 60 ± weight change vs the client's `Goal Gizi` (turun/naik; jaga/recomp/none reward ≤ 2 % change) + 15 if waist went down.
  - Makan = 40 × logged-day ratio (of 80 % of days) + 35 × days within ±10 % of target + 25 × protein days.
- `menang` (≤ 3 wins, ranked), `fokus` (≤ 2: last coach focus note, then the weakest pillars' advice).
- `analisis`: `kehadiran` (per week, longest gap), `kekuatan`, `volume` (weekly volume in the period, previous-period weekly average, volume per body group now vs before, push/pull and upper/lower balance sentence), `tubuh` (change per week, healthy-rate sentence for `turun`), `makan` (daily kcal, days on target, weekday vs weekend), `glosarium`. Each has `tafsir` starting "Artinya:".
- `latihan.angkatanSemua` (up to 6 lifts with best set); `angkatan` stays the first 3.
- Non-ASCII in server strings is written as `\u` escapes (the demo build mangled raw `−`).

### Browser (`parts/app/24-laporan.part`)
Page 1 is a one-page summary: cover, score gauge + verdict, pillar cards, "Hal terbaik", "Fokus berikutnya", coach message. Detail pages: Angka utama, Kehadiran (a real month calendar: month title, Sen–Min, dates; coach session = filled, own workout = ring, food only = dot, hold = grey; then weekly bars and Artinya), Kekuatan (lift table + sparklines + PRs), Volume & keseimbangan (weekly bars with previous average line, body-group bars), Tubuh (weight line, start→end dot scale, tests with membaik/turun), Makan (daily kcal vs target band, needs ≥ 3 days), Catatan sesi, Istilah.
- T-2452: icons (Lucide nodes turned into SVG images: calendar-check, dumbbell, person-standing, utensils, trophy, user-round), the logo (`--logo-mask` PNG, tinted like `.logo-mark`) on the cover and in the footer, a coach box on the cover, and the muscle figure (`mmFigSvg` from `figure.min.json`, sex from the client's Gizi profile, muscles from `analisis.volume.figur`) on the Volume page. Each image is optional: if it does not load, that part is skipped.
