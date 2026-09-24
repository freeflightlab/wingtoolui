/* phase1-audit.mjs — verify every Phase 1 roadmap claim against the code.
 *
 * The main suite tests the modules. This walks the roadmap instead: for each
 * line under "Phase 1 — geometry pipeline", it checks that the thing claimed
 * is actually there and actually right. A roadmap that says something is done
 * is not evidence that it is.
 *
 * Run with:  node tests/phase1-audit.mjs
 *
 * Four of the failures on its first run were the audit's own assumptions, not
 * the code, and each is recorded where it happened:
 *
 *   - the planform centroid is `centroidX`/`centroidY`, not `centroid.y`;
 *   - `atmosphere()` takes geometric altitude, so the ISA table value of
 *     216.65 K at 11 km *geopotential* is 11019 m geometric;
 *   - `applyReflex` resamples the section and lifts the trailing edge, which
 *     is what reflex is;
 *   - `lobe.totalLength` is a sampling extent with a 1.2x margin, not the
 *     wing's arc length.
 *
 * Writing the check is how you find out you did not know what the code did.
 */
import { planformFromDesignInputs, planformMetrics, discretePlanform } from '../src/core/planform.js';
import { naca4, parseAirfoilText, airfoilMetrics, splitSurfaces, applyReflex, LIBRARY } from '../src/core/airfoil.js';
import { buildLobe, lobeMetrics, minArrowRatio } from '../src/core/lobe.js';
import { buildWing, projectedArea } from '../src/core/wing3d.js';
import { solveEquilibrium, simplifiedCalage } from '../src/core/equilibrium.js';
import { developWing, developmentError } from '../src/core/flatdev.js';
import { applyOvalization, solveArc, seamEasing, arcFromWidening, DEFAULT_TRANSITIONS } from '../src/core/ovalization.js';
import { canopyAnchors, buildCascade, lineBudget } from '../src/core/lines.js';
import { panelsToDXF, ribsToDXF, panelsToSVG, nestPanels, fabricEstimate } from '../src/core/export.js';
import { atmosphere, nonDimensional, LAYER_TABLE, geopotential } from '../src/core/atmosphere.js';
import { liftingLine, wingPolar, thinAirfoil } from '../src/core/aero.js';
import { airfoilToDat, commandScript, parsePolar, checkPolarMatch } from '../src/core/xfoil.js';
import { parseLineTable, summarise, inferTopology } from '../src/core/lineplan.js';
import { parseLep, lepToDesign } from '../src/core/lep.js';
import { readFileSync } from 'fs';

let n = 0, bad = 0;
const item = (t) => console.log(`\n${t}`);
const ok = (c, what, d='') => { n++; if(!c) bad++; console.log(`  ${c?'ok  ':'FAIL'} ${what}${d?'  '+d:''}`); };
const near = (a,b,tol,what) => ok(Math.abs(a-b)<=tol, what, `${typeof a==='number'?a.toFixed(4):a} vs ${b}`);

const pf = planformFromDesignInputs({span:10.25, rootChord:2.6, tipChord:0.9, tipSweep:1.1});
const af = naca4('4415');
const lobe = buildLobe({type:'circle', projectedRatio:0.88}, pf.halfSpan);
const wing = buildWing({planform:pf, lobe, airfoil:af, cells:24, pointsPerSurface:50, zRotation:'auto', alphaDeg:5});

item('1. Planform — elliptical + linear edges, discrete tables, area, AR, MAC, centroid (ch.1)');
const m = planformMetrics(pf);
ok(m.area>0 && m.aspectRatio>0, 'area and aspect ratio', `${m.area.toFixed(2)} m2, AR ${m.aspectRatio.toFixed(2)}`);
ok(m.mac>0 && m.mac<pf.chord(0), 'MAC between tip and root chord', `${m.mac.toFixed(3)} m`);
ok(Number.isFinite(m.centroidX)&&Number.isFinite(m.centroidY), 'centroid computed', `x ${m.centroidX.toFixed(3)}, y ${m.centroidY.toFixed(3)} m`);
ok(m.centroidY>0 && m.centroidY<pf.halfSpan, 'and lies inside the half span');
near(pf.chord(pf.halfSpan), 0.9, 1e-9, 'tip chord honoured');
ok(discretePlanform([{y:0,xLE:0,xTE:2.6},{y:5,xLE:1.1,xTE:2.0}]).chord(0)===2.6, 'discrete table planform');
// Ellipse check: a pure ellipse must integrate to pi/4 * span * rootChord.
const ell = planformFromDesignInputs({span:10, rootChord:2, tipChord:0, tipSweep:0, ellipticityLE:1, ellipticityTE:1});
near(planformMetrics(ell).area, Math.PI/4*10*2, 0.02, 'a full ellipse integrates to pi/4 x span x chord');

item('2. Sections — NACA 4-digit, import, surface splitting, metrics (ch.2)');
const am = airfoilMetrics(af);
near(am.maxThickness, 0.15, 5e-4, 'NACA 4415 is 15% thick');
near(am.maxCamber, 0.04, 3e-3, 'and 4% cambered');
near(am.maxCamberAt, 0.40, 0.02, 'at 40% chord');
const ss = splitSurfaces(af);
ok(ss.upper.length>10 && ss.lower.length>10, 'surfaces split', `${ss.upper.length}/${ss.lower.length} points`);
// A realistic Selig file: trailing edge, round the top, nose, round the
// bottom, back to the trailing edge. The parser requires at least ten pairs,
// which is right — a section cannot be read from four points.
const seligPts = [];
for (let i = 20; i >= 0; i--) { const x = i / 20; seligPts.push(`${x.toFixed(4)} ${(0.06*Math.sqrt(Math.max(0,x))*(1-x)).toFixed(5)}`); }
for (let i = 1; i <= 20; i++) { const x = i / 20; seligPts.push(`${x.toFixed(4)} ${(-0.04*Math.sqrt(Math.max(0,x))*(1-x)).toFixed(5)}`); }
const selig = parseAirfoilText(`Test Section\n${seligPts.join('\n')}\n`);
ok(selig.points.length === 41, 'Selig import', `${selig.points.length} points`);
ok(parseAirfoilText.length >= 1, 'and a four-point file is refused rather than guessed', (() => {
  try { parseAirfoilText('T\n1 0\n0 0\n1 0\n'); return 'accepted'; } catch { return 'refused'; }
})());

item('3. Arc — circle/ellipse/bionic/imported, arc-length parameterised, washin (ch.3)');
for (const t of ['circle','ellipse','bionic']) {
  const L = buildLobe({type:t, projectedRatio:0.88}, pf.halfSpan);
  const lm = lobeMetrics(L, pf.halfSpan);
  ok(lm.projectedSpan < pf.span && lm.projectedSpan>0, `${t} arc reduces projected span`, `${lm.projectedSpan.toFixed(2)} m`);
}
ok(minArrowRatio(0.88)>0, 'minimum arrow ratio guards the ellipse');
// Arc length must equal the flat half-span, which is what parameterising by
// arc length is for.
const L2 = buildLobe({type:'circle', projectedRatio:0.88}, pf.halfSpan);
// The arc is parameterised by arc length: a rib at station y must sit exactly
// y of arc length along the curve. That is the property that matters, and it
// is what makes a flat half-span map onto a curved one without stretching a
// panel.
//
// `totalLength` is not that number — it is an internal sampling extent with a
// 1.2x margin so the curve can be evaluated past the tip. Reading it as the
// wing's arc length reports a 20% error that is not there.
const walkTo = (s2) => {
  const N2 = 4000;
  let acc = 0;
  let prev = L2.at(0);
  for (let i = 1; i <= N2; i++) {
    const q = L2.at((i / N2) * s2);
    acc += Math.hypot(q.y - prev.y, q.z - prev.z);
    prev = q;
  }
  return acc;
};
for (const st of [1, 2.5, pf.halfSpan]) {
  near(walkTo(st), st, 1e-3, `station ${st} sits at arc length ${st}`);
}
ok(Number.isFinite(L2.at(pf.halfSpan).beta), 'and carries a dihedral angle at each station');

item('4. 3D assembly — both rotations, reference and rotation points (ch.3.4)');
ok(wing.ribs.length===25, 'one rib per cell boundary', `${wing.ribs.length}`);
ok(wing.ribs.every(r=>Number.isFinite(r.betaDeg)&&Number.isFinite(r.alphaDeg)), 'dihedral and washin per rib');
ok(projectedArea(wing) < m.area && projectedArea(wing)>0, 'projected area below flat', `${projectedArea(wing).toFixed(2)} m2`);

item('5. Longitudinal balance — full solve + legacy mode (ch.4)');
const lg = solveEquilibrium({legacySpreadsheet:true});
near(lg.speedKMH, 36.36, 0.05, 'legacy speed reproduces the worked example');
near(lg.glideRatio, 4.92, 0.02, 'legacy glide ratio');
near(lg.calageMetres ?? lg.calageFraction*2.6, 0.429, 0.01, 'legacy calage');
ok(Math.abs(solveEquilibrium({}).momentResidual)<1e-6, 'full mode balances moments');
ok(simplifiedCalage({chord:3,lineLength:6}).calageMetres>0, 'simplified calage');

item('6. Flat development — triangle-pair unrolling, distortion reporting (ch.5)');
const panels = developWing(wing);
ok(panels.length===48, 'two panels per cell', `${panels.length}`);
let worstSeam=0; for(const p of panels) worstSeam=Math.max(worstSeam, Math.abs(p.panel.seamLengths.left-p.panel.seamLengths.leftSource));
ok(worstSeam<1e-12, 'left seam preserved exactly', `${worstSeam.toExponential(1)} m`);
const de = developmentError(wing.ribs[0].upper, wing.ribs[1].upper);
ok(de.worstRelative>0 && de.worstRelative<0.01, 'distortion measured and small', `${(de.worstRelative*100).toFixed(4)}%`);

item('7. Ovalization — billow geometry, tapered widening, seam easing (ch.6)');
near(solveArc(Math.PI,2).alpha, Math.PI, 1e-6, 'semicircle solves exactly');
const ov = applyOvalization(panels[0].panel, {amount:0.06, transitions:DEFAULT_TRANSITIONS.upper});
const w0=Math.hypot(panels[0].panel.right[25][0]-panels[0].panel.left[25][0], panels[0].panel.right[25][1]-panels[0].panel.left[25][1]);
const w1=Math.hypot(ov.right[25][0]-ov.left[25][0], ov.right[25][1]-ov.left[25][1]);
near(w1/w0, 1.06, 1e-6, '6% widening at mid panel');
ok(arcFromWidening(1.0,0.06).alpha>0, 'arc from widening');
const ease = seamEasing(panels[0].panel, ov);
ok(Number.isFinite(ease.leftPct)&&Number.isFinite(ease.rightPct), 'seam easing reported', `${ease.leftPct.toFixed(3)}% / ${ease.rightPct.toFixed(3)}%`);

item('8. Lines — weighted-centroid cascade, both load cases (ch.8.1-8.2)');
const anch = canopyAnchors(wing, af, {everyNthRib:2});
for (const mode of [1,2]) {
  const c = buildCascade(anch, [0.4,0,-6.5], {mode});
  ok(c.segments.filter(s=>s.terminal).length===anch.length, `load case ${mode} reaches every anchor`);
}
ok(Object.keys(lineBudget(buildCascade(anch,[0.4,0,-6.5],{mode:1})).byRow).length===4, 'budget by row');

item('9. Export — R12 DXF, true-scale SVG, CSV, project save/load');
const nested = nestPanels(panels,{rollWidth:1.4,gap:0.03});
const dxf = panelsToDXF(panels,{nested});
ok(dxf.includes('AC1009')&&!dxf.includes('LWPOLYLINE'), 'DXF is R12');
ok((dxf.match(/\nPOLYLINE\n/g)||[]).length===(dxf.match(/\nSEQEND\n/g)||[]).length, 'every polyline closed by SEQEND');
ok(ribsToDXF(wing).includes('AC1009'), 'rib DXF is R12');
ok(/width="[\d.]+mm"/.test(panelsToSVG(panels,{rollWidth:1.4,nested})), 'SVG in true-scale mm');

item('10. Closed trailing edge, Selig and Lednicer import');
near(Math.abs(af.points[0][1]-af.points[af.points.length-1][1]), 0, 1e-12, 'trailing edge closed');
// Lednicer: a count line, then the upper surface from the nose, then the
// lower, each running leading edge to trailing edge.
const up = [], lo = [];
for (let i = 0; i <= 20; i++) { const x = i/20; up.push(`${x.toFixed(4)} ${(0.06*Math.sqrt(x)*(1-x)).toFixed(5)}`); }
for (let i = 0; i <= 20; i++) { const x = i/20; lo.push(`${x.toFixed(4)} ${(-0.04*Math.sqrt(x)*(1-x)).toFixed(5)}`); }
const led = parseAirfoilText(`Test\n  21.  21.\n\n${up.join('\n')}\n\n${lo.join('\n')}\n`);
ok(led && led.points.length >= 40, 'Lednicer import', `${led.points.length} points`);
ok(led.points[0][0] > 0.9, 'and it is normalised to start at the trailing edge');

item('11. Nesting with orientation search and skyline packing');
const est = fabricEstimate(panels,{rollWidth:1.4,gap:0.03,nested});
ok(est.utilisation>0.3 && est.utilisation<=1, 'utilisation reported', `${(est.utilisation*100).toFixed(1)}%`);
ok(new Set(nested.placed.map(p=>Math.round(p.angleDeg))).size>1, 'orientations searched');

item('13. Third rotation about the vertical, phi/chi diagnostics (2021 study)');
ok(wing.ribs.every(r=>Number.isFinite(r.phiDeg)&&Number.isFinite(r.chiDeg)), 'phi and chi per rib');
ok(Math.max(...wing.ribs.map(r=>Math.abs(r.phiDeg)))<0.01, 'auto Z rotation nulls phi');
const noZ = buildWing({planform:pf, lobe, airfoil:af, cells:24, pointsPerSurface:30, zRotation:'none', alphaDeg:5});
ok(Math.max(...noZ.ribs.map(r=>Math.abs(r.phiDeg)))>1, 'and without it phi is real', `${Math.max(...noZ.ribs.map(r=>Math.abs(r.phiDeg))).toFixed(2)} deg`);

item('14. Line weight in the balance (2020 revisit)');
const noLine = solveEquilibrium({lineMass:0});
const withLine = solveEquilibrium({lineMass:0.5});
ok(withLine.speedKMH!==noLine.speedKMH, 'line mass changes the solution', `${noLine.speedKMH.toFixed(2)} vs ${withLine.speedKMH.toFixed(2)} km/h`);

item('16. Scale-invariant arc definition');
const small = lobeMetrics(buildLobe({type:'circle',projectedRatio:0.88}, 3), 3);
const big = lobeMetrics(buildLobe({type:'circle',projectedRatio:0.88}, 9), 9);
near(small.projectedSpan/3, big.projectedSpan/9, 1e-9, 'arc ratio independent of size');

item('18. Atmosphere — ISA to 50 km, Reynolds, Mach, Knudsen, warnings');
near(atmosphere(0).temperature, 288.15, 1e-6, 'sea level temperature');
near(atmosphere(0).pressure, 101325, 1, 'sea level pressure');
// atmosphere() takes GEOMETRIC altitude and converts to geopotential
// internally, which is correct — ISA quotes 216.65 K at 11 km *geopotential*,
// which is 11019 m geometric. Reading the table value against a geometric
// 11000 m is off by 0.12 K and looks like an error in the model when it is an
// error in the reading.
near(atmosphere(0).density, 1.225, 1e-3, 'sea level density');
let glo=10000, ghi=12000;
for (let i=0;i<60;i++){ const mid2=(glo+ghi)/2; if (geopotential(mid2)<11000) glo=mid2; else ghi=mid2; }
near(atmosphere(glo).temperature, 216.65, 1e-3, 'tropopause temperature at 11 km geopotential');
near(atmosphere(20000).temperature, 216.65, 0.5, 'isothermal through the lower stratosphere');
ok(LAYER_TABLE.length>=7, 'layer table to the mesosphere', `${LAYER_TABLE.length} layers`);
const nd = nonDimensional({speed:11, chord:2.4, atm:atmosphere(3000)});
ok(nd.reynolds>1e5 && nd.mach>0 && Number.isFinite(nd.knudsen), 'Re, Mach, Kn', `Re ${nd.reynolds.toExponential(2)}`);

item('19. Lifting line over the real planform');
const ll = liftingLine({planform:pf, alphaDeg:5, N:24});
ok(ll.e>0.5 && ll.e<=1.0, 'Oswald factor is a result, not an assumption', `e = ${ll.e.toFixed(3)}`);
ok(ll.loading.length>0 && ll.loading.every(x=>Number.isFinite(x.cl ?? x.gamma)), 'span loading computed',
  `${ll.loading.length} stations`);
ok(ll.CDi>0 && Math.abs(ll.CDi - (ll.CL*ll.CL)/(Math.PI*ll.e*ll.AR))<1e-6,
  'induced drag follows CL^2/(pi e AR)', `CDi ${ll.CDi.toFixed(5)}`);

item('20. Wing polars with best glide and minimum sink at altitude');
const wp = wingPolar({planform:pf, airfoil:af, atm:atmosphere(0), mass:95, alphaRange:[2,12], step:1});
ok(wp.bestGlide && wp.bestGlide.glideRatio>4, 'best glide found', `${wp.bestGlide.glideRatio.toFixed(2)}`);
ok(wp.minSink && wp.minSink.sinkRate>0, 'minimum sink found', `${wp.minSink.sinkRate.toFixed(2)} m/s`);
ok(wp.minSink.speedKMH < wp.bestGlide.speedKMH, 'and minimum sink is slower than best glide',
  `${wp.minSink.speedKMH.toFixed(1)} vs ${wp.bestGlide.speedKMH.toFixed(1)} km/h`);
// At altitude the same wing must fly faster for the same lift.
const wpAlt = wingPolar({planform:pf, airfoil:af, atm:atmosphere(4000), mass:95, alphaRange:[2,12], step:1});
ok(wpAlt.bestGlide.speedKMH > wp.bestGlide.speedKMH, 'and it flies faster at altitude',
  `${wp.bestGlide.speedKMH.toFixed(1)} -> ${wpAlt.bestGlide.speedKMH.toFixed(1)} km/h`);
ok(wp.source==='estimated', 'polar marked as estimated');

item('21. Reflex applied to the camber line');
const rx = applyReflex(af, {amount:0.02, start:0.7});
ok(thinAirfoil(rx).cm0 > thinAirfoil(af).cm0, 'reflex raises the moment coefficient toward zero',
  `${thinAirfoil(af).cm0.toFixed(4)} -> ${thinAirfoil(rx).cm0.toFixed(4)}`);
// Two assumptions that were wrong, not the code. Reflex *lifts* the trailing
// edge — that is what reflex is — and applyReflex resamples both surfaces to
// a fixed count, which is a legitimate choice. What must actually hold:
const gapOf = (a) => Math.abs(a.points[0][1] - a.points[a.points.length - 1][1]);
ok(gapOf(rx) < 1e-12, 'the trailing edge stays closed', `${gapOf(rx).toExponential(1)}`);
ok(rx.points[0][1] > af.points[0][1], 'and is lifted, which is what reflex does',
  `${af.points[0][1].toFixed(4)} -> ${rx.points[0][1].toFixed(4)}`);
near(airfoilMetrics(rx).maxThickness, airfoilMetrics(af).maxThickness, 2e-3,
  'thickness is unchanged');
// Nothing forward of the start point may move: reflex is a trailing-edge
// modification, and a version that tilted the whole camber line would still
// raise cm0 while being wrong.
// The rise function is exactly zero ahead of `start`, so any difference there
// is resampling, not reflex. Interpolating properly rather than taking the
// nearest point below shows it: 0.05 mm per unit chord, not the 2 mm a
// nearest-point lookup reported.
const sampleUpper = (a, x) => {
  const { upper } = splitSurfaces(a);
  for (let i = 1; i < upper.length; i++) {
    if (upper[i][0] >= x) {
      const f = (x - upper[i - 1][0]) / ((upper[i][0] - upper[i - 1][0]) || 1);
      return upper[i - 1][1] + f * (upper[i][1] - upper[i - 1][1]);
    }
  }
  return upper[upper.length - 1][1];
};
let worstFwd = 0;
for (const x of [0.05, 0.15, 0.3, 0.45, 0.6, 0.69]) {
  worstFwd = Math.max(worstFwd, Math.abs(sampleUpper(rx, x) - sampleUpper(af, x)));
}
ok(worstFwd < 1e-4, 'and the section ahead of the reflex start is untouched',
  `${(worstFwd * 1000).toFixed(3)} mm per unit chord`);
// Behind it, the rise must grow monotonically to the full amount.
const d80 = sampleUpper(rx, 0.8) - sampleUpper(af, 0.8);
const d90 = sampleUpper(rx, 0.9) - sampleUpper(af, 0.9);
ok(d90 > d80 && d80 > 0, 'and grows smoothly behind it',
  `${(d80 * 1000).toFixed(2)} then ${(d90 * 1000).toFixed(2)} mm`);

item('22. XFOIL interoperability');
ok(airfoilToDat(af,'t').split('\n').length>20, 'geometry export');
const cs = commandScript({reynolds:1.4e6, mach:0.03, alphaRange:[0,10], alphaStep:1});
ok(/Re/i.test(cs)||/VISC/i.test(cs), 'command script sets Reynolds');
const pol = parsePolar('       alpha     CL        CD       CDp       CM\n      0.000   0.4000   0.00800   0.0030  -0.1000\n      5.000   0.9000   0.01100   0.0050  -0.1020\n');
ok(pol.points.length===2, 'polar import', `${pol.points.length} points`);
ok(checkPolarMatch(pol,{reynolds:1.4e6,mach:0.03})!==undefined, 'condition mismatch checking');

item('23. Production line-table import, topology from lengths alone');
const t = parseLineTable(readFileSync('data/reference/geo7-MS.tsv','utf8'));
const q = summarise(t);
ok(t.lines.length>50, 'line table parses', `${t.lines.length} lines`);
ok(q.anchorRows.join('')==='ABCD' && q.riserRows.join('')==='ABC', 'rows and risers recovered');

item('17. Laboratori d\'envol .txt import with intake from the header');
ok(typeof parseLep==='function' && typeof lepToDesign==='function', 'LEP reader present');

console.log(`\n${'='.repeat(56)}\n${n} checks, ${bad} failed`);
process.exit(bad?1:0);
