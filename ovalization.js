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
} = {}) {
  const { left, right } = panel;
  const n = left.length;
  const half = amount / 2;

  const outL = [];
  const outR = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const scale = wideningProfile(t, transitions) * half;
    const width = Math.hypot(right[i][0] - left[i][0], right[i][1] - left[i][1]);
    const push = width * scale;

    // Unit vector from left seam to right seam at this station.
    const ux = width > 1e-12 ? (right[i][0] - left[i][0]) / width : 1;
    const uy = width > 1e-12 ? (right[i][1] - left[i][1]) / width : 0;

    outL.push([left[i][0] - ux * push, left[i][1] - uy * push]);
    outR.push([right[i][0] + ux * push, right[i][1] + uy * push]);
  }

  return { left: outL, right: outR, seamLengths: panel.seamLengths, ovalized: true };
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

/** Add a uniform seam allowance around a developed panel outline. */
export function addSeamAllowance(panel, mm = 10) {
  const a = mm / 1000;
  const n = panel.left.length;
  const L = [];
  const R = [];
  for (let i = 0; i < n; i++) {
    const dx = panel.right[i][0] - panel.left[i][0];
    const dy = panel.right[i][1] - panel.left[i][1];
    const w = Math.hypot(dx, dy) || 1;
    L.push([panel.left[i][0] - (dx / w) * a, panel.left[i][1] - (dy / w) * a]);
    R.push([panel.right[i][0] + (dx / w) * a, panel.right[i][1] + (dy / w) * a]);
  }
  // Extend the ends along the seam direction too.
  const ext = (p, q) => {
    const dx = p[0] - q[0];
    const dy = p[1] - q[1];
    const m = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / m) * a, p[1] + (dy / m) * a];
  };
  L[0] = ext(L[0], L[1]); R[0] = ext(R[0], R[1]);
  L[n - 1] = ext(L[n - 1], L[n - 2]); R[n - 1] = ext(R[n - 1], R[n - 2]);
  return { left: L, right: R, allowanceMM: mm };
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
