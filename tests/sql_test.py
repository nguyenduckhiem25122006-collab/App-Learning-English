"""Server-side tests for supabase/schema.sql on a real PostgreSQL, calling functions as the public (anon) role.
Run: python3 tests/sql_test.py"""
import sys, uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg
from pg_harness import SCHEMA, TempPostgres

results = []
def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))


def main():
    with TempPostgres() as pg:
        rpc = pg.anon_rpc
        pg.admin("insert into nhip_rooms (code, max_players) values ('LOP7A', 15), ('MINI', 3), (' English ', 15)")
        check("class code typed in lowercase is stored in capitals", pg.admin("select count(*) from nhip_rooms where code = 'ENGLISH'")[0][0] == 1)

        # Tables are closed to the public role
        for sql in ["select * from nhip_players", "insert into nhip_rooms(code) values ('HACK1')", "select public.nhip_int('{}'::jsonb, 'x', 0, 1)"]:
            try:
                with psycopg.connect(pg.dsn, autocommit=True) as c:
                    c.execute("set role anon"); c.execute(sql)
                check(f"anon blocked: {sql[:30]}", False)
            except psycopg.errors.InsufficientPrivilege:
                check(f"anon blocked: {sql[:30]}", True)

        # Join / log in / PIN protection
        a = rpc("nhip_join", p_room=" lop7a ", p_name="  Lan   Anh ", p_pin="1234")
        check("join creates player, trims name, room code case-insensitive", a["ok"] and a["name"] == "Lan Anh" and a["new"] and a["room"] == "LOP7A", a)
        again = rpc("nhip_join", p_room="LOP7A", p_name="lan anh", p_pin="1234")
        check("same name + PIN logs back in with the same token", again["ok"] and again["token"] == a["token"] and not again["new"], again)
        check("unknown class", rpc("nhip_join", p_room="NOPE", p_name="Ai", p_pin="1234")["error"] == "no_room")
        for bad in ["A", "x" * 21, "<script>", "Tom\x07"]:
            check(f"bad name rejected: {bad[:10]!r}", rpc("nhip_join", p_room="LOP7A", p_name=bad, p_pin="1234")["error"] == "bad_name")
        for bad in ["12", "abcd", "1234567", None]:
            check(f"bad PIN rejected: {bad!r}", rpc("nhip_join", p_room="LOP7A", p_name="Minh", p_pin=bad)["error"] == "bad_pin")
        errs = [rpc("nhip_join", p_room="LOP7A", p_name="Lan Anh", p_pin="0000")["error"] for _ in range(5)]
        check("wrong PIN 4× then locked on the 5th", errs == ["wrong_pin"] * 4 + ["locked"], errs)
        check("locked even with the right PIN", rpc("nhip_join", p_room="LOP7A", p_name="Lan Anh", p_pin="1234")["error"] == "locked")
        pg.admin("update nhip_players set locked_until = now() - interval '1 second'")
        check("lock expires", rpc("nhip_join", p_room="LOP7A", p_name="Lan Anh", p_pin="1234")["ok"])
        pins = pg.admin("select pin_hash from nhip_players")
        check("PIN stored as bcrypt hash", all(p[0].startswith("$2a$") for p in pins))

        # Seat limit, also under concurrent joins
        with ThreadPoolExecutor(8) as ex:
            res = list(ex.map(lambda i: rpc("nhip_join", p_room="MINI", p_name=f"Ban {i}", p_pin="1111"), range(8)))
        ok = sum(r["ok"] for r in res)
        check("class seat limit holds under 8 concurrent joins", ok == 3 and all(r["error"] == "room_full" for r in res if not r["ok"]), res)
        fill = [rpc("nhip_join", p_room="LOP7A", p_name=f"Hoc sinh {i}", p_pin="2222")["ok"] for i in range(20)]
        check("15 seats per class by default", sum(fill) == 14 and pg.admin("select count(*) from nhip_players where room='LOP7A'")[0][0] == 15)

        # Sync: validation, clamping, rate limit
        tok = a["token"]
        s1 = rpc("nhip_sync", p_token=tok, p_stats={"xp": 999999, "week_xp": 500, "week": "2026-W43", "words": 80, "streak": 4, "farm_lv": 3, "beasts": 2, "avatar": "rat"})
        check("first sync clamps an impossible XP jump", s1["ok"] and s1["xp"] == 600, s1)
        check("second sync within 20 s is refused", rpc("nhip_sync", p_token=tok, p_stats={"xp": 10})["error"] == "too_fast")
        pg.admin("update nhip_players set last_sync = now() - interval '2 hours'")
        s2 = rpc("nhip_sync", p_token=tok, p_stats={"xp": 2500, "week_xp": "lots", "week": "bad", "words": -5, "streak": 1e30, "farm_lv": 99, "beasts": 7.9, "avatar": "<img>"})
        row = pg.admin("select xp, week_xp, week, words, streak, farm_lv, beasts, avatar from nhip_players where token = %s", (tok,))[0]
        check("garbage values are clamped, not stored", s2["ok"] and row == (2500, 0, "", 0, 3650, 30, 7, ""), row)
        check("unknown token", rpc("nhip_sync", p_token=str(uuid.uuid4()), p_stats={})["error"] == "no_player")
        check("non-object stats", rpc("nhip_sync", p_token=tok, p_stats=[1, 2])["error"] == "bad_input")

        # Board: members only, weekly XP only for the current week, sorted by XP
        pg.admin("update nhip_players set last_sync = now() - interval '1 hour'")
        b = rpc("nhip_join", p_room="LOP7A", p_name="hoc sinh 0", p_pin="2222")
        rpc("nhip_sync", p_token=b["token"], p_stats={"xp": 300, "week_xp": 120, "week": "2026-W43"})
        rpc("nhip_sync", p_token=tok, p_stats={"xp": 2600, "week_xp": 90, "week": "2026-W42"})
        bd = rpc("nhip_board", p_token=b["token"], p_week="2026-W43")
        top = bd["players"][0]
        check("board lists the class sorted by XP", bd["ok"] and len(bd["players"]) == 15 and top["name"] == "Lan Anh" and top["xp"] == 2600, top)
        check("weekly XP from another week counts as 0", top["week_xp"] == 0 and next(p for p in bd["players"] if p["me"])["week_xp"] == 120)
        check("board hides tokens and PINs", all(set(p) == {"name", "me", "xp", "week_xp", "words", "streak", "farm_lv", "beasts", "avatar", "seen"} for p in bd["players"]))
        check("board needs a member token", rpc("nhip_board", p_token=str(uuid.uuid4()), p_week="2026-W43")["error"] == "no_player")

        # Class study material: teacher password, size and rate limits, members-only reading
        pack = {"app": "nhip-pack", "v": 1, "name": "Lớp 7A", "words": [{"id": "c1", "lvl": "kids", "topic": "Tuần 1", "w": "apple", "pos": "n", "vi": "quả táo"}]}
        check("no teacher password set yet", rpc("nhip_admin", p_room="LOP7A", p_secret="x")["error"] == "no_teacher")
        pg.admin("update nhip_rooms set admin_hash = crypt('co-giao-7a', gen_salt('bf', 8)) where code = 'LOP7A'")
        ad = rpc("nhip_admin", p_room="lop7a", p_secret="co-giao-7a")
        check("teacher signs in, no material yet", ad["ok"] and ad["ver"] == 0 and ad["pack"] is None, ad)
        check("unknown class for teacher", rpc("nhip_admin", p_room="NOPE", p_secret="co-giao-7a")["error"] == "no_room")
        check("member reads: no material yet", rpc("nhip_pack_get", p_token=tok, p_ver=0) == {"ok": True, "room": "LOP7A", "ver": 0, "pack": None})
        put = rpc("nhip_pack_put", p_room="LOP7A", p_secret="co-giao-7a", p_pack=pack)
        check("teacher publishes material (version 1)", put["ok"] and put["ver"] == 1, put)
        check("publishing again within 5 s is refused", rpc("nhip_pack_put", p_room="LOP7A", p_secret="co-giao-7a", p_pack=pack)["error"] == "too_fast")
        got = rpc("nhip_pack_get", p_token=tok, p_ver=0)
        check("member gets the material", got["ok"] and got["ver"] == 1 and got["pack"]["words"][0]["w"] == "apple", got)
        check("same version answers without the material", rpc("nhip_pack_get", p_token=tok, p_ver=1) == {"ok": True, "room": "LOP7A", "ver": 1, "same": True})
        check("material needs a member token", rpc("nhip_pack_get", p_token=str(uuid.uuid4()), p_ver=0)["error"] == "no_player")
        other = rpc("nhip_join", p_room="ENGLISH", p_name="Khach", p_pin="1234")
        check("another class does not see it", rpc("nhip_pack_get", p_token=other["token"], p_ver=0)["pack"] is None)
        check("not a pack is refused", rpc("nhip_pack_put", p_room="LOP7A", p_secret="co-giao-7a", p_pack={"words": []})["error"] == "bad_pack")
        big = dict(pack, words=[{"id": f"c{i}", "w": "x" * 200} for i in range(3000)])
        check("material over 512 KB is refused", rpc("nhip_pack_put", p_room="LOP7A", p_secret="co-giao-7a", p_pack=big)["error"] == "too_big")
        errs = [rpc("nhip_pack_put", p_room="LOP7A", p_secret="sai-mat-khau", p_pack=pack)["error"] for _ in range(5)]
        check("wrong teacher password 4× then locked", errs == ["wrong_secret"] * 4 + ["admin_locked"], errs)
        check("locked even with the right password", rpc("nhip_admin", p_room="LOP7A", p_secret="co-giao-7a")["error"] == "admin_locked")
        pg.admin("update nhip_rooms set admin_locked_until = now() - interval '1 second'")
        pg.admin("update nhip_packs set updated_at = now() - interval '1 minute'")
        put2 = rpc("nhip_pack_put", p_room="LOP7A", p_secret="co-giao-7a", p_pack=dict(pack, name="Lớp 7A (mới)"))
        check("after the lock expires the teacher publishes version 2", put2["ok"] and put2["ver"] == 2, put2)
        check("teacher sign-in returns the current material", rpc("nhip_admin", p_room="LOP7A", p_secret="co-giao-7a")["pack"]["name"] == "Lớp 7A (mới)")
        try:
            with psycopg.connect(pg.dsn, autocommit=True) as c:
                c.execute("set role anon"); c.execute("select public.nhip_admin_check('LOP7A', 'x')")
            check("anon cannot call the password check directly", False)
        except psycopg.errors.InsufficientPrivilege:
            check("anon cannot call the password check directly", True)

        # Running the schema again (to update an existing server) keeps classes, players and material
        pg.admin(SCHEMA.read_text())
        check("schema re-run keeps data", rpc("nhip_pack_get", p_token=tok, p_ver=0)["ver"] == 2 and pg.admin("select count(*) from nhip_players")[0][0] > 15)

        # Leave frees a seat
        check("leave", rpc("nhip_leave", p_token=b["token"])["ok"])
        check("seat freed after leaving", rpc("nhip_join", p_room="LOP7A", p_name="Ban moi", p_pin="3333")["ok"])

    print(f"\n{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
