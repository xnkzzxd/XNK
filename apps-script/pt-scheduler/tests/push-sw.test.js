'use strict';
// Fase X: pengendali push dan klik di service worker halaman statis (tools/sw-app.template.js), dijalankan di sandbox.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tools', 'sw-app.template.js'), 'utf8').replace("'__HASH__'", '"t"').replace('__ASSETS__', '[]');

function load(scope) {
  const handlers = {}, shown = [], opened = [], focused = [];
  let clientList = [];
  const self = {
    registration: { scope, showNotification: (title, opts) => { shown.push({ title, opts }); return Promise.resolve(); } },
    location: { origin: new URL(scope).origin },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(clientList),
      openWindow: url => { opened.push(url); return Promise.resolve(); },
    },
  };
  vm.runInNewContext(SRC, { self, URL, caches: {}, fetch: () => Promise.reject(new Error('no network')) });
  return { handlers, shown, opened, focused, setClients: l => { clientList = l; } };
}
const pushEvent = data => { const waits = []; return { data: data === undefined ? null : { json: () => JSON.parse(data), text: () => data }, waitUntil: p => waits.push(p), waits }; };
const clickEvent = url => { const waits = []; const e = { notification: { closed: false, close() { this.closed = true; }, data: url === undefined ? null : { url } }, waitUntil: p => waits.push(p), waits }; return e; };

test('a push message becomes a notification with its title, body and tag', async () => {
  const w = load('https://xnk.my.id/');
  const e = pushEvent(JSON.stringify({ title: 'Sesi besok', body: 'Kak Ani, besok jam 07:00.', tag: 'sesi-besok', url: '/' }));
  w.handlers.push(e);
  await Promise.all(e.waits);
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, 'Sesi besok');
  assert.equal(w.shown[0].opts.body, 'Kak Ani, besok jam 07:00.');
  assert.equal(w.shown[0].opts.tag, 'sesi-besok');
  assert.equal(w.shown[0].opts.data.url, '/');
  assert.equal(w.shown[0].opts.icon, '/icon-192.png');
});

test('long text is cut, plain text and an empty push still show something', async () => {
  const w = load('https://xnk.my.id/');
  let e = pushEvent(JSON.stringify({ title: 'x'.repeat(300), body: 'y'.repeat(900), tag: 't'.repeat(100) }));
  w.handlers.push(e); await Promise.all(e.waits);
  assert.equal(w.shown[0].title.length, 80); assert.equal(w.shown[0].opts.body.length, 200); assert.equal(w.shown[0].opts.tag.length, 40);
  e = pushEvent('bukan json'); w.handlers.push(e); await Promise.all(e.waits);
  assert.deepEqual([w.shown[1].title, w.shown[1].opts.body], ['XNK', 'bukan json']);
  e = pushEvent(); w.handlers.push(e); await Promise.all(e.waits);
  assert.equal(w.shown[2].title, 'XNK');
});

test('a click focuses the open app window, or opens one; only addresses on this site are followed', async () => {
  const w = load('https://xnk.my.id/');
  let e = clickEvent('/');
  w.handlers.notificationclick(e); await Promise.all(e.waits);
  assert.equal(e.notification.closed, true);
  assert.deepEqual(w.opened, ['https://xnk.my.id/']);
  e = clickEvent('https://evil.example/phish');
  w.handlers.notificationclick(e); await Promise.all(e.waits);
  assert.equal(w.opened[1], 'https://xnk.my.id/', 'another site is replaced by the app');
  e = clickEvent();
  w.handlers.notificationclick(e); await Promise.all(e.waits);
  assert.equal(w.opened[2], 'https://xnk.my.id/');
  let focused = 0;
  w.setClients([{ url: 'https://other.example/', focus: () => { focused += 100; } }, { url: 'https://xnk.my.id/?view=public', focus: () => { focused++; return Promise.resolve(); } }]);
  e = clickEvent('/');
  w.handlers.notificationclick(e); await Promise.all(e.waits);
  assert.equal(focused, 1); assert.equal(w.opened.length, 3, 'no new window while the app is open');
});

test('the worker in a sub-folder opens that folder', async () => {
  const w = load('https://xnk.my.id/next/');
  const e = clickEvent('/');
  w.handlers.notificationclick(e); await Promise.all(e.waits);
  assert.equal(w.opened[0], 'https://xnk.my.id/next/', 'url "/" = this worker\'s scope (T-2240: on the hub, /<slug>/ not the hub landing)');
});

test('hub (T-2240): the panel worker opens /<slug>/ and does not take over a client portal window', async () => {
  const w = load('https://xnk.web.id/claudia/');
  let focused = 0;
  w.setClients([{ url: 'https://xnk.web.id/claudia/klien/', focus: () => { focused++; } }]);
  const e = clickEvent('/');
  w.handlers.notificationclick(e); await Promise.all(e.waits);
  assert.equal(focused, 0);
  assert.equal(w.opened[0], 'https://xnk.web.id/claudia/');
  const k = load('https://xnk.web.id/claudia/klien/');
  const e2 = clickEvent('/');
  k.handlers.notificationclick(e2); await Promise.all(e2.waits);
  assert.equal(k.opened[0], 'https://xnk.web.id/claudia/klien/');
});
