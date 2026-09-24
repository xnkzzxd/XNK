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
| `_config.yml` | Keeps `apps-script/` and this README off the public website. |
| `apps-script/` | Source of the Apps Script apps (PT Scheduler), auto-deployed by GitHub Actions — see [apps-script/README.md](apps-script/README.md). |

## Access

PTs log in **inside the app** with the admin PIN. The Apps Script server checks it,
so opening the `/exec` address directly does not get around it. Each phone stays
logged in for 30 days; after 10 wrong PINs in 10 minutes, login locks for 10 minutes
and Telegram gets an alert.

The PIN is the `ADMIN_PIN` Script Property of the Apps Script project. Changing it logs
every phone out. How to change it (also without opening the editor) is in
[apps-script/README.md](apps-script/README.md).

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
