"""Test helpers for the online mode: a throwaway PostgreSQL with the Supabase schema loaded, and a tiny
HTTP shim that answers like Supabase's REST API (POST /rest/v1/rpc/<fn>, executed as role anon)."""
import glob, json, os, pathlib, pwd, re, shutil, subprocess, tempfile, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psycopg
from psycopg.types.json import Jsonb

# ===== CONFIG =====
ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "supabase" / "schema.sql"
RPCS = {"nhip_join", "nhip_sync", "nhip_board", "nhip_leave"}
# ==================


class TempPostgres:
    """initdb in a temp dir, socket only, roles anon/authenticated like Supabase, schema applied."""

    def __enter__(self):
        bins = sorted(glob.glob("/usr/lib/postgresql/*/bin"))
        assert bins, "PostgreSQL server binaries not found (apt install postgresql)"
        self.bin = bins[-1]
        self.dir = tempfile.mkdtemp(prefix="nhip-pg-")
        self.user = None
        if os.geteuid() == 0:  # postgres refuses to run as root
            self.user = "postgres"
            pw = pwd.getpwnam("postgres")
            os.chown(self.dir, pw.pw_uid, pw.pw_gid)
        self._run("initdb", "-D", f"{self.dir}/data", "-A", "trust", "-U", "postgres", "--no-sync")
        self._run("pg_ctl", "-D", f"{self.dir}/data", "-w", "-l", f"{self.dir}/log", "-o",
                  f"-k {self.dir} -c listen_addresses='' -c fsync=off -c max_connections=60", "start")
        self.dsn = f"host={self.dir} dbname=postgres user=postgres"
        with psycopg.connect(self.dsn, autocommit=True) as c:
            c.execute("create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated")
            c.execute(SCHEMA.read_text())
        return self

    def _run(self, exe, *args):
        cmd = [f"{self.bin}/{exe}", *args]
        if self.user:
            cmd = ["runuser", "-u", self.user, "--", *cmd]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def admin(self, sql, params=None):
        with psycopg.connect(self.dsn, autocommit=True) as c:
            cur = c.execute(sql, params)
            return cur.fetchall() if cur.description else None

    def anon_rpc(self, fn, **args):
        """Call an RPC exactly as the public API would: as role anon, named arguments."""
        assert fn in RPCS and all(re.fullmatch(r"p_[a-z]+", k) for k in args)
        vals = {k: Jsonb(v) if isinstance(v, (dict, list)) else v for k, v in args.items()}
        with psycopg.connect(self.dsn, autocommit=True) as c:
            c.execute("set role anon")
            sql = f"select public.{fn}({', '.join(f'{k} => %({k})s' for k in vals)})"
            return c.execute(sql, vals).fetchone()[0]

    def __exit__(self, *exc):
        self._run("pg_ctl", "-D", f"{self.dir}/data", "-m", "immediate", "stop")
        shutil.rmtree(self.dir, ignore_errors=True)


class RpcShim:
    """Supabase-like REST endpoint on 127.0.0.1:<port>. Set .down = True to simulate an outage (HTTP 503)."""

    def __init__(self, pg, port):
        self.pg, self.port, self.down, self.calls = pg, port, False, []
        shim = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, body=None):
                self.send_response(code)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "apikey, authorization, content-type")
                self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
                data = b"" if body is None else json.dumps(body).encode()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_OPTIONS(self):
                self._send(204)

            def do_POST(self):
                m = re.fullmatch(r"/rest/v1/rpc/([a-z_]+)", self.path)
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                if shim.down:
                    return self._send(503, {"message": "down"})
                if not m or m.group(1) not in RPCS or not self.headers.get("apikey"):
                    return self._send(404, {"message": "not found"})
                shim.calls.append(m.group(1))
                try:
                    self._send(200, shim.pg.anon_rpc(m.group(1), **body))
                except Exception as e:  # PostgREST answers errors with 400 + message
                    self._send(400, {"message": str(e)})

        self.srv = ThreadingHTTPServer(("127.0.0.1", port), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{port}"

    def close(self):
        self.srv.shutdown()
