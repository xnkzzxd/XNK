# Plan tiers draft: Free / Pro / Gym (T-1402, D16)

Status: **waiting on the owner** (👤 approve or change the prices and limits). Written 2026-10-30. This is a proposal, not a decision; nothing in the app uses it yet (limits ship in T-1474, billing in T-1473 / T-1496).

Exchange rate used for every Rp figure from a USD price: **Rp 16.500 / USD** (assumption; recheck before publishing prices).

## 1. The table

| | **Free** | **Pro** | **Gym** |
|---|---|---|---|
| **Price / month** | Rp 0 | **Rp 99.000** | **Rp 349.000** (3 coaches included) |
| Extra | – | – | + Rp 79.000 per extra coach · + Rp 99.000 per extra branch |
| For | A coach trying it, or with a few clients | A solo PT / online coach | A studio or gym with staff |
| **Active clients** | 5 | 75 | 300 per business (fair use; more on request) |
| **Coaches (seats)** | 1 (owner only) | 1 owner + 1 Front desk | 3 included (Owner, Head coach, Coach, Front desk roles, D12) |
| **Branches** (D36) | 1 | 1 | 2 included |
| **Storage** (photos, proofs, PDFs, R2) | 500 MB | 5 GB | 25 GB + 5 GB per extra branch |
| Booking, schedule, client portal, reminders (push + "Kirim hari ini" list) | ✓ | ✓ | ✓ |
| Program + workout logger, progress + private photos | ✓ | ✓ | ✓ |
| **Nutrition** (targets, menu, food log; coach adjustments) | Auto target only (same as the public logger, D28) | ✓ full | ✓ full |
| **Finance / Keuangan** (bills, payments, expenses) | Record payments only | ✓ | ✓ + per branch and per coach |
| **Invoices + receipts + credit notes** (D53–D55, D58) | – | ✓ | ✓ |
| Promo codes, vouchers, gift cards (D57, D62) | – | ✓ | ✓ |
| **Classes** (D33, Phase G) | – | ✓ | ✓ |
| Home visit, online packages + check-ins (D34, D35) | – | ✓ | ✓ |
| Contracts + waiver e-sign (D62) | – | ✓ | ✓ |
| **Shop** + stock (D62) | – | – | ✓ (stock per branch) |
| Coach commission / payroll slips (D62) | – | – | ✓ |
| Rooms / equipment capacity (D36) | – | – | ✓ |
| **Reports** (D60) | Last 30 days, on screen | Finance, operations, clients; monthly client progress PDF; scheduled emails | Pro + per branch / per coach utilisation |
| **PDF branding** (D61): coach name, accent colour, cover | ✓ with a **"via \<brand\>" footer that can't be removed** | ✓, footer **removable** | ✓, footer removable |
| Accent colour + cover photo, template landing page `<slug>.<brand>` (D19, D47) | ✓ (after approval, D17) | ✓ | ✓ |
| CSV import (D43), export (D49) | Export ✓, import ✓ (up to 5 clients) | ✓ | ✓ |
| Exercise media (D30) | Text + muscle diagram | Text + muscle diagram | Text + muscle diagram |
| Support (D41) | FAQ + "Laporkan masalah" | + WA business number | + WA, priority |

Notes on the table:
- **Active client** = a client with an open package, a booking, or a log in the last 30 days. Former clients stay readable and count for nothing (D10 keeps the history).
- The free **public logger** (Android, D28) is not a coach tier: every user gets it free, with the automatic nutrition target only.
- **XNK** is the owner's own tenant: Gym, complimentary, never billed, with XNK's current behaviour pinned (Design §0.8) and GIFs kept (D30).
- Why classes, invoices and nutrition sit in Pro and not Free: they are the features a working PT actually pays for. Free must be useful (booking, portal, logger, progress) so coaches bring clients in, but small enough (5 clients) that a real business upgrades.

## 2. Trial, payment and downgrade

**14-day Pro trial (D64)**
- Starts when the coach is approved (D17), not at signup, so waiting for approval doesn't eat the trial.
- One trial per person (phone number = global ID, D37). No card, nothing to pay.
- A banner shows days left from day 10; on day 14 the tenant becomes Free unless a payment was verified. A Gym trial is given by the super-owner on request.

**Payment (D14): manual only**
- The coach pays by **QRIS or bank transfer** to the owner, uploads the proof in the app; the super-owner verifies it in the console (T-1473) and the platform invoice (D53) is marked paid with a receipt.
- Monthly. Optional prepay: 12 months for the price of 10 (Pro Rp 990.000, Gym Rp 3.490.000) to cut the monthly verification work (R2).
- Platform promo codes (D57) for launch offers.

**Downgrade to Free (D14)**
- Due date + **7 days grace** (banner and push to the coach; the coach's clients see nothing).
- Then the tenant drops to Free:
  - The coach picks which **5 clients stay active**; if they don't pick within 3 days, the 5 with the most recent activity stay. Everyone else is **locked, not deleted**: their portal shows "Akun coach-mu sedang tidak aktif, hubungi coach-mu", bookings are paused, all data is kept.
  - Pro/Gym modules (invoices, classes, shop, reports beyond 30 days) become read-only or hidden; the data stays.
  - Storage over 500 MB: nothing is deleted; new uploads are blocked until the coach is under the limit or pays.
  - Extra coach seats and branches are frozen (those staff can't log in); their data is kept.
- Paying again (verified) unlocks everything at once, nothing to restore.
- Locked data is kept until the coach deletes the account (D49) or for 12 months of no payment, after a warning email at 11 months (owner to confirm the 12 months; finance rows keep the 10-year rule, D59).

## 3. Competitors (prices as found on 2026-10-30)

All international prices are from third-party pages (the official pricing pages were not reachable from this session), so treat them as approximate.

| Product | Type | Price found | ≈ Rp / month | Source (date) |
|---|---|---|---|---|
| Trainerize | Coach app (global) | Free for 1 client; Grow $9 (2 clients); Pro from $23 (5 clients) up to ~$79 (100); Studio Plus $248 | 150rb (Grow) · 380rb (Pro 5) · 1,3 jt (Pro 100) | costbench.com changelog May 2026; fitbudd.com 2026 |
| Everfit | Coach app (global) | Free up to 5 clients; Pro from $19, ~$49 (20), ~$95 (50); Studio $105 (50) | 315rb · 810rb · 1,6 jt | fitbudd.com, quickcoach.fit (May 2026) |
| Hevy Coach | Coach app (global) | $25 (1–10 clients), $50 (11–25), $90 (26–50), $160 (51–100); 30-day trial | 410rb · 825rb · 1,5 jt · 2,6 jt | coachway.io, zoftwarehub.com (2026) |
| OnlyGym | Gym membership app (ID) | From Rp 263.000 (Budget, billed yearly, ~50 members) | 263rb | onlygym.id (2026-10) |
| Omegasoft Sport Center | Sport center POS (ID) | From Rp 2.775.000 / year | 231rb | omegasoft.co.id (2026-10) |
| majoo | POS incl. sport & fitness (ID) | Rp 129.000 – 249.000 per outlet | 129–249rb | kasirnesia.com, kiakrikil.com (2026) |
| KasirPro | General POS (ID) | PRO Rp 49.000, MAX Rp 89.000 | 49–89rb | kasirpro.com (2026-10) |
| Fita (CATCH) | Coach platform (ID, Indico/Telkomsel) | No public price found | – | katadata.co.id 2022 |
| Strava (consumer, reference) | Consumer subscription (ID) | Rp 49.900 (was Rp 85.000) | 50rb | viva.co.id |

What this says:
- Global coach apps charge **Rp 380rb–800rb for 5–20 clients** and over **Rp 1,3 jt for 50+**, priced in USD by client count. None has booking + finance + nutrition (TKPI foods) + invoices in Indonesian with QRIS.
- Indonesian tools are **POS / membership** software at **Rp 50rb–265rb**, with no coaching (programs, logger, progress, nutrition).
- A PT session in Indonesia costs roughly Rp 150rb–350rb (e.g. Rp 350rb in Bali, bali.live). **Pro at Rp 99rb is less than one session a month.**

## 4. Recommended prices and why

- **Pro Rp 99.000 / month.** Under the "Rp 100rb" mental line, priced like local POS tools rather than USD coach apps, and below one PT session. Including 75 clients means a solo coach never meets a client-count step (unlike Trainerize / Hevy), which matches how Indonesian coaches think ("one price, done"). Alternative if the owner wants more margin: Rp 149.000, still under a quarter of Hevy Coach for 10 clients.
- **Gym Rp 349.000 / month with 3 coaches**, + Rp 79.000 per coach and Rp 99.000 per branch. A 5-coach, 1-branch studio pays Rp 507.000, close to Hevy Coach's 10-client price and well under Everfit Studio, while it replaces both a POS (Rp 130–265rb) and a coach app.
- **Free with 5 clients** matches Everfit's free tier and keeps the funnel open (D28: public users → "Cari coach" → coach on Free → Pro).
- Keep prices round and in IDR only (D45); no tax fields (D54).

## 5. Cost per tenant vs. the budget (D3)

Budget: ~Rp 500rb / month. Fixed costs (official list prices as known; not re-checked from this session):

| Item | USD | ≈ Rp / month |
|---|---|---|
| Supabase Pro (prod, Singapore): 8 GB database, 100 GB file storage, 250 GB egress, 100k monthly auth users included | $25 | 412.500 |
| Cloudflare Workers Paid: 10 M requests / month included; R2 first 10 GB free, then $0.015 / GB-month, no egress fee | $5 | 82.500 |
| Domain (`.id` / `.app`, yearly ÷ 12) | – | ~25.000 |
| Staging (Supabase free), Resend free (3.000 emails / month), Sentry free, Cloudflare Web Analytics | $0 | 0 |
| **Total** | | **≈ Rp 520.000** |

Variable cost of one tenant (estimates):

| Tenant | Storage (R2) | Database | Requests | Email | ≈ Rp / month |
|---|---|---|---|---|---|
| Free, 5 clients | < 100 MB | ~10 MB | ~6k | ~5 | < Rp 500 |
| Pro, 50 clients (photos ~300 KB, ~1 GB / year) | ~1 GB | ~100 MB / year | ~60k (50 clients × ~40 calls / day) | ~20 | ~Rp 1.000–3.000 (only once the 10 GB R2 free tier is used up) |
| Gym, 200 clients | ~5 GB | ~400 MB / year | ~250k | ~60 | ~Rp 5.000–10.000 |

So the real cost is the **fixed Rp 520rb shared by the tenants**, not usage:
- Break-even: **6 Pro tenants** (6 × Rp 99rb = Rp 594rb), or 2 Gym tenants. Manual QRIS has no gateway fee (a business QRIS may charge a small MDR, around 0.3 % for micro merchants: belum dicek).
- The fixed plan holds up to roughly **50–80 coach tenants** before the 8 GB database or the included compute is the limit; then Supabase disk ($0.125 / GB) or a bigger compute add-on (~$15+ / month) applies. At that point revenue is far above the cost.
- **The free public logger is the bigger cost driver**, not coaches: an active logger user writes ~3–4 MB / year (food + sets). 1.000 active users ≈ 3–4 GB / year of database. Watch it in the super-owner dashboard (D63); if needed, archive food logs older than 1 year to R2.
- PDF rendering (D61) is billed per use (R11); cache PDFs in R2. Price per render: belum dicek.

## 6. What the owner must decide

1. Prices: Pro **Rp 99.000** (or Rp 149.000?), Gym **Rp 349.000** + Rp 79.000 / coach + Rp 99.000 / branch.
2. Limits: Free 5 clients / 500 MB; Pro 75 clients / 5 GB / 1 + front desk; Gym 300 clients / 3 coaches / 2 branches / 25 GB.
3. Module placement: classes and invoices in Pro (not Free); shop and payroll only in Gym.
4. Trial starts at approval (not signup); one per phone number.
5. Downgrade: 7 days grace, coach picks the 5 clients that stay, locked data kept 12 months.
6. Yearly prepay (12 for 10): yes or no.

## Sources (fetched / searched 2026-10-30)
- Trainerize: https://costbench.com/changelog/trainerize-price-decrease-2026-05/ · https://www.fitbudd.com/insights/trainerize-pricing-explained-what-it-actually-costs-trainers-in-2026-vs-better-alternatives
- Everfit: https://www.fitbudd.com/insights/everfit-pricing-calculate-your-true-costs-in-2026 · https://www.quickcoach.fit/everfit-pricing-2026.html
- Hevy Coach: https://coachway.io/articles/hevy-coach-pricing/ · https://zoftwarehub.com/products/hevy-coach/zoftware-analysis
- OnlyGym: https://www.onlygym.id/
- Omegasoft: https://omegasoft.co.id/sport-center/
- majoo: https://majoo.id/bisnis/aplikasi-kasir-dan-point-of-sale-sport-fitness · https://kasirnesia.com/harga · https://kiakrikil.com/memilih-aplikasi-kasir-terbaik-untuk-bisnis-anda/
- KasirPro: https://kasirpro.com/harga.php
- Fita: https://dinsights.katadata.co.id/read/2022/12/22/indico-invests-in-fitness-startup-fita
- Strava Indonesia price: https://www.viva.co.id/gaya-hidup/digilife/1888687-strava-banting-harga-di-ri-semua-fitur-tetap-utuh
- PT session price reference: https://bali.live/places/hammerhead-fitness-gym
- Infrastructure prices: Supabase, Cloudflare Workers / R2, Resend official pricing pages (as known; not reachable from this session, recheck in T-1403).
