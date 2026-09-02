/* inflated.js — the built shape and the flying shape are not the same.
 *
 * Everything this project draws is the *built* wing: flat panels cut to a
 * pattern, sewn to ribs that hold a chosen aerofoil. What flies is different.
 * Under pressure the cloth between each pair of ribs bulges into an arc, so
 * the surface is scalloped rather than smooth, and the section a streamline
 * actually meets is not the section the rib was cut to.
 *
 * That matters because **every measurement in the handbook is of the flying
 * shape**. A published area, aspect ratio or aerofoil is measured on a wing
 * in the air. Comparing them against the built geometry compares two
 * different things.
 *
 * ---------------------------------------------------------------------------
 * What changes, and in which direction
 * ---------------------------------------------------------------------------
 * **Area goes up.** A scalloped surface has more cloth in it than a smooth one
 * across the same span. The projected area does not change — the ribs still
 * sit where they sit — but the wetted area does, and that is what carries the
 * skin friction.
 *
 * **Thickness goes up and camber changes.** The bulge adds to the upper
 * surface and to the lower, but not equally: the upper surface carries more
 * suction, so it bulges more, which thickens the section and moves the camber
 * line.
 *
 * **The surface is no longer smooth.** Between ribs it is a series of arcs
 * meeting at a crease. That is a roughness the flat-plate drag estimate does
 * not know about.
 *
 * This is a Phase 5 model: it is geometry, not measurement, and nothing here
 * has been checked against a flying wing. It says so in its output.
 */

/**
 * How much the surface bulges between two ribs, and what that adds.
 *
 * The billow is taken as a circular arc of the given excess — the same
 * geometry `ovalization.js` uses to cut the panel, run the other way: there
 * the excess is the cloth added to the pattern, here it is the bulge that
 * cloth produces.
 */
export function billowedSurface({ spacingM, excessRatio, arcFn }) {
  if (!(spacingM > 0)) throw new Error('billowedSurface needs a rib spacing');
  if (excessRatio < 0) throw new Error('billowedSurface needs a non-negative excess');

  if (excessRatio === 0) {
    return {
      spacingM, excessRatio, heightM: 0, arcLengthM: spacingM,
      addedLengthM: 0, meanRiseM: 0, flat: true,
    };
  }

  // `solveArc(S, L)` takes the ARC LENGTH and the CHORD it spans, and returns
  // the radius `R` and the rise `f` as a fraction of the chord. Passing it an
  // options object instead gave NaN thickness on every wing — the arc solved
  // fine and the fields simply were not the ones being read.
  const arcLength = spacingM * (1 + excessRatio);
  const arc = arcFn(arcLength, spacingM);
  const heightM = arc.f * spacingM;
  // Mean height of a circular arc above its chord, which is what adds to the
  // section rather than the peak.
  const meanRise = (2 / 3) * heightM;

  return {
    spacingM,
    excessRatio,
    heightM,
    radiusM: arc.R * spacingM,
    arcLengthM: spacingM * (1 + excessRatio),
    addedLengthM: spacingM * excessRatio,
    meanRiseM: meanRise,
    flat: false,
  };
}

/**
 * The flying wing against the built one.
 *
 * `excessUpper` and `excessLower` are the billow each surface takes. They
 * differ because the upper surface carries more suction, and the difference
 * is what changes the section rather than just thickening it.
 */
export function inflatedShape({
  wing, excessUpper = 0.06, excessLower = 0.02, arcFn,
}) {
  const cells = [];
  let builtWetted = 0;
  let flyingWetted = 0;

  for (let i = 0; i < wing.ribs.length - 1; i++) {
    const a = wing.ribs[i];
    const b = wing.ribs[i + 1];
    const spacing = Math.abs((b.station ?? 0) - (a.station ?? 0));
    if (!(spacing > 0)) continue;
    const chord = (a.chord + b.chord) / 2;

    const up = billowedSurface({ spacingM: spacing, excessRatio: excessUpper, arcFn });
    const lo = billowedSurface({ spacingM: spacing, excessRatio: excessLower, arcFn });

    // Wetted area: both surfaces, over the chord.
    const built = 2 * spacing * chord;
    const flying = (up.arcLengthM + lo.arcLengthM) * chord;
    builtWetted += built;
    flyingWetted += flying;

    cells.push({
      cell: i,
      spacingM: spacing,
      chordM: chord,
      upperRiseM: up.meanRiseM,
      lowerRiseM: lo.meanRiseM,
      // The bulge adds to thickness on both surfaces, so the section grows by
      // the sum of the two mean rises.
      addedThicknessM: up.meanRiseM + lo.meanRiseM,
      addedThicknessFraction: (up.meanRiseM + lo.meanRiseM) / chord,
      // Camber moves by the difference: the upper bulges more.
      camberShiftM: (up.meanRiseM - lo.meanRiseM) / 2,
      wettedBuiltM2: built,
      wettedFlyingM2: flying,
    });
  }

  const meanThickness = cells.length
    ? cells.reduce((a, c) => a + c.addedThicknessFraction, 0) / cells.length : 0;
  const meanCamberShift = cells.length
    ? cells.reduce((a, c) => a + c.camberShiftM / c.chordM, 0) / cells.length : 0;

  return {
    cells,
    builtWettedM2: builtWetted,
    flyingWettedM2: flyingWetted,
    wettedIncrease: builtWetted > 0 ? flyingWetted / builtWetted - 1 : 0,
    addedThicknessFraction: meanThickness,
    camberShiftFraction: meanCamberShift,
    excessUpper,
    excessLower,
    // Nothing here has been checked against a flying wing.
    source: 'geometry',
    note: `billowing adds ${(100 * (builtWetted > 0 ? flyingWetted / builtWetted - 1 : 0)).toFixed(1)}% `
      + `wetted area, ${(meanThickness * 100).toFixed(2)}% of chord in thickness `
      + `and moves camber by ${(meanCamberShift * 100).toFixed(2)}% of chord`,
  };
}

/**
 * What the scalloping costs in drag.
 *
 * Two separate effects, and it is worth keeping them apart:
 *
 * **More wetted area.** Skin friction scales with it directly, so a 2% larger
 * wetted area is 2% more friction drag. That part is arithmetic.
 *
 * **A rougher surface.** The scallops are not smooth: they meet at a crease
 * over every rib and the flow has to negotiate them. How much that costs is
 * not something this project can compute — it depends on the boundary layer
 * state, the scallop depth relative to its thickness, and the Reynolds
 * number.
 *
 * So the first is returned as a number and the second as a **factor the
 * caller supplies**, defaulting to 1.0. Rolling a guess into the first would
 * make a measured quantity and an invented one indistinguishable.
 */
export function billowDragPenalty({
  inflated, sectionCd0, roughnessFactor = 1.0,
}) {
  if (!(sectionCd0 > 0)) throw new Error('billowDragPenalty needs a section cd0');
  const areaEffect = 1 + inflated.wettedIncrease;
  return {
    wettedIncrease: inflated.wettedIncrease,
    fromArea: sectionCd0 * (areaEffect - 1),
    roughnessFactor,
    fromRoughness: sectionCd0 * areaEffect * (roughnessFactor - 1),
    cd0Flying: sectionCd0 * areaEffect * roughnessFactor,
    cd0Built: sectionCd0,
    roughnessSupplied: roughnessFactor !== 1.0,
    note: roughnessFactor === 1.0
      ? 'area effect only; the roughness of the scallops is not modelled and '
        + 'defaults to no penalty'
      : `area effect plus a supplied roughness factor of ${roughnessFactor}`,
  };
}
