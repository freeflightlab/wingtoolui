/* reinforcement.js — where a wing is strengthened, and what it costs.
 *
 * Mylar, dacron, tape, rods and attachment tabs: none of it aerodynamic
 * surface and none of it line, and together a few hundred grams of a wing
 * that a bill counting cloth and line alone leaves out.
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

import { toRibPlane, ribCopies, hasCentreRib } from './wing3d.js';

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
/** True for a point on the wing's centreline, which the two halves share. */
function onCentreline(p) {
  return Array.isArray(p) && Math.abs(p[1]) < 1e-9;
}

export function buildReinforcement(wing, airfoil, { spec = {}, plan = null } = {}) {
  const R = { ...DEFAULT_REINFORCEMENT, ...spec };
  const items = [];

  const ribs = wing.ribs;
  const sides = 2;

  // ---- mylar along each rib, either side of the intake --------------------
  if (R.fitMylar) {
    // Two strips per rib, each running the length of the intake plus a margin.
    const intake = airfoil.intake || { start: 0.012, end: 0.055 };
    // Per rib of the WHOLE wing: a rib on the centreline is one rib, not one
    // on each side. Doubling the half counted it twice — 52 ribs' worth of
    // mylar, seam tape and rods on a wing that has 51.
    let lengthM = 0;
    let ribCount = 0;
    ribs.forEach((rib, i) => {
      const span = Math.max(0.04, (intake.end - intake.start) * rib.chord) + 0.03;
      lengthM += span * 2 * ribCopies(wing, i);
      ribCount += ribCopies(wing, i);
    });
    items.push({
      item: 'Mylar at the intakes',
      lengthM,
      areaM2: lengthM * R.mylar.widthM,
      massKg: lengthM * R.mylar.widthM * R.mylar.gsm,
      count: ribCount * 2,
      why: 'holds the nose shape against the highest pressure on the wing',
    });
  }

  // ---- dacron patches at every line anchor -------------------------------
  if (R.fitDacron) {
    // One patch per anchor. Take the count from the plan where there is one,
    // rather than assuming a row on every rib.
    //
    // Across the whole wing: an anchor on the centreline is one point that
    // both halves' lines come to, so it takes one patch, not two.
    const rowCount = Object.keys(airfoil.anchors || { A: 0, B: 0, C: 0 }).length;
    const anchorCount = plan
      ? plan.lines.filter((l) => l.level === 'upper')
        .reduce((n, l) => n + (onCentreline(l.to) ? 1 : 2), 0)
      : ribs.reduce((n, _, i) => n + ribCopies(wing, i), 0) * rowCount;
    const areaEach = R.dacron.patchM * R.dacron.patchM;
    items.push({
      item: 'Dacron at the anchors',
      count: anchorCount,
      areaM2: anchorCount * areaEach,
      massKg: anchorCount * areaEach * R.dacron.gsm,
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
    // And across the centre cell, when the innermost rib is half a cell out.
    if (ribs.length && !hasCentreRib(wing)) lengthM += 2 * Math.abs(ribs[0].station);
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
    ribs.forEach((rib, i) => { lengthM += rib.chord * 2 * ribCopies(wing, i); });
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
 * Nylon rods.
 *
 * A rod is a length of nylon in a pocket sewn to a rib. It works in bending,
 * the one thing cloth cannot do, and holds a shape the wing would lose when
 * it is not pressurised: the radius of the nose above all.
 *
 * ---------------------------------------------------------------------------
 * Two kinds, as the one complete design here has them
 * ---------------------------------------------------------------------------
 * Laboratori d'envol's Swoop2 defines its rods in section 21 of its file, and
 * its design program prints every one it makes (`data/reference/
 * swoop2-joncs.tsv`): 25 of each kind a side, 72.81 m for the wing.
 *
 *   nose     ONE piece from the upper surface, round the leading edge, to the
 *            lower surface: on the Swoop2 from 18.5% of chord on top to 15%
 *            underneath, 55 to 83 cm long. Two pieces butted at the nose
 *            would hinge exactly where the rod is there to stop a hinge.
 *   batten   along the upper surface only: 23.5% to 70% on the Swoop2.
 *
 * Each end of a rod leaves the surface over a run-out zone, curving into the
 * rib by a per cent or two of chord, so the end of a stiff rod does not bear
 * on the sail. The file gives each zone as four numbers — where it starts,
 * where the rod ends, how far it leaves the surface and with what exponent.
 *
 * ---------------------------------------------------------------------------
 * What this replaced
 * ---------------------------------------------------------------------------
 * Section 21 reads `12.0 18.5 1.5 2.0` for the upper end of the nose rod, and
 * for a long time this project took that as "a rod from 12% to 18.5% of the
 * upper surface, 1.5 mm in diameter". On every wing that was not an imported
 * file it then drew, billed and cut marks for a 14 cm stub that did not reach
 * the nose, where the design's own program makes a rod of 83 cm that goes
 * round it. The 1.5 is the run-out, in per cent of chord; the file states no
 * diameter at all. Reading the program's own rod table settled it — the
 * table had been in the repository throughout.
 *
 * `rodPolyline` builds a rod as the program does, on any section, and on the
 * Swoop2's own ribs its lengths are the printed ones. An imported file still
 * gets its rods from `lepJoncs`, which follows the program step for step.
 *
 * Diameter and material are the designer's: mass goes as the square of the
 * diameter, which is the trade to see.
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

/**
 * The Swoop2's own rods, as groups: the default a parametric wing starts
 * from. Zones and run-outs are fractions of chord, from its section 21; the
 * diameter is not in the file and is this tool's setting.
 */
export const SWOOP2_RODS = [
  {
    kind: 'nose', name: 'nose',
    upperZone: [0.12, 0.185], lowerZone: [0.07, 0.15],
    runout: [0.015, 0.020], exponent: 2,
  },
  {
    kind: 'batten', name: 'batten',
    frontZone: [0.235, 0.295], aftZone: [0.63, 0.70],
    runout: [0.011, 0.011], exponent: 2,
  },
];

export const DEFAULT_ROD_SPEC = {
  material: 'nylon',
  diameterMM: 1.5,
  // Shorter than this is not a rod.
  minLengthM: 0.05,
};

/**
 * A nose rod for a wing that says only how far back it runs: the Swoop2's
 * run-out lengths, ending where the designer says.
 */
export function noseRodGroup({
  upperTo = 0.185, lowerTo = 0.15, fromRib = 0, toRib = null,
  diameterMM = DEFAULT_ROD_SPEC.diameterMM, material = 'nylon', name = 'nose',
} = {}) {
  if (!(upperTo > 0 && upperTo < 1) || !(lowerTo > 0 && lowerTo < 1)) {
    throw new Error('noseRodGroup needs an extent on each surface, as a fraction of chord');
  }
  const [nose, ] = SWOOP2_RODS;
  const upLen = nose.upperZone[1] - nose.upperZone[0];
  const loLen = nose.lowerZone[1] - nose.lowerZone[0];
  return {
    kind: 'nose', name,
    upperZone: [Math.max(upperTo * 0.25, upperTo - upLen), upperTo],
    lowerZone: [Math.max(lowerTo * 0.25, lowerTo - loLen), lowerTo],
    runout: nose.runout.slice(), exponent: nose.exponent,
    fromRib, toRib, diameterMM, material,
  };
}

/**
 * One rod on one rib section, built as LEparagliding builds it.
 *
 * `loop` is the section in its own plane, metres, in the usual order: from
 * the trailing edge forward along the upper surface, round the nose, and back
 * along the lower. Returns the rod as a polyline in the same coordinates —
 * so it can be drawn on the rib and marked on its pattern — and its length.
 *
 * The rod follows the surface, and across each run-out zone leaves it for
 * the inside of the rib: by `runout` of the chord at the rod's end, growing
 * as the distance into the zone to the power `exponent`.
 */
export function rodPolyline(loop, group, { chord: chordGiven = null, origin = null } = {}) {
  if (!Array.isArray(loop) || loop.length < 5) return null;
  let iLE = 0;
  for (let i = 1; i < loop.length; i++) if (loop[i][0] < loop[iLE][0]) iLE = i;
  // Stations are fractions of the section's own chord, from its own zero —
  // as a section file states them and as the program reads them. A cambered
  // section's foremost point lies a hair ahead of that zero, so the two are
  // not the same thing; with neither given, the loop's own extent is used.
  const u0 = origin ?? loop[iLE][0];
  const chord = chordGiven ?? (Math.max(...loop.map((p) => p[0])) - u0);
  if (!(chord > 0)) return null;
  const X = (p) => p[0] - u0;
  // Each surface from the nose outward.
  const upper = loop.slice(0, iLE + 1).reverse();
  const lower = loop.slice(iLE);
  const exponent = group.exponent ?? 2;

  // The point on a surface at a chordwise distance from the nose.
  const at = (branch, x) => {
    for (let i = 1; i < branch.length; i++) {
      if (X(branch[i]) >= x) {
        const a = branch[i - 1];
        const b = branch[i];
        const f = (x - X(a)) / ((X(b) - X(a)) || 1);
        return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
      }
    }
    return null;
  };
  // A surface between two stations, with the stations themselves and any
  // zone boundary between them put in as points.
  const run = (branch, x0, x1, marks = []) => {
    const first = x0 <= 0 ? branch[0].slice() : at(branch, x0);
    const last = at(branch, x1);
    if (!first || !last) return null;
    const out = [{ x: Math.max(0, x0), p: first }];
    const inner = branch.filter((p) => X(p) > x0 + 1e-9 && X(p) < x1 - 1e-9)
      .map((p) => ({ x: X(p), p: p.slice() }));
    for (const m of marks) {
      if (m > x0 + 1e-9 && m < x1 - 1e-9 && !inner.some((q) => Math.abs(q.x - m) < 1e-9)) {
        const q = at(branch, m);
        if (q) inner.push({ x: m, p: q });
      }
    }
    inner.sort((a, b) => a.x - b.x);
    return out.concat(inner, [{ x: x1, p: last }]);
  };
  // Leave the surface across a zone, towards the inside of the rib: down
  // from the upper surface, up from the lower.
  const leave = (pts, zoneStart, zoneEnd, amount, inward) => {
    const span = Math.abs(zoneEnd - zoneStart);
    if (!(span > 0) || !(amount > 0)) return;
    const k = (amount * chord) / (span ** exponent);
    const outward = zoneEnd > zoneStart ? 1 : -1;
    for (const q of pts) {
      const d = (q.x - zoneStart) * outward;
      if (d > 0) q.p[1] += inward * k * (Math.min(d, span) ** exponent);
    }
  };

  let pts;
  if (group.kind === 'nose') {
    const [ui, uf] = group.upperZone.map((f) => f * chord);
    const [li, lf] = group.lowerZone.map((f) => f * chord);
    const up = run(upper, 0, uf, [ui]);
    const lo = run(lower, 0, lf, [li]);
    if (!up || !lo) return null;
    leave(up, ui, uf, group.runout?.[0] ?? 0, -1);
    leave(lo, li, lf, group.runout?.[1] ?? 0, +1);
    // From the upper end forward to the nose, then back underneath.
    pts = up.slice().reverse().map((q) => q.p).concat(lo.slice(1).map((q) => q.p));
  } else if (group.kind === 'batten') {
    const branch = group.surface === 'lower' ? lower : upper;
    const inward = group.surface === 'lower' ? +1 : -1;
    const [fa, fb] = group.frontZone.map((f) => f * chord);
    const [aa, ab] = group.aftZone.map((f) => f * chord);
    const mid = run(branch, fa, ab, [fb, aa]);
    if (!mid) return null;
    leave(mid, fb, fa, group.runout?.[0] ?? 0, inward);
    leave(mid, aa, ab, group.runout?.[1] ?? 0, inward);
    pts = mid.map((q) => q.p);
  } else {
    throw new Error(`Unknown kind of rod: ${group.kind}`);
  }

  let lengthM = 0;
  for (let i = 1; i < pts.length; i++) {
    lengthM += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return { points: pts, lengthM, chordM: chord };
}

/** How much of the chord a rod's ends span, for comparing with its length. */
function rodChordwise(group) {
  return group.kind === 'nose'
    ? group.upperZone[1] + group.lowerZone[1]
    : group.aftZone[1] - group.frontZone[0];
}

/**
 * The rods of a wing: every group on every rib it covers.
 *
 * @param {object} wing
 * @param {object} o
 * @param {object[]} o.groups   `noseRodGroup(...)`, `SWOOP2_RODS`, or what
 *                              `parseRodSpec` returns; ribs count from 0 at
 *                              the centre, and a group with no `toRib` runs
 *                              to the tip
 * @param {object} o.spec       material, diameter and shortest rod for any
 *                              group that does not say
 */
export function buildRods(wing, { groups = null, spec = {} } = {}) {
  if (!wing?.ribs?.length) throw new Error('buildRods needs a wing');
  const R = { ...DEFAULT_ROD_SPEC, ...spec };
  const use = groups ?? [noseRodGroup({ diameterMM: R.diameterMM, material: R.material })];
  const rods = [];
  const skipped = [];

  for (const g of use) {
    const material = g.material ?? R.material;
    const mat = ROD_MATERIALS[material];
    if (!mat) throw new Error(`Unknown rod material: ${material}`);
    const diameterMM = g.diameterMM ?? R.diameterMM;
    if (!(diameterMM > 0)) throw new Error('a rod needs a positive diameter');
    const areaM2 = Math.PI * ((diameterMM / 2000) ** 2);
    const from = Math.max(0, g.fromRib ?? 0);
    const to = Math.min(g.toRib ?? wing.ribs.length - 1, wing.ribs.length - 1);
    for (let i = from; i <= to; i++) {
      const rib = wing.ribs[i];
      // The section as cut, in the rib's own plane: what the Rib view draws
      // and the rib pattern is cut from.
      const loop = rib.upper.slice().reverse().concat(rib.lower.slice(1))
        .map((p) => toRibPlane(rib, p));
      // In that plane the section's zero is the origin and its chord the
      // rib's.
      const made = rodPolyline(loop, g, { chord: rib.chord, origin: 0 });
      if (!made) { skipped.push({ group: g.name, rib: i, why: 'its ends are off this rib' }); continue; }
      if (made.lengthM < R.minLengthM) {
        skipped.push({ group: g.name, rib: i, why: 'too short to be a rod' });
        continue;
      }
      rods.push({
        group: g.name ?? g.kind,
        kind: g.kind,
        rib: i,
        ribIndex: i,
        points: made.points,
        lengthM: made.lengthM,
        // What its ends span along the chord: a rod is longer, because it
        // follows the section, and a nose rod much longer.
        chordwiseM: rodChordwise(g) * made.chordM,
        chordM: made.chordM,
        diameterMM,
        material,
        massG: made.lengthM * areaM2 * mat.densityKgM3 * 1000,
      });
    }
  }

  // Each rod as many times as the whole wing has its rib: twice, except on
  // a rib that sits on the centreline.
  const copies = (r) => ribCopies(wing, r.rib);
  const total = (f) => rods.reduce((a, r) => a + f(r) * copies(r), 0);
  const byDiameter = {};
  const byGroup = {};
  for (const r of rods) {
    const k = copies(r);
    const d = byDiameter[r.diameterMM] ||= { count: 0, lengthM: 0, massG: 0 };
    d.count += k; d.lengthM += r.lengthM * k; d.massG += r.massG * k;
    const g = byGroup[r.group] ||= { kind: r.kind, count: 0, lengthM: 0, massG: 0 };
    g.count += k; g.lengthM += r.lengthM * k; g.massG += r.massG * k;
  }
  const count = total(() => 1);
  const totalLengthM = total((r) => r.lengthM);
  const totalMassG = total((r) => r.massG);
  const straight = total((r) => r.chordwiseM);

  return {
    rods,
    skipped,
    // The count the wing has, not twice the half: a rod on a centre rib is
    // one rod.
    count,
    totalLengthM,
    totalMassG,
    massKg: totalMassG / 1000,
    byDiameter,
    byGroup,
    // How much longer the rods are than the chord their ends span.
    straightLengthM: straight,
    curvatureExcess: straight > 0 ? totalLengthM / straight - 1 : 0,
    spec: R,
    note: `${count} rods, ${totalLengthM.toFixed(1)} m, ${totalMassG.toFixed(0)} g`
      + (skipped.length ? `; ${skipped.length} not made (${skipped[0].why})` : ''),
  };
}

/**
 * Does a rod cross an opening in its rib?
 *
 * A rod's pocket is sewn to the rib, and a rod across a hole has nothing to
 * be sewn to. Rods and openings are placed by rules that do not know about
 * each other — the trap `checkRibInternals` was written for — so they are
 * compared as they lie on the rib: the rod's own line against each opening's
 * outline, with a margin for the pocket. The openings this tool cuts are
 * shaped to keep 10 mm or more from a rod (`buildRibHoles`); this is the
 * independent look, at 8 mm, and it also sees a design's own holes.
 *
 * This used to compare chord ranges, and also reported a clash wherever a
 * line anchor fell within a rod's run, on the grounds that "an anchor tab
 * sewn over a rod puts its load into a hinge". The Swoop2 has its A anchors
 * at 11% of chord inside a nose rod that runs to 15%: a tab there is how
 * wings are built, and that check is gone.
 *
 * @param {object[]} o.rods        from `buildRods`
 * @param {object}  o.holesByRib   rib index -> list of outlines, each a list
 *                                 of [u, v] in the rib's own plane
 */
export function checkRodClearance({ rods, holesByRib = {}, marginM = 0.008 }) {
  const get = (i) => (holesByRib instanceof Map ? holesByRib.get(i) : holesByRib[i]) ?? [];
  const segDist = (p, a, b) => {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const L2 = vx * vx + vy * vy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2)) : 0;
    return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
  };
  const inside = (p, poly) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1])
        && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return (o(a, b, c) > 0) !== (o(a, b, d) > 0) && (o(c, d, a) > 0) !== (o(c, d, b) > 0);
  };

  const clashes = [];
  for (const r of rods) {
    const holes = get(r.rib);
    let worst = Infinity;
    let through = false;
    holes.forEach((poly) => {
      if (!poly || poly.length < 3) return;
      for (let i = 0; i < r.points.length; i++) {
        const p = r.points[i];
        if (inside(p, poly)) through = true;
        for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
          worst = Math.min(worst, segDist(p, poly[j], poly[k]));
          if (i > 0 && cross(r.points[i - 1], p, poly[j], poly[k])) through = true;
        }
      }
      // The outline's own corners against the rod, for a rod with long
      // straight runs between its points.
      for (const q of poly) {
        for (let i = 1; i < r.points.length; i++) {
          worst = Math.min(worst, segDist(q, r.points[i - 1], r.points[i]));
        }
      }
    });
    if (through || worst < marginM) {
      clashes.push({
        kind: 'hole', rib: r.rib, group: r.group,
        clearanceM: through ? 0 : worst, through,
      });
    }
  }
  const ribs = [...new Set(clashes.map((c) => c.rib))].sort((a, b) => a - b);
  return {
    clashes,
    ok: clashes.length === 0,
    holeClashes: clashes.length,
    ribs,
    marginM,
    note: clashes.length === 0
      ? 'no rod crosses an opening'
      : `a rod crosses or touches an opening on rib${ribs.length > 1 ? 's' : ''} `
        + `${ribs.join(', ')}: its pocket has nothing to be sewn to there`,
  };
}

/**
 * Rods written out, one group to a line:
 *
 *     # kind    first zone    second zone    dia   ribs
 *     nose      12.0 18.5     7.0 15.0       1.5
 *     batten    23.5 29.5     63.0 70.0      1.5   0 24
 *
 * which is the Swoop2's own definition. Per cent of chord, as LEP section 21
 * states them, because that is how a rod scales with the wing.
 *
 *   nose     the first zone is on the upper surface and the second on the
 *            lower: the rod runs from the END of the first (18.5%), round
 *            the nose, to the end of the second (15%), leaving the surface
 *            from each zone's start.
 *   batten   both zones are on the upper surface: the rod runs from the
 *            start of the first (23.5%) to the end of the second (70%).
 *
 * The rib range is optional (centre rib 0; none means every rib). A line
 * that starts with neither word is taken as a name and read by its numbers —
 * a second zone that begins aft of the first is a batten — which is how a
 * spec written before the kinds were named still reads, correctly now: those
 * were taken as four short separate rods, one per pair of numbers.
 */
export function parseRodSpec(text, { ribCount = null } = {}) {
  if (typeof text !== 'string') throw new Error('parseRodSpec needs text');

  const groups = [];
  const problems = [];
  const inferred = [];
  let lineNo = 0;

  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;

    // The name may contain spaces, so the numbers are found from the right.
    const tok = line.split(/\s+/);
    const nums = [];
    while (tok.length && /^-?[\d.]+$/.test(tok[tok.length - 1])) nums.unshift(Number(tok.pop()));
    const words = tok.join(' ');
    const said = /^(nose|batten)\b/i.exec(words);
    const name = words || `rod ${groups.length + 1}`;

    if (nums.length !== 5 && nums.length !== 7) {
      problems.push(`line ${lineNo}: expected "kind  zone zone  zone zone  diameter  `
        + `[fromRib toRib]", got ${nums.length} numbers`);
      continue;
    }
    const [a, b, c, d, dia] = nums;
    const pct = (v) => v / 100;
    const kind = said ? said[1].toLowerCase() : (c >= b ? 'batten' : 'nose');
    if (!said) inferred.push(`"${name}" read as a ${kind === 'nose' ? 'nose rod' : 'batten'}`);

    let bad = false;
    for (const [lab, from, to] of [['first', a, b], ['second', c, d]]) {
      if (!(to > from)) {
        problems.push(`line ${lineNo}: "${name}" ${lab} zone runs ${from} to ${to}, `
          + 'which is backwards');
        bad = true;
      } else if (from < 0 || to > 100) {
        problems.push(`line ${lineNo}: "${name}" ${lab} zone is outside the chord`);
        bad = true;
      }
    }
    if (kind === 'batten' && !bad && !(c >= b)) {
      problems.push(`line ${lineNo}: "${name}" is a batten, and its second zone `
        + `starts at ${c}, ahead of where its first ends at ${b}`);
      bad = true;
    }
    if (!(dia > 0)) {
      problems.push(`line ${lineNo}: "${name}" needs a positive diameter`);
      bad = true;
    }
    const fromRib = nums.length === 7 ? Math.round(nums[5]) : 0;
    const toRib = nums.length === 7 ? Math.round(nums[6]) : null;
    if (toRib != null && !(toRib >= fromRib)) {
      problems.push(`line ${lineNo}: "${name}" rib range ${fromRib} to ${toRib} is backwards`);
      bad = true;
    }
    if (ribCount != null && toRib != null && toRib > ribCount - 1) {
      problems.push(`line ${lineNo}: "${name}" reaches rib ${toRib} but the `
        + `wing has ${ribCount}, counted from 0`);
      bad = true;
    }
    if (bad) continue;

    const [nose, batten] = SWOOP2_RODS;
    groups.push(kind === 'nose'
      ? {
        kind, name, upperZone: [pct(a), pct(b)], lowerZone: [pct(c), pct(d)],
        runout: nose.runout.slice(), exponent: nose.exponent,
        diameterMM: dia, fromRib, toRib,
      }
      : {
        kind, name, surface: 'upper', frontZone: [pct(a), pct(b)], aftZone: [pct(c), pct(d)],
        runout: batten.runout.slice(), exponent: batten.exponent,
        diameterMM: dia, fromRib, toRib,
      });
  }

  if (!groups.length && !problems.length) problems.push('the spec defines no rods');

  const describe = (g) => (g.kind === 'nose'
    ? `a nose rod from ${(g.upperZone[1] * 100).toFixed(1)}% on top round to `
      + `${(g.lowerZone[1] * 100).toFixed(1)}% underneath`
    : `a batten from ${(g.frontZone[0] * 100).toFixed(1)}% to ${(g.aftZone[1] * 100).toFixed(1)}% on top`);
  return {
    groups,
    problems,
    inferred,
    ok: problems.length === 0,
    count: groups.length,
    note: problems.length === 0
      ? groups.map(describe).join('; ')
        + (inferred.length ? ` (${inferred.join('; ')})` : '')
      : `${problems.length} problem(s): ${problems[0]}`,
  };
}

/** The spec text for the Swoop2's own rods, as a starting point. */
export const SWOOP2_ROD_SPEC = `# kind    first zone   second zone   dia
nose      12.0 18.5    7.0 15.0      1.5
batten    23.5 29.5    63.0 70.0     1.5`;

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
    // An anchor on the centreline is ONE tab that the line from each half
    // comes to, so it carries both: twice the one line the half model has.
    const centre = onCentreline(a.to);
    const tensionN = (byName ? (byName.get(a.name) ?? 0) : 0) * (centre ? 2 : 1);
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
      // How many of this tab the whole wing has.
      copies: centre ? 1 : 2,
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

  const overloaded = tabs.filter((t) => t.seamLoadDaNPerCm > T.seamStrengthDaNPerCm + 1e-9);
  return {
    tabs,
    count: tabs.reduce((s, t) => s + t.copies, 0),
    totalAreaM2: tabs.reduce((s, t) => s + t.areaM2 * t.copies, 0),
    massKg: tabs.reduce((s, t) => s + t.massKg * t.copies, 0),
    // A tab that has hit the maximum width and still exceeds its seam load is
    // a real design problem: the answer is another anchor, not a wider tab.
    overloaded,
    ok: overloaded.length === 0,
    spec: T,
    // Counted as the wing has them, like `count` above: these were tabs of
    // the half wing beside a count of the whole, "67 at minimum width" out
    // of 129.
    loadSized: tabs.filter((t) => t.widthLimitedBy === 'load').reduce((s, t) => s + t.copies, 0),
    floorSized: tabs.filter((t) => t.widthLimitedBy === 'minimum').reduce((s, t) => s + t.copies, 0),
    cappedSized: tabs.filter((t) => t.widthLimitedBy === 'maximum').reduce((s, t) => s + t.copies, 0),
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
