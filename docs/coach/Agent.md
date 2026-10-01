# Agent guide — Phase E (coach hub, coach profile, client care)

For any AI agent or developer building Phase E. **Read [../Agent.md](../Agent.md) first: every rule there still applies.** Then read, in this order: [PRD.md](PRD.md) (what), [Design.md](Design.md) (how), [TODO.md](TODO.md) (what's next).

## 1. The situation in one paragraph

The app was built for several coaches. It now has **one coach, who is the owner** (decision D-11, D-12). Phase E makes that the normal case ("solo mode"), turns the Coach tab into the owner's hub, gives clients a real coach page, makes hours and days off real, and adds client care (private notes, health form, assessment, fitness tests). A second coach can be added later, so solo mode **hides UI and never deletes data**.

## 2. Map of the coach code

Search by name; line numbers drift.

| Where | What |
| --- | --- |
| `Kode.gs` § `03_COACHES` | `getCoaches` (public), `addCoach`, `updateCoach`, `deleteCoach`, `_getCoachPhotoFolder_`, `_checkImageUpload_`, `uploadCoachPhoto` |
| `Kode.gs` § `08_AVAILABILITY` | `getPublicAvailability` (reads `Coaches` and `CoachAvailability`; creates the sheet on read, a side effect to remove) |
| `Kode.gs` schedules | `_getSchedulesAll_`, `_addScheduleInternal_` (auto-assign, the `"Belum Ditugaskan"` write), `updateScheduleCoach`, `clientBookSchedule`, `clientBookRecurring`, `clientRescheduleSchedule` (`RESCHEDULE_CUTOFF_HOURS`), `completeSession` |
| `Kode.gs` stats | `getCoachMonthlyStats`, `_coachMonthlyStats_`, `_revenueSummary_`, `_completedWeeks_`, `_streak_`, `_bestStreak_`, `getPublicTestimonials` |
| `Kode.gs` members | `MEMBERDATA_HEADERS`, `_memberPublicProfile_`, `_tulisLogTransaksiMember_` (Members log columns H/I coach, K price) |
| `Reminder.gs` | `REMINDER_JOBS`, `_dueJobs_`, `_buildClientPools_`, `sendSesiBesokDigest_` ("dengan Coach {name}"), `_nearestFreeSlots_` |
| `App.html` | `renderCoaches`, `coachStats`, `openCoachProfile`, `openAddCoachModal`, `submitAddCoach`, crop flow, `populateMemberCoachOptions`, `saveCoachAssignment`, `coachFilterOptions`, `renderLeaderboard`, `renderMonthlyStats`, `renderPublicCoaches`, `coachContactNumber`, `publicDayPanel`, `openScheduleDetail`, `openProfile` |
| `Index.html` | `#view-coaches`, `#view-public-coaches`, `#modal-add-coach`, `#member-coach`, `#edit-member-coach` |
| `LandingScript.html` | `computeOpenSlots`, `loadSlots` (calls `getCoaches`, `getPublicAvailability`, `getBusinessHours`) |
| Sheets | `Coaches`, `CoachAvailability`, `Schedules` (I/J coach), `MemberData` (K/L coach, P opt-outs, Q/R badges), `Members` log, `Progress`, `Evaluasi` rows behind testimonials |

**The three free-slot calculations that Phase E replaces with one engine:** `computeOpenSlots` (landing), `publicDayPanel` (portal), `_nearestFreeSlots_` (reminders).

## 3. Rules for this phase

These add to the main guide (§2 there). They come from the PRD's decisions and risks.

1. **Solo mode hides, never deletes.** An inactive coach keeps every ID, name and past session. Don't remove rows from `Coaches` except through the "unused" delete path (CS-6).
2. **Unassigned = empty ID and empty name.** Never write "Belum Ditugaskan" (CS-1). When reading old rows, treat that text as empty. Display text such as "tanpa coach" is a view concern, not data.
3. **One slot engine.** All free-hour questions go through `_freeSlots_` (Design §2.6). Don't add slot math to the browser or a new `.gs` file. The browser fallback that exists before E2 ships is removed, not extended.
4. **`getCoaches` is public.** Return only what `_publicCoach_` whitelists (CP-5). Never add the day-off note, the health data or the active flag. Admin screens use `getCoachesAdmin`.
5. **Health data, flags, private notes, assessment notes, test extras and day-off reasons are admin-only.** They never go to: Telegram, email, `Logger`, error messages, `xnk_admin_cache`, `_memberPublicProfile_`, `getMembers`, `getPublicSchedules`, `getMyProgress`, the landing page, or any public function. Load them through `getClientCare` / `getSessionBriefing` on demand. Add a key-list test for every response that shares a record with these (Design §9).
6. **Telegram about a health form names the client and nothing else.** No answers, no flags.
7. **Member care functions read the member from the token**, never from an argument (main rule 7b pattern). `getMyAssessment` returns the subset in Design §2.3 only.
8. **Coaches are not users.** No coach tokens, no coach pages, no coach-only functions. The admin PIN is the only privileged login (D-11).
9. **The landing page's coach copy is hand-written and stays that way** (D-13). In Phase E the landing page changes in exactly one place: `loadSlots`.
10. **Read `Coaches` by header name.** A legacy 7-column row (no Status Aktif) is an active coach. `_ensureCoachSchema_` is idempotent and runs under `LockService.getScriptLock()` on admin writes only; reads never create sheets or columns.
11. **Defaults equal today's behavior** (main rule 5): no saved hours = studio hours; no targets = no card; new reminder types off; reschedule notice default 2 hours; solo mode is automatic only because there is one active coach.
12. **Rename propagation touches only sessions that are not completed**, plus `MemberData`. Completed sessions and the transaction log keep the name they had (CP-3).
13. **Hours are whole numbers, dates are `YYYY-MM-DD` in WIB**, written as Plain Text. Use `_wibParts_`; never `new Date(string)` on a date-only value for day-of-week.
14. **Status and "today" are server-side** (`getCoachStatus`, `getCoachHub`). The browser doesn't recompute availability, stats or pace.
15. **The panel's preview and the portal profile share one renderer** (`renderCoachProfile`). Don't fork it.
16. **Every new `.gs` function** follows main rule 3 (guard first line, trailing `_`, or `requireOwner_`), and its name goes into the right list in `tests/security.test.js` in the same commit.

## 4. How to work a task

Same loop as main §3, with these changes:

1. Open [TODO.md](TODO.md) and take the lowest-numbered unchecked task in the **current phase** (E1 → E5) whose dependencies are done. Mark it `[~]`.
2. Read the matching section of [Design.md](Design.md) and the requirement IDs in [PRD.md](PRD.md). If the design is wrong or unclear, fix the design text in the same change and say so.
3. Implement (main §4 conventions). UI: phone layout first, then widen.
4. Add or update tests in `apps-script/pt-scheduler/tests/` (Design §9 lists the files).
5. Run the checks below until clean.
6. Update docs the change makes stale: `apps-script/README.md` (Indonesian, for the owner), root `README.md`, this phase's state in §6 below, and [../Agent.md](../Agent.md) §7.
7. Tick the task `[x]` in TODO.md in the same commit.
8. Commit: an imperative summary line, then what changed and why. Work on a branch; one phase = one pull request (main rule 8).

## 5. Checks before every push

Same as main §5:

```sh
node apps-script/pt-scheduler/tools/check-syntax.js
node --test apps-script/pt-scheduler/tests/*.test.js
# UI changes (needs Playwright), includes the phone pass at 390 × 844:
NODE_PATH=$(npm root -g) node apps-script/pt-scheduler/tools/browser-check.js
```

Extra for this phase:

- A change that touches slots must show the **before/after hours for the same data** in a test (CA-4: no saved hours = unchanged).
- A change that adds a field to a shared response must update that response's key-list test.
- Never hit Telegram or WhatsApp from tests; assert on `env.fetches`.

## 6. Current state (2026-10-01)

- **Phase E is planned, nothing is built.** Phases A–D are live (see [../Agent.md](../Agent.md) §7).
- Decisions in [PRD.md](PRD.md) §6: no coach logins, solo mode with a coach addable later, landing copy stays hand-written, health and notes admin-only, retest every 28 days, four optional targets, the portal's Coach tab becomes one profile page.
- Known bug to fix first (T-200): "Belum Ditugaskan" is stored as a coach name.
- Build order: E1 solo mode and coach data → E2 hours, days off, slot engine → E3 coach hub → E4 client care → E5 portal coach page.
