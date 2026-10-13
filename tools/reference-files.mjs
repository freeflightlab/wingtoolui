/* reference-files.mjs — which reader a reference file wants, and whose it is.
 *
 * The sweep and the corpus measurement each chose a reader from the file's
 * NAME, with a copy of the same list. One entry was
 * `/^up-.*Components/` — capital C — and most of UP's component sheets are
 * named in lower case, or in German. So the sweep never checked them (they
 * went to a reader that found no lines in them), and the corpus counted the
 * five it did read once each, as five designs, with their middle lines
 * counted as canopy lines.
 *
 * A UP workbook is recognised here by what is in it, and a design by its
 * maker and model whatever the sheet is called.
 */
import {
  parseLineTable, parseSimpleLineSheet, parseUpLineSheet, parseBgdLineTable,
} from '../src/core/lineplan.js';

/** Files that are not line sheets at all. */
const NOT_LINES = [
  /^niviuk-spec\.tsv$/,
  // An inspection record — reference, measured, delta — has no line names.
  /-inspection/,
  // A fabric schedule lists materials by location.
  /fabric-schedule/,
  /certification-flight-tests/,
  // The makers' specification tables, and the cell counts of the designs
  // whose line sheets are here.
  /^published-/,
  /materials|families|risers|min-strength|joncs/,
];

/**
 * The lines in a reference file, or null where it holds none to read.
 *
 * `kind` says what a length in it is: 'components' for single lines,
 * 'totals' for canopy-to-riser sums (one row per canopy attachment).
 */
export function referenceLines(f, body) {
  if (NOT_LINES.some((re) => re.test(f))) return null;

  if (/^up-split-/.test(f)) {
    return { lines: parseSimpleLineSheet(body).lines, kind: 'totals', reader: 'simple' };
  }
  if (/^up-/.test(f)) {
    const sheet = parseUpLineSheet(body);
    if (sheet.layout === 'components' && sheet.lines.length) {
      // The folding lines fitted for the collapse tests are listed on sheets
      // of their own — f1 to f12, FI to FVI, Fmain1 to Fmain4. They are a
      // cascade, and they are not a row F of the wing.
      if (sheet.lines.every((l) => l.row === 'F')) return null;
      return { lines: sheet.lines, kind: 'components', reader: 'up', sheet };
    }
    // A totals sheet: one column a size. Read as a table, as before.
    const t = parseLineTable(body);
    return t.lines.length ? { lines: t.lines, kind: 'totals', reader: 'table' } : null;
  }
  if (/^bgd-/.test(f)) return { lines: parseBgdLineTable(body).lines, kind: 'components', reader: 'bgd' };
  if (/^niviuk-.*-totals/.test(f)) return null;
  if (/^niviuk-/.test(f)) {
    return { lines: parseSimpleLineSheet(body).lines, kind: 'components', reader: 'simple' };
  }
  const t = parseLineTable(body);
  return t.lines.length ? { lines: t.lines, kind: 'components', reader: 'table' } : null;
}

const SIZE = '(?:xxs|xs|s|sm|ms|m|ml|l|xl|xxl|\\d+)';

/**
 * The design a file belongs to: maker and model, with the size and the name
 * of the sheet taken off.
 *
 *   geo7-MS.tsv                            geo7
 *   up-torre-TORRE_L_-_Components.tsv      up-torre
 *   up-torre-TORRE_-_Total_lengths.tsv     up-torre
 *   up-split-makalu-5-sm.tsv               up-makalu5
 *   up-makalu5-sheet5.tsv                  up-makalu5
 *   niviuk-hook6-24-totals.tsv             niviuk-hook6
 */
export function designOf(f) {
  const base = f.replace(/\.tsv$/, '');
  let m = /^up-split-(.+?)-[a-z]+$/.exec(base);
  if (m) return `up-${m[1].replace(/-/g, '')}`;
  // `up-<model>-<Sheet name>`: the model is the lower-case part.
  m = /^up-((?:[a-z0-9]+-)*?[a-z0-9]+)-(?:[A-Z].*|sheet\d+)$/.exec(base);
  if (m) return `up-${m[1].replace(/-/g, '')}`;
  m = new RegExp(`^(niviuk-[a-z0-9]+)(?:-${SIZE}-totals)?$`, 'i').exec(base);
  if (m) return m[1];
  return base.replace(new RegExp(`[-_]${SIZE}$`, 'i'), '');
}
