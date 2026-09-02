# 3D shaping of the nose

A panel cut flat and sewn to its neighbours forms a **cone** between two ribs.
Near the leading edge that is wrong: the real surface curves in two directions
at once, and a conical panel meets it along one line only, leaving the fabric
to pull into wrinkles either side.

3D shaping fixes it by cutting **darts** into the panel near the nose. Each
dart removes a wedge; sewing it closed gathers the panel and lets it curve
spanwise as well as chordwise. It is standard on modern wings and it is what
makes a clean nose possible in ripstop.

## 1. What is built and tested

| function | does |
| --- | --- |
| `dartGeometry` | width, depth, closing angle, seam shortening |
| `shapingRequirement` | how much cloth a seam must lose, and whether that is possible |
| `placeDarts` | spreads it over several darts along the nose |
| `applyDarts` | cuts them out of the panel outline |
| `shapingForWing` | runs it over every panel |

The total cloth removed does not depend on the dart count — asserted — but
spreading it matters: one large dart makes a crease where several small ones
make a curve. A dart **wider than it is deep** will fold rather than rotate,
and is flagged.

A panel already shorter than the surface it must cover says so rather than
returning "0 darts", because darting cannot add cloth.

## 2. What is not built, and two wrong turns

**The requirement is not derived from the wing.** `shapingForWing` asks for
it. Two derivations were tried and both were wrong:

**From the developable distortion.** `developmentError` measures how badly a
flat development matches the surface. It returns about **0.002%** on every
wing here, so it reported that no wing needs shaping at all. Wrong quantity:
it measures how well a *cone* is unrolled, and 3D shaping exists precisely
because the nose is not a cone.

**From arc against chord across a cell.** The panel follows the arc while the
flat pattern gives the chord. But the dihedral change across one cell is about
**half a degree**, so the excess came out at **0.001 mm**. The arc across a
single cell is very nearly straight; that is not where the cloth goes.

The real driver is that the nose is **doubly curved** — a tight chordwise
radius wrapped around a spanwise arc — and no developable panel matches it.
Quantifying that needs the nose radius and the surface curvature together.

So the function refuses to run without a figure rather than shipping a third
guess. A designer with a measured or published value can use the placement
machinery today; the derivation is an open item and reported as
`requirementSource: 'given'` so nothing downstream can mistake it for
something the tool worked out.

Getting this wrong in one direction leaves the nose loose, and in the other it
will not sew. That is not a number to estimate quietly.
