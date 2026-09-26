/* check-references.mjs — every name quoted in prose exists in the code.
 *
 * When a function is renamed, the code that calls it breaks and a test says
 * so. The comments and documents that mention it do not break. They go on
 * naming something that is no longer there, and a reader following one finds
 * nothing.
 *
 * `estimateTotalLineLength` was renamed `lineConsumptionEstimate` and still
 * appeared in a comment in lineplan.js and in docs/scaling.md. Checking the
 * repository on GitHub against the current tree turned it up, and with it
 * four more: `buildRiserAssembly` in docs/inspection.md, a comment naming
 * `inwardSign` where the parameter is `sign`, and one naming `upperCut` and
 * `lowerCut` where the fields are `upperCutM` and `lowerCutM`.
 *
 * A backticked camelCase name is taken to be a claim that the name exists.
 * It counts as existing if it appears anywhere in code — as a declaration, a
 * parameter, an option key or a property — with comments stripped first, so a
 * comment cannot vouch for itself.
 */
import { readFileSync, readdirSync } from 'fs';

const read = (p) => readFileSync(p, 'utf8');
const list = (d, re) => readdirSync(d).filter((f) => re.test(f)).map((f) => `${d}/${f}`);

// Not this file. Its own list of retired names is a set of string literals,
// and scanning it reported every retired name as having come back — on a
// clean tree. The same mistake check-assertions made matching its own
// comment: a checker that reads itself finds its own examples.
const SELF = 'tools/check-references.mjs';
const codeFiles = [
  ...list('src/core', /\.js$/), 'src/ui/app.js',
  ...list('tests', /\.(js|mjs)$/), ...list('tools', /\.(mjs|cjs|py)$/),
].filter((f) => f !== SELF);
const code = codeFiles.map(read).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/^\s*#.*$/gm, '');

// Names that are not code at all: wing and project names written in
// camelCase because that is how their authors write them.
const NOT_CODE = new Set([
  'gnuLAB2',    // Laboratori d'envol's own design program
  'paraFEM',    // a separate OpenGlider project, named in docs/openglider.md
  'parabem',    // likewise
]);

// Names that WERE code and were deliberately removed. Documents may mention
// them — CONTRIBUTING.md records that `buildRiserAssembly` duplicated
// `buildRiserWebbing` and was deleted, and that history is the point of the
// sentence.
//
// This list is not a way to silence the check. A retired name is asserted to
// be ABSENT from the code, so the allowance is itself a test: if a retired
// name comes back, this fails.
//
// It exists because I got it wrong without one. Correcting dangling names, I
// ran a replace-all on `buildRiserAssembly` across docs/inspection.md, and
// turned "buildRiserWebbing, which I reimplemented as buildRiserAssembly"
// into "reimplemented as buildRiserWebbing" — a function reimplemented as
// itself. The same name meant the current function on one line and the
// removed duplicate two lines later, and a blind replace cannot tell.
const RETIRED = new Map([
  ['buildRiserAssembly', 'a duplicate of buildRiserWebbing, removed'],
  ['reconcileRibOpenings', 'a duplicate of ribOpenings, removed'],
  ['estimateTotalLineLength', 'renamed lineConsumptionEstimate'],
  ['applyDesignToLep', 'renamed writeDesignIntoLep'],
]);

const prose = [
  ...list('src/core', /\.js$/), 'src/ui/app.js',
  ...list('docs', /\.md$/), 'README.md', 'ASSESSMENT.md', 'ROADMAP.md',
  'CONTRIBUTING.md', 'REPO.md',
];

const dangling = {};
let quoted = 0;
for (const file of prose) {
  for (const m of read(file).matchAll(/`([a-z][a-zA-Z0-9]{5,})`/g)) {
    const id = m[1];
    if (!/[a-z][A-Z]/.test(id) || NOT_CODE.has(id) || RETIRED.has(id)) continue;
    quoted++;
    if (new RegExp(`\\b${id}\\b`).test(code)) continue;
    (dangling[id] ||= new Set()).add(file);
  }
}

// A retired name must stay retired.
const resurrected = [...RETIRED.keys()]
  .filter((id) => new RegExp(`\\b${id}\\b`).test(code));

const ids = Object.keys(dangling).sort();
console.log(`${quoted} code names quoted in comments and documents`);
for (const id of ids) {
  console.log(`  ${id.padEnd(28)} ${[...dangling[id]].join(', ')}`);
}
console.log(`\n${RETIRED.size} retired names, each confirmed absent from the code`);
for (const id of resurrected) {
  console.log(`  FAIL ${id} is retired (${RETIRED.get(id)}) but is back in the code`);
}
console.log(`\n${ids.length + resurrected.length} names that point at nothing in the code`);
process.exit(ids.length + resurrected.length ? 1 : 0);
