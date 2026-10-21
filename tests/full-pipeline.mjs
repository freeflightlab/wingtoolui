/* full-pipeline.mjs — run every real wing through the whole tool.
 *
 * The suite tests modules. The Phase 1 audit tests roadmap claims. Neither
 * asks the question that matters most: **given a real wing, does the complete
 * pipeline produce a coherent, physically sensible design?**
 *
 * Every stage has been validated against production data in isolation. This
 * runs all of them, on all 38 published sizes, and checks the results against
 * each other and against physics. A stage that is right alone can still be
 * wrong in company.
 */
import { readFileSync, readdirSync } from 'fs';
import { planformFromDesignInputs, planformMetrics } from '../src/core/planform.js';
import { buildLobe, lobeMetrics } from '../src/core/lobe.js';
import { buildWing, projectedArea } from '../src/core/wing3d.js';
import { naca4 } from '../src/core/airfoil.js';
import { developWing, developmentError } from '../src/core/flatdev.js';
import { nestPanels, fabricEstimate } from '../src/core/export.js';
import {
  buildLinePlan, RISER_LAYOUTS, anchorsForLineLength, designCascade,
} from '../src/core/lineplan.js';
import { analyseLoads, selectLines, parseMaterialsTable, DEFAULT_LINE_TABLE, lengthChain } from '../src/core/loads.js';
import { solveEquilibrium } from '../src/core/equilibrium.js';
import { wingPolar } from '../src/core/aero.js';
import { atmosphere } from '../src/core/atmosphere.js';
import { ribOpenings } from '../src/core/ribholes.js';
import { buildVRibs } from '../src/core/vribs.js';
import {
  parseSizeFamilies, referenceDesignInputs, lineLengthPerSpan, EXAMPLE_SCALING,
} from '../src/core/scaling.js';
import { lineGeometryCheck } from '../src/core/pma.js';

// Every specification file, not just the first one written.
//
// This read `size-families.tsv` by name. When Niviuk arrived as a sixth
// manufacturer in its own file the pipeline ignored it entirely and reported
// "38 wings completed" as though nothing had changed — a silent omission in
// the one check meant to catch silent omissions.
// The line catalogue every wing is sized against.
const CATALOGUE = parseMaterialsTable(
  readFileSync('data/reference/line-materials.tsv', 'utf8'));

const fams = {};
for (const specFile of readdirSync('data/reference').filter((x) => /-spec\.tsv$|families\.tsv$/.test(x))) {
  Object.assign(fams, parseSizeFamilies(readFileSync(`data/reference/${specFile}`, 'utf8')));
}
const problems = [];
const rows = [];
const overshoot = [];
const arcErrors = [];

const flag = (wing, stage, what, detail) =>
  problems.push({ wing, stage, what, detail });

for (const [family, sizes] of Object.entries(fams)) {
  for (const size of sizes) {
    const id = `${family} ${size.name}`;
    const rec = referenceDesignInputs(size);
    if (!rec) { flag(id, 'input', 'no usable specification', ''); continue; }

    try {
      // --- geometry -----------------------------------------------------
      const pf = planformFromDesignInputs(rec.inputs);
      const m = planformMetrics(pf);
      const areaErr = Math.abs(m.area - size.flatArea) / size.flatArea;
      if (areaErr > 0.08) flag(id, 'planform', 'area far from published',
        `${m.area.toFixed(2)} vs ${size.flatArea}`);

      const cells = Math.max(8, Math.round(size.cells / 2));
      // The arc the picker gives it: the handbook's ellipse through its
      // projected span (published, or from Niviuk's projected aspect ratio).
      const lobe = buildLobe(rec.lobe, pf.halfSpan);
      const wing = buildWing({
        planform: pf, lobe, airfoil: naca4('4415'), cells,
        pointsPerSurface: 24, zRotation: 'auto', alphaDeg: 6,
      });
      const lm = lobeMetrics(lobe, pf.halfSpan);
      if (size.projectedSpan) {
        const psErr = Math.abs(lm.projectedSpan - size.projectedSpan) / size.projectedSpan;
        if (psErr > 0.06) flag(id, 'arc', 'projected span off',
          `${lm.projectedSpan.toFixed(2)} vs ${size.projectedSpan}`);
      }
      // The published projected area checks the arc independently of the
      // span it was built through. 12% was allowed, and a circle through the
      // published span came out short on 51 of the 55 wings that publish an
      // area; the ellipse lands within 2.1% of it on every one.
      const projSigned = size.projectedArea
        ? (projectedArea(wing) - size.projectedArea) / size.projectedArea : null;
      if (projSigned != null) arcErrors.push({ id, err: projSigned, basis: rec.projectedSpanBasis });
      if (projSigned != null && Math.abs(projSigned) > 0.03) flag(id, 'arc', 'projected area off',
        `${projectedArea(wing).toFixed(2)} vs ${size.projectedArea}`);

      // --- development --------------------------------------------------
      const panels = developWing(wing);
      if (panels.length !== cells * 2) {
        flag(id, 'development', 'wrong panel count', `${panels.length}`);
      }
      let worstDev = 0;
      for (let i = 0; i < wing.ribs.length - 1; i++) {
        worstDev = Math.max(worstDev,
          developmentError(wing.ribs[i].upper, wing.ribs[i + 1].upper).worstRelative);
      }
      if (worstDev > 0.01) flag(id, 'development', 'distortion too large',
        `${(worstDev * 100).toFixed(3)}%`);

      // --- nesting ------------------------------------------------------
      const nested = nestPanels(panels, { rollWidth: 1.4, gap: 0.03 });
      const fab = fabricEstimate(panels, { rollWidth: 1.4, gap: 0.03, nested });
      if (!(fab.utilisation > 0.25 && fab.utilisation <= 1)) {
        flag(id, 'nesting', 'implausible utilisation', `${(fab.utilisation * 100).toFixed(1)}%`);
      }

      // --- lines --------------------------------------------------------
      // A design whose line sheets are on file is built with its own cascade
      // (`DESIGN_LINES`): its riser layout, anchors and mains, and its middle
      // lines where the generator can build them — the topology is the same
      // in every size of a family. Any other is a two-liner above an aspect
      // ratio of 6.2 and a three-riser, four-row wing below it.
      //
      // The aspect ratio was all there was, and it built the Alpina 5, a
      // two-liner at 5.9, as four rows on three risers: half as much line
      // again as the wing has. Then the own designs were six Ozone wings, and
      // the BGD Lynx 2 — a three-liner, with A, B and C mains on all four of
      // its sheets — fell to the rule at 6.2 and was built as a two-liner;
      // the Artik R 2, a two-liner on four rows, as one on three.
      const own = designCascade(family);
      const af = naca4('4415');
      const risers = own ? own.layoutDef.filter((r) => r.rows.length).length
        : (size.flatAR >= 6.2 ? 2 : 3);
      const rowCount = own ? new Set(own.layoutDef.flatMap((r) => r.rows)).size : (risers === 2 ? 3 : 4);
      af.anchors = rowCount === 3
        ? { A: 0.09, B: 0.38, C: 0.60 }
        : { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
      // Anchor density solved to the published consumption rather than taken
      // from the cell count, which is the relationship real wings follow.
      const target = size.totalLineLength
        ?? lineLengthPerSpan(size.flatAR) * size.flatSpan;
      // The line height the interface gives a wing of this span: the
      // published heights' 0.566 x span + 0.459 m to the karabiner, less the
      // riser. It was 0.464 x span here — 5.35 m on the Geo 7 MS, whose
      // lines are 6.42 — "what real mains imply", which is the length of a
      // main line and not of a path. The lines were a sixth too short, and
      // that hid about as much of the generator's surplus.
      const riserM = 0.5;
      const lineHeightM = EXAMPLE_SCALING.lineLength.slope * size.flatSpan
        + EXAMPLE_SCALING.lineLength.intercept - riserM;
      const layout = own ? own.layoutDef : RISER_LAYOUTS[risers === 2 ? 'A/B+C' : 'A/B/C+D'];
      const brakes = { anchors: 13, levelCounts: [6, 3, 1] };
      let solved;
      if (own) {
        // Its tip lines as its sheets show them, on one stabilo line as the
        // makers draw it, as the picker builds it.
        const plan0 = buildLinePlan({
          wing, airfoil: af, layout, lineLengthM: lineHeightM,
          anchorsPerRow: own.cascade.anchorsPerRow, middlesPerRow: own.cascade.middlesPerRow,
          mainsPerRow: own.cascade.mainsPerRow, tipAnchorsPerRow: own.cascade.tipsPerRow,
          brakes, stabilo: true, stabiloRiser: own.cascade.stabiloRiser ?? null,
        });
        if (plan0.levelShortfalls.length) {
          flag(id, 'lines', 'its own cascade could not be built as written',
            plan0.levelShortfalls.map((f) => `${f.row} ${f.level} ${f.got}/${f.asked}`).join(', '));
        }
        solved = {
          plan: plan0, anchorsPerRow: own.cascade.anchorsPerRow, frontFraction: null, saturated: false,
          error: (plan0.totalLengthM - target) / target,
        };
      } else {
        solved = anchorsForLineLength({
          wing, airfoil: af, rows: Object.keys(af.anchors), targetMetres: target,
          layout, lineLengthM: lineHeightM, risers, mainsPerRow: 3, brakes, stabilo: true,
        });
      }
      const plan = solved.plan;
      // Known and recorded: at realistic anchor density the total does not
      // land on the published one. Density is the constraint kept because it
      // sets the loads. Tracked as a limitation, not flagged as a defect.
      overshoot.push({
        id, family, error: solved.error, risers, published: size.totalLineLength != null,
        anchors: solved.anchorsPerRow, front: solved.frontFraction,
        saturated: solved.saturated, own: !!own,
      });
      const mass = size.midWeight || 95;
      const loads = analyseLoads({
        plan, planform: pf, stations: wing.stations,
        totalMassKg: mass, alphaDeg: 6, wingAreaM2: m.area,
      });
      if (loads.closureError > 0.02) {
        flag(id, 'loads', 'load does not close',
          `${(loads.closureError * 100).toFixed(2)}%`);
      }
      // The full catalogue, not the built-in table.
      //
      // Two wings could not size one line each — 264 and 266 daN against a
      // built-in table topping out at 259. The catalogue has three stronger
      // lines and has been in the repository throughout; the pipeline was
      // sizing against a subset while the tool offers a user the whole thing.
      //
      // A validation run that uses less than the tool does is not validating
      // the tool.
      const sel = selectLines(loads.tensions, { table: CATALOGUE });
      if (!sel.ok) {
        // Say WHICH lines and WHY. "not all lines could be sized" told a
        // reader nothing, and two wings have carried that message for
        // several rounds without anyone being able to act on it.
        const un = sel.lines.filter((l) => !l.line);
        const need = Math.max(...un.map((l) => l.requiredDaN || 0));
        const strongest = Math.max(...DEFAULT_LINE_TABLE
          .map((l) => l.strengthKinkedDaN));
        flag(id, 'lines', 'not all lines could be sized',
          `${un.length} of ${sel.lines.length}; heaviest needs `
          + `${need.toFixed(0)} daN, strongest in the table is `
          + `${strongest.toFixed(0)} daN`);
      }

      // Published line consumption, against what the plan actually uses.
      // The length gap is the known limitation above; what must still hold is
      // that every line can be built from the materials table.

      // --- length chain and inspection ----------------------------------
      const chain = lengthChain(sel, { loopAllowanceMM: 130 });
      const insp = lineGeometryCheck(
        chain.lines.filter((l) => l.sized).slice(0, 20).map((l) => ({
          name: l.name, measuredMM: l.referenceLengthMM,
          referenceMM: l.referenceLengthMM, isBrake: false,
        })), { correctionOffsetMM: 0 },
      );
      if (!insp.passes) flag(id, 'inspection', 'a wing built to its own numbers fails', '');

      // --- rib internals ------------------------------------------------
      const open0 = ribOpenings(wing.ribs[0], wing.ribs[1], af);
      if (!open0.ventilates) {
        flag(id, 'ribs', 'root rib openings do not ventilate',
          `${open0.ventilationMarginRatio.toFixed(2)}x`);
      }
      const vribs = buildVRibs({ wing, airfoil: af, rows: ['B'] });
      if (vribs.unsupportedRibs.length) {
        flag(id, 'ribs', 'span with no load path',
          `${vribs.unsupportedRibs.length} ribs`);
      }

      // --- flight -------------------------------------------------------
      const eq = solveEquilibrium({
        pilotMass: mass, area: m.area, span: pf.span,
        cxLines: loads.drag.cxLines, alphaDeg: 6,
      });
      const polar = wingPolar({
        planform: pf, airfoil: naca4('4415'), atm: atmosphere(0),
        mass, alphaRange: [2, 12], step: 1,
      });

      // Physics: a paraglider flies between 30 and 60 km/h, glides between
      // 6 and 13, and sinks between 0.8 and 2 m/s. Anything outside is wrong.
      if (!(eq.speedKMH > 28 && eq.speedKMH < 62)) {
        flag(id, 'flight', 'trim speed outside any real wing',
          `${eq.speedKMH.toFixed(1)} km/h`);
      }
      if (!(eq.glideRatio > 5 && eq.glideRatio < 14)) {
        flag(id, 'flight', 'glide ratio outside any real wing',
          `${eq.glideRatio.toFixed(2)}`);
      }
      if (!(polar.minSink.sinkRate > 0.7 && polar.minSink.sinkRate < 2.2)) {
        flag(id, 'flight', 'sink rate outside any real wing',
          `${polar.minSink.sinkRate.toFixed(2)} m/s`);
      }
      // Higher aspect ratio must glide better, all else equal.
      rows.push({
        id, family, ar: size.flatAR, area: m.area,
        glide: eq.glideRatio, speed: eq.speedKMH, sink: polar.minSink.sinkRate,
        cxLines: loads.drag.cxLines, util: fab.utilisation,
        lineM: plan.totalLengthM, publishedLineM: size.totalLineLength ?? null,
      });
    } catch (e) {
      flag(id, 'crash', e.message.slice(0, 70), '');
    }
  }
}

console.log(`${rows.length} wings completed the full pipeline, `
  + `${problems.length} problems\n`);

if (arcErrors.length) {
  const e = arcErrors.map((a) => a.err * 100);
  const mean = e.reduce((s, v) => s + Math.abs(v), 0) / e.length;
  const fromAR = arcErrors.filter((a) => /aspect ratio/.test(a.basis)).length;
  console.log(`the arc: projected area against published, ${arcErrors.length} wings `
    + `(${fromAR} through the span their projected aspect ratio gives): mean |error| `
    + `${mean.toFixed(1)}%, ${Math.min(...e).toFixed(1)} to ${Math.max(...e).toFixed(1)}%\n`);
}

if (overshoot.length) {
  const pct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;
  const line = (label, list) => {
    if (!list.length) return;
    const errs = list.map((o) => o.error);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    console.log(`  ${label.padEnd(34)} ${String(list.length).padStart(2)} wings  mean ${pct(mean)}  `
      + `(${pct(Math.min(...errs))} to ${pct(Math.max(...errs))})`);
  };
  console.log('known limitation, tracked not flagged:');
  console.log('  total line length against the target, at an anchor density real wings use');
  line('all', overshoot);
  line('with a published total', overshoot.filter((o) => o.published));
  line('with its own rows and anchor counts', overshoot.filter((o) => o.own));
  line('  of them on three risers', overshoot.filter((o) => o.own && o.risers === 3));
  line('  of them on two', overshoot.filter((o) => o.own && o.risers === 2));
  line('density solved, on three risers', overshoot.filter((o) => !o.own && o.risers === 3));
  line('density solved, on two', overshoot.filter((o) => !o.own && o.risers === 2));
  // Each family built from its own cascade, so a figure above is traceable
  // to the wings in it.
  const ownFamilies = [...new Set(overshoot.filter((o) => o.own).map((o) => o.family))];
  console.log(`  own cascades, by family: ${ownFamilies.map((f) => {
    const errs = overshoot.filter((o) => o.family === f).map((o) => o.error);
    return `${f.replace(/^(Ozone|BGD|Niviuk) /, '')} ${pct(Math.min(...errs))}${errs.length > 1
      ? ` to ${pct(Math.max(...errs))}` : ''}`;
  }).join(', ')}`);
  const sorted = overshoot.slice().sort((a, b) => b.error - a.error);
  // Saturated means the search ran out of real-wing densities: at the
  // sparsest when the lines are still too long, at the densest when they are
  // still too short. It said "the sparsest" for both, and so put a single-
  // skin attached on every rib down as the sparsest a real wing is.
  const show = (o) => `${o.id} ${pct(o.error)} (${Object.entries(o.anchors || {})
    .map(([r, n]) => `${r}${n}`).join(' ')}${o.saturated
    ? `, at the ${o.error > 0 ? 'sparsest' : 'densest'} a real wing is` : ''})`;
  console.log(`  furthest over:  ${sorted.slice(0, 3).map(show).join('; ')}`);
  console.log(`  furthest under: ${sorted.slice(-3).map(show).join('; ')}`);
  const familiesOf = (list) => [...new Set(list.map((o) => o.family))].join(', ');
  const overSparse = overshoot.filter((o) => o.saturated && o.error > 0);
  const underDense = overshoot.filter((o) => o.saturated && o.error < 0);
  console.log(`  density solved, and still over at the sparsest a real wing is: `
    + `${overSparse.length} of ${overshoot.filter((o) => !o.own).length} (${familiesOf(overSparse)}); `
    + `still under at the densest: ${underDense.length} (${familiesOf(underDense)})`);
  console.log('  A two-liner\'s front row starts with pairs of short bridles (sixteen a side');
  console.log('  on each Ozone two-liner), a level the generator does not build, so it has');
  console.log('  more line for the same anchors. Density is kept because it sets the loads;');
  console.log('  the length follows and is reported.\n');
}

if (problems.length) {
  const byStage = {};
  for (const p of problems) (byStage[p.stage] ||= []).push(p);
  for (const [stage, list] of Object.entries(byStage)) {
    console.log(`  ${stage}  (${list.length})`);
    for (const p of list.slice(0, 6)) {
      console.log(`    ${p.wing.padEnd(24)} ${p.what}  ${p.detail}`);
    }
    if (list.length > 6) console.log(`    ... and ${list.length - 6} more`);
  }
  console.log('');
}

// Cross-wing consistency: does the tool reproduce the relationships that must
// hold between wings, not just plausible numbers for each?
const byAR = rows.slice().sort((a, b) => a.ar - b.ar);
if (byAR.length > 4) {
  const lo = byAR.slice(0, 3);
  const hi = byAR.slice(-3);
  const mean = (a, k) => a.reduce((s, r) => s + r[k], 0) / a.length;
  console.log('cross-wing relationships that must hold:');
  const gLo = mean(lo, 'glide');
  const gHi = mean(hi, 'glide');
  console.log(`  glide, lowest 3 AR (${mean(lo, 'ar').toFixed(2)}) = ${gLo.toFixed(2)}`);
  console.log(`  glide, highest 3 AR (${mean(hi, 'ar').toFixed(2)}) = ${gHi.toFixed(2)}`);
  console.log(`  ${gHi > gLo ? 'ok  ' : 'FAIL'} higher aspect ratio glides better`);
  const cLo = mean(lo, 'cxLines');
  const cHi = mean(hi, 'cxLines');
  console.log(`  ${cHi < cLo ? 'ok  ' : 'FAIL'} higher aspect ratio has less line drag `
    + `(${cLo.toFixed(5)} vs ${cHi.toFixed(5)})`);

  // The ranges themselves, so a document quoting them can be checked
  // against a run rather than against the last time someone looked.
  const range = (k, d) => `${Math.min(...rows.map((r) => r[k])).toFixed(d)} to `
    + `${Math.max(...rows.map((r) => r[k])).toFixed(d)}`;
  const bySink = rows.slice().sort((a, b) => a.sink - b.sink);
  console.log('\nthe ranges, over every wing:');
  console.log(`  trim speed ${range('speed', 1)} km/h; glide ${range('glide', 2)}; `
    + `minimum sink ${range('sink', 3)} m/s`);
  console.log(`  lowest sinks: ${bySink.slice(0, 3).map((r) => `${r.id} ${r.sink.toFixed(3)}`).join('; ')}`);
  console.log(`  nesting ${range('util', 3)} of the roll used`);
}

process.exit(problems.length ? 1 : 0);
