'use strict';
// T-2220: halaman tiap coach di hub dibangun dari commit XNK yang sama dengan Library di spreadsheet coach itu.
//   node apps-script/xnk-library/tools/hub-versions.js hub.json <checkout XNK> <outFile> [--previous <url|file>]
// Untuk setiap coach:
//   1. tanya server coach: doPost getServerInfo → lib.commit (40 huruf);
//   2. tidak menjawab / Library lama tanpa getServerInfo → commit build sebelumnya (xnk.web.id/_hub/versions.json);
//   3. tidak ada keduanya → kode terbaru (seperti sebelum T-2220), dengan peringatan.
// Commit yang berbeda dari checkout diambil (`git fetch origin <sha>`) dan dibuka sebagai worktree terpisah.
// Hasil: { <slug>: { commit, dir, source } } untuk build-hub.js --versions. Tidak pernah menggagalkan build hanya
// karena satu coach tidak menjawab.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readHub } = require('./build-hub');

const SHA_RE = /^[0-9a-f]{40}$/;
const TIMEOUT_MS = 20000;

/** Jawaban getServerInfo server coach ({api, lib}), atau null (tidak menjawab, Library lama). */
async function askServerInfo(exec, fetchImpl) {
  const f = fetchImpl || fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await f(exec, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ fn: 'getServerInfo', args: [] }), redirect: 'follow', signal: ctl.signal });
    const j = JSON.parse(await r.text());
    return j && j.ok && j.data && typeof j.data === 'object' ? j.data : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** lib.commit dari server coach, atau '' (tidak menjawab, Library lama, isian aneh). */
async function askServer(exec, fetchImpl) {
  const d = await askServerInfo(exec, fetchImpl);
  const c = d && d.lib && d.lib.commit;
  return typeof c === 'string' && SHA_RE.test(c) ? c : '';
}

/** versions.json build sebelumnya (URL atau berkas); {} bila tidak ada. */
async function readPrevious(src, fetchImpl) {
  if (!src) return {};
  try {
    const text = /^https:\/\//.test(src) ? await (await (fetchImpl || fetch)(src)).text() : fs.readFileSync(src, 'utf8');
    const j = JSON.parse(text);
    return j && typeof j === 'object' ? j : {};
  } catch (e) {
    return {};
  }
}

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/** Folder checkout untuk commit itu: checkout utama bila sama, selain itu worktree (diambil dari GitHub bila perlu). */
function checkoutFor(repo, commit, cache) {
  if (cache[commit]) return cache[commit];
  let dir;
  if (git(repo, ['rev-parse', 'HEAD']) === commit) dir = '';
  else {
    try { git(repo, ['cat-file', '-e', commit + '^{commit}']); } catch (e) { git(repo, ['fetch', '--quiet', '--depth', '1', 'origin', commit]); }
    dir = path.join(path.resolve(repo), '..', '_xnk-' + commit.slice(0, 12));
    if (!fs.existsSync(dir)) git(repo, ['worktree', 'add', '--quiet', '--detach', dir, commit]);
  }
  cache[commit] = dir;
  return dir;
}

async function resolve(cfg, repo, opts) {
  opts = opts || {};
  const hub = readHub(cfg);
  const prev = await readPrevious(opts.previous, opts.fetch);
  const out = {}, cache = {}, notes = [];
  for (const c of hub.coaches) {
    let commit = await askServer(c.exec, opts.fetch), source = 'server';
    if (!commit) {
      const p = prev[c.slug] && prev[c.slug].commit;
      if (typeof p === 'string' && SHA_RE.test(p)) { commit = p; source = 'sebelumnya'; }
    }
    if (!commit) { notes.push(`${c.slug}: versi server tidak diketahui; memakai kode terbaru.`); continue; }
    try {
      const dir = checkoutFor(repo, commit, cache);
      out[c.slug] = dir ? { commit, dir, source } : { commit, source };
    } catch (e) {
      notes.push(`${c.slug}: commit ${commit.slice(0, 7)} tidak bisa diambil (${String(e.message).split('\n')[0]}); memakai kode terbaru.`);
    }
  }
  return { versions: out, notes };
}

module.exports = { resolve, askServer, askServerInfo, readPrevious, SHA_RE };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--previous');
  const previous = i >= 0 ? args.splice(i, 2)[1] : '';
  const [cfgFile, repo, outFile] = args;
  if (!cfgFile || !repo || !outFile) { console.error('pakai: hub-versions.js hub.json <checkout XNK> <outFile> [--previous <url|file>]'); process.exit(1); }
  resolve(JSON.parse(fs.readFileSync(cfgFile, 'utf8')), repo, { previous }).then(r => {
    fs.writeFileSync(outFile, JSON.stringify(r.versions, null, 1) + '\n');
    for (const [s, v] of Object.entries(r.versions)) console.log(`${s}: ${v.commit.slice(0, 7)} (${v.source})`);
    for (const n of r.notes) console.log('::warning::' + n);
  }, e => { console.error(e.message); process.exit(1); });
}
