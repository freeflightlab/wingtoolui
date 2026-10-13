/* vlm.js — a vortex lattice over the wing as it actually sits in the air.
 *
 * ---------------------------------------------------------------------------
 * Why, when there is already a lifting line
 * ---------------------------------------------------------------------------
 * `liftingLine` solves Prandtl's equation by the Glauert series. It is the
 * right tool for a straight, flat, unswept wing and it is fast and exact for
 * one. A paraglider is none of those things.
 *
 * The arc is the problem. A paraglider is bent through 30 to 40 degrees of
 * dihedral from root to tip, and a lifting line has no way to represent that:
 * the model is a straight bound vortex on a flat span. This project handled it
 * by computing on the flat wing and applying a correction, which is a fair
 * approximation and is not the geometry.
 *
 * A vortex lattice puts a horseshoe on every spanwise strip **where the strip
 * really is**, with the strip's own normal. The arc then affects the answer
 * because the geometry says so, not because a factor was applied: an outboard
 * strip on a steeply banked part of the arc genuinely contributes less
 * vertical lift and genuinely sees different downwash from its neighbours.
 *
 * Sweep comes free for the same reason — the bound vortices lie along the
 * quarter-chord line wherever that line goes.
 *
 * ---------------------------------------------------------------------------
 * The method
 * ---------------------------------------------------------------------------
 * One horseshoe vortex per spanwise strip. The bound segment runs along the
 * quarter-chord line of the strip; two trailing legs run downstream to far
 * enough away to count as infinity. A control point sits at three-quarter
 * chord, mid-strip, which is where the flat-plate boundary condition is
 * satisfied exactly for a lifting surface.
 *
 * Requiring zero flow through the surface at every control point gives a
 * dense linear system in the circulations. It is solved by Gaussian
 * elimination with partial pivoting — for the forty or so strips a wing needs
 * that is instant, and an iterative solver would be more code for no gain.
 *
 * Lift comes from Kutta-Joukowski on each bound segment. Induced drag is
 * taken in the Trefftz plane, which is the numerically well-behaved way: the
 * near-field alternative differs from it by the error in the downwash at the
 * lifting line itself, and that is exactly where the model is weakest.
 */

const vCross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vNorm = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * Velocity at `p` from a straight vortex filament of unit strength from `a`
 * to `b`, by Biot-Savart.
 *
 * The core radius is not physical delicacy — a control point that lands on a
 * filament gives a division by zero, and on a swept wing the neighbouring
 * strip's bound vortex passes close. Below the core the contribution is
 * dropped, which is what a real lattice does.
 */
function filamentVelocity(p, a, b, core = 1e-7) {
  const r1 = vSub(p, a);
  const r2 = vSub(p, b);
  const r0 = vSub(b, a);
  const c = vCross(r1, r2);
  const cLen2 = vDot(c, c);
  const n1 = vNorm(r1);
  const n2 = vNorm(r2);
  if (cLen2 < core || n1 < core || n2 < core) return [0, 0, 0];
  const k = (vDot(r0, r1) / n1 - vDot(r0, r2) / n2) / (4 * Math.PI * cLen2);
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Gaussian elimination with partial pivoting. */
function solveDense(A, rhs) {
  const n = rhs.length;
  const M = A.map((row, i) => row.concat([rhs[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-14) {
      throw new Error('vortexLattice: the influence matrix is singular; '
        + 'two strips are probably in the same place');
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Solve the wing as a vortex lattice.
 *
 * `strips` describe the wing geometry directly: each is a spanwise slice with
 * its leading and trailing edge at both ends. That keeps this module free of
 * any assumption about how the wing was generated — an imported design and a
 * parametric one both reduce to the same thing.
 */
export function vortexLattice({
  strips, alphaDeg = 6, freestream = 1, farWake = 200,
}) {
  if (!strips?.length) throw new Error('vortexLattice needs strips');

  const alpha = (alphaDeg * Math.PI) / 180;
  const U = [freestream * Math.cos(alpha), 0, freestream * Math.sin(alpha)];

  // Geometry of each horseshoe: bound segment on the quarter-chord line,
  // control point at three-quarter chord.
  const panels = strips.map((s) => {
    const qc = (le, te) => [
      le[0] + (te[0] - le[0]) * 0.25,
      le[1] + (te[1] - le[1]) * 0.25,
      le[2] + (te[2] - le[2]) * 0.25,
    ];
    const tq = (le, te) => [
      le[0] + (te[0] - le[0]) * 0.75,
      le[1] + (te[1] - le[1]) * 0.75,
      le[2] + (te[2] - le[2]) * 0.75,
    ];
    const a = qc(s.leftLE, s.leftTE);
    const b = qc(s.rightLE, s.rightTE);
    const cpL = tq(s.leftLE, s.leftTE);
    const cpR = tq(s.rightLE, s.rightTE);
    const control = [(cpL[0] + cpR[0]) / 2, (cpL[1] + cpR[1]) / 2,
      (cpL[2] + cpR[2]) / 2];

    // The panel's own normal, from its diagonals. This is where the arc
    // enters: a strip out on the curve is tilted, and its normal says so.
    const d1 = vSub(s.rightTE, s.leftLE);
    const d2 = vSub(s.rightLE, s.leftTE);
    let n = vCross(d1, d2);
    const nl = vNorm(n);
    n = nl > 0 ? [n[0] / nl, n[1] / nl, n[2] / nl] : [0, 0, 1];
    // Point it upward, so a positive circulation means lift.
    if (n[2] < 0) n = [-n[0], -n[1], -n[2]];

    return { a, b, control, normal: n, span: vSub(b, a), strip: s };
  });

  const n = panels.length;
  const wake = [farWake * Math.cos(alpha), 0, farWake * Math.sin(alpha)];

  // A horseshoe's velocity: bound segment plus two trailing legs.
  const horseshoe = (p, panel) => {
    const aFar = [panel.a[0] + wake[0], panel.a[1] + wake[1], panel.a[2] + wake[2]];
    const bFar = [panel.b[0] + wake[0], panel.b[1] + wake[1], panel.b[2] + wake[2]];
    const v1 = filamentVelocity(p, aFar, panel.a);
    const v2 = filamentVelocity(p, panel.a, panel.b);
    const v3 = filamentVelocity(p, panel.b, bFar);
    return [v1[0] + v2[0] + v3[0], v1[1] + v2[1] + v3[1], v1[2] + v2[2] + v3[2]];
  };

  const A = [];
  const rhs = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) {
      row[j] = vDot(horseshoe(panels[i].control, panels[j]), panels[i].normal);
    }
    A.push(row);
    rhs.push(-vDot(U, panels[i].normal));
  }

  const gamma = solveDense(A, rhs);

  // Kutta-Joukowski on each bound segment, with the local velocity.
  const rho = 1.225;
  let lift = 0;
  let sideForce = 0;
  const loading = [];
  for (let i = 0; i < n; i++) {
    const vInduced = [0, 0, 0];
    for (let j = 0; j < n; j++) {
      const v = horseshoe(panels[i].control, panels[j]);
      vInduced[0] += v[0] * gamma[j];
      vInduced[1] += v[1] * gamma[j];
      vInduced[2] += v[2] * gamma[j];
    }
    const vLocal = [U[0] + vInduced[0], U[1] + vInduced[1], U[2] + vInduced[2]];
    const f = vCross(vLocal, panels[i].span);
    const Fz = rho * gamma[i] * f[2];
    const Fy = rho * gamma[i] * f[1];
    lift += Fz;
    sideForce += Fy;
    loading.push({
      y: (panels[i].a[1] + panels[i].b[1]) / 2,
      gamma: gamma[i],
      liftPerSpan: Fz / Math.max(1e-9, Math.abs(panels[i].span[1])),
    });
  }

  // Induced drag in the Trefftz plane: the wake far downstream carries the
  // whole of it, and the downwash there is half its far-field value.
  let di = 0;
  for (let i = 0; i < n; i++) {
    let w = 0;
    for (let j = 0; j < n; j++) {
      // Trailing legs only, seen edge-on in the wake plane.
      const yc = (panels[i].a[1] + panels[i].b[1]) / 2;
      const zc = (panels[i].a[2] + panels[i].b[2]) / 2;
      for (const [yv, zv, sign] of [
        [panels[j].a[1], panels[j].a[2], 1],
        [panels[j].b[1], panels[j].b[2], -1],
      ]) {
        const dy = yc - yv;
        const dz = zc - zv;
        const r2 = dy * dy + dz * dz;
        if (r2 < 1e-9) continue;
        w += (sign * gamma[j] * dy) / (2 * Math.PI * r2);
      }
    }
    // The half is not optional: induced drag in the Trefftz plane is
    // `Di = (rho/2) * integral(Gamma * w)`, because the wake rolls up over
    // the distance to that plane and the downwash there is twice what it is
    // at the lifting line.
    //
    // Without it an elliptical wing came out at an Oswald factor of 0.503
    // where it must be 1.0 — exactly double the drag, which is the shape of
    // error that tells you which factor is missing rather than leaving you
    // to hunt.
    di += 0.5 * rho * gamma[i] * w * Math.abs(panels[i].span[1]);
  }

  const area = strips.reduce((s, st) => {
    const c = (vNorm(vSub(st.leftTE, st.leftLE)) + vNorm(vSub(st.rightTE, st.rightLE))) / 2;
    return s + c * Math.abs(st.rightLE[1] - st.leftLE[1]);
  }, 0);
  const span = Math.max(...panels.map((p) => Math.max(p.a[1], p.b[1])))
    - Math.min(...panels.map((p) => Math.min(p.a[1], p.b[1])));
  const q = 0.5 * rho * freestream * freestream;

  return {
    panels: n,
    gamma,
    loading,
    areaM2: area,
    spanM: span,
    aspectRatio: area > 0 ? (span * span) / area : 0,
    liftN: lift,
    sideForceN: sideForce,
    inducedDragN: Math.abs(di),
    CL: area > 0 ? lift / (q * area) : 0,
    CDi: area > 0 ? Math.abs(di) / (q * area) : 0,
    // Span efficiency against the elliptical ideal.
    oswald: (() => {
      const CL = area > 0 ? lift / (q * area) : 0;
      const CDi = area > 0 ? Math.abs(di) / (q * area) : 0;
      const AR = area > 0 ? (span * span) / area : 0;
      return CDi > 0 ? (CL * CL) / (Math.PI * AR * CDi) : 0;
    })(),
    alphaDeg,
    note: `${n} strips, CL ${(area > 0 ? lift / (q * area) : 0).toFixed(4)}`,
  };
}

/** Strips from a built wing, mirrored to the whole span. */
export function stripsFromWing(wing) {
  if (!wing?.ribs?.length) throw new Error('stripsFromWing needs a wing');
  const edge = (rib) => ({
    le: rib.upper[0],
    te: rib.upper[rib.upper.length - 1],
  });
  const out = [];
  // The modelled half, then its mirror, so the lattice sees the whole wing:
  // a half-wing lattice would have a free edge at the centreline and shed a
  // vortex there that does not exist.
  for (let i = 0; i < wing.ribs.length - 1; i++) {
    const a = edge(wing.ribs[i]);
    const b = edge(wing.ribs[i + 1]);
    out.push({ leftLE: a.le, leftTE: a.te, rightLE: b.le, rightTE: b.te });
    const m = (p) => [p[0], -p[1], p[2]];
    out.push({
      leftLE: m(b.le), leftTE: m(b.te), rightLE: m(a.le), rightTE: m(a.te),
    });
  }
  return out;
}
