# Tasks: Phase H (Keuangan)

Work items for [PRD.md](PRD.md), built as described in [Design.md](Design.md). Rules: [../Agent.md](../Agent.md).

- IDs start at **T-400**.
- Size: **S** ≈ under 2 h, **M** ≈ half a day, **L** ≈ a day or more.
- Status: `[ ]` todo · `[~]` in progress · `[x]` done. Tick the box in the same commit that finishes the task.
- One task = one commit (or a few), with tests passing. One sub-phase = one pull request.
- **Every UI task is done only when it also works on a phone:** 360–430 px, both themes, 44 px targets, the right keyboard, back gesture handled (main Design §8, PRD KM-1…KM-3).
- Build order: **H1 → H2 → H3 → H4**. Default = today's behavior: `FIN_ENABLED` and `FIN_PORTAL_VISIBLE` are off, reminder `tagihan` is off.

## H1: Data and server

Requirements: KU-1…4, BY-1…4, PG-1…3, KT-1…3, BH-1…3, MG-1, AR-1.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | T-400 | **Schema and settings.** `_ensureFinanceSchema_` (Tagihan, Pembayaran, Pengeluaran, KategoriKeuangan with seeded categories), `_finSchema_` header maps, `FIN_*` properties through `updateAppSettings({finance})` with `_finValidate_` / `_finWrite_`; `getAppSettings` returns `finEnabled`, `finPortalVisible`, `finMethods`. | Kode.gs, tests/finance.test.js (new), tests/settings.test.js | — | M | Reads never create sheets; seeding is idempotent; an empty method list falls back to the default; every admin finance call is refused while off. |
| [ ] | T-401 | **Bill on transaction + migration.** `_billFromTransaction_` called from every `Members` log append path (new client, renewal, renewal-request approval) when on; `_migrateFinance_` under the lock (old rows become Lunas, sets `FIN_MIGRATED`). | Kode.gs, tests/finance.test.js | T-400 | M | One transaction = one bill; while off no bill and `_revenueSummary_` unchanged; migration run twice gives `created: 0`. |
| [ ] | T-402 | **Payments CRUD and status.** `getBills`, `getBillDetail`, `saveBillAdjust`, `savePayment` (create/update, overpayment refused), `_billTotals_`, status cache rewrite. | Kode.gs, tests/finance.test.js, tests/security.test.js | T-401 | M | Lunas/DP/Belum bayar correct with discount and instalments; `total` change without `alasan` refused; Indonesian errors. |
| [ ] | T-403 | **Expenses and categories CRUD.** `saveExpense`, `getExpenses`, `saveFinanceCategory`, `deleteFinanceCategory` (refused when used), "Pemasukan lain" payments without a bill. | Kode.gs, tests/finance.test.js, tests/security.test.js | T-400 | M | Filters by month/category work; inactive categories hidden from editors but kept on old rows. |
| [ ] | T-404 | **Archive and restore.** `archiveFinanceItem` / `restoreFinanceItem` for bill, payment and expense (a bill cascades to its payments); archived rows are left out of totals. | Kode.gs, tests/finance.test.js, tests/security.test.js | T-402, T-403 | S | No row is ever deleted; restore brings totals back exactly; who and when are recorded. |
| [ ] | T-405 | **Coach share and summary.** `COACH_HEADERS` + `Bagi Hasil Tipe/Nilai` via `_ensureCoachSchema_`, `saveCoachShare`, `_coachShare_` (persen on fully-paid bills, sesi on completed sessions), `_financeSummary_`, `getFinanceOverview` (KPIs, 6-month series). | Kode.gs, tests/finance.test.js, tests/coach.test.js, tests/security.test.js | T-402, T-403 | M | Empty share = persen 65 (today's numbers); month boundaries in WIB; Tunggakan = Σ remaining; sesi count equals `getCoachHub`. |

## H2: Panel UI

Requirements: G31, G32, KM-1…3.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | T-410 | **Keuangan page and KPIs.** `NAV.admin` entry (when on), `TITLES.finance`, view markup, month stepper, `.kpi-grid`, `.bars`, `.seg` tabs, skeletons, pull to refresh; dashboard `#kpi-revenue-tile` becomes "Keuangan bulan ini" when on. | Index.html, App.html, Theme.html (only if a small layout rule is missing) | T-405 | L | Off = dashboard and nav exactly as today; on a phone the page needs no sideways scroll; first screen is one server call. |
| [ ] | T-411 | **Bills list and detail.** Filter chips (Semua/Belum/DP/Lunas/Arsip), search, `.list-item` rows with status pill, `openDetail` with `.timeline`, sticky foot WA Tagih / Lunasi / + Bayar, ⋯ menu. Desktop two-pane. | App.html, Index.html | T-410, T-402 | L | Back gesture: sheet → detail → page; WA text uses the template; status words always visible. |
| [ ] | T-412 | **Payment and expense sheets.** `#sheet-payment`, `#sheet-expense`, live thousand separators, method/category chips, date default WIB, inline errors, undo-archive toast; two new tiles in `#sheet-quick`. | Index.html, App.html | T-411, T-403, T-404 | M | Numeric keypad on phones, inputs 16 px, sticky Simpan above the keyboard; a payment from the quick sheet picks the right bill. |
| [ ] | T-413 | **Pengaturan → Keuangan.** `SET_SECTIONS` entry, toggles, methods chips, category rows (rename, reorder, active, delete-when-unused), "Sinkronkan transaksi", confirm on first enable showing the migration result. | App.html, Index.html | T-400, T-401, T-403 | M | Per-section save and dirty tracking like other sections; Batal restores; works at 360 px. |
| [ ] | T-414 | **Coach share field** in `#sheet-coach-profile` (`.seg` Persen/Per sesi + value), hidden while off. | App.html, Index.html | T-405 | S | Saved value shows again after reload; validation errors inline. |
| [ ] | T-415 | **Browser checks for H1–H2**: page, sheets, settings, phone 360/390 in both themes, desktop two-pane. | tools/browser-check.js | T-410…T-414 | S | Passes; the existing checks still pass. |

## H3: Reports, proofs, reminder

Requirements: LP-1…4, BK-1…2, RM-1.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | T-420 | **Laporan tab and CSV.** Arrears list (oldest first), per-category `.hbar`, coach share `.kv`; `exportFinanceCsv` (BOM, `;`, quoting) and a Blob download with a date range. | Kode.gs, App.html, Index.html, tests/finance.test.js, tests/security.test.js | T-411 | M | CSV opens correctly in Indonesian Excel; the arrears sum equals the KPI. |
| [ ] | T-421 | **Proof photos.** Private folder "XNK Keuangan" (`FIN_PROOF_FOLDER_ID`), `uploadFinanceProof` (replace and trash the old file), `getFinanceProof` as a data URL; photo field in both sheets; 📎 in the timeline. | Kode.gs, App.html, Index.html, tests/finance.test.js, tests/security.test.js | T-412 | M | No link sharing ever set (test on the fake Drive); a member token is refused. |
| [ ] | T-422 | **Reminder `tagihan`.** Job in Reminder.gs (open bills older than N days, one message, `wa.me` button per client, editable template, preview, Kirim tes); row in Pengingat Klien. Off by default. | Reminder.gs, Kode.gs, App.html, tests/reminder.test.js | T-402 | M | Nothing is sent while off; the message has only first name, package and remaining amount; retried on failure like other jobs. |

## H4: Portal

Requirements: PT-1…3.

| | ID | Task | Files | Depends | Size | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | T-430 | **`getMyBills`.** Member ID from the token only; `[]` while `FIN_PORTAL_VISIBLE` is off; exact key list. | Kode.gs, tests/finance.test.js, tests/security.test.js | T-402 | S | Key-list test passes; another member's ID in the arguments is ignored. |
| [ ] | T-431 | **Portal "Tagihan" card** on Beranda (read-only), plus a browser check at 360/390 in both themes. | App.html, Index.html, tools/browser-check.js | T-430 | S | The card is absent when off or empty; there is no button and no proof photo. |

## After H

- Update [../Agent.md](../Agent.md) §7, `apps-script/README.md` (Indonesian) and the root `README.md`, and tick the boxes above.
