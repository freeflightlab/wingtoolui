/* check.mjs — everything, in one command.
 *
 * The suite, the Phase 1 audit, the full-pipeline run and the self-audit have
 * been four separate commands. Four commands means three of them get skipped,
 * and the roadmap has carried "run the audit in the same breath as the suite"
 * as an open item for most of this project — which is itself the evidence.
 *
 * Runs everything, reports each, and fails if any fails.
 */
import { execSync } from 'child_process';

const stages = [
  // First, because every other stage assumes the tree is complete. A first
  // user's build failed on a stale checkout and the message could only
  // describe what the build itself needed.
  ['checkout', 'node tools/doctor.mjs', /(all \d+ files in MANIFEST.txt are present)/],
  ['unit suite', 'node tests/run-tests.js', /(\d+) passed, (\d+) failed/],
  ['Phase 1 audit', 'node tests/phase1-audit.mjs', /(\d+) checks, (\d+) failed/],
  // The pipeline carries a known, documented baseline of 2 problems: the
  // Zeno 2 L and the Artik R 2 27 cannot size every line, both being the
  // largest size of the highest-aspect family in their maker's range.
  //
  // It was 4. The two sink-rate failures went when the minimum-sink search
  // was capped at a usable lift coefficient — it had been reporting a
  // minimum at CL 1.37 and 24 km/h, which is not a flight state. The
  // baseline is tightened rather than left where it was, so the two that
  // remain cannot be joined quietly by a third. Treating those as failures would make the whole
  // command red every time and train everyone to ignore it — but letting the
  // number drift up silently is worse, so the baseline is pinned.
  ['full pipeline', 'node tests/full-pipeline.mjs',
    /(\d+) wings completed[^,]*, (\d+) problems/, { baseline: 0 }],
  // The interface is a stage in its own right. Its harness used to call the
  // export functions directly, which tests the functions and not the wiring —
  // and that is how a duplicate 'Panels DXF' button and a bill of materials
  // with no button at all both survived. It now presses the real buttons.
  ['interface', 'node tools/ui-test.cjs', /(all UI paths OK)/],
  // Every wing in the database against the physics, not just against the
  // parser. 74 of 103 reference files were reached by nothing stronger than
  // "does it parse", and a file can parse perfectly and describe an
  // impossible wing.
  ['reference sweep', 'node tests/reference-sweep.mjs',
    /(\d+) line sheets checked[^,]*, (\d+) problems/],
  // Options passed that a function never reads. Four defects in this project
  // came from that shape — a call that looks right, runs clean, and does
  // nothing — including a bill of materials built with no line data.
  // A check that cannot fail reports success. Three in this project could
  // not, and all three passed for rounds.
  ['assertions', 'node tools/check-assertions.mjs',
    /(\d+) assertions that cannot fail/],
  // Names quoted in comments and documents must exist in the code. A rename
  // breaks the callers, which tests catch; it leaves the prose pointing at
  // nothing, which they do not.
  // A name that states its unit must be used in that unit. Three places
  // interpolated by array index while their callers passed a chord fraction,
  // which is the same shape of mistake in a space rather than a unit.
  ['units', 'node tools/check-units.mjs',
    /(\d+) values used outside the unit their name claims/],
  ['references', 'node tools/check-references.mjs',
    /(\d+) names that point at nothing in the code/],
  ['options', 'node tools/check-options.mjs',
    /(\d+) call sites pass an option the function never reads/],
  // Every dataset measured, and the model's own constants checked against
  // what they say. `ANCHOR_DENSITY` was six hand-entered Ozone designs while
  // the corpus held 25 across six makers.
  ['corpus', 'node tools/corpus-learnings.mjs',
    /(\d+) row-count group\(s\) where the corpus disagrees/],
  // Every material figure says where it came from, and an estimate says so
  // in a word a reader will notice. Presenting an estimate as a measurement
  // is what costs a tool its credibility the first time somebody checks.
  ['provenance', 'node tools/check-provenance.mjs',
    /(\d+) tables without honest provenance/],
  ['benchmark', 'node tests/benchmark.js', /(All budgets met)/],
  ['self-audit', 'node tools/audit.mjs', /(audit clean)/],
];

let failed = 0;
const width = Math.max(...stages.map((s) => s[0].length));

for (const [name, cmd, pattern, opts = {}] of stages) {
  let out = '';
  let ok = true;
  try {
    out = execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;
    ok = false;
  }
  const m = pattern.exec(out);
  // A stage whose summary line cannot be found has not passed, whatever its
  // exit code says.
  //
  // And where a baseline is set, the summary line is the authority rather
  // than the exit code: the pipeline exits non-zero on any problem at all, so
  // reading the exit code first made the baseline unreachable — the stage was
  // already marked failed before the count was compared.
  if (!m) ok = false;
  else if (m.length > 2) {
    ok = Number(m[2]) <= (opts.baseline ?? 0);
  }

  const detail = m
    ? (m.length > 2
      ? `${m[1]} / ${m[2]} failed${opts.baseline ? ` (${opts.baseline} known)` : ''}`
      : m[1])
    : 'no summary found';
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(width)}  ${detail}`);
  if (!ok) {
    failed++;
    const tail = out.trimEnd().split('\n').slice(-6);
    for (const l of tail) console.log(`         ${l}`);
  }
}

console.log(failed
  ? `\n${failed} of ${stages.length} stages failed`
  : `\nall ${stages.length} stages pass`);
process.exit(failed ? 1 : 0);
