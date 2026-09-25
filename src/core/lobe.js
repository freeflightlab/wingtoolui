/* lobe.js — Chapter 3: Main lobe ("voute").
 *
 * The lobe is the front view of the canopy: the reference line of the flat
 * planform, bent in the YZ plane. The flat half-span is laid along the arc,
 * so arc length on the lobe equals spanwise station on the flat planform.
 * That is what makes the wing developable back to flat panels later.
 *
 * Each lobe type is defined as a curve sampled densely, then re-parameterised
 * by arc length. Sampling first and inverting numerically keeps every lobe
 * type — circle, ellipse, bionic, or an imported point list — on one code
 * path, and avoids closed-form arc length for the ellipse, which has none.
 *
 * Output at a station: position (y, z) and dihedral angle beta, the angle of
 * the local tangent from horizontal. beta is what rotates each rib into the
 * plane normal to the lobe (handbook 3.4, step 2).
 */

import { cumulativeLength, pointAtLength, bisect, deg } from './num.js';

const SAMPLES = 2000;

function buildFromSampler(sampleFn, halfSpan) {
  // Sample generously past the needed arc length, then trim by arc length.
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) pts.push(sampleFn(i / SAMPLES));
  const cum = cumulativeLength(pts);
  const total = cum[cum.length - 1];
  if (total < halfSpan) {
    throw new Error(
      `Arc is ${total.toFixed(2)} m long but the flat half span is ${halfSpan.toFixed(2)} m. `
      + 'The flat span is laid along the arc, so the arc must be at least that long — '
      + 'raise the arrow, or widen the arc.',
    );
  }
  return {
    /** Point on the lobe at arc length s from the centre. */
    at(s) {
      const p = pointAtLength(pts, cum, s);
      const h = Math.max(1e-6, total * 1e-4);
      const p1 = pointAtLength(pts, cum, Math.max(0, s - h));
      const p2 = pointAtLength(pts, cum, Math.min(total, s + h));
      const beta = Math.atan2(-(p2[1] - p1[1]), p2[0] - p1[0]);
      return { y: p[0], z: p[1], beta };
    },
    totalLength: total,
    samples: pts,
  };
}

/**
 * @param {object} spec
 * @param {'circle'|'ellipse'|'bionic'|'discrete'} spec.type
 * @param {number} halfSpan  flat half span (m) — arc length to be laid on the lobe
 */
export function buildLobe(spec, halfSpan) {
  const t = spec.type || 'circle';

  // The projected ratio has to describe an arc that exists.
  //
  // At 1.0 the wing is flat — there is no arc, and the solver looking for a
  // radius that produces it fails with `bisect: root is not bracketed`, which
  // tells the person nothing about what they typed. At very low values the
  // wing would have to fold past a semicircle.
  //
  // A cryptic internal message from a legitimate-looking input is the kind of
  // thing that makes a tool feel unfinished, and the fix is to say what the
  // limit is rather than to widen it.
  if (spec.projectedRatio != null && spec.radius == null) {
    const r = spec.projectedRatio;
    // 0.64 is where the solver actually stops finding a radius, measured by
    // sweeping it rather than guessed. My first version said 0.3 on the
    // reasoning that a semicircle is the limit; the arithmetic gives up well
    // before the geometry does, and a bound that admits values the code
    // cannot handle is no bound at all.
    if (!(r >= 0.64 && r <= 0.99)) {
      throw new Error(`buildLobe: projected ratio must be between 0.64 and `
        + `0.99 (got ${r}). At 1 the wing is flat and has no arc to solve; `
        + 'below 0.64 no radius produces that ratio on this half-span.');
    }
  }
  if (!(halfSpan > 0)) {
    throw new Error(`buildLobe needs a positive half-span (got ${halfSpan})`);
  }

  if (t === 'circle') {
    // Handbook 3.1(a): single circle, centre above the mid-point of the
    // main carabiners. Radius is given directly, or derived from the
    // desired ratio of projected span to flat span.
    const R = spec.radius ?? radiusForProjectedRatio(halfSpan, spec.projectedRatio ?? 0.88);
    const maxAngle = Math.min(Math.PI / 2, (halfSpan / R) * 1.2);
    return buildFromSampler(
      (u) => {
        const phi = u * maxAngle;
        return [R * Math.sin(phi), -R * (1 - Math.cos(phi))];
      },
      halfSpan,
    );
  }

  if (t === 'ellipse') {
    // Handbook 3.1(c): semi-axes a and b, 2a the projected span and b the
    // total sail arrow (rise from tip to centre).
    //
    // Both are accepted as ratios of the flat half span as well as absolute
    // metres. Ratios are what the interface uses, because absolute semi-axes
    // are a trap: the flat span is laid *along* the arc, so a designer who
    // lengthens the span leaves the arc too short to carry it and the model
    // stops building. Expressed as fractions the arc scales with the wing.
    const a = spec.aRatio != null ? spec.aRatio * halfSpan : (spec.a ?? halfSpan * 0.88);
    const b = spec.bRatio != null ? spec.bRatio * halfSpan : (spec.b ?? halfSpan * 0.42);
    return buildFromSampler(
      (u) => {
        const phi = (u * Math.PI) / 2;
        return [a * Math.sin(phi), -b * (1 - Math.cos(phi))];
      },
      halfSpan,
    );
  }

  if (t === 'bionic') {
    // Handbook 3.1(d): flatter centre, tips turned up more sharply.
    // Modelled as an ellipse whose curvature is redistributed by an exponent:
    // exponent > 1 flattens the centre and tightens the tip.
    const a = spec.aRatio != null ? spec.aRatio * halfSpan : (spec.a ?? halfSpan * 0.88);
    const b = spec.bRatio != null ? spec.bRatio * halfSpan : (spec.b ?? halfSpan * 0.42);
    const n = spec.exponent ?? 1.6;
    return buildFromSampler(
      (u) => {
        const phi = (u * Math.PI) / 2;
        const sy = Math.sin(phi);
        // (1-cos) runs 0..1 over the quarter turn, so raising it to n keeps
        // the tip at -b while flattening the centre and tightening the tip.
        return [a * sy, -b * Math.pow(1 - Math.cos(phi), n)];
      },
      halfSpan,
    );
  }

  if (t === 'discrete') {
    // Handbook 3.1(e): any symmetric form given as (y,z) coordinates.
    const rows = spec.points;
    return buildFromSampler((u) => {
      const idx = u * (rows.length - 1);
      const i = Math.min(rows.length - 2, Math.floor(idx));
      const f = idx - i;
      return [
        rows[i][0] + f * (rows[i + 1][0] - rows[i][0]),
        rows[i][1] + f * (rows[i + 1][1] - rows[i][1]),
      ];
    }, halfSpan);
  }

  throw new Error(`Unknown lobe type: ${t}`);
}

/**
 * Smallest arrow ratio that still gives an arc long enough to carry the flat
 * half span, for a given width ratio. Used to bound the interface's arrow
 * control so an unbuildable arc cannot be dialled in.
 */
export function minArrowRatio(aRatio, type = 'ellipse', exponent = 1.6) {
  const feasible = (bRatio) => {
    try {
      buildLobe({ type, aRatio, bRatio, exponent }, 1);
      return true;
    } catch {
      return false;
    }
  };
  if (feasible(0.01)) return 0.01;
  let lo = 0.01;
  let hi = 4;
  if (!feasible(hi)) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (feasible(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

/** Circle radius that turns a flat half-span into a given projected fraction. */
export function radiusForProjectedRatio(halfSpan, ratio) {
  // Projected half span = R * sin(halfSpan/R). Solve R*sin(s/R)/s = ratio.
  const f = (R) => (R * Math.sin(halfSpan / R)) / halfSpan - ratio;
  return bisect(f, halfSpan * 0.55, halfSpan * 400);
}

/** Front-view metrics: projected span, arrow (rise), tip dihedral. */
export function lobeMetrics(lobe, halfSpan) {
  const tip = lobe.at(halfSpan);
  const root = lobe.at(0);
  return {
    projectedSpan: 2 * tip.y,
    arrow: root.z - tip.z,
    tipDihedralDeg: deg(tip.beta),
    flatSpan: 2 * halfSpan,
    spanRatio: (2 * tip.y) / (2 * halfSpan),
  };
}

/**
 * Washin distribution (handbook 3.3). Positive angles at the tip, centre at 0.
 * The handbook notes 4-5 degrees total is usual, distributed either in
 * proportion to distance from the centre or in proportion to chord.
 */
export function washinAt(y, halfSpan, { total = 4.5, mode = 'linear', planform } = {}) {
  const t = Math.abs(y) / halfSpan;
  if (mode === 'chord' && planform) {
    const cRoot = planform.chord(0);
    const cTip = planform.chord(halfSpan);
    const c = planform.chord(y);
    const f = (cRoot - c) / (cRoot - cTip || 1);
    return total * f;
  }
  if (mode === 'quadratic') return total * t * t;
  return total * t;
}
