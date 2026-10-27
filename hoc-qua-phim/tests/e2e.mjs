// Kiểm thử giao diện trên Chromium thật: node tests/e2e.mjs  (cần playwright + ffmpeg)
// Tạo một đoạn phim thử (hình + tiếng bíp) kèm phụ đề Anh/Việt, rồi đi qua các luồng chính của app.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHOTS = process.env.SHOTS || "";

// ---------- Dữ liệu thử ----------
const LINES = ["Hello there, how are you doing today?", "I'm fine, thanks. Where were you last night?", "We need to leave the city tonight.",
  "I can't believe it's already over.", "The detective found the missing evidence.", "Could you pass me the salt, please?",
  "This apartment is absolutely gorgeous.", "Nobody expected the storm to hit so hard.", "Let's grab some coffee after work.",
  "He was thirteen when his family moved.", "Your brother called while you were out.", "I'll never forget what you did for me."];
const VI = ["Chào bạn, hôm nay thế nào?", "Tôi ổn, cảm ơn. Tối qua bạn ở đâu?", "Chúng ta phải rời thành phố tối nay.", "Tôi không tin là đã hết rồi.",
  "Thám tử đã tìm ra bằng chứng bị mất.", "Bạn đưa tôi lọ muối được không?", "Căn hộ này đẹp tuyệt.", "Không ai ngờ cơn bão mạnh vậy.",
  "Đi uống cà phê sau giờ làm nhé.", "Anh ấy mười ba tuổi khi gia đình chuyển nhà.", "Anh bạn gọi lúc bạn đi vắng.", "Tôi sẽ không bao giờ quên điều bạn làm."];
const ts = (s) => { const ms = Math.round(s * 1000), p = (n, l = 2) => String(n).padStart(l, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const srt = (arr, d = 0) => arr.map((l, i) => `${i + 1}\n${ts(1 + i * 3.2 + d)} --> ${ts(3.6 + i * 3.2)}\n${l}\n`).join("\n");

const dir = mkdtempSync(join(tmpdir(), "hqp-"));
writeFileSync(join(dir, "movie.en.srt"), srt(LINES));
writeFileSync(join(dir, "movie.vi.srt"), srt(VI, 0.05));
const ff = (...a) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...a], { stdio: "inherit" });
ff("-f", "lavfi", "-i", "testsrc=s=320x180:d=42:r=10", "-f", "lavfi", "-i", "sine=f=440:d=42", "-c:v", "libvpx", "-b:v", "150k", "-c:a", "libopus", join(dir, "movie.webm"));
ff("-i", join(dir, "movie.webm"), "-i", join(dir, "movie.en.srt"), "-map", "0", "-map", "1", "-c", "copy", "-c:s", "webvtt", "-metadata:s:s:0", "language=eng", join(dir, "embedded.webm"));

// ---------- Máy chủ tĩnh ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(0);
const URL_ = `http://localhost:${server.address().port}/`;

let failures = 0, passes = 0;
async function check(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  try { await fn(); passes++; console.log("  ✓", name); } catch (e) { failures++; if (SHOTS) await page.screenshot({ path: join(SHOTS, "fail-" + passes + failures + ".png") }).catch(() => {}); console.log("  ✗", name, "\n   ", e.message.split("\n").slice(0, 12).join("\n    ")); }
}
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ["microphone"] });
// Không có mạng ngoài: các API từ điển/dịch trả lỗi → app phải xử lý êm.
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
const app = (fn) => page.evaluate(fn);
const shot = (n) => SHOTS && page.screenshot({ path: join(SHOTS, n + ".png") });

console.log("Học Tiếng Anh Qua Phim — e2e");
await page.goto(URL_);

await check("trang chủ hiển thị vùng thả file", async () => {
  await page.waitForSelector("#drop");
  assert((await page.textContent("h1")).includes("bộ phim"));
  await shot("1-home");
});

await check("thêm phim kèm phụ đề Anh + Việt → tạo cảnh", async () => {
  await page.setInputFiles("#pickFiles", [join(dir, "movie.webm"), join(dir, "movie.en.srt"), join(dir, "movie.vi.srt")]);
  await page.waitForSelector(".lesson");
  const n = await app(() => ({ cues: __app.S.cues.length, lessons: __app.S.lessons.length, vi: __app.S.cues[3].vi }));
  assert(n.cues === 12 && n.lessons === 2, JSON.stringify(n));
  assert(n.vi === VI[3], "thiếu bản dịch: " + n.vi);
  await page.waitForFunction(() => __app.P.video.readyState >= 1);
});

await check("phát video hiện phụ đề Anh, đổi sang Anh+Việt và tắt sub", async () => {
  await app(() => { __app.P.video.currentTime = 4.5; });
  await page.waitForFunction(() => document.querySelector("#subs").textContent.includes("I'm fine"));
  await page.selectOption("#subMode", "envi");
  await app(() => { __app.P.video.currentTime = 8; });
  await page.waitForFunction(() => document.querySelector("#subs .sub-vi")?.textContent.includes("rời thành phố"));
  await shot("2-player");
  await page.selectOption("#subMode", "off");
  await app(() => { __app.P.video.currentTime = 11; });
  await page.waitForTimeout(200);
  assert((await page.textContent("#subs")).trim() === "", "sub vẫn hiện khi đã tắt");
  await page.selectOption("#subMode", "en");
});

await check("bấm vào từ trên phụ đề → tra từ (offline) → lưu sổ từ", async () => {
  await app(() => { __app.P.video.currentTime = 14.5; });
  await page.waitForSelector('#subs .w[data-w="detective"]');
  await page.click('#subs .w[data-w="detective"]');
  await page.waitForSelector("#pop:not([hidden])");
  await page.waitForFunction(() => !document.querySelector("#popDef").textContent.includes("Đang tra"));
  await page.click('#pop [data-act="saveWord"]');
  await page.waitForFunction(() => __app.S.vocabSet.has("detective"));
  assert((await page.textContent("#dueBadge")) === "1");
});

async function openStep(step, lesson = 0) {
  await page.click(`.tab[data-tab="path"]`);
  await page.$$eval(".lesson", (els, k) => { els[k].open = true; }, lesson);
  await page.click(`.step[data-lesson="${lesson}"][data-step="${step}"]`);
}
const finish = async () => page.waitForSelector(".big-score");

await check("bước 1: xem không sub → tự đánh giá", async () => {
  await openStep("gist");
  await page.click('[data-act="playScene"]');
  await page.waitForFunction(() => !__app.P.video.paused);
  assert(await app(() => __app.P.subOverride === "off"));
  await page.click('[data-act="rate"][data-v="50"]');
  await page.click("#exNext");
  await finish();
  assert((await page.textContent(".big-score")) === "50%");
});

await check("bước 2: xem có sub & tra từ", async () => {
  await page.click('[data-act="step"][data-step="watch"]');
  await page.waitForSelector(".transcript.mini");
  assert(await app(() => __app.P.subOverride === "envi"));
  await page.click('[data-act="watchDone"]');
  await finish();
});

await check("bước 3: nghe chọn câu đúng (phím số)", async () => {
  await page.click('[data-act="step"][data-step="choice"]');
  const n = await app(() => __app.S.ex.items.length);
  for (let k = 0; k < n; k++) {
    await page.waitForSelector(".opt:not([disabled])");
    const ans = await app(() => __app.S.ex.items[__app.S.ex.i].answer);
    await page.keyboard.press(String(ans + 1));
    await page.waitForSelector(".fb.good");
    if (k === 0) await shot("3-choice");
    await page.keyboard.press("Enter");
  }
  await finish();
  assert((await page.textContent(".big-score")) === "100%");
});

await check("bước 4: nghe điền từ (đúng, sai chính tả nhẹ)", async () => {
  await page.click('[data-act="step"][data-step="cloze"]');
  const n = await app(() => __app.S.ex.items.length);
  for (let k = 0; k < n; k++) {
    const answers = await app(() => { const it = __app.S.ex.items[__app.S.ex.i]; return it.blanks.map((b) => it.tokens[b].t); });
    const inputs = await page.$$(".cloze .blank");
    for (let j = 0; j < inputs.length; j++) await inputs[j].fill(k === 0 ? answers[j].toLowerCase() : "zzz");
    if (k === 0) await shot("4-cloze");
    await page.click('[data-act="clozeCheck"]');
    await page.waitForSelector(k === 0 ? ".fb.good" : ".fb.bad");
    await page.click("#exNext");
  }
  await finish();
  assert(await app(() => Object.keys(__app.S.movie.mistakes).length > 0), "câu sai chưa được ghi lại");
});

await check("bước 5: sắp xếp từ", async () => {
  await page.click('[data-act="step"][data-step="order"]');
  const n = await app(() => __app.S.ex.items.length);
  for (let k = 0; k < n; k++) {
    const order = await app(() => { const it = __app.S.ex.items[__app.S.ex.i]; return it.answer.map((c) => it.shuffled.findIndex((p) => p.c === c)); });
    for (const idx of order) await page.click(`.order-pool .piece[data-k="${idx}"]`);
    await page.waitForSelector(".fb.good");
    await page.click("#exNext");
  }
  await finish();
  assert((await page.textContent(".big-score")) === "100%");
});

await check("bước 6: tìm từ sai", async () => {
  await page.click('[data-act="step"][data-step="spot"]');
  const n = await app(() => __app.S.ex.items.length);
  for (let k = 0; k < n; k++) {
    const idx = await app(() => __app.S.ex.items[__app.S.ex.i].index);
    await page.click(`.sw[data-k="${idx}"]`);
    await page.waitForSelector(".fb.good");
    await page.click("#exNext");
  }
  await finish();
});

await check("bước 7: chép chính tả (so từng từ)", async () => {
  await page.click('[data-act="step"][data-step="dictation"]');
  const text = await app(() => __app.S.cues[__app.S.ex.items[0].cue].text);
  await page.fill("#dictIn", text.replace(/[,.?!]/g, "").split(" ").slice(0, -1).join(" ") + " banana");
  await page.keyboard.press("Control+Enter");
  await page.waitForSelector(".diff .d-miss");
  assert(await page.isVisible(".d-extra"), "không hiện từ thừa");
  await shot("5-dictation");
  await page.click('[data-act="exit"]');
});

await check("bước 8: shadowing ghi âm bằng micro giả", async () => {
  await openStep("shadow");
  await page.click('[data-act="shadowRec"]');
  await page.waitForSelector('[data-act="shadowRec"].danger');
  await page.waitForTimeout(700);
  await page.click('[data-act="shadowRec"]');
  await page.waitForSelector('[data-act="playMine"]');
  await page.click('[data-act="exit"]');
});

await check("bước 9: lồng tiếng tắt tiếng đúng đoạn thoại", async () => {
  await openStep("dub");
  await page.click('[data-act="dubGo"]');
  await page.waitForFunction(() => __app.P.video.muted === true, null, { timeout: 8000 });
  await page.waitForSelector('[data-act="dubPlayback"]', { timeout: 12000 });
  assert(await app(() => __app.P.video.muted === false), "chưa bật lại tiếng");
  await page.click('[data-act="exit"]');
});

await check("lời thoại: tìm kiếm và lặp câu", async () => {
  await page.click('.tab[data-tab="tx"]');
  await page.fill("#txSearch", "coffee");
  const visible = await page.$$eval("#transcript .tx-row", (rows) => rows.filter((r) => !r.hidden).length);
  assert(visible === 1, "tìm kiếm ra " + visible);
});

await check("luyện tập tự do: luyện lại câu sai", async () => {
  await page.click('.tab[data-tab="practice"]');
  await page.selectOption("#pSource", "mistakes");
  await page.click('.chip[data-v="dictation"]');
  await page.click('[data-act="startPractice"]');
  await page.waitForSelector("#dictIn");
  await page.click('[data-act="exit"]');
});

await check("tab từ vựng: thống kê tốc độ nói và danh sách từ", async () => {
  await page.click('.tab[data-tab="words"]');
  await page.waitForSelector(".wl-row");
  assert((await page.textContent(".wordlist")).includes("evidence"));
  await shot("6-words");
});

await check("chỉnh lệch phụ đề +0,5s", async () => {
  await page.click('.tab[data-tab="settings"]');
  await page.click('[data-act="offset"][data-d="0.5"]');
  assert((await page.textContent("#offsetVal")) === "+0.5s");
  await page.click('[data-act="offset"][data-d="-0.5"]');
});

await check("lưu tiến độ và mở lại phim từ thư viện (video đã lưu trong trình duyệt)", async () => {
  await page.click('.nav-btn[data-view="home"]');
  await page.waitForSelector(".movie-card");
  await page.waitForFunction(() => document.querySelector(".movie-card .ok"), null, { timeout: 5000 });
  await page.reload();
  await page.click(".movie-card");
  await page.waitForSelector(".lesson");
  assert(await app(() => !!__app.S.videoUrl), "video không được nạp lại");
  assert((await page.textContent(".l-prog")).startsWith("6/"), await page.textContent(".l-prog"));
});

await check("phim có phụ đề nhúng (WebM/MKV) được tự đọc, không cần .srt", async () => {
  await page.click('.nav-btn[data-view="home"]');
  await page.setInputFiles("#pickFiles", [join(dir, "embedded.webm")]);
  await page.waitForSelector(".lesson");
  assert(await app(() => __app.S.cues.length === 12 && __app.S.cues[4].text === "The detective found the missing evidence."));
});

await check("video không có phụ đề → hỏi chọn file .srt hoặc AI", async () => {
  await page.click('.nav-btn[data-view="home"]');
  await page.setInputFiles("#pickFiles", [join(dir, "movie.webm")]);
  // movie.webm đã có trong thư viện → mở luôn; thử file khác tên
  writeFileSync(join(dir, "nosub.webm"), readFileSync(join(dir, "movie.webm")));
  await page.click('.nav-btn[data-view="home"]');
  await page.setInputFiles("#pickFiles", [join(dir, "nosub.webm")]);
  await page.waitForSelector('#modal:not([hidden]) [data-act="pendingSub"]');
  await shot("7-nosub");
  await page.click('[data-act="closeModal"]');
});

await check("sổ từ: ôn thẻ (che từ → hiện đáp án → nhớ)", async () => {
  await page.click('.nav-btn[data-view="vocab"]');
  await page.waitForSelector(".flash .blank-word");
  await page.click('[data-act="flip"]');
  await page.waitForSelector(".flash-sent mark");
  await shot("8-vocab");
  await page.click('[data-act="grade"][data-ok="1"]');
  await page.waitForSelector(".empty");
  assert((await page.isHidden("#dueBadge")), "badge vẫn hiện");
});

await check("giao diện điện thoại không tràn ngang", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.nav-btn[data-view="home"]');
  await page.click(".movie-card");
  await page.waitForSelector(".lesson");
  const overflow = await app(() => document.documentElement.scrollWidth - innerWidth);
  assert(overflow <= 0, "tràn " + overflow + "px");
  await shot("9-mobile");
});

await check("không có lỗi JavaScript", async () => assert(!errors.length, errors.join(" | ")));

await browser.close();
server.close();
console.log(`\n${passes} đạt, ${failures} lỗi`);
process.exit(failures ? 1 : 0);
