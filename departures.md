# Departures from the source

Every place the implementation differs from the Laboratori d'Envol handbook,
what the handbook says, what the code does instead, and why. The companion to
`docs/validation.md`, which covers how the maths is checked.

A departure is only listed here once it has been measured. "The handbook is
wrong" is not a finding; "the handbook gives X, the measurement gives Y, and
here is the difference it makes" is.

### 1 The arc-length formulas in chapter 6 have typographic errors

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

### 2 The chapter 5 FORTRAN uses `atan` where `atan2` is needed

The reference subroutine carries the running seam angle forward with:

```fortran
theta = atan((r2y(i)-l2y(i))/(r2x(i)-l2x(i)))
```

`atan` returns a value in (−π/2, π/2) and cannot recover the quadrant, so the
panel flips whenever the step direction crosses vertical. On the strongly arced
wings the handbook itself recommends for high aspect ratios, that happens.
This implementation uses `atan2` on the separated components. Results are
identical everywhere the original was well behaved.

### 3 The chapter 5 algebra is ill-conditioned for closely spaced ribs

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

### 3.1 The distortion measure was tautological

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

### 4 The method is not symmetric between the two ribs — this is inherent

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

### 5 The 4.4 spreadsheet omits two moment terms

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

### 6 The sheet's 3D lift factor does not follow from its own inputs

The example prints a finite-span correction of **0.624**. Lifting-line theory
with the sheet's own aspect ratio (4.09) and Oswald factor (0.90) gives 0.648;
0.624 corresponds to e ≈ 0.80. Legacy mode uses the printed 0.624 so the rest
of the sheet reproduces; the default derives the factor from the actual aspect
ratio and Oswald factor. `lift3DOverride` exposes the same escape hatch for
matching a wing against measured data.

### 7 Induced drag uses the 2D lift coefficient in the example

Formula [6] is `Cxi = Cz²(α)/(π·λ·e)`, and the worked example feeds the **2D**
`Cz` of 0.900 into it rather than the corrected 0.562 — which is what makes its
printed `Cxi` of 0.070 and `CxT` of 0.114 come out. Legacy mode preserves that;
the default uses the corrected value, which is the more defensible reading of
the surrounding text.

### 8 The NACA generator needed a closed trailing edge

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

### 9 Two airfoil file formats, and one of them breaks a naive reader

Coordinate files come in **Selig** order (one loop, TE → upper → LE → lower →
TE) and **Lednicer** order (a line of two *counts*, then upper LE→TE, then
lower LE→TE). Read naively, the Lednicer count line parses as a coordinate
pair, and a point at x=61 drags the unit-chord normalisation out by a factor
of sixty — silently, producing a plausible-looking but wrong section. The
importer now distinguishes them: no real normalised ordinate exceeds about
1.5, so a leading pair of integers above that is a header.

### 10 The DXF claimed R12 but was not R12

The writer emitted `LWPOLYLINE`, an entity introduced with R13/2000. A file
declaring `AC1009` and then using it is rejected by strict readers and by some
cutting-table software — which is precisely the equipment this output exists
for. Polylines are now written the R12 way (`POLYLINE` / `VERTEX` / `SEQEND`),
with a minimal `HEADER` declaring `$ACADVER = AC1009` and `$INSUNITS = 6`
(metres). Validated by a group-code parser that checks pair structure, section
nesting, POLYLINE/SEQEND balance, vertex coordinates and entity whitelist.

### 11 Rib patterns were drawn on top of each other

Every rib's flat pattern spans a similar chordwise range and is centred on its
own chord line, so exporting them in place stacked all 25 into one blot — a
file that looks plausible on screen and cannot be cut from. Ribs are now laid
out in a column with a gap and labelled with station, chord and washin.

### 12 The simplified method (4.5) had an underived formula

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

### 13 Thickness is measured vertically, not perpendicular

`airfoilMetrics` reports maximum thickness as the vertical gap between the
surfaces at a given chord station, because that is what a chord-referenced
percentage like the handbook's Table 2.1 means. Since NACA thickness is
applied *perpendicular* to the camber line, a cambered section measures
slightly thick this way — 15.016% for a nominal 15% at 4% camber, about 0.11%
relative. Symmetric sections measure exactly. Tolerances are set just above
the real discrepancy rather than loose enough to hide an error.

### 14 Chapter 3.4 is superseded by the author's 2021 rotation study

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

### 15 Absolute arc semi-axes were a trap

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

### 16 Line weight, from the 2020 equilibrium revisit

The 2012 chapter's force list omits the weight of the lines; the author's
September 2020 note on the same problem lists it explicitly. It is now carried,
acting at the midpoint of the lines, and defaults to zero so the worked example
still reproduces exactly. A real lineset is roughly 0.3–0.6 kg.

### 17 The importer reads the Laboratori d'envol .txt format

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

### 3.2 An invariance the audit turned up

Sweeping every metric against its inputs asked whether **phi**, the angle
between a rib's plane and the glide path, responds to washin. It does not —
4.831 degrees either side of a nine-fold change.

That is correct, and it is the distinction between a dead metric and a real
one. Washin rotates a rib about the spanwise axis, which is to say *within its
own plane*; it cannot change where that plane points. What responds to washin
is **chi**, the angle between the chord and the glide path, and it does.

Both are now pinned: phi invariant under washin to machine precision, chi
responsive to it. The invariance is the more useful of the two, because it is
the kind of property that silently breaks when a rotation order is changed.

---

---

### 25 Billow is taken as a flat 6% where it follows from pressure

`applyOvalization` takes the billow as a flat 6%, applied uniformly with a
chordwise shape profile bolted on. That is one of the oldest assumptions in
this project, and it is not how a sail behaves.

#### The physics

A strip of fabric between two ribs, with a pressure difference across it,
takes up a circular arc. The membrane balance is

```
R = T / dp                       h = R - sqrt(R^2 - (s/2)^2)
```

with `T` the tension per unit length of cloth, `dp` the pressure difference
and `s` the rib spacing. The extra cloth the arc needs is the difference
between arc length and chord.

Three things fall out that a flat percentage cannot give:

- **Billow varies along the chord**, because `dp` does — the suction peak near
  the leading edge pulls far harder than the trailing edge.
- **Billow grows with the square of rib spacing.** Doubling the spacing
  quadruples the excess (measured: 4.05x), so a wing with fewer cells bulges
  disproportionately more.
- **It scales with flight state**, through dynamic pressure.

#### What the flat 6% actually assumes

The inversion is the useful direction, because 6% is what this project and the
handbook have both been using and nobody had asked what it implies. At 300 Pa:

| spacing | implied radius | implied tension | bulge height |
| --- | --- | --- | --- |
| 0.20 m | 0.180 m | 54 N/m | 30 mm (15% of spacing) |
| 0.30 m | 0.270 m | 81 N/m | 45 mm (15%) |
| 0.40 m | 0.361 m | 108 N/m | 61 mm (15%) |
| 0.50 m | 0.451 m | 135 N/m | 76 mm (15%) |

**The bulge height stays at exactly 15% of the spacing while the implied
tension rises in proportion to it.** So the flat 6% is a constant *shape*, not
a constant tension — it silently assumes the cloth pulls harder on a wing with
fewer cells. That may even be roughly true, since fewer cells means more load
per rib, but it was never a stated assumption and it had never been checked.

Both directions are asserted, and the inversion round-trips through the
forward model to 1e-7.

#### Wired into the cutter

The model is now what `applyOvalization` uses when given a `pressure` option,
so panels are cut to the shape the air will make. The flat amount remains the
default, so nothing that was working changes.

The rib spacing the membrane equation needs is **not a separate input**: the
panel width at each station *is* the local spacing, so it comes from the panel
itself and varies along the chord as it should.

| | flat 6% | from pressure |
| --- | --- | --- |
| peak billow | 13% chord | **9% chord** |
| mean excess | 5.01% | 0.80% |
| at the LE seam | 0 | 0 |
| responds to speed | no | 0.19% at 200 Pa, 4.13% at 800 |

**One thing the first version got wrong.** Applied on its own, the pressure
model put its peak at *0% chord*, because that is where suction peaks. But the
panel is seamed at the leading edge and again at the trailing edge, so the
cloth is held there and cannot bulge however hard the air pulls. The existing
transition profile encodes exactly that boundary condition, and bypassing it
produced a physically impossible shape. Pressure now sets the magnitude and
the transitions still set the boundaries — both asserted.

#### Degenerate cases

No pressure gives flat, not an infinite radius. A tension too low to span the
ribs against the pressure is reported as `overLimit` rather than returning a
bulge past a half-circle. An excess no arc can reach is refused with the
maximum that is reachable.
