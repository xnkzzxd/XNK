# XNK — project memory

Repo `xnkzzxd/XNK` = site **xnk.my.id** (GitHub Pages, push to `main` publishes) + the source of the
Google Apps Script app "PT Scheduler" in `apps-script/pt-scheduler/`. One Apps Script deployment
(`AKfycbyVOm1…BgJ`) backs three sites: xnk.my.id (PT panel, `Index`), xnkbooking.my.id (`?view=Landing`,
repo BookingPT), book.xnkbooking.my.id (`?view=public`, repo BookingPT-Client).

## Rules
- Change Apps Script code only in `apps-script/pt-scheduler/src/`; each deploy overwrites the online editor.
- Merge to `main` auto-deploys via `.github/workflows/pt-scheduler.yml` (clasp push + redeploy same deployment).
- Never put secrets in code; they live in Script Properties (`ADMIN_PIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`, ...).
- Any `.gs` function not ending in `_` is publicly callable: admin fns take `token` first + `requireAdmin_(token);`,
  member fns `requireMember_(token)`, maintenance fns `requireOwner_()`. `security.test.js` enforces this.
- Docs are in Indonesian (`apps-script/README.md`); root README is English. Keep both current.

## Layout (src/)
`Kode.gs` server (incl. client tasks/PR + templates) · `Reminder.gs` Telegram reminders (timer `runReminderTick`, owner sets up via `setupReminderTrigger`) · `Index/Theme/App.html` PT panel + client portal · `Landing/LandingStyle/LandingScript.html`
marketing page · `Scripts.html` shared helpers. Old `Styles.html`/`Components.html` were removed.

## Current state (as of 2026-09-30)
- Settings CRUD is live (admin panel → Pengaturan): Telegram, `NOTIF_EMAIL`, `BUSINESS_HOURS_JSON`
  (per weekday, read by Landing, portal, dashboard heatmap), lockout/session numbers (`SETTINGS_NUMERIC_BOUNDS`
  in Kode.gs; defaults are the constants at the top). Via `getAppSettings`/`updateAppSettings`.
- Sessions: admin 30d, member 90d (defaults). Revenue estimate = 65% of package price.
- No `Test.gs`/in-editor `test*` functions (removed on purpose). `runReminderTick` is a public trigger handler, gated by `RMD_ENABLED` + throttle.
- Landing: plain scroll (no muscle-scan effect), real per-coach slot availability.

## Check before pushing
```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js   # 60 pass
```
