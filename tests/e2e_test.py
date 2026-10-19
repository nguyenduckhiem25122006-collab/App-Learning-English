"""E2E smoke test of the installable build (dist/pwa) in headless Chromium.
Run: python3 tests/e2e_test.py   (serves dist/pwa on a local port)"""
import json, sys, threading, functools, http.server, socketserver, pathlib, datetime
from playwright.sync_api import sync_playwright

# ===== CONFIG =====
ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "dist" / "pwa"
SHOTS = ROOT / "build" / "shots"
PORT = 8765
SHOWCASE = """() => { const s = JSON.parse(localStorage.getItem('nhip.v1') || '{}'), now = Date.now(), M = 60000;
  s.gate = { start: now, study: 30 * M, play: 0 };
  s.farm = Object.assign(s.farm || {}, { coins: 2400, fert: 4, xp: 700, cap: 80, orders: [], goalDay: null, earned: 900,
    plots: [{c:'corn',at:0},{c:'tomato',at:0},{c:'strawberry',at:now-60*M},{c:'pumpkin',at:now-30*M},{c:'wheat',at:now},{c:null,at:0},{c:'carrot',at:0},{c:'sunflower',at:now-100*M}],
    animals: [{a:'chicken',at:0},{a:'chicken',at:now},{a:'chicken',at:now},{a:'cow',at:now},{a:'cow',at:0},{a:'sheep',at:now},{a:'sheep',at:now},{a:'bee',at:now}],
    deco: ['flowers','fence','tree','dog','well','house','tractor','rainbow'], barn: {wheat: 40, carrot: 20, corn: 20, egg: 3, milk: 1},
    beasts: {dragon: {lv: 5, st: 6, day: ''}, tiger: {lv: 3, st: 10, day: ''}} });
  localStorage.setItem('nhip.v1', JSON.stringify(s)); }"""
UNLOCK = """() => { const s = JSON.parse(localStorage.getItem('nhip.v1'));
  s.gate = { start: Date.now(), study: 12 * 60000, play: 0 }; localStorage.setItem('nhip.v1', JSON.stringify(s)); }"""
# ==================

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
    h.log_message = lambda *a: None
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORT), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def no_hscroll(page):
    return page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")


def state(page):
    page.wait_for_timeout(350)  # app debounces writes by 250 ms
    return json.loads(page.evaluate("localStorage.getItem('nhip.v1') || '{}'") or "{}")


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    srv = serve()
    url = f"http://127.0.0.1:{PORT}/"
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1200, "height": 900}, locale="vi-VN")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
        page.on("requestfailed", lambda r: "fonts.g" not in r.url and errors.append(f"request failed: {r.url}"))
        page.goto(url, wait_until="networkidle")

        # 1. Shell
        check("app renders Today", page.locator("h1").first.inner_text().startswith("Hôm nay"))
        check("two level buttons", page.locator("[data-level]").count() == 2)
        check("TOEIC is default level", page.get_attribute("#lv-toeic", "aria-pressed") == "true")
        for tab in ["words", "sent", "ipa", "rank", "me", "today"]:
            page.click(f"[data-tab={tab}]")
            check(f"tab {tab} renders", page.locator("#view h1").count() >= 1)

        # 2. Daily goal setting changes plan
        page.click("[data-step=perday][data-d='1']")
        check("words/day stepper → 9", page.inner_text("#perday") == "9")
        check("plan text updates", "~" in page.inner_text("main") and "9</b> từ/ngày" in page.inner_html("main"))
        page.click("[data-step=perday][data-d='-1']")

        # 3. Level switch
        page.click("#lv-kids")
        check("switch to Lớp 7", page.get_attribute("#lv-kids", "aria-pressed") == "true" and "Lớp 7" in page.inner_text("main"))

        # 4. Learn 5 kids words → quiz
        page.click("[data-tab=words]")
        page.click("button[data-vocab=learn]")
        first_word = page.inner_text(".card .word")
        check("first kids word is 'hobby'", first_word.strip() == "hobby", first_word)
        check("card shows IPA", page.locator(".card .ipa").inner_text().startswith("/"))
        steps = 0
        while page.locator("[data-learnstep='1']").count() and steps < 20:
            page.click("[data-learnstep='1']"); steps += 1
        page.click("[data-startquiz]")
        answered = 0
        for _ in range(10):
            if page.locator("[data-spellform]").count():
                page.fill("#spell-in", "zzz"); page.click("[data-spellform] button")
            elif page.locator("[data-choice]").count():
                page.click("[data-choice] >> nth=0")
            else:
                break
            answered += 1
            page.click("[data-quiznext]")
        check("quiz answered all 5 questions", answered == 5, str(answered))
        check("quiz shows result", "câu đúng" in page.inner_text("main"))
        s = state(page)
        check("5 kids words saved to progress", len(s.get("progress", {}).get("kids", {})) == 5)
        check("XP awarded", s.get("xp", 0) >= 50)
        check("streak started", s.get("streak", {}).get("count") == 1)

        # 5. Persistence + review: make one word due yesterday, reload, review it
        other = ctx.new_page()  # a second tab edits the store; the first tab must not clobber it
        other.goto(url, wait_until="networkidle")
        other.evaluate("""() => { const s = JSON.parse(localStorage.getItem('nhip.v1'));
          const k = Object.keys(s.progress.kids)[0]; const d = new Date(); d.setDate(d.getDate() - 1);
          s.progress.kids[k].due = d.toISOString().slice(0, 10); localStorage.setItem('nhip.v1', JSON.stringify(s)); }""")
        other.close()
        page.wait_for_timeout(200)
        page.reload(wait_until="networkidle")
        check("progress persists after reload", len(state(page)["progress"]["kids"]) == 5)
        page.click("[data-tab=words]")
        page.click("button[data-vocab=review]")
        check("review hides meaning first", page.locator(".card .meaning").count() == 0)
        page.click("[data-reveal]")
        page.click("[data-grade='2']")
        s = state(page)
        boxes = sorted(v["box"] for v in s["progress"]["kids"].values())
        check("graded word moved to box 1", boxes[-1] == 1, str(boxes))
        check("review finished screen", "Đã ôn xong" in page.inner_text("main"))

        # 6. Custom picture (emoji) persists in IndexedDB
        page.click("[data-vocab=home]")
        page.click("[data-vocab=browse]")
        page.fill("#bq", "hobby")
        page.wait_for_timeout(400)
        page.click("[data-open='hobby|n']")
        page.click("#sheet [data-editpic]")
        page.click("#sheet [data-emo='🎨']")
        page.click("#sheet [data-bg='#CDE8FF']")
        page.click("#sheet [data-savepic]")
        page.wait_for_timeout(300)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(400)
        page.click("[data-tab=words]"); page.click("[data-vocab=browse]")
        page.fill("#bq", "hobby"); page.wait_for_timeout(400)
        pic = page.locator(".item .pic").first
        check("custom emoji + background saved", "🎨" in pic.inner_text() and "205, 232, 255" in pic.evaluate("e => getComputedStyle(e).backgroundColor"))

        # 7. Draw tab produces an image
        page.click("[data-open='hobby|n']"); page.click("#sheet [data-editpic]"); page.click("#sheet [data-mode=draw]")
        box = page.locator("canvas.draw").bounding_box()
        page.mouse.move(box["x"] + 40, box["y"] + 40); page.mouse.down(); page.mouse.move(box["x"] + 200, box["y"] + 160, steps=8); page.mouse.up()
        check("drawing updates preview", page.locator("#pv img").count() == 1)
        page.click("#sheet [data-close] >> nth=0")

        # 8. Sentences: scramble + learn
        page.click("[data-tab=sent]")
        n_cards = page.locator(".sent").count()
        check("3 sentences today", n_cards == 3, str(n_cards))
        first = page.locator(".sent .en").first.inner_text()
        page.click(".sent [data-scr] >> nth=0")
        for wtok in first.split(" "):
            page.locator(".sent").first.locator(".tiles").nth(1).locator("button.tile").get_by_text(wtok, exact=True).first.click()
        check("scramble solved", "Đúng rồi" in page.locator(".sent").first.inner_text())
        xp0 = state(page)["xp"]
        page.click(".sent [data-learnsent] >> nth=0")
        check("sentence marked learned (+XP)", state(page)["xp"] == xp0 + 8)
        page.click("[data-track=work]")
        check("track switch to Công sở", "Công sở" in page.locator(".sent .chip").first.inner_text())
        page.click("[data-sentview=all]"); page.click("[data-stage=Advanced]")
        check("library shows advanced groups", page.locator("details").count() >= 5)

        # 9. IPA
        page.click("[data-tab=ipa]")
        check("44 sound tiles", page.locator(".snd").count() == 44)
        page.click(".snd[data-sound='θ']")
        check("detail for /θ/ opens", "/θ/" in page.inner_text("#snd-detail"))
        page.click("[data-ipalearn='θ']")
        check("sound marked learned", "θ" in state(page)["ipa"])
        page.click("[data-pairquiz='θ']")
        page.click("[data-pairpick] >> nth=0")
        check("minimal-pair quiz gives feedback", page.locator("#snd-detail .feedback").count() == 1)

        # 10. Reset needs in-page confirmation
        page.click("[data-tab=me]")
        page.click("[data-reset=ask]")
        check("reset asks for confirmation", page.locator("[data-reset=yes]").count() == 1)
        page.click("[data-reset=no]")
        check("cancel keeps progress", len(state(page)["progress"]["kids"]) == 5)

        # 10b. Farm: separate header button, coins from lessons, plant → fertilize → harvest
        page.click("#farm-btn")
        check("farm button opens farm", page.inner_text("#view h1").startswith("Nông trại") and page.get_attribute("#farm-btn", "aria-pressed") == "true")
        check("farm locked before 10 study minutes", page.locator("[data-lock]").count() == 1 and page.locator("[data-plotidx]").count() == 0)
        check("study time is tracked", ((state(page).get("gate") or {}).get("study") or 0) > 0, str(state(page).get("gate")))
        other = ctx.new_page(); other.goto(url, wait_until="networkidle"); other.evaluate(UNLOCK); other.close()
        page.wait_for_timeout(400)
        check("12 study minutes unlock the farm", page.locator("[data-lock]").count() == 0 and page.locator("[data-plotidx]").count() == 6)
        left = page.inner_text("[data-playleft]")
        check("play time = 0.75 × study time (9 min)", "9:00" in left or "8:5" in left, left)
        s = state(page); coins0 = s["farm"]["coins"]
        check("studying earned coins", coins0 >= 50 + 50 + 20 + 15, str(coins0))
        check("lessons gave fertilizer", s["farm"]["fert"] == 3, str(s["farm"]["fert"]))
        page.click("[data-plotidx='0']"); page.click("#sheet [data-plant=wheat]")
        s = state(page)
        check("planting wheat costs 5 coins", s["farm"]["plots"][0]["c"] == "wheat" and s["farm"]["coins"] == coins0 - 5)
        page.click("[data-plotidx='0']"); page.click("#sheet [data-fert='0']")
        check("fertilizer ripens the crop", page.locator(".plot.ready").count() == 1)
        page.click("[data-plotidx='0']")
        check("harvest pops a floating +1 over the plot", page.locator(".land .floater").count() >= 1)
        check("harvest goes to the barn", state(page)["farm"]["barn"].get("wheat") == 1)
        check("field shows all 30 slots (owned, buyable, locked by level)", page.locator(".field .plot").count() == 30 and page.locator(".plot.locked").count() == 23
              and page.locator("[data-buyplot]").count() == 1)
        page.wait_for_timeout(1800)
        check("farmer runs to the crops and tends them", page.locator(".farmer-bot.run, .farmer-bot.work").count() == 1)
        page.click("[data-sell=wheat]")
        check("selling sends the delivery truck from the barn to the market", page.locator(".delivery .dv-truck").count() == 1 and page.locator(".delivery .crate.load").count() == 1)
        page.click("[data-farmfull]")
        check("full-screen farm hides the app header", "farm-full" in page.get_attribute("body", "class") and not page.locator("header.top").is_visible())
        page.click("[data-farmfull]")
        check("leave full screen", "farm-full" not in page.get_attribute("body", "class") and page.locator("header.top").is_visible())
        check("3 orders on the board", page.locator(".order").count() == 3)
        other = ctx.new_page(); other.goto(url, wait_until="networkidle"); other.evaluate(SHOWCASE); other.close()
        page.wait_for_timeout(400)
        check("animals live in animated pens", page.locator(".pen:not(.empty)").count() == 4 and page.locator(".pen .peck").count() == 3 and page.locator(".pen .wander").count() == 7)
        check("pens sit beside the field; pig pen offered, empty", page.locator(".farm-grid .pensp").count() == 1 and page.locator(".pen.empty[data-pen=pig] [data-buyanimal=pig]").count() == 1)
        check("owned spirit beasts float over the farm", page.locator("svg.scene .spirit").count() == 2)
        page.click("[data-sell=wheat]"); page.click("[data-sell=wheat]")
        check("quick sales queue behind one truck instead of stacking", page.locator(".delivery").count() == 1)
        check("12 spirit beast cards with the zodiac art", page.locator(".beast img").count() == 12)
        page.click("[data-beastbuy=rat]")
        s = state(page)
        check("buy a spirit beast with coins + crops", "rat" in s["farm"]["beasts"] and s["farm"]["barn"]["wheat"] == 28 and s["farm"]["coins"] == 2220)
        page.click("[data-beastcast=rat]")
        n = page.locator("#sheet [data-castpick]:checked").count()
        cost_txt = page.inner_text("#castcost")
        page.click("#sheet [data-castgo=rat]")
        check("blessing plays the spirit beast effect", page.locator(".bless-fx").count() == 1 and page.locator(".plot.blessed").count() == 4)
        s = state(page)
        check("beast blesses growing crops and spends stamina", n == 4 and "tốn 4/10" in cost_txt and s["farm"]["beasts"]["rat"]["st"] == 6, f"{n} {cost_txt}")
        check("blessed plots show a badge", page.locator(".plot .bbadge").count() == 4)
        page.click("[data-beastinfo=rat]"); page.click("#sheet [data-beastup=rat]")
        check("beast levels up with harvested crops", state(page)["farm"]["beasts"]["rat"]["lv"] == 2)
        page.screenshot(path=str(SHOTS / "desktop-farm.png"), full_page=True)

        # 11. Service worker for offline use
        sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r)")
        check("service worker registered", sw)
        page.screenshot(path=str(SHOTS / "desktop-me.png"), full_page=False)
        check("no console/page errors (desktop)", not errors, "; ".join(errors[:3]))

        # 12. Phone width, light + dark, every tab without horizontal scroll
        for scheme in ["light", "dark"]:
            mctx = b.new_context(viewport={"width": 390, "height": 844}, color_scheme=scheme, device_scale_factor=2, is_mobile=True, has_touch=True)
            mp = mctx.new_page()
            merr = []
            mp.on("pageerror", lambda e: merr.append(str(e)))
            mp.goto(url, wait_until="networkidle")
            for tab in ["today", "words", "sent", "ipa", "rank", "me"]:
                mp.click(f"[data-tab={tab}]")
                check(f"{scheme} 390px no h-scroll: {tab}", no_hscroll(mp))
            mp.click("#farm-btn")
            check(f"{scheme} 390px no h-scroll: farm locked", no_hscroll(mp) and mp.locator("[data-lock]").count() == 1)
            mp.screenshot(path=str(SHOTS / f"mobile-{scheme}-farm-locked.png"))
            mp.evaluate(SHOWCASE); mp.reload(wait_until="networkidle"); mp.click("#farm-btn")
            check(f"{scheme} 390px no h-scroll: farm open", no_hscroll(mp) and mp.locator("[data-plotidx]").count() == 8)
            mp.screenshot(path=str(SHOTS / f"mobile-{scheme}-farm.png"), full_page=True)
            mp.click("[data-tab=words]"); mp.click("button[data-vocab=learn]")
            check(f"{scheme} 390px card fits", no_hscroll(mp))
            mp.screenshot(path=str(SHOTS / f"mobile-{scheme}-card.png"))
            mp.click("[data-tab=today]")
            mp.screenshot(path=str(SHOTS / f"mobile-{scheme}-today.png"))
            check(f"{scheme} no page errors", not merr, "; ".join(merr[:3]))
            mctx.close()
        b.close()
    srv.shutdown()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
