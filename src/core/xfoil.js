/* xfoil.js — XFOIL interoperability.
 *
 * The built-in section model in aero.js is thin-airfoil theory plus a
 * flat-plate drag correlation. It is fine for comparing designs and useless
 * for predicting a number, because it has no boundary layer and therefore no
 * separation bubble — which is precisely what governs a paraglider section at
 * the Reynolds numbers it actually flies.
 *
 * XFOIL does have a boundary layer. It is not something that can be
 * reimplemented honestly in a browser, so this module does the next best
 * thing: it writes the two files XFOIL needs, at the exact Reynolds and Mach
 * number the environment model computes, and reads the polar back.
 *
 * The workflow follows the standard batch harness:
 *
 *     xfoil.exe < xfoil_input.cmd > xfoil_output.out
 *
 * Once a polar is imported, `wingPolar` uses measured section data and the
 * only things still modelled are the camber-line theory and the lifting line.
 */

/**
 * Airfoil geometry in the normalised Selig ordering XFOIL expects: trailing
 * edge, over the upper surface, round the nose, back along the lower surface
 * to the trailing edge.
 */
export function airfoilToDat(airfoil, name = null) {
  const label = (name || airfoil.name || 'airfoil').replace(/\s+/g, '_');
  const lines = [label];
  for (const [x, y] of airfoil.points) {
    lines.push(`  ${x.toFixed(6).padStart(10)}  ${y.toFixed(6).padStart(10)}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * XFOIL command script for a viscous polar sweep.
 *
 * @param {object} o
 * @param {string} o.datFile     geometry file to load
 * @param {number} o.reynolds    from the environment model
 * @param {number} o.mach        from the environment model
 * @param {number} o.nCrit       transition criterion; 9 is the default, but
 *                               a sailcloth wing in free air is closer to 5-7
 * @param {number[]} o.alphaRange [start, end]
 */
export function commandScript({
  datFile = 'airfoil.dat',
  polarFile = 'AIRFOIL_POLARS.dat',
  reynolds = 1e6,
  mach = 0,
  nCrit = 9,
  alphaRange = [-4, 14],
  alphaStep = 0.5,
  panels = 200,
  iterations = 200,
  xtrTop = 1.0,
  xtrBot = 1.0,
  smooth = true,
} = {}) {
  const L = [];
  L.push(`LOAD ${datFile}`);
  L.push('');
  if (smooth) {
    // Re-panel before analysis. XFOIL's boundary layer is sensitive to panel
    // distribution, and an imported section — especially one that came from a
    // manufacturer's cutting file — is rarely panelled the way it wants.
    L.push('PPAR');
    L.push(`N ${panels}`);
    L.push('');
    L.push('');
    L.push('PANE');
  }
  L.push('OPER');
  L.push(`VISC ${reynolds.toFixed(0)}`);
  L.push(`MACH ${mach.toFixed(4)}`);
  L.push(`ITER ${iterations}`);
  L.push('VPAR');
  L.push(`N ${nCrit.toFixed(2)}`);
  L.push('XTR');
  L.push(`${xtrTop.toFixed(3)}`);
  L.push(`${xtrBot.toFixed(3)}`);
  L.push('');
  // Converge at a low angle before starting the sweep, so the first viscous
  // solution has an easy initial state to march from.
  L.push(`ALFA ${alphaRange[0].toFixed(2)}`);
  L.push('INIT');
  L.push('ALFA 0.00');
  L.push('PACC');
  L.push(polarFile);
  L.push('');
  L.push(`ASEQ ${alphaRange[0].toFixed(1)} ${alphaRange[1].toFixed(1)} ${alphaStep.toFixed(2)}`);
  L.push('PACC');
  L.push('');
  L.push('QUIT');
  return L.join('\n') + '\n';
}

/**
 * Parse an XFOIL polar accumulation file.
 *
 * The header carries the Reynolds and Mach numbers the run was actually made
 * at. Those are checked against the state the wing is being analysed at,
 * because a polar computed for the wrong altitude looks perfectly valid and
 * silently gives the wrong answer.
 */
export function parsePolar(text) {
  const lines = text.split(/\r?\n/);
  let reynolds = null;
  let mach = null;
  let nCrit = null;
  let name = null;

  for (const line of lines) {
    const nm = line.match(/Calculated polar for:\s*(.+?)\s*$/i);
    if (nm) name = nm[1];
    // "Mach =   0.000     Re =     1.000 e 6     Ncrit =   9.000"
    const m = line.match(/Mach\s*=\s*([\d.eE+-]+)/);
    if (m) mach = parseFloat(m[1]);
    const r = line.match(/Re\s*=\s*([\d.]+)\s*e\s*([\d]+)/i);
    if (r) reynolds = parseFloat(r[1]) * Math.pow(10, parseInt(r[2], 10));
    else {
      const r2 = line.match(/Re\s*=\s*([\d.eE+-]+)/);
      if (r2 && !/e\s/i.test(line)) reynolds = parseFloat(r2[1]);
    }
    const nc = line.match(/Ncrit\s*=\s*([\d.]+)/i);
    if (nc) nCrit = parseFloat(nc[1]);
  }

  const points = [];
  for (const line of lines) {
    const f = line.trim().split(/\s+/);
    if (f.length < 5) continue;
    const v = f.map(Number);
    if (!v.slice(0, 5).every(Number.isFinite)) continue;
    // Guard against the dashed rule under the header parsing as numbers.
    if (/^-+$/.test(f[0])) continue;
    points.push({
      alphaDeg: v[0], cl: v[1], cd: v[2], cdp: v[3], cm: v[4],
      topXtr: v[5], botXtr: v[6],
    });
  }
  if (!points.length) throw new Error('No polar data rows found — is this an XFOIL polar file?');
  points.sort((a, b) => a.alphaDeg - b.alphaDeg);

  // A least-squares line through the polar's linear range, of its lift and
  // of its moment against the angle.
  const lin = points.filter((p) => Math.abs(p.cl) < 0.9);
  const fit = (rows, y) => {
    const n = rows.length;
    const sx = rows.reduce((s, p) => s + p.alphaDeg, 0);
    const sy = rows.reduce((s, p) => s + y(p), 0);
    const sxy = rows.reduce((s, p) => s + p.alphaDeg * y(p), 0);
    const sxx = rows.reduce((s, p) => s + p.alphaDeg * p.alphaDeg, 0);
    const den = n * sxx - sx * sx;
    if (n < 2 || !(Math.abs(den) > 1e-12)) return null;
    const perDeg = (n * sxy - sx * sy) / den;
    return { perDeg, at: (a) => (sy - perDeg * sx) / n + perDeg * a };
  };

  // Zero-lift angle and Cm0 by interpolation through Cl = 0. A polar that
  // does not reach zero lift, swept from 0° as many are, had its first angle
  // taken for it: a 4%-cambered section swept from 0° flew 4° short of its
  // own lift. Its zero-lift angle is found along its lift slope, its Cm0
  // along its moment's, from the lowest of its linear range, and it says so.
  let alphaL0Deg = null;
  let cm0 = null;
  let zeroLiftExtrapolated = false;
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].cl <= 0 && points[i].cl >= 0) {
      const d = points[i].cl - points[i - 1].cl || 1;
      const f = -points[i - 1].cl / d;
      alphaL0Deg = points[i - 1].alphaDeg + f * (points[i].alphaDeg - points[i - 1].alphaDeg);
      cm0 = points[i - 1].cm + f * (points[i].cm - points[i - 1].cm);
      break;
    }
  }
  if (alphaL0Deg === null) {
    const rows = lin.length >= 2 ? lin.slice(0, 4) : points.slice(0, 2);
    const cl = fit(rows, (p) => p.cl);
    const cm = fit(rows, (p) => p.cm);
    if (!(cl && cl.perDeg > 0)) {
      throw new Error('The polar never reaches zero lift and its lift does not rise with its angle, so its zero-lift angle cannot be found');
    }
    alphaL0Deg = -cl.at(0) / cl.perDeg;
    cm0 = cm ? cm.at(alphaL0Deg) : rows[0].cm;
    zeroLiftExtrapolated = true;
  }

  // Lift slope from a least-squares fit over the linear range.
  let slope = 2 * Math.PI;
  if (lin.length > 3) slope = fit(lin, (p) => p.cl).perDeg * (180 / Math.PI);

  return {
    source: 'xfoil',
    name,
    reynolds,
    mach,
    nCrit,
    alphaL0Deg,
    cm0,
    zeroLiftExtrapolated,
    clMax: Math.max(...points.map((p) => p.cl)),
    cd0: Math.min(...points.map((p) => p.cd)),
    liftSlopePerRad: slope,
    points,
  };
}

/**
 * Check an imported polar against the conditions the wing is being analysed
 * at. A polar run at sea level tells you nothing useful about 20 km, but it
 * loads without complaint, so the mismatch has to be surfaced.
 */
export function checkPolarMatch(polar, { reynolds, mach }, { reTol = 0.35, machTol = 0.05 } = {}) {
  const issues = [];
  if (polar.reynolds && reynolds) {
    const ratio = polar.reynolds / reynolds;
    if (ratio < 1 - reTol || ratio > 1 + reTol) {
      issues.push({
        level: 'warn',
        text: `Polar was run at Re ${polar.reynolds.toExponential(2)} but the wing is at Re ${reynolds.toExponential(2)}`
          + ` (${((ratio - 1) * 100).toFixed(0)}% off). Re-run XFOIL at this condition.`,
      });
    }
  }
  if (polar.mach != null && mach != null && Math.abs(polar.mach - mach) > machTol) {
    issues.push({
      level: 'warn',
      text: `Polar was run at M ${polar.mach.toFixed(3)} but the wing is at M ${mach.toFixed(3)}.`,
    });
  }
  return issues;
}

/**
 * Everything needed for one XFOIL run, as a set of named files.
 * The caller writes them out; the tool has no shell to run XFOIL itself.
 */
export function runPackage(airfoil, { reynolds, mach, nCrit = 7, alphaRange, alphaStep }) {
  const base = (airfoil.name || 'airfoil').replace(/\s+/g, '_');
  const datFile = `${base}.dat`;
  const polarFile = `${base}_polar.dat`;
  return {
    files: [
      { name: datFile, content: airfoilToDat(airfoil) },
      {
        name: 'xfoil_input.cmd',
        content: commandScript({ datFile, polarFile, reynolds, mach, nCrit, alphaRange, alphaStep }),
      },
      {
        name: 'README_xfoil.txt',
        content: [
          `XFOIL run package for ${airfoil.name || 'airfoil'}`,
          '',
          `Reynolds number : ${reynolds.toExponential(3)}`,
          `Mach number     : ${mach.toFixed(4)}`,
          `Ncrit           : ${nCrit}`,
          '',
          'Both numbers come from the operating environment set in the tool',
          '(altitude, temperature offset, and the speed the wing trims at).',
          'Re-run this whenever the altitude or the wing loading changes —',
          'a polar is only valid at the condition it was computed for.',
          '',
          'Run with:',
          '',
          '    xfoil < xfoil_input.cmd > xfoil_output.out',
          '',
          `then import ${polarFile} back into the tool.`,
          '',
          'Ncrit note: 9 is the wind-tunnel default. Free air with a sailcloth',
          'surface is closer to 5-7, which moves transition forward and raises',
          'drag. If you do not know, run both and treat the spread as the',
          'uncertainty band.',
        ].join('\n'),
      },
    ],
    datFile,
    polarFile,
  };
}
