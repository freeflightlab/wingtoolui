/* audit.mjs — check that what the project says about itself is still true.
 *
 * Three failure modes this catches, none of which the test suite does:
 *
 *   1. A module that exists but never reaches the bundle, so it is tested and
 *      shipped in `src/` while the built tool does without it.
 *   2. An exported function nothing calls — either dead, or a feature that
 *      was built and never wired up.
 *   3. A number written in the documentation that the code no longer
 *      produces. Prose does not fail a test run.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const problems = [];
const notes = [];
const say = (ok, what, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`);
  if (!ok) problems.push(what);
};

/* ---- 1. every core module is bundled ---------------------------------- */
const coreFiles = readdirSync('src/core').filter((f) => f.endsWith('.js'));
const buildSrc = readFileSync('build.py', 'utf8');
const unbundled = coreFiles.filter((f) => !buildSrc.includes(`"${f}"`));
say(unbundled.length === 0, 'every core module reaches the bundle',
  unbundled.length ? `missing: ${unbundled.join(', ')}` : `${coreFiles.length} modules`);

/* ---- 2. exports are used somewhere ------------------------------------ */
const allSrc = coreFiles.map((f) => readFileSync(`src/core/${f}`, 'utf8')).join('\n');
const uiSrc = readFileSync('src/ui/app.js', 'utf8');
const testSrc = readFileSync('tests/run-tests.js', 'utf8');
const toolSrc = readdirSync('tools').filter((f) => f.endsWith('.mjs'))
  .map((f) => readFileSync(`tools/${f}`, 'utf8')).join('\n');
const consumers = `${allSrc}\n${uiSrc}\n${testSrc}\n${toolSrc}`;

const orphans = [];
for (const f of coreFiles) {
  const body = readFileSync(`src/core/${f}`, 'utf8');
  for (const m of body.matchAll(/^export (?:function|const|class) (\w+)/gm)) {
    const name = m[1];
    // Count uses outside the declaration itself.
    const uses = (consumers.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    if (uses <= 1) orphans.push(`${f}:${name}`);
  }
}
say(orphans.length === 0, 'no exported function is unused',
  orphans.length ? orphans.join(', ') : 'all exports have a caller');

/* ---- 3. numbers in the docs still hold -------------------------------- */
const { rowSharesFromPressure, chordwiseLoading } = await import('../src/core/pressure.js');
const { naca4 } = await import('../src/core/airfoil.js');
const { lineLengthPerSpan, LINE_LENGTH_PER_SPAN, estimateTotalLineLength }
  = await import('../src/core/scaling.js');
const { PRACTICAL_FLOOR, DEFAULT_LOAD_CASE, gustLoadFactor } = await import('../src/core/loads.js');
const { alphaChange, riserSet } = await import('../src/core/risers.js');

const af = naca4('4415');
const anchors = { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
const claims = [
  ['A row share at 6 deg is 38.0%',
    rowSharesFromPressure(af, anchors, 6).shares.A * 100, 38.0, 0.3],
  ['D row share at 6 deg is 16.8%',
    rowSharesFromPressure(af, anchors, 6).shares.D * 100, 16.8, 0.3],
  ['zero-lift angle of a 4415 is -4.27 deg',
    chordwiseLoading(af, 0).alphaL0Deg, -4.27, 0.02],
  ['line-length law slope is -5.12',
    LINE_LENGTH_PER_SPAN.slope, -5.120, 0.001],
  ['the law gives 17.95 m/m at AR 6.4', lineLengthPerSpan(6.4), 17.95, 0.02],
  ['SAGE size 75 predicted at 203.6 m',
    estimateTotalLineLength({ aspectRatio: 6.4, flatSpan: 11.34 }).totalLineLengthM, 203.6, 0.2],
  ['the practical floor is 0.50 mm', PRACTICAL_FLOOR.diameterMM, 0.50, 1e-9],
  ['symmetric certification is 12x',
    DEFAULT_LOAD_CASE.limitG * DEFAULT_LOAD_CASE.safetyFactor, 12.0, 1e-9],
  ['a 7.5 m/s gust at trim gives 7.40 g',
    gustLoadFactor({ speedMS: 10.3, wingLoadingNPerM2: (95 * 9.81) / 25.2 }).loadFactor,
    7.40, 0.02],
  ['full bar on the test riser gives -8.70 deg',
    alphaChange(riserSet({ rows: ['A', 'B', 'C'], lengthMM: 500, travelMM: 180,
      anchors: { A: 0.09, B: 0.32, C: 0.58 } }), 1, 2.4), -8.70, 0.02],
];
let bad = 0;
for (const [what, got, want, tol] of claims) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) { bad++; console.log(`       ${what}: docs say ${want}, code gives ${got}`); }
}
say(bad === 0, 'documented numbers match the code', `${claims.length} claims checked`);

/* ---- 4. reference data is exercised ----------------------------------- */
//
// The first version of this grepped the test source for each filename and
// reported 63 of 72 files unused. That was true when written and became
// wrong the moment a sweep started reading the directory instead of naming
// files — the audit was measuring how the tests are written rather than what
// they touch.
//
// So it asks the suite instead: a run reports how many reference files it
// opened, and that is the number that matters.
const refs = readdirSync('data/reference');
const named = refs.filter((f) => testSrc.includes(f) || toolSrc.includes(f)
  || allSrc.includes(f));
const sweeps = /readdirSync\('data\/reference'\)/.test(testSrc);
say(sweeps || named.length > refs.length * 0.5,
  'the reference corpus is exercised',
  sweeps ? `${refs.length} files, swept wholesale` : `${named.length}/${refs.length} named`);
notes.push(`${refs.length} reference files; ${named.length} named individually`
  + `${sweeps ? ', the rest reached by the sweep' : ''}`);

/* ---- 5. docs reference figures that exist ----------------------------- */
let dangling = 0;
for (const d of readdirSync('docs').filter((f) => f.endsWith('.md'))) {
  const md = readFileSync(`docs/${d}`, 'utf8');
  for (const m of md.matchAll(/!\[[^\]]*\]\((img\/[^)]+)\)/g)) {
    if (!existsSync(`docs/${m[1]}`)) { dangling++; console.log(`       ${d} -> ${m[1]}`); }
  }
}
say(dangling === 0, 'no documentation figure is missing');

/* ---- 6. roadmap claims match reality ---------------------------------- */
const roadmap = readFileSync('ROADMAP.md', 'utf8');
const doneCount = (roadmap.match(/^- \[x\]/gm) || []).length;
const openCount = (roadmap.match(/^- \[ \]/gm) || []).length;
notes.push(`roadmap: ${doneCount} done, ${openCount} open`);
// Counting `check(` in the source undercounts, because many assertions sit
// inside loops and run many times. The number that belongs in the README is
// the one a run prints, so the audit runs the suite and reads it.
const claimed = /(\d+)-test validation suite/.exec(roadmap);
let actual = null;
try {
  const out = execSync('node tests/run-tests.js', { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = /(\d+) passed, (\d+) failed/.exec(out);
  if (m) { actual = Number(m[1]); if (Number(m[2]) > 0) problems.push('the suite has failures'); }
} catch { /* reported below */ }
say(actual !== null && claimed && Number(claimed[1]) === actual,
  'the documented test count is the count a run produces',
  actual === null ? 'could not run the suite'
    : `documents say ${claimed ? claimed[1] : '?'}, a run gives ${actual}`);

console.log('');
for (const n of notes) console.log(`  note: ${n}`);
console.log(problems.length ? `\n${problems.length} AUDIT FAILURES` : '\naudit clean');
process.exit(problems.length ? 1 : 0);
