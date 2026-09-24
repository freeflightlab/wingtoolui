/* shaping3d.js — 3D shaping of the leading edge.
 *
 * A panel cut flat and sewn to its neighbours forms a cone between two ribs.
 * Near the nose that is wrong: the real surface curves in two directions at
 * once, and a conical panel meets it only along one line, leaving the fabric
 * to pull into wrinkles either side.
 *
 * 3D shaping fixes it by cutting darts into the panel near the leading edge.
 * Each dart removes a wedge of cloth; sewing the wedge closed gathers the
 * panel and lets it curve spanwise as well as chordwise. It is standard on
 * modern wings and it is what makes a clean nose possible in ripstop.
 *
 * ---------------------------------------------------------------------------
 * What a dart does, geometrically
 * ---------------------------------------------------------------------------
 * A dart is a triangle removed from the panel edge: it starts at the seam,
 * runs `depth` into the cloth, and has width `width` at the seam. Closing it
 * shortens that seam by `width` and rotates the two sides towards each other
 * by an angle of about `width / depth`.
 *
 * So the darts are not decoration. Their total width sets how much the seam
 * shortens, and that is what has to match the difference between the flat
 * developed length and the true 3D surface length. Get it wrong in one
 * direction and the nose is loose; wrong in the other and it will not sew.
 *
 * LEP's section 29 describes the same thing as a count of cuts per surface
 * over a rib range, which is why this reports in those terms too.
 */

/** Where a dart sits and how big it is. */
export function dartGeometry({
  chordFraction, widthM, depthM, surface = 'upper',
}) {
  if (!(widthM > 0)) throw new Error('dartGeometry needs a positive width');
  if (!(depthM > 0)) throw new Error('dartGeometry needs a positive depth');
  return {
    chordFraction,
    widthM,
    depthM,
    surface,
    // Closing the dart rotates the cloth either side towards each other.
    closingAngleRad: 2 * Math.atan(widthM / (2 * depthM)),
    // And shortens the seam it is cut from by its own width.
    seamShorteningM: widthM,
  };
}

/**
 * How much a seam must shorten for the panel to take the 3D surface.
 *
 * The flat development gives the length of the seam laid out on the table.
 * The true surface, curving in two directions, is shorter across the same
 * span. That difference is what the darts have to absorb.
 */
export function shapingRequirement({ flatSeamM, surfaceSeamM }) {
  if (!(flatSeamM > 0)) throw new Error('shapingRequirement needs a flat seam length');
  const excess = flatSeamM - surfaceSeamM;
  return {
    flatSeamM,
    surfaceSeamM,
    excessM: excess,
    excessFraction: excess / flatSeamM,
    // Negative excess means the flat panel is already shorter than the
    // surface it has to cover, which no amount of darting can fix — the
    // panel is simply too small.
    feasible: excess >= 0,
    note: excess >= 0
      ? `${(excess * 1000).toFixed(1)} mm to be taken up by darts`
      : `the flat panel is ${(-excess * 1000).toFixed(1)} mm SHORTER than the `
        + 'surface it must cover: darting cannot add cloth',
  };
}

/**
 * Place darts to absorb a required shortening.
 *
 * Spread over `count` darts rather than one, because a single large dart
 * makes a crease where several small ones make a curve. The depth is set as a
 * fraction of chord: deep enough to let the cloth rotate, shallow enough not
 * to reach the part of the panel that is doing the flying.
 */
export function placeDarts({
  requirement, count = 3, chordM,
  fromChord = 0.02, toChord = 0.14, depthFraction = 0.06,
  surface = 'upper',
}) {
  if (!(count >= 1)) throw new Error('placeDarts needs at least one dart');
  if (!(chordM > 0)) throw new Error('placeDarts needs a chord');
  if (!requirement.feasible) {
    return {
      darts: [], count: 0, feasible: false,
      totalWidthM: 0, note: requirement.note,
    };
  }

  const widthEach = requirement.excessM / count;
  const depthM = depthFraction * chordM;
  const darts = [];
  for (let i = 0; i < count; i++) {
    // Spread evenly between the two chord bounds.
    const t = count === 1 ? 0.5 : i / (count - 1);
    darts.push(dartGeometry({
      chordFraction: fromChord + t * (toChord - fromChord),
      widthM: widthEach,
      depthM,
      surface,
    }));
  }

  const totalWidth = darts.reduce((a, d) => a + d.widthM, 0);
  // A dart wider than it is deep will not close cleanly: the cloth has to
  // fold rather than rotate.
  const tooWide = darts.filter((d) => d.widthM > d.depthM);

  return {
    darts,
    count,
    surface,
    feasible: true,
    totalWidthM: totalWidth,
    depthM,
    // What the seam becomes once they are closed.
    shortenedSeamM: requirement.flatSeamM - totalWidth,
    tooWide: tooWide.length,
    note: tooWide.length
      ? `${tooWide.length} dart(s) wider than deep: use more darts or cut them `
        + 'deeper, or the cloth will fold rather than curve'
      : `${count} darts of ${(widthEach * 1000).toFixed(1)} mm across `
        + `${(depthM * 1000).toFixed(0)} mm depth`,
  };
}

/** Cut the darts out of a panel outline. */
export function applyDarts(panel, placement) {
  if (!placement.feasible || !placement.darts.length) {
    return { ...panel, darted: false, dartCount: 0 };
  }

  const n = panel.left.length;
  const out = { left: [...panel.left], right: [...panel.right] };
  const notches = [];

  for (const d of placement.darts) {
    // The station nearest this dart's chord position.
    const i = Math.min(n - 1, Math.max(0, Math.round(d.chordFraction * (n - 1))));
    const [lx, ly] = panel.left[i];
    const [rx, ry] = panel.right[i];
    const width = Math.hypot(rx - lx, ry - ly);
    if (width < 1e-9) continue;
    const ux = (rx - lx) / width;
    const uy = (ry - ly) / width;

    // Half the dart out of each seam, so the panel stays symmetric about its
    // own centre line and the gather is even.
    const half = d.widthM / 2;
    out.left[i] = [lx + ux * half, ly + uy * half];
    out.right[i] = [rx - ux * half, ry - uy * half];
    notches.push({ station: i, chordFraction: d.chordFraction, widthM: d.widthM });
  }

  return {
    ...panel,
    left: out.left,
    right: out.right,
    darted: true,
    dartCount: notches.length,
    notches,
    seamShorteningM: placement.totalWidthM,
  };
}

/**
 * The shaping a wing actually needs, panel by panel.
 *
 * The requirement is not a number a designer supplies — it falls out of the
 * geometry. `flatdev.js` already measures how badly each panel's flat
 * development matches the 3D surface it has to cover; that distortion, over
 * the length of the leading-edge seam, is the cloth the darts must remove.
 *
 * Panels near the nose need it and panels aft do not, which is why 3D shaping
 * is a leading-edge technique rather than something applied everywhere.
 */
/**
 * The requirement, and why this does not derive it.
 *
 * `dartGeometry`, `shapingRequirement`, `placeDarts` and `applyDarts` are
 * sound: given how much cloth must come out of a seam, they place the darts
 * and cut them. What is missing is the step before — deriving that amount
 * from the wing.
 *
 * Two derivations were tried and both were wrong, in ways worth recording so
 * the third attempt does not repeat them:
 *
 * **From the developable distortion.** `developmentError` measures how badly
 * a panel's flat development matches the surface. It returns about 0.002% on
 * every wing here, so it reported that no wing needs shaping. Wrong quantity:
 * that measures how well a *cone* is unrolled, and 3D shaping exists because
 * the nose is not a cone.
 *
 * **From arc against chord across a cell.** The panel follows the arc while
 * the flat pattern gives the chord. But the dihedral change across one cell
 * is about half a degree, so the excess came out at 0.001 mm. The arc across
 * a single cell is very nearly straight; that is not where the cloth goes.
 *
 * The real driver is that the nose is **doubly curved** — a tight chordwise
 * radius wrapped around a spanwise arc — and no developable panel matches
 * it. Quantifying that needs the nose radius and the surface curvature
 * together, and getting it wrong in one direction leaves the nose loose while
 * the other will not sew.
 *
 * So `shapingForWing` takes the requirement rather than inventing it. A
 * designer with a measured figure, or a published one, can use the placement
 * machinery today; the derivation is an open item and is marked as one rather
 * than shipped as a third guess.
 */
export function shapingForWing({
  wing, panels, excessPerCellMM, count = 3, chordFraction = 0.14,
}) {
  if (!(excessPerCellMM > 0)) {
    throw new Error('shapingForWing needs excessPerCellMM: the cloth to remove '
      + 'per cell. This project cannot yet derive it from the geometry — see '
      + 'docs/shaping.md.');
  }

  const results = [];
  for (const p of panels) {
    const i = p.cell ?? 0;
    const rib = wing.ribs[i];
    if (!rib) continue;
    const seam = p.panel.seamLengths
      ? p.panel.seamLengths.left * chordFraction : 0;
    if (!(seam > 0)) continue;

    const excess = excessPerCellMM / 1000;
    const req = shapingRequirement({ flatSeamM: seam, surfaceSeamM: seam - excess });
    results.push({
      cell: i,
      surface: p.surface,
      shapedSeamM: seam,
      excessMM: excessPerCellMM,
      placement: placeDarts({
        requirement: req, count, chordM: rib.chord, surface: p.surface,
      }),
    });
  }

  const tooWide = results.filter((r) => r.placement.tooWide);
  return {
    panels: results,
    shapedCount: results.length,
    totalDarts: results.reduce((a, r) => a + r.placement.count, 0),
    problemPanels: tooWide.length,
    excessPerCellMM,
    requirementSource: 'given',
    note: `${results.length} panels shaped with `
      + `${results.reduce((a, r) => a + r.placement.count, 0)} darts at `
      + `${excessPerCellMM} mm per cell`
      + (tooWide.length ? `; ${tooWide.length} have darts wider than deep` : ''),
  };
}
