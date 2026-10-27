import test from "node:test";
import assert from "node:assert/strict";
import {
  rng, tokenize, norm, checkWord, diffWords, buildLessons, makeCloze, makeOrder, corrupt, makeChoice, vocabulary, review, isDue, STEPS,
} from "../js/exercises.js";

test("tokenize giữ nguyên câu gốc khi ghép lại", () => {
  const s = "Well, I don’t know — it's 5 o'clock!";
  assert.equal(tokenize(s).map((t) => t.t).join(""), s);
  assert.deepEqual(tokenize(s).filter((t) => t.word).map((t) => t.n), ["well", "i", "don't", "know", "it's", "5", "o'clock"]);
});

test("norm và checkWord chấp nhận nháy cong, số, lỗi gõ nhẹ", () => {
  assert.equal(norm("Don’t!"), "don't");
  assert.equal(norm("Five"), "5");
  assert.equal(checkWord("believe", "beleive"), "close");
  assert.equal(checkWord("can't", "cant"), "ok");
  assert.equal(checkWord("can't", "can"), "wrong");
  assert.equal(checkWord("cat", "cut"), "wrong");
});

test("diffWords chỉ ra từ thiếu, từ thừa và điểm", () => {
  const d = diffWords("I can't believe it's already over.", "i cant believe its over now");
  assert.deepEqual(d.words.map((w) => w.ok), [true, true, true, true, false, true]);
  assert.deepEqual(d.extra, ["now"]);
  assert.equal(d.score, Math.round((200 * 5) / 12));
  assert.equal(diffWords("Hello there.", "hello there").score, 100);
  assert.equal(diffWords("Hello there.", "").score, 0);
});

const sample = [
  "Hello there, how are you doing today?", "I'm fine, thanks. Where were you last night?", "We need to leave the city tonight.",
  "I can't believe it's already over.", "The detective found the missing evidence.", "Could you pass me the salt, please?",
  "This apartment is absolutely gorgeous.", "Nobody expected the storm to hit so hard.", "Let's grab some coffee after work.",
  "He was thirteen when his family moved.", "Your brother called while you were out.",
].map((text, i) => ({ id: i, start: i * 3, end: i * 3 + 2.5, text, vi: "" }));

test("buildLessons chia cảnh, không bỏ sót câu, cảnh cuối không quá ngắn", () => {
  const lessons = buildLessons(sample, 4);
  assert.deepEqual(lessons.flatMap((l) => l.cues), sample.map((_, i) => i));
  assert.ok(lessons.at(-1).cues.length >= 3);
  assert.equal(lessons[0].start, 0);
  assert.equal(STEPS.length, 10);
});

test("makeCloze: mức dễ 1 ô và ưu tiên từ đáng học; mức khó nhiều ô", () => {
  const r = rng(7);
  const easy = makeCloze(sample[4].text, 1, r);
  assert.equal(easy.blanks.length, 1);
  assert.ok(["detective", "missing", "evidence", "found"].includes(easy.tokens[easy.blanks[0]].n));
  const hard = makeCloze(sample[4].text, 3, r);
  assert.ok(hard.blanks.length >= 3);
  assert.ok(hard.blanks.every((i) => hard.tokens[i].word));
  const preferred = makeCloze(sample[6].text, 1, rng(1), new Set(["apartment"]));
  assert.equal(preferred.tokens[preferred.blanks[0]].n, "apartment");
});

test("makeOrder xáo trộn khác thứ tự gốc và giữ đủ mảnh", () => {
  for (let s = 1; s < 20; s++) {
    const o = makeOrder(sample[2].text, rng(s));
    assert.deepEqual([...o.shuffled].sort((a, b) => a.i - b.i).map((x) => x.c), o.answer);
    assert.notDeepEqual(o.shuffled.map((x) => x.c), o.answer);
  }
});

test("corrupt thay đúng 1 từ bằng từ dễ nghe nhầm", () => {
  const pool = sample.flatMap((c) => tokenize(c.text).filter((t) => t.word).map((t) => t.n));
  for (let s = 1; s < 30; s++) {
    const c = corrupt(sample[3].text, rng(s), pool);
    assert.ok(c);
    const a = tokenize(sample[3].text), b = c.tokens;
    const diffs = a.filter((t, i) => b[i] && t.t !== b[i].t);
    assert.equal(diffs.length, 1, c.text);
    assert.equal(b[c.index].t, c.wrong);
  }
});

test("makeChoice có 1 đáp án đúng và các phương án khác nhau", () => {
  const pool = sample.flatMap((c) => tokenize(c.text).filter((t) => t.word).map((t) => t.n));
  const ch = makeChoice(sample[9].text, rng(3), pool);
  assert.equal(ch.options[ch.answer], sample[9].text);
  assert.equal(new Set(ch.options).size, ch.options.length);
  assert.ok(ch.options.length >= 3);
});

test("vocabulary bỏ từ thông dụng, đếm số lần", () => {
  const v = vocabulary(sample);
  const words = v.map((x) => x.word);
  assert.ok(words.includes("detective"));
  assert.ok(!words.includes("the") && !words.includes("you"));
});

test("ôn tập Leitner: nhớ → lên hộp, quên → về hộp 0 và ôn lại sớm", () => {
  const now = Date.UTC(2026, 0, 1);
  let it = { word: "x", box: 0 };
  it = review(it, true, now);
  assert.equal(it.box, 1);
  assert.ok(!isDue(it, now + 3600000) && isDue(it, now + 86400000));
  it = review(it, false, now);
  assert.equal(it.box, 0);
  assert.ok(isDue(it, now + 11 * 60000));
});
