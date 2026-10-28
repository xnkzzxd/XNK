#!/usr/bin/env node
// Salin layar "Catat offline" (offline.js, offline-host.js, offline.css, sw.js) dari XNK ke clone BookingPT-Client.
// Pakai: node apps-script/pt-scheduler/tools/sync-offline.js ../BookingPT-Client
// --check: hanya periksa, keluar 1 bila salinan berbeda.
'use strict';
const fs = require('fs');
const path = require('path');
const FILES = ['offline.js', 'offline-host.js', 'offline.css', 'sw.js'];
const src = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2), check = args.includes('--check');
const dest = args.find(a => !a.startsWith('--'));
if (!dest) { console.error('Pakai: node sync-offline.js <folder BookingPT-Client> [--check]'); process.exit(2); }
let diff = 0;
for (const f of FILES) {
  const a = fs.readFileSync(path.join(src, f));
  const target = path.join(path.resolve(dest), f);
  const same = fs.existsSync(target) && Buffer.compare(a, fs.readFileSync(target)) === 0;
  if (same) continue;
  diff++;
  if (check) console.log('berbeda: ' + f);
  else { fs.writeFileSync(target, a); console.log('disalin: ' + f); }
}
if (check && diff) process.exit(1);
console.log(diff ? (check ? '' : 'selesai') : 'sudah sama');
