# Phase AD — TODO (T-2400…T-2499)

What: [PRD.md](PRD.md). How: [Design.md](Design.md). `[ ]` open · `[~]` in progress · `[x]` done · `[-]` dropped.
Build order: AD2 → AD1 → AD3 → AD4. Each task: tests, checks (Agent.md §5), docs (Agent.md §7, `apps-script/README.md`), tick here.

## AD2 — Measurement guide + Pinggul
- [x] **T-2400** `Sumber.md` for U01–U08: steps checked against WHO and ISAK summaries (ISAK wording still to confirm against the official manual; noted in Sumber.md). Perut and Berat are marked as common practice, not protocols.
- [x] **T-2401** Pinggul in `PROGRESS_HEADERS` / `PROGRESS_MEASURES` (column 14), `saveAssessment` also writes it, `_hipCopyOnce_` (idempotent, locked), tests.
- [x] **T-2402** Every reader of measures shows Pinggul (portal, panel, insights, share cards); Library `check-compat.js` green. `offline.js` keeps its six-measure subset (changing it means syncing BookingPT-Client; not needed).
- [x] **T-2403** Part `21-cara-ukur.part`: `UKUR_LINE` / `UKUR_STEPS`, front figure with tape line (both sexes; no side view needed), `#sheet-ukur`, ? buttons in client, coach and assessment sheets; browser-check "Cara ukur".

## AD1 — Hold a client
- [x] **T-2404** Sheet `ClientHolds`, `src/Cuti.gs` pure helpers + `HOLD` constants, tests.
- [x] **T-2405** Admin `setClientHold` (dry run, cancel sessions in range, `_bustSlots_`), `endClientHold`, `deleteClientHold`; bootstrap `holds`, bundle history with note; api lists, `IDEM_DURABLE`, bump.
- [x] **T-2406** Effects: `_buildClientPools_` holds (every reminder job + push kind; `HOLD_KEEP_TYPES = ['ulang-tahun', 'sesi-besok']`; the "Ditahan:" digest footer was dropped), booking soft conflict / admin warning, `_warmPick_`, `runProgramAutoJob_` skip.
- [x] **T-2407** Streak bridging (`heldWeeks`), monthly challenge pro rata, signals and `getCoachHub().holds`.
- [x] **T-2408** Panel UI: Klien chip **Ditahan**, pills, counts, hero band, `#sheet-hold` with session list, history fold, hub fold; phone + desktop, light/dark; browser-check "Tahan klien".
- [x] **T-2409** Return day: built as a normal reminder type `kembali-latihan` (07:00, **off by default**, one `wa.me` button per client whose hold ended yesterday by itself; `sendKembaliLatihanDigest_`, `_holdReturning_`), so the owner gets the usual on/off, hour and template editing in Pengaturan. No separate coach push (the hub lists who comes back soon).
- [-] **T-2409b** Lighter first sessions after a long hold for the auto program: needs a sourced rule in program/Rules.md first; not built.
- [x] **T-2410** (AD1b) Member `requestMyHold`, `cancelMyHoldRequest`, `endMyHold`; admin `decideHoldRequest`; Telegram (no note), push kind `cuti`; tests.
- [x] **T-2411** (AD1b) Portal: hold card + **Saya sudah kembali**, **Ajukan cuti** sheet, pending/decided states, booking calendar shows hold days; Dashboard "Minta cuti" card; offline snapshot label.

## AD3 — Coach logger upgrade (owner: build all)
- [x] **T-2420** W1 Simpan & selesaikan sesi from the logger.
- [x] **T-2421** W2 Isi seperti terakhir / Ulangi latihan terakhir / +kg chip.
- [x] **T-2422** W3 `ExerciseNotes` (setelan alat + cue), coach logger line; client read-only line (owner: yes).
- [x] **T-2423** W4 `deleteWorkoutEntries` + history actions with undo.
- [x] **T-2424** W5 Riwayat per gerakan on the client page (`getWorkoutExerciseHistory`).
- [x] **T-2425** W6 Two or more clients in one logger session.
- [x] **T-2426** F1 `logClientFood` / `deleteClientFood` + **+ Catat** in the Gizi tab.
- [x] **T-2427** F2 `FoodFeedback` + day mark and note; client read-only line (owner: yes).
- [x] **T-2428** F3 31-day food log, month calendar, weekly averages, top foods (`_foodMonthStats_`).
- [x] **T-2429** Browser-check "Catat coach" (logger setup line, finish + complete session, coach food log, day mark). The client logger only gains the read-only setup line; no pixel compare was added.

## AD4 — PDF report on demand
- [x] **T-2440** `src/Laporan.gs`: `_reportCalc_` (pure), `getMyReport`, `getMemberReport`, privacy tests (no server cache: the report is made only on a tap).
- [x] **T-2441** Built-in PDF writer (JPEG pages) + unit test (valid structure, page count, size).
- [x] **T-2442** Page layout on canvas (cover, ringkasan, kehadiran, latihan, tubuh, makan, dari coach, rencana) with the share-card helpers; accent from the page.
- [x] **T-2443** `#sheet-report` (period, sections, coach message draft), preview, Bagikan / Unduh; buttons on portal Progres, Saya (phone and desktop) and the client page (Ringkasan). No separate Cetak button: the PDF prints from any viewer.
- [x] **T-2444** `tools/report-check.js` (both modes, margins, Library build with `TEXT_SWAPS` footer).
