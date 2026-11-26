# PRD — Phase AC: Klien list + client profile (coach panel)

Owner's brief (2026-11-25): the Klien tab and the client profile in the coach panel are cramped; buttons are scattered, far apart and hard to find; server calls should be leaner and bundled. The new client portal (Phase X phone, Phase Y desk) is the reference: "efficient and beautiful".

## Problems (measured on the demo, 390×844 / 1280×800 / 1440×900)

- Klien list on phones: ±375 px of chrome before the first client (black band, black summary card, search + sort, sideways chips with "Habis" cut off). Rows squeeze name, package, meter, next session, count and a pill into one line, so the next session is cut.
- PC with a profile open: "Klien baru" wraps under the title at 1280, the search box collapses to a 40 px box, filter chips are clipped, Kartu/Daftar shows but does nothing.
- Profile: four black blocks stacked (band, client card, tab bar, summary per tab); the header says "Profil klien", not the name; ±73 controls on one client page (Catat twice in Progres, six share buttons, "Ubah" meaning five things, nine delete icons, Mulai latihan only inside Latihan); Latihan is 3,500 px tall on a phone (strength and volume shown twice); Progres mixes body progress with intake admin.
- Calls: opening a client is one call already, but writes are followed by reads (PR tick → 2, gizi decision → 2, health reviewed → 1, regenerate program → 1, approve renewal → full reload), session detail and session note each load once more, and the panel boot sends three separate Settings calls.

## Owner decisions

- Keep the PC split (list + profile side by side) and fix it from the inside.
- One-tap actions on every tab: **Chat WA, Booking, Mulai latihan, Catat ukuran**.
- **Black header only**: band + client card; tabs, summaries and cards are light.
- Full redesign of the Latihan and Gizi tabs too (panel view only; the logger, program editor, menu engine and portal screens stay with the session re-planning them).
- Fewer, bundled calls; writes answer with what they changed.
- Buttons get one home per kind of action.
- Portal patterns are reused (to-do rows, week strip, tile hub, progress sub-tabs, black hero over the band).

## Out of scope

Dashboard and Jadwal (owner rule from Phase S), the portal (byte-identical), the live logger and program editor, the meal engine.

## Success

- Phone 390×844: first client fully visible on Klien; head + client card + tabs ≤ 230 px; the first Ringkasan card on the first screen.
- PC split: search ≥ 200 px, head on one line, filter reachable.
- Visible controls per tab: Ringkasan ≤ 8, Progres ≤ 8, Latihan ≤ 6, Gizi ≤ 4; no share buttons inside tabs.
- Calls: boot 3, open Klien 0, open client 1, tab switch 0, session detail / note of a loaded client 0, PR tick / gizi decision / health reviewed 1 each (the write).
- Latihan ≤ 1,800 px on 390 px.
- Portal output unchanged; every existing check green.
