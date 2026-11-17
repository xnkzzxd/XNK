// Menjalankan tes produksi (apps-script/pt-scheduler/tests) terhadap kode Library hasil build, untuk membuktikan
// perilakunya sama. Dipakai lewat:  node --require ./tests/compat-hook.js --test ../pt-scheduler/tests/<file>.test.js
// Setiap require ke harness.js produksi diganti harness yang memuat dist/test-lib dan memasang satu konteks
// spreadsheet (layanan palsu milik env itu) sebelum tes memanggil fungsi apa pun.
'use strict';
const path = require('path');
const Module = require('module');
const { H } = require('./lib-harness');

const HARNESS = path.join(__dirname, '..', '..', 'pt-scheduler', 'tests', 'harness.js');
const wrapped = Object.assign({}, H, {
  createEnv(opts) {
    const env = H.createEnv(opts);
    const c = env.context;
    c._XCTX_ = {
      // Getter: tes yang mengganti layanan (mis. CacheService yang gagal) tetap terbaca seperti di produksi.
      get props() { return c.PropertiesService.getScriptProperties(); },
      get cache() { return c.CacheService.getScriptCache(); },
      get lock() { return c.LockService.getScriptLock(); },
      get ss() { return c.SpreadsheetApp.getActiveSpreadsheet(); },
      get scriptApp() { return c.ScriptApp; },
    };
    return env;
  },
});

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && /pt-scheduler[\\/]tests/.test(parent.filename || '')) {
    let resolved;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch (e) { resolved = null; }
    if (resolved === HARNESS) return wrapped;
  }
  return origLoad.apply(this, arguments);
};
