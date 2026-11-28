# Phase AG — Poster coach (PRD)

Owner's request (2026-11-28): "a poster builder from XNK to make a shareable poster 9:16 or 4:5 portrait to advertise my coaching, and give coaches a tool so they can have a poster builder (soft branding of XNK); the coach can share their progress too, not just the client." And: "think about me too, I'm a coach too, my xnk.my.id is different."

## Goals
- Every coach can make a promotional poster in under a minute, from data the app already has, on a phone.
- Two sizes: **Story 9:16** (1080 × 1920: Story, Reels, WhatsApp Status) and **Feed 4:5** (1080 × 1350).
- Coaches share **their own progress**: coaching results (numbers only) and a client's success story (only with the client's consent).
- **Soft XNK branding** on coach sites: the coach's name, logo and accent lead; only a small "Didukung XNK" in the bottom corner (hidden with Setup Custom).
- **The owner is a coach too**: on xnk.my.id XNK *is* the brand (no corner mark), and the owner also gets a poster that sells **XNK Coach** to other coaches.

## Poster types (owner's choices)
| Type | Content |
| --- | --- |
| Promo paket | Headline, 1–3 packages from the price list (price, sessions, price per session), call to action |
| Slot minggu ini | Free hours for the next 7 days from the real slot engine |
| Profil coach | Photo, name, headline, specialties, about, experience, certificates, achievements, location |
| Testimoni | One comment the client allowed ("Izin Testimoni") with stars, first name + initial |
| Hasil coaching | Sessions done, clients trained, average rating, new PRs, kg / waist cm lost, total clients — for this month, last month, 3 months or all time |
| Kisah klien | One client who switched on consent: first name, weight / waist before → after, strongest lift gain, weeks and sessions; optional photo picked from the coach's device |
| XNK Coach (owner on xnk.my.id only) | Starter / Pro / Studio with monthly price and limits, "Daftar di xnk.web.id" + QR |

Every poster has a footer: call to action, WhatsApp number and Instagram (each switchable), and a QR (coach info page on the hub, the booking site on xnk.my.id, xnk.web.id for the XNK Coach poster).

## Decisions
- Images are drawn on the device and never uploaded (like share cards). One server call when the editor opens.
- Aggregates only. Never phone numbers of clients, notes, RPE, health data, hold notes or private progress photos (rule 7b).
- Client consent is a switch in portal → Saya ("Hasil saya untuk poster coach"), off by default, stored in the client's profile-card data (MemberData column 46 JSON key `p`), so no new column.
- Available on **all plans** (it is marketing that also shows "Didukung XNK"). On by default; `POSTER_ENABLED=false` (Pengaturan → Tampilan → Poster coach) turns it off — a deliberate exception to rule 5, like share cards.
- No changes to the Dashboard or Jadwal layout (Phase S rule). Entry points: Coach → Profil tab "Buat poster", the panel's **+** sheet ("Poster"), and client page ⋯ → "Poster kisah klien".
