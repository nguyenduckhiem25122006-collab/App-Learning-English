// Giao diện: thư viện phim, trình phát có phụ đề tương tác, lộ trình bài tập theo cảnh, luyện tập tự do, sổ từ.
import { parseSubtitles, attachTranslation, englishCues, fromBlocks, hasVietnamese, toSrt, cueAt, cueBefore, formatTime } from "./subtitles.js";
import {
  rng, shuffle, tokenize, words, norm, isStudyWord, checkWord, diffWords, buildLessons, STEPS, STEP_BY_ID, usable,
  makeCloze, makeOrder, corrupt, makeChoice, vocabulary, wordPool, review, isDue,
} from "./exercises.js";
import { extractEmbedded, chooseTracks } from "./embedded.js";
import * as db from "./store.js";
import { lookup, translate, speak, canRecognize, recognize, startRecording, transcribe, WHISPER_MODELS } from "./services.js";

// ======================= Trạng thái =======================
const S = {
  view: "home", movie: null, cues: [], lessons: [], pool: [], videoUrl: null, videoBlob: null,
  tab: "path", ex: null, vocab: [], vocabSet: new Set(), libVideo: {},
};
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const pct = (x) => Math.round(100 * (x || 0)) + "%";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), ms);
}
function modal(html) {
  $("#modalCard").innerHTML = html;
  $("#modal").hidden = !html;
}
const closeModal = () => modal("");

// ======================= Phụ đề hiển thị =======================
/** Câu thoại → HTML với từng từ bấm được để tra nghĩa. gap=true: ẩn từ mới (chế độ "sub ẩn từ khó"). */
function wordsHtml(text, { gap = false } = {}) {
  return tokenize(text).map((t) => {
    if (!t.word) return esc(t.t);
    const saved = S.vocabSet.has(t.n) ? " saved" : "";
    if (gap && (isStudyWord(t.n) || saved)) return `<span class="w gap" data-w="${esc(t.n)}" title="Bấm để xem">${"_".repeat(Math.min(t.t.length, 10))}</span>`;
    return `<span class="w${saved}" data-w="${esc(t.n)}">${esc(t.t)}</span>`;
  }).join("");
}

// ======================= Trình phát =======================
const P = {
  video: null, stopAt: null, onStop: null, lastCue: -2, muteFrom: null, muteTo: null, loopCue: -1,
  autoPause: false, pausedCue: -1, subOverride: null, ttsOnly: false,
};
const offset = () => S.movie?.settings.offset || 0;
const cueStart = (i) => S.cues[i].start + offset();
const cueEnd = (i) => S.cues[i].end + offset();

function subMode() { return P.subOverride ?? S.movie?.settings.subMode ?? "en"; }

function renderSub(i) {
  const box = $("#subs");
  if (!box) return;
  const mode = subMode();
  if (i < 0 || mode === "off") { box.innerHTML = ""; return; }
  const c = S.cues[i];
  let html = "";
  if (mode !== "vi") html += `<div class="sub-en">${wordsHtml(c.text, { gap: mode === "gap" })}</div>`;
  if ((mode === "envi" || mode === "vi") && c.vi) html += `<div class="sub-vi">${esc(c.vi)}</div>`;
  box.innerHTML = html;
}

function tick() {
  requestAnimationFrame(tick);
  const v = P.video;
  if (!v || !S.movie || !document.body.contains(v)) return;
  const t = v.currentTime;
  if (P.stopAt != null && t >= P.stopAt) {
    v.pause();
    const cb = P.onStop;
    P.stopAt = P.onStop = null;
    cb?.("end");
  }
  const shouldMute = P.muteFrom != null && t >= P.muteFrom && t < P.muteTo;
  if (v.muted !== shouldMute && P.muteFrom != null) v.muted = shouldMute;
  const i = cueAt(S.cues, t, offset());
  if (i !== P.lastCue) {
    // Tự dừng sau mỗi câu (chế độ xem tự do) và lặp câu.
    if (P.lastCue >= 0 && i !== P.lastCue && !v.paused && P.stopAt == null) {
      if (P.loopCue === P.lastCue) { v.currentTime = cueStart(P.loopCue) - 0.1; return; }
      if (P.autoPause && P.pausedCue !== P.lastCue) { P.pausedCue = P.lastCue; v.pause(); }
    }
    P.lastCue = i;
    renderSub(i);
    highlightTranscript(i >= 0 ? i : cueBefore(S.cues, t, offset()));
  }
  const seek = $("#seek");
  if (seek && !seek.matches(":active") && v.duration) seek.value = (1000 * t) / v.duration;
  const time = $("#time");
  if (time) time.textContent = `${formatTime(t)} / ${formatTime(v.duration || 0)}`;
  const pb = $("#playBtn");
  if (pb) pb.textContent = v.paused ? "▶" : "⏸";
}
requestAnimationFrame(tick);

/** Phát đoạn [a, b] giây rồi dừng. Trả về Promise khi hết đoạn (hoặc bị đoạn khác chen ngang). */
function playRange(a, b, rate) {
  const v = P.video;
  if (P.onStop) { const cb = P.onStop; P.onStop = null; cb("cancel"); }
  if (!v || !S.videoUrl) return Promise.resolve("novideo");
  return new Promise((resolve) => {
    v.playbackRate = rate || S.movie.settings.rate || 1;
    v.currentTime = Math.max(0, a);
    P.stopAt = b;
    P.onStop = (why) => { v.playbackRate = S.movie.settings.rate || 1; resolve(why); };
    v.play().catch(() => { P.stopAt = null; P.onStop = null; resolve("error"); });
  });
}

/** Phát một câu thoại (thêm đệm nhỏ hai đầu). Không có video thì đọc bằng giọng máy. */
function playCue(i, rate) {
  if (!S.videoUrl) {
    speak(S.cues[i].text, rate && rate < 1 ? 0.7 : 0.95);
    return Promise.resolve("tts");
  }
  return playRange(cueStart(i) - 0.12, cueEnd(i) + 0.15, rate);
}
const playCues = (idxs) => (S.videoUrl ? playRange(cueStart(idxs[0]) - 0.3, cueEnd(idxs[idxs.length - 1]) + 0.4) : (speak(idxs.map((i) => S.cues[i].text).join(" ")), Promise.resolve("tts")));

function stopPlayback() {
  if (P.onStop) { const cb = P.onStop; P.onStop = null; cb("cancel"); }
  P.stopAt = null;
  P.video?.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function currentCue() {
  const v = P.video;
  if (!v) return 0;
  const i = cueAt(S.cues, v.currentTime, offset());
  return i >= 0 ? i : Math.max(0, cueBefore(S.cues, v.currentTime, offset()));
}
function gotoCue(i, play = true) {
  i = Math.max(0, Math.min(S.cues.length - 1, i));
  P.pausedCue = -1;
  if (play) playFree(cueStart(i) - 0.1);
  else if (P.video) P.video.currentTime = cueStart(i);
}
/** Phát tự do từ thời điểm t (không có điểm dừng). */
function playFree(t) {
  const v = P.video;
  if (!v || !S.videoUrl) return;
  if (P.onStop) { const cb = P.onStop; P.onStop = null; cb("cancel"); }
  P.stopAt = null;
  if (t != null) v.currentTime = Math.max(0, t);
  v.play().catch(() => {});
}

function highlightTranscript(i) {
  const list = $("#transcript");
  if (!list) return;
  list.querySelector(".cur")?.classList.remove("cur");
  const row = list.querySelector(`[data-cue="${i}"]`);
  if (row) {
    row.classList.add("cur");
    if ($("#followTx")?.checked) row.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

// ======================= Thư viện =======================
async function renderHome() {
  S.view = "home";
  const movies = await db.getMovies();
  const vocab = await loadVocab();
  const due = vocab.filter((v) => isDue(v)).length;
  for (const m of movies) S.libVideo[m.id] = await db.hasVideo(m.id);
  const scenesDone = movies.reduce((a, m) => a + Object.values(m.progress || {}).filter((p) => Object.keys(p).length >= STEPS.length).length, 0);
  $("#view").innerHTML = `
  <section class="home">
    <div class="drop" id="drop">
      <div class="drop-icon">🎞️</div>
      <h1>Học tiếng Anh từ chính bộ phim bạn thích</h1>
      <p>Kéo thả <b>đoạn phim</b> (MP4, MKV, WebM, MOV) và file <b>phụ đề</b> (.srt, .vtt, .ass) vào đây.
      App tự đọc phụ đề có sẵn trong file MKV/MP4, chia phim thành từng cảnh và tạo bài tập cho bạn.</p>
      <div class="row center">
        <button class="btn primary big" data-act="pick">＋ Chọn đoạn phim</button>
      </div>
      <p class="muted small">Video chỉ nằm trên máy của bạn, không tải lên máy chủ nào. Có thể chọn cùng lúc video + phụ đề tiếng Anh + phụ đề tiếng Việt.</p>
    </div>

    <div class="stats">
      <div class="stat"><b>${movies.length}</b><span>đoạn phim</span></div>
      <div class="stat"><b>${scenesDone}</b><span>cảnh đã học xong</span></div>
      <div class="stat"><b>${vocab.length}</b><span>từ trong sổ</span></div>
      <div class="stat ${due ? "hot" : ""}" data-act="go" data-view="vocab"><b>${due}</b><span>từ cần ôn hôm nay</span></div>
    </div>

    <h2>Phim của bạn</h2>
    ${movies.length ? `<div class="grid">${movies.map(movieCard).join("")}</div>` : `<p class="muted">Chưa có phim nào. Hãy thêm đoạn phim đầu tiên — mẹo: chọn cảnh 3–10 phút bạn thích, có phụ đề tiếng Anh.</p>`}

    <div class="row backup">
      <button class="btn ghost small" data-act="export">⤓ Sao lưu tiến độ & sổ từ</button>
      <button class="btn ghost small" data-act="import">⤒ Khôi phục bản sao lưu</button>
    </div>
  </section>`;
  const drop = $("#drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); importFiles([...e.dataTransfer.files]); });
}

function movieProgress(m) {
  const lessons = buildLessons(m.cues, m.settings.lessonSize);
  let done = 0;
  for (const l of lessons) done += Object.keys(m.progress?.[l.id] || {}).length;
  return lessons.length ? done / (lessons.length * STEPS.length) : 0;
}
function movieCard(m) {
  const p = movieProgress(m);
  const scenes = buildLessons(m.cues, m.settings.lessonSize).length;
  return `<article class="card movie-card" data-act="open" data-id="${esc(m.id)}">
    <div class="mc-title">${esc(m.title)}</div>
    <div class="mc-meta">${m.cues.length} câu thoại · ${scenes} cảnh${m.cues.some((c) => c.vi) ? " · có tiếng Việt" : ""}</div>
    <div class="bar"><i style="width:${pct(p)}"></i></div>
    <div class="mc-foot"><span>${pct(p)} hoàn thành</span><span class="${S.libVideo[m.id] ? "ok" : "muted"}">${S.libVideo[m.id] ? "● video đã lưu" : "○ cần chọn lại file video"}</span></div>
  </article>`;
}

// ======================= Thêm phim =======================
const VIDEO_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|ogv|mp3|m4a|wav|ogg)$/i;
const SUB_EXT = /\.(srt|vtt|ass|ssa|txt)$/i;

async function readSubFile(f) {
  const buf = await f.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf); // file phụ đề cũ không phải UTF-8
  if (/^￾|^﻿/.test(text) || text.includes("\0")) text = new TextDecoder("utf-16le").decode(buf);
  return parseSubtitles(text);
}
const mostlyVietnamese = (cues) => cues.filter((c) => hasVietnamese(c.vi || c.text)).length > cues.length * 0.5;
/** File phụ đề tiếng Việt thuần (không phải song ngữ Anh–Việt)? */
const isVietnameseFile = (cues) => mostlyVietnamese(cues) && cues.filter((c) => c.text && c.vi).length < cues.length * 0.3;

/** Câu tiếng Việt nằm ở trường text (file phụ đề tiếng Việt riêng) → chuyển sang trường vi. */
const asVi = (cues) => cues.map((c) => ({ ...c, vi: c.vi || c.text, text: "" }));

async function importFiles(files) {
  const video = files.find((f) => VIDEO_EXT.test(f.name) || /^(video|audio)\//.test(f.type));
  const subs = files.filter((f) => SUB_EXT.test(f.name));
  if (!video && !subs.length) return toast("Không nhận ra file. Hãy chọn video (MP4/MKV/WebM) hoặc phụ đề (.srt/.vtt/.ass).");
  if (!video) {
    if (S.movie && S.view === "movie") return replaceSubtitles(subs);
    return toast("Hãy chọn kèm file video của phụ đề này.");
  }
  const id = db.movieId(video);
  const existing = await db.getMovie(id);
  if (existing && !subs.length) { await openMovie(id, video); return; }

  let en = null, vi = null;
  for (const f of subs) {
    const cues = await readSubFile(f);
    if (!cues.length) continue;
    if (isVietnameseFile(cues)) vi = asVi(cues);
    else en = cues;
  }
  if (!en) {
    modal(`<h3>Đang tìm phụ đề trong file…</h3><p class="muted" id="extractMsg">${esc(video.name)}</p><div class="bar"><i id="extractBar" style="width:2%"></i></div>`);
    try {
      const tracks = await extractEmbedded(video, (p) => { const b = $("#extractBar"); if (b) b.style.width = pct(p); });
      if (tracks?.length) {
        const pickT = chooseTracks(tracks);
        if (pickT.en?.cues.length) en = isVietnameseFile(pickT.en.cues) ? null : pickT.en.cues;
        if (pickT.vi?.cues.length && !vi) vi = asVi(pickT.vi.cues);
        if (!en && pickT.en && isVietnameseFile(pickT.en.cues) && !vi) vi = asVi(pickT.en.cues);
        if (en) toast(`Đã lấy phụ đề có sẵn trong file: ${pickT.en.label}${pickT.vi ? " + " + pickT.vi.label : ""}`, 4000);
      }
    } catch (err) { console.warn("extract", err); }
    closeModal();
  }
  if (!en) return askForSubtitles(video, vi);
  await createMovie(video, en, vi);
}

function askForSubtitles(video, vi) {
  S.pending = { video, vi };
  modal(`<h3>Chưa tìm thấy phụ đề tiếng Anh dạng chữ</h3>
    <p>Video <b>${esc(video.name)}</b> không có sẵn phụ đề chữ bên trong. Nếu phụ đề được <b>in cứng vào hình</b>, app không đọc được chữ trên hình — hãy chọn một trong các cách:</p>
    <div class="choices">
      <button class="btn primary" data-act="pendingSub">📄 Chọn file phụ đề (.srt / .vtt / .ass)</button>
      <div class="ai-box">
        <button class="btn" data-act="pendingAi">🤖 Tạo phụ đề bằng AI (Whisper)</button>
        <select id="aiModel">${WHISPER_MODELS.map((m, i) => `<option value="${m.id}" ${i === 1 ? "selected" : ""}>${m.name}</option>`).join("")}</select>
        <p class="muted small">Chạy ngay trong trình duyệt, cần mạng để tải mô hình lần đầu. Phù hợp đoạn phim ngắn (dưới ~20 phút). Máy yếu có thể chậm.</p>
      </div>
    </div>
    <p class="muted small">Mẹo: tìm phụ đề tiếng Anh theo tên phim trên OpenSubtitles, Subscene… Với phim có sub cứng, bật "Che sub cứng" trong trình phát để luyện nghe tắt sub.</p>
    <div class="row end"><button class="btn ghost" data-act="closeModal">Huỷ</button></div>`);
}

async function createMovie(video, en, vi) {
  let cues = englishCues(vi ? attachTranslation(en, vi) : en);
  if (cues.length < 2) return toast("Phụ đề quá ít câu tiếng Anh để tạo bài tập.");
  const m = {
    id: db.movieId(video), title: video.name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim(), size: video.size,
    cues, created: Date.now(), opened: Date.now(), progress: {}, mistakes: {},
    settings: { offset: 0, subMode: "en", lessonSize: 8, rate: 1, clozeLevel: 2, mask: { on: false, bottom: 3, height: 16 }, saveVideo: video.size < 800e6 },
  };
  await db.putMovie(m);
  if (m.settings.saveVideo) db.saveVideo(m.id, video).then((ok) => ok || toast("Không đủ dung lượng để lưu video trong trình duyệt — lần sau cần chọn lại file."));
  db.persist();
  await openMovie(m.id, video);
  toast(`Đã tạo ${buildLessons(cues, 8).length} cảnh với ${cues.length} câu thoại. Bắt đầu từ Cảnh 1 nhé!`, 4000);
}

async function replaceSubtitles(files) {
  let en = null, vi = null;
  for (const f of files) {
    const cues = await readSubFile(f);
    if (!cues.length) continue;
    if (isVietnameseFile(cues)) vi = asVi(cues); else en = cues;
  }
  const m = S.movie;
  if (en) {
    if (!confirm("Thay phụ đề tiếng Anh sẽ làm mới lộ trình (tiến độ cảnh cũ bị xoá). Tiếp tục?")) return;
    m.cues = englishCues(vi ? attachTranslation(en, vi) : en);
    m.progress = {};
    m.mistakes = {};
  } else if (vi) {
    m.cues = attachTranslation(m.cues.map((c) => ({ ...c, vi: "" })), vi);
  } else return toast("Không đọc được phụ đề.");
  await saveMovie();
  loadCues();
  renderMovie();
  toast(en ? "Đã thay phụ đề tiếng Anh." : "Đã thêm phụ đề tiếng Việt.");
}

async function aiSubtitles(video, vi, model) {
  modal(`<h3>🤖 Đang tạo phụ đề bằng AI</h3><p id="aiMsg">Chuẩn bị…</p><p class="muted small">Đừng đóng trang. Mô hình được lưu lại nên lần sau nhanh hơn.</p>`);
  try {
    const blocks = await transcribe(video, model, (msg) => { const e = $("#aiMsg"); if (e) e.textContent = msg; });
    closeModal();
    const en = fromBlocks(blocks);
    if (!en.length) return toast("AI không nghe ra lời thoại tiếng Anh nào.");
    await createMovie(video, en, vi);
    toast("Phụ đề do AI tạo có thể sai vài chỗ — có thể xuất file .srt trong Cài đặt để sửa.", 5000);
  } catch (err) {
    console.error(err);
    modal(`<h3>Không tạo được phụ đề</h3><p>${esc(err.message || err)}</p><p class="muted small">Cần kết nối mạng để tải mô hình; video quá dài hoặc định dạng âm thanh lạ cũng có thể gây lỗi. Hãy thử file .srt.</p>
      <div class="row end"><button class="btn" data-act="closeModal">Đóng</button></div>`);
  }
}

// ======================= Màn hình phim =======================
function loadCues() {
  S.cues = S.movie.cues;
  S.lessons = buildLessons(S.cues, S.movie.settings.lessonSize);
  S.pool = wordPool(S.cues);
}

async function openMovie(id, file) {
  const m = await db.getMovie(id);
  if (!m) return toast("Không tìm thấy phim.");
  stopPlayback();
  if (S.videoUrl) URL.revokeObjectURL(S.videoUrl);
  S.videoUrl = null;
  S.movie = m;
  m.opened = Date.now();
  db.putMovie(m);
  loadCues();
  const blob = file || (await db.getVideo(id));
  if (blob) S.videoUrl = URL.createObjectURL(blob);
  if (file && m.settings.saveVideo && !(await db.hasVideo(id))) db.saveVideo(id, file);
  S.ex = null;
  S.tab = "path";
  await loadVocab();
  renderMovie();
}

let saveTimer = null;
function saveMovie() {
  clearTimeout(saveTimer);
  return new Promise((r) => { saveTimer = setTimeout(() => db.putMovie(S.movie).then(r), 150); });
}

function renderMovie() {
  S.view = "movie";
  const m = S.movie, st = m.settings;
  $("#view").innerHTML = `
  <section class="movie">
    <div class="stage">
      <div class="title-row"><button class="btn ghost small" data-act="go" data-view="home">←</button><h2 title="${esc(m.title)}">${esc(m.title)}</h2></div>
      <div class="video-wrap" id="wrap">
        <video id="video" playsinline preload="auto"></video>
        <div class="mask ${st.mask.on ? "" : "hide"}" id="mask"></div>
        <div class="subs" id="subs"></div>
        ${S.videoUrl ? "" : `<div class="novideo"><p>Chưa có file video cho phim này.</p><button class="btn primary" data-act="pickVideo">Chọn lại file video</button><p class="muted small">Vẫn có thể học bằng giọng đọc máy (kém tự nhiên hơn).</p></div>`}
      </div>
      <div class="controls">
        <input type="range" id="seek" min="0" max="1000" value="0" aria-label="Tua">
        <div class="ctl-row">
          <button class="ic" data-act="prevCue" title="Câu trước (←)">⏮</button>
          <button class="ic" data-act="replayCue" title="Nghe lại câu (R)">⟲</button>
          <button class="ic main" id="playBtn" data-act="toggle" title="Phát/Dừng (Space)">▶</button>
          <button class="ic" data-act="nextCue" title="Câu sau (→)">⏭</button>
          <span id="time" class="time">0:00</span>
          <span class="grow"></span>
          <select id="subMode" title="Phụ đề">
            ${[["en", "Sub Anh"], ["envi", "Anh + Việt"], ["vi", "Sub Việt"], ["gap", "Sub ẩn từ mới"], ["off", "Tắt sub"]].map(([v, l]) => `<option value="${v}" ${st.subMode === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
          <select id="rate" title="Tốc độ">
            ${[0.5, 0.75, 0.9, 1, 1.25].map((r) => `<option value="${r}" ${st.rate == r ? "selected" : ""}>${r}×</option>`).join("")}
          </select>
          <button class="ic toggle ${P.autoPause ? "on" : ""}" data-act="autoPause" title="Tự dừng sau mỗi câu">⏸︎¹</button>
          <button class="ic toggle ${st.mask.on ? "on" : ""}" data-act="mask" title="Che phụ đề cứng (in sẵn trên hình)">▬</button>
          <button class="ic" data-act="fullscreen" title="Toàn màn hình">⛶</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="tabs">
        ${[["path", "Lộ trình"], ["tx", "Lời thoại"], ["practice", "Luyện tập"], ["words", "Từ vựng"], ["settings", "Cài đặt"]]
          .map(([k, l]) => `<button class="tab ${S.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}">${l}</button>`).join("")}
      </div>
      <div id="panelBody" class="panel-body"></div>
    </div>
  </section>`;
  const v = $("#video");
  P.video = v;
  P.lastCue = -2;
  if (S.videoUrl) v.src = S.videoUrl;
  v.playbackRate = st.rate || 1;
  v.addEventListener("error", () => toast("Trình duyệt không phát được định dạng video này. Thử file MP4 (H.264) hoặc mở bằng Chrome/Edge.", 6000));
  v.addEventListener("click", () => (v.paused ? playFree() : v.pause()));
  applyMask();
  $("#seek").addEventListener("input", (e) => { if (v.duration) v.currentTime = (e.target.value / 1000) * v.duration; });
  $("#subMode").addEventListener("change", (e) => { st.subMode = e.target.value; saveMovie(); P.lastCue = -2; });
  $("#rate").addEventListener("change", (e) => { st.rate = +e.target.value; v.playbackRate = st.rate; saveMovie(); });
  renderPanel();
}

function applyMask() {
  const mk = $("#mask");
  if (!mk) return;
  const { on, bottom, height } = S.movie.settings.mask;
  mk.classList.toggle("hide", !on);
  mk.style.bottom = bottom + "%";
  mk.style.height = height + "%";
}

function renderPanel() {
  const body = $("#panelBody");
  if (!body) return;
  P.subOverride = null;
  P.lastCue = -2;
  if (S.ex) return renderExercise();
  if (S.tab === "path") body.innerHTML = pathHtml();
  else if (S.tab === "tx") { body.innerHTML = transcriptHtml(); bindTranscript(); highlightTranscript(currentCue()); }
  else if (S.tab === "practice") body.innerHTML = practiceHtml();
  else if (S.tab === "words") body.innerHTML = wordsTabHtml();
  else if (S.tab === "settings") { body.innerHTML = settingsHtml(); bindSettings(); }
}

// ---------- Lộ trình ----------
function lessonDone(l) { return Object.keys(S.movie.progress[l.id] || {}).length; }
function nextStep(l) { return STEPS.find((s) => !S.movie.progress[l.id]?.[s.id]); }

function pathHtml() {
  const firstOpen = S.lessons.find((l) => lessonDone(l) < STEPS.length);
  return `<p class="muted small">Phim được chia thành ${S.lessons.length} cảnh. Mỗi cảnh có ${STEPS.length} bước, từ hiểu ý chính → nghe kỹ từng từ → nói theo. Làm theo thứ tự cho hiệu quả nhất, hoặc bấm vào bước bất kỳ.</p>
  <div class="lessons">${S.lessons.map((l) => {
    const done = lessonDone(l), open = l === firstOpen;
    const first = S.cues[l.cues[0]].text;
    return `<details class="lesson ${done >= STEPS.length ? "complete" : ""}" ${open ? "open" : ""}>
      <summary><span class="l-title">${l.title}</span><span class="l-time">${formatTime(l.start)}–${formatTime(l.end)}</span>
        <span class="l-prog">${done}/${STEPS.length}</span><span class="l-first">“${esc(first.slice(0, 60))}${first.length > 60 ? "…" : ""}”</span></summary>
      <div class="steps">${STEPS.map((s, k) => {
        const p = S.movie.progress[l.id]?.[s.id];
        return `<button class="step ${p ? "done" : ""}" data-act="step" data-lesson="${l.id}" data-step="${s.id}" title="${esc(s.desc)}">
          <span class="s-n">${k + 1}</span><span class="s-ic">${s.icon}</span><span class="s-name">${s.name}</span>${p ? `<span class="s-score">${pct(p.score)}</span>` : ""}</button>`;
      }).join("")}</div>
    </details>`;
  }).join("")}</div>`;
}

// ---------- Lời thoại ----------
function transcriptHtml() {
  return `<div class="row tx-tools"><input type="search" id="txSearch" placeholder="Tìm trong lời thoại…">
    <label class="chk"><input type="checkbox" id="followTx" checked> Cuộn theo</label>
    <label class="chk"><input type="checkbox" id="txVi" ${S.txVi ? "checked" : ""} data-act="txVi"> Tiếng Việt</label></div>
  <p class="muted small">Bấm vào từ để tra nghĩa · ▶ phát câu · 🔁 lặp câu.</p>
  <div id="transcript" class="transcript">${S.cues.map((c, i) => `<div class="tx-row" data-cue="${i}">
      <button class="tx-time" data-act="seekCue" data-i="${i}">${formatTime(c.start)}</button>
      <div class="tx-text"><div>${wordsHtml(c.text)}</div>${S.txVi && c.vi ? `<div class="tx-vi">${esc(c.vi)}</div>` : ""}</div>
      <button class="ic sm" data-act="playLine" data-i="${i}" title="Phát câu">▶</button>
      <button class="ic sm ${P.loopCue === i ? "on" : ""}" data-act="loopLine" data-i="${i}" title="Lặp câu">🔁</button>
    </div>`).join("")}</div>`;
}
function bindTranscript() {
  $("#txSearch")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    for (const row of document.querySelectorAll("#transcript .tx-row")) row.hidden = !!q && !row.textContent.toLowerCase().includes(q);
  });
}

// ---------- Luyện tập tự do ----------
const PRACTICE_TYPES = ["choice", "cloze", "order", "spot", "dictation", "shadow", "dub"];
function practiceHtml() {
  const mistakes = Object.keys(S.movie.mistakes || {}).length;
  return `<p class="muted small">Chọn một dạng bài và nguồn câu. Kết quả ở đây không tính vào lộ trình, nhưng câu làm sai sẽ được ghi lại để luyện lại.</p>
  <div class="field"><label>Dạng bài</label><div class="chips" id="pType">${PRACTICE_TYPES.map((t, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="chip" data-v="${t}">${STEP_BY_ID[t].icon} ${STEP_BY_ID[t].name}</button>`).join("")}</div></div>
  <div class="field"><label>Lấy câu từ</label>
    <select id="pSource">
      <option value="random">10 câu ngẫu nhiên trong cả phim</option>
      ${mistakes ? `<option value="mistakes">Các câu đã làm sai (${mistakes})</option>` : ""}
      ${S.lessons.map((l) => `<option value="l${l.id}">${l.title} (${formatTime(l.start)})</option>`).join("")}
    </select></div>
  <button class="btn primary" data-act="startPractice">Bắt đầu ▶</button>
  <hr>
  <h4>🎯 Thử thách nghe nhanh</h4>
  <p class="muted small">Nghe 1 câu ngẫu nhiên, đoán xem là câu nào trong 4 câu — 20 câu liên tục, càng nhanh càng tốt.</p>
  <button class="btn" data-act="startSprint">Bắt đầu thử thách</button>`;
}

// ---------- Từ vựng của phim ----------
function wordsTabHtml() {
  const list = vocabulary(S.cues);
  const dur = S.cues.length ? S.cues[S.cues.length - 1].end - S.cues[0].start : 0;
  const speech = S.cues.reduce((a, c) => a + (c.end - c.start), 0);
  const total = S.cues.reduce((a, c) => a + words(c.text).length, 0);
  const wpm = speech ? Math.round(total / (speech / 60)) : 0;
  const level = wpm > 170 ? "nhanh" : wpm > 130 ? "trung bình" : "chậm";
  return `<div class="stats small-stats">
    <div class="stat"><b>${total}</b><span>từ được nói</span></div>
    <div class="stat"><b>${list.length}</b><span>từ đáng học</span></div>
    <div class="stat"><b>${wpm}</b><span>từ/phút (${level})</span></div>
    <div class="stat"><b>${formatTime(dur)}</b><span>độ dài thoại</span></div></div>
  <p class="muted small">Từ ít gặp trong tiếng Anh hằng ngày, xếp theo số lần xuất hiện trong phim. Bấm để tra nghĩa, ＋ để lưu vào sổ từ.</p>
  <div class="wordlist">${list.slice(0, 300).map((w) => `<div class="wl-row">
      <span class="w ${S.vocabSet.has(w.word) ? "saved" : ""}" data-w="${esc(w.word)}" data-cue="${w.cue}">${esc(w.word)}</span>
      <span class="muted">×${w.count}</span>
      <span class="wl-ex">${esc(S.cues[w.cue].text)}</span>
      <button class="ic sm" data-act="playLine" data-i="${w.cue}">▶</button>
      ${S.vocabSet.has(w.word) ? `<span class="ok">✓</span>` : `<button class="ic sm" data-act="quickSave" data-w="${esc(w.word)}" data-i="${w.cue}" title="Lưu vào sổ từ">＋</button>`}
    </div>`).join("")}</div>`;
}

// ---------- Cài đặt ----------
function settingsHtml() {
  const st = S.movie.settings;
  return `<div class="field"><label>Đồng bộ phụ đề (sub hiện sớm/muộn so với tiếng)</label>
    <div class="row"><button class="btn small" data-act="offset" data-d="-0.5">−0,5s</button><button class="btn small" data-act="offset" data-d="-0.1">−0,1s</button>
    <b id="offsetVal" class="mono">${(st.offset >= 0 ? "+" : "") + st.offset.toFixed(1)}s</b>
    <button class="btn small" data-act="offset" data-d="0.1">+0,1s</button><button class="btn small" data-act="offset" data-d="0.5">+0,5s</button></div>
    <p class="muted small">Sub hiện trước khi nhân vật nói → bấm "+"; hiện sau → bấm "−".</p></div>
  <div class="field"><label>Che phụ đề cứng (phim có sub in sẵn trên hình)</label>
    <label class="chk"><input type="checkbox" id="maskOn" ${st.mask.on ? "checked" : ""}> Bật dải che mờ</label>
    <div class="row"><span class="small">Vị trí</span><input type="range" id="maskBottom" min="0" max="40" value="${st.mask.bottom}">
    <span class="small">Độ cao</span><input type="range" id="maskHeight" min="5" max="40" value="${st.mask.height}"></div></div>
  <div class="field"><label>Số câu mỗi cảnh</label>
    <select id="lessonSize">${[5, 8, 12, 16].map((n) => `<option ${st.lessonSize === n ? "selected" : ""}>${n}</option>`).join("")}</select>
    <p class="muted small">Đổi số câu sẽ chia lại cảnh và xoá tiến độ lộ trình của phim này.</p></div>
  <div class="field"><label>Mức điền từ</label>
    <select id="clozeLevel">${[[1, "Dễ – 1 từ mỗi câu"], [2, "Vừa – khoảng 30% số từ"], [3, "Khó – hơn một nửa số từ"]].map(([v, l]) => `<option value="${v}" ${st.clozeLevel == v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
  <div class="field"><label>Phụ đề</label><div class="row wrap">
    <button class="btn small" data-act="pickSub">Thay / thêm phụ đề (Anh hoặc Việt)</button>
    <button class="btn small" data-act="exportSrt">Xuất file .srt</button>
    <button class="btn small" data-act="pickVideo">Chọn lại file video</button></div></div>
  <div class="field"><label>Lưu video trong trình duyệt</label>
    <label class="chk"><input type="checkbox" id="saveVideo" ${st.saveVideo ? "checked" : ""}> Lưu để lần sau mở lại không cần chọn file (tốn dung lượng máy)</label>
    <p class="muted small" id="storageInfo"></p></div>
  <div class="field danger"><button class="btn danger small" data-act="deleteMovie">Xoá phim này khỏi thư viện</button></div>`;
}

function bindSettings() {
  const st = S.movie.settings;
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);
  on("#maskOn", "change", (e) => { st.mask.on = e.target.checked; applyMask(); saveMovie(); renderControlsState(); });
  on("#maskBottom", "input", (e) => { st.mask.bottom = +e.target.value; st.mask.on = true; $("#maskOn").checked = true; applyMask(); saveMovie(); });
  on("#maskHeight", "input", (e) => { st.mask.height = +e.target.value; st.mask.on = true; $("#maskOn").checked = true; applyMask(); saveMovie(); });
  on("#clozeLevel", "change", (e) => { st.clozeLevel = +e.target.value; saveMovie(); });
  on("#lessonSize", "change", (e) => {
    if (!confirm("Chia lại cảnh sẽ xoá tiến độ lộ trình của phim này. Tiếp tục?")) { e.target.value = st.lessonSize; return; }
    st.lessonSize = +e.target.value; S.movie.progress = {}; loadCues(); saveMovie(); toast(`Đã chia thành ${S.lessons.length} cảnh.`);
  });
  on("#saveVideo", "change", async (e) => {
    st.saveVideo = e.target.checked;
    saveMovie();
    if (!st.saveVideo) { await db.deleteVideo(S.movie.id); return toast("Đã xoá video khỏi bộ nhớ trình duyệt."); }
    if (!S.videoUrl) return toast("Hãy chọn lại file video trước.");
    const blob = await fetch(S.videoUrl).then((r) => r.blob());
    toast((await db.saveVideo(S.movie.id, blob)) ? "Đã lưu video trong trình duyệt." : "Không đủ dung lượng để lưu video.");
  });
  db.storageInfo().then((i) => { if (i && $("#storageInfo")) $("#storageInfo").textContent = `Đã dùng ${(i.used / 1e9).toFixed(2)} GB / còn khoảng ${((i.quota - i.used) / 1e9).toFixed(1)} GB.`; });
}
function renderControlsState() {
  document.querySelector('[data-act="mask"]')?.classList.toggle("on", S.movie.settings.mask.on);
  document.querySelector('[data-act="autoPause"]')?.classList.toggle("on", P.autoPause);
}

// ======================= Bài tập =======================
function makeItems(type, idxs, seed) {
  const r = rng(seed);
  const st = S.movie.settings;
  const prefer = S.vocabSet;
  const items = [];
  const min = type === "order" || type === "choice" || type === "spot" ? 4 : type === "cloze" ? 3 : 2;
  const list = usable(S.cues, idxs, min);
  for (const i of list.length ? list : idxs) {
    const text = S.cues[i].text;
    if (type === "choice") { const c = makeChoice(text, r, S.pool); if (c) items.push({ cue: i, ...c }); }
    else if (type === "cloze") items.push({ cue: i, ...makeCloze(text, st.clozeLevel, r, prefer) });
    else if (type === "order") items.push({ cue: i, ...makeOrder(text, r), placed: [] });
    else if (type === "spot") { const c = corrupt(text, r, S.pool); if (c) items.push({ cue: i, ...c }); }
    else items.push({ cue: i });
  }
  return items;
}

function startExercise(type, idxs, { lessonId = null, title = "", sprint = false } = {}) {
  stopPlayback();
  const scene = ["gist", "watch", "review"].includes(type);
  const seed = hash(S.movie.id + type + idxs.join(",") + (lessonId == null ? Date.now() : ""));
  let items = scene ? [{ scene: true }] : makeItems(type, idxs, seed);
  if (sprint) items = items.slice(0, 20);
  if (!items.length) return toast("Không có câu phù hợp cho dạng bài này.");
  S.ex = { type, idxs, lessonId, title, items, i: 0, scores: [], answered: false, sprint, t0: Date.now() };
  renderExercise(true);
}

function exitExercise() {
  stopPlayback();
  if (P.video) { P.video.muted = false; }
  P.muteFrom = P.muteTo = null;
  S.ex?.recorder?.stop?.();
  S.ex = null;
  renderPanel();
}

function recordScore(score) {
  const ex = S.ex;
  ex.scores[ex.i] = score;
  ex.answered = true;
  const item = ex.items[ex.i];
  if (item.cue != null && score != null) {
    const mk = S.movie.mistakes || (S.movie.mistakes = {});
    if (score < 0.6) mk[item.cue] = (mk[item.cue] || 0) + 1;
    else if (score >= 0.85 && mk[item.cue]) delete mk[item.cue];
    saveMovie();
  }
}

function finishExercise() {
  const ex = S.ex;
  const vals = ex.scores.filter((s) => s != null);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  ex.done = true;
  ex.avg = avg;
  if (ex.lessonId != null) {
    const p = S.movie.progress[ex.lessonId] || (S.movie.progress[ex.lessonId] = {});
    p[ex.type] = { score: avg, at: Date.now() };
    saveMovie();
  }
  renderExercise();
}

function exHeader() {
  const ex = S.ex, s = STEP_BY_ID[ex.type];
  const n = ex.items.length;
  return `<div class="ex-head">
    <button class="btn ghost small" data-act="exit">✕</button>
    <div class="ex-title"><b>${s.icon} ${s.name}</b><span class="muted small">${esc(ex.title)}</span></div>
    ${n > 1 ? `<span class="ex-count">${Math.min(ex.i + 1, n)}/${n}</span>` : ""}
  </div>
  ${n > 1 ? `<div class="bar thin"><i style="width:${pct((ex.i + (ex.answered ? 1 : 0)) / n)}"></i></div>` : ""}`;
}

const listenBar = () => `<div class="row listen">
  <button class="btn" data-act="exPlay">🔊 Nghe lại</button>
  <button class="btn" data-act="exSlow">🐢 Nghe chậm</button>
  ${S.ex.answered ? `<button class="btn ghost" data-act="exShowVi">Nghĩa tiếng Việt</button>` : ""}</div>`;
const nextBtn = () => `<div class="row end"><button class="btn primary" data-act="exNext" id="exNext">${S.ex.i + 1 < S.ex.items.length ? "Câu tiếp ▶" : "Xem kết quả"}</button></div>`;

function renderExercise(autoplay = false) {
  const ex = S.ex, body = $("#panelBody");
  if (!body) return;
  const item = ex.items[ex.i];
  // Bài nghe: tắt phụ đề trên video để không lộ đáp án.
  P.subOverride = ["watch"].includes(ex.type) ? (S.movie.cues.some((c) => c.vi) ? "envi" : "en") : ex.type === "dub" ? null : "off";
  if (ex.type === "shadow" && ex.answered) P.subOverride = "en";
  P.lastCue = -2;
  if (ex.done) { body.innerHTML = resultHtml(); return; }
  let html = exHeader();
  const c = item.cue != null ? S.cues[item.cue] : null;
  switch (ex.type) {
    case "gist": case "review": html += sceneRateHtml(); break;
    case "watch": html += watchHtml(); break;
    case "choice": html += listenBar() + `<p class="q">Bạn nghe thấy câu nào?</p><div class="options">${item.options.map((o, k) => {
      let cls = "";
      if (ex.answered) cls = k === item.answer ? "right" : k === item.chosen ? "wrong" : "dim";
      return `<button class="opt ${cls}" data-act="choose" data-k="${k}" ${ex.answered ? "disabled" : ""}><span class="key">${k + 1}</span>${esc(o)}</button>`;
    }).join("")}</div>${ex.answered ? feedback(item.chosen === item.answer, c) + nextBtn() : ""}`; break;
    case "cloze": html += listenBar() + `<p class="q">Nghe và điền từ còn thiếu:</p><div class="cloze">${item.tokens.map((t, k) => {
      const bi = item.blanks.indexOf(k);
      if (bi < 0) return esc(t.t);
      const res = item.result?.[bi];
      const w = Math.max(3, t.t.length) + 1;
      return `<input class="blank ${res || ""}" data-b="${bi}" size="${w}" style="width:${w + 1}ch" autocomplete="off" autocapitalize="off" spellcheck="false" ${ex.answered ? "disabled" : ""} value="${esc(item.typed?.[bi] || "")}">${res && res !== "ok" ? `<sup class="fix">${esc(t.t)}</sup>` : ""}`;
    }).join("")}</div>
      ${ex.answered ? feedback(item.score === 1, c, `${item.blanks.filter((_, k) => item.result[k] !== "wrong").length}/${item.blanks.length} ô đúng`) + nextBtn()
        : `<div class="row end"><button class="btn ghost" data-act="clozeHint">Gợi ý chữ đầu</button><button class="btn primary" data-act="clozeCheck">Kiểm tra (Enter)</button></div>`}`; break;
    case "order": {
      const placedSet = new Set(item.placed);
      html += listenBar() + `<p class="q">Bấm các mảnh theo đúng thứ tự câu nghe được:</p>
      <div class="order-answer">${item.placed.map((k, pos) => {
        const cls = ex.answered ? (item.shuffled[k].c === item.answer[pos] ? "right" : "wrong") : "";
        return `<button class="piece ${cls}" data-act="unplace" data-pos="${pos}" ${ex.answered ? "disabled" : ""}>${esc(item.shuffled[k].c)}</button>`;
      }).join("") || `<span class="muted small">…</span>`}</div>
      <div class="order-pool">${item.shuffled.map((p, k) => placedSet.has(k) ? "" : `<button class="piece" data-act="place" data-k="${k}">${esc(p.c)}</button>`).join("")}</div>
      ${ex.answered ? feedback(item.score === 1, c) + nextBtn() : `<div class="row end"><button class="btn ghost" data-act="orderReset">Làm lại</button></div>`}`;
      break;
    }
    case "spot": html += listenBar() + `<p class="q">Phụ đề dưới đây có <b>1 từ sai</b> so với lời thoại. Bấm vào từ đó:</p>
      <div class="spot">${item.tokens.map((t, k) => {
        if (!t.word) return esc(t.t);
        let cls = "";
        if (ex.answered) cls = k === item.index ? "right" : k === item.chosen ? "wrong" : "";
        return `<button class="sw ${cls}" data-act="spotPick" data-k="${k}" ${ex.answered ? "disabled" : ""}>${esc(t.t)}</button>`;
      }).join("")}</div>
      ${ex.answered ? feedback(item.chosen === item.index, c, `Từ đúng: <b>${esc(item.original)}</b> (không phải “${esc(item.wrong)}”)`) + nextBtn() : ""}`; break;
    case "dictation": html += listenBar() + `<p class="q">Nghe và gõ lại cả câu:</p>
      ${item.hint ? `<p class="hint mono">${esc(tokenize(c.text).map((t) => (t.word ? t.t[0] + "·".repeat(t.t.length - 1) : t.t)).join(""))}</p>` : ""}
      <textarea id="dictIn" rows="3" placeholder="Gõ những gì bạn nghe được…" ${ex.answered ? "disabled" : ""} autocapitalize="off" spellcheck="false">${esc(item.typed || "")}</textarea>
      ${ex.answered ? `<div class="diff">${diffHtml(item.diff)}</div>` + feedback(item.diff.score >= 90, c, `Đúng ${item.diff.matched}/${item.diff.total} từ · ${item.diff.score} điểm`) + nextBtn()
        : `<div class="row end"><button class="btn ghost" data-act="dictHint">Gợi ý</button><button class="btn primary" data-act="dictCheck">Kiểm tra (Ctrl+Enter)</button></div>`}`; break;
    case "shadow": html += shadowHtml(item, c); break;
    case "dub": html += dubHtml(item, c); break;
  }
  body.innerHTML = html;
  if (ex.type === "cloze" && !ex.answered) bindCloze();
  if (ex.type === "dictation" && !ex.answered) {
    const ta = $("#dictIn");
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); act.dictCheck(); } });
    ta.addEventListener("input", () => (item.typed = ta.value));
    if (!matchMedia("(pointer:coarse)").matches) ta.focus();
  }
  if (ex.answered) $("#exNext")?.focus({ preventScroll: true });
  if (autoplay && item.cue != null && ["choice", "cloze", "order", "spot", "dictation"].includes(ex.type)) playCue(item.cue);
  if (autoplay && ex.type === "watch") playCues(ex.idxs);
}

function feedback(ok, c, extra = "") {
  return `<div class="fb ${ok ? "good" : "bad"}"><div class="fb-head">${ok ? "✅ Chính xác!" : "❌ Chưa đúng"} ${extra ? `<span>${extra}</span>` : ""}</div>
    <div class="fb-line">${wordsHtml(c.text)}</div>${S.ex.showVi && c.vi ? `<div class="fb-vi">${esc(c.vi)}</div>` : ""}</div>`;
}
const diffHtml = (d) => d.words.map((w) => `<span class="${w.ok ? "d-ok" : "d-miss"}">${esc(w.word)}</span>`).join(" ") +
  (d.extra.length ? ` <span class="d-extra">${d.extra.map(esc).join(" ")}</span>` : "");

function sceneRateHtml() {
  const ex = S.ex, l = S.lessons[ex.lessonId];
  const before = ex.type === "review" && l ? S.movie.progress[l.id]?.gist : null;
  const rated = ex.scores[0];
  return `<p>${ex.type === "gist" ? "Xem cả cảnh <b>không phụ đề</b>. Đừng cố hiểu từng từ — chú ý bối cảnh, nét mặt, giọng điệu và đoán ý chính." : "Xem lại cả cảnh <b>không phụ đề</b> sau khi đã luyện kỹ. Bạn sẽ thấy mình nghe được nhiều hơn hẳn!"}</p>
    <div class="row"><button class="btn primary" data-act="playScene">▶ Phát cả cảnh</button><button class="btn ghost" data-act="stop">⏹ Dừng</button></div>
    <textarea id="gistNote" rows="2" placeholder="(Tuỳ chọn) Ghi lại ý chính bạn hiểu được…">${esc(S.movie.notes?.[ex.lessonId]?.[ex.type] || "")}</textarea>
    <p class="q">Bạn hiểu được khoảng bao nhiêu?</p>
    <div class="row wrap">${[0, 25, 50, 75, 100].map((v) => `<button class="btn rate ${rated === v / 100 ? "on" : ""}" data-act="rate" data-v="${v}">${v}%</button>`).join("")}</div>
    ${before ? `<p class="muted">Lần đầu (bước 1) bạn hiểu khoảng <b>${pct(before.score)}</b>.${rated != null ? ` Bây giờ: <b>${pct(rated)}</b> ${rated > before.score ? "— tiến bộ rõ rệt! 🎉" : ""}` : ""}</p>` : ""}
    ${rated != null ? `<div class="row end"><button class="btn primary" data-act="exNext" id="exNext">Hoàn thành ✓</button></div>` : ""}`;
}

function watchHtml() {
  return `<p>Xem cảnh với phụ đề. <b>Bấm vào từ lạ</b> (trên video hoặc bên dưới) để tra nghĩa và lưu vào sổ từ. Có thể bật "Tự dừng sau mỗi câu" ⏸︎¹ để đọc kịp.</p>
    <div class="row"><button class="btn primary" data-act="playScene">▶ Phát cả cảnh</button><button class="btn ghost" data-act="stop">⏹ Dừng</button></div>
    <div class="transcript mini" id="transcript">${S.ex.idxs.map((i) => `<div class="tx-row" data-cue="${i}">
      <button class="tx-time" data-act="playLine" data-i="${i}">▶</button>
      <div class="tx-text"><div>${wordsHtml(S.cues[i].text)}</div>${S.cues[i].vi ? `<div class="tx-vi">${esc(S.cues[i].vi)}</div>` : ""}</div></div>`).join("")}</div>
    <div class="row end"><button class="btn primary" data-act="watchDone" id="exNext">Đã hiểu hết cảnh này ✓</button></div>`;
}

function shadowHtml(item, c) {
  const rec = canRecognize();
  return `<p>Nghe câu mẫu, rồi <b>nói lại giống hệt</b> — cả trọng âm, nối âm và ngữ điệu. Lặp lại đến khi thấy tự nhiên.</p>
    <div class="say">${item.showText || S.ex.answered ? wordsHtml(c.text) : `<span class="muted">(Thử nói khi chưa nhìn chữ — hoặc </span><button class="link" data-act="showText">hiện câu</button><span class="muted">)</span>`}</div>
    <div class="row wrap">
      <button class="btn" data-act="exPlay">🔊 Nghe mẫu</button>
      <button class="btn" data-act="exSlow">🐢 Chậm</button>
      <button class="btn ${item.recording ? "danger" : "primary"}" data-act="shadowRec">${item.recording ? "⏹ Dừng ghi" : "🎙 Ghi âm giọng bạn"}</button>
      ${item.audio ? `<button class="btn" data-act="playMine">▶ Giọng bạn</button><button class="btn" data-act="compare">⇄ Mẫu rồi bạn</button>` : ""}
    </div>
    ${item.recognized != null ? `<div class="fb ${item.diff.score >= 80 ? "good" : "bad"}"><div class="fb-head">Máy nghe được: <span>${item.diff.score} điểm</span></div><div class="diff">${diffHtml(item.diff)}</div><div class="muted small">“${esc(item.recognized || "…")}”</div></div>` : ""}
    ${item.audio && (!rec || item.recognized != null) ? `<p class="q">Bạn tự thấy giống mẫu chưa?</p><div class="row">
      ${[["0.4", "Chưa giống"], ["0.7", "Gần giống"], ["1", "Rất giống"]].map(([v, l]) => `<button class="btn rate" data-act="selfRate" data-v="${v}">${l}</button>`).join("")}</div>` : ""}
    ${!rec ? `<p class="muted small">Trình duyệt này không có nhận dạng giọng nói — hãy tự so sánh bằng tai (Chrome/Edge có chấm điểm tự động).</p>` : ""}
    ${S.ex.answered ? nextBtn() : `<div class="row end"><button class="btn ghost" data-act="skipItem">Bỏ qua câu này</button></div>`}`;
}

function dubHtml(item, c) {
  return `<p>Video sẽ phát 2 giây trước câu thoại, rồi <b>tắt tiếng nhân vật</b> — bạn nói thay vào cho khớp miệng. App ghi âm và chấm.</p>
    <div class="say big">${wordsHtml(c.text)}</div>${c.vi ? `<div class="tx-vi">${esc(c.vi)}</div>` : ""}
    <div class="row wrap">
      <button class="btn" data-act="exPlay">🔊 Nghe bản gốc</button>
      <button class="btn primary" data-act="dubGo" ${item.recording ? "disabled" : ""}>${item.recording ? "🎙 Đang lồng tiếng…" : "🎬 Bắt đầu lồng tiếng"}</button>
      ${item.audio ? `<button class="btn" data-act="dubPlayback">▶ Xem bản lồng tiếng của bạn</button>` : ""}
    </div>
    <div class="bar thin dubbar"><i id="dubProg" style="width:0"></i></div>
    ${item.recognized != null ? `<div class="fb ${item.diff.score >= 75 ? "good" : "bad"}"><div class="fb-head">Độ khớp lời: <span>${item.diff.score} điểm</span></div><div class="diff">${diffHtml(item.diff)}</div></div>` : ""}
    ${item.audio && !canRecognize() ? `<div class="row">${[["0.4", "Chưa khớp"], ["0.7", "Khá khớp"], ["1", "Rất khớp"]].map(([v, l]) => `<button class="btn rate" data-act="selfRate" data-v="${v}">${l}</button>`).join("")}</div>` : ""}
    ${S.ex.answered ? nextBtn() : `<div class="row end"><button class="btn ghost" data-act="skipItem">Bỏ qua câu này</button></div>`}`;
}

function bindCloze() {
  const inputs = [...document.querySelectorAll(".cloze .blank")];
  const item = S.ex.items[S.ex.i];
  inputs.forEach((inp, k) => {
    inp.addEventListener("input", () => { (item.typed ||= [])[+inp.dataset.b] = inp.value; });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); if (k + 1 < inputs.length && !e.ctrlKey) inputs[k + 1].focus(); else act.clozeCheck(); }
    });
  });
  if (!matchMedia("(pointer:coarse)").matches) inputs[0]?.focus({ preventScroll: true });
}

function resultHtml() {
  const ex = S.ex;
  const stars = ex.avg >= 0.9 ? "⭐⭐⭐" : ex.avg >= 0.7 ? "⭐⭐" : ex.avg >= 0.4 ? "⭐" : "";
  const l = ex.lessonId != null ? S.lessons[ex.lessonId] : null;
  const next = l ? nextStep(l) : null;
  const secs = Math.round((Date.now() - ex.t0) / 1000);
  const msg = ex.avg >= 0.9 ? "Xuất sắc!" : ex.avg >= 0.7 ? "Tốt lắm!" : ex.avg >= 0.4 ? "Khá rồi, luyện thêm chút nữa nhé." : "Đừng nản — nghe lại vài lần rồi thử tiếp!";
  const wrong = ex.items.map((it, k) => (ex.scores[k] != null && ex.scores[k] < 0.6 && it.cue != null ? it.cue : null)).filter((x) => x != null);
  return `${exHeader()}<div class="result">
    <div class="big-score">${pct(ex.avg)}</div><div class="stars">${stars}</div><p>${msg}${ex.sprint ? ` · ${secs} giây` : ""}</p>
    ${wrong.length ? `<div class="wrong-list"><p class="muted small">Câu cần nghe lại:</p>${wrong.map((i) => `<div class="tx-row"><button class="tx-time" data-act="playLine" data-i="${i}">▶</button><div class="tx-text">${wordsHtml(S.cues[i].text)}</div></div>`).join("")}</div>` : ""}
    <div class="row center wrap">
      <button class="btn" data-act="redo">↻ Làm lại</button>
      ${next ? `<button class="btn primary" data-act="step" data-lesson="${l.id}" data-step="${next.id}">Bước tiếp: ${next.icon} ${next.name} ▶</button>`
        : l && S.lessons[l.id + 1] ? `<button class="btn primary" data-act="step" data-lesson="${l.id + 1}" data-step="gist">Sang ${S.lessons[l.id + 1].title} ▶</button>` : ""}
      <button class="btn ghost" data-act="exit">Về ${l ? "lộ trình" : "luyện tập"}</button>
    </div></div>`;
}

// ---------- Ghi âm (shadowing, lồng tiếng) ----------
async function beginCapture(item) {
  try {
    item.rec = await startRecording();
  } catch {
    toast("Không dùng được micro. Hãy cho phép trình duyệt truy cập micro.", 5000);
    return false;
  }
  item.sr = recognize();
  item.recording = true;
  return true;
}
async function endCapture(item, c) {
  item.recording = false;
  const [blob, text] = await Promise.all([item.rec.stop(), item.sr ? item.sr.stop() : Promise.resolve(null)]);
  if (item.audio) URL.revokeObjectURL(item.audio);
  item.audio = URL.createObjectURL(blob);
  if (text != null) {
    item.recognized = text;
    item.diff = diffWords(c.text, text);
    recordScore(item.diff.score / 100);
  }
}
function playAudio(url) {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.onended = a.onerror = () => resolve();
    a.play().catch(resolve);
  });
}

// ======================= Sổ từ =======================
async function loadVocab() {
  S.vocab = await db.getVocab();
  S.vocabSet = new Set(S.vocab.map((v) => v.word));
  const due = S.vocab.filter((v) => isDue(v)).length;
  const b = $("#dueBadge");
  b.hidden = !due;
  b.textContent = due;
  return S.vocab;
}

async function saveWord(word, cueIdx, meaning = "", extra = {}) {
  const c = S.cues[cueIdx] || {};
  const item = {
    id: word, word, meaning, sentence: c.text || "", sentenceVi: c.vi || "", movieId: S.movie?.id || "", movieTitle: S.movie?.title || "",
    start: c.start ?? null, end: c.end ?? null, added: Date.now(), box: 0, due: Date.now(), ...extra,
  };
  const old = S.vocab.find((v) => v.id === word);
  await db.putVocab(old ? { ...old, meaning: meaning || old.meaning } : item);
  await loadVocab();
  document.querySelectorAll(`.w[data-w="${CSS.escape(word)}"]`).forEach((e) => e.classList.add("saved"));
}

async function renderVocab(mode = S.vocabMode || "review") {
  S.view = "vocab";
  S.vocabMode = mode;
  stopPlayback();
  const list = await loadVocab();
  const due = list.filter((v) => isDue(v));
  let body = "";
  if (mode === "review") {
    const card = due[0];
    S.card = card;
    body = !card ? `<div class="empty"><div class="big">🎉</div><p>Không còn từ nào cần ôn lúc này.${list.length ? "" : " Hãy lưu từ mới khi xem phim (bấm vào từ trên phụ đề)."}</p></div>`
      : `<div class="flash" id="flash">
        <div class="muted small">${esc(card.movieTitle)} · còn ${due.length} thẻ</div>
        <div class="flash-sent">${esc(card.sentence).replace(new RegExp(`\\b(${card.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "ig"), (m) => (S.flipped ? `<mark>${m}</mark>` : `<span class="blank-word">${"_".repeat(m.length)}</span>`))}</div>
        <div class="row center"><button class="btn" data-act="cardPlay">🔊 Nghe câu</button></div>
        ${S.flipped ? `<div class="flash-ans"><div class="fw">${esc(card.word)} <span class="muted">${esc(card.phonetic || "")}</span> <button class="ic sm" data-act="say" data-text="${esc(card.word)}">🔊</button></div>
          <div class="fm">${esc(card.meaning || "(chưa có nghĩa — sửa trong Danh sách)")}</div>${card.sentenceVi ? `<div class="muted small">${esc(card.sentenceVi)}</div>` : ""}</div>
          <div class="row center"><button class="btn danger" data-act="grade" data-ok="0">Quên rồi</button><button class="btn primary" data-act="grade" data-ok="1">Nhớ ✓</button></div>`
        : `<p class="muted center">Từ nào bị che? Nhớ nghĩa của nó không?</p><div class="row center"><button class="btn primary" data-act="flip">Hiện đáp án</button></div>`}
      </div>`;
  } else {
    body = list.length ? `<div class="row end wrap"><button class="btn small" data-act="exportCsv">⤓ Xuất CSV (nhập vào Anki/Quizlet)</button></div>
      <table class="vtable"><thead><tr><th>Từ</th><th>Nghĩa</th><th>Câu trong phim</th><th>Hộp</th><th></th></tr></thead><tbody>
      ${list.sort((a, b) => b.added - a.added).map((v) => `<tr><td><b class="w" data-w="${esc(v.word)}">${esc(v.word)}</b></td>
        <td><input class="meaning" data-id="${esc(v.id)}" value="${esc(v.meaning || "")}" placeholder="nghĩa…"></td>
        <td class="small">${esc(v.sentence)}<div class="muted">${esc(v.movieTitle)}</div></td><td>${v.box || 0}</td>
        <td><button class="ic sm" data-act="delWord" data-id="${esc(v.id)}">🗑</button></td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">Sổ từ trống. Khi xem phim, bấm vào một từ trên phụ đề → "Lưu vào sổ từ".</p>`;
  }
  $("#view").innerHTML = `<section class="vocab">
    <h2>Sổ từ vựng</h2>
    <div class="tabs"><button class="tab ${mode === "review" ? "on" : ""}" data-act="vmode" data-m="review">Ôn tập (${due.length})</button>
    <button class="tab ${mode === "list" ? "on" : ""}" data-act="vmode" data-m="list">Danh sách (${list.length})</button></div>
    ${body}
    <video id="cardVideo" hidden playsinline></video></section>`;
  document.querySelectorAll(".meaning").forEach((inp) => inp.addEventListener("change", async () => {
    const v = S.vocab.find((x) => x.id === inp.dataset.id);
    if (v) { v.meaning = inp.value; await db.putVocab(v); }
  }));
}

async function playCardSentence(card) {
  const blob = card.movieId && card.start != null ? await db.getVideo(card.movieId) : null;
  const movie = blob && (await db.getMovie(card.movieId));
  if (!blob) return speak(card.sentence);
  const v = $("#cardVideo");
  if (v._url) URL.revokeObjectURL(v._url);
  v._url = URL.createObjectURL(blob);
  v.src = v._url;
  v.hidden = false;
  const off = movie?.settings.offset || 0;
  v.currentTime = card.start + off - 0.1;
  await v.play().catch(() => speak(card.sentence));
  const stop = () => { if (v.currentTime >= card.end + off + 0.2) { v.pause(); v.removeEventListener("timeupdate", stop); } };
  v.addEventListener("timeupdate", stop);
}

// ======================= Phương pháp =======================
function renderMethod() {
  S.view = "method";
  stopPlayback();
  $("#view").innerHTML = `<section class="method">
    <h2>Học tiếng Anh qua phim thế nào cho hiệu quả?</h2>
    <p>App áp dụng các kỹ thuật đã được giáo viên và người tự học kiểm chứng: <b>xem có chủ đích</b> (active viewing) chứ không chỉ xem giải trí. Mỗi cảnh ngắn được khai thác qua ${STEPS.length} bước:</p>
    <ol class="steps-doc">${STEPS.map((s) => `<li><b>${s.icon} ${s.name}</b> — ${s.desc}</li>`).join("")}</ol>
    <h3>Các dạng bài trong app</h3>
    <ul>
      <li><b>Nghe có sub / tắt sub / sub Anh–Việt / sub ẩn từ mới</b>: chuyển chế độ phụ đề bất cứ lúc nào; chế độ "ẩn từ mới" buộc bạn nghe các từ khó.</li>
      <li><b>Nghe điền từ (gap-fill)</b>: 3 mức khó, ưu tiên đục lỗ từ mới và từ bạn đã lưu.</li>
      <li><b>Chép chính tả (dictation)</b>: gõ cả câu, app so từng từ, chỉ ra từ thiếu/thừa.</li>
      <li><b>Nghe chọn câu đúng</b>: 4 câu chỉ khác nhau 1 từ dễ nghe nhầm (can/can't, live/leave, thirteen/thirty…).</li>
      <li><b>Tìm từ sai</b>: luyện nghe chi tiết như bài "spot the mistake".</li>
      <li><b>Sắp xếp từ</b>: luyện trật tự từ và cấu trúc câu khẩu ngữ.</li>
      <li><b>Shadowing</b>: nói đuổi theo nhân vật, ghi âm, so với giọng gốc, máy chấm độ chính xác.</li>
      <li><b>Lồng tiếng (dubbing)</b>: tắt tiếng nhân vật, bạn nói thay cho khớp thời gian — luyện tốc độ và ngữ điệu tự nhiên.</li>
      <li><b>Thử thách nghe nhanh</b>, <b>luyện lại câu sai</b>, <b>lặp câu / tự dừng sau mỗi câu / giảm tốc độ</b>.</li>
      <li><b>Sổ từ ôn ngắt quãng</b>: mỗi từ đi kèm câu thoại gốc trong phim (nghe lại được), ôn theo lịch 1–2–4–8–16… ngày.</li>
    </ul>
    <h3>Mẹo chọn phim & thói quen</h3>
    <ul>
      <li>Chọn đoạn <b>3–10 phút</b> bạn thích; phim đời thường, sitcom (Friends, Modern Family), hoạt hình Pixar dễ hơn phim hành động.</li>
      <li>Xem "tab Từ vựng": tốc độ nói dưới ~140 từ/phút và ít từ lạ là vừa sức.</li>
      <li>Học <b>một cảnh mỗi ngày</b> đều đặn hiệu quả hơn xem cả bộ phim một lần. Quy tắc 3 lần xem: không sub → sub Anh → không sub.</li>
      <li>Ưu tiên phụ đề <b>tiếng Anh</b>; phụ đề tiếng Việt chỉ để kiểm tra ý khi bí.</li>
      <li>Phim có sub cứng: bật "▬ Che sub cứng" và kéo dải che khớp vị trí chữ trên hình.</li>
    </ul>
    <h3>Phím tắt</h3>
    <p class="mono small">Space: phát/dừng · ← →: câu trước/sau · R: nghe lại câu · S: đổi chế độ sub · 1–4: chọn đáp án</p>
  </section>`;
}

// ======================= Từ điển nổi =======================
async function showDict(el) {
  const word = el.dataset.w;
  if (!word) return;
  const cueEl = el.closest("[data-cue]");
  let cueIdx = cueEl ? +cueEl.dataset.cue : el.dataset.cue != null ? +el.dataset.cue : -1;
  if (cueIdx < 0 && S.ex?.items[S.ex.i]?.cue != null) cueIdx = S.ex.items[S.ex.i].cue;
  if (cueIdx < 0 && P.video && S.view === "movie") cueIdx = currentCue();
  const fromVideo = el.closest("#subs");
  if (fromVideo) P.video.pause();
  if (el.classList.contains("gap")) { el.classList.remove("gap"); el.textContent = S.cues[cueIdx]?.text ? tokenize(S.cues[cueIdx].text).find((t) => t.n === word)?.t || word : word; return; }
  const pop = $("#pop");
  const saved = S.vocab.find((v) => v.id === word);
  pop.innerHTML = `<div class="pop-head"><b>${esc(word)}</b> <span id="popPh" class="muted"></span>
    <button class="ic sm" data-act="say" data-text="${esc(word)}">🔊</button><span class="grow"></span><button class="ic sm" data-act="closePop">✕</button></div>
    <div id="popVi" class="pop-vi">${saved?.meaning ? esc(saved.meaning) : "…"}</div>
    <div id="popDef" class="pop-def muted small">Đang tra từ điển…</div>
    ${S.view === "movie" && cueIdx >= 0 ? `<div class="row"><button class="btn small primary" data-act="saveWord" data-w="${esc(word)}" data-i="${cueIdx}">${saved ? "✓ Đã lưu — cập nhật" : "＋ Lưu vào sổ từ"}</button>
      <button class="btn small ghost" data-act="transSent" data-i="${cueIdx}">Dịch cả câu</button></div><div id="popSent" class="small"></div>` : ""}`;
  pop.hidden = false;
  const r = el.getBoundingClientRect();
  const w = Math.min(340, innerWidth - 16);
  pop.style.width = w + "px";
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  const below = r.bottom + 8 + 220 < innerHeight;
  pop.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - 8 - pop.offsetHeight)) + "px";
  const [d, vi] = await Promise.all([lookup(word), saved?.meaning ? Promise.resolve(saved.meaning) : translate(word)]);
  if (pop.hidden) return;
  pop.dataset.phonetic = d?.phonetic || "";
  if ($("#popPh")) $("#popPh").textContent = d?.phonetic || "";
  if ($("#popVi")) $("#popVi").textContent = vi || (navigator.onLine ? "(chưa có bản dịch)" : "(offline — không dịch được)");
  if ($("#popDef")) $("#popDef").innerHTML = d ? (d.senses.length ? d.senses.map((s) => `<div><i>${esc(s.pos)}</i> ${esc(s.def)}${s.ex ? `<div class="ex">“${esc(s.ex)}”</div>` : ""}</div>`).join("") : "Không có trong từ điển (có thể là tên riêng / tiếng lóng).") : "Không tra được (cần kết nối mạng).";
  if (d?.audio) pop.dataset.audio = d.audio; else delete pop.dataset.audio;
}

// ======================= Hành động (bấm nút) =======================
const act = {
  go: (el) => { stopPlayback(); S.ex = null; const v = el.dataset.view; v === "home" ? renderHome() : v === "vocab" ? renderVocab() : renderMethod(); },
  pick: () => $("#pickFiles").click(),
  pickSub: () => $("#pickSub").click(),
  pickVideo: () => $("#pickVideo").click(),
  open: (el) => openMovie(el.dataset.id),
  closeModal,
  closePop: () => ($("#pop").hidden = true),
  export: async () => download(`hoc-qua-phim-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await db.exportAll()), "application/json"),
  import: () => $("#pickBackup").click(),
  pendingSub: () => { closeModal(); S.pendingSubPick = true; $("#pickSub").click(); },
  pendingAi: () => { const model = $("#aiModel").value; const { video, vi } = S.pending; aiSubtitles(video, vi, model); },
  tab: (el) => { S.tab = el.dataset.tab; S.ex = null; document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === el)); renderPanel(); },
  toggle: () => { const v = P.video; if (!S.videoUrl) return toast("Chưa có file video."); v.paused ? playFree() : v.pause(); },
  prevCue: () => gotoCue(currentCue() - (P.video && P.video.currentTime - cueStart(currentCue()) > 1.5 ? 0 : 1)),
  nextCue: () => gotoCue(currentCue() + 1),
  replayCue: () => { const i = currentCue(); P.pausedCue = -1; S.ex ? playCue(i) : gotoCue(i); },
  autoPause: () => { P.autoPause = !P.autoPause; renderControlsState(); toast(P.autoPause ? "Tự dừng sau mỗi câu: BẬT" : "Tự dừng sau mỗi câu: TẮT"); },
  mask: () => { const mk = S.movie.settings.mask; mk.on = !mk.on; applyMask(); saveMovie(); renderControlsState(); if (S.tab === "settings" && !S.ex) renderPanel(); toast(mk.on ? "Đã bật dải che sub cứng — chỉnh vị trí trong Cài đặt." : "Đã tắt dải che."); },
  fullscreen: () => { const w = $("#wrap"); document.fullscreenElement ? document.exitFullscreen() : (w.requestFullscreen || w.webkitRequestFullscreen)?.call(w); },
  seekCue: (el) => gotoCue(+el.dataset.i),
  playLine: (el) => { P.pausedCue = -1; playCue(+el.dataset.i); },
  loopLine: (el) => { const i = +el.dataset.i; P.loopCue = P.loopCue === i ? -1 : i; document.querySelectorAll('[data-act="loopLine"]').forEach((b) => b.classList.toggle("on", +b.dataset.i === P.loopCue)); if (P.loopCue >= 0) gotoCue(i); },
  txVi: (el) => { S.txVi = el.checked; renderPanel(); },
  say: (el) => { const pop = $("#pop"); if (pop.dataset.audio && el.closest("#pop")) new Audio(pop.dataset.audio).play().catch(() => speak(el.dataset.text)); else speak(el.dataset.text); },
  saveWord: async (el) => {
    const vi = $("#popVi")?.textContent;
    await saveWord(el.dataset.w, +el.dataset.i, vi && !vi.startsWith("(") && vi !== "…" ? vi : "", { phonetic: $("#pop").dataset.phonetic || "" });
    $("#pop").hidden = true;
    toast(`Đã lưu “${el.dataset.w}” vào sổ từ.`);
  },
  quickSave: async (el) => { await saveWord(el.dataset.w, +el.dataset.i, (await translate(el.dataset.w)) || ""); toast(`Đã lưu “${el.dataset.w}”.`); if (!S.ex && S.tab === "words") renderPanel(); },
  transSent: async (el) => { const c = S.cues[+el.dataset.i]; const box = $("#popSent"); box.textContent = c.vi || "Đang dịch…"; if (!c.vi) box.textContent = (await translate(c.text)) || "Không dịch được (cần mạng)."; },
  offset: (el) => { const st = S.movie.settings; st.offset = Math.round((st.offset + +el.dataset.d) * 10) / 10; $("#offsetVal").textContent = (st.offset >= 0 ? "+" : "") + st.offset.toFixed(1) + "s"; P.lastCue = -2; saveMovie(); },
  exportSrt: () => download(S.movie.title + ".srt", toSrt(S.cues.map((c) => ({ ...c, start: c.start + offset(), end: c.end + offset() }))), "text/plain"),
  deleteMovie: async () => { if (!confirm("Xoá phim này cùng tiến độ học? (Sổ từ vẫn giữ nguyên)")) return; stopPlayback(); await db.deleteMovie(S.movie.id); S.movie = null; renderHome(); },

  // Lộ trình / luyện tập
  step: (el) => {
    const l = S.lessons[+el.dataset.lesson];
    startExercise(el.dataset.step, l.cues, { lessonId: l.id, title: `${l.title} · ${formatTime(l.start)}–${formatTime(l.end)}` });
  },
  chip: (el) => { el.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === el)); },
  startPractice: () => {
    const type = $("#pType .chip.on").dataset.v, src = $("#pSource").value;
    let idxs, title;
    if (src === "random") { idxs = shuffle(rng(Date.now()), usable(S.cues, S.cues.map((_, i) => i), 4)).slice(0, 10).sort((a, b) => a - b); title = "10 câu ngẫu nhiên"; }
    else if (src === "mistakes") { idxs = Object.keys(S.movie.mistakes).map(Number).sort((a, b) => a - b).slice(0, 20); title = "Luyện lại câu sai"; }
    else { const l = S.lessons[+src.slice(1)]; idxs = l.cues; title = l.title; }
    startExercise(type, idxs, { title });
  },
  startSprint: () => startExercise("choice", shuffle(rng(Date.now()), usable(S.cues, S.cues.map((_, i) => i), 4)).slice(0, 25), { title: "Thử thách nghe nhanh", sprint: true }),
  exit: exitExercise,
  redo: () => { const ex = S.ex; startExercise(ex.type, ex.idxs, { lessonId: ex.lessonId, title: ex.title, sprint: ex.sprint }); },
  exNext: () => {
    const ex = S.ex;
    if (ex.items[ex.i].scene && ex.scores[0] == null) return;
    if (ex.type === "gist" || ex.type === "review") {
      const note = $("#gistNote")?.value;
      if (note && ex.lessonId != null) { const n = S.movie.notes || (S.movie.notes = {}); (n[ex.lessonId] ||= {})[ex.type] = note; }
    }
    stopPlayback();
    if (ex.i + 1 >= ex.items.length) return finishExercise();
    ex.i++;
    ex.answered = false;
    ex.showVi = false;
    renderExercise(true);
  },
  exPlay: () => { const it = S.ex.items[S.ex.i]; if (it.cue != null) playCue(it.cue); },
  exSlow: () => { const it = S.ex.items[S.ex.i]; if (it.cue != null) playCue(it.cue, 0.7); },
  exShowVi: async () => {
    const it = S.ex.items[S.ex.i], c = S.cues[it.cue];
    S.ex.showVi = true;
    if (!c.vi) { toast("Đang dịch…"); const t = await translate(c.text); c.vi = t || ""; if (!t) toast("Không dịch được (cần mạng)."); }
    renderExercise();
  },
  playScene: () => playCues(S.ex.idxs),
  stop: () => stopPlayback(),
  rate: (el) => { recordScore(+el.dataset.v / 100); renderExercise(); },
  watchDone: () => { recordScore(1); act.exNext(); },
  choose: (el) => { const it = S.ex.items[S.ex.i]; it.chosen = +el.dataset.k; recordScore(it.chosen === it.answer ? 1 : 0); renderExercise(); },
  clozeHint: () => {
    const it = S.ex.items[S.ex.i];
    it.hinted = true;
    document.querySelectorAll(".cloze .blank").forEach((inp) => { if (!inp.value) { const t = it.tokens[it.blanks[+inp.dataset.b]].t; inp.value = t[0]; (it.typed ||= [])[+inp.dataset.b] = t[0]; } });
  },
  clozeCheck: () => {
    const it = S.ex.items[S.ex.i];
    it.typed = [...document.querySelectorAll(".cloze .blank")].map((i) => i.value);
    it.result = it.blanks.map((ti, k) => checkWord(it.tokens[ti].t, it.typed[k] || ""));
    const ok = it.result.filter((r) => r !== "wrong").length;
    it.score = ok / it.blanks.length;
    recordScore(it.score * (it.hinted ? 0.8 : 1));
    if (it.result.some((r) => r !== "ok")) playCue(it.cue);
    renderExercise();
  },
  place: (el) => {
    const it = S.ex.items[S.ex.i];
    it.placed.push(+el.dataset.k);
    if (it.placed.length === it.shuffled.length) {
      const right = it.placed.filter((k, pos) => it.shuffled[k].c === it.answer[pos]).length;
      it.score = right === it.answer.length ? 1 : right / it.answer.length / 2;
      recordScore(it.score);
      if (it.score < 1) playCue(it.cue);
    }
    renderExercise();
  },
  unplace: (el) => { const it = S.ex.items[S.ex.i]; it.placed.splice(+el.dataset.pos, 1); renderExercise(); },
  orderReset: () => { S.ex.items[S.ex.i].placed = []; renderExercise(); },
  spotPick: (el) => { const it = S.ex.items[S.ex.i]; it.chosen = +el.dataset.k; recordScore(it.chosen === it.index ? 1 : 0); playCue(it.cue); renderExercise(); },
  dictHint: () => { S.ex.items[S.ex.i].hint = true; renderExercise(); },
  dictCheck: () => {
    const it = S.ex.items[S.ex.i];
    it.typed = $("#dictIn").value;
    if (!it.typed.trim()) return toast("Hãy gõ những gì bạn nghe được.");
    it.diff = diffWords(S.cues[it.cue].text, it.typed);
    recordScore((it.diff.score / 100) * (it.hint ? 0.8 : 1));
    renderExercise();
  },
  showText: () => { S.ex.items[S.ex.i].showText = true; renderExercise(); },
  shadowRec: async () => {
    const it = S.ex.items[S.ex.i], c = S.cues[it.cue];
    if (it.recording) { await endCapture(it, c); renderExercise(); return; }
    stopPlayback();
    if (!(await beginCapture(it))) return;
    renderExercise();
    // Tự dừng nếu người học quên bấm dừng.
    const maxMs = (c.end - c.start) * 2500 + 4000;
    const rec = it.rec;
    setTimeout(async () => { if (it.recording && it.rec === rec && S.ex?.items[S.ex.i] === it) { await endCapture(it, c); renderExercise(); } }, maxMs);
  },
  playMine: () => { const it = S.ex.items[S.ex.i]; playAudio(it.audio); },
  compare: async () => { const it = S.ex.items[S.ex.i]; if (S.videoUrl) await playCue(it.cue); else { speak(S.cues[it.cue].text); await sleep(400 + 380 * words(S.cues[it.cue].text).length); } await sleep(300); await playAudio(it.audio); },
  selfRate: (el) => { const it = S.ex.items[S.ex.i]; const v = +el.dataset.v; recordScore(it.diff ? Math.max(v, it.diff.score / 100) : v); renderExercise(); },
  skipItem: () => { recordScore(null); S.ex.answered = true; act.exNext(); },
  dubGo: async () => {
    const it = S.ex.items[S.ex.i], c = S.cues[it.cue];
    if (!S.videoUrl) return toast("Lồng tiếng cần file video. Hãy chọn lại video trong Cài đặt.");
    const a = cueStart(it.cue), b = cueEnd(it.cue);
    if (!(await beginCapture(it))) return;
    renderExercise();
    P.muteFrom = a - 0.05;
    P.muteTo = b + 0.3;
    const prog = () => { const bar = $("#dubProg"); if (!bar || !it.recording) return; const t = P.video.currentTime; bar.style.width = pct(Math.max(0, Math.min(1, (t - a) / (b - a)))); requestAnimationFrame(prog); };
    requestAnimationFrame(prog);
    await playRange(Math.max(0, a - 2), b + 0.6);
    await sleep(300);
    P.muteFrom = P.muteTo = null;
    P.video.muted = false;
    if (it.recording) await endCapture(it, c);
    renderExercise();
  },
  dubPlayback: async () => {
    const it = S.ex.items[S.ex.i];
    const a = cueStart(it.cue), b = cueEnd(it.cue);
    P.muteFrom = a - 2.1;
    P.muteTo = b + 0.7;
    const audio = new Audio(it.audio);
    // Bản ghi bắt đầu từ lúc video lùi 2 giây trước câu thoại → phát đồng thời từ cùng mốc.
    const done = playRange(Math.max(0, a - 2), b + 0.6);
    audio.play().catch(() => {});
    await done;
    audio.pause();
    P.muteFrom = P.muteTo = null;
    P.video.muted = false;
  },

  // Sổ từ
  vmode: (el) => { S.flipped = false; renderVocab(el.dataset.m); },
  flip: () => { S.flipped = true; renderVocab("review"); },
  cardPlay: () => playCardSentence(S.card),
  grade: async (el) => { await db.putVocab(review(S.card, el.dataset.ok === "1")); S.flipped = false; renderVocab("review"); },
  delWord: async (el) => { if (!confirm("Xoá từ này khỏi sổ?")) return; await db.deleteVocab(el.dataset.id); renderVocab("list"); },
  exportCsv: () => {
    const q = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
    download("so-tu-hoc-qua-phim.csv", "﻿" + S.vocab.map((v) => [v.word, v.meaning, v.phonetic, v.sentence, v.sentenceVi, v.movieTitle].map(q).join(",")).join("\n"), "text/csv");
  },
};

function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

document.addEventListener("click", (e) => {
  const w = e.target.closest(".w[data-w]");
  if (w && !e.target.closest("[data-act]")) { e.preventDefault(); showDict(w); return; }
  const a = e.target.closest("[data-act]");
  if (a && act[a.dataset.act]) {
    if (a.tagName === "A") e.preventDefault();
    if (!a.closest("#pop") || a.dataset.act === "closePop") { if (a.dataset.act !== "say") $("#pop").hidden = true; }
    act[a.dataset.act](a, e);
    return;
  }
  if (!e.target.closest("#pop")) $("#pop").hidden = true;
  if (e.target.id === "modal") closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape") { $("#pop").hidden = true; return; }
  if (S.view !== "movie") return;
  const ex = S.ex;
  if (ex && !ex.done && ex.type === "choice" && !ex.answered && /^[1-4]$/.test(e.key)) {
    const b = document.querySelector(`.opt[data-k="${+e.key - 1}"]`);
    if (b) { act.choose(b); return; }
  }
  if (ex?.answered && e.key === "Enter") { act.exNext(); e.preventDefault(); return; }
  if (e.key === " ") { e.preventDefault(); ex && ex.items[ex.i]?.cue != null ? act.exPlay() : act.toggle(); }
  else if (e.key === "ArrowLeft") act.prevCue();
  else if (e.key === "ArrowRight") act.nextCue();
  else if (e.key.toLowerCase() === "r") ex && ex.items[ex.i]?.cue != null ? act.exPlay() : act.replayCue();
  else if (e.key.toLowerCase() === "s" && !ex) {
    const modes = ["en", "envi", "vi", "gap", "off"];
    const st = S.movie.settings;
    st.subMode = modes[(modes.indexOf(st.subMode) + 1) % modes.length];
    $("#subMode").value = st.subMode;
    P.lastCue = -2;
    saveMovie();
  }
});

$("#pickFiles").addEventListener("change", (e) => { importFiles([...e.target.files]); e.target.value = ""; });
$("#pickSub").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  if (S.pendingSubPick && S.pending) {
    S.pendingSubPick = false;
    const { video } = S.pending;
    S.pending = null;
    return importFiles([video, ...files]);
  }
  if (S.movie) replaceSubtitles(files);
});
$("#pickVideo").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !S.movie) return;
  if (f.size !== S.movie.size && !confirm("File này có dung lượng khác file lúc đầu — có thể là bản khác của phim (phụ đề có thể lệch). Vẫn dùng?")) return;
  if (S.movie.settings.saveVideo) db.saveVideo(S.movie.id, f);
  if (S.videoUrl) URL.revokeObjectURL(S.videoUrl);
  S.videoUrl = URL.createObjectURL(f);
  renderMovie();
});
$("#pickBackup").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try { await db.importAll(JSON.parse(await f.text())); toast("Đã khôi phục dữ liệu."); renderHome(); } catch (err) { toast("Không đọc được bản sao lưu: " + err.message); }
});
window.addEventListener("resize", () => ($("#pop").hidden = true));

// Cho phép kéo thả file vào bất cứ đâu khi đang mở một phim (thêm phụ đề).
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  if (e.target.closest("#drop")) return;
  e.preventDefault();
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) importFiles(files);
});

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
loadVocab().then(renderHome);

// Cho test tự động truy cập trạng thái.
window.__app = { S, P, act };
