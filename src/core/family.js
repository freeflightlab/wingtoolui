/* family.js — one design, every size.
 *
 * `scaleToArea` returns a size's summary numbers. This runs the whole pipeline
 * for each size in a family: geometry, panels, nesting, balance, line plan,
 * loads and line selection, so a family produces cutting files and line
 * schedules rather than a table of dimensions.
 *
 * Two things make this more than a loop.
 *
 * **The canopy scales, the lineset does not.** Every length in the planform
 * multiplies by k, so a family shares one shape. Line *loads* scale with k^2,
 * because they follow weight, while a line's strength scales with its
 * cross-section. A family's linesets are therefore not similar to each other,
 * and each size has to be sized from its own loads.
 *
 * **Most lines are not load-sized.** With the practical floor in place, a
 * small wing's lines are decided almost entirely by handling rather than by
 * load. So the interesting output is not the line list but how the
 * load-sized fraction moves across the family — which is where the design
 * actually changes.
 */

import { planformFromDesignInputs, planformMetrics } from './planform.js';
import { buildLobe } from './lobe.js';
import { buildWing } from './wing3d.js';
import { developWing } from './flatdev.js';
import { applyOvalization, DEFAULT_TRANSITIONS } from './ovalization.js';
import { fabricEstimate } from './export.js';
import { solveEquilibrium } from './equilibrium.js';
import { buildLinePlan, RISER_LAYOUTS } from './lineplan.js';
import { analyseLoads, selectLines, PRACTICAL_FLOOR } from './loads.js';
import { scaleDesignInputs } from './scaling.js';

/**
 * Build one size, end to end.
 *
 * @param {object} base   design inputs for the reference size
 * @param {number} k      linear scale factor
 * @param {object} opts   per-size overrides: line length, mass, hardware
 */
export function buildSize(base, k, {
  name = null,
  lineLengthM = null,
  allUpMassKg = null,
  wingMassKg = null,
  cells = 24,
  pointsPerSurface = 40,
  rollWidth = 1.4,
  airfoil,
  layout = RISER_LAYOUTS['A/B/C+D'],
  projectedRatio = 0.87,
  alphaDeg = 6,
  ovalAmount = 0.06,
  // The riser is hardware and is not scaled: half a metre unless told.
  riserLengthM = 0.5,
  panels: wantPanels = true,
} = {}) {
  const inputs = scaleDesignInputs(base, k);
  const planform = planformFromDesignInputs(inputs);
  const metrics = planformMetrics(planform);
  const lobe = buildLobe({ type: 'circle', projectedRatio }, planform.halfSpan);
  const wing = buildWing({
    planform, lobe, airfoil, cells, pointsPerSurface,
    zRotation: 'auto', alphaDeg,
  });

  // The line height goes with the wing, unless a size gives its own. (This
  // said "line length does not scale with the canopy" over a line of code
  // that scales it. The code was right: `docs/scaling.md`, section 1.)
  const lineLength = lineLengthM ?? base.lineLengthM * k;
  const mass = allUpMassKg ?? base.allUpMassKg * k * k;

  // Without a line height or a mass nothing downstream is a number, and
  // nothing downstream said so: the family table came out with NaN for the
  // line length, the speed and the glide on every row, and 0 g of line.
  if (!(Number.isFinite(lineLength) && lineLength > 0)) {
    throw new Error(`buildSize: ${name ? `size ${name}` : 'this size'} has no line height. `
      + 'Give `lineLengthM` — the distance from the karabiner to the canopy — '
      + 'on the base or on the size.');
  }
  if (!(Number.isFinite(mass) && mass > 0)) {
    throw new Error(`buildSize: ${name ? `size ${name}` : 'this size'} has no all-up mass. `
      + 'Give `allUpMassKg` on the base or on the size.');
  }

  const plan = buildLinePlan({
    wing, airfoil, layout, everyNthRib: 2, lineLengthM: lineLength, riserLengthM,
  });

  const loads = analyseLoads({
    plan, planform, stations: wing.stations,
    totalMassKg: mass, alphaDeg, wingAreaM2: metrics.area,
  });
  const selection = selectLines(loads.tensions, {});

  // The pilot hangs below the lines AND the riser: the same depth the line
  // plan puts the karabiner at. The balance was given the lines alone, half
  // a metre short, so each size's plan and its trim described two different
  // pilots — the fault the interface's own balance had, and was cured of.
  const hangDepthM = lineLength + riserLengthM;
  const balance = solveEquilibrium({
    area: metrics.area, span: planform.span, chord: inputs.rootChord,
    lineLength: hangDepthM,
    pilotMass: mass - (wingMassKg ?? 0), wingMass: wingMassKg ?? 4,
    alphaDeg, cxLines: loads.drag ? loads.drag.cxLines : undefined,
  });

  let panels = null;
  let fabric = null;
  if (wantPanels) {
    panels = developWing(wing).map((p) => ({
      ...p,
      panel: applyOvalization(p.panel, {
        amount: ovalAmount, transitions: DEFAULT_TRANSITIONS[p.surface],
      }),
    }));
    fabric = fabricEstimate(panels, { rollWidth, gap: 0.03 });
  }

  const sized = selection.lines.filter((l) => l.line);
  return {
    name,
    scaleFactor: k,
    inputs,
    planform,
    metrics,
    wing,
    plan,
    loads,
    selection,
    balance,
    panels,
    fabric,
    summary: {
      name,
      flatAreaM2: metrics.area,
      flatSpanM: planform.span,
      aspectRatio: metrics.aspectRatio,
      allUpMassKg: mass,
      lineLengthM: lineLength,
      riserLengthM,
      hangDepthM,
      speedKMH: balance.speedKMH,
      glideRatio: balance.glideRatio,
      fabricM: fabric ? fabric.linearMetres : null,
      fabricUtilisation: fabric ? fabric.utilisation : null,
      lineMassG: selection.totalMassG,
      lineCount: selection.lines.length,
      loadSized: selection.loadSized,
      floorSized: selection.floorSized,
      loadSizedFraction: selection.lines.length
        ? selection.loadSized / selection.lines.length : 0,
      thickestLineMM: sized.length ? Math.max(...sized.map((l) => l.line.diameterMM)) : null,
      cxLines: loads.drag ? loads.drag.cxLines : null,
    },
  };
}

/**
 * Build every size in a family.
 *
 * `sizes` gives what a maker sets by hand at each size.
 *
 * The all-up mass above all. Left out, a size is flown at the base's wing
 * loading (mass x k^2), and no family in the reference set is: each is loaded
 * 11 to 34% harder at its largest size than its smallest. So that default is
 * a place to start from.
 *
 * The line height where it departs from scale. Left out, it is the base's
 * times k, which is what the measured families do to within half a per cent
 * — except at the sizes a maker chose to make differently.
 */
export function buildFamily(base, sizes, opts = {}) {
  // The base's declared area must match its own geometry.
  //
  // Every size is scaled by `sqrt(flatArea / base.flatArea)`, so a base whose
  // declared area is wrong scales the whole family by the same wrong factor.
  // A base declared at 22.5 m2 whose planform actually measures 22.91 put
  // every size 1.8% over what was asked for — consistently, quietly, and in
  // the direction that makes a wing bigger than its label.
  //
  // The geometry is the truth here, so it is measured and the declaration
  // checked against it rather than believed.
  // Only when the base area is actually used for scaling.
  //
  // A size may give its scale factor `k` directly, in which case
  // `base.flatArea` is never read and a declared area that differs from the
  // geometry is not an error — it is the published area of a real wing whose
  // planform this base only approximates, which is exactly how the Geo 7
  // family is validated.
  const scalesByArea = sizes.some((z) => z.k == null && z.flatArea != null);
  const measured = planformMetrics(planformFromDesignInputs(base)).area;
  if (scalesByArea && base.flatArea
      && Math.abs(measured / base.flatArea - 1) > 0.005) {
    throw new Error(
      `buildFamily: the base declares ${base.flatArea.toFixed(2)} m2 but its `
      + `geometry measures ${measured.toFixed(2)} m2. Every size would scale `
      + 'by that error. Use the measured area, or correct the geometry.');
  }
  if (scalesByArea) base = { ...base, flatArea: measured };

  const built = sizes.map((s) => buildSize(base, s.k ?? Math.sqrt(s.flatArea / base.flatArea), {
    ...opts,
    name: s.name,
    lineLengthM: s.lineLengthM ?? null,
    allUpMassKg: s.allUpMassKg ?? null,
    wingMassKg: s.wingMassKg ?? null,
    // A size may hang from its own riser: makers keep two lengths.
    ...(s.riserLengthM != null ? { riserLengthM: s.riserLengthM } : {}),
  }));

  const summaries = built.map((b) => b.summary);
  const smallest = summaries[0];
  const largest = summaries[summaries.length - 1];

  return {
    sizes: built,
    summaries,
    // The prediction worth checking: a small wing's lines are decided almost
    // entirely by the practical floor, and a large wing's increasingly by
    // load. If that does not happen, either the floor or the load model is
    // doing something wrong.
    loadSizedTrend: {
      smallest: smallest.loadSizedFraction,
      largest: largest.loadSizedFraction,
      rises: largest.loadSizedFraction > smallest.loadSizedFraction,
    },
    practicalFloorMM: PRACTICAL_FLOOR.diameterMM,
  };
}

/** A family summary table, in the shape a spec sheet uses. */
export function familyTable(family) {
  // "line length" is the lines alone, wing to riser top; the pilot hangs a
  // riser's length below that, and the riser has a column of its own because
  // it is the one length here that does not go with the size.
  const head = [
    'size', 'flat area', 'flat span', 'AR', 'all-up', 'line length', 'riser',
    'speed', 'glide', 'fabric', 'line mass', 'load-sized',
  ];
  const rows = family.summaries.map((s) => [
    s.name ?? '',
    `${s.flatAreaM2.toFixed(2)} m2`,
    `${s.flatSpanM.toFixed(2)} m`,
    s.aspectRatio.toFixed(2),
    `${s.allUpMassKg.toFixed(0)} kg`,
    `${s.lineLengthM.toFixed(2)} m`,
    `${(s.riserLengthM * 1000).toFixed(0)} mm`,
    `${s.speedKMH.toFixed(1)} km/h`,
    s.glideRatio.toFixed(2),
    s.fabricM != null ? `${s.fabricM.toFixed(1)} m` : '-',
    `${s.lineMassG.toFixed(0)} g`,
    `${s.loadSized}/${s.lineCount}`,
  ]);
  return [head, ...rows].map((r) => r.join('\t')).join('\n');
}

/**
 * Cutting files for every size, keyed by size name.
 * Deliberately returns strings rather than writing them: this module has no
 * business touching a filesystem, and the caller knows where the files go.
 */
export function familyCuttingFiles(family, writers) {
  const out = {};
  for (const size of family.sizes) {
    if (!size.panels) continue;
    out[size.name ?? size.scaleFactor.toFixed(3)] = {
      panelsDXF: writers.panelsToDXF(size.panels, { rollWidth: writers.rollWidth ?? 1.4 }),
      ribsDXF: writers.ribsToDXF(size.wing),
      lineSchedule: writers.lineScheduleText(size.loads, { name: size.name ?? 'size' }),
    };
  }
  return out;
}
