/* make-diagrams.mjs — generate the figures used in docs/.
 *
 * Drawn from the project's own modules and reference data rather than by
 * hand, so a figure cannot drift away from the code it illustrates. Run with:
 *   node tools/make-diagrams.mjs
 *
 * That was the claim, and for a long time it was not true: nothing ran this,
 * so all six figures in docs/ were whatever the code drew on the day somebody
 * last did. One had its two halves drawn over each other; one coloured every
 * main line as a middle line; three quoted numbers typed into this file ("the
 * A row swings 20 points", over a legend that said 42 to 28).
 *
 * So every number in a figure is computed here, `figures()` returns the six
 * as text, and the unit suite holds the files in docs/ to it: a figure that
 * is not the one the code draws today fails the check.
 */
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { planformFromDesignInputs } from '../src/core/planform.js';
import { buildLobe } from '../src/core/lobe.js';
import { buildWing } from '../src/core/wing3d.js';
import { naca4 } from '../src/core/airfoil.js';
import { developWing } from '../src/core/flatdev.js';
import { nestPanels, layoutBands } from '../src/core/export.js';
import { rowSharesFromPressure, chordwiseLoading } from '../src/core/pressure.js';
import { parseSizeFamilies, LINE_LENGTH_PER_SPAN } from '../src/core/scaling.js';
import { parseUpLineSheet, parseLineName, resolveCascadeLevels } from '../src/core/lineplan.js';

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

/** The six figures, as `{ 'name.svg': text }`. */
export function figures() {
  const out = {};
  const pf = planformFromDesignInputs({span:11.6,rootChord:2.45,tipChord:0.55,tipSweep:1.4});
  const af = naca4('4415');
  const wing = buildWing({planform:pf,lobe:buildLobe({type:'circle',projectedRatio:0.86},pf.halfSpan),
    airfoil:af,cells:20,pointsPerSurface:30,zRotation:'auto',alphaDeg:6});

  /* 1. Diagonal ribs: the load path a line plan assumes. */
  {
    const W=760,H=300, m=40;
    const n=9;
    const lx=W-178;
    const x=(i)=>m+(i/(n-1))*(lx-36-m);
    const yTop=84, yBot=204;
    let b='';
    b+=txt('DIAGONAL RIBS — the load path a line plan assumes',m,28,C.label,13);
    // the two surfaces
    b+=path([[x(0),yTop],[x(n-1),yTop]],C.text,1,'stroke-dasharray="3 4"');
    b+=path([[x(0),yBot],[x(n-1),yBot]],C.text,1,'stroke-dasharray="3 4"');
    b+=txt('upper surface',x(n-1),yTop-8,C.text,10,'end');
    // A diagonal runs from the lower seam of a rib with a line up to the
    // upper seam of each neighbour without one.
    for(let i=0;i<n;i+=2){
      for(const d of [-1,1]){
        const j=i+d; if(j<0||j>=n) continue;
        b+=path([[x(i),yBot],[x(j),yTop]],C.magenta,1.8,'stroke-opacity="0.9"');
      }
    }
    for(let i=0;i<n;i++){
      const loaded = i%2===0;
      b+=path([[x(i),yTop],[x(i),yBot]], loaded?C.cyan:C.text, loaded?2:1);
      b+=txt(String(i), x(i)+(loaded?7:0), yBot+18, loaded?C.cyan:C.text, 10, loaded?'start':'middle');
      if(loaded) b+=`<circle cx="${x(i).toFixed(1)}" cy="${yBot}" r="3.5" fill="${C.yellow}"/>`;
    }
    // lines down from the anchors
    for(let i=0;i<n;i+=2) b+=path([[x(i),yBot],[x(i),yBot+34]],C.blue,1.2);
    b+=txt('a line attaches at each yellow point', x(0), yBot+56, C.blue,10);
    b+=txt('cyan  rib with a line',lx,104,C.cyan,10);
    b+=txt('grey  rib without one',lx,122,C.text,10);
    b+=txt('pink  diagonal rib',lx,140,C.magenta,10);
    b+=txt('Half the ribs have no',lx,172,C.label,10);
    b+=txt('line. A diagonal hangs',lx,187,C.label,10);
    b+=txt('each from the anchors',lx,202,C.label,10);
    b+=txt('of the ribs beside it.',lx,217,C.label,10);
    out['diagonal-ribs.svg'] = svg(W,H,b,'Diagonal ribs load path');
  }

  /* 2. Cutting layout: one strip vs wrapped into bands. */
  {
    const panels=developWing(wing);
    const rollWidth=1.4;
    const nested=nestPanels(panels,{rollWidth,gap:0.03});
    const L=layoutBands(nested.placed,{rollWidth});
    const W=760,H=330,m=40;
    // Two frames of the shape the banding aims for, side by side.
    const fw=320, fh=fw/1.6, fy=74;
    const pct=(v)=>`${(v*100).toFixed(0)}%`;
    const colour=(p)=>(p.surface==='upper'?C.cyan:C.green);
    let b=txt('CUTTING LAYOUT — the same nest, drawn two ways',m,26,C.label,13);
    const frame=(fx)=>path([[fx,fy],[fx+fw,fy],[fx+fw,fy+fh],[fx,fy+fh],[fx,fy]],C.text,1,'stroke-dasharray="3 4"');

    // One strip, fitted to the frame's width.
    const s1=fw/L.rollLength;
    const stripH=rollWidth*s1;
    const y1=fy+(fh-stripH)/2;
    b+=frame(m);
    b+=path([[m,y1],[m+fw,y1],[m+fw,y1+stripH],[m,y1+stripH],[m,y1]],C.magenta,0.6,'stroke-opacity="0.6"');
    for(const p of nested.placed) b+=path(p.outline.map(([X,Y])=>[m+X*s1,y1+Y*s1]),colour(p),0.4);
    b+=txt(`one strip, ${L.rollLength.toFixed(1)} m of ${rollWidth} m roll:`,m,50,C.text,10);
    b+=txt(`${pct((fw*stripH)/(fw*fh))} of the frame`,m,64,C.label,10);

    // Wrapped into bands: band b below band b-1, y running down the roll.
    // A panel is drawn whole in the band it starts in, so the last ones of a
    // band run past its end, and the fit is to what is drawn.
    const fx2=m+fw+40;
    const placedInBands=nested.placed.map((p)=>{
      const q=L.placePanel(p);
      const back=q.band*(rollWidth+L.gapY);
      return { p, pts:q.points.map(([X,Y])=>[X, q.band*(rollWidth+L.gapY)+(Y+back)]) };
    });
    const allX=placedInBands.flatMap((q)=>q.pts.map((t)=>t[0]));
    const bw=Math.max(L.bandLength,...allX), bh=L.totalHeight;
    const s2=Math.min(fw/bw, fh/bh);
    const ox=fx2+(fw-bw*s2)/2, oy=fy+(fh-bh*s2)/2;
    b+=frame(fx2);
    for(let band=0;band<L.bands;band++){
      const yb=oy+band*(rollWidth+L.gapY)*s2;
      b+=path([[ox,yb],[ox+L.bandLength*s2,yb],[ox+L.bandLength*s2,yb+rollWidth*s2],[ox,yb+rollWidth*s2],[ox,yb]],
        C.magenta,0.6,'stroke-opacity="0.6"');
    }
    for(const q of placedInBands) b+=path(q.pts.map(([X,Y])=>[ox+X*s2,oy+Y*s2]),colour(q.p),0.6);
    b+=txt(`wrapped into ${L.bands} bands of ${L.bandLength.toFixed(1)} m:`,fx2,50,C.text,10);
    b+=txt(`${pct((bw*s2*bh*s2)/(fw*fh))} of the same frame`,fx2,64,C.label,10);
    b+=txt('A display transform only: the cutting file is one strip either way.',m,fy+fh+28,C.text,10);
    out['cutting-layout.svg'] = svg(W,H,b,'Cutting layout banding');
  }

  /* 3. Chordwise load split, and how it moves on the bar. */
  {
    const W=760,H=330,m=54;
    const anchors={A:0.085,B:0.30,C:0.53,D:0.78};
    let b=txt('CHORDWISE LOAD — the split moves on the speedbar',m,26,C.label,13);
    const px=(x)=>m+x*(W-2*m-160);
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
    const lx=W-150;
    let ly=110;
    const shareA=[];
    for(const [a,col] of alphas){
      const r=rowSharesFromPressure(af,anchors,a);
      shareA.push(Math.round(r.shares.A*100));
      b+=txt(`a = ${a}deg`,lx,ly,col,11); ly+=16;
      b+=txt(`A ${(r.shares.A*100).toFixed(0)}  B ${(r.shares.B*100).toFixed(0)}  C ${(r.shares.C*100).toFixed(0)}  D ${(r.shares.D*100).toFixed(0)}`,lx,ly,C.text,10); ly+=24;
    }
    // The swing is the legend's own first and last A share, not a number
    // typed here: it said 20 over a legend reading 42 and 28.
    b+=txt(`The A row sheds ${shareA[0]-shareA[shareA.length-1]}`,lx,ly+10,C.label,10);
    b+=txt('points across the bar.',lx,ly+25,C.label,10);
    b+=txt('A fixed 35/35/20/10',lx,ly+40,C.label,10);
    b+=txt('cannot describe both.',lx,ly+55,C.label,10);
    out['chordwise-load.svg'] = svg(W,H,b,'Chordwise load distribution');
  }

  /* 4. Line length per metre of span against aspect ratio. */
  {
    const fams=parseSizeFamilies(readFileSync('data/reference/size-families.tsv','utf8'));
    const law=LINE_LENGTH_PER_SPAN;
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
    // The law, from the module that states it.
    const fit=(ar)=>law.slope*ar+law.intercept;
    b+=path([[x(4.4),y(fit(4.4))],[x(7.0),y(fit(7.0))]],C.yellow,1.6,'stroke-dasharray="6 4"');
    // A label goes where it can be read: to the right of its point, or
    // above, below or to the left of it where that would run into a point
    // or a label already there. Two were printed over each other.
    const taken=pts.map((p)=>[x(p.ar)-6,y(p.k)-6,x(p.ar)+6,y(p.k)+6]);
    // The fitted line is in the way of a label too: it ran through "Geo 7".
    for(let ar=4.4;ar<=7.0;ar+=0.02) taken.push([x(ar)-2,y(fit(ar))-2,x(ar)+2,y(fit(ar))+2]);
    const hits=(r)=>taken.some((t)=>r[0]<t[2]&&r[2]>t[0]&&r[1]<t[3]&&r[3]>t[1]);
    for(const p of pts){
      const cx=x(p.ar), cy=y(p.k);
      // Pink is every family that was not in the fit. BGD's was drawn as
      // one of the fitted ones.
      const outOfSample=law.outOfSample.some((o)=>o.family===p.name);
      b+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="${outOfSample?C.magenta:C.cyan}"/>`;
      const label=p.name.replace(/^(Ozone|PHI|BGD|Skywalk) /,'');
      const w=label.length*6.1;
      // [anchor x, baseline y, text-anchor], and the box the text fills
      const places=[
        [cx+9,cy+4,'start'],[cx+5,cy-9,'start'],[cx+5,cy+17,'start'],
        [cx-9,cy+4,'end'],[cx-5,cy-9,'end'],[cx-5,cy+17,'end'],
      ];
      const boxOf=([tx,ty,anchor])=>(anchor==='start'?[tx,ty-9,tx+w,ty+2]:[tx-w,ty-9,tx,ty+2]);
      const at=places.find((q)=>!hits(boxOf(q)))||places[0];
      taken.push(boxOf(at));
      b+=txt(label,at[0].toFixed(1),at[1].toFixed(1),C.text,10,at[2]);
    }
    b+=txt('aspect ratio',x(5.6),306,C.text,10,'middle');
    b+=txt('m of line per m of span',m-14,84,C.text,10);
    const lx=W-158;
    b+=txt(`k = ${law.slope.toFixed(2)}*AR + ${law.intercept.toFixed(2)}`,lx,120,C.yellow,10);
    b+=txt(`R2 = ${law.r2.toFixed(2)}, ${law.sampleFamilies} families`,lx,136,C.text,10);
    b+=txt('pink: not in the fit',lx,164,C.magenta,10);
    law.outOfSample.forEach((o,i)=>{
      b+=txt(`${o.family.replace(/^(Ozone|PHI|BGD|Skywalk) /,'')}: within ${o.worstErrorPct}%`,lx,179+15*i,C.magenta,10);
    });
    out['line-length-law.svg'] = svg(W,H,b,'Line length law');
  }

  /* 5. The loop allowance: fixed per line, so it bites hardest on short ones. */
  {
    const sheet = parseUpLineSheet(readFileSync('data/reference/up-meru2-MERU2_M_Einzelleine_single.tsv','utf8'));
    const lines = sheet.lines.filter(l=>l.loopMM!=null&&l.cuttingMM!=null)
      .sort((a,b)=>a.lengthMM-b.lengthMM);
    const W=760,H=330,m=56;
    let b=txt('LOOP ALLOWANCE — fixed per line, so it bites hardest on short ones',m,26,C.label,13);
    const maxLen=Math.max(...lines.map(l=>l.cuttingMM));
    const px=(v)=>m+(v/maxLen)*(W-2*m-190);
    const n=lines.length;
    const py=(i)=>62+(i/n)*(H-120);
    const bh=Math.max(1.2,(H-120)/n-0.6);
    for(let i=0;i<n;i++){
      const l=lines[i];
      b+=`<rect x="${px(0)}" y="${py(i).toFixed(1)}" width="${(px(l.lengthMM)-px(0)).toFixed(1)}" height="${bh.toFixed(1)}" fill="${C.cyan}" fill-opacity="0.75"/>`;
      b+=`<rect x="${px(l.lengthMM).toFixed(1)}" y="${py(i).toFixed(1)}" width="${(px(l.cuttingMM)-px(l.lengthMM)).toFixed(1)}" height="${bh.toFixed(1)}" fill="${C.magenta}" fill-opacity="0.95"/>`;
    }
    // Beside the bars they describe, not over them.
    b+=txt('shortest lines',(px(lines[0].cuttingMM)+10).toFixed(1),(py(0)+9).toFixed(1),C.text,10);
    b+=txt('longest lines',px(0),(py(n)+16).toFixed(1),C.text,10);
    b+=path([[px(0),56],[px(0),py(n)+3]],C.text,1);
    const lx=W-170;
    b+=`<rect x="${lx}" y="86" width="12" height="9" fill="${C.cyan}" fill-opacity="0.75"/>`;
    b+=txt('finished length',lx+18,95,C.cyan,10);
    b+=`<rect x="${lx}" y="104" width="12" height="9" fill="${C.magenta}"/>`;
    b+=txt('loop allowance',lx+18,113,C.magenta,10);
    const share=(sheet.totalCuttingM-sheet.totalFinishedM)/sheet.totalCuttingM;
    const worst=Math.max(...lines.map(l=>l.loopMM/l.cuttingMM));
    const loops=[...new Set(lines.map(l=>l.loopMM))].sort((a,b)=>a-b);
    b+=txt('UP Meru 2, size M',lx,144,C.label,10);
    b+=txt(`${lines.length} lines`,lx,160,C.text,10);
    b+=txt(`finished ${sheet.totalFinishedM.toFixed(0)} m`,lx,176,C.text,10);
    b+=txt(`cut ${sheet.totalCuttingM.toFixed(0)} m`,lx,192,C.text,10);
    b+=txt(`loops ${loops[0]} to ${loops[loops.length-1]} mm`,lx,208,C.text,10);
    b+=txt(`= ${(share*100).toFixed(0)}% of the cut,`,lx,230,C.magenta,10);
    b+=txt(`${(worst*100).toFixed(0)}% of the shortest`,lx,246,C.magenta,10);
    b+=txt('line',lx,260,C.magenta,10);
    out['loop-allowance.svg'] = svg(W,H,b,'Loop allowance by line length');
  }

  /* 6. Seven naming conventions, all parsed by one grammar. */
  {
    // Whose sheet a name is on is part of reading it: `A1` is a canopy line
    // to Ozone and the line under the canopy lines to UP and PHI. The third
    // entry says which, where it matters.
    //
    // This drew UP's and PHI's `A1` as whatever a bare `A1` reads as, and
    // tested for a level called 'riser' that no name has had since the main
    // lines were given their own name — so regenerated, every main line would
    // have come out in the colour of a middle one.
    const makers = [
      ['Ozone',        ['A1','AM6','AR3','KRL1']],
      ['PHI',          ['a1','A1','AI'], 'up'],
      ['BGD',          ['a1','AM1','AR1']],
      ['UP',           ['a1','A1','AI','Amain1'], 'up'],
      ['UP brake',     ['br7','BR3','BRI','BRmain'], 'up'],
      ['UP stabilo',   ['st3','ST1','STI'], 'up'],
      ['Advance TAU',  ['1A3','2AB2','3AB1','4AB1']],
    ];
    const W=760, H=340, m=44;
    const x0=m+120, x1=W-230;
    let b=txt('SEVEN NAMING CONVENTIONS, ONE GRAMMAR',m,26,C.label,13);
    b+=txt('canopy',x0,46,C.text,10);
    b+=txt('riser',x1,46,C.text,10,'end');
    b+=path([[x0,52],[x1,52]],C.text,1,'stroke-dasharray="3 4"');
    let y=78;
    for (const [maker,names,convention] of makers) {
      const parsed = resolveCascadeLevels(names.map((n)=>parseLineName(n,{convention})));
      b+=txt(maker,m,y+4,C.label,11);
      parsed.forEach((p,i)=>{
        const x=x0+26+i*((x1-x0-54)/Math.max(1,names.length-1));
        const col = !p ? C.red
          : p.level==='upper' ? C.cyan
          : p.level==='main' ? C.magenta
          : p.level==='upper-main' ? C.green : C.yellow;
        b+=`<rect x="${(x-26).toFixed(1)}" y="${y-11}" width="54" height="18" rx="3" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="1"/>`;
        b+=txt(names[i], (x+1).toFixed(1), y+4, col, 10, 'middle');
        if (p && p.combined) b+=txt('2 rows', (x+1).toFixed(1), y+17, C.text, 8, 'middle');
      });
      y+=36;
    }
    const lx=W-190;
    b+=txt('cyan   at the canopy',lx,86,C.cyan,10);
    b+=txt('yellow middle',lx,104,C.yellow,10);
    b+=txt('green  upper-main',lx,122,C.green,10);
    b+=txt('pink   main: the line',lx,140,C.magenta,10);
    b+=txt('       at the riser',lx,154,C.magenta,10);
    out['naming-conventions.svg'] = svg(W,H,b,'Line naming conventions');
  }

  return out;
}

// Run as a script: write them. Imported: just hand them over.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const figs = figures();
  for (const [name, text] of Object.entries(figs)) writeFileSync(`docs/${name}`, text);
  console.log(`wrote ${Object.keys(figs).length} diagrams to docs/`);
}
