# Phase AG — Poster coach (Design)

## Server — `src/PosterData.gs`
- `getPosterData(token, opts)` (admin, READ_OK, coach gate `['x']`): one call, under `_withMemberMemo_` + `_withSchedulesMemo_`.
  Returns `{ today, coach, avatar, coaches, packages, slots, testimonials, results, stories, qrUrl, xnkCoach }`.
  - Coach: a coach token always gets its own coach (`_scopeCoach_`), whatever `opts.coachId` says; the owner gets the picked coach (multi-coach) or "Ini saya" (`_selfCoach_`). `coaches` (picker) only for the owner with 2+ active coaches.
  - Clients of the coach: multi-coach (or coach token) = MemberData column K equals the coach; solo = all clients.
  - `slots`: `_openSlotsCached_({ days: 7, coachId })` reduced to free, not past, not off hours.
  - `testimonials`: SessionRatings and PackageEvaluations with `izin` and a comment, from the coach's clients, name via `_maskNamaTestimoni_`, text ≤ 280 chars; for the owner in solo mode also the old evaluation form (`getPublicTestimonialsImpl_`). Max 20, newest first.
  - `results`: pure `_posterResults_` over `_posterRange_(period)` (`bulan`, `bulanLalu`, `3bulan`, `semua`): completed sessions, unique clients, average stars, PRs (`_workoutEvents_`), kg / waist cm lost (only decreases; start = last entry before the range or the first inside it). WorkoutLog and Progress are read once (`_sheetRowsMemo_`).
  - `stories`: clients with consent → `{ id, first }`.
  - `qrUrl`: Script Property `SITE_URL` + `/info/` (hub coach info page), else `_shareQrUrl_()`.
  - `xnkCoach`: `POSTER_XNK` (one line; prices must equal `xnk-library/tools/hub-harga.js` TIERS — `tests/poster.test.js`) for the owner only. The Library build replaces that line with `null` (`build-lib.js` `POSTER_XNK_LINE`).
- `getPosterResults(token, period, coachId)`: results for another period without reloading everything.
- `getPosterStory(token, memberId)` (coach gate `['m']`): refuses with "Klien belum mengizinkan poster." without consent; pure `_posterStory_` returns first name, weeks, sessions, PRs, weight / waist from → to, and the lift with the biggest est. 1RM gain.
- Consent: `saveMyProfileCard(memberToken, { poster })` (existing member writer, only sent keys change); `_pfFrom_` reads JSON key `p`; `getPortalMore.profile.poster`.
- Settings: `posterEnabled` in `getAppSettings` / `updateAppSettings` (`POSTER_ENABLED`), `getAdminMore.posterEnabled` (owner and coach paths) → `window.posterOn`.

## Browser — `parts/app/27-poster.part`, `parts/theme/16-poster.part`
- Drawing reuses the share-card kit: `window.shareKit` in `Bagikan.html` (fonts, `Tx`, `caps`, `fit`, `rrect`, `drawCover`, `drawQr`, `drawAvatar`, `tinted`, `logo`, `download`, `sendFiles`, `copy`, `mark`). Share cards themselves are unchanged (`sendFiles` / `copyBlob` are the old code moved into functions; the wrapper's `share-done` failure now calls the caller's fallback).
- The part runs in its own inner IIFE so its names never clash with other parts.
- Look = xnk.my.id (owner's feedback 2026-11-28, "konsistensi"): Inter only (titles 800 with −3 % tracking, sentence case, never Anton or capitals), monochrome, soft grey gradient background with a light in the top left, rounded glass cards (thin fill, bright edge, soft shadow), black / white pill buttons and chips, plan rows with a radio like a plan picker. Layout (1080 wide, margin 72): brand row (logo + brand name; outlined label pill on the right), content drawn on its own layer and moved to the middle of the free space, then a small footer: one pill button with the call to action, WhatsApp / Instagram in one small line, a 128 px QR on a white card. The footer ends above `H − 72`; the strip below is reserved for the corner mark.
- Brand: `poBrand()` = "XNK" on xnk.my.id, `window.brandName()` in the Library (`TEXT_SWAPS`). Corner mark: `shareKit.mark()` returns `''` in production and `L.id.poweredBy` ("Didukung XNK") in the Library; hidden under `data-own-brand`.
- Colours: Gelap / Terang, **Warna aksen** only when the page has a brand accent (`data-accent` / `data-brand-accent`; colours read from `--accent` / `--on-accent`), **Foto** (background photo from the device, darkened).
- Editor `#sheet-poster` (prefix `po-`) uses the dark share-editor shell classes (`.share-sheet`, `.sh-*`): phone = preview + five tools (Jenis, Isi, Teks, Gaya, Ukuran) whose pane opens on tap; desktop = preview + 340 px tool column. Text fields: Judul, Teks kecil, Ajakan (empty = default shown as placeholder), switches WhatsApp, Instagram, QR. Prefs per device in `xnk_poster_prefs` (size, style, period, per-type text and picks). Export PNG: Simpan, Salin (desktop), Bagikan.
- Portal consent: `window.posterConsentHtml(desk)` in Saya (phone card under the tiles, desk row in "Makan & berbagi"), saved optimistically through `saveMyProfileCard({ poster })`.

## Checks
- `tests/poster.test.js`: data shape and privacy, testimonial consent, pure results and ranges, story consent (on/off), coach scope, XNK Coach prices = hub landing, off switch.
- `xnk-library/tests/library-build.test.js`: Library brand + mark, `POSTER_XNK = null`; `check-compat.js` lists the XNK Coach test as an expected difference.
- `tools/poster-check.js` (CI, demo build): editor on phone and desktop, every tool pane, no sideways scroll, every type × size × style inside the margins with an empty corner strip on xnk.my.id, brand XNK, seven types for the owner.
