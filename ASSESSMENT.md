# Where this tool actually is

An honest assessment, written for a reviewer who will check it.

## 1. What it does

It takes a paraglider from planform to cutting files. Geometry, aerofoil, arc
and twist, equilibrium, line plan and risers, loads and line sizing, rib
openings, diagonals and rods, panel development, nesting, and DXF or printed
patterns. It reads and writes LEparagliding files, generates a size family,
and produces a bill of materials and a PMA inspection check.

One offline HTML file, 1.5 MB, no build step and no network. That constraint
drove the architecture: 40 core modules bundled into a single scope, with the
build refusing duplicate top-level names because they would collide silently.

**About 71,000 lines**: 28,400 core, 6,200 interface, 18,300 tests, 6,000
tools, 12,100 documentation.

## 2. What is genuinely validated

This is the part that matters and the part most easily overstated.

**Against Laboratori d'envol's own Swoop2** — the method's author
demonstrating the method. Flat area, span, root chord, cell and rib counts
reproduce **exactly**, and so does its own program's output: every one of its
93 lines' length, cut length, load and type, its ribs' placement, its rods,
its karabiner position and attitude, to fractions of a millimetre.

**And against a second complete design, the Tuluaq-19**, from an earlier
version of the same program, to the same standard: its 89 lines, its ribs,
rods, holes, projected figures and attitude. It crashed the tool when first
loaded. The three details of the program behind that — an anchor at exactly
100% of chord, one ahead of the intake, a webbing riser — are fixed and held
by tests. One design read exactly was evidence about that design; two are
evidence about the reader.

**Against 21 wings' line sheets from five manufacturers, and 55 published
sizes**, in 143 reference tables, six of them the makers' own line-plan
drawings transcribed line by line. Every line sheet is held to five physical
invariants, not merely parsed. The anchor-density tables the generator works
from are **measured from the corpus**, not hand-entered — the row ratios on 19
designs, the front-row density on 20, each design's own cascade and tip lines
— and a check stage fails if any drifts from its data. The reference wings'
arc is checked against the published projected areas, independently of the
span it is built through: an ellipse through that span lands within 1.0% on
average on the 55, where the circle it replaced was 2.0% out and short on 51. Of 23 published sizes transcribed from the makers' own
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

**The residual in minimum sink was the arc.** On a flat wing, at an assumed
6°, the model trims at CL 0.806 where a real wing trims near 0.55 to 0.65,
so it flew about 20% too slowly and sank about 17% too little: EN 926-2
flight test reports fix the trim above 30 km/h at the weights the wings were
flown at, and the flat solve gives 24.9 to 31.6 km/h over four certified
cases, short on three. The wing is not flat. In its arc — the published one
— the vortex lattice gives the Geo 7 seven tenths of the flat wing's lift
slope, and the same 6° trims at CL 0.59 and 29.1 to 36.9 km/h, short on one.
On the Lynx 2 M, the derived polar in its arc comes nearer all four of its
published figures: glide within 2%, sink 12% low, trim 12% slow. The
interface flies the wing in its arc. What remains is the assumed angle —
`trimFromCalage` solves the trim from where the risers hang, in the core —
and a section lift curve from thin-aerofoil theory.

**Generated linesets are long on two-liners.** Built with their own counts,
the three-liners land from 3% under to 12% over their published totals and
the two-liners, and the Lynx 2, a third over: each Ozone two-liner has sixteen
short bridles a side at the top of its front row, a level the generator does
not build. Across the 55 published sizes the pipeline runs +15% (−21% to
+46%). A wing from the picker hangs from its own cascade where its sheets are
on file and from anchors solved to its published total where they are not. In
shape the rows that carry the wing are 88 mm from the 28 sheets with
per-anchor totals on average; the brake is 91 to 197 mm from them, and is not
yet understood.

**An imported design is cut as its program cuts it.**
Every piece of the three complete designs' cutting files was measured. Their
panels — surfaces parted under the nose, skin tension, intake closures, the
design's own allowances, the program's seam matching and the gnuC2-23's 3D
shaping — are within 0.034% of the Swoop2's and 0.011% of the Tuluaq's and
the gnuC2-23's, piece by piece; the one exception is the gnuC2-23's tip
front piece, whose outline crosses itself over its flat rib, 2.5% off. The
Tuluaq's tip panel, 0.14% off and unexplained a round ago, was the seam
matching. Every rib is cut as the program cuts it, to 0.002% on all three,
and its holes are the program's polygons. What they sew inside their cells —
full diagonals, V-rib strips, straps, pieces between two ribs and rod
pockets, read from the program's own source — is within a part in ten
thousand of every piece in the three files, or the file's own rounding, and
the bill carries it, and the ribs at their cut size: 11.9, 10.8 and 11.3 m²
of internal structure for the wing. So are their trailing-edge mini-ribs,
the last pieces that were not built, raised at the front to the billow of
the cell as the program finds it from the panels: all 70, to the files'
totals, and the gnuC2-23's piece by piece. Where the program lays a closed
intake out by itself and joins it to the panel, the tool is 0.01 to 0.03%
off and does not yet know why.

The gnuC2-23 also asks its program to solve its longitudinal balance, and
every figure the program prints of it reproduces to the last digit. On the
same coefficients, this tool's own balance — the handbook's — flies the same
speed and glide and hangs the pilot within 0.12% of chord of the program's.
That agreement is partly luck: two of the handbook's rules for where forces
act are each worth nearly 2% of chord, and on that wing they cancel
(`docs/validation.md` §2.9).

## 5. What is missing

**44 open items in the roadmap.** The substantial ones:

- The trim from the calage in the interface: its balance takes an angle of
  attack and typed coefficients, as the handbook's does.
- Collapse behaviour: the frontal-collapse floor is assumed rather than
  predicted, and the dynamic factor is a stand-in.
- Collapse (Z) lines: three reference wings carry them; the model does not.
- Parts of the core with no way in from the interface: the coupled balance,
  the inflated shape and 3D shaping. Each says so where it is documented.
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
vortex lattice solves the wing as it actually sits in the air, and the polar
and the balance fly the wing in its arc by it: three quarters of a flat
wing's lift, a quarter more induced drag at the same lift. It is validated
against the cases with known exact answers: the lift slope approaches 2 pi at
high aspect ratio, an elliptical wing gives a span efficiency of 1.004, and a
wake turned in its own plane keeps its drag. Two defects in it were found
by those cases and by the wings: the Trefftz integral took the vertical wash,
which overstated the arc's gain in efficiency threefold, and the trailing
legs left the strips at their quarter chord, which made an arched wing's
solution run away above 9° and overstated the lift the arc costs by half.
With the arc, a wing's derived glide, sink and trim come near its published
ones. It is good enough to compare designs and rank trades; the trim still
comes from an assumed angle and the section's lift curve from thin-aerofoil
theory, and it is not good enough to predict a polar a manufacturer would
publish.

**The geometry and construction side is strong.** It reproduces a published
design exactly, holds 21 wings to physical invariants, and its constants are
measured from the corpus rather than asserted. This round found what that
had not caught: most of the line catalogue under the wrong fibre, merged
cascades carrying half their load, and a rib count wrong on three of the six
designs a constant came from. Each is fixed and now held by a test against
the data it came from.

**A wing designed with this tool has not been tested, certified, or flown.**
That is in the README and it is not a formality.
