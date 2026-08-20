/* scaling.js — generating a size family from one design.
 *
 * Manufacturers ship a wing in five or six sizes. The naive assumption is that
 * a family is one design scaled: multiply every length by k, areas go as k^2,
 * done. Measured against a real family that is right for the canopy and wrong
 * for everything attached to it.
 *
 * Fitted to PHI's ALLEGRO light across its six sizes (XS 17 m^2 to XL 24 m^2):
 *
 *   flat area      k^1.99      isometric, to measurement error
 *   projected area k^1.96      isometric
 *   maximum chord  k^1.02      isometric
 *   minimum chord  k^0.96      isometric
 *   aspect ratio   constant at 6.03 across every size
 *
 * So the canopy really is scaled. But:
 *
 *   line length    0.566 * span + 0.459 m     R^2 = 0.995
 *   total line     21.46 * span - 5.54 m      R^2 = 0.983
 *   wing weight    0.159 * projected area + 0.293 kg
 *
 * All three are **affine, not proportional** — they have a fixed part that
 * does not scale. Lines are set partly by the pilot's geometry and by
 * handling, not purely by wing size; weight carries fixed hardware. A power
 * law fitted to line length lands 1.6% out at the large end where the affine
 * fit is within 0.6%, and the residual is systematic rather than noise.
 *
 * The practical consequence: scaling a design isometrically gives lines that
 * are too long on the big sizes and too short on the small ones.
 *
 * ---------------------------------------------------------------------------
 * The affine laws are for interpolation, not extrapolation
 * ---------------------------------------------------------------------------
 * This matters and is easy to get wrong. Fitted to the whole six-size family
 * the line-length law is within 0.6% everywhere. But fitted to only the three
 * smallest sizes and used to predict the three largest, it lands 1.8% out —
 * *worse* than plain isometric scaling at 1.5%.
 *
 * The reason is the intercept. Over a short baseline the split between the
 * fixed and the scaling part of the length is poorly determined, and
 * extrapolating amplifies that error, while isometric scaling has no free
 * parameter to get wrong. Mass is worse still: 5.9% out on the same test.
 *
 * So `scaleToArea` reports whether the target sits inside the range the laws
 * were fitted over, and falls back to isometric scaling outside it unless
 * told otherwise. Interpolating within a measured family is where these laws
 * earn their keep.
 *
 * One more thing the data shows, which is a design decision rather than a law:
 * wing loading is not held constant across a family. The ALLEGRO light runs
 * 3.57 kg/m^2 at mid weight on the XS and 4.80 on the XL. Bigger sizes are
 * flown proportionally heavier, so a family is not a set of identically
 * behaving wings.
 */

/** Laws fitted to the PHI ALLEGRO light family. */
export const DEFAULT_SCALING = {
  source: 'PHI ALLEGRO light, six sizes, 2021',
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
  const fit = (xs, ys) => {
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
    return { slope, intercept, r2: ssTot ? 1 - ssRes / ssTot : 1 };
  };

  const span = sizes.map((s) => s.flatSpan);
  const flat = sizes.map((s) => s.flatArea);
  const proj = sizes.map((s) => s.projectedArea);

  const ars = sizes.map((s) => (s.flatSpan ** 2) / s.flatArea);
  const arSpread = Math.max(...ars) - Math.min(...ars);

  return {
    source: 'fitted',
    // The range the fit is valid over. Outside it the intercept is being
    // extrapolated, which is where these laws stop beating isometric scaling.
    spanRange: [Math.min(...span), Math.max(...span)],
    areaRange: [Math.min(...flat), Math.max(...flat)],
    sampleCount: sizes.length,
    aspectRatio: ars.reduce((a, b) => a + b, 0) / ars.length,
    aspectRatioConstant: arSpread < 0.02,
    aspectRatioSpread: arSpread,
    lineLength: fit(span, sizes.map((s) => s.lineLength)),
    totalLineLength: fit(span, sizes.map((s) => s.totalLineLength)),
    wingMass: fit(proj, sizes.map((s) => s.mass)),
    midWeight: sizes[0].midWeight != null ? fit(proj, sizes.map((s) => s.midWeight)) : null,
    projectedRatio: proj.reduce((a, p, i) => a + p / flat[i], 0) / sizes.length,
    // Exponent of each quantity against the span ratio, as a check that the
    // canopy really is scaling isometrically.
    exponents: {
      flatArea: exponent(span, flat),
      projectedArea: exponent(span, proj),
    },
  };
}

function exponent(span, values) {
  const ns = [];
  for (let i = 1; i < span.length; i++) {
    const k = span[i] / span[0];
    if (k <= 1.0001) continue;
    ns.push(Math.log(values[i] / values[0]) / Math.log(k));
  }
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
}

/**
 * Scale a design to a target flat area.
 *
 * The canopy is scaled isometrically — every length by k = sqrt(areaRatio), so
 * aspect ratio, chord distribution, arc shape and washin are all preserved.
 * Line length and mass come from the affine laws instead, because they do not
 * scale with the canopy.
 */
export function scaleToArea(base, targetAreaM2, laws = DEFAULT_SCALING, {
  outsideRange = 'isometric',
} = {}) {
  const k = Math.sqrt(targetAreaM2 / base.flatArea);
  const flatSpan = base.flatSpan * k;

  // Is this target inside the range the laws were fitted over?
  const range = laws.areaRange;
  const inRange = !range || (targetAreaM2 >= range[0] * 0.98 && targetAreaM2 <= range[1] * 1.02);
  const useAffine = inRange || outsideRange === 'affine';

  const lineLength = (laws.lineLength && useAffine)
    ? laws.lineLength.slope * flatSpan + laws.lineLength.intercept
    : base.lineLength * k;

  const projectedArea = targetAreaM2 * (laws.projectedRatio ?? 0.86);

  const mass = (laws.wingMass && useAffine)
    ? laws.wingMass.slope * projectedArea + laws.wingMass.intercept
    : base.mass * k * k;

  return {
    scaleFactor: k,
    flatArea: targetAreaM2,
    flatSpan,
    projectedArea,
    projectedSpan: base.projectedSpan ? base.projectedSpan * k : null,
    aspectRatio: (flatSpan * flatSpan) / targetAreaM2,
    maxChord: base.maxChord * k,
    minChord: base.minChord * k,
    lineLength,
    totalLineLength: (laws.totalLineLength && useAffine)
      ? laws.totalLineLength.slope * flatSpan + laws.totalLineLength.intercept
      : (base.totalLineLength != null ? base.totalLineLength * k : null),
    inFittedRange: inRange,
    method: useAffine ? 'affine' : 'isometric',
    mass,
    midWeight: laws.midWeight
      ? laws.midWeight.slope * projectedArea + laws.midWeight.intercept
      : null,
    // What isometric scaling would have given, for comparison. The gap is the
    // reason this module exists.
    isometric: {
      lineLength: base.lineLength * k,
      mass: base.mass * k * k,
      lineLengthErrorPct: 100 * ((base.lineLength * k) / lineLength - 1),
    },
  };
}

/** Generate a whole family from one design and a list of target areas. */
export function generateFamily(base, targetAreas, laws = DEFAULT_SCALING) {
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
    const v = Number(rows[key]?.[i]);
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
