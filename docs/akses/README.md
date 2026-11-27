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

## Wave 1 limits (not yet for coaches)
These stay owner-only and are refused with "Hanya pemilik…":
- add, renew, or delete a client;
- tasks / PR, programs, nutrition, holds;
- session series;
- photos, delete measurement;
- coach hub, renewals decide;
- payments without a bill.

Each needs its own rules before it joins `COACH_FNS`.

## Scale
Fine for one gym with several coaches (about up to 10) and a few hundred active clients:
- Writes queue on one script lock, and the browser retries.
- Daily Google quotas are shared (Kuota).

Many gyms or hundreds of coaches belong to Phase V (paused).
