# Phase AC — TODO (T-2300…T-2399)

What: [PRD.md](PRD.md). How: [Design.md](Design.md). `[ ]` open · `[~]` in progress · `[x]` done · `[-]` dropped.
Build order: AC2 → AC1 → AC3 → AC4. Each task: tests, checks (Agent.md §5), docs (Agent.md §7, `apps-script/README.md`), tick here.

## AC2 — Measurement guide + Pinggul
- [ ] **T-2300** `Sumber.md` for U01–U08: check each step against WHO STEPS / ISAK text; remove ⚠ or rewrite.
- [ ] **T-2301** Pinggul in `PROGRESS_HEADERS` / `PROGRESS_MEASURES` (column 14), `saveAssessment` also writes it, `_hipCopyOnce_` (idempotent, locked), tests.
- [ ] **T-2302** Every reader of measures shows Pinggul (portal, panel, insights, share cards with 9 measures in `share-check.js`, offline snapshot); Library `check-compat.js` green.
- [ ] **T-2303** Part `20-cara-ukur.part`: `MEASURE_GUIDE`, figure with tape line (front/side, both sexes), `#sheet-ukur`, ? buttons in client, coach and assessment sheets; browser-check "Cara ukur".

## AC1 — Hold a client
- [ ] **T-2304** Sheet `ClientHolds`, `src/Cuti.gs` pure helpers + `HOLD` constants, tests.
- [ ] **T-2305** Admin `setClientHold` (dry run, cancel sessions in range, `_bustSlots_`), `endClientHold`, `deleteClientHold`; bootstrap `holds`, bundle history with note; api lists, `IDEM_DURABLE`, bump.
- [ ] **T-2306** Effects: `_buildClientPools_` holds (every reminder job + push kind tested, `HOLD_KEEP_TYPES = ['ulang-tahun']`, digest footer), booking soft conflict / admin warning, `_warmPick_`, `runProgramAutoJob_` skip.
- [ ] **T-2307** Streak bridging (`heldWeeks`), monthly challenge pro rata, signals and `getCoachHub().holds`.
- [ ] **T-2308** Panel UI: Klien chip **Ditahan**, pills, counts, hero band, `#sheet-hold` with session list, history fold, hub fold; phone + desktop, light/dark; browser-check "Tahan klien".
- [ ] **T-2309** Return day job `runHoldReturnJob_` (Telegram digest, `kembali-latihan` template **off by default**, coach push). Lighter-return rule for the auto program: blocked until a source is added to program/Rules.md (owner may drop).
- [ ] **T-2310** (AC1b) Member `requestMyHold`, `cancelMyHoldRequest`, `endMyHold`; admin `decideHoldRequest`; Telegram (no note), push kind `cuti`; tests.
- [ ] **T-2311** (AC1b) Portal: hold card + **Saya sudah kembali**, **Ajukan cuti** sheet, pending/decided states, booking calendar shows hold days; Dashboard "Minta cuti" card; offline snapshot label.

## AC3 — Coach logger upgrade (owner to strike items, PRD Q4)
- [ ] **T-2320** W1 Simpan & selesaikan sesi from the logger.
- [ ] **T-2321** W2 Isi seperti terakhir / Ulangi latihan terakhir / +kg chip.
- [ ] **T-2322** W3 `ExerciseNotes` (setelan alat + cue), coach logger line; client read-only line only if PRD Q3 = yes.
- [ ] **T-2323** W4 `deleteWorkoutEntries` + history actions with undo.
- [ ] **T-2324** W5 Riwayat per gerakan on the client page (`getWorkoutExerciseHistory`).
- [ ] **T-2325** W6 Two or more clients in one logger session.
- [ ] **T-2326** F1 `logClientFood` / `deleteClientFood` + **+ Catat** in the Gizi tab.
- [ ] **T-2327** F2 `FoodFeedback` + day mark and note; client read-only line only if PRD Q3 = yes.
- [ ] **T-2328** F3 31-day food log, month calendar, weekly averages, top foods (`_foodMonthStats_`).
- [ ] **T-2329** Browser-check "Catat coach" + client logger 390 px unchanged check.

## AC4 — PDF report on demand
- [ ] **T-2340** `src/Laporan.gs`: `_reportCalc_` (pure), `getMyReport`, `getMemberReport`, cache, privacy tests.
- [ ] **T-2341** Built-in PDF writer (JPEG pages) + unit test (valid structure, page count, size).
- [ ] **T-2342** Page layout on canvas (cover, ringkasan, kehadiran, latihan, tubuh, makan, dari coach, rencana) with the share-card helpers; accent from the page.
- [ ] **T-2343** `#sheet-report` (period, sections, coach message draft), preview, Bagikan / Unduh / Cetak; buttons in portal Progres + Saya and the client page menu.
- [ ] **T-2344** `tools/report-check.js` (both modes, margins, Library build with `TEXT_SWAPS` footer).
