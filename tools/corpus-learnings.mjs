/* corpus-learnings.mjs — what every dataset in the repository says.
 *
 * The reference sweep checks that each wing is physically possible. That is
 * not the same as learning from it. 86 of 116 files were reaching nothing
 * stronger: parsed, checked, and never consulted when the model needed a
 * number.
 *
 * Meanwhile `ANCHOR_DENSITY` — the table the anchor generator is calibrated
 * against — held six hand-entered Ozone designs, chosen when the database had
 * only Ozone in it.
 *
 * This measures every line sheet in the corpus and reports what they say
 * together, so a hardcoded constant can be compared against the data it was
 * supposed to come from.
 *
 * ---------------------------------------------------------------------------
 * One design, one observation
 * ---------------------------------------------------------------------------
 * A family's line plan is the same in every size, so its sizes are one
 * observation, not several. This said so and then counted the UP Torre six
 * times — once for its totals sheet and once for each size's component sheet,
 * because their file names do not end in a size — and the Makalu 5, Meru 2
 * and Summit X twice each. "27 designs" were 19, and the three-riser group's
 * "n = 20" was 12.
 *
 * The Torre's five component sheets were also read with their middle lines
 * counted as canopy lines (see `parseLineName`): A 20 where its own totals
 * sheet says 12. So a design is identified by maker and model here, and the
 * sheets of one design are held against each other.
 */
import { readFileSync, readdirSync } from 'fs';
import { ANCHOR_DENSITY, FRONT_DENSITY, parsePhiLineSheet } from '../src/core/lineplan.js';
import { referenceLines, designOf } from './reference-files.mjs';

const files = readdirSync('data/reference').filter((f) => f.endsWith('.tsv'));

/** One sheet: how many canopy lines each load-bearing row carries. */
const families = new Map();
let sheets = 0;
for (const f of files) {
  let read;
  try { read = referenceLines(f, readFileSync(`data/reference/${f}`, 'utf8')); }
  catch { continue; }
  if (!read || read.lines.length < 8) continue;

  const uppers = read.lines.filter((l) => l.level === 'upper');
  if (uppers.length < 6) continue;

  const rows = {};
  for (const l of uppers) rows[l.row] = (rows[l.row] || 0) + 1;
  // Load-bearing rows only; brakes and stabilo are not lift anchors.
  for (const k of ['K', 'S', 'Z']) delete rows[k];
  if (Object.keys(rows).length < 2) continue;

  const family = designOf(f);
  if (!families.has(family)) families.set(family, []);
  families.get(family).push({
    file: f, kind: read.kind, rows,
    pattern: Object.keys(rows).sort().map((k) => `${k}${rows[k]}`).join(' '),
  });
  sheets++;
}

/* One entry a design. Where its sheets disagree, the totals sheet — one row
 * for each canopy attachment, by construction — is the one believed, and the
 * disagreement is printed rather than averaged away. */
const designs = [];
const disagreements = [];
for (const [family, list] of families) {
  const patterns = [...new Set(list.map((x) => x.pattern))];
  const preferred = list.find((x) => x.kind === 'totals') ?? list[0];
  if (patterns.length > 1) {
    disagreements.push(`${family}: ${patterns.join('  |  ')}  (using ${preferred.pattern}, `
      + `from ${preferred.file})`);
  }
  const rows = preferred.rows;
  const rowNames = Object.keys(rows).sort();
  designs.push({
    family,
    sheets: list.length,
    rows,
    rowCount: rowNames.length,
    // The ratio the generator cares about: front row against the rearmost.
    frontToRear: rows[rowNames[0]] / rows[rowNames[rowNames.length - 1]],
  });
}

const byRows = {};
for (const d of designs) (byRows[d.rowCount] ||= []).push(d.frontToRear);

console.log(`${designs.length} designs measured from ${sheets} sheets, `
  + `${files.length} files\n`);
console.log('front-row anchors per rear-row anchor, by load-bearing row count:');
console.log('  rows   key   n   mean   min   max   verdict      table');
const table = ANCHOR_DENSITY.ratioByRisers;
let mismatches = 0;
const r2 = (x) => Math.round(x * 100) / 100;
for (const [rows, vals] of Object.entries(byRows).sort()) {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  // The table is keyed by RISER count, taken as one fewer than the rows: the
  // rearmost row cascades into the riser ahead of it. That is what the two-
  // and three-riser wings here do; for five rows and nine it is only a key.
  const t = table[String(Number(rows) - 1)];
  const claim = t ? `${t.mean.toFixed(2)} (n=${t.n}, ${t.min.toFixed(2)}-${t.max.toFixed(2)})` : '—';
  // Held to the figures, not to a tolerance: this is where the table comes
  // from, and "within a quarter" let n = 20 stand for twelve designs.
  const agrees = !!t && t.n === vals.length && r2(mean) === t.mean
    && r2(Math.min(...vals)) === t.min && r2(Math.max(...vals)) === t.max;
  if (!agrees) mismatches++;
  console.log(`   ${rows}      ${Number(rows) - 1}    ${String(vals.length).padStart(2)}  `
    + `${mean.toFixed(2)}  ${Math.min(...vals).toFixed(2)}  `
    + `${Math.max(...vals).toFixed(2)}   ${(agrees ? 'agrees' : 'DISAGREES').padEnd(11)}`
    + `${claim}`);
}
if (ANCHOR_DENSITY.sampleDesigns !== designs.length || ANCHOR_DENSITY.sampleSheets !== sheets) {
  mismatches++;
  console.log(`\nDISAGREES: the table says ${ANCHOR_DENSITY.sampleDesigns} designs from `
    + `${ANCHOR_DENSITY.sampleSheets} sheets`);
}

console.log('\nevery design measured:');
for (const d of designs.sort((a, b) => b.rowCount - a.rowCount || a.family.localeCompare(b.family))) {
  const r = Object.entries(d.rows).sort().map(([k, v]) => `${k}${v}`).join(' ');
  console.log(`  ${d.family.padEnd(18)} ${d.rowCount} rows  ${r.padEnd(34)}`
    + `${d.frontToRear.toFixed(2)}  (${d.sheets} sheet${d.sheets > 1 ? 's' : ''})`);
}

if (disagreements.length) {
  console.log('\nsheets of one design that count its rows differently:');
  for (const d of disagreements) console.log(`  ${d}`);
}

/* Front-row density: front-row anchors over the ribs of a half-wing.
 *
 * The anchor search is bounded by it, and the bound was "0.56 to 0.91" from
 * six Ozone designs, three of them with the wrong rib count. Measured here on
 * every design with a line sheet and a published cell count, and held to
 * `FRONT_DENSITY` figure for figure, as the ratios above are held to theirs.
 */
const cellRows = readFileSync('data/reference/published-cells.tsv', 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
const cellHead = cellRows.shift();
const col = (name) => cellHead.indexOf(name);
const fronts = [];
for (const r of cellRows) {
  const key = r[col('design')];
  const cells = Number(r[col('cells')]);
  const ribs = Math.floor(cells / 2) + 1;
  let front = null;
  const d = designs.find((x) => x.family === key);
  if (d) {
    front = d.rows[Object.keys(d.rows).sort()[0]];
  } else if (key.startsWith('phi-')) {
    // PHI's sheet is not a table the corpus reader takes; its own reader
    // gives the anchors of each row by rib.
    const f = files.find((x) => designOf(x) === key);
    const sheet = f && parsePhiLineSheet(readFileSync(`data/reference/${f}`, 'utf8'));
    front = sheet?.blocks.find((b) => b.row === 'A')?.anchors.length ?? null;
  }
  if (!front) {
    mismatches++;
    console.log(`\nDISAGREES: ${key} has a cell count and no front row was measured`);
    continue;
  }
  fronts.push({
    family: r[col('family')], cells, ribs, front,
    flatAR: Number(r[col('flat_AR')]), density: r2(front / ribs),
  });
}
fronts.sort((a, b) => a.density - b.density);
console.log('\nfront-row density, front-row anchors over ribs on a half-wing:');
for (const x of fronts) {
  const claimed = FRONT_DENSITY.designs[x.family];
  const agrees = claimed === x.density;
  if (!agrees) mismatches++;
  console.log(`  ${x.family.padEnd(20)} ${String(x.front).padStart(2)} of ${String(x.ribs).padStart(2)} ribs `
    + `(${x.cells} cells)  ${x.density.toFixed(2)}  AR ${x.flatAR.toFixed(2)}`
    + `${agrees ? '' : `   DISAGREES with ${claimed ?? 'nothing'}`}`);
}
const dens = fronts.map((x) => x.density);
const median = r2([...dens].sort((a, b) => a - b)[Math.floor((dens.length - 1) / 2)]
  / 2 + [...dens].sort((a, b) => a - b)[Math.ceil((dens.length - 1) / 2)] / 2);
const extra = Object.keys(FRONT_DENSITY.designs).filter((k) => !fronts.some((x) => x.family === k));
const summaryAgrees = FRONT_DENSITY.n === fronts.length && FRONT_DENSITY.min === Math.min(...dens)
  && FRONT_DENSITY.max === Math.max(...dens) && FRONT_DENSITY.median === median && !extra.length;
if (!summaryAgrees) mismatches++;
console.log(`  n ${fronts.length}, ${Math.min(...dens).toFixed(2)} to ${Math.max(...dens).toFixed(2)}, `
  + `median ${median.toFixed(2)}  ${summaryAgrees ? 'agrees' : 'DISAGREES'} with `
  + `FRONT_DENSITY (n ${FRONT_DENSITY.n}, ${FRONT_DENSITY.min}-${FRONT_DENSITY.max}, `
  + `median ${FRONT_DENSITY.median})${extra.length ? `; it lists ${extra.join(', ')} as well` : ''}`);
// Whether it follows aspect ratio, which would make it something to predict
// rather than an input.
const ars = fronts.map((x) => x.flatAR);
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const [ma, md] = [mean(ars), mean(dens)];
const cov = ars.reduce((s, a, i) => s + (a - ma) * (dens[i] - md), 0);
const rAR = cov / Math.sqrt(ars.reduce((s, a) => s + (a - ma) ** 2, 0)
  * dens.reduce((s, x) => s + (x - md) ** 2, 0));
console.log(`  against flat aspect ratio: r = ${rAR.toFixed(2)}`);

console.log(`\n${mismatches} place(s) where the corpus disagrees with `
  + 'the hardcoded table');
process.exit(mismatches ? 1 : 0);
