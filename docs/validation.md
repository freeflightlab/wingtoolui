# Validation notes

What was checked, how, and where this implementation knowingly differs from its
sources. Every claim here corresponds to a test in `tests/run-tests.js`, which
prints the figure behind each check when run with `--verbose`.

Sources are of three kinds, and they carry different weight. The **handbook**
and the author's later studies are the design method. **Production data** from
Ozone, UP, Niviuk, BGD, PHI and Skywalk is ground truth about wings that fly.
**Theory** — thin-aerofoil, lifting line, ISA — is checked against itself and
against the first two.

---

## 1. How the maths is validated

Four kinds of check, in descending order of strength.

**Exact closed-form cases.** A rectangular planform has area `span × chord` and
aspect ratio `span²/area` exactly. A circular arc of radius R laid with arc
length s has projected half-span `R·sin(s/R)` and tangent angle `s/R` exactly. A
half-circle billow of arc length π over chord 2 subtends exactly π radians.
These are asserted to machine precision — if they drift, something is wrong.

**Conservation properties the algorithm must obey.** The flat-development
method must unroll a *developable* surface with zero error, because such a
surface can be flattened without stretching. So the suite develops a flat
strip, a cylinder and a cone, and requires the distortion to vanish in all
three. The cylinder case is the sharpest: the unrolled panel must be an exact
rectangle whose width is the rib spacing and whose length is the arc length of
the section.

**Metrics that can move.** A one-sided check — "is the distortion small?",
"is the utilisation a fraction?" — is satisfied perfectly by a number that is
always zero. The panel distortion measure passed every test here for months
while being incapable of returning anything but zero (`docs/departures.md`
§3.1). So every reported quantity meant to vary is checked that it *does*, by
a meaningful amount and in the right direction, when the input it claims to
depend on is perturbed. Twenty-six of them, in one section of the suite.

**Production data as ground truth.** Where a manufacturer states something this
project has to infer, the inference is run against the stated answer. BGD's
line tables give their own cascade topology, so the topology inference — which
elsewhere has to recover branching from lengths alone — is checked against it
directly. PHI's cascade totals close exactly, so the arithmetic can be asserted
to the millimetre.

**The handbook's own worked example.** Section 4.4 prints a full spreadsheet
for a 25.70 m² wing. Every printed value is asserted: aspect ratio, total drag
coefficient, drag split, glide angle, chord angle, dynamic pressure, speed in
both units, glide ratio, centre of pressure, calage, and each of the five
individual moments.

---

## 2. Validation against production data

88 line sheets of 19 designs from four makers — Ozone, UP, Niviuk and BGD —
PHI's cascade table for one more wing, seven size families from four makers,
and three complete designs — the Swoop2, the Tuluaq-19 and the gnuC2-23 —
each with its own program's output and its cutting files.

### 2.1 Cascade topology recovered from lengths alone

The Ozone and PHI sheets give a cut list and a totals matrix but never say
which branch feeds which anchor. It is recoverable: `total − upperLine` is the
path shared with neighbouring anchors, so the remainders collapse to one value
per branch.

BGD's tables **state** the topology, which makes them ground truth for that
inference. Run against the Lynx 2 M it recovers the stated branching on **all
four rows exactly**. That is the only direct check available on a method used
across every Ozone wing.

Two refinements the data forced:

- **Equal length is not the same branch.** On the Geo 7 the branch serving
  anchors 1–4 and the one serving 9–10 agree to within a millimetre. Naive
  clustering merges them into a six-anchor branch that does not exist.
  Requiring branches to serve *adjacent* anchors separates coincidence from
  real sharing.
- **Where two adjacent branches genuinely share a length**, they still merge —
  AM1 and AM2 are both 1921 mm. That is a limit of inferring from lengths, and
  `inferTopology` reports `middleLineCount` alongside `branchCount` so the
  discrepancy is visible rather than hidden.

### 2.2 Riser length, never stated, always recoverable

The totals include the riser webbing but no sheet gives its length. Since it is
the one quantity shared by every branch, solving for the value that explains
the most branches recovers it. Geo 7 MS, solved independently per row:

| row | riser | branches explained | spread |
| --- | --- | --- | --- |
| A | 527 mm | 5 | 6 mm |
| B | 529 mm | 5 | 3 mm |
| C | 514 mm | 5 | 20 mm |

Three independent solves agreeing within a few millimetres. The residual is
the loop and sewing allowance the sheets track as "Prod adj.", typically 11 mm.

The same solve, size by size, shows what a family scales and what it does not:
four sizes of the Geo 7 hang from that 527 mm riser, and the XS from one of
472 mm. `docs/scaling.md` §1.

### 2.3 Exact arithmetic where a maker provides it

PHI's line sheet is a cascade table rather than an inventory, and its level
lengths sum to the printed total with no residue. All **42 main-row anchors
close exactly to the millimetre** — the strongest check on cascade totals
anywhere in this project, and stronger than the Ozone sheets where riser length
had to be inferred.

Reading it needed one insight: a blank means "shared with the row above", and
the **name** columns say which line. Reading columns positionally cannot
distinguish a shared line from a level that does not exist, and gets both wrong
at the tip.

And one correction. Where a row borrows its lower lines from another — the D
row hangs from the C row's middle lines — the names say which as well: `d5` is
listed `d5 / D3 / DII`, and joins `C3` and `CII`. That was matched by length
alone, any two lines that added up, and `CI + c2` is one millimetre from
`C3 + CII`: three D lines were hung from the wrong main line. The totals still
closed, so the test passed.

### 2.4 Structure confirmed across makers

Four anchor rows on three risers, with D cascading into C, appears in the Geo 7,
the UltraLite 5 and the Allegro X-alps — two makers, two formats, the same
arrangement. The Alpina 5 runs three rows on two risers. **Rows and risers are
not the same thing**, and modelling one riser per row produces a wing that
cannot be rigged.

### 2.5 Whole-wing counts, half-wing matrices

LEP section 1 declares cells and ribs for the whole wing but its matrix
describes one half: a 60-cell wing has 61 ribs and 31 rows. Reading the
declared count as the row count is the obvious wrong turn, and it now fails
loudly rather than truncating the wing.

### 2.6 A complete design, against its own program

The Swoop2 is Laboratori d'envol's own 18 m² design, and its LEparagliding
input and output are in `data/reference/lep`. Read from the input alone:

| quantity | the program prints | this tool |
| --- | --- | --- |
| flat area | 18.00 m² | 17.999 |
| flat span | 10.48 m | 10.482 |
| root chord | 2.0907 m | 2.0907 |
| every one of 93 line lengths | | within 0.05 mm |
| line total, with loops | 276.21 m | 276.214 |
| lineset mass, risers included | 0.468 kg | 0.4678 |
| angle of attack | 4.32° | 4.322 |
| washin at rib 25 | 3.136° | 3.1363 |

That one file exercises the centimetre-to-metre conversion, the wing scale
factor, the matrix layout, the rib rotations and the whole line geometry
together. `docs/swoop2.md` has the rest, `docs/tuluaq19.md` a second
complete design, from an earlier version of the program, and
`docs/gnuc2-23.md` a third, from 3.28, each to the same standard.

The three designs' cutting files were then measured piece by piece and the
pieces cut as their program cuts them. Their panels are within 0.034% (the
Swoop2), 0.011% (the Tuluaq) and 0.011% (the gnuC2-23, all but its tip
cell's self-crossing front piece) of the files', and no surface's total is
0.02% off (`docs/panels.md`); every rib is within 0.002% and every hole to
the hundredth of a cm² the files are written to; the 379 pieces sewn inside
their cells — full diagonals, V-rib strips, straps, pieces between two ribs,
rod pockets — within a part in ten thousand each, or the file's own
rounding on the smallest, and their 70 trailing-edge mini-ribs with them
(`docs/internal-structure.md`).

(This section used to cite a second design, gnuC2-27, recovering 27.00 m². The
file is not in the repository and nothing here checks it; the gnuC2-23, a
different size, is.)

### 2.7 Published flight figures

BGD publishes the Lynx 2 M's performance. None of it was used in building the
model:

| quantity | published | computed |
| --- | --- | --- |
| trim speed | 39 km/h | 37.3 |
| top speed | 58 km/h | 59.6 |
| best glide | 11 | 11.2 |
| minimum sink | 1.0 m/s | 0.92 |

The top speed figure is the fastest point the derived lift curve supports, not
the end of the bar — see §4.3.

### 2.8 A manufacturer confirming isometric scaling outright

BGD is the only maker here that publishes a **linear scaling factor** per size
(0.92 → 1.08). Its span, its chord, the root of its area and the line height
it publishes all go with that factor to within 0.005 — on figures quoted to
two and three digits. The sums of its line sheets go with it to within 0.01,
and each level of the cascade to within 0.02. Its published *total line
length* does not: §3.2.

### 2.9 The balance, against its author's own program

LEparagliding, by the handbook's author, solves chapter 4's equations with
each force at a point it computes rather than by rule. The gnuC2-23 asks it
to (section 35); every figure its output's section 17 prints reproduces
(`lepBalance`). Solved where its coefficients balance (k = 1; the file was
left at 0.578), on the same coefficients, masses and drag:

| | the program's equations | the handbook's (`solveEquilibrium`) |
| --- | --- | --- |
| speed, glide | 33.97 km/h, 8.267 | 33.97 km/h, 8.267 |
| calage | 47.88% of chord | 48.00% |

The forces agree to rounding; the calage is close only because two of the
handbook's rules for where forces act, each worth nearly 2% of chord here,
cancel (`docs/gnuc2-23.md` has all five). The program's line Cd, 1 + 10
Re^-2/3, is 1.085 over this lineset; `lineDrag` takes 1.1, 5% more if
sheathed, and counts each line's inclination, which the program does not.

---

## 3. Where sources disagree with each other

### 3.1 Scaling coefficients do not transfer between families

Total line length against span fits a straight line in every family measured
(R² 0.98 to 1.00), but the slope varies by a factor of 2.3 across the seven:
16.2 for the Zeno 2, 21.5 for the Allegro light, 36.6 for the Ultralite 5.
Applying one family's fit to another lands 9.7 to 46% out among the first three
— worse than assuming nothing — so scaling is isometric unless the module is
handed laws fitted to the family in question.

Normalising by span *does* transfer: `line m per m span = −5.12·AR + 50.72`
gives the total of the five families it was fitted to within **7.4%** at any
size, and of the two that were not — Skywalk's SAGE and BGD's Lynx 2 — within
0.8% and 7.5%.

### 3.2 A published total that was not the lineset

For some time this section said the law "lands within 1% on the smallest
Lynx 2 and **16% out on the largest**", because "BGD scales its lineset with
area" — an exponent of 2.03 where five other families gave 1.02 to 1.30.

That was BGD's specification table against itself. Its "Total line length" is
10.7 m for every square metre of flat area at all five sizes. BGD's own
production line sheets, which were in `data/reference` throughout, have the
same 121 lines a side at every size and add up in proportion to the linear
factor: 229.7, 241.6, 252.4 and 262.7 m, where the table says 226, 247, 268
and 290. The table's own next row, the line height, goes with the factor too.

All seven families scale their linesets with span, and a little faster than
it — exponents 1.02 to 1.30 — because the riser does not scale and the height
does. `docs/scaling.md` §1 and §9.

### 3.3 The handbook's row shares disagree with thin-aerofoil theory at the rear

Derived from the section, anchors and angle of attack, the load split at 6° is
A 37.9 / B 24.8 / C 20.6 / D 16.8. The handbook's convention is 35/35/20/10.
A and C agree closely; the rear does not.

Thin-aerofoil theory describes a rigid surface carrying load to the trailing
edge. A paraglider's rear rows are deliberately unloaded so the C and D lines
can be made thin, which costs less drag. **The convention encodes a rigging
decision the theory does not know about**, so it remains the default, with the
derived split available for the questions the convention cannot answer.

---

## 4. Assumptions that had to be named

Three places where a model, used slightly outside its evidence, returned a
plausible number rather than a wrong-looking one.

### 4.1 Sizing on new strength rather than kinked

PHI's measured table carries two breaking loads per line. Edelrid 8000-135
falls from 160 daN new to **85.6 daN kinked**, a 47% loss; Liros TSL 140 loses
52%. A line in service is knotted at every loop and bent round every maillon,
so sizing on the new figure under-sizes by nearly half on exactly the lines a
designer wants thin. Selection uses the kinked figure unless told otherwise.

Both of those are aramid, and the loss is the fibre's: the catalogue's 48
aramid lines keep 38 to 70% kinked, its 26 Dyneema lines 59 to 114%, sheathed
or not. (This said that sheathed Liros "beats unsheathed Dyneema" per
millimetre, 164 against 78 daN/mm. The 78 was the U-135, which is aramid, and
per millimetre of diameter ranks sizes rather than materials:
`docs/loads-and-materials.md` §2.)

### 4.2 Line drag taken as a constant

`cxLines` was a typed-in 0.020 from Phase 1. Computed from an actual lineset —
diameter × length, with sin²ψ for inclination — a modern thin set gives about
0.0055. The effect is not academic: on the suite's test wing the glide ratio
goes from 8.48 to 10.62, with line drag falling from 27.7% to 9.6% of the
total. That is most of why modern wings out-glide the handbook's 2012 example.

### 4.3 The collapse floor, which governs top speed

Speed goes as 1/√Cz, so an accelerated polar is most sensitive to lift exactly
where a linear fit is least trustworthy. Run to the end of the bar, the derived
curve reached Cz ≈ 0.10 and the solver reported **99 km/h** on a wing that does
58.

A rigid wing can fly at Cz 0.10. A paraglider cannot: it is a pressurised
fabric structure, and the angle of attack producing that lift is at or below
where the leading edge stops being pressurised and the wing folds. That is the
frontal-collapse boundary — **structural, not aerodynamic** — and nothing in a
section polar knows about it.

It cannot be derived here, and it governs the answer at 4.8 km/h per 0.05 of
assumed floor. So it is inverted instead: the published 58 km/h implies the
wing is still flying at **Cz 0.307**, which is a physically sensible threshold
and a number a designer can compare against a prototype.

---

## 5. Load cases

### 5.1 Trim is the wrong sizing case

The chordwise split moves a long way on the speedbar. Worst tension over the
flyable range against trim: **A +0%, B +13%, C +39%, D +46%**. On the test wing
**54 of 73 lines are governed by a bar position other than trim**, and three
need thicker line than trim-only sizing would choose.

Two things the envelope has to get right. **Total load does not change** — in
steady flight the lines carry the weight whatever the speed, so the shares are
checked to still sum to one at every position. And **the sweep must stop where
the wing stops flying**: past the collapse floor the A row's share goes
negative, which is the frontal-collapse mechanism rather than a load case.

### 5.2 A collapse is a multiple of level flight

**Half the span is not half the lift.** The loading is far higher inboard, so a
tip collapse sheds much less than its span fraction suggests:

| collapsed span, from tip | lift shed | load on the lines still flying |
| --- | --- | --- |
| 25% | 15.8% | ×1.19 |
| 50% | 41.0% | ×1.70 |
| 60% | 53.5% | ×2.15 |

An inboard collapse of the same span sheds more — 33% for a quarter of the
span — because that is where the lift is. With a 1.5 dynamic factor for the
surge, a 50% asymmetric collapse gives **×2.54**. In a frontal collapse the A
riser drops to zero and the C riser carries ×2.15 — and the pressure model
predicts the precursor independently, since the A row's share goes negative
before anything else happens.

Those are multiples of the load in **level flight**. The symmetric case the
lines are sized to is 8 g. So a wing that collapses in level flight works its
remaining lines a third as hard as the limit case does, and no collapse
governs any line unless it comes at more than about **3 g**
(`designEnvelope`, `governingCollapseG`).

### 5.3 What this section used to say, and what a real lineset says

> Certification tests to 8 g symmetrically. Lines break in collapses. Sized on
> the full envelope rather than symmetric flight, **asymmetric collapse governs
> every line** … the collapse envelope implies 28.6× the 1 g load, PHI's most
> load-critical line sits at 28×, so real linesets are already sized to the
> collapse case.

The envelope put the collapse multiplier *on top of* the 8 g limit and its
margin: 8 × 1.5 × 2.54, thirty times the level-flight load in every line. A
wing cannot be pulling 8 g with half of itself folded. And the 28× it was
checked against was a literal in the test file, from a C main line credited
with 3.0 daN.

PHI's sheet for the Allegro X-alps 21 gives the type of every line and which
anchors hang from it, so the load in each can be computed with the same model
that sizes this tool's own lines (`publishedCascadeLoads`): lifting-line span
loading, the handbook's row shares, the middle of the certified weight range.
Strength over that load, on kinked strength:

| line | type | kinked | load at 1 g | factor |
| --- | --- | --- | --- | --- |
| CII, outer C main line | U-090 | 54.3 daN | 6.3 daN | **8.7×** |
| C4, a C middle line | U-050 | 23.5 | 2.2 | 10.9× |
| CI, inner C main line | U-135 | 85.6 | 6.1 | 14× |
| AII, an A main line | PPSLS 180 | 194.4 | 8.6 | 23× |
| AI, an A main line | PPSLS 260 | 259.4 | 7.1 | 36× |
| the middle line of the 62 | | | | 28× |
| c12, a tip top line | DC 40 | 41.0 | 0.07 | 609× |

The C main lines carry the D row as well as the C — the D lines hang from the
same middle lines — which is the load the 28× left out; and the main line
beside it, thinner and serving more anchors, is the hardest-worked line on the
wing.

| what would size a line | times its level-flight load | PHI's lines under it |
| --- | --- | --- |
| 8 g, with a margin of 1.5 | 12× | 2 of 62 |
| the old envelope, collapse on top | 30.5× | 33 of 62 |

**The wing is built to about the symmetric case on its hardest-worked lines,
and half of it is under the old envelope.** It is certified, and it flies.

How far that rests on this tool's assumptions: at the top of the weight range
the hardest line is at 7.8×; with the row split of the Swoop2's published
riser loads, 11.2×; with thin-aerofoil shares, 7.2×. On *new* strength it is
13 to 20×, and no line of the 62 is under 12× in any of those cases. The loads
are this model's, not measurements.

### 5.4 And most of a lineset is not load-sized at all

The spread from 9× to 600× is not inconsistency. Neither PHI nor Ozone uses
line thinner than **0.50 mm** anywhere in a complete lineset, and it is not
strength that stops them: a 0.4 mm Dyneema line is several times strong enough
for a tip D-line. Handling, abrasion and knot retention decide below that
diameter, not load.

So a model that keeps sizing downward past 0.5 mm produces a lineset nobody
would build. With the floor in place, **61 of 73 lines are floor-sized** on
the test wing under the symmetric case — only twelve respond to the load case
at all.

`selectLines` reports `sizedBy: 'load' | 'floor'` per line, because the
distinction is what a designer needs: the load-sized lines are the ones that
respond to a change in the load case, and the floor-sized ones never will.

### 5.5 Gusts do not make the 8 g case either

A vertical gust changes incidence by roughly `w/V`, and the resulting lift
scales with dynamic pressure. Sharp-edged — the wing meeting the whole gust at
once — a 25.2 m² wing at 95 kg in a 7.5 m/s gust sees **7.40 g at trim and
11.00 g at full speed**.

It does not meet it at once. A paraglider is so lightly loaded that it is
carried up by the gust as it builds: with the Pratt-Walker factor a sharp-edged
11.13 g becomes **2.00 g**, and integrating the equation of motion directly
gives 1.84. `gustLoadFactor` applies the factor when it is given a mean chord,
and says when it has not been. `docs/loads-and-materials.md` §12.

(This section said the sharp-edged 7.40 g "landing close to the 8 g of
EN 926-1 is a useful cross-check on both". It is a coincidence.)

---

## 6. Residual tolerances

Where a test does not assert machine precision, the reason:

| Check | Tolerance | Why |
| --- | --- | --- |
| Handbook glide angle, θ | 0.05° | source prints 3–4 significant figures |
| Handbook calage | 6 mm | propagates the rounded 0.624 lift factor |
| Right seam length | 10 µm | method asymmetry, `departures.md` §4; it is 0.16 µm |
| Seam closure gap | 0.1 mm | same; it is 0.8 µm |
| NACA thickness (cambered) | 0.05% chord | vertical vs perpendicular measure, `departures.md` §13 |
| NACA thickness (symmetric) | 0.005% chord | sampling resolution only |
| NACA camber position | 1% chord | 400-step scan resolution |

---

## 7. Known gaps

Not validated, because there is nothing to validate against.

- **Line loads are modelled, never measured.** §5.3 puts a real lineset
  against this tool's loads, and the answer moves by a third with the row
  split assumed. Measured riser or line loads on one wing would settle the
  split, and the factor a maker really builds to.
- **The dynamic factor in a collapse** (§5.2). A stand-in for a transient the
  static model cannot represent, and nothing here supports 1.5 over 1.2 or 2.
  It no longer decides any line: a collapse would have to come at 3 g.
- **Why 8 g.** It is the certification load, and this tool sizes to it with a
  margin. Neither gusts (§5.5) nor collapses (§5.2) produce it in this model;
  what a wing sees in a spiral or a recovery is not modelled.
- **The practical floor is one number from two makers.** Both stop at 0.50 mm,
  which is suggestive rather than established.
- **The frontal-collapse floor** (§4.3). Inverted from published speeds, never
  predicted. Predicting it needs internal pressure and rib support modelling.
- **The rear-row disagreement** (§3.3). Reconciling thin-aerofoil theory with
  the handbook convention needs measured riser loads.
- **Why the Lynx 2 carries 7% more line than its aspect ratio suggests**
  (§3.1). It is the only 2.5-liner in the set; whether that is the cause is
  untested.
- **3D shaping of the leading edge.** `shaping3d.js` implements the darts of
  the author's later study and is tested; the interface does not call it.
- **Brake loads.** They come from pilot input, not the lift distribution, so
  `loads.js` applies a larger safety factor to the K row rather than computing
  anything.
- **The PHI brake block.** Parsed structurally but not decoded: it lists each
  upper line twice, plain and with the spanwise distribution added, so its
  columns do not map one-to-one onto names.
- **Section polars are estimated, not measured.** `estimateSectionPolar` is a
  correlation with no boundary-layer solution and no notion of a separation
  bubble — which is what dominates a paraglider section at the Reynolds numbers
  it actually flies. Marked `source: 'estimated'` so nothing downstream can
  mistake it for data.

---

## 8. Departures from the source

Every place the implementation differs from the handbook, and why, is
catalogued separately in `docs/departures.md`.
