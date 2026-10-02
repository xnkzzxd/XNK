# PRD: Phase H, Keuangan (financial CRUD)

| | |
| --- | --- |
| Product | XNK Personal Trainer Scheduler (Apps Script web app behind xnk.my.id, xnkbooking.my.id, book.xnkbooking.my.id) |
| Owner | xnkzzxd (owner and only coach) |
| Status | Draft, 2026-10-02 |
| Related | [Design.md](Design.md) · [TODO.md](TODO.md) · main docs: [../PRD.md](../PRD.md), [../Design.md](../Design.md), [../Agent.md](../Agent.md) · coach: [../coach/PRD.md](../coach/PRD.md) |

Phases A–G are live. This is **Phase H**. Decisions continue from D-30. Tasks start at T-400.

## 1. What exists today

- **Revenue is only an estimate.** `getRevenueSummary` / `_revenueSummary_` (Kode.gs) adds up the package price of each transaction in the `Members` log for a month and shows 65 % of it (`REVENUE_SHARE`). The price comes from column K "Harga" (`MEMBERS_LOG_PRICE_COL`) or, for old rows, from today's PriceList.
- **The app doesn't know whether a client has paid.** There is no paid, deposit or unpaid status, no payment date or method, and no remaining balance.
- **Expenses aren't recorded** (gym rent, equipment, ads, transport). So there is no net profit.
- **Coach share is fixed at 65 % for everyone.** It can't be set per coach or per session.
- **No export.** The owner copies figures from the sheet by hand.

## 2. Problems

1. The owner can't see who still owes money, or how much.
2. Monthly profit is unknown, because expenses aren't recorded and income is an estimate.
3. Proof of transfer and receipts sit in WhatsApp and the photo gallery, not linked to a transaction.
4. Coach share can't follow the real arrangement.

## 3. Goals and non-goals

**Goals**
- G30: every package transaction becomes a bill with a clear status (Lunas / DP / Belum bayar) and a remaining balance.
- G31: the owner can add, view, edit, archive and restore payments, expenses, categories and payment methods from a phone in under 30 seconds per entry.
- G32: one page shows the month's income, expenses, net profit and arrears.
- G33: coach share is set per coach.
- G34: data can be exported to CSV for Excel or Sheets.

**Non-goals**
- No payment gateway, virtual account or automatic payment check.
- No automatic messages to clients. Bill reminders go to the owner's Telegram with `wa.me` buttons, the same as Phase C (D-31).
- No tax, invoice numbering for tax purposes, or double-entry bookkeeping.
- No multi-currency. Everything is in rupiah, whole numbers.

## 4. Users

- **Owner (admin):** does everything in the panel, mostly from a phone.
- **Client (member):** sees only their own bill status, and only when the owner turns this on (PT-1).

## 5. Requirements

### Bills (KU)
- **KU-1.** Every new package transaction (new client or renewal) automatically creates one bill: total = transaction price (column K), discount 0.
- **KU-2.** Bill status is computed, never typed: total paid ≥ (total − discount) → **Lunas**; > 0 → **DP**; 0 → **Belum bayar**.
- **KU-3.** The owner can edit a bill's discount and note. The total follows the transaction and can be corrected with a reason.
- **KU-4.** The list can be filtered by status and month, and searched by client name.

### Payments (BY)
- **BY-1.** Add a payment to a bill: date (default today, WIB), amount, method, note, optional proof photo.
- **BY-2.** Several payments per bill (instalments). Overpayment is refused with an Indonesian error.
- **BY-3.** Edit or archive a payment. The status is recomputed straight away.
- **BY-4.** "Lunasi" shortcut: one payment for the exact remaining balance.

### Expenses (PG)
- **PG-1.** Add an expense: date, category, amount, method, note, optional receipt photo.
- **PG-2.** Edit, archive and restore.
- **PG-3.** Filter by month and category.

### Categories and methods (KT)
- **KT-1.** Income and expense categories are separate lists. Each can be added, renamed, reordered and turned on or off. Delete is only allowed when unused.
- **KT-2.** Default categories, created once: income "Paket", "Sesi satuan", "Lainnya"; expenses "Sewa tempat", "Alat", "Iklan", "Transport", "Lainnya".
- **KT-3.** Payment methods: default Tunai, Transfer bank, QRIS / e-wallet. The owner can edit the list (setting `FIN_METHODS`).

### Coach share (BH)
- **BH-1.** Each coach has a share type: **persen** (of the package price) or **per sesi** (fixed rupiah per completed session), plus a value.
- **BH-2.** Coach default when empty: persen 65 (today's `REVENUE_SHARE`).
- **BH-3.** Summary shows the share per coach for the month. In solo mode it is shown as one line.

### Reports (LP)
- **LP-1.** Monthly summary: Masuk (payments received that month), Keluar (expenses), Laba (Masuk − Keluar), Tunggakan (sum of remaining balances, all open bills).
- **LP-2.** Chart of the last 6 months: income vs expenses.
- **LP-3.** Arrears list: client, package, total, paid, remaining, age in days, sorted oldest first.
- **LP-4.** CSV export for a date range: payments, expenses, bills (one file each, UTF-8 with BOM, `;` separator for Indonesian Excel).

### Proof photos (BK)
- **BK-1.** One optional photo per payment and per expense, compressed in the browser like progress photos.
- **BK-2.** Stored in a private Drive folder "XNK Keuangan". Never link-shared. Served only as a data URL through an admin-checked function (same rule as Agent.md 7b).

### Portal (PT)
- **PT-1.** Setting "Klien bisa lihat tagihan" (`FIN_PORTAL_VISIBLE`, default **off**).
- **PT-2.** When on, the portal Beranda shows a read-only "Tagihan" card: package, status, remaining balance, last payment date. No proof photos, no notes, no other clients.
- **PT-3.** When off, the server returns nothing (not just hidden in the browser).

### Reminder (RM)
- **RM-1.** New reminder type `tagihan` (off by default): one Telegram message to the owner listing open bills older than N days (default 3), each with a `wa.me` button holding an editable template ("Hai {nama}, sisa pembayaran paket {paket} Rp{sisa}…"). Days and time are set in Pengaturan.

### Migration (MG)
- **MG-1.** First admin write after `FIN_ENABLED` is turned on: every past transaction gets a bill plus one payment for the full amount (method "Lainnya", note "Migrasi"), so it reads **Lunas**. Idempotent: a transaction with a bill is skipped.

### Archive (AR)
- **AR-1.** Nothing is hard-deleted from the panel. Archive sets "Diarsipkan Pada" and "Diarsipkan Oleh". Archived items are left out of totals and shown under the **Arsip** filter with **Pulihkan**.

### Phone (KM)
- **KM-1.** Everything works at 360–430 px and on desktop, in light and dark (main Design §8).
- **KM-2.** Amount inputs use `inputmode="numeric"` and show thousand separators while typing.
- **KM-3.** Editors are bottom sheets with a sticky Simpan. The back gesture closes sheet → detail → page.

## 6. Decisions

| ID | Decision |
| --- | --- |
| D-30 | Built in XNK first; the same code can later serve a copy (e.g. TrueProgress.id) by settings only. |
| D-31 | No gateway and no automatic client messages. Reminders go to the owner via Telegram with `wa.me` buttons. |
| D-32 | Bills come from transactions automatically; there is no free-standing manual bill. Other income uses the income category on a payment without a bill ("Pemasukan lain"). |
| D-33 | Status is derived from payments, never stored as truth. A "Status" column is a cache only. |
| D-34 | Delete = archive, restorable, with who and when. |
| D-35 | Old transactions are migrated as Lunas. |
| D-36 | Feature off by default (`FIN_ENABLED`). While off, the dashboard shows today's 65 % estimate unchanged. |
| D-37 | Portal visibility is a separate toggle, off by default, enforced on the server. |

## 7. Success measures

- The owner records a payment from a phone in ≤ 3 taps after opening the bill.
- Month-end profit is readable on one screen, without opening the sheet.
- The arrears total matches the sum of the list (test).

## 8. Open questions (not blocking)

- Should a bill also be created for single sessions booked outside a package? (Currently no: D-32 "Pemasukan lain".)
- Should the CSV include archived rows? (Currently no, with an "Ikutkan arsip" checkbox later.)
