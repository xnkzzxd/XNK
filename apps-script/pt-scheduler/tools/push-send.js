#!/usr/bin/env node
'use strict';
// Fase X: pengirim Web Push. Dijalankan GitHub Actions (.github/workflows/push.yml), bukan di Apps Script,
// karena Apps Script tidak bisa menandatangani VAPID (ECDSA P-256) dan tidak bisa mengenkripsi isi push.
// Alur: pushRelayPull (server merencanakan + meminjamkan baris) -> kirim dengan web-push -> pushRelayAck (hasil).
// Rahasia ada di environment: PUSH_RELAY_SECRET, PUSH_VAPID_PUBLIC, PUSH_VAPID_PRIVATE. Isi push dan alamat langganan tidak dicatat.
const MAX_ROUNDS = 5;        // satu putaran = sampai 60 pesan; berhenti bila antrean habis
const POOL = 5;              // pengiriman bersamaan
const TTL_SECONDS = 4 * 3600;

async function call(fetchImpl, exec, fn, args) {
  const res = await fetchImpl(exec, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args }), redirect: 'follow' });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (e) { throw new Error(fn + ': jawaban bukan JSON (HTTP ' + res.status + ')'); }
  if (!body.ok) throw new Error(fn + ': ' + (body.error || 'ditolak'));
  return body.data;
}

/** Murni: kode status web-push -> 'ok' | 'gone' (hapus perangkat) | 'fail' (coba lagi nanti). */
function classify(err) {
  if (!err) return 'ok';
  const code = err.statusCode || err.status;
  return code === 404 || code === 410 ? 'gone' : 'fail';
}

async function pool(items, n, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await worker(items[i]); }
  }));
  return out;
}

/**
 * @param {{exec:string, secret:string, vapid:{subject:string, publicKey:string, privateKey:string}, fetchImpl:Function, webpush:object, log?:Function}} o
 * @returns {{sent:number, gone:number, failed:number, rounds:number}}
 */
async function run(o) {
  const log = o.log || (() => {});
  if (!o.exec || !o.secret || !o.vapid || !o.vapid.publicKey || !o.vapid.privateKey) throw new Error('Pengaturan belum lengkap (exec, rahasia relay, kunci VAPID).');
  o.webpush.setVapidDetails(o.vapid.subject, o.vapid.publicKey, o.vapid.privateKey);
  const total = { sent: 0, gone: 0, failed: 0, rounds: 0 };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const pulled = await call(o.fetchImpl, o.exec, 'pushRelayPull', [o.secret]);
    if (pulled.key && pulled.key !== o.vapid.publicKey) throw new Error('Kunci publik VAPID di server berbeda dengan di GitHub: pasang pasangan kunci yang sama.');
    const msgs = Array.isArray(pulled.messages) ? pulled.messages : [];
    if (!msgs.length) break;
    total.rounds++;
    const results = await pool(msgs, POOL, async (m) => {
      try {
        await o.webpush.sendNotification({ endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } }, JSON.stringify(m.payload), { TTL: TTL_SECONDS, urgency: 'normal' });
        return { id: m.id, s: 'ok' };
      } catch (e) { return { id: m.id, s: classify(e) }; }
    });
    results.forEach(r => { if (r.s === 'ok') total.sent++; else if (r.s === 'gone') total.gone++; else total.failed++; });
    await call(o.fetchImpl, o.exec, 'pushRelayAck', [o.secret, results]);
    log('putaran ' + total.rounds + ': ' + msgs.length + ' pesan');
    if (msgs.length < 60) break;
  }
  return total;
}

module.exports = { run, classify, call };

if (require.main === module) {
  const { defaultExec } = require('./build-static');
  const webpush = require('web-push');
  run({
    exec: process.env.PUSH_EXEC || defaultExec(),
    secret: process.env.PUSH_RELAY_SECRET,
    vapid: { subject: 'https://xnk.my.id', publicKey: process.env.PUSH_VAPID_PUBLIC, privateKey: process.env.PUSH_VAPID_PRIVATE },
    fetchImpl: fetch, webpush, log: console.log,
  }).then(t => console.log('push: terkirim ' + t.sent + ', perangkat hilang ' + t.gone + ', gagal ' + t.failed))
    .catch(e => { console.error('push gagal: ' + e.message); process.exit(1); });
}
