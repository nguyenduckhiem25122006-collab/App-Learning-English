// Dịch vụ cần mạng (đều không bắt buộc — app vẫn chạy offline khi thiếu):
// tra từ điển, dịch nghĩa, đọc mẫu bằng giọng máy, nhận dạng giọng nói, tạo phụ đề bằng AI Whisper chạy ngay trong trình duyệt.

const cache = (() => {
  try { return JSON.parse(localStorage.getItem("hqp-dict") || "{}"); } catch { return {}; }
})();
function remember(key, value) {
  cache[key] = value;
  try { localStorage.setItem("hqp-dict", JSON.stringify(cache)); } catch { /* đầy bộ nhớ: bỏ qua */ }
  return value;
}

async function getJson(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

/** Từ điển Anh–Anh miễn phí (dictionaryapi.dev): phiên âm, file phát âm, định nghĩa, ví dụ. */
export async function lookup(word) {
  const key = "d:" + word;
  if (cache[key]) return cache[key];
  try {
    const data = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const e = data[0];
    const phonetic = e.phonetic || e.phonetics?.find((p) => p.text)?.text || "";
    const audio = e.phonetics?.find((p) => p.audio)?.audio || "";
    const senses = [];
    for (const m of e.meanings || []) for (const d of m.definitions.slice(0, 2)) senses.push({ pos: m.partOfSpeech, def: d.definition, ex: d.example || "" });
    return remember(key, { phonetic, audio, senses: senses.slice(0, 4) });
  } catch (err) {
    if (String(err.message) === "404") return remember(key, { phonetic: "", audio: "", senses: [] });
    return null;
  }
}

/** Dịch Anh → Việt (MyMemory, miễn phí, không cần khoá). */
export async function translate(text) {
  const key = "t:" + text;
  if (cache[key]) return cache[key];
  try {
    const data = await getJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`);
    const t = data?.responseData?.translatedText;
    return t && !/MYMEMORY WARNING/i.test(t) ? remember(key, t) : null;
  } catch { return null; }
}

// ---------- Giọng đọc máy ----------
export function speak(text, rate = 0.9) {
  if (!("speechSynthesis" in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const v = speechSynthesis.getVoices().find((x) => /^en[-_]US/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
  return true;
}

// ---------- Nhận dạng giọng nói (Chrome / Edge / Safari) ----------
export const canRecognize = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/** Bắt đầu nghe; trả về {stop(): Promise<string>} — chuỗi là câu nhận dạng được. */
export function recognize() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let text = "", done;
  const finished = new Promise((r) => (done = r));
  rec.onresult = (e) => {
    text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
  };
  rec.onend = () => done(text.trim());
  rec.onerror = () => done(text.trim());
  try { rec.start(); } catch { done(""); }
  return { stop: () => { try { rec.stop(); } catch { /* đã dừng */ } return finished; } };
}

// ---------- Ghi âm ----------
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  rec.start();
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve(new Blob(parts, { type: rec.mimeType || "audio/webm" })); };
      rec.stop();
    }),
  };
}

// ---------- Tạo phụ đề bằng AI (Whisper chạy trong trình duyệt, tải mô hình ~40–150 MB lần đầu) ----------
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
export const WHISPER_MODELS = [
  { id: "onnx-community/whisper-tiny.en", name: "Nhanh (tiny, ~40 MB)" },
  { id: "onnx-community/whisper-base.en", name: "Cân bằng (base, ~80 MB)" },
  { id: "onnx-community/whisper-small.en", name: "Chính xác (small, ~250 MB, chậm)" },
];

/** Giải mã âm thanh của video và hạ về 16 kHz mono (định dạng Whisper cần). */
async function decodeAudio(blob, onStatus) {
  onStatus?.("Đang tách âm thanh khỏi video…");
  const buf = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(buf);
  ctx.close?.();
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** Trả về danh sách khối {start, end, lines} để đưa qua fromBlocks(). */
export async function transcribe(blob, modelId, onStatus) {
  const audio = await decodeAudio(blob, onStatus);
  onStatus?.("Đang tải mô hình AI (chỉ lần đầu)…");
  const { pipeline } = await import(/* @vite-ignore */ TRANSFORMERS);
  const asr = await pipeline("automatic-speech-recognition", modelId, {
    progress_callback: (p) => { if (p.status === "progress" && p.total) onStatus?.(`Đang tải mô hình: ${p.file} ${Math.round(p.progress)}%`); },
  });
  const blocks = [];
  const STEP = 30 * 16000 * 10; // xử lý từng 5 phút một để cập nhật tiến độ
  for (let off = 0; off < audio.length; off += STEP) {
    onStatus?.(`AI đang nghe và chép lời… ${Math.round((100 * off) / audio.length)}%`);
    const part = audio.subarray(off, Math.min(audio.length, off + STEP));
    const out = await asr(part, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
    const base = off / 16000;
    for (const c of out.chunks || []) {
      const [s, e] = c.timestamp;
      if (c.text.trim()) blocks.push({ start: base + s, end: base + (e ?? s + 3), lines: [c.text.trim()] });
    }
  }
  return blocks;
}
