/* trimdrift.js — why a wing goes out of trim, and when to check it.
 *
 * A line set does not keep its length, and the fibres do not behave alike.
 * What the people who make and service wings report:
 *
 * **Dyneema shrinks.** "Dyneema (and Vectran) lines settle in during the
 * first 20 to 50 hours of flying. Typically all Dyneema lines shrink a little
 * over this period", and "the more lightly-loaded rear lines shrink more than
 * the front lines" (Aerofix, a service workshop). UP say the same of their
 * own wings: "as soon as a glider with shrunken lines is taken out for its
 * next flight, the A and B lines, which carry much more weight than the C
 * lines, will return to their original length, while the C-lines will remain
 * too short and bring the glider out of certified trim." Under load it is
 * the stable one: "they don't stretch (much)".
 *
 * **Aramid holds its length.** "Several years before the shrinkage is
 * sufficient to require any trim adjustment" (Aerofix); "at least they don't
 * shrink" (UP). What aramid loses is strength where it is bent — which is the
 * other half of the choice, and is in `data/reference/line-materials.tsv`.
 *
 * So the rear rows go short, and a wing with short rear lines flies at a
 * higher angle of attack: slower, and nearer the stall.
 *
 * ---------------------------------------------------------------------------
 * What this file used to say
 * ---------------------------------------------------------------------------
 * The opposite, on both counts: that Dyneema creeps LONGER under load, worst
 * on the A lines, and that aramid shrinks with moisture, uniformly — "the
 * directions are well established". It also took the fibre from the line's
 * name and had the two commonest families backwards: Edelrid's 8000-U and
 * 8001 are aramid (a DHV test report and Edelrid's own page say so) and were
 * classed as Dyneema; Liros's PPSL is Dyneema under a polyester cover (Liros's
 * catalogue) and was classed as aramid. And it measured how hard a line works
 * by its share of the 8 g limit load with its margin, where what a line
 * carries hour after hour is level flight — a twelfth of that.
 *
 * ---------------------------------------------------------------------------
 * Why it matters more than it sounds
 * ---------------------------------------------------------------------------
 * The A and C rows are about a metre apart along the chord. If the C lines
 * end up 15 mm short and the A lines do not, the wing rotates nose-up by
 * `atan(0.015 / 1.07)` — about 0.8 degrees. That is a large fraction of the
 * usable angle-of-attack range, and it arrives slowly enough that a pilot
 * does not notice it happening.
 *
 * The sizes below are ESTIMATES held to what the sources give: a direction, a
 * time, and one supplier's upper bound. This project has no measurements of
 * its own, and says so where it says anything.
 */

/* ---------------------------------------------------------------- fibres -- */

/**
 * Which fibre a line is, by the family it belongs to.
 *
 * Held to `data/reference/line-materials-suppliers.tsv`, which gives the
 * source for each: the supplier's data sheet or catalogue, a DHV test report,
 * or a manufacturer's own materials list. `cover` is null for a line braided
 * and coated without a sheath.
 *
 * Aramid here is Kevlar and Technora alike. Vectran is neither aramid nor
 * polyethylene, and is kept apart because it settles as Dyneema does while
 * the inspection standard asks of it what it asks of aramid.
 */
export const LINE_FAMILIES = [
  // Edelrid. The four-digit article number is the family; a sheet writes it
  // "8000U-050", "A-8000/U 50" or, on Niviuk's, just "U-50".
  { maker: 'Edelrid', family: '8001', match: /\b8001/, core: 'aramid', cover: null },
  { maker: 'Edelrid', family: '8000-U', match: /\b8000|(^|[^A-Z])U-?\d{2,3}\b/, core: 'aramid', cover: null },
  { maker: 'Edelrid', family: '9200', match: /\b9200/, core: 'dyneema', cover: null },
  { maker: 'Edelrid', family: '7343', match: /\b7343/, core: 'aramid', cover: 'polyester' },
  { maker: 'Edelrid', family: '6843', match: /\b6843/, core: 'aramid', cover: 'polyester' },
  { maker: 'Edelrid', family: '7850', match: /\b7850|\bTARAX/, core: 'dyneema', cover: 'polyester' },
  { maker: 'Edelrid', family: '7950', match: /\b7950|\bMATRIX/, core: 'dyneema', cover: 'polyester' },
  // Liros. PPSLS before PPSL: the longer name first.
  { maker: 'Liros', family: 'PPSLS', match: /\bPPSLS/, core: 'dyneema', cover: 'polyester' },
  { maker: 'Liros', family: 'PPSL', match: /\bPPSL/, core: 'dyneema', cover: 'polyester' },
  { maker: 'Liros', family: 'DSL', match: /\bDSL/, core: 'dyneema', cover: 'polyester' },
  { maker: 'Liros', family: 'DFL', match: /\bDFL/, core: 'dyneema', cover: 'polyester' },
  { maker: 'Liros', family: 'DC', match: /\bDC[- ]?\d/, core: 'dyneema', cover: null },
  { maker: 'Liros', family: 'LTC', match: /\bLTC/, core: 'aramid', cover: null },
  { maker: 'Liros', family: 'TSL', match: /\bTSL/, core: 'aramid', cover: 'polyester' },
  { maker: 'Liros', family: 'TCR', match: /\bTCR/, core: 'aramid', cover: null, inferred: true },
  { maker: 'Teijin', family: 'TNL', match: /\bTNL/, core: 'aramid', cover: 'polyester' },
  // Cousin's Vectran, as PHI's strength table abbreviates it.
  {
    maker: 'Cousin', family: 'Vectraline', match: /\bV1[26]-\d|\bVLD\d|VECTRA/,
    core: 'vectran', cover: null, inferred: true,
  },
];

/** The family a line belongs to, from its name or code; null if not known. */
export function lineFamilyOf(material) {
  const text = (typeof material === 'string'
    ? material : `${material?.name ?? ''} ${material?.code ?? ''}`).toUpperCase();
  if (!text.trim()) return null;
  return LINE_FAMILIES.find((f) => f.match.test(text)) ?? null;
}

/**
 * Which fibre carries the load in a line: 'dyneema', 'aramid', 'vectran', or
 * 'unknown'.
 *
 * A design that states its own materials is believed first — an imported
 * LEparagliding file calls its line types `s_dyneem`, `u_dyneem` and so on —
 * then the family, then a fibre named outright. A line that is none of those
 * is 'unknown', and is reported as that: this returned 'dyneema' for anything
 * it did not recognise, which is how the aramid lines came to be Dyneema.
 */
export function fibreOf(material) {
  const named = (s) => {
    const t = String(s ?? '').toLowerCase();
    if (/dyne|hmpe|spectra|\buhmw/.test(t)) return 'dyneema';
    if (/aramid|kevlar|technora|twaron/.test(t)) return 'aramid';
    if (/vectran/.test(t)) return 'vectran';
    return null;
  };
  if (material && typeof material === 'object') {
    const stated = named(material.fibre) ?? named(material.core);
    if (stated) return stated;
  }
  const family = lineFamilyOf(material);
  if (family) return family.core;
  return named(typeof material === 'string'
    ? material : `${material?.name ?? ''} ${material?.code ?? ''}`) ?? 'unknown';
}

/** Whether a line has a braided cover over its core; null if not known. */
export function isSheathed(material) {
  if (material && typeof material === 'object' && /^[su]_/.test(String(material.fibre ?? ''))) {
    return /^s_/.test(material.fibre);
  }
  const family = lineFamilyOf(material);
  return family ? family.cover != null : null;
}

/* ------------------------------------------------------------- behaviour -- */

/**
 * How a fibre changes length over its life, as a fraction of the line.
 *
 *   settleShrink     what an UNLOADED line has lost once it has settled
 *   settleHours      the time constant of the settling, in flying hours
 *   shrinkPerSeason  what an unloaded line goes on losing each year
 *
 * Dyneema. Liros specify "shrinkage < 0.5 %" for PPSL, their pre-stretched
 * Dyneema under a polyester cover, so 0.4 % sits under the supplier's own
 * bound; and a time constant of 20 hours has 71 % of it arrive by 25 hours
 * and 92 % by 50, which is "the first 20 to 50 hours". Vectran is said to
 * settle as Dyneema does and has no figure of its own here.
 *
 * Aramid. Nothing in the first hours; 0.06 % a year on an unloaded line,
 * which takes a rear row about five years to come 10 mm short of the front —
 * "several years before the shrinkage is sufficient to require any trim
 * adjustment".
 */
export const FIBRE_BEHAVIOUR = {
  dyneema: {
    settleShrink: 0.004,
    settleHours: 20,
    shrinkPerSeason: 0,
    note: 'shrinks as it settles in, over the first 20 to 50 hours; '
      + 'flight load pulls it back out, so the lightly loaded lines stay short',
  },
  vectran: {
    settleShrink: 0.004,
    settleHours: 20,
    shrinkPerSeason: 0,
    note: 'said to settle in as Dyneema does; it has no figure of its own here',
  },
  aramid: {
    settleShrink: 0,
    settleHours: 20,
    shrinkPerSeason: 0.0006,
    note: 'holds its length; years before it has moved enough to matter',
  },
};

// The sizes are this project's estimates, not measured data.
Object.defineProperty(FIBRE_BEHAVIOUR, 'provenance', {
  value: 'ESTIMATED by this project; it has no length measurements of aged '
    + 'lines. The DIRECTIONS are the makers\' and a service workshop\'s: '
    + 'Dyneema shrinks as it settles and the lightly loaded lines stay short '
    + '(UP; Aerofix), aramid holds its length for years (Aerofix). The SIZES '
    + 'are held to what those sources give — Liros\'s "shrinkage < 0.5 %", '
    + '"the first 20 to 50 hours", "several years" — and should not be '
    + 'quoted as measurements.',
  enumerable: false,
});

/**
 * The level-flight load, as a fraction of its new strength, at which a line
 * is pulled back to its full length.
 *
 * A line carrying this or more holds its length; one carrying nothing keeps
 * the whole of its shrinkage; in between, in proportion.
 *
 * Set from a real lineset. On PHI's Allegro X-alps the top lines of the A and
 * B rows carry 3.1 and 3.4 % of their new strength in level flight
 * (`publishedCascadeLoads`), the C row's 1.9 % and the D row's 1.0 %; UP's
 * account is that the A and B lines return to their length and the C lines
 * do not. 2.5 % is between the two. An estimate, like the rest.
 */
export const NEUTRAL_LOAD_FRACTION = 0.025;

/**
 * Flying hours in a year, for the part of the change that goes by the
 * calendar. The inspection standard pairs 150 hours with 3 years.
 */
export const HOURS_PER_SEASON = 50;

/**
 * How much one line changes length after a given number of flying hours.
 *
 * `loadFraction` is what the line carries in LEVEL FLIGHT over its strength
 * new — a few per cent, on any line of any wing. It is not the line's share
 * of its limit load: that is the load it must survive once, and this is the
 * load it lives under.
 */
export function lineDrift({
  material, lengthMM, hours, loadFraction = 0, seasons = null,
  behaviour = FIBRE_BEHAVIOUR, neutralLoadFraction = NEUTRAL_LOAD_FRACTION,
}) {
  if (!(lengthMM > 0)) throw new Error('lineDrift needs a positive length');
  if (!(hours >= 0)) throw new Error('lineDrift needs non-negative hours');
  if (!(loadFraction >= 0)) throw new Error('lineDrift needs a load fraction of zero or more');

  const fibre = fibreOf(material);
  const b = behaviour[fibre];
  if (!b) {
    throw new Error(`lineDrift: no behaviour for fibre "${fibre}"`
      + (fibre === 'unknown' ? ` (${material?.name ?? material?.code ?? material})` : ''));
  }

  // How much of its shrinkage the line keeps: all of it unloaded, none at
  // the neutral load or above.
  const kept = Math.max(0, Math.min(1, 1 - loadFraction / neutralLoadFraction));
  // Settling saturates: most of it is over by fifty hours.
  const settled = hours <= 0 ? 0 : 1 - Math.exp(-hours / b.settleHours);
  const settle = b.settleShrink * settled * kept;
  // The slow part goes by the calendar: a wing in its bag shrinks too.
  const yrs = seasons ?? hours / HOURS_PER_SEASON;
  const seasonal = b.shrinkPerSeason * yrs * kept;

  const netFraction = -(settle + seasonal);
  return {
    fibre,
    hours,
    seasons: yrs,
    loadFraction,
    keptFraction: kept,
    settledFraction: settled,
    settleShrinkFraction: settle,
    seasonalShrinkFraction: seasonal,
    netFraction,
    deltaMM: netFraction * lengthMM,
    lengthMM,
    newLengthMM: lengthMM * (1 + netFraction),
    note: `${fibre}: ${b.note}`,
  };
}

/** What a line carries in level flight, over its strength new. */
export function flightLoadFraction(line) {
  const newDaN = line?.line?.strengthNewDaN ?? line?.line?.strengthDaN ?? line?.ratedDaN;
  const tensionN = line?.tensionN ?? line?.flightN;
  if (!(newDaN > 0) || !(tensionN >= 0)) return null;
  return tensionN / 10 / newDaN;
}

/**
 * What the drift does to the wing's trim.
 *
 * A wing hangs from attachment points, and what moves an attachment point is
 * the SUM of the changes in the lines between it and the riser. So this works
 * on paths (`planPaths`): a top line, the middle line under it, the main line
 * under that.
 *
 * It averaged the change of every LINE in a row — top, middle and main lines
 * as so many separate samples — which on a three-level cascade is about a
 * third of what an attachment point moves.
 *
 * @param {object[]} lines  the length chain's lines: name, row, the chosen
 *                          `line`, `referenceLengthMM`, and `tensionN` in
 *                          level flight
 * @param {object[]} [paths]  from `planPaths`. Left out, every line is taken
 *                          to be a whole path — which a cascade's are not, so
 *                          a cascade without its paths is refused.
 */
export function trimDrift({
  lines, hours, anchors, chordM, paths = null, seasons = null,
  behaviour = FIBRE_BEHAVIOUR, neutralLoadFraction = NEUTRAL_LOAD_FRACTION,
}) {
  if (!lines?.length) throw new Error('trimDrift needs lines');
  if (!anchors) throw new Error('trimDrift needs the anchor chord fractions');
  if (!paths && new Set(lines.map((l) => l.level).filter(Boolean)).size > 1) {
    throw new Error('trimDrift: these lines are a cascade, and an attachment '
      + 'point moves by the sum of the lines under it — pass the plan\'s paths');
  }

  // Every line's own change.
  const byName = new Map();
  const unknownFibre = [];
  for (const l of lines) {
    if (!l.line || !(l.referenceLengthMM > 0)) continue;
    if (fibreOf(l.line) === 'unknown') { unknownFibre.push(l.name); continue; }
    byName.set(l.name, {
      line: l,
      drift: lineDrift({
        material: l.line,
        lengthMM: l.referenceLengthMM,
        hours,
        seasons,
        loadFraction: flightLoadFraction(l) ?? 0,
        behaviour,
        neutralLoadFraction,
      }),
    });
  }

  // Every attachment point's: the sum down its path.
  const routes = paths ?? [...byName.values()].map(({ line }) => ({
    name: line.name, row: line.row, index: line.index ?? null, names: [line.name],
    isBrake: line.row === 'K' || !!line.isBrake, isStabilo: line.row === 'S' || !!line.isStabilo,
  }));
  const points = [];
  for (const p of routes) {
    const parts = p.names.map((n) => byName.get(n));
    // A path with a line of unknown fibre in it cannot be summed.
    if (parts.some((x) => !x)) continue;
    points.push({
      name: p.name,
      row: p.row,
      index: p.index,
      isBrake: !!p.isBrake,
      isStabilo: !!p.isStabilo,
      lengthMM: parts.reduce((a, x) => a + x.line.referenceLengthMM, 0),
      deltaMM: parts.reduce((a, x) => a + x.drift.deltaMM, 0),
      fibres: [...new Set(parts.map((x) => x.drift.fibre))],
    });
  }

  const rowDrift = {};
  for (const p of points) {
    const r = (rowDrift[p.row] ||= {
      points: 0, meanDeltaMM: 0, minDeltaMM: Infinity, maxDeltaMM: -Infinity, fibres: [],
    });
    r.points += 1;
    r.meanDeltaMM += p.deltaMM;
    r.minDeltaMM = Math.min(r.minDeltaMM, p.deltaMM);
    r.maxDeltaMM = Math.max(r.maxDeltaMM, p.deltaMM);
    for (const f of p.fibres) if (!r.fibres.includes(f)) r.fibres.push(f);
  }
  for (const r of Object.values(rowDrift)) r.meanDeltaMM /= r.points;

  // The rotation: the difference between the front and rear rows over the
  // distance between them, which is the same lever `alphaChange` uses.
  const rows = Object.keys(rowDrift).filter((r) => anchors[r] != null).sort(
    (a, b) => anchors[a] - anchors[b]);
  let alphaChangeDeg = 0;
  let leverM = 0;
  if (rows.length >= 2) {
    const front = rows[0];
    const rear = rows[rows.length - 1];
    leverM = (anchors[rear] - anchors[front]) * chordM;
    const differentialM = (rowDrift[rear].meanDeltaMM
      - rowDrift[front].meanDeltaMM) / 1000;
    // Rear lines ending SHORTER than the front raise the angle of attack.
    alphaChangeDeg = leverM > 0
      ? -Math.atan(differentialM / leverM) * (180 / Math.PI) : 0;
  }

  // What an inspection's single offset cannot take out: how far apart the
  // suspension points have moved from one another. The brakes have a band of
  // their own.
  const suspension = points.filter((p) => !p.isBrake);
  const deltas = suspension.map((p) => p.deltaMM);
  const spreadMM = deltas.length ? Math.max(...deltas) - Math.min(...deltas) : 0;
  const fibres = [...new Set(suspension.flatMap((p) => p.fibres))];
  const short = rows.filter((r) => rowDrift[r].meanDeltaMM < -1);

  return {
    hours,
    points,
    rowDrift,
    leverM,
    alphaChangeDeg,
    spreadMM,
    fibres,
    mixedFibres: fibres.length > 1,
    unknownFibre,
    source: 'estimated',
    // The number a trim check is looking for.
    worstRowDeltaMM: Math.max(...Object.values(rowDrift)
      .map((r) => Math.abs(r.meanDeltaMM)), 0),
    note: !short.length
      ? 'no row ends more than a millimetre from its length: this cascade '
        + 'holds its trim'
      : `the ${short.join(', ')} row${short.length > 1 ? 's end' : ' ends'} short, `
        + `${short.map((r) => `${r} by ${(-rowDrift[r].meanDeltaMM).toFixed(0)} mm`).join(', ')} `
        + 'on average: the lines that carry least keep most of their shrinkage',
  };
}

/**
 * When to look, and when to replace.
 *
 * Settling saturates, so most of the movement arrives early: that is why the
 * first check comes at 25 to 50 hours rather than halfway through the set's
 * life.
 *
 * Two thresholds, both against the inspection band (`toleranceMM`, the PMA's
 * 12 mm). A single offset is allowed on every measurement, so what counts is
 * how far the attachment points have moved from ONE ANOTHER:
 *
 *   detectableAtHours     two points a whole tolerance apart — a measurement
 *                         would show it
 *   outOfToleranceAtHours two points more than twice the tolerance apart — no
 *                         one offset brings both inside the band
 */
export function trimSchedule({
  lines, anchors, chordM, paths = null, toleranceMM = 12,
  firstCheckHours = 50, replaceHours = 200, behaviour = FIBRE_BEHAVIOUR,
  neutralLoadFraction = NEUTRAL_LOAD_FRACTION,
}) {
  const at = (h) => trimDrift({
    lines, hours: h, anchors, chordM, paths, behaviour, neutralLoadFraction,
  });

  const first = at(firstCheckHours);
  const end = at(replaceHours);

  let detectableAt = null;
  let outAt = null;
  for (let h = 5; h <= replaceHours; h += 5) {
    const spread = at(h).spreadMM;
    if (detectableAt == null && spread >= toleranceMM) detectableAt = h;
    if (outAt == null && spread > 2 * toleranceMM) { outAt = h; break; }
  }

  return {
    firstCheckHours,
    replaceHours,
    toleranceMM,
    atFirstCheck: first,
    atReplacement: end,
    detectableAtHours: detectableAt,
    outOfToleranceAtHours: outAt,
    // A check before anything is measurable finds nothing; one long after
    // the wing has drifted finds it too late.
    checkIsUseful: detectableAt != null && detectableAt <= replaceHours,
    note: detectableAt == null
      ? `the attachment points stay within ${toleranceMM} mm of one another `
        + `for the whole ${replaceHours} hour life (${end.spreadMM.toFixed(0)} mm `
        + 'at the end): this cascade holds its trim'
      : `the attachment points are ${toleranceMM} mm apart by about `
        + `${detectableAt} hours, ${detectableAt <= firstCheckHours ? 'by' : 'after'} `
        + `the first check at ${firstCheckHours}`
        + (outAt != null
          ? `, and past what one offset can absorb (${2 * toleranceMM} mm) by ${outAt}`
          : `, and ${end.spreadMM.toFixed(0)} mm apart at ${replaceHours} — inside `
            + `what one offset can absorb (${2 * toleranceMM} mm)`),
  };
}
