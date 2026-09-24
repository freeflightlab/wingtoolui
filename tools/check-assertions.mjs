/* check-assertions.mjs — a check that cannot fail is worse than no check.
 *
 * It reports success. Three in this project could not fail and all three
 * passed for rounds:
 *
 *   - a button test against a stub DOM whose `querySelectorAll` returned `[]`
 *     unconditionally: "0 buttons pressed, none threw", reported as a pass
 *   - a settings probe comparing exported files by BYTE LENGTH, blind to a
 *     change from 378 to 382 in every row
 *   - a nesting check comparing a wing against itself, because the helper it
 *     called takes no arguments and silently ignored the one it was given
 *
 * None of those is findable by reading the output, because the output says
 * ok. This looks for the shapes instead.
 *
 * It is deliberately narrow. A broad heuristic here would flag honest
 * assertions, and a detector with false positives trains you to ignore it —
 * which is how the first version of this file behaved, matching `row` inside
 * `l.row` and reporting eight self-comparisons that were nothing of the sort.
 */
import { readFileSync, readdirSync } from 'fs';

const FILES = [
  ...readdirSync('tests').filter((f) => /\.(js|mjs)$/.test(f)).map((f) => `tests/${f}`),
  ...readdirSync('tools').filter((f) => /\.(mjs|cjs)$/.test(f)).map((f) => `tools/${f}`),
];

const problems = [];
let assertions = 0;

for (const file of FILES) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    const at = `${file}:${i + 1}`;
    // Comments first, or the file's own description of a pattern matches it.
    // This flagged its own comment explaining the `.length >= 0` rule, which
    // is the same mistake as a detector matching its own example.
    const line = raw.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (!line.trim()) return;

    if (/\b(check|say|ok)\s*\(/.test(line)) assertions++;

    // An assertion whose condition is a literal truth.
    if (/\b(check|say|ok)\s*\([^,]*,\s*(true|1)\s*[,)]/.test(line)) {
      problems.push([at, 'condition is literally true', raw.trim()]);
    }

    // A whole token compared with itself. Anchored on both sides: without the
    // leading boundary this matched `row` inside `l.row === row`, which is a
    // property against a variable and perfectly honest.
    const self = /(?:^|[^\w.])([A-Za-z_$][\w.[\]'$]*)\s*===\s*\1(?![\w.])/.exec(line);
    if (self) {
      problems.push([at, `compares ${self[1]} with itself`, raw.trim()]);
    }

    // `.length >= 0` and `>= 0` on a count are true for every array.
    if (/\.length\s*>=\s*0\b/.test(line)) {
      problems.push([at, 'a length is always >= 0', raw.trim()]);
    }
  });
}

console.log(`${assertions} assertions across ${FILES.length} files`);
if (problems.length) {
  console.log('');
  for (const [at, why, text] of problems) {
    console.log(`  ${at}\n    ${why}\n    ${text.slice(0, 74)}`);
  }
}
console.log(`\n${problems.length} assertions that cannot fail`);
process.exit(problems.length ? 1 : 0);
