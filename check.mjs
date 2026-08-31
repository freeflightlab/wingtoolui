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
  ['unit suite', 'node tests/run-tests.js', /(\d+) passed, (\d+) failed/],
  ['Phase 1 audit', 'node tests/phase1-audit.mjs', /(\d+) checks, (\d+) failed/],
  // The pipeline carries a known, documented baseline of 3 problems: an
  // optimistic low-Reynolds polar on two small wings, and one wing that
  // cannot size every line. Treating those as failures would make the whole
  // command red every time and train everyone to ignore it — but letting the
  // number drift up silently is worse, so the baseline is pinned.
  ['full pipeline', 'node tests/full-pipeline.mjs',
    /(\d+) wings completed[^,]*, (\d+) problems/, { baseline: 3 }],
  // The interface is a stage in its own right. Its harness used to call the
  // export functions directly, which tests the functions and not the wiring —
  // and that is how a duplicate 'Panels DXF' button and a bill of materials
  // with no button at all both survived. It now presses the real buttons.
  ['interface', 'node tools/ui-test.cjs', /(all UI paths OK)/],
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
