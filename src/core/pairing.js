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
  return {
    outline: moved, angle, bounds: pairBounds(moved),
    shiftX: b.minX, shiftY: b.minY,
  };
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

  // Two orders, and the better one wins.
  //
  // Pairing adjacent items in a size-sorted list puts the largest panel with
  // the next largest, which is the wrong way round. A tip panel is small and
  // strongly curved; a root panel is large with a deep concave side. The tip
  // nests INTO the root's gap, and two roots do not nest into each other at
  // all.
  //
  // Both orders are tried and measured rather than argued about: adjacent,
  // and complementary — largest with smallest, working inwards.
  const orders = {
    adjacent: (() => {
      const out = [];
      for (let i = 0; i < sorted.length; i += 2) out.push([sorted[i], sorted[i + 1]]);
      return out;
    })(),
    complementary: (() => {
      const out = [];
      let lo = 0;
      let hi = sorted.length - 1;
      while (lo < hi) { out.push([sorted[lo], sorted[hi]]); lo++; hi--; }
      if (lo === hi) out.push([sorted[lo], undefined]);
      return out;
    })(),
  };

  const tryOrder = (candidatePairs) => {
    const ps = [];
    const ss = [];
    for (const [a, b] of candidatePairs) {
      if (!a) continue;
      if (!b) { ss.push(a); continue; }
      const lk = interlock(outline(a), outline(b), { gap });
      // A pair that overlaps is not a pair — the guard the original loop had,
      // which a rewrite that only kept the saving would have thrown away.
      if (!lk || lk.saving <= 0 || pairOverlap(lk.a.outline, lk.b.outline)) {
        ss.push(a, b);
        continue;
      }
      ps.push({ items: [a, b], lock: lk });
    }
    const saved = ps.reduce((acc, x) => acc + x.lock.saving, 0);
    return { pairs: ps, singles: ss, totalSaving: saved };
  };

  const results = Object.fromEntries(
    Object.entries(orders).map(([k, v]) => [k, tryOrder(v)]));
  const bestOrder = Object.entries(results)
    .sort((a, b) => b[1].totalSaving - a[1].totalSaving)[0];

  const pairs = bestOrder[1].pairs;
  const singles = bestOrder[1].singles;
  const chosenOrder = bestOrder[0];
  const orderSavings = Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, v.totalSaving]));


  const savings = pairs.map((p) => p.lock.saving);
  return {
    pairs,
    singles,
    paired: pairs.length * 2,
    meanSaving: savings.length ? savings.reduce((x, y) => x + y, 0) / savings.length : 0,
    // Which order won, and what each scored. Reported rather than assumed:
    // the adjacent order pairs the largest panel with the next largest, and
    // a tip panel nests into a root panel's gap where two roots do not nest
    // into each other at all.
    order: chosenOrder,
    orderSavings,
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

/* --------------------------------------------------- profile packing -- */

/**
 * Nest panels against their real outlines rather than their bounding boxes.
 *
 * The existing packer is a skyline over rectangles. That is why packing
 * efficiency sits at 66%: a panel's box is not the panel, and every gap
 * between a box edge and the outline inside it is material the packer has
 * decided it cannot use.
 *
 * This places against the outline itself. Each panel is aligned to its long
 * axis and sampled into columns, giving a lower and an upper profile. The
 * roll carries a skyline — the highest occupied point in each column — and a
 * panel drops into the lowest position where its lower profile clears the
 * skyline everywhere it overlaps:
 *
 *     dy = max over shared columns of ( skyline[c] - lower[c] )
 *
 * which is exact for a given horizontal position. The horizontal position is
 * searched, because sliding a panel along changes which part of the skyline
 * it has to clear.
 *
 * Panels go down largest first — the usual heuristic, and it matters here
 * because the small tip panels are the ones that fit into gaps, so they must
 * be placed last when there are gaps to fit into.
 */
export function nestByProfile(items, {
  rollWidth = 1.4,
  gap = 0.02,
  // 800 columns is where the sweep flattens: 200 is too coarse to find the
  // gaps and loses 11 points, 1200 is no better than 800 and takes twice as
  // long. Resolution matters more than the number of positions tried.
  columns = 800,
  outlineOf = null,
  positions = 120,
  // Pack from both edges of the roll rather than only from y = 0.
  //
  // A single bottom-up skyline leaves a band along the far edge that nothing
  // can reach: on the test wing it averages 173 mm and comes to 12% of the
  // roll, while the smallest panels are 24 mm tall and would fit in it many
  // times over. A second skyline descending from the far edge lets them.
  twoSided = true,
} = {}) {
  const outline = outlineOf || ((it) => it.panel.left.concat(it.panel.right.slice().reverse()));

  const prepared = items.map((it) => {
    const A = alignToLongAxis(outline(it));
    // Carry the two seams through the same transform as the outline.
    // Without them a marked cutting file loses every notch — the export
    // needs the seams, not just the boundary, and dropping them silently
    // turned 314 polylines into 24.
    const c = Math.cos(A.angle);
    const sn = Math.sin(A.angle);
    const tf = (pts) => pts.map(([x, y]) => [
      (x * c - y * sn) - A.shiftX, (x * sn + y * c) - A.shiftY,
    ]);
    return {
      item: it,
      outline: A.outline,
      left: it.panel ? tf(it.panel.left) : null,
      right: it.panel ? tf(it.panel.right) : null,
      angle: A.angle,
      bounds: A.bounds,
    };
  }).sort((a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height));

  // Estimate a roll length generous enough to hold everything, then trim.
  const totalW = prepared.reduce((s, p) => s + p.bounds.width, 0);
  const rollLength = Math.max(...prepared.map((p) => p.bounds.width)) + totalW;
  const colWidth = rollLength / columns;
  // Height occupied from y = 0 upward, and from y = rollWidth downward.
  const skyline = new Array(columns).fill(0);
  const ceiling = new Array(columns).fill(rollWidth);

  const placed = [];
  let usedLength = 0;

  for (const p of prepared) {
    if (p.bounds.height > rollWidth) {
      throw new Error(`Panel ${p.item.surface} cell ${p.item.cell} is `
        + `${p.bounds.height.toFixed(3)} m across a ${rollWidth} m roll.`);
    }

    // The panel's own lower and upper profile, in its local columns.
    const nCols = Math.max(4, Math.ceil(p.bounds.width / colWidth));
    const prof = profiles(p.outline, nCols, 0, p.bounds.width);

    let best = null;
    const maxStart = Math.max(0, columns - nCols);
    const step = Math.max(1, Math.floor(maxStart / positions));

    for (let c0 = 0; c0 <= maxStart; c0 += step) {
      const rightEdge = (c0 * colWidth) + p.bounds.width;

      // From the near edge: lift until the panel's lower profile clears the
      // skyline everywhere.
      let needUp = 0;
      for (let k = 0; k < nCols; k++) {
        if (prof.bot[k] === Infinity) continue;
        const clearance = skyline[c0 + k] - prof.bot[k];
        if (clearance > needUp) needUp = clearance;
      }
      const dyUp = needUp + (needUp > 0 ? gap : 0);
      // A near-edge placement must clear the ceiling too, not just the
      // skyline. Checking only the skyline let panels rise into space already
      // taken from the far edge — 26 overlapping pairs, and a utilisation
      // that looked like 90% because the panels were on top of each other.
      // The gap applies between panels, not between a panel and the edge of
      // the roll. Charging it at the untouched edge costs 2.2 points of
      // utilisation for nothing.
      let hitsCeiling = false;
      for (let k = 0; k < nCols; k++) {
        if (prof.top[k] === -Infinity) continue;
        const c = c0 + k;
        const margin = ceiling[c] < rollWidth ? gap : 0;
        if (dyUp + prof.top[k] > ceiling[c] - margin) { hitsCeiling = true; break; }
      }
      if (!hitsCeiling && dyUp + p.bounds.height <= rollWidth) {
        const score = Math.max(usedLength, rightEdge) * 1000 + dyUp;
        if (!best || score < best.score) best = { c0, dy: dyUp, score, rightEdge, from: 'near' };
      }

      // From the far edge: drop until the panel's *upper* profile clears the
      // ceiling. The panel is not flipped — only its position changes.
      if (twoSided) {
        let lowest = Infinity;
        for (let k = 0; k < nCols; k++) {
          if (prof.top[k] === -Infinity) continue;
          const allowed = ceiling[c0 + k] - prof.top[k];
          if (allowed < lowest) lowest = allowed;
        }
        if (lowest !== Infinity) {
          const dyDown = lowest - gap;
          const lowEdge = dyDown + (Math.min(...prof.bot.filter((v) => v !== Infinity)) || 0);
          if (dyDown >= 0 && lowEdge >= 0) {
            // Prefer the far edge only when it does not collide with the
            // near-edge stack.
            let clashes = false;
            for (let k = 0; k < nCols; k++) {
              if (prof.bot[k] === Infinity) continue;
              const c = c0 + k;
              const lowMargin = skyline[c] > 0 ? gap : 0;
              const highMargin = ceiling[c] < rollWidth ? gap : 0;
              if (dyDown + prof.bot[k] < skyline[c] + lowMargin) { clashes = true; break; }
              if (dyDown + prof.top[k] > ceiling[c] - highMargin) { clashes = true; break; }
            }
            if (!clashes) {
              const score = Math.max(usedLength, rightEdge) * 1000
                + (rollWidth - dyDown - p.bounds.height);
              if (!best || score < best.score) {
                best = { c0, dy: dyDown, score, rightEdge, from: 'far' };
              }
            }
          }
        }
      }
    }

    if (!best) {
      // Nowhere across the roll: start a fresh stretch beyond everything.
      const c0 = Math.min(columns - nCols, Math.ceil(usedLength / colWidth) + 1);
      best = { c0, dy: 0, score: 0, rightEdge: (c0 * colWidth) + p.bounds.width };
    }

    const dx = best.c0 * colWidth;
    const moved = p.outline.map(([x, y]) => [x + dx, y + best.dy]);
    placed.push({
      cell: p.item.cell,
      surface: p.item.surface,
      panel: p.item.panel,
      outline: moved,
      left: p.left ? p.left.map(([x, y]) => [x + dx, y + best.dy]) : null,
      right: p.right ? p.right.map(([x, y]) => [x + dx, y + best.dy]) : null,
      angleDeg: (p.angle * 180) / Math.PI,
      dx,
      dy: best.dy,
      width: p.bounds.width,
      height: p.bounds.height,
    });

    // Update whichever front this panel was placed against.
    for (let k = 0; k < nCols; k++) {
      const c = best.c0 + k;
      if (c >= columns) break;
      if (best.from === 'far') {
        if (prof.bot[k] === Infinity) continue;
        const lowY = prof.bot[k] + best.dy - gap;
        if (lowY < ceiling[c]) ceiling[c] = lowY;
      } else {
        if (prof.top[k] === -Infinity) continue;
        const topY = prof.top[k] + best.dy + gap;
        if (topY > skyline[c]) skyline[c] = topY;
      }
    }
    usedLength = Math.max(usedLength, best.rightEdge);
  }

  const xs = placed.flatMap((p) => p.outline.map((q) => q[0]));
  const ys = placed.flatMap((p) => p.outline.map((q) => q[1]));
  return {
    placed,
    extent: {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    },
    rollWidth,
    lengthM: Math.max(...xs) - Math.min(...xs),
  };
}

/** Do any two placed outlines overlap? The check a packer must survive. */
export function nestingOverlaps(nested) {
  let count = 0;
  const list = nested.placed;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      // Cheap box rejection first.
      const a = pairBounds(list[i].outline);
      const b = pairBounds(list[j].outline);
      if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue;
      if (pairOverlap(list[i].outline, list[j].outline)) count++;
    }
  }
  return count;
}
