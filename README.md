# XNK — xnk.my.id

The internal booking tool for the XNK PTs at **https://xnk.my.id**. It is a GitHub
Pages site that shows the booking app (a Google Apps Script web app) full-screen,
behind a PIN screen, with a loading screen and "Add to Home Screen" support.
It is not meant to be shared publicly and is hidden from search engines.

Pushing to `main` publishes the site. The custom domain comes from `CNAME`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page: PIN screen, loading screen, and the booking app in an iframe. |
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

## Access (PIN)

PTs enter a 6-digit PIN before the booking app loads. Each phone remembers the PIN,
so it is typed once per device. After 5 wrong tries the screen locks for 30 seconds.

**Changing the PIN** (for example when a PT leaves). The page only stores a
SHA-256 hash of `xnk-pt:` + the PIN, in `PIN_HASH` near the bottom of `index.html`.

1. Make the hash of the new PIN (replace `123456`):
   - Mac/Linux terminal: `printf 'xnk-pt:123456' | shasum -a 256`
   - Or in any browser's developer console:
     ```js
     crypto.subtle.digest('SHA-256', new TextEncoder().encode('xnk-pt:123456')).then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
     ```
2. Paste the 64-character result into `PIN_HASH` in `index.html` and push to `main`.
3. Every phone is asked for the new PIN on its next visit.

**What the PIN does and doesn't protect.** It keeps casual visitors out of the
booking form. It is not real security:

- This repository is **public**, so anyone on GitHub can read the booking app's
  `/exec` address in `index.html` and open it directly.
- A 6-digit PIN hash can be cracked in seconds.

For real protection, restrict access in Apps Script itself: check a PIN or
password on the server side in the script, or limit who can open the web app in
**Deploy → Manage deployments → Who has access**. Making this repository private
would hide the address, but GitHub Pages on a private repository needs a paid
GitHub plan.

## Common changes

**Booking app URL.** It is written once, in the `data-src` of the `<iframe>` in
`index.html`; the page loads it after the PIN is accepted. Redeploying the
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

In **Settings → Pages**, make sure **Enforce HTTPS** is ticked. The PIN check
only works over HTTPS; the page switches `http://` visits to `https://` itself.
