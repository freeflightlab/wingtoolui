/* check-units.mjs — a name that states its unit must be used in that unit.
 *
 * This project names values after their units: `lengthMM`, `chordM`,
 * `alphaDeg`, `tensionN`, `pressurePa`. That convention is only worth
 * anything if it is true, and nothing checked that it was.
 *
 * It exists because of a related failure. Three places interpolated along a
 * rib by array INDEX while their callers passed a CHORD fraction — the same
 * shape of mistake, a value used in a space it does not belong to, and it
 * survived for months because every part agreed with every other part.
 *
 * Two things are looked for:
 *
 *   - two named values combined with `+`, `-` or a comparison when their
 *     suffixes say different units
 *   - a degree value handed straight to a trig function
 *
 * It is deliberately narrow. A broad heuristic here would flag honest code,
 * and a detector with false positives teaches you to ignore it — the first
 * version of this one reported 25 mismatches, every one of them `MM` against
 * `MM` read as `MM` against `M`.
 */
import { readFileSync, readdirSync } from 'fs';

/** The unit a name claims, or null if it claims none. */
function unitOf(name) {
  const n = name.split('.').pop();
  if (/MM$/.test(n)) return 'mm';
  if (/M$/.test(n)) return 'm';
  if (/Deg$/.test(n)) return 'deg';
  if (/Rad$/.test(n)) return 'rad';
  if (/Pa$/.test(n)) return 'Pa';
  if (/DaN$/.test(n)) return 'daN';
  if (/N$/.test(n)) return 'N';
  if (/KmH$/i.test(n)) return 'km/h';
  if (/Kg$/.test(n)) return 'kg';
  return null;
}

// Units that are the same quantity and may legitimately be compared, because
// one is a count and the other a measure of the same thing.
const COMPATIBLE = new Set(['m|km/h', 'km/h|m']);

const problems = [];
let compared = 0;

for (const file of readdirSync('src/core').filter((f) => f.endsWith('.js'))) {
  const body = readFileSync(`src/core/${file}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  for (const m of body.matchAll(
    /\b([A-Za-z_][\w.]*?)\s*([-+]|[<>]=?|===)\s*([A-Za-z_][\w.]*)\b/g)) {
    const a = unitOf(m[1]);
    const b = unitOf(m[3]);
    if (!a || !b) continue;
    compared++;
    if (a === b || COMPATIBLE.has(`${a}|${b}`)) continue;
    problems.push([`${file}`, `${a} with ${b}`, m[0].trim().slice(0, 52)]);
  }

  // A degree value into trigonometry, unless it is converted on the spot.
  for (const m of body.matchAll(
    /Math\.(?:sin|cos|tan)\(\s*([\w.]*Deg)\b([^)]*)\)/g)) {
    const rest = m[2] || '';
    const converted = /Math\.PI\s*\/\s*180|\bRAD\b|toRadians|rad\(/.test(rest);
    if (!converted) {
      problems.push([file, 'degrees into trigonometry', m[0].slice(0, 52)]);
    }
  }
}

console.log(`${compared} unit-bearing comparisons across src/core`);
for (const [file, why, text] of problems) {
  console.log(`  ${file}\n    ${why}\n    ${text}`);
}
console.log(`\n${problems.length} values used outside the unit their name claims`);
process.exit(problems.length ? 1 : 0);
