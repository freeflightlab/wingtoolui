# Line plans, main lines and rigging

What three production line sets taught, and how the module was shaped by them.

Reference data: complete suspension line details for the **Geo 7** (5 sizes),
**Lyght** (5 sizes) and **UltraLite 5** (7 sizes) — 17 sheets, each a full
production cut list with a cascade totals matrix, exported from OzoneCAD.
Converted to TSV under `data/reference/`.

---

## 0. A riser is not a line

The PMA standard is explicit, and this project had it wrong for a long time:

> **Riser** — textile element between the main lines and the suspension point
> on the harness.
>
> **Main lines** — lines which are attached directly to the riser connectors.

So the three line levels are **upper**, **middle** and **main**. The riser is
webbing below all of them, and `docs/inspection.md` covers it. Anything below
that says "riser" means the webbing; the deepest *line* level is `main`.

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
each naming the rows it carries; and a row after the first on a riser hangs
from the first row's main lines and has none of its own. The Geo 7's D row is
six middle lines on the tops of the C mains, the Ultralite 5's the same, and
on the Lyght, the Zeno 2 and PHI's Allegro the rear row's top lines go onto
the row in front.

The generator gave the second row three main lines of its own, to the riser,
and called them middle lines (`DM7` to `DM9`): twelve metres a side that no
wing has. It hangs them from the host row's mains now (`shareRiserMains`), as
in the merged cascades of section 3, and every line attached to a riser is
called a main line, which is what the standard calls it.

---

## 2. The naming grammar

Consistent across all three manufacturers' diagrams:

```
<ROW><LEVEL><INDEX><variant>          A1   AM3   AR2   KMU4   CRL4   A1a
```

| Part | Meaning |
| --- | --- |
| `A` to `I` | load-bearing rows, front to back — four on most wings, nine on a single-surface one |
| `K` | brakes |
| `Z` | collapse / stabilo lines (Lyght) |
| *(no level)* | upper line — attaches to the canopy |
| `M` | middle cascade |
| `R` | main level — attaches to the riser maillon |
| `MU`/`ML`, `RU`/`RL` | a level split upper/lower, e.g. a brake through a pulley |
| index | numbered from the wing centre outward |

UP Paragliders uses a **fourth level** and names by case rather than by
suffix:

| form | level | examples |
| --- | --- | --- |
| lowercase | top line, to the canopy | `a1`, `br7`, `st3` |
| uppercase + number | middle | `A1`, `BR3`, `ST1`, `DE2` |
| roman numeral | upper-main | `AI`, `CVI`, `BRIV`, `STI` |
| `main` + index | main, at the riser | `Amain1`, `BRmain` |

`BR` is the brake and `ST` the stabilo's own cascade; `DE2` is one line
carrying the D and E rows. Roman numerals have to be read before digits: `AI`
and `A1` are different lines on the same wing. And two-letter rows need
matching explicitly — a greedy `[A-Za-z]{1,2}` takes `AI` out of `AIII`, fails
the row check and returns, silently discarding every numeral above II.

### One name cannot say whose it is

`A1` is a canopy line on an Ozone sheet and the line *under* the canopy lines
on a UP one. `BR1` is the B row's first main line to Ozone and BGD, and a
brake middle line to UP. So the reader of a UP sheet says whose it is —
`parseLineName(name, { convention: 'up' })` — and a bare name is read Ozone's
way.

The table above sat in this document, and in the comment over
`parseLineName`, for a long time before the function did it. It returned
`upper` for `A1` whatever sheet the name came from. On UP's component sheets:

| read as | were |
| --- | --- |
| canopy lines | the middle lines — `A1` to `A9` and `C1` to `C8` on the Meru 2 |
| main lines of the B row | the brake's middle lines, `BR1` to `BR6` |
| the stabilo's main line | its top lines, `st1` to `st4` on the K2 5 |
| nothing at all | `STI`, which is the stabilo's main line |

The lengths settle it. Read UP's way the Meru 2 M's levels run 448, 877, 1466
and 4542 mm on average, each longer than the one above. And its component
sheet then counts the canopy lines its totals sheet does: the Torre's said
A 20 and A 12.

`resolveCaseLevels` does the same for a hand-collected sheet, on the sheet as
a whole: where the canopy lines are written in lower case, a bare upper-case
name is the level below. Niviuk's Artik R 2 writes its C and D rows that way.

### Advance inverts it: the level is a prefix

The TAU DLS puts the level first and allows a row to be a **pair**:

| name | level | rows | reading |
| --- | --- | --- | --- |
| `1A3` | 1, at the canopy | A | third A line |
| `2AB2` | 2 | A **and** B | one line carrying both rows |
| `3CD1` | 3 | C **and** D | one line carrying both |
| `4AB1` | 4, at the riser | A and B | |

Two consequences.

**A prefix level is relative.** `3CD1` is a *main* line on a three-level wing
and a *middle* line on a four-level one, so it cannot be resolved from the name
alone. Parsing records `depthFromCanopy`, and `resolveCascadeLevels` maps it
once the whole set is known.

Niviuk number their levels the same way, and their five wings show what "the
deepest level is the main" gets wrong. The load-bearing rows are settled
together, because they hang from each other — the Ikuma 3's D row ends at
level 2, on the C row's mains. The brake and the stabilo are settled each on
its own: the Hook 6's brake ends at level 3 on a wing whose rows end at 4, and
had no main line. And one line alone at the deepest level is the lower piece
of a main, not the only main: the Skin 4 P's `4C3` is 0.6 m long.

**A combined row is not a naming quirk.** `2AB2` carries the A and B rows
together — **70% of the load** against the 35% a single-row reading gives.
Undersizing by a factor of two is the kind of error a naming convention should
not be able to cause, so `combinedRowShare` sums the rows a line actually
serves. Merging is how a cascade cuts line count without cutting anchor count,
and it is why a merged line is the thickest at its level.

## 3. Generating a plan

How closely a generated plan matches a real one, and what governs it.

### Validated against real line tables

Every reference sheet lists a **K row** alongside A/B/C/D. A generated plan
without brakes cannot be compared with one, and understates the wing by about
a fifth — so the brake cascade goes into the same plan.

With it, and an attachment every second rib, a three-liner lands within a
few lines of the real table:

| wing | lines, real | modelled | suspension mains, real | modelled |
| --- | --- | --- | --- | --- |
| Ozone Geo 7 MS | 112 | **108** | A 3, B 3, C 4 | A 3, B 3, C 3 |
| Ozone Swift 6 MS | 114 | **112** | A 3, B 2, C 4 | A 3, B 3, C 3 |
| Ozone Alpina 5 ML | 118 | 106 | A 3, B 3 | A 4, B 4 |
| Ozone Zeno 2 ML | 102 | 120 | A 3, B 3 | A 5, B 5 |

A main in two parts is one main — a short piece at the riser and the rest
above it, as the Geo 7's CRL4 (970 mm) and CRU4. Counted as lines, these read
C 5, A 4 and B 4 here until 2026-10-21.

The brake has four main-level lines on every plan — three to the cascade and
the shared lower line — where the sheets list two, one line in two parts. The
level split of the Geo 7 is 65 upper / 30 middle / 13 main against a real
68 / 31 / 13. The two-liners do not match, and the rest of this section is
why.

**This table used to agree better than the wings did.** It counted main lines
as one number, brakes in, and the Geo 7's came to 13 on both sides, while the
plan's D row ran three lines of its own to the riser as middle lines.

### Main lines are a fixed count, not a scaled one

A real wing has the **same number of main lines in every size**. The Geo 7
carries A:3 B:3 C:4 in XS, MS and L alike, the fourth C its stabilo's line;
the Alpina 5 and the Zeno 2 carry A:3 B:3 in every size.

The generator grouped by a constant chunk size, so its main count grew with
the anchor count. `mainsPerRow` fixes the count instead, which is what a maker
actually specifies; at three a row, nine suspension mains on a three-liner
and six on a two-liner, against the wings' 10, 9, 6 and 6. What a single number
cannot say is the Geo 7's C:4 beside its A:3 and B:3; a count per row is what
a written cascade is for (section 7).

It defaults to null, keeping the old behaviour, because a design that has not
said how many mains it wants should not silently be given three.

### What is still wrong: attachment density

With the mains fixed, the two-liners' remaining error is in the **upper**
lines, and measuring the real wings says why:

| wing | ribs per half | uppers per row | spacing |
| --- | --- | --- | --- |
| Geo 7 MS | 25 | 14.3 | every 1.75 ribs |
| Swift 6 MS | 27 | 12.5 | every 2.16 ribs |
| Alpina 5 ML | 34 | 20.7 | every 1.65 ribs |
| Zeno 2 ML | 40 | 17.3 | every 2.31 ribs |

Broken down per row, the pattern is not "the front row is densest" — the
Geo 7 has C:15 against A:14. It is about **riser count**:

| wing | risers | per-row uppers | front-to-rear ratio |
| --- | --- | --- | --- |
| Geo 7 MS | 3 | A:14 B:14 C:15 D:14 | 0.9 |
| Swift 6 MS | 3 | A:17 B:17 C:8 D:8 | 2.1 |
| Alpina 5 ML | 2 | A:31 B:19 C:12 | 2.6 |
| Zeno 2 ML | 2 | A:30 B:14 C:8 | 3.8 |

**A two-liner on three rows carries the shape on its front row**, thinning
sharply toward the trailing edge. On four rows it pairs them instead, A with B
and C with D (`docs/drawn-line-plans.md`), and tapers less than a three-liner.

`anchorsPerRow` takes a count per row, which reaches the fractional spacings
an integer stride cannot. The rows' own lines stop at the rib 84% of the way
out and their tip lines, the stabilo's, go on to the tip ribs; a row with
fewer anchors takes the front row's ribs from the centre out
(`docs/drawn-line-plans.md`, section 5). Given real counts it gives:

| wing | real | modelled | error |
| --- | --- | --- | --- |
| Geo 7 MS | 112 | **112** | 0% |
| Swift 6 MS | 114 | 104 | −9% |
| Alpina 5 ML | 118 | 122 | +3% |
| Zeno 2 ML | 102 | 105 | +3% |

**Worst error across four wings: 9%.** (The two-liners are built here with
their B and C rows merged, the brakes at each wing's own anchor count, and
the Alpina's four mains a row.)

`everyNthRib` still works and is still the default, because a design that has
not specified per-row densities should not be given someone else's.

### Deriving the densities: designs, not sheets

The reference set has 88 line sheets that state a wing's rows, and treating
them as 88 observations would be wrong. **The line topology is identical
across every size in a family** — the Alpina 5 runs A:31 B:19 C:12 in XS
through XL, the Ultralite 5 A:16 B:16 C:16 D:16 in all seven sizes. Only the
lengths scale.

So the evidence is **19 designs**, from four makers, and it is carried as
grouped ranges rather than a fit:

| load-bearing rows | risers | designs | front-to-rear ratio | mean |
| --- | --- | --- | --- | --- |
| 3 | 2 | 3 — Alpina 5, Lyght, Zeno 2 | 2.58 – 3.75 | 3.32 |
| 4 | 3 | 12 — Geo 7, Swift 6, Ultralite 5, Vibe GT, Lynx 2, four UP, three Niviuk | 1.00 – 2.50 | 1.62 |
| 5 | — | 3 — Magnum 4, Takoo 6, K2 5 | 1.33 – 1.82 | 1.65 |
| 9 | — | 1 — Skin 4 P, single-surface | 3.00 | |

The ranges do not overlap, but they nearly touch at 2.50 against 2.58 — so
this separates the two classes and would not settle a marginal case. The
riser count is taken as one fewer than the rows, which is what the first two
groups do; nobody counted the others'.

`tools/corpus-learnings.mjs` measures the table from the sheets, and the
check holds `ANCHOR_DENSITY` to it figure for figure.

**It said 27 designs here, and n = 20 for the three-riser group.** The
measurement took a file for a design whenever its name did not end in a size,
so the UP Torre was six designs — its totals sheet and each size's component
sheet — and the Makalu 5, Meru 2 and Summit X two each. Five of those six
Torres were also read with their middle lines counted as canopy lines. A
design is its maker and model now, whatever its sheets are called, and where
two sheets of one design count its rows differently the tool prints both. The
Meru 2's did: its totals sheet calls its six stabilo lines `sa1` to `sb3`, and
its component sheets call them `a13` to `a15` and `c13` to `c15`, counted in
the A and C rows. UP's own line plan settles it (`docs/drawn-line-plans.md`),
and they are read as stabilo lines now.

### Three shapes, because the designs show three

A single ratio was the first attempt. It fitted the two-liners at 6–8% and
missed the three-liners by a fifth and more, because they are not tapered at
all:

```
Alpina 5     31 19 12      taper — each row carries less
Zeno 2       30 14  8      taper
Geo 7        14 14 15 14   flat
Ultralite 5  16 16 16 16   flat
Swift 6      17 17  8  8   step at the midpoint
```

A two-liner **tapers**: the A row holds the shape and each row behind carries
less. A three-liner is **flat**, or **steps** once — its C row still reaches
the riser, so the front does not have to do the work. Forcing one curve
through all three is the kind of fit that looks reasonable and is wrong on
half the sample. With the right shape, every one of the six lands within 8%.

**Absolute density is an input, not a prediction.** Two three-liners in the
sample attach 56% and 89% of their ribs. Nothing here predicts that; it is a
choice about how much shape the sail holds by itself.

**Two-liners do not match, and the top of the cascade says why.** With the C
row hung from the B mains, as a real two-liner has it, the Alpina's plan has
the wing's own eight suspension mains — and twelve lines fewer than the wing,
eleven of them at the top: its A row splits each top line into two short
bridles to neighbouring ribs (`A1a` and `A1b`, 0.17 to 0.23 m), sixteen of
them, a level the generator does not build. The Zeno comes out 18 lines long, with
five mains a row against its three and four. Both are asserted, so the gap is
recorded rather than averaged into a pass.

(This said the reason was "in the main count": "10 against 12 on the
Alpina". The two were the brake's, and the suspension mains — when the C row
had three of its own to the riser — were 8 and 11.)

### A regression it caused

Putting brakes in the plan made them arrive at the load model as **anchors**.
They took a share of the span load alongside A/B/C/D, and the closure error —
which asserts that anchor loads sum to half the wing's weight — went from
0.02% to **19.7%**. (It is 0.001% now, with brakes or without.)

Brakes carry pilot input, not lift. They are now excluded from the lift
distribution while still being sized as lines, and a test asserts that adding
them changes the closure error and the total load carried by *nothing at all*.

That check existed for exactly this. A plan that looked more realistic had
quietly broken the load model, and nothing else would have shown it.

### Generating a merged cascade

`buildLinePlan` takes `mergeRows: [['A','B'],['C','D']]`. Each row keeps its
own top lines — they attach at different chord positions and cannot be shared
— and everything below joins.

On the 12-cell test wing with 7 m lines:

| | lines a side | total length, both sides | Cx lines |
| --- | --- | --- | --- |
| unmerged | 46 | 166 m | 0.0058 |
| A+B merged | 42 | 128 m | 0.0040 |
| A+B and C+D | 40 | 106 m | **0.0034** |

A 40% cut in line drag, which is why makers do it, paid for in thicker merged
lines and a cascade that is harder to trim.

**A merged line carried half its load until this was found.** It was listed
under the first of its two rows, and a line's tension was added up from the
loads of its own row at the anchors it listed — so the A row's alone went
into a line serving A and B, 73 N where it carries 146, and the risers of a
wing merged AB and CD held up 55% of the pilot. Every merged line was sized
for half what it carries, and the 44% this table gave came partly from that.
Tensions are worked down the plan's own paths now (`lineTensions`,
`planPaths`), and the risers carry the whole weight whatever is merged.

**The merged cascade must keep the same number of levels.** Collapsing middle
and riser into a single line was the first attempt here: line count fell, and
every top line then had to span most of the way to the maillon, so total
length rose by a quarter and drag with it. The junctions have to stay where
they were; only their ownership changes.

Combined rows also occur in suffix form — the K2 5 carries `DE1`–`DE4`, which
went unrecognised until this. The guard that makes it safe is that both
letters must be load-bearing rows: there is no R row, so `BR1` falls through
and reads correctly as the B row's first main line rather than a combined
B-and-R line.

![Seven naming conventions decoded by one grammar](naming-conventions.svg)

*The same cascade, canopy to riser, as five manufacturers write it. Colour is
the level the parser resolves, not the text. The figure is drawn by
`tools/make-diagrams.mjs` from the parser itself, and the check holds the file
to what it draws.*

One more suffix, on the Lyght's A row: `a`/`b` after the index is a further
split of one line.

---

## 4. The stabilo, and why naming does not find it

The stabilo is the outermost line group. It holds the tip against folding
under, and it is what a pilot pulls for big ears. Every reference wing has
one, and **it cannot be identified by name on most of them:**

| maker | how the stabilo appears |
| --- | --- |
| UP Paragliders | `sa1` `sb1` — explicit, an s-prefix — and a cascade of its own, `st1` `ST1` `STI` |
| Skywalk SAGE | `a17` `a18` `b17` `b18` — named as A and B, grouped in the sheet under "SAB", with the main `as4` colour-coded orange |
| Ozone | no marking at all; simply the highest indices in each row |

A parser looking for an S row finds the stabilo on **one manufacturer in
three**. So `findStabilo` tries the name first, and falls back to finding it
structurally.

### The signal is the gap

A wing's ordinary anchors are spaced fairly evenly. The stabilo sits past a
noticeably larger step, because the tip cells between it and the last ordinary
anchor are carried by it rather than by lines of their own. The typical
spacing is *measured* from the wing rather than assumed, and anything beyond
`gapFactor` times it is outboard:

```
0 3 6 9 12 15 18 21 24    even spread     -> no separate stabilo
0 3 6 9 12 15 18    24    one past a gap  -> 1 stabilo line
0 3 6 9 12 15    23 24    a pair          -> 2
0 2 4 6 8 10 12  22 23    dense inboard   -> 2, typical spacing 2 ribs
```

The first case matters as much as the others: a wing with no separate stabilo
is reported as having none, with a note saying so, rather than the outermost
ordinary anchors being silently relabelled.

### Generating a stabilo

A plan built with `stabilo: true` hangs every row's tip lines on one line, from
a junction four fifths of the way up, to the riser that carries B — as Ozone
draw the Vibe GT's A13 to B14 on BRU4 and BGD list the Lynx 2's a15 to b18 on
BR4. Its top lines keep their rows and carry the tip's lift; the closure error
is the same to the last digit. `addStabilo` adds one to a plan without tip
lines: two lines at 35% of chord on the outermost ribs, on a main of their
own, carrying handling load and not lift.

## 5. Not yet modelled

- **Collapse lines** (`Z` row on the Lyght) — parsed, not generated. The
  stabilo is now generated; the collapse row is not.
- **Left/right asymmetry.** Quantities of 2 and 4 encode mirror pairs;
  asymmetric colour or line plans are not represented.
- **Brake free travel from geometry.** The cascade is generated and the
  coupling to the speed system is modelled, but how much slack a brake carries
  at rest still has to be supplied rather than derived.

---

---

## 6. Reading real line sheets

Recovering topology, riser length and junction positions from a
manufacturer's published numbers is covered in `docs/line-sheets.md`.

---

## 7. Writing a cascade down

The generator derives a cascade from rules: an anchor count per row, then a
branching factor. That is fine for exploring and wrong for **describing** — a
designer copying a real wing, or specifying one for a builder, knows the shape
they want and could not say it.

The format is how every manufacturer sheet in this project counts: row,
anchors, middle lines, main lines, and how many of the anchors are tip lines.
A row hanging from another row's mains gives anchors and middles; K is the
brake; S says which riser the stabilo hangs on.

```
# the Ozone Geo 7 MS, counted from its sheet and its totals
A 14 6 3 tip 2
B 14 6 3 tip 2
C 15 6 3 tip 1
D 14 6 tip 0
S C
```

`parseCascadeSpec` reads it against the riser layout, `buildLinePlan` builds
every count it gives (the middles were read and dropped until 2026-10-21), and
`cascadeSpecFor` writes a plan back out (`docs/drawn-line-plans.md`).

### What it refuses

A spec is typed by a person, so the typos a person makes are caught rather
than built: a row name that does not exist, a level with **more** lines than
the one above it, a zero or negative count, a row given twice; and against
the layout, mains for a row on another row's riser, a row on none of the
risers, and a level more than the generator builds.

`/^[A-Z]{1,2}$/` accepted `QQ` as a row. Two letters is legitimate — `BR`
and `ST` are rows — so the test has to be against the known set, not against
the shape.

### Two defects it exposed

**`mainsPerRow` said per row and was one integer applied to all of them.** A
spec asking for A:3 B:4 C:2 could not be built; the A row came back with
seven. Real plans differ by row — the Lynx 2's own is A:3 B:3 C:2.

**`chunkInto` returned one group fewer than asked, whenever the division was
inexact.** Six middles into four came back as **three**, because
`ceil(6/4) = 2` and three chunks of two exhaust the array a group early; the
shortfall check compared against the same wrong arithmetic. Sizes are
distributed now, and an empty input returns nothing rather than one empty
group, a regression of the first fix that produced NaN line lengths.
