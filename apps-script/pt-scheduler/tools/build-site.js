'use strict';
// Assembles the whole xnk.my.id site for GitHub Pages "GitHub Actions" deploys (Phase AAA, T-1713):
// the files Pages publishes today (a whitelist, see PUBLISHED) plus the static builds of the app under
// /next/ and of the landing under /next/landing/. Output goes to dist/ (not committed).
//   node apps-script/pt-scheduler/tools/build-site.js [outDir] [--exec URL]
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
  'apps-script', 'docs', 'android', 'ios', 'capacitor', 'dist', 'node_modules', '.DS_Store',
];

function buildSite(opts) {
  opts = opts || {};
  const out = opts.outDir || path.join(ROOT, 'dist', 'site');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const name of PUBLISHED) {
    const from = path.join(ROOT, name);
    if (!fs.existsSync(from)) throw new Error('published file is missing from the repo: ' + name);
    fs.cpSync(from, path.join(out, name), { recursive: true });
  }
  fs.writeFileSync(path.join(out, '.nojekyll'), '');   // no Jekyll: files and folders starting with _ are served as they are
  write(path.join(out, 'next'), build({ site: 'app', exec: opts.exec }));
  write(path.join(out, 'next', 'landing'), build({ site: 'landing', exec: opts.exec }));
  return out;
}

module.exports = { buildSite, PUBLISHED, NOT_PUBLISHED, ROOT };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ei = args.indexOf('--exec');
  const exec = ei >= 0 ? args.splice(ei, 2)[1] : undefined;
  const out = buildSite({ outDir: args[0] ? path.resolve(args[0]) : undefined, exec });
  const count = d => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
  console.log('site: ' + count(out) + ' files in ' + path.relative(process.cwd(), out));
}
