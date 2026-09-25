/* reinforcement.js — where a wing is strengthened, and what it costs.
 *
 * The bill of materials counts cloth and line and says, at the bottom of
 * every printout, that reinforcement is not counted. On a 22 m^2 wing the
 * bill comes to 2.4 kg against a finished weight of 3.5 to 4.5 kg, and
 * reinforcement is the largest single item in that gap.
 *
 * It is placed rather than calculated: a designer decides where a wing needs
 * help, and the rules are conventions rather than derivations. What can be
 * done honestly is to place it consistently, total it, and let the mass show
 * up where the omission currently is.
 *
 * ---------------------------------------------------------------------------
 * Four kinds, doing four different jobs
 * ---------------------------------------------------------------------------
 * **Mylar at the intakes.** The nose has to hold its shape against the
 * highest pressure on the wing, and fabric alone does not. A strip of mylar
 * or a rod pocket runs along each rib either side of the opening.
 *
 * **Dacron at the anchors.** A line pulls on a point, and a point load on
 * ripstop tears it. A patch spreads that load into the rib.
 *
 * **Tape along the trailing edge.** The edge is sewn, loaded in tension along
 * its length, and handled every flight.
 *
 * **Seam tape** where two panels meet, on wings that use it.
 *
 * Only the first two are load-bearing in any structural sense. The other two
 * are wear and handling, which is why a light wing drops them first.
 */

/** Areal weights, kg per square metre, and widths in metres. */
export const DEFAULT_REINFORCEMENT = {
  mylar: { gsm: 0.170, widthM: 0.045 },        // stiff film, heavy for its area
  dacron: { gsm: 0.120, patchM: 0.055 },       // woven patch at an anchor
  trailingEdgeTape: { gsm: 0.055, widthM: 0.020 },
  seamTape: { gsm: 0.030, widthM: 0.012 },
  // Which to fit. A light wing typically keeps the first two.
  fitMylar: true,
  fitDacron: true,
  fitTrailingEdge: true,
  fitSeamTape: false,
};

/**
 * Place and total the reinforcement for a wing.
 *
 * @param {object} wing
 * @param {object} airfoil   for the intake and anchor positions
 * @param {object} o         spec overrides, and the line plan for anchor counts
 */
export function buildReinforcement(wing, airfoil, { spec = {}, plan = null } = {}) {
  const R = { ...DEFAULT_REINFORCEMENT, ...spec };
  const items = [];

  const ribs = wing.ribs;
  const sides = 2;

  // ---- mylar along each rib, either side of the intake --------------------
  if (R.fitMylar) {
    // Two strips per rib, each running the length of the intake plus a margin.
    const intake = airfoil.intake || { start: 0.012, end: 0.055 };
    let lengthM = 0;
    for (const rib of ribs) {
      const span = Math.max(0.04, (intake.end - intake.start) * rib.chord) + 0.03;
      lengthM += span * 2;
    }
    lengthM *= sides;
    items.push({
      item: 'Mylar at the intakes',
      lengthM,
      areaM2: lengthM * R.mylar.widthM,
      massKg: lengthM * R.mylar.widthM * R.mylar.gsm,
      count: ribs.length * 2 * sides,
      why: 'holds the nose shape against the highest pressure on the wing',
    });
  }

  // ---- dacron patches at every line anchor -------------------------------
  if (R.fitDacron) {
    // One patch per anchor. Take the count from the plan where there is one,
    // rather than assuming a row on every rib.
    const anchorCount = plan
      ? plan.lines.filter((l) => l.level === 'upper').length
      : ribs.length * Object.keys(airfoil.anchors || { A: 0, B: 0, C: 0 }).length;
    const areaEach = R.dacron.patchM * R.dacron.patchM;
    items.push({
      item: 'Dacron at the anchors',
      count: anchorCount * sides,
      areaM2: anchorCount * sides * areaEach,
      massKg: anchorCount * sides * areaEach * R.dacron.gsm,
      why: 'spreads a point load that would otherwise tear the ripstop',
    });
  }

  // ---- tape along the trailing edge --------------------------------------
  if (R.fitTrailingEdge) {
    let lengthM = 0;
    for (let i = 0; i < ribs.length - 1; i++) {
      lengthM += Math.abs(ribs[i + 1].station - ribs[i].station);
    }
    lengthM *= sides;
    items.push({
      item: 'Trailing edge tape',
      lengthM,
      areaM2: lengthM * R.trailingEdgeTape.widthM,
      massKg: lengthM * R.trailingEdgeTape.widthM * R.trailingEdgeTape.gsm,
      why: 'the edge is sewn, loaded along its length and handled every flight',
    });
  }

  // ---- seam tape ---------------------------------------------------------
  if (R.fitSeamTape) {
    // Every chordwise seam, which is one per rib per surface.
    let lengthM = 0;
    for (const rib of ribs) lengthM += rib.chord * 2;
    lengthM *= sides;
    items.push({
      item: 'Seam tape',
      lengthM,
      areaM2: lengthM * R.seamTape.widthM,
      massKg: lengthM * R.seamTape.widthM * R.seamTape.gsm,
      why: 'optional; a light wing drops this first',
    });
  }

  const massKg = items.reduce((s, i) => s + i.massKg, 0);
  return {
    items,
    massKg,
    spec: R,
    // What is still not counted, so the total is not read as a wing weight.
    notCounted: ['rods and rod pockets', 'thread', 'risers and hardware webbing',
      'the bag, and anything that is not part of the wing'],
  };
}

/**
 * How much of a target wing weight the tool can now account for.
 *
 * The useful output is not the total but the **gap**: a designer comparing a
 * build against a published weight wants to know what the model does not yet
 * see, and how big it is.
 */
export function massBudget({ bom, reinforcement, rods = null, publishedKg = null }) {
  const cloth = bom.totals.fabricMassKg;
  const line = bom.totals.lineMassKg;
  const reinf = reinforcement ? reinforcement.massKg : 0;
  const rodMass = rods ? rods.massKg : 0;
  const accounted = cloth + line + reinf + rodMass;
  return {
    clothKg: cloth,
    lineKg: line,
    reinforcementKg: reinf,
    rodsKg: rodMass,
    accountedKg: accounted,
    publishedKg,
    gapKg: publishedKg != null ? publishedKg - accounted : null,
    gapFraction: publishedKg != null ? (publishedKg - accounted) / publishedKg : null,
    // Rods leave the list once they are counted, so the remainder is always
    // what is genuinely still unmodelled rather than a fixed disclaimer.
    stillMissing: (reinforcement ? reinforcement.notCounted : ['reinforcement', 'rods', 'thread'])
      .filter((m) => !(rods && /rod/.test(m))),
  };
}

/* ----------------------------------------------------------------- rods -- */

/**
 * Leading-edge rods.
 *
 * The largest single item in the mass gap, and the one a light wing feels
 * most. A rod is a nylon or carbon rod sewn into a sleeve along the nose,
 * holding the leading edge open so the wing keeps its intake shape at low
 * angles of attack and reinflates cleanly after a collapse. Before rods, that
 * job was done by fabric stiffness and mylar alone, and wings needed a larger
 * nose radius to manage without.
 *
 * ---------------------------------------------------------------------------
 * What decides the length
 * ---------------------------------------------------------------------------
 * A rod runs from the leading edge back along the rib, far enough to control
 * the curvature that matters and no further — every millimetre past that is
 * weight and pack volume. Makers typically run to somewhere between 25% and
 * 45% of chord, longer on the ribs that face a cell opening and shorter on
 * the closed ones behind a diagonal.
 *
 * The rod follows the rib's own surface rather than a straight line, so its
 * length is an arc length along the profile, not a chord fraction times the
 * chord. On a cambered nose the difference is a few per cent — small, and
 * exactly the sort of small that a mass budget accumulates over a hundred
 * rods.
 *
 * Diameter is the designer's choice, and mass goes as the square of it: a
 * 1.4 mm rod weighs twice a 1.0 mm rod for the same length. That is the trade
 * this exists to make visible.
 */

/** Rod materials: density in kg/m^3, and what they are for. */
export const ROD_MATERIALS = {
  // PROVENANCE: bulk material densities, which are standard physical
  // constants rather than product figures. The notes are engineering
  // judgement about behaviour, not measurements.
  nylon: { densityKgM3: 1140, note: 'forgiving, recovers from a kink, heavier' },
  carbon: { densityKgM3: 1600, note: 'stiffer for its mass, but breaks rather than bends' },
  'nitinol': { densityKgM3: 6450, note: 'shape memory; used sparingly at the tips' },
};

// Provenance is attached non-enumerably, so `Object.values(ROD_MATERIALS)` still
// sees only materials. A table that carries its own source as an ordinary
// key becomes a table with a material called "provenance", and the first
// thing that iterates it breaks.
Object.defineProperty(ROD_MATERIALS, 'provenance', {
  value: 'bulk material densities; the notes are judgement not measurement',
  enumerable: false,
});

export const DEFAULT_ROD_SPEC = {
  material: 'nylon',
  diameterMM: 1.3,
  // Fraction of chord the rod runs back along the upper surface.
  extentOpen: 0.42,      // ribs facing a cell opening
  extentClosed: 0.28,    // closed ribs, which need less
  sleeveGsm: 0.030,      // the fabric sleeve the rod sits in
  sleeveWidthM: 0.018,
  everyRib: true,
};

/**
 * Rods for a wing.
 *
 * @param {object} wing
 * @param {object} o  spec overrides, plus `closedRibs` — the indices that do
 *                    not face a cell opening, which take the shorter rod.
 */
export function buildRods(wing, { spec = {}, closedRibs = null } = {}) {
  const R = { ...DEFAULT_ROD_SPEC, ...spec };
  const mat = ROD_MATERIALS[R.material];
  if (!mat) throw new Error(`Unknown rod material: ${R.material}`);

  const closed = new Set(closedRibs || []);
  const areaM2 = Math.PI * ((R.diameterMM / 2000) ** 2);
  const rods = [];

  for (const rib of wing.ribs) {
    const isClosed = closed.has(rib.index);
    const extent = isClosed ? R.extentClosed : R.extentOpen;
    // Arc length along the upper surface out to the extent, not a straight
    // line: the nose is where the profile curves most.
    const lengthM = upperArcLength(rib, extent);
    rods.push({
      ribIndex: rib.index,
      closed: isClosed,
      extentChord: extent,
      lengthM,
      // A straight chordwise measure, for comparison.
      chordwiseM: extent * rib.chord,
      massKg: lengthM * areaM2 * mat.densityKgM3,
    });
  }

  const sides = 2;
  const totalLengthM = rods.reduce((s, r) => s + r.lengthM, 0) * sides;
  const rodMass = rods.reduce((s, r) => s + r.massKg, 0) * sides;
  const sleeveMass = totalLengthM * R.sleeveWidthM * R.sleeveGsm;
  const straight = rods.reduce((s, r) => s + r.chordwiseM, 0) * sides;

  return {
    rods,
    material: R.material,
    diameterMM: R.diameterMM,
    count: rods.length * sides,
    totalLengthM,
    rodMassKg: rodMass,
    sleeveMassKg: sleeveMass,
    massKg: rodMass + sleeveMass,
    // How much the curvature costs against a straight-line estimate.
    straightLengthM: straight,
    curvatureExcess: straight > 0 ? totalLengthM / straight - 1 : 0,
    spec: R,
  };
}

/** Arc length along the upper surface from the leading edge to a chord fraction. */
function upperArcLength(rib, extentChord) {
  const b = (rib.betaDeg * Math.PI) / 180;
  const oy = rib.lobePoint[0];
  const oz = rib.lobePoint[1];
  const flat = ([x, y, z]) => [
    (x - rib.xLE) / rib.chord,
    (-(y - oy) * Math.sin(b) + (z - oz) * Math.cos(b)) / rib.chord,
  ];
  const pts = rib.upper.map(flat);
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] > extentChord) {
      // Partial final segment, so the length does not jump with sampling.
      const f = (extentChord - pts[i - 1][0]) / ((pts[i][0] - pts[i - 1][0]) || 1);
      s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * Math.max(0, f);
      break;
    }
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return s * rib.chord;
}

/* ------------------------------------------------------ attachment tabs -- */

/**
 * Line attachment tabs.
 *
 * The line plan ends at a point on a rib. Nothing is at that point. A line
 * cannot be sewn to a point — it is sewn to a **tab**: a folded strip of
 * reinforced cloth, stitched along the rib's lower edge, projecting far
 * enough below the sail that the line's loop can pass through it without the
 * knot bearing on the sail itself.
 *
 * ---------------------------------------------------------------------------
 * What decides the size
 * ---------------------------------------------------------------------------
 * **The seam carries the load, and the seam is the tab's width.** A line
 * pulling 25 daN through a 40 mm tab loads its stitch line at 6 daN per
 * centimetre; through a 20 mm tab, at 12. Tab width is therefore not a
 * styling choice but the direct consequence of the tension the line plan
 * already computes, and this is where those two halves of the project meet.
 *
 * **Projection has to clear the knot.** Too short and the line's loop bears
 * against the sail, chafing it; too long and the tab flutters and adds drag.
 *
 * **A tab cannot sit where the rib has been cut away.** Tabs and lightening
 * holes compete for the same rib, and the hole rules already keep clear of
 * anchors — but only if both are generated from the same anchor positions.
 * `checkTabClearance` verifies that rather than assuming it.
 */

export const DEFAULT_TAB = {
  // Strength of the stitching, daN per centimetre of seam. A doubled Dacron
  // tab zigzagged to a reinforced rib edge is good for roughly this; it is a
  // workshop figure rather than a measured one, and it is the number most
  // worth replacing with a test result.
  seamStrengthDaNPerCm: 25,
  // The design case the tab is sized for. Sizing on the 1 g line tension puts
  // every tab at minimum width and tells the designer nothing — the same
  // mistake the line selection avoids by sizing on the certification case.
  loadFactor: 8,
  safetyFactor: 1.5,
  minWidthM: 0.020,
  maxWidthM: 0.060,
  projectionM: 0.022,
  // The tab is folded, so its cut length is twice the projection plus the
  // seam allowance at each end.
  foldAllowanceM: 0.010,
  clothGsm: 0.120,
};

/**
 * Tabs for a line plan.
 *
 * Width comes from the tension each anchor actually carries, so a design
 * change that loads a row harder produces wider tabs rather than the same
 * tabs quietly closer to failure.
 */
export function buildTabs({ plan, tensions = null, airfoil, spec = {} } = {}) {
  const T = { ...DEFAULT_TAB, ...spec };
  const anchors = plan.lines.filter((l) => l.level === 'upper');
  const byName = tensions
    ? new Map(tensions.lines.map((l) => [l.name, l.tensionN])) : null;

  const tabs = anchors.map((a) => {
    const tensionN = byName ? (byName.get(a.name) ?? 0) : 0;
    const tensionDaN = tensionN / 10;
    const designDaN = tensionDaN * T.loadFactor * T.safetyFactor;
    // Width the stitching needs to carry the design load.
    const needed = designDaN / T.seamStrengthDaNPerCm / 100;   // metres
    const widthM = Math.min(T.maxWidthM, Math.max(T.minWidthM, needed));
    const cutLengthM = 2 * T.projectionM + 2 * T.foldAllowanceM;
    return {
      name: a.name,
      row: a.row,
      ribIndex: a.ribIndex ?? null,
      chordFraction: (airfoil.anchors && airfoil.anchors[a.row]) ?? null,
      tensionDaN,
      designDaN,
      widthM,
      projectionM: T.projectionM,
      cutLengthM,
      areaM2: widthM * cutLengthM,
      massKg: widthM * cutLengthM * T.clothGsm,
      // What the stitching actually sees.
      seamLoadDaNPerCm: widthM > 0 ? designDaN / (widthM * 100) : 0,
      widthLimitedBy: needed > T.maxWidthM ? 'maximum'
        : (needed < T.minWidthM ? 'minimum' : 'load'),
    };
  });

  const sides = 2;
  const overloaded = tabs.filter((t) => t.seamLoadDaNPerCm > T.seamStrengthDaNPerCm + 1e-9);
  return {
    tabs,
    count: tabs.length * sides,
    totalAreaM2: tabs.reduce((s, t) => s + t.areaM2, 0) * sides,
    massKg: tabs.reduce((s, t) => s + t.massKg, 0) * sides,
    // A tab that has hit the maximum width and still exceeds its seam load is
    // a real design problem: the answer is another anchor, not a wider tab.
    overloaded,
    ok: overloaded.length === 0,
    spec: T,
    loadSized: tabs.filter((t) => t.widthLimitedBy === 'load').length,
    floorSized: tabs.filter((t) => t.widthLimitedBy === 'minimum').length,
  };
}

/**
 * Do the tabs clash with the rib's lightening holes?
 *
 * Both are generated from the same anchor positions, so they should not — but
 * "should not" is exactly the kind of assumption that survives a refactor of
 * one of the two and not the other.
 */
export function checkTabClearance(tabSet, holeSet, { chordM } = {}) {
  const problems = [];
  for (const t of tabSet.tabs) {
    if (t.chordFraction == null) continue;
    const halfWidth = chordM ? (t.widthM / 2) / chordM : 0.01;
    for (const h of holeSet.holes) {
      if (t.chordFraction + halfWidth > h.fromChord
        && t.chordFraction - halfWidth < h.toChord) {
        problems.push({
          tab: t.name,
          chordFraction: t.chordFraction,
          hole: [h.fromChord, h.toChord],
        });
      }
    }
  }
  return {
    ok: problems.length === 0,
    problems,
    checked: tabSet.tabs.filter((t) => t.chordFraction != null).length,
  };
}

/**
 * Rods as chord-range groups, which is how a real design file describes them.
 *
 * `buildRods` above places one rod per rib running back from the nose, which
 * is the common case and what the handbook describes. Real wings are not
 * limited to that: LEparagliding's section 21 defines rods as **groups**, each
 * a chord range over a rib range, and a wing may have several.
 *
 * Laboratori d'envol's own Swoop2 has two groups — 12 to 18.5% and 7 to 15%
 * of chord over ribs 1 to 25, then 23.5 to 29.5% and 63 to 70% — so a rod is
 * not always at the leading edge and not always alone.
 *
 * This is the group form. It sits beside `buildRods` rather than replacing
 * it, because the simple case is still the common one and the two produce the
 * same kind of output.
 */
export function rodGroup({
  fromChord, toChord, fromRib, toRib,
  diameterMM = 1.3, material = 'nylon', surface = 'upper', name = 'rod',
}) {
  if (!(toChord > fromChord)) {
    throw new Error('rodGroup needs toChord aft of fromChord');
  }
  if (!(toRib >= fromRib)) {
    throw new Error('rodGroup needs toRib outboard of fromRib');
  }
  const mat = ROD_MATERIALS[material];
  if (!mat) throw new Error(`Unknown rod material: ${material}`);
  return {
    name, fromChord, toChord, fromRib, toRib, surface,
    diameterMM, material, mat,
    chordSpan: toChord - fromChord,
  };
}

/** Every rod a set of groups produces, with length and mass. */
export function buildRodGroups({ wing, groups }) {
  const rods = [];
  for (const g of groups) {
    const areaM2 = Math.PI * ((g.diameterMM / 2000) ** 2);
    for (let i = g.fromRib; i <= Math.min(g.toRib, wing.ribs.length - 1); i++) {
      const rib = wing.ribs[i];
      if (!rib) continue;
      const lengthM = rib.chord * g.chordSpan;
      rods.push({
        group: g.name,
        rib: i,
        surface: g.surface,
        fromChord: g.fromChord,
        toChord: g.toChord,
        chordM: rib.chord,
        lengthM,
        diameterMM: g.diameterMM,
        massG: lengthM * areaM2 * g.mat.densityKgM3 * 1000,
      });
    }
  }

  const byDiameter = {};
  for (const r of rods) {
    const d = byDiameter[r.diameterMM] ||= { count: 0, lengthM: 0, massG: 0 };
    d.count += 2;
    d.lengthM += r.lengthM * 2;
    d.massG += r.massG * 2;
  }

  const totalLengthM = rods.reduce((a, r) => a + r.lengthM, 0) * 2;
  const totalMassG = rods.reduce((a, r) => a + r.massG, 0) * 2;

  return {
    rods,
    count: rods.length * 2,
    totalLengthM,
    totalMassG,
    byDiameter,
    note: `${rods.length * 2} rods, ${totalLengthM.toFixed(1)} m, `
      + `${totalMassG.toFixed(0)} g`,
  };
}

/**
 * Do the rods clash with anything else in the rib?
 *
 * A rod occupies a band of chord, and so do the lightening holes and the line
 * anchors. They are placed by separate rules that do not know about each
 * other — the trap `checkRibInternals` was written for, met again with a
 * component it does not know about.
 *
 * A rod cannot pass through a hole, and an anchor tab sewn over a rod puts
 * its load into a hinge.
 */
export function checkRodClearance({
  rods, holes = [], anchors = [], marginChord = 0.01,
}) {
  const clashes = [];
  for (const r of rods) {
    for (const h of holes) {
      const from = Math.min(h.fromChord, h.toChord);
      const to = Math.max(h.fromChord, h.toChord);
      if (r.fromChord < to + marginChord && r.toChord > from - marginChord) {
        clashes.push({ kind: 'hole', rib: r.rib, group: r.group });
      }
    }
    for (const a of anchors) {
      const x = a.chordFraction ?? a;
      if (x > r.fromChord - marginChord && x < r.toChord + marginChord) {
        clashes.push({ kind: 'anchor', rib: r.rib, group: r.group, at: x });
      }
    }
  }
  return {
    clashes,
    ok: clashes.length === 0,
    holeClashes: clashes.filter((c) => c.kind === 'hole').length,
    anchorClashes: clashes.filter((c) => c.kind === 'anchor').length,
    marginChord,
    note: clashes.length === 0
      ? 'no rod overlaps a hole or an anchor'
      : `${clashes.length} clash(es): a rod cannot pass through a hole, and an `
        + 'anchor tab sewn over a rod puts its load into a hinge',
  };
}

/**
 * A rod that wraps the nose, which is what most leading-edge rods do.
 *
 * `rodGroup` puts a rod on one surface. Laboratori d'envol's own Swoop2 does
 * not work that way. Its section 21 defines two groups, and each carries
 * **both** an upper and a lower extent:
 *
 *     group 1   upper 12.0 to 18.5%    lower 7.0 to 15.0%
 *     group 2   upper 23.5 to 29.5%    lower 63.0 to 70.0%
 *
 * The first is a leading-edge rod: it runs back from the nose along the upper
 * surface and forward along the lower, so the two extents together wrap round
 * the nose and hold its radius. That is the whole point of a leading-edge rod
 * — the nose is where an unpressurised wing loses its shape first, and a rod
 * on one surface only would hinge at the nose rather than hold it.
 *
 * The second group is something else: a rod at 23.5 to 29.5% of the upper
 * surface and another at 63 to 70% of the lower, which are two separate
 * stiffeners rather than one wrapping piece.
 *
 * So a group carries a list of extents, and whether they wrap is a property
 * of where they sit rather than a flag anyone sets.
 */
export function noseRodGroup({
  upperFrom, upperTo, lowerFrom, lowerTo,
  fromRib, toRib, diameterMM = 1.3, material = 'nylon', name = 'nose',
}) {
  const parts = [];
  if (upperTo != null) {
    parts.push(rodGroup({
      fromChord: upperFrom, toChord: upperTo, fromRib, toRib,
      diameterMM, material, surface: 'upper', name: `${name} upper`,
    }));
  }
  if (lowerTo != null) {
    parts.push(rodGroup({
      fromChord: lowerFrom, toChord: lowerTo, fromRib, toRib,
      diameterMM, material, surface: 'lower', name: `${name} lower`,
    }));
  }
  if (!parts.length) {
    throw new Error('noseRodGroup needs at least one surface extent');
  }

  // A pair wraps the nose when both extents reach forward of it. If either
  // starts well aft, they are two separate stiffeners that happen to share a
  // group, and calling that a nose rod would be wrong.
  const NOSE = 0.20;
  const wrapsNose = parts.length === 2
    && parts.every((p) => p.fromChord <= NOSE);

  return {
    name,
    parts,
    wrapsNose,
    fromRib,
    toRib,
    diameterMM,
    note: wrapsNose
      ? 'both extents reach the nose, so the pair wraps it and holds its '
        + 'radius; a rod on one surface alone would hinge there instead'
      : 'the extents do not both reach the nose, so these are separate '
        + 'stiffeners rather than one wrapping piece',
  };
}



/**
 * Rod groups written out, the way section 21 of a LEP file states them.
 *
 * A single from/to pair describes one rod on one surface. A real wing has
 * several, and a leading-edge rod needs an extent on each surface to wrap the
 * nose. Four sliders cannot say that; a written spec can:
 *
 *     # name          upper        lower        dia  ribs
 *     leading edge    12.0 18.5    7.0 15.0     1.5  0 25
 *     mid             23.5 29.5    63.0 70.0    1.1  0 25
 *
 * Which is the Swoop2's own definition, transcribed.
 *
 * Percentages of chord, because that is how the file states them and how a
 * rod scales with the wing. A dash in place of a pair means no rod on that
 * surface.
 */
export function parseRodSpec(text, { ribCount = null } = {}) {
  if (typeof text !== 'string') throw new Error('parseRodSpec needs text');

  const groups = [];
  const problems = [];
  let lineNo = 0;

  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;

    // name may contain spaces, so the numbers are found from the right.
    const tok = line.split(/\s+/);
    const nums = [];
    while (tok.length && (/^-?[\d.]+$/.test(tok[tok.length - 1]) || tok[tok.length - 1] === '-')) {
      nums.unshift(tok.pop());
    }
    const name = tok.join(' ') || `rod ${groups.length + 1}`;

    // upper pair, lower pair, diameter, rib range.
    if (nums.length < 7) {
      problems.push(`line ${lineNo}: expected "name upperFrom upperTo `
        + `lowerFrom lowerTo diameter fromRib toRib", got ${nums.length} numbers`);
      continue;
    }
    const [uf, ut, lf, lt, dia, fr, tr] = nums;
    const pct = (v) => (v === '-' ? null : Number(v) / 100);

    const g = {
      name,
      upperFrom: pct(uf), upperTo: pct(ut),
      lowerFrom: pct(lf), lowerTo: pct(lt),
      diameterMM: Number(dia),
      fromRib: Math.round(Number(fr)),
      toRib: Math.round(Number(tr)),
    };

    if (g.upperTo == null && g.lowerTo == null) {
      problems.push(`line ${lineNo}: "${name}" has no extent on either surface`);
      continue;
    }
    for (const [lab, from, to] of [['upper', g.upperFrom, g.upperTo],
      ['lower', g.lowerFrom, g.lowerTo]]) {
      if (to != null && !(to > from)) {
        problems.push(`line ${lineNo}: "${name}" ${lab} runs ${from} to ${to}, `
          + 'which is backwards');
      }
      if (to != null && (from < 0 || to > 1)) {
        problems.push(`line ${lineNo}: "${name}" ${lab} is outside the chord`);
      }
    }
    if (!ROD_MATERIALS.nylon || !(g.diameterMM > 0)) {
      problems.push(`line ${lineNo}: "${name}" needs a positive diameter`);
    }
    if (!(g.toRib >= g.fromRib)) {
      problems.push(`line ${lineNo}: "${name}" rib range ${g.fromRib} to `
        + `${g.toRib} is backwards`);
    }
    if (ribCount != null && g.toRib > ribCount - 1) {
      problems.push(`line ${lineNo}: "${name}" reaches rib ${g.toRib} but the `
        + `wing has ${ribCount}`);
    }

    groups.push(g);
  }

  if (!groups.length) problems.push('the spec defines no rods');

  return {
    groups,
    problems,
    ok: problems.length === 0,
    count: groups.length,
    note: problems.length === 0
      ? `${groups.length} rod group${groups.length > 1 ? 's' : ''}`
      : `${problems.length} problem(s): ${problems[0]}`,
  };
}

/** The spec text for the Swoop2's own rods, as a starting point. */
export const SWOOP2_ROD_SPEC = `# name        upper        lower       dia  ribs
leading edge  12.0 18.5    7.0 15.0    1.5  0 25
mid           23.5 29.5    63.0 70.0   1.1  0 25`;
