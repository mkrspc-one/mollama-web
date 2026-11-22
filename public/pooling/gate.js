/**
 * Yard: a home as a round yard walled all round. Inside, a tower and a laptop share one model; words run
 * between them as beads. Strangers' phones stand outside. Public Wi-Fi sinks the wall, lifts the cable into
 * a dashed arc and lets every stranger's line reach it, each at its own place; sleep closes the laptop and the words stop.
 */
const {
  Cam, circ, clamp, rad, facing, fit, lerp, open, physics, poly, prism, proj, put, rings, rrect, seg, unproj,
  tween, tset, tval, disposer, mk, place, pointer, register, solid,
} = HL;

const GR = 92, R = 56, WT = 3.5, WH = 9, PB = 4, NR = 64, SR = 78, PH = 20, TH = 38, LH = 20, OPEN = 16, SHUT = -90;
const SA = [45, 105, -35, 160, -110].map(rad);
const ST = SA.map((a) => [SR * Math.cos(a), SR * Math.sin(a)]);
const TX = -20, TY = 20, HX = 6, CAB = [[-11, 18], [4, 22], [10, 6], [16, 1]];
const A0 = [-20, 20, TH - 3], A1 = [1, -15, 3 + LH], ARC = 14, TAP = [0.5, 0.34, 0.66, 0.2, 0.8];

/** A point on the link at t (tower to laptop): along the ground at m 0, an arc through the air at m 1. */
function linkPt(t, m) {
  const s = 1 - t, b = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
  const gx = b.reduce((a, w, j) => a + w * CAB[j][0], 0), gy = b.reduce((a, w, j) => a + w * CAB[j][1], 0);
  const az = lerp(A0[2], A1[2], t) + ARC * Math.sin(Math.PI * t);
  return [lerp(gx, lerp(A0[0], A1[0], t), m), lerp(gy, lerp(A0[1], A1[1], t), m), lerp(0.8, az, m)];
}

function mount({ stage, svg, read, controls = {} }, value) {
  const bag = disposer();
  let nT = clamp(Math.round(value), 1, 5), pub = !!controls.public, pick = null, sleepAt = -1, phase = 0;

  // Fitted to the ground's edge, the tower and the arc at its height.
  const C = Cam(45, 0.5, 1.58);
  fit(C, [[-GR, 0, -PB], [GR, 0, -PB], [0, -GR, -PB], [0, GR, -PB], [TX, TY, TH], [-10, 3, 44]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);
  const setD = (el, d) => { if (el.dd !== d) { el.dd = d; el.setAttribute("d", d); } };
  const block = (parent, x0, y0, x1, y1, r, b, z0, z1) => { const s = solid(parent), [o, i] = rings(x0, y0, x1, y1, r, b); put(s, prism(P, front, o, i, z0, z1)); return s; };

  // The ground, then the strangers: a phone each, standing outside the wall.
  put(solid(g), prism(P, front, circ(GR, 96), circ(GR - 2, 96), -PB, 0));
  const S = ST.map(([x, y], i) => { const sg = mk("g", {}, g); return { i, x, y, g: sg, s: solid(sg), scr: mk("path", { class: "nf lo" }, sg), btn: mk("circle", { r: 0.9, class: "dot off" }, sg), h: tween(i < nT ? 1 : 0), drawn: NaN }; });

  // The wall: one round band on the yard's plate, its height per sample so it can sink round the rim.
  const outer = circ(R, NR), inner = circ(R - WT, NR), fr = outer.map(front);
  const yard = mk("g", {}, g);
  const [body, lip, foot, rim] = ["sil", "nf lo", "nf lo", "nf"].map((c) => mk("path", { class: c }, yard));
  const wt = outer.map(() => tween(pub ? 0 : 1));
  let wo = SA[0], wa = 0;
  /** The wall's target: sunk on public Wi-Fi, a little higher under the pointer; staggered round the rim from wo. */
  function wallTo() {
    const now = performance.now(), to = pub ? 0 : pick === "wall" ? 1.35 : 1;
    outer.forEach((q, k) => { const e = Math.abs(Math.atan2(q.v, q.u) - wo); tset(wt[k], to, now, (Math.min(e, 2 * Math.PI - e) / Math.PI) * 360); });
  }
  const last = fr.findIndex((f, k) => f && !fr[(k + 1) % NR]), order = outer.map((_, j) => (last + 1 + j) % NR);
  let wallKey = "";
  function drawWall(now) {
    const h = wt.map((tw) => WH * tval(tw, now)), key = h.map((v) => v.toFixed(2)).join();
    if (key === wallKey) return; wallKey = key;
    const top = (k) => P(outer[k].u, outer[k].v, h[k]), sil = [], lipPts = [];
    order.forEach((k, j) => {
      if (!fr[k]) return sil.push(top(k));
      const prev = fr[order[(j + NR - 1) % NR]], next = fr[order[(j + 1) % NR]];
      if (!prev) sil.push(top(k));
      sil.push(P(outer[k].u, outer[k].v, 0));
      if (!next) sil.push(top(k));
      lipPts.push(top(k));
    });
    setD(body, poly(sil)); setD(lip, open(lipPts));
    setD(foot, open(order.filter((k) => !fr[k]).map((k) => P(inner[k].u, inner[k].v, 0))));
    setD(rim, poly(inner.map((q, k) => P(q.u, q.v, h[k]))));
  }

  // The tower: a drive bay, three vents and a power light on the side facing the laptop.
  const tower = mk("g", {}, g), tw = block(tower, TX - 9, TY - 9, TX + 9, TY + 9, 3, 1.2, 0, TH);
  mk("path", { d: [33, 31, 9, 7, 5].map((z) => seg(P(TX + 9, TY - 5, z), P(TX + 9, TY + 5, z))).join(""), class: "nf lo" }, tower);
  place(mk("circle", { r: 1.2, class: "dot off" }, tower), P(TX + 9, TY, 24));

  // The link and its beads, the words between the two computers.
  const link = mk("g", {}, g), cab = mk("path", { class: "nf sil" }, link);
  const beads = [0, 1, 2].map(() => mk("circle", { r: 1.5, class: "dot m" }, link));

  // The laptop: a base with its keys, and a lid hinged at the back that can close.
  const lap = mk("g", {}, g), lidG = mk("g", {}, lap), base = mk("g", {}, lap);
  const back = mk("path", { class: "lo" }, lidG), face = mk("path", { class: "sil" }, lidG), glass = mk("path", { class: "nf lo" }, lidG);
  const bs = block(base, HX, -30, HX + 22, 0, 3, 1.2, 0, 3);
  mk("path", { d: poly(rrect(HX + 5, -26, HX + 18, -4, 1.5, 4).map((q) => P(q.u, q.v, 3))), class: "nf lo" }, base);
  const lidA = tween(OPEN), lidRing = rrect(-28, 0, -2, LH, 2.5, 4), glassRing = rrect(-25, 3, -5, LH - 3, 1.5, 4);
  let lidDrawn = NaN, shut = false;
  function drawLid(now) {
    const a = rad(tval(lidA, now));
    if (a === lidDrawn) return; lidDrawn = a;
    const at = (u, v, d) => P(HX - v * Math.sin(a) - d * Math.cos(a), u, 3 + v * Math.cos(a) - d * Math.sin(a));
    [[back, lidRing, 1.4], [face, lidRing, 0], [glass, glassRing, 0]].forEach(([el, ring, d]) => setD(el, poly(ring.map((q) => at(q.u, q.v, d)))));
    if (shut !== a < rad(-50)) {
      if ((shut = !shut)) { lap.append(lidG); lidG.append(back); } else { lap.prepend(lidG); lidG.prepend(back); }
    }
  }

  // The strangers' reach: a dashed line from each phone that stands to its own place on the arc.
  const reach = mk("g", {}, g), taps = S.map(() => mk("path", { class: "nf dash" }, reach)), rt = tween(pub ? 1 : 0), mode = tween(pub ? 1 : 0);
  let air = null, linkKey = "", reachKey = ""; for (const s of S) (s.x + s.y < 0 ? yard : reach).before(s.g);

  function drawStranger(s, now) {
    const h = tval(s.h, now);
    if (h === s.drawn) return; s.drawn = h;
    s.g.setAttribute("display", h < 0.02 ? "none" : "inline");
    const [o, i] = rings(s.x - 1.2, s.y - 5, s.x + 1.2, s.y + 5, 1.2, 0.4);
    put(s.s, prism(P, front, o, i, 0, PH * h));
    setD(s.scr, poly(rrect(s.y - 3.6, 4, s.y + 3.6, PH - 2.2, 1, 3).map((q) => P(s.x + 1.2, q.u, q.v * h))));
    place(s.btn, P(s.x + 1.2, s.y, 2 * h));
  }

  const B = register(stage, (dt, now) => {
    const m = tval(mode, now);
    if (air !== m > 0.5) { air = m > 0.5; (air ? lap : tower).after(link); }
    if (sleepAt >= 0 && now - sleepAt > 2000) { sleepAt = -1; tset(lidA, OPEN, now, 0); marks(); }
    if (sleepAt < 0) phase = (phase + (dt * physics().speed) / 2.4) % 1;
    drawWall(now);
    S.forEach((s) => drawStranger(s, now));
    drawLid(now);
    if (m.toFixed(3) !== linkKey) {
      linkKey = m.toFixed(3);
      setD(cab, open(Array.from({ length: 33 }, (_, j) => P(...linkPt(j / 32, m))))); cab.classList.toggle("dash", m > 0.5);
    }
    beads.forEach((b, k) => { const q = linkPt((phase + k / 3) % 1, m); place(b, P(q[0], q[1], q[2] + 1.2 * (1 - m))); });
    const f = tval(rt, now), hs = S.map((s) => tval(s.h, now)), rk = f.toFixed(3) + m.toFixed(3) + hs.map((h) => h.toFixed(2)).join();
    if (rk !== reachKey) {
      reachKey = rk;
      S.forEach((s, i) => {
        const e = f * hs[i], a = P(s.x, s.y, PH * hs[i] + 2), b = P(...linkPt(TAP[i], m));
        setD(taps[i], e < 0.01 ? "" : open([a, [lerp(a[0], b[0], e), lerp(a[1], b[1], e)]]));
      });
    }
    return true;
  });
  bag.add(B.unregister);

  /** One bright place: what the pointer picked, else the closed laptop, else the stranger's reach, else the rim. */
  function marks() {
    const sleeping = sleepAt >= 0, on = sleeping ? "laptop" : pick || (pub ? "reach" : "wall");
    [[rim, "wall"], [taps[0], "reach"], [tw.sil, "tower"], [cab, "cable"], [face, "laptop"], [bs.sil, "laptop"], ...S.map((s) => [s.s.sil, "s" + s.i])]
      .forEach(([el, id]) => el.classList.toggle("hi", on === id));
    beads.forEach((b) => b.setAttribute("class", sleeping ? "dot off" : "dot m"));
    read.textContent = sleeping ? "stopped" : pick ? (pick === "wall" ? "home" : pick[0] === "s" ? "stranger" : "pool") : pub ? "public" : "rest";
  }

  const near = (p, a, b, r) => {
    const vx = b[0] - a[0], vy = b[1] - a[1], u = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1), 0, 1);
    return Math.hypot(p[0] - a[0] - u * vx, p[1] - a[1] - u * vy) < r;
  };
  /** Picks from the rest poses: standing parts by their upright axis on screen, the cable and wall on the ground. */
  function hit(p) {
    for (let i = 0; i < nT; i++) if (near(p, P(ST[i][0], ST[i][1], 0), P(ST[i][0], ST[i][1], PH), 10)) return "s" + i;
    if (near(p, P(TX, TY, 0), P(TX, TY, TH), 15)) return "tower";
    if (near(p, P(HX + 11, -15, 2), P(HX - 4, -15, LH), 15)) return "laptop";
    for (let j = 0; j < 24; j++) if (near(p, P(...linkPt(j / 24, +pub)), P(...linkPt((j + 1) / 24, +pub)), 6)) return "cable";
    const w = unproj(C, p[0], p[1], WH / 2), r = Math.hypot(w[0], w[1]);
    wa = Math.atan2(w[1], w[0]);
    return r > R - WT - 5 && r < R + 5 ? "wall" : null;
  }

  bag.add(pointer(stage, {
    move: (p) => { const h = hit(p); if (h !== pick) { if (h === "wall") wo = wa; pick = h; wallTo(); marks(); B.wake(); } },
    leave: () => { pick = null; wallTo(); marks(); B.wake(); },
  }));
  bag.add(() => svg.replaceChildren()); marks();

  function setPublic(on) {
    const now = performance.now(); pub = on; wo = SA[0];
    wallTo();
    tset(mode, on ? 1 : 0, now, on ? 120 : 0); tset(rt, on ? 1 : 0, now, on ? 500 : 0);
    marks(); B.wake();
  }

  return {
    set: (v) => {
      const n = clamp(Math.round(v), 1, 5), now = performance.now(), a = Math.max(n, nT) - 1;
      if (n === nT) return; nT = n;
      S.forEach((s) => tset(s.h, s.i < n ? 1 : 0, now, Math.abs(s.i - a) * 45));
      if (pick && pick[0] === "s" && +pick[1] >= n) { pick = null; marks(); }
    },
    input: (id, v) => {
      if (id === "public") setPublic(!!v);
      if (id === "sleep" && sleepAt < 0) { sleepAt = performance.now(); tset(lidA, SHUT, sleepAt, 0); marks(); }
    },
    destroy: bag.dispose,
  };
}

hairline({
  name: "yard",
  means: "Two of your computers share a model inside a walled yard; on public Wi-Fi the wall drops and every stranger nearby reaches the link.",
  rules: [1, 2, 4, 7, 9],
  range: [1, 3, 5],
  label: "strangers",
  controls: [
    { id: "public", kind: "switch", label: "public wifi", value: false },
    { id: "sleep", kind: "button", label: "sleep" },
  ],
  tour: [[263, 189], [93, 173], [192, 179], null],
  mount,
});
