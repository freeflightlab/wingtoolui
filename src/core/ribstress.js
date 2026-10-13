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
 * The path runs from the anchor, on the lower surface, ACROSS the rib towards
 * the upper surface, and the load fans out by 30 degrees either side of it —
 * the Whitmore section of gusset-plate design. So the room it has is the
 * depth of the rib at the anchor, and a hole is in its way where the hole's
 * outline comes inside the fan.
 *
 * This is a line-load model — force per unit width of cloth — not a finite
 * element analysis, and it says so.
 *
 * It was not that. The room was taken as a quarter of the chord, where a
 * 15% section is 7 to 15% of chord deep at its anchors; and the path was
 * walked along the chord, aft of the anchor, where the description above it
 * said up — so a hole ahead of an anchor could not be in the way and a hole
 * behind it was, at whatever height it was cut.
 *
 * ---------------------------------------------------------------------------
 * What building it showed, and what it got wrong first
 * ---------------------------------------------------------------------------
 * The first result looked absurd: the A anchor working the rib cloth at 2971%
 * of its capacity, on "260 N at 1 g, 2080 N at the 8 g case" through a 20 mm
 * tab. The arithmetic was right and the load was not: it was a number that
 * sounded plausible, not one the load model gave. Half a 95 kg wing is 466 N
 * shared between its anchors — 28 of them on the 12-cell test wing, 17 N
 * each on average and 37 N on the worst.
 *
 * On real loads:
 *
 *     the worst anchor at 1 g     37 N over a 20 mm tab  =   1.8 kN/m
 *     at the 8 g case            295 N                   =  14.7 kN/m
 *     Skytex 27 hard carries about                           3.5 kN/m
 *
 * So at 1 g the tab alone puts the load into cloth that carries it, and at
 * the design case it does not, by a factor of four. The load goes into a
 * Dacron tab and patch, which `reinforcement.js` sizes by width, and the
 * question this module answers is **how far that reinforcement has to reach
 * before bare cloth can take over** — its length, which nothing else here
 * sizes. On the test wing it is 56 mm at most.
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

/**
 * The chordwise run a hole takes out at one height in the rib, in metres.
 *
 * `vM` is the height in the rib's own plane. A hole with an outline is cut by
 * the line at that height; one given only as a chord range is taken to run
 * the whole depth of the rib, which is the cautious reading.
 */
function holeRunAt(hole, vM, chordM) {
  const pts = hole.outline;
  if (Array.isArray(pts) && pts.length > 2 && Number.isFinite(vM)) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [u0, v0] = pts[j];
      const [u1, v1] = pts[i];
      if ((v0 - vM) * (v1 - vM) > 0) continue;
      if (v0 === v1) { lo = Math.min(lo, u0, u1); hi = Math.max(hi, u0, u1); continue; }
      const u = u0 + ((vM - v0) / (v1 - v0)) * (u1 - u0);
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
    }
    return hi > lo ? [lo, hi] : null;
  }
  if (Array.isArray(pts) && pts.length > 2) {
    const us = pts.map((q) => q[0]);
    return [Math.min(...us), Math.max(...us)];
  }
  if (Number.isFinite(hole.fromChord) && Number.isFinite(hole.toChord)) {
    return [Math.min(hole.fromChord, hole.toChord) * chordM,
      Math.max(hole.fromChord, hole.toChord) * chordM];
  }
  return null;
}

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
  // factor of two either way: the test wing's worst anchor needs 19 mm of
  // reinforcement at twice this strength and 129 mm at half of it, in a rib
  // 282 mm deep. The lengths themselves move with the figure, and are only
  // as good as it is.

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
 * Stress in the rib cloth along the load path from one anchor.
 *
 * The load path runs from the attachment point across the rib toward the
 * upper surface, which is the direction the line pulls once the wing is
 * flying and the direction the PMA test pulls in.
 *
 * `depthM` is the depth of the rib at the anchor and `anchorPointM` the
 * anchor's own position in the rib's plane, `[u, v]` in metres; with those
 * the holes are met where their outlines really are. Without them the depth
 * is `ASSUMED_RIB_DEPTH` of the chord and a hole is taken to run the whole
 * depth of the rib over its chord range.
 */
export function anchorLoadPath({
  anchorChordFraction, loadN, chordM,
  tabWidthM = 0.02, spreadAngleDeg = 30,
  holes = [], clothLineLoadNPerM = 3500,
  stations = 24,
  depthM = null, anchorPointM = null,
}) {
  if (!(loadN >= 0)) throw new Error('anchorLoadPath needs a non-negative load');
  if (!(chordM > 0)) throw new Error('anchorLoadPath needs a chord');

  const spread = Math.tan((spreadAngleDeg * Math.PI) / 180);
  const out = [];
  const depthAssumed = !(depthM > 0);
  const depth = depthAssumed ? chordM * ASSUMED_RIB_DEPTH : depthM;
  const uA = anchorPointM ? anchorPointM[0] : anchorChordFraction * chordM;
  const vA = anchorPointM ? anchorPointM[1] : null;

  // How far to walk into the cloth.
  //
  // Scanning a fixed distance reported a hole "in the load path" even when
  // it sat 500 mm beyond the point where the spread load had already fallen
  // below what bare cloth carries — every rib on the test wing was flagged,
  // which is the same as flagging none.
  //
  // The path that matters ends where the reinforcement can stop. Beyond that
  // the cloth is carrying the load unaided and a hole there is an ordinary
  // hole, not an interruption. The 100 mm floor stays, because that is where
  // the PMA needle goes — and the rib is only so deep.
  const neededWidthM = loadN / clothLineLoadNPerM;
  const reachM = Math.max(0, (neededWidthM - tabWidthM) / (2 * spread));
  const maxDistM = Math.min(Math.max(0.10, reachM), depth);

  for (let i = 0; i <= stations; i++) {
    const distM = (i / stations) * maxDistM;
    // The load spreads into a band that widens with distance.
    const bandM = tabWidthM + 2 * distM * spread;
    let widthM = bandM;

    // A hole in the band removes cloth. What is left carries the same load.
    let interrupted = null;
    let removed = 0;
    for (const h of holes) {
      const run = holeRunAt(h, vA === null ? null : vA + distM, chordM);
      if (!run) continue;
      removed += Math.max(0, Math.min(uA + bandM / 2, run[1]) - Math.max(uA - bandM / 2, run[0]));
    }
    if (removed > 1e-9) {
      const remaining = Math.max(0.002, bandM - removed);
      interrupted = { holeWidthM: Math.min(removed, bandM), remainingM: remaining };
      widthM = remaining;
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
    // A hole is in the path where it takes cloth out of the band AND what is
    // left there cannot carry the load: inside the reinforcement's reach,
    // or beyond it where the hole has narrowed the band back below what the
    // cloth needs. A hole that only clips a band already wide enough is an
    // ordinary hole; counting it flagged the outer ribs of every wing, where
    // the 100 mm the needle test walks is most of the rib.
    holeInPath: out.some((s) => s.interrupted && s.utilisation > 1),
    holeInBand: out.some((s) => s.interrupted),
    depthM: depth,
    depthAssumed,
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
  // The depth of the rib at the anchor. Left out, it is `ASSUMED_RIB_DEPTH`
  // of the chord and the result says so.
  depthM = null,
}) {
  const spread = Math.tan((spreadAngleDeg * Math.PI) / 180);
  // Width at which the cloth is just adequate.
  const neededWidthM = loadN / clothLineLoadNPerM;
  const reachM = (neededWidthM - tabWidthM) / (2 * spread);

  // The rib is only so deep: the load path runs from the anchor to the upper
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
  // The rib's own outline, as `{ at(x) -> { up, lo } }` in chord units. A rib
  // built by this tool carries it; a bare `{ index, chord }` does not, and
  // the depth is then assumed.
  section = null,
}) {
  const spec = RIB_CLOTH[cloth];
  if (!spec) throw new Error(`Unknown rib cloth: ${cloth}`);
  const prof = section ?? (rib.upper && rib.lower ? ribProfile(rib) : null);

  const paths = anchors.map((a) => {
    const loadN = a.loadN * designFactor;
    const here = prof ? prof.at(a.chordFraction) : null;
    const depthM = here ? (here.up - here.lo) * rib.chord : null;
    const anchorPointM = here ? [a.chordFraction * rib.chord, here.lo * rib.chord] : null;
    return {
      name: a.name,
      chordFraction: a.chordFraction,
      loadN,
      depthM,
      reach: reinforcementReach({
        loadN, tabWidthM, clothLineLoadNPerM: spec.lineLoadNPerM, chordM: rib.chord, depthM,
      }),
      path: anchorLoadPath({
        anchorChordFraction: a.chordFraction,
        loadN,
        chordM: rib.chord,
        tabWidthM,
        holes,
        clothLineLoadNPerM: spec.lineLoadNPerM,
        depthM,
        anchorPointM,
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
    depthAssumed: !prof,
    // Anchors whose load path crosses a hole, which is the placement mistake
    // this catches.
    throughHoles: paths.filter((p) => p.path.holeInPath).map((p) => p.name),
    designFactor,
    // Carried into the result, so an estimate cannot be mistaken for a
    // measurement by anything downstream — including a person reading a
    // report and deciding what fabric to buy.
    clothProvenance: RIB_CLOTH.provenance,
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
 * wing: the anchor loads from `analyseLoads`, the openings each rib really
 * has, and each rib's own depth at each anchor — the reach is set by the
 * load and the room by the rib, and both fall outboard, at different rates.
 *
 * `plan` is the line plan. With it each anchor is taken where its line
 * really meets the rib, which on an imported design moves along the span;
 * without it the section's anchor positions are used for every rib.
 */
export function checkWingRibStress({
  wing, anchorLoads, openingsFor = null, airfoil, plan = null,
  cloth = 'Porcher Skytex 27 hard', tabWidthM = 0.02, designFactor = 8,
}) {
  const where = new Map();
  for (const l of plan?.lines ?? []) {
    if (l.level !== 'upper' || !Number.isFinite(l.ribIndex) || !Array.isArray(l.to)) continue;
    const rib = wing.ribs[l.ribIndex];
    if (!rib) continue;
    where.set(`${l.row}|${l.ribIndex}`, toRibPlane(rib, l.to)[0] / rib.chord);
  }

  const byRib = new Map();
  for (const a of anchorLoads) {
    if (!Number.isFinite(a.ribIndex)) continue;
    if (!byRib.has(a.ribIndex)) byRib.set(a.ribIndex, []);
    byRib.get(a.ribIndex).push({
      name: a.name ?? `${a.row}${a.anchor}`,
      chordFraction: where.get(`${a.row}|${a.ribIndex}`) ?? airfoil?.anchors?.[a.row] ?? 0.1,
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

  // A rib needs tape to the seam where ANY of its anchors does. This counted
  // a rib only when all of them did, so a rib whose D anchor ran out of room
  // was reported as having room.
  const toSeam = ribs.filter((r) => r.toSeam.length);
  const anchorsToSeam = toSeam.flatMap((r) => r.toSeam.map((name) => ({ ribIndex: r.ribIndex, name })));
  const withHoles = ribs.filter((r) => r.throughHoles.length);
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

  // The first rib out from the centre where it happens, if it does.
  const crossover = toSeam.length ? toSeam[0].ribIndex : null;

  return {
    ribs,
    ribCount: ribs.length,
    anchorCount,
    ribsNeedingTapeToSeam: toSeam.length,
    anchorsToSeam,
    ribsWithHolesInLoadPath: withHoles.map((r) => r.ribIndex),
    crossoverRib: crossover,
    longest,
    designFactor,
    cloth,
    // The whole-wing check is what the interface calls, so it is the one
    // that has to carry the provenance out. Adding it only to the per-rib
    // function left the exported report with an empty source line — an
    // honesty measure that was itself not wired.
    clothProvenance: RIB_CLOTH.provenance,
    note: crossover === null
      ? 'every anchor\'s reinforcement can stop inside its rib'
      : `${anchorsToSeam.length} of ${anchorCount} anchors, on ${toSeam.length} of `
        + `${ribs.length} ribs, need their reinforcement run to the upper seam: `
        + 'the rib is not deep enough there for the load to spread',
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
