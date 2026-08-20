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

const ROWS = ['A', 'B', 'C', 'D', 'E'];
const BRAKE = 'K';
const COLLAPSE = 'Z';

/**
 * Decode a line name.
 *   A1     -> row A, level 'upper',  index 1
 *   a1     -> row A, level 'upper',  index 1   (lowercase convention)
 *   AM6    -> row A, level 'middle', index 6
 *   AR3    -> row A, level 'riser',  index 3
 *   KMU2   -> row K, level 'middle', side 'upper', index 2
 *   CRL4   -> row C, level 'riser',  side 'lower', index 4
 *
 * Two conventions are in use for the lines that reach the canopy, and both
 * have to be read. Ozone writes them uppercase (`A1`), while PHI and BGD
 * write them lowercase (`a1`) and reserve uppercase for the cascade above.
 * Rejecting the lowercase form silently drops every canopy line in those
 * files — which is exactly what happened until a table that states its own
 * topology made the gap visible.
 */
export function parseLineName(name) {
  const m = String(name).trim().match(/^([A-Za-z])(R|M)?(U|L)?(\d+)([a-z])?$/);
  if (!m) return null;
  const [, rawRow, levelCode, side, idx, variant] = m;
  const row = rawRow.toUpperCase();
  // A lowercase row letter always denotes a canopy line: the level suffixes
  // only ever appear with an uppercase row.
  const level = levelCode === 'R' ? 'riser' : levelCode === 'M' ? 'middle' : 'upper';
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
    const r = (byRow[l.row] ||= { row: l.row, upper: [], middle: [], riser: [] });
    r[l.level].push(l);
  }
  for (const r of Object.values(byRow)) {
    for (const k of ['upper', 'middle', 'riser']) r[k].sort((a, b) => a.index - b.index);
  }

  const rows = Object.values(byRow).sort((a, b) => a.row.localeCompare(b.row));
  const mainRows = rows.filter((r) => ROWS.includes(r.row));
  const risers = mainRows.filter((r) => r.riser.length > 0);

  const totalLength = lineSet.lines.reduce((s, l) => s + l.lengthMM * l.quantity, 0) / 1000;

  return {
    rows,
    rowLetters: rows.map((r) => r.row),
    anchorRows: mainRows.map((r) => r.row),
    riserRows: risers.map((r) => r.row),
    riserCount: risers.length,
    // A row with anchors but no riser lines hangs off a neighbouring riser —
    // the usual arrangement for D on a three-riser wing.
    dependentRows: mainRows.filter((r) => r.riser.length === 0 && r.upper.length > 0)
      .map((r) => r.row),
    lineCount: lineSet.lines.reduce((s, l) => s + l.quantity, 0),
    distinctLengths: new Set(lineSet.lines.map((l) => l.lengthMM)).size,
    totalLengthM: totalLength,
    materials: [...new Set(lineSet.lines.map((l) => l.material).filter(Boolean))],
    levels: {
      upper: lineSet.lines.filter((l) => l.level === 'upper').length,
      middle: lineSet.lines.filter((l) => l.level === 'middle').length,
      riser: lineSet.lines.filter((l) => l.level === 'riser').length,
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
  const risers = lineSet.lines.filter((l) => l.row === row && l.level === 'riser');
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
export function buildLinePlan({
  wing,
  airfoil,
  layout = RISER_LAYOUTS['A/B/C+D'],
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
  levelFractions = [0.64, 0.78],
  loadMode = 1,
  tipDirectAnchors = 2,
} = {}) {
  const fractions = airfoil?.anchors || { A: 0.085, B: 0.30, C: 0.53, D: 0.78 };
  const maillon = [0, karabinerSeparationM / 2, -lineLengthM];

  const lines = [];
  const risers = [];

  for (const riser of layout) {
    const carried = [];
    for (const row of riser.rows) {
      const frac = fractions[row];
      if (frac == null) continue;

      const anchors = [];
      wing.ribs.forEach((rib, i) => {
        if (i % everyNthRib !== 0) return;
        anchors.push({
          anchor: anchors.length + 1,
          ribIndex: i,
          chord: rib.chord,
          point: pointOnSurface(rib.lower, frac),
        });
      });
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
      const riserGroups = chunkBy(groups, groupSize);

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
          level: owns ? 'riser' : 'middle',
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
  plan.totals = planTotals(plan);
  plan.totalLengthM = lines.reduce((s, l) => s + (l.lengthMM * 2) / 1000, 0);
  return plan;
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
      row: 'K', level: 'riser', index: r + 1, name: `KR${r + 1}`,
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
    row: 'K', level: 'riser', side: 'lower', index: 1, name: 'KL1',
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
    const ris = lines.find((x) => x.level === 'riser' && !x.shared && x.anchors.includes(l.index));
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
