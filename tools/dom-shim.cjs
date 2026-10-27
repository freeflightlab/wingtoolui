/* dom-shim.cjs — the real bundle, booted against a minimal DOM.
 *
 * Shared by the interface test and the control probe, so the two cannot be
 * testing two different stand-ins for a browser.
 *
 * Unimplemented stub methods THROW rather than returning empty. A stub that
 * returns empty does not fail; it agrees with you. `querySelectorAll`
 * returning `[]` unconditionally once let a button test report "0 buttons
 * pressed, none threw" as a pass.
 */
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
// The selectors below are implemented, not stubbed: a selector that can only
// ever return nothing agrees with every test. They search the page as a
// browser does, from what is in it — the named nodes, the body and the
// nodes the markup seeds — down through each node's children.
//
// They searched a registry of every node ever made, which a browser does not
// keep: each redraw of the ten views left its thousands of nodes in it, 6.5
// MB a rebuild, and the interface test ran out of memory once the panel grew
// a table. The control probe still asks what a panel rebuild made; it turns
// the registry on for that (`__recordNodes`) and empties it as it goes.
const created = [];
globalThis.__createdNodes = created;
globalThis.__recordNodes = false;
const seeded = [];
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
  // An id assigned in script names the node, as it does in a browser.
  //
  // `getElementById` used to hand back a node of its own for any id it was
  // asked for, so a host the app created, named and appended was never the
  // node the app then drew into. The panel builder could throw a table's
  // host away and recreate it empty, and here the table was still found —
  // in a node that was never part of the panel. That hid two real defects.
  let ownId = '';
  Object.defineProperty(n, 'id', {
    get: () => ownId,
    set: (v) => { ownId = String(v); if (ownId) nodes[ownId] = n; },
    enumerable: true,
  });
  if (globalThis.__recordNodes) created.push(n);
  return n;
}
for (const id of ids) nodes[id]=mk();

// Materialise the seeded nodes so the selectors can find them.
for (const sd of SEED) {
  const n = mk(sd.tag);
  n.className = sd.className;
  n.dataset.tab = sd.dataTab;
  if (sd.id) nodes[sd.id] = n;
  seeded.push(n);
}

// Every node in the page: from the roots down, each once.
globalThis.__inPage = () => inPage();
function inPage() {
  const out = [];
  const seen = new Set();
  const stack = [document.body, ...seeded, ...Object.values(nodes)];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object' || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    for (const c of n.children || []) stack.push(c);
  }
  return out;
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
    return inPage().filter((n)=>(cls
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
  new Function(js + '\n;globalThis.__S=S; globalThis.__getM=()=>M; globalThis.__rebuild=rebuild; globalThis.__setLEP=(d)=>{LEP=d;}; globalThis.__setStatus=setStatus; globalThis.__importLep=(text,sections)=>{loadLepDesign(parseLep(text),sections||{}); S.reference=\'\'; S._appliedReference=null; buildControls(); rebuild();}; globalThis.__getLEP=()=>LEP; globalThis.__tab=(n)=>{S.tab=n;draw();}; globalThis.__rib=(i)=>{S.ribIndex=i;drawRib();}; globalThis.__ribFeatures=(r)=>ribFeatures(r); globalThis.__exports=()=>({dxf:panelsToDXF(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),marked:markedPanelsToDXF(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),ribs:ribsToDXF(M.wing),diagonals:vribsToDXF(M.vribs,{rollWidth:S.rollWidth}),svg:panelsToSVG(seamed(),{rollWidth:S.rollWidth,gap:S.panelGap/100}),lines:linesCSV(),lep:designToLep({wing:M.wing,airfoil:M.airfoil,name:S.name,balance:M.balance}),json:JSON.stringify(S)}); globalThis.__lep={parseLep,lepToDesign,describeLep,designToLep}; globalThis.__REFERENCE_TOTALS=typeof REFERENCE_TOTALS==="object"?REFERENCE_TOTALS:{}; globalThis.__parseDXF=parseDXF; globalThis.__controls=buildControls; globalThis.__saved={}; const __origSave=save; save=(f,t)=>{globalThis.__saved[f]=t;}; globalThis.__buttons=[]; const __origButton=button; button=(host,text,fn,cls)=>{globalThis.__buttons.push({text,fn}); return __origButton(host,text,fn,cls);};')();
} catch(e){ errors.push('boot: '+e.message+'\n'+e.stack.split('\n').slice(0,4).join('\n')); }

module.exports = { errors, REPLACES_DESIGN };
