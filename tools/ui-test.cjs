// Unimplemented stub methods THROW rather than returning empty.
//
// Two checks in this project were silently defeated by this file. A button
// test used `querySelectorAll`, which returned `[]` unconditionally, and
// reported "0 buttons pressed, none threw" — as a pass. A line-plan test read
// `innerHTML`, whose getter returns '' always, and failed a view that was
// working perfectly.
//
// A stub that returns empty does not fail; it agrees with you. Both of those
// probes would have passed a completely broken interface just as happily. So
// the methods this file does not implement now say so.
//
// The DOM stand-in and the booted bundle are shared with the control probe.
const { errors, REPLACES_DESIGN } = require('./dom-shim.cjs');

if (!errors.length) {
  const M = globalThis.__getM(), S = globalThis.__S;
  console.log('boot OK');
  console.log(`  wing: ${M.metrics.area.toFixed(2)} m2, AR ${M.metrics.aspectRatio.toFixed(2)}, ${M.wing.ribs.length} ribs`);
  console.log(`  panels: ${M.panels.length}, worst distortion ${(M.worstDev*100).toFixed(3)}%`);
  console.log(`  balance: ${M.balance.speedKMH.toFixed(1)} km/h, GR ${M.balance.glideRatio.toFixed(2)}, calage ${(M.balance.calageFraction*100).toFixed(1)}%`);
  console.log(`  line plan: ${M.linePlan.lines.length} lines a side, ${M.vribs.count} diagonals a side on rows ${[...new Set(M.vribs.vribs.map((v) => v.row))].join('')}`);
  console.log(`  rebuild: ${M.ms.toFixed(0)} ms`);

  // Exercise parameter changes the way the sliders do.
  const cases = [
    ['high aspect ratio', ()=>{S.span=13.5;S.rootChord=2.3;S.tipChord=0.55;S.cells=32;}],
    ['ellipse arc',       ()=>{S.lobeType='ellipse';S.lobeARatio=0.84;S.lobeBRatio=0.5;}],
    ['bionic arc',        ()=>{S.lobeType='bionic';S.bionic=2.2;}],
    ['heavy washin',      ()=>{S.washinTotal=9.5;S.washinMode='chord';}],
    ['no ovalization',    ()=>{S.applyOval=false;}],
    ['legacy balance',    ()=>{S.legacy=true;}],
    ['tiny wing',         ()=>{S.span=4.2;S.rootChord=1.0;S.tipChord=0.15;S.cells=6;S.lobeType='circle';}],
    ['narrow roll',       ()=>{S.rollWidth=0.9;}],
    ['extreme RL/RP',     ()=>{S.RL=0.85;S.RP=0.05;}],
    ['flow alignment on',  ()=>{S.RL=0.5;S.RP=0.25;S.span=10.25;S.rootChord=2.6;S.tipChord=0.9;S.cells=24;S.zRotation='auto';}],
    ['line mass',          ()=>{S.lineMass=0.8;}],
    ['zero washin + auto Z',()=>{S.washinTotal=0;}],
    ['load Zeno 2 L',      ()=>{S.reference='Ozone Zeno 2 L';}],
    ['load Ultralite 13',  ()=>{S.reference='Ozone Ultralite 5 13';}],
    ['load SAGE 95',       ()=>{S.reference='Skywalk SAGE 95';}],
    ['billow from pressure',()=>{S.ovalFromPressure=true;S.applyOval=true;}],
    ['billow flat',        ()=>{S.ovalFromPressure=false;S.applyOval=true;}],
    ['intake shown',       ()=>{S.showIntake=true;}],
    ['intake too short',   ()=>{S.showIntake=true;S.intakeEnd=2;}],
    ['stabilo off',        ()=>{S.stabilo=false;}],
    ['stabilo on',         ()=>{S.stabilo=true;}],
    ['brakes off',         ()=>{S.brakeLines=false;}],
    ['brakes on',          ()=>{S.brakeLines=true;}],
    ['holes off',          ()=>{S.ribHoles=false;}],
    ['merge AB',           ()=>{S.washinTotal=4.5;S.mergeRows='AB';}],
    ['merge AB+CD',        ()=>{S.mergeRows='AB+CD';}],
    ['unmerged again',     ()=>{S.mergeRows='none';}],
    ['altitude 10 km',    ()=>{S.washinTotal=4.5;S.altitudeM=10000;}],
    ['altitude 20 km',    ()=>{S.altitudeM=20000;}],
    ['altitude 35 km',    ()=>{S.altitudeM=35000;}],
    ['altitude 50 km',    ()=>{S.altitudeM=50000;}],
    ['cold day -40K',     ()=>{S.altitudeM=2000;S.deltaISA=-40;}],
    ['hot day +40K',      ()=>{S.deltaISA=40;}],
    ['reflex 1.5%',       ()=>{S.deltaISA=0;S.reflex=1.5;}],
    ['reflex 3% far aft', ()=>{S.reflex=3;S.reflexStart=85;}],
    ['sea level, no reflex',()=>{S.altitudeM=0;S.reflex=0;S.reflexStart=65;}],
  ];
  for (const [name, mutate] of cases){
    mutate();
    try {
      globalThis.__rebuild();
      const m = globalThis.__getM();
      const ok = !m.error && isFinite(m.metrics.area) && isFinite(m.balance.speedKMH) && m.panels.length>0;
      const nan = m.wing.ribs.flatMap(r=>r.upper.concat(r.lower)).flat().some(v=>!isFinite(v));
      const bg=m.polar.bestGlide;
      console.log(`  ${ok&&!nan?'ok  ':'FAIL'} ${name.padEnd(21)} ${m.metrics.area.toFixed(2)} m2  rho ${m.atm.density.toExponential(2)}  Re ${m.nd.reynolds.toExponential(2)}  M ${m.nd.mach.toFixed(3)}  L/D ${bg?bg.glideRatio.toFixed(2):'--'}  Cm0 ${m.thin.cm0.toFixed(4)}  flags ${m.nd.flags.length}${nan?' [NaN!]':''}`);
      if(!ok||nan) errors.push(name + (m.error? ': '+m.error : ''));
    } catch(e){ errors.push(`${name}: ${e.message}`); console.log(`  FAIL ${name}: ${e.message}`); }
  }
}
// Where the regime flags say the models fail, the glide figures are withheld
// rather than printed beside the flag: at 50 km the readout showed glide 8.48
// and L/D 7.25 next to "incompressible and Prandtl-Glauert models both fail".
{
  const S2 = globalThis.__S;
  const texts = (n, out = []) => { if (!n) return out; if (n._text) out.push(n._text); for (const c of n.children || []) texts(c, out); return out; };
  const after = (list, k) => { const i = list.indexOf(k); return i >= 0 ? list[i + 1] : undefined; };
  const keepAlt = S2.altitudeM;
  const seen = {};
  for (const alt of [1000, 50000]) {
    S2.altitudeM = alt; globalThis.__rebuild(); globalThis.__tab('analysis');
    const ro = texts(document.getElementById('readout'));
    const bt = texts(document.getElementById('balanceTable'));
    seen[alt] = { glide: after(ro, 'glide'), ld: after(ro, 'L/D est'), speed: after(ro, 'speed'),
      regime: after(bt, 'Regime'), balanceGlide: after(bt, 'Glide ratio'),
      errors: globalThis.__getM().nd.flags.filter((f) => f.level === 'error').length };
  }
  S2.altitudeM = keepAlt; globalThis.__rebuild();
  const low = seen[1000], high = seen[50000];
  const okLow = /^\d+\.\d\d$/.test(low.glide || '') && /^\d+\.\d\d$/.test(low.ld || '') && low.regime === undefined;
  const okHigh = high.errors > 0 && high.glide === '—' && high.ld === '—' && high.balanceGlide === '—'
    && /not computed: M > 0\.8/.test(high.regime || '') && /km\/h$/.test(high.speed || '');
  if (!okLow || !okHigh) errors.push(`glide withheld outside the models: 1 km ${JSON.stringify(low)}, 50 km ${JSON.stringify(high)}`);
  console.log(`  ${okLow && okHigh ? 'ok  ' : 'FAIL'} glide figures at 1 km ${low.glide}/${low.ld}; at 50 km withheld (${high.regime})`);
}
// "Solve anchors to the line length": the derived plan attaches every second
// rib whatever the wing, which put a Zeno 2 S at 466 m of line against its
// published 186. The solve writes the anchor counts out as a cascade.
{
  const S2 = globalThis.__S;
  const keep = { reference: S2.reference, riserLayout: S2.riserLayout, useCascadeSpec: S2.useCascadeSpec, cascadeSpec: S2.cascadeSpec };
  const pressSolve = () => {
    globalThis.__buttons.length = 0; globalThis.__controls();
    const btn = globalThis.__buttons.find((x) => x.text === 'Solve anchors to the line length');
    if (!btn) throw new Error('no "Solve anchors to the line length" button');
    btn.fn();
    return globalThis.__getM();
  };
  // From the derived plan: the picker now gives a wing its own cascade, or
  // one already solved, so the solve is pressed on every second rib here.
  const load = (ref, layout) => {
    S2.reference = ref; globalThis.__rebuild(); globalThis.__controls();
    S2.useCascadeSpec = false;
    if (layout) S2.riserLayout = layout;
    globalThis.__rebuild();
  };
  const results = [];
  for (const [ref, layout] of [['Ozone Geo 7 MS', 'A/B/C+D'], ['Ozone Alpina 5 ML', 'A/B+C'], ['Skywalk SAGE 95', 'A/B+C']]) {
    load(ref, layout);
    const before = globalThis.__getM().linePlan.totalLengthM;
    const m = pressSolve();
    const pub = S2._referenceTotalLineM;
    const off = m.linePlan.totalLengthM / pub - 1;
    // And the text it writes is the plan on the page, every count of it.
    const ok = S2.useCascadeSpec && m.writtenCascade?.ok && Math.abs(off) < 0.05
      && Math.abs(before / pub - 1) > Math.abs(off) && m.loads.closureError < 0.001
      && m.lineSelection.lines.every((l) => l.line) && m.linePlan.levelShortfalls.length === 0;
    results.push({ ref, ok, text: `${ref} ${before.toFixed(0)} -> ${m.linePlan.totalLengthM.toFixed(0)} m against ${pub}` });
  }
  // A two-liner's total under a three-riser layout: the edge, and the layout
  // named as the cause.
  load('Ozone Zeno 2 S', 'A/B/C+D');
  pressSolve();
  const edgeSaid = /sparsest real density/.test(S2.cascadeSpec) && /two-riser layout/.test(S2.cascadeSpec)
    && !/more ribs/.test(S2.cascadeSpec);
  results.push({ ref: 'Zeno 2 S on three risers', ok: edgeSaid, text: 'Zeno 2 S on three risers names the layout' });
  Object.assign(S2, keep); globalThis.__rebuild(); globalThis.__controls(); globalThis.__rebuild();
  const bad = results.filter((r) => !r.ok);
  if (bad.length) errors.push(`anchor solve: ${bad.map((r) => r.text).join('; ')}`);
  console.log(`  ${bad.length ? 'FAIL' : 'ok  '} anchors solved to the published line length: ${results.map((r) => r.text).join('; ')}`);
}
// A written cascade is built as written: the middle count was parsed and
// dropped, so "A 14 7 3" built six middle lines, paired from the anchors.
{
  const S2 = globalThis.__S;
  const keep = { reference: S2.reference, riserLayout: S2.riserLayout, useCascadeSpec: S2.useCascadeSpec,
    cascadeSpec: S2.cascadeSpec, brakeLines: S2.brakeLines };
  S2.reference = ''; S2.riserLayout = 'A/B/C+D'; S2.brakeLines = true; S2.useCascadeSpec = true;
  const countsOf = (m) => {
    const by = {};
    for (const l of m.linePlan.lines) {
      if (l.shared || l.row === 'S') continue;
      const r = (by[l.row] ||= { upper: 0, middle: 0, main: 0 });
      r[l.level] += 1;
    }
    return by;
  };
  S2.cascadeSpec = 'A 14 7 3\nB 14 6 3\nC 15 6 5\nD 14 5\nK 11 5 2';
  globalThis.__rebuild();
  const m = globalThis.__getM();
  const c = countsOf(m);
  const asWritten = m.writtenCascade?.ok && c.A.upper === 14 && c.A.middle === 7 && c.A.main === 3
    && c.C.main === 5 && c.D.middle === 5 && c.D.main === 0 && c.K.upper === 11 && c.K.middle === 5 && c.K.main === 2;
  // A row given mains it cannot have is refused, with the reason.
  S2.cascadeSpec = 'A 14 6 3\nB 14 6 3\nC 15 6 5\nD 14 6 2';
  globalThis.__rebuild();
  const refused = globalThis.__getM().writtenCascade;
  const said = !refused.ok && /hangs from the C mains/.test(refused.problems[0]);
  Object.assign(S2, keep); globalThis.__rebuild(); globalThis.__controls();
  if (!asWritten || !said) {
    errors.push(`written cascade: ${JSON.stringify(c)}; D with mains: ${refused.problems[0] ?? 'accepted'}`);
  }
  console.log(`  ${asWritten && said ? 'ok  ' : 'FAIL'} a written cascade builds its middle counts and its brake `
    + `(A ${c.A.upper} ${c.A.middle} ${c.A.main}, K ${c.K.upper} ${c.K.middle} ${c.K.main}), and a D row given mains is refused`);
}
// A wing from the picker hangs from its own suspension where its maker's
// sheets are on file, and from anchors solved to its line length where they
// are not. It kept whatever layout the panel held, on every second rib: a
// two-liner was built on three risers until the designer changed it.
{
  const S2 = globalThis.__S;
  const keep = { reference: S2.reference, riserLayout: S2.riserLayout, useCascadeSpec: S2.useCascadeSpec,
    cascadeSpec: S2.cascadeSpec };
  const got = {};
  for (const ref of ['Ozone Geo 7 MS', 'Ozone Zeno 2 S', 'BGD Lynx 2 M', 'Niviuk Artik R 2 23',
    'Skywalk SAGE 95', 'Niviuk Skin 4 P 16']) {
    S2.reference = ref; globalThis.__rebuild(); globalThis.__controls(); globalThis.__rebuild();
    const m = globalThis.__getM();
    got[ref] = { layout: S2.riserLayout, spec: S2.useCascadeSpec ? S2.cascadeSpec : '', ok: m.writtenCascade?.ok,
      built: m.linePlan.levelShortfalls.length === 0, line: m.linePlan.totalLengthM, note: S2._referenceNote };
  }
  const g = got;
  // Its tip lines too, as its totals show them: the last two A and B lines
  // and the last C share one path to the riser.
  const own = g['Ozone Geo 7 MS'].layout === 'A/B/C+D'
    && /\nA 14 6 3 tip 2\nB 14 6 3 tip 2\nC 15 6 3 tip 1\nD 14 6 tip 0\nS C$/.test(g['Ozone Geo 7 MS'].spec)
    && g['Ozone Geo 7 MS'].ok && g['Ozone Geo 7 MS'].built
    && g['Ozone Zeno 2 S'].layout === 'A/B+C' && /A 30 3\nB 14 3\nC 8$/.test(g['Ozone Zeno 2 S'].spec)
    // A three-liner at an aspect ratio of 6.2, which the rule alone made a two-liner.
    && g['BGD Lynx 2 M'].layout === 'A/B/C+D' && g['Niviuk Artik R 2 23'].layout === 'A+B/C+D'
    && /its own riser layout/.test(g['Ozone Geo 7 MS'].note);
  const solvedSage = g['Skywalk SAGE 95'].layout === 'A/B+C' && /^# Solved to the published 215 m/.test(g['Skywalk SAGE 95'].spec)
    && Math.abs(g['Skywalk SAGE 95'].line / 215 - 1) < 0.05 && /no line sheet of it is on file/.test(g['Skywalk SAGE 95'].note);
  const skin = /its sheet gives A\+B\/C\+D\+E\/F\+G\/H\+I, 9 rows on 4 risers/.test(g['Niviuk Skin 4 P 16'].note);
  Object.assign(S2, keep); globalThis.__rebuild(); globalThis.__controls(); globalThis.__rebuild();
  if (!own || !solvedSage || !skin) {
    errors.push(`picker suspension: own ${own}, SAGE solved ${solvedSage}, Skin 4 P said ${skin}: `
      + JSON.stringify(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, `${v.layout} ${v.spec.split('\n').filter((x) => !x.startsWith('#')).join(' / ')}`]))));
  }
  console.log(`  ${own && solvedSage && skin ? 'ok  ' : 'FAIL'} the picker gives a wing its own suspension where its sheets are on file `
    + `(Geo 7 ${g['Ozone Geo 7 MS'].layout}, Lynx 2 ${g['BGD Lynx 2 M'].layout}, Artik R 2 ${g['Niviuk Artik R 2 23'].layout}), `
    + `and anchors solved to the line length where they are not (SAGE 95 ${g['Skywalk SAGE 95'].line.toFixed(0)} m against 215)`);
}
// A change read against the design before it: `compareDesigns` was in the
// core and the suite and nowhere in the interface.
{
  const S2 = globalThis.__S;
  const keepCells = S2.cells;
  // On the derived plan, where more cells means more lines.
  const keepSpec = S2.useCascadeSpec;
  S2.useCascadeSpec = false;
  const pressText = (text) => {
    globalThis.__buttons.length = 0; globalThis.__controls();
    const btn = globalThis.__buttons.find((x) => x.text === text);
    if (!btn) throw new Error(`no "${text}" button`);
    btn.fn();
  };
  // The stub's textContent is a node's own text, so the table is read row by
  // row: each row is its cells' texts.
  const rowsOf = (host) => {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      if (String(n.tagName || '').toLowerCase() === 'tr') {
        out.push({ cls: n.className, cells: (n.children || []).map((c) => c._text) });
        return;
      }
      for (const c of n.children || []) walk(c);
    };
    walk(host);
    return out;
  };
  const allText = (n, acc = []) => { if (!n) return acc; if (n._text) acc.push(n._text); for (const c of n.children || []) allText(c, acc); return acc; };
  globalThis.__rebuild();
  pressText('Remember this design for comparison');
  S2.cells = keepCells + 6; globalThis.__rebuild(); globalThis.__controls(); globalThis.__rebuild();
  const hostC = document.getElementById('compareTable');
  const rowsC = rowsOf(hostC);
  const row = (label) => rowsC.find((r) => r.cells[0].replace(/^[+−]\s/, '') === label);
  const cellsRowT = row('cells');
  const textC = allText(hostC).join(' | ');
  const okShown = /remembered \(.*\) → now/.test(textC)
    && cellsRowT && /^\+\d+\.\d%$/.test(cellsRowT.cells[2]) && cellsRowT.cls === 'neutral'
    && row('line length')?.cls === 'worse' && /→/.test(row('line length').cells[1])
    && row('line count')?.cls === 'worse' && !/winner|score/i.test(textC);
  const cellsRow = cellsRowT ? cellsRowT.cells.join(' ') : '';
  const shown = textC;
  pressText('Forget the remembered design');
  globalThis.__rebuild(); globalThis.__controls(); globalThis.__rebuild();
  const gone = rowsOf(document.getElementById('compareTable')).length === 0;
  S2.cells = keepCells; S2.useCascadeSpec = keepSpec;
  globalThis.__rebuild(); globalThis.__controls(); globalThis.__rebuild();
  if (!okShown || !gone) errors.push(`comparison: shown ${okShown}, forgotten ${gone}: ${shown.slice(0, 200)}`);
  console.log(`  ${okShown && gone ? 'ok  ' : 'FAIL'} a remembered design is compared with the one on the page, `
    + `and forgotten on request (${cellsRow.trim().replace(/\s+/g, ' ')})`);
}
if (errors.length){ console.log('\nERRORS:'); errors.forEach(e=>console.log(' - '+e)); process.exit(1); }
// LEP import through the real bundle
try {
  const fsx = require('fs');
  const L = globalThis.__lep;
  // The Swoop2 from the repository, not a sample living in /tmp.
  //
  // This read '/tmp/lepdata/gnuC2-27.txt', which was never committed. The
  // check passed for as long as that scratch file happened to exist and
  // failed the moment it did not — a test depending on something outside the
  // checkout is a test that does not run for anyone else.
  const doc = L.parseLep(
    fsx.readFileSync('data/reference/lep/swoop2-20260829.lep', 'utf8'));
  const design = L.lepToDesign(doc);
  globalThis.__setLEP({ doc, design, info: L.describeLep(doc) });
  globalThis.__rebuild();
  const m = globalThis.__getM();
  console.log(`  ok   LEP import: ${m.metrics.area.toFixed(2)} m2, AR ${m.metrics.aspectRatio.toFixed(2)}, ${m.panels.length} panels, proj span ${m.lobeM.projectedSpan.toFixed(2)} m`);
  const out = L.designToLep({ wing: m.wing, airfoil: m.airfoil, name: 'Swoop2', balance: m.balance }, doc);
  console.log(`  ok   LEP export: ${out.split('\n').length} lines, re-reads as ${L.describeLep(L.parseLep(out)).name}`);
  globalThis.__setLEP(null);
  globalThis.__rebuild();
  console.log(`  ok   back to parametric: ${globalThis.__getM().metrics.area.toFixed(2)} m2`);
} catch(e){ console.log('  FAIL LEP path: '+e.message); process.exit(1); }

// Tabs and the rib view
try {
  for (const t of ['rib','analysis','wing']) {
    globalThis.__tab(t);
    console.log('  ok   tab '+t+' draws');
  }
  globalThis.__tab('rib');
  const m=globalThis.__getM();
  for (const i of [0, Math.floor(m.wing.ribs.length/2), m.wing.ribs.length-1]) {
    globalThis.__rib(i);
    console.log('  ok   rib '+i+' draws (chord '+m.wing.ribs[i].chord.toFixed(3)+' m)');
  }
  // The lines view, which is what the whole cascade model is for.
  globalThis.__tab('lines');
  const S3=globalThis.__S;
  for (const row of ['all','A','B','K']) {
    S3.lineRow=row; globalThis.__rebuild();
    // A canvas that draws nothing also throws nothing, so the elements are
    // counted. Not via innerHTML: the stub's getter returns '' always, so a
    // probe reading it can only ever report zero — it failed a working view
    // and would have passed a broken one just the same.
    const svg=document.getElementById('vp-lineplan');
    const n=(svg&&svg.children)?svg.children.length:0;
    if(n<10){console.log('  FAIL line plan row '+row+' drew only '+n+' elements');process.exit(1);}
    console.log('  ok   line plan row '+row.padEnd(4)+' drew '+String(n).padStart(4)+' elements');
  }
  S3.lineRow='all';

  // The comparison against a real wing. It must produce numbers, not just
  // avoid throwing — the diff is the whole point of embedding the data.
  const keys = Object.keys(globalThis.__REFERENCE_TOTALS || {});
  if (!keys.length) { console.log('  FAIL no reference totals embedded'); process.exit(1); }
  S3.compareTo = keys[0];
  globalThis.__rebuild();
  // Walk the children for their text, rather than JSON.stringify-ing the
  // node — stringify touches every getter, including the innerHTML one that
  // deliberately throws.
  const tbl = document.getElementById('cascadeTable');
  const gather = (n, out = []) => {
    if (!n) return out;
    if (n._text) out.push(n._text);
    for (const c of n.children || []) gather(c, out);
    return out;
  };
  const txt = gather(tbl).join(' ');
  if (!/anchors compared/.test(txt) || !/shape deviation/.test(txt)) {
    console.log('  FAIL comparison produced no diff for ' + keys[0]);
    process.exit(1);
  }
  console.log('  ok   diffed against ' + keys[0] + ', ' + keys.length + ' wings selectable');
  S3.compareTo = '';
  globalThis.__rebuild();
  globalThis.__tab('structure');
  {
    const S4=globalThis.__S;
    for (const [lab,fn] of [['diagonals on',()=>{S4.vribs=true;S4.rods=true;}],['rods off',()=>{S4.rods=false;}],['diagonals off',()=>{S4.vribs=false;S4.rods=true;}]]) {
      fn(); globalThis.__rebuild();
      const d=document.getElementById('vp-diag');
      console.log('  ok   structure ['+lab+'] diag '+((d&&d.children)?d.children.length:0)+' els');
    }
    S4.vribs=true; S4.rods=true; globalThis.__rebuild();
  }
  // Rods are drawn on the rib, not in a view of their own, and a nose rod is
  // ONE piece that goes round the nose. For a long time a parametric wing's
  // rod was a 14 cm stub from 12 to 18.5% of the upper surface — a misreading
  // of one end of the real thing — drawn, billed and marked on the pattern.
  {
    const S5=globalThis.__S;
    const keep5 = { rods: S5.rods, useRodSpec: S5.useRodSpec, ribHoles: S5.ribHoles, rodUpper: S5.rodUpper };
    S5.ribHoles = true;
    const before=(()=>{S5.rods=false;globalThis.__rebuild();globalThis.__rib(0);
      const v=document.getElementById('vp-rib');return v.children.length;})();
    const after=(()=>{S5.rods=true;S5.useRodSpec=false;globalThis.__rebuild();globalThis.__rib(0);
      const v=document.getElementById('vp-rib');return v.children.length;})();
    if (after <= before) { console.log('  FAIL rods add nothing to the rib view'); process.exit(1); }
    const M5 = globalThis.__getM();
    const root = M5.rods.rods.find((r) => r.rib === 0);
    const chord = M5.wing.ribs[0].chord;
    const us = root.points.map((q) => q[0]);
    const roundNose = root.points[0][1] > 0 && root.points[root.points.length - 1][1] < 0
      && Math.min(...us) < 0.001 * chord
      && Math.abs(us[0] / chord - S5.rodUpper / 100) < 1e-6
      && Math.abs(us[us.length - 1] / chord - S5.rodLower / 100) < 1e-6;
    if (!roundNose || root.lengthM < 0.3 * chord) {
      console.log('  FAIL the nose rod does not run from the upper surface round the nose to the lower: '
        + JSON.stringify({ first: root.points[0], last: root.points[root.points.length - 1], lengthM: root.lengthM }));
      process.exit(1);
    }
    if (M5.rods.count !== 2 * M5.wing.ribs.length - 1) {
      console.log('  FAIL expected one nose rod a rib, got ' + M5.rods.count); process.exit(1);
    }
    // What the panel says of them, and that nothing crosses an opening.
    globalThis.__controls();
    const said5 = [];
    const walk5 = (n) => { if (!n) return; if (n.className === 'hint' && n._text && n.style.display !== 'none') said5.push(n._text); for (const c of n.children || []) walk5(c); };
    walk5(document.getElementById('g-internal'));
    const line5 = said5.find((t) => /of rod in all/.test(t)) || '';
    const told = /^(\d+) nose rods, \d+ to \d+ cm: ([\d.]+) m and \d+ g of rod in all/.exec(line5);
    if (!told || Number(told[1]) !== M5.rods.count || Math.abs(Number(told[2]) - M5.rods.totalLengthM) > 0.06
      || !/No rod crosses an opening/.test(line5)) {
      console.log('  FAIL the panel does not say what the rods come to: ' + JSON.stringify(line5)); process.exit(1);
    }
    // Moving the rod's end moves the rod, and the openings move out of its way.
    const len0 = M5.rods.totalLengthM;
    S5.rodUpper = 30; globalThis.__rebuild();
    const M6 = globalThis.__getM();
    if (!(M6.rods.totalLengthM > len0 * 1.1)) { console.log('  FAIL a nose rod run further back is no longer'); process.exit(1); }
    S5.rodUpper = keep5.rodUpper;
    // A written spec: the Swoop2's own two groups, a nose rod and a batten.
    S5.useRodSpec=true; globalThis.__rebuild(); globalThis.__rib(0);
    const spec=document.getElementById('vp-rib').children.length;
    const M7 = globalThis.__getM();
    const kinds = [...new Set(M7.rods.rods.map((r) => r.kind))].join();
    if (spec <= after || kinds !== 'nose,batten' || !M7.rodSpecResult.ok) {
      console.log('  FAIL the written rods are not a nose rod and a batten: ' + kinds + ' ' + (M7.rodSpecResult && M7.rodSpecResult.note)); process.exit(1);
    }
    console.log('  ok   rods on the rib: a nose rod is one piece round the nose ('
      + (root.lengthM * 100).toFixed(0) + ' cm on the centre rib, where "12 to 18.5% of chord" was '
      + (chord * 6.5).toFixed(0) + ' cm); written out, a nose rod and a batten; ' + line5.replace(/^.*?: /, '').replace(/\. A nose rod.*$/, ''));
    Object.assign(S5, keep5); globalThis.__rebuild();
  }

  // What the panel says of the openings, and what the rib says of the intake.
  //
  // The hint under "Rib openings" quoted a wing from two rounds of work
  // before — "on the test wing they pass 6 to 64 times the air the
  // neighbouring cell needs" — under every wing, an imported one with its
  // own holes included. And the intake check was only ever tested for
  // drawing without an error, so nothing knew whether its note said
  // anything, or the right thing.
  {
    const S8 = globalThis.__S;
    const keep8 = { showIntake: S8.showIntake, intakeStart: S8.intakeStart, intakeEnd: S8.intakeEnd, ribHoles: S8.ribHoles };
    // The handbook section's own opening, whatever an earlier case left.
    S8.intakeStart = 1.2; S8.intakeEnd = 5.5;
    S8.ribHoles = true; S8.showIntake = false; globalThis.__rebuild(); globalThis.__controls();
    const hints8 = () => { const out = []; const w = (n) => { if (!n) return; if (n.className === 'hint' && n._text && n.style.display !== 'none') out.push(n._text); for (const c of n.children || []) w(c); }; w(document.getElementById('g-internal')); return out; };
    const drawn8 = () => { const out = []; const w = (n) => { if (!n) return; if (n.tagName === 'text' && n._text) out.push(n._text); for (const c of n.children || []) w(c); }; w(document.getElementById('vp-rib')); return out.join(' || '); };
    const M8 = globalThis.__getM();
    const line8 = hints8().find((t) => /cross-ports/.test(t)) || '';
    const told8 = /take out (\d+)(?: to (\d+))?% of a rib and pass (\d+) to (\d+) times the air the next cell needs/.exec(line8);
    // The same figures, as the Rib tab writes them on each rib in turn.
    globalThis.__tab('rib');
    const air8 = []; const cut8 = [];
    for (let i = 0; i < M8.wing.ribs.length; i++) {
      globalThis.__rib(i);
      const t = drawn8();
      const a = /pass ([\d.]+)× the air/.exec(t); const c = /take out (\d+)% of the rib/.exec(t);
      if (a) air8.push(Number(a[1])); if (c) cut8.push(Number(c[1]));
    }
    if (!told8 || air8.length !== M8.wing.ribs.length - 1
      || Math.abs(Number(told8[3]) - Math.min(...air8)) > 0.6 || Math.abs(Number(told8[4]) - Math.max(...air8)) > 0.6
      || Number(told8[1]) !== Math.min(...cut8) || Number(told8[2] || told8[1]) !== Math.max(...cut8)) {
      console.log('  FAIL the panel does not say what the openings come to on this wing: ' + JSON.stringify(line8)
        + ' against ' + Math.min(...air8) + ' to ' + Math.max(...air8) + ' on the ribs'); process.exit(1);
    }
    // No note until it is asked for.
    globalThis.__rib(0);
    const noteOf = () => document.getElementById('note-rib').textContent;
    if (/intake/.test(noteOf())) { console.log('  FAIL the rib note speaks of the intake with the check switched off'); process.exit(1); }
    const read8 = () => /intake ([\d.]+)–([\d.]+)% c: at ([\d.]+)° the flow stagnates ([\d.]+)% (under|over) the nose and the opening is fed at (total pressure|Cp [\d.]+); (total pressure|Cp [\d.]+) three degrees faster, (total pressure|Cp [\d.]+) six slower \(thin-aerofoil, first order\)/.exec(noteOf());
    const cpOf = (t) => (t === 'total pressure' ? 1 : Number(t.slice(3)));
    S8.showIntake = true; globalThis.__rebuild(); globalThis.__rib(0);
    const own8 = read8();
    // The section's own opening starts behind the nose, so on the bar the
    // flow stagnates ahead of it and it is fed at less than at trim.
    if (!own8 || Number(own8[1]) !== S8.intakeStart || Number(own8[2]) !== S8.intakeEnd
      || Math.abs(Number(own8[3]) - S8.alphaDeg) > 0.051 || own8[5] !== 'under'
      || !(Number(own8[4]) < S8.intakeStart) || !(cpOf(own8[6]) < 1) || !(cpOf(own8[7]) < cpOf(own8[6]))
      || !/stagnation/.test(drawn8())) {
      console.log('  FAIL the rib does not say what its intake is fed at: ' + JSON.stringify(noteOf().slice(-260))); process.exit(1);
    }
    // Run to the nose, it holds the stagnation point right across the range.
    S8.intakeStart = 0; globalThis.__rebuild(); globalThis.__rib(0);
    const wide8 = read8();
    if (!wide8 || wide8[6] !== 'total pressure' || wide8[7] !== 'total pressure' || wide8[8] !== 'total pressure') {
      console.log('  FAIL an opening from the nose back is not fed at total pressure: ' + JSON.stringify(noteOf().slice(-260))); process.exit(1);
    }
    // Cut short, it is the slow end that misses.
    S8.intakeStart = 1.2; S8.intakeEnd = 2; globalThis.__rebuild(); globalThis.__rib(0);
    const short8 = read8();
    if (!short8 || !(cpOf(short8[8]) < 1)) {
      console.log('  FAIL an opening that ends at 2% of chord still holds the stagnation point flown slow: ' + JSON.stringify(noteOf().slice(-260))); process.exit(1);
    }
    console.log('  ok   the panel states the openings of this wing (' + line8.replace(/^.*?On this wing they /, '').replace(/\.$/, '')
      + '), as the ribs do; the intake ' + own8[1] + '–' + own8[2] + '% is fed at ' + own8[6] + ' at trim, ' + own8[7]
      + ' three degrees faster, and at total pressure throughout once it reaches the nose');
    Object.assign(S8, keep8); globalThis.__rebuild(); globalThis.__controls();
  }

  // The Swoop2, loaded the way a user would. Last, because it replaces the
  // design and everything after it would be testing a different wing.
  {
    // Controls first:  is only populated when they are built.
    globalThis.__buttons.length = 0;
    globalThis.__controls();
    // The parametric wing it replaces, which leaving it must give back.
    const before = globalThis.__getM();
    const beforeRibs = before.wing.ribs.length;
    const beforeSpan = globalThis.__S.span;
    const load = globalThis.__buttons.find((b) => b.text === 'Load the Swoop2');
    if (!load) { console.log('  FAIL no button loads the Swoop2'); process.exit(1); }
    load.fn();
    const m2 = globalThis.__getM();
    // Published: 18.00 m2 flat, 50 cells, 51 ribs.
    //
    // The model holds the HALF wing, so it carries 26 ribs — 25 cells plus
    // the centre — not 51. Asserting 51 failed against a correct load, which
    // is the assertion being wrong rather than the tool.
    const areaOk = Math.abs(m2.metrics.area - 18.0) < 0.05;
    const halfRibs = m2.wing.ribs.length;
    const ribsOk = halfRibs === 26;
    if (!areaOk || !ribsOk) {
      console.log(`  FAIL the Swoop2 loads as ${m2.metrics.area.toFixed(2)} m2 `
        + `and ${halfRibs} half-wing ribs; published is 18.00 m2 and 51 ribs `
        + 'across the wing, so 26 here');
      process.exit(1);
    }
    console.log(`  ok   the Swoop2 loads: ${m2.metrics.area.toFixed(2)} m2 `
      + `against a published 18.00, ${halfRibs} half-wing ribs`);

    // The settings describe the wing on the page. They listed 24 cells a
    // side for a 25-cell Swoop2 and kept the last wing's span and chord,
    // which the section view drew the Swoop2's root at.
    const S2 = globalThis.__S;
    const settingsOk = S2.cells === 25 && S2.centreRib === true
      && Math.abs(S2.span - m2.imported.flatSpan) < 1e-9
      && Math.abs(S2.rootChord - m2.imported.rootChord) < 1e-9;
    if (!settingsOk) {
      console.log(`  FAIL the settings do not describe the Swoop2: ${S2.cells} cells `
        + `a side, span ${S2.span}, root ${S2.rootChord}`);
      process.exit(1);
    }
    // The pilot hangs at the karabiner: lines plus the design's 47 cm risers.
    if (!(Math.abs(m2.hangDepthM - 6.469) < 0.01)) {
      console.log(`  FAIL the Swoop2's pilot hangs ${m2.hangDepthM} m down, not 6.47`);
      process.exit(1);
    }
    console.log(`  ok   the settings are the Swoop2's own — 25 cells a side, `
      + `${S2.span.toFixed(2)} m span — and the pilot hangs ${m2.hangDepthM.toFixed(2)} m down`);

    // Its diagonals are its own: 39 a side on rows A, B and C, each from a
    // rib with a line to a rib without. It was given 50 this tool invented,
    // on every second rib, with their apexes on ribs that carry no line.
    {
      const v = m2.vribs;
      const lined = new Set(m2.linePlan.lines
        .filter((l) => l.level === 'upper' && l.row !== 'K' && Number.isInteger(l.ribIndex))
        .map((l) => l.ribIndex));
      const rowsHere = [...new Set(v.vribs.map((d) => d.row))].sort().join('');
      const stray = v.vribs.filter((d) => !lined.has(d.fromRib) || lined.has(d.toRib));
      if (!v.own || v.count !== 39 || rowsHere !== 'ABC' || stray.length) {
        console.log(`  FAIL the Swoop2's diagonals are not its own: ${v.count} a side on rows `
          + `${rowsHere}, own ${v.own}, ${stray.length} not from a lined rib to a free one`);
        process.exit(1);
      }
      if (v.unsupportedRibs.length) {
        console.log(`  FAIL ribs ${v.unsupportedRibs.join(' ')} of the Swoop2 have nothing holding them`);
        process.exit(1);
      }
      // The panel says what they come to, and what the file states besides.
      const said = [];
      const walk = (n) => { if (!n) return; if (n.className === 'hint' && n._text) said.push(n._text); for (const c of n.children || []) walk(c); };
      walk(document.getElementById('g-internal'));
      const summary = said.find((t) => /^The design's own: A 13, B 13, C 13 a side/.test(t)) || '';
      if (!/15 straps wanted across the top/.test(summary) || !/the file states 15 such pieces/.test(summary)) {
        console.log(`  FAIL the panel does not say what the Swoop2's diagonals come to: "${summary.slice(0, 160)}"`);
        process.exit(1);
      }
      if (!/70 straps between adjacent ribs, 15 pieces between two ribs \(section 12\)/.test(S2._referenceNote || '')) {
        console.log(`  FAIL the import note does not name what section 12 holds besides: "${(S2._referenceNote || '').slice(-200)}"`);
        process.exit(1);
      }
      console.log(`  ok   its diagonals are its own: ${v.count} a side on rows ${rowsHere}, every one `
        + 'from a lined rib to a free one; 15 top straps wanted, the 15 its file states');
    }

    // And so are its openings: the panel must not describe ones this tool
    // would have cut.
    {
      const holesWere = S2.ribHoles;
      S2.ribHoles = true; globalThis.__rebuild(); globalThis.__controls();
      const said = [];
      const walk = (n) => { if (!n) return; if (n.className === 'hint' && n._text && n.style.display !== 'none') said.push(n._text); for (const c of n.children || []) walk(c); };
      walk(document.getElementById('g-internal'));
      const line = said.find((t) => /cross-ports/.test(t)) || '';
      const told = /These are the design's own, as its file gives them: (\d+) on (\d+) ribs a side/.exec(line);
      if (!told || Number(told[1]) < 100 || Number(told[2]) < 20 || /times the air/.test(line)) {
        console.log(`  FAIL the panel does not say the Swoop2's openings are its own: "${line}"`);
        process.exit(1);
      }
      console.log(`  ok   its openings are its own: ${told[1]} on ${told[2]} ribs a side`);
      S2.ribHoles = holesWere; globalThis.__rebuild(); globalThis.__controls();
    }

    // Back to the parametric wing before anything else runs.
    //
    // Everything after this point — the settings probes especially — rebuilds
    // many times, and on the imported 50-cell wing that is slow enough to
    // stop the test finishing at all. Leaving an imported design in place
    // would also mean those probes were testing a different wing from the one
    // they were written for.
    // A complete design has to survive every view and every export, not just
    // load. It is the one wing this project reproduces exactly, so if
    // anything only works on parametric geometry it shows up here.
    for (const tb of ['wing', 'lines', 'structure', 'rib', 'analysis']) {
      try { globalThis.__tab(tb); }
      catch (e) {
        console.log(`  FAIL the Swoop2 breaks the ${tb} view: ${e.message}`);
        process.exit(1);
      }
    }
    globalThis.__saved = {};
    const failedOnSwoop = [];
    let ranOnSwoop = 0;
    for (const b of globalThis.__buttons.slice()
      .filter((x) => !REPLACES_DESIGN.test(x.text))) {
      try { b.fn(); ranOnSwoop++; }
      catch (e) { failedOnSwoop.push(`${b.text}: ${e.message.slice(0, 50)}`); }
    }
    if (failedOnSwoop.length) {
      console.log(`  FAIL ${failedOnSwoop.length} exports fail on the Swoop2: `
        + failedOnSwoop.slice(0, 3).join(' | '));
      process.exit(1);
    }
    const swoopFiles = Object.keys(globalThis.__saved).length;
    if (swoopFiles < 10) {
      console.log(`  FAIL the Swoop2 only produced ${swoopFiles} files`);
      process.exit(1);
    }
    console.log(`  ok   and every view and export works on it: `
      + `${ranOnSwoop} exports, ${swoopFiles} files`);

    // What those files say of the design is the design's own.
    {
      const fail = (what) => { console.log(`  FAIL the Swoop2's ${what}`); process.exit(1); };
      const set = globalThis.__saved['Swoop2-line-set.tsv'] || '';
      const ownAt = set.indexOf('The design\'s own lines');
      const otherAt = set.indexOf('This is NOT the design\'s line set');
      if (ownAt < 0 || otherAt < ownAt || !/Line120\t120\.0\t1\.15\t96/.test(set.slice(ownAt, otherAt))) {
        fail('line-set file gives a catalogue proposal as if it were the design\'s lines');
      }
      const proposed = set.slice(otherAt).split('# trim drift')[0];
      const count = [...proposed.matchAll(/^[^#\t\n][^\t\n]*\t[\d.]+\t[\d.]+\t(\d+)$/gm)]
        .reduce((a, m) => a + Number(m[1]), 0);
      if (count !== m2.linePlan.lines.length * 2) {
        fail(`line-set file sizes ${count} lines; the wing has ${m2.linePlan.lines.length * 2}`);
      }
      // With its holes and rods on, whatever an earlier case left them at.
      const was = { ribHoles: S2.ribHoles, rods: S2.rods };
      S2.ribHoles = true; S2.rods = true;
      globalThis.__rebuild();
      globalThis.__buttons.find((x) => x.text === 'Bill of materials').fn();
      globalThis.__buttons.find((x) => x.text === 'Ribs DXF').fn();
      Object.assign(S2, was);
      globalThis.__rebuild();
      // Its data sheet is of its own lines, and has a total for every one
      // of its attachment points: it had none at all, the imported plan
      // carrying no table of totals for the sheet to copy.
      const pma = globalThis.__saved['Swoop2-pma.tsv'] || '';
      const tops = m2.linePlan.lines.filter((l) => l.level === 'upper').length;
      const totalRows = (pma.split('attachment_point\t')[1] || '').split('\n').slice(1)
        .filter((r) => r.trim());
      if (totalRows.length !== tops || !/^A1\t\d{4}\ttrue\tclosed\tA1 AM1 AR1$/m.test(pma)) {
        fail(`data sheet gives ${totalRows.length} total line lengths for ${tops} attachment points`);
      }
      if (!/^AR1\tA\tmain\tLine275\tdyneema\t3519\t\ta loop each end, 240 mm of line in the two\t275\t0\.65\t178\.8$/m.test(pma)
        || !/# riser 470 mm/.test(pma)) {
        fail('data sheet does not give its first main line as the design has it');
      }
      const inspS = globalThis.__saved['Swoop2-inspection.tsv'] || '';
      if (!/NO WING HAS BEEN MEASURED/.test(inspS) || !/^A1\tA1 AM1 AR1\t\d{4}\t/m.test(inspS)) {
        fail('inspection forecast is not of its own attachment points');
      }
      const bom = globalThis.__saved['Swoop2-bom.txt'] || '';
      if (!/^Bill of materials — Swoop2/.test(bom) || !/the design's own holes/.test(bom)
        || !/Line120\s+93\.6 m\s+96 pieces/.test(bom) || !/Nylon rods\s+\d+ pieces\s+[\d.]+ m {2}mass not stated/.test(bom)) {
        fail('bill of materials is not of its own ribs, lines and rods');
      }
      const ribs = globalThis.__parseDXF(globalThis.__saved['Swoop2-ribs.dxf']);
      const anchored = [...new Set(ribs.entities.filter((e) => /-anchors$/.test(e.layer || ''))
        .map((e) => Number(/^rib-(\d+)-/.exec(e.layer)[1])))].sort((a, b) => a - b);
      // Lines on its ribs 2-3, 6-7 ... (counted from 1), brakes on every second.
      if (anchored.includes(0) || !anchored.includes(1) || !anchored.includes(2) || anchored.includes(4)) {
        fail(`rib file marks lines on ribs ${anchored.join(' ')}`);
      }
      console.log('  ok   its files are its own: its line types before any proposal, its holes, rods and '
        + `line lengths in the bill, and line marks on ribs ${anchored.slice(0, 6).join(' ')} ... only`);
    }

    // Left the way a user leaves it, by the button — which has to give the
    // earlier wing back, not a parametric wing of the Swoop2's size.
    globalThis.__buttons.length = 0;
    globalThis.__controls();
    const leave = globalThis.__buttons.find((b) => b.text === 'Return to parametric wing');
    if (!leave) { console.log('  FAIL no button leaves the Swoop2'); process.exit(1); }
    leave.fn();
    const back = globalThis.__getM();
    if (back.wing.ribs.length !== beforeRibs || globalThis.__S.span !== beforeSpan) {
      console.log(`  FAIL leaving the Swoop2 gave a ${back.wing.ribs.length}-rib wing of `
        + `${globalThis.__S.span} m, not the ${beforeRibs}-rib, ${beforeSpan} m wing it replaced`);
      process.exit(1);
    }
    // Not the rib count: loading a design now sets the planform settings to
    // its own values, so the parametric wing it returns to is a 25-cell wing
    // of the Swoop2's size — the same count, and correctly so. What must be
    // gone is the IMPORT: its explicit ribs and its own line plan.
    if (back.imported || back.linePlan?.lep) {
      console.log('  FAIL returning to the parametric wing left the import in place');
      process.exit(1);
    }
    console.log(`  ok   and returns to the parametric wing it replaced, `
      + `${back.wing.ribs.length} ribs and ${globalThis.__S.span} m`);
  }

  globalThis.__tab('wing');
} catch(e){ console.log('  FAIL tab/rib: '+e.message); console.log(e.stack.split('\n').slice(1,4).join('\n')); process.exit(1); }

// Press every export button, rather than only the __exports() hook they
// bypass. The bill of materials existed since Phase 3 with no button, and
// nothing noticed because nothing ever pressed one.
try {
  // Build the real control panel, then press its real buttons. The harness
  // used to call the export functions directly, which tests the functions and
  // not the wiring — and that is how a duplicate 'Panels DXF' button and a
  // bill of materials with no button at all both survived.
  // The stub DOM's querySelectorAll returns [] unconditionally, so no test
  // that looked for buttons could ever have found one. Collect them where
  // they are created instead.
  globalThis.__buttons.length = 0;
  globalThis.__controls();
  // A snapshot, and without the buttons that replace the design.
  //
  // `globalThis.__buttons` is the live array, and a handler that calls
  // `buildControls()` appends to it while this loop runs — so the loop never
  // reaches the end and the test hangs with no output.
  //
  // This is the SECOND loop with that defect. I fixed the one inside
  // `pressAll` and did not look for another, so the test went on hanging and
  // the instrumentation I added to the fixed loop reported nothing at all.
  const REPLACES = /^(Load the Swoop2|Import LEP|Return to parametric)/;
  const btns = globalThis.__buttons.slice().filter((b) => !REPLACES.test(b.text));
  const seen = new Map();
  let pressed = 0, failed = [];
  // What this sweep writes, kept. The files were read back from
  // `globalThis.__saved` a thousand lines further down, after five other
  // tests had each emptied it, and the check that every exported DXF reads
  // back reported "0 exported DXF files read back and valid" as a pass.
  globalThis.__saved = {};
  for (const b of btns) {
    seen.set(b.text, (seen.get(b.text) || 0) + 1);
    try { b.fn(); pressed++; }
    catch (e) { failed.push(`${b.text}: ${e.message.slice(0,60)}`); }
  }
  const sweepFiles = Object.fromEntries(Object.entries(globalThis.__saved));
  const sweepModel = globalThis.__getM();
  const sweepName = globalThis.__S.name;

  // Two of those files are documents for an inspector, and pressing their
  // buttons says nothing about what is in them.
  {
    const fail = (what) => { console.log(`  FAIL the ${what}`); process.exit(1); };
    const table = (text, head) => {
      const rows = text.split('\n');
      const at = rows.findIndex((r) => r.startsWith(head));
      if (at < 0) return null;
      const cols = rows[at].split('\t');
      const body = [];
      for (let k = at + 1; k < rows.length && rows[k].trim() && !rows[k].startsWith('#'); k++) {
        body.push(Object.fromEntries(rows[k].split('\t').map((v, c) => [cols[c], v])));
      }
      return { cols, body };
    };

    // The inspection forecast.
    const insp = sweepFiles[`${sweepName}-inspection.tsv`] || '';
    if (!/NO WING HAS BEEN MEASURED/.test(insp) || !/ESTIMATES, not measurements/.test(insp)) {
      fail('inspection file does not say that no wing was measured and that its sizes are estimates');
    }
    const it = table(insp, 'attachment_point\t');
    const points = sweepModel.linePlan.lines.filter((l) => l.level === 'upper').length;
    if (!it || it.body.length !== points) {
      fail(`inspection file lists ${it ? it.body.length : 0} attachment points; the plan has ${points}`);
    }
    const hoursCols = it.cols.filter((c) => /^within_\d+h$/.test(c));
    if (hoursCols.length < 2) fail('inspection file forecasts fewer than two times');
    for (const wc of hoursCols) {
      const h = /(\d+)h/.exec(wc)[1];
      // The column says what the numbers beside it say. Every row said NO,
      // of a line on its reference, under a heading that said "passes".
      const wrong = it.body.filter((r) => {
        const d = Number(r[`delta_${h}h_mm`]);
        const inside = /^K/.test(r.attachment_point) ? (d >= 0 && d <= 50) : (d >= -12 && d <= 12);
        return (r[wc] === 'yes') !== inside;
      });
      if (wrong.length) {
        fail(`inspection file's ${wc} column disagrees with its own deltas on ${wrong.length} rows, `
          + `first ${wrong[0].attachment_point}: ${wrong[0][`delta_${h}h_mm`]} mm marked ${wrong[0][wc]}`);
      }
      const out = it.body.filter((r) => r[wc] === 'NO').length;
      const head = new RegExp(`# at ${h} h: (passes|FAILS)[^\\n]*`).exec(insp);
      if (!head) fail(`inspection file has no summary line for ${h} h`);
      const said = /(\d+) attachment point\(s\) outside/.exec(head[0]);
      if ((head[1] === 'passes') !== (out === 0) || (said ? Number(said[1]) : 0) !== out) {
        fail(`inspection file's heading for ${h} h (${head[0].slice(0, 60)}) does not match its ${out} rows marked NO`);
      }
    }
    // The reference column is the sum of its own lines at the measuring
    // tension, plus the riser — and no riser for a brake.
    const ref = new Map(sweepModel.lengths.lines.map((l) => [l.name, l.referenceLengthMM]));
    const riser = sweepModel.linePlan.riserLengthMM;
    const badRef = it.body.filter((r) => {
      const sum = r.lines.split(' ').reduce((a, n) => a + ref.get(n), 0);
      return Number(r.reference_mm) !== Math.round(sum + (/^K/.test(r.attachment_point) ? 0 : riser));
    });
    if (badRef.length) {
      fail(`inspection file's reference for ${badRef[0].attachment_point} is not its lines' `
        + `${badRef[0].lines} at 5 daN plus the riser`);
    }
    if (it.body.some((r) => !/^K/.test(r.attachment_point) && /\bKL1\b/.test(r.lines))) {
      fail('inspection file runs a suspension line on down the brake\'s lower line');
    }

    // The data sheet.
    const pma = sweepFiles[`${sweepName}-pma.tsv`] || '';
    const lt = table(pma, 'reference\t');
    const tt = table(pma, 'attachment_point\t');
    if (!lt || lt.body.length !== sweepModel.linePlan.lines.length) {
      fail(`data sheet lists ${lt ? lt.body.length : 0} lines; the plan has ${sweepModel.linePlan.lines.length}`);
    }
    const sel = new Map(sweepModel.lineSelection.lines.map((l) => [l.name, l]));
    const chain = new Map(sweepModel.lengths.lines.map((l) => [l.name, l]));
    for (const r of lt.body) {
      const m = sel.get(r.reference).line;
      const coeff = { dyneema: 0.65, aramid: 0.45, vectran: 0.45 }[r.core];
      if (r.material !== m.code || Number(r.new_strength_daN) !== m.strengthNewDaN
        || !coeff || Number(r.line_coeff) !== coeff
        || Math.abs(Number(r.minimum_strength_daN) - m.strengthNewDaN * coeff) > 0.051) {
        fail(`data sheet's line ${r.reference} is not its own: ${r.material} ${r.core} new `
          + `${r.new_strength_daN} x ${r.line_coeff} = ${r.minimum_strength_daN}, where the design has `
          + `${m.code} at ${m.strengthNewDaN} daN new`);
      }
      // The column headed sewn length carried the flying length.
      if (Number(r.sewn_length_mm) !== chain.get(r.reference).sewnLengthMM || !r.construction) {
        fail(`data sheet's sewn length for ${r.reference} is ${r.sewn_length_mm}, not the chain's `
          + `${chain.get(r.reference).sewnLengthMM}`);
      }
    }
    if (!tt || tt.body.length !== points) {
      fail(`data sheet gives ${tt ? tt.body.length : 0} total line lengths for ${points} attachment points`);
    }
    if (tt.body.some((r) => (r.includes_risers === 'true') !== !/^K/.test(r.attachment_point))) {
      fail('data sheet does not keep the riser out of the brake totals alone');
    }
    const insRef = new Map(it.body.map((r) => [r.attachment_point, r.reference_mm]));
    if (tt.body.some((r) => insRef.get(r.attachment_point) !== r.total_line_length_mm)) {
      fail('data sheet and the inspection forecast give different reference lengths');
    }
    // What is left for the maker is what only the maker knows.
    const inc = /# INCOMPLETE: ([^\n]*)/.exec(pma);
    if (!inc || inc[1] !== 'manufacturer, size, weight range, line colours') {
      fail(`data sheet is marked "${inc ? inc[1] : 'complete'}", where the design can supply `
        + 'everything but the maker, the size, the weight range and the colours');
    }
    console.log(`  ok   the inspection forecast and the data sheet say what the design holds: `
      + `${points} attachment points, ${lt.body.length} lines with their own material, fibre and `
      + `strength new, ${hoursCols.map((c) => /(\d+)h/.exec(c)[1]).join(' and ')} h forecast`);
  }
  // A setting that changes nothing in the output is the same class of defect
  // as a model with no button.
  //
  // Watched through save(), not through the export helpers. A first version
  // watched `__exports().marked`, which calls markedPanelsToDXF directly
  // whatever the setting says — so it could never change, and reported a
  // false failure. That is the same mistake as testing the functions instead
  // of the buttons, made again one round later.
  const pressAll = () => {
    globalThis.__saved = {};
    globalThis.__buttons.length = 0;
    globalThis.__controls();
    // A SNAPSHOT, not the live array.
    //
    // `globalThis.__buttons` is appended to whenever controls are built, and
    // a handler that calls `buildControls()` — the Swoop2 loader does, to
    // refresh the panel — adds more buttons while this loop is running. A
    // `for...of` over the live array then never reaches the end, and the
    // whole test hangs with no output at all.
    // Buttons that deliberately REPLACE the design are left out of the
    // export sweep. "Load the Swoop2" swaps in a 50-cell imported wing, and
    // every rebuild after it in this sweep then runs on that wing instead of
    // the one being tested — dozens of them, and the test stops finishing.
    //
    // Pressing it here would not be testing the exports anyway; it changes
    // the subject. It is exercised on its own below.
    const snapshot = globalThis.__buttons.slice()
      .filter((b) => !REPLACES_DESIGN.test(b.text));
    for (const b of snapshot) { try { b.fn(); } catch (e) { /* reported above */ } }
    // The content, not its length.
    //
    // Comparing byte lengths missed a setting that changed 378 to 382 in
    // every row of a file: same number of characters, entirely different
    // cutting lengths. A probe that can only see length changes passes a
    // control that does nothing whenever the numbers happen to be the same
    // width.
    return Object.fromEntries(Object.entries(globalThis.__saved));
  };
  const S2 = globalThis.__S;
  // Dimensions must carry the model's own numbers.
  //
  // A drawing whose labels disagree with the design is worse than one with no
  // labels: a reviewer checks the drawing against the panel beside it, and a
  // stale number there is a number they will trust.
  {
    const S6 = globalThis.__S;
    const wasDim = S6.dimensions;
    S6.dimensions = false; globalThis.__rebuild();
    const without = document.getElementById('vp-plan').children.length;
    S6.dimensions = true; globalThis.__rebuild();
    const withDim = document.getElementById('vp-plan').children.length;
    if (withDim <= without) {
      console.log('  FAIL dimensions draw nothing'); process.exit(1);
    }

    const m = globalThis.__getM();
    const gather = (n, out = []) => {
      if (!n) return out;
      if (n._text) out.push(n._text);
      for (const c of n.children || []) gather(c, out);
      return out;
    };
    const labels = gather(document.getElementById('vp-plan'));
    const claimed = (re) => {
      const hit = labels.find((t) => re.test(t));
      return hit ? Number(/[\d.]+/.exec(hit)[0]) : null;
    };
    const checks = [
      ['span', claimed(/m span/), m.metrics.span],
      ['root chord', claimed(/m root/), m.planform.chord(0)],
      ['tip chord', claimed(/m tip/), m.planform.chord(m.planform.halfSpan)],
    ];
    for (const [what, shown, actual] of checks) {
      if (shown == null || Math.abs(shown - actual) > 0.02) {
        console.log(`  FAIL the ${what} dimension reads ${shown}, model says `
          + `${actual.toFixed(2)}`);
        process.exit(1);
      }
    }
    // The rib is the drawing a builder marks out from, so its dimensions
    // matter more than the plan's. Anchor positions especially: a wrong one
    // puts a line in the wrong place on a real wing.
    globalThis.__rib(0);
    const ribLabels = gather(document.getElementById('vp-rib'));
    const rib0 = m.wing.ribs[0];
    const ribChord = ribLabels.find((t) => /m chord/.test(t));
    if (!ribChord || Math.abs(Number(/[\d.]+/.exec(ribChord)[0]) - rib0.chord) > 0.002) {
      console.log(`  FAIL the rib chord dimension reads ${ribChord}, model `
        + `says ${rib0.chord.toFixed(3)}`);
      process.exit(1);
    }
    let anchorsChecked = 0;
    for (const [row, frac] of Object.entries(m.airfoil.anchors ?? {})) {
      const want = Math.round(frac * rib0.chord * 1000);
      const hit = ribLabels.find((t) => t.startsWith(`${row} `));
      if (!hit) continue;
      const shown = Number(hit.slice(row.length + 1));
      if (Math.abs(shown - want) > 1) {
        console.log(`  FAIL anchor ${row} is drawn at ${shown} mm, model says `
          + `${want} mm`);
        process.exit(1);
      }
      anchorsChecked++;
    }
    if (anchorsChecked < 3) {
      console.log(`  FAIL only ${anchorsChecked} anchor dimensions found`);
      process.exit(1);
    }

    // The front view measures the arc off the geometry it plotted, and the
    // model reports the same two figures by a different route. Holding them
    // to each other checks both: a disagreement means one is wrong.
    globalThis.__tab('wing'); globalThis.__rebuild();
    const frontLabels = gather(document.getElementById('vp-front'));
    const frontNum = (re) => {
      const hit = frontLabels.find((t) => re.test(t));
      return hit ? Number(/[\d.]+/.exec(hit)[0]) : null;
    };
    const fChecks = [
      ['projected span', frontNum(/m projected/), m.lobeM.projectedSpan],
      ['arrow', frontNum(/m arrow/), m.lobeM.arrow],
    ];
    for (const [what, drawn, model] of fChecks) {
      if (drawn == null || Math.abs(drawn - model) > 0.02) {
        console.log(`  FAIL the front view draws the ${what} as ${drawn}; the `
          + `model reports ${model.toFixed(2)}`);
        process.exit(1);
      }
    }

    console.log(`  ok   ${checks.length} plan, ${fChecks.length} front and `
      + `${anchorsChecked + 1} rib `
      + 'dimensions carry the model\'s own numbers');
    S6.dimensions = wasDim; globalThis.__rebuild();
  }

  // The front view must draw the SAME lines as everything else.
  //
  // It drew chapter 8's simplified cascade while the Lines view, the loads,
  // the bill and the PMA sheet used the real plan — so the riser layout, the
  // merges, the brakes and the split A were all missing from it. Two line
  // models in one tool, and the drawing showed the wrong one.
  {
    const m = globalThis.__getM();
    const src = require('fs').readFileSync('src/ui/app.js', 'utf8');
    // Comments stripped: the fix's own explanation names `M.cascade`, and a
    // scan that reads it flags the very change it is checking for. Third
    // time this project has caught a checker matching its own description.
    const front = src.slice(src.indexOf('function drawFront'),
      src.indexOf('function drawRib'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/M\.cascade/.test(front)) {
      console.log('  FAIL the front view still draws the chapter 8 cascade');
      process.exit(1);
    }
    if (!/M\.linePlan/.test(front)) {
      console.log('  FAIL the front view draws no line plan at all');
      process.exit(1);
    }
    console.log(`  ok   the front view draws the real plan, `
      + `${m.linePlan.lines.length} lines`);
  }

  // What colour things are actually drawn.
  //
  // The diagonals view shades each fibre blue where the fabric carries load
  // and red where it does not. It rendered EVERY fibre red for a release,
  // because the view called `checkDiagonalTension` with nothing to say what
  // loads a diagonal, and so measured against the diagonal's own axis. Each
  // piece carries that direction itself now: the lift of the rib it holds.
  //
  // No test could have caught it: the drawing was only ever checked by
  // element count, and the count was right. The stub threw attributes away.
  {
    const S0 = globalThis.__S;
    const wasV = S0.vribs;
    S0.vribs = true;
    globalThis.__rebuild();
    globalThis.__tab('structure');
    let red = 0;
    let blue = 0;
    const walk = (n) => {
      if (!n) return;
      const stroke = n.attrs && n.attrs.stroke;
      if (stroke === '#ff5e5e') red++;
      if (stroke === '#5ec8ff') blue++;
      for (const c of n.children || []) walk(c);
    };
    walk(document.getElementById('vp-diag'));
    if (blue + red === 0) {
      console.log('  FAIL the diagonals view drew no fibres at all');
      process.exit(1);
    }
    if (blue === 0) {
      console.log(`  FAIL every diagonal fibre drew red (${red} of ${red}); `
        + 'the load is not the held rib\'s');
      process.exit(1);
    }
    console.log(`  ok   diagonal fibres shaded by load: ${blue} carrying, `
      + `${red} not`);
    S0.vribs = wasV;
    globalThis.__tab('wing');
    globalThis.__rebuild();
  }

  // The bill of materials is of the whole wing.
  //
  // The button passed the sail panels and the lines and nothing else. It
  // asked for the ribs under a name nothing set, so there were none in it;
  // no diagonals, reinforcement, tabs or rods either, the lines at finished
  // length, and the name "wing". The rib cloth chosen under Assumptions
  // changed nothing anywhere, and a cloth choice the tool disliked meant no
  // bill at all.
  {
    const Sb = globalThis.__S;
    const keep = {};
    for (const k of ['clothRib', 'clothUpper', 'clothLE', 'noseClothTo', 'vribs', 'ribHoles', 'rods']) keep[k] = Sb[k];
    const fail = (what) => { console.log(`  FAIL ${what}`); process.exit(1); };
    const bill = () => {
      globalThis.__rebuild();
      globalThis.__buttons.length = 0;
      globalThis.__controls();
      const b = globalThis.__buttons.find((x) => x.text === 'Bill of materials');
      if (!b) fail('no button writes a bill of materials');
      globalThis.__saved = {};
      b.fn();
      return globalThis.__saved[`${Sb.name}-bom.txt`] || '';
    };
    const grams = (text, item) => {
      const m = new RegExp(`${item}\\n(?:.*roll.*\\n)?.*?(\\d+) g`).exec(text);
      return m ? Number(m[1]) : null;
    };
    Sb.vribs = true; Sb.ribHoles = true; Sb.rods = true;
    const first = bill();
    for (const [what, re] of [
      ['its own name', new RegExp(`^Bill of materials — ${Sb.name}\\n`)],
      // On a roll of their own: the bill ordered cloth for the sail and
      // the diagonals and none for the ribs, which are a third of it.
      ['the ribs', /Rib cloth\n\s+[\d.]+ m of [\d.]+ m roll\s+\(\d+% used\)\n\s+\d+ pieces, [\d.]+ m2, \d+ g\n\s+\d+% of [\d.]+ m2 removed as openings/],
      ['what the roll total is made of', /roll to order: [\d.]+ m \(sail cloth [\d.]+, rib cloth [\d.]+, diagonal cloth [\d.]+\)/],
      ['the diagonals', /Diagonal cloth/],
      ['the anchor patches', /Dacron at the anchors/],
      ['the tabs', /Attachment tabs/],
      ['the rods', /RODS AND WEBBING\n\s+Nylon rods\s+\d+ pieces\s+[\d.]+ m {2}\d+ g/],
      ['the riser webbing', /Riser webbing\s+\d+ pieces/],
      ['lines at the length to cut', /lengths to cut, with the loops/],
      ['what the wing is set to weigh', /% of the [\d.]+ kg the wing is set to weigh/],
      ['what it does not weigh', /NOT WEIGHED\n(?:.*\n)*.*thread/],
    ]) {
      if (!re.test(first)) fail(`the bill of materials does not have ${what}`);
    }
    if (/counted solid|NOT IN THIS BILL/.test(first)) fail('the bill still reports parts of the wing as left out');
    // One strap for each riser of each side, and none for the brake: the
    // brake cascade was counted as a fourth riser, and the bill ordered a
    // third more webbing than the wing has.
    {
      const w = /Riser webbing\s+(\d+) pieces\s+([\d.]+) m/.exec(first);
      const Mb = globalThis.__getM();
      const want = Mb.linePlan.risers.length * 2;
      const metres = (want * Mb.linePlan.riserLengthMM) / 1000;
      if (!w || Number(w[1]) !== want || Math.abs(Number(w[2]) - metres) > 0.06) {
        fail(`the bill lists ${w ? `${w[1]} riser straps, ${w[2]} m` : 'no riser webbing'} `
          + `on a wing with ${want} risers of ${Mb.linePlan.riserLengthMM} mm`);
      }
      const m = /Riser maillons\s+(\d+)/.exec(first);
      if (m && Number(m[1]) !== want) fail(`the bill lists ${m[1]} riser maillons for ${want} risers`);
    }
    // The roll to order is the three rolls listed, added up.
    {
      const r = /roll to order: ([\d.]+) m \(sail cloth ([\d.]+), rib cloth ([\d.]+), diagonal cloth ([\d.]+)\)/.exec(first);
      if (Math.abs(Number(r[1]) - (Number(r[2]) + Number(r[3]) + Number(r[4]))) > 0.11) {
        fail(`the roll to order, ${r[1]} m, is not the rolls listed: ${r[2]} + ${r[3]} + ${r[4]}`);
      }
    }
    const ribs0 = grams(first, 'Rib cloth');
    const diag0 = grams(first, 'Diagonal cloth');
    // The rib and diagonal cloth is weighed in the cloth chosen.
    Sb.clothRib = 'Porcher Skytex 38';
    const lighter = bill();
    if (!(grams(lighter, 'Rib cloth') < ribs0) || !(grams(lighter, 'Diagonal cloth') < diag0)) {
      fail(`a lighter rib cloth does not lighten the ribs: ${ribs0} g then ${grams(lighter, 'Rib cloth')} g`);
    }
    // A choice the schedule warns about is said in the bill, not refused.
    Sb.clothRib = 'Porcher Skytex 27';
    const warned = bill();
    if (!/TO LOOK AT\n\s+the sail \(32 g\/m2\) is heavier than the ribs \(27 g\/m2\)/.test(warned)) {
      fail('a sail heavier than its ribs is not written into the bill: ' + (warned ? 'no warning in it' : 'no bill at all'));
    }
    Sb.clothRib = keep.clothRib;
    // The nose in its own cloth, as far back as it is set to run.
    Sb.clothLE = 'Porcher Skytex 40 hard';
    const sail = (t) => grams(t, 'Sail cloth');
    Sb.noseClothTo = 10; const nose10 = sail(bill());
    Sb.noseClothTo = 40; const nose40 = sail(bill());
    if (!(nose40 > nose10)) fail(`a longer nose in a heavier cloth weighs no more: ${nose10} g then ${nose40} g`);
    Sb.clothLE = keep.clothLE; Sb.noseClothTo = keep.noseClothTo;
    // What is turned off is not billed.
    Sb.vribs = false; Sb.ribHoles = false; Sb.rods = false;
    const bare = bill();
    if (/Diagonal cloth|Nylon rods/.test(bare) || !/solid ribs, no openings/.test(bare)) {
      fail('diagonals, rods or rib openings that are turned off are still in the bill');
    }
    if (!/Mylar at the intakes/.test(bare) || /Mylar at the intakes/.test(first)) {
      fail('mylar at the nose should be billed without rods and not with them');
    }
    console.log(`  ok   the bill of materials is of the whole wing: ribs ${ribs0} g, diagonals ${diag0} g, `
      + 'rods, tabs and patches; cloth choices weigh what they say, and a warning does not stop it');
    Object.assign(Sb, keep);
    globalThis.__rebuild();
    globalThis.__controls();
  }

  // The rib stress report is of this wing's ribs, in this wing's cloth.
  //
  // It checked every design as Skytex 27 hard whatever its ribs were set to
  // be cut from, measured each anchor's room as a quarter of the chord, and
  // on an imported design looked for holes the design does not have.
  {
    const Sr = globalThis.__S;
    const keepR = { clothRib: Sr.clothRib, ribHoles: Sr.ribHoles };
    const failR = (what) => { console.log(`  FAIL ${what}`); process.exit(1); };
    const report = () => {
      globalThis.__rebuild();
      globalThis.__buttons.length = 0;
      globalThis.__controls();
      const b = globalThis.__buttons.find((x) => x.text === 'Rib stress report');
      if (!b) failR('no button writes a rib stress report');
      globalThis.__saved = {};
      b.fn();
      return globalThis.__saved[`${Sr.name}-rib-stress.tsv`] || '';
    };
    const longest = (text) => {
      const m = /# longest reinforcement: (\S+) on rib (\d+), (\d+) mm of the (\d+) mm the rib is deep there, at (\d+) N/.exec(text);
      return m ? { name: m[1], rib: Number(m[2]), reach: Number(m[3]), depth: Number(m[4]), load: Number(m[5]) } : null;
    };
    Sr.ribHoles = true; Sr.clothRib = 'Porcher Skytex 40 hard';
    const heavy = report();
    const Mr = globalThis.__getM();
    const rows = heavy.split('\n').filter((l) => /^\d+\t/.test(l)).map((l) => l.split('\t'));
    const anchors = Mr.loads.anchorLoads.length;
    if (!/into Porcher Skytex 40 hard;/.test(heavy)) failR('the rib stress report is not in the rib cloth chosen: ' + heavy.split('\n')[3]);
    if (rows.length !== anchors) failR(`the rib stress report has ${rows.length} rows for ${anchors} anchors`);
    // Each anchor's room is the depth of its own rib there: 5 to 20% of chord.
    const shares = rows.map((r) => Number(r[6]) / 1000 / Number(r[1]));
    if (!(Math.min(...shares) > 0.04 && Math.max(...shares) < 0.20)) {
      failR(`rib depths in the report run ${(Math.min(...shares) * 100).toFixed(1)} to ${(Math.max(...shares) * 100).toFixed(1)}% of chord`);
    }
    const lh = longest(heavy);
    if (!lh || !(lh.reach < lh.depth)) failR('the report does not name its longest reinforcement: ' + heavy.split('\n')[4]);
    // A weaker cloth needs the reinforcement to reach further.
    Sr.clothRib = 'Porcher Skytex 27 hard';
    const light = report();
    const ll = longest(light);
    if (!/into Porcher Skytex 27 hard;/.test(light) || !(ll.reach > lh.reach)) {
      failR(`a weaker rib cloth does not lengthen the reinforcement: ${lh.reach} mm then ${ll && ll.reach} mm`);
    }
    // One with no strength figure is checked as the weakest listed, and says so.
    Sr.clothRib = 'Porcher Skytex 38';
    const other = report();
    if (!/into Porcher Skytex 27 hard \(no strength figure here for Porcher Skytex 38, the cloth chosen\)/.test(other)) {
      failR('a rib cloth with no strength figure is not reported as such: ' + other.split('\n')[3]);
    }
    console.log(`  ok   rib stress report: ${rows.length} anchors, each against its own rib's depth `
      + `(${(Math.min(...shares) * 100).toFixed(0)} to ${(Math.max(...shares) * 100).toFixed(0)}% of chord); longest reinforcement `
      + `${lh.reach} mm in ${keepR.clothRib === 'Porcher Skytex 40 hard' ? 'the default' : 'a heavy'} cloth, ${ll.reach} mm in Skytex 27 hard`);
    Object.assign(Sr, keepR); globalThis.__rebuild(); globalThis.__controls();
  }

  // Every file the buttons write is the kind of file its name says.
  //
  // The printable pattern was several hundred SVG drawings written end to
  // end into one `.svg`, which a browser reads as one drawing followed by
  // an error; and the rib file was each rib's outline and nothing else,
  // while the Rib tab drew its anchors, openings, rods and diagonals.
  {
    const Sx = globalThis.__S;
    const fail = (what) => { console.log(`  FAIL ${what}`); process.exit(1); };
    const keep = { vribs: Sx.vribs, ribHoles: Sx.ribHoles, rods: Sx.rods, paper: Sx.paper, seamAllowance: Sx.seamAllowance };
    Sx.vribs = true; Sx.ribHoles = true; Sx.rods = true; Sx.paper = 'A3L'; Sx.seamAllowance = 10;
    globalThis.__rebuild();
    globalThis.__buttons.length = 0;
    globalThis.__controls();
    globalThis.__saved = {};
    for (const b of globalThis.__buttons.slice().filter((x) => !REPLACES_DESIGN.test(x.text))) {
      try { b.fn(); } catch (e) { fail(`"${b.text}" throws: ${e.message}`); }
    }
    const files = Object.entries(globalThis.__saved);
    let checked = 0;
    for (const [name, text] of files) {
      const t = String(text);
      if (/\.svg$/.test(name)) {
        if ((t.match(/<svg[\s>]/g) || []).length !== 1 || !t.trimEnd().endsWith('</svg>')) {
          fail(`${name} is not one SVG drawing: ${(t.match(/<svg[\s>]/g) || []).length} root elements`);
        }
        checked++;
      } else if (/\.html$/.test(name)) {
        if (!t.startsWith('<!doctype html>') || (t.match(/<html[\s>]/g) || []).length !== 1
          || !t.trimEnd().endsWith('</html>')) fail(`${name} is not one HTML document`);
        checked++;
      } else if (/\.json$/.test(name)) {
        try { JSON.parse(t); } catch (e) { fail(`${name} is not JSON: ${e.message}`); }
        checked++;
      } else if (/\.dxf$/.test(name)) {
        const d = globalThis.__parseDXF(t);
        if (!/\nEOF\s*$/.test(t) || !d.polylines.length || d.unreadTypes.length) {
          fail(`${name} does not read back as a drawing: ${d.polylines.length} outlines, `
            + `unread ${d.unreadTypes.join(' ')}`);
        }
        checked++;
      }
    }
    const pattern = files.find(([name]) => /-pattern-/.test(name));
    if (!pattern || !/\.html$/.test(pattern[0])) fail('the printable pattern is not written as a page that opens');
    const sheets = (pattern[1].match(/<div class="sheet"/g) || []).length;
    if (sheets < 10 || (pattern[1].match(/<svg /g) || []).length !== sheets) {
      fail(`the printable pattern holds ${sheets} sheets and ${(pattern[1].match(/<svg /g) || []).length} drawings`);
    }

    // The rib file carries what the Rib tab draws.
    const m = globalThis.__getM();
    const ribs = globalThis.__parseDXF(globalThis.__saved[`${Sx.name}-ribs.dxf`]);
    const on = (re) => ribs.entities.filter((e) => re.test(e.layer || ''));
    const n = m.wing.ribs.length;
    const lined = new Set(m.linePlan.lines
      .filter((l) => l.level === 'upper' && Number.isInteger(l.ribIndex)).map((l) => l.ribIndex));
    const free = m.wing.ribs.map((r) => r.index).find((i) => !lined.has(i));
    const some = [...lined][0];
    if (on(/^rib-\d+$/).length !== n || on(/-cut$/).length !== n) fail('the rib file lacks a sewing or a cutting line per rib');
    if (!on(/-openings$/).length || !on(/-rods$/).length || !on(/-diagonals$/).length || on(/-intake$/).length !== 2 * n) {
      fail('the rib file lacks openings, rods, diagonal marks or intake ticks');
    }
    if (!on(new RegExp(`^rib-${some}-anchors$`)).length) fail(`rib ${some} carries lines and the file marks none`);
    if (free !== undefined && on(new RegExp(`^rib-${free}-anchors$`)).length) {
      fail(`rib ${free} carries no line and the file marks anchors on it`);
    }
    // And the Rib tab says the same of the same rib.
    if (free !== undefined) {
      globalThis.__tab('rib');
      globalThis.__rib(free);
      const note = document.getElementById('note-rib')._text;
      if (!/no line on this rib/.test(note)) fail(`the Rib tab does not say rib ${free} carries no line: ${note.slice(0, 120)}`);
      globalThis.__rib(some);
      if (!/lines on [A-Z]/.test(document.getElementById('note-rib')._text)) fail(`the Rib tab does not list rib ${some}'s lines`);
      globalThis.__tab('wing');
    }
    console.log(`  ok   ${checked} exported drawings and documents are each one valid file; the pattern is `
      + `${sheets} printable sheets; the rib file marks lines only on the ${lined.size} ribs that carry them`);
    Object.assign(Sx, keep);
    globalThis.__rebuild();
    globalThis.__controls();
  }

  // Diagonals follow the lines the plan actually has.
  //
  // They were placed on every second rib before the plan existed. That is
  // the default plan and no other, and it made "Diagonal reach" a control
  // that could not do anything: every free rib sat beside a lined one by
  // construction.
  {
    const Sd = globalThis.__S;
    const keep = {};
    for (const k of ['vribs', 'vribRows', 'vribReach', 'useCascadeSpec', 'cascadeSpec', 'riserLayout']) keep[k] = Sd[k];
    // On four rows and three risers, whatever the wing before it hung from.
    Sd.riserLayout = 'A/B/C+D';
    const fail = (what) => { console.log(`  FAIL ${what}`); process.exit(1); };
    const linedOf = (m) => {
      const by = {};
      for (const l of m.linePlan.lines) {
        if (l.level !== 'upper' || l.row === 'K' || !Number.isInteger(l.ribIndex)) continue;
        const row = l.anchorRow ?? (l.row === 'S' ? null : l.row);
        if (!row) continue;
        if (!by[row]) by[row] = new Set();
        by[row].add(l.ribIndex);
      }
      return by;
    };
    const strays = (m) => {
      const by = linedOf(m);
      return m.vribs.vribs.filter((d) => !(by[d.row] && by[d.row].has(d.fromRib))
        || (by[d.row] && by[d.row].has(d.toRib)));
    };
    Sd.vribs = true; Sd.vribRows = 'ABCD'; Sd.vribReach = 1; Sd.useCascadeSpec = false;
    globalThis.__rebuild();
    const m0 = globalThis.__getM();
    if (!m0.vribs.count || strays(m0).length) {
      fail(`${strays(m0).length} of ${m0.vribs.count} diagonals do not hang from a line on the default plan`);
    }
    // A cascade written with two free ribs between the lined ones. The D row
    // hangs from the C mains on this layout, so it is written without mains.
    Sd.useCascadeSpec = true;
    Sd.cascadeSpec = 'A 9 4 2\nB 9 4 2\nC 9 4 2\nD 9 4';
    globalThis.__rebuild();
    const m1 = globalThis.__getM();
    if (!m1.writtenCascade || !m1.writtenCascade.ok) fail('the written cascade was not accepted');
    if (!m1.vribs.count || strays(m1).length || m1.vribs.count === m0.vribs.count) {
      fail(`a written cascade did not move the diagonals: ${m1.vribs.count} a side, `
        + `${strays(m1).length} not hanging from a line`);
    }
    const one = m1.vribs.count;
    Sd.vribReach = 2;
    globalThis.__rebuild();
    const two = globalThis.__getM().vribs.count;
    if (!(two > one)) fail(`Diagonal reach does nothing: ${one} diagonals a side at one cell, ${two} at two`);
    Sd.vribReach = 1;

    // What the panel says about a written cascade stays true when the text
    // changes. Only a checkbox or a select rebuilds the panel, so a cascade
    // the parser rejects was left under the note from the one before it.
    globalThis.__rebuild();
    globalThis.__controls();
    const hints = () => {
      const out = [];
      const walk = (n) => {
        if (!n) return;
        if (n.className === 'hint' && n._text && n.style.display !== 'none') out.push(n._text);
        for (const c of n.children || []) walk(c);
      };
      walk(document.getElementById('g-lines'));
      return out;
    };
    const accepted = globalThis.__getM().writtenCascade.note;
    if (!hints().some((t) => t.startsWith(accepted) && /Built as written\.$/.test(t))) {
      fail('the panel does not say the written cascade is in use, and built as written: '
        + JSON.stringify(hints().slice(-2)));
    }
    Sd.cascadeSpec = 'A nine four';
    globalThis.__rebuild();                 // what leaving the text box does; the panel is NOT rebuilt
    const after = hints();
    if (after.some((t) => t.startsWith(accepted)) || !after.some((t) => /^Not used: /.test(t))) {
      fail('a rejected cascade is still shown as in use: ' + JSON.stringify(after.slice(-2)));
    }
    console.log(`  ok   diagonals hang from the plan's own lines (${m0.vribs.count} a side by default, `
      + `${one} on a sparser cascade, ${two} at a two-cell reach), and a rejected cascade says so at once`);
    Object.assign(Sd, keep);
    globalThis.__rebuild();
    globalThis.__controls();
  }

  // A published cell count is the TOTAL across the wing. `S.cells` is the
  // count for one half — the slider says so and the LEP export doubles it.
  //
  // The picker read `Math.round(r.cells / 2) * 2`, which rounds to the
  // nearest even number and halves nothing: the `* 2` undoes the `/ 2`. Every
  // reference wing was built with twice its published count, and the big ones
  // hit the clamp at 60 per half, so a 78-cell Zeno 2 and a 72-cell Allegro
  // came out identical at 120.
  //
  // Nothing caught it because every check was internally consistent — the
  // tool agreed with itself all the way down.
  {
    const S1 = globalThis.__S;
    const wasRef = S1.reference;
    const cases = [
      ['Ozone Ultralite 5 17', 34, 8.8],
      ['Ozone Geo 7 XS', 48, 10.69],
      ['Ozone Zeno 2 S', 78, null],
      // An odd published count: must be reported, not silently rounded.
      ['Ozone Alpina 5 S', 65, 11.31],
      ['BGD Lynx 2 S', 65, null],
    ];
    for (const [ref, publishedCells, publishedSpan] of cases) {
      S1.reference = ref;
      globalThis.__rebuild();
      const m = globalThis.__getM();
      // `S.cells` counts the FULL cells outboard of the centreline. With a
      // rib on the centreline the wing has twice that; with a centre cell
      // straddling it, one more.
      const builtTotal = S1.centreRib ? S1.cells * 2 : S1.cells * 2 + 1;
      if (builtTotal !== publishedCells) {
        console.log(`  FAIL ${ref} builds ${builtTotal} cells; published is `
          + `${publishedCells}`);
        process.exit(1);
      }
      // An odd count must actually be built as a centre cell, not rounded.
      if (publishedCells % 2 === 1 && S1.centreRib) {
        console.log(`  FAIL ${ref} has an odd cell count but was built with a `
          + 'rib on the centreline');
        process.exit(1);
      }
      // Ribs are cells+1 on the half wing, centre rib included.
      // Either way the half carries cells+1 ribs; what changes is whether
      // the innermost sits on the centreline or half a cell out.
      if (m.wing.ribs.length !== S1.cells + 1) {
        console.log(`  FAIL ${ref} has ${m.wing.ribs.length} ribs for `
          + `${S1.cells} half-wing cells`);
        process.exit(1);
      }
      // Span is a total too, and was always handled correctly — checked here
      // so the two conventions are pinned side by side.
      if (publishedSpan !== null
        && Math.abs(m.metrics.span - publishedSpan) > 0.02) {
        console.log(`  FAIL ${ref} spans ${m.metrics.span.toFixed(2)} m; `
          + `published is ${publishedSpan}`);
        process.exit(1);
      }
    }
    console.log(`  ok   ${cases.length} reference wings build their published `
      + 'cell count and span');

    // The rest of what the specification publishes.
    //
    // The size was all that used to arrive: the projected span, the wing's
    // mass and its weight range were in the data files and dropped at build
    // time, so every wing flew at 80 kg of pilot on 6.5 m of line, its arc
    // came from the AREA ratio, and its outline landed 1 to 2% off its own
    // published area. And every wing with an odd cell count read 5% short of
    // its projected area, because the centre cell was left out of the sum.
    const full = [
      // name, flat m2, projected m2, projected span m (or null), weight range, mass kg
      ['Ozone Geo 7 XS', 22.2, 18.7, 8.23, [55, 70], 3.34],
      ['Ozone Alpina 5 S', 21.1, 17.9, 9.05, [65, 85], 3.75],
      // Niviuk publish no projected span: their projected aspect ratio (4)
      // and area (17.15 m2) define it.
      ['Niviuk Hook 6 20', 20.0, 17.15, Math.sqrt(4 * 17.15), [55, 70], 3.97],
      ['Ozone Ultralite 5 13', 12.9, 11.4, 6.3, [55, 90], 1.44],
    ];
    // On the equations as published. The cases above leave "match the 2012
    // example sheet" ticked, which drops two moments and solves the calage
    // near 17% of chord — where no wing hangs, so the plan falls back to the
    // anchors' centroid and the free body, rightly, says the two disagree.
    const wasLegacy = S1.legacy;
    S1.legacy = false;
    for (const [ref, flat, proj, projSpan, range, mass] of full) {
      S1.reference = ref;
      globalThis.__rebuild();
      const m = globalThis.__getM();
      const fail = (what) => { console.log(`  FAIL ${ref}: ${what}`); process.exit(1); };
      if (Math.abs(m.metrics.area - flat) > 0.006) {
        fail(`flat area ${m.metrics.area.toFixed(3)} m2, published ${flat}`);
      }
      if (projSpan !== null && Math.abs(m.lobeM.projectedSpan - projSpan) > 0.006) {
        fail(`projected span ${m.lobeM.projectedSpan.toFixed(3)} m, published ${projSpan}`);
      }
      // The ellipse through the projected span lands within 2.1% of the
      // published projected area on every wing on file; the circle it
      // replaced was up to 3.7% short, so this allowed 4%.
      const projTol = 0.025;
      if (Math.abs(m.projArea / proj - 1) > projTol) {
        fail(`projected area ${m.projArea.toFixed(2)} m2, published ${proj}`);
      }
      const allUp = S1.pilotMass + S1.wingMass + S1.lineMass;
      if (Math.abs(allUp - (range[0] + range[1]) / 2) > 0.6) {
        fail(`flies at ${allUp.toFixed(1)} kg all-up; the middle of its range is `
          + `${(range[0] + range[1]) / 2}`);
      }
      if (Math.abs(S1.wingMass + S1.lineMass - mass) > 0.011) {
        fail(`wing and lines weigh ${(S1.wingMass + S1.lineMass).toFixed(2)} kg, published ${mass}`);
      }
      // Lines to the span, not the 6.5 m every wing used to get.
      const want = 0.5659 * m.metrics.span + 0.4594 - 0.5;
      if (Math.abs(S1.lineLength - want) > 0.011) {
        fail(`line length ${S1.lineLength} m; its span gives ${want.toFixed(2)}`);
      }
      if (!m.freeBody || !m.freeBody.ok) {
        fail(`does not balance as one body: ${m.freeBody ? m.freeBody.note : 'no free body'}`);
      }
    }
    console.log(`  ok   ${full.length} of them also take their published area, projected `
      + 'span, mass and weight range, and balance as one body');

    // The bill of materials against the weight the maker publishes.
    //
    // Cloth, film, tape, line and rods come to 60 to 93% of the published
    // weight across the double-surface wings in the data, on the default
    // cloths: the rest is what the bill names as not weighed. An ultralight
    // weighed in a 32 g sail comes out OVER its real weight, and a
    // single-surface wing — which this tool can only build with a lower
    // surface it does not have — at nearly twice. Both are said, in the
    // bill and on the panel, rather than left as a number.
    {
      const billOf = (ref) => {
        S1.reference = ref;
        globalThis.__rebuild();
        globalThis.__buttons.length = 0;
        globalThis.__controls();
        globalThis.__saved = {};
        globalThis.__buttons.find((x) => x.text === 'Bill of materials').fn();
        const text = Object.values(globalThis.__saved)[0] || '';
        const m = /that is (\d+)% of the ([\d.]+) kg the wing is set to weigh \(([\d.]+) kg published for the (.+)\)/.exec(text);
        return { text, pct: m ? Number(m[1]) : NaN, set: m ? Number(m[2]) : NaN, published: m ? Number(m[3]) : NaN };
      };
      const fail = (what) => { console.log(`  FAIL ${what}`); process.exit(1); };
      const seen = [];
      for (const [ref, mass] of [['Ozone Geo 7 XS', 3.34], ['Niviuk Hook 6 24', 4.5], ['Ozone Zeno 2 L', 5.62]]) {
        const b = billOf(ref);
        if (b.published !== mass || Math.abs(b.set - mass) > 0.011) {
          fail(`${ref}: the bill is not set against its published ${mass} kg`);
        }
        if (!(b.pct >= 50 && b.pct <= 100)) {
          fail(`${ref}: cloth, line and rods come to ${b.pct}% of its published ${mass} kg`);
        }
        if (/TO LOOK AT/.test(b.text)) fail(`${ref}: its bill raises a warning it should not`);
        seen.push(`${ref} ${b.pct}%`);
      }
      const light = billOf('Ozone Ultralite 5 13');
      if (!(light.pct > 100) || !/TO LOOK AT\n\s+this comes to more than the wing is set to weigh/.test(light.text)) {
        fail(`an ultralight billed in the default cloths (${light.pct}%) is not said to outweigh the wing`);
      }
      const skin = billOf('Niviuk Skin 4 P 14');
      if (!(skin.pct > 100) || !/single surface wing with no lower surface/.test(skin.text)
        || !/single surface wing — it has no lower surface/.test(S1._referenceNote || '')) {
        fail(`a single-surface wing is built double-surface (${skin.pct}% of its weight) without saying so`);
      }
      console.log(`  ok   and their bills come to a sane share of the published weight (${seen.join(', ')}); `
        + `an ultralight in the default cloths (${light.pct}%) and a single-surface wing (${skin.pct}%) are said to be over`);
    }
    // And the free body does catch the disagreement the legacy sheet makes.
    S1.legacy = true;
    globalThis.__rebuild();
    const legacyBody = globalThis.__getM().freeBody;
    if (!legacyBody || legacyBody.ok || !/hanging from/.test(legacyBody.note)) {
      console.log('  FAIL a wing hung away from where its balance solves is not reported: '
        + (legacyBody ? legacyBody.note : 'no free body'));
      process.exit(1);
    }
    console.log('  ok   and one hung away from where its balance solves is reported as such');
    S1.legacy = wasLegacy;
    S1.reference = wasRef;
    globalThis.__rebuild();
  }

  // The side panel keeps its controls and its tables.
  //
  // The cascade table was written over the Balance group, so opening the
  // Lines tab replaced thirteen inputs with a list of lines and they did not
  // come back; and the panel builder threw the balance and atmosphere tables
  // away with their hosts, so changing any select emptied both. Found in a
  // browser, by counting what was in the panel after each.
  {
    const count = (id) => {
      const walk = (n) => (n ? 1 + (n.children || []).reduce((a, c) => a + walk(c), 0) : 0);
      return walk(document.getElementById(id)) - 1;
    };
    globalThis.__tab('wing');
    globalThis.__controls();
    const balanceBefore = count('g-balance');
    const tableBefore = count('balanceTable');
    const envBefore = count('envTable');
    globalThis.__tab('lines');
    globalThis.__tab('wing');
    const fail = (what) => { console.log(`  FAIL ${what}`); process.exit(1); };
    if (count('g-balance') !== balanceBefore || balanceBefore < 20) {
      fail(`the Balance group had ${balanceBefore} nodes and has ${count('g-balance')} after the Lines tab`);
    }
    if (count('cascadeTable') < 50) fail('the cascade table is empty');
    globalThis.__controls();
    if (count('balanceTable') !== tableBefore || tableBefore < 20) {
      fail(`the balance table had ${tableBefore} nodes and has ${count('balanceTable')} after the panel was rebuilt`);
    }
    if (count('envTable') !== envBefore || envBefore < 10) {
      fail(`the atmosphere table had ${envBefore} nodes and has ${count('envTable')} after the panel was rebuilt`);
    }
    console.log(`  ok   the side panel keeps its ${balanceBefore}-node Balance group through `
      + 'the Lines tab, and its tables through a rebuild');
  }

  // A typed number honours the limits and the step its caller gave it.
  //
  // `numberField` took a step and nothing else, and twenty-one of its callers
  // passed `(min, max, step)`: the minimum arrived as the step and the rest
  // was dropped. Nothing checked, because nothing looked at the control.
  {
    globalThis.__controls();
    const byLabel = (label) => globalThis.__createdNodes
      .filter((n) => n.attrs && n.attrs['aria-label'] === label).pop();
    const kara = byLabel('Karabiner separation (cm)');
    const cd = byLabel('Line drag coefficient');
    const cz = byLabel('Cz at alpha');
    const bad = [];
    if (!kara || Number(kara.step) !== 1 || Number(kara.min) !== 20 || Number(kara.max) !== 70) {
      bad.push(`karabiner separation steps ${kara && kara.step} over ${kara && kara.min}..${kara && kara.max}`);
    }
    if (!cd || Number(cd.step) !== 0.05 || Number(cd.min) !== 0.8 || Number(cd.max) !== 1.4) {
      bad.push(`line drag coefficient steps ${cd && cd.step} over ${cd && cd.min}..${cd && cd.max}`);
    }
    if (!cz || Number(cz.step) !== 0.01 || cz.min !== undefined) {
      bad.push(`a field given only a step has step ${cz && cz.step}, min ${cz && cz.min}`);
    }
    if (bad.length) {
      for (const b of bad) console.log(`  FAIL ${b}`);
      process.exit(1);
    }
    console.log('  ok   typed numbers carry the minimum, maximum and step they were given');
  }

  // Light mode has to change what is DRAWN, not only the page chrome.
  //
  // The drawings are SVG with explicit stroke attributes, which a stylesheet
  // cannot reach, so the colours are mapped in script. If that mapping ever
  // stops being applied the page turns white and the wing stays dark on it.
  {
    const S9 = globalThis.__S;
    const strokesIn = (id) => {
      const out = new Set();
      const walk = (n) => {
        if (!n) return;
        if (n.attrs && n.attrs.stroke) out.add(n.attrs.stroke);
        for (const c of n.children || []) walk(c);
      };
      walk(document.getElementById(id));
      return out;
    };
    S9.theme = 'dark'; globalThis.__rebuild();
    const dark = strokesIn('vp-plan');
    S9.theme = 'light'; globalThis.__rebuild();
    const light = strokesIn('vp-plan');
    const shared = [...dark].filter((c) => light.has(c));
    if (!dark.size || shared.length) {
      console.log(`  FAIL light mode shares ${shared.length} stroke colours `
        + `with dark (${shared.slice(0, 3).join(' ')})`);
      process.exit(1);
    }
    console.log(`  ok   light mode redraws all ${dark.size} stroke colours`);
    S9.theme = 'dark'; globalThis.__rebuild();
  }

  // Every viewport can be saved, and a new one gets the control without
  // anyone remembering to add it.
  {
    const ids = ['vp-plan', 'vp-front', 'vp-iso', 'vp-section', 'vp-cut', 'vp-rib',
      'vp-diag', 'vp-lineplan', 'vp-polar', 'vp-atmos'];
    const missing = ids.filter((id) => {
      const svg = document.getElementById(id);
      if (!svg || !svg.parentNode) return false;
      const lbl = svg.parentNode.querySelector
        ? svg.parentNode.querySelector('.vp-label') : null;
      return !lbl || !(lbl.children || []).some((c) => c.className === 'vp-save');
    });
    if (missing.length) {
      console.log(`  FAIL ${missing.length} viewports have no save control: `
        + missing.join(', '));
      process.exit(1);
    }
    console.log(`  ok   all ${ids.length} viewports can be saved as SVG or PNG`);
  }

  // The Swoop2 has to be in the PICKER, not only behind a button elsewhere.
  //
  // It was loadable from the Files panel while the control that says "Start
  // from a published wing" offered 55 specifications and not the one complete
  // design in the library. Somebody looking for a wing to start from would
  // never have found it.
  {
    const S7 = globalThis.__S;
    const wasRef = S7.reference;
    // Walk the real control panel for an <option> carrying the id.
    //
    // My first version read `globalThis.__selects`, which does not exist —
    // so `sel` was null, the condition short-circuited, and the check could
    // never fail. That is the shape `check-assertions` exists to catch, and
    // I wrote one anyway.
    const swoopId = "Laboratori d'envol Swoop2  (complete design)";
    globalThis.__controls();
    // `tagName`, not `tag` — the stub's own field name. Reading the wrong one
    // found no options at all, and the guard below is the only reason that
    // showed up rather than passing silently.
    const optionValues = globalThis.__createdNodes
      .filter((n) => n.tagName === 'option' && n.value !== undefined)
      .map((n) => n.value);
    if (!optionValues.length) {
      console.log('  FAIL found no options at all; the walk is wrong');
      process.exit(1);
    }
    if (!optionValues.includes(swoopId)) {
      console.log('  FAIL the Swoop2 is not an option in the wing picker');
      process.exit(1);
    }

    S7.reference = swoopId;
    globalThis.__rebuild();
    const m = globalThis.__getM();
    if (Math.abs(m.metrics.area - 18.0) > 0.05) {
      console.log(`  FAIL picking the Swoop2 gives ${m.metrics.area.toFixed(2)} m2, `
        + 'published is 18.00');
      process.exit(1);
    }

    // And choosing a specification afterwards must drop the imported
    // geometry, or the tool shows a Geo 7 built out of Swoop2 ribs.
    S7.reference = 'Ozone Geo 7 XS';
    globalThis.__rebuild();
    const g = globalThis.__getM();
    if (g.wing.ribs.length === m.wing.ribs.length) {
      console.log('  FAIL switching to a specification kept the imported design');
      process.exit(1);
    }
    console.log(`  ok   the Swoop2 loads from the picker at `
      + `${m.metrics.area.toFixed(2)} m2, and switching away clears it`);
    S7.reference = wasRef;
    globalThis.__rebuild();
  }

  // The isometric view, which is where the line cascade is actually legible.
  //
  // Every other viewport is an orthographic projection down one axis: the
  // cascade collapses onto itself in plan and is a fan of overlapping
  // segments in front view. The alternative, briefly taken, was to draw the
  // lines in the 3D EXPORT thicker than they are — a model whose dimensions
  // are not the design's is not a model of the design. A picture may use a
  // legible line width; a model may not use a false diameter.
  {
    const S3 = globalThis.__S;
    globalThis.__tab('wing');
    globalThis.__rebuild();
    const withLines = document.getElementById('vp-iso').children.length;
    const was = S3.isoLines;
    S3.isoLines = false;
    globalThis.__rebuild();
    const without = document.getElementById('vp-iso').children.length;
    S3.isoLines = was;
    globalThis.__rebuild();

    if (without < 10) {
      console.log('  FAIL the isometric view draws no wing');
      process.exit(1);
    }
    if (withLines <= without) {
      console.log('  FAIL the isometric view draws no line cascade');
      process.exit(1);
    }
    // Rotating it must change what is drawn, or the projection is not using
    // the angles.
    const azWas = S3.isoAz;
    const a = (() => {
      S3.isoAz = 0; globalThis.__rebuild();
      const v = document.getElementById('vp-iso');
      return [...(v.children || [])].map((n) => n.attrs && n.attrs.d).join('|');
    })();
    S3.isoAz = 60; globalThis.__rebuild();
    const b = [...(document.getElementById('vp-iso').children || [])]
      .map((n) => n.attrs && n.attrs.d).join('|');
    S3.isoAz = azWas; globalThis.__rebuild();
    if (a === b) {
      console.log('  FAIL rotating the isometric view changes nothing');
      process.exit(1);
    }
    // The default elevation must not look ALONG the arc.
    //
    // A paraglider's tips drop about 27 degrees below its root. Set the
    // elevation to that and the camera looks straight down the arc, which
    // projects to nothing: the wing renders as a flat line and the cascade
    // hangs off it at angles that look wrong because the thing they hang
    // from has collapsed.
    //
    // The default was 25 degrees — within two of the degenerate angle for a
    // typical wing — and that is how it shipped looking wrong.
    const m3 = globalThis.__getM();
    const arcSpread = (elDeg) => {
      const az = (S3.isoAz * Math.PI) / 180;
      const e = (elDeg * Math.PI) / 180;
      const p = ([x, y, z]) => (x * Math.sin(az) + y * Math.cos(az))
        * Math.sin(e) + z * Math.cos(e);
      const r = m3.wing.ribs[0].upper[0];
      const tp = m3.wing.ribs[m3.wing.ribs.length - 1].upper[0];
      return Math.abs(p(tp) - p(r));
    };
    const arcAt = (z) => Math.abs(Math.atan2(
      Math.abs(m3.wing.ribs[m3.wing.ribs.length - 1].upper[0][2] - z),
      Math.abs(m3.wing.ribs[m3.wing.ribs.length - 1].upper[0][1]))) * 180 / Math.PI;
    const degenerate = arcAt(m3.wing.ribs[0].upper[0][2]);
    if (Math.abs(S3.isoEl - degenerate) < 6) {
      console.log(`  FAIL the default elevation ${S3.isoEl} looks along the `
        + `${degenerate.toFixed(0)} degree arc and flattens the wing`);
      process.exit(1);
    }
    if (arcSpread(S3.isoEl) < 0.5 * arcSpread(0)) {
      console.log('  FAIL the default elevation loses most of the arc: '
        + `${arcSpread(S3.isoEl).toFixed(2)} against ${arcSpread(0).toFixed(2)}`);
      process.exit(1);
    }

    console.log(`  ok   isometric view: ${without} elements of wing, `
      + `${withLines - without} of cascade, rotates, and shows the arc `
      + `(${arcSpread(S3.isoEl).toFixed(2)} of ${arcSpread(0).toFixed(2)})`);
  }

  // Whether each setting changes anything is `tools/dead-controls.cjs`,
  // which is its own stage of the check and asks it of EVERY control.
  //
  // Sixteen settings chosen by hand were probed here instead, and the test
  // was satisfied if any exported file differed — which the two files that
  // simply write the settings back out always did. "Rib and diagonal cloth"
  // was among the sixteen and passed for as long as it changed nothing at
  // all in the bill of materials it was offered for. The probe that
  // replaced this leaves those two files out, and takes a minute of its own
  // rather than a minute of this test's.

  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  if (dupes.length) {
    for (const [t, n] of dupes) console.log(`  FAIL duplicate button "${t}" x${n}`);
    process.exit(1);
  }
  if (failed.length) {
    for (const f of failed) console.log('  FAIL button ' + f);
    process.exit(1);
  }
  console.log(`  ok   ${pressed} export buttons pressed, none threw`);

  // Every DXF the buttons wrote, read back and checked.
  //
  // Pressing a button proves it does not throw. It does not prove the file is
  // a file a cutter can use — this project wrote DXF for its whole life
  // without once reading one back.
  const dxfs = Object.entries(sweepFiles)
    .filter(([name]) => /\.dxf$/i.test(name));
  // The three the interface offers: the ribs, the panels and the diagonals.
  if (!['ribs', 'panels', 'diagonals'].every((k) => dxfs.some(([n]) => n.endsWith(`-${k}.dxf`)))) {
    console.log(`  FAIL the export sweep wrote ${dxfs.length} DXF files to read back, and not the `
      + `ribs, panels and diagonals: ${dxfs.map(([n]) => n).join(', ') || 'none'}`);
    process.exit(1);
  }
  const badDxf = [];
  for (const [name, text] of dxfs) {
    const parsed = globalThis.__parseDXF(text);
    if (!parsed.polylines.length && !parsed.segments.length) {
      badDxf.push(`${name}: no geometry`);
    } else if (parsed.unreadTypes.length) {
      badDxf.push(`${name}: unreadable ${parsed.unreadTypes.join(',')}`);
    } else if (parsed.polylines.some((p) => p.points.length < 3)) {
      badDxf.push(`${name}: a polyline with under three points`);
    }
  }
  if (badDxf.length) {
    for (const b of badDxf) console.log(`  FAIL exported DXF ${b}`);
    process.exit(1);
  }
  console.log(`  ok   ${dxfs.length} exported DXF files read back and valid`);

  // The selectors must actually find things. They returned [] and null
  // unconditionally for most of this project, which let the app's tab wiring
  // run without ever touching a tab.
  const vptabs = document.querySelectorAll('.vptab');
  const viewports = document.querySelectorAll('.viewports');
  if (vptabs.length < 3 || viewports.length < 3) {
    console.log(`  FAIL selectors found ${vptabs.length} tabs, `
      + `${viewports.length} viewport groups`);
    process.exit(1);
  }
  // Counting both is not enough: renaming a viewport's data-tab leaves the
  // count identical while breaking the tab. What must hold is that every tab
  // has a viewport group to show.
  const tabNames = vptabs.map((n) => n.dataset.tab).filter(Boolean).sort();
  const vpNames = viewports.map((n) => n.dataset.tab).filter(Boolean).sort();
  const orphanTabs = tabNames.filter((t) => !vpNames.includes(t));
  const orphanViews = vpNames.filter((v) => !tabNames.includes(v));
  if (orphanTabs.length || orphanViews.length) {
    if (orphanTabs.length) console.log(`  FAIL tabs with no viewport: ${orphanTabs.join(', ')}`);
    if (orphanViews.length) console.log(`  FAIL viewports with no tab: ${orphanViews.join(', ')}`);
    process.exit(1);
  }
  console.log(`  ok   ${tabNames.length} tabs each have a viewport: ${tabNames.join(', ')}`);

  // Controls: every setting reachable, none bound twice.
  //
  // Thirty of seventy-four controls had been dumped into one group — line
  // plan, assumptions, rib openings and printing together. Splitting them
  // duplicated three, because the same setting was bound in two groups at
  // once and nothing checked.
  const src = require('fs').readFileSync('src/ui/app.js', 'utf8');
  const boundKeys = [...src.matchAll(
    /(?:slider|numberField|checkField|selectField|textAreaField)\([^,]+, '(\w+)'/g)].map((m) => m[1]);
  const counts = {};
  for (const k of boundKeys) counts[k] = (counts[k] || 0) + 1;
  const twice = Object.entries(counts).filter(([, n]) => n > 1);
  if (twice.length) {
    for (const [k, n] of twice) console.log(`  FAIL setting ${k} has ${n} controls`);
    process.exit(1);
  }

  const declared = [...src.match(/const S = \{[\s\S]*?\n\};/)[0]
    .matchAll(/(\w+):/g)].map((m) => m[1]);
  const internalOnly = ['name', 'nCrit', 'airfoilCustom', 'ribIndex', 'tab'];
  // Reached by a control outside the panel: `theme` is a button in the
  // masthead, because a colour scheme is not a design parameter and burying
  // it under six ellipticity sliders meant it was reported as missing.
  // Asserted to exist rather than merely excused.
  if (!/themeBtn/.test(src)) {
    console.log('  FAIL theme has no control anywhere, in or out of the panel');
    process.exit(1);
  }
  internalOnly.push('theme');
  const unreachable = declared.filter(
    (k) => !boundKeys.includes(k) && !internalOnly.includes(k));
  if (unreachable.length) {
    console.log(`  FAIL settings with no control: ${unreachable.join(', ')}`);
    process.exit(1);
  }
  // A control must not be able to send a value the model refuses.
  //
  // The model now rejects a zero span, a negative chord and a projected ratio
  // of 1 — good, but only if no slider can produce one. A guard the interface
  // can trip is a crash rather than a refusal, and the user did nothing
  // wrong: they moved a slider the tool gave them.
  const limits = {
    span: [0.01, Infinity], rootChord: [0.01, Infinity],
    tipChord: [0, Infinity], ellipticityLE: [0, 1], ellipticityTE: [0, 1],
    projectedRatio: [0.64, 0.99],
  };
  const outOfRange = [];
  for (const m of src.matchAll(
    /(?:slider|numberField)\([^,]+, '(\w+)', '[^']*', ([\-\d.]+), ([\-\d.]+)/g)) {
    const [, key, lo, hi] = m;
    const lim = limits[key];
    if (!lim) continue;
    if (Number(lo) < lim[0] || Number(hi) > lim[1]) {
      outOfRange.push(`${key} slides ${lo}..${hi}, model allows ${lim[0]}..${lim[1]}`);
    }
  }
  if (outOfRange.length) {
    for (const o of outOfRange) console.log(`  FAIL ${o}`);
    process.exit(1);
  }
  console.log(`  ok   ${Object.keys(limits).length} guarded inputs cannot be `
    + 'driven out of range by their controls');

  console.log(`  ok   ${boundKeys.length} controls, each bound once, `
    + `every setting reachable`);
} catch(e){ console.log('  FAIL buttons: '+e.message); process.exit(1); }

try {
  const x = globalThis.__exports();
  for (const [k,v] of Object.entries(x)) {
    console.log(`  ok   export ${k.padEnd(6)} ${String(v.length).padStart(7)} chars`);
  }
} catch(e){ console.log('  FAIL exports: '+e.message); process.exit(1); }

console.log('\nall UI paths OK');
