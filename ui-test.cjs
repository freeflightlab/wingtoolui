// Boot the real bundle against a minimal DOM shim to catch runtime errors.
const fs = require('fs');
const html = fs.readFileSync('dist/paraglider-design-tool.html','utf8');
const js = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

const ids = ['wingName','readout','g-planform','g-airfoil','g-lobe','g-balance',
  'g-panels','g-files','vp-plan','vp-front','vp-section','vp-cut',
  'note-plan','note-front','note-section','note-cut','status','balanceTable'];

const nodes = {};
function mk(tag='div'){
  const n = {
    tagName:tag, children:[], _text:'', className:'', style:{}, files:[],
    setAttribute(){}, getAttribute(){return null;},
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
    get innerHTML(){return '';}, set innerHTML(v){ n.children=[]; },
    get lastChild(){ return n.children[n.children.length-1]; },
    querySelector(){return null;}, contains(){return false;},
  };
  return n;
}
for (const id of ids) nodes[id]=mk();

global.document = {
  createElement: (t)=>mk(t),
  createElementNS: (ns,t)=>mk(t),
  getElementById: (id)=> nodes[id] || (nodes[id]=mk()),
  createTextNode:(t)=>({nodeType:3,textContent:t}),
  querySelector:(sel)=>mk('div'),
  querySelectorAll:(sel)=>[],
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
try {
  new Function(js + '\n;globalThis.__S=S; globalThis.__getM=()=>M; globalThis.__rebuild=rebuild; globalThis.__setLEP=(d)=>{LEP=d;}; globalThis.__tab=(n)=>{S.tab=n;draw();}; globalThis.__rib=(i)=>{S.ribIndex=i;drawRib();}; globalThis.__exports=()=>({dxf:panelsToDXF(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),marked:markedPanelsToDXF(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),ribs:ribsToDXF(M.wing),diagonals:vribsToDXF(M.vribs,{rollWidth:S.rollWidth}),svg:panelsToSVG(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),lines:linesCSV(),lep:designToLep({wing:M.wing,airfoil:M.airfoil,name:S.name,balance:M.balance}),json:JSON.stringify(S)}); globalThis.__lep={parseLep,lepToDesign,describeLep,designToLep}; globalThis.__controls=buildControls; globalThis.__saved={}; const __origSave=save; save=(f,t)=>{globalThis.__saved[f]=t;}; globalThis.__buttons=[]; const __origButton=button; button=(host,text,fn,cls)=>{globalThis.__buttons.push({text,fn}); return __origButton(host,text,fn,cls);};')();
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
  const doc = L.parseLep(fsx.readFileSync('/tmp/lepdata/gnuC2-27.txt','utf8'));
  const design = L.lepToDesign(doc);
  globalThis.__setLEP({ doc, design, info: L.describeLep(doc) });
  globalThis.__rebuild();
  const m = globalThis.__getM();
  console.log(`  ok   LEP import: ${m.metrics.area.toFixed(2)} m2, AR ${m.metrics.aspectRatio.toFixed(2)}, ${m.panels.length} panels, proj span ${m.lobeM.projectedSpan.toFixed(2)} m`);
  const out = L.designToLep({ wing: m.wing, airfoil: m.airfoil, name: 'gnuC2-27', balance: m.balance }, doc);
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
  globalThis.__tab('wing');
} catch(e){ console.log('  FAIL tab/rib: '+e.message); process.exit(1); }

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
  const btns = globalThis.__buttons;
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
    for (const b of globalThis.__buttons) { try { b.fn(); } catch (e) { /* reported above */ } }
    return Object.fromEntries(
      Object.entries(globalThis.__saved).map(([k, v]) => [k, v.length]));
  };
  const S2 = globalThis.__S;
  const baseline = pressAll();
  const probes = [
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
} catch(e){ console.log('  FAIL buttons: '+e.message); process.exit(1); }

try {
  const x = globalThis.__exports();
  for (const [k,v] of Object.entries(x)) {
    console.log(`  ok   export ${k.padEnd(6)} ${String(v.length).padStart(7)} chars`);
  }
} catch(e){ console.log('  FAIL exports: '+e.message); process.exit(1); }

console.log('\nall UI paths OK');
