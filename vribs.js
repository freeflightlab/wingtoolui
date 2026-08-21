/* vribs.js — diagonal ribs.
 *
 * Chapter 7 of the handbook is figures without text, so this is a
 * reconstruction from the drawings and from what the geometry has to do.
 *
 * --------------------------------------------------------------------------
 * Why they exist, and why this project already needed them
 * --------------------------------------------------------------------------
 * Every line attachment is a point of drag and a point of load. Modern wings
 * therefore attach lines to every second or third rib rather than to all of
 * them — the line plans in `lineplan.js` already do exactly this, with
 * `everyNthRib: 2`.
 *
 * That leaves a problem the line plan quietly assumed away. The ribs with no
 * line on them still carry lift, and it has to reach the lineset somehow. A
 * diagonal rib is what carries it: a triangular panel running from the
 * attachment point on a loaded rib, diagonally across the cell, to a line
 * along the upper surface of the unloaded rib beside it. The load spreads
 * from a line of fabric down to a point.
 *
 * So this is not an optional refinement. Without diagonals, a wing whose
 * lines attach every second rib has half its span hanging on nothing.
 *
 * --------------------------------------------------------------------------
 * The flat pattern is an exact cone development
 * --------------------------------------------------------------------------
 * A diagonal rib is a fan: one apex, and a base curve lying on the neighbouring
 * rib's surface. That is a cone, and a cone is developable — it flattens with
 * no distortion at all, unlike the wing's own panels.
 *
 * The development follows from that. Place the apex, and lay each base point
 * at its true distance from the apex, with the angle between successive base
 * points taken from the triangle they form:
 *
 *     cos(dphi) = (r_k^2 + r_k+1^2 - s^2) / (2 r_k r_k+1)
 *
 * with s the true distance between the two base points. Every radius and every
 * base segment then comes out exact, which is asserted rather than assumed.
 */

import { dist3 } from './num.js';

/**
 * Build the diagonal ribs for a wing.
 *
 * @param {object} o
 * @param {object} o.wing
 * @param {object} o.airfoil
 * @param {number[]} o.anchorRibs  indices of ribs that carry line attachments
 * @param {string[]} o.rows        which anchor rows get diagonals
 * @param {number} o.baseSpread    chordwise extent of the base, as a fraction
 *                                 of chord, centred on the anchor position
 * @param {number} o.points        points along the base curve
 */
export function buildVRibs({
  wing,
  airfoil,
  anchorRibs = null,
  rows = ['B', 'C'],
  baseSpread = 0.18,
  points = 12,
  surface = 'upper',
  maxReach = 1,
}) {
  const ribs = wing.ribs;
  const anchors = anchorRibs
    || ribs.map((_, i) => i).filter((i) => i % 2 === 0);
  const anchorSet = new Set(anchors);
  const fractions = airfoil.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };

  const out = [];

  for (const i of anchors) {
    for (const row of rows) {
      const frac = fractions[row];
      if (frac == null) continue;

      // Each unloaded neighbour needs its load carried to this rib.
      //
      // `maxReach` is how many cells a diagonal spans. One is the common case
      // and it is enough for attachments on every second rib. Attach every
      // third or fourth and a single-cell diagonal cannot reach the middle of
      // the gap — those ribs come back in `unsupportedRibs`, which is a real
      // constraint rather than a modelling limit: a wing rigged that way needs
      // longer diagonals, and this is where a designer finds that out.
      for (let reach = 1; reach <= maxReach; reach++) {
        for (const dir of [-1, +1]) {
          const j = i + dir * reach;
          if (j < 0 || j >= ribs.length) continue;
          if (anchorSet.has(j)) continue;    // that rib carries its own line
          // Do not reach across another attachment rib.
          let blocked = false;
          for (let step = 1; step < reach; step++) {
            if (anchorSet.has(i + dir * step)) blocked = true;
          }
          if (blocked) continue;

        const apex = pointAt(ribs[i].lower, frac);
        const base = [];
        for (let p = 0; p < points; p++) {
          const t = frac - baseSpread / 2 + (baseSpread * p) / (points - 1);
          base.push(pointAt(ribs[j][surface], Math.min(0.98, Math.max(0.02, t))));
        }

          const flat = developFan(apex, base);
          out.push({
            row,
            fromRib: i,
            toRib: j,
            reach,
            anchorFraction: frac,
            apex,
            base,
            flat,
            areaM2: fanArea(apex, base),
            // Height of the triangle: how far the load travels diagonally.
            spanM: Math.abs(ribs[j].station - ribs[i].station),
            meanRadiusM: base.reduce((a, b) => a + dist3(apex, b), 0) / base.length,
          });
        }
      }
    }
  }

  return {
    vribs: out,
    count: out.length,
    totalAreaM2: out.reduce((a, v) => a + v.areaM2, 0),
    anchorRibs: anchors,
    // Ribs with no line and no diagonal reaching them are unsupported, which
    // is a design error rather than a style choice.
    unsupportedRibs: ribs
      .map((_, i) => i)
      .filter((i) => !anchorSet.has(i) && !out.some((v) => v.toRib === i)),
  };
}

/**
 * Develop a fan (cone) flat, exactly.
 *
 * Returns the apex at the origin and the base as a polyline. Every radius and
 * every base segment length is preserved to machine precision, because a cone
 * is developable — no approximation is involved and none should be tolerated.
 */
export function developFan(apex, base) {
  const r = base.map((b) => dist3(apex, b));
  const pts = [];
  let phi = 0;

  pts.push([r[0], 0]);
  for (let k = 1; k < base.length; k++) {
    const s = dist3(base[k - 1], base[k]);
    const a = r[k - 1];
    const b = r[k];
    if (a < 1e-12 || b < 1e-12) { pts.push([b, phi]); continue; }
    // Law of cosines for the angle subtended at the apex.
    let c = (a * a + b * b - s * s) / (2 * a * b);
    c = Math.min(1, Math.max(-1, c));
    phi += Math.acos(c);
    pts.push([b, phi]);
  }

  return {
    apex: [0, 0],
    // Polar to cartesian, with the fan opened about the apex.
    base: pts.map(([rad, ang]) => [rad * Math.cos(ang), rad * Math.sin(ang)]),
    radii: r,
    totalAngle: phi,
    // The outline a cutter follows: apex, round the base, back to apex.
    outline: [[0, 0], ...pts.map(([rad, ang]) => [rad * Math.cos(ang), rad * Math.sin(ang)])],
  };
}

/** Surface area of the fan, by summing its triangles. */
function fanArea(apex, base) {
  let a = 0;
  for (let k = 1; k < base.length; k++) {
    a += triangleArea(apex, base[k - 1], base[k]);
  }
  return a;
}

function triangleArea(p, q, r) {
  const ux = q[0] - p[0];
  const uy = q[1] - p[1];
  const uz = q[2] - p[2];
  const vx = r[0] - p[0];
  const vy = r[1] - p[1];
  const vz = r[2] - p[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

function pointAt(poly, frac) {
  const n = poly.length;
  const idx = Math.min(n - 2, Math.max(0, Math.floor(frac * (n - 1))));
  const f = frac * (n - 1) - idx;
  return [
    poly[idx][0] + f * (poly[idx + 1][0] - poly[idx][0]),
    poly[idx][1] + f * (poly[idx + 1][1] - poly[idx][1]),
    poly[idx][2] + f * (poly[idx + 1][2] - poly[idx][2]),
  ];
}

/**
 * Check the development is exact.
 *
 * A cone flattens without distortion, so both the radii and the base segment
 * lengths must survive to machine precision. This is the same class of check
 * as the cylinder and cone cases in the panel development, and it should hold
 * to the same tolerance — if it does not, the fan is not being treated as the
 * developable surface it is.
 */
export function fanDevelopmentError(apex, base) {
  const flat = developFan(apex, base);
  let worstRadius = 0;
  let worstSegment = 0;
  for (let k = 0; k < base.length; k++) {
    const trueR = dist3(apex, base[k]);
    const flatR = Math.hypot(flat.base[k][0], flat.base[k][1]);
    worstRadius = Math.max(worstRadius, Math.abs(flatR - trueR));
    if (k > 0) {
      const trueS = dist3(base[k - 1], base[k]);
      const flatS = Math.hypot(
        flat.base[k][0] - flat.base[k - 1][0],
        flat.base[k][1] - flat.base[k - 1][1],
      );
      worstSegment = Math.max(worstSegment, Math.abs(flatS - trueS));
    }
  }
  return { worstRadiusM: worstRadius, worstSegmentM: worstSegment };
}

/**
 * How much load each diagonal carries.
 *
 * The unloaded rib's share of the span load has to reach an attachment point,
 * and it reaches it through the diagonals on either side. Split between them
 * in proportion to how close each is — a rib midway between two attachments
 * sends half each way.
 *
 * This is the load the diagonal's seam has to hold, and it is not small: it
 * is the whole of that rib's lift, arriving at one point.
 */
export function vribLoads(vribSet, spanLoad, { rowShares = null } = {}) {
  const byTarget = new Map();
  for (const v of vribSet.vribs) {
    if (!byTarget.has(v.toRib)) byTarget.set(v.toRib, []);
    byTarget.get(v.toRib).push(v);
  }

  const loads = [];
  for (const [ribIndex, group] of byTarget) {
    const station = spanLoad.stations.find((s) => s.index === ribIndex);
    if (!station) continue;

    // All of this rib's lift has to reach an attachment point, and the
    // diagonals are the only route. So the weights must sum to one across the
    // whole group — every diagonal reaching this rib, in both directions and
    // on every row.
    //
    // Applying a row share on top of an already-normalised proximity weight
    // divides the load twice and loses half of it: with lines on every second
    // rib, half the span is unattached, so half the load must travel
    // diagonally, and an answer of 25% is the signature of that mistake.
    const weights = group.map((v) => (1 / Math.max(1e-6, v.spanM))
      * (rowShares ? (rowShares[v.row] ?? 0) : 1));
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;

    group.forEach((v, k) => {
      loads.push({
        row: v.row,
        fromRib: v.fromRib,
        toRib: v.toRib,
        loadN: station.loadN * (weights[k] / wsum),
        // Load per metre of seam, which is what decides whether the seam
        // needs reinforcing.
        seamLengthM: seamLength(v),
      });
    });
  }

  const total = loads.reduce((a, l) => a + l.loadN, 0);
  return {
    loads,
    totalN: total,
    // Fraction of the half wing's load that travels through a diagonal
    // rather than straight down a line from its own rib.
    fractionThroughDiagonals: total / spanLoad.stations.reduce((a, s) => a + s.loadN, 0),
  };
}

function seamLength(v) {
  let s = 0;
  for (let k = 1; k < v.base.length; k++) s += dist3(v.base[k - 1], v.base[k]);
  return s;
}
