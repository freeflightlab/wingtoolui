# Riser-aware line plans

A line plan is not just a cascade. Which riser each line ends on decides what
the pilot can pull, and the tool had one hardcoded layout.

## 1. Split A risers

Most modern wings split the A row across two risers. `A'` carries the
**outboard** A anchors on its own; pulling it folds the tips — big ears —
while the main A riser holds the centre flying.

**Every Niviuk in the reference set is a split-A wing:** the Hook 6 is
`A-A'/B/C` and the Artik R 2 is `A-A'/B`, a two-liner. The tool had neither
layout, and the interface hardcoded `A/B/C+D`, so a designer could not draw
the wings the database is full of.

Seven layouts now:

```
A/B/C+D      A/B+C      A/B/C/D      single
A-A'/B/C     A-A'/B     A/B/C
```

### The split is a riser change, not a row change

The lines on an `A'` riser are still **A lines** — same anchors, same chord
position, same load path. What differs is where they terminate. So
`applyRiserSplit` runs after the cascade is built and reassigns anchors
outboard of a span fraction, rather than treating `A'` as a fifth row.

That is asserted: every line moved to the split riser is still row `A`, and
centre A anchors stay on the main riser.

### Where to split is the designer's

`splitFrom` defaults to 62% of half-span, and the control appears only when
the chosen layout has a split. Moving it outboard puts fewer anchors on the
`A'` riser — asserted, 45% against 80%.

A split that catches **no** anchors is a riser with nothing on it. That is
reported rather than left for the builder to find as an empty maillon.

## 2. In the interface

The layout is a control, the split position is a slider that appears with it,
and the Lines view marks which anchors hang from the split riser. The cascade
table gained a `riser` column, because "which riser" was previously
computed and never shown.

The layout choice is verified to change an exported file, not just the screen.

## 3. A phantom in the validation set

While auditing which wings are actually checked, the corpus reader turned out
to route two families — `magnum4` and `vibegt` — whose files **had never been
committed**. A routing branch for data that is not there claims coverage the
project does not have, and reads to anyone scanning the tests as though those
wings were being validated.

The family list is now declared explicitly and every name in it is asserted to
have files in the repository. Verified by adding a phantom and watching it
fail:

```
FAIL every family the reader routes has files  no data for vibegt
```

**Vibe GT, Magnum 4 and Enzo 3 are not in this repository.** If those sheets
exist they would be welcome — `docs/collecting-reference-data.md` is the brief
— but the tool should not have implied it had them.

---

## 4. B and C handles

A two-liner has no D row and its brakes are for landing. Accelerated, the
pilot steers on a **handle** attached to a rear riser: pulling it shortens
that riser and pitches the wing, changing the angle of attack.

That is the whole point of the technique. A brake pulls the trailing edge
down, which adds camber and drag and, at speed, invites a stall from the back.
A rear-riser pull changes the **incidence** instead — the wing rotates and the
profile keeps its shape.

| to gain 3° | travel | cost |
| --- | --- | --- |
| rear riser | 56 mm | section unchanged |
| brake | 165 mm | **+6.9% of chord in camber** |

### The lever is the anchor separation, not the riser separation

My first version used the front-to-rear distance at the karabiner, 0.42 m,
and gave **6.8° for 50 mm of pull** — where a real handle gives two or three
degrees over its whole travel.

`alphaChange` in the same module already had the right relation: the lever is
`(xRear − xFront) × chord`, the distance between the anchor rows **on the
wing**. Writing a second relation rather than reading the first is how a
module ends up disagreeing with itself.

Corrected, the C handle gives 3.2° at 60 mm and 4.3° at its stop.

### Why B steering is the more sensitive

The B row sits further forward, so its lever is shorter and the same pull does
more:

| handle | lever | 60 mm of pull |
| --- | --- | --- |
| B (0.30 c) | 0.52 m | **6.6°** |
| C (0.53 c) | 1.07 m | 3.2° |

Twice the effect for the same hand movement, which is exactly why B steering
takes a lighter touch.

### What limits the travel

Not the pilot's arm. The wing pitches out of usable flight long before the
riser runs out of webbing, so `maxPullMM` defaults to 80 mm — a design
decision, and the caller's to set. A pull past it is clipped and says so
rather than returning an angle no wing would fly at.
