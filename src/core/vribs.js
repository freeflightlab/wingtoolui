/* vribs.js — diagonal ribs.
 *
 * Chapter 7 of the handbook is figures without text, so this is a
 * reconstruction from the drawings and from what the geometry has to do.
 *
 * --------------------------------------------------------------------------
 * Why they exist, and why this project already needed them
 * --------------------------------------------------------------------------
 * Every line attachment is a point of drag and a point of load. Modern wings
 * therefore attach lines to every second or third rib rather than to all of
 * them — the line plans in `lineplan.js` already do exactly this, with
 * `everyNthRib: 2`.
 *
 * That leaves a problem the line plan quietly assumed away. The ribs with no
 * line on them still carry lift, and it has to reach the lineset somehow. A
 * diagonal rib is what carries it: a triangular panel running from the
 * attachment point on a loaded rib, diagonally across the cell, to a line
 * along the upper surface of the unloaded rib beside it. The load spreads
 * from a line of fabric down to a point.
 *
 * So this is not an optional refinement. Without diagonals, a wing whose
 * lines attach every second rib has half its span hanging on nothing.
 *
 * --------------------------------------------------------------------------
 * The flat pattern is an exact cone development
 * --------------------------------------------------------------------------
 * A diagonal rib is a fan: one apex, and a base curve lying on the neighbouring
 * rib's surface. That is a cone, and a cone is developable — it flattens with
 * no distortion at all, unlike the wing's own panels.
 *
 * The development follows from that. Place the apex, and lay each base point
 * at its true distance from the apex, with the angle between successive base
 * points taken from the triangle they form:
 *
 *     cos(dphi) = (r_k^2 + r_k+1^2 - s^2) / (2 r_k r_k+1)
 *
 * with s the true distance between the two base points. Every radius and every
 * base segment then comes out exact, which is asserted rather than assumed.
 */

import { dist3 } from './num.js';
import { ribSurfacePoint } from './wing3d.js';

/**
 * Build the diagonal ribs for a wing.
 *
 * Where they go follows from where the LINES are, and that is the plan's to
 * say. A diagonal hangs from a line: its apex is the anchor on a rib that
 * carries one, and it reaches the upper seam of a neighbour that does not.
 * So the caller hands over the ribs each row's lines actually attach to
 * (`anchorRibsByRow`, from `planAnchorRibs`), or — for a design that states
 * its own — the pieces themselves (`placed`).
 *
 * The interface used to pass every second rib whatever the plan was. That is
 * right for the default plan and for nothing else: a written cascade spreads
 * each row's anchors at its own spacing, and the Swoop2 attaches on ribs
 * 2-3, 6-7, 10-11 ... of its 26, so its diagonals were drawn with their
 * apexes on ribs that have no line — and "Diagonal reach" could not do
 * anything, because every unlined rib sat beside a lined one by construction.
 *
 * @param {object} o
 * @param {object} o.wing
 * @param {object} o.airfoil
 * @param {number[]} o.anchorRibs       ribs that carry lines, the same for
 *                                      every row (the old form)
 * @param {object} o.anchorRibsByRow    `{ A: [...], B: [...] }`: per row
 * @param {object[]} o.placed           `{ row, fromRib, toRib }`: the pieces
 *                                      themselves, when a design states them
 * @param {string[]} o.rows             which anchor rows get diagonals
 * @param {number} o.baseSpread         chordwise extent of the base, as a
 *                                      fraction of chord, centred on the
 *                                      anchor position
 * @param {number} o.points             points along the base curve
 */
export function buildVRibs({
  wing,
  airfoil,
  anchorRibs = null,
  anchorRibsByRow = null,
  placed = null,
  rows = ['B', 'C'],
  baseSpread = 0.18,
  // Below this a diagonal is not worth making, so it is not placed.
  //
  // Defaults to 0 — place one wherever the rule says — because turning it on
  // by default changes an existing design without being asked, and it can
  // leave a rib with nothing holding it, which `unsupportedRibs` reports.
  //
  // So it is a choice a designer makes and checks, not a new default they
  // inherit.
  minLengthM = 0,
  points = 12,
  surface = 'upper',
  maxReach = 1,
}) {
  const ribs = wing.ribs;
  const fractions = airfoil?.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  const everySecond = ribs.map((_, i) => i).filter((i) => i % 2 === 0);
  const inRange = (i) => Number.isInteger(i) && i >= 0 && i < ribs.length;
  const clean = (list) => [...new Set((list ?? []).filter(inRange))].sort((a, b) => a - b);

  // The ribs with a line on them, per row and all together.
  const byRow = {};
  if (anchorRibsByRow) {
    for (const [row, list] of Object.entries(anchorRibsByRow)) byRow[row] = clean(list);
  }
  const anchorsFor = (row) => (anchorRibsByRow
    ? (byRow[row] ?? [])
    : clean(anchorRibs || everySecond));
  const lined = new Set(anchorRibsByRow
    ? Object.values(byRow).flat()
    : clean(anchorRibs || everySecond));

  // An imported rib says where its own anchors are; the Swoop2's tip rib has
  // them at 5, 40 and 77% where the rest have 11, 39 and 67.
  const fractionAt = (i, row) => ribs[i]?.anchors?.[row] ?? fractions[row];
  const clampChord = (t) => Math.min(0.98, Math.max(0.02, t));

  const out = [];
  // Diagonals the rule asked for that came out too small to be worth making.
  const skipped = [];
  // Pieces a design states that this wing cannot hold.
  const notPlaced = [];

  const place = (row, i, j, reach, extra = {}) => {
    const frac = fractionAt(i, row);
    if (!(frac > 0 && frac < 1)) return;
    const apex = ribSurfacePoint(ribs[i], 'lower', frac);

    // The base stays at the apex's own chord fraction, along the UPPER SEAM
    // of the neighbouring rib: every stitch of a diagonal is on a seam — a
    // point on the lower seam of the rib with the line, a chordwise run of
    // the upper seam of the rib without.
    const base = [];
    for (let p = 0; p < points; p++) {
      const t = frac - baseSpread / 2 + (baseSpread * p) / (points - 1);
      base.push(ribSurfacePoint(ribs[j], surface, clampChord(t)));
    }
    const mid = base[Math.floor(base.length / 2)];
    const lengthM = dist3(apex, mid);

    // A diagonal that has come out too small is not placed at all, when the
    // caller sets a limit.
    //
    // Towards the tip the cells narrow and the section thins, and both legs
    // shrink together: on the default wing the rear row runs from 307 mm at
    // the root to 174 mm in the last cell. A piece much smaller than that
    // adds two seams and some weight and carries almost nothing, which is
    // why real wings stop placing diagonals before the tip.
    if (minLengthM > 0 && lengthM < minLengthM) {
      skipped.push({ row, fromRib: i, toRib: j, lengthM });
      return;
    }

    // How steeply it rises, measured IN ITS OWN CELL: from the cell's floor,
    // which is the lower surface running from the apex to the neighbouring
    // rib's own lower seam at the same station.
    //
    // Not from the horizon. A cell near the tip is tilted fifty or sixty
    // degrees by the arc, and a diagonal there rises inside it exactly as
    // one at the root does; measured against the horizon it read as lying
    // flat: 28 of the default wing's 96 a side would be flagged as too
    // shallow to carry load, for no reason but where on the arc they are.
    const floor = ribSurfacePoint(ribs[j], 'lower', clampChord(frac));
    const f = [floor[0] - apex[0], floor[1] - apex[1], floor[2] - apex[2]];
    const d = [mid[0] - apex[0], mid[1] - apex[1], mid[2] - apex[2]];
    const fl = Math.hypot(f[0], f[1], f[2]);
    const riseDeg = fl > 0 && lengthM > 0
      ? Math.acos(Math.max(-1, Math.min(1,
        (f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / (fl * lengthM)))) * (180 / Math.PI)
      : 0;

    // The direction of the load it holds down: the lift of the rib its base
    // is sewn to, which acts along that rib — from its lower seam to its
    // upper at this station. `diagonalTension` reads it.
    const top = ribSurfacePoint(ribs[j], 'upper', clampChord(frac));
    const up = [top[0] - floor[0], top[1] - floor[1], top[2] - floor[2]];
    const ul = Math.hypot(up[0], up[1], up[2]);
    const liftDirection = ul > 0 ? [up[0] / ul, up[1] / ul, up[2] / ul] : null;

    const flat = developFan(apex, base);
    out.push({
      row,
      fromRib: i,
      toRib: j,
      reach,
      anchorFraction: frac,
      apex,
      base,
      flat,
      lengthM,
      riseDeg,
      ...(liftDirection ? { liftDirection } : {}),
      areaM2: fanArea(apex, base),
      // Height of the triangle: how far the load travels diagonally.
      spanM: Math.abs(ribs[j].station - ribs[i].station),
      meanRadiusM: base.reduce((a, b) => a + dist3(apex, b), 0) / base.length,
      ...extra,
    });
  };

  if (placed) {
    // The design's own pieces, as it states them.
    for (const p of placed) {
      if (!inRange(p.fromRib) || !inRange(p.toRib) || p.fromRib === p.toRib) {
        notPlaced.push({ ...p, why: 'rib out of range' });
        continue;
      }
      if (fractionAt(p.fromRib, p.row) == null) {
        notPlaced.push({ ...p, why: `no ${p.row} anchor on rib ${p.fromRib}` });
        continue;
      }
      const before = out.length + skipped.length;
      place(p.row, p.fromRib, p.toRib, Math.abs(p.toRib - p.fromRib),
        p.source ? { source: p.source } : {});
      if (out.length + skipped.length === before) {
        notPlaced.push({ ...p, why: 'no anchor position' });
      }
    }
  } else {
    // Rib by rib, then row by row on each: the order the pieces are cut
    // and numbered in.
    const sets = {};
    for (const row of rows) {
      if (fractions[row] != null) sets[row] = new Set(anchorsFor(row));
    }
    const every = clean(Object.values(sets).flatMap((x) => [...x]));
    for (const i of every) {
      for (const row of rows) {
        const has = sets[row];
        if (!has || !has.has(i)) continue;
        // Each unloaded neighbour needs its load carried to this rib.
        //
        // `maxReach` is how many cells a diagonal spans. One is enough when
        // lines are on every second rib, and when they come in pairs with
        // two free ribs between, as on the Swoop2. Spread the attachments
        // further and a single-cell diagonal cannot reach the middle of the
        // gap — those ribs come back in `unsupportedRibs`, which is a real
        // constraint rather than a modelling limit: a wing rigged that way
        // needs longer diagonals, and this is where a designer finds out.
        for (let reach = 1; reach <= maxReach; reach++) {
          for (const dir of [-1, +1]) {
            const j = i + dir * reach;
            if (j < 0 || j >= ribs.length) continue;
            if (has.has(j)) continue;        // that rib carries its own line
            // Do not reach across another attachment rib.
            let blocked = false;
            for (let step = 1; step < reach; step++) {
              if (has.has(i + dir * step)) blocked = true;
            }
            if (blocked) continue;
            place(row, i, j, reach);
          }
        }
      }
    }
  }

  // Ribs with no line and no diagonal reaching them are unsupported, which
  // is a design error rather than a style choice. A stated set of pieces
  // has no line information of its own, so the ribs their apexes sit on
  // stand in for it unless the caller says where the lines are.
  const holds = new Set(lined);
  if (placed && !anchorRibsByRow && !anchorRibs) {
    holds.clear();
    for (const v of out) holds.add(v.fromRib);
  }

  return {
    vribs: out,
    count: out.length,
    // Diagonals the rule asked for but which came out too small to be worth
    // making.
    skipped,
    notPlaced,
    minLengthM,
    totalAreaM2: out.reduce((a, v) => a + v.areaM2, 0),
    // Every rib with a line on it, and the same row by row.
    anchorRibs: [...holds].sort((a, b) => a - b),
    anchorRibsByRow: anchorRibsByRow ? byRow : null,
    stated: !!placed,
    unsupportedRibs: ribs
      .map((_, i) => i)
      .filter((i) => !holds.has(i) && !out.some((v) => v.toRib === i)),
  };
}

/**
 * Develop a fan (cone) flat, exactly.
 *
 * Returns the apex at the origin and the base as a polyline. Every radius and
 * every base segment length is preserved to machine precision, because a cone
 * is developable — no approximation is involved and none should be tolerated.
 */
export function developFan(apex, base) {
  const r = base.map((b) => dist3(apex, b));
  const pts = [];
  let phi = 0;

  pts.push([r[0], 0]);
  for (let k = 1; k < base.length; k++) {
    const s = dist3(base[k - 1], base[k]);
    const a = r[k - 1];
    const b = r[k];
    if (a < 1e-12 || b < 1e-12) { pts.push([b, phi]); continue; }
    // Law of cosines for the angle subtended at the apex.
    let c = (a * a + b * b - s * s) / (2 * a * b);
    c = Math.min(1, Math.max(-1, c));
    phi += Math.acos(c);
    pts.push([b, phi]);
  }

  return {
    apex: [0, 0],
    // Polar to cartesian, with the fan opened about the apex.
    base: pts.map(([rad, ang]) => [rad * Math.cos(ang), rad * Math.sin(ang)]),
    radii: r,
    totalAngle: phi,
    // The outline a cutter follows: apex, round the base, back to apex.
    outline: [[0, 0], ...pts.map(([rad, ang]) => [rad * Math.cos(ang), rad * Math.sin(ang)])],
  };
}

/** Surface area of the fan, by summing its triangles. */
function fanArea(apex, base) {
  let a = 0;
  for (let k = 1; k < base.length; k++) {
    a += triangleArea(apex, base[k - 1], base[k]);
  }
  return a;
}

function triangleArea(p, q, r) {
  const ux = q[0] - p[0];
  const uy = q[1] - p[1];
  const uz = q[2] - p[2];
  const vx = r[0] - p[0];
  const vy = r[1] - p[1];
  const vz = r[2] - p[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/**
 * Check the development is exact.
 *
 * A cone flattens without distortion, so both the radii and the base segment
 * lengths must survive to machine precision. This is the same class of check
 * as the cylinder and cone cases in the panel development, and it should hold
 * to the same tolerance — if it does not, the fan is not being treated as the
 * developable surface it is.
 */
export function fanDevelopmentError(apex, base) {
  const flat = developFan(apex, base);
  let worstRadius = 0;
  let worstSegment = 0;
  for (let k = 0; k < base.length; k++) {
    const trueR = dist3(apex, base[k]);
    const flatR = Math.hypot(flat.base[k][0], flat.base[k][1]);
    worstRadius = Math.max(worstRadius, Math.abs(flatR - trueR));
    if (k > 0) {
      const trueS = dist3(base[k - 1], base[k]);
      const flatS = Math.hypot(
        flat.base[k][0] - flat.base[k - 1][0],
        flat.base[k][1] - flat.base[k - 1][1],
      );
      worstSegment = Math.max(worstSegment, Math.abs(flatS - trueS));
    }
  }
  return { worstRadiusM: worstRadius, worstSegmentM: worstSegment };
}

/**
 * How much load each diagonal carries.
 *
 * The unloaded rib's share of the span load has to reach an attachment point,
 * and it reaches it through the diagonals on either side. Split between them
 * in proportion to how close each is — a rib midway between two attachments
 * sends half each way.
 *
 * This is the load the diagonal's seam has to hold, and it is not small: it
 * is the whole of that rib's lift, arriving at one point.
 */
export function vribLoads(vribSet, spanLoad, { rowShares = null } = {}) {
  const byTarget = new Map();
  for (const v of vribSet.vribs) {
    if (!byTarget.has(v.toRib)) byTarget.set(v.toRib, []);
    byTarget.get(v.toRib).push(v);
  }

  const loads = [];
  for (const [ribIndex, group] of byTarget) {
    const station = spanLoad.stations.find((s) => s.index === ribIndex);
    if (!station) continue;

    // All of this rib's lift has to reach an attachment point, and the
    // diagonals are the only route. So the weights must sum to one across the
    // whole group — every diagonal reaching this rib, in both directions and
    // on every row.
    //
    // Applying a row share on top of an already-normalised proximity weight
    // divides the load twice and loses half of it: with lines on every second
    // rib, half the span is unattached, so half the load must travel
    // diagonally, and an answer of 25% is the signature of that mistake.
    const weights = group.map((v) => (1 / Math.max(1e-6, v.spanM))
      * (rowShares ? (rowShares[v.row] ?? 0) : 1));
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;

    group.forEach((v, k) => {
      loads.push({
        row: v.row,
        fromRib: v.fromRib,
        toRib: v.toRib,
        loadN: station.loadN * (weights[k] / wsum),
        // Load per metre of seam, which is what decides whether the seam
        // needs reinforcing.
        seamLengthM: seamLength(v),
      });
    });
  }

  const total = loads.reduce((a, l) => a + l.loadN, 0);
  return {
    loads,
    totalN: total,
    // Fraction of the half wing's load that travels through a diagonal
    // rather than straight down a line from its own rib.
    fractionThroughDiagonals: total / spanLoad.stations.reduce((a, s) => a + s.loadN, 0),
  };
}

function seamLength(v) {
  let s = 0;
  for (let k = 1; k < v.base.length; k++) s += dist3(v.base[k - 1], v.base[k]);
  return s;
}

/* --------------------------------------------------------------- H-ribs -- */

/**
 * Horizontal ribs.
 *
 * The V form spreads load **spanwise**: a fan from a point on a loaded rib out
 * to a line on an unloaded one. The H form does something else entirely — it
 * is an internal sheet lying roughly horizontally inside a cell, sewn along a
 * chordwise line on each of the two ribs that bound it. It holds the cell to
 * its intended width and stops the section ballooning between the ribs, which
 * is what keeps a high-aspect wing's profile where the designer put it.
 *
 * The geometric consequence matters more than it sounds. A V-rib is a cone,
 * and a cone develops exactly. **An H-rib is a strip between two rib curves,
 * which is the same class of surface as a sail panel** — developable only
 * approximately, with a distortion that has to be measured rather than assumed
 * away. So it goes through `developPanel`, the same triangle-pair unrolling
 * the wing's own panels use, and carries the same error report.
 *
 * Two ribs, one strip, and the height is where the sheet sits between the
 * chord line and the surface: 0 puts it on the chord, 1 on the upper surface,
 * -1 on the lower.
 */
export function buildHRibs({
  wing,
  ribPairs = null,
  chordFrom = 0.25,
  chordTo = 0.60,
  heightFraction = 0.35,
  points = 16,
  // H ribs as a design file states them, rather than one span for the whole
  // wing.
  //
  // `parseHVRibs` returns LEP section 12's type-11 rows: which two ribs each
  // strip joins, which anchor station it sits at, and how wide it is. The
  // Swoop2 carries 70, one between each adjacent pair at each of three
  // stations, 2% of chord either side — and every one of them was being
  // ignored.
  //
  // A file entry gives a chord STATION and a width; this function works in a
  // chord RANGE, so the width is laid either side of the station.
  entries = null,
  anchorFractions = null,
}) {
  const ribs = wing.ribs;

  // From the file, each entry becomes its own pair and its own chord range.
  if (entries?.length) {
    const fracs = anchorFractions
      ?? Object.values(wing.airfoil?.anchors ?? { A: 0.085, B: 0.30, C: 0.53 });
    const built = [];
    const skipped = [];
    for (const e of entries) {
      const i = e.fromRib - 1;
      const j = e.toRib - 1;
      if (!ribs[i] || !ribs[j]) {
        skipped.push({ ...e, why: 'rib out of range' });
        continue;
      }
      const station = fracs[Math.max(0, Math.min(fracs.length - 1,
        (e.fromAnchor ?? 1) - 1))];
      const chordM = ribs[i].chord || 1;
      // The width either side of the anchor, as the program reads it
      // (leparagliding.f, and `lepStructure` cuts every strap to its file's
      // area this way): per cent of the rib's chord for type 11,
      // centimetres for type 1. This took the number as the strap's whole
      // width in centimetres, and the Swoop2's straps came out a quarter of
      // the 8.4 cm its program cuts them at the root.
      const half = e.type === 1 ? ((e.width ?? 2) / 100) / chordM : (e.width ?? 2) / 100;
      const from = Math.max(0.01, station - half);
      const to = Math.min(0.99, station + half);
      const one = buildHRibs({
        wing, ribPairs: [[i, j]], chordFrom: from, chordTo: to,
        heightFraction, points,
      });
      built.push(...one.hribs.map((h) => ({
        ...h, anchor: e.fromAnchor, widthCm: e.widthCm, fromFile: true,
      })));
    }
    return {
      hribs: built,
      count: built.length,
      skipped,
      totalAreaM2: built.reduce((a, h) => a + h.areaM2, 0),
      note: `${built.length} H ribs from the design file`
        + (skipped.length ? `, ${skipped.length} skipped` : ''),
    };
  }

  const pairs = ribPairs
    || ribs.slice(0, -1).map((_, i) => [i, i + 1]);

  const out = [];
  for (const [i, j] of pairs) {
    if (!ribs[i] || !ribs[j]) continue;

    const edge = (rib) => {
      const pts = [];
      for (let p = 0; p < points; p++) {
        const f = chordFrom + ((chordTo - chordFrom) * p) / (points - 1);
        pts.push(betweenSurfaces(rib, f, heightFraction));
      }
      return pts;
    };

    const left = edge(ribs[i]);
    const right = edge(ribs[j]);
    const panel = developPanelLocal(left, right);

    out.push({
      fromRib: i,
      toRib: j,
      chordFrom,
      chordTo,
      heightFraction,
      left,
      right,
      panel,
      areaM2: stripArea(left, right),
      distortion: panel.distortion,
      widthM: dist3(left[0], right[0]),
    });
  }

  return {
    hribs: out,
    count: out.length,
    totalAreaM2: out.reduce((a, h) => a + h.areaM2, 0),
    // Unlike the cone, this is not exact, so the worst case is reported.
    worstDistortion: out.length ? Math.max(...out.map((h) => h.distortion)) : 0,
  };
}

/** A point between the lower and upper surface at a chord fraction. */
function betweenSurfaces(rib, frac, height) {
  const up = ribSurfacePoint(rib, 'upper', frac);
  const lo = ribSurfacePoint(rib, 'lower', frac);
  const t = (height + 1) / 2;      // -1 -> lower, +1 -> upper
  return [
    lo[0] + (up[0] - lo[0]) * t,
    lo[1] + (up[1] - lo[1]) * t,
    lo[2] + (up[2] - lo[2]) * t,
  ];
}

/**
 * Unroll a strip between two curves.
 *
 * Deliberately the same construction as the sail panels: step along in
 * quadrilaterals, split each on a diagonal, lay the triangles flat. Both seam
 * lengths are preserved exactly; the diagonal is what absorbs the fact that
 * the surface is not developable, and the residual is reported.
 */
function developPanelLocal(left, right) {
  const L = [];
  const R = [];
  let x0 = 0;
  let y0 = 0;
  let theta = 0;
  let worst = 0;

  for (let i = 0; i < left.length - 1; i++) {
    const a = dist3(left[i], right[i]);
    if (a < 1e-12) continue;

    const ax = right[i][0] - left[i][0];
    const ay = right[i][1] - left[i][1];
    const az = right[i][2] - left[i][2];

    const lx = left[i + 1][0] - left[i][0];
    const ly = left[i + 1][1] - left[i][1];
    const lz = left[i + 1][2] - left[i][2];
    const a1l = (ax * lx + ay * ly + az * lz) / a;
    const hl = ribCrossNorm(ax, ay, az, lx, ly, lz) / a;

    const rx = right[i + 1][0] - right[i][0];
    const ry = right[i + 1][1] - right[i][1];
    const rz = right[i + 1][2] - right[i][2];
    const a2r = -(ax * rx + ay * ry + az * rz) / a;
    const a1r = a - a2r;
    const hr = ribCrossNorm(ax, ay, az, rx, ry, rz) / a;

    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const l1 = [x0, y0];
    const r1 = [a * ct + x0, a * st + y0];
    const l2 = [a1l * ct - hl * st + x0, a1l * st + hl * ct + y0];
    const r2 = [a1r * ct - hr * st + x0, a1r * st + hr * ct + y0];

    if (i === 0) { L.push(l1); R.push(r1); }
    L.push(l2);
    R.push(r2);

    // The diagonal the construction cannot preserve.
    const trueDiag = dist3(left[i], right[i + 1]);
    const flatDiag = Math.hypot(r2[0] - l1[0], r2[1] - l1[1]);
    worst = Math.max(worst, Math.abs(flatDiag - trueDiag) / (trueDiag || 1));

    x0 = l2[0];
    y0 = l2[1];
    theta = Math.atan2(r2[1] - l2[1], r2[0] - l2[0]);
  }

  return { left: L, right: R, distortion: worst };
}

function ribCrossNorm(ax, ay, az, bx, by, bz) {
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
}

function stripArea(left, right) {
  let a = 0;
  for (let i = 0; i < left.length - 1; i++) {
    a += triangleArea(left[i], right[i], right[i + 1]);
    a += triangleArea(left[i], right[i + 1], left[i + 1]);
  }
  return a;
}

/**
 * Internal structure for a wing: diagonals where the span needs them,
 * horizontal sheets where the cells need holding.
 *
 * Reported together because they trade against each other. Both cost fabric
 * and weight; the V form buys attachment spacing, the H form buys profile
 * accuracy.
 */
export function internalStructure({
  wing, airfoil, anchorRibs = null, vribOptions = {}, hribOptions = null,
}) {
  const v = buildVRibs({ wing, airfoil, anchorRibs, ...vribOptions });
  const h = hribOptions ? buildHRibs({ wing, ...hribOptions })
    : { hribs: [], count: 0, totalAreaM2: 0, worstDistortion: 0 };

  return {
    vribs: v,
    hribs: h,
    totalAreaM2: v.totalAreaM2 + h.totalAreaM2,
    pieces: v.count + h.count,
    unsupportedRibs: v.unsupportedRibs,
    // The V form develops exactly and the H form does not, so a build that
    // leans on H ribs carries a distortion the diagonals never introduce.
    worstDistortion: h.worstDistortion,
  };
}

/**
 * Is a diagonal in tension across its whole width?
 *
 * `vribLoads` treats a diagonal as a load path from its base to its anchor.
 * That is where the load *goes*, but it is not how the cloth carries it.
 *
 * A diagonal is a triangle of fabric. Fabric carries tension and nothing
 * else: no compression, no bending. So load flows only along lines from the
 * base to the apex that are actually in tension, and a part of the triangle
 * whose fibres are not being pulled carries nothing at all. It is there,
 * sewn, adding weight, and doing no work.
 *
 * ---------------------------------------------------------------------------
 * What loads it
 * ---------------------------------------------------------------------------
 * The rib it HOLDS. A rib with no line is lifted by the air on the panels
 * either side of it, and the diagonal sewn along its upper seam is what
 * stops it rising: the load enters along the base, acting the way that rib's
 * lift acts — along the rib, from its lower seam to its upper — and leaves
 * at the apex, where the anchor and its line react it.
 *
 * Two earlier versions had this wrong, in different ways:
 *
 *   - The load was taken along the diagonal's own axis, so by construction
 *     every fibre came out aligned. A check whose load direction is defined
 *     by the thing it is checking cannot find anything.
 *   - Then along the LINE, towards the maillon. Nearer, and for an arc whose
 *     ribs point roughly at the pilot it gives much the same answer — but it
 *     is the wrong force. The line does not load the diagonal; it reacts
 *     what the diagonal brings to the anchor, together with the rib's own
 *     load and whatever the lower surface carries sideways. Loaded by each
 *     anchor's own line, a diagonal on the side its line leans towards read
 *     as slack, when it carries its neighbour's lift like any other.
 *
 * `buildVRibs` records the held rib's direction on every piece
 * (`liftDirection`) and that is what is used. A direction can still be
 * given, for a piece built some other way; `maillon` remains as a fallback
 * for one that carries neither.
 *
 * ---------------------------------------------------------------------------
 * Where the slack is
 * ---------------------------------------------------------------------------
 * A fibre running from a point on the base to the apex carries a share of
 * the load proportional to the cosine of its angle from the load. Past 90
 * degrees that share is negative — the fibre would have to push — so it goes
 * slack. On a diagonal that rises from a lower seam to an upper one this
 * does not happen; what varies is how well each fibre is aimed, and how much
 * of the pull is sideways (`sideShare`), which something else has to take.
 */
export function diagonalTension(vrib, { loadDirection = null, maillon = null } = {}) {
  const apex = vrib.apex;
  const base = vrib.base;
  if (!apex || !base || base.length < 2) {
    throw new Error('diagonalTension needs a diagonal with an apex and a base');
  }

  // The pull the apex is held against, which is the held rib's lift turned
  // round: the base is drawn up along that rib, so the fabric draws the apex
  // the same way and the anchor holds it back.
  const mid = base[Math.floor(base.length / 2)];
  const lift = vrib.liftDirection;
  const dir = loadDirection
    ?? (lift ? [-lift[0], -lift[1], -lift[2]]
      : maillon
        ? [maillon[0] - apex[0], maillon[1] - apex[1], maillon[2] - apex[2]]
        : [mid[0] - apex[0], mid[1] - apex[1], mid[2] - apex[2]]);
  const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const u = [dir[0] / dl, dir[1] / dl, dir[2] / dl];

  const fibres = [];
  for (const b of base) {
    const v = [b[0] - apex[0], b[1] - apex[1], b[2] - apex[2]];
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-12) continue;
    const cos = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / len;
    // A fibre carries load when it OPPOSES the pull, not when it aligns
    // with it.
    //
    // The apex is held down, at the anchor. The fabric runs from the apex up
    // to the base on the neighbouring rib's upper seam, and its tension acts
    // along base-to-apex: it holds the base down against that rib's lift.
    // Cloth can only pull, so a fibre works when its own direction has a
    // component against the load.
    //
    // Written the other way round — carrying load when aligned WITH the pull
    // — every fibre came out slack against a real line direction, and 100%
    // taut against the old self-referential default. Both answers were
    // wrong and the second looked fine.
    const opposing = -cos;
    fibres.push({
      point: b,
      lengthM: len,
      cosine: cos,
      angleDeg: Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI),
      taut: opposing > 0,
      // How much of the load this fibre can carry, relative to one directly
      // opposing it.
      share: Math.max(0, opposing),
    });
  }

  const taut = fibres.filter((f) => f.taut);
  const totalShare = fibres.reduce((a, f) => a + f.share, 0);

  // Where along the base the tension field ends.
  const firstSlack = fibres.findIndex((f) => !f.taut);

  return {
    fibres,
    tautCount: taut.length,
    totalCount: fibres.length,
    tautFraction: fibres.length ? taut.length / fibres.length : 0,
    // How well the working fabric opposes the load, 0 to 1.
    //
    // Reported as a magnitude. The underlying cosine is negative — a fibre
    // works by pulling against the load — and handing a reader a negative
    // "alignment" invites them to read a well-oriented diagonal as a badly
    // oriented one.
    //
    // 1 would be a diagonal pulling straight back along the rib it holds,
    // and no real diagonal reaches it: it spans a cell sideways while rising
    // from the lower surface to the upper, so its direction is fixed by the
    // cell width against the section depth. A cell as wide as it is deep
    // puts the diagonal at 45 degrees and the ceiling at 0.71.
    //
    // So this figure means little on its own. `achievable` below is the
    // bound for that particular cell, and the ratio between them is what
    // says whether a diagonal is badly placed or merely in a shallow cell.
    alignment: taut.length
      ? Math.abs(taut.reduce((a, f) => a + f.cosine, 0) / taut.length) : 0,
    // How much of what the diagonal pulls with is ACROSS the load rather
    // than against it: sideways on the rib it holds. Something has to take
    // that — the diagonal arriving from the other side, when there is one,
    // or a strap across to the next rib when there is not
    // (`diagonalBalance`).
    sideShare: (() => {
      const r = [0, 0, 0];
      for (const f of fibres) {
        if (!f.taut) continue;
        for (let k = 0; k < 3; k++) r[k] += (f.share * (f.point[k] - apex[k])) / f.lengthM;
      }
      const rl = Math.hypot(r[0], r[1], r[2]);
      if (!(rl > 0)) return 0;
      const along = r[0] * u[0] + r[1] * u[1] + r[2] * u[2];
      return Math.sqrt(Math.max(0, rl * rl - along * along)) / rl;
    })(),
    // How far the load itself leans out along the span. For the lift of the
    // rib held, that is the arc: nothing at the root, and most of it at a
    // tip rib standing at sixty degrees.
    spanwiseShare: Math.abs(u[1]),
    // The best any one fibre of this diagonal manages against the SAME load.
    //
    // Measured against the real load direction it is a bound the diagonal
    // could actually reach: if the mean is well below it the base is spread
    // into fabric that is not pulling its weight, and if the best fibre is
    // itself poor then no placement in this cell will help.
    achievable: fibres.length ? Math.max(...fibres.map((f) => f.share)) : 0,
    totalShare,
    worstAngleDeg: fibres.length
      ? Math.max(...fibres.map((f) => f.angleDeg)) : 0,
    fullyTaut: taut.length === fibres.length,
    slackFrom: firstSlack >= 0 ? firstSlack / (fibres.length - 1) : null,
    note: taut.length === fibres.length
      ? 'the whole width is in tension'
      : `${((1 - taut.length / fibres.length) * 100).toFixed(0)}% of the base `
        + 'is slack: that fabric is sewn in, carries nothing, and adds weight',
  };
}

/**
 * Every diagonal on the wing, and which are working across their width.
 *
 * The useful output is not a pass but a ranking: a diagonal that works on
 * half its width is either too wide or anchored in the wrong place, and both
 * are things a designer can change.
 */
export function checkDiagonalTension(vribs, opts = {}) {
  // Each piece is loaded by the rib it holds, which it carries with it
  // (`liftDirection`). `opts` reaches `diagonalTension` for a caller that
  // has to say otherwise.
  const results = vribs.map((v) => ({
    row: v.row,
    fromRib: v.fromRib,
    toRib: v.toRib,
    areaM2: v.areaM2,
    tension: diagonalTension(v, opts),
  }));

  const slack = results.filter((r) => !r.tension.fullyTaut);
  // Fabric that is sewn in and carries nothing.
  const wastedArea = slack.reduce(
    (a, r) => a + r.areaM2 * (1 - r.tension.tautFraction), 0);

  return {
    diagonals: results,
    count: results.length,
    fullyTaut: results.length - slack.length,
    partlySlack: slack.length,
    wastedAreaM2: wastedArea,
    worst: results.slice()
      .sort((a, b) => a.tension.tautFraction - b.tension.tautFraction)[0] ?? null,
    note: slack.length === 0
      ? `all ${results.length} diagonals are in tension across their width`
      : `${slack.length} of ${results.length} diagonals are partly slack, `
        + `${(wastedArea * 1e4).toFixed(0)} cm2 of fabric carrying nothing`,
  };
}

/**
 * Is every held rib held from BOTH sides?
 *
 * A diagonal pulls the rib it holds down and sideways — towards the anchor it
 * runs to. Two of them, one from each side, pull the rib down between them
 * and their sideways parts cancel. One on its own does not: the rib is drawn
 * towards the anchor, and unless something across the top of the next cell
 * holds it back, the cell beside it is pulled wide.
 *
 * That is what a strap across the top is for, and it is why the wings that
 * attach their lines on PAIRS of ribs carry them. The Swoop2 attaches on
 * ribs 2-3, 6-7, 10-11 ...; each lined rib sends one diagonal away from its
 * partner, so ribs 4 and 5 are each held from one side only, and pulled
 * apart. Its file states a piece between exactly those two ribs — 4-5, 8-9,
 * 12-13, 16-17, 20-21, at each of three stations along the chord — and
 * `strapsNeeded` here comes to the same fifteen from the diagonals alone,
 * which is what says the reading of both is right.
 *
 * A wing with a line on every second rib needs none: every free rib has a
 * lined one on each side.
 *
 * @param {object[]} vribs  the pieces from `buildVRibs`
 * @param {object} o
 * @param {boolean} o.centreRib  rib 0 lies on the centreline, so a diagonal
 *                               reaching it has its mirror image arriving
 *                               from the other half
 */
export function diagonalBalance(vribs, { centreRib = false } = {}) {
  const held = new Map();
  for (const v of vribs ?? []) {
    const key = `${v.row}:${v.toRib}`;
    if (!held.has(key)) held.set(key, { row: v.row, rib: v.toRib, inboard: 0, outboard: 0 });
    // A diagonal from a lower-numbered rib arrives from the inboard side.
    const h = held.get(key);
    if (v.fromRib < v.toRib) h.inboard++; else h.outboard++;
  }

  const oneSided = [];
  for (const h of held.values()) {
    // On the centreline the other half's diagonal is the other side.
    if (centreRib && h.rib === 0) continue;
    if (h.inboard && h.outboard) continue;
    oneSided.push({ row: h.row, rib: h.rib, heldFrom: h.inboard ? 'inboard' : 'outboard' });
  }

  // A rib held from inboard is drawn inboard, and the one after it, held
  // from outboard, is drawn outboard: a strap between their tops carries
  // each pull against the other.
  const strapsNeeded = [];
  const paired = new Set();
  for (const a of oneSided) {
    if (a.heldFrom !== 'inboard') continue;
    const b = oneSided.find((x) => x.row === a.row && x.rib === a.rib + 1
      && x.heldFrom === 'outboard');
    if (!b) continue;
    strapsNeeded.push({ row: a.row, ribs: [a.rib, b.rib] });
    paired.add(`${a.row}:${a.rib}`);
    paired.add(`${b.row}:${b.rib}`);
  }
  // Held from one side with nothing facing it — the last rib before the tip,
  // usually. The upper surface has to hold it.
  const unbalanced = oneSided.filter((x) => !paired.has(`${x.row}:${x.rib}`));

  const pairs = [...new Set(strapsNeeded.map((x) => x.ribs.join('-')))];
  return {
    held: held.size,
    oneSided,
    strapsNeeded,
    unbalanced,
    balanced: oneSided.length === 0,
    note: oneSided.length === 0
      ? 'every rib a diagonal holds is held from both sides'
      : [
        strapsNeeded.length
          ? `${strapsNeeded.length} straps wanted across the top, between ribs `
            + `${pairs.join(', ')}: each of those ribs is held from one side only`
          : '',
        unbalanced.length
          ? `${unbalanced.length} held from one side with nothing facing them `
            + `(rib${new Set(unbalanced.map((x) => x.rib)).size > 1 ? 's' : ''} `
            + `${[...new Set(unbalanced.map((x) => x.rib))].join(', ')})`
          : '',
      ].filter(Boolean).join('; '),
  };
}

/**
 * Does each diagonal make sense as a piece of a wing?
 *
 * `buildVRibs` places a diagonal wherever the rules say one goes. It does not
 * ask whether the result is buildable, and on a real planform many are not:
 *
 *   - **Too short.** Near the tip the cells narrow and the section thins, and
 *     the rule still produces a diagonal. On the test wing the smallest is
 *     74 mm. Nobody cuts, marks and sews a 74 mm triangle; it adds seams and
 *     weight and carries almost nothing.
 *
 *   - **Too long.** The longest on the same wing is 685 mm, nine times the
 *     shortest. A long diagonal is a long unsupported edge.
 *
 *   - **Asymmetric between directions.** A rib on an arc is tilted, so its
 *     thickness has a spanwise component — 98 mm at mid-span on the test
 *     wing. A diagonal runs from the LOWER surface of one rib to the UPPER
 *     surface of its neighbour, so that offset adds going inboard and
 *     subtracts going outboard: 505 mm one way and 291 mm the other from the
 *     same rib.
 *
 *     That is the arc, not a placement error. Sliding the base along the
 *     neighbouring rib to even it up does not work, because `y` varies by
 *     less across that rib's whole chord than the offset it would have to
 *     absorb; the search runs to the end of the chord and produces diagonals
 *     lying almost flat.
 *
 *   - **Too shallow.** A diagonal lying near the floor of its cell is a poor
 *     load path: it pulls the rib sideways rather than carrying the anchor
 *     load up into the upper surface, which is what it is for. Measured in
 *     the cell's own frame — the arc tilts the cell, not the diagonal in it.
 *
 * None of these is fixable by the diagonal code alone — they follow from the
 * planform, the arc and the anchor spacing. What the tool can do is say which
 * ones are wrong and by how much, so the designer changes the thing that
 * actually causes it.
 */
export function diagonalGeometry(vribs, {
  minLengthM = 0.12, maxLengthM = 0.60, minAngleFromHorizontalDeg = 25,
  maxDirectionRatio = 1.4,
} = {}) {
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  const items = vribs.map((g) => {
    const mid = g.base[Math.floor(g.base.length / 2)];
    const dz = mid[2] - g.apex[2];
    const lengthM = d3(g.apex, mid);
    // Angle up from the floor of its own cell. A diagonal doing its job
    // rises steeply from the anchor to the upper surface.
    //
    // `buildVRibs` measures it against the cell's lower surface. This used
    // the horizon instead, and the arc tilts a cell near the tip by fifty or
    // sixty degrees: every diagonal out there read as lying flat when it
    // rises in its cell as steeply as the ones at the root. The horizon is
    // kept only for a piece that arrives without its own measure.
    const angleDeg = Number.isFinite(g.riseDeg) ? g.riseDeg
      : lengthM > 0
        ? Math.asin(Math.min(1, Math.abs(dz) / lengthM)) * (180 / Math.PI) : 0;
    return {
      row: g.row,
      fromRib: g.fromRib,
      toRib: g.toRib,
      outboard: g.toRib > g.fromRib,
      lengthM,
      angleDeg,
      baseWidthM: d3(g.base[0], g.base[g.base.length - 1]),
      areaM2: g.areaM2,
    };
  });

  const tooShort = items.filter((d) => d.lengthM < minLengthM);
  const tooLong = items.filter((d) => d.lengthM > maxLengthM);
  const tooShallow = items.filter((d) => d.angleDeg < minAngleFromHorizontalDeg);

  // Inboard against outboard, from the same rib, which should be alike.
  const pairs = [];
  for (const a of items.filter((d) => d.outboard)) {
    const b = items.find((x) => !x.outboard && x.fromRib === a.fromRib
      && x.row === a.row);
    if (!b) continue;
    const ratio = Math.max(a.lengthM, b.lengthM) / Math.min(a.lengthM, b.lengthM);
    pairs.push({ fromRib: a.fromRib, outboardM: a.lengthM, inboardM: b.lengthM, ratio });
  }
  const lopsided = pairs.filter((p) => p.ratio > maxDirectionRatio);

  const lengths = items.map((d) => d.lengthM);

  // Distinct diagonals, not a sum of categories. One piece can be short AND
  // shallow, and adding the lists gave "24 of 20 diagonals", which is the
  // kind of number that makes a reader stop trusting the rest.
  const failing = new Set();
  for (const d of [...tooShort, ...tooLong, ...tooShallow]) {
    failing.add(`${d.row}:${d.fromRib}->${d.toRib}`);
  }
  for (const p of lopsided) failing.add(`pair:${p.fromRib}`);
  const problems = failing.size;

  return {
    diagonals: items,
    pairs,
    tooShort,
    tooLong,
    tooShallow,
    lopsided,
    shortestM: Math.min(...lengths),
    longestM: Math.max(...lengths),
    spread: Math.max(...lengths) / Math.min(...lengths),
    ok: problems === 0,
    problems,
    limits: { minLengthM, maxLengthM, minAngleFromHorizontalDeg, maxDirectionRatio },
    note: problems === 0
      ? `all ${items.length} diagonals are a sensible size and angle`
      : `${problems} of ${items.length} diagonals are not buildable as placed: `
        + [
          tooShort.length && `${tooShort.length} under ${minLengthM * 1000} mm`,
          tooLong.length && `${tooLong.length} over ${maxLengthM * 1000} mm`,
          tooShallow.length && `${tooShallow.length} shallower than ${minAngleFromHorizontalDeg} degrees`,
          lopsided.length && `${lopsided.length} lopsided between directions`,
        ].filter(Boolean).join(', '),
  };
}

/**
 * The V of a diagonal as two straight legs: one bottom seam to the two top
 * seams either side of it.
 *
 * The apex sits on rib i's lower seam at the anchor, and the two feet sit on
 * the upper seams of ribs i-1 and i+1 at the same chord station. It is the
 * centre-line of the two gussets `buildVRibs` cuts from the same apex — the
 * form to use when what is wanted is the length and lean of each leg rather
 * than a pattern to cut.
 *
 * ---------------------------------------------------------------------------
 * What this header used to say, which was wrong
 * ---------------------------------------------------------------------------
 * That `buildVRibs` "spreads the base across the upper panel of a neighbour —
 * a band of cloth landing in the middle of a panel rather than on the seam".
 * It does not, and never did: its base is a run of the neighbouring rib's
 * own upper edge, which IS the seam where that rib meets the upper surface.
 * Every stitch of a `buildVRibs` diagonal is on a seam — a point on the
 * lower seam of the rib with the line, a chordwise run of the upper seam of
 * the rib beside it — and two of them from one anchor are this V.
 *
 * And that the legs "still differ — up to 4.3 to 1 near the tip — and the
 * cause is SWEEP". The figure was measured on a canopy that was being built
 * inside out. On the corrected wing the two legs differ by 4% at the root
 * and 34% at the last rib of the test wing, and for a plain reason: the cell
 * outboard of a rib is narrower than the one inboard of it (658 against
 * 635 mm at rib 2, 215 against 131 mm at rib 10), and a leg across a
 * narrower cell is a shorter leg. `legRatio` reports it per diagonal.
 *
 * The inverted form — two bottom seams to the top seam between them — is the
 * same V upside down and is built by `inverted: true`.
 *
 * Where a leg would be too short to sew, the caller is told which ribs need
 * an H rib instead rather than being handed a 75 mm piece.
 */
export function buildSeamDiagonals({
  wing, airfoil, rows = ['B'], anchorRibs = null,
  minLegM = 0.12, inverted = false, points = 12,
} = {}) {
  if (!wing?.ribs?.length) throw new Error('buildSeamDiagonals needs a wing');
  const ribs = wing.ribs;
  const fractions = airfoil?.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  const anchors = anchorRibs
    || ribs.map((_, i) => i).filter((i) => i % 2 === 0);

  const out = [];
  const needHRib = [];

  for (const i of anchors) {
    // The two neighbours it reaches. Both must exist: a V with one leg is
    // the one-sided diagonal this replaces.
    const left = ribs[i - 1];
    const right = ribs[i + 1];
    if (!left || !right) {
      if (ribs[i]) needHRib.push({ rib: i, why: 'no rib on both sides' });
      continue;
    }

    for (const row of rows) {
      const frac = fractions[row];
      if (!(frac > 0 && frac < 1)) continue;

      // Apex on the seam of rib i; feet on the seams of its neighbours.
      // `ribSurfacePoint` places by CHORD fraction, so all three sit at the same
      // station along the chord.
      const apexSurface = inverted ? 'upper' : 'lower';
      const footSurface = inverted ? 'lower' : 'upper';
      const apex = ribSurfacePoint(ribs[i], apexSurface, frac);
      const footL = ribSurfacePoint(left, footSurface, frac);
      const footR = ribSurfacePoint(right, footSurface, frac);

      const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const legL = d3(apex, footL);
      const legR = d3(apex, footR);

      if (Math.min(legL, legR) < minLegM) {
        needHRib.push({
          rib: i, row,
          why: `the shorter leg is ${(Math.min(legL, legR) * 1000).toFixed(0)}`
            + ` mm, under ${(minLegM * 1000).toFixed(0)}`,
        });
        continue;
      }

      // The triangle, sampled along each leg so it can be developed.
      const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const legPoints = (foot) => {
        const pts = [];
        for (let k = 0; k < points; k++) pts.push(lerp(apex, foot, k / (points - 1)));
        return pts;
      };

      out.push({
        row,
        apexRib: i,
        leftRib: i - 1,
        rightRib: i + 1,
        chordFraction: frac,
        inverted,
        apex,
        footLeft: footL,
        footRight: footR,
        legLeftM: legL,
        legRightM: legR,
        // How unlike the two legs are, which is how unlike the two cells are.
        legRatio: Math.max(legL, legR) / Math.min(legL, legR),
        baseWidthM: d3(footL, footR),
        left: legPoints(footL),
        right: legPoints(footR),
        // No area: two legs are lines, and the triangle between the feet is
        // not a piece of cloth — the rib the apex sits on runs through it.
        // This carried one, computed from that triangle.
      });
    }
  }

  const ratios = out.map((d) => d.legRatio);
  const legs = out.flatMap((d) => [d.legLeftM, d.legRightM]);

  return {
    diagonals: out,
    count: out.length,
    /** Ribs where a V will not fit; these want an H rib instead. */
    needHRib,
    worstLegRatio: ratios.length ? Math.max(...ratios) : 0,
    shortestLegM: legs.length ? Math.min(...legs) : 0,
    longestLegM: legs.length ? Math.max(...legs) : 0,
    note: `${out.length} seam-to-seam diagonals, legs `
      + `${legs.length ? (Math.min(...legs) * 1000).toFixed(0) : 0}-`
      + `${legs.length ? (Math.max(...legs) * 1000).toFixed(0) : 0} mm, worst `
      + `leg ratio ${ratios.length ? Math.max(...ratios).toFixed(2) : 0}`
      + (needHRib.length ? `; ${needHRib.length} places want an H rib` : ''),
  };
}
