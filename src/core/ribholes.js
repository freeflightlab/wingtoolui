/* ribholes.js — lightening holes and cross-ports.
 *
 * A rib is a sheet of fabric doing two jobs: holding the section shape, and
 * carrying line load from its anchor points up into the sail. Most of its
 * area does neither. Cutting that area away saves weight and lets air move
 * between cells, and every production wing does it — the rib view built
 * earlier shows a solid rib, which no real wing has.
 *
 * The interesting part is not the holes but the material that must stay.
 *
 * --------------------------------------------------------------------------
 * What has to be left
 * --------------------------------------------------------------------------
 * **Margins at the surfaces.** The rib is sewn to the upper and lower sail
 * along its whole length, and the seam needs material either side of it. Cut
 * too close and the seam tears out along the stitch line.
 *
 * **A band at the leading edge.** The nose carries the highest pressure and
 * the most abrupt curvature, and on most wings a mylar reinforcement as well.
 * Holes there weaken exactly the part that shapes the intake.
 *
 * **Load paths from the anchors.** A line anchor pulls on the rib, and that
 * load has to reach the sail. Cloth only pulls, so it goes along straight
 * rays from the tab to the upper seam, fanned round the line's own pull
 * (`ribstress.js`), and a hole placed across them is the classic way to
 * build a rib that fails at its tabs. So each anchor keeps a disc round its
 * tab and a fan of rays to the seam, aimed the way its line pulls — the A
 * lines lean forward and the D lines aft — rather than a band straight up.
 *
 * **Webs between holes.** Two holes separated by a few millimetres of fabric
 * are one big hole with a decorative strip through it.
 *
 * So the generator places holes into the space that remains after those are
 * subtracted, rather than placing holes and checking afterwards — a check
 * that fails leaves the designer with nothing, while a constrained placement
 * always yields something buildable.
 */

import { toRibPlane, ribCopies } from './wing3d.js';

/** Defaults in fractions of chord or of local rib thickness. */
export const DEFAULT_HOLE_RULES = {
  // Chordwise band the holes may occupy.
  fromLE: 0.14,          // no holes ahead of this: nose reinforcement
  toTE: 0.88,            // nor behind this: trailing edge is thin and sewn
  // Fraction of local thickness left as a band at each surface.
  surfaceMargin: 0.22,
  // Clear of an anchor by this fraction of chord, either side: the tab and
  // the reinforcement round it.
  anchorClearance: 0.035,
  // And clear of the rays its load takes to the upper seam: this many
  // degrees either side of the line's pull, and `fanClearanceM` more. The
  // two built designs here leave their fans 24 to 67 degrees wide as they
  // work; 20 either side is 38.
  fanHalfAngleDeg: 20,
  fanClearanceM: 0.010,
  // Minimum fabric left between two holes, as a fraction of chord.
  webWidth: 0.030,
  // Smallest hole worth cutting; below this the seam work costs more than
  // the weight saved.
  minWidth: 0.035,
  cornerRadius: 0.25,    // as a fraction of the hole's half-height
  // Clear of a rod by this fraction of chord, and never by less than
  // `rodClearanceMinM`: a rod's pocket is sewn to the rib, and has to have
  // rib to be sewn to. The Swoop2's own holes keep 1.28% of chord from its
  // own rods on every rib — 27 mm at the root, 10 mm at its outermost rod,
  // which is the smallest gap in that design and the floor here.
  rodClearance: 0.013,
  rodClearanceMinM: 0.010,
};

/**
 * Build the holes for one rib.
 *
 * Returns polygons in the rib's own plane — the same coordinates the rib view
 * and the DXF rib export use, so a hole drawn on screen is the hole that
 * gets cut.
 */
export function buildRibHoles(rib, airfoil, rules = {}, { rods = null, pulls = null } = {}) {
  const R = { ...DEFAULT_HOLE_RULES, ...rules };
  const chord = rib.chord;
  // Rods on this rib, as they lie in its plane (metres): the openings are
  // shaped to keep clear of them. Placed without knowing about the rods, the
  // first opening came within 7 mm of the end of a nose rod at the root and
  // 2.5 mm at the tip, where the one real design here keeps 27 and 10.
  const keepClear = rods && rods.length
    ? { rods, distanceM: Math.max(R.rodClearance * chord, R.rodClearanceMinM) } : null;

  // Rib profile in its own plane: chordwise x from the leading edge, and the
  // upper and lower ordinates.
  const prof = ribProfile(rib);

  // Each anchor's fan: from the tab, round the way its line pulls (`pulls`,
  // degrees from the rib's own up, positive aft, by row); square to the
  // chord where nothing says.
  const fans = Object.entries(airfoil.anchors || {})
    .filter(([, f]) => Number.isFinite(f))
    .map(([row, f]) => ({
      row,
      point: [f * chord, prof.at(f).lo * chord],
      pullDeg: Number.isFinite(pulls?.[row]) ? pulls[row] : 0,
      halfAngleDeg: R.fanHalfAngleDeg,
      clearanceM: R.fanClearanceM,
    }));

  // Chordwise positions that must be kept clear: the anchors, plus the
  // intake, which is a cut-out already.
  const anchors = Object.values(airfoil.anchors || {}).sort((a, b) => a - b);
  const blocked = anchors.map((f) => [f - R.anchorClearance, f + R.anchorClearance]);
  if (airfoil.intake) {
    blocked.push([airfoil.intake.start - R.anchorClearance,
      airfoil.intake.end + R.anchorClearance]);
  }
  blocked.sort((a, b) => a[0] - b[0]);

  // The chordwise gaps left over, which is where holes may go.
  const gaps = [];
  let cursor = R.fromLE;
  for (const [lo, hi] of blocked) {
    if (lo > cursor) gaps.push([cursor, Math.min(lo, R.toTE)]);
    cursor = Math.max(cursor, hi);
  }
  if (cursor < R.toTE) gaps.push([cursor, R.toTE]);

  const holes = [];
  for (const [lo, hi] of gaps) {
    // Leave a web at each end of the gap as well, so a hole never runs into
    // the material protecting an anchor.
    const a = lo + R.webWidth / 2;
    const b = hi - R.webWidth / 2;
    if (b - a < R.minWidth) continue;
    const h = makeHole(prof, a, b, R, chord, keepClear, fans);
    if (h) holes.push(h);
  }

  const ribArea = profileArea(prof) * chord * chord;
  const holeArea = holes.reduce((s, h) => s + h.areaM2, 0);

  return {
    holes,
    ribIndex: rib.index,
    chord,
    ribAreaM2: ribArea,
    holeAreaM2: holeArea,
    // How much of the rib has been removed. Production wings run high — a
    // rib is mostly hole by the time it is finished.
    removedFraction: ribArea > 0 ? holeArea / ribArea : 0,
    rules: R,
    gaps,
    blocked,
    fans,
  };
}

/**
 * How high a hole may reach at `xM` without entering an anchor's fan.
 *
 * The fan is the wedge of rays from the tab, `halfAngleDeg` either side of
 * the line's pull; a point beside it, at the same station, is below the
 * wedge's edge, and has to be `clearanceM` below it measured square to the
 * edge. Infinity where no fan is overhead.
 */
function underFans(xM, fans) {
  let top = Infinity;
  for (const f of fans ?? []) {
    const dx = xM - f.point[0];
    if (Math.abs(dx) < 1e-12) { top = Math.min(top, f.point[1]); continue; }
    // The fan's edge on this side, as an angle from up, positive towards
    // the station.
    const edgeDeg = dx > 0 ? f.pullDeg + f.halfAngleDeg : f.halfAngleDeg - f.pullDeg;
    if (edgeDeg <= 0) continue;                                        // the fan leans away
    if (edgeDeg >= 90) { top = Math.min(top, f.point[1]); continue; }  // it covers the whole side
    const e = (edgeDeg * Math.PI) / 180;
    const vEdge = f.point[1] + Math.abs(dx) / Math.tan(e);
    top = Math.min(top, vEdge - f.clearanceM / Math.sin(e));
  }
  return top;
}

/** One hole, as a rounded polygon following the section's own shape. */
function makeHole(prof, x0, x1, R, chord, keepClear = null, fans = null) {
  // More stations where the edge has to turn round the end of a rod, or
  // along the edge of a fan.
  const n = keepClear || fans?.length ? 48 : 24;
  const top = [];
  const bottom = [];
  // Rods as closely spaced points, so the clearance can be taken as a
  // distance: the hole's edge keeps `distanceM` from every one of them,
  // which rounds it off about the end of a rod instead of stepping.
  const rodPoints = [];
  if (keepClear) {
    const step = keepClear.distanceM / 6;
    for (const rod of keepClear.rods) {
      for (let k = 1; k < rod.length; k++) {
        const a = rod[k - 1];
        const b = rod[k];
        const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
        for (let q = k === 1 ? 0 : 1; q <= m; q++) {
          rodPoints.push([a[0] + ((b[0] - a[0]) * q) / m, a[1] + ((b[1] - a[1]) * q) / m]);
        }
      }
    }
  }
  // How high the edge may go under the rods above this station, and how low
  // over the rods below it.
  const limits = (xM, midM) => {
    let above = Infinity;
    let below = -Infinity;
    if (!keepClear) return { above, below };
    const D = keepClear.distanceM;
    for (const [u, v] of rodPoints) {
      const dx = Math.abs(u - xM);
      if (dx >= D) continue;
      const reach = Math.sqrt(D * D - dx * dx);
      if (v >= midM) above = Math.min(above, v - reach);
      else below = Math.max(below, v + reach);
    }
    return { above, below };
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const { up, lo } = prof.at(x);
    const mid = (up + lo) / 2;
    const half = (up - lo) / 2;
    // Taper the hole to nothing at each end, so the corners are rounded
    // rather than cut square into the web.
    const ends = Math.sin(Math.PI * t) ** R.cornerRadius;
    const h = half * (1 - R.surfaceMargin) * ends;
    let yTop = (mid + h) * chord;
    let yBottom = (mid - h) * chord;
    if (keepClear) {
      const lim = limits(x * chord, mid * chord);
      yTop = Math.min(yTop, lim.above);
      yBottom = Math.max(yBottom, lim.below);
    }
    // Under the edges of the fans either side.
    if (fans?.length) yTop = Math.min(yTop, underFans(x * chord, fans));
    top.push([x * chord, yTop]);
    bottom.push([x * chord, yBottom]);
  }
  // Where a fan has closed the hole at an end, it starts and stops where
  // the fan's edge meets the bottom of it: found between the last station
  // closed and the first open, so the hole still comes to a point.
  const gap = top.map((p, i) => p[1] - bottom[i][1]);
  let first = 0;
  let last = top.length - 1;
  while (first < top.length && gap[first] < -1e-12) first++;
  while (last > first && gap[last] < -1e-12) last--;
  if (first >= last) return null;
  const cap = (i, j) => {
    // Between station j (closed) and i (open): where the gap is zero.
    const f = gap[i] / (gap[i] - gap[j]);
    const u = top[i][0] + f * (top[j][0] - top[i][0]);
    const v = bottom[i][1] + f * (bottom[j][1] - bottom[i][1]);
    return [u, v];
  };
  const T = [];
  const Bm = [];
  if (first > 0) { const p0 = cap(first, first - 1); T.push(p0); Bm.push(p0); }
  for (let i = first; i <= last; i++) {
    // Nothing left between two rods inside the hole: it closes here.
    if (gap[i] < 0) { const m = (top[i][1] + bottom[i][1]) / 2; T.push([top[i][0], m]); Bm.push([top[i][0], m]); continue; }
    T.push(top[i]);
    Bm.push(bottom[i]);
  }
  if (last < top.length - 1) { const p1 = cap(last, last + 1); T.push(p1); Bm.push(p1); }
  const outline = T.concat(Bm.slice().reverse());
  const from = T[0][0] / chord;
  const to = T[T.length - 1][0] / chord;
  if ((to - from) < R.minWidth) return null;
  return {
    fromChord: from,
    toChord: to,
    outline,
    widthM: (to - from) * chord,
    areaM2: Math.abs(holePolygonArea(outline)),
  };
}

/** A rib's own outline in chord units: `{ upper, lower, at(x) -> { up, lo } }`. */
export function ribProfile(rib) {
  // The section as cut, in chord units. This inverted the dihedral by hand,
  // with the sign the placement used to have; once the placement was
  // corrected, the holes it placed landed up to 30 mm outside the rib.
  const c = rib.chord;
  const own = (poly3, poly2) => (poly2
    ? poly2.map(([u, v]) => [u / c, v / c])
    : poly3.map((p) => toRibPlane(rib, p).map((v) => v / c)));
  const upper = own(rib.upper, rib.section?.upper);
  const lower = own(rib.lower, rib.section?.lower);
  const at = (x) => ({ up: interp(upper, x), lo: interp(lower, x) });
  return { upper, lower, at };
}

function interp(poly, x) {
  for (let i = 1; i < poly.length; i++) {
    if (poly[i][0] >= x) {
      const f = (x - poly[i - 1][0]) / ((poly[i][0] - poly[i - 1][0]) || 1);
      return poly[i - 1][1] + f * (poly[i][1] - poly[i - 1][1]);
    }
  }
  return poly[poly.length - 1][1];
}

function profileArea(prof) {
  let a = 0;
  const n = 200;
  for (let i = 0; i < n; i++) {
    const x0 = i / n;
    const x1 = (i + 1) / n;
    const t0 = prof.at(x0);
    const t1 = prof.at(x1);
    a += (((t0.up - t0.lo) + (t1.up - t1.lo)) / 2) * (x1 - x0);
  }
  return a;
}

function holePolygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
}

/**
 * Check a hole set against the rules it was built to.
 *
 * Placement is constrained rather than checked, so this should always pass —
 * which is the point. It is a guard against a change to the placement code
 * that quietly starts cutting through a load path, and it verifies the
 * properties independently of the code that enforces them.
 */
export function checkRibHoles(set, airfoil) {
  const R = set.rules;
  const problems = [];
  const anchors = Object.values(airfoil.anchors || {});

  for (const h of set.holes) {
    if (h.fromChord < R.fromLE - 1e-9) {
      problems.push({ hole: h, reason: 'ahead of the nose margin' });
    }
    if (h.toChord > R.toTE + 1e-9) {
      problems.push({ hole: h, reason: 'behind the trailing-edge margin' });
    }
    for (const a of anchors) {
      if (h.fromChord < a + R.anchorClearance - 1e-9
        && h.toChord > a - R.anchorClearance + 1e-9) {
        problems.push({ hole: h, reason: `crosses the load path at ${a.toFixed(3)}` });
      }
    }
    // And no point of it inside the rays an anchor's load takes to the seam.
    if (Array.isArray(h.outline) && set.fans?.length) {
      for (const f of set.fans) {
        const tooHigh = h.outline.some(([u, v]) => v > underFans(u, [f]) + 1e-6);
        if (tooHigh) problems.push({ hole: h, reason: `enters the fan of the ${f.row} anchor` });
      }
    }
  }

  // Webs between consecutive holes.
  const sorted = set.holes.slice().sort((a, b) => a.fromChord - b.fromChord);
  for (let i = 1; i < sorted.length; i++) {
    const web = sorted[i].fromChord - sorted[i - 1].toChord;
    if (web < R.webWidth - 1e-9) {
      problems.push({ hole: sorted[i], reason: `web of ${web.toFixed(4)} chord is too narrow` });
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    holeCount: set.holes.length,
    removedFraction: set.removedFraction,
    minWebChord: sorted.length > 1
      ? Math.min(...sorted.slice(1).map((h, i) => h.fromChord - sorted[i].toChord))
      : null,
  };
}

/**
 * Holes for every rib, with the mass they save.
 *
 * Rib cloth is the third-largest fabric item on a wing after the two sail
 * surfaces, so this is not a rounding error: a wing with 50 ribs at a metre
 * of chord carries several square metres of rib.
 */
export function buildAllRibHoles(wing, airfoil, {
  rules = {}, ribCloth = 0.040, rodsByRib = null, pullsByRib = null,
} = {}) {
  const sets = wing.ribs.map((rib, i) => buildRibHoles(rib, airfoil, rules,
    { rods: rodsByRib ? rodsByRib[i] ?? null : null, pulls: pullsByRib ? pullsByRib[i] ?? null : null }));
  // The whole wing: every rib twice, except one on the centreline, which the
  // wing has once. Doubling the half counted the centre rib — the largest
  // rib there is — as two.
  const ribArea = sets.reduce((s, x, i) => s + x.ribAreaM2 * ribCopies(wing, i), 0);
  const holeArea = sets.reduce((s, x, i) => s + x.holeAreaM2 * ribCopies(wing, i), 0);
  return {
    sets,
    ribAreaM2: ribArea,
    holeAreaM2: holeArea,
    removedFraction: ribArea > 0 ? holeArea / ribArea : 0,
    // kg, the whole wing.
    solidMassKg: ribArea * ribCloth,
    holedMassKg: (ribArea - holeArea) * ribCloth,
    massSavedKg: holeArea * ribCloth,
    ribClothKgPerM2: ribCloth,
  };
}

/**
 * The rib cloth of the whole wing, with the openings the wing actually has.
 *
 * What a bill of materials needs: every rib's area, less what is cut out of
 * it — this tool's own openings, a design's own holes when it states them
 * (`ownHoles`, a map from rib index to outlines in the rib's plane, metres),
 * or nothing at all when the ribs are left solid.
 *
 * The interface's bill asked for this under a name nothing ever set, so it
 * had no ribs in it at all: fifty ribs of a metre and a half each, missing,
 * under a line that said only that their holes had not been counted.
 */
export function ribClothTotals(wing, airfoil, {
  ribCloth = 0.040, openings = true, ownHoles = null, rules = {}, rodsByRib = null, pullsByRib = null,
} = {}) {
  const polygonArea = (pts) => {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    }
    return Math.abs(a / 2);
  };
  let ribArea = 0;
  let holeArea = 0;
  let holeCount = 0;
  let ribCount = 0;
  wing.ribs.forEach((rib, i) => {
    const copies = ribCopies(wing, i);
    const set = buildRibHoles(rib, airfoil, rules,
      { rods: rodsByRib ? rodsByRib[i] ?? null : null, pulls: pullsByRib ? pullsByRib[i] ?? null : null });
    ribCount += copies;
    ribArea += set.ribAreaM2 * copies;
    if (!openings) return;
    if (ownHoles) {
      const own = ownHoles.get(rib.index) ?? [];
      holeArea += own.reduce((t, h) => t + polygonArea(h.outline), 0) * copies;
      holeCount += own.length * copies;
    } else {
      holeArea += set.holeAreaM2 * copies;
      holeCount += set.holes.length * copies;
    }
  });
  return {
    ribCount,
    holeCount,
    ribAreaM2: ribArea,
    holeAreaM2: holeArea,
    removedFraction: ribArea > 0 ? holeArea / ribArea : 0,
    solidMassKg: ribArea * ribCloth,
    holedMassKg: (ribArea - holeArea) * ribCloth,
    massSavedKg: holeArea * ribCloth,
    ribClothKgPerM2: ribCloth,
    source: !openings ? 'solid' : ownHoles ? 'the design\'s own holes' : 'this tool\'s openings',
  };
}

/* ------------------------------------------------------------ cross-ports -- */

/**
 * Cross-ports.
 *
 * Lightening holes are sized by what can be removed. Cross-ports are sized by
 * what has to pass through them, which makes them a different problem wearing
 * the same clothes.
 *
 * A paraglider is inflated through the cell openings at the nose, but only
 * some ribs face an opening — the closed ribs behind a diagonal, and the ribs
 * of a closed cell, are fed entirely through their neighbours. If the path
 * between cells is too restricted the wing inflates unevenly on launch and,
 * worse, re-inflates slowly after a collapse, which is when it matters.
 *
 * ---------------------------------------------------------------------------
 * Sizing them
 * ---------------------------------------------------------------------------
 * The requirement is a flow area, not a fraction of the rib. Treating a
 * cross-port as an orifice, the volume that has to move through it during
 * re-inflation is the cell volume it feeds, and the time available is set by
 * how quickly a wing must recover. So
 *
 *     A_required = V_cell / (Cd * v * t)
 *
 * with `Cd` an orifice coefficient near 0.62 for a sharp-edged hole in
 * fabric, `v` the pressure-driven flow speed, and `t` the target time.
 *
 * The flow speed comes from the pressure difference the wing generates:
 * `v = sqrt(2 dp / rho)`, and `dp` at flying speed is a fraction of dynamic
 * pressure. This is a first-order estimate and stated as one — it ignores
 * duct losses, the fact that flow crosses several ribs in series, and the
 * changing volume as the cell fills.
 *
 * What it is good for is the comparison the designer actually needs: whether
 * the ports drawn are the right order of size, and how the requirement moves
 * with cell volume and target recovery time.
 */
export const DEFAULT_CROSSPORT_RULES = {
  dischargeCoefficient: 0.62,   // sharp-edged orifice in fabric
  targetInflationS: 1.5,        // time allowed to fill one cell
  pressureFraction: 0.85,       // internal pressure as a fraction of dynamic
  // Placement, in the same terms as the lightening holes.
  fromLE: 0.18,
  toTE: 0.70,
  surfaceMargin: 0.30,          // more conservative than a lightening hole
  anchorClearance: 0.045,
  minCount: 1,
  maxCount: 3,
};

/**
 * Required cross-port area for one cell.
 *
 * @param {number} cellVolumeM3
 * @param {object} o  speedMS, rho, and the rules above
 */
export function crossPortRequirement(cellVolumeM3, {
  speedMS = 11,
  rho = 1.225,
  rules = {},
} = {}) {
  const R = { ...DEFAULT_CROSSPORT_RULES, ...rules };
  const dynamic = 0.5 * rho * speedMS * speedMS;
  const dp = dynamic * R.pressureFraction;
  const flowMS = Math.sqrt((2 * dp) / rho);
  const areaM2 = cellVolumeM3 / (R.dischargeCoefficient * flowMS * R.targetInflationS);
  return {
    cellVolumeM3,
    pressurePa: dp,
    flowMS,
    requiredAreaM2: areaM2,
    requiredAreaCM2: areaM2 * 1e4,
    targetInflationS: R.targetInflationS,
    note: 'first-order orifice estimate; ignores duct losses and ribs in series',
  };
}

/** Volume of the cell between two ribs, by prismatic approximation. */
export function cellVolume(ribA, ribB) {
  const areaOf = (rib) => {
    const prof = ribProfile(rib);
    return profileArea(prof) * rib.chord * rib.chord;
  };
  const span = Math.abs(ribB.station - ribA.station);
  return ((areaOf(ribA) + areaOf(ribB)) / 2) * span;
}

/**
 * Place cross-ports in a rib, sized to feed the cells either side of it.
 *
 * Placed in the same space the lightening holes use and subject to the same
 * constraints, because they are cut from the same fabric — but sized from the
 * flow requirement rather than from what is spare. Where the requirement
 * exceeds what the available space can hold, that is reported rather than
 * quietly cutting an undersized port.
 */
export function buildCrossPorts(rib, neighbour, airfoil, {
  speedMS = 11, rho = 1.225, rules = {},
} = {}) {
  const R = { ...DEFAULT_CROSSPORT_RULES, ...rules };
  const volume = neighbour ? cellVolume(rib, neighbour) : 0;
  const need = crossPortRequirement(volume, { speedMS, rho, rules: R });

  // Reuse the lightening-hole placement, with the tighter cross-port rules.
  const slots = buildRibHoles(rib, airfoil, {
    fromLE: R.fromLE,
    toTE: R.toTE,
    surfaceMargin: R.surfaceMargin,
    anchorClearance: R.anchorClearance,
    webWidth: DEFAULT_HOLE_RULES.webWidth,
    minWidth: DEFAULT_HOLE_RULES.minWidth,
  });

  // Take the largest available openings, up to the count allowed, and scale
  // them to meet the requirement rather than filling the space.
  const candidates = slots.holes.slice()
    .sort((a, b) => b.areaM2 - a.areaM2)
    .slice(0, R.maxCount);
  const available = candidates.reduce((s, h) => s + h.areaM2, 0);
  const scale = available > 0 ? Math.min(1, need.requiredAreaM2 / available) : 0;

  const ports = candidates.map((h) => ({
    ...h,
    // Shrink about the hole's own centre, so a scaled port stays inside the
    // margins the placement respected.
    outline: scalePolygon(h.outline, Math.sqrt(scale)),
    areaM2: h.areaM2 * scale,
    scaledFrom: h.areaM2,
  }));

  const provided = ports.reduce((s, h) => s + h.areaM2, 0);
  return {
    ports,
    requirement: need,
    availableAreaM2: available,
    providedAreaM2: provided,
    // The check that matters: can the space hold what the flow needs?
    sufficient: available >= need.requiredAreaM2 - 1e-12,
    shortfallM2: Math.max(0, need.requiredAreaM2 - available),
    utilisation: available > 0 ? provided / available : 0,
    cellVolumeM3: volume,
  };
}

function scalePolygon(pts, k) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/* ------------------------------------------------------- rib openings -- */

/**
 * The openings in a rib, treated as one thing.
 *
 * Lightening holes and cross-ports were generated as two independent sets,
 * and the collision check found them overlapping by up to 270 mm on the root
 * rib. The obvious reading is that two generators need to cooperate. The
 * actual reading is that **they are the same openings**.
 *
 * A hole cut in a rib does both jobs at once: it removes weight, and it lets
 * air pass between the cells either side. That is how a real rib works — the
 * holes are the ventilation. Placing a separate set of "cross-ports" beside
 * them models a wing nobody builds.
 *
 * Measured on the test wing, the lightening holes exceed the flow requirement
 * by about six times at every station:
 *
 *   rib    hole area   flow needs    margin
 *    0      1874 cm2      293 cm2      6.4x
 *    8      1243 cm2      147 cm2      8.5x
 *   16       363 cm2       14 cm2     25.9x
 *
 * So the flow requirement is not what sizes the openings on a normal rib —
 * weight is. The requirement still matters, because it is what says whether a
 * rib that *cannot* be holed much still breathes: a heavily reinforced rib, a
 * rib crowded with anchors, or one where the margins leave almost no room.
 * That is the case this reports.
 */
export function ribOpenings(rib, neighbour, airfoil, {
  rules = {}, speedMS = 11, rho = 1.225, rods = null, pulls = null,
} = {}) {
  const holes = buildRibHoles(rib, airfoil, rules, { rods, pulls });
  const volume = neighbour ? cellVolume(rib, neighbour) : 0;
  const need = crossPortRequirement(volume, { speedMS, rho, rules });

  const openAreaM2 = holes.holeAreaM2;
  const margin = need.requiredAreaM2 > 0 ? openAreaM2 / need.requiredAreaM2 : Infinity;

  return {
    ...holes,
    // The same openings, reported against both jobs they do.
    ventilationAreaM2: openAreaM2,
    ventilationRequiredM2: need.requiredAreaM2,
    ventilationMarginRatio: margin,
    ventilates: openAreaM2 >= need.requiredAreaM2 - 1e-12,
    requirement: need,
    // Sized by weight or by flow — on a normal rib it is weight, and saying
    // which is the useful output.
    sizedBy: margin >= 1 ? 'weight' : 'flow',
    shortfallM2: Math.max(0, need.requiredAreaM2 - openAreaM2),
    // If the openings cannot pass enough air, the answer is to enlarge them,
    // not to cut a second set: a rib has one set of openings and a second
    // would compete for the same fabric.
    enlargement: margin >= 1 ? null : {
      areaFactor: need.requiredAreaM2 / openAreaM2,
      linearFactor: Math.sqrt(need.requiredAreaM2 / openAreaM2),
      advice: 'enlarge the existing openings rather than cutting new ones',
    },
  };
}

/* --------------------------------------------------- internal collisions -- */

/**
 * Check that a rib's internal parts do not want the same fabric.
 *
 * Lightening holes, cross-ports, diagonal landings and attachment tabs are
 * each generated correctly and **independently**. Each respects its own
 * margins. Nothing has been checking that two of them do not occupy the same
 * chordwise band of the same rib — and they easily can, because they are all
 * placed into the space the anchors leave.
 *
 * `checkTabClearance` does this for tabs against lightening holes. This is
 * the general form, and it exists because a rib that passes every individual
 * rule can still be uncuttable.
 *
 * Everything is compared as a chordwise interval, which is the axis they
 * compete on. Two parts overlapping in chord but at different heights in the
 * section are reported as touching rather than colliding, since a hole near
 * the upper surface and a diagonal landing near the lower can share a station.
 */
export function checkRibInternals({
  chordM,
  holes = [],
  ports = [],
  diagonalLandings = [],
  tabs = [],
  minSeparationChord = 0.02,
} = {}) {
  const parts = [];
  const add = (list, kind, from, to, name) => {
    for (const [i, item] of list.entries()) {
      const a = from(item);
      const b = to(item);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      parts.push({ kind, name: name(item, i), from: Math.min(a, b), to: Math.max(a, b) });
    }
  };

  add(holes, 'lightening hole', (h) => h.fromChord, (h) => h.toChord,
    (h, i) => `hole ${i + 1}`);
  add(ports, 'cross-port', (p) => p.fromChord, (p) => p.toChord,
    (p, i) => `port ${i + 1}`);
  add(diagonalLandings, 'diagonal', (d) => d.fromChord, (d) => d.toChord,
    (d, i) => d.name ?? `diagonal ${i + 1}`);
  // A tab is a point on the chord; give it the width it actually occupies.
  for (const t of tabs) {
    if (!Number.isFinite(t.chordFraction)) continue;
    const half = chordM ? (t.widthM / 2) / chordM : 0.01;
    parts.push({
      kind: 'tab', name: t.name,
      from: t.chordFraction - half, to: t.chordFraction + half,
    });
  }

  parts.sort((a, b) => a.from - b.from);
  const collisions = [];
  const tight = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      if (b.from >= a.to) break;                       // sorted: no later part can overlap
      const overlap = Math.min(a.to, b.to) - Math.max(a.from, b.from);
      if (overlap > 0) {
        collisions.push({
          a: `${a.kind} ${a.name}`, b: `${b.kind} ${b.name}`,
          overlapChord: overlap,
          overlapMM: chordM ? overlap * chordM * 1000 : null,
        });
      }
    }
  }
  // And parts that clear but only just.
  for (let i = 1; i < parts.length; i++) {
    const gap = parts[i].from - parts[i - 1].to;
    if (gap >= 0 && gap < minSeparationChord) {
      tight.push({
        a: `${parts[i - 1].kind} ${parts[i - 1].name}`,
        b: `${parts[i].kind} ${parts[i].name}`,
        gapChord: gap,
        gapMM: chordM ? gap * chordM * 1000 : null,
      });
    }
  }

  return {
    parts,
    collisions,
    tight,
    ok: collisions.length === 0,
    partCount: parts.length,
    kinds: [...new Set(parts.map((p) => p.kind))],
    minSeparationChord,
  };
}

export function allRibOpenings(wing, airfoil, opts = {}) {
  const { rodsByRib = null, pullsByRib = null, ...rest } = opts;
  const sets = wing.ribs.map((rib, i) => ribOpenings(
    rib, wing.ribs[i + 1] ?? null, airfoil,
    { ...rest, rods: rodsByRib ? rodsByRib[i] ?? null : null, pulls: pullsByRib ? pullsByRib[i] ?? null : null },
  ));
  const short = sets.filter((s) => !s.ventilates && s.ventilationRequiredM2 > 0);
  const ratios = sets
    .filter((s) => Number.isFinite(s.ventilationMarginRatio))
    .map((s) => s.ventilationMarginRatio);

  return {
    sets,
    ribCount: sets.length,
    underPorted: short,
    allVentilate: short.length === 0,
    worstMarginRatio: ratios.length ? Math.min(...ratios) : Infinity,
    medianMarginRatio: ratios.length
      ? ratios.slice().sort((a, b) => a - b)[Math.floor(ratios.length / 2)] : Infinity,
    // The whole wing: each rib twice, but one on the centreline once.
    holeAreaM2: sets.reduce((a, s, i) => a + s.holeAreaM2 * ribCopies(wing, i), 0),
  };
}
