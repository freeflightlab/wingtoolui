/* reference-sweep.mjs — hold every wing in the database to the physics.
 *
 * The corpus sweep in the unit suite checks that each file *parses*. That is
 * not validation: a file can parse perfectly and describe an impossible wing,
 * and 74 of 103 reference files were reached by nothing stronger.
 *
 * This checks every line sheet against the invariants a real wing must
 * satisfy, whoever made it and whatever format it is in. Where a wing breaks
 * one, that is either a transcription error in the database or a fact about
 * the wing — and both are worth knowing.
 */
import { readFileSync, readdirSync } from 'fs';
import {
  parseLineTable, parseSimpleLineSheet, parseUpLineSheet, parseBgdLineTable,
  splitMultiSizeSheet, summarise,
} from '../src/core/lineplan.js';

const files = readdirSync('data/reference').filter((f) => f.endsWith('.tsv'));
const problems = [];
const checked = [];
const multiSize = [];
const collisions = [];

const read = (f, body) => {
  if (/^up-.*Components/.test(f)) return parseUpLineSheet(body).lines;
  if (/^bgd-/.test(f)) return parseBgdLineTable(body).lines;
  if (/^niviuk-.*-totals/.test(f) || f === 'niviuk-spec.tsv') return null;
  // An inspection record — reference, measured, delta — has no line names,
  // so the checks below, which are about the shape of a cascade, do not
  // apply to it.
  if (/-inspection/.test(f)) return null;
  // A fabric schedule lists materials by location; it has no lines at all.
  if (/fabric-schedule/.test(f)) return null;
  // A flight test report has no lines in it at all.
  if (/certification-flight-tests/.test(f)) return null;
  // A manufacturer specification table has no lines in it either.
  if (/published-specs/.test(f)) return null;
  if (/^niviuk-/.test(f) || /^up-split-/.test(f)) return parseSimpleLineSheet(body).lines;
  if (/materials|families|risers|min-strength/.test(f)) return null;
  const t = parseLineTable(body);
  return t.lines.length ? t.lines : null;
};

for (const f of files) {
  let lines;
  try {
    lines = read(f, readFileSync(`data/reference/${f}`, 'utf8'));
  } catch (e) {
    problems.push([f, 'threw', e.message.slice(0, 50)]);
    continue;
  }
  if (!lines || lines.length < 8) continue;
  checked.push(f);

  const withLen = lines.filter((l) => l.lengthMM > 0);
  if (withLen.length < 8) continue;

  // 1. Every length is physically possible. A paraglider line is between a
  //    few centimetres and about nine metres; anything outside is a decimal
  //    or a units error, which is exactly what a transcription gets wrong.
  // A totals sheet lists lengths from the sail to the harness, so its numbers
  // are whole-line lengths and a tandem's brake reaches past 9.5 m. The bound
  // is on single lines; totals get their own.
  // A multi-size sheet lists one column per size, so a single line name
  // carries several lengths. Read as one wing it mixes an L with an XS, which
  // is what produced "st1 appears twice" and "uppers longer than mains" on
  // the Makalu. It is a known format the readers do not yet split, recorded
  // rather than forced through the wrong one.
  const body = readFileSync(`data/reference/${f}`, 'utf8');
  const isMultiSize = /(?:\t[A-Z][A-Za-z0-9 ]+\s(?:XS|S|SM|M|ML|L|XL)\b){2,}/.test(
    body.split('\n')[0] || '');
  // A multi-size sheet is checked through its split, not skipped.
  //
  // `splitMultiSizeSheet` turns these into one sheet per size, so the source
  // file is now a container rather than an unreadable format. It is still not
  // checked directly — reading it as one wing mixes an L with an XS — but the
  // sizes inside it are.
  if (isMultiSize) {
    const split = splitMultiSizeSheet(body);
    multiSize.push(`${f} (${split.sizes.length} sizes split out`
      + `${split.missingSizes.length ? `, ${split.missingSizes.join(' ')} absent` : ''})`);
    continue;
  }

  // What the numbers measure, from the file's own key where it has one.
  //
  // Matching prose ("including risers") against a note that happened to say
  // "INCLUDE the risers" missed four sheets. A file that declares
  // `# measure:` is believed; the older files without one still fall back to
  // the filename.
  const declared = /^#\s*measure:\s*(\S+)/mi.exec(body);
  const isTotals = declared
    ? declared[1] === 'total-including-risers'
    : /total/i.test(f);
  const maxMM = isTotals ? 13000 : 9500;
  const bad = withLen.filter((l) => l.lengthMM < 40 || l.lengthMM > maxMM);
  if (bad.length) {
    problems.push([f, 'length outside any real line',
      bad.slice(0, 3).map((l) => `${l.name}=${l.lengthMM}`).join(' ')]);
  }

  // 2. Upper lines are shorter than mains. The cascade converges downward;
  //    a wing where they are not has its levels mislabelled.
  const mean = (lv) => {
    const v = withLen.filter((l) => l.level === lv).map((l) => l.lengthMM);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const up = mean('upper');
  const main = mean('main');
  // Cascade shape only applies to a sheet of individual lines. On a totals
  // sheet every value is a whole line from sail to harness, so an "upper"
  // total is naturally as long as a "main" one.
  if (!isTotals && up != null && main != null && up >= main) {
    problems.push([f, 'upper lines are not shorter than mains',
      `${up.toFixed(0)} against ${main.toFixed(0)} mm`]);
  }

  // 3. Row A is forward of row C, so on any wing with an arc the A lines are
  //    not the longest at a given cascade level.
  const byRow = {};
  for (const l of withLen.filter((l) => l.level === 'upper')) {
    (byRow[l.row] ||= []).push(l.lengthMM);
  }
  const rowMean = (r) => (byRow[r]
    ? byRow[r].reduce((a, b) => a + b, 0) / byRow[r].length : null);
  const a = rowMean('A');
  const c = rowMean('C');
  if (a != null && c != null && a > c * 1.6) {
    problems.push([f, 'A uppers implausibly longer than C',
      `${a.toFixed(0)} against ${c.toFixed(0)} mm`]);
  }

  // 4. Line names are unique. A duplicate means two rows of a table were
  //    read as one line, which is how a column-offset error shows up.
  // A duplicate name usually means two table rows were read as one line — a
  // column-offset error. On the Alpina 5 and Swift 6 it is real: Ozone list
  // `AM6` under two different material blocks, blue at 410 mm and orange at
  // 1000 mm. Two different lines, one name, in the manufacturer's own sheet.
  //
  // So a duplicate is reported as a fact about the source rather than a
  // failure, unless the same name repeats more than twice — which no real
  // naming collision does and a parsing error readily would.
  const names = withLen.map((l) => l.name);
  const counts = {};
  for (const n of names) counts[n] = (counts[n] || 0) + 1;
  const repeated = Object.entries(counts).filter(([, n]) => n > 1);
  const heavilyRepeated = repeated.filter(([, n]) => n > 2);
  if (heavilyRepeated.length) {
    problems.push([f, 'a name repeats more than twice — likely a column offset',
      heavilyRepeated.slice(0, 3).map(([n, c]) => `${n}x${c}`).join(' ')]);
  } else if (repeated.length) {
    collisions.push([f, repeated.map(([n]) => n).join(' ')]);
  }

  // 5. A wing has more upper lines than mains — that is what a cascade is.
  const nUp = withLen.filter((l) => l.level === 'upper').length;
  const nMain = withLen.filter((l) => l.level === 'main').length;
  if (nUp && nMain && nUp <= nMain) {
    problems.push([f, 'no cascade: as many mains as uppers', `${nUp}/${nMain}`]);
  }
}

console.log(`${checked.length} line sheets checked against the physics, `
  + `${problems.length} problems\n`);
if (multiSize.length) {
  console.log(`  ${multiSize.length} multi-size sheets, split into per-size `
    + 'sheets which are checked in their own right:');
  for (const f of multiSize.slice(0, 4)) console.log(`    ${f}`);
  console.log('');
}
if (collisions.length) {
  console.log(`  ${collisions.length} sheets carry a name the maker uses twice:`);
  for (const [f, n] of collisions) console.log(`    ${f.padEnd(24)} ${n}`);
  console.log('');
}
for (const [f, what, detail] of problems.slice(0, 20)) {
  console.log(`  ${f.padEnd(38)} ${what}  ${detail}`);
}
if (problems.length > 20) console.log(`  ... and ${problems.length - 20} more`);

process.exit(problems.length ? 1 : 0);
