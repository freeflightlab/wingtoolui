/* lep.js — interoperability with LEparagliding data files.
 *
 * `leparagliding.txt` is the input format of the author's own FORTRAN design
 * program. It has 37 sections covering everything from planform geometry to
 * nylon rod pockets, roman numeral sizes and DXF layer names. This project
 * models perhaps a fifth of that.
 *
 * So the design decision here is: **never discard what is not understood**.
 * A file is parsed into an ordered list of sections, each keeping its exact
 * original lines. Sections that map onto this project's model (1 geometry,
 * 2 airfoils, 3 anchor points, 8 angle-of-attack estimate) are additionally
 * decoded. Everything else — rib holes, V-ribs, joncs, skin tension curves,
 * colours — rides along untouched and is written back byte for byte.
 *
 * That is what makes a round trip safe. Someone can bring a real design in,
 * adjust the planform here, write it out, and their rod pockets and diagonal
 * ribs will still be exactly as they left them.
 *
 * --------------------------------------------------------------------------
 * Conventions that differ from this project's, and must be converted
 * --------------------------------------------------------------------------
 *   units   LEP works in centimetres; this project works in metres.
 *   axes    LEP: X spanwise, Y chordwise, Z "growing from the wing to the
 *           pilot" — i.e. downward. This project: x chordwise, y spanwise,
 *           z upward. So lepZ = -100 * z, and the two are not interchangeable
 *           even in sign-free contexts like a tip height.
 *   scale   A wing-scale factor multiplies the whole geometry matrix.
 *
 * Format rules taken from the manual: lines beginning with `*` are comments
 * that must be kept to preserve the reading sequence, blank lines are not
 * allowed, and trailing text after the expected parameters is ignored.
 */

const SECTION_BANNER = /^\*\s*(\d+)\s*\.\s*(.*?)\s*\*?\s*$/;

/**
 * Parse a LEP data file into an editable document.
 * Keeps every original line, so `writeLep(parseLep(t)) === t`.
 */
export function parseLep(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = /\n$/.test(text);
  const lines = text.split(/\r?\n/);
  if (trailingNewline) lines.pop();

  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line[0] !== '*') continue;
    const m = line.match(SECTION_BANNER);
    if (!m) continue;
    const number = parseInt(m[1], 10);
    // A banner is a comment naming a section. Data lines that happen to be
    // comments (e.g. "* Brand name") do not match, because they have no
    // leading "N.". Guard against a runaway match on something like a date.
    if (!Number.isFinite(number) || number < 1 || number > 99) continue;
    if (sections.length && number <= sections[sections.length - 1].number) continue;
    sections.push({ number, title: m[2].replace(/\*+$/, '').trim(), banner: i });
  }
  if (!sections.length) throw new Error('No LEparagliding sections found — is this a leparagliding.txt file?');

  // A section owns every line from its banner up to the line before the next
  // section's decorative rule. The rule is the run of "***" lines immediately
  // preceding a banner, which belongs to the section it introduces.
  for (let s = 0; s < sections.length; s++) {
    const next = sections[s + 1];
    let end = next ? next.banner : lines.length;
    if (next) {
      while (end > sections[s].banner + 1 && /^\*{3,}/.test(lines[end - 1])) end--;
    }
    sections[s].start = sections[s].banner;
    sections[s].end = end;
    // Walk back over this section's own decorative rule.
    let b = sections[s].banner;
    while (b > 0 && /^\*{3,}/.test(lines[b - 1]) && (s === 0 || b - 1 > sections[s - 1].end - 1)) b--;
    sections[s].start = b;
    sections[s].dataIndices = [];
    for (let i = sections[s].banner + 1; i < end; i++) {
      if (lines[i][0] !== '*') sections[s].dataIndices.push(i);
    }
  }

  return { lines, sections, eol, trailingNewline };
}

/** Serialise back. Byte-identical to the input if nothing has been edited. */
export function writeLep(doc) {
  return doc.lines.join(doc.eol) + (doc.trailingNewline ? doc.eol : '');
}

/** Locate a section by its number. */
export function section(doc, number) {
  return doc.sections.find((s) => s.number === number) || null;
}

/** The non-comment lines of a section, in order. */
export function sectionData(doc, number) {
  const s = section(doc, number);
  if (!s) return [];
  return s.dataIndices.map((i) => doc.lines[i]);
}

/** Split a data line into fields, honouring the "trailing text is ignored" rule. */
function fields(line) {
  return line.trim().split(/[\s\t]+/);
}

const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/** Strip the surrounding quotes the format uses for text fields. */
const unquote = (v) => String(v).trim().replace(/^"(.*)"$/, '$1');

/* ----------------------------------------------------------- section 1 -- */

/**
 * Section 1, the geometry matrix. Eleven columns per rib:
 *   rib, x-rib, y-LE, y-TE, xp, z, beta, RP, washin, rot_z, pos_z
 * The last two are optional — files written before the 2021 rotation study
 * do not have them, and must still read.
 */
export function readGeometry(doc) {
  const data = sectionData(doc, 1);
  if (data.length < 9) throw new Error('Section 1 is too short to hold a geometry matrix.');

  const brand = unquote(data[0]);
  const wingName = unquote(data[1]);
  const drawScale = num(data[2]);
  const wingScale = num(data[3]);
  const cells = parseInt(fields(data[4])[0], 10);
  const ribCount = parseInt(fields(data[5])[0], 10);

  const alphaF = fields(data[6]);
  const alpha = {
    tipDeg: num(alphaF[0]),
    mode: parseInt(alphaF[1], 10),
    centreDeg: alphaF.length > 2 ? num(alphaF[2]) : 0,
  };

  const typeF = fields(data[7]);
  const wingType = unquote(typeF[0]);
  const noRotateTriangles = typeF.length > 1 ? parseInt(typeF[1], 10) : 0;

  const ribs = [];
  for (let i = 8; i < data.length; i++) {
    const f = fields(data[i]);
    if (f.length < 9) continue;
    ribs.push({
      index: parseInt(f[0], 10),
      xRib: num(f[1]),      // spanwise position on the flat span, cm
      yLE: num(f[2]),       // chordwise LE, cm
      yTE: num(f[3]),       // chordwise TE, cm
      xp: num(f[4]),        // projected spanwise position, cm
      z: num(f[5]),         // height, cm, positive toward the pilot
      betaDeg: num(f[6]),
      rpPct: num(f[7]),
      washinDeg: num(f[8]),
      rotZDeg: f.length > 9 ? num(f[9]) : 0,
      posZPct: f.length > 10 ? num(f[10]) : 50,
    });
  }
  // The counts are for the WHOLE wing, but the matrix describes one half.
  // A 60-cell wing has 61 ribs and 31 matrix rows: the centre rib plus thirty
  // to the tip. An even rib count means a central cell of non-zero width and
  // no rib on the axis, so the half has exactly ribCount/2 rows.
  const expectedRows = Math.ceil(ribCount / 2);
  if (ribs.length !== expectedRows) {
    throw new Error(
      `Section 1 declares ${ribCount} ribs (${expectedRows} rows for the half wing) `
      + `but the matrix has ${ribs.length} rows.`,
    );
  }

  return {
    brand, wingName, drawScale, wingScale,
    cells,                    // whole wing
    ribCount,                 // whole wing
    halfCells: ribs.length - 1,
    centreRib: ribCount % 2 === 1,
    alpha, wingType, noRotateTriangles, ribs,
  };
}

/* --------------------------------------------------------- sections 2,3,8 -- */

export function readAirfoils(doc) {
  return sectionData(doc, 2).map((line) => {
    const f = fields(line);
    return {
      rib: parseInt(f[0], 10),
      file: f[1],
      intakeStartPct: num(f[2]),
      intakeEndPct: num(f[3]),
      open: parseInt(f[4], 10) === 1,
      displacementCm: f.length > 5 ? num(f[5]) : 0,
      relativeWeight: f.length > 6 ? num(f[6]) : 1,
      special: f.length > 7 ? num(f[7]) : 0,
    };
  }).filter((r) => Number.isFinite(r.rib));
}

export function readAnchors(doc) {
  return sectionData(doc, 3).map((line) => {
    const f = fields(line);
    return {
      rib: parseInt(f[0], 10),
      count: parseInt(f[1], 10),
      A: num(f[2]), B: num(f[3]), C: num(f[4]),
      D: num(f[5]), E: num(f[6]), F: num(f[7]),
    };
  }).filter((r) => Number.isFinite(r.rib));
}

/** Section 8: the designer's angle-of-attack and line-length estimate. */
export function readAoA(doc) {
  const d = sectionData(doc, 8).map((l) => num(fields(l)[0]));
  if (d.length < 6) return null;
  return {
    glideRatio: d[0],
    cpPct: d[1],
    calagePct: d[2],
    riserLengthCm: d[3],
    lineLengthCm: d[4],
    karabinerCm: d[5],
  };
}

/* ------------------------------------------------------------- to model -- */

/**
 * Convert a parsed LEP document into this project's geometry.
 *
 * The geometry matrix is discrete per-rib data, which is exactly what
 * `discretePlanform` and a discrete lobe consume. The per-rib beta, washin and
 * Z rotation are handed through as explicit overrides rather than being
 * recomputed, because the whole point of importing is to reproduce the file's
 * wing, not to re-derive a similar one.
 */
export function lepToDesign(doc) {
  const g = readGeometry(doc);
  const airfoils = readAirfoils(doc);
  const anchors = readAnchors(doc);
  const aoa = readAoA(doc);

  const k = g.wingScale / 100; // cm -> m, with the wing scale applied

  const planformRows = g.ribs.map((r) => ({
    y: r.xRib * k,
    xLE: r.yLE * k,
    xTE: r.yTE * k,
  }));

  const explicitRibs = g.ribs.map((r) => ({
    station: r.xRib * k,
    chord: (r.yTE - r.yLE) * k,
    xLE: r.yLE * k,
    washinDeg: r.washinDeg,
    betaDeg: r.betaDeg,
    zetaDeg: r.rotZDeg,
    // LEP's Z grows downward, toward the pilot; ours grows up.
    lobePoint: [r.xp * k, -r.z * k],
    rp: r.rpPct / 100,
    posZ: r.posZPct / 100,
  }));

  const first = anchors[0];
  const anchorFractions = first
    ? { A: first.A / 100, B: first.B / 100, C: first.C / 100, D: first.D / 100 }
    : null;

  const intake = airfoils[0]
    ? { start: airfoils[0].intakeStartPct / 100, end: airfoils[0].intakeEndPct / 100 }
    : null;

  return {
    name: g.wingName,
    brand: g.brand,
    geometry: g,
    planformRows,
    explicitRibs,
    anchorFractions,
    intake,
    airfoilFiles: [...new Set(airfoils.map((a) => a.file))],
    aoa,
    cells: g.cells,
    halfCells: g.halfCells,
    // Handy summary numbers, in metres.
    flatSpan: 2 * Math.max(...g.ribs.map((r) => r.xRib)) * k,
    projectedSpan: 2 * Math.max(...g.ribs.map((r) => r.xp)) * k,
    rootChord: (g.ribs[0].yTE - g.ribs[0].yLE) * k,
  };
}

/* ----------------------------------------------------------- from model -- */

const f2 = (v, w = 10) => v.toFixed(2).padStart(w);

/**
 * Rewrite sections 1, 2, 3 and 8 from this project's model, leaving every
 * other section exactly as it was. Returns a new document; the original is
 * not modified.
 *
 * The wing scale is written as 1.0 and the matrix carries true dimensions.
 * Keeping an imported scale factor and dividing the matrix by it would round
 * trip too, but it makes the file harder to read and invites the mistake of
 * scaling twice.
 */
export function writeDesignIntoLep(doc, model) {
  const out = { ...doc, lines: [...doc.lines], sections: doc.sections.map((s) => ({ ...s })) };

  const { wing, airfoil, name = 'wing', brand = 'Paraglider Design Tool', balance } = model;
  const ribs = wing.ribs;

  const geometryLines = [
    `"${brand}"`,
    `"${name}"`,
    '1.0',
    '1.0',
    // Counts are whole-wing; the matrix below is the half wing.
    `\t${(ribs.length - 1) * 2}`,
    `\t${ribs.length * 2 - 1}`,
    `\t${(wing.cfg.washinTotal ?? maxWashin(ribs)).toFixed(1)}        0         0.0`,
    '"ds" 0',
  ];
  for (const r of ribs) {
    geometryLines.push([
      String(r.index + 1).padStart(2),
      f2(r.station * 100),
      f2(r.xLE * 100),
      f2((r.xLE + r.chord) * 100),
      f2(r.lobePoint[0] * 100),
      f2(-r.lobePoint[1] * 100),   // back to LEP's downward Z
      f2(r.betaDeg),
      f2((wing.cfg.RP ?? 0.25) * 100),
      f2(r.alphaDeg),
      f2(r.zetaDeg),
      f2((wing.cfg.RL ?? 0.5) * 100),
    ].join(' '));
  }
  replaceSectionData(out, 1, geometryLines);

  const intakeStart = ((airfoil?.intake?.start ?? 0.012) * 100).toFixed(1);
  const intakeEnd = ((airfoil?.intake?.end ?? 0.055) * 100).toFixed(1);
  const airfoilFile = model.airfoilFile || `${(airfoil?.name || 'airfoil').replace(/\s+/g, '')}.txt`;
  const airfoilLines = ribs.map((r, i) =>
    `${i + 1}\t${airfoilFile}\t${intakeStart}\t${intakeEnd}\t1\t0\t1\t${i === 0 || i === ribs.length - 1 ? 1 : 15}`);
  replaceSectionData(out, 2, airfoilLines);

  const a = airfoil?.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  const anchorLines = ribs.map((r, i) =>
    `${i + 1}\t4\t${(a.A * 100).toFixed(1)}\t${(a.B * 100).toFixed(1)}\t${(a.C * 100).toFixed(1)}\t${(a.D * 100).toFixed(1)}\t0\t${i === 0 ? 0 : 100}`);
  replaceSectionData(out, 3, anchorLines);

  if (balance && section(out, 8)) {
    replaceSectionData(out, 8, [
      `\t${balance.glideRatio.toFixed(1)}`,
      `\t${(balance.xcpFraction * 100).toFixed(0)}`,
      `\t${(balance.calageFraction * 100).toFixed(0)}`,
      `\t${(model.riserLengthCm ?? 47).toFixed(0)}`,
      `\t${((model.lineLengthM ?? 6.5) * 100).toFixed(0)}`,
      `\t${(model.karabinerCm ?? 42).toFixed(0)}`,
    ]);
  }

  return out;
}

function maxWashin(ribs) {
  return Math.max(...ribs.map((r) => r.alphaDeg));
}

/**
 * Swap a section's data lines for new ones, keeping its comments in place and
 * shifting every later section's indices. Comments are kept at the head of the
 * section; if the new data is longer or shorter than the old, the difference
 * is absorbed at the end of the section.
 */
function replaceSectionData(doc, number, newData) {
  const s = section(doc, number);
  if (!s) throw new Error(`Section ${number} is not present in this file.`);
  const idx = s.dataIndices;
  if (!idx.length) throw new Error(`Section ${number} has no data lines to replace.`);

  // Keep any comment lines that sit between data lines by rebuilding the
  // section body: comments in their original relative order first, then data.
  const bodyStart = s.banner + 1;
  const body = doc.lines.slice(bodyStart, s.end);
  const comments = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i][0] === '*') comments.push({ at: i, text: body[i] });
  }

  const rebuilt = [];
  let d = 0;
  for (let i = 0; i < Math.max(body.length, comments.length + newData.length); i++) {
    const c = comments.find((x) => x.at === i);
    if (c && d < newData.length) rebuilt.push(c.text);
    else if (d < newData.length) rebuilt.push(newData[d++]);
    else if (c) rebuilt.push(c.text);
  }
  while (d < newData.length) rebuilt.push(newData[d++]);

  const delta = rebuilt.length - body.length;
  doc.lines.splice(bodyStart, body.length, ...rebuilt);

  for (const sec of doc.sections) {
    if (sec.banner > s.banner) {
      sec.banner += delta;
      sec.start += delta;
      sec.end += delta;
      sec.dataIndices = sec.dataIndices.map((i) => i + delta);
    }
  }
  s.end += delta;
  s.dataIndices = [];
  for (let i = bodyStart; i < s.end; i++) {
    if (doc.lines[i][0] !== '*') s.dataIndices.push(i);
  }
}

/** A short human summary of what a file contains, for the interface. */
export function describeLep(doc) {
  const g = readGeometry(doc);
  const k = g.wingScale / 100;
  const flat = 2 * Math.max(...g.ribs.map((r) => r.xRib)) * k;
  const proj = 2 * Math.max(...g.ribs.map((r) => r.xp)) * k;
  const usesZ = g.ribs.some((r) => Math.abs(r.rotZDeg) > 1e-9);
  return {
    name: g.wingName,
    brand: g.brand,
    cells: g.cells,
    ribs: g.ribCount,
    halfRows: g.ribs.length,
    flatSpan: flat,
    projectedSpan: proj,
    rootChord: (g.ribs[0].yTE - g.ribs[0].yLE) * k,
    wingScale: g.wingScale,
    usesZRotation: usesZ,
    sections: doc.sections.map((s) => s.number),
  };
}

/* --------------------------------------------------------- blank template -- */

const rule = (n = 62) => '*'.repeat(n);
const banner = (n, title) => [rule(), `*       ${n}. ${title}`, rule()];

/**
 * Build a complete, valid leparagliding.txt from nothing.
 *
 * The manual is explicit that the practical way to work is to start from an
 * existing file, because most of the 37 sections are "invariant parameters"
 * that a designer sets once and never touches. This generates those blocks
 * with the manual's own recommended values, so the tool can emit a file the
 * FORTRAN program will read even when the designer has not imported one.
 *
 * Sections that need real design decisions — rib holes, V-ribs, colours,
 * nylon rods — are written in their documented "off" form rather than
 * invented. Turning them on is a deliberate act, not a default.
 */
export function blankLepDocument(halfRibs = 25) {
  const L = [];
  const push = (...xs) => xs.forEach((x) => L.push(x));

  push(rule(62),
    '* LABORATORI D\'ENVOL PARAGLIDING DESIGN                      *',
    '* Input data file 3.28 version                               *',
    rule(62),
    '* Written by Paraglider Design Tool                          *',
    rule(62),
    '*             1. GEOMETRY                                    *',
    rule(62));
  push('* Brand name', '"Paraglider Design Tool"');
  push('* Wing name', '"wing"');
  push('* Drawing scale', '1.0');
  push('* Wing scale', '1.0');
  push('* Number of cells', `\t${(halfRibs - 1) * 2}`);
  push('* Number of ribs', `\t${halfRibs * 2 - 1}`);
  push('* Alpha wingtip, parameter, (alpha center)', '\t4.5        0         0.0');
  push('* Paraglider type and parameter', '"ds" 0');
  push('* Rib geometric parameters',
    '* Rib    x-rib       y-LE       y-TE         xp         z       beta      RP        Washin\tRot_z  Pos_z');
  for (let i = 1; i <= halfRibs; i++) {
    push(` ${String(i).padStart(2)}        .00        .00     100.00        .00        .00        .00      25.00        .00\t0.00\t50.0`);
  }

  push(...banner(2, 'AIRFOILS'), '* Airfoil name. intake in. intake out. open. disp   rweight');
  for (let i = 1; i <= halfRibs; i++) push(`${i}\tairfoil.txt\t1.2\t5.5\t1\t0\t1\t15`);

  push(...banner(3, 'ANCHOR POINTS'), '* Airf\tAnch\tA     B\t    C\tD\tE\tF');
  for (let i = 1; i <= halfRibs; i++) push(`${i}\t4\t8.5\t30.0\t53.0\t78.0\t0\t${i === 1 ? 0 : 100}`);

  // No rib holes: one configuration spanning all ribs, with zero holes.
  push(...banner(4, 'AIRFOIL HOLES'), '1', '1', String(halfRibs), '0');

  push(...banner(5, 'SKIN TENSION'),
    'Extrados',
    '0.\t\t0.0\t0.\t\t0.',
    '7.5\t\t1.3\t10.\t\t1.33',
    '15.\t\t2.5\t20.\t\t2.5',
    '80.\t\t2.5\t80.\t\t2.5',
    '90.\t\t1.33\t90.\t\t1.33',
    '100.\t\t0.0\t100.\t\t0.',
    '0.0114',
    '1000    1.0');

  push(...banner(6, 'SEWING ALLOWANCES'),
    '12\t22\t22\tupper panels (mm)',
    '12\t22\t22\tlower panels (mm)',
    '12\tribs (mm)',
    '12\tvribs (mm)');

  push(...banner(7, 'MARKS'), '25.\t0.5\t0.15');

  push(...banner(8, 'Global angle of attack estimation'),
    '* Finesse GR', '\t8.0',
    '* Plumb point % of chord', '\t30',
    '* Calage %', '\t33',
    '* Risers lenght cm', '\t47',
    '* Line lenght cm (without risers)', '\t650',
    '* Karabiners cm', '\t42');

  // A minimal three-riser, four-path cascade: enough to be valid and to be
  // edited, without pretending to be a designed lineset.
  push(...banner(9, 'SUSPENSION LINES DESCRIPTION'), '1', '3');
  for (let plan = 1; plan <= 3; plan++) {
    push('2');
    push(`2\t1 1\t2 1\t0 0\t0 0\t${plan} 2`);
    push(`2\t1 1\t2 2\t0 0\t0 0\t${plan} ${Math.max(3, Math.floor(halfRibs / 2))}`);
  }

  push(...banner(10, 'BRAKES'), '300', '2',
    `2\t1 1\t2 1\t0 0\t0 0\t6 2`,
    `2\t1 1\t2 2\t0 0\t0 0\t6 ${Math.max(3, Math.floor(halfRibs / 2))}`,
    '* Brake distribution',
    '0\t25\t50\t80\t100',
    '0\t0\t0\t0\t0');

  push(...banner(11, 'Ramification lengths'), '3\t180', '4\t275\t80', '3\t135', '4\t200\t80');
  push(...banner(12, 'H V and VH ribs'), '0', '70\t120');
  push(...banner(15, 'Extrados colors'), '1', '1\t1', '1\t0.\t0.');
  push(...banner(16, 'Intrados colors'), '1', '1\t1', '1\t0.\t0.');
  push(...banner(17, 'Aditional rib points'), '0');
  push(...banner(18, 'Elastic lines corrections'),
    '100', '75\t25', '40\t40\t20', '35\t35\t20\t10', '35\t35\t15\t10\t5',
    '1\t0.08\t0.2\t0.2', '2\t0.08\t0.2\t0.2', '3\t0.08\t0.2\t0.2',
    '4\t0.08\t0.2\t0.2', '5\t0.08\t0.2\t0.2');

  push(...banner(19, 'DXF layer names'), '10',
    'general         default', 'line-external\tcutexternal', 'line-sewing     cutinternal',
    'points\t\tpoints', 'circles\t\tcircles', 'triangles       triangle',
    'square          square', 'text\t\ttext', 'reference       refer', 'notes           notes');

  // The manual's recommended invariant block.
  push(...banner(20, 'Marks types'), '10',
    'typepoint   1  0.25  1.2     2  0.3  1.2',
    'typepoint2  1  0.25  1.2     2  0.2  1.2',
    'typepoint3  1  0.25  1.2     2  0.2  1.2',
    'typevent    1  10.   0.0     2  2.0  0.0',
    'typetab     1  10.   0.0     3  2.0  0.0',
    'typejonc    1  10.   0.0     2  2.0  0.0',
    'typeref     1  5.0   1.      1  2.0  0.0',
    'type8       1  0.2   5.0     1  0.0  5.0',
    'type9       1  0.0   7.0     1  3.2  4.5',
    'type10      1  0.0   6.0     1  0.0  3.33');

  push(...banner(21, 'JONCS DEFINITION (NYLON RODS)'), '0');
  push(...banner(22, 'NOSE MYLARS DEFINITION'), '0');
  push(...banner(23, 'TAB REINFORCEMENTS'), '0');
  push(...banner(24, 'GENERAL 2D DXF OPTIONS'), '0');
  push(...banner(25, 'GENERAL 3D DXF OPTIONS'), '0');
  push(...banner(26, 'GLUE VENTS'), '0');
  push(...banner(27, 'SPECIAL WING TIP'), '0');
  push(...banner(28, 'PARAMETERS FOR CALAGE VARIATION'), '0');
  push(...banner(29, '3D SHAPING'), '0');
  push(...banner(30, 'AIRFOIL THICKNESS MODIFICATION'), '0');
  push(...banner(31, 'NEW SKIN TENSION MODULE'), '0');
  push(...banner(32, 'PARAMETERS FOR PARTS SEPARATION'), '0');
  push(...banner(33, 'DETAILED RISERS'), '0');
  push(...banner(34, 'LINES CHARACTERISTICS TABLE'), '0');
  push(...banner(35, 'SOLVE EQUILIBRIUM EQUATIONS'), '0');
  push(...banner(36, 'CREATE FILES FOR XFLR5 ANALYSIS'), '0');
  push(...banner(37, 'SOME SPECIAL PARAMETERS'), '0');

  return parseLep(L.join('\n') + '\n');
}

/**
 * Write a LEP file for this project's model. Uses an imported document as the
 * template when there is one, so nothing the designer brought in is lost;
 * otherwise starts from a blank template.
 */
export function designToLep(model, template = null) {
  const doc = template || blankLepDocument(model.wing.ribs.length);
  return writeLep(writeDesignIntoLep(doc, model));
}
