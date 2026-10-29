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
- [x] T-1301 Server: `_workoutStats_` sessions carry `prs` and radar `parts`, `durasi` from `WorkoutSessions`; `BagikanData.gs` (`_shareEnabled_`, `_shareSummary_`, `_shareFor_`); part `share` in `getPortalMore` / `getClientBundle`; `shareEnabled` in `getPortalBootstrap`, `getAppSettings`, `getAdminMore`, `updateAppSettings`. Tests `tests/share.test.js`.
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

# Phase T2 — Kartu bagikan lengkap (T-1310+)

Owner request (2026-10-28): the preview was broken (tiny, white on white), badges were invisible, too few options. Wanted: full customisation, body circumference charts, more cards, different phone and desktop layouts.

## Decisions (owner, 2026-10-28)
- Still monochrome; only the record medal is gold.
- New cards: **Ukuran tubuh**, **Koleksi badge**, **Konsistensi** (heatmap + 12-week bars), **Foto progres** (before/after, client only). The coach gets every card except Foto progres.
- Body numbers stay **off by default** on Progres/Foto; when on, the client picks which of the 8 measures and **Perubahan** (default) or **Nilai**.
- Card language **English | Indonesia** (default English).
- Phone: full-screen dark editor; the preview fills the screen. Under it a compact tool bar (Kartu, Template, Gaya, Ukuran, Tata letak, Isi, Teks, Ekspor); a tool opens a small panel only when tapped (tap again or tap the preview to close). Swipe the preview to change card, tap = full screen (owner, 2026-10-29: "preview adalah area terbesar"). Desktop: two columns (preview left, all controls right), ←/→ change card.
- Templates (Minimal, Bold, Strava, Hevy, Polos) and stat order (▲/▼, on/off per number).
- Period (Latihan ini / Minggu / Bulan / 3 bulan / tanggal) for Latihan, Gerakan, Gizi, Ukuran, loaded from the server only when picked.
- Comparison **vs previous period on by default**, also since start and vs target.
- Graphs: radar, muscle body map, body-part bars, 1RM line, top-3 lifts, badge grid, small-multiple measure lines, before/after bars, macro ring, daily kcal bars, weekly bars, calendar heatmap.
- Footer: logo, date, name, round profile photo, "Coached by" + coach photo, QR to the booking site (**off by default**; address in Pengaturan → Tampilan → Kartu bagikan).
- Export: PNG, PNG HQ (2160 px), **6-second silent video** (MP4 where the browser can, else WebM), up to 5 cards at once.
- Privacy: "Sembunyikan beban" (no kg), mosaic or crop over the face on photo cards. Photos never leave the phone.
- Gallery **Kartu saya** (Lainnya, and "Semua kartu" on the Progres hero) and a small "Bagikan?" toast after a new PR, a saved measurement or meeting the calorie target (max once a day, switch in the workout settings).
- Delivered as one release.

## Tasks
- [x] T-1310 Docs (this section).
- [x] T-1311 Fixes: preview keeps its size (`flex:none`, aspect ratio), checkerboard follows ink, badges are a graph of their own, layout never overflows.
- [x] T-1312 Renderer: card model with stat ids, measure-then-draw layout (`shareCheck.layout`), EN/ID table, templates, stat order, prefs v2 in `xnk_share_prefs` (old keys migrated).
- [x] T-1313 New cards and graphs (body map from `window.WL_MM`, heatmap, before/after, top-3 lifts, badge glyphs).
- [x] T-1314 Full-screen editor (phone tabs, swipe, desktop two columns), multi-card tray, wrapper bridge accepts `files[]` (≤ 5, PNG ≤ 8 MB, video ≤ 40 MB) in both wrappers, privacy options.
- [x] T-1315 Server (`BagikanData.gs`): `_shareActivity_`, `_sharePeriodRange_`, `_sharePeriod_` (workout, lifts, food, body, compare), `prevMonth` in `share`, member `getMyShareData`, admin `getMemberShareData` (avatars as data URLs), `SHARE_QR_URL` via `updateAppSettings`.
- [x] T-1316 Gallery `public-share`, buttons (Progres hero: progres, ukuran, semua; Latihan hero: latihan, rekap, konsistensi; Pencapaian: badge; photo sheet: before/after), nudges.
- [x] T-1317 Checks: `tools/share-check.js` (11 cards × 8 style/size pairs + EN/ID/centre, body, period, no-kg, QR; bounds, overlap, graph drawn, QR finder patterns, HQ size, video), browser-check editor steps (phone + 1280 px).
- [x] T-1318 READMEs, Agent.md §7.
- [x] T-1319 Comparison, HQ export, video.

# Phase T3 — Premium: motion graphics + tampilan diam (T-1320+)

Owner request (2026-10-29): "lebih premium, motion graphics, animation". Decisions: upgrade the video and the still cards (not the editor UI); stay monochrome (gold only for records); two animation styles, Minimal (Strava) and Kinetic (Nike); video 6 / 10 / 15 s; Anton for every big number and title; grain + soft light on the still cards.

## Tasks
- [x] T-1320 Docs (this section).
- [x] T-1321 Anton (`font()` weight 800 = Anton display, uppercase titles; wordmark stays Inter 900); spaced caps labels (`caps()`); Anton added to the Index.html font link; `loadFonts()`.
- [x] T-1322 Premium background pass (`paintBg`, `paintGrain`): dark card light + vignette + sheen line, light card paper gradient, photo vignette, seeded 256 px film grain (overlay, clipped to the card, moves per video frame). Option **Efek: Grain + cahaya | Polos** (Gaya tool, default on) for Gelap / Terang / Foto; transparent styles stay clean with a soft text glow.
- [x] T-1323 Motion engine `animFrame(ctx, card, o, img, t, frame)`: **Minimal** (staggered reveal, count-up, graphs drawn, slow pull-back) and **Kinetic** (`kineticScenes`: title slam with motion ghosts, one giant Anton number per stat with wipe line and zoom/push transitions, graph scene, gold "NEW RECORD / REKOR BARU" drop, then the card assembles). Scenes per length: 3 / 5 / 7. The last frame equals the still card.
- [x] T-1324 Ekspor tool: Animasi Minimal | Kinetic, Durasi 6 / 10 / 15 dtk, **Putar pratinjau** (plays once in the preview at half resolution; tap stops). Prefs `anim`, `dur`, `fx` in `xnk_share_prefs`.
- [x] T-1325 Checks: share-check renders both styles × 3 lengths on every card and compares the last frame with the still card; browser-check covers the effect option, video options and preview playback.
