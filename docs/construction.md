# Construction detail

Phase 3: the parts of a wing that are neither aerodynamic surface nor line.

Two wings are quoted throughout. **The default wing** is what the tool opens
with: 10.25 m span, 2.6 m root chord, 24 cells a side, 22.3 m². **The test
wing** is the same planform with 12 cells a side, which is what the unit suite
builds; `node tests/run-tests.js --verbose` prints the figures behind every
check, and those given for it here are from that run.

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

On the test wing's root rib: three holes, **30% of the rib removed**, minimum
web 10% of chord. Across that wing, rib cloth falls from 461 g to 320 g.

An opening also keeps clear of any rod on its rib — by 1.3% of chord and never
less than 10 mm, which is what the Swoop2's own holes keep from its own rods.
See `docs/rods.md`.

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
used. On the default wing: 53.5 m² of sail as cut, and **60.1 m of 1.4 m roll
ordered** at 64% used. A bill quoting panel area understates the order by half
as much again.

**Line is bought by cut length.** The loop allowance is real material and
fixed per line: 316 m of line finished is 345 m to cut on the default wing. A
bill supplied without it says so rather than quietly omitting it.

**Rib cloth is not negligible** — the third fabric item after the two sail
surfaces — and neither are the diagonals.

The default wing, as the "Bill of materials" button writes it (the notes under
each item left out here):

```
FABRIC
  Sail cloth              60.1 m of 1.4 m roll (64% used)   53.50 m2   1674 g
  Rib cloth               49 pieces, 31.5 m of roll (57%)   15.92 m2    637 g
                          31% of 23.03 m2 removed as openings
  Diagonal cloth          192 pieces, 24.0 m of roll (36%)  12.22 m2    489 g
  Dacron at the anchors   129 pieces                         0.39 m2     47 g
  Trailing edge tape      10.3 m                             0.21 m2     11 g
  Attachment tabs         129 pieces                         0.17 m2     20 g
LINE
  DC40      294.5 m   210 pieces   0.50 mm   53 g
  DC 161     16.8 m     4 pieces   0.83 mm    8 g
  9200-70    16.7 m     4 pieces   0.65 mm    5 g
  DC100      16.5 m     4 pieces   0.80 mm    7 g
RODS AND WEBBING
  Nylon rods      49 pieces   39.8 m   80 g
  Riser webbing    6 pieces    3.0 m   not weighed
    the straps from the karabiner to the lines; a speed system's own webbing is not in it
TOTALS
  cloth, film and tape 2878 g + line 74 g + rods 80 g = 3.032 kg
  roll to order: 115.6 m (sail cloth 60.1, rib cloth 31.5, diagonal cloth 24.0)
    as this tool lays the pieces out: a production nest is tighter
  that is 56% of the 5.40 kg the wing is set to weigh
NOT WEIGHED
  rod pockets; riser webbing and its hardware; thread; the seam allowance on
  ribs and diagonals (the sail is weighed as cut); labels
```

The bill counted sail cloth and line only for a long time, and said so at the
bottom. It now carries the ribs with what is cut out of them, the diagonals,
reinforcement, tabs, rods and webbing — and still ends by naming what it does
not weigh, so the total is not read as the weight of a wing. The roll to
order covers all three cloths, each laid out on its own roll; the ribs used
to be left out of it without a word. With the rods
turned off it lists mylar at the intakes instead (98 pieces, 90 g): something
has to hold the nose.

Against a published wing the comparison is direct. Loaded by size and built in
the default cloths, the 43 ordinary double-surface sizes come to 65–101% of
their published weight; an ultralight (112–125%) and the single-surface wings
(111% on the tandem, 186–193% on the Skin 4 P) come out over, because their
cloth and construction are not the default's, and the bill says so on those.

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

For the test wing's root cell — 0.34 m³, 63 Pa internal, 10.1 m/s flow — that
is **359 cm² to fill in 1.5 s**. The tip cell needs 46 cm².

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

Reinforcement is *placed*, not calculated — a designer decides where a wing
needs help, and the rules are conventions rather than derivations. What can be
done honestly is to place it consistently and let the mass appear in the bill.

On the default wing:

| item | job | mass |
| --- | --- | --- |
| Mylar at the intakes | holds the nose against the highest pressure on the wing | 90 g, when no rods are fitted |
| Dacron at the anchors | spreads a point load that would tear ripstop | 47 g |
| Trailing edge tape | sewn, loaded along its length, handled every flight | 11 g |

Only the first two are structural. The others are wear and handling, which is
why a light wing drops them first — and the generator lets it, with `fitMylar`
and friends.

Anchor patches are counted **from the line plan**, not from a guess at rows
per rib, so changing the rigging changes the order.

### Rods

A rod holds the leading edge open so the wing keeps its intake shape at low
angles and reinflates cleanly after a collapse. What a rod is, how it is
built and how it was got wrong for a long time are in `docs/rods.md`; two
things matter to a bill.

**A rod follows the rib's surface, not the chord.** A nose rod runs from 18.5%
of chord on top, round the leading edge, to 15% underneath, and is **16%
longer** than the chord its two ends span.

**Mass goes as the square of diameter**, so this is the trade worth seeing.
The default wing's 49 nose rods, 39.8 m:

| | nylon | carbon |
| --- | --- | --- |
| 1.1 mm | 43 g | 60 g |
| 1.5 mm | 80 g | 112 g |
| 2.0 mm | 142 g | 199 g |
| 2.5 mm | 222 g | 312 g |

### The gap is the output

`massBudget` compares against a published weight. For the test wing against
3.8 kg:

```
cloth 1993 g + line 70 g + reinforcement 76 g + rods 40 g = 2.179 kg
gap 1621 g (43%) — thread, risers and hardware webbing, the bag
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
ovalization they match to a tenth of a micron — the development shares the rib
curve between them. Ovalization then widens each panel about its own
centreline, lengthening its outer seam and shortening its inner one, so the
seams that actually get sewn together differ by up to **4.3 mm** on the test
wing.

That is not an error. It is the ease that lets flat cloth take a curved shape,
and it has to be *distributed* rather than run out at one end. A sewer working
it by eye over two metres will not get it even, and the wing will pull.

The rule that makes notches work: **they pair at equal fractions of each
seam's own length, not at equal distances.** Marking both seams every 250 mm
puts the last notch of the longer seam 4 mm past its partner and leaves the
whole discrepancy in the final segment. At equal fractions it becomes **0.7 mm
per segment**, which is what a sewer can actually work in.

### Two bugs the checks caught

**Notch counts were derived per panel**, so neighbours could disagree — nine
notches against eight. A notch with no partner is worse than no notch, because
it invites the sewer to match it against the wrong thing. The count is now
agreed per *join*, from the mean of the two seams that will be sewn.

**Both notch signs were wrong.** The direction was assumed from the winding of
the seams, and every notch cut *outward* — removing seam allowance instead of
marking it. The direction now comes from the geometry: a notch must move
toward the opposite seam. All 372 on the test wing now cut inward.

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

| wing | tabs | tab widths | load-sized |
| --- | --- | --- | --- |
| the test wing at 95 kg | 52 | 20–28 mm | 2 |
| the same at 120 kg | 52 | 20–35 mm | 11 |
| tandem, 41 m² at 220 kg | 84 | 20–41 mm | 19 |
| tandem, anchors every 4th rib | 44 | 20–60 mm | 17, and 2 that cannot be made wide enough |

A 20 mm tab carries far more than a solo anchor ever asks of it. That is the
same result as the line selection, where 61 of 73 lines are floor-sized rather
than load-sized: **most of a wing is built to handling minimums, not to
strength**.

A tandem crosses into load-driven, and halving its anchor count widens the
tabs from 41 mm to 60 mm — which is how the mechanism is shown to work rather
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
| Seam allowance | 534 g | 14% |
| Thread | 445 g | 12% |
| Rib cloth | 340 g | 9% |
| Risers | 230 g | 6% |
| Lines | 150 g | 4% |
| Reinforcement | 130 g | 3% |
| Rods | 90 g | 2% |
| Diagonals | 79 g | 2% |
| Attachment tabs | 20 g | 1% |
| **accounted** | **3266 g** | **86%** |
| residual | 534 g | 14% |

Three things moved it from 60% to 86%.

**Cloth weight was wrong.** The default 38 g/m² is a mid-range sail cloth; the
SAGE uses Dominico 10D at **27 g/m²**. On the largest item in the bill that is
a 509 g error — more than every small item put together. `CLOTH_LIBRARY` now
carries real named grades.

**Seam allowance is cloth.** Every seam is folded, so the cut cloth is wider
than the finished panel by the allowance on each side. 988 m of seam at 10 mm
a side is **19.8 m² of extra cloth**, 534 g. A bill built from panel areas
leaves it out entirely.

**Thread is not negligible.** 988 m of seam, two rows of stitching, and a
lockstitch consuming two and a half times the seam length gives 445 g — 12% of
the wing, and easy to omit completely.

The remaining **534 g is left as a residual**, with candidates named rather
than absorbed: reinforcement beyond the simple layout, riser hardware, labels
and sliders, and cloth heavier after coating than its nominal grade. A
reconciliation that closes to zero by tuning its own assumptions has not
learned anything.

### And a modelling gap it exposed

The SAGE's 215 m and 112 lines a side include brakes and stabilo; the plan
compared had no brakes, came to 194 m, and was called close. Like with like,
every second rib gives 283 m (+32%) and 86 lines a side, and anchors solved to
the total give 216 m with **61 lines a side, about half the real 112**. The
SAGE's sheets are not on file to say where the rest are; on the Ozone
two-liners they are bridles atop the front row (`docs/full-pipeline.md`).

---

## 8. Printed patterns

The SVG export writes the whole roll as one sheet — **24 metres long** on the
test wing. That is right for a plotter and useless to anyone without one.

At A4 that sheet is 138 by 6 tiles, and a good part of them are empty, because
a nested layout has gaps. Printing all 828 would bury the ones that matter:

| paper | printed | of tiles | saved |
| --- | --- | --- | --- |
| A4 | 617 | 828 | 25% |
| A3 | 361 | 372 | 3% |
| A3 landscape | 303 | 378 | 20% |

"Printable pattern" writes them as one HTML file, a sheet to a page, which a
browser prints to paper or to PDF at the size each page declares.

### Three things make a printed pattern usable

**Exact scale, verifiably.** A pattern printed at 97% is worse than no
pattern, and printer drivers scale to fit by default. Every page declares its
size in millimetres with a viewBox that matches exactly — asserted, not
assumed — and carries a **100 mm calibration bar**. If that bar does not
measure 100 mm, the print is wrong and nothing on the page can be trusted.

**Overlap, not butt joints.** Pages that meet exactly cannot be aligned; pages
that overlap can be laid one over the other until the marks agree. The step
between page origins is the usable width *minus* the overlap, and a test
checks adjoining pages really do share that strip.

**A grid reference on every sheet.** 617 pages in a pile are useless without
one, and each page also names the panels that cross it.

---

## 9. A rib opening does two jobs

The collision check found lightening holes and cross-ports overlapping by up
to 286 mm on the root rib. The obvious reading is that two generators need to
cooperate. **The actual reading is that they are the same openings.**

A hole cut in a rib removes weight *and* lets air pass between the cells
either side. That is how a real rib works — the holes are the ventilation.
Placing a separate set of cross-ports beside them models a wing nobody builds.

Measured, the lightening holes exceed the flow requirement everywhere:

| rib | hole area | flow needs | margin |
| --- | --- | --- | --- |
| 0 | 2110 cm² | 359 cm² | 5.9× |
| 4 | 1820 cm² | 283 cm² | 6.4× |
| 8 | 1240 cm² | 159 cm² | 7.8× |
| 11 | 629 cm² | 46 cm² | 13.6× |

**So the flow requirement is not what sizes the openings on a normal rib —
weight is.** `ribOpenings` reports which, and on every station of the test
wing the answer is weight.

### The requirement still matters

It is what says whether a rib that *cannot* be holed much still breathes.
Heavy margins, a crowded rib, a demanding reinflation target:

| case | available | needed | |
| --- | --- | --- | --- |
| normal | 2110 cm² | 359 cm² | ok |
| heavy margins | 635 cm² | 359 cm² | ok |
| very heavy margins | 233 cm² | 359 cm² | **125 cm² short** |
| a 0.3 s target alone | 2110 cm² | 1793 cm² | ok |
| both | 233 cm² | 1793 cm² | **1560 cm² short** |

Each alone is survivable on this wing; it is the two together that starve the
rib.

And the lever a designer actually has is cell count: the requirement scales
with cell *volume*, so splitting the same wing into more cells makes a target
reachable that a coarse wing cannot meet. With 8 cells a side the root cell
cannot refill in 0.3 s (2657 cm² needed against 2105); with 12 it can, and
with 40 it needs 542.

---

## 10. Rib internals compete for the same fabric

Lightening holes, cross-ports, diagonal landings and attachment tabs are each
generated correctly and **independently**. Each respects its own margins —
nose band, surface margin, anchor clearance, webs between holes.

Nothing checks that two of them do not want the same chordwise band of the
same rib — and they can, because they are all placed into the space the
anchors leave:

```
lightening hole 1 overlaps cross-port 3 by 117 mm
lightening hole 2 overlaps cross-port 1 by 286 mm
lightening hole 3 overlaps cross-port 2 by 247 mm
```

**A rib that passes every individual rule can still be uncuttable.**

`checkRibInternals` compares every part as a chordwise interval, which is the
axis they compete on, and separates two cases that want different responses:

- a **collision** — the parts overlap, and one of them must move
- a **tight clearance** — they clear but by less than the minimum separation,
  which is buildable and fragile

`checkTabClearance` had been doing this for tabs against lightening holes
only. This is the general form.

### A correction to how this was first reported

The check was written after a demonstration showing lightening holes and
cross-ports overlapping by 286 mm, and that demonstration was misleading.

It called `buildRibHoles` and `buildCrossPorts` and compared the results. **The
tool never does that.** `ribOpenings` — section 9 above — already existed and
is what the interface and the exports use. The overlap was between two
low-level functions the tool does not combine, reported as though it were a
fault in the wing. The check is still worth having — diagonals and tabs can
land on the same station as an opening — but it did not find the bug it was
said to have found.

---

## 11. Not covered

Rods have a document, and a list like this, of their own: `docs/rods.md`.

- **Hole shape.** The generator produces one tapered opening per available
  gap. Real ribs use a variety of shapes, and some makers cut several small
  holes where this cuts one large one — the Swoop2 has nine ellipses a rib.
