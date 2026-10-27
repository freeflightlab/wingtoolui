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

import { readAoA, sectionData, lepRibs, lepProgramVersion, LEP_PROGRAM_NEWEST } from './lep.js';
import { DEFAULT_LOAD_CASE } from './loads.js';
import { developPanel } from './flatdev.js';

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
 *
 * A rib with a displacement (section 2: the program lowers a rib that
 * carries no line) is lowered at one of two moments, and the program uses
 * both. Its section 6 — the surfaces the panels are cut from — and the
 * pieces of section 12 lower it BEFORE twisting it; its anchors and the
 * rib's other marked points (12.3, 12.4) AFTER, under the author's own
 * note to review it. A rib with washin moves `disp sin(washin)` along its
 * chord between the two: up to 0.85 mm on the six lowered ribs of the
 * Tuluaq-19. Before, unless `lowered: 'after'`. Lowered after for every
 * point, as this did until the Tuluaq's diagonals were reproduced, its
 * diagonals next to those ribs were up to 0.007% off their file's; lowered
 * before, none is more than 0.0001%.
 */
export function lepRibPoint(rib, u, v, { lowered = 'before' } = {}) {
  const c = rib.chord;
  const th = (rib.washin * Math.PI) / 180;
  const rz = (rib.rotZ * Math.PI) / 180;
  const b = (rib.beta * Math.PI) / 180;
  const rp = (rib.rp / 100) * c;
  const pos = (c * rib.zPos) / 100;
  const disp = rib.disp ?? 0;
  const vd = lowered === 'after' ? v : v - disp;
  const u17 = (u - rp) * Math.cos(th) + vd * Math.sin(th) + rp;
  const v17 = (-u + rp) * Math.sin(th) + vd * Math.cos(th) - (lowered === 'after' ? disp : 0);
  const w4 = -u17 * Math.sin(rz) + pos * Math.sin(rz);
  const u4 = u17 * Math.cos(rz) + pos * (1 - Math.cos(rz));
  const v4 = v17;
  const w18 = -w4 * Math.cos(b) - v4 * Math.sin(b);
  const v18 = -w4 * Math.sin(b) + v4 * Math.cos(b);
  return [rib.xp - w18, rib.yLE + u4, rib.z - v18];
}

/**
 * The anchor at `pct` percent of chord on a rib's lower surface, in 3D.
 * Found as the program finds it (its section 9.1): linear interpolation
 * between the section's own points, searching only the part after the
 * intake.
 *
 * Three details are the program's and not this tool's choice, and the
 * Tuluaq-19 — the second complete design here — needs all three:
 *
 * - **The comparison is in single precision.** The program converts both
 *   sides to `real` before comparing ("Please, don't compare directly two
 *   double precision numbers !!!"). Compared in double precision, an anchor
 *   at exactly 100% of chord — the Tuluaq's brakes — is a hair past the
 *   trailing edge on some ribs (rib 13's chord is 170.21295102283997 cm, and
 *   that times 100 over 100 is 170.21295102284; rib 6 is the same) and was
 *   not found at all: the line geometry then crashed.
 * - **The last segment that holds the station wins**, because the program's
 *   loop does not stop at the first.
 * - **An anchor no segment holds stays at the section's origin.** The
 *   program's arrays start at zero and nothing overwrites them, so an anchor
 *   ahead of the intake — the Tuluaq's tip rib has its A at 0% — sits at
 *   (0, 0) of the section: the leading edge. This returned nothing, and the
 *   caller put the anchor at the origin of the WING, 4.4 m away.
 *
 * `found` on the result's `lepAnchor` says which of the two it was.
 */
export function lepAnchorPoint(rib, pct) {
  const s = rib.section;
  if (!s) return null;
  const c = rib.chord;
  const target = (c * pct) / 100;
  const U = s.points.map((p) => c * p[0]);
  const V = s.points.map((p) => c * p[1] * rib.thickness);
  const f = Math.fround;
  let hit = null;
  for (let j = s.extrados - 1; j < s.points.length - 1; j++) {
    if (f(U[j]) <= f(target) && f(U[j + 1]) >= f(target) && U[j + 1] !== U[j]) {
      const m = (V[j + 1] - V[j]) / (U[j + 1] - U[j]);
      hit = [target, V[j] + m * (target - U[j])];
    }
  }
  // Lowered after the twist, as the program places its anchors (its 12.3).
  const pt = hit ? lepRibPoint(rib, hit[0], hit[1], { lowered: 'after' }) : lepRibPoint(rib, 0, 0, { lowered: 'after' });
  pt.lepAnchor = { found: !!hit, pct };
  return pt;
}

/**
 * A design file read wrong says where: which section, and which of its
 * lines. Read without checks, a file that runs short or has text where a
 * number goes threw a TypeError from deep inside the geometry —
 * "Cannot read properties of undefined (reading '1')" — and that is what a
 * designer saw. 1,440 damaged copies of the three designs on file (lines
 * dropped, repeated, cut short, garbled) threw 158 of them from eight places.
 */
export class LepReadError extends Error {
  constructor(section, what) {
    super(`section ${section}: ${what}`);
    this.name = 'LepReadError';
    this.section = section;
  }
}

/** The numbers of a line, at least `min` of them, or a LepReadError. */
export function lepNumbers(line, section, what, min = 1) {
  if (line == null) throw new LepReadError(section, `the file ends before ${what}`);
  const f = String(line).trim().split(/\s+/).map(Number);
  if (f.length < min || f.slice(0, min).some((x) => !Number.isFinite(x))) {
    throw new LepReadError(section, `${what} needs ${min} number${min > 1 ? 's' : ''}: `
      + `"${String(line).trim().slice(0, 48)}"`);
  }
  return f;
}

/** A count on a line of its own, within [min, max], or a LepReadError. */
export function lepCount(line, section, what, { min = 0, max = 10000 } = {}) {
  if (line == null) throw new LepReadError(section, `the file ends before ${what}`);
  const v = Number(String(line).trim().split(/\s+/)[0]);
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new LepReadError(section, `${what} should be a whole number from ${min} to ${max}: `
      + `"${String(line).trim().slice(0, 30)}"`);
  }
  return v;
}

/** Paths of section 9 or 10: levels, (level, order) pairs, final row, rib. */
function lepPaths(lines, start, count, brake, ribCount = Infinity, plan = null) {
  const out = [];
  const section = brake ? 10 : 9;
  for (let i = 0; i < count; i++) {
    const what = `${brake ? 'brake path' : `riser ${plan}'s path`} ${i + 1}`;
    const f = lepNumbers(lines[start + i], section, what, 11);
    const levels = f[0];
    if (!Number.isInteger(levels) || levels < 1 || levels > 4) {
      throw new LepReadError(section, `${what} has ${levels} levels; the program builds 1 to 4`);
    }
    if (!(f[10] >= 1 && Math.trunc(f[10]) <= ribCount)) {
      throw new LepReadError(section, `${what} ends on rib ${f[10]}, and the wing has ribs 1 to ${ribCount}`);
    }
    if (!(f[9] >= 1 && f[9] <= 6)) {
      throw new LepReadError(section, `${what} ends on row ${f[9]}; rows run from 1 (A) to 6 (the brake)`);
    }
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
  // What the program does that a reader might not expect, said rather than
  // treated as an error: an anchor it leaves at the section's origin.
  const notes = [];
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
  const aoaNames = ['glide ratio', 'centre of pressure', 'calage', 'riser length', 'line length', 'karabiner separation'];
  if (!aoa) {
    return { ok: false, table, problems: [`section 8: it needs six values — ${aoaNames.join(', ')} — and has fewer`] };
  }
  const badAoA = ['glideRatio', 'cpPct', 'calagePct', 'riserLengthCm', 'lineLengthCm', 'karabinerCm']
    .findIndex((key) => !Number.isFinite(aoa[key]));
  if (badAoA >= 0) return { ok: false, table, problems: [`section 8: its ${aoaNames[badAoA]} is not a number`] };
  const lineLength = aoa.lineLengthCm * k;           // scaled
  const riserLength = aoa.riserLengthCm;             // not scaled
  const calage = (aoa.calagePct / 100) * ribs[0].chord;
  const hcp = lineLength + riserLength;
  const karabiner = [aoa.karabinerCm / 2, calage + ribs[0].yLE, hcp];
  const cple = (aoa.cpPct / 100) * ribs[0].chord;
  const assietteDeg = (Math.asin((cple - calage) / hcp) * 180) / Math.PI;
  const glideDeg = (Math.atan(1 / aoa.glideRatio) * 180) / Math.PI;

  // Every rib needs its section: one missing from section 2 has no
  // surface to hang an anchor on.
  const bare = ribs.filter((r) => !r.section).map((r) => r.index);
  if (bare.length) {
    return {
      ok: false,
      table,
      problems: [`section 2: rib${bare.length > 1 ? 's' : ''} ${bare.slice(0, 6).join(', ')} `
        + `${bare.length > 1 ? 'have' : 'has'} no section file`],
    };
  }

  // Sections 9, 10, 11 and 18, read with their shapes checked: a file that
  // runs short or has text where a number goes is said by section and line.
  let zcontrol; let planCount; let plans; let brakeMain; let brakePaths; let bdPos; let bdLen;
  let raml; let totalLoadKg; let cdis; let csus;
  try {
    // Section 9.
    const s9 = sectionData(doc, 9).map((l) => l.trim()).filter(Boolean);
    zcontrol = lepCount(s9[0], 9, 'the anchor weighting (0 to 3)', { min: 0, max: 3 });
    planCount = lepCount(s9[1], 9, 'the number of risers', { min: 1, max: 9 });
    let p = 2;
    plans = [];
    for (let ii = 0; ii < planCount; ii++) {
      const cam = lepCount(s9[p], 9, `riser ${ii + 1}'s number of paths`, { min: 1, max: 999 });
      plans.push(lepPaths(s9, p + 1, cam, false, ribs.length, ii + 1));
      p += 1 + cam;
    }

    // Section 10, the brakes: main length, paths, distribution.
    const s10 = sectionData(doc, 10).map((l) => l.trim()).filter(Boolean);
    brakeMain = lepNumbers(s10[0], 10, 'the main brake line\'s length')[0] * k;
    const bcam = lepCount(s10[1], 10, 'the number of brake paths', { min: 0, max: 999 });
    brakePaths = lepPaths(s10, 2, bcam, true, ribs.length);
    bdPos = s10[2 + bcam] ? lepNumbers(s10[2 + bcam], 10, 'the brake distribution\'s span stations', 5)
      : [0, 25, 50, 80, 100];
    bdLen = s10[3 + bcam] ? lepNumbers(s10[3 + bcam], 10, 'the brake distribution\'s lengths', 5).map((v) => v * k)
      : [0, 0, 0, 0, 0];

    // Section 11, ramification lengths, scaled.
    // Blank lines skipped, as the program's list-directed reads skip them.
    const s11 = sectionData(doc, 11).map((l) => l.trim()).filter(Boolean);
    const r11 = [2, 3, 2, 3].map((n, i) => lepNumbers(s11[i], 11, `ramification row ${i + 1}`, n));
    raml = {
      '3,3': r11[0][1] * k, '4,3': r11[1][1] * k, '4,4': r11[1][2] * k,
      '5,3': r11[2][1] * k, '6,3': r11[3][1] * k, '6,4': r11[3][2] * k,
    };

    // Section 18: the load and elasticity model the program uses — the
    // total load, the split for 2 to 5 anchors on a rib, and a row of
    // stretch per 10 kg for each riser.
    const s18 = sectionData(doc, 18).map((l) => l.trim()).filter(Boolean);
    totalLoadKg = lepNumbers(s18[0], 18, 'the total load')[0];
    cdis = {};
    for (let n = 2; n <= 5; n++) cdis[n] = lepNumbers(s18[n - 1], 18, `the split of the load over ${n} anchors`, n);
    csus = [];
    for (let i = 0; i < planCount; i++) csus.push(lepNumbers(s18[5 + i], 18, `riser ${i + 1}'s elasticity row`, 4));
  } catch (e) {
    if (e instanceof LepReadError) return { ok: false, table, problems: [e.message] };
    throw e;
  }

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
      if (!pt) problems.push(`rib ${i} row ${j}: no such rib`);
      else if (!pt.lepAnchor.found) {
        notes.push(`rib ${i} row ${j}: ${pt.lepAnchor.pct}% of chord is ahead of the intake, where `
          + 'the program does not look; it leaves the anchor at the section\'s origin, the leading edge, '
          + 'and so does this');
      }
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
    // `neighbour`: the rib after a fractional brake point. The program
    // (its 5.1.8+) gives that rib a brake station of 100% when it has none.
    const at = (i, neighbour = false) => {
      const r = rib(i);
      const pct = r.anchorsPct[5] ?? 0;
      let pt = lepAnchorPoint(r, neighbour && pct === 0 ? 100 : pct);
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
    const b = at(q.rib + 1, true);
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
  //
  // And a webbing riser (section `r`) is counted without its loops at all —
  // the program's 14.9, "case r don't count loops": the Tuluaq's 12 mm
  // riser is 5640 mm2 there, 470 x 12. Counted with its loops it put the
  // total 4.7% over the program's printed 0.363 m2.
  const P_LOOP = Math.SQRT2 - 1;
  const frontalCm = (l) => {
    if (l.level === 1 && l.material?.section === 'rectangular') return l.cutLength;
    return l.cutLength + 2 * loopOf(l) * (l.material?.loopKind === 'p' ? P_LOOP : 1);
  };
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
    notes,
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
    // "1  r  12.  2.5 Riser   1000 daN  aramid      15.0   g   s 12. cm 7"
    //
    // The section is `c` for a round line, one dimension, and `r` for a
    // rectangular one — webbing — with two: width, then thickness. Read as
    // a round line, the Tuluaq's webbing riser came out labelled "2.5", made
    // of "daN" and weighing nothing.
    const f = l.split(/\s+/);
    const rect = f[1] === 'r';
    const o = rect ? 1 : 0;
    out.set(Number(f[0]), {
      type: Number(f[0]),
      section: rect ? 'rectangular' : 'round',
      // The frontal size: a round line's diameter, a webbing's width.
      diameterMM: Number(f[2]),
      thicknessMM: rect ? Number(f[3]) : null,
      label: f[3 + o],
      strengthDaN: Number(f[4 + o]),
      material: f[6 + o],
      gramsPerMetre: Number(f[7 + o]),
      // How the loop is made: `s` or `p`. The program weighs both alike but
      // gives a `p` loop less frontal area (see the totals).
      loopKind: f[9 + o],
      loopCm: Number(f[10 + o]),
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

  // Anchor numbering per row, spanwise, so `A1` is the innermost A line.
  //
  // A line from one riser to a row that has a riser of its own is a stabilo
  // line: the Swoop2's C lines to the A and B anchors of its tip. A row with
  // no riser of its own is simply that row, on the riser it hangs from — the
  // Tuluaq-19's D row is on its C riser. Every line to a row other than its
  // riser's was taken for a stabilo line, which filed the Tuluaq's whole D
  // row under the stabilo, and the load model, which gives the stabilo none
  // of the lift, dropped the tenth of the wing's load the design's own
  // program puts on it.
  const riserRows = new Set((geom.riserTops ?? []).map((t) => t.letter));
  const anchorsOf = (paths) => paths.map((q) => `${q.row}:${q.rib}`);
  const anchorIndex = new Map();
  const terminals = geom.lines.filter((x) => x.terminal).map((l) => {
    const q = l.paths[0];
    const stab = !l.brake && LETTER(q.row) !== l.letter && riserRows.has(LETTER(q.row));
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
  // Every record read with its shape checked: a file cut short in its rods
  // is said as such, by section and line, rather than thrown from here.
  let p = 1;
  const nums = (what, min = 2) => lepNumbers(s[p++], 21, what, min);
  const blocs = [];
  try {
    if (scheme === 1) {
      const groups = lepCount(s[p++], 21, 'the number of groups of rods', { min: 0, max: 999 });
      const g = [];
      for (let k = 0; k < groups; k++) {
        const w = `group ${k + 1}`;
        g.push({ ribs: nums(`${w}'s ribs`), ex: nums(`${w}'s upper extent`), inn: nums(`${w}'s lower extent`),
          sjo: nums(`${w}'s rod sizes`) });
      }
      blocs.push({ bloc: 1, type: 1, groups: g });
    } else if (scheme === 2) {
      const nb = lepCount(s[p++], 21, 'the number of blocs of rods', { min: 0, max: 99 });
      for (let m = 0; m < nb; m++) {
        const [bloc, type] = nums(`bloc ${m + 1}'s number and type`);
        const groups = lepCount(s[p++], 21, `bloc ${bloc}'s number of groups`, { min: 0, max: 999 });
        const g = [];
        for (let k = 0; k < groups; k++) {
          const w = `bloc ${bloc} group ${k + 1}`;
          if (type === 2) {
            // Arc rods: a different record, not reproduced.
            g.push({ ribs: nums(`${w}'s ribs`), x21: nums(`${w}'s arc`, 1), sjo: nums(`${w}'s rod sizes`, 1) });
          } else if (type === 3) {
            g.push({ ribs: nums(`${w}'s ribs`), ex: nums(`${w}'s upper extent`), ex2: nums(`${w}'s upper bend`),
              inn2: nums(`${w}'s lower bend`), inn: nums(`${w}'s lower extent`), sjo: nums(`${w}'s rod sizes`) });
          } else {
            g.push({ ribs: nums(`${w}'s ribs`), ex: nums(`${w}'s upper extent`), inn: nums(`${w}'s lower extent`),
              sjo: nums(`${w}'s rod sizes`) });
          }
        }
        blocs.push({ bloc, type, groups: g });
      }
    } else {
      out.ok = false;
      out.notReproduced.push(`rod scheme ${scheme}`);
      return out;
    }
  } catch (e) {
    if (!(e instanceof LepReadError)) throw e;
    out.ok = false;
    out.notReproduced.push(`rods not read: ${e.message}`);
    return out;
  }
  out.blocs = blocs;

  for (const b of blocs) {
    if (b.type !== 1 && b.type !== 3 && b.type !== 4) {
      out.notReproduced.push(`bloc ${b.bloc}, rod type ${b.type}`);
      continue;
    }
    for (const g of b.groups) {
      const [, from, to] = g.ribs;
      for (let i = from; i <= to; i++) {
        const rib = table.ribs[i - 1];
        if (!rib?.section) continue;
        if (b.type === 3) {
          // A shark nose: two rods a rib, each with its own pocket.
          const pair = lepSharkNoseRods(rib, g);
          if (!pair) { out.ok = false; out.notReproduced.push(`bloc ${b.bloc} rib ${i}: extents not found`); continue; }
          for (const part of ['upper', 'lower']) {
            out.joncs.push({
              bloc: b.bloc, type: 3, part, rib: i, ribIndex: i - 1,
              lengthCm: pair[part].length, points: pair[part].points, pocket: g.sjo,
            });
          }
          continue;
        }
        const j = lepJoncPolyline(rib, b.type, g.ex, g.inn);
        if (!j) { out.ok = false; out.notReproduced.push(`bloc ${b.bloc} rib ${i}: extents not found`); continue; }
        out.joncs.push({
          bloc: b.bloc, type: b.type, rib: i, ribIndex: i - 1,
          lengthCm: j.length, points: j.points,
          // The group's four pocket widths, millimetres: what the rod's
          // pocket is cut from (lepStructure).
          pocket: g.sjo,
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

/**
 * A shark nose's two rods on one rib (rod type 3), as the program's
 * `joncst3s` and `joncst3i` build them. Its group gives four rows:
 *
 *   ex    upper rod: where it leaves the upper surface (front and back of the
 *         zone, % chord), how far it curves off it (% chord) and the exponent;
 *   ex2   upper rod's tail: the station on the lower nose where it leaves
 *         the section (% chord), the tail's length and rise (% chord) and
 *         its exponent;
 *   inn2  lower rod's head: the station on the intake where it starts, the
 *         head's length and rise, and its exponent;
 *   inn   lower rod: its zone along the lower surface, as `ex`.
 *
 * The UPPER rod runs from the back of its zone on the upper surface,
 * forward round the leading edge to the lower nose, where a tail leaves
 * the section and runs back into the cell — the intake's upper lip. The
 * LOWER rod starts with a head inside the nose, comes down to the intake,
 * and runs back along it and the lower surface to the back of its zone —
 * the lower lip. Each curves off the section across its zone as a type 1
 * rod does.
 *
 * Four things are the program's and kept: a tail's and a head's exponent
 * is the stated number times the chord over 100, as the program scales
 * it; the head's and tail's direction is taken with `atan`, not `atan2`
 * (which turns the tail away from the nose it would otherwise point at);
 * the upper rod keeps no point where its zone starts, the section point
 * after it overwriting it; and the lower rod ends on its zone's end in
 * place of the last section point before it.
 */
function lepSharkNoseRods(rib, g) {
  const { ex, ex2, inn2, inn } = g;
  if (![ex, ex2, inn2, inn].every((r) => Array.isArray(r) && r.length >= 4 && r.slice(0, 4).every(Number.isFinite))) {
    return null;
  }
  const c = rib.chord;
  const P = rib.section.points.map(([x, y]) => [x * c, y * c * rib.thickness]);
  const n = P.length;
  // 1-based, as the program counts.
  const U = [NaN, ...P.map((q) => q[0])];
  const V = [NaN, ...P.map((q) => q[1])];
  const interp = (x1, y1, x2, y2, x3) => {
    const m = (y2 - y1) / (x2 - x1);
    return m * x3 + (y2 - m * x2);
  };
  const pct = (v) => (v * c) / 100;
  const x1f = pct(ex[1]);
  const x1i = pct(ex[0]);
  const x2f = pct(inn[1]);
  const x2i = pct(inn[0]);
  const x3i = pct(ex2[0]);
  const x4i = pct(inn2[0]);
  // The tail and head: a curve y = b (x/a)^e from a station, turned to the
  // direction the program takes.
  const curve = (a, b, e, from, angle) => {
    const out = [];
    for (let k = 1; k <= 11; k++) {
      const xl = (a * (k - 1)) / 10;
      const yl = (b / a ** e) * xl ** e;
      out.push([Math.cos(angle) * xl - Math.sin(angle) * yl + from[0],
        Math.sin(angle) * xl + Math.cos(angle) * yl + from[1]]);
    }
    return out;
  };
  const length = (pts) => {
    let s = 0;
    for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    return s;
  };

  // The upper rod.
  let j1f; let j1i; let j3i; let p1f; let p3i;
  for (let j = 1; j <= n - 1; j++) {
    if (U[j] >= x1f && U[j + 1] < x1f && V[j] >= 0) { j1f = j; p1f = [x1f, interp(U[j + 1], V[j + 1], U[j], V[j], x1f)]; }
    if (U[j] >= x1i && U[j + 1] < x1i && V[j] >= 0) j1i = j;
    if (U[j] <= x3i && U[j + 1] > x3i && V[j] < 0) { j3i = j; p3i = [x3i, interp(U[j], V[j], U[j + 1], V[j + 1], x3i)]; }
  }
  if ([j1f, j1i, j3i].some((v) => v === undefined) || j3i - 2 < 1) return null;
  const X = new Map();
  X.set(j1f, p1f);
  for (let j = j1f + 1; j <= j3i; j++) X.set(j, [U[j], V[j]]);
  const tail = curve(pct(ex2[1]), pct(ex2[2]), pct(ex2[3]), p3i,
    Math.atan((V[j3i - 2] - p3i[1]) / (U[j3i - 2] - p3i[0])));
  tail.forEach((q, k) => X.set(j3i + k, q));
  const k1 = pct(ex[2]) / (x1f - x1i) ** ex[3];
  for (let j = j1i + 1; j >= j1f; j--) {
    const q = X.get(j);
    if (q) q[1] -= k1 * (q[0] - x1i) ** ex[3];
  }
  const upper = [];
  for (let j = j1f; j <= j3i + 10; j++) upper.push(X.get(j));

  // The lower rod.
  let j4i; let j2i; let j2f; let p4i; let p2i; let p2f;
  for (let j = 1; j <= n - 1; j++) {
    if (U[j] <= x4i && U[j + 1] > x4i && V[j] < 0) { j4i = j; p4i = [x4i, interp(U[j], V[j], U[j + 1], V[j + 1], x4i)]; }
    if (U[j] <= x2i && U[j + 1] > x2i && V[j] < 0) { j2i = j; p2i = [x2i, interp(U[j], V[j], U[j + 1], V[j + 1], x2i)]; }
    if (U[j] <= x2f && U[j + 1] >= x2f && V[j] < 0) { j2f = j; p2f = [x2f, interp(U[j], V[j], U[j + 1], V[j + 1], x2f)]; }
  }
  if ([j4i, j2i, j2f].some((v) => v === undefined) || j4i + 2 > n || j2f <= j4i) return null;
  const Y = new Map();
  for (let j = j4i; j <= j2i; j++) Y.set(j, [U[j], V[j]]);
  Y.set(j2i, p2i);
  for (let j = j2i + 1; j <= j2f; j++) Y.set(j, [U[j], V[j]]);
  Y.set(j2f, p2f);
  const k2 = pct(inn[2]) / (x2f - x2i) ** inn[3];
  for (let j = j2i + 2; j <= j2f; j++) {
    const q = Y.get(j);
    q[1] += k2 * (q[0] - x2i) ** inn[3];
  }
  const head = curve(pct(inn2[1]), -pct(inn2[2]), pct(inn2[3]), p4i,
    -Math.PI + Math.atan((V[j4i + 2] - p4i[1]) / (U[j4i + 2] - p4i[0]))).reverse();
  const lower = head.slice();
  for (let j = j4i + 1; j <= j2f; j++) lower.push(Y.get(j));
  if (upper.some((q) => !q) || lower.some((q) => !q)) return null;
  return {
    upper: { points: upper, length: length(upper) },
    lower: { points: lower, length: length(lower) },
  };
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

/* ------------------------------------------------------------ panels -- */

/** Section 6: the design's seam allowances, millimetres. */
export function lepSeamAllowances(doc) {
  const s = sectionData(doc, 6).map((l) => l.trim().split(/\s+/).map(Number));
  if (s.length < 4 || !s.slice(0, 4).every((r) => Number.isFinite(r[0]))) return null;
  return {
    upper: { side: s[0][0], front: s[0][1], back: s[0][2] },
    lower: { side: s[1][0], front: s[1][1], back: s[1][2] },
    rib: s[2][0],
    vrib: s[3][0],
  };
}

/**
 * How much wider than its cell each panel is cut: the design's skin tension.
 *
 * Section 31, the newer module, when the file switches it on, by groups of
 * ribs; otherwise section 5's six points for every rib. Each point is a
 * position along the panel and an over-width in per cent of the cell's own
 * width, added to EACH side: `{ upper: [[x, pct], ...], lower: [...] }` by
 * rib number, 1-based as the file numbers them.
 */
export function lepSkinTension(doc) {
  const rows = (n) => sectionData(doc, n).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/).map(Number));
  const s31 = rows(31);
  const byRib = new Map();
  let mode = 'classic';
  if (s31.length && s31[0][0] === 1) {
    mode = 'groups';
    const raw = sectionData(doc, 31).map((l) => l.trim()).filter(Boolean);
    const groups = lepCount(raw[1], 31, 'the number of groups', { min: 0, max: 999 });
    let p = 2;
    for (let g = 0; g < groups && p < s31.length; g++) {
      const [, from, to, count] = lepNumbers(raw[p], 31, `group ${g + 1}'s ribs and number of points`, 4);
      p += 1;
      for (let q = 0; q < count; q++) lepNumbers(raw[p + q], 31, `group ${g + 1}'s point ${q + 1}`, 5);
      const pts = s31.slice(p, p + count);
      p += count;
      const table = {
        upper: pts.map((r) => [r[1], r[2]]),
        lower: pts.map((r) => [r[3], r[4]]),
      };
      for (let i = from; i <= to; i++) byRib.set(i, table);
    }
  } else {
    // Section 5: a label line, then the six points.
    const pts = rows(5).filter((r) => r.length >= 4 && r.every(Number.isFinite)).slice(0, 6);
    const table = { upper: pts.map((r) => [r[0], r[1]]), lower: pts.map((r) => [r[2], r[3]]) };
    byRib.set('*', table);
  }
  return {
    mode,
    /** The table for a rib, by its 1-based number. */
    of(rib) {
      return byRib.get(rib) ?? byRib.get('*') ?? null;
    },
  };
}

/**
 * How each cell's air intake is closed: section 26's "glue vents", or, when
 * the file does not use them, section 2's open flag.
 *
 * By the number of the rib on the cell's outboard side, as the program keys
 * them: `{ type, p1, p2 }`. Type 4 is an intake whose front part the upper
 * panel closes, down to `1 - p/100` of the intake at the inboard (p1) and
 * outboard (p2) rib; -4 one whose rear part the lower panel closes, `p/100`
 * of it; -1 a cell closed altogether, the lower panel run forward over the
 * whole intake; 0 and 1 an open intake.
 */
export function lepVents(doc) {
  const rows = sectionData(doc, 26).map((l) => l.trim().split(/\s+/).map(Number));
  const byRib = new Map();
  if (rows.length && rows[0][0] === 1) {
    for (const r of rows.slice(1)) {
      if (!Number.isFinite(r[0]) || !Number.isFinite(r[1])) continue;
      byRib.set(r[0], { type: r[1], p1: Number.isFinite(r[2]) ? r[2] : 0, p2: Number.isFinite(r[3]) ? r[3] : 0 });
    }
    // The program sets the central cell's two sides alike.
    const first = byRib.get(1);
    if (first && Math.abs(first.type) >= 4) first.p2 = first.p1;
    return { mode: 'glue', of: (rib) => byRib.get(rib) ?? { type: 1, p1: 0, p2: 0 } };
  }
  for (const l of sectionData(doc, 2)) {
    const f = l.trim().split(/\s+/);
    const rib = Number(f[0]);
    const open = Number(f[4]);
    if (Number.isFinite(rib) && Number.isFinite(open)) byRib.set(rib, { type: open === 0 ? -1 : 1, p1: 0, p2: 0 });
  }
  return { mode: 'classic', of: (rib) => byRib.get(rib) ?? { type: 1, p1: 0, p2: 0 } };
}

/** Linear interpolation in a table of [x, y] points, ordered or not. */
function tableAt(table, x) {
  const t = table.slice().sort((a, b) => a[0] - b[0]);
  if (x <= t[0][0]) return t[0][1];
  for (let k = 1; k < t.length; k++) {
    if (x <= t[k][0] * 1.001) {
      const span = t[k][0] - t[k - 1][0];
      return span > 0 ? t[k - 1][1] + ((x - t[k - 1][0]) / span) * (t[k][1] - t[k - 1][1]) : t[k][1];
    }
  }
  return t[t.length - 1][1];
}

function cumulative(poly) {
  const out = [0];
  for (let k = 1; k < poly.length; k++) {
    out.push(out[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
  }
  return out;
}

/**
 * Each point of an edge moved out of the panel by `d[k]`, square to the
 * segment before it — the nearest that has a length, where the edge has
 * closed to a point.
 */
function offsetEdge(edge, other, d) {
  const real = (k) => Math.hypot(edge[k][0] - edge[k - 1][0], edge[k][1] - edge[k - 1][1]) > 1e-6;
  return edge.map((p, k) => {
    let j = Math.max(1, k);
    while (j > 1 && !real(j)) j--;
    while (j < edge.length - 1 && !real(j)) j++;
    const a = edge[j - 1];
    const b = edge[j];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    let nx = -ty / tl;
    let ny = tx / tl;
    // Out of the panel: away from the other edge.
    if (nx * (other[k][0] - p[0]) + ny * (other[k][1] - p[1]) > 0) { nx = -nx; ny = -ny; }
    return [p[0] + nx * d[k], p[1] + ny * d[k]];
  });
}

/**
 * Section 5's last row, `ndif xndif`, and its table's third row: how the
 * program makes each panel's sewing edges as long as the rib they are sewn
 * to (`ndif` 1000, its "perfect matching"), over what last part of each
 * edge (the row's per cent: upper, then lower), and how much of the
 * difference it takes up (`xndif`).
 */
export function lepSeamMatching(doc) {
  const rows = sectionData(doc, 5).map((l) => l.trim().split(/\s+/).map(Number))
    .filter((r) => r.length && r.every(Number.isFinite));
  const table = rows.filter((r) => r.length >= 4).slice(0, 6);
  const last = rows.filter((r) => r.length === 2).pop();
  if (table.length < 3 || !last) return null;
  return { ndif: last[0], xndif: last[1], upperPct: table[2][0], lowerPct: table[2][2] };
}

/**
 * Section 28: the program's table of how the risers and the calage change as
 * the speed system or the trimmers turn the wing (its 18.3, printed as its
 * output's section 7), reproduced as it computes it.
 *
 * In the plane of rib 1: its chord from the leading edge, the risers fixed
 * to it at section 28's positions, the pilot at the calage point a line
 * height below (section 8's lines, scaled with the wing, and risers). The
 * chord turns by each angle in turn about the last riser or the first; a
 * riser's change is how much its distance to the pilot changes, as the
 * program prints it — nearer less farther with the last riser held, farther
 * less nearer with the first — and the calage is where the line from the
 * pilot, turned with the wing, meets the chord, in per cent of it from where
 * the leading edge has gone. Four tables: the speed system's angles (section
 * 28's first pair, negative) about the last riser (a) and the first (b), the
 * trimmers' (its second pair) about the first (c) and the last (d).
 *
 * The leading edge it measures the calage from, about the last riser, is
 * taken at the last riser's per cent of the TIP rib's chord — an index left
 * over from a loop before it (rib(i,5), i past the last rib). 3.30 corrects
 * that in its table (a), not (d). The corrected table is given, whatever
 * program the file was written for; `version` gives an older program's, as
 * its own output printed it — `lepProgramVersion(doc)` the file's (3.29's is
 * not known, and taken as 3.30's). Centimetres and degrees.
 */
export function lepCalageVariation(doc, table, { version = LEP_PROGRAM_NEWEST } = {}) {
  const s = sectionData(doc, 28).map((l) => l.trim()).filter(Boolean);
  if (!s.length || parseInt(s[0], 10) !== 1 || s.length < 4) return null;
  const n = parseInt(s[1], 10);
  const p = s[2].split(/\s+/).map(Number).slice(0, n);
  const [a1, n1, a2, n2] = s[3].split(/\s+/).map(Number);
  const aoa = readAoA(doc);
  if (!aoa || !table?.ribs?.length || !(n >= 2) || p.length < n || !p.every(Number.isFinite)
    || !(n1 > 0) || !(n2 > 0)) return null;
  const c = table.ribs[0].chord;
  const cTip = table.ribs[table.ribs.length - 1].chord;
  const h = aoa.lineLengthCm * (table.scale ?? 1) + aoa.riserLengthCm;
  const pilot = [(aoa.calagePct * c) / 100, h];
  const dist = (x, y) => Math.hypot(pilot[0] - x, pilot[1] - y);
  const X = (pct) => (pct * c) / 100;
  const rad = Math.PI / 180;
  // The program's `xrxs`: where two lines, each through two points, cross.
  const cross = (ru, rv, su, sv) => {
    const mr = (rv[1] - rv[0]) / (ru[1] - ru[0]);
    const br = rv[0] - mr * ru[0];
    const ms = (sv[1] - sv[0]) / (su[1] - su[0]);
    const bs = sv[0] - ms * su[0];
    let u = (bs - br) / (mr - ms);
    let v = mr * u + br;
    if (Math.abs(su[1] - su[0]) <= 0.0001) { u = su[0]; v = mr * su[0] + br; }
    if (Math.abs(ru[1] - ru[0]) <= 0.0001) { u = ru[0]; v = ms * ru[0] + bs; }
    return [u, v];
  };
  const tableOf = (angle, steps, pivotLast, leChord) => {
    const rows = [];
    for (let j = 1; j <= steps + 1; j++) {
      const deg = (angle / steps) * (j - 1);
      const al = deg * rad;
      const risersCm = p.map((pk) => {
        const L0 = dist(X(pk), 0);
        if (pivotLast) {
          const hh = X(p[n - 1] - pk);
          return L0 - dist(X(pk) + hh - hh * Math.cos(al), hh * Math.sin(al));
        }
        const hh = X(pk - p[0]);
        return dist(X(p[0]) + hh * Math.cos(al), hh * Math.sin(al)) - L0;
      });
      const hh = X(p[n - 1] - p[0]);
      let ru; let rv; let le;
      if (pivotLast) {
        ru = [X(p[n - 1]), X(p[0]) + hh - hh * Math.cos(al)];
        rv = [0, -hh * Math.sin(al)];
        const pm = (p[n - 1] * leChord) / 100;
        le = [pm * (1 - Math.cos(al)), -pm * Math.sin(al)];
      } else {
        ru = [X(p[0]), X(p[0]) + hh * Math.cos(al)];
        rv = [0, hh * Math.sin(al)];
        le = [X(p[0]) * (1 - Math.cos(al)), -X(p[0]) * Math.sin(al)];
      }
      const t = al === 0 ? [pilot[0], 0]
        : cross(ru, rv, [pilot[0], pilot[0] + 100 * Math.tan(al)], [pilot[1], pilot[1] - 100]);
      rows.push({ alphaDeg: deg, risersCm, calagePct: (Math.hypot(t[0] - le[0], t[1] - le[1]) * 100) / c });
    }
    return rows;
  };
  return {
    risers: n, positionsPct: p, chordCm: c, heightCm: h, calagePct: aoa.calagePct,
    speedPivotLast: tableOf(a1, n1, true, version >= 3.29 ? c : cTip),
    speedPivotFirst: tableOf(a1, n1, false, c),
    trimPivotFirst: tableOf(a2, n2, false, c),
    trimPivotLast: tableOf(a2, n2, true, cTip),
  };
}

/**
 * The program's "perfect matching" of a surface's panels to its ribs (its
 * 8.2.4 above, 8.4.4 below, with `ndif` 1000), reproduced as it does it.
 *
 * Over-width moves a panel's sewing edge off the line it was developed
 * along, and so changes its length. The program then stretches the last
 * part of each edge — from where 85% of its length is left behind on the
 * upper surface (section 5's 15), the first 20% on the lower — about the
 * point where that part starts, so that the edge comes out exactly as long
 * as the rib's own contour; its output's section 6 prints the result, 0.000
 * mm. A stretched edge moves the end of the panel with it, and the end's
 * width with it; five times over, it then turns the left edge's stretched
 * part by the angle that would put the width back — `asin` of the width's
 * change over the part's length, always positive and applied as the
 * direction's absolute angle plus that angle, so it turns one way or the
 * other with the quadrant the segment points into, exactly as the program's
 * own code does.
 *
 * Its seam-allowance lines are worked out before this and not again: the
 * cut line's sides stay where the unstretched edges put them, and only the
 * panel's end — and a 3D-shaping cut inside the stretched part — moves.
 *
 * `edges` maps a panel's number to its two sewing edges as the program
 * indexes them (1-based, section points: the upper surface 1 at the
 * trailing edge to `np2` at the front, the lower `j0` at the front to
 * `np1`), centimetres; `contour` a rib's surface contour length by its
 * number. Edges are changed in place.
 */
function lepMatchSeams(edges, contour, ribCount, upper, lo, hi, pct, xndif) {
  const N = ribCount;
  const seg = (E, j) => Math.hypot(E[j + 1][0] - E[j][0], E[j + 1][1] - E[j][1]);
  const span = (E, a, b) => {
    let s = 0;
    for (let j = a; j <= b; j++) s += seg(E, j);
    return s;
  };
  const leftOf = (i) => edges.get(i - 1)?.R ?? null;   // the edge sewn to rib i from the panel inboard
  const rightOf = (i) => edges.get(i)?.L ?? null;      // and from the panel outboard
  const r30 = []; const r32 = []; const r90 = []; const r92 = [];
  for (let i = 1; i <= N; i++) {
    const a = leftOf(i);
    const b = rightOf(i);
    r30[i] = a ? span(a, lo, hi - 1) : NaN;
    r32[i] = b ? span(b, lo, hi - 1) : NaN;
    r90[i] = xndif * (contour[i] - r30[i]);
    r92[i] = xndif * (contour[i] - r32[i]);
  }
  r30[0] = r32[1]; r32[0] = r30[1];
  r90[0] = xndif * (contour[1] - r30[0]);
  r92[0] = xndif * (contour[1] - r32[0]);
  // Where each edge's stretched part starts.
  const jirl = []; const jirr = [];
  const start = (E, total) => {
    if (!E) return null;
    const keep = total * (pct / 100);
    let at = null;
    let s = 0;
    if (upper) {
      for (let j = lo; j <= hi - 1; j++) { s += seg(E, j); if (s < total - keep) at = j; }
    } else {
      for (let j = lo; j <= hi - 1; j++) { s += seg(E, j); if (s < keep) at = j; }
    }
    return at;
  };
  for (let i = 0; i <= N; i++) {
    jirl[i] = start(i === 0 ? null : leftOf(i), r30[i]);
    jirr[i] = start(rightOf(i), r32[i]);
  }
  jirl[0] = jirl[1]; jirr[0] = jirr[1];
  // The program's working arrays, kept from one pass to the next as its are.
  const ang = new Map(); const su = new Map(); const sv = new Map(); const dst = new Map();
  const fill = (E, j, k, omega) => {
    const xdv = E[k][1] - E[j][1];
    const xdu = E[k][0] - E[j][0];
    ang.set(j, (xdu !== 0 ? Math.abs(Math.atan(xdv / xdu)) : Math.PI / 2) + omega);
    let siu; let siv;
    if (xdu >= 0 && xdv >= 0) { siu = 1; siv = 1; }
    if (xdu <= 0 && xdv >= 0) { siu = -1; siv = 1; }
    if (xdu >= 0 && xdv <= 0) { siu = 1; siv = -1; }
    if (xdu <= 0 && xdv <= 0) { siu = -1; siv = -1; }
    su.set(j, siu); sv.set(j, siv);
    dst.set(j, Math.hypot(E[k][0] - E[j][0], E[k][1] - E[j][1]));
  };
  const step = (E, from, j, to, k) => {
    const d = k * dst.get(j);
    E[to] = [E[from][0] + su.get(j) * d * Math.cos(ang.get(j)), E[from][1] + sv.get(j) * d * Math.sin(ang.get(j))];
  };
  const stretch = (E, jFit, jDist, extraLen) => {
    if (!E || jFit == null || jDist == null) return;
    if (upper) {
      const dist2 = span(E, jDist, hi - 1);
      const k = (dist2 + extraLen) / dist2;
      for (let j = jFit; j <= hi - 1; j++) fill(E, j, j + 1, 0);
      for (let j = jFit; j <= hi - 1; j++) step(E, j, j, j + 1, k);
    } else {
      const dist2 = span(E, lo, jDist - 1);
      const k = (dist2 + extraLen) / dist2;
      for (let j = jFit; j >= lo + 1; j--) fill(E, j, j - 1, 0);
      for (let j = jFit; j >= lo + 1; j--) step(E, j, j, j - 1, k);
    }
  };
  // The ends' widths before.
  const endJ = upper ? hi : lo;
  const width = (i) => {
    const e = edges.get(i);
    return e ? Math.hypot(e.L[endJ][0] - e.R[endJ][0], e.L[endJ][1] - e.R[endJ][1]) : NaN;
  };
  const before = new Map([...edges.keys()].map((i) => [i, width(i)]));
  // Left side: the inboard panel's edge on each rib; right side: the outboard's.
  for (let i = 1; i <= N; i++) stretch(leftOf(i), jirl[i], jirl[i], r90[i]);
  for (let i = 0; i <= N; i++) stretch(rightOf(i), upper ? jirr[i] : jirl[i], jirr[i], r92[i]);
  // The end's width put back, five times over, by turning the left edge.
  for (let it = 0; it < 5; it++) {
    const now = new Map([...edges.keys()].map((i) => [i, width(i)]));
    for (let i = upper ? 1 : 2; i <= N - 1; i++) {
      const e = edges.get(i);
      if (!e || jirl[i] == null) continue;
      const E = e.L;
      const k1 = jirl[i];
      const dist = Math.hypot(E[k1][0] - E[endJ][0], E[k1][1] - E[endJ][1]);
      const eps = now.get(i) - before.get(i);
      const omega = Math.abs(eps) < 0.01 ? 0 : Math.asin(eps / dist) * Math.sign(eps);
      if (upper) {
        for (let j = k1; j <= hi - 1; j++) fill(E, j, j + 1, omega);
        for (let j = jirr[i]; j <= hi - 1; j++) step(E, j, j, j + 1, 1);
      } else {
        for (let j = k1; j >= lo + 1; j--) fill(E, j, j - 1, -omega);
        for (let j = k1; j >= lo + 1; j--) step(E, j, j, j - 1, 1);
      }
    }
  }
  return { jirl, jirr };
}

/**
 * Section 29, 3D shaping: where the program cuts a surface across, cell by
 * cell. Groups of ribs, each with up to two cuts across its upper panels
 * and one across its lower; a panel takes the group of the rib outboard of
 * it, as the program's does.
 *
 * Each cut row is `n j2 j3 k`. The panel is cut at section point `j3`,
 * counted as the program counts a surface's points (the upper from the
 * trailing edge, the lower from the intake). `j2` was to begin the zone
 * whose fullness `k` eases into the cut, but the program overwrites it —
 * a statement left live when its condition was commented out sets it to
 * the last point of the section for every rib — so the zone is always
 * empty, as the gnuC2-23's own output prints it (zone 1, 0.00). The ease
 * itself, `k` times the cell's billowed fullness, needs the program's
 * ovalization and is not reproduced: a cut with `k` other than 0 is said.
 *
 * Section 29's second form, cuts in per cent of chord, the program reads
 * and then never turns into points: said, not cut.
 */
export function lepShaping(doc) {
  const none = { mode: 0, cutsAt: () => [], notReproduced: [] };
  const s = sectionData(doc, 29).map((l) => l.trim()).filter((l) => l && !l.startsWith('*'));
  if (!s.length) return none;
  const mode = parseInt(s[0], 10);
  if (mode !== 1 && mode !== 2) return none;
  if (mode === 2) return { ...none, mode, notReproduced: ['3D shaping given in per cent of chord (section 29, form 2)'] };
  const f = (l) => l.split(/\s+/);
  let p = 2;
  const ng = parseInt(f(s[p++] ?? '')[1], 10);
  if (!Number.isInteger(ng) || ng < 1) return none;
  const groups = new Map();
  const ribGroup = new Map();
  const notReproduced = new Set();
  for (let g = 1; g <= ng && p < s.length; g++) {
    const [, k, from, to] = f(s[p++]).map(Number);
    const up = f(s[p++] ?? '').map(Number);
    const upper = [];
    for (let c = 0; c < (up[1] || 0); c++) {
      const r = f(s[p++] ?? '').map(Number);
      upper.push({ at: r[2], ease: r[3] });
    }
    const low = f(s[p++] ?? '').map(Number);
    const lower = [];
    for (let c = 0; c < (low[1] || 0); c++) {
      const r = f(s[p++] ?? '').map(Number);
      lower.push({ at: r[2], ease: r[3] });
    }
    for (const c of [...upper, ...lower]) {
      if (c.ease) notReproduced.add('the ease section 29 eases into a 3D-shaping cut');
    }
    groups.set(k, { upper, lower });
    for (let i = from; i <= to; i++) ribGroup.set(i, k);
  }
  return {
    mode,
    /** The cut points of the panel between rib `outer - 1` and rib `outer` on `surface`. */
    cutsAt: (outer, surface) => {
      const g = groups.get(ribGroup.get(outer));
      return g ? g[surface].map((c) => c.at).filter((j) => Number.isInteger(j) && j > 1) : [];
    },
    notReproduced: [...notReproduced],
  };
}

/**
 * The design's own panels, as its program cuts them.
 *
 * Three things the tool's own panels do differently, each the program's
 * and not a choice:
 *
 * - **Where the surfaces part.** The upper panel (the extrados) runs from
 *   the trailing edge over the top, round the nose and down to where the
 *   intake opens; the lower (the intrados) from where it closes to the
 *   trailing edge. The opening between is no panel's.
 * - **How much wider than its cell a panel is cut** — the design's skin
 *   tension, so the sail can billow (`lepSkinTension`). Over-width at each
 *   point, per side, is the table's per cent of the cell's width at the
 *   middle point of that surface, at a position along the edge: from the
 *   front end on the upper panel, from the trailing edge on the lower — the
 *   program measures the two from opposite ends — and on the lower panel's
 *   right edge it is the NEXT cell's width the per cent is of. Every edge
 *   point moves out square to the segment before it, as its `puntslat`
 *   moves them.
 * - **Its own seam allowances** (`lepSeamAllowances`): the sides, the front
 *   end and the trailing-edge end of each surface.
 * - **Its own intakes** (`lepVents`): where a cell's intake is partly or
 *   wholly closed, the panel that closes it runs on over the intake, the
 *   upper one down from its front or the lower one forward from its rear,
 *   to where the design says at each rib.
 *
 * Returns, for each cell of the half wing and each surface, the developed
 * sewing outline (`panel`: left and right edges, front first, metres) and
 * the cut outline with its allowances (`cut`), and both areas.
 */
export function lepPanels(doc, table) {
  const ribs = table.ribs;
  const skin = lepSkinTension(doc);
  const vents = lepVents(doc);
  const shaping = lepShaping(doc);
  const allow = lepSeamAllowances(doc) ?? {
    upper: { side: 0, front: 0, back: 0 }, lower: { side: 0, front: 0, back: 0 },
  };
  const out = [];
  const problems = [];

  // One surface of one rib in 3D, metres, front end first. A mirrored rib
  // is the rib on the other side of the centreline.
  const at3 = (rib, q) => {
    const p = lepRibPoint(rib.of ?? rib, rib.chord * q[0], rib.chord * q[1] * rib.thickness).map((v) => v / 100);
    if (rib.mirror) p[0] = -p[0];
    return p;
  };
  const surfaceOf = (rib, surface) => {
    const s = rib.section;
    const P = s.points;
    const idx = [];
    if (surface === 'upper') {
      for (let j = s.extrados - 1; j >= 0; j--) idx.push(j);
    } else {
      for (let j = s.extrados + s.intake - 2; j < P.length; j++) idx.push(j);
    }
    return idx.map((j) => at3(rib, P[j]));
  };
  // Points along a rib's intake, from where it opens (0) to where it closes
  // (1), at `count` fractions of its length between `from` and `to`.
  const intakeRun = (rib, from, to, count) => {
    const s = rib.section;
    const run = s.points.slice(s.extrados - 1, s.extrados + s.intake - 1);
    const d = [0];
    for (let k = 1; k < run.length; k++) {
      d.push(d[k - 1] + Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]));
    }
    const total = d[d.length - 1] || 1;
    const alongIntake = (f) => {
      const target = f * total;
      let k = 1;
      while (k < run.length - 1 && d[k] < target) k++;
      const g = (target - d[k - 1]) / ((d[k] - d[k - 1]) || 1);
      return [run[k - 1][0] + g * (run[k][0] - run[k - 1][0]), run[k - 1][1] + g * (run[k][1] - run[k - 1][1])];
    };
    const out = [];
    for (let k = 0; k < count; k++) out.push(at3(rib, alongIntake(from + ((to - from) * k) / Math.max(1, count - 1))));
    return out;
  };
  // How far a panel runs on over a cell's intake, as a fraction of the
  // intake at each of its ribs: the upper from where the intake opens, the
  // lower from where it closes.
  const overIntake = (cellRight, surface) => {
    const v = vents.of(cellRight);
    if (surface === 'upper') {
      return v.type >= 4 && v.type <= 6 ? [1 - v.p1 / 100, 1 - v.p2 / 100] : [0, 0];
    }
    if (v.type === -1) return [1, 1];
    // Closed on a diagonal: over the whole intake at the outer rib (-2) or
    // the inner (-3) and none of it at the other, its front edge the
    // straight line between (the program's `dpanelcm2`, `dpanelcm3`).
    if (v.type === -2) return [0, 1];
    if (v.type === -3) return [1, 0];
    return v.type <= -4 && v.type >= -6 ? [v.p1 / 100, v.p2 / 100] : [0, 0];
  };
  const unread = new Set();
  // The width the over-width is a per cent of: the cell at the middle point
  // of the surface, as the program numbers its points.
  const midIndex = (s, surface) => (surface === 'upper'
    ? (s.extrados - 1) - (Math.trunc(s.extrados / 2) - 1)
    : (Math.trunc((s.extrados + s.intake - 1 + s.points.length) / 2) - 1) - (s.extrados + s.intake - 2));

  // A design with a cell on the centreline, rather than a rib, has one more
  // panel: between its first rib and that rib's mirror, cut once.
  // The program's own test: a first rib at 0.01 or more along the span,
  // before the wing is scaled (its `cencell`). Not the rib's projected
  // position, which the program moves 0.01 off the centreline itself.
  const centre = ribs.length && ribs[0].section && ribs[0].x / (table.scale || 1) >= 0.01;
  const pairs = [];
  if (centre) pairs.push([{ ...ribs[0], of: ribs[0], mirror: true }, ribs[0], 0]);
  for (let i = 0; i < ribs.length - 1; i++) pairs.push([ribs[i], ribs[i + 1], i + 1]);

  const developed = [];
  for (const [a, b, cellNo] of pairs) {
    if (!a.section || !b.section || a.section.points.length !== b.section.points.length) {
      problems.push(`cell ${cellNo}: its ribs have no section, or different ones`);
      developed.push(null);
      continue;
    }
    // Ribs and rows are numbered from 1, the cell by the rib inboard of it.
    const cell = { cellNo, centre: cellNo === 0 };
    const vent = vents.of(cellNo + 1);
    if (Math.abs(vent.type) === 5 || Math.abs(vent.type) === 6) {
      unread.add(vent.type);
    }
    for (const surface of ['upper', 'lower']) {
      let L = surfaceOf(a, surface);
      let R = surfaceOf(b, surface);
      // Run on over the intake, ahead of the panel's own front end.
      const [fa, fb] = overIntake(cellNo + 1, surface);
      const extra = fa > 0 || fb > 0 ? a.section.intake : 0;
      if (extra) {
        const K = extra;
        const ext = (rib, f) => (surface === 'upper'
          ? intakeRun(rib, 0, f, K + 1).slice(1).reverse()
          : intakeRun(rib, 1 - f, 1, K + 1).slice(0, K));
        L = ext(a, fa).concat(L);
        R = ext(b, fb).concat(R);
      }
      // Developed in the program's own order, as its `flatt` lays a strip
      // out: the upper surface from the trailing edge forward, the lower
      // from the intake back. The strip's far edge takes up the surface's
      // twist step by step from where it starts, so the order is not
      // indifferent on a twisted cell, and the program's seam matching
      // below works in the frame this leaves.
      const dev = surface === 'upper'
        ? (() => {
          const d = developPanel(L.slice().reverse(), R.slice().reverse());
          return { ...d, left: d.left.slice().reverse(), right: d.right.slice().reverse() };
        })()
        : developPanel(L, R);
      const m = midIndex(a.section, surface) + extra;
      cell[surface] = {
        dev, extra, width: Math.hypot(dev.right[m][0] - dev.left[m][0], dev.right[m][1] - dev.left[m][1]),
      };
    }
    developed.push(cell);
  }

  // The sewing edges: each cell's developed edges moved out by its skin
  // tension.
  for (let i = 0; i < developed.length; i++) {
    const cell = developed[i];
    if (!cell) continue;
    for (const surface of ['upper', 'lower']) {
      const { dev, width, extra } = cell[surface];
      const tLeft = skin.of(Math.max(1, cell.cellNo))?.[surface];
      const tRight = skin.of(cell.cellNo + 1)?.[surface];
      // The lower panel's right edge: the next cell's width, as the program has it.
      const widthRight = surface === 'lower' ? (developed[i + 1]?.lower.width ?? width) : width;
      // Measured along the panel's own surface, from its own front end: the
      // run over the intake ahead of it takes the value at that end.
      const over = (edge, tab, w) => {
        if (!tab || !tab.length) return edge.map(() => 0);
        const own = edge.slice(extra);
        const s = cumulative(own);
        const L = s[s.length - 1] || 1;
        const v = s.map((d) => {
          const x = surface === 'upper' ? (100 * d) / L : 100 * (1 - d / L);
          return (w * tableAt(tab, x)) / 100;
        });
        return edge.slice(0, extra).map(() => v[0]).concat(v);
      };
      const vL = over(dev.left, tLeft, width);
      const vR = over(dev.right, tRight, widthRight);
      cell[surface].sewL = offsetEdge(dev.left, dev.right, vL);
      cell[surface].sewR = offsetEdge(dev.right, dev.left, vR);
    }
  }

  // The program's perfect matching: each sewing edge stretched over its
  // last part to the length of the rib it is sewn to, the panel's end
  // moving with it (`lepMatchSeams`). Its ends only: the cut line's sides
  // stay on the edges as they were.
  const matching = lepSeamMatching(doc);
  const matched = matching && matching.ndif === 1000 && ribs.every((r) => r.section);
  if (matching && matching.ndif !== 1000) unread.add(`seam matching ${matching.ndif}`);
  for (const surface of ['upper', 'lower']) {
    const s0 = ribs[0]?.section;
    if (!matched || !s0) break;
    const upper = surface === 'upper';
    const lo = upper ? 1 : s0.extrados + s0.intake - 1;
    const hi = upper ? s0.extrados : s0.points.length;
    // Program index j to this panel's index k, front first, after the run-on.
    const kOf = (extra, j) => extra + (upper ? hi - j : j - lo);
    const edges = new Map();
    for (const cell of developed) {
      if (!cell) continue;
      const { sewL, sewR, extra } = cell[surface];
      const L = []; const R = [];
      for (let j = lo; j <= hi; j++) {
        const k = kOf(extra, j);
        L[j] = [sewL[k][0] * 100, sewL[k][1] * 100];
        R[j] = [sewR[k][0] * 100, sewR[k][1] * 100];
      }
      edges.set(cell.cellNo, { L, R });
    }
    const contour = [];
    for (let i = 1; i <= ribs.length; i++) {
      const r = ribs[i - 1];
      let t = 0;
      for (let j = lo; j < hi; j++) {
        const [x1, y1] = r.section.points[j - 1];
        const [x2, y2] = r.section.points[j];
        t += Math.hypot((x2 - x1) * r.chord, (y2 - y1) * r.chord * r.thickness);
      }
      contour[i] = t;
    }
    lepMatchSeams(edges, contour, ribs.length, upper, lo, hi,
      upper ? matching.upperPct : matching.lowerPct, matching.xndif);
    for (const cell of developed) {
      if (!cell) continue;
      const c = cell[surface];
      const e = edges.get(cell.cellNo);
      c.matchL = c.sewL.map((q) => q.slice());
      c.matchR = c.sewR.map((q) => q.slice());
      for (let j = lo; j <= hi; j++) {
        const k = kOf(c.extra, j);
        c.matchL[k] = [e.L[j][0] / 100, e.L[j][1] / 100];
        c.matchR[k] = [e.R[j][0] / 100, e.R[j][1] / 100];
      }
      // A run-on over the intake goes with the panel's end, as the program
      // attaches its vent to it: turned and moved, not stretched.
      if (c.extra) {
        const k0 = c.extra;
        const [a0, b0] = [c.sewL[k0], c.sewR[k0]];
        const [a1, b1] = [c.matchL[k0], c.matchR[k0]];
        const turn = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
        const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
        const m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
        const move = (q) => {
          const x = q[0] - m0[0];
          const y = q[1] - m0[1];
          return [m1[0] + x * Math.cos(turn) - y * Math.sin(turn), m1[1] + x * Math.sin(turn) + y * Math.cos(turn)];
        };
        for (let k = 0; k < k0; k++) {
          c.matchL[k] = move(c.sewL[k]);
          c.matchR[k] = move(c.sewR[k]);
        }
      }
    }
  }

  // The cut line of a piece: its sides the sewing edges moved out by the
  // side allowance, its ends the matched ends moved out by theirs — each
  // corner where the end's line meets the side's last segment, as the
  // program's `extpoints` puts it.
  const cutOf = (L, R, Lm, Rm, A, dFront, dBack) => {
    const m = L.length;
    const ring = L.concat(R.slice().reverse());
    const d = ring.map((_, k) => (k < m - 1 ? A.side : k === m - 1 ? dBack : k < 2 * m - 1 ? A.side : dFront));
    const c = offsetOutline(ring, d.map((mm) => mm / 1000));
    if (Lm && Rm) {
      const line = (p, q, dist, away) => {
        // The line through p and q moved `dist` to the side away from `away`.
        const tx = q[0] - p[0];
        const ty = q[1] - p[1];
        const tl = Math.hypot(tx, ty) || 1;
        let nx = -ty / tl;
        let ny = tx / tl;
        if (nx * (away[0] - p[0]) + ny * (away[1] - p[1]) > 0) { nx = -nx; ny = -ny; }
        return { p: [p[0] + nx * dist, p[1] + ny * dist], t: [tx / tl, ty / tl] };
      };
      const meet = (l1, l2, fallback) => {
        const den = l1.t[0] * l2.t[1] - l1.t[1] * l2.t[0];
        if (Math.abs(den) < 1e-12) return fallback;
        const s = ((l2.p[0] - l1.p[0]) * l2.t[1] - (l2.p[1] - l1.p[1]) * l2.t[0]) / den;
        return [l1.p[0] + s * l1.t[0], l1.p[1] + s * l1.t[1]];
      };
      const ds = A.side / 1000;
      // Out of the piece: away from its middle (a closure on a diagonal has
      // a side of no length at one rib, so a point beside the end will not do).
      const h = Math.floor(m / 2);
      const mid = [(L[h][0] + R[h][0]) / 2, (L[h][1] + R[h][1]) / 2];
      const front = line(Lm[0], Rm[0], dFront / 1000, mid);
      const back = line(Lm[m - 1], Rm[m - 1], dBack / 1000, mid);
      // A side's first and last segments of any length: where an intake
      // closure runs on at one rib only, that side's end is a run of points
      // a hair apart, and their direction is noise.
      const real = (E, k, dir) => {
        let j = k;
        while (j + dir >= 0 && j + dir < m && Math.hypot(E[j + dir][0] - E[k][0], E[j + dir][1] - E[k][1]) < 1e-6) j += dir;
        return j + dir >= 0 && j + dir < m ? j + dir : k + dir;
      };
      const sideL0 = line(L[0], L[real(L, 0, 1)], ds, R[0]);
      const sideR0 = line(R[0], R[real(R, 0, 1)], ds, L[0]);
      const sideL1 = line(L[real(L, m - 1, -1)], L[m - 1], ds, R[m - 1]);
      const sideR1 = line(R[real(R, m - 1, -1)], R[m - 1], ds, L[m - 1]);
      c[0] = meet(sideL0, front, c[0]);
      c[2 * m - 1] = meet(sideR0, front, c[2 * m - 1]);
      c[m - 1] = meet(sideL1, back, c[m - 1]);
      c[m] = meet(sideR1, back, c[m]);
    }
    return { ring, c, m };
  };

  for (let i = 0; i < developed.length; i++) {
    const cell = developed[i];
    if (!cell) continue;
    for (const surface of ['upper', 'lower']) {
      const { dev, width, extra, sewL, sewR } = cell[surface];
      const matchL = cell[surface].matchL ?? null;
      const matchR = cell[surface].matchR ?? null;
      const A = allow[surface];
      // The cut line: every edge of the sewing outline moved out by its own
      // allowance — the sides, the front end (round an intake it closes, the
      // edge across the intake) and the trailing edge — corners mitred.
      const sewing = sewL.concat(sewR.slice().reverse());
      const n = sewL.length;
      const whole = cutOf(sewL, sewR, matchL, matchR, A, A.front, A.back);
      const cut = whole.c;
      // 3D shaping (section 29): the panel cut across at its points, each
      // piece with the side allowance along the cut, as the program gives
      // it, and its own front or trailing-edge allowance at the other end.
      const s = (cell.cellNo === 0 ? ribs[0] : ribs[cell.cellNo - 1]).section;
      const first = surface === 'upper' ? s.extrados : s.extrados + s.intake - 1;
      const cutAt = shaping.cutsAt(cell.cellNo + 1, surface)
        .map((j) => extra + (surface === 'upper' ? first - j : j - first))
        .filter((k) => k > 0 && k < n - 1)
        .sort((a, b) => a - b);
      let pieces = null;
      if (cutAt.length) {
        const bounds = [0, ...cutAt, n - 1];
        const names = bounds.length === 3 ? ['front', 'rear'] : ['front', 'middle', 'rear'];
        pieces = names.map((part, q) => {
          const a = bounds[q];
          const b = bounds[q + 1];
          const L = sewL.slice(a, b + 1);
          const R = sewR.slice(a, b + 1);
          const { ring, c, m } = cutOf(L, R, matchL?.slice(a, b + 1), matchR?.slice(a, b + 1), A,
            q === 0 ? A.front : A.side, q === names.length - 1 ? A.back : A.side);
          return {
            part, from: a, to: b,
            sewing: { left: L, right: R },
            cut: { left: c.slice(0, m), right: c.slice(m).reverse() },
            areaM2: shoelace(ring),
            cutAreaM2: shoelace(c),
          };
        });
      }
      out.push({
        cell: cell.cellNo,
        ...(cell.centre ? { centre: true } : {}),
        surface,
        // The sewing outline: what the tool's own panels are, with the cut
        // line round it — or, cut across by 3D shaping, round each piece.
        panel: {
          left: sewL, right: sewR, seamLengths: dev.seamLengths,
          cut: { left: cut.slice(0, n), right: cut.slice(n).reverse() },
          ...(matchL ? { matched: { left: matchL, right: matchR } } : {}),
          ...(pieces ? { pieces } : {}),
        },
        developed: dev,
        cut,
        ...(pieces ? { pieces } : {}),
        widthM: width,
        areaM2: shoelace(sewing),
        developedAreaM2: shoelace(dev.left.concat(dev.right.slice().reverse())),
        cutAreaM2: pieces ? pieces.reduce((t, x) => t + x.cutAreaM2, 0) : shoelace(cut),
      });
    }
  }

  const sum = (surface, key) => out.filter((p) => p.surface === surface).reduce((t, p) => t + p[key], 0);
  return {
    ok: problems.length === 0,
    problems,
    panels: out,
    skin: skin.mode,
    vents: vents.mode,
    // Intake closures drawn as a straight edge where the design has an arc
    // or an ellipse, or a shape this does not draw at all.
    notReproduced: [...unread].map((t) => `intake type ${t}`).concat(shaping.notReproduced),
    allowances: allow,
    // One side of the wing.
    totals: {
      upper: { developedM2: sum('upper', 'developedAreaM2'), sewnM2: sum('upper', 'areaM2'), cutM2: sum('upper', 'cutAreaM2') },
      lower: { developedM2: sum('lower', 'developedAreaM2'), sewnM2: sum('lower', 'areaM2'), cutM2: sum('lower', 'cutAreaM2') },
    },
  };
}

/**
 * A closed outline with each edge moved out by its own distance: `d[k]` for
 * the edge from point k to the next. Each corner goes where the offsets of
 * the edges either side of it meet — passing over edges of no length, where
 * a panel's edge has closed to a point — held to four times the larger
 * distance on a corner too sharp to mitre. One point out for each point in,
 * so the edges can be split apart again.
 */
function offsetOutline(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  const sgn = area > 0 ? 1 : -1;     // outward is to the right of a counter-clockwise walk
  const edges = pts.map((a, k) => {
    const b = pts[(k + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // An edge of a micron or less is an edge that has closed to a point:
    // where a panel runs over an intake at one rib and not the other, its
    // edge on the other is a run of points the development leaves a hair
    // apart, and their directions are noise.
    if (len < 1e-6) return null;
    const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return { p: [a[0] + sgn * t[1] * d[k], a[1] - sgn * t[0] * d[k]], t, d: d[k] };
  });
  if (edges.every((e) => !e)) return pts.slice();
  return pts.map((pk, k) => {
    let ia = (k - 1 + n) % n;
    while (!edges[ia]) ia = (ia - 1 + n) % n;
    let ib = k;
    while (!edges[ib]) ib = (ib + 1) % n;
    const A = edges[ia];
    const B = edges[ib];
    const den = A.t[0] * B.t[1] - A.t[1] * B.t[0];
    // B.p is the offset of B's first point, which is this one or a copy of it.
    let q = B.p;
    if (Math.abs(den) > 1e-9) {
      const s = ((B.p[0] - A.p[0]) * B.t[1] - (B.p[1] - A.p[1]) * B.t[0]) / den;
      q = [A.p[0] + s * A.t[0], A.p[1] + s * A.t[1]];
    }
    const lim = 4 * Math.max(A.d, B.d);
    const off = Math.hypot(q[0] - pk[0], q[1] - pk[1]);
    if (off > lim && off > 0) q = [pk[0] + ((q[0] - pk[0]) * lim) / off, pk[1] + ((q[1] - pk[1]) * lim) / off];
    return q;
  });
}

function shoelace(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a / 2);
}

/**
 * How many sides the program draws an ellipse with. 3.30 draws 60, or what
 * section 37's code 3002 says (the Swoop2's 55); 3.28 and 3.25 drew 39, and
 * read no code 3002 — the gnuC2-23's and the Tuluaq's cutting files have
 * theirs so. Which program is the file's header's (`lepProgramVersion`), or
 * `version`. 3.29's is not known, and taken as 3.30's.
 */
export function lepEllipseSides(doc, { version = lepProgramVersion(doc) } = {}) {
  if (version < 3.29) return 39;
  let sides = 60;
  const s37 = sectionData(doc, 37).map((l) => l.trim()).filter(Boolean);
  if (s37.length && parseInt(s37[0], 10) === 1) {
    for (const l of s37.slice(2)) {
      const f = l.split(/\s+/);
      if (f[0] === '3002' && Number(f[1]) > 2) sides = Math.round(Number(f[1]));
    }
  }
  return sides;
}

/**
 * A rib's cutting line as the program draws it (its 6.11, the same from 3.25
 * to 3.30): every point of the section, at its own thickness, moved out by
 * the rib's seam allowance along the mean of the angles of the segments
 * either side of it, to the side its height above the chord line says — and
 * down from the intake on — the leading-edge point straight forward, the two
 * trailing-edge points along their one segment's normal, and the line closed
 * through the trailing edge itself. `rib` is a `lepRibTable` rib (cm), the
 * allowance in millimetres (section 6); the line comes back in the rib's
 * section coordinates, metres, like `lepHoles`.
 *
 * It is not an offset curve, which is what was drawn instead: a point moves
 * by the allowance, not its edges, and the trailing edge is notched to the
 * sewing point rather than carried out to a mitred corner, whose 3 cm spike
 * put 2 to 3 cm2 on every rib — 0.03% at the root, 0.35% on the gnuC2-23's
 * rib 30 and 2.5% on the Swoop2's tip. This is every rib of all three
 * designs' cutting files to 0.002%.
 *
 * A flat rib — the gnuC2-23's tip, section 30's 0.0 — has every point on
 * the chord line, which the program reads as the upper side as far as the
 * intake: its line runs out to the nose and back on itself, and the strip
 * it encloses starts at the intake. That is what the program draws, and it
 * is drawn here so.
 */
export function lepRibCutLine(rib, allowanceMm) {
  const xcos = allowanceMm / 10;
  const P = rib.section.points.map(([x, y]) => [x * rib.chord, y * rib.chord * rib.thickness]);
  const n = P.length;
  const np2 = rib.section.extrados;
  const u = (j) => P[j - 1][0];
  const v = (j) => P[j - 1][1];
  // Its angles are atan of a slope, not atan2: a vertical segment is +-90
  // degrees whichever way it runs, which is what turns its mean the right way.
  const slope = (a, b) => Math.atan((v(b) - v(a)) / (u(b) - u(a)));
  const out = [];
  for (let j = 1; j <= n; j++) {
    const al = j === 1 ? slope(1, 2)
      : j === n ? slope(n - 1, n)
        : 0.5 * (slope(j, j + 1) + slope(j - 1, j));
    const up = [u(j) - xcos * Math.sin(al), v(j) + xcos * Math.cos(al)];
    const down = [u(j) + xcos * Math.sin(al), v(j) - xcos * Math.cos(al)];
    let q;
    if (j === 1) q = v(j) >= 0 ? up : down;
    else if (j === n) q = v(j) > 0 ? up : down;
    else if (u(j) === 0) q = [u(j) - xcos, v(j)];
    else q = v(j) < 0 || j >= np2 ? down : up;
    // Two coincident points make a 0/0 slope, which the program would draw
    // to nowhere: there is no point to cut to there.
    if (Number.isFinite(q[0]) && Number.isFinite(q[1])) out.push(q);
  }
  out.push([u(n), v(n)]);
  return out.map(([a, b]) => [a / 100, b / 100]);
}

/**
 * Section 4, the lightening holes, per rib — the design's own, rather than
 * the ones this tool would generate. Type 1 is an ellipse: centre, semi-axes
 * and rotation, all in percent of chord. Other types are reported, not drawn.
 * Returns holes in the rib's section coordinates, metres.
 *
 * Each is the program's polygon (its subroutine `ellipse`), `sides` long:
 * as the file's own program drew it (`lepEllipseSides`) — 39 sides for the
 * Tuluaq's 3.25 and the gnuC2-23's 3.28, the Swoop2's 55 for its 3.30. They
 * were 48-sided, 0.15% off every hole of both older designs' cutting files.
 *
 * The rotation is read as degrees, turned from the chord line toward the
 * upper surface. The program hands the number to its ellipse as radians, in
 * a drawing whose vertical runs down; no design here turns a hole, and one
 * that does is said, not drawn the program's way.
 */
export function lepHoles(doc, table, { sides = lepEllipseSides(doc) } = {}) {
  const s = sectionData(doc, 4).map((l) => l.trim()).filter(Boolean);
  const out = { byRib: new Map(), notReproduced: [], sides };
  if (!s.length) return out;
  let groups;
  try { groups = lepCount(s[0], 4, 'the number of groups of holes', { min: 0, max: 999 }); } catch (e) {
    if (!(e instanceof LepReadError)) throw e;
    out.notReproduced.push(`holes not read: ${e.message}`);
    return out;
  }
  let p = 1;
  for (let m = 0; m < groups && p < s.length; m++) {
    let r1; let r2; let holes;
    try {
      r1 = lepCount(s[p++], 4, `group ${m + 1}'s first rib`, { min: 1, max: 999 });
      r2 = lepCount(s[p++], 4, `group ${m + 1}'s last rib`, { min: 1, max: 999 });
      const n = lepCount(s[p++], 4, `group ${m + 1}'s number of holes`, { min: 0, max: 99 });
      holes = [];
      for (let k = 0; k < n; k++) holes.push(lepNumbers(s[p++], 4, `group ${m + 1}'s hole ${k + 1}`, 1));
    } catch (e) {
      if (!(e instanceof LepReadError)) throw e;
      out.notReproduced.push(`holes from group ${m + 1} on not read: ${e.message}`);
      break;
    }
    for (let i = r1; i <= r2; i++) {
      const rib = table.ribs[i - 1];
      if (!rib) continue;
      const c = rib.chord / 100;
      const list = [];
      for (const h of holes) {
        if (h[0] !== 1) { out.notReproduced.push(`rib ${i}: hole type ${h[0]}`); continue; }
        const [, x, y, a, b, rotDeg] = h;
        if (rotDeg && !out.notReproduced.some((m) => /hole rotation/.test(m))) {
          out.notReproduced.push(`hole rotation (rib ${i}: ${rotDeg}), read as degrees; the program's drawing takes it as radians`);
        }
        const t = (rotDeg * Math.PI) / 180;
        const outline = [];
        for (let q = 0; q <= sides; q++) {
          const w = (2 * Math.PI * q) / sides;
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
