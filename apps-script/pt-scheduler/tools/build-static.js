'use strict';
// Builds the static pages for GitHub Pages (Phase AAA, T-1711): the same Apps Script templates
// (src/Index.html, src/Landing.html) with their <?!= include() ?> tags resolved into separate,
// content-hashed files, plus config.js (where the Apps Script /exec address lives).
//   node apps-script/pt-scheduler/tools/build-static.js app|landing [outDir] [--exec URL]
// Node built-ins only. Sources stay in src/*.html; the Apps Script pages keep working from them.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'src');
const DEFAULT_DEPLOYMENT = 'AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ';   // same default as .github/workflows/pt-scheduler.yml
const INCLUDE = /<\?!=\s*include\('([^']+)'\)\s*\?>/g;

// Per site: the template, what each include becomes, and the head details doGet / the root wrapper used to add.
const SITES = {
  app: {   // panel + client portal (one page; ?view=public&k= opens the portal)
    page: 'Index.html',
    out: { 'Theme.html': { kind: 'css', base: 'theme' }, 'Scripts.html': { kind: 'js', base: 'scripts' }, 'App.html': { kind: 'js', base: 'app' }, 'Bagikan.html': { kind: 'js', base: 'bagikan' } },
    favicon: 'https://xnk.my.id/favicon.ico',
    head: [
      '<meta name="robots" content="noindex, nofollow">',
      '<meta name="theme-color" content="#0b0b0b">',
      '<meta name="mobile-web-app-capable" content="yes">',
      '<meta name="apple-mobile-web-app-capable" content="yes">',
      '<meta name="apple-mobile-web-app-title" content="XNK">',
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
      '<link rel="icon" type="image/png" sizes="192x192" href="https://xnk.my.id/icon-192.png">',
      '<link rel="apple-touch-icon" href="https://xnk.my.id/apple-touch-icon.png">',
    ],
  },
  landing: {   // public marketing page; keeps its own <title> and description, no noindex
    page: 'Landing.html',
    out: { 'LandingStyle.html': { kind: 'css', base: 'landing' }, 'Scripts.html': { kind: 'js', base: 'scripts' }, 'LandingScript.html': { kind: 'js', base: 'landing' } },
    favicon: 'https://xnkbooking.my.id/favicon.ico',
    head: [],
  },
};

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);

// The inner text of the one <style> / <script> block of an include file; anything else in it is an error.
function blockOf(file, kind) {
  const tag = kind === 'css' ? 'style' : 'script';
  const text = read(file);
  const open = new RegExp('<' + tag + '>', 'g'), close = new RegExp('</' + tag + '>', 'g');
  const opens = text.match(open) || [], closes = text.match(close) || [];
  if (opens.length !== 1 || closes.length !== 1) throw new Error(`${file}: expected exactly one <${tag}> block, found ${opens.length}/${closes.length}`);
  const i = text.indexOf('<' + tag + '>'), j = text.lastIndexOf('</' + tag + '>');
  if (text.slice(0, i).trim() || text.slice(j + tag.length + 3).trim()) throw new Error(`${file}: text outside the <${tag}> block`);
  return text.slice(i + tag.length + 2, j);
}

function defaultExec() {
  if (process.env.XNK_EXEC) return process.env.XNK_EXEC;
  return 'https://script.google.com/macros/s/' + (process.env.PT_DEPLOYMENT_ID || DEFAULT_DEPLOYMENT) + '/exec';
}

/** Returns { 'index.html': text, 'config.js': text, 'theme.<hash>.css': text, ... } for one site. */
function build(opts) {
  opts = opts || {};
  const site = opts.site;
  const def = SITES[site];
  if (!def) throw new Error('site must be app or landing');
  const exec = opts.exec || defaultExec();
  const files = {};
  let html = read(def.page);

  const seen = new Set();
  html = html.replace(INCLUDE, (m, f) => {
    const o = def.out[f];
    if (!o) throw new Error(`${def.page}: unexpected include ${f}`);
    seen.add(f);
    const body = blockOf(f, o.kind);
    const name = `${o.base}.${hash(body)}.${o.kind}`;
    files[name] = body;
    return o.kind === 'css' ? `<link rel="stylesheet" href="${name}">` : `<script src="${name}"></script>`;
  });
  for (const f of Object.keys(def.out)) if (!seen.has(f)) throw new Error(`${def.page}: include ${f} not found`);
  if (html.includes('<?')) throw new Error(`${def.page}: a template tag is left after the includes`);

  // What Apps Script (doGet) and the old wrapper page added around the template.
  const vp = 'initial-scale=1, viewport-fit=cover';
  if (!html.includes(vp)) throw new Error(`${def.page}: viewport meta not found`);
  html = html.replace(vp, 'initial-scale=1, minimum-scale=1, viewport-fit=cover');
  const extra = [
    '<script src="config.js"></script>',
    '<link rel="icon" href="' + def.favicon + '">',
  ].concat(def.head);
  if (site === 'app') extra.push(
    '<script>if (location.protocol === "http:" && !/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)) location.replace("https://" + location.host + location.pathname + location.search);</script>');
  const m = /<meta name="viewport"[^>]*>\n/.exec(html);
  if (!m) throw new Error(`${def.page}: viewport line not found`);
  const at = m.index + m[0].length;
  html = html.slice(0, at) + extra.map(l => '  ' + l + '\n').join('') + html.slice(at);

  files['config.js'] = `window.XNK_CONFIG = ${JSON.stringify({ exec, site })};\n`;
  files['index.html'] = html;
  return files;
}

function write(outDir, files) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), text);
}

module.exports = { build, write, SITES, defaultExec, DEFAULT_DEPLOYMENT };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ei = args.indexOf('--exec');
  const exec = ei >= 0 ? args.splice(ei, 2)[1] : undefined;
  const [site, out] = args;
  if (!SITES[site]) { console.error('usage: build-static.js app|landing [outDir] [--exec URL]'); process.exit(1); }
  const dir = out || path.join(__dirname, '..', '..', '..', 'dist', site);
  const files = build({ site, exec });
  write(dir, files);
  console.log('wrote ' + Object.keys(files).length + ' files to ' + path.relative(process.cwd(), dir));
  for (const [n, t] of Object.entries(files)) console.log('  ' + n + '  ' + Buffer.byteLength(t) + ' B');
}
