'use strict';
// Gelombang 2 (T-2230…T-2232): pemilik mengelola spreadsheet semua coach dari GitHub Actions (repo hub), lewat clasp.
//   node apps-script/xnk-library/tools/coach-ops.js baru      <hub.json> <slug> <nama usaha>
//   node apps-script/xnk-library/tools/coach-ops.js hubungkan <hub.json> <slug> [scriptId]
//   node apps-script/xnk-library/tools/coach-ops.js perbarui  <hub.json> <slug|semua> [--paksa]
// Kredensial: setiap akun Google coach punya secret repo hub CLASP_<SLUG> (isi ~/.clasprc.json dari `clasp login`;
// huruf besar, "-" jadi "_"). Workflow meneruskan HANYA secret coach yang sedang dikerjakan lewat env CLASP_RC (satu job
// per coach; tidak pernah semua secret sekaligus — GitHub menandai pola itu sebagai berbahaya). Alat ini menulisnya ke
// HOME sementara (izin 600) dan menghapusnya lagi. SECRETS_JSON ({CLASP_<SLUG>: …}) tetap diterima untuk tes.
// Versi Library terbaru dibaca dari tag "lib-v<N>" repo XNK (dipasang workflow XNK Library; pesan tag = scriptId
// Library, tag menunjuk commit yang membangunnya).
//   baru      buat spreadsheet + script di akun coach, pasang penghubung (Library terbaru), terbitkan web app,
//             tulis slug/nama/link /exec/scriptId/deploymentId ke hub.json. Sisa manual: buka spreadsheet →
//             XNK → Mulai setup (izin Google, PIN).
//   hubungkan untuk coach lama (dibuat dari XNK Template): cari proyek script di akun itu yang memiliki deployment
//             dari link /exec-nya, lalu simpan scriptId dan deploymentId ke hub.json.
//   perbarui  pasang Library terbaru di penghubung coach, versi baru, deployment yang SAMA (link /exec tetap).
//             "semua": coach pertama (kenari) dulu; bila servernya tidak menjawab dengan commit terbaru, sisanya
//             tidak dikerjakan. Coach yang sudah terbaru dilewati kecuali --paksa.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const bridge = require('./build-bridge');
const hubEdit = require('./hub-edit');
const { readHub } = require('./build-hub');
const { askServerInfo } = require('./hub-versions');

const CLASP_ERR = /GaxiosError|errors: \[|code: [45][0-9][0-9]|User has not enabled the Apps Script API|already exists in the current project|Could not read API credentials|invalid_grant/;

function secretName(slug) { return 'CLASP_' + String(slug).toUpperCase().replace(/-/g, '_'); }
/** T-2243: secret coach di hub.json (dicatat saat slug diganti), atau CLASP_<SLUG>. Sama dengan job plan coach.yml. */
function secretOf(c) { return (c && c.secret) || secretName(c && c.slug); }

/** Isi .clasprc.json akun coach dari CLASP_RC (atau SECRETS_JSON untuk tes); galat Indonesia bila tidak ada. */
function credFor(slug, env, secret) {
  env = env || process.env;
  const name = secret || secretName(slug);
  let v = env.CLASP_RC;
  if (!v) {
    let all = {};
    try { all = JSON.parse(env.SECRETS_JSON || '{}'); } catch (e) { all = {}; }
    v = all[name];
  }
  if (!v || typeof v !== 'string') throw new Error(`Secret ${name} belum ada di repo hub (Settings → Secrets and variables → Actions). Isinya: berkas .clasprc.json dari "clasp login" akun Google coach itu.`);
  try { JSON.parse(v); } catch (e) { throw new Error(`Secret ${name} bukan isi .clasprc.json yang utuh (harus JSON).`); }
  return v;
}

/** Jalankan clasp dengan HOME sementara milik akun coach. runner(args, {cwd, home}) → {code, out}. */
function makeClasp(slug, opts, secret) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-clasp-'));
  fs.writeFileSync(path.join(home, '.clasprc.json'), credFor(slug, opts.env, secret), { mode: 0o600 });
  const runner = opts.runner || ((args, o) => {
    const r = spawnSync(opts.claspBin || process.env.CLASP_BIN || 'clasp', args, { cwd: o.cwd, env: Object.assign({}, process.env, { HOME: o.home, SECRETS_JSON: '', CLASP_RC: '' }), encoding: 'utf8' });
    return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
  });
  const run = (args, cwd) => {
    const r = runner(args, { cwd, home });
    const out = String(r.out || '');
    if (r.code !== 0 || CLASP_ERR.test(out)) {
      let hint = '';
      if (/Apps Script API/.test(out)) hint = ' Nyalakan "Google Apps Script API" untuk akun ini di https://script.google.com/home/usersettings.';
      else if (/invalid_grant|credentials/i.test(out)) hint = ` Token akun tidak berlaku lagi: jalankan "clasp login" ulang dan perbarui secret ${secret || secretName(slug)}.`;
      throw new Error(`clasp ${args[0]} gagal untuk "${slug}".${hint}\n${out.split('\n').slice(-6).join('\n')}`);
    }
    return out;
  };
  return { run, home, done() { fs.rmSync(home, { recursive: true, force: true }); } };
}

/** Versi Library terbaru dari tag lib-v<N> repo XNK: {version, libId, commit}. */
function latestLib(repo, opts) {
  opts = opts || {};
  const git = opts.git || ((args) => execFileSync('git', ['-C', repo, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString());
  const tags = git(['ls-remote', '--tags', 'origin', 'lib-v*']).split('\n')
    .map(l => (l.match(/refs\/tags\/lib-v(\d+)$/) || [])[1]).filter(Boolean).map(Number);
  if (!tags.length) throw new Error('Belum ada tag lib-v<N> di repo XNK: workflow "XNK Library" belum pernah menerbitkan versi dengan tag (merge ke main dulu).');
  const version = Math.max(...tags);
  const tag = 'lib-v' + version;
  git(['fetch', '--quiet', '--depth', '1', '--force', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);
  const [libId, commit] = git(['for-each-ref', `refs/tags/${tag}`, '--format=%(contents:subject)|%(*objectname)']).trim().split('|');
  if (!/^[\w-]{20,}$/.test(libId || '')) throw new Error(`Tag ${tag} tidak berisi scriptId Library.`);
  if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error(`Tag ${tag} bukan tag beranotasi yang menunjuk commit.`);
  return { version, libId, commit };
}

/** Folder penghubung siap clasp push. */
function bridgeDir(scriptId, lib, c) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-bridge-'));
  bridge.write(dir, bridge.build({ libId: lib.libId, libVersion: lib.version, slug: c.slug, brand: c.brand, pusatUrl: process.env.XNK_PUSAT_URL || '' }).files);
  fs.writeFileSync(path.join(dir, '.clasp.json'), JSON.stringify({ scriptId, rootDir: '.' }));
  fs.writeFileSync(path.join(dir, '.claspignore'), '**/**\n!*.gs\n!*.html\n!appsscript.json\n');
  return dir;
}

/**
 * Baris rencana workflow Coach XNK (job plan coach.yml memanggil ini): satu per coach {slug, secret, kenari}.
 * secret = isian "secret" di hub.json (coach yang ganti slug tetap memakai secret lamanya) atau CLASP_<SLUG>.
 */
function planRows(cfg, aksi, one) {
  one = String(one || '').trim();
  if (one && !/^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/.test(one)) throw new Error('Slug tidak valid: ' + one);
  if (aksi !== 'perbarui' && !one) throw new Error('Aksi ' + aksi + ' butuh slug.');
  const list = (cfg && cfg.coaches) || [];
  const bySlug = {};
  for (const c of list) bySlug[c.slug] = c;
  // Slug lama (aliases) = coach yang sekarang memakainya.
  const hit = one ? list.find(c => c.slug === one || (c.aliases || []).includes(one)) : null;
  const slugs = one ? [hit ? hit.slug : one] : list.map(c => c.slug);
  return slugs.map((s, i) => ({ slug: s, secret: secretOf(bySlug[s] || { slug: s }), kenari: !one && i === 0 && slugs.length > 1 }));
}

const execOf = id => `https://script.google.com/macros/s/${id}/exec`;
function versionOf(out) { const m = out.match(/Created version (\d+)/); if (!m) throw new Error('Nomor versi dari clasp tidak terbaca.'); return m[1]; }
function deploymentOf(out) { const m = out.match(/-\s+(AKfyc[\w-]{20,})\s+@\d+/); if (!m) throw new Error('ID deployment dari clasp tidak terbaca.'); return m[1]; }

function readCfg(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { coaches: [] }; }
function writeCfg(file, cfg) { fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n'); }

/** Coach baru: spreadsheet, penghubung, web app, hub.json. */
function baru(file, slug, brand, lib, opts) {
  const cfg = readCfg(file);
  if ((cfg.coaches || []).some(c => c.slug === slug)) throw new Error(`Slug "${slug}" sudah ada di hub.json. Pakai aksi "perbarui" atau "hubungkan".`);
  hubEdit.edit(cfg, 'simpan', { slug, brand, exec: execOf('AKfycbPLACEHOLDER0000000000000000') });   // periksa slug & nama dulu
  const clasp = makeClasp(slug, opts);
  try {
    const made = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-new-'));
    clasp.run(['create', '--type', 'sheets', '--title', `${brand} (XNK)`], made);
    const scriptId = JSON.parse(fs.readFileSync(path.join(made, '.clasp.json'), 'utf8')).scriptId;
    if (!/^[\w-]{20,}$/.test(scriptId || '')) throw new Error('scriptId proyek baru tidak terbaca.');
    const dir = bridgeDir(scriptId, lib, { slug, brand });
    clasp.run(['push', '--force'], dir);
    const ver = versionOf(clasp.run(['version', `XNK Library v${lib.version}`], dir));
    const deploymentId = deploymentOf(clasp.run(['deploy', '-V', ver, '-d', `XNK Library v${lib.version}`], dir));
    const r = hubEdit.edit(cfg, 'simpan', { slug, brand, exec: execOf(deploymentId), scriptId, deploymentId });
    writeCfg(file, r.cfg);
    return { slug, scriptId, deploymentId, exec: execOf(deploymentId), sheet: `https://script.google.com/d/${scriptId}/edit` };
  } finally { clasp.done(); }
}

/** Coach lama: temukan scriptId dari deployment link /exec-nya. */
function hubungkan(file, slug, opts) {
  opts = opts || {};
  const cfg = readCfg(file);
  const c = readHub(cfg).coaches.find(x => x.slug === slug);
  if (!c) throw new Error(`Coach "${slug}" tidak ada di hub.json.`);
  const deploymentId = (c.exec.match(/\/s\/([\w-]+)\/exec$/) || [])[1];
  const given = String(opts.scriptId || '').trim();
  if (given && !/^[\w-]{20,120}$/.test(given)) throw new Error('Script ID tidak valid (salin dari Apps Script → Project Settings → Script ID).');
  const clasp = makeClasp(slug, opts, secretOf(c));
  try {
    // Proyek coach menempel di spreadsheet-nya (salinan XNK Template); `clasp list` hanya menampilkan proyek yang berdiri
    // sendiri, jadi Script ID dari pemilik dipakai bila ada. Tetap diperiksa: proyek itu harus punya deployment link /exec.
    const ids = given ? [given] : [...new Set((clasp.run(['list'], clasp.home).match(/\/d\/([\w-]{20,})\/edit/g) || []).map(s => s.slice(3, -5)))];
    if (!ids.length) throw new Error(`Proyek Apps Script "${slug}" tidak terlihat oleh clasp (proyek yang menempel di spreadsheet memang tidak terdaftar). Jalankan lagi dengan Script ID: spreadsheet → Extensions → Apps Script → Project Settings → Script ID.`);
    for (const scriptId of ids) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-find-'));
      fs.writeFileSync(path.join(dir, '.clasp.json'), JSON.stringify({ scriptId, rootDir: '.' }));
      let out = '';
      try { out = clasp.run(['deployments'], dir); } catch (e) { continue; }
      if (out.includes(deploymentId)) {
        const r = hubEdit.edit(cfg, 'simpan', { slug, brand: c.brand, exec: c.exec, scriptId, deploymentId });
        writeCfg(file, r.cfg);
        return { slug, scriptId, deploymentId };
      }
    }
    throw new Error(given
      ? `Proyek ${given.slice(0, 12)}… tidak bisa dibaca dengan secret ${secretOf(c)} atau tidak memiliki deployment ${deploymentId.slice(0, 12)}… (link /exec "${slug}"). Periksa Script ID dan akun secret itu.`
      : `Tidak ada proyek di akun ini yang memiliki deployment ${deploymentId.slice(0, 12)}… (link /exec "${slug}").`);
  } finally { clasp.done(); }
}

/** Pasang Library terbaru di satu coach, deployment yang sama. */
function perbaruiSatu(c, lib, opts) {
  if (!c.scriptId || !c.deploymentId) throw new Error(`"${c.slug}" belum dihubungkan (scriptId/deploymentId kosong): jalankan aksi "hubungkan" dulu.`);
  const clasp = makeClasp(c.slug, opts, secretOf(c));
  try {
    const dir = bridgeDir(c.scriptId, lib, c);
    clasp.run(['push', '--force'], dir);
    const ver = versionOf(clasp.run(['version', `XNK Library v${lib.version}`], dir));
    clasp.run(['deploy', '-i', c.deploymentId, '-V', ver, '-d', `XNK Library v${lib.version}`], dir);
    return ver;
  } finally { clasp.done(); }
}

async function perbarui(file, target, lib, opts) {
  opts = opts || {};
  const all = readHub(readCfg(file)).coaches;
  const list = target === 'semua' ? all : all.filter(c => c.slug === target || (c.aliases || []).includes(target));
  if (!list.length) throw new Error(target === 'semua' ? 'hub.json belum berisi coach.' : `Coach "${target}" tidak ada di hub.json.`);
  const ask = opts.ask || (exec => askServerInfo(exec, opts.fetch));
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const before = await ask(c.exec);
    if (!opts.force && before && before.lib && before.lib.commit === lib.commit) { out.push({ slug: c.slug, status: 'sudah terbaru' }); continue; }
    try {
      const ver = perbaruiSatu(c, lib, opts);
      const after = await ask(c.exec);
      const okNow = !!(after && after.lib && after.lib.commit === lib.commit);
      out.push({ slug: c.slug, status: okNow ? 'diperbarui' : 'diperbarui, belum terbaca', version: ver });
      // Kenari: coach pertama harus benar-benar menjawab dengan commit terbaru sebelum yang lain disentuh.
      if (target === 'semua' && i === 0 && !okNow && list.length > 1) {
        out.push({ slug: '-', status: `berhenti: server ${c.slug} belum menjawab dengan Library v${lib.version}; coach lain tidak diubah.` });
        break;
      }
    } catch (e) {
      out.push({ slug: c.slug, status: 'gagal', error: e.message });
      if (target === 'semua' && i === 0 && list.length > 1) { out.push({ slug: '-', status: 'berhenti: kenari gagal; coach lain tidak diubah.' }); break; }
    }
  }
  return out;
}

module.exports = { baru, hubungkan, perbarui, latestLib, secretName, secretOf, planRows, credFor, versionOf, deploymentOf };

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--paksa');
  // --kenari (workflow: job pertama di matrix): "diperbarui tetapi server belum menjawab versi baru" = gagal, supaya
  // job coach lain (max-parallel 1, fail-fast) tidak dijalankan.
  const canary = args.includes('--kenari');
  const repoI = args.indexOf('--xnk');
  const repo = repoI >= 0 ? args.splice(repoI, 2)[1] : path.join(__dirname, '..', '..', '..');
  const [aksi, file, slug, ...rest] = args.filter(a => a !== '--paksa' && a !== '--kenari');
  // Langkah "Daftarkan ke XNK HQ" di wizard coach: alamat Pusat dari hub.json bila env tidak mengisinya.
  try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (!process.env.XNK_PUSAT_URL && c.pusatUrl) process.env.XNK_PUSAT_URL = c.pusatUrl; } catch (e) { /* hub.json diperiksa di bawah */ }
  const summary = lines => { if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n'); };
  (async () => {
    if (aksi === 'baru') {
      const r = baru(file, slug, rest.join(' ').trim(), latestLib(repo), {});
      console.log(`Coach ${r.slug} dibuat: ${r.exec}`);
      summary([`## Coach "${r.slug}" dibuat`, '', `- Buka proyek: ${r.sheet} → spreadsheet-nya → menu **XNK → Mulai setup** (izin Google + PIN).`, `- Link /exec: ${r.exec}`, `- Alamat: https://xnk.web.id/${r.slug}/ dan /${r.slug}/klien/ (aktif setelah build hub).`]);
    } else if (aksi === 'hubungkan') {
      const r = hubungkan(file, slug, { scriptId: rest[0] || process.env.SCRIPT_ID || '' });
      console.log(`Coach ${r.slug} terhubung: scriptId ${r.scriptId}`);
      summary([`## Coach "${r.slug}" terhubung`, '', 'scriptId dan deploymentId tersimpan di hub.json; "perbarui" sekarang bisa dipakai.']);
    } else if (aksi === 'perbarui') {
      const lib = latestLib(repo);
      const r = await perbarui(file, slug || 'semua', lib, { force });
      for (const x of r) console.log(`${x.slug}: ${x.status}${x.version ? ' (versi ' + x.version + ')' : ''}${x.error ? '\n  ' + x.error.replace(/\n/g, '\n  ') : ''}`);
      summary([`## Perbarui coach → Library v${lib.version}`, '', '| Coach | Hasil |', '| --- | --- |', ...r.map(x => `| ${x.slug} | ${x.status}${x.error ? ': ' + x.error.split('\n')[0] : ''} |`)]);
      if (r.some(x => x.status === 'gagal' || /^berhenti/.test(x.status) || (canary && /belum terbaca/.test(x.status)))) process.exit(1);
    } else {
      console.error('pakai: coach-ops.js baru|hubungkan|perbarui <hub.json> <slug|semua> [nama usaha] [--paksa] [--xnk <checkout XNK>]');
      process.exit(1);
    }
  })().catch(e => { console.error(e.message); process.exit(1); });
}
