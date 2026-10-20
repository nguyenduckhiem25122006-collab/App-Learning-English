const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../src/content.js");

const BASE = {
  levels: { kids: [{ en: "Hobbies", vi: "Sở thích", words: [["hobby", "n", "ˈhɒbi", "sở thích", "My hobby is reading.", "🎯"], ["collect", "v", "kəˈlekt", "sưu tầm", "He collects coins.", "🪙"]] }], toeic: [] },
  sentences: { daily: [{ stage: "Basic", en: "Greetings", vi: "Chào hỏi", items: [["Hi!", "Chào!", ""], ["See you!", "Hẹn gặp lại!", "thân mật"]] }] },
  grammar: [{ id: "gk-01", lvl: "kids", chap: "Unit 1", title: "Present simple", sum: "", forms: [], points: [], examples: [], memo: "", quiz: [] }],
  stem: [{ id: "m7-01", subj: "math", grade: 7, chap: "Số hữu tỉ", title: "Trục số", sum: "", points: [], formulas: [], viz: { type: "numberline" }, vizNote: "", memo: "", example: { q: "", a: "" }, terms: [], quiz: [] }],
};
const pack = (o) => K.clean({ app: "nhip-pack", ...o });

test("clean keeps valid items, drops broken ones and trims sizes", () => {
  const p = pack({ words: [
    { id: "w1", lvl: "kids", topic: "Tuần 1", w: "  apple ", vi: "quả táo", pos: "zz" },
    { id: "w2", lvl: "kids", w: "", vi: "trống" },             // no word
    { id: "w3", lvl: "grade9", w: "x", vi: "y" },              // unknown level
    { lvl: "kids", w: "noid", vi: "y" },                       // no id
    { id: "w1", lvl: "kids", topic: "Tuần 1", w: "apple", vi: "táo (sửa)" }, // later change of w1 wins
  ], sents: "nope", stem: [{ id: "l1", subj: "math", grade: 7, title: "x".repeat(500), quiz: [{ q: "1+1?", opts: ["1", "2"], a: 1 }, { q: "bad", opts: ["a", "a"], a: 0 }] }] });
  assert.equal(p.words.length, 1);
  assert.deepEqual(p.words[0], { id: "w1", lvl: "kids", topic: "Tuần 1", w: "apple", pos: "n", ipa: "", vi: "táo (sửa)", ex: "", emo: "📝" });
  assert.deepEqual(p.sents, []);
  assert.equal(p.stem[0].title.length, 120);
  assert.deepEqual(p.stem[0].quiz, [{ q: "1+1?", opts: ["1", "2"], a: 1, why: "" }]);
  assert.equal(K.clean({ app: "something-else" }), null);
  assert.equal(K.clean("text"), null);
});

test("visuals must be one of the presets; chart labels lose markup", () => {
  assert.deepEqual(K.cleanViz({ type: "angles", mode: "vertical", extra: 1 }), { type: "angles", mode: "vertical" });
  assert.equal(K.cleanViz({ type: "angles", mode: "nope" }), null);
  assert.equal(K.cleanViz({ type: "script" }), null);
  const c = K.cleanViz({ type: "chart", kind: "bar", title: "<b>Điểm</b>", data: [["7A<img>", 8], ["7B", -1], ["7C", 6]] });
  assert.deepEqual(c, { type: "chart", kind: "bar", title: "bĐiểm/b", data: [["7Aimg", 8], ["7C", 6]] });
  assert.equal(K.cleanViz({ type: "chart", kind: "pie", data: [["a", 1]] }), null);
  assert.equal(K.VIZ_PRESETS.length, 45);
});

test("apply: a new set comes first, edits stay in place, deletions remove", () => {
  const cls = pack({ words: [
    { id: "w1", lvl: "kids", topic: "Tuần 1", w: "apple", vi: "quả táo", pos: "n" },
    { id: "kids:hobby|n", lvl: "kids", topic: "Sở thích", w: "hobby", pos: "n", ipa: "ˈhɒbi", vi: "sở thích, thú vui", ex: "Reading is my hobby.", emo: "🎯" },
  ] });
  const mine = pack({ words: [{ id: "kids:collect|v", lvl: "kids", del: true }, { id: "w2", lvl: "kids", topic: "Sở thích", w: "fishing", vi: "câu cá", pos: "n" }] });
  const X = K.apply(BASE, [cls, mine]);
  const kids = X.levels.kids;
  assert.deepEqual(kids.map((t) => [t.vi, t.cls]), [["Tuần 1", true], ["Sở thích", false]]);
  assert.deepEqual(kids[1].words.map((r) => [r[0], r[3], r[6], r[7]]), [["hobby", "sở thích, thú vui", "kids:hobby|n", 1], ["fishing", "câu cá", "w2", 2]]);
  assert.deepEqual(kids[0].words[0].slice(6), ["w1", 2]);
  assert.equal(X.levels.toeic.length, 0);
  // the built-in data itself is untouched
  assert.equal(BASE.levels.kids[0].words.length, 2);
});

test("apply: the same word added twice keeps only the newer one; empty sets disappear", () => {
  const p = pack({ words: [{ id: "x1", lvl: "kids", topic: "Mới", w: "Hobby", pos: "n", vi: "thú vui" }] });
  const kids = K.apply(BASE, [p]).levels.kids;
  assert.deepEqual(kids.map((t) => t.vi), ["Mới", "Sở thích"]);
  assert.deepEqual(kids[1].words.map((r) => r[0]), ["collect"]);
  const moved = K.apply(BASE, [pack({ words: [{ id: "kids:hobby|n", lvl: "kids", topic: "Khác", w: "hobby", vi: "sở thích" }, { id: "kids:collect|v", lvl: "kids", del: true }] })]).levels.kids;
  assert.deepEqual(moved.map((t) => t.vi), ["Khác"]);
});

test("apply: sentences get groups with a stage; lessons are added first, edited in place or removed", () => {
  const p = pack({
    sents: [{ id: "s1", track: "daily", group: "Câu của tuần", stage: "Intermediate", en: "Long time no see!", vi: "Lâu rồi không gặp!" },
      { id: "daily:Hi!", track: "daily", del: true }],
    grammar: [{ id: "g1", lvl: "toeic", title: "Đảo ngữ" }, { id: "gk-01", lvl: "kids", title: "Present simple (sửa)", quiz: [] }],
    stem: [{ id: "m7-01", subj: "math", del: true }],
  });
  const X = K.apply(BASE, [p]);
  assert.deepEqual(X.sentences.daily.map((g) => [g.vi, g.stage, g.cls, g.items.length]), [["Câu của tuần", "Intermediate", true, 1], ["Chào hỏi", "Basic", false, 1]]);
  assert.deepEqual(X.sentences.daily[0].items[0], ["Long time no see!", "Lâu rồi không gặp!", "", "s1", 2]);
  assert.deepEqual(X.grammar.map((l) => [l.id, l.title, l.src]), [["g1", "Đảo ngữ", 2], ["gk-01", "Present simple (sửa)", 1]]);
  assert.deepEqual(X.stem, []);
});

test("put / remove / combine: publishing folds my changes into the class pack", () => {
  const cls = pack({ words: [{ id: "w1", lvl: "kids", topic: "Tuần 1", w: "apple", vi: "quả táo" }, { id: "w2", lvl: "kids", topic: "Tuần 1", w: "pear", vi: "quả lê" }] });
  const mine = K.fresh();
  assert.equal(K.put(mine, "words", { id: "w1", lvl: "kids", topic: "Tuần 1", w: "apple", vi: "táo" }), true);
  assert.equal(K.put(mine, "words", { id: "w9", lvl: "kids", w: "", vi: "x" }), false);
  K.remove(mine, "words", { id: "w2", lvl: "kids" }, true);          // in the class pack: recorded as a deletion
  K.put(mine, "words", { id: "w3", lvl: "kids", topic: "Tuần 1", w: "plum", vi: "quả mận" });
  K.remove(mine, "words", { id: "w3", lvl: "kids" }, false);         // only mine: simply forgotten
  K.remove(mine, "words", { id: "kids:hobby|n", lvl: "kids" }, true); // built-in word removed for the class
  assert.equal(K.count(mine), 3);
  const out = K.combine(cls, mine, new Set(["kids:hobby|n", "kids:collect|v"]));
  assert.deepEqual(out.words.map((x) => [x.id, x.del ? "del" : x.vi]), [["w1", "táo"], ["kids:hobby|n", "del"]]);
  const X = K.apply(BASE, [out]);
  assert.deepEqual(X.levels.kids.map((t) => [t.vi, t.words.map((r) => r[0])]), [["Tuần 1", ["apple"]], ["Sở thích", ["collect"]]]);
});

test("parseLines reads Quizlet-style pasted lists", () => {
  assert.deepEqual(K.parseLines("apple | quả táo | I eat an apple.\nbook\tsách\n\nrun - chạy - I run - fast", ["w", "vi", "ex"]), [
    { w: "apple", vi: "quả táo", ex: "I eat an apple." },
    { w: "book", vi: "sách", ex: "" },
    { w: "run", vi: "chạy", ex: "I run - fast" },
  ]);
});

test("new ids are unique", () => {
  const ids = new Set(Array.from({ length: 200 }, () => K.newId("w")));
  assert.equal(ids.size, 200);
});
