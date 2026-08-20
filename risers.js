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
