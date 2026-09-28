# Does the whole machine balance?

This project checked a great deal about a wing and **nothing about it flying**.

Every part agreed with every other part while the maillon sat under the
leading edge, the brakes ran forward to a handle under the nose, and the lines
hung the wing at an attitude it could never hold. Each of those was found by a
person looking at a picture, one at a time, over several rounds.

A free body diagram is the instrument that finds them without a person.

## What it checks

In steady glide a paraglider is a rigid body in equilibrium:

- **weight** down through the centre of mass — essentially the pilot, who is
  twenty times the wing's mass and five metres below it
- **lift** perpendicular to the flight path, through the centre of pressure
- **drag** along the flight path
- **line tension** carrying the whole of the pilot's weight up to the wing

| | |
| --- | --- |
| lift and drag carry the weight | `hypot(L, D) = W` |
| glide angle | `atan(1 / glide ratio)` |
| the balance closes | solver residual under 1e-6 Nm |
| **the wing is drawn where it balances** | hang point within 3 points of the calage |
| angle of incidence | between −2° and 18° |
| no line lies flat | every line steeper than 75° from vertical |

The fourth is the one the solver cannot do for itself: it balances whatever
hang point it is given, so only the **geometry** can be checked against it.

## An incomplete free body is worse than none

My first version took moments about the centre of mass using only lift times
its lever, plus the section moment. It reported a residual couple of
**−155 Nm** on a wing that balances exactly.

It was missing pilot drag (−139 Nm), line drag (−63) and wing weight (+40).
The number was confident, specific, and entirely an artefact of what I had
left out. The check uses the solver's own moment sum now.

## What it found that is still wrong

**Twelve of ninety-nine lines lie almost flat.** Out at the tip the arc has
brought the surface down to about the level of its own cascade junction, so an
upper line runs nearly spanwise: on the test wing, **441 mm long with 14 mm of
drop**. It pulls its anchor sideways and reacts none of the lift holding that
part of the wing up.

This is recorded as a **known fault**, not fixed. The cascade node placement
interpolates along the straight line from the maillon to the anchor group, and
out where the arc is steep that puts the node beside the anchor rather than
below it. Fixing it means changing how junctions are placed, which is real
work and not something to do badly in a hurry.

The mean angle is **not** the test. A tip five metres out on six-metre lines
is genuinely at 37 degrees, so an average near 35 is real geometry rather than
a fault — a check on the mean would have flagged a correct wing and missed the
twelve that matter.
