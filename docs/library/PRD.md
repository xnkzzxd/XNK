# Phase AB — XNK Library + Template (PRD)

## Problem
The owner wants other coaches (separate businesses) to run the same app from one codebase, by duplicating a
spreadsheet, without copying the business logic and without touching the owner's production spreadsheet,
Apps Script project or xnk.my.id.

## Decisions (owner, 2026-11-17)
- Each copy = a different coach business (multi-tenant on Apps Script; Phase V stays paused).
- Production is untouched: `apps-script/pt-scheduler/src`, `pt-scheduler.yml`, the deployment, data and Script Properties.
- Two new spreadsheets: **XNK Library** (its script = the whole app as a Library) and **XNK Template** (blank sheets +
  a thin bridge). The template is a new blank spreadsheet, so no client data is ever copied.
- One GitHub template repo **XNK Template Site**: the static pages (like xnk.my.id, not an iframe) pointed at the
  coach's own `/exec` through `config.json`. Offline mode works as on xnk.my.id.
- PIN, sessions, cache, locks and settings must never mix between spreadsheets.
- Setup must be as easy as possible: a wizard in the spreadsheet, one form in GitHub Actions.

## Requirements
1. The Library is built from production source on every change (no second codebase), and behaves the same as
   production except for the deliberate identity changes (CI runs the whole production suite against it).
2. The Library never uses its own Script Properties, Cache or Lock; every call carries the caller's (`ctx`).
   A call without context is refused.
3. The bridge contains no business logic: `ctx_()`, `doGet`/`doPost`, trigger handlers, menu, wizard, health check,
   and one generated wrapper per API function.
4. Initialization is idempotent; a copied spreadsheet wipes every inherited Script Property on first setup.
5. Setup functions are owner-only (`requireOwner_`), so web visitors cannot call them through the bridge.
6. Owner identity baked into production (portal link, page title, favicon, evaluation sheet ID, landing) becomes
   per-spreadsheet settings in the Library build.
7. Coach sites rebuild from the latest public XNK code without tokens; the coach's `config.json` and `custom/` are
   never overwritten.

## Out of scope (for now)
Web Push and the landing page on coach sites; per-coach colours beyond the name and icon; automatic Library
version bumps in copies owned by other accounts (Google does not allow a script to change its own manifest).
