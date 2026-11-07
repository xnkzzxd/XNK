'use strict';
// Assembles the whole xnk.my.id site for GitHub Pages "GitHub Actions" deploys (Phase AAA, T-1713):
// the files Pages publishes today (a whitelist, see PUBLISHED) plus the static builds of the app under
// /next/ and of the landing under /next/landing/. Output goes to dist/ (not committed).
//   node apps-script/pt-scheduler/tools/build-site.js [outDir] [--exec URL]
//
// The panel (static app) is the page at / (T-1722). The old iframe wrapper, whose source stays index.html at the
// repo root, is published at /legacy/ and, as a one-variable rollback, at / again when the repo variable
// ROOT_LEGACY is "true" (or buildSite({ rootLegacy: true })): set it, re-run the Pages workflow, done.
const fs = require('fs');
const path = require('path');
const { build, write } = require('./build-static');

const ROOT = path.join(__dirname, '..', '..', '..');

// Everything at the repo root that the live site serves. A new root file or folder must be listed here
// or in NOT_PUBLISHED (tests/build-site.test.js fails otherwise), so an Actions deploy can't silently drop it.
const PUBLISHED = [
  'CNAME', '404.html', 'robots.txt', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'logo.png', 'manifest.webmanifest', 'index.html', 'sw.js', 'offline.js', 'offline-host.js', 'offline.css',
  'app', 'demo', 'exercises', 'figure', 'foods',
];
const NOT_PUBLISHED = [
  '.git', '.github', '.gitignore', '.nojekyll', 'CLAUDE.md', 'README.md', '_config.yml',
  'host-local.js',   // source of the static pages' local host; build-static.js ships it hashed under next/
  'apps-script', 'docs', 'android', 'ios', 'capacitor', 'dist', 'node_modules', '.DS_Store',
];

const OFFLINE_HOST_TAG = '<script src="/offline-host.js"></script>';
// /legacy/ is the wrapper without offline-host.js. That script registers /sw.js with the scope "/", which would replace the
// panel's own service worker (sw-app.js) every time /legacy/ is opened. As the root page (rollback) the wrapper stays whole.
function legacyWrapper() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!html.includes(OFFLINE_HOST_TAG)) throw new Error('index.html no longer loads /offline-host.js: update build-site.js (legacyWrapper)');
  return html.replace(OFFLINE_HOST_TAG, '<!-- /legacy/: no offline-host.js here, it would register /sw.js over the panel worker (see tools/build-site.js) -->');
}

function buildSite(opts) {
  opts = opts || {};
  const out = opts.outDir || path.join(ROOT, 'dist', 'site');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const rootLegacy = opts.rootLegacy !== undefined ? !!opts.rootLegacy : process.env.ROOT_LEGACY === 'true';
  for (const name of PUBLISHED) {
    if (name === 'index.html' && !rootLegacy) continue;   // the root page is the static app, built below
    const from = path.join(ROOT, name);
    if (!fs.existsSync(from)) throw new Error('published file is missing from the repo: ' + name);
    fs.cpSync(from, path.join(out, name), { recursive: true });
  }
  fs.writeFileSync(path.join(out, '.nojekyll'), '');   // no Jekyll: files and folders starting with _ are served as they are
  // The old wrapper stays reachable: as the rollback target and for anyone with its address.
  fs.mkdirSync(path.join(out, 'legacy'), { recursive: true });
  fs.writeFileSync(path.join(out, 'legacy', 'index.html'), legacyWrapper());
  if (!rootLegacy) write(out, build({ site: 'app', exec: opts.exec, root: true }));
  write(path.join(out, 'next'), build({ site: 'app', exec: opts.exec }));
  write(path.join(out, 'next', 'landing'), build({ site: 'landing', exec: opts.exec }));
  return out;
}

module.exports = { buildSite, legacyWrapper, PUBLISHED, NOT_PUBLISHED, ROOT };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ei = args.indexOf('--exec');
  const exec = ei >= 0 ? args.splice(ei, 2)[1] : undefined;
  const out = buildSite({ outDir: args[0] ? path.resolve(args[0]) : undefined, exec });
  const count = d => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
  console.log('site: ' + count(out) + ' files in ' + path.relative(process.cwd(), out));
}
