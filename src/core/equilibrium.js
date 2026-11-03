import { thinAirfoil, liftingLine, polarAt } from './aero.js';
import { planformMetrics } from './planform.js';
import { liftLine } from './vlm.js';
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
 * example (calage 0.433 m); the default applies the equations of 4.2 and
 * returns a further-aft calage. The difference is real and worth
 * understanding before trusting either on a prototype — see
 * docs/validation.md.
 *
 * ---------------------------------------------------------------------------
 * The pitching moment, once
 * ---------------------------------------------------------------------------
 * 4.2 puts the lift and the wing's drag at the centre of pressure, and the
 * sheet places it from the pitching moment, Xcp = 0.25 - Cm/Cz (0.296 of the
 * chord in 4.4). A force there already carries the moment about the quarter
 * chord. 4.2's seventh term, -q0 Cm, adds it again — and without the chord,
 * so the moment it adds is a newton figure taken for a newton-metre one. The
 * sheet leaves it out, and so does the author's program, which takes moments
 * about the centre of pressure itself (`lepbalance.js`); the handbook's 2020
 * revisit counts the aerodynamic moment about the point the forces are put
 * at, which at the centre of pressure is none.
 *
 * Counted twice, it put the calage of a wing with a cambered section, Cm0
 * -0.105, 6% of chord further aft at 5 degrees — and the derived calages
 * "well aft of the 40 to 45% real wings use" (`trimFromCalage`) were partly
 * that. The default counts it once: the six terms of 4.2 before it.
 * `printedAeroMoment: true` adds the seventh as printed, to read the text
 * against.
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
  printedAeroMoment: false, // 4.2's seventh term, the pitching moment again
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
  // The arc (`arcFactors`, vlm.js): the handbook's wing is flat, and its
  // finite-span factor and induced drag are a flat wing's. A wing in its arc
  // has less lift at the same angle and more induced drag at the same lift,
  // by what the lattice finds of this wing against itself laid flat.
  const arc = p.arc && !p.legacySpreadsheet ? p.arc : null;
  const Cz = Cz2D * f3D * (arc ? arc.liftRatio : 1);

  // Induced drag. The handbook's formula [6] uses Cz(alpha), and its worked
  // example feeds the 2D value in here; keeping that reproduces the example.
  const CzForInduced = p.legacySpreadsheet ? Cz2D : Cz;
  const Cxi = ((CzForInduced * CzForInduced) / (Math.PI * AR * e)) * (arc ? arc.inducedRatio : 1);

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
  // The seventh term only as printed: the centre of pressure already places
  // the pitching moment (see "The pitching moment, once").
  const withAero = useAll && !!p.printedAeroMoment;
  const constTerm =
    mLift
    + (useAll ? mWingDrag : 0)
    + mLines
    + mPilotDrag
    + mPilotWeight
    + mLineWeight
    + mWingWeight
    + (withAero ? mAero : 0);

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
    aerodynamic: withAero ? -mAero : 0,
  };
  const residual = useAll
    ? Object.values(moments).reduce((a, v) => a + v, 0)
    : moments.resultantAero + moments.lines + moments.pilotDrag
      + moments.pilotWeight + moments.wingWeight + moments.lineWeight;

  return {
    aspectRatio: AR,
    lift3DFactor: f3D,
    ...(arc ? { arc: { liftRatio: arc.liftRatio, inducedRatio: arc.inducedRatio } } : {}),
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
    mode: p.legacySpreadsheet ? 'legacy-2012-spreadsheet'
      : withAero ? 'handbook-4.2-as-printed' : 'handbook-4.2',
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
  planform, airfoil, atm = null, alphaDeg = 6, arc = null, ...rest
} = {}) {
  const m = planform.area && planform.span ? planform : planformMetrics(planform);
  // No angle here: the section's zero-lift angle and Cm0 do not depend on it.
  // This read `thinAirfoil(airfoil, alphaDeg)`, which silently used the angle
  // as a sample count and put a 9% error into alphaL0.
  const section = thinAirfoil(airfoil);
  const ll = liftingLine({ planform, alphaDeg, N: 24 });

  // Thin-aerofoil theory gives a slope and a zero-lift angle, not a lift
  // coefficient. Cz is what follows from them at this angle — in an arc
  // (`arcFactors`), at this angle less the arc's shift of the zero-lift
  // angle, the arc's lift and induced-drag ratios applied by the balance.
  const cz = section.liftSlopePerRad
    * ((alphaDeg - (arc ? arc.alphaShiftDeg : 0) - section.alphaL0Deg) * Math.PI) / 180;

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
    ...(arc ? { arc: { liftRatio: arc.liftRatio, inducedRatio: arc.inducedRatioAt(alphaDeg - section.alphaL0Deg) } } : {}),
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

/**
 * The handbook's balance flown on a wing's own polar (`wingPolar`) rather
 * than on typed numbers: its lift, its induced drag through the span
 * efficiency it has on its aspect ratio, and its profile drag, all at the
 * angle, and the section's own Cm0. The lift is the wing's, so the
 * finite-span factor is not applied again; a polar solved in the wing's arc
 * has the arc in it, and none is passed. `inputs` are the rest of
 * `solveEquilibrium`'s: masses, lines, pilot, density, area and span — the
 * polar's own, so that its span efficiency means the same here.
 */
export function balanceOnPolar({ polar, alphaDeg, cm0, ...inputs }) {
  const p = polarAt(polar, alphaDeg);
  if (!p) {
    throw new Error(`balanceOnPolar: ${alphaDeg} degrees is outside the polar `
      + `(${polar?.points?.[0]?.alphaDeg} to ${polar?.points?.[polar.points.length - 1]?.alphaDeg})`);
  }
  const solved = solveEquilibrium({
    ...inputs, alphaDeg, cz: p.CL, apply3D: false, oswald: p.oswald, cx0a: p.CDprofile, cm: cm0,
    legacySpreadsheet: false, arc: null,
  });
  return { ...solved, onPolar: p };
}

/**
 * The calage from moments, every force at its own point: the karabiners'
 * position along the central chord at which the moments of all the forces
 * on the glider, about the karabiners, sum to none.
 *
 * In the central section's plane, back along its chord and down from it,
 * metres, with the karabiners `depthM` below the chord. A force's point
 * either belongs to the wing (`withKarabiners` 0), hangs with the
 * karabiners (1: the handbook's rules put the lines' weight and drag below
 * the calage), or between: a line's middle moves with them by its depth
 * over theirs, so a lineset placed from a plan hung at `fromM` keeps its
 * shape as the karabiners move along the chord. The point given is where
 * it is with the karabiners at `fromM`.
 *
 * The pilot hangs from the karabiners `belowM` down, either `plumb`, as the
 * handbook and LEparagliding put him, or `free`: a body free to swing
 * about the karabiners comes to rest with his own weight and drag in line
 * with them, a little behind plumb, and puts no moment about them.
 *
 * Moments are nose up positive.
 *
 * @param {object} o
 * @param {number} o.alphaDeg   the flow's angle to the central chord
 * @param {number} o.thetaDeg   the chord's angle below the horizon, nose down
 *                              positive: the glide angle less alphaDeg
 * @param {number} o.depthM     the karabiners' depth below the chord
 * @param {{name:string, F:number[], at:number[], withKarabiners?:number, fromM?:number}[]} o.forces
 * @param {{weightN:number, dragN:number, belowM:number, hangs?:string}} o.pilot
 */
export function calageFromForces({ alphaDeg, thetaDeg, depthM, forces, pilot }) {
  const a = rad(alphaDeg);
  const t = rad(thetaDeg);
  const flow = [Math.cos(a), -Math.sin(a)];
  const down = [-Math.sin(t), Math.cos(t)];
  const cross = (r, F) => r[0] * F[1] - r[1] * F[0];
  // The pilot's forces, and where he hangs from the karabiners.
  const Fp = [pilot.weightN * down[0] + pilot.dragN * flow[0], pilot.weightN * down[1] + pilot.dragN * flow[1]];
  const along = pilot.hangs === 'plumb' ? down : (() => {
    const n = Math.hypot(Fp[0], Fp[1]) || 1;
    return [Fp[0] / n, Fp[1] / n];
  })();
  const arm = [pilot.belowM * along[0], pilot.belowM * along[1]];
  const pilotMoment = cross(arm, Fp);
  // Each force's moment about the karabiners at (sigma, depth) is linear
  // in sigma: its point is at + k (sigma - from), so its arm along the
  // chord is at - from k + (k - 1) sigma.
  let constant = pilotMoment;
  let slope = 0;
  for (const f of forces) {
    const k = f.withKarabiners ?? 0;
    const from = f.fromM ?? 0;
    constant += (f.at[0] - k * from) * f.F[1] - (f.at[1] - depthM) * f.F[0];
    slope += (k - 1) * f.F[1];
  }
  if (!(Math.abs(slope) > 1e-9)) throw new Error('calageFromForces: no force but the pilot\'s fixes the karabiners along the chord');
  const sigma = -constant / slope;
  const K = [sigma, depthM];
  const moments = {};
  for (const f of forces) {
    const k = f.withKarabiners ?? 0;
    const p = [f.at[0] + k * (sigma - (f.fromM ?? 0)), f.at[1]];
    moments[f.name] = (moments[f.name] ?? 0) + cross([p[0] - K[0], p[1] - K[1]], f.F);
  }
  moments.pilot = pilotMoment;
  const pilotAt = [sigma + arm[0], depthM + arm[1]];
  return {
    calageM: sigma,
    moments,
    residual: Object.values(moments).reduce((x, y) => x + y, 0),
    pilotAt,
    // The pilot's lean behind plumb, degrees.
    pilotLeanDeg: (Math.atan2(cross(along, down), down[0] * along[0] + down[1] * along[1]) * 180) / Math.PI,
  };
}

/**
 * The balance flown on a wing's own polar with every force where it acts,
 * rather than where chapter 4's rules put it:
 *
 *   - the wing's lift on its own line of action in the arc, from the vortex
 *     lattice (`latticeCentres`): the centroid of its strips' lift, moved
 *     along the flow by the sections' own pitching moment (`liftLine`).
 *     The rule puts it on the central chord at 0.25 - Cm0/CL of that chord;
 *     a planform's quarter-chord line runs aft toward the tips, and in its
 *     arc the wing's lift is well below its chord;
 *   - its profile drag at the centroid of its area, and its induced drag at
 *     the centroid of the induced drag the lattice finds strip by strip;
 *   - the wing's weight at its mass centre in the arc (`wingMassCentre`);
 *   - the lines' weight and drag at their own centres (`lineCentres`) —
 *     without a plan yet, by the rules: half and a third of the way down;
 *   - the pilot below the karabiners, `pilotBelowM`, hanging free
 *     (`calageFromForces`).
 *
 * The forces themselves are `balanceOnPolar`'s: the same glide, speed and
 * lift; only where they act differs.
 *
 * @param {object} o
 * @param {object} o.polar, o.alphaDeg, o.cm0   as `balanceOnPolar`
 * @param {function} o.centresAt  (alphaDeg) => `latticeCentres(...)`, the
 *                    lattice at this angle (`arcFactors(...).forceCentreAt`)
 * @param {{backM:number, downM:number}} o.wingCentre
 * @param {object|null} o.lines   `lineCentres(...)`, with `fromM`: the
 *                    calage its plan was hung at, metres
 * @param {number} [o.pilotBelowM]
 * @param {string} [o.pilotHangs]  'free' or 'plumb'
 */
export function balanceWhereForcesAct({
  polar, alphaDeg, cm0, centresAt, wingCentre, lines = null,
  pilotBelowM = 0.2, pilotHangs = 'free', ...inputs
}) {
  if (typeof centresAt !== 'function') throw new Error('balanceWhereForcesAct needs the lattice\'s centres (centresAt)');
  if (!Number.isFinite(wingCentre?.backM) || !Number.isFinite(wingCentre?.downM)) {
    throw new Error('balanceWhereForcesAct needs the wing\'s mass centre');
  }
  const base = balanceOnPolar({ polar, alphaDeg, cm0, ...inputs });
  const p = { ...DEFAULT_INPUTS, ...inputs };
  const centres = centresAt(alphaDeg);
  if (!centres) throw new Error(`balanceWhereForcesAct: the lattice has no lift at ${alphaDeg} degrees`);
  const q0 = base.q0;
  const S = p.area;
  const ac = centres.flowToChordDeg;
  const thetaC = base.gammaDeg - ac;
  const a = rad(ac);
  const t = rad(thetaC);
  const flow = [Math.cos(a), -Math.sin(a)];
  const up = [-Math.sin(a), -Math.cos(a)];
  const down = [-Math.sin(t), Math.cos(t)];
  const times = (v, k) => [v[0] * k, v[1] * k];
  const liftN = q0 * base.cz3D;
  const profileN = q0 * base.onPolar.CDprofile;
  const inducedN = q0 * base.cxi;
  const linesDragN = q0 * p.cxLines;
  const pilotDragN = q0 * p.cxPilot;
  const g = p.g;
  const L = liftLine(centres, { cm0, liftOverQ: base.cz3D * S });
  const h = p.lineLength;
  const linesAt = lines
    ? {
      weight: { at: [lines.mass.backM, lines.mass.downM], withKarabiners: lines.mass.downM / h, fromM: lines.fromM },
      drag: { at: [lines.drag.backM, lines.drag.downM], withKarabiners: lines.drag.downM / h, fromM: lines.fromM },
    }
    : {
      // The handbook's rules: weight half way down, drag a third, both
      // under the calage.
      weight: { at: [0, h / 2], withKarabiners: 1, fromM: 0 },
      drag: { at: [0, h / 3], withKarabiners: 1, fromM: 0 },
    };
  const forces = [
    { name: 'lift', F: times(up, liftN), at: [L.backM, L.downM] },
    { name: 'profileDrag', F: times(flow, profileN), at: [centres.profile.backM, centres.profile.downM] },
    { name: 'inducedDrag', F: times(flow, inducedN), at: [centres.induced.backM, centres.induced.downM] },
    { name: 'wingWeight', F: times(down, p.wingMass * g), at: [wingCentre.backM, wingCentre.downM] },
    { name: 'lineWeight', F: times(down, p.lineMass * g), ...linesAt.weight },
    { name: 'lineDrag', F: times(flow, linesDragN), ...linesAt.drag },
  ];
  const solved = calageFromForces({
    alphaDeg: ac, thetaDeg: thetaC, depthM: h, forces,
    pilot: { weightN: p.pilotMass * g, dragN: pilotDragN, belowM: pilotBelowM, hangs: pilotHangs },
  });
  const sigma = solved.calageM;
  const chord = p.chord;
  // Where the wing's own force — its lift and both drags — crosses the
  // central chord: its moment about the nose over its component square to
  // the chord.
  const wingF = forces.slice(0, 3);
  const R = wingF.reduce((r, f) => [r[0] + f.F[0], r[1] + f.F[1]], [0, 0]);
  const Mw = wingF.reduce((m, f) => m + f.at[0] * f.F[1] - f.at[1] * f.F[0], 0);
  const cpBackM = Mw / R[1];
  // And the point the program types (LEparagliding's section 35): where
  // the lift's line meets the line of the wing's drag.
  const dragN = profileN + inducedN;
  const PD = [
    ((centres.profile.backM * profileN) + (centres.induced.backM * inducedN)) / dragN,
    ((centres.profile.downM * profileN) + (centres.induced.downM * inducedN)) / dragN,
  ];
  const s = (PD[0] - L.backM) * up[0] + (PD[1] - L.downM) * up[1];
  const cpPoint = { backM: L.backM + s * up[0], downM: L.downM + s * up[1] };
  // The point on the chord plumb above the pilot.
  const plumbM = solved.pilotAt[0] + solved.pilotAt[1] * Math.tan(t);
  return {
    ...base,
    thetaDeg: thetaC,
    xcpFraction: cpBackM / chord,
    cpMetres: cpBackM,
    calageMetres: sigma,
    calageFraction: sigma / chord,
    moments: solved.moments,
    momentResidual: solved.residual,
    forcesN: {
      lift: liftN, profileDrag: profileN, inducedDrag: inducedN, lineDrag: linesDragN, pilotDrag: pilotDragN,
      wingWeight: p.wingMass * g, lineWeight: p.lineMass * g, pilotWeight: p.pilotMass * g,
    },
    acting: {
      // The centroid of the strips' lift, and its line with the sections'
      // moment on it.
      liftCentroid: centres.lift,
      liftLine: L,
      liftCrossingFraction: L.crossingFraction,
      cpPoint,
      profile: centres.profile,
      induced: centres.induced,
      wing: { backM: wingCentre.backM, downM: wingCentre.downM },
      lines: lines ? { mass: lines.mass, drag: lines.drag, fromM: lines.fromM } : null,
      linesByRule: !lines,
      pilot: { backM: solved.pilotAt[0], downM: solved.pilotAt[1], belowM: pilotBelowM, hangs: pilotHangs, leanDeg: solved.pilotLeanDeg },
      plumbFraction: plumbM / chord,
      flowToChordDeg: ac,
      chordM: chord,
      // Where chapter 4's rule puts the lift, for comparison.
      ruleCpFraction: base.xcpFraction,
    },
    mode: 'where-forces-act',
  };
}

/**
 * Trim from the calage on a wing's own polar: the angle at which
 * `balanceOnPolar` puts the pilot where the risers hang — or `solve`, with
 * the same arguments: `balanceWhereForcesAct`. As `trimFromCalage` finds it
 * — the calage falls to a minimum at a low angle and rises either side, and
 * the branch a wing flies on is the upper one — over the polar's angles.
 */
export function trimOnPolar({ polar, calageFraction, tolerance = 1e-5, solve = balanceOnPolar, ...rest }) {
  if (!(calageFraction > 0 && calageFraction < 1)) {
    throw new Error(`trimOnPolar: calageFraction is a fraction of chord between 0 and 1 (got ${calageFraction})`);
  }
  const pts = polar.points.filter((p) => p.CL > 0.05);
  if (pts.length < 2) throw new Error('trimOnPolar: the polar has no lifting points');
  const lo0 = pts[0].alphaDeg;
  const hi0 = pts[pts.length - 1].alphaDeg;
  const at = (alphaDeg) => solve({ polar, alphaDeg, ...rest });
  const samples = 4 * Math.max(1, Math.round(hi0 - lo0));
  let minAlpha = lo0;
  let minCalage = Infinity;
  for (let i = 0; i <= samples; i++) {
    const a = lo0 + ((hi0 - lo0) * i) / samples;
    const c = at(a).calageFraction;
    if (c < minCalage) { minCalage = c; minAlpha = a; }
  }
  const topCalage = at(hi0).calageFraction;
  if (calageFraction < minCalage || calageFraction > topCalage) {
    throw new Error(`a calage of ${(calageFraction * 100).toFixed(1)}% is outside what this wing can trim at `
      + `(${(minCalage * 100).toFixed(1)}% at ${minAlpha.toFixed(1)} degrees, rising to `
      + `${(topCalage * 100).toFixed(1)}% at ${hi0} degrees)`);
  }
  let lo = minAlpha;
  let hi = hi0;
  for (let i = 0; i < 60 && hi - lo > tolerance; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).calageFraction < calageFraction) lo = mid; else hi = mid;
  }
  const alphaDeg = (lo + hi) / 2;
  return { ...at(alphaDeg), calageAsked: calageFraction, derivedFrom: 'calage' };
}

/**
 * Trim from the calage, rather than calage from an assumed trim.
 *
 * `solveEquilibriumFromWing` takes an angle of attack and reports the calage
 * that would make it an equilibrium. That is chapter 4's method and it is
 * useful, but it has the causation backwards for a designer: **you do not
 * choose an angle of attack. You choose where the risers hang, and the wing
 * flies at whatever angle that produces.**
 *
 * The difference is not academic. The default angle was 6 degrees, which
 * on a Geo 7 XS (a NACA 4415 standing in for its section, flat) demands a
 * calage at 42.6% of chord and produces CL 0.81 and a trim speed of 24.9
 * km/h. EN 926-2 requires more than 30 km/h, and the certificate for that
 * wing records it passing at 55 kg.
 *
 * Run the other way round from where built wings hang — the three complete
 * designs on file say 32.5, 33 and 36% — a calage of 33 to 36% gives 3.2 to
 * 4.1 degrees, CL 0.59 to 0.66 and 27.6 to 29.2 km/h: the lift coefficient
 * a real wing trims at, from a geometry a builder can measure. (This said
 * 40 to 43.5%, "where real wings hang", which trimmed there only while the
 * balance counted the pitching moment twice.)
 *
 * On the branch a wing flies on the calage rises with the angle, so past the
 * minimum this is a plain root find on that relation.
 */
export function trimFromCalage({
  planform, airfoil, atm = null, calageFraction,
  alphaRange = [-2, 12], tolerance = 1e-5, ...rest
}) {
  if (!(calageFraction > 0 && calageFraction < 1)) {
    throw new Error('trimFromCalage: calageFraction is a fraction of chord '
      + `between 0 and 1 (got ${calageFraction})`);
  }

  const at = (alphaDeg) => solveEquilibriumFromWing({
    planform, airfoil, atm, alphaDeg, ...rest,
  });

  // The calage is NOT monotonic in angle of attack. It falls to a minimum
  // where the wing has hardly any lift — the centre of pressure runs aft as
  // the lift goes, Xcp = 0.25 - Cm/Cz: near -2 degrees on a NACA 4415 — and
  // rises on both sides. A bisection that assumes it rises throughout picks
  // the wrong branch or finds nothing.
  //
  // My first version assumed monotonic and its bracket check threw rather
  // than returning a wrong answer, which is the only reason this was caught.
  //
  // Two angles therefore give any reachable calage. The lower one is at a
  // very small or negative angle of attack and is not a flight state: a
  // paraglider there has no lift to speak of and would not stay open. The
  // upper branch is the one a wing actually flies on, so the search starts
  // at the minimum and goes up.
  const [rangeLo, rangeHi] = alphaRange;
  const samples = 48;
  let minAlpha = rangeLo;
  let minCalage = Infinity;
  for (let i = 0; i <= samples; i++) {
    const a = rangeLo + ((rangeHi - rangeLo) * i) / samples;
    const c = at(a).calageFraction;
    if (c < minCalage) { minCalage = c; minAlpha = a; }
  }

  const topCalage = at(rangeHi).calageFraction;
  if (calageFraction < minCalage || calageFraction > topCalage) {
    throw new Error(`trimFromCalage: a calage of ${(calageFraction * 100).toFixed(1)}% `
      + 'is outside what this wing can trim at in flight '
      + `(${(minCalage * 100).toFixed(1)}% at ${minAlpha.toFixed(1)} degrees, `
      + `rising to ${(topCalage * 100).toFixed(1)}% at ${rangeHi} degrees)`);
  }

  let lo = minAlpha;
  let hi = rangeHi;
  for (let i = 0; i < 60 && hi - lo > tolerance; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).calageFraction - calageFraction < 0) lo = mid; else hi = mid;
  }

  const alphaDeg = (lo + hi) / 2;
  const state = at(alphaDeg);
  return {
    ...state,
    alphaDeg,
    calageAsked: calageFraction,
    calageError: state.calageFraction - calageFraction,
    derivedFrom: 'calage',
    note: `a calage of ${(calageFraction * 100).toFixed(1)}% of chord trims at `
      + `${alphaDeg.toFixed(2)} degrees, CL ${state.cz3D.toFixed(3)}, `
      + `${state.speedKMH.toFixed(1)} km/h`,
  };
}
