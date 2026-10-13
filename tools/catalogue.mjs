/* catalogue.mjs — inventory the reference database.
 *
 * Writes data/reference/CATALOGUE.md: every wing, what data it carries, and
 * what is missing. Generated rather than maintained, so it cannot drift from
 * the files it describes.
 *
 * Run with:  node tools/catalogue.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { parseLineTable, summarise, parseUpLineSheet, parseBgdLineTable,
  parsePhiLineSheet, parseSimpleLineSheet } from '../src/core/lineplan.js';
import { parseSizeFamilies } from '../src/core/scaling.js';
import { parseMaterialsTable } from '../src/core/loads.js';

const files = readdirSync('data/reference').filter((f) => f.endsWith('.tsv')).sort();
const wings = new Map();
const other = [];

const note = (key, patch) => {
  const w = wings.get(key) || { key, sizes: [], formats: new Set() };
  Object.assign(w, patch, { sizes: w.sizes, formats: w.formats });
  wings.set(key, w);
  return w;
};

for (const f of files) {
  const body = readFileSync(`data/reference/${f}`, 'utf8');
  const base = f.replace(/\.tsv$/, '');

  try {
    // Data rows of a plain table: not blank, not a comment, not the header.
    const dataRows = () => body.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length - 1;
    if (f === 'line-materials.tsv') {
      other.push({ f, kind: 'materials table', detail: `${parseMaterialsTable(body).length} line references` });
    } else if (f === 'line-materials-suppliers.tsv') {
      // The suppliers' own sheets: what each line family is made of, and the
      // sizes whose weight, strength and stretch they publish.
      const kinds = {};
      for (const l of body.split('\n')) {
        const k = /^(family|size|bending)\t/.exec(l);
        if (k) kinds[k[1]] = (kinds[k[1]] || 0) + 1;
      }
      other.push({ f, kind: 'line suppliers\' data', detail:
        `${kinds.family ?? 0} line families, ${kinds.size ?? 0} sizes, ${kinds.bending ?? 0} bending tests` });
    } else if (f === 'published-specs.tsv') {
      other.push({ f, kind: 'makers\' specifications', detail: `${dataRows()} sizes, to check size-families.tsv against` });
    } else if (f === 'published-cells.tsv') {
      other.push({ f, kind: 'cell counts', detail: `${dataRows()} designs with line sheets here` });
    } else if (/-inspection\.tsv$/.test(f)) {
      // Reference, measured and delta for one specimen: not a cut list.
      other.push({ f, kind: 'inspection record', detail: `${dataRows()} attachment points` });
    } else if (/^niviuk-.*-totals\.tsv$/.test(f)) {
      // Sail-to-harness totals from the user manual, one row an attachment
      // point. The line sheet reader is for single lines, so it is not used.
      other.push({ f, kind: 'total line lengths', detail: `${dataRows()} attachment points, from the user manual` });
    } else if (f === 'certification-flight-tests.tsv') {
      other.push({ f, kind: 'certification test reports', detail: `${dataRows()} rows, the measured figures in EN 926-2 reports` });
    } else if (/fabric-schedule/.test(f)) {
      // Routed before the `niviuk-` branch takes it for a line sheet.
      other.push({ f, kind: 'fabric schedule', detail: `${dataRows()} locations` });
    } else if (/joncs/.test(f)) {
      other.push({ f, kind: 'rods', detail: `${dataRows()} rows, as the design's own program computes them` });
    } else if (/^lep-/.test(f)) {
      other.push({ f, kind: 'LEparagliding lines', detail: `${dataRows()} lines, from lines.txt` });
    } else if (f === 'size-families.tsv') {
      const fams = parseSizeFamilies(body);
      const n = Object.values(fams).reduce((a, v) => a + v.length, 0);
      other.push({ f, kind: 'size families', detail: `${Object.keys(fams).length} families, ${n} sizes` });
    } else if (/risers/.test(f)) {
      other.push({ f, kind: 'riser geometry', detail: `${body.trim().split('\n').length - 1} rows` });
    } else if (/min-strength/.test(f)) {
      other.push({ f, kind: 'PMA strength table', detail: 'minimum breaking strength per size' });
    } else if (f.startsWith('up-')) {
      const sheet = parseUpLineSheet(body);
      const m = /^up-([a-z0-9]+)-/.exec(f);
      const w = note(`UP ${m ? m[1] : base}`, { maker: 'UP Paragliders' });
      w.formats.add(sheet.layout);
      if (sheet.layout === 'components') {
        w.sizes.push(base);
        w.lines = Math.max(w.lines || 0, sheet.lines.length);
        w.hasMaterials = true;
        w.hasLoopAllowance = sheet.lines.some((l) => l.loopMM != null);
      }
    } else if (f.startsWith('bgd-')) {
      const t = parseBgdLineTable(body);
      const w = note(`BGD ${base.replace(/^bgd-/, '').replace(/-.*$/, '')}`, { maker: 'BGD' });
      w.sizes.push(base);
      w.lines = t.lines.length;
      w.formats.add('bgd explicit cascade');
      w.hasTopology = true;
    } else if (f.startsWith('phi-')) {
      const sheet = parsePhiLineSheet(body);
      const w = note('PHI Allegro X-alps', { maker: 'PHI' });
      w.sizes.push(base);
      w.formats.add('phi sheet');
      w.lines = sheet.lines ? sheet.lines.length : null;
    } else if (f.startsWith('niviuk-')) {
      // Niviuk sheets use the plain collected format, not a maker's
      // spreadsheet layout. The catalogue fell through to parseLineTable and
      // reported them as "not a line sheet", so a whole manufacturer was
      // absent from the inventory of the database it inventories.
      if (f === 'niviuk-spec.tsv') {
        const fams = parseSizeFamilies(body);
        const n = Object.values(fams).reduce((a, v) => a + v.length, 0);
        other.push({ f, kind: 'size families', detail: `${Object.keys(fams).length} families, ${n} sizes` });
      } else {
        const sheet = parseSimpleLineSheet(body);
        const m = /^niviuk-([a-z0-9]+)-/.exec(f);
        const w = note(`Niviuk ${m ? m[1] : base}`, { maker: 'Niviuk' });
        w.sizes.push(base);
        w.lines = sheet.lines.length;
        w.rows = [...new Set(sheet.lines.map((l) => l.row))].sort().join('');
        w.formats.add('collected sheet');
      }
    } else {
      const t = parseLineTable(body);
      if (!t.lines.length) { other.push({ f, kind: 'not a line sheet', detail: '' }); continue; }
      const q = summarise(t);
      const fam = base.replace(/-[^-]+$/, '');
      const w = note(fam, { maker: 'Ozone' });
      w.sizes.push(base.replace(`${fam}-`, ''));
      w.lines = t.lines.length;
      w.rows = q.anchorRows.join('');
      w.risers = q.riserRows.join('');
      w.formats.add('ozone cut list');
    }
  } catch (e) {
    other.push({ f, kind: 'FAILED TO PARSE', detail: e.message.slice(0, 60) });
  }
}

const out = [];
out.push('# Reference database');
out.push('');
out.push('Generated by `node tools/catalogue.mjs`. Do not edit by hand.');
out.push('');
out.push(`**${wings.size} wings across ${new Set([...wings.values()].map((w) => w.maker)).size} manufacturers,`
  + ` ${[...wings.values()].reduce((a, w) => a + w.sizes.length, 0)} size sheets,`
  + ` ${files.length} files.**`);
out.push('');
out.push('| wing | maker | sizes | lines/side | rows | risers | format |');
out.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const w of [...wings.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  out.push(`| ${w.key} | ${w.maker} | ${w.sizes.length} | ${w.lines ?? '—'} | `
    + `${w.rows ?? '—'} | ${w.risers ?? '—'} | ${[...w.formats].join(', ')} |`);
}
out.push('');
out.push('## Supporting tables');
out.push('');
out.push('| file | kind | detail |');
out.push('| --- | --- | --- |');
for (const o of other.sort((a, b) => a.f.localeCompare(b.f))) {
  out.push(`| \`${o.f}\` | ${o.kind} | ${o.detail} |`);
}

writeFileSync('data/reference/CATALOGUE.md', `${out.join('\n')}\n`);
console.log(`CATALOGUE.md: ${wings.size} wings, ${files.length} files`);
