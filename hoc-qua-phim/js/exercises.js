// Tạo bài tập tự động từ phụ đề + chấm điểm. Thuần JS (test được bằng Node).

// ---------- Ngẫu nhiên có hạt giống (để mỗi lần mở lại vẫn ra cùng bài) ----------
export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Từ ----------
// ~450 từ thông dụng nhất: dùng để biết từ nào "dễ" (không đáng chọn để đục lỗ / lưu sổ từ).
const COMMON = new Set(`a about above across after again against ago all almost alone along already also although always am among an and
another any anyone anything are around as ask asked at away back bad be because become been before began begin behind being believe
best better between big bit both boy bring brought but buy by call came can can't car care case change child children close come
could couldn't country course day did didn't different do does doesn't doing don't done door down during each early easy eat else end enough even
ever every everyone everything eye eyes face fact family far father feel felt few find fine first five for found four friend from front
full gave get gets getting girl give go god goes going gone good got great guy guys had hand happen happened hard has hasn't have haven't having he
he'd he'll he's head hear heard help her here here's hey hi high him himself his hold home hope house how i i'd i'll i'm i've if
important in inside into is isn't it it's its itself just keep kind knew know known last late later leave left less let let's life like
little live long look looked looking lot love made make man many may maybe me mean men might mind minute mom money more morning most mother
move mr mrs much must my myself name need never new next nice night no not nothing now of off oh ok okay old on once one only open or
other our out over own part people place play please point put question quite rather real really right room run said same saw say says school
see seem seen she she's should shouldn't show side since small so some someone something sometimes soon sorry start still stop story such
sure take talk talking tell than thank thanks that that's the their them then there there's these they they're thing things think this
those though thought three through time to today together told tomorrow tonight too took top try trying turn two under understand until
up us use used very wait want wanted wants was wasn't watch way we we'll we're we've well went were weren't what what's when where which while
white who who's whole why will with without woman women won't word words work world would wouldn't wrong yeah year years yes yet you you'd you'll
you're you've young your yourself gonna wanna gotta ya uh um huh hmm ah oh mm whoa`.split(/\s+/));

// Hư từ: không đục lỗ ở mức dễ (nghe rất khó phân biệt và ít giá trị).
const FUNCTION_WORDS = new Set(`a an the of to in on at by for with from and or but so if as is am are was were be been it its i you he she we they me him her us them my your his our their this that these those do does did not no yes oh uh um`.split(" "));

// Cặp dễ nghe nhầm: dùng để tạo phương án nhiễu cho bài trắc nghiệm nghe & tìm từ sai.
const CONFUSABLE = [
  ["can", "can't"], ["could", "couldn't"], ["will", "won't"], ["want", "won't"], ["live", "leave"], ["ship", "sheep"], ["sit", "seat"],
  ["full", "fool"], ["walk", "work"], ["thirteen", "thirty"], ["fourteen", "forty"], ["fifteen", "fifty"], ["his", "he's"],
  ["their", "there"], ["your", "you're"], ["then", "than"], ["think", "thing"], ["three", "free"], ["thank", "tank"], ["bad", "bed"],
  ["man", "men"], ["hat", "hot"], ["cut", "cat"], ["light", "right"], ["late", "rate"], ["glass", "grass"], ["play", "pray"],
  ["fly", "fry"], ["very", "berry"], ["vote", "boat"], ["west", "vest"], ["wine", "vine"], ["sink", "think"], ["mouse", "mouth"],
  ["buy", "bye"], ["know", "no"], ["hear", "here"], ["write", "right"], ["meet", "meat"], ["week", "weak"], ["see", "sea"],
  ["did", "do"], ["was", "is"], ["were", "are"], ["had", "have"], ["it", "it's"], ["a", "the"], ["this", "these"], ["that", "what"],
  ["him", "them"], ["her", "here"], ["we're", "were"], ["I'll", "I"], ["I'd", "I"], ["he'll", "he"], ["coming", "come in"],
  ["want to", "wanna"], ["going to", "gonna"], ["got to", "gotta"], ["let", "lead"], ["lose", "loose"], ["quite", "quiet"],
];
const CONF_MAP = new Map();
for (const [a, b] of CONFUSABLE) {
  if (!a.includes(" ") && !b.includes(" ")) {
    CONF_MAP.set(a.toLowerCase(), [...(CONF_MAP.get(a.toLowerCase()) || []), b]);
    CONF_MAP.set(b.toLowerCase(), [...(CONF_MAP.get(b.toLowerCase()) || []), a]);
  }
}

const NUM = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", twenty: "20", hundred: "100" };

/** Chuẩn hoá một từ để so sánh: chữ thường, dấu nháy thẳng, bỏ dấu câu, số → chữ số. */
export function norm(w) {
  let s = String(w).toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/[^a-z0-9'\-]/g, "").replace(/^['-]+|['-]+$/g, "");
  if (NUM[s]) s = NUM[s];
  return s;
}

/** Tách câu thành token, giữ nguyên dấu câu/khoảng trắng để hiển thị lại đúng câu gốc. */
export function tokenize(text) {
  const out = [];
  const re = /[A-Za-z0-9]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z0-9]+)*|[^A-Za-z0-9]+/g;
  let m;
  while ((m = re.exec(text))) {
    const t = m[0];
    const isWord = /[A-Za-z0-9]/.test(t[0]);
    out.push({ t, word: isWord, n: isWord ? norm(t) : "" });
  }
  return out;
}

export const words = (text) => tokenize(text).filter((t) => t.word).map((t) => t.n);
export const isCommon = (w) => COMMON.has(norm(w));
export const isFunctionWord = (w) => FUNCTION_WORDS.has(norm(w));
/** Từ đáng học: không nằm trong nhóm thông dụng, dài ≥ 3, không phải số. */
export const isStudyWord = (w) => { const n = norm(w); return n.length >= 3 && !COMMON.has(n) && !/^\d+$/.test(n); };

/** Khoảng cách sửa chữ (tính cả đổi chỗ 2 chữ cạnh nhau là 1 lỗi: "beleive" ~ "believe"). */
export function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Chấm một ô điền từ: "ok" | "close" (sai chính tả nhẹ) | "wrong". */
export function checkWord(expected, typed) {
  const e = norm(expected), t = norm(typed);
  if (!t) return "wrong";
  if (e === t || e.replace(/'/g, "") === t.replace(/'/g, "")) return "ok";
  if (e.length >= 5 && levenshtein(e, t) <= 1) return "close";
  return "wrong";
}

/**
 * So khớp cả câu (chép chính tả, shadowing, lồng tiếng) bằng dãy con chung dài nhất.
 * Trả về từng từ của câu gốc kèm trạng thái, số từ thừa và điểm 0–100.
 */
export function diffWords(expectedText, typedText) {
  const exp = tokenize(expectedText).filter((t) => t.word);
  const typ = words(typedText);
  const n = exp.length, m = typ.length;
  const eq = (i, j) => checkWord(exp[i].t, typ[j]) !== "wrong";
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = eq(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const result = exp.map((t) => ({ word: t.t, ok: false }));
  const extra = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(i, j)) { result[i].ok = true; result[i].typed = typ[j]; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else { extra.push(typ[j]); j++; }
  }
  while (j < m) extra.push(typ[j++]);
  const matched = result.filter((r) => r.ok).length;
  const score = n + m ? Math.round((200 * matched) / (n + m)) : 0;
  return { words: result, extra, matched, total: n, score };
}

// ---------- Chia bài học (cảnh) ----------
/** Gom các câu liên tiếp thành cảnh ~size câu, ưu tiên cắt ở chỗ im lặng dài. */
export function buildLessons(cues, size = 8) {
  const lessons = [];
  let cur = [];
  for (let i = 0; i < cues.length; i++) {
    cur.push(i);
    const gap = i + 1 < cues.length ? cues[i + 1].start - cues[i].end : Infinity;
    const enough = cur.length >= size || (cur.length >= Math.ceil(size * 0.6) && gap > 2.5);
    if (enough || i === cues.length - 1) {
      // Không để cảnh cuối quá ngắn: gộp vào cảnh trước.
      if (i === cues.length - 1 && cur.length < 3 && lessons.length) lessons[lessons.length - 1].cues.push(...cur);
      else lessons.push({ cues: cur });
      cur = [];
    }
  }
  return lessons.map((l, k) => ({
    id: k, title: `Cảnh ${k + 1}`, cues: l.cues,
    start: cues[l.cues[0]].start, end: cues[l.cues[l.cues.length - 1]].end,
  }));
}

/** Các bước của một cảnh theo phương pháp "xem – hiểu – nghe kỹ – nói". */
export const STEPS = [
  { id: "gist", icon: "👀", name: "Xem không sub", desc: "Xem cả cảnh không phụ đề, đoán ý chính rồi tự đánh giá mình hiểu bao nhiêu." },
  { id: "watch", icon: "📖", name: "Xem có sub & tra từ", desc: "Xem lại với phụ đề, bấm vào từ lạ để tra nghĩa và lưu vào sổ từ." },
  { id: "choice", icon: "🎧", name: "Nghe chọn câu đúng", desc: "Nghe câu thoại (không sub) và chọn câu bạn nghe được trong 4 phương án gần giống nhau." },
  { id: "cloze", icon: "✍️", name: "Nghe điền từ", desc: "Nghe không sub, điền các từ còn thiếu vào câu." },
  { id: "order", icon: "🧩", name: "Sắp xếp từ", desc: "Nghe câu và bấm các từ theo đúng thứ tự." },
  { id: "spot", icon: "🔎", name: "Tìm từ sai", desc: "Phụ đề bị cài 1 từ sai — nghe kỹ và bấm vào từ khác với lời thoại." },
  { id: "dictation", icon: "📝", name: "Chép chính tả", desc: "Nghe và gõ lại cả câu. App so từng từ và chỉ ra chỗ sai." },
  { id: "shadow", icon: "🗣️", name: "Shadowing (nói đuổi)", desc: "Nghe từng câu rồi nói lại giống hệt ngữ điệu; ghi âm để so với bản gốc." },
  { id: "dub", icon: "🎭", name: "Lồng tiếng", desc: "Video tắt tiếng đúng câu thoại, bạn tự nói thay nhân vật cho khớp thời gian." },
  { id: "review", icon: "🔁", name: "Xem lại không sub", desc: "Xem lại cả cảnh không phụ đề và so mức hiểu với lần đầu." },
];
export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s]));

/** Câu đủ dài để làm bài nghe (≥ minWords từ). */
export const usable = (cues, idxs, minWords = 3) => idxs.filter((i) => words(cues[i].text).length >= minWords);

// ---------- Từng dạng bài ----------

/**
 * Điền từ. level 1: 1 ô, 2: ~30% số từ (ưu tiên từ đáng học), 3: ~55% kể cả hư từ.
 * Trả về {tokens, blanks:[chỉ số token]}.
 */
export function makeCloze(text, level, r, prefer = new Set()) {
  const tokens = tokenize(text);
  const idx = tokens.map((t, i) => (t.word ? i : -1)).filter((i) => i >= 0);
  const weight = (i) => {
    const w = tokens[i].n;
    let s = r() * 0.5;
    if (prefer.has(w)) s += 3;
    if (isStudyWord(w)) s += 2;
    if (!isFunctionWord(w)) s += 1;
    if (w.length >= 5) s += 0.5;
    if (level < 3 && isFunctionWord(w)) s -= 5;
    return s;
  };
  const count = level === 1 ? 1 : Math.max(1, Math.round(idx.length * (level === 2 ? 0.3 : 0.55)));
  const ranked = idx.map((i) => [i, weight(i)]).sort((a, b) => b[1] - a[1]);
  let chosen = ranked.slice(0, count).filter(([, s]) => s > -3).map(([i]) => i);
  if (!chosen.length && idx.length) chosen = [ranked[0][0]];
  return { tokens, blanks: chosen.sort((a, b) => a - b) };
}

/** Sắp xếp từ: các mảnh (từ + dấu câu dính kèm), đã xáo trộn khác thứ tự gốc. */
export function makeOrder(text, r) {
  const pieces = text.split(/\s+/).filter(Boolean);
  // Câu dài: ghép 2 từ thành 1 mảnh cho đỡ rối.
  let chunks = pieces;
  if (pieces.length > 9) {
    chunks = [];
    for (let i = 0; i < pieces.length; i += 2) chunks.push(pieces.slice(i, i + 2).join(" "));
  }
  let shuffled = shuffle(r, chunks.map((c, i) => ({ c, i })));
  for (let k = 0; k < 5 && chunks.length > 1 && shuffled.every((x, i) => x.c === chunks[i]); k++) shuffled = shuffle(r, shuffled);
  return { answer: chunks, shuffled };
}

/** Thay 1 từ trong câu bằng từ dễ nghe nhầm. Trả về null nếu không thay được. */
export function corrupt(text, r, pool = []) {
  const tokens = tokenize(text);
  const cands = tokens.map((t, i) => (t.word ? i : -1)).filter((i) => i >= 0);
  const options = [];
  for (const i of cands) {
    const w = tokens[i].n;
    const conf = CONF_MAP.get(w);
    if (conf) options.push({ i, alt: pick(r, conf), w: 3 });
    if (!isFunctionWord(w) && w.length >= 3 && !/^\d+$/.test(w)) {
      // Từ trong phim gần giống: cùng chữ cái đầu & độ dài gần bằng, hoặc khác 1–2 chữ cái.
      const near = pool.filter((p) => p !== w && p.length >= 3 && (levenshtein(p, w) <= 2 || (p[0] === w[0] && Math.abs(p.length - w.length) <= 1)));
      if (near.length) options.push({ i, alt: pick(r, near), w: 2 });
    }
  }
  if (!options.length) return null;
  const best = Math.max(...options.map((o) => o.w));
  const o = pick(r, options.filter((x) => x.w === best || r() < 0.3));
  const orig = tokens[o.i].t;
  let alt = o.alt;
  if (/^[A-Z]/.test(orig)) alt = alt[0].toUpperCase() + alt.slice(1);
  const out = tokens.map((t) => t.t);
  out[o.i] = alt;
  return { text: out.join(""), index: o.i, original: orig, wrong: alt, tokens: tokenize(out.join("")) };
}

/** Trắc nghiệm nghe: 1 câu đúng + 3 câu chỉ khác 1 từ dễ nghe nhầm. */
export function makeChoice(text, r, pool = []) {
  const seen = new Set([norm(text) + "|" + words(text).join(" ")]);
  const options = [text];
  for (let k = 0; k < 30 && options.length < 4; k++) {
    const c = corrupt(text, r, pool);
    if (!c) break;
    const key = norm(c.text) + "|" + words(c.text).join(" ");
    if (!seen.has(key)) { seen.add(key); options.push(c.text); }
  }
  if (options.length < 2) return null;
  const order = shuffle(r, options.map((_, i) => i));
  return { options: order.map((i) => options[i]), answer: order.indexOf(0) };
}

// ---------- Từ vựng của phim ----------
/** Danh sách từ đáng học trong phim, kèm số lần xuất hiện và câu ví dụ đầu tiên. */
export function vocabulary(cues) {
  const map = new Map();
  cues.forEach((c, ci) => {
    for (const t of tokenize(c.text)) {
      if (!t.word || !isStudyWord(t.n)) continue;
      // Gộp dạng số nhiều/đuôi -s đơn giản về một mục nếu dạng gốc đã có.
      const e = map.get(t.n) || { word: t.n, count: 0, cue: ci };
      e.count++;
      map.set(t.n, e);
    }
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/** Kho từ của phim (để tạo phương án nhiễu). */
export const wordPool = (cues) => [...new Set(cues.flatMap((c) => words(c.text)))];

// ---------- Ôn tập ngắt quãng (Leitner) cho sổ từ ----------
export const BOX_DAYS = [0, 1, 2, 4, 8, 16, 32, 64];
export function review(item, remembered, now = Date.now()) {
  const box = remembered ? Math.min((item.box || 0) + 1, BOX_DAYS.length - 1) : 0;
  const days = remembered ? BOX_DAYS[box] : 0;
  return { ...item, box, due: now + days * 86400000 - (days ? 3600000 : -600000), reviews: (item.reviews || 0) + 1 };
}
export const isDue = (item, now = Date.now()) => !item.due || item.due <= now;
