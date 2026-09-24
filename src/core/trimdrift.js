/* trimdrift.js — why a wing goes out of trim, and when to check it.
 *
 * A line set does not keep its length. Under load and over hours the fibres
 * move, and they do not all move the same way:
 *
 * **Dyneema creeps.** It is a polyethylene, and under sustained load it
 * elongates permanently. The lines get LONGER. It is worst in the most heavily
 * loaded lines, which on a paraglider are the A's.
 *
 * **Aramid shrinks.** It absorbs moisture and relaxes, and over a season the
 * lines get SHORTER. It is roughly uniform, so it moves the whole wing rather
 * than tilting it.
 *
 * A cascade built entirely from one fibre drifts as a unit and mostly stays
 * in trim. A cascade that mixes them — which most modern wings do, because
 * unsheathed Dyneema is thin where it matters and aramid is stable where it
 * matters — drifts *differentially*, and that is what changes the angle of
 * attack.
 *
 * ---------------------------------------------------------------------------
 * Why it matters more than it sounds
 * ---------------------------------------------------------------------------
 * The A and C rows are about a metre apart along the chord. If the A lines
 * creep 15 mm and the C lines do not, the wing rotates nose-up by
 * `atan(0.015 / 1.07)` — about 0.8 degrees. That is a large fraction of the
 * usable angle-of-attack range, and it arrives slowly enough that a pilot
 * does not notice it happening.
 *
 * Hence the schedule: a first trim check at 40 to 60 hours, when creep is
 * fastest, and a new line set at about 200. This models what those checks
 * are looking for.
 *
 * The rates below are ESTIMATES. This project has no measured creep data, and
 * says so where it says anything.
 */

/** How a fibre changes length over its life, as a fraction. */
export const FIBRE_BEHAVIOUR = {
  dyneema: {
    // Creep is roughly logarithmic in time and rises with sustained load.
    //
    // Calibrated so a 6.5 m A line working at half its rating drifts about
    // 18 mm over a 200 hour service life — which is the order a trim check
    // is looking for and roughly one and a half times the PMA's 12 mm band.
    //
    // My first values gave 28 mm at TWENTY hours and 49 mm at 200, which is
    // several times what a real line does. The shape of the curve was right
    // and the scale was not, and a model that is right in shape and wrong by
    // a factor of three is worse than one that is obviously broken.
    creepAt100h: 0.0011,        // 1.1 mm per metre at 100 h, quarter load
    creepLoadExponent: 1.4,     // steeper than linear in load fraction
    shrinkPerSeason: 0,
    note: 'creeps under load; the more heavily loaded the line, the more',
  },
  aramid: {
    creepAt100h: 0.0002,
    creepLoadExponent: 1.0,
    // Aramid takes up moisture and relaxes; the effect is a shortening.
    shrinkPerSeason: 0.0015,
    note: 'barely creeps but shrinks with moisture, roughly uniformly',
  },
  polyester: {
    creepAt100h: 0.0035,
    creepLoadExponent: 1.2,
    shrinkPerSeason: 0.0005,
    note: 'creeps more than Dyneema and is used where that does not matter',
  },
};

// The rates are this project's estimates, not measured data.
Object.defineProperty(FIBRE_BEHAVIOUR, 'provenance', {
  value: 'ESTIMATED by this project; no measured creep data. The DIRECTIONS '
    + '(Dyneema creeps, aramid shrinks) are well established; the rates are '
    + 'plausible magnitudes and should not be quoted as measurements.',
  enumerable: false,
});

/** Which fibre a material is, from its name. */
export function fibreOf(material) {
  const n = `${material.name ?? ''} ${material.code ?? ''}`.toLowerCase();
  if (/aramid|kevlar|technora|vectran|tsl|ppsl/.test(n)) return 'aramid';
  if (/polyester|dsl|ldc/.test(n)) return 'polyester';
  // Edelrid 8000/9200, Liros DC/DFLC/LTC, Cousin are Dyneema cores.
  return 'dyneema';
}

/**
 * How much one line changes length after a given number of flying hours.
 *
 * `loadFraction` is how hard the line works relative to its rating. A line at
 * a quarter of its rated strength creeps far less than one at half, which is
 * why the answer is not simply "Dyneema creeps 0.25%".
 */
export function lineDrift({
  material, lengthMM, hours, loadFraction = 0.25, seasons = null,
  behaviour = FIBRE_BEHAVIOUR,
}) {
  if (!(lengthMM > 0)) throw new Error('lineDrift needs a positive length');
  if (!(hours >= 0)) throw new Error('lineDrift needs non-negative hours');

  const fibre = fibreOf(material);
  const b = behaviour[fibre];
  if (!b) throw new Error(`lineDrift: no behaviour for fibre "${fibre}"`);

  // Creep is logarithmic in time: most of it happens early, which is why the
  // first trim check comes at 40 to 60 hours and not at 150.
  // Normalised so the factor is 1 at 100 hours. Most of the movement is in
  // the first fifty, which is what puts the first trim check there.
  const timeFactor = hours <= 0 ? 0 : Math.log10(1 + hours) / Math.log10(101);
  const loadFactor = (loadFraction / 0.25) ** b.creepLoadExponent;
  const creep = b.creepAt100h * timeFactor * loadFactor;

  // Shrinkage is seasonal rather than hourly: a wing stored over a winter
  // shrinks whether it flies or not.
  const yrs = seasons ?? hours / 150;
  const shrink = b.shrinkPerSeason * yrs;

  const netFraction = creep - shrink;
  return {
    fibre,
    hours,
    loadFraction,
    creepFraction: creep,
    shrinkFraction: shrink,
    netFraction,
    deltaMM: netFraction * lengthMM,
    lengthMM,
    newLengthMM: lengthMM * (1 + netFraction),
    note: `${fibre}: ${b.note}`,
  };
}

/**
 * What the drift does to the wing's trim.
 *
 * The rows are what matter. If every line drifts the same amount the wing
 * gets slightly longer lines and flies almost the same; if the A row drifts
 * differently from the C row, the wing rotates.
 */
export function trimDrift({
  lines, hours, anchors, chordM, behaviour = FIBRE_BEHAVIOUR,
}) {
  if (!lines?.length) throw new Error('trimDrift needs lines');
  if (!anchors) throw new Error('trimDrift needs the anchor chord fractions');

  const byRow = {};
  for (const l of lines) {
    if (!l.line || !(l.referenceLengthMM > 0)) continue;
    const loadFraction = l.ratedDaN > 0
      ? Math.min(1, (l.requiredDaN ?? 0) / l.ratedDaN) : 0.25;
    const d = lineDrift({
      material: l.line,
      lengthMM: l.referenceLengthMM,
      hours,
      loadFraction,
      behaviour,
    });
    (byRow[l.row] ||= []).push(d);
  }

  const rowDrift = {};
  for (const [row, ds] of Object.entries(byRow)) {
    rowDrift[row] = {
      lines: ds.length,
      meanDeltaMM: ds.reduce((a, d) => a + d.deltaMM, 0) / ds.length,
      fibres: [...new Set(ds.map((d) => d.fibre))],
    };
  }

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
    // Rear lines growing MORE than front lines lowers the angle of attack.
    alphaChangeDeg = leverM > 0
      ? -Math.atan(differentialM / leverM) * (180 / Math.PI) : 0;
  }

  const mixed = new Set(Object.values(rowDrift).flatMap((r) => r.fibres)).size > 1;

  return {
    hours,
    rowDrift,
    leverM,
    alphaChangeDeg,
    mixedFibres: mixed,
    source: 'estimated',
    // The number a trim check is looking for.
    worstRowDeltaMM: Math.max(...Object.values(rowDrift)
      .map((r) => Math.abs(r.meanDeltaMM)), 0),
    note: mixed
      ? 'the cascade mixes fibres, so it drifts differentially and the trim '
        + 'moves as well as the lengths'
      : 'one fibre throughout, so the whole cascade drifts together and the '
        + 'trim moves far less than the lengths do',
  };
}

/**
 * When to look, and when to replace.
 *
 * A trim check is worth doing when the drift has become measurable but before
 * it has become a problem. Creep is logarithmic, so most of it arrives early:
 * that is why the first check is at 40 to 60 hours rather than halfway
 * through the set's life.
 */
export function trimSchedule({
  lines, anchors, chordM, toleranceMM = 12,
  firstCheckHours = 50, replaceHours = 200, behaviour = FIBRE_BEHAVIOUR,
}) {
  const at = (h) => trimDrift({ lines, hours: h, anchors, chordM, behaviour });

  const first = at(firstCheckHours);
  const end = at(replaceHours);

  // When does drift first exceed the PMA measurement band? That is when a
  // check would actually find something.
  let detectableAt = null;
  for (let h = 5; h <= replaceHours; h += 5) {
    if (at(h).worstRowDeltaMM >= toleranceMM) { detectableAt = h; break; }
  }

  return {
    firstCheckHours,
    replaceHours,
    toleranceMM,
    atFirstCheck: first,
    atReplacement: end,
    detectableAtHours: detectableAt,
    // A check before anything is measurable finds nothing; one long after
    // the wing has drifted finds it too late.
    checkIsUseful: detectableAt != null && detectableAt <= replaceHours,
    note: detectableAt == null
      ? `drift stays inside ${toleranceMM} mm for the whole ${replaceHours} `
        + 'hour life: this cascade holds its trim'
      : `drift reaches ${toleranceMM} mm at about ${detectableAt} hours, `
        + `${detectableAt < firstCheckHours ? 'before' : 'after'} the first `
        + `check at ${firstCheckHours}`,
  };
}
