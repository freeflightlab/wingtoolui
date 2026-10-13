/* relabel-niviuk-totals.mjs — put the Niviuk totals back in their columns.
 *
 *   node tools/relabel-niviuk-totals.mjs          report what would change
 *   node tools/relabel-niviuk-totals.mjs --write  rewrite the files
 *
 * See `niviuk-totals-labels.mjs` for what went wrong. It only moves a label:
 * no length is changed, and a file whose rows the per-line sheet cannot
 * explain is left alone and reported.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { gridRowsFromNames, labelsForRow } from './niviuk-totals-labels.mjs';

const dir = 'data/reference';
const write = process.argv.includes('--write');
const NOTE = '# Rows relabelled 2026-10-06: where the manual\'s grid has an empty cell the\n'
  + '#   importer had moved the values after it one column left (a brake total\n'
  + '#   filed as a D line). The columns are restored from the same manual\'s\n'
  + '#   per-line table. No length is changed. See docs/niviuk-import.md.';

const all = readdirSync(dir);
let changed = 0;
let moved = 0;
let refused = 0;
for (const f of all.filter((x) => /^niviuk-.*-totals\.tsv$/.test(x)).sort()) {
  const model = /^niviuk-([a-z0-9]+)-/.exec(f)[1];
  const lineSheet = all.find((x) => new RegExp(`^niviuk-${model}-\\d+\\.tsv$`).test(x));
  if (!lineSheet) { console.log(`${f}: no per-line sheet for ${model}; left alone`); refused++; continue; }
  const names = readFileSync(`${dir}/${lineSheet}`, 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#')).slice(1).map((l) => l.split('\t')[0]);
  const grid = gridRowsFromNames(names);

  const text = readFileSync(`${dir}/${f}`, 'utf8');
  const lines = text.split(/\r?\n/);
  const byIndex = new Map();
  for (const l of lines) {
    if (!/^\d/.test(l)) continue;
    const [a, r, mm] = l.split('\t');
    if (!byIndex.has(a)) byIndex.set(a, []);
    byIndex.get(a).push({ row: r, mm });
  }
  const out = [];
  let ok = true;
  let here = 0;
  for (const [a, vals] of byIndex) {
    const labels = labelsForRow(vals.length, grid[Number(a) - 1]);
    if (!labels) { ok = false; console.log(`${f}: row ${a} has ${vals.length} values and the per-line sheet `
      + `${(grid[Number(a) - 1] || []).length} lines there; left alone`); break; }
    vals.forEach((v, i) => {
      if (v.row !== labels[i]) here++;
      out.push(`${a}\t${labels[i]}\t${v.mm}`);
    });
  }
  if (!ok) { refused++; continue; }
  if (!here) continue;
  changed++;
  moved += here;
  console.log(`${f}: ${here} of ${out.length} values in the wrong column (from ${lineSheet})`);
  if (write) {
    const head = lines.filter((l) => l.startsWith('#') && !/^# Rows relabelled|^#   importer had moved|^#   filed as a D line|^#   per-line table/.test(l));
    writeFileSync(`${dir}/${f}`, `${head.join('\n')}\n${NOTE}\nanchor\trow\ttotal_length_mm\n${out.join('\n')}\n`);
  }
}
console.log(`\n${changed} files with values in the wrong column, ${moved} values in all`
  + `${refused ? `; ${refused} left alone` : ''}${write ? '; rewritten' : ''}`);
