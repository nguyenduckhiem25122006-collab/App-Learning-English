/* Interactive visuals for the Toán & Vật lí lessons. Each visual type has sliders (ctrls) and a pure draw(params, state)
   that returns { svg, info }: an SVG drawing (viewBox 0 0 360 220) and a short HTML readout of the numbers.
   No DOM access here, so every visual can be drawn and checked in Node. */
(function (root) {
  "use strict";

  const W = 360, H = 220;
  const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
  /** Vietnamese number format: decimal comma, at most d decimals, no trailing zeros, true minus sign. */
  const fmt = (n, d = 2) => (Math.abs(n) < 1e-9 ? "0" : String(+n.toFixed(d)).replace(".", ",").replace("-", "−"));
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  function frac(x) { // x is a multiple of 1/4
    const n = Math.round(x * 4), g = gcd(n, 4) || 1, p = n / g, q = 4 / g;
    return q === 1 ? fmt(p) : `${p < 0 ? "−" : ""}${Math.abs(p)}/${q}`;
  }
  const svgw = (body, extra = "") => `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" role="img"${extra}>${body}</svg>`;
  const T = (x, y, s, o = {}) => `<text x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" font-size="${o.size || 12}" fill="${o.fill || "#22324A"}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.bold ? ' font-weight="700"' : ""}>${s}</text>`;
  const L = (x1, y1, x2, y2, c = "#22324A", w = 2, dash) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round"/>`;
  const C = (x, y, r, fill, stroke = "none", w = 0) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
  const P = (pts, fill, stroke = "#22324A", w = 2, extra = "") => `<polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"${extra}/>`;
  /** Point at angle a (degrees, counter-clockwise from +x, as in maths) and radius r around (cx, cy). */
  const pol = (cx, cy, r, a) => [cx + r * Math.cos(rad(a)), cy - r * Math.sin(rad(a))];
  /** Filled angle sector from a1 to a2 (degrees, counter-clockwise). */
  function sector(cx, cy, r, a1, a2, fill, label, lr) {
    let span = a2 - a1; while (span < 0) span += 360;
    const [x1, y1] = pol(cx, cy, r, a1), [x2, y2] = pol(cx, cy, r, a1 + span);
    const path = `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${span > 180 ? 1 : 0} 0 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="${fill}" opacity=".75"/>`;
    if (!label) return path;
    const [lx, ly] = pol(cx, cy, lr || r + 13, a1 + span / 2);
    return path + T(lx, ly + 4, label, { anchor: "middle", size: 11, bold: true });
  }
  /** The angle at vertex v between rays to points a and b (always the non-reflex one). */
  function vertexAngle(v, a, b, r, fill, label, lr) {
    const d1 = deg(Math.atan2(-(a[1] - v[1]), a[0] - v[0])), d2 = deg(Math.atan2(-(b[1] - v[1]), b[0] - v[0]));
    let span = d2 - d1; while (span < 0) span += 360;
    return span <= 180 ? sector(v[0], v[1], r, d1, d2, fill, label, lr) : sector(v[0], v[1], r, d2, d1, fill, label, lr);
  }
  const arrow = (x1, y1, x2, y2, c = "#22324A", w = 2) => {
    const a = Math.atan2(y2 - y1, x2 - x1), h = 8;
    return L(x1, y1, x2, y2, c, w) + `<path d="M${x2.toFixed(1)} ${y2.toFixed(1)}L${(x2 - h * Math.cos(a - 0.4)).toFixed(1)} ${(y2 - h * Math.sin(a - 0.4)).toFixed(1)}L${(x2 - h * Math.cos(a + 0.4)).toFixed(1)} ${(y2 - h * Math.sin(a + 0.4)).toFixed(1)}Z" fill="${c}"/>`;
  };
  /** Coordinate plane: maps (x, y) to the drawing box and draws a grid with axes and integer labels. */
  function plane(xmin, xmax, ymin, ymax, box = [24, 10, 336, 210], step = 1) {
    const [bx1, by1, bx2, by2] = box, X = (x) => bx1 + ((x - xmin) / (xmax - xmin)) * (bx2 - bx1), Y = (y) => by2 - ((y - ymin) / (ymax - ymin)) * (by2 - by1);
    let g = "";
    const xs = Math.max(step, Math.ceil((xmax - xmin) / 12)), ys = Math.max(step, Math.ceil((ymax - ymin) / 10));
    for (let x = Math.ceil(xmin / xs) * xs; x <= xmax; x += xs) g += L(X(x), by1, X(x), by2, "#E3E9F2", 1) + (x ? T(X(x), Y(0) + 13, fmt(x), { anchor: "middle", size: 9, fill: "#7A8699" }) : "");
    for (let y = Math.ceil(ymin / ys) * ys; y <= ymax; y += ys) g += L(bx1, Y(y), bx2, Y(y), "#E3E9F2", 1) + (y ? T(X(0) - 4, Y(y) + 3, fmt(y), { anchor: "end", size: 9, fill: "#7A8699" }) : "");
    if (ymin <= 0 && ymax >= 0) g += arrow(bx1, Y(0), bx2, Y(0), "#55657A", 1.5) + T(bx2 - 4, Y(0) - 6, "x", { size: 11, fill: "#55657A" });
    if (xmin <= 0 && xmax >= 0) g += arrow(X(0), by2, X(0), by1, "#55657A", 1.5) + T(X(0) + 6, by1 + 10, "y", { size: 11, fill: "#55657A" });
    if (xmin <= 0 && xmax >= 0 && ymin <= 0 && ymax >= 0) g += T(X(0) - 5, Y(0) + 12, "O", { anchor: "end", size: 10, fill: "#55657A" });
    return { X, Y, g, box };
  }
  /** Polyline of a function on the plane, split where it leaves the visible range. */
  function curve(pl, f, x1, x2, color, w = 2.5, ylim) {
    const [, by1, , by2] = pl.box, segs = [];
    let cur = [];
    for (let i = 0; i <= 160; i++) {
      const x = x1 + ((x2 - x1) * i) / 160, y = f(x), py = pl.Y(y);
      if (!isFinite(y) || py < by1 - 40 || py > by2 + 40 || (ylim && Math.abs(y) > ylim)) { if (cur.length > 1) segs.push(cur); cur = []; continue; }
      cur.push(`${pl.X(x).toFixed(1)},${py.toFixed(1)}`);
    }
    if (cur.length > 1) segs.push(cur);
    return segs.map((s) => `<polyline points="${s.join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round"/>`).join("");
  }
  /** Fit abstract points into the drawing box, keeping proportions; returns a mapping function. */
  function fit(pts, pad = 22, box = [0, 0, W, H]) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const s = Math.min((box[2] - box[0] - 2 * pad) / (maxx - minx || 1), (box[3] - box[1] - 2 * pad) / (maxy - miny || 1));
    const ox = box[0] + (box[2] - box[0] - (maxx - minx) * s) / 2, oy = box[1] + (box[3] - box[1] - (maxy - miny) * s) / 2;
    return (p) => [ox + (p[0] - minx) * s, oy + (maxy - p[1]) * s]; // abstract y up → screen y down
  }
  const ctl = (k, label, min, max, step, val, unit = "") => ({ k, label, min, max, step, val, unit });
  const BLUE = "#4F8FE8", ORANGE = "#FF9F43", GREEN = "#3FB66B", RED = "#E5533D", PURPLE = "#8B5CF6", WATER = "#BFE3FF";

  // ---------------- Teacher formulas: y = f(x) with slider parameters ----------------
  // A tiny parser (no eval: formulas come from class material). Numbers (1.5 or 1,5), x, one-letter parameters,
  // + − × ÷ ^ ² ³, brackets, |x|, √, sin cos tan (degrees, as in grade 9), sqrt abs ln log exp, π and e. "2ax" means 2·a·x.
  const FUNCS = { sqrt: Math.sqrt, abs: Math.abs, sin: (v) => Math.sin(rad(v)), cos: (v) => Math.cos(rad(v)), tan: (v) => Math.tan(rad(v)),
    ln: Math.log, log: Math.log10, exp: Math.exp };
  const NAMES = ["sqrt", "abs", "sin", "cos", "tan", "exp", "log", "ln", "pi"]; // longest first where prefixes clash
  function tokenize(src) {
    const s = String(src).replace(/[−–]/g, "-").replace(/[·×]/g, "*").replace(/[÷:]/g, "/").replace(/²/g, "^2").replace(/³/g, "^3").replace(/π/g, "pi");
    const out = [];
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const num = /^(\d+([.,]\d+)?|[.,]\d+)/.exec(s.slice(i));
      if (num) { out.push({ t: "n", v: parseFloat(num[0].replace(",", ".")) }); i += num[0].length; continue; }
      if (/[a-zA-Z]/.test(c)) {
        let id = /^[a-zA-Z]+/.exec(s.slice(i))[0];
        i += id.length;
        while (id) { // split "2ax" into a·x, but keep function names whole
          const name = NAMES.find((n) => id.startsWith(n));
          if (name) { out.push(name === "pi" ? { t: "n", v: Math.PI } : { t: "f", v: name }); id = id.slice(name.length); }
          else { out.push(id[0] === "e" ? { t: "n", v: Math.E } : { t: "v", v: id[0] }); id = id.slice(1); }
        }
        continue;
      }
      if ("+-*/^()|√".includes(c)) { out.push({ t: c }); i++; continue; }
      throw new Error(`Không hiểu kí tự “${c}”`);
    }
    return out;
  }
  /** Parse one expression → { f(env), vars } or throw an Error with a Vietnamese message. */
  function parseExpr(src) {
    if (String(src).length > 160) throw new Error("Công thức quá dài");
    const tk = tokenize(src), vars = new Set();
    let i = 0, depth = 0;
    const peek = () => tk[i], take = (t) => (tk[i] && tk[i].t === t ? tk[i++] : null);
    const starts = (x) => x && (x.t === "n" || x.t === "v" || x.t === "f" || x.t === "(" || x.t === "√");
    function expr() {
      if (++depth > 40) throw new Error("Công thức lồng quá sâu");
      let a = term();
      for (;;) {
        if (take("+")) { const l = a, r = term(); a = (e) => l(e) + r(e); }
        else if (take("-")) { const l = a, r = term(); a = (e) => l(e) - r(e); }
        else break;
      }
      depth--;
      return a;
    }
    function term() {
      let a = unary();
      for (;;) {
        if (take("*")) { const l = a, r = unary(); a = (e) => l(e) * r(e); }
        else if (take("/")) { const l = a, r = unary(); a = (e) => l(e) / r(e); }
        else if (starts(peek())) { const l = a, r = power(); a = (e) => l(e) * r(e); } // implicit: 2x, 3(x+1), x sin x
        else break;
      }
      return a;
    }
    function unary() {
      if (take("-")) { const a = unary(); return (e) => -a(e); }
      if (take("+")) return unary();
      return power();
    }
    function power() {
      const b = primary();
      if (take("^")) { const x = unary(); return (e) => Math.pow(b(e), x(e)); }
      return b;
    }
    function primary() {
      const x = tk[i++];
      if (!x) throw new Error("Công thức bị thiếu ở cuối");
      if (x.t === "n") return () => x.v;
      if (x.t === "v") { vars.add(x.v); return (e) => e[x.v]; }
      if (x.t === "f" || x.t === "√") { const fn = x.t === "√" ? Math.sqrt : FUNCS[x.v], a = power(); return (e) => fn(a(e)); }
      if (x.t === "(") { const a = expr(); if (!take(")")) throw new Error("Thiếu dấu “)”"); return a; }
      if (x.t === "|") { const a = expr(); if (!take("|")) throw new Error("Thiếu dấu “|” đóng giá trị tuyệt đối"); return (e) => Math.abs(a(e)); }
      throw new Error(`Thừa dấu “${x.t}”`);
    }
    if (!tk.length) throw new Error("Chưa nhập công thức");
    const f = expr();
    if (i < tk.length) throw new Error(`Thừa dấu “${tk[i].t === "n" ? tk[i].v : tk[i].v || tk[i].t}”`);
    return { f, vars };
  }
  /** "y = a*x^2; y = x + 1" → up to 3 expressions, each without its "y =". */
  const formulaParts = (src) => String(src || "").split(";").map((s) => s.replace(/^\s*y\s*=/i, "").trim()).filter(Boolean).slice(0, 3);
  /** Parameters a formula uses besides x (letters, in order of appearance). Throws on a bad formula. */
  function formulaVars(src) {
    const out = [];
    for (const part of formulaParts(src)) for (const v of parseExpr(part).vars) if (v !== "x" && !out.includes(v)) out.push(v);
    return out;
  }
  const niceStep = (span) => [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5, 10, 50, 100].find((s) => span / s <= 60) || Math.ceil(span / 60);
  const escT = (x) => String(x).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  function formulaDraw(p, s) {
    let parts;
    try {
      parts = formulaParts(p.expr).map((src) => ({ src, ...parseExpr(src) }));
      if (!parts.length) throw new Error("Chưa nhập công thức");
      const known = new Set(["x", ...(p.params || []).map((q) => q[0])]);
      for (const q of parts) for (const v of q.vars) if (!known.has(v)) throw new Error(`Chưa khai báo tham số ${v}`);
    } catch (err) {
      return { svg: svgw(T(180, 105, "Công thức chưa đúng", { anchor: "middle", bold: true, size: 14, fill: RED }) + T(180, 128, escT(err.message), { anchor: "middle", size: 12 })), info: `⚠️ ${escT(err.message)}`, error: err.message };
    }
    const [x1, x2] = p.x || [-6, 6], env = (x, st) => ({ ...st, x });
    let [y1, y2] = p.y || [NaN, NaN];
    if (!(y2 > y1)) { // automatic: fit the curves at the starting values, so the axes stay put while sliders move
      const st0 = Object.fromEntries((p.params || []).map((q) => [q[0], q[3]])), ys = [];
      for (const q of parts) for (let k = 0; k <= 120; k++) { const v = q.f(env(x1 + ((x2 - x1) * k) / 120, st0)); if (isFinite(v) && Math.abs(v) < 1e6) ys.push(v); }
      ys.sort((a, b) => a - b);
      const lo = ys.length ? ys[Math.floor(ys.length * 0.02)] : -1, hi = ys.length ? ys[Math.ceil(ys.length * 0.98) - 1] : 1, pad = (hi - lo) * 0.15 || 1;
      [y1, y2] = [lo - pad, hi + pad];
      const span = y2 - y1; // keep the x-axis in view when it is close
      if (y1 > 0 && y1 < span) y1 = -0.05 * span;
      if (y2 < 0 && -y2 < span) y2 = 0.05 * span;
    }
    const pl = plane(x1, x2, y1, y2), cols = [BLUE, ORANGE, GREEN];
    let g = pl.g;
    const fs = parts.map((q) => (x) => q.f(env(x, s)));
    fs.forEach((f, k) => { g += curve(pl, f, x1, x2, cols[k], 3); });
    // Points where a curve meets Ox (first curve) and where the first two curves meet: sign changes refined by bisection.
    const zeros = (f) => {
      const out = [];
      let px = x1, pv = f(px);
      for (let k = 1; k <= 400 && out.length < 4; k++) {
        const x = x1 + ((x2 - x1) * k) / 400, v = f(x);
        if (isFinite(pv) && isFinite(v) && Math.abs(v - pv) < (y2 - y1) && (pv === 0 || pv * v < 0)) {
          let a = px, b = x;
          for (let n = 0; n < 40; n++) { const m = (a + b) / 2; if (f(a) * f(m) <= 0) b = m; else a = m; }
          const r = pv === 0 ? px : (a + b) / 2;
          if (!out.length || Math.abs(out[out.length - 1] - r) > (x2 - x1) / 400) out.push(r);
        }
        px = x; pv = v;
      }
      return out;
    };
    const z = zeros(fs[0]);
    z.forEach((r) => { g += C(pl.X(r), pl.Y(0), 5, GREEN, "#fff", 1.5); });
    let meet = [];
    if (fs[1]) { meet = zeros((x) => fs[0](x) - fs[1](x)); meet.forEach((r) => { const v = fs[0](r); if (v >= y1 && v <= y2) g += C(pl.X(r), pl.Y(v), 6, RED, "#fff", 2); }); }
    const y0 = fs[0](0), vals = (p.params || []).map((q) => `${escT(q[0])} = ${fmt(s[q[0]])}`).join(", ");
    const pretty = (t) => t.replace(/\^2(?![\d.,])/g, "²").replace(/\^3(?![\d.,])/g, "³").replace(/\*/g, "·").replace(/-/g, "−");
    const lines = parts.map((q, k) => `<span style="color:${k === 1 ? "#C46A00" : cols[k]}"><b>y = ${escT(pretty(q.src))}</b></span>`).join(" · ");
    const info = `${lines}${vals ? ` với ${vals}` : ""}<br>${x1 <= 0 && x2 >= 0 && isFinite(y0) ? `cắt Oy tại (0; ${fmt(y0)})` : ""}${z.length ? `${x1 <= 0 && x2 >= 0 && isFinite(y0) ? " · " : ""}cắt Ox tại x ≈ ${z.map((r) => fmt(r)).join("; ")}` : ""}${fs[1] ? ` · ${meet.length ? `hai đồ thị cắt nhau tại x ≈ ${meet.map((r) => fmt(r)).join("; ")}` : "hai đồ thị không cắt nhau trong khung này"}` : ""}`;
    return { svg: svgw(g), info };
  }

  const VIZ = {
    // ---------------- MATH ----------------
    numberline: {
      ctrls: () => [ctl("x", "Điểm x", -5, 5, 0.25, 1.5)],
      draw: (p, s) => {
        const X = (v) => 180 + v * 32, y = 120;
        let g = arrow(14, y, 348, y, "#55657A", 2);
        for (let i = -5; i <= 5; i++) g += L(X(i), y - 7, X(i), y + 7, "#55657A", 2) + T(X(i), y + 24, fmt(i), { anchor: "middle", size: 11 });
        for (let i = -20; i <= 20; i++) if (i % 4) g += L(X(i / 4), y - 3, X(i / 4), y + 3, "#9AA6B8", 1);
        g += `<rect x="${Math.min(X(0), X(s.x)).toFixed(1)}" y="${y - 4}" width="${Math.abs(X(s.x) - X(0)).toFixed(1)}" height="8" rx="4" fill="${ORANGE}" opacity=".6"/>`;
        if (s.x) g += C(X(-s.x), y, 7, "#fff", "#9AA6B8", 2.5) + T(X(-s.x), y - 16, "−x", { anchor: "middle", size: 11, fill: "#7A8699" });
        g += C(X(s.x), y, 8, RED, "#fff", 2) + T(X(s.x), y - 18, `x = ${frac(s.x)}`, { anchor: "middle", size: 13, bold: true, fill: RED });
        g += T(180, 60, `|x| = ${frac(Math.abs(s.x))} (khoảng cách từ x đến 0)`, { anchor: "middle", size: 12, fill: "#B26A00" });
        return { svg: svgw(g), info: `x = <b>${frac(s.x)}</b> = ${fmt(s.x)} · số đối: <b>${frac(-s.x)}</b> · |x| = <b>${frac(Math.abs(s.x))}</b> · ${s.x > 0 ? "x dương (bên phải 0)" : s.x < 0 ? "x âm (bên trái 0)" : "x = 0"}` };
      },
    },
    angles: {
      ctrls: () => [ctl("a", "Góc", 20, 160, 5, 60, "°")],
      draw: (p, s) => {
        const a = s.a;
        if (p.mode === "parallel") {
          const y1 = 70, y2 = 155, dx = (y2 - y1) / 2 / Math.tan(rad(a)), A = [180 + dx, y1], B = [180 - dx, y2];
          let g = L(20, y1, 340, y1, BLUE, 3) + L(20, y2, 340, y2, BLUE, 3) + T(330, y1 - 8, "a", { size: 12, bold: true }) + T(330, y2 - 8, "b", { size: 12, bold: true });
          const [tx1, ty1] = pol(A[0], A[1], 70, a), [tx2, ty2] = pol(B[0], B[1], 70, a + 180);
          g += sector(A[0], A[1], 26, 0, a, "#FFD166", `${a}°`) + sector(B[0], B[1], 26, 0, a, "#FFD166", `${a}°`);
          g += sector(B[0], B[1], 22, a, 180, "#9BE7C4", `${180 - a}°`, 34) + sector(A[0], A[1], 22, 180, 180 + a, "#FFD166", `${a}°`, 36);
          g += L(tx1, ty1, tx2, ty2, "#22324A", 2.5) + C(A[0], A[1], 4, "#22324A") + C(B[0], B[1], 4, "#22324A") + T(A[0] + 8, A[1] - 6, "A", { bold: true }) + T(B[0] - 16, B[1] + 16, "B", { bold: true });
          return { svg: svgw(g), info: `a ∥ b: góc đồng vị bằng nhau (<b>${a}° = ${a}°</b>) · so le trong bằng nhau · hai góc trong cùng phía bù nhau: <b>${a}° + ${180 - a}° = 180°</b>` };
        }
        const cx = 180, cy = 110;
        let g = sector(cx, cy, 34, 0, a, "#FFD166", `Ô₁ = ${a}°`, 58) + sector(cx, cy, 34, 180, 180 + a, "#FFD166", `Ô₃ = ${a}°`, 58);
        g += sector(cx, cy, 26, a, 180, "#9BE7C4", `Ô₂ = ${180 - a}°`, 52) + sector(cx, cy, 26, 180 + a, 360, "#9BE7C4", `Ô₄`, 44);
        const [x1, y1] = pol(cx, cy, 150, a), [x2, y2] = pol(cx, cy, 150, a + 180);
        g += L(20, cy, 340, cy, "#22324A", 2.5) + L(x1, y1, x2, y2, "#22324A", 2.5) + C(cx, cy, 4, "#22324A") + T(cx + 6, cy + 16, "O", { bold: true });
        return { svg: svgw(g), info: `Đối đỉnh: Ô₁ = Ô₃ = <b>${a}°</b>, Ô₂ = Ô₄ = <b>${180 - a}°</b> · Kề bù: Ô₁ + Ô₂ = <b>180°</b>` };
      },
    },
    triangle: {
      ctrls: () => [ctl("B", "Góc B", 20, 120, 5, 60, "°"), ctl("C", "Góc C", 20, 120, 5, 50, "°")],
      draw: (p, s) => {
        const B = s.B, Cc = Math.min(s.C, 170 - B), A = 180 - B - Cc;
        // B = (0,0), C = (1,0); A from the sine rule.
        const c = Math.sin(rad(Cc)) / Math.sin(rad(A)), Ap = [c * Math.cos(rad(B)), c * Math.sin(rad(B))];
        const f = fit([[0, 0], [1.35, 0], Ap], 26), b = f([0, 0]), cc = f([1, 0]), a = f(Ap), ext = f([1.35, 0]);
        let g = P([a, b, cc], "#EAF3FF", BLUE, 2.5) + L(cc[0], cc[1], ext[0], ext[1], "#22324A", 2, "6 4");
        g += sector(b[0], b[1], 24, 0, B, "#FFD166", `${B}°`, 36) + sector(cc[0], cc[1], 24, 180 - Cc, 180, "#9BE7C4", `${Cc}°`, 36);
        g += vertexAngle(a, b, cc, 22, "#FFB3C7", `${A}°`, 34) + sector(cc[0], cc[1], 18, 0, 180 - Cc, "#D9C8FF", `${A + B}°`, 40);
        g += T(a[0], a[1] - 10, "A", { anchor: "middle", bold: true }) + T(b[0] - 12, b[1] + 6, "B", { bold: true }) + T(cc[0] - 4, cc[1] + 18, "C", { bold: true });
        const kind = A === 90 || B === 90 || Cc === 90 ? "tam giác vuông" : Math.max(A, B, Cc) > 90 ? "tam giác tù" : "tam giác nhọn";
        return { svg: svgw(g), info: `Â + B̂ + Ĉ = ${A}° + ${B}° + ${Cc}° = <b>180°</b> · góc ngoài tại C = Â + B̂ = <b>${A + B}°</b> · ${kind}` };
      },
    },
    pythagoras: {
      ctrls: () => [ctl("a", "Cạnh góc vuông a", 1, 8, 1, 3), ctl("b", "Cạnh góc vuông b", 1, 8, 1, 4)],
      draw: (p, s) => {
        const a = s.a, b = s.b, c = Math.hypot(a, b);
        const O = [0, 0], Bp = [b, 0], Ap = [0, a], n = [a / c, b / c]; // outward normal of the hypotenuse
        const sqA = [O, Ap, [-a, a], [-a, 0]], sqB = [O, Bp, [b, -b], [0, -b]], sqC = [Ap, Bp, [b + n[0] * c, n[1] * c], [n[0] * c, a + n[1] * c]];
        const f = fit([...sqA, ...sqB, ...sqC], 14), m = (q) => q.map(f);
        let g = P(m(sqA), "#FFE3A3", ORANGE, 2) + P(m(sqB), "#CDE6FF", BLUE, 2) + P(m(sqC), "#D6F5E3", GREEN, 2) + P(m([O, Bp, Ap]), "#fff", "#22324A", 2.5);
        const ctr = (q) => f([q.reduce((t, v) => t + v[0], 0) / 4, q.reduce((t, v) => t + v[1], 0) / 4]);
        const [xa, ya] = ctr(sqA), [xb, yb] = ctr(sqB), [xc, yc] = ctr(sqC);
        g += T(xa, ya + 4, `a² = ${a * a}`, { anchor: "middle", bold: true }) + T(xb, yb + 4, `b² = ${b * b}`, { anchor: "middle", bold: true }) + T(xc, yc + 4, `c² = ${a * a + b * b}`, { anchor: "middle", bold: true });
        const o = f(O); g += `<rect x="${o[0].toFixed(1)}" y="${(o[1] - 9).toFixed(1)}" width="9" height="9" fill="none" stroke="#22324A" stroke-width="1.5"/>`;
        return { svg: svgw(g), info: `a² + b² = ${a * a} + ${b * b} = <b>${a * a + b * b}</b> = c² ⇒ cạnh huyền c = ${Number.isInteger(c) ? `<b>${c}</b>` : `√${a * a + b * b} ≈ <b>${fmt(c)}</b>`}` };
      },
    },
    proportion: {
      ctrls: (p) => (p.kind === "inverse" ? [ctl("k", "Hệ số a", 1, 12, 1, 6)] : [ctl("k", "Hệ số k", -3, 3, 0.5, 2)]),
      draw: (p, s) => {
        const k = s.k;
        if (p.kind === "inverse") {
          const pl = plane(0, 8, 0, 12);
          let g = pl.g + curve(pl, (x) => k / x, 0.3, 8, PURPLE, 3, 12);
          [1, 2, 3, 4].forEach((x) => { if (k / x <= 12) g += C(pl.X(x), pl.Y(k / x), 4.5, RED, "#fff", 1.5); });
          return { svg: svgw(g), info: `y = ${k}/x · x·y = <b>${k}</b> (không đổi) · x tăng 2 lần thì y giảm 2 lần: ${[1, 2, 3, 4].map((x) => `(${x}; ${fmt(k / x)})`).join(" ")}` };
        }
        const pl = plane(-5, 5, -10, 10);
        let g = pl.g + curve(pl, (x) => k * x, -5, 5, BLUE, 3);
        [1, 2, 3].forEach((x) => { if (Math.abs(k * x) <= 10) g += C(pl.X(x), pl.Y(k * x), 4.5, RED, "#fff", 1.5); });
        return { svg: svgw(g), info: `y = ${fmt(k)}x · y/x = <b>${fmt(k)}</b> (không đổi) · x tăng 2 lần thì y tăng 2 lần: ${[1, 2, 3].map((x) => `(${x}; ${fmt(k * x)})`).join(" ")}` };
      },
    },
    linear: {
      ctrls: () => [ctl("a", "Hệ số a", -3, 3, 0.5, 1), ctl("b", "Hệ số b", -4, 4, 0.5, 2)],
      draw: (p, s) => {
        const pl = plane(-6, 6, -6, 6), { a, b } = s;
        let g = pl.g + curve(pl, (x) => a * x + b, -6, 6, BLUE, 3) + C(pl.X(0), pl.Y(b), 5, RED, "#fff", 1.5);
        if (a) g += C(pl.X(-b / a), pl.Y(0), 5, GREEN, "#fff", 1.5);
        const trend = a > 0 ? "đồng biến (đi lên)" : a < 0 ? "nghịch biến (đi xuống)" : "hàm hằng (nằm ngang)";
        return { svg: svgw(g), info: `y = ${fmt(a)}x ${b < 0 ? "−" : "+"} ${fmt(Math.abs(b))} · cắt Oy tại (0; ${fmt(b)})${a ? ` · cắt Ox tại (${fmt(-b / a)}; 0)` : ""} · a = ${fmt(a)} ⇒ ${trend}` };
      },
    },
    system: {
      ctrls: () => [ctl("a1", "a₁", -3, 3, 0.5, 1), ctl("b1", "b₁", -4, 4, 0.5, 1), ctl("a2", "a₂", -3, 3, 0.5, -1), ctl("b2", "b₂", -4, 4, 0.5, 3)],
      draw: (p, s) => {
        const pl = plane(-6, 6, -6, 6);
        let g = pl.g + curve(pl, (x) => s.a1 * x + s.b1, -6, 6, BLUE, 3) + curve(pl, (x) => s.a2 * x + s.b2, -6, 6, ORANGE, 3);
        let info;
        if (s.a1 === s.a2) info = s.b1 === s.b2 ? "Hai đường thẳng trùng nhau ⇒ hệ có <b>vô số nghiệm</b>" : "Hai đường thẳng song song ⇒ hệ <b>vô nghiệm</b>";
        else {
          const x = (s.b2 - s.b1) / (s.a1 - s.a2), y = s.a1 * x + s.b1;
          if (Math.abs(x) <= 6 && Math.abs(y) <= 6) g += C(pl.X(x), pl.Y(y), 6, RED, "#fff", 2);
          info = `Hai đường thẳng cắt nhau tại (${fmt(x)}; ${fmt(y)}) ⇒ nghiệm duy nhất <b>x = ${fmt(x)}, y = ${fmt(y)}</b>`;
        }
        return { svg: svgw(g), info: `<span style="color:${BLUE}">y = ${fmt(s.a1)}x + ${fmt(s.b1)}</span> · <span style="color:#C46A00">y = ${fmt(s.a2)}x + ${fmt(s.b2)}</span><br>${info}` };
      },
    },
    parabola: {
      ctrls: (p) => (p.mode === "quadratic" ? [ctl("b", "Hệ số b", -6, 6, 0.5, -2), ctl("c", "Hệ số c", -6, 6, 0.5, -3)] : [ctl("a", "Hệ số a", -3, 3, 0.25, 1)]),
      draw: (p, s) => {
        if (p.mode === "quadratic") {
          const pl = plane(-6, 6, -8, 8), { b, c } = s, D = b * b - 4 * c;
          let g = pl.g + curve(pl, (x) => x * x + b * x + c, -6, 6, PURPLE, 3);
          let roots = "vô nghiệm (parabol không cắt Ox)";
          if (D === 0) { roots = `nghiệm kép x = ${fmt(-b / 2)}`; g += C(pl.X(-b / 2), pl.Y(0), 6, RED, "#fff", 2); }
          else if (D > 0) {
            const r1 = (-b - Math.sqrt(D)) / 2, r2 = (-b + Math.sqrt(D)) / 2;
            roots = `hai nghiệm x₁ ≈ ${fmt(r1)}, x₂ ≈ ${fmt(r2)}`;
            [r1, r2].forEach((r) => { if (Math.abs(r) <= 6) g += C(pl.X(r), pl.Y(0), 6, RED, "#fff", 2); });
          }
          return { svg: svgw(g), info: `x² ${b < 0 ? "−" : "+"} ${fmt(Math.abs(b))}x ${c < 0 ? "−" : "+"} ${fmt(Math.abs(c))} = 0 · Δ = b² − 4ac = <b>${fmt(D)}</b> ${D > 0 ? "> 0" : D < 0 ? "< 0" : "= 0"} ⇒ ${roots}` };
        }
        const a = s.a || 0.25, pl = plane(-4, 4, -8, 8);
        let g = pl.g + curve(pl, (x) => a * x * x, -4, 4, PURPLE, 3) + C(pl.X(0), pl.Y(0), 5, RED, "#fff", 1.5);
        [-2, 2].forEach((x) => { if (Math.abs(a * x * x) <= 8) g += C(pl.X(x), pl.Y(a * x * x), 4, ORANGE, "#fff", 1.5); });
        return { svg: svgw(g), info: `y = ${fmt(a)}x² · a ${a > 0 ? "> 0: parabol quay lên, đỉnh O thấp nhất" : "< 0: parabol quay xuống, đỉnh O cao nhất"} · đối xứng qua Oy: x = ±2 ⇒ y = ${fmt(4 * a)}` };
      },
    },
    identity: {
      ctrls: () => [ctl("a", "a", 1, 6, 1, 3), ctl("b", "b", 1, 6, 1, 2)],
      draw: (p, s) => {
        const { a, b } = s, u = 180 / (a + b), x0 = 90, y0 = 20;
        const R = (x, y, w, h, fill, lab) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" stroke="#22324A" stroke-width="2"/>` + T(x + w / 2, y + h / 2 + 4, lab, { anchor: "middle", bold: true, size: 13 });
        let g = R(x0, y0, a * u, a * u, "#FFE3A3", `a² = ${a * a}`) + R(x0 + a * u, y0, b * u, a * u, "#CDE6FF", `ab`) + R(x0, y0 + a * u, a * u, b * u, "#CDE6FF", `ab`) + R(x0 + a * u, y0 + a * u, b * u, b * u, "#D6F5E3", `b²`);
        g += T(x0 + (a * u) / 2, 14, "a", { anchor: "middle", bold: true }) + T(x0 + a * u + (b * u) / 2, 14, "b", { anchor: "middle", bold: true }) + T(x0 - 10, y0 + (a * u) / 2, "a", { bold: true }) + T(x0 - 10, y0 + a * u + (b * u) / 2, "b", { bold: true });
        return { svg: svgw(g), info: `(a + b)² = a² + 2ab + b²: (${a} + ${b})² = ${a * a} + 2·${a * b} + ${b * b} = <b>${(a + b) ** 2}</b>` };
      },
    },
    thales: {
      ctrls: () => [ctl("t", "Vị trí MN (tỉ số AM/AB)", 0.1, 0.9, 0.05, 0.5)],
      draw: (p, s) => {
        const A = [150, 20], B = [40, 200], Cc = [320, 200], t = s.t, M = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], N = [A[0] + (Cc[0] - A[0]) * t, A[1] + (Cc[1] - A[1]) * t];
        let g = P([A, M, N], "#FFE9B8", "none", 0) + P([A, B, Cc], "none", BLUE, 2.5) + L(M[0], M[1], N[0], N[1], RED, 3);
        g += T(A[0], A[1] - 6, "A", { anchor: "middle", bold: true }) + T(B[0] - 14, B[1] + 4, "B", { bold: true }) + T(Cc[0] + 6, Cc[1] + 4, "C", { bold: true }) + T(M[0] - 16, M[1] + 4, "M", { bold: true, fill: RED }) + T(N[0] + 6, N[1] + 4, "N", { bold: true, fill: RED });
        const AB = 6, AC = 9, BC = 10;
        return { svg: svgw(g), info: `MN ∥ BC ⇒ AM/AB = AN/AC = MN/BC = <b>${fmt(t)}</b> · ví dụ AB = ${AB}, AC = ${AC}, BC = ${BC} ⇒ AM = ${fmt(AB * t)}, AN = ${fmt(AC * t)}, MN = ${fmt(BC * t)} · △AMN ∽ △ABC` };
      },
    },
    trig: {
      ctrls: () => [ctl("al", "Góc α", 5, 85, 1, 30, "°")],
      draw: (p, s) => {
        const al = s.al, c = 1, ad = Math.cos(rad(al)), op = Math.sin(rad(al));
        const f = fit([[0, 0], [ad, 0], [ad, op]], 30), A = f([0, 0]), Bp = f([ad, 0]), Cp = f([ad, op]);
        let g = P([A, Bp, Cp], "#EAF3FF", "#22324A", 2.5) + sector(A[0], A[1], 30, 0, al, "#FFD166", `α`, 42);
        g += L(A[0], A[1], Cp[0], Cp[1], PURPLE, 4) + L(Bp[0], Bp[1], Cp[0], Cp[1], RED, 4) + L(A[0], A[1], Bp[0], Bp[1], BLUE, 4);
        g += `<rect x="${(Bp[0] - 10).toFixed(1)}" y="${(Bp[1] - 10).toFixed(1)}" width="10" height="10" fill="none" stroke="#22324A" stroke-width="1.5"/>`;
        g += T((A[0] + Cp[0]) / 2 - 18, (A[1] + Cp[1]) / 2 - 6, "huyền", { fill: PURPLE, bold: true }) + T(Bp[0] + 6, (Bp[1] + Cp[1]) / 2, "đối", { fill: RED, bold: true }) + T((A[0] + Bp[0]) / 2, A[1] + 16, "kề", { anchor: "middle", fill: BLUE, bold: true });
        void c;
        return { svg: svgw(g), info: `α = ${al}° · sin α = đối/huyền ≈ <b>${fmt(op, 3)}</b> · cos α = kề/huyền ≈ <b>${fmt(ad, 3)}</b> · tan α = đối/kề ≈ <b>${fmt(op / ad, 3)}</b> · cot α ≈ <b>${fmt(ad / op, 3)}</b>` };
      },
    },
    circle: {
      ctrls: (p) => (p.mode === "arc" ? [ctl("R", "Bán kính R (cm)", 1, 6, 0.5, 3), ctl("n", "Số đo cung n", 10, 360, 10, 90, "°")]
        : [ctl("n", "Số đo cung AB", 40, 160, 5, 100, "°"), ctl("m", "Vị trí điểm M", 20, 160, 5, 90)]),
      draw: (p, s) => {
        const cx = 180, cy = 112, r = 88;
        if (p.mode === "arc") {
          const { R, n } = s;
          let g = C(cx, cy, r, "#F4F8FF", "#22324A", 2) + (n >= 360 ? C(cx, cy, r, "#FFD166") : sector(cx, cy, r, 90, 90 + n, "#FFD166")) + C(cx, cy, 4, "#22324A") + T(cx + 6, cy + 14, "O", { bold: true });
          const [ex, ey] = pol(cx, cy, r, 90 + n);
          g += L(cx, cy, cx, cy - r, RED, 2.5) + L(cx, cy, ex, ey, RED, 2.5) + T(cx + 6, cy - r / 2, "R", { fill: RED, bold: true });
          return { svg: svgw(g), info: `C = 2πR ≈ <b>${fmt(2 * Math.PI * R)} cm</b> · cung n° dài l = πRn/180 ≈ <b>${fmt((Math.PI * R * n) / 180)} cm</b> · hình quạt S = πR²n/360 ≈ <b>${fmt((Math.PI * R * R * n) / 360)} cm²</b>` };
        }
        const { n, m } = s, a1 = 270 - n / 2, a2 = 270 + n / 2, A = pol(cx, cy, r, a1), B = pol(cx, cy, r, a2), M = pol(cx, cy, r, 90 + (m - 90) * ((180 - n / 2 - 10) / 90));
        let g = C(cx, cy, r, "#F4F8FF", "#22324A", 2) + sector(cx, cy, 26, a1, a2, "#FFD166", `${n}°`, 40);
        g += vertexAngle(M, A, B, 26, "#9BE7C4", `${fmt(n / 2, 1)}°`, 40);
        g += L(cx, cy, A[0], A[1], ORANGE, 2.5) + L(cx, cy, B[0], B[1], ORANGE, 2.5) + L(M[0], M[1], A[0], A[1], GREEN, 2.5) + L(M[0], M[1], B[0], B[1], GREEN, 2.5);
        g += [[A, "A"], [B, "B"], [M, "M"]].map(([q, t]) => C(q[0], q[1], 4, "#22324A") + T(q[0] + (q[0] < cx ? -14 : 6), q[1] + (q[1] > cy ? 14 : -4), t, { bold: true })).join("") + C(cx, cy, 4, "#22324A") + T(cx + 6, cy - 6, "O", { bold: true });
        return { svg: svgw(g), info: `Góc ở tâm AOB = <b>${n}°</b> (= số đo cung AB) · góc nội tiếp AMB = <b>${fmt(n / 2, 1)}°</b> = ½ góc ở tâm — M chạy trên cung lớn, góc vẫn không đổi` };
      },
    },
    polygon: {
      ctrls: () => [ctl("n", "Số cạnh n", 3, 12, 1, 6)],
      draw: (p, s) => {
        const n = s.n, cx = 180, cy = 112, r = 92, pts = Array.from({ length: n }, (_, i) => pol(cx, cy, r, 90 + (360 * i) / n));
        let g = P(pts, "#EAF3FF", BLUE, 2.5);
        const inner = ((n - 2) * 180) / n;
        g += vertexAngle(pts[0], pts[1], pts[n - 1], 22, "#FFD166", `${fmt(inner, 1)}°`, 36);
        g += pts.map((q) => C(q[0], q[1], 3.5, "#22324A")).join("") + T(cx, cy + 4, `${n} cạnh`, { anchor: "middle", bold: true, size: 14 });
        return { svg: svgw(g), info: `Tổng các góc trong = (n − 2)·180° = <b>${(n - 2) * 180}°</b>${n > 3 ? "" : ""} · mỗi góc của đa giác đều = <b>${fmt(inner, 1)}°</b>` };
      },
    },
    solid: {
      ctrls: (p) => ({
        cuboid: [ctl("a", "Dài a", 1, 6, 1, 4), ctl("b", "Rộng b", 1, 6, 1, 3), ctl("c", "Cao c", 1, 6, 1, 2)],
        prism: [ctl("a", "Cạnh góc vuông a", 1, 6, 1, 3), ctl("b", "Cạnh góc vuông b", 1, 6, 1, 4), ctl("h", "Chiều cao h", 1, 8, 1, 5)],
        cylinder: [ctl("r", "Bán kính r", 1, 5, 0.5, 2), ctl("h", "Chiều cao h", 1, 8, 0.5, 5)],
        cone: [ctl("r", "Bán kính r", 1, 5, 0.5, 3), ctl("h", "Chiều cao h", 1, 8, 0.5, 4)],
        sphere: [ctl("R", "Bán kính R", 1, 6, 0.5, 3)],
      }[p.shape] || []),
      draw: (p, s) => {
        const pi = Math.PI;
        let g = "", info = "";
        if (p.shape === "cuboid" || p.shape === "prism") {
          const k = 24, dx = 0.55, dy = 0.4;
          const base = p.shape === "cuboid" ? [[0, 0], [s.a, 0], [s.a, s.b], [0, s.b]] : [[0, 0], [s.b, 0], [0, s.a]];
          const H = p.shape === "cuboid" ? s.c : s.h;
          const proj = ([x, z], y) => [100 + (x + z * dx) * k, 190 - (y + z * dy) * k];
          const bot = base.map((q) => proj(q, 0)), top = base.map((q) => proj(q, H));
          g += P(bot, "#DCEBFF", BLUE, 1.5, ' stroke-dasharray="5 4"');
          base.forEach((q, i) => { g += L(bot[i][0], bot[i][1], top[i][0], top[i][1], BLUE, 2, i === base.length - 1 && p.shape === "cuboid" ? "5 4" : null); });
          g += P(top, "#BFDCFF", BLUE, 2);
          if (p.shape === "cuboid") {
            const V = s.a * s.b * s.c;
            info = `V = a·b·c = ${s.a}·${s.b}·${s.c} = <b>${V}</b> (đơn vị³) · S xung quanh = 2(a + b)·c = <b>${2 * (s.a + s.b) * s.c}</b> · S toàn phần = <b>${2 * (s.a * s.b + s.b * s.c + s.a * s.c)}</b>`;
          } else {
            const hyp = Math.hypot(s.a, s.b), Sd = (s.a * s.b) / 2;
            info = `Đáy là tam giác vuông: S đáy = ${fmt(Sd)} · V = S đáy·h = <b>${fmt(Sd * s.h)}</b> · S xung quanh = chu vi đáy·h = (${s.a} + ${s.b} + ${fmt(hyp)})·${s.h} ≈ <b>${fmt((s.a + s.b + hyp) * s.h)}</b>`;
          }
        } else if (p.shape === "sphere") {
          const r = 18 * s.R;
          g += C(180, 112, r, "#DCEBFF", BLUE, 2.5) + `<ellipse cx="180" cy="112" rx="${r}" ry="${(r * 0.3).toFixed(1)}" fill="none" stroke="${BLUE}" stroke-width="1.5" stroke-dasharray="5 4"/>` + L(180, 112, 180 + r, 112, RED, 2.5) + T(180 + r / 2, 106, "R", { anchor: "middle", fill: RED, bold: true });
          info = `S mặt cầu = 4πR² ≈ <b>${fmt(4 * pi * s.R ** 2)}</b> · V = (4/3)πR³ ≈ <b>${fmt((4 / 3) * pi * s.R ** 3)}</b>`;
        } else {
          const r = 22 * s.r, hh = 20 * s.h, cx = 180, by = 200, ty = by - hh, ry = r * 0.28;
          g += `<ellipse cx="${cx}" cy="${by}" rx="${r}" ry="${ry.toFixed(1)}" fill="#DCEBFF" stroke="${BLUE}" stroke-width="2"/>`;
          if (p.shape === "cylinder") {
            g += `<rect x="${cx - r}" y="${ty}" width="${2 * r}" height="${hh}" fill="#DCEBFF"/>` + L(cx - r, ty, cx - r, by, BLUE, 2) + L(cx + r, ty, cx + r, by, BLUE, 2);
            g += `<ellipse cx="${cx}" cy="${ty}" rx="${r}" ry="${ry.toFixed(1)}" fill="#BFDCFF" stroke="${BLUE}" stroke-width="2"/>`;
            info = `S xung quanh = 2πrh ≈ <b>${fmt(2 * pi * s.r * s.h)}</b> · V = πr²h ≈ <b>${fmt(pi * s.r ** 2 * s.h)}</b>`;
          } else {
            const l = Math.hypot(s.r, s.h);
            g += P([[cx - r, by], [cx, ty], [cx + r, by]], "#DCEBFF", BLUE, 2) + L(cx, ty, cx, by, "#7A8699", 1.5, "5 4");
            g += T(cx + r / 2 + 8, (ty + by) / 2, `l ≈ ${fmt(l)}`, { fill: PURPLE, bold: true });
            info = `Đường sinh l = √(r² + h²) ≈ ${fmt(l)} · S xung quanh = πrl ≈ <b>${fmt(pi * s.r * l)}</b> · V = (1/3)πr²h ≈ <b>${fmt((pi * s.r ** 2 * s.h) / 3)}</b>`;
          }
          g += L(cx, by, cx + r, by, RED, 2.5) + T(cx + r / 2, by - 6, "r", { anchor: "middle", fill: RED, bold: true }) + T(cx - r - 14, (ty + by) / 2, "h", { bold: true });
        }
        return { svg: svgw(g), info };
      },
    },
    chart: {
      ctrls: () => [],
      draw: (p) => {
        // Titles and labels can come from a teacher's class material: escape them.
        const e = (x) => String(x).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
        const d = (p.data || []).map(([l, v]) => [e(l), v]), cols = [BLUE, ORANGE, GREEN, PURPLE, RED, "#14B8A6", "#F59E0B"];
        let g = T(180, 16, e(p.title || ""), { anchor: "middle", bold: true, size: 13 });
        if (p.kind === "pie") {
          const tot = d.reduce((t, x) => t + x[1], 0) || 1;
          let a = 90;
          d.forEach(([lab, v], i) => {
            const span = (v / tot) * 360;
            g += span >= 359.9 ? C(120, 118, 80, cols[i % 7]) : sector(120, 118, 80, a, a + span, cols[i % 7]);
            g += `<rect x="226" y="${40 + i * 22}" width="12" height="12" rx="3" fill="${cols[i % 7]}"/>` + T(244, 51 + i * 22, `${lab}: ${fmt((v / tot) * 100, 1)}%`, { size: 11 });
            a += span;
          });
          return { svg: svgw(g), info: `Biểu đồ hình quạt tròn: cả hình tròn là 100% · ${d.map(([l, v]) => `${l} ${fmt((v / tot) * 100, 1)}%`).join(" · ")}` };
        }
        const max = Math.max(...d.map((x) => x[1]), 1), pl = plane(0, d.length, 0, max * 1.15, [40, 30, 340, 196]);
        g += pl.g;
        if (p.kind === "line") {
          g += `<polyline points="${d.map(([, v], i) => `${pl.X(i + 0.5).toFixed(1)},${pl.Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${BLUE}" stroke-width="3"/>`;
          d.forEach(([lab, v], i) => { g += C(pl.X(i + 0.5), pl.Y(v), 4.5, RED, "#fff", 1.5) + T(pl.X(i + 0.5), 212, lab, { anchor: "middle", size: 10 }) + T(pl.X(i + 0.5), pl.Y(v) - 8, fmt(v), { anchor: "middle", size: 10, bold: true }); });
        } else {
          d.forEach(([lab, v], i) => {
            const x = pl.X(i + 0.2), w = pl.X(i + 0.8) - x;
            g += `<rect x="${x.toFixed(1)}" y="${pl.Y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${(pl.Y(0) - pl.Y(v)).toFixed(1)}" rx="3" fill="${cols[i % 7]}"/>` + T(x + w / 2, 212, lab, { anchor: "middle", size: 10 }) + T(x + w / 2, pl.Y(v) - 5, fmt(v), { anchor: "middle", size: 10, bold: true });
          });
        }
        const top = d.reduce((m, x) => (x[1] > m[1] ? x : m), d[0] || ["", 0]);
        return { svg: svgw(g), info: `${p.kind === "line" ? "Biểu đồ đoạn thẳng: thấy xu hướng tăng/giảm" : "Biểu đồ cột: so sánh các nhóm"} · lớn nhất: <b>${top[0]} (${fmt(top[1])})</b> · tổng ${fmt(d.reduce((t, x) => t + x[1], 0))}` };
      },
    },
    formula: {
      // p: { expr: "a*x^2 + b; x + 1", params: [[name, min, max, start]], x: [min, max], y?: [min, max] }
      ctrls: (p) => (p.params || []).map(([k, lo, hi, v]) => ctl(k, `Tham số ${k}`, lo, hi, niceStep(hi - lo), v)),
      draw: formulaDraw,
    },
    dice: {
      ctrls: () => [ctl("n", "Số lần gieo", 10, 1000, 10, 60)],
      draw: (p, s) => {
        let seed = 12345;
        const cnt = [0, 0, 0, 0, 0, 0];
        for (let i = 0; i < s.n; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; cnt[Math.floor((seed / 2147483648) * 6)]++; }
        const pl = plane(0, 6, 0, 0.4, [40, 20, 340, 192], 0.1);
        let g = pl.g + L(pl.X(0), pl.Y(1 / 6), pl.X(6), pl.Y(1 / 6), RED, 2, "6 4") + T(pl.X(6) - 2, pl.Y(1 / 6) - 6, "1/6", { anchor: "end", fill: RED, bold: true });
        cnt.forEach((c, i) => {
          const x = pl.X(i + 0.2), w = pl.X(i + 0.8) - x, f = c / s.n;
          g += `<rect x="${x.toFixed(1)}" y="${pl.Y(f).toFixed(1)}" width="${w.toFixed(1)}" height="${(pl.Y(0) - pl.Y(f)).toFixed(1)}" rx="3" fill="${BLUE}"/>` + T(x + w / 2, 210, `⚀⚁⚂⚃⚄⚅`[i], { anchor: "middle", size: 16 }) + T(x + w / 2, pl.Y(f) - 4, fmt(f, 2), { anchor: "middle", size: 9, bold: true });
        });
        return { svg: svgw(g), info: `Gieo ${s.n} lần: mặt 6 xuất hiện ${cnt[5]} lần ⇒ xác suất thực nghiệm ${cnt[5]}/${s.n} ≈ <b>${fmt(cnt[5] / s.n, 3)}</b> · lý thuyết 1/6 ≈ <b>0,167</b> — gieo càng nhiều càng gần 1/6` };
      },
    },

    // ---------------- PHYSICS ----------------
    motion: {
      ctrls: () => [ctl("v", "Tốc độ v (m/s)", 1, 30, 1, 10, " m/s"), ctl("t", "Thời gian t (s)", 0, 10, 0.5, 4, " s")],
      draw: (p, s) => {
        const S = s.v * s.t, X = (d) => 20 + (d / 300) * 320;
        let g = `<rect x="10" y="22" width="340" height="44" rx="8" fill="#5B6472"/>` + L(14, 44, 346, 44, "#fff", 2, "12 10");
        for (let d = 0; d <= 300; d += 50) g += L(X(d), 66, X(d), 74, "#55657A", 2) + T(X(d), 86, `${d} m`, { anchor: "middle", size: 9, fill: "#55657A" });
        const cx = X(Math.min(S, 300));
        g += `<g transform="translate(${(cx - 18).toFixed(1)},28)"><rect width="36" height="18" rx="5" fill="${RED}"/><rect x="22" y="3" width="10" height="12" rx="2" fill="#BFE6FF"/></g>`;
        const pl = plane(0, 10, 0, 300, [44, 98, 340, 206]);
        g += pl.g + curve(pl, (t) => s.v * t, 0, 10, BLUE, 2.5) + C(pl.X(s.t), pl.Y(Math.min(S, 300)), 5, RED, "#fff", 1.5) + T(48, 108, "s (m)", { size: 10, fill: "#55657A" }) + T(336, 200, "t (s)", { anchor: "end", size: 10, fill: "#55657A" });
        return { svg: svgw(g), info: `s = v·t = ${s.v}·${fmt(s.t)} = <b>${fmt(S)} m</b>${S > 300 ? " (xe đã ra khỏi đoạn đường vẽ)" : ""} · v = ${s.v} m/s = <b>${fmt(s.v * 3.6, 1)} km/h</b> · đồ thị s–t là đường thẳng: càng dốc ⇒ càng nhanh` };
      },
    },
    sound: {
      ctrls: () => [ctl("f", "Tần số f (Hz)", 100, 1000, 50, 300, " Hz"), ctl("A", "Biên độ", 1, 10, 1, 5)],
      draw: (p, s) => {
        const cyc = s.f / 100, amp = s.A * 8, pts = [];
        for (let i = 0; i <= 240; i++) { const x = 80 + i * 1.1; pts.push(`${x.toFixed(1)},${(112 - amp * Math.sin((i / 240) * cyc * 2 * Math.PI)).toFixed(1)}`); }
        let g = `<path d="M20 92h22l26-24v88l-26-24H20z" fill="#55657A"/>` + L(80, 112, 348, 112, "#C8D1DE", 1.5, "4 4");
        g += `<polyline points="${pts.join(" ")}" fill="none" stroke="${PURPLE}" stroke-width="3"/>` + L(70, 112 - amp, 76, 112 - amp, ORANGE, 2) + L(73, 112, 73, 112 - amp, ORANGE, 2) + T(64, 112 - amp / 2, "A", { anchor: "end", fill: ORANGE, bold: true });
        const pitch = s.f >= 600 ? "âm cao (thanh)" : s.f <= 250 ? "âm thấp (trầm)" : "âm trung bình", loud = s.A >= 7 ? "âm to" : s.A <= 3 ? "âm nhỏ" : "âm vừa";
        return { svg: svgw(g), info: `f = <b>${s.f} Hz</b> = ${s.f} dao động/giây ⇒ ${pitch} · biên độ ${s.A} ⇒ ${loud} · tai người nghe được 20 Hz – 20 000 Hz` };
      },
    },
    reflection: {
      ctrls: () => [ctl("i", "Góc tới i", 0, 85, 5, 40, "°")],
      draw: (p, s) => {
        const I = [180, 180], len = 150, S = pol(I[0], I[1], len, 90 + s.i), R = pol(I[0], I[1], len, 90 - s.i);
        let g = `<rect x="30" y="180" width="300" height="10" fill="#9DB7D5"/>` + Array.from({ length: 20 }, (_, k) => L(36 + k * 15, 190, 30 + k * 15, 200, "#9DB7D5", 2)).join("");
        g += L(180, 180, 180, 30, "#7A8699", 1.5, "6 5") + T(186, 40, "N (pháp tuyến)", { size: 10, fill: "#7A8699" });
        g += sector(180, 180, 40, 90, 90 + s.i, "#FFD166", `i = ${s.i}°`, 58) + sector(180, 180, 34, 90 - s.i, 90, "#9BE7C4", `i' = ${s.i}°`, 58);
        g += arrow(S[0], S[1], 180, 180, RED, 3) + arrow(180, 180, R[0], R[1], ORANGE, 3) + T(S[0], S[1] - 6, "S (tia tới)", { anchor: "middle", size: 11, fill: RED, bold: true }) + T(R[0], R[1] - 6, "R (tia phản xạ)", { anchor: "middle", size: 11, fill: "#C46A00", bold: true });
        return { svg: svgw(g), info: `Định luật phản xạ: tia phản xạ nằm trong mặt phẳng tới, <b>góc phản xạ i' = góc tới i = ${s.i}°</b>${s.i === 0 ? " · chiếu vuông góc thì tia phản xạ quay ngược lại" : ""}` };
      },
    },
    refraction: {
      ctrls: () => [ctl("i", "Góc tới i (không khí → nước)", 0, 85, 5, 45, "°")],
      draw: (p, s) => {
        const n = 1.33, r = deg(Math.asin(Math.sin(rad(s.i)) / n)), I = [180, 110];
        let g = `<rect x="0" y="110" width="${W}" height="110" fill="${WATER}"/>` + T(14, 26, "Không khí (n ≈ 1)", { size: 11, fill: "#55657A" }) + T(14, 206, "Nước (n ≈ 1,33)", { size: 11, fill: "#1F5F99" });
        g += L(180, 14, 180, 206, "#7A8699", 1.5, "6 5");
        const S = pol(180, 110, 110, 90 + s.i), R = pol(180, 110, 110, 270 + r), Rf = pol(180, 110, 70, 90 - s.i);
        g += sector(180, 110, 36, 90, 90 + s.i, "#FFD166", `i = ${s.i}°`, 54) + sector(180, 110, 36, 270, 270 + r, "#9BE7C4", `r ≈ ${fmt(r, 1)}°`, 56);
        g += arrow(S[0], S[1], I[0], I[1], RED, 3) + arrow(I[0], I[1], R[0], R[1], RED, 3) + `<g opacity=".35">${arrow(I[0], I[1], Rf[0], Rf[1], RED, 2)}</g>`;
        return { svg: svgw(g), info: `Ánh sáng đi từ không khí vào nước bị <b>gãy khúc</b> tại mặt phân cách: góc khúc xạ r ≈ <b>${fmt(r, 1)}°</b> ${s.i ? "< góc tới i (tia lệch gần pháp tuyến)" : "= 0 (chiếu vuông góc thì truyền thẳng)"} · sin i = n·sin r` };
      },
    },
    lens: {
      ctrls: () => [ctl("d", "Khoảng cách vật d (cm)", 2, 40, 1, 25, " cm")],
      draw: (p, s) => {
        const f = 10, k = 4, cx = 180, ay = 120, h = 34, d = s.d, conv = p.kind !== "diverging";
        const X = (cm) => cx + cm * k, objX = X(-d);
        let g = L(4, ay, 356, ay, "#7A8699", 1.5);
        g += conv ? `<path d="M${cx} 22Q${cx + 16} ${ay} ${cx} 218Q${cx - 16} ${ay} ${cx} 22Z" fill="#CFEAFF" stroke="${BLUE}" stroke-width="2"/>` : `<path d="M${cx - 9} 22h18Q${cx + 2} ${ay} ${cx + 9} 218h-18Q${cx - 2} ${ay} ${cx - 9} 22Z" fill="#CFEAFF" stroke="${BLUE}" stroke-width="2"/>`;
        g += [[-f, "F"], [f, "F'"]].map(([c, t]) => C(X(c), ay, 3.5, "#22324A") + T(X(c), ay + 15, t, { anchor: "middle", size: 11, bold: true })).join("") + C(cx, ay, 3, "#22324A") + T(cx + 5, ay + 15, "O", { size: 11, bold: true });
        g += arrow(objX, ay, objX, ay - h, GREEN, 3.5) + T(objX, ay - h - 6, "AB", { anchor: "middle", size: 11, fill: GREEN, bold: true });
        let info;
        if (conv && d === f) {
          g += L(objX, ay - h, cx, ay - h, RED, 2) + L(cx, ay - h, 356, ay - h + ((356 - cx) * h) / (f * k), RED, 2) + L(objX, ay - h, 356, ay - h + ((356 - objX) * h) / (d * k), RED, 2);
          info = "Vật đặt tại tiêu điểm F: các tia ló song song ⇒ <b>không cho ảnh</b>";
        } else {
          const dp = conv ? (d * f) / (d - f) : -(d * f) / (d + f), hp = -h * (dp / d), ix = X(dp), iy = ay - hp;
          const real = dp > 0, far = Math.abs(ix - cx) > 175;
          // Ray 1: parallel to the axis, then through F' (converging) or as if from F (diverging). Ray 2: through O undeviated.
          g += L(objX, ay - h, cx, ay - h, RED, 2);
          const slope1 = conv ? h / (f * k) : -h / (f * k);
          g += L(cx, ay - h, 356, ay - h + slope1 * (356 - cx), RED, 2);
          g += L(objX, ay - h, 356, ay - h + ((356 - objX) * h) / (d * k), ORANGE, 2);
          if (!real) {
            g += L(cx, ay - h, Math.max(4, ix), ay - h - slope1 * (cx - Math.max(4, ix)), RED, 1.5, "5 4") + L(objX, ay - h, Math.max(4, ix), ay - h + ((Math.max(4, ix) - objX) * h) / (d * k), ORANGE, 1.5, "5 4");
          }
          if (!far) g += arrow(ix, ay, ix, iy, PURPLE, 3.5) + T(ix, iy + (hp > 0 ? -6 : 14), "A'B'", { anchor: "middle", size: 11, fill: PURPLE, bold: true });
          const size = Math.abs(dp) > d + 1e-9 ? "lớn hơn vật" : Math.abs(dp) < d - 1e-9 ? "nhỏ hơn vật" : "bằng vật";
          info = `${real ? "<b>Ảnh thật, ngược chiều</b>" : "<b>Ảnh ảo, cùng chiều</b>"}, ${size}${far ? " (ảnh ở xa, ngoài hình vẽ)" : ""} · cách thấu kính ≈ ${fmt(Math.abs(dp), 1)} cm · f = ${f} cm, d = ${d} cm${conv ? (d > 2 * f ? " (d > 2f)" : d === 2 * f ? " (d = 2f: ảnh bằng vật)" : d > f ? " (f < d < 2f)" : " (d < f: dùng làm kính lúp)") : ""}`;
        }
        return { svg: svgw(g), info };
      },
    },
    magnet: {
      ctrls: () => [ctl("a", "Vị trí la bàn", 0, 350, 10, 60, "°")],
      draw: (p, s) => {
        const cx = 180, cy = 110;
        let g = "";
        for (const kk of [40, 62, 90, 125]) for (const sgn of [1, -1]) { // dipole field lines r = k·sin²θ
          const pts = [];
          for (let i = 1; i < 120; i++) { const th = (Math.PI * i) / 120, r = kk * Math.sin(th) ** 2 * 1.9; pts.push(`${(cx + r * Math.cos(th)).toFixed(1)},${(cy - sgn * r * Math.sin(th)).toFixed(1)}`); }
          g += `<polyline points="${pts.join(" ")}" fill="none" stroke="#9AA6B8" stroke-width="1.5"/>`;
        }
        g += `<rect x="${cx - 50}" y="${cy - 13}" width="50" height="26" fill="${BLUE}"/><rect x="${cx}" y="${cy - 13}" width="50" height="26" fill="${RED}"/>` + T(cx - 25, cy + 5, "S", { anchor: "middle", fill: "#fff", bold: true, size: 14 }) + T(cx + 25, cy + 5, "N", { anchor: "middle", fill: "#fff", bold: true, size: 14 });
        const th = rad(s.a), px = cx + 120 * Math.cos(th), py = cy - 80 * Math.sin(th), rx = (px - cx) / 60, ry = -(py - cy) / 60, rr = Math.hypot(rx, ry), ux = rx / rr, uy = ry / rr;
        const bx = 3 * ux * ux - 1, by = 3 * ux * uy, ang = Math.atan2(-by, bx); // field of a dipole pointing +x (N on the right)
        g += C(px, py, 17, "#fff", "#22324A", 2);
        g += `<g transform="translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${deg(ang).toFixed(1)})"><path d="M0 -4L14 0L0 4Z" fill="${RED}"/><path d="M0 -4L-14 0L0 4Z" fill="${BLUE}"/></g>`;
        return { svg: svgw(g), info: "Đường sức từ đi ra ở cực <b>Bắc (N)</b>, đi vào ở cực <b>Nam (S)</b> · kim la bàn luôn nằm dọc theo đường sức, đầu đỏ (cực Bắc của kim) chỉ theo chiều đường sức" };
      },
    },
    density: {
      ctrls: () => [ctl("m", "Khối lượng m (g)", 10, 800, 10, 200, " g"), ctl("V", "Thể tích V (cm³)", 10, 500, 10, 250, " cm³")],
      draw: (p, s) => {
        const D = s.m / s.V, side = 22 + Math.cbrt(s.V) * 6, wl = 70, bottom = 206;
        let g = `<rect x="60" y="${wl}" width="240" height="${bottom - wl}" fill="${WATER}"/>` + L(60, 30, 60, bottom, "#55657A", 3) + L(300, 30, 300, bottom, "#55657A", 3) + L(60, bottom, 300, bottom, "#55657A", 3);
        const y = D < 1 ? wl - side * (1 - D) : bottom - side;
        g += `<rect x="${(180 - side / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${side.toFixed(1)}" height="${side.toFixed(1)}" rx="4" fill="${D < 1 ? "#E2B985" : "#9AA3AD"}" stroke="#22324A" stroke-width="2"/>`;
        g += T(180, y + side / 2 + 4, `${fmt(D)} g/cm³`, { anchor: "middle", bold: true, size: 11 });
        if (D < 1) g += arrow(180, y + side + 26, 180, y + side - 4, BLUE, 3) + T(196, y + side + 22, "F_A", { fill: BLUE, bold: true, size: 11 });
        return { svg: svgw(g), info: `D = m/V = ${s.m}/${s.V} = <b>${fmt(D)} g/cm³</b> = ${fmt(D * 1000, 0)} kg/m³ · nước: 1 g/cm³ ⇒ ${D < 1 ? "vật <b>nổi</b> (D vật < D nước)" : D > 1 ? "vật <b>chìm</b> (D vật > D nước)" : "vật <b>lơ lửng</b>"}` };
      },
    },
    pressure: {
      ctrls: (p) => (p.mode === "liquid" ? [ctl("h", "Độ sâu h (m)", 0, 20, 1, 5, " m")] : [ctl("F", "Áp lực F (N)", 10, 200, 10, 100, " N"), ctl("S", "Diện tích bị ép S (cm²)", 10, 200, 10, 50, " cm²")]),
      draw: (p, s) => {
        if (p.mode === "liquid") {
          const pr = 10000 * s.h, y = 30 + (s.h / 20) * 160;
          let g = `<rect x="40" y="24" width="280" height="190" fill="${WATER}"/>` + Array.from({ length: 5 }, (_, k) => T(318, 30 + k * 40, `${k * 5} m`, { anchor: "end", size: 9, fill: "#1F5F99" })).join("");
          g += `<g transform="translate(160,${y.toFixed(1)})"><ellipse cx="0" cy="0" rx="18" ry="9" fill="#FF9F43"/><circle cx="18" cy="-2" r="6" fill="#FFD1A6"/><rect x="14" y="-6" width="9" height="5" rx="2" fill="#5DADE2"/></g>`;
          const a = 8 + s.h * 1.4;
          g += arrow(160, y - 14 - a, 160, y - 12, RED, 3) + arrow(130 - a, y, 140, y, RED, 3) + arrow(196 + a, y, 186, y, RED, 3);
          return { svg: svgw(g), info: `p = d·h = 10 000·${s.h} = <b>${fmt(pr, 0)} Pa</b> (N/m²) · càng xuống sâu áp suất càng lớn, ép theo mọi phương` };
        }
        const pr = s.F / (s.S / 10000), w = 30 + s.S * 1.1, sink = Math.min(46, (pr / 200000) * 46 + 2);
        let g = `<rect x="0" y="150" width="${W}" height="70" fill="#E8CF95"/>` + `<rect x="${(180 - w / 2).toFixed(1)}" y="${(110 + sink).toFixed(1)}" width="${w.toFixed(1)}" height="40" rx="3" fill="#C0583B" stroke="#7A3B2E" stroke-width="2"/>`;
        g += arrow(180, 30, 180, 104 + sink, RED, 4) + T(190, 50, `F = ${s.F} N`, { fill: RED, bold: true });
        return { svg: svgw(g), info: `p = F/S = ${s.F} N / ${fmt(s.S / 10000, 4)} m² = <b>${fmt(pr, 0)} Pa</b> · cùng lực, diện tích càng nhỏ ⇒ áp suất càng lớn (lún sâu hơn)` };
      },
    },
    lever: {
      ctrls: () => [ctl("F1", "Lực bên trái F₁ (N)", 1, 10, 1, 4, " N"), ctl("d1", "Cánh tay đòn d₁ (m)", 1, 5, 1, 3, " m"), ctl("F2", "Lực bên phải F₂ (N)", 1, 10, 1, 6, " N"), ctl("d2", "Cánh tay đòn d₂ (m)", 1, 5, 1, 2, " m")],
      draw: (p, s) => {
        const M1 = s.F1 * s.d1, M2 = s.F2 * s.d2, tilt = Math.max(-14, Math.min(14, (M2 - M1) * 1.5)), u = 30;
        let g = P([[180, 150], [160, 196], [200, 196]], "#7A8699", "#55657A", 2) + L(20, 196, 340, 196, "#55657A", 2);
        g += `<g transform="rotate(${tilt.toFixed(1)} 180 150)"><rect x="25" y="144" width="310" height="10" rx="4" fill="#C98A4B"/>`;
        const box = (x, F, c) => { const sz = 14 + F * 2.4; return `<rect x="${(x - sz / 2).toFixed(1)}" y="${(144 - sz).toFixed(1)}" width="${sz.toFixed(1)}" height="${sz.toFixed(1)}" rx="3" fill="${c}"/>` + T(x, 140 - sz, `${F} N`, { anchor: "middle", size: 10, bold: true }); };
        g += box(180 - s.d1 * u, s.F1, BLUE) + box(180 + s.d2 * u, s.F2, ORANGE) + "</g>";
        for (let i = 1; i <= 5; i++) g += T(180 - i * u, 214, i, { anchor: "middle", size: 9, fill: "#7A8699" }) + T(180 + i * u, 214, i, { anchor: "middle", size: 9, fill: "#7A8699" });
        const st = M1 === M2 ? "Đòn bẩy <b>cân bằng</b>" : M1 > M2 ? "Nghiêng về bên <b>trái</b>" : "Nghiêng về bên <b>phải</b>";
        return { svg: svgw(g), info: `M₁ = F₁·d₁ = ${s.F1}·${s.d1} = <b>${M1} N·m</b> · M₂ = F₂·d₂ = ${s.F2}·${s.d2} = <b>${M2} N·m</b> · ${st} (cân bằng khi M₁ = M₂)` };
      },
    },
    circuit: {
      ctrls: (p) => (p.mode === "ohm" ? [ctl("U", "Hiệu điện thế U (V)", 0, 12, 0.5, 6, " V"), ctl("R", "Điện trở R (Ω)", 2, 30, 1, 10, " Ω")]
        : [ctl("U", "Hiệu điện thế U (V)", 1, 12, 0.5, 9, " V"), ctl("R1", "R₁ (Ω)", 1, 20, 1, 6, " Ω"), ctl("R2", "R₂ (Ω)", 1, 20, 1, 12, " Ω")]),
      draw: (p, s) => {
        const res = (x, y, lab, vert) => (vert ? `<rect x="${x - 9}" y="${y - 22}" width="18" height="44" rx="3" fill="#FFE3A3" stroke="#22324A" stroke-width="2"/>` + T(x + 14, y + 4, lab, { size: 11, bold: true })
          : `<rect x="${x - 22}" y="${y - 9}" width="44" height="18" rx="3" fill="#FFE3A3" stroke="#22324A" stroke-width="2"/>` + T(x, y - 14, lab, { anchor: "middle", size: 11, bold: true }));
        const bulb = (x, y, I) => C(x, y, 22, "#FFE66D", "none", 0).replace("/>", ` opacity="${Math.min(1, I / 1.5).toFixed(2)}"/>`) + C(x, y, 12, "#FFF7C2", "#22324A", 2) + L(x - 6, y - 6, x + 6, y + 6, "#22324A", 1.5) + L(x + 6, y - 6, x - 6, y + 6, "#22324A", 1.5);
        const battery = `<rect x="20" y="96" width="44" height="28" fill="#fff"/>` + L(34, 92, 34, 128, "#22324A", 3) + L(46, 100, 46, 120, "#22324A", 5) + T(28, 88, "+", { bold: true, size: 13 }) + T(50, 88, "−", { bold: true, size: 13 });
        const wire = `<path class="flow" d="M40 92V30H320V190H40V128" fill="none" stroke="#22324A" stroke-width="2.5"/>`;
        let g = wire + battery, info;
        if (p.mode === "ohm") {
          const I = s.U / s.R;
          g += res(180, 30, `R = ${s.R} Ω`) + bulb(320, 110, I) + C(180, 190, 16, "#fff", "#22324A", 2) + T(180, 195, "A", { anchor: "middle", bold: true }) + T(180, 218, `${fmt(I, 2)} A`, { anchor: "middle", size: 11, fill: RED, bold: true });
          info = `Định luật Ohm: I = U/R = ${fmt(s.U)}/${s.R} = <b>${fmt(I, 3)} A</b> · U tăng ⇒ I tăng (đèn sáng hơn); R tăng ⇒ I giảm`;
        } else if (p.mode === "series") {
          const R = s.R1 + s.R2, I = s.U / R;
          g += res(140, 30, `R₁ = ${s.R1} Ω`) + res(240, 30, `R₂ = ${s.R2} Ω`) + C(180, 190, 16, "#fff", "#22324A", 2) + T(180, 195, "A", { anchor: "middle", bold: true }) + T(180, 218, `${fmt(I, 2)} A`, { anchor: "middle", size: 11, fill: RED, bold: true });
          g += T(140, 66, `U₁ = ${fmt(I * s.R1)} V`, { anchor: "middle", size: 10, fill: BLUE, bold: true }) + T(240, 66, `U₂ = ${fmt(I * s.R2)} V`, { anchor: "middle", size: 10, fill: BLUE, bold: true });
          info = `Nối tiếp: R = R₁ + R₂ = <b>${R} Ω</b> · I = U/R = <b>${fmt(I, 3)} A</b> (như nhau ở mọi điểm) · U₁ + U₂ = ${fmt(I * s.R1)} + ${fmt(I * s.R2)} = <b>${fmt(s.U)} V</b>`;
        } else {
          const R = (s.R1 * s.R2) / (s.R1 + s.R2), I1 = s.U / s.R1, I2 = s.U / s.R2;
          g = `<path class="flow" d="M40 92V30H300M300 30V190M40 128V190H300" fill="none" stroke="#22324A" stroke-width="2.5"/>` + L(200, 30, 200, 190, "#22324A", 2.5) + battery;
          g += res(200, 110, `R₁ = ${s.R1} Ω`, true) + res(300, 110, `R₂ = ${s.R2} Ω`, true) + T(150, 60, `I₁ = ${fmt(I1, 2)} A`, { size: 10, fill: RED, bold: true }) + T(250, 60, `I₂ = ${fmt(I2, 2)} A`, { size: 10, fill: RED, bold: true });
          info = `Song song: 1/R = 1/R₁ + 1/R₂ ⇒ R ≈ <b>${fmt(R)} Ω</b> · U như nhau = ${fmt(s.U)} V · I = I₁ + I₂ = ${fmt(I1)} + ${fmt(I2)} = <b>${fmt(I1 + I2, 3)} A</b>`;
        }
        return { svg: svgw(g), info };
      },
    },
    power: {
      ctrls: () => [ctl("U", "Hiệu điện thế U (V)", 1, 240, 1, 220, " V"), ctl("I", "Cường độ I (A)", 0.1, 5, 0.1, 0.5, " A"), ctl("t", "Thời gian dùng t (giờ)", 1, 24, 1, 5, " h")],
      draw: (p, s) => {
        const P_ = s.U * s.I, A = P_ * s.t, glow = Math.min(1, P_ / 600);
        let g = C(110, 96, 30 + glow * 40, "#FFE66D").replace("/>", ` opacity="${(0.25 + glow * 0.6).toFixed(2)}"/>`) + C(110, 96, 30, "#FFF7C2", "#22324A", 2.5) + `<rect x="98" y="124" width="24" height="22" rx="4" fill="#9AA3AD"/>`;
        g += `<rect x="200" y="50" width="130" height="90" rx="10" fill="#22324A"/>` + T(265, 82, "CÔNG TƠ ĐIỆN", { anchor: "middle", size: 9, fill: "#9BE7C4" }) + T(265, 116, `${fmt(A / 1000, 2)} kWh`, { anchor: "middle", size: 18, fill: "#9BE7C4", bold: true });
        return { svg: svgw(g), info: `P = U·I = ${s.U}·${fmt(s.I, 1)} = <b>${fmt(P_, 1)} W</b> · điện năng A = P·t = ${fmt(P_, 1)}·${s.t} = ${fmt(A, 0)} Wh = <b>${fmt(A / 1000, 3)} kWh</b> (1 "số điện") · giả sử 2 500 đ/kWh ⇒ ≈ ${fmt((A / 1000) * 2500, 0)} đ` };
      },
    },
    energy: {
      ctrls: () => [ctl("x", "Vị trí quả bóng trên dốc (%)", 0, 100, 5, 20, "%"), ctl("m", "Khối lượng m (kg)", 1, 5, 1, 2, " kg")],
      draw: (p, s) => {
        const h0 = 5, h = h0 * (1 - s.x / 100), W_ = 10 * s.m * h0, Wt = 10 * s.m * h, Wd = W_ - Wt;
        const top = [24, 40], bot = [210, 196], bx = top[0] + (bot[0] - top[0]) * (s.x / 100), by = top[1] + (bot[1] - top[1]) * (s.x / 100);
        let g = P([top, bot, [24, 196]], "#D6F5E3", GREEN, 2) + L(24, 196, 220, 196, "#55657A", 2) + C(bx + 6, by - 12, 12, RED, "#fff", 2) + T(14, 44, `${h0} m`, { anchor: "end", size: 10 });
        const bars = [["Wt", Wt, BLUE], ["Wđ", Wd, ORANGE], ["W", W_, GREEN]];
        bars.forEach(([lab, v, c], i) => { const x = 248 + i * 36, hh = (v / W_) * 140; g += `<rect x="${x}" y="${(190 - hh).toFixed(1)}" width="26" height="${hh.toFixed(1)}" rx="3" fill="${c}"/>` + T(x + 13, 206, lab, { anchor: "middle", size: 11, bold: true }) + T(x + 13, 184 - hh, fmt(v, 0), { anchor: "middle", size: 9, bold: true }); });
        return { svg: svgw(g), info: `Độ cao h = ${fmt(h, 2)} m · thế năng Wt = 10·m·h = <b>${fmt(Wt, 0)} J</b> · động năng Wđ = <b>${fmt(Wd, 0)} J</b> · cơ năng W = Wt + Wđ = <b>${fmt(W_, 0)} J</b> (không đổi khi bỏ qua ma sát)` };
      },
    },
    heat: {
      ctrls: () => [ctl("T", "Nhiệt độ (°C)", 0, 100, 5, 25, "°C")],
      draw: (p, s) => {
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const dur = (2.2 - (s.T / 100) * 1.9).toFixed(2), amp = 2 + s.T / 12;
        let g = `<rect x="20" y="20" width="150" height="120" rx="10" fill="#FFF4E5" stroke="#E7BF79" stroke-width="2"/>`;
        for (let i = 0; i < 22; i++) {
          const x = 34 + rnd() * 122, y = 34 + rnd() * 92;
          g += `<circle class="jig" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${s.T > 60 ? RED : s.T > 30 ? ORANGE : BLUE}" style="--j:${amp.toFixed(1)}px;animation-duration:${dur}s;animation-delay:-${(rnd() * 2).toFixed(2)}s"/>`;
        }
        const len = 150 * (1 + 0.0012 * s.T * 5);
        g += `<rect x="20" y="168" width="${len.toFixed(1)}" height="16" rx="4" fill="#B8C4CE" stroke="#7A8699" stroke-width="1.5"/>` + L(20 + 150, 160, 20 + 150, 192, "#7A8699", 1.5, "4 3") + T(20, 206, "thanh kim loại (phóng đại)", { size: 9, fill: "#7A8699" });
        const th = 150 - (s.T / 100) * 120;
        g += `<rect x="300" y="20" width="16" height="150" rx="8" fill="#fff" stroke="#22324A" stroke-width="2"/>` + `<rect x="304" y="${th.toFixed(1)}" width="8" height="${(170 - th).toFixed(1)}" rx="4" fill="${RED}"/>` + C(308, 178, 13, RED) + T(290, th + 4, `${s.T}°C`, { anchor: "end", size: 12, bold: true });
        return { svg: svgw(g), info: `Nhiệt độ càng cao ⇒ các phân tử chuyển động <b>càng nhanh</b> ⇒ nội năng (năng lượng nhiệt) càng lớn · vật nở ra khi nóng lên, co lại khi lạnh đi` };
      },
    },
    induction: {
      motion: "x",
      ctrls: () => [ctl("x", "Kéo nam châm vào / ra cuộn dây", 0, 100, 1, 0)],
      draw: (p, s) => {
        const dx = s._dx || 0, mx = 20 + s.x * 1.5;
        let g = "";
        for (let i = 0; i < 8; i++) g += `<ellipse cx="${210 + i * 12}" cy="80" rx="6" ry="30" fill="none" stroke="#C98A4B" stroke-width="4"/>`;
        g += `<rect x="${mx.toFixed(1)}" y="68" width="40" height="24" fill="${BLUE}"/><rect x="${(mx + 40).toFixed(1)}" y="68" width="40" height="24" fill="${RED}"/>` + T(mx + 20, 85, "S", { anchor: "middle", fill: "#fff", bold: true }) + T(mx + 60, 85, "N", { anchor: "middle", fill: "#fff", bold: true });
        g += `<path d="M210 110V160H190M300 110V160H230" fill="none" stroke="#22324A" stroke-width="2"/>` + C(210, 170, 26, "#fff", "#22324A", 2) + T(192, 178, "G", { anchor: "middle", bold: true, size: 11 });
        const needle = Math.max(-60, Math.min(60, dx * 12));
        g += `<g transform="rotate(${needle.toFixed(1)} 210 186)">${L(210, 186, 210, 152, RED, 3)}</g>` + C(210, 186, 3.5, "#22324A");
        const st = Math.abs(dx) < 0.5 ? "Nam châm <b>đứng yên</b> ⇒ từ trường qua cuộn dây không đổi ⇒ <b>không có</b> dòng điện cảm ứng" : dx > 0 ? "Đưa nam châm <b>vào</b> cuộn dây ⇒ số đường sức qua cuộn dây tăng ⇒ có dòng điện cảm ứng (kim lệch một phía)" : "Kéo nam châm <b>ra</b> ⇒ số đường sức giảm ⇒ dòng điện cảm ứng <b>đổi chiều</b> (kim lệch phía kia)";
        return { svg: svgw(g), info: st };
      },
    },
    ac: {
      ctrls: () => [ctl("a", "Góc quay của khung dây", 0, 720, 15, 90, "°")],
      draw: (p, s) => {
        const w = Math.abs(Math.cos(rad(s.a))) * 40 + 4;
        let g = `<rect x="14" y="40" width="34" height="80" fill="${RED}"/><rect x="138" y="40" width="34" height="80" fill="${BLUE}"/>` + T(31, 85, "N", { anchor: "middle", fill: "#fff", bold: true }) + T(155, 85, "S", { anchor: "middle", fill: "#fff", bold: true });
        g += `<rect x="${(93 - w / 2).toFixed(1)}" y="46" width="${w.toFixed(1)}" height="68" fill="none" stroke="#C98A4B" stroke-width="4"/>` + L(93, 30, 93, 130, "#7A8699", 1.5, "4 3");
        const pl = plane(0, 720, -1.2, 1.2, [190, 30, 350, 190], 90);
        g += L(190, pl.Y(0), 350, pl.Y(0), "#55657A", 1.5) + curve(pl, (a) => Math.sin(rad(a)), 0, 720, PURPLE, 2.5) + C(pl.X(s.a), pl.Y(Math.sin(rad(s.a))), 5, RED, "#fff", 1.5);
        g += T(270, 210, "góc quay (0° → 720°)", { anchor: "middle", size: 9, fill: "#7A8699" }) + T(196, 24, "i", { size: 11, bold: true });
        const v = Math.sin(rad(s.a));
        return { svg: svgw(g), info: `Khung dây quay đều trong từ trường ⇒ dòng điện cảm ứng i ${Math.abs(v) < 0.05 ? "= 0 lúc này" : v > 0 ? "chạy theo <b>chiều dương</b>" : "chạy theo <b>chiều ngược lại</b>"} · cứ nửa vòng quay dòng điện <b>đổi chiều</b> một lần ⇒ dòng điện xoay chiều (ở Việt Nam 50 Hz)` };
      },
    },
  };

  /** Initial slider state for a visual. */
  function init(viz) {
    const v = VIZ[viz.type];
    return v ? Object.fromEntries(v.ctrls(viz).map((c) => [c.k, c.val])) : {};
  }
  function draw(viz, state) {
    const v = VIZ[viz.type];
    if (!v) return { svg: svgw(T(180, 110, "—", { anchor: "middle" })), info: "" };
    return v.draw(viz, { ...init(viz), ...(state || {}) });
  }
  const ctrls = (viz) => (VIZ[viz.type] ? VIZ[viz.type].ctrls(viz) : []);
  const motionKey = (viz) => (VIZ[viz.type] && VIZ[viz.type].motion) || null;

  const Stem = { VIZ, TYPES: Object.keys(VIZ), init, draw, ctrls, motionKey, fmt, parseExpr, formulaVars, formulaParts };
  if (typeof module === "object" && module.exports) module.exports = Stem;
  else root.Stem = Stem;
})(typeof window !== "undefined" ? window : globalThis);
