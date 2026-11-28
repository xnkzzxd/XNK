# Phase AF — coach plans (built 2026-11-28) (Starter / Pro / Studio)

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
- [x] T-2601 XNK HQ (`xnk-pusat/src/Pusat.gs`): `PLAN_<slug>`, `planWant_` / `planSync_` / `planView_`, owner `pusatPlanSave` (on-list → add/off, limits, `enforceFrom` or `'warn'` = +30 days), resent on subscription save and in the daily check; `subStatus_` state `turun` (after the 7-day grace: Starter for `PUSAT_SUB_STARTER_DAYS` = 14, then `lewat` = read-only); lifetime / beli putus freeze `features` at the first save. `/adminxnk`: card "Paket & fitur" in the inspector + `<dialog id="dlgPlan">`. The upgrade WhatsApp number is HQ Script Property `PUSAT_WA`. `PUSAT_PLAN_TIER` is tested equal to `PLAN_TIERS`.
- [x] T-2602 Coach panel (`parts/app/26-paket-coach.part`, theme `15-paket-coach.part`, both now close the file): `window.adminPlan` (`xnk_admin_plan`, cleared by `clearAdminCache`), `planLocked(f)`, card "Paket Anda" in Pengaturan → Akun (meters, warning period text, upgrade `wa.me`), Konten / Keuangan sidebar rows greyed with a Pro/Studio pill → `#sheet-plan` (prefix `pl-`), Gizi client tab hidden when locked, `waitErr` opens the sheet on `code: 'plan'`. Owner choice: no band, the warning lives only in the card.
- [x] T-2603 Portal: `getPortalMore` / `getClientBundle` parts of off features are `null` (`nutrition` = `{enabled:false}`, so the Makan tab hides itself; `PLAN_PARTS`), bootstrap `shareEnabled` / `feedbackEnabled` / `info.latestAt` follow the plan; both sign-up forms show "Coach sedang penuh" with a WhatsApp button.
- [x] T-2604 Push: `_rmdIsOff_(client, kind, push)` uses `_planPushOk_` (Web Push is in Starter; only `makan-*` needs Gizi), WhatsApp digests use `_planReminderOk_`.
- [x] T-2605 `_pgEnabled_` is false while `programAuto` is off: programs stay as they are, no review or regeneration, coach edits still work; upgrade resumes.
- [x] T-2606 Brand: hub.json `customBrand` (true / false; absent = old coach, unchanged). HQ `brandSync_` dispatches Hub XNK `merek: ya|tidak` when a Setup Custom is paid (`BRAND_<slug>`); `build-hub.js` drops accent and logo when false and, when true, sets `data-own-brand` (hides `.xnk-by`; share cards skip "Didukung XNK"). The hub repo's `hub.yml` gained input `merek` (copy `hub-repo/.github/workflows/hub.yml` to the hub repo).
- [x] T-2607 Docs.
