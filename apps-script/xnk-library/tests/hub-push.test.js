'use strict';
// T-2240: Web Push di hub — kunci VAPID satu untuk hub, build menyisipkan kunci dan membetulkan klik notifikasi,
// hub-push.js membagi kiriman per coach lewat XNK Pusat (web-push dan fetch palsu).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const hub = require('../tools/build-hub');
const hp = require('../tools/hub-push');

const EXEC = n => `https://script.google.com/macros/s/AKfycbHUBTEST${String(n).padStart(12, '0')}abcdef/exec`;
const PUSAT = 'https://script.google.com/macros/s/AKfycbPUSAT00000000000000/exec';
const PASS = 'kata-sandi-acak-yang-panjang-sekali-123';

test('kunci: kata sandi ≥ 32 → kunci P-256 tetap; kunci web-push 43 karakter dipakai apa adanya; pendek ditolak', () => {
  const a = hp.deriveKeys(PASS), b = hp.deriveKeys(PASS);
  assert.deepEqual(a, b, 'deterministic');
  assert.match(a.publicKey, hp.VAPID_RE);
  assert.match(a.privateKey, /^[A-Za-z0-9_-]{43}$/);
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const raw = e.getPrivateKey().toString('base64url');
  assert.equal(hp.deriveKeys(raw).publicKey, e.getPublicKey().toString('base64url'));
  assert.throws(() => hp.deriveKeys('pendek'), /minimal 32/);
  const w = hp.setVapid(JSON.stringify({ coaches: [] }), a.publicKey);
  assert.equal(JSON.parse(w.text).vapidPublic, a.publicKey);
  assert.equal(hp.setVapid(w.text, a.publicKey).changed, false);
  assert.ok(!w.text.includes(a.privateKey), 'private key never written');
});

test('build: vapidPublic diperiksa dan diterbitkan; klik notifikasi membuka /<slug>/ atau /<slug>/klien/', () => {
  const key = hp.deriveKeys(PASS).publicKey;
  assert.throws(() => hub.build({ vapidPublic: 'salah', coaches: [] }), /vapidPublic/);
  const { files } = hub.build({ vapidPublic: key, coaches: [{ slug: 'claudia', brand: 'Claudia', exec: EXEC(1) }] });
  assert.deepEqual(JSON.parse(files['_hub/push.json']), { vapidPublic: key });
  for (const d of ['claudia/', 'claudia/klien/']) {
    const sw = files[d + 'sw-app.js'];
    assert.ok(sw.includes("raw === '/' ? SCOPE : raw"), d + ': url "/" opens this scope, not the hub landing');
    assert.ok(sw.includes("SCOPE + 'klien/'"));
    assert.ok(!sw.includes("'/icon-192.png'"), d + ': no icon from the hub root that does not exist');
  }
  assert.equal(hub.build({ coaches: [] }).files['_hub/push.json'], undefined);
  // Worker lama (kode coach versi sebelum T-2240) juga dibetulkan.
  const old = { 'x/sw-app.js': "var opts = { body: '', icon: '/icon-192.png', badge: '/icon-192.png', data: {} };\n    var u = new URL((e.notification.data && e.notification.data.url) || '/', SCOPE);\n      if (list[i].url.indexOf(SCOPE) === 0 && 'focus' in list[i]) return list[i].focus();" };
  hub.pushPage(old, 'x/', { slug: 'x' });
  assert.ok(old['x/sw-app.js'].includes("raw === '/' ? SCOPE : raw") && old['x/sw-app.js'].includes('/img/icon-192.png') && old['x/sw-app.js'].includes("SCOPE + 'klien/'"));
});

function fakeNet(targets, coaches) {
  const log = [];
  const fetchImpl = async (url, o) => {
    const req = JSON.parse(o.body);
    log.push({ url, fn: req.fn, args: req.args });
    let body;
    if (url === PUSAT) body = req.args[0] === 'p'.repeat(40) ? { ok: true, data: { coaches: targets } } : { ok: false, error: 'Permintaan tidak valid.' };
    else {
      const c = coaches[url];
      if (!c) throw new Error('offline');
      if (req.args[0] !== c.relay) body = { ok: false, error: 'Permintaan tidak valid.' };
      else if (req.fn === 'pushRelayPull') body = { ok: true, data: { messages: c.queue.splice(0), key: '', privateKey: '' } };
      else { c.acks.push(req.args[1]); body = { ok: true, data: { ok: req.args[1].length } }; }
    }
    return { status: 200, text: async () => JSON.stringify(body) };
  };
  return { fetchImpl, log };
}
const msg = (id, ep) => ({ id, endpoint: 'https://fcm.googleapis.com/fcm/send/' + ep, p256dh: 'k', auth: 'a', payload: { title: 'Sesi', body: 'x', url: '/' } });

test('kirim: pesan tiap coach dikirim dengan kunci hub dan dilapor ke coach asalnya; satu coach gagal tidak menghentikan lainnya', async () => {
  const keys = hp.deriveKeys(PASS);
  const coaches = {
    [EXEC(1)]: { relay: 'r'.repeat(64), queue: [msg('a1', 'A1'), msg('a2', 'GONE')], acks: [] },
    [EXEC(2)]: { relay: 's'.repeat(64), queue: [msg('b1', 'B1')], acks: [] },
  };
  const targets = [{ slug: 'claudia', exec: EXEC(1), relay: 'r'.repeat(64) }, { slug: 'mati', exec: EXEC(9), relay: 'x'.repeat(64) }, { slug: 'vinna', exec: EXEC(2), relay: 's'.repeat(64) }];
  const net = fakeNet(targets, coaches);
  const sent = [], vapid = [];
  const webpush = {
    setVapidDetails: (s, pub, priv) => vapid.push({ s, pub, priv }),
    sendNotification: async (sub) => { sent.push(sub.endpoint); if (sub.endpoint.endsWith('GONE')) { const e = new Error('gone'); e.statusCode = 410; throw e; } },
  };
  const r = await hp.send({ hub: { vapidPublic: keys.publicKey, pusatUrl: PUSAT }, pushSecret: 'p'.repeat(40), vapidSecret: PASS, fetchImpl: net.fetchImpl, webpush });
  assert.deepEqual(r.coaches.claudia, { sent: 1, gone: 1, failed: 0 });
  assert.deepEqual(r.coaches.vinna, { sent: 1, gone: 0, failed: 0 });
  assert.match(r.coaches.mati.error, /offline/);
  assert.equal(r.failed, 1);
  assert.deepEqual(coaches[EXEC(1)].acks, [[{ id: 'a1', s: 'ok' }, { id: 'a2', s: 'gone' }]], 'claudia results go back to claudia only');
  assert.deepEqual(coaches[EXEC(2)].acks, [[{ id: 'b1', s: 'ok' }]]);
  assert.ok(vapid.every(v => v.pub === keys.publicKey && v.priv === keys.privateKey && v.s === 'https://xnk.web.id'));
  assert.equal(net.log.filter(x => x.url === PUSAT).length, 1, 'one Pusat call per round');
  assert.ok(net.log.filter(x => x.url !== PUSAT).every(x => !JSON.stringify(x.args).includes(keys.privateKey)), 'private key never sent to a coach');
});

test('kirim: kunci hub.json tidak cocok atau secret Pusat salah = berhenti dengan pesan jelas', async () => {
  const net = fakeNet([], {});
  const webpush = { setVapidDetails() {}, sendNotification: async () => {} };
  await assert.rejects(hp.send({ hub: { vapidPublic: 'B' + 'x'.repeat(86), pusatUrl: PUSAT }, pushSecret: 'p'.repeat(40), vapidSecret: PASS, fetchImpl: net.fetchImpl, webpush }), /tidak cocok/);
  await assert.rejects(hp.send({ hub: { vapidPublic: hp.deriveKeys(PASS).publicKey, pusatUrl: PUSAT }, pushSecret: 'salah', vapidSecret: PASS, fetchImpl: net.fetchImpl, webpush }), /tidak valid/);
});
