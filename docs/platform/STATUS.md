# Phase V status (newest first)

Every task session adds one entry at the top: date, task, PR, what is done, what is half-done, questions for the owner, and the next task.

## 2026-10-30 · T-1401 Screen map (IA)
- Done: [IA.md](IA.md) lists every screen of the landing, the client portal and the coach panel as a tree (122 screens: views, tabs, sub-tabs, details, sheets, overlays, menus), with the RPCs per node and the data sheets they touch (derived from the `.gs` call graph, auth reads left out), a duplicated-data table (14 topics, e.g. weight in 10 places), long screens and deep paths (4+ taps) for V9 (D65–D67). [ia-map.html](ia-map.html) is the same tree as a self-contained, zoomable mind map (pan, pinch/wheel zoom, collapse/expand, search by screen or RPC, role filter, light/dark, details panel with RPCs; checked at 390 px and 1280 px, no console errors). Both files come from `docs/platform/ia-build.js` + `ia-map.template.html`; re-run it after UI changes, `--check` fails on stale files or an RPC that no longer exists. No app code changed.
- Half-done: the map was published once as a private artifact by this session before the conductor asked to publish it after the merge: https://claude.ai/artifact/K4aEnGiPCdXCdaQediqpJc (the conductor may reuse it or publish a fresh one; nothing was deleted). The sheet column is an approximation (string literals 5 calls deep), good for planning, not a schema.
- Owner: nothing blocking. For V9, the map shows where to look first: the coach client page (Progres tab), Pengaturan → Pengingat Klien (13 job cards), and the portal Beranda (12 slots) with Latihan two taps deep under Lainnya on phones.
- Next task: **T-1400** brand/domain shortlist (👤 needs the owner to pick).

## 2026-10-29 · T-1404 CI on every PR
- Done: new workflow `.github/workflows/checks.yml` (job **`checks`**) runs on every PR, docs-only PRs too: syntax, `node --test` (483), browser check incl. phone pass, share check, `sync-offline.js --check` + offline check against a checkout of `xnkzzxd/BookingPT-Client` (public; when unreachable it warns and checks only the coach wrapper). `pt-scheduler.yml` (deploy) is unchanged: deploys only on push to `main` for `apps-script/**`. The browser check's swap step now tries the next menu item when the first one has no allowed swap (it failed on some dates only: E47 / BR013 / AP024 as karbo have no swap under the portion limits). No app code changed.
- Half-done: the pixel diff for live files is not a CI step (no baseline tool yet), so the conductor still checks it by hand. Auto-merge and the required check need the owner's settings (below).
- Owner: follow [CI.md](CI.md) → turn on "Allow auto-merge" and protect `main` with required check `checks`. App question (not blocking): should E47 / BR013 / AP024 get a swap (wider portion range), or is "Tidak ada pengganti" fine?
- Next task: **T-1401** (mind map).

## 2026-10-29 · Planning session
- Done: plan approved (D1–D70), docs `PRD`, `Design` (§0 continuity), `Risks`, `TODO`, this file, and the session handoff (T-1405).
- Half-done: none.
- Owner, when ready: T-1400 pick a brand (Claude prepares a shortlist), T-1402 approve tiers, T-1403 create accounts.
- Next task: **T-1404** (CI covers every check + auto-merge), then T-1401 (mind map).
