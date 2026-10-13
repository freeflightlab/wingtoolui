/* intake.js — the cell opening.
 *
 * A paraglider is a ram-air wing: it holds its shape because air enters the
 * leading edge and pressurises the cells. Everything else in this project —
 * the section, the ribs, the cross-ports, the line plan — assumes that has
 * happened. Nothing has modelled the opening that makes it happen.
 *
 * ---------------------------------------------------------------------------
 * Why the intake sits where it does
 * ---------------------------------------------------------------------------
 * Air enters at total pressure only where the flow stagnates. Away from the
 * stagnation point the local pressure is lower, and an opening there feeds the
 * cell at less than total pressure — or, on the suction side, empties it.
 *
 * The stagnation point *moves*. At a high angle of attack — slow flight — it
 * runs aft along the lower surface; as the angle comes down — trim, then the
 * speed bar — it runs forward to the nose, and below the section's ideal
 * angle of attack it goes over onto the upper surface.
 *
 * That is why intakes are cut back along the lower surface rather than being
 * a hole at the nose: that is where the stagnation point is across the slow
 * half of the envelope, and the pressure just behind it stays high. It is
 * also why a wing loses internal pressure on the bar: the stagnation point
 * runs forward past the opening's upper lip, and the opening is left in
 * accelerating flow.
 *
 * This file had that the wrong way round in its own description — "at low
 * angle of attack it sits further back along the lower surface" — while the
 * formula below it moved the right way, by the wrong amount.
 */

import { rad, deg } from './num.js';
import { camberSeries } from './pressure.js';

/**
 * The vortex sheet at a chord station, x = (1 - cos theta) / 2.
 *
 * Thin-aerofoil theory writes it gamma / 2V = A0 cot(theta/2) + sum An
 * sin(n theta), with the flow V (1 - g) along the lower surface and V (1 + g)
 * along the upper. That is the small-angle form of the one case with an
 * exact answer: on a flat plate at incidence a the surface velocities are
 * V cos a (1 -+ tan a cot(theta/2)). The leading term is kept in that exact
 * form — tan A0, and the cos A0 outside — so a symmetric section stagnates
 * at sin^2(alpha) of chord, as potential flow says it does; the camber terms
 * are thin-aerofoil theory's, to first order.
 */
function sheet(A0, An, theta) {
  let g = Math.tan(A0) / Math.tan(theta / 2);
  An.forEach((a, k) => { g += a * Math.sin((k + 1) * theta); });
  return g;
}

/**
 * Where the flow stagnates on a section, as a chord fraction.
 *
 * Signed: negative means the lower surface, positive the upper, both measured
 * from the leading edge.
 *
 * The flow along the lower surface goes as (1 - g), with g the vortex sheet
 * above, so it stops where g = 1; along the upper it goes as (1 + g) and
 * stops where g = -1. Near the nose the cotangent dominates, giving
 * theta/2 = A0 and
 *
 *     x / c = sin^2(A0)
 *
 * — QUADRATIC in A0, the angle above the section's IDEAL angle of attack
 * (where the flow meets the nose head-on), not its zero-lift angle. The
 * series terms are kept, and the root found, rather than dropped.
 *
 * This was `(alpha - alpha_L0) / 2 pi`: linear, and measured from zero lift.
 * On a NACA 4415 that put the stagnation point at 1.7% of chord at 2 degrees,
 * where the theory it cited puts it at 0.07% — and it could never reach the
 * upper surface in flight at all, since zero lift is four degrees below
 * anything a wing flies at.
 *
 * It is a first-order result — no thickness, no nose radius — and says so.
 */
export function stagnationPoint(airfoil, alphaDeg, { thinAirfoilFn } = {}) {
  const { a0Base, An } = camberSeries(airfoil);
  const A0 = rad(alphaDeg) + a0Base;
  // The zero-lift angle is still reported: it is what the old formula used.
  const section = thinAirfoilFn ? thinAirfoilFn(airfoil) : null;

  let s = 0;
  if (Math.abs(A0) > 1e-12) {
    const target = A0 > 0 ? 1 : -1;
    // g - target runs from +-infinity at the nose to -target at the trailing
    // edge, so it crosses once on the way; the crossing nearest the nose is
    // the stagnation point.
    const f = (th) => sheet(A0, An, th) - target;
    let lo = 1e-9;
    let hi = Math.PI;
    // Walk out from the nose to the first sign change, then bisect.
    const steps = 2000;
    let prev = lo;
    for (let i = 1; i <= steps; i++) {
      const th = (Math.PI * i) / steps;
      if (Math.sign(f(th)) !== Math.sign(f(prev))) { lo = prev; hi = th; break; }
      prev = th;
    }
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid;
    }
    const theta = (lo + hi) / 2;
    const x = (1 - Math.cos(theta)) / 2;
    s = A0 > 0 ? -x : x;
  }
  return {
    chordFraction: s,
    surface: s < 0 ? 'lower' : (s > 0 ? 'upper' : 'nose'),
    distanceFromNose: Math.abs(s),
    // Angle above the ideal angle of attack, which is what moves it.
    a0Deg: deg(A0),
    alphaIdealDeg: deg(-a0Base),
    effectiveAlphaDeg: section ? (alphaDeg - section.alphaL0Deg) : null,
    alphaL0Deg: section ? section.alphaL0Deg : null,
    firstOrder: true,
  };
}

/**
 * Pressure coefficient on the surface at a signed chord station.
 *
 * 1 at the stagnation point and falling away from it: 1 - (1 - g)^2 on the
 * lower surface, 1 - (1 + g)^2 on the upper. Thin-aerofoil again, so the
 * thickness is not in it.
 */
export function surfaceCp(airfoil, alphaDeg, signedChordFraction) {
  const { a0Base, An } = camberSeries(airfoil);
  const A0 = rad(alphaDeg) + a0Base;
  const x = Math.min(1, Math.abs(signedChordFraction));
  if (!(x > 0)) return A0 === 0 ? 1 : -Infinity;
  const theta = Math.acos(1 - 2 * x);
  const g = sheet(A0, An, theta);
  const v = Math.cos(A0) * (signedChordFraction < 0 ? 1 - g : 1 + g);
  return 1 - v * v;
}

/**
 * The best pressure an opening can be fed at, as a pressure coefficient.
 *
 * `opening` is `[from, to]` in the signed convention. If it contains the
 * stagnation point the answer is 1: total pressure. If not, it is the
 * pressure at the lip nearest the stagnation point, which is the highest
 * anywhere on the opening — the cell cannot hold more than that.
 */
export function intakeFeed(airfoil, alphaDeg, opening, { thinAirfoilFn } = {}) {
  const [lo, hi] = [Math.min(...opening), Math.max(...opening)];
  const st = stagnationPoint(airfoil, alphaDeg, { thinAirfoilFn });
  const sp = st.chordFraction;
  const inside = sp >= lo && sp <= hi;
  const lip = sp < lo ? lo : hi;
  return {
    alphaDeg,
    stagnation: sp,
    inside,
    // Which lip the stagnation point has passed, when it is outside.
    passed: inside ? null : (sp > hi ? 'upper lip' : 'lower lip'),
    feedCp: inside ? 1 : Math.max(0, surfaceCp(airfoil, alphaDeg, lip)),
  };
}

/**
 * The stagnation travel a wing must cover, across its own speed range.
 */
export function stagnationTravel(airfoil, { alphaMinDeg, alphaMaxDeg, thinAirfoilFn }) {
  const at = (a) => stagnationPoint(airfoil, a, { thinAirfoilFn }).chordFraction;
  const fast = at(alphaMinDeg);
  const slow = at(alphaMaxDeg);
  const lo = Math.min(fast, slow);
  const hi = Math.max(fast, slow);
  return {
    atMinAlpha: fast,
    atMaxAlpha: slow,
    range: [lo, hi],
    travelFraction: hi - lo,
    alphaMinDeg,
    alphaMaxDeg,
  };
}

export const DEFAULT_INTAKE = {
  // How far back the opening is cut, as chord fractions from the nose along
  // each surface. Lower is the long one, as on a real wing.
  upperCutM: 0.01,
  lowerCutM: 0.09,
  // Cells left closed at the tip. Closed tips are cleaner and lighter, and
  // they only work if the neighbouring cells can pressurise them through the
  // cross-ports.
  closedTipCells: 2,
};

/**
 * Build the intake for a wing and check it against the flight envelope.
 *
 * The check is the point: it is easy to draw an opening and hard to know it
 * is in the right place. This reports whether the opening contains the
 * stagnation point at both ends of the speed range, and by how much.
 */
export function buildIntake({
  wing, airfoil, alphaTrimDeg = 6, alphaAcceleratedDeg = 2, alphaSlowDeg = 12,
  spec = {}, thinAirfoilFn,
  // The opening itself, `[from, to]` in the signed convention, when it is
  // known — a section's own intake runs from 3% to 6% of chord along the
  // lower surface, which is `[-0.06, -0.03]`. Left out, the two cuts in
  // `spec` describe it.
  opening: given = null,
}) {
  const S = { ...DEFAULT_INTAKE, ...spec };
  const travel = stagnationTravel(airfoil, {
    alphaMinDeg: alphaAcceleratedDeg, alphaMaxDeg: alphaSlowDeg, thinAirfoilFn,
  });

  // The opening spans from `upperCutM` above the nose to `lowerCutM` below it,
  // in the same signed chord-fraction convention as the stagnation point.
  const opening = given
    ? [Math.min(...given), Math.max(...given)]
    : [-S.lowerCutM, S.upperCutM];
  // What the opening is fed at, at each end of the range and at trim.
  const feed = {
    accelerated: intakeFeed(airfoil, alphaAcceleratedDeg, opening, { thinAirfoilFn }),
    trim: intakeFeed(airfoil, alphaTrimDeg, opening, { thinAirfoilFn }),
    slow: intakeFeed(airfoil, alphaSlowDeg, opening, { thinAirfoilFn }),
  };

  const covers = (x) => x >= opening[0] && x <= opening[1];
  const marginAt = (x) => Math.min(x - opening[0], opening[1] - x);

  const cells = [];
  for (let i = 0; i < wing.ribs.length - 1; i++) {
    const closed = i >= wing.ribs.length - 1 - S.closedTipCells;
    const chord = (wing.ribs[i].chord + wing.ribs[i + 1].chord) / 2;
    // `station`, not `y`. Reading a field that does not exist gave every
    // cell a spacing of zero and a total opening area of 0 cm2 — a number so
    // obviously wrong it was caught immediately, which is the only reason the
    // silent `|| 0` did not survive.
    const spacing = Math.abs(wing.ribs[i + 1].station - wing.ribs[i].station);
    if (!Number.isFinite(spacing)) {
      throw new Error('buildIntake: ribs carry no spanwise station');
    }
    cells.push({
      index: i,
      closed,
      chordM: chord,
      // Opening area: the arc between the two cuts, times the cell width.
      openingHeightM: closed ? 0 : (opening[1] - opening[0]) * chord,
      areaM2: closed ? 0 : (opening[1] - opening[0]) * chord * spacing,
    });
  }

  const open = cells.filter((c) => !c.closed);
  return {
    cells,
    openCells: open.length,
    closedCells: cells.length - open.length,
    totalAreaM2: open.reduce((a, c) => a + c.areaM2, 0),
    opening,
    travel,
    feed,
    // Does the opening contain the stagnation point across the envelope?
    coversAccelerated: covers(travel.atMinAlpha),
    coversSlow: covers(travel.atMaxAlpha),
    coversEnvelope: covers(travel.atMinAlpha) && covers(travel.atMaxAlpha),
    marginAccelerated: marginAt(travel.atMinAlpha),
    marginSlow: marginAt(travel.atMaxAlpha),
    // The failure that matters: losing pressure at speed, with the bar on.
    // The note must follow the *envelope*, not just the accelerated end.
    // Written against `coversAccelerated` alone it reported "covers the
    // speed range" for a wing that failed the slow case, which is precisely
    // the kind of reassuring-and-wrong output this project tries not to
    // produce.
    note: covers(travel.atMinAlpha) && covers(travel.atMaxAlpha)
      ? 'the opening contains the stagnation point across the speed range'
      : (!covers(travel.atMinAlpha)
        ? 'the opening does not reach the accelerated stagnation point: at '
          + `speed it is fed at Cp ${feed.accelerated.feedCp.toFixed(2)} rather `
          + 'than at total pressure, which is when a wing can least afford it'
        : 'the opening does not reach the slow-flight stagnation point: flown '
          + `deep, near the stall, it is fed at Cp ${feed.slow.feedCp.toFixed(2)}`),
    spec: S,
  };
}

/**
 * The smallest opening that still covers the envelope, with a margin.
 *
 * Intake area is drag, so the useful question is not "is it big enough" but
 * "how much of it is doing anything".
 */
export function minimumIntake(travel, { marginFraction = 0.01 } = {}) {
  const lower = Math.max(0, -travel.range[0] + marginFraction);
  const upper = Math.max(0, travel.range[1] + marginFraction);
  return {
    lowerCutM: lower,
    upperCutM: upper,
    totalFraction: lower + upper,
    marginFraction,
    note: 'the smallest opening that still contains the stagnation point at '
      + 'both ends of the speed range, plus a margin',
  };
}
