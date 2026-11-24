/* flight.js — the glider in flight, its brakes pulled.
 *
 * A six-degree-of-freedom rigid-body model of the whole machine — canopy,
 * the air inside it, lines and pilot as one body hung from the riser
 * midpoint — flown through brake inputs: either brake or both, from hands
 * up or on full bar, pulled to a travel at a rate.
 *
 * ---------------------------------------------------------------------------
 * What carries it
 * ---------------------------------------------------------------------------
 * The aerodynamics are the slices' (slices.js): the wing's vortex lattice,
 * every strip's boundary condition turned by the alpha method until its
 * lift is its section's at the angle the whole wing leaves it. Here the
 * lattice is factorised once, its wake fixed along the trim's flow in the
 * body, and each strip meets its own velocity — the glider's, plus its
 * rotation — so roll, pitch and yaw damping and the arc's dihedral effect
 * come out of the lattice rather than from derivatives typed in. Each
 * strip's section is the brake-deflected one (brakesection.js), at the bend
 * its trailing edge has where the brake lines pull it.
 *
 * The brake: the handle's travel takes up each anchor's free travel first
 * (`tipFirstSlack`: the tip bites first), then pulls that anchor's trailing
 * edge toward the pulley, the drop square to the chord being the pull by
 * the cosine between the line and the section's normal (0.97 to 0.99 on the
 * default wing: the lines meet the canopy nearly square). Between anchors
 * the drop runs straight from one to the next; inboard of the first it runs
 * across the centre to the other side's first; outboard of the last it
 * falls to nothing at the tip. The drop over the chord gives the bend.
 *
 * The body: canopy cloth spread over the strips by area, the air inside the
 * canopy (its mass and inertia, not its weight, which the air outside
 * holds up), the lines at half their height, the pilot at the karabiners —
 * where the balance (equilibrium.js) puts the pilot's weight and drag — and
 * the canopy's apparent mass and inertia as Barrows (2002) gives them for an
 * arched wing, assembled about the riser midpoint as Heatwole's glidersim
 * does (2022, MIT licence), with the steady Munk moment taken out because
 * the sections' own moment already holds it. Pilot drag and line drag are
 * the balance's: their coefficients on the wing's area, the lines' acting a
 * third of the way down (handbook 4.2).
 *
 * The speed bar turns the canopy nose down about the rear riser's row by
 * the angle the risers give (`alphaChange`, risers.js), and the model finds
 * its own trim there.
 *
 * ---------------------------------------------------------------------------
 * What it is not
 * ---------------------------------------------------------------------------
 * A rigid canopy. A real one deforms, folds and collapses; nothing here
 * does. A section past its stall is the table's flat plate, and a strip
 * whose lift falls near nothing is where a real canopy would start to fold:
 * both are counted and reported, never hidden, and a flight that reaches
 * them says it has left what the model can stand behind.
 */

import { wingStrips, latticeSystem, trefftzInfluence } from './vlm.js';
import { brakeSectionAt, brakeBendForDrop, brakeStallDeg, BRAKE_SECTION } from './brakesection.js';
import { tipFirstSlack } from './lineplan.js';

export const FLIGHT = Object.freeze({
  dtS: 0.01,
  frameHz: 30,
  leadS: 1,
  holdS: 4,
  afterS: 4,
  release: true,
  travelMM: 650,
  rates: Object.freeze({ slow: 3, medium: 1, fast: 0.5 }),
  slackCentreMM: 180,
  slackTipMM: 60,
  slackPower: 1.5,
  couplingTol: 2e-4,
  couplingIterations: 40,
  relax: 0.7,
  // the induced angle a strip may have, down and up (tip upwash)
  inducedMaxDeg: 15,
  upwashMaxDeg: 6,
  // where a strip's force takes its direction from: 'trefftz', its lifting
  // line's induced angle (half the Trefftz plane's wash on it), or
  // 'control', the three-quarter-chord angle the coupling reads its section
  // at (1.13; it overstated the induced drag)
  inducedAngle: 'trefftz',
  // past its stall by this much, or below this, a strip meets its own air
  deepStallMarginDeg: 10,
  deepStallNegativeDeg: 15,
  correctionMaxRad: 1.2,
  pilotRadiusM: 0.35,
  pilotBelowKarabinerM: 0,
  lineDragDepth: 1 / 3,
  apparentMass: true,
  barPivotRow: 'C',
  collapseCl: 0.15,
  // the wing's lift below which the riser model takes a frontal collapse
  minFlyingCz: 0.35,
  // past these the flight has departed (stalled through, spinning, folding)
  departAlphaDeg: 30,
  departNegativeAlphaDeg: 10,
  departBetaDeg: 30,
  afterDepartureS: 2,
  altitudeM: 1000,
  // Barrows (2002), the factors his arched-wing apparent masses carry
  apparentKA: 0.85,
  apparentKB: 1.0,
});

export const FLIGHT_INPUTS = Object.freeze(['left', 'right', 'both']);
export const FLIGHT_STATES = Object.freeze(['trim', 'accelerated']);
export const FLIGHT_RATES = Object.freeze(['slow', 'medium', 'fast']);

/* ------------------------------------------------------------ vectors -- */
const flDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const flSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const flAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const flScale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const flCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const flNorm = (a) => Math.hypot(a[0], a[1], a[2]);
const flUnit = (a) => { const l = flNorm(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// The tool's wing frame (x aft, y right, z up) and the body's (x forward,
// y right, z down) differ by half a turn about y; the same map both ways.
const flToBody = (a) => [-a[0], a[1], -a[2]];

function flCrossMat(r) {
  return [[0, -r[2], r[1]], [r[2], 0, -r[0]], [-r[1], r[0], 0]];
}
function flMatMul(A, B) {
  const n = A.length; const m = B[0].length; const k = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { let s = 0; for (let p = 0; p < k; p++) s += A[i][p] * B[p][j]; C[i][j] = s; }
  return C;
}
const flT = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const flMatVec = (A, v) => A.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
const flMatAdd = (A, B, k = 1) => A.map((r, i) => r.map((x, j) => x + k * B[i][j]));

/** LU with partial pivoting, in place on a flat row-major copy. */
function flLu(A, n) {
  const a = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) a[i * n + j] = A[i][j];
  const piv = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let p = k; let mx = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(a[i * n + k]); if (v > mx) { mx = v; p = i; } }
    if (!(mx > 0)) throw new Error('flight: singular system');
    piv[k] = p;
    if (p !== k) for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; }
    const d = a[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = (a[i * n + k] /= d);
      if (f !== 0) for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j];
    }
  }
  return { a, piv, n };
}
function flLuSolve(lu, b, out) {
  const { a, piv, n } = lu;
  const x = out || new Float64Array(n);
  if (x !== b) for (let i = 0; i < n; i++) x[i] = b[i];
  for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = x[k]; x[k] = x[p]; x[p] = t; } }
  for (let i = 1; i < n; i++) { let s = x[i]; for (let j = 0; j < i; j++) s -= a[i * n + j] * x[j]; x[i] = s; }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let j = i + 1; j < n; j++) s -= a[i * n + j] * x[j]; x[i] = s / a[i * n + i]; }
  return x;
}

/* ---------------------------------------------------------- quaternions -- */
/** Body to earth (north, east, down), from a unit quaternion [w, x, y, z]. */
export function flightRotation(q) {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}
/** Roll, pitch and yaw (radians) of a unit quaternion. */
export function flightEuler(q) {
  const [w, x, y, z] = q;
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const s = Math.max(-1, Math.min(1, 2 * (w * y - z * x)));
  const pitch = Math.asin(s);
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return [roll, pitch, yaw];
}
/** The quaternion of roll, pitch and yaw (radians). */
export function flightQuaternion(roll, pitch, yaw) {
  const cr = Math.cos(roll / 2); const sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2); const sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2); const sy = Math.sin(yaw / 2);
  return [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy];
}

/* ------------------------------------------------------------- the model -- */

/** The section's area (unit chord) and its centroid, by the shoelace. */
function flSectionArea(points) {
  let A = 0; let cx = 0; let cz = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i]; const [x1, z1] = points[(i + 1) % points.length];
    const c = x0 * z1 - x1 * z0;
    A += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c;
  }
  A /= 2;
  return { area: Math.abs(A), x: cx / (6 * A), z: cz / (6 * A) };
}

/** Thickness of a unit-chord section at x, from its two surfaces. */
function flThicknessAt(points, x) {
  let iLE = 0;
  for (let i = 1; i < points.length; i++) if (points[i][0] < points[iLE][0]) iLE = i;
  const at = (poly) => {
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1]; const b = poly[i];
      if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
    return 0;
  };
  const upper = points.slice(0, iLE + 1).reverse();
  const lower = points.slice(iLE);
  return at(upper) - at(lower);
}

/**
 * Barrows' (2002) apparent masses and inertias of an arched canopy, per unit
 * air density, as Heatwole's glidersim computes them: the arch taken as a
 * circle through the central and tip quarter chords, the chord the standard
 * mean chord, the thickness the mean of the thickest part of the central
 * half. In the canopy's own axes (x forward, y right, z down).
 */
export function apparentMassBarrows({ projectedAreaM2, projectedSpanM, flatAreaM2, flatSpanM, thicknessM, tipDyM, tipDzM, kA = FLIGHT.apparentKA, kB = FLIGHT.apparentKB }) {
  const S = projectedAreaM2; const b = projectedSpanM; const AR = (b * b) / S;
  const c = flatAreaM2 / flatSpanM; const t = thicknessM;
  const dz = (tipDyM * tipDyM - tipDzM * tipDzM) / (2 * tipDzM);
  const r = dz + tipDzM;
  const theta = Math.atan2(tipDyM, dz);
  const hstar = tipDzM / b;
  const mf11 = kA * Math.PI * t * t * b / 4;
  const mf22 = kB * Math.PI * t * t * c / 4;
  const mf33 = AR / (1 + AR) * Math.PI * c * c * b / 4;
  const If11 = 0.055 * AR / (1 + AR) * b * S * S;
  const If22 = 0.0308 * AR / (1 + AR) * c ** 3 * S;
  const If33 = 0.055 * b ** 3 * t * t;
  const zPC2C = -r * Math.sin(theta) / theta;
  const zRC2C = zPC2C * mf22 / (mf22 + If11 / (r * r));
  const zPC2RC = zPC2C - zRC2C;
  const m11 = kA * (1 + (8 / 3) * hstar * hstar) * Math.PI * t * t * b / 4;
  const m22 = (r * r * mf22 + If11) / (zPC2C * zPC2C);
  const m33 = mf33;
  const I11 = (zPC2RC * zPC2RC) / (zPC2C * zPC2C) * r * r * mf22 + (zRC2C * zRC2C) / (zPC2C * zPC2C) * If11;
  const I22 = If22;
  const I33 = 0.055 * (1 + 8 * hstar * hstar) * b ** 3 * t * t;
  return {
    radiusM: r, semiAngleRad: theta, hstar, chordM: c, aspectRatio: AR,
    zPC2C, zRC2C, zPC2RC,
    flat: { m11: mf11, m22: mf22, m33: mf33, I11: If11, I22: If22, I33: If33 },
    m: [m11, m22, m33], I: [I11, I22, I33],
  };
}

/**
 * Build the glider for flight. Positions are relative to the riser
 * midpoint, in the wing's frame for the aerodynamics and in the body's for
 * the dynamics.
 *
 * @param {object} o
 * @param {object} o.wing       `buildWing`
 * @param {object} o.linePlan   with its `karabiner` (or `maillon`) and `brakePlan`
 * @param {object} o.airfoil    the section, unit chord
 * @param {object} o.table      `brakeSectionTable`
 * @param {object} o.atm        density, gravity
 * @param {number} o.areaM2     the reference (flat) area the drag coefficients are on
 * @param {number} o.barRotationDeg  the canopy turned by the speed bar, nose down negative
 */
export function flightModel({
  wing, linePlan, airfoil, table, atm,
  pilotKg, wingKg, linesKg, areaM2, cxPilot, cxLines,
  alphaWakeDeg = 5, barRotationDeg = 0, barBrakeSlackMM = 0,
  settings = {},
}) {
  const cfg = { ...FLIGHT, ...settings };
  if (!wing?.ribs?.length) throw new Error('flight: no wing');
  const kar = linePlan?.karabiner ?? linePlan?.maillon;
  if (!kar) throw new Error('flight: the line plan has no karabiner to hang the pilot from');
  if (!table) throw new Error('flight: no section table');
  const rho = atm.density; const g = atm.gravity || 9.80665;
  const RM = [kar[0], 0, kar[2]];
  const root = wing.ribs[0];
  const rootLE = root.frame ? root.frame.origin : [root.xLE ?? 0, 0, 0];
  const rootU = root.frame ? root.frame.u : [1, 0, 0];
  const rootV = root.frame ? root.frame.v : [0, 0, 1];
  // the speed bar: the canopy turned about the rear riser's row on the root
  const pivotFrac = airfoil?.anchors?.[cfg.barPivotRow] ?? 0.53;
  const pivot = flAdd(rootLE, flScale(rootU, pivotFrac * root.chord));
  const beta = barRotationDeg * Math.PI / 180;
  const cb = Math.cos(beta); const sb = Math.sin(beta);
  const turn = (p) => {
    if (!beta) return p.slice();
    const x = p[0] - pivot[0]; const z = p[2] - pivot[2];
    return [pivot[0] + x * cb + z * sb, p[1], pivot[2] - x * sb + z * cb];
  };
  const turnDir = (d) => (beta ? [d[0] * cb + d[2] * sb, d[1], -d[0] * sb + d[2] * cb] : d.slice());
  const strips = wingStrips(wing).map((s) => ({
    leftLE: turn(s.leftLE), leftTE: turn(s.leftTE), rightLE: turn(s.rightLE), rightTE: turn(s.rightTE),
  }));
  const sys = latticeSystem(strips, { alphaDeg: alphaWakeDeg });
  const n = sys.n;
  const lu = flLu(sys.A, n);
  // the wake's trace, seen down it: each strip's induced angle from it
  const seenW = (q) => [q[1], q[2] * Math.cos(sys.alpha) - q[0] * Math.sin(sys.alpha)];
  const tw = trefftzInfluence(sys.panels.map((p) => [seenW(p.ta), seenW(p.tb)]));
  // per strip, relative to the riser midpoint, in the wing's frame
  const rq = new Float64Array(3 * n); const rc = new Float64Array(3 * n);
  const nrm = new Float64Array(3 * n); const spn = new Float64Array(3 * n); const chd = new Float64Array(3 * n);
  const chord = new Float64Array(n); const width = new Float64Array(n); const area = new Float64Array(n);
  const yMid = new Float64Array(n);
  sys.panels.forEach((p, i) => {
    const mid = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
    const s = flUnit(p.span); const nn = p.normal; const c = flUnit(flCross(s, nn));
    const st = p.strip;
    const ch = (flNorm(flSub(st.leftTE, st.leftLE)) + flNorm(flSub(st.rightTE, st.rightLE))) / 2;
    const w = flNorm(p.span);
    for (let k = 0; k < 3; k++) {
      rq[3 * i + k] = mid[k] - RM[k]; rc[3 * i + k] = p.control[k] - RM[k];
      nrm[3 * i + k] = nn[k]; spn[3 * i + k] = s[k]; chd[3 * i + k] = c[k];
    }
    chord[i] = ch; width[i] = w; area[i] = ch * w; yMid[i] = mid[1];
  });
  // the brake anchors, both sides, with their free travel and their pull
  const bp = linePlan.brakePlan;
  const anchors = [];
  if (bp) {
    // the pulley is on the rear riser, which the bar does not move
    const pulley = bp.pulley;
    const ribsN = wing.ribs.length;
    const slackAt = tipFirstSlack({ centreMM: cfg.slackCentreMM, tipMM: cfg.slackTipMM, power: cfg.slackPower });
    const uppers = bp.lines.filter((l) => l.level === 'upper').sort((a, b) => a.index - b.index);
    for (const l of uppers) {
      const te = turn(l.to);
      // the strip nearest, for the section's normal there
      let best = 0;
      for (let i = 0; i < n; i++) if (Math.abs(yMid[i] - te[1]) < Math.abs(yMid[best] - te[1])) best = i;
      const nn = [nrm[3 * best], nrm[3 * best + 1], nrm[3 * best + 2]];
      const pull = flUnit(flSub([pulley[0], te[1] >= 0 ? pulley[1] : -pulley[1], pulley[2]], te));
      const gain = Math.max(0.2, -flDot(pull, nn));
      const t = (l.ribIndex ?? 0) / Math.max(1, ribsN - 1);
      const slack = slackAt(t) + barBrakeSlackMM;
      anchors.push({ side: 'right', y: Math.abs(te[1]), ribIndex: l.ribIndex, slackMM: slack, gain, te });
    }
  }
  const K = anchors.length;
  const all = anchors.map((a) => ({ ...a, side: 'left', y: -a.y, te: [a.te[0], -a.te[1], a.te[2]] })).concat(anchors);
  // which anchors each strip's drop is read from
  const tipY = Math.max(...strips.map((s) => Math.max(Math.abs(s.leftTE[1]), Math.abs(s.rightTE[1]))));
  const weights = [];
  for (let i = 0; i < n; i++) {
    const y = yMid[i]; const ay = Math.abs(y);
    const right = y >= 0;
    const off = right ? K : 0; const other = right ? 0 : K;
    const w = [];
    if (!K) { weights.push(w); continue; }
    const Y = anchors.map((a) => a.y);
    if (ay <= Y[0]) {
      const f = (ay + Y[0]) / (2 * Y[0]);
      w.push([off, f], [other, 1 - f]);
    } else if (ay >= Y[K - 1]) {
      const f = Math.max(0, (tipY - ay) / Math.max(1e-6, tipY - Y[K - 1]));
      w.push([off + K - 1, f]);
    } else {
      let k = 0;
      while (k < K - 2 && Y[k + 1] < ay) k++;
      const f = (ay - Y[k]) / (Y[k + 1] - Y[k]);
      w.push([off + k, 1 - f], [off + k + 1, f]);
    }
    weights.push(w);
  }
  // the body, about the riser midpoint, in the wing's frame first
  const sec = flSectionArea(airfoil.points);
  const solid = []; const air = [];
  const flatArea = area.reduce((a, v) => a + v, 0);
  for (let i = 0; i < n; i++) {
    const st = sys.panels[i].strip;
    const le = [(st.leftLE[0] + st.rightLE[0]) / 2, (st.leftLE[1] + st.rightLE[1]) / 2, (st.leftLE[2] + st.rightLE[2]) / 2];
    const c = [chd[3 * i], chd[3 * i + 1], chd[3 * i + 2]]; const nn = [nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]];
    const mc = flAdd(le, flScale(c, 0.5 * chord[i]));
    solid.push({ m: wingKg * area[i] / flatArea, r: flSub(mc, RM), c, len: chord[i] });
    const ac = flAdd(le, flAdd(flScale(c, sec.x * chord[i]), flScale(nn, sec.z * chord[i])));
    air.push({ m: rho * sec.area * chord[i] * chord[i] * width[i], r: flSub(ac, RM), c, len: chord[i] });
  }
  const hangTop = turn([kar[0], 0, rootLE[2]]);
  const linesAt = flSub(flScale(flAdd(hangTop, RM), 0.5), RM);
  const pilotAt = [0, 0, -cfg.pilotBelowKarabinerM];
  const lineDragAt = flSub(flAdd(hangTop, flScale(flSub(RM, hangTop), cfg.lineDragDepth)), RM);
  const pointMasses = [...solid, ...air, { m: linesKg, r: linesAt }, { m: pilotKg, r: pilotAt }];
  const massSolid = wingKg + linesKg + pilotKg;
  const massAir = air.reduce((a, p) => a + p.m, 0);
  const massBody = massSolid + massAir;
  const sumR = (list) => list.reduce((acc, p) => flAdd(acc, flScale(p.r, p.m)), [0, 0, 0]);
  const rSolidW = flScale(flAdd(sumR(solid), flAdd(flScale(linesAt, linesKg), flScale(pilotAt, pilotKg))), 1 / massSolid);
  const rBodyW = flScale(sumR(pointMasses), 1 / massBody);
  let J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pointMasses) {
    const r = p.r; const r2 = flDot(r, r);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) J[a][b] += p.m * ((a === b ? r2 : 0) - r[a] * r[b]);
    if (p.c) {
      // the strip's own, a rod along its chord
      const k = (p.m * p.len * p.len) / 12;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) J[a][b] += k * ((a === b ? 1 : 0) - p.c[a] * p.c[b]);
    }
  }
  const ip = 0.4 * pilotKg * cfg.pilotRadiusM ** 2;
  for (let a = 0; a < 3; a++) J[a][a] += ip;
  // to the body's frame: x and z reversed
  const Tm = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]];
  const JB = flMatMul(flMatMul(Tm, J), Tm);
  const rB = flToBody(rBodyW);
  const rS = flToBody(rSolidW);
  // apparent mass (Barrows), about the riser midpoint
  let am = null; let A6 = null;
  {
    const Ar = [
      [massBody, 0, 0, 0, massBody * rB[2], -massBody * rB[1]],
      [0, massBody, 0, -massBody * rB[2], 0, massBody * rB[0]],
      [0, 0, massBody, massBody * rB[1], -massBody * rB[0], 0],
    ];
    const rx = flCrossMat(rB);
    for (let a = 0; a < 3; a++) Ar.push([massBody * rx[a][0], massBody * rx[a][1], massBody * rx[a][2], JB[a][0], JB[a][1], JB[a][2]]);
    A6 = Ar;
  }
  if (cfg.apparentMass) {
    // the arch: through the central and tip quarter chords
    const qc = (le, te) => flAdd(le, flScale(flSub(te, le), 0.25));
    const tipStrip = strips.reduce((b, s) => (Math.max(Math.abs(s.leftTE[1]), Math.abs(s.rightTE[1])) > Math.max(Math.abs(b.leftTE[1]), Math.abs(b.rightTE[1])) ? s : b), strips[0]);
    const tipEdge = Math.abs(tipStrip.leftTE[1]) > Math.abs(tipStrip.rightTE[1]) ? [tipStrip.leftLE, tipStrip.leftTE] : [tipStrip.rightLE, tipStrip.rightTE];
    const q0 = qc(rootLE, flAdd(rootLE, flScale(rootU, root.chord)));
    const q0t = turn(q0);
    const qt = qc(tipEdge[0], tipEdge[1]);
    const tipDy = Math.abs(qt[1]); const tipDz = q0t[2] - qt[2];
    const projSpan = 2 * tipY;
    const projArea = sys.panels.reduce((acc, p, i) => acc + area[i] * Math.abs(p.normal[2]), 0);
    const flatSpan = width.reduce((a, v) => a + v, 0);
    // thickness: the thickest part (10 to 50% chord) of the central half
    let tSum = 0; let tN = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(yMid[i]) > projSpan / 4) continue;
      for (let x = 0.1; x <= 0.5 + 1e-9; x += 0.05) { tSum += flThicknessAt(airfoil.points, x) * chord[i]; tN++; }
    }
    const thickness = tN ? tSum / tN : 0.12 * flatArea / flatSpan;
    const B = apparentMassBarrows({
      projectedAreaM2: projArea, projectedSpanM: projSpan, flatAreaM2: flatArea, flatSpanM: flatSpan,
      thicknessM: thickness, tipDyM: tipDy, tipDzM: tipDz, kA: cfg.apparentKA, kB: cfg.apparentKB,
    });
    // the confluence point: half the central chord back, the arch's radius down
    const u0 = turnDir(rootU); const v0 = turnDir(rootV);
    const C = flSub(flAdd(turn(rootLE), flScale(u0, 0.5 * root.chord)), flScale(v0, B.radiusM));
    const RC = flAdd(C, flScale(v0, -B.zRC2C));
    // the canopy's axes in the body's: forward along its root chord, down off it
    const xc = flToBody(flScale(u0, -1)); const zc = flToBody(flScale(v0, -1)); const yc = [0, 1, 0];
    const Rc = [[xc[0], yc[0], zc[0]], [xc[1], yc[1], zc[1]], [xc[2], yc[2], zc[2]]];
    const diag = (d) => [[d[0], 0, 0], [0, d[1], 0], [0, 0, d[2]]];
    const Ma = flMatMul(flMatMul(Rc, diag(B.m.map((v) => v * rho))), flT(Rc));
    const Ia = flMatMul(flMatMul(Rc, diag(B.I.map((v) => v * rho))), flT(Rc));
    const rRC2R = flToBody(flSub(RC, RM));
    const rPC2RC = flMatVec(Rc, [0, 0, B.zPC2RC]);
    const S2 = [[0, 0, 0], [0, 1, 0], [0, 0, 0]];
    const Srr = flCrossMat(rRC2R); const Spr = flCrossMat(rPC2RC);
    const Q = flMatMul(flMatMul(flMatMul(S2, Spr), Ma), Srr);
    let Ja = flMatAdd(Ia, flMatMul(flMatMul(Srr, Ma), Srr), -1);
    Ja = flMatAdd(Ja, flMatMul(flMatMul(flMatMul(Spr, Ma), Spr), S2), -1);
    Ja = flMatAdd(Ja, Q, -1);
    Ja = flMatAdd(Ja, flT(Q), -1);
    const MC = flMatMul(flScale3(Ma, -1), flMatAdd(Srr, flMatMul(Spr, S2)));
    const MCt = flT(MC);
    const Aa = [];
    for (let a = 0; a < 3; a++) Aa.push([...Ma[a], ...MC[a]]);
    for (let a = 0; a < 3; a++) Aa.push([...MCt[a], ...Ja[a]]);
    A6 = A6.map((r, i) => r.map((x, j) => x + Aa[i][j]));
    am = { barrows: B, Ma, Ja, rRC2R, rPC2RC, S2, Srr, Spr, thicknessM: thickness, projectedAreaM2: projArea, projectedSpanM: projSpan, flatSpanM: flatSpan };
  }
  const lu6 = flLu(A6, 6);
  return {
    cfg, rho, g, n, sys, lu, tw, rq, rc, nrm, spn, chd, chord, width, area, yMid,
    anchors: all, weights, tipY, table, flatAreaM2: flatArea, areaM2,
    dragPilotM2: areaM2 * cxPilot, dragLinesM2: areaM2 * cxLines,
    pilotAt, lineDragAt, linesAt, rSolidW, rSolidB: rS, rBodyB: rB, JB,
    massSolid, massAir, massBody, pilotKg, wingKg, linesKg,
    apparent: am, A6, lu6, RM, barRotationDeg, alphaWakeDeg,
    strips, hangTop, pivot,
  };
}

function flScale3(M, k) { return M.map((r) => r.map((x) => x * k)); }

/** A fresh workspace for the model's inner loop: the alpha method's
 * corrections carried from one call to the next. */
export function flightWork(model) {
  const n = model.n;
  return {
    d: new Float64Array(n).fill(-4 * Math.PI / 180),
    rhs: new Float64Array(n), gam: new Float64Array(n), theta: new Float64Array(n),
    aEff: new Float64Array(n), aGeo: new Float64Array(n), aDir: new Float64Array(n), deep: new Uint8Array(n),
    cl: new Float64Array(n), cd: new Float64Array(n), cm: new Float64Array(n),
    vp: new Float64Array(n), V: new Float64Array(3 * n), sec: [0, 0, 0], iterations: 0, residual: 0,
  };
}

/** Each strip's bend, in degrees, for the two handles' travel (mm). */
export function flightBends(model, leftMM, rightMM, out = null) {
  const { anchors, weights, chord, n } = model;
  const res = out || new Float64Array(n);
  const K2 = anchors.length; const K = K2 / 2;
  const drop = new Float64Array(K2);
  for (let k = 0; k < K2; k++) {
    const a = anchors[k];
    const h = k < K ? leftMM : rightMM;
    drop[k] = (a.gain * Math.max(0, h - a.slackMM)) / 1000;
  }
  const flap = 1 - (model.table.bendStart ?? BRAKE_SECTION.bendStart);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (const [k, w] of weights[i]) d += w * drop[k];
    res[i] = brakeBendForDrop(d / chord[i], flap) * 180 / Math.PI;
  }
  return res;
}

/**
 * Forces and moments on the glider about the riser midpoint, in the body's
 * axes, for a state [north, east, down, qw, qx, qy, qz, u, v, w, p, q, r]
 * (the riser midpoint's position, the attitude, its velocity and the
 * rotation, both in the body's axes) and the handles' travel.
 */
export function flightForces(model, x, ctrl, work) {
  const { n, rq, rc, nrm, spn, chd, chord, area, lu, rho, g, table, cfg } = model;
  const vB = [x[7], x[8], x[9]]; const wB = [x[10], x[11], x[12]];
  const R = flightRotation([x[3], x[4], x[5], x[6]]);
  const gB = [R[2][0] * g, R[2][1] * g, R[2][2] * g];
  const vW = flToBody(vB); const wW = flToBody(wB); const gW = flToBody(gB);
  flightBends(model, ctrl.left || 0, ctrl.right || 0, work.theta);
  const { d, rhs, gam, theta, aEff, aGeo, deep, cl, cd, cm, vp, V, sec } = work;
  const RAD = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const rx = rc[3 * i]; const ry = rc[3 * i + 1]; const rz = rc[3 * i + 2];
    // air past the strip: the glider's velocity and rotation, reversed
    V[3 * i] = -(vW[0] + wW[1] * rz - wW[2] * ry);
    V[3 * i + 1] = -(vW[1] + wW[2] * rx - wW[0] * rz);
    V[3 * i + 2] = -(vW[2] + wW[0] * ry - wW[1] * rx);
    const Vs = V[3 * i] * spn[3 * i] + V[3 * i + 1] * spn[3 * i + 1] + V[3 * i + 2] * spn[3 * i + 2];
    const px = V[3 * i] - Vs * spn[3 * i]; const py = V[3 * i + 1] - Vs * spn[3 * i + 1]; const pz = V[3 * i + 2] - Vs * spn[3 * i + 2];
    vp[i] = Math.hypot(px, py, pz);
    // the angle the strip meets its own air at, before the rest of the wing
    // turns it: any direction, reversed flow included
    aGeo[i] = Math.atan2(px * nrm[3 * i] + py * nrm[3 * i + 1] + pz * nrm[3 * i + 2],
      px * chd[3 * i] + py * chd[3 * i + 1] + pz * chd[3 * i + 2]);
    // Deep in the stall the lattice's small-angle strip has nothing to say:
    // such a strip meets its own air, and the lattice is only told its lift.
    deep[i] = (aGeo[i] > (brakeStallDeg(table, theta[i]) + cfg.deepStallMarginDeg) * RAD
      || aGeo[i] < -cfg.deepStallNegativeDeg * RAD) ? 1 : 0;
  }
  const twoPi = 2 * Math.PI;
  const tol = work.tol ?? cfg.couplingTol;
  const maxIt = work.maxIterations ?? cfg.couplingIterations;
  const lo = cfg.inducedMaxDeg * RAD; const hi = cfg.upwashMaxDeg * RAD;
  let resid = Infinity; let it = 0;
  for (it = 0; it < maxIt; it++) {
    for (let i = 0; i < n; i++) {
      const c = Math.cos(d[i]); const s = Math.sin(d[i]);
      rhs[i] = -(V[3 * i] * (nrm[3 * i] * c + chd[3 * i] * s)
        + V[3 * i + 1] * (nrm[3 * i + 1] * c + chd[3 * i + 1] * s)
        + V[3 * i + 2] * (nrm[3 * i + 2] * c + chd[3 * i + 2] * s));
    }
    flLuSolve(lu, rhs, gam);
    resid = 0;
    for (let i = 0; i < n; i++) {
      const clLat = (2 * gam[i]) / (Math.max(1e-6, vp[i]) * chord[i]);
      if (deep[i]) {
        const a = aGeo[i];
        aEff[i] = a;
        brakeSectionAt(table, a / RAD, theta[i], sec);
        cl[i] = sec[0]; cd[i] = sec[1]; cm[i] = sec[2];
        // the boundary condition that gives the lattice this strip's lift
        d[i] = Math.max(-cfg.correctionMaxRad, Math.min(cfg.correctionMaxRad, sec[0] / twoPi - Math.sin(a)));
        continue;
      }
      // the induced angle held to what a wing can induce
      const a = Math.max(aGeo[i] - lo, Math.min(aGeo[i] + hi, clLat / twoPi - d[i]));
      aEff[i] = a;
      brakeSectionAt(table, a / RAD, theta[i], sec);
      cl[i] = sec[0]; cd[i] = sec[1]; cm[i] = sec[2];
      const e = sec[0] - clLat;
      if (Math.abs(e) > resid) resid = Math.abs(e);
      d[i] = Math.max(-cfg.correctionMaxRad, Math.min(cfg.correctionMaxRad, d[i] + cfg.relax * e / twoPi));
    }
    if (resid < tol) break;
  }
  work.iterations = it; work.residual = resid;
  // Each strip's force is square to the flow it meets with the wing's
  // downwash in it: its geometric angle less its induced angle at the
  // lifting line, half the Trefftz plane's wash on it, so the strips' induced
  // drag adds up to the Trefftz plane's. The section's coefficients are
  // still read at the coupling's angle, which is the lattice's: it is the
  // three-quarter-chord one, whose larger downwash put the induced drag a
  // third high on Belloc's tunnel wing when the force took its direction
  // from it (1.13; docs/stability.md). A strip deep in its stall meets its
  // own air, as before.
  const { aDir } = work;
  const fromControl = cfg.inducedAngle === 'control';
  for (let i = 0; i < n; i++) {
    if (deep[i]) { aDir[i] = aGeo[i]; continue; }
    if (fromControl) { aDir[i] = aEff[i]; continue; }
    let wash = 0;
    for (let j = 0; j < n; j++) wash += model.tw[i * n + j] * gam[j];
    const ai = wash / (2 * Math.max(1e-6, vp[i]) * model.width[i]);
    aDir[i] = aGeo[i] - Math.max(-hi, Math.min(lo, ai));
  }
  // the strips' forces, on their quarter-chord lines
  const F = [0, 0, 0]; const M = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const q = 0.5 * rho * vp[i] * vp[i] * area[i];
    const ca = Math.cos(aDir[i]); const sa = Math.sin(aDir[i]);
    const ex = chd[3 * i]; const ey = chd[3 * i + 1]; const ez = chd[3 * i + 2];
    const nx = nrm[3 * i]; const ny = nrm[3 * i + 1]; const nz = nrm[3 * i + 2];
    // the flow as the whole wing leaves it, and lift square to it
    const fx = q * (cl[i] * (-sa * ex + ca * nx) + cd[i] * (ca * ex + sa * nx));
    const fy = q * (cl[i] * (-sa * ey + ca * ny) + cd[i] * (ca * ey + sa * ny));
    const fz = q * (cl[i] * (-sa * ez + ca * nz) + cd[i] * (ca * ez + sa * nz));
    const mm = q * chord[i] * cm[i];
    const rx = rq[3 * i]; const ry = rq[3 * i + 1]; const rz = rq[3 * i + 2];
    F[0] += fx; F[1] += fy; F[2] += fz;
    M[0] += ry * fz - rz * fy + mm * spn[3 * i];
    M[1] += rz * fx - rx * fz + mm * spn[3 * i + 1];
    M[2] += rx * fy - ry * fx + mm * spn[3 * i + 2];
  }
  // pilot and lines: drag along their own velocity through the air
  const dragAt = (r, area2) => {
    const v = flAdd(vW, flCross(wW, r));
    const s = flNorm(v);
    const f = flScale(v, -0.5 * rho * s * area2);
    F[0] += f[0]; F[1] += f[1]; F[2] += f[2];
    const m = flCross(r, f);
    M[0] += m[0]; M[1] += m[1]; M[2] += m[2];
    return f;
  };
  const fPilot = dragAt(model.pilotAt, model.dragPilotM2);
  dragAt(model.lineDragAt, model.dragLinesM2);
  // weight, through the solid mass's centre (the air inside floats)
  const fg = flScale(gW, model.massSolid);
  const mg = flCross(model.rSolidW, fg);
  const aeroW = [F[0], F[1], F[2]];
  const aeroMW = [M[0], M[1], M[2]];
  F[0] += fg[0]; F[1] += fg[1]; F[2] += fg[2];
  M[0] += mg[0]; M[1] += mg[1]; M[2] += mg[2];
  return { F: flToBody(F), M: flToBody(M), aero: flToBody(aeroW), aeroM: flToBody(aeroMW), pilotDrag: flToBody(fPilot), gB };
}

/** The state's rate of change: the rigid body with its apparent mass. */
export function flightDerivative(model, x, ctrl, work, info = null) {
  const { F, M, aero } = flightForces(model, x, ctrl, work);
  const v = [x[7], x[8], x[9]]; const w = [x[10], x[11], x[12]];
  const m = model.massBody; const rB = model.rBodyB; const J = model.JB;
  const pb = flScale(flAdd(v, flCross(w, rB)), m);
  const hb = flAdd(flMatVec(J, w), flScale(flCross(rB, v), m));
  let B1 = flSub(F, flCross(w, pb));
  let B2 = flSub(flSub(M, flCross(v, pb)), flCross(w, hb));
  const am = model.apparent;
  if (am) {
    const S2w = flMatVec(am.S2, w);
    const pa = flMatVec(am.Ma, flSub(flSub(v, flCross(am.rRC2R, w)), flCross(am.rPC2RC, S2w)));
    const lhs = flAdd(flMatVec(am.S2, flMatVec(am.Spr, flMatVec(am.Ma, v))), flMatVec(am.Srr, flMatVec(am.Ma, v)));
    const ha = flAdd(lhs, flMatVec(am.Ja, w));
    B1 = flSub(B1, flCross(w, pa));
    B2 = flAdd(flSub(flSub(B2, flCross(v, pa)), flCross(w, ha)), flCross(v, flMatVec(am.Ma, v)));
  }
  const acc = flLuSolve(model.lu6, Float64Array.from([...B1, ...B2]));
  const R = flightRotation([x[3], x[4], x[5], x[6]]);
  const dx = new Float64Array(13);
  const pos = flMatVec(R, v);
  dx[0] = pos[0]; dx[1] = pos[1]; dx[2] = pos[2];
  const [qw, qx, qy, qz] = [x[3], x[4], x[5], x[6]];
  dx[3] = 0.5 * (-qx * w[0] - qy * w[1] - qz * w[2]);
  dx[4] = 0.5 * (qw * w[0] + qy * w[2] - qz * w[1]);
  dx[5] = 0.5 * (qw * w[1] - qx * w[2] + qz * w[0]);
  dx[6] = 0.5 * (qw * w[2] + qx * w[1] - qy * w[0]);
  for (let k = 0; k < 6; k++) dx[7 + k] = acc[k];
  if (info) {
    info.F = F; info.M = M; info.aero = aero;
    // the specific force at the riser midpoint, felt by the pilot: G
    const a = [acc[0] + w[1] * v[2] - w[2] * v[1], acc[1] + w[2] * v[0] - w[0] * v[2], acc[2] + w[0] * v[1] - w[1] * v[0]];
    const gB = [R[2][0] * model.g, R[2][1] * model.g, R[2][2] * model.g];
    info.loadFactor = flNorm(flSub(a, gB)) / model.g;
  }
  return dx;
}

/**
 * Steady straight glide: the body's forward and down speed and its pitch at
 * which nothing accelerates, by Newton's method from a guess. `controls`
 * holds the handles ({ left, right }, mm) through it: equal, the glide stays
 * straight, and the brakes' steady polar is a trim at each travel.
 */
export function flightTrim(model, { speed = 10, alphaDeg = 5, glide = 8, guess = null, work = null, tol = 1e-8, maxIterations = 40, controls = null } = {}) {
  const wk = work || flightWork(model);
  // the coupling solved far tighter than a flight needs, so the differences
  // the Jacobian is made of are the trim's and not the coupling's noise
  const keep = [wk.tol, wk.maxIterations];
  wk.tol = 1e-11; wk.maxIterations = 600;
  // the handles where they are held: symmetric, so the trim stays in the plane
  const held = controls ? { left: controls.left ?? 0, right: controls.right ?? 0 } : { left: 0, right: 0 };
  const a0 = alphaDeg * Math.PI / 180;
  let z = guess ? [guess.u, guess.w, guess.theta] : [speed * Math.cos(a0), speed * Math.sin(a0), a0 - Math.atan(1 / glide)];
  const stateOf = (zz) => {
    const q = flightQuaternion(0, zz[2], 0);
    return Float64Array.from([0, 0, -model.cfg.altitudeM, ...q, zz[0], 0, zz[1], 0, 0, 0]);
  };
  const res = (zz) => {
    const dx = flightDerivative(model, stateOf(zz), held, wk);
    return [dx[7], dx[9], dx[11]];
  };
  let r = res(z); let norm = Math.hypot(...r); let it = 0;
  for (it = 0; it < maxIterations && norm > tol; it++) {
    const Jm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const h = [1e-4, 1e-4, 1e-5];
    for (let k = 0; k < 3; k++) {
      const zp = z.slice(); zp[k] += h[k];
      const rp = res(zp);
      for (let i = 0; i < 3; i++) Jm[i][k] = (rp[i] - r[i]) / h[k];
    }
    const luJ = flLu(Jm, 3);
    const dz = flLuSolve(luJ, Float64Array.from(r));
    // a step held to a few degrees and a fifth of the speed, so a poor
    // guess walks toward the trim rather than leaping past it
    const Vz = Math.hypot(z[0], z[1]);
    const big = Math.max(Math.abs(dz[0]) / (0.2 * Vz), Math.abs(dz[1]) / (0.2 * Vz), Math.abs(dz[2]) / 0.05, 1);
    let step = 1 / big; let zn; let rn; let nn;
    for (let ls = 0; ls < 10; ls++) {
      zn = [z[0] - step * dz[0], z[1] - step * dz[1], z[2] - step * dz[2]];
      rn = res(zn); nn = Math.hypot(...rn);
      if (nn < norm) break;
      step /= 2;
    }
    z = zn; r = rn; norm = nn;
  }
  // the coupling settled at the trim, then back to a flight's tolerance
  const info = {};
  flightDerivative(model, stateOf(z), { left: 0, right: 0 }, wk, info);
  wk.tol = keep[0]; wk.maxIterations = keep[1];
  const state = stateOf(z);
  const V = Math.hypot(z[0], z[1]);
  const alpha = Math.atan2(z[1], z[0]);
  const gamma = alpha - z[2];
  // lift and drag of everything that flies, on the wing's flat area
  const qS = 0.5 * model.rho * V * V * model.areaM2;
  const a = info.aero;
  const lift = -(a[0] * -Math.sin(alpha) + a[2] * Math.cos(alpha));
  const drag = -(a[0] * Math.cos(alpha) + a[2] * Math.sin(alpha));
  return {
    converged: norm < 1e-6, residual: norm, iterations: it, state, guess: { u: z[0], w: z[1], theta: z[2] },
    speed: V, alphaDeg: alpha * 180 / Math.PI, pitchDeg: z[2] * 180 / Math.PI,
    glideAngleDeg: gamma * 180 / Math.PI, glideRatio: 1 / Math.tan(gamma), sinkRate: V * Math.sin(gamma),
    liftCoefficient: lift / qS, dragCoefficient: drag / qS,
    canopyAlphaDeg: alpha * 180 / Math.PI + model.barRotationDeg,
    leastStripLift: Math.min(...wk.cl),
    work: wk,
  };
}

/**
 * The speed bar pushed out a row at a time from hands-up trim, each row's
 * trim found from the last, so the model follows its own equilibrium; it
 * stops at the first row whose trim would leave the wing's lift below
 * `minFlyingCz` (the floor the riser model takes for a frontal collapse) or
 * that has no trim, and keeps the row before.
 *
 * @param {(rotationDeg: number) => object} build  the flight model with the canopy turned
 * @param {object[]} rows  the speed bar's rows: { barMM, alphaDeg }, the first hands up
 * @param {object} trim0   hands-up trim
 */
export function flightBarTrim(build, rows, trim0, { minFlyingCz = 0.35 } = {}) {
  let best = { model: null, trim: trim0, barMM: rows[0]?.barMM ?? 0, rotationDeg: 0 };
  let limitedBy = null; let guess = trim0.guess;
  for (let k = 1; k < rows.length; k++) {
    const rotationDeg = rows[k].alphaDeg - rows[0].alphaDeg;
    const model = build(rotationDeg);
    let trim = null;
    try {
      trim = flightTrim(model, { guess });
    } catch (e) {
      trim = null;
    }
    if (!trim || !trim.converged) { limitedBy = { barMM: rows[k].barMM, reason: 'no trim' }; break; }
    if (trim.liftCoefficient < minFlyingCz) {
      limitedBy = { barMM: rows[k].barMM, reason: 'collapse floor', liftCoefficient: trim.liftCoefficient, canopyAlphaDeg: trim.canopyAlphaDeg };
      break;
    }
    best = { model, trim, barMM: rows[k].barMM, rotationDeg };
    guess = trim.guess;
  }
  return { ...best, fullBarMM: rows[rows.length - 1]?.barMM ?? 0, limitedBy, minFlyingCz };
}

/** The handles' travel (mm) at time t for an input. */
export function flightSchedule({ input, rate, travelMM = FLIGHT.travelMM, leadS = FLIGHT.leadS, holdS = FLIGHT.holdS, release = FLIGHT.release, rampS = null }) {
  const ramp = rampS ?? FLIGHT.rates[rate] ?? 1;
  const on = (t) => {
    if (t <= leadS) return 0;
    if (t <= leadS + ramp) return travelMM * (t - leadS) / ramp;
    if (!release || t <= leadS + ramp + holdS) return travelMM;
    const tr = t - (leadS + ramp + holdS);
    return tr >= ramp ? 0 : travelMM * (1 - tr / ramp);
  };
  return (t) => {
    const h = on(t);
    return { left: input === 'left' || input === 'both' ? h : 0, right: input === 'right' || input === 'both' ? h : 0 };
  };
}

/** How long a flight is: the lead, the pull, the hold, the release and
 * what follows it. */
export function flightDuration({ rate, leadS = FLIGHT.leadS, holdS = FLIGHT.holdS, afterS = FLIGHT.afterS, release = FLIGHT.release, rampS = null }) {
  const ramp = rampS ?? FLIGHT.rates[rate] ?? 1;
  return leadS + ramp + holdS + (release ? ramp + afterS : afterS);
}

/**
 * Fly it: from a trimmed state, the schedule's inputs, by fourth-order
 * Runge-Kutta at `dtS`, recorded `frameHz` times a second. A generator of
 * progress, as the slices' are; it returns the flight.
 */
export function* flightSteps(model, trim, { schedule, durationS, dtS = model.cfg.dtS, frameHz = model.cfg.frameHz, label = '', afterDepartureS = model.cfg.afterDepartureS }) {
  const work = trim.work || flightWork(model);
  let x = Float64Array.from(trim.state);
  const n = model.n;
  const frames = [];
  const steps = Math.ceil(durationS / dtS);
  const every = Math.max(1, Math.round(1 / (frameHz * dtS)));
  const record = (t, xx) => {
    const ctrl = schedule(t);
    const info = {};
    flightDerivative(model, xx, ctrl, work, info);
    const [roll, pitch, yaw] = flightEuler([xx[3], xx[4], xx[5], xx[6]]);
    const R = flightRotation([xx[3], xx[4], xx[5], xx[6]]);
    const v = [xx[7], xx[8], xx[9]];
    const vn = flMatVec(R, v);
    const V = flNorm(v);
    const w = [xx[10], xx[11], xx[12]];
    // the turn: the rotation about the earth's vertical, which stays
    // defined at any pitch where the heading rate from Euler angles does not
    const yawRate = R[2][0] * w[0] + R[2][1] * w[1] + R[2][2] * w[2];
    let stalled = 0; let solved = 0; let folding = 0; let deep = 0; let aMax = -Infinity; let aMin = Infinity;
    const strip = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      const aDeg = work.aEff[i] * 180 / Math.PI;
      const sD = brakeStallDeg(model.table, work.theta[i]);
      if (aDeg > sD) stalled++;
      if (work.deep[i]) deep++;
      if (work.cl[i] < model.cfg.collapseCl) folding++;
      if (brakeSectionAt(model.table, aDeg, work.theta[i]).solved) solved++;
      aMax = Math.max(aMax, aDeg); aMin = Math.min(aMin, aDeg);
      strip[3 * i] = aDeg; strip[3 * i + 1] = work.theta[i]; strip[3 * i + 2] = work.cl[i];
    }
    const alphaDeg = Math.atan2(v[2], v[0]) * 180 / Math.PI;
    const betaDeg = Math.asin(Math.max(-1, Math.min(1, v[1] / Math.max(1e-9, V)))) * 180 / Math.PI;
    const canopyAlphaDeg = alphaDeg + model.barRotationDeg;
    // the force square to the flight path, over the wing's area: its lift
    const a = info.aero; const vh = flScale(v, 1 / Math.max(1e-9, V));
    const along = flDot(a, vh);
    const liftCoefficient = flNorm(flSub(a, flScale(vh, along))) / (0.5 * model.rho * V * V * model.areaM2);
    // Departed: a quarter of the span deep in its stall, or the air meeting
    // the canopy past any angle a flying canopy meets it at. From here on a
    // real canopy deforms, spins or folds, and a rigid one cannot show how.
    const departed = deep > n / 4 || canopyAlphaDeg > model.cfg.departAlphaDeg
      || canopyAlphaDeg < -model.cfg.departNegativeAlphaDeg || Math.abs(betaDeg) > model.cfg.departBetaDeg;
    frames.push({
      t, x: xx[0], y: xx[1], z: xx[2], q: [xx[3], xx[4], xx[5], xx[6]],
      rollDeg: roll * 180 / Math.PI, pitchDeg: pitch * 180 / Math.PI, headingDeg: yaw * 180 / Math.PI,
      speed: V, alphaDeg, canopyAlphaDeg, betaDeg,
      sinkRate: vn[2], groundSpeed: Math.hypot(vn[0], vn[1]),
      rollRateDeg: w[0] * 180 / Math.PI, pitchRateDeg: w[1] * 180 / Math.PI, yawRateDeg: w[2] * 180 / Math.PI, turnRateDeg: yawRate * 180 / Math.PI,
      loadFactor: info.loadFactor, liftCoefficient, left: ctrl.left, right: ctrl.right,
      stalled, deep, folding, solved, departed, alphaMaxDeg: aMax, alphaMinDeg: aMin, coupling: work.residual, strip,
    });
  };
  record(0, x);
  let headingUnwrap = 0; let lastHeading = frames[0].headingDeg;
  frames[0].headingUnwrappedDeg = 0;
  let departedAt = null; let endedEarly = false;
  for (let s = 1; s <= steps; s++) {
    const t0 = (s - 1) * dtS;
    const c0 = schedule(t0); const ch = schedule(t0 + dtS / 2); const c1 = schedule(t0 + dtS);
    const k1 = flightDerivative(model, x, c0, work);
    const x2 = x.map((v, i) => v + 0.5 * dtS * k1[i]);
    const k2 = flightDerivative(model, x2, ch, work);
    const x3 = x.map((v, i) => v + 0.5 * dtS * k2[i]);
    const k3 = flightDerivative(model, x3, ch, work);
    const x4 = x.map((v, i) => v + dtS * k3[i]);
    const k4 = flightDerivative(model, x4, c1, work);
    for (let i = 0; i < 13; i++) x[i] += (dtS / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    const ql = Math.hypot(x[3], x[4], x[5], x[6]);
    for (let i = 3; i < 7; i++) x[i] /= ql;
    if (!x.every(Number.isFinite)) throw new Error(`flight: the state stopped being finite at ${(s * dtS).toFixed(2)} s`);
    if (s % every === 0 || s === steps) {
      record(s * dtS, x);
      const f = frames[frames.length - 1];
      let dh = f.headingDeg - lastHeading;
      if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
      headingUnwrap += dh; lastHeading = f.headingDeg;
      f.headingUnwrappedDeg = headingUnwrap;
      if (f.departed && departedAt === null) departedAt = f.t;
      yield { phase: 'flight', done: s, total: steps, t: s * dtS, label };
      // past a departure the model has nothing more to say: a moment of it
      // is kept, so the departure itself shows, and the flight ends there
      if (departedAt !== null && f.t >= departedAt + afterDepartureS) { endedEarly = true; break; }
    }
  }
  return { frames, label, dtS, frameHz, durationS, n, minFlyingCz: model.cfg.minFlyingCz, departedAt, endedEarly };
}

/** What a flight did: its extremes up to where it departed (if it did),
 * where it departed and at what travel, and how much of it flew on the
 * section table's solved part. Nothing after a departure counts toward the
 * extremes: the model has nothing to say there. */
export function flightSummary(flight, trim) {
  const F = flight.frames;
  const z0 = F[0].z;
  let maxRoll = 0; let maxPitch = -Infinity; let minPitch = Infinity; let maxTurn = 0; let maxG = 0;
  let minSpeed = Infinity; let maxSpeed = 0; let maxSink = -Infinity; let stalledPeak = 0; let foldingPeak = 0;
  let firstStall = null; let firstFold = null; let solvedMin = Infinity; let headingTotal = 0; let stalledFrames = 0;
  let departedAt = null; let lowLiftAt = null; let minLift = Infinity; let flown = 0; let lastFlown = F[0];
  const floor = flight.minFlyingCz ?? FLIGHT.minFlyingCz;
  for (const f of F) {
    if (departedAt === null && f.departed) departedAt = f;
    if (departedAt !== null) break;
    flown++; lastFlown = f;
    minLift = Math.min(minLift, f.liftCoefficient);
    if (lowLiftAt === null && f.liftCoefficient < floor) lowLiftAt = f;
    maxRoll = Math.max(maxRoll, Math.abs(f.rollDeg));
    maxPitch = Math.max(maxPitch, f.pitchDeg); minPitch = Math.min(minPitch, f.pitchDeg);
    maxTurn = Math.max(maxTurn, Math.abs(f.turnRateDeg));
    maxG = Math.max(maxG, f.loadFactor);
    minSpeed = Math.min(minSpeed, f.speed); maxSpeed = Math.max(maxSpeed, f.speed);
    maxSink = Math.max(maxSink, f.sinkRate);
    stalledPeak = Math.max(stalledPeak, f.stalled); foldingPeak = Math.max(foldingPeak, f.folding);
    if (f.stalled && firstStall === null) firstStall = f.t;
    if (f.folding && firstFold === null) firstFold = f.t;
    if (f.stalled) stalledFrames++;
    solvedMin = Math.min(solvedMin, f.solved);
    headingTotal = f.headingUnwrappedDeg ?? headingTotal;
  }
  return {
    trimSpeed: trim.speed, trimSink: trim.sinkRate, trimGlide: trim.glideRatio, trimAlphaDeg: trim.alphaDeg,
    maxRollDeg: maxRoll, maxPitchDeg: maxPitch, minPitchDeg: minPitch, maxTurnRateDeg: maxTurn,
    headingChangeDeg: headingTotal, maxLoadFactor: maxG, minSpeed, maxSpeed, maxSinkRate: maxSink,
    heightLostM: lastFlown.z - z0, flownS: lastFlown.t, durationS: F[F.length - 1].t,
    stalledStripsPeak: stalledPeak, foldingStripsPeak: foldingPeak,
    firstStallS: firstStall, firstFoldS: firstFold, stalledFraction: flown ? stalledFrames / flown : 0,
    leastSolvedStrips: solvedMin, strips: flight.n,
    departedS: departedAt ? departedAt.t : null,
    departedTravelMM: departedAt ? Math.max(departedAt.left, departedAt.right) : null,
    lowLiftS: lowLiftAt ? lowLiftAt.t : null, minLiftBeforeDeparture: minLift,
  };
}
