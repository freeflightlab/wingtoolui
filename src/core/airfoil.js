/* airfoil.js — Chapter 2: Aerofoils.
 *
 * An airfoil here is a unit-chord section: an ordered list of [x, y] points
 * running from the trailing edge over the upper surface, round the leading
 * edge at x=0, and back along the lower surface to the trailing edge
 * (Selig order — the convention used by XFOIL and XFLR5, which the handbook
 * points designers toward in 2.8 and 2.9).
 *
 * Paraglider-specific attributes from 2.7 — air-intake extent, line-anchor
 * positions, internal rib holes — ride along on the same object because they
 * are properties of the section, and downstream modules need them.
 */

import { clamp, lerp } from './num.js';

/** Cosine-spaced x stations, dense at both LE and TE where curvature is high. */
function cosineSpacing(n) {
  const xs = [];
  for (let i = 0; i <= n; i++) xs.push(0.5 * (1 - Math.cos((Math.PI * i) / n)));
  return xs;
}

/**
 * NACA 4-digit section (handbook 2.6).
 *
 * The standard thickness polynomial leaves a finite trailing-edge thickness of
 * 0.0021 chord on a 20% section — about 3 mm per metre of chord on a 15%
 * section, which on a 2.6 m root chord is an 8 mm gap. For a wing whose
 * trailing edge is *sewn shut*, that gap is not a rounding detail: the upper
 * and lower panels would be cut to different lengths and would not meet.
 *
 * Closing it is a one-coefficient change. The five constants sum to 0.0021,
 * so replacing the last with 0.1036 makes them sum to zero and drives the
 * half-thickness to exactly zero at x=1. This is the standard closed-TE
 * variant, and it is the default here because it is what this application
 * needs. Pass `closedTrailingEdge: false` to get the original open section
 * when comparing against published NACA ordinates.
 *
 * @param {string} code e.g. '4415' — m=4%, p=40%, t=15%
 * @param {number} n    points per surface
 */
export function naca4(code, n = 80, { closedTrailingEdge = true } = {}) {
  if (!/^\d{4,5}$/.test(code)) throw new Error(`Not a NACA 4-digit code: ${code}`);
  const m = parseInt(code[0], 10) / 100;
  const p = parseInt(code[1], 10) / 10;
  const t = parseInt(code.slice(2), 10) / 100;

  // a0..a4. The set is quoted for a 20% section; t/0.2 scales it, which is
  // the same as the 5*t written below.
  const a4 = closedTrailingEdge ? 0.1036 : 0.1015;

  const yt = (x) =>
    5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x
      + 0.2843 * x ** 3 - a4 * x ** 4);

  const camber = (x) => {
    // A code with a camber digit but zero position (e.g. '4012') is not a
    // valid designation; treat it as symmetric rather than dividing by zero.
    if (m === 0 || p === 0) return { yc: 0, dy: 0 };
    if (x < p) {
      return {
        yc: (m / (p * p)) * (2 * p * x - x * x),
        dy: ((2 * m) / (p * p)) * (p - x),
      };
    }
    const q = (1 - p) ** 2;
    return {
      yc: (m / q) * (1 - 2 * p + 2 * p * x - x * x),
      dy: ((2 * m) / q) * (p - x),
    };
  };

  const xs = cosineSpacing(n);
  const upper = [];
  const lower = [];
  for (const x of xs) {
    const { yc, dy } = camber(x);
    const th = Math.atan(dy);
    const s = Math.sin(th);
    const c = Math.cos(th);
    upper.push([x - yt(x) * s, yc + yt(x) * c]);
    lower.push([x + yt(x) * s, yc - yt(x) * c]);
  }

  const pts = upper.slice().reverse().concat(lower.slice(1));
  return finalise({
    name: `NACA ${code}`,
    points: pts,
    intake: { start: 0.012, end: 0.055 },
    anchors: { A: 0.085, B: 0.30, C: 0.53, D: 0.78 },
  });
}

/**
 * Parse a coordinate file.
 *
 * Three formats are in circulation and two of them can be misread silently:
 *
 *   Selig    — a name line, then a single loop running TE over the upper
 *              surface to the LE and back along the lower surface to the TE.
 *   Lednicer — a name line, then a line holding two *counts*, then the upper
 *              surface LE->TE, then the lower surface LE->TE.
 *   LE .txt  — the Laboratori d'envol variant: a name line, then several
 *              single-integer header lines, then Selig-ordered coordinates.
 *              The header carries the point count and the indices marking the
 *              air intake, so the intake position can be recovered rather than
 *              guessed.
 *
 * Read naively, a Lednicer count line parses as a coordinate pair, and a point
 * at x=61 drags the unit-chord normalisation out by a factor of sixty —
 * silently, producing a plausible but wrong section. The formats are told
 * apart here by the fact that no real normalised ordinate exceeds about 1.5.
 */
export function parseAirfoilText(text, fallbackName = 'imported') {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let name = fallbackName;
  const rows = [];
  const leadingInts = [];

  for (const line of lines) {
    if (!line) continue;
    const nums = line.split(/[\s,]+/).map(Number);
    if (nums.length >= 2 && Number.isFinite(nums[0]) && Number.isFinite(nums[1])) {
      rows.push([nums[0], nums[1]]);
    } else if (nums.length === 1 && Number.isFinite(nums[0]) && rows.length === 0) {
      leadingInts.push(nums[0]);          // LE .txt header line
    } else if (rows.length === 0 && leadingInts.length === 0) {
      name = line;
    }
  }
  if (rows.length < 10) throw new Error('Not enough coordinate pairs to read a section.');

  let pts = rows;
  let intake = null;

  const [h0, h1] = rows[0];
  const looksLikeCounts = h0 > 1.5 && h1 > 1.5
    && Number.isInteger(Math.round(h0)) && Number.isInteger(Math.round(h1));

  if (looksLikeCounts) {
    const nUpper = Math.round(h0);
    const nLower = Math.round(h1);
    if (rows.length < 1 + nUpper + nLower) {
      throw new Error('Lednicer header counts do not match the number of points.');
    }
    const upper = rows.slice(1, 1 + nUpper);
    const lower = rows.slice(1 + nUpper, 1 + nUpper + nLower);
    pts = upper.slice().reverse().concat(lower.slice(1));
  } else if (leadingInts.length >= 3 && Math.round(leadingInts[0]) === rows.length) {
    // LE .txt. First integer is the point count; the next two mark where the
    // air intake starts and how many points span it. Both are 1-based indices
    // into the coordinate list.
    const start = Math.round(leadingInts[1]);
    const count = Math.round(leadingInts[2]);
    const a = rows[start - 1];
    const b = rows[start + count - 2];
    // Only trust it if the result is a plausible intake: on the lower surface,
    // forward, and ordered. Otherwise fall through to the defaults.
    if (a && b && a[1] < 0 && b[1] < 0 && a[0] >= 0 && a[0] < b[0] && b[0] < 0.25) {
      intake = { start: a[0], end: b[0] };
    }
  }

  return finalise({
    name,
    points: normaliseToUnitChord(pts),
    intake: intake || { start: 0.012, end: 0.055 },
    anchors: { A: 0.085, B: 0.30, C: 0.53, D: 0.78 },
    intakeFromFile: !!intake,
  });
}

/** Shift and scale an arbitrary point list so the chord runs 0..1 along x. */
export function normaliseToUnitChord(pts) {
  const xmin = Math.min(...pts.map((p) => p[0]));
  const xmax = Math.max(...pts.map((p) => p[0]));
  const c = xmax - xmin;
  return pts.map(([x, y]) => [(x - xmin) / c, y / c]);
}

/**
 * Split into upper and lower polylines, both running LE -> TE.
 * This is step 3 of the flat-development method (handbook 5.2): the two
 * surfaces are developed separately, and intakes are excluded from the curves.
 */
export function splitSurfaces(af) {
  const pts = af.points;
  // The leading edge is the point of minimum x.
  let iLE = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[iLE][0]) iLE = i;
  const upper = pts.slice(0, iLE + 1).reverse(); // TE->LE reversed = LE->TE
  const lower = pts.slice(iLE);
  return { upper, lower };
}

/** Resample a surface polyline to n points, evenly spaced in arc length. */
export function resampleSurface(poly, n) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  const out = [];
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * total;
    if (s <= 0) { out.push(poly[0].slice()); continue; }
    if (s >= total) { out.push(poly[poly.length - 1].slice()); continue; }
    let i = 1;
    while (cum[i] < s) i++;
    const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
    out.push([lerp(poly[i - 1][0], poly[i][0], f), lerp(poly[i - 1][1], poly[i][1], f)]);
  }
  return out;
}

/** Geometric parameters listed in handbook 2.4, as fractions of chord. */
export function airfoilMetrics(af) {
  const { upper, lower } = splitSurfaces(af);
  const at = (poly, x) => {
    for (let i = 1; i < poly.length; i++) {
      if (poly[i][0] >= x) {
        const f = (x - poly[i - 1][0]) / (poly[i][0] - poly[i - 1][0] || 1);
        return lerp(poly[i - 1][1], poly[i][1], clamp(f, 0, 1));
      }
    }
    return poly[poly.length - 1][1];
  };
  let maxT = 0, maxTx = 0, maxC = 0, maxCx = 0;
  for (let i = 0; i <= 400; i++) {
    const x = i / 400;
    const u = at(upper, x);
    const l = at(lower, x);
    const th = u - l;
    const cm = (u + l) / 2;
    if (th > maxT) { maxT = th; maxTx = x; }
    if (Math.abs(cm) > Math.abs(maxC)) { maxC = cm; maxCx = x; }
  }
  return {
    maxThickness: maxT,
    maxThicknessAt: maxTx,
    maxCamber: maxC,
    maxCamberAt: maxCx,
    perimeterUpper: afPolyLength(upper),
    perimeterLower: afPolyLength(lower),
  };
}

function afPolyLength(poly) {
  let s = 0;
  for (let i = 1; i < poly.length; i++) {
    s += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
  }
  return s;
}

function finalise(af) {
  af.metrics = airfoilMetrics(af);
  return af;
}

/** Built-in sections. The paraglider entries reproduce the shape family in
 *  handbook Table 2.1 as NACA-like approximations, not as copies of the
 *  linked coordinate files — import those directly if you want the originals. */
export const LIBRARY = {
  'NACA 4412': () => naca4('4412'),
  'NACA 4415': () => naca4('4415'),
  'NACA 2414': () => naca4('2414'),
  'NACA 4418': () => naca4('4418'),
};

/* ------------------------------------------------------------------ reflex -- */

/**
 * Add reflex to any section.
 *
 * A reflexed section turns its camber line back up near the trailing edge.
 * That costs a little lift and buys a positive pitching moment, which is what
 * makes a wing want to hold its own angle of attack instead of tucking — the
 * reason reflex profiles appear on paragliders at all, and the reason this is
 * a design parameter rather than a shape preference.
 *
 * The section is decomposed into a camber line and a thickness distribution,
 * the camber line is modified aft of `start`, and the two are recombined. That
 * works on an imported section as well as a generated one, and it leaves the
 * thickness distribution — and therefore the structural depth and the rib
 * geometry — untouched.
 *
 * @param {object} af
 * @param {number} amount   trailing-edge rise, fraction of chord (0.01 = 1%)
 * @param {number} start    chord fraction where reflex begins
 * @param {number} exponent shape of the rise; 2 is a smooth parabolic blend
 */
export function applyReflex(af, { amount = 0.012, start = 0.65, exponent = 2.0 } = {}) {
  if (amount === 0) return af;
  const { upper, lower } = splitSurfaces(af);

  const sample = (poly, x) => {
    for (let i = 1; i < poly.length; i++) {
      if (poly[i][0] >= x) {
        const span = poly[i][0] - poly[i - 1][0] || 1;
        const f = clamp((x - poly[i - 1][0]) / span, 0, 1);
        return poly[i - 1][1] + f * (poly[i][1] - poly[i - 1][1]);
      }
    }
    return poly[poly.length - 1][1];
  };

  const n = 120;
  const xs = [];
  for (let i = 0; i <= n; i++) xs.push(0.5 * (1 - Math.cos((Math.PI * i) / n)));

  // Rise applied to the camber line, zero ahead of `start` and rising
  // smoothly to `amount` at the trailing edge. The exponent keeps the
  // gradient continuous at the blend point, which matters: a kink there
  // shows up as a pressure spike and is exactly what reflex is meant to avoid.
  const rise = (x) => (x <= start ? 0 : amount * Math.pow((x - start) / (1 - start), exponent));

  const up = [];
  const lo = [];
  for (const x of xs) {
    const yu = sample(upper, x);
    const yl = sample(lower, x);
    const camber = (yu + yl) / 2 + rise(x);
    const half = (yu - yl) / 2;
    up.push([x, camber + half]);
    lo.push([x, camber - half]);
  }

  const pts = up.slice().reverse().concat(lo.slice(1));
  return finalise({
    ...af,
    name: `${af.name} reflex ${(amount * 100).toFixed(1)}%`,
    points: pts,
    reflex: { amount, start, exponent },
  });
}
