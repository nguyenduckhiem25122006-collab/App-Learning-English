/* UI: five views (Hôm nay, Từ vựng, Câu, IPA, Tiến độ), local storage, speech, and custom word pictures. */
(function () {
  "use strict";
  const C = window.Core, D = window.APP_DATA, F = window.Farm, Online = window.Online;

  // ===== CONFIG =====
  const KEY = "nhip.v1";
  const SAVE_MS = 250;
  const LEVELS = { kids: "Lớp 7", toeic: "TOEIC 750" };
  const TRACKS = { daily: "Hằng ngày", work: "Công sở" };
  const STAGES = { Basic: "Cơ bản", Intermediate: "Trung cấp", Advanced: "Nâng cao" };
  const POS = { n: "danh từ", v: "động từ", adj: "tính từ", adv: "trạng từ", phr: "cụm từ", prep: "giới từ", conj: "liên từ" };
  const XP = { learn: 10, quiz: 5, review: 3, sent: 8, scramble: 2, ipa: 5, pair: 1 };
  const PERDAY = [3, 30], SENTPER = [1, 10];
  const EMOJIS = ("🎯 🎨 📚 ✏️ 📝 💡 🧠 ⭐ ❤️ 🔥 🌱 🌳 🌸 🍎 🍜 ☕ 🏠 🏫 🏢 🚗 🚌 ✈️ 🚲 ⚽ 🏀 🎵 🎬 📷 💻 📱 ⏰ 📅 💰 💼 " +
    "🤝 👍 👀 🗣️ 👂 ✋ 🙂 😀 😢 😮 😴 🐶 🐱 🐟 🐦 ☀️ 🌧️ ❄️ 🌈 🌍 🗺️ 🎁 🎉 🏆 🔑 🔒 🔍 🧩 🛠️ 📦 🛒 🧾 📈 📉 ⚖️ 🧪 🩺 💊 " +
    "🍽️ 🧳 🏖️ 🎓 👪 👩‍🏫 🧑‍💼 🏥 🚦 🎤 🎮 🧸 🪴 🧹 🛏️").split(" ");
  const SWATCHES = ["", "#FFE9A8", "#CDE8FF", "#D7F5DD", "#FFD9D6", "#E9DDFF", "#FFE2C2", "#E3E8EF"];
  const PENS = ["#15223A", "#BE3B35", "#2450B8", "#1D8556", "#E0A100", "#8E44AD"];
  const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const WD_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  // ==================

  // ---------- Data ----------
  const WORDS = {}, BYKEY = {};
  for (const [lvl, topics] of Object.entries(D.levels)) {
    WORDS[lvl] = [];
    topics.forEach((t, ti) => t.words.forEach(([w, pos, ipa, vi, ex, emo]) => {
      const o = { w, pos, ipa, vi, ex, emo, key: `${w}|${pos}`, topic: ti, lvl };
      WORDS[lvl].push(o);
      BYKEY[o.key] = BYKEY[o.key] || o;
    }));
  }
  const SENTS = {};
  for (const [track, groups] of Object.entries(D.sentences)) {
    SENTS[track] = [];
    groups.forEach((g, gi) => g.items.forEach(([en, vi, note]) =>
      SENTS[track].push({ en, vi, note, stage: g.stage, group: g.vi, gen: g.en, gi, track, key: `${track}:${en}` })));
  }
  const SOUNDS = D.ipa.sounds, SOUND = Object.fromEntries(SOUNDS.map((s) => [s.s, s]));

  // ---------- State ----------
  const fresh = () => ({ v: 1, level: "toeic", perday: 8, sentPerDay: 3, track: "daily", progress: { kids: {}, toeic: {} },
    sent: {}, sentDay: null, ipa: [], xp: 0, streak: { count: 0, last: null, best: 0 }, days: {}, rate: 0.9, accent: "en-US", theme: "auto", farm: F.fresh(), gate: null, online: null });
  function merge(o) {
    const d = fresh(), s = { ...d, ...(o || {}) };
    s.progress = { ...d.progress, ...(s.progress || {}) };
    s.streak = { ...d.streak, ...(s.streak || {}) };
    if (!LEVELS[s.level]) s.level = d.level;
    if (!Array.isArray(s.ipa)) s.ipa = [];
    s.farm = { ...F.fresh(), ...(s.farm || {}) };
    if (!s.farm.beasts || typeof s.farm.beasts !== "object") s.farm.beasts = {};
    if (!s.online || typeof s.online.token !== "string") s.online = null;
    return s;
  }
  // A daily backup copy lets the app recover if the main record is ever damaged.
  function load() {
    for (const k of [KEY, KEY + ".bak"]) {
      try { const raw = localStorage.getItem(k); if (raw) return merge(JSON.parse(raw)); } catch (e) { /* damaged or blocked: try the backup */ }
    }
    return fresh();
  }
  let S = load();
  let saveT = null;
  // Write at most SAVE_MS after the first change; later changes ride along instead of postponing it.
  const save = () => { if (!saveT) saveT = setTimeout(flush, SAVE_MS); };
  function flush() {
    clearTimeout(saveT); saveT = null;
    const keys = Object.keys(S.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete S.days[k];
    try {
      const json = JSON.stringify(S);
      localStorage.setItem(KEY, json);
      if (localStorage.getItem(KEY + ".bakday") !== today()) { localStorage.setItem(KEY + ".bak", json); localStorage.setItem(KEY + ".bakday", today()); }
    } catch (e) { /* storage full or blocked */ }
  }
  // Another tab wrote the store: adopt its copy so we never overwrite it with stale data.
  addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { S = merge(JSON.parse(e.newValue)); } catch (err) { return; }
    clearTimeout(saveT); saveT = null;
    applyTheme();
    if (!inSession()) render(); else renderHeader();
  });
  addEventListener("pagehide", () => { if (saveT) flush(); });

  const today = () => C.dstr();
  const prog = () => S.progress[S.level];
  function bump(field, n = 1) {
    const d = S.days[today()] || (S.days[today()] = { w: 0, r: 0, s: 0, xp: 0 });
    d[field] = (d[field] || 0) + n;
  }
  function addXP(n) {
    S.xp += n; bump("xp", n);
    F.earn(S.farm, n);
    S.streak = C.touchStreak(S.streak, today());
    save(); renderHeader();
  }

  /** Bonus coins + fertilizer for finishing a lesson (kind: lesson | review | goal). */
  function farmReward(kind, why) {
    const r = F.reward(S.farm, kind);
    save(); renderHeader();
    toast(`🌾 ${why}: +${r.coins} xu, +${r.fert} 🧪 phân bón cho nông trại`, 3200);
  }

  // Screen state that is not persisted
  const U = { tab: "today", vocab: { mode: "home" }, sentView: "today", stage: "Basic", scr: {}, sound: null, pair: null, bq: "", btopic: "", reset: false, rankBy: "week", boardErr: "", joinErr: "", joining: false, leaveAsk: false, joinMode: "new", showPin: false, farmFull: false };
  const inSession = () => U.tab === "words" && ["learn", "quiz", "review"].includes(U.vocab.mode);

  // ---------- Helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
  const bar = (f) => `<div class="bar"><i style="width:${Math.round(clamp(f || 0, [0, 1]) * 100)}%"></i></div>`;
  const ddmm = (s) => { const [, m, d] = s.split("-"); return `${d}/${m}`; };
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const I = {
    today: svg('<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>'),
    words: svg('<rect x="3" y="6" width="14" height="15" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v13"/>'),
    sent: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
    ipa: svg('<path d="M3 19 8 5l5 14"/><path d="M5 14h6"/><path d="M17 10v9"/><path d="M17 6.5v.01"/>'),
    rank: svg('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4"/>'),
    me: svg('<path d="M4 20V11"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M3 20h18"/>'),
    speak: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>'),
    rec: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
  };
  let toastT;
  function toast(msg, ms = 2400) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- Speech: read aloud, "Nói thử" scoring, record & play back ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let voices = [];
  function loadVoices() { try { voices = speechSynthesis.getVoices(); } catch (e) { voices = []; } }
  if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.addEventListener && speechSynthesis.addEventListener("voiceschanged", loadVoices); }
  function pickVoice(lang) {
    const L = (v) => v.lang.replace("_", "-");
    const same = voices.filter((v) => L(v) === lang);
    return same.find((v) => /natural|google|premium|enhanced/i.test(v.name)) || same[0] || voices.find((v) => L(v).startsWith("en"));
  }
  function say(text, opts = {}) {
    if (!("speechSynthesis" in window)) { toast("Thiết bị chưa hỗ trợ đọc to"); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/\s\/\s/g, ". "));
      u.lang = opts.lang || S.accent;
      u.rate = (opts.slow ? 0.6 : 1) * S.rate;
      const v = pickVoice(u.lang); if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { toast("Không đọc được câu này"); }
  }
  function tryPron(target, btn) {
    if (!SR) { toast("Chấm phát âm cần Chrome hoặc Edge"); return; }
    const r = new SR(); r.lang = S.accent; r.maxAlternatives = 3; r.interimResults = false;
    const label = btn.innerHTML; btn.disabled = true; btn.textContent = "Đang nghe…";
    r.onresult = (ev) => {
      const alts = Array.from(ev.results[0]).map((a) => a.transcript);
      const pct = Math.round(Math.max(...alts.map((a) => C.similarity(a, target))) * 100);
      const msg = pct >= 85 ? "Tuyệt vời!" : pct >= 60 ? "Khá tốt!" : "Thử lại nhé.";
      toast(`${msg} ${pct}% — máy nghe được: “${alts[0]}”`, 4500);
    };
    r.onerror = (ev) => toast(ev.error === "not-allowed" ? "Hãy cho phép dùng micro" : ev.error === "network" ? "Chấm phát âm cần kết nối mạng" : "Chưa nghe rõ, thử lại nhé");
    r.onend = () => { btn.disabled = false; btn.innerHTML = label; };
    try { r.start(); } catch (e) { r.onend(); }
  }
  let rec = null;
  async function toggleRec(btn) {
    if (rec) { rec.stop(); return; }
    if (!canRec) { toast("Thiết bị chưa hỗ trợ ghi âm"); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { toast("Không mở được micro"); return; }
    const label = btn.innerHTML, chunks = [], mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      rec = null; btn.innerHTML = label; btn.classList.remove("primary");
      const audio = new Audio(URL.createObjectURL(new Blob(chunks, { type: mr.mimeType })));
      audio.play().catch(() => {});
      toast("Đang phát lại giọng của bạn");
    };
    mr.start(); rec = mr;
    btn.innerHTML = "■ Dừng"; btn.classList.add("primary");
    setTimeout(() => { if (rec === mr) mr.stop(); }, 10000);
  }
  const speechBtns = (text) =>
    (SR ? `<button class="btn sm" data-try="${esc(text)}">${I.mic} Nói thử</button>` : "") +
    (canRec ? `<button class="btn sm ghost" data-rec>${I.rec} Ghi âm</button>` : "");
  const sayBtns = (text, label = "Nghe") =>
    `<button class="btn sm" data-say="${esc(text)}">${I.speak} ${label}</button><button class="btn sm ghost" data-say="${esc(text)}" data-slow>Chậm</button>`;

  // ---------- Custom pictures (IndexedDB) ----------
  let PICS = {};
  const DB = {
    db: null,
    open() {
      return new Promise((res) => {
        try {
          const r = indexedDB.open("nhip-pics", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("pics");
          r.onsuccess = () => res((this.db = r.result));
          r.onerror = () => res(null);
        } catch (e) { res(null); }
      });
    },
    tx(mode, fn) {
      return new Promise((res) => {
        if (!this.db) { res(null); return; }
        try {
          const t = this.db.transaction("pics", mode), st = t.objectStore("pics"), out = fn(st);
          t.oncomplete = () => res(out && out.result); t.onerror = () => res(null);
        } catch (e) { res(null); }
      });
    },
    async loadAll() {
      await this.open();
      const [keys, vals] = await Promise.all([this.tx("readonly", (s) => s.getAllKeys()), this.tx("readonly", (s) => s.getAll())]);
      const out = {};
      (keys || []).forEach((k, i) => { const p = cleanPic(vals[i]); if (p) out[k] = p; });
      return out;
    },
    put(k, v) { return this.tx("readwrite", (s) => s.put(v, k)); },
    del(k) { return this.tx("readwrite", (s) => s.delete(k)); },
  };
  function cleanPic(p) {
    if (!p || typeof p !== "object") return null;
    return { emo: typeof p.emo === "string" ? p.emo.slice(0, 16) : "", bg: /^#[0-9a-f]{3,8}$/i.test(p.bg || "") ? p.bg : "",
      img: typeof p.img === "string" && p.img.startsWith("data:image/") ? p.img : "" };
  }
  const picHTML = (p, emo, cls = "") =>
    `<div class="pic ${cls}"${p.bg ? ` style="background:${p.bg}"` : ""}>${p.img ? `<img src="${p.img}" alt="">` : esc(p.emo || emo)}</div>`;
  const pic = (w, cls) => picHTML(PICS[w.key] || {}, w.emo, cls);

  // ---------- Shell ----------
  const TABS = [["today", "Hôm nay"], ["words", "Từ vựng"], ["sent", "Câu"], ["ipa", "IPA"], ["rank", "Xếp hạng"], ["me", "Tiến độ"]];
  function renderTabs() {
    $("#tabs").innerHTML = TABS.map(([id, label]) =>
      `<button type="button" data-tab="${id}"${U.tab === id ? ' aria-current="page"' : ""}>${I[id]}<span>${label}</span></button>`).join("");
  }
  function renderHeader() {
    document.querySelectorAll("[data-level]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.level === S.level)));
    const st = C.liveStreak(S.streak, today());
    farmBtn(gateNow());
    $("#streak").innerHTML = `<span title="Chuỗi ngày học liên tiếp">🔥 <span class="num">${st}</span> ngày</span><span class="xp muted num">· ${S.xp} XP</span>`;
  }
  const VIEWS = { today: vToday, words: vWords, sent: vSent, ipa: vIpa, rank: vRank, me: vMe, farm: vFarm };
  // A broken screen must never take the whole app down: show a recovery panel instead, data stays safe.
  function render() {
    try { $("#view").innerHTML = VIEWS[U.tab](); }
    catch (err) {
      console.error("render failed", err);
      $("#view").innerHTML = `<section class="panel stack"><h1>Ôi, màn hình này gặp lỗi 😅</h1><p>Dữ liệu học và nông trại của bạn vẫn an toàn.</p>
        <div class="row"><button type="button" class="btn primary" data-recover>Về trang Hôm nay</button><button type="button" class="btn" data-reload>Tải lại app</button></div></section>`;
    }
    try { renderTabs(); renderHeader(); } catch (err) { console.error("header failed", err); }
    document.body.classList.toggle("farm-wide", U.tab === "farm");
    if (U.tab === "farm") startFarmer();
    const sp = $("#spell-in"); if (sp) sp.focus({ preventScroll: true });
  }
  function go(tab) { if (tab !== "farm" && U.farmFull) setFarmFull(false, true); U.tab = tab; U.reset = false; render(); scrollTo(0, 0); }
  /** Farm full screen: hide the app header/tabs, and use the browser's full screen where it is allowed. */
  function setFarmFull(on, quiet) {
    U.farmFull = on;
    document.body.classList.toggle("farm-full", on);
    try {
      if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* not supported: the in-page full view still applies */ }
    if (!quiet) render();
  }
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && U.farmFull) setFarmFull(false); });
  function applyTheme() {
    if (S.theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", S.theme);
  }
  function farmBtn(g) {
    $("#farm-btn").setAttribute("aria-pressed", String(U.tab === "farm"));
    $("#coins").textContent = `🪙 ${S.farm.coins} · ${g.open ? `⏱ ${fmtLeft(g.budget)}` : "🔒"}`;
  }
  const back = (attr, label) => `<button class="btn ghost sm" ${attr}>${I.back} ${label}</button>`;

  // ---------- Hôm nay ----------
  function vToday() {
    const t = today(), p = prog(), words = WORDS[S.level];
    const learnedToday = Object.values(p).filter((c) => c.added === t).length;
    const due = C.dueKeys(p, t).length;
    const remaining = words.length - Object.keys(p).length;
    const days = C.planDays(remaining, S.perday);
    const sentToday = (S.days[t] && S.days[t].s) || 0;
    const hour = new Date().getHours();
    const hi = hour < 11 ? "Chào buổi sáng!" : hour < 18 ? "Chào buổi chiều!" : "Chào buổi tối!";
    const plan = remaining > 0
      ? `Với <b>${S.perday}</b> từ/ngày, bạn học hết <b>${remaining}</b> từ còn lại của ${LEVELS[S.level]} trong ~${days} ngày (khoảng ${ddmm(C.addDays(t, days))}).`
      : `Bạn đã học hết từ của ${LEVELS[S.level]} 🎉 Giờ chỉ cần ôn đều mỗi ngày.`;
    const wd = new Date().getDay();
    return `
    <section class="hello"><div><p class="label">${LEVELS[S.level]} · ${WEEKDAYS[wd]}</p><h1>Hôm nay, ${ddmm(t)}</h1></div>
      <p class="muted">${hi} ${learnedToday >= S.perday && due === 0 ? "Bạn đã xong mục tiêu hôm nay." : "Mỗi ngày một chút là đủ."}</p></section>
    <div class="grid g3">
      <section class="panel goal${learnedToday >= S.perday ? " done" : ""}"><p class="label">Từ mới</p>
        <p class="big">${learnedToday}<small> / ${S.perday}</small></p>${bar(learnedToday / S.perday)}
        <button class="btn primary" data-go="learn">${learnedToday >= S.perday ? "Học thêm" : "Học từ mới"}</button></section>
      <section class="panel goal${due === 0 ? " done" : ""}"><p class="label">Cần ôn</p>
        <p class="big">${due}<small> từ</small></p><p class="small muted">${due ? "Ôn đúng hạn giúp nhớ lâu." : "Không có từ nào đến hạn."}</p>
        <button class="btn" data-go="review"${due ? "" : " disabled"}>Ôn tập</button></section>
      <section class="panel goal${sentToday >= S.sentPerDay ? " done" : ""}"><p class="label">Câu giao tiếp</p>
        <p class="big">${sentToday}<small> / ${S.sentPerDay}</small></p>${bar(sentToday / S.sentPerDay)}
        <button class="btn" data-go="sent">Luyện câu</button></section>
    </div>
    <div class="grid g2">
      <section class="panel stack"><div class="row" style="justify-content:space-between"><h2>7 ngày qua</h2><span class="chip">Kỷ lục ${S.streak.best || 0} ngày</span></div>${week()}</section>
      <section class="panel stack"><h2>Mục tiêu mỗi ngày</h2>
        <div class="row">${stepper("perday", S.perday)}<span>từ mới mỗi ngày</span></div>
        <p>${plan}</p></section>
    </div>
    <section class="panel row" style="justify-content:space-between"><div><p class="label">Nông trại</p>
      <p>🪙 <b class="num">${S.farm.coins}</b> xu · 🧪 ${S.farm.fert} phân bón · ${S.farm.plots.filter((x) => F.plotReady(x, Date.now())).length} ô đã chín</p>
      <p class="small muted">${(() => { const g = gateNow(); return g.open ? `⏱ Còn ${fmtLeft(g.budget)} phút chơi` : g.study < F.GATE.MIN_STUDY ? `🔒 Học thêm ${Math.ceil(g.need / F.MIN)} phút để mở nông trại` : "⏰ Hết giờ chơi — học thêm để chơi tiếp"; })()}</p></div>
      <button class="btn" data-farm>Vào nông trại 🌾</button></section>
    ${NET.configured ? (() => {
      const r = myRank("week");
      return `<section class="panel row" style="justify-content:space-between"><div><p class="label">Xếp hạng lớp</p>
        <p>${!S.online ? "Tham gia lớp để thi đua cùng bạn bè 🏆" : r ? `🏆 Bạn đứng thứ <b>${r.me.rank}/${r.list.length}</b> tuần này (${r.me.value} XP)` : "Mở bảng xếp hạng để xem thứ hạng của bạn"}</p></div>
        <button class="btn" data-tab="rank">Xem bảng xếp hạng</button></section>`;
    })() : ""}`;
  }
  const stepper = (id, v) => `<div class="stepper"><button type="button" data-step="${id}" data-d="-1" aria-label="Giảm">−</button><output id="${id}">${v}</output><button type="button" data-step="${id}" data-d="1" aria-label="Tăng">+</button></div>`;
  function week() {
    const t = today(), list = [];
    for (let i = 6; i >= 0; i--) { const d = C.addDays(t, -i); list.push([d, (S.days[d] && S.days[d].xp) || 0]); }
    const max = Math.max(50, ...list.map((x) => x[1]));
    return `<div class="week">${list.map(([d, xp]) => {
      const wd = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)).getDay();
      return `<div title="${ddmm(d)}: ${xp} XP"><i class="${xp ? "on" : ""}${d === t ? " today" : ""}" style="height:${xp ? Math.round(Math.max(6, (xp / max) * 60)) : 4}px"></i><span>${WD_SHORT[wd]}</span></div>`;
    }).join("")}</div>`;
  }

  // ---------- Từ vựng ----------
  function vWords() {
    const m = U.vocab.mode;
    return m === "learn" ? vLearn() : m === "quiz" ? vQuiz() : m === "result" ? vResult() : m === "review" ? vReview() : m === "browse" ? vBrowse() : vWordsHome();
  }
  function vWordsHome() {
    const p = prog(), due = C.dueKeys(p, today()).length, topics = D.levels[S.level];
    const learned = Object.keys(p).length, total = WORDS[S.level].length;
    return `
    <section class="hello"><div><p class="label">${LEVELS[S.level]} · ${learned}/${total} từ</p><h1>Từ vựng</h1></div></section>
    <div class="grid g3">
      <section class="panel stack"><h3>Học từ mới</h3><p class="small muted">Mỗi lượt ${C.BATCH} từ: xem thẻ, nghe, rồi làm bài kiểm tra nhanh.</p>
        <button class="btn primary" data-vocab="learn">Học ${C.BATCH} từ mới</button></section>
      <section class="panel stack"><h3>Ôn tập</h3><p class="small muted">${due ? `${due} từ đến hạn ôn hôm nay.` : "Chưa có từ nào đến hạn."}</p>
        <button class="btn" data-vocab="review"${due ? "" : " disabled"}>Ôn ${due} từ</button></section>
      <section class="panel stack"><h3>Tra cứu & đổi hình</h3><p class="small muted">Tìm từ, nghe lại, tự chọn emoji, vẽ hoặc dùng ảnh riêng.</p>
        <button class="btn" data-vocab="browse">Mở từ điển</button></section>
    </div>
    <section class="panel stack"><h2>Chủ đề</h2><div class="grid g2">${topics.map((t, i) => {
      const n = t.words.filter((w) => p[`${w[0]}|${w[1]}`]).length;
      return `<div class="topic"><div class="topic-head"><b>${esc(t.en)}</b><span class="small muted num">${n}/${t.words.length}</span></div>
        <span class="small muted">${esc(t.vi)}</span>${bar(n / t.words.length)}
        ${n < t.words.length ? `<div><button class="btn sm" data-learntopic="${i}">Học chủ đề này</button></div>` : `<span class="chip good">✓ Đã học hết</span>`}</div>`;
    }).join("")}</div></section>`;
  }
  function hlEx(w) {
    const base = w.w.length > 3 ? w.w.replace(/[ey]$/i, "") : w.w;
    const re = new RegExp(`\\b(${esc(base).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z]*)`, "i");
    return esc(w.ex).replace(re, '<mark class="hl">$1</mark>');
  }
  function card(w, reveal) {
    return `<article class="card">
      <div class="pic-wrap">${pic(w)}<button class="btn icon-btn edit-pic" data-editpic="${esc(w.key)}" aria-label="Đổi hình">${I.edit}</button></div>
      <div class="body">
        <div class="row"><span class="word">${esc(w.w)}</span><span class="pos">${POS[w.pos] || esc(w.pos)}</span></div>
        <div class="row"><span class="ipa muted">/${esc(w.ipa)}/</span>${sayBtns(w.w)}</div>
        ${reveal ? `<p class="meaning">${esc(w.vi)}</p>
        <p class="example">${hlEx(w)} <button class="btn sm ghost" data-say="${esc(w.ex)}" aria-label="Nghe câu ví dụ">${I.speak}</button></p>` : ""}
        <div class="row">${speechBtns(w.w)}</div>
      </div></article>`;
  }
  function startLearn(topic) {
    const words = C.nextNew(WORDS[S.level], prog(), C.BATCH, topic);
    if (!words.length) { toast(`Bạn đã học hết từ của ${LEVELS[S.level]} 🎉`); return; }
    U.vocab = { mode: "learn", words, i: 0 };
    go("words");
    say(words[0].w);
  }
  function vLearn() {
    const { words, i } = U.vocab, w = words[i], last = i === words.length - 1;
    return `<div class="row" style="justify-content:space-between">${back('data-vocab="home"', "Từ vựng")}
      <div class="dots" aria-label="Thẻ ${i + 1}/${words.length}">${words.map((_, j) => `<i class="${j < i ? "on" : j === i ? "cur" : ""}"></i>`).join("")}</div></div>
      <h1>Học từ mới</h1>
      ${card(w, true)}
      <div class="row" style="justify-content:space-between">
        <button class="btn" data-learnstep="-1"${i === 0 ? " disabled" : ""}>← Trước</button>
        ${last ? `<button class="btn primary" data-startquiz>Kiểm tra nhanh →</button>` : `<button class="btn primary" data-learnstep="1">Tiếp →</button>`}
      </div>`;
  }
  function startQuiz() {
    const { words } = U.vocab, t = today(), p = prog();
    let added = 0;
    for (const w of words) if (!p[w.key]) { p[w.key] = C.newCard(t); added++; }
    bump("w", added);
    if (added) addXP(XP.learn * added); else save();
    if (Object.values(p).filter((c) => c.added === t).length >= S.perday && S.farm.goalDay !== t) {
      S.farm.goalDay = t; farmReward("goal", "Đạt mục tiêu từ mới hôm nay 🎯");
    }
    U.vocab = { mode: "quiz", words, qs: C.makeQuiz(words, WORDS[S.level]), i: 0, right: 0, answered: null };
    render(); scrollTo(0, 0);
  }
  function vQuiz() {
    const v = U.vocab, q = v.qs[v.i], w = q.word, done = v.answered != null, last = v.i === v.qs.length - 1;
    const ok = done && v.answered === true;
    let prompt, answers;
    if (q.type === "meaning") {
      prompt = `<p class="label">Từ này nghĩa là gì?</p><div class="row"><span class="word">${esc(w.w)}</span><span class="ipa muted">/${esc(w.ipa)}/</span>
        <button class="btn icon-btn ghost" data-say="${esc(w.w)}" aria-label="Nghe">${I.speak}</button></div>`;
    } else if (q.type === "word") {
      prompt = `<p class="label">Từ nào có nghĩa là</p><p class="meaning">${esc(w.vi)}</p>`;
    } else {
      prompt = `<p class="label">Nghe rồi viết lại từ</p><div class="row"><p class="meaning">${esc(w.vi)}</p>
        <button class="btn sm" data-say="${esc(w.w)}">${I.speak} Nghe</button></div>`;
    }
    if (q.type === "spell") {
      answers = done ? `<p class="word">${esc(w.w)}</p>` :
        `<form data-spellform class="row"><input type="text" id="spell-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Gõ từ tiếng Anh…" style="flex:1" aria-label="Từ tiếng Anh"><button class="btn primary">Kiểm tra</button></form>`;
    } else {
      answers = `<div class="choices">${q.choices.map((c, j) => {
        const cls = done ? (j === q.answer ? " right" : j === v.picked ? " wrong" : "") : "";
        return `<button class="choice${cls}" data-choice="${j}"${done ? " disabled" : ""}>${esc(c)}</button>`;
      }).join("")}</div>`;
    }
    const fb = !done ? "" : `<p class="feedback ${ok ? "ok" : "no"}">${ok ? `Chính xác! +${XP.quiz} XP` : `Chưa đúng — đáp án: <b>${esc(q.type === "meaning" ? w.vi : w.w)}</b>`}</p>
      <div><button class="btn primary" data-quiznext>${last ? "Xem kết quả" : "Câu tiếp →"}</button></div>`;
    return `<div class="row" style="justify-content:space-between">${back('data-vocab="home"', "Từ vựng")}<span class="chip num">Câu ${v.i + 1}/${v.qs.length}</span></div>
      <h1>Kiểm tra nhanh</h1>
      <section class="panel stack">${prompt}${answers}${fb}</section>`;
  }
  function answerQuiz(correct, picked) {
    const v = U.vocab; if (v.answered != null) return;
    v.answered = correct; v.picked = picked;
    if (correct) { v.right++; addXP(XP.quiz); }
    render();
    if (!correct) say(v.qs[v.i].word.w);
  }
  function vResult() {
    const v = U.vocab;
    return `<h1>Xong lượt học!</h1>
      <section class="panel stack"><p class="score">${v.right}/${v.qs.length} câu đúng</p>
        <p class="muted">Các từ này sẽ quay lại trong phần Ôn tập vào ngày mai.</p>
        <div class="list">${v.words.map((w) => `<div class="item">${pic(w, "sm")}<span class="t"><b>${esc(w.w)}</b> <span class="ipa small muted">/${esc(w.ipa)}/</span><br><span class="small muted">${esc(w.vi)}</span></span>
          <button class="btn icon-btn ghost" data-say="${esc(w.w)}" aria-label="Nghe">${I.speak}</button></div>`).join("")}</div>
        <div class="row"><button class="btn primary" data-vocab="learn">Học ${C.BATCH} từ tiếp</button><button class="btn" data-vocab="home">Về Từ vựng</button></div></section>`;
  }
  function startReview() {
    const queue = C.dueKeys(prog(), today()).map((k) => BYKEY[k]).filter(Boolean);
    if (!queue.length) { toast("Chưa có từ nào cần ôn"); return; }
    U.vocab = { mode: "review", queue, i: 0, reveal: false, done: 0, again: {} };
    go("words");
  }
  function vReview() {
    const v = U.vocab;
    if (v.i >= v.queue.length) {
      return `<h1>Ôn tập</h1><section class="panel stack"><p class="score">Đã ôn xong 🎉</p>
        <p class="muted">Bạn vừa ôn ${v.done} lượt từ. Hẹn gặp lại ở lượt ôn tiếp theo.</p>
        <div class="row"><button class="btn primary" data-vocab="home">Về Từ vựng</button><button class="btn" data-go="today">Hôm nay</button></div></section>`;
    }
    const w = v.queue[v.i], c = prog()[w.key];
    const nxt = (g) => { const n = C.grade(c, g, today()); return C.daysBetween(today(), n.due); };
    return `<div class="row" style="justify-content:space-between">${back('data-vocab="home"', "Từ vựng")}<span class="chip num">${v.i + 1}/${v.queue.length}</span></div>
      <h1>Ôn tập</h1>
      ${card(w, v.reveal)}
      ${v.reveal ? `<div class="grid g3" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
        ${[["0", "Quên"], ["1", "Khó"], ["2", "Nhớ"], ["3", "Dễ"]].map(([g, l]) =>
          `<button class="btn${g === "2" ? " primary" : ""}" data-grade="${g}">${l} <span class="small" style="opacity:.75">· ${nxt(+g)} ngày</span></button>`).join("")}</div>`
        : `<div><button class="btn primary" data-reveal>Hiện nghĩa</button> <span class="small muted">Hãy nhớ nghĩa trước khi lật thẻ.</span></div>`}`;
  }
  function gradeReview(g) {
    const v = U.vocab, w = v.queue[v.i], p = prog();
    p[w.key] = C.grade(p[w.key], g, today());
    bump("r"); v.done++;
    addXP(XP.review);
    if (g === 0 && !v.again[w.key]) { v.again[w.key] = 1; v.queue.push(w); }
    v.i++; v.reveal = false;
    render();
    if (v.i >= v.queue.length && !v.rewarded) { v.rewarded = true; farmReward("review", "Ôn tập xong"); }
  }
  function vBrowse() {
    const topics = D.levels[S.level];
    return `<div class="row">${back('data-vocab="home"', "Từ vựng")}</div><h1>Tra cứu từ</h1>
      <section class="panel stack">
        <div class="row"><input type="search" id="bq" placeholder="Tìm từ hoặc nghĩa…" value="${esc(U.bq)}" style="flex:1 1 200px" aria-label="Tìm từ">
          <select id="btopic" aria-label="Chủ đề" style="flex:1 1 160px"><option value="">Tất cả chủ đề</option>${topics.map((t, i) =>
            `<option value="${i}"${String(i) === U.btopic ? " selected" : ""}>${esc(t.vi)}</option>`).join("")}</select></div>
        <div class="list" id="blist">${browseList()}</div>
      </section>`;
  }
  function browseList() {
    const q = C.norm(U.bq), p = prog();
    const all = WORDS[S.level].filter((w) => (U.btopic === "" || String(w.topic) === U.btopic) &&
      (!q || C.norm(w.w).includes(q) || C.norm(w.vi).includes(q)));
    if (!all.length) return `<p class="muted">Không tìm thấy từ nào.</p>`;
    const LIMIT = 80;
    return all.slice(0, LIMIT).map((w) => {
      const c = p[w.key];
      const chip = !c ? `<span class="chip new">Mới</span>` : c.box >= C.MASTER_BOX ? `<span class="chip good">Thuộc</span>` : `<span class="chip warn">Hộp ${c.box}</span>`;
      return `<div class="item"><button class="linkish" data-open="${esc(w.key)}" style="grid-column:span 2">${pic(w, "sm")}<span class="t"><b>${esc(w.w)}</b> <span class="ipa small muted">/${esc(w.ipa)}/</span><br><span class="small muted">${esc(w.vi)}</span></span></button>
        <span style="display:flex;gap:6px;align-items:center">${chip}<button class="btn icon-btn ghost" data-say="${esc(w.w)}" aria-label="Nghe ${esc(w.w)}">${I.speak}</button></span></div>`;
    }).join("") + (all.length > LIMIT ? `<p class="small muted" style="padding-top:10px">Hiện ${LIMIT}/${all.length} từ — gõ để tìm nhanh hơn.</p>` : "");
  }

  // ---------- Modal: word detail + picture editor ----------
  let lastFocus = null;
  function sheet(html, label) {
    const m = $("#modal"), s = $("#sheet");
    if (m.hidden) lastFocus = document.activeElement;
    s.innerHTML = html; s.setAttribute("aria-label", label || "");
    m.hidden = false;
    const f = s.querySelector("button"); if (f) f.focus({ preventScroll: true });
  }
  function closeModal() {
    $("#modal").hidden = true; $("#sheet").innerHTML = ""; draft = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function openWord(key) {
    const w = BYKEY[key]; if (!w) return;
    const c = S.progress[w.lvl][w.key];
    sheet(`<div class="row" style="justify-content:space-between"><h2>${esc(w.w)} <span class="pos">${POS[w.pos] || ""}</span></h2>
        <button class="btn icon-btn ghost" data-close aria-label="Đóng">${I.x}</button></div>
      <div class="row" style="align-items:flex-start;gap:16px">${pic(w, "md")}
        <div class="stack" style="flex:1;min-width:0"><div class="row"><span class="ipa muted">/${esc(w.ipa)}/</span>${sayBtns(w.w)}</div>
          <p class="meaning">${esc(w.vi)}</p>
          <div class="row"><span class="chip">${esc(D.levels[w.lvl][w.topic].vi)}</span>${c ? `<span class="chip warn">Hộp ${c.box} · ôn ${ddmm(c.due)}</span>` : `<span class="chip new">Chưa học</span>`}</div></div></div>
      <p class="example">${hlEx(w)} <button class="btn sm ghost" data-say="${esc(w.ex)}" aria-label="Nghe câu ví dụ">${I.speak}</button></p>
      <div class="row">${speechBtns(w.w)}</div>
      <div class="row"><button class="btn primary" data-editpic="${esc(w.key)}">${I.edit} Đổi hình</button><button class="btn ghost" data-close>Đóng</button></div>`, w.w);
  }
  let draft = null;
  function openPicEditor(key) {
    const w = BYKEY[key]; if (!w) return;
    const cur = PICS[key] || {};
    draft = { key, emo: cur.emo || w.emo, bg: cur.bg || "", img: cur.img || "", mode: "emoji", pen: PENS[0] };
    renderEditor();
  }
  function renderEditor() {
    const w = BYKEY[draft.key], m = draft.mode;
    const emos = [w.emo, ...EMOJIS.filter((e) => e !== w.emo)];
    const body = m === "emoji"
      ? `<div class="emoji-grid">${emos.map((e) => `<button type="button" data-emo="${e}" aria-label="${e}">${e}</button>`).join("")}</div>
         <p class="label">Màu nền</p><div class="swatches">${SWATCHES.map((c) =>
           `<button type="button" data-bg="${c}" aria-pressed="${draft.bg === c}" style="background:${c || "var(--chip)"}" aria-label="${c || "Mặc định"}"></button>`).join("")}</div>`
      : m === "draw"
      ? `<canvas class="draw" width="320" height="320" aria-label="Khung vẽ"></canvas>
         <div class="row"><div class="swatches">${PENS.map((c) => `<button type="button" data-pen="${c}" aria-pressed="${draft.pen === c}" style="background:${c}" aria-label="Bút ${c}"></button>`).join("")}</div>
         <button type="button" class="btn sm" data-clearcanvas>Xoá hết</button></div>`
      : `<label class="btn" style="justify-self:start">Chọn ảnh từ máy…<input type="file" accept="image/*" id="photo-in" hidden></label>
         <p class="small muted">Ảnh được cắt vuông và thu nhỏ, chỉ lưu trên thiết bị này.</p>`;
    sheet(`<div class="row" style="justify-content:space-between"><h2>Hình cho “${esc(w.w)}”</h2>
        <button class="btn icon-btn ghost" data-close aria-label="Đóng">${I.x}</button></div>
      <div class="row" style="align-items:flex-start"><div id="pv">${picHTML(draft, w.emo, "md")}</div>
        <p class="small muted" style="flex:1 1 160px">Hình tự chọn giúp bạn nhớ từ lâu hơn. Chọn emoji và màu nền, tự vẽ, hoặc dùng ảnh của bạn.</p></div>
      <div class="seg" role="group" aria-label="Kiểu hình">${[["emoji", "Emoji"], ["draw", "Vẽ tay"], ["photo", "Ảnh"]].map(([id, l]) =>
        `<button type="button" data-mode="${id}" aria-pressed="${m === id}">${l}</button>`).join("")}</div>
      ${body}
      <div class="row"><button class="btn primary" data-savepic>Lưu hình</button><button class="btn" data-resetpic>Về hình gốc</button><button class="btn ghost" data-close>Huỷ</button></div>`, `Hình cho ${w.w}`);
    if (m === "draw") setupCanvas();
    const fi = $("#photo-in"); if (fi) fi.addEventListener("change", () => fi.files[0] && loadPhoto(fi.files[0]));
  }
  const updatePv = () => { const pv = $("#pv"); if (pv && draft) pv.innerHTML = picHTML(draft, BYKEY[draft.key].emo, "md"); };
  function setupCanvas() {
    const cv = $("#sheet canvas.draw"), ctx = cv.getContext("2d"), N = cv.width;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, N, N);
    if (draft.img) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, N, N); im.src = draft.img; }
    ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
    let last = null;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * N / r.width, (e.clientY - r.top) * N / r.height]; };
    const line = (a, b) => { ctx.strokeStyle = draft.pen; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    cv.addEventListener("pointerdown", (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); last = pt(e); line(last, [last[0] + 0.1, last[1]]); });
    cv.addEventListener("pointermove", (e) => { if (!last) return; const p = pt(e); line(last, p); last = p; });
    const end = () => { if (!last) return; last = null; draft.img = cv.toDataURL("image/png"); updatePv(); };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }
  function loadPhoto(file) {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const N = 320, cv = document.createElement("canvas"); cv.width = cv.height = N;
      const s = Math.min(im.width, im.height);
      cv.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, N, N);
      URL.revokeObjectURL(url);
      if (!draft) return;
      draft.img = cv.toDataURL("image/jpeg", 0.85); updatePv();
    };
    im.onerror = () => toast("Không đọc được ảnh này");
    im.src = url;
  }
  async function savePic(reset) {
    const { key } = draft, w = BYKEY[key];
    const p = cleanPic(draft);
    if (reset || (!p.img && !p.bg && p.emo === w.emo)) { delete PICS[key]; await DB.del(key); }
    else { PICS[key] = p; await DB.put(key, p); }
    closeModal(); render();
    toast(reset ? "Đã trả về hình gốc" : "Đã lưu hình" + (DB.db ? "" : " (chỉ trong phiên này)"));
  }

  // ---------- Câu giao tiếp ----------
  function todaySents(track) {
    const t = today();
    if (!S.sentDay || S.sentDay.date !== t) S.sentDay = { date: t };
    if (!S.sentDay[track]) {
      S.sentDay[track] = C.pickSentences(SENTS[track].map((s) => s.key), S.sent, S.sentPerDay);
      save();
    }
    return S.sentDay[track].map((k) => SENTS[track].find((s) => s.key === k)).filter(Boolean);
  }
  function vSent() {
    const track = S.track;
    const head = `<section class="hello"><div><p class="label">${TRACKS[track]} · ${Object.keys(S.sent).filter((k) => k.startsWith(track + ":")).length}/${SENTS[track].length} câu</p><h1>Câu giao tiếp</h1></div>
      <div class="row"><div class="seg" role="group" aria-label="Chủ đề câu">${Object.entries(TRACKS).map(([id, l]) => `<button type="button" data-track="${id}" aria-pressed="${track === id}">${l}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Chế độ">${[["today", "Hôm nay"], ["all", "Thư viện"]].map(([id, l]) => `<button type="button" data-sentview="${id}" aria-pressed="${U.sentView === id}">${l}</button>`).join("")}</div></div></section>`;
    if (U.sentView === "all") return head + library(track);
    const list = todaySents(track);
    return head + list.map(sentCard).join("") +
      `<section class="panel row" style="justify-content:space-between"><p class="muted">Muốn luyện thêm? Mỗi lần thêm ${S.sentPerDay} câu mới.</p><button class="btn" data-moresent>Thêm câu</button></section>`;
  }
  function sentCard(s) {
    const learned = !!S.sent[s.key], sc = U.scr[s.key];
    let scr = "";
    if (sc) {
      const full = sc.ans.length === sc.n, ok = full && sc.ans.map((x) => x.t).join(" ") === s.en;
      scr = `<div class="tiles" aria-label="Câu của bạn">${sc.ans.map((x, j) => `<button type="button" class="tile" data-unpick="${j}" data-k="${esc(s.key)}">${esc(x.t)}</button>`).join("")}</div>
        <div class="tiles" aria-label="Các từ">${sc.pool.map((x, j) => `<button type="button" class="tile" data-pick="${j}" data-k="${esc(s.key)}">${esc(x.t)}</button>`).join("")}</div>
        ${full ? (ok ? `<p class="feedback ok">Đúng rồi! 🎉</p>` : `<p class="feedback no">Chưa đúng — bấm vào từ ở trên để gỡ ra và xếp lại.</p>`) : ""}`;
    }
    return `<article class="panel sent">
      <div class="row" style="justify-content:space-between"><span class="chip">${TRACKS[s.track]} · ${esc(s.group)}</span><span class="chip${learned ? " good" : ""}">${learned ? "✓ Đã thuộc" : STAGES[s.stage]}</span></div>
      ${sc && !sc.solved ? "" : `<p class="en">${esc(s.en)}</p>`}
      <p class="vi">${esc(s.vi)}</p>
      ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
      ${scr}
      <div class="row">${sayBtns(s.en)}${speechBtns(s.en)}
        <button type="button" class="btn sm" data-scr="${esc(s.key)}">${sc ? "Xếp lại" : "Xếp câu"}</button>
        ${learned ? "" : `<button type="button" class="btn sm primary" data-learnsent="${esc(s.key)}">Đã thuộc +${XP.sent} XP</button>`}</div>
    </article>`;
  }
  const sentByKey = (k) => { const track = k.slice(0, k.indexOf(":")); return (SENTS[track] || []).find((s) => s.key === k); };
  function library(track) {
    const groups = D.sentences[track].map((g, gi) => ({ g, gi })).filter(({ g }) => g.stage === U.stage);
    return `<section class="panel stack"><div class="seg" role="group" aria-label="Trình độ">${Object.entries(STAGES).map(([id, l]) =>
      `<button type="button" data-stage="${id}" aria-pressed="${U.stage === id}">${l}</button>`).join("")}</div>
      <div>${groups.map(({ g, gi }) => {
        const items = SENTS[track].filter((s) => s.gi === gi), n = items.filter((s) => S.sent[s.key]).length;
        return `<details><summary>${esc(g.vi)} <span class="small muted">· ${esc(g.en)} · ${n}/${items.length}</span></summary><div class="list">${items.map((s) =>
          `<div class="item"><span class="chip${S.sent[s.key] ? " good" : ""}">${S.sent[s.key] ? "✓" : "·"}</span><span class="t"><b>${esc(s.en)}</b><br><span class="small muted">${esc(s.vi)}</span></span>
            <button class="btn icon-btn ghost" data-say="${esc(s.en)}" aria-label="Nghe">${I.speak}</button></div>`).join("")}</div></details>`;
      }).join("")}</div></section>`;
  }
  function startScramble(key) {
    const s = sentByKey(key); if (!s) return;
    const toks = C.tokens(s.en).map((t, i) => ({ t, i }));
    U.scr[key] = { n: toks.length, ans: [], pool: C.scramble(toks), solved: false };
    render();
  }
  function moveTile(key, from, j) {
    const sc = U.scr[key]; if (!sc || sc.solved) return;
    const [x] = sc[from].splice(j, 1);
    (from === "pool" ? sc.ans : sc.pool).push(x);
    if (sc.ans.length === sc.n && sc.ans.map((y) => y.t).join(" ") === sentByKey(key).en) {
      sc.solved = true; addXP(XP.scramble); say(sentByKey(key).en);
    }
    render();
  }

  // ---------- IPA ----------
  function vIpa() {
    const learned = new Set(S.ipa);
    return `<section class="hello"><div><p class="label">44 âm · ${learned.size}/44 đã học</p><h1>Bảng phiên âm IPA</h1></div>
        <p class="small muted">Ví dụ đọc bằng giọng Anh (UK). Từ vựng dùng giọng bạn chọn ở phần Tiến độ.</p></section>
      <section class="panel stack"><h2>Lộ trình gợi ý</h2><div class="path">${D.ipa.path.map((p, i) => {
        const n = p.sounds.filter((s) => learned.has(s)).length;
        return `<button type="button" data-ipastep="${i}"><b>${i + 1}. ${esc(p.vi)}</b><span class="small muted">${n}/${p.sounds.length} âm</span>${bar(n / p.sounds.length)}</button>`;
      }).join("")}</div></section>
      <div class="grid g2" style="align-items:start">
        <section class="panel stack">${D.ipa.groups.map((g) => `<h3>${esc(g.vi)} <span class="small muted">${esc(g.en)}</span></h3>
          <div class="ipa-grid">${SOUNDS.filter((s) => s.type === g.id).map((s) =>
            `<button type="button" class="snd${learned.has(s.s) ? " learned" : ""}" data-sound="${esc(s.s)}" aria-pressed="${U.sound === s.s}"><b class="ipa">${esc(s.s)}</b><span>${esc(s.vi)}</span></button>`).join("")}</div>`).join("")}</section>
        <section class="panel snd-detail" id="snd-detail" style="position:sticky;top:130px">${soundDetail()}</section>
      </div>`;
  }
  function soundDetail() {
    if (!U.sound) return `<p class="label">Chi tiết âm</p><p class="muted">Chọn một âm để xem cách đặt lưỡi – môi, nghe ví dụ và luyện cặp âm tối thiểu.</p>`;
    const s = SOUND[U.sound], learned = S.ipa.includes(s.s), g = D.ipa.groups.find((x) => x.id === s.type);
    return `<div class="row" style="justify-content:space-between"><span class="snd-sym">/${esc(s.s)}/</span><span class="chip">${esc(g.vi)}</span></div>
      <p><b>${esc(s.vi)}</b> — ${esc(s.tip)}</p>
      <p class="label">Ví dụ</p>
      <div class="ex-grid">${s.ex.map(([w, ipa]) => `<div class="ex"><div><b>${esc(w)}</b><br><span class="ipa small muted">/${esc(ipa)}/</span></div>
        <button type="button" class="btn icon-btn ghost" data-sayuk="${esc(w)}" aria-label="Nghe ${esc(w)}">${I.speak}</button></div>`).join("")}</div>
      <div class="row"><button type="button" class="btn" data-sayuk="${esc(s.ex.map((e) => e[0]).join(", "))}">${I.speak} Nghe cả ${s.ex.length} từ</button>
        <button type="button" class="btn${learned ? "" : " primary"}" data-ipalearn="${esc(s.s)}">${learned ? "✓ Đã học" : `Đánh dấu đã học +${XP.ipa} XP`}</button>
        ${s.pairs.length ? `<button type="button" class="btn" data-pairquiz="${esc(s.s)}">Luyện cặp âm</button>` : ""}</div>
      ${U.pair && U.pair.sym === s.s ? pairUI(s) : ""}`;
  }
  function startPair(sym) {
    const s = SOUND[sym], pr = s.pairs[Math.floor(Math.random() * s.pairs.length)];
    const prev = U.pair && U.pair.sym === sym ? U.pair : { right: 0, n: 0 };
    U.pair = { sym, pr, said: Math.random() < 0.5 ? 0 : 1, order: C.shuffle([0, 1]), picked: null, right: prev.right, n: prev.n };
    renderDetail();
    say(pr[U.pair.said], { lang: "en-GB" });
  }
  function pairUI(s) {
    const P = U.pair, done = P.picked != null, ok = done && P.picked === P.said;
    return `<div class="stack" style="border-top:1px dashed var(--rule);padding-top:12px">
      <div class="row" style="justify-content:space-between"><p class="label">Cặp âm tối thiểu</p><span class="chip num">${P.right}/${P.n} đúng</span></div>
      <div class="row"><span>Nghe và chọn từ bạn nghe được:</span><button type="button" class="btn sm" data-pairreplay>${I.speak} Nghe lại</button></div>
      <div class="choices">${P.order.map((j) => {
        const cls = done ? (j === P.said ? " right" : j === P.picked ? " wrong" : "") : "";
        const sym = j === 0 ? s.s : P.pr[2];
        return `<button type="button" class="choice${cls}" data-pairpick="${j}"${done ? " disabled" : ""}><b>${esc(P.pr[j])}</b>${sym ? ` <span class="ipa small muted">/${esc(sym)}/</span>` : ""}</button>`;
      }).join("")}</div>
      ${done ? `<p class="feedback ${ok ? "ok" : "no"}">${ok ? "Chính xác!" : `Chưa đúng — từ vừa đọc là “${esc(P.pr[P.said])}”.`}</p>
        <div><button type="button" class="btn primary" data-pairquiz="${esc(s.s)}">Cặp khác →</button></div>` : ""}</div>`;
  }
  function renderDetail() {
    const d = $("#snd-detail");
    if (!d) { render(); return; }
    d.innerHTML = soundDetail();
    document.querySelectorAll(".snd").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sound === U.sound)));
  }
  function pickSound(sym) {
    U.sound = sym; U.pair = null; renderDetail();
    if (matchMedia("(max-width: 900px)").matches) $("#snd-detail").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // ---------- Nông trại ----------
  const pad2 = (n) => String(n).padStart(2, "0");
  function fmtLeft(ms) {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}g ${pad2(m)}p` : `${m}:${pad2(s % 60)}`;
  }
  const fmtMin = (m) => (m >= 60 ? `${m / 60} giờ` : `${m} phút`);
  const sayEn = (en) => `<button type="button" class="btn icon-btn ghost" data-say="${esc(en)}" aria-label="Nghe “${esc(en)}”">${I.speak}</button>`;
  const itemName = (it) => `${esc(it.vi)} · <i>${esc(it.en)}</i>`;
  const timer = (end, dur) => `data-end="${end}" data-dur="${dur}"`;

  // Animated farm scene (inline SVG). Every animated group is drawn around its pivot at (0,0).
  const DECO_AT = { flowers: [[10, 294, 22], [36, 298, 22], [62, 294, 22]], tree: [[0, 252, 70]], dog: [[598, 296, 30]],
    well: [[372, 236, 34]], house: [[538, 200, 42]], tractor: [[430, 298, 40]] };
  const svgFarmer = () => `<g class="walk"><g class="flip">
    <ellipse cx="0" cy="47" rx="17" ry="4" fill="rgba(0,0,0,.18)"/>
    <g transform="translate(-5,14)"><g class="leg"><rect x="-3.5" y="0" width="7" height="28" rx="3.5" fill="#2F5BB7"/><rect x="-5" y="26" width="11" height="7" rx="3" fill="#6B3E1E"/></g></g>
    <g transform="translate(5,14)"><g class="leg b"><rect x="-3.5" y="0" width="7" height="28" rx="3.5" fill="#2F5BB7"/><rect x="-5" y="26" width="11" height="7" rx="3" fill="#6B3E1E"/></g></g>
    <g transform="translate(-11,-8) rotate(12)"><rect x="-3" y="0" width="6" height="20" rx="3" fill="#E5533D"/><circle cx="0" cy="21" r="3.6" fill="#FFD1A6"/></g>
    <rect x="-12" y="-15" width="24" height="31" rx="9" fill="#E5533D"/><path d="M-12 -6h24M-12 2h24M-4 -15v31M4 -15v31" stroke="#C23E2B" stroke-width="1.2" opacity=".6"/>
    <path d="M-11 2h22v12a5 5 0 0 1-5 5h-12a5 5 0 0 1-5-5z" fill="#3B6FD8"/><rect x="-7" y="-6" width="14" height="10" rx="2" fill="#3B6FD8"/>
    <path d="M-7 -6l-3-8M7 -6l3-8" stroke="#3B6FD8" stroke-width="3" stroke-linecap="round"/><circle cx="-5" cy="-3" r="1.5" fill="#FFD84D"/><circle cx="5" cy="-3" r="1.5" fill="#FFD84D"/>
    <circle cx="-12" cy="-26" r="3" fill="#F5BD8E"/><circle cx="12" cy="-26" r="3" fill="#F5BD8E"/><circle cx="0" cy="-26" r="12" fill="#FFD1A6"/>
    <circle cx="-4" cy="-27" r="1.7" fill="#3B2A14"/><circle cx="4" cy="-27" r="1.7" fill="#3B2A14"/><circle cx="-7.5" cy="-22" r="2.3" fill="#FF9E9E" opacity=".7"/><circle cx="7.5" cy="-22" r="2.3" fill="#FF9E9E" opacity=".7"/>
    <path d="M-5 -20q5 5 10 0" stroke="#3B2A14" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="0" cy="-35" rx="21" ry="5" fill="#E2A93B"/><path d="M-11 -35q0-14 11-14q11 0 11 14z" fill="#F2C14E"/><rect x="-11" y="-39" width="22" height="3.5" fill="#D9443A"/>
    <g transform="translate(11,-8)"><g class="wave"><rect x="-3" y="0" width="6" height="20" rx="3" fill="#E5533D"/><circle cx="0" cy="21" r="3.6" fill="#FFD1A6"/></g></g>
  </g></g>`;
  const svgChicken = (d) => `<ellipse cx="0" cy="17" rx="13" ry="3" fill="rgba(0,0,0,.15)"/>
    <path d="M-3 9v8M4 9v8" stroke="#F5A623" stroke-width="2.5" stroke-linecap="round"/><path d="M-12 -4l-9-9l3 13z" fill="#fff" stroke="#E8DCC8"/>
    <ellipse cx="0" cy="0" rx="14" ry="11" fill="#fff" stroke="#E8DCC8" stroke-width="1.5"/><path d="M-7 -1q5 7 11 0" fill="none" stroke="#E8DCC8" stroke-width="2"/>
    <g transform="translate(8,-6)"><g class="peck" style="animation-delay:${d}s"><circle cx="3" cy="-6" r="7" fill="#fff" stroke="#E8DCC8" stroke-width="1.5"/>
      <path d="M0 -12q1.5-5 3 0q1.5-5 3 0q1.5-5 3 0z" fill="#E74C3C"/><path d="M9 -7l6 2l-6 2z" fill="#F5A623"/><circle cx="5" cy="-8" r="1.4" fill="#222"/><path d="M8 -3q3 3 0 5" fill="#E74C3C"/></g></g>`;
  const svgCow = (d) => `<ellipse cx="0" cy="27" rx="30" ry="4" fill="rgba(0,0,0,.15)"/>
    ${[-22, -12, 8, 18].map((x) => `<rect x="${x}" y="6" width="7" height="20" fill="#fff" stroke="#333" stroke-width="1.4"/><rect x="${x}" y="22" width="7" height="4" fill="#333"/>`).join("")}
    <g transform="translate(-29,-8)"><g class="tail" style="animation-delay:${d}s"><path d="M0 0q-7 10-3 20" stroke="#333" stroke-width="2.5" fill="none"/><circle cx="-3" cy="21" r="3" fill="#333"/></g></g>
    <rect x="-30" y="-17" width="56" height="28" rx="13" fill="#fff" stroke="#333" stroke-width="1.8"/>
    <path d="M-20 -16q11 6 4 16q-12 2-12-10z" fill="#333"/><ellipse cx="9" cy="-3" rx="7" ry="5" fill="#333"/><ellipse cx="6" cy="11" rx="6" ry="3" fill="#F7B6C2"/>
    <g transform="translate(22,-10)"><g class="chew" style="animation-delay:${d}s">
      <path d="M3 -13q-4-6 1-9M15 -13q4-6-1-9" stroke="#E8D9B5" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="-2" cy="-8" rx="5" ry="3" fill="#fff" stroke="#333"/><ellipse cx="20" cy="-8" rx="5" ry="3" fill="#fff" stroke="#333"/>
      <rect x="1" y="-13" width="16" height="20" rx="7" fill="#fff" stroke="#333" stroke-width="1.6"/><circle cx="6" cy="-5" r="1.6" fill="#222"/><circle cx="12" cy="-5" r="1.6" fill="#222"/>
      <ellipse cx="9" cy="6" rx="9" ry="6" fill="#F7B6C2" stroke="#333" stroke-width="1.4"/><circle cx="6" cy="6" r="1.2" fill="#9B4F5D"/><circle cx="12" cy="6" r="1.2" fill="#9B4F5D"/></g></g>`;
  const svgSheep = (d) => `<ellipse cx="0" cy="19" rx="18" ry="3" fill="rgba(0,0,0,.15)"/><g class="hop" style="animation-delay:${d}s">
    <rect x="-10" y="6" width="4" height="12" rx="2" fill="#3B2A14"/><rect x="5" y="6" width="4" height="12" rx="2" fill="#3B2A14"/>
    ${[[-10, -2, 9], [0, -7, 10], [10, -2, 9], [-4, 4, 9], [6, 4, 9]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#E6E1D8" stroke-width="1.5"/>`).join("")}
    <ellipse cx="17" cy="-6" rx="7" ry="8" fill="#3B2A14"/><ellipse cx="11" cy="-10" rx="4" ry="2" fill="#3B2A14"/><circle cx="19" cy="-8" r="1.5" fill="#fff"/></g>`;
  const svgHive = (d) => `<ellipse cx="0" cy="2" rx="18" ry="3" fill="rgba(0,0,0,.15)"/>
    <path d="M-16 0q0-34 16-34q16 0 16 34z" fill="#F5B942" stroke="#C98A1B" stroke-width="2"/><path d="M-15 -10h30M-12 -21h24" stroke="#C98A1B" stroke-width="2"/>
    <ellipse cx="0" cy="-5" rx="4.5" ry="3.5" fill="#6B3E1E"/>
    <g transform="translate(0,-20)"><g class="orbit" style="animation-delay:${d}s"><text x="22" y="5" font-size="13">🐝</text></g></g>`;
  const svgPig = (d) => `<ellipse cx="0" cy="21" rx="24" ry="3.5" fill="rgba(0,0,0,.15)"/>
    ${[-15, -6, 6, 14].map((x) => `<rect x="${x}" y="6" width="6" height="14" rx="2" fill="#F4A6B5"/>`).join("")}
    <g transform="translate(-22,-4)"><g class="tail" style="animation-delay:${d}s"><path d="M0 0q-7-3-4-8q3-3 4 1" stroke="#E88A9E" stroke-width="2.2" fill="none" stroke-linecap="round"/></g></g>
    <ellipse cx="0" cy="-2" rx="23" ry="15" fill="#F7B6C2" stroke="#E88A9E" stroke-width="1.5"/><ellipse cx="-6" cy="-8" rx="7" ry="3" fill="#FFD1DA" opacity=".8"/>
    <g transform="translate(16,-6)"><g class="chew" style="animation-delay:${d}s"><path d="M0 -9l4-10l7 8z" fill="#F4A6B5" stroke="#E88A9E"/>
      <circle cx="6" cy="0" r="11" fill="#F7B6C2" stroke="#E88A9E" stroke-width="1.5"/><ellipse cx="15" cy="3" rx="5.5" ry="4.5" fill="#F4A6B5" stroke="#E88A9E"/>
      <circle cx="13.5" cy="3" r="1.1" fill="#B05A6E"/><circle cx="16.5" cy="3" r="1.1" fill="#B05A6E"/><circle cx="8" cy="-3" r="1.7" fill="#222"/><circle cx="3" cy="3" r="2.2" fill="#FF9EB0" opacity=".7"/></g></g>`;
  const ANIMAL_SVG = { chicken: svgChicken, cow: svgCow, pig: svgPig, sheep: svgSheep, bee: svgHive };
  const cloud = (x, y, s, dur, delay) => `<g transform="translate(${x},${y}) scale(${s})"><g class="cloud" style="animation-duration:${dur}s;animation-delay:${delay}s;--x:${x}px">
    <g fill="#fff"><ellipse cx="0" cy="0" rx="34" ry="13"/><ellipse cx="-16" cy="-6" rx="16" ry="12"/><ellipse cx="12" cy="-10" rx="18" ry="14"/></g></g></g>`;

  // Spirit beast aura colours (from the zodiac art) — used by cards, sky spirits and the blessing effect.
  const AURA = { rat: "#B266FF", ox: "#FF7A1A", tiger: "#FF9D2E", cat: "#A9C8FF", dragon: "#6FD0FF", snake: "#5BE36E",
    horse: "#FF5A2E", goat: "#4FC3FF", monkey: "#FFE14D", rooster: "#FF4D4D", dog: "#FFB066", pig: "#D9A066" };
  const STORM = new Set(["dragon", "monkey"]);

  function farmScene(f, locked) {
    const has = (id) => f.deco.includes(id);
    const items = [];
    for (const id of f.deco) for (const [x, y, sz] of DECO_AT[id] || []) items.push([y, `<text x="${x}" y="${y}" font-size="${sz}">${F.DECO[id].emo}</text>`]);
    items.sort((a, b) => a[0] - b[0]);
    const spirits = F.BEASTS.filter((b) => f.beasts[b.id] && BIMG[b.id]).map((b, k) => {
      const x = 200 + (k % 6) * 72, y = 44 + Math.floor(k / 6) * 54 + (k % 2) * 12;
      return `<g transform="translate(${x},${y})"><g class="spirit" style="animation-delay:${-(k * 0.8).toFixed(1)}s">
        <circle r="27" fill="${AURA[b.id]}" class="sglow"/><image href="${BIMG[b.id]}" x="-21" y="-21" width="42" height="42" preserveAspectRatio="xMidYMin slice" clip-path="url(#bclip)"/>
        <circle r="21" fill="none" stroke="#fff" stroke-width="2.5"/></g></g>`;
    }).join("");
    const rainbow = has("rainbow") ? `<g fill="none" stroke-width="9" opacity=".75">${["#FF6B6B", "#FFB347", "#FFE66D", "#7ED957", "#5DADE2", "#A569BD"].map((c, i) =>
      `<path d="M${140 + i * 9} 200A${200 - i * 9} ${200 - i * 9} 0 0 1 ${540 - i * 9} 200" stroke="${c}"/>`).join("")}</g>` : "";
    const fence = has("fence") ? `<g fill="#C98A4B"><rect x="170" y="207" width="440" height="5" rx="2"/><rect x="170" y="219" width="440" height="5" rx="2"/>
      ${Array.from({ length: 13 }, (_, i) => `<rect x="${172 + i * 35}" y="199" width="7" height="30" rx="2"/>`).join("")}</g>` : "";
    // Wide screens get a wider stage (nothing cropped); phones keep the 800-wide stage, cropped at the sides.
    const wide = innerWidth >= 1000;
    const sides = wide ? `<text x="-232" y="252" font-size="66">🌲</text><text x="-150" y="266" font-size="48">🌳</text><text x="-60" y="232" font-size="30">🌼</text>
      <text x="905" y="254" font-size="62">🌳</text><text x="985" y="266" font-size="46">🌲</text><text x="840" y="236" font-size="28">🌻</text>` : "";
    return `<svg class="scene${wide ? " wide" : ""}" viewBox="${wide ? "-250 0 1300 300" : "0 0 800 300"}" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Cảnh nông trại">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6CCBFF"/><stop offset="1" stop-color="#D4F3FF"/></linearGradient>
        <clipPath id="bclip"><circle r="21"/></clipPath></defs>
      <rect x="-300" width="1400" height="300" fill="url(#sky)"/>
      <g transform="translate(745,50)"><g class="rays">${Array.from({ length: 10 }, (_, i) => `<rect x="-3" y="-42" width="6" height="13" rx="3" fill="#FFC83D" transform="rotate(${i * 36})"/>`).join("")}</g>
        <circle r="24" fill="#FFD84D" stroke="#FFC83D" stroke-width="3"/><circle cx="-8" cy="-3" r="2.4" fill="#7A4514"/><circle cx="8" cy="-3" r="2.4" fill="#7A4514"/>
        <path d="M-8 7q8 7 16 0" stroke="#7A4514" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
      ${cloud(140, 52, 1, 80, -10)}${cloud(430, 34, 1.3, 110, -60)}${cloud(620, 92, .8, 95, -35)}
      <g transform="translate(0,64)"><g class="bird"><path d="M0 0q6-6 12 0q6-6 12 0" stroke="#3B4A5A" stroke-width="2.2" fill="none"/><path d="M30 12q5-5 10 0q5-5 10 0" stroke="#3B4A5A" stroke-width="2" fill="none"/></g></g>
      ${rainbow}${spirits}
      <path d="M-300 168Q-150 128 0 176Q120 118 260 160T520 150T800 158T1100 150V300H-300Z" fill="#A6E07A"/>
      <g transform="translate(610,96)"><path d="M-6 52L75 0L156 52Z" fill="#9E2B25"/><rect x="6" y="48" width="138" height="62" fill="#D9443A"/>
        <rect x="6" y="48" width="138" height="5" fill="#fff" opacity=".85"/><rect x="48" y="62" width="54" height="48" fill="#fff"/><rect x="52" y="66" width="46" height="44" fill="#B83229"/>
        <path d="M52 66L98 110M98 66L52 110" stroke="#fff" stroke-width="4"/><rect x="61" y="20" width="28" height="22" fill="#fff"/><rect x="64" y="23" width="22" height="16" fill="#8FD8FF"/></g>
      <g transform="translate(110,206)"><path d="M-18 0L-10 -100L10 -100L18 0Z" fill="#F3E2C3" stroke="#C9A877" stroke-width="2"/><rect x="-6" y="-26" width="12" height="26" rx="6" fill="#8B5A2B"/>
        <g transform="translate(0,-100)"><g class="blades">${[0, 90, 180, 270].map((r) => `<g transform="rotate(${r})"><rect x="-5" y="-60" width="10" height="55" rx="2" fill="#fff" stroke="#C9A877" stroke-width="1.5"/>
          <path d="M-5 -45h10M-5 -30h10M-5 -15h10" stroke="#C9A877" stroke-width="1.2"/></g>`).join("")}<circle r="7" fill="#D9443A" stroke="#fff" stroke-width="2"/></g></g></g>
      <path d="M-300 204Q-150 194 0 206Q200 188 420 204T800 200T1100 202V300H-300Z" fill="#74C54F"/>
      <path d="M-300 274Q400 250 1100 274V300H-300Z" fill="#D9B98A"/><path d="M-300 288Q400 264 1100 288" stroke="#fff" stroke-width="2" stroke-dasharray="14 12" fill="none" opacity=".7"/>
      ${sides}
      <g transform="translate(560,248) scale(.62)">${TRUCK_SVG_G}</g>
      ${[[40, 230], [260, 238], [470, 226], [690, 236]].map(([x, y]) => `<path d="M${x} ${y}l3-9l3 9l3-9l3 9" stroke="#4E9E36" stroke-width="2" fill="none"/>`).join("")}
      ${fence}
      ${items.map((x) => x[1]).join("")}
      ${locked ? svgFarmer() + `<g transform="translate(685,180)"><circle r="24" fill="#fff" stroke="#E7BF79" stroke-width="3"/><text x="-14" y="10" font-size="28">🔒</text></g>` : ""}
    </svg>`;
  }
  // Side-view delivery truck (facing right), wheels spin in the sell animation.
  const TRUCK_SVG_G = `<rect x="2" y="14" width="74" height="34" rx="5" fill="#E5533D"/><path d="M6 22h66M6 31h66M6 40h66" stroke="#C23E2B" stroke-width="2"/>
    <path d="M76 22h24l16 14v12H76z" fill="#3B6FD8"/><path d="M82 26h16l11 10H82z" fill="#CFEFFF"/><rect x="112" y="40" width="6" height="5" rx="2" fill="#FFD84D"/>
    <g transform="translate(26,50)"><g class="spin"><circle r="10" fill="#2B2B33"/><circle r="4.5" fill="#C9CED6"/><rect x="-1" y="-9" width="2" height="18" fill="#8A929E"/></g></g>
    <g transform="translate(96,50)"><g class="spin"><circle r="10" fill="#2B2B33"/><circle r="4.5" fill="#C9CED6"/><rect x="-1" y="-9" width="2" height="18" fill="#8A929E"/></g></g>`;
  const TIPS = ["Hello! Cây chín thì bấm “Thu hoạch” nhé! 🌾", "Giao đơn hàng để kiếm nhiều xu hơn bán lẻ! 🚚", "Học xong bài sẽ có phân bón 🧪 làm cây chín ngay!",
    "Let's grow some carrots! 🥕 Cùng trồng cà rốt nào!", "Mua đồ trang trí để nhận thêm xu khi học! 🌷", "Good morning, farmer! Chào buổi sáng, nhà nông!"];
  function hud(f, g) {
    const lv = F.level(f.xp), next = F.nextXp(f.xp), prev = F.LVXP[lv - 1];
    return `<section class="hud"><div class="lvl" title="Cấp nông trại"><span aria-hidden="true">⭐</span><b>${lv}</b></div>
      <div class="main"><h1>Nông trại của bạn</h1>${next ? bar((f.xp - prev) / (next - prev)) : ""}<span class="small" style="color:#7A5C3A">Cấp ${lv} · ${next ? `${f.xp}/${next} điểm trại` : "cấp tối đa"}</span></div>
      <div class="pills"><span class="pill" title="Xu">🪙 <b>${f.coins}</b></span><span class="pill" title="Phân bón">🧪 <b>${f.fert}</b></span>
        ${g.open ? `<span class="pill time" data-playleft title="Thời gian chơi còn lại">⏱ <b class="pl">${fmtLeft(g.budget)}</b></span>` : `<span class="pill time">🔒 Đang khoá</span>`}
        <button type="button" class="pill fullbtn" data-farmfull>${U.farmFull ? "🗗 Thu nhỏ" : "⛶ Toàn màn hình"}</button></div></section>`;
  }
  function vFarmLocked(f, g) {
    const G = F.GATE, mins = (ms) => Math.floor(ms / F.MIN), first = g.study < G.MIN_STUDY;
    const msg = first ? `Học thêm ${Math.ceil(g.need / F.MIN)} phút nữa để mở cửa nông trại nhé! 📚` : "Hết giờ chơi rồi! Học thêm một chút để chơi tiếp nhé ⏰";
    return `<div class="farmv">${hud(f, g)}
      <div class="scene-wrap">${farmScene(f, true)}<div class="bubble">${msg}</div></div>
      <section class="panel stack lockcard" data-lock>
        <h2>${first ? "🔒 Nông trại đang khoá" : "⏰ Hết giờ chơi"}</h2>
        ${first ? `<p class="big num">${mins(g.study)}<small style="font-size:1.1rem"> / ${mins(G.MIN_STUDY)} phút học</small></p>${bar(g.study / G.MIN_STUDY)}`
          : `<p>Bạn đã chơi hết ${fmtLeft(g.play)} phút của lượt này. Cứ học thêm 4 phút sẽ có thêm 3 phút chơi.</p>`}
        <ul class="earn">
          <li>⏱️ 1 phút học = ${String(G.RATIO).replace(".", ",")} phút chơi nông trại</li>
          <li>📚 Cần học tối thiểu ${mins(G.MIN_STUDY)} phút mỗi lượt thì nông trại mới mở</li>
          <li>🔄 Mỗi lượt kéo dài ${G.WINDOW / 60 / F.MIN} tiếng rồi làm mới${g.resetIn ? ` — lượt này còn <b data-resetin>${fmtLeft(g.resetIn)}</b>` : ""}</li>
          <li>👆 Chỉ tính giờ khi bạn đang học ở Từ vựng, Câu hoặc IPA và có thao tác</li>
          <li>🪙 Xu và phân bón vẫn được cộng khi học: bạn đang có ${f.coins} xu, ${f.fert} 🧪</li></ul>
        <div class="row" style="justify-content:center"><button type="button" class="btn primary" data-go="learn">Học từ mới</button><button type="button" class="btn" data-go="review">Ôn tập</button><button type="button" class="btn" data-go="sent">Luyện câu</button></div>
      </section></div>`;
  }

  function vFarm() {
    const f = S.farm, now = Date.now(), lv = F.level(f.xp), g = F.gate(S.gate, now);
    if (!g.open) return vFarmLocked(f, g);
    if (f.orders.length < 3) { F.fillOrders(f, Math.random); save(); }
    const R = F.REWARD, bonus = F.bonus(f);
    return `<div class="farmv">${hud(f, g)}
      <div class="scene-wrap">${farmScene(f, false)}<div class="bubble">${TIPS[Math.floor(now / 60000) % TIPS.length]}</div></div>
      ${farmLandSection(f, now, lv)}
      <div class="grid g2" style="align-items:start">
          <section class="panel stack"><h2>🚚 Đơn hàng</h2><p class="small muted">Giao đủ hàng để nhận nhiều xu và điểm trại hơn bán lẻ.</p>
            <div class="orders">${f.orders.map((o, i) => {
              const can = F.canDeliver(f, o);
              return `<div class="order"><div class="need">${Object.entries(o.need).map(([id, q]) => {
                const have = f.barn[id] || 0, it = F.ITEMS[id];
                return `<span class="${have >= q ? "ok" : "no"}" title="${esc(it.vi)} (${esc(it.en)})">${it.emo} ${Math.min(have, q)}/${q}</span>`;
              }).join("")}</div>
                <div class="row" style="justify-content:space-between"><span class="small"><b>🪙 ${o.coins}</b> xu · ⭐ ${o.xp} điểm</span>
                  <span class="row"><button type="button" class="btn sm ghost" data-skiporder="${i}">Đổi đơn</button><button type="button" class="btn sm primary" data-deliver="${i}"${can ? "" : " disabled"}>Giao hàng</button></span></div></div>`;
            }).join("")}</div></section>
          <section class="panel stack"><h2>📘 Học để kiếm xu</h2>
            <ul class="earn"><li>📘 Mỗi 1 XP khi học = 1 xu${bonus ? ` <span class="chip good">+${bonus}% nhờ đồ trang trí</span>` : ""}</li>
              <li>✅ Xong một lượt học từ mới: +${R.lesson[0]} xu, +${R.lesson[1]} 🧪</li>
              <li>🔁 Ôn hết các từ đến hạn: +${R.review[0]} xu, +${R.review[1]} 🧪</li>
              <li>🎯 Đạt mục tiêu từ mới trong ngày: +${R.goal[0]} xu, +${R.goal[1]} 🧪</li>
              <li>⏱️ 1 phút học = ${String(F.GATE.RATIO).replace(".", ",")} phút chơi · lượt mới sau ${fmtLeft(g.resetIn)}</li></ul>
            <div class="row"><button type="button" class="btn primary" data-go="learn">Học từ mới</button><button type="button" class="btn" data-go="review">Ôn tập</button><button type="button" class="btn" data-go="sent">Luyện câu</button></div>
            <p class="small muted">Tổng xu kiếm được từ việc học: ${f.earned}</p></section>
      </div>
      ${beastsSection(f, now)}
      <div class="grid g2" style="align-items:start">
        <section class="panel stack"><div class="row" style="justify-content:space-between"><h2>🏚️ Nhà kho</h2><span class="chip num">${F.stock(f)}/${f.cap}</span></div>
          ${bar(F.stock(f) / f.cap)}
          ${Object.keys(f.barn).length ? `<div class="list">${Object.entries(f.barn).map(([id, n]) => {
            const it = F.ITEMS[id];
            return `<div class="item"><span class="pic sm">${it.emo}</span><span class="t"><b class="num">${n}</b> × ${itemName(it)}<br><span class="small muted">Bán ${it.sell} xu/cái</span></span>
              <span style="display:flex;gap:6px;align-items:center">${sayEn(it.en)}<button type="button" class="btn sm" data-sell="${id}">Bán 1</button></span></div>`;
          }).join("")}</div>` : `<p class="muted">Kho trống. Thu hoạch cây để có hàng.</p>`}
          <div><button type="button" class="btn sm" data-upbarn>Nâng cấp kho +20 chỗ (${F.barnCost(f)} xu)</button></div></section>
        <section class="panel stack"><h2>🌷 Trang trí</h2><p class="small muted">Món đã mua xuất hiện trên nông trại và tăng % xu nhận được khi học (tối đa 30%).</p>
          <div class="shop">${F.DECOS.map((d) => {
            const own = f.deco.includes(d.id), locked = d.lv > lv;
            return `<div class="it${own ? " owned" : ""}"><span class="e">${d.emo}</span><b>${esc(d.vi)}</b><span class="small muted"><i>${esc(d.en)}</i> · +${d.bonus}% xu</span>
              ${own ? `<span class="chip good">✓ Đã có</span>` : locked ? `<span class="chip">🔒 Cấp ${d.lv}</span>`
                : `<button type="button" class="btn sm primary" data-buydeco="${d.id}"${f.coins < d.cost ? " disabled" : ""}>Mua · ${d.cost} xu</button>`}</div>`;
          }).join("")}</div></section>
      </div></div>`;
  }

  // ---- Field: 30 slots (owned plots, the next plot to buy, plots locked until a farm level) + the farmer who tends them ----
  // ---- The farm frame: crop field and animal ranch share one piece of land; all actions sit in a bar at the bottom ----
  function fieldSlots(f, now, lv) {
    const slots = [];
    let locked = 0;
    for (let n = 1; n <= F.MAX_PLOTS; n++) {
      if (n <= f.plots.length) { slots.push(plotHTML(f.plots[n - 1], n - 1, now)); continue; }
      const need = F.plotLevel(n);
      if (n === f.plots.length + 1 && need <= lv) {
        const cost = F.plotCost(f);
        slots.push(`<button type="button" class="plot buy" data-buyplot${f.coins < cost ? " disabled" : ""} aria-label="Mua ô đất số ${n}: ${cost} xu">
          <span class="e" aria-hidden="true">➕</span><span class="lbl">${cost} xu</span></button>`);
      } else {
        locked++;
        slots.push(`<div class="plot locked${locked > 4 ? " far" : ""}" title="Mở ở nông trại cấp ${need}"><span class="e" aria-hidden="true">🔒</span><span class="lbl">Cấp ${need}</span></div>`);
      }
    }
    return slots.join("");
  }
  function farmLandSection(f, now, lv) {
    const readyC = f.plots.filter((p) => F.plotReady(p, now)).length, readyA = f.animals.filter((x) => F.animalReady(x, now)).length;
    const buy = F.ANIMALS.map((a) => {
      const n = f.animals.filter((x) => x.a === a.id).length;
      if (a.lv > lv) return `<span class="chip">🔒 ${a.emo} cấp ${a.lv}</span>`;
      if (n >= F.MAX_PER_ANIMAL) return `<span class="chip good">${a.emo} đủ ${F.MAX_PER_ANIMAL}</span>`;
      return `<button type="button" class="btn sm" data-buyanimal="${a.id}"${f.coins < a.cost ? " disabled" : ""}>Mua ${a.emo} ${esc(a.vi.toLowerCase())} · ${a.cost} xu</button>`;
    }).join("");
    return `<section class="panel stack landp"><div class="row" style="justify-content:space-between"><h2>🌾 Trang trại</h2>
        <span class="chip num">🌱 ${f.plots.length}/${F.MAX_PLOTS} ô đất · 🐾 ${f.animals.length} vật nuôi</span></div>
      <div class="land">
        <div class="zone"><div class="zone-head">🌱 Cánh đồng</div><div class="field">${fieldSlots(f, now, lv)}</div></div>
        <div class="zone"><div class="zone-head">🐾 Khu chăn nuôi</div><div class="ranch">${ranchGroups(f, now, lv)}</div></div>
        ${farmerBot()}
      </div>
      <div class="farm-actions">
        <div class="row"><button type="button" class="btn primary" data-harvestall>🌾 Thu hoạch cây${readyC ? ` (${readyC})` : ""}</button>
          <button type="button" class="btn primary" data-collectall>🧺 Thu sản phẩm${readyA ? ` (${readyA})` : ""}</button></div>
        <div class="row buyrow"><span class="label">Mua vật nuôi</span>${buy}</div>
      </div>
      <p class="small muted">Chạm ô trống để gieo hạt, ô ➕ để mở thêm đất (mỗi cấp nông trại thêm 3 ô, tối đa ${F.MAX_PLOTS}). Chạm con vật để thu sản phẩm hoặc dùng 🧪 cho nhanh.</p></section>`;
  }
  function plotHTML(p, i, now) {
    if (!p.c) return `<button type="button" class="plot empty" data-plotidx="${i}" aria-label="Ô ${i + 1} trống: gieo hạt"><span class="e" aria-hidden="true">+</span><span class="lbl">Gieo hạt</span></button>`;
    const c = F.CROP[p.c], dur = c.min * F.MIN, left = F.remaining(p.at, c.min, now);
    const badge = (p.pb ? `<span class="pbadge" title="Linh Thú: +${p.pb}% giá bán">💰+${p.pb}%</span>` : "") + (p.bf && p.bf.length ? `<span class="bbadge" title="Được ${p.bf.length} Linh Thú ban phúc">✦${p.bf.length}</span>` : "");
    if (!left) return `<button type="button" class="plot ready" data-plotidx="${i}" aria-label="Thu hoạch ${esc(c.vi)}"><span class="e">${c.emo}</span><span class="lbl">Thu hoạch!</span>${badge}</button>`;
    const frac = 1 - left / dur, stage = frac < 0.34 ? ["🌱", "s1"] : frac < 0.67 ? ["🌿", "s2"] : [c.emo, "s3"];
    return `<button type="button" class="plot" data-plotidx="${i}" ${timer(p.at + dur, dur)} aria-label="${esc(c.vi)} đang lớn">
      <span class="e ${stage[1]}">${stage[0]}</span><span class="t num">${fmtLeft(left)}</span>${bar(frac)}${badge}</button>`;
  }
  const farmerBot = () => `<div class="farmer-bot" aria-hidden="true"><div class="fb-flip"><svg viewBox="-30 -54 64 104" width="54" height="88">
    <ellipse cx="0" cy="47" rx="15" ry="4" fill="rgba(0,0,0,.2)"/>
    <g transform="translate(-5,14)"><g class="leg"><rect x="-3.5" y="0" width="7" height="27" rx="3.5" fill="#2F5BB7"/><rect x="-5" y="25" width="11" height="7" rx="3" fill="#6B3E1E"/></g></g>
    <g transform="translate(5,14)"><g class="leg b"><rect x="-3.5" y="0" width="7" height="27" rx="3.5" fill="#2F5BB7"/><rect x="-5" y="25" width="11" height="7" rx="3" fill="#6B3E1E"/></g></g>
    <g transform="translate(-11,-8) rotate(14)"><rect x="-3" y="0" width="6" height="19" rx="3" fill="#E5533D"/><circle cx="0" cy="20" r="3.6" fill="#FFD1A6"/></g>
    <rect x="-12" y="-15" width="24" height="31" rx="9" fill="#E5533D"/><path d="M-11 2h22v12a5 5 0 0 1-5 5h-12a5 5 0 0 1-5-5z" fill="#3B6FD8"/><rect x="-7" y="-6" width="14" height="10" rx="2" fill="#3B6FD8"/>
    <circle cx="0" cy="-26" r="12" fill="#FFD1A6"/><circle cx="4" cy="-27" r="1.7" fill="#3B2A14"/><circle cx="-4" cy="-27" r="1.7" fill="#3B2A14"/>
    <path d="M-5 -20q5 5 10 0" stroke="#3B2A14" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="8" cy="-22" r="2.3" fill="#FF9E9E" opacity=".7"/>
    <ellipse cx="0" cy="-35" rx="21" ry="5" fill="#E2A93B"/><path d="M-11 -35q0-14 11-14q11 0 11 14z" fill="#F2C14E"/><rect x="-11" y="-39" width="22" height="3.5" fill="#D9443A"/>
    <g transform="translate(11,-6)"><g class="can"><rect x="-3" y="0" width="6" height="16" rx="3" fill="#E5533D"/><circle cx="0" cy="17" r="3.6" fill="#FFD1A6"/>
      <g transform="translate(2,14)"><rect x="0" y="0" width="14" height="11" rx="2" fill="#5DADE2"/><path d="M14 3l9-5" stroke="#5DADE2" stroke-width="3" stroke-linecap="round"/>
        <g class="drops" fill="#4FA8E8"><circle cx="24" cy="2" r="1.8"/><circle cx="26" cy="7" r="1.6"/><circle cx="23" cy="11" r="1.5"/></g></g></g></g>
  </svg></div></div>`;
  let farmerTimer = null, farmerPos = null;
  /** The farmer runs from crop to crop and waters it; positions survive re-renders so he never teleports. */
  function startFarmer() {
    clearInterval(farmerTimer);
    const bot = $(".farmer-bot"), land = $(".land");
    if (!bot || !land) return;
    const place = (x, y, animate) => {
      if (!animate) bot.style.transition = "none";
      bot.style.transform = `translate(${x}px, ${y}px)`;
      if (!animate) { void bot.offsetWidth; bot.style.transition = ""; }
      farmerPos = { x, y };
    };
    place(farmerPos ? farmerPos.x : 8, farmerPos ? farmerPos.y : 8, false);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const step = () => {
      if (!document.contains(bot)) { clearInterval(farmerTimer); return; }
      const tiles = [...land.querySelectorAll(".plot[data-plotidx], .atile[data-animalidx]")], busy = tiles.filter((t) => !t.classList.contains("empty"));
      const pool = busy.length ? busy : tiles;
      if (!pool.length) return;
      const t = pool[Math.floor(Math.random() * pool.length)];
      const x = t.offsetLeft + t.offsetWidth / 2 - 27, y = t.offsetTop + t.offsetHeight - 70;
      bot.classList.toggle("left", farmerPos && x < farmerPos.x);
      bot.classList.remove("work"); bot.classList.add("run");
      place(x, y, true);
      clearTimeout(bot._t);
      bot._t = setTimeout(() => { bot.classList.remove("run"); bot.classList.add("work"); }, 1300);
    };
    setTimeout(step, 300);
    farmerTimer = setInterval(step, 3600);
  }

  // ---- Animal pens: each kind of animal gets its own fenced pen with a building; animals wander, ready ones show their product ----
  const PEN = { chicken: { vi: "Chuồng gà", roof: "#B83229", wall: "#F2D49B", grass: "#9BD86E" }, cow: { vi: "Chuồng bò", roof: "#7A4514", wall: "#D9443A", grass: "#8FD165" },
    pig: { vi: "Chuồng lợn", roof: "#8B5A2B", wall: "#F2C9A0", grass: "#B9CF6E" },
    sheep: { vi: "Bãi cừu", roof: "#4F7396", wall: "#EFE6D2", grass: "#A6DE7A" }, bee: { vi: "Vườn ong", roof: "#C98A1B", wall: "#FFE6A3", grass: "#B5E585" } };
  const RANCH_BG = { chicken: "straw", cow: "meadow", pig: "mud", sheep: "pasture", bee: "flowers" };
  function ranchGroups(f, now, lv) {
    return F.ANIMALS.map((a) => {
      const list = f.animals.map((x, i) => [x, i]).filter(([x]) => x.a === a.id), locked = a.lv > lv, tiles = [];
      for (let k = 0; k < F.MAX_PER_ANIMAL; k++) {
        tiles.push(list[k] ? animalTile(a, list[k][0], list[k][1], k, now)
          : `<div class="atile slot" aria-hidden="true"><span class="e">${locked ? "🔒" : a.emo}</span><span class="lbl">${locked ? `Cấp ${a.lv}` : "Trống"}</span></div>`);
      }
      return `<div class="pgroup ${RANCH_BG[a.id]}${locked ? " locked" : ""}" data-ranch="${a.id}">
        <div class="pg-head"><b>${esc(PEN[a.id].vi)}</b> <i>${esc(a.en)}</i><span class="num">${list.length}/${F.MAX_PER_ANIMAL}</span></div>
        <div class="pg-tiles">${tiles.join("")}</div></div>`;
    }).join("");
  }
  function animalTile(a, x, i, k, now) {
    const pr = F.ITEMS[a.prod], dur = a.min * F.MIN, left = F.remaining(x.at, a.min, now), d = -(k * 0.6).toFixed(1);
    const art = `<svg class="anim" viewBox="-44 -44 88 72" aria-hidden="true">${a.id === "bee" ? ANIMAL_SVG.bee(d)
      : `<g class="wander" style="--dx:${k % 2 ? -6 : 6}px;animation-duration:${3 + k}s">${ANIMAL_SVG[a.id](d)}</g>`}</svg>`;
    if (!left) return `<button type="button" class="atile ready" data-animalidx="${i}" aria-label="Thu ${esc(pr.vi)} từ ${esc(a.vi)}">${art}<span class="prod">${pr.emo}</span><span class="lbl">Thu ${pr.emo}</span></button>`;
    return `<button type="button" class="atile" data-animalidx="${i}" ${timer(x.at + dur, dur)} aria-label="${esc(a.vi)}: còn ${fmtLeft(left)}">${art}<span class="t num">${fmtLeft(left)}</span>${bar(1 - left / dur)}</button>`;
  }
  function animalSheet(i) {
    const f = S.farm, x = f.animals[i]; if (!x) return;
    const a = F.ANIMAL[x.a], pr = F.ITEMS[a.prod], left = F.remaining(x.at, a.min, Date.now());
    sheet(`<div class="row" style="justify-content:space-between"><h2>${a.emo} ${esc(a.vi)}</h2><button class="btn icon-btn ghost" data-close aria-label="Đóng">${I.x}</button></div>
      <div class="row"><span class="word" style="font-size:1.6rem">${esc(a.en)}</span>${sayBtns(a.en)}</div>
      <p>Còn <b>${fmtLeft(left)}</b> nữa sẽ có ${pr.emo} ${esc(pr.vi.toLowerCase())} (<i>${esc(pr.en)}</i>) · bán ${pr.sell} xu.</p>
      <div class="row"><button type="button" class="btn primary" data-boost="${i}"${f.fert ? "" : " disabled"}>Dùng 🧪 phân bón (còn ${f.fert})</button>
        <button type="button" class="btn ghost" data-close>Đóng</button></div>
      ${f.fert ? "" : `<p class="small muted">Hoàn thành bài học để nhận thêm phân bón.</p>`}`, a.vi);
  }

  // ---- One-shot effects played after the farm re-renders ----
  function floatAt(el, text) {
    if (!el) return;
    const s = document.createElement("span");
    s.className = "floater"; s.textContent = text;
    el.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
  // Delivery truck: loads crates at the barn, drives the farm road and unloads at the produce market (~6.5 s).
  const DELIVERY_TRUCK = `<svg class="dv-svg" viewBox="0 0 170 92" aria-hidden="true">
    <rect x="4" y="34" width="98" height="32" rx="3" fill="#B7793F"/><path d="M4 44h98M4 55h98" stroke="#8B5A2B" stroke-width="2.5"/><rect x="2" y="30" width="102" height="6" rx="2" fill="#8B5A2B"/>
    <rect x="0" y="62" width="164" height="12" rx="6" fill="#3E9B4F"/>
    <path d="M100 66V28q0-8 8-8h28q8 0 13 9l12 20q3 5 3 10v7z" fill="#46A85A"/><path d="M107 28h24q4 0 6 4l7 14h-37z" fill="#CFEFFF"/>
    <circle cx="122" cy="36" r="7" fill="#FFD1A6"/><path d="M114 33q8-10 16 0z" fill="#D9443A"/><rect x="127" y="31" width="6" height="2.5" rx="1" fill="#D9443A"/>
    <circle cx="154" cy="53" r="7.5" fill="#fff" stroke="#2F6B3A" stroke-width="1.5"/><circle cx="156" cy="53" r="3.6" fill="#1E2A38"/><circle cx="157.5" cy="51.5" r="1.2" fill="#fff"/>
    <path d="M146 63q6 4 12 0" stroke="#1E2A38" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="158" y="62" width="10" height="7" rx="3" fill="#AEB6C1"/>
    <rect x="0" y="58" width="6" height="4" rx="1" fill="#6C7480"/>
    <g transform="translate(34,76)"><g class="spin"><circle r="13" fill="#2B2B33"/><circle r="6" fill="#C9CED6"/><rect x="-1.5" y="-12" width="3" height="24" fill="#8A929E"/></g></g>
    <g transform="translate(130,76)"><g class="spin"><circle r="13" fill="#2B2B33"/><circle r="6" fill="#C9CED6"/><rect x="-1.5" y="-12" width="3" height="24" fill="#8A929E"/></g></g>
  </svg>`;
  const DELIVERY_BG = `<svg class="dv-bg" viewBox="0 0 720 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="dvsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6CCBFF"/><stop offset="1" stop-color="#D9F4FF"/></linearGradient></defs>
    <rect width="720" height="220" fill="url(#dvsky)"/>
    <g fill="#fff" opacity=".9"><ellipse cx="190" cy="34" rx="30" ry="11"/><ellipse cx="208" cy="27" rx="18" ry="11"/><ellipse cx="470" cy="46" rx="26" ry="9"/><ellipse cx="486" cy="40" rx="15" ry="9"/></g>
    <path d="M0 120Q140 80 300 112T720 104V220H0Z" fill="#A6E07A"/><path d="M0 140Q360 126 720 140V220H0Z" fill="#74C54F"/>
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${215 + i * 34} 146q6-8 12 0" stroke="#3E8E2E" stroke-width="3" fill="none"/>`).join("")}
    <path d="M0 176Q360 160 720 176V206Q360 192 0 206Z" fill="#D9B98A"/><path d="M0 191Q360 176 720 191" stroke="#fff" stroke-width="2" stroke-dasharray="12 10" fill="none" opacity=".7"/>
    <g transform="translate(18,52)"><path d="M-6 44L62 0L130 44Z" fill="#9E2B25"/><rect x="4" y="40" width="116" height="84" fill="#D9443A"/><rect x="4" y="40" width="116" height="5" fill="#fff" opacity=".85"/>
      <rect x="38" y="62" width="48" height="62" fill="#fff"/><rect x="42" y="66" width="40" height="58" fill="#7A2A22"/><path d="M42 66L82 124M82 66L42 124" stroke="#fff" stroke-width="4"/></g>
    <g transform="translate(548,40)"><rect x="0" y="40" width="160" height="96" fill="#F6E3B8"/><path d="M-6 42L80 6L166 42Z" fill="#C0563A"/>
      <rect x="40" y="16" width="80" height="22" rx="5" fill="#fff" stroke="#C0563A" stroke-width="2"/><text x="80" y="31" text-anchor="middle" font-size="11" font-weight="800" fill="#B83229">CHỢ NÔNG SẢN</text>
      ${Array.from({ length: 8 }, (_, i) => `<path d="M${i * 20} 52h20v16q-10 8-20 0z" fill="${i % 2 ? "#fff" : "#E5533D"}"/>`).join("")}
      <text x="22" y="104" font-size="26">🧑‍🌾</text><text x="118" y="112" font-size="22">👩</text><text x="140" y="118" font-size="20">🧒</text>
      <rect x="0" y="106" width="110" height="30" rx="3" fill="#B7793F"/><path d="M0 116h110" stroke="#8B5A2B" stroke-width="2"/></g>
  </svg>`;
  let deliveryBusy = false, deliveryNext = null;
  function truckRun(items, coins) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (deliveryBusy) {
      deliveryNext = deliveryNext ? { items: deliveryNext.items.concat(items), coins: deliveryNext.coins + coins } : { items, coins };
      return;
    }
    deliveryBusy = true;
    const goods = items.slice(0, 6);
    const crate = (emo, k, cls) => `<span class="crate ${cls}" style="--k:${k}"><span>${emo}</span></span>`;
    const el = document.createElement("div");
    el.className = "delivery"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="dv-stage">${DELIVERY_BG}
      <div class="dv-truck"><div class="dv-body"><div class="dv-bed">${goods.map((e, k) => crate(e, k, "load")).join("")}</div>${DELIVERY_TRUCK}</div>
        <i class="puff" style="--k:0"></i><i class="puff" style="--k:1"></i><i class="puff" style="--k:2"></i></div>
      <div class="dv-shop">${goods.map((e, k) => crate(e, k, "sold")).join("")}</div>
      ${coins ? `<div class="dv-coins">+${coins} 🪙</div>` : ""}
      <div class="dv-cap c1">📦 Chất nông sản lên xe ở kho</div><div class="dv-cap c2">🚚 Đang chở ra chợ nông sản…</div><div class="dv-cap c3">🏪 Bán xong ở chợ!${coins ? ` +${coins} xu` : ""}</div>
    </div>`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove(); deliveryBusy = false;
      if (deliveryNext) { const n = deliveryNext; deliveryNext = null; truckRun(n.items, n.coins); }
    }, 6700);
  }
  function blessFx(id, plots) {
    const el = document.createElement("div");
    el.className = "bless-fx"; el.setAttribute("aria-hidden", "true"); el.style.setProperty("--aura", AURA[id]);
    el.innerHTML = `<div class="ring"></div>${BIMG[id] ? `<img src="${BIMG[id]}" alt="">` : ""}<div class="burst">${Array.from({ length: 10 }, (_, k) => `<i style="--r:${k * 36}deg">✦</i>`).join("")}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
    for (const i of plots) { const t = $(`.land [data-plotidx="${i}"]`); if (t) t.classList.add("blessed"); }
  }
  function farmDone(r, msg, en, effect) {
    if (!r.ok) { toast(r.msg); return false; }
    save();
    if (r.levelUp) {
      const news = F.unlocks(r.levelUp).map((x) => `${x.emo} ${x.vi}`).join(", ");
      toast(`🎉 Nông trại lên cấp ${r.levelUp}!${news ? ` Mở khoá: ${news}` : ""}`, 4500);
    } else if (msg) toast(msg);
    if (en) say(en);
    if ($("#modal").hidden) render(); else { closeModal(); render(); }
    if (effect) try { effect(); } catch (err) { console.error("effect failed", err); }
    return true;
  }
  function seedSheet(i) {
    const f = S.farm, lv = F.level(f.xp);
    sheet(`<div class="row" style="justify-content:space-between"><h2>Gieo hạt · ô ${i + 1}</h2><button class="btn icon-btn ghost" data-close aria-label="Đóng">${I.x}</button></div>
      <p class="small muted">Bạn có 🪙 ${f.coins} xu. Cây càng lâu chín càng bán được giá.</p>
      <div class="list">${F.CROPS.map((c) => {
        const locked = c.lv > lv, poor = f.coins < c.seed;
        return `<div class="item"><span class="pic sm">${c.emo}</span><span class="t"><b>${esc(c.vi)}</b> · <i>${esc(c.en)}</i><br>
          <span class="small muted">${locked ? `🔒 Mở ở cấp ${c.lv}` : `Hạt ${c.seed} xu · chín sau ${fmtMin(c.min)} · bán ${c.sell} xu`}</span></span>
          <span style="display:flex;gap:6px;align-items:center">${sayEn(c.en)}${locked ? "" : `<button type="button" class="btn sm ghost" data-plantall="${c.id}"${poor ? " disabled" : ""}>Mọi ô</button>
            <button type="button" class="btn sm primary" data-plant="${c.id}" data-plot="${i}"${poor ? " disabled" : ""}>Gieo</button>`}</span></div>`;
      }).join("")}</div>`, "Gieo hạt");
  }
  function growSheet(i) {
    const f = S.farm, p = f.plots[i], c = F.CROP[p.c];
    sheet(`<div class="row" style="justify-content:space-between"><h2>${c.emo} ${esc(c.vi)}</h2><button class="btn icon-btn ghost" data-close aria-label="Đóng">${I.x}</button></div>
      <div class="row"><span class="word" style="font-size:1.6rem">${esc(c.en)}</span>${sayBtns(c.en)}</div>
      <p>Còn <b>${fmtLeft(F.remaining(p.at, c.min, Date.now()))}</b> nữa là chín. Bán được ${c.sell} xu.</p>
      <div class="row"><button type="button" class="btn primary" data-fert="${i}"${f.fert ? "" : " disabled"}>Dùng 🧪 phân bón (còn ${f.fert})</button>
        <button type="button" class="btn ghost" data-uproot="${i}">Nhổ bỏ</button><button type="button" class="btn ghost" data-close>Đóng</button></div>
      ${f.fert ? "" : `<p class="small muted">Hoàn thành bài học để nhận thêm phân bón.</p>`}`, c.vi);
  }
  function animalShop() {
    const f = S.farm, lv = F.level(f.xp);
    sheet(`<div class="row" style="justify-content:space-between"><h2>Mua vật nuôi</h2><button class="btn icon-btn ghost" data-close aria-label="Đóng">${I.x}</button></div>
      <p class="small muted">Bạn có 🪙 ${f.coins} xu. Mỗi loại tối đa ${F.MAX_PER_ANIMAL} con.</p>
      <div class="list">${F.ANIMALS.map((a) => {
        const n = f.animals.filter((x) => x.a === a.id).length, pr = F.ITEMS[a.prod], locked = a.lv > lv;
        return `<div class="item"><span class="pic sm">${a.emo}</span><span class="t"><b>${esc(a.vi)}</b> · <i>${esc(a.en)}</i> <span class="small muted">(${n}/${F.MAX_PER_ANIMAL})</span><br>
          <span class="small muted">${locked ? `🔒 Mở ở cấp ${a.lv}` : `${a.cost} xu · cho ${pr.emo} ${esc(pr.en)} mỗi ${fmtMin(a.min)}`}</span></span>
          <span style="display:flex;gap:6px;align-items:center">${sayEn(a.en)}${locked ? "" :
            `<button type="button" class="btn sm primary" data-buyanimal="${a.id}"${f.coins < a.cost || n >= F.MAX_PER_ANIMAL ? " disabled" : ""}>Mua</button>`}</span></div>`;
      }).join("")}</div>`, "Mua vật nuôi");
  }
  function plotClick(i) {
    const p = S.farm.plots[i]; if (!p) return;
    if (!p.c) seedSheet(i);
    else if (F.plotReady(p, Date.now())) {
      const c = F.CROP[p.c], r = F.harvest(S.farm, i, Date.now());
      farmDone(r, `+1 ${c.emo} ${c.en} (${c.vi})${r.bonus ? ` · +${r.bonus} xu nhờ Linh Thú ✨` : ""}`, c.en,
        () => floatAt($(`.land [data-plotidx="${i}"]`), `+1 ${c.emo}${r.bonus ? ` +${r.bonus}🪙` : ""}`));
    }
    else growSheet(i);
  }
  // One clock for everything time-based: study/play minutes for the farm gate, farm countdowns.
  const STUDY_TABS = new Set(["words", "sent", "ipa"]);
  let lastAct = Date.now(), ticks = 0;
  for (const ev of ["pointerdown", "keydown", "input", "wheel", "touchstart"]) addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true });
  const gateNow = () => F.gate(S.gate, Date.now());
  function tick() {
    const now = Date.now(), active = document.visibilityState === "visible" && now - lastAct < F.GATE.IDLE;
    const before = F.gate(S.gate, now);
    let counted = false;
    if (active && STUDY_TABS.has(U.tab)) { S.gate = F.addStudy(S.gate, 1000, now); counted = true; }
    else if (active && U.tab === "farm" && before.open) { S.gate = F.addPlay(S.gate, 1000, now); counted = true; }
    if (counted && ++ticks % 5 === 0) save();
    const g = F.gate(S.gate, now);
    farmBtn(g);
    if (S.online && NET.configured && document.visibilityState === "visible" && now - lastPushAt >= Online.SYNC_EVERY) pushStats();
    if (U.tab !== "farm") {
      if (!before.open && g.open) toast(`🔓 Nông trại đã mở! Bạn có ${fmtLeft(g.budget)} phút chơi.`, 3500);
      return;
    }
    if (before.open !== g.open || (!g.open && !$("[data-lock]"))) {
      if (!$("#modal").hidden) closeModal();
      if (!g.open) { save(); toast("⏰ Hết giờ chơi! Học thêm để chơi tiếp nhé.", 3500); }
      render(); return;
    }
    const pl = $("#view [data-playleft] .pl"); if (pl) pl.textContent = fmtLeft(g.budget);
    const ri = $("#view [data-resetin]"); if (ri && g.resetIn) ri.textContent = fmtLeft(g.resetIn);
    let ripe = false;
    document.querySelectorAll("#view [data-end]").forEach((el) => {
      const left = +el.dataset.end - now;
      if (left <= 0) { ripe = true; return; }
      const t = el.querySelector(".t.num") || el.querySelector(".t .t"); if (t) t.textContent = fmtLeft(left);
      const b = el.querySelector(".bar > i"); if (b) b.style.width = `${Math.round((1 - left / +el.dataset.dur) * 100)}%`;
    });
    if (ripe && $("#modal").hidden) render();
  }
  setInterval(tick, 1000);

  // ---------- Linh Thú (spirit beasts) ----------
  const BIMG = window.BEAST_IMG || {};
  const effectText = (pw) => [pw.speed && `⏩ Rút ngắn ${pw.speed}% thời gian chín còn lại`, pw.price && `💰 +${pw.price}% giá bán khi thu hoạch`].filter(Boolean).join(" · ");
  const stars = (lv) => `<span class="stars" aria-label="Cấp ${lv}/${F.BEAST_MAX_LV}">${"★".repeat(lv)}${"☆".repeat(F.BEAST_MAX_LV - lv)}</span>`;
  function needChips(f, coins, items) {
    return `<div class="need"><span class="${f.coins >= coins ? "ok" : "no"}">🪙 ${coins}</span>${Object.entries(items).map(([id, q]) => {
      const it = F.ITEMS[id], have = f.barn[id] || 0;
      return `<span class="${have >= q ? "ok" : "no"}" title="${esc(it.vi)} (${esc(it.en)})">${it.emo} ${Math.min(have, q)}/${q}</span>`;
    }).join("")}</div>`;
  }
  /** Portrait with idle "breathing", element-coloured aura, rising sparks, a light sweep and (dragon, monkey) lightning flashes. */
  function beastArt(b, extra) {
    const sparks = Array.from({ length: 7 }, (_, k) => `<i class="spark" style="--x:${8 + k * 13}%;--d:${-(k * 0.47).toFixed(2)}s;--s:${(2.4 + (k % 3) * 0.6).toFixed(1)}s"></i>`).join("");
    return `<div class="art${STORM.has(b.id) ? " storm" : ""}${extra}" style="--aura:${AURA[b.id]}">
      ${BIMG[b.id] ? `<img src="${BIMG[b.id]}" alt="${esc(b.zo)} – ${esc(b.vi)}" loading="lazy">` : `<div class="noimg">${esc(b.zo)}</div>`}
      <span class="aura"></span>${sparks}<span class="shine"></span>${STORM.has(b.id) ? '<span class="flash"></span>' : ""}</div>`;
  }
  function beastsSection(f, now) {
    const owned = Object.keys(f.beasts).length;
    return `<section class="panel stack"><div class="row" style="justify-content:space-between"><h2>🐉 Linh Thú 12 con giáp</h2><span class="chip num">${owned}/12</span></div>
      <p class="small muted">Thu phục Linh Thú bằng xu và nông sản. Linh Thú ban phúc cho cây đang trồng: rút ngắn thời gian chín hoặc tăng giá bán.
        Mỗi ngày mỗi Linh Thú có ${F.STAMINA} ⚡ thể lực — ban phúc càng nhiều cây càng tốn, cấp càng cao càng ít tốn. Nâng cấp (tối đa ${F.BEAST_MAX_LV}) bằng nông sản thu hoạch.</p>
      <div class="beasts">${F.BEASTS.map((b) => beastCard(f, b, now)).join("")}</div></section>`;
  }
  function beastCard(f, b, now) {
    const s = f.beasts[b.id], locked = !s && b.lv > F.level(f.xp);
    const img = beastArt(b, "");
    let body;
    if (s) {
      const st = F.stamina(f, b.id, today()), targets = F.castTargets(f, b.id, now).length;
      body = `${stars(s.lv)}<p class="small">${effectText(F.beastPower(b.id, s.lv))}</p>
        <div class="stamina" title="Thể lực hôm nay"><i style="width:${st / F.STAMINA * 100}%"></i></div>
        <span class="small muted">⚡ ${st}/${F.STAMINA} thể lực · ${F.STAMINA_PER_CROP[s.lv - 1]} ⚡/cây</span>
        <div class="row"><button type="button" class="btn sm primary" data-beastcast="${b.id}"${targets && st ? "" : " disabled"}>✨ Ban phúc${targets ? ` (${targets})` : ""}</button>
          <button type="button" class="btn sm" data-beastinfo="${b.id}">${s.lv < F.BEAST_MAX_LV ? "Nâng cấp" : "Chi tiết"}</button></div>`;
    } else if (locked) {
      body = `<p class="small">${effectText(F.beastPower(b.id, 1))}</p><span class="chip">🔒 Nông trại cấp ${b.lv}</span>
        <div><button type="button" class="btn sm" data-beastinfo="${b.id}">Chi tiết</button></div>`;
    } else {
      const can = f.coins >= b.cost && Object.entries(b.need).every(([id, q]) => (f.barn[id] || 0) >= q);
      body = `<p class="small">${effectText(F.beastPower(b.id, 1))}</p>${needChips(f, b.cost, b.need)}
        <div class="row"><button type="button" class="btn sm primary" data-beastbuy="${b.id}"${can ? "" : " disabled"}>Thu phục</button>
          <button type="button" class="btn sm" data-beastinfo="${b.id}">Chi tiết</button></div>`;
    }
    return `<div class="beast${s ? " owned" : ""}${locked ? " locked" : ""}" style="--aura:${AURA[b.id]}">${img}<div class="bd">
      <div class="row" style="justify-content:space-between;gap:4px"><b>${esc(b.zo)} · ${esc(b.vi)}</b>${s ? `<span class="chip good">Cấp ${s.lv}</span>` : ""}</div>
      <span class="small muted"><i>${esc(b.en)}</i> — ${esc(b.lore)}</span>${body}</div></div>`;
  }
  function beastSheet(id) {
    const f = S.farm, b = F.BEAST[id], s = f.beasts[id], up = s && F.upgradeCost(f, id);
    const can = up && f.coins >= up.coins && Object.entries(up.need).every(([k, q]) => (f.barn[k] || 0) >= q);
    sheet(`<div class="row" style="justify-content:space-between"><h2>${esc(b.zo)} · ${esc(b.vi)}</h2><button class="btn icon-btn ghost" data-close aria-label="Đóng">${I.x}</button></div>
      ${beastArt(b, " big")}
      <div class="row"><span class="word" style="font-size:1.4rem">${esc(b.en)}</span>${sayBtns(b.en)}</div>
      <p class="muted">${esc(b.lore)}</p>
      ${s ? `<p>${stars(s.lv)} <b>Cấp ${s.lv}/${F.BEAST_MAX_LV}</b></p><p>Hiện tại: ${effectText(F.beastPower(id, s.lv))} · ${F.STAMINA_PER_CROP[s.lv - 1]} ⚡/cây</p>`
        : `<p>Khi thu phục (cấp 1): ${effectText(F.beastPower(id, 1))}</p><p class="small muted">Cấp tối đa ${F.BEAST_MAX_LV}: ${effectText(F.beastPower(id, F.BEAST_MAX_LV))} · ${F.STAMINA_PER_CROP[F.BEAST_MAX_LV - 1]} ⚡/cây</p>
           <p class="label">Cần để thu phục${b.lv > F.level(f.xp) ? ` · 🔒 nông trại cấp ${b.lv}` : ""}</p>${needChips(f, b.cost, b.need)}`}
      ${up ? `<p class="label">Nâng lên cấp ${s.lv + 1}: ${effectText(F.beastPower(id, s.lv + 1))} · ${F.STAMINA_PER_CROP[s.lv]} ⚡/cây</p>${needChips(f, up.coins, up.need)}
        <div><button type="button" class="btn primary" data-beastup="${id}"${can ? "" : " disabled"}>Nâng lên cấp ${s.lv + 1}</button></div>` : s ? `<p class="feedback ok">🏆 Đã đạt cấp tối đa!</p>` : ""}`, b.vi);
  }
  function castSheet(id) {
    const f = S.farm, b = F.BEAST[id], s = f.beasts[id], now = Date.now(), st = F.stamina(f, id, today());
    const targets = F.castTargets(f, id, now);
    let n = 0;
    while (n < targets.length && F.castCost(s.lv, n + 1) <= st) n++;
    sheet(`<div class="row" style="justify-content:space-between"><h2>✨ ${esc(b.zo)} ban phúc</h2><button class="btn icon-btn ghost" data-close aria-label="Đóng">${I.x}</button></div>
      <p>${effectText(F.beastPower(id, s.lv))}</p>
      <p class="small muted">Thể lực ⚡ ${st}/${F.STAMINA} · cấp ${s.lv}: ${F.STAMINA_PER_CROP[s.lv - 1]} ⚡ mỗi cây. Chọn cây muốn ban phúc:</p>
      <div class="list">${targets.map((i, k) => {
        const p = f.plots[i], c = F.CROP[p.c], left = F.remaining(p.at, c.min, now);
        return `<label class="item"><input type="checkbox" data-castpick value="${i}"${k < n ? " checked" : ""}>
          <span class="t">${c.emo} <b>${esc(c.vi)}</b> · ô ${i + 1}<br><span class="small muted">${left ? `còn ${fmtLeft(left)}` : "đã chín"}${p.pb ? ` · đang +${p.pb}% giá` : ""}</span></span><span></span></label>`;
      }).join("")}</div>
      <p class="feedback" id="castcost"></p>
      <div class="row"><button type="button" class="btn primary" data-castgo="${id}">Ban phúc</button><button type="button" class="btn ghost" data-close>Đóng</button></div>`, `${b.zo} ban phúc`);
    castCost(id);
  }
  function castCost(id) {
    const s = S.farm.beasts[id], st = F.stamina(S.farm, id, today());
    const n = document.querySelectorAll("#sheet [data-castpick]:checked").length, cost = F.castCost(s.lv, n);
    const out = $("#castcost"), go = $("#sheet [data-castgo]");
    if (!out || !go) return;
    out.className = `feedback ${cost <= st && n ? "ok" : "no"}`;
    out.textContent = n ? `${n} cây · tốn ${cost}/${st} ⚡ thể lực${cost > st ? " — không đủ thể lực" : ""}` : "Chưa chọn cây nào";
    go.disabled = !n || cost > st;
  }

  // ---------- Bảng xếp hạng (online) ----------
  const NET = window.Online.create(window.NHIP_ONLINE || {});
  const BOARD_KEY = "nhip.board";
  let board = (() => { try { return JSON.parse(localStorage.getItem(BOARD_KEY)) || null; } catch (e) { return null; } })();
  let boardLoading = false, boardTriedAt = 0, lastPushAt = 0, lastPushed = "";
  const urlRoom = (new URLSearchParams(location.search).get("lop") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  function myStats() {
    const t = today(), wk = C.isoWeek(t);
    let wxp = 0;
    for (const [d, v] of Object.entries(S.days)) if (C.isoWeek(d) === wk) wxp += v.xp || 0;
    const av = S.online && S.online.avatar;
    return { xp: S.xp, week_xp: wxp, week: wk, words: Object.keys(S.progress.kids).length + Object.keys(S.progress.toeic).length,
      streak: C.liveStreak(S.streak, t), farm_lv: F.level(S.farm.xp), beasts: Object.keys(S.farm.beasts).length, avatar: av && S.farm.beasts[av] ? av : "" };
  }
  function lostSeat() {
    S.online = null; board = null; flush();
    try { localStorage.removeItem(BOARD_KEY); } catch (e) { /* ignore */ }
    toast(Online.message("no_player"), 4000);
    if (U.tab === "rank") render();
  }
  async function pushStats(force) {
    if (!S.online || !NET.configured || NET.offline()) return;
    const stats = myStats(), js = JSON.stringify(stats), now = Date.now();
    if (!force && js === lastPushed && now - lastPushAt < 10 * 60 * 1000) return;
    lastPushAt = now;
    try {
      const r = await NET.sync(S.online.token, stats);
      if (r.ok) lastPushed = js;
      else if (r.error === "too_fast") lastPushAt = now - Online.SYNC_EVERY + (+r.retry_in || 20) * 1000;
      else if (r.error === "no_player") lostSeat();
    } catch (e) { /* offline: Online backs off by itself */ }
  }
  async function fetchBoard(force) {
    if (!S.online || boardLoading || !NET.configured) return;
    if (!force && board && board.room === S.online.room && Date.now() - board.at < Online.BOARD_TTL) return;
    boardLoading = true; boardTriedAt = Date.now(); U.boardErr = "";
    try {
      await pushStats();
      const r = await NET.board(S.online.token, C.isoWeek(today()));
      if (r.ok && Array.isArray(r.players)) {
        board = { at: Date.now(), room: String(r.room), max: +r.max || 15, players: r.players.slice(0, 50).map((p) => ({
          name: String(p.name || "?").slice(0, 20), me: p.me === true, xp: +p.xp || 0, week_xp: +p.week_xp || 0, words: +p.words || 0,
          streak: +p.streak || 0, farm_lv: +p.farm_lv || 1, beasts: +p.beasts || 0, avatar: BIMG[p.avatar] ? p.avatar : "", seen: p.seen ? Date.parse(p.seen) || 0 : 0 })) };
        try { localStorage.setItem(BOARD_KEY, JSON.stringify(board)); } catch (e) { /* ignore */ }
      } else if (r.error === "no_player") lostSeat();
      else U.boardErr = Online.message(r.error);
    } catch (e) { U.boardErr = Online.message(e.code); }
    boardLoading = false;
    if (U.tab === "rank" || U.tab === "today") render();
  }
  async function joinClass() {
    const isNew = U.joinMode !== "login";
    const room = $("#j-room").value.trim().toUpperCase(), name = $("#j-name").value.trim().replace(/\s+/g, " "), pin = $("#j-pin").value.trim();
    Object.assign(U, { joinRoom: room, joinName: name, joinErr: "" });
    const bad = !/^[A-Z0-9]{4,12}$/.test(room) ? "Mã lớp gồm 4–12 chữ cái hoặc số (thầy cô sẽ gửi cho bạn)"
      : name.length < 2 || name.length > 20 ? "Tên hiển thị cần 2–20 ký tự"
      : !/^[0-9]{4,6}$/.test(pin) ? (isNew ? "Hãy tự đặt một mã PIN gồm 4–6 chữ số" : "Mã PIN gồm 4–6 chữ số")
      : isNew && pin !== $("#j-pin2").value.trim() ? "Hai lần nhập mã PIN chưa giống nhau" : "";
    if (bad) { U.joinErr = bad; render(); return; }
    U.joining = true; render();
    try {
      const r = await NET.join(room, name, pin);
      if (r.ok) {
        S.online = { room: r.room, name: r.name, token: r.token, avatar: "" };
        board = null; lastPushAt = 0; lastPushed = ""; flush();
        toast(r.new ? `🎉 Đã tạo tài khoản cho ${r.name} trong lớp ${r.room}. Nhớ mã PIN của bạn nhé!`
          : isNew ? `Tên ${r.name} đã có sẵn và PIN khớp — bạn đã đăng nhập lại.` : `👋 Chào mừng ${r.name} quay lại lớp ${r.room}!`, 4500);
      } else if (isNew && r.error === "wrong_pin") {
        U.joinErr = `Tên “${name}” đã có người dùng trong lớp. Hãy chọn tên khác (thêm họ hoặc số), hoặc chọn “Đã có tài khoản” nếu đó là bạn.`;
      } else U.joinErr = Online.message(r.error) + (r.error === "room_full" && r.max ? ` (${r.max} người)` : "");
    } catch (e) { U.joinErr = Online.message(e.code); }
    U.joining = false;
    if (U.tab === "rank") render();
  }
  const ago = (ms) => { if (!ms) return ""; const m = Math.round((Date.now() - ms) / 60000); return m < 10 ? "vừa hoạt động" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
  const hhmm = (ms) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const avatar = (p) => (BIMG[p.avatar] ? `<img class="av" src="${BIMG[p.avatar]}" alt="">` : `<span class="av" aria-hidden="true">${esc(Array.from(p.name)[0] || "?").toUpperCase()}</span>`);
  function myRank(by) {
    if (!board || !S.online || board.room !== S.online.room) return null;
    const list = Online.rank(board.players, by), me = list.find((p) => p.me);
    return me ? { me, list } : null;
  }
  function vRank() {
    const head = (extra = "") => `<section class="hello"><div><p class="label">${S.online ? `Lớp ${esc(S.online.room)} · ${esc(S.online.name)}` : "Cùng học, cùng đua"}</p><h1>Bảng xếp hạng</h1></div>${extra}</section>`;
    if (!NET.configured) {
      return head() + `<section class="panel stack"><h2>Chưa bật chế độ trực tuyến</h2>
        <p>Bảng xếp hạng lớp cần một máy chủ nhỏ (miễn phí). Người quản lý lớp làm theo hướng dẫn trong file <b>ONLINE.md</b> của dự án (khoảng 10 phút), sau đó mọi người mở lại app là thấy.</p>
        <p class="small muted">Mọi tính năng học và nông trại vẫn chạy đầy đủ khi chưa bật.</p></section>`;
    }
    if (!S.online) {
      const isNew = U.joinMode !== "login", show = U.showPin ? "text" : "password";
      const field = (label, input, hint = "") => `<label class="stack" style="gap:4px"><span class="label">${label}</span>${input}${hint ? `<span class="small muted">${hint}</span>` : ""}</label>`;
      return head() + `<section class="panel stack"><h2>Tham gia lớp</h2>
        <div class="seg" role="group" aria-label="Bạn đã có tài khoản chưa?">
          <button type="button" data-joinmode="new" aria-pressed="${isNew}">Lần đầu tham gia</button><button type="button" data-joinmode="login" aria-pressed="${!isNew}">Đã có tài khoản</button></div>
        <p class="muted">${isNew ? "Nhập mã lớp thầy cô gửi, chọn tên hiển thị và <b>tự đặt mã PIN</b> (4–6 chữ số). Ghi nhớ tên + PIN để đăng nhập lại trên máy khác."
          : "Nhập đúng mã lớp, tên và mã PIN bạn đã tạo lần đầu."}</p>
        <form data-joinform class="stack" style="max-width:420px" novalidate>
          ${field("Mã lớp", `<input type="text" id="j-room" value="${esc(U.joinRoom || urlRoom)}" maxlength="12" autocapitalize="characters" autocomplete="off">`)}
          ${field("Tên hiển thị", `<input type="text" id="j-name" value="${esc(U.joinName || "")}" maxlength="20" autocomplete="nickname">`, isNew ? "2–20 ký tự, ví dụ: Lan Anh, Minh 7A" : "")}
          ${field(isNew ? "Tạo mã PIN của bạn" : "Mã PIN", `<input type="${show}" id="j-pin" inputmode="numeric" maxlength="6" autocomplete="${isNew ? "new-password" : "current-password"}">`, isNew ? "4–6 chữ số, tự nghĩ ra, không chia sẻ cho bạn khác" : "")}
          ${isNew ? field("Nhập lại mã PIN", `<input type="${show}" id="j-pin2" inputmode="numeric" maxlength="6" autocomplete="new-password">`) : ""}
          <label class="row small" style="gap:6px"><input type="checkbox" id="j-show"${U.showPin ? " checked" : ""}> Hiện mã PIN</label>
          ${U.joinErr ? `<p class="feedback no" role="alert">${esc(U.joinErr)}</p>` : ""}
          <div><button class="btn primary"${U.joining ? " disabled" : ""}>${U.joining ? "Đang kết nối…" : isNew ? "Tạo tài khoản & vào lớp" : "Đăng nhập"}</button></div>
        </form>
        <p class="small muted">Bạn cùng lớp chỉ thấy tên, XP, chuỗi ngày, số từ đã học và cấp nông trại của bạn.</p></section>`;
    }
    if (!boardLoading && Date.now() - boardTriedAt > 15000 && (!board || board.room !== S.online.room || Date.now() - board.at >= Online.BOARD_TTL)) setTimeout(fetchBoard, 0);
    const offline = NET.offline() || !!U.boardErr;
    const status = `<span class="chip ${offline ? "warn" : "good"}">${boardLoading ? "Đang cập nhật…" : offline ? "Ngoại tuyến" : "Trực tuyến"}</span>`;
    if (!board || board.room !== S.online.room) {
      return head(status) + `<section class="panel"><p class="muted">${U.boardErr ? esc(U.boardErr) : "Đang tải bảng xếp hạng…"}</p></section>`;
    }
    const by = U.rankBy, M = Online.METRICS[by], { me, list } = myRank(by) || { list: Online.rank(board.players, by) };
    const valText = (p) => (by === "farm" ? `cấp ${p.farm_lv}` : `${p.value} ${M.unit}`);
    let gapText = "";
    if (me) {
      const above = list.filter((p) => p.value > me.value).pop();
      gapText = me.rank === 1 ? "🏆 Bạn đang dẫn đầu — giữ vững phong độ nhé!"
        : by === "farm" ? `Nâng cấp nông trại và thu phục Linh Thú để vượt ${esc(above.name)}!`
        : `Còn <b>${above.value - me.value + 1} ${M.unit}</b> nữa là vượt ${esc(above.name)}!`;
    }
    const medal = ["🥇", "🥈", "🥉"];
    const owned = Object.keys(S.farm.beasts).filter((id) => BIMG[id]);
    return head(status) + `
      ${me ? `<section class="panel row rank-me"><span class="big num">#${me.rank}</span><div class="stack" style="gap:2px;flex:1 1 200px">
        <b>Bạn đứng thứ ${me.rank}/${list.length} · ${M.label}</b><span>${gapText}</span></div></section>` : ""}
      <div class="seg" role="group" aria-label="Xếp theo">${Object.entries(Online.METRICS).map(([id, m]) => `<button type="button" data-rankby="${id}" aria-pressed="${by === id}">${m.label}</button>`).join("")}</div>
      <ol class="ranks">${list.map((p) => `<li class="rk${p.me ? " me" : ""}${p.rank <= 3 ? ` top${p.rank}` : ""}">
        <span class="pos">${p.rank <= 3 && p.value > 0 ? medal[p.rank - 1] : p.rank}</span>${avatar(p)}
        <span class="t"><b>${esc(p.name)}</b>${p.me ? ' <span class="chip new">Bạn</span>' : ""}<br>
          <span class="small muted">🔥 ${p.streak} · 📚 ${p.words} từ · 🌾 cấp ${p.farm_lv} · 🐉 ${p.beasts}${p.seen ? ` · ${ago(p.seen)}` : ""}</span></span>
        <b class="val num">${valText(p)}</b></li>`).join("")}</ol>
      <section class="panel stack">
        <div class="row" style="justify-content:space-between"><span class="small muted">${list.length}/${board.max} người · cập nhật lúc ${hhmm(board.at)}${U.boardErr ? ` · ${esc(U.boardErr)}` : ""}</span>
          <button type="button" class="btn sm" data-rankrefresh${boardLoading ? " disabled" : ""}>Làm mới</button></div>
        ${owned.length ? `<p class="label">Ảnh đại diện (Linh Thú của bạn)</p><div class="avatars">
          <button type="button" data-avatar="" aria-pressed="${!S.online.avatar}" aria-label="Chữ cái đầu tên"><span class="av">${esc(Array.from(S.online.name)[0] || "?").toUpperCase()}</span></button>
          ${owned.map((id) => `<button type="button" data-avatar="${id}" aria-pressed="${S.online.avatar === id}" aria-label="${esc(F.BEAST[id].zo)}"><img src="${BIMG[id]}" alt=""></button>`).join("")}</div>`
          : `<p class="small muted">Thu phục Linh Thú ở nông trại để dùng làm ảnh đại diện.</p>`}
        <div class="row">${U.leaveAsk ? `<span class="small">Rời lớp sẽ xoá bạn khỏi bảng xếp hạng (dữ liệu học trên máy vẫn giữ).</span>
          <button type="button" class="btn sm" data-leave="yes" style="color:var(--bad)">Rời lớp</button><button type="button" class="btn sm primary" data-leave="no">Ở lại</button>`
          : `<button type="button" class="btn sm ghost" data-leave="ask">Rời lớp…</button>`}</div>
      </section>`;
  }

  // ---------- Tiến độ ----------
  function vMe() {
    const learned = (l) => Object.keys(S.progress[l]).length;
    const p = prog(), counts = C.boxCounts(p), maxBox = Math.max(1, ...counts);
    const mastered = Object.values(S.progress).reduce((n, pl) => n + Object.values(pl).filter((c) => c.box >= C.MASTER_BOX).length, 0);
    const stats = { words: learned("kids") + learned("toeic"), mastered, best: S.streak.best || 0, sentences: Object.keys(S.sent).length, ipa: S.ipa.length, xp: S.xp };
    const seg = (attr, cur, opts) => `<div class="seg" role="group">${opts.map(([id, l]) => `<button type="button" ${attr}="${id}" aria-pressed="${cur === id}">${l}</button>`).join("")}</div>`;
    return `<section class="hello"><div><p class="label">Tiến độ</p><h1>Tiến độ của bạn</h1></div></section>
      <div class="grid g3">
        <section class="panel goal"><p class="label">Tổng XP</p><p class="big">${S.xp}</p><p class="small muted">Chuỗi hiện tại ${C.liveStreak(S.streak, today())} ngày · kỷ lục ${stats.best} ngày</p></section>
        <section class="panel goal"><p class="label">Từ đã học</p><p class="big">${stats.words}</p><p class="small muted">Lớp 7: ${learned("kids")}/${WORDS.kids.length} · TOEIC: ${learned("toeic")}/${WORDS.toeic.length} · đã thuộc ${mastered}</p></section>
        <section class="panel goal"><p class="label">Câu & âm</p><p class="big">${stats.sentences}<small> câu</small></p><p class="small muted">IPA: ${stats.ipa}/44 âm đã học</p></section>
      </div>
      <div class="grid g2">
        <section class="panel stack"><h2>Hộp ôn tập · ${LEVELS[S.level]}</h2>
          <p class="small muted">Mỗi lần nhớ đúng, từ lên một hộp và lâu hơn mới phải ôn lại (1 → 60 ngày). Từ ở hộp ${C.MASTER_BOX}+ được tính là đã thuộc.</p>
          <div class="boxes">${counts.map((n, i) => `<div title="Hộp ${i}: ${n} từ"><span class="num">${n}</span><i style="height:${Math.round((n / maxBox) * 64) + 2}px"></i><span>${i === 0 ? "Mới" : "H" + i}</span></div>`).join("")}</div></section>
        <section class="panel stack"><h2>Huy hiệu</h2><div class="badges">${C.badges(stats).map((b) =>
          `<div class="badge${b.on ? " on" : ""}"><span class="m">${b.icon}</span>${esc(b.name)}</div>`).join("")}</div></section>
      </div>
      <section class="panel"><h2>Cài đặt</h2>
        <div class="setting"><div><b>Từ mới mỗi ngày</b><p class="small muted">Gợi ý 5–10 từ để kịp ôn đều.</p></div>${stepper("perday", S.perday)}</div>
        <div class="setting"><div><b>Câu giao tiếp mỗi ngày</b></div>${stepper("sentper", S.sentPerDay)}</div>
        <div class="setting"><div><b>Giọng đọc</b><p class="small muted">Dùng giọng có sẵn trên thiết bị.</p></div>${seg("data-accent", S.accent, [["en-US", "Mỹ (US)"], ["en-GB", "Anh (UK)"]])}</div>
        <div class="setting"><div><b>Tốc độ đọc</b> <span class="muted num" id="rate-v">${S.rate.toFixed(1)}×</span></div>
          <input type="range" id="rate" min="0.6" max="1.2" step="0.1" value="${S.rate}" style="width:200px" aria-label="Tốc độ đọc"></div>
        <div class="setting"><div><b>Giao diện</b></div>${seg("data-theme", S.theme, [["auto", "Tự động"], ["light", "Sáng"], ["dark", "Tối"]])}</div>
        <div class="setting"><div><b>Sao lưu</b><p class="small muted">Lưu tiến độ và hình tự đổi ra file để chuyển sang máy khác.</p></div>
          <div class="row"><button type="button" class="btn sm" data-export>Xuất file</button><label class="btn sm">Nhập file<input type="file" accept="application/json,.json" id="import-in" hidden></label></div></div>
        <div class="setting"><div><b>Xoá tiến độ</b><p class="small muted">Xoá từ đã học, câu, IPA, XP, chuỗi ngày và nông trại. Cài đặt được giữ lại.</p></div>
          ${U.reset ? `<div class="row"><span class="small" style="color:var(--bad)">Chắc chắn? Không thể hoàn tác.</span><button type="button" class="btn sm" data-reset="yes" style="color:var(--bad)">Xoá hết</button><button type="button" class="btn sm primary" data-reset="no">Huỷ</button></div>`
            : `<button type="button" class="btn sm" data-reset="ask">Xoá tiến độ…</button>`}</div>
      </section>`;
  }
  function exportData() {
    flush();
    const blob = new Blob([JSON.stringify({ app: "nhip", v: 1, state: S, pics: PICS })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `nhip-sao-luu-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importData(file) {
    try {
      const o = JSON.parse(await file.text());
      if (!o || o.app !== "nhip" || !o.state || !o.state.progress) throw new Error("bad file");
      S = merge(o.state); flush(); applyTheme();
      for (const [k, v] of Object.entries(o.pics || {})) { const p = cleanPic(v); if (p && BYKEY[k]) { PICS[k] = p; await DB.put(k, p); } }
      render(); toast("Đã nhập dữ liệu sao lưu");
    } catch (e) { toast("File sao lưu không hợp lệ"); }
  }

  // ---------- Events ----------
  const H = {
    tab: (v) => { if (v === "words" && U.tab === "words") U.vocab = { mode: "home" }; go(v); },
    level: (v) => { if (S.level === v) return; S.level = v; U.vocab = { mode: "home" }; U.btopic = ""; save(); render(); },
    go: (v) => (v === "learn" ? startLearn() : v === "review" ? startReview() : go(v)),
    step: (v, t) => {
      const d = +t.dataset.d;
      if (v === "perday") S.perday = clamp(S.perday + d, PERDAY);
      else { S.sentPerDay = clamp(S.sentPerDay + d, SENTPER); }
      save(); render();
    },
    vocab: (v) => (v === "learn" ? startLearn() : v === "review" ? startReview() : (U.vocab = { mode: v }, render(), scrollTo(0, 0))),
    learntopic: (v) => startLearn(+v),
    learnstep: (v) => {
      const L = U.vocab; L.i = clamp(L.i + +v, [0, L.words.length - 1]); render(); say(L.words[L.i].w);
    },
    startquiz: () => startQuiz(),
    choice: (v) => { const q = U.vocab.qs[U.vocab.i]; answerQuiz(+v === q.answer, +v); },
    quiznext: () => {
      const v = U.vocab;
      if (v.i < v.qs.length - 1) { v.i++; v.answered = null; v.picked = null; render(); if (v.qs[v.i].type === "spell") say(v.qs[v.i].word.w); }
      else { v.mode = "result"; render(); farmReward("lesson", "Hoàn thành lượt học"); }
    },
    reveal: () => { U.vocab.reveal = true; render(); say(U.vocab.queue[U.vocab.i].w); },
    grade: (v) => gradeReview(+v),
    say: (v, t) => say(v, { slow: "slow" in t.dataset }),
    sayuk: (v) => say(v, { lang: "en-GB" }),
    try: (v, t) => tryPron(v, t),
    rec: (v, t) => toggleRec(t),
    open: (v) => openWord(v),
    editpic: (v) => openPicEditor(v),
    mode: (v) => { draft.mode = v; renderEditor(); },
    emo: (v) => { draft.emo = v; draft.img = ""; updatePv(); },
    bg: (v, t) => {
      draft.bg = v; draft.img = ""; updatePv();
      t.parentNode.querySelectorAll("[data-bg]").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
    },
    pen: (v, t) => { draft.pen = v; t.parentNode.querySelectorAll("[data-pen]").forEach((b) => b.setAttribute("aria-pressed", String(b === t))); },
    clearcanvas: () => { draft.img = ""; renderEditor(); },
    savepic: () => savePic(false),
    resetpic: () => savePic(true),
    close: () => closeModal(),
    track: (v) => { S.track = v; save(); render(); },
    sentview: (v) => { U.sentView = v; render(); },
    stage: (v) => { U.stage = v; render(); },
    scr: (v) => startScramble(v),
    pick: (v, t) => moveTile(t.dataset.k, "pool", +v),
    unpick: (v, t) => moveTile(t.dataset.k, "ans", +v),
    learnsent: (v) => {
      if (S.sent[v]) return;
      S.sent[v] = today(); bump("s"); addXP(XP.sent); render(); toast(`Đã thuộc câu này +${XP.sent} XP`);
    },
    moresent: () => {
      const track = S.track, have = new Set(todaySents(track).map((s) => s.key));
      const more = SENTS[track].filter((s) => !S.sent[s.key] && !have.has(s.key)).slice(0, S.sentPerDay).map((s) => s.key);
      if (!more.length) { toast("Bạn đã xem hết câu của chủ đề này 🎉"); return; }
      S.sentDay[track].push(...more); save(); render();
    },
    sound: (v) => pickSound(v),
    ipastep: (v) => { const st = D.ipa.path[+v]; pickSound(st.sounds.find((s) => !S.ipa.includes(s)) || st.sounds[0]); },
    ipalearn: (v) => {
      if (S.ipa.includes(v)) S.ipa = S.ipa.filter((x) => x !== v); else { S.ipa.push(v); addXP(XP.ipa); }
      save(); render();
    },
    pairquiz: (v) => startPair(v),
    pairreplay: () => say(U.pair.pr[U.pair.said], { lang: "en-GB" }),
    pairpick: (v) => {
      const P = U.pair; if (P.picked != null) return;
      P.picked = +v; P.n++;
      if (P.picked === P.said) { P.right++; addXP(XP.pair); }
      renderDetail();
    },
    accent: (v) => { S.accent = v; save(); render(); say("Hello! Nice to meet you."); },
    theme: (v) => { S.theme = v; applyTheme(); save(); render(); },
    farm: () => go("farm"),
    farmfull: () => setFarmFull(!U.farmFull),
    plotidx: (v) => plotClick(+v),
    plant: (v, t) => { const c = F.CROP[v]; farmDone(F.plant(S.farm, +t.dataset.plot, v, Date.now()), `Đã gieo ${c.emo} ${c.vi} — chín sau ${fmtMin(c.min)}`); },
    plantall: (v) => {
      const c = F.CROP[v]; let n = 0, r = { ok: true };
      S.farm.plots.forEach((p, i) => { if (!p.c && r.ok) { r = F.plant(S.farm, i, v, Date.now()); if (r.ok) n++; } });
      farmDone(n ? { ok: true } : r, `Đã gieo ${n} ô ${c.emo} ${c.vi}${r.ok ? "" : " (hết xu)"}`);
    },
    harvestall: () => {
      const got = {}, done = []; let r = { ok: true }, lvUp = 0, bonus = 0;
      S.farm.plots.forEach((p, i) => {
        if (r.ok && F.plotReady(p, Date.now())) {
          r = F.harvest(S.farm, i, Date.now());
          if (r.ok) { got[r.item] = (got[r.item] || 0) + 1; lvUp = r.levelUp || lvUp; bonus += r.bonus; done.push([i, F.ITEMS[r.item].emo]); }
        }
      });
      const list = Object.entries(got).map(([id, n]) => `${n} ${F.ITEMS[id].emo}`).join(", ");
      if (!list) { toast(r.ok ? "Chưa có cây nào chín" : r.msg); return; }
      farmDone({ ok: true, levelUp: lvUp }, `Thu hoạch: ${list}${bonus ? ` · +${bonus} xu nhờ Linh Thú ✨` : ""}${r.ok ? "" : " — kho đã đầy"}`, null,
        () => done.forEach(([i, emo]) => floatAt($(`.land [data-plotidx="${i}"]`), `+1 ${emo}`)));
    },
    fert: (v) => farmDone(F.fertilize(S.farm, +v, Date.now()), "Cây đã chín nhờ phân bón 🧪"),
    uproot: (v) => farmDone(F.uproot(S.farm, +v), "Đã dọn ô đất"),
    beastinfo: (v) => beastSheet(v),
    beastbuy: (v) => { const b = F.BEAST[v]; farmDone(F.buyBeast(S.farm, v, today()), `🎉 ${b.zo} – ${b.vi} đã về nông trại!`, b.en); },
    beastup: (v) => { const b = F.BEAST[v], r = F.upgradeBeast(S.farm, v); farmDone(r, r.ok && `⭐ ${b.zo} lên cấp ${r.lv}!`); },
    beastcast: (v) => castSheet(v),
    castgo: (v) => {
      const idx = [...document.querySelectorAll("#sheet [data-castpick]:checked")].map((x) => +x.value), b = F.BEAST[v];
      const r = F.cast(S.farm, v, idx, Date.now(), today());
      farmDone(r, r.ok && `✨ ${b.zo} đã ban phúc ${r.n} cây (−${r.cost} ⚡)`, null, () => blessFx(v, idx));
    },
    rankby: (v) => { U.rankBy = v; render(); },
    joinmode: (v) => { keepJoinFields(); U.joinMode = v; U.joinErr = ""; render(); },
    rankrefresh: () => { if (board && Date.now() - board.at < 10000) toast("Bảng vừa được cập nhật"); else fetchBoard(true); },
    avatar: (v) => { S.online.avatar = v; save(); lastPushed = ""; pushStats(true); render(); },
    leave: (v) => {
      if (v === "ask") U.leaveAsk = true;
      else if (v === "no") U.leaveAsk = false;
      else {
        NET.leave(S.online.token).catch(() => {});
        S.online = null; board = null; U.leaveAsk = false; flush();
        try { localStorage.removeItem(BOARD_KEY); } catch (e) { /* ignore */ }
        toast("Đã rời lớp");
      }
      render();
    },
    recover: () => { U.tab = "today"; U.vocab = { mode: "home" }; closeModal(); render(); },
    reload: () => location.reload(),
    buyplot: () => farmDone(F.buyPlot(S.farm), "Đã mở thêm một ô đất 🟫"),
    animalshop: () => animalShop(),
    buyanimal: (v) => {
      const a = F.ANIMAL[v];
      farmDone(F.buyAnimal(S.farm, v, Date.now()), `Chào mừng ${a.emo} ${a.vi} đến nông trại!`, a.en, () => {
        const pen = $(`.pgroup[data-ranch="${v}"]`);
        if (pen) { pen.classList.add("new"); pen.scrollIntoView({ block: "center", behavior: "smooth" }); }
      });
    },
    collect: (v) => {
      const kind = S.farm.animals[+v] && S.farm.animals[+v].a, r = F.collect(S.farm, +v, Date.now()), it = r.ok && F.ITEMS[r.item];
      farmDone(r, it && `+1 ${it.emo} ${it.en} (${it.vi})`, it && it.en, () => floatAt($(`.land [data-animalidx="${v}"]`), `+1 ${it.emo}`));
    },
    animalidx: (v) => { const x = S.farm.animals[+v]; if (!x) return; if (F.animalReady(x, Date.now())) H.collect(v); else animalSheet(+v); },
    collectall: () => {
      const now = Date.now(), got = []; let r = { ok: true }, lvUp = 0;
      S.farm.animals.forEach((x, i) => {
        if (r.ok && F.animalReady(x, now)) { r = F.collect(S.farm, i, now); if (r.ok) { got.push([i, F.ITEMS[r.item].emo]); lvUp = r.levelUp || lvUp; } }
      });
      if (!got.length) { toast(r.ok ? "Chưa có sản phẩm nào sẵn sàng" : r.msg); return; }
      const sum = {}; got.forEach(([, e]) => { sum[e] = (sum[e] || 0) + 1; });
      farmDone({ ok: true, levelUp: lvUp }, `Thu: ${Object.entries(sum).map(([e, n]) => `${n} ${e}`).join(", ")}${r.ok ? "" : " — kho đã đầy"}`, null,
        () => got.forEach(([i, e]) => floatAt($(`.land [data-animalidx="${i}"]`), `+1 ${e}`)));
    },
    boost: (v) => farmDone(F.feedBoost(S.farm, +v, Date.now()), "Vật nuôi đã sẵn sàng 🧪"),
    sell: (v) => { const r = F.sell(S.farm, v, 1); farmDone(r, r.ok && `🚚 Đã chở đi bán: +${r.coins} xu`, null, () => truckRun([F.ITEMS[v].emo], r.coins)); },
    upbarn: () => farmDone(F.upgradeBarn(S.farm), "Nhà kho đã rộng hơn"),
    deliver: (v) => {
      const o = S.farm.orders[+v], goods = o ? Object.entries(o.need).flatMap(([id, q]) => Array(q).fill(F.ITEMS[id].emo)) : [];
      const r = F.deliver(S.farm, +v, Math.random);
      farmDone(r, r.ok && `🚚 Đã giao hàng: +${r.coins} xu`, null, () => truckRun(goods, r.coins));
    },
    skiporder: (v) => farmDone(F.skipOrder(S.farm, +v, Math.random), "Đã đổi đơn hàng mới"),
    buydeco: (v) => { const d = F.DECO[v]; farmDone(F.buyDeco(S.farm, v), `Đã đặt ${d.emo} ${d.vi} — xu khi học +${d.bonus}%`, d.en); },
    export: () => exportData(),
    reset: (v) => {
      if (v === "ask") U.reset = true;
      else if (v === "no") U.reset = false;
      else {
        const keep = { level: S.level, perday: S.perday, sentPerDay: S.sentPerDay, track: S.track, rate: S.rate, accent: S.accent, theme: S.theme };
        S = { ...fresh(), ...keep }; U.reset = false; U.scr = {}; U.vocab = { mode: "home" }; flush(); toast("Đã xoá tiến độ");
      }
      render();
    },
  };
  const FARM_ACTIONS = new Set(["plotidx", "plant", "plantall", "harvestall", "fert", "uproot", "buyplot", "animalshop", "buyanimal", "collect", "boost", "animalidx", "collectall",
    "beastbuy", "beastup", "beastcast", "castgo",
    "sell", "upbarn", "deliver", "skiporder", "buydeco"]);
  document.addEventListener("click", (e) => {
    if (e.target.id === "modal") { closeModal(); return; }
    const t = e.target.closest("button"); if (!t || t.disabled) return;
    for (const k in H) if (k in t.dataset) {
      if (FARM_ACTIONS.has(k) && !gateNow().open) { if (!$("#modal").hidden) closeModal(); toast("🔒 Nông trại đang khoá — học thêm để chơi nhé"); render(); return; }
      try { H[k](t.dataset[k], t, e); } catch (err) { console.error("action failed", k, err); toast("Có lỗi nhỏ, bạn thử lại nhé — dữ liệu vẫn an toàn"); render(); }
      return;
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.matches("[data-joinform]")) { e.preventDefault(); if (!U.joining) joinClass(); return; }
    if (!e.target.matches("[data-spellform]")) return;
    e.preventDefault();
    const q = U.vocab.qs[U.vocab.i];
    answerQuiz(C.checkSpelling($("#spell-in").value, q.answer), null);
  });
  let bqT;
  // Keep what the learner typed when the join form re-renders; PIN boxes accept digits only.
  function keepJoinFields() { const r = $("#j-room"), n = $("#j-name"); if (r) U.joinRoom = r.value.trim().toUpperCase(); if (n) U.joinName = n.value; }
  document.addEventListener("input", (e) => {
    if (e.target.id === "j-pin" || e.target.id === "j-pin2") { const v = e.target.value.replace(/\D/g, ""); if (v !== e.target.value) e.target.value = v; }
    if (e.target.id === "bq") { U.bq = e.target.value; clearTimeout(bqT); bqT = setTimeout(() => { const l = $("#blist"); if (l) l.innerHTML = browseList(); }, 200); }
    if (e.target.id === "rate") { S.rate = +e.target.value; $("#rate-v").textContent = S.rate.toFixed(1) + "×"; save(); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "j-show") {
      U.showPin = e.target.checked;
      document.querySelectorAll("#j-pin, #j-pin2").forEach((x) => { x.type = U.showPin ? "text" : "password"; });
    }
    if (e.target.matches("[data-castpick]")) { const go = $("#sheet [data-castgo]"); if (go) castCost(go.dataset.castgo); }
    if (e.target.id === "btopic") { U.btopic = e.target.value; $("#blist").innerHTML = browseList(); }
    if (e.target.id === "import-in" && e.target.files[0]) importData(e.target.files[0]);
    if (e.target.id === "rate") say("This is the reading speed.");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal").hidden) { closeModal(); return; }
    if (e.target.matches("input, select, textarea") || !$("#modal").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const v = U.vocab;
    if (U.tab !== "words") return;
    if (v.mode === "learn" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const n = e.key === "ArrowRight" ? 1 : -1;
      if (n === 1 && v.i === v.words.length - 1) startQuiz(); else H.learnstep(n);
    } else if (v.mode === "review" && v.i < v.queue.length) {
      if (!v.reveal && (e.key === " " || e.key === "Enter")) { e.preventDefault(); H.reveal(); }
      else if (v.reveal && "1234".includes(e.key) && e.key.length === 1) gradeReview(+e.key - 1);
    }
  });

  // ---------- Start ----------
  let lastOops = 0;
  const oops = () => { if (Date.now() - lastOops > 10000) { lastOops = Date.now(); toast("Có lỗi nhỏ — app vẫn chạy, dữ liệu vẫn an toàn"); } };
  addEventListener("error", oops);
  addEventListener("unhandledrejection", oops);
  if (urlRoom && !S.online && NET.configured) U.tab = "rank";
  applyTheme();
  render();
  DB.loadAll().then((pics) => { PICS = pics; if (Object.keys(pics).length && $("#modal").hidden) render(); });
  if ("serviceWorker" in navigator && document.querySelector('link[rel="manifest"]')) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
