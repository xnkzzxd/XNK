# Phase AF — coach plans (Starter / Pro / Studio)

The owner sells three tiers (prices: `PUSAT_TIERS` in `xnk-pusat/src/Pusat.gs`; promises: `xnk-library/tools/hub-harga.js`).
This phase makes each coach's server enforce the tier the owner picks in XNK HQ. Tasks T-2600+.

## Decisions (owner, 2026-11-28)

- **Control:** XNK HQ (`/adminxnk`) picks tier + per-coach overrides and sends them with `hubPlan(HUB_SECRET, plan)` (Script Property `XNK_PLAN`). The daily 06:00 check resends; a Save also tries at once. Production (no `HUB_SECRET`) is never limited.
- **Over the client limit:** block new only (new client, renewing an inactive one, self-registration). Existing clients keep working.
- **Active client** = sessions left > 0, unlimited package, or an upcoming booking; held clients don't count.
- **Feature off:** hidden, data kept (still in Unduh data saya, back on upgrade); its reminders and push stop.
- **Self-registration when full:** "Coach sedang penuh. Hubungi coach lewat WhatsApp" — no account; the coach gets a Telegram note.
- **Trial** (first free month) = the tier the coach picked. `gratis` = unlimited (today's behaviour).
- **Rollout:** live coaches get the tier saved in `SUB_<slug>` with a 30-day warning first (`enforceFrom`).
- **Lapse:** existing grace → Starter limits for 14 days → read-only (`hubReadonly`).
- **Lifetime / beli putus:** feature list frozen at purchase (`features` snapshot); fixes still arrive, later features stay locked until paid.
- **Studio only:** multi-coach, coach logins (Phase AE PINs), classes, coach share. More than 5 coaches = limit override in HQ.
- **Starter includes:** booking, workout logger, measurements, per-client program, Web Push, offline/app, basic WhatsApp reminder digests (`sesi-besok`, `booking-minggu`, `booking-habis`).
- **Brand:** every coach may change the business name. Logo, accent colour and hiding "Didukung XNK" need a **paid Setup Custom**, on any tier (`setup.kind === 'custom' && paidAt`).
- **Downgrade with an auto program:** it freezes as a coach program (no more auto review); the coach can edit it.
- **Coach sees:** usage meter in Pengaturan → Akun, locked items greyed with "Tersedia di Pro", upgrade button → WhatsApp to the owner.
- No other caps for now (photos, packages, push). The demo keeps every feature.

## Design

- `apps-script/pt-scheduler/src/Plan.gs`: `PLAN_FEATURES`, `PLAN_TIERS` (equal to the hub-harga.js comparison table, `tests/plan.test.js`), `PLAN_FN` (API function → feature; unlisted = core), `_plan_()` (memo `_planMemo_`, in Library `MEMOS`), `_planOn_`, `_planLimit_`, `_planEnforced_`, `_planGate_` (doPost and `XNK.run`, after `_readonlyGate_`; error `code: 'plan'`), `_planAssertClientRoom_` (`_addMemberInternal_`, `code: 'plan_clients'`), `_planAssertCoachRoom_` (new or re-activated coach, `code: 'plan_coaches'`), `_planReminderOk_` (inside `_rmdIsOff_`), `_planInfo_` (`getAdminBootstrap.plan` with usage, `getPortalBootstrap.plan` = `{tier, on}`, `hubStatus().plan`), public `hubPlan` (READ_OK, secret-guarded, bumps `mv:*`).
- `XNK_PLAN` shape: `{tier, features?, add?, off?, limits?: {clients, coaches}, enforceFrom?, upgradeWa?}`.
- **A new API function that belongs to a paid feature must join `PLAN_FN`.**

## TODO

- [x] T-2600 Server core: `Plan.gs`, gate, client / coach limits, reminder filter, bootstrap + hubStatus fields, `hubPlan`, tests.
- [ ] T-2601 XNK HQ: "Paket & fitur" in the inspector (tier from `SUB_`, switches, numbers, `enforceFrom`), `pusatSetPlan` → `hubPlan`; daily resend in `checkAll_`; lapse step (14 days Starter, then read-only); lifetime snapshot; usage from `hubStatus().plan`.
- [ ] T-2602 Coach panel: meter card in Pengaturan → Akun, greyed locked entries ("Tersedia di Pro"), upgrade `wa.me`, a toast for `code: 'plan*'` answers, 30-day warning band.
- [ ] T-2603 Portal: hide parts / tabs of off features (`getPortalBootstrap.plan.on`), skip off parts in `getPortalMore`, "Coach sedang penuh" screen with WhatsApp in `#sheet-reg`.
- [ ] T-2604 Push planner: skip kinds of off features.
- [ ] T-2605 Downgrade freezes auto programs (clear `Sumber`, stop review) when `programAuto` turns off.
- [ ] T-2606 Brand gate: `build-hub.js` uses `accent` / `logo` and drops "Didukung XNK" only with a paid Setup Custom (HQ writes the flag to `hub.json`).
- [ ] T-2607 Docs: Agent.md §7, apps-script/README.md (owner, Indonesian), xnk-library docs.
