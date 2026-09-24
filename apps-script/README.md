# Apps Script source

The booking app itself runs on Google Apps Script. This folder is where its code
lives in git, so every change has history and a backup. The tool that syncs it is
[clasp](https://github.com/google/clasp), Google's command-line tool for Apps Script.

These steps need your Google account, so run them on your own computer.

## One-time setup

1. Install [Node.js](https://nodejs.org), then install clasp:
   ```sh
   npm install -g @google/clasp
   ```
2. Turn on the Apps Script API for your account:
   https://script.google.com/home/usersettings → **Google Apps Script API** → On.
3. Log in (opens a browser window):
   ```sh
   clasp login
   ```
4. Find the **Script ID**: open the project in the Apps Script editor →
   **Project Settings** (gear icon) → **IDs** → *Script ID*.
   This is **not** the long `AKfy…` code in the `/exec` URL — that one is the deployment ID.
5. From the repository root, pull the code into this folder:
   ```sh
   cd apps-script
   clasp clone <SCRIPT_ID>
   ```
   This creates `.clasp.json` and downloads the files (`Code.js`, `appsscript.json`, any `.html` files).
6. Commit and push the new files.

## Day to day

Edited in the online editor → bring the changes into git:
```sh
cd apps-script
clasp pull
git add . && git commit -m "Update booking app" && git push
```

Edited here → send the changes to Google:
```sh
cd apps-script
clasp push
```

## Publishing a new version without breaking the website

The website loads the app from a fixed `/exec` URL. To keep that URL, always update
the **existing** deployment:

- In the editor: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
- Or with clasp, using the deployment ID from the `/exec` URL in `../index.html`:
  ```sh
  clasp push
  clasp deploy -i AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ -d "What changed"
  ```

Choosing **Deploy → New deployment** creates a *different* URL. If that happens,
paste the new URL into the `<iframe src>` in `../index.html`.

## Keep secrets out of git

If this repository is public, everything in this folder is public too.
Never put passwords, API keys or tokens in the code. Store them in
**Project Settings → Script Properties** and read them with
`PropertiesService.getScriptProperties().getProperty('NAME')`.

`.clasprc.json` (your clasp login) is listed in `.gitignore` and must never be committed.
