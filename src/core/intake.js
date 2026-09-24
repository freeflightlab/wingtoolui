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
 * So the opening must **contain the stagnation point**, and the stagnation
 * point *moves*: at low angle of attack (accelerated flight) it sits further
 * back along the lower surface, and at high angle of attack it climbs toward
 * the nose and over onto the upper surface.
 *
 * That is why intakes are cut back along the lower surface rather than being
 * a hole at the nose. The opening has to span the whole range of stagnation
 * positions the wing will fly through, and the width of that range is set by
 * the speed system: a wing with a lot of bar has a lot of stagnation travel
 * to cover.
 *
 * A wing whose intake does not cover its own accelerated stagnation point
 * will lose pressure exactly when it can least afford to — at speed, in
 * turbulence, with the bar on.
 */

/**
 * Where the flow stagnates on a section, as a chord fraction.
 *
 * Signed: negative means the lower surface, positive the upper, both measured
 * from the leading edge. Thin-aerofoil theory puts the stagnation point where
 * the total circulation-induced velocity cancels the free stream, which for
 * small angles is well approximated by
 *
 *     s = -(alpha - alpha_L0) / (2 * pi) * chord    (radians)
 *
 * — proportional to the angle above zero lift, and on the lower surface for
 * positive lift. It is a first-order result and says so.
 */
export function stagnationPoint(airfoil, alphaDeg, { thinAirfoilFn } = {}) {
  // The section, evaluated once — its zero-lift angle does not depend on the
  // angle of attack, and passing one here was the bug that this whole family
  // of call sites shared.
  const section = thinAirfoilFn(airfoil);
  const effective = (alphaDeg - section.alphaL0Deg) * (Math.PI / 180);
  // Negative: below the nose, on the lower surface.
  const s = -effective / (2 * Math.PI);
  return {
    chordFraction: s,
    surface: s < 0 ? 'lower' : 'upper',
    distanceFromNose: Math.abs(s),
    effectiveAlphaDeg: (alphaDeg - section.alphaL0Deg),
    alphaL0Deg: section.alphaL0Deg,
    firstOrder: true,
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
}) {
  const S = { ...DEFAULT_INTAKE, ...spec };
  const travel = stagnationTravel(airfoil, {
    alphaMinDeg: alphaAcceleratedDeg, alphaMaxDeg: alphaSlowDeg, thinAirfoilFn,
  });

  // The opening spans from `upperCutM` above the nose to `lowerCutM` below it,
  // in the same signed chord-fraction convention as the stagnation point.
  const opening = [-S.lowerCutM, S.upperCutM];

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
      openingHeightM: closed ? 0 : (S.lowerCutM + S.upperCutM) * chord,
      areaM2: closed ? 0 : (S.lowerCutM + S.upperCutM) * chord * spacing,
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
        ? 'the opening does not reach the accelerated stagnation point: this '
          + 'wing will lose pressure at speed, which is when it can least '
          + 'afford to'
        : 'the opening does not reach the slow-flight stagnation point: this '
          + 'wing will lose pressure when flown deep, near the stall'),
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
