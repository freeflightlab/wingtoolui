/* pairing.js — interlocking two panels before they are packed.
 *
 * A developed panel is a long curved strip. On the test wing it is 380 mm
 * wide and 2.5 m long, but its bounding box is 507 x 2557 mm — the curve
 * alone wastes a quarter of the box before any packing happens. A packer
 * working on bounding boxes cannot recover that, however good it is, because
 * the waste is inside the box it is given.
 *
 * Two such strips interlock. Turn one through 180 degrees and the convex edge
 * of one sits against the concave edge of the other, and the pair occupies
 * far less than two boxes. This is the oldest trick in cutting-room practice
 * and the largest single saving available here.
 *
 * ---------------------------------------------------------------------------
 * How the offset is found
 * ---------------------------------------------------------------------------
 * Both panels are first turned so their long axis lies along x, then sampled
 * into columns. For each column, the upper panel's lower edge and the lower
 * panel's upper edge are known, so the smallest vertical gap that keeps them
 * apart everywhere is
 *
 *     offset = max over columns of ( lower.top(x) - upper.bottom(x) ) + gap
 *
 * taken only over columns where both are present. That is an exact answer for
 * a fixed horizontal shift; the horizontal shift itself is searched, because
 * sliding one strip along the other changes which parts of the curves meet.
 *
 * The result is checked rather than trusted: `pairOverlap` re-tests the two
 * outlines for intersection, because a sampling that misses a spike would
 * produce a pair that cannot be cut.
 */

/** Rotate a point list about the origin. */
function rotate(points, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function pairBounds(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * Turn an outline so its long axis lies along x, and move it to the origin.
 * Searched rather than derived: the minimum-area orientation of a curved
 * strip is not its principal axis, because the curve pulls the second moment
 * away from the direction that actually minimises the box.
 */
export function alignToLongAxis(outline, { steps = 180 } = {}) {
  let best = null;
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * i) / steps;
    const b = pairBounds(rotate(outline, a));
    const area = b.width * b.height;
    if (!best || area < best.area) best = { angle: a, area, b };
  }
  // Prefer the long side along x.
  let angle = best.angle;
  let b = best.b;
  if (b.height > b.width) {
    angle += Math.PI / 2;
    b = pairBounds(rotate(outline, angle));
  }
  const moved = rotate(outline, angle).map(([x, y]) => [x - b.minX, y - b.minY]);
  return { outline: moved, angle, bounds: pairBounds(moved) };
}

/** Upper and lower profile of an outline, sampled in columns. */
function profiles(outline, columns, x0, x1) {
  const top = new Array(columns).fill(-Infinity);
  const bot = new Array(columns).fill(Infinity);
  const step = (x1 - x0) / columns;

  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0];
    // Walk the edge in small steps so a near-vertical edge still registers.
    const n = Math.max(2, Math.ceil(Math.abs(dx) / step) + 2);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      const c = Math.floor((x - x0) / step);
      if (c < 0 || c >= columns) continue;
      if (y > top[c]) top[c] = y;
      if (y < bot[c]) bot[c] = y;
    }
  }
  return { top, bot, step, x0 };
}

/**
 * Interlock two outlines, returning the transform for the second.
 *
 * The second panel is turned through 180 degrees — that is what makes a
 * tapered strip fit against its neighbour — and then slid along and across
 * until it just clears.
 */
export function interlock(outlineA, outlineB, {
  gap = 0.01, columns = 160, shifts = 33, flip = true,
} = {}) {
  const A = alignToLongAxis(outlineA);

  // Align first, then flip. Flipping before alignment does nothing at all:
  // the alignment search runs over 0..pi, and a 180 degree rotation lands on
  // the same canonical orientation, so the flip is undone before it is used.
  // That is why the first version of this saved 4.7% instead of the 20-odd it
  // should — the two strips were curving the same way and could not interlock.
  const B0 = alignToLongAxis(outlineB);
  const flipped = flip
    ? rotate(B0.outline, Math.PI)
    : B0.outline;
  const fb = pairBounds(flipped);
  const B = {
    outline: flipped.map(([x, y]) => [x - fb.minX, y - fb.minY]),
    angle: B0.angle + (flip ? Math.PI : 0),
    bounds: pairBounds(flipped.map(([x, y]) => [x - fb.minX, y - fb.minY])),
  };

  const width = Math.max(A.bounds.width, B.bounds.width);
  let best = null;

  for (let s = 0; s < shifts; s++) {
    // Slide B along the long axis, including negative shifts.
    const dx = ((s / (shifts - 1)) - 0.5) * A.bounds.width * 0.5;
    const shifted = B.outline.map(([x, y]) => [x + dx, y]);

    const x0 = Math.min(0, dx);
    const x1 = Math.max(A.bounds.width, dx + B.bounds.width);
    const pa = profiles(A.outline, columns, x0, x1);
    const pb = profiles(shifted, columns, x0, x1);

    // Smallest vertical offset that clears in every shared column.
    let need = -Infinity;
    let shared = 0;
    for (let c = 0; c < columns; c++) {
      if (pa.top[c] === -Infinity || pb.bot[c] === Infinity) continue;
      shared++;
      need = Math.max(need, pa.top[c] - pb.bot[c]);
    }
    if (!shared || need === -Infinity) continue;
    const dy = need + gap;

    const placed = shifted.map(([x, y]) => [x, y + dy]);
    const bb = pairBounds(A.outline.concat(placed));
    const area = bb.width * bb.height;
    if (!best || area < best.area) {
      best = { dx, dy, area, bb, placed, sharedColumns: shared };
    }
  }

  if (!best) return null;
  return {
    a: { outline: A.outline, angle: A.angle },
    b: {
      outline: best.placed,
      angle: B.angle,
      dx: best.dx,
      dy: best.dy,
    },
    bounds: best.bb,
    boxAreaM2: best.area,
    // Two boxes packed separately, for comparison.
    separateBoxAreaM2: A.bounds.width * A.bounds.height + B.bounds.width * B.bounds.height,
    saving: 1 - best.area / (A.bounds.width * A.bounds.height
      + B.bounds.width * B.bounds.height),
    width,
  };
}

/** Do two placed outlines overlap? Checked, not assumed. */
export function pairOverlap(outlineA, outlineB) {
  const seg = (p) => {
    const out = [];
    for (let i = 0; i < p.length; i++) out.push([p[i], p[(i + 1) % p.length]]);
    return out;
  };
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const intersects = ([p1, p2], [p3, p4]) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  const sa = seg(outlineA);
  const sb = seg(outlineB);
  for (const e of sa) for (const f of sb) if (intersects(e, f)) return true;
  return false;
}

/**
 * Pair up a set of panels.
 *
 * Panels are paired with their nearest neighbour in size, because two strips
 * of similar length interlock with little left over at the ends. An odd panel
 * is passed through alone rather than forced into a pair that wastes more
 * than it saves.
 */
export function pairPanels(items, { gap = 0.01, outlineOf = null } = {}) {
  const outline = outlineOf || ((it) => it.panel.left.concat(it.panel.right.slice().reverse()));
  const sorted = items.slice().sort((a, b) => {
    const la = pairBounds(outline(a));
    const lb = pairBounds(outline(b));
    return (lb.width * lb.height) - (la.width * la.height);
  });

  const pairs = [];
  const singles = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!b) { singles.push(a); break; }
    const lock = interlock(outline(a), outline(b), { gap });
    if (!lock || lock.saving <= 0) {
      singles.push(a, b);
      continue;
    }
    // A pair that overlaps is not a pair.
    if (pairOverlap(lock.a.outline, lock.b.outline)) {
      singles.push(a, b);
      continue;
    }
    pairs.push({ items: [a, b], lock });
  }

  const savings = pairs.map((p) => p.lock.saving);
  return {
    pairs,
    singles,
    paired: pairs.length * 2,
    meanSaving: savings.length ? savings.reduce((x, y) => x + y, 0) / savings.length : 0,
    bestSaving: savings.length ? Math.max(...savings) : 0,
  };
}

/**
 * Where nesting loses material.
 *
 * Utilisation on its own says a layout is poor without saying why, and the
 * two causes want opposite remedies. Splitting it says which to work on:
 *
 *   **shape efficiency** = panel area / sum of best-fit bounding boxes.
 *     What the panel's own outline wastes inside the smallest box that holds
 *     it. No packer can recover this; it needs true polygon packing.
 *
 *   **packing efficiency** = sum of boxes / roll area consumed.
 *     What the packer wastes between boxes. This is the packer's to fix.
 *
 * On the test wing: 73% shape, 66% packing, 48% overall. The roadmap assumed
 * the loss was packing and that pairwise interlocking would reach 60-70%.
 * Measured, it does not — see `docs/nesting.md`.
 */
export function nestingDiagnosis(items, nested, { rollWidth = 1.4, outlineOf = null } = {}) {
  const outline = outlineOf || ((it) => it.panel.left.concat(it.panel.right.slice().reverse()));
  const polyArea = (q) => {
    let a = 0;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      a += q[j][0] * q[i][1] - q[i][0] * q[j][1];
    }
    return Math.abs(a / 2);
  };

  let panelArea = 0;
  let boxArea = 0;
  const perPanel = [];
  for (const it of items) {
    const o = outline(it);
    const a = polyArea(o);
    const A = alignToLongAxis(o);
    const box = A.bounds.width * A.bounds.height;
    panelArea += a;
    boxArea += box;
    perPanel.push({
      cell: it.cell,
      surface: it.surface,
      areaM2: a,
      boxAreaM2: box,
      shapeEfficiency: box > 0 ? a / box : 0,
    });
  }

  const rollLength = nested ? nested.extent.maxX - nested.extent.minX : 0;
  const rollArea = rollLength * rollWidth;

  // The worst panels are worth naming: shape loss is concentrated in the
  // small ones, so a remedy aimed at the large panels misses it.
  perPanel.sort((a, b) => a.shapeEfficiency - b.shapeEfficiency);

  return {
    panelAreaM2: panelArea,
    boxAreaM2: boxArea,
    rollAreaM2: rollArea,
    rollLengthM: rollLength,
    shapeEfficiency: boxArea > 0 ? panelArea / boxArea : 0,
    packingEfficiency: rollArea > 0 ? boxArea / rollArea : 0,
    utilisation: rollArea > 0 ? panelArea / rollArea : 0,
    worstShape: perPanel.slice(0, 5),
    bestShape: perPanel.slice(-5).reverse(),
    // Which of the two is costing more, as a single answer.
    dominantLoss: (1 - (boxArea > 0 ? panelArea / boxArea : 0))
      > (1 - (rollArea > 0 ? boxArea / rollArea : 0)) ? 'shape' : 'packing',
  };
}
