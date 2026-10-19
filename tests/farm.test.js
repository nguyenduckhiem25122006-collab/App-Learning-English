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

test("plots expand to 30, more unlocking at higher farm levels", () => {
  assert.deepEqual([1, 6, 7, 9, 10, 12, 13, 28, 30].map(F.plotLevel), [1, 1, 1, 1, 2, 2, 3, 8, 8]);
  const f = F.fresh(); f.coins = 100000;
  assert.equal(F.plotCost(f), 60);
  F.buyPlot(f);
  assert.equal(F.plotCost(f), 120);
  while (F.buyPlot(f).ok);
  assert.equal(f.plots.length, 9, "level 1 farm stops at 9 plots");
  assert.match(F.buyPlot(f).msg, /cấp 2/);
  f.xp = F.LVXP[7];
  while (F.buyPlot(f).ok);
  assert.equal(f.plots.length, F.MAX_PLOTS); assert.equal(F.MAX_PLOTS, 30); assert.equal(F.plotCost(f), null);
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

test("play gate: locked until 10 study minutes, 1 study minute = 0.75 play minute", () => {
  const M = F.MIN;
  let g = null;
  assert.equal(F.gate(g, T0).open, false);
  g = F.addStudy(g, 9 * M, T0);
  let st = F.gate(g, T0);
  assert.equal(st.open, false); assert.equal(st.need, M); assert.equal(st.budget, 6.75 * M);
  g = F.addStudy(g, M, T0 + M);
  st = F.gate(g, T0 + M);
  assert.equal(st.open, true); assert.equal(st.budget, 7.5 * M);
  g = F.addPlay(g, 7.5 * M, T0 + 2 * M);
  st = F.gate(g, T0 + 2 * M);
  assert.equal(st.open, false); assert.equal(st.budget, 0);
  g = F.addPlay(g, M, T0 + 2 * M);
  assert.equal(g.play, 7.5 * M, "play never exceeds the budget");
  g = F.addStudy(g, 4 * M, T0 + 3 * M);
  assert.equal(F.gate(g, T0 + 3 * M).budget, 3 * M);
});

test("play gate: window resets 5 hours after it started", () => {
  const M = F.MIN, W = F.GATE.WINDOW;
  let g = F.addStudy(null, 20 * M, T0);
  assert.equal(F.gate(g, T0 + W - 1).open, true);
  assert.equal(F.gate(g, T0 + W - 60e3).resetIn, 60e3);
  const after = F.gate(g, T0 + W);
  assert.equal(after.open, false); assert.equal(after.study, 0); assert.equal(after.resetIn, null);
  assert.equal(F.addPlay(g, M, T0 + W), g, "no play counted in an expired window");
  g = F.addStudy(g, M, T0 + W + 5);
  assert.deepEqual(g, { start: T0 + W + 5, study: M, play: 0 });
});

const DAY = "2026-10-19", NEXT = "2026-10-20";
const richFarm = () => { const f = F.fresh(); f.coins = 100000; f.xp = 99999; f.cap = 9999; f.barn = Object.fromEntries(F.CROPS.concat(F.PRODUCTS).map((x) => [x.id, 200])); return f; };

test("12 spirit beasts: one per zodiac sign, valid materials and effects", () => {
  assert.equal(F.BEASTS.length, 12);
  assert.deepEqual(F.BEASTS.map((b) => b.zo), ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"]);
  for (const b of F.BEASTS) {
    for (const id of [...Object.keys(b.need), ...b.fav]) assert.ok(F.ITEMS[id], `${b.id}: ${id}`);
    for (const id of Object.keys(b.need)) {
      const src = F.CROP[id] ? F.CROP[id].lv : F.ANIMALS.find((a) => a.prod === id).lv;
      assert.ok(src <= b.lv, `${b.id} needs ${id} unlocked at level ${src}`);
    }
    assert.ok(b.speed[1] + b.price[1] > 0);
    const p1 = F.beastPower(b.id, 1), p8 = F.beastPower(b.id, 8);
    assert.deepEqual([p1.speed, p1.price, p8.speed, p8.price], [b.speed[0], b.price[0], b.speed[1], b.price[1]]);
  }
});

test("buying a beast needs farm level, coins and materials", () => {
  const f = F.fresh();
  assert.match(F.buyBeast(f, "ox", DAY).msg, /cấp 2/);
  f.coins = 1000;
  assert.match(F.buyBeast(f, "rat", DAY).msg, /nguyên liệu/);
  assert.deepEqual(F.missing(f, F.BEAST.rat.need), { wheat: 10 });
  f.barn = { wheat: 12 };
  assert.ok(F.buyBeast(f, "rat", DAY).ok);
  assert.equal(f.coins, 800); assert.deepEqual(f.barn, { wheat: 2 });
  assert.deepEqual(f.beasts.rat, { lv: 1, st: F.STAMINA, day: DAY });
  assert.equal(F.buyBeast(f, "rat", DAY).ok, false);
});

test("beasts upgrade through 8 levels with harvested crops", () => {
  const f = richFarm();
  F.buyBeast(f, "tiger", DAY);
  const c1 = F.upgradeCost(f, "tiger");
  assert.deepEqual(c1, { coins: 225, need: { corn: 5 } });
  for (let i = 0; i < 7; i++) assert.ok(F.upgradeBeast(f, "tiger").ok);
  assert.equal(f.beasts.tiger.lv, 8);
  assert.equal(F.upgradeCost(f, "tiger"), null);
  assert.match(F.upgradeBeast(f, "tiger").msg, /tối đa/);
  const g = F.fresh(); g.coins = 10000; g.barn = { wheat: 10 }; F.buyBeast(g, "rat", DAY);
  assert.match(F.upgradeBeast(g, "rat").msg, /nông sản/);
});

test("stamina: 10 a day, more crops cost more, higher level costs less", () => {
  assert.equal(F.castCost(1, 1), 1); assert.equal(F.castCost(1, 6), 6);
  assert.equal(F.castCost(8, 6), 2); assert.equal(F.castCost(5, 3), 2);
  assert.ok(F.castCost(1, 10) > F.castCost(4, 10) && F.castCost(4, 10) > F.castCost(8, 10));
  const f = richFarm(); F.buyBeast(f, "rat", DAY);
  for (let i = 0; i < 6; i++) F.plant(f, i, "wheat", T0);
  const r = F.cast(f, "rat", [0, 1, 2, 3, 4, 5], T0, DAY);
  assert.deepEqual([r.ok, r.n, r.cost], [true, 6, 6]);
  assert.equal(F.stamina(f, "rat", DAY), 4);
  F.uproot(f, 0); F.uproot(f, 1);
  for (let i = 0; i < 6; i++) if (!f.plots[i].c) F.plant(f, i, "wheat", T0);
  for (let i = 6; i < 9; i++) { f.plots.push({ c: null, at: 0 }); F.plant(f, i, "wheat", T0); }
  assert.match(F.cast(f, "rat", [0, 1, 6, 7, 8], T0, DAY).msg, /thể lực/);
  assert.equal(F.stamina(f, "rat", NEXT), F.STAMINA, "refills the next day");
  assert.ok(F.cast(f, "rat", [0, 1, 6, 7, 8], T0, NEXT).ok);
});

test("speed buff cuts remaining grow time once per beast per crop", () => {
  const f = richFarm(); F.buyBeast(f, "horse", DAY);
  F.plant(f, 0, "pumpkin", T0);
  const before = F.remaining(f.plots[0].at, 240, T0);
  assert.ok(F.cast(f, "horse", [0], T0, DAY).ok);
  assert.equal(F.remaining(f.plots[0].at, 240, T0), Math.round(before * 0.75));
  assert.deepEqual(F.castTargets(f, "horse", T0), []);
  assert.equal(F.cast(f, "horse", [0], T0, DAY).ok, false);
  F.plant(f, 1, "wheat", T0); F.plant(f, 2, "pumpkin", T0);
  assert.deepEqual(F.castTargets(f, "horse", T0 + 3 * F.MIN), [2], "ripe crops are skipped by a speed-only beast");
});

test("price buff pays extra coins at harvest, capped, cleared after", () => {
  const f = richFarm(); F.buyBeast(f, "pig", DAY); F.buyBeast(f, "rooster", DAY);
  F.plant(f, 0, "watermelon", T0);
  F.cast(f, "pig", [0], T0, DAY); F.cast(f, "rooster", [0], T0, DAY);
  assert.equal(f.plots[0].pb, 45);
  const coins = f.coins, h = F.harvest(f, 0, T0 + 480 * F.MIN);
  assert.equal(h.bonus, Math.round(210 * 0.45)); assert.equal(f.coins, coins + h.bonus);
  assert.deepEqual(f.plots[0], { c: null, at: 0 });
  for (let i = 0; i < 7; i++) { F.upgradeBeast(f, "pig"); F.upgradeBeast(f, "rooster"); }
  f.beasts.dragon = { lv: 8, st: 10, day: DAY }; f.beasts.snake = { lv: 8, st: 10, day: DAY };
  F.plant(f, 0, "wheat", T0);
  for (const b of ["pig", "rooster", "dragon", "snake"]) F.cast(f, b, [0], T0, DAY);
  assert.equal(f.plots[0].pb, F.PRICE_CAP);
});

test("pig pen: pigs unlock at level 4 and find truffles", () => {
  const f = F.fresh(); f.coins = 1000; f.xp = F.LVXP[2];
  assert.match(F.buyAnimal(f, "pig", T0).msg, /cấp 4/);
  f.xp = F.LVXP[3];
  assert.ok(F.buyAnimal(f, "pig", T0).ok);
  assert.ok(F.collect(f, 0, T0 + 90 * F.MIN).ok);
  assert.equal(f.barn.truffle, 1);
  assert.ok(F.unlockedItems(4).some((x) => x.id === "truffle") && !F.unlockedItems(3).some((x) => x.id === "truffle"));
});
