# Design: Phase H, Keuangan

How to build [PRD.md](PRD.md). Tasks are in [TODO.md](TODO.md). The general rules are in [../Agent.md](../Agent.md). Phone rules are in [../Design.md §8](../Design.md). Everything here reuses what the app already has. Names in `code` exist today unless marked **new**.

## 0. Recap of today's pieces we build on

| Piece | Where | Use in Phase H |
| --- | --- | --- |
| `Members` log, `MEMBERS_LOG_HEADERS`, `MEMBERS_LOG_PRICE_COL` (K "Harga") | Kode.gs | Source of bills: one bill per Transaksi ID |
| `_revenueSummary_`, `REVENUE_SHARE` | Kode.gs | Kept as is while `FIN_ENABLED` is off; replaced by `_financeSummary_` when on |
| `getOrCreateSheet_`, `LockService.getScriptLock()`, `_numProp_` | Kode.gs | New sheets, writes, settings |
| `COACH_HEADERS`, `_ensureCoachSchema_` | Kode.gs | Append share columns |
| Private Drive folder pattern (`XNK Progress`, data-URL serving) | Kode.gs | Proof photos in "XNK Keuangan" |
| `kirimTelegramTombol_`, reminder jobs, templates | Reminder.gs | Reminder type `tagihan` |
| `NAV`, `TITLES`, `buildChrome`, `navigate` | App.html | New view `finance` |
| `openSheet`, `openDetail`, `syncBack`, `refreshAll`, `toast` | App.html | Editors, bill detail, back gesture, pull to refresh |
| `SET_SECTIONS`, per-section save bar | App.html | New section `keuangan` |
| `#kpi-revenue-tile`, `renderRevenueKpi` | App.html | Becomes "Keuangan bulan ini" when on |
| `#sheet-quick` (`quickAction`) | Index.html | Adds "Pembayaran" and "Pengeluaran" tiles |
| `.page-head`, `.kpi-grid`/`.kpi`, `.bars`, `.seg`, `.chips`/`.chip`, `.list`/`.list-item`/`.li-title`/`.li-sub`/`.li-trail`, `.pill`, `.timeline`, `.field`/`.input`/`.input-affix`, `.toggle`, `.btn*`, `.empty`, `.skeleton`, `.notice`, `.save-bar`, `.sheet`/`.sheet.tall`/`.sheet-foot` | Theme.html | All UI; no new colours, tokens only |

## 1. Data

All new sheets are created with `getOrCreateSheet_(name, headers)` only on an admin write, never on a read. They are read **by header name** (a `_finSchema_(sheet)` map like `_coachSchema_`). Columns are only appended (Agent rule 4). Money is a whole number of rupiah (`Math.round`, no decimals). Dates are `yyyy-MM-dd` strings in WIB (`_wibParts_`).

### 1.1 `Tagihan` (**new**)
| Header | Notes |
| --- | --- |
| ID Tagihan | `TG-` + timestamp36 + random |
| Transaksi ID | From the `Members` log, unique |
| Member ID, Nama Klien | Name copied for the list; renames are re-read from MemberData when shown |
| Paket ID, Nama Paket | From the transaction |
| Coach ID | From the transaction (for coach share) |
| Tanggal | Transaction date |
| Total | Column K price at the time |
| Diskon | Default 0 |
| Status | Cache only (D-33), rewritten after every payment change |
| Catatan | ≤ 300 chars |
| Dibuat Pada, Diubah Pada | ISO time |
| Diarsipkan Pada, Diarsipkan Oleh | Empty = active |

### 1.2 `Pembayaran` (**new**)
ID Bayar (`BY-…`) · ID Tagihan (empty = "Pemasukan lain") · Member ID · Tanggal · Jumlah · Metode · Kategori · Bukti File ID · Catatan · Dibuat Pada · Diubah Pada · Diarsipkan Pada · Diarsipkan Oleh

### 1.3 `Pengeluaran` (**new**)
ID Keluar (`PG-…`) · Tanggal · Kategori · Jumlah · Metode · Bukti File ID · Catatan · Coach ID (optional, for coach payouts) · Dibuat Pada · Diubah Pada · Diarsipkan Pada · Diarsipkan Oleh

### 1.4 `KategoriKeuangan` (**new**)
ID · Tipe (`masuk`/`keluar`) · Nama · Urutan · Aktif. Seeded once (PRD KT-2) inside `_ensureFinanceSchema_`.

### 1.5 `Coaches` (append)
`Bagi Hasil Tipe` (`persen` | `sesi`, empty = `persen`) · `Bagi Hasil Nilai` (empty = 65 for persen). Added to `COACH_HEADERS` at the end and handled by `_ensureCoachSchema_`.

### 1.6 Script Properties (**new**)
| Key | Default | Meaning |
| --- | --- | --- |
| `FIN_ENABLED` | off | Feature on/off (D-36) |
| `FIN_PORTAL_VISIBLE` | off | Clients see their bill (PT-1) |
| `FIN_METHODS` | `Tunai,Transfer bank,QRIS / e-wallet` | Payment methods, comma list |
| `FIN_MIGRATED` | — | Set after MG-1 has run |
| `FIN_PROOF_FOLDER_ID` | — | Private Drive folder |
| `RMD_TAGIHAN_*` | off, 3 days, 09:00 | Reminder type (Reminder.gs pattern) |

Saved through `updateAppSettings({finance:{…}})` with validate-then-write (`_finValidate_` / `_finWrite_`), like `_rmdValidate_` / `_rmdWrite_`. An empty value deletes the property.

## 2. Server

### 2.1 Rules
- Every public function starts with `requireAdmin_(token)`, except `getMyBills(memberToken)`, which reads the member ID **from the token** (`requireMember_`). All are added to `tests/security.test.js`.
- Writes run under `LockService.getScriptLock()` (wait 10 s, "Sedang sibuk, coba lagi." on timeout).
- Errors are Indonesian sentences ending with a period.
- Every admin call throws "Fitur keuangan belum aktif." while `FIN_ENABLED` is off, except settings.

### 2.2 Functions (**new**)
| Function | Does |
| --- | --- |
| `getFinanceOverview(token, month, year)` | KPIs (masuk, keluar, laba, tunggakan), 6-month series, coach share lines, counts. One call for the page's first screen. |
| `getBills(token, {status, month, year, q, archived})` | Bill list with `paid`, `remaining`, `status`, `ageDays` |
| `getBillDetail(token, billId)` | Bill + payments (no photo data) |
| `saveBillAdjust(token, billId, {diskon, catatan, total, alasan})` | Edits; `total` change needs `alasan` |
| `savePayment(token, p)` | Create (no `id`) or update; refuses overpayment ("Jumlah melebihi sisa tagihan Rp…") |
| `saveExpense(token, e)` | Create or update |
| `archiveFinanceItem(token, kind, id)` / `restoreFinanceItem(token, kind, id)` | `kind` ∈ `bill`, `payment`, `expense`; archiving a bill archives its payments |
| `getExpenses(token, {month, year, kategori, archived})` | Expense list |
| `saveFinanceCategory(token, c)`, `deleteFinanceCategory(token, id)` | CRUD; delete refused when used |
| `saveCoachShare(token, coachId, tipe, nilai)` | persen 0–100, sesi 0–10.000.000 |
| `uploadFinanceProof(token, kind, id, dataUrl)` | Saves JPEG to the private folder; replaces and trashes the old file |
| `getFinanceProof(token, kind, id)` | Returns a data URL |
| `exportFinanceCsv(token, kind, from, to)` | Returns `{filename, csv}`; the browser downloads it with a Blob |
| `getMyBills(memberToken)` | Only when `FIN_PORTAL_VISIBLE`; else `[]`. Keys: `paket, tanggal, total, paid, remaining, status, lastPaid` |

Private helpers (trailing `_`): `_ensureFinanceSchema_`, `_finSchema_`, `_billFromTransaction_`, `_billTotals_`, `_financeSummary_`, `_coachShare_`, `_migrateFinance_`, `_csv_`.

### 2.3 Bill creation
The function that appends a row to the `Members` log (new client and renewal paths, plus approval of a renewal request) calls `_billFromTransaction_(row)` after the append, inside the same lock, **only when `FIN_ENABLED` is on**. A failure there is logged and does not undo the transaction; the next `_migrateFinance_` fills the gap.

### 2.4 Status and totals
```
net       = total − diskon
paid      = Σ payment.jumlah (not archived)
remaining = max(0, net − paid)
status    = paid ≥ net ? 'Lunas' : paid > 0 ? 'DP' : 'Belum bayar'
```
- Masuk(month) = Σ payments whose Tanggal is in the month (cash basis).
- Keluar(month) = Σ expenses in the month.
- Laba = Masuk − Keluar.
- Tunggakan = Σ remaining of all active bills, regardless of month.

### 2.5 Coach share
- `persen`: share = round(bill net × nilai / 100), counted in the month the bill was **fully paid** (the last payment's date).
- `sesi`: share = nilai × sessions completed in the month (the same "completed by Completed At in WIB" definition as `getCoachHub`).
- When `FIN_ENABLED` is on, `#kpi-revenue-tile` uses `_financeSummary_`; when off, `_revenueSummary_` is untouched.

### 2.6 Migration (MG-1)
`_migrateFinance_()` runs under the lock when the owner first saves `FIN_ENABLED = on`, and from a "Sinkronkan transaksi" button. For each `Members` row without a bill, it creates the bill plus one payment (Jumlah = net, Metode "Lainnya", Catatan "Migrasi", Tanggal = transaction date). It sets `FIN_MIGRATED` and returns `{created, skipped}`. Running it twice creates nothing new.

### 2.7 Privacy
- Finance data never goes into: `getPublicSchedules`, `_memberPublicProfile_`, landing calls, `/exec?view=prices`, the admin localStorage cache (`xnk_admin_cache`) or email.
- Telegram (`tagihan`) carries only the client's first name, package and remaining amount, the same data the owner already sees.
- Proof photos follow Agent rule 7b.

## 3. Panel UI

### 3.1 Navigation
- `NAV.admin` gets `['finance', 'wallet', 'Keuangan']` **only when** `ui.settings.finEnabled`. `TITLES.finance = 'Keuangan'`.
- **Desktop / tablet (≥ 768 px):** the item appears in the sidebar after Coach.
- **Phone:** the tabbar keeps its 2 + fab + 2 layout (Dashboard, Jadwal, +, Klien, Coach). Keuangan opens from:
  1. the dashboard tile `#kpi-revenue-tile`, which becomes **"Keuangan bulan ini"** (Masuk, with Tunggakan as a sub-line) and navigates to `finance`;
  2. `#sheet-quick`: two new `.action-tile`s, **Pembayaran** (`banknote`) and **Pengeluaran** (`receipt`), which open the editor sheets directly.
- `navigate('finance')` uses the existing history and `syncBack` stack. No custom `pushState`.

### 3.2 Keuangan page, phone (< 768 px)
```
┌──────────────────────────┐
│ Keuangan          [⇩ CSV]│  .page-head, icon-btn export
│ ‹  Oktober 2026  ›       │  month stepper (.seg style)
│┌──────────┐┌──────────┐  │
││Masuk     ││Keluar    │  │  .kpi-grid (2×2), .num
││Rp4.200rb ││Rp850rb   │  │
│└──────────┘└──────────┘  │
│┌──────────┐┌──────────┐  │
││Laba      ││Tunggakan │  │  Tunggakan tile → Tagihan tab, filter "Belum lunas"
││Rp3.350rb ││Rp600rb ● │  │
│└──────────┘└──────────┘  │
│ 6 bulan  ▇▅ ▇▃ ▆▂ ...    │  .bars (masuk ink, keluar muted)
│[Tagihan|Pengeluaran|Lap.]│  .seg tabs, sticky under topbar
│ Semua·Belum·DP·Lunas·Arsip│  .chips filter (scrolls inside its row)
│ ┌──────────────────────┐ │
│ │ Andi · Umum 8 sesi   │ │  .list-item, ≥ 56 px
│ │ Sisa Rp300rb   [DP]› │ │  .li-trail .pill
│ └──────────────────────┘ │
│ ...                      │
│ ▢  ▢   (+)   ▢  ▢  tabbar│
└──────────────────────────┘
```
- First screen = one call, `getFinanceOverview`. Lists load after it (same pattern as "secondary data" in Agent §7), with `.skeleton` rows meanwhile.
- Pull to refresh (`refreshAll`) reloads the overview and the open tab.
- Status pills: Lunas = `.pill` filled ink, DP = `.pill` outline, Belum bayar = `.pill` with `.status-dot` warning token. Words are always shown, not colour alone.
- Empty states use `.empty` with one action: "Belum ada pengeluaran bulan ini. [+ Pengeluaran]".
- The Pengeluaran tab shows rows with category, note, amount and date, plus a "+ Pengeluaran" button at the top.
- The Laporan tab shows:
  - coach share lines (`.kv`);
  - per category totals (`.hbar`);
  - the arrears list (LP-3);
  - export buttons (Pembayaran, Pengeluaran, Tagihan) with a date range.

### 3.3 Keuangan page, desktop (≥ 768 px)
```
┌sidebar┐┌──────────────────────────────────────────────────────────┐
│Dash   ││ Keuangan                      ‹ Oktober 2026 ›  [⇩ CSV] │
│Jadwal ││ [Masuk] [Keluar] [Laba] [Tunggakan]   ← .kpi-grid 4 cols │
│Klien  ││ ┌ 6 bulan (.bars) ───────────┐┌ Bagi hasil coach (.kv)┐ │
│Coach  ││ └────────────────────────────┘└───────────────────────┘ │
│Keuangan││ [Tagihan | Pengeluaran | Laporan]  chips  [🔍 cari]     │
│       ││ list (span-7)                  │ detail panel (span-5)  │
└───────┘└──────────────────────────────────────────────────────────┘
```
`.dash-grid` with `.span-7` / `.span-5`. Selecting a bill opens the detail in the right pane (`.only-desktop-detail`). On a phone `openDetail` slides it in full screen.

### 3.4 Bill detail (`openDetail`)
```
┌──────────────────────────┐
│ ← Tagihan                │
│ Andi                     │  .profile-name
│ Umum 8 sesi · 02 Okt     │  .muted
│ Total      Rp1.200.000   │  .kv
│ Diskon     Rp0      [✎]  │
│ Dibayar    Rp900.000     │
│ Sisa       Rp300.000 [DP]│
│ ── Pembayaran ────────── │  .timeline
│ ● 02 Okt  Rp500rb Tunai  │  tap → edit sheet; 📎 if proof
│ ● 10 Okt  Rp400rb QRIS   │
│                          │
│▓[WA Tagih] [Lunasi] [+ Bayar]▓  sticky foot, 44 px buttons
└──────────────────────────┘
```
- **WA Tagih** opens `wa.me/<no>?text=` with the `tagihan` template. Admin responses already carry the phone number (Agent rule 7).
- **Lunasi** opens the payment sheet pre-filled with the remaining amount.
- ⋯ menu: Ubah tagihan, Arsipkan, Lihat klien.

### 3.5 Editor sheets (**new**, in `#sheet-layer`)
`#sheet-payment` (`.sheet.tall`):
```
│ Pembayaran            ✕  │
│ Klien / tagihan  [Andi ▾]│  only when opened from sheet-quick; else fixed
│ Jumlah                   │
│ [Rp│ 300.000          ]  │  .input-affix, inputmode="numeric", 16 px, live thousand separators
│ Sisa Rp300.000 · [Lunasi]│  .hint + link-btn
│ Metode                   │
│ (Tunai)(Transfer)(QRIS)  │  .chips single select, from FIN_METHODS
│ Tanggal   [2026-10-02]   │  type="date", default today WIB
│ Catatan   [           ]  │
│ Bukti     [📷 Tambah foto]│  reuses the progress photo compress flow (no crop)
│▓        [Simpan]        ▓│  .sheet-foot sticky
```
- `#sheet-expense` has the same layout with Kategori (`.chips` of active expense categories) instead of Klien.
- "Pemasukan lain" = the payment sheet with Klien set to "— Tanpa tagihan —" and a Kategori row.
- Validation is shown inline (`.has-error`, `.err-msg`). On save: `toast('Tersimpan')`, the sheet closes, and the overview and list refresh.
- Archive: "Arsipkan" in the editor's ⋯ menu, with an undo toast "Diarsipkan. [Urungkan]" (calls `restoreFinanceItem`).

### 3.6 Pengaturan → Keuangan (**new** section)
Add `['keuangan', 'wallet', 'Keuangan']` to `SET_SECTIONS`, after `jam`. It uses the same list → section → save bar pattern (main Design §8.2):
```
│ ← Keuangan               │
│ Fitur keuangan     [off] │  .toggle (FIN_ENABLED); on → confirm + migration result toast
│ Klien bisa lihat tagihan [off] │  (FIN_PORTAL_VISIBLE)
│ ── Metode bayar ──────── │  .chips with ✕ + "Tambah"
│ ── Kategori masuk ────── │  rows: name, aktif toggle, ⋯ (ubah, naik/turun, hapus)
│ ── Kategori keluar ───── │
│ Sinkronkan transaksi  ›  │  runs _migrateFinance_, shows {created}
│▓ Belum disimpan [Batal][Simpan]▓
```
The `tagihan` reminder type sits in **Pengingat Klien** with the other types (compact row, expands to days, time, template, preview, Kirim tes).

### 3.7 Coach share
In `#sheet-coach-profile`, a new group "Bagi hasil": `.seg` [Persen | Per sesi] + a number `.input-affix` (`%` or `Rp`). Hidden while `FIN_ENABLED` is off.

## 4. Portal (when `FIN_PORTAL_VISIBLE`)
A read-only card on `public-dashboard`, below the package ring:
```
│ Tagihan                  │  .card-flat
│ Umum 8 sesi        [DP]  │
│ Sisa Rp300.000           │  .num
│ Terakhir bayar 10 Okt    │  .muted
```
- There is no button. Paying is done with the coach (PRD non-goal).
- When `getMyBills` returns `[]`, the card isn't rendered.

## 5. Tests (`apps-script/pt-scheduler/tests/finance.test.js`, **new**)
- **Security:** every new public function is classified, and `getMyBills` ignores an ID argument (`security.test.js`).
- **Status math:** Lunas, DP and Belum bayar; discount; overpayment refused; an archived payment drops out.
- **Bill creation:** a transaction creates exactly one bill only when on; while off, `_revenueSummary_` output is byte-identical to today.
- **Migration:** idempotent, run twice gives `created: 0`; old rows become Lunas.
- **Summary:** month boundaries in WIB; tunggakan = Σ remaining; coach share persen and sesi.
- **Key lists:** `getMyBills` keys exactly as in §2.2; nothing finance-related in public responses or the admin cache payload.
- **CSV:** BOM, `;` separator, quoting of `;` and `"`, rupiah as plain integers.
- **Browser** (`tools/browser-check.js`): the Keuangan page at 360 and 390 px in both themes; payment sheet keyboard (`inputmode`); back gesture sheet → detail → page; desktop two-pane.

## 6. Rollout
1. Merge H1 (server, off). Nothing changes for anyone.
2. Merge H2/H3. The owner turns on **Fitur keuangan** in Pengaturan, migration runs, and the owner checks the Tunggakan total.
3. H4. The owner decides on **Klien bisa lihat tagihan**.
