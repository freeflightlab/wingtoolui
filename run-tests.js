/* run-tests.js — validation suite.
 *
 * Run with:  node tests/run-tests.js
 *
 * These are not smoke tests. Each one checks a result that can be verified
 * independently of the code: an exact closed-form answer, a conservation
 * property the algorithm must obey, or a number printed in the handbook.
 */

import { planformFromDesignInputs, analyticPlanform, planformMetrics, flatArea, ribStations } from '../src/core/planform.js';
import { naca4, splitSurfaces, resampleSurface, airfoilMetrics, parseAirfoilText } from '../src/core/airfoil.js';
import { buildLobe, lobeMetrics, radiusForProjectedRatio, minArrowRatio } from '../src/core/lobe.js';
import { buildWing, projectedArea } from '../src/core/wing3d.js';
import { analyticPlanform as _ap } from '../src/core/planform.js';
import { developPanel, developmentError, developWing } from '../src/core/flatdev.js';
import { solveArc, applyOvalization, wideningProfile , DEFAULT_TRANSITIONS } from '../src/core/ovalization.js';
import { solveEquilibrium, lift3DFactor, simplifiedCalage } from '../src/core/equilibrium.js';
import { canopyAnchors, centroid, buildCascade } from '../src/core/lines.js';
import {
  panelsToDXF, ribsToDXF, panelsToSVG, nestPanels, fabricEstimate, layoutBands,
  vribsToDXF, vribFabricEstimate,
} from '../src/core/export.js';
import {
  parseLep, writeLep, blankLepDocument, lepToDesign, applyDesignToLep,
  designToLep, describeLep, readGeometry, readAoA, section as lepSection,
} from '../src/core/lep.js';
import { discretePlanform } from '../src/core/planform.js';
import { readFileSync, existsSync } from 'fs';
import { fitScales, boundsOf } from '../src/core/viewfit.js';
import { buildSize, buildFamily, familyTable } from '../src/core/family.js';
import {
  buildVRibs, developFan, fanDevelopmentError, vribLoads,
  buildHRibs, internalStructure,
} from '../src/core/vribs.js';
import {
  chordwiseLoading, loadBetween, rowSharesFromPressure, centreOfPressure,
  shareSweep, camberSeries,
} from '../src/core/pressure.js';
import { rad } from '../src/core/num.js';
import {
  atmosphere, geopotential, nonDimensional, speedForLift, LAYER_TABLE, profile,
} from '../src/core/atmosphere.js';
import {
  thinAirfoil, liftingLine, wingPolar, estimateSectionPolar, profileDrag,
} from '../src/core/aero.js';
import { applyReflex } from '../src/core/airfoil.js';
import { parsePolar, commandScript, airfoilToDat, checkPolarMatch } from '../src/core/xfoil.js';
import {
  parseLineName, parseLineTable, summarise, inferTopology, inferRiserLength,
  buildLinePlan, comparePlans, referenceTotals, RISER_LAYOUTS,
  parsePhiLineSheet, checkPhiSheet, phiLineLength,
  parseBgdLineTable, bgdCascadeTotals, bgdStatedTopology,
  buildBrakePlan, brakeEngagement, tipFirstSlack, brakeAnchorRibs,
} from '../src/core/lineplan.js';
import {
  spanLoadDistribution, anchorLoads, lineTensions, selectLines, lineDrag,
  stretchCorrection, analyseLoads, parseMaterialsTable, DEFAULT_LINE_TABLE,
  equilibriumInputsFrom, rowSharesFor, loadEnvelope, gustLoadFactor,
  asymmetricCollapse, frontalCollapse, designEnvelope, PRACTICAL_FLOOR,
  DEFAULT_LOAD_CASE,
} from '../src/core/loads.js';
import {
  riserSet, riserLengths, alphaChange, brakeSlackUnderBar,
  acceleratedPolar, travelForSpeedRange, RISER_HARDWARE, hardwareForSize,
  liftModelFromWing, acceleratedPolarFromWing, collapseFloorForTopSpeed,
} from '../src/core/risers.js';
import {
  parseSizeTable, fitScalingFamily, scaleToArea, generateFamily,
  compareFamily, loadingTrend, scaleDesignInputs, EXAMPLE_SCALING,
  parseSizeFamilies, crossFamilyError, APPLICATIONS, classifyApplication,
  compareApplications, normalisedMetrics, compareFamilies,
  LOADING_VS_AR, expectedLoading, loadingCheck,
  LINE_LENGTH_PER_SPAN, lineLengthPerSpan, estimateTotalLineLength, lineLengthExponent,
} from '../src/core/scaling.js';

const pick = (p) => (p ? { row: p.row, level: p.level, index: p.index } : null);

const SAMPLE_POLAR = [
  '',
  '       XFOIL         Version 6.99',
  '',
  ' Calculated polar for: NACA 4415',
  '',
  ' 1 1 Reynolds number fixed          Mach number fixed',
  '',
  ' xtrf =   1.000 (top)        1.000 (bottom)',
  ' Mach =   0.030     Re =     1.500 e 6     Ncrit =   7.000',
  '',
  '  alpha    CL        CD       CDp       CM     Top_Xtr  Bot_Xtr',
  ' ------- -------- --------- --------- -------- ------- -------',
  '  -4.000  -0.0121   0.00821   0.00295  -0.0912  0.6512  0.2011',
  '  -2.000   0.2118   0.00755   0.00241  -0.0928  0.6011  0.2544',
  '   0.000   0.4361   0.00731   0.00218  -0.0941  0.5433  0.3122',
  '   2.000   0.6598   0.00752   0.00236  -0.0950  0.4712  0.3901',
  '   4.000   0.8811   0.00821   0.00301  -0.0955  0.3855  0.4899',
  '   6.000   1.0977   0.00949   0.00426  -0.0952  0.2901  0.6011',
  '   8.000   1.3021   0.01184   0.00655  -0.0931  0.1855  0.7122',
  '  10.000   1.4655   0.01655   0.01118  -0.0872  0.0912  0.8011',
].join('\n');

/**
 * A line table in the shape production sheets use: material blocks, a shared
 * length covering two names, four anchor rows on three risers, and cascade
 * totals sitting in columns beside the inventory — including on the material
 * and header rows, which is where a naive reader loses half of them.
 *
 * Row A: anchors 1,2 hang from AM1 and 3,4 from AM2, both off AR1, with a
 * 500 mm riser. Totals are built to be exactly consistent with that.
 */
const SAMPLE_LINES = [
  'LIN-8001-050-BLUE\t\t\t\t\t\t\t1\t4520\t4510\t4530\t4560',
  'Name\tNo.\tSewn\tAdjusted\tProd adj.\tComment\t\t2\t4500\t4490\t4505\t4535',
  'A1\t2\t520\t\t\t\t\t3\t4500\t4470',
  'A2\t2\t500\t\t\t\t\t4\t4480\t4450',
  'A3\t2\t480',
  'A4\t2\t460',
  'B1\t2\t510',
  'B2\t2\t490',
  'B3\t2\t470',
  'B4\t2\t450',
  'C1\t2\t530',
  'C2\t2\t505',
  'C12, K6\t4\t422',
  'D1\t2\t540',
  'D2\t2\t515',
  'LIN-8001-090-ORANGE',
  'Name\tNo.\tSewn\tAdjusted\tProd adj.\tComment',
  'AM1\t2\t1500',
  'AM2\t2\t1520',
  'BM1\t2\t1490',
  'CM1\t2\t1510',
  'DM1\t2\t1530',
  'AR1\t2\t2000',
  'BR1\t2\t2010',
  'CR1\t2\t1990',
].join('\n');


let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name}  ${detail}`); }
}

function near(name, actual, expected, tol, unit = '') {
  const ok = Math.abs(actual - expected) <= tol;
  check(name, ok, ok ? '' : `got ${actual}${unit}, expected ${expected}±${tol}${unit}`);
}

function section(title) { console.log(`\n${title}`); }

/**
 * Assert that a reported number actually responds to the thing it claims to
 * measure.
 *
 * The panel distortion measure passed every test in this suite for months
 * while being incapable of returning anything but zero: it compared a length
 * the unrolling preserves by construction. A one-sided check — "is the
 * distortion small?" — is satisfied perfectly by a metric that is always
 * zero, and so is "is the utilisation a fraction?" and most of the other
 * sanity assertions here.
 *
 * So each metric that is meant to vary gets checked that it does, by a
 * meaningful amount, in the expected direction. A metric that cannot move is
 * not measuring anything, whatever its value looks like.
 */
function responds(name, fn, a, b, { minChange = 0.02, direction = null } = {}) {
  let va;
  let vb;
  try { va = fn(a); vb = fn(b); } catch (e) {
    check(name, false, `threw: ${e.message}`);
    return;
  }
  if (!Number.isFinite(va) || !Number.isFinite(vb)) {
    check(name, false, `non-finite: ${va}, ${vb}`);
    return;
  }
  const scale = Math.max(Math.abs(va), Math.abs(vb), 1e-12);
  const rel = Math.abs(vb - va) / scale;
  const moved = rel >= minChange;
  const rightWay = direction === null
    || (direction > 0 ? vb > va : vb < va);
  check(name, moved && rightWay,
    `${va.toPrecision(4)} -> ${vb.toPrecision(4)} (${(rel * 100).toFixed(1)}%`
    + `${direction !== null && !rightWay ? ', wrong direction' : ''})`);
}

// ---------------------------------------------------------------------------
section('Chapter 1 — planform');

{
  // A rectangular planform is the one case with an exact area and AR.
  const rect = analyticPlanform({
    span: 10,
    le: { a: 5, b: 0, k: 0, x0: 0 },
    te: { a: 5, b: 0, k: 0, x0: 2 },
  });
  near('rectangle: area = span x chord', flatArea(rect), 20, 1e-9, ' m2');
  near('rectangle: AR = span^2/area', planformMetrics(rect).aspectRatio, 5, 1e-9);
  near('rectangle: MAC = chord', planformMetrics(rect).mac, 2, 1e-9, ' m');
  near('rectangle: centroid at mid chord', planformMetrics(rect).centroidX, 1, 1e-9, ' m');

  // A pure half-ellipse chord distribution integrates to pi/4 * span * rootChord.
  const ell = analyticPlanform({
    span: 10,
    le: { a: 5, b: 0, k: 0, x0: 0 },
    te: { a: 5, b: -2, k: 0, x0: 0 },
  });
  near('ellipse: area = (pi/4) b c0', flatArea(ell), (Math.PI / 4) * 10 * 2, 2e-3, ' m2');

  const p = planformFromDesignInputs({ span: 10.25, rootChord: 2.6, tipChord: 0.9, tipSweep: 1.1 });
  near('design inputs: root chord honoured', p.chord(0), 2.6, 1e-9, ' m');
  near('design inputs: tip chord honoured', p.chord(p.halfSpan), 0.9, 1e-9, ' m');
  near('design inputs: tip sweep honoured', p.xLE(p.halfSpan), 1.1, 1e-9, ' m');
  check('design inputs: chord decreases outboard', p.chord(1) > p.chord(4));

  const st = ribStations(p, 24);
  check('rib stations: centre rib at y=0', st[0] === 0);
  near('rib stations: tip rib at half span', st[24], p.halfSpan, 1e-12, ' m');
  check('rib stations: monotonic', st.every((v, i) => i === 0 || v > st[i - 1]));
}

// ---------------------------------------------------------------------------
section('Chapter 2 — airfoils');

{
  const af = naca4('4415');
  const m = airfoilMetrics(af);
  // Thickness is applied perpendicular to the camber line, so measuring it
  // vertically — which is what a chord-referenced number like the handbook's
  // Table 2.1 means — reads slightly high on a cambered section. About 0.1%
  // relative on a 4% camber, so the tolerance is set just above that rather
  // than left loose enough to hide a real error.
  near('NACA 4415: max thickness 15%', m.maxThickness, 0.15, 5e-4);
  near('NACA 4415: max camber 4%', m.maxCamber, 0.04, 5e-4);
  near('NACA 4415: camber at 40%', m.maxCamberAt, 0.40, 0.01);

  const sym = naca4('0012');
  near('NACA 0012: symmetric, zero camber', Math.abs(airfoilMetrics(sym).maxCamber), 0, 1e-6);
  // No camber, so the vertical measurement is the true thickness exactly.
  near('NACA 0012: thickness 12%', airfoilMetrics(sym).maxThickness, 0.12, 5e-5);
  check('cambered sections read slightly thicker vertically than nominal',
    m.maxThickness > 0.15 && m.maxThickness < 0.1505);

  check('invalid NACA code is rejected', (() => {
    try { naca4('44'); return false; } catch { return true; }
  })());

  const { upper, lower } = splitSurfaces(af);
  check('surfaces run LE to TE', upper[0][0] < 1e-6 && upper[upper.length - 1][0] > 0.99);
  check('lower surface starts at LE', lower[0][0] < 1e-6);

  const rs = resampleSurface(upper, 40);
  check('resample: point count', rs.length === 40);
  near('resample: endpoints preserved', rs[39][0], upper[upper.length - 1][0], 1e-9);

  // Trailing edge. The default closes it, because the trailing edge of a
  // paraglider is sewn shut and the two panels have to meet there.
  for (const code of ['4415', '2412', '0012']) {
    const c = naca4(code);
    const s2 = splitSurfaces(c);
    const u = s2.upper[s2.upper.length - 1];
    const l = s2.lower[s2.lower.length - 1];
    near(`NACA ${code}: trailing edge closed`, Math.hypot(u[0] - l[0], u[1] - l[1]), 0, 1e-9, ' chord');
  }

  // The open form is still available for comparison against published
  // ordinates. The quoted 0.0021 at 20% thickness is a HALF thickness, so the
  // gap is 2*0.0021*(t/0.2). Checked on a symmetric section, where the camber
  // line is flat and the trailing edge is not tilted, so the vertical gap and
  // the true thickness are the same number.
  const open12 = naca4('0012', 80, { closedTrailingEdge: false });
  const o = splitSurfaces(open12);
  const gap12 = Math.abs(o.upper[o.upper.length - 1][1] - o.lower[o.lower.length - 1][1]);
  near('open TE gap = 2 x 0.0021 x (t/0.2)', gap12, 2 * 0.0021 * (0.12 / 0.2), 1e-9, ' chord');
  check('closing the TE is what removes that gap', gap12 > 1e-4);

  // Independent anchor: for NACA 2412 with an open trailing edge, the upper
  // surface point generated at x=1 works out by hand to (1.0000838,
  // 0.0012573) — the camber gradient there is -0.0667, so the half thickness
  // of 0.00126 tips slightly past x=1. A published generator gives the same
  // figures to six decimals, so this pins the equations, not just the code.
  const open2412 = naca4('2412', 80, { closedTrailingEdge: false });
  const teUpper = splitSurfaces(open2412).upper.slice(-1)[0];
  near('NACA 2412 open TE x', teUpper[0], 1.0000838, 2e-6);
  near('NACA 2412 open TE y', teUpper[1], 0.0012573, 2e-6);

  // Import formats. A Lednicer file leads with two counts; read as a
  // coordinate pair those would wreck the normalisation.
  const selig = 'TEST SELIG\n1.0 0.0\n0.5 0.06\n0.0 0.0\n0.5 -0.04\n1.0 0.0\n'
    + Array.from({ length: 8 }, (_, i) => `${(i / 8).toFixed(3)} 0.01`).join('\n');
  check('Selig import works', parseAirfoilText(selig).points.length > 10);

  const led = ['TEST LEDNICER', '  5.  5.',
    '0.0 0.0', '0.25 0.05', '0.5 0.06', '0.75 0.04', '1.0 0.0',
    '0.0 0.0', '0.25 -0.03', '0.5 -0.04', '0.75 -0.02', '1.0 0.0'].join('\n');
  const ledFoil = parseAirfoilText(led);
  const lx = ledFoil.points.map((q) => q[0]);
  check('Lednicer counts are not read as a point',
    Math.max(...lx) <= 1.0001, `max x = ${Math.max(...lx).toFixed(3)}`);
  near('Lednicer import spans unit chord', Math.max(...lx) - Math.min(...lx), 1, 1e-9);
  check('Lednicer import is in Selig order (starts and ends at TE)',
    lx[0] > 0.99 && lx[lx.length - 1] > 0.99);

  // Laboratori d'envol .txt: a name, then single-integer header lines giving
  // the point count and the indices marking the air intake, then Selig-ordered
  // coordinates. Recovering the intake from the header beats guessing it.
  const nUp = 6, nLo = 7;
  const leRows = [
    '1.00000 0.00000', '0.60000 0.05000', '0.30000 0.07000',
    '0.10000 0.05000', '0.02000 0.02000', '0.00000 0.00000',
    '0.00300 -0.01200', '0.01200 -0.02300', '0.05500 -0.04600',
    '0.20000 -0.06000', '0.50000 -0.05000', '0.80000 -0.02000',
    '1.00000 0.00000',
  ];
  // intake runs from row 8 (x=0.012) across 3 points to row 10 — but the
  // marked end is row 9 (x=0.055), so count = 2.
  const leTxt = ['gnuTEST', String(nUp + nLo), '8', '2', '42', ...leRows].join('\n');
  const leFoil = parseAirfoilText(leTxt);
  check('LE .txt: name survives the integer header', leFoil.name === 'gnuTEST');
  check('LE .txt: header integers are not read as points', leFoil.points.length === nUp + nLo);
  check('LE .txt: intake recovered from the header', leFoil.intakeFromFile === true);
  near('LE .txt: intake start', leFoil.intake.start, 0.012, 1e-9, ' chord');
  near('LE .txt: intake end', leFoil.intake.end, 0.055, 1e-9, ' chord');

  // Checked once against the real gnuLAB2 section published by Laboratori
  // d'envol: it imports to 18.00% thickness at 22.0% chord, 2.03% camber at
  // 15.8%, intake 1.20% to 5.50% — against the handbook's Table 2.1 values of
  // 18 / 21.9, 2.03 / 15.7 and 1.2 to 5.5. Not embedded here, since the file
  // belongs to its author; run the importer against it directly to confirm.
}

// ---------------------------------------------------------------------------
section('Chapter 3 — main lobe');

{
  const halfSpan = 5;
  // A circular lobe of radius R laid with arc length s has an exact answer:
  // projected half span R sin(s/R), rise R(1-cos(s/R)), tangent angle s/R.
  const R = 6;
  const lobe = buildLobe({ type: 'circle', radius: R }, halfSpan);
  const tip = lobe.at(halfSpan);
  near('circle lobe: projected y = R sin(s/R)', tip.y, R * Math.sin(halfSpan / R), 1e-4, ' m');
  near('circle lobe: z = -R(1-cos(s/R))', tip.z, -R * (1 - Math.cos(halfSpan / R)), 1e-4, ' m');
  near('circle lobe: tip dihedral = s/R', tip.beta, halfSpan / R, 1e-3, ' rad');
  near('circle lobe: centre is flat', lobe.at(0).beta, 0, 1e-3, ' rad');

  // Arc length must be preserved: that is the whole point of the construction.
  let acc = 0;
  let prev = lobe.at(0);
  for (let i = 1; i <= 200; i++) {
    const q = lobe.at((i / 200) * halfSpan);
    acc += Math.hypot(q.y - prev.y, q.z - prev.z);
    prev = q;
  }
  near('lobe: arc length equals flat half span', acc, halfSpan, 1e-3, ' m');

  const rr = radiusForProjectedRatio(5, 0.88);
  const l2 = buildLobe({ type: 'circle', radius: rr }, 5);
  near('radius solver hits requested projected ratio', l2.at(5).y / 5, 0.88, 1e-6);

  const em = lobeMetrics(buildLobe({ type: 'ellipse', a: 4.4, b: 2.1 }, halfSpan), halfSpan);
  check('ellipse lobe: projected span < flat span', em.projectedSpan < 2 * halfSpan);
  check('ellipse lobe: has positive arrow', em.arrow > 0);

  // Semi-axes given as ratios of the half span must scale with the wing.
  // Absolute axes do not, which is a trap: lengthen the span and the arc is
  // suddenly too short to carry it, and the model stops building.
  const shapeAt = (hs) => {
    const l = buildLobe({ type: 'ellipse', aRatio: 0.88, bRatio: 0.45 }, hs);
    const m = lobeMetrics(l, hs);
    return { ratio: m.spanRatio, tip: m.tipDihedralDeg };
  };
  const s1 = shapeAt(4);
  const s2 = shapeAt(9);
  near('ratio-defined arc keeps its span ratio at any size', s1.ratio, s2.ratio, 1e-6);
  near('ratio-defined arc keeps its tip dihedral at any size', s1.tip, s2.tip, 1e-3, ' deg');
  check('absolute axes do NOT scale — the trap this replaces', (() => {
    try { buildLobe({ type: 'ellipse', a: 4.5, b: 2.1 }, 6.75); return false; } catch { return true; }
  })());

  // The arrow has a floor: below it the arc is shorter than the flat half
  // span and cannot be built at all.
  const minB = minArrowRatio(0.88);
  check('minimum arrow ratio is a sane fraction', minB > 0.05 && minB < 1.5, `got ${minB.toFixed(3)}`);
  check('just above the floor builds', (() => {
    try { buildLobe({ type: 'ellipse', aRatio: 0.88, bRatio: minB * 1.02 }, 5); return true; } catch { return false; }
  })());
  check('just below the floor is rejected', (() => {
    try { buildLobe({ type: 'ellipse', aRatio: 0.88, bRatio: minB * 0.9 }, 5); return false; } catch { return true; }
  })());
  check('the rejection says what to change', (() => {
    try { buildLobe({ type: 'ellipse', aRatio: 0.88, bRatio: 0.01 }, 5); return false; }
    catch (e) { return /arrow/i.test(e.message) && /half span/i.test(e.message); }
  })());
}

// ---------------------------------------------------------------------------
section('3D rotations and flow alignment (2021 study)');

{
  // The author's 2021 study adds a third rotation, about the global vertical,
  // to bring each rib's plane onto the glide path. Its worked example is a
  // teaching wing at alpha = 11.31 deg whose tip rib has 30 deg of washin and
  // has been laid fully horizontal (beta = 90 deg). The published lep-out.txt
  // reports, for that tip rib: phi 11.31 / chi 31.87 without the Z rotation,
  // and phi 0.00 / chi 30.00 with it. Both are reproduced here from the built
  // geometry, which exercises the whole placement chain rather than the angle
  // formulas alone.
  const ALPHA = 11.31;
  const flat = _ap({ span: 2, le: { a: 1, b: 0, k: 0, x0: 0 }, te: { a: 1, b: 0, k: 0, x0: 1 } });
  const lobe90 = { at(s) { return { y: s, z: 0, beta: (Math.PI / 2) * s }; } };

  const build = (zRotation) => buildWing({
    planform: flat, lobe: lobe90, airfoil: naca4('0012'),
    cells: 1, RL: 0, RP: 0, pointsPerSurface: 30, distribution: 'uniform',
    washin: { total: 30, mode: 'linear' }, zRotation, alphaDeg: ALPHA,
  });

  const m1 = build('none');
  near('no Z: centre rib lies on the glide path (phi=0)', m1.ribs[0].phiDeg, 0, 0.01, ' deg');
  near('no Z: centre rib local AoA = alpha', m1.ribs[0].chiDeg, ALPHA, 0.01, ' deg');
  near('no Z: horizontal tip rib has phi = alpha', m1.ribs[1].phiDeg, 11.31, 0.02, ' deg');
  near('no Z: horizontal tip rib local AoA', m1.ribs[1].chiDeg, 31.87, 0.02, ' deg');

  const m2 = build('auto');
  near('auto Z: tip rib brought onto the glide path', m2.ribs[1].phiDeg, 0, 0.02, ' deg');
  near('auto Z: tip rib local AoA', m2.ribs[1].chiDeg, 30.00, 0.02, ' deg');
  near('auto Z: required yaw equals the misalignment it removes',
    m2.ribs[1].zetaDeg, 11.31, 0.02, ' deg');
  near('auto Z: centre rib needs no yaw', m2.ribs[0].zetaDeg, 0, 1e-9, ' deg');

  // The study requires that Z = 0 reproduce the older two-rotation model
  // exactly, so adding the third rotation cannot disturb existing designs.
  const a = demoWing();
  const b = buildWing({
    planform: a.planform,
    lobe: buildLobe({ type: 'circle', projectedRatio: 0.88 }, a.planform.halfSpan),
    airfoil: naca4('4415'), cells: 12, pointsPerSurface: 40, zRotation: 'none',
  });
  let maxDiff = 0;
  for (let i = 0; i < a.ribs.length; i++) {
    for (let k = 0; k < a.ribs[i].upper.length; k++) {
      for (let c = 0; c < 3; c++) {
        maxDiff = Math.max(maxDiff, Math.abs(a.ribs[i].upper[k][c] - b.ribs[i].upper[k][c]));
      }
    }
  }
  near('Z=0 reproduces the two-rotation model exactly', maxDiff, 0, 1e-12, ' m');

  // Flow misalignment must grow toward the tip on an arced wing, and the
  // auto mode must remove it everywhere.
  const arc = demoWing();
  check('phi grows outboard', arc.ribs[arc.ribs.length - 1].phiDeg > arc.ribs[1].phiDeg);
  const arcZ = buildWing({
    planform: arc.planform,
    lobe: buildLobe({ type: 'circle', projectedRatio: 0.88 }, arc.planform.halfSpan),
    airfoil: naca4('4415'), cells: 12, pointsPerSurface: 40,
    zRotation: 'auto', alphaDeg: 5,
  });
  check('auto Z nulls phi across the whole span',
    arcZ.ribs.every((r) => Math.abs(r.phiDeg) < 0.01),
    `worst ${Math.max(...arcZ.ribs.map((r) => Math.abs(r.phiDeg))).toFixed(3)} deg`);
  check('panels still develop after the Z rotation',
    developWing(arcZ).every((p) => p.panel.left.every((q) => Number.isFinite(q[0]))));
}

// ---------------------------------------------------------------------------
section('Chapter 5 — flat development');

{
  // Exact case 1: a flat rectangular strip. Two identical ribs offset purely
  // in y, with the section replaced by a straight line, must unroll to a
  // rectangle of exactly those dimensions.
  const N = 40;
  const L = [], Rr = [];
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2;      // 2 m chordwise
    L.push([x, 0, 0]);
    Rr.push([x, 0.3, 0]);             // 0.3 m apart
  }
  const flat = developPanel(L, Rr);
  const width = Math.hypot(flat.right[0][0] - flat.left[0][0], flat.right[0][1] - flat.left[0][1]);
  near('flat strip: width preserved', width, 0.3, 1e-9, ' m');
  near('flat strip: left seam length preserved', flat.seamLengths.left, 2, 1e-9, ' m');
  near('flat strip: no distortion', developmentError(L, Rr).worstRelative, 0, 1e-12);

  // Exact case 2: a cylinder. Two ribs on a circular arc, offset in y.
  // A cylinder is developable, so the unrolled panel must be an exact
  // rectangle: width = rib spacing, length = arc length of the section.
  const Lc = [], Rc = [];
  const rad = 1.5;
  let arcLen = 0;
  let prev = null;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * 1.2;
    const px = rad * Math.sin(t);
    const pz = rad * (1 - Math.cos(t));
    Lc.push([px, 0, pz]);
    Rc.push([px, 0.4, pz]);
    if (prev) arcLen += Math.hypot(px - prev[0], pz - prev[1]);
    prev = [px, pz];
  }
  const cyl = developPanel(Lc, Rc);
  near('cylinder: seam length = arc length', cyl.seamLengths.left, arcLen, 1e-9, ' m');
  near('cylinder: both seams equal', cyl.seamLengths.left, cyl.seamLengths.right, 1e-9, ' m');
  const cw = Math.hypot(cyl.right[10][0] - cyl.left[10][0], cyl.right[10][1] - cyl.left[10][1]);
  near('cylinder: width constant along panel', cw, 0.4, 1e-9, ' m');
  near('cylinder: developable, zero error', developmentError(Lc, Rc).worstRelative, 0, 1e-12);

  // Exact case 3: a cone. Also developable, so error must vanish.
  const Lk = [], Rk = [];
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * Math.PI * 0.5;
    Lk.push([Math.cos(t) * 1.0, 0, Math.sin(t) * 1.0]);
    Rk.push([Math.cos(t) * 0.6, 0.5, Math.sin(t) * 0.6]);
  }
  near('cone: developable, near-zero error', developmentError(Lk, Rk).worstRelative, 0, 1e-9);

  // The distortion measure has to be able to report something.
  //
  // An earlier version compared the diagonal |L1 R2| before and after
  // flattening — but that diagonal is one of the five lengths the
  // construction preserves exactly, so the comparison was tautological. It
  // returned machine precision on every wing at every rib spacing, including
  // surfaces that are plainly not developable, and the loose tolerances here
  // were satisfied by a number that could not move. The quantity actually
  // sacrificed is the fourth side, |L2 R2|.
  //
  // So the check is two-sided: exactly zero where the surface really is
  // developable, and non-zero where it is not.
  const twisted = [];
  const straight = [];
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    straight.push([t, 0, 0]);
    // A ruled surface with the far edge twisting out of plane — the standard
    // example of a ruled surface that is not developable.
    twisted.push([t, 0.4, 0.35 * t * t]);
  }
  const twistErr = developmentError(straight, twisted);
  check('a non-developable surface reports real distortion',
    twistErr.worstRelative > 1e-6,
    `${(twistErr.worstRelative * 100).toFixed(4)}%`);
  check('while a cylinder reports exactly zero',
    developmentError(Lc, Rc).worstRelative === 0);
  check('and the measure grows with how non-developable the surface is', (() => {
    const mild = [];
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      mild.push([t, 0.4, 0.05 * t * t]);
    }
    return developmentError(straight, mild).worstRelative
      < developmentError(straight, twisted).worstRelative;
  })());
  check('the distortion is also reported in metres',
    Number.isFinite(twistErr.worstAbsoluteM) && twistErr.worstAbsoluteM > 0);

  // Seam lengths are preserved exactly by construction, for any input.
  const wing = demoWing();
  const panels = developWing(wing);
  // The method hinges every step on the left rib, so the left seam is exact
  // and the right seam is only approximate. Both are asserted at the level
  // the algorithm actually guarantees.
  let worstLeft = 0;
  let worstRight = 0;
  let worstGap = 0;
  for (const p of panels) {
    worstLeft = Math.max(worstLeft, Math.abs(p.panel.seamLengths.left - p.panel.seamLengths.leftSource));
    worstRight = Math.max(worstRight, Math.abs(p.panel.seamLengths.right - p.panel.seamLengths.rightSource));
    worstGap = Math.max(worstGap, p.panel.maxClosureGap);
  }
  near('real wing: left seam preserved exactly', worstLeft, 0, 1e-12, ' m');
  near('real wing: right seam within a hundredth of a mm', worstRight, 0, 1e-5, ' m');
  near('real wing: seam closure gap under 0.1 mm', worstGap, 0, 1e-4, ' m');
  check('real wing: two panels per cell', panels.length === (wing.ribs.length - 1) * 2);
}

// ---------------------------------------------------------------------------
section('Chapter 6 — ovalization');

{
  // Half circle: arc length pi*R over chord 2R gives alpha = pi exactly.
  const a = solveArc(Math.PI, 2);
  near('semicircle: alpha = pi', a.alpha, Math.PI, 1e-6, ' rad');
  near('semicircle: R = 1', a.R, 1, 1e-6, ' m');
  near('semicircle: sagitta = R', a.f, 1, 1e-6, ' m');

  // The handbook's quoted figure: panels about 6% wider than flight width.
  const s = solveArc(1.06, 1.0);
  check('6% widening gives a shallow arc', s.alpha > 0 && s.alpha < 1.5);
  near('6% widening: sagitta about 15% of width', s.f / 1.0, 0.149, 0.01);

  near('widening profile: zero at LE', wideningProfile(0, { fromLE: 0.1, fromTE: 0.15 }), 0, 1e-12);
  near('widening profile: zero at TE', wideningProfile(1, { fromLE: 0.1, fromTE: 0.15 }), 0, 1e-12);
  near('widening profile: full at mid panel', wideningProfile(0.5, { fromLE: 0.1, fromTE: 0.15 }), 1, 1e-12);
  near('widening profile: half way up ramp', wideningProfile(0.05, { fromLE: 0.1, fromTE: 0.15 }), 0.5, 1e-12);

  const wing = demoWing();
  const panels = developWing(wing);
  const before = panels[0].panel;
  const after = applyOvalization(before, { amount: 0.06 });
  const wBefore = Math.hypot(before.right[30][0] - before.left[30][0], before.right[30][1] - before.left[30][1]);
  const wAfter = Math.hypot(after.right[30][0] - after.left[30][0], after.right[30][1] - after.left[30][1]);
  near('ovalization: mid panel widened by 6%', wAfter / wBefore, 1.06, 1e-6);

  const wEndB = Math.hypot(before.right[0][0] - before.left[0][0], before.right[0][1] - before.left[0][1]);
  const wEndA = Math.hypot(after.right[0][0] - after.left[0][0], after.right[0][1] - after.left[0][1]);
  near('ovalization: LE width untouched', wEndA / wEndB, 1, 1e-9);
}

// ---------------------------------------------------------------------------
section('Chapter 4 — longitudinal equilibrium (handbook 4.4 worked example)');

{
  // Every number below is printed in the handbook's own spreadsheet.
  const r = solveEquilibrium({ legacySpreadsheet: true });

  near('aspect ratio', r.aspectRatio, 4.09, 0.005);
  near('total drag coefficient CxT', r.cxTotal, 0.114, 5e-4);
  near('induced drag Cxi', r.cxi, 0.070, 5e-4);
  near('glide angle gamma', r.gammaDeg, 11.45, 0.05, ' deg');
  near('chord angle theta', r.thetaDeg, 6.45, 0.05, ' deg');
  near('dynamic pressure q0', r.q0, 1455.1, 2);
  near('speed', r.speedMS, 10.09, 0.02, ' m/s');
  near('speed in km/h', r.speedKMH, 36.33, 0.1, ' km/h');
  near('glide ratio', r.glideRatio, 4.94, 0.03);
  near('centre of pressure fraction', r.xcpFraction, 0.296, 1e-3);
  near('centre of pressure position', r.cpMetres, 0.889, 2e-3, ' m');

  // Drag split, as percentages of total.
  near('drag split: induced', r.dragBreakdown.induced * 100, 61.59, 0.4, '%');
  near('drag split: pilot', r.dragBreakdown.pilot * 100, 13.18, 0.1, '%');
  near('drag split: lines', r.dragBreakdown.lines * 100, 17.58, 0.1, '%');

  // The calage, and the individual moments the sheet prints.
  near('calage (legacy mode)', r.calageMetres, 0.433, 6e-3, ' m');
  near('calage fraction (legacy mode)', r.calageFraction, 0.144, 2e-3);

  // Line weight is absent from the 2012 chapter but listed among the acting
  // forces in the author's 2020 revisit. It defaults to zero so the worked
  // example is untouched, and behaves sensibly when supplied.
  near('line mass defaults to zero, example unaffected', r.totalMass, 85, 1e-9, ' kg');
  const withLines = solveEquilibrium({ legacySpreadsheet: true, lineMass: 0.5 });
  near('line mass enters the total', withLines.totalMass, 85.5, 1e-9, ' kg');
  check('line mass raises the flying speed', withLines.speedMS > r.speedMS);
  near('line mass leaves glide ratio alone', withLines.glideRatio, r.glideRatio, 1e-9);
  check('line weight appears as its own moment', Math.abs(withLines.moments.lineWeight) > 0);
  near('balance still closes with line weight',
    solveEquilibrium({ lineMass: 0.5 }).momentResidual, 0, 1e-6);
  near('moment: resultant aero', r.moments.resultantAero, -725.02, 2);
  near('moment: lines', r.moments.lines, -59.08, 1);
  near('moment: pilot drag', r.moments.pilotDrag, -131.29, 1);
  near('moment: pilot weight', r.moments.pilotWeight, 866.82, 2);
  near('moment: wing weight', r.moments.wingWeight, 48.74, 0.1);
  near('moment sum is zero', r.momentResidual, 0, 0.5);

  // The simplified graphical method (4.5) is pure geometry and ignores the
  // line and pilot drag moments, so it must land forward of the full solve.
  const simp = simplifiedCalage({
    glideRatio: r.glideRatio, alphaDeg: 5, chord: 3.0,
    lineLength: 6.0, xcpFraction: r.xcpFraction,
  });
  near('simplified method: sigma = delta - L sin(theta)',
    simp.calageMetres, r.cpMetres - 6.0 * Math.sin((r.thetaDeg * Math.PI) / 180), 1e-9, ' m');
  check('simplified calage sits forward of the full solve',
    simp.calageMetres < r.calageMetres, `simplified ${simp.calageMetres.toFixed(3)} m vs full ${r.calageMetres.toFixed(3)} m`);
  check('simplified calage is still behind the leading edge', simp.calageMetres > 0);

  // 3D lift factor: the sheet prints 0.624, which needs e ~ 0.80.
  near('3D lift factor at e=0.80', lift3DFactor(4.09, 0.80), 0.6215, 5e-3);
  near('3D lift factor at e=0.90', lift3DFactor(4.09, 0.90), 0.6481, 5e-3);

  // The full published equations move the calage aft of the legacy value,
  // because they restore the aerodynamic moment and the wing-drag moment.
  const full = solveEquilibrium({ legacySpreadsheet: false });
  check('full mode: calage further aft than legacy', full.calageMetres > r.calageMetres);
  check('full mode: moment sum still balances', Math.abs(full.momentResidual) < 1e-6);

  // Physical sanity: heavier pilot flies faster.
  const heavy = solveEquilibrium({ pilotMass: 100 });
  const light = solveEquilibrium({ pilotMass: 60 });
  check('heavier wing loading flies faster', heavy.speedMS > light.speedMS);
  near('glide ratio independent of mass', heavy.glideRatio, light.glideRatio, 1e-9);
}

// ---------------------------------------------------------------------------
section('Chapter 8 — lines');

{
  const wing = demoWing();
  const af = naca4('4415');
  const anchors = canopyAnchors(wing, af, { everyNthRib: 2 });
  check('anchors generated on four rows', new Set(anchors.map((a) => a.row)).size === 4);

  // Case 0 centroid of a symmetric pair must land exactly between them.
  const pair = [
    { row: 'A', chord: 1, point: [0, 0, 0] },
    { row: 'A', chord: 1, point: [2, 4, 6] },
  ];
  const g0 = centroid(pair, 0);
  check('case 0 centroid is the arithmetic mean', g0[0] === 1 && g0[1] === 2 && g0[2] === 3);

  // Case 1 must pull toward the anchor on the longer chord.
  const uneven = [
    { row: 'A', chord: 1, point: [0, 0, 0] },
    { row: 'A', chord: 3, point: [4, 0, 0] },
  ];
  near('case 1 centroid weighted by chord', centroid(uneven, 1)[0], 3, 1e-12);

  const cascade = buildCascade(anchors, [1.2, 0, -6.0], { mode: 1 });
  check('cascade reaches every anchor', cascade.segments.filter((s) => s.terminal).length === anchors.length);
  check('cascade has positive total length', cascade.totalLength > 0);

  // Every branch must lie on the segment from its parent toward the centroid.
  const lvl0 = cascade.segments.filter((s) => s.level === 0);
  check('level 0 has one segment per row', lvl0.length === 4);
}

// ---------------------------------------------------------------------------
section('LEparagliding file interoperability');

{
  const lep = sampleLepFile();

  // The format has 37 sections; this project models four of them. A round
  // trip must therefore be byte-exact, or importing a real design would
  // quietly destroy its rib holes, nylon rods and colour cuts.
  const doc = parseLep(lep);
  check('round trip is byte-identical', writeLep(doc) === lep);
  check('all sections are found',
    doc.sections.map((x) => x.number).join(',') === '1,2,3,4,8,21',
    doc.sections.map((x) => x.number).join(','));

  const g = readGeometry(doc);
  check('brand and name are unquoted', g.brand === 'Test Lab' && g.wingName === 'test-wing');
  // Counts are whole-wing while the matrix is one half: 8 cells, 9 ribs,
  // 5 rows. Reading the count as the row count is the obvious wrong turn.
  check('whole-wing counts read correctly', g.cells === 8 && g.ribCount === 9);
  check('half-wing matrix rows', g.ribs.length === 5 && g.halfCells === 4);
  check('centre rib detected', g.centreRib === true);

  const des = lepToDesign(doc);
  // Units are centimetres and the wing scale multiplies everything.
  near('cm converted to m, wing scale applied', des.explicitRibs[4].station, 4.0 * 2.0, 1e-9, ' m');
  near('root chord', des.rootChord, 2.0 * 2.0, 1e-9, ' m');
  // LEP's Z grows downward toward the pilot; ours grows up.
  check('vertical axis is flipped on import', des.explicitRibs[4].lobePoint[1] < 0,
    `got ${des.explicitRibs[4].lobePoint[1]}`);
  near('projected span from xp column', des.projectedSpan, 2 * 3.5 * 2.0, 1e-9, ' m');
  near('section 8 line length', readAoA(doc).lineLengthCm, 650, 1e-9, ' cm');

  // Per-rib incidence, dihedral and yaw must be reproduced, not re-derived:
  // the file's wing is the wing.
  const planform = discretePlanform(des.planformRows);
  const w = buildWing({
    planform, airfoil: naca4('4415'), explicitRibs: des.explicitRibs,
    pointsPerSurface: 30, alphaDeg: 6,
  });
  check('imported wing is flagged as such', w.imported === true);
  near('rib dihedral taken from the file', w.ribs[4].betaDeg, 40, 1e-9, ' deg');
  near('rib yaw taken from the file', w.ribs[4].zetaDeg, 2.5, 1e-9, ' deg');
  near('rib washin taken from the file', w.ribs[4].alphaDeg, 4, 1e-9, ' deg');
  check('imported wing develops into panels', developWing(w).length === 8);

  // Export, then read back.
  const out = applyDesignToLep(doc, { wing: w, airfoil: naca4('4415'), name: 'test-wing' });
  const text2 = writeLep(out);
  const des2 = lepToDesign(parseLep(text2));

  let drift = 0;
  for (let i = 0; i < des.explicitRibs.length; i++) {
    for (const k of ['station', 'chord', 'xLE', 'betaDeg', 'zetaDeg', 'washinDeg']) {
      drift = Math.max(drift, Math.abs(des.explicitRibs[i][k] - des2.explicitRibs[i][k]));
    }
  }
  // The matrix is written to two decimals in centimetres, so 0.1 mm is the
  // format's own resolution — not an error, but worth pinning.
  check('geometry survives a full round trip to 0.1 mm', drift <= 1.01e-4,
    `worst drift ${drift.toExponential(2)}`);

  // The sections this project does not model must come back untouched.
  const body = (t, n) => {
    const d = parseLep(t);
    const sec = lepSection(d, n);
    return d.lines.slice(sec.start, sec.end).join('\n');
  };
  for (const n of [4, 21]) {
    check(`section ${n} preserved verbatim through a round trip`, body(lep, n) === body(text2, n));
  }

  // Writing from scratch, with no imported file to use as a template.
  const blank = blankLepDocument(12);
  check('blank template covers every section up to 37',
    blank.sections.map((x) => x.number).includes(37) && blank.sections.length >= 30);
  check('blank template round-trips', writeLep(parseLep(writeLep(blank))) === writeLep(blank));

  const scratchWing = demoWing();
  const scratch = designToLep({
    wing: scratchWing, airfoil: naca4('4415'), name: 'from-scratch',
    balance: solveEquilibrium({}),
  });
  const sd = describeLep(parseLep(scratch));
  check('file written from scratch reads back', sd.name === 'from-scratch');
  check('counts are whole-wing on write',
    sd.ribs === scratchWing.ribs.length * 2 - 1 && sd.cells === (scratchWing.ribs.length - 1) * 2,
    `ribs ${sd.ribs}, cells ${sd.cells}`);
  near('span survives the write', sd.flatSpan, 10.25, 2e-3, ' m');

  // Malformed input must fail loudly rather than produce a plausible wing.
  check('a non-LEP file is rejected', (() => {
    try { parseLep('hello\nworld\n'); return false; } catch { return true; }
  })());
  check('a truncated matrix is rejected', (() => {
    try { readGeometry(parseLep(lep.replace(/^ 5 .*$/m, ''))); return false; } catch { return true; }
  })());
}

// ---------------------------------------------------------------------------
section('Operating environment — U.S. Standard Atmosphere 1976');

{
  // Layer base pressures are derived by integrating upward, not transcribed,
  // so checking them against the published table tests the integration rather
  // than the typing.
  const published = [101325, 22632.06, 5474.889, 868.0187, 110.9063, 66.93887, 3.956420];
  for (let i = 0; i < published.length; i++) {
    const rel = Math.abs(LAYER_TABLE[i].P - published[i]) / published[i];
    check(`layer ${i} base pressure at ${(LAYER_TABLE[i].H / 1000).toFixed(0)} km'`,
      rel < 1e-5, `got ${LAYER_TABLE[i].P.toPrecision(7)}, published ${published[i]}`);
  }

  const sl = atmosphere(0);
  near('sea level temperature', sl.temperature, 288.15, 1e-9, ' K');
  near('sea level pressure', sl.pressure, 101325, 1e-6, ' Pa');
  near('sea level density', sl.density, 1.225, 1e-4, ' kg/m3');
  near('sea level speed of sound', sl.speedOfSound, 340.294, 0.01, ' m/s');
  near('sea level viscosity', sl.dynamicViscosity, 1.7894e-5, 2e-8, ' Pa s');
  near('sea level mean free path', sl.meanFreePath * 1e9, 66.3, 0.5, ' nm');

  // Published states, by geometric altitude. Getting the geopotential
  // conversion wrong shows up here: it is worth 400 m at 50 km, which moves
  // the pressure by more than a percent.
  const table = [
    [11019, 216.65, 22632, 0.363918],
    [20063, 216.65, 5474.9, 0.0880349],
    [30000, 226.509, 1197.03, 0.0184101],
    [40000, 250.350, 287.144, 0.00399570],
    [50000, 270.650, 79.7779, 0.00102690],
  ];
  for (const [z, T, P, rho] of table) {
    const a = atmosphere(z);
    near(`T at ${(z / 1000).toFixed(0)} km`, a.temperature, T, 0.01, ' K');
    check(`P at ${(z / 1000).toFixed(0)} km`, Math.abs(a.pressure - P) / P < 5e-4,
      `got ${a.pressure.toPrecision(6)}, published ${P}`);
    check(`rho at ${(z / 1000).toFixed(0)} km`, Math.abs(a.density - rho) / rho < 5e-4,
      `got ${a.density.toPrecision(6)}, published ${rho}`);
  }

  check('geopotential is below geometric', geopotential(50000) < 50000);
  near('geopotential correction at 50 km', 50000 - geopotential(50000), 390, 10, ' m');
  check('below the model floor is rejected', (() => {
    try { atmosphere(-6000); return false; } catch { return true; }
  })());
  check('above 86 km is rejected', (() => {
    try { atmosphere(90000); return false; } catch { return true; }
  })());

  // A temperature offset changes density but must not change pressure: a warm
  // day does not move the pressure at altitude.
  const warm = atmosphere(3000, { deltaISA: 20 });
  const std = atmosphere(3000);
  near('non-standard day leaves pressure alone', warm.pressure, std.pressure, 1e-9, ' Pa');
  check('a warm day is less dense', warm.density < std.density);

  // Non-dimensional groups and the limits of the model.
  const atm50 = atmosphere(50000);
  const V50 = speedForLift({ mass: 85, area: 25, cl: 0.6, atm: atm50 });
  const nd50 = nonDimensional({ speed: V50, chord: 2.5, atm: atm50 });
  check('50 km demands near-sonic flight to stay up', nd50.mach > 0.9,
    `M ${nd50.mach.toFixed(3)} at ${V50.toFixed(0)} m/s`);
  check('and that is flagged', nd50.flags.some((f) => f.level === 'error'));
  const nd0 = nonDimensional({ speed: 10, chord: 2.5, atm: sl });
  check('sea level raises no flags', nd0.flags.length === 0);
  near('equivalent airspeed equals true airspeed at sea level',
    nd0.equivalentAirspeed, nd0.trueAirspeed, 1e-9, ' m/s');
  check('EAS is below TAS at altitude',
    nonDimensional({ speed: 40, chord: 2.5, atm: atmosphere(6000) }).equivalentAirspeed < 40);

  // Required speed scales as 1/sqrt(density).
  const a10 = atmosphere(10000);
  const v0 = speedForLift({ mass: 85, area: 25, cl: 0.6, atm: sl });
  const v10 = speedForLift({ mass: 85, area: 25, cl: 0.6, atm: a10 });
  // V = sqrt(2 m g / (rho S CL)), and g falls with altitude too — by 0.3% at
  // 10 km. So the scaling is sqrt(g/rho), not 1/sqrt(rho); the difference is
  // small but it is real, and the model carries local gravity rather than g0.
  near('speed scales with sqrt(g/rho)', v10 / v0,
    Math.sqrt((a10.gravity / sl.gravity) * (sl.density / a10.density)), 1e-4);
  check('local gravity falls with altitude', a10.gravity < sl.gravity);

  check('a profile is monotonic in density', (() => {
    const p = profile({ from: 0, to: 40000, steps: 20 });
    return p.every((x, i) => i === 0 || x.density < p[i - 1].density);
  })());
}

// ---------------------------------------------------------------------------
section('Aerodynamics');

{
  // Thin-airfoil theory. The standard worked example for NACA 2412 gives
  // alpha_L0 = -2.07 deg and Cm_c/4 = -0.0531; these come out of the camber
  // line taken off the generated section, so a little slack covers the
  // difference between the true camber line and the mean of the surfaces.
  const t2412 = thinAirfoil(naca4('2412'));
  near('NACA 2412 zero-lift angle', t2412.alphaL0Deg, -2.07, 0.08, ' deg');
  near('NACA 2412 quarter-chord moment', t2412.cm0, -0.0531, 0.004);

  const t0012 = thinAirfoil(naca4('0012'));
  near('symmetric section has zero lift at zero alpha', t0012.alphaL0Deg, 0, 1e-6, ' deg');
  near('symmetric section has zero moment', t0012.cm0, 0, 1e-6);

  // Doubling the camber doubles both, because the theory is linear in it.
  const t4412 = thinAirfoil(naca4('4412'));
  near('doubling camber doubles the zero-lift angle', t4412.alphaL0Deg / t2412.alphaL0Deg, 2, 0.02);
  near('doubling camber doubles the moment', t4412.cm0 / t2412.cm0, 2, 0.02);

  // Reflex: the point of it is a positive pitching moment.
  const base = naca4('4412');
  let prevCm = thinAirfoil(base).cm0;
  for (const amt of [0.005, 0.010, 0.015, 0.020]) {
    const r = applyReflex(base, { amount: amt, start: 0.65 });
    const tr = thinAirfoil(r);
    check(`reflex ${(amt * 100).toFixed(1)}% raises Cm`, tr.cm0 > prevCm,
      `${tr.cm0.toFixed(4)} vs ${prevCm.toFixed(4)}`);
    prevCm = tr.cm0;
    // Reflex moves the camber line and leaves the thickness distribution
    // alone, so the section keeps its structural depth. The section is
    // resampled onto a cosine grid on the way through, which moves the
    // measured maximum by a few parts per million — the tolerance is set just
    // above that, not loose enough to hide a real change.
    near(`reflex ${(amt * 100).toFixed(1)}% leaves thickness alone`,
      r.metrics.maxThickness, base.metrics.maxThickness, 1e-4);
  }
  const strong = applyReflex(base, { amount: 0.03, start: 0.85 });
  check('enough reflex turns the moment positive', thinAirfoil(strong).cm0 > 0,
    `Cm0 ${thinAirfoil(strong).cm0.toFixed(4)}`);
  check('reflex leaves the section closed at the trailing edge', (() => {
    const sp = splitSurfaces(strong);
    const u = sp.upper[sp.upper.length - 1];
    const l = sp.lower[sp.lower.length - 1];
    return Math.hypot(u[0] - l[0], u[1] - l[1]) < 1e-6;
  })());
  check('zero reflex is a no-op', applyReflex(base, { amount: 0 }) === base);

  // Lifting line against the exact elliptical result: e = 1 exactly, and
  // CL_alpha = a0 / (1 + a0 / (pi AR)).
  for (const AR of [4, 6, 8, 12]) {
    const span = 10;
    const area = (span * span) / AR;
    const c0 = (4 * area) / (Math.PI * span);
    const ell = analyticPlanform({
      span, le: { a: span / 2, b: 0, k: 0, x0: 0 }, te: { a: span / 2, b: -c0, k: 0, x0: 0 },
    });
    const r = liftingLine({ planform: ell, alphaDeg: 5, N: 30 });
    near(`elliptical AR ${AR}: Oswald factor is exactly 1`, r.e, 1, 1e-5);
    const exact = ((2 * Math.PI) / (1 + 2 / AR)) * rad(5);
    near(`elliptical AR ${AR}: lift matches lifting-line theory`, r.CL, exact, 1e-4);
    near(`elliptical AR ${AR}: induced drag = CL^2/(pi AR)`,
      r.CDi, (exact * exact) / (Math.PI * AR), 1e-6);
  }

  const rect = analyticPlanform({
    span: 10, le: { a: 5, b: 0, k: 0, x0: 0 }, te: { a: 5, b: 0, k: 0, x0: 1.25 },
  });
  const rr = liftingLine({ planform: rect, alphaDeg: 5, N: 30 });
  check('a rectangle is less efficient than an ellipse', rr.e < 1 && rr.e > 0.9,
    `e = ${rr.e.toFixed(4)}`);
  check('span loading peaks at the centre',
    rr.loading[0].cl > rr.loading[rr.loading.length - 1].cl);

  // Washout must unload the tip — the reason it exists.
  const noTwist = liftingLine({ planform: rect, alphaDeg: 6, N: 24 });
  const twisted = liftingLine({ planform: rect, alphaDeg: 6, N: 24, twistAt: (y) => -4 * (y / 5) });
  const tipNo = noTwist.loading[noTwist.loading.length - 1].cl;
  const tipTw = twisted.loading[twisted.loading.length - 1].cl;
  check('washout unloads the tip', tipTw < tipNo, `${tipTw.toFixed(3)} vs ${tipNo.toFixed(3)}`);
  check('washout costs total lift', twisted.CL < noTwist.CL);

  // Drag correlation: friction falls with Reynolds number, thickness adds.
  check('profile drag falls as Reynolds rises',
    profileDrag({ reynolds: 1e6, thickness: 0.15 }) < profileDrag({ reynolds: 1e5, thickness: 0.15 }));
  check('a thicker section has more profile drag',
    profileDrag({ reynolds: 1e6, thickness: 0.20 }) > profileDrag({ reynolds: 1e6, thickness: 0.10 }));

  // Wing polar behaviour with altitude. Glide ratio is a force ratio and
  // barely moves; speed and sink rate rise with thinning air.
  const pf = planformFromDesignInputs({ span: 10.25, rootChord: 2.6, tipChord: 0.9, tipSweep: 1.1 });
  const p0 = wingPolar({ planform: pf, airfoil: naca4('4415'), atm: atmosphere(0), mass: 85, alphaRange: [0, 12], step: 1 });
  const p6 = wingPolar({ planform: pf, airfoil: naca4('4415'), atm: atmosphere(6000), mass: 85, alphaRange: [0, 12], step: 1 });
  check('polar produces a best-glide point', !!p0.bestGlide && p0.bestGlide.glideRatio > 3);
  check('glide ratio is nearly independent of altitude',
    Math.abs(p6.bestGlide.glideRatio / p0.bestGlide.glideRatio - 1) < 0.05);
  check('speed rises with altitude', p6.bestGlide.speed > p0.bestGlide.speed);
  check('sink rate rises with altitude', p6.minSink.sinkRate > p0.minSink.sinkRate);
  check('polar is marked as estimated', p0.source === 'estimated');
  check('induced drag is a real share of the total',
    p0.bestGlide.CDi / p0.bestGlide.CD > 0.1 && p0.bestGlide.CDi / p0.bestGlide.CD < 0.95);
}

// ---------------------------------------------------------------------------
section('XFOIL interoperability');

{
  const af = naca4('4415');
  const dat = airfoilToDat(af, 'NACA 4415');
  check('geometry export names the section', dat.split('\n')[0] === 'NACA_4415');
  check('geometry export has one row per point', dat.trim().split('\n').length === af.points.length + 1);
  check('geometry starts and ends at the trailing edge', (() => {
    const rows = dat.trim().split('\n').slice(1).map((l) => l.trim().split(/\s+/).map(Number));
    return rows[0][0] > 0.99 && rows[rows.length - 1][0] > 0.99;
  })());

  const cmd = commandScript({ reynolds: 1.5e6, mach: 0.031, nCrit: 7, alphaRange: [-4, 14] });
  check('command script sets the viscous Reynolds number', /VISC 1500000/.test(cmd));
  check('command script sets Mach', /MACH 0\.0310/.test(cmd));
  check('command script sets Ncrit', /N 7\.00/.test(cmd));
  check('command script accumulates a polar', /PACC/.test(cmd) && /ASEQ -4\.0 14\.0/.test(cmd));
  check('command script quits', /QUIT/.test(cmd));

  const polar = parsePolar(SAMPLE_POLAR);
  check('polar name is read', polar.name === 'NACA 4415');
  near('polar Reynolds number is read', polar.reynolds, 1.5e6, 1);
  near('polar Mach number is read', polar.mach, 0.03, 1e-9);
  near('polar Ncrit is read', polar.nCrit, 7, 1e-9);
  check('all polar rows are read', polar.points.length === 8);
  check('the dashed rule is not read as data', polar.points.every((p) => Number.isFinite(p.cl)));
  check('zero-lift angle is interpolated, not picked',
    polar.alphaL0Deg > -4 && polar.alphaL0Deg < -3.8, `got ${polar.alphaL0Deg.toFixed(3)}`);
  near('lift slope is near 2 pi', polar.liftSlopePerRad, 2 * Math.PI, 0.3, ' /rad');
  check('polar is marked as measured', polar.source === 'xfoil');

  // A polar computed at the wrong condition loads fine and is wrong, so the
  // mismatch has to be surfaced rather than assumed away.
  check('a mismatched Reynolds number is flagged',
    checkPolarMatch(polar, { reynolds: 4e5, mach: 0.03 }).length > 0);
  check('a matching condition is not flagged',
    checkPolarMatch(polar, { reynolds: 1.5e6, mach: 0.03 }).length === 0);
  check('a mismatched Mach number is flagged',
    checkPolarMatch(polar, { reynolds: 1.5e6, mach: 0.4 }).length > 0);
  check('rubbish is rejected', (() => {
    try { parsePolar('not a polar\n'); return false; } catch { return true; }
  })());

  // A wing polar built on imported section data must say so.
  const pf = planformFromDesignInputs({ span: 10.25, rootChord: 2.6, tipChord: 0.9, tipSweep: 1.1 });
  const wp = wingPolar({
    planform: pf, airfoil: naca4('4415'), atm: atmosphere(1000), mass: 85,
    sectionPolar: polar, alphaRange: [0, 10], step: 1,
  });
  check('wing polar reports its section source', wp.source === 'xfoil');
  check('wing polar on measured data still solves', wp.bestGlide.glideRatio > 3);
}

// ---------------------------------------------------------------------------
section('Line plans');

{
  check('upper line name', JSON.stringify(pick(parseLineName('A1'))) === JSON.stringify({ row: 'A', level: 'upper', index: 1 }));
  check('middle line name', JSON.stringify(pick(parseLineName('AM6'))) === JSON.stringify({ row: 'A', level: 'middle', index: 6 }));
  check('riser line name', JSON.stringify(pick(parseLineName('AR3'))) === JSON.stringify({ row: 'A', level: 'riser', index: 3 }));
  check('split-level name keeps its side', parseLineName('KMU2').side === 'upper' && parseLineName('KRL1').side === 'lower');
  check('brake lines are identified', parseLineName('K7').isBrake === true);
  check('a non-line is rejected', parseLineName('LIN-8001-050') === null);

  const set = parseLineTable(SAMPLE_LINES);
  const sum = summarise(set);
  check('lines are read', set.lines.length === 22 && sum.lineCount === 44, `${set.lines.length} names, ${sum.lineCount} physical lines`);
  check('a shared length splits across its names',
    set.lines.filter((l) => l.lengthMM === 422).length === 2);
  check('materials are carried', sum.materials.length === 2);
  // Rows and risers are not the same thing: four anchor rows on three risers
  // is a normal wing, and assuming one riser per row gets the load split wrong.
  check('anchor rows counted', sum.anchorRows.join('') === 'ABCD');
  check('risers counted separately from rows', sum.riserCount === 3);
  check('a row without its own riser is identified', sum.dependentRows.join('') === 'D');

  // Topology recovered from lengths alone. Anchors sharing a branch leave the
  // same remainder, so the remainders collapse to one value per branch.
  const totalsA = set.totals.map((t) => t.lengths[0]);
  const topo = inferTopology(set, totalsA, 'A');
  check('topology is consistent', topo.consistent);
  check('anchors group into branches', topo.branchCount < topo.anchors,
    `${topo.anchors} anchors -> ${topo.branchCount} branches`);
  check('branches are the expected pairs',
    topo.branches.map((b) => b.anchors.join('')).join('|') === '12|34',
    topo.branches.map((b) => b.anchors.join('')).join('|'));

  const riser = inferRiserLength(set, topo, 'A');
  check('riser length is recovered from the cascade', riser !== null);
  near('recovered riser length', riser.riserLengthMM, 500, 20, ' mm');
  check('it explains every branch', riser.branches === topo.branchCount);

  // Scattered remainders mean the names and lengths disagree — the failure
  // this inference exists to expose.
  const scattered = inferTopology(set, [9000, 8000, 7000, 6000], 'A');
  check('inconsistent data does not silently produce a topology', !scattered.consistent);
}

// ---------------------------------------------------------------------------
section('Line plan generation and reference comparison');

{
  const path = 'data/reference/geo7-MS.tsv';
  if (!existsSync(path)) {
    check('reference line data present', false, `${path} missing`);
  } else {
    const set = parseLineTable(readFileSync(path, 'utf8'));

    // The totals matrix must survive to its final anchor. Toward the tip the
    // shorter rows run out one at a time, so the last row of the matrix often
    // carries a single value — the outermost C anchor with A, B and D already
    // finished. Requiring two values there silently loses it.
    check('totals matrix reaches its final anchor', set.totals.length === 15,
      `${set.totals.length} rows`);

    // Equal remainders are necessary but not sufficient for two anchors to
    // share a branch: two separate branches can come out the same length, and
    // on this wing they do. Branches must serve adjacent anchors.
    const topo = inferTopology(set, set.totals.map((t) => t.lengths[0]), 'A');
    check('branches serve adjacent anchors only',
      topo.branches.every((b) => b.anchors.every((a, i) => i === 0 || a === b.anchors[i - 1] + 1)),
      JSON.stringify(topo.branches.map((b) => b.anchors)));
    check('A row resolves to six branches, matching its six middle lines',
      topo.branchCount === 6 && topo.middleLineCount === 6,
      `${topo.branchCount} branches, ${topo.middleLineCount} middle lines`);

    // Generation.
    const wing = demoWing();
    const plan = buildLinePlan({
      wing, airfoil: naca4('4415'), layout: RISER_LAYOUTS['A/B/C+D'],
      everyNthRib: 2, riserLengthMM: 527, lineLengthM: 6.4,
    });

    check('three risers are built', plan.risers.length === 3);
    check('the C riser carries both C and D', plan.risers[2].rows.join('') === 'CD');
    check('a cascaded row gets no riser-level lines',
      !plan.lines.some((l) => l.row === 'D' && l.level === 'riser'));
    check('every generated name parses back',
      plan.lines.every((l) => parseLineName(l.name) !== null));
    check('all lengths are positive', plan.lines.every((l) => l.lengthMM > 0));

    // Junction placement is calibrated from the production data: on the Geo 7
    // the first junction sits 64% of the way from carabiner to canopy and the
    // second covers 78% of the rest, leaving the upper lines the last 22%.
    // An earlier construction put both junctions barely a third of the way up,
    // which made the upper lines several times longer than any real wing's —
    // the failure this pins down.
    const upper = plan.lines.filter((l) => l.row === 'A' && l.level === 'upper' && !l.direct);
    const meanUpper = upper.reduce((a, l) => a + l.lengthMM, 0) / upper.length;
    check('upper lines are short, as on a real wing',
      meanUpper > 100 && meanUpper < 900, `mean ${meanUpper.toFixed(0)} mm`);

    const riserLines = plan.lines.filter((l) => l.row === 'A' && l.level === 'riser');
    const meanRiser = riserLines.reduce((a, l) => a + l.lengthMM, 0) / riserLines.length;
    check('riser-level lines carry most of the length',
      meanRiser > 2 * meanUpper, `riser ${meanRiser.toFixed(0)} mm vs upper ${meanUpper.toFixed(0)} mm`);

    // Centre lines are longer than tip lines on any arced wing.
    const tA = Object.keys(plan.totals).map(Number).sort((a, b) => a - b)
      .map((k) => plan.totals[k].A).filter(Boolean);
    check('centre lines are longer than tip lines', tA[0] > tA[tA.length - 1]);

    // Comparison against the real wing. This is a different wing, so the
    // useful figure is the shape of the distribution once the overall length
    // offset is removed — not the absolute lengths.
    const cmp = comparePlans(plan.totals, referenceTotals(set));
    check('comparison finds overlapping anchors', cmp.count >= 20, `${cmp.count} anchors`);
    check('generated totals are the right order of magnitude',
      Math.abs(cmp.meanOffsetMM) < 800, `${cmp.meanOffsetMM.toFixed(0)} mm offset`);
    check('trim shape is within a few hundred mm of a real wing',
      cmp.meanShapeMM < 250, `mean shape deviation ${cmp.meanShapeMM.toFixed(0)} mm`);
  }

  // Every reference wing must parse, not only the one used above.
  for (const f of ['geo7-XS', 'geo7-L', 'lyght-MS', 'ultralite5-13', 'ultralite5-25']) {
    const p2 = `data/reference/${f}.tsv`;
    if (!existsSync(p2)) continue;
    const set = parseLineTable(readFileSync(p2, 'utf8'));
    const sm = summarise(set);
    check(`${f} parses`, set.lines.length > 50 && sm.riserRows.length >= 2,
      `${set.lines.length} lines, risers ${sm.riserRows.join('')}`);
  }
}

// ---------------------------------------------------------------------------
section('BGD line tables, and topology inference against ground truth');

{
  const path = 'data/reference/bgd-lynx2-M.tsv';
  if (!existsSync(path)) {
    check('BGD reference table present', false, `${path} missing`);
  } else {
    const t = parseBgdLineTable(readFileSync(path, 'utf8'));

    check('BGD table parses', t.lines.length > 100, `${t.lines.length} lines`);
    check('canopy lines are distinguished from cascade lines',
      t.lines.filter((l) => l.reachesCanopy).length === 73,
      `${t.lines.filter((l) => l.reachesCanopy).length} reach the canopy`);
    check('five rows including brakes',
      [...new Set(t.lines.map((l) => l.row).filter(Boolean))].sort().join('') === 'ABCDK');

    // Two things only this format records.
    near('lengths are quoted at 5 daN pretension', t.meta.pretensionDaN, 5, 1e-9, ' daN');
    check('tabs, knots and loops are already compensated', t.meta.compensated === true);
    check('the loop configuration is recorded', /Loops/i.test(t.meta.loops || ''));

    // Lowercase canopy names. Ozone writes these uppercase, PHI and BGD
    // lowercase; rejecting the lowercase form silently drops every canopy
    // line, which is what happened until this table exposed it.
    const a1 = parseLineName('a1');
    check('a lowercase canopy line decodes', a1 && a1.row === 'A' && a1.level === 'upper');
    check('and its uppercase cascade decodes to the same row',
      parseLineName('AM1').row === 'A' && parseLineName('AM1').level === 'middle');

    const totals = bgdCascadeTotals(t);
    check('every canopy line has a stated path', totals.length === 73);
    check('main rows run three levels, brakes four',
      [...new Set(totals.map((x) => x.depth))].sort().join(',') === '3,4');
    const first = totals.find((x) => x.row === 'A');
    near('a path total is the sum of its named segments',
      first.totalMM, first.lengths.reduce((a, b) => a + b, 0), 1e-9, ' mm');

    // ---------------------------------------------------------------------
    // Ground truth. This format states the cascade; the Ozone sheets do not,
    // so their topology has to be recovered from lengths alone. Running that
    // inference here, where the answer is known, is the only direct check on
    // it available anywhere in this project.
    let exact = 0;
    let rowsTested = 0;
    for (const row of ['A', 'B', 'C', 'D']) {
      const stated = bgdStatedTopology(t, row);
      const paths = totals.filter((x) => x.row === row).sort((a, b) => a.rib - b.rib);
      if (!stated.length || !paths.length) continue;
      rowsTested++;

      const lineSet = {
        lines: t.lines.filter((l) => l.row === row).map((l) => ({
          ...l,
          level: l.reachesCanopy ? 'upper' : (/R\d/.test(l.name) ? 'riser' : 'middle'),
          index: l.reachesCanopy ? paths.findIndex((p) => p.name === l.name) + 1 : l.index,
          quantity: 2,
        })),
      };
      const inferred = inferTopology(lineSet, paths.map((p) => p.totalMM), row, { tolerance: 3 });
      const got = inferred.branches.map((b) => b.anchors.join(','));
      const want = stated.map((sx) => sx.ribs
        .map((r) => paths.findIndex((p) => p.rib === r) + 1).join(','));
      if (JSON.stringify(got) === JSON.stringify(want)) exact++;
    }
    check('inference recovers the stated cascade on every row',
      rowsTested === 4 && exact === 4, `${exact}/${rowsTested} rows exact`);
  }

  // All four Lynx 2 sizes must read.
  for (const sz of ['S', 'M', 'ML', 'L']) {
    const p2 = `data/reference/bgd-lynx2-${sz}.tsv`;
    if (!existsSync(p2)) continue;
    const t2 = parseBgdLineTable(readFileSync(p2, 'utf8'));
    check(`Lynx 2 ${sz} parses`, bgdCascadeTotals(t2).length === 73,
      `${t2.lines.length} lines`);
  }

  // Alpina 5: six sizes of a two-riser wing, C cascaded into B.
  for (const sz of ['XS', 'L', 'XL']) {
    const p3 = `data/reference/alpina5-${sz}.tsv`;
    if (!existsSync(p3)) continue;
    const t3 = parseLineTable(readFileSync(p3, 'utf8'));
    const s3 = summarise(t3);
    check(`Alpina 5 ${sz}: two risers carrying three rows`,
      s3.riserRows.join('') === 'AB' && s3.dependentRows.join('') === 'C',
      `risers ${s3.riserRows.join('')}, cascaded ${s3.dependentRows.join('')}`);
  }
}

// ---------------------------------------------------------------------------
section('Risers, speed system and accelerated flight');

{
  const rs = riserSet({
    rows: ['A', 'B', 'C'], lengthMM: 500, travelMM: 180,
    anchors: { A: 0.09, B: 0.32, C: 0.58 },
  });

  const neutral = riserLengths(rs, 0);
  const full = riserLengths(rs, 1);
  check('at neutral every riser is its full length',
    rs.rows.every((r) => neutral[r] === 500));
  check('the front riser takes all the travel', full.A === 500 - 180);
  check('the rear riser takes none', full.C === 500);
  check('and the middle takes part of it', full.B > full.A && full.B < full.C);

  // The wing rotates nose-down; that is the whole point of the system.
  const da = alphaChange(rs, 1, 2.4);
  check('full bar drops the angle of attack', da < 0, `${da.toFixed(2)} deg`);
  check('and by a physically sensible amount', da > -12 && da < -3, `${da.toFixed(2)} deg`);
  near('no bar means no change', alphaChange(rs, 0, 2.4), 0, 1e-12, ' deg');
  check('a longer chord needs more travel for the same angle',
    Math.abs(alphaChange(rs, 1, 3.2)) < Math.abs(alphaChange(rs, 1, 2.4)));

  // A two-liner rotates on one riser pair.
  const two = riserSet({ rows: ['A', 'B'], lengthMM: 500, travelMM: 180,
    anchors: { A: 0.09, B: 0.55 } });
  check('a two-liner still rotates the wing', alphaChange(two, 1, 2.4) < 0);

  // Brake pulley coupling: the pulley rides a riser, so the bar puts slack in
  // the brakes. On the rearmost riser it does not move, which is why that is
  // where it is usually mounted.
  check('a pulley on the rear riser adds no brake slack',
    brakeSlackUnderBar(rs, 1).extraBrakeTravelMM === 0);
  const onB = riserSet({ ...rs, brakePulleyOn: 'B' });
  check('a pulley on a moving riser does add slack',
    brakeSlackUnderBar(onB, 1).extraBrakeTravelMM === 90,
    `${brakeSlackUnderBar(onB, 1).extraBrakeTravelMM} mm`);
  check('and roving through the pulley doubles it',
    brakeSlackUnderBar(onB, 1, { roving: 2 }).extraBrakeTravelMM === 180);

  // ---------------------------------------------------------------------
  // Validation against BGD's published Lynx 2 M figures: trim 39 km/h,
  // top 58, best glide 11, min sink 1.0 m/s, flown at 85 kg all-up.
  const base = {
    area: 23.0, span: 11.8, chord: 2.4,
    pilotMass: 81.3, wingMass: 3.7, lineMass: 0.35, lineLength: 7.3,
    cxPilot: 0.014, cxLines: 0.010, cx0a: 0.008, oswald: 0.92, rho: 1.225,
    alphaDeg: 6.0, cm: -0.042,
  };
  const czAt = (a) => 0.75 + 0.075 * (a - 6.0);
  const polar = acceleratedPolar({
    riser: rs, base: { ...base, cz: czAt(6.0) }, chordM: 2.4, czAt,
  });

  check('trim speed within 6% of the published figure',
    Math.abs(polar.trimSpeedKMH - 39) / 39 < 0.06,
    `${polar.trimSpeedKMH.toFixed(1)} vs 39 km/h`);
  check('best glide within 10% of the published figure',
    Math.abs(polar.bestGlide.glideRatio - 11) / 11 < 0.10,
    `${polar.bestGlide.glideRatio.toFixed(1)} vs 11`);
  check('minimum sink within 15% of the published figure',
    Math.abs(polar.minSink.sinkMS - 1.0) < 0.15,
    `${polar.minSink.sinkMS.toFixed(2)} vs 1.0 m/s`);

  // The guard. Speed goes as 1/sqrt(Cz), so the polar is most sensitive to
  // the lift coefficient exactly where a linear fit is least trustworthy.
  // Run to the end of the bar this one reaches Cz 0.1 and reports 99 km/h,
  // which no paraglider does.
  check('an extrapolated top speed is flagged, not reported as fact',
    polar.topSpeedTrustworthy === false && polar.topSpeedKMH > 80,
    `bar end ${polar.topSpeedKMH.toFixed(0)} km/h at Cz ${polar.czAtFullBar.toFixed(3)}`);
  check('the fastest supported point is within 6% of the published top speed',
    Math.abs(polar.topValidSpeedKMH - 58) / 58 < 0.06,
    `${polar.topValidSpeedKMH.toFixed(1)} vs 58 km/h`);
  check('and the summary says how much of the range was usable',
    polar.validRows < polar.rows.length && polar.fullyValid === false,
    `${polar.validRows}/${polar.rows.length} rows in range`);

  // Speed rises and glide is best somewhere off the top of the bar.
  check('speed increases with bar',
    polar.rows[polar.rows.length - 1].speedKMH > polar.rows[0].speedKMH);
  check('best glide is not at full bar',
    polar.bestGlide.bar < 1);

  // Back-solving travel from a published top speed, which is the direction
  // the data usually runs: makers quote speeds far more often than travel.
  const t = travelForSpeedRange({
    riser: rs, base: { ...base, cz: czAt(6.0) }, chordM: 2.4, czAt, targetTopKMH: 58,
  });
  check('travel back-solved from the published top speed is plausible',
    t.travelMM > 80 && t.travelMM < 250, `${t.travelMM.toFixed(0)} mm`);
  check('and implies a sensible angle change',
    t.alphaChangeDeg > 3 && t.alphaChangeDeg < 9, `${t.alphaChangeDeg.toFixed(1)} deg`);

  // ---------------------------------------------------------------------
  // The lift curve derived from the wing, rather than fitted by eye.
  const pf = planformFromDesignInputs({
    span: 11.8, rootChord: 2.4, tipChord: 0.55, tipSweep: 1.4,
  });
  const lm = liftModelFromWing({
    planform: pf, airfoil: naca4('4415'), atm: atmosphere(0), mass: 85, area: 23.0,
  });

  check('the lift model comes from the section and the planform',
    lm.source === 'estimated' && lm.aspectRatio > 5.5 && lm.aspectRatio < 6.5,
    `AR ${lm.aspectRatio.toFixed(2)}`);
  check('it knows its own alpha range', lm.alphaRange[0] < 0 && lm.alphaRange[1] > 10);
  check('lift rises with angle of attack', lm.czAt(8) > lm.czAt(2));
  check('and the zero-lift angle is negative for a cambered section',
    lm.alphaL0Deg < 0, `${lm.alphaL0Deg.toFixed(2)} deg`);

  // The floor of the usable range is structural, not aerodynamic. The polar
  // alone gives a Cz range whose bottom is near zero — arithmetically right,
  // and impossible for a pressurised fabric wing, which folds long before it
  // gets there.
  const noFloor = liftModelFromWing({
    planform: pf, airfoil: naca4('4415'), atm: atmosphere(0), mass: 85, area: 23.0,
    minFlyingCz: 0,
  });
  check('the raw polar range reaches near-zero lift',
    noFloor.czRange[0] < 0.15, `${noFloor.czRange[0].toFixed(3)}`);
  check('the collapse floor raises it to something a wing can fly',
    lm.czRange[0] >= 0.35 && lm.czFloorFrom === 'collapse limit',
    `${lm.czRange[0].toFixed(2)} from ${lm.czFloorFrom}`);
  check('the upper bound still comes from the stall',
    lm.czRange[1] > 1.2 && lm.czRange[1] === noFloor.czRange[1]);

  // The whole chain with nothing hand-fed.
  const derived = acceleratedPolarFromWing({
    riser: rs, base: { ...base }, chordM: 2.4, liftModel: lm,
  });
  check('trim speed from derived lift is still near the published figure',
    Math.abs(derived.trimSpeedKMH - 39) / 39 < 0.12,
    `${derived.trimSpeedKMH.toFixed(1)} vs 39 km/h`);
  check('best glide from derived lift is near the published figure',
    Math.abs(derived.bestGlide.glideRatio - 11) / 11 < 0.12,
    `${derived.bestGlide.glideRatio.toFixed(1)} vs 11`);
  check('the derived range is partly outside the flyable band',
    derived.validRows < derived.rows.length,
    `${derived.validRows}/${derived.rows.length}`);

  // The floor governs the predicted top speed, and cannot be derived — so it
  // is inverted from published data instead, with its sensitivity stated.
  const inv = collapseFloorForTopSpeed({
    riser: rs, base, chordM: 2.4, liftModel: lm, targetTopKMH: 58,
  });
  check('the published top speed is reachable on the lift curve', inv.reachable === true);
  check('and implies a physically sensible collapse Cz',
    inv.impliedCz > 0.2 && inv.impliedCz < 0.45, `Cz ${inv.impliedCz.toFixed(3)}`);
  check('reached partway along the bar, not past its end',
    inv.barFraction > 0.3 && inv.barFraction <= 1.0,
    `${(inv.barFraction * 100).toFixed(0)}% bar`);
  check('the sensitivity to the assumed floor is reported',
    inv.sensitivityKMHPer005 > 1, `${inv.sensitivityKMHPer005.toFixed(1)} km/h per 0.05`);
  check('and the verdict names the disagreement rather than hiding it',
    /lower collapse floor/.test(inv.verdict), inv.verdict);

  // Hardware steps between sizes rather than scaling.
  const hw = RISER_HARDWARE['PHI ALLEGRO light'];
  check('riser hardware steps rather than scales',
    hardwareForSize(hw, 'XS').travelMM === 150
    && hardwareForSize(hw, 'XL').travelMM === 180);
  check('two sizes share one hardware step',
    hardwareForSize(hw, 'XS').lengthMM === hardwareForSize(hw, 'S').lengthMM);
}

// ---------------------------------------------------------------------------
section('Brake cascades');

{
  const wing = demoWing();

  // Anchors are deliberately uneven: the production wings bunch them toward
  // the tip so braking bites there first.
  const ribsEven = brakeAnchorRibs(33, 13, 0);
  const ribsBiased = brakeAnchorRibs(33, 13, 0.55);
  check('anchors are strictly increasing',
    ribsBiased.every((r, i) => i === 0 || r > ribsBiased[i - 1]), ribsBiased.join(','));
  check('and never exceed the rib count', Math.max(...ribsBiased) <= 32);
  check('no rib carries two brake anchors',
    new Set(ribsBiased).size === ribsBiased.length);

  // Asking for more anchors than there are ribs used to return the outermost
  // rib twice — two brake lines onto one attachment point.
  const crowded = brakeAnchorRibs(13, 13, 0.55);
  check('a crowded request still gives one anchor per rib',
    new Set(crowded).size === crowded.length && crowded.length <= 13,
    crowded.join(','));
  const over = brakeAnchorRibs(8, 20, 0.55);
  check('an impossible request is capped, not duplicated',
    over.length <= 8 && new Set(over).size === over.length, over.join(','));
  const gapsEven = ribsEven.slice(1).map((r, i) => r - ribsEven[i]);
  const gapsBiased = ribsBiased.slice(1).map((r, i) => r - ribsBiased[i]);
  check('a tip bias closes the outboard spacing',
    gapsBiased[gapsBiased.length - 1] < gapsBiased[0]
      && gapsEven[gapsEven.length - 1] === gapsEven[0],
    `biased ${gapsBiased.join(',')}`);

  const bp = buildBrakePlan({ wing, anchors: 13, levelCounts: [6, 3, 1], lineLengthM: 6.5 });

  // Structure: the Lynx 2's brake cascade is 13 anchors onto 6 middle lines
  // onto 3 riser lines onto 1 shared lower line.
  check('four levels, matching the reference wing',
    bp.lines.filter((l) => l.level === 'upper').length === 13
    && bp.lines.filter((l) => l.level === 'middle').length === 6
    && bp.lines.filter((l) => l.level === 'riser' && !l.shared).length === 3
    && bp.lines.filter((l) => l.shared).length === 1);

  // The shared lower line is what makes a brake unlike a load-bearing row:
  // one line from the handle to the pulley carries the whole cascade.
  check('one lower line serves every anchor',
    bp.sharedLower.anchors.length === 13 && bp.sharedLower.name === 'KL1');
  check('every generated brake name parses',
    bp.lines.every((l) => parseLineName(l.name) !== null));
  check('all lengths are positive', bp.lines.every((l) => l.lengthMM > 0));

  // Total path length falls outboard, because the arc brings the tip
  // trailing edge nearer the pilot.
  const totals = Object.keys(bp.totals).map(Number).sort((a, b) => a - b)
    .map((k) => bp.totals[k]);
  check('brake paths shorten toward the tip', totals[0] > totals[totals.length - 1],
    `${totals[0]} -> ${totals[totals.length - 1]} mm`);

  // Every anchor's total must be its own path, not a shortcut.
  const upper = bp.lines.find((l) => l.level === 'upper' && l.index === 1);
  const mid = bp.lines.find((l) => l.level === 'middle' && l.anchors.includes(1));
  const ris = bp.lines.find((l) => l.level === 'riser' && !l.shared && l.anchors.includes(1));
  near('a total is the sum of its four segments', bp.totals[1],
    upper.lengthMM + mid.lengthMM + ris.lengthMM + bp.sharedLower.lengthMM, 1, ' mm');

  // Engagement. Free travel is the slack the designer adds, not something
  // geometry supplies — cutting every line taut engages the whole trailing
  // edge at once, which is why an undistributed brake is not used.
  const flat = brakeEngagement(bp, { slackAt: () => 120 });
  check('uniform slack engages the whole span together', flat.uniform === true,
    `${flat.minMM}-${flat.maxMM} mm`);

  const tipFirst = brakeEngagement(bp, { slackAt: tipFirstSlack({ centreMM: 180, tipMM: 60 }) });
  check('a tip-first distribution brings the tip in first', tipFirst.tipEngagesFirst === true);
  check('and gives a real spread of engagement', tipFirst.spreadMM > 50,
    `${tipFirst.spreadMM} mm across the span`);
  check('engagement falls monotonically outboard',
    tipFirst.rows.every((r, i) => i === 0 || r.engagesAtMM <= tipFirst.rows[i - 1].engagesAtMM),
    tipFirst.rows.map((r) => r.engagesAtMM).join(' '));
  check('the tip is named as first to engage',
    tipFirst.firstToEngage.anchor === tipFirst.rows[tipFirst.rows.length - 1].anchor);
}

// ---------------------------------------------------------------------------
section('Chordwise pressure and row load shares');

{
  const af = naca4('4415');

  // The distribution must integrate to the lift coefficient the same theory
  // predicts. Getting this wrong is easy and silent: the change of variable
  // x = (1-cos t)/2 carries a Jacobian sin(t)/2, and dropping it leaves the
  // flat-plate term right while every camber term is integrated against the
  // wrong measure — a constant offset of about 0.14 that looks like nothing
  // in particular.
  for (const a of [0, 5, 10]) {
    const L = chordwiseLoading(af, a);
    near(`alpha ${a}: the distribution integrates to its own cl`,
      loadBetween(L, 0, 1), L.cl, 1e-9);
  }

  // Cross-check against the independent implementation in aero.js.
  near('zero-lift angle agrees with the aero module',
    chordwiseLoading(af, 0).alphaL0Deg, thinAirfoil(af).alphaL0Deg, 0.05, ' deg');
  check('and is negative for a cambered section',
    chordwiseLoading(af, 0).alphaL0Deg < -3);
  near('a symmetric section has zero lift at zero incidence',
    chordwiseLoading(naca4('0012'), 0).cl, 0, 1e-3);

  // Physical shape of the loading.
  const L6 = chordwiseLoading(af, 6);
  const fwd = loadBetween(L6, 0, 0.5) / loadBetween(L6, 0, 1);
  check('the wing is front-loaded at flying incidence', fwd > 0.6,
    `${(fwd * 100).toFixed(0)}% of the load in the front half`);
  check('the centre of pressure moves aft as incidence falls',
    centreOfPressure(chordwiseLoading(af, 2)) > centreOfPressure(chordwiseLoading(af, 10)));
  near('and sits near the quarter chord plus the camber term at high lift',
    centreOfPressure(chordwiseLoading(af, 10)), 0.32, 0.04);

  // Row shares.
  const anchors = { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  const r6 = rowSharesFromPressure(af, anchors, 6);
  near('shares sum to one',
    Object.values(r6.shares).reduce((a, b) => a + b, 0), 1, 1e-9);
  check('A carries the most', r6.shares.A > r6.shares.B
    && r6.shares.A > r6.shares.C && r6.shares.A > r6.shares.D);
  check('and is close to the handbook convention for the A row',
    Math.abs(r6.shares.A - 0.35) < 0.06, `${(r6.shares.A * 100).toFixed(1)}% vs 35%`);
  check('C is close to the convention too',
    Math.abs(r6.shares.C - 0.20) < 0.05, `${(r6.shares.C * 100).toFixed(1)}% vs 20%`);
  // The rear disagrees, and that is the interesting part: thin-aerofoil
  // theory loads a rigid surface to the trailing edge, while a paraglider's
  // rear rows are deliberately unloaded so the C and D lines can be thin.
  check('the theory loads the D row more than the convention allows',
    r6.shares.D > 0.13, `${(r6.shares.D * 100).toFixed(1)}% vs 10%`);

  // Two things the fixed convention cannot see.
  const moved = rowSharesFromPressure(af, { ...anchors, A: 0.14 }, 6);
  check('moving the A anchor aft increases what it carries',
    moved.shares.A > r6.shares.A,
    `${(r6.shares.A * 100).toFixed(1)}% -> ${(moved.shares.A * 100).toFixed(1)}%`);

  const sweep = shareSweep(af, anchors, [0, 2, 4, 6, 8, 10]);
  check('the A row share swings hugely across the bar range',
    sweep.travel.A.swingPct > 15, `${sweep.travel.A.swingPct.toFixed(1)} points`);
  check('while the B row barely moves',
    sweep.travel.B.swingPct < 6, `${sweep.travel.B.swingPct.toFixed(1)} points`);
  check('so a fixed split cannot describe both trim and full bar',
    sweep.travel.A.swingPct > sweep.travel.B.swingPct * 3);

  // The load model must offer both, and default to the convention.
  const conv = rowSharesFor({});
  check('the load model defaults to the convention', conv.source === 'convention'
    && conv.shares.A === 0.35);
  const derived = rowSharesFor({ mode: 'pressure', airfoil: af, anchors, alphaDeg: 6 });
  check('and can derive the split instead', derived.source === 'pressure'
    && derived.shares.A !== 0.35);
  check('the derived split reports where the resultant acts',
    derived.centreOfPressure > 0.25 && derived.centreOfPressure < 0.5);
  check('deriving without a section is refused rather than guessed', (() => {
    try { rowSharesFor({ mode: 'pressure' }); return false; } catch { return true; }
  })());

  // Camber series sanity.
  const cs = camberSeries(af);
  check('a cambered section has a non-zero first camber term',
    Math.abs(cs.An[0]) > 0.01);
  check('a symmetric section has none',
    Math.abs(camberSeries(naca4('0012')).An[0]) < 1e-3);
}

// ---------------------------------------------------------------------------
section('Line loads, materials and drag');

{
  const wing = demoWing();
  const plan = buildLinePlan({
    wing, airfoil: naca4('4415'), layout: RISER_LAYOUTS['A/B/C+D'],
    everyNthRib: 2, riserLengthMM: 527, lineLengthM: 6.4,
  });

  const a = analyseLoads({
    plan, planform: wing.planform, stations: wing.stations,
    totalMassKg: 100, alphaDeg: 6, wingAreaM2: 22.3,
  });

  // Closure. A line plan describes one side, so the anchor loads must sum to
  // half the wing's load. Assigning each rib to a fixed window around every
  // attachment point instead double-counts the ribs two anchors share, which
  // inflated the total by 50% until each rib was assigned to exactly one.
  check('anchor loads close on half the wing load', a.closureError < 0.01,
    `${(a.closureError * 100).toFixed(2)}% error`);
  near('riser tensions sum to the same half load',
    a.tensions.totalN, a.closureN, 1e-6, ' N');

  // A cascaded row reaches the maillon while still numbered as middle lines,
  // so summing riser tension by level alone loses that row entirely.
  check('the cascaded D row still reaches a riser',
    Object.keys(a.tensions.riserTension).length === 3);
  check('the C riser carries more than the A riser, having two rows',
    a.tensions.riserTension.C > a.tensions.riserTension.A * 0.5);

  // Row shares follow the handbook's chordwise split.
  const total = Object.values(a.loadByRow).reduce((x, y) => x + y, 0);
  near('A row takes about 35% of the load', a.loadByRow.A / total, 0.35, 0.02);
  near('D row takes about 10%', a.loadByRow.D / total, 0.10, 0.02);

  // The real invariant is not that riser lines are the most loaded — an
  // outboard riser line serving three lightly loaded tip anchors carries less
  // than an inboard upper line at the centre. It is that every line carries
  // exactly the sum of what hangs from it, which holds along each path.
  let worstNode = 0;
  for (const parent of a.tensions.lines) {
    const children = a.tensions.lines.filter(
      (c) => c.row === parent.row && c.from === parent.to,
    );
    if (!children.length) continue;
    const sum = children.reduce((x, c) => x + c.tensionN, 0);
    worstNode = Math.max(worstNode, Math.abs(sum - parent.tensionN));
  }
  near('every line carries the sum of what hangs from it', worstNode, 0, 1e-6, ' N');

  // And along a path, tension does increase toward the riser.
  const aLines = a.tensions.lines.filter((l) => l.row === 'A');
  const deepest = aLines.filter((l) => l.level === 'riser')
    .sort((x, y) => y.tensionN - x.tensionN)[0];
  const itsUppers = aLines.filter((l) => l.level === 'upper'
    && (deepest.anchors || []).includes(l.index));
  check('a riser line carries more than any line above it',
    itsUppers.length > 0 && deepest.tensionN > Math.max(...itsUppers.map((l) => l.tensionN)),
    `${deepest.tensionN.toFixed(0)} N vs ${Math.max(...itsUppers.map((l) => l.tensionN)).toFixed(0)} N`);

  check('every line is sized', a.selection.ok && a.selection.unmet.length === 0);
  check('no line is over its rated strength',
    a.selection.lines.every((l) => !l.line || l.utilisation <= 1.0));

  // Stretch: a real correction, not a rounding one.
  check('stretch is millimetres, not microns',
    a.stretch.worstStretchMM > 1 && a.stretch.worstStretchMM < 100,
    `${a.stretch.worstStretchMM.toFixed(1)} mm`);
  check('cut lengths are shorter than geometric lengths',
    a.stretch.lines.every((l) => l.cutLengthMM <= l.lengthMM));

  // Line drag, which the equilibrium solver has taken as a typed-in constant.
  check('line drag coefficient is computed', a.drag && a.drag.cxLines > 0);

  // Feeding the computed drag back into the balance closes a loop that has
  // been open since Phase 1, where the line drag coefficient was a typed-in
  // constant. A modern thin lineset computes well below the handbook's 0.020,
  // and the glide ratio moves accordingly — which is most of why modern wings
  // glide better than the 2012 example.
  const inputs = equilibriumInputsFrom(a);
  check('solver inputs are derived from the lineset',
    inputs.cxLines > 0 && inputs.lineMass > 0);
  const assumed = solveEquilibrium({ area: 22.3, span: 10.25, chord: 2.6 });
  const computed = solveEquilibrium({ area: 22.3, span: 10.25, chord: 2.6, ...inputs });
  check('a thinner lineset than the handbook assumed improves the glide',
    computed.glideRatio > assumed.glideRatio,
    `${assumed.glideRatio.toFixed(2)} -> ${computed.glideRatio.toFixed(2)}`);
  check('and line drag falls as a share of the total',
    computed.dragBreakdown.lines < assumed.dragBreakdown.lines);
  check('and is in the range real wings show',
    a.drag.cxLines > 0.002 && a.drag.cxLines < 0.05,
    `Cx lines ${a.drag.cxLines.toFixed(4)}`);
}

{
  // Materials. The measured PHI table carries two strengths per line, and the
  // difference between them is the point.
  const path = 'data/reference/line-materials.tsv';
  if (!existsSync(path)) {
    check('line materials table present', false, `${path} missing`);
  } else {
    const table = parseMaterialsTable(readFileSync(path, 'utf8'));
    check('materials table parses', table.length > 60, `${table.length} line types`);

    const u135 = table.find((m) => m.code === 'U-135');
    near('U-135 diameter', u135.diameterMM, 1.10, 1e-9, ' mm');
    near('U-135 strength as new', u135.strengthNewDaN, 160, 1e-9, ' daN');
    near('U-135 strength once kinked', u135.strengthKinkedDaN, 85.6, 1e-9, ' daN');

    // The correction this data forced: a line in service is knotted at every
    // loop and bent round every maillon, and measured kinked strengths run far
    // below new ones. Sizing on the new figure under-sizes by nearly half on
    // exactly the lines a designer wants to make thin.
    const loss = 1 - u135.strengthKinkedDaN / u135.strengthNewDaN;
    check('kinking costs U-135 nearly half its strength', loss > 0.45 && loss < 0.5,
      `${(loss * 100).toFixed(0)}% loss`);

    const worst = table.reduce((m, x) =>
      (x.strengthKinkedDaN / x.strengthNewDaN < m.strengthKinkedDaN / m.strengthNewDaN ? x : m));
    check('some lines lose more than half', worst.strengthKinkedDaN / worst.strengthNewDaN < 0.5,
      `${worst.code} keeps ${(100 * worst.strengthKinkedDaN / worst.strengthNewDaN).toFixed(0)}%`);

    // Counter-intuitive but load-bearing: on a kinked basis the sheathed
    // Liros lines beat unsheathed Dyneema on strength per millimetre of
    // diameter, because they barely lose strength when bent. That is why the
    // reference wing uses them for its long lower gallery.
    const ppsls = table.find((m) => m.code === 'PPSLS 260');
    check('sheathed PPSLS beats unsheathed U-135 per mm, once kinked',
      ppsls.efficiencyPerDiameter > u135.efficiencyPerDiameter,
      `${ppsls.efficiencyPerDiameter.toFixed(0)} vs ${u135.efficiencyPerDiameter.toFixed(0)} daN/mm`);

    // Sizing on the two bases must differ, and kinked must be the safer one.
    const fake = {
      lines: [{ name: 'X1', row: 'A', level: 'upper', lengthMM: 1000, tensionN: 60, anchors: [1] }],
    };
    const kinked = selectLines(fake, { table: DEFAULT_LINE_TABLE, strengthBasis: 'kinked' });
    const asNew = selectLines(fake, { table: DEFAULT_LINE_TABLE, strengthBasis: 'new' });
    check('sizing on kinked strength picks at least as thick a line',
      kinked.lines[0].line.diameterMM >= asNew.lines[0].line.diameterMM,
      `${kinked.lines[0].line.code} vs ${asNew.lines[0].line.code}`);
  }
}

{
  // The PHI line sheet: a second production format, and a cascade table
  // rather than an inventory.
  const path = 'data/reference/phi-allegro-xalps-21.tsv';
  if (!existsSync(path)) {
    check('PHI reference sheet present', false, `${path} missing`);
  } else {
    const sheet = parsePhiLineSheet(readFileSync(path, 'utf8'));
    check('all five line blocks are found',
      sheet.rows.join(',') === 'A,B,C,D,BR', sheet.rows.join(','));

    const chk = checkPhiSheet(sheet);
    // This sheet's own arithmetic is exact — level lengths sum to the printed
    // total with no residue — which makes it the strongest check on cascade
    // totals anywhere in this project.
    check('every main-row anchor closes exactly', chk.exact && chk.closureRate === 1,
      `${chk.exactRows}/${chk.checked} at ${(chk.closureRate * 100).toFixed(0)}%`);
    check('the brake block is flagged rather than guessed at',
      chk.notDecoded.includes('BR'));

    // A blank length means "shared with the line above", and the repeated
    // name says which. Reading the columns positionally cannot tell a shared
    // line from a level that does not exist, and gets both wrong at the tip.
    const A = sheet.blocks[0];
    const a1 = A.anchors[0];
    check('the first anchor carries three named levels', a1.path.length === 3);
    near('and they sum to its printed total', a1.sum, a1.total, 1e-9, ' mm');
    check('names decode to upper/middle/riser',
      a1.path.map((x) => x.name).join(',') === 'a1,A1,AI');
    check('line types are carried',
      a1.path.map((x) => x.type).join(',') === 'DC60,U-135,PPSLS260');
    check('a shared level is reused, not recounted',
      A.anchors[1].path[2].name === a1.path[2].name
        && A.anchors[1].path[2].lengthMM === a1.path[2].lengthMM);

    // The same structure the Ozone wings showed, from a different maker:
    // four anchor rows on three risers, D cascading into C.
    const intoC = chk.crossBlock.filter((x) => x.row === 'D' && x.inheritsFrom.row === 'C');
    check('the D row cascades into the C row', intoC.length > 0,
      `${intoC.length} anchors inherit from C`);

    const len = phiLineLength(sheet);
    check('total line length is near the published figure',
      Math.abs(len - 258.7) / 258.7 < 0.12,
      `${len.toFixed(1)} m computed vs 258.7 m published`);
  }
}

// ---------------------------------------------------------------------------
section('Load envelope across the speedbar range');

{
  const pf2 = planformFromDesignInputs({
    span: 11.6, rootChord: 2.45, tipChord: 0.55, tipSweep: 1.4,
  });
  const af2 = naca4('4415');
  const lobe2 = buildLobe({ type: 'circle', projectedRatio: 0.86 }, pf2.halfSpan);
  const wing2 = buildWing({
    planform: pf2, lobe: lobe2, airfoil: af2, cells: 20, pointsPerSurface: 30,
  });
  const plan2 = buildLinePlan({
    wing: wing2, airfoil: af2, layout: RISER_LAYOUTS['A/B/C+D'],
    everyNthRib: 2, lineLengthM: 7.0,
  });
  const rs2 = riserSet({
    rows: ['A', 'B', 'C'], lengthMM: 500, travelMM: 180,
    anchors: { A: 0.09, B: 0.32, C: 0.58 },
  });
  const lm2 = liftModelFromWing({
    planform: pf2, airfoil: af2, atm: atmosphere(0), mass: 95, area: 25.2,
  });

  const env = loadEnvelope({
    plan: plan2, planform: pf2, stations: wing2.stations, totalMassKg: 95,
    airfoil: af2, riser: rs2, chordM: 2.45, trimAlphaDeg: 6,
    liftModel: lm2, barSteps: 9,
  });

  // The sweep must stop where the wing stops flying. Run past the collapse
  // floor, thin-aerofoil theory reports the A row carrying negative load —
  // the front of the section pushing down, which is the frontal-collapse
  // mechanism rather than a load case.
  check('bar positions past the collapse floor are excluded',
    env.excluded.length > 0 && env.flyableBars.length < 9,
    `${env.flyableBars.length} flyable, ${env.excluded.length} excluded`);
  check('and the exclusion says why',
    env.excluded.every((e) => /collapse floor|unloads/.test(e.reason)));
  check('every case that is kept has positive shares everywhere',
    env.cases.every((c) => Object.values(c.shares).every((v) => v > 0)));

  // Total load is the weight whatever the speed. Only the split moves, so
  // the shares must still sum to one at every position.
  for (const c of env.cases) {
    near(`shares sum to one at ${(c.bar * 100).toFixed(0)}% bar`,
      Object.values(c.shares).reduce((a, b) => a + b, 0), 1, 1e-9);
  }

  // The finding: trim is the wrong sizing case.
  check('trim does not govern every line', env.trimGoverns === false);
  const offTrim = env.increases.filter((i) => i.governingBar > 0).length;
  check('most lines are governed away from trim',
    offTrim > env.increases.length / 2,
    `${offTrim} of ${env.increases.length}`);

  // The rear rows take substantially more at speed; the front row does not.
  check('the D row gains most on the bar', env.worstIncreaseByRow.D > 25,
    `+${env.worstIncreaseByRow.D.toFixed(0)}%`);
  check('and the C row gains more than the B row',
    env.worstIncreaseByRow.C > env.worstIncreaseByRow.B,
    `C +${env.worstIncreaseByRow.C.toFixed(0)}% vs B +${env.worstIncreaseByRow.B.toFixed(0)}%`);
  near('the A row does not gain at all', env.worstIncreaseByRow.A, 0, 1e-6, '%');

  // Sizing consequence: some lines genuinely need more material.
  //
  // The comparison has to hold the share model fixed. Sizing at trim with the
  // handbook convention and on the envelope with pressure-derived shares
  // conflates two separate changes, and the convention's larger B share then
  // makes the envelope look like it needs *less* line there — which says
  // nothing about the bar. Both sides use pressure shares here, so what is
  // measured is the effect of the speedbar alone.
  const trimShares = rowSharesFor({
    mode: 'pressure', airfoil: af2, anchors: af2.anchors, alphaDeg: 6,
  }).shares;
  const trimOnly = analyseLoads({
    plan: plan2, planform: pf2, stations: wing2.stations, totalMassKg: 95,
    alphaDeg: 6, rowShares: trimShares,
  });
  const sTrim = selectLines(trimOnly.tensions, {});
  const sEnv = selectLines(env.tensions, {});
  let thicker = 0;
  for (const e of sEnv.lines) {
    const t = sTrim.lines.find((x) => x.name === e.name);
    if (t && e.line && t.line && e.line.diameterMM > t.line.diameterMM) thicker++;
  }
  check('sizing on the envelope calls for thicker line somewhere',
    thicker > 0, `${thicker} lines`);
  check('and never for thinner line than trim sizing', (() => {
    for (const e of sEnv.lines) {
      const t = sTrim.lines.find((x) => x.name === e.name);
      if (t && e.line && t.line && e.line.diameterMM < t.line.diameterMM) return false;
    }
    return true;
  })());

  // Gust loads: the same gust is far more punishing at speed, which is why
  // the certification case is what it is.
  const wl = (95 * 9.81) / 25.2;
  const gTrim = gustLoadFactor({ speedMS: 10.3, wingLoadingNPerM2: wl });
  const gFast = gustLoadFactor({ speedMS: 16.1, wingLoadingNPerM2: wl });
  check('a gust at speed loads the wing far harder than at trim',
    gFast.loadFactor > gTrim.loadFactor * 1.3,
    `${gTrim.loadFactor.toFixed(2)}g vs ${gFast.loadFactor.toFixed(2)}g`);
  check('the increment scales with speed',
    Math.abs(gFast.perMS - gTrim.perMS) < 1e-9);
  // A 7.5 m/s gust at trim lands close to the 8g certification case, which is
  // a useful sanity check on both.
  check('a strong gust at trim is near the 8g certification case',
    Math.abs(gTrim.loadFactor - 8) < 1.5, `${gTrim.loadFactor.toFixed(2)}g`);
  check('a heavier wing loading is less gust-sensitive',
    gustLoadFactor({ speedMS: 10.3, wingLoadingNPerM2: wl * 1.3 }).loadFactor
      < gTrim.loadFactor);
}

// ---------------------------------------------------------------------------
section('Asymmetric and collapse load cases');

{
  const pf3 = planformFromDesignInputs({
    span: 11.6, rootChord: 2.45, tipChord: 0.55, tipSweep: 1.4,
  });
  const af3 = naca4('4415');
  const wing3 = buildWing({
    planform: pf3,
    lobe: buildLobe({ type: 'circle', projectedRatio: 0.86 }, pf3.halfSpan),
    airfoil: af3, cells: 20, pointsPerSurface: 30,
  });
  const plan3 = buildLinePlan({
    wing: wing3, airfoil: af3, layout: RISER_LAYOUTS['A/B/C+D'],
    everyNthRib: 2, lineLengthM: 7.0,
  });
  const sym = analyseLoads({
    plan: plan3, planform: pf3, stations: wing3.stations,
    totalMassKg: 95, alphaDeg: 6, wingAreaM2: 25.2,
  });

  // Half the span is not half the lift. The loading is far higher inboard,
  // so a tip collapse sheds much less than its span fraction suggests —
  // which is why the multiplier has to come from the span loading rather
  // than from 1/(1-f) in span.
  const quarter = asymmetricCollapse({
    spanLoad: sym.spanLoad, plan: plan3, loads: sym.anchorLoads,
    collapsedSpanFraction: 0.25, dynamicFactor: 1,
  });
  check('a quarter-span tip collapse sheds far less than a quarter of the lift',
    quarter.lostLiftFraction < 0.22,
    `${(quarter.lostLiftFraction * 100).toFixed(1)}% of lift`);
  const halfC = asymmetricCollapse({
    spanLoad: sym.spanLoad, plan: plan3, loads: sym.anchorLoads,
    collapsedSpanFraction: 0.5, dynamicFactor: 1,
  });
  check('and half the span sheds less than half the lift',
    halfC.lostLiftFraction < 0.5 && halfC.lostLiftFraction > 0.3,
    `${(halfC.lostLiftFraction * 100).toFixed(1)}%`);
  check('a bigger collapse sheds more lift',
    halfC.lostLiftFraction > quarter.lostLiftFraction);
  check('the multiplier follows the lift lost, not the span lost',
    Math.abs(halfC.multiplier - 1 / (1 - halfC.lostLiftFraction)) < 1e-9);

  // An inboard collapse of the same span is worse, because that is where the
  // lift is.
  const inboard = asymmetricCollapse({
    spanLoad: sym.spanLoad, plan: plan3, loads: sym.anchorLoads,
    collapsedSpanFraction: 0.25, fromTip: false, dynamicFactor: 1,
  });
  check('an inboard collapse sheds more lift than a tip collapse of equal span',
    inboard.lostLiftFraction > quarter.lostLiftFraction,
    `${(inboard.lostLiftFraction * 100).toFixed(1)}% vs ${(quarter.lostLiftFraction * 100).toFixed(1)}%`);

  // The dynamic factor is a stated input, not a hidden constant.
  const withDyn = asymmetricCollapse({
    spanLoad: sym.spanLoad, plan: plan3, loads: sym.anchorLoads,
    collapsedSpanFraction: 0.5, dynamicFactor: 1.5,
  });
  near('the dynamic factor multiplies straight through',
    withDyn.multiplier, halfC.multiplier * 1.5, 1e-9);

  // Frontal collapse moves load backwards.
  const front = frontalCollapse({ plan: plan3, loads: sym.anchorLoads, shed: 1.0, dynamicFactor: 1.4 });
  const riserN = (t, r) => t.lines.filter((l) => l.row === r && l.level === 'riser')
    .reduce((a, l) => a + l.tensionN, 0);
  near('the A row sheds everything when it folds', riserN(front.tensions, 'A'), 0, 1e-9, ' N');
  check('and the C row picks it up', riserN(front.tensions, 'C') > riserN(sym.tensions, 'C') * 1.5,
    `${riserN(sym.tensions, 'C').toFixed(0)} -> ${riserN(front.tensions, 'C').toFixed(0)} N`);
  const partial = frontalCollapse({ plan: plan3, loads: sym.anchorLoads, shed: 0.5, dynamicFactor: 1 });
  check('a partial fold sheds proportionally', riserN(partial.tensions, 'A') > 0
    && riserN(partial.tensions, 'A') < riserN(sym.tensions, 'A'));

  // The design envelope. Symmetric flight is not the case that sizes a
  // lineset, which is the point of all of this.
  const env = designEnvelope({ symmetric: sym, collapseCases: [withDyn, front] });
  check('a collapse case governs somewhere', env.collapseGoverns === true);
  check('and in fact governs most of the lineset',
    (env.governingCases['asymmetric tip collapse'] || 0) > env.tensions.lines.length / 2,
    JSON.stringify(env.governingCases));

  const symSel = selectLines(sym.tensions, {});
  let thicker = 0;
  for (const e of env.selection.lines) {
    const t = symSel.lines.find((x) => x.name === e.name);
    if (t && e.line && t.line && e.line.diameterMM > t.line.diameterMM) thicker++;
  }
  check('sizing on collapse calls for more material than symmetric sizing',
    thicker > env.selection.lines.length / 5, `${thicker} of ${env.selection.lines.length} lines`);
  check('and never less', (() => {
    for (const e of env.selection.lines) {
      const t = symSel.lines.find((x) => x.name === e.name);
      if (t && e.line && t.line && e.line.diameterMM < t.line.diameterMM) return false;
    }
    return true;
  })());

  // -------------------------------------------------------------------
  // Reconciliation with wings that fly.
  //
  // Real linesets do not break in collapses. Taken with the finding above —
  // that collapse governs every line — that could only mean one of two
  // things: either the collapse model is too severe, or real wings are
  // already built to it. The manufacturers' own line choices settle it.
  //
  // Measured against the 1 g line load, PHI's Allegro X-alps sits at 28x on
  // its most load-critical line (the C riser) and 108x on the tip D lines.
  // The symmetric certification case is 8 g x 1.5 = 12x, which is thinner
  // than any line on that wing. The collapse envelope lands at 28.6x.
  const factorSym = DEFAULT_LOAD_CASE.limitG * DEFAULT_LOAD_CASE.safetyFactor;
  const factorCollapse = factorSym * withDyn.multiplier;
  check('symmetric certification alone is thinner than real practice',
    factorSym < 28, `${factorSym.toFixed(1)}x vs 28x observed`);
  check('the collapse envelope matches the most load-critical real line',
    Math.abs(factorCollapse - 28) < 4,
    `${factorCollapse.toFixed(1)}x vs 28x on PHI's C riser`);

  // Most of a lineset is not load-sized at all. Neither PHI nor Ozone uses
  // line thinner than 0.50 mm anywhere, and it is not strength that stops
  // them — a 0.4 mm line is strong enough for a tip D-line several times
  // over. Below that, handling and abrasion decide, not load.
  near('the practical floor is the thinnest line real wings use',
    PRACTICAL_FLOOR.diameterMM, 0.50, 1e-9, ' mm');
  const symSel2 = selectLines(sym.tensions, {});
  check('no line is selected below the floor',
    symSel2.lines.every((l) => !l.line || l.line.diameterMM >= PRACTICAL_FLOOR.diameterMM));
  check('most of a lineset is floor-sized, not load-sized',
    symSel2.floorSized > symSel2.loadSized,
    `${symSel2.floorSized} floor vs ${symSel2.loadSized} load`);
  check('and the split is reported so a designer can see which is which',
    symSel2.floorSized + symSel2.loadSized === symSel2.lines.length);

  // The collapse case moves lines from floor-sized to load-sized, which is
  // the mechanism by which it changes a design at all.
  const envSel2 = designEnvelope({ symmetric: sym, collapseCases: [withDyn] }).selection;
  check('the collapse case makes more lines load-critical',
    envSel2.loadSized > symSel2.loadSized,
    `${symSel2.loadSized} -> ${envSel2.loadSized}`);
  check('every line still respects the floor',
    envSel2.lines.every((l) => !l.line || l.line.diameterMM >= PRACTICAL_FLOOR.diameterMM));

  // A wing with no rear rows cannot survive a frontal collapse, and saying so
  // is better than dividing by zero.
  check('a frontal collapse with nothing behind is refused', (() => {
    try {
      frontalCollapse({ plan: plan3, loads: sym.anchorLoads.filter((l) => l.row === 'A') });
      return false;
    } catch { return true; }
  })());
}

// ---------------------------------------------------------------------------
section('Size families and scaling');

{
  const path = 'data/reference/phi-allegro-light-sizes.tsv';
  if (!existsSync(path)) {
    check('size table present', false, `${path} missing`);
  } else {
    const sizes = parseSizeTable(readFileSync(path, 'utf8'));
    check('six sizes parse', sizes.length === 6, sizes.map((s2) => s2.name).join(','));
    near('the smallest is 20.4 m2 flat', sizes[0].flatArea, 20.4, 1e-9, ' m2');

    const laws = fitScalingFamily(sizes);

    // The canopy really is scaled: aspect ratio is held to three decimals and
    // area goes as the square of span, to measurement error.
    check('aspect ratio is constant across the family', laws.aspectRatioConstant,
      `spread ${laws.aspectRatioSpread.toFixed(4)}`);
    near('flat area scales isometrically', laws.exponents.flatArea, 2.0, 0.05);
    near('projected area scales isometrically', laws.exponents.projectedArea, 2.0, 0.06);

    // But lines and mass do not. Both are affine — they have a fixed part
    // that does not scale — and the fits are tight.
    check('line length fits an affine law tightly', laws.lineLength.r2 > 0.99,
      `R2 ${laws.lineLength.r2.toFixed(4)}`);
    check('the line law has a real fixed component',
      laws.lineLength.intercept > 0.2, `${laws.lineLength.intercept.toFixed(3)} m`);
    check('mass fits an affine law', laws.wingMass.r2 > 0.98, `R2 ${laws.wingMass.r2.toFixed(4)}`);

    // Interpolating inside the fitted range is where the affine laws earn
    // their keep.
    const inside = scaleToArea(sizes[0], sizes[2].flatArea, laws);
    check('interpolation uses the affine law', inside.method === 'affine');
    check('and lands within half a percent on line length',
      Math.abs(inside.lineLength - sizes[2].lineLength) / sizes[2].lineLength < 0.005,
      `${inside.lineLength.toFixed(2)} vs ${sizes[2].lineLength}`);

    const family = generateFamily(sizes[0], sizes.map((x) => x.flatArea), laws);
    const err = compareFamily(family, sizes);
    check('span is reproduced almost exactly', err.flatSpan.worstPct < 0.2,
      `${err.flatSpan.worstPct.toFixed(2)}%`);
    check('line length across the family within 1%', err.lineLength.worstPct < 1.0,
      `${err.lineLength.worstPct.toFixed(2)}%`);

    // The honest limit. Fitted to the three smallest and extrapolated to the
    // three largest, the affine law is WORSE than isometric scaling — the
    // intercept is poorly determined over a short baseline and extrapolating
    // amplifies it. So outside the fitted range the module falls back to
    // isometric rather than trusting a law it cannot support.
    const trained = fitScalingFamily(sizes.slice(0, 3));
    const outside = scaleToArea(sizes[0], sizes[5].flatArea, trained);
    check('extrapolation is detected', outside.inFittedRange === false);
    check('and falls back to isometric scaling', outside.method === 'isometric');

    const affineOut = scaleToArea(sizes[0], sizes[5].flatArea, trained, { outsideRange: 'affine' });
    const errIso = Math.abs(outside.lineLength - sizes[5].lineLength) / sizes[5].lineLength;
    const errAff = Math.abs(affineOut.lineLength - sizes[5].lineLength) / sizes[5].lineLength;
    check('extrapolated affine really is worse than isometric here',
      errAff > errIso,
      `affine ${(errAff * 100).toFixed(2)}% vs isometric ${(errIso * 100).toFixed(2)}%`);

    // Wing loading is a design decision, not a scaling law: a family is a set
    // of related wings flown at different loadings, not one wing resized.
    const trend = loadingTrend(sizes);
    check('wing loading rises with size', trend[5].loading > trend[0].loading * 1.2,
      `${trend[0].loading.toFixed(2)} -> ${trend[5].loading.toFixed(2)} kg/m2`);

    // Scaling the design inputs must preserve shape exactly.
    const base = { span: 11, rootChord: 2.4, tipChord: 0.6, tipSweep: 1.2, ellipticityLE: 0.85 };
    const k = 1.2;
    const scaled = scaleDesignInputs(base, k);
    near('span scales', scaled.span, 11 * k, 1e-12, ' m');
    near('taper ratio is preserved', scaled.tipChord / scaled.rootChord,
      base.tipChord / base.rootChord, 1e-12);
    check('shape parameters are untouched', scaled.ellipticityLE === base.ellipticityLE);

    // A scaled planform must keep its aspect ratio.
    const p1 = planformFromDesignInputs(base);
    const p2 = planformFromDesignInputs(scaled);
    near('aspect ratio survives scaling',
      planformMetrics(p2).aspectRatio, planformMetrics(p1).aspectRatio, 1e-9);
    near('area scales as k squared',
      planformMetrics(p2).area / planformMetrics(p1).area, k * k, 1e-9);
  }

  // The worked example must still match the family it came from.
  near('example line-length slope', EXAMPLE_SCALING.lineLength.slope, 0.5659, 1e-3);
  near('example projected ratio', EXAMPLE_SCALING.projectedRatio, 0.857, 0.01);
}

{
  // Cross-family check. Three families from two manufacturers, spanning
  // 12.9 to 29 m^2 and aspect ratios from 4.56 to 6.03.
  const path = 'data/reference/size-families.tsv';
  if (!existsSync(path)) {
    check('multi-family size data present', false, `${path} missing`);
  } else {
    const families = parseSizeFamilies(readFileSync(path, 'utf8'));
    check('six families parse', Object.keys(families).length === 6,
      Object.keys(families).join(' | '));

    const fits = {};
    for (const [name, sizes] of Object.entries(families)) {
      const laws = fitScalingFamily(sizes);
      fits[name] = laws;

      // The canopy scales isometrically in every one of them, which is what
      // makes a single scale factor legitimate for the planform.
      near(`${name}: flat area scales as span squared`, laws.exponents.flatArea, 2.0, 0.09);
      check(`${name}: aspect ratio is held constant`, laws.aspectRatioConstant,
        `spread ${laws.aspectRatioSpread.toFixed(4)}`);

      // And the affine form fits tightly in every one of them.
      check(`${name}: total line length fits affine`, laws.totalLineLength.r2 > 0.97,
        `R2 ${laws.totalLineLength.r2.toFixed(4)}`);
      check(`${name}: mass fits affine`, laws.wingMass.r2 > 0.97,
        `R2 ${laws.wingMass.r2.toFixed(4)}`);
    }

    // The coefficients, however, do not transfer. This is the correction to
    // the previous phase, which shipped one family's fit as a default: the
    // slopes vary by a factor of about 1.7, because they depend on line
    // count, cascade depth and construction rather than on size alone.
    const slopes = Object.values(fits).map((l) => l.totalLineLength.slope);
    check('line-length slopes differ substantially between families',
      Math.max(...slopes) / Math.min(...slopes) > 1.5,
      slopes.map((x) => x.toFixed(1)).join(' vs '));
    const massSlopes = Object.values(fits).map((l) => l.wingMass.slope);
    check('mass slopes differ substantially between families',
      Math.max(...massSlopes) / Math.min(...massSlopes) > 1.5,
      massSlopes.map((x) => x.toFixed(3)).join(' vs '));

    // Borrowing another family's laws is measurably worse than assuming
    // nothing, which is why isometric is now the default.
    const names = Object.keys(families);
    const borrowed = crossFamilyError(fits[names[0]], families[names[2]]);
    check('borrowed laws land far off', borrowed && borrowed.worstPct > 10,
      borrowed ? `${borrowed.worstPct.toFixed(1)}% worst` : 'no data');

    // With no laws supplied the scaling must be isometric, not a borrowed fit.
    const iso = scaleToArea(families[names[1]][0], families[names[1]][4].flatArea);
    check('no laws means isometric scaling', iso.method === 'isometric');
    check('and it says so', /isometric/.test(iso.lawsSource));

    // ---------------------------------------------------------------------
    // Application. Comparing a hike-and-fly wing with a competition wing and
    // calling the difference a scaling failure is a category error: these are
    // built to different briefs and almost every ratio tracks the brief.
    check('six families, spanning the categories',
      Object.keys(families).length === 6, Object.keys(families).join(' | '));

    check('a low-aspect mountain wing classifies as hike and fly',
      classifyApplication({ aspectRatio: 4.56, cells: 34 }) === 'hike and fly');
    check('a high-aspect EN D wing classifies as competition',
      classifyApplication({ aspectRatio: 6.9, cells: 78, certification: 'D' }) === 'competition');
    check('an EN D certification alone implies competition',
      classifyApplication({ aspectRatio: 5.9, certification: 'D' }) === 'competition');

    const cross = compareApplications(
      { aspectRatio: 4.56, certification: 'A' },
      { aspectRatio: 6.9, certification: 'D' },
    );
    check('a cross-category comparison is flagged, not silently made',
      cross.comparable === false && cross.categoryGap === 4);
    check('and it explains what differs rather than ranking them',
      cross.notes.some((n) => /follow from the brief/i.test(n)));

    const same = compareApplications(
      { aspectRatio: 6.85, certification: 'D' },
      { aspectRatio: 6.95, certification: 'D' },
    );
    check('two wings of one class compare cleanly', same.comparable === true);

    // The normalised metrics must order by application, which is what makes
    // like-for-like comparison meaningful.
    const cf = compareFamilies(families);
    // Two families now share the performance class, so the check is that the
    // ordering runs from the mountain wing to the competition wing rather
    // than that every class appears once.
    check('families sort by application', cf.rows.length === 6
      && cf.rows[0].application === 'hike and fly'
      && cf.rows[cf.rows.length - 1].application === 'competition',
      cf.rows.map((r) => r.application).join(' -> '));
    check('a mixed set carries a warning', !cf.singleApplication && !!cf.warning);

    const byApp = Object.fromEntries(cf.rows.map((r) => [r.application, r]));
    // Higher-performance wings carry less line per square metre: line drag is
    // a first-order cost to them, and they can afford fewer, thinner lines.
    check('line per m2 falls from mountain wing to competition wing',
      byApp['hike and fly'].lineLengthPerM2 > byApp.competition.lineLengthPerM2 * 1.5,
      `${byApp['hike and fly'].lineLengthPerM2.toFixed(1)} vs ${byApp.competition.lineLengthPerM2.toFixed(1)} m/m2`);
    // And they are built from more, narrower cells.
    check('cells per metre of span rises with application',
      byApp['hike and fly'].cellsPerMetreSpan < byApp.competition.cellsPerMetreSpan,
      `${byApp['hike and fly'].cellsPerMetreSpan.toFixed(2)} vs ${byApp.competition.cellsPerMetreSpan.toFixed(2)}`);
    // The mountain wing is the lightest per square metre, which is its whole
    // reason for existing.
    check('the hike and fly wing is lightest per m2',
      byApp['hike and fly'].massPerM2
        === Math.min(...cf.rows.map((r) => r.massPerM2)),
      `${byApp['hike and fly'].massPerM2.toFixed(3)} kg/m2`);

    check('every application in the table has a brief',
      cf.rows.every((r) => APPLICATIONS[r.application]?.brief));

    // ---------------------------------------------------------------------
    // Loading rises with aspect ratio — across the mainstream progression.
    const gLoad = loadingCheck(families['Ozone Geo 7']);
    const zLoad = loadingCheck(families['Ozone Zeno 2']);
    const uLoad = loadingCheck(families['Ozone Ultralite 5']);

    check('the trend applies to a progression wing', gLoad[0].trendApplies);
    check('and to a competition wing', zLoad[0].trendApplies);
    check('but explicitly not to a hike-and-fly wing',
      uLoad.every((x) => x.trendApplies === false));

    const meanLoad = (rows) => rows.reduce((a, r) => a + r.actualLoading, 0) / rows.length;
    check('the competition wing is loaded harder than the progression wing',
      meanLoad(zLoad) > meanLoad(gLoad),
      `${meanLoad(gLoad).toFixed(2)} -> ${meanLoad(zLoad).toFixed(2)} kg/m2`);

    // The mountain wing breaks the trend, and by a lot: its smallest size is
    // the most heavily loaded wing in the whole dataset on the lowest aspect
    // ratio. That is the brief, not an anomaly to be fitted away.
    check('the mountain wing is loaded above every mainstream wing at its AR',
      Math.max(...uLoad.map((x) => x.actualLoading))
        > expectedLoading(6.9) ,
      `${Math.max(...uLoad.map((x) => x.actualLoading)).toFixed(2)} kg/m2 at AR 4.56`);

    // The fitted trend must predict the families it was fitted to.
    for (const [fam, rows] of [['Ozone Geo 7', gLoad], ['Ozone Zeno 2', zLoad]]) {
      const worst = Math.max(...rows.map((r) => Math.abs(r.deltaPct)));
      check(`${fam}: loading trend predicts within 15%`, worst < 15,
        `worst ${worst.toFixed(1)}%`);
    }

    check('the trend records what it excludes and why',
      LOADING_VS_AR.excludes.includes('hike and fly')
      && LOADING_VS_AR.appliesTo.includes('competition'));
    check('expectedLoading returns nothing outside its scope',
      expectedLoading(4.56, 'hike and fly') === null);

    // ---------------------------------------------------------------------
    // Line length from aspect ratio: the law that finally transfers.
    // Predicting each family's own mid size from aspect ratio and span alone,
    // with no coefficients fitted to that family.
    let worstPct = 0;
    for (const [name, sizes] of Object.entries(families)) {
      const withLines = sizes.filter((x) => x.totalLineLength);
      if (!withLines.length) continue;
      const mid = withLines[Math.floor(withLines.length / 2)];
      const ar = mid.flatAR ?? (mid.flatSpan ** 2) / mid.flatArea;
      // Riser count is not in the size table; infer from the line data
      // elsewhere would be circular, so use three unless the wing is known.
      const est = estimateTotalLineLength({ aspectRatio: ar, flatSpan: mid.flatSpan });
      const e = Math.abs(est.totalLineLengthM - mid.totalLineLength) / mid.totalLineLength;
      worstPct = Math.max(worstPct, e * 100);
      check(`${name}: total line length from AR and span within 12%`, e < 0.12,
        `${est.totalLineLengthM.toFixed(0)} vs ${mid.totalLineLength} m (${(e * 100).toFixed(1)}%)`);
    }
    check('the normalised law transfers across every family', worstPct < 12,
      `worst ${worstPct.toFixed(1)}%`);

    // Direction and magnitude of each effect.
    check('a higher aspect ratio carries less line per metre of span',
      lineLengthPerSpan(6.9) < lineLengthPerSpan(4.56),
      `${lineLengthPerSpan(4.56).toFixed(1)} -> ${lineLengthPerSpan(6.9).toFixed(1)} m/m`);
    check('a two-liner carries less than a three-liner at the same AR',
      lineLengthPerSpan(6.05, { risers: 2 }) < lineLengthPerSpan(6.05, { risers: 3 }));
    check('the fit is recorded with its sample size and error',
      LINE_LENGTH_PER_SPAN.sampleFamilies === 5
      && LINE_LENGTH_PER_SPAN.sampleManufacturers === 3
      && LINE_LENGTH_PER_SPAN.worstFamilyErrorPct < 10);
    check('extrapolation beyond the fitted aspect ratios is flagged',
      estimateTotalLineLength({ aspectRatio: 8.5, flatSpan: 13 }).inFittedRange === false);

    // -------------------------------------------------------------------
    // How a family's lineset scales is a manufacturer decision, and the law
    // above quietly assumed one of the two answers.
    const regimes = {};
    for (const [name, sizes] of Object.entries(families)) {
      const e = lineLengthExponent(sizes);
      if (e) regimes[name] = e;
    }
    check('every family yields a scaling exponent',
      Object.keys(regimes).length === 6, Object.keys(regimes).join(' | '));

    const ozonePhi = Object.entries(regimes).filter(([n]) => !/BGD/.test(n));
    check('five families scale their lineset with span',
      ozonePhi.every(([, e]) => e.regime === 'span'),
      ozonePhi.map(([n, e]) => `${n.split(' ').pop()} ${e.exponent.toFixed(2)}`).join(', '));
    check('BGD scales its lineset with area instead',
      regimes['BGD Lynx 2'].regime === 'area',
      `exponent ${regimes['BGD Lynx 2'].exponent.toFixed(2)}`);
    near('and that exponent is close to 2', regimes['BGD Lynx 2'].exponent, 2.0, 0.15);

    // Out of sample, assuming the wrong regime is what breaks the law.
    const lynx = families['BGD Lynx 2'];
    const small = lynx[0];
    const large = lynx[lynx.length - 1];
    const assumed = estimateTotalLineLength({ aspectRatio: 6.2, flatSpan: large.flatSpan });
    const eAssumed = Math.abs(assumed.totalLineLengthM - large.totalLineLength) / large.totalLineLength;
    check('assuming span scaling mis-sizes an area-scaling family badly',
      eAssumed > 0.10, `${(eAssumed * 100).toFixed(1)}% out on the largest size`);

    const corrected = estimateTotalLineLength({
      aspectRatio: 6.2,
      flatSpan: large.flatSpan,
      referenceSpan: small.flatSpan,
      exponent: regimes['BGD Lynx 2'].exponent,
    });
    const eCorrected = Math.abs(corrected.totalLineLengthM - large.totalLineLength)
      / large.totalLineLength;
    check('using the family\'s own exponent fixes it',
      eCorrected < eAssumed / 2,
      `${(eCorrected * 100).toFixed(1)}% vs ${(eAssumed * 100).toFixed(1)}%`);

    check('the law records that it assumes span scaling',
      LINE_LENGTH_PER_SPAN.assumesSpanScaling === true
      && LINE_LENGTH_PER_SPAN.worstOutOfSampleErrorPct > 10);

    // Within a family, fitted laws interpolate well.
    for (const [name, sizes] of Object.entries(families)) {
      const mid = Math.floor(sizes.length / 2);
      const p = scaleToArea(sizes[0], sizes[mid].flatArea, fits[name]);
      const e = Math.abs(p.totalLineLength - sizes[mid].totalLineLength)
        / sizes[mid].totalLineLength;
      check(`${name}: own laws interpolate within 3%`, e < 0.03,
        `${(e * 100).toFixed(2)}%`);
    }
  }
}

// ---------------------------------------------------------------------------
section('Fitting drawings to frames');

{
  const frame = { width: 1386, height: 520 };   // a wide viewport

  // A drag polar: Cx from 0.06 to 0.12 against Cz from 0.2 to 1.4. The axes
  // are both dimensionless but measure different things, and the y range is
  // twenty times the x range — which is exactly why a uniform scale turns it
  // into a vertical line.
  const polar = boundsOf([[0.06, 0.2], [0.12, 1.4]]);
  const asChart = fitScales(polar, frame, { chart: true });
  const asGeometry = fitScales(polar, frame, { chart: false });

  check('a chart fills both directions of the frame',
    asChart.fillX > 0.75 && asChart.fillY > 0.75,
    `${(asChart.fillX * 100).toFixed(0)}% x ${(asChart.fillY * 100).toFixed(0)}%`);

  // Treated as geometry the same data becomes a sliver — correctly fitted,
  // and the reason the polar viewport was a narrow line down a wide frame.
  check('the same data treated as geometry collapses to a sliver',
    asGeometry.fillX < 0.05,
    `${(asGeometry.fillX * 100).toFixed(1)}% of the frame width`);
  check('and that is what independent axes fix',
    asChart.fillX / asGeometry.fillX > 20,
    `${(asChart.fillX / asGeometry.fillX).toFixed(0)}x wider`);

  // Geometry must keep one scale on both axes or the wing is drawn wrong.
  const wing = boundsOf([[-5.1, 0], [5.1, 2.6]]);
  const g = fitScales(wing, frame, { chart: false });
  near('a geometric fit uses one scale for both axes', g.sx, g.sy, 1e-12);
  check('and is flagged as uniform', g.uniform === true);
  const ch = fitScales(wing, frame, { chart: true });
  check('a chart fit does not', ch.sx !== ch.sy && ch.uniform === false);

  // A geometric fit of elongated data is legitimately short in one
  // direction; that is the aspect ratio, not a bug.
  check('an elongated wing fits by its long axis',
    Math.abs(g.fillX - 1 / (1 + 0.2)) < 0.05 || g.fillX > 0.7,
    `${(g.fillX * 100).toFixed(0)}%`);

  // Degenerate inputs must not divide by zero.
  const flat = fitScales(boundsOf([[0, 5], [10, 5]]), frame, { chart: false });
  check('a zero-height drawing still fits', Number.isFinite(flat.sx) && flat.sx > 0);
  const empty = fitScales(boundsOf([]), frame, { chart: false });
  check('empty input falls back to a unit box',
    Number.isFinite(empty.sx) && Number.isFinite(empty.oy));

  // Centring: the middle of the data lands in the middle of the frame.
  const centred = fitScales(boundsOf([[-1, -1], [1, 1]]), { width: 400, height: 400 },
    { chart: false });
  near('data is centred in the frame', centred.ox, 200, 1e-9);
  near('and vertically too', centred.oy, 200, 1e-9);
}

// ---------------------------------------------------------------------------
section('Building a whole size family');

{
  const fams2 = parseSizeFamilies(readFileSync('data/reference/size-families.tsv', 'utf8'));
  const geo = fams2['Ozone Geo 7'];
  const base = {
    span: geo[0].flatSpan, rootChord: geo[0].maxChord, tipChord: 0.55,
    tipSweep: 1.25, flatArea: geo[0].flatArea,
    lineLengthM: 6.6, allUpMassKg: geo[0].midWeight,
  };
  const sizes = geo.map((s2) => ({
    name: s2.name,
    k: Math.sqrt(s2.flatArea / geo[0].flatArea),
    lineLengthM: 6.6 * (Math.sqrt(s2.flatArea / geo[0].flatArea) ** 0.85),
    allUpMassKg: s2.midWeight,
    wingMassKg: s2.mass,
  }));

  const fam = buildFamily(base, sizes, {
    airfoil: naca4('4415'), cells: 16, pointsPerSurface: 24,
  });

  check('every size builds', fam.sizes.length === 5);
  check('every size produces panels',
    fam.sizes.every((z) => z.panels && z.panels.length > 0));
  check('every size produces a line schedule',
    fam.sizes.every((z) => z.selection.lines.length > 0 && z.selection.ok));
  check('and a balance solution',
    fam.sizes.every((z) => Number.isFinite(z.balance.speedKMH) && z.balance.speedKMH > 20));

  // The canopy is one shape scaled, so aspect ratio must be identical.
  const ars = fam.summaries.map((s2) => s2.aspectRatio);
  near('aspect ratio is identical across the family',
    Math.max(...ars) - Math.min(...ars), 0, 1e-9);
  check('area rises monotonically',
    fam.summaries.every((s2, i) => i === 0 || s2.flatAreaM2 > fam.summaries[i - 1].flatAreaM2));
  check('and speed with it, since loading rises',
    fam.summaries[4].speedKMH > fam.summaries[0].speedKMH,
    `${fam.summaries[0].speedKMH.toFixed(1)} -> ${fam.summaries[4].speedKMH.toFixed(1)} km/h`);

  // The prediction this was built to test: line loads scale with k^2 while
  // the practical floor does not move, so a small wing's lines are decided
  // almost entirely by handling and a large wing's increasingly by load.
  check('the load-sized fraction rises with size', fam.loadSizedTrend.rises,
    `${(fam.loadSizedTrend.smallest * 100).toFixed(0)}% -> ${(fam.loadSizedTrend.largest * 100).toFixed(0)}%`);
  check('but most lines are floor-sized even on the largest',
    fam.loadSizedTrend.largest < 0.5,
    `${(fam.loadSizedTrend.largest * 100).toFixed(0)}% load-sized`);

  // Thicker lines on bigger wings, so line mass per square metre rises even
  // though the canopy is geometrically similar.
  const massPerM2 = fam.summaries.map((s2) => s2.lineMassG / s2.flatAreaM2);
  check('line mass per square metre rises with size',
    massPerM2[4] > massPerM2[0],
    `${massPerM2[0].toFixed(1)} -> ${massPerM2[4].toFixed(1)} g/m2`);

  // And the floor caps how much line drag can improve with size: a small
  // wing is already on the thinnest line available, so there is nothing to
  // gain there, and a large wing's lines are thicker.
  const cx = fam.summaries.map((s2) => s2.cxLines);
  check('line drag coefficient barely improves across the family',
    Math.abs(cx[4] / cx[0] - 1) < 0.15,
    `${cx[0].toFixed(5)} -> ${cx[4].toFixed(5)}`);

  // Bigger panels nest slightly better.
  const fabPerM2 = fam.summaries.map((s2) => s2.fabricM / s2.flatAreaM2);
  check('fabric per square metre falls slightly with size',
    fabPerM2[4] < fabPerM2[0],
    `${fabPerM2[0].toFixed(2)} -> ${fabPerM2[4].toFixed(2)} m/m2`);

  // Against the published family. The shape is parametric rather than the
  // real Geo 7, so areas differ by a couple of percent; span is set directly
  // and must match.
  // The scale factor is taken from published *area*, quoted to two decimals,
  // so the span it produces differs from the published span by the rounding
  // in both figures — a few millimetres. Asserting to machine precision here
  // would be asserting that two independently rounded numbers agree exactly.
  for (let i = 0; i < geo.length; i++) {
    near(`${geo[i].name}: span reproduced`, fam.summaries[i].flatSpanM, geo[i].flatSpan, 0.01, ' m');
    check(`${geo[i].name}: area within 3% of published`,
      Math.abs(fam.summaries[i].flatAreaM2 - geo[i].flatArea) / geo[i].flatArea < 0.03,
      `${fam.summaries[i].flatAreaM2.toFixed(2)} vs ${geo[i].flatArea} m2`);
  }

  const table = familyTable(fam);
  check('a family table is produced', table.split('\n').length === 6
    && /load-sized/.test(table));

  // A single size builds on its own too.
  const one = buildSize(base, 1.0, { airfoil: naca4('4415'), cells: 12, pointsPerSurface: 20 });
  check('a single size builds standalone', one.panels.length > 0 && one.summary.flatAreaM2 > 0);
}

// ---------------------------------------------------------------------------
section('Diagonal ribs');

{
  const pf4 = planformFromDesignInputs({
    span: 11.6, rootChord: 2.45, tipChord: 0.55, tipSweep: 1.4,
  });
  const af4 = naca4('4415');
  const wing4 = buildWing({
    planform: pf4,
    lobe: buildLobe({ type: 'circle', projectedRatio: 0.86 }, pf4.halfSpan),
    airfoil: af4, cells: 24, pointsPerSurface: 30,
  });

  // A diagonal rib is a fan from one apex to a curve — a cone, and a cone is
  // developable. So unlike the wing's own panels this flattens with no
  // distortion whatever, and the tolerance is machine precision rather than
  // something to be discovered.
  const apex = [0, 0, 0];
  const base = [];
  for (let i = 0; i < 12; i++) {
    const t = (i / 11) * 1.2;
    base.push([Math.cos(t) * 2, Math.sin(t) * 2, 1.5]);
  }
  const err = fanDevelopmentError(apex, base);
  near('cone development preserves every radius exactly', err.worstRadiusM, 0, 1e-12, ' m');
  near('and every base segment exactly', err.worstSegmentM, 0, 1e-12, ' m');

  const flat = developFan(apex, base);
  check('the fan opens to a positive angle', flat.totalAngle > 0 && flat.totalAngle < 2 * Math.PI);
  check('and the outline starts at the apex',
    flat.outline[0][0] === 0 && flat.outline[0][1] === 0);

  // A degenerate fan — every base point at the same place — must not divide
  // by zero.
  const degenerate = developFan([0, 0, 0], [[1, 0, 0], [1, 0, 0], [1, 0, 0]]);
  check('a degenerate fan is handled', degenerate.base.every((p) => p.every(Number.isFinite)));

  // On a real wing.
  const anchorsEvery2 = wing4.ribs.map((_, i) => i).filter((i) => i % 2 === 0);
  const V = buildVRibs({
    wing: wing4, airfoil: af4, anchorRibs: anchorsEvery2,
    rows: ['B', 'C'], baseSpread: 0.18,
  });
  check('diagonals are generated', V.count > 0, `${V.count} diagonals`);
  check('every rib without a line is reached by one',
    V.unsupportedRibs.length === 0, `${V.unsupportedRibs.length} unsupported`);
  check('none runs to a rib that carries its own line',
    V.vribs.every((v) => !anchorsEvery2.includes(v.toRib)));
  check('they cost real fabric', V.totalAreaM2 > 1 && V.totalAreaM2 < 10,
    `${V.totalAreaM2.toFixed(2)} m2`);

  const real = fanDevelopmentError(V.vribs[0].apex, V.vribs[0].base);
  near('a real diagonal develops exactly too', real.worstRadiusM, 0, 1e-12, ' m');

  // Load path. Every unloaded rib's lift has to reach an attachment point,
  // and the diagonals are the only route — so with lines on every second rib,
  // half the half-wing's load travels diagonally. Anything else means the
  // load is being counted twice or lost.
  const plan4 = buildLinePlan({
    wing: wing4, airfoil: af4, layout: RISER_LAYOUTS['A/B/C+D'],
    everyNthRib: 2, lineLengthM: 7.0,
  });
  const L4 = analyseLoads({
    plan: plan4, planform: pf4, stations: wing4.stations,
    totalMassKg: 95, alphaDeg: 6, wingAreaM2: 25.2,
  });
  const vl = vribLoads(V, L4.spanLoad);
  near('half the load travels diagonally when lines are on every second rib',
    vl.fractionThroughDiagonals, 0.5, 0.06);
  check('every diagonal carries something', vl.loads.every((l) => l.loadN > 0));
  check('and the seam loading is reported per metre',
    vl.loads.every((l) => l.seamLengthM > 0));

  // Attaching to every rib needs no diagonals at all.
  const everyRib = buildVRibs({
    wing: wing4, airfoil: af4,
    anchorRibs: wing4.ribs.map((_, i) => i), rows: ['B', 'C'],
  });
  check('a line on every rib needs no diagonals', everyRib.count === 0
    && everyRib.unsupportedRibs.length === 0);

  // A single-cell diagonal cannot reach the middle of a wider gap. That is a
  // genuine rigging constraint, and the tool has to say so rather than
  // silently leaving span unsupported.
  const every4 = wing4.ribs.map((_, i) => i).filter((i) => i % 4 === 0);
  const short = buildVRibs({
    wing: wing4, airfoil: af4, anchorRibs: every4, rows: ['B', 'C'], maxReach: 1,
  });
  check('attaching every fourth rib leaves span unsupported with short diagonals',
    short.unsupportedRibs.length > 0, `${short.unsupportedRibs.length} ribs`);
  const long = buildVRibs({
    wing: wing4, airfoil: af4, anchorRibs: every4, rows: ['B', 'C'], maxReach: 2,
  });
  check('and reaching two cells fixes it', long.unsupportedRibs.length === 0);
  check('at the cost of more fabric', long.totalAreaM2 > short.totalAreaM2,
    `${short.totalAreaM2.toFixed(2)} -> ${long.totalAreaM2.toFixed(2)} m2`);
  // Cutting output. Diagonals cost fabric and have to be cut like anything
  // else, and they nest differently: a panel is long and narrow, a fan is a
  // wedge. The nester copes because it searches orientations against the real
  // outline, so a wedge turned 180 degrees interlocks with its neighbour.
  const vdxf = vribsToDXF(V, { rollWidth: 1.4 });
  check('diagonals export as R12 DXF',
    vdxf.includes('AC1009') && !vdxf.includes('LWPOLYLINE'));
  check('one closed outline per diagonal',
    (vdxf.match(/\nPOLYLINE\n/g) || []).length === V.count);
  check('every POLYLINE is closed by a SEQEND',
    (vdxf.match(/\nPOLYLINE\n/g) || []).length === (vdxf.match(/\nSEQEND\n/g) || []).length);

  const vfab = vribFabricEstimate(V, { rollWidth: 1.4 });
  check('diagonals need a real amount of cloth',
    vfab.linearMetres > 0.5 && vfab.count === V.count,
    `${vfab.linearMetres.toFixed(2)} m for ${vfab.count}`);
  // A cone develops with no change of area at all, so the flat pattern must
  // have exactly the surface area of the diagonal it came from. On the wing's
  // own panels this is only approximately true; here it is exact, and it is
  // the same developability showing up a third way.
  near('flat-pattern area equals surface area exactly',
    vfab.panelArea, vfab.surfaceAreaM2, 1e-9, ' m2');
  check('utilisation is a fraction', vfab.utilisation > 0 && vfab.utilisation <= 1);

  const none = vribFabricEstimate({ vribs: [], totalAreaM2: 0 }, { rollWidth: 1.4 });
  check('a wing with no diagonals needs no cloth for them',
    none.linearMetres === 0 && none.count === 0);

  // ---------------------------------------------------------------------
  // H-ribs: internal sheets that hold the cell to its intended width.
  const H = buildHRibs({
    wing: wing4, chordFrom: 0.25, chordTo: 0.60, heightFraction: 0.35,
  });
  check('one H-rib per cell', H.count === wing4.ribs.length - 1, `${H.count}`);
  check('they cost real fabric', H.totalAreaM2 > 1, `${H.totalAreaM2.toFixed(2)} m2`);
  check('each spans between neighbouring ribs',
    H.hribs.every((h) => h.toRib === h.fromRib + 1));
  check('and has a positive width', H.hribs.every((h) => h.widthM > 0));
  check('the flat pattern has both seams',
    H.hribs.every((h) => h.panel.left.length > 1 && h.panel.right.length > 1));

  // The V and H forms are different classes of surface, and this is where
  // that shows. A V-rib is a cone and develops exactly. An H-rib is a strip
  // between two rib curves — the same class as a sail panel — so it carries a
  // real, if small, distortion.
  check('the H form carries a measurable distortion',
    H.worstDistortion >= 0 && H.worstDistortion < 0.02,
    `${(H.worstDistortion * 100).toFixed(4)}%`);
  const vErr = fanDevelopmentError(V.vribs[0].apex, V.vribs[0].base);
  check('while the V form has none at all', vErr.worstRadiusM < 1e-12);

  const both = internalStructure({
    wing: wing4, airfoil: af4,
    vribOptions: { rows: ['B', 'C'] },
    hribOptions: { chordFrom: 0.25, chordTo: 0.60, heightFraction: 0.35 },
  });
  check('internal structure totals both forms',
    both.pieces === both.vribs.count + both.hribs.count
      && Math.abs(both.totalAreaM2 - (both.vribs.totalAreaM2 + both.hribs.totalAreaM2)) < 1e-9);
  check('and a wing can have diagonals without horizontals',
    internalStructure({ wing: wing4, airfoil: af4, vribOptions: { rows: ['B'] } })
      .hribs.count === 0);

  check('a diagonal never reaches across another attachment rib',
    long.vribs.every((v) => {
      const dir = Math.sign(v.toRib - v.fromRib);
      for (let k = 1; k < Math.abs(v.toRib - v.fromRib); k++) {
        if (every4.includes(v.fromRib + dir * k)) return false;
      }
      return true;
    }));
}

// ---------------------------------------------------------------------------
section('Export');

{
  const wing = demoWing();
  const panels = developWing(wing).slice(0, 8);
  const dxf = panelsToDXF(panels);
  check('DXF has a header and terminator', dxf.startsWith('0\nSECTION') && dxf.trimEnd().endsWith('EOF'));
  check('DXF declares R12', dxf.includes('$ACADVER') && dxf.includes('AC1009'));
  // R12 has no LWPOLYLINE — that entity arrives with R13. Writing one into a
  // file that claims AC1009 is what strict readers and cutting tables reject.
  check('DXF uses R12 POLYLINE, not LWPOLYLINE',
    dxf.includes('POLYLINE') && !dxf.includes('LWPOLYLINE'));
  check('every POLYLINE is closed by a SEQEND',
    (dxf.match(/\nPOLYLINE\n/g) || []).length === (dxf.match(/\nSEQEND\n/g) || []).length);
  check('DXF vertex count matches the geometry',
    (dxf.match(/\nVERTEX\n/g) || []).length ===
      panels.reduce((n, p) => n + p.panel.left.length + p.panel.right.length, 0));

  // Ribs must not be drawn on top of one another: each rib's flat pattern
  // covers a similar chordwise range, so stacking is the difference between
  // a usable cutting file and an unusable one.
  const ribDxf = ribsToDXF(wing);
  const ribYs = [...ribDxf.matchAll(/\n20\n(-?[\d.]+)/g)].map((mm) => parseFloat(mm[1]));
  check('rib export spreads ribs apart', Math.max(...ribYs) - Math.min(...ribYs) > 0.5,
    `span ${(Math.max(...ribYs) - Math.min(...ribYs)).toFixed(2)} m`);

  const svg = panelsToSVG(panels, { rollWidth: 1.4 });
  check('SVG is dimensioned in mm for true-scale printing',
    /width="[\d.]+mm"/.test(svg) && /height="1400\.0mm"/.test(svg));

  const nested = nestPanels(panels, { rollWidth: 1.4, gap: 0.03 });
  check('nesting places every panel', nested.placed.length === panels.length);
  check('every panel fits across the roll',
    nested.placed.every((p) => p.height <= 1.4 + 1e-9));
  check('no panel crosses a roll edge',
    nested.placed.every((p) => p.outline.every(([, y]) => y >= -1e-9 && y <= 1.4 + 1e-9)));
  check('no panel is placed behind the origin',
    nested.placed.every((p) => p.outline.every(([x]) => x >= -1e-9)));

  const est = fabricEstimate(panels, { rollWidth: 1.4, gap: 0.03 });
  check('fabric estimate is positive', est.linearMetres > 0 && est.utilisation > 0);
  check('utilisation is a fraction', est.utilisation <= 1);
  check('nesting beats naive bounding-box packing', est.utilisation > 0.25,
    `utilisation ${(est.utilisation * 100).toFixed(0)}%`);

  // Panels must not overlap. Sampling interior points of each panel against
  // its neighbours' outlines is cheap and catches the failure that would
  // otherwise only show up as ruined fabric.
  let overlaps = 0;
  for (let i = 0; i < nested.placed.length; i++) {
    for (let j = i + 1; j < nested.placed.length; j++) {
      const a = nested.placed[i], b = nested.placed[j];
      if (!boxesTouch(a.outline, b.outline)) continue;
      if (anyVertexInside(a.outline, b.outline) || anyVertexInside(b.outline, a.outline)) overlaps++;
    }
  }
  check('nested panels do not overlap', overlaps === 0, `${overlaps} overlapping pairs`);

  // Display banding. A nested roll is around 27:1, which drawn as one strip
  // fits to width and collapses to a hairline using a few percent of the
  // frame. Wrapping it trades width for height until it roughly matches.
  const L = layoutBands(nested.placed, { rollWidth: 1.4 });
  check('a long roll is wrapped into several bands', L.bands > 1, `${L.bands} bands`);
  check('the wrapped aspect is near the frame aspect',
    L.displayAspect > 0.7 && L.displayAspect < 3.5,
    `${L.displayAspect.toFixed(2)}:1 from ${(L.rollLength / 1.4).toFixed(1)}:1`);
  check('wrapping uses far more of the frame than one strip',
    L.totalHeight / L.bandLength > (1.4 / L.rollLength) * 3);

  // Every panel must land inside a band: whole, and within the roll edges.
  let outside = 0;
  let split = 0;
  for (const p of nested.placed) {
    const q = L.placePanel(p);
    const ys = q.points.map(([, y]) => y);
    const xs = q.points.map(([x]) => x);
    const top = -q.band * (1.4 + L.gapY);
    if (Math.min(...ys) < top - 1e-6 || Math.max(...ys) > top + 1.4 + 1e-6) outside++;
    // A panel drawn whole in one band may run past the nominal band end;
    // what must not happen is it being cut in two.
    if (xs.some((x) => x < -1e-6)) split++;
  }
  check('every panel stays within its band across the roll width', outside === 0,
    `${outside} panels outside`);
  check('no panel is cut in half by the wrapping', split === 0, `${split} split`);

  // The transform must not touch the exports.
  const dxfBefore = panelsToDXF(panels, { nested });
  layoutBands(nested.placed, { rollWidth: 1.4 });
  check('banding does not alter the cutting file',
    panelsToDXF(panels, { nested }) === dxfBefore);

  // A single short panel needs no wrapping.
  const one = layoutBands([nested.placed[0]], { rollWidth: 1.4 });
  check('a short roll is left as one band', one.bands >= 1 && one.bands <= 2);
  check('an empty layout is handled', layoutBands([], { rollWidth: 1.4 }).bands === 1);
}

// ---------------------------------------------------------------------------
section('Metrics must be able to move');

{
  // A systematic sweep of the numbers this project reports, checking each
  // responds to the input it claims to depend on. This exists because one of
  // them did not, for months, while passing every other check.
  const mk = (o = {}) => {
    const pf5 = planformFromDesignInputs({
      span: o.span ?? 11.0, rootChord: o.rootChord ?? 2.4,
      tipChord: o.tipChord ?? 0.6, tipSweep: 1.2,
      ellipticityLE: o.ellipticityLE ?? 0.85,
    });
    const af5 = naca4(o.naca ?? '4415');
    const lobe5 = buildLobe(
      { type: 'circle', projectedRatio: o.projectedRatio ?? 0.86 }, pf5.halfSpan,
    );
    const wing5 = buildWing({
      planform: pf5, lobe: lobe5, airfoil: af5,
      cells: o.cells ?? 16, pointsPerSurface: 24,
      washin: { total: o.washin ?? 4.5, mode: 'linear' },
      zRotation: o.zRotation ?? 'none', alphaDeg: o.alphaDeg ?? 6,
    });
    return { pf: pf5, af: af5, lobe: lobe5, wing: wing5 };
  };

  // Geometry.
  responds('planform area responds to span',
    (v) => planformMetrics(mk({ span: v }).pf).area, 10, 12, { direction: +1 });
  responds('aspect ratio responds to tip chord',
    (v) => planformMetrics(mk({ tipChord: v }).pf).aspectRatio, 0.4, 0.9, { direction: -1 });
  responds('projected span responds to the arc',
    (v) => lobeMetrics(mk({ projectedRatio: v }).lobe, mk().pf.halfSpan).projectedSpan,
    0.80, 0.95, { direction: +1 });
  responds('tip dihedral responds to the arc',
    (v) => lobeMetrics(mk({ projectedRatio: v }).lobe, mk().pf.halfSpan).tipDihedralDeg,
    0.80, 0.95, { direction: -1 });
  responds('section thickness responds to the NACA code',
    (v) => airfoilMetrics(naca4(v)).maxThickness, '4412', '4418', { direction: +1 });

  // Flow alignment.
  // phi is the angle between the rib's *plane* and the glide path. Washin
  // rotates the rib about the spanwise axis — within its own plane — so it
  // cannot change where that plane points. The audit asked whether phi
  // responds to washin and the answer is that it must not: an invariance
  // rather than a dead metric, and worth pinning as one.
  const phiAt = (v) => Math.max(...mk({ washin: v }).wing.ribs.map((r) => Math.abs(r.phiDeg)));
  near('phi is unchanged by washin, which turns the rib in its own plane',
    phiAt(9), phiAt(1), 1e-9, ' deg');
  // While chi, the chord against the glide path, must respond to it.
  responds('but the local angle of attack does respond to washin',
    (v) => mk({ washin: v }).wing.ribs.slice(-1)[0].chiDeg, 1, 9, { direction: +1 });
  responds('worst phi responds to the arc',
    (v) => Math.max(...mk({ projectedRatio: v }).wing.ribs.map((r) => Math.abs(r.phiDeg))),
    0.95, 0.80, { direction: +1 });
  // Development. This is the one that was broken.
  responds('panel distortion responds to rib spacing',
    (v) => {
      const { wing: w } = mk({ cells: v });
      let worst = 0;
      for (let i = 0; i < w.ribs.length - 1; i++) {
        worst = Math.max(worst, developmentError(w.ribs[i].upper, w.ribs[i + 1].upper).worstAbsoluteM);
      }
      return worst;
    }, 32, 6, { direction: +1 });
  responds('seam closure gap responds to the arc',
    (v) => {
      const { wing: w } = mk({ projectedRatio: v });
      return Math.max(...developWing(w).map((p) => p.panel.maxClosureGap));
    }, 0.95, 0.78, { direction: +1 });

  // Panels and nesting.
  responds('ovalized panel width responds to the amount',
    (v) => {
      const p = developWing(mk().wing)[0].panel;
      const o = applyOvalization(p, { amount: v, transitions: DEFAULT_TRANSITIONS.upper });
      const i = Math.floor(o.left.length / 2);
      return Math.hypot(o.right[i][0] - o.left[i][0], o.right[i][1] - o.left[i][1]);
    }, 0.02, 0.10, { direction: +1 });
  responds('fabric length responds to roll width',
    (v) => fabricEstimate(developWing(mk().wing), { rollWidth: v, gap: 0.03 }).linearMetres,
    1.0, 1.8, { direction: -1 });
  responds('display bands respond to roll width',
    (v) => layoutBands(nestPanels(developWing(mk().wing), { rollWidth: v, gap: 0.03 }).placed,
      { rollWidth: v }).bands, 0.9, 1.8, { minChange: 0.1 });

  // Balance and aerodynamics.
  responds('speed responds to pilot mass',
    (v) => solveEquilibrium({ pilotMass: v }).speedKMH, 60, 110, { direction: +1 });
  responds('glide ratio responds to line drag',
    (v) => solveEquilibrium({ cxLines: v }).glideRatio, 0.005, 0.030, { direction: -1 });
  responds('calage responds to angle of attack',
    (v) => solveEquilibrium({ alphaDeg: v }).calageFraction, 3, 9, { minChange: 0.03 });
  responds('lift factor responds to aspect ratio',
    (v) => lift3DFactor(v, 0.9), 4, 7, { direction: +1 });

  // Pressure and loads.
  responds('the A row share responds to angle of attack',
    (v) => rowSharesFromPressure(naca4('4415'),
      { A: 0.085, B: 0.30, C: 0.53, D: 0.78 }, v).shares.A, 2, 10, { direction: +1 });
  responds('centre of pressure responds to angle of attack',
    (v) => centreOfPressure(chordwiseLoading(naca4('4415'), v)), 2, 10, { direction: -1 });
  responds('gust load factor responds to speed',
    (v) => gustLoadFactor({ speedMS: v, wingLoadingNPerM2: 370 }).loadFactor,
    10, 16, { direction: +1 });
  responds('collapse multiplier responds to how much collapses', (v) => {
    const { pf: p6, af: a6, wing: w6 } = mk();
    const plan6 = buildLinePlan({ wing: w6, airfoil: a6, everyNthRib: 2, lineLengthM: 6.8 });
    const l6 = analyseLoads({
      plan: plan6, planform: p6, stations: w6.stations, totalMassKg: 90, alphaDeg: 6,
    });
    return asymmetricCollapse({
      spanLoad: l6.spanLoad, plan: plan6, loads: l6.anchorLoads,
      collapsedSpanFraction: v, dynamicFactor: 1,
    }).multiplier;
  }, 0.25, 0.55, { direction: +1 });

  // Internal structure.
  responds('diagonal count responds to attachment spacing', (v) => {
    const { wing: w7, af: a7 } = mk();
    return buildVRibs({
      wing: w7, airfoil: a7, rows: ['B', 'C'],
      anchorRibs: w7.ribs.map((_, i) => i).filter((i) => i % v === 0),
    }).count;
  }, 2, 3, { minChange: 0.1 });
  responds('diagonal fabric responds to base width', (v) => {
    const { wing: w8, af: a8 } = mk();
    return buildVRibs({ wing: w8, airfoil: a8, rows: ['B'], baseSpread: v }).totalAreaM2;
  }, 0.10, 0.30, { direction: +1 });

  // Speed system.
  responds('angle of attack change responds to travel',
    (v) => alphaChange(riserSet({
      rows: ['A', 'B', 'C'], lengthMM: 500, travelMM: v,
      anchors: { A: 0.09, B: 0.32, C: 0.58 },
    }), 1, 2.4), 100, 200, { direction: -1 });
  responds('brake slack responds to which riser carries the pulley',
    (v) => brakeSlackUnderBar(riserSet({
      rows: ['A', 'B', 'C'], lengthMM: 500, travelMM: 180,
      anchors: { A: 0.09, B: 0.32, C: 0.58 }, brakePulleyOn: v,
    }), 1).extraBrakeTravelMM, 'C', 'A', { direction: +1 });

  // Scaling.
  responds('line length per span responds to aspect ratio',
    (v) => lineLengthPerSpan(v), 4.6, 6.9, { direction: -1 });
  responds('expected loading responds to aspect ratio',
    (v) => expectedLoading(v), 5.0, 6.9, { direction: +1 });
}

// ---------------------------------------------------------------------------
section('End to end');

{
  const wing = demoWing();
  const pm = planformMetrics(wing.planform);
  const pa = projectedArea(wing);
  check('projected area is less than flat area', pa < pm.area);
  check('projected area is a sane fraction', pa / pm.area > 0.7 && pa / pm.area < 1.0);

  const panels = developWing(wing);
  const totalPanelArea = panels.length;
  check('every cell produced two panels', totalPanelArea === (wing.ribs.length - 1) * 2);

  // No NaNs anywhere in the pipeline — the failure mode most likely to slip
  // through silently and produce an unusable cutting file.
  const allPts = wing.ribs.flatMap((r) => r.upper.concat(r.lower)).flat();
  check('no NaN in 3D geometry', allPts.every(Number.isFinite));
  const flatPts = panels.flatMap((p) => p.panel.left.concat(p.panel.right)).flat();
  check('no NaN in developed panels', flatPts.every(Number.isFinite));
}

// ---------------------------------------------------------------------------

/**
 * A small but structurally complete LEP file: whole-wing counts with a
 * half-wing matrix, a wing scale, all eleven geometry columns, and two
 * sections (4 and 21) this project does not model and must not disturb.
 */
function sampleLepFile() {
  const rule = '*'.repeat(58);
  return [
    rule,
    '* LABORATORI D\'ENVOL PARAGLIDING DESIGN                 *',
    rule,
    '*             1. GEOMETRY                               *',
    rule,
    '* Brand name',
    '"Test Lab"',
    '* Wing name',
    '"test-wing"',
    '* Drawing scale',
    '1.0',
    '* Wing scale',
    '2.0',
    '* Number of cells',
    '\t8',
    '* Number of ribs',
    '\t9',
    '* Alpha wingtip, parameter, (alpha center)',
    '\t4.0        0         0.0',
    '* Paraglider type and parameter',
    '"ds" 0',
    '* Rib geometric parameters',
    '* Rib    x-rib   y-LE    y-TE     xp      z     beta    RP    Washin\tRot_z\tPos_z',
    ' 1        0.00    0.00  200.00    0.00   0.00   0.00   25.00   0.00\t0.00\t50.0',
    ' 2      100.00    2.00  195.00   99.00   5.00  10.00   25.00   1.00\t0.60\t50.0',
    ' 3      200.00    8.00  185.00  195.00  20.00  20.00   25.00   2.00\t1.20\t50.0',
    ' 4      300.00   18.00  170.00  285.00  45.00  30.00   25.00   3.00\t1.85\t50.0',
    ' 5      400.00   32.00  150.00  350.00  80.00  40.00   25.00   4.00\t2.50\t50.0',
    rule,
    '*             2. AIRFOILS                               *',
    rule,
    '* Airfoil name. intake in. intake out. open. disp rweight',
    '1\ttest.txt\t1.2\t5.5\t1\t0\t1\t1',
    '2\ttest.txt\t1.2\t5.5\t1\t0\t1\t15',
    '3\ttest.txt\t1.2\t5.5\t1\t0\t1\t15',
    '4\ttest.txt\t1.2\t5.5\t1\t0\t1\t15',
    '5\ttest.txt\t1.2\t5.5\t0\t0\t1\t1',
    rule,
    '*            3. ANCHOR POINTS                           *',
    rule,
    '1\t4\t8.5\t30.0\t53.0\t78.0\t0\t0',
    '2\t4\t8.5\t30.0\t53.0\t78.0\t0\t100',
    '3\t4\t8.5\t30.0\t53.0\t78.0\t0\t100',
    '4\t4\t8.5\t30.0\t53.0\t78.0\t0\t100',
    '5\t4\t8.5\t30.0\t53.0\t78.0\t0\t100',
    rule,
    '*          4. AIRFOIL HOLES                             *',
    rule,
    '1',
    '1',
    '5',
    '1',
    '1 22.0\t2.40\t3.07\t7.15\t0.\t0.\t0.\t0.',
    rule,
    '*           8. Global angle of attack estimation        *',
    rule,
    '* Finesse GR',
    '\t8.0',
    '* Plumb point % of chord',
    '\t30',
    '* Calage %',
    '\t33',
    '* Risers lenght cm',
    '\t47',
    '* Line lenght cm (without risers)',
    '\t650',
    '* Karabiners cm',
    '\t42',
    rule,
    '*       21. JONCS DEFINITION (NYLON RODS)',
    rule,
    '1',
    '1',
    '1 1 5',
    '5.5 10. 1.5 2.0',
    '5. 11. 2.2 2.0',
    '0.0 9.35 6.3 9.35',
  ].join('\n') + '\n';
}

function boxesTouch(a, b) {
  const bb = (p) => p.reduce((o, [x, y]) => ({
    x0: Math.min(o.x0, x), x1: Math.max(o.x1, x),
    y0: Math.min(o.y0, y), y1: Math.max(o.y1, y),
  }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const A = bb(a), B = bb(b);
  return A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1;
}

function anyVertexInside(poly, other) {
  for (const p of poly) if (pointInPoly(p, other)) return true;
  return false;
}

function pointInPoly([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function demoWing() {
  const planform = planformFromDesignInputs({
    span: 10.25, rootChord: 2.6, tipChord: 0.9, tipSweep: 1.1,
  });
  const lobe = buildLobe({ type: 'circle', projectedRatio: 0.88 }, planform.halfSpan);
  const airfoil = naca4('4415');
  const wing = buildWing({ planform, lobe, airfoil, cells: 12, pointsPerSurface: 40 });
  wing.planform = planform;
  return wing;
}

console.log(`\n${'='.repeat(60)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
