# Load cases

What sizes a line: the speed bar, a collapse, a gust — and a real lineset
against the loads this tool computes. The loads are this model's, not
measurements (`docs/validation.md`, section 7). It was section 5 of
`docs/validation.md` until that note outgrew its 500 lines.

## 1. Trim is the wrong sizing case

The chordwise split moves a long way on the speedbar. Worst tension over the
flyable range against trim: **A +0%, B +13%, C +39%, D +46%**. On the test wing
**54 of 73 lines are governed by a bar position other than trim**, and three
need thicker line than trim-only sizing would choose.

Two things the envelope has to get right. **Total load does not change** — in
steady flight the lines carry the weight whatever the speed, so the shares are
checked to still sum to one at every position. And **the sweep must stop where
the wing stops flying**: past the collapse floor the A row's share goes
negative, which is the frontal-collapse mechanism rather than a load case.

## 2. A collapse is a multiple of level flight

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

## 3. What this used to say, and what a real lineset says

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

## 4. And most of a lineset is not load-sized at all

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

## 5. Gusts do not make the 8 g case either

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
