/* mfoil.js — a viscous section solver: a linear-vortex panel method coupled
 * by Newton's method to an integral boundary layer and wake, with e^N
 * transition and a Karman-Tsien compressibility correction.
 *
 * It is a JavaScript port of mfoil, Krzysztof J. Fidkowski's Python code
 * (v 2023-06-28), as the Scirocco repository carries it for its own checks
 * (github.com/chrislupp/Scirocco, mfoil/mfoil.py). Scirocco is a C++ port
 * of the same code; this one runs where the tool runs, in the page. The
 * method is Drela's XFOIL's: the integral boundary layer, its closures and
 * the e^N envelope method are his (Drela 1989; Drela and Giles 1987), and
 * the coupled Newton solution is Fidkowski's (AIAA Journal, 2022).
 *
 * The port keeps mfoil's steps, its order and its constants, so that the
 * same airfoil at the same panel count gives the same answer: the unit
 * suite holds it to mfoil.py's own results. It differs in one place, the
 * linear algebra of each Newton step: mfoil solves the whole system, four
 * unknowns at every node, as one sparse matrix; this eliminates the
 * boundary layer unknowns first — the boundary layer equations march, so
 * they invert by substitution — and solves a dense system in the edge
 * velocities alone. The step is the same one; it is checked against the
 * whole system, and a dense solve of the whole system takes over if needed.
 *
 * mfoil.py is licensed as follows, and so is this port of it:
 *
 *   Copyright (C) 2023 Krzysztof J. Fidkowski
 *
 *   Permission is hereby granted, free of charge, to any person
 *   obtaining a copy of this software and associated documentation files
 *   (the "Software"), to deal in the Software without restriction,
 *   including without limitation the rights to use, copy, modify, merge,
 *   publish, distribute, sublicense, and/or sell copies of the Software,
 *   and to permit persons to whom the Software is furnished to do so,
 *   subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be
 *   included in all copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 *   EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 *   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 *   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
 *   BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
 *   ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 *   CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 *
 * Coordinates are mfoil's: x along the chord, z up, nodes running from the
 * trailing edge along the lower surface, round the nose and back along the
 * upper surface ("clockwise"). States at each node are [theta, delta*, sa,
 * ue]: momentum and displacement thickness, the amplification factor (or
 * the root of the shear stress coefficient once turbulent), and the edge
 * speed.
 */

const MF_PI = Math.PI;

// ---------------------------------------------------------------- algebra

function mfSind(a) { return Math.sin(a * MF_PI / 180); }
function mfCosd(a) { return Math.cos(a * MF_PI / 180); }
function mfHypot(a, b) { return Math.sqrt(a * a + b * b); }

/** Solve a small dense system in place: Gaussian elimination with partial
 * pivoting, as LAPACK's gesv does. A is an array of rows. */
function mfSolveSmall(Ain, bin) {
  const n = bin.length;
  const A = Ain.map((r) => r.slice());
  const b = bin.slice();
  for (let k = 0; k < n; k++) {
    let p = k;
    let pv = Math.abs(A[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i][k]);
      if (v > pv) { pv = v; p = i; }
    }
    if (p !== k) {
      const t = A[k]; A[k] = A[p]; A[p] = t;
      const tb = b[k]; b[k] = b[p]; b[p] = tb;
    }
    const piv = A[k][k];
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / piv;
      if (f === 0) continue;
      const Ai = A[i]; const Ak = A[k];
      for (let j = k; j < n; j++) Ai[j] -= f * Ak[j];
      b[i] -= f * b[k];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

/** LU factorisation with partial pivoting of an n x n row-major matrix held
 * in a Float64Array, in place. Returns the pivot rows. */
function mfLuFactor(A, n) {
  const piv = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let p = k;
    let pv = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]);
      if (v > pv) { pv = v; p = i; }
    }
    piv[k] = p;
    if (p !== k) {
      const rk = k * n; const rp = p * n;
      for (let j = 0; j < n; j++) { const t = A[rk + j]; A[rk + j] = A[rp + j]; A[rp + j] = t; }
    }
    const d = A[k * n + k];
    if (d === 0) continue;
    const rk = k * n;
    for (let i = k + 1; i < n; i++) {
      const ri = i * n;
      const f = A[ri + k] / d;
      A[ri + k] = f;
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) A[ri + j] -= f * A[rk + j];
    }
  }
  return piv;
}

/** Solve with a factorisation from mfLuFactor, for one right-hand side. */
function mfLuSolve(LU, piv, n, bin) {
  const b = Float64Array.from(bin);
  for (let k = 0; k < n; k++) {
    const p = piv[k];
    if (p !== k) { const t = b[k]; b[k] = b[p]; b[p] = t; }
  }
  for (let i = 0; i < n; i++) {
    let s = b[i];
    const ri = i * n;
    for (let j = 0; j < i; j++) s -= LU[ri + j] * b[j];
    b[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    const ri = i * n;
    for (let j = i + 1; j < n; j++) s -= LU[ri + j] * b[j];
    b[i] = s / LU[ri + i];
  }
  return b;
}

// ---------------------------------------------------------------- splines

/** A cubic spline through (x, y) with not-a-knot ends — scipy's CubicSpline
 * and interp1d(kind='cubic') both give this one. Coefficients per interval
 * in power form about x[i], highest first: c0 t^3 + c1 t^2 + c2 t + c3. */
function mfSpline(x, y) {
  const n = x.length;
  const dx = new Float64Array(n - 1);
  const slope = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = x[i + 1] - x[i];
    slope[i] = (y[i + 1] - y[i]) / dx[i];
  }
  // tridiagonal system for the slopes at the knots
  const lo = new Float64Array(n); // sub-diagonal, lo[i] multiplies s[i-1] in row i
  const di = new Float64Array(n);
  const up = new Float64Array(n); // super-diagonal, up[i] multiplies s[i+1] in row i
  const b = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    di[i] = 2 * (dx[i - 1] + dx[i]);
    up[i] = dx[i - 1];
    lo[i] = dx[i];
    b[i] = 3 * (dx[i] * slope[i - 1] + dx[i - 1] * slope[i]);
  }
  let d = x[2] - x[0];
  di[0] = dx[1];
  up[0] = d;
  b[0] = ((dx[0] + 2 * d) * dx[1] * slope[0] + dx[0] * dx[0] * slope[1]) / d;
  d = x[n - 1] - x[n - 3];
  di[n - 1] = dx[n - 3];
  lo[n - 1] = d;
  b[n - 1] = (dx[n - 2] * dx[n - 2] * slope[n - 3] + (2 * d + dx[n - 2]) * dx[n - 3] * slope[n - 2]) / d;
  const s = mfTridiagonal(lo, di, up, b);
  const c0 = new Float64Array(n - 1); const c1 = new Float64Array(n - 1);
  const c2 = new Float64Array(n - 1); const c3 = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const t = (s[i] + s[i + 1] - 2 * slope[i]) / dx[i];
    c0[i] = t / dx[i];
    c1[i] = (slope[i] - s[i]) / dx[i] - t;
    c2[i] = s[i];
    c3[i] = y[i];
  }
  return { x: Float64Array.from(x), c0, c1, c2, c3 };
}

/** Tridiagonal solve with partial pivoting (LAPACK gtsv's scheme). */
function mfTridiagonal(lo, di, up, bIn) {
  const n = di.length;
  // dense band rows: a[i] holds row i's entries at columns i-1, i, i+1, i+2
  const rows = [];
  for (let i = 0; i < n; i++) rows.push([i > 0 ? lo[i] : 0, di[i], i < n - 1 ? up[i] : 0, 0]);
  const b = Float64Array.from(bIn);
  for (let k = 0; k < n - 1; k++) {
    // candidates: row k (diag at index 1) and row k+1 (its column-k entry at index 0)
    if (Math.abs(rows[k + 1][0]) > Math.abs(rows[k][1])) {
      // swap rows k and k+1, shifting the band of row k+1 to row k's frame
      const rk = rows[k]; const rk1 = rows[k + 1];
      const newK = [0, rk1[0], rk1[1], rk1[2]];
      const newK1 = [rk[1], rk[2], rk[3], 0];
      rows[k] = newK;
      rows[k + 1] = newK1;
      const tb = b[k]; b[k] = b[k + 1]; b[k + 1] = tb;
    }
    const f = rows[k + 1][0] / rows[k][1];
    rows[k + 1][0] = 0;
    rows[k + 1][1] -= f * rows[k][2];
    rows[k + 1][2] -= f * rows[k][3];
    b[k + 1] -= f * b[k];
  }
  const xs = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let v = b[i];
    if (i + 1 < n) v -= rows[i][2] * xs[i + 1];
    if (i + 2 < n) v -= rows[i][3] * xs[i + 2];
    xs[i] = v / rows[i][1];
  }
  return xs;
}

function mfSplineInterval(pp, s) {
  const x = pp.x;
  const n = x.length;
  if (s < x[0]) return 0;
  if (s >= x[n - 1]) return n - 2;
  let lo = 0; let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= s) lo = mid; else hi = mid;
  }
  return lo;
}

function mfSplineEval(pp, s) {
  const i = mfSplineInterval(pp, s);
  const t = s - pp.x[i];
  return ((pp.c0[i] * t + pp.c1[i]) * t + pp.c2[i]) * t + pp.c3[i];
}

function mfSplineDeriv(pp, s) {
  const i = mfSplineInterval(pp, s);
  const t = s - pp.x[i];
  return (3 * pp.c0[i] * t + 2 * pp.c1[i]) * t + pp.c2[i];
}

const MF_QX = [0.046910077030668, 0.230765344947158, 0.500000000000000,
  0.769234655052842, 0.953089922969332];
const MF_QW = [0.118463442528095, 0.239314335249683, 0.284444444444444,
  0.239314335249683, 0.118463442528095];

/** A 2D spline by arclength, re-integrated to the true arclength in ten
 * passes, as mfoil's spline2d. X is [xs, zs]. */
function mfSpline2d(xs, zs) {
  const N = xs.length;
  let S = new Float64Array(N);
  for (let i = 1; i < N; i++) S[i] = S[i - 1] + mfHypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  let PX = mfSpline(S, xs);
  let PY = mfSpline(S, zs);
  for (let pass = 0; pass < 10; pass++) {
    const Snew = new Float64Array(N);
    Snew[0] = S[0];
    for (let i = 0; i < N - 1; i++) {
      const ds = S[i + 1] - S[i];
      let sint = 0;
      for (let q = 0; q < 5; q++) {
        const st = MF_QX[q] * ds;
        const xd = 3 * PX.c0[i] * st * st + 2 * PX.c1[i] * st + PX.c2[i];
        const yd = 3 * PY.c0[i] * st * st + 2 * PY.c1[i] * st + PY.c2[i];
        sint += MF_QW[q] * Math.sqrt(xd * xd + yd * yd);
      }
      Snew[i + 1] = Snew[i] + sint * ds;
    }
    S = Snew;
    PX = mfSpline(S, xs);
    PY = mfSpline(S, zs);
  }
  return { X: PX, Y: PY };
}

function mfLinspace(a, b, n) {
  const out = new Float64Array(n);
  if (n === 1) { out[0] = a; return out; }
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = a + i * step;
  out[n - 1] = b;
  return out;
}

// ---------------------------------------------------------------- geometry

/** NACA 4-digit points as mfoil makes them: 100 a side, bunched at the
 * trailing edge, which has a gap (the .1015 x^4 thickness term). */
export function mfoilNacaPoints(digits) {
  const N = 100; const te = 1.5;
  const x = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    x[i] = 1 - (te + 1) * f * (1 - f) ** te - (1 - f) ** (te + 1);
  }
  if (!/^\d{4}$/.test(String(digits))) throw new Error('mfoil: only 4-digit NACA sections are generated here');
  const tmax = Number(digits.slice(-2)) * 0.01;
  const m = Number(digits[0]) * 0.01;
  const p = Number(digits[1]) * 0.1;
  const zu = new Float64Array(N + 1); const zl = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const xi = x[i];
    let t = 0.2969 * Math.sqrt(xi) - 0.126 * xi - 0.3516 * xi ** 2 + 0.2843 * xi ** 3 - 0.1015 * xi ** 4;
    t = t * tmax / 0.2;
    let c = m / (1 - p) ** 2 * ((1 - 2 * p) + 2 * p * xi - xi ** 2);
    if (xi < p) c = m / p ** 2 * (2 * p * xi - xi ** 2);
    zu[i] = c + t; zl[i] = c - t;
  }
  const xs = []; const zs = [];
  for (let i = N; i >= 0; i--) { xs.push(x[i]); zs.push(zl[i]); }
  for (let i = 1; i <= N; i++) { xs.push(x[i]); zs.push(zu[i]); }
  return { name: `NACA ${digits}`, x: xs, z: zs };
}

/** Coordinates in mfoil's order: from the trailing edge along the lower
 * surface first. Points given the other way round are reversed. */
export function mfoilOrientPoints(xsIn, zsIn) {
  let xs = Array.from(xsIn); let zs = Array.from(zsIn);
  let A = 0;
  for (let i = 0; i < xs.length - 1; i++) A += (xs[i + 1] - xs[i]) * (zs[i + 1] + zs[i]);
  if (A < 0) { xs = xs.reverse(); zs = zs.reverse(); }
  return { x: xs, z: zs };
}

/**
 * A sewn trailing edge is sharp, and mfoil needs a gap there: it aims the
 * wake along the gap's normal and closes the circulation with a panel across
 * it. The section is opened, for analysis only, to `minGap` of the chord by
 * a thickness wedge growing linearly from the leading edge (XFOIL's TGAP
 * does the like). On the NACA 4415 at 3 degrees and Re 1.5 million, gaps
 * from 4e-3 down to 1e-5 take cl to a sharp edge's 0.772, and 1e-4 sits 0.003
 * above it, cd within 0.1% (docs/slices.md).
 * Points in mfoil's order; returns the points and the thickness added.
 */
export function mfoilOpenTrailingEdge(xs, zs, minGap = 1e-4) {
  const n = xs.length;
  let ile = 0;
  for (let i = 1; i < n; i++) if (xs[i] < xs[ile]) ile = i;
  const xle = xs[ile];
  const chord = Math.max(xs[0], xs[n - 1]) - xle;
  const gap = (zs[n - 1] - zs[0]) / chord; // upper end above the lower end
  if (!(gap < minGap)) return { x: Array.from(xs), z: Array.from(zs), added: 0 };
  const add = minGap - gap;
  const z = Array.from(zs, (v, i) => {
    const f = 0.5 * add * (xs[i] - xle);
    return i < ile ? v - f : (i > ile ? v + f : v);
  });
  return { x: Array.from(xs), z, added: add };
}

/** Panels placed by curvature on a spline of the points (mfoil's
 * make_panels: uniformity factor 2, trailing-edge factor 0.1). */
export function mfoilPanels(xs, zs, npanel) {
  const N = npanel + 1;
  const Ufac = 2; const TEfac = 0.1;
  let xmin = Infinity; let xmax = -Infinity;
  for (const v of xs) { if (v < xmin) xmin = v; if (v > xmax) xmax = v; }
  const PP = mfSpline2d(xs, zs);
  const nfine = 501;
  const sEnd = PP.X.x[PP.X.x.length - 1];
  const sf = mfLinspace(0, sEnd, nfine);
  const xf = new Float64Array(nfine); const zf = new Float64Array(nfine);
  for (let i = 0; i < nfine; i++) { xf[i] = mfSplineEval(PP.X, sf[i]); zf[i] = mfSplineEval(PP.Y, sf[i]); }
  const PPf = mfSpline2d(xf, zf);
  const s = PPf.X.x;
  const sk = new Float64Array(nfine);
  for (let i = 0; i < nfine - 1; i++) {
    const ds = s[i + 1] - s[i];
    let integ = 0;
    for (let q = 0; q < 5; q++) {
      const st = MF_QX[q] * ds;
      const xss = 6.0 * PPf.X.c0[i] * st + 2.0 * PPf.X.c1[i];
      const yss = 6.0 * PPf.Y.c0[i] * st + 2.0 * PPf.Y.c1[i];
      integ += MF_QW[q] * Math.sqrt(xss * xss + yss * yss);
    }
    let skint = 0.01 * Ufac + 0.5 * integ * ds;
    const xx = (0.5 * (xf[i] + xf[i + 1]) - xmin) / (xmax - xmin);
    skint += TEfac * 0.5 * Math.exp(-100 * (1.0 - xx));
    sk[i + 1] = sk[i] + skint;
  }
  let sum = 0;
  for (let i = 0; i < nfine; i++) sum += sk[i];
  for (let i = 0; i < nfine; i++) sk[i] += 2.0 * sum / nfine;
  const skl = mfLinspace(sk[0], sk[nfine - 1], N);
  const inv = mfSpline(sk, s);
  const S = new Float64Array(N);
  for (let i = 0; i < N; i++) S[i] = mfSplineEval(inv, skl[i]);
  const X = [new Float64Array(N), new Float64Array(N)];
  const T = [new Float64Array(N), new Float64Array(N)];
  for (let i = 0; i < N; i++) {
    X[0][i] = mfSplineEval(PPf.X, S[i]); X[1][i] = mfSplineEval(PPf.Y, S[i]);
    T[0][i] = mfSplineDeriv(PPf.X, S[i]); T[1][i] = mfSplineDeriv(PPf.Y, S[i]);
  }
  return { N, x: X, s: S, t: T };
}

function mfSpaceGeom(dx0, L, Np) {
  const N = Np - 1;
  const d = L / dx0; const a = N * (N - 1) * (N - 2) / 6; const b = N * (N - 1) / 2; const c = N - d;
  const disc = Math.max(b * b - 4 * a * c, 0);
  let r = 1 + (-b + Math.sqrt(disc)) / (2 * a);
  for (let k = 0; k < 20; k++) {
    const R = r ** N - 1 - d * (r - 1);
    const Rr = N * r ** (N - 1) - d;
    const dr = -R / Rr;
    if (Math.abs(dr) < 1e-14) break;
    r -= R / Rr;
  }
  const out = new Float64Array(Np);
  let acc = 0;
  for (let i = 0; i < N; i++) { acc += dx0 * r ** i; out[i + 1] = acc; }
  return out;
}

// ---------------------------------------------------------------- panels

function mfTEInfo(X) {
  const N = X[0].length;
  let t1x = X[0][0] - X[0][1]; let t1z = X[1][0] - X[1][1];
  let n1 = mfHypot(t1x, t1z); t1x /= n1; t1z /= n1;
  let t2x = X[0][N - 1] - X[0][N - 2]; let t2z = X[1][N - 1] - X[1][N - 2];
  n1 = mfHypot(t2x, t2z); t2x /= n1; t2z /= n1;
  let tx = 0.5 * (t1x + t2x); let tz = 0.5 * (t1z + t2z);
  n1 = mfHypot(tx, tz); tx /= n1; tz /= n1;
  const sx = X[0][N - 1] - X[0][0]; const sz = X[1][N - 1] - X[1][0];
  const hTE = -sx * tz + sz * tx;
  const dtdx = t1x * t2z - t2x * t1z;
  const ns = mfHypot(sx, sz);
  const px = sx / ns; const pz = sz / ns;
  const tcp = Math.abs(tx * pz - tz * px); const tdp = tx * px + tz * pz;
  return { t: [tx, tz], hTE, dtdx, tcp, tdp };
}

function mfPanelInfo(x1, z1, x2, z2, xi, zi) {
  let tx = x2 - x1; let tz = z2 - z1;
  const nt = mfHypot(tx, tz); tx /= nt; tz /= nt;
  const nx = -tz; const nz = tx;
  const rx = xi - x1; const rz = zi - z1;
  const x = rx * tx + rz * tz;
  const z = rx * nx + rz * nz;
  const d = mfHypot(x2 - x1, z2 - z1);
  const r1 = mfHypot(x, z);
  const r2 = mfHypot(x - d, z);
  const theta1 = Math.atan2(z, x);
  const theta2 = Math.atan2(z, x - d);
  return { tx, tz, nx, nz, x, z, d, r1, r2, theta1, theta2 };
}

/** Linear vortex panel velocity coefficients: [ax, az, bx, bz]. */
function mfLinVortexVelocity(x1, z1, x2, z2, xi, zi, onmid) {
  const p = mfPanelInfo(x1, z1, x2, z2, xi, zi);
  let ug1; let ug2; let wg1; let wg2;
  if (onmid) {
    ug1 = 1 / 2 - 1 / 4; ug2 = 1 / 4;
    wg1 = -1 / (2 * MF_PI); wg2 = 1 / (2 * MF_PI);
  } else {
    let temp1 = (p.theta2 - p.theta1) / (2 * MF_PI);
    let temp2 = (2 * p.z * Math.log(p.r1 / p.r2) - 2 * p.x * (p.theta2 - p.theta1)) / (4 * MF_PI * p.d);
    ug1 = temp1 + temp2;
    ug2 = -temp2;
    temp1 = Math.log(p.r2 / p.r1) / (2 * MF_PI);
    temp2 = (p.x * Math.log(p.r1 / p.r2) - p.d + p.z * (p.theta2 - p.theta1)) / (2 * MF_PI * p.d);
    wg1 = temp1 + temp2;
    wg2 = -temp2;
  }
  return [ug1 * p.tx + wg1 * p.nx, ug1 * p.tz + wg1 * p.nz, ug2 * p.tx + wg2 * p.nx, ug2 * p.tz + wg2 * p.nz];
}

// Twelve-point Gauss-Legendre on [0, 1], for the far-field streamfunctions.
const MF_G12 = (() => {
  const n = 12;
  const t = []; const w = [];
  for (let i = 1; i <= n; i++) {
    let x = Math.cos(MF_PI * (i - 0.25) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1; let p1 = x;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (x * p1 - p0) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    let p0 = 1; let p1 = x;
    for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
    dp = n * (x * p1 - p0) / (x * x - 1);
    t.push(x); w.push(2 / ((1 - x * x) * dp * dp));
  }
  // numpy's leggauss orders nodes ascending
  const order = t.map((v, i) => i).sort((a, b) => t[a] - t[b]);
  return { t: order.map((i) => 0.5 * (t[i] + 1)), w: order.map((i) => 0.5 * w[i]) };
})();

function mfLinVortexStreamFar(x1, z1, x2, z2, xi, zi) {
  const dx = x2 - x1; const dz = z2 - z1;
  const rmx = xi - 0.5 * (x1 + x2); const rmz = zi - 0.5 * (z1 + z2);
  const dd = dx * dx + dz * dz;
  if (dd <= 1e-24 || rmx * rmx + rmz * rmz <= 16 * dd) return null;
  const len = Math.sqrt(dd);
  let a = 0; let b = 0;
  for (let q = 0; q < 12; q++) {
    const tq = MF_G12.t[q];
    const rx = xi - x1 - dx * tq; const rz = zi - z1 - dz * tq;
    const v = len / (2 * MF_PI) * MF_G12.w[q] * 0.5 * Math.log(rx * rx + rz * rz);
    a += (1 - tq) * v; b += tq * v;
  }
  return [a, b];
}

function mfLinVortexStream(x1, z1, x2, z2, xi, zi) {
  const far = mfLinVortexStreamFar(x1, z1, x2, z2, xi, zi);
  if (far) return far;
  const p = mfPanelInfo(x1, z1, x2, z2, xi, zi);
  const ep = 1e-9;
  const logr1 = p.r1 < ep ? 0 : Math.log(p.r1);
  const logr2 = p.r2 < ep ? 0 : Math.log(p.r2);
  const P1 = (0.5 / MF_PI) * (p.z * (p.theta2 - p.theta1) - p.d + p.x * logr1 - (p.x - p.d) * logr2);
  const P2 = p.x * P1 + (0.5 / MF_PI) * (0.5 * p.r2 ** 2 * logr2 - 0.5 * p.r1 ** 2 * logr1 - p.r2 ** 2 / 4 + p.r1 ** 2 / 4);
  return [P1 - P2 / p.d, P2 / p.d];
}

/** Constant source panel velocity coefficient: [ax, az]. */
function mfConstSourceVelocity(x1, z1, x2, z2, xi, zi) {
  const p = mfPanelInfo(x1, z1, x2, z2, xi, zi);
  const ep = 1e-9;
  let logr1; let logr2; let theta1 = p.theta1; let theta2 = p.theta2;
  if (p.r1 < ep) { logr1 = 0; theta1 = MF_PI; theta2 = MF_PI; } else logr1 = Math.log(p.r1);
  if (p.r2 < ep) { logr2 = 0; theta1 = 0; theta2 = 0; } else logr2 = Math.log(p.r2);
  const u = (0.5 / MF_PI) * (logr1 - logr2);
  const w = (0.5 / MF_PI) * (theta2 - theta1);
  return [u * p.tx + w * p.nx, u * p.tz + w * p.nz];
}

function mfSourceStreamFar(x1, z1, x2, z2, xi, zi, linear) {
  const dx = x2 - x1; const dz = z2 - z1;
  const rmx = xi - 0.5 * (x1 + x2); const rmz = zi - 0.5 * (z1 + z2);
  const dd = dx * dx + dz * dz;
  if (dd <= 1e-24 || rmx * rmx + rmz * rmz <= 16 * dd) return null;
  const length = Math.sqrt(dd);
  const tx = dx / length; const tz = dz / length;
  const nx = -tz; const nz = tx;
  const rx = xi - x1; const rz = zi - z1;
  const x = rx * tx + rz * tz; const z = rx * nx + rz * nz;
  const theta1 = Math.atan2(z, x); const theta2 = Math.atan2(z, x - length);
  if (!linear && Math.abs(theta1 + theta2 - MF_PI) <= 1e-12) return null;
  let shift = 0;
  if (!linear) shift = (theta1 + theta2) > MF_PI ? -0.25 : 0.75;
  let a = 0; let b = 0;
  for (let q = 0; q < 12; q++) {
    const tq = MF_G12.t[q];
    let theta = Math.atan2(z, x - tq * length);
    if (linear && theta < 0) theta += 2 * MF_PI;
    const v = length * MF_G12.w[q] * (theta / (2 * MF_PI) + shift);
    a += (1 - tq) * v; b += tq * v;
  }
  return [a, b];
}

function mfConstSourceStream(x1, z1, x2, z2, xi, zi) {
  const far = mfSourceStreamFar(x1, z1, x2, z2, xi, zi, false);
  if (far) return far[0] + far[1];
  const p = mfPanelInfo(x1, z1, x2, z2, xi, zi);
  const ep = 1e-9;
  let logr1; let logr2; let theta1 = p.theta1; let theta2 = p.theta2;
  if (p.r1 < ep) { logr1 = 0; theta1 = MF_PI; theta2 = MF_PI; } else logr1 = Math.log(p.r1);
  if (p.r2 < ep) { logr2 = 0; theta1 = 0; theta2 = 0; } else logr2 = Math.log(p.r2);
  let P = (p.x * (theta1 - theta2) + p.d * theta2 + p.z * logr1 - p.z * logr2) / (2 * MF_PI);
  const dP = p.d;
  P = (theta1 + theta2) > MF_PI ? P - 0.25 * dP : P + 0.75 * dP;
  return P;
}

/** Linear source panel velocity coefficients, dotted with (vx, vz): [a, b]. */
function mfLinSourceVelocity(x1, z1, x2, z2, xi, zi, vx, vz) {
  const p = mfPanelInfo(x1, z1, x2, z2, xi, zi);
  let temp1 = Math.log(p.r1 / p.r2) / (2 * MF_PI);
  let temp2 = (p.x * Math.log(p.r1 / p.r2) - p.d + p.z * (p.theta2 - p.theta1)) / (2 * MF_PI * p.d);
  const ug1 = temp1 - temp2; const ug2 = temp2;
  temp1 = (p.theta2 - p.theta1) / (2 * MF_PI);
  temp2 = (-p.z * Math.log(p.r1 / p.r2) + p.x * (p.theta2 - p.theta1)) / (2 * MF_PI * p.d);
  const wg1 = temp1 - temp2; const wg2 = temp2;
  const ax = ug1 * p.tx + wg1 * p.nx; const az = ug1 * p.tz + wg1 * p.nz;
  const bx = ug2 * p.tx + wg2 * p.nx; const bz = ug2 * p.tz + wg2 * p.nz;
  return [ax * vx + az * vz, bx * vx + bz * vz];
}

function mfLinSourceStream(x1, z1, x2, z2, xi, zi) {
  const far = mfSourceStreamFar(x1, z1, x2, z2, xi, zi, true);
  if (far) return far;
  const p = mfPanelInfo(x1, z1, x2, z2, xi, zi);
  let theta1 = p.theta1; let theta2 = p.theta2;
  if (theta1 < 0) theta1 += 2 * MF_PI;
  if (theta2 < 0) theta2 += 2 * MF_PI;
  const ep = 1e-9;
  let logr1; let logr2;
  if (p.r1 < ep) { logr1 = 0; theta1 = MF_PI; theta2 = MF_PI; } else logr1 = Math.log(p.r1);
  if (p.r2 < ep) { logr2 = 0; theta1 = 0; theta2 = 0; } else logr2 = Math.log(p.r2);
  const P1 = (0.5 / MF_PI) * (p.x * (theta1 - theta2) + theta2 * p.d + p.z * logr1 - p.z * logr2);
  const P2 = p.x * P1 + (0.5 / MF_PI) * (0.5 * p.r2 ** 2 * theta2 - 0.5 * p.r1 ** 2 * theta1 - 0.5 * p.z * p.d);
  return [P1 - P2 / p.d, P2 / p.d];
}

// ---------------------------------------------------------------- inviscid

/** The inviscid linear system for alpha 0 and 90 degrees (mfoil's
 * build_gamma): streamfunction constant at every node, linear vorticity on
 * the panels, Kutta condition, a trailing-edge source and vortex panel for
 * the gap, and gamma extrapolated across a sharp trailing edge. */
function mfBuildGamma(M) {
  const N = M.foil.N;
  const X = M.foil.x;
  const n1 = N + 1;
  const A = new Float64Array(n1 * n1);
  const rhs0 = new Float64Array(n1); const rhs1 = new Float64Array(n1);
  const te = mfTEInfo(X);
  const nogap = Math.abs(te.hTE) < 1e-10 * M.geom.chord;
  for (let i = 0; i < N; i++) {
    const xi = X[0][i]; const zi = X[1][i];
    const row = i * n1;
    for (let j = 0; j < N - 1; j++) {
      const [aij, bij] = mfLinVortexStream(X[0][j], X[1][j], X[0][j + 1], X[1][j + 1], xi, zi);
      A[row + j] += aij;
      A[row + j + 1] += bij;
    }
    A[row + N] = -1;
    rhs0[i] = -zi; rhs1[i] = xi;
    const a = mfConstSourceStream(X[0][N - 1], X[1][N - 1], X[0][0], X[1][0], xi, zi);
    A[row + 0] += -a * (0.5 * te.tcp);
    A[row + N - 1] += a * (0.5 * te.tcp);
    const [av, bv] = mfLinVortexStream(X[0][N - 1], X[1][N - 1], X[0][0], X[1][0], xi, zi);
    A[row + 0] += -(av + bv) * (-0.5 * te.tdp);
    A[row + N - 1] += (av + bv) * (-0.5 * te.tdp);
  }
  if (nogap) {
    const row = (N - 1) * n1;
    for (let j = 0; j < n1; j++) A[row + j] = 0;
    A[row + 0] = 1; A[row + 1] = -2; A[row + 2] = 1;
    A[row + N - 3] = -1; A[row + N - 2] = 2; A[row + N - 1] = -1;
  }
  A[N * n1 + 0] = 1;
  A[N * n1 + N - 1] = 1;
  const AIC = Float64Array.from(A);
  const LU = A;
  const piv = mfLuFactor(LU, n1);
  const g0 = mfLuSolve(LU, piv, n1, rhs0);
  const g1 = mfLuSolve(LU, piv, n1, rhs1);
  M.isol.AIC = AIC;
  M.isol.AICLU = { LU, piv, n: n1 };
  M.isol.gamref = [g0.slice(0, N), g1.slice(0, N)];
  const alpha = M.oper.alpha;
  M.isol.gam = new Float64Array(N);
  for (let i = 0; i < N; i++) M.isol.gam[i] = g0[i] * mfCosd(alpha) + g1[i] * mfSind(alpha);
}

/** Velocity at (px, pz) from the panels' vorticity G and the freestream;
 * with V_G, its linearisation in G. */
function mfInviscidVelocity(X, G, Vinf, alpha, px, pz, dolin) {
  const N = X[0].length;
  let Vx = 0; let Vz = 0;
  const VGx = dolin ? new Float64Array(N) : null;
  const VGz = dolin ? new Float64Array(N) : null;
  const te = mfTEInfo(X);
  for (let j = 0; j < N - 1; j++) {
    const [ax, az, bx, bz] = mfLinVortexVelocity(X[0][j], X[1][j], X[0][j + 1], X[1][j + 1], px, pz, false);
    Vx += ax * G[j] + bx * G[j + 1];
    Vz += az * G[j] + bz * G[j + 1];
    if (dolin) { VGx[j] += ax; VGz[j] += az; VGx[j + 1] += bx; VGz[j + 1] += bz; }
  }
  const [sx, sz] = mfConstSourceVelocity(X[0][N - 1], X[1][N - 1], X[0][0], X[1][0], px, pz);
  let f1x = sx * (-0.5 * te.tcp); let f1z = sz * (-0.5 * te.tcp);
  let f2x = sx * 0.5 * te.tcp; let f2z = sz * 0.5 * te.tcp;
  Vx += f1x * G[0] + f2x * G[N - 1];
  Vz += f1z * G[0] + f2z * G[N - 1];
  if (dolin) { VGx[0] += f1x; VGz[0] += f1z; VGx[N - 1] += f2x; VGz[N - 1] += f2z; }
  const [ax, az, bx, bz] = mfLinVortexVelocity(X[0][N - 1], X[1][N - 1], X[0][0], X[1][0], px, pz, false);
  f1x = (ax + bx) * (0.5 * te.tdp); f1z = (az + bz) * (0.5 * te.tdp);
  f2x = (ax + bx) * (-0.5 * te.tdp); f2z = (az + bz) * (-0.5 * te.tdp);
  Vx += f1x * G[0] + f2x * G[N - 1];
  Vz += f1z * G[0] + f2z * G[N - 1];
  if (dolin) { VGx[0] += f1x; VGz[0] += f1z; VGx[N - 1] += f2x; VGz[N - 1] += f2z; }
  Vx += Vinf * mfCosd(alpha);
  Vz += Vinf * mfSind(alpha);
  return dolin ? { V: [Vx, Vz], VGx, VGz } : [Vx, Vz];
}

/** The inviscid edge speed at every node, airfoil then wake. */
function mfGetUeinv(M) {
  const alpha = M.oper.alpha;
  const c = mfCosd(alpha); const s = mfSind(alpha);
  const N = M.foil.N;
  const viscWake = M.oper.viscous && M.wake.N > 0;
  const out = new Float64Array(N + (viscWake ? M.wake.N : 0));
  for (let i = 0; i < N; i++) out[i] = M.isol.sgnue[i] * (M.isol.gamref[0][i] * c + M.isol.gamref[1][i] * s);
  if (viscWake) {
    for (let i = 0; i < M.wake.N; i++) out[N + i] = M.isol.uewiref[0][i] * c + M.isol.uewiref[1][i] * s;
    out[N] = out[N - 1];
  }
  return out;
}

/** The wake, traced from the trailing edge along the inviscid flow with a
 * predictor-corrector, its points spaced geometrically over a chord. */
function mfBuildWake(M) {
  const N = M.foil.N;
  const Vinf = M.oper.Vinf;
  const Nw = Math.ceil(N / 10 + 10 * M.geom.wakelen);
  const S = M.foil.s;
  const ds1 = 0.5 * (S[1] - S[0] + S[N - 1] - S[N - 2]);
  const sv = mfSpaceGeom(ds1, M.geom.wakelen * M.geom.chord, Nw);
  const xw = [new Float64Array(Nw), new Float64Array(Nw)];
  const tw = [new Float64Array(Nw), new Float64Array(Nw)];
  const X = M.foil.x;
  const xte = 0.5 * (X[0][0] + X[0][N - 1]); const zte = 0.5 * (X[1][0] + X[1][N - 1]);
  const nx = X[0][N - 1] - X[0][0]; const nz = X[1][N - 1] - X[1][0];
  const tx = nz; const tz = -nx;
  if (!(tx > 0)) throw new Error('mfoil: wrong wake direction: the trailing edge crosses itself, or the points run the wrong way');
  xw[0][0] = xte + 1e-5 * tx * M.geom.chord;
  xw[1][0] = zte + 1e-5 * tz * M.geom.chord;
  const sw = new Float64Array(Nw);
  for (let i = 0; i < Nw; i++) sw[i] = S[N - 1] + sv[i];
  const G = M.isol.gam;
  for (let i = 0; i < Nw - 1; i++) {
    let v1 = mfInviscidVelocity(X, G, Vinf, M.oper.alpha, xw[0][i], xw[1][i], false);
    let nv = mfHypot(v1[0], v1[1]); v1 = [v1[0] / nv, v1[1] / nv];
    tw[0][i] = v1[0]; tw[1][i] = v1[1];
    xw[0][i + 1] = xw[0][i] + (sv[i + 1] - sv[i]) * v1[0];
    xw[1][i + 1] = xw[1][i] + (sv[i + 1] - sv[i]) * v1[1];
    let v2 = mfInviscidVelocity(X, G, Vinf, M.oper.alpha, xw[0][i + 1], xw[1][i + 1], false);
    nv = mfHypot(v2[0], v2[1]); v2 = [v2[0] / nv, v2[1] / nv];
    tw[0][i + 1] = v2[0]; tw[1][i + 1] = v2[1];
    xw[0][i + 1] = xw[0][i] + (sv[i + 1] - sv[i]) * 0.5 * (v1[0] + v2[0]);
    xw[1][i + 1] = xw[1][i] + (sv[i + 1] - sv[i]) * 0.5 * (v1[1] + v2[1]);
  }
  const uewi = new Float64Array(Nw);
  const uewiref = [new Float64Array(Nw), new Float64Array(Nw)];
  for (let i = 0; i < Nw; i++) {
    let v = mfInviscidVelocity(X, G, Vinf, M.oper.alpha, xw[0][i], xw[1][i], false);
    uewi[i] = v[0] * tw[0][i] + v[1] * tw[1][i];
    v = mfInviscidVelocity(X, M.isol.gamref[0], Vinf, 0, xw[0][i], xw[1][i], false);
    uewiref[0][i] = v[0] * tw[0][i] + v[1] * tw[1][i];
    v = mfInviscidVelocity(X, M.isol.gamref[1], Vinf, 90, xw[0][i], xw[1][i], false);
    uewiref[1][i] = v[0] * tw[0][i] + v[1] * tw[1][i];
  }
  M.wake.N = Nw; M.wake.x = xw; M.wake.s = sw; M.wake.t = tw;
  M.isol.uewi = uewi; M.isol.uewiref = uewiref;
}

/** The leading-edge stagnation point, from the inviscid vorticity. */
function mfStagpointFind(M) {
  const N = M.foil.N;
  const g = M.isol.gam;
  let j = 0;
  for (j = 0; j < N; j++) if (g[j] > 0) break;
  if (j >= N - 1 || j < 1) throw new Error('mfoil: no stagnation point');
  const I = [j - 1, j];
  const G0 = g[I[0]]; const G1 = g[I[1]];
  const S0 = M.foil.s[I[0]]; const S1 = M.foil.s[I[1]];
  M.isol.Istag = I;
  const den = G1 - G0; const w1 = G1 / den; const w2 = -G0 / den;
  M.isol.sstag = w1 * S0 + w2 * S1;
  M.isol.xstag = [M.foil.x[0][j - 1] * w1 + M.foil.x[0][j] * w2, M.foil.x[1][j - 1] * w1 + M.foil.x[1][j] * w2];
  M.isol.sstag_g = [G1 * (S0 - S1) / (den * den), -G0 * (S0 - S1) / (den * den)];
  const sgnue = new Float64Array(N).fill(-1);
  for (let i = j; i < N; i++) sgnue[i] = 1;
  M.isol.sgnue = sgnue;
  mfSetXi(M);
}

function mfSetXi(M) {
  const N = M.foil.N; const Nw = M.wake.N || 0;
  const xi = new Float64Array(N + Nw);
  for (let i = 0; i < N; i++) xi[i] = Math.abs(M.foil.s[i] - M.isol.sstag);
  for (let i = 0; i < Nw; i++) xi[N + i] = M.wake.s[i] - M.isol.sstag;
  M.isol.xi = xi;
}

// ---------------------------------------------------------------- the model

function mfNewParam() {
  return {
    verb: 0, rtol: 1e-12, niglob: 50,
    ncrit: 9.0, onset: 'cubic', Cuq: 1.0, Dlr: 0.9, SlagK: 5.6,
    CtauC: 1.8, CtauE: 3.3, GA: 6.7, GB: 0.75, GC: 18.0,
    Minf: 0, Vinf: 0, muinf: 0, mu0: 0, rho0: 1, H0: 0, Tsrat: 0.35, gam: 1.4,
    KTb: 1, KTl: 0, cps: 0,
    simi: false, turb: false, wake: false,
  };
}

function mfClearSolution(M) {
  M.isol = {
    AIC: null, AICLU: null, gamref: null, gam: null, sstag: 0, sstag_g: [0, 0], sstag_ue: [0, 0],
    Istag: [0, 0], sgnue: null, xi: null, xstag: [0, 0], uewi: null, uewiref: null,
  };
  M.vsol = { Is: null, wgap: null, ue_m: null, ue_sigma: null, turb: null, xt: 0, Xt: [[0, 0], [0, 0]] };
  M.glob = { Nsys: 0, U: null, dU: null, dalpha: 0, conv: true, R: null, realloc: false, iters: 0, Rnorm: [] };
  M.post = { cp: null, cpi: null, cl: 0, cm: 0, cdpi: 0, cd: 0, cdf: 0, cdp: 0 };
  M.wake.N = 0; M.wake.x = null; M.wake.s = null; M.wake.t = null;
}

/**
 * A section ready to solve: its points, paneled as mfoil panels them.
 * Give `naca` (four digits) or the points `x` and `z`, from the trailing
 * edge round either way and back; `npanel` panels (mfoil's default 199).
 */
export function mfoilModel({ naca = null, x = null, z = null, npanel = 199, minTEGap = 1e-4 } = {}) {
  const M = {
    geom: { chord: 1, wakelen: 1, npoint: 0, name: 'noname', xpoint: null, xref: [0.25, 0], teGapAdded: 0 },
    foil: { N: 0, x: null, s: null, t: null },
    wake: { N: 0, x: null, s: null, t: null },
    oper: { Vinf: 1, alpha: 0, rho: 1, viscous: false, Re: 1e5, Ma: 0, initbl: true },
    isol: null, vsol: null, glob: null, post: null,
    param: mfNewParam(),
  };
  let pts;
  if (x && z) {
    if (x.length !== z.length || x.length < 5) throw new Error('mfoil: the points need x and z of equal length, five or more');
    pts = mfoilOrientPoints(x, z);
    const opened = mfoilOpenTrailingEdge(pts.x, pts.z, minTEGap);
    pts = { x: opened.x, z: opened.z };
    M.geom.teGapAdded = opened.added;
    M.geom.name = 'section';
  } else {
    pts = mfoilNacaPoints(String(naca || '0012'));
    M.geom.name = pts.name;
  }
  let xmin = Infinity; let xmax = -Infinity;
  for (const v of pts.x) { if (v < xmin) xmin = v; if (v > xmax) xmax = v; }
  M.geom.xpoint = [Float64Array.from(pts.x), Float64Array.from(pts.z)];
  M.geom.npoint = pts.x.length;
  M.geom.chord = xmax - xmin;
  mfClearSolution(M);
  const P = mfoilPanels(pts.x, pts.z, npanel);
  M.foil.N = P.N; M.foil.x = P.x; M.foil.s = P.s; M.foil.t = P.t;
  return M;
}

function mfInitThermo(M) {
  const g = M.param.gam; const gmi = g - 1;
  const rhoinf = M.oper.rho;
  const Vinf = M.oper.Vinf; M.param.Vinf = Vinf;
  M.param.muinf = rhoinf * Vinf * M.geom.chord / M.oper.Re;
  const Minf = M.oper.Ma; M.param.Minf = Minf;
  let finf = 1;
  if (Minf > 0) {
    M.param.KTb = Math.sqrt(1 - Minf ** 2);
    M.param.KTl = Minf ** 2 / (1 + M.param.KTb) ** 2;
    M.param.H0 = (1 + 0.5 * gmi * Minf ** 2) * Vinf ** 2 / (gmi * Minf ** 2);
    const Tr = 1 - 0.5 * Vinf ** 2 / M.param.H0;
    finf = Tr ** 1.5 * (1 + M.param.Tsrat) / (Tr + M.param.Tsrat);
    M.param.cps = 2 / (g * Minf ** 2) * (((1 + 0.5 * gmi * Minf ** 2) / (1 + 0.5 * gmi)) ** (g / gmi) - 1);
  }
  M.param.mu0 = M.param.muinf / finf;
  M.param.rho0 = rhoinf * (1 + 0.5 * gmi * Minf ** 2) ** (1 / gmi);
}

function mfSolveInviscidSystem(M) {
  M.oper.viscous = false;
  mfInitThermo(M);
  M.isol.sgnue = new Float64Array(M.foil.N).fill(1);
  mfBuildGamma(M);
  mfCalcForce(M);
  M.glob.conv = true;
}

// ---------------------------------------------------------------- closures
// Each returns [value, d value / d U] with U = [th, ds, sa, ue], as mfoil's.

function mfGetUk(u, param) {
  if (param.Minf > 0) {
    const l = param.KTl; const Vinf = param.Vinf;
    const den = 1 - l * (u / Vinf) ** 2; const den_u = -2 * l * u / Vinf ** 2;
    const uk = u * (1 - l) / den;
    return [uk, (1 - l) / den - (uk / den) * den_u];
  }
  return [u, 1];
}

function mfGetCp(u, param) {
  const Vinf = param.Vinf;
  let cp = 1 - (u / Vinf) ** 2; let cp_u = -2 * u / Vinf ** 2;
  if (param.Minf > 0) {
    const l = param.KTl; const b = param.KTb;
    const den = b + 0.5 * l * (1 + b) * cp; const den_cp = 0.5 * l * (1 + b);
    cp /= den; cp_u *= (1 - cp * den_cp) / den;
  }
  return [cp, cp_u];
}

function mfGetMach2(U, param) {
  if (param.Minf > 0) {
    const H0 = param.H0; const g = param.gam;
    const [uk, uk_u] = mfGetUk(U[3], param);
    const c2 = (g - 1) * (H0 - 0.5 * uk ** 2); const c2_uk = (g - 1) * (-uk);
    const M2 = uk ** 2 / c2; const M2_uk = 2 * uk / c2 - M2 / c2 * c2_uk;
    return [M2, [0, 0, 0, M2_uk * uk_u]];
  }
  return [0, [0, 0, 0, 0]];
}

function mfGetH(U) {
  const H = U[1] / U[0];
  return [H, [-H / U[0], 1 / U[0], 0, 0]];
}

function mfGetHw(U, wgap) {
  const Hw = wgap / U[0];
  return [Hw, [-Hw / U[0], 0, 0, 0]];
}

function mfGetHk(U, param) {
  const [H, H_U] = mfGetH(U);
  if (param.Minf > 0) {
    const [M2, M2_U] = mfGetMach2(U, param);
    const den = 1 + 0.113 * M2; const den_M2 = 0.113;
    const Hk = (H - 0.29 * M2) / den;
    const Hk_U = [0, 1, 2, 3].map((k) => (H_U[k] - 0.29 * M2_U[k]) / den - Hk / den * den_M2 * M2_U[k]);
    return [Hk, Hk_U];
  }
  return [H, H_U];
}

function mfGetHss(U, param) {
  const [M2, M2_U] = mfGetMach2(U, param);
  const [Hk, Hk_U] = mfGetHk(U, param);
  const num = 0.064 / (Hk - 0.8) + 0.251;
  const c = -0.064 / (Hk - 0.8) ** 2;
  return [M2 * num, [0, 1, 2, 3].map((k) => M2_U[k] * num + M2 * (c * Hk_U[k]))];
}

function mfGetDe(U, param) {
  const [Hk, Hk_U] = mfGetHk(U, param);
  const aa = 3.15 + 1.72 / (Hk - 1);
  const c = -1.72 / (Hk - 1) ** 2;
  let de = U[0] * aa + U[1];
  let de_U = [aa + U[0] * (c * Hk_U[0]), 1 + U[0] * (c * Hk_U[1]), U[0] * (c * Hk_U[2]), U[0] * (c * Hk_U[3])];
  const dmx = 12.0;
  if (de > dmx * U[0]) { de = dmx * U[0]; de_U = [dmx, 0, 0, 0]; }
  return [de, de_U];
}

function mfGetRho(U, param) {
  if (param.Minf > 0) {
    const [M2, M2_U] = mfGetMach2(U, param);
    const gmi = param.gam - 1;
    const den = 1 + 0.5 * gmi * M2; const den_M2 = 0.5 * gmi;
    const rho = param.rho0 / den ** (1 / gmi);
    return [rho, M2_U.map((v) => (-1 / gmi) * rho / den * den_M2 * v)];
  }
  return [param.rho0, [0, 0, 0, 0]];
}

function mfGetRet(U, param) {
  if (param.Minf > 0) {
    const [M2, M2_U] = mfGetMach2(U, param);
    const [uk, uk_u] = mfGetUk(U[3], param);
    const H0 = param.H0; const gmi = param.gam - 1; const Ts = param.Tsrat;
    const Tr = 1 - 0.5 * uk ** 2 / H0; const Tr_uk = -uk / H0;
    const f = Tr ** 1.5 * (1 + Ts) / (Tr + Ts); const f_Tr = 1.5 * f / Tr - f / (Tr + Ts);
    const mu = param.mu0 * f; const mu_uk = param.mu0 * f_Tr * Tr_uk;
    const den = 1 + 0.5 * gmi * M2; const den_M2 = 0.5 * gmi;
    const rho = param.rho0 / den ** (1 / gmi);
    const rho_U = M2_U.map((v) => (-1 / gmi) * rho / den * den_M2 * v);
    const Ret = rho * uk * U[0] / mu;
    const a = rho * U[0] / mu - Ret / mu * mu_uk;
    const Ret_U = [0, 1, 2, 3].map((k) => rho_U[k] * uk * U[0] / mu + a * (k === 3 ? uk_u : 0) + rho * uk / mu * (k === 0 ? 1 : 0));
    return [Ret, Ret_U];
  }
  const Ret = param.rho0 * U[0] * U[3] / param.mu0;
  return [Ret, [U[3] / param.mu0, 0, 0, U[0] / param.mu0]];
}

function mfGetCf(U, param) {
  if (param.wake) return [0, [0, 0, 0, 0]];
  const [Hk, Hk_U] = mfGetHk(U, param);
  const [Ret, Ret_U] = mfGetRet(U, param);
  if (param.turb) {
    const [M2, M2_U] = mfGetMach2(U, param);
    const Fc = Math.sqrt(1 + 0.5 * (param.gam - 1) * M2);
    const Fc_U = M2_U.map((v) => 0.5 / Fc * 0.5 * (param.gam - 1) * v);
    let aa = -1.33 * Hk; let aa_U = Hk_U.map((v) => -1.33 * v);
    if (aa < -17) {
      aa = -20 + 3 * Math.exp((aa + 17) / 3);
      const f = (aa + 20) / 3;
      aa_U = aa_U.map((v) => f * v);
    }
    let bb = Math.log(Ret / Fc); let bb_U = [0, 1, 2, 3].map((k) => Ret_U[k] / Ret - Fc_U[k] / Fc);
    if (bb < 3) { bb = 3; bb_U = [0, 0, 0, 0]; }
    const l10 = Math.log(10);
    bb /= l10; bb_U = bb_U.map((v) => v / l10);
    const cc = -1.74 - 0.31 * Hk; const cc_U = Hk_U.map((v) => -0.31 * v);
    const dd = Math.tanh(4.0 - Hk / 0.875); const dd_U = Hk_U.map((v) => (1 - dd ** 2) * (-v / 0.875));
    const cf0 = 0.3 * Math.exp(aa) * bb ** cc;
    const cf0_U = [0, 1, 2, 3].map((k) => cf0 * aa_U[k] + 0.3 * Math.exp(aa) * cc * bb ** (cc - 1) * bb_U[k] + cf0 * Math.log(bb) * cc_U[k]);
    const cf = (cf0 + 1.1e-4 * (dd - 1)) / Fc;
    return [cf, [0, 1, 2, 3].map((k) => (cf0_U[k] + 1.1e-4 * dd_U[k]) / Fc - cf / Fc * Fc_U[k])];
  }
  let num; let num_Hk;
  if (Hk < 5.5) {
    num = 0.0727 * (5.5 - Hk) ** 3 / (Hk + 1) - 0.07;
    num_Hk = 0.0727 * (3 * (5.5 - Hk) ** 2 / (Hk + 1) * (-1) - (5.5 - Hk) ** 3 / (Hk + 1) ** 2);
  } else {
    num = 0.015 * (1 - 1 / (Hk - 4.5)) ** 2 - 0.07;
    num_Hk = 0.015 * 2 * (1 - 1 / (Hk - 4.5)) / (Hk - 4.5) ** 2;
  }
  const cf = num / Ret;
  return [cf, [0, 1, 2, 3].map((k) => num_Hk / Ret * Hk_U[k] - num / Ret ** 2 * Ret_U[k])];
}

function mfGetCfxt(U, x, param) {
  const [cf, cf_U] = mfGetCf(U, param);
  const cfxt = cf * x / U[0];
  const cfxt_U = cf_U.map((v) => v * x / U[0]);
  cfxt_U[0] -= cfxt / U[0];
  return [cfxt, cfxt_U, cf / U[0]];
}

function mfGetHs(U, param) {
  let [Hk, Hk_U] = mfGetHk(U, param);
  if (param.wake && Hk < 1.00005) { Hk = 1.00005; Hk_U = [0, 0, 0, 0]; }
  if (!param.wake && Hk < 1.05) { Hk = 1.05; Hk_U = [0, 0, 0, 0]; }
  let Hs; let Hs_U;
  if (param.turb) {
    const Hsmin = 1.5; const dHsinf = 0.015;
    const [Ret, Ret_U] = mfGetRet(U, param);
    let Ho = 4; let Ho_U = [0, 0, 0, 0];
    if (Ret > 400) { Ho = 3 + 400 / Ret; Ho_U = Ret_U.map((v) => -400 / Ret ** 2 * v); }
    let Reb = Ret; let Reb_U = Ret_U;
    if (Ret < 200) { Reb = 200; Reb_U = [0, 0, 0, 0]; }
    if (Hk < Ho) {
      const Hr = (Ho - Hk) / (Ho - 1);
      const Hr_U = [0, 1, 2, 3].map((k) => (Ho_U[k] - Hk_U[k]) / (Ho - 1) - (Ho - Hk) / (Ho - 1) ** 2 * Ho_U[k]);
      const aa = (2 - Hsmin - 4 / Reb) * Hr ** 2;
      const aa_U = [0, 1, 2, 3].map((k) => (4 / Reb ** 2 * Reb_U[k]) * Hr ** 2 + (2 - Hsmin - 4 / Reb) * 2 * Hr * Hr_U[k]);
      Hs = Hsmin + 4 / Reb + aa * 1.5 / (Hk + 0.5);
      Hs_U = [0, 1, 2, 3].map((k) => -4 / Reb ** 2 * Reb_U[k] + aa_U[k] * 1.5 / (Hk + 0.5) - aa * 1.5 / (Hk + 0.5) ** 2 * Hk_U[k]);
    } else {
      const lrb = Math.log(Reb); const lrb_U = Reb_U.map((v) => 1 / Reb * v);
      const aa = Hk - Ho + 4 / lrb;
      const aa_U = [0, 1, 2, 3].map((k) => Hk_U[k] - Ho_U[k] - 4 / lrb ** 2 * lrb_U[k]);
      const bb = 0.007 * lrb / aa ** 2 + dHsinf / Hk;
      const bb_U = [0, 1, 2, 3].map((k) => 0.007 * (lrb_U[k] / aa ** 2 - 2 * lrb / aa ** 3 * aa_U[k]) - dHsinf / Hk ** 2 * Hk_U[k]);
      Hs = Hsmin + 4 / Reb + (Hk - Ho) ** 2 * bb;
      Hs_U = [0, 1, 2, 3].map((k) => -4 / Reb ** 2 * Reb_U[k] + 2 * (Hk - Ho) * (Hk_U[k] - Ho_U[k]) * bb + (Hk - Ho) ** 2 * bb_U[k]);
    }
    const [M2, M2_U] = mfGetMach2(U, param);
    const den = 1 + 0.014 * M2; const den_M2 = 0.014;
    Hs = (Hs + 0.028 * M2) / den;
    const Hs1 = Hs;
    Hs_U = [0, 1, 2, 3].map((k) => (Hs_U[k] + 0.028 * M2_U[k]) / den - Hs1 / den * den_M2 * M2_U[k]);
  } else {
    const a = Hk - 4.35;
    let Hs_Hk;
    if (Hk < 4.35) {
      const num = 0.0111 * a ** 2 - 0.0278 * a ** 3;
      Hs = num / (Hk + 1) + 1.528 - 0.0002 * (a * Hk) ** 2;
      Hs_Hk = (0.0111 * 2 * a - 0.0278 * 3 * a ** 2) / (Hk + 1) - num / (Hk + 1) ** 2 - 0.0002 * 2 * a * Hk * (Hk + a);
    } else {
      Hs = 0.015 * a ** 2 / Hk + 1.528;
      Hs_Hk = 0.015 * 2 * a / Hk - 0.015 * a ** 2 / Hk ** 2;
    }
    Hs_U = Hk_U.map((v) => Hs_Hk * v);
  }
  return [Hs, Hs_U];
}

function mfGetUs(U, param) {
  const [Hs, Hs_U] = mfGetHs(U, param);
  let [Hk, Hk_U] = mfGetHk(U, param);
  const [H, H_U] = mfGetH(U);
  if (param.wake && Hk < 1.00005) { Hk = 1.00005; Hk_U = [0, 0, 0, 0]; }
  if (!param.wake && Hk < 1.05) { Hk = 1.05; Hk_U = [0, 0, 0, 0]; }
  const bi = 1 / param.GB;
  let Us = 0.5 * Hs * (1 - bi * (Hk - 1) / H);
  let Us_U = [0, 1, 2, 3].map((k) => 0.5 * Hs_U[k] * (1 - bi * (Hk - 1) / H) + 0.5 * Hs * (-bi * (Hk_U[k]) / H + bi * (Hk - 1) / H ** 2 * H_U[k]));
  if (!param.wake && Us > 0.95) { Us = 0.98; Us_U = [0, 0, 0, 0]; }
  if (!param.wake && Us > 0.99995) { Us = 0.99995; Us_U = [0, 0, 0, 0]; }
  return [Us, Us_U];
}

function mfGetCteq(U, param) {
  const CC = 0.5 / (param.GA ** 2 * param.GB); const C = param.GC;
  let [Hk, Hk_U] = mfGetHk(U, param);
  const [Hs, Hs_U] = mfGetHs(U, param);
  const [H, H_U] = mfGetH(U);
  const [Ret, Ret_U] = mfGetRet(U, param);
  const [Us, Us_U] = mfGetUs(U, param);
  let Hkc; let Hkc_U;
  if (param.wake) {
    if (Hk < 1.00005) { Hk = 1.00005; Hk_U = [0, 0, 0, 0]; }
    Hkc = Hk - 1; Hkc_U = Hk_U;
  } else {
    if (Hk < 1.05) { Hk = 1.05; Hk_U = [0, 0, 0, 0]; }
    Hkc = Hk - 1 - C / Ret;
    Hkc_U = [0, 1, 2, 3].map((k) => Hk_U[k] + C / Ret ** 2 * Ret_U[k]);
    if (Hkc < 0.01) { Hkc = 0.01; Hkc_U = [0, 0, 0, 0]; }
  }
  const num = CC * Hs * (Hk - 1) * Hkc ** 2;
  const num_U = [0, 1, 2, 3].map((k) => CC * (Hs_U[k] * (Hk - 1) * Hkc ** 2 + Hs * Hk_U[k] * Hkc ** 2 + Hs * (Hk - 1) * 2 * Hkc * Hkc_U[k]));
  const den = (1 - Us) * H * Hk ** 2;
  const den_U = [0, 1, 2, 3].map((k) => (-Us_U[k]) * H * Hk ** 2 + (1 - Us) * H_U[k] * Hk ** 2 + (1 - Us) * H * 2 * Hk * Hk_U[k]);
  const cteq = Math.sqrt(num / den);
  return [cteq, [0, 1, 2, 3].map((k) => 0.5 / cteq * (num_U[k] / den - num / den ** 2 * den_U[k]))];
}

/** Root shear-stress coefficient just after transition. As in mfoil, it
 * sets param.wake false: transition happens before the wake starts. */
function mfGetCttr(U, param) {
  param.wake = false;
  const [cteq, cteq_U] = mfGetCteq(U, param);
  let [Hk, Hk_U] = mfGetHk(U, param);
  if (Hk < 1.05) { Hk = 1.05; Hk_U = [0, 0, 0, 0]; }
  const C = param.CtauC; const E = param.CtauE;
  const c = C * Math.exp(-E / (Hk - 1));
  const c_U = Hk_U.map((v) => c * E / (Hk - 1) ** 2 * v);
  return [c * cteq, [0, 1, 2, 3].map((k) => c_U[k] * cteq + c * cteq_U[k])];
}

function mfGetUq(ds, ds_U, cf, cf_U, HkIn, Hk_UIn, Ret, Ret_U, param) {
  const beta = param.GB; let A = param.GA; let C = param.GC;
  if (param.wake) { A *= param.Dlr; C = 0; }
  let Hk = HkIn; let Hk_U = Hk_UIn;
  const n = Hk_U.length;
  if (param.wake && Hk < 1.00005) { Hk = 1.00005; Hk_U = new Array(n).fill(0); }
  if (!param.wake && Hk < 1.05) { Hk = 1.05; Hk_U = new Array(n).fill(0); }
  let Hkc = Hk - 1 - C / Ret;
  let Hkc_U = Hk_U.map((v, k) => v + C / Ret ** 2 * Ret_U[k]);
  if (Hkc < 0.01) { Hkc = 0.01; Hkc_U = new Array(n).fill(0); }
  const ut = 0.5 * cf - (Hkc / (A * Hk)) ** 2;
  const ut_U = cf_U.map((v, k) => 0.5 * v - 2 * (Hkc / (A * Hk)) * (Hkc_U[k] / (A * Hk) - Hkc / (A * Hk ** 2) * Hk_U[k]));
  const uq = ut / (beta * ds);
  return [uq, ut_U.map((v, k) => v / (beta * ds) - uq / ds * ds_U[k])];
}

function mfGetCDiTurbwall(U, param) {
  if (param.wake) return [0, [0, 0, 0, 0]];
  const [cf, cf_U] = mfGetCf(U, param);
  const [Hk, Hk_U] = mfGetHk(U, param);
  const [Hs, Hs_U] = mfGetHs(U, param);
  const [Us, Us_U] = mfGetUs(U, param);
  const [Ret, Ret_U] = mfGetRet(U, param);
  const lr = Math.log(Ret); const lr_U = Ret_U.map((v) => v / Ret);
  const Hmin = 1 + 2.1 / lr; const Hmin_U = lr_U.map((v) => -2.1 / lr ** 2 * v);
  const aa = Math.tanh((Hk - 1) / (Hmin - 1)); const fac = 0.5 + 0.5 * aa;
  const fac_U = [0, 1, 2, 3].map((k) => 0.5 * (1 - aa ** 2) * (Hk_U[k] / (Hmin - 1) - (Hk - 1) / (Hmin - 1) ** 2 * Hmin_U[k]));
  const cDi = 0.5 * cf * Us * (2 / Hs) * fac;
  return [cDi, [0, 1, 2, 3].map((k) => cf_U[k] * Us / Hs * fac + cf * Us_U[k] / Hs * fac - cDi / Hs * Hs_U[k] + cf * Us / Hs * fac_U[k])];
}

function mfGetCDiLam(U, param) {
  const [Hk, Hk_U] = mfGetHk(U, param);
  const [Ret, Ret_U] = mfGetRet(U, param);
  let num; let num_Hk;
  if (Hk < 4) {
    num = 0.00205 * (4 - Hk) ** 5.5 + 0.207;
    num_Hk = 0.00205 * 5.5 * (4 - Hk) ** 4.5 * (-1);
  } else {
    const Hk1 = Hk - 4;
    num = -0.0016 * Hk1 ** 2 / (1 + 0.02 * Hk1 ** 2) + 0.207;
    num_Hk = -0.0016 * (2 * Hk1 / (1 + 0.02 * Hk1 ** 2) - Hk1 ** 2 / (1 + 0.02 * Hk1 ** 2) ** 2 * 0.02 * 2 * Hk1);
  }
  const cDi = num / Ret;
  return [cDi, [0, 1, 2, 3].map((k) => num_Hk / Ret * Hk_U[k] - num / Ret ** 2 * Ret_U[k])];
}

function mfGetCDiLamwake(U, paramIn) {
  const param = { ...paramIn, turb: false };
  const [Hk, Hk_U] = mfGetHk(U, param);
  const [Hs, Hs_U] = mfGetHs(U, param);
  const [Ret, Ret_U] = mfGetRet(U, param);
  const HsRet = Hs * Ret;
  const HsRet_U = [0, 1, 2, 3].map((k) => Hs_U[k] * Ret + Hs * Ret_U[k]);
  const num = 2 * 1.1 * (1 - 1 / Hk) ** 2 * (1 / Hk);
  const num_Hk = 2 * 1.1 * (2 * (1 - 1 / Hk) * (1 / Hk ** 2) * (1 / Hk) + (1 - 1 / Hk) ** 2 * (-1 / Hk ** 2));
  const cDi = num / HsRet;
  return [cDi, [0, 1, 2, 3].map((k) => num_Hk * Hk_U[k] / HsRet - num / HsRet ** 2 * HsRet_U[k])];
}

function mfGetCDiOuter(U, param) {
  if (!param.turb) return [0, [0, 0, 0, 0]];
  const [Hs, Hs_U] = mfGetHs(U, param);
  const [Us, Us_U] = mfGetUs(U, param);
  const ct = U[2] ** 2; const ct_U = [0, 0, 2 * U[2], 0];
  const cDi = ct * (0.995 - Us) * 2 / Hs;
  return [cDi, [0, 1, 2, 3].map((k) => ct_U[k] * (0.995 - Us) * 2 / Hs + ct * (-Us_U[k]) * 2 / Hs - ct * (0.995 - Us) * 2 / Hs ** 2 * Hs_U[k])];
}

function mfGetCDiLamstress(U, param) {
  const [Hs, Hs_U] = mfGetHs(U, param);
  const [Us, Us_U] = mfGetUs(U, param);
  const [Ret, Ret_U] = mfGetRet(U, param);
  const HsRet = Hs * Ret;
  const HsRet_U = [0, 1, 2, 3].map((k) => Hs_U[k] * Ret + Hs * Ret_U[k]);
  const num = 0.15 * (0.995 - Us) ** 2 * 2;
  const num_Us = 0.15 * 2 * (0.995 - Us) * (-1) * 2;
  const cDi = num / HsRet;
  return [cDi, [0, 1, 2, 3].map((k) => num_Us * Us_U[k] / HsRet - num / HsRet ** 2 * HsRet_U[k])];
}

function mfGetCDi(U, param) {
  if (param.turb) {
    let cDi = 0; let cDi_U = [0, 0, 0, 0];
    let cDil; let cDil_U;
    if (!param.wake) {
      const [c0, c0_U] = mfGetCDiTurbwall(U, param);
      cDi += c0; cDi_U = cDi_U.map((v, k) => v + c0_U[k]);
      [cDil, cDil_U] = mfGetCDiLam(U, param);
    } else {
      [cDil, cDil_U] = mfGetCDiLamwake(U, param);
    }
    let [c0, c0_U] = mfGetCDiOuter(U, param);
    cDi += c0; cDi_U = cDi_U.map((v, k) => v + c0_U[k]);
    [c0, c0_U] = mfGetCDiLamstress(U, param);
    cDi += c0; cDi_U = cDi_U.map((v, k) => v + c0_U[k]);
    if (cDil > cDi) { cDi = cDil; cDi_U = cDil_U; }
    if (param.wake) { cDi *= 2; cDi_U = cDi_U.map((v) => 2 * v); }
    return [cDi, cDi_U];
  }
  return mfGetCDiLam(U, param);
}

function mfGetCDixt(U, x, param) {
  const [cDi, cDi_U] = mfGetCDi(U, param);
  const cDixt = cDi * x / U[0];
  const cDixt_U = cDi_U.map((v) => v * x / U[0]);
  cDixt_U[0] -= cDixt / U[0];
  return [cDixt, cDixt_U, cDi / U[0]];
}

/** Amplification onset ramp fitted to Orr-Sommerfeld envelope curves —
 * mfoil's opt-in alternative to the cubic ramp (param.onset 'envelope'). */
function mfOnsetEnvelope(z, z_U, Hmi, Hmi_U) {
  const ln10 = Math.log(10);
  const c0 = -0.6877; const c1 = 0.6797; const zcap = -0.05; const w = 0.03;
  const zl = c0 + c1 * Hmi;
  const x = (zcap - zl) / w;
  const sp = x > 30 ? x : Math.log1p(Math.exp(x));
  const sig = 1 / (1 + Math.exp(-x));
  const zc = zcap - w * sp; const zc_U = Hmi_U.map((v) => sig * c1 * v);
  const q = 10 ** (zc / 3);
  const k = ln10 / (1 - q); const k_U = zc_U.map((v) => ln10 * (ln10 / 3 * q) / (1 - q) ** 2 * v);
  const u = k * (z - zc);
  const u_U = k_U.map((v, i) => v * (z - zc) + k * (z_U[i] - zc_U[i]));
  if (u <= 0) return [0, z_U.map(() => 0)];
  const e = Math.exp(-u);
  return [1 - e * (1 + u + 0.5 * u ** 2), u_U.map((v) => 0.5 * u ** 2 * e * v)];
}

function mfGetDamp(U, param) {
  let [Hk, Hk_U] = mfGetHk(U, param);
  const [Ret, Ret_U] = mfGetRet(U, param);
  const th = U[0];
  if (Hk < 1.05) { Hk = 1.05; Hk_U = [0, 0, 0, 0]; }
  const Hmi = 1 / (Hk - 1); const Hmi_U = Hk_U.map((v) => -(Hmi ** 2) * v);
  const aa = 2.492 * Hmi ** 0.43; const aa_U = Hmi_U.map((v) => 0.43 * aa / Hmi * v);
  const bb = Math.tanh(14 * Hmi - 9.24); const bb_U = Hmi_U.map((v) => (1 - bb ** 2) * 14 * v);
  const lrc = aa + 0.7 * (bb + 1); const lrc_U = aa_U.map((v, k) => v + 0.7 * bb_U[k]);
  const lten = Math.log(10); const lr = Math.log(Ret) / lten; const lr_U = Ret_U.map((v) => (1 / Ret) * v / lten);
  const dl = 0.1;
  let damp = 0; let damp_U = [0, 0, 0, 0];
  let active; let rf = 0; let rf_U = [0, 0, 0, 0];
  if (param.onset === 'envelope') {
    [rf, rf_U] = mfOnsetEnvelope(lr - lrc, lr_U.map((v, k) => v - lrc_U[k]), Hmi, Hmi_U);
    active = rf > 0;
  } else {
    active = lr >= lrc - dl;
    if (active) {
      const rn = (lr - (lrc - dl)) / (2 * dl); const rn_U = lr_U.map((v, k) => (v - lrc_U[k]) / (2 * dl));
      if (rn >= 1) { rf = 1; rf_U = [0, 0, 0, 0]; } else { rf = 3 * rn ** 2 - 2 * rn ** 3; rf_U = rn_U.map((v) => (6 * rn - 6 * rn ** 2) * v); }
    }
  }
  if (active) {
    const ar = 3.87 * Hmi - 2.52; const ar_U = Hmi_U.map((v) => 3.87 * v);
    const ex = Math.exp(-(ar ** 2)); const ex_U = ar_U.map((v) => ex * (-2 * ar * v));
    const da = 0.028 * (Hk - 1) - 0.0345 * ex; const da_U = Hk_U.map((v, k) => 0.028 * v - 0.0345 * ex_U[k]);
    const af = -0.05 + 2.7 * Hmi - 5.5 * Hmi ** 2 + 3 * Hmi ** 3 + 0.1 * Math.exp(-20 * Hmi);
    const af_U = Hmi_U.map((v) => (2.7 - 11 * Hmi + 9 * Hmi ** 2 - 2 * Math.exp(-20 * Hmi)) * v);
    damp = rf * af * da / th;
    damp_U = [0, 1, 2, 3].map((k) => (rf_U[k] * af * da + rf * af_U[k] * da + rf * af * da_U[k]) / th - damp / th * (k === 0 ? 1 : 0));
  }
  const Cea = 5; const nx = Cea * (U[2] - param.ncrit);
  const tnx = Math.tanh(nx);
  const eex = 1 + tnx; const eex_U = [0, 0, (1 - tnx ** 2) * Cea, 0];
  const ed = eex * 0.001 / th;
  const ed_U = [0, 1, 2, 3].map((k) => eex_U[k] * 0.001 / th - ed / th * (k === 0 ? 1 : 0));
  return [damp + ed, damp_U.map((v, k) => v + ed_U[k])];
}

function mfGetUpw(U1, U2, param) {
  const [Hk1, Hk1_U1] = mfGetHk(U1, param);
  const [Hk2, Hk2_U2] = mfGetHk(U2, param);
  const C = param.wake ? 1 : 5;
  const Huc = C * 1 / Hk2 ** 2;
  const Huc_U = [0, 0, 0, 0, ...Hk2_U2.map((v) => -2 * Huc / Hk2 * v)];
  const aa = (Hk2 - 1) / (Hk1 - 1); const sga = Math.sign(aa);
  const la = Math.log(sga * aa);
  const la_U = [...Hk1_U1.map((v) => -1 / (Hk1 - 1) * v), ...Hk2_U2.map((v) => 1 / (Hk2 - 1) * v)];
  let Hls = la ** 2; let Hls_U = la_U.map((v) => 2 * la * v);
  if (Hls > 15) { Hls = 15; Hls_U = Hls_U.map((v) => v * 0); }
  const e = Math.exp(-Hls * Huc);
  return [1 - 0.5 * e, Hls_U.map((v, k) => -0.5 * e * (-v * Huc - Hls * Huc_U[k]))];
}

/** Upwinded average of two scalars: [f, f_U] with f_U over [U1, U2]. */
function mfUpwind(upw, upw_U, f1, f1_U1, f2, f2_U2) {
  const f = (1 - upw) * f1 + upw * f2;
  const f_U = new Array(8);
  for (let k = 0; k < 4; k++) {
    f_U[k] = (upw_U ? (-upw_U[k]) * f1 + upw_U[k] * f2 : 0) + (1 - upw) * f1_U1[k];
    f_U[k + 4] = (upw_U ? (-upw_U[k + 4]) * f1 + upw_U[k + 4] * f2 : 0) + upw * f2_U2[k];
  }
  return [f, f_U];
}

// ---------------------------------------------------------------- residuals

function mfZeros8() { return [0, 0, 0, 0, 0, 0, 0, 0]; }

/** The viscous residual of one interval (mfoil's residual_station):
 * momentum, shape parameter, and amplification or shear lag. R_U is 3 x 8
 * over [U1, U2]; R_x is 3 x 2 over the two xi. */
function mfResidualStation(param, x, Uin1, Uin2, Aux) {
  const U1 = [Uin1[0], Uin1[1] - Aux[0], Uin1[2], Uin1[3]];
  const U2 = [Uin2[0], Uin2[1] - Aux[1], Uin2[2], Uin2[3]];
  const Um = [0.5 * (U1[0] + U2[0]), 0.5 * (U1[1] + U2[1]), 0.5 * (U1[2] + U2[2]), 0.5 * (U1[3] + U2[3])];
  const th = [U1[0], U2[0]]; const ds = [U1[1], U2[1]]; const sa = [U1[2], U2[2]];
  const [uk1, uk1_u] = mfGetUk(U1[3], param);
  const [uk2, uk2_u] = mfGetUk(U2[3], param);
  let thlog = Math.log(th[1] / th[0]);
  let thlog_U = [-1 / th[0], 0, 0, 0, 1 / th[1], 0, 0, 0];
  let uelog = Math.log(uk2 / uk1);
  let uelog_U = [0, 0, 0, -uk1_u / uk1, 0, 0, 0, uk2_u / uk2];
  let xlog = Math.log(x[1] / x[0]); let xlog_x = [-1 / x[0], 1 / x[1]];
  let dx = x[1] - x[0]; let dx_x = [-1, 1];
  const [upw, upw_U] = mfGetUpw(U1, U2, param);
  const [H1, H1_U1] = mfGetH(U1);
  const [H2, H2_U2] = mfGetH(U2);
  const H = 0.5 * (H1 + H2);
  const H_U = [...H1_U1, ...H2_U2].map((v) => 0.5 * v);
  const [Hs1, Hs1_U1] = mfGetHs(U1, param);
  const [Hs2, Hs2_U2] = mfGetHs(U2, param);
  const [Hs, Hs_U] = mfUpwind(0.5, null, Hs1, Hs1_U1, Hs2, Hs2_U2);
  let Hslog = Math.log(Hs2 / Hs1);
  let Hslog_U = [...Hs1_U1.map((v) => -1 / Hs1 * v), ...Hs2_U2.map((v) => 1 / Hs2 * v)];
  if (param.simi) {
    thlog = 0; thlog_U = mfZeros8();
    Hslog = 0; Hslog_U = mfZeros8();
    uelog = 1; uelog_U = mfZeros8();
    xlog = 1; xlog_x = [0, 0];
    dx = 0.5 * (x[0] + x[1]); dx_x = [0.5, 0.5];
  }
  const [Hw1, Hw1_U1] = mfGetHw(U1, Aux[0]);
  const [Hw2, Hw2_U2] = mfGetHw(U2, Aux[1]);
  const Hw = 0.5 * (Hw1 + Hw2);
  const Hw_U = [...Hw1_U1, ...Hw2_U2].map((v) => 0.5 * v);
  let Rlag; let Rlag_U; let Rlag_x;
  if (param.turb) {
    const salog = Math.log(sa[1] / sa[0]);
    const salog_U = [0, 0, -1 / sa[0], 0, 0, 0, 1 / sa[1], 0];
    const [de1, de1_U1] = mfGetDe(U1, param);
    const [de2, de2_U2] = mfGetDe(U2, param);
    const [de, de_U] = mfUpwind(0.5, null, de1, de1_U1, de2, de2_U2);
    const [Us1, Us1_U1] = mfGetUs(U1, param);
    const [Us2, Us2_U2] = mfGetUs(U2, param);
    const [Us, Us_U] = mfUpwind(0.5, null, Us1, Us1_U1, Us2, Us2_U2);
    const [Hk1, Hk1_U1] = mfGetHk(U1, param);
    const [Hk2, Hk2_U2] = mfGetHk(U2, param);
    const [Hk, Hk_U] = mfUpwind(upw, upw_U, Hk1, Hk1_U1, Hk2, Hk2_U2);
    const [Ret1, Ret1_U1] = mfGetRet(U1, param);
    const [Ret2, Ret2_U2] = mfGetRet(U2, param);
    const [Ret, Ret_U] = mfUpwind(0.5, null, Ret1, Ret1_U1, Ret2, Ret2_U2);
    const [cf1, cf1_U1] = mfGetCf(U1, param);
    const [cf2, cf2_U2] = mfGetCf(U2, param);
    const [cf, cf_U] = mfUpwind(upw, upw_U, cf1, cf1_U1, cf2, cf2_U2);
    const dsa = 0.5 * (ds[0] + ds[1]);
    const dsa_U = [0, 0.5, 0, 0, 0, 0.5, 0, 0];
    const [uq, uq_U] = mfGetUq(dsa, dsa_U, cf, cf_U, Hk, Hk_U, Ret, Ret_U, param);
    const [cteq1, cteq1_U1] = mfGetCteq(U1, param);
    const [cteq2, cteq2_U2] = mfGetCteq(U2, param);
    const [cteq, cteq_U] = mfUpwind(upw, upw_U, cteq1, cteq1_U1, cteq2, cteq2_U2);
    const [saa, saa_U] = mfUpwind(upw, upw_U, sa[0], [0, 0, 1, 0], sa[1], [0, 0, 1, 0]);
    const Klag = param.SlagK; const beta = param.GB;
    const Clag = Klag / beta * 1 / (1 + Us);
    const Clag_U = Us_U.map((v) => -Clag / (1 + Us) * v);
    const ald = param.wake ? param.Dlr : 1.0;
    const Cuq = param.Cuq;
    Rlag = Clag * (cteq - ald * saa) * dx - 2 * de * salog + 2 * de * (uq * dx - uelog) * Cuq;
    Rlag_U = new Array(8);
    for (let k = 0; k < 8; k++) {
      Rlag_U[k] = Clag_U[k] * (cteq - ald * saa) * dx + Clag * (cteq_U[k] - ald * saa_U[k]) * dx
        - 2 * de_U[k] * salog - 2 * de * salog_U[k]
        + 2 * de_U[k] * (uq * dx - uelog) * Cuq + 2 * de * (uq_U[k] * dx - uelog_U[k]) * Cuq;
    }
    Rlag_x = dx_x.map((v) => Clag * (cteq - ald * saa) * v + 2 * de * uq * v);
  } else if (param.simi) {
    Rlag = sa[0] + sa[1];
    Rlag_U = [0, 0, 1, 0, 0, 0, 1, 0];
    Rlag_x = [0, 0];
  } else {
    const [damp1, damp1_U1] = mfGetDamp(U1, param);
    const [damp2, damp2_U2] = mfGetDamp(U2, param);
    const [damp, damp_U] = mfUpwind(0.5, null, damp1, damp1_U1, damp2, damp2_U2);
    Rlag = sa[1] - sa[0] - damp * dx;
    const base = [0, 0, -1, 0, 0, 0, 1, 0];
    Rlag_U = base.map((v, k) => v - damp_U[k] * dx);
    Rlag_x = dx_x.map((v) => -damp * v);
  }
  const [Ms1, Ms1_U1] = mfGetMach2(U1, param);
  const [Ms2, Ms2_U2] = mfGetMach2(U2, param);
  const [Ms, Ms_U] = mfUpwind(0.5, null, Ms1, Ms1_U1, Ms2, Ms2_U2);
  const [cfxt1, cfxt1_U1, cfxt1_x1] = mfGetCfxt(U1, x[0], param);
  const [cfxt2, cfxt2_U2, cfxt2_x2] = mfGetCfxt(U2, x[1], param);
  const [cfxtm, cfxtm_Um, cfxtm_xm] = mfGetCfxt(Um, 0.5 * (x[0] + x[1]), param);
  const cfxt = 0.25 * cfxt1 + 0.5 * cfxtm + 0.25 * cfxt2;
  const cfxt_U = [...cfxt1_U1.map((v, k) => 0.25 * (v + cfxtm_Um[k])), ...cfxt2_U2.map((v, k) => 0.25 * (cfxtm_Um[k] + v))];
  const cfxt_x = [0.25 * (cfxt1_x1 + cfxtm_xm), 0.25 * (cfxtm_xm + cfxt2_x2)];
  const Rmom = thlog + (2 + H + Hw - Ms) * uelog - 0.5 * xlog * cfxt;
  const Rmom_U = new Array(8);
  for (let k = 0; k < 8; k++) Rmom_U[k] = thlog_U[k] + (H_U[k] + Hw_U[k] - Ms_U[k]) * uelog + (2 + H + Hw - Ms) * uelog_U[k] - 0.5 * xlog * cfxt_U[k];
  const Rmom_x = [0, 1].map((k) => -0.5 * xlog_x[k] * cfxt - 0.5 * xlog * cfxt_x[k]);
  const [cDixt1, cDixt1_U1, cDixt1_x1] = mfGetCDixt(U1, x[0], param);
  const [cDixt2, cDixt2_U2, cDixt2_x2] = mfGetCDixt(U2, x[1], param);
  const [cDixt, cDixt_U] = mfUpwind(upw, upw_U, cDixt1, cDixt1_U1, cDixt2, cDixt2_U2);
  const cDixt_x = [(1 - upw) * cDixt1_x1, upw * cDixt2_x2];
  const [cfxtu, cfxtu_U] = mfUpwind(upw, upw_U, cfxt1, cfxt1_U1, cfxt2, cfxt2_U2);
  const cfxtu_x = [(1 - upw) * cfxt1_x1, upw * cfxt2_x2];
  const [Hss1, Hss1_U1] = mfGetHss(U1, param);
  const [Hss2, Hss2_U2] = mfGetHss(U2, param);
  const [Hss, Hss_U] = mfUpwind(0.5, null, Hss1, Hss1_U1, Hss2, Hss2_U2);
  const Rshape = Hslog + (2 * Hss / Hs + 1 - H - Hw) * uelog + xlog * (0.5 * cfxtu - cDixt);
  const Rshape_U = new Array(8);
  for (let k = 0; k < 8; k++) {
    Rshape_U[k] = Hslog_U[k] + (2 * Hss_U[k] / Hs - 2 * Hss / Hs ** 2 * Hs_U[k] - H_U[k] - Hw_U[k]) * uelog
      + (2 * Hss / Hs + 1 - H - Hw) * uelog_U[k] + xlog * (0.5 * cfxtu_U[k] - cDixt_U[k]);
  }
  const Rshape_x = [0, 1].map((k) => xlog_x[k] * (0.5 * cfxtu - cDixt) + xlog * (0.5 * cfxtu_x[k] - cDixt_x[k]));
  return { R: [Rmom, Rshape, Rlag], R_U: [Rmom_U, Rshape_U, Rlag_U], R_x: [Rmom_x, Rshape_x, Rlag_x] };
}

function mfBuildParam(M, si) {
  const param = { ...M.param };
  param.wake = (si === 2);
  param.turb = param.wake;
  param.simi = false;
  return param;
}

function mfStationParam(M, param, i) {
  param.turb = !!M.vsol.turb[i];
  param.simi = (i === M.isol.Istag[0] || i === M.isol.Istag[1]);
}

function mfCol(U, i) { return [U[0][i], U[1][i], U[2][i], U[3][i]]; }
function mfSetCol(U, i, v) { U[0][i] = v[0]; U[1][i] = v[1]; U[2][i] = v[2]; U[3][i] = v[3]; }

/** The combined laminar and turbulent residual of the interval in which
 * transition happens; finds the transition point by Newton's method on the
 * amplification equation and carries its sensitivities. */
function mfResidualTransition(M, paramIn, x, U1, U2, Aux) {
  const sa = [U1[2], U2[2]];
  const x1 = x[0]; const x2 = x[1]; const dx = x2 - x1;
  let xt = x1 + 0.5 * dx;
  const ncrit = paramIn.ncrit;
  const nNewton = 30;
  let w1; let w2; let Ut; let Ut_xt; let damp1; let damp1_U1; let dampt; let dampt_Ut; let Rxt_xt;
  for (let iNewton = 0; iNewton < nNewton; iNewton++) {
    w2 = (xt - x1) / dx; w1 = 1 - w2;
    Ut = [0, 1, 2, 3].map((k) => w1 * U1[k] + w2 * U2[k]);
    Ut_xt = [0, 1, 2, 3].map((k) => (U2[k] - U1[k]) / dx);
    Ut[2] = ncrit; Ut_xt[2] = 0;
    [damp1, damp1_U1] = mfGetDamp(U1, paramIn);
    [dampt, dampt_Ut] = mfGetDamp(Ut, paramIn);
    dampt_Ut[2] = 0;
    const Rxt = ncrit - sa[0] - 0.5 * (xt - x1) * (damp1 + dampt);
    let dot = 0;
    for (let k = 0; k < 4; k++) dot += dampt_Ut[k] * Ut_xt[k];
    Rxt_xt = -0.5 * (damp1 + dampt) - 0.5 * (xt - x1) * dot;
    let dxt = -Rxt / Rxt_xt;
    const dmax = 0.2 * dx * (1.1 - iNewton / nNewton);
    if (Math.abs(dxt) > dmax) dxt = dxt * dmax / Math.abs(dxt);
    if (Math.abs(Rxt) < 1e-14) break;
    xt += dxt;
  }
  M.vsol.xt = xt;
  const Rxt_U = [...damp1_U1.map((v, k) => -0.5 * (xt - x1) * (v + dampt_Ut[k] * w1)), ...dampt_Ut.map((v) => -0.5 * (xt - x1) * (v * w2))];
  Rxt_U[2] -= 1;
  const Ut_x1 = [0, 1, 2, 3].map((k) => (U2[k] - U1[k]) * (w2 - 1) / dx);
  const Ut_x2 = [0, 1, 2, 3].map((k) => (U2[k] - U1[k]) * (-w2) / dx);
  Ut_x1[2] = 0; Ut_x2[2] = 0;
  let d1 = 0; let d2 = 0;
  for (let k = 0; k < 4; k++) { d1 += dampt_Ut[k] * Ut_x1[k]; d2 += dampt_Ut[k] * Ut_x2[k]; }
  const Rxt_x1 = 0.5 * (damp1 + dampt) - 0.5 * (xt - x1) * d1;
  const Rxt_x2 = -0.5 * (xt - x1) * d2;
  const xt_U = Rxt_U.map((v) => -v / Rxt_xt);
  const xt_U1 = xt_U.slice(0, 4); const xt_U2 = xt_U.slice(4, 8);
  const xt_x1 = -Rxt_x1 / Rxt_xt; const xt_x2 = -Rxt_x2 / Rxt_xt;
  for (let k = 0; k < 4; k++) { Ut_x1[k] += Ut_xt[k] * xt_x1; Ut_x2[k] += Ut_xt[k] * xt_x2; }
  // Ut_U1, Ut_U2: 4 x 4
  const Ut_U1 = []; const Ut_U2 = [];
  for (let r = 0; r < 4; r++) {
    Ut_U1.push([0, 1, 2, 3].map((c) => (r === c ? w1 : 0) + (U2[r] - U1[r]) * xt_U1[c] / dx));
    Ut_U2.push([0, 1, 2, 3].map((c) => (r === c ? w2 : 0) + (U2[r] - U1[r]) * xt_U2[c] / dx));
  }
  const Utl = Ut.slice(); const Utl_U1 = Ut_U1.map((r) => r.slice()); const Utl_U2 = Ut_U2.map((r) => r.slice());
  const Utl_x1 = Ut_x1.slice(); const Utl_x2 = Ut_x2.slice();
  Utl[2] = ncrit; Utl_U1[2] = [0, 0, 0, 0]; Utl_U2[2] = [0, 0, 0, 0]; Utl_x1[2] = 0; Utl_x2[2] = 0;
  const Utt = Ut.slice(); const Utt_U1 = Ut_U1.map((r) => r.slice()); const Utt_U2 = Ut_U2.map((r) => r.slice());
  const Utt_x1 = Ut_x1.slice(); const Utt_x2 = Ut_x2.slice();
  const param = mfBuildParam(M, 0);
  param.turb = true;
  const [cttr, cttr_Ut] = mfGetCttr(Ut, param);
  Utt[2] = cttr;
  for (let c = 0; c < 4; c++) {
    let a = 0; let b = 0;
    for (let k = 0; k < 4; k++) { a += cttr_Ut[k] * Ut_U1[k][c]; b += cttr_Ut[k] * Ut_U2[k][c]; }
    Utt_U1[2][c] = a; Utt_U2[2][c] = b;
  }
  let e1 = 0; let e2 = 0;
  for (let k = 0; k < 4; k++) { e1 += cttr_Ut[k] * Ut_x1[k]; e2 += cttr_Ut[k] * Ut_x2[k]; }
  Utt_x1[2] = e1; Utt_x2[2] = e2;
  param.turb = false;
  const L = mfResidualStation(param, [x1, xt], U1, Utl, Aux);
  param.turb = true;
  const T = mfResidualStation(param, [xt, x2], Utt, U2, Aux);
  const R = [0, 1, 2].map((r) => L.R[r] + T.R[r]);
  const R_U = []; const R_x = [];
  for (let r = 0; r < 3; r++) {
    const Rl_U1 = L.R_U[r].slice(0, 4); const Rl_Utl = L.R_U[r].slice(4, 8);
    const Rt_Utt = T.R_U[r].slice(0, 4); const Rt_U2 = T.R_U[r].slice(4, 8);
    const row = new Array(8);
    for (let c = 0; c < 4; c++) {
      let a = Rl_U1[c]; let b = 0;
      let s1 = 0; let s2 = 0; let s3 = 0; let s4 = 0;
      for (let k = 0; k < 4; k++) {
        s1 += Rl_Utl[k] * Utl_U1[k][c]; s2 += Rt_Utt[k] * Utt_U1[k][c];
        s3 += Rl_Utl[k] * Utl_U2[k][c]; s4 += Rt_Utt[k] * Utt_U2[k][c];
      }
      a = a + s1 + L.R_x[r][1] * xt_U1[c] + s2 + T.R_x[r][0] * xt_U1[c];
      b = s3 + L.R_x[r][1] * xt_U2[c] + s4 + Rt_U2[c] + T.R_x[r][0] * xt_U2[c];
      row[c] = a; row[c + 4] = b;
    }
    R_U.push(row);
    let q1 = 0; let q2 = 0; let q3 = 0; let q4 = 0;
    for (let k = 0; k < 4; k++) {
      q1 += Rl_Utl[k] * Utl_x1[k]; q2 += Rt_Utt[k] * Utt_x1[k];
      q3 += Rl_Utl[k] * Utl_x2[k]; q4 += Rt_Utt[k] * Utt_x2[k];
    }
    R_x.push([
      L.R_x[r][0] + L.R_x[r][1] * xt_x1 + T.R_x[r][0] * xt_x1 + q1 + q2,
      T.R_x[r][1] + L.R_x[r][1] * xt_x2 + T.R_x[r][0] * xt_x2 + q3 + q4,
    ]);
  }
  return { R, R_U, R_x };
}

/** Extrapolates the first two boundary-layer states to the stagnation
 * point: linearly for th, ds, sa, and ue = K x through the two. */
function mfStagnationState(U1, U2, x1, x2) {
  const dx = x2 - x1; const dx_x = [-1, 1];
  const rx = x2 / x1; const rx_x = [-rx / x1, 1 / x1];
  const w1 = x2 / dx; const w1_x = [-w1 / dx * dx_x[0] + 0 / dx, -w1 / dx * dx_x[1] + 1 / dx];
  const w2 = -x1 / dx; const w2_x = [-w2 / dx * dx_x[0] + (-1) / dx, -w2 / dx * dx_x[1] + 0 / dx];
  const Ust = [0, 1, 2, 3].map((k) => U1[k] * w1 + U2[k] * w2);
  const wk1 = rx / dx; const wk1_x = [0, 1].map((k) => rx_x[k] / dx - wk1 / dx * dx_x[k]);
  const wk2 = -1 / (rx * dx); const wk2_x = [0, 1].map((k) => -wk2 * (rx_x[k] / rx + dx_x[k] / dx));
  const K = wk1 * U1[3] + wk2 * U2[3];
  const K_U = [0, 0, 0, wk1, 0, 0, 0, wk2];
  const K_x = [0, 1].map((k) => U1[3] * wk1_x[k] + U2[3] * wk2_x[k]);
  const xst = 1e-6;
  Ust[3] = K * xst;
  const Ust_U = [
    [w1, 0, 0, 0, w2, 0, 0, 0],
    [0, w1, 0, 0, 0, w2, 0, 0],
    [0, 0, w1, 0, 0, 0, w2, 0],
    K_U.map((v) => v * xst),
  ];
  const Ust_x = [0, 1, 2].map((r) => [0, 1].map((k) => U1[r] * w1_x[k] + U2[r] * w2_x[k]));
  Ust_x.push(K_x.map((v) => v * xst));
  return { Ust, Ust_U, Ust_x, xst };
}

function mfThwaitesInit(K, nu) {
  const th = Math.sqrt(0.45 * nu / (6 * K));
  return [th, 2.2 * th];
}

/** The first wake station: thetas and displacement thicknesses add, with
 * the trailing-edge gap, and the shear stress is theta-averaged. */
function mfWakeSys(M, param) {
  const il = M.vsol.Is[0][M.vsol.Is[0].length - 1]; const Ul = mfCol(M.glob.U, il);
  const iu = M.vsol.Is[1][M.vsol.Is[1].length - 1]; const Uu = mfCol(M.glob.U, iu);
  const iw = M.vsol.Is[2][0]; const Uw = mfCol(M.glob.U, iw);
  const te = mfTEInfo(M.foil.x);
  param.turb = true; param.wake = false;
  let ctl; let ctl_Ul; let ctu; let ctu_Uu;
  if (M.vsol.turb[il]) { ctl = Ul[2]; ctl_Ul = [0, 0, 1, 0]; } else [ctl, ctl_Ul] = mfGetCttr(Ul, param);
  if (M.vsol.turb[iu]) { ctu = Uu[2]; ctu_Uu = [0, 0, 1, 0]; } else [ctu, ctu_Uu] = mfGetCttr(Uu, param);
  const thsum = Ul[0] + Uu[0];
  const ctw = (ctl * Ul[0] + ctu * Uu[0]) / thsum;
  const ctw_Ul = [0, 1, 2, 3].map((k) => (ctl_Ul[k] * Ul[0] + (ctl - ctw) * (k === 0 ? 1 : 0)) / thsum);
  const ctw_Uu = [0, 1, 2, 3].map((k) => (ctu_Uu[k] * Uu[0] + (ctu - ctw) * (k === 0 ? 1 : 0)) / thsum);
  const R = [Uw[0] - (Ul[0] + Uu[0]), Uw[1] - (Ul[1] + Uu[1] + te.hTE), Uw[2] - ctw];
  const R_U = [
    [-1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0],
    [0, -1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0],
    [...ctw_Ul.map((v) => -v), ...ctw_Uu.map((v) => -v), 0, 0, 1, 0],
  ];
  return { R, R_U, J: [il, iu, iw] };
}

function mfWakeInit(M, ue) {
  const iw = M.vsol.Is[2][0];
  const Uw = mfCol(M.glob.U, iw);
  const { R } = mfWakeSys(M, M.param);
  Uw[0] -= R[0]; Uw[1] -= R[1]; Uw[2] -= R[2]; Uw[3] = ue;
  mfSetCol(M.glob.U, iw, Uw);
  return Uw;
}

function mfStoreTransition(M, si, i) {
  const xt = M.vsol.xt;
  const i0 = M.vsol.Is[si][i - 1]; const i1 = M.vsol.Is[si][i];
  const xi0 = M.isol.xi[i0]; const xi1 = M.isol.xi[i1];
  if (!(i0 < M.foil.N && i1 < M.foil.N)) throw new Error('mfoil: transition can only be stored on the airfoil');
  const x0 = M.foil.x[0][i0]; const x1 = M.foil.x[0][i1];
  M.vsol.Xt[si][0] = xt;
  M.vsol.Xt[si][1] = x0 + (xt - xi0) / (xi1 - xi0) * (x1 - x0);
}

/** Marches the boundary layer on the inviscid edge speed to start the
 * coupled solution: Thwaites at the stagnation point, a direct march that
 * turns inverse (prescribed Hk) where the layer would separate, and e^N
 * transition along the way. */
function mfInitBoundaryLayer(M) {
  const Hmaxl = 3.8; const Hmaxt = 2.5;
  const ueinv = mfGetUeinv(M);
  const Nsys = M.foil.N + M.wake.N;
  M.glob.Nsys = Nsys;
  if (M.oper.initbl === false && M.glob.U && M.glob.U[0].length === Nsys) {
    // Start from the current boundary layer, with the new inviscid edge
    // speed (mfoil's own warm start). Keeping the last viscous edge speed
    // instead was tried: no faster near the last solution, and further from
    // it Newton settled with the boundary layer satisfied and the edge speed
    // not — mfoil's convergence test reads the boundary layer's residual only.
    M.glob.U[3].set(ueinv);
    return;
  }
  M.glob.U = [new Float64Array(Nsys), new Float64Array(Nsys), new Float64Array(Nsys), new Float64Array(Nsys)];
  M.vsol.turb = new Uint8Array(Nsys);
  for (let si = 0; si < 3; si++) {
    const Is = M.vsol.Is[si];
    const N = Is.length;
    const xi = Is.map((i) => M.isol.xi[i]);
    const ue = Is.map((i) => ueinv[i]);
    const U = [new Float64Array(N), new Float64Array(N), new Float64Array(N), new Float64Array(N)];
    const Aux = new Float64Array(N);
    let uemax = 0;
    for (const v of ue) uemax = Math.max(uemax, Math.abs(v));
    for (let i = 0; i < N; i++) ue[i] = Math.max(ue[i], 1e-8 * uemax);
    const param = mfBuildParam(M, si);
    if (si === 2) Aux.set(M.vsol.wgap);
    let i0 = 0;
    if (si < 2) {
      let K; let hitstag;
      if (xi[0] < 1e-8 * xi[N - 1]) { K = ue[1] / xi[1]; hitstag = true; } else { K = ue[0] / xi[0]; hitstag = false; }
      const [th, ds] = mfThwaitesInit(K, param.mu0 / param.rho0);
      const xst = 1e-6;
      let Ust = [th, ds, 0, K * xst];
      for (let iNewton = 0; iNewton < 20; iNewton++) {
        param.turb = false; param.simi = true;
        const res = mfResidualStation(param, [xst, xst], Ust, Ust, [0, 0]);
        param.simi = false;
        if (Math.hypot(res.R[0], res.R[1], res.R[2]) < 1e-10) break;
        const A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => res.R_U[r][4 + c] + res.R_U[r][c]));
        const sol = mfSolveSmall(A, res.R.map((v) => -v));
        let dU = [sol[0], sol[1], sol[2], 0];
        const dm = Math.max(Math.abs(dU[0] / Ust[0]), Math.abs(dU[1] / Ust[1]));
        const omega = dm < 0.2 ? 1 : 0.2 / dm;
        dU = dU.map((v) => v * omega);
        Ust = Ust.map((v, k) => v + dU[k]);
      }
      if (hitstag) { mfSetCol(U, 0, Ust); U[3][0] = ue[0]; i0 = 1; }
      mfSetCol(U, i0, Ust); U[3][i0] = ue[i0];
    } else {
      mfSetCol(U, 0, mfWakeInit(M, ue[0]));
      param.turb = true;
      M.vsol.turb[Is[0]] = 1;
    }
    let tran = false;
    let i = i0 + 1;
    let ct = 0;
    let Hktgt = 0;
    while (i < N) {
      mfSetCol(U, i, mfCol(U, i - 1)); U[3][i] = ue[i];
      if (tran) { [ct] = mfGetCttr(mfCol(U, i), param); U[2][i] = ct; }
      M.vsol.turb[Is[i]] = (tran || param.turb) ? 1 : 0;
      let direct = true;
      const nNewton = 30; const iNswitch = 12;
      let iNewton;
      for (iNewton = 0; iNewton < nNewton; iNewton++) {
        let res = null;
        if (tran) {
          try {
            res = mfResidualTransition(M, param, [xi[i - 1], xi[i]], mfCol(U, i - 1), mfCol(U, i), [Aux[i - 1], Aux[i]]);
          } catch (e) {
            M.vsol.xt = 0.5 * (xi[i - 1] + xi[i]);
            mfSetCol(U, i, mfCol(U, i - 1)); U[3][i] = ue[i]; U[2][i] = ct;
            res = null;
          }
        } else {
          res = mfResidualStation(param, [xi[i - 1], xi[i]], mfCol(U, i - 1), mfCol(U, i), [Aux[i - 1], Aux[i]]);
        }
        if (!res || Math.hypot(res.R[0], res.R[1], res.R[2]) < 1e-10) break;
        let dU;
        if (direct) {
          const A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => res.R_U[r][4 + c]));
          const sol = mfSolveSmall(A, res.R.map((v) => -v));
          dU = [sol[0], sol[1], sol[2], 0];
        } else {
          const [Hk, Hk_U] = mfGetHk(mfCol(U, i), param);
          const A = [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => res.R_U[r][4 + c]));
          A.push(Hk_U.slice());
          dU = mfSolveSmall(A, [-res.R[0], -res.R[1], -res.R[2], Hktgt - Hk]);
        }
        let dm = Math.max(Math.abs(dU[0] / U[0][i - 1]), Math.abs(dU[1] / U[1][i - 1]));
        if (!direct) dm = Math.max(dm, Math.abs(dU[3] / U[3][i - 1]));
        if (param.turb) dm = Math.max(dm, Math.abs(dU[2] / U[2][i - 1]));
        else if (direct) dm = Math.max(dm, Math.abs(dU[2] / 10));
        const omega = dm > 0.3 ? 0.3 / dm : 1;
        dU = dU.map((v) => v * omega);
        const Ui = mfCol(U, i).map((v, k) => v + dU[k]);
        if (param.turb) Ui[2] = Math.max(Math.min(Ui[2], 0.3), 1e-7);
        const Hmax = param.turb ? Hmaxt : Hmaxl;
        const [HkTrial] = mfGetHk(Ui, param);
        if (direct && (HkTrial > Hmax || iNewton > iNswitch)) {
          direct = false;
          const [Hk] = mfGetHk(mfCol(U, i - 1), param);
          const Hkr = (xi[i] - xi[i - 1]) / U[0][i - 1];
          if (param.wake) {
            let H2 = Hk;
            for (let k = 0; k < 6; k++) H2 -= (H2 + 0.03 * Hkr * (H2 - 1) ** 3 - Hk) / (1 + 0.09 * Hkr * (H2 - 1) ** 2);
            Hktgt = Math.max(H2, 1.01);
          } else if (param.turb) Hktgt = Hk - 0.15 * Hkr;
          else Hktgt = Hk + 0.03 * Hkr;
          if (!param.wake) Hktgt = Math.max(Hktgt, Hmax);
          if (iNewton > iNswitch) { mfSetCol(U, i, mfCol(U, i - 1)); U[3][i] = ue[i]; }
        } else mfSetCol(U, i, Ui);
      }
      if (iNewton >= nNewton - 1) {
        mfSetCol(U, i, mfCol(U, i - 1)); U[3][i] = ue[i];
        U[0][i] = U[0][i - 1] * (xi[i] / xi[i - 1]) ** 0.5;
        U[1][i] = U[1][i - 1] * (xi[i] / xi[i - 1]) ** 0.5;
      }
      if (!param.turb && !tran && U[2][i] > param.ncrit) { tran = true; continue; }
      if (tran) { mfStoreTransition(M, si, i); param.turb = true; tran = false; }
      i++;
    }
    for (let k = 0; k < N; k++) mfSetCol(M.glob.U, Is[k], mfCol(U, k));
  }
}

// ---------------------------------------------------------------- coupling

function mfIdentifySurfaces(M) {
  const N = M.foil.N; const Nw = M.wake.N;
  const lower = []; for (let i = M.isol.Istag[0]; i >= 0; i--) lower.push(i);
  const upper = []; for (let i = M.isol.Istag[1]; i < N; i++) upper.push(i);
  const wake = []; for (let i = N; i < N + Nw; i++) wake.push(i);
  M.vsol.Is = [lower, upper, wake];
}

/** The dead-air height behind a blunt trailing edge, carried into the
 * wake by a cubic (Drela, AIAA 89-2166). */
function mfSetWakeGap(M) {
  const te = mfTEInfo(M.foil.x);
  const flen = 2.5;
  const dtdx = Math.min(Math.max(te.dtdx, -3 / flen), 3 / flen);
  const Lw = flen * te.hTE;
  const wgap = new Float64Array(M.wake.N);
  for (let i = 0; i < M.wake.N; i++) {
    const xib = (M.isol.xi[M.foil.N + i] - M.isol.xi[M.foil.N]) / Lw;
    if (xib <= 1) wgap[i] = te.hTE * (1 + (2 + flen * dtdx) * xib) * (1 - xib) ** 2;
  }
  M.vsol.wgap = wgap;
}

/** The edge speed's sensitivity to the boundary layer's mass defect: the
 * airfoil panels carry constant sources, the wake panels two-piece linear
 * ones (mfoil's calc_ue_m). */
function mfCalcUeM(M) {
  const N = M.foil.N; const Nw = M.wake.N;
  const X = M.foil.x; const XW = M.wake.x; const TW = M.wake.t;
  const Np = N + Nw - 2;
  // Cgam = d(wake uei)/d(gamma), Nw x N
  const Cgam = new Float64Array(Nw * N);
  for (let i = 0; i < Nw; i++) {
    const v = mfInviscidVelocity(X, M.isol.gam, 0, 0, XW[0][i], XW[1][i], true);
    for (let j = 0; j < N; j++) Cgam[i * N + j] = v.VGx[j] * TW[0][i] + v.VGz[j] * TW[1][i];
  }
  // B = d(airfoil streamfunction)/d(source), (N+1) x Np, stored by column
  const Bcols = [];
  for (let j = 0; j < Np; j++) Bcols.push(new Float64Array(N + 1));
  for (let i = 0; i < N; i++) {
    const xi = X[0][i]; const zi = X[1][i];
    for (let j = 0; j < N - 1; j++) Bcols[j][i] = mfConstSourceStream(X[0][j], X[1][j], X[0][j + 1], X[1][j + 1], xi, zi);
    for (let j = 0; j < Nw - 1; j++) {
      const x0 = XW[0][j]; const z0 = XW[1][j];
      let x2 = XW[0][j + 1]; let z2 = XW[1][j + 1];
      const xm = 0.5 * (x0 + x2); const zm = 0.5 * (z0 + z2);
      if (j === Nw - 2) { x2 = 2 * x2 - xm; z2 = 2 * z2 - zm; }
      let [a, b] = mfLinSourceStream(x0, z0, xm, zm, xi, zi);
      if (j > 0) { Bcols[N - 1 + j][i] += 0.5 * a + b; Bcols[N - 1 + j - 1][i] += 0.5 * a; } else Bcols[N - 1 + j][i] += b;
      [a, b] = mfLinSourceStream(xm, zm, x2, z2, xi, zi);
      Bcols[N - 1 + j][i] += a + 0.5 * b;
      if (j < Nw - 2) Bcols[N - 1 + j + 1][i] += 0.5 * b; else Bcols[N - 1 + j][i] += 0.5 * b;
    }
  }
  // Bp = -inv(AIC) B, N x Np (the last row of the solve is dropped)
  const { LU, piv, n } = M.isol.AICLU;
  const Bp = new Float64Array(N * Np);
  for (let j = 0; j < Np; j++) {
    const sol = mfLuSolve(LU, piv, n, Bcols[j]);
    for (let i = 0; i < N; i++) Bp[i * Np + j] = -sol[i];
  }
  // Csig = d(wake uei)/d(source), Nw x Np
  const Csig = new Float64Array(Nw * Np);
  for (let i = 0; i < Nw; i++) {
    const xi = XW[0][i]; const zi = XW[1][i]; const tx = TW[0][i]; const tz = TW[1][i];
    const jstart = i === 0 ? 1 : 0; const jend = N - 1 - (i === 0 ? 1 : 0);
    for (let j = jstart; j < jend; j++) {
      const [ax, az] = mfConstSourceVelocity(X[0][j], X[1][j], X[0][j + 1], X[1][j + 1], xi, zi);
      Csig[i * Np + j] = ax * tx + az * tz;
    }
    for (let j = 0; j < Nw; j++) {
      const I0 = Math.max(j - 1, 0); const I2 = Math.min(j + 1, Nw - 1);
      let p0x = 0.5 * (XW[0][I0] + XW[0][j]); let p0z = 0.5 * (XW[1][I0] + XW[1][j]);
      const p1x = XW[0][j]; const p1z = XW[1][j];
      let p2x = 0.5 * (XW[0][j] + XW[0][I2]); let p2z = 0.5 * (XW[1][j] + XW[1][I2]);
      if (j === Nw - 1) { p2x = 2 * p1x - p0x; p2z = 2 * p1z - p0z; }
      const d1 = mfHypot(p1x - p0x, p1z - p0z);
      const d2 = mfHypot(p2x - p1x, p2z - p1z);
      const row = i * Np;
      if (i === j) {
        if (j === 0) {
          const dl = mfHypot(X[0][1] - X[0][0], X[1][1] - X[1][0]);
          const du = mfHypot(X[0][N - 1] - X[0][N - 2], X[1][N - 1] - X[1][N - 2]);
          Csig[row + 0] += (0.5 / MF_PI) * (Math.log(dl / d2) + 1);
          Csig[row + N - 2] += (0.5 / MF_PI) * (Math.log(du / d2) + 1);
          Csig[row + N - 1] += -0.5 / MF_PI;
        } else if (j === Nw - 1) {
          Csig[row + N - 1 + j - 1] += 0;
        } else {
          const aa = (0.25 / MF_PI) * Math.log(d1 / d2);
          Csig[row + N - 1 + j - 1] += aa + 0.5 / MF_PI;
          Csig[row + N - 1 + j] += aa - 0.5 / MF_PI;
        }
      } else if (j === 0) {
        const [a, b] = mfLinSourceVelocity(p1x, p1z, p2x, p2z, xi, zi, tx, tz);
        Csig[row + N - 1] += b;
        Csig[row + 0] += a;
        Csig[row + N - 2] += a;
      } else if (j === Nw - 1) {
        const [ax, az] = mfConstSourceVelocity(p0x, p0z, p2x, p2z, xi, zi);
        Csig[row + N + Nw - 3] += ax * tx + az * tz;
      } else {
        const [a1, b1] = mfLinSourceVelocity(p0x, p0z, p1x, p1z, xi, zi, tx, tz);
        const [a2, b2] = mfLinSourceVelocity(p1x, p1z, p2x, p2z, xi, zi, tx, tz);
        Csig[row + N - 1 + j - 1] += a1 + 0.5 * b1;
        Csig[row + N - 1 + j] += 0.5 * a2 + b2;
      }
    }
  }
  // ue_sigma = [Bp; Cgam Bp + Csig], with the first wake row equal to the TE's
  const Nsys = N + Nw;
  const ueSigma = new Float64Array(Nsys * Np);
  ueSigma.set(Bp, 0);
  for (let i = 0; i < Nw; i++) {
    const out = (N + i) * Np;
    if (i === 0) { for (let p = 0; p < Np; p++) ueSigma[out + p] = Bp[(N - 1) * Np + p]; continue; }
    for (let p = 0; p < Np; p++) ueSigma[out + p] = Csig[i * Np + p];
    for (let j = 0; j < N; j++) {
      const c = Cgam[i * N + j];
      if (c === 0) continue;
      const rb = j * Np;
      for (let p = 0; p < Np; p++) ueSigma[out + p] += c * Bp[rb + p];
    }
  }
  M.vsol.ue_sigma = ueSigma;
  mfRebuildUeM(M);
}

/** ue_m = diag(sign) ue_sigma sigma_m, with sigma_m the sources' sensitivity
 * to the mass defect at the nodes (two entries a row). */
function mfRebuildUeM(M) {
  const N = M.foil.N; const Nw = M.wake.N; const Nsys = N + Nw; const Np = Nsys - 2;
  const S = M.foil.s; const SW = M.wake.s; const sg = M.isol.sgnue;
  // sigma_m by column: each node's column has at most two entries
  const colA = new Int32Array(Nsys).fill(-1); const valA = new Float64Array(Nsys);
  const colB = new Int32Array(Nsys).fill(-1); const valB = new Float64Array(Nsys);
  for (let i = 0; i < N - 1; i++) {
    const ds = S[i + 1] - S[i];
    // row i: column i gets sg[i]*-1/ds, column i+1 gets sg[i+1]*1/ds
    colB[i] = i; valB[i] = sg[i] * (-1) / ds;
    colA[i + 1] = i; valA[i + 1] = sg[i + 1] * 1 / ds;
  }
  for (let i = 0; i < Nw - 1; i++) {
    const ds = SW[i + 1] - SW[i];
    colB[N + i] = N - 1 + i; valB[N + i] = -1 / ds;
    colA[N + i + 1] = N - 1 + i; valA[N + i + 1] = 1 / ds;
  }
  const uem = new Float64Array(Nsys * Nsys);
  const us = M.vsol.ue_sigma;
  for (let k = 0; k < Nsys; k++) {
    const sgk = k < N ? sg[k] : 1;
    const rk = k * Np;
    for (let c = 0; c < Nsys; c++) {
      let v = 0;
      if (colA[c] >= 0) v += us[rk + colA[c]] * valA[c];
      if (colB[c] >= 0) v += us[rk + colB[c]] * valB[c];
      uem[k * Nsys + c] = sgk * v;
    }
  }
  M.vsol.ue_m = uem;
}

/** Moves the stagnation point with the coupled edge speed; on a new panel
 * the surfaces and the mass-defect matrix are rebuilt. */
function mfStagpointMove(M) {
  const N = M.foil.N;
  const I = M.isol.Istag;
  const ue = M.glob.U[3];
  let newpanel = true;
  if (ue[I[1]] < 0) {
    let j;
    for (j = I[1]; j < N; j++) if (ue[j] > 0) break;
    if (j >= N) j = N - 1;
    const I1 = j;
    for (j = I[1]; j < I1; j++) ue[j] *= -1;
    I[0] = I1 - 1; I[1] = I1;
  } else if (ue[I[0]] < 0) {
    let j;
    for (j = I[0]; j >= 0; j--) if (ue[j] > 0) break;
    if (j < 0) j = 0;
    if (!(j > 0)) throw new Error('mfoil: no stagnation point');
    const I0 = j;
    for (j = I0 + 1; j <= I[0]; j++) ue[j] *= -1;
    I[0] = I0; I[1] = I0 + 1;
  } else newpanel = false;
  const u0 = ue[I[0]]; const u1 = ue[I[1]];
  const S0 = M.foil.s[I[0]]; const S1 = M.foil.s[I[1]];
  if (!(u0 > 0 && u1 > 0)) throw new Error('mfoil: stagnation point velocity error');
  const den = u0 + u1; const w1 = u1 / den; const w2 = u0 / den;
  M.isol.sstag = w1 * S0 + w2 * S1;
  M.isol.xstag = [M.foil.x[0][I[0]] * w1 + M.foil.x[0][I[1]] * w2, M.foil.x[1][I[0]] * w1 + M.foil.x[1][I[1]] * w2];
  M.isol.sstag_ue = [u1 * (S1 - S0) / (den * den), -u0 * (S1 - S0) / (den * den)];
  mfSetXi(M);
  if (newpanel) {
    for (let i = 0; i <= I[0]; i++) M.isol.sgnue[i] = -1;
    for (let i = I[0] + 1; i < N; i++) M.isol.sgnue[i] = 1;
    mfIdentifySurfaces(M);
    M.glob.realloc = true;
    mfRebuildUeM(M);
  }
}

function mfAddBlock(blk, rowNode, colNode, rows, off) {
  let b = blk[rowNode].get(colNode);
  if (!b) { b = new Float64Array(12); blk[rowNode].set(colNode, b); }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) b[r * 4 + c] += rows[r][off + c];
}

/** The boundary-layer residuals of every interval and their Jacobian,
 * stored in 3 x 4 blocks by node; the stagnation point's dependence on the
 * edge speed is folded into the two stagnation nodes' ue columns. */
function mfBuildGlobSys(M) {
  const Nsys = M.glob.Nsys;
  const R = new Float64Array(3 * Nsys);
  const blk = []; for (let k = 0; k < Nsys; k++) blk.push(new Map());
  const Rst = new Float64Array(3 * Nsys);
  const xst = new Float64Array(Nsys);
  for (let i = 0; i < M.foil.N; i++) xst[i] = -M.isol.sgnue[i];
  for (let i = M.foil.N; i < Nsys; i++) xst[i] = -1;
  const addRx = (rowNode, Rx, J) => {
    for (let r = 0; r < 3; r++) for (let jj = 0; jj < J.length; jj++) Rst[3 * rowNode + r] += Rx[r][jj] * xst[J[jj]];
  };
  const i0s = [0, 0];
  const Ug = M.glob.U;
  for (let si = 0; si < 3; si++) {
    const Is = M.vsol.Is[si];
    const xi = Is.map((i) => M.isol.xi[i]);
    const N = Is.length;
    const Aux = new Float64Array(N);
    const param = mfBuildParam(M, si);
    if (si === 2) Aux.set(M.vsol.wgap);
    const i0 = (si < 2 && xi[0] < 1e-8 * xi[N - 1]) ? 1 : 0;
    if (si < 2) i0s[si] = i0;
    let R1; let R1_U; let J; let R1_x = null;
    if (si < 2) {
      const st = mfStagnationState(mfCol(Ug, Is[i0]), mfCol(Ug, Is[i0 + 1]), xi[i0], xi[i0 + 1]);
      param.turb = false; param.simi = true;
      const res = mfResidualStation(param, [st.xst, st.xst], st.Ust, st.Ust, [Aux[i0], Aux[i0]]);
      param.simi = false;
      // R1_Ust = R1_Ut[:,0:4] + R1_Ut[:,4:8]; R1_U = R1_Ust Ust_U; R1_x = R1_Ust Ust_x
      R1 = res.R;
      R1_U = []; R1_x = [];
      for (let r = 0; r < 3; r++) {
        const rst = [0, 1, 2, 3].map((k) => res.R_U[r][k] + res.R_U[r][k + 4]);
        const ru = new Array(8).fill(0); const rx = [0, 0];
        for (let k = 0; k < 4; k++) {
          for (let c = 0; c < 8; c++) ru[c] += rst[k] * st.Ust_U[k][c];
          rx[0] += rst[k] * st.Ust_x[k][0]; rx[1] += rst[k] * st.Ust_x[k][1];
        }
        R1_U.push(ru); R1_x.push(rx);
      }
      J = [Is[i0], Is[i0 + 1]];
      if (i0 === 1) {
        // the first node is on the stagnation point: set it to the stagnation state
        const k0 = Is[0];
        for (let r = 0; r < 3; r++) R[3 * k0 + r] = Ug[r][k0] - st.Ust[r];
        const eye = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
        mfAddBlock(blk, k0, k0, eye, 0);
        const neg = st.Ust_U.slice(0, 3).map((row) => row.map((v) => -v));
        mfAddBlock(blk, k0, J[0], neg, 0);
        mfAddBlock(blk, k0, J[1], neg, 4);
        addRx(k0, st.Ust_x.slice(0, 3).map((row) => row.map((v) => -v)), J);
      }
    } else {
      const w = mfWakeSys(M, param);
      R1 = w.R; R1_U = w.R_U; J = w.J;
      param.turb = true; param.wake = true;
    }
    const k1 = Is[i0];
    for (let r = 0; r < 3; r++) R[3 * k1 + r] = R1[r];
    for (let j = 0; j < J.length; j++) mfAddBlock(blk, k1, J[j], R1_U, 4 * j);
    if (R1_x) addRx(k1, R1_x, J);
    for (let i = i0 + 1; i < N; i++) {
      const tran = (M.vsol.turb[Is[i - 1]] ^ M.vsol.turb[Is[i]]) === 1;
      const Ip = [xi[i - 1], xi[i]];
      const A2 = [Aux[i - 1], Aux[i]];
      let res;
      if (tran) {
        res = mfResidualTransition(M, param, Ip, mfCol(Ug, Is[i - 1]), mfCol(Ug, Is[i]), A2);
        mfStoreTransition(M, si, i);
      } else res = mfResidualStation(param, Ip, mfCol(Ug, Is[i - 1]), mfCol(Ug, Is[i]), A2);
      const k = Is[i];
      for (let r = 0; r < 3; r++) R[3 * k + r] += res.R[r];
      mfAddBlock(blk, k, Is[i - 1], res.R_U, 0);
      mfAddBlock(blk, k, Is[i], res.R_U, 4);
      addRx(k, res.R_x, [Is[i - 1], Is[i]]);
      if (tran) param.turb = true;
    }
  }
  const Ist = M.isol.Istag; const stue = M.isol.sstag_ue;
  for (let k = 0; k < Nsys; k++) {
    for (let r = 0; r < 3; r++) {
      const v = Rst[3 * k + r];
      if (v === 0) continue;
      for (let q = 0; q < 2; q++) {
        let b = blk[k].get(Ist[q]);
        if (!b) { b = new Float64Array(12); blk[k].set(Ist[q], b); }
        b[r * 4 + 3] += v * stue[q];
      }
    }
  }
  M.glob.R = R; M.glob.blk = blk; M.glob.i0 = i0s;
}

/** Solves the Newton system for the state update. The boundary-layer
 * unknowns are eliminated first — their equations march, so they solve by
 * substitution — leaving a dense system in the edge speeds alone. The
 * result is checked against the whole system and refined, and a dense
 * solve of the whole system, mfoil's own approach, takes over if needed. */
function mfSolveGlob(M) {
  const Nsys = M.glob.Nsys;
  const U = M.glob.U;
  const ue = U[3]; const ds = U[1];
  let uemax = 0;
  for (let i = 0; i < Nsys; i++) uemax = Math.max(uemax, Math.abs(ue[i]));
  for (let i = 0; i < Nsys; i++) ue[i] = Math.max(ue[i], 1e-10 * uemax);
  const ueinv = mfGetUeinv(M);
  const uem = M.vsol.ue_m;
  const mass = new Float64Array(Nsys);
  for (let j = 0; j < Nsys; j++) mass[j] = ds[j] * ue[j];
  const Rue = new Float64Array(Nsys);
  for (let k = 0; k < Nsys; k++) {
    let s = 0; const rk = k * Nsys;
    for (let j = 0; j < Nsys; j++) s += uem[rk + j] * mass[j];
    Rue[k] = ue[k] - (ueinv[k] + s);
  }
  let dU = null;
  M.glob.solver = 'schur';
  if (!M.param.denseSolve) dU = mfSchurSolve(M, Rue);
  if (!dU) { dU = mfDenseSolve(M, Rue); M.glob.solver = 'dense'; M.glob.denseSolves = (M.glob.denseSolves || 0) + 1; }
  M.glob.dU = dU;
}

/** J dV + R for a proposed update, BL rows then ue rows. */
function mfLinearResidual(M, Rue, dU) {
  const Nsys = M.glob.Nsys; const blk = M.glob.blk; const R = M.glob.R;
  const ue = M.glob.U[3]; const ds = M.glob.U[1]; const uem = M.vsol.ue_m;
  const rbl = Float64Array.from(R);
  for (let k = 0; k < Nsys; k++) {
    for (const [j, b] of blk[k]) {
      for (let r = 0; r < 3; r++) {
        rbl[3 * k + r] += b[r * 4] * dU[0][j] + b[r * 4 + 1] * dU[1][j] + b[r * 4 + 2] * dU[2][j] + b[r * 4 + 3] * dU[3][j];
      }
    }
  }
  const rue = new Float64Array(Nsys);
  const t = new Float64Array(Nsys);
  for (let j = 0; j < Nsys; j++) t[j] = ds[j] * dU[3][j] + ue[j] * dU[1][j];
  for (let k = 0; k < Nsys; k++) {
    let s = 0; const rk = k * Nsys;
    for (let j = 0; j < Nsys; j++) s += uem[rk + j] * t[j];
    rue[k] = Rue[k] + dU[3][k] - s;
  }
  return { rbl, rue };
}

function mfSchurSolve(M, Rue) {
  const Nsys = M.glob.Nsys; const blk = M.glob.blk; const R = M.glob.R;
  const ue = M.glob.U[3]; const ds = M.glob.U[1]; const uem = M.vsol.ue_m;
  // elimination order: each surface from its stagnation pair, then the wake
  const steps = [];
  for (let si = 0; si < 2; si++) {
    const Is = M.vsol.Is[si]; const i0 = M.glob.i0[si];
    if (Is.length < i0 + 2) return null;
    steps.push([Is[i0], Is[i0 + 1]]);
    if (i0 === 1) steps.push([Is[0]]);
    for (let i = i0 + 2; i < Is.length; i++) steps.push([Is[i]]);
  }
  for (const k of M.vsol.Is[2]) steps.push([k]);
  if (steps.reduce((a, P) => a + P.length, 0) !== Nsys) return null;
  const order = new Int32Array(Nsys).fill(-1);
  steps.forEach((P, si) => { for (const k of P) order[k] = si; });
  // factor each step's diagonal block
  const fac = [];
  for (let s = 0; s < steps.length; s++) {
    const P = steps[s]; const n = 3 * P.length;
    const D = new Float64Array(n * n);
    let scale = 0;
    for (let a = 0; a < P.length; a++) {
      for (const [j, b] of blk[P[a]]) {
        const o = order[j];
        if (o > s) {
          // only an edge-speed column may reach ahead (the stagnation point's)
          for (let r = 0; r < 3; r++) for (let v = 0; v < 3; v++) if (b[r * 4 + v] !== 0) return null;
          continue;
        }
        if (o !== s) continue;
        const bi = P.indexOf(j);
        for (let r = 0; r < 3; r++) for (let v = 0; v < 3; v++) {
          D[(3 * a + r) * n + 3 * bi + v] = b[r * 4 + v];
          scale = Math.max(scale, Math.abs(b[r * 4 + v]));
        }
      }
    }
    const piv = mfLuFactor(D, n);
    for (let i = 0; i < n; i++) {
      const d = D[i * n + i];
      if (!Number.isFinite(d) || Math.abs(d) <= 1e-13 * scale) return null;
    }
    fac.push({ P, n, LU: D, piv });
  }
  // Y = inv(A) [B, -R]: block substitution with Nsys + 1 right-hand sides
  const mc = Nsys + 1;
  // work arrays, kept between iterations
  let wk = M.glob.work;
  if (!wk || wk.Nsys !== Nsys) {
    wk = { Nsys, Y: new Float64Array(3 * Nsys * mc), W: new Float64Array(Nsys * mc), T: new Float64Array(Nsys * mc), S: new Float64Array(Nsys * Nsys) };
    M.glob.work = wk;
  }
  const Y = wk.Y; Y.fill(0);
  for (let k = 0; k < Nsys; k++) for (const [j, b] of blk[k]) for (let r = 0; r < 3; r++) Y[(3 * k + r) * mc + j] += b[r * 4 + 3];
  for (let row = 0; row < 3 * Nsys; row++) Y[row * mc + Nsys] = -R[row];
  const homeAt = (P, i, m) => (3 * P[Math.floor(i / 3)] + (i % 3)) * m;
  const rowsAt = new Int32Array(6);
  const blockSolve = (Z, m) => {
    for (let s = 0; s < steps.length; s++) {
      const { P, n, LU, piv } = fac[s];
      for (let a = 0; a < P.length; a++) {
        for (const [j, b] of blk[P[a]]) {
          if (order[j] === s) continue;
          for (let r = 0; r < 3; r++) {
            const dst = (3 * P[a] + r) * m;
            for (let v = 0; v < 3; v++) {
              const c = b[r * 4 + v];
              if (c === 0) continue;
              const src = (3 * j + v) * m;
              for (let q = 0; q < m; q++) Z[dst + q] -= c * Z[src + q];
            }
          }
        }
      }
      // the step's rows, solved with its LU factors for all m columns at once
      for (let a = 0; a < P.length; a++) for (let r = 0; r < 3; r++) rowsAt[3 * a + r] = (3 * P[a] + r) * m;
      for (let k = 0; k < n; k++) {
        const p = piv[k];
        if (p !== k) { const t = rowsAt[k]; rowsAt[k] = rowsAt[p]; rowsAt[p] = t; }
      }
      // rowsAt now lists, in pivoted order, where each right-hand side row lives;
      // forward then back substitution, writing the solution in place
      for (let i = 0; i < n; i++) {
        const di = rowsAt[i];
        for (let j = 0; j < i; j++) {
          const l = LU[i * n + j];
          if (l === 0) continue;
          const dj = rowsAt[j];
          for (let q = 0; q < m; q++) Z[di + q] -= l * Z[dj + q];
        }
      }
      for (let i = n - 1; i >= 0; i--) {
        const di = rowsAt[i];
        for (let j = i + 1; j < n; j++) {
          const u = LU[i * n + j];
          if (u === 0) continue;
          const dj = rowsAt[j];
          for (let q = 0; q < m; q++) Z[di + q] -= u * Z[dj + q];
        }
        const d = LU[i * n + i];
        for (let q = 0; q < m; q++) Z[di + q] /= d;
      }
      // the solution for unknown i sits in row rowsAt[i]; move it home
      let moved = false;
      for (let i = 0; i < n; i++) if (rowsAt[i] !== homeAt(P, i, m)) moved = true;
      if (moved) {
        const buf = new Float64Array(n * m);
        for (let i = 0; i < n; i++) buf.set(Z.subarray(rowsAt[i], rowsAt[i] + m), i * m);
        for (let i = 0; i < n; i++) Z.set(buf.subarray(i * m, i * m + m), homeAt(P, i, m));
      }
    }
  };
  blockSolve(Y, mc);
  // S = I - ue_m diag(ds) + ue_m diag(ue) X_ds, with X_ds the ds rows of Y
  const W = wk.W;
  for (let j = 0; j < Nsys; j++) {
    const src = (3 * j + 1) * mc; const dst = j * mc; const u = ue[j];
    for (let q = 0; q < mc; q++) W[dst + q] = u * Y[src + q];
  }
  const T = wk.T; T.fill(0);
  for (let k = 0; k < Nsys; k++) {
    const rk = k * Nsys; const dst = k * mc;
    for (let j = 0; j < Nsys; j++) {
      const a = uem[rk + j];
      if (a === 0) continue;
      const src = j * mc;
      for (let q = 0; q < mc; q++) T[dst + q] += a * W[src + q];
    }
  }
  const S = wk.S;
  const rhs = new Float64Array(Nsys);
  for (let k = 0; k < Nsys; k++) {
    for (let c = 0; c < Nsys; c++) S[k * Nsys + c] = (k === c ? 1 : 0) - uem[k * Nsys + c] * ds[c] + T[k * mc + c];
    rhs[k] = -Rue[k] + T[k * mc + Nsys];
  }
  const pivS = mfLuFactor(S, Nsys);
  for (let i = 0; i < Nsys; i++) if (!Number.isFinite(S[i * Nsys + i]) || S[i * Nsys + i] === 0) return null;
  const finish = (yCol, du) => {
    const out = [new Float64Array(Nsys), new Float64Array(Nsys), new Float64Array(Nsys), Float64Array.from(du)];
    for (let k = 0; k < Nsys; k++) {
      for (let r = 0; r < 3; r++) {
        const row = 3 * k + r; const base = row * mc;
        let v = yCol(row);
        for (let c = 0; c < Nsys; c++) v -= Y[base + c] * du[c];
        out[r][k] = v;
      }
    }
    return out;
  };
  const du = mfLuSolve(S, pivS, Nsys, rhs);
  const dU = finish((row) => Y[row * mc + Nsys], du);
  // check the update against the whole system; refine with the same factors
  let Rmax = 0;
  for (const v of R) Rmax = Math.max(Rmax, Math.abs(v));
  for (const v of Rue) Rmax = Math.max(Rmax, Math.abs(v));
  const tol = Math.max(1e-9 * Rmax, 1e-13);
  for (let pass = 0; pass < 4; pass++) {
    const { rbl, rue } = mfLinearResidual(M, Rue, dU);
    let rmax = 0;
    for (const v of rbl) rmax = Math.max(rmax, Math.abs(v));
    for (const v of rue) rmax = Math.max(rmax, Math.abs(v));
    if (!Number.isFinite(rmax)) return null;
    if (rmax <= tol) { M.glob.refinements = (M.glob.refinements || 0) + pass; return dU; }
    if (pass === 3) return null;
    // correction e solves J e = -r
    const Z = new Float64Array(3 * Nsys);
    for (let row = 0; row < 3 * Nsys; row++) Z[row] = -rbl[row];
    blockSolve(Z, 1);
    const rs = new Float64Array(Nsys);
    for (let k = 0; k < Nsys; k++) {
      let s = 0; const rk = k * Nsys;
      for (let j = 0; j < Nsys; j++) s += uem[rk + j] * ue[j] * Z[3 * j + 1];
      rs[k] = -rue[k] + s;
    }
    const de = mfLuSolve(S, pivS, Nsys, rs);
    const e = finish((row) => Z[row], de);
    for (let v = 0; v < 4; v++) for (let k = 0; k < Nsys; k++) dU[v][k] += e[v][k];
  }
  return null;
}

/** mfoil's own approach: the whole system, 4 Nsys unknowns, solved at once. */
function mfDenseSolve(M, Rue) {
  const Nsys = M.glob.Nsys; const blk = M.glob.blk; const R = M.glob.R;
  const ue = M.glob.U[3]; const ds = M.glob.U[1]; const uem = M.vsol.ue_m;
  const n = 4 * Nsys;
  const A = new Float64Array(n * n);
  const b = new Float64Array(n);
  for (let k = 0; k < Nsys; k++) {
    for (const [j, blkv] of blk[k]) for (let r = 0; r < 3; r++) for (let v = 0; v < 4; v++) A[(3 * k + r) * n + 4 * j + v] += blkv[r * 4 + v];
    for (let r = 0; r < 3; r++) b[3 * k + r] = -R[3 * k + r];
  }
  for (let k = 0; k < Nsys; k++) {
    const row = (3 * Nsys + k) * n;
    for (let c = 0; c < Nsys; c++) {
      A[row + 4 * c + 3] = (k === c ? 1 : 0) - uem[k * Nsys + c] * ds[c];
      A[row + 4 * c + 1] = -uem[k * Nsys + c] * ue[c];
    }
    b[3 * Nsys + k] = -Rue[k];
  }
  const piv = mfLuFactor(A, n);
  const x = mfLuSolve(A, piv, n, b);
  const dU = [new Float64Array(Nsys), new Float64Array(Nsys), new Float64Array(Nsys), new Float64Array(Nsys)];
  for (let j = 0; j < Nsys; j++) for (let v = 0; v < 4; v++) dU[v][j] = x[4 * j + v];
  return dU;
}

/** Takes the Newton update, under-relaxed to keep thicknesses positive and
 * the amplification, shear stress and edge speed from jumping. */
function mfUpdateState(M) {
  const Nsys = M.glob.Nsys; const U = M.glob.U; const dU = M.glob.dU; const turb = M.vsol.turb;
  const It = [];
  for (let i = 0; i < Nsys; i++) if (turb[i]) It.push(i);
  let ctmax = -Infinity;
  for (const i of It) ctmax = Math.max(ctmax, U[2][i]);
  let omega = 1.0;
  for (let k = 0; k < 2; k++) {
    let fmin = Infinity;
    for (let i = 0; i < Nsys; i++) fmin = Math.min(fmin, dU[k][i] / U[k][i]);
    const om = fmin < -0.5 ? Math.abs(0.5 / fmin) : 1;
    if (om < omega) omega = om;
  }
  for (let i = 0; i < Nsys; i++) {
    const u = U[2][i]; const du = dU[2][i];
    if (!turb[i] && u < 0.2) continue;
    if (turb[i] && u < 0.1 * ctmax) continue;
    if (u === 0 || du === 0) continue;
    if (u + du < 0) {
      const om = 0.8 * Math.abs(u / du);
      if (om < omega) omega = om;
    }
  }
  let dumax = 0; let anyLam = false;
  for (let i = 0; i < Nsys; i++) if (!turb[i]) { anyLam = true; dumax = Math.max(dumax, Math.abs(dU[2][i])); }
  if (anyLam) { const om = dumax > 0 ? Math.abs(2 / dumax) : 1; if (om < omega) omega = om; }
  dumax = 0;
  for (const i of It) dumax = Math.max(dumax, Math.abs(dU[2][i]));
  if (It.length) { const om = dumax > 0 ? Math.abs(0.05 / dumax) : 1; if (om < omega) omega = om; }
  let fmax = 0;
  for (let i = 0; i < Nsys; i++) fmax = Math.max(fmax, Math.abs(dU[3][i]) / M.oper.Vinf);
  { const om = fmax > 0 ? 0.2 / fmax : 1; if (om < omega) omega = om; }
  for (let v = 0; v < 4; v++) for (let i = 0; i < Nsys; i++) U[v][i] += omega * dU[v][i];
  M.glob.omega = omega;
  for (let si = 0; si < 3; si++) {
    const Hkmin = si === 2 ? 1.00005 : 1.02;
    const param = mfBuildParam(M, si);
    for (const j of M.vsol.Is[si]) {
      mfStationParam(M, param, j);
      const [Hk] = mfGetHk(mfCol(U, j), param);
      if (Hk < Hkmin) U[1][j] += 2 * (Hkmin - Hk) * U[1][j];
    }
  }
  for (const i of It) if (U[2][i] < 0) U[2][i] = 0.1 * ctmax;
}

/** Marches the amplification equation along a surface, storing n at each
 * laminar station; returns the last laminar station. */
function mfMarchAmplification(M, si) {
  const Is = M.vsol.Is[si]; const N = Is.length;
  const param = mfBuildParam(M, si);
  const Ug = M.glob.U;
  const U = [0, 1, 2, 3].map((v) => Float64Array.from(Is, (k) => Ug[v][k]));
  const turb = Is.map((k) => M.vsol.turb[k]);
  U[2][0] = 0;
  param.turb = false; param.wake = false;
  let i = 1;
  while (i < N) {
    const U1 = mfCol(U, i - 1); const U2 = mfCol(U, i);
    if (turb[i]) U2[2] = U1[2] * 1.01;
    const dx = M.isol.xi[Is[i]] - M.isol.xi[Is[i - 1]];
    const nNewton = 20;
    for (let iNewton = 0; iNewton < nNewton; iNewton++) {
      const [damp1, damp1_U1] = mfGetDamp(U1, param);
      const [damp2, damp2_U2] = mfGetDamp(U2, param);
      const [damp, damp_U] = mfUpwind(0.5, null, damp1, damp1_U1, damp2, damp2_U2);
      const Ramp = U2[2] - U1[2] - damp * dx;
      if (Math.abs(Ramp) < 1e-12) break;
      const Ramp_U6 = 1 - damp_U[6] * dx;
      const du = -Ramp / Ramp_U6;
      let omega = 1; const dmax = 0.5 * (1.01 - iNewton / nNewton);
      if (Math.abs(du) > dmax) omega = dmax / Math.abs(du);
      U2[2] += omega * du;
    }
    if (U2[2] > param.ncrit) break;
    Ug[2][Is[i]] = U2[2];
    U[2][i] = U2[2];
    i++;
  }
  return i - 1;
}

/** Moves transition to where the amplification now reaches ncrit, filling
 * newly turbulent stations with a shear stress ramp. */
function mfUpdateTransition(M) {
  for (let si = 0; si < 2; si++) {
    const Is = M.vsol.Is[si]; const N = Is.length;
    const param = mfBuildParam(M, si);
    let ilam0; let found = false;
    for (ilam0 = 0; ilam0 < N; ilam0++) if (M.vsol.turb[Is[ilam0]]) { ilam0 -= 1; found = true; break; }
    if (!found) ilam0 = N - 1;
    const sa = Float64Array.from(Is, (k) => M.glob.U[2][k]);
    const ilam = mfMarchAmplification(M, si);
    if (ilam === ilam0) { Is.forEach((k, q) => { M.glob.U[2][k] = sa[q]; }); continue; }
    if (ilam < ilam0) {
      param.turb = true;
      const [sa0] = mfGetCttr(mfCol(M.glob.U, Is[ilam + 1]), param);
      const sa1 = ilam0 < N - 1 ? M.glob.U[2][Is[ilam0 + 1]] : sa0;
      const xi = Is.map((k) => M.isol.xi[k]);
      const dx = xi[Math.min(ilam0 + 1, N - 1)] - xi[ilam + 1];
      for (let i = ilam + 1; i <= ilam0; i++) {
        let f = (dx === 0 || i === ilam + 1) ? 0 : (xi[i] - xi[ilam + 1]) / dx;
        if (ilam + 1 === ilam0) f = 1;
        M.glob.U[2][Is[i]] = sa0 + f * (sa1 - sa0);
        if (!(M.glob.U[2][Is[i]] > 0)) throw new Error('mfoil: negative shear stress in the transition update');
        M.vsol.turb[Is[i]] = 1;
      }
    } else {
      for (let i = Math.max(ilam0, 0); i <= ilam; i++) M.vsol.turb[Is[i]] = 0;
    }
  }
}

function mfSolveCoupled(M) {
  const nNewton = M.param.niglob;
  M.glob.conv = false;
  M.glob.realloc = true;
  M.glob.Rnorm = [];
  for (let iNewton = 0; iNewton < nNewton; iNewton++) {
    mfBuildGlobSys(M);
    let s = 0;
    for (const v of M.glob.R) s += v * v;
    const Rnorm = Math.sqrt(s);
    M.glob.Rnorm.push(Rnorm);
    M.glob.iters = iNewton;
    if (!Number.isFinite(Rnorm)) break;
    if (Rnorm < M.param.rtol) { M.glob.conv = true; break; }
    mfSolveGlob(M);
    mfUpdateState(M);
    M.glob.realloc = false;
    mfStagpointMove(M);
    mfUpdateTransition(M);
  }
}

// ---------------------------------------------------------------- results

/** Lift and moment by pressure integration; drag by Squire and Young from
 * the end of the wake, and skin friction along the surfaces. */
function mfCalcForce(M) {
  const chord = M.geom.chord; const xref = M.geom.xref;
  const Vinf = M.param.Vinf; const rho = M.oper.rho; const alpha = M.oper.alpha;
  const qinf = 0.5 * rho * Vinf ** 2;
  const N = M.foil.N;
  const ueAll = M.oper.viscous ? M.glob.U[3] : mfGetUeinv(M);
  const cp = new Float64Array(ueAll.length);
  for (let i = 0; i < ueAll.length; i++) cp[i] = mfGetCp(ueAll[i], M.param)[0];
  const uei = mfGetUeinv(M);
  const cpi = new Float64Array(uei.length);
  for (let i = 0; i < uei.length; i++) cpi[i] = mfGetCp(uei[i], M.param)[0];
  M.post.cp = cp; M.post.cpi = cpi;
  let cl = 0; let cm = 0; let cdpi = 0;
  const ca = mfCosd(alpha); const sa = mfSind(alpha);
  const X = M.foil.x;
  for (let i0 = 1; i0 <= N; i0++) {
    const i = i0 === N ? 0 : i0; const ip = i0 === N ? N - 1 : i0 - 1;
    const dxv0 = X[0][i] - X[0][ip]; const dxv1 = X[1][i] - X[1][ip];
    const dx10 = X[0][ip] - xref[0]; const dx11 = X[1][ip] - xref[1];
    const dx20 = X[0][i] - xref[0]; const dx21 = X[1][i] - xref[1];
    const dx1nds = dxv0 * dx10 + dxv1 * dx11;
    const dx2nds = dxv0 * dx20 + dxv1 * dx21;
    const dx = -dxv0 * ca - dxv1 * sa;
    const dz = dxv1 * ca - dxv0 * sa;
    const cp1 = cp[ip]; const cp2 = cp[i]; const cpbar = 0.5 * (cp1 + cp2);
    cl += dx * cpbar;
    cm += cp1 * dx1nds / 3 + cp1 * dx2nds / 6 + cp2 * dx1nds / 6 + cp2 * dx2nds / 3;
    cdpi += dz * cpbar;
  }
  M.post.cl = cl / chord; M.post.cm = cm / chord ** 2; M.post.cdpi = cdpi / chord;
  let cd = 0; let cdf = 0;
  if (M.oper.viscous) {
    const Is2 = M.vsol.Is[2];
    const U = mfCol(M.glob.U, Is2[Is2.length - 1]);
    const [H] = mfGetH(U);
    const [uk] = mfGetUk(U[3], M.param);
    cd = 2.0 * U[0] * (uk / Vinf) ** ((5 + H) / 2);
    let Df = 0;
    for (let si = 0; si < 2; si++) {
      const Is = M.vsol.Is[si];
      const param = mfBuildParam(M, si);
      mfStationParam(M, param, Is[0]);
      let cf1 = 0; let ue1 = 0; let rho1 = rho;
      let x1 = M.isol.xstag[0]; let z1 = M.isol.xstag[1];
      for (let q = 0; q < Is.length; q++) {
        const k = Is[q];
        mfStationParam(M, param, k);
        const Uk = mfCol(M.glob.U, k);
        const [cf2] = mfGetCf(Uk, param);
        const [ue2] = mfGetUk(Uk[3], param);
        const [rho2] = mfGetRho(Uk, param);
        const x2 = X[0][k]; const z2 = X[1][k];
        const dx = (x2 - x1) * ca + (z2 - z1) * sa;
        Df += 0.25 * (rho1 * cf1 * ue1 ** 2 + rho2 * cf2 * ue2 ** 2) * dx;
        cf1 = cf2; ue1 = ue2; x1 = x2; z1 = z2; rho1 = rho2;
      }
    }
    cdf = Df / (qinf * chord);
  }
  M.post.cd = cd; M.post.cdf = cdf; M.post.cdp = cd - cdf;
}

function mfGetDistributions(M) {
  const U = M.glob.U; const Nsys = M.glob.Nsys;
  const cf = new Float64Array(Nsys); const Ret = new Float64Array(Nsys); const Hk = new Float64Array(Nsys);
  for (let si = 0; si < 3; si++) {
    const param = mfBuildParam(M, si);
    for (const j of M.vsol.Is[si]) {
      const Uj = mfCol(U, j);
      mfStationParam(M, param, j);
      const [uk] = mfGetUk(Uj[3], param);
      cf[j] = mfGetCf(Uj, param)[0] * uk * uk / (param.Vinf * param.Vinf);
      Ret[j] = mfGetRet(Uj, param)[0];
      Hk[j] = mfGetHk(Uj, param)[0];
    }
  }
  M.post.th = Float64Array.from(U[0]); M.post.ds = Float64Array.from(U[1]); M.post.sa = Float64Array.from(U[2]);
  M.post.ue = Float64Array.from(U[3], (u) => mfGetUk(u, M.param)[0]);
  M.post.uei = mfGetUeinv(M);
  M.post.cf = cf; M.post.Ret = Ret; M.post.Hk = Hk;
}

function mfSolveViscousSystem(M) {
  mfSolveInviscidSystem(M);
  M.oper.viscous = true;
  mfInitThermo(M);
  mfBuildWake(M);
  mfStagpointFind(M);
  mfIdentifySurfaces(M);
  mfSetWakeGap(M);
  mfCalcUeM(M);
  mfInitBoundaryLayer(M);
  mfStagpointMove(M);
  mfSolveCoupled(M);
  M.glob.ueResidual = mfUeResidual(M);
  mfCalcForce(M);
  mfGetDistributions(M);
}

/** The largest residual of the edge-speed equations, ue - (ue_inviscid +
 * ue_m (ds ue)), at the solution. mfoil judges convergence on the boundary
 * layer's residual alone; this says whether the coupling is met too. */
function mfUeResidual(M) {
  const Nsys = M.glob.Nsys; const U = M.glob.U; const uem = M.vsol.ue_m;
  const ueinv = mfGetUeinv(M);
  let worst = 0;
  for (let k = 0; k < Nsys; k++) {
    let s = 0; const rk = k * Nsys;
    for (let j = 0; j < Nsys; j++) s += uem[rk + j] * U[1][j] * U[3][j];
    worst = Math.max(worst, Math.abs(U[3][k] - (ueinv[k] + s)));
  }
  return worst;
}

/** A copy of a solved section's boundary layer, to start another solve
 * from (`mfoilSolve`'s `warm`): mfoil's own way along a polar. */
export function mfoilState(M) {
  if (!M.glob || !M.glob.U || !M.vsol || !M.vsol.turb) return null;
  return {
    U: M.glob.U.map((a) => Float64Array.from(a)),
    turb: Uint8Array.from(M.vsol.turb),
    Xt: M.vsol.Xt.map((r) => r.slice()),
  };
}

/** The distributions along a solved section, airfoil nodes first, lower
 * surface from the trailing edge, then the wake: x, z, the pressure
 * coefficient (viscous and inviscid), the edge speed, the momentum and
 * displacement thicknesses, the shape factor, the skin friction, the
 * amplification or shear-stress variable and whether each node is
 * turbulent. */
export function mfoilDistributions(M) {
  const N = M.foil.N; const Nw = M.wake.N;
  const viscous = M.oper.viscous && M.glob.U;
  const x = []; const z = [];
  for (let i = 0; i < N; i++) { x.push(M.foil.x[0][i]); z.push(M.foil.x[1][i]); }
  if (viscous) for (let i = 0; i < Nw; i++) { x.push(M.wake.x[0][i]); z.push(M.wake.x[1][i]); }
  const pick = (a) => (a ? Array.from(a).slice(0, x.length) : null);
  return {
    N, Nw: viscous ? Nw : 0, x, z,
    cp: pick(M.post.cp), cpi: pick(M.post.cpi),
    ue: viscous ? pick(M.post.ue) : null,
    theta: viscous ? pick(M.post.th) : null, dstar: viscous ? pick(M.post.ds) : null,
    Hk: viscous ? pick(M.post.Hk) : null, cf: viscous ? pick(M.post.cf) : null,
    sa: viscous ? pick(M.post.sa) : null,
    turb: viscous ? Array.from(M.vsol.turb).slice(0, x.length) : null,
    stagnation: M.isol.xstag ? M.isol.xstag.slice() : null,
    xtr: viscous ? [M.vsol.Xt[0][1], M.vsol.Xt[1][1]] : null,
  };
}

/**
 * Solves a section at one angle of attack (degrees). With a Reynolds
 * number the solution is viscous: the panel method coupled to the boundary
 * layer and wake; without one it is the inviscid panel solution. Ma > 0
 * applies the Karman-Tsien correction. Returns the coefficients, the
 * transition points (x/c, lower and upper) and whether Newton converged.
 */
export function mfoilSolve(M, { alpha = 0, Re = null, Ma = 0, ncrit = 9, onset = 'cubic', niglob = 50, rtol = 1e-10, denseSolve = false, warm = false } = {}) {
  if (!Number.isFinite(alpha)) throw new Error('mfoil: alpha must be a number of degrees');
  if (Re != null && !(Re > 0)) throw new Error('mfoil: the Reynolds number must be positive');
  if (!(Ma >= 0 && Ma < 1)) throw new Error('mfoil: the Mach number must be from 0 to below 1');
  // A warm start keeps the last viscous solution's boundary layer and its
  // transition flags, as mfoil does with oper.initbl false; everything the
  // angle of attack changes is rebuilt.
  let prior = null;
  if (warm && typeof warm === 'object' && warm.U) {
    prior = { U: warm.U.map((a) => Float64Array.from(a)), turb: Uint8Array.from(warm.turb), Xt: warm.Xt.map((r) => r.slice()) };
  } else if (warm && M.glob && M.glob.U && M.vsol && M.vsol.turb) {
    prior = { U: M.glob.U, turb: M.vsol.turb, Xt: M.vsol.Xt };
  }
  mfClearSolution(M);
  if (prior) { M.glob.U = prior.U; M.vsol.turb = prior.turb; M.vsol.Xt = prior.Xt; }
  M.oper.initbl = !prior;
  M.oper.alpha = alpha;
  M.oper.Ma = Ma;
  M.oper.viscous = Re != null;
  if (Re != null) M.oper.Re = Re;
  Object.assign(M.param, { ncrit, onset, niglob, rtol, denseSolve });
  if (M.oper.viscous) mfSolveViscousSystem(M); else mfSolveInviscidSystem(M);
  const p = M.post;
  return {
    alpha, Re, Ma, viscous: M.oper.viscous,
    cl: p.cl, cd: M.oper.viscous ? p.cd : 0, cdf: p.cdf, cdp: p.cdp, cm: p.cm, cdpi: p.cdpi,
    // mfoil's test, the boundary layer's residual, and the edge speed's too
    converged: !!M.glob.conv && (!M.oper.viscous || M.glob.ueResidual < 1e-6),
    iterations: M.oper.viscous ? M.glob.Rnorm.length : 0,
    ueResidual: M.oper.viscous ? M.glob.ueResidual : 0,
    xtrLower: M.oper.viscous ? M.vsol.Xt[0][1] : null,
    xtrUpper: M.oper.viscous ? M.vsol.Xt[1][1] : null,
  };
}
