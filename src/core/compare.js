/* compare.js — put two designs side by side.
 *
 * Every model in this project answers a question about one wing. A designer
 * is almost never asking about one wing: they are asking whether *this*
 * change is worth making. Two more cells, a metre more line, half a degree
 * of washin — does it pay?
 *
 * Answering that from two separate reports means reading two columns of
 * numbers and doing the subtraction by eye, which is where the small
 * regressions hide. A change that adds 3% to glide and 8% to line drag looks
 * like an improvement in the glide column alone.
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does not do
 * ---------------------------------------------------------------------------
 * It does not score a design or pick a winner. The trade between glide,
 * weight, material cost and handling is the designer's to make, and a tool
 * that collapses it into one number is hiding the decision rather than
 * supporting it.
 *
 * What it does is put the differences in one place, mark which direction is
 * better for each, and say plainly when a change **improves one thing and
 * costs another** — which is the case worth seeing and the one two separate
 * reports obscure.
 */

/**
 * Metrics to compare, and which way is better.
 *
 * `better: 0` means neither direction is inherently better — cell count and
 * area are choices, not improvements — so they are reported without a verdict.
 */
export const COMPARISON_METRICS = [
  { key: 'flatArea', label: 'flat area', unit: 'm²', better: 0, dp: 2 },
  { key: 'aspectRatio', label: 'aspect ratio', unit: '', better: 0, dp: 2 },
  { key: 'cells', label: 'cells', unit: '', better: 0, dp: 0 },
  { key: 'glideRatio', label: 'glide ratio', unit: '', better: +1, dp: 2 },
  { key: 'sinkRate', label: 'sink rate', unit: 'm/s', better: -1, dp: 2 },
  { key: 'trimSpeedKMH', label: 'trim speed', unit: 'km/h', better: 0, dp: 1 },
  { key: 'cxLines', label: 'line drag', unit: '', better: -1, dp: 5 },
  { key: 'lineMetres', label: 'line length', unit: 'm', better: -1, dp: 1 },
  { key: 'lineCount', label: 'line count', unit: '', better: -1, dp: 0 },
  { key: 'clothMetres', label: 'cloth ordered', unit: 'm', better: -1, dp: 1 },
  { key: 'utilisation', label: 'nesting', unit: '', better: +1, dp: 3 },
  { key: 'massKg', label: 'mass', unit: 'kg', better: -1, dp: 3 },
  { key: 'worstPhiDeg', label: 'worst flow misalignment', unit: '°', better: -1, dp: 2 },
  { key: 'floorSizedFraction', label: 'lines at minimum size', unit: '', better: 0, dp: 2 },
];

/**
 * Compare two summaries.
 *
 * Each is a flat object of the keys above; missing keys are skipped rather
 * than treated as zero, because a metric one design has and the other does
 * not is not a difference of that size.
 */
export function compareDesigns(a, b, {
  labels = ['A', 'B'], significantFraction = 0.005, metrics = COMPARISON_METRICS,
} = {}) {
  const rows = [];
  for (const m of metrics) {
    const va = a[m.key];
    const vb = b[m.key];
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;

    const delta = vb - va;
    const fraction = va !== 0 ? delta / Math.abs(va) : (delta === 0 ? 0 : Infinity);
    const significant = Math.abs(fraction) >= significantFraction;
    // Direction, only where one exists.
    const verdict = m.better === 0 || !significant ? 'neutral'
      : (Math.sign(delta) === Math.sign(m.better) ? 'better' : 'worse');

    rows.push({
      ...m, a: va, b: vb, delta, fraction, significant, verdict,
    });
  }

  const better = rows.filter((r) => r.verdict === 'better');
  const worse = rows.filter((r) => r.verdict === 'worse');
  const changed = rows.filter((r) => r.significant);

  return {
    labels,
    rows,
    better,
    worse,
    changed,
    unchanged: rows.filter((r) => !r.significant),
    // The case worth naming: a change that helps one thing and costs another.
    isTradeoff: better.length > 0 && worse.length > 0,
    // And the case worth naming louder: nothing measurable changed.
    isNoOp: changed.length === 0,
    significantFraction,
  };
}

/** The comparison as text, in the shape a design note takes. */
export function comparisonText(cmp) {
  const out = [];
  const [la, lb] = cmp.labels;
  out.push(`${la}  vs  ${lb}`);
  out.push('');

  const fmt = (v, dp) => (Number.isFinite(v) ? v.toFixed(dp) : '—');
  const width = Math.max(...cmp.rows.map((r) => r.label.length), 10);
  for (const r of cmp.rows) {
    const mark = r.verdict === 'better' ? '+' : (r.verdict === 'worse' ? '-' : ' ');
    const pct = r.significant ? `${(r.fraction * 100 >= 0 ? '+' : '')}`
      + `${(r.fraction * 100).toFixed(1)}%` : '';
    out.push(`${mark} ${r.label.padEnd(width)}  ${fmt(r.a, r.dp).padStart(9)}  `
      + `${fmt(r.b, r.dp).padStart(9)}  ${pct.padStart(7)}  ${r.unit}`);
  }

  out.push('');
  if (cmp.isNoOp) {
    out.push(`Nothing changed by more than `
      + `${(cmp.significantFraction * 100).toFixed(1)}%.`);
  } else if (cmp.isTradeoff) {
    out.push(`A trade, not an improvement: `
      + `${cmp.better.map((r) => r.label).join(', ')} better, `
      + `${cmp.worse.map((r) => r.label).join(', ')} worse.`);
  } else if (cmp.better.length) {
    out.push(`${lb} is better on ${cmp.better.map((r) => r.label).join(', ')} `
      + 'with nothing measurably worse.');
  } else if (cmp.worse.length) {
    out.push(`${lb} is worse on ${cmp.worse.map((r) => r.label).join(', ')} `
      + 'with nothing measurably better.');
  }
  return out.join('\n');
}
