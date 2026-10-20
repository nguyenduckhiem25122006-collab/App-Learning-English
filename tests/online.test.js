const test = require("node:test");
const assert = require("node:assert/strict");
const O = require("../src/online.js");

const cfg = { url: "https://demo.supabase.co/", key: "eyJanon" };
const ok = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

function harness(responder) {
  let t = 1_000_000;
  const calls = [];
  const net = O.create(cfg, { now: () => t, random: () => 0.5, fetch: (url, opts) => { calls.push({ url, opts }); return responder(url, opts); } });
  return { net, calls, advance: (ms) => { t += ms; } };
}

test("not configured: every call is refused without touching the network", async () => {
  const net = O.create({ url: "", key: "" }, { fetch: () => assert.fail("no fetch") });
  assert.equal(net.configured, false);
  await assert.rejects(net.join("A", "B", "1234"), { code: "not_configured" });
});

test("RPC call: URL, headers and named arguments match Supabase", async () => {
  const h = harness(() => ok({ ok: true, token: "t" }));
  const r = await h.net.join("LOP7A", "Lan", "1234");
  assert.equal(r.token, "t");
  const { url, opts } = h.calls[0];
  assert.equal(url, "https://demo.supabase.co/rest/v1/rpc/nhip_join");
  assert.equal(opts.headers.apikey, "eyJanon"); assert.equal(opts.headers.Authorization, "Bearer eyJanon");
  assert.deepEqual(JSON.parse(opts.body), { p_room: "LOP7A", p_name: "Lan", p_pin: "1234" });
});

test("one request per function at a time", async () => {
  let release;
  const h = harness(() => new Promise((r) => { release = () => r({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }); }));
  const a = h.net.board("tok", "2026-W43"), b = h.net.board("tok", "2026-W43");
  assert.equal(a, b); assert.equal(h.calls.length, 1);
  release(); await a;
  assert.deepEqual(h.net.state.inflight, {});
});

test("failures back off exponentially, success resets", async () => {
  let mode = "down";
  const h = harness(() => (mode === "down" ? Promise.reject(new TypeError("net")) : mode === "busy" ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }) : ok({ ok: true })));
  await assert.rejects(h.net.sync("t", {}), { code: "offline" });
  assert.equal(h.net.state.until - 1_000_000, O.BACKOFF_MIN);
  await assert.rejects(h.net.sync("t", {}), { code: "offline" });
  assert.equal(h.calls.length, 1, "no request while backing off");
  h.advance(O.BACKOFF_MIN); mode = "busy";
  await assert.rejects(h.net.sync("t", {}), { code: "server" });
  assert.equal(h.net.state.fails, 2);
  for (let i = 0; i < 10; i++) { h.advance(O.BACKOFF_MAX); await h.net.sync("t", {}).catch(() => {}); }
  assert.ok(h.net.state.until - 1_000_000 - 0 <= 20 * O.BACKOFF_MAX, "backoff is capped");
  h.advance(O.BACKOFF_MAX); mode = "up";
  assert.deepEqual(await h.net.sync("t", {}), { ok: true });
  assert.equal(h.net.state.fails, 0); assert.equal(h.net.offline(), false);
});

test("non-JSON or 4xx answers are errors, not crashes", async () => {
  const h = harness(() => Promise.resolve({ ok: false, status: 400, json: () => Promise.reject(new Error("html")) }));
  await assert.rejects(h.net.leave("t"), { code: "bad_response" });
});

test("a function missing on an old server is reported without backing off", async () => {
  const h = harness(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ code: "PGRST202" }) }));
  await assert.rejects(h.net.packGet("t", 0), { code: "server_old" });
  assert.equal(h.net.offline(), false);
  assert.match(O.message("server_old"), /schema\.sql/);
});

test("class material calls send the right named arguments", async () => {
  const h = harness(() => ok({ ok: true }));
  await h.net.packGet("tok", 3);
  await h.net.admin("LOP7A", "pw");
  await h.net.packPut("LOP7A", "pw", { app: "nhip-pack" });
  assert.deepEqual(h.calls.map((c) => [c.url.split("/").pop(), JSON.parse(c.opts.body)]), [
    ["nhip_pack_get", { p_token: "tok", p_ver: 3 }],
    ["nhip_admin", { p_room: "LOP7A", p_secret: "pw" }],
    ["nhip_pack_put", { p_room: "LOP7A", p_secret: "pw", p_pack: { app: "nhip-pack" } }],
  ]);
});

test("ranking by metric with shared ranks for ties", () => {
  const ps = [
    { name: "An", xp: 50, week_xp: 30, streak: 2, words: 10, farm_lv: 2, beasts: 1 },
    { name: "Bình", xp: 90, week_xp: 30, streak: 5, words: 40, farm_lv: 2, beasts: 3 },
    { name: "Chi", xp: 70, week_xp: 10, streak: 5, words: 20, farm_lv: 4, beasts: 0 },
  ];
  assert.deepEqual(O.rank(ps, "xp").map((p) => [p.name, p.rank]), [["Bình", 1], ["Chi", 2], ["An", 3]]);
  assert.deepEqual(O.rank(ps, "week").map((p) => [p.name, p.rank]), [["An", 1], ["Bình", 1], ["Chi", 3]]);
  assert.deepEqual(O.rank(ps, "farm").map((p) => p.name), ["Chi", "Bình", "An"]);
  assert.match(O.message("room_full"), /đủ chỗ/); assert.match(O.message("weird"), /kết nối/);
});

test("new publishable keys go in the apikey header only", async () => {
  let seen;
  const net = O.create({ url: "https://x.supabase.co", key: "sb_publishable_abc" }, { fetch: (u, o) => { seen = o.headers; return ok({ ok: true }); } });
  await net.leave("t");
  assert.equal(seen.apikey, "sb_publishable_abc"); assert.equal(seen.Authorization, undefined);
});

test("Project URL works with or without the /rest/v1/ suffix", async () => {
  for (const url of ["https://x.supabase.co", "https://x.supabase.co/", "https://x.supabase.co/rest/v1/", " https://x.supabase.co/rest/v1 "]) {
    let seen;
    const net = O.create({ url, key: "sb_publishable_abc" }, { fetch: (u) => { seen = u; return ok({ ok: true }); } });
    await net.leave("t");
    assert.equal(seen, "https://x.supabase.co/rest/v1/rpc/nhip_leave", url);
  }
});
