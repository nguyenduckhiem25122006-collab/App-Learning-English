"""Online mode end-to-end: real PostgreSQL + Supabase-like REST shim + the built app (dist/pwa) in Chromium.
Covers joining, PIN protection, the 15-seat limit, 10 people at once, live ranking, outages and leaving.
Run: python3 build_app.py && python3 tests/online_test.py"""
import functools, http.server, json, pathlib, socketserver, sys, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

from playwright.sync_api import sync_playwright
from pg_harness import RpcShim, TempPostgres

# ===== CONFIG =====
ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "dist" / "pwa"
SHOTS = ROOT / "build" / "shots"
PORT_WEB, PORT_API = 8771, 8772
# ==================

results = []
def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))


def serve(port):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=str(SITE))
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def http_rpc(api, fn, **args):
    req = urllib.request.Request(f"{api.url}/rest/v1/rpc/{fn}", data=json.dumps(args).encode(),
                                 headers={"Content-Type": "application/json", "apikey": "k"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    with TempPostgres() as pg:
        pg.admin("insert into nhip_rooms (code, max_players) values ('LOP7A', 15)")
        api, web = RpcShim(pg, PORT_API), serve(PORT_WEB)
        url = f"http://127.0.0.1:{PORT_WEB}/"
        errors = []
        with sync_playwright() as p:
            b = p.chromium.launch()

            def page(width=1100):
                ctx = b.new_context(viewport={"width": width, "height": 900})
                ctx.add_init_script(f"window.NHIP_ONLINE = {{ url: '{api.url}', key: 'test-anon-key' }}")
                pg_ = ctx.new_page()
                pg_.on("pageerror", lambda e: errors.append(str(e)))
                pg_.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
                return pg_

            def join(pg_, name, pin, room="LOP7A", login=False):
                pg_.click("[data-joinmode=login]" if login else "[data-joinmode=new]")
                pg_.fill("#j-room", room); pg_.fill("#j-name", name); pg_.fill("#j-pin", pin)
                if not login:
                    pg_.fill("#j-pin2", pin)
                pg_.click("[data-joinform] button")

            # 1. Invite link opens the leaderboard with the class code filled in
            a = page()
            a.goto(url + "?lop=lop7a", wait_until="networkidle")
            check("invite link opens the leaderboard", a.inner_text("#view h1") == "Bảng xếp hạng" and a.input_value("#j-room") == "LOP7A")
            join(a, "Lan", "1234")
            a.wait_for_selector(".rk.me", timeout=10000)
            check("join → my row on the board", a.locator(".rk").count() == 1 and "Lan" in a.inner_text(".rk.me"))
            st = json.loads(a.evaluate("localStorage.getItem('nhip.v1')"))
            check("token kept on the device, PIN not stored", st["online"]["token"] and "1234" not in json.dumps(st["online"]))

            # 2. Someone else tries Lan's name with a wrong PIN
            bpg = page()
            bpg.goto(url, wait_until="networkidle"); bpg.click("[data-tab=rank]")
            check("first-time form asks to create a PIN and confirm it", bpg.locator("#j-pin2").count() == 1 and "tạo mã pin" in bpg.inner_text("[data-joinform]").lower())
            bpg.fill("#j-room", "LOP7A"); bpg.fill("#j-name", "Minh"); bpg.fill("#j-pin", "56ab78"); bpg.fill("#j-pin2", "5679")
            check("PIN boxes keep digits only", bpg.input_value("#j-pin") == "5678")
            n_calls = len(api.calls); bpg.click("[data-joinform] button")
            check("PIN mismatch caught before contacting the server", "chưa giống nhau" in bpg.inner_text("[role=alert]") and len(api.calls) == n_calls)
            join(bpg, "lan", "9999")
            bpg.wait_for_selector("[role=alert]")
            check("new account with a taken name → choose another name", "đã có người dùng" in bpg.inner_text("[role=alert]"), bpg.inner_text("[role=alert]"))
            join(bpg, "lan", "9999", login=True)
            bpg.wait_for_selector("[role=alert]")
            check("wrong PIN when logging in is refused", "Sai PIN" in bpg.inner_text("[role=alert]"))
            join(bpg, "Minh", "5678")
            bpg.wait_for_selector(".rk.me", timeout=10000)
            check("second learner joins, both on the board", bpg.locator(".rk").count() == 2)

            # 3. Lan studies (more XP this week) → after sync she ranks first for everyone
            pg.admin("update nhip_players set last_sync = now() - interval '1 hour'")
            a.evaluate("""() => { const s = JSON.parse(localStorage.getItem('nhip.v1')); const d = new Date();
              const t = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
              s.xp = 420; s.days[t] = { w: 10, r: 0, s: 0, xp: 420 }; localStorage.setItem('nhip.v1', JSON.stringify(s)); }""")
            a.reload(wait_until="networkidle"); a.wait_for_timeout(1500)
            row = pg.admin("select xp, week_xp from nhip_players where name = 'Lan'")[0]
            check("app pushes my XP to the server", row == (420, 420), row)
            bpg.evaluate("localStorage.removeItem('nhip.board')"); bpg.reload(wait_until="networkidle"); bpg.click("[data-tab=rank]")
            bpg.wait_for_selector(".rk.me", timeout=10000)
            first = bpg.locator(".rk").first.inner_text()
            check("ranking updates: Lan is #1 this week", "Lan" in first and "420 XP" in first, first)
            check("motivation line shows the gap to the next person", "nữa là vượt Lan" in bpg.inner_text(".rank-me"), bpg.inner_text(".rank-me"))
            bpg.click("[data-rankby=streak]")
            check("switch ranking metric", bpg.get_attribute("[data-rankby=streak]", "aria-pressed") == "true")

            # 4. Ten people at the same time: 8 more learners join + sync + read the board concurrently over HTTP
            def learner(i):
                j = http_rpc(api, "nhip_join", p_room="LOP7A", p_name=f"Ban {i}", p_pin="1111")
                s = http_rpc(api, "nhip_sync", p_token=j["token"], p_stats={"xp": 10 * i, "week_xp": 10 * i, "week": "2026-W43"})
                bd = http_rpc(api, "nhip_board", p_token=j["token"], p_week="2026-W43")
                return j["ok"] and s["ok"] and bd["ok"]
            t0 = time.time()
            with ThreadPoolExecutor(10) as ex:
                oks = list(ex.map(learner, range(8)))
            check("10 learners online at once (8 join+sync+board concurrently)", all(oks) and pg.admin("select count(*) from nhip_players")[0][0] == 10, oks)
            check("concurrent round finishes quickly", time.time() - t0 < 10, f"{time.time() - t0:.1f}s")
            pages = [page(390) for _ in range(3)]
            for i, pp in enumerate(pages):
                pp.goto(url, wait_until="domcontentloaded")
            for i, pp in enumerate(pages):
                pp.click("[data-tab=rank]"); join(pp, f"Ban {i}", "1111", login=True)
            for pp in pages:
                pp.wait_for_selector(".rk.me", timeout=10000)
            check("logging back in on another device (same name + PIN)", all(pp.locator(".rk").count() == 10 for pp in pages))
            check("leaderboard fits a phone screen", all(pp.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1") for pp in pages))
            pages[0].screenshot(path=str(SHOTS / "mobile-rank.png"), full_page=True)

            # 5. Seat limit: fill to 15, the 16th person is turned away politely
            for i in range(8, 13):
                http_rpc(api, "nhip_join", p_room="LOP7A", p_name=f"Ban {i}", p_pin="1111")
            c = page()
            c.goto(url, wait_until="networkidle"); c.click("[data-tab=rank]")
            join(c, "Nguoi 16", "4321")
            c.wait_for_selector("[role=alert]")
            check("16th learner sees 'class is full'", "đủ chỗ" in c.inner_text("[role=alert]") and pg.admin("select count(*) from nhip_players")[0][0] == 15)

            # 6. The client does not hammer the server
            api.calls.clear(); a.wait_for_timeout(5000)
            check("idle app sends no burst of requests", api.calls.count("nhip_sync") <= 1 and len(api.calls) <= 2, api.calls)

            # 7. Server outage: cached board stays visible, the app keeps working
            api.down = True
            a.evaluate("() => { const b = JSON.parse(localStorage.getItem('nhip.board')); b.at = Date.now() - 120000; localStorage.setItem('nhip.board', JSON.stringify(b)); }")
            a.reload(wait_until="networkidle"); a.click("[data-tab=rank]"); a.wait_for_timeout(1500)
            check("outage: cached ranking still shown", a.locator(".rk.me").count() == 1)
            check("outage: offline badge", "Ngoại tuyến" in a.inner_text("#view .hello"), a.inner_text("#view .hello"))
            a.click("[data-tab=words]"); a.click("button[data-vocab=learn]")
            check("outage: learning still works", a.locator(".card .word").count() == 1)
            api.calls.clear(); a.click("[data-tab=rank]"); a.wait_for_timeout(3000)
            check("outage: client backs off instead of retrying in a loop", len(api.calls) == 0, api.calls)
            api.down = False

            # 8. Removed by the admin → back to the join form, no crash
            pg.admin("delete from nhip_players where name = 'Minh'")
            bpg.evaluate("localStorage.removeItem('nhip.board')"); bpg.reload(wait_until="networkidle"); bpg.click("[data-tab=rank]"); bpg.wait_for_timeout(1500)
            check("removed learner is asked to join again", bpg.locator("[data-joinform]").count() == 1)

            # 9. Leave the class frees the seat
            a.evaluate("localStorage.removeItem('nhip.board')"); a.reload(wait_until="networkidle"); a.click("[data-tab=rank]")
            a.wait_for_selector("[data-leave=ask]", timeout=20000)
            a.click("[data-leave=ask]"); a.click("[data-leave=yes]"); a.wait_for_timeout(800)
            check("leave the class", a.locator("[data-joinform]").count() == 1 and pg.admin("select count(*) from nhip_players where name='Lan'")[0][0] == 0)
            check("no page errors", not errors, "; ".join(errors[:3]))
            b.close()
        api.close(); web.shutdown()
    print(f"\n{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
