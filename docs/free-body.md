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
  some eighteen times the wing's mass and seven metres below it
- **lift** perpendicular to the flight path, through the centre of pressure
- **drag** along the flight path
- **line tension** carrying the whole of the pilot's weight up to the wing

What `freeBodyCheck` sets, and what it reports as a problem when it fails:

| | |
| --- | --- |
| lift and drag carry the weight | `L = W cos γ`, `D = W sin γ` — set, not tested |
| glide angle | `atan(1 / glide ratio)`, between 2° and 20° |
| the balance closes | the solver's own residual, under 5 Nm |
| **the wing is drawn where it balances** | hang point within 3 points of chord of the calage |
| it hangs from somewhere a wing flies | between 15% and 65% of chord |
| angle of incidence | between −2° and 18° |
| no top line lies across its load | none more than 60° from its own rib's plane |

The fourth is the one the solver cannot do for itself: it balances whatever
hang point it is given, so only the **geometry** can be checked against it.

The residual on the suite's test wing is 10⁻¹³ Nm, and the suite holds it
under 10⁻⁶; the 5 Nm is the size at which the check speaks up. Brake and
stabilo lines are left out of the last row: a brake's upper branches run along
the trailing edge by design, and carry no weight in trim.

## An incomplete free body is worse than none

My first version took moments about the centre of mass using only lift times
its lever, plus the section moment. It reported a residual couple of about
**−155 Nm** on a wing that balances exactly.

It was missing pilot drag (−139 Nm), line drag (−63) and wing weight (+40).
The number was confident, specific, and entirely an artefact of what I had
left out. The check uses the solver's own moment sum now.

## What a line is measured against

The air pushes on a rib's cloth along that rib's own plane, and toward the tip
the plane leans. A tip rib fifty degrees over is pulled up and **out**, and
the line that holds it runs fifty degrees from vertical. So a top line is
measured against the plane of the rib it holds: at 60° off it, half its
tension goes along the load and the other half into the cloth.

| | top lines | furthest off its rib | flattest, from vertical |
| --- | --- | --- | --- |
| the suite's test wing | 44 | 46°, a third of the way out | 84°, two thirds of the way out — and 42° off its rib |
| the default wing | 54 | 40°, at the centre | 67° — 33° off its rib |
| the Swoop2, its own plan | 40 | 28°, a stabilo line | 56° — 8° off its rib |

None is past 60°, and a plan built with its top junctions nearly at the cloth
and nothing to hold the fans in is: 32 lines of the test wing, the worst of
them 76° off its rib and carrying a quarter of its tension.

### What this check used to measure

The angle from **vertical**, with 75° the limit: "a top line placed by the
usual rule runs nearly spanwise. It pulls its anchor sideways and reacts none
of the lift holding that part of the wing up." Twelve lines of ninety-nine
were recorded as that fault, and `buildLinePlan` was then made to lower any
junction until no line above it was more than 60° from vertical.

The canopy is an arc. The line that check named on the test wing — at rib 14,
456 mm long with 48 mm of drop, 84° from vertical — lies 42° from its rib's
plane and carries three quarters of its tension along the load: the same fan
as at the centre, turned with the arc. And the line furthest off its rib on
that wing is a third of the way out, 65° from vertical, and was never
mentioned.

The limit in the generator did what the check asked. On a wing with its
anchors 0.85 m apart it left the widest fan — 67° from the line below it, at
the centre — where it was, and lowered the outboard ones until their lines
were twice the length of the same fan inboard: 0.93 m on a wing of the Geo 7's
size, whose own top lines are 0.48, and 11 to 14% more line on each of the
four wings it was measured on. The generator's limit is on the fan now — how far a line may lie
from the line below its junction (`docs/line-plans.md`).

**The mean angle is not the test either.** A tip five metres out on six-metre
lines is genuinely steep. On the test wing the load-bearing lines average 38°
from vertical, and their pulls added together point 28° from it — real
geometry rather than a fault.
