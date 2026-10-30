# Brand shortlist (T-1400, D32)

Status: **waiting on the owner** (👤 pick one). Written 2026-10-30. Nothing was bought or registered.

Context: an Indonesian coach SaaS (PTs, gyms, online coaching, D12, D33) plus a free workout + nutrition logger on Android (D27, D28). Today's brand is XNK. `<brand>` in the other Phase V docs is a placeholder for the name chosen here.

## What could and could not be checked

| Check | Result |
|---|---|
| RDAP / WHOIS over HTTPS (rdap.org, Verisign, Google Registry, PANDI) | **Blocked** in this session: the network policy denies these hosts (proxy 403 / host not allowed). DNS lookups are blocked too. |
| PDKI trademark search (pdki-indonesia.dgip.go.id) | **Blocked** (host not allowed). |
| Web search (names in app stores, existing brands) | Done, coarse: one search per few names. It finds clashes, it can't prove a name is free. |

So **every domain and trademark cell below is "belum dicek"**. The "Guess" column is my estimate only (a plain Indonesian dictionary word is often already taken on `.com`, a coined word rarely is). To verify, either allow `rdap.org` and `pdki-indonesia.dgip.go.id` in the session's network settings and re-run this task, or check by hand (steps at the end).

Rules used for the names: 1–3 syllables, spelled the way it sounds in Indonesian and readable by English speakers, no letters English speakers mangle (no `ng` at the start, no `c` = "ch" at the start), fits both the coach panel and the public logger, and no hit on a big fitness brand in the searches below.

## Shortlist (12)

Domains to check for every name: `<name>.id`, `<name>.com`, `<name>.app`, `<name>.co.id`.
Note on `.co.id`: PANDI asks for company papers (NIB / akta). D14 says no legal entity yet, so `.co.id` is probably not possible now; an individual can register `.id` (KTP), `.my.id`, `.web.id`. `.app` forces HTTPS, which suits Cloudflare.

| # | Name | Meaning / angle | Play package id | Web search | Domains | Trademark | Guess |
|---|---|---|---|---|---|---|---|
| 1 | **Latih** | "to train" (latihan = workout). Exactly what both sides do: the coach *melatih*, the client *berlatih*. | `id.latih.app` | No fitness app named Latih found; store titles use "Latihan …" (generic, e.g. Leap Fitness "Kebugaran Wanita – Latihan"). | belum dicek | belum dicek | `.com` likely taken (dictionary word); `.app` / `.id` maybe free. Weak trademark (descriptive). |
| 2 | **Nadi** | "pulse". Health, heartbeat, steady rhythm; "NAH-dee" works in English. | `id.nadi.app` | No fitness brand named Nadi found. Common as a personal name and in Malaysia. | belum dicek | belum dicek | `.com` likely taken; `.app` maybe. |
| 3 | **Repku** | coined: *rep* + *-ku* ("my reps"). Logger-first, playful, Indonesian suffix. | `id.repku.app` | No hit. | belum dicek | belum dicek | Coined, so domains and trademark likely free. Sounds more "logger" than "coach business". |
| 4 | **Pacu** | "to spur on, push" (memacu). The coach pushes, the app pushes. "PAH-choo" (English readers may say "pak-oo"). | `id.pacu.app` | No fitness app named Pacu found. Also a fish name (pacu) and a horse-racing word (pacuan). | belum dicek | belum dicek | `.com` likely taken (fish); `.id` maybe. |
| 5 | **Raga** | "body" (as in olah*raga*). Short, strong, reads fine in English. | `id.raga.app` | No fitness app named Raga found. "Raga" is also a music term (India) and used by several unrelated businesses. | belum dicek | belum dicek | `.com` very likely taken. |
| 6 | **Rutin** | "routine, regular". Habit and consistency (streaks, weekly check-ins). | `id.rutin.app` | No app named Rutin found. | belum dicek | belum dicek | `.com` likely taken; descriptive, weak trademark. English speakers may read "rut-in". |
| 7 | **Tegap** | "upright, sturdy". Posture and strength. | `id.tegap.app` | No hit. | belum dicek | belum dicek | Likely free. Harder for English speakers ("teh-gap"). |
| 8 | **Kuatin** | colloquial "make (someone) strong". Coach-flavoured, friendly. | `id.kuatin.app` | No hit. | belum dicek | belum dicek | Likely free. English readers stumble on "kua". |
| 9 | **Gerakin** | colloquial "let's move it". Energetic, public-logger angle. | `id.gerakin.app` | No hit. | belum dicek | belum dicek | Likely free. Three syllables, a bit long. |
| 10 | **Coachin** | "coach" + Indonesian *-in* ("get coached"). Says what the SaaS is in both languages. | `id.coachin.app` | No Indonesian app found; "coachin" is a common English spelling, so expect many small users abroad. | belum dicek | belum dicek | `.com` very likely taken; trademark weak (descriptive). |
| 11 | **Sesiku** | "my session". Booking-first; matches how clients talk ("sesi besok"). | `id.sesiku.app` | No hit. | belum dicek | belum dicek | Likely free. Less fitting for the free logger. |
| 12 | **Bina** | "to build, nurture" (pembinaan, membina). Coaching as care. | `id.bina.app` | Very common in Indonesian org names (e.g. Bina Nusantara / Binus). | belum dicek | belum dicek | Clash risk with existing "Bina …" marks; `.com` taken almost surely. Listed for completeness. |

Dropped after the search (clash found):
- **Gaspol**: "Gaspol! by IMI" is the Indonesian Motor Association's super app (App Store, detik.com).
- **Sigap**: "Go Sigap" is a police services app (SKCK / SIM, reports); seen in the search summary only, no page opened.

Also noted: **Fita** (Indico/Telkomsel group) already runs an Indonesian coach platform ("CATCH"), so avoid names close to "Fit…".

Play package ids follow reverse-domain style; use the domain you actually own (e.g. `id.latih.app` if you own `latih.id`, `app.latih` if you own `latih.app`). The package id can never change after the first Play upload, so pick it together with the domain.

## Top 3 (recommendation)

1. **Latih**: the clearest meaning for both products (coach *melatih*, user *berlatih*), two syllables, no mispronunciation in English. Risk: generic word, so a weak trademark and `.com` probably taken; plan on `latih.app` or `latih.id` (+ `latih.my.id` as backup). Check PDKI class 9 (software) and 41/44 (training, health) before buying.
2. **Nadi**: warm, health-related, easy in both languages, works for the logger and for the gym. Same `.com` risk as Latih, but less descriptive, so a better trademark chance.
3. **Repku**: coined, so the best chance that `.id`, `.com`, `.app` and the trademark are all free, and it is memorable for the free logger (the funnel, D28). Downside: sounds like a logger, less like a business tool; works if the coach side is sold as "Repku Coach".

## Owner: how to verify before choosing (5 minutes per name)

1. Domains: search `<name>` at a PANDI registrar (for `.id`) and at Cloudflare Registrar (`.com`, `.app`), or open `https://rdap.org/domain/<name>.com` in a browser (404 = not registered).
2. Trademark: https://pdki-indonesia.dgip.go.id → Merek → search the name; look at classes **9, 41, 42, 44**.
3. Stores: search the name in Google Play and the App Store.
4. Social handles: Instagram / TikTok `@<name>` or `@<name>.id`.
Then tell the conductor the name; T-1403 (account checklist) uses it.

## Sources (searched 2026-10-30)
- Gaspol! by IMI: https://apps.apple.com/us/app/id1598278638 · https://inet.detik.com/mobile-apps/d-7874957/aplikasi-gaspol-tawarkan-ini-untuk-pengguna-kendaraan-bermotor
- Fita / CATCH coach platform: https://dinsights.katadata.co.id/read/2022/12/22/indico-invests-in-fitness-startup-fita · https://www.industry.co.id/read/115134/fita-luncurkan-platform-untuk-membantu-coach-membuat-perencanaan-program-olahraga-secara-lebih-efektif
- Indonesian fitness app lists (no clash for the names above): https://unstar.app/best-apps/health-fitness/in/indonesia · https://selular.id/2026/02/rekomendasi-7-aplikasi-olahraga-untuk-latihan-di-rumah/
- FIT HUB (gym chain app, not a name clash): https://apps.apple.com/app/id1557619627
