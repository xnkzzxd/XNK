#!/usr/bin/env node
'use strict';
// Fase X: buat sepasang kunci VAPID dan satu rahasia relay. Jalankan SEKALI di komputer Anda:
//   node apps-script/pt-scheduler/tools/push-keys.js
// Hasilnya hanya dicetak (tidak ditulis ke berkas, tidak dikirim ke mana pun). Jangan tempel di chat atau commit.
const crypto = require('crypto');

function makeKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const b64 = s => Buffer.from(s, 'base64url');
  const pub = Buffer.concat([Buffer.from([4]), b64(jwk.x), b64(jwk.y)]).toString('base64url');   // titik tak terkompresi, 65 byte
  return { publicKey: pub, privateKey: jwk.d, relaySecret: crypto.randomBytes(32).toString('hex') };
}

module.exports = { makeKeys };

if (require.main === module) {
  const k = makeKeys();
  console.log(`
Kunci notifikasi dibuat. Pasang dengan cara berikut (lihat docs/push/Setup.md):

A. GitHub → repo xnk → Settings → Secrets and variables → Actions
   Secrets (New repository secret):
     PUSH_VAPID_PRIVATE = ${k.privateKey}
     PUSH_RELAY_SECRET  = ${k.relaySecret}
     PUSH_VAPID_PUBLIC  = ${k.publicKey}
   Variables (tab Variables):
     PUSH_ENABLED       = true

B. Apps Script → Project Settings → Script Properties:
     PUSH_VAPID_PUBLIC  = ${k.publicKey}
     PUSH_RELAY_SECRET  = ${k.relaySecret}

Kunci privat (PUSH_VAPID_PRIVATE) hanya boleh ada di GitHub Secrets.
`);
}
