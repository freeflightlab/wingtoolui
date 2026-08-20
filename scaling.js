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
 * Every fit is tight, so affine is the right shape. But the slopes differ by
 * a factor of 1.7 across the three, because they depend on how many lines a
 * wing has, how deep its cascade runs and how it is built. Applying one
 * family's coefficients to another is simply wrong.
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
 * Line length and mass come from the affine laws instead, because they do not
 * scale with the canopy.
 */
export function scaleToArea(base, targetAreaM2, laws = null, {
  outsideRange = 'isometric',
} = {}) {
  // With no fitted laws the only defensible scaling is isometric. Falling back
  // to another family's coefficients would look like more knowledge than there
  // is: the affine slopes vary by a factor of 1.7 between the families
  // measured, so borrowing them is worse than assuming nothing.
  if (!laws) laws = { projectedRatio: base.projectedArea / base.flatArea || 0.86 };
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
    // The label must reflect what was actually used. With no fitted laws the
    // affine branch has nothing to apply and every quantity falls back to the
    // scale factor, so calling that 'affine' would misreport it.
    method: (useAffine && laws.lineLength) ? 'affine' : 'isometric',
    lawsSource: laws.source || (laws.lineLength ? 'fitted' : 'none — isometric'),
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

/** Read the multi-family reference table. */
export function parseSizeFamilies(tsv) {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split('\t');
  const idx = (k) => head.indexOf(k);
  const out = {};
  for (const line of lines.slice(1)) {
    const f = line.split('\t');
    const n = (k) => {
      const v = Number(f[idx(k)]);
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
 * Mean loading at the middle of the certified weight range:
 *
 *   wing                application      AR    mid    top of range
 *   Ozone Ultralite 5   hike and fly    4.56   4.93       6.17
 *   Ozone Geo 7         progression     5.16   3.87       4.31
 *   PHI Allegro light   performance XC  6.03   4.22       4.74
 *   Ozone Zeno 2        competition     6.90   4.85       5.27
 *
 * Across all four the correlation is **r = +0.11** — nothing. Drop the
 * hike-and-fly wing and it is **r = +0.99**, one of the cleanest trends in
 * this whole dataset.
 *
 * The mountain wing is not noise, it is a different brief. A small wing flown
 * heavily is more stable, penetrates better and packs smaller, so the
 * Ultralite 5's 13 m² sits at 6.4 kg/m² at mid range — the highest loading
 * here on the lowest aspect ratio. That is a deliberate choice about how the
 * wing is used, not a consequence of its planform.
 *
 * So the fit below covers progression through competition, and hike-and-fly
 * wings are excluded by design rather than by trimming an outlier.
 */
export const LOADING_VS_AR = {
  slope: 0.5632,
  intercept: 0.917,
  appliesTo: ['progression', 'sport', 'performance XC', 'competition'],
  excludes: ['hike and fly'],
  basis: 'middle of certified weight range, projected area',
  r: 0.986,
  sampleFamilies: 3,
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
