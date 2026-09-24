/* doctor.mjs — is this checkout complete and usable?
 *
 * A first user cloned the repository and `npm run build` failed with seven
 * core modules missing. Nothing was wrong with their machine: they had a tree
 * still holding the old flat layout, in which those files had never been
 * committed.
 *
 * The build told them what was absent. It could not tell them whether
 * anything else was, because it only looks at what it needs to build. This
 * checks the whole tree before they spend time on it, and it is the first
 * thing to run when something looks wrong.
 *
 *     npm run doctor
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';

const problems = [];
const warnings = [];
const notes = [];

/* ---- layout ------------------------------------------------------------ */
const nested = existsSync('src/core') && existsSync('src/ui');
const flatSigns = ['planform.js', 'aero.js', 'loads.js']
  .filter((f) => existsSync(f)).length;

if (!nested && flatSigns) {
  problems.push('This tree is the OLD FLAT LAYOUT — source files at the top '
    + 'level rather than under src/core. Several modules were never committed '
    + 'to it. Replace the whole tree with a current release; it cannot be '
    + 'repaired by adding files. This is what GitHub\'s web uploader produces '
    + 'when files are dragged in one at a time: see PUBLISHING.md for how to '
    + 'push the tree so its folders survive.');
} else if (!nested) {
  problems.push('No src/core or src/ui: this does not look like the project '
    + 'at all. Check you are in the right directory.');
}

/* ---- everything the manifest promises ---------------------------------- */
if (!existsSync('MANIFEST.txt')) {
  // A warning, not a problem.
  //
  // The manifest is how completeness is CHECKED; it is not something the
  // build needs. Treating it as a problem made the doctor announce "this tree
  // will not build" about a tree that builds perfectly — which is the
  // cry-wolf failure this tool exists to avoid, committed by the tool itself.
  warnings.push('No MANIFEST.txt, so completeness cannot be verified. The '
    + 'tree may still build; run `npm run manifest` to regenerate it.');
} else {
  // The format is `<size>  <path>`, with prose headings between sections.
  //
  // Splitting every non-comment line on whitespace read the headings as
  // filenames and reported 136 of 143 files absent on a complete tree — a
  // diagnostic that cries wolf is worse than none, because the next person
  // to see it will assume it is wrong again.
  const listed = readFileSync('MANIFEST.txt', 'utf8').split(/\r?\n/)
    .map((l) => /^\s*\d+\s+(\S.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1].trim())
    // The trailing summary line reads `223 files, 2032 KB`, which matches the
    // size-then-text shape as surely as a real entry does. A path has an
    // extension and no spaces.
    .filter((f) => /\.[a-z0-9]+$/i.test(f) && !/\s/.test(f));
  const absent = listed.filter((f) => !existsSync(f));
  if (absent.length) {
    problems.push(`${absent.length} of ${listed.length} files in MANIFEST.txt `
      + `are absent, starting with: ${absent.slice(0, 5).join(', ')}`);
  } else {
    notes.push(`all ${listed.length} files in MANIFEST.txt are present`);
  }
}

/* ---- the build's own dependency list ----------------------------------- */
if (existsSync('build.py')) {
  const src = readFileSync('build.py', 'utf8');
  const mods = [...new Set([...src.matchAll(/"(\w+\.js)"/g)]
    .map((m) => m[1]))].filter((m) => m !== 'app.js');
  const absent = mods.filter((m) => !existsSync(`src/core/${m}`));
  if (absent.length) {
    problems.push(`${absent.length} core modules the build needs are absent: `
      + absent.join(', '));
  } else {
    notes.push(`all ${mods.length} core modules are present`);
  }
} else {
  problems.push('No build.py, so nothing can be built.');
}

/* ---- reference data ---------------------------------------------------- */
if (!existsSync('data/reference')) {
  problems.push('No data/reference: the test suite cannot run and the '
    + 'validation claims cannot be checked.');
} else {
  const n = readdirSync('data/reference').length;
  if (n < 50) {
    problems.push(`data/reference holds only ${n} files; a complete checkout `
      + 'has well over a hundred.');
  } else {
    notes.push(`${n} reference files`);
  }
}

/* ---- an empty file is worse than an absent one ------------------------- */
if (existsSync('src/core')) {
  const empty = readdirSync('src/core')
    .filter((f) => f.endsWith('.js') && statSync(`src/core/${f}`).size < 200);
  if (empty.length) {
    problems.push(`${empty.length} core modules are empty or near-empty, `
      + `which a file-count check would miss: ${empty.join(', ')}`);
  }
}

/* ---- what a person needs installed ------------------------------------- */
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  problems.push(`Node ${process.versions.node}; this project needs 18 or later.`);
} else {
  notes.push(`Node ${process.versions.node}`);
}

/* ---- report ------------------------------------------------------------ */
console.log('Checking this tree...\n');
for (const n of notes) console.log(`  ok   ${n}`);
for (const w of warnings) {
  console.log('');
  console.log('  NOTE');
  for (const line of w.match(/.{1,68}(\s|$)/g) ?? [w]) {
    console.log(`    ${line.trim()}`);
  }
}
if (problems.length) {
  console.log('');
  for (const p of problems) {
    console.log('  PROBLEM');
    for (const line of p.match(/.{1,68}(\s|$)/g) ?? [p]) {
      console.log(`    ${line.trim()}`);
    }
    console.log('');
  }
  console.log(`${problems.length} problem(s). This tree will not build.`);
} else if (warnings.length) {
  console.log('\nNothing is missing that would stop a build.');
} else {
  console.log('\nThis checkout is complete. Next: npm run build && npm run check');
}
process.exit(problems.length ? 1 : 0);
