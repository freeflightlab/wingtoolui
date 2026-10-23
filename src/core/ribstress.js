/* ribstress.js — what the rib cloth actually carries.
 *
 * This project computes where the anchors go, what load each carries, and
 * where the lightening holes are cut. It had never checked the cloth in
 * between. A rib can satisfy every placement rule — nose band, surface
 * margins, anchor clearance, webs between holes — and still be a rib that
 * tears at the attachment point.
 *
 * ---------------------------------------------------------------------------
 * There is a published criterion for this, and it is unusually direct
 * ---------------------------------------------------------------------------
 * PMA §5.3 tests exactly this. An inspector attaches an A line of the first
 * line group, picks a point on the rib above the attachment, places a needle
 * at least 100 mm away, and pulls. The ripstop must not break below **0.6
 * daN**, and 0.7 daN is the boundary between "acceptable" and "good".
 *
 * That test is not measuring the cloth in isolation — it measures the cloth
 * *while the rib is loaded through its own line*. So the tension the design
 * puts into the rib is part of what the inspector is pulling against, and a
 * design that already works the cloth hard will fail a test that a slacker
 * one passes on identical fabric.
 *
 * ---------------------------------------------------------------------------
 * The model: radials from the line, and they end at a seam
 * ---------------------------------------------------------------------------
 * Cloth carries tension and nothing else. A line pulling on a rib therefore
 * loads it along straight rays from the attachment point — the wrinkles a
 * loaded rib shows fan out from its tab — and a ray can only end where the
 * rib is sewn to something that takes the load on: the upper seam. A ray that
 * runs into a hole ends in mid-air, which is to say it is not there.
 *
 * So for each anchor:
 *
 *   1. `radialFan` finds the rays from the attachment point to the upper
 *      seam that cross no hole, keeping a clearance from every hole's edge.
 *   2. The load goes into those rays by the cosine of each one's angle from
 *      the line's own pull — the line's direction in the rib's plane, turned
 *      round — falling as one over the distance along it: Flamant's elastic
 *      answer for a point load, and the rule the diagonals' fibres already
 *      follow (`radialField`). Cloth cannot push, so a ray more than a right
 *      angle from the pull carries nothing. Where the holes leave the fan
 *      lopsided, what the rays pull across the line is taken by the lower
 *      surface, to which the rib is sewn at the anchor.
 *   3. From that: the load per metre of cloth at any distance from the tab,
 *      how far the reinforcement must reach before bare cloth can take over,
 *      what the cloth carries where the PMA needle goes, and what the seam
 *      receives where the rays arrive.
 *
 * A line whose own pull no clear ray follows has no straight path to the
 * seam at all, which is a fault of the design rather than a matter of cloth
 * strength.
 *
 * The two complete designs here bear the model out. On 86 of their 88
 * loaded anchors — their own ribs, holes and lines — the line's pull lies
 * inside a fan of rays that reach the upper seam 10 mm clear of every hole,
 * and the holes leave that fan 24 to 67 degrees wide as it works (`spreadDeg`
 * below). The other two are on the tip ribs, thinned to 1% and 10% of their
 * section, where there is no depth for a fan to cross. Neither design says
 * any of this; it is what their holes do.
 *
 * It is a radial model: a ray a hole cuts carries nothing, wherever along it
 * the hole is, where real cloth would carry some of that load round the hole
 * in two-way tension. So it errs on the safe side, and it is a line-load
 * model — force per unit width of cloth — not a finite element analysis.
 *
 * ---------------------------------------------------------------------------
 * What it replaced
 * ---------------------------------------------------------------------------
 * A fan of 30 degrees either side of straight up — the Whitmore section of
 * gusset-plate design — with a hole found by how much of a widening band it
 * removed at each height. It did not know which way the line pulls (a D line
 * leans 15 to 18 degrees aft on the default wing), where the fan ended, or
 * what the seam got. Before that the room was a quarter of the chord, and
 * the path was walked along the chord, aft of the anchor.
 *
 * And the first result looked absurd: the A anchor working the rib cloth at
 * 2971% of its capacity, on "260 N at 1 g, 2080 N at the 8 g case" through a
 * 20 mm tab. The arithmetic was right and the load was not: it was a number
 * that sounded plausible, not one the load model gave. Half a 95 kg wing is
 * 466 N shared between its anchors — 28 of them on the 12-cell test wing, 17
 * N each on average and 37 N on the worst:
 *
 *     the worst anchor at 1 g     37 N over a 20 mm tab  =   1.8 kN/m
 *     at the 8 g case            295 N                   =  14.7 kN/m
 *     Skytex 27 hard carries about                           3.5 kN/m
 *
 * So at 1 g the tab alone puts the load into cloth that carries it, and at
 * the design case it does not, by a factor of four. The load goes into a
 * reinforcement at the tab, and the question this module answers is **how
 * far that reinforcement has to reach before bare cloth can take over**, and
 * whether the cloth has a straight path to the seam once it does.
 */

import { toRibPlane } from './wing3d.js';
import { ribProfile } from './ribholes.js';

/**
 * The depth of a rib at an anchor, when nothing says what it is.
 *
 * A stand-in, and reported as one (`depthAssumed`): a 15% section is 11% of
 * chord deep at an A anchor, 15% at B, 13% at C and 7% at D.
 */
export const ASSUMED_RIB_DEPTH = 0.10;

/** Fabric strengths, N per metre of width, from the tear rating they must pass. */
export const RIB_CLOTH = {
  // PROVENANCE: the tear ratings are from the PMA standard's pass bands.
  // The line loads are ESTIMATES by this project, not datasheet figures.
  //
  // Porcher and Dominico publish tear and tensile figures for their cloths,
  // and this project does not have them. What is here is a plausible line
  // load for a ripstop of each tear rating, and it is stated as an estimate
  // because a reader is entitled to know which numbers came from a
  // manufacturer and which came from an assumption.
  //
  // What this module concludes — that the reinforcement at an anchor is
  // short next to the depth of its rib — survives these being out by a
  // factor of two either way; the lengths themselves move with the figure,
  // and are only as good as it is.

  // PMA §5.3 rates a *point* tear in daN, not a line load. These are the
  // line loads a cloth of that rating carries in service, which is a
  // different and much larger number: a ripstop that tears at 0.6 daN on a
  // needle carries far more spread across a seam.
  'Porcher Skytex 27 hard': { tearDaN: 0.75, lineLoadNPerM: 3500 },
  'Porcher Skytex 32': { tearDaN: 0.85, lineLoadNPerM: 4200 },
  'Porcher Skytex 40 hard': { tearDaN: 1.05, lineLoadNPerM: 5200 },
  'Dominico 30D': { tearDaN: 0.90, lineLoadNPerM: 4500 },
};

// Provenance is attached non-enumerably, so `Object.values(RIB_CLOTH)` still
// sees only materials. A table that carries its own source as an ordinary
// key becomes a table with a material called "provenance", and the first
// thing that iterates it breaks.
Object.defineProperty(RIB_CLOTH, 'provenance', {
  value: { tearDaN: 'PMA standard, section 5.3 pass bands', lineLoadNPerM: 'ESTIMATED by this project; not a datasheet figure' },
  enumerable: false,
});

/**
 * What the seam joining a rib to the upper surface carries, N per metre of
 * seam: the figure `panelStress` uses for a sail seam, and like it this
 * project's ESTIMATE, not a measured one.
 */
export const RIB_SEAM_N_PER_M = 2500;

/**
 * The load case a rib is checked at: the line loads at 1 g times this. The
 * same 8 g the tabs are sized for (`DEFAULT_TAB.loadFactor`).
 */
export const RIB_DESIGN_FACTOR = 8;

const DEG = Math.PI / 180;

/* ------------------------------------------------------------- geometry -- */

/** A polyline in the rib's plane, ordered along the chord. */
function byChord(poly) {
  return poly.slice().sort((p, q) => p[0] - q[0]);
}

/** The ordinate of a chord-ordered polyline at `u`. */
function ordinateAt(poly, u) {
  if (u <= poly[0][0]) return poly[0][1];
  for (let i = 1; i < poly.length; i++) {
    if (poly[i][0] >= u) {
      const f = (u - poly[i - 1][0]) / ((poly[i][0] - poly[i - 1][0]) || 1);
      return poly[i - 1][1] + f * (poly[i][1] - poly[i - 1][1]);
    }
  }
  return poly[poly.length - 1][1];
}

/** Distance along a ray from `p` (unit direction `d`) to segment a-b, or null. */
function raySegment(p, d, a, b) {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-15) return null;
  const wx = a[0] - p[0];
  const wy = a[1] - p[1];
  const t = (wx * ey - wy * ex) / den;
  const s = (wx * d[1] - wy * d[0]) / den;
  return t >= 0 && s >= 0 && s <= 1 ? t : null;
}

/** The first crossing of a polyline beyond `minT`, as a distance; Infinity if none. */
function rayToPolyline(p, d, poly, minT) {
  let best = Infinity;
  for (let k = 1; k < poly.length; k++) {
    const t = raySegment(p, d, poly[k - 1], poly[k]);
    if (t !== null && t > minT && t < best) best = t;
  }
  return best;
}

function orient(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Do segments p-q and a-b cross? */
function segmentsCross(p, q, a, b) {
  const d1 = orient(a, b, p);
  const d2 = orient(a, b, q);
  const d3 = orient(p, q, a);
  const d4 = orient(p, q, b);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function pointSegmentDistance(x, a, b) {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const L2 = ex * ex + ey * ey;
  let f = L2 > 0 ? ((x[0] - a[0]) * ex + (x[1] - a[1]) * ey) / L2 : 0;
  f = Math.max(0, Math.min(1, f));
  return Math.hypot(x[0] - a[0] - f * ex, x[1] - a[1] - f * ey);
}

function segmentDistance(p, q, a, b) {
  if (segmentsCross(p, q, a, b)) return 0;
  return Math.min(pointSegmentDistance(p, a, b), pointSegmentDistance(q, a, b),
    pointSegmentDistance(a, p, q), pointSegmentDistance(b, p, q));
}

function insidePolygon(x, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i];
    const [uj, vj] = poly[j];
    if ((vi > x[1]) !== (vj > x[1]) && x[0] < ((uj - ui) * (x[1] - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

/**
 * A hole as an outline in the rib's plane, metres: its own, or a chord range
 * taken the full depth of the rib, which is the cautious reading of a hole
 * given as no more than where it starts and stops.
 */
function holeOutline(h, upper, lower, chordM) {
  if (Array.isArray(h) && h.length > 2 && Array.isArray(h[0])) return h;
  if (h && Array.isArray(h.outline) && h.outline.length > 2) return h.outline;
  if (h && Number.isFinite(h.fromChord) && Number.isFinite(h.toChord) && chordM > 0) {
    const u0 = Math.min(h.fromChord, h.toChord) * chordM;
    const u1 = Math.max(h.fromChord, h.toChord) * chordM;
    const top = [];
    const bottom = [];
    for (let k = 0; k <= 12; k++) {
      const u = u0 + ((u1 - u0) * k) / 12;
      top.push([u, ordinateAt(upper, u)]);
      bottom.push([u, ordinateAt(lower, u)]);
    }
    return top.concat(bottom.reverse());
  }
  return null;
}

/* ----------------------------------------------------------- the fan -- */

/**
 * The straight lines from an anchor to the upper seam that cross no hole.
 *
 * `upper` and `lower` are the rib's surfaces in its own plane, metres, and
 * `anchor` the attachment point on the lower one. Angles are in degrees from
 * the rib's own "up" (the +v axis, square to its chord), positive towards
 * the trailing edge. A ray is clear when it reaches the upper seam before
 * the lower one and passes no hole — nor any closer to one than
 * `clearanceM`, which is the cloth a ray needs either side of it and the
 * reinforcement's edge needs from the hole's.
 *
 * Returns every ray, with where it meets the seam, and the clear intervals.
 */
export function radialFan({
  upper, lower, anchor, holes = [], clearanceM = 0, stepDeg = 0.5, limitDeg = 85, chordM = null,
}) {
  if (!Array.isArray(upper) || upper.length < 2 || !Array.isArray(lower) || lower.length < 2) {
    throw new Error('radialFan needs the rib\'s upper and lower surfaces');
  }
  if (!Array.isArray(anchor) || !anchor.every(Number.isFinite)) throw new Error('radialFan needs an anchor point');
  const U = byChord(upper);
  const L = byChord(lower);
  const span = (U[U.length - 1][0] - U[0][0]) || 1;
  // The anchor sits on the lower seam: a ray has to leave it first.
  const minT = 1e-3 * span;
  const outlines = holes
    .map((h) => holeOutline(h, U, L, chordM ?? span))
    .filter(Boolean)
    .map((o) => {
      const us = o.map((q) => q[0]);
      const vs = o.map((q) => q[1]);
      return { o, box: [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)] };
    });

  const rays = [];
  const n = Math.round((2 * limitDeg) / stepDeg);
  for (let k = 0; k <= n; k++) {
    const deg = -limitDeg + k * stepDeg;
    const d = [Math.sin(deg * DEG), Math.cos(deg * DEG)];
    const tU = rayToPolyline(anchor, d, U, minT);
    const tL = rayToPolyline(anchor, d, L, minT);
    if (!(tU < tL)) {
      rays.push({ angleDeg: deg, clear: false, endsOn: Number.isFinite(tL) ? 'lower' : 'none', seam: null, lengthM: null });
      continue;
    }
    const seam = [anchor[0] + tU * d[0], anchor[1] + tU * d[1]];
    const lo = [Math.min(anchor[0], seam[0]) - clearanceM, Math.min(anchor[1], seam[1]) - clearanceM];
    const hi = [Math.max(anchor[0], seam[0]) + clearanceM, Math.max(anchor[1], seam[1]) + clearanceM];
    let hole = null;
    for (let h = 0; h < outlines.length && hole === null; h++) {
      const { o, box } = outlines[h];
      if (box[2] < lo[0] || box[0] > hi[0] || box[3] < lo[1] || box[1] > hi[1]) continue;
      // Starting inside a hole is the plainest way of crossing one.
      const step = Math.min(0.005, tU / 2);
      if (insidePolygon([anchor[0] + step * d[0], anchor[1] + step * d[1]], o)) { hole = h; break; }
      for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
        if (clearanceM > 0
          ? segmentDistance(anchor, seam, o[j], o[i]) < clearanceM
          : segmentsCross(anchor, seam, o[j], o[i])) { hole = h; break; }
      }
    }
    rays.push({
      angleDeg: deg, clear: hole === null, endsOn: 'upper', seam, lengthM: tU,
      blockedBy: hole === null ? null : hole,
    });
  }

  const intervals = [];
  let start = null;
  for (let k = 0; k < rays.length; k++) {
    if (rays[k].clear && start === null) start = rays[k].angleDeg;
    if (!rays[k].clear && start !== null) { intervals.push([start, rays[k - 1].angleDeg]); start = null; }
  }
  if (start !== null) intervals.push([start, rays[rays.length - 1].angleDeg]);

  return {
    rays,
    intervals,
    stepDeg,
    clearanceM,
    holeCount: outlines.length,
    /** The clear interval holding `deg`, or null. */
    around(deg) {
      return intervals.find(([a, b]) => deg >= a - 1e-9 && deg <= b + 1e-9) ?? null;
    },
    /** The ray nearest `deg`. */
    at(deg) {
      const i = Math.max(0, Math.min(rays.length - 1, Math.round((deg + limitDeg) / stepDeg)));
      return rays[i];
    },
  };
}

/**
 * How the load shares out between the rays of a fan.
 *
 * Each ray carries in proportion to the cosine of its angle from the pull:
 * force per radian `a cos φ`, falling as one over the distance along it. On
 * a half-plane that is the exact elastic answer for a point load (Flamant's:
 * `a = 2F / π`), and it is the rule `vribs.js` already uses for the fibres of
 * a diagonal. A ray more than a right angle from the pull would have to
 * push, and carries nothing.
 *
 * `intervals` are the clear rays, in degrees, `pullDeg` where they have to
 * pull towards. The rays carry the pull; what they also pull ACROSS it, when
 * the fan is lopsided — a hole on one side of an anchor and none on the
 * other — is taken by the lower surface, to which the rib is sewn at the
 * anchor (`acrossN`, signed: positive means the rays pull aft of the pull and
 * the lower surface holds them forward).
 */
export function radialField({ intervals, pullDeg = 0, loadN }) {
  if (!(loadN >= 0)) throw new Error('radialField needs a non-negative load');
  const parts = [];
  for (const [p, q] of intervals ?? []) {
    const lo = Math.max((Math.min(p, q) - pullDeg) * DEG, -Math.PI / 2);
    const hi = Math.min((Math.max(p, q) - pullDeg) * DEG, Math.PI / 2);
    if (hi > lo) parts.push([lo, hi]);
  }
  let Icc = 0;
  let Ics = 0;
  for (const [lo, hi] of parts) {
    Icc += (hi - lo) / 2 + (Math.sin(2 * hi) - Math.sin(2 * lo)) / 4;
    Ics += (Math.sin(hi) ** 2 - Math.sin(lo) ** 2) / 2;
  }
  if (!(Icc > 1e-9)) {
    return {
      feasible: false, loadN, pullDeg, a: 0, acrossN: 0, intervals: [],
      forcePerRadian: () => 0, peakNPerRad: Infinity, peakDeg: pullDeg, spreadDeg: 0,
    };
  }
  const a = loadN / Icc;
  // The ray nearest the pull carries most; the pull's own when it is clear.
  let peakPhi = null;
  for (const [lo, hi] of parts) {
    const phi = Math.max(lo, Math.min(hi, 0));
    if (peakPhi === null || Math.abs(phi) < Math.abs(peakPhi)) peakPhi = phi;
  }
  const inside = (phi) => parts.some(([lo, hi]) => phi >= lo - 1e-9 && phi <= hi + 1e-9);
  return {
    feasible: true,
    loadN,
    pullDeg,
    a,
    acrossN: a * Ics,
    intervals: parts.map(([lo, hi]) => [pullDeg + lo / DEG, pullDeg + hi / DEG]),
    /** Force per radian on the ray at `deg`, newtons. */
    forcePerRadian(deg) {
      const phi = (deg - pullDeg) * DEG;
      return inside(phi) ? a * Math.cos(phi) : 0;
    },
    peakNPerRad: a * Math.cos(peakPhi),
    peakDeg: pullDeg + peakPhi / DEG,
    // The width of the fan as it works: the angle a fan carrying the same
    // load at the peak's intensity throughout would need. 90 degrees on a
    // half-plane, 54.8 for a clear 30 either side.
    spreadDeg: (Icc / DEG) / Math.max(1e-9, Math.cos(peakPhi)),
  };
}

/* ------------------------------------------------------- one anchor -- */

/**
 * The load path from one anchor: its fan, the load in it, and what the seam
 * gets.
 *
 * `upper` and `lower` are the rib's surfaces in its own plane (metres) and
 * `anchorPointM` the attachment point; `lineAngleDeg` the line's pull turned
 * round, as an angle in the fan's terms — where the rays have to pull
 * towards. Without an outline the rib is taken as a slab `depthM` deep (or
 * `ASSUMED_RIB_DEPTH` of the chord, and the result says `depthAssumed`);
 * without a line angle the pull is taken as square to the chord, and the
 * result says `lineAngleAssumed`.
 *
 * Near the tab the load is spread over the tab's width, not a point: the
 * load per metre is `q / (r + r0)` along a ray, with `r0` the distance at
 * which the fan is as wide as the tab.
 */
export function anchorLoadPath({
  anchorChordFraction, loadN, chordM,
  tabWidthM = 0.02, holes = [], clothLineLoadNPerM = 3500,
  stations = 24,
  depthM = null, anchorPointM = null,
  upper = null, lower = null,
  lineAngleDeg = null, clearanceM = 0.010, stepDeg = 0.5,
  seamStrengthNPerM = RIB_SEAM_N_PER_M,
}) {
  if (!(loadN >= 0)) throw new Error('anchorLoadPath needs a non-negative load');
  if (!(chordM > 0)) throw new Error('anchorLoadPath needs a chord');

  // The rib in its own plane.
  let U = upper;
  let L = lower;
  let A = anchorPointM;
  const outlined = Array.isArray(U) && U.length > 1 && Array.isArray(L) && L.length > 1;
  const depthAssumed = !outlined && !(depthM > 0);
  if (!outlined) {
    const d = depthM > 0 ? depthM : chordM * ASSUMED_RIB_DEPTH;
    U = [[0, d], [chordM, d]];
    L = [[0, 0], [chordM, 0]];
    A = [anchorChordFraction * chordM, 0];
  } else if (!A) {
    const u = anchorChordFraction * chordM;
    A = [u, ordinateAt(byChord(L), u)];
  }
  const lineAngleAssumed = !Number.isFinite(lineAngleDeg);
  const pull = lineAngleAssumed ? 0 : lineAngleDeg;

  const fan = radialFan({ upper: U, lower: L, anchor: A, holes, clearanceM, stepDeg, chordM });
  const straightUp = fan.at(0);
  const depth = outlined
    ? (depthM > 0 ? depthM : (straightUp.lengthM ?? null))
    : (depthM > 0 ? depthM : chordM * ASSUMED_RIB_DEPTH);
  const cap = clothLineLoadNPerM;

  // The line's own pull, and every clear ray that can pull against it.
  const interval = fan.around(pull);
  const pullRay = fan.at(pull);
  const blocked = !interval && pullRay.endsOn === 'upper' && pullRay.blockedBy !== null;
  const field = radialField({ intervals: fan.intervals, pullDeg: pull, loadN });
  if (!field.feasible) {
    return {
      fan,
      lineAngleDeg: pull,
      lineAngleAssumed,
      blocked,
      noPath: true,
      wedge: null,
      stations: [],
      peak: { distanceM: 0, widthM: tabWidthM, lineLoadNPerM: loadN / tabWidthM, utilisation: loadN / tabWidthM / cap },
      atPMADistance: { distanceM: 0.10, lineLoadNPerM: Infinity, utilisation: Infinity },
      ok: false,
      worstUtilisation: Infinity,
      reachM: depth ?? 0,
      reachesSeam: true,
      seamDistanceM: depth,
      seam: null,
      holeInPath: blocked,
      holeInBand: blocked,
      depthM: depth,
      depthAssumed,
      lineLoadModel: true,
      radialModel: true,
      note: 'no ray from the tab reaches the upper seam within a right angle of the line\'s pull',
    };
  }

  const qPeak = field.peakNPerRad;
  // Where the fan is as wide as the tab, measured back from the anchor.
  const r0 = loadN > 0 ? (qPeak * tabWidthM) / loadN : 0;
  const lineLoad = (deg, r) => field.forcePerRadian(deg) / (r + r0 || 1e-12);
  const reachM = loadN / tabWidthM > cap ? Math.max(0, qPeak / cap - r0) : 0;
  const peakRay = fan.at(field.peakDeg);
  const seamDistanceM = peakRay.lengthM ?? depth;

  // Along the most heavily loaded ray, out to the reinforcement's end or the
  // PMA needle's distance, whichever is further, but not past the seam.
  const maxDist = Math.min(Math.max(0.10, reachM), seamDistanceM ?? Infinity);
  const out = [];
  for (let i = 0; i <= stations; i++) {
    const r = (i / stations) * maxDist;
    const n = lineLoad(field.peakDeg, r);
    out.push({
      distanceM: r,
      // The width of cloth the load is in, at this distance, were it shared
      // evenly at the peak's intensity.
      widthM: n > 0 ? loadN / n : Infinity,
      lineLoadNPerM: n,
      utilisation: n / cap,
      interrupted: null,
    });
  }
  const peak = out[0];

  // The PMA needle: 100 mm up the pull, or the seam if the rib is shallower.
  // With the pull's own ray cut, the needle goes on the nearest that is not.
  const testRay = blocked ? fan.at(field.peakDeg) : pullRay;
  const rTest = Math.min(0.10, testRay.lengthM ?? 0.10);
  const nTest = lineLoad(testRay.angleDeg, rTest);
  const atTest = { distanceM: rTest, lineLoadNPerM: nTest, utilisation: nTest / cap };

  // Where the rays arrive: what each brings to the seam per metre of it.
  //
  // Measured from where the fan is as wide as the tab, not from a point: on
  // a rib a few millimetres deep — a tip thinned to 1% of its section — the
  // seam is inside the tab's own width, and the load goes into it over that
  // width, not into a point. Measured from the anchor it came to 105 kN/m.
  let seamPeak = 0;
  let seamAt = null;
  let windowM = 0;
  const live = fan.rays.filter((r) => r.clear && field.forcePerRadian(r.angleDeg) > 0);
  for (let k = 1; k < live.length; k++) {
    const r1 = live[k - 1];
    const r2 = live[k];
    if (Math.abs(r2.angleDeg - r1.angleDeg - fan.stepDeg) > 1e-6) continue;
    const ds = Math.hypot(r2.seam[0] - r1.seam[0], r2.seam[1] - r1.seam[1]);
    windowM += ds;
    const rMid = (r1.lengthM + r2.lengthM) / 2;
    const spread = rMid > 0 ? (ds * (rMid + r0)) / rMid : ds;
    const force = field.forcePerRadian((r1.angleDeg + r2.angleDeg) / 2) * fan.stepDeg * DEG;
    if (spread > 0 && force / spread > seamPeak) {
      seamPeak = force / spread;
      seamAt = [(r1.seam[0] + r2.seam[0]) / 2, (r1.seam[1] + r2.seam[1]) / 2];
    }
  }

  // A hole is IN the path where it comes within the reinforcement's reach of
  // the tab — the patch would have to be cut by it. Narrowing the fan further
  // out is already in the load: fewer rays, each carrying more.
  let nearestHoleM = Infinity;
  const U2 = byChord(U);
  const L2 = byChord(L);
  for (const h of holes) {
    const o = holeOutline(h, U2, L2, chordM);
    if (!o) continue;
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
      nearestHoleM = Math.min(nearestHoleM, pointSegmentDistance(A, o[j], o[i]));
    }
  }
  const holeInPath = blocked || nearestHoleM < reachM + clearanceM;
  // And whether a hole is what bounds the fan round the pull at all.
  const edgeByHole = interval
    ? [fan.at(interval[0] - fan.stepDeg), fan.at(interval[1] + fan.stepDeg)]
      .some((r) => r && r.angleDeg !== interval[0] && r.angleDeg !== interval[1]
        && r.endsOn === 'upper' && r.blockedBy !== null && Math.abs(r.angleDeg - pull) < 90)
    : blocked;

  return {
    fan,
    lineAngleDeg: pull,
    lineAngleAssumed,
    blocked,
    noPath: false,
    // The clear rays either side of the pull, and the width the load works
    // in. Lopsided, the rays also pull across the line, and the lower
    // surface holds them (`acrossN`).
    wedge: interval
      ? { clearFromDeg: interval[0], clearToDeg: interval[1], spreadDeg: field.spreadDeg, acrossN: field.acrossN }
      : { clearFromDeg: null, clearToDeg: null, spreadDeg: field.spreadDeg, acrossN: field.acrossN },
    field,
    /**
     * How far along the ray at `deg` the reinforcement has to reach: where
     * that ray's load per metre falls to what the cloth carries. The
     * outline this traces round the tab is the patch the load needs.
     */
    reachAt(deg) {
      return loadN / tabWidthM > cap ? Math.max(0, field.forcePerRadian(deg) / cap - r0) : 0;
    },
    stations: out,
    peak,
    atPMADistance: atTest,
    ok: peak.utilisation <= 1,
    worstUtilisation: peak.utilisation,
    reachM,
    reachesSeam: seamDistanceM != null && reachM >= seamDistanceM,
    seamDistanceM,
    seam: {
      peakLineLoadNPerM: seamPeak,
      at: seamAt,
      windowM,
      strengthNPerM: seamStrengthNPerM,
      utilisation: seamPeak / seamStrengthNPerM,
      strengthEstimated: true,
    },
    nearestHoleM,
    holeInPath,
    holeInBand: edgeByHole,
    depthM: depth,
    depthAssumed,
    lineLoadModel: true,
    radialModel: true,
    note: blocked
      ? 'a hole is across the line\'s own pull: the load has to go round it to the seam'
      : (peak.utilisation <= 1
        ? 'the cloth carries the anchor load from the tab to the seam'
        : 'the anchor load exceeds what this cloth carries at the tab: it needs reinforcement '
          + `${(reachM * 1000).toFixed(0)} mm out along the rays`),
  };
}

/**
 * How far the reinforcement must reach.
 *
 * The load spreads along its rays as it travels into the rib, so the load
 * per metre of cloth falls with distance. The reinforcement can stop where
 * it has fallen to what bare cloth carries — and if that never happens
 * inside the rib, the reinforcement has to run the whole way to the seam,
 * which is what real wings do.
 *
 * Given no fan, the rays are taken `spreadAngleDeg` either side of the pull;
 * given one (`wedge`: `{ intervals, pullDeg }`, a fan's clear rays), its own.
 */
export function reinforcementReach({
  loadN, tabWidthM = 0.02, spreadAngleDeg = 30,
  clothLineLoadNPerM = 3500, chordM = 2.45,
  // The depth of the rib at the anchor. Left out, it is `ASSUMED_RIB_DEPTH`
  // of the chord and the result says so.
  depthM = null,
  wedge = null,
}) {
  const field = radialField({
    intervals: wedge?.intervals ?? [[-spreadAngleDeg, spreadAngleDeg]],
    pullDeg: wedge?.pullDeg ?? 0,
    loadN,
  });
  // Width at which the cloth is just adequate, were the load even across it.
  const neededWidthM = loadN / clothLineLoadNPerM;
  const reachM = neededWidthM > tabWidthM && field.feasible
    ? field.peakNPerRad * (1 / clothLineLoadNPerM - tabWidthM / loadN) : 0;

  // The rib is only so deep: the path runs from the anchor to the upper
  // surface, and that is the section's thickness there — 7 to 15% of chord
  // at the anchors of a 15% section. This read a quarter of the chord, which
  // gave every rib two or three times the room it has.
  const depthAssumed = !(depthM > 0);
  const availableM = depthAssumed ? chordM * ASSUMED_RIB_DEPTH : depthM;
  const reachesSeam = reachM > availableM;

  return {
    neededWidthM,
    reachM: Math.max(0, reachM),
    availableM,
    depthAssumed,
    // The design rule this produces: at the ultimate case the tape cannot
    // stop, so it runs to the seam.
    reachesSeam,
    tabWidthM,
    note: reachM <= 0
      ? 'the tab alone is wide enough; no reinforcement length is needed'
      : (reachesSeam
        ? 'the load never falls to what bare cloth carries within the rib: '
          + 'the reinforcement must run to the surface seam'
        : `the reinforcement can stop ${(reachM * 1000).toFixed(0)} mm from `
          + 'the anchor'),
  };
}

/**
 * Every anchor on a rib.
 *
 * `anchors` are `{ name, chordFraction, loadN }`, and may carry where the
 * line meets the rib in its plane (`pointM`, metres) and which way it pulls
 * there (`lineAngleDeg`: the pull turned round, from the rib's "up",
 * positive aft), which `checkWingRibStress` reads off the line plan. The
 * useful output is not a pass but a ranking: which anchor needs the longest
 * reinforcement, and whether a hole is across a line's pull or inside its
 * reinforcement's reach.
 */
export function checkRibStress({
  rib, anchors, holes = [], cloth = 'Porcher Skytex 27 hard',
  tabWidthM = 0.02, designFactor = 1,
  // The rib's own outline, as `{ upper, lower, at(x) -> { up, lo } }` in
  // chord units (or `at` alone). A rib built by this tool carries it; a bare
  // `{ index, chord }` does not, and the depth is then assumed.
  section = null,
  clearanceM = 0.010, stepDeg = 0.5, seamStrengthNPerM = RIB_SEAM_N_PER_M,
}) {
  const spec = RIB_CLOTH[cloth];
  if (!spec) throw new Error(`Unknown rib cloth: ${cloth}`);
  const prof = section ?? (rib.upper && rib.lower ? ribProfile(rib) : null);
  const c = rib.chord;

  // The outline in metres.
  let upper = null;
  let lower = null;
  if (prof) {
    if (Array.isArray(prof.upper) && Array.isArray(prof.lower)) {
      upper = prof.upper.map(([u, v]) => [u * c, v * c]);
      lower = prof.lower.map(([u, v]) => [u * c, v * c]);
    } else if (typeof prof.at === 'function') {
      upper = [];
      lower = [];
      for (let k = 0; k <= 100; k++) {
        const x = k / 100;
        const q = prof.at(x);
        upper.push([x * c, q.up * c]);
        lower.push([x * c, q.lo * c]);
      }
    }
  }

  const paths = anchors.map((a) => {
    const loadN = a.loadN * designFactor;
    const here = prof ? prof.at(a.chordFraction) : null;
    const depthM = here ? (here.up - here.lo) * c : null;
    const anchorPointM = a.pointM ?? (here ? [a.chordFraction * c, here.lo * c] : null);
    const path = anchorLoadPath({
      anchorChordFraction: a.chordFraction,
      loadN,
      chordM: c,
      tabWidthM,
      holes,
      clothLineLoadNPerM: spec.lineLoadNPerM,
      depthM,
      anchorPointM,
      upper,
      lower,
      lineAngleDeg: Number.isFinite(a.lineAngleDeg) ? a.lineAngleDeg : null,
      clearanceM,
      stepDeg,
      seamStrengthNPerM,
    });
    const availableM = path.seamDistanceM ?? path.depthM;
    return {
      name: a.name,
      chordFraction: a.chordFraction,
      loadN,
      depthM: path.depthM,
      lineAngleDeg: path.lineAngleDeg,
      lineAngleAssumed: path.lineAngleAssumed,
      outOfPlane: Number.isFinite(a.outOfPlane) ? a.outOfPlane : null,
      reach: {
        neededWidthM: loadN / spec.lineLoadNPerM,
        reachM: path.reachM,
        availableM,
        depthAssumed: path.depthAssumed,
        reachesSeam: path.reachesSeam,
        tabWidthM,
        note: path.noPath ? path.note
          : (path.reachM <= 0 ? 'the tab alone is wide enough; no reinforcement length is needed'
            : (path.reachesSeam ? 'the reinforcement must run to the upper seam'
              : `the reinforcement can stop ${(path.reachM * 1000).toFixed(0)} mm from the anchor`)),
      },
      path,
    };
  });

  const toSeam = paths.filter((p) => p.reach.reachesSeam);
  const longest = paths.slice()
    .sort((a, b) => b.reach.reachM - a.reach.reachM)[0];
  const seamWorst = paths.reduce((m, p) => (p.path.seam && p.path.seam.utilisation > (m?.path.seam.utilisation ?? -1) ? p : m), null);

  return {
    ribIndex: rib.index,
    cloth,
    clothSpec: spec,
    paths,
    longest,
    // Anchors whose reinforcement must run all the way to the seam.
    toSeam: toSeam.map((p) => p.name),
    allReachSeam: toSeam.length === paths.length,
    depthAssumed: !prof,
    // Anchors with a hole across the line's pull or inside the reach of its
    // reinforcement, which is the placement mistake this catches.
    throughHoles: paths.filter((p) => p.path.holeInPath).map((p) => p.name),
    // Of those, the ones with no straight path to the seam at all.
    blocked: paths.filter((p) => p.path.blocked).map((p) => p.name),
    // What the upper seam gets where the rays arrive, at its worst.
    seamWorst: seamWorst ? {
      name: seamWorst.name, lineLoadNPerM: seamWorst.path.seam.peakLineLoadNPerM,
      utilisation: seamWorst.path.seam.utilisation,
    } : null,
    designFactor,
    // Carried into the result, so an estimate cannot be mistaken for a
    // measurement by anything downstream — including a person reading a
    // report and deciding what fabric to buy.
    clothProvenance: RIB_CLOTH.provenance,
    note: 'rib cloth cannot carry an anchor load at the tab; this sizes the reinforcement '
      + 'that does, and follows the load along its rays to the seam',
  };
}

/**
 * What the PMA tear test would read, given this design's own rib tension.
 *
 * The inspector pulls against cloth that is already carrying the line load.
 * A design that works the cloth hard leaves less margin for the needle, so
 * two wings in identical fabric can rate differently — which is worth knowing
 * before the wing is built rather than at its first inspection.
 */
export function predictedTearMargin({ stress, cloth = 'Porcher Skytex 27 hard' }) {
  const spec = RIB_CLOTH[cloth];
  if (!spec) throw new Error(`Unknown rib cloth: ${cloth}`);

  const u = Math.min(1, stress.longest.path.atPMADistance.utilisation);
  // The needle pulls against what is left.
  const remaining = Math.max(0, 1 - u);
  const predictedDaN = spec.tearDaN * remaining;

  return {
    clothTearDaN: spec.tearDaN,
    utilisationAtTestPoint: u,
    predictedTearDaN: predictedDaN,
    // PMA §5.3 thresholds.
    rating: predictedDaN < 0.6 ? 'fail' : (predictedDaN <= 0.7 ? 'acceptable' : 'good'),
    passesNew: predictedDaN >= 0.6,
    note: 'the inspector pulls against cloth already carrying the line load, '
      + 'so the design\'s own rib tension is part of what the test measures',
  };
}

/**
 * Which way a line pulls on its rib, in the rib's own plane.
 *
 * The line runs from the anchor (`to`) to where it joins the next level
 * (`from`). Turned round, in the rib's plane, that is the direction the
 * rays have to pull towards: degrees from the rib's "up", positive aft.
 * `outOfPlane` is the part of the pull across the rib — its sine — which the
 * rib, a membrane in its own plane, cannot take: the diagonals and the sail
 * do.
 */
export function lineAngleOnRib(rib, line) {
  if (!rib?.frame || !Array.isArray(line?.to) || !Array.isArray(line?.from)) return null;
  const a = toRibPlane(rib, line.to);
  const f = toRibPlane(rib, line.from);
  const du = a[0] - f[0];
  const dv = a[1] - f[1];
  const d3 = Math.hypot(line.from[0] - line.to[0], line.from[1] - line.to[1], line.from[2] - line.to[2]);
  const inPlane = Math.hypot(du, dv);
  if (!(d3 > 0) || !(inPlane > 0)) return null;
  return {
    pointM: a,
    lineAngleDeg: Math.atan2(du, dv) / DEG,
    outOfPlane: Math.sqrt(Math.max(0, 1 - (inPlane / d3) ** 2)),
  };
}

/**
 * Which way each row's line pulls, rib by rib: what the openings aim each
 * anchor's fan by (`buildRibHoles`'s `pulls`).
 *
 * A rib with no line of a row takes the pull of the nearest rib that has
 * one, so a rib between two loaded ones is cut like its neighbours, as real
 * wings cut every rib alike.
 */
export function linePullsByRib(wing, plan) {
  const known = new Map();
  for (const l of plan?.lines ?? []) {
    if (l.level !== 'upper' || !Number.isFinite(l.ribIndex)) continue;
    const pull = lineAngleOnRib(wing.ribs[l.ribIndex], l);
    if (!pull) continue;
    if (!known.has(l.row)) known.set(l.row, new Map());
    const m = known.get(l.row);
    if (!m.has(l.ribIndex)) m.set(l.ribIndex, pull.lineAngleDeg);
  }
  const out = wing.ribs.map(() => ({}));
  for (const [row, m] of known) {
    const at = [...m.keys()].sort((x, y) => x - y);
    for (let i = 0; i < out.length; i++) {
      let best = at[0];
      for (const k of at) if (Math.abs(k - i) < Math.abs(best - i)) best = k;
      out[i][row] = m.get(best);
    }
  }
  return out;
}

/**
 * Every rib on the wing, against its own loads and its own holes.
 *
 * The model above works on numbers handed to it. This runs it over a real
 * wing: the anchor loads from `analyseLoads`, the openings each rib really
 * has, each rib's own outline, and each line's own pull — where it meets
 * the rib and which way it pulls in the rib's plane, read off the line plan
 * (`plan`). Without a plan the section's anchor positions are used for every
 * rib and the pull is taken as square to the chord.
 */
export function checkWingRibStress({
  wing, anchorLoads, openingsFor = null, airfoil, plan = null,
  cloth = 'Porcher Skytex 27 hard', tabWidthM = 0.02, designFactor = RIB_DESIGN_FACTOR,
  clearanceM = 0.010, stepDeg = 0.5,
}) {
  const where = new Map();
  for (const l of plan?.lines ?? []) {
    if (l.level !== 'upper' || !Number.isFinite(l.ribIndex) || !Array.isArray(l.to)) continue;
    const rib = wing.ribs[l.ribIndex];
    if (!rib) continue;
    const key = `${l.row}|${l.ribIndex}`;
    if (where.has(key)) continue;
    const pull = lineAngleOnRib(rib, l);
    where.set(key, {
      chordFraction: toRibPlane(rib, l.to)[0] / rib.chord,
      pointM: pull?.pointM ?? null,
      lineAngleDeg: pull?.lineAngleDeg ?? null,
      outOfPlane: pull?.outOfPlane ?? null,
    });
  }

  const byRib = new Map();
  for (const a of anchorLoads) {
    if (!Number.isFinite(a.ribIndex)) continue;
    if (!byRib.has(a.ribIndex)) byRib.set(a.ribIndex, []);
    const w = where.get(`${a.row}|${a.ribIndex}`);
    byRib.get(a.ribIndex).push({
      name: a.name ?? `${a.row}${a.anchor}`,
      chordFraction: w?.chordFraction ?? airfoil?.anchors?.[a.row] ?? 0.1,
      pointM: w?.pointM ?? null,
      lineAngleDeg: w?.lineAngleDeg ?? null,
      outOfPlane: w?.outOfPlane ?? null,
      loadN: a.loadN,
    });
  }

  const ribs = [];
  for (const [ribIndex, anchors] of [...byRib.entries()].sort((x, y) => x[0] - y[0])) {
    const rib = wing.ribs[ribIndex];
    if (!rib) continue;
    const holes = openingsFor ? (openingsFor(rib, ribIndex) ?? []) : [];
    ribs.push(checkRibStress({
      rib, anchors, holes, cloth, tabWidthM, designFactor, clearanceM, stepDeg,
    }));
  }

  // A rib needs tape to the seam where ANY of its anchors does. This counted
  // a rib only when all of them did, so a rib whose D anchor ran out of room
  // was reported as having room.
  const toSeam = ribs.filter((r) => r.toSeam.length);
  const anchorsToSeam = toSeam.flatMap((r) => r.toSeam.map((name) => ({ ribIndex: r.ribIndex, name })));
  const withHoles = ribs.filter((r) => r.throughHoles.length);
  const blocked = ribs.flatMap((r) => r.blocked.map((name) => ({ ribIndex: r.ribIndex, name })));
  const anchorCount = ribs.reduce((n, r) => n + r.paths.length, 0);
  // The anchor that needs the longest reinforcement anywhere on the wing.
  let longest = null;
  for (const r of ribs) {
    if (!longest || r.longest.reach.reachM > longest.reachM) {
      longest = {
        ribIndex: r.ribIndex, name: r.longest.name, loadN: r.longest.loadN,
        reachM: r.longest.reach.reachM, depthM: r.longest.reach.availableM,
      };
    }
  }
  // The narrowest fan round any line's pull, on its tighter side: how close
  // the holes come to the load's path.
  let tightest = null;
  // What the upper seam gets at its worst.
  let seamWorst = null;
  const pulls = [];
  for (const r of ribs) {
    for (const p of r.paths) {
      if (!p.lineAngleAssumed) pulls.push(p.lineAngleDeg);
      const w = p.path.wedge;
      if (w && Number.isFinite(w.clearFromDeg) && Number.isFinite(w.clearToDeg)) {
        const side = Math.min(p.lineAngleDeg - w.clearFromDeg, w.clearToDeg - p.lineAngleDeg);
        if (!tightest || side < tightest.sideDeg) {
          tightest = { ribIndex: r.ribIndex, name: p.name, sideDeg: side, fromDeg: w.clearFromDeg, toDeg: w.clearToDeg, pullDeg: p.lineAngleDeg };
        }
      }
      if (p.path.seam && (!seamWorst || p.path.seam.peakLineLoadNPerM > seamWorst.lineLoadNPerM)) {
        seamWorst = {
          ribIndex: r.ribIndex, name: p.name,
          lineLoadNPerM: p.path.seam.peakLineLoadNPerM, utilisation: p.path.seam.utilisation,
        };
      }
    }
  }

  // The first rib out from the centre where it happens, if it does.
  const crossover = toSeam.length ? toSeam[0].ribIndex : null;

  return {
    ribs,
    ribCount: ribs.length,
    anchorCount,
    ribsNeedingTapeToSeam: toSeam.length,
    anchorsToSeam,
    ribsWithHolesInLoadPath: withHoles.map((r) => r.ribIndex),
    // Anchors whose line pulls where no clear ray goes: no straight path.
    blocked,
    crossoverRib: crossover,
    longest,
    tightest,
    seamWorst,
    // How the lines lean in their ribs' planes, where the plan says.
    lineAngles: pulls.length ? { min: Math.min(...pulls), max: Math.max(...pulls), count: pulls.length } : null,
    designFactor,
    cloth,
    clearanceM,
    // The whole-wing check is what the interface calls, so it is the one
    // that has to carry the provenance out. Adding it only to the per-rib
    // function left the exported report with an empty source line — an
    // honesty measure that was itself not wired.
    clothProvenance: RIB_CLOTH.provenance,
    note: blocked.length
      ? `${blocked.length} of ${anchorCount} anchors have a hole across their line's pull: `
        + 'no straight path from the tab to the seam'
      : (crossover === null
        ? 'every anchor\'s reinforcement can stop inside its rib, and every line\'s pull has '
          + 'a clear path to the seam'
        : `${anchorsToSeam.length} of ${anchorCount} anchors, on ${toSeam.length} of `
          + `${ribs.length} ribs, need their reinforcement run to the upper seam: `
          + 'the rib is not deep enough there for the load to spread'),
  };
}

/* ----------------------------------------------------------- panel stress -- */

/** Sail cloth, by the load it carries per metre of width. */
export const SAIL_CLOTH = {
  // PROVENANCE: ESTIMATED by this project. Not datasheet figures.
  //
  // Porcher publish tensile strengths for Skytex; this project does not have
  // them. These are plausible values for a ripstop of each weight, and the
  // ratio between warp and weft is the usual direction of the difference
  // rather than a measured one.
  //
  // What the module concludes — that the SEAM is the limit and not the cloth
  // — depends on the seam strength being well below the cloth strength,
  // which holds across any plausible pair. It does not depend on either
  // number being right, and a designer sizing a real wing should replace
  // both with figures from their supplier.

  // Tensile strengths as line loads. A ripstop is directional: the warp and
  // weft carry differently, and the bias carries least. The weaker of the two
  // principal directions is what a panel is limited by, because a panel is
  // loaded in both at once.
  'Porcher Skytex 27': { warpNPerM: 5600, weftNPerM: 5200, gsm: 27 },
  'Porcher Skytex 32': { warpNPerM: 6600, weftNPerM: 6100, gsm: 32 },
  'Porcher Skytex 38': { warpNPerM: 7900, weftNPerM: 7300, gsm: 38 },
  'Dominico 30D': { warpNPerM: 6200, weftNPerM: 5800, gsm: 34 },
};

// Provenance is attached non-enumerably, so `Object.values(SAIL_CLOTH)` still
// sees only materials. A table that carries its own source as an ordinary
// key becomes a table with a material called "provenance", and the first
// thing that iterates it breaks.
Object.defineProperty(SAIL_CLOTH, 'provenance', {
  value: 'ESTIMATED by this project; replace with supplier datasheet figures before sizing a real wing',
  enumerable: false,
});

/**
 * What the sail cloth carries, and whether the seams can hold it.
 *
 * A panel between two ribs is a membrane under pressure. It carries load in
 * two directions at once, and they are not the same:
 *
 * **Spanwise** — across the cell, rib to rib. The cloth bulges into an arc
 * and the tension follows the membrane equation, `T = p R`. This is the large
 * one, and `ovalization.js` already computes it: it is the same tension that
 * sets how much the panel billows.
 *
 * **Chordwise** — along the cell, nose to tail. The panel is held at both
 * ends and the surface curvature is much gentler, so the tension is lower.
 * It matters for the seams, which run chordwise and carry it in shear.
 *
 * The seams are the part worth checking. Cloth fails at a few thousand newtons
 * per metre; a sewn seam carries rather less, and it is the seam that decides
 * whether a panel holds.
 */
export function panelStress({
  spacingM, pressurePa, chordM,
  cloth = 'Porcher Skytex 27', seamStrengthNPerM = 2500,
  excessRatio = 0.06, designFactor = 1,
  tensionForBillowFn,
}) {
  const spec = SAIL_CLOTH[cloth];
  if (!spec) throw new Error(`Unknown sail cloth: ${cloth}`);
  if (!(spacingM > 0)) throw new Error('panelStress needs a rib spacing');
  if (!(chordM > 0)) throw new Error('panelStress needs a chord');

  const p = pressurePa * designFactor;

  // Spanwise: the membrane arc between ribs.
  const billow = tensionForBillowFn({ spacingM, excessRatio, pressurePa: p });
  const spanwise = billow.tensionNPerM;

  // Chordwise: not a free membrane, and modelling it as one was wrong.
  //
  // The first version took the same membrane relation over a radius of
  // chord/2, which made the chordwise tension larger than the spanwise one on
  // every panel. That is backwards. A panel is not free chordwise — it is
  // sewn to a rib along its whole length at each end, and the rib holds the
  // aerofoil shape against the pressure. **That is what ribs are for.**
  //
  // So the chordwise load path is into the ribs through the seams, not into
  // the cloth as membrane tension. What the cloth carries chordwise is the
  // small residual between rib stations, over the aerofoil's own radius of
  // curvature, which is large everywhere except at the nose.
  //
  // It is reported as the shear the seam has to pass into the rib rather than
  // as a second membrane tension, because that is the load that actually has
  // somewhere to fail.
  const chordwiseIntoRibsNPerM = (p * spacingM) / 2;

  // The cloth's limit is its weaker principal direction, because the panel is
  // loaded in both at once and the weave cannot choose.
  const clothLimit = Math.min(spec.warpNPerM, spec.weftNPerM);
  // The membrane tension is the spanwise one; that is what the cloth carries.
  const worst = spanwise;

  return {
    spanwiseNPerM: spanwise,
    // Shear the seam passes into the rib, not a second membrane tension.
    chordwiseIntoRibsNPerM,
    worstNPerM: worst,
    billowRadiusM: billow.radiusM,
    cloth,
    clothLimitNPerM: clothLimit,
    clothUtilisation: worst / clothLimit,
    // The seam runs chordwise and carries the spanwise tension across itself.
    seamStrengthNPerM,
    seamUtilisation: spanwise / seamStrengthNPerM,
    designFactor,
    ok: worst <= clothLimit && spanwise <= seamStrengthNPerM,
    membraneModel: 'spanwise only; chordwise load goes into the ribs',
    // Which fails first, which is the useful answer: it says what to change.
    limitedBy: (spanwise / seamStrengthNPerM) > (worst / clothLimit)
      ? 'seam' : 'cloth',
    note: (spanwise / seamStrengthNPerM) > (worst / clothLimit)
      ? 'the seam is the limit, not the cloth: a stronger fabric would not '
        + 'help, a wider seam or closer ribs would'
      : 'the cloth is the limit, so a stronger fabric would help',
  };
}

/**
 * Every panel on the wing, at a dynamic pressure and a load factor.
 *
 * `dynamicPressurePa` is the wing's own at 1 g — its wing loading over its
 * lift coefficient, about 70 Pa for a 95 kg wing of 22 m2 — and
 * `designFactor` the load case, which multiplies it. `peakCp` is the
 * pressure difference across the cloth in units of that: the cell at close
 * to stagnation pressure inside, suction outside.
 *
 * The first use of this put 400 Pa in and multiplied by eight. That is a
 * wing at 92 km/h pulling 8 g, and what it "found" — that a 12-cell wing's
 * root panels exceed their seams, and that this is why real wings have
 * closer ribs in the middle — was the input, not the wing. At the wing's own
 * pressure the widest panel is at a seventh of its seam at 8 g, and real
 * wings have their WIDEST cells in the middle.
 */
export function checkWingPanelStress({
  wing, dynamicPressurePa, peakCp = 1.5,
  cloth = 'Porcher Skytex 27', seamStrengthNPerM = 2500,
  designFactor = 1, tensionForBillowFn,
}) {
  const panels = [];
  for (let i = 0; i < wing.ribs.length - 1; i++) {
    const a = wing.ribs[i];
    const b = wing.ribs[i + 1];
    const spacing = Math.abs((b.station ?? 0) - (a.station ?? 0));
    if (!(spacing > 0)) continue;
    const chord = (a.chord + b.chord) / 2;
    panels.push({
      cell: i,
      spacingM: spacing,
      chordM: chord,
      ...panelStress({
        spacingM: spacing,
        chordM: chord,
        pressurePa: peakCp * dynamicPressurePa,
        cloth,
        seamStrengthNPerM,
        designFactor,
        tensionForBillowFn,
      }),
    });
  }

  const failing = panels.filter((p) => !p.ok);
  const worst = panels.slice()
    .sort((a, b) => Math.max(b.clothUtilisation, b.seamUtilisation)
      - Math.max(a.clothUtilisation, a.seamUtilisation))[0] ?? null;

  return {
    panels,
    failing,
    ok: failing.length === 0,
    worst,
    // Tension goes with the width of the cell, so the widest cell — the
    // centre one, on a wing whose cells narrow with its chord — is the worst.
    seamLimited: panels.filter((p) => p.limitedBy === 'seam').length,
    clothLimited: panels.filter((p) => p.limitedBy === 'cloth').length,
    designFactor,
    clothProvenance: SAIL_CLOTH.provenance,
    note: failing.length === 0
      ? `all ${panels.length} panels hold; worst is cell ${worst?.cell} at `
        + `${(Math.max(worst?.clothUtilisation ?? 0, worst?.seamUtilisation ?? 0) * 100).toFixed(0)}%`
      : `${failing.length} of ${panels.length} panels exceed cloth or seam`,
  };
}
