"""Assemble the app: dist/nhip.html (single-file demo/artifact) and dist/nhip-pwa.zip (installable offline app)."""
import json, pathlib, zipfile, hashlib, glob, base64, shutil
from PIL import Image, ImageDraw, ImageFont

# ===== CONFIG =====
ROOT = pathlib.Path(__file__).parent
SRC, BUILD, DIST = ROOT / "src", ROOT / "build", ROOT / "dist"
APP_NAME, SHORT_NAME = "Nhịp Học Tiếng Anh", "Nhịp"
THEME, BG = "#15223A", "#F3F5F9"
ICON_SIZES = [192, 512]
BEAST_DIR = SRC / "img" / "beasts"
# ==================


def beast_images(inline):
    """Spirit beast portraits: data URIs for the single-file build, relative paths for the PWA."""
    out = {}
    for f in sorted(BEAST_DIR.glob("*.webp")):
        out[f.stem] = ("data:image/webp;base64," + base64.b64encode(f.read_bytes()).decode()) if inline else f"img/beasts/{f.name}"
    return "window.BEAST_IMG=" + json.dumps(out) + ";"


def assemble(inline_images):
    html = (SRC / "index.html").read_text(encoding="utf-8")
    parts = {"/*DATA*/": (BUILD / "data.js").read_text(encoding="utf-8"),
             "/*CORE*/": (SRC / "core.js").read_text(encoding="utf-8"),
             "/*FARM*/": (SRC / "farm.js").read_text(encoding="utf-8"),
             "/*ONLINE*/": (SRC / "online.js").read_text(encoding="utf-8"),
             "/*ONLINECFG*/": (SRC / "online.config.js").read_text(encoding="utf-8"),
             "/*IMG*/": beast_images(inline_images),
             "/*APP*/": (SRC / "app.js").read_text(encoding="utf-8")}
    for k, v in parts.items():
        assert html.count(k) == 1, k
        html = html.replace(k, v.replace("</script", "<\\/script"))
    return html


def make_icon(size, path):
    im = Image.new("RGB", (size, size), THEME)
    d = ImageDraw.Draw(im)
    s = size / 512
    d.rounded_rectangle([90 * s, 300 * s, 422 * s, 372 * s], radius=18 * s, fill="#FFE066")  # highlighter swipe
    font = None
    for f in glob.glob("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        font = ImageFont.truetype(f, int(250 * s))
    d.text((size / 2, size * 0.5), "N", fill="#FFFFFF", font=font, anchor="mm")
    im.save(path)


def pwa(html):
    head, body = html.split('<header class="top">', 1)
    head = head.replace("<!--PWA_HEAD-->", f'<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="{THEME}">'
                        '<link rel="apple-touch-icon" href="icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes">')
    page = ('<!doctype html><html lang="vi"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' + head +
            '</head><body><header class="top">' + body + "</body></html>")
    manifest = {"name": APP_NAME, "short_name": SHORT_NAME, "lang": "vi", "start_url": "./", "scope": "./", "display": "standalone",
                "background_color": BG, "theme_color": THEME, "description": "Học từ mới, câu giao tiếp và 44 âm IPA mỗi ngày — chạy offline.",
                "icons": [{"src": f"icon-{n}.png", "sizes": f"{n}x{n}", "type": "image/png", "purpose": "any maskable"} for n in ICON_SIZES]}
    version = hashlib.sha1(page.encode()).hexdigest()[:10]
    sw = f"""/* Offline cache: pages network-first, other app files cache-first, Google Fonts stale-while-revalidate. */
const CACHE = "nhip-{version}";
const SHELL = ["./", "index.html", "manifest.webmanifest", {", ".join(f'"icon-{n}.png"' for n in ICON_SIZES)}, {", ".join(f'"img/beasts/{f.name}"' for f in sorted(BEAST_DIR.glob("*.webp")))}];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {{
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin && e.request.mode === "navigate") {{
    // Pages: network first so a new release shows up on the next open; cached copy when offline.
    e.respondWith(fetch(e.request).then((res) => {{
      if (res.ok) {{ const copy = res.clone(); caches.open(CACHE).then((c) => c.put("index.html", copy)); }}
      return res;
    }}).catch(() => caches.match("index.html").then((r) => r || caches.match("./"))));
  }} else if (url.origin === location.origin) {{
    e.respondWith(caches.match(e.request, {{ ignoreSearch: true }}).then((r) => r || fetch(e.request)));
  }} else if (/fonts\\.(googleapis|gstatic)\\.com$/.test(url.hostname)) {{
    e.respondWith(caches.open(CACHE).then((c) => c.match(e.request).then((hit) => {{
      const net = fetch(e.request).then((res) => {{ if (res.ok || res.type === "opaque") c.put(e.request, res.clone()); return res; }}).catch(() => hit);
      return hit || net;
    }})));
  }}
}});
"""
    out = DIST / "pwa"
    out.mkdir(parents=True, exist_ok=True)
    shutil.copytree(BEAST_DIR, out / "img" / "beasts", dirs_exist_ok=True)
    (out / "index.html").write_text(page, encoding="utf-8")
    (out / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "sw.js").write_text(sw, encoding="utf-8")
    for n in ICON_SIZES:
        make_icon(n, out / f"icon-{n}.png")
    (out / "HUONG-DAN-CAI-DAT.txt").write_text(INSTALL_TXT, encoding="utf-8")
    z = DIST / "nhip-pwa.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                zf.write(f, f"nhip/{f.relative_to(out)}")
    return z


INSTALL_TXT = """NHỊP – HỌC TIẾNG ANH (bản cài đặt offline)

Cách 1 – Cài lên điện thoại/máy tính (khuyên dùng):
  1. Đưa thư mục "nhip" lên một host tĩnh miễn phí có HTTPS: GitHub Pages, Netlify Drop (kéo-thả thư mục), Cloudflare Pages.
  2. Mở đường link trên điện thoại:
     - Android (Chrome): menu ⋮ → "Cài đặt ứng dụng" / "Thêm vào màn hình chính".
     - iPhone (Safari): nút Chia sẻ → "Thêm vào MH chính".
     - Máy tính (Chrome/Edge): bấm biểu tượng Cài đặt ở thanh địa chỉ.
  3. Sau lần mở đầu tiên, app chạy hoàn toàn offline. Micro dùng được để ghi âm và chấm phát âm.

Cách 2 – Chạy thử trên máy tính không cần mạng:
  Trong thư mục "nhip", chạy:  python -m http.server 8000   rồi mở http://localhost:8000

Ghi chú:
  - Đọc to dùng giọng đọc có sẵn của thiết bị. Để nghe giọng Anh (UK) ở phần IPA, hãy tải thêm giọng "English (UK)" trong cài đặt Chuyển văn bản thành giọng nói của máy.
  - Chấm phát âm (Nói thử) cần Chrome/Edge và có mạng; Ghi âm – nghe lại hoạt động offline.
  - Tiến độ và hình tự đổi được lưu trên chính thiết bị.
"""

if __name__ == "__main__":
    DIST.mkdir(exist_ok=True)
    (DIST / "nhip.html").write_text(assemble(inline_images=True), encoding="utf-8")
    z = pwa(assemble(inline_images=False))
    print(f"dist/nhip.html {(DIST / 'nhip.html').stat().st_size // 1024} KB; {z.name} {z.stat().st_size // 1024} KB")
