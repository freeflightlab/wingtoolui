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
 * @param {string} cfg.pointSpacing   'nose' | 'cosine' | 'uniform' along each surface
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
    // How those points are shared out along each surface. Clustered at the
    // nose, where the section's curvature is: spread evenly, 50 points on a
    // 2.6 m chord cut the corner off the leading edge by 5 mm, in the rib
    // patterns and in every panel developed along them (`resampleSurface`).
    pointSpacing = 'nose',
    // Where the ribs go across the span: `ribStations`.
    distribution = 'chord',
    cellTaper = 0.75,
    // A centre RIB sits on the centreline and the wing has 2*cells cells.
    // A centre CELL straddles it instead, giving 2*cells+1 — which is what
    // an odd published count means, and what this could not build.
    centreRib = true,
    zRotation = 'none',
    alphaDeg = 5,
  } = cfg;

  const stations = cfg.explicitRibs
    ? cfg.explicitRibs.map((r) => r.station)
    : ribStations(planform, cells, distribution, { centreRib, taper: cellTaper });

  // One section for the whole wing unless a rib brings its own. An imported
  // design can give each rib its own aerofoil and a thickness factor — the
  // Swoop2 flattens its tip rib to 1% of its section, which is how its
  // wingtip is closed.
  const sectionCache = new Map();
  const sectionFor = (af, thickness = 1) => {
    const key = af;
    if (!sectionCache.has(key)) {
      const { upper, lower } = splitSurfaces(af);
      sectionCache.set(key, {
        upper: resampleSurface(upper, pointsPerSurface, { spacing: pointSpacing }),
        lower: resampleSurface(lower, pointsPerSurface, { spacing: pointSpacing }),
      });
    }
    const s = sectionCache.get(key);
    if (thickness === 1) return s;
    const thin = (poly) => poly.map(([u, v]) => [u, v * thickness]);
    return { upper: thin(s.upper), lower: thin(s.lower) };
  };

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
    // rib plane has gone fully horizontal. Positive zeta swings the part of
    // the rib aft of the pivot inward and up, which is the direction that
    // cancels the angle; LEparagliding's rot_z has the same sign.
    const zeta = given && given.zetaDeg != null && zRotation !== 'auto'
      ? rad(given.zetaDeg)
      : zRotation === 'auto' ? Math.atan(Math.tan(a) * Math.sin(beta)) : 0;

    // Washin turns the section about its rotation point RP; the yaw turns it
    // about RL. An imported rib brings both from its file (LEparagliding's RP
    // and z_pos columns). RP had no effect here before: the section was
    // rotated about RP and then re-pinned at RL, which is a rotation about RL
    // whatever RP said.
    const map = ribTransform({
      chord, xLE, ly, lz, beta, zeta, washinDeg,
      washPivot: given?.rp ?? RP,
      yawPivot: given?.posZ ?? RL,
    });
    const own = given?.airfoil ?? airfoil;
    const sec = sectionFor(own, given?.thickness ?? 1);
    const place = (poly) => poly.map(([u, v]) => map(u * chord, v * chord));

    const rib = {
      index: i,
      station: y,
      chord,
      xLE,
      alphaDeg: washinDeg,
      betaDeg: deg(beta),
      zetaDeg: deg(zeta),
      lobePoint: [ly, lz],
      upper: place(sec.upper),
      lower: place(sec.lower),
      // The section as it is CUT, in metres: chord along u from the leading
      // edge, v up, before any of the three rotations. A rib is a flat piece
      // of cloth, and its outline is this — not a projection of the placed
      // 3D points, which carry the washin rotation with them.
      section: {
        upper: sec.upper.map(([u, v]) => [u * chord, v * chord]),
        lower: sec.lower.map(([u, v]) => [u * chord, v * chord]),
      },
      frame: frameOf(map),
      airfoilName: own?.name,
      // What an imported rib says about itself: its own anchor rows (the
      // Swoop2's tip rib differs from the rest), brake point and intake.
      ...(given?.anchors ? { anchors: given.anchors } : {}),
      ...(given?.brakePoint != null ? { brakePoint: given.brakePoint } : {}),
      ...(given?.airfoil?.intake ? { intake: given.airfoil.intake } : {}),
    };

    Object.assign(rib, flowAngles(rib, glide));
    return rib;
  });

  // Whether a rib sits on the centreline is a fact about the ribs, not a
  // setting: an imported design brings its own stations, and trusting the
  // caller's flag beside them left a centre-cell design without its centre
  // panel whenever the flag still said "rib".
  const centred = stations.length ? Math.abs(stations[0]) < 1e-9 : centreRib;

  return {
    ribs,
    // False when a cell straddles the centreline instead of a rib sitting on
    // it. The centre cell is one piece of cloth spanning both halves, so
    // anything that walks the ribs has to know it is there.
    centreRib: centred,
    stations,
    glide,
    imported: !!explicitRibs,
    cfg: {
      RL, RP, cells, pointsPerSurface, zRotation, alphaDeg, centreRib: centred,
      washinTotal: washin?.total,
    },
  };
}

/**
 * True when the innermost rib lies on the centreline.
 *
 * The model holds one half of the wing. With a centre RIB the whole wing has
 * one of rib 0 and two of every other; with a centre CELL it has two of all
 * of them and one more cell than the half suggests. Every total that walks
 * the ribs and doubles has to ask this, and for a long time only the panel
 * development did.
 */
export function hasCentreRib(wing) {
  return !!wing?.ribs?.length && Math.abs(wing.ribs[0].station ?? 0) < 1e-9;
}

/** How many of rib `i` the whole wing has: the centre rib once, the rest twice. */
export function ribCopies(wing, i) {
  return i === 0 && hasCentreRib(wing) ? 1 : 2;
}

/** Ribs and cells across the whole wing. */
export function wholeWingCounts(wing) {
  const n = wing?.ribs?.length ?? 0;
  if (!n) return { ribs: 0, cells: 0 };
  return hasCentreRib(wing)
    ? { ribs: 2 * n - 1, cells: 2 * (n - 1) }
    : { ribs: 2 * n, cells: 2 * (n - 1) + 1 };
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
 * The map from a rib's own section coordinates to the wing's.
 *
 * Section coordinates, in metres: u along the chord from the leading edge, v
 * up (toward the upper surface), w normal to the section, pointing outboard
 * when the rib is upright. World: x aft, y outboard, z up. This is the
 * sequence LEparagliding uses (its section 6 and section 12.3) and it
 * reproduces that program's 3D output to a thousandth of a millimetre on the
 * Swoop2 — see `tests/run-tests.js`, "Swoop2 anchors against LEparagliding".
 *
 *   1. washin, in the section plane, about the rotation point washPivot;
 *   2. yaw, about the section's vertical through yawPivot;
 *   3. tilt by beta about the chord, so the section stands normal to the arc;
 *   4. translate: the unwashed chord line lies on the arc at (ly, lz).
 *
 * The tilt was written with the wrong sign until September 2026. The
 * section's "up" went to (-sin beta, cos beta) instead of (sin beta,
 * cos beta), so at the tips the UPPER surface lay on the inside of the arc —
 * the canopy was built inside out wherever it was arched, by twice the
 * section's height times sin(beta): 11 cm at rib 23 of the default wing. It
 * showed in every 3D product: anchors, panels, the OBJ, the line geometry.
 * The yaw was reversed with it. Checked now against the 36 anchor points of
 * the Swoop2's own 3D DXF.
 */
export function ribTransform({ chord, xLE, ly, lz, beta, zeta = 0, washinDeg = 0,
  washPivot = 0.25, yawPivot = 0.5 }) {
  const a = rad(washinDeg);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cz = Math.cos(zeta);
  const sz = Math.sin(zeta);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const uw = washPivot * chord;
  const uz = yawPivot * chord;
  return (u, v, w = 0) => {
    // 1. Washin. Positive is nose up, trailing edge down.
    const u1 = uw + (u - uw) * ca + v * sa;
    const v1 = -(u - uw) * sa + v * ca;
    // 2. Yaw. Positive swings everything aft of the pivot to -w, which after
    //    the tilt is inward and up.
    const u2 = uz + (u1 - uz) * cz + w * sz;
    const w2 = -(u1 - uz) * sz + w * cz;
    // 3 and 4. Tilt so that v points along the arc's outward normal
    //    (sin beta, cos beta) and w along its tangent (cos beta, -sin beta),
    //    then put the chord line on the arc.
    return [
      xLE + u2,
      ly + w2 * cb + v1 * sb,
      lz - w2 * sb + v1 * cb,
    ];
  };
}

/**
 * Origin and axes of a rib's section frame as placed in the wing.
 *
 * The placement is a rigid motion — three rotations and a translation — so it
 * is fixed by where the section origin and the three unit axes land. The axes
 * come out orthonormal, and the inverse is the transpose.
 */
function frameOf(map) {
  const o = map(0, 0, 0);
  const d = (p) => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  return { origin: o, u: d(map(1, 0, 0)), v: d(map(0, 1, 0)), w: d(map(0, 0, 1)) };
}

/**
 * A 3D point on or near a rib, in that rib's own section coordinates [u, v],
 * metres — the section as it is cut, with the washin, yaw and tilt all
 * undone. The inverse of the placement, for drawing or cutting anything that
 * was computed in 3D on the rib: an anchor, a hole, a rod, a diagonal's foot.
 *
 * Every view and export that flattened a rib used to invert the tilt by hand,
 * four times over, and each copy inverted the wrong-signed tilt. There is one
 * inverse now and it is the transpose of the forward map.
 */
export function toRibPlane(rib, p) {
  const f = rib.frame;
  const q = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]];
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dotp(q, f.u), dotp(q, f.v)];
}

/**
 * The point at a fraction of the CHORD along one surface of a rib, in 3D.
 *
 * `surface` is 'upper' or 'lower'. The station is measured in the rib's own
 * plane, from the section's x = 0 along its chord line — so an anchor "at
 * 8.5% of chord" is at 8.5% of chord.
 *
 * Three modules each had their own version of this, and none was that. Two
 * measured along the line from the surface's first point to its last, which
 * was the chord line until the surfaces were split at the section's FOREMOST
 * point: a cambered nose is ahead of and above its own x = 0, so every anchor
 * and every diagonal on a NACA 4415 sat 0.06% of chord forward of where it
 * was set — 1.6 mm on a 2.6 m rib, and not where the openings, which did
 * measure along the chord, were keeping clear of. The third, in `lines.js`,
 * still interpolated by position in the ARRAY, which with points gathered at
 * the nose put an anchor set at 8.5% of chord at under 2%.
 *
 * A rib with neither a section nor a frame — a bare polyline, as some tests
 * build — is measured along the line from its first point to its last.
 */
export function ribSurfacePoint(rib, surface, frac) {
  const poly = rib[surface];
  const n = poly ? poly.length : 0;
  if (n < 2) return n ? poly[0].slice() : [0, 0, 0];

  const flat = rib.section && rib.section[surface];
  let us;
  if (flat && flat.length === n && rib.chord > 0) {
    us = flat.map((q) => q[0] / rib.chord);
  } else if (rib.frame && rib.chord > 0) {
    us = poly.map((p) => toRibPlane(rib, p)[0] / rib.chord);
  } else {
    const a = poly[0];
    const b = poly[n - 1];
    const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len2 = ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2];
    // A degenerate surface has no chord to measure along; fall back to index.
    us = len2 > 0
      ? poly.map((q) => ((q[0] - a[0]) * ax[0] + (q[1] - a[1]) * ax[1] + (q[2] - a[2]) * ax[2]) / len2)
      : poly.map((_, i) => i / (n - 1));
  }

  const want = Math.min(1, Math.max(0, frac));
  // The surface runs nose to tail, so its station is monotonic: walk until
  // the station is passed, then interpolate within that segment.
  let i = 1;
  while (i < n - 1 && us[i] < want) i++;
  const g = us[i] > us[i - 1]
    ? Math.min(1, Math.max(0, (want - us[i - 1]) / (us[i] - us[i - 1]))) : 0;
  return [
    poly[i - 1][0] + g * (poly[i][0] - poly[i - 1][0]),
    poly[i - 1][1] + g * (poly[i][1] - poly[i - 1][1]),
    poly[i - 1][2] + g * (poly[i][2] - poly[i - 1][2]),
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
  // The centre cell, when there is one: the cloth between the innermost rib
  // and its mirror, which belongs to neither half. Walking the ribs outward
  // left it out, so every wing with an odd cell count — the Alpina 5, the
  // Lynx 2, the Hook 6 — read 5% short of its projected area, and its wing
  // loading 5% high.
  if (r.length && !hasCentreRib(wing)) {
    area += Math.abs(r[0].lobePoint[0]) * r[0].chord;
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
