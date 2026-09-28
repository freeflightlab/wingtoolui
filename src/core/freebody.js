/* freebody.js — does the whole machine balance, as a body in a gravity field?
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * This project checks a great many things about a wing and until now checked
 * nothing about it FLYING. Every part agreed with every other part while the
 * maillon sat under the leading edge, the brakes ran forward to a handle under
 * the nose, and the lines hung the wing at an attitude it could never hold.
 * Each of those was found by a person looking at a picture.
 *
 * A free body diagram is the instrument that finds them without a person.
 * In steady glide a paraglider is a rigid body in equilibrium:
 *
 *   - **weight** acts down through the centre of mass, which is essentially
 *     the pilot: they are twenty times the wing's mass and five metres below
 *     it, so the combined centre of mass sits within a few centimetres of the
 *     harness.
 *   - **lift** acts perpendicular to the flight path, through the centre of
 *     pressure.
 *   - **drag** acts along the flight path.
 *   - **line tension** carries the whole of the pilot's weight up to the
 *     wing, and its resultant must pass through both the centre of mass and
 *     the point the wing hangs from — otherwise the two ends are pulling on
 *     different lines of action and the machine spins up rather than glides.
 *
 * Forces summing to zero is the easy half. The moment is what catches
 * geometry: a hang point in the wrong place gives a residual couple, and the
 * size of that couple says how wrong it is in newton-metres rather than in
 * somebody's impression of a drawing.
 */

/**
 * Check a wing, its lines and a pilot as one body in steady glide.
 *
 * Angles are in the vertical plane containing the flight path. x is
 * chordwise, z is up, and the flight path is inclined below the horizontal by
 * the glide angle.
 */
export function freeBodyCheck({
  wing, linePlan, balance,
  pilotMassKg = 90, wingMassKg = 5, lineMassKg = 0.6,
  gravity = 9.81,
  momentToleranceNm = 5,
}) {
  if (!wing?.ribs?.length) throw new Error('freeBodyCheck needs a wing');
  if (!linePlan?.maillon) throw new Error('freeBodyCheck needs a line plan');
  if (!balance) throw new Error('freeBodyCheck needs a solved balance');

  const totalMassKg = pilotMassKg + wingMassKg + lineMassKg;
  const weightN = totalMassKg * gravity;

  const glideRatio = balance.glideRatio;
  if (!(glideRatio > 0)) {
    return { ok: false, why: 'the balance has no glide ratio to check against' };
  }
  const glideAngleDeg = Math.atan2(1, glideRatio) * (180 / Math.PI);

  // In steady glide the aerodynamic resultant is equal and opposite to
  // weight, so lift and drag follow from the glide angle alone.
  const g = (glideAngleDeg * Math.PI) / 180;
  const liftN = weightN * Math.cos(g);
  const dragN = weightN * Math.sin(g);

  const root = wing.ribs[0];
  const chord = root.chord;
  const xLE = root.lower[0][0];

  // Where things act, as fractions of the root chord.
  const hangFraction = (linePlan.maillon[0] - xLE) / chord;
  const cpFraction = balance.xcpFraction;
  const calageFraction = balance.calageFraction;

  // The pilot hangs below the maillon on the risers; the centre of mass is
  // essentially there.
  const maillon = linePlan.maillon;
  const cmX = maillon[0];

  // Moment about the centre of mass, in the pitching plane.
  //
  // Lift acts at the centre of pressure, a lever arm of (cp - hang) * chord
  // ahead of the line of action of weight. Weight and line tension are
  // colinear through the centre of mass and contribute nothing. What is left
  // is the lift-weight couple and the section's own pitching moment.
  const leverM = (cpFraction - hangFraction) * chord;
  const liftCoupleNm = liftN * leverM;

  // The moment balance is the solver's own, not a second one computed here.
  //
  // My first version took moments about the centre of mass using only lift
  // times its lever plus the section moment, and reported a residual couple
  // of -155 Nm on a wing that balances exactly. It was missing pilot drag
  // (-139 Nm), line drag (-63) and wing weight (+40): an incomplete free body
  // gives a confident wrong answer, which is worse than none.
  //
  // `solveEquilibrium` already sums every term and reports the residual. What
  // is worth checking here is something it cannot: that the GEOMETRY the tool
  // draws is the geometry that balance describes.
  const solverResidualNm = Number.isFinite(balance.momentResidual)
    ? balance.momentResidual : null;
  const sectionMomentNm = Number.isFinite(balance.moments?.aerodynamic)
    ? balance.moments.aerodynamic : null;

  // Does the wing hang where the balance says it balances?
  const hangErrorFraction = Number.isFinite(calageFraction)
    ? hangFraction - calageFraction : null;
  const residualNm = solverResidualNm;

  // The line resultant: every line pulls the wing towards the maillon, so the
  // resultant direction is the load-weighted mean of those pulls. It has to
  // come out close to vertical, because it is carrying a weight.
  const pulls = [];
  for (const l of linePlan.lines) {
    if (!l.from || !l.to) continue;
    // Take the anchor end as the wing end: the deeper point is towards the
    // pilot.
    const [a, b] = l.from[2] > l.to[2] ? [l.from, l.to] : [l.to, l.from];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const n = Math.hypot(d[0], d[1], d[2]);
    if (!(n > 0)) continue;
    pulls.push([d[0] / n, d[1] / n, d[2] / n]);
  }
  // A line that lies flat cannot carry the load it is there for.
  //
  // Out at the tip the arc has brought the surface down to about the level of
  // its own cascade junction, so an upper line runs nearly spanwise: 441 mm
  // long with 14 mm of drop on the test wing. It pulls the anchor sideways
  // and reacts none of the lift holding that part of the wing up.
  const nearHorizontal = [];
  for (const l of linePlan.lines) {
    if (!l.from || !l.to) continue;
    const dropM = Math.abs(l.to[2] - l.from[2]);
    const lengthM = Math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1],
      l.to[2] - l.from[2]);
    if (!(lengthM > 0.05)) continue;
    const fromVertical = Math.acos(Math.min(1, dropM / lengthM)) * (180 / Math.PI);
    if (fromVertical > 75) {
      nearHorizontal.push({ row: l.row, level: l.level, ribIndex: l.ribIndex,
        dropM, lengthM, fromVertical });
    }
  }
  nearHorizontal.sort((a, b) => b.fromVertical - a.fromVertical);

  const mean = pulls.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]],
    [0, 0, 0]).map((v) => v / Math.max(1, pulls.length));
  const meanLen = Math.hypot(mean[0], mean[1], mean[2]);
  const pullFromVerticalDeg = meanLen > 0
    ? Math.acos(Math.min(1, Math.abs(mean[2]) / meanLen)) * (180 / Math.PI)
    : 90;

  // The angle the wing sits at relative to the flight path. The chord line of
  // the root rib against the horizontal, plus the glide angle, is the angle of
  // incidence the wing actually flies at.
  const te = root.lower[root.lower.length - 1];
  const le = root.lower[0];
  const chordAngleDeg = Math.atan2(-(te[2] - le[2]),
    Math.hypot(te[0] - le[0], te[1] - le[1])) * (180 / Math.PI);
  const incidenceDeg = chordAngleDeg + glideAngleDeg;

  const problems = [];
  if (residualNm != null && Math.abs(residualNm) > momentToleranceNm) {
    problems.push(`the balance does not close: ${residualNm.toFixed(1)} Nm `
      + 'of residual couple');
  }
  // The geometry must agree with the balance it was solved from. This is the
  // check that catches a maillon in the wrong place, which is invisible to
  // the solver — it balances whatever point it is given.
  if (hangErrorFraction != null && Math.abs(hangErrorFraction) > 0.03) {
    problems.push(`the wing is drawn hanging from `
      + `${(hangFraction * 100).toFixed(1)}% of chord but the balance solves `
      + `at ${(calageFraction * 100).toFixed(1)}%`);
  }
  // The MEAN is not the test. A tip five metres out on six-metre lines is
  // genuinely at 37 degrees, so an average near 35 is real geometry rather
  // than a fault. What cannot be right is an individual line lying flat.
  if (nearHorizontal.length) {
    const worst = nearHorizontal[0];
    problems.push(`${nearHorizontal.length} lines lie almost flat — `
      + `${worst.row} at rib ${worst.ribIndex} drops `
      + `${(worst.dropM * 1000).toFixed(0)} mm over `
      + `${(worst.lengthM * 1000).toFixed(0)} mm, so it pulls sideways and `
      + 'reacts no lift');
  }
  if (hangFraction < 0.15 || hangFraction > 0.65) {
    problems.push(`the wing hangs from ${(hangFraction * 100).toFixed(1)}% of `
      + 'chord, which is outside anything a wing flies at');
  }
  if (!(incidenceDeg > -2 && incidenceDeg < 18)) {
    problems.push(`an angle of incidence of ${incidenceDeg.toFixed(1)} degrees`);
  }
  if (!(glideAngleDeg > 2 && glideAngleDeg < 20)) {
    problems.push(`a glide angle of ${glideAngleDeg.toFixed(1)} degrees`);
  }

  return {
    ok: problems.length === 0,
    problems,
    totalMassKg,
    weightN,
    liftN,
    dragN,
    glideRatio,
    glideAngleDeg,
    incidenceDeg,
    chordAngleDeg,
    hangFraction,
    cpFraction,
    calageFraction,
    leverM,
    liftCoupleNm,
    sectionMomentNm,
    residualNm,
    solverResidualNm,
    hangErrorFraction,
    pullFromVerticalDeg,
    lineCount: pulls.length,
    nearHorizontal,
    note: problems.length === 0
      ? `balances: ${weightN.toFixed(0)} N carried, glide `
        + `${glideAngleDeg.toFixed(1)} deg, incidence `
        + `${incidenceDeg.toFixed(1)} deg, lines `
        + `${pullFromVerticalDeg.toFixed(1)} deg from vertical`
      : `${problems.length} problem(s): ${problems[0]}`,
  };
}
