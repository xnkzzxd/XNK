# TODO — Phase AC (T-2300+): Klien list + client profile

Read [PRD.md](PRD.md) and [Design.md](Design.md) first. Owner's panel UI rule: build, send before/after screenshots (390×844, 1280×800, 1440×900, light + dark), push only after the owner says yes. Status: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` dropped.

Wave 1 (one approval) — built and approved by the owner 2026-11-25 (PR #201)
- [x] T-2300 Docs: PRD, Design (wireframes, button map, call table), TODO; index row, CLAUDE.md line.
- [x] T-2301 Server: `getClientBundle` parts `notes` / `todo` (`_coachTodoCalc_`; the week summary already comes in `insight.week`), writers return their part, `getSettingsBundle`; `tests/client-page.test.js`.
- [x] T-2302 Klien list: phone (band subtitle, sticky toolbar, chips, new rows, stray grey block) and PC split (icon button, search row, filter + sort selects, 56 px rows).
- [x] T-2303 Profile shell + Ringkasan + Data: head with the name and ⋯, black client card with the action bar, five light sticky tabs, Ringkasan (Sesi berikutnya, Tugas coach, Minggu ini, PR, Sesi), Data hub, client wiring for write answers and notes from the bundle.

Wave 2 — built and approved by the owner 2026-11-25 (PR #201)
- [x] T-2304 Progres: sub-tabs Ringkasan · Ukuran · Tes · Foto (no calls on switch), light Rapor tubuh without buttons (`cpRaporHtml`), Momen from bundle `athlete.moments`, one chart with a measure picker, Riwayat catatan rows → `#sheet-cp-row` (values + Hapus) instead of delete icons, Foto rows → private viewer (one `getMemberProgressPhoto`), badges under Foto; ⋯ loses "Foto progres" (coaches cannot upload).

Wave 3 — built and approved by the owner 2026-11-26 (PR #201)
- [x] T-2305 Latihan: Program section (profile line, day cards with the next day marked **Berikutnya** and open, other days folded to one line of names) + **Atur program** sheet `#sheet-cp-prog` (Ubah/Buat program, otomatis switch, pantangan, Buat ulang otomatis, client routines); light Minggu ini vs biasanya + activity line; Kekuatan as one folding list (tap = PR + full chart); Volume & keseimbangan in one card; Riwayat rows (tap = Ubah). Two columns on wide panels. No share buttons, no button rows. Owner's review: sharing moved to one share icon in the head (card for the open tab; out of ⋯), the activity heatmap spans the card, Atur program uses settings rows with switches instead of pill buttons.

Wave 4 — built and approved by the owner 2026-11-26 (PR #201). Phase AC is complete.
- [x] T-2306 Gizi: advice first, Hari ini (light calorie ring + macro bars side by side), 7 hari (bars + sentence, replaces the hero), Buku harian per meal (`<details>` per day, read-only), Data & dasar (plain numbers, flags, one-line input rows, "Ubah data gizi" link).
- [x] T-2307 Checks and docs: per-tab button budgets and "no share buttons in tabs" checks in `browser-check` (Progres, Latihan, Gizi), call checks (sub-tab switch 0, photo view 1), Agent.md §7, apps-script/README.md, Design.md.
- [x] T-2308 Follow-up (2026-11-26): black box behind "Cari klien / Terbaru" in dark mode on the static site. Cause: `host-local.js` painted the app's body with the band colour after a theme change; it now colours only the status bar meta and `<html>` (host-check asserts it).
