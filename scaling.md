# Size families and scaling

Manufacturers ship a wing in five or six sizes. This is what the measured data
says about how a family is actually related — and where the obvious assumption
fails.

Reference: PHI **ALLEGRO light**, six sizes from 17 to 24 m², in
`data/reference/phi-allegro-light-sizes.tsv`.

---

## 1. The canopy is scaled. Everything attached to it is not.

Fitted across the six sizes, against the span ratio:

| quantity | exponent | reading |
| --- | --- | --- |
| flat area | 1.99 | isometric |
| projected area | 1.96 | isometric |
| maximum chord | 1.02 | isometric |
| minimum chord | 0.96 | isometric |
| **aspect ratio** | — | **constant at 6.03**, spread 0.009 across all six |

So the canopy really is one shape scaled: chord distribution, arc and washin
all carry over, and only a single factor `k = sqrt(areaRatio)` is needed.

The attached parts do not follow:

| quantity | law | R² |
| --- | --- | --- |
| line length | `0.566 × span + 0.459 m` | 0.995 |
| total line length | `21.46 × span − 5.54 m` | 0.983 |
| wing mass | `0.159 × projected area + 0.293 kg` | 0.987 |

All three are **affine, not proportional**. Each has a fixed component that
does not scale — lines are set partly by pilot geometry and handling rather
than by wing size, and mass carries fixed hardware. Scaling a design
isometrically therefore gives lines that are slightly too long on the big
sizes and too short on the small ones.

---

## 2. The limit, which is easy to miss

Fitted to all six sizes, the line-length law is within **0.6%** everywhere.

Fitted to only the three smallest and used to predict the three largest, it
lands **1.83%** out — *worse* than plain isometric scaling at 1.47%.

The reason is the intercept. Over a short baseline the split between the fixed
and the scaling part of a length is poorly determined, and extrapolating
amplifies that error. Isometric scaling has no free parameter to get wrong.
Mass is worse still: 5.9% out on the same test.

So the affine laws are **for interpolation within a measured family**.
`scaleToArea` checks whether the target sits inside the fitted range and falls
back to isometric scaling outside it, rather than trusting a law it cannot
support. Both behaviours are asserted, including the one that says the affine
extrapolation is the worse of the two.

| | method | line-length error |
| --- | --- | --- |
| inside the fitted range | affine | 0.21% |
| outside, falling back | isometric | 1.47% |
| outside, forced affine | affine | 1.83% |

---

## 3. Wing loading is a decision, not a law

A family is not one wing in several sizes. Taking the middle of each certified
weight range:

| size | projected area | mid weight | loading |
| --- | --- | --- | --- |
| XS | 17.49 m² | 62.5 kg | 3.57 kg/m² |
| S | 18.91 | 75.0 | 3.97 |
| M | 20.40 | 85.0 | 4.17 |
| ML | 21.40 | 93.0 | 4.35 |
| L | 22.44 | 100.0 | 4.46 |
| XL | 24.48 | 117.5 | **4.80** |

Loading rises 34% from the smallest size to the largest. Bigger sizes are
flown proportionally heavier, so they fly faster and behave differently — the
sizes in a family are related wings, not interchangeable ones. Anything that
assumes constant loading across a family (a polar, a speed estimate, a load
case) needs the size's own figure.

---

## 4. Cross-family check: the form transfers, the coefficients do not

The laws above were fitted to one family. Checked against two more — Ozone
**Geo 7** (5 sizes) and **Ultralite 5** (7 sizes), spanning 12.9 to 29 m² and
aspect ratios from 4.56 to 6.03:

**Canopy isometry holds everywhere.** Flat-area exponent against span ratio:
1.99 (PHI), 2.00 (Geo 7), 2.08 (Ultralite 5), with aspect ratio held constant
within each family. A single scale factor for the planform is legitimate for
all three.

**The affine form holds everywhere.** Total line length against span:

| family | slope | intercept | R² |
| --- | --- | --- | --- |
| PHI Allegro light | 21.46 | −5.54 | 0.983 |
| Ozone Geo 7 | 26.54 | −40.93 | 0.991 |
| Ozone Ultralite 5 | 36.64 | −76.93 | 0.997 |

Mass against projected area:

| family | slope | intercept | R² |
| --- | --- | --- | --- |
| PHI Allegro light | 0.1588 | +0.2926 | 0.987 |
| Ozone Geo 7 | 0.1270 | +0.9639 | 0.974 |
| Ozone Ultralite 5 | 0.0927 | +0.3871 | 0.999 |

**But the coefficients vary by a factor of about 1.7.** They depend on how
many lines a wing carries, how deep its cascade runs and how it is built — not
on size alone. The Ultralite 5 has 258 line pieces against the Geo 7's 224 and
is a much smaller wing, so its total line length climbs far faster with span.

### The correction this forced

The previous version shipped one family's fit as `DEFAULT_SCALING` and applied
it to anything. That was wrong. Borrowing another family's laws lands more
than 10% out — worse than assuming nothing.

So:

- `scaleToArea` now **scales isometrically unless handed laws fitted to the
  family being scaled**, and reports which it used.
- The PHI fit is renamed `EXAMPLE_SCALING` and documented as a worked example,
  not a default.
- `crossFamilyError` exists to make the non-transferability measurable rather
  than a claim.

Fit your own family with `fitScalingFamily`. Within a family the fitted laws
interpolate to better than 3% on all three.

### A measurement note

Aspect ratio is taken from the maker's published figure where there is one.
Recomputing it from published span and area looks inconsistent even when the
maker holds it fixed: Ozone states 4.56 for all seven Ultralite 5 sizes, but
span and area quoted to one decimal compute anywhere from 4.52 to 4.60. That
spread is rounding, not design, and a fit that treats it as real will reject a
perfectly regular family.

---

## 5. What this does not cover

- **Per-family fitting is required.** Three families are now measured and the
  coefficients demonstrably do not transfer. `fitScalingFamily` exists so a
  user fits their own; without one, scaling is isometric.
- **Cell count is held constant** within each family measured — 72, 48 and 34
  respectively — so cell width scales with the wing. Some makers change cell count between sizes,
  which breaks isometry of the panel work.
- **Riser length steps rather than scales** — 570 mm on the two smallest,
  600 mm on the rest — and the speed system travel likewise (150/180 mm).
  Hardware comes in discrete sizes and is not a scaling law at all.
- **Line diameters** are not scaled here. Loads scale with `k²` while a line's
  strength scales with its area, so a family's linesets are not similar
  either; sizing each from its own loads is the right approach and is what
  `loads.js` does.
