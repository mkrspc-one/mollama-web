/** Wired: two open laptops on a desk joined by a wired link; `way` picks how. Parts that differ grow in and out, staggered
 * out from the cable. The pointer, put on the desk, picks the nearest part of the target pose; it goes bright and is named. */
const { Cam, clamp, facing, fillet, fit, open, poly, proj, rad, rings, rrect, ringAt, unproj, prism, solid,
  spring, stepS, tween, tset, tval, tdone, mk, pointer, register, disposer } = HL;

const SIN = Math.sin(rad(15)), COS = Math.cos(rad(15)), SIDES = ["A", "B"];
const sock = (s, h, z0, z1) => [[s, -h, z0], [s, h, z0], [s, h, z1], [s, -h, z1]];
const USBC = [0, 4.5, -2.2, 2.2, 1.4, 3.6, 1.1];
const RJ = [[0, 7, -3.2, 3.2, 0.6, 4.2, 1], [1.5, 5.5, -1.3, 1.3, 4.2, 5.3, 0.6]];
const shift = (bs, ds, sg = 1) => bs.map((b) => [Math.min(sg * (b[0] + ds), sg * (b[1] + ds)), Math.max(sg * (b[0] + ds), sg * (b[1] + ds)), ...b.slice(2)]);
const across = (cs) => [[cs - 3.2, cs + 3.2, -3, 4, 0.6, 4.2, 1], [cs - 1.3, cs + 1.3, -1.5, 2.5, 4.2, 5.3, 0.6]];
/** Each part as boxes [s0, s1, w0, w1, z0, z1, r] in its frame, s running out from where it attaches, and the marks it really has. */
const KINDS = {
  AD: { len: 22, name: "adapter", solids: [USBC, [4.5, 10, -1, 1, 2, 3, 0.5], [10, 22, -5.5, 5.5, 0, 5.6, 2]], marks: [sock(22, 3.7, 0.7, 4.8)] },
  DG: { len: 12, name: "dongle", solids: [USBC, [4.5, 12, -4.4, 4.4, 0.4, 4.6, 1.6]], marks: [sock(12, 3.2, 2, 3.3)] },
  AA: { len: 15, name: "adapter", solids: [[0, 4, -3, 3, 2, 3.2, 0.4], [4, 15, -5.5, 5.5, 0, 5.6, 2]], marks: [sock(15, 3.7, 0.7, 4.8)] },
  TB: { len: 10, name: "plug", solids: [[0, 7.5, -2.9, 2.9, 0.9, 4.1, 1.4], [7.5, 10, -1.9, 1.9, 1.4, 3.6, 0.9]], marks: [] },
  RJ: { len: 7, name: "plug", solids: RJ, marks: [] },
  C: { name: "coupler", solids: [[-6, 6, -4.6, 4.6, 0, 5.8, 1.8]], marks: [[[0, -3.4, 5.8], [0, 3.4, 5.8]]] },
  C1: { name: "plug", solids: shift(RJ, 6, -1), marks: [] },
  C2: { name: "plug", solids: shift(RJ, 6), marks: [] },
  S: { name: "switch", solids: [[-19, 19, -17, -3, 0, 8.5, 3]], marks: [-13.5, -4.5, 4.5, 13.5].map((s) => [[s - 3.5, -3, 1], [s + 3.5, -3, 1], [s + 3.5, -3, 5.6], [s - 3.5, -3, 5.6]]) },
  S1: { name: "plug", solids: across(-13.5), marks: [] },
  S5: { name: "plug", solids: across(13.5), marks: [] },
};
const ORDER = ["AD", "DG", "AA", "TB", "RJ"], MID = ["C", "C1", "C2", "S", "S1", "S5"];
/** For each way: the chain out of A, the chain out of B, what sits in the middle, and whether each port is USB-C. */
const PLAN = { ethernet: ["RJ", "RJ", "", 0, 0], "usb-c adapters": ["AD RJ", "AD RJ", "", 1, 1], "usb-a adapter": ["DG AA RJ", "RJ", "", 1, 0],
  coupler: ["RJ", "RJ", "C C1 C2", 0, 0], switch: ["RJ", "RJ", "S S1 S5", 0, 0], thunderbolt: ["TB", "TB", "", 1, 1] };
const has = (list, k) => list.split(" ").includes(k);
const frame = (o, deg) => ({ o, d: [Math.cos(rad(deg)), Math.sin(rad(deg))], n: [-Math.sin(rad(deg)), Math.cos(rad(deg))] });
const at = (F, s, w) => [F.o[0] + F.d[0] * s + F.n[0] * w, F.o[1] + F.d[1] * s + F.n[1] * w];
/** A on the left with its port on its +x side, B on the right with its port on its +y side, M the low point of the cable. */
function frames(D) {
  const c = D / (2 * Math.SQRT2), m = 15.5 + 0.6 * (c - 7.5);
  return { c, A: frame([23 - c, c + 8], 0), B: frame([c + 8, 23 - c], 90), M: frame([m, m], -45) };
}

function mount({ stage, svg, read, controls = {} }, value) {
  const bag = disposer(), C = Cam(45, 0.5, 1.8), pts = [];
  for (const c of [100, 150].map((D) => D / (2 * Math.SQRT2))) pts.push([-c - 23, c + 16, 0], [-c - 23, c - 24, 36], [c + 16, -c - 23, 0], [c - 24, -c - 23, 36], [c + 12, c + 12, 0]);
  fit(C, pts, 200, 170);
  const P = proj(C), front = facing(C), Dsp = spring(value), kick = spring(0), rtw = tween(1.1);
  let plan = PLAN[controls.way] || PLAN["usb-c adapters"], sel = null, seating = false, litTill = 0;
  const g = mk("g", {}, svg), cache = new Map(), all = [], laps = {}, ports = {}, side = { A: [], B: [] }, mids = {}, runs = {};
  const set = (el, d) => { if (cache.get(el) !== d) { cache.set(el, d); el.setAttribute("d", d); } };
  const path = (cls, parent) => mk("path", { class: cls }, parent);
  for (const sd of SIDES) {
    const lg = mk("g", {}, g), base = solid(lg), lap = { name: "laptop", base, kb: path("nf lo", lg), tp: path("nf lo", lg) };
    ports[sd] = { name: "port", el: path("nf", lg), on: tween(plan[sd === "A" ? 3 : 4]) };
    Object.assign(lap, { back: path("lo", lg), face: path("sil", lg), scr: path("nf lo", lg) });
    ports[sd].hi = [ports[sd].el]; lap.hi = [base.sil, lap.face]; laps[sd] = lap; all.push(lap, ports[sd]);
  }
  const makePart = (key, sd, want) => {
    const pg = mk("g", {}, g), kind = KINDS[key], sol = kind.solids.map(() => solid(pg));
    const p = { key, side: sd, kind, name: kind.name, want, on: tween(want), sol, marks: kind.marks.map(() => path("nf lo", pg)), hi: sol.map((s) => s.sil) };
    all.push(p); return p;
  };
  mids.S = makePart("S", "M", +has(plan[2], "S"));
  const cg = mk("g", {}, g);
  for (const sd of SIDES) { runs[sd] = { name: "cable", band: path("fo", cg), edge: path("nf sil", cg) }; runs[sd].hi = [runs[sd].edge]; all.push(runs[sd]); }
  for (const [i, sd] of SIDES.entries()) for (const k of ORDER) side[sd].push(makePart(k, sd, +has(plan[i], k)));
  for (const k of MID) if (k !== "S") mids[k] = makePart(k, "M", +has(plan[2], k));
  const parts = [...side.A, ...side.B, ...MID.map((k) => mids[k])];

  /** Where everything is: now, or (tgt) in the target pose the pointer is tested against (rule 01). */
  function state(now, tgt) {
    const v = (p) => (tgt ? p.want : clamp(tval(p.on, now), 0, 1));
    const f = frames(tgt ? Dsp.t : Dsp.x), len = {}, pos = new Map();
    for (const sd of SIDES) {
      let acc = sd === "B" && !tgt ? kick.x : 0;
      for (const p of side[sd]) { const k = v(p); pos.set(p, [acc, k]); acc += p.kind.len * k; } len[sd] = acc;
    }
    for (const k of MID) pos.set(mids[k], [0, v(mids[k])]);
    return { f, len, pos, onC: v(mids.C), onS: v(mids.S), r: tgt ? (plan[0] === "TB" ? 1.8 : 1.1) : tval(rtw, now) };
  }
  /** The cable from one side's last part to the middle, a cubic in plan: it leaves straight and sags toward the viewer. */
  function cable(st, sd) {
    const F = st.f[sd], M = st.f.M, sg = sd === "A" ? -1 : 1, s = st.onS, p0 = at(F, st.len[sd] - 1, 0);
    const q = at(M, sg * (13 * st.onC + 13.5 * s), 4 * s), e0 = [-sg * M.d[0] * (1 - s) - M.n[0] * s, -sg * M.d[1] * (1 - s) - M.n[1] * s];
    const el = Math.hypot(...e0) || 1, L = 0.42 * Math.hypot(q[0] - p0[0], q[1] - p0[1]), e = [e0[0] / el, e0[1] / el];
    const p1 = [p0[0] + F.d[0] * L, p0[1] + F.d[1] * L], p2 = [q[0] - e[0] * L, q[1] - e[1] * L], out = [];
    for (let t = 0; t <= 1.001; t += 1 / 16) {
      const u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      out.push([0, 1].map((j) => w[0] * p0[j] + w[1] * p1[j] + w[2] * p2[j] + w[3] * q[j]));
    }
    return out; }
  const ringIn = (R, F, a) => R.map((q) => { const p = at(F, a + q.u, q.v); return { ...q, u: p[0], v: p[1], nu: F.d[0] * q.nu + F.n[0] * q.nv, nv: F.d[1] * q.nu + F.n[1] * q.nv }; });
  /** A part grows from where it attaches, by k from 0 to 1. */
  function drawPart(p, F, a, k) {
    if (k < 0.03) { p.sol.forEach((s) => { set(s.sil, ""); set(s.cr, ""); }); p.marks.forEach((m) => set(m, "")); return; }
    p.kind.solids.forEach(([s0, s1, w0, w1, z0, z1, r], i) => {
      const b = Math.min(0.8, ((s1 - s0) * k) / 3, ((w1 - w0) * k) / 3);
      const [ring, inner] = rings(s0 * k, w0 * k, s1 * k, w1 * k, r * k, b).map((R) => ringIn(R, F, a));
      const q = prism(P, front, ring, inner, z0 * k, z1 * k);
      set(p.sol[i].sil, q.sil); set(p.sol[i].cr, q.crease);
    });
    p.kind.marks.forEach((m, i) => {
      const sc = m.map(([s, w, z]) => P(...at(F, a + s * k, w * k), z * k));
      set(p.marks[i], sc.length === 2 ? open(sc) : poly(fillet(sc, [k, k, k, k])));
    });
  }
  function drawLaptop(sd, c) {
    const A = sd === "A", o = A ? [-c - 23, c - 16] : [c - 16, -c - 23], wa = A ? [1, 0] : [0, 1], fr = A ? [0, 1] : [1, 0], lap = laps[sd];
    const L = (u, f) => [o[0] + wa[0] * u + fr[0] * f, o[1] + wa[1] * u + fr[1] * f];
    const box = (u0, f0, u1, f1) => { const p = L(u0, f0), q = L(u1, f1); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
    const [ring, inner] = rings(...box(0, 0, 46, 32), 4, 1.6), bq = prism(P, front, ring, inner, 0, 5);
    set(lap.base.sil, bq.sil); set(lap.base.cr, bq.crease);
    set(lap.kb, poly(ringAt(P, rrect(...box(5, 5, 41, 16), 1.5, 3), 5)));
    set(lap.tp, poly(ringAt(P, rrect(...box(16, 19, 30, 29), 1.5, 3), 5)));
    const lid = (pts, th) => poly(pts.map(([u, v]) => P(...L(u, 1.5 - v * SIN - th * COS), 5 + v * COS - th * SIN)));
    const shape = fillet([[1, 0], [45, 0], [45, 30], [1, 30]], [0.8, 0.8, 2.6, 2.6]);
    set(lap.back, lid(shape, 1.4)); set(lap.face, lid(shape, 0));
    set(lap.scr, lid(fillet([[4, 3.5], [42, 3.5], [42, 27], [4, 27]], [1, 1, 1, 1]), 0));
  }
  function draw(now) {
    const st = state(now, false);
    for (const sd of SIDES) {
      drawLaptop(sd, st.f.c);
      const u = tval(ports[sd].on, now), sq = sock(0, 4.1 - 1.2 * u, 0.4 + 0.6 * u, 4.5 - 0.5 * u);
      set(ports[sd].el, poly(fillet(sq.map(([s, w, z]) => P(...at(st.f[sd], s, w), z)), Array(4).fill(0.6 + 1.2 * u))));
      const c = cable(st, sd), Lf = [], Rt = [];
      c.forEach((p, i) => {
        const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)], dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = (-(b[1] - a[1]) / dl) * st.r, ny = ((b[0] - a[0]) / dl) * st.r;
        Lf.push(P(p[0] + nx, p[1] + ny, st.r)); Rt.push(P(p[0] - nx, p[1] - ny, st.r));
      });
      set(runs[sd].band, poly([...Lf, ...Rt.slice().reverse()])); set(runs[sd].edge, open(Lf) + open(Rt));
    }
    for (const p of parts) { const [a, k] = st.pos.get(p); drawPart(p, st.f[p.side], a, k); }
  }

  /** The pointer, put on the desk: the nearest part of the target pose, within 6 units. */
  function pick(pt) {
    const st = state(0, true), F0 = frame([0, 0], 0); let best = null, bd = 6;
    const near = (p, dd) => { if (dd < bd) { bd = dd; best = p; } };
    const test = (p, F, a, k, boxes, pen = 0) => boxes.forEach((b) => {
      const rx = pt[0] - F.o[0], ry = pt[1] - F.o[1], s = rx * F.d[0] + ry * F.d[1] - a, w = rx * F.n[0] + ry * F.n[1];
      near(p, Math.hypot(Math.max(b[0] * k - s, 0, s - b[1] * k), Math.max(b[2] * k - w, 0, w - b[3] * k)) + pen);
    });
    for (const p of parts) { const [a, k] = st.pos.get(p); if (k) test(p, st.f[p.side], a, k, p.kind.solids); }
    for (const sd of SIDES) {
      const c = st.f.c; test(laps[sd], F0, 0, 1, [sd === "A" ? [-c - 23, -c + 23, c - 16, c + 16] : [c - 16, c + 16, -c - 23, -c + 23]], 1.5);
      test(ports[sd], st.f[sd], 0, 1, [[-3, 0, -4.5, 4.5]]);
      for (const q of cable(st, sd)) near(runs[sd], Math.hypot(pt[0] - q[0], pt[1] - q[1]) - st.r);
    }
    return best;
  }
  /** One bright place: what the pointer chose, else the cable just after it seats, else the far plug. */
  function refresh() {
    const lit = new Set();
    if (sel) { lit.add(sel); if (sel.name === "cable" && !plan[2]) lit.add(runs.A).add(runs.B); }
    else if (litTill) lit.add(runs.A).add(runs.B);
    else lit.add(side.B.find((p) => p.key === plan[1].split(" ").pop()));
    for (const h of all) h.hi.forEach((el) => el.classList.toggle("hi", lit.has(h)));
    read.textContent = sel ? sel.name : "rest";
  }
  /** A new way: what changes grows in or out, staggered from the cable out to the ports (rule 02). */
  function choose(way, now) {
    const old = plan; plan = PLAN[way] || plan; sel = null;
    for (const [i, sd] of SIDES.entries()) {
      const used = ORDER.slice().reverse().filter((k) => has(old[i] + " " + plan[i], k));
      side[sd].forEach((p) => { p.want = +has(plan[i], p.key); tset(p.on, p.want, now, Math.max(0, used.indexOf(p.key)) * 45); });
      tset(ports[sd].on, plan[i + 3], now, used.length * 45);
    }
    for (const k of MID) { mids[k].want = +has(plan[2], k); tset(mids[k].on, mids[k].want, now, 0); }
    tset(rtw, plan[0] === "TB" ? 1.8 : 1.1, now, 0);
  }

  const B = register(stage, (dt, now) => {
    let mv = stepS(Dsp, dt) | stepS(kick, dt);
    if (kick.t > 0 && kick.x > 6.3) { kick.t = 0; seating = true; }
    if (seating && kick.x < 0.4) { seating = false; litTill = now + 900; refresh(); }
    if (litTill && now > litTill) { litTill = 0; refresh(); }
    draw(now);
    for (const p of [...parts, ports.A, ports.B]) if (!tdone(p.on, now)) mv = 1;
    return !!mv || !tdone(rtw, now) || seating || litTill > 0;
  });
  bag.add(B.unregister);
  const choosePick = (p) => { if (p !== sel) { sel = p; refresh(); } };
  bag.add(pointer(stage, { move: (p) => choosePick(pick(unproj(C, p[0], p[1], 2))), leave: () => choosePick(null) }));
  bag.add(() => svg.replaceChildren());
  draw(performance.now()); refresh();

  const input = (id, v) => { if (id === "way") { choose(v, performance.now()); refresh(); } if (id === "plug" && !seating && !kick.t) kick.t = 7; B.wake(); };
  return { set: (v) => { Dsp.t = v; B.wake(); }, input, destroy: bag.dispose };
}

hairline({ name: "wired", label: "apart", range: [100, 125, 150], rules: [1, 2, 3, 4, 9, 10],
  means: "Six ways to wire two laptops together: pick a way and the parts between them change; the pointer names each part.",
  controls: [
    { id: "way", kind: "select", label: "way", options: ["ethernet", "usb-c adapters", "usb-a adapter", "coupler", "switch", "thunderbolt"], value: "usb-c adapters" },
    { id: "plug", kind: "button", label: "plug" }],
  tour: [[127, 194], [200, 218], [261, 201], null], mount });
