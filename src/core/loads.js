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
import { rowSharesFromPressure } from './pressure.js';
import { lineFamilyOf, fibreOf } from './trimdrift.js';
import { planPaths } from './lineplan.js';

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
/**
 * Row shares for a wing, either from convention or from its own pressure
 * distribution.
 *
 * `convention` is the handbook's fixed 35/35/20/10 — a reasonable summary of
 * one wing at one angle of attack, and blind to both where the anchors sit
 * and how fast the wing is flying.
 *
 * `pressure` derives the split from thin-aerofoil theory for the actual
 * section, anchors and angle of attack. On a NACA 4415 with the default
 * anchors at 6 degrees it gives A 37.9 / B 24.8 / C 20.6 / D 16.8.
 *
 * The two agree closely on A and C and disagree on B and D. That gap is worth
 * understanding rather than averaging away: thin-aerofoil theory describes a
 * rigid surface carrying load all the way to the trailing edge, whereas a
 * paraglider's rear rows are deliberately unloaded — modern wings shift load
 * forward so the C and D lines can be made thin, which costs less drag. The
 * convention encodes that rigging decision; the theory does not know about it.
 *
 * So the convention remains the default, and the derived split is available
 * for the questions the convention cannot answer: what moving an anchor does,
 * and what happens on the speedbar.
 */
export function rowSharesFor({
  mode = 'convention', airfoil = null, anchors = null, alphaDeg = 6,
  conventionShares = LOAD_ROW_SHARES,
} = {}) {
  if (mode !== 'pressure') {
    // Restricted to the rows the wing actually has, and renormalised.
    //
    // The convention table is A 35 / B 35 / C 20 / D 10, written for a
    // four-row wing. Returned unchanged for a three-row wing it assigns
    // **10% of the load to a D row that does not exist**, and the remaining
    // rows each carry a tenth less than they should.
    //
    // Laboratori d'envol's own Swoop2 is a three-riser wing, and its
    // published riser loads give A 38.3% / B 38.3% / C 23.4%. The convention
    // renormalised over three rows gives 38.9 / 38.9 / 22.2 — within about a
    // point, which is what says the convention is right and the arithmetic
    // was wrong.
    if (!anchors) return { shares: conventionShares, source: 'convention' };

    const present = Object.keys(anchors).filter((r) => r in conventionShares);
    if (!present.length) return { shares: conventionShares, source: 'convention' };

    const total = present.reduce((a, r) => a + conventionShares[r], 0);
    const shares = {};
    for (const r of present) shares[r] = conventionShares[r] / total;
    return {
      shares,
      source: 'convention',
      renormalised: present.length !== Object.keys(conventionShares).length,
      rows: present,
    };
  }
  if (!airfoil) throw new Error('Pressure-derived row shares need the section.');
  const a = anchors || airfoil.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  const r = rowSharesFromPressure(airfoil, a, alphaDeg);
  return {
    shares: r.shares,
    source: 'pressure',
    centreOfPressure: r.centreOfPressure,
    cl: r.cl,
    alphaDeg,
  };
}

/**
 * How the two tabs of a bridle pair share their row's load at a rib.
 *
 * From the pressure, as the rows' own shares are when they come from it:
 * each tab carries the load between the midpoints to its neighbours along
 * the chord (`rowSharesFromPressure`, with the pair's tabs in the row's
 * place). On a NACA 4415 with its rows at 9, 38 and 60% and the pair's tabs
 * at 5 and 13%, the forward tab takes 45% at 3 degrees, 51% at 6 and 54% at
 * 9: near halves at trim, and more forward the higher the angle. The
 * convention has no figure for it, being a split between rows, and gives
 * halves.
 *
 * Null where the plan has no bridles.
 */
export function bridleSharesFor({
  plan, mode = 'convention', airfoil = null, anchors = null, alphaDeg = 6,
} = {}) {
  const tabs = {};
  for (const l of plan?.lines ?? []) {
    if (!l.bridle || !Number.isFinite(l.chordFraction)) continue;
    (tabs[l.row] ||= {})[l.variant] = l.chordFraction;
  }
  const rows = Object.keys(tabs).filter((r) => tabs[r].a != null && tabs[r].b != null);
  if (!rows.length) return null;
  const halves = { a: 0.5, b: 0.5 };
  if (mode !== 'pressure' || !airfoil) return Object.fromEntries(rows.map((r) => [r, { ...halves }]));
  const base = anchors || airfoil.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  const out = {};
  for (const r of rows) {
    const at = { ...base };
    delete at[r];
    at[`${r}:a`] = tabs[r].a;
    at[`${r}:b`] = tabs[r].b;
    const s = rowSharesFromPressure(airfoil, at, alphaDeg).shares;
    const sum = s[`${r}:a`] + s[`${r}:b`];
    out[r] = sum > 0 ? { a: s[`${r}:a`] / sum, b: s[`${r}:b`] / sum } : { ...halves };
  }
  return out;
}

export function anchorLoads(plan, spanLoad, { rowShares = LOAD_ROW_SHARES, bridleShares = null } = {}) {
  const byAnchor = new Map();
  for (const l of plan.lines) {
    if (l.level !== 'upper') continue;
    // Brakes carry pilot input, not lift. Once the brake cascade joined the
    // line plan they arrived here as anchors, took a share of the span load
    // alongside A/B/C/D, and the closure check went from 0.02% to 19.7% —
    // which is exactly what that check is for.
    if (l.isBrake || l.row === 'K' || l.row === 'S' || l.row === 'Z') continue;
    // By name: a bridle pair is two canopy lines of one row and one number,
    // `A1a` and `A1b`, and keyed by row and number the second replaced the
    // first and the pair's rib lost half its A load.
    byAnchor.set(l.name ?? `${l.row}${l.index}`, l);
  }

  // Which rows exist at each anchor index.
  // Grouped by **rib**, not by anchor index.
  //
  // Keying on the index was safe while every row had the same anchor count —
  // anchor 3 of row A and anchor 3 of row C were the same rib. With per-row
  // densities they are not: a wing with A:19 B:11 C:6 has row C's anchor 3
  // most of the way out the span while row A's is a third of the way. Grouped
  // by index, the rows at a station were wrong, and the span load was
  // assigned to ribs that did not carry it — 7 to 12% of the wing's weight
  // lost on three BGD sizes, while others closed to 0.01%.
  // Keyed by rib, and carrying the lines themselves rather than just the row
  // names, so nothing downstream has to reconstruct a lookup key.
  const rowsAt = new Map();
  for (const l of byAnchor.values()) {
    const key = Number.isFinite(l.ribIndex) ? l.ribIndex : l.index;
    if (!rowsAt.has(key)) rowsAt.set(key, { ribIndex: key, rows: [], lines: [] });
    rowsAt.get(key).rows.push(l.row);
    rowsAt.get(key).lines.push(l);
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
  for (const [, group] of rowsAt) {
    const rows = group.rows;
    const ribIndex = group.ribIndex;
    const rib = spanLoad.stations.find((s) => s.index === ribIndex)
      ?? spanLoad.stations[Math.min(ribIndex, spanLoad.stations.length - 1)];

    // An attachment point serves the ribs between it and its neighbours.
    // Assigning each rib to its nearest attachment point partitions the span
    // exactly once, so the anchor loads are guaranteed to sum back to the
    // wing's load. Summing a fixed window around each anchor instead
    // double-counts the ribs that two anchors share, which inflated the total
    // by half.
    const share = assignment.get(ribIndex) ?? 0;

    // Each load is its own line's: the line's name, and its number in ITS
    // row. Every row at a rib was given the number of the FIRST row's line
    // there, which is the same number only while every row has the same
    // anchor count. On a wing with A:19 B:11 C:6 thirteen top lines then
    // found no load under their own name, and an eighth of the weight never
    // reached the risers.
    //
    // A row counts once at its rib, however many tabs it has there: a bridle
    // pair's two take its row's share between them (`bridleShares`, by the
    // chordwise load between them where the shares come from the pressure;
    // halves otherwise, the convention being a split between rows).
    const present = [...new Set(rows)].reduce((s, r) => s + (rowShares[r] ?? 0), 0) || 1;
    for (const l of group.lines) {
      const split = l.bridle ? (bridleShares?.[l.row]?.[l.variant] ?? 0.5) : 1;
      const frac = ((rowShares[l.row] ?? 0) / present) * split;
      loads.push({
        row: l.row,
        anchor: l.index ?? ribIndex,
        name: l.name,
        ...(l.bridle ? { variant: l.variant, bridleShare: split } : {}),
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
 *
 * That is what this comment said while the code did something else: it added
 * up, for each line, the loads of its own row at the anchor numbers listed on
 * it. Two kinds of plan have lines for which that is not everything hanging
 * from them:
 *
 *   - a MERGED cascade. A main line serving the A and B rows is listed under
 *     row A, so it was given the A row's load alone — 73 N where it carries
 *     146 — and the risers of a wing merged AB and CD added up to 55 % of
 *     the pilot. Every merged line was sized for about half its load.
 *
 *   - rows of different anchor counts, where an anchor's load was filed
 *     under another row's number (see `anchorLoads`).
 *
 * So it walks the tree now (`planPaths`): each top line's load goes into
 * every line between it and the riser.
 */
export function lineTensions(plan, loads) {
  const loadOf = new Map();
  for (const l of loads) {
    // An anchor's load is everything at it: both tabs of a bridle pair.
    const k = `${l.row}${l.anchor}`;
    loadOf.set(k, (loadOf.get(k) ?? 0) + l.loadN);
    if (l.name != null) loadOf.set(`name:${l.name}`, l.loadN);
  }

  const tension = new Map(plan.lines.map((l) => [l.name, 0]));
  const served = new Map(plan.lines.map((l) => [l.name, 0]));
  // A plan with its geometry is walked; one without (lines that carry no
  // end points) falls back on the anchors each line lists, for every row it
  // says it serves.
  const jointed = plan.lines.length > 0
    && plan.lines.every((l) => Array.isArray(l.from) && Array.isArray(l.to));
  if (jointed) {
    for (const p of planPaths(plan)) {
      const n = loadOf.get(`name:${p.name}`) ?? loadOf.get(`${p.row}${p.index}`) ?? 0;
      for (const name of p.names) {
        tension.set(name, tension.get(name) + n);
        served.set(name, served.get(name) + 1);
      }
    }
  } else {
    for (const line of plan.lines) {
      const rows = line.rows ?? [line.row];
      let carried = 0;
      for (const row of rows) {
        for (const a of line.anchors || []) carried += loadOf.get(`${row}${a}`) ?? 0;
      }
      tension.set(line.name, carried);
      served.set(line.name, (line.anchors || []).length * rows.length);
    }
  }

  const out = plan.lines.map((l) => ({
    ...l,
    tensionN: tension.get(l.name) ?? 0,
    anchorCount: served.get(l.name) ?? 0,
  }));

  // What a riser carries is everything that meets its maillon. Asked of the
  // geometry rather than of the level names, so that it holds for an
  // imported plan and for a split riser too.
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
 * Line weight from its cross-section, in g/m per mm² of nominal area, for a
 * line whose supplier's figure is not to hand.
 *
 * Sheathed: Edelrid's data sheets for the 7343, 6843, 7850 and 7950 give
 * diameter and weight for 26 sizes, and they come to 0.98 on average (0.81
 * to 1.10) — aramid core or Dyneema alike, since the cover is the same
 * polyester and the nominal diameter is the cover's. The Swoop2's own file
 * gives its three sheathed Dyneema lines at 0.80, 0.87 and 0.96.
 *
 * This was 1.2, "sheathed lines run heavier per area": a fifth to a half
 * more than any of those 29 lines weighs. Liros's sheathed lines in
 * OpenGlider's table — TSL, NTSL, DSL and DFL, 24 sizes — come to 0.955
 * (0.77 to 1.05), and its TSL alone to 0.98.
 *
 * Unsheathed aramid: 1.11, Liros's LTC, bare Technora, nine sizes in
 * OpenGlider's table (0.88 to 1.48; `data/reference/line-stretch.tsv`). It
 * was 0.9, an estimate, for every bare line, and Edelrid's 8000-U and 8001
 * came out a fifth light.
 *
 * Unsheathed otherwise — Dyneema, Vectran: 0.9, an estimate with no data
 * sheet behind it here.
 */
export const LINE_WEIGHT_PER_AREA = {
  sheathed: 0.98,
  unsheathedAramid: 1.11,
  unsheathed: 0.9,
  source: 'sheathed: Edelrid data sheets, 26 sizes (data/reference/line-materials-suppliers.tsv), '
    + 'and Liros\'s 24 in OpenGlider\'s table at 0.955; bare aramid: Liros LTC, 9 sizes '
    + '(data/reference/line-stretch.tsv); other bare line: estimated',
};

/** A line's weight per metre from its cross-section, g/m (`LINE_WEIGHT_PER_AREA`). */
function weightFromArea(areaMM2, { sheathed, fibre }) {
  return areaMM2 * (sheathed ? LINE_WEIGHT_PER_AREA.sheathed
    : fibre === 'aramid' ? LINE_WEIGHT_PER_AREA.unsheathedAramid : LINE_WEIGHT_PER_AREA.unsheathed);
}

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
 * Both of those are aramid, and the loss is the fibre's. Across the table
 * the 48 aramid lines keep 38 to 70 % of their strength kinked (53 % in the
 * middle) and the four Vectran 30 to 66 %; the 26 Dyneema lines keep 59 to
 * 114 %, 22 of them 85 % or more. A service workshop gives the same account
 * of the bending test in EN 926-1: "Dyneema retains 80 % – 90 %", "Kevlar
 * falls to 50 % – 60 %". Each line carries its `fibre`, from the family it
 * belongs to (`LINE_FAMILIES`), and the table sorts by it almost without
 * overlap — one Dyneema line under 70 %, no aramid line over it.
 *
 * So selection uses the kinked strength by default. `strengthBasis: 'new'`
 * is available for comparison but should not be used to build anything.
 *
 * Diameters are millimetres, areas square millimetres. The full 78-line table
 * measured by PHI lives in `data/reference/line-materials.tsv`; this embedded
 * subset spans the range so the bundled tool works with no data files.
 */
export const DEFAULT_LINE_TABLE = [
  // code, mm, new daN, kinked daN, mm^2, g/m (null: from its area), elongation
  m('U-025', 0.43, 25.0, 12.0, 0.15, null, 0.035),
  m('U-050', 0.61, 56.5, 23.5, 0.29, null, 0.035),
  m('U-070', 0.72, 66.3, 29.5, 0.41, null, 0.035),
  m('U-090', 0.82, 97.6, 54.3, 0.53, null, 0.035),
  m('U-120', 0.90, 115.3, 62.9, 0.64, null, 0.035),
  m('U-130', 1.00, 122.6, 64.9, 0.79, null, 0.035),
  m('U-135', 1.10, 160.0, 85.6, 0.95, null, 0.035),
  m('U-190', 1.20, 193.0, 103.0, 1.13, null, 0.035),
  m('U-230', 1.40, 230.0, 115.1, 1.54, null, 0.035),
  m('U-280', 1.50, 263.8, 141.7, 1.77, null, 0.035),
  m('U-360', 1.80, 360.0, 231.0, 2.54, null, 0.035),
  m('U-430', 2.00, 430.0, 232.6, 3.14, null, 0.035),
  m('DC35', 0.49, 32.6, 33.6, 0.19, 0.17, 0.04),
  m('DC40', 0.50, 47.4, 41.0, 0.20, 0.18, 0.04),
  m('DC60', 0.60, 60.0, 43.2, 0.28, 0.25, 0.04),
  m('DC100', 0.80, 89.0, 71.1, 0.50, 0.45, 0.04),
  m('PPSLS 125', 1.05, 107.0, 107.0, 0.87, 0.85, 0.05, true),
  m('PPSLS 180', 1.25, 200.0, 194.4, 1.23, 1.21, 0.05, true),
  m('PPSLS 260', 1.58, 280.0, 259.4, 1.96, 1.92, 0.05, true),
  m('PPSL200', 1.42, 200.0, 211.8, 1.58, 1.55, 0.05, true),
  m('PPSL275', 1.90, 275.0, 250.0, 2.84, 2.78, 0.05, true),
];

/** Table row helper. Weight is estimated from cross-section where the
 *  supplier's figure is not to hand (`LINE_WEIGHT_PER_AREA`). */
function m(code, diameterMM, newDaN, kinkedDaN, areaMM2, gramsPerM, elong, sheathed = false) {
  const family = lineFamilyOf(code);
  const isSheathed = family ? family.cover != null : sheathed;
  return {
    name: code,
    code,
    diameterMM,
    strengthNewDaN: newDaN,
    strengthKinkedDaN: kinkedDaN,
    areaMM2,
    gramsPerM: gramsPerM ?? weightFromArea(areaMM2, { sheathed: isSheathed, fibre: fibreOf(code) }),
    elongationAtRated: elong,
    sheathed: isSheathed,
    // What carries the load: 'aramid' for the U- lines (Edelrid 8000-U),
    // 'dyneema' for the DC and PPSL lines.
    fibre: fibreOf(code),
    // Strength per unit diameter is the figure of merit for line drag: drag
    // goes with diameter, so for a given load the line with the highest
    // value here costs the least drag.
    efficiencyPerDiameter: kinkedDaN / diameterMM,
  };
}

/** Read the full measured table from `data/reference/line-materials.tsv`. */
/**
 * The line materials a design may be built from.
 *
 * `DEFAULT_LINE_TABLE` carries 21 lines. `data/reference/line-materials.tsv`
 * has **78 across four brands** — Edelrid, Liros, Cousin and DC — and it has
 * been in the repository, parsed by the corpus sweep, and unreachable when
 * the model needed to choose one.
 *
 * A line table is a design decision. A workshop buys from one supplier, or
 * has a spool of something specific, and the sizing should work from what is
 * actually on the shelf rather than from a fixed list.
 *
 * Filtering to a brand is not cosmetic: it changes which line gets chosen for
 * every anchor, and therefore the drag, the mass and the bill of materials.
 */
export function lineTableFor(materials, { brand = null, sheathed = null } = {}) {
  let table = materials;

  if (brand) {
    const want = brand.toLowerCase();
    table = table.filter((m) => (m.name || '').toLowerCase().startsWith(want));
    if (!table.length) {
      const brands = [...new Set(materials
        .map((m) => (m.name || '').split(/[ -]/)[0]).filter(Boolean))];
      throw new Error(`lineTableFor: no materials named "${brand}"; `
        + `have ${brands.join(', ')}`);
    }
  }

  if (sheathed !== null) table = table.filter((m) => !!m.sheathed === sheathed);

  if (!table.length) {
    throw new Error('lineTableFor: no materials left after filtering, so no '
      + 'line could be sized');
  }

  return table;
}

/** Which brands a materials table offers, for a picker. */
export function materialBrands(materials) {
  const counts = {};
  for (const m of materials) {
    const b = (m.name || '').split(/[ -]/)[0];
    if (b) counts[b] = (counts[b] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

export function parseMaterialsTable(tsv) {
  const out = [];
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    const [name, code, d, sn, sk, a] = f;
    const diameterMM = Number(d) / 100;   // stored in hundredths of a mm
    const kinked = Number(sk);
    if (!code || !Number.isFinite(diameterMM) || !Number.isFinite(kinked)) continue;
    // The family says what the line is made of and whether it has a cover.
    // These were three patterns on the code, and they had the Technora
    // lines without a cover (LTC, TCR) as sheathed and Edelrid's sheathed
    // aramid (7343, 6843) as bare.
    const family = lineFamilyOf({ name, code });
    const sheathed = family ? family.cover != null : false;
    out.push({
      name: name.trim(),
      code: code.trim(),
      diameterMM,
      strengthNewDaN: Number(sn),
      strengthKinkedDaN: kinked,
      areaMM2: Number(a),
      gramsPerM: weightFromArea(Number(a), { sheathed, fibre: fibreOf({ name, code }) }),
      elongationAtRated: sheathed ? 0.05 : 0.035,
      sheathed,
      fibre: fibreOf({ name, code }),
      family: family ? `${family.maker} ${family.family}` : null,
      efficiencyPerDiameter: kinked / diameterMM,
      note: (f[6] || '').trim(),
    });
  }
  return out;
}

/**
 * The thinnest line real wings actually use.
 *
 * Checked across two manufacturers' complete linesets, neither goes below
 * **0.50 mm**: PHI's Allegro X-alps stops at DC40 (0.50 mm, 41 daN kinked)
 * and Ozone's Geo 7 at its 050 references. The materials table contains
 * thinner line than that, and it is not used on a wing.
 *
 * The reason is not strength. A 0.4 mm Dyneema line is strong enough for a
 * tip D-line several times over. It is handling, abrasion, knot retention and
 * the simple fact that a line too thin to grip is a line that gets damaged in
 * a bush. So below this diameter, load is not what decides the line — and a
 * model that keeps sizing downward past it produces a lineset no one would
 * build.
 *
 * This is why most of a real lineset is *not* load-sized. Against the load
 * this file gives each of them in level flight (`publishedCascadeLoads`),
 * PHI's own choices run from 9 times, on the outer C main line, to several
 * hundred on the tip lines. The riser end is load-driven; the tip end is at
 * the floor.
 */
export const PRACTICAL_FLOOR = {
  diameterMM: 0.50,
  source: 'PHI Allegro X-alps and Ozone Geo 7: neither uses thinner line',
};

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
  minimumDiameterMM = PRACTICAL_FLOOR.diameterMM,
  strengthBasis = 'kinked',
  preferLowDrag = true,
  // The line set's strength level by level, as the DHV calculates it for
  // EN 926-1 (`strengthByLevel`): `{ maxWeightKg }` sizes up the weakest
  // lines of any level short of it. The lines carry their plan's ends
  // (`from`, `to`), which say how they join.
  levelRule = null,
} = {}) {
  const rated = (mat) => (strengthBasis === 'new' ? mat.strengthNewDaN : mat.strengthKinkedDaN);
  // Order by diameter, not strength: diameter is what costs drag, and among
  // lines that carry the load the thinnest is the one to want. Ordering by
  // strength alone can pick a thicker line that happens to be weaker.
  //
  // Between two lines of ONE diameter the stronger comes first: it costs the
  // same drag and the same weight. They were taken weakest first, so of the
  // two 0.50 mm lines in the catalogue every lightly loaded line got the one
  // rated 25 daN kinked (a Vectran) and not the one rated 41 (Liros DC 40) —
  // 98 of the default wing's 114 lines, where PHI's own lineset uses DC 40.
  const sorted = [...table].sort((a, b) => (preferLowDrag
    ? a.diameterMM - b.diameterMM || rated(b) - rated(a)
    : rated(a) - rated(b)));

  const chosen = tensions.lines.map((l) => {
    const factor = l.row === 'K' ? brakeSafetyFactor : loadCase.safetyFactor;
    // Anchor loads are already at 1g; the limit case multiplies them.
    const requiredN = l.tensionN * loadCase.limitG * factor;
    const requiredDaN = requiredN / 10;
    // What the load alone would call for, ignoring the practical floor.
    const byLoad = sorted.find((mat) => rated(mat) >= requiredDaN);
    const pick = sorted.find(
      (mat) => rated(mat) >= requiredDaN && mat.diameterMM >= minimumDiameterMM,
    );
    // Whether this line is decided by the load or by the floor. A designer
    // wants to know which: the load-sized lines are the ones that respond to
    // a change in the load case, and the floor-sized ones never will.
    const sizedBy = (byLoad && pick && byLoad.diameterMM < pick.diameterMM)
      || (pick && rated(pick) > requiredDaN * 2)
      ? 'floor' : 'load';
    return {
      ...l,
      requiredDaN,
      line: pick || null,
      utilisation: pick ? requiredDaN / rated(pick) : Infinity,
      ratedDaN: pick ? rated(pick) : null,
      sizedBy,
      loadOnlyLine: byLoad || null,
      massG: pick ? (pick.gramsPerM * l.lengthMM) / 1000 : null,
    };
  });

  // Sized line by line, a set can still fall short level by level: the
  // default wing's main lines came to 1382 daN, under the 1400 the DHV's
  // calculation asks of every level, and its brake's first level to 82, a
  // DC 40 a side, where it asks 150. A real wing's are well over: the Lynx
  // 2 M's nine mains a side come to 2015 daN after bending, both sides, and
  // its brake line from the handle is a PPSL 200 a side, 424. The weakest
  // line of a short level is taken up a size, and again, until each holds.
  let levelSized = 0;
  if (levelRule && levelRule.maxWeightKg > 0 && chosen.every((c) => Array.isArray(c.from) && Array.isArray(c.to))) {
    const R = levelRule.rule ?? DHV_LINE_CALCULATION;
    const up = (c) => sorted.find((mat) => rated(mat) > (c.ratedDaN ?? 0)
      && mat.diameterMM >= (c.line?.diameterMM ?? 0) && mat.diameterMM >= minimumDiameterMM);
    const take = (c, mat) => {
      c.line = mat;
      c.ratedDaN = rated(mat);
      c.utilisation = c.requiredDaN / rated(mat);
      c.massG = (mat.gramsPerM * c.lengthMM) / 1000;
      c.sizedBy = 'level';
      levelSized += 1;
    };
    for (const c of chosen) {
      if (c.line && c.ratedDaN < R.lineMinDaN) {
        const mat = sorted.find((m) => rated(m) >= R.lineMinDaN && m.diameterMM >= (c.line?.diameterMM ?? 0));
        if (mat) take(c, mat);
      }
    }
    for (let guard = 0; guard < 2000; guard++) {
      const v = strengthByLevel(chosen, { maxWeightKg: levelRule.maxWeightKg, strength: (c) => c.ratedDaN });
      const short = [
        ...(v.suspension?.levels ?? []).filter((x) => x.sumDaN < R.levelMinDaN || x.g < R.levelMinG),
        ...(v.brake?.levels ?? []).filter((x) => x.sumDaN < R.brakeLevelMinDaN),
      ][0];
      if (!short) break;
      const weakest = short.members.filter((c) => c.line && up(c))
        .sort((a, b) => (a.ratedDaN ?? 0) - (b.ratedDaN ?? 0))[0];
      if (!weakest) break;
      take(weakest, up(weakest));
    }
  }

  const unmet = chosen.filter((c) => !c.line);
  const totalMassG = chosen.reduce((s, c) => s + (c.massG || 0) * 2, 0);

  return {
    lines: chosen,
    unmet,
    ok: unmet.length === 0,
    totalMassG,
    levelSized,
    levelRule: levelRule ? { maxWeightKg: levelRule.maxWeightKg, rule: levelRule.rule ?? DHV_LINE_CALCULATION } : null,
    byMaterial: groupLinesBy(chosen.filter((c) => c.line), (c) => c.line.code),
    loadCase,
    strengthBasis,
    floorSized: chosen.filter((c) => c.sizedBy === 'floor').length,
    loadSized: chosen.filter((c) => c.sizedBy === 'load').length,
    practicalFloor: minimumDiameterMM,
  };
}

function groupLinesBy(arr, fn) {
  const out = {};
  for (const x of arr) (out[fn(x)] ||= []).push(x);
  return out;
}

/* --------------------------------------------------------------- stretch -- */

/**
 * Measured load and elongation of named lines, from OpenGlider's line types
 * (`data/reference/line-stretch.tsv`): 56 sizes of Cousin's Vectraline, CTL
 * 900 and Technoline and Liros's LTC, NTSL, TSL, DFL and DSL. Each curve is
 * load in daN and elongation as a fraction, in pairs from nothing at no load;
 * `byCode` holds the usable ones by the code the same line has in the
 * catalogue (`line-materials.tsv`), and `rows` every one, with why a curve is
 * not used where it is not.
 */
export function parseLineStretch(tsv) {
  const rows = [];
  let head = null;
  for (const raw of String(tsv ?? '').split(/\r?\n/)) {
    if (!raw.trim() || raw.startsWith('#')) continue;
    const f = raw.split('\t');
    if (!head) { head = f.map((x) => x.trim()); continue; }
    const at = (k) => (f[head.indexOf(k)] ?? '').trim();
    const num = (k) => (at(k) === '' ? null : Number(at(k)));
    const pairs = at('stretch').split(/\s+/).filter(Boolean)
      .map((p) => p.split(':').map(Number));
    if (pairs.some((p) => p.length !== 2 || !p.every(Number.isFinite))) {
      throw new Error(`parseLineStretch: ${at('og_name')} has a stretch that is not load:elongation pairs (${at('stretch')})`);
    }
    const use = at('use');
    rows.push({
      maker: at('maker'),
      family: at('family'),
      item: at('item'),
      name: at('og_name'),
      catalogue: at('catalogue') || null,
      diameterMM: num('diameter_mm'),
      minBreakDaN: num('min_break_daN'),
      gramsPerM: num('weight_g_per_m'),
      curve: [[0, 0], ...pairs.map(([daN, pct]) => [daN, pct / 100])],
      used: use === 'yes',
      why: use === 'yes' ? null : use.replace(/^no:\s*/, ''),
    });
  }
  const byCode = new Map(rows.filter((r) => r.catalogue).map((r) => [r.catalogue, r]));
  return { rows, byCode };
}

/**
 * A catalogue with the measured figures attached where a line has them: its
 * load and elongation curve (`stretchCurve`, daN and fraction), and its
 * weight per metre, which the catalogue only estimates from the line's area.
 * A line whose curve is not used keeps the generic stretch, and says why.
 */
export function withMeasuredLineData(table, stretch) {
  if (!stretch?.byCode) return table;
  return table.map((line) => {
    const r = stretch.byCode.get(line.code);
    if (!r) return line;
    return {
      ...line,
      ...(r.used ? { stretchCurve: r.curve, stretchSource: `OpenGlider ${r.name}` } : { stretchNotUsed: r.why }),
      ...(Number.isFinite(r.gramsPerM)
        ? { gramsPerM: r.gramsPerM, gramsPerMEstimated: line.gramsPerM, weightSource: `OpenGlider ${r.name}` } : {}),
    };
  });
}

/**
 * Elongation of a line under a load, as a fraction of its unloaded length.
 *
 * Its measured curve where it has one, straight between points and on along
 * the last of them beyond, as OpenGlider reads its own; otherwise the
 * generic model, `elongationAtRated` at the rated (kinked) strength and in
 * proportion below it. On the thirteen lines with a measured curve the two
 * differ by up to three times at the 5 daN a line is measured at
 * (`docs/openglider.md`).
 */
export function elongationOf(line, forceN, ratedN) {
  const F = Math.max(0, forceN) / 10;   // daN, the curve's unit
  const c = line?.stretchCurve;
  if (c && c.length >= 2) {
    let i = 1;
    while (i < c.length - 1 && c[i][0] < F) i++;
    const [f0, e0] = c[i - 1];
    const [f1, e1] = c[i];
    return e0 + ((F - f0) * (e1 - e0)) / ((f1 - f0) || 1);
  }
  const eps = line?.elongationAtRated ?? 0;
  return ratedN > 0 ? eps * (forceN / ratedN) : 0;
}


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
/**
 * The four lengths of a line, and why they are not interchangeable.
 *
 * Designing for aerodynamics and designing for manufacture ask different
 * questions of the same line, and the answers differ by more than the
 * inspection tolerance. Four distinct quantities:
 *
 *   **flying length** — the length under its actual working load. This sets
 *     where the anchor sits relative to the pilot, and therefore the angle of
 *     attack, the trim speed and the polar. It is what the *design* computes
 *     and what the aerodynamics needs.
 *
 *   **reference length** — measured at the PMA's 5 daN. What a manual
 *     publishes and an inspector checks against. Neither of the other two.
 *
 *   **sewn length** — unloaded, inside of one loop to inside of the other
 *     (PMA Figure 6). What the sewer works to.
 *
 *   **cut length** — sewn plus the loop allowance. What is consumed from the
 *     roll, and what a material order is built from.
 *
 * ---------------------------------------------------------------------------
 * The surprise in the middle
 * ---------------------------------------------------------------------------
 * It is natural to assume the measuring tension is small compared with flight
 * load, so that a reference length is near enough the flying length. On a
 * paraglider it is the other way round. The load is spread over fifty-odd
 * lines per side, so at 1 g the upper lines carry **0.9 daN on average** and
 * even the main lines only 4.7 — all below the 5 daN the measurement applies.
 *
 * **A line measured at 5 daN is longer than it flies at 1 g.** The reference
 * length is a stretched length, and publishing a design length in its place
 * puts a systematic error into every manual and every inspection.
 */
export function lengthChain(selection, {
  atG = 1,
  loopAllowanceMM = 0,
  measurementDaN = 5,
} = {}) {
  const rows = selection.lines.map((l) => {
    if (!l.line) {
      return {
        ...l,
        flyingLengthMM: l.lengthMM,
        referenceLengthMM: l.lengthMM,
        sewnLengthMM: l.lengthMM,
        cutLengthMM: l.lengthMM + loopAllowanceMM,
        sized: false,
      };
    }
    const ratedN = (l.ratedDaN ?? l.line.strengthKinkedDaN) * 10;
    // Its measured curve where it has one (`elongationOf`), and the generic
    // elongation in proportion to its rated strength where not.
    const stretchAt = (forceN) => elongationOf(l.line, forceN, ratedN);

    const flying = l.lengthMM;                       // the design output
    const flightN = l.tensionN * atG;
    // Unloaded length that reaches the flying length under the flight load.
    const sewn = flying / (1 + stretchAt(flightN));
    const reference = sewn * (1 + stretchAt(measurementDaN * 10));

    return {
      ...l,
      flightN,
      flyingLengthMM: Math.round(flying),
      referenceLengthMM: Math.round(reference),
      sewnLengthMM: Math.round(sewn),
      cutLengthMM: Math.round(sewn + loopAllowanceMM),
      // Where its stretch came from: the line's own measured curve, or the
      // generic elongation at its rated strength.
      stretchFrom: l.line.stretchCurve ? 'measured' : 'generic',
      // The two differences a designer needs to see.
      flightStretchMM: flying - sewn,
      measurementStretchMM: reference - sewn,
      referenceMinusFlyingMM: reference - flying,
      sized: true,
    };
  });

  const sized = rows.filter((r) => r.sized);
  const deltas = sized.map((r) => r.referenceMinusFlyingMM);
  return {
    lines: rows,
    measurementDaN,
    loopAllowanceMM,
    flyingMetres: rows.reduce((a, r) => a + r.flyingLengthMM, 0) / 1000,
    sewnMetres: rows.reduce((a, r) => a + r.sewnLengthMM, 0) / 1000,
    cutMetres: rows.reduce((a, r) => a + r.cutLengthMM, 0) / 1000,
    // Positive means the reference length is longer than the flying length,
    // which is the usual case on a paraglider.
    worstReferenceMinusFlyingMM: deltas.length
      ? deltas.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0) : 0,
    meanReferenceMinusFlyingMM: deltas.length
      ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0,
    // How much of the PMA +/-12 mm band this systematic difference uses up.
    bandUsedFraction: deltas.length
      ? Math.max(...deltas.map((d) => Math.abs(d))) / 12 : 0,
  };
}

/* ---------------------------------------------------- strength by level -- */

/**
 * The line set's strength level by level, as the DHV calculates it for EN
 * 926-1:2015 and NfL 2-565-20 (its "suspension line calculation", 2023):
 * level 1 is the lines attached to the risers, and each further junction
 * starts the next; each level's breaking strengths after bending, both sides
 * of the wing, must sum to at least 1400 daN and to 14 times the maximum
 * weight; every line must hold 20 daN; and each level of the brake lines 150
 * daN. OpenGlider's `get_floor_strength` sums the same way, and counts a
 * branch that has ended again at every level above it, its top lines still
 * carrying its share — as a cut across the cascade at that height must.
 *
 * `lines` are the sized lines of one side (`selectLines`), joined end to end
 * by where they meet; `strength(l)` is a line's strength after bending, daN.
 */
export const DHV_LINE_CALCULATION = Object.freeze({
  levelMinDaN: 1400,
  levelMinG: 14,
  lineMinDaN: 20,
  brakeLevelMinDaN: 150,
  source: 'DHV, "suspension line calculation" (service.dhv.de, 2023), for EN 926-1:2015 | NfL 2-565-20',
});

export function strengthByLevel(lines, {
  maxWeightKg, strength = (l) => l.ratedDaN ?? l.line?.strengthKinkedDaN, sides = 2,
  brakeRows = ['K', 'BR'], tolerance = 1e-4,
} = {}) {
  const key = (p) => p.map((v) => Math.round(v / tolerance)).join(',');
  const groups = { suspension: lines.filter((l) => !brakeRows.includes(l.row)), brake: lines.filter((l) => brakeRows.includes(l.row)) };
  const out = {};
  for (const [what, ls] of Object.entries(groups)) {
    if (!ls.length) { out[what] = null; continue; }
    const tops = new Set(ls.map((l) => key(l.to)));
    // A line whose lower end no other line reaches hangs from a riser (or the
    // handle): level 1. Each line above starts at the top of the one below.
    const below = new Map();
    for (const l of ls) below.set(key(l.to), l);
    const levelOf = new Map();
    const depth = (l) => {
      if (levelOf.has(l)) return levelOf.get(l);
      const parent = tops.has(key(l.from)) ? below.get(key(l.from)) : null;
      const d = parent && parent !== l ? depth(parent) + 1 : 1;
      levelOf.set(l, d);
      return d;
    };
    ls.forEach(depth);
    const topLevel = Math.max(...levelOf.values());
    const startsAbove = new Set(ls.map((l) => key(l.from)));
    // A line nothing starts from at its upper end is a branch's last.
    const last = ls.filter((l) => !startsAbove.has(key(l.to)));
    const levels = [];
    for (let k = 1; k <= topLevel; k++) {
      const at = ls.filter((l) => levelOf.get(l) === k);
      const carried = last.filter((l) => levelOf.get(l) < k);
      const all = [...at, ...carried];
      const sum = sides * all.reduce((a, l) => a + (strength(l) || 0), 0);
      const g = maxWeightKg > 0 ? sum / (maxWeightKg * 0.981) : NaN;
      levels.push({ level: k, lines: at.length, carried: carried.length, sumDaN: sum, g, members: at });
    }
    const weakest = ls.reduce((a, l) => ((strength(l) || 0) < (strength(a) || 0) ? l : a), ls[0]);
    out[what] = { levels, weakest: { name: weakest.name, strengthDaN: strength(weakest) } };
  }
  const D = DHV_LINE_CALCULATION;
  const susp = out.suspension;
  const problems = [];
  if (susp) {
    for (const v of susp.levels) {
      if (v.sumDaN < D.levelMinDaN) problems.push(`level ${v.level} holds ${v.sumDaN.toFixed(0)} daN, under ${D.levelMinDaN}`);
      if (Number.isFinite(v.g) && v.g < D.levelMinG) problems.push(`level ${v.level} holds ${v.g.toFixed(1)} g, under ${D.levelMinG}`);
    }
    if (susp.weakest.strengthDaN < D.lineMinDaN) problems.push(`${susp.weakest.name} holds ${susp.weakest.strengthDaN} daN, under ${D.lineMinDaN}`);
  }
  if (out.brake) {
    for (const v of out.brake.levels) {
      if (v.sumDaN < D.brakeLevelMinDaN) problems.push(`brake level ${v.level} holds ${v.sumDaN.toFixed(0)} daN, under ${D.brakeLevelMinDaN}`);
    }
  }
  return { ...out, maxWeightKg, ok: problems.length === 0, problems, rule: D };
}

export function stretchCorrection(selection, { atG = 1, loopAllowanceMM = 0 } = {}) {
  const corrected = selection.lines.map((l) => {
    if (!l.line) {
      return {
        ...l, stretchMM: 0,
        finishedLengthMM: l.lengthMM,
        cutLengthMM: l.lengthMM + loopAllowanceMM,
      };
    }
    const forceN = l.tensionN * atG;
    const ratedN = (l.ratedDaN ?? l.line.strengthKinkedDaN) * 10;
    const stretchMM = l.lengthMM * elongationOf(l.line, forceN, ratedN);
    // Finished length: shortened by the stretch, so the flying length is the
    // design length.
    const finished = l.lengthMM - stretchMM;
    return {
      ...l,
      forceN,
      stretchMM,
      finishedLengthMM: Math.round(finished),
      // Cut length adds the loop allowance — the material consumed by the
      // loops at each end. It is a fixed quantity per line, not a fraction of
      // length, so it lands hardest on the short top lines.
      cutLengthMM: Math.round(finished + loopAllowanceMM),
      loopAllowanceMM,
    };
  });
  const worst = corrected.reduce((m, c) => Math.max(m, c.stretchMM || 0), 0);
  const finishedM = corrected.reduce((a, c) => a + c.finishedLengthMM, 0) / 1000;
  const cutM = corrected.reduce((a, c) => a + c.cutLengthMM, 0) / 1000;
  const shares = loopAllowanceMM
    ? corrected.map((c) => loopAllowanceMM / c.cutLengthMM) : [0];
  return {
    lines: corrected,
    worstStretchMM: worst,
    meanStretchMM: corrected.reduce((s, c) => s + (c.stretchMM || 0), 0) / corrected.length,
    loopAllowanceMM,
    // What the loops actually cost. UP Paragliders is the only maker in the
    // reference set that states this separately, and on their Meru 2 it comes
    // to 13% of all line material — and 37% of the shortest line.
    finishedMetres: finishedM,
    cutMetres: cutM,
    loopShareOfCut: cutM > 0 ? (cutM - finishedM) / cutM : 0,
    worstLoopShare: Math.max(...shares),
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
 * Three refinements matter and are all exposed:
 *
 *   - Lines are not square to the flow. By the independence principle for
 *     yawed cylinders, a line at an angle psi to the stream feels the force
 *     of the flow's component square to it, (V sin psi)^2, square to its own
 *     axis; its drag is that force's part along the flow, sin^3 psi of the
 *     drag square on (Hoerner; Relf and Powell; the principle holds above a
 *     Reynolds number of a few hundred). This took sin^2, the force, for the
 *     drag: 3% too much on a line 15 degrees off square. Where the line's
 *     geometry is known its own angle is used; otherwise a single factor
 *     stands in for the set.
 *   - A line's Reynolds number is a few hundred to a few thousand, on the
 *     flow square to it and its own diameter, and its drag coefficient falls
 *     with it: 1 + 10 Re^(-2/3), White's correlation for a cylinder, as
 *     LEparagliding takes it from De Villiers' HEGALA report — 1.19 for a
 *     0.5 mm line at 12 m/s, 1.06 for a 2.5 mm riser line. Given `air`, each
 *     line has its own; given `cdCylinder`, every line that; with neither,
 *     1.1. Sheathed lines had 5% added, which nothing sourced: a braided
 *     cover's roughness moves a cylinder's drag near its drag crisis, at a
 *     Reynolds number near 2 x 10^5, not at a line's.
 *   - Its loops are in the flow too, the line doubled over them: a sewn
 *     allowance at its length, and an imported line's as its program counts
 *     them (`loopFrontalMM`), a spliced loop at sqrt 2 - 1 of its length.
 *     Square to the flow, the gnuC2-23's lineset is then its program's drag
 *     to the last digit.
 */
/**
 * Wake shielding between lines.
 *
 * A line sitting in the wake of one ahead of it sees reduced dynamic pressure
 * and makes less drag. Whether that matters on a paraglider is a question of
 * scale, and the scale is unintuitive: the rows are separated by a chord
 * fraction, which for a 1 mm line is **hundreds of diameters**, and a wake
 * that far downstream has both decayed and spread.
 *
 * The test that matters is not "is there a line ahead of it" but "is this
 * line inside that wake". Counting any line within 50 mm laterally makes 67
 * of 88 lines shielded; a wake at 600 diameters is about 6 mm wide, so almost
 * none of those are in it. With the width taken properly — a half-width
 * growing as 0.25*sqrt(x*d) and a centreline deficit decaying as
 * 1.2/sqrt(x/d) — the count falls to 16 of 88, mean deficit 5%, worst 9%.
 *
 * Drag goes as velocity squared, so a 9% deficit is a 17% drag reduction on
 * that one line. A real effect and a small one, worth having measured rather
 * than either ignored or assumed large.
 */
export function wakeShielding(lines, { flowDirection = [1, 0, 0], maxDeficit = 0.6 } = {}) {
  const usable = lines.filter((l) => l.line && l.from && l.to);
  const mid = (l) => [
    (l.from[0] + l.to[0]) / 2, (l.from[1] + l.to[1]) / 2, (l.from[2] + l.to[2]) / 2,
  ];
  const fn = Math.hypot(...flowDirection) || 1;
  const unit = flowDirection.map((v) => v / fn);
  const along = (p) => p[0] * unit[0] + p[1] * unit[1] + p[2] * unit[2];

  const byLine = new Map();
  for (const a of usable) {
    const ma = mid(a);
    let deficit = 0;
    let by = null;
    for (const b of usable) {
      if (b === a) continue;
      const mb = mid(b);
      const dx = along(ma) - along(mb);          // downstream separation
      if (dx <= 0) continue;                     // b must be upstream of a
      const db = b.line.diameterMM / 1000;
      const sep = [ma[0] - mb[0], ma[1] - mb[1], ma[2] - mb[2]];
      const total = Math.hypot(...sep);
      const lateral = Math.sqrt(Math.max(0, total * total - dx * dx));
      if (lateral > 0.25 * Math.sqrt(dx * db)) continue;   // outside the wake
      const d = Math.min(maxDeficit, 1.2 / Math.sqrt(dx / db));
      if (d > deficit) { deficit = d; by = b.name; }
    }
    if (deficit > 0) byLine.set(a.name, { deficit, shieldedBy: by });
  }

  const values = [...byLine.values()].map((v) => v.deficit);
  return {
    byLine,
    shielded: byLine.size,
    total: usable.length,
    worstDeficit: values.length ? Math.max(...values) : 0,
    meanDeficit: values.length ? values.reduce((x, y) => x + y, 0) / values.length : 0,
  };
}

export function lineDrag(selection, {
  wingAreaM2,
  // Every line's coefficient, when given; each line's own from its Reynolds
  // number, given the air and the speed (`air`: speedMS, rho, muPaS); 1.1
  // with neither.
  cdCylinder = null,
  air = null,
  // The loops at a line's ends, sewn: the line doubled over them. A line
  // that brings its own (`loopFrontalMM`, an imported design's) keeps it.
  loopAllowanceMM = 0,
  // The risers (a plan's `riserWebbing`), each with its material: a round
  // one is a line; a strap is a flat plate broadside, Cd 1.98, without its
  // loops, as LEparagliding counts both. One without a material is not
  // counted, and said.
  risers = [],
  inclinationFactor = null,
  flowDirection = [1, 0, 0],
  sides = 2,
  // Off by default: it is a fraction of a per cent on the total, and the
  // wake model is first-order, so it is offered rather than imposed.
  wakeInterference = false,
} = {}) {
  const wake = wakeInterference
    ? wakeShielding(selection.lines, { flowDirection }) : null;
  const fn = Math.hypot(flowDirection[0], flowDirection[1], flowDirection[2]) || 1;
  const flow = flowDirection.map((v) => v / fn);
  const useReynolds = !Number.isFinite(cdCylinder) && !!air
    && air.speedMS > 0 && air.rho > 0 && air.muPaS > 0;
  const sinOf = (from, to) => {
    if (!from || !to) return null;
    const v = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    const cosPsi = Math.abs((v[0] * flow[0] + v[1] * flow[1] + v[2] * flow[2]) / n);
    return Math.sqrt(Math.max(0, 1 - cosPsi * cosPsi));
  };
  // A cylinder's coefficient: given, or by its Reynolds number on the flow
  // square to it.
  const cylinderCd = (dM, sinPsi) => {
    if (Number.isFinite(cdCylinder)) return { cd: cdCylinder, reynolds: null };
    const reynolds = useReynolds ? (air.rho * air.speedMS * (sinPsi ?? 1) * dM) / air.muPaS : null;
    return { cd: reynolds > 0 ? 1 + 10 * reynolds ** (-2 / 3) : 1.1, reynolds };
  };
  let dragAreaM2 = 0;
  let lengthM = 0;
  let cdArea = 0;
  let plainArea = 0;
  const perLine = [];

  for (const l of selection.lines) {
    if (!l.line) continue;
    // Its length in the flow: node to node, and its loops.
    const loopMM = Number.isFinite(l.loopFrontalMM) ? l.loopFrontalMM : loopAllowanceMM;
    const lenM = (l.lengthMM + loopMM) / 1000;
    const dM = l.line.diameterMM / 1000;
    // Its angle to the flow, psi: the drag along the flow goes as sin^3.
    const sinPsi = sinOf(l.from, l.to);
    let factor = inclinationFactor;
    if (factor == null) factor = sinPsi == null ? 0.85 : sinPsi ** 3;
    const { cd, reynolds } = cylinderCd(dM, sinPsi);
    // Drag goes as velocity squared, so a velocity deficit of q on a shielded
    // line reduces its contribution by (1-q)^2.
    const shield = wake && wake.byLine.has(l.name)
      ? (1 - wake.byLine.get(l.name).deficit) ** 2 : 1;
    const area = dM * lenM * cd * factor * sides * shield;
    dragAreaM2 += area;
    lengthM += (l.lengthMM / 1000) * sides;
    cdArea += cd * dM * lenM;
    plainArea += dM * lenM;
    perLine.push({ name: l.name, dragAreaM2: area, inclinationFactor: factor, cd, reynolds });
  }

  // The risers, each at its own angle to the flow.
  let risersDragAreaM2 = 0;
  const risersUncounted = [];
  for (const r of risers ?? []) {
    const mat = r.material;
    if (!mat || !(mat.diameterMM > 0)) { risersUncounted.push(r.name ?? r.riser); continue; }
    const strap = mat.section === 'rectangular';
    const sinPsi = sinOf(r.from, r.to);
    const factor = inclinationFactor ?? (sinPsi == null ? 1 : sinPsi ** 3);
    const dM = mat.diameterMM / 1000;
    const lenM = (r.lengthMM + (strap ? 0 : (r.loopFrontalMM ?? 0))) / 1000;
    const { cd, reynolds } = strap ? { cd: 1.98, reynolds: null } : cylinderCd(dM, sinPsi);
    const area = dM * lenM * cd * factor * sides;
    risersDragAreaM2 += area;
    perLine.push({ name: r.name, riser: true, strap, dragAreaM2: area, inclinationFactor: factor, cd, reynolds });
  }
  dragAreaM2 += risersDragAreaM2;

  return {
    dragAreaM2,
    risersDragAreaM2,
    risersUncounted,
    totalLengthM: lengthM,
    wake,
    cxLines: wingAreaM2 ? dragAreaM2 / wingAreaM2 : null,
    // The lines' coefficient over the set, weighted by their frontal area,
    // and what it came from.
    cdMean: plainArea > 0 ? cdArea / plainArea : null,
    cdBasis: Number.isFinite(cdCylinder) ? 'given' : useReynolds ? 'reynolds' : 'default',
    meanDiameterMM: selection.lines.filter((l) => l.line)
      .reduce((s2, l) => s2 + l.line.diameterMM * l.lengthMM, 0)
      / selection.lines.filter((l) => l.line).reduce((s2, l) => s2 + l.lengthMM, 0),
    perLine,
  };
}

/**
 * Where a lineset's weight and its drag act, in the central section's
 * plane (`centralFrame`, wing3d.js): back from the nose along the central
 * chord, and down from it. Each line at its middle — by its own mass, and
 * by its own drag area as `lineDrag` gives it line by line, the risers'
 * among them when it counts theirs. The two halves are mirror images, so
 * one is all it takes.
 *
 * `massKg`, when given, is the lineset's weight as the balance carries it —
 * typed, or a design's own — and what it has beyond the lines' own mass is
 * the risers' webbing and hardware: it is put at the middle of the webbing
 * (`webbing`, a plan's `riserWebbing`), or at the karabiners when the plan
 * has none. A typed figure below the lines' own is taken as theirs, spread
 * as they are.
 *
 * @param {object} selection  `selectLines` (its lines need `from` and `to`)
 * @param {object} o
 * @param {object} o.frame    `centralFrame(wing)`
 * @param {object} [o.drag]   `lineDrag(selection, ...)`; without it the drag
 *                            is weighted by each line's diameter by length
 * @param {object[]} [o.webbing]
 * @param {number[]} [o.karabiner]
 * @param {number} [o.massKg]
 * @param {number} [o.sides]
 */
export function lineCentres(selection, {
  frame, drag = null, webbing = [], karabiner = null, massKg = null, sides = 2,
} = {}) {
  if (!frame?.u) throw new Error('lineCentres needs the central frame (centralFrame)');
  const { origin: o, u, v } = frame;
  const inPlane = (p) => {
    const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    return [d[0] * u[0] + d[1] * u[1] + d[2] * u[2], -(d[0] * v[0] + d[1] * v[1] + d[2] * v[2])];
  };
  let gSum = 0;
  let gb = 0;
  let gd = 0;
  let aSum = 0;
  let ab = 0;
  let ad = 0;
  let k = -1;
  for (const l of selection?.lines ?? []) {
    if (!l.line) continue;
    k += 1;
    if (!l.from || !l.to) continue;
    const [b, dn] = inPlane([0, 1, 2].map((i) => (l.from[i] + l.to[i]) / 2));
    const g = Number.isFinite(l.massG) ? l.massG : (l.line.gramsPerM ?? 0) * (l.lengthMM / 1000);
    gSum += g; gb += g * b; gd += g * dn;
    const area = drag?.perLine?.[k]?.dragAreaM2 ?? (l.line.diameterMM / 1000) * (l.lengthMM / 1000);
    aSum += area; ab += area * b; ad += area * dn;
  }
  // The risers' drag, when the drag counts it, at the webbing's middle.
  const riserDrag = new Map((drag?.perLine ?? []).filter((p) => p.riser).map((p) => [p.name, p.dragAreaM2]));
  for (const w of webbing ?? []) {
    const area = riserDrag.get(w.name);
    if (!(area > 0) || !w.from || !w.to) continue;
    const [b, dn] = inPlane([0, 1, 2].map((i) => (w.from[i] + w.to[i]) / 2));
    aSum += area; ab += area * b; ad += area * dn;
  }
  if (!(gSum > 0) || !(aSum > 0)) return null;
  const linesKg = (gSum * sides) / 1000;
  const own = { backM: gb / gSum, downM: gd / gSum };
  // The rest of the weight: the webbing's middle, or the karabiners.
  const mids = (webbing ?? []).filter((w) => w.from && w.to)
    .map((w) => inPlane([0, 1, 2].map((i) => (w.from[i] + w.to[i]) / 2)));
  const rest = mids.length
    ? { backM: mids.reduce((a, m) => a + m[0], 0) / mids.length, downM: mids.reduce((a, m) => a + m[1], 0) / mids.length }
    : karabiner ? (([b, dn]) => ({ backM: b, downM: dn }))(inPlane(karabiner)) : null;
  const total = Number.isFinite(massKg) && massKg > 0 ? massKg : linesKg;
  const restKg = rest ? Math.max(0, total - linesKg) : 0;
  const all = linesKg + restKg;
  const mass = restKg > 0
    ? {
      backM: ((own.backM * linesKg) + (rest.backM * restKg)) / all,
      downM: ((own.downM * linesKg) + (rest.downM * restKg)) / all,
    }
    : own;
  return {
    mass,
    massKg: total,
    linesKg,
    restKg,
    lines: own,
    rest,
    drag: { backM: ab / aSum, downM: ad / aSum },
    dragAreaM2: aSum,
  };
}

/* ---------------------------------------------------------------- report -- */

/** Everything in one call: loading, tensions, sizing, stretch. */
export function analyseLoads({
  plan, planform, stations, totalMassKg, alphaDeg = 5, twistAt = null,
  table = DEFAULT_LINE_TABLE, loadCase = DEFAULT_LOAD_CASE, rowShares = null,
  strengthBasis = 'kinked', wingAreaM2 = null,
  rowShareMode = 'convention', airfoil = null, anchors = null,
}) {
  const shareInfo = rowShares
    ? { shares: rowShares, source: 'given' }
    : rowSharesFor({ mode: rowShareMode, airfoil, anchors, alphaDeg });
  const totalLoadN = totalMassKg * loadCase.gravity;
  const span = spanLoadDistribution({
    planform, stations, totalLoadN, twistAt, alphaDeg,
  });
  const bridleShares = bridleSharesFor({
    plan, mode: rowShares ? 'given' : rowShareMode, airfoil, anchors, alphaDeg,
  });
  const loads = anchorLoads(plan, span, { rowShares: shareInfo.shares, bridleShares });
  const tensions = lineTensions(plan, loads);
  const selection = selectLines(tensions, { table, loadCase, strengthBasis });
  const stretch = stretchCorrection(selection);
  const drag = wingAreaM2 ? lineDrag(selection, { wingAreaM2 }) : null;

  const byRow = {};
  for (const l of loads) byRow[l.row] = (byRow[l.row] || 0) + l.loadN;

  return {
    totalLoadN,
    spanLoad: span,
    rowShares: shareInfo,
    bridleShares,
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

/* ------------------------------------------------------------ envelope -- */

/**
 * Line loads across the speedbar range, not just at trim.
 *
 * `analyseLoads` sizes every line for the load it carries in trimmed flight.
 * That is the wrong case, and the pressure work shows why: the chordwise load
 * distribution moves a long way on the bar, so the split between the rows at
 * full speed is not the split at trim.
 *
 * On a wing with 180 mm of travel the rear rows carry substantially more at
 * speed than they do at trim — by a quarter to a third — while the front row
 * carries less. Size the C and D lines at trim and they are undersized for the
 * condition in which the wing spends its fastest, most heavily loaded flying.
 *
 * Two things this must get right to be worth having:
 *
 * **Total load does not change.** In steady flight the lines carry the weight,
 * whatever the speed. What changes is only the distribution, so an envelope
 * that reported rising total load would be wrong. The check that the shares
 * still sum to one at every bar position is the guard on that.
 *
 * **The sweep must respect the flyable range.** Run to the end of the bar the
 * angle of attack drops below the collapse floor, and thin-aerofoil theory
 * duly reports the A row carrying *negative* load — the front of the section
 * pushing down. That is not a modelling error; it is the frontal-collapse
 * mechanism, and the A lines going slack is its precursor. But it is not a
 * load case either, because the wing is no longer flying. Positions outside
 * the flyable range are excluded from sizing and reported separately.
 */
export function loadEnvelope({
  plan, planform, stations, totalMassKg, airfoil, anchors = null,
  riser, chordM, trimAlphaDeg = 6, liftModel = null,
  barSteps = 9, alphaDeg = null, unloadWarnShare = 0.05,
}) {
  const a0 = alphaDeg ?? trimAlphaDeg;
  const anchorSet = anchors || airfoil.anchors
    || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };

  const cases = [];
  const excluded = [];

  for (let i = 0; i < barSteps; i++) {
    const bar = i / (barSteps - 1);
    const alpha = a0 + (riser ? alphaChangeFor(riser, bar, chordM) : 0);

    // Outside the flyable range this is not a load case, whatever the
    // arithmetic says.
    if (liftModel) {
      const cz = liftModel.czAt(alpha);
      if (cz < liftModel.czRange[0]) {
        excluded.push({ bar, alphaDeg: alpha, cz, reason: 'below the collapse floor' });
        continue;
      }
    }

    const shares = rowSharesFromPressure(airfoil, anchorSet, alpha);
    const negative = Object.entries(shares.shares).filter(([, v]) => v < 0).map(([k]) => k);
    if (negative.length) {
      excluded.push({ bar, alphaDeg: alpha, reason: `row ${negative.join(',')} unloads` });
      continue;
    }

    const analysis = analyseLoads({
      plan, planform, stations, totalMassKg, alphaDeg: alpha,
      rowShares: shares.shares,
    });

    cases.push({
      bar,
      alphaDeg: alpha,
      shares: shares.shares,
      centreOfPressure: shares.centreOfPressure,
      tensions: analysis.tensions,
      loadByRow: analysis.loadByRow,
      // A row approaching zero share is going slack, which is a handling and
      // collapse warning even though it is not a strength one.
      unloading: Object.entries(shares.shares)
        .filter(([, v]) => v < unloadWarnShare).map(([k]) => k),
    });
  }

  if (!cases.length) throw new Error('No flyable bar positions in the sweep.');

  // Worst tension each line sees anywhere in the flyable range.
  const worst = new Map();
  for (const c of cases) {
    for (const l of c.tensions.lines) {
      const prev = worst.get(l.name);
      if (!prev || l.tensionN > prev.tensionN) {
        worst.set(l.name, { ...l, governingBar: c.bar, governingAlphaDeg: c.alphaDeg });
      }
    }
  }

  const trimCase = cases[0];
  const trimTension = new Map(trimCase.tensions.lines.map((l) => [l.name, l.tensionN]));
  const increases = [...worst.values()].map((l) => ({
    name: l.name,
    row: l.row,
    trimN: trimTension.get(l.name) ?? 0,
    worstN: l.tensionN,
    governingBar: l.governingBar,
    increasePct: trimTension.get(l.name)
      ? ((l.tensionN / trimTension.get(l.name)) - 1) * 100 : 0,
  }));

  const byRow = {};
  for (const inc of increases) {
    if (!byRow[inc.row] || inc.increasePct > byRow[inc.row]) byRow[inc.row] = inc.increasePct;
  }

  return {
    cases,
    excluded,
    // The sizing input: worst case per line, wherever it occurs.
    tensions: { lines: [...worst.values()] },
    increases,
    worstIncreaseByRow: byRow,
    trimGoverns: increases.every((i) => i.governingBar === 0),
    flyableBars: cases.map((c) => c.bar),
    unloadingRows: [...new Set(cases.flatMap((c) => c.unloading))],
  };
}

/** Riser angle change, without importing the whole risers module eagerly. */
function alphaChangeFor(riser, bar, chordM) {
  const b = Math.max(0, Math.min(1, bar));
  const rows = riser.rows;
  const front = rows[0];
  const rear = rows[rows.length - 1];
  const dFront = b * riser.travelMM * (riser.share[front] ?? 0);
  const dRear = b * riser.travelMM * (riser.share[rear] ?? 0);
  const lever = ((riser.anchors[rear] - riser.anchors[front]) * chordM);
  if (lever <= 0) return 0;
  return -(Math.atan(((dFront - dRear) / 1000) / lever) * 180) / Math.PI;
}

/**
 * Gust load factor.
 *
 * The reason the load case is 8g and not 1g. A vertical gust changes the
 * angle of attack by roughly `w/V`, and the extra lift that produces scales
 * with dynamic pressure — so the same gust is far more punishing at speed.
 *
 *     dn = rho * V * a * w / (2 * W/S)
 *
 * with `a` the lift-curve slope per radian and `W/S` the wing loading in
 * newtons per square metre. This is the sharp-edged form, without the gust
 * alleviation factor an aeroplane would apply, so it is conservative — which
 * is the right direction for a line that has to hold.
 */
export function gustLoadFactor({
  speedMS, gustMS = 7.5, liftSlopePerRad = 5.0,
  wingLoadingNPerM2, rho = 1.225,
  // Mean chord and gravity, needed for the alleviation factor. Without them
  // the sharp-edged result is returned and says so, rather than a wrong
  // alleviation being invented from defaults.
  meanChordM = null, gravity = 9.81,
}) {
  // Sharp-edged gust: the wing meets the full gust velocity instantly.
  const sharp = (rho * speedMS * liftSlopePerRad * gustMS) / (2 * wingLoadingNPerM2);

  // Gust alleviation.
  //
  // A sharp-edged gust overstates the load, because the wing does not meet the
  // full gust velocity instantly — it accelerates upward as the gust builds,
  // reducing the change in angle of attack it actually sees. The standard
  // treatment is the Pratt-Walker factor used in CS-23 and FAR-23:
  //
  //     mu = 2 * (W/S) / (rho * c * a * g)        mass ratio
  //     Kg = 0.88 * mu / (5.3 + mu)               alleviation factor
  //
  // The mass ratio is where a paraglider is unusual. It scales with wing
  // loading, and a paraglider's is around 3.5 kg/m² against 60 or more for a
  // light aircraft — so mu is tiny and Kg is small. **A paraglider is heavily
  // alleviated**, and treating its gust case as sharp-edged overstates the
  // load by a factor of several.
  //
  // That is a physical result, not a safety margin to spend: it says where the
  // conservatism in the 8 g case comes from.
  let mu = null;
  let kg = null;
  let extrapolated = false;
  if (meanChordM > 0) {
    mu = (2 * wingLoadingNPerM2) / (rho * meanChordM * liftSlopePerRad * gravity);
    kg = (0.88 * mu) / (5.3 + mu);
    // Pratt and Walker fitted this to aeroplanes, where the mass ratio runs
    // from about 5 to 100. A paraglider comes out near 0.7 — an order of
    // magnitude below anything in the original data.
    //
    // The formula still behaves sensibly there (Kg falls smoothly toward
    // zero, and a wing that cannot resist being pushed up does see very
    // little angle-of-attack change), but it is an extrapolation and is
    // reported as one. Nothing in this project validates it at mu < 5.
    extrapolated = mu < 5;
  }

  const dn = kg === null ? sharp : sharp * kg;
  return {
    deltaN: dn,
    loadFactor: 1 + dn,
    sharpEdgedDeltaN: sharp,
    sharpEdgedLoadFactor: 1 + sharp,
    massRatio: mu,
    alleviationFactor: kg,
    alleviated: kg !== null,
    // Pratt-Walker was fitted for mass ratios of about 5 to 100.
    extrapolatedBelowFitRange: extrapolated,
    fitRange: [5, 100],
    speedMS,
    gustMS,
    // At twice the speed the same gust gives twice the increment, which is
    // why the certification case is flown fast.
    perMS: dn / (speedMS || 1),
    note: kg === null
      ? 'sharp-edged: no mean chord given, so no alleviation applied'
      : `alleviated by ${(kg).toFixed(3)} at a mass ratio of ${mu.toFixed(2)}`
        + (extrapolated
          ? '; Pratt-Walker was fitted for mass ratios of 5 to 100, so this '
            + 'is an extrapolation well below its validation range'
          : ''),
  };
}

/* ------------------------------------------------- asymmetric and collapse -- */

/**
 * The load in every line of a published cascade, in level flight.
 *
 * A maker's line sheet says which lines there are, which anchor each path
 * starts from and what every line is made of. It does not say what each
 * carries. This does, with the model the rest of this file uses: the span
 * loading of the planform, shared between the rows present at each rib, and
 * summed down each path.
 *
 * `anchors` are `{ row, rib, path }`, the path a list of line names; `rib` is
 * counted from the centre, `halfCells` to the tip, and the ribs are taken as
 * evenly spaced — which is the planform's doing, not the sheet's.
 *
 * What comes out is this model's load on that maker's lines, not a
 * measurement. Its use is the ratio: strength over load, line by line, says
 * what the maker sized for.
 */
export function publishedCascadeLoads({
  anchors, planform, halfCells, allUpKg,
  rowShares = LOAD_ROW_SHARES, alphaDeg = 5, gravity = 9.80665,
}) {
  const ribs = [...new Set(anchors.map((a) => a.rib))].sort((x, y) => x - y);
  const stations = ribs.map((r) => (r / halfCells) * planform.halfSpan);
  const span = spanLoadDistribution({
    planform, stations, totalLoadN: allUpKg * gravity, alphaDeg,
  });

  const lineLoadN = new Map();
  const loaded = [];
  for (const [i, rib] of ribs.entries()) {
    const here = anchors.filter((a) => a.rib === rib);
    // The rows that are at this rib share its load; a row that is not there
    // takes none of it.
    const present = here.reduce((t, a) => t + (rowShares[a.row] ?? 0), 0);
    for (const a of here) {
      const loadN = present > 0
        ? (span.stations[i].loadN * (rowShares[a.row] ?? 0)) / present : 0;
      loaded.push({ ...a, loadN });
      for (const name of a.path) lineLoadN.set(name, (lineLoadN.get(name) || 0) + loadN);
    }
  }
  return {
    anchors: loaded,
    lineLoadN,
    halfLoadN: span.totalHalfLoadN,
    anchorLoadN: loaded.reduce((t, a) => t + a.loadN, 0),
    ribs,
  };
}

/**
 * Strength over load, for each line of a cascade: the factor it was built to.
 *
 * `lines` are `{ name, type }`, `lineLoadN` the 1 g loads, `materials` the
 * catalogue the types are looked up in. Sorted with the hardest-worked line
 * first. A type the catalogue does not have is listed in `unknown`, and the
 * line is left out rather than given a strength.
 */
export function strengthFactors({ lines, lineLoadN, materials, basis = 'kinked' }) {
  const key = (c) => String(c || '').replace(/\s+/g, '').toUpperCase();
  const byCode = new Map(materials.map((m) => [key(m.code), m]));
  const rows = [];
  const unknown = [];
  for (const l of lines) {
    const loadN = lineLoadN.get(l.name);
    if (!(loadN > 0)) continue;
    const mat = byCode.get(key(l.type));
    if (!mat) { unknown.push(l); continue; }
    const strengthDaN = basis === 'new' ? mat.strengthNewDaN : mat.strengthKinkedDaN;
    rows.push({
      name: l.name,
      type: l.type,
      diameterMM: mat.diameterMM,
      loadDaN: loadN / 10,
      strengthDaN,
      factor: strengthDaN / (loadN / 10),
    });
  }
  rows.sort((a, b) => a.factor - b.factor);
  const f = rows.map((r) => r.factor);
  return {
    rows,
    unknown,
    basis,
    lowest: rows[0] ?? null,
    median: f.length ? f[Math.floor(f.length / 2)] : null,
    highest: rows[rows.length - 1] ?? null,
    below: (x) => f.filter((v) => v < x).length,
  };
}

/**
 * Load cases that are not symmetric steady flight.
 *
 * Everything above assumes the wing is flying level and intact. Two cases in
 * which it is not, both computed from the span loading rather than assumed:
 *
 * **Asymmetric collapse.** A fraction of one side stops producing lift. The
 * pilot's weight has not changed, so what remains must carry it — and it
 * carries it through the anchors that are still flying. The multiplier is not
 * simply `1/(1-f)` in span, because the lift lost depends on *where* the
 * collapse is: a tip collapse sheds much less lift than the same span taken
 * from mid-wing, since the loading is far higher inboard.
 *
 * **Frontal collapse.** The leading edge folds under and the front rows shed
 * their load onto the rows behind. The pressure model already predicts the
 * precursor: run the angle of attack down far enough and the A row's share
 * goes negative before anything else happens.
 *
 * The dynamic factor covers the surge and re-inflation that follow, and is
 * the least defensible number here — it is a stand-in for a transient the
 * static model cannot represent. It is stated as an input rather than buried.
 *
 * ---------------------------------------------------------------------------
 * What these cases are multiples OF
 * ---------------------------------------------------------------------------
 * Of the load in level flight. Half a wing gone, with the surge, puts 2.5
 * times its 1 g load into the lines that are left. The symmetric case this
 * file sizes to is 8 g. A collapse in level flight is a third of that.
 *
 * This comment used to say that the 8 g case "is not what breaks lines.
 * Lines break in collapses", and `designEnvelope` put the collapse multiplier
 * ON TOP of the 8 g: 8 x 1.5 x 2.54 = 30 times the level-flight load, in
 * every line, "which is what a line schedule should be built from". A wing
 * cannot be pulling 8 g with half of itself folded — the half that is left
 * would be at 16 — and the check that was offered for the figure, "28x on
 * PHI's most load-critical line", was a load worked out by hand that left
 * the D row off the main line it hangs from. Computed from PHI's sheet
 * (`publishedCascadeLoads`), that wing's hardest-worked line is at 9 times
 * its level-flight load on kinked strength and 16 on new, and half its 62
 * lines are under 30.
 *
 * So each case carries its own load factor now, and a collapse governs a line
 * only if the wing is collapsed at more than about 3 g: `governingCollapseG`.
 */
export function asymmetricCollapse({
  spanLoad, plan, loads, collapsedSpanFraction = 0.5,
  fromTip = true, dynamicFactor = 1.5,
}) {
  const half = spanLoad.stations;
  const total = half.reduce((a, s) => a + s.loadN, 0);
  if (total <= 0) throw new Error('No span load to redistribute.');

  // Which stations are inside the collapsed region.
  const maxStation = Math.max(...half.map((s) => s.station));
  const cut = maxStation * (1 - collapsedSpanFraction);
  const isCollapsed = (s) => (fromTip ? s.station >= cut : s.station <= maxStation * collapsedSpanFraction);

  const lostN = half.filter(isCollapsed).reduce((a, s) => a + s.loadN, 0);
  const lostFraction = lostN / total;

  // The intact side carries what the collapsed side has dropped. Both sides
  // of the wing are in play — one collapsed, one flying — so the flying side
  // picks up the whole of the lost load, not half of it.
  const survivingFraction = 1 - lostFraction;
  const multiplier = survivingFraction > 1e-6
    ? (1 + lostFraction / survivingFraction) * dynamicFactor
    : Infinity;

  const scaled = loads.map((l) => ({
    ...l,
    loadN: l.loadN * multiplier,
    collapsed: false,
  }));

  return {
    case: fromTip ? 'asymmetric tip collapse' : 'asymmetric inboard collapse',
    collapsedSpanFraction,
    // The distinction that matters: half the span is not half the lift.
    lostLiftFraction: lostFraction,
    multiplier,
    dynamicFactor,
    loads: scaled,
    tensions: lineTensions(plan, scaled),
  };
}

/**
 * Frontal collapse: the front rows shed their load onto those behind.
 *
 * `shed` is the fraction of the front row's load that transfers. It is
 * redistributed over the remaining rows in proportion to what they already
 * carry, which is the assumption that the chordwise load simply moves back
 * rather than changing shape — crude, and stated as such.
 */
export function frontalCollapse({
  plan, loads, frontRows = ['A'], shed = 1.0, dynamicFactor = 1.4,
}) {
  const frontTotal = loads.filter((l) => frontRows.includes(l.row))
    .reduce((a, l) => a + l.loadN, 0);
  const rearTotal = loads.filter((l) => !frontRows.includes(l.row))
    .reduce((a, l) => a + l.loadN, 0);
  if (rearTotal <= 0) throw new Error('No rear rows to carry a frontal collapse.');

  const transfer = frontTotal * shed;
  const scaled = loads.map((l) => {
    if (frontRows.includes(l.row)) {
      return { ...l, loadN: l.loadN * (1 - shed) * dynamicFactor, collapsed: true };
    }
    const gain = transfer * (l.loadN / rearTotal);
    return { ...l, loadN: (l.loadN + gain) * dynamicFactor, collapsed: false };
  });

  return {
    case: 'frontal collapse',
    shed,
    dynamicFactor,
    transferredN: transfer,
    loads: scaled,
    tensions: lineTensions(plan, scaled),
  };
}

/**
 * The design envelope: the symmetric limit case and the collapse cases, each
 * at the load factor it happens at, and every line sized for the worst.
 *
 * A case's tensions are given at 1 g. The symmetric case is flown to
 * `loadCase.limitG`; a collapse case to its own `atG`, or `collapseAtG` — 1
 * unless told otherwise, which is a wing collapsing in level flight.
 *
 * `governingCollapseG` is the answer to "when would a collapse size this
 * lineset?": the load factor above which the worst collapse case overtakes
 * the symmetric one on some line. For half the span gone with a dynamic
 * factor of 1.5 it is a little over 3 g.
 */
export function designEnvelope({
  symmetric, collapseCases = [], loadCase = DEFAULT_LOAD_CASE, table = DEFAULT_LINE_TABLE,
  collapseAtG = 1,
}) {
  const worst = new Map();
  const base = new Map(symmetric.tensions.lines.map((l) => [l.name, l.tensionN]));
  // How hard each line is worked in a collapse case, against level flight.
  let worstRatio = 0;
  const record = (caseName, lines, atG) => {
    for (const l of lines) {
      const limitTensionN = l.tensionN * atG;
      const prev = worst.get(l.name);
      if (!prev || limitTensionN > prev.limitTensionN) {
        worst.set(l.name, {
          ...l, limitTensionN, governingCase: caseName, governingG: atG,
        });
      }
      if (caseName !== 'symmetric' && base.get(l.name) > 0) {
        worstRatio = Math.max(worstRatio, l.tensionN / base.get(l.name));
      }
    }
  };

  record('symmetric', symmetric.tensions.lines, loadCase.limitG);
  for (const c of collapseCases) record(c.case, c.tensions.lines, c.atG ?? collapseAtG);

  const lines = [...worst.values()];
  const byCase = {};
  for (const l of lines) byCase[l.governingCase] = (byCase[l.governingCase] || 0) + 1;

  return {
    // `tensionN` is the LIMIT tension from here on: the 1 g tension of the
    // governing case times that case's load factor.
    tensions: { lines: lines.map((l) => ({ ...l, tensionN: l.limitTensionN })) },
    governingCases: byCase,
    collapseAtG,
    collapseGoverns: Object.keys(byCase).some((k) => k !== 'symmetric'),
    // The hardest any line is worked by a collapse, as a multiple of level
    // flight, and the load factor at which that reaches the symmetric limit.
    worstCollapseMultiple: worstRatio || null,
    governingCollapseG: worstRatio > 0 ? loadCase.limitG / worstRatio : null,
    // The limit is already in the tensions, so the selection applies only
    // the margin on top of it.
    selection: selectLines(
      { lines: lines.map((l) => ({ ...l, tensionN: l.limitTensionN })) },
      { loadCase: { ...loadCase, limitG: 1 }, table },
    ),
  };
}

/**
 * The gust response, integrated rather than looked up.
 *
 * `gustLoadFactor` applies the Pratt-Walker alleviation factor, which is a
 * closed-form fit to the response of an aeroplane. A paraglider's mass ratio
 * is about 0.67 against the 5 to 100 that fit was built from, so the factor
 * is being extrapolated an order of magnitude below its data — and this
 * project has no way to check it there empirically.
 *
 * What it can do is check it against **first principles**. The wing's motion
 * through a gust is a one-line equation of motion:
 *
 *     m z'' = ½ρVSa (w(t) − z')
 *
 * The wing sees the gust velocity `w` minus its own upward velocity `z'`. It
 * accelerates upward, which reduces what it sees, which reduces the
 * acceleration. That feedback *is* the alleviation — nothing empirical about
 * it. Integrating it for a 1-cosine gust and reading the peak gives an
 * independent answer.
 *
 * If the integration and Pratt-Walker agree at low mass ratio, the
 * extrapolation is sound. If they do not, the closed form is being used
 * outside where it works and this says by how much.
 */
export function gustResponse({
  speedMS, gustMS = 7.5, liftSlopePerRad = 5.0,
  wingLoadingNPerM2, rho = 1.225, gravity = 9.81,
  // Gust gradient distance. CS-23 uses 12.5 mean chords for the 1-cosine
  // gust; the classic sharp-edged case is the limit as this goes to zero.
  gradientChords = 12.5, meanChordM,
  steps = 4000,
}) {
  if (!(meanChordM > 0)) throw new Error('gustResponse needs a mean chord');
  if (!(speedMS > 0)) throw new Error('gustResponse needs a speed');

  const H = gradientChords * meanChordM;          // gradient distance, m
  const mass = wingLoadingNPerM2 / gravity;       // mass per unit area
  // z'' = k (w - z'), with k the aerodynamic response rate.
  const k = (rho * speedMS * liftSlopePerRad) / (2 * mass);

  // A 1-cosine gust of total length 2H, traversed at the flight speed.
  const duration = (2 * H) / speedMS;
  const dt = duration / steps;
  const w = (t) => {
    const x = speedMS * t;
    if (x < 0 || x > 2 * H) return 0;
    return (gustMS / 2) * (1 - Math.cos((Math.PI * x) / H));
  };

  let zdot = 0;
  let peak = 0;
  let peakAtM = 0;
  const trace = [];
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const relative = w(t) - zdot;
    const zddot = k * relative;
    const dn = zddot / gravity;
    if (dn > peak) { peak = dn; peakAtM = speedMS * t; }
    if (i % Math.max(1, Math.floor(steps / 40)) === 0) {
      trace.push({ distanceM: speedMS * t, gustMS: w(t), ownVelocityMS: zdot, deltaN: dn });
    }
    // Explicit Euler is fine here: the response rate is slow against dt, and
    // halving the step changes the peak by less than 0.1%.
    zdot += zddot * dt;
  }

  // The same gust with no alleviation at all: the wing sees all of it.
  const sharp = (rho * speedMS * liftSlopePerRad * gustMS) / (2 * wingLoadingNPerM2);

  return {
    deltaN: peak,
    loadFactor: 1 + peak,
    sharpEdgedDeltaN: sharp,
    // The alleviation the integration produces, with nothing fitted.
    alleviationFactor: sharp > 0 ? peak / sharp : 0,
    gradientDistanceM: H,
    peakAtM,
    responseRatePerS: k,
    trace,
    // Quasi-steady: the lift is taken to follow the angle of attack
    // instantly. It does not — the Küssner and Wagner functions describe the
    // lag as circulation builds — so this overstates how quickly the wing
    // responds and therefore how much it alleviates.
    //
    // That bounds the comparison rather than settling it. Where the two
    // agree, both are probably right; where they diverge, the direction is
    // what matters.
    quasiSteady: true,
    note: 'alleviation from integrating the equation of motion, with no '
      + 'empirical factor; quasi-steady, so lift lag is not represented',
  };
}

/**
 * Choose a small set of line types to build the whole wing from.
 *
 * `selectLines` picks, for each line independently, the lightest material
 * that carries it. That is optimal per line and wrong for a workshop: it came
 * back with **seven** distinct materials across three suppliers for one
 * 76-line wing, and nobody builds a wing that way. Every extra type is
 * another spool to buy, another splice setup, and another chance of sewing
 * the wrong line into the wing.
 *
 * Real wings use four to six types from one supplier. So the question a
 * designer actually has is not "what is the best line for this anchor" but
 * **"which N types should I stock, so that every line is covered and the
 * total cost is least"** — where cost is drag, or mass, or whatever they are
 * trading.
 *
 * ---------------------------------------------------------------------------
 * This is solvable exactly, not approximately
 * ---------------------------------------------------------------------------
 * Sort the materials by strength. Any line takes the weakest chosen material
 * that still carries it, so a choice of N materials partitions the
 * load-sorted lines into N contiguous groups. Minimising over all such
 * partitions is a one-dimensional k-segmentation, which dynamic programming
 * solves exactly in O(lines x materials^2).
 *
 * A greedy pick would be quicker and would be beaten by cases that matter:
 * the best set of four is not usually the best set of three plus one.
 */
export function optimiseLineSet(tensions, {
  table = DEFAULT_LINE_TABLE,
  maxTypes = 5,
  loadCase = DEFAULT_LOAD_CASE,
  strengthBasis = 'kinked',
  minimise = 'drag',
  brakeSafetyFactor = 2.0,
  minimumDiameterMM = PRACTICAL_FLOOR.diameterMM,
} = {}) {
  if (!(maxTypes >= 1)) throw new Error('optimiseLineSet needs maxTypes >= 1');
  if (!['drag', 'mass'].includes(minimise)) {
    throw new Error(`optimiseLineSet: minimise is 'drag' or 'mass' (got ${minimise})`);
  }

  const rated = (m) => (strengthBasis === 'new' ? m.strengthNewDaN : m.strengthKinkedDaN);

  // What each line has to carry, and how long it is.
  const lines = tensions.lines.map((l) => ({
    name: l.name,
    row: l.row,
    lengthM: (l.lengthMM ?? 0) / 1000,
    // The same relation `selectLines` uses, read from it rather than
    // reinvented: tension x limit g x safety factor, and brakes take the
    // brake factor instead of the general one.
    //
    // My first version multiplied by `loadCase.factor`, which does not exist.
    // Every required load came out NaN, no material could carry NaN, and the
    // optimiser reported that no set of any size covered the wing.
    requiredDaN: (l.tensionN * loadCase.limitG
      * (l.row === 'K' ? brakeSafetyFactor : loadCase.safetyFactor)) / 10,
  })).filter((l) => l.lengthM > 0);

  if (!lines.length) {
    return { chosen: [], lines: [], ok: false, note: 'no lines to size' };
  }

  // Candidates: strong enough for at least one line, thick enough to handle.
  const candidates = table
    .filter((m) => m.diameterMM >= minimumDiameterMM && rated(m) > 0)
    .sort((a, b) => rated(a) - rated(b));

  const heaviest = Math.max(...lines.map((l) => l.requiredDaN));
  if (!candidates.length || rated(candidates[candidates.length - 1]) < heaviest) {
    return {
      chosen: [], lines: [], ok: false,
      note: `no material in the table carries ${heaviest.toFixed(0)} daN; the `
        + `strongest is ${candidates.length ? rated(candidates[candidates.length - 1]).toFixed(0) : 0} daN`,
    };
  }

  // Cost of building a line from a material.
  const cost = (l, m) => (minimise === 'drag'
    ? l.lengthM * (m.diameterMM / 1000)      // drag goes as length x diameter
    : l.lengthM * m.gramsPerM);

  // Lines sorted by what they need, so a chosen material serves a contiguous
  // run of them.
  const sorted = lines.slice().sort((a, b) => a.requiredDaN - b.requiredDaN);

  // The cheapest material that carries a load — not the weakest.
  //
  // Strength order and diameter order are not the same: a better material is
  // stronger AND thinner, so "first in strength order that carries" can be
  // thicker than something further along. Using it made the per-line floor
  // more expensive than the constrained answer, and the optimiser reported a
  // NEGATIVE penalty — which is impossible and was the clue.
  const bestFor = (need, unitCost) => {
    let best = null;
    let bestC = Infinity;
    for (const m of candidates) {
      if (rated(m) < need) continue;
      const c = unitCost(m);
      if (c < bestC) { bestC = c; best = m; }
    }
    return best;
  };
  const unitCost = (m) => (minimise === 'drag'
    ? m.diameterMM / 1000 : m.gramsPerM);

  // seg[i][j] = cost of covering sorted[i..j] with the weakest material that
  // carries sorted[j], which is the one the whole run would use.
  const n = sorted.length;
  const materialFor = (need) => bestFor(need, unitCost);
  const segCost = [];
  const segMat = [];
  for (let i = 0; i < n; i++) {
    segCost.push(new Float64Array(n).fill(Infinity));
    segMat.push(new Array(n).fill(null));
    for (let j = i; j < n; j++) {
      const m = materialFor(sorted[j].requiredDaN);
      if (!m) break;
      let c = 0;
      for (let k = i; k <= j; k++) c += cost(sorted[k], m);
      segCost[i][j] = c;
      segMat[i][j] = m;
    }
  }

  // dp[t][j] = least cost of covering sorted[0..j] with t materials.
  const K = Math.min(maxTypes, candidates.length);
  const dp = [];
  const back = [];
  for (let t = 0; t <= K; t++) {
    dp.push(new Float64Array(n).fill(Infinity));
    back.push(new Array(n).fill(-1));
  }
  for (let j = 0; j < n; j++) dp[1][j] = segCost[0][j];
  for (let t = 2; t <= K; t++) {
    for (let j = 0; j < n; j++) {
      for (let i = 1; i <= j; i++) {
        const c = dp[t - 1][i - 1] + segCost[i][j];
        if (c < dp[t][j]) { dp[t][j] = c; back[t][j] = i; }
      }
    }
  }

  // The best t is not always K: a type that saves nothing is a type not worth
  // stocking, so the smallest t within a hair of the best is taken.
  // Start from the smallest FEASIBLE depth, not from 1.
  //
  // One material rarely covers every load, so dp[1] is usually Infinity — and
  // `Infinity < Infinity * 0.999` is false, so a loop seeded at t=1 never
  // moved off it and every wing came back "no set of 1 materials covers these
  // loads". The comparison was right; the starting point was not.
  let bestT = -1;
  for (let t = 1; t <= K; t++) {
    if (Number.isFinite(dp[t][n - 1])) { bestT = t; break; }
  }
  if (bestT < 0) {
    return {
      chosen: [], lines: [], ok: false, typeCount: 0,
      note: `no set of up to ${K} materials covers these loads; the heaviest `
        + `line needs ${heaviest.toFixed(0)} daN`,
    };
  }
  // Then take a deeper set only if it saves something worth stocking a spool
  // for. A type that buys under a tenth of a percent is a type not worth
  // having.
  for (let t = bestT + 1; t <= K; t++) {
    if (dp[t][n - 1] < dp[bestT][n - 1] * 0.999) bestT = t;
  }

  // Walk the choice back out.
  // A back-pointer of -1 means no valid split was found at that depth, so
  // walking it blindly indexes segMat[-1] and crashes on a null material.
  // The walk stops and reports instead: an optimiser that cannot cover the
  // loads should say so, not throw.
  const groups = [];
  let j = n - 1;
  for (let t = bestT; t >= 1; t--) {
    const i = t === 1 ? 0 : back[t][j];
    if (i < 0 || i > j || !segMat[i] || !segMat[i][j]) {
      return {
        chosen: [], lines: [], ok: false, typeCount: 0,
        note: `no set of ${bestT} materials covers these loads; the heaviest `
          + `line needs ${heaviest.toFixed(0)} daN`,
      };
    }
    groups.unshift({ from: i, to: j, material: segMat[i][j] });
    j = i - 1;
  }

  const assigned = new Map();
  for (const g of groups) {
    for (let k = g.from; k <= g.to; k++) assigned.set(sorted[k].name, g.material);
  }

  const totalCost = dp[bestT][n - 1];
  // What the per-line optimum would cost, as the floor this is measured
  // against: it is unbuildable, but it says what the constraint costs.
  const perLineFloor = sorted.reduce((a, l) => {
    const m = materialFor(l.requiredDaN);
    return a + (m ? cost(l, m) : 0);
  }, 0);

  return {
    chosen: groups.map((g) => ({
      code: g.material.code,
      name: g.material.name,
      diameterMM: g.material.diameterMM,
      ratedDaN: rated(g.material),
      lines: g.to - g.from + 1,
      heaviestLoadDaN: sorted[g.to].requiredDaN,
    })),
    typeCount: bestT,
    maxTypes: K,
    lines: sorted.map((l) => ({ ...l, line: assigned.get(l.name) })),
    ok: true,
    minimise,
    totalCost,
    perLineFloor,
    // What restricting the wing to this many types costs against the
    // unbuildable per-line optimum.
    penalty: perLineFloor > 0 ? totalCost / perLineFloor - 1 : 0,
    exact: true,
    note: `${bestT} type${bestT > 1 ? 's' : ''} covers ${n} lines, `
      + `${(100 * (perLineFloor > 0 ? totalCost / perLineFloor - 1 : 0)).toFixed(1)}% `
      + `more ${minimise} than a different line at every anchor`,
  };
}

/**
 * The direction each riser has to point: along the resultant of the tensions
 * in the lines at its top.
 *
 * A riser is webbing and carries only tension, so it lies along whatever pulls
 * on its top. A plan places its riser tops before any load is known — at the
 * weighted centre of each riser's anchors, as LEparagliding does — and this
 * closes the loop: build the plan, solve the loads, point each riser along its
 * resultant, build again. One pass is enough; the resultant moves by a
 * fraction of a degree when the geometry it came from does.
 *
 * On the demo wing the centroid construction leans the risers 19.8 degrees
 * outboard where the lifting-line loads put the resultant at 14.2: this model
 * loads the tips less than chord-weighting does.
 */
export function riserResultants(plan, tensions) {
  const T = new Map((tensions?.lines ?? []).map((t) => [t.name, t.tensionN]));
  const out = {};
  for (const r of plan.risers ?? []) {
    const top = r.maillon;
    if (!top) continue;
    let R = [0, 0, 0];
    for (const l of plan.lines) {
      if (l.row === 'K') continue;
      if (Math.hypot(l.from[0] - top[0], l.from[1] - top[1], l.from[2] - top[2]) > 1e-9) continue;
      const t = T.get(l.name) ?? 0;
      const d = [l.to[0] - l.from[0], l.to[1] - l.from[1], l.to[2] - l.from[2]];
      const n = Math.hypot(d[0], d[1], d[2]);
      if (!(n > 0)) continue;
      R = [R[0] + (t * d[0]) / n, R[1] + (t * d[1]) / n, R[2] + (t * d[2]) / n];
    }
    const m = Math.hypot(R[0], R[1], R[2]);
    if (m > 0) out[r.name] = [R[0] / m, R[1] / m, R[2] / m];
  }
  return out;
}
