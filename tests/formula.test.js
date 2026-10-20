const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/stem.js");

const val = (src, env = {}) => S.parseExpr(src).f(env);

test("formula parser: school notation, implicit multiplication, precedence", () => {
  assert.equal(val("2x^2 - 3x + 1", { x: 2 }), 3);
  assert.equal(val("-x^2", { x: 3 }), -9);           // minus applies after the power
  assert.equal(val("2ax", { a: 3, x: 2 }), 12);       // 2·a·x
  assert.equal(val("3(x+1)", { x: 1 }), 6);
  assert.equal(val("x² + 1,5", { x: 2 }), 5.5);      // superscript and decimal comma
  assert.equal(val("√(x) + |x − 5|", { x: 9 }), 7);
  assert.equal(val("2^-1"), 0.5);
  assert.ok(Math.abs(val("sin x", { x: 30 }) - 0.5) < 1e-12); // degrees, as in grade 9
  assert.ok(Math.abs(val("πx", { x: 1 }) - Math.PI) < 1e-12);
  assert.equal(val("e^x", { x: 0 }), 1);
  assert.equal(val("x : 4 × 2", { x: 8 }), 4);
});

test("formula parser: clear Vietnamese errors, no code execution", () => {
  for (const [src, msg] of [["2x+", /thiếu ở cuối/], ["(x+1", /Thiếu dấu “\)”/], ["x+)", /Thừa/], ["", /Chưa nhập/], ["alert(1)$", /Không hiểu kí tự/],
    ["x".repeat(200), /quá dài/]]) {
    assert.throws(() => S.parseExpr(src), msg, src);
  }
  const odd = S.parseExpr("constructor"); // letters are one-letter variables only: no property or code access
  assert.ok([...odd.vars].every((v) => v.length === 1) && Number.isNaN(odd.f({})));
  assert.deepEqual(S.formulaVars("y = a*x^2 + b; kx + c"), ["a", "b", "k", "c"]);
});

test("formula visual: sliders from the parameters, crossings in the readout, errors drawn instead of thrown", () => {
  const v = { type: "formula", expr: "a*x^2 + b*x + c; x + 1", params: [["a", -3, 3, 2], ["b", -5, 5, 1], ["c", -5, 5, -4]], x: [-6, 6] };
  assert.deepEqual(S.ctrls(v).map((c) => [c.k, c.min, c.max, c.step, c.val]), [["a", -3, 3, 0.1, 2], ["b", -5, 5, 0.25, 1], ["c", -5, 5, 0.25, -4]]);
  const r = S.draw(v, {});
  assert.match(r.info, /y = a·x² \+ b·x \+ c/);
  assert.match(r.info, /cắt Oy tại \(0; −4\)/);
  assert.match(r.info, /cắt Ox tại x ≈ −1,69; 1,19/);          // 2x² + x − 4 = 0
  assert.match(r.info, /cắt nhau tại x ≈ −1,58; 1,58/);         // 2x² = 5
  assert.equal(S.draw(v, { a: 1, b: 0, c: 1 }).info.includes("cắt Ox"), false); // x² + 1 has no root
  const bad = S.draw({ type: "formula", expr: "k*x", params: [], x: [-5, 5] }, {});
  assert.equal(bad.error, "Chưa khai báo tham số k");
  assert.match(bad.svg, /Công thức chưa đúng/);
  const xss = S.draw({ type: "formula", expr: "x<img>", params: [] }, {});
  assert.ok(!xss.svg.includes("<img") && !xss.info.includes("<img"));
});
