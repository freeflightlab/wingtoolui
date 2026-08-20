/* loads.js — what each line actually carries.
 *
 * Until now every part of this project that touched lines used geometry only.
 * The cascade was placed by weighted centroid, the "load" weighting was a
 * chord proxy, and line diameter was not modelled at all. This closes that:
 * lift distribution -> load per anchor -> tension per line -> a line thick
 * enough to hold it.
 *
 * The chain, and where each step's assumptions come from:
 *
 *   1. Spanwise lift.  `liftingLine` gives local lift coefficient against
 *      station. Multiplied by local chord and dynamic pressure that is load
 *      per metre of span.
 *   2. Load per anchor.  Each rib's share is the lift over the span it owns,
 *      split between the rows by their chordwise share of the load. The row
 *      shares are the handbook's (A 35, B 35, C 20, D 10) — a chordwise
 *      pressure distribution would be better and is noted in the roadmap.
 *   3. Tension per line.  Summed up the cascade: a branch carries everything
 *      above it. This is exact given the anchor loads, and needs no further
 *      assumption, because a line is a two-force member.
 *   4. Line selection.  Smallest line whose rated strength clears the tension
 *      times a safety factor, at limit load.
 *
 * The load case matters and is stated explicitly rather than buried: design
 * load is the certified limit load, conventionally 8g on the whole-wing mass
 * for a paraglider, with a further safety factor on top of that for the line
 * itself. `EN 926-1` tests to 8g; builders commonly rig to a factor of about
 * 1.5 on top for main lines and more for brakes.
 */

import { liftingLine } from './aero.js';

/* --------------------------------------------------------------- loading -- */

/**
 * Load carried by each rib station, in newtons.
 *
 * @param {object} o
 * @param {object} o.planform
 * @param {number[]} o.stations   rib stations, metres from the centre
 * @param {number} o.totalLoadN   total load the whole wing carries
 * @param {function} [o.twistAt]  washin distribution, degrees at a station
 */
export function spanLoadDistribution({
  planform, stations, totalLoadN, twistAt = null, alphaDeg = 5, N = 24,
}) {
  const ll = liftingLine({ planform, alphaDeg, twistAt, N });

  // Local load per metre is proportional to cl * chord. Normalise so the
  // integral over the half wing is half the total load — that way the answer
  // does not depend on the absolute cl, only on its shape, which is all
  // lifting-line theory is being trusted for here.
  const loading = ll.loading;
  const w = (y) => {
    const i = nearestIndex(loading, y);
    return Math.max(0, loading[i].cl * loading[i].chord);
  };

  const halfSpan = planform.halfSpan;
  let integral = 0;
  const M = 400;
  for (let i = 0; i < M; i++) {
    const y0 = (i / M) * halfSpan;
    const y1 = ((i + 1) / M) * halfSpan;
    integral += ((w(y0) + w(y1)) / 2) * (y1 - y0);
  }
  const scale = integral > 0 ? (totalLoadN / 2) / integral : 0;

  // Each rib owns the span midway to its neighbours.
  const out = [];
  for (let i = 0; i < stations.length; i++) {
    const lo = i === 0 ? 0 : (stations[i - 1] + stations[i]) / 2;
    const hi = i === stations.length - 1
      ? halfSpan
      : (stations[i] + stations[i + 1]) / 2;
    let seg = 0;
    const S = 20;
    for (let k = 0; k < S; k++) {
      const a = lo + ((hi - lo) * k) / S;
      const b = lo + ((hi - lo) * (k + 1)) / S;
      seg += ((w(a) + w(b)) / 2) * (b - a);
    }
    out.push({
      index: i,
      station: stations[i],
      spanFrom: lo,
      spanTo: hi,
      loadN: seg * scale,
      chord: planform.chord(stations[i]),
    });
  }
  return { stations: out, liftingLine: ll, totalHalfLoadN: out.reduce((s, r) => s + r.loadN, 0) };
}

function nearestIndex(loading, y) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < loading.length; i++) {
    const d = Math.abs(loading[i].y - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * Chordwise share of load taken by each anchor row (handbook 8.1, case 1).
 * Named distinctly from the identical constant in lines.js, which serves the
 * older geometric cascade; the two are kept separate so the load model can
 * move to a real chordwise pressure distribution without disturbing it.
 */
export const LOAD_ROW_SHARES = { A: 0.35, B: 0.35, C: 0.20, D: 0.10 };

/**
 * Load at every anchor of a line plan.
 *
 * The rib loads are shared between the rows present at that rib. Where a row
 * is missing at a station — the C row often runs one anchor further out than
 * A — its share is redistributed over the rows that are there, so the total
 * still balances.
 */
export function anchorLoads(plan, spanLoad, { rowShares = LOAD_ROW_SHARES } = {}) {
  const byAnchor = new Map();
  for (const l of plan.lines) {
    if (l.level !== 'upper') continue;
    const key = `${l.row}${l.index}`;
    byAnchor.set(key, l);
  }

  // Which rows exist at each anchor index.
  const rowsAt = new Map();
  for (const l of byAnchor.values()) {
    if (!rowsAt.has(l.index)) rowsAt.set(l.index, []);
    rowsAt.get(l.index).push(l.row);
  }

  // Partition every rib onto its nearest attachment rib, once.
  const anchorRibs = [...new Set([...byAnchor.values()].map((l) => l.ribIndex))]
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const assignment = new Map(anchorRibs.map((r) => [r, 0]));
  for (const st of spanLoad.stations) {
    if (!anchorRibs.length) break;
    let nearest = anchorRibs[0];
    for (const r of anchorRibs) {
      if (Math.abs(r - st.index) < Math.abs(nearest - st.index)) nearest = r;
    }
    assignment.set(nearest, (assignment.get(nearest) || 0) + st.loadN);
  }

  const loads = [];
  for (const [anchorIndex, rows] of rowsAt) {
    // The anchor index counts attachment points, which may be every other
    // rib. Map it back onto the rib the line actually reaches.
    const sample = byAnchor.get(`${rows[0]}${anchorIndex}`);
    const ribIndex = sample?.ribIndex ?? anchorIndex - 1;
    const rib = spanLoad.stations.find((s) => s.index === ribIndex)
      ?? spanLoad.stations[Math.min(ribIndex, spanLoad.stations.length - 1)];

    // An attachment point serves the ribs between it and its neighbours.
    // Assigning each rib to its nearest attachment point partitions the span
    // exactly once, so the anchor loads are guaranteed to sum back to the
    // wing's load. Summing a fixed window around each anchor instead
    // double-counts the ribs that two anchors share, which inflated the total
    // by half.
    const share = assignment.get(ribIndex) ?? 0;

    const present = rows.reduce((s, r) => s + (rowShares[r] ?? 0), 0) || 1;
    for (const row of rows) {
      const frac = (rowShares[row] ?? 0) / present;
      loads.push({
        row,
        anchor: anchorIndex,
        ribIndex,
        station: rib?.station ?? 0,
        loadN: share * frac,
        rowShare: frac,
      });
    }
  }
  loads.sort((a, b) => a.row.localeCompare(b.row) || a.anchor - b.anchor);
  return loads;
}

/* -------------------------------------------------------------- cascade -- */

/**
 * Tension in every line of a plan.
 *
 * A line carries the sum of everything hanging from it. Walking the tree from
 * the anchors down to the risers accumulates that exactly — no distribution
 * assumption is needed at this step, which is worth saying because it is the
 * one part of the chain that is not an estimate.
 */
export function lineTensions(plan, loads) {
  const loadByAnchor = new Map();
  for (const l of loads) loadByAnchor.set(`${l.row}${l.anchor}`, l.loadN);

  const tension = new Map();
  for (const line of plan.lines) {
    const carried = (line.anchors || []).reduce(
      (s, a) => s + (loadByAnchor.get(`${line.row}${a}`) ?? 0), 0,
    );
    tension.set(line.name, carried);
  }

  const out = plan.lines.map((l) => ({
    ...l,
    tensionN: tension.get(l.name) ?? 0,
    anchorCount: (l.anchors || []).length,
  }));

  // What a riser carries is everything that meets its maillon — which is not
  // the same as everything at 'riser' level. A cascaded row (D on a
  // three-riser wing) reaches the maillon while still numbered as middle
  // lines, so selecting on level alone drops that row's load entirely.
  const maillonOf = new Map((plan.risers || []).map((r) => [r.name, key3(r.maillon)]));
  const riserTension = {};
  for (const l of out) {
    const m = maillonOf.get(l.riser);
    if (m == null || key3(l.from) !== m) continue;
    riserTension[l.riser] = (riserTension[l.riser] || 0) + l.tensionN;
  }

  return { lines: out, riserTension, totalN: Object.values(riserTension).reduce((a, b) => a + b, 0) };
}

const key3 = (p) => (Array.isArray(p) ? p.map((v) => v.toFixed(6)).join(',') : String(p));

/* --------------------------------------------------- materials and sizing -- */

/**
 * Line materials.
 *
 * Two strengths are carried per line, and the distinction is the single most
 * important thing in this table:
 *
 *   strengthNewDaN     breaking load of the line as supplied
 *   strengthKinkedDaN  breaking load after it has been kinked
 *
 * A line in service is not straight. It is knotted or spliced at every loop,
 * bent around maillons and pulleys, and creased in the bag. Measured kinked
 * strengths are dramatically lower than new ones — Edelrid 8000-135 falls
 * from 160 daN to 85.6 daN, a 47% loss, and Liros TSL 140 from 140 to 67.6.
 * Sizing on the new figure under-sizes by nearly a factor of two on exactly
 * the lines a designer is most tempted to make thin.
 *
 * So selection uses the kinked strength by default. `strengthBasis: 'new'`
 * is available for comparison but should not be used to build anything.
 *
 * Diameters are millimetres, areas square millimetres. The full 78-line table
 * measured by PHI lives in `data/reference/line-materials.tsv`; this embedded
 * subset spans the range so the bundled tool works with no data files.
 */
export const DEFAULT_LINE_TABLE = [
  // code, mm, new daN, kinked daN, mm^2, g/m (estimated from area), elongation
  m('U-025', 0.43, 25.0, 12.0, 0.15, 0.135, 0.035),
  m('U-050', 0.61, 56.5, 23.5, 0.29, 0.26, 0.035),
  m('U-070', 0.72, 66.3, 29.5, 0.41, 0.37, 0.035),
  m('U-090', 0.82, 97.6, 54.3, 0.53, 0.48, 0.035),
  m('U-120', 0.90, 115.3, 62.9, 0.64, 0.58, 0.035),
  m('U-130', 1.00, 122.6, 64.9, 0.79, 0.71, 0.035),
  m('U-135', 1.10, 160.0, 85.6, 0.95, 0.86, 0.035),
  m('U-190', 1.20, 193.0, 103.0, 1.13, 1.02, 0.035),
  m('U-230', 1.40, 230.0, 115.1, 1.54, 1.39, 0.035),
  m('U-280', 1.50, 263.8, 141.7, 1.77, 1.59, 0.035),
  m('U-360', 1.80, 360.0, 231.0, 2.54, 2.29, 0.035),
  m('U-430', 2.00, 430.0, 232.6, 3.14, 2.83, 0.035),
  m('DC35', 0.49, 32.6, 33.6, 0.19, 0.17, 0.04),
  m('DC40', 0.50, 47.4, 41.0, 0.20, 0.18, 0.04),
  m('DC60', 0.60, 60.0, 43.2, 0.28, 0.25, 0.04),
  m('DC100', 0.80, 89.0, 71.1, 0.50, 0.45, 0.04),
  m('PPSLS 125', 1.05, 107.0, 107.0, 0.87, 1.05, 0.05, true),
  m('PPSLS 180', 1.25, 200.0, 194.4, 1.23, 1.48, 0.05, true),
  m('PPSLS 260', 1.58, 280.0, 259.4, 1.96, 2.35, 0.05, true),
  m('PPSL200', 1.42, 200.0, 211.8, 1.58, 1.90, 0.05, true),
  m('PPSL275', 1.90, 275.0, 250.0, 2.84, 3.41, 0.05, true),
];

/** Table row helper. Weight is estimated from cross-section where the
 *  supplier's figure is not to hand: sheathed lines run heavier per area. */
function m(code, diameterMM, newDaN, kinkedDaN, areaMM2, gramsPerM, elong, sheathed = false) {
  return {
    name: code,
    code,
    diameterMM,
    strengthNewDaN: newDaN,
    strengthKinkedDaN: kinkedDaN,
    areaMM2,
    gramsPerM,
    elongationAtRated: elong,
    sheathed,
    // Strength per unit diameter is the figure of merit for line drag: drag
    // goes with diameter, so for a given load the line with the highest
    // value here costs the least drag.
    efficiencyPerDiameter: kinkedDaN / diameterMM,
  };
}

/** Read the full measured table from `data/reference/line-materials.tsv`. */
export function parseMaterialsTable(tsv) {
  const out = [];
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    const [name, code, d, sn, sk, a] = f;
    const diameterMM = Number(d) / 100;   // stored in hundredths of a mm
    const kinked = Number(sk);
    if (!code || !Number.isFinite(diameterMM) || !Number.isFinite(kinked)) continue;
    out.push({
      name: name.trim(),
      code: code.trim(),
      diameterMM,
      strengthNewDaN: Number(sn),
      strengthKinkedDaN: kinked,
      areaMM2: Number(a),
      gramsPerM: Number(a) * (/PPSL|TSL|DSL/.test(code) ? 1.2 : 0.9),
      elongationAtRated: /PPSL|TSL|DSL|DFL/.test(code) ? 0.05 : 0.035,
      sheathed: /PPSL|TSL|DSL|DFL|LTC|TCR/.test(code),
      efficiencyPerDiameter: kinked / diameterMM,
      note: (f[6] || '').trim(),
    });
  }
  return out;
}

export const DEFAULT_LOAD_CASE = {
  // EN 926-1 load-tests a paraglider to 8g. That is the certification case,
  // so it is the design case here.
  limitG: 8,
  // A further margin on top of limit load, applied per line. Main lines are
  // usually rigged with less margin than brakes, which see shock loading and
  // are handled by the caller passing a larger factor.
  safetyFactor: 1.5,
  gravity: 9.81,
};

/**
 * Choose a line for every element of a plan.
 *
 * Selection is the smallest line in the table whose rated strength clears the
 * required load. Where nothing in the table is strong enough that is reported
 * rather than silently returning the biggest available, because a line plan
 * with an unbuildable element in it should not look finished.
 */
export function selectLines(tensions, {
  table = DEFAULT_LINE_TABLE,
  loadCase = DEFAULT_LOAD_CASE,
  brakeSafetyFactor = 2.0,
  minimumDiameterMM = 0.5,
  strengthBasis = 'kinked',
  preferLowDrag = true,
} = {}) {
  const rated = (mat) => (strengthBasis === 'new' ? mat.strengthNewDaN : mat.strengthKinkedDaN);
  // Order by diameter, not strength: diameter is what costs drag, and among
  // lines that carry the load the thinnest is the one to want. Ordering by
  // strength alone can pick a thicker line that happens to be weaker.
  const sorted = [...table].sort((a, b) => (preferLowDrag
    ? a.diameterMM - b.diameterMM || rated(a) - rated(b)
    : rated(a) - rated(b)));

  const chosen = tensions.lines.map((l) => {
    const factor = l.row === 'K' ? brakeSafetyFactor : loadCase.safetyFactor;
    // Anchor loads are already at 1g; the limit case multiplies them.
    const requiredN = l.tensionN * loadCase.limitG * factor;
    const requiredDaN = requiredN / 10;
    const pick = sorted.find(
      (mat) => rated(mat) >= requiredDaN && mat.diameterMM >= minimumDiameterMM,
    );
    return {
      ...l,
      requiredDaN,
      line: pick || null,
      utilisation: pick ? requiredDaN / rated(pick) : Infinity,
      ratedDaN: pick ? rated(pick) : null,
      massG: pick ? (pick.gramsPerM * l.lengthMM) / 1000 : null,
    };
  });

  const unmet = chosen.filter((c) => !c.line);
  const totalMassG = chosen.reduce((s, c) => s + (c.massG || 0) * 2, 0);

  return {
    lines: chosen,
    unmet,
    ok: unmet.length === 0,
    totalMassG,
    byMaterial: groupLinesBy(chosen.filter((c) => c.line), (c) => c.line.code),
    loadCase,
    strengthBasis,
  };
}

function groupLinesBy(arr, fn) {
  const out = {};
  for (const x of arr) (out[fn(x)] ||= []).push(x);
  return out;
}

/* --------------------------------------------------------------- stretch -- */

/**
 * Elastic stretch under load (LEP section 18).
 *
 * Lines are cut to a geometric length but fly at a longer one, so a wing
 * built to the drawing trims nose-down. The correction is to shorten each line
 * by its own stretch, so that in flight it reaches its intended length.
 *
 * Modelled as elongation proportional to the fraction of rated strength being
 * carried:
 *
 *     stretch = length * elongationAtRated * (force / ratedStrength)
 *
 * Elongation at rated load is what line suppliers actually publish — around
 * 3-4% for unsheathed Dyneema and rather more for a sheathed line, where the
 * sheath carries little load but bulks the construction. Expressing it this
 * way avoids inventing a stiffness in units nobody quotes, and it scales
 * correctly when a line is resized: a thicker line at the same tension
 * stretches less, which is the behaviour that matters here.
 *
 * Measured values are better than table values, and vary with how far a line
 * has been broken in.
 */
export function stretchCorrection(selection, { atG = 1 } = {}) {
  const corrected = selection.lines.map((l) => {
    if (!l.line) return { ...l, stretchMM: 0, cutLengthMM: l.lengthMM };
    const forceN = l.tensionN * atG;
    const ratedN = (l.ratedDaN ?? l.line.strengthKinkedDaN) * 10;
    const stretchMM = l.lengthMM * l.line.elongationAtRated * (forceN / ratedN);
    return {
      ...l,
      forceN,
      stretchMM,
      // Cut short by the stretch so the flying length is the design length.
      cutLengthMM: Math.round(l.lengthMM - stretchMM),
    };
  });
  const worst = corrected.reduce((m, c) => Math.max(m, c.stretchMM || 0), 0);
  return {
    lines: corrected,
    worstStretchMM: worst,
    meanStretchMM: corrected.reduce((s, c) => s + (c.stretchMM || 0), 0) / corrected.length,
  };
}

/* ----------------------------------------------------------------- drag -- */

/**
 * Drag of the lineset.
 *
 * A line is a bluff cylinder: its drag area is diameter times length times a
 * drag coefficient near 1. Summed over the whole set and divided by the wing
 * area, that gives the line drag coefficient — the `Cxs` that the equilibrium
 * solver has been taking as a typed-in constant since Phase 1.
 *
 * Two refinements matter and are both exposed:
 *
 *   - Lines are not normal to the flow. A line inclined at angle psi to the
 *     stream sees roughly `sin^2(psi)` of the normal-incidence drag, by the
 *     independence principle for yawed cylinders. Where line geometry is
 *     available the true inclination is used; otherwise a single factor
 *     stands in for the set.
 *   - Reynolds numbers here are a few thousand, where a smooth cylinder sits
 *     near Cd = 1.0-1.2. Sheathed lines are rougher and sit a little higher.
 */
export function lineDrag(selection, {
  wingAreaM2,
  cdCylinder = 1.1,
  inclinationFactor = null,
  flowDirection = [1, 0, 0],
  sides = 2,
} = {}) {
  let dragAreaM2 = 0;
  let lengthM = 0;
  const perLine = [];

  for (const l of selection.lines) {
    if (!l.line) continue;
    const lenM = l.lengthMM / 1000;
    const dM = l.line.diameterMM / 1000;

    let factor = inclinationFactor;
    if (factor == null) {
      if (l.from && l.to) {
        const v = [l.to[0] - l.from[0], l.to[1] - l.from[1], l.to[2] - l.from[2]];
        const n = Math.hypot(v[0], v[1], v[2]) || 1;
        const cosPsi = Math.abs((v[0] * flowDirection[0] + v[1] * flowDirection[1]
          + v[2] * flowDirection[2]) / n);
        factor = 1 - cosPsi * cosPsi;   // sin^2 of the angle to the flow
      } else {
        factor = 0.85;
      }
    }

    const cd = l.line.sheathed ? cdCylinder * 1.05 : cdCylinder;
    const area = dM * lenM * cd * factor * sides;
    dragAreaM2 += area;
    lengthM += lenM * sides;
    perLine.push({ name: l.name, dragAreaM2: area, inclinationFactor: factor });
  }

  return {
    dragAreaM2,
    totalLengthM: lengthM,
    cxLines: wingAreaM2 ? dragAreaM2 / wingAreaM2 : null,
    meanDiameterMM: selection.lines.filter((l) => l.line)
      .reduce((s2, l) => s2 + l.line.diameterMM * l.lengthMM, 0)
      / selection.lines.filter((l) => l.line).reduce((s2, l) => s2 + l.lengthMM, 0),
    perLine,
  };
}

/* ---------------------------------------------------------------- report -- */

/** Everything in one call: loading, tensions, sizing, stretch. */
export function analyseLoads({
  plan, planform, stations, totalMassKg, alphaDeg = 5, twistAt = null,
  table = DEFAULT_LINE_TABLE, loadCase = DEFAULT_LOAD_CASE, rowShares = LOAD_ROW_SHARES,
  strengthBasis = 'kinked', wingAreaM2 = null,
}) {
  const totalLoadN = totalMassKg * loadCase.gravity;
  const span = spanLoadDistribution({
    planform, stations, totalLoadN, twistAt, alphaDeg,
  });
  const loads = anchorLoads(plan, span, { rowShares });
  const tensions = lineTensions(plan, loads);
  const selection = selectLines(tensions, { table, loadCase, strengthBasis });
  const stretch = stretchCorrection(selection);
  const drag = wingAreaM2 ? lineDrag(selection, { wingAreaM2 }) : null;

  const byRow = {};
  for (const l of loads) byRow[l.row] = (byRow[l.row] || 0) + l.loadN;

  return {
    totalLoadN,
    spanLoad: span,
    anchorLoads: loads,
    loadByRow: byRow,
    tensions,
    selection,
    stretch,
    drag,
    // A useful sanity figure: the anchor loads must add up to half the wing's
    // load, because a plan describes one side.
    closureN: Object.values(byRow).reduce((a, b) => a + b, 0),
    closureError: Math.abs(
      Object.values(byRow).reduce((a, b) => a + b, 0) - totalLoadN / 2,
    ) / (totalLoadN / 2),
  };
}

/**
 * Solver inputs derived from a real lineset, for feeding back into
 * `solveEquilibrium` in place of its typed-in constants.
 */
export function equilibriumInputsFrom(analysis, { lineMassFraction = 1 } = {}) {
  return {
    cxLines: analysis.drag ? analysis.drag.cxLines : undefined,
    lineMass: (analysis.selection.totalMassG / 1000) * lineMassFraction,
  };
}

/** Line list with sizes and cut lengths, in the shape a workshop wants. */
export function lineScheduleText(analysis, { name = 'wing' } = {}) {
  const out = [
    `Line schedule — ${name}`,
    `Load case: ${analysis.selection.loadCase.limitG}g limit, `
      + `safety factor ${analysis.selection.loadCase.safetyFactor}`,
    `Total load ${(analysis.totalLoadN / 10).toFixed(0)} daN`,
    '',
    'Name\tLine\tTension(daN)\tRequired(daN)\tUse%\tGeom(mm)\tCut(mm)',
  ];
  const rows = analysis.stretch.lines
    .slice()
    .sort((a, b) => a.row.localeCompare(b.row) || a.level.localeCompare(b.level) || a.index - b.index);
  for (const l of rows) {
    out.push([
      l.name,
      l.line ? l.line.name : 'NONE',
      (l.tensionN / 10).toFixed(1),
      l.requiredDaN.toFixed(0),
      l.line ? (l.utilisation * 100).toFixed(0) : '-',
      l.lengthMM,
      l.cutLengthMM,
    ].join('\t'));
  }
  return out.join('\n');
}
