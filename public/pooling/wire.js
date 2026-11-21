/**
 * Wire: two to four computers on a desk, joined in a chain. Each word is a bead
 * that hops from the last computer back to the main one, link by link, on the
 * 700ms curve, resting at every computer on the way. On cable the hops are
 * steady; on Wi-Fi the links become dashed arcs through the air and some hops
 * wait. The slider is how many computers pool; the pointer picks a computer or
 * a link, tested against the rest pose of the target count.
 *
 * Pace, from the owner's measures of a 33B model: one word takes
 * T(n) = 125.3ms + (n - 1) × hop, hop 8ms on cable, 28.5ms on Wi-Fi. Two on
 * cable gives 7.5/s and on Wi-Fi 6.5/s (both measured); 3 and 4 follow from
 * one more hop each (7.1, 6.7 on cable; 5.5, 4.7 on Wi-Fi).
 */
const {
  Cam, clamp, facing, fit, lerp, open, prism, proj, put, rings, seg,
  tween, tset, tval, tdone, disposer, mk, place, pointer, register, solid,
} = HL;

const MAXN = 4, TW = 14, TD = 20, H = 40, GAP = 50, SAG = 16, ARC = 16, DX = 12, LIFT = 6;
const YA = -TD / 2 - 9, YB = TD / 4 + SAG + 9;
const pace = (n, cable) => (1000 / (125.3 + (n - 1) * (cable ? 8 : 28.5))).toFixed(1) + "/s";
const xAt = (i, n) => (i - (n - 1) / 2) * GAP;
const rnd = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

/** A point on the link from computer a to computer b ({x, h, z}) at f (0 at a): a sagging cable at m 0, an arc through the air at m 1. */
function linkPt(A, Z, f, m) {
  const s = Math.sin(Math.PI * f), lo = Math.min(A.h, Z.h);
  const c = [lerp(A.x + TW / 2, Z.x - TW / 2, f), TD / 4 + SAG * s, (lerp(A.z, Z.z, f) + 7 * lo) * (1 - 0.93 * s)];
  const a = [lerp(A.x, Z.x, f), 0, lerp(H * A.h + A.z, H * Z.h + Z.z, f) + 3 + ARC * s];
  return [lerp(c[0], a[0], m), lerp(c[1], a[1], m), lerp(c[2], a[2], m)];
}

function mount({ stage, svg, read, controls = {} }, value) {
  const bag = disposer();
  let nT = clamp(Math.round(value), 2, MAXN), cable = controls.cable ?? true, pick = -1, told = false;

  // Fitted to four computers with the Wi-Fi arcs up, the most extreme pose.
  const C = Cam(45, 0.5, 2.05), xr = xAt(MAXN - 1, MAXN) + TW / 2 + DX;
  fit(C, [[-xr, YA, -5], [xr, YB, -5], [xr, YA, -5], [-xr, YB, -5], [-xr, 0, H + LIFT + ARC + 3], [xr, 0, H + LIFT + ARC + 3]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const desk = { s: solid(g), nn: tween(nT), drawn: NaN };
  const T = [], L = [];
  for (let i = 0; i < MAXN; i++) {
    const tg = mk("g", {}, g);
    T.push({ g: tg, s: solid(tg), det: mk("path", { class: "nf lo" }, tg), dot: mk("circle", { r: 1.1, class: "dot off" }, tg),
      x: tween(xAt(i, i < nT ? nT : MAXN)), h: tween(i < nT ? 1 : 0), z: tween(0), drawn: "" });
  }
  for (let k = 0; k < MAXN - 1; k++) { const lg = mk("g", {}, g); L.push({ g: lg, path: mk("path", { class: "nf" }, lg), drawn: "" }); }
  const D = [[2.8, "dot m", 0], [2, "dot off", 90], [1.4, "dot off", 180]].map(([r, cls, lag]) => ({ el: mk("circle", { r, class: cls }, g), lag, k: -1 }));
  const mode = tween(cable ? 0 : 1);
  let bead = tween(nT - 1), word = 0, air = null;
  tset(bead, nT - 2, performance.now(), 200);

  /** Cable: each link painted before the computer it enters from behind. Air: each arc after both its computers. */
  function order(up) {
    air = up;
    for (let i = 0; i < MAXN; i++) {
      g.append(T[i].g);
      if (up && i > 0) g.append(L[i - 1].g);
      if (!up && i < MAXN - 1) g.append(L[i].g);
    }
    D.forEach((d) => { d.k = -1; });
  }

  function drawDesk(now) {
    const nn = tval(desk.nn, now);
    if (nn === desk.drawn) return;
    desk.drawn = nn;
    const len = xAt(nn - 1, nn) + TW / 2 + DX, [ring, inner] = rings(-len, YA, len, YB, 8, 2);
    put(desk.s, prism(P, front, ring, inner, -5, 0));
  }

  function drawTower(t, now) {
    const x = tval(t.x, now), h = tval(t.h, now), l = tval(t.z, now), key = [x, h, l].map((v) => v.toFixed(3)).join();
    if (key === t.drawn) return;
    t.drawn = key;
    t.g.setAttribute("display", h < 0.02 ? "none" : "inline");
    if (h < 0.02) return;
    const [ring, inner] = rings(x - TW / 2, -TD / 2, x + TW / 2, TD / 2, 3, 1.2), z = (q) => l + q * H * h, y = TD / 2;
    put(t.s, prism(P, front, ring, inner, l, l + H * h));
    // the front panel: a drive bay, three vents, and the power button
    const bay = [0.84, 0.78].map((q) => seg(P(x - 4.5, y, z(q)), P(x + 4.5, y, z(q)))).join("");
    const vents = [0.14, 0.2, 0.26].map((q) => seg(P(x - 3.5, y, z(q)), P(x + 3.5, y, z(q)))).join("");
    t.det.setAttribute("d", bay + vents);
    place(t.dot, P(x, y, z(0.64)));
  }

  const at = (i, now) => ({ x: tval(T[i].x, now), h: tval(T[i].h, now), z: tval(T[i].z, now) });
  const still = (i, n) => ({ x: xAt(i, n), h: 1, z: 0 });
  function drawLink(k, now, m) {
    const A = at(k, now), Z = at(k + 1, now), l = L[k];
    const key = [A.x, A.h, A.z, Z.x, Z.h, Z.z, m].map((v) => v.toFixed(3)).join();
    if (key === l.drawn) return;
    l.drawn = key;
    if (A.h < 0.05 || Z.h < 0.05) { l.path.setAttribute("d", ""); return; }
    const pts = [];
    for (let j = 0; j <= 16; j++) pts.push(P(...linkPt(A, Z, j / 16, m)));
    l.path.setAttribute("d", open(pts));
    l.path.classList.toggle("dash", m > 0.5);
  }

  /** The bead and its two trailing dots, each painted just after the link it is on. */
  function drawBead(now, m) {
    for (const d of D) {
      const s = clamp(tval(bead, now - d.lag), 0, nT - 1), k = clamp(Math.floor(s), 0, nT - 2);
      if (d.k !== k) { d.k = k; L[k].g.after(d.el); }
      place(d.el, P(...linkPt(at(k, now), at(k + 1, now), s - k, m)));
    }
  }

  /** The next hop: a rest at each computer, and on Wi-Fi some rests run long. */
  function hop(now) {
    const s = Math.round(tval(bead, now));
    if (s <= 0) { word++; bead = tween(nT - 1); tset(bead, nT - 2, now, 260); return; }
    const r = rnd(word, s), wait = cable ? 120 : r < 0.4 ? 320 + rnd(s, word) * 480 : 120 + r * 60;
    tset(bead, s - 1, now, wait);
  }

  const B = register(stage, (_dt, now) => {
    const m = tval(mode, now);
    if (air !== m > 0.5) order(m > 0.5);
    drawDesk(now);
    T.forEach((t) => drawTower(t, now));
    for (let k = 0; k < MAXN - 1; k++) drawLink(k, now, m);
    if (tdone(bead, now)) hop(now);
    drawBead(now, m);
    return true;
  });
  bag.add(B.unregister);
  const dist = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1], u = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy), 0, 1);
    return Math.hypot(p[0] - a[0] - u * vx, p[1] - a[1] - u * vy);
  };
  /** Computer i, or 10 + k for link k, nearest the pointer in the rest pose of the target count; -1 for none. */
  function hit(p) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < nT; i++) {
      const d = dist(p, P(xAt(i, nT), 0, 0), P(xAt(i, nT), 0, H));
      if (d < 20 && d < bd) { best = i; bd = d; }
    }
    for (let k = 0; k < nT - 1; k++) {
      const q = P(...linkPt(still(k, nT), still(k + 1, nT), 0.5, cable ? 0 : 1)), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < 15 && d < bd) { best = 10 + k; bd = d; }
    }
    return best;
  }

  function show() {
    T.forEach((t, i) => t.s.sil.classList.toggle("hi", pick === i || (pick < 0 && i === 0)));
    L.forEach((l, k) => l.path.classList.toggle("hi", pick === 10 + k));
    read.textContent = pick < 0 ? (told ? pace(nT, cable) : "rest") : pick >= 10 ? (cable ? "link <1ms" : "link 44ms")
      : pick === 0 ? "main " + pace(nT, cable) : "helper " + pick;
  }
  /** The computer picked rises a little; the rest settle back, staggered out from it. */
  const choose = (a) => {
    if (a === pick) return;
    const now = performance.now(), from = a >= 0 && a < 10 ? a : pick % 10;
    pick = a;
    T.forEach((t, i) => tset(t.z, i === a ? LIFT : 0, now, Math.abs(i - from) * 45));
    show();
  };

  bag.add(pointer(stage, { move: (p) => { told = false; choose(hit(p)); }, leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());
  show();

  return {
    set: (v) => {
      const n = clamp(Math.round(v), 2, MAXN), now = performance.now(), a = Math.max(n, nT) - 1;
      if (n === nT) return;
      nT = n; told = true;
      // added or taken away at the end of the chain, staggered out from it
      T.forEach((t, i) => { const delay = Math.abs(i - a) * 45; tset(t.x, xAt(i, i < n ? n : MAXN), now, delay); tset(t.h, i < n ? 1 : 0, now, delay); });
      tset(desk.nn, n, now, 0);
      if (tval(bead, now) > n - 1) { bead = tween(n - 1); tset(bead, n - 2, now, 200); }
      if (pick >= 0 && (pick % 10) >= (pick >= 10 ? n - 1 : n)) choose(-1); else show();
    },
    input: (id, v) => {
      if (id !== "cable") return;
      cable = v; told = pick < 0;
      tset(mode, v ? 0 : 1, performance.now(), 0);
      show();
    },
    destroy: bag.dispose,
  };
}

hairline({
  name: "wire",
  means: "Computers pooling one model: every word hops along the chain between them, and each added computer is one more hop.",
  rules: [1, 2, 6, 7],
  range: [2, 2, 4],
  label: "computers",
  controls: [{ id: "cable", kind: "switch", label: "cable", value: true }],
  tour: [[172, 151], [178, 222], [244, 187], null],
  mount,
});
