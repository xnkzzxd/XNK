# Phase AE: login per coach (T-2500+)

Status: **built, wave 1** (2026-11-27). The owner's request: "every coach sees only their own clients, has a separate PIN, separate finances; clients pick a coach first and see every coach's hours, then pick an hour of that coach".

## What it does
- The owner keeps `ADMIN_PIN` and sees everything, exactly as before.
- Owner: Coach → open a coach → **Buat PIN login coach** (6 digits, `setCoachPin`). Removing the PIN logs that coach out at once.
- A coach logs in on the same panel login with their own PIN. The token carries `c = coachId`. The coach sees:
  - only their own clients (MemberData K) and sessions (Schedules I);
  - Keuangan with only their own bills (Tagihan "Coach ID"), the payments of those bills, and their own expenses;
  - no Pengaturan, Konten, packages, coach editing, or other coaches' phone numbers or share settings.
- Portal: the booking wizard always opens on **Pilih coach**. Each coach card shows how many hours are free in the next 7 days and the earliest one (from `openSlotsByCoach`, no extra call), then days and hours of that coach only.

## Security design (`src/Lingkup.gs`)
- **Deny by default.** A coach token is accepted only by functions in `COACH_FNS`, and only through `doPost` or Library `XNK.run`. There, `_coachGate_` checks every ID argument against the coach before the function runs: `m` (client of this coach), `s` (session of this coach), `c` (own coach ID), `sl` (list of sessions; others are dropped), `so` (session object; `memberId` must be own, `coachId` is forced to the coach). `google.script.run` has no gate, so coach tokens are always refused there.
- A new admin function is therefore **owner-only until it is added to `COACH_FNS` with rules**. Before adding one, check that everything it returns or writes belongs to the coach. `tests/coach-scope.test.js` covers the rules.
- Lists: `_scopeMembers_` / `_scopeSchedules_` in `getAdminBootstrap`. `getAdminMore` has a coach path (`_adminMoreForCoach_`: no gym-wide revenue, package trend or coach hub). Finance rows are scoped once in `_finRead_` (`_scopeFinRows_`). Internal de-duplication (`_finBillFromTransaction_`, `_finMigrate_`) reads unscoped through `_finReadRaw_`. The finance page cache key includes the coach.
- PINs: Script Property `COACH_PIN_<coachId>` = `salt:sha256`. They are never in a sheet, the browser, or Unduh data. A coach PIN must differ from the owner PIN and from every other coach PIN. Login failures share the panel's lock counter.
- The scope lives in per-execution memos `_coachScope_` / `_coachGateFn_`. They are cleared at the end of `doPost` and are in the Library `MEMOS` / `_resetLibMemos_`.

## Wave 2 (T-2510+, built 2026-11-27)

Coaches can now do their own client work through `COACH_FNS`. Each rule is checked before the function runs:
- **Clients:** add / renew (`mnew`: coach forced; a phone number of another coach's client → "Nomor ini klien coach lain. Hubungi pemilik."), edit profile (`mo`; a coach cannot move a client to another coach), reminder switches.
- **PR / tasks:** row rules on `Tasks` (`['row'|'rowo'|'grp', sheet, idCol, memberCol]`).
- **Program, nutrition, coach logging (AD3), care, fitness tests.**
- **Client holds:** cancelled sessions are the coach's own only.
- **Series bookings:** `sg` = every session of the group is the coach's.
- **Photos, delete measurement, share data, PDF report.**
- **Renewals** (`rr`: own client, or a request that picked this coach). `getRenewalRequests` is filtered.
- **Beranda Coach:** `_coachHub_` uses the coach as "self", own clients only, no gym targets. Lists are filtered by `_scopeDeep_`.
- **Payments without a bill:** Pembayaran gained column **Coach ID** (`FIN_ENSURE_KEY` v2). Such a payment is visible to that coach and the owner only.
- Archive / restore / bill adjust, peak hours, monthly stats.

**Pick / move coach (owner):**
- `setMemberCoach(token, memberId, coachId, {moveSessions})` and `assignClientsToCoach(token, ids, coachId, opts)`.
  - They write MemberData K/L.
  - Upcoming unfinished sessions move unless they clash with the new coach. Clashing ones stay and are returned as `kept`.
  - Old bills stay with the old coach.
- Panel:
  - Client card row "Coach X · Pindah" (`#profile-coach-move`).
  - Sheet `#sheet-mcoach` (prefix `mc-`).
  - Klien filter **Tanpa coach** with **Tetapkan coach** for all of them.
- A coach's Dashboard hides the gym-wide revenue tile. It shows the coach's own finance summary only when Keuangan is on.

**Still owner-only:**
- Settings, packages, content.
- Coach data, PINs and share.
- Finance categories.
- Program and task templates (coaches can read and apply them).
- Delete client, Unduh data, gym catalogue edits.

## Scale
Fine for one gym with several coaches (about up to 10) and a few hundred active clients:
- Writes queue on one script lock, and the browser retries.
- Daily Google quotas are shared (Kuota).

Many gyms or hundreds of coaches belong to Phase V (paused).
