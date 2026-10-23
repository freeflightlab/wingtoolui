# What a design sews inside its cells

An imported LEparagliding design states its internal structure in section 12
of its file — full diagonals, straps, pieces between two ribs — and its rods'
pockets in section 21. Until this round the tool read those rows, placed its
own model of a diagonal at each, and billed that: 3.9 m² of the Swoop2's
diagonals where its cutting file has 7.9, and nothing of its straps or
pockets. `lepStructure` (`src/core/lepstructure.js`) now cuts every piece as
the design's own program cuts it, and every piece of both complete designs'
cutting files is matched.

## 1. Read from the program, not from the drawings

Both design archives carry the program that drew them, `leparagliding.f`
(GNU GPL): the Swoop2's at version 3.30, the Tuluaq-19's at 3.25. Everything
here is that source, read line by line. What the four numbers that close a
diagonal's row mean, which widths are centimetres and which per cent of
chord, which are scaled with the wing — none of it is in the file, and the
previous account of section 12 (in `lep.js`) said so and left them unread.

| type | the piece | its numbers |
| --- | --- | --- |
| 5, 15 | a full diagonal: one piece per rib and side, from the anchor rib's lower surface up to the next rib's upper surface | front and back angles; cut-out depth; width at each anchor |
| 1, 11 | a strap between the same anchor row of two adjacent ribs, along their lower surfaces | width either side of the anchors |
| 6, 16 | a piece between two ribs at a chord position, at a height from the lower surface (0) to the upper (100) | position, height, how far it runs ahead and behind |
| section 21 | a pocket beside each rod | four widths from the rod's line |

Types 11, 15 and 16 give widths in per cent of each rib's chord; 1, 5 and 6 in
centimetres, and the program scales 5's and 6's by the wing's scale factor
and 1's by nothing. The Tuluaq's diagonals came out 1.6 to 2.2 cm too long
until their 7 cm was scaled by its 0.838.

## 2. How the program builds a piece

Every kind is built the same way:

1. **A line along each rib.** A full diagonal's runs along the anchor rib's
   lower surface from its first anchor less the attachment width to its last
   plus it, and along the neighbour's upper surface between the points where
   a line from the neighbour's own first and last anchors, rising at the
   row's front and back angles, meets it. A strap's runs ±w about the anchor
   on each rib's lower surface; a piece between ribs at its height.
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
both designs.

Six details are the program's, and each changes a piece:

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

## 3. Against the cutting files

Every piece of both files was measured and identified by where the program
lays it out (`data/reference/lep/*-cut-parts.tsv`), then compared with the
piece built for the same rib and row. One side of the wing; the file's own
rounding to a hundredth of a cm² is the floor on the smallest pieces.

| | pieces | the file | worst piece | total |
| --- | --- | --- | --- | --- |
| Swoop2 full diagonals | 13 | 31 868 cm², 38 holes | 0.0003% | 0.0000% |
| its pieces between two ribs | 15 | 13 977 cm², 75 holes | 0.0006% | 0.0000% |
| its straps | 70 | 11 329 cm² | 0.0074% | 0.0003% |
| its rod pockets | 50 | 9 005 cm² | 0.0067% | 0.0000% |
| Tuluaq-19 full diagonals | 10 | 66 160 cm², 30 cut-outs | 0.0001% | 0.0000% |
| its straps | 24 | 7 497 cm² | 0.0020% | 0.0000% |
| its rod pockets | 14 | 2 187 cm² | 0.0030% | 0.0001% |

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

## 5. Two versions of the program, two drawings

The Tuluaq's file was drawn by 3.25, which differs from 3.30 in two ways,
and each piece is held to the file's own:

- **A diagonal's cut-outs.** 3.25 drew them against the sewing line inside a
  whole seam allowance, leaving a strip of allowance across each opening;
  3.30 cuts them through it. On the Tuluaq that strip is 0.148 m² a side —
  the 15 mm allowance across 9.85 m of openings.
- **A pocket's edges.** 3.25 offset the rod's line along the mean of the
  segments either side of each point; 3.30 along the one that leaves it.

`cutAreaM2` is a piece as 3.30 cuts it, and what the bill counts;
`drawnBefore330` is the same piece as 3.25 drew it, against which the
Tuluaq's file is checked.

## 6. In the interface

An imported design's internal structure is in the bill as **Internal
structure cloth**, instead of this tool's diagonals, for the whole wing — a
piece on the centre rib alone, its rods' pockets, once:

| | full diagonals | pieces between ribs | straps | rod pockets | the wing |
| --- | --- | --- | --- | --- | --- |
| Swoop2 | 26, 5.76 m² | 30, 2.09 m² | 140, 2.27 m² | 98, 1.76 m² | 11.87 m² |
| Tuluaq-19 | 20, 8.56 m² | — | 48, 1.50 m² | 27, 0.42 m² | 10.48 m² |

The Tuluaq's diagonals are 8.85 m² as its 3.25 file draws them. The pockets
follow the Rods switch. The **Diagonals DXF** writes one side of every piece
nested on a roll, each kind on its own layers — cut line, holes, sewing
lines — with a label: `D2L` the diagonal from rib 2 to the left, `S1-2/1` a
strap at row 1, `V4-5/11` a piece between ribs at 11%, `P3/2` rib 3's second
rod's pocket.

The Diagonals tab and the tension and balance figures are still this tool's
model of a diagonal at each of the file's places: they are what the analysis
works on, and the cut pieces are what is built.

## 7. What is not reproduced

- **The trailing-edge mini-ribs**, section 2's last column: 25 a side on the
  Swoop2, 16 on the Tuluaq — 0.84 and 0.89 m² for the wing in their files.
  The program cuts them from the section as it billows the cell over it,
  from its own ovalization, which this does not reproduce. They are counted,
  named in the import note, and listed as missing in the bill.
- Section 12's types 2, 3 and 4, and cut-outs drawn as ellipses (a depth
  over 100): neither design uses them, and a file that does is told so.
- The pockets of the rod types `lepJoncs` does not build (2, arcs; 3, the
  shark nose), which neither design has.
