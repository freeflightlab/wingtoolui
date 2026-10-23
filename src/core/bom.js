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
import { lepStructureNesting, lepStructureWords } from './lepstructure.js';

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
  // The ribs laid out on their own roll: `{ rollMetres, rollWidth,
  // utilisation }` for the whole wing. Without it the rib cloth is given by
  // area only, and the total says the ribs are not in the roll to order.
  ribRoll = null,
  vribs = null,
  // An imported design's own internal structure (`lepStructure`): its full
  // diagonals, pieces between two ribs, straps and rod pockets, as its
  // program cuts them. Billed instead of `vribs`, which are this tool's
  // model of the diagonals at the places the design gives.
  structure = null,
  linePlan = null,
  lineSelection = null,
  lineStretch = null,
  cloth = {},
  rollWidth = 1.4,
  gap = 0.03,
  // The seam allowance the panels were handed over with, in millimetres: 0
  // when they are finished outlines. The sail is then weighed at its cut
  // size, and what is still not weighed is said accordingly.
  seamAllowanceMM = 0,
  // Said instead of "the N mm seam allowance" when the panels carry their
  // own: an imported design's, different at the sides, the front and the
  // trailing edge.
  seamAllowanceText = null,
  riserCount = 3,
  brakeHandles = 2,
  reinforcement = null,
  tabs = null,
  // Rods: `{ count, lengthM, massKg, byDiameter, note }` for the whole wing.
  // A design that states its rods without a diameter has a length and no
  // mass, and says so.
  rods = null,
  // Riser webbing: `{ count, lengthM }` for both sides.
  risers = null,
  // What the wing is set to weigh, to say how much of it this accounts for.
  wingMassKg = null,
  wingMassSource = null,
  // How much of the upper surface, by area, is cut from the leading-edge
  // cloth (`cloth.leadingEdge`).
  noseFraction = 0,
  // Things about the choices made that a reader of the bill should see.
  notes = [],
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
    // The panels are one half of the wing, so each is cut twice — except a
    // centre cell's, which is one piece spanning both halves and was being
    // counted as two.
    const copies = (p) => (p.centre ? 1 : 2);
    const upperArea = panels.filter((p) => p.surface === 'upper')
      .reduce((s, p) => s + panelArea(p) * copies(p), 0);
    const lowerArea = panels.filter((p) => p.surface === 'lower')
      .reduce((s, p) => s + panelArea(p) * copies(p), 0);

    // The nose of the upper surface in its own, harder cloth, when the
    // schedule gives one: `noseFraction` of the upper surface, by area.
    const noseArea = Number.isFinite(C.leadingEdge) && noseFraction > 0
      ? upperArea * Math.min(1, noseFraction) : 0;
    const distinct = new Set([C.upperSail, C.lowerSail, ...(noseArea ? [C.leadingEdge] : [])]);
    fabric.push({
      item: 'Sail cloth',
      // The roll length is for one side; a wing needs both.
      rollMetres: est.linearMetres * 2,
      rollWidth,
      panelAreaM2: upperArea + lowerArea,
      upperAreaM2: upperArea,
      lowerAreaM2: lowerArea,
      noseAreaM2: noseArea,
      utilisation: est.utilisation,
      // What is bought but not sewn.
      offcutM2: est.linearMetres * 2 * rollWidth - (upperArea + lowerArea),
      massKg: (upperArea - noseArea) * C.upperSail
        + (noseArea ? noseArea * C.leadingEdge : 0)
        + lowerArea * C.lowerSail,
      note: `upper ${upperArea.toFixed(2)} m2`
        + (noseArea
          ? `, of which ${noseArea.toFixed(2)} m2 at the nose in the leading-edge cloth`
          : '')
        + `; lower ${lowerArea.toFixed(2)} m2`
        + (seamAllowanceMM > 0
          ? ` — as cut, with ${seamAllowanceText ?? `the ${seamAllowanceMM} mm seam allowance`}.`
          : ' — finished size, with no seam allowance.')
        + ' Ordered by roll length; the offcut is bought either way.'
        // One layout, one roll. With more than one cloth that is not how it
        // is cut, and the bill should not pretend the length holds.
        + (distinct.size > 1
          ? ' Both surfaces are nested on one roll here: cut from different cloths, each needs '
            + 'its own layout, and the nose its own seam — the roll length is then only a guide.'
          : ''),
    });
  } else missing.push('sail panels');

  // ---- ribs --------------------------------------------------------------
  if (ribHoles) {
    fabric.push({
      item: 'Rib cloth',
      ...(ribRoll && ribRoll.rollMetres > 0
        ? { rollMetres: ribRoll.rollMetres, rollWidth: ribRoll.rollWidth ?? rollWidth, utilisation: ribRoll.utilisation }
        : {}),
      panelAreaM2: ribHoles.ribAreaM2 - ribHoles.holeAreaM2,
      solidAreaM2: ribHoles.ribAreaM2,
      removedFraction: ribHoles.removedFraction,
      massKg: ribHoles.holedMassKg,
      count: ribHoles.ribCount ?? null,
      note: ribHoles.holeAreaM2 > 0
        ? `${(ribHoles.removedFraction * 100).toFixed(0)}% of ${ribHoles.ribAreaM2.toFixed(2)} m2 `
          + `removed as openings${ribHoles.source ? ` (${ribHoles.source})` : ''}`
        : 'solid ribs, no openings',
    });
  } else {
    // Said as what it is. This read "rib holes (rib area counted solid)" when
    // only the holes were missing — and was printed when the ribs were not
    // in the bill at all.
    missing.push('ribs');
  }

  // ---- diagonals and the rest of the internal structure -------------------
  const inside = structure && structure.pieces && structure.pieces.length ? structure : null;
  if (inside) {
    const est = lepStructureNesting(inside.pieces, { rollWidth, gap });
    const copies = (p) => p.copies ?? 2;
    const area = inside.pieces.reduce((t, p) => t + p.cutAreaM2 * copies(p), 0);
    fabric.push({
      item: 'Internal structure cloth',
      rollMetres: est.linearMetres * 2,
      rollWidth,
      panelAreaM2: area,
      utilisation: est.utilisation,
      count: inside.pieces.reduce((t, p) => t + copies(p), 0),
      massKg: area * C.diagonal,
      note: `the design's own, as its program cuts them: ${lepStructureWords(inside.pieces)}; `
        + 'nested and ordered on their own, apart from the sail',
    });
    if (inside.miniRibs) {
      missing.push(`trailing-edge mini-ribs (${inside.miniRibs} a side in the design, not reproduced)`);
    }
  } else if (vribs && vribs.count) {
    const est = vribFabricEstimate(vribs, { rollWidth, gap });
    fabric.push({
      item: 'Diagonal cloth',
      rollMetres: est.linearMetres * 2,
      rollWidth,
      panelAreaM2: vribs.totalAreaM2 * 2,
      utilisation: est.utilisation,
      count: vribs.count * 2,
      massKg: vribs.totalAreaM2 * 2 * C.diagonal,
      note: 'nested and ordered on their own, apart from the sail',
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
      note: `${tabs.floorSized} at minimum width, ${tabs.loadSized} sized by load`
        + (tabs.cappedSized ? `, ${tabs.cappedSized} at the maximum width` : ''),
    });
  } else missing.push('attachment tabs');

  // ---- rods --------------------------------------------------------------
  const rodItems = [];
  if (rods && rods.count) {
    rodItems.push({
      item: 'Nylon rods',
      count: rods.count,
      lengthM: rods.lengthM,
      massKg: Number.isFinite(rods.massKg) ? rods.massKg : null,
      byDiameter: rods.byDiameter ?? null,
      note: rods.note ?? null,
    });
  }

  // ---- riser webbing -----------------------------------------------------
  const webbing = risers && risers.count
    ? { item: 'Riser webbing', count: risers.count, lengthM: risers.lengthM }
    : null;

  // ---- hardware ----------------------------------------------------------
  if (linePlan) {
    hardware.push({ item: 'Riser maillons', count: riserCount * 2 });
    hardware.push({ item: 'Brake handles', count: brakeHandles });
    hardware.push({ item: 'Brake pulleys', count: 2 });
    hardware.push({ item: 'Main karabiner attachment loops', count: 2 });
  } else missing.push('line plan (hardware not counted)');

  const fabricMass = fabric.reduce((s, f) => s + (f.massKg || 0), 0);
  const lineMass = lines.reduce((s, l) => s + (l.massG || 0), 0) / 1000;
  const rodMass = rodItems.reduce((s, r) => s + (r.massKg || 0), 0);
  const accounted = fabricMass + lineMass + rodMass;

  // What no part of this bill weighs, whatever was passed in. Named, so the
  // total is not read as the weight of a wing.
  const neverWeighed = [
    'riser webbing and its hardware (maillons, pulleys, handles)',
    'thread',
    // This said "seam allowances folded under" whatever it had been given,
    // under a sail that had been weighed with its allowance on.
    seamAllowanceMM > 0
      ? 'the seam allowance on ribs and diagonals (the sail is weighed as cut)'
      : 'seam allowances folded under',
    'labels and the stuff a wing is delivered with',
  ];
  if (rodItems.some((r) => r.massKg == null)) {
    neverWeighed.unshift('the rods (the design states their length, not their diameter)');
  }

  return {
    name,
    fabric,
    lines,
    rods: rodItems,
    webbing,
    hardware,
    missing,
    neverWeighed,
    totals: {
      fabricMassKg: fabricMass,
      lineMassKg: lineMass,
      rodMassKg: rodMass,
      lineMetres: lines.reduce((s, l) => s + l.metres, 0),
      rollMetres: fabric.reduce((s, f) => s + (f.rollMetres || 0), 0),
      // Kept under its old name: cloth of every kind, and line.
      clothAndLineKg: fabricMass + lineMass,
      accountedKg: accounted,
    },
    // Against what the wing is set to weigh.
    wingMassKg,
    wingMassSource,
    notes: notes.slice(),
    accountedFraction: wingMassKg > 0 ? accounted / wingMassKg : null,
    complete: missing.length === 0,
  };
}

/** The bill as text, in the shape a workshop order takes. */
export function bomText(bom) {
  const out = [`Bill of materials — ${bom.name}`, ''];
  const g = (kg) => `${(kg * 1000).toFixed(0)} g`;

  out.push('FABRIC');
  for (const f of bom.fabric) {
    out.push(`  ${f.item}`);
    if (f.rollMetres) {
      out.push(`    ${f.rollMetres.toFixed(1)} m of ${f.rollWidth} m roll`
        + `  (${(f.utilisation * 100).toFixed(0)}% used)`);
    }
    const what = [];
    if (f.count != null) what.push(`${f.count} pieces`);
    if (f.lengthM != null) what.push(`${f.lengthM.toFixed(1)} m`);
    if (f.panelAreaM2 != null) what.push(`${f.panelAreaM2.toFixed(2)} m2`);
    out.push(`    ${what.join(', ')}, ${g(f.massKg)}`);
    if (f.note) out.push(`    ${f.note}`);
  }

  out.push('', 'LINE');
  for (const l of bom.lines) {
    out.push(`  ${l.code.padEnd(12)} ${l.metres.toFixed(1).padStart(7)} m`
      + `  ${String(l.count).padStart(4)} pieces  ${l.diameterMM.toFixed(2)} mm`
      + `  ${l.massG.toFixed(0)} g`);
  }
  if (bom.lines.length) {
    out.push(`  ${bom.lines[0].note === 'finished length'
      ? 'finished lengths: no loop allowance'
      : 'lengths to cut, with the loops'}`);
  }

  if ((bom.rods && bom.rods.length) || bom.webbing) {
    out.push('', 'RODS AND WEBBING');
    for (const r of bom.rods ?? []) {
      out.push(`  ${r.item.padEnd(20)} ${String(r.count).padStart(4)} pieces  `
        + `${r.lengthM.toFixed(1).padStart(6)} m  ${r.massKg != null ? g(r.massKg) : 'mass not stated'}`);
      for (const [d, x] of Object.entries(r.byDiameter ?? {})) {
        out.push(`    ${Number(d).toFixed(1)} mm: ${x.count} pieces, ${x.lengthM.toFixed(1)} m, ${x.massG.toFixed(0)} g`);
      }
      if (r.note) out.push(`    ${r.note}`);
    }
    if (bom.webbing) {
      out.push(`  ${bom.webbing.item.padEnd(20)} ${String(bom.webbing.count).padStart(4)} pieces  `
        + `${bom.webbing.lengthM.toFixed(1).padStart(6)} m  not weighed`);
      // What the figure is of, since a riser set has more webbing in it
      // than this.
      out.push('    the straps from the karabiner to the lines; a speed system\'s own webbing is not in it');
    }
  }

  out.push('', 'HARDWARE');
  for (const h of bom.hardware) out.push(`  ${h.item.padEnd(34)} ${h.count}`);

  out.push('', 'TOTALS');
  out.push(`  cloth, film and tape ${g(bom.totals.fabricMassKg)}`
    + `  + line ${g(bom.totals.lineMassKg)}`
    + (bom.totals.rodMassKg > 0 ? `  + rods ${g(bom.totals.rodMassKg)}` : '')
    + `  = ${bom.totals.accountedKg.toFixed(3)} kg`);
  // What the roll length covers, said: the ribs were left out of it without
  // a word, a quarter of the cloth in the wing.
  const onRoll = bom.fabric.filter((f) => f.rollMetres);
  const offRoll = bom.fabric.filter((f) => !f.rollMetres && f.panelAreaM2 > 0.5);
  out.push(`  roll to order: ${bom.totals.rollMetres.toFixed(1)} m`
    + (onRoll.length ? ` (${onRoll.map((f) => `${f.item.toLowerCase()} ${f.rollMetres.toFixed(1)}`).join(', ')})` : '')
    + (offRoll.length
      ? `; not laid out on a roll: ${offRoll.map((f) => `${f.item.toLowerCase()}, ${(f.solidAreaM2 ?? f.panelAreaM2).toFixed(1)} m2`).join('; ')}`
      : ''));
  if (onRoll.length) {
    out.push('    as this tool lays the pieces out, with the gap asked for between them: a');
    out.push('    nest worked over by hand or by a production nester is tighter, and needs less');
  }
  if (bom.accountedFraction != null) {
    out.push(`  that is ${(bom.accountedFraction * 100).toFixed(0)}% of the `
      + `${bom.wingMassKg.toFixed(2)} kg the wing is set to weigh`
      + (bom.wingMassSource ? ` (${bom.wingMassSource})` : ''));
  }

  if (bom.notes && bom.notes.length) {
    out.push('', 'TO LOOK AT');
    for (const n of bom.notes) out.push(`  ${n}`);
  }
  if (bom.missing.length) {
    out.push('', 'NOT IN THIS BILL');
    for (const m of bom.missing) out.push(`  ${m}`);
  }
  out.push('', 'NOT WEIGHED');
  for (const m of bom.neverWeighed ?? []) out.push(`  ${m}`);
  out.push('', 'The total is what is listed above and no more: a finished wing');
  out.push('weighs more by everything under NOT WEIGHED.');
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
