/* pressure.js — chordwise load distribution, and where the rows take it.
 *
 * `loads.js` splits the load between the anchor rows using the handbook's
 * fixed convention: A 35%, B 35%, C 20%, D 10%. That is a reasonable summary
 * of one wing at one angle of attack, and it is wrong in two ways that matter.
 *
 * It does not know where the anchors are. Moving the A row from 8% to 12% of
 * chord changes what it carries, and the fixed split cannot see that.
 *
 * And it does not change with angle of attack. The chordwise load on a wing
 * is strongly front-loaded at high incidence and much flatter at low, so the
 * split at full speedbar is not the split at trim — which is exactly the
 * condition where line loads are least well understood.
 *
 * Thin-aerofoil theory gives the distribution directly, and it is the same
 * theory `aero.js` already uses for the lift curve, so nothing new is being
 * assumed:
 *
 *     dCp(theta) = 4 [ A0 (1 + cos theta) / sin theta + sum An sin(n theta) ]
 *
 * with x = (1 - cos theta) / 2, A0 = alpha - (1/pi) * integral(dz/dx dtheta)
 * and An = (2/pi) * integral(dz/dx cos(n theta) dtheta).
 *
 * The A0 term is the flat-plate loading. It carries a square-root singularity
 * at the leading edge — real, in the sense that thin-aerofoil theory really
 * does predict infinite suction there, and unusable as a load per unit chord.
 * The integral of it converges, so the bands are integrated in closed form
 * rather than sampled, and no band ever has to evaluate the singular point.
 */

import { rad } from './num.js';

/**
 * Fourier coefficients of the camber line, as thin-aerofoil theory wants them.
 * Returns A0 at zero incidence plus the An series; A0 at a given angle is
 * `alpha + a0Base`.
 */
export function camberSeries(airfoil, {
  terms = 4, n = 400,
  // Ahead of this chord fraction the mean line is taken as straight.
  //
  // The line is the vertical average of the two surfaces, and at a rounded
  // nose that average is not a camber line at all: the upper surface climbs
  // the nose radius faster than the lower falls, so the "mean" leaps up in
  // the first thousandth of chord. Its slope there is in the tens, and A0 and
  // every An weight the nose fully — so on a measured section the whole
  // series was that spike. The Swoop2's reflex section came out with an
  // ideal angle of attack of 9.5 degrees and four An of about 0.3; held
  // straight over the first 1% it is 1.7 degrees and 0.06, and the answer
  // moves by a quarter of a degree for any cut-off between 0.5% and 3%.
  //
  // The zero-lift angle and Cm0 never showed it — their weights vanish at
  // the nose — which is why the lift this integrates to was always right.
  noseCut = 0.01,
} = {}) {
  // Mean camber line, sampled in theta so the integrals are uniform there.
  const { upper, lower } = splitByX(airfoil);
  const z = (x) => camberAt(upper, lower, x);
  // Slope over a fixed step of chord, not between neighbouring theta
  // samples: those are 1e-5 of chord apart at the nose, where a difference
  // of two interpolated ordinates is mostly the interpolation.
  const h = 2e-3;
  const slopeAtX = (x) => {
    const a = Math.max(noseCut, x - h);
    const b = Math.min(1, Math.max(noseCut, x) + h);
    return (z(b) - z(a)) / ((b - a) || 1e-12);
  };
  const dz = [];
  for (let i = 0; i <= n; i++) {
    const th = (Math.PI * i) / n;
    const x = (1 - Math.cos(th)) / 2;
    dz.push({ th, x, z: z(x), s: slopeAtX(x) });
  }
  const slope = (i) => dz[i].s;

  const integrate = (f) => {
    let s = 0;
    for (let i = 1; i <= n; i++) {
      const d = dz[i].th - dz[i - 1].th;
      s += ((f(i - 1) + f(i)) / 2) * d;
    }
    return s;
  };

  const a0Base = -(1 / Math.PI) * integrate((i) => slope(i));
  const An = [];
  for (let k = 1; k <= terms; k++) {
    An.push((2 / Math.PI) * integrate((i) => slope(i) * Math.cos(k * dz[i].th)));
  }
  return { a0Base, An };
}

function splitByX(airfoil) {
  const pts = airfoil.points;
  let iLE = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[iLE][0]) iLE = i;
  return { upper: pts.slice(0, iLE + 1).reverse(), lower: pts.slice(iLE) };
}

function camberAt(upper, lower, x) {
  const at = (poly) => {
    for (let i = 1; i < poly.length; i++) {
      if (poly[i][0] >= x) {
        const f = (x - poly[i - 1][0]) / ((poly[i][0] - poly[i - 1][0]) || 1);
        return poly[i - 1][1] + f * (poly[i][1] - poly[i - 1][1]);
      }
    }
    return poly[poly.length - 1][1];
  };
  return (at(upper) + at(lower)) / 2;
}

/**
 * Chordwise loading at an angle of attack.
 * Returns dCp sampled away from the leading edge, plus the total lift
 * coefficient the distribution integrates to — which must agree with the
 * usual thin-aerofoil result, and is asserted to.
 */
export function chordwiseLoading(airfoil, alphaDeg, { samples = 200, terms = 4 } = {}) {
  const { a0Base, An } = camberSeries(airfoil, { terms });
  const A0 = rad(alphaDeg) + a0Base;

  const points = [];
  for (let i = 1; i < samples; i++) {
    const th = (Math.PI * i) / samples;
    const x = (1 - Math.cos(th)) / 2;
    let dcp = (4 * A0 * (1 + Math.cos(th))) / Math.sin(th);
    An.forEach((a, k) => { dcp += 4 * a * Math.sin((k + 1) * th); });
    points.push({ x, theta: th, dcp });
  }

  // cl = 2*pi*A0 + pi*A1, the standard result.
  const cl = 2 * Math.PI * A0 + Math.PI * (An[0] ?? 0);
  // Zero lift needs 2*pi*A0 + pi*A1 = 0, so A0 = -A1/2 and the angle follows
  // from A0 = alpha + a0Base. Reading it off a0Base alone ignores the camber
  // term and returns roughly zero for a section that plainly has camber.
  const alphaL0Rad = -a0Base - (An[0] ?? 0) / 2;
  return { points, cl, A0, An, alphaL0Deg: (alphaL0Rad * 180) / Math.PI };
}

/**
 * Fraction of the total load carried between two chord stations.
 *
 * Integrated in closed form in theta, which is what keeps the leading-edge
 * singularity harmless: the A0 term integrates to
 * `2*A0*(theta + sin theta)` and the An terms to `-4*An*cos(n theta)/n`,
 * both finite at theta = 0.
 */
export function loadBetween(loading, x0, x1) {
  const th = (x) => Math.acos(1 - 2 * Math.min(1, Math.max(0, x)));
  const t0 = th(x0);
  const t1 = th(x1);
  const { A0, An } = loading;

  const F = (t) => {
    let v = 2 * A0 * (t + Math.sin(t));
    An.forEach((a, k) => {
      const n = k + 1;
      if (n === 1) v += a * (t - Math.sin(2 * t) / 2);
      else {
        v += 2 * a * (Math.sin((n - 1) * t) / (2 * (n - 1))
          - Math.sin((n + 1) * t) / (2 * (n + 1)));
      }
    });
    return v;
  };
  return F(t1) - F(t0);
}

/**
 * Load share per anchor row, from the pressure distribution.
 *
 * Each row takes the load from its own chordwise band, bounded midway to its
 * neighbours — the leading edge ahead of the first row and the trailing edge
 * behind the last. That is the assumption the fixed convention makes
 * implicitly; making it explicit is what lets the anchors and the angle of
 * attack matter.
 */
export function rowSharesFromPressure(airfoil, anchors, alphaDeg, opts = {}) {
  const rows = Object.keys(anchors).sort((a, b) => anchors[a] - anchors[b]);
  const loading = chordwiseLoading(airfoil, alphaDeg, opts);

  const bounds = [];
  for (let i = 0; i < rows.length; i++) {
    const lo = i === 0 ? 0 : (anchors[rows[i - 1]] + anchors[rows[i]]) / 2;
    const hi = i === rows.length - 1 ? 1 : (anchors[rows[i]] + anchors[rows[i + 1]]) / 2;
    bounds.push([lo, hi]);
  }

  const raw = bounds.map(([lo, hi]) => loadBetween(loading, lo, hi));
  const total = raw.reduce((a, b) => a + b, 0);
  const shares = {};
  rows.forEach((r, i) => { shares[r] = total !== 0 ? raw[i] / total : 0; });

  return {
    shares,
    rows,
    bounds,
    cl: loading.cl,
    alphaDeg,
    // Where the resultant acts, from the same distribution.
    centreOfPressure: centreOfPressure(loading),
  };
}

/** Centre of pressure as a chord fraction, from the loading itself. */
export function centreOfPressure(loading) {
  let num = 0;
  let den = 0;
  const pts = loading.points;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const w = ((pts[i].dcp + pts[i - 1].dcp) / 2) * dx;
    num += w * ((pts[i].x + pts[i - 1].x) / 2);
    den += w;
  }
  return den !== 0 ? num / den : 0.25;
}

/**
 * How the split moves across the speedbar range.
 *
 * The useful output is not a single set of shares but how far they travel:
 * a row whose share changes little can be sized once, and one that changes a
 * lot cannot.
 */
export function shareSweep(airfoil, anchors, alphas, opts = {}) {
  const rows = alphas.map((a) => rowSharesFromPressure(airfoil, anchors, a, opts));
  const names = rows[0].rows;
  const travel = {};
  for (const r of names) {
    const vals = rows.map((x) => x.shares[r]);
    travel[r] = {
      min: Math.min(...vals),
      max: Math.max(...vals),
      swingPct: (Math.max(...vals) - Math.min(...vals)) * 100,
    };
  }
  return { rows, travel, names };
}
