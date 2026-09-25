/* num.js — small numeric helpers shared by the core modules. */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export const lerp = (a, b, t) => a + (b - a) * t;

/** Composite Simpson integration. n is forced even. */
export function simpson(f, a, b, n = 200) {
  if (n % 2) n += 1;
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += f(a + i * h) * (i % 2 ? 4 : 2);
  return (sum * h) / 3;
}

export const dist3 = (p, q) =>
  Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

export const dist2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/**
 * Solve f(x)=0 on a bracketing interval by bisection.
 * Chosen over Newton because every root we need here is bracketed and
 * monotonic, and bisection cannot diverge on a user-supplied input.
 */
export function bisect(f, lo, hi, tol = 1e-12, maxIter = 200) {
  let flo = f(lo);
  let fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo * fhi > 0) throw new Error('bisect: root is not bracketed');
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (fmid === 0 || (hi - lo) / 2 < tol) return mid;
    if (flo * fmid < 0) { hi = mid; fhi = fmid; } else { lo = mid; flo = fmid; }
  }
  return (lo + hi) / 2;
}

/** Cumulative arc length along a polyline of [x,y] or [x,y,z] points. */
export function cumulativeLength(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) {
    const d = pts[0].length === 3 ? dist3(pts[i - 1], pts[i]) : dist2(pts[i - 1], pts[i]);
    out.push(out[i - 1] + d);
  }
  return out;
}

/** Linear interpolation of a point at arc length s along a polyline. */
export function pointAtLength(pts, cum, s) {
  if (s <= 0) return pts[0].slice();
  const last = cum[cum.length - 1];
  if (s >= last) return pts[pts.length - 1].slice();
  let i = 1;
  while (cum[i] < s) i++;
  const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return pts[i - 1].map((v, k) => lerp(v, pts[i][k], f));
}
