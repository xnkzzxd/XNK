'use strict';
// src/App.html and src/Theme.html are generated from parts/app/*.part and parts/theme/*.part (tools/build-parts.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { TARGETS, assemble, partFiles, ROOT } = require('../tools/build-parts');

for (const [name, t] of Object.entries(TARGETS)) {
  test(`${name}: ${t.out} is exactly the parts joined (run tools/build-parts.js after editing a part)`, () => {
    const have = fs.readFileSync(path.join(ROOT, t.out), 'utf8');
    assert.ok(have === assemble(t), `${t.out} is stale or was edited by hand: edit the files in ${t.dir}/ and run node apps-script/pt-scheduler/tools/build-parts.js`);
  });
  test(`${name}: parts are numbered without gaps and none is empty`, () => {
    const files = partFiles(t);
    assert.ok(files.length >= 2);
    files.forEach((f, i) => {
      assert.match(f, /^\d{2,}-[a-z0-9-]+\.part$/, f);
      assert.equal(parseInt(f, 10), i + 1, `${f} is out of order (expected number ${i + 1})`);
      assert.ok(fs.statSync(path.join(ROOT, t.dir, f)).size > 0, f + ' is empty');
    });
  });
}
test('the generated files still have exactly one <script> / <style> block (build tools rely on it)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.html'), 'utf8');
  const theme = fs.readFileSync(path.join(ROOT, 'src/Theme.html'), 'utf8');
  assert.equal((app.match(/<script>/g) || []).length, 1);
  assert.equal((app.match(/<\/script>/g) || []).length, 1);
  assert.equal((theme.match(/<style>/g) || []).length, 1);
  assert.equal((theme.match(/<\/style>/g) || []).length, 1);
});
