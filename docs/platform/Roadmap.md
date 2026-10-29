# Phase V roadmap (plain-language work list)

The task details are in [TODO.md](TODO.md); this is the order, who does each step, and rough timing.


Legend: 🤖 = Claude does it (task session, model tag S / O / O+) · 👤 = needs you · ⏸ = the chain stops and waits for you. Estimated weeks are rough, one session at a time.

**V0 Discovery (≈ 1–2 wk)**
1. 🤖 O · T-1404: CI runs every check on every PR. *(running now)* · 👤 turn on auto-merge + branch protection if asked.
2. 🤖 O · T-1401: interactive mind map of every screen, menu and sheet, with the RPCs per screen.
3. 🤖 O · T-1400: brand name shortlist + domain availability → ⏸ 👤 you pick one.
4. 🤖 O · T-1402: Free / Pro / Gym tier table → ⏸ 👤 you approve prices.
5. 🤖 S · T-1403: account checklist → ⏸ 👤 you buy the domain and create the Cloudflare, Supabase (prod + staging), Resend, Sentry and Play accounts, and put the keys into GitHub/Cloudflare secrets.

**V1 New host, same backend (≈ 2–3 wk)**: XNK unchanged on the old domains
6. 🤖 O · T-1410: build script turns the HTML templates into static files.
7. 🤖 O+ · T-1411: the app talks to the server via fetch instead of `google.script.run`.
8. 🤖 O+ · T-1412: Apps Script `doPost` endpoint with the same security checks.
9. 🤖 O · T-1413: Cloudflare Worker that forwards calls to Apps Script; staging + prod deploys.
10. 🤖 O · T-1414: safe-area fix for top-level pages (iPhone notch).
11. 🤖 O · T-1418: pixel comparison old vs. new on phone and desktop, both themes.
→ The new domain works for you only (owner preview).

**V2 Database (≈ 2 wk)**
12. 🤖 O+ · T-1420: Postgres tables for all 25+ sheets.
13. 🤖 O+ · T-1421: copy all data (old Google Forms too) with counts and checksums.
14. 🤖 O · T-1422: photos and proofs from Drive → private storage.
15. 🤖 S · T-1423: nightly copy to staging with masked numbers.

**V3 Move the server (≈ 6–8 wk, the biggest part)**
16. 🤖 O+ · T-1430/T-1431: replacements for the Google services, the function registry, the same login tokens.
17. 🤖 O · T-1432: run all 482 existing tests against the new server.
18. 🤖 O/O+ · T-1433…T-1443: move the functions one area per PR (11 PRs): settings → members/packages → **booking** → progress/photos → workout → nutrition → finance → content/notes → reminders → share cards → screen bundles.
19. 🤖 O+ · T-1447/T-1448: every XNK fix is made in both systems, and a test pins XNK's settings.
20. 🤖 O · T-1444/T-1445: replay a week of real requests (0 differences), then a week of shadow reads.
21. 🤖 O+ · T-1446: rollback script back to Google Sheets, rehearsed twice.

**V4 Cutover (1 night + 30 days of watching)**
22. 🤖 S · T-1417: banner in the portal 2 weeks before.
23. 🤖 O+ · T-1450: runbook → ⏸ 👤 you pick the night (not days 1–3 of the month) and approve the switch.
24. 🤖 O+ · T-1451: nightly copy back to Sheets for 30 days (undo within 15 min).
25. 🤖 O+ / O · T-1415/T-1416: phone data handoff + final old service worker → ⏸ 👤 you approve the old-domain redirects.
→ **The migration is done: XNK runs on Supabase + Cloudflare, faster, same screens.**

**V5 Login + notifications (≈ 2–3 wk)**
26. 🤖 O+ · T-1460: Google sign-in + number linking (the coach confirms), email link, coach code.
27. 🤖 O · T-1461: push notifications + the "Kirim hari ini" list → ⏸ 👤 you approve turning off Telegram for client data (after 2 clean weeks).
28. 🤖 S · T-1462: report emails via Resend.

**V6 SaaS (≈ 8–12 wk)**
29. 🤖 O+ · T-1470/T-1472/T-1475: businesses, coaches, roles, time zones, client connections, delete/export, isolation tests.
30. 🤖 O · T-1471/T-1473/T-1474: coach sign-up + approval, owner console, plan limits, trial, analytics.
31. 🤖 O/S · T-1480…T-1489: branches, home visits, online coaching, booking rules (O+), CSV import, branding, templates, platform content, support, legal drafts → ⏸ 👤 you review the legal docs.
32. 🤖 O+/O · T-1490…T-1498: invoices, receipts, credit notes, overdue, promos, vouchers, contracts, waivers, shop, payroll, subscription invoices, PDFs, reports and dashboard.

**V7 Realtime (≈ 1–2 wk)**
33. 🤖 O+ · T-1500: live workout + schedule updates.

**V8 Android app (≈ 6–8 wk)**
34. 🤖 O · T-1510…T-1514: Capacitor app with OTA updates, public sign-up, connect-to-coach, push, rest timer, Health Connect, barcode, custom foods, recipes.
35. 🤖 S · T-1515: Play listing + Data Safety → ⏸ 👤 you upload the build, recruit 12 testers for 14 days, and press Release.
→ **The new app is done.**

**After that (per the plan, not part of "done")**: V9 UX tidy-up + English, V11 marketplace, V12 shut down Apps Script.

**Total estimate**: ≈ 7–10 months to the Android app at one session at a time, plus waiting time on the ⏸ steps. The weeks are rough guesses.

