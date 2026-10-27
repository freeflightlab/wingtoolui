/* dead-controls.cjs — every control changes something.
 *
 * A control that changes nothing is a claim the interface makes and the tool
 * does not keep. One review found five of them at once, each of which read as
 * a working feature:
 *
 *   - "Line drag coefficient" had a field and no reader anywhere.
 *   - "Billow from pressure" read a value nothing ever set, and would have
 *     called a function that did not exist if anything had.
 *   - "Sail tension" was only read inside that dead branch.
 *   - "Nesting: against outlines / against boxes" chose between two calls
 *     that had become the same call.
 *   - Two intake cuts fed a check that used neither where it mattered.
 *
 * The interface test probed sixteen settings chosen by hand, and none of the
 * five was among them. This probes ALL of them, found by reading the source
 * the same way the interface test finds them: each is changed, and the tool's
 * whole output compared — the model, what every tab draws, and, if nothing
 * there moved, the file every export button writes.
 *
 * A control is allowed to act only on the exports (the paper size, the size
 * family's range); it is not allowed to act on nothing.
 *
 * Twice over: on the parametric wing the tool opens with, and on the Swoop2,
 * a complete imported design. The second matters as much. An imported design
 * brings its own planform, lines, rods and diagonals, so the controls that
 * would set those have nothing to set — and the ones still on the panel were
 * never checked there. On an import only the controls actually OFFERED are
 * probed: a control taken off the panel because it does not apply is the
 * right answer, and a control left on it that does nothing is the defect.
 */
const fs = require('fs');
const crypto = require('crypto');
const { errors, REPLACES_DESIGN } = require('./dom-shim.cjs');
// What a panel rebuild made is read back from the shim's registry of new
// nodes, which this probe keeps and empties as it goes.
globalThis.__recordNodes = true;

if (errors.length) {
  console.log(errors.join('\n'));
  process.exit(1);
}

const S = globalThis.__S;
const src = fs.readFileSync('src/ui/app.js', 'utf8');

/* ---- what the tool produces -------------------------------------------- */

const gather = (n, out = []) => {
  if (!n) return out;
  if (n._text) out.push(n._text);
  if (n.attrs) out.push(JSON.stringify(n.attrs));
  for (const c of n.children || []) gather(c, out);
  return out;
};
const VIEWS = ['vp-plan', 'vp-front', 'vp-iso', 'vp-section', 'vp-rib', 'vp-diag',
  'vp-lineplan', 'vp-polar', 'vp-atmos', 'readout', 'balanceTable', 'envTable',
  'cascadeTable'];
const hash = (parts) => crypto.createHash('md5').update(parts.join('\n')).digest('hex');

/** The model and every view. Fast: no export is pressed. */
function modelDigest() {
  globalThis.__rebuild();
  const M = globalThis.__getM();
  if (M.error) return `ERROR:${M.error}`;
  const seen = new WeakSet();
  const parts = [JSON.stringify(M, (k, v) => {
    // Timings and the deferred cutting layout are not outputs of a setting,
    // and nor is anything the interface caches on the model for itself
    // (`_structure`): a cache is filled by whichever view happens to draw
    // first, so it is there in one digest and not in the next.
    //
    // `fabricError` belongs with the layout and was left in: it is undefined
    // until the first export runs the nester and null ever after, so every
    // digest taken after the first export differed from the baseline taken
    // before it, and every control probed from then on read as alive. The
    // check at the end of `probe` is what found it.
    if (k === 'ms' || k === 'nested' || k === 'fabric' || k === 'nestStale'
      || k === 'fabricError') return undefined;
    if (k.startsWith('_')) return undefined;
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    if (v instanceof Map) return [...v.entries()];
    if (v instanceof Set) return [...v.values()];
    return v;
  })];
  // Every tab drawn, THEN every view read. Reading them tab by tab picked up
  // the other tabs' views as the last digest had left them, so a setting put
  // back still looked changed and nothing could ever read as dead.
  for (const tab of ['wing', 'rib', 'lines', 'structure', 'analysis']) {
    try { globalThis.__tab(tab); } catch (e) { parts.push(`TAB ${tab} ${e.message}`); }
  }
  for (const id of VIEWS) parts.push(gather(document.getElementById(id)).join('|'));
  return hash(parts);
}

/** Every file every export button writes, less the two that echo the settings. */
function exportDigest() {
  globalThis.__rebuild();
  globalThis.__saved = {};
  globalThis.__buttons.length = 0;
  globalThis.__controls();
  const parts = [];
  // A snapshot: a handler that rebuilds the panel appends to the live array.
  for (const b of globalThis.__buttons.slice().filter((x) => !REPLACES_DESIGN.test(x.text))) {
    try { b.fn(); } catch (e) { parts.push(`THROW ${b.text} ${e.message}`); }
  }
  const files = Object.entries(globalThis.__saved)
    .filter(([f]) => !/\.pgd\.json$|-parameters\.tsv$/.test(f));
  parts.push(JSON.stringify(files));
  return hash(parts);
}

/* ---- the controls, read from the source -------------------------------- */

const bound = [...src.matchAll(
  /(slider|numberField|checkField|selectField|textAreaField)\([^,]+, '(\w+)'/g)]
  .map((m) => ({ kind: m[1], key: m[2] }));
const options = {};
for (const m of src.matchAll(/selectField\([^,]+, '(\w+)', '[^']*',\s*(\[[\s\S]*?\]\s*)\);/g)) {
  options[m[1]] = [...m[2].matchAll(/\['([^']*)'/g)].map((x) => x[1]);
}
// Selects whose options are built at run time rather than written out.
const OTHER_VALUE = {
  distribution: 'uniform', riserLayout: "A-A'/B/C", lineBrand: 'Liros',
  clothLE: 'Porcher Skytex 32', clothUpper: 'Porcher Skytex 27 hard',
  clothLower: 'Porcher Skytex 27 hard', clothRib: 'Porcher Skytex 38',
  // Values the generic nudge cannot reach or would push out of range.
  ellipticityTE: 0.6, ellipticityLE: 0.6, projectedRatio: 0.8,
  maxLineTypes: 2, rodReach: 50,
  cascadeSpec: 'A 12 6 3\nB 12 6 3\nC 12 6 3\nD 12 6 3',
  rodSpec: 'nose  10.0 22.0   7.0 15.0   1.5',
};
// What has to be on for a control to mean anything.
const NEEDS = {
  lobeARatio: { lobeType: 'ellipse' }, lobeBRatio: { lobeType: 'ellipse' },
  bionic: { lobeType: 'bionic' }, projectedRatio: { lobeType: 'circle' },
  reflexStart: { reflex: 1 }, splitFrom: { riserLayout: "A-A'/B/C" },
  cascadeSpec: { useCascadeSpec: true },
  useRodSpec: { rods: true }, rodSpec: { rods: true, useRodSpec: true },
  rodUpper: { rods: true }, rodLower: { rods: true }, rodDia: { rods: true },
  rodReach: { rods: true },
  vribSpread: { vribs: true }, vribRows: { vribs: true },
  vribMinLength: { vribs: true }, vribView: { vribs: true },
  // How far a diagonal reaches only matters where the lines are sparse: on
  // the default plan every free rib has a lined one beside it. Two free ribs
  // between, as a written cascade can ask for and the Swoop2 has.
  vribReach: {
    vribs: true, useCascadeSpec: true,
    cascadeSpec: 'A 9 4 2\nB 9 4 2\nC 9 4 2\nD 9 4 2',
  },
  ovalAmount: { applyOval: true }, ovalFromPressure: { applyOval: true },
  sailTension: { applyOval: true, ovalFromPressure: true },
  cxLines: { cxLinesFromPlan: false },
};
// Chosen from a list of published wings or real ones to compare against:
// what they do is tested by name in the interface test.
const SKIP = new Set(['reference', 'compareTo']);

const nudge = (kind, key, v) => {
  if (key in OTHER_VALUE && OTHER_VALUE[key] !== v) return OTHER_VALUE[key];
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'number') {
    if (v === 0) return 1;
    if (Number.isInteger(v)) return v + 1;
    return Math.abs(v) < 1 ? v * 1.15 + 0.01 : v * 1.07;
  }
  if (kind === 'selectField') {
    const other = (options[key] || []).filter((x) => x !== v);
    return other.length ? other[0] : null;
  }
  return typeof v === 'string' ? `${v}x` : null;
};

/* ---- the probe ---------------------------------------------------------- */

const snapshot = () => JSON.parse(JSON.stringify(
  Object.fromEntries(Object.entries(S).filter(([k]) => !k.startsWith('_')))));
const restoreTo = (saved) => {
  for (const k of Object.keys(S)) if (!(k in saved) && !k.startsWith('_')) delete S[k];
  Object.assign(S, saved);
};

/**
 * Is this setting's control on the panel, and live, for the wing on the page?
 *
 * The panel is rebuilt and the controls it made are read back: each remembers
 * the setting it drives (`_key`). One that was taken off (`display: none`) or
 * left on view disabled is not on offer.
 */
function offered(key) {
  const from = globalThis.__createdNodes.length;
  globalThis.__controls();
  return globalThis.__createdNodes.slice(from).some((n) => n._key === key
    && !n.disabled && !((n._field || n).style && (n._field || n).style.display === 'none'));
}

function probe(label, { onlyOffered = false } = {}) {
  const start = snapshot();
  // The panel first: the tool never runs without one, and its hints are
  // re-evaluated on every rebuild from then on.
  globalThis.__rebuild();
  globalThis.__controls();
  // Once to settle, then the baseline. The first pass through the tabs is
  // not like the rest — views are wired for panning the first time they
  // draw — and a baseline taken from it differed from every later digest, so
  // every control looked alive. A probe that cannot find a dead control is
  // the defect it exists to find; the two must agree before anything is
  // compared.
  modelDigest();
  const baseModel = modelDigest();
  if (String(baseModel).startsWith('ERROR')) {
    console.log(`  BROKE [${label}] the wing does not build: ${baseModel.slice(6, 160)}`);
    return 1;
  }
  if (modelDigest() !== baseModel) {
    console.log(`  BROKE [${label}] the tool's output is not repeatable: two digests of the same settings differ`);
    return 1;
  }
  let baseExport = null;
  // The stand-in DOM keeps every node ever made, so that selectors can find
  // them; a few hundred redraws of five views is millions of nodes, and the
  // process was killed for memory part way through the second wing. Nothing
  // made after this point is looked up by a selector, so each control hands
  // its nodes back.
  const mark = globalThis.__createdNodes.length;

  const dead = [];
  const broken = [];
  const unprobed = [];
  const exportOnly = [];
  let probed = 0;
  let notOffered = 0;

  for (const { kind, key } of bound) {
    if (SKIP.has(key)) continue;
    const needs = NEEDS[key] || null;
    if (needs) Object.assign(S, needs);
    if (onlyOffered) {
      globalThis.__rebuild();
      if (!offered(key)) {
        notOffered++;
        restoreTo(start);
        globalThis.__createdNodes.length = mark;
        continue;
      }
    }
    const before = needs ? modelDigest() : baseModel;
    const v = S[key];
    const nv = nudge(kind, key, v);
    if (nv == null) { unprobed.push(key); restoreTo(start); continue; }

    probed++;
    S[key] = nv;
    const after = modelDigest();
    if (String(after).startsWith('ERROR')) {
      broken.push(`${key} = ${JSON.stringify(nv)}: ${after.slice(6, 120)}`);
    } else if (after === before) {
      // Nothing in the model or the views. The exports, then.
      let beforeX;
      if (needs) {
        S[key] = v;
        beforeX = exportDigest();
        S[key] = nv;
      } else {
        S[key] = v;
        if (baseExport === null) { exportDigest(); baseExport = exportDigest(); }
        beforeX = baseExport;
        S[key] = nv;
      }
      if (exportDigest() === beforeX) {
        dead.push(`${key} (${JSON.stringify(v)} -> ${JSON.stringify(nv)})`);
      } else exportOnly.push(key);
    }
    restoreTo(start);
    globalThis.__createdNodes.length = mark;
  }
  globalThis.__rebuild();
  globalThis.__controls();

  // The baseline has to still be the baseline. If the digest of the SAME
  // settings has moved during the run, every control probed after it moved
  // read as alive whatever it did — which is how "Rib and diagonal cloth"
  // passed here while changing nothing: a cache the interface had started
  // keeping on the model appeared in every digest after the first export,
  // and in none before.
  if (modelDigest() !== baseModel) {
    console.log(`  BROKE [${label}] the baseline moved during the run: the same settings no `
      + 'longer give the digest they started with, so nothing probed after that could be told dead');
    return dead.length + broken.length + unprobed.length + 1;
  }
  if (baseExport !== null) {
    exportDigest();
    if (exportDigest() !== baseExport) {
      console.log(`  BROKE [${label}] the exports of the same settings changed during the run`);
      return dead.length + broken.length + unprobed.length + 1;
    }
  }

  for (const d of dead) console.log(`  DEAD [${label}] ${d}`);
  for (const b of broken) console.log(`  BROKE [${label}] ${b}`);
  for (const u of unprobed) console.log(`  NOT PROBED [${label}] ${u}: no second value to try`);
  console.log(`${label}: ${probed} controls probed`
    + (onlyOffered ? `, ${notOffered} not on offer for this wing` : '')
    + `, ${exportOnly.length} act on the exports alone`
    + (exportOnly.length ? ` (${exportOnly.join(', ')})` : ''));
  return dead.length + broken.length + unprobed.length;
}

let bad = probe('the parametric wing');

// The Swoop2, loaded the way the picker loads it.
const SWOOP2 = "Laboratori d'envol Swoop2  (complete design)";
S.reference = SWOOP2;
globalThis.__rebuild();
globalThis.__controls();
if (!globalThis.__getM().imported) {
  console.log('  BROKE the Swoop2 did not load, so no imported design was probed');
  bad += 1;
} else {
  bad += probe('the Swoop2', { onlyOffered: true });
}

console.log(`${bad} controls that change nothing`);
process.exit(bad ? 1 : 0);
