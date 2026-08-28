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

// 'S' is the stabilo — the outermost line, on its own riser on many wings.
// 'Z' is a collapse line. Both are real rows that carry names of their own.
const ROWS = ['A', 'B', 'C', 'D', 'E', 'K', 'S', 'Z'];

/** The rows that carry flight load. K is the brake, S the stabilo, Z collapse. */
const LOAD_BEARING_ROWS = ['A', 'B', 'C', 'D', 'E'];
const BRAKE = 'K';
const COLLAPSE = 'Z';

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
 *   Amain1  'main' + index   riser
 *
 * Roman numerals matter here: `AI` and `A1` are different lines on the same
 * wing, and a parser that only sees digits reads `AI` as a name it does not
 * recognise and discards a whole cascade level. `CVI` is the sixth C-main,
 * not something beginning with `CV`.
 */
export function parseLineName(name) {
  const raw = String(name).trim();

  // UP Paragliders distinguishes four cascade levels where the others
  // distinguish three, and names two of them differently:
  //
  //   a1      lowercase       top line, to the canopy
  //   A1      uppercase       middle
  //   AI      roman numeral   upper-main
  //   Amain1  'main' + index  riser
  //
  // Roman numerals have to be handled before the digit form. `AI` and `A1`
  // are different lines on the same wing, and `CVI` is the sixth C-main
  // rather than something starting with `CV` — read digit-first, a whole
  // cascade level is discarded as unrecognised names.

  const mainMatch = raw.match(/^([A-Za-z]{1,2})main(\d*)$/i);
  if (mainMatch) {
    const r = mainMatch[1].toUpperCase();
    if (!ROWS.includes(r) && r !== 'BR') return null;
    return {
      name: raw,
      row: r === 'BR' ? 'K' : r,
      level: 'main',
      side: null,
      index: mainMatch[2] ? parseInt(mainMatch[2], 10) : 1,
      variant: null,
      isBrake: r === 'BR',
      convention: 'up-main',
    };
  }

  const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
  // Two-letter rows are matched explicitly rather than with `{1,2}`. A greedy
  // quantifier takes `AI` out of `AIII` and then fails on the remainder
  // without backtracking, because the row check rejects `AI` and returns —
  // so every numeral above II was silently discarded.
  const NUMERAL = '(?:VIII|VII|III|IX|IV|VI|II|V|X|I)';
  const romanMatch = raw.match(new RegExp(`^(BR)(${NUMERAL})$`))
    || raw.match(new RegExp(`^([A-Za-z])(${NUMERAL})$`));
  if (romanMatch) {
    const r = romanMatch[1].toUpperCase();
    if (!ROWS.includes(r) && r !== 'BR') return null;
    return {
      name: raw,
      row: r === 'BR' ? 'K' : r,
      level: 'upper-main',
      side: null,
      index: ROMAN[romanMatch[2]],
      variant: null,
      isBrake: r === 'BR',
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
  const stabMatch = raw.match(/^s([a-dt])(\d+)$/i);
  if (stabMatch) {
    const kind = stabMatch[1].toLowerCase();
    return {
      name: raw,
      row: 'S',
      // `st` is the stabilo's own main line; `sa`..`sd` are its top lines,
      // named for the row they sit outboard of.
      level: kind === 't' ? 'main' : 'upper',
      side: null,
      index: parseInt(stabMatch[2], 10),
      variant: kind === 't' ? null : kind,
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
  const prefixMatch = raw.match(/^(\d)([A-Z]{1,2})(\d+)$/);
  if (prefixMatch) {
    const depth = parseInt(prefixMatch[1], 10);
    const letters = prefixMatch[2].split('');
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
 * Resolve prefix-level names to upper / middle / riser.
 *
 * A prefix level is relative: `3AB1` is a riser line on a three-level wing
 * and a middle line on a four-level one. The mapping therefore cannot be made
 * while parsing a single name — it needs the whole set, which is why parsing
 * leaves `depthFromCanopy` and a provisional `cascade-N` level behind.
 */
export function resolveCascadeLevels(lines) {
  const depths = lines.map((l) => (l ? l.depthFromCanopy : null)).filter((d) => d != null);
  if (!depths.length) return lines;
  const maxDepth = Math.max(...depths);
  return lines.map((l) => {
    if (!l || l.depthFromCanopy == null) return l;
    const d = l.depthFromCanopy;
    return {
      ...l,
      level: d === 1 ? 'upper' : (d === maxDepth ? 'main' : 'middle'),
      cascadeDepth: d,
      cascadeLevels: maxDepth,
    };
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

  const lines = [];
  const skipped = [];
  for (const r of rows.slice(1)) {
    const name = r[iName];
    if (!name) continue;
    const parsed = parseLineName(name);
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
    lines,
    header,
    skipped,
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
    if (!Number.isFinite(qty) || !Number.isFinite(sewn) || sewn <= 0) {
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
        adjustedMM: Number.isFinite(Number(r[adjCol])) ? Number(r[adjCol]) : null,
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
};

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
  groupSize = 2,
  riserLengthMM = 500,
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
  // Include the brake cascade in the plan. Real line tables carry it — every
  // reference sheet in this project lists a K row alongside A/B/C/D — so a
  // plan without it cannot be compared with one, and its totals understate
  // the wing by about a fifth.
  brakes = null,
} = {}) {
  if (layout === LAYOUT_OMITTED) layout = RISER_LAYOUTS['A/B/C+D'];

  const fractions = airfoil?.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  const maillon = [0, karabinerSeparationM / 2, -lineLengthM];

  const lines = [];
  const risers = [];
  const shortfalls = [];

  for (const riser of layout) {
    const carried = [];
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
            point: pointOnSurface(rib.lower, frac),
          });
        }
      } else {
        wing.ribs.forEach((rib, i) => {
          if (i % everyNthRib !== 0) return;
          anchors.push({
            anchor: anchors.length + 1,
            ribIndex: i,
            chord: rib.chord,
            point: pointOnSurface(rib.lower, frac),
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
      const riserGroups = mainsPerRow
        ? chunkInto(groups, mainsPerRow)
        : chunkBy(groups, groupSize);
      if (mainsPerRow && riserGroups.length !== mainsPerRow) {
        shortfalls.push({
          row, asked: mainsPerRow, got: riserGroups.length,
          anchors: cascaded.length, middles: groups.length,
        });
      }

      const riserNodePoints = riserGroups.map((rg) => {
        const all = rg.flat();
        const g = weightedCentroid(all, loadMode);
        return { point: lerp3(maillon, g, levelFractions[0]), groups: rg };
      });

      const midNodes = [];
      const riserNodes = riserNodePoints.map((rn) => {
        const children = rn.groups.map((grp) => {
          const g = weightedCentroid(grp, loadMode);
          const node = lerp3(rn.point, g, levelFractions[1]);
          midNodes.push({ point: node, anchors: grp.map((a) => a.anchor), parent: rn.point });
          return { point: node, anchors: grp.map((a) => a.anchor), group: grp };
        });
        return { point: rn.point, children, anchors: rn.groups.flat().map((a) => a.anchor) };
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

      // Riser level. Only the row that owns the riser gets R lines; a
      // cascaded row continues in M numbering and joins the same maillon.
      const owns = riser.rows[0] === row;

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

      riserNodes.forEach((node, k) => {
        const index = owns
          ? k + 1
          : lines.filter((l) => l.row === row && l.level === 'middle').length + 1;
        lines.push({
          row,
          level: owns ? 'main' : 'middle',
          index,
          name: `${row}${owns ? 'R' : 'M'}${index}`,
          riser: riser.name,
          from: maillon, to: node.point, lengthMM: mm(maillon, node.point),
          anchors: node.anchors,
        });
      });

      carried.push(row);
    }
    risers.push({ name: riser.name, rows: carried, maillon });
  }

  const plan = { lines, risers, riserLengthMM, maillon };
  // Merging rebuilds part of the line list, so everything after it reads
  // `plan.lines` rather than the local array it started from.
  if (mergeRows) mergeCascades(plan, mergeRows, levelFractions);

  // The brake cascade is built separately because it is a different shape —
  // four levels, one shared lower line, uneven anchors — but it belongs in
  // the same plan.
  if (brakes) {
    const bp = buildBrakePlan({
      wing,
      lineLengthM,
      karabinerSeparationM,
      ...(typeof brakes === 'object' ? brakes : {}),
    });
    plan.lines = plan.lines.concat(bp.lines);
    plan.brakePlan = bp;
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
function mergeCascades(plan, groups, levelFractions) {
  for (const group of groups) {
    const rows = group.filter((r) => plan.lines.some((l) => l.row === r));
    if (rows.length < 2) continue;

    const tops = plan.lines.filter((l) => rows.includes(l.row) && l.level === 'upper');
    if (!tops.length) continue;

    const below = plan.lines.filter((l) => rows.includes(l.row) && l.level !== 'upper');
    const riserName = below[0]?.riser ?? plan.risers[0].name;
    const maillon = plan.risers.find((r) => r.name === riserName)?.maillon ?? plan.maillon;
    plan.lines = plan.lines.filter((l) => !below.includes(l));

    // Pool both rows' top lines by the anchor they serve.
    const byAnchor = new Map();
    for (const t of tops) {
      if (!byAnchor.has(t.index)) byAnchor.set(t.index, []);
      byAnchor.get(t.index).push(t);
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
        const mNode = lerpPt(rNode, centroid3(grp.map((t) => t.to)), levelFractions[1]);
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

/** Carabiner-to-canopy length for every anchor, by walking the tree back. */
function planTotals(plan) {
  const byNode = new Map();
  for (const l of plan.lines) byNode.set(nodeKey(l.to), l);

  const totals = {};
  for (const l of plan.lines) {
    if (l.level !== 'upper') continue;
    let length = l.lengthMM;
    let node = l.from;
    for (let guard = 0; guard < 12; guard++) {
      const parent = byNode.get(nodeKey(node));
      if (!parent) break;
      length += parent.lengthMM;
      node = parent.from;
    }
    (totals[l.index] ||= {})[l.row] = Math.round(length + plan.riserLengthMM);
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

function pointOnSurface(poly, frac) {
  const n = poly.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(frac * (n - 1))));
  const f = frac * (n - 1) - i;
  return [
    poly[i][0] + f * (poly[i + 1][0] - poly[i][0]),
    poly[i][1] + f * (poly[i + 1][1] - poly[i][1]),
    poly[i][2] + f * (poly[i + 1][2] - poly[i][2]),
  ];
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
      const parent = findTail(sheet, deficit, tolerance);
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
function findTail(sheet, deficit, tolerance) {
  for (const b of sheet.blocks) {
    const ls = [...b.lengths].map(([name, lengthMM]) => ({ name, lengthMM }));
    // Single line.
    for (const l of ls) {
      if (Math.abs(l.lengthMM - deficit) <= tolerance) return { row: b.row, names: [l.name] };
    }
    // A pair — a middle plus a riser line, which is the common case.
    for (let i = 0; i < ls.length; i++) {
      for (let j = i + 1; j < ls.length; j++) {
        if (Math.abs(ls[i].lengthMM + ls[j].lengthMM - deficit) <= tolerance) {
          return { row: b.row, names: [ls[i].name, ls[j].name] };
        }
      }
    }
  }
  return null;
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
 * Trailing-edge attachment ribs, spaced denser toward the tip.
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
  const maillon = [0, karabinerSeparationM / 2, -lineLengthM];
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

function chunkInto(arr, groups) {
  const n = Math.max(1, Math.min(groups, arr.length));
  const per = Math.ceil(arr.length / n);
  const out = [];
  for (let i = 0; i < arr.length; i += per) out.push(arr.slice(i, i + per));
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

  for (const r of rows) {
    const name = (r[0] || '').trim();
    if (!name) continue;
    const parsed = parseLineName(name);
    if (!parsed) continue;

    if (isComponents) {
      const length = Number(r[1]);
      const loop = Number(r[3]);
      const cutting = Number(r[4]);
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
  designs: [
    { name: 'Ozone Alpina 5', risers: 2, rows: { A: 31, B: 19, C: 12 }, ribs: 34 },
    { name: 'Ozone Lyght', risers: 2, rows: { A: 29, B: 13, C: 8 }, ribs: 33 },
    { name: 'Ozone Zeno 2', risers: 2, rows: { A: 30, B: 14, C: 8 }, ribs: 40 },
    { name: 'Ozone Geo 7', risers: 3, rows: { A: 14, B: 14, C: 15, D: 14 }, ribs: 25 },
    { name: 'Ozone Swift 6', risers: 3, rows: { A: 17, B: 17, C: 8, D: 8 }, ribs: 27 },
    { name: 'Ozone Ultralite 5', risers: 3, rows: { A: 16, B: 16, C: 16, D: 16 }, ribs: 18 },
  ],
  // Front-to-rear ratio, by riser count. Ranges, not a fit.
  ratioByRisers: {
    2: { mean: 3.32, min: 2.58, max: 3.75, n: 3 },
    3: { mean: 1.38, min: 1.00, max: 2.13, n: 3 },
  },
  sampleDesigns: 6,
  sampleSizes: 33,
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

  // Front density: the designs run 0.56 to 0.91 of ribs and it does not track
  // riser count, so it is a parameter with a middling default rather than
  // something predicted.
  const front = frontFraction ?? 0.75;
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
    caveat: 'front density is an input: the reference designs run 0.56 to 0.91 '
      + 'of ribs at the same riser count',
  };
}

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
 * Add a stabilo to a plan.
 *
 * It runs to its own main line, because that is how every reference wing does
 * it — the SAGE puts it on the A2 riser, UP gives it `st` mains of its own.
 * It carries little flight load and a lot of handling: a pilot grabs it for
 * big ears, so it is sized for that rather than for lift.
 */
export function addStabilo(plan, wing, {
  anchors = 2, chordFraction = 0.35, riser = null,
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

  const points = tips.map((rib) => pointOnSurface(rib.lower, chordFraction));
  const node = centroidPts(points);
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
 * from `estimateTotalLineLength`, or a published figure — this searches the
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
  // The six reference designs attach between 0.56 and 0.91 of their ribs on
  // the front row. Searching outside that buys a closer length by leaving the
  // space of real wings.
  const ribCountOk = ribCount >= 6;
  let lo = ribCountOk ? 0.50 : 0.10;
  let hi = ribCountOk ? 0.95 : 1.00;
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
  const ceiling = build(hi);
  const floor = build(lo);
  const saturated = targetMetres > ceiling.plan.totalLengthM
    || targetMetres < floor.plan.totalLengthM;

  return {
    ...best,
    targetMetres,
    withinTolerance: Math.abs(best.error) <= tolerance,
    tolerance,
    saturated,
    reachableRange: [floor.plan.totalLengthM, ceiling.plan.totalLengthM],
    densityRange: [lo, hi],
    // A warning worth reading: hitting a published length and matching a real
    // wing's topology are, with a three-level cascade, incompatible.
    //
    // Real wings run FOUR cascade levels. The generator runs three, so its
    // lines are longer for the same anchor count, and it reaches a published
    // total only by using far fewer anchors than the real wing — 7 A-anchors
    // against the Zeno 2's 30. That gives the right metres, the wrong wing,
    // and each main carrying four times its proper share.
    //
    // Density is therefore the constraint kept, and the length overshoot is
    // reported rather than removed: at realistic density the total runs 10 to
    // 85% above published, and that gap is the missing cascade level.
    lengthOvershoot: best.error,
    topologyRealistic: true,
    note: saturated
      ? `target ${targetMetres.toFixed(0)} m is outside what this wing can carry `
        + `(${floor.plan.totalLengthM.toFixed(0)}-${ceiling.plan.totalLengthM.toFixed(0)} m); `
        + 'the wing needs more ribs, not more anchors'
      : `density solved within the range real designs use; total runs `
        + `${(best.error * 100).toFixed(0)}% against the target, which is the `
        + 'three-level cascade being longer than a real four-level one',
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
