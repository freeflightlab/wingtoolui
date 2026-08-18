# Validation notes

What was checked, how, and where this implementation knowingly differs from the
published handbook. Every claim here corresponds to a test in
`tests/run-tests.js`.

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

---

## 3. Residual tolerances

Where a test does not assert machine precision, the reason:

| Check | Tolerance | Why |
| --- | --- | --- |
| Handbook glide angle, θ | 0.05° | source prints 3–4 significant figures |
| Handbook calage | 6 mm | propagates the rounded 0.624 lift factor |
| Right seam length | 10 µm | inherent method asymmetry, §2.4 |
| Seam closure gap | 0.1 mm | same |
| NACA thickness/camber | 0.3% chord | cosine sampling resolution |

---

## 4. Known gaps

Not yet validated, because the source does not give enough to validate against:

- **Chapter 7, diagonal ribs** — figures only in the source; not implemented.
- **Chapter 8.3/8.4, line elasticity and loads** — marked as unwritten in the
  source. The cascade geometry is implemented; load distribution is not.
- **Chapter 9, risers and speed system** — not implemented.
- **Chapter 10, materials** — a list of names in the source, no data.
- **Ovalization transition percentages** — the table in 6.4 is used as the
  default, but the source says these must be adapted per model, and gives no
  method for doing so.
- **Nesting** — the packer is a bottom-left-fill heuristic reaching about 42%
  utilisation on the default wing. Better is achievable; see the roadmap.
