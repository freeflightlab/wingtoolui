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

### Where it should be: the calage

**At the calage** — the point the moment balance puts it, which
`solveEquilibrium` already computes and the line plan was ignoring.

A paraglider's angle of incidence is set by its line lengths: the wing hangs
from the maillon and sits at whatever attitude those lengths dictate. Where it
hangs from decides how it flies, and a load-weighted average of the anchor
positions is a plausible-looking geometric proxy that knows nothing about
balance. On a typical wing the two differ by several points of chord.

Take moments about the hang point. Lift acts up at the centre of pressure; if
that is **forward** of the hang point the couple is nose-**up**, which is what
balances an aerofoil's nose-down pitching moment. So the wing hangs from a
point **aft of its centre of pressure**, and the more nose-down the section,
the further aft.

Both of those are asserted now. I stated the first one backwards to begin
with, and a test that was itself wrong failed a model that was right — the
direction is easy to reason round the wrong way and looks equally plausible
either way.

Without a solved equilibrium the anchor centroid remains as a fallback, which
is better than the leading edge, and the caller knows which was used.

### The two balance modes disagreed about the sign

`solveEquilibrium` has a `legacySpreadsheet` mode that reproduces a 2012
worksheet. It leaves the **aerofoil's own pitching moment out of the balance**,
and that changes the answer qualitatively rather than slightly:

| mode | calage | centre of pressure | can it balance? |
| --- | --- | --- | --- |
| handbook 4.2 | 36.9% | 29.7% | **yes** — hang point aft of CP |
| 2012 worksheet | 19.4% | 29.7% | **no** — hang point forward of CP |

The legacy number is right for matching that worksheet and wrong as geometry.
A wing hung 10 points of chord forward of its centre of pressure has a
lift-weight couple that *adds* to the section's nose-down moment instead of
opposing it. It could not fly.

The tool would have used whichever number it was handed. `usableCalage` now
refuses one that cannot balance, and says why:

> the calage (19.4%) is forward of the centre of pressure (29.7%), so the wing
> could not balance there

Refused, the lines fall back to the anchor centroid rather than to an
unusable number. Legacy mode remains available for reproducing the
worksheet's figures; it just does not get to place the lines.

The interface defaults to the handbook path, so this was a latent fault rather
than a live one — but it was one checkbox away.

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
single `hangPointFromAnchors` now and both callers use it.

The third was separate and just as visible. Loading a three-row design set the
D anchor from `design.anchorFractions.D`, which does not exist — `undefined *
100` is NaN and settled as 0. The D row was then anchored at the leading edge
and **stayed there after returning to a parametric wing**. A row the imported
design does not have now keeps its current value.

With all three fixed, every row on a wing with brakes starts at or aft of the
hang point:

| row | from | to |
| --- | --- | --- |
| A | 12.9% | 11.0% |
| D | 38.8% | 78.6% |
| K (brakes) | 38.8% | 100.0% |

Nothing at the leading edge, and the brake handle hangs from the same point as
the risers.

### Why nothing caught it

Every internal check passed. The lines were the right lengths, the loads
closed at every cascade level, the cascade was geometrically consistent with
itself, and the exported line sheet matched the model.

It was only wrong **against how a wing flies** — which is not a property any
of those checks look at. The tests now assert the hang point sits between 20%
and 60% of chord, that the rake is under a quarter of the chord, and that the
riser-level lines average nearer vertical than horizontal.
