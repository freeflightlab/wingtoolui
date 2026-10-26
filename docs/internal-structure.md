# What a design sews inside its cells

An imported LEparagliding design states its internal structure in section 12
of its file — full diagonals, straps, pieces between two ribs — its rods'
pockets in section 21 and its trailing-edge mini-ribs in section 2. The tool
used to read those rows, place its own model of a diagonal at each, and bill
that: 3.9 m² of the Swoop2's diagonals where its cutting file has 7.9, and
nothing of its straps or pockets. `lepStructure` (`src/core/lepstructure.js`) now cuts every piece as
the design's own program cuts it, and every piece of the three complete
designs' cutting files is matched.

## 1. Read from the program, not from the drawings

Every design archive carries the program that drew it, `leparagliding.f`
(GNU GPL): the Swoop2's at version 3.30, the Tuluaq-19's at 3.25, the
gnuC2-23's at 3.28. Everything here is that source, read line by line. What
the four numbers that close a diagonal's row mean, which widths are
centimetres and which per cent of chord, which are scaled with the wing —
none of it is in the file, and the
previous account of section 12 (in `lep.js`) said so and left them unread.

| type | the piece | its numbers |
| --- | --- | --- |
| 5, 15 | a full diagonal: one piece per rib and side, from the anchor rib's lower surface up to the next rib's upper surface | front and back angles; cut-out depth; width at each anchor |
| 1, 11 | a strap between the same anchor row of two adjacent ribs, along their lower surfaces | width either side of the anchors |
| 6, 16 | a piece between two ribs at a chord position, at a height from the lower surface (0) to the upper (100) | position, height, how far it runs ahead and behind |
| 3, 13 | a V-rib as separate strips: from an anchor on its rib's lower surface to the upper surface of the rib to one side, or a strip to each | half-width at the anchor; half-width on the neighbour |
| section 21 | a pocket beside each rod | four widths from the rod's line |
| section 2 | a trailing-edge mini-rib: the rear of the rib inboard of a cell, its front raised to meet the cell's billow (section 5 here) | its length in per cent of chord; section 37's code 3001; section 38's type 9 holes |

Types 11, 13, 15 and 16 give widths in per cent of each rib's chord; 1, 3, 5
and 6 in centimetres, and the program scales 3's, 5's and 6's by the wing's
scale factor and 1's by nothing. (A type 3 can ask for per cent too, by a flag
after its widths; its neighbour's width is then of its anchor rib's chord
if it runs to both sides, of the neighbour's if to one.) The Tuluaq's
diagonals came out 1.6 to 2.2 cm too long until their 7 cm was scaled by its
0.838.

## 2. How the program builds a piece

Every kind is built the same way:

1. **A line along each rib.** A full diagonal's runs along the anchor rib's
   lower surface from its first anchor less the attachment width to its last
   plus it, and along the neighbour's upper surface between the points where
   a line from the neighbour's own first and last anchors, rising at the
   row's front and back angles, meets it. A strap's runs ±w about the anchor
   on each rib's lower surface; a V-rib strip's ±f about the anchor on the
   lower surface and ±u about the same chord position on the neighbour's
   upper; a piece between ribs at its height.
2. **Resampled** (`lepResample`, the program's `vredis`): each segment split
   in ten and every k-th point kept, so a segment's share goes with its
   count, not its length — 121 points on a diagonal, 21 on the others.
3. **Placed in 3D** as the rib is (`lepRibPoint`).
4. **Flattened** quad by quad (`lepFlatten`, its `flatt`) and, for a
   diagonal, stood up on the anchor side's chord.
5. **Outlined**: the seam allowance along the two sides sewn to a rib —
   section 6's rib allowance on a diagonal, its V-rib allowance on the
   others — and none across the ends. A strap is then cut 1.14% short
   (section 5's last figure) so it pulls.
6. **Cut out**: between each pair of a diagonal's anchors a parabola, its
   vertex 85% of the way to the far side on the Swoop2, 80% on the Tuluaq;
   and section 38's ellipses — one at each anchor of a diagonal, five along
   a piece between ribs — drawn with section 37's 55 sides on the Swoop2,
   60 by default.

A rod's pocket is the strip between the rod's line moved out by its second
width less its first, and in by its first, third and fourth: 25 mm wide on
all three designs. The gnuC2-23's shark nose (section 21's rod type 3) has
two rods on a rib, one round the nose above and one along the intake below,
and a pocket beside each.

Seven details are the program's, and each changes a piece:

- Building each rib's line it leaves out the last section point before the
  line's end — its own comment reads "MIRAR SI CAL +-1".
- A station ahead of where a rib's lower surface starts is not found, and
  its point keeps the value its array started with: height zero. The
  Tuluaq's tip diagonal has one.
- A rib that carries no line is lowered (section 2) BEFORE it is twisted for
  its surfaces and these pieces, and AFTER for its anchors. See section 4.
- A centre rib on the centreline is moved 0.01 out. See section 4.
- The short connectors where a cut-out meets the seam allowance take their
  direction from a point near the other end of the cut-out.
- A hole that would run off its piece is not cut. The Swoop2's rib-23
  diagonal computes three and its file has two; the missing one is the one
  that crosses its front edge.
- A piece's edge at height 0 runs straight between its front and back
  points on the rib's lower surface, not along it: the program's case for
  heights between the two surfaces has no guard against 0, and overwrites
  the resampled lower line.
  The gnuC2-23's pieces with an end at height 0 were 0.09 to 0.17% off
  until they were drawn so.

## 3. Against the cutting files

Every piece of the three files was measured and identified by where the
program lays it out (`data/reference/lep/*-cut-parts.tsv`), then compared
with the piece built for the same rib and row. One side of the wing; the
file's own rounding to a hundredth of a cm² is the floor on the smallest
pieces — 0.0125% of a 40 cm² pocket at the gnuC2-23's tip.

| | pieces | the file | worst piece | total |
| --- | --- | --- | --- | --- |
| Swoop2 full diagonals | 13 | 31 868 cm², 38 holes | 0.0003% | 0.0000% |
| its pieces between two ribs | 15 | 13 977 cm², 75 holes | 0.0006% | 0.0000% |
| its straps | 70 | 11 329 cm² | 0.0074% | 0.0003% |
| its rod pockets | 50 | 9 005 cm² | 0.0067% | 0.0000% |
| Tuluaq-19 full diagonals | 10 | 66 160 cm², 30 cut-outs | 0.0001% | 0.0000% |
| its straps | 24 | 7 497 cm² | 0.0020% | 0.0000% |
| its rod pockets | 14 | 2 187 cm² | 0.0030% | 0.0001% |
| gnuC2-23 V-rib strips | 24 | 9 666 cm² | 0.0020% | 0.0000% |
| its pieces between two ribs | 93 | 40 095 cm² | 0.0027% | 0.0000% |
| its straps | 6 | 1 574 cm² | 0.0023% | 0.0006% |
| its rod pockets, upper and lower | 60 | 5 406 cm² | 0.0102% | 0.0001% |
| Swoop2 trailing-edge mini-ribs | 25 | 4 763 cm², 100 holes | in total | 0.0000% |
| Tuluaq-19's, as 3.25 drew them | 16 | 4 455 cm² | in total | 0.0002% |
| gnuC2-23's | 29 | 7 476 cm² | 0.0067% | 0.0001% |

Every cut line is the file's to a tenth of a millimetre in total. Before the
two details of section 4 were found, the pieces next to the centre rib were
three parts in ten thousand out and those next to a lowered rib seven in a
hundred thousand; every other piece already matched.

## 4. What reproducing them found elsewhere

**A rib lowered at two moments.** The program lowers an unloaded rib (its
section 2 displacement) before twisting it when it builds the surfaces the
panels are cut from and these pieces, and after twisting it when it places
anchors — under its author's note to review it. `lepRibPoint` lowered it
after, everywhere. A rib with washin moves `disp sin(washin)` between the
two: on the Tuluaq, whose six lowered ribs sit up to 1.7 cm down, from
nothing at the centre to 0.85 mm on rib 17. The diagonals next to them were
up to 0.007% off their file's, and are 0.0001% now. It now does both, as the
program does; no anchor moved.

**A centre rib 0.01 off the centreline.** "Anticipates xp=0 in central
airfoil": a first rib at 0 is moved to 0.01 before the wing is scaled — a
tenth of a millimetre on the Swoop2. Its first cell's panels, the straps
from it and the diagonal to it are cut to that rib. Whether the wing has a
centre cell is the program's own test, the first rib's flat position, not
its projected one.

**A label of ours.** The Swoop2's seventy straps were listed in its cut-parts
file as "upper straps". They are the anchor straps along the lower surface;
the file now says so.

## 5. The trailing-edge mini-ribs

Section 2's last column puts a mini-rib in a cell: 25 a side on the Swoop2,
16 on the Tuluaq, 29 on the gnuC2-23. Mini-rib *i* is the section of rib
*i−1*, the rib inboard of its cell, from the trailing edge forward over rib
*i*'s figure in per cent of chord — 15 to 17% on all three. Its front is
not sewn to anything: the cell's cloth billows out there, and the mini-rib
has to meet it. So the program (its 6.12.0, moved in 3.28 to after its 3D
shaping) raises the upper edge and lowers the lower one at the front by the
cell's billow times section 37's code 3001 factor — 0.85 on the Swoop2, 0.8
on the gnuC2-23 — back to nothing over the code's length, 6% of chord, by a
half cosine. The billow is the program's `hautok`: the panel's width at
that point as it is cut, wider by the skin tension and matched, standing
over the straight line between the two ribs as a circular arc, its height
found by stepping the arc's centre 301 times. Each point is then moved out
by the rib allowance, and the line closed through the trailing edge and
across the front.

Three details are the program's:

- The billow is the cell inboard's — between ribs i−2 and i−1 — not the
  mini-rib's own, and the first two cells take the third's (3.30's
  "provisional fix"; 3.28 fixes only the second).
- Each point's normal is taken from a segment whose far end still carries
  this point's rise, not its own.
- 3.30 cuts section 38's type 9 holes in them: the Swoop2's four a
  mini-rib, from its front aft, each a step smaller, sized by the section's
  thickness at the front.

On the gnuC2-23 the first mini-rib rises 2.25 cm above and 2.36 below, and
without the rise its mini-ribs are 8 to 11% small. The Swoop2's first is in
its centre cell, between its centre rib and that rib's mirror, and is cut
once for the wing. 3.25 drew them from the rib's own cutting line and with
no rise (`drawnBefore330`); the Tuluaq's file, which has no transition, comes
out the same either way.

## 6. Versions of the program, and their drawings

The Tuluaq's file was drawn by 3.25, which differs from 3.30 in two ways,
and each piece is held to the file's own (the gnuC2-23's 3.28 draws them as
3.30 does):

- **A diagonal's cut-outs.** 3.25 drew them against the sewing line inside a
  whole seam allowance, leaving a strip of allowance across each opening;
  3.30 cuts them through it. On the Tuluaq that strip is 0.148 m² a side —
  the 15 mm allowance across 9.85 m of openings.
- **A pocket's edges.** 3.25 offset the rod's line along the mean of the
  segments either side of each point; 3.30 along the one that leaves it.

`cutAreaM2` is a piece as 3.30 cuts it, and what the bill counts;
`drawnBefore330` is the same piece as 3.25 drew it, against which the
Tuluaq's file is checked.

## 7. In the interface

An imported design's internal structure is in the bill as **Internal
structure cloth**, instead of this tool's diagonals, for the whole wing — a
piece on the centre rib alone, its rods' pockets, once:

| | full diagonals | V-rib strips | pieces between ribs | straps | rod pockets | the wing |
| --- | --- | --- | --- | --- | --- | --- |
| Swoop2 | 26, 5.76 m² | — | 30, 2.09 m² | 140, 2.27 m² | 98, 1.76 m² | 11.87 m² |
| Tuluaq-19 | 20, 8.56 m² | — | — | 48, 1.50 m² | 27, 0.42 m² | 10.48 m² |
| gnuC2-23 | — | 48, 1.93 m² | 186, 8.02 m² | 12, 0.31 m² | 118, 1.06 m² | 11.33 m² |

Its trailing-edge mini-ribs are rib cloth, and their own item, **Mini-rib
cloth**: 49 on the Swoop2, 0.82 m²; 32 on the Tuluaq, 0.89; 58 on the
gnuC2-23, 1.50. The Tuluaq's diagonals are 8.85 m² as its 3.25 file draws
them. The pockets follow the Rods switch. The **Diagonals DXF** writes one
side of every piece
nested on a roll, each kind on its own layers — cut line, holes, sewing
lines — with a label: `D2L` the diagonal from rib 2 to the left, `V20R/1`
the V-rib strip from rib 20's first anchor to the right, `S1-2/1` a strap at
row 1, `V4-5/11` a piece between ribs at 11%, `P3/2` rib 3's second rod's
pocket, `P3/1U` the pocket of its upper rod of a shark nose and `M5` the
mini-rib numbered 5.

The Diagonals tab and the tension and balance figures are still this tool's
model of a diagonal at each of the file's places: they are what the analysis
works on, and the cut pieces are what is built. A piece between two ribs is
such a place when it runs from an anchor on one rib's lower surface (height
0) to the other rib above it — 27 of the gnuC2-23's 93; its other 66 join
ribs too, and the summary says that what it finds about a rib held from one
side, or not at all, is on the places it models.

## 8. What is not reproduced

- Section 12's types 2 and 4, and cut-outs drawn as ellipses (a depth
  over 100): no design here uses them, and a file that does is told so.
- The pockets of the rod type `lepJoncs` does not build (2, arcs), which no
  design here has.
- A mini-rib transition of type 2, which the program reads and does not
  draw; one is drawn without it, and said.
