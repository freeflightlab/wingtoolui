/* ovalization.js — Chapter 6: ovalization (billow).
 *
 * Cells are textile and pressurised, so the panel between two ribs bows out
 * into a near-cylindrical arc. Measurements quoted in the handbook put cell
 * width in flight around 5-6% less than the flat panel width, so panels must
 * be cut wider than the rib spacing to end up the right size inflated.
 *
 * Geometry of the arc (handbook Fig 6.2), with:
 *   S  arc length  = the panel width as cut
 *   L  chord of the arc = the rib-to-rib spacing in flight
 *   R  arc radius, alpha the subtended angle, f the sagitta (bulge depth)
 *
 *   S = R * alpha
 *   L = 2 * R * sin(alpha/2)
 *   f = R * (1 - cos(alpha/2))
 *
 * Note: the handbook prints these as "L = 2 sin(alpha/2)" and
 * "R = f + L cos(alpha/2)". The first is missing its factor of R and the
 * second is dimensionally inconsistent — both are typographic slips in the
 * source. The relations implemented here are the correct circular-segment
 * ones, and they reduce to the handbook's intent.
 */

import { bisect } from './num.js';

/**
 * Solve the arc from arc length S and chord L.
 * S/L = (alpha/2) / sin(alpha/2) is monotonic in alpha on (0, 2pi), so the
 * root is bracketed and bisection is safe for any physical input.
 */
export function solveArc(S, L) {
  if (S <= L) return { alpha: 0, R: Infinity, f: 0, ratio: S / L };
  const ratio = S / L;
  const g = (alpha) => (alpha / 2) / Math.sin(alpha / 2) - ratio;
  const alpha = bisect(g, 1e-9, Math.PI * 1.999);
  const R = S / alpha;
  const f = R * (1 - Math.cos(alpha / 2));
  return { alpha, R, f, ratio };
}

/** Inverse: given the flight chord L and a widening fraction, get the arc. */
export function arcFromWidening(L, wideningFraction) {
  return solveArc(L * (1 + wideningFraction), L);
}

/**
 * Default transition points from handbook Table 6.4, as fractions of the
 * developed panel length measured from each end. Ovalization is faded out
 * near the leading and trailing edges to keep tension there.
 */
export const DEFAULT_TRANSITIONS = {
  upper: { fromLE: 0.10, fromTE: 0.15 },
  lower: { fromLE: 0.10, fromTE: 0.25 },
};

/**
 * Widening profile along a panel: 0 at each end, full value in the middle,
 * linear transitions between (handbook Fig 6.6).
 * @param {number} t normalised position along the panel, 0 at LE, 1 at TE
 */
export function wideningProfile(t, { fromLE, fromTE }) {
  if (t <= 0 || t >= 1) return 0;
  if (t < fromLE) return t / fromLE;
  if (t > 1 - fromTE) return (1 - t) / fromTE;
  return 1;
}

/**
 * Apply ovalization to a developed panel by pushing the two seams apart.
 * `amount` is the total extra width as a fraction of panel width — the
 * handbook's guidance is about 6% total, 3% on each side, tuned per model.
 *
 * The offset is applied along the local seam normal so that the widening is
 * perpendicular to the seam rather than to the global axes; on a curved
 * developed panel those differ enough to matter at the tips.
 */
export function applyOvalization(panel, {
  amount = 0.06,
  transitions = DEFAULT_TRANSITIONS.upper,
  // Derive the widening from pressure instead of taking a flat amount.
  //
  // `{ loading, tensionNPerM, dynamicPressurePa }` — the chordwise loading
  // the project already computes, the tension the cloth carries, and the
  // dynamic pressure of the flight state.
  //
  // The rib spacing the membrane equation needs is not a separate input: the
  // **panel width at each station is the local spacing**, so it comes from
  // the panel itself and varies along the chord exactly as it should.
  //
  // Left null, the flat amount and its shape profile are used unchanged, so
  // nothing that was working changes.
  pressure = null,
} = {}) {
  const { left, right } = panel;
  const n = left.length;
  const half = amount / 2;

  const outL = [];
  const outR = [];
  const excesses = [];

  // Chord fraction for each point, not point number.
  //
  // This read `t = i / (n - 1)`. The transitions and the chordwise loading
  // are both defined in CHORD fraction, and point number only tracks chord
  // if the points are evenly spread along it — which they never are, because
  // they are spread evenly along the SURFACE and the nose has far more
  // surface per unit chord.
  //
  // On a 24-point panel the two differ by up to **8.6 points of chord**, so
  // the billow profile and the pressure peak were being applied about a
  // tenth of a chord too far aft. Clustering the points made it worse and
  // non-convergent: the seam ease drifted from 0.08% to 0.14% as density
  // rose, where it should not depend on sampling at all.
  //
  // The fraction is measured by projecting each point onto the line from the
  // first to the last, which is the chord of the developed seam.
  const axis = [left[n - 1][0] - left[0][0], left[n - 1][1] - left[0][1]];
  const axisLen2 = axis[0] * axis[0] + axis[1] * axis[1];
  const chordFraction = (i) => {
    if (!(axisLen2 > 0)) return n > 1 ? i / (n - 1) : 0;
    const d = [left[i][0] - left[0][0], left[i][1] - left[0][1]];
    const u = (d[0] * axis[0] + d[1] * axis[1]) / axisLen2;
    return Math.min(1, Math.max(0, u));
  };

  // A panel parted at the intake (`partedEdges`) knows each point's own
  // chord fraction, and the loading is read there: the lower panel starts
  // at the intake's rear lip, 5.5% of chord back on the default wing, where
  // the panel's own fraction says 0 and the loading would have been read at
  // the nose. The transitions stay the panel's own, from its two ends.
  const stations = panel.stations?.left?.length === n ? panel.stations.left : null;

  for (let i = 0; i < n; i++) {
    const t = chordFraction(i);
    const width = Math.hypot(right[i][0] - left[i][0], right[i][1] - left[i][1]);

    let scale;
    if (pressure) {
      // Pressure difference at this chord station, interpolated from the
      // loading, and the excess the cloth needs to take up the arc.
      const dp = Math.abs(interpolateCp(pressure.loading, stations ? stations[i] : t))
        * pressure.dynamicPressurePa;
      const b = billowFromPressure({
        spacingM: Math.max(width, 1e-6),
        pressurePa: dp,
        tensionNPerM: pressure.tensionNPerM,
      });
      // Pressure sets the magnitude; the transition profile still sets the
      // boundary conditions.
      //
      // Applied on its own, the pressure model puts its peak billow at 0%
      // chord, because that is where suction peaks. But the panel is *seamed*
      // at the leading edge and again at the trailing edge, so the cloth is
      // held there and cannot bulge however hard the air pulls. The
      // transitions exist for exactly that, and bypassing them produced a
      // physically impossible shape.
      const boundary = wideningProfile(t, transitions);
      const applied = b.excessRatio * boundary;
      excesses.push(applied);
      scale = applied / 2;
    } else {
      scale = wideningProfile(t, transitions) * half;
      excesses.push(scale * 2);
    }

    const push = width * scale;

    // Unit vector from left seam to right seam at this station.
    const ux = width > 1e-12 ? (right[i][0] - left[i][0]) / width : 1;
    const uy = width > 1e-12 ? (right[i][1] - left[i][1]) / width : 0;

    outL.push([left[i][0] - ux * push, left[i][1] - uy * push]);
    outR.push([right[i][0] + ux * push, right[i][1] + uy * push]);
  }

  return {
    left: outL,
    right: outR,
    seamLengths: panel.seamLengths,
    ...(panel.stations ? { stations: panel.stations } : {}),
    ovalized: true,
    // What was actually applied, so a flat amount and a pressure-derived one
    // can be compared rather than assumed equivalent.
    source: pressure ? 'pressure' : 'flat',
    excessRatios: excesses,
    meanExcess: excesses.reduce((a, b) => a + b, 0) / excesses.length,
    maxExcess: Math.max(...excesses),
  };
}

/** Pressure coefficient at a chord fraction, linearly between stations. */
function interpolateCp(loading, t) {
  const st = (loading.stations ?? loading)
    .map((s) => ({ x: s.x ?? s.chordFraction, cp: s.deltaCp ?? s.cp ?? 0 }))
    .sort((a, b) => a.x - b.x);
  if (!st.length) return 0;
  if (t <= st[0].x) return st[0].cp;
  if (t >= st[st.length - 1].x) return st[st.length - 1].cp;
  for (let i = 1; i < st.length; i++) {
    if (t <= st[i].x) {
      const f = (t - st[i - 1].x) / (st[i].x - st[i - 1].x);
      return st[i - 1].cp + f * (st[i].cp - st[i - 1].cp);
    }
  }
  return st[st.length - 1].cp;
}

/**
 * Seam-length mismatch around the leading edge (handbook 6.3).
 * Two curvatures meet there — the billow and the LE curve itself — and the
 * resulting surface is not developable. The handbook's fix is deliberate
 * micro-gathering where the top panel meets the rib. This reports how much
 * length has to be absorbed, so it can be distributed rather than discovered
 * at the sewing machine.
 */
export function seamEasing(panelBefore, panelAfter) {
  const len = (p) => {
    let s = 0;
    for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return s;
  };
  return {
    leftDelta: len(panelAfter.left) - len(panelBefore.left),
    rightDelta: len(panelAfter.right) - len(panelBefore.right),
    leftPct: (len(panelAfter.left) / len(panelBefore.left) - 1) * 100,
    rightPct: (len(panelAfter.right) / len(panelBefore.right) - 1) * 100,
  };
}

/**
 * A developed panel's cutting line: each edge moved out by its own seam
 * allowance, as a cutting file gives them — the sides, sewn to the ribs; the
 * front end, at the intake; the trailing-edge end (LEparagliding's section
 * 6, OpenGlider's allowances by cut) — every point of a side along the mean
 * of its segments' normals, and each corner where two edges meet mitred.
 *
 * Or the front end hemmed (`hem`), as OpenGlider's `FoldedCut` cuts the
 * entry: folded twice, `front` wide each time. A hem lies flat only if the
 * cloth folded over is the mirror of the panel's own about the fold, so the
 * cut line beyond it is each side's cutting line mirrored about the fold,
 * then the same again as it is: folded twice, the hem's edges lie on the
 * sides'. An allowance carried straight on past the fold folds over to lie
 * off the side's line by twice its depth times the sine of how far from
 * square the side meets the fold: 2 mm for a 20 mm allowance on a side
 * leaning 3 degrees.
 *
 * This replaced a uniform allowance, each side pushed out across the panel
 * and the ends carried on along it: one figure for every edge, and no hem.
 *
 * Returns `{ left, right }`, front end first as the panel's are, so its
 * outline is the left and the right reversed; with a hem, `hem` counts the
 * points at the front of each that are the hem's, and the rest is the side.
 */
export function cutOutline(panel, { side = 10, front = side, back = side, hem = false } = {}) {
  const Lp = panel.left;
  const Rp = panel.right;
  const n = Lp.length;
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
  const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
  const unit = (v) => { const m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m]; };
  const perp = (v) => [-v[1], v[0]];
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m = n >> 1;

  // A side moved out by `d`, away from the other side.
  const offsetSide = (P, other, d) => {
    if (!d) return P.map((p) => p.slice());
    const normals = [];
    for (let i = 0; i < n - 1; i++) normals.push(perp(unit(sub(P[i + 1], P[i]))));
    const k = Math.min(m, n - 2);
    const sign = dot(normals[k], sub(other[k + 1], P[k + 1])) > 0 ? -1 : 1;
    return P.map((p, i) => {
      const a = normals[Math.max(0, i - 1)];
      const b = normals[Math.min(n - 2, i)];
      const bis = unit([a[0] + b[0], a[1] + b[1]]);
      const reach = d / Math.max(dot(bis, b), 0.4);
      return add(p, bis, sign * reach / 1000);
    });
  };
  // Where the line through p along v crosses the line through q along w.
  const meet = (p, v, q, w) => {
    const den = v[0] * w[1] - v[1] * w[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((q[0] - p[0]) * w[1] - (q[1] - p[1]) * w[0]) / den;
    return add(p, v, t);
  };
  // An end of the panel, as a line, and its outward normal: away from the
  // panel's own body beside it.
  const endLine = (a, b, inner) => {
    const along = unit(sub(b, a));
    let nrm = perp(along);
    if (dot(nrm, sub(inner, mid(a, b))) > 0) nrm = [-nrm[0], -nrm[1]];
    return { at: a, along, nrm };
  };

  const L = offsetSide(Lp, Rp, side);
  const R = offsetSide(Rp, Lp, side);
  const head = endLine(Lp[0], Rp[0], mid(Lp[1], Rp[1]));
  const tail = endLine(Lp[n - 1], Rp[n - 1], mid(Lp[n - 2], Rp[n - 2]));
  // A side's end carried to the end line moved out by `d`: the mitre.
  const corner = (S, first, line, d) => {
    const p = first ? S[0] : S[n - 1];
    const q = first ? S[1] : S[n - 2];
    return meet(p, sub(q, p), add(line.at, line.nrm, d / 1000), line.along) ?? add(p, line.nrm, d / 1000);
  };

  const backL = corner(L, false, tail, back);
  const backR = corner(R, false, tail, back);
  if (!hem || !(front > 0)) {
    const left = [corner(L, true, head, front), ...L.slice(1, n - 1), backL];
    const right = [corner(R, true, head, front), ...R.slice(1, n - 1), backR];
    return { left, right, allowanceMM: { side, front, back }, hem: null };
  }

  // The hem. Its fold is the panel's front end; `h` deep each fold.
  const h = front / 1000;
  const depth = (p) => -dot(sub(p, head.at), head.nrm);   // into the panel
  const hemOf = (S) => {
    const atFold = meet(S[0], sub(S[1], S[0]), head.at, head.along) ?? S[0];
    // The side's cutting line from the fold inward: from its first point
    // inside the fold, which is its second unless the first segment is
    // shorter than the side's own offset.
    let first = 1;
    while (first < n - 2 && depth(S[first]) <= 1e-12) first++;
    const sideLine = [atFold, ...S.slice(first, n - 1)];
    // The piece of it the hem mirrors: from the fold to `h` inside.
    const piece = [atFold];
    for (let i = first; i < n; i++) {
      const prev = piece[piece.length - 1];
      if (depth(S[i]) >= h) {
        const g = (h - depth(prev)) / ((depth(S[i]) - depth(prev)) || 1);
        piece.push(add(prev, sub(S[i], prev), g));
        break;
      }
      piece.push(S[i]);
    }
    // Folded over once: mirrored about the fold. Folded again: as it is,
    // moved out by two depths. Out from the fold, then reversed so that
    // the side reads front end first.
    const once = piece.map((p) => add(p, head.nrm, 2 * depth(p)));
    const twice = piece.slice().reverse().map((p) => add(p, head.nrm, 2 * h));
    return { points: once.concat(twice.slice(1)).reverse(), side: sideLine };
  };
  const hl = hemOf(L);
  const hr = hemOf(R);
  const left = [...hl.points.slice(0, -1), ...hl.side, backL];
  const right = [...hr.points.slice(0, -1), ...hr.side, backR];
  return {
    left,
    right,
    allowanceMM: { side, front, back },
    hem: { left: hl.points.length - 1, right: hr.points.length - 1, folds: 2, depthMM: front },
  };
}

/* ------------------------------------------------ billow from pressure -- */

/**
 * How much a panel actually bulges, from pressure and tension.
 *
 * `applyOvalization` takes the billow as a flat 6% — a design input, applied
 * uniformly, with a chordwise shape profile bolted on. That has been one of
 * the oldest assumptions in this project, and it is not how a sail behaves.
 *
 * ---------------------------------------------------------------------------
 * The physics
 * ---------------------------------------------------------------------------
 * A strip of fabric spanning between two ribs, with a pressure difference
 * across it, takes up a circular arc. The balance is the membrane equation:
 *
 *     R = T / dp
 *
 * where `T` is the tension per unit length carried by the cloth and `dp` the
 * pressure difference. Given the rib spacing `s`, the chord of that arc, the
 * bulge height follows from the geometry of a circular segment:
 *
 *     h = R - sqrt(R^2 - (s/2)^2)
 *
 * and the extra cloth the arc needs over the straight line is the difference
 * between the arc length and the chord.
 *
 * Three things fall out that a flat percentage cannot give:
 *
 *   - **Billow varies along the chord**, because `dp` does. The suction peak
 *     near the leading edge pulls far harder than the trailing edge.
 *   - **Billow varies along the span**, because rib spacing does — and it
 *     grows with the *square* of the spacing, so a wing with fewer cells
 *     bulges disproportionately more.
 *   - **It scales with flight state.** At speed the dynamic pressure rises
 *     and the sail pulls tighter over the same cloth.
 *
 * The cut width is still a design decision — a panel is cut to a chosen
 * excess and the air decides the shape. What this gives is the excess that
 * *matches* the shape the pressure wants, so the sail is neither slack nor
 * straining the seams.
 */

/** Bulge height and excess width for one strip. */
export function billowFromPressure({
  spacingM, pressurePa, tensionNPerM, maxRatio = 0.25,
}) {
  if (!(spacingM > 0)) throw new Error('billowFromPressure needs a rib spacing');
  if (!(pressurePa > 0)) {
    // No pressure difference, no bulge. Flat is the correct answer, not an
    // infinite radius dressed up as one.
    return {
      radiusM: Infinity, heightM: 0, excessRatio: 0, halfAngleRad: 0, flat: true,
    };
  }

  const R = tensionNPerM / pressurePa;
  const half = spacingM / 2;

  // A radius smaller than half the spacing cannot span it: the cloth would
  // have to close on itself. That is a real limit, not a rounding case.
  if (R <= half) {
    return {
      radiusM: R,
      heightM: half,
      excessRatio: maxRatio,
      halfAngleRad: Math.PI / 2,
      overLimit: true,
      note: 'the tension cannot hold this spacing against this pressure; the '
        + 'cloth would need to bulge past a half-circle',
    };
  }

  const height = R - Math.sqrt(R * R - half * half);
  const halfAngle = Math.asin(half / R);
  const arc = 2 * R * halfAngle;
  const excess = (arc - spacingM) / spacingM;

  return {
    radiusM: R,
    heightM: height,
    arcLengthM: arc,
    halfAngleRad: halfAngle,
    // The extra cloth the bulge needs, as a fraction of the flat spacing —
    // directly comparable with the flat 6%.
    excessRatio: excess,
    heightRatio: height / spacingM,
    flat: false,
  };
}

/**
 * The billow a whole panel wants, chordwise.
 *
 * Takes the chordwise pressure distribution the project already computes and
 * returns the excess at each station, so the panel can be cut to the shape the
 * air will make rather than to a constant.
 */
export function panelBillowProfile({
  spacingM, loading, tensionNPerM, dynamicPressurePa,
}) {
  const stations = loading.stations ?? loading;
  const out = stations.map((st) => {
    // Pressure difference across the surface, from the local coefficient.
    const dp = Math.abs(st.deltaCp ?? st.cp ?? 0) * dynamicPressurePa;
    const b = billowFromPressure({ spacingM, pressurePa: dp, tensionNPerM });
    return {
      chordFraction: st.x ?? st.chordFraction,
      pressurePa: dp,
      excessRatio: b.excessRatio,
      heightM: b.heightM,
      overLimit: !!b.overLimit,
    };
  });

  const ratios = out.map((o) => o.excessRatio);
  return {
    stations: out,
    meanExcess: ratios.reduce((a, b) => a + b, 0) / ratios.length,
    maxExcess: Math.max(...ratios),
    // Where the sail pulls hardest, which is where the seams are worked.
    peakAt: out.reduce((m, o) => (o.excessRatio > m.excessRatio ? o : m), out[0]),
    anyOverLimit: out.some((o) => o.overLimit),
  };
}

/**
 * What tension does a chosen billow imply?
 *
 * The inversion matters more than the forward calculation, because the flat
 * 6% is what this project and the handbook have both been using, and nobody
 * has asked what it assumes.
 *
 * Solved by bisection on the radius, since the excess grows monotonically as
 * the radius falls.
 */
export function tensionForBillow({
  spacingM, excessRatio, pressurePa, tolerance = 1e-10, maxIterations = 200,
}) {
  if (!(excessRatio > 0)) {
    return { tensionNPerM: Infinity, radiusM: Infinity, heightM: 0, flat: true };
  }
  const half = spacingM / 2;
  const excessAt = (R) => {
    const a = Math.asin(Math.min(1, half / R));
    return (2 * R * a - spacingM) / spacingM;
  };

  // A radius just above half the spacing gives the largest reachable excess.
  let lo = half * (1 + 1e-9);
  let hi = spacingM * 1e6;
  if (excessAt(lo) < excessRatio) {
    return {
      tensionNPerM: null, radiusM: null, heightM: null,
      unreachable: true,
      maxExcessRatio: excessAt(lo),
      note: 'no radius gives that much excess: the cloth cannot bulge past a '
        + 'half-circle between the ribs',
    };
  }

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    if (excessAt(mid) > excessRatio) lo = mid; else hi = mid;
    if (hi - lo < tolerance * spacingM) break;
  }
  const R = (lo + hi) / 2;
  return {
    radiusM: R,
    tensionNPerM: R * pressurePa,
    heightM: R - Math.sqrt(Math.max(0, R * R - half * half)),
    heightRatio: (R - Math.sqrt(Math.max(0, R * R - half * half))) / spacingM,
    excessRatio,
    flat: false,
  };
}
