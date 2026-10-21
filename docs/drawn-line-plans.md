# The makers' own drawings of their line plans

A line sheet gives each line's length. It does not say which line hangs from
which: Ozone's leave the cascade to be recovered from the lengths
(`inferTopology`), and the readers take a line's level and row from its name.
A maker's line-plan drawing states both. Six are on file, transcribed line by
line into `data/reference/lineplan-*.tsv`:

| drawing | maker | wing | lines | canopy lines | risers drawn |
| --- | --- | --- | --- | --- | --- |
| rigging diagram | Ozone | Vibe GT | 103 | 62 | A, A2 (split), B, C |
| line plan | UP | K2 5 | 150 | 97 | A, B, C, D |
| line plan | UP | Makalu 5 | 84 | 56 | A, B, C |
| line plan | UP | Torre | 102 | 60 | A, C |
| line map | UP | Summit X | 97 | 59 | A, B, C |
| line plan | UP | Meru 2 | 108 | 59 | A, C |

One row a line, and the line it hangs from:

```
line    parent     also
a1      A1
A1      Amain1
Amain1  riser A
sa1     ST1        a13
```

A parent that is not a line is where the cascade ends — `riser X`, or `handle`
for the brake. None of the drawings says which riser the stabilo line is fixed
to, so it ends at `riser S`. `also` is another sheet's name for the same line:
the Meru 2's component sheets call its six stabilo lines `a13` to `c15`, where
the drawing and the totals call them `sa1` to `sb3`; the published totals pair
them to 2 mm.

`parseStatedTopology` reads a drawing, `statedPathTotals` sums each path from
a sheet's lengths against the totals, and `applyStatedTopology` gives a sheet's
lines what the drawing settles. Advance's TAU DLS drawing is on file too; it
fixed the reading of prefix levels and paired rows (`docs/line-plans.md`), and
with no lengths for the wing it is not transcribed.

---

## 1. What they confirm

**The inference.** On Ozone's own wing, recovering the cascade from lengths
alone gives the drawing on **every row of every size — 30 of 30** (A, B, C, D
and K, XS to XL). BGD's Lynx 2 had been the only place it could be checked.

**UP's sheets, and the drawings themselves.** On all 20 of UP's component
sheets, every line drawn is listed and every line listed is drawn. Summing each
drawn path from the sheet and taking it from UP's published total leaves the
riser — one length for every path through the same main line, to within
**17 mm** on the rows that carry the wing and 21 mm on the stabilo. A check
that cannot fail checks nothing: on the K2 5, `a7` moved from `A3` to `A5`
leaves 230 mm, and to `A1`, whose middle line is 30 mm shorter than its own,
30 mm.

On UP's wings, where lines of one length are common, the inference merges
branches it cannot tell apart — 47 of 103 rows come out exactly — and never
splits a branch that carries the wing. It does split the K2 5's brakes: their
totals scatter by up to 35 mm against the 12 it allows.

---

## 2. What they correct

### Stabilo lines counted as anchors

On the Summit X, `a13` to `a15`, `b13` and `b14` hang from the stabilo line
`STI`, not from an A or B main. By name they were A and B anchors, so its A row
was counted as 15 where it is **12**, and its front-row density as 0.54 where
it is **0.43**. The median over the twenty designs moves from 0.54 to 0.53.
The Meru 2's component sheets had the same six lines in its A and C rows, and
disagreed with its own totals sheet; they agree now.

### Roman numerals at the riser

A roman numeral is UP's level between the middle lines and the mains on the
Torre and the Meru 2, and that is how a name alone reads. On the Makalu 5 there
is no Amain: `AI` to `CIII` go to the risers, and its sheets mark them "loop
on maillon". Read by name the Makalu 5 had no main line in any row. `STI` is
the stabilo's line to the riser on all five. Where a row has no `Xmain`, its
roman numerals are its mains now (`parseUpLineSheet`, `atRiser`).

### Two-liners on four rows

The Torre and the Meru 2 have **two risers**: the a and b anchors of a rib share
one line onto the A mains, the c and d anchors onto the C mains, and there is
no B or D main. Niviuk's Artik R 2 has A and C mains and no others.

The anchor-density table took the riser count as one fewer than the rows, so
all three sat in the three-riser group, and "two-liners taper much harder than
three-liners" was quoted from it. The risers are counted from each design's
main lines now, and the table is keyed by layout:

| risers / rows | designs | front row ÷ rear row |
| --- | --- | --- |
| 2 / 3 | Alpina 5, Lyght, Zeno 2 | 2.58 – 3.75 |
| 2 / 4 | Torre, Meru 2, Artik R 2 | 1.20 – 1.50 |
| 3 / 4 | nine | 1.00 – 2.50 |
| 4 / 5 | K2 5, Magnum 4, Takoo 6 | 1.33 – 1.82 |
| 4 / 9 | Skin 4 P | 3.00 |

It is the two-liners on **three** rows that taper. The four-row ones pair their
rows on each riser and taper less than most three-liners. The tool has the
layout now, `A+B/C+D`.

### A main in two parts is one main

The Geo 7's fourth C main is `CRL4`, 970 mm at the riser, with `CRU4` above
it; the Zeno 2's third B main is `BR3`, 611 mm, with `BRU3`; the Alpina 5 has
two such; Ozone's Vibe GT diagram draws `BRL4` and `BRU4` in series. Counted
as lines they made the Geo 7 "C:5", the Zeno 2 "B:4" and the Alpina 5 "A:4
B:4". They are C:4, B:3 and A:3 B:3 (`cascadeCountsOf`) — and the Geo 7's
fourth C main is its stabilo's line (section 5).

### The sheet names

Summed against its totals size by size, the Summit X's sheets left an A
riser of 320, 249 and 236 mm on the M, SM and S — one that shrank by 70 mm a
size. `tools/read_xls.py` paired each sheet of a workbook with the next
sheet's name — the first substream of a BIFF file is the workbook's own
globals — so every UP `.xls` sheet on file was one size late: the totals sheet
was filed as the L, the L as the M, the S as "sheet5". Nineteen files, the
Makalu 5's, the Meru 2's and the Summit X's, are filed under their own names
now, byte for byte as they were, and the same sums leave 534, 507 and 507 mm.

Two things followed. The one component sheet that fails its own arithmetic
is the Meru 2's **M** folding lines, not the SM's — and under its own name the
cause is plain: all twenty-two of its cutting lengths are the SM sheet's. And
the loop-allowance figure, which says "size M", had drawn the L.

### st1, twice

The Makalu 5's totals sheet lists `st1` twice and `st2` not at all; its line
plan and its component sheets have both. "st1 appears twice" had been put
down to reading a multi-size sheet as one wing. It is UP's.

---

## 3. A cascade written down is built as written

The middle count in a written cascade was parsed and dropped: the anchors were
paired whatever the text said, so the K2 5's "A 18 6 3" built eight middle
lines. A count of mains for a row hanging from another row's mains was ignored
the same way, and so was a K row. And the example in the panel, "the Zeno 2,
from its own plan: A 30 14 3, B 14 6 4, C 8 3 2", was not: the Zeno 2's sheet
has nine A middles, thirteen B middles that carry the C row's top lines too,
and no C main.

Every count is built or refused now (`parseCascadeSpec` against the riser
layout, `middlesPerRow`): a row on another row's riser gives anchors and
middles, K gives the brake, a level more than the generator builds is refused,
and a count the wing cannot take — more anchors than ribs — is built as near
as it goes, and the panel says so. The brake's middles came out
`round(m / n)` to a riser, so 5 over 2 made 6; they are shared out exactly. The
example is the Geo 7 MS, line for line. "Solve anchors" writes the plan it
built rather than its anchors and mains.

---

## 4. Each wing's own suspension

`DESIGN_LINES` holds each design's cascade as far as the generator can build
it, measured from its sheets — the riser layout, every row's anchors and mains,
the middle lines where the row has the generator's shape (one level of them,
no more than three anchors to a middle line), and its tip lines where the
sheets show them (section 5) — and the corpus stage holds it to them figure
for figure. Nineteen designs; fifteen on a layout the tool has. Five rows on
four risers, and the Skin 4 P's nine, are not.

**The full pipeline** builds every such wing from it. The own designs had been
six Ozone wings, so the **BGD Lynx 2 — a three-liner, with A, B and C mains on
all four of its sheets — fell to the aspect-ratio rule at 6.2 and was built
as a two-liner**; the Artik R 2 as a two-liner on three rows.

**The wing picker** gives a published wing its own riser layout and line counts
where its sheets are on file, written out as a cascade the designer can read
and edit, and where they are not, the layout the pipeline would give it and
anchors solved to its published line length as soon as it is built. It kept
whatever layout the panel held, on every second rib: a two-liner was built on
three risers until the designer changed it.

What the real counts give, against the published line totals:

| | wings | built from | line total against published |
| --- | --- | --- | --- |
| Hook 6 | 6 | its own counts | +1 to +2% |
| Ultralite 5 | 7 | its own counts | −3 to +7% |
| Geo 7 | 5 | its own counts | +9 to +12% |
| Alpina 5 | 6 | its own counts | +30 to +31% |
| Lynx 2 | 5 | its own counts | +30 to +40% |
| Artik R 2 | 6 | its own counts | +36% |
| Zeno 2 | 4 | its own counts | +46% |
| sixteen others | 16 | anchors solved to the total | −21 to +9% |

The count is kept because it sets the loads, and the length is reported.

---

## 5. Where a row ends, and the stabilo

Built from its own counts, a Hook 6 first strayed further from its own sheet
than one on every second rib, and the reason was where the anchors went: every
row spread to the tip. Rows were then stopped at "the rib 82 to 86% of the way
out, on all six drawings", and that was wrong twice. It is not what the
drawings say, and nothing went on to the tip: the pipeline's wings had no
lines on their outer sixth, and the picker's had the two lines a separate
stabilo added there, carrying no lift, beside each row's tip lines left
inboard.

**What the plans say.** Five give rib positions — four of UP's drawings number
their ribs, BGD's sheet lists each line's — and Ozone's diagram draws the cells:

| plan | front row's own last line | the stabilo's lines | rear rows |
| --- | --- | --- | --- |
| K2 5 | rib 24 of 29, 0.82 | 27 to 29, 0.93 to 1.0 | D and E every second rib, as far as A |
| Makalu 5 | rib 19 of 24, 0.78 | 21 to 24, 0.87 to 1.0 | D ends at A's eighth |
| Torre | rib 28 of 34, 0.82 | 31 to 33, 0.91 to 0.97 | B and D end at A's and C's |
| Meru 2 | rib 37 of 43, 0.86 | 40 to 42, 0.93 to 0.98 | B and D end at A's and C's |
| Lynx 2 | rib 28 of 33, 0.85 | 30 to 32, 0.91 to 0.97, on BR4 | C stops at 28; D at A's eighth |
| Vibe GT | A12, about 0.89 off the diagram | A13 to B14 at the tip, on BRU4 and BRL4 | D's eight end inboard |

(Fractions of the half span in cells; the Summit X's map has no ribs.) So the
rows stop at 0.78 to 0.89, median 0.84 (`frontReach`), a row with fewer
anchors stops with the front row's of the same number — the K2 5's D and E
are the exception — and the stabilo's lines start 0.87 to 0.93 of the way out
(0.98 on the Vibe GT's diagram) and run to the tip (`tipReach`, 0.92 to 0.99).
On the Lynx 2 even the C row, which has no line on the stabilo, stops at rib
28.

**The stabilo, named in the rows.** UP name the stabilo's lines `sa`, `sb` and
`st`. Ozone, Niviuk and BGD name them in the rows they sit outboard of, and the
totals show which: below its top line every canopy line's path is its total
less that top line, and lines of different rows on one remainder share every
line below their top lines (`tipLinesFromTotals`).

| design | tip lines | path below them |
| --- | --- | --- |
| Geo 7 | A13, A14, B13, B14, C15 | 5092 mm on the MS, against 6262 to 6497 for the rows' own: the riser and CRU4 on CRL4 |
| Ultralite 5 | the last two of A, B, C and D | 4607 and 4612 mm on the 19 |
| Vibe GT | A13, A14, B13, B14 | 5658 mm: the riser and BRU4 on BRL4, which its diagram draws to the B riser |
| Swift 6 | A17, B17 | 6105 mm |
| Hook 6 | a10, b10 and the ninth C, `c10` | 4337 mm on the 20 |
| Artik R 2 | A13, C13 | 5517 mm on the 20 |
| Lynx 2 | a15 to a17, b16 to b18 | stated: all on BR4, a B-riser main (`tipLinesFromPaths`) |

The Geo 7's five are the same five in all five sizes, equal to the
millimetre in four of them and within 2 mm in the ML, and twenty millimetres
on one of them takes it off the line. Two rows that end inboard on
one middle line — the Swift 6's eight C and D — are a cascade, not a stabilo,
and are not counted. These are the eight designs whose `DESIGN_LINES` carry
"tip n"; a written cascade can say it too (`A 14 6 3 tip 2`).

Where the tip lines' path, less the riser the front rows leave, is one main
line, that line is the stabilo's (`stabiloMainFromTotals`): the Geo 7's
"fourth C main", CRU4 on CRL4, within 15 mm in every size, and by the same
test the Vibe GT's BRU4 on BRL4, which its diagram draws; BGD state the Lynx
2's BR4. None of the three is its row's own, so the Geo 7's C row has three
mains, not four, and its stabilo hangs on the C riser ("S C"), the Vibe GT's
and the Lynx 2's on the B.

**Built that way.** Each row's own anchors stop at the front reach and its tip
lines go to the tip ribs; with a stabilo (`stabilo: true`, which the picker and
the pipeline use) they hang on one line, from a junction four fifths of the way
up, to the riser a design's sheets say or the one that carries B. On a wing of
the Geo 7's size and counts its tip lines come out 1.04 to 1.22 m on a stabilo
line of 4.50 m; the Geo 7's own are 0.98 to 1.21 m on CRU4 and CRL4, 4.56 m.

**The arc was the larger error.** The reference wings were built on a circle
through their projected span. Through the same span the handbook's ellipse —
the tip where its quarter ends — projects the 55 wings that publish a
projected area to within 1.0% of it on average (−2.0 to +2.1%); the circle,
2.0% out, is short on 51 of them. Niviuk publish no projected span, and their
projected aspect ratio and area define it: 9.07 m on a Hook 6 24, where the
area ratio had stood in for it, a twentieth flatter (`docs/reference-wings.md`).

Against the per-anchor totals of the 28 sizes that list them, the rows that
carry the wing:

| | shape deviation |
| --- | --- |
| circle, rows stopped at 0.84 with nothing beyond | 119 mm |
| ellipse, every row spread to the tip | 98 mm |
| ellipse, rows stopped and tip lines on the tip ribs | 89 mm |
| the same on one stabilo line | 88 mm |

On the Geo 7 test wing the ellipse with its own tip lines comes to 88 mm,
against 112 on the circle the generator had been fitted on and 205 on a circle
through its own projected span. The rows stopped at 0.84 had looked best on
the circle because they made up for its tip.

**The Hook 6 in the picker** comes to 87 to 112 mm on its 33 load-bearing
anchors, against 112 to 150 on every second rib. Its brake is compared by
itself — 94 to 112 mm, after an offset of 376 to 492 — because makers measure
a brake to different points: the Hook 6's is 144 mm longer than its A at the
centre, the Ultralite 5's 570, and under one offset with the other rows the
difference was read as their shape.

---

## 6. What is still open

- **The two-liners' bridles.** An Ozone two-liner's A row carries sixteen short
  bridles, `A1a` to `A8b`, on eight lines `A1` to `A8` that do not reach the
  canopy. The corpus counts all of them as anchors — 31 on the Alpina 5. Whether
  the bridles of neighbouring lines share ribs the sheets do not say, and no
  drawing of an Ozone two-liner is on file.
- **Middle lines the generator cannot shape** are paired: the Zeno 2's C top
  lines hang on its B middles, UP's Torre and Meru 2 have a level between their
  middles and their mains, Niviuk's Hook 6 shares middles between its C and D
  rows. The cascade text says which rows.
- **The brake's shape**, 91 to 197 mm from the real ones across the 28 sizes,
  on either plan.
- **Tip lines the sheets cannot show.** UP name the stabilo as a row of its
  own, and the Alpina 5, Zeno 2, Lyght and Magnum 4 publish no per-anchor
  totals: those designs take the default, two on each row that reaches the tip.
  Where the stabilo's own line is not one main, as on the Ultralite 5 and the
  Swift 6, it is not found, and the stabilo goes to the riser that carries B.
- **The stabilo's riser on a two-riser wing** is the rear one by assumption:
  UP's plans leave it undrawn.
- **The front-row density counts the stabilo's lines on some makers and not
  others.** Ozone's, Niviuk's and BGD's are named in the rows and counted;
  UP's are a row of their own and are not. Section 2 moved the Summit X's
  a13 to a15 out of its A row, 0.54 to 0.43; counted as the others are, it is
  0.54 again. `FRONT_DENSITY` holds them as the names give them.
- **The three-riser shape.** Of the nine three-riser designs only two are
  flat; the default stays flat because it fits them better than a taper at
  their ratio (59 anchors out against 73, row by row).
