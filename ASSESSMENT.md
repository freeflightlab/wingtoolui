# Where this tool actually is

An honest assessment, written for a reviewer who will check it.

## 1. What it does

It takes a paraglider from planform to cutting files. Geometry, aerofoil, arc
and twist, equilibrium, line plan and risers, loads and line sizing, rib
openings, diagonals and rods, panel development, nesting, and DXF or printed
patterns. It reads and writes LEparagliding files, generates a size family,
and produces a bill of materials and a PMA inspection check.

One offline HTML file, 1.2 MB, no build step and no network. That constraint
drove the architecture: 38 core modules bundled into a single scope, with the
build refusing duplicate top-level names because they would collide silently.

**About 60,000 lines**: 23,400 core, 5,000 interface, 16,100 tests, 5,200
tools, 10,100 documentation.

## 2. What is genuinely validated

This is the part that matters and the part most easily overstated.

**Against Laboratori d'envol's own Swoop2** — the method's author
demonstrating the method. Flat area, span, root chord, cell and rib counts
reproduce **exactly**, and so does its own program's output: every one of its
93 lines' length, cut length, load and type, its ribs' placement, its rods,
its karabiner position and attitude, to fractions of a millimetre.

**Against 21 wings' line sheets from five manufacturers, and 55 published
sizes**, in 137 reference tables. Every line sheet is held to five physical
invariants, not merely parsed. The anchor-density tables the generator works
from are **measured from the corpus**, not hand-entered — the row ratios on 19
designs, the front-row density on 20 — and a check stage fails if either
drifts from its data. Of 23 published sizes transcribed from the makers' own
tables, 138 figures, none disagrees with the reference set.

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

**The residual in minimum sink is explained, and fixed only in the core.**
At an assumed 6° the model trims at CL 0.806 where a real wing trims near 0.55
to 0.65, so it flies about 20% too slowly and sinks about 17% too little.
EN 926-2 flight test reports fix the trim speed above 30 km/h at the weights
the wings were flown at, and the assumed-angle solve gives 24.9 to 31.6 km/h
over four certified cases — short on three. `trimFromCalage` solves it the
other way round, from where the risers hang, and gives 29.4 to 35.6 km/h at
CL 0.58 to 0.63 with sinks of 0.92 to 1.08 m/s. The interface's balance is
still the handbook's, on typed coefficients.

**Generated linesets are long on two-liners.** Built with their own anchors,
the three-liners land within a tenth of their sheets and the two-liners a
third over: each Ozone two-liner has sixteen short bridles a side at the top of
its front row, a level the generator does not build. Across the 55 published
sizes the pipeline runs +7% (−21% to +43%). The interface's own derived plan
attaches every second rib whatever the wing, which is a real density on the
default wing and not on a published one loaded from the picker; a solve to the
published total is a button, not yet the default.

**Panel development is not validated against a third party.** The Swoop2's own
2D DXF draws its panels as 83,776 individual line segments on one layer with
16,463 junctions, and connectivity alone cannot separate a panel from the
marks drawn on it. The reconstruction tool is correct — exact on this
project's own 50 panels exploded and rebuilt — and the input is not separable
by it.

## 5. What is missing

**44 open items in the roadmap.** The substantial ones:

- Collapse behaviour: the frontal-collapse floor is assumed rather than
  predicted, and the dynamic factor is a stand-in.
- Collapse (Z) lines: three reference wings carry them; the model does not.
- Parts of the core with no way in from the interface: the speed system and
  trimmers, the coupled balance, the vortex lattice, the inflated shape and
  3D shaping. Each says so where it is documented.
- The Swoop2's 70 straps and 15 pieces between ribs are read and listed, not
  built.
- Asymmetric and left/right-independent line plans.
- Nesting: 63.5% of the roll on the default wing, against panels that fill
  94% of their own boxes.
- Line ageing: the drift model's directions are the makers', its sizes
  estimates; no aged lineset has been measured.
- Prototype tuning — recording measured flight behaviour against prediction —
  which is the loop that would close most of section 4.

## 6. What I would tell a reviewer to check first

1. **The provenance stage.** Run `npm run check:provenance`. Three of seven
   material tables are my estimates and say so — the sail and rib cloth
   strengths and the fibres' drift. If that discipline had slipped,
   everything downstream would be suspect.
2. **`docs/departures.md` and `docs/swoop2.md`.** Every place the
   implementation differs from its source, with the measurement that
   justified it.
3. **The `options` and `interface` stages.** Four defects came from calls that
   look right, run clean and do nothing — including a bill of materials built
   with no line data. Both stages exist because unit tests could not see them.
4. **The two-liner surplus and the sink residual.** One is a level the
   generator lacks; the other is an assumed angle the interface still uses.
   Both are explained and neither is closed.

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
measured from the corpus rather than asserted. This round found what that
had not caught: most of the line catalogue under the wrong fibre, merged
cascades carrying half their load, and a rib count wrong on three of the six
designs a constant came from. Each is fixed and now held by a test against
the data it came from.

**A wing designed with this tool has not been tested, certified, or flown.**
That is in the README and it is not a formality.
