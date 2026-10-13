# Nesting: where the material goes

Cloth is bought by the roll, so how the pieces are laid out decides how much
is ordered. This is what the tool's layouts come to, how they got there, and
what is still on the table.

## Where it stands

The default wing — 48 sail panels a half, 26.75 m² as cut with a 10 mm seam
allowance — on a 1.4 m roll with 30 mm between pieces:

| packer | roll, one half | used |
| --- | --- | --- |
| boxes on a skyline | 39.6 m | 48% |
| outlines, from one edge | 36.6 m | 52% |
| **outlines, from both edges** (what the tool uses) | **30.1 m** | **64%** |

The same packer lays out the ribs (57% used) and the diagonals (38%) on rolls
of their own, and the bill of materials orders all three.

**These are valid layouts, not tight ones.** Every piece keeps the gap asked
for from every other, in every direction, and nothing overlaps — both are
measured on the finished layout, not assumed. But a nest worked over by hand
or by a production nester does better, and the bill says so under its roll
total rather than letting 115 m be read as what a 22 m² wing needs.

Roll width matters more than it looks: the default wing's panels are 305 mm
across as cut, so a 1.4 m roll takes four abreast with 9 cm to spare, and a
1.6 m roll with a 10 mm gap takes five (68% used).

## Two losses that want opposite remedies

```
shape efficiency   = panel area / sum of best-fit bounding boxes    93.8%
packing efficiency = sum of boxes / roll area consumed              67.7%
                                                     overall        63.5%
```

Shape loss is what a panel's own outline wastes *inside* the smallest box that
holds it. No packer can recover it. Packing loss is what is wasted *between*
boxes, and that is the packer's to fix.

`nestingDiagnosis` reports both, names the dominant one, and lists the
worst-shaped panels. On the default wing:

| | |
| --- | --- |
| dominant loss | packing |
| worst-shaped | 24U 73%, 24L 77%, 23U 83% |
| best-shaped | 1L, 2U, 3L at 98% |

A sail panel is a near-straight strip — 2.74 m by 0.31 m at the root, 1.31 m
by 0.19 m at the tip — so it fills its own box almost completely. The loss is
in how the boxes go down.

## What works

**Packing against the outlines.** `nestByProfile` samples each panel, aligned
to its long axis, into columns with a lower and an upper profile. The roll
carries a skyline, and a panel drops to the lowest position where its lower
profile clears it:

```
dy = max over shared columns of ( skyline[c] − lower[c] )
```

exact for a given position along the roll, which is itself searched.

**From both edges.** A single bottom-up skyline leaves a band along the far
edge that nothing placed from the near edge reaches. A second skyline
descending from the far edge fills it: 36.6 m becomes 30.1 m.

**End for end.** A piece turned through 180° keeps its grain and can lie
against a tapered neighbour instead of beside it. Sixteen identical triangles
take 3.05 m of roll all one way and 2.43 m turned. It helps the diagonals and
the ribs; on the sail's strips it loses.

**Every way, and the shortest wins.** Both of those are heuristics inside a
greedy placement, and each has lost on some set of panels. Unless a caller
asks for one, `nestByProfile` runs all four combinations and keeps the
shortest layout, so it is never longer than any one of them.

## Mistakes on the way

**Pairwise interlocking does not work on strips.** The roadmap asked for it,
and two curved strips with one turned do occupy less than two boxes — but a
developed panel is not a banana. When it was tried, interlocking a pair saved
under 2%, and two identical panels nested to within a millimetre of simply
stacking them.

**Flipping before aligning did nothing.** The alignment search runs over a
half turn, and a 180° rotation lands on the same canonical orientation, so the
flip was undone before it was used. The first version reported a saving and
was measuring nothing. (Turning a piece *after* aligning it, inside the
packer, is the version that works.)

**Overlaps that looked like efficiency.** The first two-edge packer reported
over 90% with 26 overlapping pairs: a near-edge placement consulted only the
skyline, so panels rose into space already taken from the far edge. Both
fronts are now checked in both directions, and `nestingOverlaps` re-tests
every placed pair of outlines.

**The gap, in one direction only.** The gap was kept between a panel and the
one below it and not between two panels end to end, which could meet at
nothing. A panel's footprint on both fronts is now widened by the gap, and
`nestingClearance` measures the closest two pieces on the finished layout:
30.0 mm where 30 was asked.

**Seams dropped.** The profile packer returned a placed outline. A marked
cutting file needs the two *seams*, and the first version lost them — a marked
file went from 314 polylines to 24 and lost every notch, with no error. The
seams go through the same transform as the outline, turned pieces included,
and a test holds both packers to the same number of marks.

## Still open

- **Lanes.** Four panels abreast leave lanes that end at different places
  along the roll, and the greedy placement does not close them up. Packing is
  68% of the boxes on the default wing; a layout planned in lanes would be
  some way above that.
- **Diagonals and ribs.** 38% and 57%. Triangles pair into parallelograms and
  ribs lie nose to tail, and a packer that planned for that would order a
  good deal less of both.
- **Different cloths.** The upper and lower surfaces are nested on one roll
  even when they are set to different cloths, and the nose cloth has no seam
  of its own in the patterns. The bill says so when it applies.

## Kept anyway

`alignToLongAxis` is a genuine reduction in the box a panel needs, and the
packer starts from it. `pairOverlap` is an exact test that two placed outlines
do not intersect. `pairPanels` tries both pairing orders — largest with next
largest, and largest with smallest — and keeps whichever saves more on the
wing in hand, because each wins on some wings; it is tested, and it is not on
the path the tool uses to lay out a roll.
