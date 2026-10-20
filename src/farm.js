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
    { id: "truffle", en: "truffle", vi: "Nấm truffle", emo: "🍄", sell: 70, xp: 5 },
    { id: "wool", en: "wool", vi: "Len cừu", emo: "🧶", sell: 90, xp: 6 },
    { id: "honey", en: "honey", vi: "Mật ong", emo: "🍯", sell: 130, xp: 8 },
  ];
  const ANIMALS = [ // price, minutes per product, product id, unlock level
    { id: "chicken", en: "chicken", vi: "Gà mái", emo: "🐔", cost: 80, min: 20, prod: "egg", lv: 2 },
    { id: "cow", en: "cow", vi: "Bò sữa", emo: "🐄", cost: 250, min: 60, prod: "milk", lv: 3 },
    { id: "pig", en: "pig", vi: "Lợn", emo: "🐖", cost: 350, min: 90, prod: "truffle", lv: 4 },
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
  // 12 spirit beasts (Linh Thú) from the zodiac art. speed = % of remaining grow time cut, price = % extra coins
  // when the buffed crop is harvested; [level 1, level 8] values, linear in between. need = coins + barn items to buy.
  // learn = a study challenge that must be met too: words learned, best streak (days), sentences learned, IPA sounds
  // learned, words mastered. The first beasts come within days; the dragon is a months-long goal.
  const BEASTS = [
    { id: "rat", zo: "Tý", en: "rat", vi: "Thử Ảnh Sát Thủ", lore: "Ninja bóng đêm, giục cây lớn nhanh như chớp", lv: 1, cost: 300, need: { wheat: 15 }, learn: { words: 20 }, fav: ["wheat", "carrot"], speed: [15, 40], price: [0, 0] },
    { id: "ox", zo: "Sửu", en: "ox", vi: "Ngưu Hỏa Chiến Tướng", lore: "Búa lửa nện đất, nông sản chắc nặng, bán được giá", lv: 2, cost: 450, need: { wheat: 20, carrot: 12 }, learn: { words: 60, sents: 10 }, fav: ["carrot", "wheat"], speed: [0, 0], price: [10, 35] },
    { id: "tiger", zo: "Dần", en: "tiger", vi: "Hổ Viêm Đao", lore: "Đao lửa thiêu sâu bọ, cây vừa nhanh lớn vừa đẹp", lv: 3, cost: 700, need: { carrot: 15, corn: 12 }, learn: { words: 80, best: 5 }, fav: ["corn", "carrot"], speed: [12, 30], price: [8, 25] },
    { id: "cat", zo: "Mão", en: "cat", vi: "Miêu Nguyệt Ảnh", lore: "Dưới trăng, móng vuốt gọi sương đêm tưới cây", lv: 3, cost: 750, need: { corn: 15, wheat: 15 }, learn: { words: 100, ipa: 10 }, fav: ["corn", "wheat"], speed: [20, 50], price: [0, 0] },
    { id: "dragon", zo: "Thìn", en: "dragon", vi: "Lôi Long Thần", lore: "Gọi sấm mưa, mùa màng bội thu và quý giá", lv: 7, cost: 3800, need: { watermelon: 8, sunflower: 8, strawberry: 15 }, learn: { words: 450, best: 21, mastered: 60 }, fav: ["watermelon", "sunflower"], speed: [15, 40], price: [15, 40] },
    { id: "snake", zo: "Tỵ", en: "snake", vi: "Xà Độc Pháp Sư", lore: "Bùa lục xà khiến thương lái tranh nhau trả giá", lv: 4, cost: 1050, need: { tomato: 15, strawberry: 8 }, learn: { words: 140, sents: 25 }, fav: ["tomato", "strawberry"], speed: [0, 0], price: [15, 45] },
    { id: "horse", zo: "Ngọ", en: "horse", vi: "Mã Liệt Hỏa Thương", lore: "Phi nước đại, thời gian như ngắn lại một nửa", lv: 5, cost: 1500, need: { pumpkin: 8, strawberry: 12 }, learn: { words: 220, ipa: 20 }, fav: ["strawberry", "pumpkin"], speed: [25, 55], price: [0, 0] },
    { id: "goat", zo: "Mùi", en: "goat", vi: "Dương Băng Pháp Sư", lore: "Lửa băng nuôi rễ, cây khỏe và ngon hơn", lv: 4, cost: 1200, need: { tomato: 12, milk: 8 }, learn: { words: 180, best: 7 }, fav: ["tomato", "corn"], speed: [8, 20], price: [12, 35] },
    { id: "monkey", zo: "Thân", en: "monkey", vi: "Hầu Lôi Quyền", lore: "Quyền sấm sét đánh thức hạt giống ngủ quên", lv: 5, cost: 1800, need: { pumpkin: 9, egg: 15 }, learn: { words: 260, sents: 45 }, fav: ["pumpkin", "tomato"], speed: [18, 45], price: [5, 15] },
    { id: "rooster", zo: "Dậu", en: "rooster", vi: "Kê Phượng Song Kiếm", lore: "Tiếng gáy phượng hoàng khiến nông sản sáng như vàng", lv: 6, cost: 2400, need: { sunflower: 9, honey: 5 }, learn: { words: 320, best: 14, mastered: 20 }, fav: ["sunflower", "strawberry"], speed: [0, 0], price: [20, 50] },
    { id: "dog", zo: "Tuất", en: "dog", vi: "Khuyển Trung Kiếm Sĩ", lore: "Canh giữ ruộng vườn, cây lớn đều và bán đắt", lv: 2, cost: 500, need: { carrot: 12, wheat: 15 }, learn: { words: 40, best: 3 }, fav: ["carrot", "corn"], speed: [10, 30], price: [10, 30] },
    { id: "pig", zo: "Hợi", en: "pig", vi: "Trư Chùy Bá Vương", lore: "Chùy gai dọa lui sâu hại, nông sản được giá cao nhất", lv: 6, cost: 3000, need: { pumpkin: 12, wool: 5 }, learn: { words: 380, sents: 70, mastered: 40 }, fav: ["pumpkin", "sunflower"], speed: [0, 0], price: [25, 60] },
  ];
  const LEARN_KEYS = ["words", "best", "sents", "ipa", "mastered"];
  const BEAST_MAX_LV = 8, STAMINA = 10, PRICE_CAP = 150;
  const STAMINA_PER_CROP = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]; // by beast level
  const LVXP = [0, 20, 60, 130, 240, 400, 620, 900, 1250, 1700, 2200, 2750, 3350, 4000, 4700, 5450, 6250, 7100, 8000, 8950, 9950, 11000, 12100, 13250]; // farm xp needed for level 1..24
  const START = { coins: 50, fert: 1, plots: 6, cap: 40 };
  const MAX_PLOTS = 30, MAX_PER_ANIMAL = 3, ORDERS = 3, CAP_STEP = 20;
  const REWARD = { lesson: [20, 1], review: [15, 1], goal: [50, 2] }; // [coins, fertilizer]
  // Play-time gate: each study minute buys RATIO farm minutes; the farm opens after MIN_STUDY
  // of study in a window, and the window (study + play time) resets WINDOW after it started.
  const GATE = { RATIO: 0.75, MIN_STUDY: 10 * MIN, WINDOW: 5 * 60 * MIN, IDLE: 90 * 1000 };
  // ==================

  const ITEMS = Object.fromEntries([...CROPS, ...PRODUCTS].map((x) => [x.id, x]));
  const CROP = Object.fromEntries(CROPS.map((x) => [x.id, x]));
  const ANIMAL = Object.fromEntries(ANIMALS.map((x) => [x.id, x]));
  const DECO = Object.fromEntries(DECOS.map((x) => [x.id, x]));
  const BEAST = Object.fromEntries(BEASTS.map((x) => [x.id, x]));
  const fail = (msg) => ({ ok: false, msg });

  function fresh() {
    return { coins: START.coins, fert: START.fert, xp: 0, plots: Array.from({ length: START.plots }, () => ({ c: null, at: 0 })),
      animals: [], barn: {}, cap: START.cap, orders: [], deco: [], goalDay: null, earned: 0, beasts: {} };
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
    const c = CROP[p.c], bonusCoins = Math.round(c.sell * (p.pb || 0) / 100);
    f.barn[c.id] = (f.barn[c.id] || 0) + 1; f.coins += bonusCoins;
    clearPlot(p);
    return { ok: true, item: c.id, bonus: bonusCoins, levelUp: addXp(f, c.xp) };
  }
  function clearPlot(p) { p.c = null; p.at = 0; delete p.bf; delete p.pb; }
  function uproot(f, i) { const p = f.plots[i]; if (!p || !p.c) return fail("Ô đất trống"); clearPlot(p); return { ok: true }; }
  function fertilize(f, i, now) {
    const p = f.plots[i];
    if (!p || !p.c || plotReady(p, now)) return fail("Không có cây đang lớn ở ô này");
    if (f.fert < 1) return fail("Hết phân bón — hoàn thành bài học để nhận thêm");
    f.fert--; p.at = now - CROP[p.c].min * MIN;
    return { ok: true };
  }
  /** Farm level needed for plot number n (1-based): 6 to start, then 3 more at each farm level 1–8, up to 30. */
  // Plot 7 opens at level 1, then each farm level opens exactly one more (plot 30 at level 24).
  const plotLevel = (n) => (n <= START.plots ? 1 : n - START.plots);
  const plotCost = (f) => (f.plots.length >= MAX_PLOTS ? null : 60 * (f.plots.length - START.plots + 1));
  function buyPlot(f) {
    const cost = plotCost(f);
    if (cost == null) return fail("Cánh đồng đã rộng tối đa");
    const need = plotLevel(f.plots.length + 1);
    if (need > level(f.xp)) return fail(`Ô đất này mở ở nông trại cấp ${need}`);
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

  // ---- Play-time gate ----
  const gateLive = (g, now) => !!g && now - g.start < GATE.WINDOW;
  /** Effective gate state now: study/play ms in the current window, play budget left, open or locked. */
  function gate(g, now) {
    const live = gateLive(g, now), study = live ? g.study : 0, play = live ? g.play : 0;
    const budget = Math.max(0, study * GATE.RATIO - play);
    return { study, play, budget, open: study >= GATE.MIN_STUDY && budget > 0,
      need: Math.max(0, GATE.MIN_STUDY - study), resetIn: live ? g.start + GATE.WINDOW - now : null };
  }
  /** Count study time; starts a new window when the previous one has expired. */
  function addStudy(g, ms, now) {
    const w = gateLive(g, now) ? { ...g } : { start: now, study: 0, play: 0 };
    w.study += ms;
    return w;
  }
  function addPlay(g, ms, now) {
    if (!gateLive(g, now)) return g;
    return { ...g, play: Math.min(g.play + ms, g.study * GATE.RATIO) };
  }

  // ---- Spirit beasts (Linh Thú) ----
  const has = (f, items) => Object.entries(items).every(([id, q]) => (f.barn[id] || 0) >= q);
  const take = (f, items) => { for (const [id, q] of Object.entries(items)) { f.barn[id] -= q; if (!f.barn[id]) delete f.barn[id]; } };
  const missing = (f, items) => Object.fromEntries(Object.entries(items).filter(([id, q]) => (f.barn[id] || 0) < q).map(([id, q]) => [id, q - (f.barn[id] || 0)]));
  /** Effect of a beast at a level: { speed, price } in %. */
  function beastPower(id, lv) {
    const b = BEAST[id], t = (lv - 1) / (BEAST_MAX_LV - 1);
    return { speed: Math.round(b.speed[0] + (b.speed[1] - b.speed[0]) * t), price: Math.round(b.price[0] + (b.price[1] - b.price[0]) * t) };
  }
  /** Stamina left today (refills to STAMINA at each new day). */
  const stamina = (f, id, today) => { const s = f.beasts[id]; return !s ? 0 : s.day === today ? s.st : STAMINA; };
  /** Stamina for buffing n crops: more crops cost more, higher levels cost less per crop. */
  const castCost = (lv, n) => (n <= 0 ? 0 : Math.ceil(n * STAMINA_PER_CROP[lv - 1] - 1e-9));
  /** Study goals of a beast's challenge not met yet: { key: needed }. stats: { words, best, sents, ipa, mastered }. */
  function learnMissing(id, stats) {
    const out = {};
    for (const [k, q] of Object.entries(BEAST[id].learn)) if (((stats && stats[k]) || 0) < q) out[k] = q;
    return out;
  }
  function buyBeast(f, id, today, stats) {
    const b = BEAST[id];
    if (!b) return fail("Không có Linh Thú này");
    if (f.beasts[id]) return fail("Bạn đã có Linh Thú này");
    if (b.lv > level(f.xp)) return fail(`Cần nông trại cấp ${b.lv}`);
    if (Object.keys(learnMissing(id, stats)).length) return fail("Chưa hoàn thành thử thách học tập");
    if (f.coins < b.cost) return fail("Chưa đủ xu");
    if (!has(f, b.need)) return fail("Chưa đủ nguyên liệu trong kho");
    f.coins -= b.cost; take(f, b.need);
    f.beasts[id] = { lv: 1, st: STAMINA, day: today };
    return { ok: true };
  }
  /** Coins and harvested crops needed to go from the current level to the next; null at max level. */
  function upgradeCost(f, id) {
    const s = f.beasts[id], b = BEAST[id];
    if (!s || s.lv >= BEAST_MAX_LV) return null;
    const L = s.lv, need = { [b.fav[0]]: 3 + 2 * L };
    if (L >= 3) need[b.fav[1]] = L;
    return { coins: Math.round(b.cost * 0.35 * L), need };
  }
  function upgradeBeast(f, id) {
    const c = upgradeCost(f, id);
    if (!c) return fail(f.beasts[id] ? `Đã đạt cấp tối đa ${BEAST_MAX_LV}` : "Bạn chưa có Linh Thú này");
    if (f.coins < c.coins) return fail("Chưa đủ xu để nâng cấp");
    if (!has(f, c.need)) return fail("Chưa đủ nông sản để nâng cấp");
    f.coins -= c.coins; take(f, c.need); f.beasts[id].lv++;
    return { ok: true, lv: f.beasts[id].lv };
  }
  /** Plots this beast can buff now: planted, not yet buffed by it; ripe plots only if it raises the price. */
  function castTargets(f, id, now) {
    const pw = f.beasts[id] ? beastPower(id, f.beasts[id].lv) : null;
    if (!pw) return [];
    return f.plots.map((p, i) => [p, i]).filter(([p]) => p.c && !(p.bf || []).includes(id) && (!plotReady(p, now) || pw.price > 0)).map(([, i]) => i);
  }
  function cast(f, id, idxs, now, today) {
    const s = f.beasts[id];
    if (!s) return fail("Bạn chưa có Linh Thú này");
    const ok = new Set(castTargets(f, id, now)), list = [...new Set(idxs)].filter((i) => ok.has(i));
    if (!list.length) return fail("Không có cây nào để ban phúc");
    const cost = castCost(s.lv, list.length), st = stamina(f, id, today);
    if (cost > st) return fail(`Không đủ thể lực (cần ${cost}, còn ${st})`);
    const pw = beastPower(id, s.lv);
    for (const i of list) {
      const p = f.plots[i];
      if (pw.speed && !plotReady(p, now)) p.at -= Math.round(remaining(p.at, CROP[p.c].min, now) * pw.speed / 100);
      if (pw.price) p.pb = Math.min(PRICE_CAP, (p.pb || 0) + pw.price);
      p.bf = [...(p.bf || []), id];
    }
    s.st = st - cost; s.day = today;
    return { ok: true, n: list.length, cost };
  }

  /** What a farm level unlocks, for the level-up message. */
  const unlocks = (lv) => [...CROPS, ...ANIMALS, ...DECOS, ...BEASTS].filter((x) => x.lv === lv);

  const Farm = {
    MIN, CROPS, PRODUCTS, ANIMALS, DECOS, ITEMS, CROP, ANIMAL, DECO, LVXP, START, MAX_PLOTS, plotLevel, MAX_PER_ANIMAL, REWARD, GATE, gate, addStudy, addPlay,
    fresh, level, nextXp, bonus, stock, unlockedItems, earn, reward, remaining, plotReady, plant, harvest, fertilize, plotCost, buyPlot,
    animalReady, buyAnimal, collect, feedBoost, sell, barnCost, upgradeBarn, buyDeco, makeOrder, fillOrders, canDeliver, deliver, skipOrder, unlocks, uproot,
    BEASTS, BEAST, BEAST_MAX_LV, STAMINA, STAMINA_PER_CROP, PRICE_CAP, beastPower, stamina, castCost, buyBeast, learnMissing, LEARN_KEYS, upgradeCost, upgradeBeast, castTargets, cast, missing,
  };
  if (typeof module === "object" && module.exports) module.exports = Farm;
  else root.Farm = Farm;
})(typeof window !== "undefined" ? window : globalThis);
