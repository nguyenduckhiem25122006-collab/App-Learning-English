import test from "node:test";
import assert from "node:assert/strict";
import { parseSubtitles, parseTime, cleanLine, attachTranslation, englishCues, toSrt, cueAt } from "../js/subtitles.js";

test("parseTime đọc được mọi kiểu mốc thời gian", () => {
  assert.equal(parseTime("00:01:02,500"), 62.5);
  assert.equal(parseTime("01:02.250"), 62.25);
  assert.equal(parseTime("1:00:00.5"), 3600.5);
  assert.ok(Number.isNaN(parseTime("abc")));
});

test("cleanLine bỏ thẻ, chú thích âm thanh và tên người nói", () => {
  assert.equal(cleanLine("<i>Hello</i> {\\an8}there"), "Hello there");
  assert.equal(cleanLine("[DOOR SLAMS] Run!"), "Run!");
  assert.equal(cleanLine("JOHN: We need to go."), "We need to go.");
  assert.equal(cleanLine("- I'm fine (sighs)"), "I'm fine");
  assert.equal(cleanLine("♪ la la ♪"), "la la");
});

test("SRT song ngữ tách dòng Anh/Việt", () => {
  const srt = `1\r\n00:00:01,000 --> 00:00:03,000\r\nI can't believe it.\r\nTôi không thể tin được.\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\n<b>Let's go!</b>\r\n`;
  const cues = parseSubtitles(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "I can't believe it.");
  assert.equal(cues[0].vi, "Tôi không thể tin được.");
  assert.equal(cues[1].text, "Let's go!");
});

test("WebVTT có header, cue id và cài đặt vị trí", () => {
  const vtt = `WEBVTT\n\nNOTE comment\n\nintro\n00:01.000 --> 00:02.500 align:start position:10%\n<c.yellow>Where are you?</c>\n\n00:03.000 --> 00:04.000\nHere.`;
  const cues = parseSubtitles(vtt);
  assert.deepEqual(cues.map((c) => [c.start, c.end, c.text]), [[1, 2.5, "Where are you?"], [3, 4, "Here."]]);
});

test("ASS/SSA dùng đúng dòng Format của [Events] và giữ dấu phẩy trong lời thoại", () => {
  const ass = `[Script Info]\nTitle: x\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: Default,Arial,20\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\i1}Well, hello there,\\Nfriend.\n`;
  const cues = parseSubtitles(ass);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "Well, hello there, friend.");
  assert.equal(cues[0].end, 2.5);
});

test("ghép phụ đề tiếng Việt riêng theo thời gian", () => {
  const en = [{ id: 0, start: 1, end: 3, text: "Hi.", vi: "" }, { id: 1, start: 4, end: 6, text: "Bye.", vi: "" }];
  const vi = [{ start: 1.1, end: 2.9, text: "", vi: "Chào." }, { start: 4.2, end: 6.1, text: "", vi: "Tạm biệt." }];
  assert.deepEqual(attachTranslation(en, vi).map((c) => c.vi), ["Chào.", "Tạm biệt."]);
});

test("englishCues bỏ câu không có chữ tiếng Anh, toSrt xuất lại được", () => {
  const cues = englishCues([{ start: 0, end: 1, text: "...", vi: "" }, { start: 1, end: 2, text: "Okay then.", vi: "" }]);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].id, 0);
  const again = parseSubtitles(toSrt(cues));
  assert.equal(again[0].text, "Okay then.");
});

test("cueAt tìm câu đang chiếu, có tính lệch phụ đề", () => {
  const cues = [{ start: 1, end: 2 }, { start: 3, end: 5 }];
  assert.equal(cueAt(cues, 1.5), 0);
  assert.equal(cueAt(cues, 2.5), -1);
  assert.equal(cueAt(cues, 4), 1);
  assert.equal(cueAt(cues, 2.5, 1), 0); // phụ đề trễ 1 giây
});
