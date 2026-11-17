// Memuat XNK Library hasil build (dist/lib) ke harness tes produksi (apps-script/pt-scheduler/tests/harness.js)
// tanpa mengubah berkas produksi: sumber harness dibaca, folder SRC-nya diarahkan ke hasil build, lalu dikompilasi.
// Layanan bawaan harness (env.props, env.cache, env.triggers) mewakili laci MILIK LIBRARY: harus tetap kosong.
// makeCtx() membuat laci milik satu spreadsheet pemanggil (props, cache, lock, ss, scriptApp sendiri).
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const lib = require('../tools/build-lib');

const PROD_TESTS = path.join(__dirname, '..', '..', 'pt-scheduler', 'tests');
// node --test menjalankan berkas tes di proses paralel: tiap isi build punya folder sendiri (nama = hash),
// ditulis ke folder sementara lalu dipindah sekali jadi, supaya proses lain tidak membaca folder setengah jadi.
let built = null, OUT = null;
function ensureBuilt() {
  if (built) return built;
  built = lib.build();
  OUT = path.join(__dirname, '..', 'dist', 'test-lib-' + built.hash);
  if (!fs.existsSync(OUT)) {
    const tmp = OUT + '.tmp-' + process.pid;
    lib.write(tmp, built.files);
    try { fs.renameSync(tmp, OUT); } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); if (!fs.existsSync(OUT)) throw e; }
  }
  return built;
}

function loadHarness() {
  ensureBuilt();
  const file = path.join(PROD_TESTS, 'harness.js');
  const src = fs.readFileSync(file, 'utf8');
  const line = "const SRC = path.join(__dirname, '..', 'src');";
  if (!src.includes(line)) throw new Error('harness.js: baris SRC berubah; perbarui lib-harness.js');
  const patched = src.replace(line, 'const SRC = ' + JSON.stringify(OUT) + ';');
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(PROD_TESTS);
  m._compile(patched, file);
  return m.exports;
}

const H = loadHarness();

function makeCtx(id, opts) {
  opts = opts || {};
  const store = { props: {}, cache: {}, triggers: [], locks: 0 };
  const ss = new H.Spreadsheet(id);
  ss.getName = () => 'Spreadsheet ' + id;
  const builder = handler => {
    const b = {
      timeBased: () => b, everyDays: () => b, atHour: () => b, onWeekDay: () => b, everyHours: () => b, everyMinutes: () => b, inTimezone: () => b,
      create: () => { const t = { getHandlerFunction: () => handler }; store.triggers.push(t); return t; },
    };
    return b;
  };
  const ctx = {
    props: {
      getProperty: k => (Object.prototype.hasOwnProperty.call(store.props, k) ? store.props[k] : null),
      setProperty(k, v) { store.props[k] = String(v); return this; },
      deleteProperty(k) { delete store.props[k]; return this; },
      getProperties: () => Object.assign({}, store.props),
    },
    cache: {
      get: k => (store.cache[k] ? store.cache[k] : null),
      put: (k, v) => { store.cache[k] = String(v); },
      getAll(keys) { const o = {}; keys.forEach(k => { if (store.cache[k] != null) o[k] = store.cache[k]; }); return o; },
      putAll(map) { Object.keys(map).forEach(k => { store.cache[k] = String(map[k]); }); },
      remove: k => { delete store.cache[k]; },
      removeAll(keys) { keys.forEach(k => delete store.cache[k]); },
    },
    lock: { waitLock() { store.locks++; }, tryLock: () => { store.locks++; return true; }, releaseLock() {}, hasLock: () => true },
    ss,
    scriptApp: {
      WeekDay: { MONDAY: 'MONDAY' },
      getService: () => ({ getUrl: () => opts.execUrl || ('https://script.google.com/macros/s/DEPLOY_' + id + '/exec') }),
      getProjectTriggers: () => store.triggers.slice(),
      newTrigger: handler => builder(handler),
      deleteTrigger: t => { store.triggers = store.triggers.filter(x => x !== t); },
    },
  };
  return { ctx, store, ss };
}

function createLibEnv(opts) {
  const env = H.createEnv(Object.assign({ activeUserEmail: 'owner@example.com' }, opts || {}));
  env.lib = (name, ...args) => {
    const fn = env.context[name];
    if (typeof fn !== 'function') throw new Error('Tidak ada fungsi Library ' + name);
    return fn(...args);
  };
  // Seperti google.script.run lewat kode penghubung: argumen dan jawaban disalin sebagai JSON.
  env.run = (ctx, name, ...args) => {
    const out = env.context.run(ctx, name, JSON.parse(JSON.stringify(args)));
    return out === undefined ? undefined : JSON.parse(JSON.stringify(out));
  };
  return env;
}

module.exports = { H, makeCtx, createLibEnv, ensureBuilt, OUT };
