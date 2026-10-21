# XNK — xnk.my.id

The internal booking tool for the XNK PTs at **https://xnk.my.id**. It is a GitHub
Pages site that shows the booking app (a Google Apps Script web app) full-screen,
with a loading screen and "Add to Home Screen" support. PTs log in inside the app.
It is not meant to be shared publicly and is hidden from search engines.

Pushing to `main` publishes the site. The custom domain comes from `CNAME`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page: loading screen and the booking app in an iframe. |
| `404.html` | Shown for unknown addresses; sends visitors back to the home page. |
| `manifest.webmanifest` | Name, colors and icons used when the site is installed on a phone. |
| `logo.png` | Original logo (white mark on transparent). Source for all icons. |
| `favicon.ico` | Browser tab icon (16, 32, 48 px). |
| `icon-192.png`, `icon-512.png` | App icons (rounded black square). |
| `icon-maskable-512.png` | Android app icon; the logo is smaller so Android can crop it to any shape. |
| `apple-touch-icon.png` | iPhone/iPad home-screen icon (180 px). |
| `robots.txt` | Tells search engines not to crawl the site. |
| `_config.yml` | Keeps `apps-script/`, `docs/`, `CLAUDE.md` and this README off the public website. |
| `docs/` | Upgrade plan: `PRD.md`, `Design.md`, `Task.md`, and `Agent.md` (rules for AI agents and developers). `docs/coach/` has the same four files for the coach phase (`PRD.md`, `Design.md`, `Agent.md`, `TODO.md`); later phases have their own folders (`finance/`, `loop/`, `portal/`, `workout/`). Not published. |
| `CLAUDE.md` | Loads `docs/Agent.md` for Claude Code. Not published. |
| `apps-script/` | Source of the Apps Script apps (PT Scheduler), auto-deployed by GitHub Actions — see [apps-script/README.md](apps-script/README.md). |

**iPhone.** `index.html` measures the iPhone safe area (notch, home bar) and the keyboard height. It passes them to the app as plain numbers, because iOS hides both inside iframes. It also takes the app's theme colour for the Safari bars, and never lets Safari zoom the page out. The app docks its bottom bar on iPhones and suggests "Tambahkan ke Layar Utama" once. Details: [docs/ios/TODO.md](docs/ios/TODO.md).

## Access

PTs log in **inside the app** with the admin PIN. The Apps Script server checks it,
so opening the `/exec` address directly does not get around it. Each phone stays
logged in for 30 days; after 10 wrong PINs in 10 minutes, login locks for 10 minutes
and Telegram gets an alert. These are defaults: the panel's **Pengaturan** page can change
them, plus Telegram, reminders, notification email and business hours. Daily client reminders rotate through 62 texts each (sheet `PesanVariasi`) and greet clients as "Kak <first name>".

The PIN is the `ADMIN_PIN` Script Property of the Apps Script project. Changing it logs
every phone out. How to change it (also without opening the editor) is in
[apps-script/README.md](apps-script/README.md).

**New-client guide.** Clients who sign up themselves get a step-by-step guide in the
client portal (dark screen, one highlighted button per step, once per page). Existing
clients, renewals and clients added by the PT don't. It is on by default; switch it off
in **Pengaturan → Tampilan → Panduan klien baru**.

**Booking slots.** The landing page and the client portal load the free hours when they
are opened and reuse them for 2 minutes; nothing polls in the background, which keeps the
Apps Script quota low. Every client booking is checked by the server under a lock in the
same call that saves it. If the hour was just taken, the client is not shown an error: the
booking sheet stays open with up to three nearby free times for the same duration. A time
like 07:15 is booked as the whole hour from 07:00.

**Workout logging.** The PT writes each client's program in a form (days, exercises,
sets, rep range or a per-set scheme with warm-ups, target weight, rest, supersets). The
client (portal) and the PT (panel) log a workout on one full-screen page: every set
starts from last time's numbers (or a heavier weight once the top of the rep range was
reached), one tap on ✓ logs it, a rest timer starts by itself, and the screen stays on.
Every tap is kept on the phone, so closing the app loses nothing; the workout is sent
once at the end, and if the signal drops it waits and is sent again later. Past days
(client 7 days, PT 90 days) can be added or edited on the same page.

Since Phase O the client's **Latihan** tab works like Hevy: "Mulai latihan kosong",
one card per routine with "Mulai rutinitas", a routine page with a volume / reps /
duration chart, routines the client builds or copies from the PT's shared templates
(*Jelajahi*), and a logger with a duration / volume / sets bar, a muscle map and one
table per exercise (SET | SEBELUMNYA | KG | REP | ✓). Exercise search filters by
equipment and muscle, picks several at once and can create a custom exercise. Workout
settings (rest, previous values, warm-up and plate calculators, RPE, sound) are kept on
the device.

## Common changes

**Booking app URL.** It is written once, in the `src` of the `<iframe>` in
`index.html`. Redeploying the
Apps Script with *Manage deployments → Edit → New version* keeps the same URL;
creating a *new* deployment gives a new URL that must be pasted here.

**Brand color.** `#111111` appears in `index.html` (`--brand` and `theme-color`),
`404.html`, `manifest.webmanifest`, and as the background of every icon image.

**Logo or icons.** Keep the same file names and sizes, then replace the images:

| File | Size | Background | Logo width |
| --- | --- | --- | --- |
| `icon-192.png` / `icon-512.png` | 192 / 512 px | `#111111`, corners rounded 22%, transparent outside | ~70% |
| `icon-maskable-512.png` | 512 px | `#111111`, full square | ~50% |
| `apple-touch-icon.png` | 180 px | `#111111`, full square | ~66% |
| `favicon.ico` | 16, 32, 48 px | `#111111`, rounded | ~82% |

## After publishing

In **Settings → Pages**, make sure **Enforce HTTPS** is ticked. The page also
switches `http://` visits to `https://` itself, since the app sends the login PIN.
