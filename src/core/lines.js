/* lines.js — Chapter 8: line geometry.
 *
 * The handbook's method, in one sentence: a line starting at point 1 and
 * branching to N anchor points on the canopy runs along the direction from 1
 * toward G, where G is the centre of gravity of those N anchor points. The
 * branch point 2 is placed on that 1-G segment, at a distance chosen by the
 * designer — near 1 gives long branches, near G gives short ones.
 *
 * Applying that recursively from the riser down to the canopy produces the
 * whole cascade. The handbook's author is candid that this is an empirical
 * intuition rather than a proved result, but that it works in practice.
 *
 * Load weighting (handbook cases 0 and 1):
 *   case 0  every anchor carries the same load — plain arithmetic centroid
 *   case 1  anchors carry the published row shares (A 35, B 35, C 20, D 10)
 *           scaled by the chord of the rib they sit on, so bigger sections
 *           take more load. This is the more realistic of the two.
 */

import { ribSurfacePoint } from './wing3d.js';

const DEFAULT_ROW_SHARES = { A: 0.35, B: 0.35, C: 0.20, D: 0.10 };

/**
 * Anchor points on the canopy, derived from the built wing.
 * Anchors sit on the lower surface at the chord fractions carried on the
 * airfoil (handbook 2.7).
 */
export function canopyAnchors(wing, airfoil, { rows = ['A', 'B', 'C', 'D'], everyNthRib = 2 } = {}) {
  const anchors = [];
  wing.ribs.forEach((rib, i) => {
    if (i % everyNthRib !== 0) return;
    for (const row of rows) {
      const frac = airfoil.anchors?.[row];
      if (frac == null) continue;
      anchors.push({
        row,
        ribIndex: i,
        station: rib.station,
        chord: rib.chord,
        point: ribSurfacePoint(rib, 'lower', frac),
      });
    }
  });
  return anchors;
}

/** Load carried by one anchor, under the chosen weighting case. */
export function anchorLoad(anchor, mode, rowShares = DEFAULT_ROW_SHARES) {
  if (mode === 0) return 1;
  return (rowShares[anchor.row] ?? 0.25) * anchor.chord;
}

/** Weighted centroid G of a set of anchors. */
export function centroid(anchors, mode, rowShares) {
  let wx = 0, wy = 0, wz = 0, wsum = 0;
  for (const a of anchors) {
    const w = anchorLoad(a, mode, rowShares);
    wx += a.point[0] * w;
    wy += a.point[1] * w;
    wz += a.point[2] * w;
    wsum += w;
  }
  return [wx / wsum, wy / wsum, wz / wsum];
}

/**
 * Build the cascade.
 *
 * @param {object[]} anchors  canopy anchor points
 * @param {number[]} origin   riser attachment point (maillon), 3D
 * @param {object} opts
 * @param {number[]} opts.levels  fraction along 1->G at which each level
 *                                branches, outermost level first
 * @param {(a)=>string} opts.groupBy  how anchors are split at each level
 */
export function buildCascade(anchors, origin, {
  levels = [0.55, 0.6],
  mode = 1,
  rowShares = DEFAULT_ROW_SHARES,
} = {}) {
  const segments = [];

  // Level 0: split by row (A, B, C, D risers).
  const byRow = groupBy(anchors, (a) => a.row);

  for (const [row, rowAnchors] of Object.entries(byRow)) {
    const G0 = centroid(rowAnchors, mode, rowShares);
    const P1 = origin;
    const P2 = along(P1, G0, levels[0] ?? 0.55);
    segments.push({ level: 0, row, from: P1, to: P2, count: rowAnchors.length });

    // Level 1: split that row's anchors into spanwise groups.
    const groups = splitSpanwise(rowAnchors, guessGroupCount(rowAnchors.length));
    for (const g of groups) {
      if (g.length === 1) {
        segments.push({ level: 1, row, from: P2, to: g[0].point, count: 1, terminal: true, anchor: g[0] });
        continue;
      }
      const G1 = centroid(g, mode, rowShares);
      const P3 = along(P2, G1, levels[1] ?? 0.6);
      segments.push({ level: 1, row, from: P2, to: P3, count: g.length });
      for (const a of g) {
        segments.push({ level: 2, row, from: P3, to: a.point, count: 1, terminal: true, anchor: a });
      }
    }
  }

  return {
    segments,
    totalLength: segments.reduce((s, seg) => s + dist(seg.from, seg.to), 0),
    lengths: segments.map((s) => ({
      level: s.level,
      row: s.row,
      length: dist(s.from, s.to),
      terminal: !!s.terminal,
      ribIndex: s.anchor?.ribIndex,
    })),
  };
}

/**
 * Brake cascade (handbook 8.2). Same construction, run from the brake handle
 * to anchors on the trailing edge, with an optional non-uniform distribution
 * that lengthens branches in chosen spanwise zones so braking bites in some
 * areas before others.
 */
export function brakeAnchors(wing, { everyNthRib = 2 } = {}) {
  const out = [];
  wing.ribs.forEach((rib, i) => {
    if (i % everyNthRib !== 0) return;
    out.push({
      row: 'BR',
      ribIndex: i,
      station: rib.station,
      chord: rib.chord,
      point: rib.lower[rib.lower.length - 1].slice(),
    });
  });
  return out;
}

/**
 * Apply a brake distribution: extra length in centimetres added to the branch
 * reaching each station, as a function of normalised span position.
 */
export function applyBrakeDistribution(cascade, distributionFn, halfSpan) {
  return cascade.lengths.map((seg) => {
    if (!seg.terminal) return seg;
    const t = (seg.station ?? 0) / halfSpan;
    return { ...seg, length: seg.length + (distributionFn(t) || 0) / 100 };
  });
}

/** Total line length by row — the number that decides line drag and cost. */
export function lineBudget(cascade) {
  const byRow = {};
  for (const s of cascade.lengths) {
    byRow[s.row] = (byRow[s.row] || 0) + s.length;
  }
  return { byRow, total: cascade.totalLength };
}

// helpers -------------------------------------------------------------------

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const along = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function groupBy(arr, fn) {
  const out = {};
  for (const x of arr) (out[fn(x)] ||= []).push(x);
  return out;
}

function splitSpanwise(anchors, n) {
  const sorted = anchors.slice().sort((a, b) => a.station - b.station);
  const per = Math.ceil(sorted.length / n);
  const out = [];
  for (let i = 0; i < sorted.length; i += per) out.push(sorted.slice(i, i + per));
  return out;
}

function guessGroupCount(n) {
  if (n <= 2) return 1;
  if (n <= 6) return 2;
  return Math.round(Math.sqrt(n));
}
