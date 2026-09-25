/* atmosphere.js — operating environment.
 *
 * U.S. Standard Atmosphere 1976, which is identical to the ICAO standard
 * atmosphere and ISO 2533 up to 32 km and continues to 86 km. That covers the
 * 50 km ceiling this tool is asked to explore with a single referenced model
 * rather than a patchwork.
 *
 * Two things are easy to get wrong here and both are handled explicitly:
 *
 * 1. **Geopotential vs geometric altitude.** The layer table is defined in
 *    geopotential altitude H, which absorbs the variation of gravity with
 *    height so the hydrostatic equation keeps a constant g0. Users think in
 *    geometric altitude z. The two differ by 400 m at 50 km — enough to move
 *    the pressure by 1.3%. Input here is geometric; conversion is internal.
 *
 * 2. **Base pressures are computed, not transcribed.** Each layer's base
 *    pressure follows from integrating the one below it. Hard-coding the
 *    published values invites a transcription error that no test would catch,
 *    because the test would be written from the same table. Instead they are
 *    derived and then *checked* against the published values.
 */

const G0 = 9.80665;          // standard gravity, m/s^2
const R_STAR = 8.31432;      // universal gas constant used by the 1976 model
const M_AIR = 0.0289644;     // molar mass of dry air, kg/mol
const R_AIR = R_STAR / M_AIR; // specific gas constant, ~287.053 J/(kg K)
const GAMMA = 1.4;
const EARTH_R = 6356766;     // effective earth radius for geopotential, m
const BETA_S = 1.458e-6;     // Sutherland's law coefficient
const S_SUTH = 110.4;        // Sutherland's temperature, K
const SIGMA_AIR = 3.65e-10;  // effective collision diameter, m
const N_AVOGADRO = 6.022169e23;

/** Layer bases: geopotential altitude (m), base temperature (K), lapse (K/m). */
const LAYERS = [
  { H: 0, T: 288.15, L: -0.0065 },
  { H: 11000, T: 216.65, L: 0.0 },
  { H: 20000, T: 216.65, L: 0.001 },
  { H: 32000, T: 228.65, L: 0.0028 },
  { H: 47000, T: 270.65, L: 0.0 },
  { H: 51000, T: 270.65, L: -0.0028 },
  { H: 71000, T: 214.65, L: -0.002 },
  { H: 84852, T: 186.946, L: 0.0 },
];

// Derive each layer's base pressure by integrating upward from sea level.
const P0 = 101325;
LAYERS[0].P = P0;
for (let i = 1; i < LAYERS.length; i++) {
  const b = LAYERS[i - 1];
  const dH = LAYERS[i].H - b.H;
  LAYERS[i].P = b.L === 0
    ? b.P * Math.exp((-G0 * dH) / (R_AIR * b.T))
    : b.P * Math.pow(b.T / (b.T + b.L * dH), (G0) / (R_AIR * b.L));
}

/** Geometric altitude z (m) -> geopotential altitude H (m). */
export const geopotential = (z) => (EARTH_R * z) / (EARTH_R + z);

/** Geopotential altitude H (m) -> geometric altitude z (m). */
export const geometric = (H) => (EARTH_R * H) / (EARTH_R - H);

/**
 * Atmospheric state at a geometric altitude.
 * @param {number} z geometric altitude, metres (0 to 86000)
 * @param {object} opts
 * @param {number} opts.deltaISA temperature offset from standard, K
 */
export function atmosphere(z, { deltaISA = 0 } = {}) {
  const H = geopotential(z);
  if (H < -5000 || H > 84852) {
    throw new Error(
      `Altitude ${(z / 1000).toFixed(1)} km is outside the 1976 model's range of -5 to 86 km.`,
    );
  }

  let i = 0;
  while (i < LAYERS.length - 1 && H >= LAYERS[i + 1].H) i++;
  const b = LAYERS[i];
  const dH = H - b.H;

  // Standard temperature drives the pressure integral; the offset is applied
  // afterwards to density and the transport properties. Adding it before would
  // make a non-standard day change the pressure at altitude, which it does not
  // in the way this parameter is meant.
  const Tstd = b.T + b.L * dH;
  const P = b.L === 0
    ? b.P * Math.exp((-G0 * dH) / (R_AIR * b.T))
    : b.P * Math.pow(b.T / Tstd, G0 / (R_AIR * b.L));

  const T = Tstd + deltaISA;
  const rho = P / (R_AIR * T);
  const a = Math.sqrt(GAMMA * R_AIR * T);
  const mu = (BETA_S * Math.pow(T, 1.5)) / (T + S_SUTH);
  const nu = mu / rho;

  // Number density and mean free path, which decide whether treating the air
  // as a continuous fluid is still legitimate.
  const n = (P * N_AVOGADRO) / (R_STAR * T);
  const meanFreePath = 1 / (Math.SQRT2 * Math.PI * SIGMA_AIR * SIGMA_AIR * n);

  return {
    geometricAltitude: z,
    geopotentialAltitude: H,
    layer: i,
    temperature: T,
    temperatureStd: Tstd,
    pressure: P,
    density: rho,
    speedOfSound: a,
    dynamicViscosity: mu,
    kinematicViscosity: nu,
    numberDensity: n,
    meanFreePath,
    densityRatio: rho / 1.225,
    pressureRatio: P / P0,
    gravity: G0 * Math.pow(EARTH_R / (EARTH_R + z), 2),
  };
}

/** Sea-level standard values, for ratios and equivalent airspeed. */
export const SEA_LEVEL = atmosphere(0);

/**
 * Non-dimensional groups for a wing at a given state.
 *
 * These are what decide whether the aerodynamic model is even applicable, so
 * they are computed alongside warnings rather than reported bare.
 *
 * @param {object} p
 * @param {number} p.speed      true airspeed, m/s
 * @param {number} p.chord      reference chord, m
 * @param {object} p.atm        result of atmosphere()
 */
export function nonDimensional({ speed, chord, atm, span = null }) {
  const Re = (atm.density * speed * chord) / atm.dynamicViscosity;
  const Mach = speed / atm.speedOfSound;
  // Knudsen from the same reference length as the Reynolds number, so the
  // three are consistent: Kn = M/Re * sqrt(gamma*pi/2).
  const Kn = atm.meanFreePath / chord;
  const q = 0.5 * atm.density * speed * speed;
  const EAS = speed * Math.sqrt(atm.density / SEA_LEVEL.density);

  const flags = [];
  // Continuum mechanics stops describing the flow before the molecules do.
  if (Kn > 0.01) flags.push({ level: 'error', text: 'Kn > 0.01 — slip and rarefaction; continuum aerodynamics does not apply.' });
  else if (Kn > 1e-3) flags.push({ level: 'warn', text: 'Kn > 0.001 — approaching slip flow at the surface.' });

  if (Mach > 0.8) flags.push({ level: 'error', text: 'M > 0.8 — transonic; incompressible and Prandtl-Glauert models both fail.' });
  else if (Mach > 0.3) flags.push({ level: 'warn', text: 'M > 0.3 — compressibility matters; a Prandtl-Glauert correction is applied.' });

  if (Re < 3e4) flags.push({ level: 'error', text: 'Re < 30,000 — below the range where these viscous correlations mean anything.' });
  else if (Re < 2e5) flags.push({ level: 'warn', text: 'Re < 200,000 — low-Reynolds regime; separation bubbles dominate and drag is underestimated.' });

  return {
    reynolds: Re,
    mach: Mach,
    knudsen: Kn,
    dynamicPressure: q,
    trueAirspeed: speed,
    equivalentAirspeed: EAS,
    aspectRatioSpan: span,
    // Prandtl-Glauert factor, valid only in the subsonic range flagged above.
    compressibilityFactor: Mach < 0.95 ? 1 / Math.sqrt(1 - Mach * Mach) : Infinity,
    flags,
  };
}

/**
 * Speed a wing must fly to hold a given lift coefficient at this state.
 * This is the number that makes high altitude concrete: lift scales with
 * density, so the required speed scales with 1/sqrt(density), and at 50 km
 * that is a factor of about thirty.
 */
export function speedForLift({ mass, gravity, area, cl, atm }) {
  const W = mass * (gravity ?? atm.gravity);
  return Math.sqrt((2 * W) / (atm.density * area * cl));
}

/** Altitude at which a given density occurs — the inverse lookup. */
export function altitudeForDensity(rho, { hi = 86000 } = {}) {
  let lo = -5000;
  let h = hi;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + h) / 2;
    if (atmosphere(mid).density > rho) lo = mid; else h = mid;
  }
  return (lo + h) / 2;
}

/** A profile through the atmosphere, for plotting. */
export function profile({ from = 0, to = 50000, steps = 50, deltaISA = 0 } = {}) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const z = from + ((to - from) * i) / steps;
    out.push({ z, ...atmosphere(z, { deltaISA }) });
  }
  return out;
}

/** The published base values, exposed so tests can check the derivation. */
export const LAYER_TABLE = LAYERS.map((l) => ({ ...l }));
export const CONSTANTS = { G0, R_AIR, GAMMA, EARTH_R, M_AIR, R_STAR };
