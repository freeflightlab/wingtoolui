# What the rib cloth carries

The project sites anchors, computes what each carries, and cuts lightening
holes between them. It did not check the cloth in between. A rib can satisfy
every placement rule — nose band, surface margins, anchor clearance, webs —
and still be a rib that tears at the attachment point.

`ribstress.js` is that check, and this is the third account of what it found.
The first two were wrong in ways worth keeping, so they are in section 5.

## 1. An anchor load, and the cloth it enters

Half a 95 kg wing is 466 N, shared between its anchors. On the 12-cell test
wing that is 28 anchors:

```
average          16.6 N
the worst (A2)   36.8 N
```

Through a 20 mm tab into Skytex 27 hard, which carries about 3.5 kN/m:

```
the worst anchor at 1 g     36.8 N over 20 mm  =   1.8 kN/m
at the 8 g case             295 N              =  14.7 kN/m
```

At 1 g the tab alone puts the load into cloth that carries it. At the design
case it does not, by a factor of four. The load goes into a Dacron tab and
patch, which `reinforcement.js` sizes by width, and the question left is **how
far that reinforcement must reach before bare cloth can take over** — its
length, which nothing else here sizes.

## 2. The reach, and the room for it

The load fans out as it travels into the rib, 30° either side — the Whitmore
section of gusset-plate design — so the load per metre of cloth falls with
distance. `reinforcementReach` is where it has fallen to what the cloth
carries:

```
reach = ( load / cloth strength − tab width ) / ( 2 tan 30° )
```

At 8 g that is 16 mm for the average anchor of the test wing and **56 mm** for
the worst.

The room is **the depth of the rib at the anchor**: the path runs from the
anchor, on the lower surface, across the rib to the upper. On a NACA 4415 that
is 11.1%, 15.0%, 12.7% and 7.0% of chord at the four rows.

| rib | chord | A, at 8 g | reach / depth | D, at 8 g | reach / depth |
| --- | --- | --- | --- | --- | --- |
| 0 | 2.60 m | 232 N | 40 / 289 mm | 66 N | 0 / 182 mm |
| 2 | 2.53 m | 295 N | 56 / 282 mm | 84 N | 4 / 178 mm |
| 6 | 2.24 m | 226 N | 39 / 249 mm | 65 N | 0 / 157 mm |
| 10 | 1.66 m | 103 N | 8 / 184 mm | 29 N | 0 / 116 mm |
| 12 | 0.90 m | 10 N | 0 / 100 mm | 3 N | 0 / 63 mm |

**No anchor needs its reinforcement run to the upper seam**, and the longest is
a fifth of the depth it has. The mechanism that would change that is real —
reach goes with the load and room with the rib, so a load that stops inside a
deep rib does not stop inside a shallow one. An anchor carrying 60 N at 1 g
needs 101 mm at 8 g: the root's D anchor has 182 mm and the tip's 63 mm. No
anchor on this wing carries that, and the tip's carry least.

Two more wings, through the **Rib stress report** button (85 kg, ribs in
Skytex 40 hard):

| wing | anchors a side | worst, 1 g | longest reinforcement at 8 g |
| --- | --- | --- | --- |
| the default, 24 cells | 52 on 13 ribs | 17.2 N | 6 mm, in a rib 287 mm deep |
| the Swoop2, its own lines | 37 on 13 ribs | 19.1 N | 8 mm, in a rib 304 mm deep |

Per-anchor loads are small because there are many anchors. More cells, more
lines, shorter reinforcement.

## 3. Holes

A lightening hole beside an anchor takes away cloth the spreading load needed.
`anchorLoadPath` walks from the anchor across the rib; at each height the load
is in a band `tab + 2 × height × tan 30°` wide, and every hole's own outline
is cut at that height to see how much of the band it removes.

**A hole is in the path where what is left cannot carry the load**: inside the
reinforcement's reach, or beyond it where a hole has narrowed the band back
under what the cloth needs. That finds:

- a hole close beside an anchor, **ahead of it or behind**
- a web between two holes that is narrower than the load needs
- and not the same hole cut 150 mm up the rib, past where the load has spread

On every wing tried there is none:

| wing | holes | nearest to an anchor | in a load path at 8 g |
| --- | --- | --- | --- |
| test wing, default wing | this tool's | 5% of chord, by rule | 0 |
| the Swoop2 | its own, 225 on 25 ribs | 2.5% of chord | 0 |

The tool's rule keeps an opening 3.5% of chord from an anchor, with half a web
more: 5% in all. The Swoop2 is a wing that has been built, and its own holes
come as close as 2.5% to an anchor without entering a load path — so a check
that flagged it would have been a fault in the check.

## 4. The PMA connection

§5.3 tests exactly this. An inspector attaches an A line of the first line
group, places a needle at least 100 mm up the rib, and pulls. The ripstop must
not break below **0.6 daN**.

The test is not measuring cloth in isolation — it measures cloth *while the
rib is loaded through its own line*. So the tension the design puts into the
rib is part of what the inspector is pulling against, and a design that
already works the cloth hard will fail a test that a slacker one passes on
identical fabric. `predictedTearMargin` estimates that reading before the wing
is built. The path is always walked to 100 mm, or the depth of the rib, for
that reason.

## 5. Two accounts that were wrong

**"Rib cloth cannot carry an anchor load at all, not even at 1 g."** The first
version worked on 260 N at 1 g and 2080 N at 8 g, and reported the A anchor at
2971% of the cloth's capacity. The arithmetic was right. The load was a number
that sounded plausible rather than one the load model gave: seven times the
worst real anchor on the test wing and sixteen times the average. From it came
a design rule — tape to the seam on the outer ribs — that applies to no wing.

**"A quarter of the chord", and "along the chord".** The second version used
real loads and kept the first one's geometry. The room for the reinforcement
was `chord × 0.25`, where a rib is 7 to 15% of chord deep at its anchors: two
to three and a half times the room it has. And the path was walked *along the
chord, aft of the anchor*, under a comment that said it ran up to the upper
surface — so a hole ahead of an anchor could not be in the way, and a hole
behind it was, at whatever height it was cut. That version reported "a hole in
the load path on 6 of 11 ribs", later 2 of 7. With the path across the rib and
the holes where their outlines are, it is none.

It also counted a rib as needing tape to the seam only when *all* its anchors
did, checked every wing as Skytex 27 hard whatever its ribs were set to be cut
from, and checked an imported design against holes it does not have.

The lesson of the first is the one the PMA measuring tension already taught:
**per-item loads on a paraglider are small because there are many items.** The
lesson of the second is that fixing the number a result came from does not
check the geometry it was put through.

## 6. What this is not

- **A line-load model** — force per metre of cloth — not a finite element
  analysis. Every result carries `lineLoadModel: true`.
- **On estimated strengths.** The cloth figures are this project's, not a
  supplier's; `RIB_CLOTH.provenance` says so and the report repeats it. The
  lengths move with them — the test wing's 56 mm is 19 mm at twice the
  strength and 129 mm at half — and the conclusion, that the reinforcement is
  short next to the rib, holds across that range.
- **Straight across.** The path is taken at right angles to the chord. A line
  leans fore or aft by its row; that is not in it.
- **One load case.** 8 g on the trim load distribution. On the bar the load
  moves aft (`docs/loads-and-materials.md`), which this does not follow.
- **A 20 mm tab**, the minimum `buildTabs` cuts. A tab sized wider by load
  needs less reach than this says.
- A rib with no outline — a bare chord — is given a depth of 10% of chord, and
  the result says `depthAssumed`.

---

## 7. The other half: what the sail cloth carries

A panel between two ribs is a membrane under pressure. `panelStress` gives the
spanwise tension from the membrane equation — the same one `ovalization.js`
uses to set how much a panel billows — and checks it against the cloth and the
seam.

The pressure is the wing's own. A 95 kg wing of 22.3 m² flies at a lift
coefficient of 0.61 and **68 Pa** of dynamic pressure; the cloth sees 1.5 times
that — the cell near stagnation pressure inside, suction outside — and the
load case multiplies it.

| test wing, cells a side | widest cell | tension at 1 g | at 8 g | of the seam | of the cloth |
| --- | --- | --- | --- | --- | --- |
| 8 | 739 mm | 68 N/m | 542 N/m | 21.7% | 10.4% |
| 12 | 494 mm | 45 N/m | 362 N/m | 14.5% | 7.0% |
| 24 | 247 mm | 23 N/m | 181 N/m | 7.3% | 3.5% |
| 44 | 135 mm | 12 N/m | 99 N/m | 4.0% | 1.9% |

### The seam is the nearer limit, and it is not near

On every panel the seam is reached before the cloth: a stronger fabric would
not help, a wider seam or closer ribs would. But a cell would have to be
**3.4 m wide** to reach its seam at 8 g. Tension goes with the width of the
cell, and no cell is that wide.

So nothing about cell count follows from the strength of the sail. Cell count
is decided by the shape the wing has to hold.

### What this section used to say

That the 12-cell test wing's root panels exceed their seams at 8 g, that a
metre of unsupported membrane is more than a sewn seam carries, and that this
is "the reason real wings put more cells in the middle than a constant spacing
would give".

All three came from one input: 400 Pa of dynamic pressure, multiplied by eight.
That is 5.9 times this wing's — a wing at 92 km/h, pulling 8 g. It is the 260 N
anchor again, a round number in place of one the project could compute. And
the conclusion was wrong on its own terms: real wings have their *widest*
cells in the middle. The Swoop2's run from 249 mm at the centre to 128 mm at
the tip.

### A model that was backwards

The first version treated the chordwise direction as a second free membrane
over a radius of `chord/2`, which made the chordwise tension larger than the
spanwise one on every panel. A panel is not free chordwise. It is sewn to a
rib along its whole length at each end, and the rib holds the aerofoil shape
against the pressure — that is what ribs are for. The chordwise load path is
into the ribs through the seams, and it is reported as the shear the seam
passes into the rib; the result's `membraneModel` says so.

### Not on a button

`checkWingPanelStress` is in the core and the tests. The interface does not
call it: on these figures it would report every wing as holding, and a check
that cannot fail is not worth a button. The seam and cloth strengths in
`SAIL_CLOTH` are, like the rib's, this project's estimates.
