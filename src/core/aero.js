/* aero.js — section and wing aerodynamics.
 *
 * Three layers, deliberately separated because they have very different
 * levels of trustworthiness:
 *
 *   1. **Thin-airfoil theory** for zero-lift angle and pitching moment from
 *      the camber line. This is exact potential-flow theory for a thin
 *      section, and it is what makes reflex quantitative rather than a
 *      feeling — a reflexed camber line has a positive Cm0 and you can read
 *      the number off.
 *
 *   2. **Lifting line** for the 3D behaviour. Prandtl's monoplane equation
 *      solved as a Fourier series over the real planform and twist, giving
 *      the span loading, the induced drag, and the Oswald factor as results
 *      rather than as assumptions. This replaces the single hand-typed
 *      Oswald number the equilibrium solver has been using.
 *
 *   3. **A viscous drag correlation** — flat-plate skin friction with a form
 *      factor and a crude laminar run. This is the weak layer, and it is
 *      labelled as such everywhere it appears. It is an estimate to design
 *      against, not an answer. For real numbers, export to XFOIL (see
 *      xfoil.js) and import the polar back; the wing analysis will then use
 *      measured section data and only layers 1 and 2 remain modelled.
 */

import { simpson, rad, deg, clamp } from './num.js';
import { splitSurfaces } from './airfoil.js';
import { nonDimensional } from './atmosphere.js';

/* ------------------------------------------------------- camber geometry -- */

/**
 * Mean camber line of any section, sampled in the cosine-spaced coordinate
 * thin-airfoil theory is written in: x = (1 - cos t)/2.
 */
export function camberLine(airfoil, n = 200) {
  // `n` is a sample count, not a physical quantity.
  //
  // `thinAirfoil(af, 6)` once meant six samples and read like six degrees,
  // and put a 9% error into the zero-lift angle without failing anything.
  // Every function with this shape carries the same hazard, so every one
  // of them refuses a value too small to be a plausible sample count.
  if (!(n >= 20)) {
    throw new Error(`camberLine: n is a sample count, not a physical `
      + `quantity (got ${n})`);
  }
  const { upper, lower } = splitSurfaces(airfoil);
  const at = (poly, x) => {
    for (let i = 1; i < poly.length; i++) {
      if (poly[i][0] >= x) {
        const span = poly[i][0] - poly[i - 1][0] || 1;
        const f = clamp((x - poly[i - 1][0]) / span, 0, 1);
        return poly[i - 1][1] + f * (poly[i][1] - poly[i - 1][1]);
      }
    }
    return poly[poly.length - 1][1];
  };
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (Math.PI * i) / n;
    const x = (1 - Math.cos(t)) / 2;
    pts.push({ t, x, y: (at(upper, x) + at(lower, x)) / 2 });
  }
  return pts;
}

/**
 * Thin-airfoil theory results for a camber line.
 *
 *   alpha_L0 = -(1/pi) * integral_0^pi (dyc/dx)(cos t - 1) dt
 *   Cm_c/4   =  (pi/4) * (A2 - A1),  An = (2/pi) * integral (dyc/dx) cos(nt) dt
 *            =  (1/2)  * integral_0^pi (dyc/dx)(cos 2t - cos t) dt
 *
 * Both integrals are in the cosine coordinate, where the leading-edge
 * singularity in dyc/dx is integrable — which is the whole reason the theory
 * is written this way.
 *
 * Note the 1/2 on the moment, not 1/4: the (pi/4) prefactor multiplies
 * coefficients that each already carry a 2/pi. Checked against the standard
 * worked example for NACA 2412, which gives alpha_L0 = -2.07 deg and
 * Cm_c/4 = -0.0531.
 *
 * These are inviscid, zero-thickness results. Thin-airfoil theory reliably
 * overpredicts the magnitude of Cm for a real section — measured Cm for
 * NACA 4412 is about -0.093 against a theoretical -0.106 — so treat the
 * moment as an upper bound and use XFOIL when the number matters.
 */
export function thinAirfoil(airfoil, opts = 400) {
  // Accepts a sample count, or `{ samples }`. It does NOT take an angle of
  // attack — the zero-lift angle and Cm0 are properties of the section, not
  // of the angle it is flown at.
  //
  // Two call sites passed an angle here, because both arguments are numbers
  // and `thinAirfoil(af, 6)` reads like six degrees. It means six samples,
  // and it put a 9% error into the zero-lift angle of the coupled
  // equilibrium solve without failing anything.
  //
  // A plausible sample count is large; a plausible angle of attack is small.
  // Anything under 20 was almost certainly meant as an angle.
  if (typeof opts === 'number' && opts > 0 && opts < 20) {
    throw new Error(`thinAirfoil takes a sample count, not an angle of attack `
      + `(got ${opts}). The zero-lift angle and Cm0 do not depend on alpha.`);
  }
  const n = typeof opts === 'object' && opts ? (opts.samples ?? 400) : opts;
  const cl = camberLine(airfoil, n);
  const slope = (i) => {
    const a = cl[Math.max(0, i - 1)];
    const b = cl[Math.min(cl.length - 1, i + 1)];
    return (b.y - a.y) / (b.x - a.x || 1e-12);
  };

  let iA = 0;
  let iM = 0;
  for (let i = 1; i < cl.length; i++) {
    const dt = cl[i].t - cl[i - 1].t;
    const s0 = slope(i - 1);
    const s1 = slope(i);
    const f0 = s0 * (Math.cos(cl[i - 1].t) - 1);
    const f1 = s1 * (Math.cos(cl[i].t) - 1);
    iA += ((f0 + f1) / 2) * dt;
    const g0 = s0 * (Math.cos(2 * cl[i - 1].t) - Math.cos(cl[i - 1].t));
    const g1 = s1 * (Math.cos(2 * cl[i].t) - Math.cos(cl[i].t));
    iM += ((g0 + g1) / 2) * dt;
  }

  const alphaL0 = -iA / Math.PI;      // radians
  const cmQuarter = iM / 2;

  return {
    alphaL0Rad: alphaL0,
    alphaL0Deg: deg(alphaL0),
    cm0: cmQuarter,
    liftSlopePerRad: 2 * Math.PI,
    camber: cl,
  };
}

/* --------------------------------------------------------- section polar -- */

/**
 * Skin-friction based profile drag. Mixed laminar/turbulent flat plate with a
 * thickness form factor.
 *
 * This is a correlation, not a boundary-layer solution. It has no notion of a
 * separation bubble, which is exactly what dominates a paraglider section at
 * the Reynolds numbers it actually flies. Treat it as a floor.
 */
/**
 * `surfaceFactor` — a paraglider is not a smooth aerofoil.
 *
 * The calculation below is a flat-plate skin friction with a form factor:
 * right for a polished rigid section, and optimistic for a wing whose surface
 * is fabric, scalloped between ribs by the billow, seamed at every cell and
 * open at the nose. Published estimates put a ram-air wing at somewhere
 * between 1.3 and 2 times a smooth section of the same thickness.
 *
 * It defaults to 1.0 — the smooth-aerofoil value — so nothing changes for
 * anyone who does not set it, and the assumption is visible rather than
 * folded into a constant. `estimateSectionPolar` already marks its output
 * `source: 'estimated'`; this says *which* estimate.
 */
export function profileDrag({
  reynolds, thickness, transition = 0.35, surfaceFactor = 1.0,
}) {
  const Re = Math.max(1e3, reynolds);
  const cfLam = 1.328 / Math.sqrt(Re);
  const cfTurb = 0.455 / Math.pow(Math.log10(Re), 2.58);
  const cf = transition * cfLam + (1 - transition) * cfTurb;
  const tc = thickness;
  const formFactor = 1 + 2 * tc + 60 * Math.pow(tc, 4);
  const wetted = 2.02;                 // wetted area / planform area
  return cf * formFactor * wetted * surfaceFactor;
}

/**
 * A 2D section polar from theory plus correlation. `source: 'estimated'`
 * marks it so nothing downstream can mistake it for measured data.
 */
export function estimateSectionPolar(airfoil, {
  reynolds, mach = 0, alphas = null, surfaceFactor = 1.0,
}) {
  const ta = thinAirfoil(airfoil);
  const t = airfoil.metrics.maxThickness;
  const cd0 = profileDrag({ reynolds, thickness: t, surfaceFactor });

  // Maximum lift falls off with Reynolds number. This is a rough fit to the
  // usual behaviour of cambered sections, not a prediction.
  const clMax = clamp(1.10 + 0.35 * Math.log10(reynolds / 1e6), 0.55, 1.75)
    + 6 * Math.abs(ta.cm0);

  const beta = mach < 0.95 ? Math.sqrt(1 - mach * mach) : NaN;
  const slope = (2 * Math.PI) / (beta || 1);

  const list = alphas || Array.from({ length: 41 }, (_, i) => -6 + i * 0.5);
  const points = list.map((aDeg) => {
    const clLinear = slope * (rad(aDeg) - ta.alphaL0Rad);
    const cl = clamp(clLinear, -clMax, clMax);
    const stalled = Math.abs(clLinear) > clMax;
    // Viscous drag rise away from the minimum-drag lift.
    const cd = cd0 * (1 + 1.4 * Math.pow(cl - 0.25, 2)) + (stalled ? 0.05 : 0);
    return { alphaDeg: aDeg, cl, cd, cm: ta.cm0, stalled };
  });

  return {
    source: 'estimated',
    reynolds,
    mach,
    alphaL0Deg: ta.alphaL0Deg,
    cm0: ta.cm0,
    clMax,
    cd0,
    liftSlopePerRad: slope,
    points,
  };
}

/* ----------------------------------------------------------- lifting line -- */

/**
 * Prandtl's lifting line, solved as a Fourier series.
 *
 * The monoplane equation at spanwise station theta, with y = -(b/2) cos t:
 *
 *   sum_n A_n sin(n t) [ 4b/(a0 c(t)) + n / sin t ] = alpha(t) - alpha_L0(t)
 *
 * Only odd harmonics appear for a symmetric wing. Collocating at N points
 * gives an N x N system; N is small, so a direct solve is fine and avoids the
 * convergence questions an iterative method would raise.
 *
 * Returns the span loading, the induced drag, and the Oswald factor — the
 * last of which the equilibrium solver has until now been taking on trust as
 * a typed-in number.
 */
export function liftingLine({
  planform, alphaDeg, twistAt = null, alphaL0Rad = 0, liftSlope = 2 * Math.PI, N = 24,
}) {
  const b = planform.span;
  const halfSpan = planform.halfSpan;
  const area = 2 * simpson((y) => planform.chord(y), 0, halfSpan, 400);
  const AR = (b * b) / area;

  const theta = [];
  for (let k = 1; k <= N; k++) theta.push((k * Math.PI) / (2 * N));

  const A = [];
  const rhs = [];
  for (let k = 0; k < N; k++) {
    const t = theta[k];
    const y = halfSpan * Math.cos(t);       // station from centre
    const c = Math.max(1e-6, planform.chord(y));
    const mu = (4 * b) / (liftSlope * c);
    const row = [];
    for (let j = 0; j < N; j++) {
      const n = 2 * j + 1;
      row.push(Math.sin(n * t) * (mu + n / Math.sin(t)));
    }
    A.push(row);
    const twist = twistAt ? rad(twistAt(y)) : 0;
    rhs.push(rad(alphaDeg) + twist - alphaL0Rad);
  }

  const coeff = solve(A, rhs);

  const A1 = coeff[0];
  let sumN = 0;
  for (let j = 0; j < N; j++) sumN += (2 * j + 1) * coeff[j] * coeff[j];

  const CL = Math.PI * AR * A1;
  const CDi = Math.PI * AR * sumN;
  const e = sumN > 0 ? (A1 * A1) / sumN : 1;

  // Span loading: local lift coefficient at each station.
  const loading = [];
  const M = 60;
  for (let i = 0; i <= M; i++) {
    const t = 1e-6 + ((Math.PI / 2 - 2e-6) * i) / M;
    const y = halfSpan * Math.cos(t);
    let s = 0;
    for (let j = 0; j < N; j++) s += coeff[j] * Math.sin((2 * j + 1) * t);
    const c = Math.max(1e-9, planform.chord(y));
    loading.push({ y, eta: y / halfSpan, chord: c, cl: (4 * b * s) / c, gamma: s });
  }
  loading.reverse();

  return { CL, CDi, e, AR, area, coefficients: coeff, loading, delta: 1 / e - 1 };
}

/** Gaussian elimination with partial pivoting. */
function solve(Ain, bin) {
  const n = bin.length;
  const A = Ain.map((r, i) => [...r, bin[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-14) throw new Error('Lifting-line system is singular.');
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r][n];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

/* -------------------------------------------------------------- wing polar -- */

/**
 * Full wing polar at a given atmospheric state.
 *
 * Section data comes either from `estimateSectionPolar` or from an imported
 * XFOIL polar; `sectionPolar.source` says which, and that is carried through
 * to the result so the interface can be honest about it.
 *
 * Parasitic drag from the lines and the pilot is added as an area-referenced
 * coefficient, the same convention chapter 4 uses.
 *
 * `arc` (`arcFactors` in vlm.js) flies the wing in its arc rather than flat.
 * The lifting line solves the flat wing, with the section's own lift slope
 * and zero-lift angle; the arc scales its lift by the lattice's ratio of
 * slopes, moves its zero-lift angle by the lattice's shift, and multiplies
 * its induced drag at the same lift by the lattice's ratio — at the angle
 * the lattice's flat plates would see, this one less the section's zero-lift
 * angle. Each section's lift coefficient, which its profile drag is read
 * at, is scaled with the wing's. Without it a paraglider's arc was not in
 * its polar at all: a fifth to a quarter more lift than it has at every
 * angle, and a fifth less induced drag at the same lift.
 */
export function wingPolar({
  planform, airfoil, atm, mass, area = null, chordRef = null,
  twistAt = null, cxLines = 0.020, cxPilot = 0.015, arc = null,
  alphaRange = [-4, 16], step = 0.5, sectionPolar = null, N = 24,
  // The highest lift coefficient the wing can actually be flown at.
  maxUsableCL = 0.9,
  // How much rougher the real fabric surface is than a smooth aerofoil.
  surfaceFactor = 1.0,
}) {
  const S = area ?? 2 * simpson((y) => planform.chord(y), 0, planform.halfSpan, 400);
  const cRef = chordRef ?? S / planform.span;
  const AR = (planform.span * planform.span) / S;

  const points = [];
  let best = null;
  let minSink = null;

  for (let a = alphaRange[0]; a <= alphaRange[1] + 1e-9; a += step) {
    // Speed and section Reynolds number depend on the lift being produced,
    // which depends on the speed. One pass of fixed-point iteration from the
    // previous point is enough at this step size.
    let V = points.length ? points[points.length - 1].speed : 10;
    let sp = sectionPolar;
    let ll = null;
    let nd = null;

    let CL = 0;
    let CDi = 0;
    let arcInduced = 1;
    for (let iter = 0; iter < 6; iter++) {
      nd = nonDimensional({ speed: V, chord: cRef, atm, span: planform.span });
      if (!sectionPolar) {
        sp = estimateSectionPolar(airfoil, { reynolds: nd.reynolds, mach: nd.mach, surfaceFactor });
      }
      // In an arc, the flat wing's angle that has the same zero-lift angle.
      const aFlat = arc ? a - arc.alphaShiftDeg : a;
      ll = liftingLine({
        planform, alphaDeg: aFlat, twistAt,
        alphaL0Rad: rad(sp.alphaL0Deg),
        liftSlope: sp.liftSlopePerRad ?? 2 * Math.PI,
        N,
      });
      CL = arc ? arc.liftRatio * ll.CL : ll.CL;
      arcInduced = arc ? arc.inducedRatioAt(a - sp.alphaL0Deg) : 1;
      CDi = arc ? arcInduced * arc.liftRatio * arc.liftRatio * ll.CDi : ll.CDi;
      if (CL <= 0.01) break;
      const Vnew = Math.sqrt((2 * mass * atm.gravity) / (atm.density * S * CL));
      if (!Number.isFinite(Vnew)) break;
      if (Math.abs(Vnew - V) / Vnew < 1e-4) { V = Vnew; break; }
      V = Vnew;
    }
    // The sections' own lift, as the arc leaves it.
    const loading = arc ? ll.loading.map((st) => ({ ...st, cl: st.cl * arc.liftRatio })) : ll.loading;

    // Profile drag integrated across the span at each station's own local
    // lift coefficient, rather than assuming the whole wing works at the
    // wing-average Cl. The tips of a tapered wing run at a different Cl.
    let cdProfile = 0;
    let wsum = 0;
    for (const st of loading) {
      const cd = sectionCd(sp, st.cl);
      cdProfile += cd * st.chord;
      wsum += st.chord;
    }
    cdProfile = wsum > 0 ? cdProfile / wsum : sp.cd0;

    const CD = cdProfile + CDi + cxLines + cxPilot;
    const glide = CL > 0 ? CL / CD : 0;
    const sinkRate = CL > 0 ? V * (CD / Math.sqrt(CL * CL + CD * CD)) : NaN;

    const pt = {
      alphaDeg: a,
      CL,
      CDi,
      CDprofile: cdProfile,
      CD,
      glideRatio: glide,
      speed: V,
      speedKMH: V * 3.6,
      sinkRate,
      // The span efficiency on the flat aspect ratio: the line's own, and
      // in an arc what its induced drag comes to on that span.
      oswald: arc ? (CDi > 0 ? (CL * CL) / (Math.PI * AR * CDi) : ll.e) : ll.e,
      reynolds: nd.reynolds,
      mach: nd.mach,
      loading,
      ...(arc ? { arc: { liftRatio: arc.liftRatio, inducedRatio: arcInduced } } : {}),
      stalled: loading.some((s) => Math.abs(s.cl) > sp.clMax * 0.995),
    };
    points.push(pt);
    if (!pt.stalled && CL > 0) {
      if (!best || glide > best.glideRatio) best = pt;
      // Only inside the flyable envelope.
      //
      // The polar is very flat past about CL 1.0 — sink falls from 0.854 to
      // 0.820 m/s between alpha 8 and 14 — so an unconstrained search puts
      // the minimum at the top of the alpha range, at CL 1.37 and 24 km/h.
      // That is not a flight state: a paraglider's usable lift coefficient is
      // limited by pitch stability and the collapse floor, not by where the
      // aerofoil finally stalls, and it loses the front of the wing long
      // before it gets there.
      //
      // Reported minimum sink was 0.70 to 0.78 m/s across every wing tested,
      // against a real 0.95 to 1.15. Capped at a usable CL it lands where it
      // should, and the cap is a design assumption the caller can set.
      if (pt.CL <= maxUsableCL && (!minSink || sinkRate < minSink.sinkRate)) {
        minSink = pt;
      }
    }
  }

  return {
    source: sectionPolar ? sectionPolar.source : 'estimated',
    arc: arc ? { liftRatio: arc.liftRatio, alphaShiftDeg: arc.alphaShiftDeg } : null,
    area: S,
    aspectRatio: AR,
    chordRef,
    points,
    bestGlide: best,
    minSink,
    atm,
  };
}

/** Interpolate a section polar's drag at a given lift coefficient. */
function sectionCd(sp, cl) {
  const pts = sp.points;
  let lo = pts[0];
  let hi = pts[pts.length - 1];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].cl >= cl) { lo = pts[i - 1]; hi = pts[i]; break; }
  }
  const d = hi.cl - lo.cl;
  if (Math.abs(d) < 1e-9) return lo.cd;
  const f = clamp((cl - lo.cl) / d, 0, 1);
  return lo.cd + f * (hi.cd - lo.cd);
}

/**
 * Sweep the polar across altitude. This is the question the environment tab
 * exists to answer: what happens to this wing as the air thins?
 */
export function altitudeSweep({ planform, airfoil, mass, altitudes, atmosphereFn, ...rest }) {
  return altitudes.map((z) => {
    const atm = atmosphereFn(z);
    const p = wingPolar({ planform, airfoil, atm, mass, ...rest });
    const bg = p.bestGlide;
    return {
      altitude: z,
      density: atm.density,
      bestGlide: bg ? bg.glideRatio : NaN,
      speedAtBestGlide: bg ? bg.speed : NaN,
      machAtBestGlide: bg ? bg.mach : NaN,
      reynoldsAtBestGlide: bg ? bg.reynolds : NaN,
      minSinkRate: p.minSink ? p.minSink.sinkRate : NaN,
      flyable: bg ? bg.mach < 0.3 : false,
    };
  });
}
