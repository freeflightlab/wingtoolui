# Nesting: where the material goes

Phase 4's first item, and its premise turned out to be wrong.

## The claim, and the measurement

The roadmap said:

> Currently about 42% utilisation. A proper no-fit polygon packer with pairwise
> interlocking and colour blocking should reach 60–70%. This is the single
> largest material saving available.

The first half is right — 48.2% on the test wing, and it is the largest saving
available. The diagnosis was not.

**Utilisation splits into two factors that want opposite remedies:**

```
shape efficiency  = panel area / sum of best-fit bounding boxes   73.0%
packing efficiency = sum of boxes / roll area consumed            66.0%
                                                    overall       48.2%
```

Shape loss is what the panel's own outline wastes *inside* the smallest box
that holds it. No packer can recover it. Packing loss is what is wasted
*between* boxes, and that is the packer's to fix.

## Pairwise interlocking does not work here

The idea is sound in general: two curved strips, one turned through 180°,
occupy far less than two bounding boxes. It does not apply to these panels,
and measuring showed why.

A developed panel, aligned to its long axis, is **2561 mm long and 363–391 mm
wide along its whole length**. It is a near-straight strip of nearly constant
width — not a banana and not a wedge. There is nothing for a neighbour to
nest into.

Measured: interlocking a pair saves **1.8% unflipped and −1.5% flipped**. Two
*identical* panels nest to 781 mm against 782 mm stacked — 0.1%. The premise
fails on the geometry.

Pre-aligning every panel to its long axis before nesting gains **1.4 points**
(48.2% → 49.6%), because the existing 360° orientation search was already
finding equivalent placements.

### Two mistakes on the way

**Flipping before aligning does nothing at all.** The alignment search runs
over 0–π, and a 180° rotation lands on the same canonical orientation, so the
flip is undone before it is used. The first version reported 4.7% and was
measuring nothing.

**Bounding-box area was the wrong thing to sort on.** Pairing was done
largest-with-largest, on the assumption that similar sizes interlock best. The
shape loss is concentrated at the *tips* — cell 24 upper is 29% efficient
against the root panel's 96% — so pairing large with large pairs the two
panels that least need it.

## What the diagnosis says to do instead

`nestingDiagnosis` reports both factors, names the dominant one, and lists the
worst-shaped panels. On the test wing:

| | |
| --- | --- |
| dominant loss | packing |
| worst-shaped | 24U 29%, 23U 40%, 24L 41% |
| best-shaped | 1L 96%, 2L 95%, 1U 94% |

So there are two separate pieces of work, and neither is pairwise
interlocking:

- **Packing**, at 66%, is the larger loss and the tractable one. It needs a
  real no-fit-polygon packer rather than a skyline over bounding boxes.
- **Shape**, at 73%, is concentrated in a handful of small tip panels. Those
  are the ones worth nesting into the gaps left by the large panels — which is
  a placement problem, not a pairing one.

## What did work: packing against the outlines

The diagnosis said packing was the larger and more tractable loss. It was.

`nestByProfile` replaces the skyline over rectangles with a skyline over the
**real outlines**. Each panel is aligned to its long axis and sampled into
columns, giving a lower and an upper profile. The roll carries a skyline, and
a panel drops into the lowest position where its lower profile clears it:

```
dy = max over shared columns of ( skyline[c] − lower[c] )
```

exact for a given horizontal position, which is itself searched.

| | roll used | utilisation |
| --- | --- | --- |
| skyline over boxes | 34.6 m | 48.2% |
| skyline over outlines | 29.9 m | **55.7%** |

**4.7 m of roll saved on a 25 m² wing**, with zero overlaps — checked by
re-testing every placed pair of outlines for intersection, not assumed from
the placement rule.

The gain holds across roll widths: 54.1% at 1.0 m, 55.7% at 1.4 m, 55.1% at
1.8 m. Resolution matters more than the number of positions tried — 200
columns loses 11 points against 800, and 1200 gains nothing.

### A regression it caused

The profile packer returns a placed outline. The marked cutting file needs the
two **seams**, not just the boundary, and the first version dropped them — so
a marked file went from 314 polylines to 24 and lost every registration notch,
with no error and no failing test. The seams are now carried through the same
transform, and a test asserts both packers produce the same number of marks.

## Still open

Packing is now 55.7% against a 73% shape ceiling, so about 24 points remain in
placement. Reaching the 60–70% the roadmap wanted needs the tip panels fitted
into the gaps the large panels leave — a placement problem, and the one the
diagnosis named.

## Kept anyway

`alignToLongAxis` is a genuine reduction in the box a panel needs, and
`pairOverlap` is an exact test that two placed outlines do not intersect. Both
are needed by a real packer, and both are tested.
