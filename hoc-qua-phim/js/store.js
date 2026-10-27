// Lưu dữ liệu trên máy người dùng bằng IndexedDB: danh sách phim (phụ đề, tiến độ, cài đặt, có thể cả file video) và sổ từ.
// Không có máy chủ — video không rời khỏi máy.

const DB_NAME = "hoc-qua-phim", VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("movies")) db.createObjectStore("movies", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("vocab")) db.createObjectStore("vocab", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && "onsuccess" in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("aborted"));
  });
}

export const movieId = (file) => `${file.name}|${file.size}`;

export const getMovies = () => tx("movies", "readonly", (s) => s.getAll()).then((l) => (l || []).sort((a, b) => (b.opened || 0) - (a.opened || 0)));
export const getMovie = (id) => tx("movies", "readonly", (s) => s.get(id));
export const putMovie = (m) => tx("movies", "readwrite", (s) => s.put(m));
export async function deleteMovie(id) {
  await tx("movies", "readwrite", (s) => s.delete(id));
  await tx("blobs", "readwrite", (s) => s.delete(id));
}

/** Lưu video vào trình duyệt để lần sau mở lại không cần chọn file (có thể thất bại nếu hết dung lượng). */
export async function saveVideo(id, blob) {
  try { await tx("blobs", "readwrite", (s) => s.put(blob, id)); return true; } catch { return false; }
}
export const deleteVideo = (id) => tx("blobs", "readwrite", (s) => s.delete(id)).catch(() => {});
export const getVideo = (id) => tx("blobs", "readonly", (s) => s.get(id)).catch(() => null);
export const hasVideo = (id) => tx("blobs", "readonly", (s) => s.getKey(id)).then((k) => k !== undefined).catch(() => false);

export const getVocab = () => tx("vocab", "readonly", (s) => s.getAll()).then((l) => l || []);
export const putVocab = (v) => tx("vocab", "readwrite", (s) => s.put(v));
export const deleteVocab = (id) => tx("vocab", "readwrite", (s) => s.delete(id));

export async function storageInfo() {
  try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } catch { return null; }
}
export async function persist() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* bỏ qua */ }
}

/** Sao lưu toàn bộ dữ liệu học (không gồm video) thành JSON. */
export async function exportAll() {
  return { app: "hoc-qua-phim", version: 1, exported: new Date().toISOString(), movies: await getMovies(), vocab: await getVocab() };
}
export async function importAll(data) {
  if (!data || data.app !== "hoc-qua-phim") throw new Error("File sao lưu không hợp lệ");
  for (const m of data.movies || []) await putMovie(m);
  for (const v of data.vocab || []) await putVocab(v);
}
