const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../src/farm.js");
const C = require("../src/core.js");

const T0 = 1_700_000_000_000;

test("new farm: starting coins, plots, empty barn", () => {
  const f = F.fresh();
  assert.equal(f.coins, 50); assert.equal(f.fert, 1); assert.equal(f.plots.length, 6);
  assert.equal(F.level(f.xp), 1); assert.equal(F.stock(f), 0);
});

test("studying earns coins, decorations add a capped bonus", () => {
  const f = F.fresh();
  assert.equal(F.earn(f, 10), 10);
  f.deco = F.DECOS.map((d) => d.id);
  assert.equal(F.bonus(f), 30);
  assert.equal(F.earn(f, 10), 13);
  assert.deepEqual(F.reward(f, "lesson"), { coins: 20, fert: 1 });
  assert.equal(f.coins, 50 + 10 + 13 + 20);
});

test("plant → grow → harvest, with fertilizer shortcut", () => {
  const f = F.fresh();
  assert.ok(F.plant(f, 0, "wheat", T0).ok);
  assert.equal(f.coins, 45);
  assert.equal(F.plant(f, 0, "carrot", T0).ok, false);
  assert.equal(F.harvest(f, 0, T0 + 60e3).ok, false);
  const h = F.harvest(f, 0, T0 + 2 * F.MIN);
  assert.ok(h.ok); assert.equal(f.barn.wheat, 1); assert.equal(f.xp, 1); assert.equal(f.plots[0].c, null);
  F.plant(f, 1, "carrot", T0);
  assert.ok(F.fertilize(f, 1, T0).ok);
  assert.equal(f.fert, 0);
  assert.ok(F.plotReady(f.plots[1], T0));
  F.plant(f, 2, "carrot", T0);
  assert.equal(F.fertilize(f, 2, T0).ok, false);
});

test("locked crops and missing coins are refused", () => {
  const f = F.fresh();
  assert.match(F.plant(f, 0, "corn", T0).msg, /cấp 2/);
  f.coins = 3;
  assert.equal(F.plant(f, 0, "wheat", T0).ok, false);
});

test("levels follow thresholds and report level-ups", () => {
  assert.equal(F.level(19), 1); assert.equal(F.level(20), 2); assert.equal(F.level(99999), F.LVXP.length);
  const f = F.fresh(); f.xp = 19; f.plots[0] = { c: "wheat", at: 0 };
  assert.equal(F.harvest(f, 0, T0).levelUp, 2);
  assert.ok(F.unlocks(2).some((x) => x.id === "corn"));
});

test("barn capacity limits harvesting; selling frees space", () => {
  const f = F.fresh(); f.barn = { wheat: f.cap }; f.plots[0] = { c: "wheat", at: 0 };
  assert.match(F.harvest(f, 0, T0).msg, /kho đầy/i);
  assert.deepEqual(F.sell(f, "wheat", 5), { ok: true, coins: 50 });
  assert.ok(F.harvest(f, 0, T0).ok);
  const before = f.coins;
  assert.ok(F.upgradeBarn(f).ok);
  assert.equal(f.cap, 60); assert.equal(f.coins, before - 100);
});

test("animals: unlock level, max count, collect product", () => {
  const f = F.fresh(); f.coins = 10000;
  assert.equal(F.buyAnimal(f, "chicken", T0).ok, false);
  f.xp = F.LVXP[1];
  for (let i = 0; i < F.MAX_PER_ANIMAL; i++) assert.ok(F.buyAnimal(f, "chicken", T0).ok);
  assert.equal(F.buyAnimal(f, "chicken", T0).ok, false);
  assert.equal(F.collect(f, 0, T0 + 5 * F.MIN).ok, false);
  assert.ok(F.collect(f, 0, T0 + 20 * F.MIN).ok);
  assert.equal(f.barn.egg, 1);
  assert.ok(F.feedBoost(f, 1, T0).ok);
  assert.ok(F.collect(f, 1, T0).ok);
});

test("plots expand with rising cost up to the maximum", () => {
  const f = F.fresh(); f.coins = 100000;
  assert.equal(F.plotCost(f), 60);
  F.buyPlot(f);
  assert.equal(F.plotCost(f), 120);
  while (F.buyPlot(f).ok);
  assert.equal(f.plots.length, F.MAX_PLOTS); assert.equal(F.plotCost(f), null);
});

test("orders use only unlocked items and pay more than selling", () => {
  const r = C.rng(7), f = F.fresh();
  F.fillOrders(f, r);
  assert.equal(f.orders.length, 3);
  for (const o of f.orders) {
    for (const id of Object.keys(o.need)) assert.equal(F.CROP[id].lv, 1);
    const value = Object.entries(o.need).reduce((n, [id, q]) => n + F.ITEMS[id].sell * q, 0);
    assert.ok(o.coins > value);
  }
  const o = f.orders[0];
  assert.equal(F.deliver(f, 0, r).ok, false);
  f.barn = { ...o.need };
  const coins = f.coins, d = F.deliver(f, 0, r);
  assert.ok(d.ok); assert.equal(f.coins, coins + o.coins); assert.equal(F.stock(f), 0); assert.equal(f.orders.length, 3);
  assert.ok(F.skipOrder(f, 1, r).ok); assert.equal(f.orders.length, 3);
});

test("decorations: buy once, respect level", () => {
  const f = F.fresh(); f.coins = 1000;
  assert.ok(F.buyDeco(f, "flowers").ok);
  assert.equal(F.buyDeco(f, "flowers").ok, false);
  assert.equal(F.buyDeco(f, "tractor").ok, false);
  assert.equal(F.bonus(f), 2);
});
