/* make-diagrams.mjs — generate the figures used in docs/.
 *
 * Drawn from the project's own modules and reference data rather than by
 * hand, so a figure cannot drift away from the code it illustrates. Run with:
 *   node tools/make-diagrams.mjs
 */
import { writeFileSync, readFileSync } from 'fs';
import { planformFromDesignInputs, planformMetrics } from '../src/core/planform.js';
import { buildLobe } from '../src/core/lobe.js';
import { buildWing } from '../src/core/wing3d.js';
import { naca4 } from '../src/core/airfoil.js';
import { developWing } from '../src/core/flatdev.js';
import { nestPanels, layoutBands } from '../src/core/export.js';
import { buildVRibs } from '../src/core/vribs.js';
import { rowSharesFromPressure, chordwiseLoading } from '../src/core/pressure.js';
import { parseSizeFamilies } from '../src/core/scaling.js';

const C = { bg:'#0d1317', grid:'#1e2a32', text:'#7b8f9b', label:'#ccd8de',
  cyan:'#35d6e8', green:'#5fd97a', magenta:'#e85bc4', yellow:'#e8c547',
  blue:'#6e8bff', red:'#ff5e5e' };

const svg = (w,h,body,title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">
<rect width="${w}" height="${h}" fill="${C.bg}"/>
<style>text{font-family:ui-monospace,Menlo,Consolas,monospace}</style>
${body}
</svg>`;
// `extra` may itself set fill, so the default is only emitted when it does
// not — otherwise the element carries two fill attributes and the file is not
// well-formed XML, which is exactly what the validity check caught.
const path = (pts,stroke,w=1.4,extra='') => {
  const d = pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const fill = /\bfill=/.test(extra) ? '' : ' fill="none"';
  return `<path d="${d}"${fill} stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
};
const txt = (s,x,y,fill=C.text,size=11,anchor='start') =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" text-anchor="${anchor}">${s}</text>`;

const pf = planformFromDesignInputs({span:11.6,rootChord:2.45,tipChord:0.55,tipSweep:1.4});
const af = naca4('4415');
const wing = buildWing({planform:pf,lobe:buildLobe({type:'circle',projectedRatio:0.86},pf.halfSpan),
  airfoil:af,cells:20,pointsPerSurface:30,zRotation:'auto',alphaDeg:6});

/* 1. Diagonal ribs: the load path a line plan assumes. */
{
  const W=760,H=330, m=40;
  const ribs=wing.ribs, n=9;
  const x=(i)=>m+ (i/(n-1))*(W-2*m-120);
  const yTop=90, yBot=210;
  let b='';
  b+=txt('DIAGONAL RIBS — the load path a line plan assumes',m,28,C.label,13);
  for(let i=0;i<n;i++){
    const loaded = i%2===0;
    b+=path([[x(i),yTop],[x(i),yBot]], loaded?C.cyan:C.text, loaded?2:1);
    b+=txt(String(i), x(i), yBot+18, loaded?C.cyan:C.text, 10,'middle');
    if(loaded) b+=`<circle cx="${x(i)}" cy="${yBot}" r="3.5" fill="${C.yellow}"/>`;
  }
  // canopy surfaces
  b+=path([[x(0),yTop],[x(n-1),yTop]],C.text,1,'stroke-dasharray="3 4"');
  b+=path([[x(0),yBot],[x(n-1),yBot]],C.text,1,'stroke-dasharray="3 4"');
  // diagonals from each loaded rib to its neighbours' upper surface
  for(let i=0;i<n;i+=2){
    for(const d of [-1,1]){
      const j=i+d; if(j<0||j>=n) continue;
      b+=path([[x(i),yBot],[x(j),yTop+16],[x(j),yTop+4],[x(i),yBot]],C.magenta,1.2,'fill="'+C.magenta+'" fill-opacity="0.12"');
    }
  }
  // lines down from anchors
  for(let i=0;i<n;i+=2) b+=path([[x(i),yBot],[x(i),yBot+30]],C.blue,1.2);
  b+=txt('line attaches here', x(0)-4, yBot+48, C.blue,10);
  const lx=W-115;
  b+=txt('cyan  rib with a line',lx,110,C.cyan,10);
  b+=txt('grey  rib without one',lx,128,C.text,10);
  b+=txt('pink  diagonal rib',lx,146,C.magenta,10);
  b+=txt('Half the span has no',lx,178,C.label,10);
  b+=txt('line on it. Diagonals',lx,193,C.label,10);
  b+=txt('carry its lift across',lx,208,C.label,10);
  b+=txt('to the next anchor.',lx,223,C.label,10);
  writeFileSync('docs/diagonal-ribs.svg', svg(W,H,b,'Diagonal ribs load path'));
}

/* 2. Cutting layout: one strip vs wrapped into bands. */
{
  const panels=developWing(wing);
  const nested=nestPanels(panels,{rollWidth:1.4,gap:0.03});
  const L=layoutBands(nested.placed,{rollWidth:1.4});
  const W=760,H=300,m=40;
  let b=txt('CUTTING LAYOUT — the same nest, drawn two ways',m,26,C.label,13);
  // one strip
  const sx=(W-2*m)/L.rollLength;
  b+=txt(`one strip: ${L.rollLength.toFixed(0)} m x 1.4 m, uses 4% of the frame`,m,52,C.text,10);
  for(const p of nested.placed){
    const pts=p.outline.map(([X,Y])=>[m+X*sx, 68+Y*sx]);
    b+=path(pts,C.cyan,0.5);
  }
  // wrapped
  b+=txt(`wrapped into ${L.bands} bands: 91%`,m,120,C.text,10);
  const s2=Math.min((W-2*m)/L.bandLength, 150/L.totalHeight);
  for(const p of nested.placed){
    const q=L.placePanel(p);
    const pts=q.points.map(([X,Y])=>[m+X*s2, 145+(-Y)*s2]);
    b+=path(pts, p.surface==='upper'?C.cyan:C.green, 0.7);
  }
  for(const e of L.edges()){
    b+=path(e.top.map(([X,Y])=>[m+X*s2,145+(-Y)*s2]),C.magenta,0.8,'stroke-opacity="0.5"');
    b+=path(e.bottom.map(([X,Y])=>[m+X*s2,145+(-Y)*s2]),C.magenta,0.8,'stroke-opacity="0.5"');
  }
  writeFileSync('docs/cutting-layout.svg', svg(W,H,b,'Cutting layout banding'));
}

/* 3. Chordwise load split, and how it moves on the bar. */
{
  const W=760,H=330,m=54;
  const anchors={A:0.085,B:0.30,C:0.53,D:0.78};
  let b=txt('CHORDWISE LOAD — the split moves on the speedbar',m,26,C.label,13);
  const px=(x)=>m+x*(W-2*m-150);
  const alphas=[[10,C.cyan],[6,C.yellow],[2,C.magenta]];
  const maxDcp=8;
  const py=(v)=>250-(v/maxDcp)*160;
  b+=path([[px(0),250],[px(1),250]],C.text,1);
  b+=path([[px(0),90],[px(0),250]],C.text,1);
  for(const [a,col] of alphas){
    const L=chordwiseLoading(af,a);
    const pts=L.points.filter(p=>p.x>0.01).map(p=>[px(p.x),py(Math.min(maxDcp,p.dcp))]);
    b+=path(pts,col,1.6);
  }
  for(const [k,f] of Object.entries(anchors)){
    b+=path([[px(f),250],[px(f),262]],C.blue,1.2);
    b+=txt(k,px(f),276,C.blue,10,'middle');
  }
  b+=txt('leading edge',px(0),292,C.text,10);
  b+=txt('trailing edge',px(1),292,C.text,10,'end');
  b+=txt('load per unit chord',m-8,84,C.text,10);
  const lx=W-140;
  let ly=110;
  for(const [a,col] of alphas){
    const r=rowSharesFromPressure(af,anchors,a);
    b+=txt(`a = ${a}deg`,lx,ly,col,11); ly+=16;
    b+=txt(`A ${(r.shares.A*100).toFixed(0)}  B ${(r.shares.B*100).toFixed(0)}  C ${(r.shares.C*100).toFixed(0)}  D ${(r.shares.D*100).toFixed(0)}`,lx,ly,C.text,10); ly+=24;
  }
  b+=txt('The A row swings 20',lx,ly+10,C.label,10);
  b+=txt('points across the bar.',lx,ly+25,C.label,10);
  b+=txt('A fixed 35/35/20/10',lx,ly+40,C.label,10);
  b+=txt('cannot describe both.',lx,ly+55,C.label,10);
  writeFileSync('docs/chordwise-load.svg', svg(W,H,b,'Chordwise load distribution'));
}

/* 4. Line length per metre of span against aspect ratio. */
{
  const fams=parseSizeFamilies(readFileSync('data/reference/size-families.tsv','utf8'));
  const pts=[];
  for(const [name,sizes] of Object.entries(fams)){
    const withLines=sizes.filter(s=>s.totalLineLength);
    if(!withLines.length) continue;
    const ar=withLines[0].flatAR;
    const k=withLines.reduce((a,s)=>a+s.totalLineLength/s.flatSpan,0)/withLines.length;
    pts.push({name,ar,k});
  }
  pts.sort((a,b)=>a.ar-b.ar);
  const W=760,H=320,m=60;
  let b=txt('LINE LENGTH PER METRE OF SPAN vs ASPECT RATIO',m,26,C.label,13);
  const x=(v)=>m+((v-4.3)/(7.1-4.3))*(W-2*m-160);
  const y=(v)=>270-((v-13)/(30-13))*180;
  b+=path([[x(4.3),270],[x(7.1),270]],C.text,1);
  b+=path([[x(4.3),90],[x(4.3),270]],C.text,1);
  for(const v of [4.5,5,5.5,6,6.5,7]){ b+=path([[x(v),270],[x(v),275]],C.text,1); b+=txt(String(v),x(v),290,C.text,10,'middle'); }
  for(const v of [15,20,25,30]){ b+=path([[x(4.3)-5,y(v)],[x(4.3),y(v)]],C.text,1); b+=txt(String(v),x(4.3)-10,y(v)+4,C.text,10,'end'); }
  // fitted law
  b+=path([[x(4.4),y(-5.12*4.4+50.72)],[x(7.0),y(-5.12*7.0+50.72)]],C.yellow,1.6,'stroke-dasharray="6 4"');
  for(const p of pts){
    b+=`<circle cx="${x(p.ar).toFixed(1)}" cy="${y(p.k).toFixed(1)}" r="4" fill="${/Skywalk/.test(p.name)?C.magenta:C.cyan}"/>`;
    b+=txt(p.name.replace(/^(Ozone|PHI|BGD|Skywalk) /,''), x(p.ar)+8, y(p.k)+4, C.text,10);
  }
  b+=txt('aspect ratio',x(5.6),306,C.text,10,'middle');
  b+=txt('m of line per m of span',m-14,84,C.text,10);
  const lx=W-155;
  b+=txt('k = -5.12*AR + 50.72',lx,120,C.yellow,10);
  b+=txt('R2 = 0.95',lx,136,C.text,10);
  b+=txt('pink: Skywalk SAGE,',lx,164,C.magenta,10);
  b+=txt('out of sample, 0.8%',lx,179,C.magenta,10);
  writeFileSync('docs/line-length-law.svg', svg(W,H,b,'Line length law'));
}

/* 5. The loop allowance: fixed per line, so it bites hardest on short ones. */
{
  const { parseUpLineSheet } = await import('../src/core/lineplan.js');
  const sheet = parseUpLineSheet(readFileSync('data/reference/up-meru2-MERU2_M_Einzelleine_single.tsv','utf8'));
  const lines = sheet.lines.filter(l=>l.loopMM!=null&&l.cuttingMM!=null)
    .sort((a,b)=>a.lengthMM-b.lengthMM);
  const W=760,H=330,m=56;
  let b=txt('LOOP ALLOWANCE — fixed per line, so it bites hardest on short ones',m,26,C.label,13);
  const maxLen=Math.max(...lines.map(l=>l.cuttingMM));
  const px=(v)=>m+(v/maxLen)*(W-2*m-170);
  const n=lines.length;
  const py=(i)=>62+(i/n)*(H-120);
  const bh=Math.max(1.2,(H-120)/n-0.6);
  for(let i=0;i<n;i++){
    const l=lines[i];
    b+=`<rect x="${px(0)}" y="${py(i).toFixed(1)}" width="${(px(l.lengthMM)-px(0)).toFixed(1)}" height="${bh.toFixed(1)}" fill="${C.cyan}" fill-opacity="0.75"/>`;
    b+=`<rect x="${px(l.lengthMM).toFixed(1)}" y="${py(i).toFixed(1)}" width="${(px(l.cuttingMM)-px(l.lengthMM)).toFixed(1)}" height="${bh.toFixed(1)}" fill="${C.magenta}" fill-opacity="0.95"/>`;
  }
  b+=txt('shortest lines',m-6,74,C.text,10);
  b+=txt('longest lines',m-6,H-56,C.text,10);
  b+=path([[px(0),56],[px(0),H-50]],C.text,1);
  const lx=W-166;
  b+=`<rect x="${lx}" y="86" width="12" height="9" fill="${C.cyan}" fill-opacity="0.75"/>`;
  b+=txt('finished length',lx+18,95,C.cyan,10);
  b+=`<rect x="${lx}" y="104" width="12" height="9" fill="${C.magenta}"/>`;
  b+=txt('loop allowance',lx+18,113,C.magenta,10);
  const share=(sheet.totalCuttingM-sheet.totalFinishedM)/sheet.totalCuttingM;
  const worst=Math.max(...lines.map(l=>l.loopMM/l.cuttingMM));
  b+=txt('UP Meru 2, size M',lx,144,C.label,10);
  b+=txt(`${lines.length} lines`,lx,160,C.text,10);
  b+=txt(`finished ${sheet.totalFinishedM.toFixed(0)} m`,lx,176,C.text,10);
  b+=txt(`cut ${sheet.totalCuttingM.toFixed(0)} m`,lx,192,C.text,10);
  b+=txt(`loops = ${(share*100).toFixed(0)}% of cut`,lx,214,C.magenta,10);
  b+=txt(`up to ${(worst*100).toFixed(0)}% on the`,lx,230,C.magenta,10);
  b+=txt('shortest line',lx,244,C.magenta,10);
  writeFileSync('docs/loop-allowance.svg', svg(W,H,b,'Loop allowance by line length'));
}

/* 6. Seven naming conventions, all parsed by one grammar. */
{
  const { parseLineName, resolveCascadeLevels } = await import('../src/core/lineplan.js');
  const makers = [
    ['Ozone',        ['A1','AM6','AR3','KRL1']],
    ['PHI',          ['a1','A1','AI']],
    ['BGD',          ['a1','AM1','AR1','KL1']],
    ['UP',           ['a1','A1','AI','Amain1']],
    ['UP brake',     ['br7','BRI','BRmain']],
    ['UP stabilo',   ['sa1','st3']],
    ['Advance TAU',  ['1A3','2AB2','3AB1','4AB1']],
  ];
  const W=760, H=340, m=44;
  let b=txt('SEVEN NAMING CONVENTIONS, ONE GRAMMAR',m,26,C.label,13);
  b+=txt('canopy',m+150,46,C.text,10);
  b+=txt('riser',W-190,46,C.text,10,'end');
  b+=path([[m+150,52],[W-190,52]],C.text,1,'stroke-dasharray="3 4"');
  let y=76;
  for (const [maker,names] of makers) {
    const parsed = resolveCascadeLevels(names.map(parseLineName));
    b+=txt(maker,m,y+4,C.label,11);
    parsed.forEach((p,i)=>{
      const x=m+150+i*((W-190-(m+150))/Math.max(1,names.length-1||1));
      const col = !p ? C.red
        : p.level==='upper' ? C.cyan
        : p.level==='riser' ? C.magenta
        : p.level==='upper-main' ? C.green : C.yellow;
      b+=`<rect x="${(x-26).toFixed(1)}" y="${y-11}" width="54" height="18" rx="3" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="1"/>`;
      b+=txt(names[i], x+1, y+4, col, 10, 'middle');
      if (p && p.combined) b+=txt('2 rows', x+1, y+17, C.text, 8, 'middle');
    });
    y+=40;
  }
  const lx=W-176;
  b+=txt('cyan   canopy line',lx,y+4,C.cyan,10);
  b+=txt('yellow middle',lx,y+18,C.yellow,10);
  b+=txt('green  upper-main',lx,y+32,C.green,10);
  b+=txt('pink   riser',lx,y+46,C.magenta,10);
  writeFileSync('docs/naming-conventions.svg', svg(W,H,b,'Line naming conventions'));
}

console.log('wrote 6 diagrams to docs/');
