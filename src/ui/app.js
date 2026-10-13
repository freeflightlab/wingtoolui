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
// Every published wing the repository holds, generated at build time.
//
// This was twenty designs typed in by hand across seven families. The data
// files carry 55 sizes across eleven, including every Niviuk — so two thirds
// of the wings this project validates against could not be loaded as a
// starting point in the tool that validates them.
//
// `REFERENCE_WINGS` comes from build.py, so adding a reference file adds a
// wing and there is no second list to keep in step. The rows below are the
// fallback for running app.js outside the bundle, where that constant does
// not exist.
const REFERENCE_LIB = ((typeof REFERENCE_WINGS !== 'undefined'
  && Array.isArray(REFERENCE_WINGS) && REFERENCE_WINGS.length)
  ? REFERENCE_WINGS
  : [
]).map(([family, size, flatArea, flatSpan, flatAR, cells, maxChord, projectedArea,
  projectedSpan = null, massKg = null, weightLo = null, weightHi = null,
  totalLineM = null, application = null]) => {
  const midWeight = weightLo && weightHi ? (weightLo + weightHi) / 2 : null;
  return {
    id: `${family} ${size}`,
    family, size, flatArea, flatSpan, flatAR, cells, maxChord, projectedArea,
    projectedSpan, massKg, weightLo, weightHi, midWeight, totalLineM,
    // What kind of wing the specification says it is.
    application,
    singleSurface: /single surface/i.test(application || ''),
    source: {
      flatArea, flatSpan, flatAR, cells, maxChord, projectedArea, name: size,
      // `referenceDesignInputs` takes the arc from the projected SPAN when
      // it has one, and only falls back to the area ratio without.
      ...(projectedSpan ? { projectedSpan } : {}),
      ...(massKg ? { mass: massKg } : {}),
      ...(midWeight ? { midWeight } : {}),
      ...(totalLineM ? { totalLineLength: totalLineM } : {}),
    },
  };
});

/**
 * Line length for a wing of this span, lines only, from published heights.
 *
 * The PHI Allegro light family measures karabiner to canopy as
 * 0.566 × span + 0.459 m (R² 0.995, six sizes). Checked against wings it was
 * not fitted on — Niviuk's published heights for sixteen sizes of four
 * families, and the Geo 7 MS measured riser to canopy — it holds within
 * -6.2% to +3.5%. A riser's length of that is webbing, not line.
 */
function lineLengthForSpan(spanM, riserM = 0.5) {
  return EXAMPLE_SCALING.lineLength.slope * spanM
    + EXAMPLE_SCALING.lineLength.intercept - riserM;
}

const S = {
  name: 'gnu-01',
  // planform
  span: 10.25, rootChord: 2.60, tipChord: 0.90, tipSweep: 1.10,
  ellipticityLE: 0.85, ellipticityTE: 0.95,
  // Cells narrow towards the tip as the chord does, three quarters of the way
  // (`ribStations`): what the Swoop2's own ribs do. 'cosine' is what a design
  // saved before October 2026 carries, and it still loads as it was.
  cells: 24, distribution: 'chord', cellTaper: 75, centreRib: true,
  theme: 'dark',
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
  cz: 0.90, cx0a: 0.009, cm: -0.042, oswald: 0.90,
  cxPilot: 0.015, cxLines: 0.020, legacy: false,
  // Fly the balance and the polar on the drag of the lines in the plan,
  // rather than on the number typed in.
  cxLinesFromPlan: false,
  // panels
  ribIndex: 0, tab: 'wing', ribHoles: true, marks: true,
  reference: '', brakeLines: true, stabilo: true, paper: 'A4',
  lineRow: 'all', compareTo: '', dimensions: true,
  isoAz: 35, isoEl: 12, isoLines: true, riserLayout: 'A/B/C+D', splitFrom: 62,
  // Nose rods: one piece from `rodUpper` % of chord on top, round the nose,
  // to `rodLower` % underneath — the Swoop2's are 18.5 and 15. The diameter
  // is the designer's; its file states none.
  rods: true, rodUpper: 18.5, rodLower: 15, rodDia: 1.5, rodReach: 100,
  useRodSpec: false,
  rodSpec: 'nose      12.0 18.5   7.0 15.0    1.5\n'
    + 'batten    23.5 29.5   63.0 70.0   1.5',
  famCount: 4, famSmallest: 20, famLargest: 29, famLoadLo: 70, famLoadHi: 115,
  lineBrand: 'all', lineStrength: 'kinked', maxLineTypes: 5, serviceHours: 200,
  objLineScale: 1,
  clothLE: 'Porcher Skytex 27 hard', clothUpper: 'Porcher Skytex 32',
  clothLower: 'Porcher Skytex 32', clothRib: 'Porcher Skytex 40 hard',
  noseClothTo: 25,         // % of chord the leading-edge cloth runs to, on the upper surface
  useCascadeSpec: false,
  cascadeSpec: 'A 30 14 3\nB 14  6 4\nC  8  3 2',
  // N/m across the cell, which with the pressure sets how far a panel
  // bulges. The handbook's 6% of widening on a 0.25 m cell at 95 Pa is
  // 21 N/m. It was 300, at which a panel hardly bulges at all.
  ovalFromPressure: false, sailTension: 25,
  // Assumptions that were constants inside the core. Each is a design
  // decision rather than a fact, so each is the user's to make.
  karabinerSep: 42,        // cm between the karabiners
  loopAllowance: 130,      // mm of line consumed by the loops at each end
  cdCylinder: 1.1,         // drag coefficient of a line in cross-flow
  measureTension: 5,       // daN, the tension the PMA measures lengths at
  rowShareMode: 'convention',
  printMargin: 10, printOverlap: 15,
  showIntake: false,
  vribs: true, vribRows: 'ABCD', vribSpread: 18, vribReach: 1,
  vribMinLength: 0,
  vribView: 'all',         // which row's diagonals the Structure view draws
  mergeRows: 'none',
  ovalAmount: 6.0, seamAllowance: 10, pointsPerSurface: 50,
  rollWidth: 1.40, panelGap: 3.0, applyOval: true,
};

let M = {}; // derived model, rebuilt on every change
let LEP = null; // imported LEparagliding document, kept as the export template
let XPOLAR = null; // imported XFOIL section polar, when there is one
// A design remembered for comparison: its summary, taken when the designer
// asked, so a change can be read against the design before it.
let REMEMBERED = null;

/** The one complete design in the library, as opposed to a specification. */
const SWOOP2_ID = "Laboratori d'envol Swoop2  (complete design)";

/* ---------------------------------------------------------------- model -- */

/** Take the size from a published wing, leaving the shape alone. */
function applyReference() {
  // Choosing "—" after the Swoop2 goes back to the parametric wing. It used
  // to return here and leave the Swoop2 loaded under an empty picker.
  if (!S.reference) {
    if (S._appliedReference === SWOOP2_ID) leaveImport();
    S._appliedReference = '';
    S._referenceTotalLineM = null;
    return;
  }
  if (S.reference === S._appliedReference) return;

  // The Swoop2 is a COMPLETE design, not a specification.
  //
  // It was loadable only from a button in the Files panel, while the picker
  // that says "Start from a published wing" offered 55 sizes and not the one
  // wing this project reproduces exactly. Somebody looking for a wing to
  // start from would never have found it.
  //
  // Every other entry gives a size and leaves the shape to defaults. This one
  // brings its own ribs, its own aerofoils and its own line plan, so it takes
  // the import path rather than the parametric one.
  if (S.reference === SWOOP2_ID) {
    if (typeof SWOOP2_LEP !== 'string' || !SWOOP2_LEP.length) {
      setStatus('The Swoop2 is not in this build.');
      S.reference = '';
      return;
    }
    try {
      loadLepDesign(parseLep(SWOOP2_LEP),
        typeof SWOOP2_SECTIONS === 'object' && SWOOP2_SECTIONS ? SWOOP2_SECTIONS : {});
      S._appliedReference = S.reference;
    } catch (e) {
      setStatus(`Swoop2: ${e.message}`);
      S.reference = '';
    }
    return;
  }

  // Any other reference replaces an imported design with a parametric one.
  if (LEP) leaveImport();

  const entry = REFERENCE_LIB.find((e) => e.id === S.reference);
  if (!entry) return;
  const r = referenceDesignInputs(entry.source);
  if (!r) return;
  S._appliedReference = S.reference;
  S.span = r.inputs.span;
  S.rootChord = r.inputs.rootChord;
  S.tipChord = r.inputs.tipChord;
  S.tipSweep = r.inputs.tipSweep;
  // The shape defaults the validated pipeline builds these wings with. They
  // were left at whatever the sliders held, so the same wing came out of the
  // picker and out of the pipeline with different outlines.
  S.ellipticityLE = r.inputs.ellipticityLE;
  S.ellipticityTE = r.inputs.ellipticityTE;
  // The tip chord is not published and the flat area is, so the tip is the
  // one free dimension. `referenceDesignInputs` solves it to the published
  // area, so the picker and the full-pipeline validation build the same
  // outline. (It was solved here and not there: 22% of the root in the
  // pipeline, 1 to 7% short of the published area.)
  const tipNote = r.tipChordBasis === 'solved to the published area'
    ? `tip chord ${S.tipChord.toFixed(2)} m, solved to the published area`
    : `tip chord ${r.tipChordBasis}`;
  // `S.cells` is the count for ONE HALF of the wing — the slider says so and
  // the LEP export doubles it. A manufacturer publishes the TOTAL.
  //
  // This read `Math.round(r.cells / 2) * 2`, which rounds to the nearest even
  // number and does not halve anything: the `* 2` undoes the `/ 2`. Every
  // reference wing was built with twice its published cell count — a 34-cell
  // Ultralite 5 as 68, a 48-cell Geo 7 as 96 — and the bigger ones hit the
  // clamp, so a 78-cell Zeno 2 and a 72-cell Allegro were both built as 120.
  //
  // An ODD published count means a cell straddles the centreline — a centre
  // CELL rather than a centre rib. `cells` counts the full cells outboard of
  // it, so 65 (the Alpina 5, the Lynx 2) is 32 full cells each side plus the
  // one in the middle.
  S.centreRib = r.cells % 2 === 0;
  const fullCells = S.centreRib ? r.cells / 2 : (r.cells - 1) / 2;
  S.cells = Math.max(4, Math.min(60, fullCells));
  const builtTotal = S.centreRib ? S.cells * 2 : S.cells * 2 + 1;
  const cellNote = builtTotal === r.cells
    ? null
    : `built with ${builtTotal} cells against ${r.cells} published.`;
  // The arc is a circle through the published projected span. The ratio is
  // only read by the circle, so a picker used while the arc was set to an
  // ellipse loaded the size and silently kept the ellipse's span.
  S.lobeType = 'circle';
  S.projectedRatio = r.projectedRatio;
  // Where the projected span is not published but the projected area is,
  // the arc is solved to the area. Taking the area ratio as the span ratio
  // put the Artik R 2 3% over its projected area and the Skin 4 P 3% under.
  let arcNote = entry.projectedSpan
    ? `arc through the published ${entry.projectedSpan} m projected span` : null;
  if (!entry.projectedSpan && entry.projectedArea) {
    const pf = planformFromDesignInputs({
      span: S.span, rootChord: S.rootChord, tipChord: S.tipChord, tipSweep: S.tipSweep,
      ellipticityLE: S.ellipticityLE, ellipticityTE: S.ellipticityTE,
    });
    const projectedFor = (ratio) => {
      const lobe = buildLobe({ type: 'circle', projectedRatio: ratio }, pf.halfSpan);
      const n = 240;
      let area = 0;
      let prev = lobe.at(0).y;
      for (let i = 1; i <= n; i++) {
        const y = (pf.halfSpan * i) / n;
        const ly = lobe.at(y).y;
        area += pf.chord(y - pf.halfSpan / (2 * n)) * (ly - prev);
        prev = ly;
      }
      return 2 * area;
    };
    let lo = 0.65;
    let hi = 0.99;
    if (entry.projectedArea >= projectedFor(lo) && entry.projectedArea <= projectedFor(hi)) {
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (projectedFor(mid) < entry.projectedArea) lo = mid; else hi = mid;
      }
      S.projectedRatio = Math.round(((lo + hi) / 2) * 10000) / 10000;
      arcNote = `arc solved to the published ${entry.projectedArea} m² projected area`;
    }
  }

  // What else the specification publishes. The size used to be all that
  // arrived, so every wing flew at 80 kg of pilot on 6.5 m of line — a
  // 13 m² Ultralite 5 on lines 50% longer than its own, 15% over the middle
  // of its weight range.
  const used = [];
  S.lineLength = Math.round(lineLengthForSpan(entry.flatSpan) * 100) / 100;
  used.push(`${S.lineLength.toFixed(2)} m of line from the span`);
  if (entry.massKg) {
    S.wingMass = Math.max(0.5, Math.round((entry.massKg - S.lineMass) * 100) / 100);
    used.push(`its ${entry.massKg} kg`);
  }
  if (entry.midWeight) {
    S.pilotMass = Math.round(entry.midWeight - (entry.massKg ?? S.wingMass + S.lineMass));
    used.push(`the middle of its ${entry.weightLo}–${entry.weightHi} kg range`);
  }
  S._referenceTotalLineM = entry.totalLineM ?? null;

  S.name = S.reference.replace(/\s+/g, '-');
  const nameField = document.getElementById('wingName');
  if (nameField) nameField.value = S.name;
  const assumed = r.derived.filter((d) => d !== 'tip chord');
  S._referenceNote = `${S.reference}: ${entry.flatArea} m² published`
    + `, with ${used.join(', ')}; ${tipNote}${arcNote ? `; ${arcNote}` : ''}. `
    + 'The shape is not published: '
    + `${assumed.join(', ')} are defaults, not this wing's.`
    + (cellNote ? ` ${cellNote}` : '')
    // A single-surface wing has no lower surface, and this tool only builds
    // wings that have one: what is on the page is a double-surface wing of
    // its size. Loaded without a word, its bill of materials came to nearly
    // twice the weight its maker publishes.
    + (entry.singleSurface
      ? ` This is a ${entry.application} wing — it has no lower surface. What is `
        + 'built here is a double-surface wing of its size, so the cloth, the '
        + 'mass, the lines and the patterns are not this wing\'s.'
      : '');
}

/**
 * Load a LEparagliding design — the Swoop2, or a file — as the design it is.
 *
 * There were three copies of this (the picker, a button, the file import),
 * each setting a different subset of the design: the file import set the line
 * length and intake, the other two did not, and none of them gave the wing its
 * own aerofoil, washin, tip, anchors, calage, line plan, brakes or rods. The
 * Swoop2 was drawn with a NACA 4415 on default sliders and hung from a line
 * plan this tool invented for it, under a banner calling it a complete design.
 *
 * One loader now, and it takes everything the file says that this tool can
 * reproduce: the ribs as LEparagliding builds them (see `lepRibs`), each
 * rib's own section, and — when the section files are present — the design's
 * own suspension, rods and holes, computed exactly as the program computes
 * them. What it cannot reproduce it names.
 */
/**
 * The settings an imported design overwrites with its own values.
 *
 * Kept aside when a design is loaded and put back when it is left, so that
 * looking at the Swoop2 does not cost a designer the parametric wing they
 * had: returning used to give them a 25-cell wing of the Swoop2's size.
 */
const IMPORT_OVERWRITES = [
  'name', 'span', 'rootChord', 'tipChord', 'cells', 'centreRib',
  'lineLength', 'karabinerSep', 'alphaDeg', 'lineMass', 'cxLinesFromPlan',
  'anchorA', 'anchorB', 'anchorC', 'anchorD', 'intakeStart', 'intakeEnd',
];

/** Leave an imported design, restoring the parametric wing it replaced. */
function leaveImport() {
  LEP = null;
  S._referenceNote = '';
  if (S._parametric) {
    Object.assign(S, S._parametric);
    S._parametric = null;
    const nameField = document.getElementById('wingName');
    if (nameField) nameField.value = S.name;
  }
}

function loadLepDesign(doc, sectionTexts = {}) {
  // What this design is about to overwrite, if it is replacing a parametric
  // wing rather than another import.
  if (!LEP) S._parametric = Object.fromEntries(IMPORT_OVERWRITES.map((k) => [k, S[k]]));
  const texts = { ...sectionTexts };
  const parsed = {};
  for (const [file, text] of Object.entries(texts)) {
    try { parsed[file] = parseAirfoilText(text, file.replace(/\.[^.]+$/, '')); } catch (e) { /* reported below */ }
  }
  const design = lepToDesign(doc, { sections: parsed });
  const haveAll = design.missingSections.length === 0;
  let geom = null;
  let table = null;
  let joncs = null;
  let holes = null;
  if (haveAll) {
    table = lepRibTable(doc, { airfoils: texts });
    geom = lepLineGeometry(doc, { airfoils: texts });
    joncs = lepJoncs(doc, table);
    holes = lepHoles(doc, table);
  }
  // Section 12: what the design sews inside its cells.
  let hv = null;
  try { hv = parseHVRibs(doc); } catch (e) { hv = null; }
  LEP = { doc, design, info: describeLep(doc), texts, parsed, geom, table, joncs, holes, hv };
  S.name = design.name || S.name;
  const nameField = document.getElementById('wingName');
  if (nameField) nameField.value = S.name;
  // The rows the design has, from the design; a row it lacks keeps its
  // slider value only for when the wing goes back to parametric.
  for (const row of ['A', 'B', 'C', 'D']) {
    const f = design.anchorFractions?.[row];
    if (Number.isFinite(f) && f > 0) S[`anchor${row}`] = f * 100;
  }
  if (design.intake) {
    S.intakeStart = design.intake.start * 100;
    S.intakeEnd = design.intake.end * 100;
  }
  // The planform settings take the design's own values. They do not drive
  // an imported wing, but everything that reads them — the section view's
  // chord, the trim schedule, the settings export — then reads this wing and
  // not whatever the sliders last held. A Swoop2 of 25 cells a side was
  // listed as 24.
  const ribsE = design.explicitRibs ?? [];
  if (Number.isFinite(design.flatSpan)) S.span = design.flatSpan;
  if (Number.isFinite(design.rootChord)) S.rootChord = design.rootChord;
  if (ribsE.length && Number.isFinite(ribsE[ribsE.length - 1].chord)) {
    S.tipChord = ribsE[ribsE.length - 1].chord;
  }
  if (Number.isFinite(design.cells)) {
    S.centreRib = !!design.centreRib;
    S.cells = S.centreRib ? design.cells / 2 : (design.cells - 1) / 2;
  }
  // Section 8: line length is scaled with the wing, the risers are not.
  if (Number.isFinite(design.lineLengthM)) S.lineLength = design.lineLengthM;
  if (Number.isFinite(design.karabinerM)) S.karabinerSep = design.karabinerM * 100;
  if (geom?.ok) S.alphaDeg = Math.round(geom.aoaDeg * 100) / 100;
  // Its own lines: what they weigh, as the program totals them, and their
  // own drag rather than a typed figure — the plan is the real one.
  if (geom?.ok && Number.isFinite(geom.totals.weightKg)) {
    S.lineMass = Math.round(geom.totals.weightKg * 1000) / 1000;
    S.cxLinesFromPlan = true;
  }
  const said = [];
  if (!haveAll) {
    said.push(`the file names ${design.missingSections.join(', ')} — load it `
      + '(Section, "load a coordinate file") to reproduce its ribs, lines and rods exactly');
  }
  const missing = [...(design.notReproduced ?? []), ...(joncs?.notReproduced ?? []),
    ...[...new Set((holes?.notReproduced ?? []).map((x) => x.replace(/^rib \d+: /, '')))]];
  // Its internal pieces: the diagonals are placed where the file puts them;
  // the straps and the pieces between two ribs are in the file and not drawn.
  if (hv && hv.count) {
    const left = [];
    if (hv.straps.length) left.push(`${hv.straps.length} straps between adjacent ribs`);
    if (hv.general.length) left.push(`${hv.general.length} pieces between two ribs`);
    if (hv.other.length) left.push(`${hv.other.length} other internal pieces`);
    if (left.length) missing.push(`${left.join(', ')} (section 12)`);
  }
  if (missing.length) said.push(`not reproduced: ${missing.join('; ')}`);
  S._referenceNote = `${design.name || 'LEP design'}: a complete design from `
    + `${design.brand || 'LEparagliding'} — ${design.cells} cells, `
    + `${design.geometry.ribCount} ribs`
    + (geom?.ok ? `, ${geom.totals.linesPerSide} lines a side as its program computes them` : '')
    + '. The planform, arc and section sliders do not apply to it.'
    // Each is a sentence of its own, so each starts with a capital.
    + (said.length ? ` ${said.map((x) => x[0].toUpperCase() + x.slice(1)).join('. ')}.` : '');
  return LEP;
}

/** The design's own section for its root rib, with its own anchors. */
function importedAirfoil() {
  const d = LEP?.design;
  const file = d?.explicitRibs?.[0]?.airfoilFile;
  const own = file ? LEP.parsed[file] : null;
  if (!own) return null;
  const af = { ...own, points: own.points };
  af.anchors = { ...(d.anchorFractions ?? {}) };
  if (d.intake) af.intake = { ...d.intake };
  return af;
}

/** Put the chosen theme on the document, so the stylesheet can see it. */
function applyTheme() {
  const root = document.documentElement;
  if (root && root.setAttribute) root.setAttribute('data-theme', S.theme);
  // The button says what pressing it will DO, not what is currently on.
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = S.theme === 'light' ? 'Dark' : 'Light';
}

/**
 * The theme switch lives in the masthead.
 *
 * It was a select at the bottom of the Planform panel, under six sliders
 * about leading-edge ellipticity — somewhere nobody would look for a colour
 * scheme, and it was reported as missing. Appearance is not a design
 * parameter and does not belong among them.
 */
function wireThemeButton() {
  const btn = document.getElementById('themeBtn');
  if (!btn || btn._wired) return;
  btn._wired = true;
  btn.addEventListener('click', () => {
    S.theme = S.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    rebuild();
  });
}

function rebuild() {
  applyTheme();
  wireThemeButton();
  addViewportSavers();
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

    // An imported design brings its own section and its own anchor rows. A
    // three-line wing has no D row, and inventing one at the slider's 78%
    // put a phantom D on the Swoop2's ribs.
    let airfoil = (imported && importedAirfoil()) || S.airfoilCustom || naca4(S.airfoilCode);
    // Reflex turns the camber line back up near the trailing edge, trading a
    // little lift for a positive pitching moment. It is applied before
    // anything downstream so the ribs, panels and section theory all see the
    // same shape.
    if (S.reflex > 0 && !imported) {
      airfoil = applyReflex(airfoil, { amount: S.reflex / 100, start: S.reflexStart / 100 });
    }
    airfoil.intake = { start: S.intakeStart / 100, end: S.intakeEnd / 100 };
    if (!(imported && importedAirfoil())) {
      airfoil.anchors = {
        A: S.anchorA / 100, B: S.anchorB / 100,
        C: S.anchorC / 100, D: S.anchorD / 100,
      };
    }

    const wing = buildWing({
      planform, lobe, airfoil,
      explicitRibs: imported ? imported.explicitRibs : null,
      cells: S.cells,
      centreRib: S.centreRib,
      RL: S.RL, RP: S.RP,
      washin: { total: S.washinTotal, mode: S.washinMode },
      pointsPerSurface: S.pointsPerSurface,
      distribution: S.distribution,
      cellTaper: S.cellTaper / 100,
      zRotation: S.zRotation,
      alphaDeg: S.alphaDeg,
    });

    // Worst flow misalignment across the span — how far the least well
    // presented rib is from lying in the glide path.
    const worstPhi = Math.max(...wing.ribs.map((r) => Math.abs(r.phiDeg)));

    const metrics = planformMetrics(planform);
    const lobeM = imported
      ? importedLobeMetrics(wing, planform.halfSpan)
      : lobeMetrics(lobe, planform.halfSpan);
    const projArea = projectedArea(wing);

    // Developed flat here; the billow is added once the flight is solved,
    // because billow from pressure needs the speed the wing flies at.
    let panels = developWing(wing);

    // The solve takes the wing's own span and root chord: an imported
    // design is not the sliders, and solving the Swoop2's balance on a
    // 10.25 m span and 2.60 m chord it does not have gave a calage for a
    // different wing.
    //
    // And the pilot's own depth below the wing: lines AND risers. The line
    // plan hangs the karabiner a riser's length below the lines, and
    // LEparagliding computes its attitude from the same total height (hcp,
    // 647 cm on the Swoop2); the balance used the lines alone, 0.47 to
    // 0.50 m short, so the geometry and the moments described two different
    // pilots.
    const riserM = imported && LEP.geom?.ok ? LEP.geom.riserLengthCm / 100 : 0.5;
    const hangDepthM = S.lineLength + riserM;
    const flightMass = S.pilotMass + S.wingMass + S.lineMass;
    // An imported wing's twist is its own, rib by rib.
    const twistAt = imported
      ? (y) => {
        const r = imported.explicitRibs;
        const t = Math.abs(y);
        for (let i = 1; i < r.length; i++) {
          if (t <= r[i].station) {
            const f = (t - r[i - 1].station) / ((r[i].station - r[i - 1].station) || 1);
            return r[i - 1].washinDeg + f * (r[i].washinDeg - r[i - 1].washinDeg);
          }
        }
        return r[r.length - 1].washinDeg;
      }
      : (y) => washinAt(y, planform.halfSpan,
        { total: S.washinTotal, mode: S.washinMode, planform });
    // Wing polar at the current atmospheric state. Uses an imported XFOIL
    // section polar when one is loaded, and says which in `polar.source`.
    const sectionSource = XPOLAR || null;

    // The balance and the polar, at a given line drag.
    //
    // Both take the drag of the lines, and it was a number typed into a
    // field — the handbook's 0.020, from a 2012 school wing — whatever lines
    // the plan below actually has. The lineset's own drag is computed from
    // every line's diameter, length and angle to the flow; solving the
    // flight once on the typed figure to get a plan, and again on that
    // plan's own drag, lets a design be flown on its own lines.
    const flightAt = (cxLines) => ({
      balance: solveEquilibrium({
        area: metrics.area,
        span: imported ? imported.flatSpan : S.span,
        chord: imported ? imported.rootChord : S.rootChord,
        lineLength: hangDepthM, lineMass: S.lineMass,
        pilotMass: S.pilotMass, wingMass: S.wingMass,
        // The air the Environment panel describes. The balance had its
        // own typed density beside it — 1.11, which is 1000 m, the default
        // altitude — so moving the altitude slider changed the polar, the
        // Reynolds number and the readout's density, and left the trim
        // speed where it was.
        rho: atm.density, oswald: S.oswald, cxPilot: S.cxPilot, cxLines,
        alphaDeg: S.alphaDeg, cz: S.cz, cx0a: S.cx0a, cm: S.cm,
        legacySpreadsheet: S.legacy,
      }),
      polar: wingPolar({
        planform, airfoil, atm, mass: flightMass,
        area: metrics.area, chordRef: metrics.mac,
        twistAt,
        cxLines, cxPilot: S.cxPilot,
        alphaRange: [-2, 14], step: 1, sectionPolar: sectionSource,
      }),
    });
    let { balance, polar } = flightAt(S.cxLines);
    let cxLinesUsed = S.cxLines;

    // The line catalogue the design is sized from.
    //
    // `DEFAULT_LINE_TABLE` has 21 lines; the catalogue has 78 across four
    // brands, and it was in the repository and unreachable. A workshop buys
    // from one supplier, and the sizing should work from what is on the
    // shelf.
    let lineTable;
    try {
      const cat = parseMaterialsTable(
        typeof LINE_MATERIALS_TSV === 'string' ? LINE_MATERIALS_TSV : '');
      lineTable = S.lineBrand === 'all' ? cat : lineTableFor(cat, { brand: S.lineBrand });
    } catch (e) {
      lineTable = undefined;              // fall back to the built-in table
    }
    const loadsFor = (plan) => analyseLoads({
      plan, planform, stations: wing.stations,
      totalMassKg: flightMass, alphaDeg: S.alphaDeg,
      wingAreaM2: metrics.area, rowShareMode: S.rowShareMode, airfoil,
      anchors: airfoil.anchors,
    });
    // The lines a plan is made of: the catalogue's, sized by load — or, for
    // an imported design, the ones its own file says.
    const selectionFor = (plan, tensions) => (plan.source === 'LEparagliding'
      ? lepLineSelection(tensions, plan)
      : selectLines(tensions, {
        ...(lineTable ? { table: lineTable } : {}),
        strengthBasis: S.lineStrength,
      }));
    const dragOf = (selection) => lineDrag(selection, {
      wingAreaM2: metrics.area, cdCylinder: S.cdCylinder,
    });

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

    const planOptions = {
      // Hang the wing from where it BALANCES, not from an average of the
      // anchor positions.
      //
      // A paraglider's angle of incidence is set by its line lengths, and the
      // point it hangs from is the calage — which `solveEquilibrium` has just
      // computed. Using a geometric centroid instead put the maillon 18.7
      // points of chord too far forward on a typical wing, so the model
      // pitched nose-down against the attitude it would really fly at.
      calageFraction: usableCalage(balance).ok ? balance.calageFraction : null,
      wing, airfoil, layout: RISER_LAYOUTS[S.riserLayout] || RISER_LAYOUTS['A/B/C+D'],
      everyNthRib: 2, lineLengthM: S.lineLength, riserLengthM: riserM,
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
    };
    // An imported design hangs from its OWN suspension, computed as its own
    // program computes it. The Swoop2 used to be given a four-row cascade
    // this tool invented, on a wing that has three rows.
    const lepPlan = imported && LEP.geom?.ok ? lepPlanForTool(LEP.geom) : null;
    let linePlan;
    // The first pass: a plan hung from the balance on the typed line drag,
    // loaded once. It gives each riser its direction, and the lineset its
    // own drag.
    const first = lepPlan || buildLinePlan(planOptions);
    let dirs = null;
    let cxPlan = null;
    try {
      const l0 = loadsFor(first);
      if (!lepPlan) dirs = riserResultants(first, l0.tensions);
      cxPlan = dragOf(selectionFor(first, l0.tensions)).cxLines;
    } catch (e) {
      dirs = null;
    }
    if (S.cxLinesFromPlan && Number.isFinite(cxPlan) && cxPlan > 0) {
      ({ balance, polar } = flightAt(cxPlan));
      cxLinesUsed = cxPlan;
      planOptions.calageFraction = usableCalage(balance).ok ? balance.calageFraction : null;
    }
    if (lepPlan) {
      linePlan = lepPlan;
    } else {
      // Each riser lies along the resultant of its own lines' tension. The
      // plan places the riser tops before any load is known, so it is built
      // once, loaded, and built again with each riser pointed along its
      // resultant. One pass closes it to a fraction of a degree.
      linePlan = (dirs && Object.keys(dirs).length) || cxLinesUsed !== S.cxLines
        ? buildLinePlan({ ...planOptions, ...(dirs && Object.keys(dirs).length ? { riserDirections: dirs } : {}) })
        : first;
    }

    // Ovalization: the extra cloth a panel needs to bulge between its ribs.
    //
    // A flat percentage, or — when asked — what the pressure across the
    // cloth and the tension in it actually produce at the flight state. The
    // second was a checkbox that did nothing: it read `M.pressure`, which
    // nothing ever set, and would have called a function that did not exist
    // if anything had.
    //
    // The pressure across a panel is the cell's own less the air outside it.
    // The cell is fed near the stagnation point, so inside is close to total
    // pressure (Cp 1); outside, thin-aerofoil theory splits the chordwise
    // loading evenly — Cp -dCp/2 on the upper surface and +dCp/2 on the
    // lower — so the upper panel carries (1 + dCp/2) q and the lower
    // (1 - dCp/2) q.
    let billow = null;
    if (S.applyOval && S.ovalFromPressure) {
      const cl = chordwiseLoading(airfoil, S.alphaDeg);
      const qPa = 0.5 * atm.density * balance.speedMS * balance.speedMS;
      // The loading is singular at the nose; a real suction peak is not.
      const dcpAt = (pt) => Math.max(-4, Math.min(4, pt.dcp));
      const across = (f) => cl.points.map((pt) => ({ x: pt.x, cp: Math.max(0, f(dcpAt(pt))) }));
      billow = {
        dynamicPressurePa: qPa,
        upper: { loading: across((d) => 1 + d / 2), tensionNPerM: S.sailTension, dynamicPressurePa: qPa },
        lower: { loading: across((d) => 1 - d / 2), tensionNPerM: S.sailTension, dynamicPressurePa: qPa },
      };
    }
    if (S.applyOval) {
      panels = panels.map((p) => ({
        ...p,
        panel: applyOvalization(p.panel, {
          amount: S.ovalAmount / 100,
          transitions: DEFAULT_TRANSITIONS[p.surface],
          // The rib spacing the membrane needs comes from the panel itself.
          pressure: billow ? billow[p.surface] : null,
        }),
      }));
      if (billow) {
        const ex = panels.map((p) => p.panel.maxExcess).filter(Number.isFinite);
        billow.maxExcess = ex.length ? Math.max(...ex) : 0;
        billow.meanExcess = panels.reduce((a, p) => a + (p.panel.meanExcess || 0), 0)
          / Math.max(1, panels.length);
      }
    }

    const trim = polar.bestGlide || polar.points[polar.points.length - 1];
    const nd = nonDimensional({
      speed: trim ? trim.speed : 10, chord: metrics.mac, atm, span: S.span,
    });
    const thin = thinAirfoil(airfoil);
    const polarIssues = XPOLAR ? checkPolarMatch(XPOLAR, nd) : [];

    // A split A riser: the outboard A anchors on their own riser, which is
    // what a pilot pulls for big ears. Applied after the cascade is built,
    // because the split is a riser change and not a different row.
    const layoutDef = RISER_LAYOUTS[S.riserLayout] || RISER_LAYOUTS['A/B/C+D'];
    // Nylon rods, which hold the nose open when the wing is not pressurised.
    // A rod works in bending, which is the one thing fabric cannot do.
    let rods = null;
    let rodSpecResult = null;
    // An imported design's rods are its own, computed as its program does.
    const ownRods = imported && LEP.joncs && LEP.joncs.joncs.length ? LEP.joncs : null;
    if (S.rods && ownRods) {
      rods = {
        own: true,
        count: ownRods.joncs.length,
        totalM: ownRods.totalM,
        bothSidesM: ownRods.bothSidesM,
        byBloc: ownRods.byBloc,
        rods: ownRods.joncs.map((j) => ({
          rib: j.ribIndex, group: `bloc ${j.bloc}`, bloc: j.bloc, type: j.type,
          lengthM: j.lengthCm / 100,
          // In the rib's own section coordinates, metres.
          points: j.points.map(([u, v]) => [u / 100, v / 100]),
        })),
      };
    } else if (S.rods) {
      // A parametric wing's rods are built the way the Swoop2's program
      // builds its own: a nose rod is one piece round the leading edge.
      let groups;
      if (S.useRodSpec) {
        // Written out, which is the only way to say "and a batten".
        rodSpecResult = parseRodSpec(S.rodSpec, { ribCount: wing.ribs.length });
        groups = rodSpecResult.ok ? rodSpecResult.groups : [];
      } else {
        const lastRib = Math.max(0,
          Math.round((S.rodReach / 100) * (wing.ribs.length - 1)));
        groups = [noseRodGroup({
          upperTo: S.rodUpper / 100, lowerTo: S.rodLower / 100,
          fromRib: 0, toRib: lastRib, diameterMM: Number(S.rodDia),
        })];
      }
      rods = groups.length ? buildRods(wing, { groups }) : null;
    }

    const riserSplit = lepPlan
      ? { moved: 0, riser: null, note: 'the design\'s own risers' }
      : applyRiserSplit(
        linePlan,
        layoutDef.map((r) => (r.splitTo ? { ...r, splitFrom: S.splitFrom / 100 } : r)),
        { halfSpanM: planform.halfSpan },
      );

    // An imported plan carries its own stabilo lines.
    if (S.stabilo && !lepPlan) addStabilo(linePlan, wing, { anchors: 2 });

    // Diagonal ribs carry the span that has no line on it, to the ribs
    // that have one — so they are placed from the lines this plan actually
    // has, row by row, and only once the plan is final.
    //
    // They were built before the plan existed, from every second rib. That
    // is the default plan and no other: a written cascade spreads each row
    // at its own spacing, and the Swoop2 attaches on ribs 2-3, 6-7, 10-11
    // ... and states its own diagonals, 39 of them, which were ignored in
    // favour of 50 this tool invented with their apexes on ribs that carry
    // no line.
    const planAnchors = planAnchorRibs(linePlan);
    const ownDiagonals = imported && LEP.hv ? lepDiagonalPieces(LEP.hv) : [];
    let vribs = { vribs: [], count: 0, totalAreaM2: 0, unsupportedRibs: [], skipped: [], notPlaced: [] };
    if (S.vribs) {
      vribs = buildVRibs({
        wing, airfoil,
        ...(ownDiagonals.length
          ? { placed: ownDiagonals }
          : { rows: S.vribRows.split(''), maxReach: S.vribReach }),
        anchorRibsByRow: planAnchors.byRow,
        baseSpread: S.vribSpread / 100,
        // Below this a diagonal is not worth making. Off by default: it can
        // leave a rib unsupported, and `unsupportedRibs` says so when it does.
        minLengthM: S.vribMinLength / 1000,
      });
      vribs.own = ownDiagonals.length > 0;
    }
    // A rib is held by a line anywhere on it, not only on a row that has
    // diagonals: the stabilo holds the tip ribs. And with the diagonals
    // turned off, every rib without a line has nothing carrying it — which
    // is the point of them, and was reported as no problem at all.
    const linedRibs = new Set(planAnchors.all);
    vribs.unsupportedRibs = (S.vribs ? vribs.unsupportedRibs : wing.ribs.map((_, i) => i))
      .filter((i) => !linedRibs.has(i));
    vribs.lineRibs = planAnchors.all;

    // Loads, which the rib-stress report and the Lines table both read.
    //
    // `M.loads` was referenced in three places and assigned in none, so both
    // of those features silently showed nothing. A field that is only ever
    // read is a feature that was never wired.
    let loads = null;
    let lineSelection = null;
    let lengths = null;
    let lineDragOwn = null;
    try {
      loads = loadsFor(linePlan);
      lineSelection = selectionFor(linePlan, loads.tensions);
      // An imported design's lengths are its own program's: its stretch
      // correction and its loops, which is what a workshop building it cuts
      // to. This tool's length chain is for the plans it generates.
      lengths = linePlan.source === 'LEparagliding'
        ? lepLengthChain(lineSelection, linePlan, { measurementDaN: S.measureTension })
        : lengthChain(lineSelection, {
          loopAllowanceMM: S.loopAllowance,
          measurementDaN: S.measureTension,
        });
      // The drag of the lines actually in the plan, which is what the
      // balance flies on when it is asked to, and is shown beside the typed
      // figure when it is not.
      lineDragOwn = dragOf(lineSelection);
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

    // The whole machine as one body in steady glide: does the wing the tool
    // DRAWS hang where the balance says it balances, and at what attitude
    // and incidence does its geometry put it? Computed since the free-body
    // work and shown nowhere.
    let freeBody = null;
    try {
      freeBody = freeBodyCheck({
        wing, linePlan, balance,
        pilotMassKg: S.pilotMass, wingMassKg: S.wingMass, lineMassKg: S.lineMass,
      });
    } catch (e) {
      freeBody = { ok: false, problems: [e.message], note: e.message };
    }

    M = {
      planform, lobe, airfoil, wing, metrics, lobeM, projArea,
      panels, balance, worstDev, worstPhi, imported, vribs,
      hangDepthM, riserM, freeBody, lineDragOwn, cxLinesUsed, billow,
      linePlan, loads, lineSelection, lengths, riserSplit, rods,
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
    ensureNest();
    drawCut();
    // The comparison waits for the layout's cloth figures, as the view does.
    drawComparison();
  }, 180);
}

/**
 * The cutting layout: the panels as they are CUT, laid out once.
 *
 * The view nested the bare panels and every export nested them again with
 * their seam allowance on, so the layout on screen was not the layout in the
 * file, and the roll length under it was for cloth with no seams — 10 mm a
 * side short on every panel. The bill of materials then took its areas from
 * one and its roll length from the other.
 *
 * One layout now, of the seamed panels, made when it is first needed after a
 * change and handed to the view, the exports and the bill alike.
 */
function ensureNest() {
  if (M.nested && !M.nestStale) return M.nested;
  try {
    const opts = { rollWidth: S.rollWidth, gap: S.panelGap / 100 };
    const cut = seamed();
    M.nested = nestPanels(cut, opts);
    M.fabric = fabricEstimate(cut, { ...opts, nested: M.nested });
    // The gap, measured on the layout rather than assumed from the setting.
    M.fabric.clearanceM = nestingClearance(M.nested);
    M.fabricError = null;
  } catch (e) {
    M.nested = null; M.fabric = null; M.fabricError = e.message;
  }
  M.nestStale = false;
  return M.nested;
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
  inp._field = wrap;
  inp._key = key;
  return inp;
}

/**
 * A typed number, with a step — or with a minimum, a maximum and a step.
 *
 * It took a step and nothing else, and twenty-one of its twenty-seven
 * callers passed `(min, max, step)`. The minimum arrived as the step and the
 * other two were dropped: the karabiner separation stepped in twenties, the
 * line drag coefficient in 0.8s, half the fields had a step of zero, and
 * none of them had the limits their callers wrote down. An empty field was
 * read as NaN and rebuilt the wing with it.
 */
function numberField(host, key, label, a = 0.01, b = null, c = null) {
  const ranged = b != null;
  const step = ranged ? (c ?? 1) : a;
  const wrap = el('div', 'field row');
  const lab = el('label', null, label);
  const inp = el('input');
  inp.type = 'number'; inp.step = step; inp.value = S[key];
  if (ranged) { inp.min = a; inp.max = b; }
  inp.setAttribute('aria-label', label);
  inp.addEventListener('change', () => {
    let v = parseFloat(inp.value);
    // Not a number: put back what was there rather than build on NaN.
    if (!Number.isFinite(v)) { inp.value = S[key]; return; }
    if (ranged) v = Math.min(b, Math.max(a, v));
    inp.value = v;
    S[key] = v;
    rebuild();
  });
  wrap.append(lab, inp);
  host.append(wrap);
  inp._field = wrap;
  inp._key = key;
  return inp;
}

function selectField(host, key, label, options) {
  const wrap = el('div', 'field row pick');
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
  sel._field = wrap;
  sel._key = key;
  return sel;
}

function checkField(host, key, label) {
  const l = el('label', 'check');
  const inp = el('input'); inp.type = 'checkbox'; inp.checked = S[key];
  // The panel is rebuilt as well as the wing: half of what a checkbox turns
  // on is more controls — the cascade text, the rod spec, the diagonal
  // sliders — and without this they stayed hidden until some unrelated
  // select happened to redraw the panel.
  inp.addEventListener('change', () => { S[key] = inp.checked; rebuild(); buildControls(); });
  l.append(inp, document.createTextNode(label));
  host.append(l);
  inp._field = l;
  inp._key = key;
  return inp;
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
  ta._field = l;
  ta._key = key;
  return ta;
}

function button(host, text, fn, cls = 'btn') {
  const b = el('button', cls, text);
  b.addEventListener('click', fn);
  host.append(b);
  return b;
}

function hint(host, text) { host.append(el('div', 'hint', text)); }

/**
 * A hint that quotes the model, kept true.
 *
 * A plain hint is written once, when the panel is built. Four of them quoted
 * the model — whether a written cascade or rod spec was accepted, how short
 * the shortest diagonal is, what the billow comes to — and only a checkbox
 * or a select rebuilds the panel. So a designer could type a cascade the
 * parser rejects, tab out of the box, and be shown the note from the cascade
 * before it: the wing quietly went back to the rules, under a line saying
 * the written one was in use.
 *
 * These are re-evaluated on every rebuild. One that has nothing to say is
 * taken off the panel rather than left as an empty line.
 */
const LIVE_HINTS = [];
function liveHint(host, fn) {
  const d = el('div', 'hint', '');
  host.append(d);
  LIVE_HINTS.push({ d, fn });
  refreshHints();
  return d;
}
function refreshHints() {
  for (const h of LIVE_HINTS) {
    let text = '';
    try { text = h.fn() || ''; } catch (e) { text = ''; }
    if (h.d.textContent !== text) h.d.textContent = text;
    h.d.style.display = text ? '' : 'none';
  }
}

/**
 * Take a control off the panel, label and all.
 *
 * For a setting that does not apply to the wing on the page: a disabled
 * slider still shows a number, and a number that describes nothing is worse
 * than no control.
 */
function hideField(inp) {
  if (!inp) return;
  inp.disabled = true;
  (inp._field || inp).style.display = 'none';
}

function buildControls() {
  LIVE_HINTS.length = 0;
  const P = clear('g-planform');
  if (REFERENCE_LIB.length) {
    const haveSwoop = typeof SWOOP2_LEP === 'string' && SWOOP2_LEP.length > 0;
    selectField(P, 'reference', 'Start from a published wing',
      [['', '—']]
        .concat(haveSwoop ? [[SWOOP2_ID, SWOOP2_ID]] : [])
        .concat(REFERENCE_LIB.map((e) => [e.id, `${e.id}  ${e.flatArea} m²`])));
    const families = new Set(REFERENCE_LIB.map((e) => e.family)).size;
    hint(P, `${REFERENCE_LIB.length} published sizes across ${families} `
      + 'families, which load the SIZE only: a specification does not say how '
      + 'elliptical the leading edge is, or what section the wing uses. '
      + (haveSwoop
        ? 'The Swoop2 at the top is different — a complete design, geometry '
          + 'and all.'
        : ''));
  }
  slider(P, 'isoAz', 'Isometric — azimuth', -180, 180, 5, (v) => v.toFixed(0), '°');
  slider(P, 'isoEl', 'Isometric — elevation', -80, 80, 5, (v) => v.toFixed(0), '°');
  checkField(P, 'isoLines', 'Lines in the isometric view');
  checkField(P, 'dimensions', 'Dimensions on the drawings');
  // What the chosen wing is, and what it brings. This note was composed on
  // every load and shown nowhere.
  if (S._referenceNote) hint(P, S._referenceNote);
  // An imported design's planform is its own: these sliders do nothing to
  // it, so they are shown disabled rather than left to be moved in vain.
  //
  // The four that describe any wing — span, root and tip chord, cells — stay
  // on view, disabled, holding the design's values. The ones that only
  // parametrise a planform (sweep, ellipticity, rib spacing) mean nothing
  // for a wing given rib by rib, so they are not shown at all.
  const locked = !!LEP?.design;
  const lockable = [
    slider(P, 'span', 'Flat span', 4, 16, 0.05, (v) => v.toFixed(2), ' m'),
    slider(P, 'rootChord', 'Root chord', 0.8, 4, 0.01, (v) => v.toFixed(2), ' m'),
    slider(P, 'tipChord', 'Tip chord', 0.1, 2.5, 0.01, (v) => v.toFixed(2), ' m'),
  ];
  const parametricOnly = [
    slider(P, 'tipSweep', 'Tip sweep back', 0, 3, 0.01, (v) => v.toFixed(2), ' m'),
    slider(P, 'ellipticityLE', 'Leading edge — elliptical', 0, 1, 0.01, (v) => (v * 100).toFixed(0), '%'),
    slider(P, 'ellipticityTE', 'Trailing edge — elliptical', 0, 1, 0.01, (v) => (v * 100).toFixed(0), '%'),
  ];
  lockable.push(
    checkField(P, 'centreRib', 'Rib on the centreline (off = centre cell)'),
    slider(P, 'cells', 'Full cells each side', 4, 40, 1, (v) => v.toFixed(0)),
  );
  if (locked) {
    for (const inp of lockable) inp.disabled = true;
    for (const inp of parametricOnly) hideField(inp);
    hint(P, `${LEP.design.name}: ${LEP.design.cells} cells, `
      + `${LEP.design.flatSpan.toFixed(2)} m span, ${LEP.design.rootChord.toFixed(3)} m root `
      + 'chord — from the file. Choose "—" above to return to a parametric wing.');
  } else {
    hint(P, `${S.centreRib ? S.cells * 2 : S.cells * 2 + 1} cells across the `
      + `wing. A centre cell straddles the centreline, which is how a wing gets `
      + `an odd count — the Alpina 5 and Lynx 2 have 65.`);
  }
  // Where the ribs go. A cell is something somebody sews, so the choice is
  // about cloth: all the same width, or narrowing towards the tip as the
  // chord does. 'Sine' is only offered to a design that was saved with it.
  const widthRules = [['chord', 'Follow the chord'], ['uniform', 'All the same']];
  if (S.distribution === 'cosine') widthRules.push(['cosine', 'Sine rule (old)']);
  const spacing = selectField(P, 'distribution', 'Cell widths', widthRules);
  const taper = slider(P, 'cellTaper', 'How far they follow it', 0, 100, 5, (v) => v.toFixed(0), '%');
  if (locked) { hideField(spacing); hideField(taper); }
  else if (S.distribution !== 'chord') hideField(taper);
  liveHint(P, cellWidthNote);

  const A = clear('g-airfoil');
  const naca = selectField(A, 'airfoilCode', 'NACA 4-digit', [
    ['4415', 'NACA 4415'], ['4412', 'NACA 4412'],
    ['2414', 'NACA 2414'], ['4418', 'NACA 4418'], ['0012', 'NACA 0012'],
  ]);
  hint(A, 'Or load a coordinate file in Selig or plain "x y" format — the sections linked from the handbook work directly.');
  const imp = el('input'); imp.type = 'file'; imp.accept = '.dat,.txt,.csv';
  imp.style.fontSize = '10px'; imp.style.color = 'var(--text-dim)';
  imp.addEventListener('change', async () => {
    const f = imp.files[0]; if (!f) return;
    try {
      const text = await f.text();
      // A section file an imported design names goes to that design.
      if (LEP?.design?.airfoilFiles?.includes(f.name)) {
        loadLepDesign(LEP.doc, { ...LEP.texts, [f.name]: text });
        buildControls(); rebuild();
        return;
      }
      S.airfoilCustom = parseAirfoilText(text, f.name);
      setStatus(null); rebuild();
    } catch (e) { setStatus(`Could not read ${f.name}: ${e.message}`); }
  });
  A.append(imp);
  if (S.airfoilCustom) {
    button(A, 'Clear imported section', () => { S.airfoilCustom = null; rebuild(); buildControls(); });
  }
  const sectionOnly = [
    slider(A, 'reflex', 'Reflex (TE rise)', 0, 3, 0.05, (v) => v.toFixed(2), '% c'),
    slider(A, 'reflexStart', 'Reflex begins at', 40, 90, 1, (v) => v.toFixed(0), '% c'),
  ];
  if (!locked) hint(A, 'Reflex raises the trailing edge of the camber line, trading lift for a positive pitching moment — the section stabilises its own angle of attack instead of tucking.');
  const fromFile = [
    slider(A, 'intakeStart', 'Intake starts', 0, 8, 0.1, (v) => v.toFixed(1), '% c'),
    slider(A, 'intakeEnd', 'Intake ends', 0.5, 15, 0.1, (v) => v.toFixed(1), '% c'),
  ];
  const anchorSliders = {
    A: slider(A, 'anchorA', 'Anchor A', 2, 20, 0.1, (v) => v.toFixed(1), '% c'),
    B: slider(A, 'anchorB', 'Anchor B', 15, 45, 0.1, (v) => v.toFixed(1), '% c'),
    C: slider(A, 'anchorC', 'Anchor C', 40, 70, 0.1, (v) => v.toFixed(1), '% c'),
    D: slider(A, 'anchorD', 'Anchor D', 60, 95, 0.1, (v) => v.toFixed(1), '% c'),
  };
  if (locked) {
    // The design's own sections, intake and anchor rows. A row the design
    // does not have is not shown: a three-line wing has no D.
    const own = LEP.design.anchorFractions ?? {};
    hideField(naca);
    for (const inp of sectionOnly) hideField(inp);
    for (const inp of fromFile) inp.disabled = true;
    for (const [row, inp] of Object.entries(anchorSliders)) {
      if (Number.isFinite(own[row]) && own[row] > 0) inp.disabled = true;
      else hideField(inp);
    }
    const files = [...new Set((LEP.design.explicitRibs ?? [])
      .map((r) => r.airfoilFile).filter(Boolean))];
    hint(A, `Sections from the design: ${files.join(', ') || 'none named'}`
      + (LEP.design.missingSections?.length
        ? ` — ${LEP.design.missingSections.join(', ')} not yet loaded.`
        : '. Intake and anchor rows as the file gives them, at the root rib.'));
  }

  const L = clear('g-lobe');
  if (locked) {
    // The arc, washin, yaw and rotation points are the file's, rib by rib:
    // there is no arc shape to choose and nothing to rotate about.
    const r = LEP.design.explicitRibs ?? [];
    const tip = r[r.length - 1] ?? {};
    const maxWash = r.length ? Math.max(...r.map((q) => Math.abs(q.washinDeg ?? 0))) : 0;
    const maxYaw = r.length ? Math.max(...r.map((q) => Math.abs(q.zetaDeg ?? 0))) : 0;
    hint(L, `Arc, washin, yaw and rotation points are ${LEP.design.name}'s own, `
      + `rib by rib: projected span ${(LEP.design.projectedSpan ?? 0).toFixed(2)} m, `
      + `tip dihedral ${(tip.betaDeg ?? 0).toFixed(1)}°, washin up to `
      + `${maxWash.toFixed(2)}°, yaw up to ${maxYaw.toFixed(1)}°.`);
  } else {
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
  selectField(L, 'zRotation', 'Align ribs to flow', [
    ['none', 'Off — ribs parallel'], ['auto', 'On — yaw onto glide path'],
  ]);
  hint(L, 'With the arc, outboard ribs tilt away from the airflow. Yawing each rib about the vertical brings its plane back onto the glide path (Laboratori d\u2019envol, 2021).');
  slider(L, 'RL', 'Reference line', 0.1, 0.9, 0.01, (v) => (v * 100).toFixed(0), '% c');
  slider(L, 'RP', 'Rotation point', 0.0, 0.9, 0.01, (v) => (v * 100).toFixed(0), '% c');
  hint(L, 'The reference line is the chord point laid along the arc; the rotation point is what washin turns about.');
  }

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
  numberField(B, 'oswald', 'Oswald e', 0.01);
  numberField(B, 'cxPilot', 'Cx pilot', 0.001);
  numberField(B, 'cxLines', 'Cx lines', 0.001);
  checkField(B, 'cxLinesFromPlan', 'Fly on the drag of the lines in the plan');
  hint(B, 'Typed, the line drag is the handbook\u2019s 0.020 whatever lines the '
    + 'plan has. Ticked, it is computed from every line\u2019s diameter, length '
    + 'and angle to the flow, and the balance and polar are solved again on it. '
    + 'Air density comes from Environment.');
  checkField(B, 'legacy', 'Match the 2012 example sheet');
  hint(B, 'The default applies the moment equation as published in 4.2. The checkbox drops the aerodynamic and wing-drag moments, which is what the handbook\u2019s own worked example does.');
  const balanceHost = el('div');
  balanceHost.id = 'balanceTable';
  B.append(balanceHost);
  // A change, read against the design before it. `compareDesigns` was in the
  // core and the suite and nowhere a designer could reach it.
  button(B, 'Remember this design for comparison', () => {
    ensureNest();
    REMEMBERED = { name: S.name, at: new Date().toISOString().slice(11, 16), summary: designSummary() };
    buildControls();
    drawSideTables();
    setStatus(null, 'Design remembered: the Balance panel compares every change against it.');
  }, 'btn');
  if (REMEMBERED) {
    button(B, 'Forget the remembered design', () => {
      REMEMBERED = null;
      buildControls();
      drawSideTables();
    }, 'btn');
  }
  const compareHost = el('div', 'compare');
  compareHost.id = 'compareTable';
  B.append(compareHost);

  // Lines and risers: what the cascade is made of.
  const LN = clear('g-lines');
  if (locked && LEP.geom?.ok) {
    const g = LEP.geom;
    const types = Object.values(g.totals.byType ?? {}).filter((t) => t.type !== 1);
    hint(LN, `${g.totals.linesPerSide} lines on ${g.totals.risersPerSide} risers a side; `
      + `${g.totals.cutM.toFixed(2)} m of line to cut for the whole wing, `
      + `${g.totals.withLoopsM.toFixed(2)} m with loops`
      + (types.length ? ` (${types.map((t) => `${t.metres.toFixed(2)} m of ${t.label}`).join(', ')})` : '')
      + `; ${g.totals.weightKg.toFixed(3)} kg and ${g.totals.lineAreaM2.toFixed(3)} m² of `
      + `frontal area with the risers; line length `
      + `${(g.lineLengthCm / 100).toFixed(2)} m and risers `
      + `${(g.riserLengthCm / 100).toFixed(2)} m`
      + (Number.isFinite(LEP.design.karabinerM)
        ? `, karabiners ${(LEP.design.karabinerM * 100).toFixed(0)} cm apart` : '')
      + ' — computed as '
      + 'its program computes them, so the riser layout and cascade settings '
      + 'of a parametric wing do not apply.');
  }
  if (!locked || !LEP.geom?.ok) {
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
  // With the lines, where a designer looks for it. It sat in "Arc & twist",
  // between the washin and the rib yaw, from the day the groups were split.
  selectField(LN, 'mergeRows', 'Merge line rows', [
    ['none', 'None'], ['AB', 'A and B'], ['CD', 'C and D'], ['AB+CD', 'A+B and C+D'],
  ]);
  hint(LN, 'Two rows can share their cascade below the top lines. Fewer lines and less drag, at the cost of thicker merged lines.');
  checkField(LN, 'useCascadeSpec', 'Write the cascade out, rather than deriving it');
  if (S.useCascadeSpec) {
    textAreaField(LN, 'cascadeSpec', 'Cascade', 6,
      'A 30 14 3\nB 14  6 4\nC  8  3 2');
    hint(LN, 'Row, then anchors, then the count at each level below — the way '
      + 'a manufacturer sheet reads. Lines starting # are comments.');
    liveHint(LN, () => (!M.writtenCascade ? ''
      : M.writtenCascade.ok ? M.writtenCascade.note
        : `Not used: ${M.writtenCascade.problems[0]}`));
  }
  // The derived plan attaches every second rib, whatever the wing. That is a
  // real wing's density on the default wing (13 of 25 ribs; real wings run
  // 0.28 to 0.94, median 0.54) and nothing like one on a published wing
  // loaded from the picker: a Zeno 2 S came out with 466 m of line against
  // its published 186. This solves the anchor counts to a line total the way
  // the full-pipeline validation does, inside the densities real wings use,
  // and writes them out as a cascade the designer can see and edit.
  button(LN, 'Solve anchors to the line length', () => {
    if (M.imported) { setStatus('An imported design keeps its own lines.'); return; }
    const layout = RISER_LAYOUTS[S.riserLayout] || RISER_LAYOUTS['A/B/C+D'];
    const rows = [...new Set(layout.flatMap((r) => r.rows))]
      .filter((r) => Number.isFinite(M.airfoil?.anchors?.[r]));
    const risers = layout.filter((r) => r.rows.length).length;
    const published = S.reference && !M.imported ? S._referenceTotalLineM : null;
    const target = published
      ?? lineConsumptionEstimate({
        aspectRatio: M.metrics.aspectRatio, flatSpan: M.metrics.span, risers,
      }).totalLineLengthM;
    // The stabilo lines are added to the plan after it is built, and their
    // length hardly depends on the anchors, so they come off the target the
    // anchors are solved to. Left in, the plan came out 5% over.
    const stabiloM = (M.linePlan?.stabilo?.lines ?? [])
      .reduce((a, l) => a + (2 * l.lengthMM) / 1000, 0);
    const solved = anchorsForLineLength({
      wing: M.wing, airfoil: M.airfoil, rows, targetMetres: target - stabiloM, layout,
      lineLengthM: S.lineLength, risers, mainsPerRow: 3,
      brakes: S.brakeLines ? { anchors: 13, levelCounts: [6, 3, 1] } : null,
    });
    const basis = published
      ? `the published ${published} m`
      : `${target.toFixed(0)} m, what real wings of this aspect ratio and span carry`;
    // At the edge of the range, said in the target's own terms (the solve
    // saw it without the stabilo). On three or more risers a two-liner's
    // total is below what the layout carries at the sparsest real density,
    // and the answer is the layout.
    const [lo, hi] = solved.reachableRange.map((x) => x + stabiloM);
    // Within 5% of the target the edge is not worth a warning: the
    // aspect-ratio law itself is good to about 7%, and a published total is
    // rounded. A school wing came out 1% short of the law and was told to try
    // two risers.
    const missed = Math.abs(solved.error) > 0.05;
    const edge = !missed ? null : solved.saturatedSide === 'under'
      ? `that is less than this layout carries at the sparsest real density, ${lo.toFixed(0)} m: `
        + 'it needs fewer rows or fewer risers, not fewer anchors'
        + (risers > 2 ? '; a two-riser layout (A/B+C) carries less' : '')
      : solved.saturatedSide === 'over'
        ? `that is more than this wing carries at the densest, ${hi.toFixed(0)} m: it needs more ribs`
        : null;
    S.cascadeSpec = [
      `# Solved to ${basis}: front density ${solved.frontFraction.toFixed(2)}.`,
      ...(edge ? [`# ${edge[0].toUpperCase()}${edge.slice(1)}.`] : []),
      ...rows.map((r) => {
        const n = solved.anchorsPerRow[r];
        return `${r} ${n} ${Math.min(3, n)}`;
      }),
    ].join('\n');
    S.useCascadeSpec = true;
    buildControls();
    rebuild();
    setStatus(null, `Anchors solved to ${basis}: `
      + rows.map((r) => `${r}${solved.anchorsPerRow[r]}`).join(' ')
      + `, ${M.linePlan.totalLengthM.toFixed(0)} m built`
      + (edge ? ` — ${edge}.` : ''));
  }, 'btn');
  numberField(LN, 'karabinerSep', 'Karabiner separation (cm)', 20, 70, 1);
  }
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
  // The cascade, line by line, and the diff against a real wing when one is
  // chosen above.
  hint(LN, 'Every line of the plan, with its length and load. Filter it with '
    + '"highlight row" above.');
  const cascadeHost = el('div');
  cascadeHost.id = 'cascadeTable';
  LN.append(cascadeHost);

  // Internal structure: what is inside the wing.
  const IN = clear('g-internal');
  checkField(IN, 'ribHoles', 'Rib openings (lightening and cross-flow)');
  liveHint(IN, openingsNote);
  checkField(IN, 'showIntake', 'Cell intake against where the flow stagnates');
  hint(IN, 'Shown on the rib. Air enters at total pressure only where the '
    + 'flow stagnates, and that point runs aft along the lower surface as '
    + 'the wing is flown slower and forward to the nose on the bar. The '
    + 'opening is the section\u2019s own (Section: intake starts, ends), and '
    + 'the rib note says what it is fed at across the speed range.');
  checkField(IN, 'rods', 'Nylon rods');
  // An imported design's rods are its own, computed as its program computes
  // them. The six controls that would place this tool's rods were left on
  // the panel beside them and did nothing at all.
  const ownRods = !!(LEP?.design && LEP.joncs && LEP.joncs.joncs.length);
  if (S.rods && ownRods) {
    liveHint(IN, () => {
      const r = M.rods;
      if (!r || !r.own) return '';
      const blocs = Object.entries(r.byBloc || {})
        .map(([b, x]) => `bloc ${b}: ${x.count} of ${(x.totalM / x.count * 100).toFixed(0)} cm on average`);
      return `The design's own: ${r.count} rods a side, ${r.totalM.toFixed(2)} m `
        + `(${r.bothSidesM.toFixed(2)} m for both sides), as its program lays them out `
        + `from section 21${blocs.length ? ` — ${blocs.join('; ')}` : ''}. Drawn on the Rib tab.`;
    });
  }
  if (S.rods && !ownRods) {
    checkField(IN, 'useRodSpec', 'Write the rods out, rather than one nose rod');
  }
  if (S.rods && !ownRods && S.useRodSpec) {
    textAreaField(IN, 'rodSpec', 'Rods', 4,
      'nose|batten  zone zone  zone zone  dia  [fromRib toRib]');
    hint(IN, 'One group to a line, in per cent of chord, as LEP section 21 '
      + 'states them. "nose 12 18.5 7 15 1.5": one piece from 18.5% on top, '
      + 'round the nose, to 15% underneath, leaving the surface from 12% and '
      + 'from 7%. "batten 23.5 29.5 63 70 1.5": along the top from 23.5% to '
      + '70%. Then the diameter in mm and, if not every rib, the first and '
      + 'last rib counted from 0 at the centre. The two lines there to begin '
      + 'with are the Swoop2’s own rods.');
  }
  if (S.rods && !ownRods && !S.useRodSpec) {
    numberField(IN, 'rodUpper', 'Nose rod back to, on top (% chord)', 5, 60, 0.5);
    numberField(IN, 'rodLower', 'and underneath (% chord)', 3, 40, 0.5);
    selectField(IN, 'rodDia', 'Rod diameter (mm)',
      [['1.1', '1.1'], ['1.3', '1.3'], ['1.5', '1.5'], ['2', '2.0'], ['2.5', '2.5']]);
    slider(IN, 'rodReach', 'Rods out to', 20, 100, 5, (v) => v.toFixed(0), '% span');
  }
  // What the rods come to, kept true: how many, how long, what they weigh,
  // and whether any crosses an opening in its rib.
  if (S.rods && !ownRods) liveHint(IN, rodSummary);
  checkField(IN, 'vribs', 'Diagonal ribs');
  // What they come to on this wing: how many, whether each is in tension,
  // buildable, and held from both sides — and, with them off, what that
  // leaves hanging on nothing.
  liveHint(IN, structureSummary);
  if (S.vribs) {
    const own = !!(M.vribs && M.vribs.own);
    if (own) {
      // The design's own. Which rows and how far they reach are the file's
      // to say, so the two controls that decide them are not offered.
      hint(IN, 'Placed where the file puts them (section 12) — which rib, '
        + 'which row, which neighbour. The file also gives each one a shape '
        + 'in four numbers this tool does not read, so the base width below '
        + 'is the tool\'s, not the design\'s.');
    } else {
      selectField(IN, 'vribRows', 'Diagonals on rows', [
        ['ABCD', 'all rows'], ['ABC', 'A, B, C'], ['AB', 'A, B'],
        ['BC', 'B, C'], ['A', 'A'], ['B', 'B'], ['C', 'C'],
      ]);
      slider(IN, 'vribReach', 'Diagonal reach', 1, 3, 1, (v) => `${v} cell${v > 1 ? 's' : ''}`);
      hint(IN, 'A diagonal runs from a rib with a line to a neighbour without '
        + 'one, so where they go follows the line plan. One cell is enough '
        + 'while no two lined ribs are more than three cells apart; a sparser '
        + 'cascade needs a longer reach, and the status line counts the ribs '
        + 'left with nothing holding them.');
    }
    selectField(IN, 'vribView', 'Structure view: draw row', [
      ['all', 'all rows'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'],
    ]);
    slider(IN, 'vribSpread', 'Diagonal base width', 6, 40, 1, (v) => v.toFixed(0), '% c');
    numberField(IN, 'vribMinLength', 'Skip diagonals shorter than (mm)', 0, 400, 10);
    liveHint(IN, () => {
      const short = M.vribs && M.vribs.count
        ? Math.min(...M.vribs.vribs.map((v) => v.lengthM)) * 1000 : null;
      return 'Diagonals shrink with the cells and the section towards the tip'
        + (short != null ? ` — the shortest here is ${short.toFixed(0)} mm` : '')
        + ', and a triangle too small to mark and sew adds seams and carries '
        + 'almost nothing. Skipping the short ones can leave a rib with '
        + 'nothing holding it; the status line says when it does. 0 places '
        + 'them all.'
        + (M.vribs && M.vribs.skipped && M.vribs.skipped.length
          ? ` ${M.vribs.skipped.length} skipped a side.` : '');
    });
  }

  // Panels and cutting.
  const N = clear('g-panels');
  checkField(N, 'ovalFromPressure', 'Billow from pressure, not a flat amount');
  if (S.ovalFromPressure) {
    liveHint(N, () => (M.billow
      ? `At ${M.billow.dynamicPressurePa.toFixed(0)} Pa of dynamic pressure and `
        + `${S.sailTension} N/m of tension across the cell (Assumptions), the panels `
        + `take up to ${(M.billow.maxExcess * 100).toFixed(1)}% more cloth than their `
        + `flat width, ${(M.billow.meanExcess * 100).toFixed(1)}% on average. `
        + 'The flat amount below is not used.'
      : 'Turn on ovalization below for this to apply.'));
  }
  selectField(N, 'paper', 'Printable pattern paper', [
    ['A4', 'A4 portrait'], ['A4L', 'A4 landscape'],
    ['A3', 'A3 portrait'], ['A3L', 'A3 landscape'],
  ]);
  checkField(N, 'marks', 'Registration marks on panels');
  hint(N, 'Notches, grain arrows and panel labels. Notches pair at equal fractions of each seam, so the ease ovalization leaves is spread evenly.');
  checkField(N, 'applyOval', 'Add ovalization');
  slider(N, 'ovalAmount', 'Total widening', 0, 12, 0.1, (v) => v.toFixed(1), '%');
  slider(N, 'seamAllowance', 'Seam allowance', 0, 25, 1, (v) => v.toFixed(0), ' mm');
  slider(N, 'pointsPerSurface', 'Points per surface', 20, 120, 5, (v) => v.toFixed(0));
  hint(N, 'Along each surface of every rib, clustered at the nose where the '
    + 'section curves most. Ribs are cut along these points and panels '
    + 'developed along them: at 50 a 2.6 m rib holds its section to about '
    + 'half a millimetre.');
  slider(N, 'rollWidth', 'Fabric roll width', 0.8, 2.0, 0.01, (v) => v.toFixed(2), ' m');
  slider(N, 'panelGap', 'Gap between panels', 0, 10, 0.5, (v) => v.toFixed(1), ' cm');

  // Assumptions: values that were constants inside the model.
  // A size family from this design.
  const FM = clear('g-family');
  if (LEP?.design) {
    // The family is scaled from the parametric planform. Five fields that
    // set its range stood here on an imported design, for a button that
    // refuses one.
    hint(FM, `${LEP.design.name} is an imported design: its sizes are made in `
      + 'its own program, by the scale factor in section 1. The size family '
      + 'here scales a parametric wing — choose "—" under Planform to return '
      + 'to one.');
  } else {
    hint(FM, 'This design at other sizes: flat areas spread evenly from the '
      + 'smallest to the largest, each flown at its own all-up mass, with the '
      + 'line height scaled with the wing. Set the range and press Size family '
      + 'under Files.');
    numberField(FM, 'famCount', 'Number of sizes', 2, 8, 1);
    numberField(FM, 'famSmallest', 'Smallest flat area (m2)', 8, 40, 0.5);
    numberField(FM, 'famLargest', 'Largest flat area (m2)', 8, 45, 0.5);
    numberField(FM, 'famLoadLo', 'All-up mass, smallest (kg)', 40, 200, 1);
    numberField(FM, 'famLoadHi', 'All-up mass, largest (kg)', 40, 250, 1);
  }

  const AS = clear('g-assume');
  hint(AS, 'Each of these was a fixed constant in a core module. They are '
    + 'design decisions rather than facts, so each is yours to set — and each '
    + 'is checked to change the exported files, not just the screen.');
  // A wing is not made of one cloth. The nose takes a harder finish than the
  // rest of the upper surface, and the ribs a different weave again.
  const clothNames = Object.keys(CLOTH).map((k) => [k, k]);
  selectField(AS, 'clothLE', 'Leading edge cloth', clothNames);
  numberField(AS, 'noseClothTo', 'Leading edge cloth to (% chord)', 0, 50, 1);
  selectField(AS, 'clothUpper', 'Upper surface cloth', clothNames);
  selectField(AS, 'clothLower', 'Lower surface cloth', clothNames);
  selectField(AS, 'clothRib', 'Rib and diagonal cloth', clothNames);
  hint(AS, 'What the bill of materials weighs the wing in. The nose must hold '
    + 'its shape unpressurised, so it takes a hard finish over the first part '
    + 'of the upper surface; the ribs work in tension across their depth '
    + 'rather than as a bulging membrane. The panels are drawn in one piece: a '
    + 'nose in its own cloth needs a seam at that station, which the cutting '
    + 'files do not have.');
  // What the schedule as chosen has to say for itself.
  liveHint(AS, () => {
    const f = fabricSchedule({
      leadingEdge: S.clothLE, upperSail: S.clothUpper,
      lowerSail: S.clothLower, rib: S.clothRib, diagonal: S.clothRib,
    });
    if (!f.ok) return `Not usable: ${f.problems[0]}`;
    return f.warnings.length
      ? `To look at: ${f.warnings.join('; ')}.`
      : '';
  });

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
  numberField(AS, 'objLineScale', '3D line thickness x true', 1, 50, 1);
  hint(AS, 'The 3D model carries the lines at their real diameter, so at a '
    + 'whole-wing view they are about a twenty-thousandth of the span and you '
    + 'have to zoom in to see them — which is what a paraglider looks like. '
    + 'Raise this only if you want a picture rather than a model; the file '
    + 'header states whatever was used.');
  numberField(AS, 'maxLineTypes', 'Line types to stock at most', 1, 10, 1);
  hint(AS, 'A workshop cannot stock twenty diameters. Four types typically '
    + 'cost under half a per cent of drag against a different line at every '
    + 'anchor — press Line set & trim under Files to see the trade.');
  numberField(AS, 'serviceHours', 'Line set service life (hours)', 50, 400, 10);
  selectField(AS, 'lineStrength', 'Size lines on', [
    ['kinked', 'kinked strength (conservative)'],
    ['new', 'new strength'],
  ]);
  if (LEP?.design && LEP.geom?.ok) {
    // Its loops are its own: each line type states one, and the lengths to
    // cut are the program's. A typed allowance was offered and ignored.
    hint(AS, 'Loop allowances are the design\'s own — each of its line types '
      + 'states one (section 34) — so none is set here.');
  } else {
    numberField(AS, 'loopAllowance', 'Loop allowance per line (mm)', 0, 300, 5);
    liveHint(AS, () => {
      const n = M.linePlan ? M.linePlan.lines.length * 2 : 0;
      return n
        ? `Material, not rounding: ${S.loopAllowance} mm over ${n} lines is `
          + `${(S.loopAllowance * n / 1000).toFixed(1)} m of cord.`
        : 'Material, not rounding.';
    });
  }
  numberField(AS, 'measureTension', 'Length measuring tension (daN)', 1, 15, 0.5);
  hint(AS, 'The PMA measures at 5 daN. That exceeds the 1 g load on every '
    + 'line, so a reference length is longer than a flying length.');
  selectField(AS, 'rowShareMode', 'Row load shares from', [
    ['convention', 'the handbook convention'],
    ['pressure', 'the section pressure distribution'],
  ]);
  numberField(AS, 'cdCylinder', 'Line drag coefficient', 0.8, 1.4, 0.05);
  numberField(AS, 'sailTension', 'Sail tension across the cell (N/m)', 5, 500, 1);
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
  button(grid, 'Ribs DXF', () => save(`${S.name}-ribs.dxf`, ribsToDXF(M.wing, { features: ribFeatures })), 'btn');
  button(grid, 'Panels DXF', () => save(`${S.name}-panels.dxf`,
    S.marks
      ? markedPanelsToDXF(seamed(), {
        rollWidth: S.rollWidth, gap: S.panelGap / 100, nested: ensureNest(),
      })
      : panelsToDXF(seamed(), {
        rollWidth: S.rollWidth, gap: S.panelGap / 100, nested: ensureNest(),
      })), 'btn primary');
  button(grid, 'Printable pattern', () => {
    const t = tiledPages(seamed(), {
      paper: S.paper, rollWidth: S.rollWidth, gap: S.panelGap / 100,
      nested: ensureNest(),
      marginMM: S.printMargin, overlapMM: S.printOverlap,
    });
    // One file holding every page, so a builder prints once — and one that
    // opens. The pages were joined end to end into a single `.svg`, which
    // is not a file a browser or a drawing program will read past the first
    // page of.
    save(`${S.name}-pattern-${S.paper}.html`,
      tiledPagesToHTML(t, { title: `${S.name} — cutting pattern` }));
    // Said as a report, not as a fault: a status given as the first
    // argument is drawn in red, and seven buttons announced that their file
    // had been written in the colour of an error.
    setStatus(null, `${t.pages.length} pages at ${S.paper}, `
      + `${t.blankPagesSkipped} blank tiles skipped. Open the file in a browser and print `
      + 'at 100%; check the 100 mm bar before cutting.');
  }, 'btn');
  button(grid, 'Size family', () => {
    // Scaling a design across a size range has been possible since Phase 2 —
    // `buildFamily`, `buildSize` and `familyTable` — and there has never
    // been a way to ask for it. A designer draws one wing and needs four.
    //
    // The family is scaled from the PARAMETRIC planform. An imported design
    // is given rib by rib, and a family built from the sliders beside it
    // would be a family of some other wing with the imported one's name.
    if (LEP?.design) {
      setStatus(`${LEP.design.name} is an imported design: its sizes are made `
        + 'in its own program, by the scale factor in section 1. The size '
        + 'family here scales a parametric wing — choose "—" to return to one.');
      return;
    }
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
          // `lineLengthM` is the height of the lines, canopy to riser top,
          // and `lineLengthPerSpan` gives the *total* metres of cord. Feeding
          // one where the other belongs would have put 273 m where 6.5 m goes
          // on the default wing.
          //
          // Left null the family came out with NaN line length, NaN speed and
          // NaN glide: a table that looked like a table and told a designer
          // nothing. (`buildSize` refuses that now.) Line height goes with
          // the linear dimension — measured, on four makers' families, in
          // `docs/scaling.md` — so it goes as the square root of area.
          lineLengthM: S.lineLength * Math.sqrt(area / M.metrics.area),
        });
      }
      // The outline and arc of the wing on the page. Only the span, chords
      // and sweep were passed, so a design with its own ellipticity or arc
      // had a family drawn from the default ones: the sizes of a different
      // wing under this one's name.
      const fam = buildFamily(
        {
          span: S.span, rootChord: S.rootChord, tipChord: S.tipChord,
          tipSweep: S.tipSweep,
          ellipticityLE: S.ellipticityLE, ellipticityTE: S.ellipticityTE,
        },
        sizes,
        {
          airfoil: M.airfoil, cells: S.cells,
          pointsPerSurface: S.pointsPerSurface, rollWidth: S.rollWidth,
          // A circle through the same projected span, whatever the arc type.
          projectedRatio: Math.min(0.99, Math.max(0.64, M.lobeM.spanRatio ?? S.projectedRatio)),
          layout: RISER_LAYOUTS[S.riserLayout] || RISER_LAYOUTS['A/B/C+D'],
          alphaDeg: S.alphaDeg,
          ovalAmount: S.applyOval ? S.ovalAmount / 100 : 0,
          // The design's own riser, at every size: it is hardware.
          riserLengthM: M.riserM ?? 0.5,
        },
      );
      save(`${S.name}-family.tsv`, familyTable(fam));
      setStatus(null, `${fam.sizes.length} sizes from `
        + `${S.famSmallest} to ${S.famLargest} m2.`);
    } catch (e) {
      setStatus(`Family: ${e.message}`);
    }
  }, 'btn');

  button(grid, 'Bill of materials', () => {
    const bill = billOfMaterials();
    if (bill.error) { setStatus(bill.error); return; }
    save(`${S.name}-bom.txt`, bomText(bill.bom));
    const b = bill.bom;
    if (b.missing && b.missing.length) {
      setStatus(`Bill written, incomplete: ${b.missing.join(', ')}.`);
    } else {
      setStatus(null, `Bill of materials written: ${b.totals.accountedKg.toFixed(2)} kg accounted for`
        + (b.accountedFraction != null
          ? `, ${(b.accountedFraction * 100).toFixed(0)}% of the ${b.wingMassKg.toFixed(2)} kg set.`
          : '.'));
    }
  }, 'btn');

  button(grid, 'Rib stress report', () => {
    if (!M.loads) { setStatus('No loads to check.'); return; }
    // In the rib cloth chosen under Assumptions. It was always checked as
    // Skytex 27 hard, whatever the ribs were set to be cut from. A cloth
    // this has no strength figure for is checked as the weakest it has, and
    // the file says so.
    const ribCloth = RIB_CLOTH[S.clothRib] ? S.clothRib : 'Porcher Skytex 27 hard';
    const r = checkWingRibStress({
      wing: M.wing,
      anchorLoads: M.loads.anchorLoads,
      airfoil: M.airfoil,
      cloth: ribCloth,
      // Each anchor where its line meets the rib: an imported design's move
      // along the span, and the section's own positions were used for all.
      plan: M.linePlan,
      // The holes that are really cut: the design's own on an imported
      // wing, this tool's otherwise, none with the openings switched off.
      // An imported design was checked against holes it does not have.
      openingsFor: (rib) => holesIn(rib),
    });
    const lines = [
      `# Rib stress, ${S.name}`,
      `# ${r.note}`,
      `# at ${r.designFactor} g, through a 20 mm tab into ${r.cloth}`
        + (ribCloth === S.clothRib ? '' : ` (no strength figure here for ${S.clothRib}, the cloth chosen)`)
        + '; the load fans out 30 degrees either side across the rib',
      `# longest reinforcement: ${r.longest.name} on rib ${r.longest.ribIndex}, `
        + `${(r.longest.reachM * 1000).toFixed(0)} mm of the ${(r.longest.depthM * 1000).toFixed(0)} mm `
        + `the rib is deep there, at ${r.longest.loadN.toFixed(0)} N`,
      '',
      ['rib', 'chord_m', 'anchor', 'at_chord_pct', 'load_N', 'reach_mm', 'rib_depth_mm',
        'tape_to_seam', 'hole_in_path'].join('\t'),
    ];
    for (const x of r.ribs) {
      for (const q of x.paths) {
        lines.push([
          x.ribIndex, M.wing.ribs[x.ribIndex].chord.toFixed(3), q.name,
          (q.chordFraction * 100).toFixed(1), q.loadN.toFixed(0),
          (q.reach.reachM * 1000).toFixed(0), (q.reach.availableM * 1000).toFixed(0),
          q.reach.reachesSeam ? 'yes' : '-', q.path.holeInPath ? 'yes' : '-',
        ].join('\t'));
      }
    }
    // The provenance goes in the file. A designer reading "the seam is the
    // limit" is entitled to know that the cloth figures behind it are this
    // project's estimates rather than a supplier's datasheet.
    lines.splice(2, 0, '# cloth figures: '
      + (typeof r.clothProvenance === 'string'
        ? r.clothProvenance
        : Object.entries(r.clothProvenance ?? {})
          .map(([k, v]) => `${k}: ${v}`).join('; ')));
    save(`${S.name}-rib-stress.tsv`, `${lines.join('\n')}\n`);
    const said = `${r.anchorCount} anchors on ${r.ribCount} ribs checked at ${r.designFactor} g: `
      + `longest reinforcement ${(r.longest.reachM * 1000).toFixed(0)} mm`;
    const bad = [];
    if (r.anchorsToSeam.length) bad.push(`${r.anchorsToSeam.length} need tape to the upper seam`);
    if (r.ribsWithHolesInLoadPath.length) {
      bad.push(`${r.ribsWithHolesInLoadPath.length} rib${r.ribsWithHolesInLoadPath.length > 1 ? 's' : ''} `
        + 'with a hole in a load path');
    }
    if (bad.length) setStatus(`${said}; ${bad.join(', ')}.`);
    else setStatus(null, `${said}, no hole in a load path.`);
  }, 'btn');

  button(grid, 'Wing 3D (OBJ)', () => {
    // The whole wing as a 3D model: both surfaces, the ribs and every line,
    // in named groups that share one vertex pool.
    try {
      // The line selection gives each line its real diameter, so the tubes
      // in the model are to scale: an A line really is thicker than a brake
      // line, and it is visible in any viewer rather than being an OBJ
      // polyline most importers drop.
      // 0 means let it choose a visible thickness; anything else is the
      // factor, and 1 is true scale.
      //
      // Computed here rather than inline: a ternary inside the call reads to
      // the options checker as a second option key, and it reported
      // `objLineScale` as an argument `wingToOBJ` does not accept.
      const objScale = S.objLineScale > 0 ? S.objLineScale : 1;
      const obj = wingToOBJ({
        wing: M.wing, linePlan: M.linePlan, lineSelection: M.lineSelection,
        name: S.name, lineDiameterScale: objScale,
      });
      save(`${S.name}.obj`, obj);
      const scaleLine = obj.split('\n').find((l) => /drawn .*x their true/.test(l));
      if (scaleLine) setStatus(null, scaleLine.replace(/^# /, ''));
    } catch (e) {
      setStatus(`OBJ: ${e.message}`);
    }
  }, 'btn');

  button(grid, 'Design parameters', () => {
    // Every setting and every derived figure, in one table.
    //
    // The JSON export is the design; this is the design as a person reads
    // it — what was set, what came out, and which is which. A reviewer
    // checking a drawing against the numbers beside it needs the numbers in
    // one place, not spread across five panels.
    const rows = [['group', 'parameter', 'value', 'unit', 'source']];

    const GROUPS = {
      span: 'Planform', rootChord: 'Planform', tipChord: 'Planform',
      tipSweep: 'Planform', ellipticityLE: 'Planform', ellipticityTE: 'Planform',
      cells: 'Planform', centreRib: 'Planform', distribution: 'Planform',
      cellTaper: 'Planform',
      projectedRatio: 'Arc', arcType: 'Arc', washinDeg: 'Arc',
      naca: 'Aerofoil', reflex: 'Aerofoil',
      anchorA: 'Lines', anchorB: 'Lines', anchorC: 'Lines', anchorD: 'Lines',
      lineLength: 'Lines', riserLayout: 'Lines', karabinerSep: 'Lines',
      pilotMass: 'Loading', wingMass: 'Loading',
    };
    // View preferences are not design parameters. The colour scheme, which
    // tab is open and which rib is on screen say nothing about the wing, and
    // listing them invites a reader to think they might.
    const VIEW_ONLY = new Set(['theme', 'tab', 'ribIndex', 'dimensions',
      'lineRow', 'compareTo', 'reference', 'name',
      'isoAz', 'isoEl', 'isoLines', 'vribView', 'showIntake']);
    for (const [k, v] of Object.entries(S)) {
      if (k.startsWith('_') || typeof v === 'object') continue;
      if (VIEW_ONLY.has(k)) continue;
      rows.push([GROUPS[k] || 'Settings', k, String(v), '', 'set']);
    }

    // Derived: what the geometry actually came out as.
    const d = [
      ['Geometry', 'flat area', M.metrics.area.toFixed(3), 'm2'],
      ['Geometry', 'flat span', M.metrics.span.toFixed(3), 'm'],
      ['Geometry', 'aspect ratio', M.metrics.aspectRatio.toFixed(3), ''],
      ['Geometry', 'mean aerodynamic chord', M.metrics.mac.toFixed(3), 'm'],
      ['Geometry', 'cells across the wing', String(wholeWingCounts(M.wing).cells), ''],
      ['Geometry', 'ribs across the wing', String(wholeWingCounts(M.wing).ribs), ''],
      ['Geometry', 'ribs on the half wing', String(M.wing.ribs.length), ''],
    ];
    {
      const cw = cellWidths(M.wing.stations, { centreRib: hasCentreRib(M.wing) });
      d.push(['Geometry', 'cell width at the centre', (cw.centreM * 1000).toFixed(0), 'mm']);
      d.push(['Geometry', 'cell width at the tip', (cw.tipM * 1000).toFixed(0), 'mm']);
    }
    if (M.lobeM) {
      d.push(['Arc', 'projected span', M.lobeM.projectedSpan.toFixed(3), 'm']);
      d.push(['Arc', 'arrow', M.lobeM.arrow.toFixed(3), 'm']);
      d.push(['Arc', 'tip dihedral', M.lobeM.tipDihedralDeg.toFixed(2), 'deg']);
    }
    // `M.balance` is the flight state; `M.equilibrium` does not exist, and an
    // imported design has no balance at all until one is solved. Reading a
    // field that is not there threw on the Swoop2 and the export produced
    // nothing — caught because the Swoop2 is exercised through every button.
    const bal = M.balance;
    if (bal) {
      const num = (v, dp) => (Number.isFinite(v) ? v.toFixed(dp) : null);
      for (const [name, value, unit] of [
        ['trim speed', num(bal.speedKMH, 1), 'km/h'],
        ['glide ratio', num(bal.glideRatio, 2), ''],
        ['lift coefficient', num(bal.cz3D, 3), ''],
        ['calage', num(bal.calageFraction * 100, 2), '% chord'],
      ]) if (value !== null) d.push(['Flight', name, value, unit]);
    }
    if (M.lengths) {
      // The three lengths a builder cares about, and they are different
      // numbers: what flies, what is sewn, what is cut.
      //
      // For the WHOLE wing. The length chain adds up one half — the plan is
      // one half — and these were written out as they came: 162 m of line
      // and 99 lines on a sheet whose readout says 324 m and 198.
      for (const [name, key] of [
        ['flying line length', 'flyingMetres'],
        ['sewn line length', 'sewnMetres'],
        ['cut line length', 'cutMetres'],
      ]) {
        const v = M.lengths[key];
        if (Number.isFinite(v)) d.push(['Lines', name, (v * 2).toFixed(1), 'm']);
      }
      if (M.linePlan) {
        d.push(['Lines', 'line count', String(M.linePlan.lines.length * 2), '']);
      }
    }
    for (const [g, n, v, u] of d) rows.push([g, n, v, u, 'derived']);

    save(`${S.name}-parameters.tsv`,
      `${rows.map((r) => r.join('\t')).join('\n')}\n`);
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
      // An imported design HAS a line set: its own. What the optimiser
      // proposes from this tool's catalogue is a comparison, and the file
      // used to give it under the design's name as if it were the design —
      // the Swoop2 listed in DC 40 and Edelrid, on a wing drawn in Line120.
      const own = M.linePlan && M.linePlan.source === 'LEparagliding' && M.lineSelection;
      if (own) {
        const types = new Map();
        for (const l of M.lineSelection.lines) {
          if (!l.line) continue;
          const t = types.get(l.line.code) || { line: l.line, lines: 0 };
          t.lines += 2;
          types.set(l.line.code, t);
        }
        out.push('# The design\'s own lines, as its file assigns them (section 34):');
        out.push('');
        out.push(['material', 'rated_daN', 'diameter_mm', 'lines'].join('\t'));
        for (const t of [...types.values()].sort((a, b) => b.lines - a.lines)) {
          out.push([t.line.code, Number(t.line.ratedDaN ?? t.line.strengthDaN ?? 0).toFixed(1),
            t.line.diameterMM, t.lines].join('\t'));
        }
        out.push('');
        out.push('# For comparison only — what this tool\'s catalogue would stock for the same loads.');
        out.push('# This is NOT the design\'s line set:');
      }
      if (!opt.ok) {
        out.push(`# ${opt.note}`);
      } else {
        // Counted across the whole wing, as everything else in the tool is:
        // the optimiser works on one half, and the file gave its counts —
        // "3 types covers 90 lines" on a wing the readout says has 180.
        const all = opt.chosen.reduce((a, c) => a + c.lines, 0) * 2;
        out.push(`# ${opt.typeCount} type${opt.typeCount > 1 ? 's' : ''} cover `
          + `${all} lines, ${(opt.penalty * 100).toFixed(1)}% more ${opt.minimise} than a `
          + 'different line at every anchor');
        out.push('');
        out.push(['material', 'rated_daN', 'diameter_mm', 'lines'].join('\t'));
        for (const c of opt.chosen) {
          out.push([c.name, c.ratedDaN.toFixed(1), c.diameterMM, c.lines * 2].join('\t'));
        }
      }

      // Trim drift: which attachment points end up short, and how far that
      // turns the wing. Worked on PATHS — a point moves by the sum of the
      // lines under it — and on the lines the design is actually sized
      // with, whatever the optimiser above would stock instead.
      const sched = trimSchedule({
        lines: M.lengths.lines, anchors: M.airfoil.anchors,
        chordM: S.rootChord, replaceHours: S.serviceHours,
        paths: planPaths(M.linePlan),
      });
      out.push('');
      out.push(own ? '# trim drift, of the design\'s own lines'
        : '# trim drift, of the lines this design is sized with');
      out.push(`# ${sched.note}`);
      const end = sched.atReplacement;
      out.push(`# ${end.note}`);
      out.push(`# the trim moves ${end.alphaChangeDeg >= 0 ? '+' : ''}`
        + `${end.alphaChangeDeg.toFixed(2)} degrees of angle of attack by `
        + `${S.serviceHours} hours (rear lines short is nose up: slower, nearer the stall)`);
      out.push('# the directions are the makers\': Dyneema shrinks as it settles and the lines');
      out.push('#   that carry least stay short; aramid holds its length. The sizes are');
      out.push(`#   ${end.source.toUpperCase()}, not measured`);
      if (end.unknownFibre.length) {
        out.push(`# ${end.unknownFibre.length} line(s) of a fibre this tool does not know are left out: `
          + `${end.unknownFibre.slice(0, 6).join(' ')}`);
      }
      out.push('');
      out.push(['row', 'attachment_points', 'mean_change_mm', 'min_mm', 'max_mm',
        'fibres'].join('\t'));
      for (const [row, r] of Object.entries(end.rowDrift)) {
        out.push([row, r.points * 2, r.meanDeltaMM.toFixed(1), r.minDeltaMM.toFixed(1),
          r.maxDeltaMM.toFixed(1), r.fibres.join('+')].join('\t'));
      }

      save(`${S.name}-line-set.tsv`, `${out.join('\n')}\n`);
      if (opt.ok) {
        setStatus(null, `${opt.typeCount} line types, ${(opt.penalty * 100).toFixed(1)}% drag `
          + `penalty; trim moves ${end.alphaChangeDeg.toFixed(2)} deg by `
          + `${S.serviceHours} h (estimated).`);
      } else {
        setStatus(opt.note);
      }
    } catch (e) {
      setStatus(`Line set: ${e.message}`);
    }
  }, 'btn');

  // What the design hands an inspector (PMA section 6.2.1), from what it
  // already holds: the lines it is sized with, their fibre and strength new,
  // and the length chain. Who makes the wing, in what size and for what
  // weights, is the maker's to add, and the record says those are missing.
  const designRecord = () => exchangeRecord({
    manufacturer: null, model: S.name, size: null,
    plan: M.linePlan,
    selection: M.lineSelection,
    lengths: M.lengths,
    // The plan's own riser. 7.5% of the line length was written here —
    // 450 mm on a plan whose risers are 500, and 470 on the Swoop2.
    riserLengthMM: Math.round(M.linePlan.riserLengthMM
      ?? (M.linePlan.riserLengthM ?? M.riserM ?? 0.5) * 1000),
  });

  button(grid, 'Inspection check', () => {
    // The PMA's line geometry inspection, run on the design before there is
    // a wing: each attachment point's reference length, where the drift
    // model expects it after the first fifty hours and at the end of the
    // set's life, and whether one correction offset still passes them.
    //
    // This compared the plan with itself — every line "measured" at its own
    // reference — and then wrote NO in the `within` column of all of them,
    // under a heading that said the wing passed: the rows carry
    // `withinTolerance` and it read `within`.
    if (!M.linePlan || !M.lengths || !M.lengths.lines.length) {
      setStatus('No line lengths to inspect.');
      return;
    }
    try {
      const rec = designRecord();
      const paths = planPaths(M.linePlan);
      const at = [...new Set([50, S.serviceHours])].sort((a, b) => a - b).map((hours) => {
        const drift = trimDrift({
          lines: M.lengths.lines, hours, anchors: M.airfoil.anchors,
          chordM: S.rootChord, paths,
        });
        return { hours, drift, forecast: inspectionForecast({ record: rec, drift }) };
      });
      const limit = at[0].forecast.check.offsetLimitMM;
      const out = [
        `# Inspection forecast, ${S.name}`,
        '# NO WING HAS BEEN MEASURED. These are the design\'s own reference lengths, and',
        '#   where this tool expects each attachment point to be after the hours shown.',
        '# The directions are the makers\': Dyneema shrinks as it settles in and the lines',
        '#   that carry least stay short; aramid holds its length. The sizes are this',
        '#   tool\'s ESTIMATES, not measurements.',
        '# PMA line geometry, section 5.5: delta = measured + offset - reference, with one',
        '#   offset for the whole wing, no more than 1.5 % of the longest line',
        `#   (${limit.toFixed(0)} mm here); suspension lines within -12..+12 mm, brakes 0..+50 mm.`,
        `# Lengths are at ${rec.totalLineLengths[0].measuredAtDaN ?? '?'} daN, sail to the riser's loop at the harness;`,
        '#   a brake\'s from the sail to the knot at its handle.',
        '#',
        '# as designed: every attachment point on its reference',
      ];
      for (const a of at) {
        const c = a.forecast.check;
        const h = a.forecast.headroom;
        out.push(`# at ${a.hours} h: ${c.passes ? 'passes' : 'FAILS'} with an offset of `
          + `${c.correctionOffsetMM >= 0 ? '+' : ''}${c.correctionOffsetMM} mm`
          + (c.outOfTolerance.length
            ? `; ${c.outOfTolerance.length} attachment point(s) outside the band: `
              + `${c.outOfTolerance.slice(0, 12).join(' ')}${c.outOfTolerance.length > 12 ? ' ...' : ''}`
            : ''));
        out.push(`#   the suspension points are ${h.spreadMM.toFixed(0)} mm apart, `
          + `${(h.bandUsedFraction * 100).toFixed(0)}% of the ${h.bandMM} mm band; `
          + (h.passes
            ? `offsets from ${h.offsetRangeMM[0].toFixed(0)} to ${h.offsetRangeMM[1].toFixed(0)} mm pass, `
              + `which leaves room for ${h.slackMM.toFixed(0)} mm more`
            : `no one offset passes them all — ${h.limitedBy[0]} needs at least `
              + `${h.offsetRangeMM[0].toFixed(0)} mm and ${h.limitedBy[1]} at most `
              + `${h.offsetRangeMM[1].toFixed(0)}`));
      }
      if (at.some((a) => !a.forecast.check.passes)) {
        out.push('# A set that settles is expected to need adjusting at its first check — a service');
        out.push('#   workshop puts it "after 25 hours flying, as the lineset settles in". This says');
        out.push('#   which attachment points, and by about how much.');
      }
      if (at[0].forecast.notForecast.length) {
        out.push(`# not forecast (a line of unknown fibre in the path): `
          + `${at[0].forecast.notForecast.join(' ')}`);
      }
      out.push('');
      const head = ['attachment_point', 'lines', 'reference_mm'];
      for (const a of at) {
        head.push(`expected_${a.hours}h_mm`, `delta_${a.hours}h_mm`, `within_${a.hours}h`);
      }
      out.push(head.join('\t'));
      const pathOf = new Map(rec.totalLineLengths.map((t) => [t.attachmentPoint, t.path]));
      at[0].forecast.check.rows.forEach((row, k) => {
        const cells = [row.name, (pathOf.get(row.name) ?? []).join(' '), row.referenceMM];
        for (const a of at) {
          const r = a.forecast.check.rows[k];
          cells.push(r.measuredMM, r.deltaMM, r.withinTolerance ? 'yes' : 'NO');
        }
        out.push(cells.join('\t'));
      });
      save(`${S.name}-inspection.tsv`, `${out.join('\n')}\n`);
      const last = at[at.length - 1];
      const firstFail = at.find((a) => !a.forecast.check.passes);
      if (!firstFail) {
        setStatus(null, `Inspection forecast: passes at ${at.map((a) => `${a.hours} h`).join(' and ')} `
          + `(${last.forecast.headroom.spreadMM.toFixed(0)} mm apart by then; estimated).`);
      } else {
        setStatus(`Inspection forecast: ${firstFail.forecast.check.outOfTolerance.length} attachment `
          + `point(s) expected outside the band at ${firstFail.hours} h (estimated) — see the file.`);
      }
    } catch (e) {
      setStatus(`Inspection check: ${e.message}`);
    }
  }, 'btn');

  button(grid, 'PMA data sheet', () => {
    if (!M.linePlan) { setStatus('No line plan to publish.'); return; }
    // The plan alone was passed, so the sheet left out what the design
    // holds: no material, strength or minimum on any line, the flying length
    // in the column headed sewn length, and totals as designed rather than
    // at the measuring tension.
    const rec = designRecord();
    save(`${S.name}-pma.tsv`, exchangeTSV(rec));
    if (!rec.complete) {
      setStatus(null, `Data sheet written. For the maker to add: ${rec.missing.join(', ')}.`);
    }
  }, 'btn');
  button(grid, 'Diagonals DXF', () => {
    if (!M.vribs || !M.vribs.count) { setStatus('No diagonal ribs to export.'); return; }
    save(`${S.name}-diagonals.dxf`, vribsToDXF(M.vribs, { rollWidth: S.rollWidth, gap: S.panelGap / 100 }));
  }, 'btn');
  button(grid, 'Panels SVG', () => save(`${S.name}-panels.svg`,
    panelsToSVG(seamed(), {
      rollWidth: S.rollWidth, gap: S.panelGap / 100, nested: ensureNest(),
    })), 'btn');
  button(grid, 'Line lengths', () => save(`${S.name}-lines.csv`, linesCSV()), 'btn');
  // Settings only: the underscored keys are this session's bookkeeping —
  // which reference is applied, the settings an import set aside — and a
  // project that carried them would open believing it had already loaded
  // a design it had not.
  button(grid, 'Save project', () => save(`${S.name}.pgd.json`, JSON.stringify(
    Object.fromEntries(Object.entries(S).filter(([k]) => !k.startsWith('_'))), null, 2)), 'btn');
  button(grid, 'Export LEP', () => {
    try {
      save('leparagliding.txt', designToLep({
        wing: M.wing, airfoil: M.airfoil, name: S.name,
        balance: M.balance, lineLengthM: S.lineLength,
        airfoilFile: `${(M.airfoil.name || 'airfoil').replace(/\s+/g, '')}.txt`,
      }, LEP ? LEP.doc : null));
    } catch (e) { setStatus(`Could not write LEP file: ${e.message}`); }
  }, 'btn primary');
  // Laboratori d'envol's Swoop2, built in.
  //
  // It is a COMPLETE design — 50 cells, 51 ribs, its own aerofoils, its own
  // line plan — and it is the design whose author wrote the handbook this
  // project implements. Its published area, span, root chord and cell and rib
  // counts all reproduce exactly.
  //
  // It was in the repository as a data file and there was no way to open it,
  // so the one wing the tool reproduces exactly could not be looked at in the
  // tool. It loads through the same path as an imported file.
  button(F, 'Load the Swoop2', () => {
    if (typeof SWOOP2_LEP !== 'string' || !SWOOP2_LEP.length) {
      setStatus('The Swoop2 is not in this build.');
      return;
    }
    // The same path as choosing it in the picker, so the two cannot differ.
    S.reference = SWOOP2_ID;
    S._appliedReference = null;
    buildControls();
    rebuild();
    const g = LEP?.geom;
    setStatus(null, `${S.name}: ${LEP.design.cells} cells, ${LEP.design.geometry.ribCount} ribs`
      + (g?.ok ? `, ${g.totals.linesPerSide} lines a side on ${g.totals.risersPerSide} risers `
        + `as LEparagliding computes them (${g.totals.cutM.toFixed(2)} m)` : ''));
  }, 'btn');

  const lepIn = el('button', 'btn', 'Import LEP');
  const lepFile = el('input');
  lepFile.type = 'file'; lepFile.accept = '.txt'; lepFile.style.display = 'none';
  lepFile.addEventListener('change', async () => {
    const f = lepFile.files[0]; if (!f) return;
    try {
      // The same loader as the Swoop2. A file on its own has no section
      // files, so its ribs take this tool's section until they are loaded —
      // and the status says which ones it names.
      loadLepDesign(parseLep(await f.text()), {});
      S.reference = '';
      S._appliedReference = null;
      buildControls();
      rebuild();
      if (LEP.design.missingSections.length) {
        setStatus(`${S.name}: load ${LEP.design.missingSections.join(', ')} to reproduce its `
          + 'ribs, lines and rods exactly.');
      }
    } catch (e) { setStatus(`Could not read LEP file: ${e.message}`); }
  });
  lepIn.addEventListener('click', () => lepFile.click());
  grid.append(lepIn, lepFile);
  const load = el('button', 'btn', 'Open project');
  const fi = el('input'); fi.type = 'file'; fi.accept = '.json'; fi.style.display = 'none';
  fi.addEventListener('change', async () => {
    const f = fi.files[0]; if (!f) return;
    try {
      const project = JSON.parse(await f.text());
      // A project replaces whatever is on the page, import included; and
      // the settings it brings must not then be "restored" over by those
      // an import had set aside.
      LEP = null;
      S._parametric = null;
      S._appliedReference = '';
      S._referenceNote = '';
      Object.assign(S, Object.fromEntries(Object.entries(project)
        .filter(([k]) => !k.startsWith('_'))));
      // A project saved before the rods were corrected says "rod from 12 to
      // 18.5% of chord", which was a misreading of one end of a nose rod.
      // What it meant is a nose rod back to that 18.5%.
      if ('rodTo' in project && !('rodUpper' in project)) S.rodUpper = project.rodTo;
      delete S.rodFrom;
      delete S.rodTo;
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
    button(F, 'Return to parametric wing', () => {
      leaveImport();
      if (S._appliedReference === SWOOP2_ID) { S.reference = ''; S._appliedReference = ''; }
      buildControls(); rebuild();
    });
  } else {
    hint(F, 'Importing a leparagliding.txt takes over the planform and arc from the file. Sections this tool does not model are carried through untouched on export.');
  }

  // The panel has just been rebuilt, and the tables inside it with it.
  drawSideTables();
}

function seamed() {
  if (!S.seamAllowance) return M.panels;
  return M.panels.map((p) => ({ ...p, panel: { ...addSeamAllowance(p.panel, S.seamAllowance), seamLengths: p.panel.seamLengths } }));
}

/* --------------------------------------------------------------- render -- */

function draw() {
  drawReadout();
  drawSideTables();
  refreshHints();
  if (S.tab === 'rib') { drawRib(); return; }
  if (S.tab === 'analysis') { drawPolar(); drawAtmosphere(); return; }
  if (S.tab === 'lines') { drawLinePlan(); return; }
  if (S.tab === 'structure') { drawDiagonals(); return; }
  drawPlan();
  drawFront();
  drawIso();
  drawSection();
  drawCut();
}

/**
 * The tables that live in the side panel: the balance, the atmosphere and
 * the cascade.
 *
 * Drawn on every tab and again whenever the panel is rebuilt. They were
 * drawn by whichever tab happened to be showing, into hosts the panel
 * builder throws away and recreates — so changing any select emptied the
 * balance and atmosphere tables until a slider was next moved. And the
 * cascade table was written over the Balance group itself: opening the Lines
 * tab replaced the pilot mass, the angle of attack and eleven other inputs
 * with a list of lines, and they did not come back.
 */
function drawSideTables() {
  if (!M || !M.balance || M.error) return;
  drawBalanceTable();
  drawEnvironment();
  drawCascadeTable();
  drawComparison();
}

/**
 * The design as `compareDesigns` reads it: one flat object, a metric missing
 * where the model has none (it is skipped, not counted as zero).
 */
function designSummary() {
  const b = M.balance;
  const total = M.imported ? M.imported.cells : (S.centreRib ? S.cells * 2 : S.cells * 2 + 1);
  return {
    flatArea: M.metrics?.area,
    aspectRatio: M.metrics?.aspectRatio,
    cells: total,
    glideRatio: regimeWithheld() ? NaN : b?.glideRatio,
    sinkRate: regimeWithheld() || !b ? NaN : b.speedMS * Math.sin(b.gammaRad),
    trimSpeedKMH: b?.speedKMH,
    cxLines: M.cxLinesUsed,
    lineMetres: M.linePlan?.totalLengthM,
    lineCount: M.linePlan ? M.linePlan.lines.length * 2 : NaN,
    // Only from a layout of this design: until the new one is made, the one
    // held is the design before it.
    clothMetres: M.fabric && !M.nestStale ? M.fabric.linearMetres * 2 : NaN,
    utilisation: M.fabric && !M.nestStale ? M.fabric.utilisation : NaN,
    worstPhiDeg: M.worstPhi,
  };
}

/**
 * The remembered design against the one on the page.
 *
 * A table rather than the text block `comparisonText` writes: in a panel 270
 * pixels wide the text's fixed columns put the design on the page — the one
 * the designer is reading for — off the right-hand edge.
 */
function drawComparison() {
  const host = document.getElementById('compareTable');
  if (!host) return;
  host.innerHTML = '';
  if (!REMEMBERED) { host.style.display = 'none'; return; }
  host.style.display = '';
  const cmp = compareDesigns(REMEMBERED.summary, designSummary(), {
    labels: [`remembered (${REMEMBERED.at})`, 'now'],
  });
  host.append(el('div', 'cmp-head', `remembered (${REMEMBERED.at}) → now`));
  const t = el('table', 'tbl cmp');
  for (const r of cmp.rows) {
    const fmt = (v) => (Number.isFinite(v) ? v.toFixed(r.dp) : '—');
    const mark = r.verdict === 'better' ? '+ ' : (r.verdict === 'worse' ? '− ' : '');
    const pct = r.significant
      ? `${r.fraction >= 0 ? '+' : ''}${(r.fraction * 100).toFixed(1)}%` : '';
    const tr = el('tr', r.verdict);
    tr.append(
      el('td', null, `${mark}${r.label}`),
      el('td', null, `${fmt(r.a)} → ${fmt(r.b)}${r.unit ? ` ${r.unit}` : ''}`),
      el('td', null, pct),
    );
    t.append(tr);
  }
  host.append(t);
  // The verdict is the last line of the text form, which names a trade as a
  // trade; it is kept rather than written a second time here.
  const lines = comparisonText(cmp).split('\n').filter((x) => x.trim());
  host.append(el('div', 'hint', lines[lines.length - 1]));
  // The balance takes the typed line drag unless told otherwise, so a change
  // to the lines moves the line drag here and not the glide.
  if (!S.cxLinesFromPlan) {
    host.append(el('div', 'hint', 'The glide is the balance\'s, on the typed line drag: tick '
      + '"Fly on the drag of the lines in the plan" for a line change to reach it.'));
  }
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
  // Drag across, lift up: steps that give five to ten numbered lines on
  // each axis for any wing, rather than one step for two quantities that
  // differ tenfold in size.
  const maxCD = Math.max(...data.map((d) => d[0]));
  const maxCL = Math.max(...data.map((d) => d[1]));
  const niceStep = (range, n) => {
    const raw = range / n;
    const p10 = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((k) => k * p10).find((st) => st >= raw) ?? raw;
  };
  const stepCD = niceStep(maxCD, 6);
  const stepCL = niceStep(maxCL, 6);
  c.grid(stepCD, stepCL);
  c.axes({
    xStep: stepCD, yStep: stepCL,
    xTitle: 'Cx — drag coefficient, wing + lines + pilot',
    yTitle: 'Cz — lift coefficient',
  });
  c.path(data, '#35d6e8', 1.6);

  // Induced-drag component, to show how much of the drag is the wing's shape
  // and how much is everything else hanging below it.
  c.path(pts.map((p) => [p.CDi, p.CL]), '#e85bc4', 0.9, { dash: '3 3' });

  // The labels are placed where the curve is NOT. The polar climbs to the
  // right, so above-left of a point is clear of it (and above the tangent
  // from the origin), and below-right is clear too.
  for (const p of pts) if (p.alphaDeg % 4 === 0) {
    c.dot([p.CD, p.CL], '#4e6270', 1.6);
    c.text(`${p.alphaDeg}°`, [p.CD, p.CL], '#6f8591', 7, 'start', [5, 10]);
  }

  // Best-glide point: the tangent from the origin touches the polar there.
  // Where the regime flags say the models fail, the points are marked and
  // their figures are not printed, as in the readout.
  const withheld = regimeWithheld();
  const bg = M.polar.bestGlide;
  if (bg) {
    c.path([[0, 0], [bg.CD, bg.CL]], '#e8c547', 0.8, { dash: '4 3' });
    c.dot([bg.CD, bg.CL], '#e8c547', 3);
    c.text(withheld ? 'best glide' : `L/D ${bg.glideRatio.toFixed(1)}`,
      [bg.CD, bg.CL], '#e8c547', 9, 'end', [-6, -6]);
  }
  if (M.polar.minSink) {
    const ms = M.polar.minSink;
    c.dot([ms.CD, ms.CL], '#5fd97a', 3);
    // Below and to the right, which the climbing curve leaves clear. It sat
    // where the L/D label sits, and where the two points meet — high up,
    // or with a capped lift coefficient — the labels were printed over each
    // other.
    c.text(Number.isFinite(ms.sinkRate) && !withheld
      ? `min sink ${Math.abs(ms.sinkRate).toFixed(2)} m/s` : 'min sink',
      [ms.CD, ms.CL], '#5fd97a', 8, 'start', [8, 20]);
  }
  c.fit();

  note.textContent = (withheld ? `${withheld}  ·  ` : '')
    + `${M.polar.source === 'xfoil' ? 'XFOIL section data' : 'estimated section'}`
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
  const kmStep = top > 60000 ? 10 : 5;
  c.grid(1, kmStep);
  const logTicks = [];
  for (let e = -8; e <= 1; e++) for (const k of [1, 2, 5]) logTicks.push(Math.log10(k * 10 ** e));
  c.axes({
    xStep: 1, yStep: kmStep, xTicks: logTicks,
    xFmt: (v) => {
      const d = 10 ** v;
      return d >= 0.001 ? String(+d.toPrecision(1)) : d.toExponential(0);
    },
    xTitle: 'air density, kg/m³ (log scale)',
    yTitle: 'altitude, km',
  });
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

  c.fit();
  const decades = (Math.log10(prof[0].density) - Math.log10(prof[prof.length - 1].density)).toFixed(1);
  document.getElementById('note-atmos').textContent =
    `density, log scale — ${decades} decades over ${(top / 1000).toFixed(0)} km`
    + `  ·  here ${(M.atm.densityRatio * 100).toFixed(2)}% of sea level`
    + `  ·  V for trim CL ${(speedForLift({ mass, area: M.metrics.area, cl: CL, atm: M.atm }) * 3.6).toFixed(0)} km/h`;
}

/**
 * Why the glide figures are withheld, or null where they stand.
 *
 * Where a flag says the aerodynamic models fail (transonic, rarefied, or a
 * Reynolds number below what the drag correlations cover), a glide ratio from
 * them is not a result. At 50 km the readout printed glide 8.48 and L/D 7.25
 * beside "incompressible and Prandtl-Glauert models both fail". The speed
 * stays, because it is what the lift equation asks for at that density.
 */
function regimeWithheld() {
  const failing = (M.nd?.flags ?? []).filter((f) => f.level === 'error');
  return failing.length
    ? `not computed: ${failing.map((f) => f.text.split(' — ')[0]).join(', ')}, where these models do not apply`
    : null;
}

function drawReadout() {
  const r = document.getElementById('readout');
  r.innerHTML = '';
  const m = M.metrics, b = M.balance;
  const withheld = regimeWithheld();
  const items = [
    ['flat area', m.area.toFixed(2) + ' m²'],
    ['proj area', M.projArea.toFixed(2) + ' m²'],
    ['flat AR', m.aspectRatio.toFixed(2)],
    ['proj AR', ((M.lobeM.projectedSpan ** 2) / M.projArea).toFixed(2)],
    ['proj span', M.lobeM.projectedSpan.toFixed(2) + ' m'],
    ['cells', String(M.imported ? M.imported.cells : (S.centreRib ? S.cells * 2 : S.cells * 2 + 1))],
    ['speed', b.speedKMH.toFixed(1) + ' km/h', withheld ? 'warn' : 'hot',
      withheld ? 'the speed the lift equation needs at this density; the flags say what the models miss' : undefined],
    withheld ? ['glide', '—', 'warn', withheld] : ['glide', b.glideRatio.toFixed(2), 'hot'],
    // An imported design hangs where its designer put it; the solve is shown
    // in the balance table as an estimate beside it.
    ['calage', ((M.linePlan?.lep ? M.linePlan.lep.calagePct / 100 : b.calageFraction) * 100).toFixed(1) + '% c', 'hot'],
    ['wing load', (M.balance.totalMass / M.projArea).toFixed(2) + ' kg/m²'],
    ['worst φ', M.worstPhi.toFixed(1) + '°', M.worstPhi > 6 ? 'warn' : undefined],
    ['lines', M.linePlan ? String(M.linePlan.lines.length * 2) : '0'],
    // Against the published figure, when the wing on the page is a
    // published one: the cascade is this tool's, generated by rule, and on
    // high-aspect wings its middle lines run further sideways than a real
    // wing's (docs/full-pipeline.md).
    lineLengthStat(),
    // The whole wing, like the line count beside it. This showed one
    // half's — 50 diagonals next to 180 lines on the same wing.
    ['diagonals', M.vribs ? String(M.vribs.count * 2) : '0',
      M.vribs && M.vribs.unsupportedRibs.length ? 'warn' : undefined],
    ['altitude', (S.altitudeM / 1000).toFixed(1) + ' km'],
    ['ρ', M.atm.density.toExponential(2) + ' kg/m³'],
    ['Re', M.nd.reynolds.toExponential(2), M.nd.reynolds < 2e5 ? 'warn' : undefined],
    ['Mach', M.nd.mach.toFixed(3), M.nd.mach > 0.3 ? 'warn' : undefined],
    withheld ? ['L/D est', '—', 'warn', withheld]
      : ['L/D est', M.polar.bestGlide ? M.polar.bestGlide.glideRatio.toFixed(2) : '—', 'hot'],
  ];
  for (const [k, v, cls, title] of items) {
    const s = el('div', 'stat');
    s.append(el('span', 'k', k), el('span', 'v' + (cls ? ' ' + cls : ''), v));
    if (title) s.title = title;
    r.append(s);
  }
}

/** The line total, and how it compares with the published wing's. */
function lineLengthStat() {
  if (!M.linePlan) return ['line length', '-'];
  const total = M.linePlan.totalLengthM;
  const pub = S.reference && !M.imported ? S._referenceTotalLineM : null;
  if (!pub) return ['line length', `${total.toFixed(0)} m`];
  const dev = total / pub - 1;
  return ['line length', `${total.toFixed(0)} m`,
    Math.abs(dev) > 0.2 ? 'warn' : undefined,
    `published ${pub} m, so ${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(0)}%: the `
      + 'cascade is generated by this tool\'s rules, not taken from the wing'
      + (S.useCascadeSpec ? '' : '. "Solve anchors to the line length" (Lines) fits the anchor counts to it')];
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

  // Colours are written for a dark screen. On white they have to change, and
  // doing that at every call site would mean editing a hundred literals and
  // getting one wrong. They are mapped here instead: one place, every
  // drawing, nothing to keep in step.
  const add = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    const light = S.theme === 'light';
    for (const k in attrs) {
      const v = (k === 'stroke' || k === 'fill')
        ? themeColour(attrs[k], light) : attrs[k];
      n.setAttribute(k, v);
    }
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
    /**
     * A label at a point, optionally moved off it by a number of PIXELS.
     *
     * An offset in data units moves a label by a different distance on
     * every chart, and on a chart whose axes are CL and CD by different
     * distances across and up: `CL - 0.10` put "min sink" on the curve it
     * was labelling.
     */
    text(str, p, color, size = 9, anchor = 'start', [dx, dy] = [0, 0]) {
      const t = add('text', {
        x: X(p[0]) + dx, y: Y(p[1]) + dy, fill: color, 'font-size': size,
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
    /**
     * Grid lines at multiples of the step, over the extent of the data.
     *
     * The lines used to run out to the next whole step beyond the data, and
     * the fit afterwards takes in everything drawn: an atmosphere chart
     * whose density spans one decade was framed across three, and drawn at
     * a third of its width in the middle of the panel.
     */
    grid(step, stepY = step) {
      const gx0 = Math.ceil(minX / step - 1e-9) * step;
      const gy0 = Math.ceil(minY / stepY - 1e-9) * stepY;
      for (let x = gx0; x <= maxX + 1e-9; x += step) {
        add('line', { x1: X(x), y1: Y(minY), x2: X(x), y2: Y(maxY),
          stroke: Math.abs(x) < 1e-9 ? '#2c3d47' : '#1a252c', 'stroke-width': 1 });
      }
      for (let y = gy0; y <= maxY + 1e-9; y += stepY) {
        add('line', { x1: X(minX), y1: Y(y), x2: X(maxX), y2: Y(y),
          stroke: Math.abs(y) < 1e-9 ? '#2c3d47' : '#1a252c', 'stroke-width': 1 });
      }
    },
    /**
     * Numbered axes and their titles, for a chart.
     *
     * A polar with a grid and no numbers on it shows a shape and not a
     * value: nobody could read a lift or drag coefficient off it, or check
     * it against a published one.
     */
    axes({
      xStep, yStep, xTicks = null, yTicks = null, xTitle = '', yTitle = '',
      xFmt = (v) => String(+v.toFixed(6)), yFmt = (v) => String(+v.toFixed(6)),
      color = '#8a9aa6', size = 10,
    }) {
      // Ticks at multiples of the step inside the data, or at the values
      // given — a log axis wants 1, 2 and 5 in each decade, not a step.
      const within = (lo, hi) => (v) => v >= lo - 1e-9 && v <= hi + 1e-9;
      const steps = (lo, hi, st) => {
        const out = [];
        for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9; v += st) out.push(v);
        return out;
      };
      const xs = (xTicks ?? steps(minX, maxX, xStep)).filter(within(minX, maxX));
      const ys = (yTicks ?? steps(minY, maxY, yStep)).filter(within(minY, maxY));
      const label = (str, x, y, anchor, extra = {}) => {
        const t = add('text', {
          x, y, fill: color, 'font-size': size,
          'font-family': 'ui-monospace, monospace', 'text-anchor': anchor, ...extra,
        });
        t.textContent = str;
      };
      const tick = (x1, y1, x2, y2) => add('line', {
        x1, y1, x2, y2, stroke: color, 'stroke-width': 1,
      });
      // The frame's own edges, so the chart has a bottom and a left side.
      tick(X(minX), Y(minY), X(maxX), Y(minY));
      tick(X(minX), Y(minY), X(minX), Y(maxY));
      for (const x of xs) {
        tick(X(x), Y(minY), X(x), Y(minY) + 4);
        label(xFmt(x), X(x), Y(minY) + 5 + size, 'middle');
      }
      for (const y of ys) {
        tick(X(minX) - 4, Y(y), X(minX), Y(y));
        label(yFmt(y), X(minX) - 6, Y(y) + size * 0.35, 'end');
      }
      if (xTitle) label(xTitle, X((minX + maxX) / 2), Y(minY) + 10 + size * 2.2, 'middle');
      if (yTitle) {
        const widest = Math.max(1, ...ys.map((y) => yFmt(y).length));
        const tx = X(minX) - 12 - widest * size * 0.62;
        const ty = Y((minY + maxY) / 2);
        label(yTitle, tx, ty, 'middle',
          { transform: `rotate(-90 ${tx.toFixed(2)} ${ty.toFixed(2)})` });
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

/**
 * The wing in three dimensions.
 *
 * Every other view here is an orthographic projection down one axis, which is
 * what a cutting file needs and is not how anyone pictures a wing. The line
 * cascade in particular is unreadable in plan — it collapses onto itself —
 * and in the front view it is a fan of overlapping segments.
 *
 * This is the honest answer to wanting to see the cascade. The alternative,
 * briefly taken, was to draw the lines in the 3D export thicker than they
 * are; a model whose dimensions are not the design's is not a model of the
 * design. Here the drawing is a picture, so line WIDTH is free to be legible
 * while every position stays true.
 *
 * Rotated by azimuth and elevation and projected orthographically — no
 * perspective, so lengths along a given direction stay comparable and the
 * view can be measured off.
 */
function drawIso() {
  const az = (S.isoAz * Math.PI) / 180;
  const el = (S.isoEl * Math.PI) / 180;
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const ce = Math.cos(el);
  const se = Math.sin(el);

  // x chordwise, y spanwise, z up.
  const project = ([x, y, z]) => {
    const xr = x * ca - y * sa;
    const yr = x * sa + y * ca;
    return [xr, yr * se + z * ce];
  };

  const all = [];
  for (const rib of M.wing.ribs) {
    for (const p of rib.upper) all.push(project(p));
  }
  const c = canvas('vp-iso', all);

  const side = (pts, sgn) => pts.map(([x, y, z]) => project([x, sgn * y, z]));

  // Both halves, so it reads as a wing rather than half of one.
  for (const sgn of [1, -1]) {
    for (const rib of M.wing.ribs) {
      const loop = rib.upper.concat(rib.lower.slice().reverse());
      c.path(side(loop, sgn), '#35d6e8', 0.55, { close: true, opacity: 0.55 });
    }
    // Leading and trailing edges, to give the surface a shape.
    for (const [pick, colour] of [
      [(r) => r.upper[0], '#5fd97a'],
      [(r) => r.upper[r.upper.length - 1], '#e85bc4'],
    ]) {
      c.path(M.wing.ribs.map((r) => {
        const p = pick(r);
        return project([p[0], sgn * p[1], p[2]]);
      }), colour, 1.2);
    }
  }

  // The cascade, at true positions and a legible width.
  if (S.isoLines && M.linePlan?.lines?.length) {
    const ROW = {
      A: '#ff5e5e', B: '#ffa23e', C: '#e8c547', D: '#5ec8ff',
      E: '#9d7bff', K: '#8a8a8a', S: '#00e0a0', Z: '#ff00d0',
    };
    for (const sgn of [1, -1]) {
      for (const l of M.linePlan.lines) {
        if (!l.from || !l.to) continue;
        c.path([
          project([l.from[0], sgn * l.from[1], l.from[2]]),
          project([l.to[0], sgn * l.to[1], l.to[2]]),
        ], ROW[l.row] || '#6e8bff', l.level === 'main' ? 0.9 : 0.45,
        { opacity: 0.75 });
      }
    }
    // The riser webbing and the karabiner, which is where the pilot is.
    //
    // The cascade fans out from the top of the webbing, not from the
    // karabiner; drawing the lines straight to the karabiner put the whole
    // fan on the pilot. Each strap leans along the pull of its own lines —
    // about 15 degrees outboard — and is drawn where the plan puts it.
    for (const sgn of [1, -1]) {
      for (const r of M.linePlan.riserWebbing ?? []) {
        c.path([
          project([r.from[0], sgn * r.from[1], r.from[2]]),
          project([r.to[0], sgn * r.to[1], r.to[2]]),
        ], '#ffffff', 1.6, { opacity: 0.9 });
      }
    }
    const kara = M.linePlan.karabiner ?? [0, 0, -S.lineLength];
    c.dot(project([kara[0], kara[1], kara[2]]), '#ff5e5e', 2.5);
    c.dot(project([kara[0], -kara[1], kara[2]]), '#ff5e5e', 2.5);
  }

  c.fit();

  // Warn when the camera is looking ALONG the arc.
  //
  // A paraglider's tips drop about 27 degrees below its root. Set the
  // elevation to that and the camera looks straight down the arc, which then
  // projects to nothing: the wing renders as a flat line and the cascade
  // hangs off it at angles that look wrong because the thing they hang from
  // has collapsed.
  //
  // The default was 25 degrees — within two of the degenerate angle for a
  // typical wing, which is how it shipped looking wrong.
  const rootP = M.wing.ribs[0].upper[0];
  const tipP = M.wing.ribs[M.wing.ribs.length - 1].upper[0];
  const arcDeg = Math.abs(Math.atan2(Math.abs(tipP[2] - rootP[2]),
    Math.abs(tipP[1] - rootP[1])) * (180 / Math.PI));
  const nearDegenerate = Math.abs(S.isoEl - arcDeg) < 6;

  document.getElementById('note-iso').textContent =
    `azimuth ${S.isoAz}°  ·  elevation ${S.isoEl}°  ·  `
    + `${M.linePlan?.lines?.length ?? 0} lines at true position`
    + (nearDegenerate
      ? `  ·  the arc runs at ${arcDeg.toFixed(0)}°, so this elevation looks `
        + 'along it and flattens the wing — move the slider'
      : '');
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

  // The real line plan, projected onto the front view.
  //
  // This drew `M.cascade` — chapter 8's weighted-centroid cascade — while the
  // Lines view, the loads, the bill of materials and the PMA sheet all use
  // `M.linePlan`. The front view was therefore showing a different set of
  // lines from every other part of the tool: the riser layout, the merges,
  // the brakes, the stabilo and the split A were all absent from it.
  //
  // It is the same defect that was fixed in the exported line lengths, left
  // behind in the one place that draws rather than writes.
  const ROW_COLOUR = {
    A: '#ff5e5e', B: '#ffa23e', C: '#e8c547', D: '#5ec8ff',
    E: '#9d7bff', K: '#8a8a8a', S: '#00e0a0', Z: '#ff00d0',
  };
  const LEVEL_WIDTH = { upper: 0.45, middle: 0.7, main: 1.1 };
  for (const l of M.linePlan.lines) {
    if (!l.from || !l.to) continue;
    const a = [l.from[1], l.from[2]];
    const b = [l.to[1], l.to[2]];
    const colour = ROW_COLOUR[l.row] || '#6e8bff';
    const w = LEVEL_WIDTH[l.level] ?? 0.5;
    c.path([a, b], colour, w, { opacity: 0.55 });
    c.path([[-a[0], a[1]], [-b[0], b[1]]], colour, w, { opacity: 0.55 });
  }
  c.dot([0, -S.lineLength], '#ff5e5e', 3);

  // Dimensions, taken from the geometry actually drawn.
  //
  // Measured off `half` — the arc as plotted — rather than copied from
  // `M.lobeM`, so the drawing and the model's reported figures are two
  // independent computations. The interface test holds them to each other;
  // if they ever disagree, one of them is wrong and the note says so.
  if (S.dimensions && half.length > 1) {
    const centre = half[0];
    const tip = half[half.length - 1];
    const projSpan = 2 * Math.abs(tip[0]);
    const arrow = Math.abs(centre[1] - tip[1]);

    // Projected span, across the tips.
    c.dim([-tip[0], tip[1]], [tip[0], tip[1]],
      `${projSpan.toFixed(2)} m projected`, { offsetPx: -16 });
    // Arrow: how far the tips sit below the centre of the arc.
    if (arrow > 0.01) {
      c.dim([tip[0], centre[1]], [tip[0], tip[1]],
        `${arrow.toFixed(2)} m arrow`, { offsetPx: 16, color: '#e85bc4' });
    }
    // Line length, centre of the arc down to the maillon.
    c.dim([0, centre[1]], [0, -S.lineLength],
      `${(Math.abs(centre[1] + S.lineLength)).toFixed(2)} m to maillon`,
      { offsetPx: 14, color: '#6e8bff' });

    // Stashed for the check that the drawing and the model agree.
    drawFront.measured = { projSpan, arrow };
  }

  c.fit();
  const tipRib = M.wing.ribs[M.wing.ribs.length - 1];
  document.getElementById('note-front').textContent =
    `proj span ${M.lobeM.projectedSpan.toFixed(2)} m  ·  arrow ${M.lobeM.arrow.toFixed(2)} m`
    + `  ·  tip dihedral ${M.lobeM.tipDihedralDeg.toFixed(1)}°  ·  tip φ ${tipRib.phiDeg.toFixed(1)}° χ ${tipRib.chiDeg.toFixed(1)}°`;
}

function drawSection() {
  const b = M.balance;
  const chord = M.imported ? M.imported.rootChord : S.rootChord;
  // The attitude θ = γ − α of handbook [10] is positive NOSE DOWN: the chord
  // runs aft along +x, so nose-down turns it anticlockwise and lifts the
  // trailing edge.
  //
  // This rotated the other way, and hung the pilot straight below the
  // calage point: a wing pitched nose-up by the angle the balance has it
  // nose-down, over a pilot 0.18 m from where the moment equation puts them.
  // The balance hangs the pilot a line's length below the calage point
  // PERPENDICULAR TO THE CHORD — its weight arm is σ cos θ + L sin θ — and in
  // steady glide that brings them under the centre of pressure, which is the
  // check this drawing now shows.
  const th = (b.thetaDeg * Math.PI) / 180;
  const rot = ([x, y]) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)];
  const H = M.hangDepthM ?? S.lineLength;

  const af = M.airfoil.points.map(([x, y]) => rot([x * chord, y * chord]));
  const pilotPt = rot([b.calageMetres, -H]);

  const c = canvas('vp-section', af.concat([pilotPt, [0, 0]]));
  c.grid(0.5);

  // Horizon, and the flight path through the leading edge: the wing travels
  // forward (to the left) and down it at the glide angle.
  c.path([[-chord * 0.6, 0], [chord * 1.3, 0]], '#26343d', 0.8);
  const g = (b.gammaDeg * Math.PI) / 180;
  c.path([[-chord * 0.6, -chord * 0.6 * Math.tan(g)], [chord * 1.3, chord * 1.3 * Math.tan(g)]],
    '#5fd97a', 0.8, { dash: '6 4' });
  c.text('flight path', [-chord * 0.6, -chord * 0.6 * Math.tan(g)],
    '#5fd97a', 8, 'end', [-4, 3]);

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
    c.text(row, q, '#6e8bff', 8, 'middle', [0, 12]);
    c.path([q, pilotPt], '#6e8bff', 0.5, { opacity: 0.45 });
  }

  // The centre of pressure, and the aerodynamic resultant through it. In
  // steady glide that resultant is vertical — it holds up the weight — so
  // it should pass through the pilot: the gap is the rest of the moment
  // balance (pilot and line drag, wing weight, the section's own moment).
  const cp = rot([b.cpMetres, 0]);
  c.path([cp, [cp[0], pilotPt[1]]], '#e8c547', 0.7, { dash: '2 4', opacity: 0.8 });
  c.dot(cp, '#e8c547', 3);
  c.text('Cp', cp, '#e8c547', 9, 'start', [5, -6]);
  // σ, not C: C is also a line row, and the two were drawn side by side.
  const cal = rot([b.calageMetres, 0]);
  c.dot(cal, '#e85bc4', 3);
  c.text('σ', cal, '#e85bc4', 9, 'end', [-5, -6]);
  c.path([cal, pilotPt], '#e85bc4', 0.9, { dash: '3 3' });
  c.dot(pilotPt, '#ff5e5e', 3.5);

  // An imported design hangs where its own lines put it.
  const own = M.imported && LEP?.geom?.ok ? LEP.geom : null;
  if (own) {
    const k = rot([(own.calagePct / 100) * chord, 0]);
    c.dot(k, '#ffffff', 2.2);
  }

  c.fit();
  enablePanZoom('vp-section');
  const gap = (cp[0] - pilotPt[0]) * 100;
  document.getElementById('note-section').textContent =
    `α ${S.alphaDeg.toFixed(1)}°  ·  θ ${b.thetaDeg.toFixed(2)}° nose down  ·  `
    + `γ ${b.gammaDeg.toFixed(2)}°  ·  σ ${(b.calageFraction * 100).toFixed(1)}% c`
    + (own ? ` (the design hangs at ${own.calagePct.toFixed(1)}%, white)` : '')
    + `  ·  pilot ${H.toFixed(2)} m down, ${Math.abs(gap).toFixed(0)} cm `
    + `${gap >= 0 ? 'ahead of' : 'behind'} the lift line`;
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
    // One half of the wing, which is what is laid out: every panel is cut
    // twice, mirrored, except a centre cell's. The note gave the half's roll
    // length with nothing to say it was half.
    `${M.nested.placed.length} panels for one half — cut each twice, mirrored`
    + (M.nested.placed.some((p) => p.centre) ? ' (the centre cell\'s once)' : '')
    + `  ·  ${f.linearMetres.toFixed(2)} m of ${S.rollWidth.toFixed(2)} m roll a half, `
    + `${(f.linearMetres * 2).toFixed(1)} m for the wing`
    + `  ·  ${(f.utilisation * 100).toFixed(0)}% used`
    + (Number.isFinite(f.clearanceM)
      ? `, closest panels ${(f.clearanceM * 1000).toFixed(0)} mm apart` : '')
    + `  ·  with ${S.seamAllowance} mm seam allowance`
    + `  ·  shown in ${bands} band${bands > 1 ? 's' : ''}`
    + (M.nestStale ? '  ·  updating…' : '');
}

function drawBalanceTable() {
  const host = document.getElementById('balanceTable');
  if (!host) return;
  const b = M.balance;
  const withheld = regimeWithheld();
  const rows = [
    ...(withheld ? [['Regime', withheld, true]] : []),
    ['Speed', b.speedKMH.toFixed(2) + ' km/h', true],
    ['Sink', withheld ? '—' : (b.speedMS * Math.sin(b.gammaRad)).toFixed(2) + ' m/s'],
    ['Glide ratio', withheld ? '—' : b.glideRatio.toFixed(2), true],
    ['Glide angle γ', b.gammaDeg.toFixed(2) + '°'],
    // θ = γ − α (handbook [10]): positive is nose DOWN.
    ['Attitude θ, nose down', b.thetaDeg.toFixed(2) + '°'],
    ['Cz 3D', b.cz3D.toFixed(3)],
    // The balance is the handbook's, from the typed section coefficients and
    // the typed Oswald factor. The planform's own factor comes out of the
    // lifting line behind the polar; it is shown beside the one used, not
    // substituted for it, so the two can be compared.
    ['Oswald e', `${S.oswald.toFixed(2)} typed`
      + (M.polar?.bestGlide && Number.isFinite(M.polar.bestGlide.oswald)
        ? `; the planform's lifting line gives ${M.polar.bestGlide.oswald.toFixed(3)}` : '')],
    ['CxT', b.cxTotal.toFixed(4)],
    ['— induced', (b.dragBreakdown.induced * 100).toFixed(1) + '%'],
    ['— lines', (b.dragBreakdown.lines * 100).toFixed(1) + '%'],
    ['Cx lines used', `${M.cxLinesUsed.toFixed(4)} ${S.cxLinesFromPlan && M.cxLinesUsed !== S.cxLines ? '(this lineset)' : '(typed)'}`],
    ...(M.lineDragOwn && Number.isFinite(M.lineDragOwn.cxLines)
      ? [['Cx lines of this lineset', `${M.lineDragOwn.cxLines.toFixed(4)} — `
        + `${(M.lineDragOwn.dragAreaM2).toFixed(3)} m² of drag area, mean `
        + `${M.lineDragOwn.meanDiameterMM.toFixed(2)} mm`]]
      : []),
    ['— pilot', (b.dragBreakdown.pilot * 100).toFixed(1) + '%'],
    ['— profile', (b.dragBreakdown.profile * 100).toFixed(1) + '%'],
    ['Centre of pressure', (b.xcpFraction * 100).toFixed(1) + '% c'],
    ['Calage', b.calageMetres.toFixed(3) + ' m', true],
    ['Calage fraction', (b.calageFraction * 100).toFixed(1) + '% c', true],
    ['Pilot below the wing', `${M.hangDepthM.toFixed(2)} m (lines + ${(M.riserM * 100).toFixed(0)} cm risers)`],
    ['Total mass', b.totalMass.toFixed(1) + ' kg'],
  ];
  // The drawn geometry as one body in glide: where the wing the tool built
  // actually hangs, and the attitude and incidence that follow from it.
  const fb = M.freeBody;
  if (fb && Number.isFinite(fb.hangFraction)) {
    rows.push(
      ['— as drawn —', fb.ok ? 'balances' : `${fb.problems.length} problem(s)`, !fb.ok],
      ['Hangs from', `${(fb.hangFraction * 100).toFixed(1)}% c`
        + (Number.isFinite(fb.hangErrorFraction) && Math.abs(fb.hangErrorFraction) >= 0.001
          ? ` (${fb.hangErrorFraction > 0 ? '+' : ''}${(fb.hangErrorFraction * 100).toFixed(1)} on the balance)`
          : '')],
      // The balance's attitude, swung by the hang error over the hang depth.
      ['Attitude as hung', `${fb.assietteDeg.toFixed(2)}° nose down`],
      ['Angle of attack as hung', `${fb.incidenceDeg.toFixed(2)}°`],
      ['Load-line pull from vertical', `${fb.pullFromVerticalDeg.toFixed(1)}°`],
    );
    for (const p of fb.problems ?? []) rows.push(['', p]);
  }
  // An imported design's own free body, as its program computes it.
  const g = M.imported && LEP?.geom?.ok ? LEP.geom : null;
  if (g) {
    rows.push(
      ['— the design\'s own —', 'as LEparagliding computes it'],
      ['Calage', `${g.calagePct.toFixed(1)}% c`],
      ['Glide it assumes', `${g.glideRatio.toFixed(2)} (${g.glideDeg.toFixed(2)}°)`],
      ['Attitude (assiette)', `${g.assietteDeg.toFixed(2)}°`],
      ['Angle of attack', `${g.aoaDeg.toFixed(2)}°`],
    );
  }
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

  // The risers: webbing from each maillon down to the karabiner, leaning
  // along the pull of their own lines. Without them the cascade ended in
  // mid-air and the drawing never reached the pilot.
  for (const side of [1, -1]) {
    for (const w of plan.riserWebbing || []) {
      if (!w.from || !w.to) continue;
      c.path([[side * w.from[1], w.from[2]], [side * w.to[1], w.to[2]]],
        '#ffffff', 1.6, { opacity: 0.9 });
    }
    if (plan.karabiner) c.dot([side * plan.karabiner[1], plan.karabiner[2]], '#ff5e5e', 3.2);
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
  }
  c.fit();
  enablePanZoom('vp-lineplan');

  // The findings go in the note. Written into the drawing 6 cm apart in
  // wing coordinates, the line count and the split-riser note were drawn on
  // top of each other.
  const shown = plan.lines.filter(wanted).length;
  const pub = S.reference && !M.imported ? S._referenceTotalLineM : null;
  const note = document.getElementById('note-lineplan');
  if (note) {
    note.textContent = `${shown * 2} lines${S.lineRow === 'all' ? '' : ` in row ${S.lineRow}`}`
      + `, ${plan.totalLengthM.toFixed(1)} m`
      + (pub ? ` against ${pub} m published for the ${S.reference} — the cascade `
        + 'is generated by rule, not the real one' : '')
      + (M.riserSplit && M.riserSplit.moved ? `  ·  ${M.riserSplit.note}` : '')
      + '  ·  white: risers to the karabiner (red)';
  }
}

/** The cascade as a table: every line, its level, length and load. */
function drawCascadeTable() {
  // Its own place, at the foot of the Lines group.
  const host = document.getElementById('cascadeTable');
  if (!host) return;
  host.innerHTML = '';
  const plan = M.linePlan;
  if (!plan) { host.append(el('div', 'muted', 'No line plan.')); return; }

  const loads = new Map();
  if (M.loads && M.loads.tensions) {
    for (const t of M.loads.tensions.lines) loads.set(t.name, t.tensionN);
  }
  const sized = new Map();
  if (M.lineSelection) {
    for (const l of M.lineSelection.lines) {
      if (l.line) sized.set(l.name, `${l.line.code}${l.line.diameterMM ? ` ${l.line.diameterMM} mm` : ''}`);
    }
  }
  // An imported plan is listed under its own labels, at the length its
  // program cuts each line to.
  const own = plan.source === 'LEparagliding';

  const rows = plan.lines
    .filter((l) => (S.lineRow === 'all' ? true : l.row === S.lineRow))
    .sort((a, b) => (a.row === b.row
      ? (a.level.localeCompare(b.level) || (a.index ?? 0) - (b.index ?? 0))
      : a.row.localeCompare(b.row)));

  const t = el('table', 'tbl');
  const head = el('tr');
  for (const h of own
    ? ['line', 'its label', 'level', 'length mm', 'cut mm', 'its load kg', 'load N', 'its line']
    : ['line', 'row', 'riser', 'level', 'length mm', 'load N', 'material']) {
    head.append(el('th', '', h));
  }
  t.append(head);
  for (const l of rows.slice(0, 400)) {
    const tr = el('tr');
    const load = loads.get(l.name);
    const cells = own
      ? [
        l.name, l.label || '—', l.level,
        l.lengthMM != null ? String(Math.round(l.lengthMM)) : '—',
        l.cutLengthMM != null ? String(Math.round(l.cutLengthMM)) : '—',
        Number.isFinite(l.loadDaN) ? (l.loadDaN / 0.980665).toFixed(2) : '—',
        load != null ? load.toFixed(1) : '—',
        sized.get(l.name) || '—',
      ]
      : [
        l.name, l.row, l.riser || '—', l.level,
        l.lengthMM != null ? String(Math.round(l.lengthMM)) : '—',
        load != null ? load.toFixed(1) : '—',
        sized.get(l.name) || '—',
      ];
    for (const v of cells) tr.append(el('td', '', v));
    t.append(tr);
  }
  host.append(t);
  if (own && M.lineSelection?.overloaded?.length) {
    host.append(el('div', 'note',
      `${M.lineSelection.overloaded.length} of the design's lines are past `
      + `their rated strength at this tool's ${M.lineSelection.loadCase.limitG} g `
      + `load case with a ${M.lineSelection.loadCase.safetyFactor} margin — `
      + `${M.lineSelection.overloaded.slice(0, 4).map((l) => `${l.label ?? l.name} `
        + `(${(l.utilisation * 100).toFixed(0)}%)`).join(', ')}. The lines are `
      + 'left as the design has them.'));
  }

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
    // The note under the drawing as well: it went on describing the
    // diagonals that had just been turned off.
    document.getElementById('note-diag').textContent = structureSummary();
    return;
  }

  // What the diagonals come to — tension, size, balance — is worked out once
  // for the drawing and for the panel beside it.
  const { tension, geom } = structureFindings();
  const badKey = new Set([
    ...geom.tooShort, ...geom.tooLong, ...geom.tooShallow,
  ].map((d) => `${d.row}:${d.fromRib}->${d.toRib}`));

  // One row at a time, when one is asked for. Seen from the front, the
  // diagonals of every row hang from the same ribs and land on the same
  // neighbours, so all of them at once draw on top of each other.
  const rowsHere = [...new Set(M.vribs.vribs.map((v) => v.row))].sort();
  const showRow = rowsHere.includes(S.vribView) ? S.vribView : 'all';
  const shown = M.vribs.vribs.map((v, i) => ({ v, i }))
    .filter(({ v }) => showRow === 'all' || v.row === showRow);

  // The canopy they sit in, faintly: the upper and lower surface at the
  // row's own chord station, rib by rib, so each diagonal is seen running
  // from a lower seam up to a neighbouring upper seam.
  const stationOf = (r, row) => r.anchors?.[row] ?? M.airfoil.anchors?.[row];
  const meanStation = (r) => {
    const f = (showRow === 'all' ? rowsHere : [showRow]).map((row) => stationOf(r, row))
      .filter((x) => x > 0 && x < 1);
    return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0.3;
  };
  const upAt = M.wing.ribs.map((r) => ribSurfacePoint(r, 'upper', meanStation(r)));
  const loAt = M.wing.ribs.map((r) => ribSurfacePoint(r, 'lower', meanStation(r)));

  const pts = [];
  for (const q of upAt.concat(loAt)) { pts.push([q[1], q[2]]); pts.push([-q[1], q[2]]); }
  for (const { v } of shown) {
    pts.push([v.apex[1], v.apex[2]]);
    for (const b of v.base) pts.push([b[1], b[2]]);
    pts.push([-v.apex[1], v.apex[2]]);
    for (const b of v.base) pts.push([-b[1], b[2]]);
  }
  const c = canvas('vp-diag', pts);
  c.grid(1);

  for (const side of [1, -1]) {
    const up = upAt.map((q) => [side * q[1], q[2]]);
    const lo = loAt.map((q) => [side * q[1], q[2]]);
    c.path(up, '#4e6270', 0.8, { opacity: 0.8 });
    c.path(lo, '#4e6270', 0.8, { opacity: 0.8, dash: '3 3' });
    M.wing.ribs.forEach((r, i) => c.path([up[i], lo[i]], '#4e6270', 0.6, { opacity: 0.6 }));
  }

  // The lines the diagonals hang from: a stub of each upper line of the rows
  // on view, leaving its anchor the way the line itself does. A diagonal
  // whose apex has no stub under it is hanging from a rib with no line.
  const stubM = 0.22;
  for (const l of (M.linePlan ? M.linePlan.lines : [])) {
    if (l.level !== 'upper' || !Number.isInteger(l.ribIndex) || l.row === 'K') continue;
    const row = l.anchorRow ?? l.row;
    if (showRow === 'all' ? !rowsHere.includes(row) : row !== showRow) continue;
    const d = [l.from[1] - l.to[1], l.from[2] - l.to[2]];
    const n = Math.hypot(l.from[0] - l.to[0], d[0], d[1]) || 1;
    const k = Math.min(1, stubM / n);
    for (const side of [1, -1]) {
      c.path([[side * l.to[1], l.to[2]], [side * (l.to[1] + d[0] * k), l.to[2] + d[1] * k]],
        '#e8c547', 1.1, { opacity: 0.9 });
    }
  }

  // Each diagonal drawn fibre by fibre: taut fibres carry the load, slack
  // ones are the fabric doing nothing.
  for (const side of [1, -1]) {
    for (const { v, i } of shown) {
      const t = tension.diagonals[i].tension;
      t.fibres.forEach((f) => {
        c.path(
          [[side * v.apex[1], v.apex[2]], [side * f.point[1], f.point[2]]],
          f.taut ? '#5ec8ff' : '#ff5e5e',
          f.taut ? 0.6 : 0.5,
          { opacity: f.taut ? 0.35 + 0.5 * f.share : 0.5 },
        );
      });
      // An apex marked red is a diagonal that is not buildable as placed:
      // too short to sew, too long to support, or too shallow to carry the
      // anchor load up into the upper surface.
      const unbuildable = badKey.has(`${v.row}:${v.fromRib}->${v.toRib}`);
      c.dot([side * v.apex[1], v.apex[2]],
        unbuildable ? '#ff5e5e' : '#ffffff', unbuildable ? 2.4 : 1.8);
    }
  }

  c.fit();
  enablePanZoom('vp-diag');

  // The findings go in the panel (Internal structure), not on the drawing
  // and not in this note. Written into the drawing they landed on top of
  // each other; in the note they ran past the two lines it has and were cut
  // off mid-sentence. The note says what the drawing shows.
  const perRow = rowsHere.map((row) => `${row} ${M.vribs.vribs.filter((v) => v.row === row).length}`);
  document.getElementById('note-diag').textContent =
    `${M.vribs.own ? 'The design\'s own diagonals' : 'Diagonals placed from the line plan'}`
    + `, each half: ${perRow.join(', ')}`
    + (showRow === 'all' ? '' : `  ·  row ${showRow} drawn`)
    + '  ·  blue fibres carry load, red carry none; a red apex is a piece not buildable as placed'
    + '  ·  yellow: the line each one hangs from  ·  grey: the upper seam, dashed the lower';
}

/**
 * Everything the wing on the page is made of.
 *
 * The bill has existed since Phase 3, and the button that writes it passed
 * the sail panels and the lines and nothing else: no ribs (it asked for them
 * under a name nothing ever set), no diagonals, no reinforcement, no tabs,
 * no rods, the lines at their finished length with no loops, and the name
 * "wing". Fifty ribs and a hundred diagonals were missing from a bill that
 * listed, underneath, only that some holes had not been counted — and the
 * rib cloth chosen under Assumptions changed nothing anywhere.
 *
 * All of it is computed already; this hands it over.
 */
function billOfMaterials() {
  // The fabric schedule, so the bill uses the cloths actually chosen rather
  // than four hardcoded weights.
  const fab = fabricSchedule({
    leadingEdge: S.clothLE, upperSail: S.clothUpper,
    lowerSail: S.clothLower, rib: S.clothRib, diagonal: S.clothRib,
  });
  if (!fab.ok) return { error: `Fabric: ${fab.problems[0]}` };
  const cloth = clothWeightsFor(fab);
  // How much of the upper surface is nose: its length along the section, to
  // the station the leading-edge cloth runs to.
  const noseFraction = (() => {
    const rib = M.wing.ribs[0];
    if (!rib || !(S.noseClothTo > 0)) return 0;
    // Along the surface itself, point to point, from the very front of the
    // section to the station the nose cloth runs to.
    const flat = rib.section ? rib.section.upper : rib.upper.map((q) => toRibPlane(rib, q));
    const to = (S.noseClothTo / 100) * rib.chord;
    let total = 0;
    let before = 0;
    for (let k = 1; k < flat.length; k++) {
      const a = flat[k - 1];
      const b = flat[k];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      total += d;
      if (b[0] <= to) before += d;
      else if (a[0] < to) before += (d * (to - a[0])) / (b[0] - a[0]);
    }
    return total > 0 ? before / total : 0;
  })();

  // Ribs, with the openings the wing has: the design's own holes on an
  // imported design, this tool's otherwise, none with them turned off.
  const ownHoles = M.imported && LEP?.holes && LEP.holes.byRib.size ? LEP.holes.byRib : null;
  const ribs = ribClothTotals(M.wing, M.airfoil, {
    ribCloth: cloth.rib, openings: !!S.ribHoles, ownHoles,
    rodsByRib: Object.fromEntries(M.wing.ribs.map((rib) => [rib.index, rodLinesOn(rib.index)])),
  });

  // The ribs on a roll of their own, as they are cut: each rib's outline
  // with its seam allowance, twice but for one on the centreline. The bill
  // gave the rib cloth as an area and left it out of the roll to order.
  let ribRoll = null;
  try {
    const blanks = [];
    for (const rib of M.wing.ribs) {
      const F = ribFeatures(rib);
      const cut = F.cutLine.length ? F.cutLine : F.loop;
      for (let k = 0; k < ribCopies(M.wing, rib.index); k++) {
        blanks.push({ cell: rib.index, surface: k ? 'rib, right' : 'rib, left', panel: { left: cut, right: [] } });
      }
    }
    const opts = { rollWidth: S.rollWidth, gap: S.panelGap / 100 };
    const laid = nestPanels(blanks, opts);
    const est = fabricEstimate(blanks, { ...opts, nested: laid });
    ribRoll = { rollMetres: est.linearMetres, rollWidth: S.rollWidth, utilisation: est.utilisation };
  } catch (e) {
    ribRoll = null;
  }

  // Rods fitted means no mylar at the nose: the rod does that job.
  const reinforcement = buildReinforcement(M.wing, M.airfoil, {
    plan: M.linePlan, spec: { fitMylar: !(S.rods && M.rods) },
  });
  const tabs = M.linePlan
    ? buildTabs({ plan: M.linePlan, tensions: M.loads ? M.loads.tensions : null, airfoil: M.airfoil })
    : null;

  // Rods, for the whole wing: each as often as the wing has its rib.
  let rods = null;
  if (S.rods && M.rods && M.rods.own) {
    const copies = (r) => ribCopies(M.wing, r.rib);
    rods = {
      count: M.rods.rods.reduce((a, r) => a + copies(r), 0),
      lengthM: M.rods.rods.reduce((a, r) => a + r.lengthM * copies(r), 0),
      massKg: null,
      note: 'the design\'s own, as its program lays them out; it states no diameter',
    };
  } else if (S.rods && M.rods) {
    rods = {
      count: M.rods.count,
      lengthM: M.rods.totalLengthM,
      massKg: M.rods.totalMassG / 1000,
      byDiameter: M.rods.byDiameter,
    };
  }

  const webbing = M.linePlan && M.linePlan.riserWebbing ? M.linePlan.riserWebbing : [];
  const risers = webbing.length
    ? { count: webbing.length * 2, lengthM: (webbing.reduce((a, w) => a + w.lengthMM, 0) * 2) / 1000 }
    : null;

  const entry = REFERENCE_LIB.find((e) => e.id === S._appliedReference);
  const bom = buildBOM({
    name: S.name,
    cloth,
    panels: seamed(),
    nested: ensureNest(),
    wing: M.wing,
    ribHoles: ribs,
    ribRoll,
    vribs: S.vribs ? M.vribs : null,
    // `linePlan` and `lineSelection`, not `plan` and `selection`.
    //
    // Passed under the wrong names these were silently dropped and the bill
    // of materials was built with no line data at all — it reported the
    // cloth and the hardware and quietly omitted every metre of line.
    // Found by `tools/check-options.mjs`, which exists because this is the
    // fourth time a silently-ignored argument has cost something.
    linePlan: M.linePlan,
    lineSelection: M.lineSelection,
    // The lengths to CUT, loops included — what is ordered.
    lineStretch: M.lengths && M.lengths.lines && M.lengths.lines.length ? M.lengths : null,
    reinforcement,
    tabs,
    rods,
    risers,
    riserCount: M.linePlan && M.linePlan.risers ? M.linePlan.risers.length : 3,
    wingMassKg: S.wingMass + S.lineMass,
    wingMassSource: entry && entry.massKg
      ? `${entry.massKg} kg published for the ${entry.id}`
      : 'wing and line mass as set under Balance',
    noseFraction,
    notes: fab.warnings,
    rollWidth: S.rollWidth,
    gap: S.panelGap / 100,
    seamAllowanceMM: S.seamAllowance,
  });
  if (S.rods && M.rods) bom.neverWeighed.unshift('rod pockets');
  // More than the wing weighs is not a rounding error, and it is said. A
  // published wing gives its size here, not its cloth or its construction:
  // an ultralight weighed in a 32 g sail comes out heavier than the real one.
  if (bom.accountedFraction > 1) {
    bom.notes.push(entry && entry.singleSurface
      ? `this comes to more than the ${entry.id} weighs: it is a ${entry.application} `
        + 'wing with no lower surface, and what is billed here is a double-surface wing of its size'
      : 'this comes to more than the wing is set to weigh, before anything under NOT WEIGHED: '
        + 'the cloths chosen under Assumptions are heavier than this wing\'s, or the mass set is too low');
  }
  return { bom, cloth, ribs, reinforcement, tabs, fabric: fab };
}

/** Tension, size and balance of the diagonals on the page, worked out once. */
function structureFindings() {
  if (!M.vribs || !M.vribs.count) return null;
  if (!M._structure) {
    M._structure = {
      // Each diagonal is loaded by the rib it holds: that rib's lift, acting
      // along the rib. `buildVRibs` records the direction on every piece, so
      // nothing has to be passed — the view once passed the first riser's
      // top for the whole wing, and before that nothing at all, which made
      // the check fall back to the diagonal's own axis and read every fibre
      // as perfectly aimed.
      tension: checkDiagonalTension(M.vribs.vribs),
      geom: diagonalGeometry(M.vribs.vribs),
      // Held from one side only, a rib is drawn towards its anchor and wants
      // a strap across the top to the next.
      balance: diagonalBalance(M.vribs.vribs, { centreRib: hasCentreRib(M.wing) }),
    };
  }
  return M._structure;
}

/** The rods on one rib, as lines in its own plane; null when there are none. */
function rodLinesOn(ribIndex) {
  if (!S.rods || !M.rods || !M.rods.count) return null;
  const lines = M.rods.rods.filter((r) => r.rib === ribIndex && r.points).map((r) => r.points);
  return lines.length ? lines : null;
}

/**
 * The openings this tool cuts in a rib.
 *
 * One place, so the Rib tab, the rib pattern, the stress report, the rod
 * check and the bill cannot each cut a slightly different hole: shaped to
 * keep clear of the rods on that rib, and sized against the cell it feeds.
 */
function openingsOf(rib) {
  // Kept until the wing next changes: the Rib tab, the rod check, the note
  // on the panel and the bill all ask for the same ribs.
  const kept = (M._openings ??= new Map());
  if (kept.has(rib.index)) return kept.get(rib.index);
  const nb = M.wing.ribs[Math.min(rib.index + 1, M.wing.ribs.length - 1)];
  const set = ribOpenings(rib, nb === rib ? null : nb, M.airfoil, {
    speedMS: M.balance ? M.balance.speedMS : 11,
    rods: rodLinesOn(rib.index),
  });
  kept.set(rib.index, set);
  return set;
}

/**
 * The holes really cut in a rib, as outlines in its own plane.
 *
 * The design's own on an imported wing, this tool's otherwise, and none with
 * the openings switched off.
 */
function holesIn(rib) {
  if (!S.ribHoles) return [];
  const own = M.imported && LEP?.holes ? LEP.holes.byRib.get(rib.index) : null;
  if (own) return own;
  if (M.imported && LEP?.holes && LEP.holes.byRib.size) return [];
  return openingsOf(rib).holes;
}

/**
 * What the openings come to on this wing, for the Internal structure panel.
 *
 * The hint here read "on the test wing they pass 6 to 64 times the air the
 * neighbouring cell needs" — a figure from a wing of two rounds of work ago,
 * shown under every wing, the Swoop2 with its own holes included. It is
 * worked out now, from the openings the Rib tab draws.
 */
function openingsNote() {
  const base = 'A rib has one set of openings, not two: the lightening holes '
    + 'are the cross-ports.';
  if (!M || M.error || !M.wing || !S.ribHoles) return base;
  if (M.imported && LEP?.holes && LEP.holes.byRib.size) {
    let n = 0;
    for (const hs of LEP.holes.byRib.values()) n += hs.length;
    return `${base} These are the design's own, as its file gives them: ${n} `
      + `on ${LEP.holes.byRib.size} ribs a side.`;
  }
  const sets = M.wing.ribs.map((rib) => openingsOf(rib));
  const cut = sets.filter((s) => s.holes.length);
  if (!cut.length) return `${base} None fits a rib of this wing.`;
  const pct = cut.map((s) => s.removedFraction * 100);
  const air = sets.map((s) => s.ventilationMarginRatio).filter(Number.isFinite);
  const span = (a, d) => {
    const lo = Math.min(...a).toFixed(d);
    const hi = Math.max(...a).toFixed(d);
    return lo === hi ? lo : `${lo} to ${hi}`;
  };
  const starved = sets.filter((s) => Number.isFinite(s.ventilationMarginRatio) && !s.ventilates).length;
  return `${base} On this wing they take out ${span(pct, 0)}% of a rib`
    + (air.length ? ` and pass ${span(air, 0)} times the air the next cell needs` : '')
    + '.'
    + (starved ? ` ${starved} rib${starved > 1 ? 's pass' : ' passes'} less than the next cell needs.` : '');
}

/**
 * What the rods come to on this wing, for the Internal structure panel.
 *
 * Whether any crosses an opening is worked out here for every rib, from the
 * same openings the Rib tab draws; it is kept until the wing next changes.
 */
function rodSummary() {
  if (!M || M.error || !S.rods) return '';
  if (S.useRodSpec && M.rodSpecResult && !M.rodSpecResult.ok) {
    return `Not used: ${M.rodSpecResult.problems[0]}`;
  }
  const r = M.rods;
  if (!r || !r.count) return 'No rods: none of them fits a rib of this wing.';
  if (!M._rodClearance) {
    const holesByRib = {};
    if (S.ribHoles) {
      for (const rib of M.wing.ribs) {
        if (!r.rods.some((x) => x.rib === rib.index)) continue;
        holesByRib[rib.index] = openingsOf(rib).holes.map((h) => h.outline);
      }
    }
    M._rodClearance = checkRodClearance({ rods: r.rods, holesByRib });
  }
  const kinds = Object.entries(r.byGroup).map(([name, g]) => {
    const own = r.rods.filter((x) => x.group === name).map((x) => x.lengthM);
    return `${g.count} ${name} rod${g.count > 1 ? 's' : ''}, `
      + `${(Math.min(...own) * 100).toFixed(0)} to ${(Math.max(...own) * 100).toFixed(0)} cm`;
  });
  const what = S.useRodSpec && M.rodSpecResult ? `${M.rodSpecResult.note}. ` : '';
  return `${what}${kinds.join('; ')}: ${r.totalLengthM.toFixed(1)} m and `
    + `${r.totalMassG.toFixed(0)} g of rod in all`
    + (r.skipped.length ? `; ${r.skipped.length} not made (${r.skipped[0].why})` : '')
    + `. A nose rod is one piece, round the leading edge. `
    + (S.ribHoles ? `${M._rodClearance.note[0].toUpperCase()}${M._rodClearance.note.slice(1)}.` : '');
}

/**
 * How wide the cells are, centre to tip, and whether any is too narrow to sew.
 *
 * The old default spaced ribs by a sine rule that crowds them at the tip: 24
 * cells a side came out 335 mm wide at the centre and 11 mm at the tip, and
 * nothing on the page said so.
 */
function cellWidthNote() {
  if (!M || M.error || !M.wing) return '';
  const cw = cellWidths(M.wing.stations, { centreRib: hasCentreRib(M.wing) });
  if (!cw.widths.length) return '';
  const mmOf = (x) => `${(x * 1000).toFixed(0)} mm`;
  const own = LEP?.design ? ' — the design\'s own ribs' : '';
  let text = `Cells ${mmOf(cw.centreM)} wide at the centre, ${mmOf(cw.tipM)} at the tip${own}.`;
  if (!LEP?.design && S.distribution === 'chord') {
    text += S.cellTaper === 0
      ? ' At 0% they are all the same width.'
      : ' At 100% every cell would be the same shape in plan; the Swoop2\'s follow its chord by 73%.';
  }
  if (cw.tooNarrow) {
    text += ` ${cw.tooNarrow} of them ${cw.tooNarrow > 1 ? 'are' : 'is'} under `
      + `${mmOf(cw.minWidthM)}, the narrowest ${mmOf(cw.narrowestM)}: too narrow to sew.`
      + (S.distribution === 'cosine' ? ' Choose "Follow the chord".' : '');
  }
  return text;
}

/** What the diagonals come to, in words, for the Internal structure panel. */
function structureSummary() {
  const v = M.vribs;
  if (!v) return '';
  const free = v.unsupportedRibs || [];
  if (!S.vribs) {
    return free.length
      ? `Off. ${free.length} rib${free.length > 1 ? 's' : ''} a side (${free.join(', ')}) `
        + 'carry no line, and nothing carries their lift to one that does.'
      : 'Off, and none wanted: every rib carries a line.';
  }
  const f = structureFindings();
  if (!f) {
    return 'None placed: on the rows chosen, no rib without a line stands beside one with a line.';
  }
  const rows = [...new Set(v.vribs.map((x) => x.row))].sort();
  const parts = [
    `${v.own ? 'The design\'s own' : 'Placed from the line plan'}: `
      + `${rows.map((row) => `${row} ${v.vribs.filter((x) => x.row === row).length}`).join(', ')} `
      + `a side, ${(v.totalAreaM2 * 2).toFixed(2)} m² of cloth on the whole wing.`,
    f.tension.fullyTaut === f.tension.count
      ? 'All are in tension across their whole width.'
      : `${f.tension.count - f.tension.fullyTaut} of ${f.tension.count} are slack over part of their width.`,
    `${f.geom.note[0].toUpperCase()}${f.geom.note.slice(1)}.`,
    `${f.balance.note[0].toUpperCase()}${f.balance.note.slice(1)}`
      + (v.own && f.balance.strapsNeeded.length && LEP?.hv?.general?.length
        ? ` — the file states ${LEP.hv.general.length} such pieces, which are not drawn or cut here.`
        : '.'),
  ];
  if (free.length) {
    parts.push(`Rib${free.length > 1 ? 's' : ''} ${free.join(', ')} `
      + `${free.length > 1 ? 'have' : 'has'} no line and no diagonal reaching `
      + `${free.length > 1 ? 'them' : 'it'}.`);
  }
  if (v.notPlaced && v.notPlaced.length) {
    parts.push(`${v.notPlaced.length} stated in the file could not be placed (${v.notPlaced[0].why}).`);
  }
  // Two ways of counting the same ribs, said once where both are in play.
  if (M.imported && (f.balance.oneSided.length || free.length)) {
    parts.push('Ribs are numbered from 0 at the centre here; the file numbers them from 1.');
  }
  return parts.join(' ');
}

/**
 * Everything cut out of, sewn to or marked on one rib, in the rib's own
 * plane, metres.
 *
 * One source for the Rib tab and the rib pattern file. They were two: the
 * tab drew the anchors, the openings, the rods and the diagonals, and the
 * DXF wrote the outline — so the file a rib is cut from left out everything
 * that makes it a rib of this wing.
 */
function ribFeatures(rib) {
  // The rib as it is CUT: its own section, with the washin, yaw and dihedral
  // undone. Anything computed in 3D on the rib — a rod, a diagonal's foot —
  // comes back into this plane through the placement's own inverse.
  const flat = (p) => toRibPlane(rib, p);
  const upper = rib.section ? rib.section.upper : rib.upper.map(flat);
  const lower = rib.section ? rib.section.lower : rib.lower.map(flat);
  const loop = upper.slice().reverse().concat(lower.slice(1));
  // Anchors on THIS rib. An imported design says per rib — the Swoop2's tip
  // rib has its own — and has only the rows it has.
  const anchorsHere = rib.anchors ?? M.airfoil.anchors ?? {};
  const onLower = (u) => {
    for (let i = 1; i < lower.length; i++) {
      if ((lower[i - 1][0] - u) * (lower[i][0] - u) <= 0 && lower[i][0] !== lower[i - 1][0]) {
        const t = (u - lower[i - 1][0]) / (lower[i][0] - lower[i - 1][0]);
        return [u, lower[i - 1][1] + t * (lower[i][1] - lower[i - 1][1])];
      }
    }
    return lower[lower.length - 1];
  };
  // Where lines attach to THIS rib: the plan's own upper lines that end on
  // it, each at the point the plan puts it, brought into the rib's plane.
  //
  // Every rib was given an anchor at every row's station, lined or not — so
  // on a wing with a line on every second rib, half the ribs were drawn
  // (and would have been marked for sewing) with four attachments they do
  // not have, and none showed its brake or stabilo point.
  const seen = new Set();
  const anchors = [];
  for (const l of (M.linePlan ? M.linePlan.lines : [])) {
    if (l.level !== 'upper' || l.ribIndex !== rib.index || !Array.isArray(l.to)) continue;
    const point = flat(l.to);
    const row = l.row === 'K' ? 'K' : (l.anchorRow ?? l.row);
    const key = `${row}:${point[0].toFixed(4)}`;
    if (seen.has(key)) continue;          // the two halves' lines to a centre rib
    seen.add(key);
    anchors.push({ row, name: l.name, fraction: point[0] / rib.chord, point });
  }
  anchors.sort((a, b) => a.point[0] - b.point[0]);
  // With no plan at all, the stations the section gives.
  if (!M.linePlan) {
    for (const [row, frac] of Object.entries(anchorsHere)) {
      if (frac > 0) anchors.push({ row, name: row, fraction: frac, point: onLower(frac * rib.chord) });
    }
  }

  // One set of openings, two jobs: a lightening hole in a rib is already a
  // cross-port. An imported design's are its own (its section 4), not ones
  // this tool would have cut.
  const ownHoles = M.imported && LEP?.holes ? LEP.holes.byRib.get(rib.index) : null;
  let holeSet = null;
  let holes = [];
  if (S.ribHoles && ownHoles) {
    holes = ownHoles.map((h) => h.outline);
  } else if (S.ribHoles) {
    holeSet = openingsOf(rib);
    holes = holeSet.holes.map((h) => h.outline.map(([x, y]) => [x, y]));
  }

  // Rods on this rib. An imported design's come with their own shape, in
  // this rib's section coordinates — a nose rod that leaves the surface
  // across its end zones, or an upper-surface batten.
  const rodsHere = S.rods && M.rods && M.rods.count
    ? M.rods.rods.filter((r) => r.rib === rib.index) : [];
  // Every rod carries its own shape in this rib's plane: the design's own,
  // or one built the same way for a wing that is not a file.
  const rods = rodsHere.filter((r) => r.points).map((r) => ({ rod: r, points: r.points }));
  // A rod across an opening has nothing to be sewn to.
  const rodClash = rodsHere.length && holes.length && !M.rods.own
    ? new Set(checkRodClearance({ rods: rodsHere, holesByRib: { [rib.index]: holes } })
      .clashes.map((x) => x.group))
    : new Set();

  // Diagonals that touch this rib: the point where one's apex lands on a rib
  // with a line, and the run along which one's base is sewn to a rib without.
  //
  // One mark for each row: the two diagonals that leave one anchor for the
  // ribs either side share their apex, and the two that land on a free rib
  // from either side share their run. Marked one by one, their labels were
  // written on top of each other.
  const apexes = [];
  const bases = [];
  if (M.vribs && M.vribs.count) {
    for (const v of M.vribs.vribs) {
      if (v.fromRib === rib.index) {
        let a = apexes.find((x) => x.row === v.row);
        if (!a) { a = { row: v.row, toRibs: [], point: flat(v.apex) }; apexes.push(a); }
        a.toRibs.push(v.toRib);
      }
      if (v.toRib === rib.index) {
        let b = bases.find((x) => x.row === v.row);
        if (!b) { b = { row: v.row, fromRibs: [], points: v.base.map(flat) }; bases.push(b); }
        b.fromRibs.push(v.fromRib);
      }
    }
    for (const a of apexes) { a.toRibs.sort((p, q) => p - q); a.label = `${a.row}>${a.toRibs.join(',')}`; }
    for (const b of bases) { b.fromRibs.sort((p, q) => p - q); b.label = `${b.row}<${b.fromRibs.join(',')}`; }
  }

  // The air intake, on the lower surface, by chord position on the section.
  const intakeSpec = rib.intake ?? M.airfoil.intake;
  const intakeRun = intakeSpec
    ? lower.filter(([u]) => u >= intakeSpec.start * rib.chord && u <= intakeSpec.end * rib.chord)
    : [];
  const intakeEnds = intakeSpec && intakeSpec.end > intakeSpec.start
    ? [onLower(intakeSpec.start * rib.chord), onLower(intakeSpec.end * rib.chord)] : [];

  // What actually gets cut: the outline, a seam allowance outside it.
  const allowance = S.seamAllowance / 1000;
  const cutLine = allowance > 0 ? offsetClosedLoop(loop, allowance) : [];

  return {
    flat, upper, lower, loop, cutLine, anchorsHere, onLower, anchors,
    ownHoles, holeSet, holes, rodsHere, rods: rods.map((r) => r.points), rodShapes: rods,
    rodClash,
    apexes, bases, intakeSpec, intakeRun, intake: intakeEnds,
  };
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

  // The rib as it is CUT, and everything on it — the same that the rib
  // pattern file is written from.
  const F = ribFeatures(rib);
  const { upper, lower, loop } = F;

  const c = canvas('vp-rib', loop.concat(F.cutLine).concat([[0, 0], [rib.chord, 0]]));
  c.grid(0.1);

  // Chord line and the section.
  c.path([[0, 0], [rib.chord, 0]], '#4e6270', 0.8, { dash: '5 4' });
  c.path(loop, '#35d6e8', 1.6, { close: true });

  // Dimensions on the rib, which is the drawing a builder works from.
  //
  // Chord along the datum, maximum thickness where it actually occurs, and
  // each anchor's position — the three things someone marking out a rib has
  // to measure.
  // Everything written under the rib hangs from one baseline, below the
  // lowest thing drawn. The chord dimension sat on a fixed offset from the
  // chord line, which put it along the lower surface for half its length;
  // the anchor dimensions were four overlapping lines with each label at
  // the middle of its own, so "B 715" stood a third of a metre from the
  // leading edge; and the notes below were placed in fractions of chord,
  // where two of them met.
  const lowest = Math.min(...loop.map((q) => q[1]), ...F.cutLine.map((q) => q[1]));
  const yAnchors = lowest - rib.chord * 0.022;
  const yChord = yAnchors - rib.chord * 0.040;
  const yNotes = (S.dimensions ? yChord : lowest) - rib.chord * 0.045;
  // What is said about this rib under the drawing, on one line.
  const said = [];
  if (S.dimensions) {
    c.dim([0, yChord], [rib.chord, yChord], `${rib.chord.toFixed(3)} m chord`);

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

    // Where each line attaches, measured from the leading edge: one line,
    // a tick under each anchor, and the distance written at the tick.
    if (F.anchors.length) {
      const last = Math.max(...F.anchors.map((a) => a.point[0]));
      c.path([[0, yAnchors], [last, yAnchors]], '#ff9f5e', 0.8, { opacity: 0.85 });
      const tick = rib.chord * 0.006;
      for (const x of [0, ...F.anchors.map((a) => a.point[0])]) {
        c.path([[x, yAnchors - tick], [x, yAnchors + tick]], '#ff9f5e', 0.8, { opacity: 0.85 });
      }
      for (const a of F.anchors) {
        c.text(`${a.row} ${(a.point[0] * 1000).toFixed(0)}`, [a.point[0], yAnchors],
          '#ff9f5e', 8, 'middle', [0, 16]);
      }
    }
  }

  // Rods, on the rib rather than on a section of their own.
  //
  // They were drawn in a separate viewport that redrew a bare aerofoil with
  // no holes, no anchors and no diagonals — a second, poorer rib view. A rod
  // on its own says nothing: what a designer needs to see is that a nose rod
  // goes round the nose in one piece, where its ends leave the surface, and
  // whether it clears the openings.
  if (S.rods && M.rods && M.rods.count) {
    const onThis = F.rodsHere;
    for (const { rod: r, points } of F.rodShapes) {
      if (points.length < 2) continue;
      // The nose rod yellow, a batten orange; an imported design's blocs
      // the same way round. Red where one crosses an opening.
      const nose = r.kind ? r.kind === 'nose' : r.bloc === 1;
      c.path(points, F.rodClash.has(r.group) ? '#ff5e5e' : (nose ? '#e8c547' : '#ff9f5e'),
        r.diameterMM ? Math.max(2, r.diameterMM * 1.6) : 2.4);
    }
    if (onThis.length) {
      said.push({
        text: `rods ${onThis.map((r) => `${r.group} ${(r.lengthM * 100).toFixed(1)} cm`).join(', ')}`
          + (F.rodClash.size ? ' — one crosses an opening' : ''),
        bad: F.rodClash.size > 0,
      });
    }
  }

  // Seam allowance, which is what actually gets cut: the outline moved out
  // by the allowance all the way round.
  if (F.cutLine.length) {
    c.path(F.cutLine, '#5fd97a', 0.7, { close: true, dash: '4 3', opacity: 0.8 });
  }

  // Air intake, on the lower surface, by chord position on the section.
  if (F.intakeRun.length > 1) c.path(F.intakeRun, '#ff5e5e', 3);

  // Line anchors that pass through this rib, at their chord position.
  // The row's letter stands above the anchor, inside the rib: below it is
  // where the dimensions are, and the letter C used to land on their line.
  for (const a of F.anchors) {
    c.dot(a.point, '#6e8bff', 2.4);
    c.text(a.row, a.point, '#6e8bff', 9, 'middle', [0, -9]);
  }

  // One set of openings, two jobs.
  //
  // A lightening hole in a rib is already a cross-port — air passes through
  // it. Generated separately they overlapped by up to 270 mm on the root rib;
  // designed once against both constraints they cannot.
  for (const h of F.holes) c.path(h, '#5fd97a', 1.1, { close: true });
  if (S.ribHoles && F.ownHoles) {
    if (F.ownHoles.length) {
      said.unshift({ text: `${F.ownHoles.length} holes, the design's own`, bad: false });
    }
  } else if (S.ribHoles && F.holeSet) {
    const set = F.holeSet;
    if (set.holes.length) {
      said.unshift({
        text: `openings take out ${(set.removedFraction * 100).toFixed(0)}% of the rib`
          + (Number.isFinite(set.ventilationMarginRatio)
            ? ` and pass ${set.ventilationMarginRatio.toFixed(1)}× the air the next cell needs`
              + ` (sized by ${set.sizedBy})`
            : '; no cell outboard of this rib'),
        bad: !set.ventilates,
      });
    }
  }

  // The cell intake, against where the flow stagnates on THIS rib.
  //
  // Air enters at total pressure only where the flow stagnates, and that
  // point runs aft along the lower surface as the wing is flown slower and
  // forward to the nose on the bar. The check used two numbers of its own —
  // a "lower cut" and an "upper cut" typed into another panel — rather than
  // the opening the section actually has, and a stagnation formula that put
  // the point two to ten times too far back.
  let intakeNote = '';
  if (S.showIntake) {
    const sectionHere = (M.imported && M.imported.explicitRibs[rib.index]?.airfoil) || M.airfoil;
    const it = rib.intake ?? M.airfoil.intake;
    if (it && sectionHere?.points && it.end > it.start) {
      const opening = [-it.end, -it.start];
      // The rib's own angle of attack: the wing's, plus its washin.
      const trimDeg = S.alphaDeg + (rib.alphaDeg || 0);
      const at = (a) => intakeFeed(sectionHere, a, opening, { thinAirfoilFn: thinAirfoil });
      const feed = { bar: at(trimDeg - 3), trim: at(trimDeg), slow: at(trimDeg + 6) };
      const where = (f) => `${(Math.abs(f.stagnation) * 100).toFixed(1)}% `
        + `${f.stagnation < 0 ? 'under' : 'over'} the nose`;
      const fed = (f) => (f.inside ? 'total pressure' : `Cp ${f.feedCp.toFixed(2)}`);
      intakeNote = `  ·  intake ${(it.start * 100).toFixed(1)}–${(it.end * 100).toFixed(1)}% c: `
        + `at ${trimDeg.toFixed(1)}° the flow stagnates ${where(feed.trim)} and the opening `
        + `is fed at ${fed(feed.trim)}; ${fed(feed.bar)} three degrees faster, `
        + `${fed(feed.slow)} six slower (thin-aerofoil, first order)`;
      // On the drawing: where the flow stagnates at trim.
      const sx = Math.abs(feed.trim.stagnation) * rib.chord;
      const surf = feed.trim.stagnation < 0 ? lower : upper;
      const hit = surf.reduce((b, q) => (Math.abs(q[0] - sx) < Math.abs(b[0] - sx) ? q : b), surf[0]);
      c.dot(hit, '#ffffff', 2.6);
      c.text('stagnation', hit, '#c9d4da', 8, 'end', [-6, 3]);
    }
  }

  // Diagonal ribs that touch this rib. A builder needs both marks: the point
  // where a diagonal's apex lands on a loaded rib, and the line along which
  // its base is sewn to an unloaded one.
  // Written beside the row's letter, above the lower surface. Level with the
  // dot, the label lay along the surface line and could not be read. Where
  // a diagonal hangs from a station with no line of its own — the Swoop2
  // does this at its tip — the row is spelt out, since no letter stands
  // there.
  for (const a of F.apexes) {
    c.dot(a.point, '#e85bc4', 3.2);
    const lettered = F.anchors.some((x) => x.row === a.row
      && Math.abs(x.point[0] - a.point[0]) < rib.chord * 0.01);
    c.text(`${lettered ? '' : a.row}→${a.toRibs.join(',')}`, a.point, '#e85bc4', 8, 'start',
      [lettered ? 6 : 0, -9]);
  }
  for (const b of F.bases) {
    c.path(b.points, '#e85bc4', 2.4, { opacity: 0.9 });
    // Which rib each one comes from, written under the run it is sewn along.
    const mid = b.points[Math.floor(b.points.length / 2)];
    c.text(`${b.row}←${b.fromRibs.join(',')}`, mid, '#e85bc4', 8, 'middle', [0, 12]);
  }

  // Leading and trailing edge markers.
  c.dot(upper[0], '#e8c547', 2.4);
  c.dot(upper[upper.length - 1], '#e8c547', 2.4);

  // The notes, on one line under everything else.
  if (said.length) {
    c.text(said.map((x) => x.text).join('  ·  '), [rib.chord * 0.5, yNotes],
      said.some((x) => x.bad) ? '#ff5e5e' : '#9fb0ba', 9, 'middle');
  }

  c.fit();
  enablePanZoom('vp-rib');

  const t = Math.max(...loop.map((p) => p[1])) - Math.min(...loop.map((p) => p[1]));
  note.textContent =
    `rib ${rib.index} of ${M.wing.ribs.length - 1} (cut ${ribCopies(M.wing, rib.index)})`
    + `  ·  station ${rib.station.toFixed(3)} m`
    + `  ·  chord ${rib.chord.toFixed(3)} m  ·  thickness ${(t / rib.chord * 100).toFixed(1)}%`
    + `  ·  washin ${rib.alphaDeg.toFixed(2)}°  ·  dihedral ${rib.betaDeg.toFixed(1)}°`
    + `  ·  yaw ${rib.zetaDeg.toFixed(2)}°  ·  φ ${rib.phiDeg.toFixed(2)}°`
    + `  ·  ${F.anchors.length
      ? `lines on ${F.anchors.map((a) => a.row).join(' ')}` : 'no line on this rib'}`
    + (M.vribs && M.vribs.count
      ? `  ·  ${F.apexes.reduce((n, a) => n + a.toRibs.length, 0)} diagonals from here, `
        + `${F.bases.reduce((n, b) => n + b.fromRibs.length, 0)} landing`
      : '')
    + intakeNote;
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
 * Nothing in the interface reads that cascade any more. It went on being
 * built on every rebuild — from every second rib and a riser point under
 * the lines alone — and stored on the model, where it made any setting that
 * moved it look as if it did something. It is no longer built here.
 */
function linesCSV() {
  const plan = M.linePlan;
  const byName = new Map();
  if (M.lengths) for (const l of M.lengths.lines) byName.set(l.name, l);
  const sized = new Map();
  if (M.lineSelection) {
    for (const l of M.lineSelection.lines) if (l.line) sized.set(l.name, l.line);
  }
  const loads = new Map();
  if (M.loads && M.loads.tensions) {
    for (const t of M.loads.tensions.lines) loads.set(t.name, t.tensionN);
  }

  // An imported design's sheet is its own: each line under the label its
  // program gives it, cut to its program's length, in the line its own
  // table names, with the load its program put on it. This tool's load on
  // the same line is beside it, as a second opinion.
  const own = plan.source === 'LEparagliding';
  const out = [own
    ? 'name,label,row,level,rib_index,flying_mm,sewn_mm,cut_mm,design_load_kg,load_N,material,diameter_mm'
    : 'name,row,level,rib_index,flying_mm,sewn_mm,cut_mm,load_N,material'];
  for (const l of plan.lines) {
    const c = byName.get(l.name);
    const mat = sized.get(l.name);
    const loadN = loads.get(l.name);
    if (own) {
      out.push([
        l.name, l.label ?? '', l.row, l.level, l.ribIndex ?? '',
        l.lengthMM != null ? Math.round(l.lengthMM) : '',
        c ? c.sewnLengthMM : '',
        c ? c.cutLengthMM : '',
        Number.isFinite(l.loadDaN) ? (l.loadDaN / 0.980665).toFixed(2) : '',
        Number.isFinite(loadN) ? loadN.toFixed(1) : '',
        mat ? mat.code : '',
        mat ? mat.diameterMM : '',
      ].join(','));
    } else {
      out.push([
        l.name, l.row, l.level, l.ribIndex ?? '',
        l.lengthMM != null ? Math.round(l.lengthMM) : '',
        c ? c.sewnLengthMM : '',
        c ? c.cutLengthMM : '',
        c && Number.isFinite(c.flightN) ? c.flightN.toFixed(1) : '',
        mat ? mat.code : '',
      ].join(','));
    }
  }

  out.push('');
  out.push('# totals, both sides');
  const byRow = {};
  for (const l of plan.lines) byRow[l.row] = (byRow[l.row] || 0) + (l.lengthMM || 0) * 2;
  for (const [row, mm] of Object.entries(byRow)) {
    out.push(`# row ${row},,,,${(mm / 1000).toFixed(3)} m`);
  }
  out.push(`# TOTAL,,,,${plan.totalLengthM.toFixed(3)} m`);
  if (own && plan.lep?.totals) {
    const t = plan.lep.totals;
    out.push(`# as LEparagliding totals them: ${t.cutM.toFixed(2)} m without loops, `
      + `${t.withLoopsM.toFixed(2)} m with; ${t.weightKg.toFixed(3)} kg and `
      + `${t.lineAreaM2.toFixed(3)} m2 with the risers`);
    for (const y of Object.values(t.byType ?? {})) {
      out.push(`# type ${y.type} ${y.label},,,,${y.metres.toFixed(2)} m to buy, `
        + `${y.count} pieces, ${y.diameterMM} mm, loops ${y.loopCm} cm`);
    }
  } else if (M.lengths) {
    // `cutMetres` is one half of the wing, so it is doubled here like the
    // totals above it. It was written as the half under "both sides".
    out.push(`# cut length,,,,${(M.lengths.cutMetres * 2).toFixed(3)} m `
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

/**
 * Save a viewport as SVG, exactly as drawn.
 *
 * The drawings are already SVG, so this is the honest export: vector, the
 * size the geometry actually is, openable in any editor. The background is
 * painted in because an SVG with no background renders on whatever the
 * viewer uses, and a light-mode drawing on a dark page is unreadable.
 */
function saveViewportSVG(id, filename) {
  const svg = document.getElementById(id);
  if (!svg || !svg.outerHTML) {
    setStatus('Nothing to save from that view.');
    return;
  }
  const bg = S.theme === 'light' ? '#ffffff' : '#0d1317';
  let markup = svg.outerHTML;
  // A standalone file needs the namespace; the one in the page inherits it.
  if (!/xmlns=/.test(markup)) {
    markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  markup = markup.replace(/(<svg[^>]*>)/,
    `$1<rect x="-100000" y="-100000" width="200000" height="200000" fill="${bg}"/>`);
  save(filename, markup);
}

/**
 * Save a viewport as PNG.
 *
 * Rasterised through a canvas at a chosen scale, because a PNG is what goes
 * into a document or a message and an SVG often is not. The scale matters:
 * a drawing captured at screen size is unreadable when printed, so it is
 * rendered at three times the on-screen size by default.
 */
function saveViewportPNG(id, filename, scale = 3) {
  const svg = document.getElementById(id);
  if (!svg || !svg.outerHTML) {
    setStatus('Nothing to save from that view.');
    return;
  }
  if (typeof Image === 'undefined' || !document.createElement('canvas').getContext) {
    setStatus('This browser cannot rasterise; use SVG instead.');
    return;
  }
  const box = svg.viewBox && svg.viewBox.baseVal;
  const w = Math.max(1, Math.round((box && box.width ? box.width : 800)));
  const h = Math.max(1, Math.round((box && box.height ? box.height : 500)));
  const bg = S.theme === 'light' ? '#ffffff' : '#0d1317';
  let markup = svg.outerHTML;
  if (!/xmlns=/.test(markup)) {
    markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      if (!png) { setStatus('Could not make a PNG.'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = filename;
      document.body.append(a); a.click(); a.remove();
      setStatus(null, `Saved ${filename}`);
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus('Could not rasterise that view; use SVG instead.');
  };
  img.src = url;
}

/**
 * A save control on every viewport.
 *
 * Added from script rather than written into the page, so a new viewport gets
 * one without anybody remembering to. Every drawing the tool makes can leave
 * it as vector or as a picture.
 */
function addViewportSavers() {
  const views = [
    ['vp-plan', 'plan'], ['vp-front', 'front'], ['vp-iso', 'isometric'], ['vp-section', 'section'],
    ['vp-cut', 'cut'], ['vp-rib', 'rib'], ['vp-diag', 'structure'],
    ['vp-lineplan', 'lines'], ['vp-polar', 'polar'], ['vp-atmos', 'atmosphere'],
  ];
  for (const [id, what] of views) {
    const svg = document.getElementById(id);
    if (!svg || !svg.parentNode) continue;
    const label = svg.parentNode.querySelector
      ? svg.parentNode.querySelector('.vp-label') : null;
    if (!label || label.querySelector?.('.vp-save')) continue;
    const box = el('span', 'vp-save');
    for (const [kind, fn] of [
      ['SVG', () => saveViewportSVG(id, `${S.name}-${what}.svg`)],
      ['PNG', () => saveViewportPNG(id, `${S.name}-${what}.png`)],
    ]) {
      const b = el('button', 'vp-save-btn', kind);
      b.addEventListener('click', fn);
      box.append(b);
    }
    label.append(box);
  }
}

/* ---------------------------------------------------------------- misc  -- */

/**
 * A drawing colour, adjusted for the theme.
 *
 * The palette is the AutoCAD Color Index the handbook's own DXF uses, warmed
 * for a dark screen. Those values are chosen to glow on near-black and they
 * wash out on white, so light mode darkens them rather than using a second
 * hand-written palette that would drift from the first.
 *
 * A few are not geometry at all — the grid, the faint text, the white used
 * for anchor dots — and those invert rather than darken.
 */
const LIGHT_SWAP = {
  '#ffffff': '#11181d',   // anchor dots: white on dark, near-black on light
  '#cccccc': '#33414a',
  '#8a9aa6': '#4a5a66',   // dimension labels
  '#4e6270': '#6b7d8a',   // faint rules
  '#1a252c': '#dfe6ea',   // minor grid
  '#2c3d47': '#c3d0d7',   // major grid
  '#26343d': '#cfd9df',
  '#8a8a8a': '#6a6a6a',
};

function themeColour(hex, light) {
  if (!light || typeof hex !== 'string' || hex[0] !== '#') return hex;
  const swap = LIGHT_SWAP[hex.toLowerCase()];
  if (swap) return swap;
  // Darken a saturated colour towards its own hue rather than towards grey,
  // so a yellow stays recognisably yellow at a readable contrast on white.
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const k = 0.62;
  const to2 = (v) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

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
