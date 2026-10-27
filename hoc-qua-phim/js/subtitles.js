// Đọc phụ đề SRT / WebVTT / ASS-SSA thành danh sách câu thoại {id, start, end, text, vi}.
// Thuần JS, không đụng tới DOM nên chạy được trong Node để test.

const VI_CHARS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìóòõúùýĂÂĐÊÔƠƯ]/i;

/** "01:02:03,450" | "02:03.450" | "1:02:03.45" (ASS) → giây */
export function parseTime(s) {
  const m = String(s).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return NaN;
  const [, h = 0, min, sec, frac = "0"] = m;
  return (+h) * 3600 + (+min) * 60 + (+sec) + (+frac) / 10 ** frac.length;
}

export function formatTime(t, withMs = false) {
  t = Math.max(0, t || 0);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const base = (h ? h + ":" + pad(m) : m) + ":" + pad(s);
  return withMs ? base + "." + pad(Math.round((t % 1) * 1000), 3) : base;
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

/** Bỏ thẻ định dạng, chú thích âm thanh [LAUGHS], (sighs), tên người nói "JOHN:", nốt nhạc. */
export function cleanLine(line) {
  let s = decodeEntities(line)
    .replace(/\{[^}]*\}/g, "")            // ASS override {\an8}, {\i1}
    .replace(/<[^>]+>/g, "")              // <i>, <font>, <c.yellow>, <00:00:01.000>
    .replace(/\\[Nn]/g, " ").replace(/\\h/g, " ")
    .replace(/\[[^\]]*\]/g, "")           // [door slams]
    .replace(/\([^)]*\)/g, "")            // (sighs)
    .replace(/[♪♫#]+/g, "")
    .replace(/^\s*-\s*/, "")              // "- Hi." (lời thoại 2 người)
    .replace(/^\s*[A-Z][A-Z .'-]{1,20}:\s*/, ""); // "JOHN: Hi" (phụ đề SDH)
  return s.replace(/\s+/g, " ").trim();
}

export const hasVietnamese = (s) => VI_CHARS.test(s);
export const hasLatinWord = (s) => /[A-Za-z]{2,}|\b[aAI]\b/.test(s);

/** Một khối phụ đề có thể chứa cả dòng tiếng Anh và dòng tiếng Việt (sub song ngữ). */
function splitBilingual(lines) {
  const en = [], vi = [];
  for (const raw of lines) {
    const l = cleanLine(raw);
    if (!l) continue;
    (hasVietnamese(l) ? vi : en).push(l);
  }
  return { text: en.join(" ").replace(/\s+/g, " ").trim(), vi: vi.join(" ").trim() };
}

/** Khối thô {start, end, lines[]} → câu thoại đã làm sạch (dùng chung cho SRT/ASS và phụ đề trích từ MKV/MP4). */
export function fromBlocks(blocks) {
  const cues = [];
  for (const b of blocks) {
    if (!(b.end > b.start)) continue;
    const { text, vi } = splitBilingual(b.lines);
    if (!text && !vi) continue;
    cues.push({ start: b.start, end: b.end, text, vi });
  }
  cues.sort((a, b) => a.start - b.start);
  // Gộp các khối trùng thời gian (một số file tách tiếng Anh/tiếng Việt thành 2 khối riêng).
  const merged = [];
  for (const c of cues) {
    const p = merged[merged.length - 1];
    if (p && Math.abs(p.start - c.start) < 0.05 && Math.abs(p.end - c.end) < 0.05) {
      if (c.text && !p.text.includes(c.text)) p.text = (p.text + " " + c.text).trim();
      if (c.vi && !p.vi.includes(c.vi)) p.vi = (p.vi + " " + c.vi).trim();
    } else merged.push(c);
  }
  return merged.map((c, i) => ({ id: i, ...c }));
}

function parseSrtVtt(text) {
  const blocks = [];
  const chunks = text.replace(/\r/g, "").split(/\n\s*\n/);
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->");
    const start = parseTime(a), end = parseTime(b.trim().split(/\s+/)[0]);
    if (isNaN(start) || isNaN(end)) continue;
    blocks.push({ start, end, lines: lines.slice(ti + 1) });
  }
  return blocks;
}

function parseAss(text) {
  const blocks = [];
  let format = null;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    // Chỉ dùng dòng Format nằm trong [Events] (Format của [V4+ Styles] mô tả kiểu chữ).
    if (/^\[Events\]/i.test(line)) { format = "pending"; continue; }
    if (format === "pending" && /^Format:/i.test(line)) {
      format = line.slice(7).split(",").map((s) => s.trim().toLowerCase());
      continue;
    }
    if (!/^Dialogue:/i.test(line)) continue;
    const f = Array.isArray(format) ? format : ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];
    const parts = line.slice(9).split(",");
    const textIdx = f.indexOf("text");
    const vals = parts.slice(0, textIdx).concat([parts.slice(textIdx).join(",")]);
    const get = (k) => (vals[f.indexOf(k)] || "").trim();
    const start = parseTime(get("start")), end = parseTime(get("end"));
    if (isNaN(start) || isNaN(end)) continue;
    blocks.push({ start, end, lines: get("text").split(/\\N/i) });
  }
  return blocks;
}

/** Tự nhận dạng định dạng và trả về danh sách câu thoại đã làm sạch. */
export function parseSubtitles(text) {
  text = String(text || "").replace(/^﻿/, "");
  const isAss = /^\s*\[Script Info\]/i.test(text) || /^Dialogue:/m.test(text);
  return fromBlocks(isAss ? parseAss(text) : parseSrtVtt(text));
}

/** Ghép phụ đề tiếng Việt (file riêng) vào câu tiếng Anh theo thời gian chồng lấn nhiều nhất. */
export function attachTranslation(cues, viCues) {
  let j = 0;
  return cues.map((c) => {
    const parts = [];
    while (j < viCues.length && viCues[j].end <= c.start) j++;
    for (let k = j; k < viCues.length && viCues[k].start < c.end; k++) {
      const v = viCues[k];
      const overlap = Math.min(c.end, v.end) - Math.max(c.start, v.start);
      // Câu VI thuộc câu EN này nếu hơn nửa câu VI nằm trong khoảng thời gian của nó.
      if (overlap > 0.5 * (v.end - v.start) || overlap > 0.5 * (c.end - c.start)) parts.push(v.vi || v.text);
    }
    return { ...c, vi: c.vi || parts.join(" ") };
  });
}

/** Chỉ giữ câu có chữ tiếng Anh (bỏ câu chỉ có tiếng Việt / chỉ có ký hiệu). */
export const englishCues = (cues) => cues.filter((c) => c.text && hasLatinWord(c.text)).map((c, i) => ({ ...c, id: i }));

export function toSrt(cues) {
  const t = (s) => {
    const ms = Math.round(s * 1000);
    const pad = (n, l = 2) => String(n).padStart(l, "0");
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}${c.vi ? "\n" + c.vi : ""}\n`).join("\n");
}

/** Câu đang hiển thị tại thời điểm t (tìm nhị phân). offset: lệch phụ đề, dương = phụ đề hiện muộn hơn. */
export function cueAt(cues, t, offset = 0) {
  let lo = 0, hi = cues.length - 1, best = -1;
  const x = t - offset;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= x) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best >= 0 && x < cues[best].end ? best : -1;
}

/** Câu gần nhất đã bắt đầu trước t (để biết "câu hiện tại" cả khi đang ở khoảng lặng). */
export function cueBefore(cues, t, offset = 0) {
  let lo = 0, hi = cues.length - 1, best = -1;
  const x = t - offset;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= x) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}
