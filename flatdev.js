/* flatdev.js — Chapter 5: flat development of panels.
 *
 * Direct implementation of the Laboratori d'envol method and its FORTRAN
 * reference subroutine (handbook 5.3, 5.4).
 *
 * Two consecutive ribs give two polylines, L and R, of N points each.
 * Take points i and i+1 on both: they form a quadrilateral that is very
 * nearly planar because the points are close together. Split it on a
 * diagonal into two triangles, whose side lengths are known exactly from the
 * 3D coordinates, and lay those triangles flat, hinged on the shared
 * diagonal. Step along the surface repeating this, carrying the running
 * origin and angle forward, and the whole panel unrolls.
 *
 * Naming follows the handbook: for the quadrilateral L1-R1-R2-L2,
 *   a = |L1 R1|   b = |L1 R2|   c = |R1 R2|
 *   d = |L2 R1|   e = |L1 L2|   f = |L2 R2|
 * with a1R/a2R/hR describing triangle L1-R1-R2 and a1L/a2L/hL triangle
 * L1-R1-L2.
 *
 * One deliberate departure from the published FORTRAN: the running angle uses
 * atan2 rather than atan. The original loses the quadrant and flips the panel
 * whenever the step direction crosses vertical, which happens on strongly
 * arced wings. Results are identical wherever the original was well behaved.
 */

import { dist3 } from './num.js';

/**
 * Unroll one panel between two rib polylines.
 * @param {number[][]} L left rib polyline, N 3D points
 * @param {number[][]} R right rib polyline, N 3D points
 * @returns {{left: number[][], right: number[][], seamLengths: object}}
 */
export function developPanel(L, R) {
  if (L.length !== R.length) throw new Error('Rib polylines must have equal point counts.');
  const n = L.length;

  const left = [];
  const right = [];

  let x0 = 0;
  let y0 = 0;
  let theta = 0;
  let maxClosureGap = 0;

  for (let i = 0; i < n - 1; i++) {
    const a = dist3(L[i], R[i]);
    if (a < 1e-12) throw new Error('Coincident rib points — panel width is zero.');

    // The handbook derives a1/a2/h from the six edge lengths via the law of
    // cosines: a2r = (a^2 - b^2 + c^2) / (2a), and so on. That form is exact
    // in real arithmetic but ill-conditioned in floating point when the ribs
    // are close together: a^2 becomes tiny while b^2 and c^2 stay large, so
    // the numerator is a difference of nearly equal numbers, and dividing by
    // the small 2a amplifies whatever error survives. On a 12-cell wing that
    // already showed up as ~10 micrometres of seam-length drift.
    //
    // These are the same quantities written as a projection and a
    // perpendicular distance, computed directly from the vectors. Both are
    // algebraically identical to the handbook's expressions and neither
    // subtracts nearly equal quantities.
    const ax = R[i][0] - L[i][0];
    const ay = R[i][1] - L[i][1];
    const az = R[i][2] - L[i][2];

    // Triangle L1-R1-L2: project L1->L2 onto L1->R1.
    const lx = L[i + 1][0] - L[i][0];
    const ly = L[i + 1][1] - L[i][1];
    const lz = L[i + 1][2] - L[i][2];
    const a1l = (ax * lx + ay * ly + az * lz) / a;
    const hl = crossNorm(ax, ay, az, lx, ly, lz) / a;

    // Triangle L1-R1-R2: project R1->R2 onto R1->L1, measured back from R1.
    const rx = R[i + 1][0] - R[i][0];
    const ry = R[i + 1][1] - R[i][1];
    const rz = R[i + 1][2] - R[i][2];
    const a2r = -(ax * rx + ay * ry + az * rz) / a;
    const a1r = a - a2r;
    const hr = crossNorm(ax, ay, az, rx, ry, rz) / a;

    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    const l1 = [x0, y0];
    const r1 = [a * ct + x0, a * st + y0];
    const l2 = [a1l * ct - hl * st + x0, a1l * st + hl * ct + y0];
    const r2 = [a1r * ct - hr * st + x0, a1r * st + hr * ct + y0];

    if (i === 0) { left.push(l1); right.push(r1); }
    else {
      // r1 of this step and r2 of the previous step are images of the same
      // 3D point, but the method does not force them together: each step
      // preserves a, c, e and the two diagonals b and d, and lets the fourth
      // side f absorb the fact that the quadrilateral is not planar. So the
      // right-hand seam can open by a hair at every station while the
      // left-hand seam is exact by construction. Track the worst gap — it is
      // a direct measure of how non-developable the surface is here.
      maxClosureGap = Math.max(maxClosureGap,
        Math.hypot(r1[0] - right[right.length - 1][0], r1[1] - right[right.length - 1][1]));
    }
    left.push(l2);
    right.push(r2);

    x0 = l2[0];
    y0 = l2[1];
    theta = Math.atan2(r2[1] - l2[1], r2[0] - l2[0]);
  }

  return {
    left,
    right,
    maxClosureGap,
    seamLengths: {
      left: polyLength(left),
      right: polyLength(right),
      leftSource: polyLength3(L),
      rightSource: polyLength3(R),
    },
  };
}

/**
 * Develop every panel of the half wing, upper and lower surfaces.
 * Panel k lies between rib k and rib k+1.
 */
export function developWing(wing) {
  const out = [];
  for (let i = 0; i < wing.ribs.length - 1; i++) {
    const Lr = wing.ribs[i];
    const Rr = wing.ribs[i + 1];
    out.push({
      cell: i + 1,
      surface: 'upper',
      panel: developPanel(Lr.upper, Rr.upper),
    });
    out.push({
      cell: i + 1,
      surface: 'lower',
      panel: developPanel(Lr.lower, Rr.lower),
    });
  }
  return out;
}

/**
 * Distortion check: how far the surface is from developable.
 *
 * Each step preserves five of the quadrilateral's six lengths — the two seam
 * segments, the width, and *both* diagonals. What it cannot preserve is the
 * fourth side, `|L2 R2|`, and that residual is the entire measure of
 * non-developability available here.
 *
 * An earlier version of this compared the diagonal `|L1 R2|` before and after
 * flattening. That diagonal is one of the five the construction preserves
 * exactly, so the comparison was tautological: it returned machine precision
 * on every wing, at every rib spacing, and on surfaces that are plainly not
 * developable. It looked like a clean bill of health and was measuring
 * nothing. The status line reporting "worst panel distortion" was reporting a
 * number that could not move.
 *
 * Measuring the fourth side instead gives a figure that responds to the
 * geometry: it grows with rib spacing, with twist between neighbouring ribs,
 * and with arc — which is exactly what non-developability should do.
 */
export function developmentError(L, R) {
  const dev = developPanel(L, R);
  let worst = 0;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < L.length - 1; i++) {
    // The one length the construction has to give up.
    const trueF = dist3(L[i + 1], R[i + 1]);
    const l2 = dev.left[i + 1];
    const r2 = dev.right[i + 1];
    if (!l2 || !r2) continue;
    const flatF = Math.hypot(r2[0] - l2[0], r2[1] - l2[1]);
    const rel = Math.abs(flatF - trueF) / (trueF || 1);
    worst = Math.max(worst, rel);
    sum += rel;
    count++;
  }

  return {
    worstRelative: worst,
    meanRelative: count ? sum / count : 0,
    // Also reported in metres, because a relative figure on a short panel
    // edge can look alarming while being irrelevant to a sewing machine.
    worstAbsoluteM: worst * (L.length > 1 ? dist3(L[L.length - 1], R[R.length - 1]) : 0),
  };
}

/** Magnitude of the cross product of two 3D vectors. */
function crossNorm(ax, ay, az, bx, by, bz) {
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
}

function polyLength(p) {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
}

function polyLength3(p) {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist3(p[i - 1], p[i]);
  return s;
}
