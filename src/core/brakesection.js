/* brakesection.js — the section with its trailing edge pulled down.
 *
 * A brake does not hinge a flap: it pulls the trailing edge down and the
 * cloth behind the last line row bends. Modelled here as the chord's aft
 * part bent into a circular arc from `bendStart` back, its length kept, the
 * surfaces carried with it — XFOIL-style flap geometry without a hinge.
 * The bend angle θ is the trailing edge's slope at the tip of the arc; the
 * drop it gives, as a fraction of the chord, is (1 - start)(1 - cos θ) / θ.
 *
 * The coefficients of such a section are wanted at every angle a strip of
 * a braked, turning, perhaps stalling wing can meet, and at every bend the
 * brakes can give, up to the cloth hanging square at 90°. mfoil (mfoil.js)
 * solves the attached flow, and does well on the default NACA 4415 up to a
 * 40° bend; past 50° it does not converge, which is where the separated
 * flow off the bend is. So:
 *
 *   - bends of 0, 10, 20, 30 and 40° are solved, swept in angle each from
 *     its neighbour's boundary layer, and smoothed (a local quadratic over
 *     ±3°: the jumps where transition moves are a few hundredths of lift
 *     and do not belong in a flight simulation);
 *   - the increments the bend adds are fitted to those, angle by angle, as
 *     1 - the lift by sin 2θ, which reproduces mfoil's to within 0.04 from
 *     5 to 40° and stops growing at 45°, where a plain flap's does; the drag
 *     by sin³θ, which also lands on the one point mfoil converges at 60°;
 *     the moment as the lift;
 *   - the stall, on the unbent section, is where the lift curve's slope
 *     falls below `stallSlopeFraction` of its linear slope — 14° on the NACA
 *     4415, where the Ohio State tunnel puts its maximum lift — and it comes
 *     earlier by `stallShiftPerDeg` a degree of bend, the trend of
 *     Heatwole's XFLR5 braking polars (the angle of maximum lift falls 7°
 *     over a drop of 0.20 of the chord);
 *   - past the stall, Viterna's extrapolation to a flat plate square to the
 *     flow (cd 2.0 in two dimensions), the plate's angle being the chord's
 *     from the nose to the bent trailing edge, and its moment from a centre
 *     of pressure moving from the quarter chord back to the middle.
 *
 * What is solved and what is extrapolated is kept with the table
 * (`solved`), so a flight can say how much of it flew on mfoil's numbers.
 */

import { mfoilModel, mfoilSolve, mfoilState } from './mfoil.js';

export const BRAKE_SECTION = Object.freeze({
  bendStart: 0.65,
  solvedThetasDeg: Object.freeze([0, 10, 20, 30, 40]),
  thetaStepDeg: 5,
  maxThetaDeg: 90,
  alphaMinDeg: -30,
  alphaMaxDeg: 90,
  solveFromDeg: -8,
  solveToDeg: 16,
  solveStepDeg: 1,
  npanel: 160,
  ncrit: 7,
  smoothHalfWidthDeg: 3,
  stallSlopeFraction: 0.3,
  stallShiftPerDeg: 0.09,
  cdMaxPlate: 2.0,
  source: 'mfoil on the bent section (0 to 40°), its increments fitted as sin 2θ and sin³θ beyond, '
    + 'the stall where the slope falls to 0.3 of its linear value and 0.09° earlier a degree of bend '
    + '(Heatwole 2022, XFLR5 braking polars), Viterna past it',
});

const BS_RAD = Math.PI / 180;

/** The trailing edge's drop, as a fraction of the chord, for a bend of
 * `thetaRad` over an arc of `flap` of the chord. */
export function brakeDropForBend(thetaRad, flap = 1 - BRAKE_SECTION.bendStart) {
  if (!(thetaRad > 1e-12)) return 0;
  return (flap * (1 - Math.cos(thetaRad))) / thetaRad;
}

/** The bend, in radians, that drops the trailing edge by `drop` of the
 * chord; capped at a right angle, where the arc's drop is 2/π of its length. */
export function brakeBendForDrop(drop, flap = 1 - BRAKE_SECTION.bendStart, maxRad = Math.PI / 2) {
  if (!(drop > 0)) return 0;
  if (drop >= brakeDropForBend(maxRad, flap)) return maxRad;
  let lo = 0; let hi = maxRad;
  for (let k = 0; k < 60; k++) {
    const m = 0.5 * (lo + hi);
    if (brakeDropForBend(m, flap) > drop) hi = m; else lo = m;
  }
  return 0.5 * (lo + hi);
}

/** A section's points with the chord behind `start` bent down through
 * `thetaDeg` at the trailing edge: each point's distance along the chord
 * kept on the arc, its height off the chord carried on the arc's normal. */
export function brakeBentPoints(points, { thetaDeg, start = BRAKE_SECTION.bendStart }) {
  const th = thetaDeg * BS_RAD;
  if (!(th > 1e-9)) return points.map((p) => [p[0], p[1]]);
  const R = (1 - start) / th;
  return points.map(([x, z]) => {
    if (x <= start) return [x, z];
    const phi = (x - start) / R;
    return [start + (R + z) * Math.sin(phi), -R + (R + z) * Math.cos(phi)];
  });
}

/** The section braked through `thetaDeg`, as an aerofoil the tool can draw. */
export function brakeBentSection(airfoil, { thetaDeg, start = BRAKE_SECTION.bendStart } = {}) {
  const points = brakeBentPoints(airfoil.points, { thetaDeg, start });
  return {
    name: `${airfoil.name || 'section'}, braked ${thetaDeg}°`,
    points,
    bendDeg: thetaDeg,
    dropFraction: brakeDropForBend(thetaDeg * BS_RAD, 1 - start),
  };
}

/**
 * The mfoil sweeps, as a generator of progress (run it with `runSteps` or
 * `runStepsAsync` from slices.js): each solved bend swept up and down from
 * the angle that converges first, every solve from its neighbour's boundary
 * layer, a failure tried again from half way. Returns the converged points.
 */
export function* brakeSectionSteps(airfoil, {
  reynolds, ncrit = BRAKE_SECTION.ncrit, npanel = BRAKE_SECTION.npanel,
  thetasDeg = BRAKE_SECTION.solvedThetasDeg, start = BRAKE_SECTION.bendStart,
  fromDeg = BRAKE_SECTION.solveFromDeg, toDeg = BRAKE_SECTION.solveToDeg, stepDeg = BRAKE_SECTION.solveStepDeg,
} = {}) {
  if (!(reynolds > 0)) throw new Error('brakesection: a Reynolds number is needed');
  if (!airfoil?.points || airfoil.points.length < 10) throw new Error('brakesection: the aerofoil has too few points');
  const levels = [];
  const perLevel = Math.round((toDeg - fromDeg) / stepDeg) + 1;
  const total = thetasDeg.length * perLevel;
  let done = 0;
  for (const thetaDeg of thetasDeg) {
    const pts = brakeBentPoints(airfoil.points, { thetaDeg, start });
    const M = mfoilModel({ x: pts.map((p) => p[0]), z: pts.map((p) => p[1]), npanel, minTEGap: 1e-4 });
    const solved = new Map();
    const solve = (a, warm) => {
      try {
        const r = mfoilSolve(M, { alpha: a, Re: reynolds, ncrit, warm: warm || false });
        return r.converged ? { r, s: mfoilState(M) } : null;
      } catch (e) {
        return null;
      }
    };
    let startDeg = null;
    for (const a of [0, 2, -2, 4, -4, 6, -6]) {
      const x = solve(a, null);
      done++;
      yield { phase: 'sections', done, total, thetaDeg, alphaDeg: a };
      if (x) { solved.set(a, x); startDeg = a; break; }
    }
    if (startDeg !== null) {
      for (const dir of [1, -1]) {
        let last = solved.get(startDeg); let lastA = startDeg; let fails = 0;
        for (let a = startDeg + dir * stepDeg; a <= toDeg + 1e-9 && a >= fromDeg - 1e-9; a += dir * stepDeg) {
          // from the last that converged; failing that, through the angle
          // half way; failing that, cold — a jump where transition or
          // separation moves stops a warm start that a cold one gets past
          let x = solve(a, last.s);
          if (!x) {
            const h = solve(0.5 * (a + lastA), last.s);
            if (h) x = solve(a, h.s);
          }
          if (!x) x = solve(a, null);
          done++;
          yield { phase: 'sections', done, total, thetaDeg, alphaDeg: a };
          if (x) { solved.set(a, x); last = x; lastA = a; fails = 0; } else if (++fails >= 2) break;
        }
      }
      // A sweep stopped well short of the top by a jump it could not cross
      // warm: started cold further up, a solution there is swept back down
      // into the gap and on up.
      let top = Math.max(...solved.keys());
      for (let a = top + 2 * stepDeg; a <= toDeg - 2 * stepDeg + 1e-9 && top < toDeg - 3 * stepDeg; a += 2 * stepDeg) {
        if (solved.has(a)) continue;
        const x0 = solve(a, null);
        done++;
        yield { phase: 'sections', done, total, thetaDeg, alphaDeg: a };
        if (!x0) continue;
        solved.set(a, x0);
        for (const dir of [-1, 1]) {
          let last = x0; let fails = 0;
          for (let b = a + dir * stepDeg; b <= toDeg + 1e-9 && b > top; b += dir * stepDeg) {
            if (solved.has(b)) { last = solved.get(b); continue; }
            let x = solve(b, last.s);
            if (!x) x = solve(b, null);
            done++;
            yield { phase: 'sections', done, total, thetaDeg, alphaDeg: b };
            if (x) { solved.set(b, x); last = x; fails = 0; } else if (++fails >= 2) break;
          }
        }
        top = Math.max(...solved.keys());
        break;
      }
    }
    const points = [...solved.keys()].sort((p, q) => p - q).map((a) => {
      const r = solved.get(a).r;
      return { alphaDeg: a, cl: r.cl, cd: r.cd, cdf: r.cdf, cm: r.cm, xtrUpper: r.xtrUpper, xtrLower: r.xtrLower };
    });
    levels.push({ thetaDeg, dropFraction: brakeDropForBend(thetaDeg * BS_RAD, 1 - start), points });
  }
  return { reynolds, ncrit, npanel, bendStart: start, levels };
}

/* ------------------------------------------------------------ the table -- */

/** A local quadratic through the points within `h` of x, tricube weighted. */
function bsLocalFit(pts, key, x, h) {
  let S0 = 0; let S1 = 0; let S2 = 0; let S3 = 0; let S4 = 0; let T0 = 0; let T1 = 0; let T2 = 0; let n = 0;
  for (const p of pts) {
    const u = (p.alphaDeg - x) / h;
    if (Math.abs(u) >= 1) continue;
    const w = (1 - Math.abs(u) ** 3) ** 3;
    const d = p.alphaDeg - x; const y = p[key];
    S0 += w; S1 += w * d; S2 += w * d * d; S3 += w * d ** 3; S4 += w * d ** 4;
    T0 += w * y; T1 += w * d * y; T2 += w * d * d * y; n++;
  }
  if (n >= 4) {
    // [S0 S1 S2; S1 S2 S3; S2 S3 S4] [a b c] = [T0 T1 T2]; the value is a
    const det = S0 * (S2 * S4 - S3 * S3) - S1 * (S1 * S4 - S3 * S2) + S2 * (S1 * S3 - S2 * S2);
    if (Math.abs(det) > 1e-12 * Math.max(1, S0 * S2 * S4)) {
      const a = (T0 * (S2 * S4 - S3 * S3) - S1 * (T1 * S4 - S3 * T2) + S2 * (T1 * S3 - S2 * T2)) / det;
      if (Number.isFinite(a)) return a;
    }
  }
  if (n >= 2) {
    const det = S0 * S2 - S1 * S1;
    if (Math.abs(det) > 1e-12) return (T0 * S2 - S1 * T1) / det;
  }
  return n ? T0 / S0 : NaN;
}

/** Linear slope of `key` against angle through the points between a and b. */
function bsSlope(pts, key, a, b) {
  const q = pts.filter((p) => p.alphaDeg >= a - 1e-9 && p.alphaDeg <= b + 1e-9);
  if (q.length < 2) return NaN;
  const mx = q.reduce((s, p) => s + p.alphaDeg, 0) / q.length;
  const my = q.reduce((s, p) => s + p[key], 0) / q.length;
  let sxx = 0; let sxy = 0;
  for (const p of q) { sxx += (p.alphaDeg - mx) ** 2; sxy += (p.alphaDeg - mx) * (p[key] - my); }
  return sxx > 0 ? sxy / sxx : NaN;
}

/** The plate's chord, nose to the bent trailing edge, against the section's. */
function bsChordTurnDeg(thetaDeg, start) {
  const th = thetaDeg * BS_RAD;
  if (!(th > 1e-9)) return 0;
  const R = (1 - start) / th;
  const xTE = start + R * Math.sin(th);
  const zTE = -R * (1 - Math.cos(th));
  return -Math.atan2(zTE, xTE) / BS_RAD;
}

/** Centre of pressure of a flat plate, back from the quarter chord to the
 * middle as the angle rises to a right angle. */
function bsPlateMoment(alphaPlateRad, cn) {
  const s = Math.abs(Math.sin(alphaPlateRad));
  const xcp = 0.25 + 0.25 * Math.sqrt(s);
  return -cn * (xcp - 0.25);
}

/**
 * The table the flight model reads: lift, drag and moment against angle
 * (from `alphaMinDeg` to `alphaMaxDeg`, a degree apart) and bend (0 to 90°,
 * five apart), built from `brakeSectionSteps`' sweeps.
 */
export function brakeSectionTable(solve, opts = {}) {
  const cfg = { ...BRAKE_SECTION, ...opts };
  const start = solve.bendStart ?? cfg.bendStart;
  const alphas = [];
  for (let a = cfg.alphaMinDeg; a <= cfg.alphaMaxDeg + 1e-9; a += 1) alphas.push(a);
  const nA = alphas.length;
  const levels = solve.levels.filter((l) => l.points.length >= 5).sort((p, q) => p.thetaDeg - q.thetaDeg);
  if (!levels.length || levels[0].thetaDeg !== 0) {
    throw new Error('brakesection: the unbent section did not solve, so there is no table to build');
  }
  // Each solved level, smoothed inside its converged range and continued
  // outside it: up to its stall on a parabola whose top is the stall, down
  // in a straight line; the drag growing as it was where the solves stop.
  const base = levels[0];
  const linSlope = bsSlope(base.points, 'cl', -4, 4);
  const att = levels.map((lv) => {
    const P = lv.points;
    const lo = P[0].alphaDeg; const hi = P[P.length - 1].alphaDeg;
    const h = cfg.smoothHalfWidthDeg;
    // widened across any gap the solves left
    const sm = (key, a) => {
      const x = Math.max(lo, Math.min(hi, a));
      for (const k of [1, 2, 4]) {
        const v = bsLocalFit(P, key, x, h * k);
        if (Number.isFinite(v)) return v;
      }
      return P.reduce((b, p) => (Math.abs(p.alphaDeg - x) < Math.abs(b.alphaDeg - x) ? p : b), P[0])[key];
    };
    const near = (a) => P.some((p) => Math.abs(p.alphaDeg - a) <= 1 + 1e-9);
    const clArr = new Float64Array(nA); const cdArr = new Float64Array(nA); const cmArr = new Float64Array(nA);
    const solvedArr = new Uint8Array(nA);
    // slopes at the ends of the converged range
    const sHi = (sm('cl', hi) - sm('cl', hi - 2)) / 2;
    const sLo = (sm('cl', lo + 2) - sm('cl', lo)) / 2;
    const cdHi = Math.max(1e-4, sm('cd', hi)); const cdHi2 = Math.max(1e-4, sm('cd', hi - 2));
    const bHi = Math.max(0.08, Math.min(0.3, Math.log(cdHi / cdHi2) / 2));
    const cdLo = Math.max(1e-4, sm('cd', lo)); const cdLo2 = Math.max(1e-4, sm('cd', lo + 2));
    const bLo = Math.max(0.03, Math.min(0.3, Math.log(cdLo / cdLo2) / 2));
    const mHi = (sm('cm', hi) - sm('cm', hi - 2)) / 2;
    // the slope criterion for this level's own stall, inside its range
    let ownStall = null;
    for (let a = Math.ceil(lo + 2); a <= hi - 1; a++) {
      const s = (sm('cl', a + 1) - sm('cl', a - 1)) / 2;
      if (a > 0 && s < cfg.stallSlopeFraction * linSlope) { ownStall = a; break; }
    }
    return {
      thetaDeg: lv.thetaDeg, lo, hi, sm, near, sHi, sLo, cdHi, bHi, cdLo, bLo, mHi, ownStall,
      clArr, cdArr, cmArr, solvedArr,
    };
  });
  // The unbent section's stall, and the earlier stall a bend gives.
  const a0 = att[0];
  const stall0 = a0.ownStall ?? a0.hi + 1;
  const stallAt = (thetaDeg, own = null) => {
    const shifted = stall0 - cfg.stallShiftPerDeg * thetaDeg;
    return own !== null ? Math.min(own, shifted) : shifted;
  };
  // A level's curve where its own solves stop: the unbent section's
  // continues on a parabola to its stall, and below in a straight line; a
  // bent one runs parallel to the next less bent level's — mfoil's own
  // shape, a little less cambered — from where its solves stop, so a level
  // stopped short by a jump in its boundary layer does not decide its
  // whole curve.
  att.forEach((L, li) => {
    L.stallDeg = stallAt(L.thetaDeg, L.ownStall);
    const prev = li > 0 ? att[li - 1] : null;
    const jOf = (a) => Math.max(0, Math.min(nA - 1, Math.round(a - alphas[0])));
    const jHi = jOf(L.hi); const jLo = jOf(L.lo);
    alphas.forEach((a, j) => {
      let cl; let cd; let cm; let solved = 0;
      if (a >= L.lo && a <= L.hi) {
        cl = L.sm('cl', a); cd = L.sm('cd', a); cm = L.sm('cm', a); solved = L.near(a) ? 1 : 0;
      } else if (prev) {
        const jb = a > L.hi ? jHi : jLo;
        const base = a > L.hi ? L.hi : L.lo;
        const ratio = Math.max(0.5, Math.min(4, L.sm('cd', base) / Math.max(1e-4, prev.cdArr[jb])));
        cl = L.sm('cl', base) + (prev.clArr[j] - prev.clArr[jb]);
        cd = L.sm('cd', base) + ratio * (prev.cdArr[j] - prev.cdArr[jb]);
        cm = L.sm('cm', base) + (prev.cmArr[j] - prev.cmArr[jb]);
      } else if (a > L.hi) {
        const x = a - L.hi;
        const X = Math.max(1, L.stallDeg - L.hi);
        const xx = Math.min(x, X);
        cl = L.sm('cl', L.hi) + (L.sHi > 0 ? L.sHi * xx - (L.sHi * xx * xx) / (2 * X) : 0);
        cd = L.cdHi * Math.exp(Math.min(0.15, L.bHi) * Math.min(x, X + 2));
        cm = L.sm('cm', L.hi) + Math.max(-0.02, Math.min(0.02, L.mHi)) * Math.min(x, X);
      } else {
        const x = L.lo - a;
        cl = L.sm('cl', L.lo) - L.sLo * x;
        cd = L.cdLo * Math.exp(Math.min(0.15, L.bLo) * Math.min(x, 12));
        cm = L.sm('cm', L.lo);
      }
      L.clArr[j] = cl; L.cdArr[j] = Math.max(1e-4, cd); L.cmArr[j] = cm; L.solvedArr[j] = solved;
    });
  });
  // The bend's increments, angle by angle, fitted to the solved levels.
  const bent = att.filter((L) => L.thetaDeg > 0);
  const CL = new Float64Array(nA); const CD = new Float64Array(nA); const CM = new Float64Array(nA);
  for (let j = 0; j < nA; j++) {
    let sl = 0; let ssl = 0; let sd = 0; let ssd = 0; let smm = 0;
    for (const L of bent) {
      const t = L.thetaDeg * BS_RAD;
      const s2 = Math.sin(2 * Math.min(t, Math.PI / 4)); const s3 = Math.sin(t) ** 3;
      sl += (L.clArr[j] - a0.clArr[j]) * s2; ssl += s2 * s2;
      sd += (L.cdArr[j] - a0.cdArr[j]) * s3; ssd += s3 * s3;
      smm += (L.cmArr[j] - a0.cmArr[j]) * s2;
    }
    CL[j] = ssl > 0 ? sl / ssl : 0;
    CD[j] = ssd > 0 ? Math.max(0, sd / ssd) : 0;
    CM[j] = ssl > 0 ? smm / ssl : 0;
  }
  const lastSolved = att[att.length - 1];
  const negStall = Math.min(-10, Math.min(...att.map((L) => L.lo)) - 2);
  const thetas = [];
  for (let t = 0; t <= cfg.maxThetaDeg + 1e-9; t += cfg.thetaStepDeg) thetas.push(t);
  const nT = thetas.length;
  const cl = new Float64Array(nT * nA); const cd = new Float64Array(nT * nA); const cm = new Float64Array(nT * nA);
  const solvedMask = new Uint8Array(nT * nA);
  const stallDeg = new Float64Array(nT);
  thetas.forEach((tDeg, k) => {
    // attached flow at this bend
    const aCl = new Float64Array(nA); const aCd = new Float64Array(nA); const aCm = new Float64Array(nA);
    let own = null;
    if (tDeg <= lastSolved.thetaDeg + 1e-9) {
      let i = 0;
      while (i < att.length - 2 && att[i + 1].thetaDeg < tDeg - 1e-9) i++;
      const A = att[i]; const B = att[Math.min(att.length - 1, i + 1)];
      const f = B.thetaDeg > A.thetaDeg ? (tDeg - A.thetaDeg) / (B.thetaDeg - A.thetaDeg) : 0;
      for (let j = 0; j < nA; j++) {
        aCl[j] = A.clArr[j] + f * (B.clArr[j] - A.clArr[j]);
        aCd[j] = A.cdArr[j] + f * (B.cdArr[j] - A.cdArr[j]);
        aCm[j] = A.cmArr[j] + f * (B.cmArr[j] - A.cmArr[j]);
        solvedMask[k * nA + j] = (f < 1e-9 ? A.solvedArr[j] : (A.solvedArr[j] && B.solvedArr[j])) ? 1 : 0;
      }
      if (f < 1e-9 && A.ownStall !== null) own = A.ownStall;
    } else {
      const t = tDeg * BS_RAD; const tl = lastSolved.thetaDeg * BS_RAD;
      const ds2 = Math.sin(2 * Math.min(t, Math.PI / 4)) - Math.sin(2 * Math.min(tl, Math.PI / 4));
      const ds3 = Math.sin(t) ** 3 - Math.sin(tl) ** 3;
      for (let j = 0; j < nA; j++) {
        aCl[j] = lastSolved.clArr[j] + CL[j] * ds2;
        aCd[j] = lastSolved.cdArr[j] + CD[j] * ds3;
        aCm[j] = lastSolved.cmArr[j] + CM[j] * ds2;
      }
    }
    const aS = stallAt(tDeg, own);
    stallDeg[k] = aS;
    const turn = bsChordTurnDeg(tDeg, start);
    // the stall point, on the attached curve
    const js = Math.max(0, Math.min(nA - 2, Math.floor(aS - alphas[0])));
    const fs = aS - alphas[js];
    const clS = aCl[js] + fs * (aCl[js + 1] - aCl[js]);
    const cdS = aCd[js] + fs * (aCd[js + 1] - aCd[js]);
    const cmS = aCm[js] + fs * (aCm[js + 1] - aCm[js]);
    const pS = (aS + turn) * BS_RAD;
    const B1 = cfg.cdMaxPlate; const A1 = B1 / 2;
    const A2 = ((clS - B1 * Math.sin(pS) * Math.cos(pS)) * Math.sin(pS)) / (Math.cos(pS) ** 2);
    const B2 = (cdS - B1 * Math.sin(pS) ** 2) / Math.cos(pS);
    const cnS = clS * Math.cos(pS) + cdS * Math.sin(pS);
    const cmOff = cmS - bsPlateMoment(pS, cnS);
    // and at negative angles, where the canopy has long since folded: the
    // same plate, from the lowest angle any level solved, so the table stays
    // bounded rather than claiming anything there
    // Viterna's own form there would divide by the plate's angle, and a bend
    // turns the plate's chord enough that its angle passes through nothing
    // inside this range: a strip at -14° on a 79° bend read a lift of 198.
    // So the plate's bounded shape (lift sin 2p, drag 2 sin^2 p), joined to
    // the attached curve where the two meet.
    const jn = Math.max(0, Math.min(nA - 1, Math.round(negStall - alphas[0])));
    const pN = (alphas[jn] + turn) * BS_RAD;
    const plateL = (p) => A1 * Math.sin(2 * p);
    const plateD = (p) => B1 * Math.sin(p) ** 2;
    const cdFloor = Math.min(...aCd);
    for (let j = 0; j < nA; j++) {
      const a = alphas[j];
      let vl; let vd; let vm;
      if (a < alphas[jn]) {
        const p = Math.max(-Math.PI / 2, (a + turn) * BS_RAD);
        vl = aCl[jn] + (plateL(p) - plateL(pN));
        // never below the section's own least drag, where the plate's
        // chord lies along the flow
        vd = Math.max(cdFloor, aCd[jn] + (plateD(p) - plateD(pN)));
        vm = aCm[jn] + (bsPlateMoment(p, vl * Math.cos(p) + vd * Math.sin(p))
          - bsPlateMoment(pN, aCl[jn] * Math.cos(pN) + aCd[jn] * Math.sin(pN)));
        solvedMask[k * nA + j] = 0;
      } else if (a <= aS) {
        vl = aCl[j]; vd = aCd[j]; vm = aCm[j];
      } else {
        const p = Math.min(Math.PI / 2, (a + turn) * BS_RAD);
        vl = A1 * Math.sin(2 * p) + (A2 * Math.cos(p) ** 2) / Math.sin(p);
        vd = B1 * Math.sin(p) ** 2 + B2 * Math.cos(p);
        const cn = vl * Math.cos(p) + vd * Math.sin(p);
        // the attached moment's offset, faded out by a right angle
        vm = bsPlateMoment(p, cn) + cmOff * Math.cos(p) / Math.max(1e-6, Math.cos(pS));
        solvedMask[k * nA + j] = 0;
      }
      cl[k * nA + j] = vl; cd[k * nA + j] = Math.max(1e-4, vd); cm[k * nA + j] = vm;
    }
  });
  return {
    alphas: Float64Array.from(alphas), thetas: Float64Array.from(thetas), nA, nT,
    cl, cd, cm, solved: solvedMask, stallDeg,
    reynolds: solve.reynolds, ncrit: solve.ncrit, bendStart: start,
    stall0Deg: stall0, cdMaxPlate: cfg.cdMaxPlate,
    solvedLevels: levels.map((l) => ({ thetaDeg: l.thetaDeg, points: l.points.length, fromDeg: l.points[0].alphaDeg, toDeg: l.points[l.points.length - 1].alphaDeg })),
    increments: { lift: CL, drag: CD, moment: CM },
  };
}

/**
 * The section at an angle and a bend, read off the table between its
 * points: { cl, cd, cm, stalled, solved }. Past the table's angles it is
 * the flat plate's; `out` (an array of 3) takes the coefficients without
 * allocating, for the flight model's inner loop.
 */
export function brakeSectionAt(table, alphaDeg, thetaDeg, out = null) {
  const { alphas, thetas, nA, nT, cl, cd, cm } = table;
  const t = Math.max(0, Math.min(thetas[nT - 1], thetaDeg));
  let k = Math.min(nT - 2, Math.floor((t - thetas[0]) / (thetas[1] - thetas[0])));
  k = Math.max(0, k);
  const ft = (t - thetas[k]) / (thetas[k + 1] - thetas[k]);
  let a = alphaDeg;
  // Beyond the table — reversed flow, or a strip upside down in a tumble —
  // a plate at its own angle (the chord turned by the bend), carried on from
  // the table's edge so nothing jumps where the table stops.
  if (a > alphas[nA - 1] || a < alphas[0]) {
    const edge = a > alphas[nA - 1] ? alphas[nA - 1] : alphas[0];
    const e = brakeSectionAt(table, edge, t, [0, 0, 0]);
    const turn = bsChordTurnDeg(t, table.bendStart ?? BRAKE_SECTION.bendStart);
    const p = (a + turn) * BS_RAD; const pe = (edge + turn) * BS_RAD;
    const B1 = table.cdMaxPlate;
    const vl = e[0] + (B1 / 2) * (Math.sin(2 * p) - Math.sin(2 * pe));
    const vd = Math.max(0.02, e[1] + B1 * (Math.sin(p) ** 2 - Math.sin(pe) ** 2));
    const vm = e[2] + bsPlateMoment(p, vl * Math.cos(p) + vd * Math.sin(p))
      - bsPlateMoment(pe, e[0] * Math.cos(pe) + e[1] * Math.sin(pe));
    if (out) { out[0] = vl; out[1] = vd; out[2] = vm; return out; }
    return { cl: vl, cd: vd, cm: vm, stalled: true, solved: false };
  }
  let j = Math.min(nA - 2, Math.floor(a - alphas[0]));
  j = Math.max(0, j);
  const fa = a - alphas[j];
  const i00 = k * nA + j; const i01 = i00 + 1; const i10 = i00 + nA; const i11 = i10 + 1;
  const w00 = (1 - ft) * (1 - fa); const w01 = (1 - ft) * fa; const w10 = ft * (1 - fa); const w11 = ft * fa;
  const vl = w00 * cl[i00] + w01 * cl[i01] + w10 * cl[i10] + w11 * cl[i11];
  const vd = w00 * cd[i00] + w01 * cd[i01] + w10 * cd[i10] + w11 * cd[i11];
  const vm = w00 * cm[i00] + w01 * cm[i01] + w10 * cm[i10] + w11 * cm[i11];
  if (out) { out[0] = vl; out[1] = vd; out[2] = vm; return out; }
  const sD = table.stallDeg[k] + ft * (table.stallDeg[k + 1] - table.stallDeg[k]);
  const sv = table.solved;
  return {
    cl: vl, cd: vd, cm: vm, stalled: alphaDeg > sD, stallDeg: sD,
    solved: !!(sv[i00] && sv[i01] && (ft < 1e-9 || (sv[i10] && sv[i11]))),
  };
}

/** The stall angle at a bend, between the table's levels. */
export function brakeStallDeg(table, thetaDeg) {
  const { thetas, nT } = table;
  const t = Math.max(0, Math.min(thetas[nT - 1], thetaDeg));
  const k = Math.max(0, Math.min(nT - 2, Math.floor((t - thetas[0]) / (thetas[1] - thetas[0]))));
  const ft = (t - thetas[k]) / (thetas[k + 1] - thetas[k]);
  return table.stallDeg[k] + ft * (table.stallDeg[k + 1] - table.stallDeg[k]);
}
