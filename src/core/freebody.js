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
  // How far a top line may lie from its rib's own plane.
  maxOffLoadDeg = 60,
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
  // The chord line's own origin and direction, from the rib's placement.
  // The first point of the lower surface is the section's most forward
  // point, which on a cambered section sits ahead of and ABOVE the chord's
  // leading edge: read as the chord it tilted every root 0.26 to 0.44
  // degrees and added that to the angle of attack.
  const frame = root.frame ?? null;
  const xLE = frame ? frame.origin[0] : root.lower[0][0];

  // Where things act, as fractions of the root chord.
  // The pilot hangs under the karabiner, which is under the balance point.
  // Each riser now leans toward its own lines, so no single riser top is the
  // hang point; the karabiner is.
  const hangX = (linePlan.karabiner ?? linePlan.maillon)[0];
  const hangFraction = (hangX - xLE) / chord;
  const cpFraction = balance.xcpFraction;
  const calageFraction = balance.calageFraction;


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

  // Brake and stabilo lines are not part of this. They pull the trailing
  // edge down and hold the tip's shape; in trim they carry no weight. A
  // brake's upper branches run along the trailing edge, nearly flat by
  // design, and counting them flagged the Swoop2's own brake cascade — as
  // its designer drew it — as lines that "react no lift".
  const carrying = linePlan.lines.filter((l) => !['K', 'S', 'Z'].includes(l.row)
    && l.kind !== 'brake' && !l.brake);

  // The line resultant: every line pulls the wing towards the maillon, so the
  // resultant direction is the load-weighted mean of those pulls. It has to
  // come out close to vertical, because it is carrying a weight.
  const pulls = [];
  for (const l of carrying) {
    if (!l.from || !l.to) continue;
    // Take the anchor end as the wing end: the deeper point is towards the
    // pilot.
    const [a, b] = l.from[2] > l.to[2] ? [l.from, l.to] : [l.to, l.from];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const n = Math.hypot(d[0], d[1], d[2]);
    if (!(n > 0)) continue;
    pulls.push([d[0] / n, d[1] / n, d[2] / n]);
  }
  // A line far from the direction its anchor is pulled cannot hold it.
  //
  // The air pushes on a rib's cloth along that rib's own plane, and toward
  // the tip the plane leans: a tip rib fifty degrees over is pulled up and
  // OUT, and the line that holds it runs fifty degrees from vertical. So a
  // top line is measured against its own rib's plane. A line sixty degrees
  // off it carries half its tension along the load and the other half into
  // the cloth, which is further than any line of the reference plans lies:
  // the Swoop2's own are within 28 degrees, and a cascade generated at the
  // Geo 7's size with its anchor counts within 51.
  //
  // This measured from VERTICAL, and called a line more than 75 degrees from
  // it one that "pulls sideways and reacts none of the lift". On an arched
  // wing that is the ordinary fan of an outboard pair: the same fan as at
  // the centre, turned with the arc. The line it named on the suite's test
  // wing — at the tip, 456 mm long with 48 mm of drop — lies 42 degrees from
  // its rib's plane and carries three quarters of its tension along the
  // load; a line a third of the way out on the same wing lies 46 degrees
  // off, and was never mentioned.
  const offLoad = [];
  for (const l of carrying) {
    if (!l.from || !l.to || l.level !== 'upper') continue;
    const rib = Number.isInteger(l.ribIndex) ? wing.ribs[l.ribIndex] : null;
    const w = rib?.frame?.w;
    if (!w) continue;
    const d = [l.to[0] - l.from[0], l.to[1] - l.from[1], l.to[2] - l.from[2]];
    const lengthM = Math.hypot(d[0], d[1], d[2]);
    const wLen = Math.hypot(w[0], w[1], w[2]);
    if (!(lengthM > 0.05) || !(wLen > 0)) continue;
    const across = Math.abs(d[0] * w[0] + d[1] * w[1] + d[2] * w[2]) / (lengthM * wLen);
    const offLoadDeg = Math.asin(Math.min(1, across)) * (180 / Math.PI);
    if (offLoadDeg > maxOffLoadDeg) {
      const dropM = Math.abs(d[2]);
      offLoad.push({
        name: l.name, row: l.row, level: l.level, ribIndex: l.ribIndex,
        lengthM, dropM, offLoadDeg,
        carriesFraction: Math.sqrt(Math.max(0, 1 - across * across)),
        fromVertical: Math.acos(Math.min(1, dropM / lengthM)) * (180 / Math.PI),
      });
    }
  }
  offLoad.sort((a, b) => b.offLoadDeg - a.offLoadDeg);

  const mean = pulls.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]],
    [0, 0, 0]).map((v) => v / Math.max(1, pulls.length));
  const meanLen = Math.hypot(mean[0], mean[1], mean[2]);
  const pullFromVerticalDeg = meanLen > 0
    ? Math.acos(Math.min(1, Math.abs(mean[2]) / meanLen)) * (180 / Math.PI)
    : 90;

  // The angle the wing flies at, from the GEOMETRY.
  //
  // The balance has already solved the complete moment sum — lift at the
  // centre of pressure, wing, line and pilot drag, the weights and the
  // section's own moment — for where the pilot must hang, and the attitude
  // θ = γ − α that goes with it (positive nose down). If the geometry hangs
  // the pilot somewhere else, the whole machine swings until the weight is
  // back on the same line of action: a pendulum whose length is the hang
  // depth. Its stiffness is about ten times the wing's own pitch stiffness
  // on these wings, so the attitude moves by the hang error over the depth,
  // and the angle of attack by the same amount the other way.
  //
  // This was LEparagliding's construction alone, asin((cp − hang)·c/h): lift
  // through the centre of pressure and nothing else. That is how LEP sets
  // its own angle (the Swoop2's 1.39° and 4.32°, reproduced in
  // leplines.js), but beside a balance that includes drag it disagrees with
  // it: pilot drag six metres down swings the pilot 30 cm behind the lift
  // line, so every wing read 2.7° nose-UP of its own balance and 8° of
  // incidence next to a balance solved at 5.
  const te = root.lower[root.lower.length - 1];
  const le = frame ? frame.origin : root.lower[0];
  const chordDir = frame ? frame.u : [te[0] - le[0], te[1] - le[1], te[2] - le[2]];
  const chordAngleDeg = Math.atan2(-chordDir[2], Math.hypot(chordDir[0], chordDir[1]))
    * (180 / Math.PI);
  const hang = linePlan.karabiner ?? linePlan.maillon;
  const heightM = le[2] - hang[2];
  const thetaBalanceDeg = Number.isFinite(balance.thetaDeg)
    ? balance.thetaDeg : glideAngleDeg - (balance.alphaDeg ?? 0);
  const swingDeg = heightM > 0 && Number.isFinite(hangErrorFraction)
    ? Math.asin(Math.max(-1, Math.min(1, (-hangErrorFraction * chord) / heightM)))
      * (180 / Math.PI)
    : 0;
  const assietteDeg = thetaBalanceDeg + swingDeg;
  const incidenceDeg = glideAngleDeg - assietteDeg + chordAngleDeg;
  // LEparagliding's construction, kept for comparison with its own output:
  // lift alone through the centre of pressure.
  const liftOnlyAssietteDeg = heightM > 0 && Number.isFinite(cpFraction)
    ? Math.asin(Math.max(-1, Math.min(1, ((cpFraction - hangFraction) * chord) / heightM)))
      * (180 / Math.PI)
    : null;

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
  // than a fault. What cannot be right is an individual line lying across
  // the load it is there for.
  if (offLoad.length) {
    const worst = offLoad[0];
    problems.push(`${offLoad.length} top line${offLoad.length > 1 ? 's lie' : ' lies'} `
      + `more than ${maxOffLoadDeg} degrees from the way the anchor is pulled — `
      + `${worst.name ?? worst.row} at rib ${worst.ribIndex} is `
      + `${worst.offLoadDeg.toFixed(0)} degrees off its rib's plane over `
      + `${(worst.lengthM * 1000).toFixed(0)} mm, so it carries `
      + `${(worst.carriesFraction * 100).toFixed(0)}% of its tension and pulls `
      + 'the rest along the cloth');
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
    assietteDeg,
    thetaBalanceDeg,
    swingDeg,
    liftOnlyAssietteDeg,
    heightM,
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
    offLoad,
    maxOffLoadDeg,
    note: problems.length === 0
      ? `balances: ${weightN.toFixed(0)} N carried, glide `
        + `${glideAngleDeg.toFixed(1)} deg, incidence `
        + `${incidenceDeg.toFixed(1)} deg, lines `
        + `${pullFromVerticalDeg.toFixed(1)} deg from vertical`
      : `${problems.length} problem(s): ${problems[0]}`,
  };
}
