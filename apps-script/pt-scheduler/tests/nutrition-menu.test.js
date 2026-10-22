'use strict';
// Phase P / T-1011: one-day menu, swaps and shopping list.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const env = seededEnv();
const j = x => JSON.parse(JSON.stringify(x));
const call = (n, ...a) => j(env.callRaw(n, ...a));
const targetOf = kal => ({ kal, protein: Math.round(kal * 0.075) });   // ~30 % of kcal from protein
const vm = require('vm');
const inCtx = name => j(vm.runInContext(name, env.context));
const NUT_FOODS = inCtx('NUT_FOODS'), NUT_SLOTS = inCtx('NUT_SLOTS');

const dayOk = (menu, t) => {
  assert.ok(Math.abs(menu.totals.kal - t.kal) <= t.kal * 0.05, 'kcal ' + menu.totals.kal + ' vs ' + t.kal);
  assert.ok(menu.totals.p >= t.protein * 0.95, 'protein ' + menu.totals.p + ' vs ' + t.protein);
};

test('menus stay within +-5 % kcal and >= 95 % protein across seeds, budgets and targets', () => {
  for (const kal of [1500, 2000, 2800]) {
    for (const anggaran of ['hemat', 'standar', 'bebas']) {
      for (let s = 0; s < 30; s++) {
        const t = targetOf(kal), menu = call('_nutMenu_', t, { anggaran, seed: 'PT-A|2026-10-' + s });
        assert.equal(menu.meals.length, 3);
        dayOk(menu, t);
      }
    }
  }
});

test('allergen, lactose and budget filters never leak', () => {
  const foods = NUT_FOODS;
  for (const [ban, test_] of [[['telur'], f => f.a.includes('telur')], [['seafood'], f => f.a.includes('seafood')], [['kacang'], f => f.a.includes('kacang')],
    [['susu', 'laktosa'], f => f.a.includes('susu') || f.lak]]) {
    for (let s = 0; s < 40; s++) {
      const menu = call('_nutMenu_', targetOf(2000), { pantangan: ban, anggaran: 'bebas', seed: 'x' + s });
      menu.meals.forEach(m => m.items.forEach(i => assert.ok(!test_(foods[i.id]), ban + ' leaked: ' + i.n)));
    }
  }
  for (let s = 0; s < 40; s++) {
    const menu = call('_nutMenu_', targetOf(2000), { anggaran: 'hemat', seed: 'h' + s });
    menu.meals.forEach(m => m.items.forEach(i => assert.ok(foods[i.id].h <= 1, 'hemat picked ' + i.n)));
  }
});

test('at most one fried protein per day and everything is sane', () => {
  for (let s = 0; s < 60; s++) {
    const menu = call('_nutMenu_', targetOf(2200), { anggaran: 'bebas', seed: 'f' + s });
    const fried = menu.meals.flatMap(m => m.items).filter(i => i.slot === 'protein' && /goreng/i.test(i.n));
    assert.ok(fried.length <= 1, fried.map(i => i.n).join());
    menu.meals.flatMap(m => m.items).forEach(i => { assert.ok(i.gram > 0 && i.kal >= 0 && i.porsi > 0, i.id); });
  }
});

test('menus are deterministic per seed and vary across days', () => {
  const t = targetOf(2000);
  const a = call('_nutMenu_', t, { seed: 'PT-A|2026-10-22' }), b = call('_nutMenu_', t, { seed: 'PT-A|2026-10-22' });
  assert.deepEqual(a, b);
  const names = new Set();
  for (let d = 1; d <= 14; d++) names.add(call('_nutMenu_', t, { seed: 'PT-A|2026-10-' + d }).meals.map(m => m.items.map(i => i.id).join()).join('|'));
  assert.ok(names.size >= 10, 'only ' + names.size + ' different days');
});

test('Ramadan: buka, sahur, camilan malam; training hour moves the biggest meal', () => {
  const t = targetOf(2000);
  const r = call('_nutMenu_', t, { ramadan: true, seed: 'r' });
  assert.deepEqual(r.meals.map(m => m.key), ['buka', 'sahur', 'camilan']);
  dayOk(r, t);
  const size = (menu, k) => menu.meals.find(m => m.key === k).totals.kal;
  const morning = call('_nutMenu_', t, { seed: 's', sessionHour: 7 }), noon = call('_nutMenu_', t, { seed: 's', sessionHour: 12 }), evening = call('_nutMenu_', t, { seed: 's', sessionHour: 18 });
  assert.ok(size(morning, 'sarapan') > size(noon, 'sarapan'));
  assert.ok(size(noon, 'siang') > size(morning, 'siang'));
  assert.ok(size(evening, 'malam') > size(noon, 'malam'));
  [morning, noon, evening].forEach(m => dayOk(m, t));
});

test('swap gives three distinct, valid replacements; "acak lagi" rotates them', () => {
  const t = targetOf(2000), menu = call('_nutMenu_', t, { anggaran: 'bebas', seed: 'sw' });
  const meal = menu.meals[1];
  for (const slot of ['karbo', 'protein', 'sayur']) {
    const item = meal.items.find(i => i.slot === slot);
    const alts = call('_nutSwap_', item, meal.key, { anggaran: 'bebas' }, 0);
    assert.equal(alts.length, 3);
    assert.equal(new Set(alts.map(a => a.id)).size, 3);
    alts.forEach(a => { assert.notEqual(a.id, item.id); assert.equal(a.slot, slot); });
    const more = call('_nutSwap_', item, meal.key, { anggaran: 'bebas' }, 1);
    assert.notDeepEqual(more.map(a => a.id), alts.map(a => a.id));
    if (slot === 'protein') alts.forEach(a => assert.ok(Math.abs(a.p - item.p) <= item.p * 0.12 + 1, 'protein drift ' + a.p + ' vs ' + item.p));
  }
  const egg = call('_nutSwap_', { id: 'HR002', slot: 'protein', gram: 110 }, 'sarapan', { pantangan: ['telur'] }, 0);
  egg.forEach(a => assert.ok(!NUT_FOODS[a.id].a.includes('telur')));
});

test('shopping list adds up the week and groups by kind', () => {
  const t = targetOf(2000), menus = [1, 2, 3, 4, 5, 6, 7].map(d => call('_nutMenu_', t, { seed: 'wk' + d }));
  const list = call('_nutShopping_', menus);
  const grams = {};
  menus.forEach(m => m.meals.forEach(x => x.items.forEach(i => { grams[i.id] = (grams[i.id] || 0) + i.gram; })));
  let total = 0;
  list.forEach(g => g.items.forEach(i => { total += i.gram; assert.ok(i.gram >= grams[i.id] && i.gram < grams[i.id] + 5, i.id); assert.ok(i.jumlah >= 1 && i.satuan); }));
  assert.ok(total >= Object.values(grams).reduce((a, b) => a + b, 0));
  assert.deepEqual(list.map(g => g.kelompok), list.map(g => g.kelompok).slice().sort());
  assert.equal(list.flatMap(g => g.items).length, Object.keys(grams).length);
});

test('the embedded server data matches foods.min.json', () => {
  const fs = require('fs'), path = require('path');
  const web = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../foods/foods.min.json'), 'utf8')).items;
  const srv = NUT_FOODS;
  assert.equal(Object.keys(srv).length, web.length);
  web.forEach(i => { assert.ok(srv[i.id], i.id); assert.equal(srv[i.id].kal, i.kal); assert.equal(srv[i.id].n, i.n); });
  const slots = NUT_SLOTS;
  [].concat(slots.karbo.sarapan, slots.karbo.utama, slots.protein.sarapan, slots.protein.utama, slots.sayur, slots.buah).forEach(id => assert.ok(srv[id], id));
});
