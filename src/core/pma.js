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

import { fibreOf } from './trimdrift.js';
import { planPaths } from './lineplan.js';

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
  // PROVENANCE: the PMA periodical-inspection standard, section 5.1.
  // Where the new-line strength came from.
  sourceCoefficient: { manufacturer: 1.00, supplier: 1.05 },
  // What fraction of the new strength a used line must still hold.
  lineCoefficient: { dyneema: 0.65, aramid: 0.45, technora: 0.45, vectran: 0.45 },
};

// Provenance is attached non-enumerably, so `Object.values(PMA_STRENGTH)` still
// sees only materials. A table that carries its own source as an ordinary
// key becomes a table with a material called "provenance", and the first
// thing that iterates it breaks.
Object.defineProperty(PMA_STRENGTH, 'provenance', {
  value: 'PMA periodical inspection standard, section 5.1',
  enumerable: false,
});

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
 * `value_new` is "the breaking strength value of a new line provided by
 * either the paraglider manufacturer or the line supplier" — the strength
 * NEW, pulled straight. The kinked strength in
 * `data/reference/line-materials.tsv` is a different measurement, a new line
 * bent rather than an old one pulled straight, and is not what goes in here.
 *
 * The two sets of numbers do line up, fibre by fibre. In that table the
 * aramid lines keep 38 to 70 % of their strength kinked and the standard
 * asks 45 % of a used one; the Dyneema lines keep 59 to 114 %, most of them
 * over 85, and it asks 65 %.
 *
 * This compared PHI's Edelrid 8000-135 — 53 % kinked — with "PMA's 65 %
 * in-service floor" for Dyneema. The 8000-U is aramid (a DHV test report
 * says so), its floor is 45 %, and 53 is above it.
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
 * it takes how far each attachment point is expected to have moved, and asks
 * whether one correction offset can still bring them all inside the band.
 *
 * The offset is the whole point of the test. A lineset that has shrunk 30 mm
 * everywhere is 30 mm shorter and flies as designed; the inspector takes the
 * 30 mm out and finds every line on its reference. What no offset takes out
 * is the lines moving DIFFERENTLY — and so the room a design has is the
 * range of offsets that passes:
 *
 *     -12 - min(drift)  <=  offset  <=  +12 - max(drift)      suspension
 *       0 - min(drift)  <=  offset  <=  +50 - max(drift)      brakes
 *
 * with the offset itself held to 1.5 % of the longest line. While that range
 * is not empty the wing passes, and half its width is how much further the
 * lines could move apart before it did not.
 *
 * This measured each line's drift against the 24 mm width of the band, one
 * line at a time, so a lineset stretched 20 mm throughout "used 83 % of the
 * band" and one stretched 30 mm failed. Both pass with nothing to spare
 * used: that is what the offset is for.
 *
 * @param {object[]} lines  {name, referenceMM (or lengthMM), expectedDriftMM
 *                          (signed; `expectedStretchMM` is read too), isBrake}
 */
export function inspectionHeadroom(lines, { stretchAllowanceMM = 0 } = {}) {
  const [sLo, sHi] = PMA_GEOMETRY.toleranceMM;
  const [bLo, bHi] = PMA_GEOMETRY.brakeToleranceMM;
  const rows = lines.map((l) => ({
    name: l.name,
    isBrake: !!l.isBrake,
    lengthMM: l.referenceMM ?? l.lengthMM,
    expectedDriftMM: l.expectedDriftMM ?? l.expectedStretchMM ?? stretchAllowanceMM,
  }));
  const limit = Math.max(0, ...rows.map((r) => r.lengthMM ?? 0)) * PMA_GEOMETRY.offsetFractionOfMax;

  // The offsets each line allows, and the line that sets each end.
  let lo = -limit; let hi = limit;
  let setsLo = null; let setsHi = null;
  for (const r of rows) {
    const [a, b] = r.isBrake ? [bLo, bHi] : [sLo, sHi];
    if (a - r.expectedDriftMM > lo) { lo = a - r.expectedDriftMM; setsLo = r.name; }
    if (b - r.expectedDriftMM < hi) { hi = b - r.expectedDriftMM; setsHi = r.name; }
  }
  const drifts = rows.filter((r) => !r.isBrake).map((r) => r.expectedDriftMM);
  const spread = drifts.length ? Math.max(...drifts) - Math.min(...drifts) : 0;
  const band = sHi - sLo;
  // Where each line sits once the offset is in the middle of what passes.
  const offset = (lo + hi) / 2;
  for (const r of rows) {
    const [a, b] = r.isBrake ? [bLo, bHi] : [sLo, sHi];
    r.deltaMM = r.expectedDriftMM + offset;
    r.marginMM = Math.min(r.deltaMM - a, b - r.deltaMM);
    r.leavesHeadroom = r.marginMM > 0;
  }
  const worst = rows.reduce((m, r) => (r.marginMM < m.marginMM ? r : m), rows[0]);
  return {
    rows,
    bandMM: band,
    // How far apart the suspension points have moved, and how much of the
    // band that takes: at 1 no offset fits them all.
    spreadMM: spread,
    bandUsedFraction: band > 0 ? spread / band : 0,
    offsetRangeMM: [lo, hi],
    offsetMM: offset,
    offsetLimitMM: limit,
    // Half the width of the passing range: the further movement there is
    // room for. Negative when nothing passes.
    slackMM: (hi - lo) / 2,
    limitedBy: [setsLo, setsHi],
    worst,
    passes: lo <= hi + 1e-9,
    allHaveHeadroom: hi - lo > 1e-9,
  };
}

/* ------------------------------------------------------ data exchange -- */

/**
 * Section 6.2.1: what a manufacturer must hand an inspection company.
 *
 * The standard asks for this in "a computable format", and the list is
 * precisely what a design tool already knows — line references, materials,
 * sewn lengths, colours, construction, new breaking strength, and the total
 * line length for every attachment point including the trimmer position.
 *
 * So this is the natural output of the whole project: the design produces the
 * document that lets the wing be inspected for the rest of its life. It also
 * closes a loop, because the same fields are what `parseLineTable` reads back
 * out of a manufacturer's sheet.
 *
 * Two details the standard is specific about and that are easy to get wrong:
 *
 *   - **Sewn length** is the distance between the *insides of the two loops*
 *     (Figure 6) — not the cut length, which includes the loops themselves.
 *     The project's `stretchCorrection` produces both, and the wrong one here
 *     would be short by the loop allowance on every line.
 *
 *   - **Total line length** is sail to harness and therefore includes the
 *     riser (Figure 4), with the trimmer at whatever position the maker
 *     specifies. A sheet quoted to the maillon is a different quantity. A
 *     brake's is sail to "the top side of the handle knot" (Figure 5), and
 *     has no riser in it.
 *
 *   - **Breaking strength** is of the NEW line (`value_new`), and the least
 *     a used one may hold is that times the coefficient of its own fibre:
 *     0.65 for Dyneema, 0.45 for aramid, Technora and Vectran.
 */
export function exchangeRecord({
  manufacturer, model, size,
  weightRangeKg = null,
  inspectionIntervalYears = 3,
  inspectionIntervalHours = 150,
  plan,
  selection = null,
  stretch = null,
  // The length chain, which distinguishes the flying length from the
  // reference length measured at 5 daN. Without it the record publishes a
  // design length where the standard asks for a measured one.
  lengths = null,
  riserLengthMM = 0,
  trimmerPosition = 'closed',
  // Left unset, each line takes the coefficient of its own fibre. Naming a
  // material here applies it to every line, as a manufacturer may.
  lineCoefficientMaterial = null,
} = {}) {
  if (!plan) throw new Error('exchangeRecord needs a line plan');

  const byName = new Map();
  if (selection) for (const l of selection.lines) byName.set(l.name, l);
  const stretchByName = new Map();
  if (stretch) for (const l of stretch.lines) stretchByName.set(l.name, l);
  const chainByName = new Map();
  if (lengths) for (const l of lengths.lines) chainByName.set(l.name, l);

  const unknownFibre = [];
  const lines = plan.lines.map((l) => {
    const sel = byName.get(l.name);
    const st = stretchByName.get(l.name);
    const chain = chainByName.get(l.name);
    const mat = sel && sel.line ? sel.line : null;
    // `value_new`: the strength of the line new. This published the KINKED
    // strength under that heading — half the figure, on an aramid line.
    const newDaN = mat ? (mat.strengthNewDaN ?? mat.strengthDaN ?? null) : null;
    // Each line by its own fibre. Every line was given Dyneema's 0.65, of
    // that kinked strength: a minimum a fifth too low on an aramid line and
    // some 7% too low on a Dyneema one.
    const fibre = mat ? fibreOf(mat) : null;
    const coefficientOf = lineCoefficientMaterial ?? fibre;
    const known = coefficientOf != null
      && PMA_STRENGTH.lineCoefficient[String(coefficientOf).toLowerCase()] != null;
    if (mat && !known) unknownFibre.push(l.name);
    const check = newDaN != null && known
      ? lineStrengthCheck({ newStrengthDaN: newDaN, material: coefficientOf }) : null;
    // Figure 6: inside of one loop to inside of the other.
    const sewn = chain?.sewnLengthMM ?? (st ? st.finishedLengthMM : Math.round(l.lengthMM));
    const cut = chain?.cutLengthMM ?? (st ? st.cutLengthMM : null);
    return {
      reference: l.name,
      row: l.row,
      level: l.level,
      material: mat ? mat.code : null,
      core: fibre,
      sewnLengthMM: sewn,
      colour: mat ? (mat.colour ?? null) : null,
      construction: cut != null && cut > sewn
        ? `a loop each end, ${Math.round(cut - sewn)} mm of line in the two`
        : (st ? 'spliced both ends' : null),
      newStrengthDaN: newDaN,
      lineCoefficient: check ? check.lineCoeff : null,
      minimumStrengthDaN: check ? check.minimumStrengthDaN : null,
    };
  });

  // Total line length per attachment point: the lines under it, and the
  // riser.
  //
  // The standard measures this at 5 daN, and on a paraglider that tension
  // exceeds the 1 g load on most lines — so the reference length is longer
  // than the flying length the design computed. It is the sum of each line's
  // own reference length down the path: every line of a path carries the
  // whole 5 daN.
  //
  // This added the lineset's MEAN reference-minus-flying difference once to
  // each total. A path is three lines, so that was about a third of it.
  const totals = [];
  for (const p of planPaths(plan)) {
    const parts = p.names.map((n) => chainByName.get(n));
    const measured = !!lengths && parts.every((x) => x && x.referenceLengthMM > 0);
    const linesMM = measured
      ? parts.reduce((a, x) => a + x.referenceLengthMM, 0)
      : p.lengthMM;
    const riser = p.isBrake ? 0 : riserLengthMM;
    totals.push({
      attachmentPoint: `${p.row}${p.index}`,
      topLine: p.name,
      row: p.row,
      index: p.index,
      path: p.names,
      isBrake: p.isBrake,
      totalLineLengthMM: Math.round(linesMM + riser),
      measuredAtDaN: measured ? lengths.measurementDaN : null,
      basis: measured ? 'reference length at the measuring tension'
        : 'design length; no length chain supplied',
      // A brake runs to its handle, not through a riser.
      includesRisers: !p.isBrake,
      trimmerPosition,
    });
  }
  const rowOrder = (r) => (r === 'K' ? 'ZY' : r === 'S' ? 'ZX' : r);
  totals.sort((a, b) => rowOrder(a.row).localeCompare(rowOrder(b.row)) || a.index - b.index);

  const missing = [];
  if (!manufacturer) missing.push('manufacturer');
  if (!model) missing.push('model');
  if (!size) missing.push('size');
  if (!weightRangeKg) missing.push('weight range');
  if (!selection) missing.push('line materials and strengths');
  // The standard lists them, and a strength table does not: which colour
  // each line is, is the maker's choice.
  else if (!lines.some((l) => l.colour)) missing.push('line colours');
  if (unknownFibre.length) {
    missing.push(`the fibre of ${unknownFibre.length} line${unknownFibre.length > 1 ? 's' : ''} `
      + '(no inspection minimum without it)');
  }
  if (!riserLengthMM) missing.push('riser length');
  if (!lengths) {
    missing.push('length chain (totals are design lengths, not measured at 5 daN)');
  }

  return {
    standard: 'PMA Periodical Inspection of Paragliders',
    standardVersion: 'V 2024.12.1',
    manufacturer: manufacturer ?? null,
    model: model ?? null,
    size: size ?? null,
    weightRangeKg,
    periodicalInspection: {
      intervalYears: inspectionIntervalYears,
      intervalHours: inspectionIntervalHours,
    },
    riserLengthMM,
    trimmerPosition,
    lines,
    totalLineLengths: totals,
    // A record missing required fields is still returned, but says so — an
    // inspector receiving it needs to know what is absent, not to be handed
    // a file that looks complete.
    missing,
    complete: missing.length === 0,
  };
}

/**
 * A design's first inspection, before there is a wing to inspect.
 *
 * The record gives every attachment point its reference length; the drift
 * model (`trimDrift`, with the plan's paths) says how far each is expected to
 * have moved after some hours. Put through the standard's own geometry check
 * that is a forecast of what an inspector will find — and, with
 * `inspectionHeadroom`, of how much room is left.
 *
 * It is a forecast and carries the drift model's standing with it: the
 * directions are the makers', the sizes are estimates.
 */
export function inspectionForecast({ record, drift }) {
  if (!record?.totalLineLengths?.length) {
    throw new Error('inspectionForecast needs a record with total line lengths');
  }
  if (!drift?.points) throw new Error('inspectionForecast needs the drift of each attachment point');
  const moved = new Map(drift.points.map((p) => [`${p.row}${p.index}`, p]));
  const lines = [];
  const notForecast = [];
  for (const t of record.totalLineLengths) {
    const m = moved.get(t.attachmentPoint);
    if (!m) { notForecast.push(t.attachmentPoint); continue; }
    lines.push({
      name: t.attachmentPoint,
      isBrake: !!t.isBrake,
      referenceMM: t.totalLineLengthMM,
      expectedDriftMM: m.deltaMM,
      measuredMM: Math.round(t.totalLineLengthMM + m.deltaMM),
    });
  }
  if (!lines.length) throw new Error('inspectionForecast: no attachment point has a drift');
  return {
    hours: drift.hours,
    lines,
    notForecast,
    check: lineGeometryCheck(lines),
    headroom: inspectionHeadroom(lines),
    source: drift.source ?? 'estimated',
  };
}

/** The exchange record as TSV, which is what actually gets emailed. */
export function exchangeTSV(record) {
  const out = [];
  out.push(`# ${record.standard} ${record.standardVersion}`);
  out.push(`# ${record.manufacturer ?? '?'}\t${record.model ?? '?'}\t${record.size ?? '?'}`);
  out.push(`# riser ${record.riserLengthMM} mm, trimmer ${record.trimmerPosition}`);
  if (!record.complete) out.push(`# INCOMPLETE: ${record.missing.join(', ')}`);
  out.push('');
  out.push(`# inspection every ${record.periodicalInspection.intervalYears} years or `
    + `${record.periodicalInspection.intervalHours} hours, whichever comes first`);
  out.push('# new_strength is of the line new (value_new); minimum_strength is that times');
  out.push('#   the coefficient of the line\'s own fibre (section 5.4)');
  out.push('');
  out.push(['reference', 'row', 'level', 'material', 'core', 'sewn_length_mm',
    'colour', 'construction', 'new_strength_daN', 'line_coeff',
    'minimum_strength_daN'].join('\t'));
  for (const l of record.lines) {
    out.push([l.reference, l.row, l.level, l.material ?? '', l.core ?? '',
      l.sewnLengthMM, l.colour ?? '', l.construction ?? '', l.newStrengthDaN ?? '',
      l.lineCoefficient ?? '', l.minimumStrengthDaN != null
        ? l.minimumStrengthDaN.toFixed(1) : ''].join('\t'));
  }
  out.push('');
  const measured = record.totalLineLengths.find((t) => t.measuredAtDaN != null);
  out.push(measured
    ? `# total line lengths at ${measured.measuredAtDaN} daN: sail to the riser's loop at the harness;`
    : '# total line lengths as DESIGNED, not at the measuring tension: sail to the riser\'s loop;');
  out.push('#   a brake\'s from the sail to the knot at its handle, with no riser in it');
  out.push(['attachment_point', 'total_line_length_mm', 'includes_risers',
    'trimmer_position', 'lines'].join('\t'));
  for (const t of record.totalLineLengths) {
    out.push([t.attachmentPoint, t.totalLineLengthMM, t.includesRisers,
      t.trimmerPosition, (t.path ?? []).join(' ')].join('\t'));
  }
  return `${out.join('\n')}\n`;
}
