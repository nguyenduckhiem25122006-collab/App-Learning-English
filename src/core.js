/* Pure logic shared by the app and the Node tests: dates, Leitner review schedule, streaks, quizzes, scoring. */
(function (root) {
  "use strict";

  // ===== CONFIG =====
  const INTERVALS = [1, 2, 4, 7, 15, 30, 60]; // days until next review, by box
  const MASTER_BOX = 5;                        // box at which a word counts as "thuộc"
  const BATCH = 5;                             // new words per learn session
  // ==================

  const pad = (n) => String(n).padStart(2, "0");
  const dstr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  /** ISO-8601 week of a local date, e.g. "2026-W43" (weeks start on Monday). */
  function isoWeek(s) {
    const d = parse(s);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Thursday of this week decides the year
    const jan4 = new Date(d.getFullYear(), 0, 4, 12);
    const wk = 1 + Math.round((daysBetween(dstr(jan4), dstr(d)) - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return `${d.getFullYear()}-W${pad(wk)}`;
  }

  /** Word id "word|pos", from a raw data row [word, pos, …] or a word object { w, pos }. */
  const wkey = (w) => (Array.isArray(w) ? `${w[0]}|${w[1]}` : w.key || `${w.w}|${w.pos}`);

  // ---- Leitner schedule ----
  const newCard = (today) => ({ box: 0, due: addDays(today, INTERVALS[0]), added: today, reps: 0, lapses: 0 });

  /** g: 0 = quên, 1 = khó, 2 = nhớ, 3 = dễ */
  function grade(card, g, today) {
    const c = { ...card, reps: (card.reps || 0) + 1, last: today };
    if (g <= 0) { c.box = 0; c.lapses = (card.lapses || 0) + 1; }
    else if (g === 1) c.box = Math.max(0, card.box);
    else c.box = Math.min(INTERVALS.length - 1, card.box + (g >= 3 ? 2 : 1));
    const days = g === 1 ? Math.max(1, Math.floor(INTERVALS[c.box] / 2)) : INTERVALS[c.box];
    c.due = addDays(today, days);
    return c;
  }

  const isDue = (card, today) => !!card && card.due <= today;
  const dueKeys = (progress, today) => Object.keys(progress || {})
    .filter((k) => isDue(progress[k], today))
    .sort((a, b) => progress[a].due.localeCompare(progress[b].due) || progress[a].box - progress[b].box);

  function boxCounts(progress) {
    const out = INTERVALS.map(() => 0);
    for (const c of Object.values(progress || {})) out[Math.min(c.box, out.length - 1)]++;
    return out;
  }

  // ---- Streak ----
  function touchStreak(streak, today) {
    const s = { count: 0, last: null, best: 0, ...(streak || {}) };
    if (s.last === today) return s;
    s.count = s.last && daysBetween(s.last, today) === 1 ? s.count + 1 : 1;
    s.last = today;
    s.best = Math.max(s.best || 0, s.count);
    return s;
  }
  /** Streak as displayed: still alive if the last active day is today or yesterday. */
  const liveStreak = (streak, today) => (streak && streak.last && daysBetween(streak.last, today) <= 1 ? streak.count : 0);

  // ---- Planning ----
  const planDays = (remaining, perday) => (remaining <= 0 ? 0 : Math.ceil(remaining / Math.max(1, perday)));

  function nextNew(words, progress, n, topic) {
    const out = [];
    const pick = (w) => { if (out.length < n && !progress[wkey(w)] && !out.includes(w)) out.push(w); };
    if (topic != null) words.filter((w) => w.topic === topic).forEach(pick);
    words.forEach(pick);
    return out;
  }

  // ---- Randomness ----
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; }
  function shuffle(arr, r = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---- Quiz ----
  /** Word objects: { w, pos, ipa, vi, ex, emo }. Returns one question per word, mixing three types. */
  function makeQuiz(batch, pool, r = Math.random) {
    const types = shuffle(["meaning", "word", "spell", "meaning", "word"], r);
    return batch.map((word, i) => {
      const type = types[i % types.length];
      if (type === "spell") return { type, word, answer: word.w };
      const field = type === "meaning" ? "vi" : "w";
      const others = shuffle(pool.filter((p) => p !== word && p[field] !== word[field]), r);
      const same = others.filter((p) => p.pos === word.pos);
      const picks = [];
      for (const p of same.concat(others)) {
        if (picks.length === 3) break;
        if (!picks.some((q) => q[field] === p[field])) picks.push(p);
      }
      const choices = shuffle([word, ...picks], r).map((p) => p[field]);
      return { type, word, choices, answer: choices.indexOf(word[field]) };
    });
  }

  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const checkSpelling = (input, answer) => norm(input) !== "" && norm(input) === norm(answer);

  function lev(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  /** 0..1 similarity of what was heard to the target, ignoring case and punctuation. */
  function similarity(heard, target) {
    const a = norm(heard), b = norm(target);
    if (!a || !b) return 0;
    return Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length));
  }

  // ---- Sentences ----
  const tokens = (sentence) => sentence.split(" ").filter(Boolean);
  /** Random order of the tiles (strings or { t } objects). Never the sentence itself or simply read backwards,
      and from 4 tiles up most of them leave their place, so the learner has to rebuild the sentence. */
  function scramble(toks, r = Math.random) {
    const n = toks.length, text = (x) => (typeof x === "string" ? x : x.t);
    if (n < 2) return toks.slice();
    const same = (a, b) => a.every((x, i) => text(x) === text(b[i]));
    const back = toks.slice().reverse(), maxStay = n < 4 ? 0 : Math.floor(n / 3);
    let best = null, bestStay = n + 1;
    for (let k = 0; k < 40; k++) {
      const s = shuffle(toks, r);
      if (same(s, toks) || (n > 2 && same(s, back))) continue;
      const stay = s.filter((x, i) => text(x) === text(toks[i])).length;
      if (stay <= maxStay) return s;
      if (stay < bestStay) { best = s; bestStay = stay; }
    }
    if (best) return best;
    return toks.slice(1).concat(toks[0]); // every tile identical but one: a rotation still differs
  }
  /** First n sentences (in course order) not learned yet; falls back to review of learned ones. */
  function pickSentences(list, learned, n) {
    const fresh = list.filter((s) => !learned[s]);
    return (fresh.length ? fresh : list).slice(0, n);
  }

  // ---- Badges ----
  const BADGES = [
    ["🌱", "Từ đầu tiên", (s) => s.words >= 1],
    ["📗", "50 từ", (s) => s.words >= 50],
    ["📚", "200 từ", (s) => s.words >= 200],
    ["🏛️", "1000 từ", (s) => s.words >= 1000],
    ["🧠", "10 từ thuộc", (s) => s.mastered >= 10],
    ["🔥", "Chuỗi 3 ngày", (s) => s.best >= 3],
    ["🚀", "Chuỗi 7 ngày", (s) => s.best >= 7],
    ["🏆", "Chuỗi 30 ngày", (s) => s.best >= 30],
    ["💬", "20 câu", (s) => s.sentences >= 20],
    ["🗣️", "100 câu", (s) => s.sentences >= 100],
    ["🔤", "10 âm IPA", (s) => s.ipa >= 10],
    ["🎓", "Đủ 44 âm", (s) => s.ipa >= 44],
    ["⭐", "1000 XP", (s) => s.xp >= 1000],
  ];
  const badges = (stats) => BADGES.map(([icon, name, test]) => ({ icon, name, on: !!test(stats) }));

  const Core = {
    INTERVALS, MASTER_BOX, BATCH, dstr, addDays, daysBetween, isoWeek, wkey, newCard, grade, isDue, dueKeys, boxCounts,
    touchStreak, liveStreak, planDays, nextNew, rng, hashStr, shuffle, makeQuiz, norm, checkSpelling, similarity,
    tokens, scramble, pickSentences, badges,
  };
  if (typeof module === "object" && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== "undefined" ? window : globalThis);
