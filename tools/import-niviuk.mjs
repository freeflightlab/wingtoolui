/* import-niviuk.mjs — turn Niviuk manuals into reference sheets.
 *
 * Niviuk publish, per size, both a per-line table (reference, material,
 * strength, colour, length) and a total-line-length table measured to the
 * harness. That is the pair `docs/collecting-reference-data.md` asks for, and
 * it is the first source in this project to give both for the same wing.
 *
 *   node tools/import-niviuk.mjs <manual.pdf> <family> > data/reference/x.tsv
 *
 * Text is taken from `pdftotext -layout`. The layout matters: the tables are
 * printed in side-by-side columns, so a naive read interleaves three sizes.
 */
import { execFileSync } from 'child_process';

const [pdf, family] = process.argv.slice(2);
if (!pdf || !family) {
  console.error('usage: import-niviuk.mjs <manual.pdf> <family name>');
  process.exit(1);
}

const text = execFileSync('pdftotext', ['-layout', pdf, '-'], {
  encoding: 'utf8', maxBuffer: 1 << 26,
});

/* Per-line rows: reference, material, strength, colour, length. A row may
 * carry several rows of the table side by side, so it is scanned for every
 * match rather than split on whitespace. */
const LINE_RE = /\b([a-z]{1,2}\d{1,2}|[A-Z]{1,3}\d{1,2}|\d[A-Z]{1,3}\d?)\s+([A-Za-z0-9/]+)\s+(\d{2,3})\s+([A-Z]{2,8})\s+([\d.]+)/g;

const lines = [];
const seen = new Set();
for (const m of text.matchAll(LINE_RE)) {
  const [, ref, mat, kg, colour, len] = m;
  if (seen.has(ref)) continue;          // first occurrence is the smallest size
  seen.add(ref);
  lines.push({
    name: ref,
    material: `${mat}-${kg}`,
    colour,
    // Niviuk print thousands with a dot: 1.744 is 1744 mm.
    lengthMM: Math.round(Number(len.replace('.', '')) >= 100
      ? Number(len.replace('.', '')) : Number(len)),
  });
}

const out = [];
out.push(`# ${family} — suspension lines`);
out.push(`# Source: Niviuk user manual, section 10.6 "Line measurements by size"`);
out.push('# Lengths: single line lengths, EXCLUDING risers');
out.push('# Retrieved: 2026-08-31');
out.push('name\tlength_mm\tmaterial\tcolour');
for (const l of lines) {
  out.push(`${l.name}\t${l.lengthMM}\t${l.material}\t${l.colour}`);
}
console.log(out.join('\n'));
console.error(`${lines.length} lines extracted for ${family}`);
