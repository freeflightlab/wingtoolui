import { resampleSurface } from './airfoil.js';
import { toRibPlane, ribCopies } from './wing3d.js';
import { markPanels, markPlacedSeams, DEFAULT_MARKING } from './marking.js';
import { nestByProfile, nestingOverlaps } from './pairing.js';
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
  method = 'profile',
} = {}) {
  // The profile packer, whenever it succeeds and its layout checks out.
  //
  // The tool drew and exported the skyline layout below while a better packer
  // sat unused in pairing.js: 48% of the roll against 64% on the default
  // wing, 39.6 m of cloth a half against 30.1. The profile packer keeps the
  // gap in every direction and is measured, not trusted — any overlap and
  // this falls back to the skyline layout, which cannot overlap by
  // construction.
  if (method === 'profile') {
    try {
      const n = nestByProfile(panels, { rollWidth, gap });
      if (nestingOverlaps(n) === 0) {
        n.placed = n.placed.map((q, i) => ({ ...panelsById(panels, q), ...q, _i: i }));
        n.method = 'profile';
        return n;
      }
    } catch (e) {
      // fall through to the skyline layout
    }
  }
  return nestSkyline(panels, { rollWidth, gap, binSize, angleStep, candidates });
}

/** The panel a placed entry came from, so its other fields ride along. */
function panelsById(panels, q) {
  return panels.find((p) => p.cell === q.cell && p.surface === q.surface && p.panel === q.panel
    && (p.part ?? null) === (q.part ?? p.part ?? null)) || {};
}

function nestSkyline(panels, {
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
  return { placed, extent: bounds(all), rollWidth, method: 'skyline' };
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
    const layer = `${p.surface}-cell-${p.cell}${p.part ? `-${p.part}` : ''}`;
    doc.polyline(p.outline, { layer, color: p.surface === 'upper' ? ACI.cyan : ACI.green, closed: true });
    if (labels) {
      const c = centroidOf(p.outline);
      doc.text(`${p.surface[0].toUpperCase()}${p.cell}${p.part ? p.part[0] : ''}`, c, { height: 0.03, color: ACI.yellow });
    }
  }

  // Roll edges, as a reminder of the usable width.
  doc.line([nested.extent.minX, 0], [nested.extent.maxX, 0], { layer: 'roll', color: ACI.magenta });
  doc.line([nested.extent.minX, rollWidth], [nested.extent.maxX, rollWidth], { layer: 'roll', color: ACI.magenta });

  return doc.toString();
}

/**
 * A closed outline moved outward by a fixed distance: a seam allowance.
 *
 * Each vertex moves along the bisector of its two edges' normals, far enough
 * that both edges end up `d` from where they were. At a sharp corner — a
 * trailing edge — that distance runs away, so it is held to `miterLimit`
 * times `d`.
 *
 * The rib view drew its allowance by pushing every point away from the
 * rib's CENTRE instead. On a shape as long and thin as a rib that is right
 * at the nose and the tail and wrong everywhere between: at 80% of chord
 * "away from the centre" is along the chord, so the dashed line ran a
 * centimetre aft of the surface it was supposed to be a centimetre outside.
 */
export function offsetClosedLoop(loop, d, { miterLimit = 2.5 } = {}) {
  // Drop repeated points, and a last point that repeats the first.
  const pts = [];
  for (const p of loop) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-12) pts.push([p[0], p[1]]);
  }
  while (pts.length > 1
    && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 1e-12) {
    pts.pop();
  }
  const n = pts.length;
  if (n < 3 || !d) return pts;

  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  // Outward is to the right of the direction of travel on a counter-clockwise
  // outline, to the left on a clockwise one.
  const side = area > 0 ? 1 : -1;
  const normal = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    return [(dy / m) * side, (-dx / m) * side];
  };

  const out = [];
  for (let i = 0; i < n; i++) {
    const n1 = normal(pts[(i - 1 + n) % n], pts[i]);
    const n2 = normal(pts[i], pts[(i + 1) % n]);
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my);
    let reach = d;
    if (ml < 1e-9) {
      [mx, my] = n1;
    } else {
      mx /= ml;
      my /= ml;
      const cos = mx * n1[0] + my * n1[1];
      reach = d / Math.max(cos, 1 / miterLimit);
    }
    out.push([pts[i][0] + mx * reach, pts[i][1] + my * reach]);
  }
  return out;
}

/**
 * Every rib of the half wing as a pattern, laid out in a column.
 *
 * `features(rib)` supplies what is marked on each one, in the rib's own
 * plane: `{ loop, cutLine, anchors, holes, rods, apexes, bases, intake }`.
 * It is the interface's, so the file carries exactly what the Rib tab
 * draws. Without it only the outline is written.
 *
 * This wrote the outline and a label and nothing else — no line anchors, no
 * openings, no rods, no marks for the diagonals, no seam allowance — while
 * the Rib tab drew all of them. A rib cut from the file could not have been
 * sewn into the wing on the screen.
 */
export function ribsToDXF(wing, { gap = 0.04, features = null } = {}) {
  const doc = dxfDocument();
  // Every rib's flat pattern occupies roughly the same chordwise range and is
  // centred on its own chord line, so drawing them in place stacks them all
  // on top of each other — a file that looks plausible on screen and is
  // useless to cut from. Lay them out in a column instead.
  let cursor = 0;
  const any = { cut: false, anchors: 0, holes: 0, rods: 0, diagonals: 0 };
  // Room between ribs for what is written under each one: the marks hang
  // below the lower edge, and the next rib's own label sits above its top.
  if (features) gap = Math.max(gap, 0.12);
  wing.ribs.forEach((rib) => {
    const f = features ? features(rib) : null;
    const flat = f ? f.loop : flattenRib(rib.upper.slice().reverse().concat(rib.lower.slice(1)), rib);
    const outer = f && f.cutLine && f.cutLine.length ? f.cutLine : flat;
    const ys = outer.map((p) => p[1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const dy = cursor - minY;
    const at = ([x, y]) => [x, y + dy];
    const layerOf = (what) => `rib-${rib.index}-${what}`;

    // The sewing line: the rib as it is in the wing.
    doc.polyline(flat.map(at), { layer: `rib-${rib.index}`, color: ACI.cyan, closed: true });
    if (f) {
      // The cutting line, a seam allowance outside it.
      if (f.cutLine && f.cutLine.length) {
        doc.polyline(f.cutLine.map(at), { layer: layerOf('cut'), color: ACI.green, closed: true });
        any.cut = true;
      }
      // Openings: cut out.
      for (const h of f.holes ?? []) {
        doc.polyline(h.map(at), { layer: layerOf('openings'), color: ACI.green, closed: true });
        any.holes++;
      }
      // Line anchors: a cross on the lower edge, and the row's letter.
      const tick = Math.max(0.004, rib.chord * 0.006);
      for (const a of f.anchors ?? []) {
        const [x, y] = at(a.point);
        doc.line([x - tick, y], [x + tick, y], { layer: layerOf('anchors'), color: ACI.magenta });
        doc.line([x, y - tick], [x, y + tick], { layer: layerOf('anchors'), color: ACI.magenta });
        doc.text(a.row, [x + tick, y + tick], { layer: layerOf('anchors'), height: tick * 2, color: ACI.magenta });
        any.anchors++;
      }
      // Rods: where each pocket runs.
      for (const r of f.rods ?? []) {
        if (r.length > 1) {
          doc.polyline(r.map(at), { layer: layerOf('rods'), color: ACI.yellow });
          any.rods++;
        }
      }
      // Diagonals: the point one hangs from, and the run one is sewn along.
      for (const a of f.apexes ?? []) {
        const [x, y] = at(a.point);
        doc.line([x - tick, y - tick], [x + tick, y + tick], { layer: layerOf('diagonals'), color: ACI.red });
        doc.line([x - tick, y + tick], [x + tick, y - tick], { layer: layerOf('diagonals'), color: ACI.red });
        doc.text(a.label, [x + tick, y - tick * 3], { layer: layerOf('diagonals'), height: tick * 2, color: ACI.red });
        any.diagonals++;
      }
      for (const b of f.bases ?? []) {
        if (b.points.length > 1) {
          doc.polyline(b.points.map(at), { layer: layerOf('diagonals'), color: ACI.red });
          const mid = at(b.points[Math.floor(b.points.length / 2)]);
          doc.text(b.label, [mid[0], mid[1] - tick * 3], { layer: layerOf('diagonals'), height: tick * 2, color: ACI.red });
          any.diagonals++;
        }
      }
      // The intake: where the lower panel stops and the upper one begins.
      for (const p of f.intake ?? []) {
        const [x, y] = at(p);
        doc.line([x, y - tick * 1.5], [x, y + tick * 1.5], { layer: layerOf('intake'), color: ACI.blue });
      }
    }

    // How many to cut: the file holds one half of the wing, so every rib is
    // cut twice except one that sits on the centreline. Unsaid, a builder
    // working from this file cut one of each.
    // Written from the nose, over the rib it names. It started at the first
    // point of the outline — the trailing edge — and ran off to the right of
    // every rib in the file.
    doc.text(
      `R${rib.index}  y=${rib.station.toFixed(3)}m  c=${rib.chord.toFixed(3)}m  washin=${rib.alphaDeg.toFixed(2)}deg  cut ${ribCopies(wing, rib.index)}`,
      [Math.min(...flat.map((q) => q[0])), cursor + (maxY - minY) + 0.012],
      { layer: 'notes', height: 0.02, color: ACI.yellow },
    );
    cursor += (maxY - minY) + gap;
  });

  // What the lines in this file are, said in the file.
  const legend = features
    ? [
      'cyan: the sewing line (the rib as it is in the wing)',
      any.cut ? 'green, outside it: the cutting line, with the seam allowance' : 'no seam allowance: cut on the sewing line, or add your own',
      any.holes ? 'green, inside: openings, cut out' : 'no openings',
      'magenta crosses: where a line attaches to this rib, lettered by row (K a brake, S a stabilo); a rib with none carries no line',
      any.rods ? 'yellow: rods' : 'no rods',
      any.diagonals ? 'red: diagonals - an X where one hangs from this rib (row>rib it runs to), a line where one is sewn on (row<rib it comes from)' : 'no diagonals',
      'blue ticks: the ends of the cell intake on the lower edge',
    ]
    : ['outlines only: the sewing line of each rib'];
  legend.forEach((t, k) => {
    doc.text(t, [0, -0.10 - k * 0.03], { layer: 'notes', height: 0.018, color: ACI.yellow });
  });
  return doc.toString();
}

/**
 * A rib's 3D loop in its own plane, as cut: the section itself, with the
 * washin, yaw and dihedral all undone.
 *
 * This inverted the dihedral by hand, and inverted the wrong-signed one, so
 * with the placement corrected it would have skewed every rib it drew. It
 * uses the placement's own inverse now (`toRibPlane`), which cannot drift
 * from the forward map.
 */
function flattenRib(loop, rib) {
  return loop.map((p) => toRibPlane(rib, p));
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
/** Which marks belong to a placed panel: its surface, cell and, cut across, its piece. */
function markKey(p) {
  return `${p.surface}:${p.cell}${p.part ? `:${p.part}` : ''}`;
}

export function markedPanelsToDXF(panels, {
  rollWidth = 1.4, gap = 0.03, nested = null, marking = {}, packer = 'profile',
} = {}) {
  // The same checked layout everything else uses. `packer: 'box'` asks for
  // the older skyline layout instead, for comparison — it used to fall
  // through to `nestPanels`, which had since become the profile packer too,
  // so the two choices produced the same file.
  const layout = nested || nestPanels(panels, {
    rollWidth, gap, method: packer === 'profile' ? 'profile' : 'skyline',
  });
  const marks = markPanels(panels, marking);
  const byKey = new Map(marks.marks.map((m) => [markKey(m), m]));
  const doc = dxfDocument();

  for (const p of layout.placed) {
    doc.polyline(p.outline, {
      layer: `panel-${p.surface}`,
      color: p.surface === 'upper' ? ACI.cyan : ACI.green,
      closed: true,
    });

    const m = byKey.get(markKey(p));
    // Both packers carry the two seams through their transform; a layout
    // handed in without them still gets its outline and label.
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
  const byKey = marks ? new Map(marks.marks.map((m) => [markKey(m), m])) : null;

  // Everything to be drawn, in millimetres.
  const shapes = [];
  for (const p of layout.placed) {
    shapes.push({
      points: p.outline.map(([x, y]) => [x * 1000, y * 1000]),
      kind: 'panel', label: `${p.cell}${p.surface === 'upper' ? 'U' : 'L'}${p.part ? p.part[0] : ''}`,
      closed: true,
    });
    if (!byKey) continue;
    const m = byKey.get(markKey(p));
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
      // What crosses this page: anything with a SEGMENT through it, not only
      // anything with a vertex on it. Asking for a vertex dropped a straight
      // run that crossed a page between two of its points — a grain line, or
      // the flat aft part of a panel edge — and a page crossed only by such
      // runs was counted blank and never printed.
      const rect = [x0 - 1, y0 - 1, x0 + usableW + 1, y0 + usableH + 1];
      const clip = shapes.filter((s) => shapeCrosses(s, rect));
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

/**
 * The part of a segment inside a rectangle `[x0, y0, x1, y1]`, or null.
 * Liang-Barsky: the segment is cut back against each side in turn.
 */
function clipSegment(a, b, [x0, y0, x1, y1]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}

/** Does any part of a shape's outline pass through the rectangle? */
function shapeCrosses(shape, rect) {
  const pts = shape.points;
  const n = pts.length;
  if (n === 1) return !!clipSegment(pts[0], pts[0], rect);
  const last = shape.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    if (clipSegment(pts[i], pts[(i + 1) % n], rect)) return true;
  }
  return false;
}

/**
 * Every page of a tiled pattern in ONE file that opens and prints.
 *
 * The pages are separate drawings. They were written one after another into
 * a single `.svg` — eight hundred root elements in a file that may have one
 * — so a browser showed the first page above an XML error and nothing else.
 * A pattern nobody could open, let alone print.
 *
 * This is a page of HTML holding each drawing at its own paper size, with a
 * page break after it: opened in any browser and printed at 100% with no
 * margins, it comes out sheet by sheet at true scale.
 */
export function tiledPagesToHTML(tiles, { title = 'pattern' } = {}) {
  const [w, h] = tiles.pageMM;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const head = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${esc(title)}</title>`,
    '<style>',
    `@page { size: ${w}mm ${h}mm; margin: 0; }`,
    'html, body { margin: 0; padding: 0; background: #888; }',
    `.sheet { width: ${w}mm; height: ${h}mm; margin: 4mm auto; background: #fff; overflow: hidden; `
      + 'page-break-after: always; break-after: page; }',
    '.sheet svg { display: block; }',
    '.how { font: 12px/1.5 monospace; color: #fff; max-width: 170mm; margin: 6mm auto; }',
    '@media print { body { background: #fff; } .sheet { margin: 0; } .how { display: none; } }',
    '</style></head><body>',
    `<p class="how">${esc(title)}: ${tiles.pages.length} sheets of ${esc(tiles.paper)} `
      + `(${tiles.columns} across by ${tiles.rows} down; ${tiles.blankPagesSkipped} blank ones left out). `
      + 'Print at 100% — "actual size", no scaling to fit — with no margins, then measure the 100 mm '
      + 'bar on any sheet before cutting. Each sheet says where it goes: a letter for its row and a '
      + `number for its column. Sheets overlap by ${tiles.overlapMM} mm; lay one over the next until `
      + 'the crosses agree.</p>',
  ];
  const body = tiles.pages.map((p) => `<div class="sheet" data-sheet="${p.reference}">\n${p.svg}\n</div>`);
  return `${head.join('\n')}\n${body.join('\n')}\n</body></html>\n`;
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

  // Which panel each outline belongs to, written on every page it crosses.
  // The pages carried the outlines and their grid reference and nothing to
  // say what was being cut: a sheet from the middle of the roll showed two
  // curves and no way to tell cell 7's upper panel from cell 8's lower.
  // The same rectangle that decided the outline is on this page, so every
  // outline on it gets its name; the name is then kept on the paper.
  const inside = [x0 - 1, y0 - 1, x0 + o.usableW + 1, y0 + o.usableH + 1];
  for (const s of shapes) {
    if (s.kind !== 'panel' || !s.label) continue;
    const n = s.points.length;
    let at = null;
    for (let i = 0; i < n && !at; i++) {
      const seg = clipSegment(s.points[i], s.points[(i + 1) % n], inside);
      if (seg) at = [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2];
    }
    if (!at) continue;
    const [lx, ly] = t(at);
    const px = Math.min(o.marginMM + o.usableW - 12, Math.max(o.marginMM + 1, lx));
    const py = Math.min(o.marginMM + o.usableH - 1, Math.max(o.marginMM + 5, ly - 1.5));
    out.push(`<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" font-size="4" `
      + `fill="#555" font-family="monospace">${s.label}</text>`);
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
  pointsPerSurface = 60, spacing = 'none',
  // Lines as solid tubes at their real diameter, not only as polylines.
  lineSelection = null, lineTubes = true, tubeSides = 6,
  defaultLineDiameterMM = 1.2,
  // How thick to DRAW the lines, against how thick they are.
  //
  // At true scale a 0.5 mm line on a 10.3 m span is 1/20,600 of the model.
  // That is sub-pixel at any sensible zoom, so a model with the entire
  // cascade in it opens looking like a bare sail — which is exactly what it
  // was reported as doing, twice, after the tubes were already there.
  //
  // The lines really are that thin; the model is not wrong. But a drawing
  // nobody can see is not doing its job, so the tubes are drawn thickened by
  // default, in the way a map draws a road wider than its true width.
  //
  // **Defaults to 1: true scale.**
  //
  // It briefly defaulted to an automatic thickening so the cascade would be
  // visible at wing scale. That was a fudge: a model whose dimensions are
  // not the design's dimensions is not a model of the design, and anyone
  // measuring it would get the wrong answer.
  //
  // At true scale the lines are genuinely 1/20,000 of the span and you have
  // to zoom in to see them. That is what a paraglider looks like. The option
  // remains for anyone who wants a picture rather than a model, and whatever
  // is used is stated in the file header.
  lineDiameterScale = 1,
} = {}) {
  if (!wing?.ribs?.length) throw new Error('wingToOBJ needs a wing with ribs');

  // The model is made of the wing's own points — the ones the ribs are cut
  // along and the panels developed along.
  //
  // It used to re-sample each rib here with the points clustered at the
  // nose, because the wing itself spread them evenly and the leading edge
  // came out as a straight cut. That could not help: points re-spaced along
  // a polyline lie ON the polyline, so the model's nose was the same
  // straight cut with more vertices on it. The wing clusters its own points
  // at the nose now, and the model shows what is built. `spacing` remains
  // for a caller that wants the vertex count changed.
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
      // A rib on the centreline is its own mirror image: the wing has it
      // once, and it was written once for each side — two outlines on the
      // same vertices.
      const onCentreline = rib.upper.every((p) => Math.abs(p[1]) < 1e-9);
      if (!(onCentreline && s !== sides[0])) ribLines.push(loop.concat([loop[0]]));

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

  // Lines, as polylines AND as tubes at their real diameter.
  //
  // A polyline is the honest representation of a line's path, and most
  // viewers ignore it: OBJ's `l` element is optional and a great many
  // importers read only faces. The lines were in the file and invisible.
  //
  // So each line is also swept into a tube of its actual diameter — from the
  // line selection where there is one, which runs from 0.43 to 2.50 mm across
  // the catalogue. That is geometry every viewer draws, and it is to scale:
  // an A line really is thicker than a brake line, and a designer looking at
  // the model can see which is which.
  const lineGroups = {};
  const tubeFaces = {};

  // A diameter for each line, by name, from the selection.
  const diameterOf = new Map();
  if (lineSelection?.lines?.length) {
    for (const sel of lineSelection.lines) {
      if (sel?.name && sel.line?.diameterMM > 0) {
        diameterOf.set(sel.name, sel.line.diameterMM / 1000);
      }
    }
  }

  // The span the model covers, for the automatic scale.
  const modelSpan = (() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const rib of ribs) {
      for (const p of rib.upper) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    }
    return Number.isFinite(lo) ? (hi - lo) * (mirror ? 2 : 1) : 10;
  })();
  const thinnest = (() => {
    const all = [...diameterOf.values()];
    return all.length ? Math.min(...all) : defaultLineDiameterMM / 1000;
  })();
  const tubeScale = lineDiameterScale === 'auto'
    ? Math.max(1, (modelSpan / 1000) / thinnest)
    : Math.max(0, Number(lineDiameterScale) || 1);

  if (includeLines && linePlan?.lines?.length) {
    for (const s of sides) {
      // The riser webbing goes in with the lines: it is what carries the load
      // between the pilot and the cascade, and a model without it shows the
      // fan starting at the karabiner.
      for (const l of [...linePlan.lines, ...(linePlan.riserWebbing ?? [])]) {
        if (!l.from || !l.to) continue;
        const row = l.row || 'line';
        const a = flip(l.from, s);
        const b = flip(l.to, s);
        (lineGroups[row] ||= []).push([vert(a), vert(b)]);

        if (!lineTubes) continue;
        const trueDia = diameterOf.get(l.name) ?? defaultLineDiameterMM / 1000;
        const dia = trueDia * tubeScale;
        const r = dia / 2;

        // A frame perpendicular to the line. Any vector not parallel to it
        // will do to start; the cross products make the rest orthogonal.
        const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const len = Math.hypot(ax[0], ax[1], ax[2]);
        if (!(len > 0)) continue;
        const u = [ax[0] / len, ax[1] / len, ax[2] / len];
        const seed = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const p1 = [
          u[1] * seed[2] - u[2] * seed[1],
          u[2] * seed[0] - u[0] * seed[2],
          u[0] * seed[1] - u[1] * seed[0],
        ];
        const p1n = Math.hypot(p1[0], p1[1], p1[2]) || 1;
        const e1 = [p1[0] / p1n, p1[1] / p1n, p1[2] / p1n];
        const e2 = [
          u[1] * e1[2] - u[2] * e1[1],
          u[2] * e1[0] - u[0] * e1[2],
          u[0] * e1[1] - u[1] * e1[0],
        ];

        const ring = (centre) => {
          const out = [];
          for (let k = 0; k < tubeSides; k++) {
            const th = (2 * Math.PI * k) / tubeSides;
            const c = Math.cos(th) * r;
            const d = Math.sin(th) * r;
            out.push(vert([
              centre[0] + e1[0] * c + e2[0] * d,
              centre[1] + e1[1] * c + e2[1] * d,
              centre[2] + e1[2] * c + e2[2] * d,
            ]));
          }
          return out;
        };
        const ra = ring(a);
        const rb = ring(b);
        const faces = (tubeFaces[row] ||= []);
        for (let k = 0; k < tubeSides; k++) {
          const k2 = (k + 1) % tubeSides;
          faces.push([ra[k], ra[k2], rb[k2], rb[k]]);
        }
      }
    }
  }

  const out = [
    `# ${name} — paraglider, exported as OBJ`,
    '#',
    '# Groups: upper_surface, lower_surface, ribs, and one per line row.',
    `# Line tubes are drawn ${tubeScale.toFixed(1)}x their true diameter`
      + `${tubeScale > 1.01 ? ', so they can be seen at wing scale' : ' (true scale)'}.`,
    `# True diameters, mm: ${[...new Set([...diameterOf.values()])]
      .sort((a, b) => a - b).map((d) => (d * 1000).toFixed(2)).join(', ') || 'not selected'}`,
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
    // The same lines as surfaces, so a viewer that reads only faces still
    // shows the cascade.
    for (const f of tubeFaces[row] ?? []) out.push(`f ${f.join(' ')}`);
  }

  return `${out.join('\n')}\n`;
}
