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
if (!pdf) {
  console.error('usage: import-niviuk-totals.mjs <manual.pdf> [size|--list]');
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
const sectionAt = allLines.map((l, i) => (/\d+\.\d+\s+Total line length/i.test(l) ? i : -1))
  .filter((i) => i >= 0).pop() ?? -1;
if (sectionAt < 0) {
  console.error('no "Total line length" section found');
  process.exit(1);
}
const lines = allLines.slice(sectionAt);
// Headings that name THIS wing, not any two digits after any capitals.
//
// A loose pattern picked up page numbers, column headers and stray figures —
// the Artik came back with twelve "sizes", half of them page numbers. The
// model name is taken from the first heading line under the section, and only
// its own headings count afterwards.
//
// Two forms appear across the range, with and without a dash:
//   "HOOK 6 20"   "IKUMA 3 - 20"   "SKIN 4 P - 14"
const firstHeading = lines.slice(1, 8).find((l) => /^[A-Z][A-Z0-9 ]*\s-?\s*\d{1,3}\b/.test(l.trim()));
// The size is the LAST number on the heading, not the first.
//
// Every model name contains its own version number — HOOK 6, IKUMA 3,
// SKIN 4 P — so a lazy match stops there and reads the version as the size.
// "HOOK 6 20" came back as model "HOOK", size 6.
const model = firstHeading
  ? firstHeading.trim().match(/^([A-Z][A-Z0-9 ]*?)\s*-?\s*\d{1,3}\s*(?:$|\s{2})/)[1].trim()
  : null;
if (!model) {
  console.error('no size heading found under the totals section');
  process.exit(1);
}
const headRe = new RegExp(`${model.replace(/\s+/g, '\\s+')}\\s*-?\\s*(\\d{1,3})(?=\\s|$)`, 'g');

const headings = [];
lines.forEach((l, i) => {
  for (const m of l.matchAll(headRe)) {
    headings.push({ line: i, size: m[1], col: m.index });
  }
});

// Discover the sizes rather than requiring them to be known.
//
// The section number varies by manual (10.7 on the Hook 6, elsewhere on
// others), and so do the sizes. Being told both meant importing a manual
// required reading it first.
const sizes = [...new Set(headings.map((h) => h.size))];
if (!wantSize || wantSize === '--list') {
  console.log(sizes.join(' '));
  process.exit(0);
}

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

// Row labels come from the table's own header, not a fixed list.
//
// A fixed ['A','B','C','D','BR'] fitted every double-surface wing and threw
// away four rows of the Skin 4 P, which runs A to I plus the brake. A
// single-surface wing has no cells to gather loads into, so every attachment
// point gets its own row — the same fact that broke the line-sheet parser.
// The header can wrap across lines, so it is gathered rather than read from
// one — the Skin 4 P prints "A B C" on one line and the rest on the next,
// which silently truncated its ten columns to three.
const headerTokens = [];
for (const l of lines.slice(start.line, start.line + 8)) {
  if (/^\s*\d/.test(l)) break;                  // data has started
  for (const t of l.trim().split(/\s+/)) {
    if (/^(?:[A-Z]|BR|ST)$/.test(t)) headerTokens.push(t);
  }
}
// Only the first repetition: the table prints several sizes side by side.
const firstA = headerTokens.indexOf('A');
const secondA = headerTokens.indexOf('A', firstA + 1);
const ROWS = headerTokens.length
  ? headerTokens.slice(firstA, secondA > 0 ? secondA : undefined)
  : ['A', 'B', 'C', 'D', 'BR'];
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
