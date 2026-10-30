#!/usr/bin/env node
// Builds the offline demo (no Google account, sample data, resets on reload):
//   demo/index.html        panel PT        → https://xnk.my.id/demo/
//   demo/klien/index.html  portal klien    → https://xnk.my.id/demo/klien/
// Each page is the real Index.html with the real server code (src/*.gs) running in
// the browser on fake Sheets (tools/demo-runtime.js). Rebuild after changing src/:
//
//   node apps-script/pt-scheduler/tools/build-demo.js
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', '..', '..', 'demo');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

const gs = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort().map(read).join('\n;\n');
const runtime = fs.readFileSync(path.join(__dirname, 'demo-runtime.js'), 'utf8');
const page = read('Index.html').replace(/<\?!=\s*include\('([^']+)'\)\s*\?>/g, (_, f) => read(f.endsWith('.html') ? f : f + '.html'));
if (/<\?/.test(page)) throw new Error('Index.html has a template tag the demo build does not handle.');

for (const [mode, dir] of [['admin', OUT], ['public', path.join(OUT, 'klien')]]) {
  const js = runtime.replace("'__MODE__'", JSON.stringify(mode))
    .replace("'/*__GS__*/", () => JSON.stringify(gs).replace(/<\//g, '<\\/') + " + '");
  const head = '<meta name="robots" content="noindex, nofollow">\n<script>\n' + js + '\n</script>\n';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page.replace(/<head[^>]*>/i, m => m + '\n' + head));
  console.log('wrote', path.relative(process.cwd(), path.join(dir, 'index.html')));
}
