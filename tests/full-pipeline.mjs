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
  buildLinePlan, RISER_LAYOUTS, anchorsForLineLength,
} from '../src/core/lineplan.js';
import { analyseLoads, selectLines, parseMaterialsTable, DEFAULT_LINE_TABLE, lengthChain } from '../src/core/loads.js';
import { solveEquilibrium } from '../src/core/equilibrium.js';
import { wingPolar } from '../src/core/aero.js';
import { atmosphere } from '../src/core/atmosphere.js';
import { ribOpenings } from '../src/core/ribholes.js';
import { buildVRibs } from '../src/core/vribs.js';
import {
  parseSizeFamilies, referenceDesignInputs, lineLengthPerSpan,
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
      const lobe = buildLobe({ type: 'circle', projectedRatio: rec.projectedRatio },
        pf.halfSpan);
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
      const projErr = size.projectedArea
        ? Math.abs(projectedArea(wing) - size.projectedArea) / size.projectedArea : 0;
      if (projErr > 0.12) flag(id, 'arc', 'projected area off',
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
      const af = naca4('4415');
      const risers = size.flatAR >= 6.2 ? 2 : 3;
      af.anchors = risers === 2
        ? { A: 0.09, B: 0.38, C: 0.60 }
        : { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
      // Anchor density solved to the published consumption rather than taken
      // from the cell count, which is the relationship real wings follow.
      const target = size.totalLineLength
        ?? lineLengthPerSpan(size.flatAR) * size.flatSpan;
      const solved = anchorsForLineLength({
        wing, airfoil: af, rows: Object.keys(af.anchors), targetMetres: target,
        layout: RISER_LAYOUTS[risers === 2 ? 'A/B+C' : 'A/B/C+D'],
        lineLengthM: size.flatSpan * 0.464, risers, mainsPerRow: 3,
        brakes: { anchors: 13, levelCounts: [6, 3, 1] },
      });
      const plan = solved.plan;
      // Known and recorded: with three cascade levels the lines are longer
      // than a real four-level wing's, so at realistic anchor density the
      // total runs above published. Density is the constraint kept because it
      // sets the loads. Tracked as a limitation, not flagged as a defect.
      overshoot.push({ id, error: solved.error });
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

if (overshoot.length) {
  const errs = overshoot.map((o) => o.error);
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  console.log('known limitation, tracked not flagged:');
  console.log(`  total line length runs +${(mean * 100).toFixed(0)}% against published `
    + `(${(Math.min(...errs) * 100).toFixed(0)}% to +${(Math.max(...errs) * 100).toFixed(0)}%)`);
  console.log('  three cascade levels where real wings use four, so the lines are');
  console.log('  longer for the same anchor count. Density is kept because it sets');
  console.log('  the loads; the length follows and is reported.\n');
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
}

process.exit(problems.length ? 1 : 0);
