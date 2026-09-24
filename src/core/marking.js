/* marking.js — registration marks on a cutting file.
 *
 * The panels export as bare outlines. A cutter can cut them and a sewer
 * cannot assemble them, because nothing on the cloth says which panel is
 * which, which way up it goes, or where along a two-metre seam any given
 * point belongs.
 *
 * --------------------------------------------------------------------------
 * Why notches are not decoration
 * --------------------------------------------------------------------------
 * Two panels are joined along seams that are **not the same length**. Before
 * ovalization they match exactly — the development shares the rib curve
 * between them. Ovalization then widens each panel about its own centreline,
 * which lengthens its outer seam and shortens its inner one, so the right
 * seam of one panel and the left seam of its neighbour end up differing by up
 * to **31 mm over two metres** on the test wing.
 *
 * That difference is not an error. It is the ease that lets flat cloth take
 * up a curved shape, and it has to be *distributed* along the seam rather
 * than run out at one end. A sewer distributing it by eye over two metres
 * will not get it even, and the wing will pull to one side.
 *
 * Notches are how the ease is divided into portions small enough to handle.
 * The rule that makes them work: **notches pair at equal fractions of each
 * seam's own length**, not at equal distances along both. Marking both seams
 * every 250 mm puts the last notch of the longer seam 31 mm past its partner
 * and leaves the whole discrepancy in the final segment.
 *
 * --------------------------------------------------------------------------
 * The other marks
 * --------------------------------------------------------------------------
 * **Panel identity** — cell number and surface, so a pile of similar
 * trapezoids can be sorted. Already written by the DXF export as text.
 *
 * **Grain direction** — ripstop is far stiffer along its warp than across it,
 * and a panel cut with the grain running the wrong way stretches differently
 * in service. A short arrow settles it.
 *
 * **Leading-edge mark** — a panel is not symmetric end to end, and the two
 * ends are easy to confuse once a hundred are cut.
 */

/** Notch geometry, in metres. */
export const DEFAULT_MARKING = {
  notchDepthM: 0.004,        // into the cloth from the seam edge
  notchWidthM: 0.003,
  // Target spacing. The count is derived from it and then applied
  // proportionally, so the spacing is nominal rather than exact.
  targetSpacingM: 0.25,
  minNotches: 2,
  maxNotches: 12,
  grainArrowM: 0.06,
  labelHeightM: 0.02,
};

/**
 * Notch positions along a seam, as fractions of its length.
 *
 * Fractions rather than distances, because that is what makes two seams of
 * different lengths align when sewn.
 */
export function notchFractions(seamLengthM, spec = {}) {
  const M = { ...DEFAULT_MARKING, ...spec };
  const n = Math.max(M.minNotches,
    Math.min(M.maxNotches, Math.round(seamLengthM / M.targetSpacingM) - 1));
  const out = [];
  for (let i = 1; i <= n; i++) out.push(i / (n + 1));
  return out;
}

/** Point and inward normal at a fraction along a polyline. */
function atFraction(poly, f) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    seg.push(d);
    total += d;
  }
  const target = f * total;
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (acc + seg[i] >= target) {
      const t = seg[i] > 0 ? (target - acc) / seg[i] : 0;
      const a = poly[i];
      const b = poly[i + 1];
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const m = Math.hypot(dx, dy) || 1;
      return { point: p, tangent: [dx / m, dy / m], normal: [-dy / m, dx / m], distanceM: target };
    }
    acc += seg[i];
  }
  const last = poly[poly.length - 1];
  return { point: last, tangent: [1, 0], normal: [0, 1], distanceM: total };
}

function markSeamLength(poly) {
  let s = 0;
  for (let i = 1; i < poly.length; i++) {
    s += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
  }
  return s;
}

/**
 * Marks for one panel.
 *
 * `sign` flips the notch direction for the right seam, so both cut
 * into the panel rather than out of it.
 */
export function markPanel(item, spec = {}, counts = null) {
  const M = { ...DEFAULT_MARKING, ...spec };
  const { left, right } = item.panel;
  const leftLen = markSeamLength(left);
  const rightLen = markSeamLength(right);

  const notch = (poly, f, sign) => {
    const a = atFraction(poly, f);
    const d = M.notchDepthM;
    const w = M.notchWidthM / 2;
    const [nx, ny] = a.normal;
    const [tx, ty] = a.tangent;
    const base = a.point;
    // A V cut into the cloth: two edges meeting at a point.
    return {
      fraction: f,
      distanceM: a.distanceM,
      point: base,
      cut: [
        [base[0] - tx * w, base[1] - ty * w],
        [base[0] + nx * d * sign, base[1] + ny * d * sign],
        [base[0] + tx * w, base[1] + ty * w],
      ],
    };
  };

  // The notch count on a seam has to be agreed with the panel it is sewn to,
  // not derived from this panel alone. Deriving it per panel gave neighbours
  // nine notches against eight, and a notch with no partner is worse than no
  // notch: it invites the sewer to match it against the wrong thing.
  const fracFor = (n) => {
    const out = [];
    for (let i = 1; i <= n; i++) out.push(i / (n + 1));
    return out;
  };
  const nLeft = counts && counts.left != null
    ? counts.left : notchFractions(leftLen, M).length;
  const nRight = counts && counts.right != null
    ? counts.right : notchFractions(rightLen, M).length;
  // Which way the normal points depends on the seam's winding, and assuming
  // it was a bug: both seams cut *outward*, away from the panel, which is a
  // notch that removes the seam allowance instead of marking it.
  //
  // Rather than guess a sign per seam, take the direction from the panel
  // itself — a notch must move toward the opposite seam.
  const inward = (poly, other) => {
    const a = atFraction(poly, 0.5);
    const target = atFraction(other, 0.5).point;
    const toward = (a.normal[0] * (target[0] - a.point[0]))
      + (a.normal[1] * (target[1] - a.point[1]));
    return toward >= 0 ? +1 : -1;
  };
  const leftSign = inward(left, right);
  const rightSign = inward(right, left);
  const leftNotches = fracFor(nLeft).map((f) => notch(left, f, leftSign));
  const rightNotches = fracFor(nRight).map((f) => notch(right, f, rightSign));

  // Grain arrow, along the panel's long axis at its centre.
  const midL = atFraction(left, 0.5).point;
  const midR = atFraction(right, 0.5).point;
  const cx = (midL[0] + midR[0]) / 2;
  const cy = (midL[1] + midR[1]) / 2;
  const along = atFraction(left, 0.5).tangent;
  const grain = [
    [cx - along[0] * M.grainArrowM / 2, cy - along[1] * M.grainArrowM / 2],
    [cx + along[0] * M.grainArrowM / 2, cy + along[1] * M.grainArrowM / 2],
  ];

  return {
    cell: item.cell,
    surface: item.surface,
    label: `${item.cell}${item.surface === 'upper' ? 'U' : 'L'}`,
    labelAt: [cx, cy],
    leftNotches,
    rightNotches,
    grain,
    // The leading edge is the start of the seam, and a panel is not
    // symmetric end to end.
    leadingEdgeAt: left[0],
    leftLengthM: leftLen,
    rightLengthM: rightLen,
  };
}

/**
 * Mark a whole set, and check that the seams which get sewn together carry
 * matching notches.
 *
 * The check is the point. A notch on one panel with no partner on its
 * neighbour is worse than no notch at all, because it invites the sewer to
 * match it against the wrong thing.
 */
export function markPanels(items, spec = {}) {
  const M = { ...DEFAULT_MARKING, ...spec };

  // Decide the notch count for each *join* first, from the mean of the two
  // seams that will be sewn together, then hand those counts to the panels.
  // Otherwise two panels sharing a seam can disagree about how many notches
  // it carries.
  const bySurfaceItems = {};
  for (const it of items) (bySurfaceItems[it.surface] ||= []).push(it);
  for (const list of Object.values(bySurfaceItems)) list.sort((a, b) => a.cell - b.cell);

  const countFor = new Map();          // key: `${surface}:${cellA}-${cellB}`
  for (const [surface, list] of Object.entries(bySurfaceItems)) {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      const mean = (markSeamLength(a.panel.right) + markSeamLength(b.panel.left)) / 2;
      countFor.set(`${surface}:${a.cell}-${b.cell}`, notchFractions(mean, M).length);
    }
  }

  const marks = items.map((it) => {
    const list = bySurfaceItems[it.surface];
    const i = list.indexOf(it);
    const left = i > 0
      ? countFor.get(`${it.surface}:${list[i - 1].cell}-${it.cell}`) : null;
    const right = i < list.length - 1
      ? countFor.get(`${it.surface}:${it.cell}-${list[i + 1].cell}`) : null;
    return markPanel(it, spec, { left, right });
  });

  const bySurface = {};
  for (const m of marks) (bySurface[m.surface] ||= []).push(m);
  for (const list of Object.values(bySurface)) list.sort((a, b) => a.cell - b.cell);

  const joins = [];
  for (const [surface, list] of Object.entries(bySurface)) {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      const easeM = a.rightLengthM - b.leftLengthM;
      joins.push({
        surface,
        cells: [a.cell, b.cell],
        easeM,
        easePct: b.leftLengthM ? (easeM / b.leftLengthM) * 100 : 0,
        notchesMatch: a.rightNotches.length === b.leftNotches.length,
        notchCount: a.rightNotches.length,
        // Ease per segment, which is what a sewer actually has to work in.
        easePerSegmentM: a.rightNotches.length
          ? easeM / (a.rightNotches.length + 1) : easeM,
      });
    }
  }

  const eases = joins.map((j) => Math.abs(j.easeM));
  return {
    marks,
    joins,
    allNotchesPaired: joins.every((j) => j.notchesMatch),
    worstEaseMM: eases.length ? Math.max(...eases) * 1000 : 0,
    worstEasePerSegmentMM: joins.length
      ? Math.max(...joins.map((j) => Math.abs(j.easePerSegmentM))) * 1000 : 0,
  };
}

/**
 * Place notches, grain and label along seams that are already in their final
 * position on the roll.
 *
 * Takes the fractions decided for the unplaced panel, so a nested panel
 * carries exactly the marks its neighbour expects, wherever the nester put
 * it and whichever way round.
 */
export function markPlacedSeams(left, right, leftFractions, rightFractions, spec = {}) {
  const M = { ...DEFAULT_MARKING, ...spec };
  const notches = [];

  const cut = (poly, f, sign) => {
    const a = atFraction(poly, f);
    const w = M.notchWidthM / 2;
    const [nx, ny] = a.normal;
    const [tx, ty] = a.tangent;
    const b = a.point;
    return {
      fraction: f,
      point: b,
      cut: [
        [b[0] - tx * w, b[1] - ty * w],
        [b[0] + nx * M.notchDepthM * sign, b[1] + ny * M.notchDepthM * sign],
        [b[0] + tx * w, b[1] + ty * w],
      ],
    };
  };

  // Same rule as markPanel: the direction comes from the geometry, not from
  // an assumed winding.
  const inward = (poly, other) => {
    const a = atFraction(poly, 0.5);
    const t = atFraction(other, 0.5).point;
    return ((a.normal[0] * (t[0] - a.point[0])) + (a.normal[1] * (t[1] - a.point[1]))) >= 0
      ? +1 : -1;
  };
  const ls = inward(left, right);
  const rs = inward(right, left);
  for (const f of leftFractions) notches.push(cut(left, f, ls));
  for (const f of rightFractions) notches.push(cut(right, f, rs));

  const midL = atFraction(left, 0.5);
  const midR = atFraction(right, 0.5);
  const cx = (midL.point[0] + midR.point[0]) / 2;
  const cy = (midL.point[1] + midR.point[1]) / 2;
  const [tx, ty] = midL.tangent;
  return {
    notches,
    grain: [
      [cx - tx * M.grainArrowM / 2, cy - ty * M.grainArrowM / 2],
      [cx + tx * M.grainArrowM / 2, cy + ty * M.grainArrowM / 2],
    ],
    labelAt: [cx, cy],
  };
}
