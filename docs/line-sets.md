# Choosing a line set, and keeping it in trim

Two questions a designer actually has: **which line types should I stock**,
and **will this cascade hold its trim**.

## 1. Picking per line

`selectLines` chooses, for each line independently, the thinnest material that
carries it — and of two the same diameter, the stronger. For the 46-line test
wing that comes back with **five materials from two makers**: Liros DC 40 on
33 lines, and DC 60, DC 161, DC 201 and Edelrid 9200-70 on three or four each.

That is in the middle of what real wings use. One size of each, counted from
the line sheets in `data/reference/`:

| | line types | makers | of them aramid / Dyneema |
| --- | --- | --- | --- |
| UP Makalu 5, a school wing | 3 | 1 | 0 / 3 |
| Niviuk Takoo 6, a tandem | 4 | 2 | 2 / 2 |
| Niviuk Hook 6 | 7 | 2 | 7 / 0 |
| PHI Allegro X-alps 21 | 8 | 2 | 4 / 4 |
| Ozone Alpina 5, Zeno 2, Swift 6, Ultralite 5 | 9 | 2 | 7 or 8 / 1 or 2 |
| BGD Lynx 2 | 9 | 2 | 8 / 1 |
| Ozone Geo 7 | 10 | 2 | 4 / 6 |
| UP Summit X | 12 | 2 | 9 / 3 |
| UP Meru 2 | 16 | 2 | 7 / 9 |

A type here is one strength grade of one family — Edelrid 8001-050 and
8001-070 are two — and most linesets are a grade at each step of load, from
two families.

**What this section used to say.** That picking per line gave "six distinct
materials from three suppliers", that "nobody builds a wing that way", and
that "real wings use four to six types from one supplier". Two of the sheets
on file have that few; the other eighteen have seven or more, of two
makers. And the six were five and a mistake: two lines of one diameter were
taken weakest first, so of the two 0.50 mm lines in the catalogue every
lightly loaded line got the one rated 25 daN kinked and not the one rated 41 —
98 of the default wing's 114 lines, on a line PHI use nowhere, where PHI's own
top lines are the other.

## 2. Which N types — solved exactly

Fewer types is still a fair thing to want: every one is another spool to buy
and another chance of sewing the wrong line into the wing.

Sort the materials by strength. Any line takes the cheapest chosen material
that carries it, so **a choice of N materials partitions the load-sorted lines
into N contiguous groups**. Minimising over all such partitions is a
one-dimensional k-segmentation, which dynamic programming solves exactly in
O(lines × materials²).

A greedy pick would be quicker and would lose on the cases that matter: the
best set of four is not usually the best set of three plus one.

| types allowed | used | drag penalty against one line per anchor |
| --- | --- | --- |
| 1 | 1 | 70.9% |
| 2 | 2 | 16.0% |
| 3 | 3 | 5.1% |
| 4 | 4 | **1.0%** |
| 5 | 5 | 0.0% |
| 12 | 5 | 0.0% |

**Four types cost 1%**, and it stops adding types that buy nothing: allowed
twelve, it uses five.

### Two bugs worth recording

**A negative penalty**, which is impossible: the constrained answer appeared
to beat the unconstrained one. The cause was that **strength order and
diameter order are not the same** — a better material is stronger *and*
thinner, so "the weakest that carries" can be thicker than something further
down the list. The floor was being computed with the wrong material.

**Every wing came back infeasible.** `dp[1]` is Infinity when no single
material covers every load, and `Infinity < Infinity × 0.999` is false, so a
search seeded at one type never moved off it. The comparison was right; the
starting point was not.

## 3. Strength and drag are not the whole story

A line set has to hold its **trim**, and the fibres do not behave alike. What
the people who make and service wings say:

- **Dyneema shrinks.** "Dyneema (and Vectran) lines settle in during the first
  20 to 50 hours of flying. Typically all Dyneema lines shrink a little over
  this period", and "the more lightly-loaded rear lines shrink more than the
  front lines" (Aerofix, a service workshop). UP say it of their own wings:
  "as soon as a glider with shrunken lines is taken out for its next flight,
  the A and B lines, which carry much more weight than the C lines, will
  return to their original length, while the C-lines will remain too short and
  bring the glider out of certified trim." Under load it is the stable one —
  "they don't stretch (much)".
- **Aramid holds its length.** "Several years before the shrinkage is
  sufficient to require any trim adjustment" (Aerofix); "at least they don't
  shrink" (UP). What aramid loses is strength where it is bent.

Rear lines short of the front is nose up: slower, and nearer the stall.

### Which line is which

The model took a line's fibre from its name, and had the two commonest
families backwards. Each family is held to a record now —
`data/reference/line-materials-suppliers.tsv`, with the supplier's data sheet,
a DHV test report or a maker's materials list behind it:

| | core | cover | says |
| --- | --- | --- | --- |
| Edelrid 8000-U | aramid | none | DHV line test LI 452-2016 |
| Edelrid 8001 | aramid (Technora) | none | Edelrid, "Magix Pro Dry" |
| Edelrid 7343, 6843 | aramid (Technora) | polyester | Edelrid data sheets |
| Edelrid 7850, 7950 | Dyneema | polyester | Edelrid data sheets |
| Edelrid 9200 | Dyneema | none | DHV line test LI 1042.2021 |
| Liros PPSL, PPSLS, DSL, DFL | Dyneema | polyester | Liros catalogue, 2024 |
| Liros DC | Dyneema | none | Liros catalogue |
| Liros LTC | aramid (Technora) | none | Liros catalogue |
| Liros TSL | aramid (Technora) | polyester | Liros catalogue |
| Teijin TNL | aramid | polyester | Niviuk's materials list |
| Liros TCR, Cousin's Vectran | aramid, Vectran | none | inferred, and marked so |

It had the 8000-U and 8001 as Dyneema, PPSL as aramid, DSL as "polyester", the
bare Technora lines as sheathed and Edelrid's sheathed aramid as bare. Of the
78 lines in the strength table **48 are aramid**, 26 Dyneema and 4 Vectran;
the model had 14 as aramid, and nine of those are Dyneema.

**The strength table sorts by fibre on its own.** It gives each line new and
kinked, and what a line keeps kinked is the fibre's:

| | lines | keep, kinked |
| --- | --- | --- |
| aramid | 48 | 38 to 70%, 53% in the middle |
| Vectran | 4 | 30 to 66% |
| Dyneema | 26 | 59 to 114%; 22 of them 85% or more |

One Dyneema line is under 70% and no aramid line over it: a classification got
from data sheets and one got from PHI's test rig agree on 77 lines of 78. (The
standard's own bending test, 5,000 cycles, is gentler and closer between the
two: the DHV's aramid line keeps 63% and its Dyneema line 68%, one line of
each.)

Real linesets say what the makers choose. Of the twenty on file, fourteen
have more aramid types than Dyneema — every Ozone but the Geo 7, the BGD, four
of Niviuk's five — and three have more Dyneema: UP's Torre, the Geo 7, and the
Makalu 5, a school wing in sheathed Dyneema throughout. PHI's is Dyneema in
its top lines over aramid below.

### How far a line moves

`lineDrift`, for one line:

- an **unloaded** Dyneema line ends 0.4% short once settled — under the bound
  Liros give for theirs, "shrinkage < 0.5 %" — with a time constant of 20
  flying hours, which is 71% of it by 25 hours and 92% by 50;
- a line carrying the **neutral load** or more holds its length; between
  nothing and that, in proportion;
- an unloaded **aramid** line loses 0.06% a year and nothing at first.

The load is what the line carries in **level flight**, over its strength new,
and the neutral load is **2.5%** of it. That is set from a real lineset: on
PHI's Allegro X-alps the A and B top lines carry 3.1 and 3.4% of their
strength (`publishedCascadeLoads`), the C row's 1.9% and the D row's 1.0%, and
UP's account is that the A and B lines come back and the C lines do not.

On a 6.5 m line:

| hours | Dyneema, unloaded | Dyneema at half the neutral load | Dyneema at it | aramid, unloaded |
| --- | --- | --- | --- | --- |
| 20 | −16.4 mm | −8.2 | 0 | −1.6 |
| 50 | −23.9 mm | −11.9 | 0 | −3.9 |
| 200 | **−26.0 mm** | −13.0 | 0 | −15.6 |

(Two hundred hours is four years here: the standard pairs 150 hours with
three.)

### The points are what move the wing

A wing hangs from attachment points, and a point moves by the **sum** of the
lines under it. `trimDrift` works on the plan's paths (`planPaths`) and
reports each row's mean, how far apart the points have moved from one another
— which is what an inspection's one offset cannot take out — and the rotation.

| | points apart at 50 h | at 200 h | rear rows | trim at 200 h |
| --- | --- | --- | --- | --- |
| PHI Allegro X-alps 21, as built | 3.9 mm | 6.7 mm | D 3.5 mm short | +0.09° |
| the same with its aramid lines in Dyneema | 8.9 mm | 9.7 mm | D 3.5 mm | +0.07° |
| the Swoop2, its own sheathed Dyneema | 17 mm | 18 mm | C 14 mm short, A and B 7 | +0.36° |
| the default wing, 0.5 mm Dyneema | 22 mm | 24 mm | D 5 mm short; stabilo 24 | +0.11° |

PHI's is a lineset worked hard — thin lines for the load, its A and B top
lines at 3% of their strength — with aramid in the long middle lines, and it
holds. The Swoop2's lines are thick for what they carry (its top lines 120
daN for about one), so they keep most of their shrinkage and the rear row,
which carries least, keeps most of all. The brakes carry nothing in trimmed
flight and come out shortest on every wing: 24 to 31 mm
(`docs/inspection.md`).

What takes a cascade out of trim is not light loading but **uneven** loading.
The test wing's cascade in lines three times as strong throughout shrinks
5 mm more in the A row and is no further out: the offset takes the common
part. With only its rear rows over-strong it is out of the band by its first
check.

## 4. Why the first check comes early

Settling saturates: most of the movement is in the first 25 to 50 hours. A
check before anything is measurable finds nothing; one at 150 finds it long
after it happened. `trimSchedule` reports two things against the PMA's 12 mm:

- when two attachment points are a whole tolerance apart — a measurement
  would show it;
- when they are more than twice that apart — no one offset brings both inside
  the band.

The **Line set & trim** button writes both for the design on screen, with the
rows' means.

## 5. What is estimated, and what this page used to say

**The sizes are estimates.** This project has no measurements of aged lines.
The directions are the makers' and a workshop's; the sizes are held to what
those sources give — a supplier's bound, "the first 20 to 50 hours", "several
years" — and to one real lineset for the neutral load.
`FIBRE_BEHAVIOUR.provenance` says so, and a drift result carries
`source: 'estimated'`.

**It used to say the opposite**, on both fibres and with more confidence:
"Dyneema creeps. Under sustained load it elongates permanently. Worst in the
most heavily loaded lines, which are the A's. Aramid shrinks. It takes up
moisture and relaxes, roughly uniformly" — "the directions are well
established". Its table had a Dyneema A line 21.7 mm *longer* at 200 hours
and an aramid C line 11.5 mm shorter, and its conclusion was that a cascade
of one fibre "drifts as a unit and stays in trim" while a mixed one moves
1.7°.

Three things were wrong under it besides the fibres' names:

- **How hard a line works** was taken as its share of the 8 g limit load with
  its margin. What a line carries hour after hour is level flight, a twelfth
  of that — and at a twelfth the model's own creep came to under a millimetre.
- **A row's drift** was the mean over its *lines*, top, middle and main as so
  many samples; an attachment point moves by their sum, about three times as
  far.
- **"One fibre throughout holds its trim"** was true of the model and is not
  true of Dyneema, whose own account is that the rear lines stay short.

## 6. Sources

- UP Paragliders, "What material are the lines made of and why":
  <https://www.up-paragliders.com/service/faq/products/what-material-are-the-lines-made-of-and-why>
- Aerofix, "Why do lines shrink?" and "Line material":
  <https://aerofix.com/why-do-paraglider-lines-shrink/>,
  <https://aerofix.com/paraglider-line-material/>
- Liros, PPSL 120: <https://www.liros.com/catalog/en/ppsl-120-p3407/>
- the line families: listed with their sources at the head of
  `data/reference/line-materials-suppliers.tsv`

Retrieved 2026-10-07.
