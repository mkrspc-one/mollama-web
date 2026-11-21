/**
 * Shelf: two computers, a small tower at the back and a laptop in front, each
 * with a shelf beside it for its memory. The model is a stack of layer plates,
 * one plate per 2 GB. Plates fill the laptop's shelf first; past its 16 GB the
 * rest slide across to the tower's shelf, staggered from the first that
 * crossed. With pool off, the tower's shelf empties and the plates that do not
 * fit lean out over the edge of the laptop's shelf, dim. The pointer picks a
 * shelf (tested against the fixed rest volumes) and the read-out says what it holds.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, poly, proj, prism, rad, ringAt, rings, rrect, seg,
  tset, tval, tdone, tween, disposer, mk, place, pointer, put, register, solid,
} = HL;

const CAP = 8, GB = 2, MAXN = 16, T = 2.6, PITCH = 3.4, SPREAD = 5.4, PW = 30, PY0 = 5, PY1 = 31, STEP = 45;
const LX = 5.5, MX = 57, MID = 31, BH = CAP * PITCH;
const TRAYS = [[0, 1, 38, 35], [49, -1, 95, 37]];
const TW = [-28, 6, -4, 30, 54], LAP = [104, 6, 146, 34];
const count = (v) => clamp(Math.round(v / GB), 4, MAXN);

function mount({ stage, svg, read, controls = {} }, value) {
  const bag = disposer();
  let pool = controls.pool ?? true, n = count(value), act = -1;

  // Fitted to the tallest poses: the tower, and the leaning stack with pool off at 32 GB.
  const C = Cam(45, 0.5, 1.62);
  fit(C, [[TW[0], TW[1], 0], [TW[0], TW[1], TW[4]], [TW[2], TW[3], -4], [0, 35, -4], [49, 37, -4], [95, 37, -4],
    [146, 34, 0], [146, 0, 31], [MX - 24, PY0, MAXN * SPREAD]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);
  const box = (x0, y0, x1, y1, z0, z1, r, b) => {
    const [ring, inner] = rings(x0, y0, x1, y1, r, b), s = solid(g);
    put(s, prism(P, front, ring, inner, z0, z1));
    return s;
  };
  const line = (d, cls) => mk("path", { d, class: cls }, g);

  // The lender: a small tower, two drive bays, vents and a power dot on its face.
  box(TW[0], TW[1], TW[2], TW[3], 0, TW[4], 3, 1.4);
  const face = (x, z) => P(x, TW[3], z);
  const onFace = (x0, z0, x1, z1) => poly(rrect(x0, z0, x1, z1, 1.2, 3).map((q) => face(q.u, q.v)));
  line(onFace(-23, 42, -9, 46) + onFace(-23, 35, -9, 39), "nf lo");
  line([8, 11, 14].map((z) => seg(face(-21, z), face(-11, z))).join(""), "nf lo");
  place(mk("circle", { r: 1.2, class: "dot off" }, g), face(-16, 49.5));

  // A shelf: a base slab and two back posts as tall as what it holds; plates go in its layer.
  const trays = TRAYS.map(([x0, y0, x1, y1]) => {
    const base = box(x0, y0, x1, y1, -4, 0, 4, 1.6);
    const posts = [[x0 + 1, y0 + 1], [x1 - 4.5, y0 + 1]].map(([x, y]) => box(x, y, x + 3.5, y + 3.5, 0, BH + 0.6, 1.6, 0.6));
    return { rim: [base, ...posts], layer: mk("g", {}, g) };
  });

  // The main computer: a laptop, its keyboard and trackpad, and a screen leaning back from the hinge.
  box(LAP[0], LAP[1], LAP[2], LAP[3], 0, 3, 3, 1.2);
  const flat = (x0, y0, x1, y1) => poly(rrect(x0, y0, x1, y1, 1.5, 3).map((q) => P(q.u, q.v, 3)));
  line(flat(108, 11, 142, 22) + flat(119, 25, 131, 31), "nf lo");
  line([14.7, 18.3].map((y) => seg(P(110, y, 3), P(140, y, 3))).join(""), "nf lo");
  const s = Math.sin(rad(14)), c = Math.cos(rad(14));
  const w = (u, v, t) => P(u, 8 - v * s - t * c, 3 + v * c - t * s);
  const screen = fillet([[106, 0], [144, 0], [144, 28], [106, 28]], [1, 1, 3, 3]);
  const bezel = fillet([[109, 3.5], [141, 3.5], [141, 25], [109, 25]], [1.5, 1.5, 1.5, 1.5]);
  line(poly(screen.map((p) => w(p[0], p[1], 1.4))), "lo");
  line(poly(screen.map((p) => w(p[0], p[1], 0))), "sil");
  line(poly(bezel.map((p) => w(p[0], p[1], 0))), "nf lo");

  // Where plate i belongs: the main shelf, the lender's, or leaning out over the main shelf's edge.
  // A chosen shelf spreads its plates apart, so its layers can be counted.
  const pitch = (k) => (act === k ? SPREAD : PITCH);
  const goal = (i) => (i < CAP ? [MX, i * pitch(1), false] : pool ? [LX, (i - CAP) * pitch(0), false]
    : [MX - clamp(5 + (i - CAP) * 2.6, 0, 24), i * pitch(1), true]);
  const plates = [];
  for (let i = 0; i < MAXN; i++) {
    const [x, z, lo] = goal(i), el = solid(g);
    el.g.remove();
    plates.push({ el, x: tween(x), z: tween(z), tx: x, tz: z, lo, dx: NaN, dz: NaN });
  }

  /** Retargets every plate, staggered by distance from plate a. Rising goes up then across; falling across then down. */
  function settle(a) {
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const p = plates[i], [x, z, lo] = goal(i), d = Math.abs(i - a) * STEP;
      const lag = x !== p.tx ? 220 : 0, up = z > p.tz;
      tset(p.x, x, now, d + (up ? lag : 0));
      tset(p.z, z, now, d + (up ? 0 : lag));
      p.tx = x; p.tz = z; p.lo = lo;
    }
  }

  /** Each plate goes in the layer of the shelf it is over, painted bottom up. */
  function order() {
    const sets = [[], []];
    for (let i = 0; i < n; i++) sets[plates[i].dx < MID ? 0 : 1].push(plates[i]);
    for (let i = n; i < MAXN; i++) if (plates[i].el.g.isConnected) plates[i].el.g.remove();
    sets.forEach((list, k) => {
      list.sort((a, b) => a.dz - b.dz);
      const L = trays[k].layer;
      if (list.length !== L.children.length || list.some((p, j) => L.children[j] !== p.el.g)) for (const p of list) L.append(p.el.g);
    });
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (let i = 0; i < n; i++) {
      const p = plates[i], x = tval(p.x, now), z = tval(p.z, now);
      if (x !== p.dx || z !== p.dz) {
        p.dx = x; p.dz = z;
        const [ring, inner] = rings(x, PY0, x + PW, PY1, 3, 1.2);
        put(p.el, prism(P, front, ring, inner, z, z + T));
      }
      if (!tdone(p.x, now) || !tdone(p.z, now)) moving = true;
    }
    order();
    return moving;
  });
  bag.add(B.unregister);

  /** One bright place: the chosen shelf; at rest the model's last layer, or the idle shelf when pool is off. */
  function light() {
    const mark = act >= 0 ? -1 : n > CAP && !pool ? -2 : n - 1;
    trays.forEach((t, k) => {
      const on = act === k || (k === 0 && mark === -2);
      t.rim.forEach((r) => r.sil.classList.toggle("hi", on));
    });
    plates.forEach((p, i) => p.el.sil.setAttribute("class", i === mark ? "sil hi" : p.lo && i < n ? "lo" : "sil"));
    const over = n - CAP;
    read.textContent = act < 0 ? "rest" : act === 0 ? (pool ? Math.max(0, over) * GB : 0) + " GB"
      : over > 0 && !pool ? CAP * GB + "+" + over * GB + " GB" : Math.min(n, CAP) * GB + " GB";
    B.wake();
  }

  // Hit volumes: each computer with its shelf, as boxes at rest. They never move.
  const zone = (x0, y0, x1, y1, h) => hull([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].flatMap(([x, y]) => [P(x, y, -4), P(x, y, h)]));
  const zones = [zone(-28, 1, 38, 35, TW[4]), zone(49, -1, 146, 37, BH + 6)];
  const mids = zones.map((z) => z.reduce((m, q) => [m[0] + q[0] / z.length, m[1] + q[1] / z.length], [0, 0]));
  const inside = (pg, [x, y]) => {
    const sg = pg.map((a, k) => { const b = pg[(k + 1) % pg.length]; return Math.sign((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])); });
    return sg.every((v) => v >= 0) || sg.every((v) => v <= 0);
  };
  const spill = zone(MX - 24, PY0, MX + PW, PY1, MAXN * SPREAD);
  function hit(p) {
    if (!pool && n > CAP && inside(spill, p)) return 1;
    let best = -1, bd = Infinity;
    zones.forEach((z, k) => {
      const d = Math.hypot(p[0] - mids[k][0], p[1] - mids[k][1]);
      if (inside(z, p) && d < bd) { best = k; bd = d; }
    });
    return best;
  }
  const choose = (k) => {
    if (k === act) return;
    const from = k >= 0 ? k : act;
    act = k;
    settle(from === 1 ? 0 : CAP);
    light();
  };

  bag.add(pointer(stage, { move: (p) => choose(hit(p)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());
  light();

  return {
    set: (v) => {
      const m = count(v), old = n;
      if (m === n) return;
      n = m;
      for (let i = old; i < n; i++) {
        const p = plates[i], [x, z] = goal(i);
        const st = x === LX ? [MX - 6, i * PITCH + 4] : [x, z + 14];
        p.x = tween(st[0]); p.z = tween(st[1]); p.tx = st[0]; p.tz = st[1]; p.dx = NaN;
      }
      settle(Math.min(old, n));
      light();
    },
    input: (id, v) => { if (id === "pool") { pool = v; settle(CAP); light(); } },
    destroy: bag.dispose,
  };
}

hairline({
  name: "shelf",
  means: "A model's layers fill the main computer's shelf first; past its 16 GB the rest spill over to a pooled computer's shelf.",
  rules: [1, 2, 3, 4],
  range: [8, 20, 32],
  label: "model gb",
  controls: [{ id: "pool", kind: "switch", label: "pool", value: true }],
  tour: [[198, 178], [139, 148], null],
  mount,
});
