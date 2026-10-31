# Platform migration & SaaS: PRD (Phase V)

Status: **planned** (approved 2026-10-29). How: [Design.md](Design.md). Tasks: [TODO.md](TODO.md) (T-1400+). Risks: [Risks.md](Risks.md).

## Context

XNK today runs on one Google Apps Script deployment:
- `Kode.gs` is 8.4k lines; there are ~197 public functions across Kode, Keuangan, Nutrisi, Reminder and BagikanData.
- Data lives in 25+ Google Sheets, with Drive for photos and Script Properties for settings.
- It relies on CacheService and LockService (44 script-lock sites), plus hourly, daily and weekly time triggers.
- Three sites show it in an iframe.

Every `google.script.run` call costs 1–3 s, and one global lock serializes all writes. That model cannot host other coaches.

Goals:
- Keep the screens and the functions identical.
- Make every call fast.
- Grow into a multi-coach SaaS with a free public Android logger that feeds the funnel.
- Ship an interactive map of every screen, used later for a menu redesign.

---

## 0. Decision log (from the Q&A; this is the contract for the build)

**Scope & constraints**
| # | Decision |
|---|---|
| D1 | Frontend **looks and works identically** through the migration; code may be split into modules / a build step. Pixel-diff proves it. |
| D2 | All RPCs keep **name, inputs and outputs**; internals may become SQL/TypeScript. |
| D3 | Today: < 50 active clients, 1 coach. Budget ~Rp 500rb/month (Supabase Pro $25 + Workers Paid $5 + domain). |
| D4 | Built by **owner + Claude only**, no deadline, **safety first** (≈ 4–6 months). Every task is a PR with tests and a rollback. |
| D5 | Cutover may take 1–2 h at night, **not at the start of the month** (recap, bills, renewals). |
| D6 | Supabase region **Singapore**. Separate **staging** (Supabase free project + `staging.<brand>`) with masked phone numbers. |
| D7 | All accounts (Cloudflare, Supabase, Play, domain, Resend) are owned by **xnkzzxd@gmail.com**, with 2FA and offline recovery codes. |

**Data**
| # | Decision |
|---|---|
| D8 | Migrate **everything**, old logs included. Nobody edits the Sheet by hand. |
| D9 | Old **Google Forms are retired**; their answers are imported once. The in-app evaluation and health forms replace them. |
| D10 | When a client leaves a coach, **both keep a copy**: the client keeps everything; the coach keeps the history up to the stop date, notes included. |
| D11 | **Account deletion** (in app + web page, as Play and the PDP Law require): personal data, photos and health data are erased; the coach keeps anonymised finance/schedule rows ("Klien terhapus"). Data export as JSON/CSV. |

**SaaS model**
| # | Decision |
|---|---|
| D12 | **Tenant = a coach**; optionally a **Gym/Business** groups several coaches. Roles: **Owner** (everything + billing), **Head coach** (all clients, no finance), **Coach** (own clients only), **Front desk** (schedule + payments, no health data or photos). |
| D13 | One client = **one Google account with several coach connections** (e.g. a PT + a nutritionist), each with consent. |
| D14 | Coach subscription: **monthly, paid by bank transfer or QRIS to the owner** and verified by hand in a super-owner console. No gateway, no legal entity needed now. Unpaid → **downgrade to Free** (client limit; extra clients locked, not deleted). |
| D15 | Clients still **pay coaches manually** (recorded in Keuangan); no gateway. |
| D16 | Plan tiers: Claude proposes a price/feature table in V0 for the owner to decide. |
| D17 | New coaches need **approval** before they appear publicly. Rate limits per IP and per account. |
| D18 | **Timezone per tenant** (WIB/WITA/WIT/abroad); XNK stays Asia/Jakarta. |
| D19 | Landing: **XNK keeps its custom landing**; other tenants get a template page at `<slug>.<brand>`. The static BookingPT price page is retired, and prices come from the API. |
| D20 | Language: **Indonesian + English** (i18n), introduced **after** the migration (it touches every UI string). |

**Login & notifications**
| # | Decision |
|---|---|
| D21 | Login = **Google sign-in + number linking**. Fallbacks: **email magic link** or a **one-time code from the coach** (sent over WA). Existing tokens stay valid until they expire. |
| D22 | **Telegram is off for client data.** Reminders become (a) **push** for app/web-push users and (b) a **"Kirim hari ini" wa.me list in the panel** only for clients without push. iPhone users get the Home Screen hint (#a2hs) to enable web push. Still no WhatsApp gateway. |
| D23 | **Ops alerts** go to the owner by **email + web push + Telegram (system only, never client data)**. |
| D24 | Daily/weekly **report emails stay** (Resend). |
| D25 | **Realtime** for the live workout (the coach sees sets as they are logged) and for schedule changes. |
| D26 | Analytics: **privacy-friendly** (Cloudflare Web Analytics + simple event counts in Postgres). |

**Android app**
| # | Decision |
|---|---|
| D27 | **Android only**, **Capacitor**, bundled code + **OTA live updates**. iPhone keeps the web app. **Coaches use the web** (web push for alerts). |
| D28 | The public logger is **free**: a funnel to "Cari coach" (marketplace, late phase). Public users get an **automatic nutrition target**, with no coach-only adjustments and no health-condition tags. |
| D29 | **Health Connect / smartwatch** import (weight, steps, heart rate). |
| D30 | Exercise media: **XNK keeps GIFs** (web and in the app); **other tenants and public users get text + a muscle diagram**. ⚠ See risk R1. |

**UX**
| # | Decision |
|---|---|
| D31 | Deliver an **interactive, zoomable mind map** of every screen, tab, sheet and menu (with the RPCs per screen). **Reorganising menus comes after the migration is stable.** |
| D32 | Brand/domain is **not chosen**: brainstorm in V0. `<brand>` is a placeholder. |

**Round 2 details**
| # | Decision |
|---|---|
| D33 | Coaching types: **in-person, home visit, online (monthly), classes**. |
| D34 | **Home visit**: client address + map link per session (private, coach only), transport fee per zone, coverage radius in km. |
| D35 | **Online package** = duration (1/3/6 months) + weekly check-in (form, photo, weight) + video-call quota (booked like a session, with a Meet/Zoom link) + program/menu from the coach. |
| D36 | **Multi-branch**: hours + holidays, rooms/equipment with capacity, prices/packages, and finance reports, all per branch. |
| D37 | **The phone number is the global person ID**, one number = one person, with no shared profiles. A number change is a super-owner/coach admin action that moves the history (see R5). Linking Google ↔ number is **confirmed by the coach** ("Menunggu verifikasi" list). |
| D38 | Foods: **barcode scan** (Open Food Facts), **private custom foods**, **recipes**. The TKPI list stays the curated base. |
| D39 | The owner can publish **platform-wide content** to every user; coach content stays per tenant. |
| D40 | Legal docs drafted by Claude, reviewed by the owner (optionally a lawyer): coach terms, user terms, privacy policy (PDP Law), health disclaimer, coach–client data-processing terms. |
| D41 | Support: WA business number, in-app FAQ, "Laporkan masalah" form (screenshot + recent error log → Postgres + email to the owner). |
| D42 | Age **18+**; 13–17 only through a coach with parental consent (flag on the member). Play target audience 18+. |
| D43 | Coach onboarding includes a **CSV import** (clients, packages, remaining sessions) from a template. |
| D44 | **Health Connect**: read weight/body fat, steps, heart rate, sleep and watch workouts; write finished workouts. Data from devices is flagged with its source. |
| D45 | **kg/cm and IDR only** (English is language-only). |
| D46 | Super-owner has **full support access** to tenant data, stated in the coach terms; **no audit log** (owner's choice, see R6). |
| D47 | Branding per tenant: **one accent colour** (contrast-checked in light and dark) + **cover photo/landing gallery**. No logo field. |
| D48 | Per-tenant booking rules: cancel/reschedule cutoff, **session length 30/45/60/90**, minimum notice, horizon, **package expiry**. XNK defaults reproduce today exactly (60 min, horizon 60, no cutoff). |
| D49 | Coach leaving: **export only** (CSV/JSON + photo zip); deletion on request. |
| D50 | Reminder texts: **neutral platform templates** for new tenants; XNK keeps its `PesanVariasi` voice. The holiday/Ramadan table is platform-wide. |
| D51 | Rollout: a portal **banner 2 weeks before**, then the automatic handoff. No beta group, no broadcast. |
| D52 | Speed SLO from a phone on 4G in Indonesia: open < 1 s from cache, < 2 s cold, RPC p95 < 300 ms. Checked in CI (Lighthouse + k6) and on a status page. |

**Round 3: invoices, reports, business features**
| # | Decision |
|---|---|
| D53 | Invoices: **coach → client** (package bills), **platform → coach** (subscription), and an automatic **receipt (kwitansi)** after payment. |
| D54 | Invoice content: **sequential number per tenant** (`INV/2026/11/0001`, never reused; cancelled = void), the **coach's static QRIS + bank account**, **discounts/promo codes**. **No tax fields.** |
| D55 | Payment: the client **uploads a transfer proof** (private R2) for the coach to approve, **or** the coach records it by hand. **Free partial payments**, no instalment schedule. |
| D56 | Overdue: reminders **H-3 / due date / H+3** (push, or the WA list for clients without push), plus an optional **booking block after X days overdue** (per tenant, off by default). |
| D57 | Promos: coach codes (% or Rp, validity dates, usage quota, once per client); platform codes for coach subscriptions. No referral program. |
| D58 | Refund = **credit note** (`CN/…`) that reduces the invoice and returns the remaining sessions. |
| D59 | Finance records are kept **10 years, anonymised**, after deletion. |
| D60 | Reports: **finance** (revenue, expenses, profit per month, branch and coach), **operations** (sessions held, cancellations, no-shows, coach utilisation), **clients** (retention, renewals, churn, new clients by source), and a **monthly client progress PDF**. |
| D61 | Formats: **PDF** (server-rendered, sent over WA), a **panel dashboard** with charts, and **scheduled emails** per tenant (weekly/monthly). PDFs carry the coach's name, accent colour and cover, plus a "via <brand>" footer that can't be removed on Free. |
| D62 | Extras: **coach commission/payroll slips** per period (extends coach share), **waiver/health consent with e-signature** (PDF stored), **gift cards/package vouchers**, **client contracts** (package terms and refund policy, accepted at purchase), **portal shop** (client orders → coach approves → pickup at the gym; stock kept per branch). |
| D63 | Super-owner dashboard: MRR, active coaches, churn, trial → paid; public-user signups, DAU/WAU, connected-to-coach rate; system health (errors, latency, cron, backups); payments to verify + coach approvals. |
| D64 | **14-day Pro trial** → Free unless the coach pays. |

**Round 4: UI/UX upgrade**
| # | Decision |
|---|---|
| D65 | **Tidy up, don't cut features.** Regroup the menus by task, and use one consistent page pattern: band header → summary → main list → detail, with buttons always in the same places. |
| D66 | Keep the **monochrome identity** (Phase R black bands); clean up the hierarchy. |
| D67 | Focus areas: the coach **client page**, which is too long, repeats data across tabs, and lays out differently on phone and desktop; **Pengaturan**, with too many sections and toggles; the client **Beranda + Lainnya**. |
| D68 | Timing: **after the Android app** (V8). Design work (map → clickable prototype artifact) may start earlier, but nothing is built before then. The owner's judgement decides, using the prototype. |
| D69 | i18n (D20) runs **together with** the UX tidy-up, so every string is touched only once. |
| D71 | **Plan prices approved** (2026-10-30), as drafted in [Tiers.md](Tiers.md): Free (5 clients) · Pro Rp 99.000/month (75 clients) · Gym Rp 349.000/month (3 coaches, 2 branches) + Rp 79.000 per extra coach + Rp 99.000 per extra branch; 14-day Pro trial; manual QRIS/transfer. |
| D72 | **Brand: XNK Coach** (owner, 2026-10-30), chosen after the availability check in [Brand.md](Brand.md): all `xnkcoach` domains (.id/.com/.app/.coach) and `xnk.coach` free, no PDKI mark, all handles free. `<brand>` in the Phase V docs means XNK Coach; the exact domain is bought in T-1403 (recommended `xnkcoach.id` + `xnk.coach`). Replaces D32. |

**Round 5: XNK keeps working**
| # | Decision |
|---|---|
| D70 | **XNK keeps working at every step of the migration.** The live app on today's domains and the Apps Script backend stay in service until the new stack has proven itself. Every phase can be undone on its own, and clients and the owner never lose a feature, data, or a login. Rules: Design §0.

