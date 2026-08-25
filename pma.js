/* pma.js — the PMA periodical inspection standard.
 *
 * "Periodical Inspection of Paragliders", PMA Standard V 2024.12.1, written
 * by the manufacturers themselves — Advance, Ozone, Ripair, Skywalk, Sol,
 * Supair, Swing and BGD. It specifies how a used wing is assessed, and two of
 * its five tests are directly computable from a design.
 *
 * That makes it useful in a design tool, not only an inspection one. A wing
 * whose line lengths cannot be brought inside the inspection tolerance is a
 * wing that will fail its first check, and it is cheaper to find that out
 * before cutting the lines.
 *
 * ---------------------------------------------------------------------------
 * What this is not
 * ---------------------------------------------------------------------------
 * It is not an inspection. The porosity, tear-strength and visual tests need
 * the wing in front of you, and the line-strength test destroys a line. What
 * is implemented here is the arithmetic: the geometry criterion, and the
 * strength threshold a line must meet when it is eventually broken.
 *
 * The standard also says plainly that a manufacturer's own manual supersedes
 * it, so these are defaults rather than rules.
 */

/** Section 5.5: line geometry inspection. */
export const PMA_GEOMETRY = {
  // Δ must fall inside this band for every suspension line.
  toleranceMM: [-12, +12],
  // Brake lines are allowed to be long but not short: a short brake line
  // flies the wing braked.
  brakeToleranceMM: [0, +50],
  // A single offset may be applied to every measurement, to absorb a
  // systematic error in the measuring setup. It is capped as a fraction of
  // the longest line so it cannot be used to hide a real discrepancy.
  offsetFractionOfMax: 0.015,
};

/** Section 5.4: line strength inspection. */
export const PMA_STRENGTH = {
  // Where the new-line strength came from.
  sourceCoefficient: { manufacturer: 1.00, supplier: 1.05 },
  // What fraction of the new strength a used line must still hold.
  lineCoefficient: { dyneema: 0.65, aramid: 0.45, technora: 0.45, vectran: 0.45 },
};

/** Section 5.2 and 5.3: the pass bands for the tests needing a real wing. */
export const PMA_FABRIC = {
  porosityFailAbove: 540,      // l/m²/min at 20 mbar
  porosityGoodBelow: 360,
  tearFailBelow: 0.6,          // daN
  tearGoodAbove: 0.7,
};

/**
 * Line geometry inspection.
 *
 * `Δ = measured + correction_offset − reference`, per attachment point. The
 * offset is a single value applied to every measurement including the brakes,
 * and it is chosen by the inspector — so the useful thing to compute is the
 * offset that brings the *most* lines inside tolerance, and then report what
 * is still out.
 *
 * @param {object[]} lines  {name, measuredMM, referenceMM, isBrake}
 */
export function lineGeometryCheck(lines, { correctionOffsetMM = null } = {}) {
  const maxReference = Math.max(...lines.map((l) => l.referenceMM));
  const offsetLimit = maxReference * PMA_GEOMETRY.offsetFractionOfMax;

  // If no offset is given, search for the one that passes the most lines.
  // Ties go to the smaller offset, since a large one is harder to justify.
  let offset = correctionOffsetMM;
  if (offset == null) {
    let best = null;
    for (let o = -Math.round(offsetLimit); o <= Math.round(offsetLimit); o++) {
      const pass = lines.filter((l) => within(l, o)).length;
      if (!best || pass > best.pass || (pass === best.pass && Math.abs(o) < Math.abs(best.o))) {
        best = { o, pass };
      }
    }
    offset = best.o;
  }

  const rows = lines.map((l) => {
    const delta = l.measuredMM + offset - l.referenceMM;
    const band = l.isBrake ? PMA_GEOMETRY.brakeToleranceMM : PMA_GEOMETRY.toleranceMM;
    return {
      name: l.name,
      isBrake: !!l.isBrake,
      measuredMM: l.measuredMM,
      referenceMM: l.referenceMM,
      deltaMM: delta,
      band,
      withinTolerance: delta >= band[0] && delta <= band[1],
    };
  });

  const failures = rows.filter((r) => !r.withinTolerance);
  return {
    rows,
    correctionOffsetMM: offset,
    offsetLimitMM: offsetLimit,
    offsetWithinLimit: Math.abs(offset) <= offsetLimit + 1e-9,
    failures,
    passes: failures.length === 0 && Math.abs(offset) <= offsetLimit + 1e-9,
    // Named because an inspection report has to list them.
    outOfTolerance: failures.map((f) => f.name),
  };

  function within(l, o) {
    const d = l.measuredMM + o - l.referenceMM;
    const band = l.isBrake ? PMA_GEOMETRY.brakeToleranceMM : PMA_GEOMETRY.toleranceMM;
    return d >= band[0] && d <= band[1];
  }
}

/**
 * Line strength inspection.
 *
 *     minimum_strength_value = value_new × source_coeff × line_coeff
 *
 * The line coefficient is what makes this interesting next to the materials
 * data already in this project. PMA requires a used **Dyneema** line to still
 * hold 65% of its new strength, and an **aramid** line only 45% — aramids
 * lose more with age and UV, so less is demanded of them.
 *
 * That is a different measurement from the kinked strength in
 * `data/reference/line-materials.tsv`, which is a new line bent around a pin
 * rather than an old one pulled straight. The two should not be conflated:
 * PHI's Edelrid 8000-135 holds 53% kinked, below PMA's 65% in-service floor,
 * and it is not a failing line — it is a different test.
 */
export function lineStrengthCheck({
  newStrengthDaN, source = 'manufacturer', material = 'dyneema',
  measuredDaN = null, manufacturerMinimumDaN = null,
}) {
  const sourceCoeff = PMA_STRENGTH.sourceCoefficient[source];
  const lineCoeff = PMA_STRENGTH.lineCoefficient[String(material).toLowerCase()];
  if (sourceCoeff == null) throw new Error(`Unknown strength source: ${source}`);
  if (lineCoeff == null) throw new Error(`Unknown line core material: ${material}`);

  const computed = newStrengthDaN * sourceCoeff * lineCoeff;
  // A manufacturer may specify its own figure, higher or lower, and the
  // standard says that one wins.
  const minimum = manufacturerMinimumDaN ?? computed;

  return {
    newStrengthDaN,
    source,
    sourceCoeff,
    material,
    lineCoeff,
    computedMinimumDaN: computed,
    minimumStrengthDaN: minimum,
    fromManufacturer: manufacturerMinimumDaN != null,
    measuredDaN,
    passes: measuredDaN == null ? null : measuredDaN >= minimum,
    marginDaN: measuredDaN == null ? null : measuredDaN - minimum,
  };
}

/** Section 5.2: rate a porosity measurement. */
export function porosityRating(litresPerM2PerMin) {
  if (litresPerM2PerMin > PMA_FABRIC.porosityFailAbove) return 'fail';
  if (litresPerM2PerMin > PMA_FABRIC.porosityGoodBelow) return 'acceptable';
  return 'good';
}

/** Section 5.3: rate a tear-strength measurement, in daN. */
export function tearRating(daN) {
  if (daN < PMA_FABRIC.tearFailBelow) return 'fail';
  if (daN <= PMA_FABRIC.tearGoodAbove) return 'acceptable';
  return 'good';
}

/**
 * The JDC MK1/MK2 conversion the standard quotes: a porosimeter reading in
 * seconds at 10 mbar becomes l/m²/min at 20 mbar.
 */
export function porosityFromSeconds(seconds) {
  return 5400 / seconds;
}

/**
 * Would this design's line lengths survive an inspection?
 *
 * A design tool's version of the geometry test: instead of measured lengths
 * it takes the lengths a build would produce, and asks whether the tolerance
 * band leaves any room. A wing whose own cut lengths already sit at the edge
 * of ±12 mm has nothing left for three years of stretch.
 */
export function inspectionHeadroom(lines, { stretchAllowanceMM = 0 } = {}) {
  const band = PMA_GEOMETRY.toleranceMM[1] - PMA_GEOMETRY.toleranceMM[0];
  const rows = lines.map((l) => {
    const drift = l.expectedStretchMM ?? stretchAllowanceMM;
    return {
      name: l.name,
      lengthMM: l.lengthMM,
      expectedStretchMM: drift,
      // How much of the band the expected drift already uses.
      bandUsedFraction: band > 0 ? drift / band : 0,
      leavesHeadroom: drift < band / 2,
    };
  });
  const worst = rows.reduce((m, r) => (r.bandUsedFraction > m.bandUsedFraction ? r : m), rows[0]);
  return {
    rows,
    bandMM: band,
    worst,
    allHaveHeadroom: rows.every((r) => r.leavesHeadroom),
  };
}
