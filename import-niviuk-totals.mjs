/* import-niviuk-totals.mjs — the total-line-length tables.
 *
 * Section 10.7 of a Niviuk manual prints, per size, the distance from each
 * attachment point to the harness — "LINES HEIGHT + RISER mm". That is the
 * PMA total line length, and it is what an inspector measures against.
 *
 * It is also what `comparePlans` needs to diff a generated plan against a real
 * wing, which is the whole point of having the data.
 *
 *   node tools/import-niviuk-totals.mjs <manual.pdf> <size> > out.tsv
 *
 * The tables are printed three sizes side by side, so a row of text holds
 * three wings. The size is selected by its column index.
 */
import { execFileSync } from 'child_process';

const [pdf, wantSize] = process.argv.slice(2);
if (!pdf || !wantSize) {
  console.error('usage: import-niviuk-totals.mjs <manual.pdf> <size>');
  process.exit(1);
}

const text = execFileSync('pdftotext', ['-layout', pdf, '-'], {
  encoding: 'utf8', maxBuffer: 1 << 26,
});

// The block for this size: a heading like "HOOK 6 20", then rows of numbers.
const allLines = text.split(/\r?\n/);

// Start at section 10.7, not at the first heading that happens to match.
//
// The size headings appear twice in a manual: once over the per-line table in
// 10.6 and once over the totals table in 10.7. Anchoring on the first match
// read the wrong table and produced nothing, silently.
// The section heading carries its number and sits on a form-feed line, so it
// is matched on "10.7" rather than on the words alone — the contents page
// mentions the same words and comes first.
// The LAST occurrence, not the first.
//
// The contents page lists "10.7 TOTAL LINE LENGTH" and comes first, so
// matching forwards anchored on the contents and found the wrong table — or
// rather, found no table at all and reported zero anchors without error.
const sectionAt = allLines.map((l, i) => (/10\.7\s+Total line length/i.test(l) ? i : -1))
  .filter((i) => i >= 0).pop() ?? -1;
if (sectionAt < 0) {
  console.error('no "Total line length" section found');
  process.exit(1);
}
const lines = allLines.slice(sectionAt);
const headings = [];
lines.forEach((l, i) => {
  for (const m of l.matchAll(/([A-Z][A-Z0-9 ]+?)\s+(\d{2})(?=\s|$)/g)) {
    headings.push({ line: i, size: m[2], col: m.index });
  }
});

const block = headings.filter((h) => h.size === wantSize);
if (!block.length) {
  console.error(`no block for size ${wantSize}; found: `
    + [...new Set(headings.map((h) => h.size))].join(', '));
  process.exit(1);
}
const start = block[0];

// Which column of the side-by-side layout this size occupies.
const sameLine = headings.filter((h) => h.line === start.line)
  .sort((a, b) => a.col - b.col);
const column = sameLine.findIndex((h) => h.size === wantSize);

const rows = [];
for (let i = start.line + 1; i < Math.min(start.line + 30, lines.length); i++) {
  // A data row starts with an index and then runs groups of numbers. The
  // last size on a line may be truncated by the page edge, so a row is
  // accepted on its index and one length, not on a full set.
  if (!/^\s*\d{1,2}\s+\d{4}/.test(lines[i])) continue;
  const nums = lines[i].trim().split(/\s+/);
  // Each size contributes an index plus up to five values (A B C D BR).
  const groups = [];
  let cur = [];
  for (const tok of nums) {
    if (/^\d{1,2}$/.test(tok) && cur.length) { groups.push(cur); cur = []; }
    cur.push(tok);
  }
  if (cur.length) groups.push(cur);
  const g = groups[column];
  if (!g) continue;
  const index = Number(g[0]);
  const values = g.slice(1).filter((v) => /^\d{4}$/.test(v)).map(Number);
  if (values.length) rows.push({ index, values });
}

const ROWS = ['A', 'B', 'C', 'D', 'BR'];
const out = [];
out.push(`# Total line lengths, size ${wantSize}`);
out.push('# Source: Niviuk user manual, section 10.7 "Total line length"');
out.push('# "LINES HEIGHT + RISER mm" — the PMA total, sail to harness,');
out.push('#   so these INCLUDE the risers.');
out.push('# Retrieved: 2026-08-31');
out.push('anchor\trow\ttotal_length_mm');
for (const r of rows) {
  r.values.forEach((v, i) => {
    if (ROWS[i]) out.push(`${r.index}\t${ROWS[i] === 'BR' ? 'K' : ROWS[i]}\t${v}`);
  });
}
console.log(out.join('\n'));
console.error(`${rows.length} anchors, ${rows.reduce((a, r) => a + r.values.length, 0)} lengths`);
