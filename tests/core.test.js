const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");

test("dates: add days across month and year ends", () => {
  assert.equal(C.addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(C.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(C.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(C.daysBetween("2026-10-19", "2026-10-26"), 7);
  assert.equal(C.dstr(new Date(2026, 0, 5)), "2026-01-05");
});

test("word key from raw row and from word object", () => {
  assert.equal(C.wkey(["hobby", "n", "", "", "", ""]), "hobby|n");
  assert.equal(C.wkey({ w: "launch", pos: "v" }), "launch|v");
});

test("new card is due tomorrow in box 0", () => {
  assert.deepEqual(C.newCard("2026-10-19"), { box: 0, due: "2026-10-20", added: "2026-10-19", reps: 0, lapses: 0 });
});

test("grading moves through Leitner boxes", () => {
  const t = "2026-10-19";
  let c = C.newCard(t);
  c = C.grade(c, 2, t);
  assert.equal(c.box, 1); assert.equal(c.due, C.addDays(t, C.INTERVALS[1]));
  c = C.grade(c, 3, t);
  assert.equal(c.box, 3);
  c = C.grade(c, 1, t);
  assert.equal(c.box, 3); assert.equal(c.due, C.addDays(t, Math.floor(C.INTERVALS[3] / 2)));
  c = C.grade(c, 0, t);
  assert.equal(c.box, 0); assert.equal(c.lapses, 1); assert.equal(c.due, C.addDays(t, 1));
  for (let i = 0; i < 20; i++) c = C.grade(c, 3, t);
  assert.equal(c.box, C.INTERVALS.length - 1);
});

test("due keys are sorted, only due ones", () => {
  const p = { a: { box: 1, due: "2026-10-18" }, b: { box: 0, due: "2026-10-19" }, c: { box: 0, due: "2026-10-20" }, d: { box: 0, due: "2026-10-17" } };
  assert.deepEqual(C.dueKeys(p, "2026-10-19"), ["d", "a", "b"]);
  assert.deepEqual(C.boxCounts(p), [3, 1, 0, 0, 0, 0, 0]);
});

test("streak counts consecutive days and resets after a gap", () => {
  let s = C.touchStreak(null, "2026-10-19");
  assert.equal(s.count, 1);
  s = C.touchStreak(s, "2026-10-19"); assert.equal(s.count, 1);
  s = C.touchStreak(s, "2026-10-20"); assert.equal(s.count, 2);
  assert.equal(C.liveStreak(s, "2026-10-21"), 2);
  assert.equal(C.liveStreak(s, "2026-10-22"), 0);
  s = C.touchStreak(s, "2026-10-23"); assert.equal(s.count, 1); assert.equal(s.best, 2);
});

test("plan days rounds up", () => {
  assert.equal(C.planDays(100, 8), 13);
  assert.equal(C.planDays(0, 8), 0);
});

const W = (w, pos, vi) => ({ w, pos, vi, key: `${w}|${pos}` });
const pool = [W("cat", "n", "con mèo"), W("dog", "n", "con chó"), W("run", "v", "chạy"), W("big", "adj", "to"),
  W("bird", "n", "con chim"), W("fish", "n", "con cá"), W("eat", "v", "ăn"), W("red", "adj", "đỏ")];

test("nextNew skips learned words and prefers a topic", () => {
  const words = pool.map((w, i) => ({ ...w, topic: i < 4 ? 0 : 1 }));
  assert.deepEqual(C.nextNew(words, { "cat|n": {} }, 2).map((w) => w.w), ["dog", "run"]);
  assert.deepEqual(C.nextNew(words, {}, 3, 1).map((w) => w.w), ["bird", "fish", "eat"]);
});

test("quiz: one question per word, answer index is right, choices unique", () => {
  const r = C.rng(42);
  const qs = C.makeQuiz(pool.slice(0, 5), pool, r);
  assert.equal(qs.length, 5);
  for (const q of qs) {
    if (q.type === "spell") { assert.equal(q.answer, q.word.w); continue; }
    const field = q.type === "meaning" ? "vi" : "w";
    assert.equal(q.choices[q.answer], q.word[field]);
    assert.equal(new Set(q.choices).size, q.choices.length);
    assert.equal(q.choices.length, 4);
  }
});

test("spelling and pronunciation similarity ignore case, accents and punctuation", () => {
  assert.ok(C.checkSpelling("  Résumé ", "résumé"));
  assert.ok(C.checkSpelling("co-worker", "co worker"));
  assert.ok(!C.checkSpelling("", "cat"));
  assert.equal(C.similarity("Nice to meet you!", "nice to meet you"), 1);
  assert.ok(C.similarity("nice to meat you", "nice to meet you") > 0.9);
  assert.ok(C.similarity("hello", "goodbye") < 0.5);
});

test("scramble changes the order but keeps the tokens", () => {
  const toks = C.tokens("Could you say that again, please?");
  const s = C.scramble(toks, C.rng(1));
  assert.notEqual(s.join(" "), toks.join(" "));
  assert.deepEqual([...s].sort(), [...toks].sort());
  assert.deepEqual(C.scramble(["Hi!"]), ["Hi!"]);
});

test("pickSentences returns unlearned first, then falls back", () => {
  assert.deepEqual(C.pickSentences(["a", "b", "c", "d"], { a: 1, c: 1 }, 3), ["b", "d"]);
  assert.deepEqual(C.pickSentences(["a", "b"], { a: 1, b: 1 }, 1), ["a"]);
});

test("badges unlock by stats", () => {
  const b = C.badges({ words: 60, mastered: 0, best: 3, sentences: 0, ipa: 44, xp: 10 });
  const on = b.filter((x) => x.on).map((x) => x.name);
  assert.deepEqual(on, ["Từ đầu tiên", "50 từ", "Chuỗi 3 ngày", "10 âm IPA", "Đủ 44 âm"]);
});

test("ISO week keys for the weekly leaderboard", () => {
  assert.equal(C.isoWeek("2026-10-19"), "2026-W43");
  assert.equal(C.isoWeek("2026-10-25"), "2026-W43");
  assert.equal(C.isoWeek("2026-10-26"), "2026-W44");
  assert.equal(C.isoWeek("2021-01-03"), "2020-W53");
  assert.equal(C.isoWeek("2024-12-30"), "2025-W01");
});
