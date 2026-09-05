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
 */
import { readFileSync, readdirSync } from 'fs';
import {
  parseLineTable, parseSimpleLineSheet, parseUpLineSheet, parseBgdLineTable,
  ANCHOR_DENSITY,
} from '../src/core/lineplan.js';

const files = readdirSync('data/reference').filter((f) => f.endsWith('.tsv'));

const read = (f, body) => {
  if (/^up-split-/.test(f)) return parseSimpleLineSheet(body).lines;
  if (/^up-.*Components/.test(f)) return parseUpLineSheet(body).lines;
  if (/^bgd-/.test(f)) return parseBgdLineTable(body).lines;
  if (f === 'niviuk-spec.tsv' || /-totals/.test(f)) return null;
  if (/^niviuk-/.test(f)) return parseSimpleLineSheet(body).lines;
  if (/materials|families|risers|min-strength/.test(f)) return null;
  const t = parseLineTable(body);
  return t.lines.length ? t.lines : null;
};

/** One wing: how many anchors each row carries at the canopy. */
const wings = new Map();
for (const f of files) {
  let lines;
  try { lines = read(f, readFileSync(`data/reference/${f}`, 'utf8')); }
  catch { continue; }
  if (!lines || lines.length < 8) continue;

  // The family is the filename up to the size.
  const family = f.replace(/\.tsv$/, '').replace(/[-_](XS|S|SM|MS|M|ML|L|XL|\d+)$/i, '');
  const uppers = lines.filter((l) => l.level === 'upper');
  if (uppers.length < 6) continue;

  const rows = {};
  for (const l of uppers) rows[l.row] = (rows[l.row] || 0) + 1;
  // Load-bearing rows only; brakes and stabilo are not lift anchors.
  for (const k of ['K', 'S', 'Z']) delete rows[k];
  if (Object.keys(rows).length < 2) continue;

  if (!wings.has(family)) wings.set(family, []);
  wings.get(family).push({ file: f, rows, anchors: uppers.length });
}

/* A family's topology is constant across its sizes, so one entry per family:
 * counting six sizes of the same wing six times would weight it as six
 * independent observations, which it is not. */
const designs = [];
for (const [family, sizes] of wings) {
  const rows = sizes[0].rows;
  const rowNames = Object.keys(rows).sort();
  const risers = rowNames.length;
  designs.push({
    family,
    sizes: sizes.length,
    rows,
    risers,
    // The ratio the generator cares about: front row against the rearmost.
    frontToRear: rows[rowNames[0]] / rows[rowNames[rowNames.length - 1]],
  });
}

const byRisers = {};
for (const d of designs) {
  (byRisers[d.risers] ||= []).push(d.frontToRear);
}

console.log(`${designs.length} designs measured from ${wings.size} families, `
  + `${files.length} files\n`);
console.log('front-row anchors per rear-row anchor, by load-bearing row count:');
console.log('  rows  risers   n   mean   min   max   verdict      table');
const table = ANCHOR_DENSITY.ratioByRisers;
let mismatches = 0;
for (const [rows, vals] of Object.entries(byRisers).sort()) {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  // The table is keyed by RISER count; this measures ROW count, and a
  // two-riser wing carries three load-bearing rows. Comparing `rows` against
  // `table[rows]` set the three-row corpus against the three-riser entry and
  // reported a disagreement that was purely a mis-keyed lookup.
  const t = table[String(Number(rows) - 1)];
  const claim = t ? `${t.mean.toFixed(2)} (n=${t.n})` : '—';
  const agrees = t ? Math.abs(mean / t.mean - 1) < 0.25 : true;
  if (!agrees) mismatches++;
  console.log(`   ${rows}      ${Number(rows) - 1}    ${String(vals.length).padStart(2)}  `
    + `${mean.toFixed(2)}  ${Math.min(...vals).toFixed(2)}  `
    + `${Math.max(...vals).toFixed(2)}   ${(agrees ? 'agrees' : 'DISAGREES').padEnd(11)}`
    + `${claim}`);
}

console.log('\nevery design measured:');
for (const d of designs.sort((a, b) => b.risers - a.risers || a.family.localeCompare(b.family))) {
  const r = Object.entries(d.rows).sort().map(([k, v]) => `${k}${v}`).join(' ');
  console.log(`  ${d.family.padEnd(30)} ${d.risers} rows  ${r.padEnd(26)}`
    + `${d.frontToRear.toFixed(2)}  (${d.sizes} size${d.sizes > 1 ? 's' : ''})`);
}

console.log(`\n${mismatches} row-count group(s) where the corpus disagrees with `
  + 'the hardcoded table');
process.exit(mismatches ? 1 : 0);
