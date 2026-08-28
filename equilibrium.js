import { thinAirfoil, liftingLine } from './aero.js';
import { planformMetrics } from './planform.js';
/* equilibrium.js — Chapter 4: longitudinal equilibrium.
 *
 * Solves the 2D static balance of the wing about its central section and
 * returns the calage — the chordwise position of the pilot's suspension
 * point, which is what sets relative line lengths and therefore how the
 * glider flies.
 *
 * The three equilibrium conditions (handbook 4.2):
 *   sum of moments about the leading edge = 0
 *   sum of vertical forces = 0
 *   sum of horizontal forces = 0
 *
 * The force equations are solved directly: the horizontal balance gives the
 * glide angle, the vertical balance gives dynamic pressure and hence speed.
 * The moment equation is then linear in sigma (the calage), so it is solved
 * in closed form rather than iterated — the handbook describes an iterative
 * search, but the unknown appears only linearly, so iteration is unnecessary.
 *
 * ---------------------------------------------------------------------------
 * On the line drag coefficient
 * ---------------------------------------------------------------------------
 * `cxLines` has been a typed-in constant since Phase 1, defaulting to the
 * handbook's 0.020. It need not be: `lineDrag` in loads.js computes it from
 * the lineset actually chosen — every line's diameter times its length,
 * against the wing area.
 *
 * The two disagree, and instructively. A modern light wing with thin lines
 * computes to roughly 0.006, about a third of the handbook's figure, which
 * came from a 2012 school wing with more and thicker line. Since line drag is
 * a large share of a paraglider's total, that difference moves the glide ratio
 * substantially — and it is most of why modern wings glide better than the
 * handbook's example. Pass the computed value rather than the default
 * whenever a lineset exists.
 *
 * ---------------------------------------------------------------------------
 * On `legacySpreadsheet`
 * ---------------------------------------------------------------------------
 * The handbook's section 4.4 worked example is marked by its authors as still
 * in development. Reproducing it term by term shows that its moment sum omits
 * two terms that section 4.2 includes: the moment of wing drag about the LE,
 * and the aerodynamic moment itself. With those two dropped, its five printed
 * moments reproduce exactly and sum to the printed 0.17.
 *
 * Both behaviours are available. `legacySpreadsheet: true` reproduces the 2012
 * example (calage 0.433 m); the default applies the equations as published in
 * 4.2 and returns a slightly further-aft calage. The difference is real and
 * worth understanding before trusting either on a prototype — see
 * docs/validation.md.
 */

import { deg, rad } from './num.js';

export const DEFAULT_INPUTS = {
  name: 'LAB_example',
  area: 25.70,          // S, m^2
  span: 10.25,          // b, m
  chord: 3.00,          // l, central chord, m
  lineLength: 6.00,     // L, m
  pilotMass: 80.0,      // mp, kg
  wingMass: 5.0,        // ma, kg
  lineMass: 0.0,        // ml, kg — see note below
  g: 9.81,
  rho: 1.11,            // kg/m^3
  oswald: 0.90,         // e
  cxPilot: 0.015,       // Cxp
  cxLines: 0.020,       // Cxs — see note below on computing this instead
  alphaDeg: 5.0,        // angle of attack
  cz: 0.900,            // 2D lift coefficient at alpha
  cx0a: 0.009,          // wing profile + friction drag
  cm: -0.042,           // pitching moment coefficient
  apply3D: true,        // apply finite-span correction to lift
  legacySpreadsheet: false,
};

/**
 * Finite-span lift correction. Lifting-line: a = a0 / (1 + a0/(pi*AR*e)),
 * with a0 = 2*pi per radian. Returns the factor applied to the 2D Cz.
 *
 * The handbook's example prints 0.624 for AR 4.09; that value corresponds to
 * this formula with e about 0.80 rather than the 0.90 listed elsewhere in the
 * same sheet. Using the sheet's own e of 0.90 gives 0.648.
 */
export function lift3DFactor(aspectRatio, e) {
  const a0 = 2 * Math.PI;
  return 1 / (1 + a0 / (Math.PI * aspectRatio * e));
}

export function solveEquilibrium(input = {}) {
  const p = { ...DEFAULT_INPUTS, ...input };
  const {
    area: S, span: b, chord: l, lineLength: L,
    pilotMass: mp, wingMass: ma, lineMass: ml, g, rho, oswald: e,
    cxPilot: Cxp, cxLines: Cxs, cz: Cz2D, cx0a: Cxoa, cm: Cm,
  } = p;

  const alpha = rad(p.alphaDeg);
  const AR = (b * b) / S;

  // Lift actually available from a finite wing.
  //
  // The 2012 example sheet prints its finite-span factor as a literal 0.624
  // rather than deriving it, and that value does not fall out of the sheet's
  // own aspect ratio and Oswald factor (which give 0.648). Legacy mode
  // therefore uses the printed number, so the rest of the sheet reproduces;
  // the default derives it. `lift3DOverride` exposes the same escape hatch
  // for anyone matching a wing against measured data.
  const f3D = p.lift3DOverride ?? (p.legacySpreadsheet ? 0.624
    : p.apply3D ? lift3DFactor(AR, e) : 1);
  const Cz = Cz2D * f3D;

  // Induced drag. The handbook's formula [6] uses Cz(alpha), and its worked
  // example feeds the 2D value in here; keeping that reproduces the example.
  const CzForInduced = p.legacySpreadsheet ? Cz2D : Cz;
  const Cxi = (CzForInduced * CzForInduced) / (Math.PI * AR * e);

  const Cxa = Cxoa + Cxi;
  const CxT = Cxa + Cxs + Cxp;

  // [3] horizontal balance -> glide angle.
  const gamma = Math.atan(CxT / Cz);
  const glideRatio = Cz / CxT;

  // Line weight. The 2012 chapter omits it; the author's 2020 revisit of the
  // same problem lists it explicitly among the acting forces. It defaults to
  // zero so the handbook's worked example still reproduces exactly, and a
  // real figure (a full lineset is roughly 0.3-0.6 kg) can be supplied. The
  // lines are taken to act at their midpoint, half the line length below the
  // calage, which is where their mass is on average.
  const totalMass = mp + ma + ml;

  // [2] vertical balance -> dynamic pressure, then speed.
  // Note the handbook folds wing area into q0: q0 = 0.5 * rho * S * V^2.
  const q0 = (g * totalMass) / (Cz * Math.cos(gamma) + CxT * Math.sin(gamma));
  const V = Math.sqrt((2 * q0) / (rho * S));

  // [10] gamma = alpha + theta.
  const theta = gamma - alpha;

  // Centre of pressure. Cma = Cm0 - Cl/4 gives Xcp/c = 0.25 - Cm/Cz.
  const xcpFraction = 0.25 - Cm / Cz2D;
  const delta = xcpFraction * l;

  // [1] moment balance about the LE, linear in sigma.
  //   const  +  sigma * coeff = 0
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);

  const mLift = q0 * Cz * delta * ca;
  const mWingDrag = q0 * Cxa * delta * sa;
  const mLines = q0 * Cxs * (L / 3) * ca;
  const mPilotDrag = q0 * Cxp * L * ca;
  const mPilotWeight = -mp * g * L * st;
  const mLineWeight = -ml * g * (L / 2) * st;
  const mWingWeight = -(l / 3) * ma * g * ct;
  const mAero = -q0 * Cm;

  const sigmaLines = q0 * Cxs * sa;
  const sigmaPilotDrag = q0 * Cxp * sa;
  const sigmaPilotWeight = -mp * g * ct;
  const sigmaLineWeight = -ml * g * ct;

  const useAll = !p.legacySpreadsheet;
  const constTerm =
    mLift
    + (useAll ? mWingDrag : 0)
    + mLines
    + mPilotDrag
    + mPilotWeight
    + mLineWeight
    + mWingWeight
    + (useAll ? mAero : 0);

  const sigmaCoeff = sigmaLines + sigmaPilotDrag + sigmaPilotWeight + sigmaLineWeight;
  const sigma = -constTerm / sigmaCoeff;

  // Report the individual moments at the solved sigma, in the sign convention
  // the handbook's example prints (positive nose-up on the pilot side).
  const moments = {
    resultantAero: -mLift,
    wingDrag: -mWingDrag,
    lines: -(mLines + sigmaLines * sigma),
    pilotDrag: -(mPilotDrag + sigmaPilotDrag * sigma),
    pilotWeight: -(mPilotWeight + sigmaPilotWeight * sigma),
    lineWeight: -(mLineWeight + sigmaLineWeight * sigma),
    wingWeight: -mWingWeight,
    aerodynamic: -mAero,
  };
  const residual = useAll
    ? Object.values(moments).reduce((a, v) => a + v, 0)
    : moments.resultantAero + moments.lines + moments.pilotDrag
      + moments.pilotWeight + moments.wingWeight + moments.lineWeight;

  return {
    aspectRatio: AR,
    lift3DFactor: f3D,
    cz3D: Cz,
    cxi: Cxi,
    cxa: Cxa,
    cxTotal: CxT,
    dragBreakdown: {
      profile: Cxoa / CxT,
      induced: Cxi / CxT,
      pilot: Cxp / CxT,
      lines: Cxs / CxT,
    },
    gammaRad: gamma,
    gammaDeg: deg(gamma),
    thetaDeg: deg(theta),
    glideRatio,
    q0,
    totalMass,
    speedMS: V,
    speedKMH: V * 3.6,
    xcpFraction,
    cpMetres: delta,
    calageMetres: sigma,
    calageFraction: sigma / l,
    moments,
    momentResidual: residual,
    mode: p.legacySpreadsheet ? 'legacy-2012-spreadsheet' : 'handbook-4.2-full',
  };
}

/**
 * Simplified graphical method (handbook 4.5).
 *
 * The construction is: draw the section at its flight attitude; mark the
 * centre of pressure Cp on the chord; hang the pilot vertically below Cp at
 * the line length; drop a perpendicular from the pilot back onto the chord.
 * Where it lands is the calage.
 *
 * Deriving that rather than measuring it off a drawing: put the leading edge
 * at the origin and let d be the unit vector along the chord toward the
 * trailing edge. In a glide the chord rises aft by theta, so d has vertical
 * component +sin(theta). The pilot sits at delta*d + L*(0,-1), and the
 * perpendicular foot is the projection of that onto d:
 *
 *   sigma = (delta*d + L*(0,-1)) . d = delta - L*sin(theta)
 *
 * This is pure geometry, and it assumes the pilot hangs directly below Cp —
 * true only if the line and pilot drag moments are ignored. They are not
 * small: in the handbook's own example they come to about a quarter of the
 * lift moment, so this lands well forward of the full solve. The handbook
 * says as much, calling it a first approximation that needs correcting on the
 * prototype. `solveEquilibrium` is the one to trust.
 */
export function simplifiedCalage({
  glideRatio = 8, alphaDeg = 5, chord = 3.0, lineLength = 6.0, xcpFraction = 0.30,
}) {
  const gamma = Math.atan(1 / glideRatio);
  const theta = gamma - rad(alphaDeg);
  const delta = xcpFraction * chord;
  const sigma = delta - lineLength * Math.sin(theta);
  return {
    gammaDeg: deg(gamma),
    thetaDeg: deg(theta),
    cpMetres: delta,
    calageMetres: sigma,
    calageFraction: sigma / chord,
  };
}

/** Glide angle for a given glide ratio — the handbook's 4.5 lookup table. */
export function glideAngleTable(ratios = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  return ratios.map((gr) => ({ gr, gammaDeg: deg(Math.atan(1 / gr)) }));
}

/** Sweep angle of attack to find best glide and to plot the polar. */
export function polarSweep(input, alphas, czFn, cmFn) {
  return alphas.map((a) => {
    const r = solveEquilibrium({ ...input, alphaDeg: a, cz: czFn(a), cm: cmFn ? cmFn(a) : input.cm });
    return {
      alphaDeg: a,
      glideRatio: r.glideRatio,
      speedKMH: r.speedKMH,
      sinkMS: r.speedMS * Math.sin(r.gammaRad),
      calageFraction: r.calageFraction,
    };
  });
}

/**
 * Solve the balance using coefficients derived from the wing itself.
 *
 * Chapter 4's equilibrium takes lift, moment and the Oswald factor as typed-in
 * numbers. `aero.js` computes all three from the actual section and planform —
 * thin-aerofoil theory for the lift slope and `Cm0`, lifting line for the
 * Oswald factor — and in this project the two have never been connected. A
 * designer changing the section or the aspect ratio has had to notice that the
 * balance was still using whatever was typed beside them.
 *
 * ---------------------------------------------------------------------------
 * It does not iterate, and the first version wrongly did
 * ---------------------------------------------------------------------------
 * `solveEquilibrium` **takes** the angle of attack; it does not solve for one.
 * What it solves for is the calage — where the pilot must hang to trim at that
 * angle. So there is no fixed point to chase, and a version written to iterate
 * to one "converged in 1 iteration" because the field it was watching did not
 * exist. A loop that always exits immediately is worse than no loop: it looks
 * like convergence.
 *
 * The coupling is therefore a single pass, which is all it ever needed to be.
 */
export function solveEquilibriumFromWing({
  planform, airfoil, atm = null, alphaDeg = 6, ...rest
} = {}) {
  const m = planform.area && planform.span ? planform : planformMetrics(planform);
  const section = thinAirfoil(airfoil, alphaDeg);
  const ll = liftingLine({ planform, alphaDeg, N: 24 });

  // Thin-aerofoil theory gives a slope and a zero-lift angle, not a lift
  // coefficient. Cz is what follows from them at this angle.
  const cz = section.liftSlopePerRad
    * ((alphaDeg - section.alphaL0Deg) * Math.PI) / 180;

  // Omit rho entirely when there is no atmosphere, rather than passing
  // `undefined`.
  //
  // A destructuring default does not fire on an explicit `undefined` — it
  // fires on an absent key. `{ rho: undefined }` therefore reaches the solver
  // as undefined, and every speed comes back NaN. This is the same trap that
  // let `RISER_LAYOUTS['A/B']` silently become the default layout, in the
  // opposite direction: there a bad value was absorbed, here a good default
  // was defeated.
  const solved = solveEquilibrium({
    area: m.area,
    span: m.span,
    chord: m.mac,
    ...(atm ? { rho: atm.density } : {}),
    alphaDeg,
    cz,
    cm: section.cm0,
    oswald: ll.e,
    ...rest,
  });

  return {
    ...solved,
    section,
    liftingLine: ll,
    // What the coupling supplied, so it can be checked rather than trusted.
    derivedFrom: {
      cz,
      cm: section.cm0,
      oswald: ll.e,
      aspectRatio: ll.AR,
      alphaL0Deg: section.alphaL0Deg,
      liftSlopePerRad: section.liftSlopePerRad,
    },
    note: 'Cz from the section lift slope and zero-lift angle, Cm0 from the '
      + 'section, Oswald factor from lifting line over the real planform',
  };
}
