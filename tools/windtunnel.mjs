/* windtunnel.mjs — Belloc's wind-tunnel paraglider, built and flown as the
 * tool builds and flies its own wings, for the tests to hold the tool's
 * aerodynamics to a measured wing.
 *
 * Belloc (2015) tested a rigid 1/8 model of a paraglider wing at 40 m/s:
 * lift, drag and pitching moment against the angle of attack, and the side
 * force, rolling and yawing moments against the sideslip
 * (data/reference/belloc-2015-tunnel.tsv). Its geometry is published section
 * by section (data/reference/belloc-2015-model.tsv) and every section is a
 * NACA 23015, solved here with mfoil (belloc-2015-naca23015.tsv).
 *
 * Two of the tool's routes through the air are run on it: the slices' (the
 * lattice coupled to the sections' polars at each slice's Reynolds number,
 * slices.js) and the flight model's (flight.js), whose forces the stability
 * derivatives are made of.
 */
import { readFileSync } from 'node:fs';
import { sliceStations, coupleSlices, polarGridAt } from '../src/core/slices.js';
import { latticeSystem } from '../src/core/vlm.js';
import { brakeSectionTable } from '../src/core/brakesection.js';
import { flightModel, flightForces, flightWork } from '../src/core/flight.js';
import { naca5 } from '../src/core/airfoil.js';

const REF = new URL('../data/reference/', import.meta.url);
const rows = (file) => readFileSync(new URL(file, REF), 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#')).slice(1).map((l) => l.split('\t'));

/** The test's conditions and the coefficients' reference, as the model's
 * file states them. */
export const BELLOC = Object.freeze({
  speedMS: 40, density: 1.187, reynoldsCentral: 0.92e6, centralChordM: 0.35,
  areaM2: 0.444, lengthM: 0.35, refBackM: 0.0875, refBelowM: 1.0,
});

/** The published points, left tip to right tip: y, z (down), chord, torsion. */
export function bellocPoints() {
  return rows('belloc-2015-model.tsv').map(([i, y, z, c, t]) => ({ i: +i, y: +y, zDown: +z, chord: +c, torsionDeg: +t }));
}

/**
 * The right half as the tool's ribs, centre to tip, `perSegment` to each of
 * the table's six segments: each rib in the plane square to the arc (the
 * mean of the two segments' at a point), its chord fore and aft through its
 * 0.6 chord point, turned nose up by its torsion. The wing's frame is the
 * tool's: x aft, y right, z up, the central 0.6 chord point at the origin.
 */
export function bellocWing({ perSegment = 4 } = {}) {
  const P = bellocPoints().filter((p) => p.y >= 0).map((p) => ({ y: p.y, z: -p.zDown - 0.375, c: p.chord, th: p.torsionDeg }));
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i].y - P[i - 1].y, P[i].z - P[i - 1].z));
  const dir = (a, b) => { const l = Math.hypot(b.y - a.y, b.z - a.z); return [(b.y - a.y) / l, (b.z - a.z) / l]; };
  const tangentAt = (i) => {
    if (i === 0) return [1, 0];
    const a = P[Math.max(0, i - 1)]; const b = P[Math.min(P.length - 1, i + 1)];
    return dir(a, b);
  };
  const ribs = [];
  for (let seg = 0; seg < P.length - 1; seg++) {
    const last = seg === P.length - 2;
    for (let k = 0; k < perSegment + (last ? 1 : 0); k++) {
      const f = k / perSegment;
      const a = P[seg]; const b = P[seg + 1];
      const y = a.y + f * (b.y - a.y); const z = a.z + f * (b.z - a.z);
      const c = a.c + f * (b.c - a.c); const th = (a.th + f * (b.th - a.th)) * Math.PI / 180;
      const t = k === 0 ? tangentAt(seg) : f === 1 ? tangentAt(seg + 1) : dir(a, b);
      const n = [0, -t[1], t[0]];
      const u = [Math.cos(th), -Math.sin(th) * n[1], -Math.sin(th) * n[2]];
      const v = [Math.sin(th), Math.cos(th) * n[1], Math.cos(th) * n[2]];
      const origin = [-0.6 * c * u[0], y - 0.6 * c * u[1], z - 0.6 * c * u[2]];
      ribs.push({ station: L[seg] + f * (L[seg + 1] - L[seg]), chord: c, alphaDeg: th * 180 / Math.PI, frame: { origin, u, v, w: [0, t[0], t[1]] } });
    }
  }
  return { ribs, name: 'Belloc (2015), the 1/8 wind-tunnel model' };
}

/** T1, the moments' point, in the wing's frame. */
export function bellocMomentPoint(wing) {
  const le = wing.ribs[0].frame.origin;
  return [le[0] + BELLOC.refBackM, 0, le[2] - BELLOC.refBelowM];
}

/** The measurements (and Heatwole's models), as rows. */
export function bellocTunnel() {
  return rows('belloc-2015-tunnel.tsv').map(([set, method, coefficient, sweep, held, angle, value]) => ({
    set, method, coefficient, sweep, heldDeg: +held, angleDeg: +angle, value: +value,
  }));
}

/** One curve, sorted by its angle: [[angle, value], ...]. */
export function bellocCurve(all, { set = 'figures', method = 'tunnel', coefficient, sweep, heldDeg }) {
  return all.filter((r) => r.set === set && r.method === method && r.coefficient === coefficient
    && r.sweep === sweep && r.heldDeg === heldDeg).map((r) => [r.angleDeg, r.value]).sort((p, q) => p[0] - q[0]);
}

/** Least-squares slope of a curve between two angles, per degree. */
export function slopeBetween(curve, lo, hi) {
  const p = curve.filter(([x]) => x >= lo - 1e-9 && x <= hi + 1e-9);
  const n = p.length;
  const mx = p.reduce((s, [x]) => s + x, 0) / n; const my = p.reduce((s, [, y]) => s + y, 0) / n;
  let sxx = 0; let sxy = 0;
  for (const [x, y] of p) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
  return { slope: sxy / sxx, intercept: my - (sxy / sxx) * mx, n };
}

/** The NACA 23015's solves: the slices' grid, and the flight model's section. */
export function bellocSections() {
  const all = rows('belloc-2015-naca23015.tsv').map((r) => r.map((v, k) => (k === 0 ? v : Number(v))));
  const g = all.filter((r) => r[0] === 'grid');
  const reynolds = [...new Set(g.map((r) => r[1]))].sort((a, b) => a - b);
  const grid = {
    reynolds, ncrit: 9,
    rows: reynolds.map((Re) => g.filter((r) => r[1] === Re).map((r) => ({
      alphaDeg: r[3], converged: true, cl: r[4], cd: r[5], cdf: r[6], cm: r[7], xtrUpper: r[8], xtrLower: r[9],
    }))),
  };
  const fl = all.filter((r) => r[0] === 'flight');
  const levels = [...new Set(fl.map((r) => r[2]))].sort((a, b) => a - b).map((th) => ({
    thetaDeg: th,
    points: fl.filter((r) => r[2] === th).map((r) => ({ alphaDeg: r[3], cl: r[4], cd: r[5], cdf: r[6], cm: r[7], xtrUpper: r[8], xtrLower: r[9] })),
  }));
  const flight = { reynolds: fl[0][1], ncrit: 9, npanel: 160, bendStart: 0.65, levels };
  return { grid, flight };
}

/** The section the slices and the flight are solved on. */
export function bellocAirfoil() { return naca5('23015', 120); }

/**
 * The slices' route at one angle: the lattice coupled to the grid at each
 * slice's own Reynolds number, the forces as the slices take them. Lift and
 * drag in the wind's axes (the drag the Trefftz plane's and the sections'),
 * the pitching moment about T1, all on Belloc's reference.
 */
export function bellocSlices(alphaDeg, { wing = bellocWing(), grid = bellocSections().grid } = {}) {
  const slices = sliceStations(wing);
  const { speedMS: V, density: rho, areaM2, lengthM } = BELLOC;
  const mu = rho * V * BELLOC.centralChordM / BELLOC.reynoldsCentral;
  const Q = 0.5 * rho * V * V;
  const sys = latticeSystem(slices.map((s) => s.strip), { alphaDeg });
  const c = coupleSlices({
    slices, alphaDeg, system: sys, zeroLiftDeg: -1.2, tol: 1e-9, maxIterations: 4000,
    sectionAt: (i, a) => polarGridAt(grid, (rho * V * slices[i].chord) / mu, a),
  });
  const al = sys.alpha;
  const liftDir = [-Math.sin(al), 0, Math.cos(al)]; const dragDir = [Math.cos(al), 0, Math.sin(al)];
  const T1 = bellocMomentPoint(wing);
  let L = 0; let Dp = 0; let My = 0;
  slices.forEach((s, i) => {
    const f = c.forces[i].map((v) => v * 2 * Q);
    L += f[0] * liftDir[0] + f[2] * liftDir[2];
    const dp = Q * c.section[i].cd * s.chord * s.lengthM;
    Dp += dp;
    const r = [s.quarterChord[0] - T1[0], s.quarterChord[1] - T1[1], s.quarterChord[2] - T1[2]];
    const F = [f[0] + dragDir[0] * dp, f[1], f[2] + dragDir[2] * dp];
    My += r[2] * F[0] - r[0] * F[2] + c.section[i].cm * Q * s.chord * s.chord * s.lengthM * s.spanDir[1];
  });
  const qS = Q * areaM2;
  return {
    alphaDeg, CL: L / qS, CD: (c.inducedOverQ * Q + Dp) / qS, CDi: (c.inducedOverQ * Q) / qS, CDp: Dp / qS,
    Cm: My / (qS * lengthM), converged: c.converged,
  };
}

/** The flight model of Belloc's wing, hung from T1, its wake along `alphaWakeDeg`. */
export function bellocFlightModel(alphaWakeDeg, { wing = bellocWing(), table = brakeSectionTable(bellocSections().flight), settings = {} } = {}) {
  return flightModel({
    wing, linePlan: { karabiner: bellocMomentPoint(wing) }, airfoil: bellocAirfoil(), table,
    atm: { density: BELLOC.density, gravity: 9.80665 },
    pilotKg: 0, wingKg: 1, linesKg: 0, areaM2: BELLOC.areaM2, cxPilot: 0, cxLines: 0,
    alphaWakeDeg, settings: { apparentMass: false, ...settings },
  });
}

/** The flight model's aerodynamic coefficients at an angle and a sideslip,
 * about T1, on Belloc's reference: lift and drag in the wind's axes, the
 * rest in the body's. */
export function bellocFlightCoefficients(model, alphaDeg, betaDeg, work = null) {
  const w = work || Object.assign(flightWork(model), { tol: 1e-10, maxIterations: 3000 });
  const V = BELLOC.speedMS;
  const a = alphaDeg * Math.PI / 180; const b = betaDeg * Math.PI / 180;
  const x = Float64Array.from([0, 0, -1000, 1, 0, 0, 0, V * Math.cos(a) * Math.cos(b), V * Math.sin(b), V * Math.sin(a) * Math.cos(b), 0, 0, 0]);
  const f = flightForces(model, x, { left: 0, right: 0 }, w);
  const F = f.aero; const M = f.aeroM;
  const qS = 0.5 * BELLOC.density * V * V * BELLOC.areaM2;
  return {
    CL: -(F[0] * -Math.sin(a) + F[2] * Math.cos(a)) / qS,
    CD: -(F[0] * Math.cos(a) + F[2] * Math.sin(a)) / qS,
    CY: F[1] / qS, Cl: M[0] / (qS * BELLOC.lengthM), Cm: M[1] / (qS * BELLOC.lengthM), Cn: M[2] / (qS * BELLOC.lengthM),
  };
}
