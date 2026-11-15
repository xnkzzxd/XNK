'use strict';
// Fase X: pengirim Web Push (tools/push-send.js) dan pembuat kunci (tools/push-keys.js), tanpa jaringan.
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, classify } = require('../tools/push-send');
const { makeKeys } = require('../tools/push-keys');

const keys = makeKeys();
const msg = (id, extra) => Object.assign({ id, endpoint: 'https://fcm.googleapis.com/fcm/send/' + id, p256dh: 'p', auth: 'a', payload: { title: 'T', body: 'B', url: '/', tag: 'pr', kind: 'pr' } }, extra);

function fakes(pulls) {
  const calls = [], sent = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const data = body.fn === 'pushRelayPull' ? pulls.shift() || { messages: [], key: keys.publicKey } : { ok: 1, removed: 0 };
    return { status: 200, text: async () => JSON.stringify({ ok: true, data }) };
  };
  const webpush = {
    setVapidDetails() { webpush.vapid = [].slice.call(arguments); },
    async sendNotification(sub, payload, opts) {
      sent.push({ sub, payload, opts });
      if (sub.endpoint.endsWith('gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; }
      if (sub.endpoint.endsWith('boom')) { const e = new Error('boom'); e.statusCode = 503; throw e; }
    },
  };
  return { calls, sent, fetchImpl, webpush };
}
const opts = f => ({ exec: 'https://script.google.com/macros/s/X/exec', secret: 'S'.repeat(32), vapid: { subject: 'https://xnk.my.id' }, fetchImpl: f.fetchImpl, webpush: f.webpush });

test('generated keys have the lengths web-push expects, and the relay secret is long enough for the server', () => {
  assert.equal(keys.publicKey.length, 87);
  assert.equal(keys.privateKey.length, 43);
  assert.ok(keys.relaySecret.length >= 24);
  assert.notEqual(makeKeys().privateKey, keys.privateKey);
});

test('classify: 404 and 410 mean the device is gone, anything else is retried', () => {
  assert.equal(classify(null), 'ok');
  assert.equal(classify({ statusCode: 410 }), 'gone');
  assert.equal(classify({ statusCode: 404 }), 'gone');
  assert.equal(classify({ statusCode: 429 }), 'fail');
  assert.equal(classify(new Error('network')), 'fail');
});

test('pull, send each message with the payload as JSON, then report every result', async () => {
  const f = fakes([{ messages: [msg('1'), msg('gone', { id: '2', endpoint: 'https://x/gone' }), msg('3', { endpoint: 'https://x/boom' })], key: keys.publicKey, privateKey: keys.privateKey }]);
  const t = await run(opts(f));
  assert.deepEqual(t, { sent: 1, gone: 1, failed: 1, rounds: 1 });
  assert.equal(f.calls[0].fn, 'pushRelayPull'); assert.deepEqual(f.calls[0].args, ['S'.repeat(32)]);
  const ack = f.calls.find(c => c.fn === 'pushRelayAck');
  assert.deepEqual(ack.args[1], [{ id: '1', s: 'ok' }, { id: '2', s: 'gone' }, { id: '3', s: 'fail' }]);
  assert.equal(JSON.parse(f.sent[0].payload).title, 'T');
  assert.equal(f.sent[0].opts.TTL, 4 * 3600);
  assert.deepEqual(f.sent[0].sub, { endpoint: 'https://fcm.googleapis.com/fcm/send/1', keys: { p256dh: 'p', auth: 'a' } });
  assert.deepEqual(f.webpush.vapid, ['https://xnk.my.id', keys.publicKey, keys.privateKey], 'the keys come from the server answer');
});

test('an empty queue sends nothing and acknowledges nothing', async () => {
  const f = fakes([]);
  const t = await run(opts(f));
  assert.deepEqual(t, { sent: 0, gone: 0, failed: 0, rounds: 0 });
  assert.equal(f.calls.length, 1);
});

test('a full batch is followed by another pull', async () => {
  const full = Array.from({ length: 60 }, (_, i) => msg('m' + i));
  const f = fakes([{ messages: full, key: keys.publicKey, privateKey: keys.privateKey }, { messages: [msg('last')], key: keys.publicKey, privateKey: keys.privateKey }]);
  const t = await run(opts(f));
  assert.equal(t.sent, 61); assert.equal(t.rounds, 2);
});

test('environment keys override the server keys; no keys anywhere means no sending', async () => {
  const other = makeKeys();
  let f = fakes([{ messages: [msg('1')], key: keys.publicKey, privateKey: keys.privateKey }]);
  await run(Object.assign(opts(f), { vapid: { subject: 's', publicKey: other.publicKey, privateKey: other.privateKey } }));
  assert.equal(f.webpush.vapid[1], other.publicKey);
  f = fakes([{ messages: [msg('1')], key: '', privateKey: '' }]);
  await assert.rejects(run(opts(f)), /Kunci VAPID belum dipasang/);
  assert.equal(f.sent.length, 0);
});

test('a rejected secret, a bad answer or a missing setting stop the run', async () => {
  const f = fakes([]);
  const bad = { fetchImpl: async () => ({ status: 200, text: async () => JSON.stringify({ ok: false, error: 'Permintaan tidak valid.' }) }), webpush: { setVapidDetails() {} } };
  await assert.rejects(run(Object.assign(opts(f), bad)), /pushRelayPull: Permintaan tidak valid/);
  await assert.rejects(run(Object.assign(opts(f), { secret: '' })), /belum lengkap/);
  await assert.rejects(run(Object.assign(opts(f), { fetchImpl: async () => ({ status: 502, text: async () => '<html>' }) })), /bukan JSON/);
});
