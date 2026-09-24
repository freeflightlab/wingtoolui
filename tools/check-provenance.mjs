/* check-provenance.mjs — every material figure says where it came from.
 *
 * A design tool that outputs "the seam is the limit, not the cloth" is making
 * a claim about real fabric. An expert reading that is entitled to know
 * whether the numbers behind it came from a manufacturer's datasheet, from a
 * published standard, or from the author's judgement.
 *
 * Several tables here are the last of those. Estimating is not the problem —
 * some of it is unavoidable, and the conclusions in question survive any
 * plausible value. Presenting an estimate as though it were a measurement is
 * the problem, and it is the kind of thing that costs a tool its credibility
 * the first time somebody checks.
 *
 * So every exported table of material properties must carry a `provenance`,
 * and anything estimated must say so in a word a reader will notice.
 */
import { readFileSync, readdirSync } from 'fs';

const MATERIAL_TABLES = [
  ['ribstress', 'RIB_CLOTH'],
  ['ribstress', 'SAIL_CLOTH'],
  ['reinforcement', 'ROD_MATERIALS'],
  ['risers', 'RISER_HARDWARE'],
  ['pma', 'PMA_STRENGTH'],
  ['trimdrift', 'FIBRE_BEHAVIOUR'],
  ['fabric', 'CLOTH'],
];

const problems = [];
const rows = [];

for (const [mod, name] of MATERIAL_TABLES) {
  const m = await import(`../src/core/${mod}.js`);
  const table = m[name];
  if (!table) { problems.push(`${mod}.${name} does not exist`); continue; }

  const prov = table.provenance;
  if (!prov) {
    problems.push(`${mod}.${name} declares no provenance`);
    continue;
  }

  // Provenance must not be enumerable: a table carrying its source as an
  // ordinary key becomes a table with a material called "provenance", and the
  // first thing that iterates it breaks.
  if (Object.keys(table).includes('provenance')) {
    problems.push(`${mod}.${name} exposes provenance as data`);
  }

  const text = typeof prov === 'string' ? prov : Object.values(prov).join(' ');
  const estimated = /ESTIMATED/.test(text);
  rows.push([`${mod}.${name}`, Object.keys(table).length, estimated, text]);
}

console.log(`${rows.length} material tables checked\n`);
for (const [name, count, estimated, text] of rows) {
  console.log(`  ${name.padEnd(28)}${String(count).padStart(3)} entries  `
    + `${estimated ? 'ESTIMATED' : 'sourced  '}  ${text.slice(0, 52)}`);
}

const estimated = rows.filter((r) => r[2]).length;
console.log(`\n${estimated} of ${rows.length} are this project's own estimates, `
  + 'and say so');

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  FAIL ${p}`);
}
console.log(`\n${problems.length} tables without honest provenance`);
process.exit(problems.length ? 1 : 0);
