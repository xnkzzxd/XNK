'use strict';
// Copies the offline app and the two static libraries into www/, keeping the repo layout
// (app/, foods/, exercises/) so the app's relative ../foods paths still work inside the APK.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const www = path.join(__dirname, '..', 'www');
fs.rmSync(www, { recursive: true, force: true });
const copy = rel => { const to = path.join(www, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(root, rel), to); };
fs.readdirSync(path.join(root, 'app')).filter(f => f !== 'README.md').forEach(f => copy('app/' + f));
['foods/foods.min.json', 'exercises/exercises.min.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'].forEach(copy);
fs.writeFileSync(path.join(www, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=app/index.html">');
console.log('www ready:', fs.readdirSync(www).join(', '));
