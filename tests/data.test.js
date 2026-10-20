/* Validates build/data.js (run `python3 build_data.py` first). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "build", "data.js"), "utf8"), ctx);
const D = ctx.window.APP_DATA;
const POS = new Set(["n", "v", "adj", "adv", "phr", "prep", "conj"]);

test("both levels have enough words, all fields filled", () => {
  for (const [lvl, min] of [["kids", 900], ["toeic", 1600]]) {
    const words = D.levels[lvl].flatMap((t) => t.words);
    assert.ok(words.length >= min, `${lvl}: ${words.length}`);
    for (const w of words) {
      assert.equal(w.length, 6);
      assert.ok(w.every((x) => typeof x === "string" && x.trim()), JSON.stringify(w));
      assert.ok(POS.has(w[1]), `${w[0]}: pos ${w[1]}`);
      assert.ok(!w[2].includes("/"), `${w[0]}: IPA must not carry slashes`);
    }
    const keys = words.map((w) => `${w[0].toLowerCase()}|${w[1]}`);
    assert.equal(new Set(keys).size, keys.length, `${lvl}: duplicate words`);
    for (const t of D.levels[lvl]) assert.ok(t.en && t.vi && t.words.length, `${lvl}: empty topic ${t.en}`);
  }
  assert.equal(D.levels.kids[0].words[0][0], "hobby");
});

test("sentence tracks: stages valid, at least 3 sentences per group", () => {
  for (const track of ["daily", "work", "toeic"]) {
    const groups = D.sentences[track];
    assert.ok(groups.length >= 15);
    for (const g of groups) {
      assert.ok(["Basic", "Intermediate", "Advanced"].includes(g.stage), g.stage);
      assert.ok(g.items.length >= 3, g.en);
      for (const [en, vi] of g.items) assert.ok(en.trim() && vi.trim() && !/\s{2}/.test(en), en);
    }
    assert.ok(groups.filter((g) => g.stage === "Advanced").length >= 5);
  }
});

test("IPA: 44 unique sounds with examples, pairs and path coverage", () => {
  const sounds = D.ipa.sounds;
  assert.equal(sounds.length, 44);
  const syms = new Set(sounds.map((s) => s.s));
  assert.equal(syms.size, 44);
  const by = (t) => sounds.filter((s) => s.type === t).length;
  assert.deepEqual([by("vowel"), by("diphthong"), by("consonant")], [12, 8, 24]);
  for (const s of sounds) {
    assert.ok(s.vi && s.tip, s.s);
    assert.ok(s.ex.length >= 3, s.s);
    for (const [w, ipa] of s.ex) assert.ok(w && ipa.includes(s.s.replace("ː", "")), `${s.s}: ${w} /${ipa}/`);
    for (const p of s.pairs) {
      assert.equal(p.length, 3, s.s);
      assert.notEqual(p[0], p[1]);
      assert.ok(p[2] === "" || syms.has(p[2]), `${s.s}: unknown pair sound ${p[2]}`);
    }
  }
  assert.ok(sounds.find((s) => s.s === "θ").pairs.length >= 3);
  const inPath = D.ipa.path.flatMap((p) => p.sounds);
  assert.deepEqual(new Set(inPath), syms);
  assert.equal(inPath.length, 44);
});

test("Toán & Vật lí: lessons for grades 7–9, every visual draws, quizzes are well formed", () => {
  const Stem = require("../src/stem.js");
  const L = D.stem;
  for (const subj of ["math", "phys"]) for (const g of [7, 8, 9]) assert.ok(L.filter((l) => l.subj === subj && l.grade === g).length >= 8, `${subj} ${g}`);
  assert.equal(new Set(L.map((l) => l.id)).size, L.length);
  for (const l of L) {
    assert.ok(Stem.TYPES.includes(l.viz.type), `${l.id}: ${l.viz.type}`);
    for (const c of Stem.ctrls(l.viz)) for (const v of [c.min, c.max]) {
      const r = Stem.draw(l.viz, { ...Stem.init(l.viz), [c.k]: v });
      assert.ok(r.svg.startsWith("<svg") && !/NaN|undefined/.test(r.svg + r.info), `${l.id} ${c.k}=${v}`);
    }
    assert.equal(l.quiz.length, 4, l.id);
    for (const q of l.quiz) assert.ok(q.a >= 0 && q.a < q.opts.length && new Set(q.opts).size === q.opts.length, `${l.id}: ${q.q}`);
    assert.ok(l.points.length >= 3 && l.terms.length >= 2 && l.example.q && l.example.a && l.memo, l.id);
  }
  // Spirit beasts ask for at most as many lessons as there are.
  const F = require("../src/farm.js");
  for (const b of F.BEASTS) {
    assert.ok((b.learn.math || 0) <= L.filter((l) => l.subj === "math").length, b.id);
    assert.ok((b.learn.phys || 0) <= L.filter((l) => l.subj === "phys").length, b.id);
  }
});

test("grammar lessons: Tiếng Anh 7 and TOEIC, each with structures, examples and a valid quiz", () => {
  const G = D.grammar;
  assert.ok(G.filter((l) => l.lvl === "kids").length >= 12 && G.filter((l) => l.lvl === "toeic").length >= 12);
  assert.equal(new Set(G.map((l) => l.id)).size, G.length);
  for (const l of G) {
    assert.ok(l.forms.length && l.examples.length >= 3 && l.points.length >= 3, l.id);
    assert.equal(l.quiz.length, 4, l.id);
    for (const q of l.quiz) assert.ok(q.a >= 0 && q.a < q.opts.length && new Set(q.opts).size === q.opts.length, l.id);
  }
});

test("every built-in lesson survives the class-material editor unchanged (so editing never loses a field)", () => {
  const K = require("../src/content.js");
  const plain = (x) => JSON.parse(JSON.stringify(x)); // APP_DATA lives in another vm context
  for (const l of D.stem) assert.deepEqual(plain(K.cleanItem("stem", l)), plain(l), l.id);
  for (const l of D.grammar) assert.deepEqual(plain(K.cleanItem("grammar", l)), plain(l), l.id);
});
