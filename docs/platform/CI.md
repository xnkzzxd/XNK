# CI and auto-merge (T-1404)

## What runs

| Workflow | When | Jobs |
| --- | --- | --- |
| `.github/workflows/checks.yml` | every pull request (any file, docs too), or by hand | **`checks`**: every Agent.md §5 check: syntax, `node --test`, browser check (Playwright, phone pass included), share-card check, `sync-offline.js --check` against `xnkzzxd/BookingPT-Client`, offline check (coach + client wrapper) |
| `.github/workflows/pt-scheduler.yml` | push to `main` touching `apps-script/pt-scheduler/**` (deploy); PRs on the same paths (quick `check`) | `check`, then `deploy` (clasp push + redeploy). Unchanged by T-1404, so docs-only merges never deploy. |

- BookingPT-Client is public, so CI checks it out without a token. If the checkout ever fails, the run shows a warning ("BookingPT-Client tidak terjangkau"), skips the sync check and the client half of the offline check, and still checks the coach wrapper.
- Playwright is pinned in `checks.yml` (`PLAYWRIGHT_VERSION`) and installed outside the repo; the tools find it through `NODE_PATH`.
- The full run takes about 10 minutes (the browser check alone is about 6).

## 👤 Owner: turn on auto-merge and the required check (once)

Claude's token can't change repository settings, so these steps are yours. Use the GitHub website, signed in as `xnkzzxd`:

1. **Allow auto-merge.** Repo `xnkzzxd/xnk` → **Settings** → **General** → scroll to **Pull Requests** → tick **Allow auto-merge**. (Optional: also tick **Automatically delete head branches**.)
2. **Protect `main`.** **Settings** → **Branches** → **Add branch protection rule** (or **Rules → Rulesets → New branch ruleset**, either works):
   - Branch name pattern: `main`
   - Tick **Require a pull request before merging**. Set the required approvals to **0** so auto-merge can run without you; raise it only if you want to approve each PR yourself.
   - Tick **Require status checks to pass before merging**, search for **`checks`** and add it. The name shows up only after the workflow has run once, so do this after the T-1404 PR's run.
   - Optional: **Require branches to be up to date before merging**. It's safer, but every PR then needs a fresh run after each merge.
   - Leave **Do not allow bypassing** off, so you can still merge by hand in an emergency.
3. Save. From then on, a PR with auto-merge on merges by itself once `checks` is green.

Don't require `check` from PT Scheduler: it runs only for `apps-script/**` PRs, so a docs-only PR would wait for it forever.
