# Where the wing hangs

A paraglider's angle of incidence is set by its line lengths: the wing hangs
from the maillon and sits at whatever attitude those lengths dictate. Where it
hangs from therefore decides how it flies, and getting that point wrong is not
a drawing error — it is a different aircraft.

A paraglider hangs with the pilot below the point the lift acts through, and
the risers close to vertical.

The maillon was placed at **x = 0 — the leading edge**. The anchors span a
quarter to three quarters of the chord, so every line raked about a metre
forward to reach a point under the nose, and the whole cascade sat at a large
angle to the wing it hangs from. In the 3D model it looked like the wing had
been dragged forward off its own risers.

| | before | after |
| --- | --- | --- |
| hang point | 0.0% of chord | **31.9%** |
| forward rake | 1.02 m | **0.28 m** |

(On the 12-cell test wing, with no balance given: the load-weighted centre of
its anchors. The rake is from the middle of the upper lines' lower ends to the
top of the front riser, on a 2.60 m chord.)

### Where it should be: the calage

**At the calage** — the point the moment balance puts it, which
`solveEquilibrium` already computes and the line plan was ignoring.

A paraglider's angle of incidence is set by its line lengths: the wing hangs
from the maillon and sits at whatever attitude those lengths dictate. Where it
hangs from decides how it flies, and a load-weighted average of the anchor
positions is a plausible-looking geometric proxy that knows nothing about
balance. On the default wing the two differ by 11.3 points of chord: 31.0% at
the anchors' centre, 42.3% where the balance on its own polar puts the pilot
at 5° with every force where it acts (`docs/balance.md`), 39.7% on the
handbook's rules for where they act.

Where the calage falls against the centre of pressure is a matter of
attitude, not a rule. With nothing below the wing but the pilot's weight, the
wing's force at its centre of pressure carries the pilot, so the pilot hangs
plumb under it, and on a wing gliding θ nose down the foot of that plumb line
on the chord is L tan θ **forward** of the centre of pressure, L the line
height. LEparagliding's section 8 builds every design so, and the three
complete designs on file hang at calages of 33, 32.5 and 36% under plumb
points of 38, 40 and 39%. Drag below the wing — the lines', the pilot's —
swings the pilot back from the plumb line, and a more nose-down section puts
the centre of pressure, and the wing with it, further aft. All three are
asserted, the first to the micrometre.

This note said the wing must hang **aft** of its centre of pressure, for the
lift-weight couple to oppose the section's nose-down moment. The lift at the
centre of pressure already carries that moment, so the couple was counted
twice — as the handbook's own 4.2 counts it, in a seventh term the balance
now leaves out (`docs/departures.md` §5). The rule refused calages that real
designs hang at, and the free-body check caught it on the 13 m² Ultralite 5,
whose balance hangs it forward of its centre of pressure: its lines were hung
from the anchors' centre instead.

Without a solved equilibrium the anchor centroid remains as a fallback, which
is better than the leading edge, and the caller knows which was used.

### The worksheet's calage hangs no wing

`solveEquilibrium` has a `legacySpreadsheet` mode that reproduces a 2012
worksheet. Its glide is not its own coefficients': it takes the induced drag
of the 2D lift coefficient — the handbook's example 0.070, where its
finite-span lift gives 0.027 — and so flies steeper than its lift and drag
do, and solves its calage at that attitude. On the wing the tests use:

| mode | glide angle | calage | centre of pressure |
| --- | --- | --- | --- |
| handbook 4.2, the pitching moment once | 6.0° | 34.0% | 29.7% |
| handbook 4.2 as printed, twice | 6.0° | 36.9% | 29.7% |
| 2012 worksheet | 9.3° | 19.4% | 29.7% |

The legacy number is right for matching that worksheet and belongs to no
wing. `usableCalage` refuses it and says why:

> the 2012 worksheet's calage is solved at a glide its own coefficients do
> not give, so it hangs no wing

Refused, the lines fall back to the anchor centroid. It was refused before
for hanging forward of the centre of pressure — the wrong reason, and one
that would have refused the designs above. Legacy mode remains available for
reproducing the worksheet's figures; it just does not get to place the
lines.

### Three places, not one

Fixing `buildLinePlan` was not enough, and the report that the brakes and
risers were *still* projected forward was correct.

| | what it did | |
| --- | --- | --- |
| `buildLinePlan` | maillon at x = 0 | fixed first |
| `buildBrakePlan` | **its own second copy**, also at x = 0 | left behind |
| the LEP import | `undefined * 100` for a missing D row | pinned D to the nose |

The second is the one that mattered most: the load-bearing lines hung
correctly under the wing while the brakes still ran forward to a handle under
the nose. **Two definitions of one position is one too many**, so there is a
single `hangPointFromAnchors` now and both callers use it. (The brake's
default, for a brake built without a hang point, passed it the anchor count
where it takes the rows' chord fractions, and so was x = 0 again until
1.11.0.)

The third was separate and just as visible. Loading a three-row design set the
D anchor from `design.anchorFractions.D`, which does not exist — `undefined *
100` is NaN and settled as 0. The D row was then anchored at the leading edge
and **stayed there after returning to a parametric wing**. A row the imported
design does not have now keeps its current value.

With all three fixed, nothing runs to the leading edge. On the default wing as
the tool opens the karabiner hangs under the calage, 42.3% of the root chord,
and each row's main lines start from the top of its own riser — the risers
lean towards the lines they carry, so those are three points, not one:

| riser | its top | its rows attach at |
| --- | --- | --- |
| A | 40.4% of chord | 8.5% |
| B | 41.8% | 27.5% |
| C, with D and the brake pulley | 43.3% | 53.0%, 78.5%, and the trailing edge |

No line of the 109 reaches forward of the A row's 8.5% of chord. The brake handle is placed
0.35 m aft of the karabiner and 0.55 m below the risers' tops, 5 cm under the
karabiner; the brake line runs from there up to the pulley at the top of the
rear riser.

This section's table used to say every row "starts at or aft of the hang
point" and that "the brake handle hangs from the same point as the risers".
Neither has been true since the risers were given their own tops and the
handle its own place: the A riser's top is two points of chord *forward* of
the karabiner, which is where a front riser should be.

### Why nothing caught it

Every internal check passed. The lines were the right lengths, the loads
closed at every cascade level, the cascade was geometrically consistent with
itself, and the exported line sheet matched the model.

It was only wrong **against how a wing flies** — which is not a property any
of those checks look at. The tests now assert the hang point sits between 20%
and 60% of chord, that the rake is under a quarter of the chord, and that the
riser-level lines average nearer vertical than horizontal.
