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
import { readFileSync, readdirSync, existsSync } from 'fs';
import {
  ANCHOR_DENSITY, FRONT_DENSITY, DESIGN_LINES, parsePhiLineSheet, cascadeSpecFromSheet,
  parseLineTable, referenceTotals, tipLinesFromTotals, tipLinesFromPaths, withTipCounts,
  stabiloMainFromTotals,
} from '../src/core/lineplan.js';
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

  // The risers, counted where the sheet has main lines — the lines on a
  // riser. A main serving two rows (2AB1, DE) is on one riser, its first
  // row's. This was assumed to be one fewer than the rows, and three of the
  // four-row wings are two-liners: the Torre and the Meru 2, whose line plans
  // show a and b anchors sharing the A mains and c and d the C mains, and the
  // Artik R 2, whose sheet has A and C mains and no others.
  const mainRows = new Set(read.lines
    .filter((l) => l.level === 'main' && /^[A-I]$/.test((l.rows || [l.row])[0]))
    .map((l) => (l.rows || [l.row])[0]));

  const family = designOf(f);
  if (!families.has(family)) families.set(family, []);
  // The tip lines: the outermost anchors that rows share one path under —
  // the stabilo's, on sheets that name them in their rows. Read from the
  // sheet's own totals (Ozone), the totals Niviuk publish for the same size,
  // or the paths BGD state; UP name the stabilo's lines as a row of their own.
  let tips = null;
  // And the stabilo's own line, where the sheet shows which it is: BGD state
  // it, and an Ozone sheet's totals give it as the main its tip lines' path
  // is (`stabiloMainFromTotals`). It is then not its row's main.
  let stabiloMain = null;
  if (read.kind === 'components') {
    let found = null;
    if (read.reader === 'bgd') {
      found = tipLinesFromPaths(read.lines);
      const m = found.groups[0]?.main && read.lines.find((l) => l.name === found.groups[0].main);
      if (m) stabiloMain = { row: m.row, index: m.index };
    } else if (read.reader === 'table') {
      const totals = referenceTotals(parseLineTable(readFileSync(`data/reference/${f}`, 'utf8')));
      found = tipLinesFromTotals(read.lines, totals);
      if (found.ok && found.groups.length) stabiloMain = stabiloMainFromTotals(read.lines, totals, found);
    } else if (/^niviuk-/.test(f)) {
      const t = `data/reference/${f.replace(/\.tsv$/, '')}-totals.tsv`;
      if (existsSync(t)) {
        const totals = {};
        for (const l of readFileSync(t, 'utf8').split('\n').filter((x) => /^\d/.test(x))) {
          const [a, row, mm] = l.split('\t');
          (totals[a] ||= {})[row] = Number(mm);
        }
        found = tipLinesFromTotals(read.lines, totals);
      }
    }
    if (found?.ok && found.groups.length) tips = found.tips;
  }
  const cascade = read.kind === 'components' ? cascadeSpecFromSheet(read.lines, { stabiloMain }) : null;
  if (cascade && tips) cascade.spec = withTipCounts(cascade.spec, tips);
  families.get(family).push({
    file: f, kind: read.kind, rows,
    risers: mainRows.size || null,
    // The cascade as far as the generator can build it, from a sheet that
    // has the levels below the canopy, with its tip lines where they show.
    cascade,
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
  // Totals sheets carry no main lines; the component sheets say, and must
  // agree with each other.
  const riserCounts = [...new Set(list.map((x) => x.risers).filter(Boolean))];
  if (riserCounts.length > 1) {
    disagreements.push(`${family}: ${riserCounts.join(' and ')} risers on different sheets`);
  }
  designs.push({
    family,
    sheets: list.length,
    rows,
    rowCount: rowNames.length,
    risers: riserCounts.length === 1 ? riserCounts[0] : null,
    // The ratio the generator cares about: front row against the rearmost.
    frontToRear: rows[rowNames[0]] / rows[rowNames[rowNames.length - 1]],
  });
}

// One group a layout: risers, then load-bearing rows.
const byLayout = {};
for (const d of designs) (byLayout[`${d.risers}/${d.rowCount}`] ||= []).push(d.frontToRear);

console.log(`${designs.length} designs measured from ${sheets} sheets, `
  + `${files.length} files\n`);
console.log('front-row anchors per rear-row anchor, by risers / load-bearing rows:');
console.log('  layout   n   mean   min   max   verdict      table');
const table = ANCHOR_DENSITY.ratioByLayout;
let mismatches = 0;
const r2 = (x) => Math.round(x * 100) / 100;
const layoutOrder = (k) => k.split('/').map(Number);
for (const [key, vals] of Object.entries(byLayout)
  .sort(([a], [b]) => layoutOrder(a)[0] - layoutOrder(b)[0] || layoutOrder(a)[1] - layoutOrder(b)[1])) {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const t = table[key];
  const claim = t ? `${t.mean.toFixed(2)} (n=${t.n}, ${t.min.toFixed(2)}-${t.max.toFixed(2)})` : '—';
  // Held to the figures, not to a tolerance: this is where the table comes
  // from, and "within a quarter" let n = 20 stand for twelve designs.
  const agrees = !!t && t.n === vals.length && r2(mean) === t.mean
    && r2(Math.min(...vals)) === t.min && r2(Math.max(...vals)) === t.max;
  if (!agrees) mismatches++;
  console.log(`   ${key.padEnd(6)} ${String(vals.length).padStart(2)}  `
    + `${mean.toFixed(2)}  ${Math.min(...vals).toFixed(2)}  `
    + `${Math.max(...vals).toFixed(2)}   ${(agrees ? 'agrees' : 'DISAGREES').padEnd(11)}`
    + `${claim}`);
}
const extraLayouts = Object.keys(table).filter((k) => !byLayout[k]);
if (extraLayouts.length) {
  mismatches++;
  console.log(`  DISAGREES: the table lists ${extraLayouts.join(', ')}, which no design measured has`);
}
if (ANCHOR_DENSITY.sampleDesigns !== designs.length || ANCHOR_DENSITY.sampleSheets !== sheets) {
  mismatches++;
  console.log(`\nDISAGREES: the table says ${ANCHOR_DENSITY.sampleDesigns} designs from `
    + `${ANCHOR_DENSITY.sampleSheets} sheets`);
}

console.log('\nevery design measured:');
for (const d of designs.sort((a, b) => b.rowCount - a.rowCount || a.family.localeCompare(b.family))) {
  const r = Object.entries(d.rows).sort().map(([k, v]) => `${k}${v}`).join(' ');
  console.log(`  ${d.family.padEnd(18)} ${d.risers ?? '?'} risers ${d.rowCount} rows  ${r.padEnd(34)}`
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
/* Each design's own cascade, as `DESIGN_LINES` holds it for the pipeline and
 * the wing picker: the layout and the counts, from every component sheet of
 * the design, which must agree with each other and with the table. */
console.log('\neach design\'s own cascade, as the generator can build it:');
const familyOf = new Map(cellRows.map((r) => [r[col('design')], r[col('family')]]));
const measuredLines = new Map();
for (const [design, list] of families) {
  const built = list.filter((x) => x.cascade);
  if (!built.length) continue;
  const forms = [...new Set(built.map((x) => `${x.cascade.layout} | ${x.cascade.spec}`))];
  const name = familyOf.get(design) ?? design;
  if (forms.length > 1) {
    mismatches++;
    console.log(`  DISAGREES: ${name}'s sheets give ${forms.length} different cascades`);
  }
  const [layout, spec] = forms[0].split(' | ');
  measuredLines.set(name, { layout, spec, sheets: built.length });
}
for (const [name, m] of [...measuredLines].sort()) {
  const t = DESIGN_LINES[name];
  const agrees = !!t && t.layout === m.layout && t.spec === m.spec && t.sheets === m.sheets;
  if (!agrees) mismatches++;
  console.log(`  ${name.padEnd(20)} ${m.layout.padEnd(18)} ${m.spec.replace(/\n/g, ' / ').padEnd(46)}`
    + ` (${m.sheets} sheet${m.sheets > 1 ? 's' : ''})${agrees ? '' : `   DISAGREES with ${t ? `${t.layout} | ${t.spec.replace(/\n/g, ' / ')}` : 'nothing'}`}`);
}
const extraLines = Object.keys(DESIGN_LINES).filter((k) => !measuredLines.has(k));
if (extraLines.length) {
  mismatches++;
  console.log(`  DISAGREES: DESIGN_LINES lists ${extraLines.join(', ')}, which no sheet measures`);
}


console.log(`\n${mismatches} place(s) where the corpus disagrees with `
  + 'the hardcoded table');
process.exit(mismatches ? 1 : 0);
