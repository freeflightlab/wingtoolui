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
export function massBudget({ bom, reinforcement, publishedKg = null }) {
  const cloth = bom.totals.fabricMassKg;
  const line = bom.totals.lineMassKg;
  const reinf = reinforcement ? reinforcement.massKg : 0;
  const accounted = cloth + line + reinf;
  return {
    clothKg: cloth,
    lineKg: line,
    reinforcementKg: reinf,
    accountedKg: accounted,
    publishedKg,
    gapKg: publishedKg != null ? publishedKg - accounted : null,
    gapFraction: publishedKg != null ? (publishedKg - accounted) / publishedKg : null,
    stillMissing: reinforcement ? reinforcement.notCounted : ['reinforcement', 'rods', 'thread'],
  };
}
