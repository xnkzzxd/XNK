'use strict';
// Cek browser untuk wizard "XNK → Mulai setup" (bridge-src/Setup.html) dengan google.script.run tiruan:
//   NODE_PATH=$(npm root -g) node apps-script/xnk-library/tools/wizard-check.js
// Dicek: dibuka di langkah yang belum selesai, PIN tidak sama ditolak, nama di alamat divalidasi, alamat portal klien
// tampil, yang disimpan ke spreadsheet = alamat hub + slug, dan data untuk pengelola XNK bisa disalin.
const { chromium } = require('playwright');
const bridge = require('./build-bridge');

let fails = 0;
function check(ok, label) { console.log((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) fails++; }

const stub = () => {
  const calls = [];
  window.__calls = calls;
  const st = Object.assign({ initialized: false, brand: '', pin: false, siteUrl: '', execUrl: '', hubUrl: 'https://xnk.web.id', version: { hash: 'abc123def456' } }, window.__preset || {});
  const api = {
    setupGetState: () => JSON.parse(JSON.stringify(st)),
    setupInit: () => { st.initialized = true; return { init: { copied: false }, triggers: {} }; },
    setupSave: d => {
      if (!String(d.brand || '').trim()) throw new Error('Nama usaha wajib diisi.');
      st.brand = d.brand; if (d.pin) st.pin = true; st.siteUrl = d.siteUrl || '';
      return { brand: st.brand };
    },
    setupCheck: () => ({ ok: true, problems: [], version: st.version, setup: { execUrl: 'https://script.google.com/macros/s/AKfycbTEST/exec' } }),
  };
  function runner(ok, fail) {
    return new Proxy({}, {
      get(_, name) {
        if (name === 'withSuccessHandler') return f => runner(f, fail);
        if (name === 'withFailureHandler') return f => runner(ok, f);
        return arg => setTimeout(() => {
          calls.push([name, arg]);
          try { const r = api[name](arg); ok && ok(r); } catch (e) { fail && fail({ message: e.message }); }
        }, 5);
      },
    });
  }
  window.google = { script: { run: runner(null, null) } };
  window.__st = st;
};

(async () => {
  const html = bridge.build({ libId: 'abc', libVersion: '1' }).files['Setup.html'];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(stub);
    await page.goto('about:blank');   // skrip tiruan harus ada sebelum wizard dimuat
    await page.setContent(html);
    await page.waitForTimeout(300);
    const visible = id => page.isVisible('#' + id);
    check(await visible('p1') && !(await visible('p2')), 'belum diinisialisasi → mulai di langkah 1');
    await page.click('#b1');
    await page.waitForTimeout(300);
    check(await visible('p2'), 'setelah "Siapkan" → langkah 2 (nama usaha dan PIN)');
    await page.fill('#brand', 'Claudia Fit');
    await page.fill('#pin', '123456');
    await page.fill('#pin2', '654321');
    await page.click('#b2');
    check(((await page.textContent('#m2')) || '').includes('tidak sama'), 'PIN dan ulangan PIN beda → ditolak di layar');
    await page.fill('#pin2', '123456');
    await page.click('#b2');
    await page.waitForTimeout(300);
    check(await visible('p3'), 'PIN cocok → langkah 3 (terbitkan aplikasi)');
    await page.evaluate(() => { window.__st.execUrl = 'https://script.google.com/macros/s/AKfycbTEST/exec'; });
    await page.click('#b3');
    await page.waitForTimeout(1200);
    check(await visible('p4'), 'link /exec sudah ada → langkah 4 (alamat untuk klien)');
    check((await page.textContent('#hubPre')).trim() === 'xnk.web.id/', 'awalan alamat = alamat hub');

    await page.fill('#slug', 'Claudia!');
    await page.click('#b4');
    check(((await page.textContent('#m4')) || '').includes('tidak valid'), 'nama di alamat tidak valid → pesan Indonesia, tidak disimpan');
    check(!(await page.evaluate(() => window.__st.siteUrl)), '… dan belum ada yang tersimpan');
    await page.fill('#slug', 'Claudia');
    check((await page.textContent('#slugOut')).includes('https://xnk.web.id/claudia/klien/'), 'alamat portal klien ditampilkan (huruf kecil)');
    await page.click('#b4');
    await page.waitForTimeout(500);
    check((await page.evaluate(() => window.__st.siteUrl)) === 'https://xnk.web.id/claudia', 'yang disimpan = alamat hub + slug (tanpa /klien/)');
    const text = await page.inputValue('#sendText');
    check(await visible('sendBox') && /Nama di alamat: claudia\nNama usaha: Claudia Fit\nLink aplikasi: https:\/\/script\.google\.com\/macros\/s\/AKfycbTEST\/exec/.test(text), 'data untuk pengelola XNK siap disalin');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'tanpa gulir ke samping di layar 320 px');
    check(errors.length === 0, 'tanpa error JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));

    // Dibuka ulang saat semua sudah selesai: langsung di langkah 4 dengan nama yang tersimpan.
    const again = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await again.addInitScript(() => { window.__preset = { initialized: true, brand: 'Claudia Fit', pin: true, execUrl: 'https://script.google.com/macros/s/AKfycbTEST/exec', siteUrl: 'https://xnk.web.id/claudia' }; });
    await again.addInitScript(stub);
    await again.goto('about:blank');
    await again.setContent(html);
    await again.waitForTimeout(400);
    check(await again.isVisible('#p4') && (await again.inputValue('#slug')) === 'claudia', 'dibuka ulang saat semua selesai → langsung langkah 4, nama tersimpan terisi');
  } finally {
    await browser.close();
  }
  console.log(fails ? `\n${fails} cek gagal.` : '\nSemua cek wizard lolos.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
