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
