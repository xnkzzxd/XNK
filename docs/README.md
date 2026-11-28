# Docs index

One line per phase: letter, topic, folder, task range, status. Status: **built** · **pending** (paused by the owner) · **redo** (plan being rewritten in another session) · **backlog** (not built, not scheduled).
Task status in every `TODO.md`: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred or dropped by the owner.
Rules for agents: [Agent.md](Agent.md). Phase letters and task ranges are unique; never reuse one. The next free letter is **AH**; the next free range is **T-2800**.

| Phase | Topic | Folder | Tasks | Status |
| --- | --- | --- | --- | --- |
| A–D, F, G | Settings, price list, reminders, progress tracker, landing, classes | [Task.md](Task.md) (PRD, Design) | T-100…T-185, T-250… | built (T-140…T-144 backlog, T-310 in the BookingPT repo) |
| E | Coach hub, profile, client care | [coach/](coach/) | T-200+ | built (T-260…T-285 backlog) |
| H | Keuangan | [finance/](finance/) | T-400+ | built |
| I | Coach–client loop | [loop/](loop/) | T-600+ | built |
| J | Client tabs | [portal/](portal/) | T-700+ | built |
| L, M, O | Exercise library, live logger, Latihan ala Hevy | [workout/](workout/) | T-800+, T-840+, T-860+ | built, **redo** |
| N | iPhone / Safari | [ios/](ios/) | T-900+ | built |
| P | Gizi (food, targets, menu, packages) | [nutrition/](nutrition/) | T-1000+ | built, **redo** |
| Q | Klien view and data interpretation | [klien/](klien/) | T-1100+ | built |
| R | Big text, black bands | [ui/](ui/) | T-1200+ | built |
| S | Admin panel UI/UX audit | [panel/](panel/) | S1–S18 | built |
| T | Share cards | [share/](share/) | T-1300+ | built |
| V | Supabase + Cloudflare, SaaS, Android | [platform/](platform/) | T-1400+ | **pending** |
| U | Automatic program, gym catalogue | [program/](program/) | T-1600+ | built |
| AAA | Static frontend on GitHub Pages | [aaa/](aaa/) | T-1700+ | built |
| W | Speed | [speed/](speed/) | T-1800+ | built (W2 deferred) |
| X | New client portal (phones) | [portal2/](portal2/) | T-1900+ | built |
| Y | Client portal desktop shell | [desk/](desk/) | T-2000+ | built |
| Z | Web Push | [push/](push/) | T-2100+ | built (T-2105 is the owner's install step) |
| AB | XNK Library + Template + hub xnk.web.id (multi-coach on Apps Script, production untouched) | [library/](library/) | T-2200+ | built (T-2208, T-2210, T-2214, T-2215 are the owner's install steps); hub upgrade T-2220+ in progress (T-2220…T-2223, T-2230…T-2234 built) |
| AC | Klien list + client profile redesign in the coach panel (portal patterns, one home per action, lean calls) | [clientpage/](clientpage/) | T-2300+ | built (Waves 1–4 approved by the owner, PR #201) |
| AD | Coach kit: client hold (Cuti / Sakit / Berhenti), measurement guide + Pinggul, coach logger upgrade, PDF report on demand | [coachkit/](coachkit/) | T-2400+ | built (2026-11-26; T-2409b dropped) |
| AE | Login per coach: own PIN, own clients, own sessions, own finance; portal picks a coach first | [akses/](akses/) | T-2500+ | built, waves 1–2 (2026-11-27) |
| AF | Coach plans Starter / Pro / Studio: features and limits set in XNK HQ, enforced per coach | [plan/](plan/) | T-2600+ | built (2026-11-28) |
| AG | Coach posters 9:16 / 4:5: promo, free slots, profile, testimonial, coaching results, client story; XNK Coach poster for the owner | [poster/](poster/) | T-2700+ | built (2026-11-28, approved by the owner) |
| — | Reminder texts: tone rules and sources of the science tips | [reminder/Sumber.md](reminder/Sumber.md) | — | built (2026-11) |

Notes
- Folder names are historical (`portal2` = Phase X, `desk` = Phase Y, `push` = Phase Z, `aaa` = Phase AAA); they stay so that code comments and links keep working.
- Code comments in `Push.gs`, `App.html` and tests still say "Fase X" for Web Push; read them as Phase Z.
- Phase K (portal/panel fast-load) has no folder; it is described in Agent.md §7.
