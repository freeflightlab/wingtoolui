/* viewfit.js — fitting a drawing to a frame.
 *
 * Two kinds of picture need opposite things from the same frame, and getting
 * that backwards produces a drawing that is correctly fitted and useless.
 *
 * **Geometry** — plan, front view, section, rib pattern. Both axes are metres,
 * so the scale must be identical in x and y. Stretching one axis draws a wing
 * that is not the wing.
 *
 * **Charts** — a polar, an atmosphere plot. The axes are km/h against m/s, or
 * metres against degrees. There is no meaningful ratio between them, so there
 * is nothing to preserve, and the drawing should fill the frame.
 *
 * Forcing the geometric rule on a polar is what put a tall narrow curve down
 * the middle of a wide frame with empty space either side: the aspect ratio of
 * the *data* was being honoured, when the data had no aspect ratio to honour.
 */

/**
 * Scale factors and offsets to fit bounds into a frame.
 *
 * @param {object} bounds {minX, maxX, minY, maxY} in data units
 * @param {object} frame  {width, height} in pixels
 * @param {object} opts   chart: independent axes; pad: fraction of the span
 * @returns {{sx, sy, ox, oy, uniform}}
 */
export function fitScales(bounds, frame, { chart = false, pad = 0.10 } = {}) {
  const w = Math.max(1, frame.width);
  const h = Math.max(1, frame.height);

  let { minX, maxX, minY, maxY } = bounds;
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    minX = 0; maxX = 1; minY = 0; maxY = 1;
  }
  // A zero-extent axis has no scale of its own; give it a unit span so the
  // drawing lands in the middle of the frame rather than dividing by zero.
  const dx = (maxX - minX) || 1;
  const dy = (maxY - minY) || 1;

  const scaleX = w / (dx * (1 + pad * 2));
  const scaleY = h / (dy * (1 + pad * 2));

  const sx = chart ? scaleX : Math.min(scaleX, scaleY);
  const sy = chart ? scaleY : sx;

  return {
    sx,
    sy,
    ox: w / 2 - ((minX + maxX) / 2) * sx,
    oy: h / 2 + ((minY + maxY) / 2) * sy,
    uniform: !chart,
    // How much of the frame the drawing actually uses. A geometric fit of
    // very elongated data will be low in one direction and that is correct;
    // a chart should be near 1 in both.
    fillX: (dx * sx) / w,
    fillY: (dy * sy) / h,
  };
}

/** Bounds of a point list. */
export function boundsOf(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}
