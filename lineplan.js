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
 *   AM6    -> row A, level 'middle', index 6
 *   AR3    -> row A, level 'riser',  index 3
 *   KMU2   -> row K, level 'middle', side 'upper', index 2
 *   CRL4   -> row C, level 'riser',  side 'lower', index 4
 */
export function parseLineName(name) {
  const m = String(name).trim().match(/^([A-Z])(R|M)?(U|L)?(\d+)([a-z])?$/);
  if (!m) return null;
  const [, row, levelCode, side, idx, variant] = m;
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
    if (/^name$/i.test(first)) continue;

    const qty = Number(r[1]);
    const sewn = Number(r[2]);
    if (!Number.isFinite(qty) || !Number.isFinite(sewn) || sewn <= 0) {
      if (first && !/^\*/.test(first) && !/^\d+$/.test(first)) skipped.push(first);
      continue;
    }

    const names = first.split(/\s*,\s*/).filter(Boolean);
    const parsed = names.map(parseLineName).filter(Boolean);
    if (!parsed.length) { if (first) skipped.push(first); continue; }

    for (const p of parsed) {
      lines.push({
        ...p,
        quantity: qty / parsed.length,
        lengthMM: sewn,
        adjustedMM: Number.isFinite(Number(r[3])) ? Number(r[3]) : null,
        material,
        comment: r[5] || null,
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
