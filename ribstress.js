/* ribstress.js — what the rib cloth actually carries.
 *
 * This project computes where the anchors go, what load each carries, and
 * where the lightening holes are cut. It has never checked the cloth in
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
 * The model
 * ---------------------------------------------------------------------------
 * The anchor load enters the rib at a point and spreads into the cloth. Close
 * to the attachment the stress is set by the width of the tab or tape that
 * takes the load; further away it spreads. A lightening hole in the load path
 * concentrates it again, because the cloth that would have carried it is not
 * there.
 *
 * This is a line-load model — force per unit width of cloth — not a finite
 * element analysis, and it says so.
 *
 * ---------------------------------------------------------------------------
 * What building it showed
 * ---------------------------------------------------------------------------
 * The first result looked absurd: the A anchor working the rib cloth at 2971%
 * of its capacity. Checking the arithmetic rather than tuning it:
 *
 *     A1 at 1 g       260 N over a 20 mm tab   =  13.0 kN/m
 *     at the 8 g case  2080 N                  = 104.0 kN/m
 *     Skytex 27 hard carries about                 3.5 kN/m
 *
 * The number is right. **Rib cloth cannot carry an anchor load at all** — not
 * at the design case, not even at 1 g. Real wings do not tear because the
 * load never enters bare cloth: it goes into a Dacron tab, which
 * `reinforcement.js` already sizes by width.
 *
 * So the question this module can usefully answer is not "does the cloth
 * hold" — it does not, ever — but **how far the reinforcement has to reach
 * before bare cloth can take over**. That sets the tab *length*, which
 * nothing in this project had sized.
 */

/** Fabric strengths, N per metre of width, from the tear rating they must pass. */
export const RIB_CLOTH = {
  // PMA §5.3 rates a *point* tear in daN, not a line load. These are the
  // line loads a cloth of that rating carries in service, which is a
  // different and much larger number: a ripstop that tears at 0.6 daN on a
  // needle carries far more spread across a seam.
  'Porcher Skytex 27 hard': { tearDaN: 0.75, lineLoadNPerM: 3500 },
  'Porcher Skytex 32': { tearDaN: 0.85, lineLoadNPerM: 4200 },
  'Porcher Skytex 40 hard': { tearDaN: 1.05, lineLoadNPerM: 5200 },
  'Dominico 30D': { tearDaN: 0.90, lineLoadNPerM: 4500 },
};

/**
 * Stress in the rib cloth along the load path from one anchor.
 *
 * The load path is taken as running from the attachment point up toward the
 * upper surface, which is the direction the line pulls once the wing is
 * flying and the direction the PMA test pulls in.
 */
export function anchorLoadPath({
  anchorChordFraction, loadN, chordM,
  tabWidthM = 0.02, spreadAngleDeg = 30,
  holes = [], clothLineLoadNPerM = 3500,
  stations = 24,
}) {
  if (!(loadN >= 0)) throw new Error('anchorLoadPath needs a non-negative load');
  if (!(chordM > 0)) throw new Error('anchorLoadPath needs a chord');

  const spread = Math.tan((spreadAngleDeg * Math.PI) / 180);
  const out = [];

  // How far to walk into the cloth.
  //
  // Scanning a fixed 25% of chord reported a hole "in the load path" even
  // when it sat 500 mm beyond the point where the spread load had already
  // fallen below what bare cloth carries — every rib on the test wing was
  // flagged, which is the same as flagging none.
  //
  // The path that matters ends where the reinforcement can stop. Beyond that
  // the cloth is carrying the load unaided and a hole there is an ordinary
  // hole, not an interruption. The 100 mm floor stays, because that is where
  // the PMA needle goes.
  const spreadForReach = Math.tan((spreadAngleDeg * Math.PI) / 180);
  const neededWidthM = loadN / clothLineLoadNPerM;
  const reachM = Math.max(0, (neededWidthM - tabWidthM) / (2 * spreadForReach));
  const maxDistM = Math.min(Math.max(0.10, reachM), chordM * 0.25);

  for (let i = 0; i <= stations; i++) {
    const distM = (i / stations) * maxDistM;
    // The load spreads into a band that widens with distance.
    let widthM = tabWidthM + 2 * distM * spread;

    // A hole in the path removes cloth. What is left carries the same load.
    let interrupted = null;
    for (const h of holes) {
      const from = Math.min(h.fromChord, h.toChord);
      const to = Math.max(h.fromChord, h.toChord);
      const here = anchorChordFraction + (distM / chordM);
      if (here >= from && here <= to) {
        const holeWidthM = (to - from) * chordM;
        const remaining = Math.max(0.002, widthM - holeWidthM);
        interrupted = { holeWidthM, remainingM: remaining };
        widthM = remaining;
        break;
      }
    }

    const lineLoad = loadN / widthM;
    out.push({
      distanceM: distM,
      widthM,
      lineLoadNPerM: lineLoad,
      utilisation: lineLoad / clothLineLoadNPerM,
      interrupted,
    });
  }

  const peak = out.reduce((m, s) => (s.lineLoadNPerM > m.lineLoadNPerM ? s : m), out[0]);
  // The PMA needle sits at least 100 mm from the attachment.
  const atTest = out.reduce((best, s) =>
    (Math.abs(s.distanceM - 0.10) < Math.abs(best.distanceM - 0.10) ? s : best), out[0]);

  return {
    stations: out,
    peak,
    atPMADistance: atTest,
    ok: peak.utilisation <= 1,
    worstUtilisation: peak.utilisation,
    // A hole anywhere in the path is worth naming even when the cloth holds.
    holeInPath: out.some((s) => s.interrupted),
    lineLoadModel: true,
    note: peak.utilisation <= 1
      ? 'the cloth carries the anchor load along the whole path'
      : 'the anchor load exceeds what this cloth carries: the rib will tear '
        + 'before the line does',
  };
}

/**
 * How far the reinforcement must reach.
 *
 * The load spreads as it travels into the rib, so the line load falls with
 * distance. The reinforcement can stop where the spread load drops below what
 * bare cloth carries — and if that never happens inside the rib, the tape has
 * to run the whole way to the seam, which is what real wings do.
 */
export function reinforcementReach({
  loadN, tabWidthM = 0.02, spreadAngleDeg = 30,
  clothLineLoadNPerM = 3500, chordM = 2.45,
}) {
  const spread = Math.tan((spreadAngleDeg * Math.PI) / 180);
  // Width at which the cloth is just adequate.
  const neededWidthM = loadN / clothLineLoadNPerM;
  const reachM = (neededWidthM - tabWidthM) / (2 * spread);

  // The rib is only so deep: the load path runs from the anchor to the upper
  // surface, a fraction of the chord.
  const availableM = chordM * 0.25;
  const reachesSeam = reachM > availableM;

  return {
    neededWidthM,
    reachM: Math.max(0, reachM),
    availableM,
    // The design rule this produces: at the ultimate case the tape cannot
    // stop, so it runs to the seam.
    reachesSeam,
    tabWidthM,
    note: reachM <= 0
      ? 'the tab alone is wide enough; no reinforcement length is needed'
      : (reachesSeam
        ? 'the spread load never falls to what bare cloth carries within the '
          + 'rib: the reinforcement must run to the surface seam'
        : `the reinforcement can stop ${(reachM * 1000).toFixed(0)} mm from `
          + 'the anchor'),
  };
}

/**
 * Check every anchor on a rib.
 *
 * The useful output is not a pass but a ranking: which anchor needs the
 * longest reinforcement, and whether a hole lies in its path.
 */
export function checkRibStress({
  rib, anchors, holes = [], cloth = 'Porcher Skytex 27 hard',
  tabWidthM = 0.02, designFactor = 1,
}) {
  const spec = RIB_CLOTH[cloth];
  if (!spec) throw new Error(`Unknown rib cloth: ${cloth}`);

  const paths = anchors.map((a) => {
    const loadN = a.loadN * designFactor;
    return {
      name: a.name,
      chordFraction: a.chordFraction,
      loadN,
      reach: reinforcementReach({
        loadN, tabWidthM, clothLineLoadNPerM: spec.lineLoadNPerM, chordM: rib.chord,
      }),
      path: anchorLoadPath({
        anchorChordFraction: a.chordFraction,
        loadN,
        chordM: rib.chord,
        tabWidthM,
        holes,
        clothLineLoadNPerM: spec.lineLoadNPerM,
      }),
    };
  });

  const toSeam = paths.filter((p) => p.reach.reachesSeam);
  const longest = paths.slice()
    .sort((a, b) => b.reach.reachM - a.reach.reachM)[0];

  return {
    ribIndex: rib.index,
    cloth,
    clothSpec: spec,
    paths,
    longest,
    // Anchors whose reinforcement must run all the way to the seam.
    toSeam: toSeam.map((p) => p.name),
    allReachSeam: toSeam.length === paths.length,
    // Anchors whose load path crosses a hole, which is the placement mistake
    // this catches.
    throughHoles: paths.filter((p) => p.path.holeInPath).map((p) => p.name),
    designFactor,
    note: 'rib cloth cannot carry an anchor load; this sizes the reinforcement '
      + 'that does',
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
 * Every rib on the wing, against its own loads and its own holes.
 *
 * The model above works on numbers handed to it. This runs it over a real
 * wing: the anchor loads from `analyseLoads`, the openings from
 * `ribOpenings`, and the chord of each rib — which is what makes the spanwise
 * rule visible, because the reach is set by the load and the room by the
 * chord, and only one of those falls outboard.
 */
export function checkWingRibStress({
  wing, anchorLoads, openingsFor = null, airfoil,
  cloth = 'Porcher Skytex 27 hard', tabWidthM = 0.02, designFactor = 8,
}) {
  const byRib = new Map();
  for (const a of anchorLoads) {
    if (!Number.isFinite(a.ribIndex)) continue;
    if (!byRib.has(a.ribIndex)) byRib.set(a.ribIndex, []);
    byRib.get(a.ribIndex).push({
      name: `${a.row}${a.anchor}`,
      chordFraction: airfoil.anchors?.[a.row] ?? 0.1,
      loadN: a.loadN,
    });
  }

  const ribs = [];
  for (const [ribIndex, anchors] of [...byRib.entries()].sort((x, y) => x[0] - y[0])) {
    const rib = wing.ribs[ribIndex];
    if (!rib) continue;
    const holes = openingsFor ? (openingsFor(rib, ribIndex) ?? []) : [];
    ribs.push(checkRibStress({
      rib, anchors, holes, cloth, tabWidthM, designFactor,
    }));
  }

  const toSeam = ribs.filter((r) => r.allReachSeam);
  const withHoles = ribs.filter((r) => r.throughHoles.length);

  // Where along the span the rule changes, which is the number a builder
  // needs: inboard of it the tape can stop, outboard it cannot.
  let crossover = null;
  for (let i = 0; i < ribs.length; i++) {
    if (ribs[i].allReachSeam) { crossover = ribs[i].ribIndex; break; }
  }

  return {
    ribs,
    ribCount: ribs.length,
    ribsNeedingTapeToSeam: toSeam.length,
    ribsWithHolesInLoadPath: withHoles.map((r) => r.ribIndex),
    crossoverRib: crossover,
    designFactor,
    cloth,
    note: crossover === null
      ? 'every rib has room for the reinforcement to stop inside it'
      : `inboard of rib ${crossover} the reinforcement can stop; outboard of `
        + 'it the tape must run to the surface seam',
  };
}

/* ----------------------------------------------------------- panel stress -- */

/** Sail cloth, by the load it carries per metre of width. */
export const SAIL_CLOTH = {
  // Tensile strengths as line loads. A ripstop is directional: the warp and
  // weft carry differently, and the bias carries least. The weaker of the two
  // principal directions is what a panel is limited by, because a panel is
  // loaded in both at once.
  'Porcher Skytex 27': { warpNPerM: 5600, weftNPerM: 5200, gsm: 27 },
  'Porcher Skytex 32': { warpNPerM: 6600, weftNPerM: 6100, gsm: 32 },
  'Porcher Skytex 38': { warpNPerM: 7900, weftNPerM: 7300, gsm: 38 },
  'Dominico 30D': { warpNPerM: 6200, weftNPerM: 5800, gsm: 34 },
};

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
 * Every panel on the wing, from the loads the wing actually carries.
 *
 * The pressure comes from the flight state rather than being supplied: it is
 * the same chordwise loading the rest of the project uses, at the same
 * dynamic pressure.
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
    // The root cell is the widest and carries the most, which is why wings
    // are built with closer ribs in the middle than a constant spacing would
    // give.
    seamLimited: panels.filter((p) => p.limitedBy === 'seam').length,
    clothLimited: panels.filter((p) => p.limitedBy === 'cloth').length,
    designFactor,
    note: failing.length === 0
      ? `all ${panels.length} panels hold; worst is cell ${worst?.cell} at `
        + `${(Math.max(worst?.clothUtilisation ?? 0, worst?.seamUtilisation ?? 0) * 100).toFixed(0)}%`
      : `${failing.length} of ${panels.length} panels exceed cloth or seam`,
  };
}
