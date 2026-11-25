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
| ⋯ menu (`#sheet-cp-more`) | Tambah: PR baru, Tes kebugaran, Latihan yang lewat, Catatan privat · Kirim lewat WA: ringkasan latihan, hasil tes, pengingat form kesehatan · Bagikan kartu · Klien: Ubah data, Hapus klien | Head right on every tab |
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
| Three share buttons in Progres | ⋯ → Bagikan kartu |
| Foto | Progres › Foto (rows → private viewer; only the client uploads) |
| + Tes, Kirim hasil via WA | ⋯ → Tes kebugaran / ⋯ → Hasil tes |
| Six share buttons | ⋯ → Bagikan kartu |
| Delete per measurement | Tap the row → Hapus |
| "Ubah" per workout day | Tap the row → Ubah |
| Ubah program, Lainnya (auto, pantangan, regenerate) | "Atur program" → one sheet; catat yang lewat / WA summary → ⋯ |
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
- Removed from the tab: Catat ×2 (action bar), Foto button (sub-tab), three share buttons (⋯ → Bagikan kartu), the per-entry delete icons (row sheet). ⋯ → Tambah no longer lists "Foto progres": only the client uploads photos.
- Server: `getClientBundle.athlete` now also carries `moments` (computed by `_portalXFor_` already; one additive field).

### Latihan (Wave 3)
Berikutnya (no buttons), program day cards + "Atur program", Minggu ini vs biasanya, Kekuatan (one list, tap expands the chart), Volume & keseimbangan, Riwayat (tap a row → Ubah).

### Gizi (Wave 4)
Saran penyesuaian first, Hari ini (ring + macro bars + 7-day bars), Buku harian per meal (read-only), Data & dasar with "Ubah data gizi".

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
