/* scaling.js — generating a size family from one design.
 *
 * Manufacturers ship a wing in five or six sizes. The naive assumption is that
 * a family is one design scaled: multiply every length by k, areas go as k^2,
 * done. Measured against real families that is right for the canopy, right
 * for the height of the lines, and wrong for two things: the riser, which is
 * a piece of hardware, and the mass.
 *
 * PHI's ALLEGRO light across its six sizes (XS 17 m^2 to XL 24 m^2), each
 * figure as a power of the span ratio:
 *
 *   flat area      k^2.00
 *   projected area k^1.99
 *   maximum chord  k^1.01
 *   minimum chord  k^0.97
 *   aspect ratio   constant at 6.03 across every size
 *
 * So the canopy is scaled. So is the line length PHI publish: from the S to
 * the XL it is 0.6025 x span to within 5 mm, which is the rounding of a
 * figure quoted to the centimetre. The XS is 98 mm longer than that.
 *
 * ---------------------------------------------------------------------------
 * What this header used to say, and why it was wrong
 * ---------------------------------------------------------------------------
 * "Line length is affine, not proportional: 0.566 x span + 0.459 m, R^2 =
 * 0.995. Lines are set partly by the pilot's geometry and by handling, not
 * purely by wing size. Scaling a design isometrically gives lines that are
 * too long on the big sizes."
 *
 * The fit is real and its reading was not. All of that 0.459 m comes from one
 * size. Leave the XS out and the fixed part is -0.02 m, which is none: five
 * sizes of six lie on a line through the origin. And a power law "lands 1.6% out where the
 * affine fit is within 0.6%" only if its exponent is held at 1 from the XS —
 * fitted, it is 0.93 and within 0.63%, as close as the affine one. Six sizes
 * across 18% of span cannot tell the two forms apart.
 *
 * Ozone's line sheets say the same of the height, to the bottom of the riser:
 * on the Geo 7 it follows the square root of the area to 0.3% at all five
 * sizes, and on the Ultralite 5 to 0.5% from the 17 to the 25. (The 13 and
 * the 15 hang 5% shorter: two sizes the maker chose to make differently, and
 * no law fitted across the family finds them.) The riser inside that height
 * does not scale — by the sheets' own arithmetic 527 mm on four sizes of the
 * Geo 7 and 472 mm on its XS; 570 and 600 mm on PHI's; 520 and 540 mm on
 * Skywalk's — so the lines above it grow FASTER than the wing, not slower,
 * and the cord in a lineset goes as span to the power 1.02 to 1.30 in all
 * seven families. On the two
 * three-liners the top lines take all of it: scaled, they would be 6% and
 * 15% longer on the largest size than on the middle one, and they are 13.5%
 * and 26.6% longer. `docs/scaling.md` has the arithmetic.
 *
 * The affine laws below are kept as what they are: a way to interpolate a
 * figure inside a family that has been measured.
 *
 *   line length    0.566 * span + 0.459 m     R^2 = 0.995
 *   total line     21.46 * span - 5.54 m      R^2 = 0.983
 *   wing weight    0.159 * projected area + 0.293 kg
 *
 * The weight does have a fixed part, in every family measured: 0.3 to 1.1 kg
 * that is there at any area.
 *
 * ---------------------------------------------------------------------------
 * The affine laws are for interpolation, not extrapolation
 * ---------------------------------------------------------------------------
 * Fitted to the three smallest sizes and used on the three largest:
 *
 *                 line length          total line           weight
 *                 affine  isometric    affine  isometric    affine  isometric
 *   ML            0.63%    1.47%       1.00%    0.60%       2.49%    0.56%
 *   L             1.08%    1.42%       1.16%    0.63%       3.76%    0.19%
 *   XL            1.83%    1.40%       1.52%    0.60%       5.89%    1.42%
 *
 * The affine error grows with every size beyond the fit. Plain scaling does
 * not. For the weight and the total it is the worse of the two at once, and
 * for the line length by the third size out.
 *
 * (The isometric line length is 1.4% out at every size because it is scaled
 * from the XS, the one size that is off the line.)
 *
 * So `scaleToArea` reports whether the target sits inside the range the laws
 * were fitted over, and falls back to isometric scaling outside it unless
 * told otherwise.
 *
 * One more thing the data shows, which is a design decision rather than a law:
 * wing loading is not held constant across a family. The ALLEGRO light runs
 * 3.57 kg/m^2 at mid weight on the XS and 4.80 on the XL. Bigger sizes are
 * flown proportionally heavier, so a family is not a set of identically
 * behaving wings.
 */
import { planformFromDesignInputs, planformMetrics } from './planform.js';
import { ellipseForProjectedRatio } from './lobe.js';

/**
 * Laws fitted to one family, kept as a worked example — **not** as defaults to
 * apply to another wing.
 *
 * Checked against two more families (Ozone Geo 7, five sizes; Ozone Ultralite
 * 5, seven sizes), the *form* of these laws transfers and the *coefficients*
 * do not:
 *
 *   total line length vs span      slope    intercept   R^2
 *     PHI Allegro light            21.46     -5.54      0.983
 *     Ozone Geo 7                  26.54    -40.93      0.991
 *     Ozone Ultralite 5            36.64    -76.93      0.997
 *
 *   mass vs projected area
 *     PHI Allegro light            0.1588   +0.2926     0.987
 *     Ozone Geo 7                  0.1270   +0.9639     0.974
 *     Ozone Ultralite 5            0.0927   +0.3871     0.999
 *
 * Every fit is tight, so a straight line interpolates each family well. But
 * the slopes differ by a factor of 1.7 across the three (2.3 across the seven
 * families now in the table), because they depend on how many lines a wing
 * has, how deep its cascade runs and how it is built. Applying one family's
 * coefficients to another is simply wrong.
 *
 * Every intercept of the total is NEGATIVE: the cord grows faster than the
 * span, for the reason in the header. And every intercept of the mass is
 * positive.
 *
 * So `scaleToArea` scales isometrically unless it is handed laws fitted to
 * the family being scaled. Use `fitScalingFamily` on your own sizes.
 */
export const EXAMPLE_SCALING = {
  source: 'PHI ALLEGRO light, six sizes, 2021 — example only, do not reuse',
  aspectRatioConstant: true,
  // length = slope * span + intercept
  lineLength: { slope: 0.5659, intercept: 0.4594, r2: 0.9948 },
  totalLineLength: { slope: 21.4648, intercept: -5.5359, r2: 0.9827 },
  // mass = slope * projectedArea + intercept
  wingMass: { slope: 0.1588, intercept: 0.2926, r2: 0.9871 },
  // Mid certified weight against projected area, i.e. the loading trend.
  midWeight: { slope: 7.62, intercept: -70.4 },
  projectedRatio: 0.857,   // projected area / flat area, near constant
};

/**
 * Fit scaling laws to a measured family.
 *
 * @param {object[]} sizes  rows of {flatSpan, flatArea, projectedArea,
 *                          lineLength, totalLineLength, mass, midWeight}
 */
export function fitScalingFamily(sizes) {
  // A size that does not give a figure is left out of that figure's fit.
  //
  // It used to go in as zero. `null` is a number to arithmetic, so a family
  // whose table has no line length at all came back with the law
  // `0 x span + 0` at R2 = 1 — a perfect fit to nothing, which `scaleToArea`
  // then applied, giving a wing with lines 0 m long by the "affine" method.
  // And one blank cell in a column of five bent the other four: BGD's total
  // line length, with no figure for the XS, fitted as 110 m per metre of span.
  const fit = (xsAll, ysAll) => {
    const pairs = xsAll.map((x, i) => [x, ysAll[i]])
      .filter(([x, y]) => typeof x === 'number' && typeof y === 'number'
        && Number.isFinite(x) && Number.isFinite(y));
    const xs = pairs.map((q) => q[0]);
    const ys = pairs.map((q) => q[1]);
    const n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (sxx === 0) return null;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
    const intercept = my - slope * mx;
    const ssRes = ys.reduce((a, y, i) => a + (y - (intercept + slope * xs[i])) ** 2, 0);
    const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
    // `n` goes with the law: two sizes give a line through two points, and
    // an R2 of 1 that says nothing.
    return { slope, intercept, r2: ssTot ? 1 - ssRes / ssTot : 1, n };
  };

  const span = sizes.map((s) => s.flatSpan);
  const flat = sizes.map((s) => s.flatArea);
  const proj = sizes.map((s) => s.projectedArea);

  // Aspect ratio: use the published figure where a family states one, and
  // compute it otherwise. Computing it from published span and area looks
  // inconsistent even when the maker holds it fixed, because span and area
  // are quoted to one decimal — Ozone's Ultralite 5 states 4.56 for all seven
  // sizes but the rounded figures compute anywhere from 4.52 to 4.60. That
  // spread is the rounding, not the design.
  const stated = sizes.map((s) => s.flatAR).filter((v) => v != null);
  const ars = stated.length === sizes.length
    ? stated
    : sizes.map((s) => (s.flatSpan ** 2) / s.flatArea);
  const arSpread = Math.max(...ars) - Math.min(...ars);
  const arFromRounding = stated.length !== sizes.length;

  return {
    source: 'fitted',
    // The range the fit is valid over. Outside it the intercept is being
    // extrapolated, which is where these laws stop beating isometric scaling.
    spanRange: [Math.min(...span), Math.max(...span)],
    areaRange: [Math.min(...flat), Math.max(...flat)],
    sampleCount: sizes.length,
    aspectRatio: ars.reduce((a, b) => a + b, 0) / ars.length,
    // A tighter bound is justified when the maker states the ratio; a looser
    // one when it has to be recovered from rounded span and area.
    aspectRatioConstant: arSpread < (arFromRounding ? 0.12 : 0.02),
    aspectRatioSpread: arSpread,
    aspectRatioFromRounding: arFromRounding,
    lineLength: fit(span, sizes.map((s) => s.lineLength)),
    totalLineLength: fit(span, sizes.map((s) => s.totalLineLength)),
    wingMass: fit(proj, sizes.map((s) => s.mass)),
    midWeight: fit(proj, sizes.map((s) => s.midWeight)),
    projectedRatio: (() => {
      const r = proj.map((p, i) => p / flat[i]).filter((v) => Number.isFinite(v) && v > 0);
      return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
    })(),
    // Exponent of each quantity against the span ratio, as a check that the
    // canopy really is scaling isometrically.
    exponents: {
      flatArea: exponent(span, flat),
      projectedArea: exponent(span, proj),
    },
  };
}

/**
 * Scaling exponent of a quantity against span, by least squares on log-log.
 *
 * The obvious estimator — averaging log(v_i/v_0) / log(s_i/s_0) over the
 * sizes — is badly behaved on published data. Consecutive sizes are close
 * together and makers quote span and area to one decimal, so those ratios are
 * small numbers carrying the full rounding error, and dividing one by the
 * other amplifies it. On the Zeno 2 that estimator returns 1.86 for an area
 * that is scaling as the square of span; the least-squares fit below returns
 * 1.99 from the same figures.
 */
function exponent(span, values) {
  const pts = span.map((s, i) => [Math.log(s), Math.log(values[i])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (sxx === 0) return null;
  return pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
}

/**
 * Scale a design to a target flat area.
 *
 * The canopy is scaled isometrically — every length by k = sqrt(areaRatio), so
 * aspect ratio, chord distribution, arc shape and washin are all preserved.
 * So is the line length, unless laws fitted to this family are handed in:
 * then line length and mass are read off those, inside the range they were
 * fitted over.
 */
export function scaleToArea(base, targetAreaM2, laws = null, {
  outsideRange = 'isometric',
} = {}) {
  // With no fitted laws the only defensible scaling is isometric. Falling back
  // to another family's coefficients would look like more knowledge than there
  // is: the affine slopes vary by a factor of 2.3 between the families
  // measured, so borrowing them is worse than assuming nothing.
  if (!laws) laws = { projectedRatio: base.projectedArea / base.flatArea || 0.86 };
  const k = Math.sqrt(targetAreaM2 / base.flatArea);
  const flatSpan = base.flatSpan * k;

  // Is this target inside the range the laws were fitted over?
  const range = laws.areaRange;
  const inRange = !range || (targetAreaM2 >= range[0] * 0.98 && targetAreaM2 <= range[1] * 1.02);
  const useAffine = inRange || outsideRange === 'affine';

  // A figure the base does not give stays not given. `null * k` is 0, and a
  // size scaled from a table with no line length came back with lines 0 m
  // long and a smallest chord of 0 m.
  const times = (v, f) => (typeof v === 'number' && Number.isFinite(v) ? v * f : null);

  const lineLength = (laws.lineLength && useAffine)
    ? laws.lineLength.slope * flatSpan + laws.lineLength.intercept
    : times(base.lineLength, k);

  const projectedArea = targetAreaM2 * (laws.projectedRatio ?? 0.86);

  const mass = (laws.wingMass && useAffine)
    ? laws.wingMass.slope * projectedArea + laws.wingMass.intercept
    : times(base.mass, k * k);

  return {
    scaleFactor: k,
    flatArea: targetAreaM2,
    flatSpan,
    projectedArea,
    projectedSpan: base.projectedSpan ? base.projectedSpan * k : null,
    aspectRatio: (flatSpan * flatSpan) / targetAreaM2,
    maxChord: times(base.maxChord, k),
    minChord: times(base.minChord, k),
    lineLength,
    totalLineLength: (laws.totalLineLength && useAffine)
      ? laws.totalLineLength.slope * flatSpan + laws.totalLineLength.intercept
      : (base.totalLineLength != null ? base.totalLineLength * k : null),
    inFittedRange: inRange,
    // The label must reflect what was actually used. With no fitted laws the
    // affine branch has nothing to apply and every quantity falls back to the
    // scale factor, so calling that 'affine' would misreport it.
    //
    // And it is 'affine' where ANY fitted law was applied. A family whose
    // table gives totals and masses but no line length has two laws, not
    // three, and both of them are used.
    method: (useAffine && (laws.lineLength || laws.totalLineLength || laws.wingMass))
      ? 'affine' : 'isometric',
    methods: {
      lineLength: (laws.lineLength && useAffine) ? 'affine' : 'isometric',
      totalLineLength: (laws.totalLineLength && useAffine) ? 'affine' : 'isometric',
      mass: (laws.wingMass && useAffine) ? 'affine' : 'isometric',
    },
    lawsSource: laws.source
      || ((laws.lineLength || laws.totalLineLength || laws.wingMass) ? 'fitted' : 'none — isometric'),
    mass,
    midWeight: laws.midWeight
      ? laws.midWeight.slope * projectedArea + laws.midWeight.intercept
      : null,
    // What isometric scaling would have given, for comparison. The gap is the
    // reason this module exists.
    isometric: {
      lineLength: times(base.lineLength, k),
      mass: times(base.mass, k * k),
      lineLengthErrorPct: (times(base.lineLength, k) != null && lineLength)
        ? 100 * ((base.lineLength * k) / lineLength - 1) : null,
    },
  };
}

/** Generate a whole family from one design and a list of target areas. */
export function generateFamily(base, targetAreas, laws = null) {
  return targetAreas.map((a) => ({ targetArea: a, ...scaleToArea(base, a, laws) }));
}

/**
 * Scale the design inputs this project's planform builder takes.
 * Every length multiplies by k; nothing else changes, which is what keeps the
 * shape identical across a family.
 */
export function scaleDesignInputs(inputs, k) {
  return {
    ...inputs,
    span: inputs.span * k,
    rootChord: inputs.rootChord * k,
    tipChord: inputs.tipChord * k,
    tipSweep: inputs.tipSweep * k,
    // Ellipticity, cell count and arc ratios are shape, not size.
  };
}

/**
 * Compare a generated family against a measured one, size by size.
 * Reports the worst relative error in each quantity, which is the number that
 * says whether the laws transfer to another manufacturer's family.
 */
export function compareFamily(predicted, measured) {
  const keys = ['flatSpan', 'projectedArea', 'lineLength', 'totalLineLength', 'mass'];
  const errors = {};
  for (const key of keys) {
    const es = [];
    for (let i = 0; i < measured.length; i++) {
      const m = measured[i][key];
      const p = predicted[i]?.[key];
      if (m == null || p == null) continue;
      es.push(Math.abs(p - m) / m);
    }
    if (es.length) {
      errors[key] = {
        worstPct: Math.max(...es) * 100,
        meanPct: (es.reduce((a, b) => a + b, 0) / es.length) * 100,
      };
    }
  }
  return errors;
}

/**
 * Wing loading across a family, at the middle of each certified weight range.
 * Reported because it is not constant — a family is a set of related wings
 * flown at different loadings, not one wing in several sizes.
 */
export function loadingTrend(sizes) {
  return sizes.map((s) => ({
    name: s.name,
    projectedArea: s.projectedArea,
    midWeight: s.midWeight,
    loading: s.midWeight != null ? s.midWeight / s.projectedArea : null,
  }));
}

/** Read a size table in the reference TSV layout (parameters as rows). */
export function parseSizeTable(tsv) {
  const rows = {};
  for (const line of tsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    rows[f[0]] = f.slice(1);
  }
  const names = rows.size || [];
  const num = (key, i) => {
    const cell = (rows[key]?.[i] ?? '').trim();
    if (cell === '' || cell === '-') return null;   // not given, and not zero
    const v = Number(cell);
    return Number.isFinite(v) ? v : null;
  };
  return names.map((name, i) => {
    const range = (rows.weight_range_kg?.[i] || '').split('-').map(Number);
    return {
      name,
      label: rows.area_label?.[i],
      cells: num('cells', i),
      flatSpan: num('flat_span_m', i),
      flatArea: num('flat_area_m2', i),
      projectedSpan: num('projected_span_m', i),
      projectedArea: num('projected_area_m2', i),
      lineLength: num('line_length_m', i),
      totalLineLength: num('total_line_length_m', i),
      maxChord: num('max_chord_m', i),
      minChord: num('min_chord_m', i),
      mass: num('weight_kg', i),
      weightRange: range.length === 2 && range.every(Number.isFinite) ? range : null,
      midWeight: range.length === 2 && range.every(Number.isFinite)
        ? (range[0] + range[1]) / 2 : null,
      riserLengthMM: num('riser_length_mm', i),
      speedwayMM: num('speedway_mm', i),
    };
  });
}

/** Read the multi-family reference table. */
export function parseSizeFamilies(tsv) {
  // Comment lines are skipped, not parsed as data.
  //
  // `docs/collecting-reference-data.md` requires a provenance header on every
  // file — where the numbers came from, what convention they use, when they
  // were retrieved. The parser had no way to read a file that followed its
  // own instructions, because the one file that existed carried no comments.
  const lines = tsv.split(/\r?\n/)
    .filter((l) => l.trim() && !l.trimStart().startsWith('#'));
  const head = lines[0].split('\t');
  const idx = (k) => head.indexOf(k);
  const out = {};
  for (const line of lines.slice(1)) {
    const f = line.split('\t');
    // A blank cell is a figure that was not given, and `Number('')` is 0.
    // Every blank in this table used to be read as zero: PHI's line pieces,
    // which nobody has counted, came back as none.
    const n = (k) => {
      const cell = (f[idx(k)] ?? '').trim();
      if (cell === '' || cell === '-') return null;
      const v = Number(cell);
      return Number.isFinite(v) ? v : null;
    };
    const fam = f[idx('family')];
    (out[fam] ||= []).push({
      name: f[idx('size')],
      cells: n('cells'),
      flatSpan: n('flat_span_m'),
      flatArea: n('flat_area_m2'),
      flatAR: n('flat_AR'),
      projectedSpan: n('proj_span_m'),
      projectedArea: n('proj_area_m2'),
      // The projected aspect ratio, where a maker publishes it and not the
      // projected span (Niviuk): with the projected area it is the span.
      projectedAR: n('proj_AR'),
      maxChord: n('root_chord_m'),
      minChord: null,
      mass: n('mass_kg'),
      midWeight: n('weight_lo_kg') != null && n('weight_hi_kg') != null
        ? (n('weight_lo_kg') + n('weight_hi_kg')) / 2 : null,
      totalLineLength: n('total_line_m'),
      linePieces: n('line_pieces'),
      lineLength: null,
      application: f[idx('application')] || null,
      certification: f[idx('certification')] || null,
      aspectClass: f[idx('aspect_class')] || null,
    });
  }
  return out;
}

/**
 * Cross-check a set of laws against a family they were not fitted to.
 * The point of this is to make the non-transferability measurable rather than
 * a claim: it returns how far the borrowed laws land.
 */
export function crossFamilyError(laws, family) {
  const base = family[0];
  const errs = [];
  for (const size of family.slice(1)) {
    const p = scaleToArea(base, size.flatArea, laws, { outsideRange: 'affine' });
    if (size.totalLineLength && p.totalLineLength) {
      errs.push(Math.abs(p.totalLineLength - size.totalLineLength) / size.totalLineLength);
    }
  }
  return errs.length
    ? { worstPct: Math.max(...errs) * 100, meanPct: (errs.reduce((a, b) => a + b, 0) / errs.length) * 100 }
    : null;
}

/* ------------------------------------------------------- application class -- */

/**
 * A wing's application, and why comparisons must respect it.
 *
 * Comparing a hike-and-fly wing with a competition wing and calling the
 * difference a scaling-law failure is a category error. These wings are built
 * to different briefs, and almost every ratio that looks like a "law" tracks
 * the brief:
 *
 *   wing              application     cert   AR    cells  line m/m^2
 *   Ozone Ultralite 5 hike and fly    A/B    4.56    34      13.8
 *   Ozone Geo 7       progression     B      5.16    48      10.2
 *   PHI Allegro light performance XC  C      6.03    72      10.3
 *   Ozone Zeno 2      competition     D      6.90    78       8.3
 *
 * Line length per square metre falls by 40% from the mountain wing to the
 * competition wing, and cell count more than doubles. A low aspect ratio is
 * not a worse wing; it is the right answer to a launch in a col with a pack
 * on your back.
 *
 * ---------------------------------------------------------------------------
 * What the numbers do and do not support
 * ---------------------------------------------------------------------------
 * The total-line-length slope correlates with aspect ratio at r = -0.97 over
 * four families. It also correlates with mean span at r = -0.99, and the two
 * are confounded — a higher aspect ratio means a longer span at the same area.
 * With four families there is no separating them, so no causal law is claimed
 * here. What is claimed, and is enough to be useful, is that the families are
 * not interchangeable and a comparison should say which brief it is holding
 * fixed.
 */
export const APPLICATIONS = {
  'hike and fly': {
    order: 1,
    typicalAR: [4.0, 5.2],
    brief: 'Minimum weight and pack volume; short launches at altitude with a load.',
    reads: 'Low aspect ratio and few cells are the design answer, not a compromise.',
  },
  progression: {
    order: 2,
    typicalAR: [4.8, 5.6],
    brief: 'Passive safety with enough performance for a pilot building hours.',
    reads: 'Moderate everything; the wing has to forgive.',
  },
  sport: {
    order: 3,
    typicalAR: [5.4, 6.0],
    brief: 'The step after a progression wing: more performance, still forgiving.',
    reads: 'Aspect ratio and cell count rise; line count usually rises with them.',
  },
  'performance XC': {
    order: 4,
    typicalAR: [5.8, 6.5],
    brief: 'Flying far. Glide and speed matter more than damping.',
    reads: 'Line drag is now a first-order cost, so line length per m^2 falls.',
  },
  competition: {
    order: 5,
    typicalAR: [6.5, 7.5],
    brief: 'Maximum glide and speed for pilots with the skill to fly it.',
    reads: 'Highest aspect ratio and cell count, least line per m^2, two risers.',
  },
};

/** Best-guess application from the numbers, when it is not stated. */
export function classifyApplication({ aspectRatio, cells = null, certification = null }) {
  if (certification) {
    const c = String(certification).toUpperCase();
    if (c.startsWith('D')) return 'competition';
  }
  let best = null;
  for (const [name, spec] of Object.entries(APPLICATIONS)) {
    const [lo, hi] = spec.typicalAR;
    const mid = (lo + hi) / 2;
    const inside = aspectRatio >= lo && aspectRatio <= hi;
    const d = Math.abs(aspectRatio - mid) - (inside ? 10 : 0);
    if (!best || d < best.d) best = { name, d, inside };
  }
  return best.name;
}

/**
 * Whether two wings are a fair comparison, and what to hold fixed if not.
 *
 * This does not refuse to compare — sometimes the cross-category comparison is
 * exactly the question. It says plainly what differs, so a difference is not
 * read as a defect in one of them.
 */
export function compareApplications(a, b) {
  const appA = a.application || classifyApplication(a);
  const appB = b.application || classifyApplication(b);
  const same = appA === appB;
  const oA = APPLICATIONS[appA]?.order ?? 0;
  const oB = APPLICATIONS[appB]?.order ?? 0;

  const notes = [];
  if (!same) {
    notes.push(`Different applications: ${appA} vs ${appB}.`);
    notes.push(`${appA}: ${APPLICATIONS[appA]?.brief ?? 'unknown brief'}`);
    notes.push(`${appB}: ${APPLICATIONS[appB]?.brief ?? 'unknown brief'}`);
    notes.push('Differences in aspect ratio, cell count and line length follow '
      + 'from the brief and should not be read as one wing being better built.');
  }
  return {
    applicationA: appA,
    applicationB: appB,
    comparable: same,
    categoryGap: Math.abs(oA - oB),
    notes,
  };
}

/**
 * Metrics normalised so wings of different size can be set side by side.
 * Absolute line length says mostly how big a wing is; per square metre says
 * something about how it was designed.
 */
export function normalisedMetrics(size) {
  const area = size.flatArea;
  return {
    lineLengthPerM2: size.totalLineLength != null ? size.totalLineLength / area : null,
    linePiecesPerM2: size.linePieces != null ? size.linePieces / area : null,
    cellsPerMetreSpan: size.cells != null ? size.cells / size.flatSpan : null,
    massPerM2: size.mass != null ? size.mass / area : null,
    loadingAtMid: size.midWeight != null && size.projectedArea
      ? size.midWeight / size.projectedArea : null,
    aspectRatio: size.flatAR ?? (size.flatSpan ** 2) / area,
  };
}

/**
 * Compare families like for like, reporting normalised metrics and flagging
 * cross-application comparisons rather than silently making them.
 */
export function compareFamilies(families) {
  const rows = [];
  for (const [name, sizes] of Object.entries(families)) {
    const mid = sizes[Math.floor(sizes.length / 2)];
    rows.push({
      family: name,
      application: mid.application || classifyApplication({
        aspectRatio: mid.flatAR, cells: mid.cells, certification: mid.certification,
      }),
      certification: mid.certification || null,
      sizes: sizes.length,
      ...normalisedMetrics(mid),
    });
  }
  rows.sort((a, b) => (APPLICATIONS[a.application]?.order ?? 0)
    - (APPLICATIONS[b.application]?.order ?? 0));
  const apps = new Set(rows.map((r) => r.application));
  return {
    rows,
    singleApplication: apps.size === 1,
    warning: apps.size > 1
      ? 'These wings serve different applications; normalised metrics differ by design.'
      : null,
  };
}

/* ------------------------------------------------------------- loading -- */

/**
 * Wing loading against aspect ratio.
 *
 * Loading rises with aspect ratio — but only across the mainstream
 * progression, and the exception is instructive.
 *
 * Loading at the middle of the certified weight range, on projected area,
 * averaged over the sizes of each family in `size-families.tsv`:
 *
 *   wing                application      AR    mid    top of range
 *   Ozone Ultralite 5   hike and fly    4.56   4.93       6.17
 *   Ozone Geo 7         progression     5.16   3.87       4.31
 *   PHI Allegro light   performance XC  6.03   4.22       4.74
 *   Ozone Alpina 5      performance XC  6.07   4.49       5.00
 *   BGD Lynx 2          performance XC  6.20   4.45       4.91
 *   Skywalk SAGE        performance XC  6.40   4.33       4.85
 *   Ozone Zeno 2        competition     6.90   4.95       5.36
 *
 * Across all seven the correlation is **r = +0.11** — nothing. Drop the
 * hike-and-fly wing and it is **r = +0.92** across the six that are left.
 *
 * The mountain wing is not noise, it is a different brief. A small wing flown
 * heavily is more stable, penetrates better and packs smaller, so the
 * Ultralite 5's 13 m² sits at 6.4 kg/m² at mid range — the highest loading
 * here on the lowest aspect ratio. That is a deliberate choice about how the
 * wing is used, not a consequence of its planform.
 *
 * So the fit below covers progression through competition, and hike-and-fly
 * wings are excluded by design rather than by trimming an outlier.
 *
 * What the trend is good for. It gives the level of a FAMILY to 5%: the six
 * family means lie within 4.6% of the line. It does not give a SIZE. Makers
 * load the large sizes of a family harder than the small ones — the Allegro
 * light runs from 3.57 to 4.80 kg/m² on one aspect ratio — so a single size
 * is as far as 17% from the line that its family sits on.
 *
 * This once read "r = +0.99, one of the cleanest trends in this whole
 * dataset". That was three families, which is one more point than a straight
 * line needs, and its table gave the Zeno 2 as 4.85 where the file gives
 * 4.95. The suite now refits the line from the file and compares.
 */
export const LOADING_VS_AR = {
  slope: 0.573,
  intercept: 0.873,
  appliesTo: ['progression', 'sport', 'performance XC', 'competition'],
  excludes: ['hike and fly'],
  basis: 'middle of certified weight range, projected area, mean over the sizes of a family',
  r: 0.923,
  sampleFamilies: 6,
  // The worst of the six family means, and the worst single size.
  worstFamilyErrorPct: 4.6,
  worstSizeErrorPct: 17.4,
};

/** Expected loading for an aspect ratio, or null where the trend does not apply. */
export function expectedLoading(aspectRatio, application = null) {
  if (application && LOADING_VS_AR.excludes.includes(application)) return null;
  return LOADING_VS_AR.slope * aspectRatio + LOADING_VS_AR.intercept;
}

/**
 * Compare a family's actual loading against the trend for its aspect ratio.
 * A wing far above the line is being flown harder than its planform alone
 * would suggest, which for a mountain wing is the point.
 */
export function loadingCheck(sizes) {
  const out = [];
  for (const s of sizes) {
    if (s.midWeight == null || !s.projectedArea) continue;
    const ar = s.flatAR ?? (s.flatSpan ** 2) / s.flatArea;
    const actual = s.midWeight / s.projectedArea;
    const app = s.application || classifyApplication({ aspectRatio: ar, cells: s.cells });
    const expected = expectedLoading(ar, app);
    out.push({
      name: s.name,
      application: app,
      aspectRatio: ar,
      actualLoading: actual,
      expectedLoading: expected,
      deltaPct: expected ? ((actual / expected) - 1) * 100 : null,
      trendApplies: expected != null,
    });
  }
  return out;
}

/* -------------------------------------------------- line length from AR -- */

/**
 * Total line length from aspect ratio and span.
 *
 * The raw affine law — total line length against span — does not transfer
 * between families: its slope runs from 16.2 on a competition wing to 36.6 on
 * a mountain wing and 42.5 on BGD's Lynx 2. That was recorded earlier as a
 * flat "coefficients do not transfer", with the reason unresolved because
 * aspect ratio and span are confounded at r = +0.91: a higher aspect ratio
 * means a longer span at the same area.
 *
 * Five families separate them — four of Ozone's and one of PHI's.
 *
 * **Aspect ratio has an effect independent of span.** Geo 7 and Allegro light
 * are both three-liners with mean spans 5% apart. The Allegro's aspect ratio
 * is 17% higher, and it carries 9% less line per metre of span. Span cannot
 * explain that.
 *
 * **Riser count looked as if it had one too, and does not.** Allegro light and
 * Alpina 5 have near-identical aspect ratios (6.03 and 6.07) and spans, and
 * the Alpina, a two-liner, carries 10% less line per metre of span. One pair
 * is one pair: see `twoLinerFactor` below.
 *
 * Normalising by span removes the dominant size effect and leaves a quantity
 * that does transfer:
 *
 *     line metres per metre of span  =  -5.12 * AR + 50.72        R^2 = 0.95
 *
 *   wing              AR    actual   fitted
 *   Ozone Ultralite 5 4.56   28.2     27.4
 *   Ozone Geo 7       5.16   23.0     24.3
 *   PHI Allegro light 6.03   21.0     19.8
 *   Ozone Alpina 5    6.07   18.9     19.6
 *   Ozone Zeno 2      6.90   15.5     15.4
 *
 * ("actual" is the mean over a family's sizes; the line is fitted to those
 * five means.)
 *
 * Predicting a family's total line length from aspect ratio and span alone
 * lands within **6.2%** at the middle size of each of the five and within
 * **7.4%** at every size of them — two- and three-line wings over a range of
 * more than 2:1 in area. That is the first line-length estimate in this
 * project that survives leaving the family it was fitted to.
 *
 * ---------------------------------------------------------------------------
 * Out of sample
 * ---------------------------------------------------------------------------
 * Two families were not in the fit, from two more makers.
 *
 *   Skywalk SAGE   five sizes   within 0.8% at every one
 *   BGD Lynx 2     four sizes   6.6 to 7.5% under at every one
 *
 * The Lynx 2 is a 2.5-liner — three rows in the middle and two at the tips —
 * and it carries more line than the law gives a wing of its aspect ratio, by
 * about the same at every size. So the law has now been 7.4% out inside its
 * own sample and 7.5% out of it.
 *
 * ---------------------------------------------------------------------------
 * A limit that was not one
 * ---------------------------------------------------------------------------
 * This block used to say the law lands "within 1% on the smallest Lynx 2 and
 * 16% out on the largest", and that the reason is a hidden assumption: "BGD
 * scales its lineset with AREA", exponent 2.03, "a design decision at the
 * manufacturer level".
 *
 * It was measured against the "Total line length" in BGD's specification
 * table — 209, 226, 247, 268, 290 m. That row is 10.7 m for every square
 * metre of flat area at all five sizes, so it does go with area. It is not
 * the lineset. BGD's own production line sheets are in `data/reference`, with
 * the same 121 lines a side at every size, and they add up to
 *
 *             S        M        ML       L
 *   sheet     229.7    241.6    252.4    262.7 m
 *   ratio     0.951    1        1.045    1.088      BGD's factor: 0.96 1 1.04 1.08
 *   table     226      247      268      290 m
 *
 * — the linear factor BGD state, at every level of the cascade, like the line
 * height BGD publish in the same table (6.7 to 7.9 m). The table's total is
 * its M figure multiplied by the ratio of the flat areas, to the metre. No
 * lineset of a fixed number of lines can go with area while its height goes
 * with span, and that should have been the first thing asked of an exponent
 * of 2.
 *
 * Fitting the exponent of total line length against span, per family:
 *
 *   Ozone Ultralite 5   1.30      Ozone Alpina 5   1.06
 *   Ozone Geo 7         1.15      Ozone Zeno 2     1.04
 *   PHI Allegro light   1.02      Skywalk SAGE     1.05
 *                                 BGD Lynx 2       1.08
 *
 * All seven are a little over 1, for the reason in the header of this file:
 * the riser does not scale and the height does.
 *
 * `lineConsumptionEstimate` still takes an exponent and a reference size,
 * and `lineLengthExponent` still fits one from a family's own sizes — it is
 * how to carry a measured size to its neighbours. Nothing in the data asks
 * for an exponent near 2.
 *
 * ---------------------------------------------------------------------------
 * Two further caveats. Five families is a small sample for a two-parameter
 * fit, and four of the five are one maker's. And the riser-count correction
 * is withdrawn: Skywalk's SAGE, a two-liner at AR 6.4 that was not in the
 * fit, lands within 0.8% of the uncorrected line at every size, where a
 * factor of 0.90 would put it 9% low. Over the three two-liners now in the
 * file the mean residual is -1.2%, and over the three three-liners +1.1%.
 */
export const LINE_LENGTH_PER_SPAN = {
  slope: -5.120,
  intercept: 50.72,
  r2: 0.951,
  // Inside the five fitted families: the worst at a family's middle size, and
  // the worst at any size (the largest Ultralite 5).
  worstFamilyErrorPct: 6.2,
  worstSizeErrorPct: 7.4,
  sampleFamilies: 5,
  // Ozone, four families, and PHI, one.
  sampleManufacturers: 2,
  arRange: [4.56, 6.90],
  // The families that were not in the fit, and the worst the law does on any
  // size of each.
  outOfSample: [
    { family: 'Skywalk SAGE', sizes: 5, worstErrorPct: 0.8 },
    { family: 'BGD Lynx 2', sizes: 4, worstErrorPct: 7.5 },
  ],
  worstOutOfSampleErrorPct: 7.5,
  // Every family measured scales its lineset with span, near enough: the
  // exponent runs from 1.02 to 1.30.
  assumesSpanScaling: true,
  // Refuted out of sample: see the note above. Left at 1 so it is inert, with
  // the measured value recorded beside it.
  twoLinerFactor: 1.0,
  twoLinerFactorRefuted: 0.90,
  twoLinerEvidence: 'Alpina 5 vs Allegro light suggested 0.90; Skywalk SAGE, '
    + 'a two-liner at AR 6.4, matches the uncorrected law and rejects it.',
};

/** Line metres per metre of span, for an aspect ratio. */
export function lineLengthPerSpan(aspectRatio, { risers = 3 } = {}) {
  const k = LINE_LENGTH_PER_SPAN.slope * aspectRatio + LINE_LENGTH_PER_SPAN.intercept;
  return risers <= 2 ? k * LINE_LENGTH_PER_SPAN.twoLinerFactor : k;
}

/**
 * Estimated total line length for a wing, from aspect ratio and span.
 * `outsideRange` reports whether the aspect ratio sits inside the range the
 * law was fitted over, since extrapolating a two-point-per-family fit is
 * exactly the mistake the previous phase made.
 */
/**
 * Note on the name. This estimates a *whole lineset's* consumption from the
 * aspect-ratio law — how many metres of line to order. It is not
 * `totalLineLength` in risers.js, which is the PMA measurement of one line
 * from sail to harness. Two different quantities, similar names, and the
 * second was nearly reimplemented as the first.
 */
export function lineConsumptionEstimate({
  aspectRatio, flatSpan, risers = 3,
  // Reference size and exponent, for families that do not scale with span.
  referenceSpan = null, exponent = 1,
}) {
  const [lo, hi] = LINE_LENGTH_PER_SPAN.arRange;
  const perSpan = lineLengthPerSpan(aspectRatio, { risers });

  // The plain law is total = k * span, which is the exponent-1 case. Given a
  // reference size and a fitted exponent, scale from the reference instead:
  // a family whose cord goes as span to the 1.3 is otherwise about 5% out at
  // the ends of its range, in opposite directions.
  const base = referenceSpan ?? flatSpan;
  const total = perSpan * base * ((flatSpan / base) ** exponent);

  return {
    perSpan,
    totalLineLengthM: total,
    exponent,
    inFittedRange: aspectRatio >= lo && aspectRatio <= hi,
    // The worst the law does at any size of the families it was fitted to.
    // Out of sample it has done better (0.8%) and as badly (7.5%).
    expectedErrorPct: exponent === 1
      ? LINE_LENGTH_PER_SPAN.worstSizeErrorPct
      : null,
  };
}

/**
 * Fit how a family's total line length scales, as an exponent against span.
 *
 * Near 1 the lineset scales with span; near 2 it would scale with area. Every
 * family measured from its line sheets is between 1.02 and 1.30. A published
 * "total line length" can come out near 2 — BGD's does, 2.03 — and that says
 * how the table was filled in, not how the lines were cut: see the note on
 * `LINE_LENGTH_PER_SPAN`. `regime` is kept so that an exponent near 2 is
 * named for what it would mean, and a caller who gets 'area' should go and
 * look at where the totals came from.
 */
export function lineLengthExponent(sizes) {
  const pts = sizes
    .filter((s) => s.totalLineLength && s.flatSpan)
    .map((s) => [Math.log(s.flatSpan), Math.log(s.totalLineLength)]);
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (sxx === 0) return null;
  const exponent = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return {
    exponent,
    regime: exponent < 1.5 ? 'span' : 'area',
    sizes: n,
  };
}

/* ------------------------------------------------- scaling a lineset -- */

/**
 * Ozone's own scaling rule, stated on the Enzo 3 CCC check sheet:
 *
 *   "Reference Line Length of Self-Certified sizes must stay within +/-20mm
 *    of the scaled XXS Reference Line Length. Risers are not scaled."
 *
 * Two claims, and both settle questions this project had left open.
 *
 * **Lines scale proportionally.** Not affinely — multiply every reference
 * length by the size's scale ratio and it lands on that size's reference
 * within 20 mm. On their own numbers the worst deviation is 8.8 mm and the
 * mean is 2.7 mm.
 *
 * **Risers do not scale.** Skywalk quotes "middle line length *without*
 * risers", and that quantity scales proportionally to within 7 mm across five
 * sizes. Ozone's sheets for the Geo 7 and the Ultralite 5 give the length of
 * every line path *with* its riser, and the riser those imply is the same on
 * sizes whose lines differ by a metre.
 *
 * This comment used to go on: "which explains the intercept in the affine
 * line-length law. PHI's family fits a non-scaling part of about 895 mm
 * against a published riser of 570-600 mm, so the riser explains most of its
 * intercept". PHI's fixed part is one size. See `splitFixedAndScaling`.
 */
export function scalingCheck({
  referenceLengths, scaledLengths, scaleRatio, toleranceMM = 20,
}) {
  const rows = [];
  const n = Math.min(referenceLengths.length, scaledLengths.length);
  for (let i = 0; i < n; i++) {
    const ref = referenceLengths[i];
    const actual = scaledLengths[i];
    if (ref == null || actual == null) continue;
    const predicted = ref * scaleRatio;
    rows.push({
      index: i + 1,
      referenceMM: ref,
      predictedMM: predicted,
      actualMM: actual,
      deviationMM: predicted - actual,
      withinTolerance: Math.abs(predicted - actual) <= toleranceMM,
    });
  }
  const devs = rows.map((r) => Math.abs(r.deviationMM));
  return {
    rows,
    scaleRatio,
    toleranceMM,
    worstMM: devs.length ? Math.max(...devs) : 0,
    meanMM: devs.length ? devs.reduce((a, b) => a + b, 0) / devs.length : 0,
    passes: rows.every((r) => r.withinTolerance),
    failures: rows.filter((r) => !r.withinTolerance),
  };
}

/**
 * Split a quoted line length into the part that goes with span and the part
 * that does not — and say whether that split rests on one size.
 *
 * Least squares over the sizes, and then the same fit with each size left out
 * in turn. `restsOn` is the index of a size whose absence takes away more
 * than half of the fixed part, or null.
 *
 * It is there because of what the first version of this did with PHI's six
 * line lengths. It drew its line through the FIRST size and searched for the
 * fixed part that fitted the rest best, found 0.945 m, and the suite recorded
 * "a length quoted with risers does need a fixed part" against a riser of
 * 570 to 600 mm. The first size is PHI's XS, which is 98 mm longer than the
 * other five would make it. Leave it out and they lie within 5 mm of a line
 * through the origin: fixed part -0.02 m. A fit that is made to pass through
 * one point reports that point.
 */
export function splitFixedAndScaling(spans, lengths) {
  const fitOf = (xs, ys) => {
    const n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (sxx === 0) return null;
    const perSpan = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
    const fixedM = my - perSpan * mx;
    const worstM = Math.max(...xs.map((x, i) => Math.abs(fixedM + perSpan * x - ys[i])));
    return { fixedM, perSpan, worstM };
  };
  const pairs = spans.map((x, i) => [x, lengths[i]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const xs = pairs.map((q) => q[0]);
  const ys = pairs.map((q) => q[1]);
  const all = fitOf(xs, ys);
  if (!all) return null;

  // A line through the origin, for comparison: what "it all scales" misses by.
  const k0 = xs.reduce((a, x, i) => a + x * ys[i], 0) / xs.reduce((a, x) => a + x * x, 0);
  const proportionalWorstM = Math.max(...xs.map((x, i) => Math.abs(k0 * x - ys[i])));

  const leaveOneOut = xs.length >= 4
    ? xs.map((_, i) => ({
      dropped: i,
      ...fitOf(xs.filter((__, j) => j !== i), ys.filter((__, j) => j !== i)),
    }))
    : [];
  let restsOn = null;
  for (const l of leaveOneOut) {
    if (Math.abs(all.fixedM) > 0.05 && Math.abs(l.fixedM) < Math.abs(all.fixedM) / 2) {
      if (restsOn == null
        || Math.abs(l.fixedM) < Math.abs(leaveOneOut[restsOn].fixedM)) restsOn = l.dropped;
    }
  }
  return {
    ...all,
    proportional: { perSpan: k0, worstM: proportionalWorstM },
    leaveOneOut,
    restsOn,
    withoutIt: restsOn != null ? leaveOneOut[restsOn] : null,
  };
}

/**
 * Residuals of the line-length law, by family.
 *
 * The law explains most of the variation between families, and what is left
 * over is where the remaining questions live. Two of them were left open:
 * why the Alpina 5 and the Allegro light differ by 10% at near-identical
 * aspect ratio, and whether riser count matters at all after the SAGE
 * refuted the 10% two-liner factor.
 *
 * Residuals are reported rather than the raw quantity because the raw
 * quantity is dominated by aspect ratio, which is already accounted for. A
 * 21.0 against an 18.9 looks like a large difference until the law says one
 * wing should be at 19.85 and the other at 19.64.
 */
export function lineLengthResiduals(families) {
  const rows = [];
  for (const [name, sizes] of Object.entries(families)) {
    const withLines = sizes.filter((s) => s.totalLineLength && s.flatSpan);
    if (!withLines.length) continue;
    const ar = withLines[0].flatAR ?? (withLines[0].flatSpan ** 2) / withLines[0].flatArea;
    const actual = withLines.reduce((a, s) => a + s.totalLineLength / s.flatSpan, 0)
      / withLines.length;
    const predicted = LINE_LENGTH_PER_SPAN.slope * ar + LINE_LENGTH_PER_SPAN.intercept;
    rows.push({
      family: name,
      aspectRatio: ar,
      cells: withLines[0].cells ?? null,
      cellsPerMetre: withLines[0].cells
        ? withLines.reduce((a, s) => a + s.cells / s.flatSpan, 0) / withLines.length : null,
      actualPerSpan: actual,
      predictedPerSpan: predicted,
      residualPct: ((actual / predicted) - 1) * 100,
    });
  }
  rows.sort((a, b) => a.aspectRatio - b.aspectRatio);

  const res = rows.map((r) => Math.abs(r.residualPct));
  return {
    rows,
    worstPct: res.length ? Math.max(...res) : 0,
    meanAbsPct: res.length ? res.reduce((a, b) => a + b, 0) / res.length : 0,
    outlier: rows.length
      ? rows.reduce((m, r) => (Math.abs(r.residualPct) > Math.abs(m.residualPct) ? r : m), rows[0])
      : null,
  };
}

/** Simple Pearson correlation, and a partial correlation controlling for z. */
export function correlate(x, y) {
  const n = x.length;
  if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const sxy = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0);
  const sxx = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  const syy = y.reduce((a, v) => a + (v - my) ** 2, 0);
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

export function partialCorrelate(x, y, z) {
  const rxy = correlate(x, y);
  const rxz = correlate(x, z);
  const ryz = correlate(y, z);
  if (rxy == null || rxz == null || ryz == null) return null;
  const denom = Math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2));
  return denom ? (rxy - rxz * ryz) / denom : null;
}

/* ------------------------------------------------- reference wings -- */

/**
 * Turn a reference size into design inputs.
 *
 * Seven families of published data have been sitting in `data/reference` used
 * only for validation. They are also the most useful thing a designer can
 * start from: a set of numbers known to have produced a wing that flies,
 * rather than a blank form.
 *
 * What can be recovered honestly is limited, and the limit is worth stating
 * rather than papering over. A specification gives area, span, aspect ratio,
 * root chord and cell count. It does not give the **shape** — how elliptical
 * the leading edge is, how the trailing edge is swept, what the arc is, what
 * section it uses. Those are the design.
 *
 * So this returns the published numbers with the shape parameters left at
 * neutral defaults, and says which is which. A wing loaded this way has the
 * right size and the wrong shape, and `derived` names every field that was
 * not in the source.
 */
export function referenceDesignInputs(size, { tipChordFraction = 0.22, solveTipToArea = true } = {}) {
  if (!size || !size.flatSpan || !size.flatArea) return null;

  // Tip chord is not published, and the flat area is. With the span, the
  // root chord and the shape defaults fixed, the tip is the one free
  // dimension, so it is solved to the published area.
  //
  // It was 22% of the root, and the wing built from it came out 1.1 to 4.1%
  // short of its published area on the 38 sizes of `size-families.tsv` and
  // 1.7 to 6.9% on Niviuk's 17 (a Skin 4 P 14 at 13.0 m2 against 14.0). The
  // interface's picker solved it and this did not, so the same wing had two
  // outlines: the picker's, at its own area, and the one the full-pipeline
  // validation ran on.
  const rootChord = size.maxChord ?? (size.flatArea / size.flatSpan) * 1.18;
  const shape = {
    tipSweep: rootChord * 0.55,
    ellipticityLE: 0.85,
    ellipticityTE: 0.55,
  };
  let tipChord = size.minChord ?? rootChord * tipChordFraction;
  let tipChordBasis = size.minChord ? 'published' : `assumed at ${tipChordFraction} of the root`;
  if (!size.minChord && solveTipToArea) {
    const areaFor = (tip) => planformMetrics(planformFromDesignInputs({
      span: size.flatSpan, rootChord, tipChord: tip, ...shape,
    })).area;
    let lo = 0.05 * rootChord;
    let hi = 0.8 * rootChord;
    if (size.flatArea >= areaFor(lo) && size.flatArea <= areaFor(hi)) {
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (areaFor(mid) < size.flatArea) lo = mid; else hi = mid;
      }
      tipChord = Math.round(((lo + hi) / 2) * 1000) / 1000;
      tipChordBasis = 'solved to the published area';
    }
  }

  // Span ratio, which is what the arc is built from.
  //
  // This was the square root of the *area* ratio, and the two are not
  // related that way. An arc shortens the span; it also loses the cosine of
  // the local dihedral from the projected area, and those are different
  // losses. On the PHI Allegro light the published span ratio is 0.794 and
  // the square-rooted area ratio is 0.926 — 19.5% out at worst, on every
  // wing in the database, which the full-pipeline run caught on all 38.
  //
  // Niviuk publish the projected area and the projected aspect ratio, not
  // the span, and the span is what those two define: b = √(AR·S). The area
  // ratio stood in for it, 0.858 on a Hook 6 24 whose own figures give
  // 9.07 m on 11.28, 0.805 — every Niviuk wing a twentieth flatter than it is.
  let projectedRatio = 0.87;
  let projectedSpanBasis = 'assumed: no projected span, aspect ratio or area published';
  if (size.projectedSpan && size.flatSpan) {
    projectedRatio = size.projectedSpan / size.flatSpan;
    projectedSpanBasis = 'published';
  } else if (size.projectedAR && size.projectedArea) {
    projectedRatio = Math.sqrt(size.projectedAR * size.projectedArea) / size.flatSpan;
    projectedSpanBasis = 'from the published projected aspect ratio and area';
  } else if (size.projectedArea && size.flatArea) {
    // The last resort, used directly rather than square-rooted: across this
    // database the area ratio is the closer of the two to the span ratio.
    projectedRatio = size.projectedArea / size.flatArea;
    projectedSpanBasis = 'the projected area ratio, no span published';
  }

  return {
    inputs: {
      span: size.flatSpan,
      rootChord,
      tipChord,
      // Sweep and ellipticity are shape, not size, and are not in any
      // specification. These are neutral starting values.
      ...shape,
    },
    tipChordBasis,
    cells: size.cells ?? 40,
    projectedRatio,
    projectedSpanBasis,
    // The arc: the handbook's ellipse through that projected span. A circle
    // through it projects 51 of the 55 wings on file short of their published
    // projected area, 2.0% out on average; the ellipse is 1.0% out.
    lobe: ellipseForProjectedRatio(Math.min(0.99, Math.max(0.6, projectedRatio))),
    allUpMassKg: size.midWeight ?? null,
    lineLengthM: null,
    published: {
      flatArea: size.flatArea,
      flatSpan: size.flatSpan,
      aspectRatio: size.flatAR,
      projectedArea: size.projectedArea,
      cells: size.cells,
      massKg: size.mass,
      weightRange: size.midWeight,
    },
    // Everything below was not in the specification and had to be chosen.
    derived: [
      size.minChord ? null : 'tip chord',
      'tip sweep', 'leading edge ellipticity', 'trailing edge ellipticity',
      'aerofoil section', 'arc shape (an ellipse through the projected span)', 'washin',
    ].filter(Boolean),
    note: 'size from the published specification; shape is a neutral default',
  };
}

/**
 * The reference library, as a flat list a picker can show.
 * Sorted by application then area, which is how a designer looks for one.
 */
export function referenceLibrary(families) {
  const out = [];
  for (const [family, sizes] of Object.entries(families)) {
    for (const s of sizes) {
      out.push({
        id: `${family} ${s.name}`,
        family,
        size: s.name,
        application: s.application || null,
        flatArea: s.flatArea,
        flatSpan: s.flatSpan,
        aspectRatio: s.flatAR,
        cells: s.cells,
        source: s,
      });
    }
  }
  out.sort((a, b) => (a.application || '').localeCompare(b.application || '')
    || a.family.localeCompare(b.family) || a.flatArea - b.flatArea);
  return out;
}
