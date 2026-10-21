/* leplines.js — a LEparagliding design's own geometry and line plan,
 * computed the way LEparagliding computes it.
 *
 * `lep.js` reads and writes the file. This module turns sections 1, 2, 3, 8,
 * 9, 10, 11, 18, 27, 30 and 34 into the wing and suspension that the author's
 * program would produce from them — the same anchor points, the same knots,
 * the same line lengths — so an imported design is shown and exported as the
 * design it is, rather than as this tool's parametric idea of a similar wing.
 *
 * It is checked against LEparagliding's own output for the Swoop2
 * (`data/reference/lep/swoop2-lep-out.txt`, sections 3 and 4, and the 3D
 * DXF): all 93 lines to 0.05 mm, every anchor to 0.01 mm.
 *
 * Four behaviours of the program had to be reproduced to get there, and each
 * is visible in its output rather than documented:
 *
 *   1. Washin, mode 1. The file asks for `alpha_tip * (c1 - ci) / (c1 - cN)`.
 *      The program computes it inside the loop that READS the ribs, before
 *      rib N is read, so for every rib but the last cN is still zero and the
 *      divisor is c1. The Swoop2's printed washin is 3.136 degrees at rib 25:
 *      5 * (209.07 - 77.93) / 209.07. The intended formula gives 5.0 * 0.883.
 *   2. Integer knots. The distance along each riser and each level-2 and
 *      level-3 line is assigned to `t`, declared INTEGER, so it is truncated
 *      to whole centimetres. That is why every level-3 line on the Swoop2 is
 *      exactly 160.00 cm when its ramification lengths give 160.995.
 *   3. Line length is scaled by the wing scale; the riser length is not.
 *   4. The special wingtip (section 27) moves the last rib's leading and
 *      trailing edges after the washin has been computed from the old chord.
 *
 * Coordinates here are LEparagliding's, in centimetres: x spanwise (projected),
 * y chordwise aft, z DOWNWARD toward the pilot. `lepPlanForTool` converts to
 * this project's metres, x aft, y out, z up.
 */

import { readAoA, sectionData, lepRibs } from './lep.js';
import { DEFAULT_LOAD_CASE } from './loads.js';

/**
 * A LEparagliding `.txt` section: a name, four counts, then the points from the
 * trailing edge over the upper surface, round the nose, and back along the
 * lower surface. The counts matter here: "extrados" runs from the trailing
 * edge round the nose to where the air intake starts, so the lower surface
 * that carries anchors is everything from point `extrados` on.
 */
export function readLepAirfoil(text, fallbackName = 'section') {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 10) throw new Error('Too short to be a LEparagliding section.');
  const name = lines[0].split(/\s{2,}/)[0].trim() || fallbackName;
  const ints = [];
  let i = 1;
  while (i < lines.length && /^[+-]?\d+$/.test(lines[i]) && ints.length < 4) {
    ints.push(parseInt(lines[i], 10));
    i += 1;
  }
  if (ints.length < 4) {
    throw new Error(`${name}: expected four counts (total, extrados, intake, intrados) `
      + 'after the name — this reads LEparagliding .txt sections only.');
  }
  const [total, extrados, intake, intrados] = ints;
  const points = [];
  for (; i < lines.length && points.length < total; i++) {
    const f = lines[i].split(/[\s,]+/).map(Number);
    if (f.length >= 2 && Number.isFinite(f[0]) && Number.isFinite(f[1])) points.push([f[0], f[1]]);
  }
  if (points.length !== total) {
    throw new Error(`${name}: header says ${total} points, file has ${points.length}.`);
  }
  if (extrados + intake - 1 + intrados - 1 !== total) {
    throw new Error(`${name}: counts ${extrados} + ${intake} + ${intrados} do not make ${total}.`);
  }
  return { name, points, total, extrados, intake, intrados };
}

/**
 * Every rib as LEparagliding builds it, in centimetres.
 *
 * @param {object} doc       parsed with `parseLep`
 * @param {object} airfoils  file name -> text, for the sections the file names
 */
export function lepRibTable(doc, { airfoils = {} } = {}) {
  const t = lepRibs(doc);
  const parsed = new Map();
  const missing = [];
  for (const r of t.ribs) {
    if (!r.airfoilFile) continue;
    if (!parsed.has(r.airfoilFile)) {
      const text = airfoils[r.airfoilFile];
      if (typeof text === 'string') parsed.set(r.airfoilFile, readLepAirfoil(text, r.airfoilFile));
      else missing.push(r.airfoilFile);
    }
    r.section = parsed.get(r.airfoilFile) ?? null;
  }
  return { ...t, missingAirfoils: [...new Set(missing)] };
}

/**
 * A point of a rib's section, placed in 3D the way LEparagliding places it
 * (its section 6 and 12.3): washin about RP, yaw about z_pos, dihedral, then
 * the rib's position. u and v in centimetres of this rib.
 */
export function lepRibPoint(rib, u, v) {
  const c = rib.chord;
  const th = (rib.washin * Math.PI) / 180;
  const rz = (rib.rotZ * Math.PI) / 180;
  const b = (rib.beta * Math.PI) / 180;
  const rp = (rib.rp / 100) * c;
  const pos = (c * rib.zPos) / 100;
  const u17 = (u - rp) * Math.cos(th) + v * Math.sin(th) + rp;
  const v17 = (-u + rp) * Math.sin(th) + v * Math.cos(th) - rib.disp;
  const w4 = -u17 * Math.sin(rz) + pos * Math.sin(rz);
  const u4 = u17 * Math.cos(rz) + pos * (1 - Math.cos(rz));
  const v4 = v17;
  const w18 = -w4 * Math.cos(b) - v4 * Math.sin(b);
  const v18 = -w4 * Math.sin(b) + v4 * Math.cos(b);
  return [rib.xp - w18, rib.yLE + u4, rib.z - v18];
}

/**
 * The anchor at `pct` percent of chord on a rib's lower surface, in 3D.
 * Found as the program finds it: linear interpolation between the section's
 * own points, searching only the part after the intake.
 */
export function lepAnchorPoint(rib, pct) {
  const s = rib.section;
  if (!s) return null;
  const c = rib.chord;
  const target = (c * pct) / 100;
  const U = s.points.map((p) => c * p[0]);
  const V = s.points.map((p) => c * p[1] * rib.thickness);
  for (let j = s.extrados - 1; j < s.points.length - 1; j++) {
    if (U[j] <= target && target <= U[j + 1] && U[j + 1] !== U[j]) {
      const m = (V[j + 1] - V[j]) / (U[j + 1] - U[j]);
      return lepRibPoint(rib, target, V[j] + m * (target - U[j]));
    }
  }
  return null;
}

/** Paths of section 9 or 10: levels, (level, order) pairs, final row, rib. */
function lepPaths(lines, start, count, brake) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const f = lines[start + i].trim().split(/\s+/).map(Number);
    const levels = f[0];
    out.push({
      levels,
      orders: [f[2], f[4], f[6], f[8]],
      row: f[9],
      // A brake path may name a fractional rib: its anchor is interpolated
      // between the two neighbours.
      rib: brake ? Math.trunc(f[10]) : f[10],
      ribFraction: brake ? f[10] - Math.trunc(f[10]) : 0,
    });
  }
  return out;
}

const LETTER = (n) => 'ABCDEFGHIJ'[n - 1] ?? `P${n}`;

/**
 * The whole suspension, as LEparagliding computes it.
 *
 * Returns every line with its plan, level, order, label (the program's own:
 * `2A1`, `4A23`, `3C26`), end points, geometric length L, the load the
 * program assigns it, the elastic correction, and the length it reports as
 * the one to cut. Totals are given both ways, because the program's printed
 * total is of the corrected lengths.
 */
export function lepLineGeometry(doc, { airfoils = {} } = {}) {
  const table = lepRibTable(doc, { airfoils });
  const ribs = table.ribs;
  const k = table.scale;
  const problems = [];
  if (table.missingAirfoils.length) {
    return {
      ok: false,
      table,
      problems: [`section files not supplied: ${table.missingAirfoils.join(', ')}`],
    };
  }
  const rib = (i) => ribs[i - 1];

  // Section 8.
  const aoa = readAoA(doc);
  if (!aoa) return { ok: false, table, problems: ['no section 8'] };
  const lineLength = aoa.lineLengthCm * k;           // scaled
  const riserLength = aoa.riserLengthCm;             // not scaled
  const calage = (aoa.calagePct / 100) * ribs[0].chord;
  const hcp = lineLength + riserLength;
  const karabiner = [aoa.karabinerCm / 2, calage + ribs[0].yLE, hcp];
  const cple = (aoa.cpPct / 100) * ribs[0].chord;
  const assietteDeg = (Math.asin((cple - calage) / hcp) * 180) / Math.PI;
  const glideDeg = (Math.atan(1 / aoa.glideRatio) * 180) / Math.PI;

  // Section 9.
  const s9 = sectionData(doc, 9).map((l) => l.trim()).filter(Boolean);
  const zcontrol = parseInt(s9[0], 10);
  const planCount = parseInt(s9[1], 10);
  let p = 2;
  const plans = [];
  for (let ii = 0; ii < planCount; ii++) {
    const cam = parseInt(s9[p], 10);
    plans.push(lepPaths(s9, p + 1, cam, false));
    p += 1 + cam;
  }

  // Section 10, the brakes: main length, paths, distribution.
  const s10 = sectionData(doc, 10).map((l) => l.trim()).filter(Boolean);
  const brakeMain = parseFloat(s10[0]) * k;
  const bcam = parseInt(s10[1], 10);
  const brakePaths = lepPaths(s10, 2, bcam, true);
  const bdPos = s10[2 + bcam] ? s10[2 + bcam].split(/\s+/).map(Number) : [0, 25, 50, 80, 100];
  const bdLen = s10[3 + bcam] ? s10[3 + bcam].split(/\s+/).map((v) => Number(v) * k) : [0, 0, 0, 0, 0];

  // Section 11, ramification lengths, scaled.
  const s11 = sectionData(doc, 11).map((l) => l.trim().split(/\s+/).map(Number));
  const raml = {
    '3,3': s11[0][1] * k, '4,3': s11[1][1] * k, '4,4': s11[1][2] * k,
    '5,3': s11[2][1] * k, '6,3': s11[3][1] * k, '6,4': s11[3][2] * k,
  };

  // Section 18: the load and elasticity model the program uses.
  const s18 = sectionData(doc, 18).map((l) => l.trim().split(/\s+/).map(Number));
  const totalLoadKg = s18[0][0];
  const cdis = { 2: s18[1], 3: s18[2], 4: s18[3], 5: s18[4] };
  const csus = s18.slice(5, 10);   // [plan][level-1], percent per 10 kg

  // Section 34: line types, so each line carries the material the designer
  // chose rather than one this tool would pick.
  const types = lepLineTypes(doc);

  const weightSum = ribs.reduce((s, r) => s + (r.weight ? r.chord * r.weight : 0), 0);
  const aload = (i, j) => {
    const r = rib(i);
    const d = cdis[r.anchorCount]?.[j - 1] ?? 0;
    return (totalLoadKg / 2) * (d / 100) * ((r.weight * r.chord) / weightSum);
  };

  const anchorCache = new Map();
  const anchor = (i, j) => {
    const key = `${i},${j}`;
    if (!anchorCache.has(key)) {
      const r = rib(i);
      const pt = r ? lepAnchorPoint(r, r.anchorsPct[j - 1] ?? 0) : null;
      if (!pt) problems.push(`rib ${i} row ${j}: anchor not found on the lower surface`);
      anchorCache.set(key, pt || [0, 0, 0]);
    }
    return anchorCache.get(key);
  };

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const toward = (from, to, t) => {
    const d = sub(to, from);
    const n = len(d);
    return [from[0] + (d[0] * t) / n, from[1] + (d[1] * t) / n, from[2] + (d[2] * t) / n];
  };

  // The action point of a line: where the anchors it carries pull from.
  const action = (paths) => {
    let s = [0, 0, 0];
    let w = 0;
    for (const q of paths) {
      const a = anchor(q.rib, q.row);
      const m = zcontrol === 3 ? aload(q.rib, q.row)
        : zcontrol === 1 ? rib(q.rib).chord
          : zcontrol === 2 ? rib(q.rib).chord * rib(q.rib).weight : 1;
      s = [s[0] + a[0] * m, s[1] + a[1] * m, s[2] + a[2] * m];
      w += m;
    }
    return [s[0] / w, s[1] / w, s[2] / w];
  };
  const loadOf = (paths) => paths.reduce((s, q) => s + aload(q.rib, q.row), 0);

  const lines = [];
  const riserTops = [];
  const groupBy = (paths, level) => {
    const m = new Map();
    for (const q of paths) {
      if (q.levels < level) continue;
      const o = q.orders[level - 1];
      if (!m.has(o)) m.set(o, []);
      m.get(o).push(q);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  };
  const push = (line) => {
    line.length = len(sub(line.to, line.from));
    lines.push(line);
  };
  const terminalLabel = (level, q) => `${level}${LETTER(q.row)}${q.rib}`;

  plans.forEach((paths, pi) => {
    const plan = pi + 1;
    const letter = LETTER(plan);
    // Level 1: the riser, from the karabiner toward everything it carries.
    const top = toward(karabiner, action(paths), Math.trunc(riserLength));
    riserTops.push({ plan, letter, point: top });
    push({
      plan, letter, level: 1, order: 1, label: `1${letter}1`, kind: 'riser',
      from: karabiner, to: top, loadKg: loadOf(paths), paths,
    });

    const ends2 = new Map();
    for (const [order, ps] of groupBy(paths, 2)) {
      const levels = ps[0].levels;
      let end;
      if (levels === 2) end = anchor(ps[0].rib, ps[0].row);
      else {
        const ap = action(ps);
        const d13 = len(sub(ap, top));
        end = toward(top, ap, Math.trunc(d13 - raml[levels === 4 ? '4,3' : '3,3']));
      }
      ends2.set(order, end);
      push({
        plan, letter, level: 2, order,
        label: levels === 2 ? terminalLabel(2, ps[0]) : `2${letter}${order}`,
        from: top, to: end, loadKg: loadOf(ps), paths: ps, terminal: levels === 2,
      });
    }

    const ends3 = new Map();
    for (const [order, ps] of groupBy(paths, 3)) {
      const levels = ps[0].levels;
      const start = ends2.get(ps[0].orders[1]);
      const end = levels === 3
        ? anchor(ps[0].rib, ps[0].row)
        : toward(start, action(ps), Math.trunc(raml['4,3'] - raml['4,4']));
      ends3.set(order, end);
      push({
        plan, letter, level: 3, order,
        label: levels === 3 ? terminalLabel(3, ps[0]) : `3${letter}${order}`,
        from: start, to: end, loadKg: loadOf(ps), paths: ps, terminal: levels === 3,
      });
    }

    for (const q of paths.filter((x) => x.levels === 4)) {
      push({
        plan, letter, level: 4, order: q.orders[3], label: terminalLabel(4, q),
        from: ends3.get(q.orders[2]), to: anchor(q.rib, q.row),
        loadKg: aload(q.rib, q.row), paths: [q], terminal: true,
      });
    }
  });

  // The brakes, from the top of the last riser (section 14 of the program).
  const brakeAnchor = (q) => {
    const at = (i) => {
      const r = rib(i);
      let pt = lepAnchorPoint(r, r.anchorsPct[5] ?? 0);
      // Brake distribution: extra length along the arc normal, by span.
      const s = (r.x / ribs[ribs.length - 1].x) * 100;
      let extra = 0;
      for (let m = 0; m < 4; m++) {
        if (s >= bdPos[m] && (s < bdPos[m + 1] || (m === 3 && s <= bdPos[4]))) {
          const f = (s - bdPos[m]) / ((bdPos[m + 1] - bdPos[m]) || 1);
          extra = bdLen[m] + f * (bdLen[m + 1] - bdLen[m]);
        }
      }
      if (pt && extra) {
        const b = (r.beta * Math.PI) / 180;
        pt = [pt[0] + extra * Math.sin(b), pt[1], pt[2] - extra * Math.cos(b)];
      }
      return pt;
    };
    const a = at(q.rib);
    if (!q.ribFraction || q.rib >= ribs.length) return a;
    const b = at(q.rib + 1);
    return a.map((v, i) => (1 - q.ribFraction) * v + q.ribFraction * b[i]);
  };
  const brakeAction = (ps) => {
    const s = ps.reduce((acc, q) => {
      const a = brakeAnchor(q);
      return [acc[0] + a[0], acc[1] + a[1], acc[2] + a[2]];
    }, [0, 0, 0]);
    return s.map((v) => v / ps.length);
  };
  if (brakePaths.length && riserTops.length) {
    const plan = planCount + 1;
    const start = riserTops[riserTops.length - 1].point;
    const btop = toward(start, brakeAction(brakePaths), Math.trunc(brakeMain));
    push({
      plan, letter: 'F', level: 1, order: 1, label: '1F1', kind: 'brake',
      from: start, to: btop, loadKg: 0, paths: brakePaths, brake: true,
    });
    const bends2 = new Map();
    for (const [order, ps] of groupBy(brakePaths, 2)) {
      const levels = ps[0].levels;
      let end;
      if (levels === 2) end = brakeAnchor(ps[0]);
      else {
        const ap = brakeAction(ps);
        const d13 = len(sub(ap, btop));
        end = toward(btop, ap, Math.trunc(d13 - raml[levels === 4 ? '6,3' : '5,3']));
      }
      bends2.set(order, end);
      push({
        plan, letter: 'F', level: 2, order,
        label: levels === 2 ? terminalLabel(2, ps[0]) : `2F${order}`,
        from: btop, to: end, loadKg: 0, paths: ps, brake: true, terminal: levels === 2,
      });
    }
    const bends3 = new Map();
    for (const [order, ps] of groupBy(brakePaths, 3)) {
      const levels = ps[0].levels;
      const start3 = bends2.get(ps[0].orders[1]);
      const end = levels === 3
        ? brakeAnchor(ps[0])
        : toward(start3, brakeAction(ps), Math.trunc(raml['6,3'] - raml['6,4']));
      bends3.set(order, end);
      push({
        plan, letter: 'F', level: 3, order,
        label: levels === 3 ? terminalLabel(3, ps[0]) : `3F${order}`,
        from: start3, to: end, loadKg: 0, paths: ps, brake: true, terminal: levels === 3,
      });
    }
    for (const q of brakePaths.filter((x) => x.levels === 4)) {
      push({
        plan, letter: 'F', level: 4, order: q.orders[3], label: terminalLabel(4, q),
        from: bends3.get(q.orders[2]), to: brakeAnchor(q), loadKg: 0,
        paths: [q], brake: true, terminal: true,
      });
    }
  }

  // Elastic correction: the stretch under the program's design load, taken
  // off so the line is the right length when loaded. Risers and brakes are
  // not corrected.
  for (const l of lines) {
    const c = csus[l.plan - 1]?.[l.level - 1] ?? 0;
    l.stretch = (l.level === 1 || l.brake) ? 0 : l.length * (l.loadKg / 10) * (c / 100);
    l.cutLength = l.length - l.stretch;
    // Default type is the level number; the main brake is type 6.
    l.type = l.brake && l.level === 1 ? 6 : l.level;
    l.material = types.get(l.type) ?? null;
  }

  const notRiser = lines.filter((l) => l.kind !== 'riser');
  const sum = (arr, f) => arr.reduce((s, l) => s + f(l), 0);
  const loopOf = (l) => l.material?.loopCm ?? 0;
  const totals = {
    // Both halves, metres, risers excluded — as the program's section 4.
    geometricM: (2 * sum(notRiser, (l) => l.length)) / 100,
    cutM: (2 * sum(notRiser, (l) => l.cutLength)) / 100,
    // Each line has a loop at both ends.
    withLoopsM: (2 * sum(notRiser, (l) => l.cutLength + 2 * loopOf(l))) / 100,
    linesPerSide: notRiser.length,
    risersPerSide: lines.length - notRiser.length,
  };
  // What the program's "detailed lines properties" add up: every line and
  // riser at its cut length plus a loop at each end, by its own type's
  // weight and diameter. Both halves, risers INCLUDED — the Swoop2's
  // 0.468 kg and 0.426 m2, and its metres to buy of each type.
  const withLoops = (l) => l.cutLength + 2 * loopOf(l);            // cm
  totals.weightKg = (2 * sum(lines, (l) => (withLoops(l) / 100)
    * (l.material?.gramsPerMetre ?? 0))) / 1000;
  // Frontal area: length by diameter, the loops included — but a loop of
  // kind `p` at (sqrt 2 - 1) of its length. That factor is not documented;
  // it is read off the program's own output, where the Swoop2's riser
  // (47 cm, two 12 cm `p` loops, 5 mm) is listed at 2847.06 mm2:
  // 470 x 5 + 240 x 5 x 0.41421 = 2847.06. Every `s` line there is its
  // full looped length by its diameter.
  const P_LOOP = Math.SQRT2 - 1;
  const frontalCm = (l) => l.cutLength
    + 2 * loopOf(l) * (l.material?.loopKind === 'p' ? P_LOOP : 1);
  totals.lineAreaM2 = 2 * sum(lines, (l) => (frontalCm(l) / 100)
    * ((l.material?.diameterMM ?? 0) / 1000));
  totals.byType = {};
  for (const l of lines) {
    const t = l.material;
    if (!t) continue;
    const e = totals.byType[t.type] ||= {
      type: t.type, label: t.label, material: t.material, diameterMM: t.diameterMM,
      strengthDaN: t.strengthDaN, gramsPerMetre: t.gramsPerMetre, loopCm: t.loopCm,
      count: 0, metres: 0,
    };
    e.count += 2;
    e.metres += (2 * withLoops(l)) / 100;
  }

  return {
    ok: problems.length === 0,
    table,
    karabiner,
    riserTops,
    lineLengthCm: lineLength,
    riserLengthCm: riserLength,
    calageCm: calage,
    calagePct: aoa.calagePct,
    plumbPct: aoa.cpPct,
    glideRatio: aoa.glideRatio,
    glideDeg,
    assietteDeg,
    aoaDeg: glideDeg - assietteDeg,
    zcontrol,
    lines,
    totals,
    problems,
  };
}

/** Section 34: line types by number. */
export function lepLineTypes(doc) {
  const out = new Map();
  const s = sectionData(doc, 34).map((l) => l.trim()).filter(Boolean);
  if (!s.length || parseInt(s[0], 10) !== 1) return out;
  const n = parseInt(s[1], 10);
  for (const l of s.slice(2, 2 + n)) {
    // "2  c  1.90    Line275   275 daN  s_dyneem    2.26   g   s 12. cm  1"
    const f = l.split(/\s+/);
    out.set(Number(f[0]), {
      type: Number(f[0]),
      diameterMM: Number(f[2]),
      label: f[3],
      strengthDaN: Number(f[4]),
      material: f[6],
      gramsPerMetre: Number(f[7]),
      // How the loop is made: `s` or `p`. The program weighs both alike but
      // gives a `p` loop less frontal area (see the totals).
      loopKind: f[9],
      loopCm: Number(f[10]),
    });
  }
  return out;
}

/**
 * The same suspension in this project's line-plan shape and frame.
 *
 * Names follow the house convention so the rest of the tool reads them —
 * `AR1` for a level-2 main, `AM1` for a level-3 middle, `A1..A12` for the lines
 * at the canopy, `K` for the brake row — and each line keeps the program's
 * own label in `label`, which is what a workshop working from its line sheet
 * will look for. The risers become webbing from the karabiner to each riser's
 * own top: they fan out, as they do in the air, because each one points at
 * the lines it carries.
 *
 * Lines from a plan that end on another row — the Swoop2's C riser carries
 * four lines to the tip, three of them to A and B anchors — are the stabilo,
 * and are given row S.
 */
export function lepPlanForTool(geom, { ribOffset = 1 } = {}) {
  const m = ([x, y, z]) => [y / 100, x / 100, -z / 100];
  const out = [];
  const webbing = [];
  const byRow = {};
  const next = (row, level) => {
    const key = `${row}:${level}`;
    byRow[key] = (byRow[key] ?? 0) + 1;
    return byRow[key];
  };
  const planRow = (l) => (l.brake ? 'K' : l.letter);
  const TOOL_LEVEL = { 2: 'main', 3: 'middle', 4: 'upper' };

  // Anchor numbering per row, spanwise, so `A1` is the innermost A line. A
  // line that ends on a row other than its riser's is a stabilo line.
  const anchorsOf = (paths) => paths.map((q) => `${q.row}:${q.rib}`);
  const anchorIndex = new Map();
  const terminals = geom.lines.filter((x) => x.terminal).map((l) => {
    const q = l.paths[0];
    const stab = !l.brake && LETTER(q.row) !== l.letter;
    return { l, q, row: l.brake ? 'K' : stab ? 'S' : LETTER(q.row) };
  });
  terminals.sort((a, b) => (a.row < b.row ? -1 : a.row > b.row ? 1 : (a.q.rib - b.q.rib) || (a.q.row - b.q.row)));
  for (const t of terminals) {
    const key = `${t.q.row}:${t.q.rib}`;
    if (!anchorIndex.has(key)) anchorIndex.set(key, { row: t.row, n: next(t.row, 'anchor') });
  }

  for (const l of geom.lines) {
    const row = planRow(l);
    if (l.kind === 'riser') {
      webbing.push({
        row, kind: 'webbing', name: `riser-${row}`, label: l.label, riser: row,
        from: m(l.from), to: m(l.to), lengthMM: Math.round(l.length * 10), anchors: [],
      });
      continue;
    }
    const anchors = anchorsOf(l.paths).map((key) => anchorIndex.get(key)?.n).filter(Boolean);
    const base = {
      riser: row,
      from: m(l.from), to: m(l.to),
      lengthMM: Math.round(l.length * 10),
      cutLengthMM: Math.round(l.cutLength * 10),
      label: l.label,
      loadDaN: l.loadKg * 0.980665,
      lepLevel: l.level,
      material: l.material,
      // The design's own line for this position: its type number, what it
      // is, and the length to cut with a loop at each end.
      lepType: l.type,
      withLoopsMM: Math.round((l.cutLength + 2 * (l.material?.loopCm ?? 0)) * 10),
      anchors,
    };
    if (l.terminal) {
      const q = l.paths[0];
      const a = anchorIndex.get(`${q.row}:${q.rib}`);
      const name = a.row === 'S' ? `s${LETTER(q.row).toLowerCase()}${a.n}`
        : a.row === 'K' ? `k${a.n}` : `${a.row}${a.n}`;
      out.push({
        ...base, row: a.row, level: 'upper', index: a.n, name,
        ribIndex: q.rib - ribOffset,
        // The anchor it ends on. A stabilo line is on row S in the plan and
        // on an A, B or C anchor on the rib.
        ...(a.row === 'K' ? {} : { anchorRow: LETTER(q.row) }),
        anchors: [a.n],
      });
    } else if (l.brake) {
      // The brake has four levels to this tool's three: the main line from
      // the riser, then two middle levels, then the lines to the trailing
      // edge.
      const level = l.level === 1 ? 'main' : 'middle';
      const index = next('K', level);
      out.push({ ...base, row: 'K', level, index, name: `K${level === 'main' ? 'R' : 'M'}${index}` });
    } else {
      const level = TOOL_LEVEL[l.level];
      const index = next(row, level);
      const code = level === 'main' ? 'R' : 'M';
      out.push({ ...base, row, level, index, name: `${row}${code}${index}` });
    }
  }

  const tops = Object.fromEntries(geom.riserTops.map((t) => [t.letter, m(t.point)]));
  const karabiner = m(geom.karabiner);
  const plan = {
    lines: out,
    risers: geom.riserTops.map((t) => ({
      name: t.letter,
      rows: [t.letter],
      maillon: tops[t.letter],
    })),
    riserWebbing: webbing,
    karabiner,
    riserTop: tops.A ?? Object.values(tops)[0],
    riserTops: tops,
    maillon: tops.A ?? Object.values(tops)[0],
    riserLengthM: geom.riserLengthCm / 100,
    riserLengthMM: Math.round(geom.riserLengthCm * 10),
    source: 'LEparagliding',
    lep: {
      totals: geom.totals,
      calagePct: geom.calagePct,
      plumbPct: geom.plumbPct,
      glideRatio: geom.glideRatio,
      aoaDeg: geom.aoaDeg,
      assietteDeg: geom.assietteDeg,
      glideDeg: geom.glideDeg,
      lineLengthM: geom.lineLengthCm / 100,
    },
    mergedRows: [],
    levelShortfalls: [],
    mainShortfalls: [],
    mainsAsRequested: true,
  };
  plan.totalLengthM = geom.totals.geometricM;
  return plan;
}

/**
 * The design's OWN line for every position in its plan, in the shape
 * `selectLines` returns.
 *
 * A complete design says which line goes where: section 34 is its table of
 * types and each line takes the type of its level. This tool used to size an
 * imported plan from its own catalogue instead, so the Swoop2's bill of
 * materials, line sheet and cascade table listed lines the design does not
 * use — Liros and Edelrid codes on a wing drawn with "Line275".
 *
 * The tensions are this tool's own load analysis of the plan, so each line
 * still gets a utilisation against the certification load case. That is a
 * check ON the design rather than a choice made for it: a line that comes
 * out past its rating is reported in `overloaded` and left as the designer
 * chose it.
 *
 * @param {object} tensions  `analyseLoads(...).tensions`
 * @param {object} plan      `lepPlanForTool(...)`
 */
export function lepLineSelection(tensions, plan, {
  loadCase = DEFAULT_LOAD_CASE,
  brakeSafetyFactor = 2.0,
  // The table gives one strength per type and does not say elongation.
  // 3.5% at rated load is this project's figure for Dyneema.
  elongationAtRated = 0.035,
} = {}) {
  const own = new Map(plan.lines.map((l) => [l.name, l]));
  const lineFor = (t) => (t ? {
    code: t.label,
    name: t.label,
    diameterMM: t.diameterMM,
    // One nominal strength: taken as both the new and the kinked figure.
    strengthNewDaN: t.strengthDaN,
    strengthKinkedDaN: t.strengthDaN,
    strengthDaN: t.strengthDaN,
    gramsPerM: t.gramsPerMetre,
    sheathed: /^s_/.test(t.material ?? ''),
    fibre: t.material,
    elongationAtRated,
    lepType: t.type,
  } : null);

  const chosen = tensions.lines.map((l) => {
    const o = own.get(l.name);
    const line = lineFor(o?.material);
    const factor = l.row === 'K' ? brakeSafetyFactor : loadCase.safetyFactor;
    const requiredDaN = (l.tensionN * loadCase.limitG * factor) / 10;
    const cutMM = o?.withLoopsMM ?? l.lengthMM;
    return {
      ...l,
      label: o?.label ?? null,
      requiredDaN,
      line,
      utilisation: line ? requiredDaN / line.strengthDaN : Infinity,
      ratedDaN: line ? line.strengthDaN : null,
      sizedBy: 'design',
      loadOnlyLine: null,
      // At the length that is bought: cut, with a loop at each end.
      massG: line ? (line.gramsPerM * cutMM) / 1000 : null,
    };
  });

  const unmet = chosen.filter((c) => !c.line);
  const overloaded = chosen.filter((c) => c.line && c.utilisation > 1 + 1e-9);
  const byMaterial = {};
  for (const c of chosen) if (c.line) (byMaterial[c.line.code] ||= []).push(c);
  return {
    lines: chosen,
    unmet,
    overloaded,
    ok: unmet.length === 0,
    totalMassG: chosen.reduce((s, c) => s + (c.massG || 0) * 2, 0),
    byMaterial,
    loadCase,
    strengthBasis: 'nominal',
    source: 'the design\'s own line types (LEP section 34)',
    floorSized: 0,
    loadSized: 0,
    practicalFloor: null,
  };
}

/**
 * The design's own lengths, in the shape `lengthChain` returns.
 *
 * LEparagliding has already done this work: it takes the stretch under its
 * own design load off each line and adds a loop at each end. Its numbers
 * are the ones a workshop building the design cuts to, so they are passed
 * through rather than recomputed from this tool's load model:
 *
 *   flying  the geometric length, "L" in its line list
 *   sewn    that less the stretch, "len" — eye to eye, unloaded
 *   cut     sewn plus a loop at each end, by the type's own loop length
 *
 * The reference length — what a PMA inspection measures at 5 daN — is this
 * tool's, from the sewn length and the line's rated elongation.
 */
export function lepLengthChain(selection, plan, { measurementDaN = 5 } = {}) {
  const own = new Map(plan.lines.map((l) => [l.name, l]));
  const rows = selection.lines.map((l) => {
    const o = own.get(l.name);
    const flying = o?.lengthMM ?? l.lengthMM;
    const sewn = o?.cutLengthMM ?? flying;
    const cut = o?.withLoopsMM ?? sewn;
    const ratedN = (l.ratedDaN ?? 0) * 10;
    const eps = l.line?.elongationAtRated ?? 0;
    const atMeasure = ratedN > 0 ? sewn * eps * ((measurementDaN * 10) / ratedN) : 0;
    const reference = sewn + atMeasure;
    return {
      ...l,
      flightN: (o?.loadDaN ?? 0) * 10,
      flyingLengthMM: Math.round(flying),
      referenceLengthMM: Math.round(reference),
      sewnLengthMM: Math.round(sewn),
      cutLengthMM: Math.round(cut),
      flightStretchMM: flying - sewn,
      measurementStretchMM: atMeasure,
      referenceMinusFlyingMM: reference - flying,
      sized: !!l.line,
    };
  });
  const deltas = rows.filter((r) => r.sized).map((r) => r.referenceMinusFlyingMM);
  return {
    lines: rows,
    measurementDaN,
    loopAllowanceMM: null,
    source: 'LEparagliding: its own stretch correction and loop lengths',
    // One half of the wing, as `lengthChain` gives them.
    flyingMetres: rows.reduce((a, r) => a + r.flyingLengthMM, 0) / 1000,
    sewnMetres: rows.reduce((a, r) => a + r.sewnLengthMM, 0) / 1000,
    cutMetres: rows.reduce((a, r) => a + r.cutLengthMM, 0) / 1000,
    worstReferenceMinusFlyingMM: deltas.length
      ? deltas.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0) : 0,
    meanReferenceMinusFlyingMM: deltas.length
      ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0,
    bandUsedFraction: deltas.length
      ? Math.max(...deltas.map((d) => Math.abs(d))) / 12 : 0,
  };
}

/**
 * Section 21, the nylon rods (joncs), computed as the program computes them.
 *
 * Two of the program's five rod types are reproduced exactly, and they are
 * the two the Swoop2 uses:
 *
 *   type 1  a nose rod: one piece from the upper surface, round the leading
 *           edge, to the lower surface. Each surface's four numbers are the
 *           start and end of a zone, in percent of chord, over which the rod
 *           leaves the surface, and how far (percent of chord) and with what
 *           exponent. The rod follows the section to the start of the zone
 *           and curves away from it across the zone.
 *   type 4  an EXTRADOS rod: a batten along the upper surface only. The first
 *           row's zone is the forward end, the second row's the aft end —
 *           23.5-29.5% and 63.0-70.0% on the Swoop2, so its rods run from
 *           23.5% to 70% of chord.
 *
 * Type 4 was carried as "not understood" here, read as a second nose rod
 * and found 92% too long. It is not a nose rod. Reading the program shows
 * what it is, and its 25 lengths now come out to the printed tenth of a
 * centimetre, as do the 25 of type 1.
 *
 * Lengths in centimetres; each rod also carries its polyline in the rib's
 * own section coordinates, for drawing on the rib.
 */
export function lepJoncs(doc, table) {
  const s = sectionData(doc, 21).map((l) => l.trim()).filter(Boolean);
  const out = { joncs: [], blocs: [], notReproduced: [], ok: true };
  if (!s.length || parseInt(s[0], 10) === 0) return out;
  const scheme = parseInt(s[0], 10);
  const nums = (l) => l.split(/\s+/).map(Number);
  let p = 1;
  const blocs = [];
  if (scheme === 1) {
    const groups = parseInt(s[p++], 10);
    const g = [];
    for (let k = 0; k < groups; k++) {
      g.push({ ribs: nums(s[p++]), ex: nums(s[p++]), inn: nums(s[p++]), sjo: nums(s[p++]) });
    }
    blocs.push({ bloc: 1, type: 1, groups: g });
  } else if (scheme === 2) {
    const nb = parseInt(s[p++], 10);
    for (let m = 0; m < nb; m++) {
      const [bloc, type] = nums(s[p++]);
      const groups = parseInt(s[p++], 10);
      const g = [];
      for (let k = 0; k < groups; k++) {
        if (type === 2) {
          // Arc rods: a different record, not reproduced.
          g.push({ ribs: nums(s[p++]), x21: nums(s[p++]), sjo: nums(s[p++]) });
        } else if (type === 3) {
          g.push({ ribs: nums(s[p++]), ex: nums(s[p++]), ex2: nums(s[p++]),
            inn2: nums(s[p++]), inn: nums(s[p++]), sjo: nums(s[p++]) });
        } else {
          g.push({ ribs: nums(s[p++]), ex: nums(s[p++]), inn: nums(s[p++]), sjo: nums(s[p++]) });
        }
      }
      blocs.push({ bloc, type, groups: g });
    }
  } else {
    out.ok = false;
    out.notReproduced.push(`rod scheme ${scheme}`);
    return out;
  }
  out.blocs = blocs;

  for (const b of blocs) {
    if (b.type !== 1 && b.type !== 4) {
      out.notReproduced.push(`bloc ${b.bloc}, rod type ${b.type}`);
      continue;
    }
    for (const g of b.groups) {
      const [, from, to] = g.ribs;
      for (let i = from; i <= to; i++) {
        const rib = table.ribs[i - 1];
        if (!rib?.section) continue;
        const j = lepJoncPolyline(rib, b.type, g.ex, g.inn);
        if (!j) { out.ok = false; out.notReproduced.push(`bloc ${b.bloc} rib ${i}: extents not found`); continue; }
        out.joncs.push({
          bloc: b.bloc, type: b.type, rib: i, ribIndex: i - 1,
          lengthCm: j.length, points: j.points,
        });
      }
    }
  }
  const sum = (arr) => arr.reduce((t, j) => t + j.lengthCm, 0);
  out.byBloc = Object.fromEntries(blocs.map((b) => {
    const js = out.joncs.filter((j) => j.bloc === b.bloc);
    return [b.bloc, { type: b.type, count: js.length, totalM: sum(js) / 100 }];
  }));
  out.totalM = sum(out.joncs) / 100;
  out.bothSidesM = (2 * sum(out.joncs)) / 100;
  return out;
}

/** One rod's polyline and length, types 1 and 4, as the program builds it. */
function lepJoncPolyline(rib, type, ex, inn) {
  const c = rib.chord;
  const P = rib.section.points.map(([x, y]) => [x * c, y * c * rib.thickness]);
  const U = P.map((q) => q[0]);
  const V = P.map((q) => q[1]);
  const at = (x1, y1, x2, y2, x3) => y2 + ((y2 - y1) / (x2 - x1)) * (x3 - x2);
  let x1f; let x1i; let x2f; let x2i;
  if (type === 1) {
    x1f = (ex[1] * c) / 100; x1i = (ex[0] * c) / 100;
    x2f = (inn[1] * c) / 100; x2i = (inn[0] * c) / 100;
  } else {
    // The program swaps the rows for type 4 so the points run left to right.
    x2i = (ex[1] * c) / 100; x2f = (ex[0] * c) / 100;
    x1f = (inn[1] * c) / 100; x1i = (inn[0] * c) / 100;
  }
  let j1f; let j1i; let j2i; let j2f; let p1f; let p1i; let p2i; let p2f;
  for (let j = 0; j < P.length - 1; j++) {
    const up = V[j] >= 0;
    if (U[j] >= x1f && U[j + 1] < x1f && up) { j1f = j; p1f = [x1f, at(U[j + 1], V[j + 1], U[j], V[j], x1f)]; }
    if (U[j] >= x1i && U[j + 1] < x1i && up) { j1i = j; p1i = [x1i, at(U[j + 1], V[j + 1], U[j], V[j], x1i)]; }
    if (type === 1) {
      if (U[j] <= x2i && U[j + 1] > x2i && !up) { j2i = j; p2i = [x2i, at(U[j], V[j], U[j + 1], V[j + 1], x2i)]; }
      if (U[j] <= x2f && U[j + 1] >= x2f && !up) { j2f = j; p2f = [x2f, at(U[j], V[j], U[j + 1], V[j + 1], x2f)]; }
    } else {
      if (U[j] >= x2i && U[j + 1] < x2i && up) { j2i = j; p2i = [x2i, at(U[j], V[j], U[j + 1], V[j + 1], x2i)]; }
      if (U[j] >= x2f && U[j + 1] < x2f && up) { j2f = j; p2f = [x2f, at(U[j], V[j], U[j + 1], V[j + 1], x2f)]; }
    }
  }
  if ([j1f, j1i, j2i, j2f].some((v) => v === undefined)) return null;
  // The program's own indexing, so the zone boundaries fall where its do.
  const X = new Map();
  X.set(j1f, p1f.slice());
  for (let j = j1f + 1; j <= j1i; j++) X.set(j, [U[j], V[j]]);
  X.set(j1i + 1, p1i.slice());
  for (let j = j1i + 1; j <= j2i; j++) X.set(j + 1, [U[j], V[j]]);
  X.set(j2i + 2, p2i.slice());
  for (let j = j2i + 1; j <= j2f; j++) X.set(j + 2, [U[j], V[j]]);
  X.set(j2f + 3, p2f.slice());
  const npo = j2f - j1f + 4;
  // Deflection across each zone: the rod leaves the surface by up to the
  // stated percent of chord, with the stated exponent, curving into the cell.
  const k1 = ((ex[2] * c) / 100) / (x1f - x1i) ** ex[3];
  const k2 = ((inn[2] * c) / 100) / (x2f - x2i) ** inn[3];
  for (let j = j1i + 1; j >= j1f; j--) {
    const q = X.get(j);
    q[1] -= k1 * (q[0] - x1i) ** ex[3];
  }
  for (let j = j2i + 2; j <= j2f + 3; j++) {
    const q = X.get(j);
    q[1] += (type === 1 ? 1 : -1) * k2 * (q[0] - x2i) ** inn[3];
  }
  const points = [];
  for (let j = j1f; j < j1f + npo; j++) points.push(X.get(j));
  let length = 0;
  for (let j = 1; j < points.length; j++) {
    length += Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]);
  }
  return { length, points };
}

/**
 * Section 4, the lightening holes, per rib — the design's own, rather than
 * the ones this tool would generate. Type 1 is an ellipse: centre, semi-axes
 * and rotation, all in percent of chord. Other types are reported, not drawn.
 * Returns holes in the rib's section coordinates, metres.
 */
export function lepHoles(doc, table) {
  const s = sectionData(doc, 4).map((l) => l.trim()).filter(Boolean);
  const out = { byRib: new Map(), notReproduced: [] };
  if (!s.length) return out;
  const groups = parseInt(s[0], 10);
  let p = 1;
  for (let m = 0; m < groups && p < s.length; m++) {
    const r1 = parseInt(s[p++], 10);
    const r2 = parseInt(s[p++], 10);
    const n = parseInt(s[p++], 10);
    const holes = [];
    for (let k = 0; k < n; k++) holes.push(s[p++].split(/\s+/).map(Number));
    for (let i = r1; i <= r2; i++) {
      const rib = table.ribs[i - 1];
      if (!rib) continue;
      const c = rib.chord / 100;
      const list = [];
      for (const h of holes) {
        if (h[0] !== 1) { out.notReproduced.push(`rib ${i}: hole type ${h[0]}`); continue; }
        const [, x, y, a, b, rotDeg] = h;
        const t = (rotDeg * Math.PI) / 180;
        const outline = [];
        for (let q = 0; q <= 48; q++) {
          const w = (2 * Math.PI * q) / 48;
          const ex = ((a * c) / 100) * Math.cos(w);
          const ey = ((b * c) / 100) * Math.sin(w);
          outline.push([(x * c) / 100 + ex * Math.cos(t) - ey * Math.sin(t),
            (y * c) / 100 + ex * Math.sin(t) + ey * Math.cos(t)]);
        }
        list.push({ type: 1, centre: [(x * c) / 100, (y * c) / 100], outline });
      }
      out.byRib.set(i - 1, list);
    }
  }
  return out;
}
