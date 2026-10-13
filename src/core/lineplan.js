/* lineplan.js — risers and the line cascade, as production wings actually do it.
 *
 * The handbook's chapter 8 builds one cascade per anchor row. Real wings are
 * not built that way, and three production line sets make the difference plain:
 *
 *   - **Rows and risers are not the same thing.** A wing can carry four anchor
 *     rows (A B C D) on three risers, with the D lines cascading into the C
 *     riser. Assuming one riser per row gets the riser count wrong and the
 *     load split wrong with it.
 *   - **Levels are encoded in the names.** `A1` is an upper line reaching the
 *     canopy, `AM1` a middle line, `AR1` the line off the riser. `KMU`/`KML`
 *     and `CRU`/`CRL` split a level into upper and lower where a pulley or a
 *     rear-riser control needs it.
 *   - **A line serves several anchors.** Quantities run in pairs because the
 *     wing is symmetric, and one length often covers several named lines.
 *
 * The naming convention decoded here — row letter, optional level suffix,
 * index — is common to the production files this was built against, and the
 * topology can be recovered from lengths alone: for each anchor, the total
 * cascade length minus the upper line's length leaves the shared part of the
 * path, and those remainders collapse into exactly as many distinct values as
 * there are branches. That is what `inferTopology` does, and it is a strong
 * check: if the names and the lengths disagree, the remainders scatter.
 */

import { LOAD_ROW_SHARES } from './loads.js';
import { ribSurfacePoint } from './wing3d.js';

// 'S' is the stabilo — the outermost line, on its own riser on many wings.
// 'Z' is a collapse line. Both are real rows that carry names of their own.
// Rows A to I, not A to E.
//
// Five was enough for every double-surface wing in the reference set. A
// single-surface wing is different: it has no cells to gather loads into, so
// every attachment point gets its own row. Niviuk's Skin 4 P runs a through
// i — nine load-bearing rows — and rows F to I were being rejected as
// unrecognised, silently dropping a fifth of its line plan.
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'S', 'Z'];

/** The rows that carry flight load. K is the brake, S the stabilo, Z collapse. */
const LOAD_BEARING_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const BRAKE = 'K';
const COLLAPSE = 'Z';

/**
 * A name as UP Paragliders writes it, where case is the level.
 *
 *   a1 br3 sa1 st2     lowercase            at the canopy
 *   A1 BR3 ST2 DE1     uppercase + number   the line those hang from
 *
 * `BR` is the brake and `ST` the stabilo; two row letters are one line
 * carrying both rows. The roman-numeral and `main` forms are the same in
 * any reading and are left to `parseLineName`.
 */
function parseUpName(raw) {
  const m = raw.match(/^(br|st|s[a-e]|[a-i])(\d+)$/) || raw.match(/^(BR|ST|[A-I]{1,2})(\d+)$/);
  if (!m) return null;
  const group = m[1];
  const top = group === group.toLowerCase();
  const g = group.toUpperCase();
  const base = {
    name: raw,
    level: top ? 'upper' : 'middle',
    side: null,
    index: parseInt(m[2], 10),
    variant: null,
    isBrake: g === 'BR',
    isCollapse: false,
    convention: 'up',
  };
  if (g === 'BR') return { ...base, row: BRAKE };
  if (g === 'ST') return { ...base, row: 'S', isStabilo: true };
  if (top && group.length === 2) return { ...base, row: 'S', variant: group[1], isStabilo: true };
  if (g.length === 2) {
    if (g[0] === g[1]) return null;
    return { ...base, row: g[0], rows: [g[0], g[1]], combined: true };
  }
  return { ...base, row: g };
}

/**
 * Decode a line name.
 *   A1     -> row A, level 'upper',  index 1
 *   a1     -> row A, level 'upper',  index 1   (lowercase convention)
 *   AM6    -> row A, level 'middle', index 6
 *   AR3    -> row A, level 'main',   index 3
 *   KMU2   -> row K, level 'middle', side 'upper', index 2
 *   CRL4   -> row C, level 'main',   side 'lower', index 4
 *
 * Two conventions are in use for the lines that reach the canopy, and both
 * have to be read. Ozone writes them uppercase (`A1`), while PHI and BGD
 * write them lowercase (`a1`) and reserve uppercase for the cascade above.
 * Rejecting the lowercase form silently drops every canopy line in those
 * files — which is exactly what happened until a table that states its own
 * topology made the gap visible.
 *
 * UP Paragliders uses a third scheme, and it needs its own branch because it
 * distinguishes four levels where the others distinguish three:
 *
 *   a1      lowercase       top line, to the canopy
 *   A1      uppercase       middle
 *   AI      roman numeral   upper-main
 *   Amain1  'main' + index   main, at the riser
 *
 * Roman numerals matter here: `AI` and `A1` are different lines on the same
 * wing, and a parser that only sees digits reads `AI` as a name it does not
 * recognise and discards a whole cascade level. `CVI` is the sixth C-main,
 * not something beginning with `CV`.
 *
 * **One name cannot say whose scheme it is in.** `A1` is a canopy line on an
 * Ozone sheet and the line under the canopy lines on a UP one; `BR1` is the B
 * row's first main line to Ozone and BGD and a brake middle line to UP. So a
 * reader that knows whose sheet it has says so — `{ convention: 'up' }` —
 * and without that a bare name is read Ozone's way.
 *
 * That was written above for a long time and not done: the table of UP's
 * four levels sat over a function that returned 'upper' for `A1` whatever
 * sheet it came from. Every UP component sheet was read with its middle
 * lines counted as canopy lines, its brake middles as mains of the B row,
 * and its stabilo's own main line (`STI`) dropped as unreadable.
 */
export function parseLineName(name, { convention = null } = {}) {
  const raw = String(name).trim();

  if (convention === 'up') {
    const up = parseUpName(raw);
    if (up) return up;
  }

  // UP Paragliders distinguishes four cascade levels where the others
  // distinguish three, and names two of them differently:
  //
  //   a1      lowercase       top line, to the canopy
  //   A1      uppercase       middle
  //   AI      roman numeral   upper-main
  //   Amain1  'main' + index  main, at the riser
  //
  // Roman numerals have to be handled before the digit form. `AI` and `A1`
  // are different lines on the same wing, and `CVI` is the sixth C-main
  // rather than something starting with `CV` — read digit-first, a whole
  // cascade level is discarded as unrecognised names.

  const mainMatch = raw.match(/^([A-Za-z]{1,2})main(\d*)$/i);
  if (mainMatch) {
    const r = mainMatch[1].toUpperCase();
    if (!ROWS.includes(r) && r !== 'BR' && r !== 'ST') return null;
    return {
      name: raw,
      row: r === 'BR' ? 'K' : (r === 'ST' ? 'S' : r),
      level: 'main',
      side: null,
      index: mainMatch[2] ? parseInt(mainMatch[2], 10) : 1,
      variant: null,
      isBrake: r === 'BR',
      ...(r === 'ST' ? { isStabilo: true } : {}),
      convention: 'up-main',
    };
  }

  const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
  // Two-letter rows are matched explicitly rather than with `{1,2}`. A greedy
  // quantifier takes `AI` out of `AIII` and then fails on the remainder
  // without backtracking, because the row check rejects `AI` and returns —
  // so every numeral above II was silently discarded.
  const NUMERAL = '(?:VIII|VII|III|IX|IV|VI|II|V|X|I)';
  const romanMatch = raw.match(new RegExp(`^(BR|ST)(${NUMERAL})$`))
    || raw.match(new RegExp(`^([A-Za-z])(${NUMERAL})$`));
  if (romanMatch) {
    const r = romanMatch[1].toUpperCase();
    if (!ROWS.includes(r) && r !== 'BR' && r !== 'ST') return null;
    return {
      name: raw,
      row: r === 'BR' ? 'K' : (r === 'ST' ? 'S' : r),
      level: 'upper-main',
      side: null,
      index: ROMAN[romanMatch[2]],
      variant: null,
      isBrake: r === 'BR',
      ...(r === 'ST' ? { isStabilo: true } : {}),
      convention: 'up-roman',
    };
  }

  // UP writes brake top lines lowercase (`br1`) and stabilo lines as `sa1`,
  // `sb2`, `st3`. Neither fits the single-letter-row pattern below.
  const brMatch = raw.match(/^br(\d+)$/);
  if (brMatch) {
    return {
      name: raw, row: 'K', level: 'upper', side: null,
      index: parseInt(brMatch[1], 10), variant: null, isBrake: true,
      convention: 'up-brake',
    };
  }
  // The stabilo's lines, which only UP names this way. `sa`..`se` are top
  // lines named for the row they sit outboard of, and `st` is the stabilo's
  // own cascade, written like every other on a UP sheet: lowercase at the
  // canopy (`st1`), uppercase below it (`ST1`), a roman numeral for the line
  // that reaches the riser (`STI`, above).
  //
  // `st` was read as the stabilo's MAIN line, either case. The sheets say
  // otherwise by length: on the K2 5 `st1` to `st3` are 0.8 m, `ST1` 1.4 m
  // and `STI` 5.4 m — and `STI`, the one line that is the main, was not
  // read at all.
  const stabMatch = raw.match(/^s([a-e])(\d+)$/) || raw.match(/^(st)(\d+)$/)
    || raw.match(/^(ST)(\d+)$/);
  if (stabMatch) {
    const kind = stabMatch[1];
    return {
      name: raw,
      row: 'S',
      level: kind === 'ST' ? 'middle' : 'upper',
      side: null,
      index: parseInt(stabMatch[2], 10),
      variant: kind.length === 1 ? kind : null,
      isBrake: false,
      isStabilo: true,
      convention: 'up-stabilo',
    };
  }

  // Advance's TAU DLS inverts the whole scheme: the level is a **prefix**,
  // and a row may be a pair.
  //
  //   1A3    level 1 (at the canopy), row A, line 3
  //   2AB2   level 2, one line serving both the A and B rows
  //   3CD1   level 3, serving C and D
  //   4AB1   level 4, at the riser
  //
  // Two things follow. A prefix level is relative — what depth 3 means
  // depends on how many levels the wing has, so the depth is recorded and
  // `resolveCascadeLevels` maps it to upper/middle/riser once the whole set
  // is known. And a combined row is not a naming quirk: one line really does
  // carry two rows' load, which is how a merged cascade reduces line count.
  // Two or three letters, because a brake or stabilo row is not one letter.
  const prefixMatch = raw.match(/^(\d)([A-Z]{1,3})(\d+)$/);
  if (prefixMatch) {
    const depth = parseInt(prefixMatch[1], 10);
    const group = prefixMatch[2];

    // A whole-row name wins over a combined pair.
    //
    // `2BR3` is genuinely ambiguous: Advance's convention would read it as
    // rows B and R combined at level 2, and Niviuk mean the brake row at
    // level 2. Split blindly it became rows B and R, R is not a row, and the
    // name was rejected — seven brake and stabilo lines per Niviuk sheet
    // silently dropped.
    //
    // Known multi-letter rows are checked first, because a row that exists is
    // a better reading than a pair that does not.
    const MULTI = { BR: 'K', ST: 'S', BRK: 'K' };
    if (MULTI[group]) {
      return {
        name: raw,
        row: MULTI[group],
        rows: [MULTI[group]],
        combined: false,
        depthFromCanopy: depth,
        level: depth === 1 ? 'upper' : `cascade-${depth}`,
        side: null,
        index: parseInt(prefixMatch[3], 10),
        variant: null,
        isBrake: MULTI[group] === 'K',
        convention: 'prefix-level',
        groupName: group,
      };
    }

    const letters = group.split('');
    if (!letters.every((c) => ROWS.includes(c))) return null;
    return {
      name: raw,
      row: letters[0],
      rows: letters,
      combined: letters.length > 1,
      // Depth 1 sits at the canopy; the deepest present is at the riser.
      depthFromCanopy: depth,
      level: depth === 1 ? 'upper' : `cascade-${depth}`,
      side: null,
      index: parseInt(prefixMatch[3], 10),
      variant: null,
      isBrake: letters[0] === 'K',
      convention: 'prefix-level',
    };
  }

  // Combined rows in suffix form: `ABM1`, `CDR2`, and the K2 5's `DE1`.
  // Both letters must be load-bearing rows, which is what keeps `BR1` out —
  // there is no R row, so it falls through and reads correctly as the B
  // row's first riser line.
  const pairMatch = raw.match(/^([A-Z])([A-Z])(R|M)?(U|L)?(\d+)$/);
  if (pairMatch) {
    const [, r1, r2, lvl, sd, idx] = pairMatch;
    if (LOAD_BEARING_ROWS.includes(r1) && LOAD_BEARING_ROWS.includes(r2)) {
      return {
        name: raw,
        row: r1,
        rows: [r1, r2],
        combined: true,
        level: lvl === 'R' ? 'main' : lvl === 'M' ? 'middle' : 'upper',
        side: sd === 'U' ? 'upper' : sd === 'L' ? 'lower' : null,
        index: parseInt(idx, 10),
        variant: null,
        isBrake: false,
        convention: 'suffix-combined',
      };
    }
  }

  const m = raw.match(/^([A-Za-z])(R|M)?(U|L)?(\d+)([a-z])?$/);
  if (!m) return null;
  const [, rawRow, levelCode, side, idx, variant] = m;
  const row = rawRow.toUpperCase();
  // A lowercase row letter always denotes a canopy line: the level suffixes
  // only ever appear with an uppercase row.
  const level = levelCode === 'R' ? 'main' : levelCode === 'M' ? 'middle' : 'upper';
  return {
    name: String(name).trim(),
    row,
    level,
    side: side ? (side === 'U' ? 'upper' : 'lower') : null,
    index: parseInt(idx, 10),
    variant: variant || null,
    isBrake: row === BRAKE,
    isCollapse: row === COLLAPSE,
  };
}

/**
 * Read a line table exported from a production spreadsheet as CSV or TSV.
 *
 * The layout these files use is a sequence of material blocks, each headed by
 * a material code, then a `Name No. Sewn ...` header, then rows. A name cell
 * may list several lines that share a length ("C12, K6"), with the quantity
 * counting all of them.
 *
 * Anything that is not recognisable as a line row is skipped rather than
 * guessed at, and what was skipped is reported.
 */
/**
 * Resolve prefix-level names to upper / middle / main.
 *
 * A prefix level is relative: `3AB1` is a main line on a three-level wing
 * and a middle line on a four-level one. The mapping therefore cannot be made
 * while parsing a single name — it needs the whole set, which is why parsing
 * leaves `depthFromCanopy` and a provisional `cascade-N` level behind.
 *
 * The load-bearing rows are settled together, because they cascade into each
 * other: the Ikuma 3's D row ends at level 2 and hangs from the C row's
 * level 3, so its lines are middle lines, not mains. The brake and the
 * stabilo are cascades of their own and each is settled on its own. Taking
 * the deepest level on the whole sheet for all of them left the Hook 6's
 * brake — which ends at level 3 on a wing whose rows end at 4 — with no main
 * line at all.
 *
 * And a deepest level holding ONE line, under a level holding several, is
 * not the main level: it is the lower piece of one of them. The Artik R 2
 * has `3A1`, `3A2`, `3A3` and a single `4A3`; the Skin 4 P a single `4C3`,
 * 0.6 m long, under three-metre lines. Read as "the deepest is the main",
 * each of those wings had one main line, shorter than its canopy lines. Both
 * levels are the main there.
 */
export function resolveCascadeLevels(lines) {
  // The cascade a line belongs to: the brake's, the stabilo's, a collapse
  // line's, or the one the load-bearing rows share.
  const cascadeOf = (l) => ([BRAKE, 'S', COLLAPSE].includes(l.row) ? l.row : 'load');
  const groups = new Map();
  for (const l of lines) {
    if (!l || l.depthFromCanopy == null) continue;
    const k = cascadeOf(l);
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k);
    g.set(l.depthFromCanopy, (g.get(l.depthFromCanopy) || 0) + 1);
  }
  if (!groups.size) return lines;
  const mains = new Map();
  for (const [k, g] of groups) {
    const depths = [...g.keys()].sort((x, y) => x - y);
    const deepest = depths[depths.length - 1];
    const set = new Set([deepest]);
    const above = depths[depths.length - 2];
    if (g.get(deepest) === 1 && above > 1 && g.get(above) > 1) set.add(above);
    mains.set(k, { set, deepest });
  }
  return lines.map((l) => {
    if (!l || l.depthFromCanopy == null) return l;
    const d = l.depthFromCanopy;
    const m = mains.get(cascadeOf(l));
    return {
      ...l,
      level: d === 1 ? 'upper' : (m.set.has(d) ? 'main' : 'middle'),
      cascadeDepth: d,
      cascadeLevels: m.deepest,
    };
  });
}

/**
 * Resolve the levels a sheet states by CASE.
 *
 * A sheet that writes its canopy lines in lower case (`a1`, `c4`) does not
 * also write canopy lines in upper case: there, a bare `C1` is the line the
 * `c` lines hang from. UP and PHI name a whole level that way, and Niviuk's
 * Artik R 2 its C and D rows. One name cannot say so — on an Ozone sheet
 * `C1` IS the canopy line — but the sheet can, and this is asked of the
 * sheet: read name by name, the Artik came out with eighteen C attachments
 * where it has fourteen.
 *
 * The exception is a line of that level sewn straight to the sail, which
 * the manuals write in upper case in the canopy lines' own place: the
 * Artik's `D9` and `D10`, outboard of `d8`. A bare upper-case name numbered
 * past every lower-case one of its row is that, and stays a canopy line,
 * marked `direct`.
 */
export function resolveCaseLevels(lines) {
  const lowerMax = {};
  for (const l of lines) {
    if (!l) continue;
    const m = /^([a-i])(\d+)[a-z]?$/.exec(l.name);
    if (m) lowerMax[m[1].toUpperCase()] = Math.max(lowerMax[m[1].toUpperCase()] ?? 0, Number(m[2]));
  }
  if (!Object.keys(lowerMax).length) return lines;
  return lines.map((l) => {
    if (!l || l.level !== 'upper') return l;
    // One row letter or two: the Takoo 6 has `BC1`, one line under both rows.
    const m = /^([A-I])([A-I])?(\d+)$/.exec(l.name);
    if (!m) return l;
    if (!m[2] && lowerMax[m[1]] != null && Number(m[3]) > lowerMax[m[1]]) return { ...l, direct: true };
    return { ...l, level: 'middle', convention: 'case' };
  });
}

/**
 * A plain line sheet, for data collected by hand.
 *
 * The production readers each follow one manufacturer's spreadsheet layout —
 * column positions inferred from a header, names sometimes in two columns,
 * quantities in a third. That is right for reading a maker's own file, and
 * wrong to ask of someone transcribing a manual.
 *
 * This reads the format `docs/collecting-reference-data.md` describes:
 *
 *   # comments, including provenance, are ignored
 *   name  length_mm  material  colour  comment
 *   a1    295        DC 60     white   double spliced both sides
 *
 * A header row is required and read by name, so column order does not matter
 * and extra columns are harmless. `loop_mm`, `cutting_mm`, `quantity` and
 * `total_length_mm` are picked up where present.
 *
 * Written after the collection instructions were tested against the existing
 * readers and parsed **zero lines** — the documented format was one no reader
 * accepted. Better found before fifty wings were transcribed into it.
 */
export function parseSimpleLineSheet(text) {
  const rows = text.split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => (/\t/.test(text) ? l.split('\t') : l.split(',')).map((c) => c.trim()));
  if (!rows.length) return { lines: [], header: null, skipped: [] };

  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  const col = (...names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iName = col('name', 'line', 'reference', 'ref');
  const iLen = col('length_mm', 'length', 'sewn_length_mm', 'single_length_mm');
  if (iName < 0) {
    throw new Error('parseSimpleLineSheet: no "name" column in the header row');
  }

  const iMat = col('material', 'material_reference');
  const iCol = col('colour', 'color');
  const iCom = col('comment', 'construction', 'note');
  const iLoop = col('loop_mm', 'loop_length_mm');
  const iCut = col('cutting_mm', 'cut_length_mm', 'cutting_length_mm');
  const iQty = col('quantity', 'qty');
  const iTot = col('total_length_mm', 'total_mm');

  // Whose naming the sheet is in, where it says: `# convention: up`.
  const declared = /^#\s*convention:\s*([a-z]+)/mi.exec(text);
  const convention = declared ? declared[1].toLowerCase() : null;

  const lines = [];
  const skipped = [];
  for (const r of rows.slice(1)) {
    const name = r[iName];
    if (!name) continue;
    const parsed = parseLineName(name, { convention });
    if (!parsed) { skipped.push(name); continue; }
    const num = (i) => (i >= 0 && r[i] !== undefined && r[i] !== ''
      ? Number(String(r[i]).replace(/[^\d.-]/g, '')) : null);
    const len = num(iLen);
    lines.push({
      ...parsed,
      lengthMM: Number.isFinite(len) ? len : null,
      material: iMat >= 0 ? (r[iMat] || null) : null,
      colour: iCol >= 0 ? (r[iCol] || null) : null,
      comment: iCom >= 0 ? (r[iCom] || null) : null,
      loopMM: num(iLoop),
      cuttingMM: num(iCut),
      quantity: num(iQty) ?? 1,
      totalLengthMM: num(iTot),
    });
  }

  return {
    // Levels a sheet states by case, or by a number in front of the name,
    // are settled on the whole sheet: `3A1` is a main line on a wing of
    // three levels and a middle one on a wing of four. Niviuk's sheets came
    // back with every line below the canopy at a level called `cascade-2`,
    // `cascade-3` or `cascade-4`, which nothing downstream knows.
    lines: resolveCascadeLevels(resolveCaseLevels(lines)),
    header,
    skipped,
    convention,
    // Provenance, so a sheet can say what it measured.
    provenance: text.split(/\r?\n/).filter((l) => l.trim().startsWith('#'))
      .map((l) => l.replace(/^#\s?/, '')),
    includesRisers: /including risers/i.test(text)
      ? true : (/excluding risers/i.test(text) ? false : null),
  };
}

export function parseLineTable(text) {
  // Decide the delimiter once for the whole file rather than accepting either
  // at every character. These tables routinely carry several line names in one
  // cell — "C12, K6" for two lines that share a length — and splitting a
  // tab-separated file on commas as well tears that cell in half, dropping
  // both lines silently.
  const hasTabs = /\t/.test(text);
  const split = hasTabs
    ? (l) => l.split('\t')
    : (l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

  const rows = text.split(/\r?\n/).map((l) => split(l).map((c) => c.replace(/^"|"$/g, '').trim()));
  const lines = [];
  const totals = [];
  const skipped = [];
  let material = null;

  // Column positions are not fixed across producers' sheets, and guessing
  // them silently drops every line. One Ozone sheet carries names in a single
  // column with quantity beside it; another — a sheet shared between two
  // models — uses two name columns, one per model, pushing quantity and
  // length two columns right. The header row states the layout, so it is read
  // rather than assumed: every column before "No." holds names.
  let nameCols = [0];
  let qtyCol = 1;
  let sewnCol = 2;
  let adjCol = 3;
  let commentCol = 5;

  // The layout above is Ozone's. Other makers order the columns differently,
  // and a header naming them wins over the default.
  //
  // UP's Meru sheets run name, length, quantity, loop, cutting length — so
  // reading column 2 as the sewn length took the *loop* length, and column 1
  // as the quantity took the real length. Every Meru line came out as "2 mm"
  // and nothing noticed, because a parse that returns numbers looks like a
  // parse that worked.
  //
  // The headers are bilingual ("Länge length", "Anzahl Quantity"), so the
  // match is on the English word appearing anywhere in the cell.
  const headerRow = rows.find((r) => r.some((c) => /\blength\b/i.test(c || ''))
    && r.some((c) => /\bquantity\b/i.test(c || '')));
  if (headerRow) {
    const find = (re) => headerRow.findIndex((c) => re.test(c || ''));
    const iLen = find(/\blength\b/i);
    const iQty = find(/\bquantity\b/i);
    if (iLen >= 0 && iQty >= 0) {
      sewnCol = iLen;
      qtyCol = iQty;
      const iCut = headerRow.findIndex((c) => /cutting\s+length/i.test(c || ''));
      if (iCut >= 0) adjCol = iCut;
    }
  }

  for (const r of rows) {
    const first = (r[0] || '').trim();
    if (!first && !r.some(Boolean)) continue;

    // The totals columns share physical rows with the material and column
    // headers of the inventory beside them, so they must be read before
    // those rows are skipped — otherwise half the cascade totals vanish and
    // the topology inference silently works from a partial wing.

    // A cascade-total row: an integer anchor index followed by per-row totals.
    // These sit in their own columns alongside the inventory.
    //
    // Column position carries the meaning — the first value is row A, the
    // second row B, and so on — so blanks must be preserved as holes. Toward
    // the tip the shorter rows run out (an A row may stop at anchor 14 while C
    // continues to 15), and compacting the row there silently shifts C's
    // length into A's column.
    const idxCol = r.findIndex((c, i) => i > 5 && /^\d+$/.test(c) && Number(c) < 200);
    if (idxCol >= 0) {
      const raw = r.slice(idxCol + 1).map((c) => {
        const v = Number(c);
        return c !== '' && Number.isFinite(v) ? v : null;
      });
      const present = raw.filter((v) => v != null);
      // Two values is enough to recognise the matrix starting; once it has,
      // a single value is a legitimate continuation. Toward the tip the
      // shorter rows drop out one by one, so the last anchor of the longest
      // row often stands alone — requiring two values there silently loses
      // the outermost anchor of the row that reaches furthest.
      const minValues = totals.length ? 1 : 2;
      if (present.length >= minValues && present.every((v) => v > 500)) {
        // Trim trailing holes only; interior holes are meaningful.
        while (raw.length && raw[raw.length - 1] == null) raw.pop();
        totals.push({ anchor: parseInt(r[idxCol], 10), lengths: raw });
      }
    }


    if (/^LIN[-_]/i.test(first)) { material = first; continue; }

    const headerAt = r.findIndex((c) => /^name$/i.test((c || '').trim()));
    if (headerAt >= 0) {
      const noAt = r.findIndex((c) => /^no\.?$/i.test((c || '').trim()));
      const sewnAt = r.findIndex((c) => /^sewn$/i.test((c || '').trim()));
      if (noAt > headerAt) {
        nameCols = [];
        for (let i = headerAt; i < noAt; i++) nameCols.push(i);
        qtyCol = noAt;
        sewnCol = sewnAt > noAt ? sewnAt : noAt + 1;
        adjCol = sewnCol + 1;
        commentCol = sewnCol + 3;
      }
      continue;
    }

    const qty = Number(r[qtyCol]);
    const sewn = Number(r[sewnCol]);
    // A blank cell reads as 0: no length, or no count, is a row not read.
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(sewn) || sewn <= 0) {
      if (first && !/^\*/.test(first) && !/^\d+$/.test(first)) skipped.push(first);
      continue;
    }

    // Gather names from every name column. A shared length covers all of
    // them, and the quantity counts the lot.
    const names = nameCols
      .flatMap((c) => (r[c] || '').split(/\s*,\s*/))
      .map((x) => x.trim())
      .filter(Boolean);
    const parsed = names.map(parseLineName).filter(Boolean);
    if (!parsed.length) { if (first) skipped.push(first); continue; }

    for (const p of parsed) {
      lines.push({
        ...p,
        quantity: qty / parsed.length,
        lengthMM: sewn,
        // Blank on most rows, and a blank is "not adjusted", not "0 mm".
        adjustedMM: (r[adjCol] ?? '').trim() !== '' && Number.isFinite(Number(r[adjCol]))
          ? Number(r[adjCol]) : null,
        material,
        comment: r[commentCol] || null,
      });
    }
  }

  return { lines, totals, skipped: [...new Set(skipped)] };
}

/** Group a parsed line set by row and level. */
export function summarise(lineSet) {
  const byRow = {};
  for (const l of lineSet.lines) {
    const r = (byRow[l.row] ||= { row: l.row, upper: [], middle: [], main: [] });
    r[l.level].push(l);
  }
  for (const r of Object.values(byRow)) {
    for (const k of ['upper', 'middle', 'main']) r[k].sort((a, b) => a.index - b.index);
  }

  const rows = Object.values(byRow).sort((a, b) => a.row.localeCompare(b.row));

  // Load-bearing rows only. Brakes go to a handle, not a riser maillon; the
  // stabilo and collapse rows carry no flight load either. Counting them as
  // risers turns a two-liner into a three-liner and changes what the whole
  // module reports about a wing's rigging.
  const mainRows = rows.filter((r) => LOAD_BEARING_ROWS.includes(r.row));
  const risers = mainRows.filter((r) => r.main.length > 0);

  const totalLength = lineSet.lines.reduce((s, l) => s + l.lengthMM * l.quantity, 0) / 1000;

  return {
    rows,
    rowLetters: rows.map((r) => r.row),
    anchorRows: mainRows.map((r) => r.row),
    riserRows: risers.map((r) => r.row),
    riserCount: risers.length,
    // A row with anchors but no riser lines hangs off a neighbouring riser —
    // the usual arrangement for D on a three-riser wing.
    dependentRows: mainRows.filter((r) => r.main.length === 0 && r.upper.length > 0)
      .map((r) => r.row),
    // Reported separately, since they are real rows but not riser rows.
    brakeRows: rows.filter((r) => r.row === 'K').map((r) => r.row),
    stabiloRows: rows.filter((r) => r.row === 'S').map((r) => r.row),
    collapseRows: rows.filter((r) => r.row === 'Z').map((r) => r.row),
    lineCount: lineSet.lines.reduce((s, l) => s + l.quantity, 0),
    distinctLengths: new Set(lineSet.lines.map((l) => l.lengthMM)).size,
    totalLengthM: totalLength,
    materials: [...new Set(lineSet.lines.map((l) => l.material).filter(Boolean))],
    levels: {
      upper: lineSet.lines.filter((l) => l.level === 'upper').length,
      middle: lineSet.lines.filter((l) => l.level === 'middle').length,
      riser: lineSet.lines.filter((l) => l.level === 'main').length,
    },
  };
}

/**
 * Recover which branch feeds each anchor, from lengths alone.
 *
 * For anchor i on row X, the published cascade total is
 *
 *     total_i = riser + (riser-level line) + (middle line) + X_i
 *
 * so `total_i - X_i` is the part of the path shared with its neighbours.
 * Anchors sharing a branch give the same remainder, so the remainders collapse
 * into one value per branch — and the grouping falls out without any topology
 * being assumed. If the names and lengths are inconsistent the remainders
 * scatter instead, which is the failure this is designed to expose.
 *
 * @param {object} lineSet   from parseLineTable
 * @param {number[]} totals  cascade totals for this row, indexed by anchor
 * @param {string} row       row letter
 */
export function inferTopology(lineSet, totals, row, { tolerance = 12 } = {}) {
  const upper = new Map();
  for (const l of lineSet.lines) {
    if (l.row === row && l.level === 'upper') upper.set(l.index, l.lengthMM);
  }

  const rows = [];
  for (const [i, total] of totals.entries()) {
    const anchor = i + 1;
    const up = upper.get(anchor);
    if (up == null || total == null || !Number.isFinite(total)) continue;
    rows.push({ anchor, total, upper: up, remainder: total - up });
  }
  if (!rows.length) return { row, branches: [], consistent: false, reason: 'no matching lines' };

  // Cluster remainders.
  const sorted = [...rows].sort((a, b) => a.remainder - b.remainder);
  const branches = [];
  for (const r of sorted) {
    const b = branches.find((x) => Math.abs(x.remainder - r.remainder) <= tolerance);
    if (b) { b.anchors.push(r.anchor); b.remainder = (b.remainder * (b.anchors.length - 1) + r.remainder) / b.anchors.length; }
    else branches.push({ remainder: r.remainder, anchors: [r.anchor] });
  }
  for (const b of branches) b.anchors.sort((a, c) => a - c);

  // Equal remainders mean equal shared path length — which is necessary for
  // two anchors to hang from the same branch, but not sufficient. Two
  // genuinely separate branches can come out the same length, and on the
  // wings this was built against they routinely do: on the Geo 7 the branch
  // serving anchors 1-4 and the one serving 9-10 agree to within a
  // millimetre. Merging them would claim a six-anchor branch that does not
  // exist.
  //
  // A cascade branch serves neighbouring anchors, so splitting each cluster
  // into contiguous runs separates the coincidences from the real sharing.
  const split = [];
  for (const b of branches) {
    let run = [b.anchors[0]];
    for (let i = 1; i < b.anchors.length; i++) {
      if (b.anchors[i] === b.anchors[i - 1] + 1) run.push(b.anchors[i]);
      else { split.push({ remainder: b.remainder, anchors: run }); run = [b.anchors[i]]; }
    }
    split.push({ remainder: b.remainder, anchors: run });
  }
  branches.length = 0;
  branches.push(...split);
  branches.sort((a, b) => a.anchors[0] - b.anchors[0]);

  // A cascade should have far fewer branches than anchors. If every anchor
  // lands in its own branch, the lengths are not describing a cascade.
  const consistent = branches.length < rows.length;

  // How many middle-level lines the file actually declares. Where the
  // inference finds fewer branches than there are middle lines, two adjacent
  // branches have come out the same length and cannot be told apart from
  // lengths alone — on the Geo 7, AM1 and AM2 are both 1921 mm and serve
  // anchors 1-2 and 3-4, so they read as a single four-anchor branch. That is
  // a limit of the method, not an error in the file, and it is reported
  // rather than hidden.
  const middleCount = lineSet.lines
    .filter((l) => l.row === row && l.level === 'middle').length;

  return {
    row,
    anchors: rows.length,
    branches,
    branchCount: branches.length,
    middleLineCount: middleCount,
    mergedBranches: middleCount > branches.length ? middleCount - branches.length : 0,
    consistent,
    meanAnchorsPerBranch: rows.length / branches.length,
  };
}

/**
 * Solve for the riser length implied by a set of branches.
 *
 * remainder = riser + riserLine + middleLine, and the riser length is the one
 * quantity shared by every branch. Trying each combination of riser-level and
 * middle-level line against each branch and keeping the value that explains
 * the most branches recovers it without being told.
 */
export function inferRiserLength(lineSet, topology, row) {
  const risers = lineSet.lines.filter((l) => l.row === row && l.level === 'main');
  const middles = lineSet.lines.filter((l) => l.row === row && l.level === 'middle');
  if (!risers.length) return null;

  const candidates = [];
  for (const b of topology.branches) {
    for (const r of risers) {
      candidates.push({ value: b.remainder - r.lengthMM, branch: b, riser: r, middle: null });
      for (const m of middles) {
        candidates.push({ value: b.remainder - r.lengthMM - m.lengthMM, branch: b, riser: r, middle: m });
      }
    }
  }
  const plausible = candidates.filter((c) => c.value > 50 && c.value < 1200);
  if (!plausible.length) return null;

  let best = null;
  for (const c of plausible) {
    const agree = plausible.filter((o) => Math.abs(o.value - c.value) <= 15);
    const branches = new Set(agree.map((o) => o.branch));
    if (!best || branches.size > best.branches) {
      best = {
        riserLengthMM: agree.reduce((s, o) => s + o.value, 0) / agree.length,
        branches: branches.size,
        spreadMM: Math.max(...agree.map((o) => o.value)) - Math.min(...agree.map((o) => o.value)),
        paths: agree.map((o) => ({
          anchors: o.branch.anchors,
          riser: o.riser.name,
          middle: o.middle ? o.middle.name : null,
        })),
      };
    }
  }
  return best;
}

/**
 * How the linesets of a family go with the wing, measured from the sheets.
 *
 * `sizes` is one entry a size: its name, a linear scale (the square root of
 * the flat area will do — only ratios are used) and the sheet as
 * `parseLineTable` read it. Everything is reported as a ratio to the
 * reference size, the middle one unless another is named.
 *
 * For each size:
 *
 *   height   the mean length of every load-bearing line path, canopy to the
 *            bottom of the riser, where the sheet gives totals
 *   riserMM  the riser those totals imply (`inferRiserLength`, row A)
 *   levels   the cord in each level of the cascade, and its ratio
 *   upperIfRiserTakenAtTop
 *            what the top lines would come to if the whole height were
 *            scaled, the riser were not, the lines below the top were scaled,
 *            and the top lines made up the difference
 *
 * That last line is the reading of two of Ozone's families, and it is why the
 * cord in a lineset grows faster than the wing: see `docs/scaling.md`.
 */
export function familyLineScaling(sizes, { reference = null } = {}) {
  const rows = sizes.map((s) => {
    const t = s.lineSet;
    const load = (l) => /^[A-D]$/.test(l.row) && !l.isBrake;
    const levels = {};
    for (const l of t.lines) {
      const key = load(l) ? l.level : 'other';
      const q = l.quantity ?? 1;
      (levels[key] ||= { count: 0, lengthM: 0 });
      levels[key].count += q;
      levels[key].lengthM += (q * l.lengthMM) / 1000;
    }
    const heights = (t.totals || [])
      .flatMap((r) => r.lengths.slice(0, 4))
      .filter((v) => Number.isFinite(v) && v > 0);
    let riserMM = null;
    if (heights.length) {
      const colA = t.totals.map((r) => r.lengths[0]);
      const found = inferRiserLength(t, inferTopology(t, colA, 'A'), 'A');
      riserMM = found ? found.riserLengthMM : null;
    }
    return {
      name: s.name,
      scale: s.scale,
      levels,
      heightCount: heights.length,
      heightMM: heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : null,
      riserMM,
      cordM: Object.values(levels).reduce((a, v) => a + v.lengthM, 0),
    };
  });
  const ref = rows.find((r) => r.name === reference) ?? rows[Math.floor(rows.length / 2)];
  for (const r of rows) {
    r.k = r.scale / ref.scale;
    r.cordRatio = r.cordM / ref.cordM;
    r.heightRatio = (r.heightMM && ref.heightMM) ? r.heightMM / ref.heightMM : null;
    r.heightOffPct = r.heightRatio != null ? (r.heightRatio / r.k - 1) * 100 : null;
    for (const [key, v] of Object.entries(r.levels)) {
      v.ratio = ref.levels[key] ? v.lengthM / ref.levels[key].lengthM : null;
      v.offPct = v.ratio != null ? (v.ratio / r.k - 1) * 100 : null;
    }
    const up = ref.levels.upper;
    r.upperIfRiserTakenAtTop = (up && ref.riserMM != null && r.riserMM != null && r.levels.upper)
      ? (r.k * (up.lengthM + (up.count * ref.riserMM) / 1000)
        - (r.levels.upper.count * r.riserMM) / 1000) / up.lengthM
      : null;
  }
  return { reference: ref.name, sizes: rows };
}

/** Cut list grouped by material, in the shape production files use. */
export function cutList(lineSet) {
  const byMaterial = {};
  for (const l of lineSet.lines) {
    (byMaterial[l.material || 'unspecified'] ||= []).push(l);
  }
  const out = [];
  for (const [mat, ls] of Object.entries(byMaterial)) {
    ls.sort((a, b) => a.lengthMM - b.lengthMM);
    out.push({
      material: mat,
      lines: ls,
      count: ls.reduce((s, l) => s + l.quantity, 0),
      totalMM: ls.reduce((s, l) => s + l.lengthMM * l.quantity, 0),
    });
  }
  return out.sort((a, b) => b.totalMM - a.totalMM);
}

/** Write a cut list back out as CSV. */
export function cutListToCSV(lineSet) {
  const out = ['material,name,row,level,index,quantity,length_mm'];
  for (const g of cutList(lineSet)) {
    for (const l of g.lines) {
      out.push([g.material, l.name, l.row, l.level, l.index, l.quantity, l.lengthMM].join(','));
    }
  }
  return out.join('\n');
}

/* ------------------------------------------------------------ generation -- */

/**
 * Riser layouts. Three risers carrying four anchor rows is the ordinary
 * arrangement on a modern wing — the D row cascades into the C riser rather
 * than earning a riser of its own, which is what all three of the production
 * wings this was built against do.
 */
export const RISER_LAYOUTS = {
  'A/B/C+D': [
    { name: 'A', rows: ['A'] },
    { name: 'B', rows: ['B'] },
    { name: 'C', rows: ['C', 'D'] },
  ],
  'A/B+C': [
    { name: 'A', rows: ['A'] },
    { name: 'B', rows: ['B', 'C'] },
  ],
  'A/B/C/D': [
    { name: 'A', rows: ['A'] },
    { name: 'B', rows: ['B'] },
    { name: 'C', rows: ['C'] },
    { name: 'D', rows: ['D'] },
  ],
  'single': [{ name: 'A', rows: ['A', 'B', 'C', 'D'] }],

  // Split-A layouts, which is what most modern wings actually use.
  //
  // `A'` carries the outboard part of the A row on its own riser. Pulling it
  // folds the wing tips — big ears — while the main A riser holds the centre
  // flying. Every Niviuk in the reference set is one of these: the Hook 6 is
  // A-A'/B/C and the Artik R 2 is A-A'/B, a two-liner.
  //
  // The split is by anchor position along the span rather than by row, so it
  // is described with `splitFrom`: the span fraction outboard of which the A
  // anchors go to the second riser.
  "A-A'/B/C": [
    { name: 'A', rows: ['A'], splitTo: "A'", splitFrom: 0.62 },
    { name: "A'", rows: [], fromSplit: 'A' },
    { name: 'B', rows: ['B'] },
    { name: 'C', rows: ['C', 'D'] },
  ],
  "A-A'/B": [
    { name: 'A', rows: ['A'], splitTo: "A'", splitFrom: 0.62 },
    { name: "A'", rows: [], fromSplit: 'A' },
    { name: 'B', rows: ['B', 'C', 'D'] },
  ],
  'A/B/C': [
    { name: 'A', rows: ['A'] },
    { name: 'B', rows: ['B'] },
    { name: 'C', rows: ['C', 'D'] },
  ],
};

/**
 * Apply a layout's split-A rule to a built plan.
 *
 * A split A riser is not a different row — the lines are the same A lines. It
 * is a different *riser*, taking the outboard A anchors so they can be pulled
 * down on their own. So the split happens after the cascade is built, by
 * reassigning anchors outboard of `splitFrom` to the second riser.
 *
 * Returns what was moved, because a split that catches no anchors is a riser
 * with nothing on it and the caller should know rather than find an empty
 * maillon later.
 */
export function applyRiserSplit(plan, layout, { halfSpanM = null } = {}) {
  const rule = layout.find((r) => r.splitTo);
  if (!rule) return { moved: 0, riser: null, note: 'layout has no split riser' };

  const span = halfSpanM ?? Math.max(
    ...plan.lines.map((l) => Math.abs(l.to ? l.to[1] : 0)), 1e-9);
  const cut = rule.splitFrom * span;

  let moved = 0;
  for (const l of plan.lines) {
    if (!rule.rows.includes(l.row)) continue;
    // The anchor end of an upper line is what sits on the span.
    const y = l.to ? Math.abs(l.to[1]) : null;
    if (y === null) continue;
    if (l.level === 'upper' && y >= cut) {
      l.riser = rule.splitTo;
      l.splitRiser = true;
      moved++;
    }
  }

  return {
    moved,
    riser: rule.splitTo,
    splitFromM: cut,
    splitFraction: rule.splitFrom,
    note: moved === 0
      ? `no anchors outboard of ${cut.toFixed(2)} m: the ${rule.splitTo} riser `
        + 'would carry nothing'
      : `${moved} anchors moved to the ${rule.splitTo} riser, outboard of `
        + `${cut.toFixed(2)} m`,
  };
}

/**
 * Build a named, riser-based line plan from a wing.
 *
 * The geometry is the handbook's construction — a branch runs from its parent
 * toward the centre of gravity of the anchors it serves. What this adds is the
 * rigging: which riser carries which rows, how anchors group onto branches,
 * and the names a builder can actually work to.
 *
 * Lengths come out as carabiner-to-canopy totals, the same quantity the
 * production sheets tabulate, so a generated plan and a real one can be put
 * side by side.
 */
/** Distinguishes "no layout given" from "a layout that does not exist". */
const LAYOUT_OMITTED = Symbol('layout omitted');

export function buildLinePlan(options = {}) {
  // Checked on the raw options, before destructuring.
  //
  // A destructuring default fires on `undefined`, so `{ layout = X }` cannot
  // tell an omitted layout from `layout: undefined` — both become X. Neither
  // can a sentinel default, for the same reason. The only place the
  // difference survives is the options object itself.
  //
  // It matters because three tests were passing `RISER_LAYOUTS['A/B']`, which
  // is not a key, and silently getting the four-riser default while claiming
  // to test a two-liner. The plan under test was not the plan described, and
  // nothing failed.
  if ('layout' in options && options.layout === undefined) {
    throw new Error('buildLinePlan: layout is undefined — check the name against '
      + `RISER_LAYOUTS (${Object.keys(RISER_LAYOUTS).join(', ')})`);
  }
  return buildLinePlanInner(options);
}

function buildLinePlanInner({
  wing,
  airfoil,
  // A sentinel rather than the layout itself, so an explicit `undefined` can
  // be told apart from an omission.
  //
  // A destructuring default fires on `undefined`, so `layout: undefined` is
  // silently replaced by the default and a guard in the body can never see
  // it. Three tests were passing `RISER_LAYOUTS['A/B']` — not a key — and
  // getting the four-riser default while claiming to test a two-liner. The
  // plan under test was not the plan described, and nothing failed.
  layout = LAYOUT_OMITTED,
  everyNthRib = 2,
  // The riser webbing between karabiner and lines. It hangs vertically: the
  // pilot's weight pulls straight down on it.
  riserLengthM = 0.50,
  // Where the wing balances, as a fraction of chord, from the equilibrium
  // solve. The lines converge there, because that is what decides the
  // attitude the wing flies at.
  calageFraction = null,
  groupSize = 2,
  // The riser length the totals add to each line. Left unset it is the
  // geometry's own, so the two cannot disagree: a plan built with 0.45 m
  // risers used to total its rows with 500 mm ones.
  riserLengthMM = null,
  lineLengthM = 6.5,
  karabinerSeparationM = 0.42,
  // Where each junction sits, as a fraction of the distance still to run
  // from the parent node to the anchors it serves.
  //
  // These are not guesses. On the Geo 7 MS the A row measures 6951 mm from
  // carabiner to canopy, made of riser 527, AR1 3948, AM1 1921 and A1 556.
  // So the first junction sits 64% of the way up, and the second covers 78%
  // of what remains, leaving the upper lines the last 22%. The other rows and
  // the other two wings agree closely. An earlier default of 0.55 and 0.30
  // put both junctions barely a third of the way up, which made the top-level
  // lines several times longer than any real wing's.
  // Where the cascade junctions sit, as fractions of the way from the maillon
  // to the canopy. Measured from five production line tables.
  //
  // The sound measurement is the **middle-to-main length ratio within one
  // wing**, since both are means over the same cascade: Geo 7 0.429, Alpina 5
  // 0.446, Zeno 2 0.229, Swift 6 0.308, Lyght 0.304 — mean 0.343. With the
  // first junction at 0.64 that puts the second at 0.64 x 1.343 = 0.860.
  //
  // An earlier attempt averaged each level separately and read junctions off
  // the totals. That is not a path down the cascade — the mean upper and the
  // mean main belong to different branches — and it gave 0.888. Close by
  // luck, wrong by method.
  // Measured, and NOT predicted by riser count.
  //
  // Junction positions across five production wings:
  //
  //   Geo 7     0.644 0.920      Alpina 5  0.608 0.879
  //   Swift 6   0.722 0.944      Zeno 2    0.713 0.876
  //                              Lyght     0.629 0.820
  //
  // Grouped by riser count that is [0.650, 0.858] for two-liners and
  // [0.683, 0.932] for three — but the spread *within* each group (0.608 to
  // 0.713 on the first junction) is larger than the difference *between*
  // them. Riser count does not explain it; it is a design choice, and a
  // single value inside the observed range is the honest default.
  levelFractions = [0.64, 0.860],
  // The widest a fan may open: how far a line may lie from the direction of
  // the line BELOW its junction.
  //
  // A junction is where one line's pull is shared among the lines above it,
  // and a line at an angle to the one below carries only the cosine of that
  // angle along it; the rest it has to find in its neighbours, through the
  // cloth. A junction is placed a fixed fraction of the way toward the
  // anchors it serves and lowered toward its parent, if it has to be, until
  // no line above it is wider than this.
  //
  // Fifty degrees is past anything a production cascade does, and so a guard
  // rather than a shape. The Geo 7's top lines are 0.25 to 0.56 m long on
  // anchors two cells apart, a pair opening some 65 degrees between its two
  // lines; built at that wing's size with its anchor counts and left alone,
  // this generator's come out 0.31 to 0.49 m long and 29 to 48 degrees from
  // the line below. The Swoop2's own plan, with its anchors on neighbouring
  // ribs, opens no wider than 11 (24 at the risers).
  //
  // ------------------------------------------------------------------------
  // This was a limit on the angle from VERTICAL: sixty degrees, "the flattest
  // a load-bearing line may lie", for lines "pulling sideways and holding
  // nothing up". The canopy is an arc. Toward the tip its surface leans, the
  // air pushes on it along its own normal, and a line that holds it runs
  // along that normal — fifty degrees from vertical where the rib leans
  // fifty. Measured from vertical, the ordinary fan of an outboard pair
  // looked flat and was lowered until its lines were twice the length of the
  // same fan at the centre: 0.93 m on a Geo 7 whose own are 0.48, and 11 to
  // 14% more line on each of the four wings it was measured on.
  // ------------------------------------------------------------------------
  maxFanAngleDeg = 50,
  // The old limit, from vertical. Off unless asked for.
  maxLineAngleDeg = 0,
  // Rows that hang from one riser share its main lines.
  //
  // On every reference wing with two rows on a riser, the second row has no
  // main lines of its own: the Geo 7's D row is six middle lines hung from
  // the tops of the C mains, the Ultralite 5's the same, and on the Swift 6,
  // the Zeno 2 and PHI's Allegro the rear row's top lines go straight onto
  // the row in front. This gave the second row three lines of its own all
  // the way to the riser — twelve metres a side that no wing has.
  shareRiserMains = true,
  loadMode = 1,
  tipDirectAnchors = 2,
  // Main lines per row.
  //
  // A real wing has a *fixed* number of mains regardless of size. The Geo 7
  // carries A:3 B:3 C:5 in XS, MS and L alike; the Alpina 5 carries A:4 B:4
  // in every size. Grouping by a constant chunk size instead makes the main
  // count scale with the anchor count, which produced 16 mains against a
  // real 10 on the Alpina and 19 against 7 on the Zeno.
  //
  // Null keeps the old behaviour, because a design that has not said how many
  // mains it wants should not silently get three.
  mainsPerRow = null,
  // Attachment density, per row.
  //
  // `everyNthRib` is one integer applied to every row, and real wings do not
  // work that way. Measured across the reference tables, the front row is
  // attached far more densely than the rear, and the more so the fewer risers
  // the wing has:
  //
  //   Geo 7 (3-liner)    A:14 B:14 C:15 D:14   of 25 ribs — near uniform
  //   Swift 6            A:17 B:17 C:8  D:8    — rear half as dense
  //   Alpina 5 (2-liner) A:31 B:19 C:12        of 34 ribs
  //   Zeno 2 (2-liner)   A:30 B:14 C:8         of 40 ribs
  //
  // Which is what the structure asks for: the leading edge needs support at
  // nearly every cell to hold its shape, while the rear carries less load and
  // less shape. A single integer cannot say that — at 2 it undershoots a
  // two-liner by a third, at 1 it overshoots by a quarter.
  //
  // Accepts a count per row: `{ A: 30, B: 14, C: 8 }`.
  anchorsPerRow = null,
  // Rows that share their cascade below the top level, as Advance's TAU DLS
  // does with AB and CD. Each entry is a group of row letters.
  mergeRows = null,
  // Each riser's direction, from the resultant of its lines' tensions
  // (`riserResultants` on a first pass). Without it each riser points at the
  // weighted centre of its anchors, which is LEparagliding's construction.
  riserDirections = null,
  // Include the brake cascade in the plan. Real line tables carry it — every
  // reference sheet in this project lists a K row alongside A/B/C/D — so a
  // plan without it cannot be compared with one, and its totals understate
  // the wing by about a fifth.
  brakes = null,
} = {}) {
  if (layout === LAYOUT_OMITTED) layout = RISER_LAYOUTS['A/B/C+D'];

  const fractions = airfoil?.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  // The maillon hangs under the wing's BALANCE POINT, not under its nose.
  //
  // This read `[0, ..., -lineLengthM]` — x = 0 is the leading edge. The
  // anchors span 0.22 to 1.82 m of chord, so every line raked about a metre
  // forward to reach a point under the nose, and the whole cascade sat at a
  // large angle to the wing it hangs from. A paraglider does not fly like
  // that: it hangs with the risers close to vertical and the pilot below the
  // point the lift acts through.
  //
  // That point is the calage — where the risers attach along the chord, which
  // `solveEquilibrium` reports and real wings put near 40 to 45%. Placed
  // there, the lines run down rather than forward, and the angle between the
  // wing and its risers becomes the small one it is in the air.
  //
  // It is computed from the anchors rather than assumed, so a wing with an
  // unusual layout still hangs from its own balance point: the load-bearing
  // anchors are averaged, weighted towards the front rows because that is
  // where the load is.
  // The karabiner hangs directly under the balance point, a line length plus
  // a riser length below the wing — the construction LEparagliding uses, and
  // with it this reproduces that program's geometry on the Swoop2.
  const hangX = hangPointFromAnchors(wing, fractions, calageFraction);
  const karabiner = [hangX, karabinerSeparationM / 2, -(lineLengthM + riserLengthM)];

  // Each riser points at the lines it carries.
  //
  // Webbing carries only tension, so it lies along the RESULTANT of the lines
  // pulling on its top — and that resultant is not vertical. In side view it
  // nearly is: the pilot hangs under the balance point. In front view the
  // lines of each half pull up and OUT toward that half of the wing, and the
  // chest strap holds the karabiners together against it, so a riser leans
  // outboard by 15 to 20 degrees. Every riser pointing straight down, as this
  // model had them, is the one attitude the forces rule out.
  //
  // The resultant of a riser's lines points, to the accuracy that matters
  // here, at the load-weighted centroid of the anchors they reach — which is
  // what LEparagliding uses, and what its 3D output shows: on the Swoop2 the
  // A riser top sits 15.4 cm outboard of its karabiner and 1.8 cm forward.
  //
  // A riser carrying two rows weights them by their share of the load: the
  // C+D riser's resultant sits nearer C, which carries twice what D does.
  const present = Object.keys(fractions).filter((r) => r in LOAD_ROW_SHARES);
  const shareSum = present.reduce((t, r) => t + LOAD_ROW_SHARES[r], 0) || 1;
  const riserTopFor = (rows, name) => {
    // A direction measured from this plan's own line tensions, when the
    // caller has one (see `riserResultants`), beats the centroid estimate.
    const given = riserDirections?.[name];
    if (given) {
      const n = Math.hypot(given[0], given[1], given[2]) || 1;
      return [0, 1, 2].map((k) => karabiner[k] + (given[k] * riserLengthM) / n);
    }
    const pts = [];
    for (const row of rows) {
      const f = fractions[row];
      if (f == null) continue;
      const share = (LOAD_ROW_SHARES[row] ?? 0) / shareSum;
      wing.ribs.forEach((rib, i) => {
        if (i % everyNthRib !== 0) return;
        pts.push({ point: ribSurfacePoint(rib, 'lower', f), chord: rib.chord * (share || 1e-6) });
      });
    }
    if (!pts.length) return [karabiner[0], karabiner[1], karabiner[2] + riserLengthM];
    const g = weightedCentroid(pts, loadMode);
    const d = [g[0] - karabiner[0], g[1] - karabiner[1], g[2] - karabiner[2]];
    const n = Math.hypot(d[0], d[1], d[2]) || 1;
    return [0, 1, 2].map((k) => karabiner[k] + (d[k] * riserLengthM) / n);
  };
  const riserTops = {};

  const lines = [];
  const risers = [];
  const shortfalls = [];

  const junction = (parent, centroid, fraction, tops) => fanJunction(
    parent, centroid, fraction, tops, maxFanAngleDeg, maxLineAngleDeg);

  for (const riser of layout) {
    const carried = [];
    // Everything on this riser hangs from its own top.
    const maillon = riserTopFor(riser.rows, riser.name);
    riserTops[riser.name] = maillon;
    // The first row's main lines, which the rows after it on this riser hang
    // from.
    let hostNodes = null;
    for (const row of riser.rows) {
      const frac = fractions[row];
      if (frac == null) continue;

      const anchors = [];
      const want = anchorsPerRow ? anchorsPerRow[row] : null;
      if (want) {
        // Spread `want` anchors evenly over the ribs, rather than taking
        // every nth. A fractional spacing is exactly what the real wings
        // show, and it cannot be reached by an integer stride.
        const n = Math.max(1, Math.min(want, wing.ribs.length));
        for (let k = 0; k < n; k++) {
          const i = Math.round((k * (wing.ribs.length - 1)) / Math.max(1, n - 1));
          const rib = wing.ribs[i];
          anchors.push({
            anchor: anchors.length + 1,
            ribIndex: i,
            chord: rib.chord,
            point: ribSurfacePoint(rib, 'lower', frac),
          });
        }
      } else {
        wing.ribs.forEach((rib, i) => {
          if (i % everyNthRib !== 0) return;
          anchors.push({
            anchor: anchors.length + 1,
            ribIndex: i,
            chord: rib.chord,
            point: ribSurfacePoint(rib, 'lower', frac),
          });
        });
      }
      if (!anchors.length) continue;

      // Real wings shorten the cascade at the tip: the outermost anchors get
      // one long line straight to the riser level instead of passing through
      // the middle cascade. It is plain in the production data — on the Geo 7,
      // A13 and A14 are 1205 mm and 977 mm where the inboard A lines are all
      // around 300-500 mm, and they have no middle line above them. Forcing
      // every anchor through all three levels makes the tip lines far too
      // long and the tip trim wrong.
      const direct = tipDirectAnchors > 0 ? anchors.slice(-tipDirectAnchors) : [];
      const cascaded = tipDirectAnchors > 0 ? anchors.slice(0, -tipDirectAnchors) : anchors;

      // Build downward from the maillon: first the riser-level junctions,
      // then the middle ones, then the upper lines out to the anchors. Going
      // this way each junction is placed along the path to the centre of
      // gravity of everything above it, which is the handbook's construction.
      const groups = chunkBy(cascaded, groupSize);
      // Either a fixed number of mains, or the old constant-chunk grouping.
      // `chunkInto` caps at the number of groups available, so a row with few
      // anchors cannot reach the requested main count: 9 anchors make 5
      // middles, which chunk into at most 3 — and with `Math.ceil` sizing,
      // only 2. Fewer mains means each carries a larger share, and on the
      // highest-aspect wings that pushed one main past the strongest line in
      // the table. Reported rather than silently delivered.
      // `mainsPerRow` may be one number for every row, or a count per row.
      //
      // Its name says per row and it was a single integer applied to all of
      // them, so a cascade spec asking for A:3 B:4 C:2 could not be built —
      // the A row came back with seven mains. Real plans differ by row: the
      // Zeno 2's own is A:3 B:4, which one number cannot express.
      // A row that shares its riser with the row before it hangs from that
      // row's main lines, and has none of its own.
      const dependent = shareRiserMains && hostNodes != null && hostNodes.length > 0;
      const wantMains = dependent
        ? hostNodes.length
        : ((mainsPerRow && typeof mainsPerRow === 'object')
          ? mainsPerRow[row] ?? null
          : mainsPerRow);
      const riserGroups = wantMains
        ? chunkInto(groups, wantMains)
        : chunkBy(groups, groupSize);
      if (!dependent && wantMains && riserGroups.length !== wantMains) {
        shortfalls.push({
          row, asked: wantMains, got: riserGroups.length,
          anchors: cascaded.length, middles: groups.length,
        });
      }

      // A dependent row: each of its groups goes to the host main whose top
      // is nearest to where the group's own main would have ended. Nearest
      // to the group's anchors is not the same thing — a main's top is two
      // thirds of the way up, and well inboard of what it carries — and on a
      // host row with four mains that sent the second group to the third.
      const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const hostFor = (g) => {
        const own = lerp3(maillon, g, levelFractions[0]);
        let host = hostNodes[0];
        for (const h of hostNodes) if (dist3(h.point, own) < dist3(host.point, own)) host = h;
        return host;
      };
      const dependentNodes = () => {
        const byHost = new Map(hostNodes.map((h) => [h, []]));
        for (const grp of groups) byHost.get(hostFor(weightedCentroid(grp, loadMode))).push(grp);
        // The outermost host is kept even with no group of this row on it:
        // the direct tip lines go there.
        return hostNodes
          .filter((h, k) => byHost.get(h).length || k === hostNodes.length - 1)
          .map((h) => ({ point: h.point, groups: byHost.get(h), host: h }));
      };
      const riserNodePoints = dependent ? dependentNodes() : riserGroups.map((rg) => {
        const all = rg.flat();
        const g = weightedCentroid(all, loadMode);
        // The top of a main line stays at its fraction. The outermost one
        // also takes the direct tip lines, and those are not held to the fan
        // limit: a tip line is long, lightly loaded, and on a real wing wide
        // of the line below it — the Geo 7's last two A lines, 1205 and
        // 977 mm, leave the top of a 4.5 m main for ribs most of a metre
        // apart. Lowering the main's top to narrow them lengthened every
        // line of the outer group to suit the two that carry least.
        return {
          point: lerp3(maillon, g, levelFractions[0]),
          groups: rg,
        };
      });

      const midNodes = [];
      const riserNodes = riserNodePoints.map((rn) => {
        const children = rn.groups.map((grp) => {
          const g = weightedCentroid(grp, loadMode);
          const node = junction(rn.point, g, levelFractions[1], grp.map((a) => a.point));
          midNodes.push({ point: node, anchors: grp.map((a) => a.anchor), parent: rn.point });
          return { point: node, anchors: grp.map((a) => a.anchor), group: grp };
        });
        return {
          point: rn.point, children, host: rn.host ?? null,
          anchors: rn.groups.flat().map((a) => a.anchor),
        };
      });

      // Upper lines: from each middle node out to its anchors.
      for (const rn of riserNodes) {
        for (const child of rn.children) {
          for (const a of child.group) {
            lines.push({
              row, level: 'upper', index: a.anchor, name: `${row}${a.anchor}`,
              riser: riser.name, ribIndex: a.ribIndex,
              from: child.point, to: a.point, lengthMM: mm(child.point, a.point),
              anchors: [a.anchor],
            });
          }
        }
      }

      // Middle lines: from each riser node to its middle nodes.
      for (const rn of riserNodes) {
        for (const child of rn.children) {
          const index = lines.filter((l) => l.row === row && l.level === 'middle').length + 1;
          lines.push({
            row, level: 'middle', index, name: `${row}M${index}`,
            riser: riser.name,
            from: rn.point, to: child.point, lengthMM: mm(rn.point, child.point),
            anchors: child.anchors,
          });
        }
      }

      const unusedMidNodes = groups.map((grp) => {
        const g = weightedCentroid(grp, loadMode);
        const node = lerp3(maillon, g, levelFractions[0]);
        return { point: node };
      });
      void unusedMidNodes;

      // The direct tip anchors join the outermost riser node.
      if (direct.length && riserNodes.length) {
        const host = riserNodes[riserNodes.length - 1];
        for (const a of direct) {
          lines.push({
            row, level: 'upper', index: a.anchor, name: `${row}${a.anchor}`,
            riser: riser.name, ribIndex: a.ribIndex, direct: true,
            from: host.point, to: a.point, lengthMM: mm(host.point, a.point),
            anchors: [a.anchor],
          });
          host.anchors.push(a.anchor);
        }
      }

      // A line attached to the riser is a main line, whichever row it
      // serves — "lines which are attached directly to the riser connectors"
      // (PMA). The second row on a riser had three of its own, called middle
      // lines and numbered on from them (DM7 to DM9).
      if (dependent) {
        // Nothing to add: this row's middle lines start at the tops of the
        // host row's mains, which carry it from there. The host's mains say
        // so, for anything that reads a line without walking the plan.
        for (const node of riserNodes) {
          const main = lines.find((l) => l.level === 'main' && l.to === node.host.point);
          if (!main || !node.anchors.length) continue;
          main.rows = [...new Set([...(main.rows ?? [main.row]), row])];
          (main.alsoCarries ||= []).push({ row, anchors: node.anchors });
        }
      } else {
        riserNodes.forEach((node, k) => {
          lines.push({
            row,
            level: 'main',
            index: k + 1,
            name: `${row}R${k + 1}`,
            riser: riser.name,
            from: maillon, to: node.point, lengthMM: mm(maillon, node.point),
            anchors: node.anchors,
          });
        });
        if (hostNodes == null) hostNodes = riserNodes;
      }

      carried.push(row);
    }
    risers.push({ name: riser.name, rows: carried, maillon });
  }

  // `maillon` stays as the first riser's top, for code that wants one point;
  // each riser's own is in `riserTops` and `risers[i].maillon`.
  const firstTop = risers.length ? risers[0].maillon : karabiner;
  const plan = {
    lines, risers,
    riserLengthMM: riserLengthMM ?? Math.round(riserLengthM * 1000),
    maillon: firstTop, riserTops, karabiner,
    // Where the pilot hangs: under the balance point.
    hangPoint: karabiner,
  };
  // Merging rebuilds part of the line list, so everything after it reads
  // `plan.lines` rather than the local array it started from.
  if (mergeRows) mergeCascades(plan, mergeRows, levelFractions, junction);

  // The brake cascade is built separately because it is a different shape —
  // four levels, one shared lower line, uneven anchors — but it belongs in
  // the same plan.
  if (brakes) {
    const bp = buildBrakePlan({
      wing,
      lineLengthM,
      karabinerSeparationM,
      // The same hang point the load-bearing cascade uses.
      //
      // Without it the brakes fell back to their own default and ran to a
      // handle under the LEADING EDGE while the main lines hung correctly
      // under the wing. Giving `buildBrakePlan` the right default was not
      // enough, because this call never asked for it.
      hangPointX: karabiner[0],
      // The brake runs through a pulley at the top of the rear riser, as it
      // does on a real wing and in LEparagliding.
      pulleyPoint: risers.length ? risers[risers.length - 1].maillon : null,
      ...(typeof brakes === 'object' ? brakes : {}),
    });
    plan.lines = plan.lines.concat(bp.lines);
    plan.brakePlan = bp;
  }
  // The riser webbing itself, as lines, so the model shows what carries the
  // load between pilot and cascade.
  if (riserLengthM > 0) {
    // `plan.risers` is already the riser DEFINITIONS — which rows each one
    // carries. This is the webbing geometry, which is a different thing, and
    // overwriting the first with the second broke a test that reads
    // `plan.risers[2].rows`.
    plan.riserWebbing = [];
    // The brake has no riser. Its lower line runs from the handle through a
    // pulley on the rear riser, and is marked `riser: 'K'` only to say which
    // cascade it belongs to. Counted here it became a fourth strap, drawn
    // over the A riser, and a third more webbing in the bill of materials:
    // eight risers and 4.0 m on a wing that has six and 3.0 m.
    const risers = [...new Set(plan.lines
      .filter((l) => l.level === 'main' && l.riser && !l.isBrake && l.row !== 'K')
      .map((l) => l.riser))];
    for (const riser of (risers.length ? risers : ['A'])) {
      // Recorded separately from the lines.
      //
      // A riser is webbing, not a line: it has no name in the line-naming
      // convention, is not cut from line stock, and does not belong in a
      // total line length. Pushing it into `plan.lines` broke the name parser
      // and the length total at once, which is the system saying it is not a
      // line.
      plan.riserWebbing.push({
        row: riser,
        // No `level`. The deepest LINE level is `main`; a riser is webbing,
        // and giving it a line level is the rename this project already made
        // once, undone. The audit caught it.
        kind: 'webbing',
        name: `riser-${riser}`,
        riser,
        from: karabiner.slice(),
        to: (riserTops[riser] ?? firstTop).slice(),
        lengthMM: Math.round(riserLengthM * 1000),
        anchors: [],
      });
    }
    plan.riserTop = firstTop;
    plan.riserLengthM = riserLengthM;
  }

  plan.totals = planTotals(plan);
  plan.totalLengthM = plan.lines.reduce((s, l) => s + (l.lengthMM * 2) / 1000, 0);
  plan.mergedRows = mergeRows || [];
  // A row that could not be given the mains it asked for.
  plan.mainShortfalls = shortfalls;
  plan.mainsAsRequested = shortfalls.length === 0;
  return plan;
}

/**
 * Merge two rows' cascades below the top level.
 *
 * Each row keeps its own top lines — they attach at different chord positions
 * and cannot be shared — but everything below joins, so one line carries both
 * rows down to the riser. Advance's TAU DLS does this with AB and CD.
 *
 * It is how a maker cuts line count without cutting anchor count. Whether it
 * cuts *drag* is a separate question and worth measuring rather than
 * assuming: the merged lines are fewer but each carries the sum of the rows
 * it serves, and a line's diameter goes roughly as the square root of the
 * load it holds. Halving the count while doubling the load per line is close
 * to break-even on frontal area, and any saving comes from the fact that a
 * line carrying twice the load is not twice as thick.
 */
function mergeCascades(plan, groups, levelFractions, junction = lerp3) {
  for (const group of groups) {
    const rows = group.filter((r) => plan.lines.some((l) => l.row === r));
    if (rows.length < 2) continue;

    const tops = plan.lines.filter((l) => rows.includes(l.row) && l.level === 'upper');
    if (!tops.length) continue;

    const below = plan.lines.filter((l) => rows.includes(l.row) && l.level !== 'upper');
    const riserName = below[0]?.riser ?? plan.risers[0].name;
    const maillon = plan.risers.find((r) => r.name === riserName)?.maillon ?? plan.maillon;
    plan.lines = plan.lines.filter((l) => !below.includes(l));

    // Pool both rows' top lines by the RIB they stand on. This pooled them
    // by their number in the row, which is the same rib only while the rows
    // have the same anchor count.
    const byAnchor = new Map();
    for (const t of tops) {
      const k = Number.isInteger(t.ribIndex) ? t.ribIndex : t.index;
      if (!byAnchor.has(k)) byAnchor.set(k, []);
      byAnchor.get(k).push(t);
    }
    const anchors = [...byAnchor.keys()].sort((a, b) => a - b);
    const label = rows.join('');

    // The merged cascade keeps the same number of levels as the one it
    // replaces — it shares them between two rows rather than collapsing them.
    //
    // Collapsing middle and riser into a single line was the first attempt,
    // and it made every top line span most of the distance to the maillon:
    // line count fell but total length rose by a quarter, and drag with it.
    // The junctions have to stay where they were.
    const groupsOf2 = [];
    for (let i = 0; i < anchors.length; i += 2) groupsOf2.push(anchors.slice(i, i + 2));
    const riserGroups = [];
    for (let i = 0; i < groupsOf2.length; i += 2) riserGroups.push(groupsOf2.slice(i, i + 2));

    let midIndex = 0;
    riserGroups.forEach((rg, r) => {
      const allTops = rg.flat().flatMap((a) => byAnchor.get(a));
      const rNode = lerpPt(maillon, centroid3(allTops.map((t) => t.to)), levelFractions[0]);
      plan.lines.push({
        row: rows[0], rows: [...rows], combined: true,
        level: 'main', index: r + 1, name: `${label}R${r + 1}`,
        riser: riserName, from: maillon, to: rNode, lengthMM: mm(maillon, rNode),
        anchors: [...new Set(allTops.map((t) => t.index))],
      });

      for (const pair of rg) {
        const grp = pair.flatMap((a) => byAnchor.get(a));
        // No wider a fan than in the unmerged cascade.
        const mNode = junction(rNode, centroid3(grp.map((t) => t.to)),
          levelFractions[1], grp.map((t) => t.to));
        midIndex += 1;
        plan.lines.push({
          row: rows[0], rows: [...rows], combined: true,
          level: 'middle', index: midIndex, name: `${label}M${midIndex}`,
          riser: riserName, from: rNode, to: mNode, lengthMM: mm(rNode, mNode),
          anchors: [...new Set(grp.map((t) => t.index))],
        });
        for (const t of grp) {
          t.from = mNode;
          t.lengthMM = mm(mNode, t.to);
        }
      }
    });
  }
}

/**
 * Every attachment point's path down the cascade: the lines between the sail
 * and the riser, top line first.
 *
 * A wing hangs from its attachment points, and what an inspector measures at
 * one — the total line length of the PMA standard — is the sum of the lines
 * under it. So anything that asks what an attachment point does (how long its
 * total is at the measuring tension, how far it has moved after two hundred
 * hours) needs the path and not the lines one at a time.
 *
 * Found by walking the plan's own nodes: a line's lower end is the upper end
 * of the line below it. That holds for a generated plan, for a merged row
 * whose main line serves two rows, for the stabilo and the brake cascade, and
 * for an imported design, whose levels do not line up with this tool's three.
 *
 * `riserMM` is what joins the lines to the harness. A brake has none: its
 * total runs from the sail to the knot at the handle (PMA Figure 5).
 *
 * @returns {{name, row, index, ribIndex, isBrake, isStabilo, names: string[],
 *            lines: object[], lengthMM: number, riserMM: number}[]}
 */
export function planPaths(plan) {
  const byNode = new Map();
  for (const l of plan?.lines ?? []) if (l.to) byNode.set(nodeKey(l.to), l);

  const out = [];
  for (const l of plan?.lines ?? []) {
    if (l.level !== 'upper') continue;
    const isBrake = l.row === 'K' || !!l.isBrake;
    const lines = [l];
    let node = l.from;
    for (let guard = 0; guard < 12 && node; guard++) {
      const parent = byNode.get(nodeKey(node));
      if (!parent || lines.includes(parent)) break;
      // A suspension line ends at its riser, and the brake's lower line ends
      // at the pulley on the rear riser — the same point. Walking on through
      // it put the brake's handle-to-pulley line under every C and D
      // attachment: 0.6 m on each of their totals, for as long as plans have
      // had brakes.
      if ((parent.row === 'K' || !!parent.isBrake) !== isBrake) break;
      lines.push(parent);
      node = parent.from;
    }
    out.push({
      name: l.name,
      row: l.row,
      index: l.index,
      ribIndex: l.ribIndex ?? null,
      isBrake,
      isStabilo: l.row === 'S' || !!l.isStabilo,
      names: lines.map((x) => x.name),
      lines,
      lengthMM: lines.reduce((s, x) => s + x.lengthMM, 0),
      riserMM: isBrake ? 0 : (plan.riserLengthMM ?? 0),
    });
  }
  return out;
}

/**
 * How wide every fan of a plan opens: for each line with a line below it,
 * the angle between the two, in degrees.
 *
 * This is the angle `maxFanAngleDeg` limits, measured on whatever plan it is
 * given — a generated one, or a design's own.
 */
export function planFanAngles(plan) {
  const out = [];
  const seen = new Set();
  for (const p of planPaths(plan)) {
    for (let i = 0; i + 1 < p.lines.length; i++) {
      const l = p.lines[i];
      if (seen.has(l.name)) continue;
      seen.add(l.name);
      const below = p.lines[i + 1];
      out.push({
        name: l.name, row: l.row, level: l.level, direct: !!l.direct,
        isBrake: p.isBrake, isStabilo: p.isStabilo,
        below: below.name, lengthMM: l.lengthMM,
        fanDeg: angleBetweenDeg(
          [l.to[0] - l.from[0], l.to[1] - l.from[1], l.to[2] - l.from[2]],
          [below.to[0] - below.from[0], below.to[1] - below.from[1], below.to[2] - below.from[2]],
        ),
        fromVerticalDeg: lineAngleFromVerticalDeg(l.from, l.to),
      });
    }
  }
  return out;
}

/**
 * Sail-to-harness length for every anchor of the rows that have one, keyed
 * `[index][row]`.
 *
 * The brake's is from the sail to its handle. It had the riser added to it
 * like the rest — 500 mm on every brake total — and a brake does not run
 * through a riser's length: it leaves the riser at the pulley.
 */
function planTotals(plan) {
  const totals = {};
  for (const p of planPaths(plan)) {
    (totals[p.index] ||= {})[p.row] = Math.round(p.lengthMM + p.riserMM);
  }
  return totals;
}

const nodeKey = (p) => p.map((v) => v.toFixed(6)).join(',');

/**
 * Compare a generated plan with a real one, anchor by anchor.
 *
 * The useful comparison is not absolute length — that depends on line length
 * and wing size — but the *shape* of the distribution across the span, which
 * is what determines trim. So both are reported: the raw difference, and the
 * difference after removing the mean offset.
 */
export function comparePlans(planTotals, reference) {
  const diffs = [];
  for (const [anchorStr, rows] of Object.entries(reference)) {
    const anchor = Number(anchorStr);
    for (const [row, refMM] of Object.entries(rows)) {
      const got = planTotals[anchor]?.[row];
      if (got == null || refMM == null) continue;
      diffs.push({ anchor, row, referenceMM: refMM, planMM: got, deltaMM: got - refMM });
    }
  }
  if (!diffs.length) return { count: 0 };
  const deltas = diffs.map((d) => d.deltaMM);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const spread = diffs.map((d) => Math.abs(d.deltaMM - mean));
  return {
    diffs,
    count: diffs.length,
    meanOffsetMM: mean,
    worstAbsMM: Math.max(...deltas.map(Math.abs)),
    worstShapeMM: Math.max(...spread),
    meanShapeMM: spread.reduce((a, b) => a + b, 0) / spread.length,
  };
}

/** Reference totals from a parsed production table, keyed as comparePlans wants. */
export function referenceTotals(lineSet, rowOrder = ['A', 'B', 'C', 'D', 'K']) {
  const out = {};
  for (const t of lineSet.totals) {
    const rows = {};
    t.lengths.forEach((v, i) => { if (v != null && rowOrder[i]) rows[rowOrder[i]] = v; });
    if (Object.keys(rows).length) out[t.anchor] = rows;
  }
  return out;
}

const mm = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * How far a line from `from` up to `to` lies from vertical, in degrees.
 * A line whose upper end is not above its lower one is 90 or more: it
 * cannot hold anything up.
 */
export function lineAngleFromVerticalDeg(from, to) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (!(len > 0)) return 0;
  return Math.acos(Math.max(-1, Math.min(1, d[2] / len))) * (180 / Math.PI);
}

/** The angle between two directions, in degrees. */
function angleBetweenDeg(a, b) {
  const la = Math.hypot(a[0], a[1], a[2]);
  const lb = Math.hypot(b[0], b[1], b[2]);
  if (!(la > 0) || !(lb > 0)) return 0;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c))) * (180 / Math.PI);
}

/**
 * A cascade junction a fraction of the way from its parent toward the
 * centroid it serves — lowered toward the parent, if it has to be, until no
 * line from it up to `tops` is more than `maxFanDeg` from the line below it
 * (and, if `maxVerticalDeg` is set, none more than that from vertical).
 *
 * The junction stays on the line from the parent to the centroid, so the
 * line below keeps its direction whatever the fraction, and that direction
 * is what the fan is measured from. Lowering only narrows: the lines above
 * get longer and closer to it, the line below gets shorter. The fraction
 * stays the measured one wherever that already gives a fan no wider than
 * the limit.
 */
function fanJunction(parent, centroid, fraction, tops, maxFanDeg = 0, maxVerticalDeg = 0) {
  let f = fraction;
  let node = lerp3(parent, centroid, f);
  if (!tops.length || (!(maxFanDeg > 0) && !(maxVerticalDeg > 0))) return node;
  const axis = [centroid[0] - parent[0], centroid[1] - parent[1], centroid[2] - parent[2]];
  const fits = (n) => tops.every((p) => {
    const d = [p[0] - n[0], p[1] - n[1], p[2] - n[2]];
    if (maxFanDeg > 0 && angleBetweenDeg(d, axis) > maxFanDeg) return false;
    if (maxVerticalDeg > 0 && lineAngleFromVerticalDeg(n, p) > maxVerticalDeg) return false;
    return true;
  });
  for (let i = 0; i < 60 && !fits(node); i++) {
    f *= 0.95;
    node = lerp3(parent, centroid, f);
  }
  return node;
}

function chunkBy(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function weightedCentroid(anchors, mode) {
  let x = 0; let y = 0; let z = 0; let w = 0;
  for (const a of anchors) {
    const q = mode === 0 ? 1 : a.chord;
    x += a.point[0] * q; y += a.point[1] * q; z += a.point[2] * q; w += q;
  }
  return [x / w, y / w, z / w];
}

function centroid3(pts) {
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return s.map((v) => v / pts.length);
}

/* ------------------------------------------------- PHI line sheet format -- */

/**
 * Read a PHI-style line sheet.
 *
 * A second production format, and a usefully different one. Where the Ozone
 * sheets are an inventory (one row per line, with a totals matrix alongside),
 * this is a cascade table: one row per canopy attachment, with the length of
 * each level of the cascade laid out across the columns and the total in a
 * "Checking" column.
 *
 *   Rib | upper | middle | riser | ... | Checking | Rib | types... | Rib | names...
 *     2 |  1344 |   1779 |  4255 |     |     7378 |
 *     5 |  1247 |        |       |     |     7281 |
 *
 * A blank means "the same as the row above" — rib 5 hangs from the same middle
 * and riser lines as rib 2, which is how the branching is expressed. Carrying
 * the last non-blank value forward recovers the cascade directly, so unlike
 * the Ozone sheets no inference is needed: the topology is stated.
 *
 * The naming convention differs too, and is worth recording because it is a
 * third scheme again: lowercase for the upper lines (`a1`), uppercase for the
 * middle (`A1`), and roman numerals for the riser level (`AI`, `AII`).
 *
 * The totals close exactly — level lengths sum to the printed check with no
 * residue — which makes this the strongest arithmetic validation available
 * for cascade totals anywhere in this project.
 */
export function parsePhiLineSheet(text) {
  const grid = text.split(/\r?\n/).map((l) => l.split('\t'));
  const num = (v) => {
    const n = Number(String(v ?? '').trim());
    return Number.isFinite(n) && n !== 0 ? n : null;
  };
  const txt = (v) => (v || '').trim();

  const blocks = [];
  let current = null;

  for (const r of grid) {
    // A block header can sit in any column — the brake block is indented
    // past a spanwise distribution column, and looking only where the first
    // header appeared silently folds the brakes into the D row.
    let header = null;
    let headerCol = -1;
    for (let c = 0; c < r.length; c++) {
      const m2 = /^([A-Z]{1,3})\s*-\s*LINES$/.exec(txt(r[c]));
      if (m2) { header = m2[1]; headerCol = c; break; }
    }
    if (header) {
      // Column positions are fixed by the sheet layout, not by where the
      // block label happens to sit: lengths from column 2, the check total at
      // 9, line types from 12, names from 20. The label for the brake block
      // is pushed right by a distribution column, so keying off its position
      // reads the wrong columns entirely.
      current = {
        row: header,
        anchors: [],
        lengths: new Map(),
        types: new Map(),
        // Brakes run a deeper cascade and list each upper line twice — once
        // plain and once with the spanwise distribution added — so the level
        // columns do not line up one-to-one with the names. Decoding that
        // properly needs the brake geometry, so it is flagged rather than
        // guessed at.
        paired: header === 'BR',
      };
      blocks.push(current);
      continue;
    }
    if (!current) continue;

    // The rib number is the first integer in the two leading columns.
    const rib = num(r[0]) ?? num(r[1]);
    if (rib == null) continue;

    // Names identify the line at each level, and they are what makes the
    // sheet readable: a blank length means this anchor shares the level above
    // it, and the repeated name says which line that is. Reading the columns
    // positionally instead — carrying the last value forward — cannot tell a
    // shared line from a level that simply does not exist for this anchor,
    // and gets both wrong at the tip.
    const names = [];
    for (let c = 20; c < r.length; c++) {
      const t = txt(r[c]);
      if (t && !/^\d+$/.test(t)) names.push(t);
    }
    if (!names.length) continue;

    // Level lengths and types, from their fixed columns.
    const lens = [];
    const typs = [];
    for (let k = 0; k < names.length; k++) {
      lens.push(num(r[2 + k]));
      typs.push(txt(r[12 + k]));
    }

    // Record a length the first time its name carries one.
    names.forEach((nm, k) => {
      if (lens[k] != null && !current.lengths.has(nm)) {
        current.lengths.set(nm, lens[k]);
        if (typs[k]) current.types.set(nm, typs[k]);
      }
    });

    const path = names.map((nm) => ({
      name: nm,
      lengthMM: current.lengths.get(nm) ?? 0,
      type: current.types.get(nm) || null,
    }));

    current.anchors.push({
      rib,
      names,
      path,
      total: num(r[9]),
      sum: path.reduce((a, b) => a + b.lengthMM, 0),
    });
  }

  return {
    blocks,
    rows: blocks.map((b) => b.row),
    lines: blocks.flatMap((b) => [...b.lengths].map(([name, lengthMM]) => ({
      row: b.row, name, lengthMM, type: b.types.get(name) || null,
    }))),
  };
}

/**
 * Check a PHI sheet's own arithmetic: the level lengths must sum to the
 * printed total. Any residue means the cascade has been read wrongly — a
 * missed continuation, or a column taken for a level that is really a variant.
 */
export function checkPhiSheet(sheet, { tolerance = 1 } = {}) {
  const problems = [];
  const crossBlock = [];
  let checked = 0;
  let exactRows = 0;

  // Lengths of every named line, across all blocks. A row that cascades into
  // another row's riser leaves those levels blank in its own block, because
  // the line belongs to the block that owns it.
  const all = sheet.lines.map((l) => ({ ...l }));

  const skipped = [];
  for (const b of sheet.blocks) {
    if (b.paired) { skipped.push(b.row); continue; }
    for (const a of b.anchors) {
      if (a.total == null || !a.path.length) continue;
      checked++;
      const deficit = a.total - a.sum;
      if (Math.abs(deficit) <= tolerance) { exactRows++; continue; }

      // A deficit that matches the tail of another row's cascade means this
      // row hangs off that row's riser — D into C is the usual case, and the
      // tip lines of B often join the A riser. That is structure, not error,
      // so it is resolved and reported rather than counted as a mismatch.
      const parent = findTail(sheet, deficit, tolerance, a, b);
      if (parent) {
        crossBlock.push({ row: b.row, rib: a.rib, deficit, inheritsFrom: parent });
        exactRows++;
      } else {
        problems.push({ row: b.row, rib: a.rib, sum: a.sum, total: a.total, deficit });
      }
    }
  }

  return {
    checked,
    exactRows,
    problems,
    crossBlock,
    exact: problems.length === 0,
    closureRate: checked ? exactRows / checked : 0,
    lines: all.length,
    notDecoded: skipped,
  };
}

/** Find a set of lines from one block whose lengths sum to a deficit. */
/**
 * Which lines of another row an anchor hangs from, where its own block leaves
 * a level blank.
 *
 * The sheet says which, by name. `d5` is listed as `d5 / D3 / DII` with no
 * length for the last two: it joins the C row's `C3` and `CII`, the lines of
 * the same number in the block that owns them. So the names are tried first,
 * and a pair that merely adds up is the fallback — taken from the tails of
 * real line paths, the closest first.
 *
 * It was the fallback alone, over any two lines of a block, first match
 * within a millimetre. For `d5`, `d6` and `d7` (5526 mm missing) that found
 * `CI` + `c2` = 5527 mm before it reached `C3` + `CII` = 5526: a riser line
 * with another anchor's TOP line under it. Three D lines were hung from the
 * wrong riser, and nothing downstream used the answer closely enough to
 * notice.
 */
function findTail(sheet, deficit, tolerance, anchor = null, block = null) {
  const others = sheet.blocks.filter((b) => b !== block && !b.paired);

  // By name: the blank levels, with this row's letters swapped for another's.
  if (anchor && block) {
    const blank = anchor.path.filter((q) => !(q.lengthMM > 0)).map((q) => q.name);
    const own = new RegExp(`^${block.row}`, 'i');
    if (blank.length && blank.every((n) => own.test(n))) {
      for (const b of others) {
        const names = blank.map((n) => n.replace(own, (m0) => (
          m0 === m0.toLowerCase() ? b.row.toLowerCase() : b.row)));
        if (!names.every((n) => b.lengths.has(n))) continue;
        const sum = names.reduce((t, n) => t + b.lengths.get(n), 0);
        if (Math.abs(sum - deficit) <= tolerance) return { row: b.row, names, by: 'name' };
      }
    }
  }

  // By length: the tail of a real path in another block — a riser line, or
  // a middle line with the riser line it hangs from.
  let best = null;
  for (const b of others) {
    for (const a of b.anchors) {
      const real = a.path.filter((q) => q.lengthMM > 0);
      for (let from = 1; from < real.length; from++) {
        const tail = real.slice(from);
        const err = Math.abs(tail.reduce((t, q) => t + q.lengthMM, 0) - deficit);
        if (err > tolerance) continue;
        const far = anchor ? Math.abs(a.rib - anchor.rib) : 0;
        if (!best || err < best.err || (err === best.err && far < best.far)) {
          best = { row: b.row, names: tail.map((q) => q.name), by: 'length', err, far };
        }
      }
    }
  }
  return best ? { row: best.row, names: best.names, by: best.by } : null;
}

/**
 * Every load-bearing anchor of a PHI sheet, with the whole path it hangs
 * from — its own lines and the ones it borrows from another row.
 *
 * This is what a load needs: a line carries every anchor whose path it is
 * on. `lines` is each named line once, with its length and its type.
 */
export function phiAnchorPaths(sheet, { tolerance = 1 } = {}) {
  const chk = checkPhiSheet(sheet, { tolerance });
  const lines = new Map();
  for (const b of sheet.blocks) {
    if (b.paired) continue;
    for (const [name, lengthMM] of b.lengths) {
      lines.set(name, { name, row: b.row, lengthMM, type: b.types.get(name) || null });
    }
  }
  const anchors = [];
  for (const b of sheet.blocks) {
    if (b.paired) continue;
    for (const a of b.anchors) {
      if (a.total == null) continue;            // listed, and not fitted
      const own = a.path.filter((q) => q.lengthMM > 0).map((q) => q.name);
      const cross = chk.crossBlock.find((x) => x.row === b.row && x.rib === a.rib);
      const path = cross ? [...own, ...cross.inheritsFrom.names] : own;
      anchors.push({
        row: b.row,
        rib: a.rib,
        path,
        totalMM: a.total,
        pathMM: path.reduce((t, n) => t + (lines.get(n)?.lengthMM ?? 0), 0),
        inherits: cross ? cross.inheritsFrom : null,
      });
    }
  }
  return { anchors, lines: [...lines.values()], closes: chk.exact };
}

/** Total line length of a PHI sheet, counting both sides of the wing. */
export function phiLineLength(sheet, { sides = 2 } = {}) {
  // Each named line is one physical line, however many anchors hang from it,
  // so the set is the sum over distinct names — not over anchor paths, which
  // would count every shared upper line once per anchor below it.
  const total = sheet.lines.reduce((a, l) => a + l.lengthMM, 0);
  return (total / 1000) * sides;
}

/* -------------------------------------------------- BGD line table format -- */

/**
 * Read a BGD line table.
 *
 * A fourth production format, and the only one that **states the cascade**
 * rather than leaving it to be inferred. Each row is one line, and the
 * right-hand columns name the whole path it belongs to:
 *
 *   Line ID | Material | Colour | Upper splice | Lower splice | Length | Rib | | Top | Middle | Riser | (Lower)
 *   a1      | 8000U-120| Red    | 0            | 1            | 265    | 2   | | a1  | AM1    | AR1   |
 *   k1      | 8000U-050| Yellow | 0            | 0            | 507    | 2   | | k1  | KM1    | KR1   | KL1
 *
 * A rib position of -1 marks a line that does not reach the canopy — the
 * middle and riser lines, which appear again as rows of their own carrying
 * their lengths. Brakes run four levels where the main rows run three.
 *
 * Two things this format records that the others do not:
 *
 *   - **Lengths are measured under 5 daN of pretension**, not slack. Line
 *     length is only meaningful with the tension stated, since these lines
 *     stretch under load; 5 daN is roughly what a line sees hanging.
 *   - **Splice inserts** are flagged per end, and the sheet states that
 *     compensation for tabs, knots and loops is already included — so these
 *     are finished lengths, not cut lengths.
 *
 * Because the topology is given, this doubles as ground truth for
 * `inferTopology`, which has to recover the same structure from lengths alone
 * on the sheets that do not state it.
 */
export function parseBgdLineTable(text) {
  const rows = text.split(/\r?\n/).map((l) => l.split('\t'));
  const lines = [];
  const meta = { pretensionDaN: 5, compensated: false, loops: null };

  for (const r of rows) {
    const first = (r[0] || '').trim();
    if (/^Loops/i.test(first)) meta.loops = first;
    if (/compensation/i.test(first)) meta.compensated = true;
    if (/^Line ID$/i.test(first)) continue;

    const lengthMM = Number(r[5]);
    const ribPos = Number(r[6]);
    if (!first || !Number.isFinite(lengthMM) || lengthMM <= 0) continue;

    const path = [r[8], r[9], r[10], r[11]].map((x) => (x || '').trim()).filter(Boolean);
    const parsed = parseLineName(first);

    lines.push({
      name: first,
      ...(parsed || {}),
      material: (r[1] || '').trim() || null,
      colour: (r[2] || '').trim() || null,
      upperSplice: Number(r[3]) || 0,
      lowerSplice: Number(r[4]) || 0,
      lengthMM,
      // -1 marks a cascade line that does not reach the canopy.
      ribPosition: Number.isFinite(ribPos) && ribPos > 0 ? ribPos : null,
      reachesCanopy: Number.isFinite(ribPos) && ribPos > 0,
      statedPath: path.length > 1 ? path : null,
      quantity: 2,
    });
  }

  const byName = new Map(lines.map((l) => [l.name, l]));
  return { lines, byName, meta };
}

/**
 * Cascade totals from a BGD table, using its stated paths.
 * Every canopy line's total is the sum of the named lines on its path, so
 * this needs no inference at all — which is what makes it a check on the
 * inference used elsewhere.
 */
export function bgdCascadeTotals(table) {
  const out = [];
  for (const l of table.lines) {
    if (!l.reachesCanopy || !l.statedPath) continue;
    const segs = l.statedPath.map((n) => table.byName.get(n)).filter(Boolean);
    if (segs.length !== l.statedPath.length) continue;
    out.push({
      name: l.name,
      rib: l.ribPosition,
      row: l.row,
      path: l.statedPath,
      lengths: segs.map((s) => s.lengthMM),
      totalMM: segs.reduce((a, s) => a + s.lengthMM, 0),
      depth: segs.length,
    });
  }
  out.sort((a, b) => (a.row || '').localeCompare(b.row || '') || a.rib - b.rib);
  return out;
}

/** The stated branch grouping: which anchors share each middle line. */
export function bgdStatedTopology(table, row) {
  const groups = new Map();
  for (const l of table.lines) {
    if (!l.reachesCanopy || !l.statedPath || l.row !== row) continue;
    const mid = l.statedPath[1];
    if (!mid) continue;
    if (!groups.has(mid)) groups.set(mid, []);
    groups.get(mid).push(l.ribPosition);
  }
  return [...groups.entries()]
    .map(([mid, ribs]) => ({ middle: mid, ribs: ribs.sort((a, b) => a - b) }))
    .sort((a, b) => a.ribs[0] - b.ribs[0]);
}

/* ------------------------------------------------------------- brakes -- */

/**
 * Brake cascades, which are not just another row.
 *
 * Every generated row so far runs three levels from a riser maillon to the
 * canopy. Brakes differ in four ways, all visible in the production data:
 *
 *   1. **Four levels, not three.** BGD's Lynx 2 runs k -> KM -> KR -> KL, and
 *      Ozone splits its riser level into KRU and KRL around the pulley.
 *   2. **A single shared lower line.** KL1 appears in all thirteen paths at
 *      the same 2926 mm: one line from the handle up to the pulley, carrying
 *      the whole cascade. Nothing in the load-bearing rows behaves like that.
 *   3. **Anchors are deliberately uneven.** The Lynx 2 attaches at ribs
 *      2, 4, 8, 10, 13, 15, 18, 20, 23, 25, 27, 29, 31 — gaps of 2 to 4
 *      inboard closing to a steady 2 outboard. Braking is meant to bite at
 *      the tip first.
 *   4. **Total length falls outboard**, from 7913 mm at rib 2 to 6813 mm at
 *      rib 31, because the arc brings the tip trailing edge nearer the pilot.
 *
 * The handle hangs below and behind the maillon, and the line runs up through
 * a pulley on the riser. Slack between handle and trailing edge is what gives
 * a brake its free travel, and it is a design quantity rather than a
 * by-product: too little and the wing flies braked, too much and the range
 * runs out before the stall.
 */

/**
 * Where the risers hang along the chord.
 *
 * A paraglider hangs with the pilot below the point the lift acts through, so
 * the maillon sits at the load-weighted centroid of the load-bearing anchors
 * — where the resultant of the lines acts. Brakes and the stabilo are left
 * out: they do not carry the wing.
 *
 * ONE definition, because there were two maillons and fixing one left the
 * other at the leading edge. The main cascade hung correctly and the brakes
 * still ran forward to a handle under the nose.
 */
export function hangPointFromAnchors(wing, fractions, calageFraction = null) {
  // The CALAGE, when the equilibrium has been solved.
  //
  // A paraglider's angle of incidence is set by its line lengths: the wing
  // hangs from the maillon and sits at whatever attitude those lengths
  // dictate. The point it hangs from is the calage — where the moment
  // balances, with the lift acting forward of it and the section's own
  // pitching moment making up the difference. That is chapter 4's whole
  // subject and `solveEquilibrium` computes it.
  //
  // This used a load-weighted average of the anchor positions instead, which
  // is a plausible-looking geometric proxy and not the same thing. On a
  // typical wing it came out at 31.9% of chord where the equilibrium says
  // **50.6%** — the wing was hung 18.7 points of chord too far forward, so
  // the model pitched nose-down against the attitude it would really fly at.
  //
  // These are flying machines. Where the mass hangs decides how they fly, and
  // a geometric average of some attachment points does not know that.
  if (Number.isFinite(calageFraction) && calageFraction > 0) {
    const rootRib = wing?.ribs?.[0];
    if (rootRib) {
      return (rootRib.xLE ?? 0) + calageFraction * (rootRib.chord ?? 0);
    }
  }
  // A calage that cannot balance is not used.
  //
  // `solveEquilibrium` has a `legacySpreadsheet` mode that reproduces a 2012
  // worksheet, and it omits the aerofoil's own pitching moment from the
  // balance. The number it returns is right for matching that worksheet and
  // wrong as geometry: it puts the hang point FORWARD of the centre of
  // pressure, where the lift-weight couple adds to the section's nose-down
  // moment instead of opposing it. A wing hung there could not fly.
  //
  // `usableCalage` below is the guard. Legacy remains available for
  // reproducing the worksheet's numbers; it just does not get to place the
  // lines.

  // Without a solved equilibrium, fall back to the anchor centroid — better
  // than the leading edge, and the caller is told which was used.
  return hangPointFromAnchorCentroid(wing, fractions);
}

/**
 * Whether a solved calage can be used to hang a wing.
 *
 * Taking moments about the hang point, lift acting FORWARD of it gives a
 * nose-up couple, which is what balances an aerofoil's nose-down pitching
 * moment. So a usable calage sits AFT of the centre of pressure. One forward
 * of it describes a wing that cannot balance, and the 2012-spreadsheet mode
 * returns exactly that because it leaves the aerofoil moment out.
 */
export function usableCalage(balance) {
  if (!balance || !Number.isFinite(balance.calageFraction)) {
    return { ok: false, why: 'no calage solved' };
  }
  if (!(balance.calageFraction > 0 && balance.calageFraction < 1)) {
    return { ok: false, why: 'calage is not a fraction of chord' };
  }
  if (Number.isFinite(balance.xcpFraction)
    && balance.calageFraction < balance.xcpFraction) {
    return {
      ok: false,
      why: `the calage (${(balance.calageFraction * 100).toFixed(1)}%) is `
        + `forward of the centre of pressure `
        + `(${(balance.xcpFraction * 100).toFixed(1)}%), so the wing could not `
        + 'balance there',
    };
  }
  return { ok: true, why: null };
}

/** The load-weighted centroid of the load-bearing anchors. */
function hangPointFromAnchorCentroid(wing, fractions) {
  const rows = Object.entries(fractions || {})
    .filter(([row]) => !['K', 'BR', 'ST', 'S'].includes(row));
  const rootRib = wing?.ribs?.[0];
  if (!rows.length || !rootRib) return 0;
  // Front rows carry more of the load, so weight by the share convention.
  const share = { A: 0.35, B: 0.35, C: 0.20, D: 0.10, E: 0.05 };
  let num = 0;
  let den = 0;
  for (const [row, frac] of rows) {
    const w = share[row] ?? 0.1;
    num += frac * w;
    den += w;
  }
  const chordFraction = den > 0 ? num / den : 0.4;
  return (rootRib.xLE ?? 0) + chordFraction * (rootRib.chord ?? 0);
}

/**
 * Trailing-edge attachment ribs for the brake, by rib number, set closer
 * together toward the tip.
 * @param {number} ribCount   ribs in the half wing
 * @param {number} anchors    attachment points wanted
 * @param {number} tipBias    0 = even, 1 = strongly bunched outboard
 */
export function brakeAnchorRibs(ribCount, anchors, tipBias = 0.55) {
  // More anchors than ribs cannot be placed. The monotonic repair below
  // clamps at the tip, so asking for too many silently returned the outermost
  // rib twice — two brake lines onto one attachment point, which is not a
  // wing. Cap the request instead.
  const wanted = Math.max(1, Math.min(anchors, ribCount));
  const out = [];
  for (let i = 0; i < wanted; i++) {
    const u = wanted === 1 ? 0 : i / (wanted - 1);
    // Blend a linear sweep with one biased outboard; the exponent pulls
    // stations toward the tip without ever reversing their order.
    const t = (1 - tipBias) * u + tipBias * (1 - (1 - u) ** 1.7);
    out.push(Math.min(ribCount - 1, Math.max(0, Math.round(t * (ribCount - 1)))));
  }
  // Never place two anchors on one rib. Repair upward, then sweep back down
  // from the tip so a run that hit the ceiling is pushed inboard rather than
  // collapsing onto the last rib.
  for (let i = 1; i < out.length; i++) {
    if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1;
  }
  if (out[out.length - 1] > ribCount - 1) {
    out[out.length - 1] = ribCount - 1;
    for (let i = out.length - 2; i >= 0; i--) {
      if (out[i] >= out[i + 1]) out[i] = out[i + 1] - 1;
    }
  }
  return out;
}

/**
 * Build the brake cascade.
 *
 * `levelCounts` gives the number of lines at each cascade level below the
 * anchors, outermost first — [6, 3, 1] reproduces the Lynx 2's structure of
 * six middle lines onto three riser lines onto one shared lower line.
 */
export function buildBrakePlan({
  // Where the risers hang along the chord. Defaults to the same load-weighted
  // point `buildLinePlan` uses, so the brakes hang from where the wing
  // actually balances rather than from its nose.
  hangPointX = null,
  wing,
  handlePoint = null,
  pulleyPoint = null,
  anchors = 13,
  tipBias = 0.55,
  levelCounts = [6, 3, 1],
  lineLengthM = 6.5,
  handleDropM = 0.55,
  handleAftM = 0.35,
  karabinerSeparationM = 0.42,
  levelFractions = [0.64, 0.78],
} = {}) {
  const ribs = wing.ribs;
  // The SAME hang point the main cascade uses.
  //
  // This was a second copy of `[0, ..., -lineLengthM]` — the leading edge —
  // and fixing the one in `buildLinePlan` left it behind. So the main lines
  // hung correctly under the wing while the brakes still ran forward to a
  // handle under the nose, which is exactly the "brakes still projected
  // forward" that was reported after the first fix.
  //
  // Two copies of a position is one too many. It is passed in now, and
  // defaults to the same load-weighted hang point rather than to zero.
  const maillon = [
    hangPointX ?? hangPointFromAnchors(wing, anchors),
    karabinerSeparationM / 2,
    -lineLengthM,
  ];
  const pulley = pulleyPoint || maillon;
  const handle = handlePoint
    || [maillon[0] + handleAftM, maillon[1], maillon[2] - handleDropM];

  const anchorRibs = brakeAnchorRibs(ribs.length, anchors, tipBias);
  const points = anchorRibs.map((ri, i) => ({
    anchor: i + 1,
    ribIndex: ri,
    chord: ribs[ri].chord,
    // The trailing edge is the last point of the lower surface.
    point: ribs[ri].lower[ribs[ri].lower.length - 1].slice(),
  }));

  const lines = [];

  // Work down from the pulley: split the anchors into riser groups, then
  // middle groups, then run the upper lines out to the trailing edge.
  const [nMid, nRiser] = levelCounts;
  const riserGroups = chunkInto(points, nRiser);
  let midIndex = 0;

  riserGroups.forEach((rg, r) => {
    const rNode = lerpPt(pulley, centroidPts(rg.map((p) => p.point)), levelFractions[0]);
    lines.push({
      row: 'K', level: 'main', index: r + 1, name: `KR${r + 1}`,
      riser: 'K', from: pulley, to: rNode,
      lengthMM: mmDist(pulley, rNode),
      anchors: rg.map((p) => p.anchor),
    });

    const perRiser = Math.max(1, Math.round(nMid / nRiser));
    const midGroups = chunkInto(rg, perRiser);
    midGroups.forEach((mg) => {
      midIndex += 1;
      const mNode = lerpPt(rNode, centroidPts(mg.map((p) => p.point)), levelFractions[1]);
      lines.push({
        row: 'K', level: 'middle', index: midIndex, name: `KM${midIndex}`,
        riser: 'K', from: rNode, to: mNode,
        lengthMM: mmDist(rNode, mNode),
        anchors: mg.map((p) => p.anchor),
      });
      mg.forEach((p) => {
        lines.push({
          row: 'K', level: 'upper', index: p.anchor, name: `k${p.anchor}`,
          riser: 'K', ribIndex: p.ribIndex,
          from: mNode, to: p.point,
          lengthMM: mmDist(mNode, p.point),
          anchors: [p.anchor],
        });
      });
    });
  });

  // The shared lower line: handle to pulley, carrying the whole cascade.
  const lower = {
    row: 'K', level: 'main', side: 'lower', index: 1, name: 'KL1',
    riser: 'K', from: handle, to: pulley,
    lengthMM: mmDist(handle, pulley),
    anchors: points.map((p) => p.anchor),
    shared: true,
  };
  lines.push(lower);

  // Totals from the handle to each trailing-edge point.
  const totals = {};
  for (const l of lines) {
    if (l.level !== 'upper') continue;
    const mid = lines.find((x) => x.level === 'middle' && x.anchors.includes(l.index));
    const ris = lines.find((x) => x.level === 'main' && !x.shared && x.anchors.includes(l.index));
    totals[l.index] = Math.round(
      l.lengthMM + (mid?.lengthMM ?? 0) + (ris?.lengthMM ?? 0) + lower.lengthMM,
    );
  }

  return {
    lines,
    handle,
    pulley,
    anchorRibs,
    totals,
    sharedLower: lower,
    totalLengthMM: lines.reduce((a, l) => a + l.lengthMM * 2, 0) - lower.lengthMM,
  };
}

/**
 * Brake engagement across the span.
 *
 * An earlier version of this reported "free travel" as the cascade path
 * length minus the straight-line distance from handle to trailing edge. That
 * number is not free travel and is not physically meaningful: the cascade
 * path *is* the taut route, so the difference is just how far the route bends
 * around the junctions, and it grows with span for reasons that have nothing
 * to do with braking.
 *
 * Free travel cannot be derived from geometry at all. If every brake line
 * were cut to its exact taut length, the whole trailing edge would engage the
 * instant the handle moved. Free travel is the slack the designer *adds*, and
 * the spanwise differential — which part of the wing bites first — comes from
 * how that slack is distributed, not from where the anchors sit.
 *
 * So what geometry supplies is the taut path per anchor. Combined with a
 * slack distribution it gives the engagement order, and that is what this
 * returns.
 *
 * @param {function} slackAt  extra length in mm, given normalised span 0..1.
 *                            Constant slack engages the whole span together;
 *                            slack falling outboard makes the tip bite first,
 *                            which is the usual choice.
 */
export function brakeEngagement(brakePlan, {
  slackAt = () => 120,
  halfSpanRibs = null,
} = {}) {
  const uppers = brakePlan.lines
    .filter((l) => l.level === 'upper')
    .sort((a, b) => a.index - b.index);
  const maxRib = halfSpanRibs
    ?? Math.max(...uppers.map((l) => l.ribIndex ?? 0), 1);

  const rows = uppers.map((l) => {
    const t = maxRib ? (l.ribIndex ?? 0) / maxRib : 0;
    const slack = slackAt(t);
    return {
      anchor: l.index,
      ribIndex: l.ribIndex,
      spanFraction: t,
      tautPathMM: brakePlan.totals[l.index],
      slackMM: Math.round(slack),
      // Handle movement before this anchor takes load.
      engagesAtMM: Math.round(slack),
    };
  });

  const eng = rows.map((r) => r.engagesAtMM);
  // Ties are possible where a slack distribution flattens near the tip, so
  // take the outermost of any minimum: that is the one a pilot feels first.
  const first = rows.reduce((a, r) => (r.engagesAtMM <= a.engagesAtMM ? r : a), rows[0]);
  return {
    rows,
    firstToEngage: first,
    minMM: Math.min(...eng),
    maxMM: Math.max(...eng),
    spreadMM: Math.max(...eng) - Math.min(...eng),
    tipEngagesFirst: rows[rows.length - 1].engagesAtMM < rows[0].engagesAtMM,
    // With no differential the whole trailing edge moves at once, which is
    // what an undistributed brake does and why designers do not use one.
    uniform: Math.max(...eng) - Math.min(...eng) < 1,
  };
}

/**
 * A slack distribution that brings the tip in first.
 * Returns a function of normalised span for `brakeEngagement`.
 */
export function tipFirstSlack({ centreMM = 180, tipMM = 60, power = 1.5 } = {}) {
  return (t) => centreMM + (tipMM - centreMM) * (t ** power);
}

/**
 * Split into exactly `groups` chunks, as evenly as the count allows.
 *
 * A fixed chunk size of `ceil(length / groups)` does not give `groups` chunks
 * whenever the division is inexact: six middles into four came back as
 * **three** groups of two, because ceil(6/4) is 2 and 2+2+2 exhausts the
 * array a group early.
 *
 * That silently ignored a designer asking for four mains on the B row, and
 * the shortfall check did not fire because it compared against the same wrong
 * arithmetic. Sizes are distributed instead: the first `length % groups`
 * chunks take one extra, which is what "as evenly as possible" means.
 */
function chunkInto(arr, groups) {
  // Nothing in, nothing out. The old loop never ran on an empty array and so
  // returned []; distributing sizes instead pushed ONE EMPTY GROUP, which
  // downstream counted as a cascade branch with no lines in it and produced
  // NaN line lengths several steps away.
  if (!arr.length) return [];
  const n = Math.max(1, Math.min(groups, arr.length));
  const base = Math.floor(arr.length / n);
  const extra = arr.length % n;
  const out = [];
  let i = 0;
  for (let g = 0; g < n; g++) {
    const take = base + (g < extra ? 1 : 0);
    out.push(arr.slice(i, i + take));
    i += take;
  }
  return out;
}
const mmDist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000);
const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function centroidPts(pts) {
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return s.map((v) => v / pts.length);
}

/* ---------------------------------------------------- UP line sheets -- */

/**
 * Read a UP Paragliders line sheet.
 *
 * A sixth production format, and the only one that states the **loop
 * allowance** separately:
 *
 *   line | length | | loop length | cutting length | material | colour | ...
 *   a1   |   295  | |         130 |            425 | DC 120   | Red
 *
 * `cutting length = length + loop length`. Every other maker quotes one
 * number and leaves the allowance implicit; UP breaks it out, and it is a
 * constant per wing rather than a fraction of length — 130 mm on the Meru 2,
 * whether the line is 250 mm or 4 m long.
 *
 * That matters more than it looks. Over a hundred-odd lines the allowance is
 * ten to fifteen metres of material, and because it does not scale with length
 * it lands hardest on the short top lines, where it can exceed a third of the
 * cut length.
 *
 * ---------------------------------------------------------------------------
 * Two sheet layouts, and telling them apart
 * ---------------------------------------------------------------------------
 * The same workbook carries per-size **totals** (one column per size, lines
 * including risers) and per-size **components** (length, loop, cutting,
 * material). They share a first column of line names and nothing else.
 * Applying the component layout to a totals sheet reads three different
 * sizes as length, loop and cutting length — arithmetic that fails on every
 * row, which is how the confusion announced itself.
 *
 * The header names the layout, so it is read rather than assumed.
 */
export function parseUpLineSheet(text) {
  const rows = text.split(/\r?\n/).map((l) => l.split('\t'));
  const header = (rows[0] || []).join(' ').toLowerCase();
  const isComponents = /cutting/.test(header);
  const isTotals = /inklusive|including risers/.test((rows[1] || []).join(' ').toLowerCase())
    || (!isComponents && (rows[0] || []).length > 2);

  const lines = [];
  const totals = [];
  const sizes = isTotals
    ? (rows[0] || []).slice(1).map((s) => (s || '').trim()).filter(Boolean)
    : [];

  // Names in the first column that carry a length and could not be read.
  // They were dropped without a word, the stabilo's main line among them.
  const unparsed = [];
  const recovered = [];
  for (const r of rows) {
    const name = (r[0] || '').trim();
    if (!name) continue;
    // In UP's own scheme: lowercase at the canopy, uppercase below it.
    const parsed = parseLineName(name, { convention: 'up' });
    if (!parsed) {
      if (Number(r[1]) > 0 && !/\s/.test(name)) unparsed.push(name);
      continue;
    }

    if (isComponents) {
      let length = Number(r[1]);
      const loop = Number(r[3]);
      const cutting = Number(r[4]);
      // One cell that cannot be read, where the sheet's own arithmetic gives
      // it: length + loop = cutting. The K2 5's size 44 sheet has a letter
      // where the length of `a1` should be, and the line was dropped —
      // leaving that size with one A line fewer than its own totals sheet.
      if (!(Number.isFinite(length) && length > 0)
        && Number.isFinite(loop) && Number.isFinite(cutting) && cutting > loop) {
        length = cutting - loop;
        recovered.push(name);
      }
      if (!Number.isFinite(length) || length <= 0) continue;
      lines.push({
        ...parsed,
        lengthMM: length,
        loopMM: Number.isFinite(loop) ? loop : null,
        cuttingMM: Number.isFinite(cutting) ? cutting : null,
        material: (r[5] || '').trim() || null,
        colour: (r[6] || '').trim() || null,
        // The sheet's own arithmetic, checked rather than trusted.
        loopConsistent: Number.isFinite(loop) && Number.isFinite(cutting)
          ? Math.abs(length + loop - cutting) < 0.5 : null,
      });
    } else if (isTotals) {
      const byS = {};
      sizes.forEach((sz, i) => {
        const v = Number(r[i + 1]);
        if (Number.isFinite(v) && v > 0) byS[sz] = v;
      });
      if (Object.keys(byS).length) totals.push({ ...parsed, totalsMM: byS });
    }
  }

  const withLoop = lines.filter((l) => l.loopMM != null);
  const loopValues = [...new Set(withLoop.map((l) => l.loopMM))];

  return {
    layout: isComponents ? 'components' : (isTotals ? 'totals' : 'unknown'),
    lines,
    totals,
    sizes,
    unparsed,
    // Lines whose length was taken from cutting less loop.
    recovered,
    loopAllowanceMM: loopValues.length === 1 ? loopValues[0] : null,
    loopValues,
    // Material actually consumed, against finished length.
    totalFinishedM: lines.reduce((a, l) => a + l.lengthMM, 0) / 1000,
    totalCuttingM: lines.reduce((a, l) => a + (l.cuttingMM ?? l.lengthMM), 0) / 1000,
    arithmeticHolds: withLoop.length > 0 && withLoop.every((l) => l.loopConsistent !== false),
  };
}

/**
 * What the loop allowance costs.
 *
 * Reported as a share of cut material and, more usefully, as the share of the
 * shortest lines — because a fixed allowance is a rounding error on a riser
 * line and a third of the material on a top line.
 */
export function loopAllowanceCost(sheet) {
  const withLoop = sheet.lines.filter((l) => l.loopMM != null && l.cuttingMM != null);
  if (!withLoop.length) return null;
  const loopTotal = withLoop.reduce((a, l) => a + l.loopMM, 0) / 1000;
  const cutTotal = withLoop.reduce((a, l) => a + l.cuttingMM, 0) / 1000;
  const shares = withLoop.map((l) => l.loopMM / l.cuttingMM);
  const shortest = withLoop.slice().sort((a, b) => a.lengthMM - b.lengthMM)[0];
  return {
    loopMetres: loopTotal,
    cutMetres: cutTotal,
    shareOfCut: loopTotal / cutTotal,
    worstShare: Math.max(...shares),
    worstLine: shortest.name,
    shortestLengthMM: shortest.lengthMM,
    count: withLoop.length,
  };
}

/**
 * Load carried by a line, accounting for combined rows.
 *
 * `2AB2` is one line carrying both the A and B rows below it. Counted as an
 * A line it carries roughly half what it should; counted once per row it is
 * double-counted. Neither is a naming detail — it changes what the line has
 * to hold.
 *
 * Merging rows is how a cascade reduces line count without reducing anchor
 * count, and it is why a merged line is the thickest in its level.
 */
export function combinedRowShare(line, rowShares) {
  const rows = line.rows || [line.row];
  const share = rows.reduce((a, r) => a + (rowShares[r] ?? 0), 0);
  return {
    rows,
    combined: rows.length > 1,
    share,
    // What a single-row reading would have given, for comparison.
    singleRowShare: rowShares[rows[0]] ?? 0,
    understatedBy: rows.length > 1 ? share / (rowShares[rows[0]] ?? 1) : 1,
  };
}

/** Summarise a prefix-level lineset: how many levels, and where rows merge. */
export function summariseCascadeDepths(lines) {
  const resolved = resolveCascadeLevels(lines.filter(Boolean));
  const depths = [...new Set(resolved.map((l) => l.cascadeDepth).filter(Boolean))].sort();
  const merged = resolved.filter((l) => l.combined);
  const mergePairs = [...new Set(merged.map((l) => l.rows.join('')))].sort();
  return {
    levels: depths.length,
    depths,
    byDepth: Object.fromEntries(depths.map((d) => [d,
      resolved.filter((l) => l.cascadeDepth === d).length])),
    mergedLines: merged.length,
    mergePairs,
    // The depth at which rows first merge, which is where the cascade narrows.
    firstMergeDepth: merged.length
      ? Math.min(...merged.map((l) => l.cascadeDepth)) : null,
  };
}

/* ------------------------------------------------ attachment density -- */

/**
 * How densely each row is attached, from the reference designs.
 *
 * ---------------------------------------------------------------------------
 * The sample is six designs, not thirty-three
 * ---------------------------------------------------------------------------
 * There are 33 size sheets in the reference set, and it is tempting to treat
 * them as 33 observations. They are not. **The line topology is identical
 * across every size in a family** — the Alpina 5 runs A:31 B:19 C:12 in XS
 * through XL, the Geo 7 A:14 B:14 C:15 D:14 in all five sizes, the Ultralite
 * 5 A:16 B:16 C:16 D:16 in all seven. Only the lengths scale; the plan does
 * not. So the evidence here is six designs, and the numbers below are stated
 * as grouped ranges rather than a fitted line, because six points do not
 * support a two-parameter fit.
 *
 * ---------------------------------------------------------------------------
 * What the six show
 * ---------------------------------------------------------------------------
 * The front-to-rear ratio separates cleanly by riser count:
 *
 *   two risers    Alpina 5 2.58   Lyght 3.63   Zeno 2 3.75    range 2.6-3.8
 *   three risers  Geo 7 1.00      Ultralite 5 1.00   Swift 6 2.13   range 1.0-2.1
 *
 * The fewer risers, the more the front row carries the wing's shape on its
 * own, and the more sharply the attachment thins toward the trailing edge.
 * The ranges do not overlap, but they nearly touch at 2.13 against 2.58, so
 * this separates the two classes and would not distinguish a marginal case.
 *
 * Absolute density does not follow riser count at all: the Ultralite 5 is a
 * three-liner attaching 89% of its ribs on every row, while the Geo 7 is a
 * three-liner attaching 56%. That is a design choice about how much shape the
 * sail holds by itself, and nothing here predicts it.
 *
 * ---------------------------------------------------------------------------
 * The *shape* differs too, not just the ratio
 * ---------------------------------------------------------------------------
 * A single ratio was the first attempt and it fitted the two-liners at 6-8%
 * while missing the three-liners by up to 24%, because they are not tapered
 * at all:
 *
 *   Alpina 5    31 19 12    two-liner, roughly halving each row
 *   Zeno 2      30 14  8    the same
 *   Geo 7       14 14 15 14 flat
 *   Ultralite 5 16 16 16 16 flat
 *   Swift 6     17 17  8  8 a step at the midpoint
 *
 * So the distribution has two forms. A two-liner **tapers**: the A row holds
 * the shape and each row behind carries less. A three-liner is **flat**, or
 * steps once — its C row still reaches the riser, so it does not need the
 * front to do the work. Forcing one curve through both is the kind of fit
 * that looks reasonable and is wrong on half the sample.
 */
export const ANCHOR_DENSITY = {
  // `ribs` is the ribs of a half-wing, floor(cells / 2) + 1, from the cell
  // counts in `data/reference/published-cells.tsv`. Three were wrong — 34, 33
  // and 27 for the Alpina 5, Lyght and Swift 6, wings of 65, 71 and 62 cells
  // — and nothing noticed, because the shape fit divides the front row by the
  // rib count and multiplies it back.
  designs: [
    { name: 'Ozone Alpina 5', risers: 2, rows: { A: 31, B: 19, C: 12 }, ribs: 33 },
    { name: 'Ozone Lyght', risers: 2, rows: { A: 29, B: 13, C: 8 }, ribs: 36 },
    { name: 'Ozone Zeno 2', risers: 2, rows: { A: 30, B: 14, C: 8 }, ribs: 40 },
    { name: 'Ozone Geo 7', risers: 3, rows: { A: 14, B: 14, C: 15, D: 14 }, ribs: 25 },
    { name: 'Ozone Swift 6', risers: 3, rows: { A: 17, B: 17, C: 8, D: 8 }, ribs: 32 },
    { name: 'Ozone Ultralite 5', risers: 3, rows: { A: 16, B: 16, C: 16, D: 16 }, ribs: 18 },
  ],
  // Front-to-rear ratio, by riser count. Ranges, not a fit.
  //
  // The key is the riser count taken as one fewer than the load-bearing
  // rows — the rearmost row cascading into the riser ahead of it, which is
  // what the two- and three-riser wings in the corpus do. For five rows and
  // for nine it is a key and nothing more: nobody counted those risers.
  ratioByRisers: {
    // Measured across the whole corpus by `tools/corpus-learnings.mjs`, not
    // hand-entered, and held to it figure for figure by the corpus stage of
    // the check.
    //
    // These were six Ozone designs, chosen when the database held only
    // Ozone. The corpus is 19 designs from four makers now, and it agrees
    // with them where it overlaps: the two-riser group is the same three
    // wings, and the three-riser group has gone from three designs to twelve
    // and its mean from 1.38 to 1.62.
    //
    // It said "27 designs" and "n = 20" here for a while. The measurement
    // counted a file as a design whenever its name did not end in a size, so
    // the UP Torre was six designs and the Makalu 5, Meru 2 and Summit X two
    // each; and it read the Torre's component sheets, and Niviuk's Artik R 2,
    // with the lines UNDER the canopy lines counted as canopy lines — A 20
    // on a wing whose own totals sheet says 12. One design is one entry now,
    // and its sheets are held against each other.
    //
    // Two categories the six-design table had no examples of: five-row
    // wings (two of them tandems), and the nine-row single-surface layout
    // where every attachment gets its own row.
    2: { mean: 3.32, min: 2.58, max: 3.75, n: 3 },
    3: { mean: 1.62, min: 1.00, max: 2.50, n: 12 },
    4: { mean: 1.65, min: 1.33, max: 1.82, n: 3 },
    8: { mean: 3.00, min: 3.00, max: 3.00, n: 1 },
  },
  sampleDesigns: 19,
  // Line sheets read to get them: several sizes, and sometimes several kinds
  // of sheet, to a design.
  sampleSheets: 88,
  note: 'topology is constant within a family; sizes are not independent observations',
};

/**
 * Suggest per-row anchor counts for a wing.
 *
 * Takes the shape of the distribution from the designs of the same riser
 * count and scales it to this wing's rib count. It is a starting point drawn
 * from six wings, not a law — `source` says so, and `anchorsPerRow` accepts
 * an explicit set for anyone who knows better.
 */
export function suggestAnchorsPerRow({
  rows, ribCount, risers = null, frontFraction = null, shape = null,
}) {
  const n = risers ?? Math.min(3, Math.max(2, rows.length - 1));
  const group = ANCHOR_DENSITY.ratioByRisers[n] ?? ANCHOR_DENSITY.ratioByRisers[3];

  // Front density: real designs run 0.28 to 0.94 of their ribs
  // (`FRONT_DENSITY`) and it does not track riser count or aspect ratio, so
  // it is a parameter, defaulting to the median of the designs measured. (The
  // default was 0.75, the middle of a range taken from six Ozone wings; 14 of
  // the 20 designs on file are below it.)
  const front = frontFraction ?? FRONT_DENSITY.median;
  const ratio = group.mean;

  const out = {};
  // Three shapes, because the reference designs show three and averaging
  // them fits none. Flat is the default for a three-liner because two of the
  // three are flat — but the Swift 6 steps, and forcing it flat is 36% out.
  const form = shape ?? (n <= 2 ? 'taper' : 'flat');

  rows.forEach((row, i) => {
    let factor;
    if (form === 'step') {
      // Front half dense, rear half sparse, as the Swift 6 does: 17 17 8 8.
      factor = i < rows.length / 2 ? 1 : 1 / ratio;
    } else if (form === 'taper') {
      // Two-liner: geometric, reaching `ratio` at the last row.
      const t = rows.length > 1 ? i / (rows.length - 1) : 0;
      factor = ratio > 0 ? Math.pow(1 / ratio, t) : 1;
    } else {
      // Flat. Two of the three reference three-liners are exactly flat.
      factor = 1;
    }
    out[row] = Math.max(2, Math.round(ribCount * front * factor));
  });

  return {
    anchorsPerRow: out,
    risers: n,
    shape: form,
    ratio: form === 'flat' ? 1 : ratio,
    frontFraction: front,
    source: form === 'taper'
      ? `${group.n} two-liners, ratio ${group.min}-${group.max}`
      : (form === 'step' ? 'the Swift 6, the one stepped design'
        : '3 three-liners, two of them flat'),
    shapes: ['taper', 'flat', 'step'],
    // Absolute density is a design choice, not a prediction.
    caveat: `front density is an input: real designs run ${FRONT_DENSITY.min} to `
      + `${FRONT_DENSITY.max} of their ribs on the front row, whatever their riser count`,
  };
}

/**
 * How much of its ribs a real wing attaches on its front row: front-row
 * anchors over the ribs of a half-wing, for every design whose line sheets
 * and cell count are both on file (`data/reference/published-cells.tsv`).
 *
 * Measured by `tools/corpus-learnings.mjs` and held to it figure for figure
 * by the corpus stage of the check, so nothing here is hand-entered.
 *
 * This was "0.56 to 0.91", from six Ozone designs, and three of those six
 * had the wrong rib count. Twenty designs from five makers run 0.28 to 0.94.
 * It does not follow aspect ratio (r = -0.31 across the twenty) or riser
 * count; it goes with the maker more than anything. Ozone's run 0.50 to
 * 0.94, UP's 0.28 to 0.62 and PHI's Allegro attaches one rib in three.
 */
export const FRONT_DENSITY = {
  designs: {
    'UP Meru 2': 0.28, 'PHI Allegro light': 0.32, 'UP Torre': 0.35,
    'Niviuk Artik R 2': 0.40, 'Niviuk Hook 6': 0.42, 'UP Makalu 5': 0.42,
    'Niviuk Ikuma 3': 0.44, 'Ozone Vibe GT': 0.50, 'BGD Lynx 2': 0.52,
    'Ozone Swift 6': 0.53, 'UP Summit X': 0.54, 'Ozone Geo 7': 0.56,
    'Niviuk Takoo 6': 0.57, 'UP K2 5': 0.62, 'Ozone Magnum 4': 0.71,
    'Ozone Zeno 2': 0.75, 'Ozone Lyght': 0.81, 'Ozone Ultralite 5': 0.89,
    'Niviuk Skin 4 P': 0.90, 'Ozone Alpina 5': 0.94,
  },
  n: 20,
  min: 0.28,
  median: 0.54,
  max: 0.94,
  source: 'front-row anchors from the line sheets in data/reference, ribs '
    + 'from the cell counts in data/reference/published-cells.tsv',
};

/* -------------------------------------------------------------- stabilo -- */

/**
 * Find the stabilo.
 *
 * The stabilo is the outermost line group: it holds the wing tip against
 * folding under and is what a pilot pulls for big ears. Every reference wing
 * has one, and **it cannot be identified by name on most of them.**
 *
 *   UP Paragliders   `sa1` `sb1` `st1`      explicit, an s-prefix
 *   Skywalk SAGE     `a17` `a18` `b17` `b18`  named as A and B, grouped in
 *                                            the sheet under "SAB", with the
 *                                            main `as4` colour-coded orange
 *   Ozone            no marking at all — the stabilo lines are simply the
 *                                            highest indices in each row
 *
 * So a parser that looks for an S row finds the stabilo on one manufacturer
 * in three. It has to be found **structurally**: the outermost anchors, on
 * the ribs beyond where the ordinary cascade reaches.
 *
 * The signal that works across all of them is the gap. A wing's ordinary
 * anchors are spaced fairly evenly; the stabilo sits past a noticeably larger
 * step, because the tip cells between are carried by it rather than by their
 * own lines. `gapFactor` is how much larger that step has to be.
 */
export function findStabilo(lines, { gapFactor = 1.8, maxLines = 6 } = {}) {
  // Explicit naming first, where a maker provides it.
  const named = lines.filter((l) => l.row === 'S' || l.isStabilo);
  if (named.length) {
    return {
      lines: named,
      count: named.length,
      identifiedBy: 'name',
      note: 'the maker names the stabilo explicitly',
    };
  }

  // Otherwise: the outermost anchors, past an unusually large spanwise step.
  const uppers = lines
    .filter((l) => l.level === 'upper' && l.row !== 'K' && l.ribIndex != null)
    .sort((a, b) => a.ribIndex - b.ribIndex);
  if (uppers.length < 4) {
    return { lines: [], count: 0, identifiedBy: 'none', note: 'too few anchors to judge' };
  }

  const ribs = [...new Set(uppers.map((l) => l.ribIndex))].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < ribs.length; i++) gaps.push(ribs[i] - ribs[i - 1]);
  const typical = median(gaps);

  // Walk in from the tip while the step to the next anchor inboard is large.
  let cut = ribs.length;
  for (let i = ribs.length - 1; i > 0; i--) {
    const gap = ribs[i] - ribs[i - 1];
    if (gap >= typical * gapFactor) { cut = i; break; }
  }

  const outboard = ribs.slice(cut);
  const found = uppers.filter((l) => outboard.includes(l.ribIndex)).slice(0, maxLines);
  return {
    lines: found,
    count: found.length,
    identifiedBy: found.length ? 'position' : 'none',
    typicalGapRibs: typical,
    outboardRibs: outboard,
    note: found.length
      ? 'found as the outermost anchors, past a larger-than-usual spanwise step'
      : 'no outboard group stands out; this wing may have no separate stabilo',
  };
}

function median(values) {
  if (!values.length) return 0;
  const v = values.slice().sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * The ribs a plan's lines actually attach to, row by row.
 *
 * Everything hung INSIDE the wing follows from this: a diagonal carries the
 * lift of a rib with no line to a rib with one, so it has to know which is
 * which. The interface assumed every second rib, whatever plan was drawn — a
 * written cascade puts each row's anchors at its own spacing, and an imported
 * design puts them where its file says.
 *
 * Brake lines are left out: they hold the trailing edge down, not the wing
 * up. A stabilo line counts as a line on its rib — the rib is held — and
 * counts for a row only when it ends on that row's own anchor, as the
 * Swoop2's do (`anchorRow`); this tool's generated stabilo ends at 35% of
 * chord, which is no row's station.
 *
 * @returns {{ byRow: Object<string, number[]>, all: number[] }}
 */
export function planAnchorRibs(plan) {
  const sets = {};
  const all = new Set();
  for (const l of plan?.lines ?? []) {
    if (l.level !== 'upper' || !Number.isInteger(l.ribIndex)) continue;
    if (l.row === 'K') continue;
    all.add(l.ribIndex);
    const row = l.anchorRow ?? (l.row === 'S' ? null : l.row);
    if (!row) continue;
    if (!sets[row]) sets[row] = new Set();
    sets[row].add(l.ribIndex);
  }
  const sorted = (x) => [...x].sort((a, b) => a - b);
  return {
    byRow: Object.fromEntries(Object.keys(sets).sort().map((r) => [r, sorted(sets[r])])),
    all: sorted(all),
  };
}

/**
 * Add a stabilo to a plan.
 *
 * It runs to its own main line, because that is how every reference wing does
 * it — the SAGE puts it on the A2 riser, UP gives it `st` mains of its own.
 * It carries little flight load and a lot of handling: a pilot grabs it for
 * big ears, so it is sized for that rather than for lift.
 */
export function addStabilo(plan, wing, {
  anchors = 2, chordFraction = 0.35, riser = null,
  junctionFraction = 0.8, maxFanAngleDeg = 50,
} = {}) {
  const ribs = wing.ribs;
  const n = Math.max(1, Math.min(anchors, 4));
  const riserName = riser ?? (plan.risers[plan.risers.length - 1]?.name ?? 'B');
  const maillon = plan.risers.find((r) => r.name === riserName)?.maillon ?? plan.maillon;

  const tips = [];
  for (let k = 0; k < n; k++) {
    const i = ribs.length - 1 - k;
    if (i < 0) break;
    tips.push(ribs[i]);
  }

  const points = tips.map((rib) => ribSurfacePoint(rib, 'lower', chordFraction));
  // The junction hangs BELOW the tip, on the way to the riser, as every
  // junction does. It was put at the middle of its own anchors — a point in
  // the wing's surface — so the stabilo's main line ran all the way up to
  // the cloth and its two top lines lay along it, 87 mm each and at right
  // angles to anything they could hold. The Geo 7's tip lines are 1.0 to
  // 1.2 m long on a stabilo line of 4.6 m, a junction four fifths of the
  // way up.
  const middle = centroidPts(points);
  const node = fanJunction(maillon, middle, junctionFraction, points, maxFanAngleDeg);
  const added = [];

  tips.forEach((rib, k) => {
    added.push({
      row: 'S', level: 'upper', index: k + 1, name: `s${k + 1}`,
      riser: riserName, from: node, to: points[k],
      lengthMM: mmDist(node, points[k]),
      ribIndex: rib.index, isStabilo: true,
    });
  });
  added.push({
    row: 'S', level: 'main', index: 1, name: 'sm1',
    riser: riserName, from: maillon, to: node,
    lengthMM: mmDist(maillon, node), isStabilo: true,
  });

  plan.lines = plan.lines.concat(added);
  plan.stabilo = { lines: added, anchors: n, riser: riserName };
  // The plan's total is of the lines it has, these included. It was left as
  // `buildLinePlan` set it, so a plan listed its stabilo lines, counted them,
  // and gave a total length twelve metres short of their sum.
  if (Number.isFinite(plan.totalLengthM)) {
    plan.totalLengthM = plan.lines.reduce((s, l) => s + (l.lengthMM * 2) / 1000, 0);
  }
  return plan;
}

/**
 * Anchor counts that hit a target line consumption.
 *
 * `everyNthRib` drives the anchor count off the **cell count**, and that is
 * backwards. Across the seven published families, line consumption per metre
 * of span correlates with aspect ratio at **r = -0.977**: a high-aspect wing
 * has more cells and *less* line. The Zeno 2 has 78 cells and 15.5 m of line
 * per metre of span; the Ultralite 5 has 34 cells and 26.7.
 *
 * A generator working from cell count therefore gets the relationship exactly
 * inverted, and the full-pipeline run caught it as a contradiction the tool
 * could not otherwise see: **higher aspect ratio came out with more line drag
 * than lower**, which is the opposite of why high-aspect wings exist.
 *
 * So the anchor density is solved for instead. Given the target consumption —
 * from `lineConsumptionEstimate`, or a published figure — this searches the
 * front-row density that produces it, keeping the per-row distribution shape
 * that the reference designs show.
 */
export function anchorsForLineLength({
  wing, airfoil, rows, targetMetres, layout = null, lineLengthM,
  risers = null, shape = null, mainsPerRow = 3, brakes = null,
  tolerance = 0.02, maxIterations = 24,
}) {
  const ribCount = wing.ribs.length;
  // Search only the density range real designs occupy.
  //
  // Total line length alone is under-determined: the same metres can be made
  // of many short lines or few long ones, and the search took the second.
  // On a Zeno 2 it produced 7 A-anchors where the real wing has 30 — the
  // right length, the wrong wing, and each main then carrying four times its
  // proper share until it exceeded the strongest line in the table.
  //
  // Real designs attach between 0.28 and 0.94 of their ribs on the front row
  // (`FRONT_DENSITY`, twenty designs). Searching outside that buys a closer
  // length by leaving the space of real wings. (This said 0.56 to 0.91 and
  // searched from 0.50, which left out seven of the twenty.)
  const ribCountOk = ribCount >= 6;
  // The range searched, kept: the bisection below closes `lo` and `hi` on
  // each other, and the "reachable range" was then read from what was left
  // of them — two neighbouring densities, 95 to 103 m on a wing that can
  // carry 93 to 129.
  const loDensity = ribCountOk ? FRONT_DENSITY.min : 0.10;
  const hiDensity = ribCountOk ? FRONT_DENSITY.max : 1.00;
  let lo = loDensity;
  let hi = hiDensity;
  let best = null;

  const build = (frontFraction) => {
    const s = suggestAnchorsPerRow({ rows, ribCount, risers, frontFraction, shape });
    const plan = buildLinePlan({
      wing, airfoil, layout, lineLengthM,
      anchorsPerRow: s.anchorsPerRow, mainsPerRow, brakes,
    });
    return { plan, anchorsPerRow: s.anchorsPerRow, frontFraction, shape: s.shape };
  };

  // Monotonic in the front fraction, so bisect.
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const attempt = build(mid);
    const err = (attempt.plan.totalLengthM - targetMetres) / targetMetres;
    if (!best || Math.abs(err) < Math.abs(best.error)) {
      best = { ...attempt, error: err, totalMetres: attempt.plan.totalLengthM };
    }
    if (Math.abs(err) <= tolerance) break;
    if (err > 0) hi = mid; else lo = mid;
  }

  // The search saturates when the wing simply cannot carry the target: a
  // 13-rib wing has a ceiling on how much line it can hold however densely it
  // is attached. Saying "here is my best" without saying "and it is not
  // enough" is how a solver quietly returns the wrong answer.
  const ceiling = build(hiDensity);
  const floor = build(loDensity);
  const over = targetMetres > ceiling.plan.totalLengthM;
  const under = targetMetres < floor.plan.totalLengthM;
  const saturated = over || under;

  return {
    ...best,
    targetMetres,
    withinTolerance: Math.abs(best.error) <= tolerance,
    tolerance,
    saturated,
    reachableRange: [floor.plan.totalLengthM, ceiling.plan.totalLengthM],
    densityRange: [loDensity, hiDensity],
    // A warning worth reading: on a two-liner, hitting a published length
    // and matching the wing's topology are incompatible.
    //
    // A two-liner's front row is built in FOUR levels — a main, a middle, a
    // top line a metre long and a pair of short bridles to two neighbouring
    // ribs. The generator builds three, so for the same anchor count it has
    // more line, and it reaches such a wing's published total only by using
    // far fewer anchors than the wing has — 7 A-anchors against the Zeno 2's
    // 30. That gives the right metres, the wrong wing, and each main
    // carrying four times its proper share.
    //
    // Density is therefore the constraint kept, and the length is reported
    // rather than forced. Given a real wing's own anchor counts and line
    // height, the cascade comes to 8% over on the Geo 7 and 8% under on the
    // Ultralite 5, which are built in three levels, and 31 and 34% over on
    // the Alpina 5 and the Zeno 2, which are not.
    //
    // (It ran 10 to 85% over on all of them, and this said the whole of it
    // was the missing level. Most of it was three lines a side from the rear
    // row to the riser that no wing has, and a limit on line angle measured
    // from vertical that doubled the outboard top lines.)
    lengthOvershoot: best.error,
    topologyRealistic: true,
    // Which side matters. Above the densest real wing, more line needs more
    // ribs to hang it from. Below the sparsest, the layout itself carries too
    // much: fewer rows, or fewer risers, not fewer anchors. This said "more
    // ribs" for both, and so told a two-liner's target, under a three-riser
    // layout, that it needed more ribs.
    saturatedSide: over ? 'over' : (under ? 'under' : null),
    note: over
      ? `target ${targetMetres.toFixed(0)} m is more than this wing can carry `
        + `(${floor.plan.totalLengthM.toFixed(0)}-${ceiling.plan.totalLengthM.toFixed(0)} m); `
        + 'the wing needs more ribs, not more anchors'
      : under
      ? `target ${targetMetres.toFixed(0)} m is less than this layout carries at the `
        + `sparsest real density (${floor.plan.totalLengthM.toFixed(0)}-`
        + `${ceiling.plan.totalLengthM.toFixed(0)} m); it needs fewer rows or fewer risers, `
        + 'not fewer anchors'
      : `density solved within the range real designs use; total runs `
        + `${(best.error * 100).toFixed(0)}% against the target`
        + (best.error > 0.15 ? ', as a three-level cascade does against a wing built in four' : ''),
  };
}

/**
 * Recover the cascade junction positions from a real line table.
 *
 * `levelFractions` is a **design parameter, not a constant**. Across five
 * production wings the second junction runs from 0.786 to 0.925:
 *
 *   Zeno 2   0.786      Lyght     0.835      Swift 6  0.837
 *   Geo 7    0.915      Alpina 5  0.925              mean 0.860
 *
 * A single default sits in the middle and is about 10% wrong at both ends,
 * which is most of what remains of the line-length gap: modelled with the
 * mean, the Zeno 2's middle lines come out roughly twice their real length,
 * while the Geo 7's match closely. Grouping by riser count does not help —
 * the spread within a group is larger than the difference between groups.
 *
 * So it is recovered from the wing being copied rather than guessed. The
 * sound measurement is the **middle-to-main length ratio within one wing**,
 * since both are means over the same cascade:
 *
 *     (f2 - f1) / f1 = mean middle length / mean main length
 *
 * Averaging each level separately and reading junctions off the totals does
 * not work — the mean upper and the mean main belong to different branches.
 */
export function recoverLevelFractions(lineTable, { firstJunction = 0.64 } = {}) {
  const mean = (level) => {
    const v = lineTable.lines
      .filter((l) => l.row !== 'K' && l.level === level && l.lengthMM)
      .map((l) => l.lengthMM);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };

  const upper = mean('upper');
  const middle = mean('middle');
  const main = mean('main');
  if (!middle || !main) {
    return {
      levelFractions: null,
      note: 'the table does not carry both middle and main lengths',
    };
  }

  const ratio = middle / main;
  const second = firstJunction * (1 + ratio);
  return {
    levelFractions: [firstJunction, second],
    middleToMain: ratio,
    meanUpperMM: upper,
    meanMiddleMM: middle,
    meanMainMM: main,
    // Outside the range seen in production, which is worth knowing before
    // copying it.
    withinObservedRange: second >= 0.78 && second <= 0.93,
    observedRange: [0.786, 0.925],
    note: 'from the middle-to-main length ratio, which is the only measure '
      + 'taken over the same cascade',
  };
}

/**
 * Which way a prefix-level scheme counts.
 *
 * Two makers number cascade levels with a prefix, and they count in opposite
 * directions:
 *
 *   Advance TAU DLS   `1A3` is at the **canopy**, `4AB1` at the riser
 *   LEparagliding     `1A1` is the **riser**, `4A1` at the canopy
 *
 * The PMA standard counts the main lines as level 1, so LEP follows the
 * standard and Advance does not. Neither is wrong; they are conventions, and
 * a parser that assumes one silently inverts the other — reporting a riser as
 * an upper line and a canopy line as a main.
 *
 * The direction is recoverable from the lengths, because a cascade converges:
 * the level nearest the canopy has the most lines and the shortest ones. That
 * is a fact about the geometry rather than about the naming, so it works
 * whichever convention a sheet uses and whether or not it says which.
 */
export function detectPrefixDirection(lines) {
  const byDepth = new Map();
  for (const l of lines) {
    if (!Number.isFinite(l.depthFromCanopy) || !(l.lengthMM > 0)) continue;
    if (!byDepth.has(l.depthFromCanopy)) byDepth.set(l.depthFromCanopy, []);
    byDepth.get(l.depthFromCanopy).push(l.lengthMM);
  }
  if (byDepth.size < 2) {
    return { direction: null, note: 'too few levels to tell' };
  }

  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const stat = (d) => {
    const v = byDepth.get(d);
    return { count: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length };
  };
  const lo = stat(depths[0]);
  const hi = stat(depths[depths.length - 1]);

  // The canopy end has more lines and shorter ones.
  const canopyIsHigh = hi.count > lo.count && hi.mean < lo.mean;
  const canopyIsLow = lo.count > hi.count && lo.mean < hi.mean;

  return {
    direction: canopyIsHigh ? 'riser-first' : (canopyIsLow ? 'canopy-first' : null),
    depths,
    atLowest: lo,
    atHighest: hi,
    note: canopyIsHigh
      ? 'depth 1 is at the riser: the highest depth has more and shorter '
        + 'lines, so it is the canopy end (LEparagliding, and the PMA '
        + 'convention)'
      : (canopyIsLow
        ? 'depth 1 is at the canopy: the lowest depth has more and shorter '
          + 'lines (Advance TAU DLS)'
        : 'the lengths do not separate the two directions'),
  };
}

/** Relabel prefix levels once the direction is known. */
export function applyPrefixDirection(lines, direction) {
  const depths = lines.map((l) => l.depthFromCanopy).filter(Number.isFinite);
  if (!depths.length) return lines;
  const max = Math.max(...depths);

  return lines.map((l) => {
    if (!Number.isFinite(l.depthFromCanopy)) return l;
    // Depth measured from the canopy, whichever way the sheet counts.
    const fromCanopy = direction === 'riser-first'
      ? (max - l.depthFromCanopy) + 1 : l.depthFromCanopy;
    return {
      ...l,
      depthFromCanopy: fromCanopy,
      level: fromCanopy === 1 ? 'upper'
        : (l.depthFromCanopy === (direction === 'riser-first' ? 1 : max)
          ? 'main' : `cascade-${fromCanopy}`),
      prefixDirection: direction,
    };
  });
}

/**
 * Split a multi-size line sheet into one sheet per size.
 *
 * UP publish some sheets with a column per size: a line name, then its length
 * in the L, M, SM, S and XS wings across the row. Read as a single wing it
 * mixes an L with an XS, which is what produced "st1 appears twice" and
 * "uppers longer than mains" when the reference sweep first ran over them.
 *
 * The columns are paired to the header positionally, left to right. On the
 * Makalu 5 the header names five sizes and the rows carry four values, with
 * the lengths descending L, M, SM, S — so XS is simply absent from the file,
 * and a size with no data is **reported rather than filled**. Guessing which
 * column was dropped would be a coin toss, and a wrong guess would assign one
 * wing's lengths to another.
 */
export function splitMultiSizeSheet(text) {
  const rows = text.split(/\r?\n/).map((l) => l.split('\t'));
  if (!rows.length) return { sizes: [], sheets: {}, note: 'empty file' };

  const header = rows[0].slice(1).map((h) => h.trim()).filter(Boolean);
  if (header.length < 2) {
    return { sizes: [], sheets: {}, note: 'not a multi-size sheet' };
  }

  const data = rows.filter((r) => r[0] && /^[A-Za-z]/.test(r[0].trim())
    && r.slice(1).some((c) => /^\d+(\.\d+)?$/.test((c || '').trim())));

  const sheets = {};
  const counts = header.map(() => 0);
  for (const size of header) sheets[size] = [];

  for (const r of data) {
    const name = r[0].trim();
    const values = r.slice(1).map((c) => (c || '').trim());
    header.forEach((size, i) => {
      const v = values[i];
      if (!/^\d+(\.\d+)?$/.test(v || '')) return;
      sheets[size].push({ name, lengthMM: Number(v) });
      counts[i]++;
    });
  }

  const empty = header.filter((_, i) => counts[i] === 0);
  for (const size of empty) delete sheets[size];

  return {
    sizes: header.filter((_, i) => counts[i] > 0),
    sheets,
    lineCounts: Object.fromEntries(
      Object.entries(sheets).map(([k, v]) => [k, v.length])),
    // Named in the header but carrying no data.
    missingSizes: empty,
    note: empty.length
      ? `${empty.join(', ')} named in the header but absent from the rows; `
        + 'reported rather than filled, because guessing which column was '
        + 'dropped would assign one wing\'s lengths to another'
      : `${header.length} sizes, all present`,
  };
}

/** A split sheet as the project's own plain format, provenance included. */
export function multiSizeSheetToTSV(split, size, {
  source = '', note = '',
  // What the numbers measure, stated as a key rather than as prose.
  //
  // The first version wrote "Lengths INCLUDE the risers" and the sweep looked
  // for "including risers". The words did not match, so four sheets of
  // sail-to-harness totals were checked as if they were individual lines and
  // failed for having uppers longer than mains — which is exactly what a
  // total does. A machine-readable key cannot drift out of step with the
  // reader the way a sentence can.
  //
  // And it has to be SAID. It defaulted to 'single-line', and eight sheets
  // of the Meru 2 and Summit X — whose workbook calls its totals sheet
  // "Einzelleine / single" — were written out declaring that every line on
  // the wing is seven metres long.
  measure,
} = {}) {
  const lines = split.sheets[size];
  if (!lines) throw new Error(`splitMultiSizeSheet: no data for size ${size}`);
  if (!['single-line', 'total-including-risers'].includes(measure)) {
    throw new Error(`multiSizeSheetToTSV: unknown measure "${measure}" — say `
      + '"single-line" or "total-including-risers"');
  }
  // No wing's shortest line is three metres long. A sheet where it is holds
  // totals, whatever it is called.
  const shortest = Math.min(...lines.map((l) => l.lengthMM));
  if (measure === 'single-line' && shortest > 3000) {
    throw new Error(`multiSizeSheetToTSV: the shortest line for ${size} is `
      + `${Math.round(shortest)} mm, so these are totals, not single lines`);
  }
  const out = [`# ${size}`];
  if (source) out.push(`# Source: ${source}`);
  out.push(`# measure: ${measure}`);
  if (note) out.push(`# ${note}`);
  out.push('# Split from a multi-size sheet, one column per size');
  out.push('name\tlength_mm');
  for (const l of lines) out.push(`${l.name}\t${Math.round(l.lengthMM)}`);
  return `${out.join('\n')}\n`;
}

/**
 * A cascade written out, the way a designer would say it.
 *
 * The generator derives the cascade from rules: an anchor count per row, then
 * a branching factor applied uniformly. That is fine for exploring and wrong
 * for describing, because a designer copying a real wing — or specifying one
 * for a builder — knows the shape they want and cannot say it:
 *
 *     A  30 14 4
 *     B  14  6 3
 *     C   8  3 2
 *     K  13  6 1
 *
 * Anchors first, then the count at each level below, ending at the risers.
 * That is how every manufacturer sheet in this project reads, and how the
 * Ozone Zeno 2's own plan is written: A:30 B:14 C:8 with mains A:3 B:4.
 *
 * Blank lines and anything after `#` are ignored, so a spec can be commented.
 */
export function parseCascadeSpec(text) {
  if (typeof text !== 'string') {
    throw new Error('parseCascadeSpec needs the spec as text');
  }

  const rows = {};
  const problems = [];
  let lineNo = 0;

  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;

    const parts = line.split(/[\s,]+/);
    const row = parts[0].toUpperCase();
    // A known row, not merely a plausible-looking one.
    //
    // `/^[A-Z]{1,2}$/` accepted "QQ", which is not a row on any wing. A spec
    // is a thing a person types, so a typo in a row name has to be caught
    // here — the plan would otherwise build a cascade for a row that does not
    // exist and quietly leave the real one out.
    const KNOWN = [...ROWS, 'BR', 'ST'];
    if (!KNOWN.includes(row)) {
      problems.push(`line ${lineNo}: "${parts[0]}" is not a row; `
        + `expected one of ${KNOWN.join(', ')}`);
      continue;
    }
    if (rows[row]) {
      problems.push(`line ${lineNo}: row ${row} appears twice`);
      continue;
    }

    const counts = parts.slice(1).map(Number);
    if (!counts.length || counts.some((n) => !Number.isInteger(n) || n < 1)) {
      problems.push(`line ${lineNo}: row ${row} needs whole positive counts, `
        + `got "${parts.slice(1).join(' ')}"`);
      continue;
    }

    // A cascade converges. A level with more lines than the one above it is
    // not a cascade, and is much more likely to be a typo than a design.
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] > counts[i - 1]) {
        problems.push(`line ${lineNo}: row ${row} goes ${counts[i - 1]} to `
          + `${counts[i]}, which widens rather than converging`);
      }
    }

    rows[row] = {
      row,
      anchors: counts[0],
      levels: counts.slice(1),
      depth: counts.length,
    };
  }

  const names = Object.keys(rows);
  if (!names.length) problems.push('the spec names no rows');

  // Every row should reach the same depth, or the plan has rows terminating
  // at different levels — possible, but far more often a missing number.
  const depths = [...new Set(names.map((r) => rows[r].depth))];
  if (depths.length > 1) {
    problems.push(`rows reach different depths (${depths.sort().join(', ')}); `
      + 'if that is deliberate the plan will build, but it is usually a '
      + 'missing count');
  }

  return {
    rows,
    rowNames: names,
    anchorsPerRow: Object.fromEntries(names.map((r) => [r, rows[r].anchors])),
    mainsPerRow: Object.fromEntries(names.map((r) => {
      const l = rows[r].levels;
      return [r, l.length ? l[l.length - 1] : rows[r].anchors];
    })),
    problems,
    ok: problems.length === 0,
    depth: Math.max(...names.map((r) => rows[r].depth), 0),
    totalAnchors: names.reduce((a, r) => a + rows[r].anchors, 0),
    note: problems.length === 0
      ? `${names.length} rows, ${names.reduce((a, r) => a + rows[r].anchors, 0)} `
        + `anchors, ${Math.max(...names.map((r) => rows[r].depth))} levels`
      : `${problems.length} problem(s) in the spec`,
  };
}

/** Write a built plan back out as a spec, so one can be edited and reused. */
export function cascadeSpecFor(plan) {
  const byRow = {};
  for (const l of plan.lines) {
    const r = (byRow[l.row] ||= {});
    r[l.level] = (r[l.level] || 0) + 1;
  }
  const order = ['upper', 'cascade-2', 'cascade-3', 'middle', 'cascade-4', 'main'];
  const out = ['# row  anchors  then the count at each level below'];
  for (const row of Object.keys(byRow).sort()) {
    const counts = order.map((lv) => byRow[row][lv]).filter(Boolean);
    if (counts.length) out.push(`${row}  ${counts.join(' ')}`);
  }
  return `${out.join('\n')}\n`;
}
