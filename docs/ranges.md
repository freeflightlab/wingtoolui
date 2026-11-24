# The range of results by assumption

Where the tool has more than one way to find a figure, and each has a source
behind it, the Flight tab's **Range** button flies the design under every
combination of them and shows the spread. The design is taken as
built: its lines, its hang point and its section stay as they are, and only
the physics changes. Once it has run, the masthead shows the glide's range
beside the balance's single figure, until the design changes.

These are the physics' alternatives. The settings a designer chooses, and
which of the tool's defaults are theirs to change, are in `assumptions.md`.

The tool still reports one figure for each quantity. The balance reports the
polar's, and the Flight tab reports the lattice's. Both are among the cases,
to the last digit (an interface test), and are drawn bright.

## 1. The four assumptions

**The route: how the wing's lift and induced drag are found.**

- **The polar.** Prandtl's lifting line, in the arc by the lattice's factors
  (`aero.js`, `vlm.js` `arcFactors`). The balance, the speed bar and the
  Analysis tab's polar fly on it. The design's calage is held and it is
  trimmed again on each polar (`trimOnPolar`, through `asBuiltOnPolar`). An
  imported design hangs where its own file puts it, when the file gives a
  calage.
- **The lattice.** Each strip on the vortex lattice with its own section:
  the flight model (`flight.js`), trimmed as the Flight tab trims it.

At the same angle the polar has about 10% more lift and 20% more induced
drag than the lattice (`slices.md`). Trimmed as built, the two largely take
it back: the polar trims at a lower angle.

**The section's drag.**

- **The handbook's estimate.** A flat plate's friction over a 35% laminar
  run, with a factor for the thickness (`estimateSectionPolar`). It is the
  polar's own: 0.0107 at the default wing's trim.
- **mfoil.** The viscous solve of the sealed, smooth section, its transition
  free (`mfoil.js`). The slices and the flight model use it: 0.0069 at the
  same lift.

The other choice is changed by its drag alone, the lift and moment kept. The
polar reads mfoil's drag at each station's lift (`wingPolar`'s
`profileDragAt`). The lattice adds the estimate's difference from mfoil to
each strip, at its own lift (`flight.js` `profileDragDelta`). A real canopy's
cell openings, seams and cloth would add to either. No published figure for
how much was found: the study that measured it (Belloc and others 2016, an
open section's inlet) could not be reached, behind its archive's bot
protection.

**The lines' drag.**

- **Typed.** The coefficient in the field: the handbook's 0.020, from a 2012
  school wing.
- **The plan's.** The design's own lines, each with its diameter, its length,
  its angle to the flow and its Reynolds number, with its loops and the
  risers (`lineDrag`): 0.0119 on the default wing.

The checkbox "Fly on the drag of the lines in the plan" chooses which one
the balance designs with. Here both are flown, whichever is ticked.

**The force's direction, on the lattice.**

- **The lifting line.** Each strip's force square to the flow it meets at its
  lifting line. The strips' induced drag then adds up to the Trefftz plane's
  within 2%, and on Belloc's wind-tunnel wing the pitch stiffness is AVL's
  (`stability.md`, section 7). This is the tool's.
- **The three-quarter chord.** The kite paper's (Poland and others 2026), and
  the tool's own until 1.14. It puts the induced drag a third above the
  Trefftz plane's. It is drawn dim and kept out of the range, because it
  fails the tool's own check of its induced drag; it is shown because a
  published method takes it.

That makes twelve cases: four on the polar, eight on the lattice. They take
about a second.

## 2. The default wing

| route | section drag | line drag | force | angle | km/h | sink m/s | glide |
| --- | --- | --- | --- | --- | --- | --- | --- |
| polar | estimate | typed 0.0200 | — | 5.00° | 35.2 | 1.20 | **8.10** |
| polar | estimate | plan 0.0119 | — | 4.42° | 36.1 | 1.11 | 8.98 |
| polar | mfoil | typed 0.0200 | — | 4.48° | 36.0 | 1.18 | 8.43 |
| polar | mfoil | plan 0.0119 | — | 3.88° | 37.0 | 1.09 | 9.39 |
| lattice | estimate | typed 0.0200 | lifting line | 5.90° | 35.0 | 1.18 | 8.14 |
| lattice | estimate | typed 0.0200 | ¾ chord | 8.24° | 31.9 | 1.36 | 6.47 |
| lattice | estimate | plan 0.0119 | lifting line | 5.17° | 36.1 | 1.10 | 9.03 |
| lattice | estimate | plan 0.0119 | ¾ chord | 7.49° | 32.8 | 1.28 | 7.08 |
| lattice | mfoil | typed 0.0200 | lifting line | 5.33° | 35.8 | 1.15 | **8.61** |
| lattice | mfoil | typed 0.0200 | ¾ chord | 7.43° | 32.9 | 1.30 | 6.97 |
| lattice | mfoil | plan 0.0119 | lifting line | 4.57° | 37.1 | 1.07 | 9.59 |
| lattice | mfoil | plan 0.0119 | ¾ chord | 6.66° | 33.9 | 1.22 | 7.68 |

The angle is the trim's angle of attack: the polar's at the central chord,
and the lattice's canopy angle, which is the same thing. Bold marks what the
tool reports: the balance, and the flight.

**The range**, on the tool's force direction, is a glide of 8.10 to 9.59,
35.0 to 37.1 km/h and a sink of 1.07 to 1.20 m/s.

**What moves the glide.** Each figure is the mean, over the other choices
held, of the difference one choice makes:

- the lines: the plan's for the typed, **+0.92**;
- the section's drag: mfoil's for the estimate, **+0.44**;
- the route: the lattice for the polar, **+0.12**;
- the force: the three-quarter chord for the lifting line, **−1.79**.

**The balance's 8.10 and the flight's 8.61 differ by the section's drag, not
by the route.** With the same section drag and the same lines, the polar and
the lattice come within 0.04 to 0.20 of each other. The polar's extra lift at
a given angle is taken back by a lower trim, and its extra induced drag
nearly with it.

**The lines matter most, and the typed figure is the heavier.** The default
wing's own lines are 0.0119 against the handbook's 0.020. Flown on them, the
same canopy glides 0.9 better by either route.

**For scale, a real wing.** A wing of the default's class, the Niviuk Hook 3
in size 25, was measured by Parapente Mag at a glide of 9.3 at 37.5 km/h, as
Heatwole (2022) gives the test (`flight.md`). It is a different wing, so this
is not a check. The cases on the plan's
lines bracket it, at 8.98 to 9.59; the cases on the typed figure all fall
below it.

## 3. What is not in the range

- **The cell openings' and the cloth's drag.** No source was found, so no
  case carries it. It would lower every glide here.
- **The pilot's drag** (`cxPilot`), **the collapse floor** and **the brake's
  slack.** Each has one figure in the tool.
- **The arc.** It is a design choice, not an assumption about the physics.
  The planform map flies the design's arc beside the published wings'
  (`stability.md`, section 5). The default wing's arc, 0.88 of the span, is
  flatter than any of them, and is kept as designed.
- **What the flight does past its trim**: the stall, the departure, the EN
  tests. Those are flown on the tool's own choices only (`flight.md`).
