#!/usr/bin/env node
'use strict';
// T-2240: Web Push untuk semua coach di hub xnk.web.id. Dijalankan workflow "Push XNK" di repo hub (tiap 5 menit).
//
//   node hub-push.js kirim <hub.json>   kirim antrean push semua coach yang menyala
//   node hub-push.js kunci <hub.json>   tulis kunci publik VAPID (dari secret HUB_VAPID_PRIVATE) ke hub.json
//
// Satu pasang kunci VAPID untuk seluruh hub (satu origin). Secret repo hub:
//   HUB_VAPID_PRIVATE  kunci privat: kunci web-push (base64url 43 karakter) ATAU kata sandi acak ≥ 32 karakter yang
//                      diturunkan jadi kunci P-256 (SHA-256, deterministik). Tidak pernah dicetak.
//   PUSAT_PUSH_SECRET  sama dengan Script Property PUSAT_PUSH_SECRET di XNK HQ.
// Alur kirim: pusatPushTargets(PUSAT_PUSH_SECRET) di XNK HQ → [{slug, exec, relay}] → untuk tiap coach:
// pushRelayPull(relay) → web-push → pushRelayAck(relay, hasil) langsung ke /exec coach (tools/push-send.js). Isi push dan
// alamat langganan tidak dicatat; log hanya slug dan angka.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pushSend = require('../../pt-scheduler/tools/push-send');

const B64URL = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const VAPID_RE = /^B[A-Za-z0-9_-]{86}$/;

/** Murni: secret → {privateKey, publicKey} base64url (format web-push). */
function deriveKeys(secret) {
  secret = String(secret || '').trim();
  let priv;
  if (/^[A-Za-z0-9_-]{43}$/.test(secret)) priv = Buffer.from(secret, 'base64');
  else if (secret.length >= 32) priv = crypto.createHash('sha256').update('xnk-vapid|' + secret).digest();
  else throw new Error('HUB_VAPID_PRIVATE terlalu pendek: pakai kata sandi acak minimal 32 karakter.');
  for (let i = 0; i < 8; i++) {
    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(priv);
      return { privateKey: B64URL(priv), publicKey: B64URL(ecdh.getPublicKey(null, 'uncompressed')) };
    } catch (e) {
      priv = crypto.createHash('sha256').update(priv).digest();   // di luar rentang kurva (hampir mustahil): turunkan lagi
    }
  }
  throw new Error('HUB_VAPID_PRIVATE tidak bisa dipakai sebagai kunci.');
}

/** Murni: tulis vapidPublic ke isi hub.json; kembalikan {text, changed}. */
function setVapid(text, publicKey) {
  if (!VAPID_RE.test(publicKey)) throw new Error('Kunci publik tidak valid.');
  const cfg = JSON.parse(text);
  if (cfg.vapidPublic === publicKey) return { text, changed: false };
  cfg.vapidPublic = publicKey;
  return { text: JSON.stringify(cfg, null, 2) + '\n', changed: true };
}

/**
 * Kirim antrean semua coach. Gagal di satu coach tidak menghentikan yang lain.
 * @param {{hub: object, pushSecret: string, vapidSecret: string, fetchImpl: Function, webpush: object, log?: Function}} o
 * @return {Promise<{coaches: Object<string, {sent, gone, failed}|{error}>, failed: number}>}
 */
async function send(o) {
  const log = o.log || (() => {});
  const keys = deriveKeys(o.vapidSecret);
  const pub = String(o.hub.vapidPublic || '');
  if (pub !== keys.publicKey) throw new Error('Kunci publik di hub.json tidak cocok dengan HUB_VAPID_PRIVATE. Jalankan workflow Push XNK aksi "kunci".');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(String(o.hub.pusatUrl || ''))) throw new Error('hub.json tanpa "pusatUrl" (link /exec XNK HQ).');
  const targets = await pushSend.call(o.fetchImpl, o.hub.pusatUrl, 'pusatPushTargets', [o.pushSecret]);
  const list = Array.isArray(targets && targets.coaches) ? targets.coaches : [];
  const out = { coaches: {}, failed: 0 };
  for (const c of list) {
    if (!c || !/^[a-z0-9-]{3,30}$/.test(String(c.slug)) || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(String(c.exec))) continue;
    try {
      const t = await pushSend.run({ exec: c.exec, secret: c.relay, fetchImpl: o.fetchImpl, webpush: o.webpush,
        vapid: { subject: 'https://xnk.web.id', publicKey: keys.publicKey, privateKey: keys.privateKey } });
      out.coaches[c.slug] = { sent: t.sent, gone: t.gone, failed: t.failed };
      log(c.slug + ': terkirim ' + t.sent + ', perangkat hilang ' + t.gone + ', gagal ' + t.failed);
    } catch (e) {
      out.failed++;
      out.coaches[c.slug] = { error: String(e && e.message ? e.message : e).slice(0, 160) };
      log(c.slug + ': gagal (' + out.coaches[c.slug].error + ')');
    }
  }
  if (!list.length) log('Belum ada coach dengan push menyala.');
  return out;
}

module.exports = { deriveKeys, setVapid, send, VAPID_RE };

if (require.main === module) {
  const [aksi, hubPath] = process.argv.slice(2);
  const vapidSecret = process.env.HUB_VAPID_PRIVATE || '';
  if (!hubPath || !['kirim', 'kunci'].includes(aksi)) { console.error('Pakai: hub-push.js kirim|kunci <hub.json>'); process.exit(2); }
  if (aksi === 'kunci') {
    if (!vapidSecret) {
      console.log('::error title=HUB_VAPID_PRIVATE belum ada::Buat kata sandi acak minimal 32 karakter, simpan di repo hub: Settings → Secrets and variables → Actions → New repository secret, nama HUB_VAPID_PRIVATE. Lalu jalankan aksi "kunci" lagi.');
      process.exit(1);
    }
    try {
      const keys = deriveKeys(vapidSecret);
      const r = setVapid(fs.readFileSync(hubPath, 'utf8'), keys.publicKey);
      if (r.changed) fs.writeFileSync(hubPath, r.text);
      console.log('Kunci publik VAPID hub: ' + keys.publicKey);
      console.log(r.changed ? 'Ditulis ke hub.json (vapidPublic).' : 'hub.json sudah memakai kunci ini.');
    } catch (e) { console.log('::error::' + e.message); process.exit(1); }
    process.exit(0);
  }
  if (!vapidSecret || !process.env.PUSAT_PUSH_SECRET) { console.log('push: secret HUB_VAPID_PRIVATE atau PUSAT_PUSH_SECRET belum dipasang, dilewati.'); process.exit(0); }
  const hub = JSON.parse(fs.readFileSync(path.resolve(hubPath), 'utf8'));
  if (!hub.vapidPublic) { console.log('push: hub.json belum punya vapidPublic (jalankan aksi "kunci"), dilewati.'); process.exit(0); }
  send({ hub, pushSecret: process.env.PUSAT_PUSH_SECRET, vapidSecret, fetchImpl: fetch, webpush: require('web-push'), log: console.log })
    .then(r => { if (r.failed && r.failed === Object.keys(r.coaches).length) process.exit(1); })
    .catch(e => { console.error('push gagal: ' + e.message); process.exit(1); });
}
