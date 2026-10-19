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
  for (const [lvl, min] of [["kids", 900], ["toeic", 1200]]) {
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
  for (const track of ["daily", "work"]) {
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
