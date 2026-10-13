# Four lengths, and why they are not interchangeable

Designing for aerodynamics and designing for manufacture ask different
questions of the same line. The answers differ by more than the inspection
tolerance, so the distinction is not pedantry.

## The four

| length | what it is | who needs it |
| --- | --- | --- |
| **flying** | length under its actual working load | the design: it sets where the anchor sits relative to the pilot, and therefore angle of attack, trim speed and the polar |
| **reference** | measured at the PMA's 5 daN | the manual, and the inspector checking against it |
| **sewn** | unloaded, inside of one loop to the inside of the other (PMA Figure 6) | the sewer |
| **cut** | sewn plus the loop allowance | the material order |

A wing is *designed* in flying lengths and *built* in cut lengths. Neither is
what gets published, and neither is what an inspector measures.

## The surprise in the middle

It is natural to assume the measuring tension is small beside the flight load,
so a reference length is near enough the flying length. **On most of a
paraglider's lines it is the other way round.**

The load is spread over many lines, so at 1 g, on the 12-cell test wing at
95 kg (46 lines a side):

| level | lines | flight load | against 5 daN |
| --- | --- | --- | --- |
| upper | 28 | 0.0 – 3.7 daN, mean 1.7 | below |
| middle | 12 | 0.6 – 6.6 daN, mean 3.5 | below on average |
| main | 6 | 3.1 – 12.7 daN, mean 7.8 | above on average |

and on the same wing with 24 cells (85 lines): upper 0.9, middle 1.9 and
main 5.2 daN on average — the mains about at the measuring tension, the rest
well below.

**A line measured at 5 daN is longer than it flies at 1 g**, on 39 of those
46 lines (79 of 85 on the 24-cell wing). The reference length is a stretched
length. The seven that carry more than 5 daN — the inner mains and middles —
are the other way about, by up to 8 mm.

## How much it matters

```
reference − flying:  mean  +3.2 mm
                     worst +11.8 mm   = 98% of the PMA ±12 mm band
```

The worst cases are the **long, thin, lightly loaded** lines — the floor-sized
ones, where 5 daN is a large fraction of a rated strength that was never
chosen for load in the first place. The closed form is

```
Δ = L · ε · (F_measure − F_flight) / F_rated
```

and on the worst line, the outermost D: `2438 × 0.04 × (5 − 0.03) / 41 =
11.8 mm`, which the tests check against the model rather than trusting it.
More cells hardly change it: the lines get lighter and stay as long. On the
24-cell wing the worst is 11.4 mm.

**Publishing a design length where the standard asks for a measured one puts a
systematic error into every manual and every inspection** — one that would
show up as a fleet-wide trim complaint and be blamed on the lines.

## What the tool does

`lengthChain` produces all four from a line selection and the loads. The
exchange record now takes it, publishes the reference length, and **states the
tension it was measured at**. Without it the record still works, but says
plainly that its totals are design lengths and marks itself incomplete —
because a manual that does not say which length it lists is worse than one
that admits it does not know.
