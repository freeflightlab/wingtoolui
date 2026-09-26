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
// Boot the real bundle against a minimal DOM shim to catch runtime errors.
const fs = require('fs');
const html = fs.readFileSync('dist/paraglider-design-tool.html','utf8');
const js = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

const ids = ['wingName','readout','g-planform','g-airfoil','g-lobe','g-balance',
  'g-panels','g-files','vp-plan','vp-front','vp-section','vp-cut',
  'note-plan','note-front','note-section','note-cut','status','balanceTable'];

// Seed the DOM from the real markup, not from a hand-written id list.
//
// The harness invented nodes by id on demand, so anything the app finds by
// class — every tab, every viewport group — did not exist for it. The tab
// wiring ran against nothing and passed.
const SEED = [];
for (const m of html.matchAll(/<(div|button)[^>]*\bclass="([^"]+)"[^>]*\bdata-tab="([^"]+)"[^>]*>/g)) {
  SEED.push({ tag: m[1], className: m[2], dataTab: m[3] });
}

const nodes = {};
// Every node created, so the selectors below can be implemented rather than
// stubbed. A registry is the difference between a selector that finds things
// and one that can only ever return nothing.
const created = [];
globalThis.__createdNodes = created;
function mk(tag='div'){
  const n = {
    tagName:tag, children:[], _text:'', className:'', style:{}, files:[],
    // Attributes are RECORDED, not discarded.
    //
    // `setAttribute(){}` threw everything away, so nothing could check what
    // colour or width a thing was drawn at. The diagonals view rendered every
    // fibre red for a whole release and no test could have seen it: the
    // drawing was testable only by element count, and the count was right.
    attrs: {},
    setAttribute(k, v){ n.attrs[k] = v; }, getAttribute(){throw new Error('stub DOM: getAttribute is not implemented; it can only ever return null.');},
    addEventListener(){}, removeEventListener(){},
    append(...c){ c.forEach(x=>{ if(x&&typeof x==='object') n.children.push(x); }); },
    appendChild(c){ n.children.push(c); return c; },
    remove(){}, click(){},
    getBoundingClientRect(){ return {width:520,height:360,top:0,left:0}; },
    getBBox(){ return {x:0,y:0,width:500,height:340}; },
    dataset:{},
    classList:{ toggle(){}, add(){}, remove(){}, contains(){return false;} },
    setPointerCapture(){},
    get textContent(){return n._text;}, set textContent(v){n._text=String(v);},
    // Setting innerHTML is legitimate — the app uses it to clear and to
    // write small fragments. Only the GETTER is meaningless here, because it
    // could only ever return empty, so only reading throws.
    get innerHTML(){ throw new Error('stub DOM: reading innerHTML can only ever see empty. Count node.children instead.'); },
    set innerHTML(v){ n.children=[]; n._text=String(v); },
    get lastChild(){ return n.children[n.children.length-1]; },
    querySelector(sel){const all=document.querySelectorAll(sel);return all.length?all[0]:null;}, contains(){return false;},
  };
  created.push(n);
  return n;
}
for (const id of ids) nodes[id]=mk();

// Materialise the seeded nodes so the selectors can find them.
for (const sd of SEED) {
  const n = mk(sd.tag);
  n.className = sd.className;
  n.dataset.tab = sd.dataTab;
  if (sd.id) nodes[sd.id] = n;
}

global.document = {
  createElement: (t)=>mk(t),
  createElementNS: (ns,t)=>mk(t),
  getElementById: (id)=> nodes[id] || (nodes[id]=mk()),
  createTextNode:(t)=>({nodeType:3,textContent:t}),
  querySelector:(sel)=>mk('div'),
  // Implemented against a registry of created nodes, not stubbed out.
  //
  // Returning [] unconditionally let the app's tab wiring run without ever
  // touching a tab, and let a button test report "0 pressed, none threw" as a
  // pass. It now matches on class and tag, so the tab switching this drives
  // is genuinely exercised.
  querySelectorAll:(sel)=>{
    const m=/^\.(.+)$/.exec(sel);
    const cls=m?m[1]:null;
    return created.filter((n)=>(cls
      ? String(n.className||'').split(/\s+/).includes(cls)
      : String(n.tagName||'').toLowerCase()===sel.toLowerCase()));
  },
  body: mk('body'),
  addEventListener(){},
};
global.window = { addEventListener(){}, };
global.ResizeObserver = class { observe(){} disconnect(){} };
global.performance = { now: ()=>Date.now() };
global.Blob = class { constructor(){} };
global.URL = { createObjectURL:()=> 'blob:x', revokeObjectURL(){} };
global.requestAnimationFrame = (f)=>setTimeout(f,0);

let errors = [];
const origErr = console.error;
// Buttons that REPLACE the design rather than export from it. They are kept
// out of the export sweeps — loading a 50-cell wing part way through means
// every rebuild after it runs on a different wing — and exercised on their
// own.
const REPLACES_DESIGN = /^(Load the Swoop2|Import LEP|Return to parametric)/;

try {
  new Function(js + '\n;globalThis.__S=S; globalThis.__getM=()=>M; globalThis.__rebuild=rebuild; globalThis.__setLEP=(d)=>{LEP=d;}; globalThis.__tab=(n)=>{S.tab=n;draw();}; globalThis.__rib=(i)=>{S.ribIndex=i;drawRib();}; globalThis.__exports=()=>({dxf:panelsToDXF(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),marked:markedPanelsToDXF(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),ribs:ribsToDXF(M.wing),diagonals:vribsToDXF(M.vribs,{rollWidth:S.rollWidth}),svg:panelsToSVG(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),lines:linesCSV(),lep:designToLep({wing:M.wing,airfoil:M.airfoil,name:S.name,balance:M.balance}),json:JSON.stringify(S)}); globalThis.__lep={parseLep,lepToDesign,describeLep,designToLep}; globalThis.__REFERENCE_TOTALS=typeof REFERENCE_TOTALS==="object"?REFERENCE_TOTALS:{}; globalThis.__parseDXF=parseDXF; globalThis.__controls=buildControls; globalThis.__saved={}; const __origSave=save; save=(f,t)=>{globalThis.__saved[f]=t;}; globalThis.__buttons=[]; const __origButton=button; button=(host,text,fn,cls)=>{globalThis.__buttons.push({text,fn}); return __origButton(host,text,fn,cls);};')();
} catch(e){ errors.push('boot: '+e.message+'\n'+e.stack.split('\n').slice(0,4).join('\n')); }

if (!errors.length) {
  const M = globalThis.__getM(), S = globalThis.__S;
  console.log('boot OK');
  console.log(`  wing: ${M.metrics.area.toFixed(2)} m2, AR ${M.metrics.aspectRatio.toFixed(2)}, ${M.wing.ribs.length} ribs`);
  console.log(`  panels: ${M.panels.length}, worst distortion ${(M.worstDev*100).toFixed(3)}%`);
  console.log(`  balance: ${M.balance.speedKMH.toFixed(1)} km/h, GR ${M.balance.glideRatio.toFixed(2)}, calage ${(M.balance.calageFraction*100).toFixed(1)}%`);
  console.log(`  cascade: ${M.cascade.segments.length} segments, ${M.cascade.totalLength.toFixed(1)} m`);
  console.log(`  rebuild: ${M.ms.toFixed(0)} ms`);

  // Exercise parameter changes the way the sliders do.
  const cases = [
    ['high aspect ratio', ()=>{S.span=13.5;S.rootChord=2.3;S.tipChord=0.55;S.cells=32;}],
    ['ellipse arc',       ()=>{S.lobeType='ellipse';S.lobeA=5.2;S.lobeB=2.4;}],
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
    ['intake too short',   ()=>{S.showIntake=true;S.intakeLower=1;}],
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
  const tbl = document.getElementById('g-balance');
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
  // Rods are drawn on the rib now, not in a view of their own. A rod alone
  // says nothing: what matters is whether it clears the holes and whether an
  // anchor tab lands on it, and that is only visible on the real rib.
  {
    const S5=globalThis.__S;
    const before=(()=>{S5.rods=false;globalThis.__rebuild();globalThis.__rib(0);
      const v=document.getElementById('vp-rib');return v.children.length;})();
    const after=(()=>{S5.rods=true;globalThis.__rebuild();globalThis.__rib(0);
      const v=document.getElementById('vp-rib');return v.children.length;})();
    if (after <= before) { console.log('  FAIL rods add nothing to the rib view'); process.exit(1); }
    console.log('  ok   rods draw on the rib: '+before+' elements without, '+after+' with');
    // A written spec with a nose rod puts an extent on BOTH surfaces, so it
    // must draw more than a single-surface group does.
    S5.useRodSpec=true; globalThis.__rebuild(); globalThis.__rib(0);
    const spec=document.getElementById('vp-rib').children.length;
    if (spec <= after) { console.log('  FAIL the rod spec draws no more than one group'); process.exit(1); }
    console.log('  ok   a written spec draws both nose surfaces: '+spec+' elements');
    S5.useRodSpec=false; globalThis.__rebuild();
  }

  // The Swoop2, loaded the way a user would. Last, because it replaces the
  // design and everything after it would be testing a different wing.
  {
    // Controls first:  is only populated when they are built.
    globalThis.__buttons.length = 0;
    globalThis.__controls();
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

    globalThis.__setLEP(null);
    globalThis.__rebuild();
    const back = globalThis.__getM();
    if (back.wing.ribs.length === halfRibs) {
      console.log('  FAIL returning to the parametric wing left the import in place');
      process.exit(1);
    }
    console.log(`  ok   and returns to the parametric wing, `
      + `${back.wing.ribs.length} ribs`);
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
  for (const b of btns) {
    seen.set(b.text, (seen.get(b.text) || 0) + 1);
    try { b.fn(); pressed++; }
    catch (e) { failed.push(`${b.text}: ${e.message.slice(0,60)}`); }
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
  // because the view called `checkDiagonalTension` without a maillon and so
  // measured against the diagonal's own axis rather than the line.
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
        + 'the load direction is not the line\'s');
      process.exit(1);
    }
    console.log(`  ok   diagonal fibres shaded by load: ${blue} carrying, `
      + `${red} not`);
    S0.vribs = wasV;
    globalThis.__tab('wing');
    globalThis.__rebuild();
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
    S1.reference = wasRef;
    globalThis.__rebuild();
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
    const ids = ['vp-plan', 'vp-front', 'vp-section', 'vp-cut', 'vp-rib',
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

  const baseline = pressAll();
  const probes = [
    // The assumptions made adjustable. A control that changes nothing is
    // worse than no control: it says the user has a choice when they do not.
    ['theme', () => { S2.theme = S2.theme === 'light' ? 'dark' : 'light'; }],
    ['vribMinLength', () => { S2.vribMinLength = S2.vribMinLength ? 0 : 150; }],
    ['clothRib', () => { S2.clothRib = S2.clothRib === 'Porcher Skytex 40 hard' ? 'Porcher Skytex 38' : 'Porcher Skytex 40 hard'; }],
    ['useCascadeSpec', () => { S2.useCascadeSpec = !S2.useCascadeSpec; }],
    ['riserLayout', () => { S2.riserLayout = S2.riserLayout === 'A/B/C+D' ? "A-A'/B" : 'A/B/C+D'; }],
    ['lineBrand', () => { S2.lineBrand = S2.lineBrand === 'all' ? 'Liros' : 'all'; }],
    ['lineStrength', () => { S2.lineStrength = S2.lineStrength === 'kinked' ? 'new' : 'kinked'; }],
    ['karabinerSep', () => { S2.karabinerSep = S2.karabinerSep === 42 ? 60 : 42; }],
    ['loopAllowance', () => { S2.loopAllowance = S2.loopAllowance === 130 ? 200 : 130; }],
    ['rowShareMode', () => {
      S2.rowShareMode = S2.rowShareMode === 'convention' ? 'pressure' : 'convention';
    }],
    ['printMargin', () => { S2.printMargin = S2.printMargin === 10 ? 20 : 10; }],
    ['marks', () => { S2.marks = !S2.marks; }],
    ['applyOval', () => { S2.applyOval = !S2.applyOval; }],
    ['cells', () => { S2.cells += 4; }],
    ['rollWidth', () => { S2.rollWidth = S2.rollWidth === 1.8 ? 1.4 : 1.8; }],
    ['stabilo', () => { S2.stabilo = !S2.stabilo; }],
  ];
  const inert = [];
  for (const [name, mutate] of probes) {
    mutate();
    globalThis.__rebuild();
    const after = pressAll();
    const changed = Object.keys(baseline)
      .some((k) => after[k] !== undefined && after[k] !== baseline[k]);
    if (!changed) inert.push(name);
    mutate();
    globalThis.__rebuild();
  }
  if (inert.length) {
    for (const i of inert) {
      console.log(`  FAIL setting changes no exported file: ${i}`);
    }
    process.exit(1);
  }
  console.log(`  ok   ${probes.length} settings each change an exported file`);

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
  const dxfs = Object.entries(globalThis.__saved || {})
    .filter(([name]) => /\.dxf$/i.test(name));
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
