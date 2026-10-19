/* Online leaderboard client: Supabase RPC calls with a timeout, one request per function at a time, and exponential
   backoff after failures. The app is local-first and never waits on this; when the server is down it just shows cached data. */
(function (root) {
  "use strict";

  // ===== CONFIG =====
  const TIMEOUT = 8000;               // abort a request after this
  const SYNC_EVERY = 60 * 1000;       // push my numbers at most this often
  const BOARD_TTL = 60 * 1000;        // reuse the fetched leaderboard this long
  const BACKOFF_MIN = 15 * 1000, BACKOFF_MAX = 15 * 60 * 1000;
  const ERRORS = {
    no_room: "Không tìm thấy mã lớp này", bad_name: "Tên cần 2–20 ký tự, không dùng ký hiệu đặc biệt", bad_pin: "PIN gồm 4–6 chữ số",
    wrong_pin: "Sai PIN. Tên này đã có trong lớp — nếu là bạn, hãy nhập đúng PIN", locked: "Nhập sai PIN quá nhiều lần, thử lại sau 15 phút",
    room_full: "Lớp đã đủ chỗ", name_taken: "Tên này vừa có người dùng, hãy chọn tên khác", no_player: "Tài khoản lớp không còn — hãy tham gia lại",
    offline: "Chưa kết nối được máy chủ, thử lại sau nhé", server: "Máy chủ đang bận, thử lại sau nhé", bad_response: "Máy chủ trả lời lạ — báo người quản lý lớp",
    not_configured: "Chế độ trực tuyến chưa được thiết lập",
  };
  // ==================

  const fail = (code) => Object.assign(new Error(code), { code });

  /** cfg: { url, key }; deps (for tests): { fetch, now, random } */
  function create(cfg, deps = {}) {
    const doFetch = deps.fetch || ((...a) => root.fetch(...a)), now = deps.now || Date.now, random = deps.random || Math.random;
    const configured = !!(cfg && /^https?:\/\//.test(String(cfg.url || "").trim()) && String(cfg.key || "").trim());
    const st = { fails: 0, until: 0, inflight: {} };
    // Accept the Project URL with or without the "/rest/v1/" suffix Supabase shows on its API page.
    const base = configured ? cfg.url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "") : "";
    const jwt = configured && cfg.key.startsWith("eyJ"); // legacy "anon" key; new "sb_publishable_" keys go in apikey only

    function call(fn, args) {
      if (!configured) return Promise.reject(fail("not_configured"));
      if (now() < st.until) return Promise.reject(fail("offline"));
      if (st.inflight[fn]) return st.inflight[fn];
      const p = (async () => {
        const ctl = typeof AbortController === "function" ? new AbortController() : null;
        const timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT);
        try {
          let res;
          try {
            res = await doFetch(`${base}/rest/v1/rpc/${fn}`, {
              method: "POST", body: JSON.stringify(args), signal: ctl ? ctl.signal : undefined,
              headers: { "Content-Type": "application/json", apikey: cfg.key, ...(jwt ? { Authorization: `Bearer ${cfg.key}` } : {}) },
            });
          } catch (e) { throw fail("offline"); }
          if (res.status === 429 || res.status >= 500) throw fail("server");
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || typeof data !== "object") throw fail("bad_response");
          st.fails = 0; st.until = 0;
          return data;
        } catch (e) {
          st.fails++;
          st.until = now() + Math.min(BACKOFF_MAX, BACKOFF_MIN * 2 ** (st.fails - 1)) * (0.8 + 0.4 * random());
          throw e;
        } finally {
          clearTimeout(timer);
          delete st.inflight[fn];
        }
      })();
      st.inflight[fn] = p;
      return p;
    }

    return {
      configured, state: st,
      offline: () => now() < st.until,
      join: (room, name, pin) => call("nhip_join", { p_room: room, p_name: name, p_pin: pin }),
      sync: (token, stats) => call("nhip_sync", { p_token: token, p_stats: stats }),
      board: (token, week) => call("nhip_board", { p_token: token, p_week: week }),
      leave: (token) => call("nhip_leave", { p_token: token }),
    };
  }

  const METRICS = {
    week: { label: "Tuần này", unit: "XP", get: (p) => p.week_xp },
    xp: { label: "Tổng XP", unit: "XP", get: (p) => p.xp },
    streak: { label: "Chuỗi ngày", unit: "ngày", get: (p) => p.streak },
    words: { label: "Từ đã học", unit: "từ", get: (p) => p.words },
    farm: { label: "Nông trại", unit: "cấp", get: (p) => p.farm_lv * 100 + p.beasts },
  };
  /** Sort players by a metric; ties share a rank (1, 2, 2, 4). */
  function rank(players, by) {
    const get = METRICS[by].get;
    const list = players.slice().sort((a, b) => get(b) - get(a) || String(a.name).localeCompare(String(b.name)));
    let prev = null, pos = 0;
    return list.map((p, i) => { if (get(p) !== prev) { pos = i + 1; prev = get(p); } return { ...p, rank: pos, value: get(p) }; });
  }
  const message = (code) => ERRORS[code] || ERRORS.offline;

  const Online = { create, rank, message, METRICS, TIMEOUT, SYNC_EVERY, BOARD_TTL, BACKOFF_MIN, BACKOFF_MAX };
  if (typeof module === "object" && module.exports) module.exports = Online;
  else root.Online = Online;
})(typeof window !== "undefined" ? window : globalThis);
