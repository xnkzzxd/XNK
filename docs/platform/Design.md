# Platform migration & SaaS: Design (Phase V)

What and why: [PRD.md](PRD.md). Decision numbers (D1…D69) refer to the PRD decision log.

## 1. Problems found and how the plan handles them

| # | Problem | Handling |
|---|---|---|
| P1 | A new domain **wipes localStorage**: tokens, `xnk_portal_cache`, `xnk_client_cache`, `xnk_wl_*` drafts, `xnk_wl_queue`, `xnk_food_queue`, `xnk_adm_queue`, prefs | **Handoff**: the old domain flushes the queues, then redirects with a one-time code (60 s, single use). The new domain swaps it for a token and imports drafts and prefs. |
| P2 | Old Home Screen PWAs keep a **cached offline wrapper** that loads the GAS iframe | Ship a final `sw.js` on both old domains: run the handoff, show an "install the new app" prompt, then unregister. Keep the old domains for 12+ months. |
| P3 | iOS iframe gave 0 for the safe area, so the bridge (`hostBridge`) feeds `--sa-*` | The top-level page now feeds `--sa-*` from `env()`. The contract stays the same, and Phase N styles are unchanged. |
| P4 | `google.script.run` nulls a whole answer when it contains a `Date` (the `_plainJson_` fix) | The new JSON serializer keeps the same output (dates → the same strings) so the screens see identical data. |
| P5 | Global `LockService`, and hour-grid booking logic that relies on it | A per-tenant Durable Object lock around booking/quota/complete, plus a Postgres **exclusion constraint** on coach seat × time range as a safety net. |
| P6 | `_bustSlots_` / `_bumpMember_` ordering (flush → bump) | The writes commit, then the KV version bumps. `cache-version.test.js` is carried over to the Worker registry. |
| P7 | Hard-coded `Asia/Jakarta` in ~30 places (`_wibParts_`, `REMINDER_TZ`, Ramadan table) | Pass `tenant.tz` through. Defaults keep XNK byte-identical. |
| P8 | "Every public function is browser-callable" | The registry allow-lists by name with an auth level from `security.test.js`; unknown names return 404. |
| P9 | Telegram is woven into `kirimNotifTelegram_` / `kirimTelegramTombol_` and reminder jobs | The names stay; they write to an `outbox` table that feeds push or the panel list. The owner's system alerts use a separate channel. |
| P10 | Owner edits in the GAS editor during the port would be lost | Freeze GAS edits from V3; `clasp pull` first. |
| P11 | Session secret / HMAC tokens | Same algorithm and secret in the Worker; the token gains `tenant_id` + `role`. Live sessions survive. |
| P12 | Time triggers (`runReminderTick` hourly, daily emails 05:00/20:00, weekly Monday) | Cloudflare Cron, idempotent per tenant + slot (`ReminderLog`-style dedupe). |
| P13 | Drive photos are private (rule 7b) | Private R2, served only as data URLs after the token check, exactly as today. |
| P14 | One client across several coaches (D13), each with different visibility | `user_member_links` with a consent scope; each coach reads only from the link date, and photos are shared only if the client allows. |
| P15 | Old Forms still write to the Sheet | Retired at cutover (D9); a final import of their answers. |
| P16 | Play rules for personal developer accounts | **12 testers × 14 days** closed test before production; Data Safety form (health and body data); privacy policy + account-deletion URL. |
| P17 | Realtime vs. battery and complexity | Supabase Realtime is avoided; a per-tenant Durable Object WebSocket runs **only while the logger or schedule is open**; otherwise the current versioning (`moreVer`, `memberVers`) stays. |

## 2. Target architecture

```
Browser (web)  ·  Android app (Capacitor, bundled + OTA)
   ▼ HTTPS via Cloudflare edge
Cloudflare Pages   app shell, landing, exercises/foods JSON (hashed, SW-precached)
Cloudflare Worker  api.<brand>/rpc/:name   auth · tenant · role · rate limit · registry · i18n later
  ├─ Supabase Postgres (SG)    source of truth, RLS tenant guard (defence-in-depth)
  ├─ Supabase Auth             Google, email magic link; coach one-time codes go through the Worker
  ├─ Workers KV                shared cache, slot/member versions, throttles, handoff codes
  ├─ Durable Objects           per-tenant lock + realtime WebSocket hub
  ├─ R2                        private (progress photos, proofs, exports), public (coach photos)
  ├─ Cron Triggers             reminders, report emails, backups, subscription downgrade
  └─ Queues                    FCM / web push, Resend email, Telegram (owner system alerts)
```

## 3. Data model

- One table per sheet, with **original IDs kept**.
- New tables: `tenants` (tz, plan, status), `businesses`, `tenant_users` (role), `app_users`, `user_member_links` (scope, since/until), `subscriptions`, `subscription_payments` (proof, verified_by), `push_subscriptions`, `outbox`, `handoff_codes`, `events` (analytics), `deletion_requests`.
- Tables for round 2: `branches`, `rooms` (capacity), `service_zones` (fee, radius), `member_addresses` (private), `checkins` (weekly form/photo/weight), `video_calls`, `booking_rules` (per tenant/branch), `custom_foods`, `recipes` + `recipe_items`, `health_samples` (source, type, value, time), `platform_content`, `support_reports`, `csv_imports`, `persons` (phone = global ID, linked `app_users`), `link_requests` (coach-confirmed).
- Billing tables: `invoices`, `invoice_items`, `invoice_counters` (tenant, prefix, year-month), `payments` (proof, approved_by), `credit_notes`, `receipts`, `promo_codes` + `promo_redemptions`, `vouchers`, `contracts` + `contract_acceptances`, `waivers` (signature image, PDF), `products`, `stock_moves`, `orders` + `order_items`, `payroll_runs` + `payroll_lines`, `platform_invoices`.
- `tenant_id` goes on every row. Composite indexes. Monthly partitioning for logs later.
- Private data goes into 1:1 tables (`member_care`, `member_nutrition`) so the Front desk role can be enforced at query level.
- Migrations live in `supabase/migrations/`, append-only and idempotent (rule 4 carries over).

## 4. Server port: same functions, new runtime

- **Pure helpers** move unchanged to `worker/src/core/`: `_workoutStats_`, `_nut*_`, `_insight*_`, `_slotAlternatives_`, `_parseProgramDays_`, `_rmdVariant_`, `_shareFor_`, …
- **Service shims** replace the Google services:
  - PropertiesService → `tenant_settings`
  - CacheService → KV
  - LockService → Durable Object
  - UrlFetchApp → fetch
  - Utilities → WebCrypto
  - DriveApp → R2
  - MailApp → Resend through Queues
- **Repositories** replace sheet reads, one domain per PR: auth/settings → members/packages → schedules/slots/booking → progress/photos → program/workout → nutrition → finance → content/feedback/notes → reminders/outbox → share → bundles (`getPortalBootstrap`, `getPortalMore`, `getClientBundle`, `getAdminBootstrap`, `getAdminMore`).
- **Parity gates** before cutover:
  1. All 482 tests pass on the Worker (Miniflare + `supabase start`, seeded from `seededEnv()`).
  2. **Golden replay**: one week of real calls is recorded by a temporary GAS `doPost` logger (PII scrubbed), and the replay must show 0 diffs.
  3. A shadow-read week passes behind the proxy.

## 5. Phases (small PRs; screens identical until V8)

| Phase | Content | Exit |
|---|---|---|
| **V0 Discovery** | Brand/domain brainstorm with availability; **interactive mind map** (built from `NAV`, `PUBLIC_TABS`, `MORE_GROUP`, views, `openSheet`/`openDetail` ids, with the RPCs per node); tier proposal; `docs/platform/{PRD,Design,TODO,IA,Risks}.md` (T-1400+) | Owner approves name, map, tiers |
| **V1 New host, same backend** | Buy domain, Cloudflare DNS; `tools/build-static.js`; Pages; transport swap in `App.html:233-266` + `LandingScript.html`; Worker proxies to a new GAS `doPost`; **handoff + final old SW** (P1/P2); staging | Same app on the new domain, browser/offline/share checks + pixel diff pass |
| **V2 Schema + import** | Schema; idempotent import of Sheets + Forms answers → Postgres and Drive → R2; nightly import to staging | Counts and checksums match |
| **V3 Port** | Shims, repos, registry; contract tests; golden replay; rollback script (Postgres → Sheets) rehearsed | 482 green, 0 diffs, 2 rehearsals |
| **V4 Cutover** | Night window, not days 1–3 of the month: read-only banner → final import → flip → smoke tests | p50 < 150 ms, no loss; Sheets read-only 30 days |
| **V5 Login + notifications** | Google + number linking, magic link, coach code; outbox + "Kirim hari ini" list; web push + FCM; Telegram limited to owner system alerts; Resend reports | XNK runs without client data in Telegram |
| **V6 SaaS core** | Tenants, businesses, roles (D12), timezone (D18), coach signup + approval, template landing, multi-connection clients (D13/D14), leave/copy rules (D10), deletion/export (D11), media rule (D30), super-owner console (approvals, QRIS/transfer verification, downgrade), plan limits, analytics | Isolation suite green for every RPC × role |
| **V6b Coaching models** | Branches + rooms (D36), home visits (D34), online packages + check-ins + video-call quota (D35), per-tenant booking rules + session lengths (D48), package expiry, CSV import (D43), branding (D47), neutral templates (D50), platform content (D39), support form + FAQ (D41), legal docs (D40), age gate (D42) | Each feature off by default per tenant; XNK unchanged |
| **V6c Billing & reports** | Invoice numbering (per-tenant counter row under lock; void, never deleted), receipts, credit notes, proof upload + approve, overdue jobs + booking block, promo codes, vouchers, contracts, waiver e-sign, shop + stock, payroll slips, platform subscription invoices + trial, PDF renderer in the Worker (HTML template → PDF via Cloudflare Browser Rendering), report queries (SQL views/materialized views refreshed nightly), panel dashboard, scheduled report emails, super-owner dashboard | Numbering has no gaps or duplicates under concurrency; report totals reconcile with transactions; each feature off by default per tenant |
| **V7 Realtime** | Durable Object WebSocket for the live logger + schedule | The coach sees sets within 2 s |
| **V8 Android app** | Capacitor; mobile tab set; public signup; connect-to-coach (invite/QR); FCM; rest-timer notification; Health Connect; native share/camera; OTA; Health Connect read/write (D44); barcode scan, custom foods, recipes (D38); Play closed test (12 × 14 days) → production | Live on Play |
| **V9 UX tidy-up + i18n** | From the mind map, one prototype per area, then the build, area by area:<br>(1) **Client page**: one layout for phone and desktop; each data point in one tab only; Ringkasan = "today / what needs action"; long sections become folds and anchors.<br>(2) **Pengaturan**: task groups (Bisnis · Jadwal & Booking · Klien & Pesan · Modul · Akun & Tagihan), each with a short summary and "Lanjutan" folds.<br>(3) **Beranda + Lainnya**: next session first, a fixed order, Lainnya grouped by task.<br>Shared page-pattern components go into Theme.html. Strings move to `t()` with an EN dictionary. | Owner signs off each prototype; browser checks pass in ID + EN; RPCs unchanged |
| **V10** | (merged into V9) | — |
| **V11 Marketplace** | "Cari coach" from approved public profiles | Later |
| **V12 Decommission** | Remove the clasp deploy, archive `apps-script/`, close BookingPT-Client | — |

## 6. Critical files

- `apps-script/pt-scheduler/src/App.html:224-266`, `LandingScript.html:14-80` (transport); `Index.html`, `Landing.html` (`include` → build).
- `src/Kode.gs:91-121` (`doGet`/`include`), `:250-310`, `:584` (token, `requireAdmin_`, `requireMember_`), `:3226`, `:3357` (email triggers), `:3455+` (Telegram); `Reminder.gs:517` (hourly trigger).
- `tests/harness.js`, `tests/security.test.js`, `tests/cache-version.test.js`.
- Root `index.html`, `sw.js`, `offline*.js`, `tools/sync-offline.js`; BookingPT-Client wrapper (final SW).
- `.github/workflows/pt-scheduler.yml` → new workflows: Pages, `wrangler deploy`, `supabase db push`, Android build/OTA.

## 8. Verification

- `node --test` on GAS, and the same suite on the Worker (`npm run test:worker`).
- Browser, offline and share checks on the new host, with a pixel diff at 390×844 / 1280 / 1440 in both themes.
- `tools/replay.js`: 0 diffs.
- k6 load test: p95 < 300 ms; a concurrent-booking test shows no double booking.
- Role × tenant isolation matrix covering every RPC.
- Handoff test: an old-domain device with drafts and queued logs lands on the new domain still logged in, with nothing lost.
- Two cutover + rollback rehearsals on staging.
- Play pre-launch report clean.

