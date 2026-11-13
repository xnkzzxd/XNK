# Brand shortlist (T-1400, D32)

Status: **decided: XNK Coach** (owner, 2026-10-30, D72). Written 2026-10-30; availability checked 2026-10-30 (see "Availability check" below). Nothing was bought or registered.

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

## Owner's candidates (2026-10-30)

The owner wants these three checked, not the research top 3. Checked on 2026-10-30 from the owner's laptop: see [Availability check (2026-10-30)](#availability-check-2026-10-30) below.

| Name | Angle | Play package id | Known risks |
|---|---|---|---|
| **XNK Coach** | Keeps the current brand; existing clients already know XNK. Clear about what it is (coaching). | `id.xnkcoach.app` | Two words, so the domain is likely `xnkcoach.*` or `xnk.coach`. "XNK" means nothing to new users and is hard to say aloud. |
| **Astro** | Short, modern, easy in Indonesian and English. | `id.astro.app` (likely taken; e.g. `id.astrofit.app`) | Very common name: Astro is a large Malaysian media group and an Indonesian quick-commerce app (Astro Technologies). `.com` / `.id` almost surely taken, and trademark clashes are likely in several classes. A suffix (AstroFit, AstroCoach) lowers the risk. |
| **Mona** | Short, friendly, easy to remember. | `id.mona.app` (likely taken; e.g. `id.monafit.app`) | Very common personal and brand name; `.com` / `.id` almost surely taken; trademark clashes are likely. A suffix (MonaFit, MonaCoach) lowers the risk. |

## Availability check (2026-10-30)

Run from the owner's laptop (the cloud sessions could not reach these hosts). Nothing was bought, registered or signed up for.

How each column was checked:
- **Domains**: RDAP, queried at each registry's own RDAP server (rdap.org redirects there but started answering HTTP 429 after 15 lookups): PANDI `rdap.pandi.id` (.id), Verisign (.com), Google Registry (.app), Identity Digital (.coach). 200 = registered, 404 = not registered (probably free; premium/reserved names can still be blocked at checkout).
- **PDKI**: pdki-indonesia.dgip.go.id → Merek, text search, filtered to classes **9, 41, 42, 44** (Latih, Repku and "xnk" were searched without the class filter and had 4 / 0 / 0 hits in all classes). Only live marks count (Didaftar, Dalam Proses, Masa Pengumuman); expired (Kadaluarsa) and rejected (Ditolak) marks are left out. Variants were searched as two words ("astro fit", "astro coach", "mona fit", "mona coach", "xnk coach") and as one word ("astrofit", "monafit"). A text search is not legal clearance; a phonetic search (Fonetik) was not run.
- **Stores**: App Store via the iTunes Search API (country ID), Google Play web search (gl=ID). Only same or near-same names are listed.
- **Socials**: Instagram public profile page (taken = a profile page with that @handle; "free" = no public profile, which can also mean a banned or deactivated account) and TikTok profile data (status 10221 = no such user). Handles checked: `@<name>`, `@<name>.id`, `@<name>app`.

### Table

| Name | .id | .com | .app | .coach | PDKI (9/41/42/44) | Play / App Store | Instagram | TikTok |
|---|---|---|---|---|---|---|---|---|
| **XNK Coach** (`xnkcoach`) | free | free | free | free | none ("xnk" and "xnk coach": 0 hits) | no app named XNK Coach | @xnkcoach, .id, app: free | @xnkcoach, .id, app: free |
| ↳ `xnk.*` (bonus) | free | taken | taken | free | — | — | — | — |
| **Astro** | taken | taken | taken | taken | **ASTRO registered in 42** (Amazon Technologies; MEASAT Broadcast); 146 hits in these classes | **Astro – Groceries in Minutes** (PT Astro Technologies Indonesia), My Astro (Astro Malaysia) | @astro, @astroapp taken; @astro.id free | @astro, @astro.id, @astroapp taken |
| ↳ astrofit | free | taken | taken | free | none ("astrofit", "astro fit") | **AstroFit AI** (fitness, both stores), "AstroFit – AI Wellness Coach", "Astro Fit" (Play) | @astrofit, .id, app taken | @astrofit, @astrofitapp taken; .id free |
| ↳ astrocoach | free | taken | taken | free | none ("astro coach") | AstroCoach (astrology coaching app, both stores) | @astrocoach, @astrocoachapp taken; .id free | @astrocoach taken (private); .id, app free |
| **Mona** | taken | taken | taken | taken | **MONA registered in 42 + 9** (PT Kharisma Nusantara Teknologi); MoNA LiSA registered in 9/41 (Barry Callebaut) | MONA (PT Metropolitan Land), **Mona – HRT journal** (Health & Fitness), several other "Mona" apps | @mona, .id, app taken | @mona, .id, app taken |
| ↳ monafit | free | taken | free | free | none ("monafit", "mona fit") | none (Mona ellebody on Play is a similar fitness name) | @monafit, .id, app free | @monafit taken; .id, app free |
| ↳ monacoach | free | taken | free | free | none ("mona coach") | none | @monacoach taken; .id, app free | @monacoach taken ("Mona Mall"); .id, app free |
| **Latih** | taken | taken | taken | free | **"Latih + Logo" registered in 9** (education software/apps; PT Rasi Latih Nusantara); **LATIH LOGIKA registered in 41** (incl. coaching) | no app named Latih ("tutur: Latih Komunikasi", "Latih Tubi Matematik" use the word) | @latih, @latih.id taken; @latihapp free | @latih, @latih.id ("LATIH", ~1.8k followers) taken; @latihapp free |
| **Nadi** | taken | taken | taken | taken | **NADI registered in 9** (Koperasi Nasari) and **44** (PT Fantail Farm); **"nadi" pending in 42**; **Satu Nadi** (Telkom, 42 + 44, digital health) | **Nadi (Nasari Digital)** in both stores; NADI Member, Nadi Tarangini (health) | @nadi, .id, app taken | @nadi, .id, app taken |
| **Repku** | free | taken | free | free | none (0 hits, all classes) | no app named Repku (nearest: **Reku**, a crypto app by PT Rekeningku; Repperoo, a workout saver) | @repku taken (personal); .id, app free | @repku taken (14 followers); .id, app free |

Nothing in the table is "unknown": every cell above was answered by its source on 2026-10-30. Still not checked: PDKI phonetic search, `.co.id` / `.my.id`, other social networks.

### Verdict per name

- **XNK Coach**: the only name that is clean everywhere: all four domains free (plus `xnk.coach` and `xnk.id`), no XNK mark in PDKI, no store clash, every handle free. Weak point stays the same: "XNK" means nothing to new users and is hard to say.
- **Astro**: not usable. Every domain taken, ASTRO registered in class 42 by two large owners, and a big Indonesian "Astro" app. AstroFit clashes with an existing fitness app named AstroFit AI and the @astrofit handles; AstroCoach is an existing coaching app and handle.
- **Mona**: not usable as "Mona": MONA is registered in classes 9 and 42 (software) in Indonesia. MonaFit / MonaCoach have free `.id` / `.app` / `.coach` and no own PDKI hit, but they contain a registered software mark, so the trademark risk stays high.
- **Latih**: only `.coach` is free; "Latih + Logo" is registered for apps (class 9) and LATIH LOGIKA for coaching (class 41). High risk.
- **Nadi**: every domain taken, live NADI marks in 9, 42 (pending) and 44, plus Telkom's "Satu Nadi" health product. Not usable.
- **Repku**: second cleanest: `repku.id` / `.app` / `.coach` free, no PDKI hit, no store clash; only `.com` and the bare @repku handles are taken (small personal accounts). Watch the closeness to "Reku" (crypto app) when filing.

### Recommendation

**XNK Coach** on **`xnkcoach.id`** (+ `xnk.coach` as the short link; `xnkcoach.com` / `.app` are also free if the owner wants to hold them), handles `@xnkcoach` on Instagram and TikTok, Play package id `id.xnkcoach.app`. Reasons: it is the only candidate with zero conflicts in all four checks, it keeps the brand the current clients already know (xnk.my.id), and a coined mark like "XNK" is easier to register in PDKI than a dictionary word. Runner-up: **Repku** (`repku.id` / `repku.app`, `@repku.id`), if the owner prefers a pronounceable name and accepts that the bare handles are taken.

**Owner picks next.** Before buying, file the PDKI application soon after choosing (classes 9, 41, 42, 44), because availability can change any day. Then T-1403 (account checklist).

## Top 3 (research recommendation)

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
