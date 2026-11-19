# Brake cascades

Brakes were the last row still parsed but not generated. They are not simply
another anchor row, and the production data says so in four ways.

Ground truth: **BGD Lynx 2 M**, whose line table states its own cascade, plus
brake blocks from the PHI and Ozone sheets.

---

## 1. What makes a brake different

**Four levels, not three.** The Lynx 2 runs `k -> KM -> KR -> KL1`: 13 lines
at the trailing edge, on 6, on 3, on one. Ozone's sheets have the same four
as `K`, `KMU`, `KML` (the Geo 7's `KM`) and a main in two pieces, `KRU` over
`KRL`: 11 to 14 lines, then 4 to 7, then 3, then 1, on the Alpina 5, Geo 7,
Lyght, Swift 6, Ultralite 5, Vibe GT and Zeno 2. Every load-bearing row runs
three.

**One main line.** `KL1` is in all thirteen Lynx 2 paths at the same 2926 mm:
one line from the handle, up through the pulley on the rear riser, to the
first junction, carrying the entire cascade. On the Geo 7 MS the main is
`KRU1`, 1756 mm, over `KRL1`, 1400 mm and marked for the handle at 1150 — 2906
mm from handle to junction, and the Geo 7's rigging diagram draws it so.
Nothing in the A/B/C/D rows behaves like that.

This page said `KL1` ran from the handle up to the pulley, and the generator
was built that way: the first junction AT the pulley, three `KR` lines a
side from it, each about the length the one main really is. Read so, the
brakes came out a fifth to a half longer than the sheets' — the Geo 7 MS
26.5 m a side against 21.5, built at its own counts and line height — and
the whole cascade over them started two and a half metres too low
(section 4).

**Anchors are deliberately uneven.** The Lynx 2 attaches at ribs 2, 4, 8, 10,
13, 15, 18, 20, 23, 25, 27, 29, 31 of 33 — gaps of 2 to 4 inboard closing to a
steady 2 outboard. Braking is meant to bite at the tip first. No wing on file
has a brake line on its centre rib or its tip.

**Total path falls outboard**, 7913 mm at rib 2 to 6813 mm at rib 31, because
the arc brings the tip trailing edge nearer the pilot.

`buildBrakePlan` builds the structure: 13 anchors on 6 upper middles on 3
lower middles on one main line, with `levelCounts` taking the shape from a
reference wing, and BGD's names.

---

## 2. A measure that looked right and was not

The first version of this reported **free travel** as the cascade path length
minus the straight-line distance from handle to trailing edge. It produced
plausible-looking numbers — 301 to 906 mm across the span — and it is
meaningless.

The cascade path *is* the taut route. The difference between it and a straight
line is just how far the route bends around its junctions, and it grows with
span for reasons that have nothing to do with braking.

Free travel cannot be derived from geometry at all. **If every brake line were
cut to its exact taut length, the whole trailing edge would engage the instant
the handle moved.** Free travel is the slack the designer *adds*, and the
spanwise differential — which part of the wing bites first — comes from how
that slack is distributed, not from where the anchors sit.

`brakeEngagement` therefore takes a slack distribution and returns the
engagement order. The tests pin the physics rather than a number:

| slack | engagement across span | reading |
| --- | --- | --- |
| uniform 120 mm | 120 → 120 mm | whole trailing edge at once |
| `tipFirstSlack(180 → 60)` | 180 → 60 mm, monotonic | tip bites first |

The uniform case is reported as `uniform: true`, because a brake rigged that
way is a design error rather than a neutral default.

---

## 3. A bug the tests caught

Asking for 13 anchors on a 13-rib half wing returned the outermost rib
**twice** — two brake lines onto one attachment point. The monotonic repair
clamped at the tip and then had nowhere left to go.

Anchor counts are now capped at the rib count, and a run that hits the ceiling
is swept back inboard rather than collapsing onto the last rib. A related tie
in engagement — two anchors at the same slack — is resolved to the outermost,
which is the one a pilot feels first.

---

## 4. Where the junctions go

Each junction sits a fraction of the way from the one below it toward the
centroid of the trailing-edge anchors it serves: the main's from the pulley,
each lower middle's from the main's, each upper middle's from its lower
middle's (`BRAKE_GEOMETRY.levelFractions`, 0.42, 0.64 and 0.72). The handle
hangs 0.26 m under the pulley (`handleDropM`); the main line's length counts
that, and the line drawn is the one above the pulley.

Both were fitted to 26 sizes of five wings — the Geo 7, Ultralite 5, Alpina 5,
Zeno 2 and Lynx 2 — each built at its own anchor and middle counts with its
lines as long as its sheet's centre A path, against the main to the handle
(Ozone's `KRU` and `KRL` to the mark, BGD's `KL1`), the mean line of each
level and, where a sheet gives them, the paths to the handle anchor by anchor:

| | from the sheets, by design |
| --- | --- |
| upper lines | −14 to +27% |
| upper middles | −24 to +30% |
| lower middles | −9 to +7% |
| main, to the handle | −12 to +2% |
| path to the handle, each size's mean (Geo 7, Ultralite 5, Lynx 2) | −1.2 to +1.8% |
| the same at each of their 205 anchors | −4.2 to +5.7% |
| a side's whole brake | −9 to +12% (the cascade it replaces: +22 to +55%) |

Fitted to one design alone the fractions run 0.36 to 0.52, 0.58 to 0.70 and
0.66 to 0.76: real designs differ, and the Zeno 2's and the Lynx 2's upper
lines are a fifth to a quarter shorter than the fit gives them. Fitted
without one design at a time, the fractions move by 0.02 at most and the
design left out comes within 11% under to 14% over a side (the Alpina 5 and
the Zeno 2 at the ends), its paths to the handle within 2.2% on the mean and
6.3% at any anchor: what it does on a wing it was not fitted on.

The handle drop comes out 0.31 to 0.32 m on the Geo 7 and Ultralite 5, whose
sheets mark the handle, and 0.10 m on the Lynx 2. It holds the free travel as
well as the line under the pulley: the sheets' paths are the cut lengths.

LEparagliding's three designs, which the fit did not see, start their brake
from the riser top too, and put the first junction 2.54, 2.86 and 2.26 m
above it on the Swoop2, the gnuC2-23 and the Tuluaq-19. Built on the same
wings, the fit puts it 2.37, 2.66 and 2.29 m above. Their designer's upper
lines are another matter: 0.77 to 0.86 m, about twice the makers'.

The anchors run from 6.5% of the way out, counted in ribs, to 92.5%, closing
outboard to four fifths of their inboard spacing — fitted to the five wings
whose brake ribs are on file: the Lynx 2's sheet, the Geo 7's rigging diagram (ribs 2 to 22 of
24, every second), and LEparagliding's gnuC2, Swoop2 and Tuluaq. They had run
from the centre rib to the tip, closing to a third.

In shape — each anchor's path to the handle once the mean offset is taken out
— the brake is 63 to 168 mm from the 16 sizes above with per-anchor totals
(the Lynx 2 the furthest), where the cascade it replaces was 109 to 199 mm
from them. Part of what remains is the makers' own: the sheets cut the inboard
paths a few tenths of a metre longer than the outboard ones beyond what the
geometry asks — more free travel inboard, so the tip bites first — and this
builds the lines taut and leaves the slack to `brakeEngagement`.

---

## 5. Not yet covered

- **Each design's own brake counts.** The pipeline builds 13 anchors on 6 and
  3 middles on every wing; the sheets' run from the Geo 7's 11 on 4 and 3 to
  the Vibe GT's 14 on 7 and 3. Writing them into `DESIGN_LINES` needs the
  corpus to read every maker's brake: Niviuk's sheets stop above the main,
  and UP's Makalu 5 and K2 5 brakes have three levels where this builds four.
- **The pulley's own position.** It is the top of the rear riser, as in
  LEparagliding; on most risers it sits lower, and the handle drop takes up
  the difference with the free travel. `brakeSlackUnderBar` gives the slack
  the bar adds: none with the pulley on the rear riser, which the bar does not
  move, and what the riser travels with it on one that does (90 mm in the
  test, double if the line is roved through the pulley).
- **The PHI brake block** still is not decoded: it lists each upper line
  twice, plain and with the spanwise distribution added, so its columns do not
  map one-to-one onto names.
- **Brake line sizing.** `loads.js` applies a larger safety factor to the `K`
  row for shock loading, but brake loads are not modelled — they come from
  pilot input, not from the lift distribution.
