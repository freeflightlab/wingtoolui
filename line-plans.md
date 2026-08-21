# Line plans, risers and rigging

What three production line sets taught, and how the module was shaped by them.

Reference data: complete suspension line details for the **Geo 7** (5 sizes),
**Lyght** (5 sizes) and **UltraLite 5** (7 sizes) — 17 sheets, each a full
production cut list with a cascade totals matrix, exported from OzoneCAD.
Converted to TSV under `data/reference/`.

---

## 1. Rows and risers are not the same thing

This is the finding that reshaped the module.

The handbook builds one cascade per anchor row. Every one of these wings has
**more anchor rows than risers**:

| Wing | Anchor rows | Risers | Cascaded |
| --- | --- | --- | --- |
| Geo 7 | A B C D | A B C | D into the C riser |
| Lyght | A B C | A B | C into the B riser |
| UltraLite 5 | A B C D | A B C | D into the C riser |

Assuming one riser per row gets the riser count wrong, the load split wrong,
and produces a wing that cannot be rigged. So a plan holds a list of risers,
each naming the rows it carries, and only the row that *owns* a riser gets
riser-level lines — a cascaded row continues in `M` numbering and joins the
same maillon.

---

## 2. The naming grammar

Consistent across all three manufacturers' diagrams:

```
<ROW><LEVEL><INDEX><variant>          A1   AM3   AR2   KMU4   CRL4   A1a
```

| Part | Meaning |
| --- | --- |
| `A B C D E` | load-bearing rows, front to back |
| `K` | brakes |
| `Z` | collapse / stabilo lines (Lyght) |
| *(no level)* | upper line — attaches to the canopy |
| `M` | middle cascade |
| `R` | riser level — attaches to the riser maillon |
| `MU`/`ML`, `RU`/`RL` | a level split upper/lower, e.g. a brake through a pulley |
| index | numbered from the wing centre outward |

UP Paragliders uses a **fourth level** and names two of them rather than
suffixing:

| form | level | example |
| --- | --- | --- |
| lowercase | top line, to the canopy | `a1` |
| uppercase | middle | `A1` |
| roman numeral | upper-main | `AI`, `CVI` |
| `main` + index | riser | `Amain1`, `BRmain` |

Roman numerals have to be read before digits: `AI` and `A1` are different
lines on the same wing. And two-letter rows need matching explicitly — a
greedy `[A-Za-z]{1,2}` takes `AI` out of `AIII`, fails the row check and
returns, silently discarding every numeral above II.

### Advance inverts it: the level is a prefix

The TAU DLS puts the level first and allows a row to be a **pair**:

| name | level | rows | reading |
| --- | --- | --- | --- |
| `1A3` | 1, at the canopy | A | third A line |
| `2AB2` | 2 | A **and** B | one line carrying both rows |
| `3CD1` | 3 | C **and** D | one line carrying both |
| `4AB1` | 4, at the riser | A and B | |

Two consequences.

**A prefix level is relative.** `3CD1` is a *riser* line on a three-level wing
and a *middle* line on a four-level one, so it cannot be resolved from the name
alone. Parsing records `depthFromCanopy`, and `resolveCascadeLevels` maps it
once the whole set is known.

**A combined row is not a naming quirk.** `2AB2` carries the A and B rows
together — **70% of the load** against the 35% a single-row reading gives.
Undersizing by a factor of two is the kind of error a naming convention should
not be able to cause, so `combinedRowShare` sums the rows a line actually
serves. Merging is how a cascade cuts line count without cutting anchor count,
and it is why a merged line is the thickest at its level.

### Generating one

`buildLinePlan` takes `mergeRows: [['A','B'],['C','D']]`. Each row keeps its
own top lines — they attach at different chord positions and cannot be shared
— and everything below joins.

| | lines | total length | Cx lines |
| --- | --- | --- | --- |
| unmerged | 76 | 271 m | 0.0070 |
| A+B merged | 69 | 215 m | 0.0052 |
| A+B and C+D | 62 | 159 m | **0.0040** |

A 43% cut in line drag, which is why makers do it, paid for in thicker merged
lines and a cascade that is harder to trim.

**The merged cascade must keep the same number of levels.** Collapsing middle
and riser into a single line was the first attempt here: line count fell, and
every top line then had to span most of the way to the maillon, so total
length rose by a quarter and drag with it. The junctions have to stay where
they were; only their ownership changes.

Combined rows also occur in suffix form — the K2 5 carries `DE1`–`DE4`, which
went unrecognised until this. The guard that makes it safe is that both
letters must be load-bearing rows: there is no R row, so `BR1` falls through
and reads correctly as the B row's first riser line rather than a combined
B-and-R line.

![Seven naming conventions decoded by one grammar](img/naming-conventions.svg)

*The same cascade, canopy to riser, as five manufacturers write it. Colour is
the level the parser resolves, not the text.*
| `a`/`b` | a further split of one line (Lyght A-row) |

---

## 3. Topology is recoverable from lengths alone

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

## 4. Riser length is recoverable too

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

## 5. Where the junctions actually sit

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
the short ones — 250–650 mm across the whole inventory.

An earlier construction placed both junctions barely a third of the way up.
The wing still built, the totals were still roughly right — but the upper
lines came out several times longer than any real wing's, and total line
length was 543 m against a real 263 m. Correcting the fractions brought it to
318 m for a slightly larger wing. There is a test pinning mean upper-line
length to the 100–900 mm band, because this failure is invisible in the totals.

---

## 6. Tip lines skip the middle cascade

On the Geo 7, A13 and A14 are 1205 mm and 977 mm where every inboard A line is
300–500 mm, and they have **no middle line above them**: the outermost anchors
take one long line straight to the riser level. `tipDirectAnchors` reproduces
this.

Worth noting what it does *not* change: total carabiner-to-canopy length is
barely affected, because the junctions lie near the straight line from maillon
to anchor whatever the level count. It changes the cut list and the number of
pieces, not the trim.

---

## 7. Comparing a generated plan with a real one

`comparePlans` reports two numbers, and the distinction matters:

- **mean offset** — overall length difference, set by line length and wing
  size. Not interesting on its own.
- **shape deviation** — the spread once that offset is removed. *This* is the
  trim distribution across the span.

Comparing a parametric wing of roughly Geo 7 MS proportions against the real
thing gives a mean offset of ~215 mm and a mean shape deviation of ~104 mm,
with the largest deviations at the tip anchors. Those are genuine differences
between two different wings — a flatter arc puts the tip anchors further from
the pilot — not errors in the cascade. The tool is for diffing a design against
reference wings, not for claiming a match.

---

## 8. Not yet modelled

- **Brake cascade geometry.** Brake lines (`K`, `KM`, `KMU`, `KRU`/`KRL`) are
  parsed and named but not generated: they run to the trailing edge with a
  deliberately uneven distribution and a pulley.
- **Collapse / stabilo lines** (`Z` row on the Lyght) — parsed, not generated.
- **Line materials and load.** The sheets group by material code
  (`LIN-8001-050-BLUE`, `LIN-PPSL200`) with sheathed and unsheathed types.
  Selecting a diameter needs the load model.
- **Left/right asymmetry.** Quantities of 2 and 4 encode mirror pairs;
  asymmetric colour or line plans are not represented.
- **Riser hardware** — maillons, pulleys, speed system travel, trimmers.
