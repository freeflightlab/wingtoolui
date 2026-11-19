/* slices.js — the wing as its sections, analysed one slice at a time.
 *
 * Step along the span from tip to tip and every slice is a two-dimensional
 * section in its own flow: its chord, its Reynolds number, the angle its
 * section actually meets the air at once the rest of the wing's downwash is
 * taken off. Each is solved with the viscous panel method (mfoil.js, the
 * method Scirocco implements) and the slices are put back together into the
 * wing on the vortex lattice (vlm.js).
 *
 * ---------------------------------------------------------------------------
 * How the slices are coupled: the alpha method
 * ---------------------------------------------------------------------------
 * The lattice knows the three-dimensional flow — the arc, the twist, the
 * downwash every strip puts on every other — and models each strip as a
 * flat plate, whose lift rises at 2 pi a radian from no lift at no angle. The
 * section knows the viscous two-dimensional flow: its camber, its boundary
 * layer, its drag and its moment, at an angle of attack. Neither alone is the
 * wing in the air.
 *
 * The alpha method (van Dam; Gallay and Laurendeau, 2015) joins them. Each
 * strip's boundary condition is turned by a correction angle, d. The strip's
 * lattice lift cl then puts its plate at cl / 2 pi to the local flow, so the
 * section, whose chord is the plate's turned back by d, meets that flow at
 *
 *     alpha_eff = cl / (2 pi) - d
 *
 * which is the geometric angle less the induced one. The section's own lift
 * at that angle, cl_2D(alpha_eff), is read; where the two differ, d is moved
 * by their difference over 2 pi, and the lattice is solved again. At the end
 * each strip's lattice lift is its section's viscous lift at the angle the
 * whole wing leaves it, the induced drag is the Trefftz plane's of that
 * circulation, and the profile drag and moment are the sections'.
 *
 * ---------------------------------------------------------------------------
 * Why a grid of polars, and then the slices
 * ---------------------------------------------------------------------------
 * The coupling asks for a section's lift many times at many angles. A
 * paraglider uses one section across its span, so the polars differ only by
 * Reynolds number: a few Reynolds numbers spanning the wing's, each swept in
 * angle with every solve started from its neighbour's boundary layer, give
 * the coupling every value it needs by interpolation. Then each slice is
 * solved on its own at the angle and Reynolds number the coupling found, and
 * those solutions — not the interpolation — are what the slices show and
 * what their drag and moment are integrated from. The two are compared, and
 * the difference is reported: it is the grid's error.
 *
 * mfoil does not converge everywhere. Near a section's stall it can lose its
 * transition point and wander; a solve that does not converge is kept out
 * of the grid and flagged on the slice, never passed off as a result.
 */

import { wingStrips, latticeSystem, trefftzDrag } from './vlm.js';
import { centralFrame } from './wing3d.js';
import { mfoilModel, mfoilSolve, mfoilState, mfoilDistributions } from './mfoil.js';

/** What the slice analysis uses unless told otherwise. */
export const SLICE_SETTINGS = Object.freeze({
  npanel: 120,          // panels round the section (mfoil's default is 199)
  ncrit: 9,             // e^N transition, a clean free stream (XFOIL's default)
  minTEGap: 1e-4,       // a sewn trailing edge opened this far, of the chord
  alphaStepDeg: 1,      // the polar grid's step in angle
  alphaMarginDeg: 1.5,  // and how far it reaches past the angles the wing uses
  reynoldsStep: 2,      // ratio between the grid's Reynolds numbers
  reynoldsMargin: 0.15, // how far beyond the wing's range the grid reaches
  couplingTol: 1e-5,    // lift coefficient
  couplingIterations: 400,
  relax: 0.6,
  speedIterations: 6,
  bracketDeg: 0.02,     // a slice that cycles at its angle is solved this far either side
  correctionRounds: 2,  // slices fed back into the coupling, at most
  sliceTol: 3e-3,       // until the lattice's lift and the slices' agree this well
});

const SL_RAD = Math.PI / 180;
const slSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const slAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const slScale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const slDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const slCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const slNorm = (a) => Math.hypot(a[0], a[1], a[2]);
const slUnit = (a) => { const n = slNorm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const slLerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

/**
 * The wing's slices, from tip to tip: one for each lattice strip (each cell,
 * between two ribs, both halves and the centre cell), ordered from the left
 * tip to the right. Each carries its strip, its chord (the mean of its two
 * ribs'), its span along the quarter-chord line, its station, its normal and
 * its angle in the arc, and its incidence: the angle its chord makes with
 * the central chord's direction, seen in its own plane.
 */
export function sliceStations(wing) {
  const strips = wingStrips(wing);
  const out = strips.map((s, k) => {
    const a = slLerp(s.leftLE, s.leftTE, 0.25);
    const b = slLerp(s.rightLE, s.rightTE, 0.25);
    const mid = slScale(slAdd(a, b), 0.5);
    const chord = (slNorm(slSub(s.leftTE, s.leftLE)) + slNorm(slSub(s.rightTE, s.rightLE))) / 2;
    let n = slCross(slSub(s.rightTE, s.leftLE), slSub(s.rightLE, s.leftTE));
    n = slUnit(n);
    if (n[2] < 0) n = slScale(n, -1);
    const span = slUnit(slSub(b, a));
    return {
      strip: s,
      stripIndex: k,
      y: mid[1],
      quarterChord: mid,
      chord,
      lengthM: slNorm(slSub(b, a)),
      normal: n,
      spanDir: span,
      arcDeg: Math.atan2(-n[1], n[2]) / SL_RAD,
      incidenceDeg: Math.asin(Math.max(-1, Math.min(1, n[0]))) / SL_RAD,
      le: slScale(slAdd(s.leftLE, s.rightLE), 0.5),
      te: slScale(slAdd(s.leftTE, s.rightTE), 0.5),
    };
  });
  out.sort((p, q) => p.y - q.y);
  out.forEach((sl, i) => {
    sl.index = i;
    sl.side = Math.abs(sl.y) < 1e-9 ? 'centre' : (sl.y < 0 ? 'left' : 'right');
  });
  // Mirror partners: the slice at -y for each at +y.
  for (const sl of out) {
    let best = null;
    for (const o of out) {
      if (Math.abs(o.y + sl.y) < 1e-6 + 1e-6 * Math.abs(sl.y) && (best === null || Math.abs(o.chord - sl.chord) < Math.abs(best.chord - sl.chord))) best = o;
    }
    sl.mirror = best ? best.index : sl.index;
  }
  return out;
}

/** The section the slices are solved on: the wing's own aerofoil, paneled
 * once (all slices share it; only their angle and Reynolds number differ). */
export function sliceSectionModel(airfoil, { npanel = SLICE_SETTINGS.npanel, minTEGap = SLICE_SETTINGS.minTEGap } = {}) {
  const pts = airfoil?.points;
  if (!pts || pts.length < 10) throw new Error('slices: the aerofoil has too few points to analyse');
  return mfoilModel({ x: pts.map((p) => p[0]), z: pts.map((p) => p[1]), npanel, minTEGap });
}

/** Reynolds numbers spaced by `step` to cover [lo, hi], ends included. */
export function reynoldsLevels(lo, hi, step = SLICE_SETTINGS.reynoldsStep) {
  if (!(lo > 0 && hi >= lo)) throw new Error('slices: a Reynolds range needs 0 < lo <= hi');
  const n = Math.max(1, Math.ceil(Math.log(hi / lo) / Math.log(step) - 1e-9));
  const out = [];
  for (let k = 0; k <= n; k++) out.push(lo * (hi / lo) ** (n === 0 ? 0 : k / n));
  if (n === 0) out.push(hi * step);
  return out;
}

/**
 * The section's polars at several Reynolds numbers, as a generator: each
 * `next()` runs one solve and yields the progress, so a page can run it a
 * piece at a time and a test all at once (`runSteps`). Each Reynolds number
 * is swept up from the angle nearest `startDeg`, then down, every solve
 * starting from its neighbour's boundary layer; a solve that fails is tried
 * again from half way, and if that fails too the point is left out.
 */
export function* polarGridSteps(model, { reynolds, alphas, ncrit = SLICE_SETTINGS.ncrit, startDeg = 3 }) {
  const grid = { reynolds: reynolds.slice(), alphas: alphas.slice(), ncrit, rows: [] };
  const total = reynolds.length * alphas.length;
  let done = 0;
  for (const Re of reynolds) {
    const row = alphas.map((a) => ({ alphaDeg: a, converged: false }));
    grid.rows.push(row);
    let k0 = 0;
    for (let k = 1; k < alphas.length; k++) if (Math.abs(alphas[k] - startDeg) < Math.abs(alphas[k0] - startDeg)) k0 = k;
    const solveAt = (alphaDeg, warm) => {
      try {
        const r = mfoilSolve(model, { alpha: alphaDeg, Re, ncrit, warm: warm || false });
        return { r, state: r.converged ? mfoilState(model) : null };
      } catch (e) {
        return { r: null, state: null, error: e.message };
      }
    };
    const record = (k, res) => {
      const p = row[k];
      if (res.r && res.r.converged) {
        Object.assign(p, {
          converged: true, cl: res.r.cl, cd: res.r.cd, cdf: res.r.cdf, cm: res.r.cm,
          xtrLower: res.r.xtrLower, xtrUpper: res.r.xtrUpper, iterations: res.r.iterations, state: res.state,
        });
      } else {
        p.converged = false;
        p.error = res.error || 'did not converge';
      }
    };
    // The start: cold, at the angle nearest startDeg, or the next out from it.
    let start = -1;
    const order = alphas.map((a, k) => k).sort((p, q) => Math.abs(p - k0) - Math.abs(q - k0));
    for (const k of order) {
      const res = solveAt(alphas[k], false);
      record(k, res);
      done++;
      yield { done, total, Re, alphaDeg: alphas[k] };
      if (row[k].converged) { start = k; break; }
    }
    if (start < 0) continue;
    for (const dir of [1, -1]) {
      let last = row[start].state;
      let lastAlpha = alphas[start];
      for (let k = start + dir; k >= 0 && k < alphas.length; k += dir) {
        if (row[k].converged) { last = row[k].state; lastAlpha = alphas[k]; continue; }
        let res = last ? solveAt(alphas[k], last) : solveAt(alphas[k], false);
        if (!(res.r && res.r.converged) && last) {
          // half way first, from the last that converged, then on
          const half = solveAt(0.5 * (lastAlpha + alphas[k]), last);
          if (half.r && half.r.converged) res = solveAt(alphas[k], half.state);
        }
        record(k, res);
        done++;
        yield { done, total, Re, alphaDeg: alphas[k] };
        if (row[k].converged) { last = row[k].state; lastAlpha = alphas[k]; }
      }
    }
    // points never reached (the start failed for them) count as done
  }
  grid.converged = grid.rows.reduce((a, r) => a + r.filter((p) => p.converged).length, 0);
  grid.total = total;
  return grid;
}

/** Run a step generator to the end and return what it returns. */
export function runSteps(gen) {
  let s = gen.next();
  while (!s.done) s = gen.next();
  return s.value;
}

/** Run a step generator a few steps at a time, yielding to the page between,
 * reporting each step to `onProgress`. Resolves to what the generator returns. */
export async function runStepsAsync(gen, { onProgress = null, sliceMs = 40, isCancelled = null } = {}) {
  let s = gen.next();
  let t0 = Date.now();
  while (!s.done) {
    if (onProgress) onProgress(s.value);
    if (isCancelled && isCancelled()) throw new Error('slices: cancelled');
    if (Date.now() - t0 > sliceMs) {
      await new Promise((res) => setTimeout(res, 0));
      t0 = Date.now();
    }
    s = gen.next();
  }
  return s.value;
}

/** One Reynolds number's converged points, as arrays in angle. */
function slRowPoints(row) {
  return row.filter((p) => p.converged);
}

function slInterpRow(pts, alphaDeg, key) {
  const n = pts.length;
  if (n === 0) return { v: NaN, outside: true };
  if (n === 1) return { v: pts[0][key], outside: true };
  if (alphaDeg <= pts[0].alphaDeg) {
    const s = (pts[1][key] - pts[0][key]) / (pts[1].alphaDeg - pts[0].alphaDeg);
    return { v: pts[0][key] + s * (alphaDeg - pts[0].alphaDeg), outside: alphaDeg < pts[0].alphaDeg - 1e-9 };
  }
  if (alphaDeg >= pts[n - 1].alphaDeg) {
    const s = (pts[n - 1][key] - pts[n - 2][key]) / (pts[n - 1].alphaDeg - pts[n - 2].alphaDeg);
    return { v: pts[n - 1][key] + s * (alphaDeg - pts[n - 1].alphaDeg), outside: alphaDeg > pts[n - 1].alphaDeg + 1e-9 };
  }
  let i = 0;
  while (i < n - 2 && pts[i + 1].alphaDeg < alphaDeg) i++;
  const a = pts[i]; const b = pts[i + 1];
  const f = (alphaDeg - a.alphaDeg) / (b.alphaDeg - a.alphaDeg);
  // A gap in the grid (a point that did not converge) is crossed in a line
  // but said: wider than two steps is not the grid's own resolution.
  return { v: a[key] + f * (b[key] - a[key]), outside: false, gap: b.alphaDeg - a.alphaDeg };
}

/**
 * The grid's lift, drag and moment at a Reynolds number and angle: along
 * straight lines in the angle between converged points at each Reynolds
 * number, and in the logarithm of the Reynolds number between them.
 * `outside` says it was extrapolated in either.
 */
export function polarGridAt(grid, Re, alphaDeg) {
  const R = grid.reynolds;
  let i = 0;
  while (i < R.length - 2 && R[i + 1] < Re) i++;
  const j = Math.min(i + 1, R.length - 1);
  const f = i === j ? 0 : (Math.log(Re) - Math.log(R[i])) / (Math.log(R[j]) - Math.log(R[i]));
  const pi = slRowPoints(grid.rows[i]); const pj = slRowPoints(grid.rows[j]);
  const out = { outside: Re < R[0] * (1 - 1e-9) || Re > R[R.length - 1] * (1 + 1e-9) };
  let gap = 0;
  for (const key of ['cl', 'cd', 'cdf', 'cm']) {
    const a = slInterpRow(pi, alphaDeg, key);
    const b = slInterpRow(pj, alphaDeg, key);
    out[key] = a.v + f * (b.v - a.v);
    if (a.outside || b.outside) out.outside = true;
    gap = Math.max(gap, a.gap || 0, b.gap || 0);
  }
  out.gapDeg = gap;
  return out;
}

/** The section's zero-lift angle on a grid row, by interpolation. */
function slZeroLift(grid) {
  const r = Math.floor((grid.rows.length - 1) / 2);
  const pts = slRowPoints(grid.rows[r]);
  for (let k = 1; k < pts.length; k++) {
    if (pts[k - 1].cl <= 0 && pts[k].cl > 0) {
      return pts[k - 1].alphaDeg + (-pts[k - 1].cl) / (pts[k].cl - pts[k - 1].cl) * (pts[k].alphaDeg - pts[k - 1].alphaDeg);
    }
  }
  if (pts.length >= 2) {
    const s = (pts[1].cl - pts[0].cl) / (pts[1].alphaDeg - pts[0].alphaDeg);
    return s > 0 ? pts[0].alphaDeg - pts[0].cl / s : 0;
  }
  return 0;
}

function slLuFactor(A, n) {
  const M = A.map((r) => r.slice());
  const piv = new Array(n);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    piv[k] = p;
    if (p !== k) { const t = M[k]; M[k] = M[p]; M[p] = t; }
    const d = M[k][k];
    if (Math.abs(d) < 1e-14) throw new Error('slices: the lattice is singular');
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / d;
      M[i][k] = f;
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) M[i][j] -= f * M[k][j];
    }
  }
  return { M, piv, n };
}

function slLuSolve({ M, piv, n }, b0) {
  const b = b0.slice();
  for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = b[k]; b[k] = b[p]; b[p] = t; } }
  for (let i = 0; i < n; i++) { let s = b[i]; for (let j = 0; j < i; j++) s -= M[i][j] * b[j]; b[i] = s; }
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= M[i][j] * b[j]; b[i] = s / M[i][i]; }
  return b;
}

/**
 * The lattice with each strip's lift made its section's (the alpha method).
 *
 * @param {object}   o
 * @param {object[]} o.slices    `sliceStations(wing)`
 * @param {number}   o.alphaDeg  the flow's angle to the central chord
 * @param {function} o.sectionAt (sliceIndex, alphaEffDeg) => { cl, cd, cm }
 * @param {number[]} [o.deflection]  per slice, a turn of the section's
 *                   zero-lift line, degrees (left for the brakes)
 * @returns per slice alpha_eff, cl, the circulation and the strip's force
 *          (unit speed); whether it converged; the induced drag factor
 */
export function coupleSlices({
  slices, alphaDeg, sectionAt, zeroLiftDeg = 0,
  tol = SLICE_SETTINGS.couplingTol, maxIterations = SLICE_SETTINGS.couplingIterations,
  relax = SLICE_SETTINGS.relax, system = null,
}) {
  const strips = slices.map((s) => s.strip);
  const sys = system || latticeSystem(strips, { alphaDeg });
  const n = sys.n;
  const lu = slLuFactor(sys.A, n);
  // the strips are in the lattice's own order; the slices know theirs
  const sliceOf = new Array(n);
  slices.forEach((s, i) => { sliceOf[i] = s; });
  const U = sys.U;
  const chordDir = sys.panels.map((p) => slUnit(slCross(slUnit(p.span), p.normal)));
  const twoPi = 2 * Math.PI;
  const d = new Array(n).fill(-zeroLiftDeg * SL_RAD);
  let gamma = null; let clInv = null; let aEff = null; let clSec = null; let sec = null;
  let resid = Infinity; let it = 0;
  for (it = 0; it < maxIterations; it++) {
    const rhs = sys.panels.map((p, i) => {
      const c = Math.cos(d[i]); const s = Math.sin(d[i]);
      const nn = [p.normal[0] * c + chordDir[i][0] * s, p.normal[1] * c + chordDir[i][1] * s, p.normal[2] * c + chordDir[i][2] * s];
      return -slDot(U, nn);
    });
    gamma = slLuSolve(lu, rhs);
    clInv = gamma.map((g, i) => (2 * g) / sliceOf[i].chord);
    aEff = clInv.map((cl, i) => (cl / twoPi - d[i]) / SL_RAD);
    sec = aEff.map((a, i) => sectionAt(i, a));
    clSec = sec.map((s) => s.cl);
    resid = 0;
    for (let i = 0; i < n; i++) resid = Math.max(resid, Math.abs(clSec[i] - clInv[i]));
    if (!Number.isFinite(resid)) break;
    if (resid < tol) break;
    for (let i = 0; i < n; i++) d[i] += relax * (clSec[i] - clInv[i]) / twoPi;
  }
  // forces at unit speed and density: Kutta-Joukowski on each bound vortex
  const forces = sys.panels.map((p, i) => {
    const vi = [0, 0, 0];
    for (let j = 0; j < n; j++) {
      vi[0] += sys.VX[i * n + j] * gamma[j];
      vi[1] += sys.VY[i * n + j] * gamma[j];
      vi[2] += sys.VZ[i * n + j] * gamma[j];
    }
    const vLocal = slAdd(U, vi);
    return slScale(slCross(vLocal, p.span), gamma[i]);
  });
  const seen = (q) => [q[1], q[2] * Math.cos(sys.alpha) - q[0] * Math.sin(sys.alpha)];
  const trace = sys.panels.map((p) => [seen(p.ta), seen(p.tb)]);
  // trefftzDrag takes rho; with rho = 2 it returns sum(Gamma Vn s): D/q at unit speed
  const inducedOverQ = trefftzDrag(trace, gamma, 2);
  return {
    converged: resid < tol, iterations: it, residual: resid,
    correctionDeg: d.map((v) => v / SL_RAD),
    gamma, clLattice: clInv, alphaEffDeg: aEff, section: sec, forces, inducedOverQ, system: sys,
  };
}

/**
 * The whole analysis, as a generator of progress (run it with `runSteps` or
 * `runStepsAsync`): the polar grid over the wing's Reynolds numbers and
 * angles, the coupling at the flown angle with the speed the lift gives,
 * then every slice solved on its own. A symmetric flight solves the right
 * half and the centre and mirrors them.
 *
 * @param {object} o
 * @param {object} o.wing     `buildWing`
 * @param {object} o.airfoil  the section, unit chord
 * @param {object} o.atm      `atmosphere`: density, dynamicViscosity, gravity
 * @param {number} o.alphaDeg the angle flown, to the central chord
 * @param {number} o.massKg   all up, for the speed (lift = weight)
 * @param {number} o.areaM2   the reference area (flat), for the coefficients
 * @param {number} [o.speed]  a first guess, m/s
 */
export function* sliceAnalysisSteps({
  wing, airfoil, atm, alphaDeg, massKg, areaM2, chordRefM = null, speed = 10,
  settings = {}, label = '',
}) {
  const cfg = { ...SLICE_SETTINGS, ...settings };
  const slices = sliceStations(wing);
  const model = sliceSectionModel(airfoil, cfg);
  const frame = centralFrame(wing);
  const rho = atm.density; const mu = atm.dynamicViscosity; const g = atm.gravity || 9.80665;
  const cRef = chordRefM || frame.chordM;
  const sys = latticeSystem(slices.map((s) => s.strip), { alphaDeg });
  // The angles the slices will see: a first coupling on thin-section lift
  // (2 pi from a zero-lift angle) brackets them.
  const thin = coupleSlices({
    slices, alphaDeg, system: sys, zeroLiftDeg: -4,
    sectionAt: (i, a) => ({ cl: 2 * Math.PI * (a + 4) * SL_RAD, cd: 0, cm: 0 }),
  });
  const aMin = Math.min(...thin.alphaEffDeg); const aMax = Math.max(...thin.alphaEffDeg);
  const step = cfg.alphaStepDeg;
  const a0 = Math.floor((aMin - cfg.alphaMarginDeg) / step) * step;
  const a1 = Math.ceil((aMax + cfg.alphaMarginDeg) / step) * step;
  const alphas = [];
  for (let a = a0; a <= a1 + 1e-9; a += step) alphas.push(Math.round(a * 1e6) / 1e6);
  const chords = slices.map((s) => s.chord);
  const cMin = Math.min(...chords); const cMax = Math.max(...chords);
  const reLo = (rho * speed * cMin / mu) * (1 - cfg.reynoldsMargin);
  const reHi = (rho * speed * cMax / mu) * (1 + cfg.reynoldsMargin);
  const reynolds = reynoldsLevels(reLo, reHi, cfg.reynoldsStep);
  yield { phase: 'grid', done: 0, total: reynolds.length * alphas.length, label };
  const grid = yield* (function* wrap() {
    const gen = polarGridSteps(model, { reynolds, alphas, ncrit: cfg.ncrit });
    let s = gen.next();
    while (!s.done) { yield { phase: 'grid', ...s.value, label }; s = gen.next(); }
    return s.value;
  }());
  if (!grid.converged) throw new Error('slices: no section solve converged, so there is nothing to put together');
  const zeroLift = slZeroLift(grid);
  // The coupling at the speed the lift asks for, the Reynolds numbers with
  // it; `offset` moves each slice's grid lift onto its own solution's.
  let V = speed; let coupled = null; let reAt = null;
  const q = () => 0.5 * rho * V * V;
  const offset = new Array(slices.length).fill(0);
  const liftDirOf = (a) => [-Math.sin(a), 0, Math.cos(a)];
  const coupleAtSpeed = () => {
    for (let k = 0; k < cfg.speedIterations; k++) {
      reAt = slices.map((s) => (rho * V * s.chord) / mu);
      const reNow = reAt;
      coupled = coupleSlices({
        slices, alphaDeg, system: sys, zeroLiftDeg: zeroLift, tol: cfg.couplingTol,
        maxIterations: cfg.couplingIterations, relax: cfg.relax,
        sectionAt: (i, a) => {
          const p = polarGridAt(grid, reNow[i], a);
          return offset[i] ? { ...p, cl: p.cl + offset[i] } : p;
        },
      });
      const liftOverQ = coupled.forces.reduce((acc, f) => acc + 2 * slDot(f, liftDirOf(sys.alpha)), 0);
      const CL = liftOverQ / areaM2;
      if (!(CL > 0.02)) break;
      const Vn = Math.sqrt((2 * massKg * g) / (rho * areaM2 * CL));
      const settled = Math.abs(Vn - V) / Vn < 1e-5;
      V = Vn;
      if (settled) break;
    }
    reAt = slices.map((s) => (rho * V * s.chord) / mu);
  };
  coupleAtSpeed();
  yield { phase: 'couple', done: 1, total: 1, speed: V, label };
  // Each slice on its own: first from the nearest grid point's boundary
  // layer, after that from its own last solution. Then the slices' own lift
  // goes back into the coupling (a defect correction: the grid gives the
  // slopes, the slices the values) and they are solved again where it
  // leaves them, until the lattice's lift and theirs agree.
  const solveIdx = [];
  const symmetric = true;
  for (const s of slices) if (!symmetric || s.y >= -1e-9 || s.mirror === s.index) solveIdx.push(s.index);
  let results = new Array(slices.length).fill(null);
  const own = new Array(slices.length).fill(null);
  const nearestGrid = (aEff, Re) => {
    let best = null; let bestD = Infinity;
    grid.rows.forEach((row, r) => row.forEach((p) => {
      if (!p.converged) return;
      const dd = Math.abs(Math.log(grid.reynolds[r] / Re)) * 4 + Math.abs(p.alphaDeg - aEff);
      if (dd < bestD) { bestD = dd; best = p; }
    }));
    return best ? best.state : false;
  };
  const rounds = [];
  for (let round = 0; round <= cfg.correctionRounds; round++) {
    results = new Array(slices.length).fill(null);
    let n = 0;
    for (const i of solveIdx) {
      const aEff = coupled.alphaEffDeg[i];
      const Re = reAt[i];
      let r = null; let err = null;
      // Starts, in turn: the slice's own last solution, the nearest grid
      // point's, its solved neighbours' (they differ least from it), cold.
      const starts = [own[i], nearestGrid(aEff, Re)];
      for (const k of solveIdx) if (Math.abs(k - i) <= 2 && k !== i && own[k]) starts.push(own[k]);
      starts.push(false);
      for (const w of starts) {
        if (w === null || w === undefined) continue;
        try {
          r = mfoilSolve(model, { alpha: aEff, Re, ncrit: cfg.ncrit, warm: w });
          err = null;
        } catch (e) { r = null; err = e.message; }
        if (r && r.converged) break;
      }
      let bracket = null;
      if (!(r && r.converged)) {
        // A solve can cycle at one angle, a transition or stagnation node
        // switching back and forth, and converge a hair either side: then
        // it is solved either side and read between, and says so.
        const side = (da) => {
          for (const w of starts) {
            if (w === null || w === undefined) continue;
            try {
              const q = mfoilSolve(model, { alpha: aEff + da, Re, ncrit: cfg.ncrit, warm: w });
              if (q.converged) return { q, d: mfoilDistributions(model), st: mfoilState(model) };
            } catch (e) { /* the next start */ }
          }
          return null;
        };
        const lo = side(-cfg.bracketDeg); const hi = lo ? side(cfg.bracketDeg) : null;
        if (lo && hi) {
          const mix = (k) => 0.5 * (lo.q[k] + hi.q[k]);
          r = { ...lo.q, alpha: aEff, cl: mix('cl'), cd: mix('cd'), cdf: mix('cdf'), cdp: mix('cdp'), cm: mix('cm'),
            xtrLower: mix('xtrLower'), xtrUpper: mix('xtrUpper'), converged: true, bracketDeg: cfg.bracketDeg };
          bracket = lo;
        }
      }
      if (bracket) {
        own[i] = bracket.st;
        results[i] = { ...r, distributions: bracket.d };
      } else {
        if (r && r.converged) own[i] = mfoilState(model);
        results[i] = r ? { ...r, distributions: mfoilDistributions(model) } : { converged: false, error: err };
      }
      n++;
      yield { phase: 'slices', round, done: n, total: solveIdx.length, label };
    }
    for (const s of slices) if (!results[s.index] && results[s.mirror]) results[s.index] = { ...results[s.mirror], mirroredFrom: s.mirror };
    // How far the lattice's lift is from the slices' own
    let mismatch = 0;
    for (const s of slices) {
      const sol = results[s.index];
      if (sol && sol.converged) mismatch = Math.max(mismatch, Math.abs(sol.cl - coupled.clLattice[s.index]));
    }
    rounds.push({ round, mismatch, speed: V });
    if (mismatch < cfg.sliceTol || round === cfg.correctionRounds) break;
    for (const s of slices) {
      const sol = results[s.index];
      if (sol && sol.converged) offset[s.index] = sol.cl - polarGridAt(grid, reAt[s.index], sol.alpha).cl;
    }
    coupleAtSpeed();
    yield { phase: 'couple', done: round + 2, total: cfg.correctionRounds + 1, speed: V, label };
  }

  // Put together: lift and induced drag from the lattice, profile drag and
  // the sections' moment from the slices' own solutions.
  const Q = q();
  const liftDir = [-Math.sin(sys.alpha), 0, Math.cos(sys.alpha)];
  const dragDir = [Math.cos(sys.alpha), 0, Math.sin(sys.alpha)];
  const ref = slAdd(frame.origin, slScale(frame.u, 0.25 * frame.chordM));
  let lift = 0; let side = 0; let Dp = 0; let DpGrid = 0; let My = 0; let MyGrid = 0;
  const perSlice = slices.map((s, i) => {
    const f = coupled.forces[i];
    const sol = results[i];
    const ok = !!(sol && sol.converged);
    const cl = coupled.clLattice[i];
    const grd = coupled.section[i];
    const cd = ok ? sol.cd : grd.cd;
    const cm = ok ? sol.cm : grd.cm;
    const area = s.chord * s.lengthM;
    const Fl = slScale(f, 2 * Q); // rho V^2 Gamma (V x s) at this speed, from unit-speed forces
    lift += slDot(Fl, liftDir);
    side += Fl[1];
    const dp = Q * cd * area; const dpg = Q * grd.cd * area;
    Dp += dp; DpGrid += dpg;
    const r = slSub(s.quarterChord, ref);
    const Ftot = slAdd(Fl, slScale(dragDir, dp));
    const mom = slCross(r, Ftot)[1] + cm * Q * s.chord * s.chord * s.lengthM * s.spanDir[1];
    const momG = slCross(r, slAdd(Fl, slScale(dragDir, dpg)))[1] + grd.cm * Q * s.chord * s.chord * s.lengthM * s.spanDir[1];
    My += mom; MyGrid += momG;
    return {
      index: i, side: s.side, y: s.y, chord: s.chord, lengthM: s.lengthM, arcDeg: s.arcDeg,
      incidenceDeg: s.incidenceDeg, reynolds: reAt[i],
      alphaEffDeg: coupled.alphaEffDeg[i], correctionDeg: coupled.correctionDeg[i],
      cl, clSlice: ok ? sol.cl : NaN, cd, cm, cdGrid: grd.cd, clGrid: grd.cl, cmGrid: grd.cm,
      outsideGrid: !!grd.outside, converged: ok, mirroredFrom: sol?.mirroredFrom ?? null,
      bracketedDeg: sol?.bracketDeg ?? null,
      xtrLower: ok ? sol.xtrLower : NaN, xtrUpper: ok ? sol.xtrUpper : NaN,
      gamma: coupled.gamma[i] * V, liftPerSpan: slDot(Fl, liftDir) / Math.max(1e-9, s.lengthM),
    };
  });
  const Di = coupled.inducedOverQ * Q;
  const S = areaM2;
  const totals = {
    speed: V, dynamicPressure: Q, alphaDeg,
    CL: lift / (Q * S), CDi: Di / (Q * S), CDp: Dp / (Q * S), CDpGrid: DpGrid / (Q * S),
    CY: side / (Q * S), Cm: My / (Q * S * cRef), CmGrid: MyGrid / (Q * S * cRef),
    liftN: lift, inducedDragN: Di, profileDragN: Dp,
    areaM2: S, chordRefM: cRef,
    wingLD: lift / (Di + Dp),
  };
  const solved = perSlice.filter((p) => p.converged);
  const clError = solved.length ? Math.max(...solved.map((p) => Math.abs(p.clSlice - p.cl))) : NaN;
  return {
    label, settings: cfg, slices: perSlice, stations: slices, results, grid: stripStates(grid), totals,
    coupling: { converged: coupled.converged, iterations: coupled.iterations, residual: coupled.residual, rounds },
    zeroLiftDeg: zeroLift, reynolds, alphas,
    check: {
      solvedSlices: solveIdx.length,
      convergedSlices: solveIdx.filter((i) => results[i]?.converged).length,
      bracketedSlices: solveIdx.filter((i) => results[i]?.bracketDeg).length,
      outsideGrid: perSlice.filter((p) => p.outsideGrid).length,
      // the lattice's lift against the slices' own, after the corrections
      liftMismatch: clError,
      // the slices' profile drag against the grid's, read at their angles
      gridDragError: totals.CDpGrid > 0 ? totals.CDp / totals.CDpGrid - 1 : NaN,
    },
    teGapAdded: model.geom.teGapAdded,
  };
}

/** The grid without its stored boundary layers (kept only to start solves). */
function stripStates(grid) {
  return {
    reynolds: grid.reynolds, alphas: grid.alphas, ncrit: grid.ncrit, converged: grid.converged, total: grid.total,
    rows: grid.rows.map((row) => row.map(({ state, ...p }) => p)),
  };
}

/* ---------------------------------------------------------------- exports */

/** The section as the slices solve it — the tool's aerofoil, its trailing
 * edge opened as the analysis opens it — in XFOIL's .dat format. */
export function sliceSectionDat(airfoil, { name = 'section', minTEGap = SLICE_SETTINGS.minTEGap } = {}) {
  const model = sliceSectionModel(airfoil, { npanel: 40, minTEGap });
  const [xs, zs] = model.geom.xpoint;
  // mfoil runs from the trailing edge along the lower surface; XFOIL's
  // files run over the upper first (Selig order)
  const lines = [String(name).replace(/[\r\n]+/g, ' ').slice(0, 72)];
  for (let i = xs.length - 1; i >= 0; i--) lines.push(`${xs[i].toFixed(6)} ${zs[i].toFixed(6)}`);
  return `${lines.join('\n')}\n`;
}

/** An XFOIL command script that solves one slice: its section loaded from
 * the .dat beside it, at its Reynolds number and angle. */
export function sliceXfoilScript(slice, { datFile = 'section.dat', ncrit = SLICE_SETTINGS.ncrit, npanel = SLICE_SETTINGS.npanel } = {}) {
  // as commandScript (xfoil.js) writes its runs: repanel, then solve
  return [
    `LOAD ${datFile}`, '',
    'PPAR', `N ${npanel + 1}`, '', '',
    'OPER',
    `VISC ${slice.reynolds.toFixed(0)}`,
    'MACH 0.0000',
    'ITER 200',
    'VPAR', `N ${Number(ncrit).toFixed(2)}`, '',
    `ALFA ${slice.alphaEffDeg.toFixed(4)}`,
    '', 'QUIT', '',
  ].join('\n');
}

/** A Python script that solves one slice with mfoil itself (mfoil.py, from
 * Scirocco's mfoil/ folder or Fidkowski's own), on the same points. */
export function sliceMfoilScript(slice, airfoil, { name = 'slice', ncrit = SLICE_SETTINGS.ncrit, npanel = SLICE_SETTINGS.npanel, minTEGap = SLICE_SETTINGS.minTEGap } = {}) {
  const model = sliceSectionModel(airfoil, { npanel: 40, minTEGap });
  const [xs, zs] = model.geom.xpoint;
  const arr = (a) => `[${Array.from(a, (v) => v.toPrecision(12)).join(', ')}]`;
  const label = String(name).replace(/[\r\n]+/g, ' ');
  // Written line by line: a line of this source beginning with the word
  // import is taken by the bundler (build.py) for a module import.
  return [
    `# ${label}: slice ${slice.index} at y = ${slice.y.toFixed(4)} m`,
    '# Solves the slice with mfoil (Krzysztof J. Fidkowski, MIT licence): put',
    '# mfoil.py beside this file (Scirocco\'s mfoil/mfoil.py, or the original).',
    '# The points are the section as this tool solves it, trailing edge opened',
    `# ${minTEGap} of the chord; they are set directly because the copy of`,
    '# set_coords in some mfoil.py releases does not run.',
    'import numpy as np',
    'import mfoil as mf',
    '',
    `X = np.array([${arr(xs)},`,
    `              ${arr(zs)}])`,
    `M = mf.mfoil(naca='0012', npanel=${npanel})`,
    'M.geom.xpoint = X; M.geom.npoint = X.shape[1]; M.geom.chord = max(X[0, :]) - min(X[0, :])',
    `M.geom.name = ${JSON.stringify(label.slice(0, 60))}`,
    `mf.make_panels(M, ${npanel}, None)`,
    'M.param.verb = 1',
    `M.param.ncrit = ${ncrit}`,
    'M.param.rtol = 1e-10',
    `M.setoper(alpha=${slice.alphaEffDeg.toFixed(6)}, Re=${slice.reynolds.toFixed(1)}, Ma=0.0)`,
    'M.solve()',
    "print('cl %.5f cd %.6f cm %.5f converged %s' % (M.post.cl, M.post.cd, M.post.cm, M.glob.conv))",
    `print('this tool: cl %.5f cd %.6f cm %.5f' % (${(Number.isFinite(slice.clSlice) ? slice.clSlice : slice.cl).toFixed(5)}, ${slice.cd.toFixed(6)}, ${slice.cm.toFixed(5)}))`,
    '',
  ].join('\n');
}

/**
 * What Scirocco's analysis server takes for one slice (its Philote
 * discipline, the chrislupp/scirocco container): the options it is set up
 * with — the section's coordinates and the panel count — and the inputs:
 * x, the nodes' x then their z, the angle in degrees, the Reynolds and Mach
 * numbers. A client sends these over gRPC (port 50051); this tool has no
 * network and does not.
 */
export function sliceSciroccoInput(slice, airfoil, { npanel = SLICE_SETTINGS.npanel, minTEGap = SLICE_SETTINGS.minTEGap } = {}) {
  const model = sliceSectionModel(airfoil, { npanel: 40, minTEGap });
  const [xs, zs] = model.geom.xpoint;
  const r6 = (v) => Math.round(v * 1e8) / 1e8;
  return {
    discipline: 'scirocco analysis (Philote, gRPC port 50051)',
    options: { coordinates: { x: Array.from(xs, r6), z: Array.from(zs, r6) }, npanel },
    inputs: {
      x: [...Array.from(xs, r6), ...Array.from(zs, r6)],
      alpha: Number(slice.alphaEffDeg.toFixed(6)),
      Re: Number(slice.reynolds.toFixed(1)),
      Ma: 0,
    },
    outputs: ['cl', 'cd', 'cm'],
    thisTool: { cl: slice.clSlice ?? slice.cl, cd: slice.cd, cm: slice.cm, converged: slice.converged },
    slice: { index: slice.index, side: slice.side, yM: slice.y, chordM: slice.chord },
  };
}

/** Every slice, one row each, as tab-separated text. */
export function sliceTable(analysis) {
  const head = ['slice', 'side', 'y_m', 'chord_m', 'reynolds', 'arc_deg', 'incidence_deg', 'alpha_eff_deg',
    'cl', 'cl_slice', 'cd', 'cm', 'xtr_lower', 'xtr_upper', 'converged'];
  const rows = analysis.slices.map((s) => [
    s.index, s.side, s.y.toFixed(4), s.chord.toFixed(4), s.reynolds.toFixed(0), s.arcDeg.toFixed(2),
    s.incidenceDeg.toFixed(3), s.alphaEffDeg.toFixed(3), s.cl.toFixed(5),
    Number.isFinite(s.clSlice) ? s.clSlice.toFixed(5) : '', s.cd.toFixed(6), s.cm.toFixed(5),
    Number.isFinite(s.xtrLower) ? s.xtrLower.toFixed(4) : '', Number.isFinite(s.xtrUpper) ? s.xtrUpper.toFixed(4) : '',
    s.converged ? 'yes' : 'no',
  ].join('\t'));
  const t = analysis.totals;
  return `# ${analysis.label || 'slices'}: alpha ${t.alphaDeg.toFixed(2)} deg, ${t.speed.toFixed(2)} m/s, `
    + `CL ${t.CL.toFixed(4)} CDi ${t.CDi.toFixed(5)} CDp ${t.CDp.toFixed(5)} Cm ${t.Cm.toFixed(4)}\n`
    + `${head.join('\t')}\n${rows.join('\n')}\n`;
}
