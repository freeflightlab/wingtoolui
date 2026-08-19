/* benchmark.js — performance and scaling.
 *
 * Run with:  node tests/benchmark.js
 *
 * Two things are being measured, and they matter for different reasons.
 *
 * The interactive path — planform, arc, 3D assembly, development, balance —
 * runs on every slider movement, so it has to stay inside a frame or the tool
 * feels dead under the hand. The nesting path runs on a debounce and can
 * afford longer, but it is the one that scales worst.
 *
 * Each stage is also checked against a budget, so a change that quietly makes
 * the tool ten times slower fails here rather than being discovered by feel.
 */

import { planformFromDesignInputs, planformMetrics } from '../src/core/planform.js';
import { naca4 } from '../src/core/airfoil.js';
import { buildLobe } from '../src/core/lobe.js';
import { buildWing } from '../src/core/wing3d.js';
import { developWing, developmentError } from '../src/core/flatdev.js';
import { applyOvalization, DEFAULT_TRANSITIONS } from '../src/core/ovalization.js';
import { solveEquilibrium } from '../src/core/equilibrium.js';
import { canopyAnchors, buildCascade } from '../src/core/lines.js';
import { nestPanels, fabricEstimate, panelsToDXF } from '../src/core/export.js';

const REPS = 7;

function time(label, fn, reps = REPS) {
  fn(); // warm up, so JIT compilation is not charged to the first sample
  const samples = [];
  let out;
  for (let i = 0; i < reps; i++) {
    const t = process.hrtime.bigint();
    out = fn();
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  return { label, median: samples[Math.floor(reps / 2)], min: samples[0], max: samples[reps - 1], out };
}

function pipeline({ span, cells, points, rootChord = 2.6 }) {
  const planform = planformFromDesignInputs({
    span, rootChord, tipChord: 0.9, tipSweep: 1.1,
  });
  const lobe = buildLobe({ type: 'circle', projectedRatio: 0.88 }, planform.halfSpan);
  const airfoil = naca4('4415');
  const stages = [];

  stages.push(time('planform metrics', () => planformMetrics(planform)));
  stages.push(time('build lobe', () => buildLobe({ type: 'circle', projectedRatio: 0.88 }, planform.halfSpan)));
  stages.push(time('section', () => naca4('4415')));

  const wingT = time('3D assembly', () => buildWing({
    planform, lobe, airfoil, cells, pointsPerSurface: points, zRotation: 'auto', alphaDeg: 5,
  }));
  stages.push(wingT);
  const wing = wingT.out;

  const devT = time('flat development', () => developWing(wing));
  stages.push(devT);
  const panels = devT.out;

  stages.push(time('ovalization', () => panels.map((p) => applyOvalization(p.panel, {
    amount: 0.06, transitions: DEFAULT_TRANSITIONS[p.surface],
  }))));
  stages.push(time('balance solve', () => solveEquilibrium({ area: 25.7 })));
  stages.push(time('line cascade', () => {
    const anchors = canopyAnchors(wing, airfoil, { everyNthRib: 2 });
    return buildCascade(anchors, [0.4, 0, -6.5], { mode: 1 });
  }));
  stages.push(time('distortion check', () => {
    let w = 0;
    for (let i = 0; i < wing.ribs.length - 1; i++) {
      w = Math.max(w, developmentError(wing.ribs[i].upper, wing.ribs[i + 1].upper).worstRelative);
    }
    return w;
  }));
  const nestT = time('nesting', () => nestPanels(panels, { rollWidth: 1.4, gap: 0.03 }), 3);
  stages.push(nestT);
  // Reuse the layout, as the interface does — measuring the writer, not a
  // second nesting run hiding inside it.
  stages.push(time('DXF write', () => panelsToDXF(panels, { nested: nestT.out }), 3));

  return { stages, wing, panels, planform };
}

// ---------------------------------------------------------------------------

console.log('Paraglider Design Tool — benchmark');
console.log(`node ${process.version}  ·  ${REPS} reps, median reported\n`);

const CONFIGS = [
  { name: 'small   (4.2 m, 6 cells, 30 pts)', span: 4.2, cells: 6, points: 30, rootChord: 1.0 },
  { name: 'default (10.25 m, 24 cells, 50 pts)', span: 10.25, cells: 24, points: 50 },
  { name: 'large   (13.5 m, 32 cells, 80 pts)', span: 13.5, cells: 32, points: 80 },
  { name: 'extreme (14 m, 40 cells, 120 pts)', span: 14, cells: 40, points: 120 },
];

// Warm the whole pipeline before measuring anything. Without this the first
// configuration measured absorbs all the JIT compilation for every stage and
// reports slower than wings twice its size, which is worse than useless — it
// points the finger at the wrong place.
pipeline(CONFIGS[1]);
pipeline(CONFIGS[2]);

const results = [];
for (const cfg of CONFIGS) {
  const r = pipeline(cfg);
  const interactive = r.stages
    .filter((s) => !['nesting', 'DXF write'].includes(s.label))
    .reduce((a, s) => a + s.median, 0);
  const nesting = r.stages.find((s) => s.label === 'nesting').median;

  console.log(cfg.name);
  for (const s of r.stages) {
    const bar = '█'.repeat(Math.min(40, Math.round(s.median * 2)));
    console.log(`  ${s.label.padEnd(18)} ${s.median.toFixed(2).padStart(8)} ms  ${bar}`);
  }
  console.log(`  ${'— interactive total'.padEnd(18)} ${interactive.toFixed(2).padStart(8)} ms`);
  console.log(`  ${'— panels'.padEnd(18)} ${String(r.panels.length).padStart(8)}`);
  console.log('');
  const vertices = r.panels.reduce((n, p) => n + p.panel.left.length + p.panel.right.length, 0);
  results.push({ cfg, interactive, nesting, panels: r.panels.length, vertices });
}

// ---------------------------------------------------------------------------
// Scaling. Panel count grows linearly with cells and point density, so the
// interactive path should too. Anything superlinear here is a warning.

// The unit of work is a point, not a panel: raising the point density makes
// every panel more expensive without adding any. Measuring against panel
// count alone makes linear scaling look superlinear and sends you hunting for
// a problem that is not there.
console.log('Scaling (work = total developed vertices)');
const base = results[1];
for (const r of results) {
  const vRatio = r.vertices / base.vertices;
  const tRatio = r.interactive / base.interactive;
  const perV = (r.interactive * 1e6) / r.vertices;
  console.log(`  ${r.cfg.name.split('(')[0].trim().padEnd(8)} vertices x${vRatio.toFixed(2).padStart(5)}  time x${tRatio.toFixed(2).padStart(5)}  ${perV.toFixed(0).padStart(4)} ns/vertex  nesting ${r.nesting.toFixed(0).padStart(5)} ms`);
}

// ---------------------------------------------------------------------------
// Budgets. The interactive path must stay under one 60 Hz frame on the
// default wing, and remain usable on the largest. Nesting is debounced, so
// it only has to stay under a second.

console.log('\nBudgets');
const budgets = [
  ['default interactive under 16 ms (one frame)', results[1].interactive, 16],
  ['large interactive under 60 ms', results[2].interactive, 60],
  ['extreme interactive under 200 ms', results[3].interactive, 200],
  ['default nesting under 400 ms', results[1].nesting, 400],
  ['extreme nesting under 3000 ms', results[3].nesting, 3000],
];
let failed = 0;
for (const [label, value, limit] of budgets) {
  const ok = value <= limit;
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${value.toFixed(1).padStart(8)} ms / ${limit} ms`);
}

// ---------------------------------------------------------------------------
// Nesting quality, which is the number that decides fabric cost.

console.log('\nFabric use');
for (const cfg of [CONFIGS[1], CONFIGS[2]]) {
  const planform = planformFromDesignInputs({
    span: cfg.span, rootChord: cfg.rootChord ?? 2.6, tipChord: 0.9, tipSweep: 1.1,
  });
  const lobe = buildLobe({ type: 'circle', projectedRatio: 0.88 }, planform.halfSpan);
  const wing = buildWing({ planform, lobe, airfoil: naca4('4415'), cells: cfg.cells, pointsPerSurface: cfg.points });
  const panels = developWing(wing);
  for (const roll of [1.4, 1.6]) {
    const e = fabricEstimate(panels, { rollWidth: roll, gap: 0.03 });
    console.log(`  ${cfg.name.split('(')[0].trim().padEnd(8)} roll ${roll.toFixed(2)} m: ${e.linearMetres.toFixed(1).padStart(6)} m used, ${(e.utilisation * 100).toFixed(0).padStart(3)}% utilisation`);
  }
}

console.log(failed ? `\n${failed} budget(s) exceeded` : '\nAll budgets met');
process.exit(failed ? 1 : 0);
