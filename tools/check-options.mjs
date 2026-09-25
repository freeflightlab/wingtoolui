/* check-options.mjs — options passed that a function never reads.
 *
 * Three defects in this project came from the same shape: a call that looks
 * right, runs clean, and does nothing.
 *
 *   thinAirfoil(af, 6)            meant six samples, read as six degrees
 *   demoWing({ cells: 40 })       the helper takes no arguments
 *   buildVRibs({ spread: 0.4 })   the option is `baseSpread`
 *
 * JavaScript accepts and silently drops an unknown key, so the caller gets a
 * plausible result computed from defaults. The last one made four different
 * widths produce the same diagonal, and the model looked insensitive to the
 * very thing it was measuring.
 *
 * This reads the option names each exported function destructures — across
 * however many lines it spans — and flags any caller passing something else.
 */
import { readFileSync as rawRead, readdirSync } from 'fs';

/**
 * Source with comments removed.
 *
 * A call site's options are found by reading the text between its braces, and
 * a comment there is read as arguments. An explanatory note mentioning "rib 4"
 * and "0.12" came back as `buildVRibs({ 2: ... })` and `{ 4: ... }` passing
 * options nothing accepts — three failures, all of them prose.
 *
 * Fourth checker in this project to have read its own commentary as data.
 */
const readFileSync = (path, enc) => rawRead(path, enc)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Option names a function destructures, from a possibly multi-line signature. */
function acceptedKeys(body) {
  const out = {};
  const re = /export function (\w+)\(([\s\S]*?)\)\s*\{/g;
  for (const m of body.matchAll(re)) {
    const [, name, params] = m;
    // Only functions whose FIRST parameter is the options object.
    //
    // `diagonalTension(vrib, opts)` takes a data object first and its options
    // second. Treating that first object as options flagged `apex` and `base`
    // — real fields of a real argument — as unaccepted. The check now looks
    // at `fn({...})` call sites, so it must only consider functions where
    // that first object IS the options.
    const brace = params.indexOf('{');
    if (brace < 0) continue;
    if (params.slice(0, brace).trim() !== '') continue;
    // Match to the closing brace of the destructuring pattern.
    let depth = 0;
    let end = -1;
    for (let i = brace; i < params.length; i++) {
      if (params[i] === '{') depth++;
      else if (params[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    // Comments first. A `// ...` line inside the signature has no comma, so
    // the token accumulator below swallowed it together with the key that
    // followed — and `maxUsableCL` was reported as not accepted by the very
    // function that declares it. A detector with false positives is worse
    // than none: it trains you to ignore it.
    const inner = params.slice(brace + 1, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const keys = new Set();
    // Top-level keys only: skip anything nested inside a default object.
    let d = 0;
    let token = '';
    for (const ch of `${inner},`) {
      if (ch === '{' || ch === '[' || ch === '(') d++;
      else if (ch === '}' || ch === ']' || ch === ')') d--;
      if (ch === ',' && d === 0) {
        const k = /^\s*(\w+)/.exec(token);
        if (k) keys.add(k[1]);
        token = '';
      } else token += ch;
    }
    // A `...rest` accepts anything, so the function cannot be said to ignore
    // a key. `solveEquilibriumFromWing` gathers its extras that way and was
    // flagged for an option it does forward.
    if (/\.\.\.\w+/.test(inner)) continue;
    out[name] = keys;
  }
  return out;
}

const coreFiles = readdirSync('src/core').filter((f) => f.endsWith('.js'));
const accepted = {};
for (const f of coreFiles) {
  Object.assign(accepted, acceptedKeys(readFileSync(`src/core/${f}`, 'utf8')));
}

const sources = [
  ...coreFiles.map((f) => [`src/core/${f}`, readFileSync(`src/core/${f}`, 'utf8')]),
  ['src/ui/app.js', readFileSync('src/ui/app.js', 'utf8')],
  ...readdirSync('tests').filter((f) => /\.(js|mjs)$/.test(f))
    .map((f) => [`tests/${f}`, readFileSync(`tests/${f}`, 'utf8')]),
];

const bad = [];
for (const [file, body] of sources) {
  for (const [fn, keys] of Object.entries(accepted)) {
    if (!keys.size) continue;
    const re = new RegExp(`\\b${fn}\\(\\s*\\{([^{}]*)\\}`, 'g');
    for (const m of body.matchAll(re)) {
      for (const k of [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1])) {
        if (!keys.has(k)) bad.push(`${file}: ${fn}({ ${k}: ... }) — not accepted`);
      }
    }
  }
}

/* ---- capabilities with no path to a user -------------------------------- */
//
// A model built, tested, validated and unreachable is a model nobody can use.
// It has happened repeatedly here: a bill of materials with no button, family
// generation with no control, a material catalogue the model never read.
//
// Not every export should be reachable — helpers are called by other core
// code, and importers are run from the command line. So this checks a named
// list of things that ARE meant to be user-facing, which has to be extended
// deliberately when a new capability is added.
const USER_FACING = [
  'optimiseLineSet', 'trimSchedule', 'fabricSchedule', 'parseCascadeSpec',
  'parseRodSpec', 'noseRodGroup', 'checkWingRibStress', 'checkDiagonalTension',
  'buildFamily', 'buildBOM', 'lineGeometryCheck', 'applyRiserSplit',
  'lineTableFor', 'buildIntake', 'tiledPages', 'comparePlans',
];
const uiSrc = readFileSync('src/ui/app.js', 'utf8');
const unreachable = USER_FACING
  .filter((fn) => !new RegExp(`\\b${fn}\\b`).test(uiSrc));

const unique = [...new Set(bad)];
console.log(`${Object.keys(accepted).length} exported functions with option objects`);
console.log(`${unique.length} call sites pass an option the function never reads`);
for (const b of unique.slice(0, 20)) console.log(`  ${b}`);

console.log(`\n${USER_FACING.length} capabilities meant to be user-facing`);
if (unreachable.length) {
  console.log(`${unreachable.length} with no path to a user:`);
  for (const u of unreachable) console.log(`  ${u}`);
} else {
  console.log('all of them are reachable from the interface');
}

process.exit(unique.length + unreachable.length ? 1 : 0);
