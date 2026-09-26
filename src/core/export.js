import { resampleSurface } from './airfoil.js';
import { markPanels, markPlacedSeams, DEFAULT_MARKING } from './marking.js';
import { nestByProfile } from './pairing.js';
/* export.js — DXF and SVG output.
 *
 * DXF is the format the handbook's own FORTRAN subroutine writes, and it is
 * what plotters and cutting tables in this trade actually read. The writer
 * here emits minimal ASCII DXF R12 entities: LINE, LWPOLYLINE and TEXT, on
 * named layers. R12 is chosen deliberately — it is the most widely readable
 * DXF revision, and nothing here needs anything newer.
 *
 * Layer colours follow the AutoCAD Color Index used in the handbook listing
 * (2 yellow, 3 green, 4 cyan, 5 blue, 6 magenta).
 */

const ACI = { red: 1, yellow: 2, green: 3, cyan: 4, blue: 5, magenta: 6, white: 7 };

export function dxfDocument() {
  const out = [];
  const push = (code, value) => { out.push(String(code)); out.push(String(value)); };

  // A minimal R12 header. $ACADVER declares the revision; without it some
  // readers guess, and a few guess wrong.
  push(0, 'SECTION');
  push(2, 'HEADER');
  push(9, '$ACADVER'); push(1, 'AC1009');
  push(9, '$INSUNITS'); push(70, 6); // 6 = metres
  push(0, 'ENDSEC');

  push(0, 'SECTION');
  push(2, 'ENTITIES');

  return {
    /**
     * R12 has no LWPOLYLINE — that entity arrives with R13/2000. A file that
     * claims AC1009 and then uses it will be rejected by strict readers and
     * by some cutting-table software, which is exactly the equipment this
     * output is for. So polylines are written the R12 way: a POLYLINE header,
     * one VERTEX per point, and a SEQEND to close the run.
     */
    polyline(points, { layer = 'default', color = ACI.white, closed = false } = {}) {
      push(0, 'POLYLINE');
      push(8, layer);
      push(62, color);
      push(66, 1);            // vertices follow
      push(70, closed ? 1 : 0);
      push(10, '0.0'); push(20, '0.0'); push(30, '0.0');
      for (const p of points) {
        push(0, 'VERTEX');
        push(8, layer);
        push(10, fmt(p[0])); push(20, fmt(p[1])); push(30, '0.0');
      }
      push(0, 'SEQEND');
      push(8, layer);
      return this;
    },
    line(p1, p2, { layer = 'default', color = ACI.white } = {}) {
      push(0, 'LINE');
      push(8, layer);
      push(62, color);
      push(10, fmt(p1[0])); push(20, fmt(p1[1])); push(30, '0.0');
      push(11, fmt(p2[0])); push(21, fmt(p2[1])); push(31, '0.0');
      return this;
    },
    text(str, at, { layer = 'notes', height = 0.02, color = ACI.white } = {}) {
      push(0, 'TEXT');
      push(8, layer);
      push(62, color);
      push(10, fmt(at[0])); push(20, fmt(at[1])); push(30, '0.0');
      push(40, fmt(height));
      push(1, str);
      return this;
    },
    toString() {
      const tail = [...out];
      tail.push('0', 'ENDSEC', '0', 'EOF');
      return tail.join('\n');
    },
  };
}

const fmt = (n) => Number(n).toFixed(6);

/**
 * Lay developed panels out on a nesting grid and write a single cutting file.
 * Panels are rotated so their long axis runs along the roll, and stacked in
 * rows with a gap. Fabric comes on a roll of fixed width, so the roll width
 * is the binding constraint, not the length.
 */
export function nestPanels(panels, {
  rollWidth = 1.4, gap = 0.03, binSize = 0.01, angleStep = 10, candidates = 10,
} = {}) {
  // Developed paraglider panels are strongly curved — a mid-span panel fills
  // barely a third of its own bounding box, and a tip panel far less. Packing
  // bounding boxes therefore wastes most of the roll. Three things help:
  //
  //   1. Consider many rotations of each panel, not just the axis-aligned one.
  //   2. Place panels against a skyline built from their real outlines rather
  //      than their boxes, so curved shapes nest into each other.
  //   3. Choose the rotation by how well it actually packs against the work
  //      already placed, not by which one has the smallest box in isolation.
  //
  // This is a bottom-left-fill heuristic, not an optimal nest — that is a
  // genuinely hard problem and a later phase. It is fast enough to rerun on
  // every edit and recovers most of the easily available saving.

  const usableWidth = rollWidth - gap;
  if (usableWidth <= 0) throw new Error('Gap between panels is wider than the roll.');
  const nBins = Math.max(1, Math.ceil(rollWidth / binSize));
  const skyline = new Float64Array(nBins);
  const placed = [];

  // Largest first: big panels placed early leave gaps small ones can fill.
  const order = panels
    .map((item) => ({ item, pts: outlineOf(item) }))
    .sort((a, b) => bboxArea(b.pts) - bboxArea(a.pts));

  for (const { item, pts } of order) {
    const options = orientations(pts, usableWidth, angleStep, candidates);
    if (!options.length) {
      throw new Error(
        `Panel ${item.surface} cell ${item.cell} does not fit across a ${rollWidth} m roll in any orientation.`,
      );
    }

    let best = null;
    for (const o of options) {
      const bandCount = Math.min(nBins, Math.max(1, Math.ceil((o.height + gap) / binSize)));
      for (let s = 0; s + bandCount <= nBins; s++) {
        let x = 0;
        for (let k = 0; k < bandCount; k++) {
          const lp = o.leftProfile[k];
          if (lp === Infinity) continue;
          const need = skyline[s + k] - lp + gap;
          if (need > x) x = need;
        }
        const right = x + o.width;
        if (!best || right < best.right - 1e-9) {
          best = { o, start: s, dx: x, right, bandCount };
        }
      }
    }

    const { o, start, dx, bandCount } = best;
    const dy = start * binSize;
    const move = (p) => {
      const q = o.rot(p);
      return [q[0] - o.minX + dx, q[1] - o.minY + dy];
    };

    placed.push({
      ...item,
      outline: pts.map(move),
      left: item.panel.left.map(move),
      right: item.panel.right.map(move),
      angleDeg: o.angleDeg,
      width: o.width,
      height: o.height,
    });

    for (let k = 0; k < bandCount; k++) {
      const rp = o.rightProfile[k];
      if (rp === -Infinity) continue;
      const band = start + k;
      if (band >= nBins) continue;
      const reach = rp + dx;
      if (reach > skyline[band]) skyline[band] = reach;
    }
  }

  const all = placed.flatMap((p) => p.outline);
  return { placed, extent: bounds(all), rollWidth };
}

/**
 * Candidate rotations that fit across the roll, with their edge profiles
 * precomputed so the placement search is cheap array arithmetic.
 * Angles run the full circle: a panel and its 180-degree turn have the same
 * box but opposite curvature, and that is exactly what lets bananas interlock.
 */
function orientations(pts, usableWidth, angleStep, keep) {
  const out = [];
  for (let a = 0; a < 360; a += angleStep) {
    const t = (a * Math.PI) / 180;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const rot = (p) => [p[0] * c - p[1] * sn, p[0] * sn + p[1] * c];
    const rp = pts.map(rot);
    const bb = bounds(rp);
    const height = bb.maxY - bb.minY;
    if (height > usableWidth) continue;
    out.push({ angleDeg: a, rot, rpts: rp, bb, height, width: bb.maxX - bb.minX,
      minX: bb.minX, minY: bb.minY });
  }
  out.sort((p, q) => p.width - q.width);
  const chosen = out.slice(0, keep);
  for (const o of chosen) {
    const bandCount = Math.max(1, Math.ceil(o.height / BIN) + 1);
    o.leftProfile = new Float64Array(bandCount).fill(Infinity);
    o.rightProfile = new Float64Array(bandCount).fill(-Infinity);
    scanBands(o.rpts, o.minX, o.minY, BIN, bandCount, (k, x) => {
      if (x < o.leftProfile[k]) o.leftProfile[k] = x;
      if (x > o.rightProfile[k]) o.rightProfile[k] = x;
    });
  }
  return chosen;
}

const BIN = 0.01;

/** Walk the outline's edges, sampling them into bands across the roll. */
function scanBands(pts, minX, minY, binSize, bandCount, visit) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(Math.abs(q[1] - p[1]) / (binSize / 2)));
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const x = p[0] + (q[0] - p[0]) * f - minX;
      const y = p[1] + (q[1] - p[1]) * f - minY;
      const k = Math.floor(y / binSize);
      if (k >= 0 && k < bandCount) visit(k, x);
    }
  }
}

function outlineOf(item) {
  return item.panel.left.concat(item.panel.right.slice().reverse());
}

function bboxArea(pts) {
  const b = bounds(pts);
  return (b.maxX - b.minX) * (b.maxY - b.minY);
}





/**
 * `nested` lets a caller pass a layout that has already been computed.
 * Nesting is the most expensive step in the whole pipeline, and the interface
 * has usually just run it to draw the cutting view — recomputing it on every
 * export doubled the cost of saving a file for no benefit.
 */
export function panelsToDXF(panels, { rollWidth = 1.4, gap = 0.03, labels = true, nested: pre } = {}) {
  const nested = pre || nestPanels(panels, { rollWidth, gap });
  const doc = dxfDocument();

  for (const p of nested.placed) {
    const layer = `${p.surface}-cell-${p.cell}`;
    doc.polyline(p.outline, { layer, color: p.surface === 'upper' ? ACI.cyan : ACI.green, closed: true });
    if (labels) {
      const c = centroidOf(p.outline);
      doc.text(`${p.surface[0].toUpperCase()}${p.cell}`, c, { height: 0.03, color: ACI.yellow });
    }
  }

  // Roll edges, as a reminder of the usable width.
  doc.line([nested.extent.minX, 0], [nested.extent.maxX, 0], { layer: 'roll', color: ACI.magenta });
  doc.line([nested.extent.minX, rollWidth], [nested.extent.maxX, rollWidth], { layer: 'roll', color: ACI.magenta });

  return doc.toString();
}

export function ribsToDXF(wing, { gap = 0.04 } = {}) {
  const doc = dxfDocument();
  // Every rib's flat pattern occupies roughly the same chordwise range and is
  // centred on its own chord line, so drawing them in place stacks them all
  // on top of each other — a file that looks plausible on screen and is
  // useless to cut from. Lay them out in a column instead.
  let cursor = 0;
  wing.ribs.forEach((rib) => {
    const loop = rib.upper.slice().reverse().concat(rib.lower.slice(1));
    const flat = flattenRib(loop, rib);
    const ys = flat.map((p) => p[1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const dy = cursor - minY;
    const placed = flat.map(([x, y]) => [x, y + dy]);

    doc.polyline(placed, { layer: `rib-${rib.index}`, color: ACI.cyan, closed: true });
    doc.text(
      `R${rib.index}  y=${rib.station.toFixed(3)}m  c=${rib.chord.toFixed(3)}m  washin=${rib.alphaDeg.toFixed(2)}deg`,
      [placed[0][0], cursor + (maxY - minY) + gap * 0.25],
      { layer: 'notes', height: 0.02, color: ACI.yellow },
    );
    cursor += (maxY - minY) + gap;
  });
  return doc.toString();
}

/** Project a rib's 3D loop back into its own plane for flat cutting. */
function flattenRib(loop, rib) {
  const b = (rib.betaDeg * Math.PI) / 180;
  const oy = rib.lobePoint[0];
  const oz = rib.lobePoint[1];
  return loop.map(([x, y, z]) => {
    const dy = y - oy;
    const dz = z - oz;
    const v = -dy * Math.sin(b) + dz * Math.cos(b);
    return [x, v];
  });
}

/**
 * SVG of the same layout. Dimensions are given in millimetres and the viewBox
 * matches, so the file prints and plots at true size rather than at whatever
 * pixel scale a viewer happens to assume — which matters when the output is
 * a cutting pattern rather than a picture of one.
 */
export function panelsToSVG(panels, { rollWidth = 1.4, gap = 0.03, nested: pre } = {}) {
  const nested = pre || nestPanels(panels, { rollWidth, gap });
  const { minX, maxX } = nested.extent;
  const wmm = (maxX - minX) * 1000;
  const hmm = rollWidth * 1000;
  const parts = nested.placed.map((p) => {
    const d = p.outline.map((pt, i) =>
      `${i ? 'L' : 'M'}${((pt[0] - minX) * 1000).toFixed(2)} ${(hmm - pt[1] * 1000).toFixed(2)}`).join(' ');
    return `<path d="${d} Z" fill="none" stroke="${p.surface === 'upper' ? '#00b4d8' : '#4caf50'}" stroke-width="0.5"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wmm.toFixed(1)}mm" height="${hmm.toFixed(1)}mm" viewBox="0 0 ${wmm.toFixed(1)} ${hmm.toFixed(1)}">
<rect width="100%" height="100%" fill="#fff"/>
${parts.join('\n')}
</svg>`;
}

function bounds(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

function centroidOf(pts) {
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}

/** Fabric consumption estimate, in linear metres of roll. */
export function fabricEstimate(panels, { rollWidth = 1.4, gap = 0.03, nested: pre } = {}) {
  const nested = pre || nestPanels(panels, { rollWidth, gap });
  const linear = nested.extent.maxX - nested.extent.minX;
  const panelArea = panels.reduce((sum, p) => sum + polygonArea(
    p.panel.left.concat(p.panel.right.slice().reverse()),
  ), 0);
  return {
    linearMetres: linear,
    rollWidth,
    rollArea: linear * rollWidth,
    panelArea,
    utilisation: panelArea / (linear * rollWidth),
  };
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a / 2);
}

/**
 * Wrap a nested roll into bands for display.
 *
 * A nested lineset of panels comes out enormously long and thin — roughly
 * 38 m along a 1.4 m roll on a mid-size wing, an aspect ratio near 27:1.
 * Drawn as one strip in a viewport it fits to width and collapses to a
 * hairline a few pixels tall, using about 4% of the frame.
 *
 * Wrapping it into bands, the way a long roll is actually laid out across a
 * cutting floor, trades width for height until the drawing roughly matches
 * the frame. Four bands take that same layout to about 91% of frame height.
 *
 * This is a display transform only: it does not move a panel on the roll, and
 * the DXF and SVG exports are unaffected. A panel that straddles a band
 * boundary is drawn whole in the band its start falls in, so nothing is cut
 * in half by the wrapping.
 */
export function layoutBands(placed, {
  rollWidth = 1.4, targetAspect = 1.6, maxBands = 8, gapFraction = 0.35,
} = {}) {
  const rollLength = placed.length
    ? Math.max(...placed.flatMap((p) => p.outline.map((q) => q[0])))
    : 0;
  if (rollLength <= 0) {
    return { bands: 1, bandLength: 0, gapY: 0, rollLength: 0, place: (p) => p, totalHeight: rollWidth };
  }

  const bands = Math.max(1, Math.min(maxBands,
    Math.round(Math.sqrt((rollLength / rollWidth) / targetAspect))));
  const bandLength = rollLength / bands;
  const gapY = rollWidth * gapFraction;
  const bandOf = (x) => Math.min(bands - 1, Math.max(0, Math.floor(x / bandLength)));

  return {
    bands,
    bandLength,
    gapY,
    rollLength,
    totalHeight: bands * rollWidth + (bands - 1) * gapY,
    displayAspect: bandLength / (bands * rollWidth + (bands - 1) * gapY),
    bandOf,
    /**
     * Shift one panel's points into its band.
     *
     * The band is chosen from the panel's leftmost point, not its first: the
     * outline starts wherever the seam does, which can be well to the right
     * of the panel's left edge. Choosing on the first point pushed part of
     * two panels to negative x — drawn outside their band and off the left
     * of the frame.
     */
    placePanel(panel) {
      const b = bandOf(Math.min(...panel.outline.map((q) => q[0])));
      const dy = -b * (rollWidth + gapY);
      const dx = -b * bandLength;
      return { band: b, points: panel.outline.map(([x, y]) => [x + dx, y + dy]) };
    },
    /** Roll edges for each band. */
    edges() {
      const out = [];
      for (let b = 0; b < bands; b++) {
        const yTop = -b * (rollWidth + gapY);
        out.push({ band: b, top: [[0, yTop], [bandLength, yTop]], bottom: [[0, yTop + rollWidth], [bandLength, yTop + rollWidth]] });
      }
      return out;
    },
  };
}

/**
 * Nest and write the diagonal ribs.
 *
 * Their flat patterns are fans — an apex and a curved base — which nest very
 * differently from the wing's panels. A panel is long and narrow and wants to
 * lie along the roll; a fan is a wedge, and wedges pack by alternating point
 * to base. The existing nester handles that on its own, because it searches
 * orientations against the real outline rather than the bounding box, and a
 * wedge rotated 180 degrees interlocks with its neighbour.
 *
 * They are nested separately from the panels rather than mixed in. Diagonals
 * are usually cut from a different, lighter cloth than the sail, so mixing
 * them into one layout would produce a cutting file nobody can use.
 */
export function vribsToDXF(vribSet, { rollWidth = 1.4, gap = 0.03, labels = true } = {}) {
  const items = vribSet.vribs.map((v, i) => ({
    surface: 'vrib',
    cell: i + 1,
    label: `${v.row}${v.fromRib}-${v.toRib}`,
    panel: fanAsPanel(v),
  }));

  const nested = nestPanels(items, { rollWidth, gap });
  const doc = dxfDocument();

  for (const p of nested.placed) {
    doc.polyline(p.outline, {
      layer: `vrib-${p.label}`, color: ACI.magenta, closed: true,
    });
    if (labels) {
      const c = centroidOf(p.outline);
      doc.text(p.label, c, { height: 0.02, color: ACI.yellow });
    }
  }
  doc.line([nested.extent.minX, 0], [nested.extent.maxX, 0], { layer: 'roll', color: ACI.cyan });
  doc.line([nested.extent.minX, rollWidth], [nested.extent.maxX, rollWidth],
    { layer: 'roll', color: ACI.cyan });

  return doc.toString();
}

/**
 * Present a fan as a two-sided panel so the nester can take it.
 *
 * The nester works on a left and a right seam. A fan has an apex and a base,
 * so the apex is repeated down one side: degenerate as a seam, correct as an
 * outline, and it keeps one nesting implementation rather than two.
 */
function fanAsPanel(vrib) {
  const base = vrib.flat.base;
  return {
    left: base.map(() => [0, 0]),
    right: base.map((p) => [p[0], p[1]]),
    seamLengths: { left: 0, right: 0, leftSource: 0, rightSource: 0 },
  };
}

/** Fabric needed for the diagonals, on their own roll. */
export function vribFabricEstimate(vribSet, { rollWidth = 1.4, gap = 0.03 } = {}) {
  if (!vribSet.vribs.length) {
    return { linearMetres: 0, rollWidth, panelArea: 0, utilisation: 0, count: 0 };
  }
  const items = vribSet.vribs.map((v, i) => ({
    surface: 'vrib', cell: i + 1, panel: fanAsPanel(v),
  }));
  const est = fabricEstimate(items, { rollWidth, gap });
  return {
    ...est,
    count: vribSet.vribs.length,
    // True surface area, as against the flat-pattern area the nester sees.
    surfaceAreaM2: vribSet.totalAreaM2,
  };
}


/**
 * Panels with their registration marks, as a cutting file.
 *
 * The plain export writes outlines. A cutter can cut those; a sewer cannot
 * assemble them, because nothing says which panel is which or where along a
 * two-metre seam any point belongs — and after ovalization the two seams that
 * get sewn together differ by up to 31 mm.
 *
 * The notch *count* comes from the unplaced panels, because it has to be
 * agreed between the two seams that will be joined. The notch *positions* are
 * then taken along the placed seams, which the nester already returns in
 * final coordinates — so nothing has to reconstruct its rotation and offset,
 * and the marks cannot drift away from the outline they belong to.
 *
 * Marks go on their own layers, so a cutting table can be told to cut the
 * outline, plot the notches and ignore the text.
 */
export function markedPanelsToDXF(panels, {
  rollWidth = 1.4, gap = 0.03, nested = null, marking = {}, packer = 'profile',
} = {}) {
  // The profile packer saves about 4.5 m of roll on a 25 m2 wing against the
  // box packer, so it is the default. `packer: 'box'` keeps the old layout
  // for comparison.
  const layout = nested
    || (packer === 'profile'
      ? nestByProfile(panels, { rollWidth, gap })
      : nestPanels(panels, { rollWidth, gap }));
  const marks = markPanels(panels, marking);
  const byKey = new Map(marks.marks.map((m) => [`${m.surface}:${m.cell}`, m]));
  const doc = dxfDocument();

  for (const p of layout.placed) {
    doc.polyline(p.outline, {
      layer: `panel-${p.surface}`,
      color: p.surface === 'upper' ? ACI.cyan : ACI.green,
      closed: true,
    });

    const m = byKey.get(`${p.surface}:${p.cell}`);
    // The profile packer returns the placed outline but not the two seams
    // separately, so marks are placed from the seams only when they are
    // available. A layout without them still gets its outline and label.
    if (!m) continue;
    if (!p.left || !p.right) {
      doc.text(m.label, [p.outline[0][0], p.outline[0][1]],
        { height: 0.02, layer: 'label', color: ACI.white });
      continue;
    }

    const placedMarks = markPlacedSeams(p.left, p.right,
      m.leftNotches.map((n) => n.fraction),
      m.rightNotches.map((n) => n.fraction),
      { ...DEFAULT_MARKING, ...marking });

    for (const n of placedMarks.notches) {
      doc.polyline(n.cut, { layer: 'notch', color: ACI.magenta });
    }
    doc.line(placedMarks.grain[0], placedMarks.grain[1],
      { layer: 'grain', color: ACI.yellow });
    doc.text(m.label, placedMarks.labelAt,
      { height: 0.02, layer: 'label', color: ACI.white });
  }

  doc.line([layout.extent.minX, 0], [layout.extent.maxX, 0],
    { layer: 'roll', color: ACI.magenta });
  doc.line([layout.extent.minX, rollWidth], [layout.extent.maxX, rollWidth],
    { layer: 'roll', color: ACI.magenta });
  return doc.toString();
}

/* ------------------------------------------------------ printed patterns -- */

/** Paper sizes, in millimetres. */
export const PAPER = {
  A4: [210, 297],
  A4L: [297, 210],
  A3: [297, 420],
  A3L: [420, 297],
  Letter: [215.9, 279.4],
};

/**
 * Tile a cutting layout into printable pages.
 *
 * The SVG export writes the whole roll as one sheet — 32 metres long on the
 * test wing, which is right for a plotter and useless to anyone without one.
 * At A4 that sheet is 171 by 6 tiles, and **most of those tiles are empty**,
 * because a nested layout is mostly gaps. Emitting all 1026 would bury the
 * ones that matter.
 *
 * So blank pages are dropped, and each printed page carries the grid
 * reference it came from, which is what lets a builder lay them back out.
 *
 * ---------------------------------------------------------------------------
 * The things that make a printed pattern usable
 * ---------------------------------------------------------------------------
 * **Exact scale, verifiably.** A pattern printed at 97% is worse than no
 * pattern, and printer drivers scale to fit by default. Every page carries a
 * 100 mm calibration bar: if it does not measure 100 mm, the print is wrong
 * and nothing on it can be trusted.
 *
 * **Overlap, not butt joints.** Pages that meet exactly cannot be aligned;
 * pages that overlap can be laid one over the other until the marks agree.
 *
 * **Registration marks inside the overlap**, so the same crosses appear on
 * both of two adjoining pages.
 */
export function tiledPages(panels, {
  paper = 'A4',
  marginMM = 10,
  overlapMM = 15,
  nested = null,
  rollWidth = 1.4,
  gap = 0.03,
  marking = {},
  includeMarks = true,
} = {}) {
  const size = Array.isArray(paper) ? paper : PAPER[paper];
  if (!size) throw new Error(`Unknown paper size: ${paper}`);
  const [pageW, pageH] = size;

  // Usable area, and the step between page origins. The step is smaller than
  // the usable area by the overlap, which is what makes adjoining pages share
  // a strip.
  const usableW = pageW - 2 * marginMM;
  const usableH = pageH - 2 * marginMM;
  const stepX = usableW - overlapMM;
  const stepY = usableH - overlapMM;
  if (stepX <= 0 || stepY <= 0) {
    throw new Error('Overlap leaves no usable area on the page');
  }

  const layout = nested || nestPanels(panels, { rollWidth, gap });
  const marks = includeMarks ? markPanels(panels, marking) : null;
  const byKey = marks ? new Map(marks.marks.map((m) => [`${m.surface}:${m.cell}`, m])) : null;

  // Everything to be drawn, in millimetres.
  const shapes = [];
  for (const p of layout.placed) {
    shapes.push({
      points: p.outline.map(([x, y]) => [x * 1000, y * 1000]),
      kind: 'panel', label: `${p.cell}${p.surface === 'upper' ? 'U' : 'L'}`,
      closed: true,
    });
    if (!byKey) continue;
    const m = byKey.get(`${p.surface}:${p.cell}`);
    if (!m || !p.left || !p.right) continue;
    const pm = markPlacedSeams(p.left, p.right,
      m.leftNotches.map((n) => n.fraction), m.rightNotches.map((n) => n.fraction),
      { ...DEFAULT_MARKING, ...marking });
    for (const n of pm.notches) {
      shapes.push({ points: n.cut.map(([x, y]) => [x * 1000, y * 1000]), kind: 'notch' });
    }
    shapes.push({
      points: pm.grain.map(([x, y]) => [x * 1000, y * 1000]), kind: 'grain',
    });
  }

  const xs = shapes.flatMap((s) => s.points.map((q) => q[0]));
  const ys = shapes.flatMap((s) => s.points.map((q) => q[1]));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const totalW = Math.max(...xs) - minX;
  const totalH = Math.max(...ys) - minY;

  const cols = Math.max(1, Math.ceil((totalW - overlapMM) / stepX));
  const rows = Math.max(1, Math.ceil((totalH - overlapMM) / stepY));

  const pages = [];
  let blank = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = minX + c * stepX;
      const y0 = minY + r * stepY;
      const clip = shapes.filter((s) => s.points.some(([x, y]) =>
        x >= x0 - 1 && x <= x0 + usableW + 1 && y >= y0 - 1 && y <= y0 + usableH + 1));
      if (!clip.length) { blank++; continue; }
      pages.push({
        column: c + 1,
        row: r + 1,
        reference: `${String.fromCharCode(65 + r)}${c + 1}`,
        originMM: [x0, y0],
        shapes: clip,
        svg: pageSVG(clip, x0, y0, {
          pageW, pageH, marginMM, usableW, usableH, overlapMM,
          reference: `${String.fromCharCode(65 + r)}${c + 1}`,
          grid: `${cols} x ${rows}`,
        }),
      });
    }
  }

  return {
    pages,
    columns: cols,
    rows,
    blankPagesSkipped: blank,
    totalTiles: cols * rows,
    paper,
    pageMM: [pageW, pageH],
    overlapMM,
    marginMM,
    extentMM: [totalW, totalH],
    // A builder needs to know how many sheets to load, and how much was saved
    // by not printing the empty ones.
    note: `${pages.length} printed of ${cols * rows} tiles; `
      + `${blank} blank pages skipped`,
  };
}

/** One page, at exactly 1:1. */
function pageSVG(shapes, x0, y0, o) {
  const t = ([x, y]) => [x - x0 + o.marginMM, y - y0 + o.marginMM];
  const path = (pts, close) => `M${pts.map(t).map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(' L')}${close ? ' Z' : ''}`;

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.pageW}mm" `
    + `height="${o.pageH}mm" viewBox="0 0 ${o.pageW} ${o.pageH}">`);
  out.push('<rect width="100%" height="100%" fill="#fff"/>');

  for (const s of shapes) {
    const stroke = s.kind === 'notch' ? '#d000a0' : (s.kind === 'grain' ? '#b08000' : '#000');
    out.push(`<path d="${path(s.points, s.closed)}" fill="none" stroke="${stroke}" `
      + `stroke-width="0.3"/>`);
  }

  // The overlap strip, so a builder can see how far to lay one page over the
  // next.
  out.push(`<rect x="${o.marginMM}" y="${o.marginMM}" width="${o.usableW}" `
    + `height="${o.usableH}" fill="none" stroke="#ccc" stroke-width="0.2" `
    + `stroke-dasharray="2 2"/>`);
  out.push(`<rect x="${o.marginMM + o.usableW - o.overlapMM}" y="${o.marginMM}" `
    + `width="${o.overlapMM}" height="${o.usableH}" fill="#000" fill-opacity="0.03"/>`);
  out.push(`<rect x="${o.marginMM}" y="${o.marginMM + o.usableH - o.overlapMM}" `
    + `width="${o.usableW}" height="${o.overlapMM}" fill="#000" fill-opacity="0.03"/>`);

  // Registration crosses at the corners of the usable area. The same crosses
  // fall inside the neighbouring page's overlap strip.
  const cross = (x, y) => `<path d="M${x - 4} ${y} L${x + 4} ${y} M${x} ${y - 4} `
    + `L${x} ${y + 4}" stroke="#000" stroke-width="0.3" fill="none"/>`;
  for (const [cx, cy] of [
    [o.marginMM, o.marginMM],
    [o.marginMM + o.usableW, o.marginMM],
    [o.marginMM, o.marginMM + o.usableH],
    [o.marginMM + o.usableW, o.marginMM + o.usableH],
  ]) out.push(cross(cx, cy));

  // The calibration bar. If this does not measure 100 mm, the print is scaled
  // and nothing on the page can be used.
  const by = o.pageH - o.marginMM / 2;
  out.push(`<path d="M${o.marginMM} ${by} L${o.marginMM + 100} ${by} `
    + `M${o.marginMM} ${by - 2} L${o.marginMM} ${by + 2} `
    + `M${o.marginMM + 100} ${by - 2} L${o.marginMM + 100} ${by + 2}" `
    + `stroke="#000" stroke-width="0.4" fill="none"/>`);
  out.push(`<text x="${o.marginMM + 103}" y="${by + 2}" font-size="3.5" `
    + `font-family="monospace">100 mm — if this is not exactly 100 mm, the print is scaled</text>`);
  out.push(`<text x="${o.pageW - o.marginMM}" y="${o.marginMM - 2}" font-size="5" `
    + `text-anchor="end" font-family="monospace">${o.reference} of ${o.grid}</text>`);

  out.push('</svg>');
  return out.join('\n');
}

/* ------------------------------------------------------------ reading DXF -- */

/**
 * Read a DXF back.
 *
 * This project has written DXF since Phase 1 — panels, ribs, diagonals,
 * marked panels — and has never read one. Every cutting file it has produced
 * was checked by counting the polylines it *meant* to write, which is not the
 * same as checking what a cutter would find in the file.
 *
 * A round trip closes that: write a panel set, read it back, and confirm the
 * geometry that comes out is the geometry that went in. It also gives a way
 * to check a DXF from elsewhere, which is how a published design's own
 * cutting file can be compared with a generated one.
 *
 * Minimal by intent — group codes come in pairs, and this reads the entities
 * this project emits plus the LINE segments other tools emit instead. It is
 * not a DXF library and does not pretend to be: blocks, splines and
 * transformations are not handled, and a file using them will come back with
 * fewer entities than it has rather than with wrong ones.
 */
export function parseDXF(text) {
  const raw = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    pairs.push([raw[i].trim(), raw[i + 1]]);
  }

  const entities = [];
  let cur = null;
  let pendingX = null;
  let open = false;        // inside a POLYLINE awaiting its VERTEX entities
  let vertexOpen = false;

  const flush = () => {
    if (cur && !open) { entities.push(cur); cur = null; }
  };

  for (const [code, value] of pairs) {
    if (code === '0') {
      // A classic POLYLINE carries its points in following VERTEX entities,
      // not inside itself. This project's own writer emits that form — so a
      // reader that only looked inside the polyline found zero points in
      // every file the tool has ever produced.
      if (value === 'VERTEX' && open) {
        vertexOpen = true;
        pendingX = null;
        continue;
      }
      if (value === 'SEQEND') {
        // Clear `open` BEFORE flushing: flush() refuses to emit while a
        // polyline is still awaiting vertices, so flushing first left every
        // polyline unpushed and the reader returned only TEXT.
        vertexOpen = false;
        open = false;
        flush();
        pendingX = null;
        continue;
      }
      vertexOpen = false;
      flush();
      if (['LWPOLYLINE', 'POLYLINE', 'LINE', 'CIRCLE', 'TEXT'].includes(value)) {
        cur = { type: value, layer: null, points: [], closed: false };
        open = /POLYLINE/.test(value);
      } else {
        open = false;
      }
      pendingX = null;
      continue;
    }
    if (!cur) continue;

    switch (code) {
      case '8': cur.layer = value; break;
      case '70': cur.closed = (Number(value) & 1) === 1; break;
      case '1': cur.text = value; break;
      // A classic POLYLINE header carries a mandatory dummy point at the
      // origin — DXF calls it the elevation point — before its VERTEX
      // entities begin. Reading it as a vertex puts a spurious (0,0) into
      // every outline.
      //
      // That is exactly what produced a 3.24x area discrepancy on a round
      // trip, varying from 4.1x to 10.8x per panel: a shoelace polygon with
      // an extra point at the origin encloses a wedge back to (0,0), and the
      // size of that wedge depends on how far the panel sits from it.
      //
      // The export was correct all along. The cutting files this tool has
      // produced are fine; the reader written to check them was not.
      case '10':
        if (!(open && !vertexOpen)) pendingX = Number(value);
        break;
      case '20':
        if (pendingX !== null) { cur.points.push([pendingX, Number(value)]); pendingX = null; }
        break;
      // A LINE's second endpoint.
      case '11': cur.x2 = Number(value); break;
      case '21':
        if (cur.x2 !== undefined) { cur.points.push([cur.x2, Number(value)]); delete cur.x2; }
        break;
      case '40': cur.radius = Number(value); break;
      default: break;
    }
  }
  open = false;
  flush();

  const polylines = entities.filter((e) => /POLYLINE/.test(e.type) && e.points.length > 1);
  const segments = entities.filter((e) => e.type === 'LINE' && e.points.length === 2);

  return {
    entities,
    polylines,
    segments,
    circles: entities.filter((e) => e.type === 'CIRCLE'),
    texts: entities.filter((e) => e.type === 'TEXT'),
    layers: [...new Set(entities.map((e) => e.layer).filter(Boolean))],
    // What could not be read, so a file that needs more than this says so
    // rather than coming back looking complete.
    unreadTypes: [...new Set(raw.filter((_, i) => i % 2 === 1)
      .filter((v, i) => raw[i * 2] === '  0'))].filter(
      (t) => !['LWPOLYLINE', 'POLYLINE', 'LINE', 'CIRCLE', 'TEXT', 'SECTION',
        'ENDSEC', 'EOF', 'TABLE', 'ENDTAB', 'VERTEX', 'SEQEND'].includes(t)),
  };
}

/** Signed area of a closed outline, for comparing what was written with what was meant. */
export function outlineArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/**
 * Rebuild closed outlines from unordered line segments.
 *
 * Some tools draw a cut file as polylines and some as loose segments.
 * Laboratori d'envol's own 2D DXF for the Swoop2 draws its panels as **83,776
 * individual LINE entities**, so comparing this project's development against
 * the method author's own output needs the outlines put back together.
 *
 * The segments arrive in no order and with no grouping. What joins them is
 * coincident endpoints, and "coincident" in a file written at six decimal
 * places means within a tolerance rather than exactly equal. So endpoints are
 * snapped to a grid, an adjacency is built, and closed loops are walked out
 * of it.
 *
 * `tolerance` is in the file's own units and matters: too tight and a loop
 * breaks at a rounding difference, too loose and two panels lying edge to
 * edge on the roll merge into one. Both failures are reported rather than
 * silently returned as a smaller number of larger shapes.
 */
export function outlinesFromSegments(segments, { tolerance = 1e-4 } = {}) {
  const key = (p) => `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)}`;

  // Adjacency: node -> [{ to, point, used }]
  const nodes = new Map();
  const at = (p) => {
    const k = key(p);
    if (!nodes.has(k)) nodes.set(k, { point: p, edges: [] });
    return k;
  };

  const edges = [];
  for (const s of segments) {
    if (!s.points || s.points.length !== 2) continue;
    const [a, b] = s.points;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < tolerance) continue;  // zero length
    const ka = at(a);
    const kb = at(b);
    const e = { a: ka, b: kb, used: false, layer: s.layer };
    edges.push(e);
    nodes.get(ka).edges.push(e);
    nodes.get(kb).edges.push(e);
  }

  const loops = [];
  const open = [];

  for (const start of edges) {
    if (start.used) continue;
    start.used = true;
    const path = [nodes.get(start.a).point, nodes.get(start.b).point];
    let here = start.b;
    const first = start.a;
    let closed = false;

    // Walk while exactly one unused edge continues the path. A junction with
    // several choices is where two outlines touch, and guessing there is how
    // a reconstruction quietly merges two panels.
    for (;;) {
      const options = nodes.get(here).edges.filter((e) => !e.used);
      if (options.length !== 1) break;
      const next = options[0];
      next.used = true;
      const other = next.a === here ? next.b : next.a;
      path.push(nodes.get(other).point);
      here = other;
      if (other === first) { closed = true; break; }
    }

    if (closed) loops.push(path.slice(0, -1));
    else if (path.length > 2) open.push(path);
  }

  return {
    loops,
    open,
    segmentCount: edges.length,
    nodeCount: nodes.size,
    tolerance,
    // A junction is where more than two segments meet: two outlines touching,
    // or a genuine branch. Reported because it is where reconstruction can go
    // wrong, and a caller may want to retry at a different tolerance.
    junctions: [...nodes.values()].filter((n) => n.edges.length > 2).length,
    note: open.length
      ? `${loops.length} closed, ${open.length} paths left open — try a `
        + 'different tolerance, or the file genuinely has open edges'
      : `${loops.length} closed outlines, nothing left over`,
  };
}

/**
 * The wing as a 3D model, for CAD.
 *
 * ---------------------------------------------------------------------------
 * Why OBJ
 * ---------------------------------------------------------------------------
 * The thing being exported is two surfaces, a set of ribs, and a few hundred
 * LINES. That last part decides it.
 *
 * **STL** carries triangles and nothing else — no curves, no grouping, no
 * names. Half of a paraglider is its line cascade, and STL cannot represent a
 * line at all. It would export a sail and silently drop the rigging.
 *
 * **IGES** can hold curves and surfaces, but it is a 1980s format with
 * uneven modern support and no clean way to group entities into named parts.
 *
 * **STEP** carries the most information of any of them — true B-rep surfaces
 * and a real assembly tree — and it is the right answer for a machined part.
 * It is the wrong answer here. Writing valid AP214 means emitting a correct
 * entity graph of cartesian points, b-spline surfaces, faces, shells and
 * product structure, and any mistake produces a file that opens as nothing.
 * A paraglider has no parametric feature tree to preserve: its surfaces are
 * ruled between rib curves, so a mesh loses essentially nothing.
 *
 * **OBJ** is the only light, universally-read format that carries polygon
 * surfaces AND polylines AND named groups in one file. Blender, Rhino,
 * Fusion, FreeCAD, MeshLab and every three.js viewer read it. It is plain
 * text, so it diffs and compresses.
 *
 * Groups share a single vertex pool, which is exactly what was wanted: the
 * upper surface, the lower surface, the ribs and the lines are independently
 * selectable and hideable, while the ribs still share their edges with the
 * surfaces rather than being a separate floating copy.
 *
 * The whole wing is written, not the half that is modelled. A CAD model of
 * half a paraglider is a curiosity.
 */
export function wingToOBJ({
  wing, linePlan = null, name = 'wing', mirror = true, includeLines = true,
  pointsPerSurface = 60, spacing = 'cosine',
} = {}) {
  if (!wing?.ribs?.length) throw new Error('wingToOBJ needs a wing with ribs');

  // The ribs are re-sampled for the model, with points clustered at the nose.
  //
  // A wing is built with as few points per surface as the panel work needs —
  // 24 is typical — spread evenly along the surface. That is fine for cutting
  // and wrong for looking at: on a 2.19 m chord the first station landed at
  // 2.53% and the leading edge, the roundest part of the section, came out as
  // a single straight cut across it.
  //
  // Cosine spacing puts the first station at 0.04% chord instead. It is done
  // HERE rather than in the wing, because switching it on globally changed
  // how ovalization eases the two seams of a panel, and a leading edge in a
  // 3D model is not a reason to change what gets sewn.
  const ribs = wing.ribs.map((rib) => {
    if (!spacing || spacing === 'none') return rib;
    const re = (pts) => {
      // resampleSurface works in 2D; the rib points are 3D, so each axis is
      // carried through the same parameterisation.
      const flat = pts.map((p) => [p[0], p[2]]);
      const idx = resampleSurface(
        pts.map((p, i) => [i, 0]), pointsPerSurface, { spacing });
      return idx.map(([fi]) => {
        const i0 = Math.min(pts.length - 2, Math.max(0, Math.floor(fi)));
        const f = Math.min(1, Math.max(0, fi - i0));
        const a = pts[i0];
        const b = pts[i0 + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f,
          a[2] + (b[2] - a[2]) * f];
      });
    };
    return { ...rib, upper: re(rib.upper), lower: re(rib.lower) };
  });

  const v = [];
  const index = new Map();
  // Vertices are shared between groups, so a rib edge is the same points as
  // the panel edge beside it rather than a duplicate sitting on top of it.
  // `+0` turns -0 into 0 before the key is made.
  //
  // Mirroring the centreline gives y = -0, which prints as "-0.000000" and
  // keys differently from "0.000000" — the same point stored twice. Four
  // copies of the trailing-edge point appeared that way, and a CAD package
  // reading them sees coincident vertices and an open edge where there is
  // none.
  const round = (x) => Number((x + 0).toFixed(6)) + 0;
  const vert = (p) => {
    const q = [round(p[0]), round(p[1]), round(p[2])];
    const key = `${q[0]},${q[1]},${q[2]}`;
    let i = index.get(key);
    if (i === undefined) {
      v.push(q);
      i = v.length;            // OBJ indices are 1-based
      index.set(key, i);
    }
    return i;
  };

  // Both halves, or just the one modelled.
  const sides = mirror ? [1, -1] : [1];
  const flip = (p, s) => [p[0], p[1] * s, p[2]];

  const faces = { upper: [], lower: [] };
  const ribLines = [];

  for (const s of sides) {
    for (let r = 0; r < ribs.length; r++) {
      const rib = ribs[r];

      // The rib outline as a closed polyline: up one surface, back the other.
      const loop = rib.upper.map((p) => vert(flip(p, s)))
        .concat(rib.lower.slice(1, -1).reverse().map((p) => vert(flip(p, s))));
      ribLines.push(loop.concat([loop[0]]));

      // Panels between this rib and the next, on each surface.
      const next = ribs[r + 1];
      if (!next) continue;
      for (const surf of ['upper', 'lower']) {
        const a = rib[surf];
        const b = next[surf];
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n - 1; i++) {
          const q = [
            vert(flip(a[i], s)), vert(flip(a[i + 1], s)),
            vert(flip(b[i + 1], s)), vert(flip(b[i], s)),
          ];
          // Wind the mirrored half the other way so its normals face out.
          faces[surf].push(s > 0 ? q : q.slice().reverse());
        }
      }
    }

    // The centre cell, when a cell straddles the centreline: the panel
    // between the innermost rib and its mirror. Written once, from the
    // positive side, because it belongs to neither half.
    if (wing.centreRib === false && s > 0 && ribs.length) {
      const inner = ribs[0];
      for (const surf of ['upper', 'lower']) {
        const a = inner[surf];
        for (let i = 0; i < a.length - 1; i++) {
          faces[surf].push([
            vert(flip(a[i], -1)), vert(flip(a[i + 1], -1)),
            vert(flip(a[i + 1], 1)), vert(flip(a[i], 1)),
          ]);
        }
      }
    }
  }

  // Lines, as polylines by row so each row can be picked out.
  const lineGroups = {};
  if (includeLines && linePlan?.lines?.length) {
    for (const s of sides) {
      for (const l of linePlan.lines) {
        if (!l.from || !l.to) continue;
        const row = l.row || 'line';
        (lineGroups[row] ||= []).push([
          vert(flip(l.from, s)), vert(flip(l.to, s)),
        ]);
      }
    }
  }

  const out = [
    `# ${name} — paraglider, exported as OBJ`,
    '#',
    '# Groups: upper_surface, lower_surface, ribs, and one per line row.',
    '# They share a vertex pool, so a rib edge IS the panel edge beside it.',
    '# Units are metres. X is chordwise, Y spanwise, Z up.',
    `o ${name.replace(/\s+/g, '_')}`,
  ];
  for (const p of v) {
    out.push(`v ${p[0].toFixed(6)} ${p[1].toFixed(6)} ${p[2].toFixed(6)}`);
  }
  for (const [surf, list] of [['upper_surface', faces.upper],
    ['lower_surface', faces.lower]]) {
    out.push(`g ${surf}`);
    for (const f of list) out.push(`f ${f.join(' ')}`);
  }
  out.push('g ribs');
  for (const l of ribLines) out.push(`l ${l.join(' ')}`);
  for (const [row, segs] of Object.entries(lineGroups)) {
    out.push(`g lines_${row}`);
    for (const seg of segs) out.push(`l ${seg.join(' ')}`);
  }

  return `${out.join('\n')}\n`;
}
