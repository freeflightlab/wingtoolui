# Where this tool actually is

An honest assessment, written for a reviewer who will check it.

## 1. What it does

It takes a paraglider from planform to cutting files. Geometry, aerofoil, arc
and twist, equilibrium, line plan and risers, loads and line sizing, rib
openings, diagonals and rods, panel development, nesting, and DXF or printed
patterns. It reads and writes LEparagliding files, generates a size family,
and produces a bill of materials and a PMA inspection check.

One offline HTML file, 733 KB, no build step and no network. That constraint
drove the architecture: 37 core modules bundled into a single scope, with the
build refusing duplicate top-level names because they would collide silently.

**37,000 lines**: 17,000 core, 2,100 interface, 10,300 tests, 2,000 tools,
5,800 documentation.

## 2. What is genuinely validated

This is the part that matters and the part most easily overstated.

**Against Laboratori d'envol's own Swoop2** — the method's author
demonstrating the method. Flat area, span, root chord, cell and rib counts
reproduce **exactly**. 37 LEP sections parse. Its published per-line loads
close at every cascade level.

**Against 21 wings from six manufacturers**, 137 reference files. Every line
sheet is held to five physical invariants, not merely parsed. The
anchor-density table the generator calibrates against is **measured from the
corpus**, not hand-entered — 27 designs, and a check stage fails if the
constant drifts from its data.

**Against a manufacturer's own inspection record.** The Enzo 3 sheets put
**353 of 354** measured lines inside the PMA's ±12 mm band, and
`lineGeometryCheck` passes all six sizes with a 2 mm correction offset at
worst against a 118 mm limit. That is a tolerance this project had taken on
the standard's word for many rounds.

**All 55 published sizes run the full pipeline with zero failures.**

## 3. What is estimated, and says so

- **Sail and rib cloth strengths.** These are my estimates, not datasheet
  figures, and they are marked `ESTIMATED` in a way that reaches the exported
  report. The conclusions they support — that rib cloth cannot carry an anchor
  load, that the seam is the limit and not the cloth — hold across any
  plausible value, because the margins are thirtyfold and severalfold
  respectively. A designer sizing a real wing should replace both.
- **Gust alleviation below a mass ratio of 5.** Pratt-Walker is extrapolated
  an order of magnitude below its fitted range. Checked against a
  first-principles integration, which agrees to 3% inside the range and
  diverges by 16% at a paraglider's — with Pratt-Walker the conservative one.
- **The 3D shaping requirement.** Not derived. `shapingForWing` refuses to run
  without a figure rather than invent one.

## 4. What is wrong, or unexplained

**The 10% residual in minimum sink is explained.** The model trims at CL
0.806 where a real wing trims near 0.55 to 0.65, so it flies about 20% too
slowly at trim. `sink = V / (L/D)`, and the glide was already right, so a
speed 20% low gives a sink rate about 17% low — which is the discrepancy.

EN 926-2 flight test reports settled it. They contain no polar, but they fix
the trim speed at above 30 km/h at weights the wing was actually flown at, and
the model gives 24.9 to 31.6 km/h across four certified cases — short on
three. Two earlier suspects had already been ruled out by measurement: raising
profile drag and modelling the inflated shape both move sink toward reality
and glide away from it.

**It is not yet fixed.** Knowing the model trims at too high a lift
coefficient is not the same as knowing why, and the fix touches the
equilibrium solve, which everything downstream depends on.

**Total line length runs +14% against published.** Concentrated in two-liner
middle lines. The mechanism is identified — lateral run to gather anchors —
and not fixed.

**Panel development is not validated against a third party.** The Swoop2's own
2D DXF draws its panels as 83,776 individual line segments on one layer with
16,463 junctions, and connectivity alone cannot separate a panel from the
marks drawn on it. The reconstruction tool is correct — exact on this
project's own 50 panels exploded and rebuilt — and the input is not separable
by it.

## 5. What is missing

**42 open items.** The substantial ones:

- Collapse behaviour: the frontal-collapse floor is assumed rather than
  predicted, and the dynamic factor is a stand-in.
- Collapse (Z) lines: three reference wings carry them; the model does not.
- Asymmetric and left/right-independent line plans.
- Nesting: 51.6% efficiency against a 73% shape ceiling.
- Prototype tuning — recording measured flight behaviour against prediction —
  which is the loop that would close most of section 4.

## 6. What I would tell a reviewer to check first

1. **The provenance stage.** Run `npm run check:provenance`. Two of five
   material tables are my estimates and say so. If that discipline had
   slipped, everything downstream would be suspect.
2. **`docs/departures.md` and `docs/swoop2.md`.** Every place the
   implementation differs from its source, with the measurement that
   justified it.
3. **The `options` and `interface` stages.** Four defects came from calls that
   look right, run clean and do nothing — including a bill of materials built
   with no line data. Both stages exist because unit tests could not see them.
4. **The 10% sink residual.** It is the largest thing I cannot explain.

## 7. Honest summary

**Production quality for what it claims**, which is a design and analysis tool
whose numbers are traceable — not a certification tool. It says where every
material figure came from, refuses geometry that is not a wing, and marks its
own estimates.

**The aerodynamics is the weakest part**, though less so than it was. A
vortex lattice now solves the wing as it actually sits in the air — the arc
included, rather than corrected for afterwards — and it is validated against
the cases with known exact answers: the lift slope approaches 2 pi at high
aspect ratio, and an elliptical wing gives a span efficiency of 1.006. It is
good enough to compare designs and rank trades; it is not good enough to
predict a polar a manufacturer would publish.

**The geometry and construction side is strong.** It reproduces a published
design exactly, holds 21 wings to physical invariants, and its constants are
measured from the corpus rather than asserted.

**A wing designed with this tool has not been tested, certified, or flown.**
That is in the README and it is not a formality.
