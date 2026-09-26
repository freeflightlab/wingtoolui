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
  // Below this a diagonal is not worth making, so it is not placed.
  //
  // Defaults to 0 — place one wherever the rule says — because turning it on
  // by default changes an existing design without being asked. Setting it to
  // 0.12 on the test wing skips 5 of 20 and cuts the size spread from 9.2:1
  // to 5.4:1, but on other row and reach combinations it can leave a rib with
  // nothing holding it, which `unsupportedRibs` reports.
  //
  // So it is a choice a designer makes and checks, not a new default they
  // inherit.
  minLengthM = 0,
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
  // Diagonals the rule asked for that came out too small to be worth making.
  const skipped = [];

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

        // The base stays at the apex's own chord fraction.
        //
        // A diagonal runs from the LOWER surface of one rib to the UPPER
        // surface of its neighbour, and a rib on an arc is tilted, so its
        // thickness has a spanwise component: on the test wing rib 4's upper
        // surface sits at y = 1.691 at 30% chord and its lower at y = 1.789.
        // That offset adds to the rib gap going inboard and subtracts going
        // outboard, so one-cell diagonals from the same rib come out at
        // 0.505 m and 0.291 m.
        //
        // I tried to even that up by sliding the base along the neighbouring
        // rib until it sat across from the apex. It cannot work: `y` varies
        // by only about 0.07 m across the whole chord of that rib, less than
        // the 0.098 m offset, so the search ran to the end of the chord and
        // produced 1.7 m diagonals lying almost flat. The asymmetry is the
        // arc, not a placement error, and it is reported rather than forced
        // away — see `diagonalGeometry`.
        const base = [];
        for (let p = 0; p < points; p++) {
          const t = frac - baseSpread / 2 + (baseSpread * p) / (points - 1);
          base.push(pointAt(ribs[j][surface], Math.min(0.98, Math.max(0.02, t))));
        }

          // A diagonal that has collapsed is not placed at all.
          //
          // The outboard leg degenerates towards the tip. A rib on an arc is
          // tilted, so its thickness has a spanwise component, and going
          // outboard that offset SUBTRACTS from the rib gap. Towards the tip
          // the dihedral grows while the cells narrow, and the two cancel:
          //
          //     rib  4   inboard 675 mm   outboard 346 mm
          //     rib  8   inboard 661 mm   outboard 155 mm
          //     rib 12   inboard 531 mm   outboard  75 mm
          //
          // Nobody cuts, marks and sews a 75 mm triangle. It adds two seams
          // and some weight and carries almost nothing, and the inboard leg
          // at the same rib already holds that anchor.
          //
          // Real wings stop placing diagonals before the tip for this reason.
          // The rule placed them all the way out because it never looked at
          // what it had made.
          if (minLengthM > 0) {
            const bm = base[Math.floor(base.length / 2)];
            const len = Math.hypot(bm[0] - apex[0], bm[1] - apex[1],
              bm[2] - apex[2]);
            if (len < minLengthM) {
              skipped.push({ row, fromRib: i, toRib: j, lengthM: len });
              continue;
            }
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
    // Diagonals the rule asked for but which came out too small to be worth
    // making — the outboard leg degenerates towards the tip.
    skipped,
    minLengthM,
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

/**
 * A point at a fraction of the CHORD along a rib surface.
 *
 * This interpolated by array INDEX — `frac * (n - 1)` — while every caller
 * passes a chord fraction: the anchor rows are `{ A: 0.085, B: 0.30, ... }`,
 * which are positions along the chord, not positions in an array.
 *
 * Points are spread evenly along the SURFACE, and the nose has more surface
 * per unit chord than the flat middle, so the two do not agree. On a 24-point
 * upper surface the A anchor at 8.5% landed at 6.3% — **2.2 points of chord,
 * 37 mm on a 2.19 m rib** — and every diagonal attached there.
 *
 * The same mistake as the billow profile in `ovalization.js`, found by
 * looking for the pattern rather than waiting for it to show.
 *
 * The chord axis is the line from the first point to the last, and each
 * point's position is its projection onto it.
 */
function pointAt(poly, frac) {
  const n = poly.length;
  if (n < 2) return poly[0] ? poly[0].slice() : [0, 0, 0];

  const a = poly[0];
  const b = poly[n - 1];
  const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2];

  // A degenerate surface has no chord to measure along; fall back to index.
  if (!(len2 > 0)) {
    const i0 = Math.min(n - 2, Math.max(0, Math.floor(frac * (n - 1))));
    const f0 = frac * (n - 1) - i0;
    return [
      poly[i0][0] + f0 * (poly[i0 + 1][0] - poly[i0][0]),
      poly[i0][1] + f0 * (poly[i0 + 1][1] - poly[i0][1]),
      poly[i0][2] + f0 * (poly[i0 + 1][2] - poly[i0][2]),
    ];
  }

  const along = (p) => (((p[0] - a[0]) * ax[0] + (p[1] - a[1]) * ax[1]
    + (p[2] - a[2]) * ax[2]) / len2);

  const want = Math.min(1, Math.max(0, frac));
  // The surface runs nose to tail, so its projection is monotonic: walk until
  // the station is passed, then interpolate within that segment.
  let i = 1;
  while (i < n - 1 && along(poly[i]) < want) i++;
  const t0 = along(poly[i - 1]);
  const t1 = along(poly[i]);
  const f = t1 > t0 ? (want - t0) / (t1 - t0) : 0;
  const g = Math.min(1, Math.max(0, f));
  return [
    poly[i - 1][0] + g * (poly[i][0] - poly[i - 1][0]),
    poly[i - 1][1] + g * (poly[i][1] - poly[i - 1][1]),
    poly[i - 1][2] + g * (poly[i][2] - poly[i - 1][2]),
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

/* --------------------------------------------------------------- H-ribs -- */

/**
 * Horizontal ribs.
 *
 * The V form spreads load **spanwise**: a fan from a point on a loaded rib out
 * to a line on an unloaded one. The H form does something else entirely — it
 * is an internal sheet lying roughly horizontally inside a cell, sewn along a
 * chordwise line on each of the two ribs that bound it. It holds the cell to
 * its intended width and stops the section ballooning between the ribs, which
 * is what keeps a high-aspect wing's profile where the designer put it.
 *
 * The geometric consequence matters more than it sounds. A V-rib is a cone,
 * and a cone develops exactly. **An H-rib is a strip between two rib curves,
 * which is the same class of surface as a sail panel** — developable only
 * approximately, with a distortion that has to be measured rather than assumed
 * away. So it goes through `developPanel`, the same triangle-pair unrolling
 * the wing's own panels use, and carries the same error report.
 *
 * Two ribs, one strip, and the height is where the sheet sits between the
 * chord line and the surface: 0 puts it on the chord, 1 on the upper surface,
 * -1 on the lower.
 */
export function buildHRibs({
  wing,
  ribPairs = null,
  chordFrom = 0.25,
  chordTo = 0.60,
  heightFraction = 0.35,
  points = 16,
  // H ribs as a design file states them, rather than one span for the whole
  // wing.
  //
  // `parseHVRibs` returns LEP section 12's type-11 rows: which two ribs each
  // strip joins, which anchor station it sits at, and how wide it is. The
  // Swoop2 carries 70, one between each adjacent pair at each of three
  // stations, 2 cm wide — and every one of them was being ignored.
  //
  // A file entry gives a chord STATION and a width; this function works in a
  // chord RANGE, so the width is laid either side of the station.
  entries = null,
  anchorFractions = null,
}) {
  const ribs = wing.ribs;

  // From the file, each entry becomes its own pair and its own chord range.
  if (entries?.length) {
    const fracs = anchorFractions
      ?? Object.values(wing.airfoil?.anchors ?? { A: 0.085, B: 0.30, C: 0.53 });
    const built = [];
    const skipped = [];
    for (const e of entries) {
      const i = e.fromRib - 1;
      const j = e.toRib - 1;
      if (!ribs[i] || !ribs[j]) {
        skipped.push({ ...e, why: 'rib out of range' });
        continue;
      }
      const station = fracs[Math.max(0, Math.min(fracs.length - 1,
        (e.fromAnchor ?? 1) - 1))];
      const chordM = ribs[i].chord || 1;
      const half = ((e.widthCm ?? 2) / 100) / chordM / 2;
      const from = Math.max(0.01, station - half);
      const to = Math.min(0.99, station + half);
      const one = buildHRibs({
        wing, ribPairs: [[i, j]], chordFrom: from, chordTo: to,
        heightFraction, points,
      });
      built.push(...one.hribs.map((h) => ({
        ...h, anchor: e.fromAnchor, widthCm: e.widthCm, fromFile: true,
      })));
    }
    return {
      hribs: built,
      count: built.length,
      skipped,
      totalAreaM2: built.reduce((a, h) => a + h.areaM2, 0),
      note: `${built.length} H ribs from the design file`
        + (skipped.length ? `, ${skipped.length} skipped` : ''),
    };
  }

  const pairs = ribPairs
    || ribs.slice(0, -1).map((_, i) => [i, i + 1]);

  const out = [];
  for (const [i, j] of pairs) {
    if (!ribs[i] || !ribs[j]) continue;

    const edge = (rib) => {
      const pts = [];
      for (let p = 0; p < points; p++) {
        const f = chordFrom + ((chordTo - chordFrom) * p) / (points - 1);
        pts.push(betweenSurfaces(rib, f, heightFraction));
      }
      return pts;
    };

    const left = edge(ribs[i]);
    const right = edge(ribs[j]);
    const panel = developPanelLocal(left, right);

    out.push({
      fromRib: i,
      toRib: j,
      chordFrom,
      chordTo,
      heightFraction,
      left,
      right,
      panel,
      areaM2: stripArea(left, right),
      distortion: panel.distortion,
      widthM: dist3(left[0], right[0]),
    });
  }

  return {
    hribs: out,
    count: out.length,
    totalAreaM2: out.reduce((a, h) => a + h.areaM2, 0),
    // Unlike the cone, this is not exact, so the worst case is reported.
    worstDistortion: out.length ? Math.max(...out.map((h) => h.distortion)) : 0,
  };
}

/** A point between the lower and upper surface at a chord fraction. */
function betweenSurfaces(rib, frac, height) {
  const up = pointAt(rib.upper, frac);
  const lo = pointAt(rib.lower, frac);
  const t = (height + 1) / 2;      // -1 -> lower, +1 -> upper
  return [
    lo[0] + (up[0] - lo[0]) * t,
    lo[1] + (up[1] - lo[1]) * t,
    lo[2] + (up[2] - lo[2]) * t,
  ];
}

/**
 * Unroll a strip between two curves.
 *
 * Deliberately the same construction as the sail panels: step along in
 * quadrilaterals, split each on a diagonal, lay the triangles flat. Both seam
 * lengths are preserved exactly; the diagonal is what absorbs the fact that
 * the surface is not developable, and the residual is reported.
 */
function developPanelLocal(left, right) {
  const L = [];
  const R = [];
  let x0 = 0;
  let y0 = 0;
  let theta = 0;
  let worst = 0;

  for (let i = 0; i < left.length - 1; i++) {
    const a = dist3(left[i], right[i]);
    if (a < 1e-12) continue;

    const ax = right[i][0] - left[i][0];
    const ay = right[i][1] - left[i][1];
    const az = right[i][2] - left[i][2];

    const lx = left[i + 1][0] - left[i][0];
    const ly = left[i + 1][1] - left[i][1];
    const lz = left[i + 1][2] - left[i][2];
    const a1l = (ax * lx + ay * ly + az * lz) / a;
    const hl = ribCrossNorm(ax, ay, az, lx, ly, lz) / a;

    const rx = right[i + 1][0] - right[i][0];
    const ry = right[i + 1][1] - right[i][1];
    const rz = right[i + 1][2] - right[i][2];
    const a2r = -(ax * rx + ay * ry + az * rz) / a;
    const a1r = a - a2r;
    const hr = ribCrossNorm(ax, ay, az, rx, ry, rz) / a;

    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const l1 = [x0, y0];
    const r1 = [a * ct + x0, a * st + y0];
    const l2 = [a1l * ct - hl * st + x0, a1l * st + hl * ct + y0];
    const r2 = [a1r * ct - hr * st + x0, a1r * st + hr * ct + y0];

    if (i === 0) { L.push(l1); R.push(r1); }
    L.push(l2);
    R.push(r2);

    // The diagonal the construction cannot preserve.
    const trueDiag = dist3(left[i], right[i + 1]);
    const flatDiag = Math.hypot(r2[0] - l1[0], r2[1] - l1[1]);
    worst = Math.max(worst, Math.abs(flatDiag - trueDiag) / (trueDiag || 1));

    x0 = l2[0];
    y0 = l2[1];
    theta = Math.atan2(r2[1] - l2[1], r2[0] - l2[0]);
  }

  return { left: L, right: R, distortion: worst };
}

function ribCrossNorm(ax, ay, az, bx, by, bz) {
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
}

function stripArea(left, right) {
  let a = 0;
  for (let i = 0; i < left.length - 1; i++) {
    a += triangleArea(left[i], right[i], right[i + 1]);
    a += triangleArea(left[i], right[i + 1], left[i + 1]);
  }
  return a;
}

/**
 * Internal structure for a wing: diagonals where the span needs them,
 * horizontal sheets where the cells need holding.
 *
 * Reported together because they trade against each other. Both cost fabric
 * and weight; the V form buys attachment spacing, the H form buys profile
 * accuracy.
 */
export function internalStructure({
  wing, airfoil, anchorRibs = null, vribOptions = {}, hribOptions = null,
}) {
  const v = buildVRibs({ wing, airfoil, anchorRibs, ...vribOptions });
  const h = hribOptions ? buildHRibs({ wing, ...hribOptions })
    : { hribs: [], count: 0, totalAreaM2: 0, worstDistortion: 0 };

  return {
    vribs: v,
    hribs: h,
    totalAreaM2: v.totalAreaM2 + h.totalAreaM2,
    pieces: v.count + h.count,
    unsupportedRibs: v.unsupportedRibs,
    // The V form develops exactly and the H form does not, so a build that
    // leans on H ribs carries a distortion the diagonals never introduce.
    worstDistortion: h.worstDistortion,
  };
}

/**
 * Is a diagonal in tension across its whole width?
 *
 * `vribLoads` treats a diagonal as a load path from its anchor to its base:
 * the line pulls at the apex, the rib takes it along the base. That is where
 * the load *goes*, but it is not how the cloth carries it.
 *
 * A diagonal is a triangle of fabric. Fabric carries tension and nothing
 * else: no compression, no bending. So load flows only along lines from the
 * apex to the base that are actually in tension, and a part of the triangle
 * whose fibres are not being pulled carries nothing at all. It is there,
 * sewn, adding weight, and doing no work.
 *
 * ---------------------------------------------------------------------------
 * Where the slack is
 * ---------------------------------------------------------------------------
 * The load enters at a point and leaves along a line. Between them the
 * tension field is a fan of straight lines from the apex, and its width at
 * the base is set by how far the load can spread before the fabric would have
 * to push rather than pull.
 *
 * The limit is the angle: a fibre running from the apex to a point on the
 * base carries a share of the load proportional to the cosine of its angle
 * from the load direction. Beyond 90 degrees that share is negative — the
 * fibre would have to push — so it goes slack.
 *
 * A wide, shallow diagonal has base points well past that angle and is
 * carrying on a fraction of its width. A narrow, deep one works throughout.
 * This says which, and by how much.
 */
export function diagonalTension(vrib, { loadDirection = null, maillon = null } = {}) {
  const apex = vrib.apex;
  const base = vrib.base;
  if (!apex || !base || base.length < 2) {
    throw new Error('diagonalTension needs a diagonal with an apex and a base');
  }

  // The load pulls along the LINE, not along the diagonal.
  //
  // This defaulted to apex-to-base-centre — the diagonal's own axis — so by
  // construction the load always lay along the piece and every fibre came out
  // near enough aligned. A tension check whose load direction is defined by
  // the thing it is checking cannot find anything.
  //
  // What actually pulls on a diagonal's apex is the line attached there,
  // running down and inboard to the maillon. On an arced wing that direction
  // has a large spanwise component — the further outboard the anchor, the
  // more the line pulls sideways rather than down — and it is that component
  // the diagonal has to resist. `maillon` supplies it; without one the old
  // behaviour is kept so existing callers do not silently change meaning.
  const mid = base[Math.floor(base.length / 2)];
  const dir = loadDirection ?? (maillon
    ? [maillon[0] - apex[0], maillon[1] - apex[1], maillon[2] - apex[2]]
    : [mid[0] - apex[0], mid[1] - apex[1], mid[2] - apex[2]]);
  const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const u = [dir[0] / dl, dir[1] / dl, dir[2] / dl];

  const fibres = [];
  for (const b of base) {
    const v = [b[0] - apex[0], b[1] - apex[1], b[2] - apex[2]];
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-12) continue;
    const cos = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / len;
    // A fibre carries load when it OPPOSES the pull, not when it aligns
    // with it.
    //
    // The line pulls the apex down towards the maillon. The fabric runs from
    // the apex up to the base on the neighbouring rib's upper surface, and
    // its tension acts along base-to-apex: it holds the apex up against the
    // pull. Cloth can only pull, so a fibre works when its own direction has
    // a component against the load.
    //
    // Written the other way round — carrying load when aligned WITH the pull
    // — every fibre came out slack against a real line direction, and 100%
    // taut against the old self-referential default. Both answers were
    // wrong and the second looked fine.
    const opposing = -cos;
    fibres.push({
      point: b,
      lengthM: len,
      cosine: cos,
      angleDeg: Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI),
      taut: opposing > 0,
      // How much of the load this fibre can carry, relative to one directly
      // opposing it.
      share: Math.max(0, opposing),
    });
  }

  const taut = fibres.filter((f) => f.taut);
  const totalShare = fibres.reduce((a, f) => a + f.share, 0);

  // Where along the base the tension field ends.
  const firstSlack = fibres.findIndex((f) => !f.taut);

  return {
    fibres,
    tautCount: taut.length,
    totalCount: fibres.length,
    tautFraction: fibres.length ? taut.length / fibres.length : 0,
    // How well the working fabric opposes the load, 0 to 1.
    //
    // Reported as a magnitude. The underlying cosine is negative — a fibre
    // works by pulling against the load — and handing a reader a negative
    // "alignment" invites them to read a well-oriented diagonal as a badly
    // oriented one.
    //
    // 1 would be a diagonal pulling straight back against the line, and no
    // real diagonal reaches it.
    //
    // A diagonal spans a cell sideways while rising from the lower surface to
    // the upper, so its direction is fixed by the cell width against the
    // section depth. On the test wing that is 0.45 m across and 0.35 m up:
    // 52 degrees from the pull, and a ceiling of about 0.61. Sweeping the
    // base along the whole chord of the neighbouring rib moves it from 0.57
    // to 0.59 — the placement is already near the best that cell allows.
    //
    // So this figure means little on its own. `achievable` below is the
    // bound for that particular cell, and the ratio between them is what
    // says whether a diagonal is badly placed or merely in a shallow cell.
    alignment: taut.length
      ? Math.abs(taut.reduce((a, f) => a + f.cosine, 0) / taut.length) : 0,
    // How much of the pull is spanwise rather than down. On an arced wing
    // this grows outboard — 3% at the root and 37% by mid-span on the test
    // wing — and it is the part a diagonal has to resist sideways.
    spanwiseShare: Math.abs(u[1]),
    // The best any one fibre of this diagonal manages against the SAME load.
    //
    // My first version measured the rise against the span — the alignment a
    // diagonal would have if the load were straight down. The load is up to
    // three quarters spanwise, so that bound belonged to a different problem
    // and the ratio to it came out near 50% on every wing, which says
    // nothing about anything.
    //
    // Measured against the real load direction it is a bound the diagonal
    // could actually reach: if the mean is well below it the base is spread
    // into fabric that is not pulling its weight, and if the best fibre is
    // itself poor then no placement in this cell will help.
    achievable: fibres.length ? Math.max(...fibres.map((f) => f.share)) : 0,
    totalShare,
    worstAngleDeg: fibres.length
      ? Math.max(...fibres.map((f) => f.angleDeg)) : 0,
    fullyTaut: taut.length === fibres.length,
    slackFrom: firstSlack >= 0 ? firstSlack / (fibres.length - 1) : null,
    note: taut.length === fibres.length
      ? 'the whole width is in tension'
      : `${((1 - taut.length / fibres.length) * 100).toFixed(0)}% of the base `
        + 'is slack: that fabric is sewn in, carries nothing, and adds weight',
  };
}

/**
 * Every diagonal on the wing, and which are working across their width.
 *
 * The useful output is not a pass but a ranking: a diagonal that works on
 * half its width is either too wide or anchored in the wrong place, and both
 * are things a designer can change.
 */
export function checkDiagonalTension(vribs, opts = {}) {
  // `opts.maillon` reaches `diagonalTension` through here, so a caller with a
  // line plan gets the real load direction rather than the diagonal's own
  // axis.
  const results = vribs.map((v) => ({
    row: v.row,
    fromRib: v.fromRib,
    toRib: v.toRib,
    areaM2: v.areaM2,
    tension: diagonalTension(v, opts),
  }));

  const slack = results.filter((r) => !r.tension.fullyTaut);
  // Fabric that is sewn in and carries nothing.
  const wastedArea = slack.reduce(
    (a, r) => a + r.areaM2 * (1 - r.tension.tautFraction), 0);

  return {
    diagonals: results,
    count: results.length,
    fullyTaut: results.length - slack.length,
    partlySlack: slack.length,
    wastedAreaM2: wastedArea,
    worst: results.slice()
      .sort((a, b) => a.tension.tautFraction - b.tension.tautFraction)[0] ?? null,
    note: slack.length === 0
      ? `all ${results.length} diagonals are in tension across their width`
      : `${slack.length} of ${results.length} diagonals are partly slack, `
        + `${(wastedArea * 1e4).toFixed(0)} cm2 of fabric carrying nothing`,
  };
}

/**
 * Does each diagonal make sense as a piece of a wing?
 *
 * `buildVRibs` places a diagonal wherever the rules say one goes. It does not
 * ask whether the result is buildable, and on a real planform many are not:
 *
 *   - **Too short.** Near the tip the cells narrow and the section thins, and
 *     the rule still produces a diagonal. On the test wing the smallest is
 *     74 mm. Nobody cuts, marks and sews a 74 mm triangle; it adds seams and
 *     weight and carries almost nothing.
 *
 *   - **Too long.** The longest on the same wing is 685 mm, nine times the
 *     shortest. A long diagonal is a long unsupported edge.
 *
 *   - **Asymmetric between directions.** A rib on an arc is tilted, so its
 *     thickness has a spanwise component — 98 mm at mid-span on the test
 *     wing. A diagonal runs from the LOWER surface of one rib to the UPPER
 *     surface of its neighbour, so that offset adds going inboard and
 *     subtracts going outboard: 505 mm one way and 291 mm the other from the
 *     same rib.
 *
 *     That is the arc, not a placement error. Sliding the base along the
 *     neighbouring rib to even it up does not work, because `y` varies by
 *     less across that rib's whole chord than the offset it would have to
 *     absorb; the search runs to the end of the chord and produces diagonals
 *     lying almost flat.
 *
 *   - **Too shallow.** A diagonal near horizontal is a poor load path: it
 *     pulls the rib sideways rather than carrying the anchor load up into
 *     the upper surface, which is what it is for.
 *
 * None of these is fixable by the diagonal code alone — they follow from the
 * planform, the arc and the anchor spacing. What the tool can do is say which
 * ones are wrong and by how much, so the designer changes the thing that
 * actually causes it.
 */
export function diagonalGeometry(vribs, {
  minLengthM = 0.12, maxLengthM = 0.60, minAngleFromHorizontalDeg = 25,
  maxDirectionRatio = 1.4,
} = {}) {
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  const items = vribs.map((g) => {
    const mid = g.base[Math.floor(g.base.length / 2)];
    const dz = mid[2] - g.apex[2];
    const lengthM = d3(g.apex, mid);
    // Angle up from the horizontal plane. A diagonal doing its job rises
    // steeply from the anchor to the upper surface.
    const angleDeg = lengthM > 0
      ? Math.asin(Math.min(1, Math.abs(dz) / lengthM)) * (180 / Math.PI) : 0;
    return {
      row: g.row,
      fromRib: g.fromRib,
      toRib: g.toRib,
      outboard: g.toRib > g.fromRib,
      lengthM,
      angleDeg,
      baseWidthM: d3(g.base[0], g.base[g.base.length - 1]),
      areaM2: g.areaM2,
    };
  });

  const tooShort = items.filter((d) => d.lengthM < minLengthM);
  const tooLong = items.filter((d) => d.lengthM > maxLengthM);
  const tooShallow = items.filter((d) => d.angleDeg < minAngleFromHorizontalDeg);

  // Inboard against outboard, from the same rib, which should be alike.
  const pairs = [];
  for (const a of items.filter((d) => d.outboard)) {
    const b = items.find((x) => !x.outboard && x.fromRib === a.fromRib
      && x.row === a.row);
    if (!b) continue;
    const ratio = Math.max(a.lengthM, b.lengthM) / Math.min(a.lengthM, b.lengthM);
    pairs.push({ fromRib: a.fromRib, outboardM: a.lengthM, inboardM: b.lengthM, ratio });
  }
  const lopsided = pairs.filter((p) => p.ratio > maxDirectionRatio);

  const lengths = items.map((d) => d.lengthM);

  // Distinct diagonals, not a sum of categories. One piece can be short AND
  // shallow, and adding the lists gave "24 of 20 diagonals", which is the
  // kind of number that makes a reader stop trusting the rest.
  const failing = new Set();
  for (const d of [...tooShort, ...tooLong, ...tooShallow]) {
    failing.add(`${d.row}:${d.fromRib}->${d.toRib}`);
  }
  for (const p of lopsided) failing.add(`pair:${p.fromRib}`);
  const problems = failing.size;

  return {
    diagonals: items,
    pairs,
    tooShort,
    tooLong,
    tooShallow,
    lopsided,
    shortestM: Math.min(...lengths),
    longestM: Math.max(...lengths),
    spread: Math.max(...lengths) / Math.min(...lengths),
    ok: problems === 0,
    problems,
    limits: { minLengthM, maxLengthM, minAngleFromHorizontalDeg, maxDirectionRatio },
    note: problems === 0
      ? `all ${items.length} diagonals are a sensible size and angle`
      : `${problems} of ${items.length} diagonals are not buildable as placed: `
        + [
          tooShort.length && `${tooShort.length} under ${minLengthM * 1000} mm`,
          tooLong.length && `${tooLong.length} over ${maxLengthM * 1000} mm`,
          tooShallow.length && `${tooShallow.length} shallower than ${minAngleFromHorizontalDeg} degrees`,
          lopsided.length && `${lopsided.length} lopsided between directions`,
        ].filter(Boolean).join(', '),
  };
}
