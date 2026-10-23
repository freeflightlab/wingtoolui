/* lepstructure.js — a LEparagliding design's internal structure, cut as its
 * program cuts it.
 *
 * `lepPanels` reproduces a design's panels from its own cutting file to
 * about a tenth of a per cent. This does the same for the pieces sewn inside
 * the wing between its ribs — section 12 of the file, and the pockets its
 * rods (section 21) are sewn into — read from the program's own source
 * (leparagliding.f, which both design archives carry) rather than inferred
 * from the drawings:
 *
 *   type 5, 15   a FULL DIAGONAL: one piece per rib and side, from the
 *                anchor rib's lower surface — a little ahead of its first
 *                anchor to a little behind its last — up to the next rib's
 *                upper surface, with a cut-out between each pair of anchors.
 *                One row of the file per anchor row; the piece is built when
 *                the row for the rib's last anchor comes.
 *   type 1, 11   a STRAP between the same anchor row of two adjacent ribs,
 *                along their lower surfaces, cut 1.14% short (section 5's
 *                last figure) so that it pulls.
 *   type 6, 16   a PIECE BETWEEN TWO RIBS at a chord position, at a height
 *                between the lower surface (0) and the upper (100).
 *   section 21   a ROD POCKET: the strip beside each rod, its four widths
 *                from the rod's line.
 *
 * Not built: the trailing-edge mini-ribs (section 2's last column), which
 * the program cuts from the section as it billows the cell over it, from
 * its own ovalization. They are counted and said.
 *
 * Types 11, 15 and 16 give widths in per cent of the rib's chord; 1, 5 and
 * 6 in centimetres — and the program scales 5's and 6's by the wing's scale
 * factor, and 1's by nothing.
 *
 * The program builds each the same way: a line along each of the two ribs,
 * resampled (its `vredis`, reproduced here as `lepResample`), placed in 3D
 * as the rib is (`lepRibPoint`), flattened quad by quad (its `flatt`,
 * `lepFlatten`), and drawn with a seam allowance along the two sides sewn
 * to a rib and none across the ends — section 6's rib allowance on a full
 * diagonal, its V-rib allowance on the others. Section 38 cuts elliptical
 * holes: one at each anchor of a diagonal, a row of them along a piece
 * between ribs; section 37's code 3002 says how many sides the program
 * gives an ellipse (60 unless it says).
 *
 * Validated piece by piece against both complete designs' cutting files
 * (`data/reference/lep/*-cut-parts.tsv`): see `docs/internal-structure.md`.
 *
 * Several things are the program's and not a choice, and reproduced as it
 * does them:
 *
 * - A diagonal's line along the neighbouring rib starts where a line from
 *   that rib's own first anchor (less the attachment width), at the front
 *   angle of the file's row, meets its upper surface, and ends likewise
 *   from its last anchor at the back angle.
 * - Building each rib's line, the program leaves out the last section point
 *   before the line's end ("MIRAR SI CAL +-1", its own note).
 * - A station ahead of where a rib's lower surface starts is not found, and
 *   the point keeps the value its array started with: height zero. The
 *   Tuluaq's tip diagonal has one.
 * - The program before 3.30 (the Tuluaq's, 3.25) drew a diagonal's cut-outs
 *   against the sewing line, inside a full seam allowance, and offset a
 *   pocket's edges along the mean of the segments either side of each
 *   point; 3.30 (the Swoop2's) cuts the cut-outs through the allowance and
 *   offsets along the segment that leaves each point. Both are given:
 *   `cutAreaM2` is the piece as 3.30 cuts it, `drawnBefore330` as 3.25 drew
 *   it.
 * - A hole that would run off its piece is left out. The program's source
 *   computes it; the Swoop2's file has every other hole and not that one —
 *   a hole across a piece's edge cannot be cut as a hole.
 *
 * Coordinates in the program's centimetres throughout; results in metres,
 * one side of the wing.
 */

import { sectionData, parseHVRibs, readAirfoils } from './lep.js';
import { lepRibPoint, lepJoncs } from './leplines.js';
import { dxfDocument, nestPanels, fabricEstimate } from './export.js';

/**
 * The program's `vredis`: a polyline resampled to `n` points. Not by arc
 * length — each segment is split in ten and every k-th of those points
 * kept, the first few k+1 apart — so a segment's share of the points goes
 * with its count, not its length. The last point is the line's own.
 */
export function lepResample(pts, n) {
  const n1 = pts.length;
  if (n1 === 2) {
    const out = [];
    for (let j = 0; j < n; j++) {
      out.push([pts[0][0] + ((pts[1][0] - pts[0][0]) * j) / (n - 1), pts[0][1] + ((pts[1][1] - pts[0][1]) * j) / (n - 1)]);
    }
    return out;
  }
  const fine = [];
  for (let s = 0; s < n1 - 1; s++) {
    for (let k = 0; k <= 10; k++) {
      if (k === 10 && s < n1 - 2) continue;
      fine.push([pts[s][0] + (k / 10) * (pts[s + 1][0] - pts[s][0]), pts[s][1] + (k / 10) * (pts[s + 1][1] - pts[s][1])]);
    }
  }
  // Integer division, as the program's (10*n1-1)/(n-1) between integers.
  const step = Math.trunc((10 * n1 - 1) / (n - 1));
  const extra = 10 * (n1 - 1) - step * (n - 1);
  const out = [];
  let at = 0;
  for (let j = 1; j <= n; j++) {
    const q = j === n ? pts[n1 - 1] : fine[Math.min(at, fine.length - 1)];
    out.push([q[0], q[1]]);
    at += step + (j <= extra ? 1 : 0);
  }
  return out;
}

/**
 * The program's `flatt`: the strip between two lines of 3D points laid
 * flat, quad by quad. Each quad is placed from its first rung and the
 * three-dimensional lengths of its sides and diagonals; the next starts on
 * the far end of this one's left side, along its far rung. Returns the
 * left and right lines (`pl1`, `pr1`) and each quad's far corners (`pl2`,
 * `pr2`), which the program takes its edge directions from.
 */
export function lepFlatten(L, R) {
  const n = L.length;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let x0 = 0;
  let y0 = 0;
  let th = 0;
  const pl1 = [];
  const pl2 = [];
  const pr1 = [];
  const pr2 = [];
  for (let j = 0; j < n; j++) {
    const pa = d(R[j], L[j]);
    pl1[j] = [x0, y0];
    pr1[j] = [pa * Math.cos(th) + x0, pa * Math.sin(th) + y0];
    if (j === n - 1) break;
    const pb = d(R[j + 1], L[j]);
    const pc = d(R[j + 1], R[j]);
    const pd = d(R[j], L[j + 1]);
    const pe = d(L[j + 1], L[j]);
    const a2r = (pa * pa - pb * pb + pc * pc) / (2 * pa);
    const a1r = pa - a2r;
    const hr = Math.sqrt(Math.max(0, pc * pc - a2r * a2r));
    const a2l = (pa * pa - pe * pe + pd * pd) / (2 * pa);
    const a1l = pa - a2l;
    const hl = Math.sqrt(Math.max(0, pd * pd - a2l * a2l));
    pl2[j] = [a1l * Math.cos(th) - hl * Math.sin(th) + x0, a1l * Math.sin(th) + hl * Math.cos(th) + y0];
    pr2[j] = [a1r * Math.cos(th) - hr * Math.sin(th) + x0, a1r * Math.sin(th) + hr * Math.cos(th) + y0];
    x0 = pl2[j][0];
    y0 = pl2[j][1];
    th = Math.atan((pr2[j][1] - pl2[j][1]) / (pr2[j][0] - pl2[j][0]));
  }
  return { pl1, pl2, pr1, pr2 };
}

/** The program's `xrxs`: where two lines, each through two points, cross. */
function lepLineCross(ru, rv, su, sv) {
  const mr = (rv[1] - rv[0]) / (ru[1] - ru[0]);
  const br = rv[0] - mr * ru[0];
  const ms = (sv[1] - sv[0]) / (su[1] - su[0]);
  const bs = sv[0] - ms * su[0];
  let u = (bs - br) / (mr - ms);
  let v = mr * u + br;
  if (Math.abs(su[1] - su[0]) <= 0.0001) { u = su[0]; v = mr * su[0] + br; }
  if (Math.abs(ru[1] - ru[0]) <= 0.0001) { u = ru[0]; v = ms * ru[0] + bs; }
  return [u, v];
}

/** A rib's section in its own centimetres, as the program holds it (`u(i,j,3)`). */
function lepSectionCm(rib) {
  const s = rib.section;
  return {
    U: s.points.map((p) => rib.chord * p[0]),
    V: s.points.map((p) => rib.chord * p[1] * rib.thickness),
    // 1-based, as the program counts: the upper side is points 1 to `top`,
    // trailing edge first; the intake and lower side follow.
    top: s.extrados,
    n: s.points.length,
  };
}

/**
 * Station `u` on a rib's lower side (the intake and the lower surface),
 * the program's way: the last segment that holds it wins. Returns the point
 * and the 1-based index of the segment's first point, or null.
 */
function lepLowerAt(R, u) {
  let hit = null;
  for (let j = R.top; j < R.n; j++) {
    const a = R.U[j - 1];
    const b = R.U[j];
    if (a <= u && b >= u && b !== a) {
      const m = (R.V[j] - R.V[j - 1]) / (b - a);
      hit = { u, v: R.V[j - 1] + m * (u - a), j };
    }
  }
  return hit;
}

/**
 * Station `u` on a rib's upper side (its points 9 to 11): the segment with
 * u(j) > u >= u(j+1); returns the point and j+1, the program's index.
 */
function lepUpperAt(R, u) {
  let hit = null;
  for (let j = 1; j <= R.top && j < R.n; j++) {
    const a = R.U[j - 1];
    const b = R.U[j];
    if (a > u && b <= u) {
      const m = (R.V[j] - R.V[j - 1]) / (b - a);
      hit = { u, v: R.V[j - 1] + m * (u - a), j: j + 1 };
    }
  }
  return hit;
}

/**
 * Where a line from (u0, v0), rising at `deg` from the chord, forward
 * (`dir` -1) or aft (+1), meets the upper surface — searched from the
 * program's index `from`. Returns the point and the index after it.
 */
function lepUpperRay(R, u0, v0, deg, dir, from) {
  const ru = [u0, u0 + dir];
  const rv = [v0, v0 + Math.tan((deg * Math.PI) / 180)];
  let hit = null;
  for (let k = Math.max(1, from); k <= R.top; k++) {
    if (k >= R.n) break;
    const su = [R.U[k - 1], R.U[k]];
    const sv = [R.V[k - 1], R.V[k]];
    const [u, v] = lepLineCross(ru, rv, su, sv);
    if (su[0] >= u && su[1] < u && sv[1] >= 0) hit = { u, v, j: k + 1 };
  }
  return hit;
}

/** The section points of the lower side from a point to a point, as the program lists them. */
function lepLowerLine(R, p2, p4) {
  const raw = [[p2.u, p2.v]];
  const n1 = p4.j - p2.j + 1;
  for (let j = 2; j <= n1 - 1; j++) raw.push([R.U[p2.j + j - 2], R.V[p2.j + j - 2]]);
  raw.push([p4.u, p4.v]);
  return raw;
}

/** The section points of the upper side from front point 9 back to point 11. */
function lepUpperLine(R, p9, p11) {
  const raw = [[p9.u, p9.v]];
  const n1 = p9.j - p11.j + 1;
  for (let j = 2; j <= n1 - 1; j++) raw.push([R.U[p9.j - j], R.V[p9.j - j]]);
  raw.push([p11.u, p11.v]);
  return raw;
}

/** Arc length from a rib's trailing edge, along its lower side, to station `u` (its `rib(i,130+k)`). */
function lepFromTail(R, u) {
  let s = null;
  for (let j = R.n; j >= 2; j--) {
    const a = R.U[j - 2];
    const b = R.U[j - 1];
    if (a <= u && b > u && b >= 0) {
      const m = (R.V[j - 1] - R.V[j - 2]) / (b - a);
      const v = R.V[j - 2] + m * (u - a);
      let t = 0;
      for (let jj = R.n; jj >= j + 1; jj--) t += Math.hypot(R.U[jj - 1] - R.U[jj - 2], R.V[jj - 1] - R.V[jj - 2]);
      s = t + Math.hypot(R.U[j - 1] - u, R.V[j - 1] - v);
    }
  }
  return s;
}

/** Arc length from the trailing edge to a lower-side point the program found on segment `j`. */
function lepTailTo(R, p) {
  let t = 0;
  for (let jj = R.n; jj >= p.j + 2; jj--) t += Math.hypot(R.U[jj - 2] - R.U[jj - 1], R.V[jj - 2] - R.V[jj - 1]);
  return t + Math.hypot(R.U[p.j] - p.u, R.V[p.j] - p.v);
}

/** Polygon area (absolute) and length of a closed outline. */
function lepRingArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a / 2);
}
function lepRingLength(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  return s;
}
function lepInside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The program's ellipse: `sides` straight sides, semi-axes a and b, turned by `angle`. */
function lepEllipse(x0, y0, a, b, angle, sides) {
  const out = [];
  for (let k = 0; k < sides; k++) {
    const t = (2 * Math.PI * k) / sides;
    out.push([x0 + a * Math.cos(t) * Math.cos(angle) - b * Math.sin(t) * Math.sin(angle),
      y0 + a * Math.cos(t) * Math.sin(angle) + b * Math.sin(t) * Math.cos(angle)]);
  }
  return out;
}

/**
 * An edge's normal, the program's way: from a quad's first corner towards
 * its far one, `atan` folded into [0, pi) or `atan2` — the two agree on a
 * strip that runs along +y, which every piece here does.
 */
function lepEdgeAngle(p1, p2, viaAtan2) {
  const dy = p1[1] - p2[1];
  const dx = p1[0] - p2[0];
  if (viaAtan2) return -Math.atan2(dy, dx);
  let a = -Math.atan(dy / dx);
  if (a < 0) a += Math.PI;
  return a;
}

/** Sections 6, 37 and 38: what the pieces are cut with. */
function lepStructureSettings(doc, table) {
  const s6 = sectionData(doc, 6).map((l) => l.trim()).filter(Boolean);
  const first = (k) => Number(String(s6[k] ?? '').split(/\s+/)[0]);
  const ribMm = Number.isFinite(first(2)) ? first(2) : 0;
  const vribMm = Number.isFinite(first(3)) ? first(3) : ribMm;
  // Section 5: after its six rows of skin tension, how much shorter a strap
  // is cut than its run.
  const s5 = sectionData(doc, 5).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/).map(Number));
  let tension = 0;
  for (let k = 0, rows = 0; k < s5.length; k++) {
    if (s5[k].length >= 4 && s5[k].slice(0, 4).every(Number.isFinite) && ++rows === 6) {
      tension = s5[k + 1]?.[0];
      break;
    }
  }
  let ellipseSides = 60;
  const s37 = sectionData(doc, 37).map((l) => l.trim()).filter(Boolean);
  if (s37.length && parseInt(s37[0], 10) === 1) {
    for (const l of s37.slice(2)) {
      const f = l.split(/\s+/);
      if (f[0] === '3002' && Number(f[1]) > 2) ellipseSides = Math.round(Number(f[1]));
    }
  }
  const holes = { diagonal: null, between: null };
  const s38 = sectionData(doc, 38).map((l) => l.trim()).filter(Boolean);
  if (s38.length && parseInt(s38[0], 10) > 0) {
    const k = parseInt(s38[1], 10);
    for (const l of s38.slice(2, 2 + k)) {
      const f = l.split(/\s+/).map(Number);
      if (!(f[2] > 0)) continue;
      if (f[1] === 15 || f[1] === 5) holes.diagonal = { count: f[3], across: f[4], along: f[5], at: f[6] };
      if (f[1] === 16 || f[1] === 6) holes.between = { count: f[3], across: f[4], along: f[5], at: f[6] };
    }
  }
  return {
    ribAllowanceCm: ribMm / 10, vribAllowanceCm: vribMm / 10, strapShortening: Number.isFinite(tension) ? tension : 0,
    ellipseSides, holes, scale: table.scale ?? 1,
  };
}

/**
 * Offset a flattened strip's two sides by the allowance, the program's way:
 * each point out along the normal of its quad's own side, the last point
 * taking the last quad's.
 */
function lepStripOffsets(f, allowance, { leftAtan2 = false, rightAtan2 = false } = {}) {
  const n = f.pl1.length;
  const al = [];
  const ar = [];
  const lvc = [];
  const rvc = [];
  for (let j = 0; j < n; j++) {
    const q = j === n - 1 ? n - 2 : j;
    al[j] = lepEdgeAngle(f.pl1[q], f.pl2[q], leftAtan2);
    ar[j] = lepEdgeAngle(f.pr1[q], f.pr2[q], rightAtan2);
    lvc[j] = [f.pl1[j][0] - allowance * Math.sin(al[j]), f.pl1[j][1] - allowance * Math.cos(al[j])];
    rvc[j] = [f.pr1[j][0] + allowance * Math.sin(ar[j]), f.pr1[j][1] + allowance * Math.cos(ar[j])];
  }
  return { al, ar, lvc, rvc };
}

/** Rotate a flattened strip about the origin so its right side's chord stands on +y. */
function lepStandUp(f) {
  const n = f.pr1.length;
  const a = Math.atan((f.pr1[n - 1][0] - f.pr1[0][0]) / (f.pr1[n - 1][1] - f.pr1[0][1]));
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = (p) => (p ? [c * p[0] - s * p[1], s * p[0] + c * p[1]] : p);
  return { pl1: f.pl1.map(r), pl2: f.pl2.map(r), pr1: f.pr1.map(r), pr2: f.pr2.map(r) };
}

/**
 * Where along a flattened side, measured back from its far end, the
 * program puts each anchor: the anchor's distance from the rib's trailing
 * edge less the line end's. Searched over every segment but the first.
 */
function lepAnchorsAlong(edge, targets) {
  const n = edge.length;
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const out = [];
  for (const t of targets) {
    let s0 = 0;
    let s1 = len(edge[n - 1], edge[n - 2]);
    let hit = null;
    for (let j = n - 1; j >= 2; j--) {
      if (t >= s0 && t < s1) {
        const r = t - s0;
        const seg = len(edge[j - 1], edge[j]);
        hit = { x: edge[j][0] - (r * (edge[j][0] - edge[j - 1][0])) / seg, y: edge[j][1] - (r * (edge[j][1] - edge[j - 1][1])) / seg, j };
      }
      s0 += len(edge[j], edge[j - 1]);
      s1 = s0 + len(edge[j - 1], edge[j - 2]);
    }
    out.push(hit);
  }
  return out;
}

/**
 * A full diagonal's cut-out between two anchors: a parabola through the
 * points the attachment width beyond each anchor, its vertex `depth` per
 * cent of the way from the middle of the two to the far side, square to the
 * strip. Returns its ends on the sewing line and the curve between.
 */
function lepCutOut(edge, other, A1, A2, w, depth, towardsLeft) {
  const n = edge.length;
  const P0 = [(A1.x + A2.x) / 2, (A1.y + A2.y) / 2];
  let P6 = null;
  let P1 = null;
  for (let j = 0; j < n - 1; j++) {
    if (other[j][1] <= P0[1] && other[j + 1][1] > P0[1]) {
      const m = (other[j + 1][1] - other[j][1]) / (other[j + 1][0] - other[j][0]);
      const b = other[j][1] - m * other[j][0];
      const x5 = (P0[1] - b) / m;
      const reach = (towardsLeft ? P0[0] - x5 : x5 - P0[0]) * (depth / 100);
      P6 = [towardsLeft ? P0[0] - reach : P0[0] + reach, P0[1]];
    }
    const y1 = A1.y + w;
    if (edge[j][1] <= y1 && edge[j + 1][1] > y1) {
      const m = (edge[j + 1][1] - edge[j][1]) / (edge[j + 1][0] - edge[j][0]);
      const b = edge[j][1] - m * edge[j][0];
      P1 = [(y1 - b) / m, y1];
    }
  }
  if (!P6 || !P1) return null;
  const k = (P1[0] - P6[0]) / ((P1[1] - P6[1]) ** 2);
  const x = (y) => k * (y - P6[1]) ** 2 + P6[0];
  let P2 = null;
  for (let j = 0; j < n - 1; j++) {
    if (edge[j][1] >= P0[1] && edge[j][1] < A2.y) {
      const [u, v] = lepLineCross([x(edge[j][1]), x(edge[j + 1][1])], [edge[j][1], edge[j + 1][1]],
        [edge[j][0], edge[j + 1][0]], [edge[j][1], edge[j + 1][1]]);
      if (edge[j][1] <= v && edge[j + 1][1] > v) P2 = [u, v];
    }
  }
  if (!P2) return null;
  let from = null;
  let to = null;
  for (let j = 0; j < n - 1; j++) {
    if (edge[j][1] <= P1[1] && edge[j + 1][1] > P1[1]) from = j + 1;
    if (edge[j][1] <= P2[1] && edge[j + 1][1] > P2[1]) to = j;
  }
  if (from === null || to === null) return null;
  const curve = [P1];
  for (let j = from; j <= to; j++) curve.push([x(edge[j][1]), edge[j][1]]);
  curve.push(P2);
  return { P1, P2, from, to, curve };
}

/** One full diagonal, rib `i` (1-based) to its neighbour on `side`. */
function lepFullDiagonal(table, st, i, side, first, last) {
  const ribs = table.ribs;
  const rib = ribs[i - 1];
  const nb = ribs[side === 'left' ? i - 2 : i];
  if (!rib?.section || !nb?.section) return { problem: `rib ${i}: no section on it or its neighbour` };
  const rows = rib.anchorCount;
  const at = (r, k) => (r.anchorsPct[k - 1] * r.chord) / 100;
  const R = lepSectionCm(rib);
  const p2 = lepLowerAt(R, at(rib, 1) - first.w);
  const p4 = lepLowerAt(R, at(rib, rows) + last.w);
  if (!p2 || !p4) return { problem: `rib ${i}: the diagonal's ends are off its lower surface` };
  const anchorLine = lepResample(lepLowerLine(R, p2, p4), 121);
  const tail4 = lepTailTo(R, p4);
  const targets = [];
  for (let k = 1; k <= rows; k++) targets.push(lepFromTail(R, at(rib, k)) - tail4);

  const Q = lepSectionCm(nb);
  const q2 = lepLowerAt(Q, at(nb, 1) - first.w) ?? { u: at(nb, 1) - first.w, v: 0, j: null };
  const q4 = lepLowerAt(Q, at(nb, rows) + last.w) ?? { u: at(nb, rows) + last.w, v: 0, j: null };
  const start = lepUpperAt(Q, at(nb, 1))?.j ?? 1;
  const p9 = lepUpperRay(Q, q2.u, q2.v, first.front, -1, start);
  const p11 = lepUpperRay(Q, q4.u, q4.v, last.back, +1, 1);
  if (!p9 || !p11) return { problem: `rib ${i}: the diagonal does not reach rib ${nb.index}'s upper surface` };
  const topLine = lepResample(lepUpperLine(Q, p9, p11), 121);

  const A3 = anchorLine.map(([u, v]) => lepRibPoint(rib, u, v));
  const N3 = topLine.map(([u, v]) => lepRibPoint(nb, u, v));
  const left = side === 'left';
  const f = lepStandUp(left ? lepFlatten(N3, A3) : lepFlatten(A3, N3));
  const n = f.pl1.length;
  const allowance = st.ribAllowanceCm;
  const { al, ar, lvc, rvc } = lepStripOffsets(f, allowance, { leftAtan2: !left, rightAtan2: left });
  const edge = left ? f.pr1 : f.pl1;
  const other = left ? f.pl1 : f.pr1;
  const anchors = lepAnchorsAlong(edge, targets);
  const notes = [];
  if (anchors.some((a) => !a)) notes.push('an anchor beyond the line\'s ends');
  const found = anchors.filter(Boolean);

  // The cut-outs, between each pair of anchors.
  const cutOuts = [];
  for (let k = 0; k < found.length - 1; k++) {
    if (last.depth > 100) { notes.push('cut-outs drawn as ellipses (depth over 100) are not reproduced'); break; }
    const c = lepCutOut(edge, other, found[k], found[k + 1], last.w, last.depth, left);
    if (c) cutOuts.push(c);
  }

  // Holes at the anchors (section 38).
  const holes = [];
  const dropped = [];
  const hd = st.holes.diagonal;
  if (hd) {
    for (const a of found) {
      const h = left ? a.x - f.pl1[a.j][0] : f.pr1[a.j][0] - a.x;
      const x0 = left ? a.x - h * hd.at : a.x + h * hd.at;
      holes.push(lepEllipse(x0, a.y, hd.across * h * 0.005, hd.along * h * 0.005, 0, st.ellipseSides));
    }
  }

  // The outline. The anchor side runs along its allowance between cut-outs
  // and round each cut-out; the other side and the ends are whole.
  const anchorOff = left ? rvc : lvc;
  const anchorAngle = left ? ar : al;
  const sgn = left ? 1 : -1;
  const off = (p, a) => [p[0] + sgn * allowance * Math.sin(a), p[1] + sgn * allowance * Math.cos(a)];
  const side2 = [];
  for (let k = 0; k <= cutOuts.length; k++) {
    const from = k === 0 ? 0 : cutOuts[k - 1].to + 1;
    const to = k === cutOuts.length ? n - 1 : cutOuts[k].from - 1;
    for (let j = from; j <= to; j++) side2.push(anchorOff[j]);
    if (k < cutOuts.length) {
      const c = cutOuts[k];
      // The connectors' directions, as the program picks them.
      const a1 = k === 0 ? anchorAngle[c.from - 1] : anchorAngle[c.to - 1];
      const a2 = k + 1 < cutOuts.length ? anchorAngle[c.from - 1] : anchorAngle[Math.min(n - 1, c.to + 1)];
      side2.push(off(c.P1, a1), ...c.curve, off(c.P2, a2));
    }
  }
  const outline = left
    ? [f.pl1[0], ...lvc, f.pl1[n - 1], f.pr1[n - 1], ...side2.slice().reverse(), f.pr1[0]]
    : [f.pl1[0], ...side2, f.pl1[n - 1], f.pr1[n - 1], ...rvc.slice().reverse(), f.pr1[0]];
  // As 3.25 drew it: both allowances whole, the cut-outs against the sewing line.
  const whole = [f.pl1[0], ...lvc, f.pl1[n - 1], f.pr1[n - 1], ...rvc.slice().reverse(), f.pr1[0]];
  const pocket = (c) => {
    const back = [];
    for (let j = c.to; j >= c.from; j--) back.push(edge[j]);
    return c.curve.concat(back);
  };
  const kept = holes.filter((h) => h.every((p) => lepInside(p, outline)));
  if (kept.length < holes.length) dropped.push(holes.length - kept.length);
  return {
    piece: {
      kind: 'diagonal', rib: i, side, ribs: left ? [nb.index, i] : [i, nb.index], rows,
      sewing: { left: f.pl1, right: f.pr1 }, outline, holes: kept, cutOuts: cutOuts.map((c) => c.curve),
      anchors: found.map((a) => [a.x, a.y]),
      wholeOutline: whole, pockets: cutOuts.map(pocket),
    },
    dropped: dropped.length ? dropped[0] : 0,
    notes,
  };
}

/** Points along a rib's lower surface, evenly in u from u0 to u1 (a strap's line). */
function lepLowerEven(R, u0, u1, count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const u = u0 + ((u1 - u0) * k) / (count - 1);
    const p = lepLowerAt(R, u);
    out.push([u, p ? p.v : 0]);
  }
  return out;
}

/** A strip between two lines of 21 points, flattened and outlined with an allowance on the rib sides. */
function lepStrip(L3, R3, allowance, shortening) {
  const f = lepFlatten(L3, R3);
  const n = f.pl1.length;
  if (shortening) {
    // "Tensa cintes": the far side moved towards the near one by the
    // strap's shortening of its run at the middle.
    const m = 9;
    const run = Math.hypot(f.pl1[m][0] - f.pr1[m][0], f.pl1[m][1] - f.pr1[m][1]);
    const ang = Math.atan((f.pr1[m][1] - f.pl1[m][1]) / (f.pr1[m][0] - f.pl1[m][0]));
    const dx = shortening * run * Math.cos(ang);
    const dy = shortening * run * Math.sin(ang);
    f.pr1 = f.pr1.map((p) => [p[0] - dx, p[1] - dy]);
    f.pr2 = f.pr2.map((p) => (p ? [p[0] - dx, p[1] - dy] : p));
  }
  const { lvc, rvc } = lepStripOffsets(f, allowance);
  // The far end's offsets are taken from the last quad's far corners.
  const q = n - 2;
  const alq = lepEdgeAngle(f.pl1[q], f.pl2[q], false);
  const arq = lepEdgeAngle(f.pr1[q], f.pr2[q], false);
  lvc[n - 1] = [f.pl2[q][0] - allowance * Math.sin(alq), f.pl2[q][1] - allowance * Math.cos(alq)];
  rvc[n - 1] = [f.pr2[q][0] + allowance * Math.sin(arq), f.pr2[q][1] + allowance * Math.cos(arq)];
  const outline = [f.pl1[0], ...lvc, f.pl1[n - 1], f.pr1[n - 1], ...rvc.slice().reverse(), f.pr1[0]];
  return { f, outline };
}

/** A strap (types 1, 11). */
function lepStrap(table, st, e) {
  const ribs = table.ribs;
  const a = ribs[e.fromRib - 1];
  const b = ribs[e.toRib - 1];
  if (!a?.section || !b?.section) return { problem: `strap ${e.index}: no section on rib ${e.fromRib} or ${e.toRib}` };
  if (e.toRib !== e.fromRib + 1) return { problem: `strap ${e.index}: rib ${e.fromRib} to ${e.toRib} is not to the next rib` };
  // Half-widths: type 11 in per cent of each rib's chord, type 1 in
  // centimetres, unscaled.
  const wa = e.type === 11 ? (e.width / 100) * a.chord : e.width;
  const wb = e.type === 11 ? (e.width / 100) * b.chord : e.width;
  const ua = (a.anchorsPct[e.fromAnchor - 1] * a.chord) / 100;
  const ub = (b.anchorsPct[e.toAnchor - 1] * b.chord) / 100;
  const La = lepLowerEven(lepSectionCm(a), ua - wa, ua + wa, 21).map(([u, v]) => lepRibPoint(a, u, v));
  const Lb = lepLowerEven(lepSectionCm(b), ub - wb, ub + wb, 21).map(([u, v]) => lepRibPoint(b, u, v));
  const { f, outline } = lepStrip(La, Lb, st.vribAllowanceCm, st.strapShortening);
  return {
    piece: {
      kind: 'strap', ribs: [e.fromRib, e.toRib], row: e.fromAnchor, entry: e.index,
      sewing: { left: f.pl1, right: f.pr1 }, outline, holes: [],
    },
  };
}

/** One end of a piece between two ribs: a line along rib `r` at `pct` of chord. */
function lepBetweenLine(r, pct, height, front, back) {
  const R = lepSectionCm(r);
  const u3 = (r.chord * pct) / 100;
  const u2 = u3 - front;
  const u4 = u3 + back;
  const p2 = lepLowerAt(R, u2);
  const p4 = lepLowerAt(R, u4);
  const p9 = lepUpperAt(R, u2);
  const p11 = lepUpperAt(R, u4);
  if (height === 0) return p2 && p4 ? lepResample(lepLowerLine(R, p2, p4), 21) : null;
  if (height === 100) return p9 && p11 ? lepResample(lepUpperLine(R, p9, p11), 21) : null;
  if (!p2 || !p4 || !p9 || !p11) return null;
  const v6 = p2.v + (p9.v - p2.v) * (height / 100);
  const v8 = p4.v + (p11.v - p4.v) * (height / 100);
  const out = [];
  for (let k = 0; k <= 20; k++) out.push([u2 + ((u4 - u2) * k) / 20, v6 + ((v8 - v6) * k) / 20]);
  return out;
}

/** A piece between two ribs (types 6, 16). */
function lepBetween(table, st, e) {
  const ribs = table.ribs;
  const a = ribs[e.fromRib - 1];
  const b = ribs[e.toRib - 1];
  if (!a?.section || !b?.section) return { problem: `piece ${e.index}: no section on rib ${e.fromRib} or ${e.toRib}` };
  if (e.toRib !== e.fromRib + 1) return { problem: `piece ${e.index}: rib ${e.fromRib} to ${e.toRib} is not to the next rib` };
  const [ea, eb] = e.ends;
  // Widths: type 16 in per cent of each rib's chord, type 6 in centimetres
  // of the unscaled wing.
  const w = (end, r, x) => (e.type === 16 ? (x / 100) * r.chord : x * st.scale);
  const la = lepBetweenLine(a, ea.chordPct, ea.rest[0], w(ea, a, ea.rest[1]), w(ea, a, ea.rest[2]));
  const lb = lepBetweenLine(b, eb.chordPct, eb.rest[0], w(eb, b, eb.rest[1]), w(eb, b, eb.rest[2]));
  if (!la || !lb) return { problem: `piece ${e.index}: its ends are off the ribs' surfaces` };
  const { f, outline } = lepStrip(la.map(([u, v]) => lepRibPoint(a, u, v)), lb.map(([u, v]) => lepRibPoint(b, u, v)),
    st.vribAllowanceCm, 0);
  const n = f.pl1.length;
  const holes = [];
  const hb = st.holes.between;
  if (hb && hb.count > 0) {
    // The program's `vhholes`: the quad of the piece's four corners, a hole
    // at each of count+1 equal steps along it, centred `at` of the way
    // across; semi-axes `across` per cent of half the local width and
    // at/count of half the piece's length.
    const P = [f.pl1[0], f.pr1[0], f.pl1[n - 1], f.pr1[n - 1]];
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m1 = mid(P[0], P[1]);
    const m2 = mid(P[2], P[3]);
    const length = Math.hypot(m2[0] - m1[0], m2[1] - m1[1]);
    for (let k = 1; k <= hb.count; k++) {
      const t = k / (1 + hb.count);
      const L = [P[0][0] + (P[2][0] - P[0][0]) * t, P[0][1] + (P[2][1] - P[0][1]) * t];
      const Rr = [P[1][0] + (P[3][0] - P[1][0]) * t, P[1][1] + (P[3][1] - P[1][1]) * t];
      const h = Math.hypot(Rr[0] - L[0], Rr[1] - L[1]);
      const ang = Math.atan2(Rr[1] - L[1], Rr[0] - L[0]);
      const c = [L[0] + hb.at * (Rr[0] - L[0]), L[1] + hb.at * (Rr[1] - L[1])];
      holes.push(lepEllipse(c[0], c[1], 0.5 * h * (hb.across / 100), 0.5 * length * (hb.at / hb.count), ang, st.ellipseSides));
    }
  }
  const kept = holes.filter((h) => h.every((p) => lepInside(p, outline)));
  return {
    piece: {
      kind: 'between', ribs: [e.fromRib, e.toRib], entry: e.index, chordPct: [ea.chordPct, eb.chordPct],
      sewing: { left: f.pl1, right: f.pr1 }, outline, holes: kept,
    },
    dropped: holes.length - kept.length,
  };
}

/**
 * The program's `loffset2`: a polyline moved sideways by `mm` millimetres,
 * each point along the normal of the segment that leaves it (the last, of
 * the one that arrives), turned to point the same way whichever way the
 * segment runs.
 */
function lepOffsetLine(pts, mm) {
  const n = pts.length;
  return pts.map((p, j) => {
    const a = j < n - 1 ? p : pts[j - 1];
    const b = j < n - 1 ? pts[j + 1] : p;
    let alpha = Math.atan((b[1] - a[1]) / (b[0] - a[0]));
    if (b[0] >= a[0]) alpha -= Math.PI;
    return [p[0] - mm * 0.1 * Math.sin(alpha), p[1] + mm * 0.1 * Math.cos(alpha)];
  });
}

/**
 * The same as the program drew it before 3.30 (its `loffset`): the normal
 * at a point the mean of the segments either side, turned by which side of
 * the chord the point is on and which way the line runs there.
 */
function lepOffsetLine325(pts, mm) {
  const n = pts.length;
  const ang = (a, b) => Math.atan((b[1] - a[1]) / (b[0] - a[0]));
  const d = mm * 0.1;
  return pts.map((p, j) => {
    let alpha;
    if (j === 0) alpha = ang(p, pts[1]);
    else if (j < n - 1) alpha = 0.5 * (ang(p, pts[j + 1]) + ang(pts[j - 1], p));
    else alpha = ang(pts[j - 2], p);
    let q = p;
    if (p[1] >= 0) q = [p[0] - d * Math.sin(alpha), p[1] + d * Math.cos(alpha)];
    if (p[1] >= 0 && j > 0 && p[0] > pts[j - 1][0]) q = [p[0] + d * Math.sin(alpha), p[1] - d * Math.cos(alpha)];
    if (p[1] < 0) q = [p[0] + d * Math.sin(alpha), p[1] - d * Math.cos(alpha)];
    if (p[0] === 0) q = [p[0] - d, p[1]];
    return q;
  });
}

/**
 * A rod's pocket (section 21), as the program draws it beside the rod: the
 * strip between the rod's line moved out by its second pocket width less
 * its first, and in by its first, third and fourth, closed straight at
 * both ends. `before330` for the offset the program used until 3.30.
 */
function lepRodPocket(jonc, before330 = false) {
  const [s1, s2, s3, s4] = jonc.pocket ?? [];
  if (![s1, s2, s3, s4].every(Number.isFinite)) return null;
  const off = before330 ? lepOffsetLine325 : lepOffsetLine;
  const a = off(jonc.points, s2 - s1);
  const b = off(jonc.points, -(s1 + s3 + s4));
  return a.concat(b.slice().reverse());
}

/**
 * The design's internal structure (section 12), as its program cuts it.
 *
 * @returns {{ok, problems, pieces, totals, notReproduced, droppedHoles, settings}}
 *   pieces in metres, one side of the wing: `outline` the cut line, `holes`
 *   the holes cut in it, `sewing` its two sewn sides; `cutAreaM2` the cloth
 *   in the piece as cut (the outline less its holes), `perimeterM` the cut
 *   line's length. A full diagonal also gives `drawnBefore330`: its cloth as
 *   the program drew it up to 3.25, the cut-outs inside a whole allowance.
 */
export function lepStructure(doc, table) {
  const hv = parseHVRibs(doc);
  const st = lepStructureSettings(doc, table);
  const problems = [];
  const notReproduced = new Set();
  let droppedHoles = 0;
  const raw = [];

  // Full diagonals: grouped by rib, built from the rows for its first and last anchors.
  const byRib = new Map();
  for (const d of hv.diagonals) {
    if (!byRib.has(d.rib)) byRib.set(d.rib, []);
    byRib.get(d.rib).push(d);
  }
  for (const [i, list] of byRib) {
    const rib = table.ribs[i - 1];
    if (!rib) { problems.push(`a diagonal on rib ${i}, which the wing does not have`); continue; }
    const rowOf = (k) => list.find((d) => d.row === k);
    const firstRow = rowOf(1);
    const lastRow = rowOf(rib.anchorCount);
    if (!firstRow || !lastRow) {
      problems.push(`rib ${i}: its diagonal rows do not include its first and last anchors`);
      continue;
    }
    const shape = (d) => {
      const [front, back, depth, width] = d.shape;
      const w = d.type === 15 ? (width / 100) * rib.chord : width * st.scale;
      return { front, back, depth, w };
    };
    for (const side of ['left', 'right']) {
      if (!list.some((d) => d[side])) continue;
      const r = lepFullDiagonal(table, st, i, side, shape(firstRow), shape(lastRow));
      if (r.problem) { problems.push(r.problem); continue; }
      for (const n of r.notes) notReproduced.add(n);
      droppedHoles += r.dropped;
      raw.push(r.piece);
    }
  }
  for (const e of hv.straps) {
    const r = lepStrap(table, st, e);
    if (r.problem) { problems.push(r.problem); continue; }
    raw.push(r.piece);
  }
  for (const e of hv.general) {
    const r = lepBetween(table, st, e);
    if (r.problem) { problems.push(r.problem); continue; }
    droppedHoles += r.dropped;
    raw.push(r.piece);
  }
  for (const e of hv.other) notReproduced.add(`section 12 type ${e.type}`);

  // The rods' pockets (section 21), one a rod.
  const joncs = lepJoncs(doc, table);
  for (const n of joncs.notReproduced ?? []) notReproduced.add(`rods: ${n}`);
  for (const j of joncs.joncs) {
    const outline = lepRodPocket(j);
    if (!outline) { problems.push(`rib ${j.rib}: its rod (bloc ${j.bloc}) states no pocket`); continue; }
    raw.push({
      kind: 'pocket', ribs: [j.rib, j.rib], rib: j.rib, bloc: j.bloc, rodType: j.type, sewing: null, outline, holes: [],
      before330: lepRodPocket(j, true),
    });
  }

  // The trailing-edge mini-ribs (section 2's last column) are cut from the
  // section as the program billows the cell over it, which this does not
  // reproduce: counted, not built.
  const miniRibs = readAirfoils(doc).filter((a) => a.miniRibPct > 1 && a.miniRibPct !== 100).length;
  if (miniRibs) notReproduced.add(`${miniRibs} trailing-edge mini-ribs`);

  // A piece on the centre rib alone — its rods' pockets — is cut once for
  // the wing; every other is cut once a side.
  const centreRib = table.ribs.length && table.ribs[0].x / (table.scale || 1) < 0.01;

  // Centimetres to metres.
  const m = (pts) => pts.map((p) => [p[0] / 100, p[1] / 100]);
  const pieces = raw.map((p) => {
    const holesCm2 = p.holes.reduce((t, h) => t + lepRingArea(h), 0);
    const outlineCm2 = lepRingArea(p.outline);
    const out = {
      kind: p.kind,
      ribs: p.ribs,
      copies: centreRib && p.ribs[0] === 1 && p.ribs[1] === 1 ? 1 : 2,
      ...(p.kind === 'diagonal' ? { rib: p.rib, side: p.side, rows: p.rows } : {}),
      ...(p.kind === 'pocket' ? { rib: p.rib, bloc: p.bloc, rodType: p.rodType } : {}),
      ...(p.row ? { row: p.row } : {}),
      ...(p.chordPct ? { chordPct: p.chordPct } : {}),
      ...(p.sewing ? { sewing: { left: m(p.sewing.left), right: m(p.sewing.right) } } : {}),
      outline: m(p.outline),
      holes: p.holes.map(m),
      ...(p.cutOuts ? { cutOuts: p.cutOuts.map(m), anchors: m(p.anchors) } : {}),
      ...(p.sewing ? { sewnAreaM2: lepRingArea(p.sewing.left.concat(p.sewing.right.slice().reverse())) / 1e4 } : {}),
      outlineAreaM2: outlineCm2 / 1e4,
      holesAreaM2: holesCm2 / 1e4,
      cutAreaM2: (outlineCm2 - holesCm2) / 1e4,
      perimeterM: lepRingLength(p.outline) / 100,
    };
    if (p.kind === 'pocket' && p.before330) {
      out.drawnBefore330 = { outlineAreaM2: lepRingArea(p.before330) / 1e4, cutAreaM2: lepRingArea(p.before330) / 1e4,
        perimeterM: lepRingLength(p.before330) / 100 };
    }
    if (p.kind === 'diagonal') {
      const whole = lepRingArea(p.wholeOutline);
      const pockets = p.pockets.reduce((t, q) => t + lepRingArea(q), 0);
      out.drawnBefore330 = {
        outlineAreaM2: whole / 1e4, cutOutsM2: pockets / 1e4, cutAreaM2: (whole - pockets - holesCm2) / 1e4,
        perimeterM: lepRingLength(p.wholeOutline) / 100,
      };
    }
    return out;
  });

  const totals = {};
  for (const kind of ['diagonal', 'strap', 'between', 'pocket']) {
    const of = pieces.filter((p) => p.kind === kind);
    totals[kind] = {
      count: of.length,
      cutM2: of.reduce((t, p) => t + p.cutAreaM2, 0),
      holes: of.reduce((t, p) => t + p.holes.length, 0),
    };
  }
  totals.all = { count: pieces.length, cutM2: pieces.reduce((t, p) => t + p.cutAreaM2, 0) };
  // The whole wing: each piece as often as it is cut.
  totals.wing = {
    count: pieces.reduce((t, p) => t + p.copies, 0),
    cutM2: pieces.reduce((t, p) => t + p.cutAreaM2 * p.copies, 0),
  };
  return {
    ok: problems.length === 0,
    problems,
    pieces,
    totals,
    notReproduced: [...notReproduced],
    miniRibs,
    droppedHoles,
    settings: st,
  };
}

/** What each kind of piece is called, one and many. */
const LEP_PIECE_NAMES = {
  diagonal: ['full diagonal', 'full diagonals'],
  between: ['piece between two ribs', 'pieces between two ribs'],
  strap: ['strap', 'straps'],
  pocket: ['rod pocket', 'rod pockets'],
};

/** A short label for a piece on a cutting file: D2L, S1-2/1, V4-5/11, P3/1. */
function lepPieceLabel(p) {
  if (p.kind === 'diagonal') return `D${p.rib}${p.side === 'left' ? 'L' : 'R'}`;
  if (p.kind === 'strap') return `S${p.ribs[0]}-${p.ribs[1]}/${p.row}`;
  if (p.kind === 'between') return `V${p.ribs[0]}-${p.ribs[1]}/${p.chordPct[0]}`;
  return `P${p.rib}/${p.bloc}`;
}

/** The pieces as items the nester takes: each outline split into two runs. */
function lepNestItems(pieces) {
  return pieces.map((p, i) => {
    const k = Math.max(1, Math.floor(p.outline.length / 2));
    return {
      surface: `structure-${p.kind}`, cell: i + 1, piece: p, label: lepPieceLabel(p),
      panel: { left: p.outline.slice(0, k), right: p.outline.slice(k).reverse() },
    };
  });
}

/**
 * The affine map that takes three points of an outline to the same three
 * of where the nester put it — rotated, turned or moved — so its holes and
 * sewing lines can go with it.
 */
function lepPlacement(from, to) {
  const n = from.length;
  const ids = [0, Math.floor(n / 3), Math.floor((2 * n) / 3)];
  const [a, b, c] = ids.map((k) => from[k]);
  const [A, B, C] = ids.map((k) => to[k]);
  const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(det) < 1e-12) return null;
  // Solve [x' y'] = M [x y] + t from the three pairs.
  const solve = (ua, ub, uc) => {
    const m1 = ((ub - ua) * (c[1] - a[1]) - (uc - ua) * (b[1] - a[1])) / det;
    const m2 = ((uc - ua) * (b[0] - a[0]) - (ub - ua) * (c[0] - a[0])) / det;
    return [m1, m2, ua - m1 * a[0] - m2 * a[1]];
  };
  const X = solve(A[0], B[0], C[0]);
  const Y = solve(A[1], B[1], C[1]);
  return (p) => [X[0] * p[0] + X[1] * p[1] + X[2], Y[0] * p[0] + Y[1] * p[1] + Y[2]];
}

/**
 * The internal structure on its own roll: how much of it one side takes,
 * nested as the sail is. `pieces` from `lepStructure`.
 */
export function lepStructureNesting(pieces, { rollWidth = 1.4, gap = 0.03 } = {}) {
  if (!pieces.length) return { linearMetres: 0, rollWidth, utilisation: 0, count: 0 };
  const est = fabricEstimate(lepNestItems(pieces), { rollWidth, gap });
  return { ...est, count: pieces.length };
}

/**
 * The design's internal structure as a cutting file: every piece of one
 * side nested on a roll, its cut line, its holes, its sewing lines and a
 * label, each kind on its own layers. Metres.
 */
export function lepStructureToDXF(structure, { rollWidth = 1.4, gap = 0.03, labels = true } = {}) {
  const items = lepNestItems(structure.pieces);
  const nested = nestPanels(items, { rollWidth, gap });
  const doc = dxfDocument();
  for (const q of nested.placed) {
    const item = items.find((it) => it.cell === q.cell && it.surface === q.surface) ?? q;
    const p = item.piece;
    const kind = p.kind;
    doc.polyline(q.outline, { layer: `${kind}-cut`, color: 6, closed: true });
    const T = lepPlacement(item.panel.left.concat(item.panel.right.slice().reverse()), q.outline);
    if (T) {
      for (const h of p.holes) doc.polyline(h.map(T), { layer: `${kind}-holes`, color: 3, closed: true });
      if (p.sewing) {
        doc.polyline(p.sewing.left.map(T), { layer: `${kind}-sewing`, color: 4 });
        doc.polyline(p.sewing.right.map(T), { layer: `${kind}-sewing`, color: 4 });
      }
    }
    if (labels) {
      const c = q.outline.reduce((a, r) => [a[0] + r[0] / q.outline.length, a[1] + r[1] / q.outline.length], [0, 0]);
      doc.text(item.label, c, { height: 0.02, color: 2 });
    }
  }
  doc.line([nested.extent.minX, 0], [nested.extent.maxX, 0], { layer: 'roll', color: 4 });
  doc.line([nested.extent.minX, rollWidth], [nested.extent.maxX, rollWidth], { layer: 'roll', color: 4 });
  return doc.toString();
}

/** The pieces in words: "26 full diagonals, 140 straps ...", for the whole wing. */
export function lepStructureWords(pieces) {
  const out = [];
  for (const [kind, [one, many]] of Object.entries(LEP_PIECE_NAMES)) {
    const n = pieces.filter((p) => p.kind === kind).reduce((t, p) => t + (p.copies ?? 2), 0);
    if (n) out.push(`${n} ${n === 1 ? one : many}`);
  }
  return out.join(', ');
}
