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
 * load has to reach the sail. The material directly above an anchor is
 * structure, not spare weight, and a hole placed across that path is the
 * classic way to build a rib that fails at its tabs.
 *
 * **Webs between holes.** Two holes separated by a few millimetres of fabric
 * are one big hole with a decorative strip through it.
 *
 * So the generator places holes into the space that remains after those are
 * subtracted, rather than placing holes and checking afterwards — a check
 * that fails leaves the designer with nothing, while a constrained placement
 * always yields something buildable.
 */

/** Defaults in fractions of chord or of local rib thickness. */
export const DEFAULT_HOLE_RULES = {
  // Chordwise band the holes may occupy.
  fromLE: 0.14,          // no holes ahead of this: nose reinforcement
  toTE: 0.88,            // nor behind this: trailing edge is thin and sewn
  // Fraction of local thickness left as a band at each surface.
  surfaceMargin: 0.22,
  // Clear of an anchor by this fraction of chord, either side.
  anchorClearance: 0.035,
  // Minimum fabric left between two holes, as a fraction of chord.
  webWidth: 0.030,
  // Smallest hole worth cutting; below this the seam work costs more than
  // the weight saved.
  minWidth: 0.035,
  cornerRadius: 0.25,    // as a fraction of the hole's half-height
};

/**
 * Build the holes for one rib.
 *
 * Returns polygons in the rib's own plane — the same coordinates the rib view
 * and the DXF rib export use, so a hole drawn on screen is the hole that
 * gets cut.
 */
export function buildRibHoles(rib, airfoil, rules = {}) {
  const R = { ...DEFAULT_HOLE_RULES, ...rules };
  const chord = rib.chord;

  // Rib profile in its own plane: chordwise x from the leading edge, and the
  // upper and lower ordinates.
  const prof = ribProfile(rib);

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
    holes.push(makeHole(prof, a, b, R, chord));
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
  };
}

/** One hole, as a rounded polygon following the section's own shape. */
function makeHole(prof, x0, x1, R, chord) {
  const n = 24;
  const top = [];
  const bottom = [];
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
    top.push([x * chord, (mid + h) * chord]);
    bottom.push([x * chord, (mid - h) * chord]);
  }
  const outline = top.concat(bottom.slice().reverse());
  return {
    fromChord: x0,
    toChord: x1,
    outline,
    widthM: (x1 - x0) * chord,
    areaM2: Math.abs(holePolygonArea(outline)),
  };
}

function ribProfile(rib) {
  const xLE = rib.xLE;
  const b = (rib.betaDeg * Math.PI) / 180;
  const oy = rib.lobePoint[0];
  const oz = rib.lobePoint[1];
  const flat = ([x, y, z]) => [
    (x - xLE) / rib.chord,
    (-(y - oy) * Math.sin(b) + (z - oz) * Math.cos(b)) / rib.chord,
  ];
  const upper = rib.upper.map(flat);
  const lower = rib.lower.map(flat);
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
export function buildAllRibHoles(wing, airfoil, { rules = {}, ribCloth = 0.040 } = {}) {
  const sets = wing.ribs.map((rib) => buildRibHoles(rib, airfoil, rules));
  const ribArea = sets.reduce((s, x) => s + x.ribAreaM2, 0) * 2;
  const holeArea = sets.reduce((s, x) => s + x.holeAreaM2, 0) * 2;
  return {
    sets,
    ribAreaM2: ribArea,
    holeAreaM2: holeArea,
    removedFraction: ribArea > 0 ? holeArea / ribArea : 0,
    // kg, both sides of the wing.
    solidMassKg: ribArea * ribCloth,
    holedMassKg: (ribArea - holeArea) * ribCloth,
    massSavedKg: holeArea * ribCloth,
    ribClothKgPerM2: ribCloth,
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
