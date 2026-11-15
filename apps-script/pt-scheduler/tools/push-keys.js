#!/usr/bin/env node
'use strict';
// Fase X: buat sepasang kunci VAPID dan satu rahasia relay.
//   node apps-script/pt-scheduler/tools/push-keys.js            cetak isi file konfigurasi Drive + rahasia untuk GitHub
//   node apps-script/pt-scheduler/tools/push-keys.js --json     hanya JSON file konfigurasi
// Hasilnya hanya dicetak (tidak ditulis ke berkas, tidak dikirim ke mana pun). Jangan di-commit.
const crypto = require('crypto');

function makeKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const b64 = s => Buffer.from(s, 'base64url');
  const pub = Buffer.concat([Buffer.from([4]), b64(jwk.x), b64(jwk.y)]).toString('base64url');   // titik tak terkompresi, 65 byte
  return { publicKey: pub, privateKey: jwk.d, relaySecret: crypto.randomBytes(32).toString('hex') };
}

/** Isi file xnk-pt-config.json di Google Drive pemilik (dibaca server, lalu file dibuang ke Sampah). */
function configJson(k) { return JSON.stringify({ PUSH_VAPID_PUBLIC: k.publicKey, PUSH_VAPID_PRIVATE: k.privateKey, PUSH_RELAY_SECRET: k.relaySecret }, null, 2); }

module.exports = { makeKeys, configJson };

if (require.main === module) {
  const k = makeKeys();
  if (process.argv.includes('--json')) { console.log(configJson(k)); return; }
  console.log(`
Kunci notifikasi dibuat (docs/push/Setup.md).

A. Google Drive (akun pemilik Apps Script): buat file teks bernama  xnk-pt-config.json  berisi:
${configJson(k)}

B. GitHub → repo xnk → Settings → Secrets and variables → Actions → New repository secret:
   PUSH_RELAY_SECRET = ${k.relaySecret}
`);
}
