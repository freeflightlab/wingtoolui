# Construction detail

Phase 3: the parts of a wing that are neither aerodynamic surface nor line.

---

## 1. Rib lightening holes

A rib does two jobs — holds the section shape, and carries line load from its
anchors up into the sail. Most of its area does neither, and every production
wing cuts that area away. The rib view built earlier showed a solid rib, which
no real wing has.

**The interesting part is not the holes but what has to stay.**

| constraint | why |
| --- | --- |
| margin at both surfaces | the rib is sewn along its whole length; cut close to the seam and it tears out along the stitch line |
| band at the leading edge | highest pressure, sharpest curvature, and usually a mylar reinforcement |
| clearance at every anchor | the material above an anchor is the load path to the sail — a hole across it is how a rib fails at its tabs |
| web between holes | two holes a few millimetres apart are one hole with a decorative strip through it |

So holes are placed **into the space that remains** after those are
subtracted, rather than placed and checked afterwards. A check that fails
leaves the designer with nothing; a constrained placement always yields
something buildable.

On the test wing's root rib: three holes, **31% of the rib removed**, minimum
web 10% of chord. Across the wing, rib cloth falls from 551 g to 382 g.

`checkRibHoles` verifies the rules independently of the code that enforces
them. It should always pass — that is the point. It is a guard against a
future change to the placement quietly starting to cut through a load path.

Tightening a rule must remove *less* material, and both the surface margin and
the anchor clearance are asserted to do so. A rib with anchors everywhere has
nowhere left to cut, and yields few or no holes rather than holes across every
load path.

---

## 2. Bill of materials

Everything the construction side produces, totalled into what has to be
bought. This is where estimates that looked harmless in isolation get added
up, so it is where their honesty matters.

**Fabric is bought by the roll, not by area.** Nesting decides how much of a
roll a set of panels consumes, and the offcut is paid for whether or not it is
used. On the test wing: 46.6 m² sewn, but **69.1 m of 1.4 m roll ordered** at
48% utilisation. A bill quoting panel area understates the order by more than
the panels themselves.

**Line is bought by cut length.** The loop allowance is real material and
fixed per line, so a bill built from finished lengths is short by about 13%. A
bill supplied without it says so rather than quietly omitting it.

**Rib cloth is not negligible** — the third fabric item after the two sail
surfaces.

A worked example, 22 m² wing:

```
FABRIC   sail 69.1 m of roll, 46.6 m2 sewn, 1679 g
         rib cloth 11.4 m2, 455 g  (31% removed as holes)
         diagonals 8.6 m of roll, 5.4 m2, 171 g
LINE     DC40 246 m / DC100 44 m / PPSLS 180 18 m / DC60 8 m
TOTALS   cloth 2305 g + line 93 g = 2.398 kg
```

Against a finished weight of 3.5–4.5 kg for a wing this size, which is the
right shape: **the bill counts cloth and line only**. Reinforcement, rods,
risers, tapes and thread are not counted, and the text says so at the bottom
of every bill rather than leaving the total to be read as a wing weight.

Inputs are optional, and what is missing is **reported as missing** rather
than treated as zero — a bill that silently omits the lines looks identical to
one for a wing that has none.

---

## 3. Cross-ports

A lightening hole is sized by what can be removed. **A cross-port is sized by
what has to pass through it**, which makes it a different problem wearing the
same clothes.

Only some ribs face a cell opening; the closed ribs behind a diagonal are fed
entirely through their neighbours. If that path is too restricted the wing
inflates unevenly on launch and re-inflates slowly after a collapse — which is
when it matters.

Treating the port as an orifice:

```
A_required = V_cell / (Cd · v · t)        v = sqrt(2·dp/rho)
```

For the test wing's root cell — 0.28 m³, 63 Pa internal, 10.1 m/s flow — that
is **293 cm² to fill in 1.5 s**. The tip cell needs 3 cm².

The relationships are what the estimate is for, and each is asserted: halving
the target time doubles the area, twice the volume needs twice the area, and
flying faster needs *less* because pressure drives the flow.

**An unmeetable requirement is reported, not met.** Ask for 0.02 s and the
space cannot hold it; the tool cuts the largest ports the margins allow and
says how much it is short, rather than cutting an undersized port and calling
it done.

This is a first-order estimate and says so: it ignores duct losses, the fact
that flow crosses several ribs in series, and the changing volume as a cell
fills.

---

## 4. Reinforcement, and the mass gap

The bill counts cloth and line and says so at the bottom of every printout.
On a 25 m² wing it comes to 2.4 kg against a finished weight near 4 kg, and
reinforcement is the largest single item in that gap.

It is *placed*, not calculated — a designer decides where a wing needs help,
and the rules are conventions rather than derivations. What can be done
honestly is to place it consistently and let the mass appear where the
omission currently is.

| item | job | mass |
| --- | --- | --- |
| Mylar at the intakes | holds the nose against the highest pressure on the wing | 80 g |
| Dacron at the anchors | spreads a point load that would tear ripstop | 38 g |
| Trailing edge tape | sewn, loaded along its length, handled every flight | 13 g |

Only the first two are structural. The others are wear and handling, which is
why a light wing drops them first — and the generator lets it, with `fitMylar`
and friends.

Anchor patches are counted **from the line plan**, not from a guess at rows
per rib, so changing the rigging changes the order.

### Rods

The largest single item in the gap, and the one a light wing feels most. A rod
holds the leading edge open so the wing keeps its intake shape at low angles
and reinflates cleanly after a collapse.

Two things the model gets right that a back-of-envelope estimate does not.

**A rod follows the rib's surface, not the chord.** Its length is an arc along
the profile, and on a cambered nose that is **8.3% longer** than a chord
fraction times the chord — small, and exactly the size of error a mass budget
accumulates over a hundred rods.

**Mass goes as the square of diameter**, so this is the trade worth seeing:

| | nylon | carbon |
| --- | --- | --- |
| 1.0 mm | 46 g | 58 g |
| 1.3 mm | 66 g | 86 g |
| 1.6 mm | 91 g | 121 g |

Closed ribs — those behind a diagonal, facing no cell opening — take a shorter
rod, since they have less nose shape to hold.

### The gap is the output

`massBudget` compares against a published weight:

```
cloth 2305 g + line 93 g + reinforcement 130 g + rods 66 g = 2.594 kg
gap 1406 g (35%) — thread, risers and hardware webbing, the bag
```

Counting rods removes them from the list of what is missing, so the remainder
is always what is *genuinely* still unmodelled rather than a fixed disclaimer.

The useful number is not the total but what the model **cannot yet see**, and
how big it is. Given no published weight it reports no gap rather than
inventing a target.

---

## 5. Registration marks

The panels exported as bare outlines. A cutter can cut those; a sewer cannot
assemble them, because nothing says which panel is which, which way up it
goes, or where along a two-metre seam any given point belongs.

### Notches are not decoration

Two panels are joined along seams that are **not the same length**. Before
ovalization they match to six microns — the development shares the rib curve
between them. Ovalization then widens each panel about its own centreline,
lengthening its outer seam and shortening its inner one, so the seams that
actually get sewn together differ by up to **31 mm over two metres**.

That is not an error. It is the ease that lets flat cloth take a curved shape,
and it has to be *distributed* rather than run out at one end. A sewer working
it by eye over two metres will not get it even, and the wing will pull.

The rule that makes notches work: **they pair at equal fractions of each
seam's own length, not at equal distances.** Marking both seams every 250 mm
puts the last notch of the longer seam 31 mm past its partner and leaves the
whole discrepancy in the final segment. At equal fractions, 31 mm over a seam
becomes **3.9 mm per segment**, which is what a sewer can actually work in.

### Two bugs the checks caught

**Notch counts were derived per panel**, so neighbours could disagree — nine
notches against eight. A notch with no partner is worse than no notch, because
it invites the sewer to match it against the wrong thing. The count is now
agreed per *join*, from the mean of the two seams that will be sewn.

**Both notch signs were wrong.** The direction was assumed from the winding of
the seams, and every notch cut *outward* — removing seam allowance instead of
marking it. The direction now comes from the geometry: a notch must move
toward the opposite seam. All 332 on the test wing now cut inward.

The check for this also had to be rewritten. Measuring from the panel centre
fails on a curved panel, because the seam normal does not point at the
centroid.

### The rest of the marks

Panel identity (`14U`), a grain arrow — ripstop is far stiffer along its warp
than across it — and the leading edge, since a panel is not symmetric end to
end. Each goes on its own DXF layer (`notch`, `grain`, `label`), so a cutting
table can be told to cut the outline, plot the notches and ignore the text.

---

## 6. Attachment tabs

The line plan ends at a point on a rib, and nothing is at that point. A line
cannot be sewn to a point — it is sewn to a **tab**: a folded strip of
reinforced cloth stitched along the rib's lower edge, projecting far enough
that the line's loop does not bear on the sail.

**The seam carries the load, and the seam is the tab's width.** A line pulling
25 daN through a 40 mm tab loads its stitching at 6 daN per centimetre;
through a 20 mm tab, at 12. So tab width follows from the tension the line
plan already computes — this is where the two halves of the project meet.

Sized on the **design case**, not the 1 g tension. Sizing on 1 g puts every
tab at minimum width and tells the designer nothing, which is the same mistake
the line selection avoids.

### Almost every tab is minimum-width, and that is the finding

| wing | anchors | tab widths | load-sized |
| --- | --- | --- | --- |
| solo 25 m² at 95 kg | 52 | 20 mm | 0 |
| solo at 120 kg | 52 | 20 mm | 0 |
| tandem 42 m² at 220 kg | 52 | 20–29 mm | 10 |
| tandem, anchors every 4th rib | 28 | 20–54 mm | 11 |

A 20 mm tab carries far more than a solo anchor ever asks of it. That is the
same result as the line selection, where 76 of 88 lines are floor-sized rather
than load-sized: **most of a wing is built to handling minimums, not to
strength**.

A tandem crosses into load-driven, and halving its anchor count widens the
tabs from 29 mm to 54 mm — which is how the mechanism is shown to work rather
than merely not to fail. A tab that hits the maximum width and still exceeds
its seam load is reported: the answer there is another anchor, not more cloth.

`checkTabClearance` verifies that tabs and lightening holes do not compete for
the same part of a rib. Both are generated from the same anchor positions so
they should not — but that is exactly the assumption that survives a refactor
of one and not the other.

---

## 7. Reconciling against a real wing

The mass budget said 2.5 kg accounted against a 4 kg wing and named the gap.
Modelling a **published** wing instead of a generic one says how much of that
gap is real and how much was my own assumptions.

Skywalk's SAGE 95 — 22.70 m², 68 cells, published at **3.80 kg**, with its
cloth named in the manual.

| item | mass | share |
| --- | --- | --- |
| Sail cloth | 1249 g | 33% |
| Seam allowance | 506 g | 13% |
| Thread | 421 g | 11% |
| Rib cloth | 340 g | 9% |
| Risers | 230 g | 6% |
| Lines | 150 g | 4% |
| Reinforcement | 130 g | 3% |
| Rods | 90 g | 2% |
| Diagonals | 79 g | 2% |
| Attachment tabs | 20 g | 1% |
| **accounted** | **3214 g** | **85%** |
| residual | 586 g | 15% |

Three things moved it from 66% to 85%.

**Cloth weight was wrong.** The default 38 g/m² is a mid-range sail cloth; the
SAGE uses Dominico 10D at **27 g/m²**. On the largest item in the bill that is
a 509 g error — more than every small item put together. `CLOTH_LIBRARY` now
carries real named grades.

**Seam allowance is cloth.** Every seam is folded, so the cut cloth is wider
than the finished panel by the allowance on each side. 936 m of seam at 10 mm
a side is **18.7 m² of extra cloth**, 506 g. A bill built from panel areas
leaves it out entirely.

**Thread is not negligible.** 936 m of seam, two rows of stitching, and a
lockstitch consuming two and a half times the seam length gives 421 g — 11% of
the wing, and easy to omit completely.

The remaining **586 g is left as a residual**, with candidates named rather
than absorbed: reinforcement beyond the simple layout, riser hardware, labels
and sliders, and cloth heavier after coating than its nominal grade. A
reconciliation that closes to zero by tuning its own assumptions has not
learned anything.

### And a modelling gap it exposed

The generated line plan reaches the SAGE's published **215 m of line within
12%**, but with **half as many lines**. A real wing runs four cascade levels
plus brakes and a stabilo where the generator runs three and no brakes, so it
arrives at the same length with fewer, longer lines. Length is right;
topology is not.

---

## 8. Not covered

- **Rods.** Modern wings carry nylon or carbon rods in the leading edge; on a
  light wing they are a noticeable fraction of the weight.
- **Cross-ports.** Holes between cells for pressure equalisation, distinct
  from lightening holes and subject to different rules.
- **Hole shape.** The generator produces one tapered opening per available
  gap. Real ribs use a variety of shapes, and some makers cut several small
  holes where this cuts one large one.
