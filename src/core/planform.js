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
  // A wing has a positive span and positive chords.
  //
  // Without this a negative span produced an area of **-20.9 m2** and a zero
  // span produced NaN, both silently and both from arithmetic that is
  // perfectly happy with either. A design tool that returns a negative area
  // has already failed the person using it; the question is only whether it
  // tells them.
  const bad = [];
  if (!(span > 0)) bad.push(`span ${span}`);
  if (!(rootChord > 0)) bad.push(`root chord ${rootChord}`);
  if (!(tipChord >= 0)) bad.push(`tip chord ${tipChord}`);
  if (!Number.isFinite(tipSweep)) bad.push(`tip sweep ${tipSweep}`);
  if (bad.length) {
    throw new Error(`planformFromDesignInputs: not a wing — ${bad.join(', ')}`);
  }
  // Ellipticity is a blend fraction: outside 0..1 the edge curves the wrong
  // way and the planform folds through itself.
  for (const [name, v] of [['ellipticityLE', ellipticityLE],
    ['ellipticityTE', ellipticityTE]]) {
    if (!(v >= 0 && v <= 1)) {
      throw new Error(`planformFromDesignInputs: ${name} is a fraction `
        + `between 0 and 1 (got ${v})`);
    }
  }

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
 *
 * Where the ribs go is a choice about cloth, not about numerics: a cell is a
 * thing somebody sews. Three rules:
 *
 *   'chord'    cells narrow towards the tip as the chord does, by `taper`:
 *
 *                  width  ~  (1 - taper) + taper * chord / root chord
 *
 *              0 is even cells, 1 is every cell the same shape in plan.
 *   'uniform'  even cells (the same as 'chord' with no taper)
 *   'cosine'   stations at sin(u pi/2) of the half span. Kept so a design
 *              saved with it still loads as it was, and for nothing else.
 *
 * 'cosine' was the default, with the reason that it "biases stations toward
 * the tip, where chord changes fastest". That is how a panel method is
 * meshed. It is not how a wing is built: on the default wing, 24 cells a
 * side over a 5.1 m half span, it made the last cell 11 mm wide on a 0.9 m
 * chord, and the one before it 33 mm. Nobody cuts those, and every pattern,
 * diagonal and line anchor out there inherited them.
 *
 * The 'chord' rule is what the one complete design in the repository does.
 * The Swoop2 states all 26 of its rib stations: its cells narrow from 249 mm
 * at the centre to 128 mm at the tip while its chord goes from 2.09 m to
 * 0.61 m — half the width for less than a third of the chord — and this
 * rule with taper 0.735 puts every one of its ribs within 3 mm over 5.24 m.
 * A power law (width ~ chord^0.64 at best) misses by 12 mm. The default is
 * that design's figure rounded, 0.75; it is one design, not a survey.
 *
 * The rule is applied as a density rather than cell by cell — ribs per metre
 * ~ 1 / ((1 - taper) + taper c/c0), and each cell takes an equal share of
 * its integral — so the stations do not depend on where in a cell its chord
 * is read.
 */
export function ribStations(planform, nCells, distribution = 'chord', {
  centreRib = true,
  taper = 0.75,
} = {}) {
  // `nCells` counts the FULL cells outboard of the centreline, on one half.
  //
  // With a centre RIB there is a rib at y=0 and the wing has 2*nCells cells.
  // That is what this did, and it is why an odd published count could not be
  // built: the Alpina 5 and the Lynx 2 have 65.
  //
  // With a centre CELL there is no rib on the centreline. A cell straddles
  // it, half on each side, so the half wing carries nCells full cells plus
  // that half — nCells + 0.5 cell widths — and the wing has 2*nCells+1
  // cells. The innermost rib sits half a cell out, and mirroring it across
  // the centreline closes the centre cell.
  //
  // Both give nCells+1 ribs on the half; what changes is where the innermost
  // one sits.
  const span = centreRib ? nCells : nCells + 0.5;
  const first = centreRib ? 0 : 0.5;
  const half = planform.halfSpan;
  const us = [];
  for (let i = 0; i <= nCells; i++) us.push((i + first) / span);

  const k = Math.min(1, Math.max(0, Number.isFinite(taper) ? taper : 0));
  if (distribution === 'cosine') {
    return us.map((u) => Math.sin((u * Math.PI) / 2) * half);
  }
  if (distribution !== 'chord' || k === 0 || typeof planform.chord !== 'function') {
    return us.map((u) => u * half);
  }

  // Cumulative rib count against span, then read off equal shares of it.
  const N = 2000;
  let c0 = 0;
  for (let i = 0; i <= 200; i++) c0 = Math.max(c0, planform.chord((half * i) / 200));
  if (!(c0 > 0)) return us.map((u) => u * half);
  // A chord that runs out to nothing would ask for cells of no width.
  const g = (y) => Math.max(0.05, (1 - k) + (k * planform.chord(y)) / c0);
  const F = [0];
  for (let i = 1; i <= N; i++) {
    F.push(F[i - 1] + (half / N) / g((half * (i - 0.5)) / N));
  }
  let at = 0;
  return us.map((u) => {
    if (u >= 1) return half;
    const target = F[N] * u;
    while (at < N - 1 && F[at + 1] < target) at++;
    const f = (target - F[at]) / (F[at + 1] - F[at]);
    return (half * (at + f)) / N;
  });
}

/**
 * The cells those stations make on one half: how wide each is, and which
 * are too narrow to sew.
 *
 * `minWidthM` is a judgement, not a rule: 60 mm is under half of the
 * narrowest cell on the Swoop2 (128 mm).
 */
export function cellWidths(stations, { centreRib = true, minWidthM = 0.06 } = {}) {
  const widths = [];
  if (!centreRib && stations.length) widths.push(2 * stations[0]);
  for (let i = 1; i < stations.length; i++) widths.push(stations[i] - stations[i - 1]);
  const narrow = widths.filter((w) => w < minWidthM);
  return {
    widths,
    centreM: widths[0] ?? 0,
    tipM: widths[widths.length - 1] ?? 0,
    narrowestM: widths.length ? Math.min(...widths) : 0,
    widestM: widths.length ? Math.max(...widths) : 0,
    tooNarrow: narrow.length,
    minWidthM,
    ok: narrow.length === 0,
  };
}

/** How many cells a wing has across its whole span. */
export function totalCells(nCells, { centreRib = true } = {}) {
  return centreRib ? nCells * 2 : nCells * 2 + 1;
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
