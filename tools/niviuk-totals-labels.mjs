/* niviuk-totals-labels.mjs — which column a value in a totals table is in.
 *
 * Section 10.7 of a Niviuk manual is a grid: a row for each attachment along
 * the span, a column for each line row (A, B, C, D ... BR). Where the wing
 * has no line — the D row stops four ribs out on the Hook 6 — the cell is
 * empty.
 *
 * The importer read each row of the grid as the numbers on it, in order, and
 * labelled them A, B, C, D, BR from the left. With an empty cell everything
 * after it moves one column left: on the Hook 6 the brake totals of rows 5 to
 * 9 were filed as D lines, row 10's as a C line and row 11's as an A line.
 * Every one of the 25 files had rows like that.
 *
 * The same manual's section 10.6 lists every line by name, and so says which
 * columns each row of the grid really has. The labels are taken from there.
 */

/** Column order of the grid, as line rows: A to I, then the brake. */
export const GRID_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K'];

/**
 * The rows of the grid, from the names of a per-line sheet in the order the
 * manual lists them.
 *
 * Only lines that reach the canopy have a total: lowercase names (`a1`,
 * `br3`), and a line of the next level attached straight to the sail, which
 * the manual writes in upper case in the same place (`D9`). The manual lists
 * them a grid row at a time, so a new row starts at each A line, and wherever
 * a column comes round again (the Hook 6 ends `br10`, `br11`).
 *
 * The number in a name is not used: the Hook 6's ninth row is `a9 b9 c10
 * br9`. And the stabilo's own lines (`st1` ...) are passed over — the grid
 * has no column for them, which the Skin 4 P shows: its rows 10 and 11 have
 * `st4` and `st5` in the per-line table and two totals each.
 */
export function gridRowsFromNames(names) {
  const rows = [];
  let current = null;
  for (const raw of names) {
    const name = String(raw).trim();
    if (/^st\d+$/.test(name)) continue;
    const m = /^(br|[a-i]|[A-I])(\d+)$/.exec(name);
    if (!m) {
      // The canopy lines come first; the cascade below them ends the grid.
      if (current) break;
      continue;
    }
    const col = m[1] === 'br' ? 'K' : m[1].toUpperCase();
    if (current === null || col === 'A' || current.includes(col)) {
      current = [];
      rows.push(current);
    }
    current.push(col);
  }
  // Left to right, as the grid has them.
  return rows.map((r) => r.slice().sort((x, y) => GRID_ORDER.indexOf(x) - GRID_ORDER.indexOf(y)));
}

/**
 * The columns the `count` values of one grid row belong to.
 *
 * `present` is that row from `gridRowsFromNames`. The importer kept values
 * from the left up to the number of labels it had found in the header, so
 * the values are the first `count` columns that have a line. More values
 * than lines is something this cannot explain, and is refused.
 */
export function labelsForRow(count, present) {
  if (!Array.isArray(present) || count > present.length) return null;
  return present.slice(0, count);
}
