'use strict';
// The browser-side server call layer (rpc in Scripts.html, Phase AAA): which transport it picks and how it
// turns doPost answers into the Errors the app already understands.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'Scripts.html'), 'utf8');
const CODE = /<script>([\s\S]*)<\/script>/.exec(SRC)[1];

function load(extra) {
  const win = Object.assign({}, extra);
  const ctx = vm.createContext(Object.assign({
    window: win, console, setTimeout, clearTimeout, Promise, JSON, Error, Intl,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  }, extra && extra.__globals));
  delete win.__globals;
  vm.runInContext(CODE, ctx);
  return { ctx, win };
}
const answer = (obj, status) => () => Promise.resolve({ status: status || 200, json: () => Promise.resolve(obj) });

test('rpc without any server rejects with the preview message and hasServer is false', async () => {
  const { ctx } = load();
  assert.equal(ctx.hasServer(), false);
  await assert.rejects(ctx.rpc('getCoaches', []), /Mode pratinjau/);
});

test('rpc prefers XNK_TRANSPORT, then google.script.run, then fetch', async () => {
  const calls = [];
  const t = load({ XNK_TRANSPORT: (fn, args) => { calls.push(['t', fn, args]); return Promise.resolve('T'); } });
  assert.equal(await t.ctx.rpc('a', [1]), 'T');
  assert.deepEqual(calls, [['t', 'a', [1]]]);
  assert.equal(t.ctx.hasServer(), true);

  const run = new Proxy({}, { get(_, prop) {
    if (prop === 'withSuccessHandler') return ok => new Proxy({}, { get(_2, p2) {
      if (p2 === 'withFailureHandler') return fail => ({ b: (...a) => (a[0] === 'bad' ? fail(new Error('G-fail')) : ok('G:' + a.join(','))) });
    } });
  } });
  const g = load({ __globals: { google: { script: { run } }, fetch: () => { throw new Error('must not fetch'); } }, XNK_CONFIG: { exec: 'https://x/exec' } });
  assert.equal(g.ctx.hasServer(), true);
  assert.equal(await g.ctx.rpc('b', ['x', 2]), 'G:x,2');
  await assert.rejects(g.ctx.rpc('b', ['bad']), /G-fail/);
});

test('rpc over fetch: POST text/plain {fn,args}, no credentials, data returned', async () => {
  let seen;
  const f = (url, opt) => { seen = { url, opt }; return answer({ ok: true, data: { n: 1 }, v: 1 })(); };
  const { ctx } = load({ __globals: { fetch: f }, XNK_CONFIG: { exec: 'https://script.test/exec' } });
  assert.deepEqual(await ctx.rpc('getCoaches', ['t', 5]), { n: 1 });
  assert.equal(seen.url, 'https://script.test/exec');
  assert.equal(seen.opt.method, 'POST');
  assert.equal(seen.opt.headers['Content-Type'], 'text/plain');
  assert.equal(seen.opt.credentials, 'omit');
  assert.deepEqual(JSON.parse(seen.opt.body), { fn: 'getCoaches', args: ['t', 5] });
});

test('rpc over fetch: auth answers keep the AUTH_REQUIRED marker the app tests for', async () => {
  const { ctx } = load({ __globals: { fetch: answer({ ok: false, error: 'Sesi habis.', auth: true, v: 1 }) }, XNK_CONFIG: { exec: 'https://x/exec' } });
  await assert.rejects(ctx.rpc('getPortalMore', ['t']), e => /AUTH_REQUIRED/.test(e.message) && /Sesi habis\./.test(e.message));
});

test('rpc over fetch: plain server errors keep their own text, without the auth marker', async () => {
  const { ctx } = load({ __globals: { fetch: answer({ ok: false, error: 'PIN salah.', auth: false, v: 1 }) }, XNK_CONFIG: { exec: 'https://x/exec' } });
  await assert.rejects(ctx.rpc('adminLogin', ['1']), e => e.message === 'PIN salah.');
});

test('rpc over fetch: a dead network looks like the errors the offline queue retries', async () => {
  const { ctx } = load({ __globals: { fetch: () => Promise.reject(new TypeError('Failed to fetch')) }, XNK_CONFIG: { exec: 'https://x/exec' } });
  // the same patterns App.html uses (isNetworkError ~3557, queue retry ~6447)
  const net = /network|failed to fetch|HTTP \d|timed? ?out|connection|koneksi/i;
  await assert.rejects(ctx.rpc('logMyFood', []), e => net.test(e.message));
});

test('rpc over fetch: a non-JSON answer (Google error page) is a connection problem, not a crash', async () => {
  const bad = () => Promise.resolve({ status: 502, json: () => Promise.reject(new SyntaxError('Unexpected token <')) });
  const { ctx } = load({ __globals: { fetch: bad }, XNK_CONFIG: { exec: 'https://x/exec' } });
  await assert.rejects(ctx.rpc('getCoaches', []), e => /koneksi/i.test(e.message) && /502/.test(e.message));
});

test('rpc over fetch: a missing or too-old API version asks for a reload', async () => {
  for (const body of [{ ok: true, data: 1 }, { ok: true, data: 1, v: 0 }, null]) {
    const { ctx } = load({ __globals: { fetch: answer(body) }, XNK_CONFIG: { exec: 'https://x/exec' } });
    await assert.rejects(ctx.rpc('getCoaches', []), /Muat ulang halaman/);
  }
});

test('rpc over fetch: a request that takes too long is aborted and reads as a network timeout', async () => {
  const hang = (url, opt) => new Promise((_, rej) => { opt.signal.addEventListener('abort', () => rej(new Error('The operation was aborted'))); });
  const { ctx } = load({ __globals: { fetch: hang, AbortController }, XNK_CONFIG: { exec: 'https://x/exec' }, XNK_RPC_TIMEOUT: 20 });
  await assert.rejects(ctx.rpc('getCoaches', []), e => /NetworkError: timed out/.test(e.message));
});

test('Scripts.html still declares the shared helpers both pages need', () => {
  const { ctx } = load();
  for (const n of ['formatRp', 'sanitizePhone', 'escapeHtml', '_lsGet', '_lsSet', 'rpc', 'hasServer']) assert.equal(typeof ctx[n], 'function', n);
});
