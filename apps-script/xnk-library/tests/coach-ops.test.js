'use strict';
// Gelombang 2 (T-2230…T-2232): workflow "Coach XNK" lewat clasp palsu — urutan perintah, hub.json, kredensial, kenari.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ops = require('../tools/coach-ops');

const SHA_OLD = 'a'.repeat(40), SHA_NEW = 'b'.repeat(40);
const LIB = { version: 7, libId: '1LibScriptIdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', commit: SHA_NEW };
const DEP = n => 'AKfycb' + String(n).repeat(30);
const EXEC = n => `https://script.google.com/macros/s/${DEP(n)}/exec`;
const RC = JSON.stringify({ token: { access_token: 'x', refresh_token: 'y' } });
const env = slugs => ({ SECRETS_JSON: JSON.stringify(Object.fromEntries(slugs.map(s => [ops.secretName(s), RC]))) });

function tmpHub(cfg) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-hubjson-')), 'hub.json');
  fs.writeFileSync(f, JSON.stringify(cfg));
  return f;
}

/** clasp palsu: catat perintah, periksa HOME berisi kredensial, jawab seperti clasp 2.4.2. */
function fakeClasp(answers) {
  const calls = [];
  const runner = (args, o) => {
    const rc = fs.readFileSync(path.join(o.home, '.clasprc.json'), 'utf8');
    assert.equal(rc, RC);
    assert.equal(fs.statSync(path.join(o.home, '.clasprc.json')).mode & 0o777, 0o600);
    const conf = fs.existsSync(path.join(o.cwd, '.clasp.json')) ? JSON.parse(fs.readFileSync(path.join(o.cwd, '.clasp.json'), 'utf8')) : {};
    calls.push({ args, scriptId: conf.scriptId, files: fs.readdirSync(o.cwd), home: o.home });
    const a = answers(args, o, conf);
    return typeof a === 'string' ? { code: 0, out: a } : a;
  };
  return { calls, runner };
}

test('nama secret per coach: CLASP_<SLUG>, huruf besar, "-" jadi "_"; kredensial hilang atau rusak = pesan jelas', () => {
  assert.equal(ops.secretName('claudia'), 'CLASP_CLAUDIA');
  assert.equal(ops.secretName('gym-andi-2'), 'CLASP_GYM_ANDI_2');
  assert.throws(() => ops.credFor('claudia', { SECRETS_JSON: '{}' }), /Secret CLASP_CLAUDIA belum ada/);
  assert.throws(() => ops.credFor('claudia', { SECRETS_JSON: JSON.stringify({ CLASP_CLAUDIA: 'bukan json' }) }), /bukan isi \.clasprc\.json/);
  assert.equal(ops.credFor('claudia', env(['claudia'])), RC);
  assert.equal(ops.versionOf('Created version 12.'), '12');
  assert.equal(ops.deploymentOf(`Created version 3.\n- ${DEP(1)} @3.`), DEP(1));
});

test('baru: spreadsheet → penghubung dengan Library terbaru → versi → web app → hub.json; HOME sementara dihapus', () => {
  const file = tmpHub({ contactUrl: '', coaches: [{ slug: 'claudia', brand: 'Claudia', exec: EXEC(1) }] });
  const f = fakeClasp((args, o) => {
    if (args[0] === 'create') { fs.writeFileSync(path.join(o.cwd, '.clasp.json'), JSON.stringify({ scriptId: '1NewScriptId' + 'Z'.repeat(40) })); return 'Created new Google Sheet'; }
    if (args[0] === 'version') return 'Created version 1.';
    if (args[0] === 'deploy') return `Created version 1.\n- ${DEP(2)} @1.`;
    return 'Pushed 30 files.';
  });
  const r = ops.baru(file, 'gym-andi', 'Gym Andi', LIB, { env: env(['gym-andi']), runner: f.runner });
  assert.deepEqual(f.calls.map(c => c.args[0]), ['create', 'push', 'version', 'deploy']);
  assert.deepEqual(f.calls[0].args.slice(1), ['--type', 'sheets', '--title', 'Gym Andi (XNK)']);
  assert.ok(f.calls[1].files.includes('appsscript.json') && f.calls[1].files.includes('PenghubungApi.gs'));
  assert.equal(r.exec, EXEC(2));
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')).coaches.find(c => c.slug === 'gym-andi');
  assert.deepEqual(saved, { slug: 'gym-andi', brand: 'Gym Andi', exec: EXEC(2), scriptId: '1NewScriptId' + 'Z'.repeat(40), deploymentId: DEP(2) });
  assert.ok(!fs.existsSync(f.calls[0].home), 'kredensial tidak tertinggal di disk');
  assert.throws(() => ops.baru(file, 'gym-andi', 'Lagi', LIB, { env: env(['gym-andi']), runner: f.runner }), /sudah ada di hub\.json/);
  assert.throws(() => ops.baru(file, 'admin', 'X', LIB, { env: env(['admin']), runner: f.runner }), /dipakai sistem/);
});

test('penghubung yang dipasang memakai Library terbaru dan isian awal wizard (slug, nama usaha)', () => {
  const file = tmpHub({ coaches: [] });
  let pushed = null;
  const f = fakeClasp((args, o) => {
    if (args[0] === 'create') { fs.writeFileSync(path.join(o.cwd, '.clasp.json'), JSON.stringify({ scriptId: '1S' + 'Y'.repeat(40) })); return ''; }
    if (args[0] === 'push') { pushed = { man: JSON.parse(fs.readFileSync(path.join(o.cwd, 'appsscript.json'), 'utf8')), api: fs.readFileSync(path.join(o.cwd, 'PenghubungApi.gs'), 'utf8') }; return ''; }
    if (args[0] === 'version') return 'Created version 1.';
    return `- ${DEP(3)} @1.`;
  });
  ops.baru(file, 'bunga', 'Studio Bunga', LIB, { env: env(['bunga']), runner: f.runner });
  assert.deepEqual(pushed.man.dependencies.libraries, [{ userSymbol: 'XNK', libraryId: LIB.libId, version: '7' }]);
  assert.deepEqual(pushed.man.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  assert.match(pushed.api, /var XNK_DEFAULT_SLUG = "bunga";/);
  assert.match(pushed.api, /var XNK_DEFAULT_BRAND = "Studio Bunga";/);
});

test('hubungkan: proyek yang memiliki deployment dari link /exec coach ditemukan dan disimpan', () => {
  const file = tmpHub({ coaches: [{ slug: 'claudia', brand: 'Claudia', exec: EXEC(1) }] });
  const A = '1ScriptA' + 'A'.repeat(40), B = '1ScriptB' + 'B'.repeat(40);
  const f = fakeClasp((args, o, conf) => {
    if (args[0] === 'list') return `Lain - https://script.google.com/d/${A}/edit\nClaudia - https://script.google.com/d/${B}/edit`;
    if (args[0] === 'deployments') return conf.scriptId === B ? `2 Deployments.\n- ${DEP(9)} @HEAD\n- ${DEP(1)} @3 - web` : `1 Deployment.\n- ${DEP(8)} @HEAD`;
    return '';
  });
  const r = ops.hubungkan(file, 'claudia', { env: env(['claudia']), runner: f.runner });
  assert.equal(r.scriptId, B);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).coaches[0], { slug: 'claudia', brand: 'Claudia', exec: EXEC(1), scriptId: B, deploymentId: DEP(1) });
  const none = fakeClasp(args => (args[0] === 'list' ? `X - https://script.google.com/d/${A}/edit` : `- ${DEP(8)} @HEAD`));
  assert.throws(() => ops.hubungkan(file, 'claudia', { env: env(['claudia']), runner: none.runner }), /Tidak ada proyek/);
});

test('perbarui semua: kenari dulu, deployment yang sama; yang sudah terbaru dilewati; kenari gagal = coach lain tidak disentuh', async () => {
  const coaches = [
    { slug: 'claudia', brand: 'Claudia', exec: EXEC(1), scriptId: '1SA' + 'A'.repeat(40), deploymentId: DEP(1) },
    { slug: 'dina', brand: 'Dina', exec: EXEC(2), scriptId: '1SB' + 'B'.repeat(40), deploymentId: DEP(2) },
    { slug: 'eko', brand: 'Eko', exec: EXEC(3), scriptId: '1SC' + 'C'.repeat(40), deploymentId: DEP(3) },
  ];
  const file = tmpHub({ coaches });
  const server = { [EXEC(1)]: SHA_OLD, [EXEC(2)]: SHA_OLD, [EXEC(3)]: SHA_NEW };
  const f = fakeClasp((args, o, conf) => {
    if (args[0] === 'version') return 'Created version 5.';
    if (args[0] === 'deploy') { const c = coaches.find(x => x.scriptId === conf.scriptId); server[c.exec] = SHA_NEW; return `- ${c.deploymentId} @5.`; }
    return '';
  });
  const ask = async exec => ({ api: 1, lib: { hash: 'h', commit: server[exec] } });
  const r = await ops.perbarui(file, 'semua', LIB, { env: env(['claudia', 'dina', 'eko']), runner: f.runner, ask });
  assert.deepEqual(r.map(x => [x.slug, x.status]), [['claudia', 'diperbarui'], ['dina', 'diperbarui'], ['eko', 'sudah terbaru']]);
  const deploys = f.calls.filter(c => c.args[0] === 'deploy').map(c => c.args);
  assert.deepEqual(deploys[0], ['deploy', '-i', DEP(1), '-V', '5', '-d', 'XNK Library v7'], 'deployment yang sama: link /exec tetap');

  // Kenari tidak pernah menjawab commit terbaru → berhenti.
  const stuck = { [EXEC(1)]: SHA_OLD, [EXEC(2)]: SHA_OLD, [EXEC(3)]: SHA_OLD };
  const g = fakeClasp(args => (args[0] === 'version' ? 'Created version 6.' : args[0] === 'deploy' ? `- ${DEP(1)} @6.` : ''));
  const r2 = await ops.perbarui(file, 'semua', LIB, { env: env(['claudia', 'dina', 'eko']), runner: g.runner, ask: async e => ({ lib: { commit: stuck[e] } }) });
  assert.equal(r2[0].status, 'diperbarui, belum terbaca');
  assert.match(r2[1].status, /^berhenti/);
  assert.ok(g.calls.every(c => c.scriptId === coaches[0].scriptId), 'hanya kenari yang disentuh');

  // Kenari gagal (API mati) → pesan bantuan dan berhenti.
  const h = fakeClasp(() => ({ code: 1, out: 'User has not enabled the Apps Script API.' }));
  const r3 = await ops.perbarui(file, 'semua', LIB, { env: env(['claudia', 'dina', 'eko']), runner: h.runner, ask: async () => null });
  assert.equal(r3[0].status, 'gagal');
  assert.match(r3[0].error, /script\.google\.com\/home\/usersettings/);
  assert.match(r3[1].status, /kenari gagal/);
});

test('perbarui satu coach yang belum dihubungkan: diminta "hubungkan" dulu', async () => {
  const file = tmpHub({ coaches: [{ slug: 'claudia', brand: 'Claudia', exec: EXEC(1) }] });
  const r = await ops.perbarui(file, 'claudia', LIB, { env: env(['claudia']), runner: () => ({ code: 0, out: '' }), ask: async () => null });
  assert.equal(r[0].status, 'gagal');
  assert.match(r[0].error, /hubungkan/);
});

test('latestLib: tag lib-v<N> tertinggi; pesan tag = scriptId Library; harus menunjuk commit', () => {
  const git = args => {
    if (args[0] === 'ls-remote') return `x\trefs/tags/lib-v3\ny\trefs/tags/lib-v12\nz\trefs/tags/lib-v9\nw\trefs/tags/hub-stable\n`;
    if (args[0] === 'fetch') { assert.ok(args.includes('refs/tags/lib-v12:refs/tags/lib-v12')); return ''; }
    return `${LIB.libId}|${SHA_NEW}\n`;
  };
  assert.deepEqual(ops.latestLib('/repo', { git }), { version: 12, libId: LIB.libId, commit: SHA_NEW });
  assert.throws(() => ops.latestLib('/repo', { git: () => '' }), /Belum ada tag lib-v/);
  assert.throws(() => ops.latestLib('/repo', { git: a => (a[0] === 'ls-remote' ? 'x\trefs/tags/lib-v1' : a[0] === 'fetch' ? '' : `${LIB.libId}|`) }), /beranotasi/);
});

test('hub.json: scriptId/deploymentId diperiksa; link /exec baru membuang ID lama', () => {
  const hub = require('../tools/build-hub');
  const edit = require('../tools/hub-edit').edit;
  assert.throws(() => hub.readHub({ coaches: [{ slug: 'claudia', brand: 'C', exec: EXEC(1), deploymentId: DEP(2) }] }), /tidak cocok/);
  assert.throws(() => hub.readHub({ coaches: [{ slug: 'claudia', brand: 'C', exec: EXEC(1), scriptId: 'a b' }] }), /scriptId tidak valid/);
  const base = { coaches: [{ slug: 'claudia', brand: 'C', exec: EXEC(1), scriptId: '1S' + 'Q'.repeat(30), deploymentId: DEP(1) }] };
  assert.equal(edit(base, 'simpan', { slug: 'claudia', brand: 'Baru', exec: EXEC(1) }).cfg.coaches[0].scriptId, '1S' + 'Q'.repeat(30), 'nama berubah, ID tetap');
  assert.ok(!('scriptId' in edit(base, 'simpan', { slug: 'claudia', brand: 'C', exec: EXEC(4) }).cfg.coaches[0]), 'link lain = ID lama dibuang');
});
