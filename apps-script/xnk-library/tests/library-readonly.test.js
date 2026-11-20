'use strict';
// T-2251: mode baca saja di Library. Gerbang yang sama dengan doPost juga ada di XNK.run (halaman google.script.run
// lewat penghubung), per spreadsheet: baca saja di satu coach tidak memengaruhi coach lain.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCtx, createLibEnv } = require('./lib-harness');

const SECRET = 's'.repeat(40);

test('XNK.run: baca saja menolak tulis dan menjaga baca; hanya spreadsheet itu; tanpa HUB_SECRET tidak pernah', () => {
  const env = createLibEnv();
  const A = makeCtx('SS_A'), B = makeCtx('SS_B');
  env.lib('initInstance', A.ctx); env.lib('initInstance', B.ctx);
  env.lib('saveSetup', A.ctx, { brand: 'Gym Andi', pin: '111111' });
  env.lib('saveSetup', B.ctx, { brand: 'Studio Bunga', pin: '222222' });
  A.store.props.HUB_SECRET = SECRET; B.store.props.HUB_SECRET = SECRET;
  const tokA = env.run(A.ctx, 'adminLogin', '111111').token, tokB = env.run(B.ctx, 'adminLogin', '222222').token;

  assert.equal(env.run(A.ctx, 'getAdminBootstrap', tokA).readonly, null, 'off by default');
  assert.equal(env.run(A.ctx, 'hubReadonly', SECRET, true, 'Langganan lewat jatuh tempo.').on, true);
  assert.equal(A.store.props.XNK_READONLY, 'true');
  assert.equal(B.store.props.XNK_READONLY, undefined, 'the other spreadsheet is untouched');
  assert.throws(() => env.run(A.ctx, 'addTask', tokA, {}), /Mode baca saja/);
  assert.throws(() => env.run(A.ctx, 'registerNewClient', { name: 'Dewi', phone: '0814 4444 4444', goal: 'x' }), /Mode baca saja/);
  assert.deepEqual(env.run(A.ctx, 'getAdminBootstrap', tokA).readonly, { on: true, note: 'Langganan lewat jatuh tempo.' });
  assert.ok(env.run(A.ctx, 'adminLogin', '111111').token, 'login keeps working');
  // Coach B tetap normal.
  assert.doesNotThrow(() => { try { env.run(B.ctx, 'addTask', tokB, {}); } catch (e) { if (/Mode baca saja/.test(e.message)) throw e; } });
  // Trigger (pengingat) tidak lewat gerbang tulis.
  assert.doesNotThrow(() => { try { env.run(A.ctx, 'runReminderTick'); } catch (e) { if (/Mode baca saja/.test(e.message)) throw e; } });
  // Mati lagi.
  env.run(A.ctx, 'hubReadonly', SECRET, false);
  assert.doesNotThrow(() => { try { env.run(A.ctx, 'addTask', tokA, {}); } catch (e) { if (/Mode baca saja/.test(e.message)) throw e; } });
  // Tanpa HUB_SECRET: tidak pernah baca saja, walau diisi tangan.
  delete A.store.props.HUB_SECRET; A.store.props.XNK_READONLY = 'true';
  assert.equal(env.run(A.ctx, 'getAdminBootstrap', tokA).readonly, null);
  assert.throws(() => env.run(A.ctx, 'hubReadonly', SECRET, true), /Permintaan tidak valid/);
});
