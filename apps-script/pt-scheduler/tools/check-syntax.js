#!/usr/bin/env node
// Compile-checks everything clasp will push, without running it:
//   - every server file (.gs) as a V8 script
//   - every inline <script> block in the HTML files (template scriptlets
//     like <?= x ?> are replaced with a literal first)
//   - appsscript.json must be valid JSON
// Exits non-zero on the first file with errors, printing file:line.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
let failures = 0;

function compile(code, filename, lineOffset) {
  try {
    new vm.Script(code, { filename, lineOffset });
  } catch (err) {
    failures++;
    const where = (err.stack || '').split('\n')[0];
    console.error(`✗ ${where}\n  ${err.message}`);
  }
}

for (const name of fs.readdirSync(SRC).sort()) {
  const file = path.join(SRC, name);
  const text = fs.readFileSync(file, 'utf8');

  if (name.endsWith('.gs')) {
    compile(text, `src/${name}`, 0);
  } else if (name.endsWith('.html')) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(text))) {
      const attrs = m[1];
      if (/\bsrc\s*=/.test(attrs)) continue;
      if (/type\s*=\s*["'](?!text\/javascript|module)/i.test(attrs)) continue;
      const body = m[2].replace(/<\?!?=?[\s\S]*?\?>/g, '0');
      const line = text.slice(0, m.index).split('\n').length - 1;
      compile(body, `src/${name}`, line);
    }
  } else if (name === 'appsscript.json') {
    try {
      JSON.parse(text);
    } catch (err) {
      failures++;
      console.error(`✗ src/${name}: ${err.message}`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} file(s) with errors`);
  process.exit(1);
}
console.log('✓ syntax OK');
