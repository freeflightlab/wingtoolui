/* lepbalance.js — what a LEparagliding design's program prints about the
 * wing as a whole: the figures of its output's section 1 beyond the areas
 * and spans, and the longitudinal balance of its section 17, solved from the
 * design's section 35.
 *
 * Both are reproduced as the program computes them (3.25 to 3.30, whose
 * code here is the same), and checked against the three designs' own
 * outputs: section 1 on all three, section 17 on the gnuC2-23, the one of
 * them that asks for it. Every figure the gnuC2-23's section 17 prints comes
 * out to its last digit, the 95 lines' table of drag included.
 *
 * ---------------------------------------------------------------------------
 * The program's balance is the handbook's, with every force where it acts
 * ---------------------------------------------------------------------------
 * Chapter 4 of the handbook balances moments about the leading edge of the
 * central section, with the forces placed by rule: line drag a third of the
 * way down, line weight half way, the wing's weight a third of the way back
 * along the chord, the pilot at the karabiners. The program — the same
 * author's — takes moments about the centre of pressure and puts each force
 * at a point it computes, in the plane of the central section:
 *
 *   - the wing's mass at the chord-weighted mean of every rib's point at 36%
 *     of its chord (section 37's code 1146 moves it), at the rib's height in
 *     the arc: the gnuC2-23's is 0.89 m below the nose, not on the chord;
 *   - the lines' weight at their own mass centre, line by line, and their
 *     drag at their own drag centre — 3.42 m down on the gnuC2-23, 47% of the
 *     way to the karabiners, where the handbook puts 33%;
 *   - each line's drag from its own Reynolds number: Cd = 1 + 10 Re^(-2/3),
 *     the cylinder correlation the program cites from De Villiers' HEGALA
 *     report (White's), 1.04 for a 5 mm riser and 1.10 for a 1.15 mm line at
 *     12.4 m/s; a webbing riser is 1.98;
 *   - the pilot's mass and drag at a point the design says (`Pmc`) below the
 *     karabiners, hanging plumb;
 *   - the aerodynamic force through a centre of pressure given in both
 *     coordinates, so its height in the arc counts.
 *
 * The quick links are counted in the weight but not in the moments, as the
 * program has it.
 *
 * ---------------------------------------------------------------------------
 * Its solve is meant to be iterated, and the gnuC2-23's was not
 * ---------------------------------------------------------------------------
 * Method 1 (the default; section 37's 1351 picks another) takes the speed
 * the designer estimates, puts the wing's typed lift and drag coefficients
 * at it, and finds the glide angle and a factor k on the wing's forces that
 * satisfy both force balances — by brute force, on a grid of 0.005 radians
 * and then of 0.0016, which is why its k1 and k2 never quite agree. A k of 1
 * says the typed coefficients balance at the typed speed. The program warns
 * that the result is for information and to "iterate initial values until
 * convergence"; the gnuC2-23 was left at k = 0.578, so its printed 44.56 km/h
 * and glide of 6.13 are the wing at 58% of the lift it was given.
 *
 * `converged` is the same equations at the speed where k is 1, solved
 * exactly rather than on the grid: the state the program's own instruction
 * leads to. On the gnuC2-23 that is 33.97 km/h and a glide of 8.27.
 *
 * ---------------------------------------------------------------------------
 * Where the printed figures slip
 * ---------------------------------------------------------------------------
 * Three of the figures the program prints are not what their labels say,
 * and each is reproduced as printed, with the figure its label describes
 * beside it:
 *
 *   - The vault arrow takes the tip's height, already scaled by the wing's
 *     scale, and scales it again: the gnuC2-23 (scale 0.955) prints 2.81 m
 *     for an arc 2.94 m high, the Swoop2 (0.847) 2.18 m for 2.57.
 *   - "Karabiners - wingtip" is figured from the lines' length without the
 *     risers, and the tip's height scaled twice in the same way.
 *   - The complements of section 17 divide by the chord of rib 7 rather than
 *     the central chord: the index is left over from the loop that prints
 *     section 16's six line types.
 *
 * Coordinates are the program's: centimetres, x spanwise, y aft along the
 * central chord, z down, the origin at the nose of the central section.
 * Masses in kg, forces in N, lengths in the results in metres unless named.
 */

import {
  readEquilibrium, readSpecialCodes, EQUILIBRIUM_KEYS, EQUILIBRIUM_NAMES,
} from './lep.js';
import { lepLineTypes } from './leplines.js';

const RAD = Math.PI / 180;

/**
 * The flat and projected areas as the program sums them: trapezia between
 * ribs on the flat stations or the projected ones, the centre strip from 0
 * to rib 1 included. m².
 */
function lepAreas(table) {
  const r = table.ribs;
  let flat = r[0].chord * r[0].x;
  let proj = r[0].chord * r[0].xp;
  for (let i = 0; i < r.length - 1; i++) {
    const c = (r[i].chord + r[i + 1].chord) * 0.5;
    flat += c * (r[i + 1].x - r[i].x);
    proj += c * (r[i + 1].xp - r[i].xp);
  }
  return { flatM2: (flat * 2) / 1e4, projM2: (proj * 2) / 1e4 };
}

/**
 * The wing's mass centre as the program estimates it (its 4.6): the
 * chord-weighted mean of each rib's point at `pct` of its chord, at the
 * rib's height in the arc. A rib on the centreline counts once, the rest
 * twice. cm.
 */
function wingMassCentre(table, pct) {
  const r = table.ribs;
  const centred = r[0].x < 0.2;
  let sum = 0;
  let y = 0;
  let z = 0;
  r.forEach((rb, i) => {
    const w = (i === 0 && centred ? 1 : 2) * rb.chord;
    sum += w;
    y += ((rb.yLE * (100 - pct) + rb.yTE * pct) / 100) * w;
    z += rb.z * w;
  });
  return { x: 0, y: y / sum, z: z / sum };
}

/**
 * Section 1 of the program's output, the figures beyond the areas and
 * spans this tool's own wing is already held to: flattening, the vault's
 * arrow, the line height and the ratios printed from them, the planform's
 * centroid and the wing's mass centre. Each figure the program prints is
 * given as printed; where the label says something else (see the header),
 * the figure it describes is given beside it.
 *
 * @param {object} doc    parsed with `parseLep`
 * @param {object} table  `lepRibTable(doc, ...)` (only the planform is used)
 * @param {object} geom   `lepLineGeometry(doc, ...)`, for the line height;
 *                        optional
 */
export function lepMainParameters(doc, table, geom = null) {
  const r = table.ribs;
  const N = r.length;
  const k = table.scale ?? 1;
  const codes = readSpecialCodes(doc);
  const sectionCgPct = codes.get(1146)?.[0] ?? 36;
  const { flatM2, projM2 } = lepAreas(table);
  const flatSpanM = (2 * r[N - 1].x) / 100;
  const projSpanM = (2 * r[N - 1].xp) / 100;
  const out = {
    flatAreaM2: flatM2,
    flatSpanM,
    flatAspectRatio: (flatSpanM * flatSpanM) / flatM2,
    projAreaM2: projM2,
    projSpanM,
    projAspectRatio: (projSpanM * projSpanM) / projM2,
    flatteningPct: ((flatM2 - projM2) / flatM2) * 100,
    // The arc's height: the printed figure scales the tip's height twice.
    arrowM: (r[N - 1].z - r[0].z) / 100,
    arrowPrintedM: ((r[N - 1].z - r[0].z) * k) / 100,
  };
  out.projSpanOverArrowPrinted = projSpanM / out.arrowPrintedM;
  out.projSpanOverArrow = projSpanM / out.arrowM;

  // The planform's centroid (its 4.5), in per cent of the central chord
  // from its leading edge.
  let a = r[0].x * r[0].chord;
  let cy = 0.5 * (r[0].yLE + r[0].yTE) * a;
  for (let i = 0; i < N - 1; i++) {
    const ai = 0.5 * (r[i].chord + r[i + 1].chord) * (r[i + 1].x - r[i].x);
    cy += 0.25 * (r[i].yLE + r[i].yTE + r[i + 1].yLE + r[i + 1].yTE) * ai;
    a += ai;
  }
  out.planformCentroidPct = (100 * (cy / a - r[0].yLE)) / r[0].chord;
  out.planformCentroidMM = Math.trunc((out.planformCentroidPct / 100) * r[0].chord * 10);
  out.sectionCgPct = sectionCgPct;
  out.wingMassCentreCm = wingMassCentre(table, sectionCgPct);

  if (geom?.ok) {
    const lines = geom.lineLengthCm;
    const risers = geom.riserLengthCm;
    const hcp = lines + risers;
    const zTip = r[N - 1].z;
    out.lineHeightM = hcp / 100;
    // Printed as the projected span over the line height "included risers",
    // and figured on the lines alone.
    out.projSpanOverLineHeightPrinted = (projSpanM * 100) / lines;
    out.projSpanOverLineHeight = projSpanM / out.lineHeightM;
    const half = projSpanM * 50;
    out.karabinerToTipPrintedM = Math.sqrt((lines - zTip * k) ** 2 + half * half) / 100;
    out.karabinerToTipM = Math.sqrt((hcp - zTip) ** 2 + half * half) / 100;
    out.projSpanOverKarabinerToTipPrinted = projSpanM / out.karabinerToTipPrintedM;
    out.projSpanOverKarabinerToTip = projSpanM / out.karabinerToTipM;
  }
  return out;
}

/**
 * Every line's mass, frontal area and drag as the program has them (its
 * 14.9 and 17.0), for one side, at speed `V`:
 *
 *   mass     its cut length and a loop at each end, by its type's weight
 *   area     that length by its diameter — a spliced (`p`) loop counted at
 *            sqrt(2) - 1 of its length, the program's figure after Fontaine
 *            ("the equivalent diameter on the spliced part is D sqrt 2"),
 *            and a webbing riser without its loops
 *   Cd       1 + 10 Re^(-2/3), Re on the type's diameter; 1.98 for webbing
 */
function lineProperties(geom, { rho, muMicroPaS, V }) {
  const out = [];
  for (const l of geom.lines) {
    const m = l.material;
    if (!m) { out.push({ line: l, missing: true }); continue; }
    const rect = m.section === 'rectangular';
    const loop = m.loopCm ?? 0;
    const withLoops = l.cutLength + 2 * loop;                       // cm
    let areaMM2 = withLoops * 10 * m.diameterMM;
    const webbingRiser = l.level === 1 && rect;
    if (webbingRiser) areaMM2 = l.cutLength * 10 * m.diameterMM;
    if (m.loopKind === 'p' && !rect) areaMM2 += 2 * m.diameterMM * 10 * loop * (Math.SQRT2 - 2);
    const reynolds = (rho * V * m.diameterMM * 1e-3) / (muMicroPaS * 1e-6);
    const cd = webbingRiser ? 1.98 : 10 * reynolds ** (-2 / 3) + 1;
    out.push({
      line: l,
      label: l.label,
      riser: l.level === 1 && !l.brake,
      withLoopsCm: withLoops,
      massG: (withLoops / 100) * (m.gramsPerMetre ?? 0),
      areaMM2,
      reynolds,
      cd,
      dragN: cd * 0.5 * rho * V * V * areaMM2 * 1e-6,
      mid: [0, 1, 2].map((i) => (l.from[i] + l.to[i]) / 2),
    });
  }
  return out;
}

/** Both halves' line drag, its centre (m) and the global coefficient. */
function lineDragAt(geom, air, V) {
  const per = lineProperties(geom, { ...air, V });
  const ok = per.filter((p) => !p.missing);
  const half = ok.reduce((s, p) => s + p.dragN, 0);
  const areaM2 = (2 * ok.reduce((s, p) => s + p.areaMM2, 0)) / 1e6;
  return {
    per,
    dragN: 2 * half,
    centreM: half > 0 ? {
      y: ok.reduce((s, p) => s + p.mid[1] * p.dragN, 0) / 100 / half,
      z: ok.reduce((s, p) => s + p.mid[2] * p.dragN, 0) / 100 / half,
    } : { y: NaN, z: NaN },
    cdLines: areaM2 > 0 ? ok.reduce((s, p) => s + p.areaMM2 * 1e-6 * p.cd, 0) / (0.5 * areaM2) : NaN,
  };
}

/**
 * Method 1 as the program runs it: a brute-force search for the glide
 * angle at which the vertical and the horizontal balance ask for the same
 * factor k on the wing's forces, over 0.01 to 0.8 rad in steps of 0.005 and
 * then 0.08 either side in steps of 0.0016. Its loop bounds are single-
 * precision constants in a double-precision loop, and its trip count is
 * Fortran's, both kept, so the grid is the program's to the bit.
 */
function method1({ W, A, B, DE }) {
  const f = Math.fround;
  const scan = (start, stop, step) => {
    let best = null;
    let prev = 100;
    const n = Math.max(Math.trunc((stop - start + step) / step), 0);
    let g = start;
    for (let i = 0; i < n; i++) {
      const k1 = (W - DE * Math.sin(g)) / (A * Math.cos(g) + B * Math.sin(g));
      const k2 = -(DE * Math.cos(g)) / (-A * Math.sin(g) + B * Math.cos(g));
      const zero = Math.abs(k1 - k2);
      if (zero <= prev && Math.abs(k2) <= 2) { best = { gamma: g, k1, k2 }; prev = zero; }
      g += step;
    }
    return best;
  };
  const coarse = scan(f(0.01), f(0.8), f(0.005));
  if (!coarse) return null;
  return scan(coarse.gamma - f(0.08), coarse.gamma + f(0.08), f(0.0016)) ?? coarse;
}

/**
 * The calage from the moments about the centre of pressure (the program's
 * 17, "moments equilibrium (III)"): the wing's, the lines' and the pilot's
 * weights, the lines' and the pilot's drag, each at its own point, the
 * pilot plumb below the karabiners. Returns the karabiners' y (m).
 *
 * Exported so the handbook's rules for where each force acts can be put
 * in, one at a time, and measured against the points the program computes.
 *
 * @param {object} p
 * @param {object} p.e           section 35 (`readEquilibrium`)
 * @param {number} p.theta       attitude, rad, positive nose down
 * @param {number} p.alpha       angle of attack, rad
 * @param {{y:number,z:number}} p.wing        wing mass centre, m
 * @param {number} p.linesKg     lines and risers
 * @param {{y:number,z:number}} p.linesMc     their mass centre, m
 * @param {number} p.linesDragN  their drag
 * @param {{y:number,z:number}} p.dragCentre  its centre, m
 * @param {number} p.pilotDragN
 * @param {number} p.hcpM        the karabiners' depth below the nose, m
 */
export function lepCalageFromMoments({ e, theta, alpha, wing, linesKg, linesMc, linesDragN, dragCentre, pilotDragN, hcpM }) {
  const { g, wingKg, pilotKg, pilotBelowM: pmc, cpYM: ycp, cpZM: zcp } = e;
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const pilotZ = hcpM + pmc * ct;
  const a = -ct * wingKg * g * (ycp - wing.y) - (zcp - wing.z) * st * wingKg * g;
  const b = -ct * linesKg * g * (ycp - linesMc.y) - (zcp - linesMc.z) * st * linesKg * g;
  const c = -ct * pilotKg * g * ycp - (zcp - pilotZ) * st * pilotKg * g;
  const d = (ycp - dragCentre.y) * linesDragN * Math.sin(alpha)
    + (zcp - dragCentre.z) * linesDragN * Math.cos(alpha);
  const ee = ycp * pilotDragN * Math.sin(alpha) + (zcp - pilotZ) * pilotDragN * Math.cos(alpha);
  return (a + b + c + d + ee) / (pilotDragN * Math.sin(alpha) - pilotKg * g * ct) + pmc * st;
}

/**
 * The longitudinal balance of the program's section 17, from the design's
 * section 35.
 *
 * `printed` is the program's own solve, figure for figure as its output
 * prints it. `converged` is the same equations solved at the speed where the
 * typed coefficients balance (k = 1), exactly rather than on the program's
 * grid: what its instruction to iterate leads to.
 *
 * @param {object} doc    parsed with `parseLep`
 * @param {object} table  `lepRibTable(doc, ...)`
 * @param {object} geom   `lepLineGeometry(doc, ...)`
 * @returns {{active: boolean, ok?: boolean, ...}}
 */
export function lepBalance(doc, table, geom) {
  const e = readEquilibrium(doc);
  if (!e || !e.active) return { active: false };
  const problems = [];
  const notes = [];
  const notReproduced = [];
  if (e.missing.length) {
    problems.push(`section 35 does not give ${e.missing.map((k) => EQUILIBRIUM_NAMES[EQUILIBRIUM_KEYS.indexOf(k)]).join(', ')} as a number`);
  }
  if (!geom?.ok) problems.push('the design\'s line geometry did not build, so its lines cannot be weighed');
  const untyped = geom?.ok ? geom.lines.filter((l) => !l.material) : [];
  if (untyped.length) {
    problems.push(`${untyped.length} line(s) have no type in section 34: ${untyped.slice(0, 4).map((l) => l.label).join(', ')}`);
  }
  if (problems.length) return { active: true, ok: false, inputs: e, problems, notes, notReproduced };

  const codes = readSpecialCodes(doc);
  const method = codes.get(1351)?.[0] ?? 1;
  const useFlat = (codes.get(1352)?.[0] ?? 2) === 1;
  const main = lepMainParameters(doc, table, geom);
  const S = useFlat ? main.flatAreaM2 : main.projAreaM2;
  const alpha = e.alphaDeg * RAD;
  const air = { rho: e.rho, muMicroPaS: e.muMicroPaS };
  const c1 = table.ribs[0].chord;
  const hcpM = geom.karabiner[2] / 100;

  // Masses: both halves, the risers and the brakes among the lines.
  const at0 = lineDragAt(geom, air, e.speedMS);
  const per = at0.per;
  const linesG = 2 * per.reduce((s, p) => s + p.massG, 0);
  const linesKg = linesG / 1000;
  const linesMc = {
    y: (2 * per.reduce((s, p) => s + p.mid[1] * p.massG, 0)) / linesG / 100,
    z: (2 * per.reduce((s, p) => s + p.mid[2] * p.massG, 0)) / linesG / 100,
  };
  const risers = per.filter((p) => p.riser);
  const quicklinks = risers.length * 2;
  const quicklinksKg = (e.quicklinkG * quicklinks) / 1000;
  const totalKg = e.wingKg + linesKg + quicklinksKg + e.pilotKg;
  const W = totalKg * e.g;
  const masses = {
    linesKg,
    risersKg: (2 * risers.reduce((s, p) => s + p.massG, 0)) / 1000,
    quicklinks,
    quicklinksKg,
    totalKg,
    wingLoadFlat: totalKg / main.flatAreaM2,
    wingLoadProj: totalKg / main.projAreaM2,
  };
  const linesAreaM2 = (2 * per.reduce((s, p) => s + p.areaMM2, 0)) / 1e6;
  const lines = {
    surfaceM2: linesAreaM2,
    risersSurfaceM2: (2 * risers.reduce((s, p) => s + (p.line.material.section === 'rectangular'
      ? p.line.cutLength : p.withLoopsCm) * 10 * p.line.material.diameterMM, 0)) / 1e6,
    massCentreM: linesMc,
    perLine: per.map((p) => ({
      label: p.label, plan: p.line.plan, level: p.line.level, order: p.line.order, brake: !!p.line.brake,
      massG: p.massG, areaMM2: p.areaMM2, reynolds: p.reynolds, cd: p.cd, dragN: p.dragN,
    })),
  };
  // The quick links: one at the top of each riser, both sides.
  const qlMc = {
    y: risers.reduce((s, p) => s + p.line.to[1], 0) / 100 / risers.length,
    z: risers.reduce((s, p) => s + p.line.to[2], 0) / 100 / risers.length,
  };
  const wing = main.wingMassCentreCm;

  // A state of the balance: the wing's forces at k times the typed
  // coefficients, at speed `v`; the lines' and the pilot's drag at `V`.
  const state = ({ V, v, k, k1, k2, gamma, drag }) => {
    const pilotDragN = e.pilotCd * 0.5 * e.rho * V * V * e.pilotAreaM2;
    const theta = gamma - alpha;
    const q = 0.5 * e.rho * v * v * S;
    const forces = {
      lift: e.cl * k * q,
      liftExtra: e.cl * k * (e.cle - 1) * q,
      drag: e.cd * k * q,
      dragExtra: e.cd * k * (e.cde - 1) * q,
      lines: drag.dragN,
      pilot: pilotDragN,
    };
    forces.liftTotal = forces.lift + forces.liftExtra;
    forces.dragTotal = forces.drag + forces.dragExtra;
    forces.total = forces.dragTotal + forces.lines + forces.pilot;
    // Sarthe's induced drag (1999), on the flat area and flat aspect ratio,
    // e = 0.9: "theoretical by AR, and included in wing drag".
    const lambda = (main.flatSpanM ** 2) / main.flatAreaM2;
    forces.induced = ((e.cl * e.cl * e.cle * e.cle) / (Math.PI * lambda * 0.9))
      * 0.5 * e.rho * v * v * main.flatAreaM2 * k;
    const py = lepCalageFromMoments({
      e, theta, alpha, wing: { y: wing.y / 100, z: wing.z / 100 }, linesKg, linesMc, linesDragN: drag.dragN,
      dragCentre: drag.centreM, pilotDragN, hcpM,
    });
    const plumb = py + (hcpM + e.pilotBelowM) * Math.tan(theta);
    const pilotMc = { y: py - e.pilotBelowM * Math.sin(theta), z: hcpM + e.pilotBelowM * Math.cos(theta) };
    const totalMc = {
      y: ((wing.y / 100) * e.wingKg + linesMc.y * linesKg + qlMc.y * quicklinksKg + pilotMc.y * e.pilotKg) / totalKg,
      z: ((wing.z / 100) * e.wingKg + linesMc.z * linesKg + qlMc.z * quicklinksKg + pilotMc.z * e.pilotKg) / totalKg,
    };
    return {
      k1, k2, k,
      gammaDeg: gamma / RAD,
      thetaDeg: theta / RAD,
      glideRatio: 1 / Math.tan(gamma),
      speedMS: v,
      speedKMH: v * 3.6,
      horizontalMS: v * Math.cos(gamma),
      sinkMS: v * Math.sin(gamma),
      forces,
      ratios: {
        clcd: e.cl / e.cd,
        clcdAdjusted: (e.cl * e.cle) / (e.cd * e.cde),
        liftOverWingDrag: forces.lift / forces.dragTotal,
        liftOverTotalDrag: forces.lift / forces.total,
      },
      lineDrag: { centreM: drag.centreM, cdLines: drag.cdLines },
      massCentres: { wing: { y: wing.y / 100, z: wing.z / 100 }, lines: linesMc, quicklinks: qlMc, pilot: pilotMc, total: totalMc },
      karabinerM: { x: geom.karabiner[0] / 100, y: py, z: hcpM },
      alphaDeg: e.alphaDeg,
      cpPct: (e.cpYM * 1e4) / c1,
      plumbPct: (plumb * 1e4) / c1,
      calagePct: (py * 1e4) / c1,
      plumbM: plumb,
    };
  };

  // The program's own solve.
  let printed = null;
  if (method === 1) {
    const q0 = 0.5 * e.rho * e.speedMS * e.speedMS * S;
    const pilot0 = e.pilotCd * 0.5 * e.rho * e.speedMS * e.speedMS * e.pilotAreaM2;
    const m1 = method1({
      W, A: e.cl * e.cle * q0, B: e.cd * e.cde * q0, DE: at0.dragN + pilot0,
    });
    if (!m1) problems.push('method 1 found no glide angle between 0.01 and 0.8 rad at which k is under 2');
    else {
      const k = (m1.k1 + m1.k2) / 2;
      const v = Math.sqrt((W * Math.cos(m1.gamma)) / (0.5 * e.rho * S * e.cl * e.cle * k));
      printed = state({ V: e.speedMS, v, k, k1: m1.k1, k2: m1.k2, gamma: m1.gamma, drag: at0 });
      // Its complements divide by the chord of rib (types + 1), the index
      // the loop printing section 16's types leaves behind; by the central
      // chord beside them.
      const chordRib = Math.min(lepLineTypes(doc).size + 1, table.ribs.length);
      const dy = {
        plumbLessCalage: printed.plumbM - printed.karabinerM.y,
        calageLessCp: printed.karabinerM.y - e.cpYM,
        plumbLessCp: printed.plumbM - e.cpYM,
      };
      const by = (chord) => Object.fromEntries(Object.entries(dy).map(([key, m]) => [key, (m * 1e4) / chord]));
      printed.complements = {
        chordRib,
        printedPct: by(table.ribs[chordRib - 1].chord),
        pct: by(c1),
        mm: {
          ...Object.fromEntries(Object.entries(dy).map(([key, m]) => [key, Math.trunc(m * 1e3)])),
          wingCgToCp: Math.trunc(1000 * Math.hypot(wing.y / 100 - e.cpYM, wing.z / 100 - e.cpZM)),
          wingCgToCpY: Math.trunc((wing.y * 0.01 - e.cpYM) * 1000),
          wingCgToCpZ: Math.trunc((wing.z * 0.01 - e.cpZM) * 1000),
        },
      };
      if (Math.abs(k - 1) > 0.02) {
        notes.push(`the program's solve was left at k = ${k.toFixed(3)}: at the estimated `
          + `${e.speedMS} m/s the wing balances on ${(k * 100).toFixed(0)}% of its typed lift, `
          + 'and the program asks for the inputs to be iterated until it is 1');
      }
    }
  } else {
    notReproduced.push(`solve method ${method} (section 37's 1351): only method 1 is reproduced`);
  }

  // The same equations at the speed the typed coefficients balance at.
  let converged = null;
  if (e.cl * e.cle > 0) {
    let V = e.speedMS;
    let drag = at0;
    let gamma = 0;
    let iterations = 0;
    for (; iterations < 200; iterations++) {
      drag = lineDragAt(geom, air, V);
      const q = 0.5 * e.rho * V * V;
      const pilot = e.pilotCd * q * e.pilotAreaM2;
      gamma = Math.atan((e.cd * e.cde * q * S + drag.dragN + pilot) / (e.cl * e.cle * q * S));
      const next = Math.sqrt((2 * W * Math.cos(gamma)) / (e.rho * S * e.cl * e.cle));
      const done = Math.abs(next - V) < 1e-12 * V;
      V = next;
      if (done) break;
    }
    drag = lineDragAt(geom, air, V);
    converged = { ...state({ V, v: V, k: 1, k1: 1, k2: 1, gamma, drag }), iterations: iterations + 1 };
  }

  return {
    active: true,
    ok: problems.length === 0,
    inputs: e,
    method,
    area: useFlat ? 'flat' : 'projected',
    // The karabiners' depth below the nose and the central chord, m: what
    // `lepCalageFromMoments` needs besides a state.
    hcpM,
    chordM: c1 / 100,
    areaM2: S,
    sectionCgPct: main.sectionCgPct,
    flatAreaM2: main.flatAreaM2,
    projAreaM2: main.projAreaM2,
    masses,
    lines: {
      ...lines,
      dragCentreM: at0.centreM,
      cdLines: at0.cdLines,
      dragN: at0.dragN,
    },
    printed,
    converged,
    problems,
    notes,
    notReproduced,
  };
}
