/* risers.js — risers, the speed system, and accelerated flight.
 *
 * Everything upstream of here treats the wing as flying at one attitude. It
 * does not: pushing the speedbar shortens the front risers more than the rear
 * ones, which rotates the whole wing nose-down, drops the angle of attack and
 * trades sink for speed. That is the single largest change a pilot makes to
 * the geometry in flight, and until now none of it was modelled.
 *
 * ---------------------------------------------------------------------------
 * How a speed system changes the angle of attack
 * ---------------------------------------------------------------------------
 * The risers hang from one maillon. The A row attaches near the nose, the
 * rear row well aft. Shortening A by more than C tips the chord line forward
 * by roughly
 *
 *     delta alpha = atan( (dA - dC) / ((xC - xA) * chord) )
 *
 * where dA and dC are how much each riser shortened and xA, xC are the
 * chordwise anchor positions. The denominator is the lever the system works
 * against: a wing whose rear row sits further aft needs more travel for the
 * same angle change.
 *
 * This is a geometric statement about the rigging, not an aerodynamic one.
 * What it produces — a new angle of attack — is then handed to the existing
 * equilibrium solver, which already knows how to turn an angle into a speed
 * and a glide ratio.
 *
 * ---------------------------------------------------------------------------
 * Why the brakes move too
 * ---------------------------------------------------------------------------
 * The brake line runs up through a pulley mounted on a riser. When that riser
 * shortens under bar, the pulley comes down with it and the brake goes
 * slack — the handle has further to travel before anything happens. On a wing
 * with real travel this is enough to change the brake feel completely, which
 * is why brake travel compensation exists. `brakeSlackUnderBar` reports it.
 */

import { rad, deg } from './num.js';
import { solveEquilibrium } from './equilibrium.js';
import { wingPolar, thinAirfoil } from './aero.js';

/**
 * A riser set.
 *
 * `travelMM` is the speedway travel — how far the pulleys can draw the risers
 * together, which is what a manufacturer quotes. `share` is the fraction of
 * that travel each riser takes: the front riser normally takes all of it and
 * the rear none, with intermediate risers in between, so the wing rotates
 * rather than simply rising.
 */
export function riserSet({
  rows = ['A', 'B', 'C'],
  lengthMM = 500,
  travelMM = 180,
  share = null,
  anchors = { A: 0.085, B: 0.30, C: 0.53, D: 0.78 },
  brakePulleyOn = null,
} = {}) {
  // Default share: full travel on the front riser falling linearly to none on
  // the rear. A two-liner therefore moves A fully and B not at all, which is
  // exactly how a two-line speed system works.
  const n = rows.length;
  const defaultShare = {};
  rows.forEach((r, i) => { defaultShare[r] = n === 1 ? 0 : 1 - i / (n - 1); });

  return {
    rows,
    lengthMM,
    travelMM,
    share: share || defaultShare,
    anchors,
    // The brake pulley normally sits on the rearmost riser, which is the one
    // that moves least — but it still moves.
    brakePulleyOn: brakePulleyOn || rows[rows.length - 1],
  };
}

/** Riser lengths at a given bar position, 0 = neutral, 1 = full bar. */
export function riserLengths(rs, bar = 0) {
  const b = Math.max(0, Math.min(1, bar));
  const out = {};
  for (const r of rs.rows) {
    out[r] = rs.lengthMM - b * rs.travelMM * (rs.share[r] ?? 0);
  }
  return out;
}

/**
 * Change in angle of attack at a bar position, in degrees (negative = nose
 * down). `chordM` is the central chord, which sets the lever arm.
 */
export function alphaChange(rs, bar, chordM) {
  const L = riserLengths(rs, bar);
  const front = rs.rows[0];
  const rear = rs.rows[rs.rows.length - 1];
  const dFront = rs.lengthMM - L[front];
  const dRear = rs.lengthMM - L[rear];

  const xFront = rs.anchors[front];
  const xRear = rs.anchors[rear];
  const leverM = (xRear - xFront) * chordM;
  if (leverM <= 0) return 0;

  return -deg(Math.atan(((dFront - dRear) / 1000) / leverM));
}

/**
 * Brake slack introduced by the bar.
 *
 * The pulley rides on a riser; when that riser shortens the pulley descends
 * and the brake line goes slack by the same amount, doubled if the line is
 * rove through the pulley and back.
 */
export function brakeSlackUnderBar(rs, bar, { roving = 1 } = {}) {
  const L = riserLengths(rs, bar);
  const drop = rs.lengthMM - L[rs.brakePulleyOn];
  return {
    pulleyDropMM: drop,
    extraBrakeTravelMM: drop * roving,
    riser: rs.brakePulleyOn,
  };
}

/**
 * The accelerated polar: speed and glide across the bar range.
 *
 * The bar changes the angle of attack, and the section's lift and moment
 * coefficients change with it. `czAt` and `cmAt` supply that relationship —
 * a thin-airfoil estimate or a measured polar — because the equilibrium
 * solver takes them as inputs rather than deriving them.
 *
 * ---------------------------------------------------------------------------
 * Why this guards its own inputs
 * ---------------------------------------------------------------------------
 * Speed goes as 1/sqrt(Cz), so the polar is most sensitive to the lift
 * coefficient exactly where the lift coefficient is least trustworthy. A
 * linear lift slope fitted around trim, run down through eight degrees of bar,
 * happily returns Cz near 0.1 — and the solver, asked no questions, reports a
 * paraglider doing 99 km/h.
 *
 * No paraglider flies at Cz 0.1. A wing at full bar sits nearer 0.35, and
 * below roughly 0.25 the linear fit has left the range any section polar
 * supports. Rows computed outside `czRange` are flagged rather than dropped,
 * and the summary reports whether the top of the range is trustworthy, so a
 * plausible-looking speed cannot be read off a fit that has been extrapolated
 * past its evidence.
 */
export function acceleratedPolar({
  riser,
  base,
  chordM,
  czAt,
  cmAt = null,
  steps = 11,
  czRange = [0.25, 1.30],
}) {
  const rows = [];
  for (let i = 0; i < steps; i++) {
    const bar = i / (steps - 1);
    const dAlpha = alphaChange(riser, bar, chordM);
    const alpha = base.alphaDeg + dAlpha;
    const cz = czAt(alpha);
    const inRange = cz >= czRange[0] && cz <= czRange[1];
    const r = solveEquilibrium({
      ...base,
      alphaDeg: alpha,
      cz,
      cm: cmAt ? cmAt(alpha) : base.cm,
    });
    rows.push({
      bar,
      barMM: bar * riser.travelMM,
      alphaDeg: alpha,
      deltaAlphaDeg: dAlpha,
      cz,
      inRange,
      speedKMH: r.speedKMH,
      speedMS: r.speedMS,
      sinkMS: r.speedMS * Math.sin(r.gammaRad),
      glideRatio: r.glideRatio,
      brakeSlackMM: brakeSlackUnderBar(riser, bar).extraBrakeTravelMM,
    });
  }

  const trim = rows[0];
  const valid = rows.filter((r) => r.inRange);
  const top = rows[rows.length - 1];
  // Report the fastest point the lift model actually supports alongside the
  // end of the bar, so an extrapolated figure cannot be mistaken for a
  // predicted top speed.
  const topValid = valid.length ? valid[valid.length - 1] : trim;
  const best = (valid.length ? valid : rows)
    .reduce((a, r) => (r.glideRatio > a.glideRatio ? r : a), (valid[0] ?? rows[0]));
  const minSink = (valid.length ? valid : rows)
    .reduce((a, r) => (r.sinkMS < a.sinkMS ? r : a), (valid[0] ?? rows[0]));

  return {
    rows,
    validRows: valid.length,
    fullyValid: valid.length === rows.length,
    topSpeedTrustworthy: top.inRange,
    topValidSpeedKMH: topValid.speedKMH,
    czAtFullBar: top.cz,
    trimSpeedKMH: trim.speedKMH,
    topSpeedKMH: top.speedKMH,
    speedRangeKMH: top.speedKMH - trim.speedKMH,
    alphaRangeDeg: trim.alphaDeg - top.alphaDeg,
    bestGlide: best,
    minSink,
    brakeSlackAtFullBarMM: top.brakeSlackMM,
  };
}

/**
 * Speedway travel needed for a target speed increase.
 *
 * Solving the polar backwards: how much travel does a wing need to reach a
 * quoted top speed? Manufacturers publish trim and top speed far more often
 * than they publish travel, so this is usually the direction with data.
 */
export function travelForSpeedRange({
  riser, base, chordM, czAt, cmAt = null,
  targetTopKMH, maxTravelMM = 400,
}) {
  let lo = 0;
  let hi = maxTravelMM;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const rs = { ...riser, travelMM: mid };
    const p = acceleratedPolar({ riser: rs, base, chordM, czAt, cmAt, steps: 2 });
    if (p.topSpeedKMH < targetTopKMH) lo = mid; else hi = mid;
  }
  return {
    travelMM: (lo + hi) / 2,
    alphaChangeDeg: -alphaChange({ ...riser, travelMM: (lo + hi) / 2 }, 1, chordM),
  };
}

/**
 * Riser hardware does not scale — it steps.
 *
 * PHI's ALLEGRO light runs 570 mm risers with 150 mm of travel on its two
 * smallest sizes and 600/180 on the other four, across a family whose spans
 * scale smoothly by 18%. Hardware comes in discrete sizes, so a scaling law
 * is the wrong shape for it entirely; what is needed is a table.
 */
export const RISER_HARDWARE = {
  'PHI ALLEGRO light': [
    { sizes: ['XS', 'S'], lengthMM: 570, travelMM: 150 },
    { sizes: ['M', 'ML', 'L', 'XL'], lengthMM: 600, travelMM: 180 },
  ],
};

/** Look up hardware for a size, or fall back to the nearest step. */
export function hardwareForSize(table, size) {
  for (const step of table) if (step.sizes.includes(size)) return step;
  return table[table.length - 1];
}

/* --------------------------------------------------- lift from the wing -- */

/**
 * Derive the lift curve from the wing itself.
 *
 * `acceleratedPolar` takes `czAt` as an input, and every use of it so far has
 * handed it a straight line fitted by eye around the trim point. That is the
 * last hand-fed quantity in the flight model, and it is the one the answer is
 * most sensitive to: speed goes as 1/sqrt(Cz).
 *
 * Everything needed to replace it already exists. `estimateSectionPolar`
 * gives the section's lift curve and where it stalls, `liftingLine` corrects
 * it for finite span and non-uniform loading, and `wingPolar` runs both while
 * iterating speed and Reynolds number to consistency. This wires them to the
 * speed system.
 *
 * The second benefit matters as much as the first. The hand-fed version needed
 * a hand-set `czRange` to stop it extrapolating into nonsense — a pair of
 * magic numbers chosen from experience. A derived curve knows where it stalls
 * and where it was evaluated, so the validity range comes out of the same
 * calculation rather than being asserted alongside it.
 */
export function liftModelFromWing({
  planform, airfoil, atm, mass, area = null,
  alphaRange = [-6, 16], step = 0.5,
  cxLines = 0.010, cxPilot = 0.015, twistAt = null, N = 24,
  minFlyingCz = 0.35,
}) {
  const polar = wingPolar({
    planform, airfoil, atm, mass, area, twistAt,
    cxLines, cxPilot, alphaRange, step, N,
  });

  const usable = polar.points.filter((p) => !p.stalled && p.CL > 0.05);
  if (usable.length < 2) throw new Error('Wing polar produced no usable points.');

  const alphas = usable.map((p) => p.alphaDeg);
  const cls = usable.map((p) => p.CL);
  const ta = thinAirfoil(airfoil);

  const czAt = (aDeg) => {
    if (aDeg <= alphas[0]) {
      // Extend on the section's own slope rather than clamping: a clamp would
      // silently flatten the curve where the speed system spends most of its
      // range, and a flat curve reads as a wing that cannot be accelerated.
      const slope = (cls[1] - cls[0]) / (alphas[1] - alphas[0]);
      return cls[0] + slope * (aDeg - alphas[0]);
    }
    if (aDeg >= alphas[alphas.length - 1]) return cls[cls.length - 1];
    for (let i = 1; i < alphas.length; i++) {
      if (alphas[i] >= aDeg) {
        const f = (aDeg - alphas[i - 1]) / (alphas[i] - alphas[i - 1]);
        return cls[i - 1] + f * (cls[i] - cls[i - 1]);
      }
    }
    return cls[cls.length - 1];
  };

  // The upper bound of the usable range is aerodynamic: where the section
  // stalls. The lower bound is not.
  //
  // A rigid wing can fly at Cz 0.06 — the polar says so, and the arithmetic
  // is right. A paraglider cannot. It is a pressurised fabric structure held
  // open by the air entering its intakes, and the angle of attack that
  // produces a very low lift coefficient is at or below the point where the
  // leading edge stops being pressurised and the wing folds. That is the
  // frontal-collapse boundary, and it is structural rather than aerodynamic,
  // so nothing in the section polar knows about it.
  //
  // Left to the polar alone the derived range came out as [0.064, 1.627] and
  // the accelerated polar duly ran to 87 km/h on a wing that does 58. The
  // floor has to be stated separately because it comes from somewhere else.
  const polarMin = Math.min(...cls);
  const czFloor = Math.max(polarMin, minFlyingCz);

  return {
    source: polar.source,
    czAt,
    cmAt: () => ta.cm0,
    czRange: [czFloor, Math.max(...cls)],
    czFloorFrom: czFloor > polarMin ? 'collapse limit' : 'polar',
    minFlyingCz,
    alphaRange: [alphas[0], alphas[alphas.length - 1]],
    alphaL0Deg: polar.points.length ? ta.alphaL0Deg : null,
    cm0: ta.cm0,
    bestGlide: polar.bestGlide,
    minSink: polar.minSink,
    aspectRatio: polar.aspectRatio,
    area: polar.area,
    polar,
  };
}

/**
 * The accelerated polar, driven by a lift model derived from the wing.
 * A thin wrapper, but it is the one that removes the last free hand from the
 * chain: geometry in, speed range out.
 */
export function acceleratedPolarFromWing({ riser, base, chordM, liftModel, steps = 11 }) {
  return acceleratedPolar({
    riser,
    base: { ...base, cz: liftModel.czAt(base.alphaDeg) },
    chordM,
    czAt: liftModel.czAt,
    cmAt: liftModel.cmAt,
    czRange: liftModel.czRange,
    steps,
  });
}

/**
 * Back-solve the collapse floor from a published top speed.
 *
 * The floor is the dominant uncertainty in a predicted top speed, and it is
 * the one quantity here that cannot be derived: it is where a pressurised
 * fabric structure stops holding its shape, which depends on intake design,
 * internal pressure and rib support, none of which this project models.
 *
 * What can be done is to run the inference the other way. A manufacturer's
 * published top speed, with the wing's own lift curve, implies the Cz the
 * wing is still flying at — and that is a number a designer can compare
 * against other wings and against their own prototype.
 *
 * Reported alongside the sensitivity, because a prediction whose answer is
 * governed by an assumed threshold should carry how hard it leans on it.
 */
export function collapseFloorForTopSpeed({
  riser, base, chordM, liftModel, targetTopKMH, steps = 41,
}) {
  const full = acceleratedPolar({
    riser, base: { ...base, cz: liftModel.czAt(base.alphaDeg) }, chordM,
    czAt: liftModel.czAt, cmAt: liftModel.cmAt,
    czRange: [-Infinity, Infinity], steps,
  });

  // Walk out along the bar to the point that reaches the target speed.
  let hit = null;
  for (const r of full.rows) {
    if (r.speedKMH >= targetTopKMH) { hit = r; break; }
  }
  if (!hit) {
    return { reachable: false, maxSpeedKMH: full.rows[full.rows.length - 1].speedKMH };
  }

  // Sensitivity: how much top speed moves for a 0.05 change in the floor.
  const speedAt = (floor) => {
    const rows = full.rows.filter((r) => r.cz >= floor);
    return rows.length ? rows[rows.length - 1].speedKMH : full.rows[0].speedKMH;
  };
  const sensitivity = Math.abs(speedAt(hit.cz - 0.025) - speedAt(hit.cz + 0.025));

  return {
    reachable: true,
    impliedCz: hit.cz,
    barFraction: hit.bar,
    alphaDeg: hit.alphaDeg,
    speedKMH: hit.speedKMH,
    // km/h of top speed per 0.05 of assumed floor.
    sensitivityKMHPer005: sensitivity,
    assumedFloor: liftModel.minFlyingCz,
    verdict: hit.cz < liftModel.minFlyingCz
      ? 'published speed implies a lower collapse floor than assumed'
      : 'published speed is consistent with the assumed floor',
  };
}

/* -------------------------------------------------------------- trimmers -- */

/**
 * Trimmers.
 *
 * A speed system shortens the **front** risers. A trimmer lengthens the
 * **rear** ones. Both tip the wing nose-down and both trade angle of attack
 * for speed, but they are not the same control and the difference matters.
 *
 *   - A speedbar is held. Release the bar and the wing returns to trim.
 *   - A trimmer is set. It stays where it is put, hands free, which is why
 *     paramotor and tandem wings carry them and most solo free-flight wings
 *     do not.
 *
 * ---------------------------------------------------------------------------
 * How they combine
 * ---------------------------------------------------------------------------
 * Both act on the same lever — the chordwise distance between the front and
 * rear anchors — and they act on opposite ends of it. Shortening the front by
 * dA and lengthening the rear by dT rotate the wing the same way, so the two
 * add in the numerator:
 *
 *     delta alpha = atan( (dA + dT) / ((xRear - xFront) * chord) )
 *
 * They are therefore additive in the *shortening*, not in the resulting
 * angle: two effects that each give 4 degrees alone do not give 8 together,
 * because the arctangent is not linear. On a wing with enough of both, that
 * difference is a degree or more, and it is in the conservative direction.
 *
 * ---------------------------------------------------------------------------
 * Why full bar plus full trim is worth checking
 * ---------------------------------------------------------------------------
 * The two controls are independent and a pilot can apply both. The combined
 * angle of attack can fall below the collapse floor when neither alone would,
 * which is the case a designer needs to see rather than discover.
 */

export const DEFAULT_TRIMMER = {
  // How much the rear riser can lengthen, closed to fully open.
  travelMM: 90,
  // Which riser the trimmer acts on. On a three-riser wing it is the rear.
  actsOn: null,
  fitted: true,
};

/** Riser lengths at a given bar and trimmer setting. */
export function riserLengthsWithTrim(rs, bar = 0, trim = 0, trimmer = {}) {
  const T = { ...DEFAULT_TRIMMER, ...trimmer };
  const base = riserLengths(rs, bar);
  if (!T.fitted) return base;
  const rear = T.actsOn || rs.rows[rs.rows.length - 1];
  const t = Math.max(0, Math.min(1, trim));
  return { ...base, [rear]: base[rear] + t * T.travelMM };
}

/**
 * Angle-of-attack change from bar and trimmer together.
 *
 * Returns the combined figure and each contribution alone, because the
 * difference between their sum and the combination is the point.
 */
export function alphaChangeWithTrim(rs, bar, trim, chordM, trimmer = {}) {
  const T = { ...DEFAULT_TRIMMER, ...trimmer };
  const front = rs.rows[0];
  const rear = T.actsOn || rs.rows[rs.rows.length - 1];
  const lever = (rs.anchors[rear] - rs.anchors[front]) * chordM;
  if (lever <= 0) {
    return { combinedDeg: 0, barOnlyDeg: 0, trimOnlyDeg: 0, sumOfPartsDeg: 0, lever };
  }

  const b = Math.max(0, Math.min(1, bar));
  const t = Math.max(0, Math.min(1, trim));
  const dFront = b * rs.travelMM * (rs.share[front] ?? 0);
  const dRear = b * rs.travelMM * (rs.share[rear] ?? 0);
  const dTrim = T.fitted ? t * T.travelMM : 0;

  const angle = (mm) => -deg(Math.atan((mm / 1000) / lever));
  const combined = angle((dFront - dRear) + dTrim);
  const barOnly = angle(dFront - dRear);
  const trimOnly = angle(dTrim);

  return {
    combinedDeg: combined,
    barOnlyDeg: barOnly,
    trimOnlyDeg: trimOnly,
    // What adding the two angles would have given. Not the same thing.
    sumOfPartsDeg: barOnly + trimOnly,
    nonLinearityDeg: combined - (barOnly + trimOnly),
    shorteningMM: (dFront - dRear) + dTrim,
    lever,
  };
}

/**
 * The flight envelope a trimmer opens up, and where it stops being flyable.
 *
 * Sweeps both controls and reports which combinations stay above the collapse
 * floor. A pilot can apply both at once; the combination can fall below the
 * floor when neither alone does, and that is worth seeing on a chart rather
 * than finding in the air.
 */
export function trimEnvelope({
  riser, chordM, liftModel, trimAlphaDeg = 6, trimmer = {}, steps = 5,
}) {
  const rows = [];
  let flyable = 0;
  let total = 0;

  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const bar = i / (steps - 1);
      const trim = j / (steps - 1);
      const d = alphaChangeWithTrim(riser, bar, trim, chordM, trimmer);
      const alpha = trimAlphaDeg + d.combinedDeg;
      const cz = liftModel ? liftModel.czAt(alpha) : null;
      const inRange = !liftModel || cz >= liftModel.czRange[0];
      total++;
      if (inRange) flyable++;
      rows.push({
        bar, trim, alphaDeg: alpha, cz,
        deltaDeg: d.combinedDeg, flyable: inRange,
      });
    }
  }

  const worst = rows.reduce((m, r) => (r.alphaDeg < m.alphaDeg ? r : m), rows[0]);
  // The case a designer needs: neither control alone leaves the envelope, but
  // the two together do.
  const barAlone = rows.find((r) => r.bar === 1 && r.trim === 0);
  const trimAlone = rows.find((r) => r.bar === 0 && r.trim === 1);
  const both = rows.find((r) => r.bar === 1 && r.trim === 1);

  return {
    rows,
    flyable,
    total,
    worst,
    barAlone,
    trimAlone,
    both,
    combinationIsWorse: !!(both && barAlone && trimAlone
      && barAlone.flyable && trimAlone.flyable && !both.flyable),
  };
}

/* --------------------------------------------- risers as webbing (PMA) -- */

/**
 * The riser, properly.
 *
 * This project called the deepest level of the line cascade "riser lines" for
 * a long time, and that was wrong. The PMA standard is explicit:
 *
 *   **Riser** — textile element between the main lines and the suspension
 *   point on the harness, via a connecting element.
 *
 *   **Main lines** — lines which are attached directly to the riser
 *   connectors.
 *
 * So a riser is *webbing*, not a line. It runs from the pilot's karabiner up
 * to a maillon, and the line cascade begins above that maillon. Ozone label
 * their main lines `AR1` — A-Riser-1, the line that meets the A riser — which
 * is a label, not a claim that the line is a riser.
 *
 * ---------------------------------------------------------------------------
 * Why it matters beyond naming
 * ---------------------------------------------------------------------------
 * **Total line length** in the PMA sense is measured from the sail down to
 * the inside of the riser loop at the harness, so it is lines *plus* risers:
 *
 *     M = L + R
 *
 * Manufacturers' length sheets differ on whether R is included, and the
 * project has already tripped over this: the riser length was recovered from
 * Ozone's totals by solving for the one quantity every branch shares, and PHI
 * quotes a "line length" whose fixed part turned out to be roughly its riser.
 * A total that does not say which convention it uses cannot be compared with
 * a manual.
 *
 * **Risers differ by size.** PHI runs 570 mm on its two smallest sizes and
 * 600 mm on the rest; Skywalk 520 mm and 540 mm. They step rather than scale,
 * which is why the affine line-length law had an intercept.
 */

/**
 * Build the riser set as webbing.
 *
 * @param {object} o
 * @param {number} o.lengthMM       trim length, karabiner to maillon
 * @param {string[]} o.rows         which rows meet which riser
 * @param {number} o.webbingWidthMM
 * @param {number} o.webbingGsm     areal weight of the webbing
 */
export function buildRiserWebbing({
  lengthMM = 500,
  rows = ['A', 'B', 'C'],
  webbingWidthMM = 20,
  webbingGsm = 0.220,
  speedSystem = true,
  travelMM = 0,
  trimmerTravelMM = 0,
  maillonsPerSide = null,
} = {}) {
  const sides = 2;
  const perSide = rows.length;

  // The speed system needs its own webbing: a length from the karabiner up
  // through the pulleys and back, on the risers it acts upon.
  const speedWebbingMM = speedSystem ? lengthMM * 1.6 : 0;

  const strapMM = perSide * lengthMM + speedWebbingMM;
  const areaM2 = (strapMM / 1000) * (webbingWidthMM / 1000) * sides;

  return {
    lengthMM,
    rows,
    ridersPerSide: perSide,
    maillons: (maillonsPerSide ?? perSide) * sides,
    strapMetres: (strapMM / 1000) * sides,
    webbingAreaM2: areaM2,
    // Webbing only. Maillons, pulleys and handles are hardware and counted
    // as such rather than smeared into a mass per metre.
    webbingMassKg: areaM2 * webbingGsm,
    speedSystem,
    travelMM,
    trimmerTravelMM,
    // Length at full bar and full trim, which is what a length sheet measured
    // in the accelerated position would show.
    acceleratedLengthMM: lengthMM - travelMM,
    trimmedLengthMM: lengthMM + trimmerTravelMM,
  };
}

/**
 * Total line length in the PMA sense: sail to the inside of the riser loop.
 *
 * `M = L + R`. Reported with the convention stated, because a bare total is
 * ambiguous — the same wing measures 6.9 m or 7.4 m depending on whether the
 * riser is in it, and both numbers appear in manufacturers' sheets.
 */
export function totalLineLength({
  lineLengthMM, riser = null, includeRisers = true, trimmerPosition = 'closed',
}) {
  const riserMM = riser
    ? (trimmerPosition === 'open' ? riser.trimmedLengthMM : riser.lengthMM)
    : 0;
  return {
    lineLengthMM,
    riserLengthMM: riserMM,
    totalMM: lineLengthMM + (includeRisers ? riserMM : 0),
    includesRisers: includeRisers,
    // PMA note: with trimmers, the reference position for the measurement is
    // whatever the manufacturer specifies, so it has to travel with the
    // number rather than be assumed closed.
    trimmerPosition: riser && riser.trimmerTravelMM ? trimmerPosition : 'none',
    convention: includeRisers
      ? 'PMA: sail to the inside of the riser loop, risers included'
      : 'lines only, excluding risers',
  };
}

/* ------------------------------------------------- the riser as webbing -- */

/**
 * The riser, properly.
 *
 * This project called the deepest cascade level "riser" for a long time, and
 * that was wrong. The PMA standard is explicit:
 *
 *   **Riser** — textile element between the main lines and the suspension
 *   point on the harness, via a connecting element.
 *
 *   **Main lines** — lines which are attached directly to the riser
 *   connectors.
 *
 * So a riser is a short length of **webbing**, not a line. The line cascade
 * ends at the maillons; the riser runs from those maillons down to the
 * karabiner. The two are different materials, made differently, measured
 * differently and replaced separately.
 *
 * ---------------------------------------------------------------------------
 * Why it matters beyond naming
 * ---------------------------------------------------------------------------
 * **Total line length includes the riser.** PMA Figure 4 defines it as the
 * distance from the sail at the attachment point to the inside of the riser
 * loop at the harness — M = L + R. That is why some manufacturers' length
 * sheets include the risers and some do not, and why comparing two sheets
 * without knowing which convention each used produces a constant offset of a
 * few hundred millimetres across every line.
 *
 * **Risers differ by size.** They are webbing cut to a length, not geometry
 * derived from the wing, so they step between sizes rather than scaling with
 * it — 520 mm on the two small SAGEs, 540 mm on the three large ones.
 *
 * **Risers are not one length.** A three-riser wing has an A, a B and a C
 * riser, and on the bar they are no longer equal — which is the whole point
 * of a speed system.
 */

/**
 * Riser lengths across a size family.
 *
 * Webbing is cut to a length, so risers step between sizes rather than
 * scaling with the wing. Given the published lengths this reports the steps
 * and how many sizes share each — which is what a maker actually does.
 */
export function riserSteps(sizes) {
  const byLength = new Map();
  for (const s of sizes) {
    if (s.riserMM == null) continue;
    if (!byLength.has(s.riserMM)) byLength.set(s.riserMM, []);
    byLength.get(s.riserMM).push(s.name ?? s.size);
  }
  const steps = [...byLength.entries()]
    .map(([mm, names]) => ({ riserMM: mm, sizes: names }))
    .sort((a, b) => a.riserMM - b.riserMM);
  return {
    steps,
    distinctLengths: steps.length,
    sizesCovered: sizes.filter((s) => s.riserMM != null).length,
    // A family with as many riser lengths as sizes is scaling them, not
    // stepping — worth distinguishing, because it is the unusual case.
    scalesRatherThanSteps: steps.length === sizes.filter((s) => s.riserMM != null).length
      && steps.length > 2,
  };
}
