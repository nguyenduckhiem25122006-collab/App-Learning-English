/* Class study material ("học liệu lớp"), like Quizlet sets: a teacher adds, edits or removes words, sentences, grammar
   lessons and Toán/Vật lí lessons, and shares them with the class. A pack only stores the changes; apply() lays one or more
   packs over the built-in data. Packs arrive from the server or from a file, so clean() checks every field. Pure: node-tested. */
(function (root) {
  "use strict";

  // ===== CONFIG =====
  const KINDS = ["words", "sents", "grammar", "stem"];
  const MAX_ITEMS = { words: 3000, sents: 2000, grammar: 200, stem: 300 };
  const MAX_BYTES = 450 * 1024;        // the server accepts up to 512 KB per class
  const LEVELS = ["kids", "toeic"], TRACKS = ["daily", "work", "toeic"], STAGES = ["Basic", "Intermediate", "Advanced"];
  const POS = ["n", "v", "adj", "adv", "phr", "prep", "conj"];
  const NEW_TOPIC = "Bộ từ của lớp", NEW_GROUP = "Câu của lớp";
  // Visual types a lesson can use: [preset key, label]. The key is "type" or "type:mode" (mode/kind/shape per type).
  const VIZ_PRESETS = [
    ["numberline", "Trục số"], ["angles:vertical", "Góc đối đỉnh, kề bù"], ["angles:parallel", "Hai đường thẳng song song"],
    ["triangle", "Tổng ba góc tam giác"], ["pythagoras", "Định lí Pythagore"], ["proportion:direct", "Tỉ lệ thuận y = kx"],
    ["proportion:inverse", "Tỉ lệ nghịch y = k/x"], ["linear", "Hàm số y = ax + b"], ["system", "Hệ hai phương trình"],
    ["parabola:ax2", "Đồ thị y = ax²"], ["parabola:quadratic", "Phương trình bậc hai (Δ)"], ["identity", "Hằng đẳng thức (a + b)²"],
    ["thales", "Định lí Thalès"], ["trig", "Tỉ số lượng giác"], ["circle:inscribed", "Góc nội tiếp"], ["circle:arc", "Cung tròn, hình quạt"],
    ["polygon", "Đa giác đều"], ["solid:cuboid", "Hình hộp chữ nhật"], ["solid:prism", "Lăng trụ đứng tam giác"], ["solid:cylinder", "Hình trụ"],
    ["solid:cone", "Hình nón"], ["solid:sphere", "Hình cầu"], ["chart:bar", "Biểu đồ cột"], ["chart:pie", "Biểu đồ hình quạt"],
    ["chart:line", "Biểu đồ đoạn thẳng"], ["dice", "Xác suất (gieo xúc xắc)"],
    ["motion", "Tốc độ, quãng đường"], ["sound", "Sóng âm"], ["reflection", "Phản xạ ánh sáng"], ["refraction", "Khúc xạ ánh sáng"],
    ["lens:converging", "Thấu kính hội tụ"], ["lens:diverging", "Thấu kính phân kì"], ["magnet", "Nam châm, từ trường"],
    ["density", "Khối lượng riêng"], ["pressure:solid", "Áp suất chất rắn"], ["pressure:liquid", "Áp suất chất lỏng"],
    ["lever", "Đòn bẩy, mômen lực"], ["circuit:ohm", "Định luật Ohm"], ["circuit:series", "Mạch nối tiếp"], ["circuit:parallel", "Mạch song song"],
    ["power", "Công suất, điện năng"], ["energy", "Cơ năng"], ["heat", "Nhiệt năng, sự nở vì nhiệt"], ["induction", "Cảm ứng điện từ"],
    ["ac", "Dòng điện xoay chiều"], ["formula", "✏️ Đồ thị theo công thức tự nhập"],
  ];
  const PARAM = { angles: "mode", proportion: "kind", parabola: "mode", circle: "mode", solid: "shape", chart: "kind", lens: "kind", pressure: "mode", circuit: "mode" };
  // ==================

  const PRESET = new Set(VIZ_PRESETS.map(([k]) => k));
  const fresh = () => ({ app: "nhip-pack", v: 1, name: "", at: 0, words: [], sents: [], grammar: [], stem: [] });
  const str = (x, max) => (typeof x === "string" || typeof x === "number" ? String(x) : "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
  const one = (x, max) => str(x, max).replace(/\s+/g, " ");
  const list = (x, n, max) => (Array.isArray(x) ? x : []).map((s) => str(s, max)).filter(Boolean).slice(0, n);
  const pairs = (x, n, max) => (Array.isArray(x) ? x : []).filter(Array.isArray).map(([a, b]) => [one(a, max), one(b, max)]).filter(([a, b]) => a && b).slice(0, n);
  const okId = (id) => typeof id === "string" && id.length > 0 && id.length <= 120;
  const newId = (prefix, r = Math.random) => `${prefix}${Date.now().toString(36)}${Math.floor(r() * 1e8).toString(36)}`;
  const vizKey = (v) => (v && v.type ? (PARAM[v.type] ? `${v.type}:${v[PARAM[v.type]]}` : v.type) : "");

  /** A lesson visual from the preset list (charts also carry up to 7 [label, value ≥ 0] rows), else null. */
  function cleanViz(v) {
    if (!v || typeof v !== "object" || !PRESET.has(vizKey(v))) return null;
    const out = { type: v.type };
    if (PARAM[v.type]) out[PARAM[v.type]] = v[PARAM[v.type]];
    if (v.type === "formula") { // y = f(x): the formula text, up to 4 one-letter parameters [name, min, max, start], x and y ranges
      out.expr = one(v.expr, 160);
      if (!out.expr || !/^[0-9a-zA-Zπ√²³+\-−–*\/^().,|·×÷:;=\s]+$/.test(out.expr)) return null;
      const num = (n) => (typeof n === "number" || (typeof n === "string" && n.trim() !== "") ? +n : NaN);
      const range = (r) => (Array.isArray(r) && r.length === 2 && r.every((n) => Number.isFinite(num(n)) && Math.abs(num(n)) <= 1e4) && num(r[0]) < num(r[1]) ? [num(r[0]), num(r[1])] : null);
      out.params = [];
      for (const q of Array.isArray(v.params) ? v.params : []) {
        if (!Array.isArray(q) || !/^[a-df-wyzA-Z]$/.test(q[0]) || out.params.some((x) => x[0] === q[0])) continue;
        const r = range([q[1], q[2]]);
        if (!r) continue;
        const start = Number.isFinite(num(q[3])) ? Math.min(r[1], Math.max(r[0], num(q[3]))) : r[0];
        out.params.push([q[0], r[0], r[1], start]);
      }
      out.params = out.params.slice(0, 4);
      out.x = range(v.x) || [-6, 6];
      const y = range(v.y);
      if (y) out.y = y;
      return out;
    }
    if (v.type === "chart") {
      const plain = (x, n) => one(x, n).replace(/[<>&"']/g, "");
      out.title = plain(v.title, 60) || "Biểu đồ";
      out.data = (Array.isArray(v.data) ? v.data : []).filter(Array.isArray).map(([l, n]) => [plain(l, 20), +n])
        .filter(([l, n]) => l && Number.isFinite(n) && n >= 0 && n <= 1e9).slice(0, 7);
      if (out.data.length < 2) return null;
    }
    return out;
  }
  function cleanQuiz(q) {
    return (Array.isArray(q) ? q : []).map((x) => {
      if (!x || typeof x !== "object") return null;
      const opts = (Array.isArray(x.opts) ? x.opts : []).map((o) => one(o, 200)), a = Number.isInteger(x.a) ? x.a : -1;
      const q2 = str(x.q, 400);
      if (!q2 || opts.length < 2 || opts.length > 4 || opts.some((o) => !o) || new Set(opts).size !== opts.length || a < 0 || a >= opts.length) return null;
      return { q: q2, opts, a, why: str(x.why, 300) };
    }).filter(Boolean).slice(0, 10);
  }

  const CLEAN = {
    words(x) {
      if (!LEVELS.includes(x.lvl)) return null;
      if (x.del) return { id: x.id, lvl: x.lvl, del: true };
      const w = one(x.w, 60), vi = one(x.vi, 160);
      if (!w || !vi) return null;
      return { id: x.id, lvl: x.lvl, topic: one(x.topic, 60) || NEW_TOPIC, w, pos: POS.includes(x.pos) ? x.pos : "n", ipa: one(x.ipa, 60).replace(/^\/|\/$/g, ""),
        vi, ex: one(x.ex, 240), emo: one(x.emo, 16) || "📝" };
    },
    sents(x) {
      if (!TRACKS.includes(x.track)) return null;
      if (x.del) return { id: x.id, track: x.track, del: true };
      const en = one(x.en, 300), vi = one(x.vi, 300);
      if (!en || !vi) return null;
      return { id: x.id, track: x.track, group: one(x.group, 60) || NEW_GROUP, stage: STAGES.includes(x.stage) ? x.stage : "Basic", en, vi, note: one(x.note, 200) };
    },
    grammar(x) {
      if (!LEVELS.includes(x.lvl)) return null;
      if (x.del) return { id: x.id, lvl: x.lvl, del: true };
      const title = one(x.title, 120);
      if (!title) return null;
      return { id: x.id, lvl: x.lvl, chap: one(x.chap, 80) || "Ngữ pháp của lớp", title, sum: str(x.sum, 600), forms: list(x.forms, 8, 200),
        points: list(x.points, 12, 300), examples: pairs(x.examples, 10, 300), memo: str(x.memo, 300), quiz: cleanQuiz(x.quiz) };
    },
    stem(x) {
      if (x.subj !== "math" && x.subj !== "phys") return null;
      if (x.del) return { id: x.id, subj: x.subj, del: true };
      const title = one(x.title, 120), grade = +x.grade;
      if (!title || ![7, 8, 9].includes(grade)) return null;
      const ex = x.example && typeof x.example === "object" ? x.example : {};
      return { id: x.id, subj: x.subj, grade, chap: one(x.chap, 80) || "Bài của lớp", title, sum: str(x.sum, 600), points: list(x.points, 12, 300),
        formulas: list(x.formulas, 8, 200), viz: cleanViz(x.viz), vizNote: str(x.vizNote, 300), memo: str(x.memo, 300),
        example: { q: str(ex.q, 600), a: str(ex.a, 1500) }, terms: pairs(x.terms, 8, 120), quiz: cleanQuiz(x.quiz) };
    },
  };
  function cleanItem(kind, x) {
    if (!x || typeof x !== "object" || !okId(x.id)) return null;
    return CLEAN[kind](x);
  }
  /** Keep the last change per id at the place the id first appeared (so a set keeps its word order). */
  function compact(items) {
    const m = new Map();
    for (const x of items) m.set(x.id, x);
    return [...m.values()];
  }
  /** Anything (parsed JSON) → a valid pack, or null when it is not a pack at all. */
  function clean(o) {
    if (!o || typeof o !== "object" || (o.app !== undefined && o.app !== "nhip-pack")) return null;
    const p = fresh();
    p.name = one(o.name, 60);
    p.at = Number.isFinite(+o.at) ? +o.at : 0;
    for (const k of KINDS) p[k] = compact((Array.isArray(o[k]) ? o[k] : []).map((x) => cleanItem(k, x)).filter(Boolean)).slice(0, MAX_ITEMS[k]);
    return p;
  }
  const count = (p) => (p ? KINDS.reduce((n, k) => n + p[k].length, 0) : 0);

  /** Record a change in a pack (replaces an earlier change of the same item). */
  function put(p, kind, item) {
    const x = cleanItem(kind, item);
    if (!x) return false;
    const i = p[kind].findIndex((y) => y.id === x.id);
    if (i >= 0) p[kind][i] = x; else p[kind].push(x);
    return true;
  }
  /** Remove an item: forget it if only this pack had it, otherwise record a deletion (`under` = it exists below this pack). */
  function remove(p, kind, item, under) {
    p[kind] = p[kind].filter((y) => y.id !== item.id);
    if (under) put(p, kind, { ...item, del: true });
  }
  /** Publish: the class pack with my changes laid on top, deletions of things that no longer exist dropped. */
  function combine(a, b, baseIds) {
    const out = fresh();
    out.name = (b && b.name) || (a && a.name) || "";
    for (const k of KINDS) {
      out[k] = compact([...(a ? a[k] : []), ...(b ? b[k] : [])]);
      if (baseIds) out[k] = out[k].filter((x) => !x.del || baseIds.has(x.id));
    }
    return out;
  }

  // ---- Lay packs over the built-in data. Every item keeps an id and a source: 0 built-in, 1 edited, 2 added. ----
  const wkey = (w, pos) => `${String(w).toLowerCase()}|${pos}`;
  const wordId = (lvl, w, pos) => `${lvl}:${w}|${pos}`;
  const sentId = (track, en) => `${track}:${en}`;
  /** Generic grouping layer: base groups [{name, extra, rows}], changes → groups with new groups first. */
  function layer(baseGroups, changes, opt) {
    const ent = new Map(), byKey = new Map(), meta = new Map(), order = [], fresh2 = [];
    for (const g of baseGroups) {
      meta.set(g.name, g.extra); order.push(g.name);
      for (const r of g.rows) { const id = opt.id(r); ent.set(id, { g: g.name, row: r, src: 0 }); byKey.set(opt.key(r), id); }
    }
    for (const c of changes) {
      const prev = ent.get(c.id);
      if (c.del) { if (prev) { ent.delete(c.id); byKey.delete(opt.key(prev.row)); } continue; }
      const row = opt.row(c), k = opt.key(row), clash = byKey.get(k);
      if (clash && clash !== c.id) ent.delete(clash); // same word / sentence added twice: the newer one wins
      if (prev) byKey.delete(opt.key(prev.row));
      const g = c[opt.group];
      if (!meta.has(g)) { meta.set(g, opt.extra(c)); fresh2.push(g); }
      ent.set(c.id, { g, row, src: prev && prev.src !== 2 ? 1 : 2 });
      byKey.set(k, c.id);
    }
    const out = new Map([...fresh2, ...order].map((n) => [n, { name: n, extra: meta.get(n), cls: fresh2.includes(n), rows: [] }]));
    for (const [id, e] of ent) out.get(e.g).rows.push(opt.out(e.row, id, e.src));
    return [...out.values()].filter((g) => g.rows.length);
  }
  function applyList(base, changes) {
    const m = new Map(base.map((l) => [l.id, { ...l, src: 0 }])), added = new Map();
    for (const c of changes) {
      if (c.del) { m.delete(c.id); added.delete(c.id); continue; }
      const { del, ...x } = c;
      if (m.has(c.id)) m.set(c.id, { ...x, src: 1 }); else added.set(c.id, { ...x, src: 2 });
    }
    return [...added.values(), ...m.values()];
  }
  /**
   * base: APP_DATA-like { levels, sentences, grammar, stem }; packs: cleaned packs, lowest first.
   * Returns the same shapes; word rows get [.., id, src], sentence rows [en, vi, note, id, src], lessons { …, src }.
   */
  function apply(base, packs) {
    const ch = (k) => packs.filter(Boolean).flatMap((p) => p[k]);
    const levels = {}, sentences = {};
    for (const lvl of Object.keys(base.levels || {})) {
      levels[lvl] = layer((base.levels[lvl] || []).map((t) => ({ name: t.vi, extra: t.en, rows: t.words })), ch("words").filter((c) => c.lvl === lvl), {
        id: (r) => wordId(lvl, r[0], r[1]), key: (r) => wkey(r[0], r[1]), group: "topic", extra: (c) => c.topic,
        row: (c) => [c.w, c.pos, c.ipa, c.vi, c.ex, c.emo], out: (r, id, src) => [r[0], r[1], r[2], r[3], r[4], r[5], id, src],
      }).map((g) => ({ en: g.extra, vi: g.name, cls: g.cls, words: g.rows }));
    }
    for (const track of Object.keys(base.sentences || {})) {
      const stageOf = new Map();
      sentences[track] = layer((base.sentences[track] || []).map((g) => (stageOf.set(g.vi, g.stage), { name: g.vi, extra: { en: g.en, stage: g.stage }, rows: g.items })),
        ch("sents").filter((c) => c.track === track), {
          id: (r) => sentId(track, r[0]), key: (r) => String(r[0]).toLowerCase(), group: "group", extra: (c) => ({ en: "", stage: c.stage }),
          row: (c) => [c.en, c.vi, c.note], out: (r, id, src) => [r[0], r[1], r[2] || "", id, src],
        }).map((g) => ({ stage: g.extra.stage, en: g.extra.en, vi: g.name, cls: g.cls, items: g.rows }));
    }
    return { levels, sentences, grammar: applyList(base.grammar || [], ch("grammar")), stem: applyList(base.stem || [], ch("stem")) };
  }

  /** Quizlet-style bulk import: one item per line, fields split by tab, " | " or " - ". */
  function parseLines(text, fields) {
    return String(text || "").split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean).map((ln) => {
      const [sep, glue] = ln.includes("\t") ? ["\t", " "] : ln.includes("|") ? ["|", " | "] : [/\s+[-–—]\s+/, " - "];
      const parts = ln.split(sep).map((s) => s.trim());
      return Object.fromEntries(fields.map((f, i) => [f, i === fields.length - 1 ? parts.slice(i).filter(Boolean).join(glue) : parts[i] || ""]));
    });
  }

  const Content = { KINDS, MAX_ITEMS, MAX_BYTES, LEVELS, TRACKS, STAGES, POS, VIZ_PRESETS, NEW_TOPIC, NEW_GROUP,
    fresh, clean, cleanItem, cleanViz, vizKey, count, put, remove, combine, apply, parseLines, newId, wordId, sentId, compact };
  if (typeof module === "object" && module.exports) module.exports = Content;
  else root.Content = Content;
})(typeof window !== "undefined" ? window : globalThis);
