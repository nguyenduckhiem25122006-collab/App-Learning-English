// Trích phụ đề dạng chữ được nhúng sẵn trong file video (MKV: SRT/ASS/WebVTT; MP4: tx3g/mov_text, wvtt).
// Đọc file theo từng khúc (Blob.slice) nên không phải nạp cả bộ phim vào bộ nhớ, chạy offline hoàn toàn.
// Phụ đề "cứng" (in chết vào hình) không trích được — khi đó dùng file .srt riêng hoặc tạo phụ đề bằng AI.

import { fromBlocks } from "./subtitles.js";

const CHUNK = 4 << 20;
const utf8 = new TextDecoder("utf-8");

class Reader {
  constructor(blob) { this.blob = blob; this.size = blob.size; this.start = 0; this.buf = new Uint8Array(0); }
  async ensure(pos, n) {
    n = Math.min(n, this.size - pos);
    if (pos >= this.start && pos + n <= this.start + this.buf.length) return;
    const len = Math.min(Math.max(n, CHUNK), this.size - pos);
    this.buf = new Uint8Array(await this.blob.slice(pos, pos + len).arrayBuffer());
    this.start = pos;
  }
  byte(pos) { return this.buf[pos - this.start]; }
  bytes(pos, n) { return this.buf.subarray(pos - this.start, pos - this.start + n); }
}

// ======================= Matroska / WebM =======================
const ID = {
  EBML: 0x1a45dfa3, Segment: 0x18538067, Info: 0x1549a966, TimecodeScale: 0x2ad7b1, Tracks: 0x1654ae6b,
  TrackEntry: 0xae, TrackNumber: 0xd7, TrackType: 0x83, CodecID: 0x86, Language: 0x22b59c, LanguageBCP47: 0x22b59d,
  Name: 0x536e, Cluster: 0x1f43b675, Timecode: 0xe7, SimpleBlock: 0xa3, BlockGroup: 0xa0, Block: 0xa1, BlockDuration: 0x9b,
};
const SUB_CODECS = ["S_TEXT/UTF8", "S_TEXT/ASS", "S_TEXT/SSA", "S_TEXT/WEBVTT", "S_TEXT/ASCII"];

/** Đọc số độ dài thay đổi của EBML trong mảng byte u tại vị trí p. */
function vint(u, p, keepMarker) {
  const first = u[p];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (!(first & (0x80 >> (len - 1)))) len++;
  let v = keepMarker ? first : first & (0xff >> len);
  let allOnes = v === (0xff >> len);
  for (let i = 1; i < len; i++) {
    v = v * 256 + u[p + i];
    if (u[p + i] !== 0xff) allOnes = false;
  }
  return { v: !keepMarker && allOnes ? -1 : v, len };
}
function header(u, p) {
  const id = vint(u, p, true);
  if (!id) return null;
  const size = vint(u, p + id.len, false);
  if (!size) return null;
  return { id: id.v, size: size.v, hlen: id.len + size.len };
}
const uint = (u) => u.reduce((a, b) => a * 256 + b, 0);
const sint16 = (u, p) => { const v = (u[p] << 8) | u[p + 1]; return v & 0x8000 ? v - 0x10000 : v; };

/** Duyệt các phần tử con trong mảng byte (đồng bộ). */
function* children(u, from = 0, to = u.length) {
  let p = from;
  while (p < to) {
    const h = header(u, p);
    if (!h || h.size < 0) return;
    yield { ...h, data: u.subarray(p + h.hlen, p + h.hlen + h.size) };
    p += h.hlen + h.size;
  }
}

function parseTracks(u) {
  const tracks = [];
  for (const e of children(u)) {
    if (e.id !== ID.TrackEntry) continue;
    const t = { number: 0, type: 0, codec: "", lang: "", name: "" };
    for (const c of children(e.data)) {
      if (c.id === ID.TrackNumber) t.number = uint(c.data);
      else if (c.id === ID.TrackType) t.type = uint(c.data);
      else if (c.id === ID.CodecID) t.codec = utf8.decode(c.data).replace(/\0+$/, "");
      else if (c.id === ID.Language || c.id === ID.LanguageBCP47) t.lang = utf8.decode(c.data).replace(/\0+$/, "");
      else if (c.id === ID.Name) t.name = utf8.decode(c.data).replace(/\0+$/, "");
    }
    if (t.type === 0x11 || SUB_CODECS.includes(t.codec)) tracks.push(t);
  }
  return tracks;
}

/** Nội dung 1 khối phụ đề → các dòng chữ. ASS trong MKV: "ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text". */
function blockLines(codec, data) {
  let s = utf8.decode(data);
  if (codec === "S_TEXT/ASS" || codec === "S_TEXT/SSA") s = s.split(",").slice(8).join(",");
  return s.split(/\\N|\r?\n/i);
}

async function mkvTracks(blob, onProgress) {
  const r = new Reader(blob);
  await r.ensure(0, 64);
  let h = header(r.bytes(0, 64), 0);
  if (!h || h.id !== ID.EBML) return null;
  let pos = h.hlen + h.size;
  await r.ensure(pos, 16);
  h = header(r.bytes(pos, 16), 0);
  if (!h || h.id !== ID.Segment) return null;
  pos += h.hlen;
  const end = h.size < 0 ? r.size : Math.min(r.size, pos + h.size);
  let scale = 1e6, clusterTime = 0, tracks = null, lastReport = 0;
  const byNum = new Map();

  const addBlock = (u, duration) => {
    const tn = vint(u, 0, false);
    const t = tn && byNum.get(tn.v);
    if (!t) return;
    const rel = sint16(u, tn.len);
    const start = ((clusterTime + rel) * scale) / 1e9;
    const dur = duration != null ? (duration * scale) / 1e9 : null;
    t.blocks.push({ start, end: dur != null ? start + dur : null, lines: blockLines(t.codec, u.subarray(tn.len + 3)) });
  };

  while (pos < end) {
    await r.ensure(pos, 16);
    h = header(r.bytes(pos, 16), 0);
    if (!h) break;
    const data = pos + h.hlen;
    if (h.id === ID.Cluster) { pos = data; continue; } // đi vào trong cluster (kể cả cluster không rõ độ dài)
    if (h.size < 0) break;
    if (onProgress && pos - lastReport > 32 * CHUNK) { lastReport = pos; onProgress(pos / r.size); }
    if (h.id === ID.Info || h.id === ID.Tracks || h.id === ID.Timecode) {
      await r.ensure(data, h.size);
      const u = r.bytes(data, h.size);
      if (h.id === ID.Timecode) clusterTime = uint(u);
      else if (h.id === ID.Info) { for (const c of children(u)) if (c.id === ID.TimecodeScale) scale = uint(c.data); }
      else {
        tracks = parseTracks(u).map((t) => ({ ...t, blocks: [] }));
        tracks.forEach((t) => byNum.set(t.number, t));
        if (!tracks.length) return [];
      }
    } else if (tracks && h.id === ID.SimpleBlock) {
      await r.ensure(data, 8);
      const tn = vint(r.bytes(data, 8), 0, false);
      if (tn && byNum.has(tn.v)) { await r.ensure(data, h.size); addBlock(r.bytes(data, h.size), null); }
    } else if (tracks && h.id === ID.BlockGroup) {
      await r.ensure(data, 24);
      const first = header(r.bytes(data, 24), 0);
      const tn = first && first.id === ID.Block ? vint(r.bytes(data + first.hlen, 8), 0, false) : null;
      if (!first || first.id !== ID.Block || (tn && byNum.has(tn.v))) {
        await r.ensure(data, h.size);
        let block = null, duration = null;
        for (const c of children(r.bytes(data, h.size))) {
          if (c.id === ID.Block) block = c.data;
          else if (c.id === ID.BlockDuration) duration = uint(c.data);
        }
        if (block) addBlock(block, duration);
      }
    }
    pos = data + h.size;
  }
  return (tracks || []).map((t) => {
    t.blocks.sort((a, b) => a.start - b.start);
    t.blocks.forEach((b, i) => { if (b.end == null) b.end = Math.min(b.start + 4, t.blocks[i + 1]?.start ?? b.start + 4); });
    return { label: describe(t.lang, t.name, t.codec), lang: t.lang, cues: fromBlocks(t.blocks) };
  });
}

// ======================= MP4 / MOV =======================
const u32 = (u, p) => ((u[p] << 24) >>> 0) + (u[p + 1] << 16) + (u[p + 2] << 8) + u[p + 3];
const u64 = (u, p) => u32(u, p) * 4294967296 + u32(u, p + 4);
const type4 = (u, p) => String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]);

function* boxes(u, from = 0, to = u.length) {
  let p = from;
  while (p + 8 <= to) {
    let size = u32(u, p), hl = 8;
    const type = type4(u, p + 4);
    if (size === 1) { size = u64(u, p + 8); hl = 16; } else if (size === 0) size = to - p;
    if (size < hl) return;
    yield { type, data: u.subarray(p + hl, p + size) };
    p += size;
  }
}
const find = (u, type) => { for (const b of boxes(u)) if (b.type === type) return b.data; return null; };
const path = (u, ...types) => types.reduce((acc, t) => acc && find(acc, t), u);

async function mp4Tracks(blob) {
  const r = new Reader(blob);
  // Tìm hộp moov ở cấp cao nhất (có thể nằm cuối file).
  let pos = 0, moov = null;
  while (pos + 8 <= r.size) {
    await r.ensure(pos, 16);
    const u = r.bytes(pos, 16);
    let size = u32(u, 0), hl = 8;
    const type = type4(u, 4);
    if (pos === 0 && !["ftyp", "moov", "mdat", "free", "wide", "skip"].includes(type)) return null;
    if (size === 1) { size = u64(u, 8); hl = 16; } else if (size === 0) size = r.size - pos;
    if (size < hl) break;
    if (type === "moov") { await r.ensure(pos + hl, size - hl); moov = r.bytes(pos + hl, size - hl).slice(); break; }
    pos += size;
  }
  if (!moov) return null;
  const out = [];
  for (const trak of boxes(moov)) {
    if (trak.type !== "trak") continue;
    const mdia = find(trak.data, "mdia");
    const hdlr = mdia && find(mdia, "hdlr");
    if (!hdlr || !["sbtl", "text", "subt"].includes(type4(hdlr, 8))) continue;
    const mdhd = find(mdia, "mdhd");
    const v1 = mdhd[0] === 1;
    const timescale = u32(mdhd, v1 ? 20 : 12);
    const langBits = (mdhd[v1 ? 32 : 20] << 8) | mdhd[v1 ? 33 : 21];
    const lang = String.fromCharCode(((langBits >> 10) & 31) + 0x60, ((langBits >> 5) & 31) + 0x60, (langBits & 31) + 0x60);
    const stbl = path(mdia, "minf", "stbl");
    if (!stbl) continue;
    const stsd = find(stbl, "stsd");
    const fmt = stsd ? type4(stsd, 12) : "";
    // Kích thước mẫu
    const stsz = find(stbl, "stsz");
    const fixed = u32(stsz, 4), count = u32(stsz, 8);
    const sizes = Array.from({ length: count }, (_, i) => (fixed || u32(stsz, 12 + 4 * i)));
    // Vị trí các chunk
    const stco = find(stbl, "stco"), co64 = find(stbl, "co64");
    const chunkOff = stco ? Array.from({ length: u32(stco, 4) }, (_, i) => u32(stco, 8 + 4 * i))
      : Array.from({ length: u32(co64, 4) }, (_, i) => u64(co64, 8 + 8 * i));
    const stsc = find(stbl, "stsc");
    const stscN = u32(stsc, 4);
    const offsets = [];
    let s = 0;
    for (let e = 0; e < stscN; e++) {
      const firstChunk = u32(stsc, 8 + 12 * e) - 1, per = u32(stsc, 12 + 12 * e);
      const nextFirst = e + 1 < stscN ? u32(stsc, 8 + 12 * (e + 1)) - 1 : chunkOff.length;
      for (let c = firstChunk; c < nextFirst && s < count; c++) {
        let off = chunkOff[c];
        for (let k = 0; k < per && s < count; k++) { offsets.push(off); off += sizes[s++]; }
      }
    }
    // Thời gian các mẫu
    const stts = find(stbl, "stts");
    const times = [];
    let t = 0;
    for (let e = 0, n = u32(stts, 4); e < n; e++) {
      const cnt = u32(stts, 8 + 8 * e), delta = u32(stts, 12 + 8 * e);
      for (let k = 0; k < cnt; k++) { times.push([t / timescale, (t + delta) / timescale]); t += delta; }
    }
    const blocks = [];
    for (let i = 0; i < offsets.length && i < times.length; i++) {
      if (sizes[i] <= 2) continue;
      const data = new Uint8Array(await blob.slice(offsets[i], offsets[i] + sizes[i]).arrayBuffer());
      let text = "";
      if (fmt === "wvtt") {
        for (const b of boxes(data)) if (b.type === "vttc") { const p = find(b.data, "payl"); if (p) text += utf8.decode(p) + "\n"; }
      } else {
        const len = (data[0] << 8) | data[1];
        text = utf8.decode(data.subarray(2, 2 + len));
      }
      if (text.trim()) blocks.push({ start: times[i][0], end: times[i][1], lines: text.split(/\r?\n/) });
    }
    out.push({ label: describe(lang, "", fmt), lang, cues: fromBlocks(blocks) });
  }
  return out;
}

const LANGS = { eng: "Tiếng Anh", en: "Tiếng Anh", vie: "Tiếng Việt", vi: "Tiếng Việt", und: "Không rõ" };
function describe(lang, name, codec) {
  const l = LANGS[(lang || "").toLowerCase()] || lang || "Không rõ";
  return [l, name, codec.replace(/^[SD]_(TEXT\/)?/, "")].filter(Boolean).join(" · ");
}

/**
 * Trả về danh sách rãnh phụ đề [{label, lang, cues}] tìm thấy trong file.
 * [] = file không có phụ đề chữ; null = định dạng không hỗ trợ.
 */
export async function extractEmbedded(blob, onProgress) {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (u32(head, 0) === ID.EBML) return mkvTracks(blob, onProgress);
  if (type4(head, 4) === "ftyp" || type4(head, 4) === "moov") return mp4Tracks(blob);
  return null;
}

/** Chọn rãnh tiếng Anh (và tiếng Việt nếu có) phù hợp nhất. */
export function chooseTracks(tracks) {
  const isEn = (t) => /^en/i.test(t.lang) || /english/i.test(t.label);
  const isVi = (t) => /^vi/i.test(t.lang) || /vietnam/i.test(t.label);
  const en = tracks.find(isEn) || tracks.find((t) => !isVi(t) && t.cues.length) || null;
  const vi = tracks.find(isVi) || null;
  return { en, vi };
}
