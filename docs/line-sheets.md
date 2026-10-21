# Reading real line sheets

What can be recovered from a manufacturer's published numbers, and what
cannot. The companion to `docs/line-plans.md`, which covers the naming
grammar and generating plans from scratch.

## 1. Topology is recoverable from lengths alone

The sheets give a cut list and a totals matrix, but never state which branch
feeds which anchor. It can be recovered.

For anchor *i* on row X, the published carabiner-to-canopy total is

```
total_i = riser + (riser-level line) + (middle line) + X_i
```

so `total_i − X_i` is the part of the path shared with its neighbours.
Anchors on the same branch give the **same remainder**, so the remainders
collapse into one value per branch, and the grouping falls out without any
topology being assumed. If names and lengths disagree, the remainders scatter
instead — which is what makes this a check rather than just a calculation.

On the Geo 7 MS, row A: 14 anchors → **6 branches** `[1-4] [5,6] [7,8] [9,10]
[11,12] [13,14]`, and the file declares exactly **6 middle lines**, AM1–AM6.

### Two refinements the data forced

**Equal length ≠ same branch.** Sharing a remainder is necessary but not
sufficient. On the Geo 7 the branch serving anchors 1–4 and the one serving
9–10 agree to within a millimetre, and naive clustering merges them into a
six-anchor branch that does not exist. Since a real branch serves *neighbouring*
anchors, splitting each cluster into contiguous runs separates the coincidences
from the genuine sharing.

**Where two adjacent branches are genuinely the same length**, they still
merge — AM1 and AM2 are both 1921 mm and serve anchors 1–2 and 3–4, reading as
one four-anchor branch. That is a limit of inferring from lengths, not an error
in the file. `inferTopology` reports `middleLineCount` alongside `branchCount`
so the discrepancy is visible rather than hidden.

---

## 2. Riser length is recoverable too

The totals include the riser webbing, but no sheet states its length. Since
`remainder = riser + riserLine + middleLine` and the riser is the one quantity
shared by every branch, trying each combination and keeping the value that
explains the most branches recovers it.

Geo 7 MS, solved independently per row:

| Row | Riser | Branches explained | Spread |
| --- | --- | --- | --- |
| A | 527 mm | 5 | 6 mm |
| B | 529 mm | 5 | 3 mm |
| C | 514 mm | 5 | 20 mm |

Three independent solves agreeing within a few millimetres. The residual
spread is the loop and sewing allowance, which the sheets track separately as
"Prod adj." — typically 11 mm.

---

## 3. Where the junctions actually sit

The most useful calibration in the data.

Geo 7 MS, row A, 6951 mm from carabiner to canopy:

| Segment | Length | Cumulative |
| --- | --- | --- |
| riser | 527 mm | 7.6% |
| AR1 | 3948 mm | **64%** |
| AM1 | 1921 mm | **92%** |
| A1 | 556 mm | 100% |

So the **first junction sits 64% of the way up**, and the second covers **78%
of what remains**, leaving the upper lines the last 22%. The upper lines are
the short ones — 250–650 mm on 52 of the Geo 7's 57, the other five being the
tip lines of the next section.

An earlier construction placed both junctions barely a third of the way up.
The wing still built, the totals were still roughly right — but the upper
lines came out several times longer than any real wing's, and total line
length was 543 m against a real 263 m. Correcting the fractions brought it to
318 m for a slightly larger wing. There is a test pinning mean upper-line
length to the 100–900 mm band, because this failure is invisible in the totals.

---

## 4. Tip lines skip the middle cascade

On the Geo 7, A13 and A14 are 1205 mm and 977 mm where every inboard A line is
300–500 mm, and they have **no middle line above them**: the outermost anchors
take one long line straight to the main level. `tipDirectAnchors` reproduces
this. They are the stabilo's: with B13, B14 and C15 they share one path to the
riser to the millimetre in every size, and a plan built with `stabilo: true`
hangs them on one line (`docs/drawn-line-plans.md`, section 5).

It changes the cut list and the number of pieces, and not where the canopy
sits: the anchors are where the wing puts them either way.

It does change the lengths that get there. This section said the total from
carabiner to canopy was "barely affected"; in the generator it is not. On a
24-cell wing the outermost anchors come out 130 to 180 mm longer with direct
tip lines than without, and the two inboard of them up to 30 mm shorter,
because each junction is placed for the anchors it still serves. Whether a
real wing's totals move that way cannot be told from a sheet that only has
them one way.

---

## 5. Comparing a generated plan with a real one

`comparePlans` reports two numbers, and the distinction matters:

- **mean offset** — overall length difference, set by line length and wing
  size. Not interesting on its own.
- **shape deviation** — the spread once that offset is removed. *This* is the
  trim distribution across the span.

The interface compares the rows that carry the wing and the brake each against
its own offset. Makers measure a brake to different points — the Hook 6's is
144 mm longer than its A at the centre, the Ultralite 5's 570 — and under one
offset with the rest, its difference was read as the shape of the A to D rows.

Comparing a parametric wing of the Geo 7 MS's proportions against the real
thing — 11.52 m span, 2.84 m root, 24 cells a side, its own 14, 14, 15 and 14
anchors a row, its 527 mm riser, 6.5 m lines, on a circular arc of 0.88 —
gives a mean offset of 231 mm and a mean shape deviation of 117 mm over 57
anchors, the largest at the tip anchors A14, B14 and C15. The 12-cell test
wing, which is not that wing at all, is 83 mm and 192 mm from it.

The arc is the larger difference, and not in the direction a circle
suggests. The Geo 7 MS is published at 8.87 m projected on 11.52 flat, 0.77;
built on a circle of that ratio, the same plan fits its lines worse, 232 mm.
A real arc is flatter in the middle and steeper at the tip than any circle:
on the handbook's ellipse through that span, with its own tip lines, it comes
to 88 mm, against 112 on the circle of 0.88 with them. The reference wings are
built on that ellipse (`docs/reference-wings.md`). The tool is for diffing a
design against reference wings, not for claiming a match.

---
