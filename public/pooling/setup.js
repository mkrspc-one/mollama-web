/**
 * Setup: two computers on a desk, a tower with its monitor (the main one) and
 * a laptop (the lender), set up to share one model. The slider walks the six
 * steps: the app on both screens, the cable in, found on one network, the
 * lender's gate open, the model's layers on the main computer, then a chat
 * running across both. The bright stroke marks the newest step's part;
 * hovering a computer gives the bright to it and names it.
 */
const {
  Cam, fit, proj, facing, rings, prism, solid, put, mk, place, poly, open, seg, rrect, fillet,
  tween, tset, tval, tdone, clamp, lerp, rad, register, pointer, disposer,
} = HL;

const H = 26, TILT = rad(16), GX = 136, GY = 60, GL = 15, OPEN = rad(80);
const CAB = [[24, 66], [70, 66], [130, 102], [130, 50]], HOME = [49, 27], AWAY = [130, 32];

/** A point along the cable on the desk, t from the tower's port to the laptop's. */
function cable(t) {
  const s = 1 - t, b = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
  return [0, 1].map((k) => b.reduce((a, w, j) => a + w * CAB[j][k], 0));
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 1.5);
  fit(C, [[-8, -6, -5], [168, 92, -5], [168, -6, -5], [-8, 92, -5], [0, 0, 46], [36, 14, 50], [62, 40, 50]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);
  const block = (x0, y0, x1, y1, r, b, z0, z1, parent = g) => {
    const s = solid(parent), [ring, inner] = rings(x0, y0, x1, y1, r, b);
    put(s, prism(P, front, ring, inner, z0, z1));
    return s;
  };
  const dot = (parent) => mk("circle", { r: 1.4, class: "dot m" }, parent);
  const setD = (el, d) => { if (el.dd !== d) { el.dd = d; el.setAttribute("d", d); } };

  // back to front: the desk, the monitor, the tower, the model's layers, the cable, the laptop, the gate
  block(-8, -6, 168, 92, 10, 2, -5, 0);
  block(4, 14, 22, 34, 4, 1, 0, 2);
  block(11, 21, 15, 27, 1.5, 0.6, 2, 16);
  const panel = block(12, 0, 16, 48, 1.5, 0.6, 14, 46);
  mk("path", { d: poly(rrect(3, 17, 45, 43, 2, 4).map((q) => P(16, q.u, q.v))), class: "nf lo" }, g);
  const mainDot = dot(g), mainPair = dot(g);
  place(mainDot, P(16.2, 22, 30));
  const tower = block(0, 52, 24, 76, 3, 1.2, 0, 46);
  mk("path", { d: [40, 37, 34].map((z) => seg(P(24, 57, z), P(24, 71, z))).join(""), class: "nf lo" }, g);

  const atMain = mk("g", {}, g), plates = [];
  for (let i = 0; i < 4; i++) plates.push({ i, el: solid(atMain), e: tween(0), m: tween(0) });

  const cab = mk("path", { class: "nf sil dash" }, g);
  const beads = [0, 1, 2].map(() => mk("circle", { r: 0, class: "dot m" }, g));

  const lid = (u, v, d = 0) => P(112 - v * Math.sin(TILT) - d, u, 3 + v * Math.cos(TILT));
  const lidRing = rrect(16, 0, 48, H, 2.5, 4);
  mk("path", { d: poly(lidRing.map((q) => lid(q.u, q.v, 1.4))), class: "lo" }, g);
  const lidFace = mk("path", { d: poly(lidRing.map((q) => lid(q.u, q.v))), class: "sil" }, g);
  mk("path", { d: poly(rrect(19, 3, 45, 23, 1.5, 4).map((q) => lid(q.u, q.v))), class: "nf lo" }, g);
  const lendDot = dot(g), lendPair = dot(g);
  place(lendDot, lid(26, 13));
  const base = block(112, 14, 146, 50, 3, 1.2, 0, 3);
  mk("path", { d: poly(rrect(116, 19, 134, 45, 1.5, 4).map((q) => P(q.u, q.v, 3))), class: "nf lo" }, g);
  const onLender = mk("g", {}, g);

  block(134.5, 58.5, 137.5, 61.5, 1.2, 0.4, 0, 15);
  const leafBack = mk("path", { class: "lo" }, g), leaf = mk("path", { class: "sil" }, g), bar = mk("path", { class: "nf lo" }, g);
  const leafShape = fillet([[0, 1], [GL, 1], [GL, 13], [0, 13]], [1.5, 1.5, 1.5, 1.5]);

  let step = clamp(Math.round(value), 1, 6), hov = null, touched = false;
  const pd = [tween(0), tween(0)], cf = tween(0), gt = tween(0);

  function drawPlate(p, now) {
    const e = tval(p.e, now), m = tval(p.m, now);
    if (e < 0.01) { setD(p.el.sil, ""); setD(p.el.cr, ""); return; }
    const cx = lerp(HOME[0], AWAY[0], m), cy = lerp(HOME[1], AWAY[1], m);
    const z = lerp(1 + p.i * 3.4, 3.6 + (p.i - 2) * 3.4, m) + (1 - e) * 34 + Math.sin(Math.PI * m) * 14;
    const [ring, inner] = rings(cx - 13, cy - 13, cx + 13, cy + 13, 3, 1), d = prism(P, front, ring, inner, z, z + 1.4);
    setD(p.el.sil, d.sil); setD(p.el.cr, d.crease);
    const home = m > 0.5 ? onLender : atMain;
    if (p.el.g.parentNode !== home) plates.forEach((q) => (tval(q.m, now) > 0.5 ? onLender : atMain).appendChild(q.el.g));
  }

  function drawGate(now) {
    const th = tval(gt, now) * OPEN, c = Math.cos(th), s = Math.sin(th);
    const w = (u, v, d) => P(GX - u * c + d * s, GY + u * s + d * c, v);
    setD(leafBack, poly(leafShape.map((q) => w(q[0], q[1], -1))));
    setD(leaf, poly(leafShape.map((q) => w(q[0], q[1], 0))));
    setD(bar, seg(w(GL / 2, 1, 0), w(GL / 2, 13, 0)));
  }

  const B = register(stage, (_dt, now) => {
    const f = tval(cf, now), pts = [];
    for (let k = 0; k <= 40; k++) { const q = cable((k / 40) * f); pts.push(P(q[0], q[1], 0.8)); }
    setD(cab, f < 0.01 ? "" : open(pts));
    beads.forEach((b, k) => {
      const run = step === 6 && f > 0.99, t = (now / 1800 + k / 3) % 1, q = cable(k === 2 ? 1 - t : t);
      if (run) place(b, P(q[0], q[1], 1.8));
      const r = run ? 1.3 : 0;
      if (b.rr !== r) { b.rr = r; b.setAttribute("r", r); }
    });
    [[mainPair, 16.2, 22, 30, 0], [lendPair, 0, 26, 13, 1]].forEach(([el, x, y, z, j]) => {
      const p = tval(pd[j], now), at = j ? lid(y + 6 * p, z) : P(x, y + 6 * p, z);
      place(el, at);
      const r = p > 0.02 ? 1.4 : 0;
      if (el.rr !== r) { el.rr = r; el.setAttribute("r", r); }
    });
    drawGate(now);
    plates.forEach((p) => drawPlate(p, now));
    const all = [...pd, cf, gt, ...plates.flatMap((p) => [p.e, p.m])];
    return step === 6 || all.some((tw) => !tdone(tw, now));
  });
  bag.add(B.unregister);

  /** The bright stroke: the computer under the pointer, or else the part the current step added. */
  function marks() {
    const at = (n) => !hov && step === n;
    mainDot.setAttribute("class", at(1) ? "dot" : "dot m");
    lendDot.setAttribute("class", at(1) ? "dot" : "dot m");
    mainPair.setAttribute("class", at(3) ? "dot" : "dot m");
    lendPair.setAttribute("class", at(3) ? "dot" : "dot m");
    cab.classList.toggle("dash", step < 3);
    cab.classList.toggle("hi", at(2));
    leaf.classList.toggle("hi", at(4));
    plates.forEach((p) => p.el.sil.classList.toggle("hi", at(5)));
    beads.forEach((b) => b.setAttribute("class", at(6) ? "dot" : "dot m"));
    [tower.sil, panel.sil].forEach((el) => el.classList.toggle("hi", hov === "main"));
    [lidFace, base.sil].forEach((el) => el.classList.toggle("hi", hov === "lender"));
    read.textContent = hov || (touched ? "step " + step : "rest");
  }

  /** Every part takes the target of the current step; parts on both computers start at the main one. */
  function apply() {
    const now = performance.now();
    pd.forEach((tw, j) => tset(tw, step >= 3 ? 1 : 0, now, j * 60));
    tset(cf, step >= 2 ? 1 : 0, now, 0);
    tset(gt, step >= 4 ? 1 : 0, now, 0);
    plates.forEach((p) => {
      tset(p.e, step >= 5 ? 1 : 0, now, p.i * 50);
      tset(p.m, step >= 6 && p.i >= 2 ? 1 : 0, now, (3 - p.i) * 50);
    });
    marks();
    B.wake();
  }

  // hit test against the rest poses: the computer whose resting centre is nearest the pointer
  const cM = P(12, 38, 24), cL = P(128, 32, 12);
  function hit([x, y]) {
    const dm = Math.hypot(x - cM[0], y - cM[1]), dl = Math.hypot(x - cL[0], y - cL[1]);
    return Math.min(dm, dl) > 62 ? null : dm < dl ? "main" : "lender";
  }
  bag.add(pointer(stage, {
    move: (p) => { const h = hit(p); if (h !== hov) { hov = h; marks(); } },
    leave: () => { hov = null; marks(); },
  }));
  bag.add(() => svg.replaceChildren());
  apply();

  const go = (n) => { if (n !== step) { step = n; touched = true; apply(); } };
  return {
    set: (v) => go(clamp(Math.round(v), 1, 6)),
    input: (id) => { if (id === "next") go((step % 6) + 1); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "setup",
  means: "Two computers on a desk become one pool, step by step: app, cable, found, gate open, model in, chat across both.",
  rules: [1, 4, 5, 6, 8],
  range: [1, 3.5, 6],
  label: "step",
  controls: [{ id: "next", kind: "button", label: "next" }],
  tour: [[110, 110], [250, 190], null],
  mount,
});
