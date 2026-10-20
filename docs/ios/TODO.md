# Phase N — iPhone / Safari (panel + client portal)

What: the panel (xnk.my.id) and the client portal (book.xnkbooking.my.id) look and work right on iPhones, both in Safari and from the Home Screen.

Why: on iOS the app runs two iframes deep (wrapper page → Apps Script page → our HTML). Inside an iframe, iOS reports `env(safe-area-inset-*)` as 0, `visualViewport` doesn't see the keyboard, and Safari may stretch an iframe to its content's width and shrink the whole page. Owner's reports: everything very small on book.xnkbooking.my.id, three bars at the bottom (home bar, Safari toolbar, app tab bar), keyboard over forms, notch and home bar ignored, sticky hover colours, page bounce.

Decided: the tab bar sits flat against the bottom edge on iPhone (iOS only; Android and desktop unchanged), plus a one-time "Tambahkan ke Layar Utama" hint so Safari's toolbar disappears.

## Tasks

- [x] **T-900 Host bridge (wrappers).** `index.html` here and in BookingPT-Client:
  - viewport `minimum-scale=1, viewport-fit=cover`;
  - fixed, non-scrolling `html`/`body`;
  - iframe `width:1px; min-width:100%`;
  - `#sa-probe` measures the safe area;
  - answers `{xnk:'host?'}` only from `*.googleusercontent.com` with `{xnk:'host', v:1, insets, kb, ios, standalone}` (numbers and booleans only), sent again on resize / orientation / `visualViewport` changes;
  - takes `{xnk:'theme', color}` (validated hex) for `theme-color`;
  - status bar `black-translucent`;
  - BookingPT-Client gets a manifest (`display: standalone`).
- [x] **T-901 Host bridge (app).** `App.html`:
  - `hostBridge` asks `window.top` and accepts replies only from `window.top` with an origin in `HOST_ORIGINS`;
  - `applyHostInfo` sets `--sa-t/r/b/l` and `--kb`, plus `html.ios`, `.standalone` and `.kb-open`;
  - `setTheme` and system theme changes post the `--bg` colour.
- [x] **T-902 Safe area and docked tab bar.** `Theme.html`:
  - every `env(safe-area-inset-*)` is now `var(--sa-*)`;
  - `--tabbar-space` drives the save bar, toast, resume bar and page padding;
  - top bar and detail head pad under the notch;
  - `html.ios` at < 768 px docks the tab bar (full width, flat bottom, covers the home bar).
- [x] **T-903 Keyboard.**
  - `.layer` pads by `--kb`, sheets shrink by it, the logger pads by it;
  - with `.kb-open`, the tab bar, save bar, resume bar and hint hide;
  - the focused field scrolls to the centre.
- [x] **T-904 Inputs, buttons, gestures.**
  - `text-size-adjust: 100%`, no sideways overflow;
  - date/time fields left-aligned and inside their box;
  - every `:hover` rule wrapped in `@media (hover: hover)`;
  - no long-press menu or text selection on buttons;
  - `overscroll-behavior: contain` on sheets and panels, `touch-action: none` on backdrops;
  - in Home Screen mode on iOS, a swipe from the left edge goes back one level through the existing back stack.
- [x] **T-905 "Tambahkan ke Layar Utama" hint.** `#a2hs`:
  - shown when on iOS, not Home Screen, phone, logged in, no guide, sheet or logger open;
  - "Nanti" asks again in 7 days, "Mengerti" never again (`localStorage xnk_a2hs`, this device only).
- [x] **T-906 Checks.** `tools/browser-check.js`:
  - "iPhone / Safari": no element wider than the phone on six portal and four panel views; docked tab bar; notch; toast; hint once; keyboard lifts the sheet and hides the tab bar; without a host message nothing changes;
  - "Pembungkus xnk.my.id": the wrapper answers only the app frame, sends numbers only, takes the theme colour, never zooms out.
  - `Kode.gs` `doGet` viewport now matches the wrappers.

## Owner check on a real iPhone (no iOS WebKit in CI)

Safari and Home Screen, on both sites:
- normal size;
- tab bar flat on the home bar;
- keyboard below the open sheet;
- no page shift after the keyboard closes;
- swipe back in Home Screen mode;
- status bar follows light/dark.
