/* stability.js — the glider's stability, found as a kite's is, and then
 * its modes.
 *
 * ---------------------------------------------------------------------------
 * The derivatives
 * ---------------------------------------------------------------------------
 * Poland, Masure, Cayon and Schmehl (2026, Wind Energy Science 11, 4147,
 * section 5.5) judge a kite's stability by its quasi-steady rigid-body
 * derivatives: the six force and moment coefficients, differenced centrally
 * in the angle of attack and the sideslip (0.005 rad either side) and in the
 * roll, pitch and yaw rates (0.1 rad/s either side), at the trim. Statically
 * stable is
 *
 *     roll   dCl/dbeta  < 0      pitch  dCm/dalpha < 0      yaw  dCn/dbeta > 0
 *
 * and damped is a negative dCl/dp^, dCm/dq^ and dCn/dr^, the rates made
 * dimensionless as p^ = p b / 2V, q^ = q c / 2V, r^ = r b / 2V. All of it is
 * in the body's axes, x forward, y right, z down.
 *
 * A kite turns about its tow point, the tether holding it; the paper takes
 * its moments there, and notes that a kite's anhedral is what steadies it in
 * roll, where an aeroplane, turning about its centre of mass, needs dihedral.
 * A paraglider is a kite whose tether is its pilot's weight. It flies free,
 * so it turns about its centre of mass, and its centre of mass hangs most of
 * a line's length below the canopy: the arc's sideslip force, high above
 * it, steadies it as a kite's does. The moments here are taken about the
 * centre of the solid mass (the weight's line of action: canopy, lines and
 * pilot, not the air inside), and about the riser midpoint for comparison
 * with the paper's tow point. The forces are everything aerodynamic on the
 * glider: the canopy's strips, the pilot's drag and the lines'.
 *
 * Coefficients are on the projected area and span, as the paper's are, and
 * as aircraft practice takes them: Cl and Cn on the span, Cm on the mean
 * chord c = S / b. (The tool's polar elsewhere is on the flat area.)
 *
 * ---------------------------------------------------------------------------
 * The modes
 * ---------------------------------------------------------------------------
 * The paper leaves dynamic stability to a modal analysis. The flight model
 * (flight.js) is one already: the six-degree-of-freedom rigid body with its
 * apparent mass. Linearised at the trim by central differences of its own
 * equations of motion, in the velocity and rotation of the riser midpoint
 * and the roll and pitch angles, it separates into a longitudinal block
 * (u, w, q, theta) and a lateral one (v, p, r, phi) — the trim is symmetric,
 * so the coupling between them is the differences' rounding — and each
 * block's eigenvalues are its modes: a frequency and a damping, or a pure
 * growth or decay. The heading and the position do not feed back and are
 * left out.
 */

import { flightForces, flightDerivative, flightWork, flightQuaternion, flightTrim } from './flight.js';

/** What the analysis uses unless told otherwise. */
export const STABILITY = Object.freeze({
  angleStepRad: 0.005,       // Poland et al. (2026): alpha and beta, either side
  rateStepRadS: 0.1,         // and the body rates
  couplingTol: 1e-11,        // the alpha method as tight as the trim's
  couplingIterations: 600,
  linVelocityFraction: 0.005, // the linearisation: velocity steps, of the speed
  linRateRadS: 0.01,         // rate steps
  linAngleRad: 0.005,        // roll and pitch angle steps
});

const ST_RAD = Math.PI / 180;
const stCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The coefficients' names, in their order. */
export const STABILITY_COEFFICIENTS = Object.freeze(['CX', 'CY', 'CZ', 'Cl', 'Cm', 'Cn']);

/** The projected area and span the coefficients are on, and the mean chord. */
export function stabilityReference(model) {
  const am = model.apparent;
  let S = am?.projectedAreaM2;
  if (!(S > 0)) {
    S = 0;
    model.sys.panels.forEach((p, i) => { S += model.area[i] * Math.abs(p.normal[2]); });
  }
  const b = am?.projectedSpanM > 0 ? am.projectedSpanM : 2 * model.tipY;
  return { areaM2: S, spanM: b, chordM: S / b };
}

/** A workspace for the model held as tight as the trim held it, started
 * from the trim's corrections. */
function stWork(model, trim, cfg) {
  const w = flightWork(model);
  if (trim?.work?.d) w.d.set(trim.work.d);
  w.tol = cfg.couplingTol; w.maxIterations = cfg.couplingIterations;
  return w;
}

/**
 * The derivatives at the trim (`flightTrim`), about the centre of the solid
 * mass ('cg') or the riser midpoint ('riser').
 *
 * Returns the coefficients at the trim, their derivatives (`d.alpha`,
 * `d.beta` per radian; `d.p`, `d.q`, `d.r` per dimensionless rate), each an
 * array in `STABILITY_COEFFICIENTS`' order, and the six criteria.
 */
export function stabilityDerivatives(model, trim, { about = 'cg', ...opts } = {}) {
  const cfg = { ...STABILITY, ...opts };
  const ref = stabilityReference(model);
  const { areaM2: S, spanM: b, chordM: c } = ref;
  const V = trim.speed;
  const a0 = trim.alphaDeg * ST_RAD;
  const q0 = trim.state.slice(3, 7);
  const r0 = about === 'riser' ? [0, 0, 0] : model.rSolidB;
  const work = stWork(model, trim, cfg);
  const qS = 0.5 * model.rho * V * V * S;
  const lengths = [1, 1, 1, b, c, b];
  const coeffs = ({ alpha = a0, beta = 0, p = 0, q = 0, r = 0 }) => {
    const ca = Math.cos(alpha); const sa = Math.sin(alpha); const cb = Math.cos(beta); const sb = Math.sin(beta);
    const vRef = [V * ca * cb, V * sb, V * sa * cb];
    const w = [p, q, r];
    // the riser midpoint moves with the reference point, and the turn about it
    const wr = stCross(w, r0);
    const x = Float64Array.from([0, 0, -model.cfg.altitudeM, ...q0, vRef[0] - wr[0], vRef[1] - wr[1], vRef[2] - wr[2], p, q, r]);
    const f = flightForces(model, x, { left: 0, right: 0 }, work);
    const F = f.aero;
    const M = f.aeroM;
    const rxF = stCross(r0, F);
    const Mr = [M[0] - rxF[0], M[1] - rxF[1], M[2] - rxF[2]];
    const all = [...F, ...Mr];
    return all.map((v, k) => v / (qS * lengths[k]));
  };
  const C0 = coeffs({});
  const da = cfg.angleStepRad; const dr = cfg.rateStepRadS;
  const diff = (plus, minus, h) => plus.map((v, k) => (v - minus[k]) / (2 * h));
  const d = {
    alpha: diff(coeffs({ alpha: a0 + da }), coeffs({ alpha: a0 - da }), da),
    beta: diff(coeffs({ beta: da }), coeffs({ beta: -da }), da),
    // per dimensionless rate: d/dp^ = (2V/b) d/dp
    p: diff(coeffs({ p: dr }), coeffs({ p: -dr }), dr).map((v) => v * 2 * V / b),
    q: diff(coeffs({ q: dr }), coeffs({ q: -dr }), dr).map((v) => v * 2 * V / c),
    r: diff(coeffs({ r: dr }), coeffs({ r: -dr }), dr).map((v) => v * 2 * V / b),
  };
  const k = (name) => STABILITY_COEFFICIENTS.indexOf(name);
  const crit = (axis, kind, key, value, stableIf) => ({ axis, kind, key, value, stable: stableIf(value) });
  const criteria = [
    crit('roll', 'static', 'Cl_beta', d.beta[k('Cl')], (v) => v < 0),
    crit('pitch', 'static', 'Cm_alpha', d.alpha[k('Cm')], (v) => v < 0),
    crit('yaw', 'static', 'Cn_beta', d.beta[k('Cn')], (v) => v > 0),
    crit('roll', 'damping', 'Cl_p', d.p[k('Cl')], (v) => v < 0),
    crit('pitch', 'damping', 'Cm_q', d.q[k('Cm')], (v) => v < 0),
    crit('yaw', 'damping', 'Cn_r', d.r[k('Cn')], (v) => v < 0),
  ];
  return {
    about, reference: ref, speed: V, alphaDeg: trim.alphaDeg, at: r0.slice(),
    coefficients: C0, d, criteria, stable: criteria.every((x) => x.stable),
    steps: { angleRad: da, rateRadS: dr },
  };
}

/* ---------------------------------------------------------- eigenvalues -- */

/**
 * The eigenvalues of a real square matrix: balanced (Parlett and Reinsch),
 * reduced to upper Hessenberg form by elimination with pivoting, and the
 * Hessenberg matrix's eigenvalues found by Francis's double-shift QR — the
 * classic sequence (balanc, elmhes, hqr). Returns [{ re, im }], complex
 * pairs together, the positive imaginary part first.
 */
export function eigenvalues(A0) {
  const n = A0.length;
  if (!n) return [];
  // 1-based, as the algorithms are written
  const a = [null];
  for (let i = 0; i < n; i++) a.push([0, ...A0[i].map(Number)]);
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) {
    if (!Number.isFinite(a[i][j])) throw new Error('eigenvalues: the matrix has a value that is not a number');
  }
  // balance
  const RADIX = 2; const sq = RADIX * RADIX;
  for (let last = 0; last === 0;) {
    last = 1;
    for (let i = 1; i <= n; i++) {
      let r = 0; let c = 0;
      for (let j = 1; j <= n; j++) if (j !== i) { c += Math.abs(a[j][i]); r += Math.abs(a[i][j]); }
      if (c && r) {
        let g = r / RADIX; let f = 1; const s = c + r;
        while (c < g) { f *= RADIX; c *= sq; }
        g = r * RADIX;
        while (c > g) { f /= RADIX; c /= sq; }
        if ((c + r) / f < 0.95 * s) {
          last = 0; g = 1 / f;
          for (let j = 1; j <= n; j++) a[i][j] *= g;
          for (let j = 1; j <= n; j++) a[j][i] *= f;
        }
      }
    }
  }
  // to Hessenberg form
  for (let m = 2; m < n; m++) {
    let x = 0; let i = m;
    for (let j = m; j <= n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; }
      for (let j = 1; j <= n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; }
    }
    if (x) {
      for (i = m + 1; i <= n; i++) {
        let y = a[i][m - 1];
        if (y) {
          y /= x; a[i][m - 1] = y;
          for (let j = m; j <= n; j++) a[i][j] -= y * a[m][j];
          for (let j = 1; j <= n; j++) a[j][m] += y * a[j][i];
        }
      }
    }
  }
  for (let i = 3; i <= n; i++) for (let j = 1; j <= i - 2; j++) a[i][j] = 0;
  // the shifted QR
  const wr = new Array(n + 1).fill(0); const wi = new Array(n + 1).fill(0);
  const sign = (u, v) => (v >= 0 ? Math.abs(u) : -Math.abs(u));
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
  let nn = n; let t = 0;
  let p = 0; let q = 0; let r = 0; let s = 0; let w = 0; let x = 0; let y = 0; let z = 0;
  while (nn >= 1) {
    let its = 0; let l;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; }
      }
      x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t; wi[nn] = 0; nn--;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('eigenvalues: the QR iteration did not converge');
          if (its === 10 || its === 20 || its === 40) {
            t += x;
            for (let i = 1; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let m;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s; q /= s; r /= s;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) { p /= x; q /= x; r /= x; }
            }
            s = sign(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else {
                a[k][k - 1] = -s * x;
              }
              p += s;
              x = p / s; y = q / s; z = r / s;
              q /= p; r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) {
                  p += r * a[k + 2][j];
                  a[k + 2][j] -= p * z;
                }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) {
                  p += z * a[i][k + 2];
                  a[i][k + 2] -= p * r;
                }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ re: wr[i], im: wi[i] });
  // a pair together, the positive imaginary part first
  out.sort((u, v) => (u.re - v.re) || (v.im - u.im));
  return out;
}

/** The eigenvector of A for an eigenvalue, by inverse iteration: complex,
 * as [[re, im], ...], scaled so its largest component is one. */
export function eigenvector(A, lambda) {
  const n = A.length;
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  scale = scale || 1;
  const mu = [lambda.re + 1e-10 * scale, lambda.im + 1e-10 * scale];
  // M = A - mu I, complex, as two real arrays
  const solve = (bRe, bIm) => {
    const R = A.map((row, i) => row.map((v, j) => (i === j ? v - mu[0] : v)));
    const I = A.map((row, i) => row.map((v, j) => (i === j ? -mu[1] : 0)));
    const xr = bRe.slice(); const xi = bIm.slice();
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.hypot(R[r][c], I[r][c]) > Math.hypot(R[piv][c], I[piv][c])) piv = r;
      [R[c], R[piv]] = [R[piv], R[c]]; [I[c], I[piv]] = [I[piv], I[c]];
      [xr[c], xr[piv]] = [xr[piv], xr[c]]; [xi[c], xi[piv]] = [xi[piv], xi[c]];
      let dr = R[c][c]; let di = I[c][c];
      if (Math.hypot(dr, di) < 1e-300) { dr = 1e-14 * scale; di = 0; R[c][c] = dr; }
      const d2 = dr * dr + di * di;
      for (let r = c + 1; r < n; r++) {
        const fr = (R[r][c] * dr + I[r][c] * di) / d2;
        const fi = (I[r][c] * dr - R[r][c] * di) / d2;
        if (!fr && !fi) continue;
        for (let k = c; k < n; k++) {
          R[r][k] -= fr * R[c][k] - fi * I[c][k];
          I[r][k] -= fr * I[c][k] + fi * R[c][k];
        }
        xr[r] -= fr * xr[c] - fi * xi[c];
        xi[r] -= fr * xi[c] + fi * xr[c];
      }
    }
    for (let c = n - 1; c >= 0; c--) {
      let sr = xr[c]; let si = xi[c];
      for (let k = c + 1; k < n; k++) {
        sr -= R[c][k] * xr[k] - I[c][k] * xi[k];
        si -= R[c][k] * xi[k] + I[c][k] * xr[k];
      }
      const dr = R[c][c]; const di = I[c][c]; const d2 = dr * dr + di * di;
      xr[c] = (sr * dr + si * di) / d2;
      xi[c] = (si * dr - sr * di) / d2;
    }
    return [xr, xi];
  };
  let vr = Array.from({ length: n }, (_, i) => 1 / (i + 1));
  let vi = Array.from({ length: n }, (_, i) => 0.3 / (i + 2));
  for (let it = 0; it < 3; it++) {
    [vr, vi] = solve(vr, vi);
    let big = 0; let kb = 0;
    for (let i = 0; i < n; i++) { const m = Math.hypot(vr[i], vi[i]); if (m > big) { big = m; kb = i; } }
    if (!(big > 0) || !Number.isFinite(big)) break;
    // divide by the largest component, so it is one and real
    const br = vr[kb]; const bi = vi[kb]; const b2 = br * br + bi * bi;
    const nr = vr.map((v, i) => (v * br + vi[i] * bi) / b2);
    const ni = vi.map((v, i) => (v * br - vr[i] * bi) / b2);
    vr = nr; vi = ni;
  }
  return vr.map((v, i) => [v, vi[i]]);
}

/* ---------------------------------------------------------------- modes -- */

/** The linearised states' names, in order. */
export const STABILITY_STATES = Object.freeze(['u', 'v', 'w', 'p', 'q', 'r', 'phi', 'theta']);
const ST_LONG = [0, 2, 4, 7];
const ST_LAT = [1, 3, 5, 6];

/**
 * The glider's equations of motion linearised at the trim: the Jacobian of
 * (u, v, w, p, q, r, phi, theta)' — the riser midpoint's velocity and the
 * rotation in the body's axes, the roll and pitch angles — by central
 * differences of `flightDerivative`.
 */
export function stabilityJacobian(model, trim, opts = {}) {
  const cfg = { ...STABILITY, ...opts };
  const work = stWork(model, trim, cfg);
  const g = trim.guess;
  const x0 = [g.u, 0, g.w, 0, 0, 0, 0, g.theta];
  const f = (s) => {
    const [u, v, w, p, q, r, phi, theta] = s;
    const quat = flightQuaternion(phi, theta, 0);
    const x = Float64Array.from([0, 0, -model.cfg.altitudeM, ...quat, u, v, w, p, q, r]);
    const dx = flightDerivative(model, x, { left: 0, right: 0 }, work);
    const sf = Math.sin(phi); const cf = Math.cos(phi);
    return [dx[7], dx[8], dx[9], dx[10], dx[11], dx[12],
      p + Math.tan(theta) * (q * sf + r * cf), q * cf - r * sf];
  };
  const V = trim.speed;
  const h = [V * cfg.linVelocityFraction, V * cfg.linVelocityFraction, V * cfg.linVelocityFraction,
    cfg.linRateRadS, cfg.linRateRadS, cfg.linRateRadS, cfg.linAngleRad, cfg.linAngleRad];
  const n = 8;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const f0 = f(x0);
  for (let j = 0; j < n; j++) {
    const xp = x0.slice(); xp[j] += h[j];
    const xm = x0.slice(); xm[j] -= h[j];
    const fp = f(xp); const fm = f(xm);
    for (let i = 0; i < n; i++) A[i][j] = (fp[i] - fm[i]) / (2 * h[j]);
  }
  return { A, x0, f0, steps: h, states: STABILITY_STATES.slice() };
}

/** A mode's figures from its eigenvalue. */
function stModeFigures(lambda) {
  const { re, im } = lambda;
  const wn = Math.hypot(re, im);
  return {
    eigenvalue: { re, im },
    naturalFrequency: wn,
    dampingRatio: wn > 0 ? -re / wn : 1,
    periodS: Math.abs(im) > 1e-9 ? (2 * Math.PI) / Math.abs(im) : null,
    halfS: re < 0 ? Math.LN2 / -re : null,
    doubleS: re > 0 ? Math.LN2 / re : null,
    stable: re < 0,
  };
}

/**
 * The glider's modes at the trim: the linearised model's two blocks and
 * their eigenvalues, each mode named by what moves in it.
 *
 *   pitch       a longitudinal oscillation the angle of attack moves in
 *   phugoid     a longitudinal one the speed and the pitch angle trade in
 *   Dutch roll  a lateral oscillation of yaw and sideslip
 *   roll        a lateral oscillation of bank: the glider swinging side to
 *               side under its arc, yawing as it goes
 *   spiral      the slow lateral mode, bank and heading drifting together
 *   subsidence  a fast mode that only dies away
 */
export function stabilityModes(model, trim, opts = {}) {
  const J = stabilityJacobian(model, trim, opts);
  const { A } = J;
  const V = trim.speed; const u0 = trim.guess.u; const w0 = trim.guess.w;
  const block = (idx) => idx.map((i) => idx.map((j) => A[i][j]));
  // the coupling the symmetric trim should leave at nothing
  let cross = 0; let norm = 0;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    norm = Math.max(norm, Math.abs(A[i][j]));
    if (ST_LONG.includes(i) !== ST_LONG.includes(j)) cross = Math.max(cross, Math.abs(A[i][j]));
  }
  const modes = [];
  const add = (idx, kind) => {
    const B = block(idx);
    const ev = eigenvalues(B);
    const seen = [];
    for (const lam of ev) {
      if (lam.im < -1e-12) continue; // its pair's other half
      const vec = eigenvector(B, lam);
      const mag = (k) => Math.hypot(vec[k][0], vec[k][1]);
      let shape;
      if (kind === 'longitudinal') {
        // [u, w, q, theta]: speed and angle of attack from u and w
        const dV = [(u0 * vec[0][0] + w0 * vec[1][0]) / (V * V), (u0 * vec[0][1] + w0 * vec[1][1]) / (V * V)];
        const dA = [(u0 * vec[1][0] - w0 * vec[0][0]) / (V * V), (u0 * vec[1][1] - w0 * vec[0][1]) / (V * V)];
        shape = { speed: Math.hypot(...dV), alpha: Math.hypot(...dA), q: mag(2), theta: mag(3) };
      } else {
        // [v, p, r, phi]
        shape = { beta: mag(0) / V, p: mag(1), r: mag(2), phi: mag(3) };
      }
      const big = Math.max(...Object.values(shape)) || 1;
      for (const key of Object.keys(shape)) shape[key] /= big;
      seen.push({ kind, ...stModeFigures(lam), shape });
    }
    // names, from what moves: the speed or the angle of attack; the
    // sideslip (with the yaw) or the bank
    if (kind === 'longitudinal') {
      for (const m of seen) {
        if (m.periodS) m.name = m.shape.speed > m.shape.alpha ? 'phugoid' : 'pitch';
        else m.name = m.shape.speed > m.shape.alpha ? 'speed subsidence' : 'pitch subsidence';
      }
    } else {
      const real = seen.filter((m) => !m.periodS).sort((p, q) => Math.abs(p.eigenvalue.re) - Math.abs(q.eigenvalue.re));
      for (const m of seen) if (m.periodS) m.name = m.shape.beta > m.shape.phi ? 'Dutch roll' : 'roll';
      if (real.length) real[0].name = 'spiral';
      for (const m of real.slice(1)) m.name = 'roll subsidence';
    }
    modes.push(...seen);
  };
  add(ST_LONG, 'longitudinal');
  add(ST_LAT, 'lateral');
  return {
    modes, jacobian: J, coupling: norm > 0 ? cross / norm : 0,
    stable: modes.every((m) => m.stable),
    leastDamped: modes.reduce((b, m) => (b === null || m.eigenvalue.re > b.eigenvalue.re ? m : b), null),
  };
}

/* --------------------------------------------------------------- maps -- */

/**
 * One point of a map. `build(alphaWakeDeg)` gives the flight model there,
 * its lattice's wake laid along that angle; it is trimmed from `start` (what
 * `flightTrim` takes: `{ guess }`, or `{ speed, alphaDeg, glide }`), and from
 * `retry` if that fails, and built and trimmed again along the trim's own
 * flow when that is more than `relatticeDeg` from the wake's (0: always, as
 * the Flight tab's own trim does). Then its derivatives and modes.
 *
 * Returns the cell — its speed, glide and angles, the six criteria, every
 * mode and the least damped — and the trim's guess, for the next point.
 */
export function stabilityCell(build, {
  start, retry = null, alphaWakeDeg, relatticeDeg = 1, minFlyingCz = 0, ...opts
} = {}) {
  let model = build(alphaWakeDeg);
  let trim = flightTrim(model, start);
  if (!trim.converged && retry) trim = flightTrim(model, retry);
  const again = relatticeDeg <= 0 || Math.abs(trim.alphaDeg - alphaWakeDeg) > relatticeDeg;
  if (trim.converged && again) {
    model = build(trim.alphaDeg);
    trim = flightTrim(model, { guess: trim.guess });
  }
  if (!trim.converged) return { cell: { error: 'no steady glide' }, guess: null };
  const cell = {
    speed: trim.speed, glideRatio: trim.glideRatio, sinkRate: trim.sinkRate,
    alphaDeg: trim.alphaDeg, canopyAlphaDeg: trim.canopyAlphaDeg, liftCoefficient: trim.liftCoefficient,
    belowFloor: trim.liftCoefficient < minFlyingCz,
  };
  const d = stabilityDerivatives(model, trim, opts);
  const m = stabilityModes(model, trim, opts);
  cell.criteria = d.criteria.map(({ axis, kind, key, value, stable }) => ({ axis, kind, key, value, stable }));
  cell.staticStable = d.criteria.filter((c) => c.kind === 'static').every((c) => c.stable);
  cell.damped = d.criteria.filter((c) => c.kind === 'damping').every((c) => c.stable);
  cell.modesStable = m.stable;
  const brief = (x) => ({
    name: x.name, re: x.eigenvalue.re, im: x.eigenvalue.im, periodS: x.periodS,
    dampingRatio: x.dampingRatio, halfS: x.halfS, doubleS: x.doubleS, stable: x.stable,
  });
  cell.modes = m.modes.map(brief);
  cell.leastDamped = m.leastDamped ? brief(m.leastDamped) : null;
  return { cell, guess: trim.guess, model, trim };
}

/**
 * Glide against stability over where the pilot hangs: the paper's study of
 * a kite's tow point (section 6.3), for a glider whose tow point is its
 * karabiners. At each point of a grid — the hang point moved aft by `dxM`
 * and up by `dzM` (shorter lines), metres, in the wing's frame — the model
 * is trimmed (its wake laid again along a trim that moves by more than a
 * degree), and its derivatives and modes found. A generator of progress;
 * `build({ dxM, dzM, alphaWakeDeg })` gives the flight model there.
 *
 * Each cell says whether it trims, its speed, glide and angle, the six
 * criteria and the least damped mode. Moving the hang point aft raises the
 * trim's angle and, to a point, the glide; past it the pitch stiffness goes.
 */
export function* stabilityMapSteps(build, {
  dxM = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3], dzM = [-1, -0.5, 0, 0.5, 1],
  guess, alphaWakeDeg, minFlyingCz = 0, label = '', ...opts
} = {}) {
  const total = dxM.length * dzM.length;
  const cells = [];
  let done = 0;
  for (const dz of dzM) {
    let last = guess;
    for (const dx of dxM) {
      let cell;
      try {
        const r = stabilityCell((a) => build({ dxM: dx, dzM: dz, alphaWakeDeg: a }), {
          start: { guess: last }, retry: last !== guess ? { guess } : null,
          alphaWakeDeg, relatticeDeg: 1, minFlyingCz, ...opts,
        });
        cell = { dxM: dx, dzM: dz, ...r.cell };
        if (r.guess) last = r.guess;
      } catch (e) {
        cell = { dxM: dx, dzM: dz, error: e.message };
      }
      cells.push(cell);
      done++;
      yield { phase: 'map', done, total, label };
    }
  }
  return { dxM: dxM.slice(), dzM: dzM.slice(), cells };
}

/**
 * The same over any set of points, each its own model: `prepare(point)`
 * gives `{ build(alphaWakeDeg), start, alphaWakeDeg, minFlyingCz?, extra? }`
 * for it, and the cell is the point, its `extra`, and what
 * `stabilityCell` finds there (its wake laid again along its trim,
 * `relatticeDeg` 0 by default). The planform study's grid: a variant of the
 * design at each point, built, its lines and hang point drawn for it, and
 * flown.
 */
export function* stabilityGridSteps(points, prepare, {
  relatticeDeg = 0, minFlyingCz = 0, label = '', ...opts
} = {}) {
  const cells = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    let cell;
    try {
      const p = prepare(point);
      // a breath between building a variant and flying it: each is a few
      // tenths of a second in a browser
      yield { phase: 'build', done: i, total: points.length, label };
      const r = stabilityCell(p.build, {
        start: p.start, retry: p.retry ?? null, alphaWakeDeg: p.alphaWakeDeg, relatticeDeg,
        minFlyingCz: p.minFlyingCz ?? minFlyingCz, ...opts,
      });
      cell = { ...point, ...(p.extra ?? {}), ...r.cell };
    } catch (e) {
      cell = { ...point, error: e.message };
    }
    cells.push(cell);
    yield { phase: 'map', done: i + 1, total: points.length, label };
  }
  return { cells };
}
