# Inspection, and the riser

## The error this corrects

For most of this project the deepest cascade level was called the **riser**.
That is wrong, and the PMA standard says so plainly:

> **Riser** — textile element between the main lines and the suspension point
> on the harness, via a connecting element.
>
> **Main lines** — lines which are attached directly to the riser connectors.

A riser is a short length of **webbing**. It runs from the karabiner up to the
maillons, and the line cascade starts above it. What the tool was calling
"riser lines" are **main lines**, and the level is now named `main`
throughout.

### Why it matters beyond naming

**Total line length includes the riser.** PMA Figure 4 defines it as the
distance from the sail at the attachment point to the inside of the riser loop
at the harness — `M = L + R`. That is exactly why some manufacturers' length
sheets include risers and some do not, and why comparing two sheets without
knowing which convention each used produces a constant offset of a few hundred
millimetres on every single line. `totalLineLength` carries `includeRisers`
explicitly and names the convention it used.

Checked against Skywalk: the SAGE 75's cascade sums to 6484 mm and its riser
is 520 mm; the published total for a1a is **7004 mm**.

**A brake's does not.** Figure 5: "the total line length bottom reference
point is the top side of the handle knot". A brake leaves the riser at a
pulley and runs to its handle; the plan's own totals had the riser added to
the brake rows like the rest, 500 mm on each.

**Risers step between sizes.** They are webbing cut to a length, not geometry
derived from the wing, so a family carries two or three riser lengths across
five sizes rather than five — 520 mm on the two small SAGEs, 540 mm on the
three large. `riserSteps` reports the steps and flags the unusual case of a
family that scales them instead.

**A riser set is more webbing than its straps.** `buildRiserWebbing` counts
three straps a side and, for the speed system, 1.6 riser lengths more: 4.78 m
for a pair of three-riser sets at the SAGE's 520 mm, of which 3.12 m is the
straps to the lines. At 20 g/m that is 96 g of webbing; the six maillons, the
pulleys and the handles are counted and not weighed.

Twenty grams a metre is an order of magnitude with two figures behind it and
neither a riser maker's — a 12 mm polyamide webbing with a Dyneema core, rated
1500 daN, is sold at 23 g/m, and the Swoop2's file takes its risers as a 5 mm
cord at 10. The function weighed its webbing as 220 g/m² of cloth 20 mm wide,
4.4 g/m; and this page gave "1.98 m of webbing and 198 g … including maillons,
pulleys and handles", from a version of it that no longer exists.

The bill of materials lists the straps to the lines — six pieces and 3.0 m on
the default wing's 500 mm risers — says that is what it counts, and does not
weigh them. `buildRiserWebbing`, `riserSteps` and `totalLineLength` are in the
model and the test suite; nothing in the interface calls them.

---

## The inspection standard as a design check

PMA Standard *Periodical Inspection of Paragliders* V 2024.12.1, written by
the manufacturers themselves, and implemented in `src/core/pma.js`.

A design tool has no business issuing airworthiness certificates. The value is
the other direction: **the standard states in numbers how far a wing may drift
before it is unairworthy**, and those numbers are a check on the design.

### Line geometry (§5.5)

```
delta = measured_length + correction_offset - reference_length
```

Measured at **5 daN** (±15%), on the total line length of every attachment
point.

The **correction offset** is the part worth understanding. A single value
applied to every measurement on the wing, brakes included, it exists because a
lineset shrinks or stretches *together* with age. A wing whose lines have all
shortened by 30 mm is not out of trim — it is uniformly shorter and flies as
designed. What matters is the **spread** around that common drift, and the
offset removes it.

| | limit |
| --- | --- |
| offset | ±1.5% of the longest reference line |
| suspension lines | Δ in [−12, +12] mm |
| brake lines | Δ in [0, +50] mm |

The brake range is **asymmetric**, and deliberately: a brake that has
shortened pulls the trailing edge down in normal flight, while one slightly
long only costs a little travel.

**The standard's worked example (Appendix A) is reproduced exactly** — all 28
deltas match Table 8, and the same eight lines are flagged: A1, A2, A3, A5 and
K1 to K4. That is ground truth written by the people who wrote the standard,
and it is a permanent test.

One note on the source: the text of Appendix A says the offset is `+38 mm`
while the header of Table 8 says `-38 mm`. The tabulated values are consistent
with **+38**, so the table header is a typo in the standard.

### How much room a design has

The room is the **range of offsets that passes**:

```
-12 - min(drift)  <=  offset  <=  +12 - max(drift)      suspension lines
  0 - min(drift)  <=  offset  <=  +50 - max(drift)      brakes
```

While that range is not empty the wing passes, and half its width is how much
further the lines could move apart. `inspectionHeadroom` returns it.

| the lines have moved | spread | offsets that pass | room left |
| --- | --- | --- | --- |
| not at all | 0 mm | −12 to +12 | 12 mm |
| 30 mm shorter, every one | 0 mm | +18 to +42 | 12 mm |
| the C row 20 mm shorter than the rest | 20 mm, 83% of the band | +8 to +12 | 2 mm |
| the C row 30 mm shorter | 30 mm | none | — |

**This function measured each line's drift against the 24 mm width of the
band, one line at a time**, so the second row of that table "used 125% of the
band" and failed. It passes with nothing used: that is what the offset is
for, and this page explained the offset correctly four paragraphs above a
function that ignored it.

### Line strength (§5.4)

```
minimum_strength_value = value_new × source_coeff × line_coeff
```

`value_new` is "the breaking strength value of a new line provided by either
the paraglider manufacturer or the line supplier": the strength **new**.

| line core | coefficient |
| --- | --- |
| Dyneema | 0.65 |
| Aramid / Technora / Vectran | 0.45 |

The coefficients are a statement about how the materials age. A used Dyneema
line must still hold **65%** of new; an aramid one only 45% — allowed to lose
more because it is expected to.

### The standard and the strength table agree, fibre by fibre

`data/reference/line-materials.tsv` gives 78 lines new and kinked. Sorted by
what each is made of (`docs/line-sets.md`, §3):

| | lines | keep, kinked | the standard asks of a used one |
| --- | --- | --- | --- |
| aramid | 48 | 38 to 70%, 53% in the middle | 45% |
| Vectran | 4 | 30 to 66% | 45% |
| Dyneema | 26 | 59 to 114%; 22 of them 85% or more | 65% |

Six of the 78 are under their own floor kinked — three aramid (U-050 at 42%,
U-070 at 44%, 7343-45 at 38%), two Vectran (30 and 31%) and one Dyneema
(DC 301 at 59%). A kink is a different test from an old line pulled straight,
and those are not failing lines; but they are the ones with nothing in hand.

**What this section used to say.** That PHI's U-135, at 160 daN new and 85.6
kinked, keeps 53.5% — "*below* the 65% a used Dyneema line must show", so
"a permanently kinked line can fail inspection while being otherwise sound",
"the strongest justification yet" for sizing on kinked strength. The U-135 is
Edelrid's 8000-U, and the 8000-U is **aramid** (a DHV test report on the
8000-U 190 gives its material). Its floor is 45%, 72 daN, and it keeps 85.6.
The model took a line's fibre from its name and had this family as Dyneema.

---

## Data exchange (§6.2.1)

The standard asks a manufacturer to hand the inspection company, "in a
computable format": the maker, model and size, the inspection interval, the
weight range, a line plan with line references, and for each line its
material, sewn length, colour, construction and "breaking strength value of
the new line" — and the total line length for every attachment point,
including the trimmer position.

Most of that list is what the design already holds, and the **PMA data sheet**
button writes it:

| | from |
| --- | --- |
| every line: reference, row, level | the line plan |
| material, and the fibre of its core | the lines the design is sized with |
| sewn length | the length chain (`docs/lengths.md`) |
| construction | the loop allowance: "a loop each end, 130 mm of line in the two" |
| strength new, coefficient, minimum | the strength table and the line's own fibre |
| total line length at 5 daN, and the lines it is made of | each line's reference length, down the path |

and marks itself `INCOMPLETE: manufacturer, size, weight range, line colours`
— the four things only a maker can say. A record missing required fields is
still produced, but says so in the file: an inspector receiving it needs to
know what is absent rather than be handed something that looks whole.

On the Swoop2 the lines are the design's own: `AR1`, Line275, sewn 3519 mm,
"a loop each end, 240 mm of line in the two", 275 daN, minimum 178.8.

### What the sheet got wrong, until it was read

The interface test pressed this button and looked at nothing it wrote. On the
default wing the file had **no material, strength or minimum on any of its
114 lines**, the flying length in the column headed sewn length, and totals as
designed — under a heading that listed "line materials and strengths" and the
length chain as missing, from a model holding both. The button passed the plan
and nothing else. And the record it builds had four errors of its own:

- **The strength published as new was the kinked strength**, and the minimum
  was 0.65 of that whatever the fibre: a fifth too low on an aramid line,
  some 7% too low on a Dyneema one. Too low is the direction that passes a
  worn line.
- **A total was the flying total plus the lineset's mean stretch, once.** A
  path is three lines and each carries the whole 5 daN; and on a line that
  flies at more than 5 daN the correction has the other sign. On the suite's
  test wing the centre A total came out 11 mm from the sum of its own lines,
  against a tolerance of 12.
- **Every C and D total was 0.62 m too long.** The brake's lower line ends at
  a pulley on the rear riser, which is where the rear mains begin, and the
  walk down the plan from a C attachment went on through it to the handle.
- **Brake totals had a riser in them**, and the Swoop2's sheet had no totals
  at all — the imported plan carries no table of them to copy.

Each is a test now, and the interface test reads both files.

**Sewn length is not cut length.** Figure 6 defines it as the distance between
the *insides of the two loops*. The cut length includes the loops. The
allowance is not one number: the tool's default is 130 mm a line; the UP
sheets that state theirs give 130 mm on the top lines and 200, 260 and 300 mm
further down (Meru 2, Summit X, Torre), or 140 to 300 (Makalu 5), or 200 and
260 (K2 5); and the Swoop2's program cuts 240 mm over on its main lines and
200 on the rest.

---

## The check, against a real wing at last

`lineGeometryCheck` implements the PMA's own inspection: it searches for the
correction offset that brings the most lines inside tolerance and flags what
is left. It had been tested against the standard's **worked example** and
never against a wing anyone had built.

The Enzo 3 sheets are six sizes of a manufacturer's own inspection record —
reference length, specimen as measured, and the difference — so the model can
be run on the thing it was written for.

| size | lines | correction offset | out of tolerance |
| --- | --- | --- | --- |
| XXS | 59 | 0 mm | 0 |
| XS | 59 | 0 mm | 0 |
| S | 59 | 0 mm | 0 |
| MS | 59 | 0 mm | 0 |
| ML | 59 | 0 mm | 0 |
| L | 59 | **2 mm** | 0 |

All six pass, against an offset limit of 118 mm the standard would allow. A
correction offset of essentially zero says the wing is built to its own
numbers rather than needing an allowance to pass — and the one size that
needed 2 mm is the one carrying the 14 mm outlier, which is the mechanism
working rather than a coincidence.

## Running it on a design

A design has no built wing to measure. What it has is each attachment point's
reference length, and an expectation of how the lines will move
(`docs/line-sets.md`, §3): Dyneema shrinks as it settles in, over the first
20 to 50 hours, and the lines that carry least stay short; aramid holds its
length. So the **Inspection check** button forecasts the first inspection —
where each attachment point is expected to be at 50 hours and at the end of
the set's life, put through the standard's own check.

On the default wing, sized almost wholly in a 0.5 mm Dyneema line:

| | suspension points | the brakes | one offset passes? |
| --- | --- | --- | --- |
| as designed | on their references | on theirs | yes |
| at 50 hours | 22 mm apart, 93% of the band | 28 mm short of the A lines | no — the brakes need +28 mm at least, the A lines +12 at most |
| at 200 hours | 24 mm apart | 31 mm short | no |

and on the Swoop2, in its own sheathed Dyneema: 14 mm apart at 50 hours, the
brakes 24 mm short, and the same answer.

Read it for what it is. **No wing has been measured, and the file says so in
its first line.** The directions are the makers' own account; the sizes are
this tool's estimates, held to a supplier's bound and two statements of how
long settling takes. And a lineset that needs adjusting at its first check is
not a failed design — a service workshop puts the adjustment "after 25 hours
flying, as the lineset settles in". What the forecast adds is which lines, and
roughly how far: here the brakes first, which carry nothing in trimmed flight
and so keep all of their shrinkage, and then the stabilo and the outer D
lines.

### The button test earned its keep, and then did not

The first version read `l.referenceMM`. The field is `referenceLengthMM`, so
every line came through as `null` and the check failed reading a property of
null. Pressing the button found that.

It did not find the second wrong name, because that one threw nothing. The
file ended every row with **NO** in the column headed `within` — 114 of 114
lines, each with a delta of zero — under a heading that said "passes, 0
line(s) out of tolerance". The rows carry `withinTolerance` and the button
read `within`. The test pressed it in every sweep and never opened the file;
and the file compared the plan with itself, which this page described as
"stated in the file it writes" when the file said nothing of the kind.

The test reads the file now: every row's verdict against its own numbers, and
the heading against the rows.
