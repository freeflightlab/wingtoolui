# The reference wings, against what they claim

`size-families.tsv` is what this project measures everything against, and the
tool loads wings from it as starting points. Two errors in that path went
unnoticed for several rounds because every check was internally consistent.

## Every reference wing had twice its cells

A manufacturer publishes the **total** cell count. `S.cells` counts **one
side** — the slider says "Full cells each side" — and the LEP export writes the
whole wing's count from it.

The picker bridged the two with:

```js
S.cells = Math.max(8, Math.min(60, Math.round(r.cells / 2) * 2));
```

which rounds to the nearest even number and halves nothing. The `* 2` undoes
the `/ 2`.

| wing | published | built |
| --- | --- | --- |
| Ozone Ultralite 5 | 34 | **68** |
| Ozone Geo 7 | 48 | **96** |
| Ozone Zeno 2 | 78 | **120** (clamped) |
| PHI Allegro light | 72 | **120** (clamped) |

The clamp at 60 per half made it worse than a doubling: four different wings
came out with identical cell counts.

Rib spacing follows the cell count and everything built on the ribs follows
the spacing — panel widths, diagonal sizes, anchor positions. Every reference
wing in the tool was a different wing from the one on the box.

### Why nothing caught it

Every check was internally consistent. The tool agreed with itself all the way
down: 34 half-cells really did give 35 ribs, which really did give 68 panels,
which really did give the right fabric area for a 68-cell wing.

The reference-set check added the same session compared `size-families.tsv`
against the manufacturers' published tables and found **zero disagreements** —
because the data file was right. The error was in reading it.

A check that the built wing has its published cell count is now in the
interface test, verified by restoring the old expression:

```
FAIL Ozone Ultralite 5 17 builds 68 cells; published is 34
```

### The conventions, pinned

Because one was wrong, all of them are now asserted:

| quantity | covers |
| --- | --- |
| span, area | the whole wing |
| ribs, panels, line plan | one half |
| bill of materials | the whole wing, doubled back up |

The bill was checked and is correct — a builder is not ordering half the
cloth.

---

## An odd number of cells cannot be built

Having fixed the doubling, I built every reference wing and compared it with
its published figures end to end, rather than checking components that agree
with each other. That found a second problem.

**The Alpina 5 and the Lynx 2 have 65 cells.** An odd total means a cell
straddles the centreline — a centre *cell*, not a centre rib. The parametric
model always puts a rib at station 0, so it can only build even totals, and it
was quietly building 66 and calling it an Alpina 5.

The LEP format carries the distinction as `centreRib`, and the Swoop2 uses it
(50 cells, centre rib true). The parametric path has no equivalent.

**It is built now.** `centreRib: false` puts no rib on the centreline: the
innermost rib sits half a cell out, and the cell between it and its mirror
straddles the line. `cells` counts the full cells outboard of the centre, so
65 is 32 each side plus the one in the middle.

The Alpina 5 and the Lynx 2 now build their published 65.

### The centre cell is a piece of cloth

Development walks consecutive ribs, and a cell that straddles the centreline
belongs to neither half — so it was missed entirely. A 65-cell wing came out
with 64 cells' worth of panels and nothing said so, which leaves a builder
**two panels short of a wing**.

It is developed against the mirror of the innermost rib. The result is
symmetric about the centreline to machine precision, as wide as the cell
beside it, and closes as flat as any other panel.

| | centre rib | centre cell |
| --- | --- | --- |
| ribs on the half | 33 | 33 |
| innermost station | 0.0000 m | 0.1052 m |
| cells across the wing | 64 | **65** |
| cloth pieces | 128 | **130** |

### The rest of the end-to-end audit

Every published size, built and compared — the 38 in `size-families.tsv` and
Niviuk's 17 in `niviuk-spec.tsv`:

| | |
| --- | --- |
| span | **exact** on all 55 |
| cell count | **exact** on all 55; the eleven odd ones are built with a centre cell |
| flat area | within ±0.008% |
| aspect ratio | −2.4 to +0.8% |

The area is exact because it is not left to the outline. A specification gives
span, area and root chord, and with the shape defaults fixed the tip chord is
the one free dimension, so it is solved to the published area. The picker did
this and the core path did not: `referenceDesignInputs` took the tip at 22% of
the root, and the full-pipeline validation ran every wing 1.1 to 4.1% short of
its published area (6.9% on a Skin 4 P 14). Both solve it now, in one place, and
build the same outline.

The aspect ratio is not the planform's error either. The wing built has the
published span and the published area, so its aspect ratio is the published
span squared over the published area, and that is what differs from the
published aspect ratio — by the maker's own rounding. The worst is the Lynx 2
ML: 12.3² / 25.0 = 6.05, published as 6.2. Niviuk's figures agree with
themselves to 0.1%.

The shape is still the tool's: sweep, ellipticity, section and washin are
defaults, and the picker's note says so. The arc is not, below.

### The arc is an ellipse through the projected span

Every published wing was built on a circle through its projected span. A
circle curves the middle of the wing, where the chord is, as much as its tip,
and the published projected area — which checks the arc independently of the
span it was built through — says real wings are not shaped that way:

| through the published projected span | projected area against published, 55 sizes |
| --- | --- |
| a circle | 2.0% out on average, −3.7 to +0.4%, short on 51 |
| the handbook's ellipse (3.1(c)), its tip where the quarter ends | 1.0% out on average, −2.0 to +2.1% |

The ellipse is the nearer on 45 of the 55. The circle is the nearer only on
the Artik R 2, by a tenth of a percent, and the Skin 4 P, a single-surface wing
this tool builds with a lower surface it does not have. The line totals say
the same thing from the other side (`docs/drawn-line-plans.md`, section 5).
So the picker and the full pipeline build a published wing on that ellipse
(`ellipseForProjectedRatio`); the circle stays under Arc for a designer who
wants it.

**Niviuk's projected span** is not published. Their projected area and
projected aspect ratio are, and the two define it, b = √(AR·S): 9.07 m on a
Hook 6 24. The area ratio had stood in for the span ratio, 0.858 against
0.805, so every Niviuk wing was built a twentieth flatter than its own figures
say. Their aspect ratios are in `niviuk-spec.tsv` now (`proj_AR`, as printed:
4 on the Hook 6, 5.02 on the Artik R 2, 3.93 on the Skin 4 P, 4.12 on the Bi
Skin 2 P), and `referenceDesignInputs` says which span it used
(`projectedSpanBasis`).

### What a maker does not publish

`published-specs.tsv` covers 23 sizes across four families: **138 published
figures — cells, flat area, flat span, flat aspect ratio, root chord and
projected area on every size — and zero disagreements.**

A dash means the maker does not publish that figure. BGD publish a centre
chord, a total line length, a line height and a linear scaling factor for each
size; Ozone publish none of the last three for the other three families (18
sizes), so those 54 cells are dashes and the suite asserts exactly that
number.

This section used to say BGD did not publish a root chord, that I had filled
the five in from area and span, and that the check then compared my
arithmetic with an estimate. It had that backwards. The five chords in
`size-families.tsv` are BGD's published centre chord, and the disagreement
the check reported was my arithmetic against a published number. The data
file's header now says so, and the suite holds the two to each other.

The lesson stands with the right example: a cross-check that compares a guess
with anything reads like evidence. What makes it evidence is knowing which
side was published.

### The centre cell through the pipeline

A feature that works in isolation is not one that works downstream. The centre
cell is nested with everything else, paid for in the bill, reaches the cutting
file, leaves the rib count untouched and carries a line plan — asserted, not
assumed, because the missing centre panel was exactly that kind of gap.

---

## The complete design was not in the picker

The Swoop2 was loadable from a button in the **Files** panel, while the
control that says *"Start from a published wing"* offered 55 specifications
and not the one complete design in the library.

Somebody looking for a wing to start from would never have found it.

It is the first entry in the picker now. Every other entry gives a **size**
and leaves the shape to defaults — a specification does not say how elliptical
a leading edge is or what section a wing uses. The Swoop2 brings its own ribs,
its own aerofoils and its own line plan, so it takes the import path instead:

> Swoop2: a complete design from Laboratori d'envol — 50 cells, 51 ribs, 90
> lines a side as its program computes them. The planform, arc and section
> sliders do not apply to it. Not reproduced: 70 straps between adjacent ribs,
> 15 pieces between two ribs (section 12).

The last sentence is the part of section 12 the tool reads and does not build:
it places the file's 39 diagonals where the file puts them, and lists the
straps and the pieces between two ribs rather than inventing a shape for them.

Choosing any specification afterwards clears the imported geometry, or the
tool would show a Geo 7 built out of Swoop2 ribs. That is asserted, because
nothing else would have noticed.

The hint under the picker also claimed *"Seven families"* when there were
eleven — it counts them now rather than stating a number that was true once.

### A check that could not fail, again

My first version of the picker test read `globalThis.__selects`, which does
not exist. `sel` was null, the condition short-circuited, and the check could
never have failed.

The replacement walks the created-node registry for an `<option>` carrying the
id — and the first attempt at THAT read `n.tag` where the stub's field is
`n.tagName`, so it found no options at all. It only showed up because the walk
has a guard that fails when it finds nothing.

Both are verified by removing the option and watching the check fail:

```
FAIL the Swoop2 is not an option in the wing picker
```
