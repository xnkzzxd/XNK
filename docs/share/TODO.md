# Phase T — Kartu "Bagikan" (Strava / Hevy style), T-1300+

Clients and the coach can make a PNG card for Instagram Story / WhatsApp Status. Images are drawn in the browser (Canvas) and never uploaded.

## Decisions (owner, 2026-10-28)
- Cards: Latihan (one day), Exercises (list), Record (one exercise), Progres, Gizi (today), Rekap bulanan, Badge.
- Styles: Transparan, Transparan + grafik, Kartu gelap (1:1), Foto + overlay (photo from the phone, position atas/tengah/bawah). Sizes Story 1080×1920 or Kotak 1080×1080.
- Monochrome; only the record medal is gold. Labels in English, dates "Tue, 28 Oct 2026", weights in kg.
- Footer: XNK logo + "XNK", free-text name (device only; empty for the coach), "Coached by <coach>". No web address, no caption.
- Body data (Δ berat / pinggang) only as a change, off by default, per card.
- After **Selesai** the Latihan card opens straight away (last used style); "Ringkasan" in its footer shows the old summary.
- **On by default** (deliberate exception to rule 5). `SHARE_ENABLED=false` (Pengaturan → Tampilan → Kartu bagikan) turns it off.

## Tasks
- [x] T-1300 Docs (this file).
- [x] T-1301 Server: `_workoutStats_` sessions carry `prs` and radar `parts`, `durasi` from `WorkoutSessions`; `Bagikan.gs` (`_shareEnabled_`, `_shareSummary_`, `_shareFor_`); part `share` in `getPortalMore` / `getClientBundle`; `shareEnabled` in `getPortalBootstrap`, `getAppSettings`, `getAdminMore`, `updateAppSettings`. Tests `tests/share.test.js`.
- [x] T-1302 Renderer `Bagikan.html` (`shareDraw`: radar, bars, line, macro ring, list, badges, emblem, medal).
- [x] T-1303 `#sheet-share` (preview on checkerboard, style/size/ink/position chips, name, Bagikan / Salin / Simpan), prefs in `localStorage xnk_share_prefs`, settings toggle.
- [x] T-1304 Portal and panel entry points: hero buttons (Latihan, Rekap, Progres, Gizi), auto-open after Selesai, badge celebration.
- [x] T-1305 Wrapper bridge in `index.html` (this repo) and BookingPT-Client: `share: true` in the host answer, `{xnk:'share'|'copy', blob}` → native share sheet / clipboard, reply `share-done` / `copy-done`; the app falls back to in-frame `navigator.share`, then download.
- [x] T-1306 Checks: `tools/share-check.js` (every card × style × size, alpha), browser-check finish steps.
- [x] T-1307 READMEs, CLAUDE.md, Agent.md §7.

## Notes
- The tap handler stays synchronous: the PNG blob is rendered before any button is pressed (user activation).
- The wrapper only answers the frame that sent `host?`, accepts `image/png` up to 8 MB and sanitises the file name.
- Coach sheet shows "Minta izin klien sebelum memposting kartu ini."
- `tools/browser-check.js` already fails on the baseline at "pull down" and the `.my-coach-card` click (not related to this phase).
