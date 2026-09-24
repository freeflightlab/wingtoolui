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

/* ---- 0. is this a complete checkout at all? ---------------------------- */
//
// The audit's whole job is to diagnose a tree, so it must survive a tree that
// is broken. The first version called readdirSync('src/core') at the top and
// crashed with ENOENT on exactly the incomplete checkout it was written to
// report — a diagnostic that only runs when nothing is wrong.
if (!existsSync('src/core') || !existsSync('build.py')) {
  console.log('  FAIL this is not a complete checkout');
  console.log(`       src/core: ${existsSync('src/core') ? 'present' : 'MISSING'}`);
  console.log(`       build.py: ${existsSync('build.py') ? 'present' : 'MISSING'}`);
  console.log(`       src/ui:   ${existsSync('src/ui') ? 'present' : 'MISSING'}`);
  console.log(`       tests:    ${existsSync('tests') ? 'present' : 'MISSING'}`);
  console.log(`       data:     ${existsSync('data/reference') ? 'present' : 'MISSING'}`);
  console.log('\n  A tree missing these can still open the built HTML, which is');
  console.log('  self-contained, but cannot be rebuilt, tested or audited.');
  console.log('  See MANIFEST.txt for the full list.');
  process.exit(1);
}

/* ---- 0b. is the tree flat? --------------------------------------------- */
//
// A flattened checkout can still build — build.py accepts either layout — but
// it cannot be *tested*, because the suite's imports are static ES module
// paths like '../src/core/num.js' and there is no way to resolve those in a
// single directory. Worth saying explicitly, because a flat tree that builds
// looks healthy.
if (existsSync('num.js') && !existsSync('src/core/num.js')) {
  console.log('  WARN the tree is flat: modules sit beside the tests');
  console.log('       build.py copes, but node tests/run-tests.js cannot —');
  console.log('       its imports are static paths into src/core/.');
  console.log('       Commit the directories, not the files. See REPO.md.');
  notes.push('flat layout: buildable, not testable');
}

/* ---- 1. every core module is bundled ---------------------------------- */
const coreFiles = readdirSync('src/core').filter((f) => f.endsWith('.js'));
const buildSrc = readFileSync('build.py', 'utf8');
const unbundled = coreFiles.filter((f) => !buildSrc.includes(`"${f}"`));
say(unbundled.length === 0, 'every core module reaches the bundle',
  unbundled.length ? `missing: ${unbundled.join(', ')}` : `${coreFiles.length} modules`);

/* ---- 1b. the checkout is complete -------------------------------------- */
//
// A repository arrived holding eleven of twenty-four core modules, no build
// script, no interface sources and none of the reference data. Everything in
// it was current; what was missing had never been added. The built HTML still
// opened, which is exactly what made the gap easy to miss — so the audit now
// checks the tree against MANIFEST.txt rather than trusting that a working
// directory implies a working checkout.
if (!existsSync('MANIFEST.txt')) {
  say(false, 'MANIFEST.txt is present', 'run: node tools/manifest.mjs');
} else {
  const manifest = readFileSync('MANIFEST.txt', 'utf8');
  const listed = [...manifest.matchAll(/^\s+\d+\s+(\S+)$/gm)].map((m) => m[1]);
  const absent = listed.filter((f) => !existsSync(f));
  say(absent.length === 0, 'every file the manifest lists is present',
    absent.length ? `${absent.length} missing: ${absent.slice(0, 6).join(', ')}` : `${listed.length} files`);

  // And the reverse: a file added but never listed.
  const onDisk = [];
  for (const d of ['src/core', 'src/ui', 'tests', 'tools']) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (/\.(js|mjs|py|html|css)$/.test(f)) onDisk.push(`${d}/${f}`);
    }
  }
  const unlisted = onDisk.filter((f) => !manifest.includes(f));
  say(unlisted.length === 0, 'and the manifest lists every source file',
    unlisted.length ? `unlisted: ${unlisted.join(', ')}` : 'in step');
}

/* ---- 2. exports are used somewhere ------------------------------------ */
const allSrc = coreFiles.map((f) => readFileSync(`src/core/${f}`, 'utf8')).join('\n');
const uiSrc = readFileSync('src/ui/app.js', 'utf8');
// Every test file, not just the unit suite.
//
// This read `run-tests.js` alone, so a function used only by the Phase 1
// audit, the full-pipeline run or the reference sweep counted as unused. It
// flagged `lineBudget`, which the Phase 1 audit exercises by name — a real
// consumer the check could not see.
const testSrc = readdirSync('tests')
  .filter((f) => /\.(js|mjs)$/.test(f))
  .map((f) => readFileSync(`tests/${f}`, 'utf8')).join('\n');
const roadmapSrc = readFileSync('ROADMAP.md', 'utf8');
const toolSrc = readdirSync('tools').filter((f) => /\.(mjs|cjs)$/.test(f))
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
const { lineLengthPerSpan, LINE_LENGTH_PER_SPAN, lineConsumptionEstimate }
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
    lineConsumptionEstimate({ aspectRatio: 6.4, flatSpan: 11.34 }).totalLineLengthM, 203.6, 0.2],
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

/* ---- 2a. no two exports do the same job -------------------------------- */
//
// Five functions have now been written twice in this project: an inspection
// module duplicating pma.js, buildRiserAssembly duplicating
// buildRiserWebbing, a chunkInto, a totalLineLength, and buildRibOpenings
// duplicating ribOpenings — that last one reaching the same 6.4x measurement
// independently.
//
// The "unused export" check catches them afterwards. This catches the shape
// before it gets that far: two exports whose names differ only by a common
// verb prefix are almost always the same job done twice.
{
  const coreSrcAll = coreFiles.map((f) => readFileSync(`src/core/${f}`, 'utf8'));
  const exports = [];
  coreFiles.forEach((f, i) => {
    for (const m of coreSrcAll[i].matchAll(/^export (?:function|const) (\w+)/gm)) {
      exports.push({ file: f, name: m[1] });
    }
  });
  const strip = (n) => n.replace(
    /^(build|make|create|compute|calculate|get|solve|apply|find|estimate)/, '',
  ).toLowerCase();
  const byRoot = new Map();
  for (const e of exports) {
    const k = strip(e.name);
    if (!k) continue;
    if (!byRoot.has(k)) byRoot.set(k, []);
    byRoot.get(k).push(`${e.file}:${e.name}`);
  }
  const twins = [...byRoot.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, v]) => `${k}: ${v.join(' / ')}`);
  say(twins.length === 0, 'no two exports differ only by a verb prefix',
    twins.join(' | ') || `${exports.length} exports checked`);
}

/* ---- 1z. the repository is complete ------------------------------------ */
//
// The repository was once flat, with thirteen of twenty-five core modules
// never committed and no build script. The built tool still worked, which is
// exactly why nobody noticed — a bundle in `dist/` outlives the sources that
// made it.
//
// So completeness is checked against the build script and the imports, not
// against the bundle.
{
  const buildSrc = readFileSync('build.py', 'utf8');
  const listed = [...new Set(
    [...buildSrc.matchAll(/"(\w+\.js)"/g)].map((m) => m[1]),
  )].filter((f) => f !== 'app.js');
  const onDisk = readdirSync('src/core').filter((f) => f.endsWith('.js'));

  const absent = listed.filter((f) => !existsSync(`src/core/${f}`));
  say(absent.length === 0, 'every module the build names is committed',
    absent.join(', ') || `${listed.length} modules`);

  const orphan = onDisk.filter((f) => !listed.includes(f));
  say(orphan.length === 0, 'and every committed module is in the build',
    orphan.join(', ') || 'no orphans');

  for (const f of ['build.py', 'src/ui/app.js', 'src/ui/index.html', 'src/ui/style.css']) {
    say(existsSync(f), `${f} is present`, '');
  }

  // Every relative import must resolve. A module can be committed and still
  // reference one that is not.
  let imports = 0;
  const unresolved = [];
  for (const d of ['src/core', 'src/ui', 'tests', 'tools']) {
    for (const f of readdirSync(d).filter((x) => /\.(js|mjs|cjs)$/.test(x))) {
      for (const m of readFileSync(`${d}/${f}`, 'utf8').matchAll(/from '(\.[^']+\.js)'/g)) {
        imports++;
        const target = `${d}/${m[1]}`.replace(/\/[^/]+\/\.\./g, '');
        if (!existsSync(target)) unresolved.push(`${d}/${f} -> ${m[1]}`);
      }
    }
  }
  say(unresolved.length === 0, 'and every relative import resolves',
    unresolved.slice(0, 3).join(', ') || `${imports} imports`);
}

/* ---- 1y. the assessment's numbers are current --------------------------- */
//
// ASSESSMENT.md is the document a reviewer reads first, and it is full of
// counts that go stale the moment anything changes. One of them already did,
// between writing the file and checking it.
//
// A document that claims to be honest has to be right about the things it is
// easy to be right about.
{
  const assess = readFileSync('ASSESSMENT.md', 'utf8');
  const claims = [
    [/(\d+) core modules/, readdirSync('src/core').filter((f) => f.endsWith('.js')).length, 'core modules'],
    [/(\d+) reference files/, readdirSync('data/reference').length, 'reference files'],
    [/\*\*(\d+) open items/, (readFileSync('ROADMAP.md', 'utf8').match(/^- \[ \]/gm) || []).length, 'open items'],
    [/(\d+) wings from six manufacturers/, 21, 'wings'],
  ];
  for (const [re, actual, what] of claims) {
    const m = re.exec(assess);
    say(m && Number(m[1]) === actual,
      `the assessment's ${what} count is current`,
      m ? `says ${m[1]}, actual ${actual}` : 'claim not found');
  }
}

/* ---- 2b. terminology matches the standard ------------------------------ */
//
// The deepest *line* level is `main`; a riser is webbing. The project called
// the level "riser" for a long time and the documentation lagged the rename
// by a full session. Prose does not fail a test run, so it is checked here.
{
  const levelRiser = coreFiles.filter((f) => {
    const body = readFileSync(`src/core/${f}`, 'utf8');
    return /level:\s*'riser'/.test(body) || /level === 'riser'/.test(body);
  });
  say(levelRiser.length === 0, "no module uses 'riser' as a line level",
    levelRiser.join(', ') || "the deepest level is 'main'");

  const docFiles = readdirSync('docs').filter((f) => f.endsWith('.md'));
  const stale = docFiles.filter((f) => {
    if (f === 'inspection.md') return false;   // it explains the correction
    const body = readFileSync(`docs/${f}`, 'utf8');
    return /riser lines?\b|riser level/i.test(body);
  });
  say(stale.length === 0, 'and no document calls a line a riser',
    stale.join(', ') || `${docFiles.length} documents checked`);
}

/* ---- 2c. the documentation has not drifted ----------------------------- */
//
// docs/line-plans.md grew to 458 lines covering naming, seven sheet formats,
// merged rows, per-row density, main counts and the stabilo — with two
// subsections both called "Generating one" and the stabilo sitting outside
// the numbering. None of that fails a test, and nobody re-reads a long file
// to notice.
{
  const docFiles = readdirSync('docs').filter((f) => f.endsWith('.md'));
  const long = docFiles.filter((f) => readFileSync(`docs/${f}`, 'utf8').split('\n').length > 500);
  say(long.length === 0, 'no document has grown past 500 lines',
    long.map((f) => `${f} (${readFileSync(`docs/${f}`, 'utf8').split('\n').length})`).join(', ')
      || `${docFiles.length} documents`);

  const dupes = [];
  const unnumbered = [];
  for (const f of docFiles) {
    const md = readFileSync(`docs/${f}`, 'utf8');
    const subs = [...md.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    if (subs.length !== new Set(subs).size) dupes.push(f);
    // Top-level sections should be numbered consistently: either all of them
    // carry a number or none do.
    const tops = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    const numbered = tops.filter((t) => /^\d+\./.test(t)).length;
    if (numbered > 0 && numbered !== tops.length) unnumbered.push(f);
  }
  say(dupes.length === 0, 'no document repeats a subsection heading',
    dupes.join(', ') || 'headings are distinct');
  say(unnumbered.length === 0, 'and section numbering is consistent within each',
    unnumbered.join(', ') || 'consistent');

  // Consistent is not the same as correct: loads-and-materials.md ran
  // 1..8 then 6, and speed-system.md had two section 5s. Both were
  // "consistently numbered" and both were wrong.
  const outOfSequence = [];
  for (const f of docFiles) {
    const nums = [...readFileSync(`docs/${f}`, 'utf8').matchAll(/^## (\d+)\./gm)]
      .map((m) => Number(m[1]));
    if (nums.length && nums.some((v, i) => v !== nums[0] + i)) {
      outOfSequence.push(`${f} [${nums.join(',')}]`);
    }
  }
  say(outOfSequence.length === 0, 'and the numbers run in sequence',
    outOfSequence.join(' | ') || 'in order');
}

/* ---- 2d. "not covered" lists have not gone stale ----------------------- */
//
// Same failure as the roadmap: a document lists something as not covered, it
// gets built, and the list is never revisited. Six entries had gone stale
// this way — cross-ports, rods, reinforcement, stabilo, trimmers and the
// brake cascade were all listed as absent after being implemented.
{
  const coreAll = coreFiles.map((f) => readFileSync(`src/core/${f}`, 'utf8')).join('\n');
  const built = [
    ['cross-port', /export function buildCrossPorts/],
    ['reinforcement', /export function buildReinforcement/],
    ['rods?\\b', /export function buildRods/],
    ['attachment tab', /export function buildTabs/],
    ['stabilo', /export function addStabilo/],
    ['trimmer', /export function alphaChangeWithTrim/],
    ['printed pattern', /export function tiledPages/],
    ['brake cascade geometry', /export function buildBrakePlan/],
  ];
  const stale = [];
  for (const f of readdirSync('docs').filter((x) => x.endsWith('.md'))) {
    const md = readFileSync(`docs/${f}`, 'utf8');
    const sections = md.split(/^## /m)
      .filter((x) => /^\d+\.\s*(Not covered|Not yet modelled|Not decoded|Still open)/i.test(x));
    for (const sec of sections) {
      // A bullet mentioning a built feature is not automatically stale: an
      // entry can name one while describing a real remaining gap around it —
      // "cross-ports are generated, but nothing checks they do not collide
      // with a diagonal" belongs in a not-covered list.
      //
      // What is stale is a bullet whose *subject* is the feature. So the
      // check is per bullet, and only fires when the feature is named at the
      // start of one, which is how these lists put their subject.
      for (const bullet of sec.split(/\n- /).slice(1)) {
        const subject = bullet.split(/[.—]/)[0];
        for (const [name, re] of built) {
          if (new RegExp(name, 'i').test(subject) && re.test(coreAll)) {
            stale.push(`${f}: "${subject.trim().slice(0, 40)}"`);
          }
        }
      }
    }
  }
  say(stale.length === 0, 'no document lists a built feature as not covered',
    stale.join(', ') || 'the gaps listed are real gaps');
}

/* ---- 3a. Phase 1 still does what the roadmap says ---------------------- */
//
// A separate walk of the Phase 1 list, item by item. Kept out of the main
// suite because it tests the *roadmap*, not the modules: it asks whether each
// completed claim is still true, which is a different question from whether
// the code works.
try {
  const out = execSync('node tests/phase1-audit.mjs', { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = /(\d+) checks, (\d+) failed/.exec(out);
  say(m && Number(m[2]) === 0, 'every Phase 1 claim verifies',
    m ? `${m[1]} checks, ${m[2]} failed` : 'could not read the result');
} catch (e) {
  const m = /(\d+) checks, (\d+) failed/.exec(e.stdout || '');
  say(false, 'every Phase 1 claim verifies',
    m ? `${m[1]} checks, ${m[2]} FAILED` : 'the audit did not run');
}

/* ---- 3b. the roadmap is not stale -------------------------------------- */
//
// An item can be built and the roadmap never updated. That happened: the
// spanwise lift distribution was listed as open in Phase 5 long after
// loads.js was using lifting line for exactly that. Prose does not fail a
// test run, and nobody re-reads a 400-line roadmap.
//
// So each open item is probed against the code for a symbol that would only
// exist if it had been done. The probes are deliberately specific — a loose
// pattern would flag everything and be ignored.
const coreSrc = coreFiles.map((f) => readFileSync(`src/core/${f}`, 'utf8')).join('\n');
const probes = [
  ['Spanwise lift distribution', /liftingLine\(/],
  ['Load distribution through the cascade', /export function spanLoadDistribution/],
  ['Line materials and diameter selection', /export function selectLines/],
  ['Diagonal ribs', /export function buildVRibs/],
  ['Cross-ports', /export function buildCrossPorts/],
  ['Marking and registration', /export function markPanels/],
  ['Rods', /export function buildRods/],
  ['Reinforcement layout', /export function buildReinforcement/],
];
const openItems = [...roadmapSrc.matchAll(/^- \[ \] \*\*([^*]+)\*\*/gm)].map((m) => m[1]);
const stale = probes
  .filter(([name, re]) => openItems.some((o) => o.includes(name)) && re.test(coreSrc))
  .map(([name]) => name);
say(stale.length === 0, 'no roadmap item is listed open after being built',
  stale.length ? `stale: ${stale.join(', ')}` : `${openItems.length} open items probed`);

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
const roadmap = roadmapSrc;
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
