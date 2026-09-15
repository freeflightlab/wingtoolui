/* app.js — UI layer. Owns the design state, renders the controls, redraws the
 * four viewports, and writes the export files. All geometry comes from the
 * core modules; nothing is recomputed here. */

/**
 * Published wings, offered as starting points.
 *
 * Embedded rather than read from data/reference, because the built tool is a
 * single file with no filesystem. Only the fields a design needs are carried;
 * the full tables stay in the repository for validation.
 */
const REFERENCE_LIB = [
  ['PHI Allegro light', 'XS', 20.40, 11.09, 6.03, 72, 2.29, 17.49],
  ['PHI Allegro light', 'ML', 25.02, 12.29, 6.03, 72, 2.54, 21.40],
  ['PHI Allegro light', 'XL', 28.62, 13.14, 6.03, 72, 2.72, 24.48],
  ['Ozone Geo 7', 'XS', 22.20, 10.69, 5.16, 48, 2.63, 18.70],
  ['Ozone Geo 7', 'MS', 25.80, 11.52, 5.16, 48, 2.84, 21.80],
  ['Ozone Geo 7', 'L', 29.00, 12.22, 5.16, 48, 3.01, 24.50],
  ['Ozone Ultralite 5', '13', 12.90, 7.70, 4.56, 34, 2.10, 11.40],
  ['Ozone Ultralite 5', '19', 18.90, 9.30, 4.56, 34, 2.54, 16.50],
  ['Ozone Ultralite 5', '25', 25.10, 10.70, 4.56, 34, 2.92, 21.90],
  ['Ozone Alpina 5', 'XS', 19.30, 10.82, 6.07, 65, 2.25, 16.40],
  ['Ozone Alpina 5', 'ML', 24.40, 12.16, 6.07, 65, 2.53, 20.70],
  ['Ozone Alpina 5', 'XL', 27.80, 13.00, 6.07, 65, 2.71, 23.70],
  ['Ozone Zeno 2', 'S', 21.00, 12.00, 6.90, 78, 2.19, 17.70],
  ['Ozone Zeno 2', 'L', 26.50, 13.50, 6.90, 78, 2.46, 22.20],
  ['BGD Lynx 2', 'XS', 19.50, 10.90, 6.20, 65, 2.20, 16.50],
  ['BGD Lynx 2', 'M', 23.00, 11.80, 6.20, 65, 2.40, 19.50],
  ['BGD Lynx 2', 'L', 27.00, 12.80, 6.20, 65, 2.60, 22.90],
  ['Skywalk SAGE', '75', 20.26, 11.34, 6.40, 68, 2.20, 17.29],
  ['Skywalk SAGE', '95', 22.70, 12.01, 6.40, 68, 2.33, 19.37],
  ['Skywalk SAGE', '115', 25.67, 12.77, 6.40, 68, 2.48, 21.90],
].map(([family, size, flatArea, flatSpan, flatAR, cells, maxChord, projectedArea]) => ({
  id: `${family} ${size}`,
  family, size, flatArea, flatSpan, flatAR, cells, maxChord, projectedArea,
  source: { flatArea, flatSpan, flatAR, cells, maxChord, projectedArea, name: size },
}));

const S = {
  name: 'gnu-01',
  // planform
  span: 10.25, rootChord: 2.60, tipChord: 0.90, tipSweep: 1.10,
  ellipticityLE: 0.85, ellipticityTE: 0.95,
  cells: 24, distribution: 'cosine',
  // operating environment
  altitudeM: 1000, deltaISA: 0, nCrit: 7,
  // section
  airfoilCode: '4415', airfoilCustom: null,
  reflex: 0.0, reflexStart: 65,
  intakeStart: 1.2, intakeEnd: 5.5,
  anchorA: 8.5, anchorB: 27.5, anchorC: 53.0, anchorD: 78.5,
  // arc and twist
  lobeType: 'circle', projectedRatio: 0.88, lobeARatio: 0.88, lobeBRatio: 0.45, bionic: 1.6,
  washinTotal: 4.5, washinMode: 'linear',
  zRotation: 'none',
  RL: 0.50, RP: 0.25,
  // balance
  pilotMass: 80, wingMass: 5.0, lineMass: 0.4, lineLength: 6.5, alphaDeg: 5.0,
  cz: 0.90, cx0a: 0.009, cm: -0.042, rho: 1.11, oswald: 0.90,
  cxPilot: 0.015, cxLines: 0.020, legacy: false,
  // panels
  ribIndex: 0, tab: 'wing', ribHoles: true, marks: true,
  reference: '', brakeLines: true, stabilo: true, paper: 'A4',
  lineRow: 'all', compareTo: '', dimensions: true, riserLayout: 'A/B/C+D', splitFrom: 62,
  rods: true, rodFrom: 12, rodTo: 18.5, rodDia: 1.5, rodReach: 100,
  useRodSpec: false,
  rodSpec: 'leading edge  12.0 18.5   7.0 15.0   1.5  0 25\n'
    + 'mid           23.5 29.5   63.0 70.0  1.1  0 25',
  famCount: 4, famSmallest: 20, famLargest: 29, famLoadLo: 70, famLoadHi: 115,
  lineBrand: 'all', lineStrength: 'kinked', maxLineTypes: 5, serviceHours: 200,
  clothLE: 'Porcher Skytex 27 hard', clothUpper: 'Porcher Skytex 32',
  clothLower: 'Porcher Skytex 32', clothRib: 'Porcher Skytex 40 hard',
  useCascadeSpec: false,
  cascadeSpec: 'A 30 14 3\nB 14  6 4\nC  8  3 2',
  ovalFromPressure: false, sailTension: 300,
  // Assumptions that were constants inside the core. Each is a design
  // decision rather than a fact, so each is the user's to make.
  karabinerSep: 42,        // cm between the karabiners
  loopAllowance: 130,      // mm of line consumed by the loops at each end
  cdCylinder: 1.1,         // drag coefficient of a line in cross-flow
  measureTension: 5,       // daN, the tension the PMA measures lengths at
  rowShareMode: 'convention',
  printMargin: 10, printOverlap: 15,
  showIntake: false, intakeLower: 9, intakeUpper: 1,
  packer: 'profile',
  vribs: true, vribRows: 'BC', vribSpread: 18, vribReach: 1,
  mergeRows: 'none',
  ovalAmount: 6.0, seamAllowance: 10, pointsPerSurface: 50,
  rollWidth: 1.40, panelGap: 3.0, applyOval: true,
};

let M = {}; // derived model, rebuilt on every change
let LEP = null; // imported LEparagliding document, kept as the export template
let XPOLAR = null; // imported XFOIL section polar, when there is one

/* ---------------------------------------------------------------- model -- */

/** Take the size from a published wing, leaving the shape alone. */
function applyReference() {
  if (!S.reference || S.reference === S._appliedReference) return;
  const entry = REFERENCE_LIB.find((e) => e.id === S.reference);
  if (!entry) return;
  const r = referenceDesignInputs(entry.source);
  if (!r) return;
  S._appliedReference = S.reference;
  S.span = r.inputs.span;
  S.rootChord = r.inputs.rootChord;
  S.tipChord = r.inputs.tipChord;
  S.tipSweep = r.inputs.tipSweep;
  S.cells = Math.max(8, Math.min(60, Math.round(r.cells / 2) * 2));
  S.projectedRatio = r.projectedRatio;
  S.name = S.reference.replace(/\s+/g, '-');
  S._referenceNote = `${S.reference}: ${entry.flatArea} m² published. Size only — `
    + `${r.derived.join(', ')} are defaults, not this wing's.`;
}

function rebuild() {
  applyReference();
  const t0 = performance.now();
  try {
    // An imported LEP design supplies its own discrete planform and per-rib
    // dihedral, washin and yaw. Those are used as given rather than re-derived
    // from the sliders — the file's wing is the wing.
    const imported = LEP && LEP.design;
    const planform = imported
      ? discretePlanform(imported.planformRows)
      : planformFromDesignInputs({
      span: S.span, rootChord: S.rootChord, tipChord: S.tipChord,
      tipSweep: S.tipSweep,
      ellipticityLE: S.ellipticityLE, ellipticityTE: S.ellipticityTE,
    });

    const lobeSpec = S.lobeType === 'circle'
      ? { type: 'circle', projectedRatio: S.projectedRatio }
      : S.lobeType === 'ellipse'
        ? { type: 'ellipse', aRatio: S.lobeARatio, bRatio: S.lobeBRatio }
        : { type: 'bionic', aRatio: S.lobeARatio, bRatio: S.lobeBRatio, exponent: S.bionic };

    const lobe = imported ? null : buildLobe(lobeSpec, planform.halfSpan);

    const atm = atmosphere(S.altitudeM, { deltaISA: S.deltaISA });

    let airfoil = S.airfoilCustom || naca4(S.airfoilCode);
    // Reflex turns the camber line back up near the trailing edge, trading a
    // little lift for a positive pitching moment. It is applied before
    // anything downstream so the ribs, panels and section theory all see the
    // same shape.
    if (S.reflex > 0) {
      airfoil = applyReflex(airfoil, { amount: S.reflex / 100, start: S.reflexStart / 100 });
    }
    airfoil.intake = { start: S.intakeStart / 100, end: S.intakeEnd / 100 };
    airfoil.anchors = {
      A: S.anchorA / 100, B: S.anchorB / 100,
      C: S.anchorC / 100, D: S.anchorD / 100,
    };

    const wing = buildWing({
      planform, lobe, airfoil,
      explicitRibs: imported ? imported.explicitRibs : null,
      cells: S.cells,
      RL: S.RL, RP: S.RP,
      washin: { total: S.washinTotal, mode: S.washinMode },
      pointsPerSurface: S.pointsPerSurface,
      distribution: S.distribution,
      zRotation: S.zRotation,
      alphaDeg: S.alphaDeg,
    });

    // Diagonal ribs carry the span that has no line on it. With attachments
    // on every second rib, that is half the wing.
    const vribs = S.vribs
      ? buildVRibs({
        wing, airfoil,
        anchorRibs: wing.ribs.map((_, i) => i).filter((i) => i % 2 === 0),
        rows: S.vribRows.split(''),
        baseSpread: S.vribSpread / 100,
        maxReach: S.vribReach,
      })
      : { vribs: [], count: 0, totalAreaM2: 0, unsupportedRibs: [] };

    // Worst flow misalignment across the span — how far the least well
    // presented rib is from lying in the glide path.
    const worstPhi = Math.max(...wing.ribs.map((r) => Math.abs(r.phiDeg)));

    const metrics = planformMetrics(planform);
    const lobeM = imported
      ? importedLobeMetrics(wing, planform.halfSpan)
      : lobeMetrics(lobe, planform.halfSpan);
    const projArea = projectedArea(wing);

    let panels = developWing(wing);
    if (S.applyOval) {
      panels = panels.map((p) => ({
        ...p,
        panel: applyOvalization(p.panel, {
          amount: S.ovalAmount / 100,
          transitions: DEFAULT_TRANSITIONS[p.surface],
          // Derived from the chordwise loading the tool already computes,
          // rather than a flat percentage. The rib spacing comes from the
          // panel itself.
          pressure: S.ovalFromPressure && M.pressure ? {
            loading: M.pressure.stations,
            tensionNPerM: S.sailTension,
            dynamicPressurePa: 0.5 * M.atm.density * (balanceSpeed(S) ** 2),
          } : null,
        }),
      }));
    }

    const balance = solveEquilibrium({
      area: metrics.area, span: S.span, chord: S.rootChord,
      lineLength: S.lineLength, pilotMass: S.pilotMass, wingMass: S.wingMass,
      rho: S.rho, oswald: S.oswald, cxPilot: S.cxPilot, cxLines: S.cxLines,
      alphaDeg: S.alphaDeg, cz: S.cz, cx0a: S.cx0a, cm: S.cm,
      legacySpreadsheet: S.legacy,
    });

    // Wing polar at the current atmospheric state. Uses an imported XFOIL
    // section polar when one is loaded, and says which in `polar.source`.
    const sectionSource = XPOLAR || null;
    const polar = wingPolar({
      planform, airfoil, atm, mass: S.pilotMass + S.wingMass + S.lineMass,
      area: metrics.area, chordRef: metrics.mac,
      twistAt: (y) => washinAt(y, planform.halfSpan,
        { total: S.washinTotal, mode: S.washinMode, planform }),
      cxLines: S.cxLines, cxPilot: S.cxPilot,
      alphaRange: [-2, 14], step: 1, sectionPolar: sectionSource,
    });
    const trim = polar.bestGlide || polar.points[polar.points.length - 1];
    const nd = nonDimensional({
      speed: trim ? trim.speed : 10, chord: metrics.mac, atm, span: S.span,
    });
    const thin = thinAirfoil(airfoil);
    const polarIssues = XPOLAR ? checkPolarMatch(XPOLAR, nd) : [];

    const anchors = canopyAnchors(wing, airfoil, { everyNthRib: 2 });
    const riserOrigin = [balance.calageMetres, 0, -S.lineLength];
    const cascade = buildCascade(anchors, riserOrigin, { mode: 1 });

    // The riser-based line plan, which is what the merge option and the load
    // model act on. The geometric cascade above stays for the front view,
    // since it is what the handbook's construction produces.
    const MERGES = {
      none: null,
      AB: [['A', 'B']],
      CD: [['C', 'D']],
      'AB+CD': [['A', 'B'], ['C', 'D']],
    };
    // The cascade a designer wrote, if they wrote one. Parsed before the
    // plan so its problems can be reported rather than thrown.
    //
    // Named `writtenCascade`: `cascade` in this scope is already the chapter
    // 8 weighted-centroid model, and shadowing it would have been a quiet
    // way to break the front view.
    const writtenCascade = S.useCascadeSpec ? parseCascadeSpec(S.cascadeSpec) : null;

    const linePlan = buildLinePlan({
      wing, airfoil, layout: RISER_LAYOUTS[S.riserLayout] || RISER_LAYOUTS['A/B/C+D'],
      everyNthRib: 2, lineLengthM: S.lineLength,
      mergeRows: MERGES[S.mergeRows] || null,
      brakes: S.brakeLines ? { anchors: 13, levelCounts: [6, 3, 1] } : null,
      karabinerSeparationM: S.karabinerSep / 100,
      // A written cascade overrides the rules, when the designer has one.
      ...(writtenCascade && writtenCascade.ok
        ? {
          anchorsPerRow: writtenCascade.anchorsPerRow,
          mainsPerRow: writtenCascade.mainsPerRow,
        }
        : {}),
    });
    // A split A riser: the outboard A anchors on their own riser, which is
    // what a pilot pulls for big ears. Applied after the cascade is built,
    // because the split is a riser change and not a different row.
    const layoutDef = RISER_LAYOUTS[S.riserLayout] || RISER_LAYOUTS['A/B/C+D'];
    // Nylon rods, which hold the nose open when the wing is not pressurised.
    // A rod works in bending, which is the one thing fabric cannot do.
    let rods = null;
    let rodClearance = null;
    let rodSpecResult = null;
    if (S.rods) {
      let groups;
      if (S.useRodSpec) {
        // A written spec, which is the only way to say that a
        // leading-edge rod wraps the nose: it needs an extent on each
        // surface, and four sliders cannot express two of anything.
        rodSpecResult = parseRodSpec(S.rodSpec, { ribCount: wing.ribs.length });
        groups = rodSpecResult.ok
          ? rodSpecResult.groups.flatMap((g) => noseRodGroup(g).parts)
          : [];
      } else {
        const lastRib = Math.max(0,
          Math.round((S.rodReach / 100) * (wing.ribs.length - 1)));
        groups = [rodGroup({
          name: 'LE', fromChord: S.rodFrom / 100, toChord: S.rodTo / 100,
          fromRib: 0, toRib: lastRib, diameterMM: S.rodDia,
        })];
      }
      rods = groups.length ? buildRodGroups({ wing, groups }) : null;
      rodClearance = rods ? checkRodClearance({
        rods: rods.rods,
        anchors: Object.values(airfoil.anchors ?? {}).map((x) => ({ chordFraction: x })),
      }) : null;
    }

    const riserSplit = applyRiserSplit(
      linePlan,
      layoutDef.map((r) => (r.splitTo ? { ...r, splitFrom: S.splitFrom / 100 } : r)),
      { halfSpanM: planform.halfSpan },
    );

    if (S.stabilo) addStabilo(linePlan, wing, { anchors: 2 });

    // Loads, which the rib-stress report and the Lines table both read.
    //
    // `M.loads` was referenced in three places and assigned in none, so both
    // of those features silently showed nothing. A field that is only ever
    // read is a feature that was never wired.
    let loads = null;
    let lineSelection = null;
    let lengths = null;
    try {
      loads = analyseLoads({
        plan: linePlan,
        planform,
        stations: wing.stations,
        totalMassKg: S.pilotMass + S.wingMass + S.lineMass,
        alphaDeg: S.alphaDeg,
        wingAreaM2: metrics.area,
        rowShareMode: S.rowShareMode,
        airfoil,
        anchors: airfoil.anchors,
      });
      // The line table the design is built from.
      //
      // `DEFAULT_LINE_TABLE` has 21 lines; the catalogue has 78 across four
      // brands, and it was in the repository and unreachable. A workshop buys
      // from one supplier, and the sizing should work from what is on the
      // shelf.
      let table;
      try {
        const cat = parseMaterialsTable(
          typeof LINE_MATERIALS_TSV === 'string' ? LINE_MATERIALS_TSV : '');
        table = S.lineBrand === 'all'
          ? cat
          : lineTableFor(cat, { brand: S.lineBrand });
      } catch (e) {
        table = undefined;              // fall back to the built-in table
      }
      lineSelection = selectLines(loads.tensions, {
        ...(table ? { table } : {}),
        strengthBasis: S.lineStrength,
      });
      lengths = lengthChain(lineSelection, {
        loopAllowanceMM: S.loopAllowance,
        measurementDaN: S.measureTension,
      });
    } catch (e) {
      loads = null;
    }

    // Nesting is the one expensive step — a few hundred milliseconds on a
    // big wing — so it is deferred rather than run on every slider frame.
    // The other three viewports stay live; the cutting layout catches up
    // once the input settles.

    // Worst-case development error tells you where the surface is fighting
    // the flat pattern — the number that decides whether a panel sews cleanly.
    let worstDev = 0;
    for (let i = 0; i < wing.ribs.length - 1; i++) {
      worstDev = Math.max(worstDev,
        developmentError(wing.ribs[i].upper, wing.ribs[i + 1].upper).worstRelative);
    }

    M = {
      planform, lobe, airfoil, wing, metrics, lobeM, projArea,
      panels, balance, cascade, anchors, worstDev, worstPhi, imported, vribs,
      linePlan, loads, lineSelection, lengths, riserSplit, rods, rodClearance,
      rodSpecResult,
      writtenCascade,
      atm, polar, trim, nd, thin, polarIssues,
      nested: M.nested, fabric: M.fabric, fabricError: M.fabricError,
      nestStale: true,
      error: null,
      ms: performance.now() - t0,
    };
    setStatus(null);
    scheduleNest();
  } catch (err) {
    M.error = err.message;
    setStatus(err.message);
    return;
  }
  draw();
}

/** Front-view metrics recovered from an imported wing, which has no lobe curve. */
function importedLobeMetrics(wing, halfSpan) {
  const tip = wing.ribs[wing.ribs.length - 1];
  const root = wing.ribs[0];
  return {
    projectedSpan: 2 * tip.lobePoint[0],
    arrow: root.lobePoint[1] - tip.lobePoint[1],
    tipDihedralDeg: tip.betaDeg,
    flatSpan: 2 * halfSpan,
    spanRatio: tip.lobePoint[0] / halfSpan,
  };
}

let nestTimer = null;
function scheduleNest() {
  clearTimeout(nestTimer);
  nestTimer = setTimeout(() => {
    try {
      const opts = { rollWidth: S.rollWidth, gap: S.panelGap / 100 };
      M.nested = nestPanels(M.panels, opts);
      M.fabric = fabricEstimate(M.panels, opts);
      M.fabricError = null;
    } catch (e) {
      M.nested = null; M.fabric = null; M.fabricError = e.message;
    }
    M.nestStale = false;
    drawCut();
  }, 180);
}

/* ------------------------------------------------------------- controls -- */

function slider(host, key, label, min, max, step, fmt = (v) => v.toFixed(2), unit = '') {
  const wrap = el('div', 'field');
  const lab = el('label', null, label);
  const out = el('output', null, fmt(S[key]) + unit);
  const inp = el('input');
  inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = S[key];
  inp.setAttribute('aria-label', label);
  inp.addEventListener('input', () => {
    S[key] = parseFloat(inp.value);
    out.textContent = fmt(S[key]) + unit;
    rebuild();
  });
  wrap.append(lab, out, inp);
  host.append(wrap);
  return inp;
}

function numberField(host, key, label, step = 0.01) {
  const wrap = el('div', 'field row');
  const lab = el('label', null, label);
  const inp = el('input');
  inp.type = 'number'; inp.step = step; inp.value = S[key];
  inp.setAttribute('aria-label', label);
  inp.addEventListener('change', () => { S[key] = parseFloat(inp.value); rebuild(); });
  wrap.append(lab, inp);
  host.append(wrap);
}

function selectField(host, key, label, options) {
  const wrap = el('div', 'field row');
  const lab = el('label', null, label);
  const sel = el('select');
  sel.setAttribute('aria-label', label);
  for (const [v, t] of options) {
    const o = el('option', null, t); o.value = v;
    if (S[key] === v) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => { S[key] = sel.value; rebuild(); buildControls(); });
  wrap.append(lab, sel);
  host.append(wrap);
}

function checkField(host, key, label) {
  const l = el('label', 'check');
  const inp = el('input'); inp.type = 'checkbox'; inp.checked = S[key];
  inp.addEventListener('change', () => { S[key] = inp.checked; rebuild(); });
  l.append(inp, document.createTextNode(label));
  host.append(l);
}

/**
 * A multi-line text setting, for things a designer writes rather than slides.
 *
 * A cascade is a shape, not a number. `A 30 14 3` says what four sliders
 * cannot, and it is how every manufacturer sheet reads.
 *
 * It commits on blur rather than on every keystroke, because rebuilding the
 * whole wing between two characters of a number makes the field unusable.
 */
function textAreaField(host, key, label, rows = 5, placeholder = '') {
  const l = el('label', 'field');
  l.append(el('span', 'lbl', label));
  const ta = el('textarea');
  ta.rows = rows;
  ta.value = S[key] ?? '';
  ta.placeholder = placeholder;
  ta.spellcheck = false;
  ta.addEventListener('change', () => {
    if (ta.value === S[key]) return;
    S[key] = ta.value;
    rebuild();
  });
  l.append(ta);
  host.append(l);
  return ta;
}

function button(host, text, fn, cls = 'btn') {
  const b = el('button', cls, text);
  b.addEventListener('click', fn);
  host.append(b);
  return b;
}

function hint(host, text) { host.append(el('div', 'hint', text)); }

function buildControls() {
  const P = clear('g-planform');
  if (REFERENCE_LIB.length) {
    selectField(P, 'reference', 'Start from a published wing',
      [['', '—']].concat(REFERENCE_LIB.map((e) => [e.id, `${e.id}  ${e.flatArea} m²`])));
    hint(P, 'Seven families of published sizes. Loads the size only: a specification '
      + 'does not say how elliptical the leading edge is, or what section the wing uses.');
  }
  checkField(P, 'dimensions', 'Dimensions on the drawings');
  slider(P, 'span', 'Flat span', 4, 16, 0.05, (v) => v.toFixed(2), ' m');
  slider(P, 'rootChord', 'Root chord', 0.8, 4, 0.01, (v) => v.toFixed(2), ' m');
  slider(P, 'tipChord', 'Tip chord', 0.1, 2.5, 0.01, (v) => v.toFixed(2), ' m');
  slider(P, 'tipSweep', 'Tip sweep back', 0, 3, 0.01, (v) => v.toFixed(2), ' m');
  slider(P, 'ellipticityLE', 'Leading edge — elliptical', 0, 1, 0.01, (v) => (v * 100).toFixed(0), '%');
  slider(P, 'ellipticityTE', 'Trailing edge — elliptical', 0, 1, 0.01, (v) => (v * 100).toFixed(0), '%');
  slider(P, 'cells', 'Cells per half wing', 4, 40, 1, (v) => v.toFixed(0));
  selectField(P, 'distribution', 'Rib spacing', [['cosine', 'Denser at tip'], ['uniform', 'Even']]);

  const A = clear('g-airfoil');
  selectField(A, 'airfoilCode', 'NACA 4-digit', [
    ['4415', 'NACA 4415'], ['4412', 'NACA 4412'],
    ['2414', 'NACA 2414'], ['4418', 'NACA 4418'], ['0012', 'NACA 0012'],
  ]);
  hint(A, 'Or load a coordinate file in Selig or plain "x y" format — the sections linked from the handbook work directly.');
  const imp = el('input'); imp.type = 'file'; imp.accept = '.dat,.txt,.csv';
  imp.style.fontSize = '10px'; imp.style.color = 'var(--text-dim)';
  imp.addEventListener('change', async () => {
    const f = imp.files[0]; if (!f) return;
    try {
      S.airfoilCustom = parseAirfoilText(await f.text(), f.name);
      setStatus(null); rebuild();
    } catch (e) { setStatus(`Could not read ${f.name}: ${e.message}`); }
  });
  A.append(imp);
  if (S.airfoilCustom) {
    button(A, 'Clear imported section', () => { S.airfoilCustom = null; rebuild(); buildControls(); });
  }
  slider(A, 'reflex', 'Reflex (TE rise)', 0, 3, 0.05, (v) => v.toFixed(2), '% c');
  slider(A, 'reflexStart', 'Reflex begins at', 40, 90, 1, (v) => v.toFixed(0), '% c');
  hint(A, 'Reflex raises the trailing edge of the camber line, trading lift for a positive pitching moment — the section stabilises its own angle of attack instead of tucking.');
  slider(A, 'intakeStart', 'Intake starts', 0, 8, 0.1, (v) => v.toFixed(1), '% c');
  slider(A, 'intakeEnd', 'Intake ends', 0.5, 15, 0.1, (v) => v.toFixed(1), '% c');
  slider(A, 'anchorA', 'Anchor A', 2, 20, 0.1, (v) => v.toFixed(1), '% c');
  slider(A, 'anchorB', 'Anchor B', 15, 45, 0.1, (v) => v.toFixed(1), '% c');
  slider(A, 'anchorC', 'Anchor C', 40, 70, 0.1, (v) => v.toFixed(1), '% c');
  slider(A, 'anchorD', 'Anchor D', 60, 95, 0.1, (v) => v.toFixed(1), '% c');

  const L = clear('g-lobe');
  selectField(L, 'lobeType', 'Arc shape', [
    ['circle', 'Circle'], ['ellipse', 'Ellipse'], ['bionic', 'Bionic'],
  ]);
  if (S.lobeType === 'circle') {
    slider(L, 'projectedRatio', 'Projected / flat span', 0.70, 0.99, 0.005, (v) => (v * 100).toFixed(1), '%');
  } else {
    // Both axes are fractions of the flat half span, so the arc keeps its
    // shape when the span changes. The arrow's lower bound is the point below
    // which the arc becomes too short to carry the span at all.
    const minB = Math.ceil(minArrowRatio(S.lobeARatio, S.lobeType, S.bionic) * 100) / 100;
    if (S.lobeBRatio < minB) S.lobeBRatio = minB;
    slider(L, 'lobeARatio', 'Arc width', 0.5, 1.0, 0.01, (v) => (v * 100).toFixed(0), '% of half span');
    slider(L, 'lobeBRatio', 'Arc arrow', minB, 1.2, 0.01, (v) => (v * 100).toFixed(0), '% of half span');
    if (S.lobeType === 'bionic') slider(L, 'bionic', 'Tip turn-up', 1, 3, 0.05);
    hint(L, `Arrow must stay above ${(minB * 100).toFixed(0)}% at this width, or the arc is too short to carry the flat span.`);
  }
  slider(L, 'washinTotal', 'Washin at tip', 0, 10, 0.1, (v) => v.toFixed(1), '°');
  selectField(L, 'washinMode', 'Washin distribution', [
    ['linear', 'With span'], ['quadratic', 'Quadratic'], ['chord', 'With chord'],
  ]);
  selectField(L, 'mergeRows', 'Merge line rows', [
    ['none', 'None'], ['AB', 'A and B'], ['CD', 'C and D'], ['AB+CD', 'A+B and C+D'],
  ]);
  hint(L, 'Two rows can share their cascade below the top lines. Fewer lines and less drag, at the cost of thicker merged lines.');
  selectField(L, 'zRotation', 'Align ribs to flow', [
    ['none', 'Off — ribs parallel'], ['auto', 'On — yaw onto glide path'],
  ]);
  hint(L, 'With the arc, outboard ribs tilt away from the airflow. Yawing each rib about the vertical brings its plane back onto the glide path (Laboratori d\u2019envol, 2021).');
  slider(L, 'RL', 'Reference line', 0.1, 0.9, 0.01, (v) => (v * 100).toFixed(0), '% c');
  slider(L, 'RP', 'Rotation point', 0.0, 0.9, 0.01, (v) => (v * 100).toFixed(0), '% c');
  hint(L, 'The reference line is the chord point laid along the arc; the rotation point is what washin turns about.');

  const E = clear('g-env');
  slider(E, 'altitudeM', 'Altitude', 0, 50000, 100, (v) => (v / 1000).toFixed(1), ' km');
  slider(E, 'deltaISA', 'Temperature offset', -40, 40, 1, (v) => (v > 0 ? '+' : '') + v.toFixed(0), ' K');
  hint(E, 'U.S. Standard Atmosphere 1976 (identical to ICAO and ISO 2533 to 32 km), valid to 86 km. Altitude is geometric; the geopotential conversion is applied internally.');
  const envHost = el('div'); envHost.id = 'envTable'; E.append(envHost);
  const flagHost = el('div'); flagHost.id = 'envFlags';
  flagHost.style.display = 'flex'; flagHost.style.flexDirection = 'column'; flagHost.style.gap = '5px';
  E.append(flagHost);

  const B = clear('g-balance');
  slider(B, 'pilotMass', 'Pilot + gear', 40, 140, 1, (v) => v.toFixed(0), ' kg');
  slider(B, 'wingMass', 'Wing mass', 1, 12, 0.1, (v) => v.toFixed(1), ' kg');
  slider(B, 'lineMass', 'Line mass', 0, 2, 0.05, (v) => v.toFixed(2), ' kg');
  slider(B, 'lineLength', 'Line length', 3, 9, 0.05, (v) => v.toFixed(2), ' m');
  slider(B, 'alphaDeg', 'Angle of attack', 0, 15, 0.1, (v) => v.toFixed(1), '°');
  numberField(B, 'cz', 'Cz at alpha', 0.01);
  numberField(B, 'cx0a', 'Cx0 wing', 0.001);
  numberField(B, 'cm', 'Cm', 0.001);
  numberField(B, 'rho', 'Air density', 0.01);
  numberField(B, 'oswald', 'Oswald e', 0.01);
  numberField(B, 'cxPilot', 'Cx pilot', 0.001);
  numberField(B, 'cxLines', 'Cx lines', 0.001);
  checkField(B, 'legacy', 'Match the 2012 example sheet');
  hint(B, 'The default applies the moment equation as published in 4.2. The checkbox drops the aerodynamic and wing-drag moments, which is what the handbook\u2019s own worked example does.');
  const balanceHost = el('div');
  balanceHost.id = 'balanceTable';
  B.append(balanceHost);

  // Lines and risers: what the cascade is made of.
  const LN = clear('g-lines');
  checkField(LN, 'brakeLines', 'Brake lines in the plan');
  checkField(LN, 'stabilo', 'Stabilo line');

  selectField(LN, 'riserLayout', 'Riser layout',
    Object.keys(RISER_LAYOUTS).map((k) => [k, k]));
  hint(LN, 'A split A riser carries the outboard A anchors on its own, so '
    + 'pulling it folds the tips for big ears while the centre keeps flying. '
    + 'Every Niviuk in the reference set is a split-A wing.');
  if ((RISER_LAYOUTS[S.riserLayout] || []).some((r) => r.splitTo)) {
    slider(LN, 'splitFrom', 'Split A from', 40, 90, 1,
      (v) => v.toFixed(0), '% half-span');
  }
  checkField(LN, 'useCascadeSpec', 'Write the cascade out, rather than deriving it');
  if (S.useCascadeSpec) {
    textAreaField(LN, 'cascadeSpec', 'Cascade', 6,
      'A 30 14 3\nB 14  6 4\nC  8  3 2');
    hint(LN, 'Row, then anchors, then the count at each level below — the way '
      + 'a manufacturer sheet reads. Lines starting # are comments.');
    if (M.writtenCascade && !M.writtenCascade.ok) {
      hint(LN, `Not used: ${M.writtenCascade.problems[0]}`);
    } else if (M.writtenCascade) {
      hint(LN, M.writtenCascade.note);
    }
  }
  numberField(LN, 'karabinerSep', 'Karabiner separation (cm)', 20, 70, 1);
  selectField(LN, 'compareTo', 'Compare against a real wing', [
    ['', 'none'],
    ...(typeof REFERENCE_TOTALS === 'object'
      ? Object.keys(REFERENCE_TOTALS).sort()
        .map((k) => [k, k.replace(/^niviuk-/, 'Niviuk ')])
      : []),
  ]);
  selectField(LN, 'lineRow', 'Line plan: highlight row', [
    ['all', 'all rows'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'],
    ['K', 'brakes'], ['S', 'stabilo'],
  ]);
  // Diff the design against a real wing.
  //
  // The measurements have been in data/reference/ and `comparePlans` has
  // existed since Phase 2, and until now nothing in the interface could reach
  // either. A comparison nobody can run is a comparison nobody trusts.
  // Internal structure: what is inside the wing.
  const IN = clear('g-internal');
  checkField(IN, 'ribHoles', 'Rib openings (lightening and cross-flow)');
  hint(IN, 'A rib has one set of openings, not two: the lightening holes are '
    + 'the cross-ports. On the test wing they pass 6 to 64 times the air the '
    + 'neighbouring cell needs.');
  checkField(IN, 'showIntake', 'Cell intake against stagnation travel');
  numberField(IN, 'intakeLower', 'Intake, lower cut (% chord)', 0, 30, 0.5);
  numberField(IN, 'intakeUpper', 'Intake, upper cut (% chord)', 0, 10, 0.5);
  hint(IN, 'The opening must contain the stagnation point across the whole '
    + 'speed range, which is why intakes are cut back along the lower '
    + 'surface rather than being a hole at the nose.');
  checkField(IN, 'rods', 'Nylon rods');
  if (S.rods) {
    checkField(IN, 'useRodSpec', 'Write the rods out, rather than one group');
  }
  if (S.rods && S.useRodSpec) {
    textAreaField(IN, 'rodSpec', 'Rods', 4,
      'name  upperFrom upperTo  lowerFrom lowerTo  dia  fromRib toRib');
    hint(IN, 'Name, then the upper extent, the lower extent, the diameter and '
      + 'the rib range — percentages of chord, the way LEP section 21 states '
      + 'them. A rod at the nose needs an extent on BOTH surfaces, or it '
      + 'hinges there rather than holding the radius. A dash means no rod on '
      + 'that surface.');
    if (M.rodSpecResult && !M.rodSpecResult.ok) {
      hint(IN, `Not used: ${M.rodSpecResult.problems[0]}`);
    } else if (M.rodSpecResult) {
      hint(IN, M.rodSpecResult.note);
    }
  }
  if (S.rods && !S.useRodSpec) {
    numberField(IN, 'rodFrom', 'Rod from (% chord)', 0, 40, 0.5);
    numberField(IN, 'rodTo', 'Rod to (% chord)', 0, 50, 0.5);
    selectField(IN, 'rodDia', 'Rod diameter (mm)',
      [['1.1', '1.1'], ['1.3', '1.3'], ['1.5', '1.5'], ['2', '2.0'], ['2.5', '2.5']]);
    slider(IN, 'rodReach', 'Rods out to', 20, 100, 5, (v) => v.toFixed(0), '% span');
  }
  checkField(IN, 'vribs', 'Diagonal ribs');
  if (S.vribs) {
    selectField(IN, 'vribRows', 'Diagonals on rows', [
      ['B', 'B'], ['C', 'C'], ['BC', 'B and C'],
    ]);
    slider(IN, 'vribSpread', 'Diagonal base width', 6, 40, 1, (v) => v.toFixed(0), '% c');
    slider(IN, 'vribReach', 'Diagonal reach', 1, 3, 1, (v) => `${v} cell${v > 1 ? 's' : ''}`);
  }

  // Panels and cutting.
  const N = clear('g-panels');
  checkField(N, 'ovalFromPressure', 'Billow from pressure, not a flat amount');
  selectField(N, 'paper', 'Printable pattern paper', [
    ['A4', 'A4 portrait'], ['A4L', 'A4 landscape'],
    ['A3', 'A3 portrait'], ['A3L', 'A3 landscape'],
  ]);
  selectField(N, 'packer', 'Nesting', [
    ['profile', 'Against panel outlines'], ['box', 'Against bounding boxes'],
  ]);
  hint(N, 'Packing against the outlines rather than the boxes saves about 4.5 m of roll on a 25 m² wing.');
  checkField(N, 'marks', 'Registration marks on panels');
  hint(N, 'Notches, grain arrows and panel labels. Notches pair at equal fractions of each seam, so the ease ovalization leaves is spread evenly.');
  checkField(N, 'applyOval', 'Add ovalization');
  slider(N, 'ovalAmount', 'Total widening', 0, 12, 0.1, (v) => v.toFixed(1), '%');
  slider(N, 'seamAllowance', 'Seam allowance', 0, 25, 1, (v) => v.toFixed(0), ' mm');
  slider(N, 'pointsPerSurface', 'Points per surface', 20, 120, 5, (v) => v.toFixed(0));
  slider(N, 'rollWidth', 'Fabric roll width', 0.8, 2.0, 0.01, (v) => v.toFixed(2), ' m');
  slider(N, 'panelGap', 'Gap between panels', 0, 10, 0.5, (v) => v.toFixed(1), ' cm');

  // Assumptions: values that were constants inside the model.
  // A size family from this design.
  const FM = clear('g-family');
  hint(FM, 'Scaling a design across a range has been in the model since '
    + 'Phase 2 with no way to ask for it. Set the range and press Size family '
    + 'under Files.');
  numberField(FM, 'famCount', 'Number of sizes', 2, 8, 1);
  numberField(FM, 'famSmallest', 'Smallest flat area (m2)', 8, 40, 0.5);
  numberField(FM, 'famLargest', 'Largest flat area (m2)', 8, 45, 0.5);
  numberField(FM, 'famLoadLo', 'All-up mass, smallest (kg)', 40, 200, 1);
  numberField(FM, 'famLoadHi', 'All-up mass, largest (kg)', 40, 250, 1);

  const AS = clear('g-assume');
  hint(AS, 'Each of these was a fixed constant in a core module. They are '
    + 'design decisions rather than facts, so each is yours to set — and each '
    + 'is checked to change the exported files, not just the screen.');
  // A wing is not made of one cloth. The nose takes a harder finish than the
  // rest of the upper surface, and the ribs a different weave again.
  const clothNames = Object.keys(CLOTH).map((k) => [k, k]);
  selectField(AS, 'clothLE', 'Leading edge cloth', clothNames);
  selectField(AS, 'clothUpper', 'Upper surface cloth', clothNames);
  selectField(AS, 'clothLower', 'Lower surface cloth', clothNames);
  selectField(AS, 'clothRib', 'Rib and diagonal cloth', clothNames);
  hint(AS, 'The nose must hold its shape unpressurised, so it takes a hard '
    + 'finish; the ribs work in tension across their depth rather than as a '
    + 'bulging membrane. A sail heavier than its ribs is the wrong way round '
    + 'and the tool will say so.');

  selectField(AS, 'lineBrand', 'Line materials from', (() => {
    try {
      const cat = parseMaterialsTable(
        typeof LINE_MATERIALS_TSV === 'string' ? LINE_MATERIALS_TSV : '');
      return [['all', `every brand (${cat.length})`],
        ...materialBrands(cat).map((b) => [b.name, `${b.name} (${b.count})`])];
    } catch { return [['all', 'every brand']]; }
  })());
  hint(AS, 'A workshop buys from one supplier. Restricting the table changes '
    + 'which line is chosen at every anchor, and so the drag, the mass and '
    + 'the bill of materials.');
  numberField(AS, 'maxLineTypes', 'Line types to stock at most', 1, 10, 1);
  hint(AS, 'A workshop cannot stock twenty diameters. Four types typically '
    + 'cost under half a per cent of drag against a different line at every '
    + 'anchor — press Line set & trim under Files to see the trade.');
  numberField(AS, 'serviceHours', 'Line set service life (hours)', 50, 400, 10);
  selectField(AS, 'lineStrength', 'Size lines on', [
    ['kinked', 'kinked strength (conservative)'],
    ['new', 'new strength'],
  ]);
  numberField(AS, 'loopAllowance', 'Loop allowance per line (mm)', 0, 300, 5);
  hint(AS, 'Material, not rounding: 130 mm over 88 lines is 11 m of cord.');
  numberField(AS, 'measureTension', 'Length measuring tension (daN)', 1, 15, 0.5);
  hint(AS, 'The PMA measures at 5 daN. That exceeds the 1 g load on every '
    + 'line, so a reference length is longer than a flying length.');
  selectField(AS, 'rowShareMode', 'Row load shares from', [
    ['convention', 'the handbook convention'],
    ['pressure', 'the section pressure distribution'],
  ]);
  numberField(AS, 'cdCylinder', 'Line drag coefficient', 0.8, 1.4, 0.05);
  numberField(AS, 'sailTension', 'Sail tension (N/m)', 50, 1500, 25);
  numberField(AS, 'printMargin', 'Printed pattern margin (mm)', 5, 25, 1);
  numberField(AS, 'printOverlap', 'Printed pattern overlap (mm)', 5, 40, 1);

  const F = clear('g-files');
  const grid = el('div', 'btn-grid');
  // One 'Panels DXF' button, not two.
  //
  // There were two with the same label: a plain one and the marks-aware one
  // below. The plain one came first and shadowed the other, so turning
  // registration marks on had no effect on the button most people would
  // press. Nothing caught it because no test had ever pressed a button.
  button(grid, 'Ribs DXF', () => save(`${S.name}-ribs.dxf`, ribsToDXF(M.wing)), 'btn');
  button(grid, 'Panels DXF', () => save(`${S.name}-panels.dxf`,
    S.marks
      ? markedPanelsToDXF(seamed(), {
        rollWidth: S.rollWidth, gap: S.panelGap / 100, packer: S.packer,
      })
      : panelsToDXF(seamed(), { rollWidth: S.rollWidth, gap: S.panelGap / 100 })), 'btn primary');
  button(grid, 'Printable pattern', () => {
    const t = tiledPages(seamed(), {
      paper: S.paper, rollWidth: S.rollWidth, gap: S.panelGap / 100,
      marginMM: S.printMargin, overlapMM: S.printOverlap,
    });
    // One file holding every page, so a builder prints once.
    const all = t.pages.map((p) => p.svg).join('\n<!-- page break -->\n');
    save(`${S.name}-pattern-${S.paper}.svg`, all);
    setStatus(`${t.pages.length} pages at ${S.paper}, `
      + `${t.blankPagesSkipped} blank tiles skipped. Check the 100 mm bar before cutting.`);
  }, 'btn');
  button(grid, 'Size family', () => {
    // Scaling a design across a size range has been possible since Phase 2 —
    // `buildFamily`, `buildSize` and `familyTable` — and there has never
    // been a way to ask for it. A designer draws one wing and needs four.
    try {
      const n = Math.max(2, Math.round(S.famCount));
      const sizes = [];
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const area = S.famSmallest + t * (S.famLargest - S.famSmallest);
        sizes.push({
          name: `${Math.round(area)}`,
          flatArea: area,
          // All-up mass scales with the size, which is what makes the line
          // sizing differ between them rather than just the geometry.
          allUpMassKg: S.famLoadLo + t * (S.famLoadHi - S.famLoadLo),
          wingMassKg: S.wingMass * (area / M.metrics.area),
          // Line HEIGHT, scaled with the wing — not the total line length.
          //
          // `lineLengthM` is the distance from the karabiner to the canopy,
          // and `lineLengthPerSpan` gives the *total* metres of cord. Feeding
          // one where the other belongs would have put 224 m where 6.5 m goes.
          //
          // Left null the family came out with NaN line length, NaN speed and
          // NaN glide, and 4 of 216 lines load-sized: a table that looked
          // like a table and told a designer nothing. Line height scales with
          // the linear dimension, so it goes as the square root of area.
          lineLengthM: S.lineLength * Math.sqrt(area / M.metrics.area),
        });
      }
      const fam = buildFamily(
        {
          span: S.span, rootChord: S.rootChord, tipChord: S.tipChord,
          tipSweep: S.tipSweep,
        },
        sizes,
        {
          airfoil: M.airfoil, cells: S.cells,
          pointsPerSurface: S.pointsPerSurface, rollWidth: S.rollWidth,
        },
      );
      save(`${S.name}-family.tsv`, familyTable(fam));
      setStatus(`${fam.sizes.length} sizes from `
        + `${S.famSmallest} to ${S.famLargest} m2.`);
    } catch (e) {
      setStatus(`Family: ${e.message}`);
    }
  }, 'btn');

  button(grid, 'Bill of materials', () => {
    // The BOM has existed since Phase 3 and has never been reachable from the
    // interface — a headline feature with no button.
    // The fabric schedule, so the bill uses the cloths actually chosen
    // rather than four hardcoded weights.
    const fab = fabricSchedule({
      leadingEdge: S.clothLE, upperSail: S.clothUpper,
      lowerSail: S.clothLower, rib: S.clothRib, diagonal: S.clothRib,
    });
    if (!fab.ok) { setStatus(`Fabric: ${fab.problems[0]}`); return; }

    const bom = buildBOM({
      cloth: clothWeightsFor(fab),
      panels: seamed(),
      nested: M.nested,
      wing: M.wing,
      ribHoles: M.ribHoles,
      // `linePlan` and `lineSelection`, not `plan` and `selection`.
      //
      // Passed under the wrong names these were silently dropped and the bill
      // of materials was built with no line data at all — it reported the
      // cloth and the hardware and quietly omitted every metre of line.
      // Found by `tools/check-options.mjs`, which exists because this is the
      // fourth time a silently-ignored argument has cost something.
      linePlan: M.linePlan,
      lineSelection: M.lineSelection,
      rollWidth: S.rollWidth,
      gap: S.panelGap / 100,
    });
    save(`${S.name}-bom.txt`, bomText(bom));
    setStatus(bom.missing && bom.missing.length
      ? `Bill written, incomplete: ${bom.missing.join(', ')}.`
      : 'Bill of materials written.');
  }, 'btn');

  button(grid, 'Rib stress report', () => {
    if (!M.loads) { setStatus('No loads to check.'); return; }
    const r = checkWingRibStress({
      wing: M.wing,
      anchorLoads: M.loads.anchorLoads,
      airfoil: M.airfoil,
      openingsFor: (rib, i) => {
        const nb = M.wing.ribs[Math.min(i + 1, M.wing.ribs.length - 1)];
        return nb === rib ? [] : ribOpenings(rib, nb, M.airfoil).holes;
      },
    });
    const lines = [
      `# Rib stress, ${S.name}`,
      `# ${r.note}`,
      '',
      ['rib', 'chord_m', 'longest_reach_mm', 'tape_to_seam', 'holes_in_path'].join('\t'),
    ];
    for (const x of r.ribs) {
      lines.push([
        x.ribIndex, M.wing.ribs[x.ribIndex].chord.toFixed(3),
        (x.longest.reach.reachM * 1000).toFixed(0),
        x.allReachSeam, x.throughHoles.join(' ') || '-',
      ].join('\t'));
    }
    // The provenance goes in the file. A designer reading "the seam is the
    // limit" is entitled to know that the cloth figures behind it are this
    // project's estimates rather than a supplier's datasheet.
    lines.splice(2, 0, `# cloth figures: ${r.ribs[0]?.clothSpec ? '' : ''}`
      + (typeof r.clothProvenance === 'string'
        ? r.clothProvenance
        : Object.entries(r.clothProvenance ?? {})
          .map(([k, v]) => `${k}: ${v}`).join('; ')));
    save(`${S.name}-rib-stress.tsv`, `${lines.join('\n')}\n`);
    setStatus(`${r.ribCount} ribs checked, `
      + `${r.ribsWithHolesInLoadPath.length} with a hole in a load path.`);
  }, 'btn');

  button(grid, 'Line set & trim', () => {
    // `optimiseLineSet` and the trim-drift model were both built, tested and
    // unreachable. A designer asking "how many line types should I stock"
    // and "will this cascade hold its trim" had no way to ask.
    if (!M.loads || !M.lengths) { setStatus('No loads to optimise.'); return; }
    try {
      const cat = parseMaterialsTable(
        typeof LINE_MATERIALS_TSV === 'string' ? LINE_MATERIALS_TSV : '');
      const table = S.lineBrand === 'all' ? cat : lineTableFor(cat, { brand: S.lineBrand });
      const opt = optimiseLineSet(M.loads.tensions, {
        table, maxTypes: S.maxLineTypes, strengthBasis: S.lineStrength,
      });

      const out = [`# Line set, ${S.name}`];
      if (!opt.ok) {
        out.push(`# ${opt.note}`);
      } else {
        out.push(`# ${opt.note}`);
        out.push('');
        out.push(['material', 'rated_daN', 'diameter_mm', 'lines'].join('\t'));
        for (const c of opt.chosen) {
          out.push([c.name, c.ratedDaN.toFixed(1), c.diameterMM, c.lines].join('\t'));
        }
      }

      // Trim drift: the fibres do not move the same way, and the difference
      // is what rotates the wing.
      const sched = trimSchedule({
        lines: M.lengths.lines, anchors: M.airfoil.anchors,
        chordM: S.rootChord, replaceHours: S.serviceHours,
      });
      out.push('');
      out.push('# trim drift');
      out.push(`# ${sched.note}`);
      const end = sched.atReplacement;
      out.push(`# trim moves ${end.alphaChangeDeg.toFixed(2)} degrees by `
        + `${S.serviceHours} hours; ${end.mixedFibres ? 'the cascade mixes '
          + 'fibres, so it drifts differentially' : 'one fibre throughout, so '
          + 'it drifts together'}`);
      out.push(`# rates are ${end.source}, not measured`);
      out.push('');
      out.push(['row', 'lines', 'mean_drift_mm', 'fibres'].join('\t'));
      for (const [row, r] of Object.entries(end.rowDrift)) {
        out.push([row, r.lines, r.meanDeltaMM.toFixed(1), r.fibres.join('+')].join('\t'));
      }

      save(`${S.name}-line-set.tsv`, `${out.join('\n')}\n`);
      setStatus(opt.ok
        ? `${opt.typeCount} line types, ${(opt.penalty * 100).toFixed(1)}% drag `
          + `penalty; trim moves ${end.alphaChangeDeg.toFixed(2)} deg by `
          + `${S.serviceHours} h.`
        : opt.note);
    } catch (e) {
      setStatus(`Line set: ${e.message}`);
    }
  }, 'btn');

  button(grid, 'Inspection check', () => {
    // `lineGeometryCheck` implements the PMA's own inspection: it searches
    // for the correction offset that brings the most lines inside tolerance
    // and flags what is left. It has been in the model since the inspection
    // work and there has never been a way to run it on a design.
    //
    // Validated against six sizes of a manufacturer's own inspection sheets,
    // which it passes with a correction offset of 2 mm at worst.
    if (!M.lengths || !M.lengths.lines.length) {
      setStatus('No line lengths to inspect.');
      return;
    }
    // `referenceLengthMM`, not `referenceMM`. The guessed name gave null on
    // every line and the check failed reading a property of null — which is
    // the button test earning its keep: nothing else would have noticed.
    const sized = M.lengths.lines.filter((l) => l.referenceLengthMM > 0);
    if (!sized.length) { setStatus('No sized lines to inspect.'); return; }
    const lines = sized.map((l) => ({
      name: l.name,
      referenceMM: l.referenceLengthMM,
      // A design has no built wing to measure, so it is checked against
      // itself: this says whether the plan is internally consistent, not
      // whether a built wing matches it.
      measuredMM: l.referenceLengthMM,
    }));
    const r = lineGeometryCheck(lines);
    const out = [
      `# Inspection check, ${S.name}`,
      '# PMA line geometry: the correction offset that brings the most lines',
      '#   inside tolerance, and what is left outside.',
      `# offset ${r.correctionOffsetMM} mm, limit ${r.offsetLimitMM.toFixed(0)} mm`,
      `# ${r.passes ? 'passes' : 'FAILS'}, `
      + `${r.outOfTolerance.length} line(s) out of tolerance`,
      '',
      ['line', 'reference_mm', 'measured_mm', 'delta_mm', 'within'].join('\t'),
    ];
    for (const row of r.rows) {
      out.push([row.name, row.referenceMM, row.measuredMM,
        row.deltaMM, row.within ? 'yes' : 'NO'].join('\t'));
    }
    save(`${S.name}-inspection.tsv`, `${out.join('\n')}\n`);
    setStatus(r.passes
      ? `Inspection passes, offset ${r.correctionOffsetMM} mm.`
      : `${r.outOfTolerance.length} lines out of tolerance.`);
  }, 'btn');

  button(grid, 'PMA data sheet', () => {
    if (!M.linePlan) { setStatus('No line plan to publish.'); return; }
    const rec = exchangeRecord({
      manufacturer: 'design tool', model: S.name, size: '',
      plan: M.linePlan, riserLengthMM: Math.round(S.lineLength * 1000 * 0.075),
    });
    save(`${S.name}-pma.tsv`, exchangeTSV(rec));
    if (!rec.complete) setStatus(`Data sheet written, incomplete: ${rec.missing.join(', ')}.`);
  }, 'btn');
  button(grid, 'Diagonals DXF', () => {
    if (!M.vribs || !M.vribs.count) { setStatus('No diagonal ribs to export.'); return; }
    save(`${S.name}-diagonals.dxf`, vribsToDXF(M.vribs, { rollWidth: S.rollWidth, gap: S.panelGap / 100 }));
  }, 'btn');
  button(grid, 'Panels SVG', () => save(`${S.name}-panels.svg`,
    panelsToSVG(seamed(), { rollWidth: S.rollWidth, gap: S.panelGap / 100 })), 'btn');
  button(grid, 'Line lengths', () => save(`${S.name}-lines.csv`, linesCSV()), 'btn');
  button(grid, 'Save project', () => save(`${S.name}.pgd.json`, JSON.stringify(S, null, 2)), 'btn');
  button(grid, 'Export LEP', () => {
    try {
      save('leparagliding.txt', designToLep({
        wing: M.wing, airfoil: M.airfoil, name: S.name,
        balance: M.balance, lineLengthM: S.lineLength,
        airfoilFile: `${(M.airfoil.name || 'airfoil').replace(/\s+/g, '')}.txt`,
      }, LEP ? LEP.doc : null));
    } catch (e) { setStatus(`Could not write LEP file: ${e.message}`); }
  }, 'btn primary');
  const lepIn = el('button', 'btn', 'Import LEP');
  const lepFile = el('input');
  lepFile.type = 'file'; lepFile.accept = '.txt'; lepFile.style.display = 'none';
  lepFile.addEventListener('change', async () => {
    const f = lepFile.files[0]; if (!f) return;
    try {
      const doc = parseLep(await f.text());
      const design = lepToDesign(doc);
      LEP = { doc, design, info: describeLep(doc) };
      S.name = design.name || S.name;
      document.getElementById('wingName').value = S.name;
      if (design.anchorFractions) {
        S.anchorA = design.anchorFractions.A * 100;
        S.anchorB = design.anchorFractions.B * 100;
        S.anchorC = design.anchorFractions.C * 100;
        S.anchorD = design.anchorFractions.D * 100;
      }
      if (design.intake) {
        S.intakeStart = design.intake.start * 100;
        S.intakeEnd = design.intake.end * 100;
      }
      if (design.aoa) S.lineLength = design.aoa.lineLengthCm / 100;
      buildControls();
      rebuild();
    } catch (e) { setStatus(`Could not read LEP file: ${e.message}`); }
  });
  lepIn.addEventListener('click', () => lepFile.click());
  grid.append(lepIn, lepFile);
  const load = el('button', 'btn', 'Open project');
  const fi = el('input'); fi.type = 'file'; fi.accept = '.json'; fi.style.display = 'none';
  fi.addEventListener('change', async () => {
    const f = fi.files[0]; if (!f) return;
    try {
      Object.assign(S, JSON.parse(await f.text()));
      document.getElementById('wingName').value = S.name;
      buildControls(); rebuild();
    } catch (e) { setStatus(`Could not open project: ${e.message}`); }
  });
  load.addEventListener('click', () => fi.click());
  grid.append(load, fi);
  F.append(grid);
  const xg = el('div', 'btn-grid');
  button(xg, 'XFOIL package', () => {
    const pkg = runPackage(M.airfoil, {
      reynolds: M.nd.reynolds, mach: M.nd.mach, nCrit: S.nCrit,
      alphaRange: [-4, 14], alphaStep: 0.5,
    });
    for (const f of pkg.files) save(f.name, f.content);
  }, 'btn');
  const polIn = el('button', 'btn', XPOLAR ? 'Replace polar' : 'Import polar');
  const polFile = el('input');
  polFile.type = 'file'; polFile.accept = '.dat,.txt,.pol'; polFile.style.display = 'none';
  polFile.addEventListener('change', async () => {
    const f = polFile.files[0]; if (!f) return;
    try { XPOLAR = parsePolar(await f.text()); buildControls(); rebuild(); }
    catch (e) { setStatus(`Could not read polar: ${e.message}`); }
  });
  polIn.addEventListener('click', () => polFile.click());
  xg.append(polIn, polFile);
  F.append(xg);
  if (XPOLAR) {
    hint(F, `Section polar from XFOIL: Re ${XPOLAR.reynolds ? XPOLAR.reynolds.toExponential(2) : '?'}, M ${XPOLAR.mach ?? '?'}, ${XPOLAR.points.length} points. The wing polar now uses measured section data.`);
    button(F, 'Drop XFOIL polar', () => { XPOLAR = null; buildControls(); rebuild(); });
  } else {
    hint(F, 'Export the section and a command file at the current Reynolds and Mach number, run XFOIL, then import the polar back. Until then the section model is thin-airfoil theory plus a friction correlation — good for comparing, not for predicting.');
  }
  hint(F, 'DXF is written as R12 with one layer per panel, the same convention the handbook\u2019s own subroutine uses.');
  if (LEP) {
    const i = LEP.info;
    const box = el('div', 'hint');
    box.innerHTML = `<b style="color:var(--aci-cyan)">Imported: ${i.name}</b><br>`
      + `${i.cells} cells · ${i.ribs} ribs · flat span ${i.flatSpan.toFixed(2)} m`
      + ` · projected ${i.projectedSpan.toFixed(2)} m<br>`
      + `sections carried through: ${i.sections.length}`;
    F.append(box);
    button(F, 'Return to parametric wing', () => { LEP = null; buildControls(); rebuild(); });
  } else {
    hint(F, 'Importing a leparagliding.txt takes over the planform and arc from the file. Sections this tool does not model are carried through untouched on export.');
  }
}

function seamed() {
  if (!S.seamAllowance) return M.panels;
  return M.panels.map((p) => ({ ...p, panel: { ...addSeamAllowance(p.panel, S.seamAllowance), seamLengths: p.panel.seamLengths } }));
}

/* --------------------------------------------------------------- render -- */

function draw() {
  drawReadout();
  if (S.tab === 'rib') { drawRib(); drawBalanceTable(); return; }
  if (S.tab === 'analysis') { drawPolar(); drawAtmosphere(); drawBalanceTable(); return; }
  if (S.tab === 'lines') { drawLinePlan(); drawCascadeTable(); return; }
  if (S.tab === 'structure') { drawDiagonals(); return; }
  drawPlan();
  drawFront();
  drawSection();
  drawCut();
  drawBalanceTable();
  drawEnvironment();
}

function drawEnvironment() {
  const host = document.getElementById('envTable');
  if (!host) return;
  const a = M.atm;
  const n = M.nd;
  const rows = [
    ['Temperature', `${a.temperature.toFixed(2)} K`],
    ['Pressure', `${a.pressure.toPrecision(5)} Pa`],
    ['Density', `${a.density.toExponential(4)} kg/m³`],
    ['Density ratio', `${(a.densityRatio * 100).toFixed(2)}% of SL`],
    ['Speed of sound', `${a.speedOfSound.toFixed(1)} m/s`],
    ['Viscosity μ', `${a.dynamicViscosity.toExponential(3)} Pa·s`],
    ['Mean free path', `${(a.meanFreePath * 1e9).toFixed(1)} nm`],
    ['Gravity', `${a.gravity.toFixed(4)} m/s²`],
    ['Reynolds', n.reynolds.toExponential(3), true],
    ['Mach', n.mach.toFixed(4), true],
    ['Knudsen', n.knudsen.toExponential(2), true],
    ['Dynamic pressure', `${n.dynamicPressure.toFixed(1)} Pa`],
    ['True airspeed', `${(n.trueAirspeed * 3.6).toFixed(1)} km/h`],
    ['Equivalent airspeed', `${(n.equivalentAirspeed * 3.6).toFixed(1)} km/h`],
  ];
  const t = el('table', 'tbl');
  for (const [k, v, em] of rows) {
    const tr = el('tr', em ? 'em' : null);
    tr.append(el('td', null, k), el('td', null, v));
    t.append(tr);
  }
  host.innerHTML = '';
  host.append(t);

  const fh = document.getElementById('envFlags');
  if (!fh) return;
  fh.innerHTML = '';
  const all = [...M.nd.flags, ...M.polarIssues];
  if (!all.length) {
    fh.append(el('div', 'flag ok', 'Continuum, incompressible and Reynolds assumptions all hold here.'));
  } else {
    for (const f of all) fh.append(el('div', `flag ${f.level}`, f.text));
  }
}

function drawPolar() {
  const pts = M.polar.points.filter((p) => p.CL > 0 && Number.isFinite(p.CD));
  const note = document.getElementById('note-polar');
  if (pts.length < 2) { canvas('vp-polar', [[0, 0], [1, 1]]); note.textContent = 'No polar'; return; }

  const data = pts.map((p) => [p.CD, p.CL]);
  const c = canvas('vp-polar', data.concat([[0, 0]]), 0.10, { chart: true });
  c.grid(0.02);
  c.path(data, '#35d6e8', 1.6);

  // Best-glide point: the tangent from the origin touches the polar there.
  const bg = M.polar.bestGlide;
  if (bg) {
    c.path([[0, 0], [bg.CD, bg.CL]], '#e8c547', 0.8, { dash: '4 3' });
    c.dot([bg.CD, bg.CL], '#e8c547', 3);
    c.text(`L/D ${bg.glideRatio.toFixed(1)}`, [bg.CD, bg.CL + 0.06], '#e8c547', 9);
  }
  if (M.polar.minSink) {
    const ms = M.polar.minSink;
    c.dot([ms.CD, ms.CL], '#5fd97a', 3);
    c.text('min sink', [ms.CD, ms.CL - 0.10], '#5fd97a', 8);
  }
  // Induced-drag component, to show how much of the drag is the wing's shape
  // and how much is everything else hanging below it.
  c.path(pts.map((p) => [p.CDi, p.CL]), '#e85bc4', 0.9, { dash: '3 3' });

  for (const p of pts) if (p.alphaDeg % 4 === 0) {
    c.dot([p.CD, p.CL], '#4e6270', 1.6);
    c.text(`${p.alphaDeg}°`, [p.CD + 0.004, p.CL - 0.02], '#4e6270', 7);
  }

  note.textContent = `${M.polar.source === 'xfoil' ? 'XFOIL section data' : 'estimated section'}`
    + `  ·  Cx total ${bg ? bg.CD.toFixed(4) : '—'}  ·  induced ${bg ? ((bg.CDi / bg.CD) * 100).toFixed(0) : '—'}%`
    + `  ·  e ${bg ? bg.oswald.toFixed(3) : '—'}  ·  magenta = induced only`;
}

function drawAtmosphere() {
  const top = Math.max(20000, S.altitudeM * 1.15);
  const prof = profile({ from: 0, to: top, steps: 60, deltaISA: S.deltaISA });
  // Density spans four decades over this range, so plot it logarithmically —
  // on a linear axis everything above 15 km is pinned to the axis.
  const pts = prof.map((p) => [Math.log10(Math.max(1e-8, p.density)), p.z / 1000]);
  const c = canvas('vp-atmos', pts, 0.10, { chart: true });
  c.grid(1);
  c.path(pts, '#5fd97a', 1.5);

  const here = [Math.log10(M.atm.density), S.altitudeM / 1000];
  c.dot(here, '#e8c547', 3.5);
  c.text(`${(S.altitudeM / 1000).toFixed(1)} km`, [here[0] + 0.08, here[1]], '#e8c547', 9);

  // Speed needed to hold the trim lift coefficient, as the air thins.
  const CL = M.trim ? M.trim.CL : 0.6;
  const mass = S.pilotMass + S.wingMass + S.lineMass;
  const vs = prof.map((p) => {
    const V = speedForLift({ mass, area: M.metrics.area, cl: CL, atm: p });
    return [Math.log10(Math.max(1e-8, p.density)), p.z / 1000, V / p.speedOfSound];
  });
  const sonic = vs.find((v) => v[2] >= 1);
  if (sonic) {
    c.path([[pts[0][0], sonic[1]], [pts[pts.length - 1][0], sonic[1]]], '#ff5e5e', 1, { dash: '5 4' });
    c.text('Mach 1 to stay up', [pts[pts.length - 1][0], sonic[1] + 0.6], '#ff5e5e', 8);
  }

  const decades = (Math.log10(prof[0].density) - Math.log10(prof[prof.length - 1].density)).toFixed(1);
  document.getElementById('note-atmos').textContent =
    `density, log scale — ${decades} decades over ${(top / 1000).toFixed(0)} km`
    + `  ·  here ${(M.atm.densityRatio * 100).toFixed(2)}% of sea level`
    + `  ·  V for trim CL ${(speedForLift({ mass, area: M.metrics.area, cl: CL, atm: M.atm }) * 3.6).toFixed(0)} km/h`;
}

function drawReadout() {
  const r = document.getElementById('readout');
  r.innerHTML = '';
  const m = M.metrics, b = M.balance;
  const items = [
    ['flat area', m.area.toFixed(2) + ' m²'],
    ['proj area', M.projArea.toFixed(2) + ' m²'],
    ['flat AR', m.aspectRatio.toFixed(2)],
    ['proj AR', ((M.lobeM.projectedSpan ** 2) / M.projArea).toFixed(2)],
    ['proj span', M.lobeM.projectedSpan.toFixed(2) + ' m'],
    ['cells', String(S.cells * 2)],
    ['speed', b.speedKMH.toFixed(1) + ' km/h', 'hot'],
    ['glide', b.glideRatio.toFixed(2), 'hot'],
    ['calage', (b.calageFraction * 100).toFixed(1) + '% c', 'hot'],
    ['wing load', (M.balance.totalMass / M.projArea).toFixed(2) + ' kg/m²'],
    ['worst φ', M.worstPhi.toFixed(1) + '°', M.worstPhi > 6 ? 'warn' : undefined],
    ['lines', M.linePlan ? String(M.linePlan.lines.length * 2) : '0'],
    ['line length', M.linePlan ? M.linePlan.totalLengthM.toFixed(0) + ' m' : '-'],
    ['diagonals', M.vribs ? String(M.vribs.count) : '0',
      M.vribs && M.vribs.unsupportedRibs.length ? 'warn' : undefined],
    ['altitude', (S.altitudeM / 1000).toFixed(1) + ' km'],
    ['ρ', M.atm.density.toExponential(2) + ' kg/m³'],
    ['Re', M.nd.reynolds.toExponential(2), M.nd.reynolds < 2e5 ? 'warn' : undefined],
    ['Mach', M.nd.mach.toFixed(3), M.nd.mach > 0.3 ? 'warn' : undefined],
    ['L/D est', M.polar.bestGlide ? M.polar.bestGlide.glideRatio.toFixed(2) : '—', 'hot'],
  ];
  for (const [k, v, cls] of items) {
    const s = el('div', 'stat');
    s.append(el('span', 'k', k), el('span', 'v' + (cls ? ' ' + cls : ''), v));
    r.append(s);
  }
}

/** Minimal SVG helper: builds a fitted viewBox and returns draw primitives. */
/**
 * A fitted drawing surface for one viewport.
 *
 * Drawing straight into pixel coordinates taken from getBoundingClientRect
 * has three failure modes, and all three were visible: the rect is zero
 * before first layout and stale after a panel opens or the window changes,
 * so content lands at the wrong scale; the fit is computed from geometry
 * alone, so labels, dot radii and stroke widths hang outside the frame; and
 * a very wide drawing such as the nested cutting layout, near 27:1, fits to
 * width and collapses to a hairline.
 *
 * The fix is to draw into a nominal coordinate space with an explicit
 * viewBox, then measure what was actually drawn and set the viewBox to that.
 * The browser then guarantees the fit, and it accounts for everything —
 * including text, which no geometric bound can predict.
 */
/**
 * Per-viewport user view state, so a pan or zoom survives a redraw.
 * Empty until the user actually interacts; the default is always the fit.
 */
const VIEW_STATE = {};

function canvas(id, pts, pad = 0.10, opts = {}) {
  const svg = document.getElementById(id);
  svg.innerHTML = '';

  // Nominal drawing space. The real element size only decides the aspect
  // ratio to aim for; the viewBox does the fitting, so a stale or zero rect
  // can no longer put content off-screen.
  const rect = svg.getBoundingClientRect();
  const W = Math.max(160, Math.round(rect.width) || 520);
  const H = Math.max(120, Math.round(rect.height) || 360);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
  const dx = (maxX - minX) || 1, dy = (maxY - minY) || 1;

  // A wing drawing and a chart want opposite things from the frame.
  //
  // Plan, front, section and rib views are geometry: their axes are both
  // metres, so the scale must be the same in x and y or the wing is drawn
  // wrong. A polar is not geometry — its axes are km/h and m/s, and there is
  // no meaningful aspect ratio between them. Forcing one scale on both made
  // the polar a narrow sliver down the middle of a wide frame, correctly
  // fitted and useless.
  //
  // So charts get independent scales and fill the frame.
  const chart = !!opts.chart;
  const f = fitScales({ minX, maxX, minY, maxY }, { width: W, height: H }, { chart, pad });
  const { sx, sy, ox, oy } = f;
  const scale = sx;

  const X = (x) => ox + x * sx;
  const Y = (y) => oy - y * sy;

  const add = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    svg.append(n);
    return n;
  };

  return {
    svg, W, H, scale, X, Y, add,

    /**
     * Re-fit the viewBox to what was actually drawn.
     *
     * Called at the end of every draw, so the frame contains the geometry
     * *and* its annotations rather than just the geometry. getBBox is the
     * only thing that knows how wide a text label rendered, so the fit has
     * to happen after drawing, not before.
     */
    fit(padPx = 10) {
      if (typeof svg.getBBox !== 'function') return;   // headless
      let b;
      try { b = svg.getBBox(); } catch { return; }
      if (!b || !isFinite(b.width) || b.width <= 0 || b.height <= 0) return;
      const fitted = [b.x - padPx, b.y - padPx, b.width + padPx * 2, b.height + padPx * 2];
      svg.dataset.fitted = fitted.join(' ');
      // A user who has panned or zoomed has said what they want to look at;
      // a redraw must not throw that away. The fitted box is kept so a reset
      // can return to it.
      const st = VIEW_STATE[id];
      svg.setAttribute('viewBox', (st && st.viewBox) ? st.viewBox : fitted.join(' '));
    },
    /** Charts fill the frame, so they must not letterbox either. */
    chartMode: chart,
    path(points, stroke, width = 1, opts = {}) {
      if (!points.length) return;
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(2)} ${Y(p[1]).toFixed(2)}`).join('');
      add('path', {
        d: d + (opts.close ? 'Z' : ''),
        fill: opts.fill || 'none',
        stroke, 'stroke-width': width,
        'stroke-opacity': opts.opacity ?? 1,
        'stroke-dasharray': opts.dash || '',
        'stroke-linejoin': 'round',
        // The viewBox rescales everything after the fit, so stroke widths
        // would otherwise thin out on wide drawings and thicken on small
        // ones. This keeps every line at the width it was asked for.
        'vector-effect': 'non-scaling-stroke',
      });
    },
    dot(p, color, r = 2) { add('circle', { cx: X(p[0]), cy: Y(p[1]), r, fill: color }); },
    text(str, p, color, size = 9, anchor = 'start') {
      const t = add('text', {
        x: X(p[0]), y: Y(p[1]), fill: color, 'font-size': size,
        'font-family': 'ui-monospace, monospace', 'text-anchor': anchor,
      });
      t.textContent = str;
    },
    /**
     * A dimension: a line with ticks at each end and the measurement on it.
     *
     * A plan view without dimensions is a picture, not a drawing. A designer
     * reading one wants the span and the chords off the page rather than out
     * of a settings panel, and a reviewer wants to check the drawing agrees
     * with the numbers beside it.
     *
     * Drawn in model coordinates so it scales and rotates with the geometry,
     * with the tick length in pixels so it stays legible at any zoom.
     */
    dim(a, b, label, {
      color = '#8a9aa6', size = 9, tickPx = 4, offsetPx = 0,
    } = {}) {
      const [ax, ay] = [X(a[0]), Y(a[1])];
      const [bx, by] = [X(b[0]), Y(b[1])];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (!(len > 1e-9)) return;
      // Unit vector along the dimension, and its normal for ticks and offset.
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const ox = nx * offsetPx;
      const oy = ny * offsetPx;

      add('line', {
        x1: ax + ox, y1: ay + oy, x2: bx + ox, y2: by + oy,
        stroke: color, 'stroke-width': 0.8, opacity: 0.85,
      });
      for (const [px, py] of [[ax + ox, ay + oy], [bx + ox, by + oy]]) {
        add('line', {
          x1: px - nx * tickPx, y1: py - ny * tickPx,
          x2: px + nx * tickPx, y2: py + ny * tickPx,
          stroke: color, 'stroke-width': 0.8, opacity: 0.85,
        });
      }

      // The label sits clear of the line, on whichever side the offset went,
      // and reads the right way up rather than upside down on a return leg.
      const mx = (ax + bx) / 2 + ox;
      const my = (ay + by) / 2 + oy;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (deg > 90 || deg < -90) deg += 180;
      const t = add('text', {
        x: mx, y: my - 3, fill: color, 'font-size': size,
        'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle',
        transform: `rotate(${deg.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)})`,
      });
      t.textContent = label;
    },
    grid(step) {
      const gx0 = Math.floor(minX / step) * step, gx1 = Math.ceil(maxX / step) * step;
      const gy0 = Math.floor(minY / step) * step, gy1 = Math.ceil(maxY / step) * step;
      for (let x = gx0; x <= gx1 + 1e-9; x += step) {
        add('line', { x1: X(x), y1: Y(gy0), x2: X(x), y2: Y(gy1),
          stroke: Math.abs(x) < 1e-9 ? '#2c3d47' : '#1a252c', 'stroke-width': 1 });
      }
      for (let y = gy0; y <= gy1 + 1e-9; y += step) {
        add('line', { x1: X(gx0), y1: Y(y), x2: X(gx1), y2: Y(y),
          stroke: Math.abs(y) < 1e-9 ? '#2c3d47' : '#1a252c', 'stroke-width': 1 });
      }
    },
  };
}

function drawPlan() {
  const outline = planformOutline(M.planform, 140).map(([y, x]) => [y, -x]);
  const c = canvas('vp-plan', outline);
  c.grid(1);
  c.path(outline, '#35d6e8', 1.4, { close: true });

  // Ribs, both halves.
  for (const rib of M.wing.ribs) {
    const y = rib.station;
    for (const sgn of [1, -1]) {
      c.path([[sgn * y, -rib.xLE], [sgn * y, -(rib.xLE + rib.chord)]], '#e8c547', 0.7, { opacity: 0.55 });
    }
  }
  // Reference line — the line that gets bent into the arc.
  const ref = [];
  for (let i = -60; i <= 60; i++) {
    const y = (i / 60) * M.planform.halfSpan;
    ref.push([y, -(M.planform.xLE(y) + S.RL * M.planform.chord(y))]);
  }
  c.path(ref, '#e85bc4', 1.1, { dash: '4 3' });

  // Dimensions, so the drawing can be read rather than only looked at.
  //
  // In this view y is spanwise and x is -chordwise, so a span dimension runs
  // horizontally and a chord one vertically. They are placed clear of the
  // outline, which is why the fit() below happens after them.
  if (S.dimensions) {
    const hs = M.planform.halfSpan;
    const root = M.planform.chord(0);
    const tip = M.planform.chord(hs);
    const aft = -(M.planform.xLE(hs) + tip);

    // Span, below the trailing edge.
    c.dim([-hs, aft], [hs, aft], `${(hs * 2).toFixed(2)} m span`,
      { offsetPx: 22 });
    // Root chord, on the centreline.
    c.dim([0, -M.planform.xLE(0)], [0, -root], `${root.toFixed(2)} m root`,
      { offsetPx: -18 });
    // Tip chord.
    c.dim([hs, -M.planform.xLE(hs)], [hs, aft], `${tip.toFixed(2)} m tip`,
      { offsetPx: -14 });
    // Tip sweep: how far the tip's leading edge sits behind the centre's.
    const sweep = M.planform.xLE(hs) - M.planform.xLE(0);
    if (sweep > 0.01) {
      c.dim([hs, -M.planform.xLE(0)], [hs, -M.planform.xLE(hs)],
        `${sweep.toFixed(2)} m sweep`, { offsetPx: 14, color: '#e85bc4' });
    }
  }

  c.fit();
  document.getElementById('note-plan').textContent =
    `${M.metrics.area.toFixed(2)} m²  ·  AR ${M.metrics.aspectRatio.toFixed(2)}  ·  MAC ${M.metrics.mac.toFixed(2)} m  ·  1 m grid`;
}

function drawFront() {
  const half = [];
  if (M.lobe) {
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const s = (i / N) * M.planform.halfSpan;
      const p = M.lobe.at(s);
      half.push([p.y, p.z]);
    }
  } else {
    // An imported wing has no analytic arc — its reference points are the arc.
    for (const r of M.wing.ribs) half.push([r.lobePoint[0], r.lobePoint[1]]);
  }
  const full = half.slice().reverse().map(([y, z]) => [-y, z]).concat(half);
  const c = canvas('vp-front', full.concat([[0, -S.lineLength]]));
  c.grid(1);

  // Rib sections seen from the front: draw each rib's projected extent.
  for (const rib of M.wing.ribs) {
    const proj = rib.upper.map(([, y, z]) => [y, z]);
    const projL = proj.map(([y, z]) => [-y, z]);
    c.path(proj, '#35d6e8', 0.6, { opacity: 0.35 });
    c.path(projL, '#35d6e8', 0.6, { opacity: 0.35 });
    const projLo = rib.lower.map(([, y, z]) => [y, z]);
    c.path(projLo, '#5fd97a', 0.6, { opacity: 0.3 });
    c.path(projLo.map(([y, z]) => [-y, z]), '#5fd97a', 0.6, { opacity: 0.3 });
  }

  c.path(full, '#e85bc4', 1.6);

  // Line cascade, projected onto the front view.
  for (const seg of M.cascade.segments) {
    const a = [seg.from[1], seg.from[2]];
    const b = [seg.to[1], seg.to[2]];
    c.path([a, b], '#6e8bff', 0.5, { opacity: 0.5 });
    c.path([[-a[0], a[1]], [-b[0], b[1]]], '#6e8bff', 0.5, { opacity: 0.5 });
  }
  c.dot([0, -S.lineLength], '#ff5e5e', 3);

  c.fit();
  const tipRib = M.wing.ribs[M.wing.ribs.length - 1];
  document.getElementById('note-front').textContent =
    `proj span ${M.lobeM.projectedSpan.toFixed(2)} m  ·  arrow ${M.lobeM.arrow.toFixed(2)} m`
    + `  ·  tip dihedral ${M.lobeM.tipDihedralDeg.toFixed(1)}°  ·  tip φ ${tipRib.phiDeg.toFixed(1)}° χ ${tipRib.chiDeg.toFixed(1)}°`;
}

function drawSection() {
  const b = M.balance;
  const chord = S.rootChord;
  const theta = -(b.thetaDeg * Math.PI) / 180;
  const rot = ([x, y]) => [x * Math.cos(theta) - y * Math.sin(theta), x * Math.sin(theta) + y * Math.cos(theta)];

  const af = M.airfoil.points.map(([x, y]) => rot([x * chord, y * chord]));
  const pilot = rot([b.calageMetres, 0]);
  const pilotPt = [pilot[0], pilot[1] - S.lineLength];

  const c = canvas('vp-section', af.concat([pilotPt, [0, 0]]));
  c.grid(0.5);

  // Chord line and the section itself.
  c.path([rot([0, 0]), rot([chord, 0])], '#4e6270', 0.8, { dash: '5 4' });
  c.path(af, '#35d6e8', 1.5, { close: true });

  // Intake, drawn on the lower surface where it actually sits.
  const { lower } = splitSurfaces(M.airfoil);
  const intake = lower
    .filter((p) => p[0] >= M.airfoil.intake.start && p[0] <= M.airfoil.intake.end)
    .map(([x, y]) => rot([x * chord, y * chord]));
  if (intake.length > 1) c.path(intake, '#ff5e5e', 2.4);

  // Anchor points.
  for (const [row, frac] of Object.entries(M.airfoil.anchors)) {
    const near = lower.reduce((best, p) => Math.abs(p[0] - frac) < Math.abs(best[0] - frac) ? p : best, lower[0]);
    const q = rot([near[0] * chord, near[1] * chord]);
    c.dot(q, '#6e8bff', 2.2);
    c.text(row, [q[0], q[1] - 0.06], '#6e8bff', 8, 'middle');
    c.path([q, pilotPt], '#6e8bff', 0.5, { opacity: 0.45 });
  }

  // Centre of pressure and calage.
  const cp = rot([b.cpMetres, 0]);
  c.dot(cp, '#e8c547', 3);
  c.text('Cp', [cp[0] + 0.05, cp[1] + 0.05], '#e8c547', 9);
  const cal = rot([b.calageMetres, 0]);
  c.dot(cal, '#e85bc4', 3);
  c.text('C', [cal[0] + 0.05, cal[1] - 0.14], '#e85bc4', 9);
  c.path([cal, pilotPt], '#e85bc4', 0.9, { dash: '3 3' });
  c.dot(pilotPt, '#ff5e5e', 3.5);

  // Horizon and glide path.
  c.path([[-chord * 0.3, 0], [chord * 1.3, 0]], '#26343d', 0.8);
  const g = (b.gammaDeg * Math.PI) / 180;
  c.path([[0, 0], [chord * 1.3, -chord * 1.3 * Math.tan(g)]], '#5fd97a', 0.8, { dash: '6 4' });

  c.fit();
  enablePanZoom('vp-section');
  document.getElementById('note-section').textContent =
    `α ${S.alphaDeg.toFixed(1)}°  ·  θ ${b.thetaDeg.toFixed(2)}°  ·  γ ${b.gammaDeg.toFixed(2)}°  ·  calage ${b.calageMetres.toFixed(3)} m`;
}

function drawCut() {
  const note = document.getElementById('note-cut');
  if (M.fabricError || !M.nested) {
    canvas('vp-cut', [[0, 0], [1, 1]]);
    note.textContent = M.fabricError || 'Laying out panels…';
    return;
  }
  // Wrapping is a display transform only — see layoutBands. The exports are
  // unaffected by it.
  const L = layoutBands(M.nested.placed, { rollWidth: S.rollWidth });
  const bands = L.bands;

  const all = M.nested.placed.flatMap((p) => L.placePanel(p).points);
  const c = canvas('vp-cut', all.concat([[0, 0], [L.bandLength, -L.totalHeight]]));

  for (const e of L.edges()) {
    c.path(e.top, '#e85bc4', 0.8, { opacity: 0.6 });
    c.path(e.bottom, '#e85bc4', 0.8, { opacity: 0.6 });
  }
  for (const p of M.nested.placed) {
    c.path(L.placePanel(p).points, p.surface === 'upper' ? '#35d6e8' : '#5fd97a', 0.8, { close: true });
  }
  c.fit();

  const f = M.fabric;
  note.textContent =
    `${M.nested.placed.length} panels  ·  ${f.linearMetres.toFixed(2)} m of ${S.rollWidth.toFixed(2)} m roll`
    + `  ·  ${(f.utilisation * 100).toFixed(0)}% used  ·  shown in ${bands} band${bands > 1 ? 's' : ''}`
    + (M.nestStale ? '  ·  updating…' : '');
}

function drawBalanceTable() {
  const host = document.getElementById('balanceTable');
  if (!host) return;
  const b = M.balance;
  const rows = [
    ['Speed', b.speedKMH.toFixed(2) + ' km/h', true],
    ['Sink', (b.speedMS * Math.sin(b.gammaRad)).toFixed(2) + ' m/s'],
    ['Glide ratio', b.glideRatio.toFixed(2), true],
    ['Glide angle γ', b.gammaDeg.toFixed(2) + '°'],
    ['Chord angle θ', b.thetaDeg.toFixed(2) + '°'],
    ['Cz 3D', b.cz3D.toFixed(3)],
    ['CxT', b.cxTotal.toFixed(4)],
    ['— induced', (b.dragBreakdown.induced * 100).toFixed(1) + '%'],
    ['— lines', (b.dragBreakdown.lines * 100).toFixed(1) + '%'],
    ['— pilot', (b.dragBreakdown.pilot * 100).toFixed(1) + '%'],
    ['— profile', (b.dragBreakdown.profile * 100).toFixed(1) + '%'],
    ['Centre of pressure', (b.xcpFraction * 100).toFixed(1) + '% c'],
    ['Calage', b.calageMetres.toFixed(3) + ' m', true],
    ['Calage fraction', (b.calageFraction * 100).toFixed(1) + '% c', true],
    ['Total mass', b.totalMass.toFixed(1) + ' kg'],
  ];
  const t = el('table', 'tbl');
  for (const [k, v, em] of rows) {
    const tr = el('tr', em ? 'em' : null);
    tr.append(el('td', null, k), el('td', null, v));
    t.append(tr);
  }
  host.innerHTML = '';
  host.append(t);
}

/**
 * Pan and zoom for one viewport.
 *
 * Wheel zooms about the cursor, drag pans, double-click returns to the fit.
 * The transform is stored as a viewBox rather than an SVG transform so that
 * `vector-effect: non-scaling-stroke` keeps line weights constant as the view
 * changes — zooming in should reveal detail, not thicken every line.
 */
function enablePanZoom(id) {
  const svg = document.getElementById(id);
  if (!svg || svg.dataset.panzoom) return;
  svg.dataset.panzoom = '1';
  svg.style.cursor = 'grab';

  const readBox = () => (svg.getAttribute('viewBox') || '0 0 100 100')
    .split(/\s+/).map(Number);
  const writeBox = (b) => {
    const s2 = b.join(' ');
    svg.setAttribute('viewBox', s2);
    VIEW_STATE[id] = { viewBox: s2 };
    markZoom(id, true);
  };

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y, w, h] = readBox();
    const r = svg.getBoundingClientRect();
    // Zoom about the pointer, so the feature under the cursor stays put.
    const fx = r.width ? (e.clientX - r.left) / r.width : 0.5;
    const fy = r.height ? (e.clientY - r.top) / r.height : 0.5;
    const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const nw = Math.max(1e-4, w * k);
    const nh = Math.max(1e-4, h * k);
    writeBox([x + (w - nw) * fx, y + (h - nh) * fy, nw, nh]);
  }, { passive: false });

  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, box: readBox() };
    svg.style.cursor = 'grabbing';
    if (svg.setPointerCapture) svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const [x, y, w, h] = drag.box;
    const dx2 = ((e.clientX - drag.x) / (r.width || 1)) * w;
    const dy2 = ((e.clientY - drag.y) / (r.height || 1)) * h;
    svg.setAttribute('viewBox', [x - dx2, y - dy2, w, h].join(' '));
    VIEW_STATE[id] = { viewBox: svg.getAttribute('viewBox') };
    markZoom(id, true);
  });
  const end = () => { drag = null; svg.style.cursor = 'grab'; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointerleave', end);

  svg.addEventListener('dblclick', () => resetView(id));
}

function resetView(id) {
  const svg = document.getElementById(id);
  delete VIEW_STATE[id];
  if (svg && svg.dataset.fitted) svg.setAttribute('viewBox', svg.dataset.fitted);
  markZoom(id, false);
}

function markZoom(id, on) {
  const badge = document.getElementById(`zoom-${id}`);
  if (badge) badge.style.display = on ? 'inline' : 'none';
}

/* ------------------------------------------------------------- rib view -- */

/**
 * One rib, drawn as it is cut.
 *
 * The wing views answer "what shape is this wing"; this one answers "what do
 * I cut for station 14". The rib is projected back into its own plane — the
 * same transform the DXF export uses — so what is on screen is the pattern,
 * not a perspective of it.
 *
 * Shown with it: the air intake, the line anchor points that pierce this rib,
 * the chord line, and the rib's own washin, dihedral and yaw, since those are
 * what make it different from its neighbours.
 */
/**
 * The line plan, seen from the front.
 *
 * This project has modelled cascades since Phase 2 — seven naming
 * conventions, per-row anchor densities, merged rows, brakes, the stabilo,
 * loads at every anchor — and none of it has ever been drawable. A design
 * tool that computes a line plan and cannot show it is asking to be trusted
 * on the one thing the user most wants to check.
 *
 * Front elevation, because that is the view a rigging diagram uses and the
 * one that makes a cascade legible: anchors along the span at the top, the
 * cascade converging down to the maillons.
 */
function drawLinePlan() {
  const plan = M.linePlan;
  if (!plan) return;

  // Both sides, so the cascade reads as a wing rather than half of one.
  const pts = [];
  for (const l of plan.lines) {
    if (!l.from || !l.to) continue;
    pts.push([l.from[1], l.from[2]], [l.to[1], l.to[2]]);
    pts.push([-l.from[1], l.from[2]], [-l.to[1], l.to[2]]);
  }
  if (!pts.length) return;

  const c = canvas('vp-lineplan', pts);
  c.grid(1);

  // Colour by row, so a cascade can be followed by eye. Brakes and the
  // stabilo are deliberately distinct: they carry handling load, not lift.
  const ROW_COLOUR = {
    A: '#ff5e5e', B: '#ffa23e', C: '#e8c547', D: '#5ec8ff',
    E: '#9d7bff', F: '#7bffb2', G: '#ff7bd5', H: '#b2ff7b', I: '#7bd5ff',
    K: '#8a8a8a', S: '#00e0a0', Z: '#ff00d0',
  };
  const LEVEL_WIDTH = { upper: 0.5, middle: 0.9, main: 1.4 };

  const wanted = (l) => (S.lineRow === 'all' ? true : l.row === S.lineRow);

  for (const side of [1, -1]) {
    for (const l of plan.lines) {
      if (!l.from || !l.to) continue;
      const on = wanted(l);
      const colour = ROW_COLOUR[l.row] || '#cccccc';
      c.path(
        [[side * l.from[1], l.from[2]], [side * l.to[1], l.to[2]]],
        colour,
        LEVEL_WIDTH[l.level] ?? 0.7,
        { opacity: on ? 0.95 : 0.08 },
      );
    }
  }

  // Anchors, so the attachment density is visible — the thing that took
  // three rounds to get right and has never been seen.
  for (const side of [1, -1]) {
    for (const l of plan.lines.filter((x) => x.level === 'upper' && x.to)) {
      if (!wanted(l)) continue;
      c.dot([side * l.to[1], l.to[2]], ROW_COLOUR[l.row] || '#fff', 1.6);
    }
  }

  // The maillons: where the cascade ends and the risers begin.
  for (const side of [1, -1]) {
    for (const r of plan.risers || []) {
      if (!r.maillon) continue;
      c.dot([side * r.maillon[1], r.maillon[2]], '#ffffff', 3);
    }
  }

  // Lines on a split A riser, marked. They are A lines, so they carry the A
  // colour, but which riser they hang from is the point of the layout.
  if (M.riserSplit && M.riserSplit.moved) {
    for (const side of [1, -1]) {
      for (const l of plan.lines.filter((x) => x.splitRiser && x.to)) {
        if (!wanted(l)) continue;
        c.dot([side * l.to[1], l.to[2]], '#ffffff', 2.4);
      }
    }
    c.text(M.riserSplit.note, [0, -0.04], '#8a8a8a', 9, 'middle');
  }

  const shown = plan.lines.filter(wanted).length;
  c.text(`${shown * 2} lines${S.lineRow === 'all' ? '' : ` in row ${S.lineRow}`}`,
    [0, 0.02], '#8a8a8a', 10, 'middle');
}

/** The cascade as a table: every line, its level, length and load. */
function drawCascadeTable() {
  const host = clear('g-balance');
  const plan = M.linePlan;
  if (!plan) { host.append(el('div', 'muted', 'No line plan.')); return; }

  const loads = new Map();
  if (M.loads && M.loads.tensions) {
    for (const t of M.loads.tensions.lines) loads.set(t.name, t.tensionN);
  }
  const sized = new Map();
  if (M.lineSelection) {
    for (const l of M.lineSelection.lines) if (l.line) sized.set(l.name, l.line.code);
  }

  const rows = plan.lines
    .filter((l) => (S.lineRow === 'all' ? true : l.row === S.lineRow))
    .sort((a, b) => (a.row === b.row
      ? (a.level.localeCompare(b.level) || (a.index ?? 0) - (b.index ?? 0))
      : a.row.localeCompare(b.row)));

  const t = el('table', 'tbl');
  const head = el('tr');
  for (const h of ['line', 'row', 'riser', 'level', 'length mm', 'load N', 'material']) {
    head.append(el('th', '', h));
  }
  t.append(head);
  for (const l of rows.slice(0, 400)) {
    const tr = el('tr');
    const load = loads.get(l.name);
    for (const v of [
      l.name, l.row, l.riser || '—', l.level,
      l.lengthMM != null ? String(Math.round(l.lengthMM)) : '—',
      load != null ? load.toFixed(1) : '—',
      sized.get(l.name) || '—',
    ]) tr.append(el('td', '', v));
    t.append(tr);
  }
  host.append(t);

  // The diff, when a real wing is selected.
  if (S.compareTo && typeof REFERENCE_TOTALS === 'object'
      && REFERENCE_TOTALS[S.compareTo] && plan.totals) {
    const cmp = comparePlans(plan.totals, REFERENCE_TOTALS[S.compareTo]);
    if (!cmp.count) {
      host.append(el('div', 'muted',
        'No overlapping anchors: the real wing has a different row set.'));
    } else {
      const d = el('div', 'note');
      d.append(el('div', '', `Against ${S.compareTo.replace(/^niviuk-/, 'Niviuk ')}: `
        + `${cmp.count} anchors compared`));
      d.append(el('div', 'muted',
        `mean offset ${cmp.meanOffsetMM.toFixed(0)} mm — the overall length `
        + 'difference, which a designer sets deliberately'));
      d.append(el('div', 'muted',
        `shape deviation ${cmp.meanShapeMM.toFixed(0)} mm — the spread once `
        + 'that offset is removed, which is what actually differs'));
      host.append(d);
    }
  }

  if (rows.length > 400) {
    host.append(el('div', 'muted', `${rows.length - 400} more not shown.`));
  }
}

/**
 * Diagonals, shaded by how much of each is actually in tension.
 *
 * `checkDiagonalTension` says a wide diagonal carries on a fraction of its
 * width — the rest is sewn in, adds weight, and does no work. That is a
 * number a designer can act on only if they can see which diagonals it
 * applies to.
 *
 * Front elevation, so the diagonals sit where they sit on the span.
 */
function drawDiagonals() {
  if (!M.vribs || !M.vribs.count) {
    const c0 = canvas('vp-diag', [[0, 0], [1, 1]]);
    c0.text('Diagonal ribs are off. Turn them on under Internal structure.',
      [0.5, 0.5], '#8a8a8a', 11, 'middle');
    return;
  }

  const tension = checkDiagonalTension(M.vribs.vribs);
  const pts = [];
  for (const v of M.vribs.vribs) {
    pts.push([v.apex[1], v.apex[2]]);
    for (const b of v.base) pts.push([b[1], b[2]]);
    pts.push([-v.apex[1], v.apex[2]]);
    for (const b of v.base) pts.push([-b[1], b[2]]);
  }
  const c = canvas('vp-diag', pts);
  c.grid(1);

  // Each diagonal drawn fibre by fibre: taut fibres carry the load, slack
  // ones are the fabric doing nothing.
  for (const side of [1, -1]) {
    M.vribs.vribs.forEach((v, i) => {
      const t = tension.diagonals[i].tension;
      t.fibres.forEach((f) => {
        c.path(
          [[side * v.apex[1], v.apex[2]], [side * f.point[1], f.point[2]]],
          f.taut ? '#5ec8ff' : '#ff5e5e',
          f.taut ? 0.6 : 0.5,
          { opacity: f.taut ? 0.35 + 0.5 * f.share : 0.5 },
        );
      });
      c.dot([side * v.apex[1], v.apex[2]], '#ffffff', 1.8);
    });
  }

  c.text(tension.note, [0, -0.03], tension.partlySlack ? '#ff9f5e' : '#5ec8ff',
    9, 'middle');
  document.getElementById('note-diag').textContent =
    'Blue fibres are in tension and carry load; red are past 90 degrees to it '
    + `and carry none. ${tension.fullyTaut} of ${tension.count} diagonals work `
    + 'across their whole width.';
}

/**
 * Rods on the rib section, with anything they clash with.
 *
 * A rod works in bending, which is the one thing fabric cannot do. It shares
 * the rib with the lightening holes, the anchors and the diagonals, and those
 * are placed by rules that do not know about each other.
 */
function drawRib() {
  const note = document.getElementById('note-rib');
  const rib = M.wing.ribs[Math.min(S.ribIndex, M.wing.ribs.length - 1)];
  if (!rib) { canvas('vp-rib', [[0, 0], [1, 1]]); note.textContent = 'No rib'; return; }

  // Project into the rib's own plane, exactly as ribsToDXF does.
  const b = (rib.betaDeg * Math.PI) / 180;
  const oy = rib.lobePoint[0];
  const oz = rib.lobePoint[1];
  const flat = ([x, y, z]) => [x - rib.xLE, -(y - oy) * Math.sin(b) + (z - oz) * Math.cos(b)];

  const upper = rib.upper.map(flat);
  const lower = rib.lower.map(flat);
  const loop = upper.slice().reverse().concat(lower.slice(1));

  const c = canvas('vp-rib', loop.concat([[0, 0], [rib.chord, 0]]));
  c.grid(0.1);

  // Chord line and the section.
  c.path([[0, 0], [rib.chord, 0]], '#4e6270', 0.8, { dash: '5 4' });
  c.path(loop, '#35d6e8', 1.6, { close: true });

  // Dimensions on the rib, which is the drawing a builder works from.
  //
  // Chord along the datum, maximum thickness where it actually occurs, and
  // each anchor's position — the three things someone marking out a rib has
  // to measure.
  if (S.dimensions) {
    c.dim([0, 0], [rib.chord, 0], `${rib.chord.toFixed(3)} m chord`,
      { offsetPx: 26 });

    // Thickness at the station where it is greatest, not at a nominal 30%:
    // a reflexed or heavily cambered section does not peak where a textbook
    // one does.
    let best = 0;
    let bestI = 0;
    for (let i = 0; i < upper.length; i++) {
      const lo = lower[Math.min(i, lower.length - 1)];
      const t = Math.abs(upper[i][1] - lo[1]);
      if (t > best && Math.abs(upper[i][0] - lo[0]) < rib.chord * 0.02) {
        best = t; bestI = i;
      }
    }
    if (best > 0) {
      const x = upper[bestI][0];
      c.dim([x, lower[Math.min(bestI, lower.length - 1)][1]], [x, upper[bestI][1]],
        `${(best * 1000).toFixed(0)} mm`, { offsetPx: -12, color: '#7bffb2' });
    }

    // Where each line attaches, measured from the leading edge.
    for (const [row, frac] of Object.entries(M.airfoil.anchors ?? {})) {
      if (!(frac > 0)) continue;
      const x = frac * rib.chord;
      c.dim([0, -rib.chord * 0.06], [x, -rib.chord * 0.06],
        `${row} ${(x * 1000).toFixed(0)}`,
        { offsetPx: 0, color: '#ff9f5e', size: 8, tickPx: 3 });
    }
  }

  // Rods, on the rib rather than on a section of their own.
  //
  // They were drawn in a separate viewport that redrew a bare aerofoil with
  // no holes, no anchors and no diagonals — a second, poorer rib view. A rod
  // on its own says nothing: what a designer needs to see is whether it
  // clears the lightening holes, whether an anchor tab lands on it, and
  // whether a leading-edge pair actually meets round the nose.
  if (S.rods && M.rods && M.rods.count) {
    const onThis = M.rods.rods.filter((r) => r.rib === rib.index);
    const clashed = new Set((M.rodClearance?.clashes ?? [])
      .filter((x) => x.rib === rib.index).map((x) => x.group));

    for (const r of onThis) {
      const surf = r.surface === 'lower' ? rib.lower : rib.upper;
      const seg = [];
      for (let f = r.fromChord; f <= r.toChord + 1e-9; f += 0.004) {
        seg.push(flat(pointOnSurface(surf, Math.min(1, f))));
      }
      if (seg.length < 2) continue;
      c.path(seg, clashed.has(r.group) ? '#ff5e5e' : '#e8c547',
        Math.max(2, r.diameterMM * 1.6));
    }

    if (onThis.length) {
      const cl = M.rodClearance;
      c.text(`${onThis.length} rod${onThis.length > 1 ? 's' : ''}`
        + (cl && !cl.ok ? ' — clash' : ''),
      [rib.chord * 0.5, -rib.chord * 0.16],
      cl && !cl.ok ? '#ff5e5e' : '#e8c547', 9, 'middle');
    }
  }

  // Seam allowance, which is what actually gets cut.
  const allowance = S.seamAllowance / 1000;
  if (allowance > 0) {
    const cx = rib.chord / 2;
    const cy = (Math.max(...loop.map((p) => p[1])) + Math.min(...loop.map((p) => p[1]))) / 2;
    const grown = loop.map(([x, y]) => {
      const vx = x - cx;
      const vy = y - cy;
      const m = Math.hypot(vx, vy) || 1;
      return [x + (vx / m) * allowance, y + (vy / m) * allowance];
    });
    c.path(grown, '#5fd97a', 0.7, { close: true, dash: '4 3', opacity: 0.8 });
  }

  // Air intake, on the lower surface.
  const intake = lower.filter((p, i) => {
    const t = rib.lower[i][0] - rib.xLE;
    return t >= M.airfoil.intake.start * rib.chord && t <= M.airfoil.intake.end * rib.chord;
  });
  if (intake.length > 1) c.path(intake, '#ff5e5e', 3);

  // Line anchors that pass through this rib.
  for (const [row, frac] of Object.entries(M.airfoil.anchors)) {
    const target = frac * rib.chord;
    let best = lower[0];
    let bd = Infinity;
    lower.forEach((p, i) => {
      const d = Math.abs((rib.lower[i][0] - rib.xLE) - target);
      if (d < bd) { bd = d; best = p; }
    });
    c.dot(best, '#6e8bff', 2.4);
    c.text(row, [best[0], best[1] - rib.chord * 0.035], '#6e8bff', 9, 'middle');
  }

  // One set of openings, two jobs.
  //
  // A lightening hole in a rib is already a cross-port — air passes through
  // it. Generated separately they overlapped by up to 270 mm on the root rib;
  // designed once against both constraints they cannot.
  if (S.ribHoles) {
    const nb = M.wing.ribs[Math.min(rib.index + 1, M.wing.ribs.length - 1)];
    // The cell intake. Air enters at total pressure only where the flow
    // stagnates, and the stagnation point moves with angle of attack — so
    // the opening has to span the whole travel, not sit at the nose.
    if (S.showIntake) {
      const it = buildIntake({
        wing: M.wing, airfoil: M.airfoil, thinAirfoilFn: thinAirfoil,
        alphaAcceleratedDeg: 2, alphaSlowDeg: 12,
        spec: { lowerCutM: S.intakeLower / 100, upperCutM: S.intakeUpper / 100 },
      });
      c.text(it.coversEnvelope
        ? `intake spans ${(it.travel.travelFraction * 100).toFixed(1)}% stagnation travel`
        : 'INTAKE MISSES THE STAGNATION POINT',
      [rib.chord * 0.5, -rib.chord * 0.22],
      it.coversEnvelope ? '#5ec8ff' : '#ff5e5e', 9, 'middle');
    }

    const set = ribOpenings(rib, nb === rib ? null : nb, M.airfoil,
      { speedMS: M.balance ? M.balance.speedMS : 11 });
    for (const h of set.holes) {
      c.path(h.outline.map(([x, y]) => [x, y]), '#5fd97a', 1.1, { close: true });
    }
    if (set.holes.length) {
      c.text(`${(set.removedFraction * 100).toFixed(0)}% removed`,
        [rib.chord * 0.5, -rib.chord * 0.10], '#5fd97a', 9, 'middle');
      c.text(Number.isFinite(set.ventilationMarginRatio)
        ? `${set.ventilationMarginRatio.toFixed(1)}x the flow requirement, sized by ${set.sizedBy}`
        : 'no cell outboard of this rib',
      [rib.chord * 0.5, -rib.chord * 0.15],
      set.ventilates ? '#e8c547' : '#ff5e5e', 9, 'middle');
    }
  }

  // Diagonal ribs that touch this rib. A builder needs both marks: the point
  // where a diagonal's apex lands on a loaded rib, and the line along which
  // its base is sewn to an unloaded one.
  if (M.vribs && M.vribs.count) {
    const idx = rib.index;
    for (const v of M.vribs.vribs) {
      if (v.fromRib === idx) {
        const p = flat(v.apex);
        c.dot(p, '#e85bc4', 3.2);
        c.text(`${v.row}→${v.toRib}`, [p[0] + rib.chord * 0.02, p[1]], '#e85bc4', 8);
      }
      if (v.toRib === idx) {
        c.path(v.base.map(flat), '#e85bc4', 2.4, { opacity: 0.9 });
      }
    }
  }

  // Leading and trailing edge markers.
  c.dot(upper[0], '#e8c547', 2.4);
  c.dot(upper[upper.length - 1], '#e8c547', 2.4);

  c.fit();
  enablePanZoom('vp-rib');

  const t = Math.max(...loop.map((p) => p[1])) - Math.min(...loop.map((p) => p[1]));
  note.textContent =
    `rib ${rib.index} of ${M.wing.ribs.length - 1}  ·  station ${rib.station.toFixed(3)} m`
    + `  ·  chord ${rib.chord.toFixed(3)} m  ·  thickness ${(t / rib.chord * 100).toFixed(1)}%`
    + `  ·  washin ${rib.alphaDeg.toFixed(2)}°  ·  dihedral ${rib.betaDeg.toFixed(1)}°`
    + `  ·  yaw ${rib.zetaDeg.toFixed(2)}°  ·  φ ${rib.phiDeg.toFixed(2)}°`
    + (M.vribs && M.vribs.count
      ? `  ·  ${M.vribs.vribs.filter((v) => v.fromRib === rib.index).length} diagonals from here, `
        + `${M.vribs.vribs.filter((v) => v.toRib === rib.index).length} landing`
      : '');
}

/* --------------------------------------------------------------- output -- */

/**
 * Line lengths, from the plan the rest of the tool uses.
 *
 * This exported `M.cascade` — chapter 8's weighted-centroid cascade — while
 * the Lines view, the loads, the bill of materials and the PMA sheet all use
 * `M.linePlan`. Two line models, and the export read the one the user's
 * settings do not reach: changing the karabiner separation moved the plan and
 * left the exported lengths untouched.
 *
 * `buildCascade` still draws the front view, which is what it is for.
 */
function linesCSV() {
  const plan = M.linePlan;
  const byName = new Map();
  if (M.lengths) for (const l of M.lengths.lines) byName.set(l.name, l);
  const sized = new Map();
  if (M.lineSelection) {
    for (const l of M.lineSelection.lines) if (l.line) sized.set(l.name, l.line.code);
  }

  const out = ['name,row,level,rib_index,flying_mm,sewn_mm,cut_mm,load_N,material'];
  for (const l of plan.lines) {
    const c = byName.get(l.name);
    out.push([
      l.name, l.row, l.level, l.ribIndex ?? '',
      l.lengthMM != null ? Math.round(l.lengthMM) : '',
      c ? c.sewnLengthMM : '',
      c ? c.cutLengthMM : '',
      c && Number.isFinite(c.flightN) ? c.flightN.toFixed(1) : '',
      sized.get(l.name) || '',
    ].join(','));
  }

  out.push('');
  out.push('# totals, both sides');
  const byRow = {};
  for (const l of plan.lines) byRow[l.row] = (byRow[l.row] || 0) + (l.lengthMM || 0) * 2;
  for (const [row, mm] of Object.entries(byRow)) {
    out.push(`# row ${row},,,,${(mm / 1000).toFixed(3)} m`);
  }
  out.push(`# TOTAL,,,,${plan.totalLengthM.toFixed(3)} m`);
  if (M.lengths) {
    out.push(`# cut length,,,,${M.lengths.cutMetres.toFixed(3)} m `
      + `(loops ${S.loopAllowance} mm per line)`);
  }
  return out.join('\n');
}

function save(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(null, `Saved ${filename}`);
}

/* ---------------------------------------------------------------- misc  -- */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function clear(id) {
  const n = document.getElementById(id);
  n.innerHTML = '';
  return n;
}

function setStatus(error, msg) {
  const s = document.getElementById('status');
  if (error) { s.innerHTML = `<span class="bad">${error}</span>`; return; }
  const dev = M.worstDev != null ? (M.worstDev * 100).toFixed(3) + '%' : '—';
  const ok = (M.worstDev ?? 0) < 0.01;
  const unsupported = M.vribs ? M.vribs.unsupportedRibs.length : 0;
  const warn = unsupported
    ? `<span class="bad"> · ${unsupported} rib${unsupported > 1 ? 's' : ''} with no load path</span>`
    : '';
  s.innerHTML =
    `<span class="${ok ? 'ok' : 'bad'}">●</span> ${msg || 'Model current'}${warn}` +
    `<span class="sep"> · </span>worst panel distortion ${dev}` +
    `<span class="sep"> · </span>rebuilt in ${(M.ms || 0).toFixed(0)} ms`;
}

/* ------------------------------------------------------------- tab bar -- */

function selectTab(name) {
  S.tab = name;
  for (const b of document.querySelectorAll('.vptab')) {
    b.classList.toggle('is-on', b.dataset.tab === name);
  }
  for (const g of document.querySelectorAll('.viewports')) {
    g.hidden = g.dataset.tab !== name;
  }
  buildTabTools();
  // The hidden grids had no size, so anything drawn while they were hidden
  // fitted to nothing. Redraw on the way in rather than on the way out.
  draw();
}

/** Controls that belong to the current tab, shown beside the tabs. */
function buildTabTools() {
  const host = document.getElementById('tabTools');
  if (!host) return;
  host.innerHTML = '';
  if (S.tab !== 'rib' || !M.wing) return;

  const last = M.wing.ribs.length - 1;
  if (S.ribIndex > last) S.ribIndex = last;

  const lab = el('label', null, 'Rib');
  const slider2 = el('input');
  slider2.type = 'range';
  slider2.min = 0; slider2.max = last; slider2.step = 1; slider2.value = S.ribIndex;
  slider2.setAttribute('aria-label', 'Rib to display');
  const out = el('label', null, `${S.ribIndex} / ${last}`);
  out.style.color = 'var(--aci-yellow)';
  slider2.addEventListener('input', () => {
    S.ribIndex = parseInt(slider2.value, 10);
    out.textContent = `${S.ribIndex} / ${last}`;
    drawRib();
  });

  const reset = el('button', 'btn', 'Reset view');
  reset.style.padding = '4px 8px';
  reset.addEventListener('click', () => resetView('vp-rib'));

  host.append(lab, slider2, out, reset);
}

/* ----------------------------------------------------------------- boot -- */

document.getElementById('wingName').addEventListener('input', (e) => { S.name = e.target.value || 'wing'; });

for (const b of document.querySelectorAll('.vptab')) {
  b.addEventListener('click', () => selectTab(b.dataset.tab));
}

// Redraw on any change to the viewport container, not only on window
// resize: collapsing a control group or opening the panel changes the frames
// without the window changing at all, and the drawings would keep the old fit.
let resizeTimer;
const scheduleRedraw = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (M.wing) draw(); }, 120);
};
window.addEventListener('resize', scheduleRedraw);
if (typeof ResizeObserver === 'function') {
  const host = document.querySelector('.viewports');
  if (host) new ResizeObserver(scheduleRedraw).observe(host);
}

buildControls();
rebuild();
buildTabTools();
