/* Farm game logic (pure, shared with Node tests). Coins come from studying; the farm turns them into crops, animals and orders.
   Inspired by Hay Day (orders, barn, animals), Stardew Valley (levels unlock crops) and FarmVille (expanding land, decorations). */
(function (root) {
  "use strict";

  // ===== CONFIG =====
  const MIN = 60 * 1000;
  const CROPS = [ // seed cost, grow minutes, sell price, farm xp per harvest, unlock level
    { id: "wheat", en: "wheat", vi: "Lúa mì", emo: "🌾", seed: 5, min: 2, sell: 10, xp: 1, lv: 1 },
    { id: "carrot", en: "carrot", vi: "Cà rốt", emo: "🥕", seed: 10, min: 10, sell: 24, xp: 2, lv: 1 },
    { id: "corn", en: "corn", vi: "Ngô", emo: "🌽", seed: 15, min: 30, sell: 40, xp: 3, lv: 2 },
    { id: "tomato", en: "tomato", vi: "Cà chua", emo: "🍅", seed: 20, min: 60, sell: 56, xp: 4, lv: 3 },
    { id: "strawberry", en: "strawberry", vi: "Dâu tây", emo: "🍓", seed: 30, min: 120, sell: 85, xp: 6, lv: 4 },
    { id: "pumpkin", en: "pumpkin", vi: "Bí ngô", emo: "🎃", seed: 40, min: 240, sell: 120, xp: 8, lv: 5 },
    { id: "sunflower", en: "sunflower", vi: "Hoa hướng dương", emo: "🌻", seed: 50, min: 360, sell: 150, xp: 10, lv: 6 },
    { id: "watermelon", en: "watermelon", vi: "Dưa hấu", emo: "🍉", seed: 70, min: 480, sell: 210, xp: 14, lv: 7 },
  ];
  const PRODUCTS = [
    { id: "egg", en: "egg", vi: "Trứng gà", emo: "🥚", sell: 18, xp: 2 },
    { id: "milk", en: "milk", vi: "Sữa bò", emo: "🥛", sell: 50, xp: 4 },
    { id: "wool", en: "wool", vi: "Len cừu", emo: "🧶", sell: 90, xp: 6 },
    { id: "honey", en: "honey", vi: "Mật ong", emo: "🍯", sell: 130, xp: 8 },
  ];
  const ANIMALS = [ // price, minutes per product, product id, unlock level
    { id: "chicken", en: "chicken", vi: "Gà mái", emo: "🐔", cost: 80, min: 20, prod: "egg", lv: 2 },
    { id: "cow", en: "cow", vi: "Bò sữa", emo: "🐄", cost: 250, min: 60, prod: "milk", lv: 3 },
    { id: "sheep", en: "sheep", vi: "Cừu", emo: "🐑", cost: 400, min: 120, prod: "wool", lv: 5 },
    { id: "bee", en: "beehive", vi: "Tổ ong", emo: "🐝", cost: 600, min: 180, prod: "honey", lv: 6 },
  ];
  const DECOS = [ // bought once; bonus = % extra coins earned from studying
    { id: "flowers", en: "flower bed", vi: "Luống hoa", emo: "🌷", cost: 60, bonus: 2, lv: 1 },
    { id: "fence", en: "fence", vi: "Hàng rào gỗ", emo: "🪵", cost: 90, bonus: 2, lv: 1 },
    { id: "tree", en: "apple tree", vi: "Cây táo", emo: "🌳", cost: 150, bonus: 3, lv: 2 },
    { id: "dog", en: "farm dog", vi: "Chó giữ trại", emo: "🐕", cost: 200, bonus: 3, lv: 3 },
    { id: "well", en: "well", vi: "Giếng nước", emo: "⛲", cost: 300, bonus: 4, lv: 4 },
    { id: "house", en: "farmhouse", vi: "Nhà trang trại", emo: "🏡", cost: 500, bonus: 5, lv: 5 },
    { id: "tractor", en: "tractor", vi: "Máy cày", emo: "🚜", cost: 800, bonus: 6, lv: 6 },
    { id: "rainbow", en: "rainbow", vi: "Cầu vồng", emo: "🌈", cost: 1200, bonus: 5, lv: 8 },
  ];
  const LVXP = [0, 20, 60, 130, 240, 400, 620, 900, 1250, 1700]; // farm xp needed for level 1..10
  const START = { coins: 50, fert: 1, plots: 6, cap: 40 };
  const MAX_PLOTS = 15, MAX_PER_ANIMAL = 3, ORDERS = 3, CAP_STEP = 20;
  const REWARD = { lesson: [20, 1], review: [15, 1], goal: [50, 2] }; // [coins, fertilizer]
  // ==================

  const ITEMS = Object.fromEntries([...CROPS, ...PRODUCTS].map((x) => [x.id, x]));
  const CROP = Object.fromEntries(CROPS.map((x) => [x.id, x]));
  const ANIMAL = Object.fromEntries(ANIMALS.map((x) => [x.id, x]));
  const DECO = Object.fromEntries(DECOS.map((x) => [x.id, x]));
  const fail = (msg) => ({ ok: false, msg });

  function fresh() {
    return { coins: START.coins, fert: START.fert, xp: 0, plots: Array.from({ length: START.plots }, () => ({ c: null, at: 0 })),
      animals: [], barn: {}, cap: START.cap, orders: [], deco: [], goalDay: null, earned: 0 };
  }
  const level = (xp) => { let l = 1; while (l < LVXP.length && xp >= LVXP[l]) l++; return l; };
  const nextXp = (xp) => LVXP[level(xp)] ?? null;
  const bonus = (f) => Math.min(30, f.deco.reduce((n, id) => n + (DECO[id] ? DECO[id].bonus : 0), 0));
  const stock = (f) => Object.values(f.barn).reduce((a, b) => a + b, 0);
  const unlockedItems = (lv) => [...CROPS.filter((c) => c.lv <= lv), ...PRODUCTS.filter((p) => ANIMALS.some((a) => a.prod === p.id && a.lv <= lv))];

  /** Coins for studying: 1 coin per XP, plus the decoration bonus. */
  function earn(f, xp) {
    const n = Math.round(xp * (100 + bonus(f)) / 100);
    f.coins += n; f.earned += n;
    return n;
  }
  function reward(f, kind) { const [c, z] = REWARD[kind]; f.coins += c; f.earned += c; f.fert += z; return { coins: c, fert: z }; }

  function addXp(f, n) { const before = level(f.xp); f.xp += n; const after = level(f.xp); return after > before ? after : 0; }
  const remaining = (at, min, now) => Math.max(0, at + min * MIN - now);

  // ---- Field ----
  const plotReady = (p, now) => !!p.c && remaining(p.at, CROP[p.c].min, now) === 0;
  function plant(f, i, id, now) {
    const p = f.plots[i], c = CROP[id];
    if (!p || !c) return fail("Không có ô đất này");
    if (p.c) return fail("Ô đất đang có cây");
    if (c.lv > level(f.xp)) return fail(`Cần nông trại cấp ${c.lv}`);
    if (f.coins < c.seed) return fail("Chưa đủ xu — học thêm để kiếm xu nhé!");
    f.coins -= c.seed; p.c = id; p.at = now;
    return { ok: true };
  }
  function harvest(f, i, now) {
    const p = f.plots[i];
    if (!p || !plotReady(p, now)) return fail("Cây chưa chín");
    if (stock(f) >= f.cap) return fail("Nhà kho đầy — bán bớt hoặc nâng cấp kho");
    const c = CROP[p.c];
    f.barn[c.id] = (f.barn[c.id] || 0) + 1; p.c = null; p.at = 0;
    return { ok: true, item: c.id, levelUp: addXp(f, c.xp) };
  }
  function fertilize(f, i, now) {
    const p = f.plots[i];
    if (!p || !p.c || plotReady(p, now)) return fail("Không có cây đang lớn ở ô này");
    if (f.fert < 1) return fail("Hết phân bón — hoàn thành bài học để nhận thêm");
    f.fert--; p.at = now - CROP[p.c].min * MIN;
    return { ok: true };
  }
  const plotCost = (f) => (f.plots.length >= MAX_PLOTS ? null : 60 * (f.plots.length - START.plots + 1));
  function buyPlot(f) {
    const cost = plotCost(f);
    if (cost == null) return fail("Cánh đồng đã rộng tối đa");
    if (f.coins < cost) return fail("Chưa đủ xu để mở ô đất mới");
    f.coins -= cost; f.plots.push({ c: null, at: 0 });
    return { ok: true };
  }

  // ---- Animals ----
  const animalReady = (a, now) => remaining(a.at, ANIMAL[a.a].min, now) === 0;
  function buyAnimal(f, id, now) {
    const a = ANIMAL[id];
    if (!a) return fail("Không có con vật này");
    if (a.lv > level(f.xp)) return fail(`Cần nông trại cấp ${a.lv}`);
    if (f.animals.filter((x) => x.a === id).length >= MAX_PER_ANIMAL) return fail(`Tối đa ${MAX_PER_ANIMAL} ${a.vi.toLowerCase()}`);
    if (f.coins < a.cost) return fail("Chưa đủ xu");
    f.coins -= a.cost; f.animals.push({ a: id, at: now });
    return { ok: true };
  }
  function collect(f, i, now) {
    const a = f.animals[i];
    if (!a || !animalReady(a, now)) return fail("Chưa có sản phẩm");
    if (stock(f) >= f.cap) return fail("Nhà kho đầy — bán bớt hoặc nâng cấp kho");
    const p = ITEMS[ANIMAL[a.a].prod];
    f.barn[p.id] = (f.barn[p.id] || 0) + 1; a.at = now;
    return { ok: true, item: p.id, levelUp: addXp(f, p.xp) };
  }
  function feedBoost(f, i, now) {
    const a = f.animals[i];
    if (!a || animalReady(a, now)) return fail("Con vật đã sẵn sàng");
    if (f.fert < 1) return fail("Hết phân bón — hoàn thành bài học để nhận thêm");
    f.fert--; a.at = now - ANIMAL[a.a].min * MIN;
    return { ok: true };
  }

  // ---- Barn & shop ----
  function sell(f, id, qty = 1) {
    const it = ITEMS[id], have = f.barn[id] || 0;
    if (!it || have < qty || qty < 1) return fail("Không đủ hàng để bán");
    f.barn[id] = have - qty; if (!f.barn[id]) delete f.barn[id];
    f.coins += it.sell * qty;
    return { ok: true, coins: it.sell * qty };
  }
  const barnCost = (f) => 100 * ((f.cap - START.cap) / CAP_STEP + 1);
  function upgradeBarn(f) {
    const cost = barnCost(f);
    if (f.coins < cost) return fail("Chưa đủ xu để nâng cấp kho");
    f.coins -= cost; f.cap += CAP_STEP;
    return { ok: true };
  }
  function buyDeco(f, id) {
    const d = DECO[id];
    if (!d) return fail("Không có món này");
    if (f.deco.includes(id)) return fail("Bạn đã có món này");
    if (d.lv > level(f.xp)) return fail(`Cần nông trại cấp ${d.lv}`);
    if (f.coins < d.cost) return fail("Chưa đủ xu");
    f.coins -= d.cost; f.deco.push(id);
    return { ok: true };
  }

  // ---- Orders (Hay Day style delivery board) ----
  function makeOrder(lv, r) {
    const pool = unlockedItems(lv), kinds = Math.min(pool.length, 1 + Math.floor(r() * (lv >= 3 ? 3 : 2)));
    const need = {};
    while (Object.keys(need).length < kinds) {
      const it = pool[Math.floor(r() * pool.length)];
      need[it.id] = 1 + Math.floor(r() * (it.sell <= 25 ? 4 : 2));
    }
    const value = Object.entries(need).reduce((n, [id, q]) => n + ITEMS[id].sell * q, 0);
    const xp = Object.entries(need).reduce((n, [id, q]) => n + ITEMS[id].xp * q, 0) + 3;
    return { need, coins: Math.round(value * 1.5), xp };
  }
  function fillOrders(f, r) { while (f.orders.length < ORDERS) f.orders.push(makeOrder(level(f.xp), r)); }
  const canDeliver = (f, o) => Object.entries(o.need).every(([id, q]) => (f.barn[id] || 0) >= q);
  function deliver(f, i, r) {
    const o = f.orders[i];
    if (!o) return fail("Không có đơn hàng này");
    if (!canDeliver(f, o)) return fail("Chưa đủ hàng cho đơn này");
    for (const [id, q] of Object.entries(o.need)) { f.barn[id] -= q; if (!f.barn[id]) delete f.barn[id]; }
    f.coins += o.coins;
    const levelUp = addXp(f, o.xp);
    f.orders.splice(i, 1); fillOrders(f, r);
    return { ok: true, coins: o.coins, levelUp };
  }
  function skipOrder(f, i, r) { if (!f.orders[i]) return fail("Không có đơn hàng này"); f.orders.splice(i, 1); fillOrders(f, r); return { ok: true }; }

  /** What a farm level unlocks, for the level-up message. */
  const unlocks = (lv) => [...CROPS, ...ANIMALS, ...DECOS].filter((x) => x.lv === lv);

  const Farm = {
    MIN, CROPS, PRODUCTS, ANIMALS, DECOS, ITEMS, CROP, ANIMAL, DECO, LVXP, START, MAX_PLOTS, MAX_PER_ANIMAL, REWARD,
    fresh, level, nextXp, bonus, stock, unlockedItems, earn, reward, remaining, plotReady, plant, harvest, fertilize, plotCost, buyPlot,
    animalReady, buyAnimal, collect, feedBoost, sell, barnCost, upgradeBarn, buyDeco, makeOrder, fillOrders, canDeliver, deliver, skipOrder, unlocks,
  };
  if (typeof module === "object" && module.exports) module.exports = Farm;
  else root.Farm = Farm;
})(typeof window !== "undefined" ? window : globalThis);
