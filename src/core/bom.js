/* bom.js — bill of materials.
 *
 * Everything the construction side produces, totalled into what has to be
 * bought: fabric by roll, line by type, and the hardware that is neither.
 *
 * This is where estimates that looked harmless in isolation get added up, so
 * it is also where their honesty matters. Three of them are worth naming.
 *
 * **Fabric is bought by the roll, not by area.** Nesting decides how much of
 * a roll a set of panels consumes, and the offcut is bought and paid for
 * whether or not it is used. A bill quoting panel area understates the order
 * by whatever the nesting wastes — around 55% on a wing's sail panels, which
 * is not a rounding error.
 *
 * **Line is bought by cut length, not finished length.** The loop allowance
 * is real material and a fixed quantity per line, so it lands hardest on the
 * short top lines. UP's own sheets put it at 13% of everything cut.
 *
 * **Rib cloth is not negligible.** Ribs are the third fabric item after the
 * two sail surfaces, and holes remove about a third of them.
 *
 * Hardware counts come from the plan rather than from a template: a maillon
 * per riser, a pulley per brake, and so on, so a change to the rigging shows
 * up in the order.
 */

import { fabricEstimate, vribFabricEstimate } from './export.js';

/** Representative cloth weights, kg per square metre. */
export const DEFAULT_CLOTH = {
  upperSail: 0.038,      // ~38 g/m2, a light double-coated ripstop
  lowerSail: 0.034,
  rib: 0.040,            // hard-finish rib cloth, heavier per area
  diagonal: 0.032,
};

/**
 * Build the bill.
 *
 * Every input is optional; what is missing is reported as missing rather than
 * assumed to be zero, because a bill that silently omits the lines looks the
 * same as one for a wing with no lines.
 */
export function buildBOM({
  panels = null,
  nested = null,
  wing = null,
  ribHoles = null,
  vribs = null,
  linePlan = null,
  lineSelection = null,
  lineStretch = null,
  cloth = {},
  rollWidth = 1.4,
  gap = 0.03,
  riserCount = 3,
  brakeHandles = 2,
  reinforcement = null,
  tabs = null,
  name = 'wing',
} = {}) {
  const C = { ...DEFAULT_CLOTH, ...cloth };
  const fabric = [];
  const lines = [];
  const hardware = [];
  const missing = [];

  // ---- sail panels -------------------------------------------------------
  if (panels && panels.length) {
    const est = fabricEstimate(panels, { rollWidth, gap, nested });
    const upperArea = panels.filter((p) => p.surface === 'upper')
      .reduce((s, p) => s + panelArea(p), 0) * 2;
    const lowerArea = panels.filter((p) => p.surface === 'lower')
      .reduce((s, p) => s + panelArea(p), 0) * 2;

    fabric.push({
      item: 'Sail cloth',
      // The roll length is for one side; a wing needs both.
      rollMetres: est.linearMetres * 2,
      rollWidth,
      panelAreaM2: upperArea + lowerArea,
      utilisation: est.utilisation,
      // What is bought but not sewn.
      offcutM2: est.linearMetres * 2 * rollWidth - (upperArea + lowerArea),
      massKg: upperArea * C.upperSail + lowerArea * C.lowerSail,
      note: 'ordered by roll length; the offcut is bought either way',
    });
  } else missing.push('sail panels');

  // ---- ribs --------------------------------------------------------------
  if (ribHoles) {
    fabric.push({
      item: 'Rib cloth',
      panelAreaM2: ribHoles.ribAreaM2 - ribHoles.holeAreaM2,
      solidAreaM2: ribHoles.ribAreaM2,
      removedFraction: ribHoles.removedFraction,
      massKg: ribHoles.holedMassKg,
      note: `${(ribHoles.removedFraction * 100).toFixed(0)}% removed as lightening holes`,
    });
  } else if (wing) {
    missing.push('rib holes (rib area counted solid)');
  } else missing.push('ribs');

  // ---- diagonals ---------------------------------------------------------
  if (vribs && vribs.count) {
    const est = vribFabricEstimate(vribs, { rollWidth, gap });
    fabric.push({
      item: 'Diagonal cloth',
      rollMetres: est.linearMetres * 2,
      rollWidth,
      panelAreaM2: vribs.totalAreaM2 * 2,
      utilisation: est.utilisation,
      massKg: vribs.totalAreaM2 * 2 * C.diagonal,
      note: 'usually a lighter cloth than the sail, so ordered separately',
    });
  }

  // ---- lines -------------------------------------------------------------
  if (lineSelection) {
    const byType = {};
    const source = lineStretch ? lineStretch.lines : lineSelection.lines;
    for (const l of source) {
      if (!l.line) continue;
      const key = l.line.code;
      const cut = (l.cutLengthMM ?? l.lengthMM) / 1000;
      (byType[key] ||= { code: key, metres: 0, count: 0, diameterMM: l.line.diameterMM });
      byType[key].metres += cut * 2;
      byType[key].count += 2;
    }
    for (const t of Object.values(byType).sort((a, b) => b.metres - a.metres)) {
      lines.push({
        ...t,
        massG: t.metres * ((lineSelection.lines.find((l) => l.line && l.line.code === t.code)
          ?.line.gramsPerM) ?? 0),
        note: lineStretch ? 'cut length, including loop allowance' : 'finished length',
      });
    }
    if (!lineStretch) missing.push('loop allowance (line quoted at finished length)');
  } else missing.push('line selection');

  // ---- reinforcement -----------------------------------------------------
  if (reinforcement) {
    for (const r of reinforcement.items) {
      fabric.push({
        item: r.item,
        panelAreaM2: r.areaM2,
        lengthM: r.lengthM ?? null,
        count: r.count ?? null,
        massKg: r.massKg,
        note: r.why,
      });
    }
  } else missing.push('reinforcement (mylar, dacron, tapes)');

  // ---- attachment tabs ---------------------------------------------------
  if (tabs) {
    fabric.push({
      item: 'Attachment tabs',
      count: tabs.count,
      panelAreaM2: tabs.totalAreaM2,
      massKg: tabs.massKg,
      note: `${tabs.floorSized} at minimum width, ${tabs.loadSized} sized by load`,
    });
  } else missing.push('attachment tabs');

  // ---- hardware ----------------------------------------------------------
  if (linePlan) {
    hardware.push({ item: 'Riser maillons', count: riserCount * 2 });
    hardware.push({ item: 'Brake handles', count: brakeHandles });
    hardware.push({ item: 'Brake pulleys', count: 2 });
    hardware.push({ item: 'Main karabiner attachment loops', count: 2 });
  } else missing.push('line plan (hardware not counted)');

  const fabricMass = fabric.reduce((s, f) => s + (f.massKg || 0), 0);
  const lineMass = lines.reduce((s, l) => s + (l.massG || 0), 0) / 1000;

  return {
    name,
    fabric,
    lines,
    hardware,
    missing,
    totals: {
      fabricMassKg: fabricMass,
      lineMassKg: lineMass,
      lineMetres: lines.reduce((s, l) => s + l.metres, 0),
      rollMetres: fabric.reduce((s, f) => s + (f.rollMetres || 0), 0),
      // Cloth and line only. A finished wing also carries reinforcement,
      // rods, risers and tapes, which this does not attempt to count.
      clothAndLineKg: fabricMass + lineMass,
    },
    complete: missing.length === 0,
  };
}

/** The bill as text, in the shape a workshop order takes. */
export function bomText(bom) {
  const out = [`Bill of materials — ${bom.name}`, ''];

  out.push('FABRIC');
  for (const f of bom.fabric) {
    out.push(`  ${f.item}`);
    if (f.rollMetres) {
      out.push(`    ${f.rollMetres.toFixed(1)} m of ${f.rollWidth} m roll`
        + `  (${(f.utilisation * 100).toFixed(0)}% used)`);
    }
    out.push(`    ${f.panelAreaM2.toFixed(2)} m2 sewn, ${(f.massKg * 1000).toFixed(0)} g`);
    if (f.note) out.push(`    ${f.note}`);
  }

  out.push('', 'LINE');
  for (const l of bom.lines) {
    out.push(`  ${l.code.padEnd(12)} ${l.metres.toFixed(1).padStart(7)} m`
      + `  ${String(l.count).padStart(4)} pieces  ${l.diameterMM.toFixed(2)} mm`
      + `  ${l.massG.toFixed(0)} g`);
  }

  out.push('', 'HARDWARE');
  for (const h of bom.hardware) out.push(`  ${h.item.padEnd(34)} ${h.count}`);

  out.push('', 'TOTALS');
  out.push(`  cloth ${(bom.totals.fabricMassKg * 1000).toFixed(0)} g`
    + `  + line ${(bom.totals.lineMassKg * 1000).toFixed(0)} g`
    + `  = ${bom.totals.clothAndLineKg.toFixed(3)} kg`);
  out.push(`  roll to order: ${bom.totals.rollMetres.toFixed(1)} m`);

  if (bom.missing.length) {
    out.push('', 'NOT COUNTED');
    for (const m of bom.missing) out.push(`  ${m}`);
  }
  out.push('', 'Cloth and line only. Reinforcement, rods, risers, tapes and');
  out.push('thread are not counted, and a finished wing weighs appreciably more.');
  return out.join('\n');
}

function panelArea(p) {
  const pts = p.panel.left.concat(p.panel.right.slice().reverse());
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a / 2);
}

/* ------------------------------------------------- mass reconciliation -- */

/**
 * Published cloth weights, kg per square metre.
 *
 * Makers name their cloth, so the weight is knowable rather than assumed. The
 * defaults in `DEFAULT_CLOTH` are mid-range and too heavy for a light wing:
 * Dominico 10D is 27 g/m² against the 38 g/m² default, which is a 40%
 * overstatement on the single largest item in the bill.
 */
export const CLOTH_LIBRARY = {
  'Dominico 10D': 0.027,
  'Dominico TX-Light': 0.025,
  'Dominico 20D': 0.036,
  'Porcher Skytex 27': 0.027,
  'Porcher Skytex 27 hard': 0.030,
  'Porcher Skytex 32': 0.032,
  'Porcher Skytex 38': 0.038,
  'Porcher Skytex 40 hard': 0.040,
};

/**
 * Reconcile a modelled wing against a published weight, component by
 * component.
 *
 * The point is not the total but the **residual**: what the model cannot
 * account for, stated as a number rather than a disclaimer. A reconciliation
 * that closes to zero by adjusting its own assumptions has not learned
 * anything.
 */
export function massReconciliation({
  sailAreaM2, ribAreaM2, diagonalAreaM2,
  lineMassKg = 0, reinforcementKg = 0, rodsKg = 0, tabsKg = 0,
  riserKg = 0, threadKg = 0,
  // Every seam is folded, so the cut cloth is wider than the finished panel
  // by the allowance on each side. It is real cloth, it is bought and sewn,
  // and a bill built from panel areas leaves it out entirely.
  seamMetres = 0, seamAllowanceM = 0.010,
  cloth = {},
  publishedKg,
  name = 'wing',
}) {
  const C = {
    upperSail: cloth.upperSail ?? CLOTH_LIBRARY['Dominico 10D'],
    lowerSail: cloth.lowerSail ?? CLOTH_LIBRARY['Dominico 10D'],
    rib: cloth.rib ?? CLOTH_LIBRARY['Porcher Skytex 27 hard'],
    diagonal: cloth.diagonal ?? CLOTH_LIBRARY['Dominico 10D'],
  };

  const seamClothM2 = seamMetres * seamAllowanceM * 2;

  const items = [
    { item: 'Sail cloth', areaM2: sailAreaM2, massKg: sailAreaM2 * C.upperSail },
    {
      item: 'Seam allowance',
      areaM2: seamClothM2,
      massKg: seamClothM2 * C.upperSail,
      note: `${seamMetres.toFixed(0)} m of seam at ${(seamAllowanceM * 1000).toFixed(0)} mm each side`,
    },
    { item: 'Rib cloth', areaM2: ribAreaM2, massKg: ribAreaM2 * C.rib },
    { item: 'Diagonals', areaM2: diagonalAreaM2, massKg: diagonalAreaM2 * C.diagonal },
    { item: 'Lines', massKg: lineMassKg },
    { item: 'Reinforcement', massKg: reinforcementKg },
    { item: 'Rods', massKg: rodsKg },
    { item: 'Attachment tabs', massKg: tabsKg },
    { item: 'Risers', massKg: riserKg },
    { item: 'Thread', massKg: threadKg },
  ].filter((i) => i.massKg > 0);

  const accounted = items.reduce((s, i) => s + i.massKg, 0);
  const residual = publishedKg != null ? publishedKg - accounted : null;

  return {
    name,
    items: items.map((i) => ({
      ...i,
      shareOfPublished: publishedKg ? i.massKg / publishedKg : null,
    })),
    accountedKg: accounted,
    publishedKg,
    residualKg: residual,
    residualFraction: publishedKg ? residual / publishedKg : null,
    cloth: C,
    seamClothM2,
    // What the residual might be. Named rather than left as a number, because
    // a 34% gap invites the reader to assume the model is simply wrong.
    residualCandidates: [
      'cell-opening and crossport reinforcement beyond the simple layout',
      'riser hardware: maillons, pulleys, brake handles, line covers',
      'labels, sliders, stuff sack attachment points',
      'cloth heavier than the published grade after coating and finishing',
    ],
    // The largest item is the one an error in the cloth weight moves most, so
    // it is named: a 40% error on the sail is worth more than every small
    // item put together.
    largest: items.slice().sort((a, b) => b.massKg - a.massKg)[0],
  };
}

/**
 * Thread, estimated from the seams it has to close.
 *
 * A lockstitch consumes roughly two and a half times the seam length in
 * thread, and a wing is sewn along every panel edge, every rib, every
 * diagonal and every tab. It is a small item that is easy to leave out
 * entirely, and leaving it out is worse than estimating it.
 */
export function threadEstimate({
  panels = [], ribCount = 0, meanChordM = 2, diagonalCount = 0, tabCount = 0,
  threadGPerM = 0.09, consumption = 2.5, rowsOfStitching = 2,
}) {
  const seamOf = (poly) => {
    let s = 0;
    for (let i = 1; i < poly.length; i++) {
      s += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    }
    return s;
  };
  const panelSeams = panels.reduce(
    (s, p) => s + seamOf(p.panel.left) + seamOf(p.panel.right), 0,
  ) * 2;
  const ribSeams = ribCount * meanChordM * 2 * 2;   // both surfaces, both sides
  const diagonalSeams = diagonalCount * meanChordM * 0.25;
  const tabSeams = tabCount * 0.05;

  const seamM = panelSeams + ribSeams + diagonalSeams + tabSeams;
  const threadM = seamM * consumption * rowsOfStitching;
  return {
    seamMetres: seamM,
    threadMetres: threadM,
    massKg: (threadM * threadGPerM) / 1000,
    breakdown: {
      panelSeams, ribSeams, diagonalSeams, tabSeams,
    },
  };
}
