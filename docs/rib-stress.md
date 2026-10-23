# What the rib cloth carries

The project sites anchors, computes what each carries, and cuts lightening
holes between them. It did not check the cloth in between. A rib can satisfy
every placement rule — nose band, surface margins, anchor clearance, webs —
and still be a rib that tears at the attachment point.

`ribstress.js` is that check, and this is the fourth account of what it
found. The first three were wrong in ways worth keeping, so they are in
section 7.

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
case it does not, by a factor of four. The load goes into a reinforcement at
the tab, and the questions left are **how far that reinforcement must reach
before bare cloth can take over**, and whether the cloth then has a straight
path to somewhere that can take the load on.

## 2. Radials from the line, and they end at a seam

Cloth carries tension and nothing else. So a line pulling on a rib loads it
along straight rays from the attachment point — the wrinkles a loaded rib
shows fan out from its tab — and a ray can only end where the rib is sewn to
something: the upper seam. A ray that runs into a hole ends in mid-air, which
is to say it is not there.

For each anchor `anchorLoadPath`:

1. finds the rays from the tab to the upper seam that cross no hole and come
   no closer than 10 mm to one (`radialFan`);
2. aims them at the line's own pull, turned round, in the rib's plane — read
   off the line plan (`lineAngleOnRib`), not assumed square to the chord;
3. shares the load between them by the cosine of each one's angle from the
   pull, falling as one over the distance along it (`radialField`). On a
   half-plane that is Flamant's elastic answer for a point load, `2F/π` per
   radian along the pull, and it is the rule `vribs.js` already used for the
   fibres of a diagonal. A ray more than a right angle from the pull would
   have to push, and carries nothing. Where the holes leave the fan lopsided,
   what the rays pull across the line is held by the lower surface, to which
   the rib is sewn at the anchor.

Near the tab the load is spread over the tab, not a point, so the load per
metre along a ray is `q / (r + r0)`, with `r0` where the fan is as wide as the
tab. The reinforcement can stop where that falls to what the cloth carries:

```
reach = q_peak × ( 1 / cloth strength − tab width / load ),   q_peak = load / I
I = ∫ cos² over the clear rays:   0.96 rad for a clear 30° either side, π/2 on a half-plane
```

So a fan the holes narrow needs a longer reinforcement, and the model says
by how much. `spreadDeg` is the width the fan works at — the angle a fan at
the peak ray's intensity throughout would need for the whole load: 55 for a
clear 30 either side, 90 on a half-plane.

The lines lean. On the 12-cell test wing the A lines pull up to 10° forward
of square to the chord and the D lines 9 to 17° aft; on the default wing
−23° to +22°. A fan taken straight up, as the model did, was aimed up to a
quarter of a right angle off the load.

## 3. The reach, and the room for it

At 8 g on the test wing (Skytex 27 hard, this tool's openings), reach over the
distance to the seam along the most loaded ray, and the fan's spread:

| rib | chord | A | B | D |
| --- | --- | --- | --- | --- |
| 0 | 2.60 m | 35 / 277 mm, 77° | 57 / 390 mm, 46° | 0 / 178 mm, 86° |
| 2 | 2.53 m | 49 / 274 mm, 76° | **80 / 380 mm**, 46° | 3 / 174 mm, 86° |
| 6 | 2.24 m | 35 / 251 mm, 73° | 56 / 337 mm, 46° | 0 / 153 mm, 85° |
| 10 | 1.66 m | 7 / 183 mm, 74° | 12 / 249 mm, 44° | 0 / 113 mm, 84° |
| 12 | 0.90 m | 0 / 106 mm, 67° | 0 / 136 mm, 40° | 0 / 62 mm, 81° |

**No anchor needs its reinforcement run to the upper seam**, and the longest
is a fifth of the room it has. The longest is a B anchor's, not the A's that
carries the same load: the B sits between two openings, and its fan works at
46° where the A's, open to the nose, works at 76°. The mechanism that would
change the verdict is real — reach goes with the load and room with the rib —
and an anchor carrying 60 N at 1 g needs 122 mm at 8 g in a clear ±30° fan:
the root's D anchor has 182 mm and the tip's 63 mm. No anchor here carries
that, and the tip's carry least.

The **Rib stress report** on three wings, at 8 g with ribs in Skytex 40 hard:

| wing | anchors a side | worst, 1 g | longest reinforcement | lines lean |
| --- | --- | --- | --- | --- |
| the default, 24 cells | 52 on 13 ribs | 17.2 N | 8 mm, B2, of 385 mm | −23° to +22° |
| the Swoop2, its own lines and holes | 37 on 13 ribs | 19.1 N | 13 mm, B2, of 343 mm | −5° to +20° |
| the Tuluaq-19, its own lines and holes | 44 on 12 ribs | 24.9 N | 37 mm, B3, of 450 mm | −8° to +29° |

The Rib tab draws the same: each line's fan to the seam, its pull dashed, and
the outline of the reinforcement the load needs round the tab — the curve
where every ray's load per metre falls to the cloth's.

## 4. Holes

A hole is in the path in one of two ways:

- **across the line's own pull** (`blocked`): no straight ray goes the way
  the line pulls. The load still reaches the seam round the hole, at a higher
  stress, and the design is at fault;
- **inside the reinforcement's reach** (`holeInPath`): the patch at the tab
  would have to be cut by it.

A hole further off is not in the path, but it is not free either: every ray
it cuts is a ray the load does not have, and the reach above says what that
costs. So the same hole beside an anchor counts against the anchor whether it
is cut 20 mm up the rib or 150 mm, and is in its path only when it is 20 mm.

**The two built designs bear this out.** On their own ribs, holes and lines —
the program's own geometry, not this tool's import of it — 86 of their 88
loaded anchors have the line's pull inside a fan that reaches the upper seam
10 mm clear of every hole, and the holes leave those fans 24 to 67° wide as
they work: 37 to 60° on the Swoop2, 24 to 67° on the Tuluaq, narrowest at a B
anchor between two holes. The two that do not are on the tip ribs, thinned to
1% and 10% of their section, where there is no depth for a fan to cross.
Neither design says any of this. It is what their holes do.

**The tool's openings are aimed the same way.** Each anchor keeps a disc
round its tab and a fan of rays 20° either side of its line's pull, 10 mm
more, and an opening stays under the fans' edges (`buildRibHoles`'s
`pulls`, which the interface reads off the line plan). With nothing to say
which way a line pulls, the fan stands square to the chord, and on the
default wing the openings are then exactly what they were: the old band of
3.5% of chord either side kept those fans clear already. Aimed by the lines,
the default wing's openings lose 0.14% of their area, and the tightest side
of any fan goes from 12° — a B line leaning 11° forward, against a band
standing straight up — to 19.7°.

## 5. The seam

The rays deliver the load to the upper seam over the width of the fan where
it arrives, measured from where the fan is as wide as the tab. At 8 g the
worst is 417 N/m on the default wing, 871 N/m on the Tuluaq and 1126 N/m on
the Swoop2 — at its tip rib, thinned to 1% of its section, where the seam is
inside the tab's own width — against a seam this project estimates at
2500 N/m (`RIB_SEAM_N_PER_M`, the figure the sail seams are checked at, and
like it an estimate).

## 6. The PMA connection

§5.3 tests exactly this. An inspector attaches an A line of the first line
group, places a needle at least 100 mm up the rib, and pulls. The ripstop must
not break below **0.6 daN**.

The test is not measuring cloth in isolation — it measures cloth *while the
rib is loaded through its own line*. So the tension the design puts into the
rib is part of what the inspector is pulling against, and a design that
already works the cloth hard will fail a test that a slacker one passes on
identical fabric. `predictedTearMargin` estimates that reading before the wing
is built, from the load per metre 100 mm up the line's pull, or at the seam
where the rib is shallower.

## 7. Accounts that were wrong

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
behind it was, at whatever height it was cut.

**"Straight up, 30° either side."** The third version walked the path across
the rib in a Whitmore band of 30° either side of square to the chord, and
found a hole by how much of the band it took out at each height. It did not
know which way the line pulls, where the band ended, or what the seam got,
and it said so under "what this is not". The load is carried on radials from
the line, and can only go to a seam: aimed by the line and ended at the seam,
the longest reinforcement on the test wing is the B anchor's 80 mm between
two holes, where the band had the A anchor's 56 mm.

It also counted a rib as needing tape to the seam only when *all* its anchors
did, checked every wing as Skytex 27 hard whatever its ribs were set to be cut
from, and checked an imported design against holes it does not have.

The lesson of the first is the one the PMA measuring tension already taught:
**per-item loads on a paraglider are small because there are many items.** The
lesson of the second and third is that fixing the number a result came from
does not check the geometry it was put through.

## 8. What this is not

- **A line-load model** — force per metre of cloth — not a finite element
  analysis. Every result carries `lineLoadModel: true`.
- **Radial only.** A ray a hole cuts carries nothing, wherever along it the
  hole is, where real cloth would carry some of that load round the hole in
  two-way tension. It errs on the safe side.
- **The whole line load on the rib.** A line also pulls across the rib's
  plane — 50% of its pull at the median on the default wing, whose top lines
  are short and splay, 18% on the two built designs — and the rib, a
  membrane in its own plane, cannot take that: the diagonals and the sail do.
  The fan is given the whole load anyway, and the report says how much of it
  is across the plane.
- **On estimated strengths.** The cloth and seam figures are this project's,
  not a supplier's; `RIB_CLOTH.provenance` says so and the report repeats it.
  The lengths move with them; the conclusion, that the reinforcement is short
  next to the rib, holds at half the strength and at twice it.
- **One load case.** 8 g on the trim load distribution. On the bar the load
  moves aft (`docs/loads-and-materials.md`), which this does not follow.
- **A 20 mm tab**, the minimum `buildTabs` cuts. A tab sized wider by load
  needs less reach than this says.
- A rib with no outline — a bare chord — is given a depth of 10% of chord, and
  the result says `depthAssumed`; a line with no direction is taken as square
  to the chord, and the result says `lineAngleAssumed`.

---

## 9. The other half: what the sail cloth carries

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
