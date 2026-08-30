/* planform.js — Chapter 1: Paraglider planform.
 *
 * Coordinate convention used throughout this project:
 *   y  spanwise, 0 at the centre rib, positive toward the right tip (metres)
 *   x  chordwise, 0 at the centre-rib leading edge, positive aft (metres)
 *   z  vertical, positive up (metres)
 *
 * The handbook (1.2.1) defines each edge as an ellipse plus a linear term:
 *   leading  edge:  x = x1 + b1 * sqrt(1 - (y/a1)^2) + k1 * y
 *   trailing edge:  x = x2 - b2 * sqrt(1 - (y/a2)^2) + k2 * y
 * The handbook writes these with (x,y) swapped relative to our axes; the
 * structure is identical. Chord at station y is xTE(y) - xLE(y).
 *
 * The handbook's 1.2.2 "discrete method" — an explicit list of
 * (y, xLE, xTE) triplets — is supported as an alternative source.
 */

import { simpson, clamp } from './num.js';

/** Analytic edge evaluation. Returns chordwise position of one edge. */
function edge(y, { a, b, k, x0 }, sign) {
  const t = clamp(Math.abs(y) / a, 0, 1);
  return x0 + sign * b * Math.sqrt(1 - t * t) + k * Math.abs(y);
}

/**
 * Build a planform from analytic parameters.
 * @param {object} p
 * @param {number} p.span      full flat span, tip to tip (m)
 * @param {object} p.le        {a,b,k,x0} leading-edge ellipse params
 * @param {object} p.te        {a,b,k,x0} trailing-edge ellipse params
 */
export function analyticPlanform(p) {
  const halfSpan = p.span / 2;
  return {
    kind: 'analytic',
    span: p.span,
    halfSpan,
    params: { le: p.le, te: p.te },
    xLE: (y) => edge(y, p.le, +1),
    xTE: (y) => edge(y, p.te, -1),
    chord: (y) => edge(y, p.te, -1) - edge(y, p.le, +1),
  };
}

/**
 * Derive analytic parameters from the numbers a designer actually thinks in:
 * span, root chord, tip chord, how far the tip is swept back, and how
 * elliptical each edge is.
 *
 * ellipticityLE / ellipticityTE run 0..1. At 1 the edge is a pure ellipse
 * reaching the tip; at 0 it is a straight taper. Intermediate values blend,
 * which is the "modified ellipse" the handbook recommends for real wings.
 */
export function planformFromDesignInputs({
  span = 10.25,
  rootChord = 2.6,
  tipChord = 0.9,
  tipSweep = 1.1,
  ellipticityLE = 0.85,
  ellipticityTE = 0.95,
}) {
  const s = span / 2;
  // Leading edge: starts at x=0 at the centre, ends at x=tipSweep at the tip.
  // Elliptical part carries `ellipticityLE` of that travel, linear part the rest.
  const bLE = tipSweep * ellipticityLE;
  const kLE = (tipSweep * (1 - ellipticityLE)) / s;
  const le = { a: s, b: -bLE, k: kLE, x0: bLE };
  // so xLE(0) = bLE - bLE = 0, xLE(s) = bLE + kLE*s = tipSweep. Correct.

  // Trailing edge: from rootChord at centre to tipSweep+tipChord at the tip.
  const teTravel = tipSweep + tipChord - rootChord;
  const bTE = teTravel * ellipticityTE;
  const kTE = (teTravel * (1 - ellipticityTE)) / s;
  const te = { a: s, b: bTE, k: kTE, x0: rootChord + bTE };
  // xTE(0) = rootChord + bTE - bTE = rootChord. xTE(s) = rootChord + bTE + kTE*s.

  return analyticPlanform({ span, le, te });
}

/** Planform from an explicit table of stations (handbook 1.2.2). */
export function discretePlanform(rows) {
  const ys = rows.map((r) => r.y);
  const span = 2 * Math.max(...ys);
  const interp = (y, key) => {
    const t = Math.abs(y);
    if (t <= ys[0]) return rows[0][key];
    for (let i = 1; i < rows.length; i++) {
      if (t <= ys[i]) {
        const f = (t - ys[i - 1]) / (ys[i] - ys[i - 1]);
        return rows[i - 1][key] + f * (rows[i][key] - rows[i - 1][key]);
      }
    }
    return rows[rows.length - 1][key];
  };
  return {
    kind: 'discrete',
    span,
    halfSpan: span / 2,
    rows,
    xLE: (y) => interp(y, 'xLE'),
    xTE: (y) => interp(y, 'xTE'),
    chord: (y) => interp(y, 'xTE') - interp(y, 'xLE'),
  };
}

/**
 * Rib (profile) stations across the half wing.
 * `distribution` biases stations toward the tip, where chord changes fastest.
 *   'uniform'  equal spacing
 *   'cosine'   denser near the tip
 */
export function ribStations(planform, nCells, distribution = 'cosine') {
  // nCells counts cells in the HALF wing; there are nCells+1 ribs including
  // the centre rib at y=0.
  const out = [];
  for (let i = 0; i <= nCells; i++) {
    const u = i / nCells;
    const t = distribution === 'cosine' ? Math.sin((u * Math.PI) / 2) : u;
    out.push(t * planform.halfSpan);
  }
  return out;
}

/** Flat area of the whole wing (both halves), by Simpson integration. */
export function flatArea(planform, n = 400) {
  // `n` is a sample count, not a physical quantity.
  //
  // `thinAirfoil(af, 6)` once meant six samples and read like six degrees,
  // and put a 9% error into the zero-lift angle without failing anything.
  // Every function with this shape carries the same hazard, so every one
  // of them refuses a value too small to be a plausible sample count.
  if (!(n >= 20)) {
    throw new Error(`flatArea: n is a sample count, not a physical `
      + `quantity (got ${n})`);
  }
  return 2 * simpson((y) => planform.chord(y), 0, planform.halfSpan, n);
}

/** Summary numbers from handbook Table 1: area, span, chords, AR, centroid. */
export function planformMetrics(planform, n = 400) {
  // `n` is a sample count, not a physical quantity.
  //
  // `thinAirfoil(af, 6)` once meant six samples and read like six degrees,
  // and put a 9% error into the zero-lift angle without failing anything.
  // Every function with this shape carries the same hazard, so every one
  // of them refuses a value too small to be a plausible sample count.
  if (!(n >= 20)) {
    throw new Error(`planformMetrics: n is a sample count, not a physical `
      + `quantity (got ${n})`);
  }
  const s = planform.halfSpan;
  const area = flatArea(planform, n);
  const span = planform.span;

  let maxch = -Infinity;
  let minch = Infinity;
  for (let i = 0; i <= n; i++) {
    const c = planform.chord((i / n) * s);
    if (c > maxch) maxch = c;
    if (c < minch) minch = c;
  }

  // Centroid of the half planform. By symmetry the full-wing centroid sits on
  // the centreline, so only the chordwise coordinate is reported (handbook 1.3
  // notes designers correlate this with centre-of-pressure position).
  const denom = simpson((y) => planform.chord(y), 0, s, n);
  const numX = simpson(
    (y) => planform.chord(y) * (planform.xLE(y) + planform.chord(y) / 2),
    0, s, n,
  );
  const numY = simpson((y) => planform.chord(y) * y, 0, s, n);

  // Mean aerodynamic chord — not in the handbook, but standard and useful
  // for sanity-checking a design against published wings.
  const mac = simpson((y) => planform.chord(y) ** 2, 0, s, n) / denom;

  return {
    area,
    span,
    maxChord: maxch,
    meanChord: area / span,
    minChord: minch,
    aspectRatio: (span * span) / area,
    mac,
    centroidX: numX / denom,
    centroidY: numY / denom,
  };
}

/** Closed outline of the full planform, for drawing. */
export function planformOutline(planform, n = 120) {
  // `n` is a sample count, not a physical quantity.
  //
  // `thinAirfoil(af, 6)` once meant six samples and read like six degrees,
  // and put a 9% error into the zero-lift angle without failing anything.
  // Every function with this shape carries the same hazard, so every one
  // of them refuses a value too small to be a plausible sample count.
  if (!(n >= 20)) {
    throw new Error(`planformOutline: n is a sample count, not a physical `
      + `quantity (got ${n})`);
  }
  const s = planform.halfSpan;
  const pts = [];
  for (let i = -n; i <= n; i++) {
    const y = (i / n) * s;
    pts.push([y, planform.xLE(y)]);
  }
  for (let i = n; i >= -n; i--) {
    const y = (i / n) * s;
    pts.push([y, planform.xTE(y)]);
  }
  return pts;
}
