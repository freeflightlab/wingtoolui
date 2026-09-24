/* wing3d.js — Chapter 3.4: profile insertion, building the 3D wing.
 *
 * The handbook prescribes two rotations before placing each rib:
 *   1. rotate the section by its relative incidence alpha, about an axis
 *      perpendicular to the profile plane (the spanwise axis);
 *   2. rotate the plane of the section to stand normal to the lobe.
 *
 * A later study by the same author ("Airfoils 3D rotations in LEparagliding",
 * 2021) adds a THIRD rotation, about the global vertical axis, and it matters.
 * With only two rotations every rib stays parallel in plan, so on an arced
 * wing a tip rib ends up in a nearly horizontal plane — badly presented to the
 * airflow, which still runs along the glide path. Yawing each rib brings its
 * plane back onto the glide path so the section works at the shape it was
 * designed for.
 *
 * Order matters and is not free to choose: the study concludes X (incidence),
 * then Z (global vertical), then Y (dihedral) — and requires that Z = 0
 * reproduce the two-rotation result exactly, which it does here.
 *
 * Two diagnostics come with it:
 *   phi — angle between the rib's plane and the glide path line. Zero is
 *         perfectly presented to the flow; it grows toward the tip.
 *   chi — angle between the rib's chord line and the glide path: the local
 *         angle of attack that section actually sees.
 */

import { rad, deg } from './num.js';
import { ribStations } from './planform.js';
import { washinAt } from './lobe.js';
import { splitSurfaces, resampleSurface } from './airfoil.js';

/**
 * @param {object} cfg
 * @param {object} cfg.planform
 * @param {object} cfg.lobe
 * @param {object} cfg.airfoil        unit-chord section
 * @param {number} cfg.cells          cells per half wing
 * @param {number} cfg.RL             reference-line position, fraction of chord
 * @param {number} cfg.RP             rotation point, fraction of chord
 * @param {object} cfg.washin         {total, mode}
 * @param {number} cfg.pointsPerSurface resampling density for panel work
 * @param {string} cfg.zRotation      'none' | 'auto'  (auto aligns to the glide path)
 * @param {number} cfg.alphaDeg       design angle of attack, sets the glide path
 */
export function buildWing(cfg) {
  const {
    planform, lobe, airfoil, cells = 24,
    explicitRibs = null,
    RL = 0.5, RP = 0.25,
    washin = { total: 4.5, mode: 'linear' },
    pointsPerSurface = 60,
    distribution = 'cosine',
    zRotation = 'none',
    alphaDeg = 5,
  } = cfg;

  const stations = cfg.explicitRibs
    ? cfg.explicitRibs.map((r) => r.station)
    : ribStations(planform, cells, distribution);
  const { upper, lower } = splitSurfaces(airfoil);
  const upperN = resampleSurface(upper, pointsPerSurface);
  const lowerN = resampleSurface(lower, pointsPerSurface);

  // Glide path direction in the wing's own frame. At positive incidence the
  // flow runs aft and upward relative to the central chord, which lies along
  // +X, so the direction is (cos alpha, 0, sin alpha).
  const a = rad(alphaDeg);
  const glide = [Math.cos(a), 0, Math.sin(a)];

  const ribs = stations.map((y, i) => {
    // An imported design carries its own per-rib incidence, dihedral and yaw.
    // Those are reproduced rather than re-derived: the file's wing is the
    // wing, and a recomputed approximation of it would be a different one.
    const given = cfg.explicitRibs ? cfg.explicitRibs[i] : null;

    const chord = given?.chord ?? planform.chord(y);
    const xLE = given?.xLE ?? planform.xLE(y);
    const washinDeg = given
      ? given.washinDeg
      : washinAt(y, planform.halfSpan, { ...washin, planform });

    let ly;
    let lz;
    let beta;
    if (given) {
      [ly, lz] = given.lobePoint;
      beta = rad(given.betaDeg);
    } else {
      ({ y: ly, z: lz, beta } = lobe.at(y));
    }

    // Yaw that puts this rib's plane on the glide path. Setting the plane
    // normal perpendicular to the glide direction gives tan(zeta) =
    // tan(alpha) * sin(beta) — zero at the centre, rising to alpha where the
    // rib plane has gone fully horizontal.
    const zeta = given && given.zetaDeg != null && zRotation !== 'auto'
      ? rad(given.zetaDeg)
      : zRotation === 'auto' ? Math.atan(Math.tan(a) * Math.sin(beta)) : 0;

    const place = (poly) => poly.map((p) => toWorld(p, {
      chord, xLE, washinDeg, RL, RP, ly, lz, beta, zeta,
    }));

    const rib = {
      index: i,
      station: y,
      chord,
      xLE,
      alphaDeg: washinDeg,
      betaDeg: deg(beta),
      zetaDeg: deg(zeta),
      lobePoint: [ly, lz],
      upper: place(upperN),
      lower: place(lowerN),
    };

    Object.assign(rib, flowAngles(rib, glide));
    return rib;
  });

  return {
    ribs,
    stations,
    glide,
    imported: !!explicitRibs,
    cfg: {
      RL, RP, cells, pointsPerSurface, zRotation, alphaDeg,
      washinTotal: washin?.total,
    },
  };
}

/**
 * phi (plane vs glide path) and chi (chord vs glide path) for one rib,
 * measured from the built geometry rather than recomputed from the angles, so
 * they check the placement rather than restate its inputs.
 */
function flowAngles(rib, g) {
  const le = rib.upper[0];
  const te = rib.upper[rib.upper.length - 1];
  const mid = rib.lower[Math.floor(rib.lower.length / 2)];

  const chord = sub(te, le);
  const normal = cross(chord, sub(mid, le));

  const cosChi = Math.abs(dot(unit(chord), g));
  const sinPhi = Math.abs(dot(unit(normal), g));

  return {
    chiDeg: deg(Math.acos(Math.min(1, cosChi))),
    phiDeg: deg(Math.asin(Math.min(1, sinPhi))),
  };
}

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
function unit(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

/**
 * Map one unit-chord section point into world coordinates.
 * p = [u, v] with u the chord fraction from the LE and v the ordinate.
 */
function toWorld(p, { chord, xLE, washinDeg, RL, RP, ly, lz, beta, zeta }) {
  // Scale to real chord.
  let u = p[0] * chord;
  let v = p[1] * chord;

  // Rotation 1: incidence about the rotation point RP, in the profile plane.
  // Positive is washin — trailing edge down, nose up relative to the centre.
  const a = rad(washinDeg);
  const ru = RP * chord;
  const du = u - ru;
  const dv = v;
  u = ru + du * Math.cos(a) + dv * Math.sin(a);
  v = -du * Math.sin(a) + dv * Math.cos(a);

  // The reference point RL after the same rotation — this is what gets pinned
  // to the lobe, so everything from here is measured relative to it.
  const dru = RL * chord - ru;
  const rlU = ru + dru * Math.cos(a);
  const rlV = -dru * Math.sin(a);

  const qU = u - rlU;
  const qV = v - rlV;

  // Rotation 2: yaw about the global vertical through the reference point.
  // Pivoting on the reference point keeps it on the lobe, so adding yaw does
  // not shift the wing — only turns each rib in plan.
  const cz = Math.cos(zeta);
  const sz = Math.sin(zeta);
  const rx = qU * cz;
  const ry = qU * sz;

  // Rotation 3: stand the section normal to the lobe, then translate the
  // reference point onto the lobe curve.
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);

  return [
    xLE + RL * chord + rx,
    ly + ry * cb - qV * sb,
    lz + ry * sb + qV * cb,
  ];
}

/** Projected area from the front view (what actually carries load in flight). */
export function projectedArea(wing) {
  let area = 0;
  const r = wing.ribs;
  for (let i = 0; i < r.length - 1; i++) {
    const dy = Math.abs(r[i + 1].lobePoint[0] - r[i].lobePoint[0]);
    area += dy * ((r[i].chord + r[i + 1].chord) / 2);
  }
  return 2 * area;
}

/** All rib outlines as closed 3D loops, for drawing and export. */
export function ribLoops(wing) {
  return wing.ribs.map((r) => r.upper.slice().reverse().concat(r.lower.slice(1)));
}

/** Mirror the half wing to the left side for display. */
export function mirrorRib(loop) {
  return loop.map(([x, y, z]) => [x, -y, z]);
}
