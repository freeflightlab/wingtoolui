# Validation notes

What was checked, how, and where this implementation knowingly differs from its
sources. Every claim here corresponds to a test in `tests/run-tests.js`.

Sources are of three kinds, and they carry different weight. The **handbook**
and the author's later studies are the design method. **Production data** from
Ozone, PHI and BGD is ground truth about wings that fly. **Theory** —
thin-aerofoil, lifting line, ISA — is checked against itself and against the
first two.

---

## 1. How the maths is validated

Three kinds of check, in descending order of strength.

**Exact closed-form cases.** A rectangular planform has area `span × chord` and
aspect ratio `span²/area` exactly. A circular arc of radius R laid with arc
length s has projected half-span `R·sin(s/R)` and tangent angle `s/R` exactly. A
half-circle billow of arc length π over chord 2 subtends exactly π radians.
These are asserted to machine precision — if they drift, something is wrong.

**Conservation properties the algorithm must obey.** The flat-development
method must unroll a *developable* surface with zero error, because such a
surface can be flattened without stretching. So the suite develops a flat
strip, a cylinder and a cone, and requires the distortion to vanish in all
three. The cylinder case is the sharpest: the unrolled panel must be an exact
rectangle whose width is the rib spacing and whose length is the arc length of
the section.

**Production data as ground truth.** Where a manufacturer states something this
project has to infer, the inference is run against the stated answer. BGD's
line tables give their own cascade topology, so the topology inference — which
elsewhere has to recover branching from lengths alone — is checked against it
directly. PHI's cascade totals close exactly, so the arithmetic can be asserted
to the millimetre.

**The handbook's own worked example.** Section 4.4 prints a full spreadsheet
for a 25.70 m² wing. Every printed value is asserted: aspect ratio, total drag
coefficient, drag split, glide angle, chord angle, dynamic pressure, speed in
both units, glide ratio, centre of pressure, calage, and each of the five
individual moments.

---

## 2. Departures from the source

### 2.1 The arc-length formulas in chapter 6 have typographic errors

The handbook prints the billow geometry as:

```
S = R * α
L = 2 * sin(α/2)
R = f + L * cos(α/2)
```

The second line is missing a factor of R — as written, the chord of the arc
would not depend on its radius. The third is dimensionally inconsistent.

Implemented instead are the standard circular-segment relations, which are what
the figure plainly intends:

```
S = R·α          L = 2R·sin(α/2)          f = R·(1 − cos(α/2))
```

`solveArc` inverts these by bisection on `S/L = (α/2)/sin(α/2)`, which is
monotonic on `(0, 2π)`, so the root is always bracketed and the solve cannot
diverge on a user input. Checked against the half-circle case, where α must
come out as exactly π.

### 2.2 The chapter 5 FORTRAN uses `atan` where `atan2` is needed

The reference subroutine carries the running seam angle forward with:

```fortran
theta = atan((r2y(i)-l2y(i))/(r2x(i)-l2x(i)))
```

`atan` returns a value in (−π/2, π/2) and cannot recover the quadrant, so the
panel flips whenever the step direction crosses vertical. On the strongly arced
wings the handbook itself recommends for high aspect ratios, that happens.
This implementation uses `atan2` on the separated components. Results are
identical everywhere the original was well behaved.

### 2.3 The chapter 5 algebra is ill-conditioned for closely spaced ribs

The handbook derives the triangle heights from the six edge lengths:

```
a2r = (a² − b² + c²) / (2a)
```

Exact in real arithmetic. In floating point it is not: when ribs are close
together `a²` is tiny while `b²` and `c²` are not, so the numerator is a
difference of nearly equal numbers, and dividing by the small `2a` amplifies
what survives. On a 12-cell wing this produced about 10 µm of seam-length
drift — harmless in fabric, but it meant the tests could not assert the
exactness the method actually has.

The same quantities are computed here as a dot-product projection and a
cross-product perpendicular distance, taken straight from the vectors.
Algebraically identical, and neither subtracts nearly equal quantities. Seam
length is now preserved to machine precision.

### 2.3.1 The distortion measure was tautological

Each unrolling step preserves five of the quadrilateral's six lengths: both
seam segments, the width, and **both diagonals**. The one it must give up is
the fourth side, `|L2 R2|`.

`developmentError` compared the diagonal `|L1 R2|` before and after
flattening — one of the five the construction preserves exactly. The
comparison could not return anything but machine precision, and it duly did:
on every wing, at every rib spacing from 0.23 m to 4.1 m, and on surfaces that
are plainly not developable. The status line reporting "worst panel
distortion" was reporting a number that could not move, and the test suite's
`< 1%` tolerance was satisfied by a zero that meant nothing.

It surfaced only when H-ribs were added and predicted to show distortion where
V-ribs would not. They showed none either — and neither did the sail panels
they were being compared against, which was the tell.

Measuring the fourth side gives a figure that responds to geometry: 0.0034% on
a normal wing, exactly zero on a cylinder and a cone, and growing with the
twist of a ruled surface. The test is now two-sided — **zero where the surface
really is developable, non-zero where it is not** — because only that
distinguishes a real measure from a tautological one.

### 2.4 The method is not symmetric between the two ribs — this is inherent

Each step preserves five of the quadrilateral's six lengths and lets the sixth
absorb the fact that the quadrilateral is not planar. The consequence is that
the **left seam is exact and the right seam is not**: the right-hand points
`R2` of one step and `R1` of the next are images of the same 3D point but are
not forced to coincide.

Measured on a 24-cell wing the gap peaks around 13 µm, and the right seam's
total length differs from the true 3D rib by about 6 µm over roughly 2 m — 3
parts per million, far below what fabric can hold. It is reported as
`maxClosureGap` on every developed panel so it can be watched rather than
assumed. It also means swapping which rib you pass as "left" changes which seam
is exact, by an amount too small to matter.

### 2.5 The 4.4 spreadsheet omits two moment terms

Reproducing the worked example term by term shows that its moment sum leaves
out two of the terms section 4.2 derives: the moment of **wing drag** about the
leading edge, and the **aerodynamic moment** itself. With those two dropped,
the five printed moments reproduce and sum to the printed residual of 0.17.
With them restored, the balance point moves aft.

The handbook flags the sheet as still in development, so both behaviours are
available:

| Mode | Moment terms | Calage |
| --- | --- | --- |
| `legacySpreadsheet: true` | as printed in 4.4 | 0.429 m (sheet: 0.433 m) |
| default | as derived in 4.2 | further aft |

The force-balance half of the solve — speed, glide ratio, glide angle, dynamic
pressure, drag split — is unaffected and reproduces the sheet in both modes.

### 2.6 The sheet's 3D lift factor does not follow from its own inputs

The example prints a finite-span correction of **0.624**. Lifting-line theory
with the sheet's own aspect ratio (4.09) and Oswald factor (0.90) gives 0.648;
0.624 corresponds to e ≈ 0.80. Legacy mode uses the printed 0.624 so the rest
of the sheet reproduces; the default derives the factor from the actual aspect
ratio and Oswald factor. `lift3DOverride` exposes the same escape hatch for
matching a wing against measured data.

### 2.7 Induced drag uses the 2D lift coefficient in the example

Formula [6] is `Cxi = Cz²(α)/(π·λ·e)`, and the worked example feeds the **2D**
`Cz` of 0.900 into it rather than the corrected 0.562 — which is what makes its
printed `Cxi` of 0.070 and `CxT` of 0.114 come out. Legacy mode preserves that;
the default uses the corrected value, which is the more defensible reading of
the surrounding text.

### 2.8 The NACA generator needed a closed trailing edge

Cross-checked against the NACA 4-digit generator at airfoiltools.com, which
documents the same equations: thickness applied perpendicular to the camber
line, constants quoted for a 20% section and scaled by `t/0.2`, cosine
spacing in uniform increments of β.

The standard polynomial leaves a **finite half-thickness of 0.0021 chord at
x=1** on a 20% section. That is fine for a rigid wing and wrong here: a
paraglider's trailing edge is sewn shut, so upper and lower panels must be cut
to meet. Measured on the default section it left a 3.15 mm gap per metre of
chord — about 8 mm on a 2.6 m root chord, propagating into every developed
panel.

The five constants sum to 0.0021, so replacing the last with **0.1036** makes
them sum to zero and closes the edge exactly. That is now the default;
`closedTrailingEdge: false` restores the open form for comparison against
published ordinates. After the change the 3D trailing-edge mismatch across all
ribs is 0.0000 mm.

An independent anchor: for NACA 2412 with an open trailing edge, the upper
surface point at x=1 works out by hand to **(1.0000838, 0.0012573)** — the
camber gradient there is −0.0667, which tips the half-thickness of 0.00126
slightly past x=1. A published generator produces the same figures to six
decimals, so the test pins the equations rather than just the code.

### 2.9 Two airfoil file formats, and one of them breaks a naive reader

Coordinate files come in **Selig** order (one loop, TE → upper → LE → lower →
TE) and **Lednicer** order (a line of two *counts*, then upper LE→TE, then
lower LE→TE). Read naively, the Lednicer count line parses as a coordinate
pair, and a point at x=61 drags the unit-chord normalisation out by a factor
of sixty — silently, producing a plausible-looking but wrong section. The
importer now distinguishes them: no real normalised ordinate exceeds about
1.5, so a leading pair of integers above that is a header.

### 2.10 The DXF claimed R12 but was not R12

The writer emitted `LWPOLYLINE`, an entity introduced with R13/2000. A file
declaring `AC1009` and then using it is rejected by strict readers and by some
cutting-table software — which is precisely the equipment this output exists
for. Polylines are now written the R12 way (`POLYLINE` / `VERTEX` / `SEQEND`),
with a minimal `HEADER` declaring `$ACADVER = AC1009` and `$INSUNITS = 6`
(metres). Validated by a group-code parser that checks pair structure, section
nesting, POLYLINE/SEQEND balance, vertex coordinates and entity whitelist.

### 2.11 Rib patterns were drawn on top of each other

Every rib's flat pattern spans a similar chordwise range and is centred on its
own chord line, so exporting them in place stacked all 25 into one blot — a
file that looks plausible on screen and cannot be cut from. Ribs are now laid
out in a column with a gap and labelled with station, chord and washin.

### 2.12 The simplified method (4.5) had an underived formula

`simplifiedCalage` previously used `σ = δ·cos²θ`, which was invented rather
than derived and has no basis in the construction. The handbook's method is:
hang the pilot vertically below Cp at the line length, then drop a
perpendicular back onto the chord. With the leading edge at the origin and `d`
the unit vector along the chord — which rises aft by θ in a glide — the pilot
sits at `δ·d + L·(0,−1)` and the perpendicular foot is its projection onto
`d`:

```
σ = δ − L·sin(θ)
```

This is pure geometry and assumes the pilot hangs directly below Cp, which
holds only if the line and pilot drag moments are ignored. They are not small
— in the handbook's example they come to roughly a quarter of the lift moment
— so the simplified method lands well forward of the full solve. The handbook
says as much, calling it a first approximation needing correction on the
prototype. `solveEquilibrium` is the one to trust; the simplified form is kept
as a cross-check and its relationship to the full solve is asserted.

### 2.13 Thickness is measured vertically, not perpendicular

`airfoilMetrics` reports maximum thickness as the vertical gap between the
surfaces at a given chord station, because that is what a chord-referenced
percentage like the handbook's Table 2.1 means. Since NACA thickness is
applied *perpendicular* to the camber line, a cambered section measures
slightly thick this way — 15.016% for a nominal 15% at 4% camber, about 0.11%
relative. Symmetric sections measure exactly. Tolerances are set just above
the real discrepancy rather than loose enough to hide an error.

### 2.14 Chapter 3.4 is superseded by the author's 2021 rotation study

The handbook rotates each rib twice: incidence about the spanwise axis, then
dihedral to stand it normal to the arc. A later study by the same author
(*Airfoils 3D rotations in LEparagliding*, August 2021) adds a **third
rotation about the global vertical axis**, and the reason is not cosmetic.

With two rotations every rib stays parallel in plan. On an arced wing that
leaves an outboard rib in a nearly horizontal plane while the airflow still
runs along the glide path, so the section works at a shape it was not designed
for. Yawing each rib brings its plane back onto the trajectory.

The order is fixed and not free to choose — incidence, then vertical, then
dihedral — and the study requires that a zero vertical rotation reproduce the
two-rotation result exactly. Both are implemented and both are tested.

Two diagnostics come with it:

- **phi** — angle between the rib's plane and the glide path line. Zero means
  the rib is perfectly presented to the flow.
- **chi** — angle between the rib's chord and the glide path: the local angle
  of attack that section actually sees.

Setting the yaw to `arctan(tan α · sin β)` drives phi to zero. Validation
against the study's published `lep-out.txt`, for a teaching wing at α = 11.31°
whose tip rib carries 30° of washin and lies fully horizontal:

| | published | computed |
| --- | --- | --- |
| tip phi, no yaw | 11.31° | 11.31° |
| tip chi, no yaw | 31.87° | 31.87° |
| tip phi, yaw on | 0.00° | 0.00° |
| tip chi, yaw on | 30.00° | 30.00° |

These are measured from the built 3D geometry, not from the angle formulas, so
they exercise the whole placement chain. On the default wing the worst
misalignment is about 3.8°, and the yaw removes it across the span.

### 2.15 Absolute arc semi-axes were a trap

The elliptical and bionic arcs took semi-axes in metres. Because the flat span
is laid *along* the arc, lengthening the span left the arc too short to carry
it — the model stopped building, the viewports kept showing the previous wing,
and only the status line said so. A designer sweeping span would have seen a
frozen wing and no obvious cause.

Both axes are now fractions of the flat half span, so the arc keeps its shape
at any size, and `minArrowRatio` gives the floor below which no arc is long
enough — the interface uses it to bound the control so an unbuildable arc
cannot be dialled in. The error message now names the two lengths and says
what to change.

### 2.16 Line weight, from the 2020 equilibrium revisit

The 2012 chapter's force list omits the weight of the lines; the author's
September 2020 note on the same problem lists it explicitly. It is now carried,
acting at the midpoint of the lines, and defaults to zero so the worked example
still reproduces exactly. A real lineset is roughly 0.3–0.6 kg.

### 2.17 The importer reads the Laboratori d'envol .txt format

Beyond Selig and Lednicer, the author's own tools use a variant with
single-integer header lines carrying the point count and the indices marking
the air intake. Read as Selig it still parses the coordinates, but the name is
wrong and the intake is guessed rather than read.

Checked against the published gnuLAB2 section:

| | handbook Table 2.1 | imported |
| --- | --- | --- |
| max thickness | 18 % | 18.00 % |
| at | 21.9 % | 22.0 % |
| max camber | 2.03 % | 2.03 % |
| at | 15.7 % | 15.8 % |
| intake | 1.2 – 5.5 % | 1.20 – 5.50 % |

This is the strongest end-to-end check in the suite: a real file, through the
importer, against numbers the handbook published independently. The fourth
header integer is not yet identified and is ignored.

---

## 3. Validation against production data

Nine wings from three manufacturers, in 44 line sets and six size families.

### 3.1 Cascade topology recovered from lengths alone

The Ozone and PHI sheets give a cut list and a totals matrix but never say
which branch feeds which anchor. It is recoverable: `total − upperLine` is the
path shared with neighbouring anchors, so the remainders collapse to one value
per branch.

BGD's tables **state** the topology, which makes them ground truth for that
inference. Run against the Lynx 2 M it recovers the stated branching on **all
four rows exactly**. That is the only direct check available on a method used
across every Ozone wing.

Two refinements the data forced:

- **Equal length is not the same branch.** On the Geo 7 the branch serving
  anchors 1–4 and the one serving 9–10 agree to within a millimetre. Naive
  clustering merges them into a six-anchor branch that does not exist.
  Requiring branches to serve *adjacent* anchors separates coincidence from
  real sharing.
- **Where two adjacent branches genuinely share a length**, they still merge —
  AM1 and AM2 are both 1921 mm. That is a limit of inferring from lengths, and
  `inferTopology` reports `middleLineCount` alongside `branchCount` so the
  discrepancy is visible rather than hidden.

### 3.2 Riser length, never stated, always recoverable

The totals include the riser webbing but no sheet gives its length. Since it is
the one quantity shared by every branch, solving for the value that explains
the most branches recovers it. Geo 7 MS, solved independently per row:

| row | riser | branches explained | spread |
| --- | --- | --- | --- |
| A | 527 mm | 5 | 6 mm |
| B | 529 mm | 5 | 3 mm |
| C | 514 mm | 5 | 20 mm |

Three independent solves agreeing within a few millimetres. The residual is
the loop and sewing allowance the sheets track as "Prod adj.", typically 11 mm.

### 3.3 Exact arithmetic where a maker provides it

PHI's line sheet is a cascade table rather than an inventory, and its level
lengths sum to the printed total with no residue. All **42 main-row anchors
close exactly to the millimetre** — the strongest check on cascade totals
anywhere in this project, and stronger than the Ozone sheets where riser length
had to be inferred.

Reading it needed one insight: a blank means "shared with the row above", and
the **name** columns say which line. Reading columns positionally cannot
distinguish a shared line from a level that does not exist, and gets both wrong
at the tip.

### 3.4 Structure confirmed across three manufacturers

Four anchor rows on three risers, with D cascading into C, appears in the Geo 7,
the UltraLite 5 and the Allegro X-alps — three formats, two makers, same
arrangement. The Lyght and Alpina 5 run three rows on two risers. **Rows and
risers are not the same thing**, and modelling one riser per row produces a
wing that cannot be rigged.

### 3.5 Whole-wing counts, half-wing matrices

LEP section 1 declares cells and ribs for the whole wing but its matrix
describes one half: a 60-cell wing has 61 ribs and 31 rows. Reading the
declared count as the row count is the obvious wrong turn, and it now fails
loudly rather than truncating the wing.

### 3.6 Recovering a wing's area from its own file

Integrating the planform from gnuC2-27's LEP geometry matrix gives **27.00 m²**
— and the file is named for 27 m². That single number exercises the
centimetre-to-metre conversion, the wing scale factor, and the matrix layout
together.

### 3.7 Published flight figures

BGD publishes the Lynx 2 M's performance. None of it was used in building the
model:

| quantity | published | computed |
| --- | --- | --- |
| trim speed | 39 km/h | 37.3 |
| top speed | 58 km/h | 59.6 |
| best glide | 11 | 11.2 |
| minimum sink | 1.0 m/s | 0.92 |

The top speed figure is the fastest point the derived lift curve supports, not
the end of the bar — see §5.3.

### 3.8 A manufacturer confirming isometric scaling outright

BGD is the only maker here that publishes a **linear scaling factor** per size
(0.92 → 1.08). Against the geometry it matches span ratio, √(area ratio) and
line-length ratio to **three decimal places** — a maker stating the isometric
canopy scaling this project derived from measurements.

---

## 4. Where sources disagree with each other

### 4.1 Scaling coefficients do not transfer between families

Total line length against span is affine in every family measured (R² 0.98 to
1.00), but the slope varies by a factor of 1.7: 21.5 for the Allegro light,
26.5 for the Geo 7, 36.6 for the Ultralite 5. Applying one family's fit to
another lands more than 10% out — worse than assuming nothing — so scaling is
isometric unless the module is handed laws fitted to the family in question.

Normalising by span *does* transfer: `line m per m span = −5.12·AR + 50.72`
predicts any family's total within **6.2%** with nothing fitted to it.

### 4.2 But even that has a hidden assumption

Tested out of sample on BGD — a third manufacturer, no data in the fit — the
law lands within 1% on the smallest size and **16% out on the largest**. The
error is systematic in size, and the reason is that it assumes a family's
lineset scales with **span**. Fitting the exponent per family:

| family | exponent | regime |
| --- | --- | --- |
| Ultralite 5 / Geo 7 / Allegro / Alpina / Zeno 2 | 1.02–1.30 | span |
| **BGD Lynx 2** | **2.03** | **area** |

Five makers' families scale their linesets with span; BGD scales with area.
Nothing in a wing's published numbers reveals which, so the exponent must be
fitted or taken from the maker.

### 4.3 The handbook's row shares disagree with thin-aerofoil theory at the rear

Derived from the section, anchors and angle of attack, the load split at 6° is
A 38.0 / B 24.7 / C 20.5 / D 16.8. The handbook's convention is 35/35/20/10.
A and C agree closely; the rear does not.

Thin-aerofoil theory describes a rigid surface carrying load to the trailing
edge. A paraglider's rear rows are deliberately unloaded so the C and D lines
can be made thin, which costs less drag. **The convention encodes a rigging
decision the theory does not know about**, so it remains the default, with the
derived split available for the questions the convention cannot answer.

---

## 5. Assumptions that had to be named

Three places where a model, used slightly outside its evidence, returned a
plausible number rather than a wrong-looking one.

### 5.1 Sizing on new strength rather than kinked

PHI's measured table carries two breaking loads per line. Edelrid 8000-135
falls from 160 daN new to **85.6 daN kinked**, a 47% loss; Liros TSL 140 loses
52%. A line in service is knotted at every loop and bent round every maillon,
so sizing on the new figure under-sizes by nearly half on exactly the lines a
designer wants thin. Selection uses the kinked figure.

A consequence worth knowing: ranked by kinked strength per millimetre of
diameter, **sheathed Liros beats unsheathed Dyneema** (164 vs 78 daN/mm),
because it barely loses strength when bent. On the new-strength figure the
ranking reverses.

### 5.2 Line drag taken as a constant

`cxLines` was a typed-in 0.020 from Phase 1. Computed from an actual lineset —
diameter × length, with sin²ψ for inclination — a modern thin set gives about
0.0097. The effect is not academic: glide ratio 9.37 → 11.00, with line drag
falling from 28.7% to 16.3% of total. That is most of why modern wings
out-glide the handbook's 2012 example.

### 5.3 The collapse floor, which governs top speed

Speed goes as 1/√Cz, so an accelerated polar is most sensitive to lift exactly
where a linear fit is least trustworthy. Run to the end of the bar, the derived
curve reached Cz ≈ 0.10 and the solver reported **99 km/h** on a wing that does
58.

A rigid wing can fly at Cz 0.10. A paraglider cannot: it is a pressurised
fabric structure, and the angle of attack producing that lift is at or below
where the leading edge stops being pressurised and the wing folds. That is the
frontal-collapse boundary — **structural, not aerodynamic** — and nothing in a
section polar knows about it.

It cannot be derived here, and it governs the answer at 4.8 km/h per 0.05 of
assumed floor. So it is inverted instead: the published 58 km/h implies the
wing is still flying at **Cz 0.307**, which is a physically sensible threshold
and a number a designer can compare against a prototype.

---

## 6. Load cases

### 6.1 Trim is the wrong sizing case

The chordwise split moves a long way on the speedbar. Worst tension over the
flyable range against trim: **A +0%, B +12%, C +33%, D +46%**. On the test wing
**78 of 104 lines are governed by a bar position other than trim**, and six
need thicker line than trim-only sizing would choose.

Two things the envelope has to get right. **Total load does not change** — in
steady flight the lines carry the weight whatever the speed, so the shares are
checked to still sum to one at every position. And **the sweep must stop where
the wing stops flying**: past the collapse floor the A row's share goes
negative, which is the frontal-collapse mechanism rather than a load case.

### 6.2 And symmetric flight is not the case that sizes a lineset

Certification tests to 8 g symmetrically. Lines break in collapses.

**Half the span is not half the lift.** The loading is far higher inboard, so a
tip collapse sheds much less than its span fraction suggests:

| collapsed span, from tip | lift shed | multiplier on the flying side |
| --- | --- | --- |
| 25% | 16.8% | ×1.20 |
| 50% | 41.4% | ×1.71 |
| 60% | 49.2% | ×1.97 |

An inboard collapse of the same span sheds more, because that is where the lift
is. With a 1.5 dynamic factor for the surge, a 50% asymmetric collapse gives
**×2.56**.

In a frontal collapse the A riser drops to zero and the C riser more than
doubles — and the pressure model predicts the precursor independently, since
the A row's share goes negative before anything else happens.

Sized on the full envelope rather than symmetric flight, **asymmetric collapse
governs every line**.

### 6.2.1 Which raised an obvious objection: real linesets do not break

If collapse governs every line and calls for more material than symmetric
sizing, then either the collapse model is too severe or real wings are already
built to it. Real wings survive collapses routinely, so this had to be
settled against the manufacturers' own line choices rather than argued.

Measured against the **1 g** line load, PHI's Allegro X-alps 21:

| line | type | kinked | 1 g load | implied factor |
| --- | --- | --- | --- | --- |
| C riser | U-135 | 85.6 daN | 3.0 daN | **28×** |
| A riser | PPSLS 260 | 259.4 daN | 5.3 daN | 49× |
| A middle | U-135 | 85.6 daN | 2.7 daN | 32× |
| tip D | DC40 | 41.0 daN | 0.4 daN | **108×** |

Against which:

| case | implied design factor |
| --- | --- |
| symmetric certification, 8 g × 1.5 | **12×** |
| 50% asymmetric collapse on top | **28.6×** |
| PHI's most load-critical line | **28×** |

So the collapse model is not too severe — it lands within 2% of what the
manufacturer actually built at the load-critical end. **Real linesets are
already sized to the collapse case**, which is exactly why they do not break in
one. The thing that was wrong was sizing on symmetric certification alone,
which is thinner than any line on that wing.

### 6.2.2 And most of a lineset is not load-sized at all

The spread from 28× to 108× is not inconsistency. Neither PHI nor Ozone uses
line thinner than **0.50 mm** anywhere in a complete lineset, and it is not
strength that stops them: a 0.4 mm Dyneema line is several times strong enough
for a tip D-line. Handling, abrasion and knot retention decide below that
diameter, not load.

So a model that keeps sizing downward past 0.5 mm produces a lineset nobody
would build. With the floor in place, **76 of 88 lines are floor-sized** under
symmetric loading — only twelve respond to the load case at all. Adding the
collapse case moves that to 41 load-sized, which is the mechanism by which it
changes a design.

`selectLines` reports `sizedBy: 'load' | 'floor'` per line, because the
distinction is what a designer needs: the load-sized lines are the ones that
respond to a change in the load case, and the floor-sized ones never will.

The dynamic factor remains the least defensible number in this document. It
stands in for a transient a static model cannot represent, and it is an input
rather than a buried constant for that reason — though the agreement above
suggests 1.5 is not far off.

### 6.3 Gust loads bracket the certification case

A vertical gust changes incidence by roughly `w/V`, and the resulting lift
scales with dynamic pressure. For a 25 m² wing at 95 kg with a 7.5 m/s gust:
**7.40 g at trim, 11.00 g at full speed**. The trim figure landing close to the
8 g of EN 926-1 is a useful cross-check on both. The model is sharp-edged, with
no gust alleviation, which is conservative — the right direction for a line
that has to hold.

---

## 7. Residual tolerances

Where a test does not assert machine precision, the reason:

| Check | Tolerance | Why |
| --- | --- | --- |
| Handbook glide angle, θ | 0.05° | source prints 3–4 significant figures |
| Handbook calage | 6 mm | propagates the rounded 0.624 lift factor |
| Right seam length | 10 µm | inherent method asymmetry, §2.4 |
| Seam closure gap | 0.1 mm | same |
| NACA thickness (cambered) | 0.05% chord | vertical vs perpendicular measure, §2.13 |
| NACA thickness (symmetric) | 0.005% chord | sampling resolution only |
| NACA camber position | 1% chord | 400-step scan resolution |

---

## 8. Known gaps

Not validated, because there is nothing to validate against.

- **The dynamic factor in a collapse** (§6.2). A stand-in for a transient the
  static model cannot represent. The agreement between the collapse envelope
  and real line choices in §6.2.1 suggests 1.5 is about right, but that is
  circumstantial: a different dynamic factor with a different collapse
  fraction would land in the same place. Measured line loads through a real
  collapse would settle it.
- **The practical floor is one number from two makers.** Both stop at 0.50 mm,
  which is suggestive rather than established. It may also be a fabric-era
  artefact rather than a fixed limit.
- **Gust alleviation.** The gust model is sharp-edged. A real wing's fabric and
  line stretch shed some of it, and by how much is not established here.
- **The frontal-collapse floor** (§5.3). Inverted from published speeds, never
  predicted. Predicting it needs internal pressure and rib support modelling.
- **The rear-row disagreement** (§4.3). Reconciling thin-aerofoil theory with
  the handbook convention needs measured riser loads.
- **Why BGD scales its lineset with area** (§4.2). One maker out of six; the
  only 2.5-liner in the set. Whether the hybrid layout is the cause is untested.
- **The two-liner line-length factor.** Riser count is partly collinear with
  aspect ratio in this sample — both two-liners are high-aspect wings — so the
  10% factor is an adjustment, not an independently established effect.
- **Chapter 7, diagonal ribs.** Figures only in the source; not implemented.
- **3D shaping of the leading edge.** A four-part study post-dating the
  handbook. Not implemented; it changes panel geometry near the nose.
- **Brake loads.** They come from pilot input, not the lift distribution, so
  `loads.js` applies a larger safety factor to the K row rather than computing
  anything.
- **The PHI brake block.** Parsed structurally but not decoded: it lists each
  upper line twice, plain and with the spanwise distribution added, so its
  columns do not map one-to-one onto names.
- **Section polars are estimated, not measured.** `estimateSectionPolar` is a
  correlation with no boundary-layer solution and no notion of a separation
  bubble — which is what dominates a paraglider section at the Reynolds numbers
  it actually flies. Marked `source: 'estimated'` so nothing downstream can
  mistake it for data.
