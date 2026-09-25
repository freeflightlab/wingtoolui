# A wing is not made of one cloth

The bill of materials carried four cloth weights — upper sail, lower sail,
rib, diagonal. Niviuk's own specification for the Bi Skin 2 P lists **nine
materials by location**:

| location | material | supplier |
| --- | --- | --- |
| upper surface leading edge | 9017 E25 | Porcher |
| upper surface | 70032 E3W | Porcher |
| lower surface | 70032 E3W | Porcher |
| ribs | 70032 E4D | Porcher |
| loops | LKI-10 | Kolon |
| reinforcement loops | 9017 | Porcher |
| trailing edge reinforcement | Mylar 20 | D-P |
| rib reinforcement | LTN-0.8 stick | Sportware |
| thread | Serafil 60 | Amann |

## The differences are not arbitrary

**The nose takes a harder finish** — E25 where the rest of the upper surface
is E3W — because it is the part that must hold its shape unpressurised and
takes the most handling.

**The ribs take a different weave again** — E4D — because they work in tension
across their whole depth rather than as a bulging membrane.

**The trailing edge takes Mylar**, which is not fabric at all, because cloth
there flutters.

Weight alone cannot express any of that, and weight alone was what the model
had.

## What the tool refuses

These are not style rules.

- **A soft-finish cloth at the leading edge.** A wing whose nose will not hold
  its shape unpressurised is a wing that will not launch cleanly.
- **A sail heavier than its ribs.** That is the wrong way round: it puts the
  weight where it does least.
- **A cloth that is not in the library**, with the list of what there is.

## In the tool

Four selects under Assumptions — leading edge, upper surface, lower surface,
ribs and diagonals — and the chosen weights flow into the bill of materials
rather than four constants. The schedule reports how many distinct cloths it
needs, because a workshop stocks rolls the same way it stocks line spools.

## Provenance

The **weights** are published by Porcher and Dominico and widely quoted. The
**finish and use notes** are this project's characterisation of what each
cloth is for, not a manufacturer's claim. `CLOTH.provenance` says so and the
provenance check stage enforces it.
