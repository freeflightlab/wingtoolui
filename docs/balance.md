# The balance, every force where it acts

Chapter 4 balances the wing about its central section with each force placed
by rule: the lift and the wing's drag on the central chord at 0.25 − Cm0/Cz
of it, the wing's weight a third of the way back on the chord, the lines'
weight half way down and their drag a third, the pilot at the karabiners.
LEparagliding, by the same author, puts each at a point it computes (its
section 17, reproduced in `lepbalance.js`) but takes the centre of pressure
typed: the gnuC2-23's designer typed 0.575 m back and 0.395 m down, from
XFLR5.

The balance on the wing's own polar now puts each where the wing itself says
it acts, and takes moments about the karabiners (`balanceWhereForcesAct`,
`equilibrium.js`). The forces are the same as on the rules — the polar's
lift and drag at the angle, the lines' and the pilot's drag, the weights —
so the speed and the glide do not move; only where the pilot must hang does.
The Balance panel's **Forces act** chooses it or the rules; typed
coefficients, as the handbook's example, are flown on the rules alone.

| force | the rule | where it acts |
| --- | --- | --- |
| lift | on the central chord at 0.25 − Cm0/CL | on its own line: the centroid of the lattice strips' lift in the arc, moved along the flow by the sections' Cm0 times their own chords squared (`latticeCentres`, `liftLine`, `vlm.js`) |
| profile drag | at the centre of pressure | at the centroid of the wing's area, in the arc |
| induced drag | at the centre of pressure | where the Trefftz plane puts it, strip by strip (`trefftzSegments`) |
| wing's weight | a third back, on the chord | at its cloth's mass centre, in the arc (`wingMassCentre`, `wing3d.js`) |
| lines' weight | half way down | at their own centre, line by line from the plan, and what the set weighs beyond its lines at the risers' webbing (`lineCentres`, `loads.js`) |
| lines' drag | a third of the way down | at their own drag centre, by each line's drag area |
| pilot | at the karabiners | below them, free to swing, or held plumb |

The lines' centres need a plan and the plan needs a calage, so the first
solve places the lines by the rules, the plan is hung from it, and the
second takes the plan's own centres; a line's middle moves with the
karabiners by its depth over theirs, so the set keeps its shape as they move
along the chord. The plan is then hung from the second.

## 1. What it reproduces

- **The rules.** Every point put where the rules put it, the pilot at the
  karabiners and plumb, it returns the handbook's calage to the micrometre.
- **The program.** The pilot plumb and every point the program's, its
  section 17 on the gnuC2-23 to the micrometre: 47.88% at k = 1 and the
  44.17% it prints (`calageFromForces`).
- **The lines.** On the gnuC2-23's own plan the lines' weight is centred
  within 1.4 mm of where its program centres it, 3.80 m down, and their
  drag within 3 mm, 3.42 m down: each line's Cd from its Reynolds number
  and its loops as the program counts them (`docs/loads-and-materials.md`
  §3).
- **The lattice.** A flat rectangle's lift, induced and profile drag on its
  quarter-chord line, on its chord; between the two angles it solves, the
  centre within a millimetre of a solve at the angle itself.

## 2. Where the lift is

Two things move it, and they pull opposite ways. A paraglider's
quarter-chord line runs back toward its tips, so its lift is further aft
than the central section's quarter chord: the gnuC2-23 laid flat carries it
33.6% back. In its arc, where the outer wing's lift is turned sideways, it
is 31.2% back and 0.60 m below the chord, and its line, square to the flow,
crosses the chord at 29.1%. And the sections' own moment is carried on their
own chords, smaller outboard, where the rule puts all of it on the central
chord.

| wing, at its angle | Cm0 | the rule's centre of pressure | the lift's line, on the chord | its centroid, below the chord |
| --- | --- | --- | --- | --- |
| the gnuC2-23, at 4.51° | −0.0078 | 26.9% | 30.6% | 0.60 m |
| the Swoop2, at 4.32° | +0.0246 | 17.4% | 23.3% | 0.53 m |
| the Tuluaq-19, at 7.41° | −0.0084 | 26.5% | 28.7% | 0.39 m |
| the default wing on a NACA 0012, at 5° | 0 | 25.0% | 28.3% | |
| the default wing, NACA 4415, at 5° | −0.106 | 40.1% | 40.2% | 0.51 m |

On a section with little camber the sweep wins. On the default wing's NACA
4415 the sections' moment moves the lift 31 cm along the flow where the
rule moves it 39, and the two cancel. The lattice's sections are flat plates
at the angle less the section's zero-lift angle, and their moment is the
section's Cm0, as the rule's is: thin-aerofoil theory's, or a loaded XFOIL
polar's, its moment and its angle where its lift is zero (along its lift
slope when it does not reach zero lift), which the Balance panel names. A
real section's boundary layer takes some of its camber's effect away, so a
polar's moment is usually the smaller of the two.

The profile and induced drag act lower than the lift: 0.61 m down on the
default wing, 0.77 to 0.79 m on the gnuC2-23. The point where its lift's
line meets its drag's, the point LEparagliding asks a designer for, is 33.2%
back and 0.78 m down on the gnuC2-23 at 4.51°.

## 3. The other weights, and the pilot

The gnuC2-23's cloth puts its weight 51% back and 0.73 m down, where its
program's rule — each rib's point at 36% of its chord, at its height —
says 44% and 0.89 m. The cloth's centroid is above the chord, where the
upper skin and the ribs are, and it weighs each cell by its area where the
program weighs each rib by its chord. Rods, diagonals, tapes and the
anchors' reinforcement are taken as spread like the cloth; on Skywalk's SAGE
they come to 8% of the wing (`docs/construction.md` §7).

A pilot free to swing comes to rest with his weight and drag in line with
the karabiners: he puts no moment about them, however far below he hangs,
and leans back by his drag over his weight: 1.3 to 2.8° on these wings.
Held plumb, as the handbook and the program have him, his drag that far
below pitches the wing down, and the pilot must hang further aft: 0.18% of
chord on the gnuC2-23's section 17. **The pilot hangs** chooses; **Pilot
below the karabiners** is offered when he is held plumb, the only time it
moves the balance, and an imported design brings its own (the gnuC2-23's
0.2 m).

## 4. The three designs

Each at the angle its file declares, and trimmed from its own calage:

| design | its calage, at its angle | the rules, at that angle | where each acts | its calage trims, on the rules | where each acts |
| --- | --- | --- | --- | --- | --- |
| gnuC2-23 | 33% at 4.51° | 25.5% | 32.4% | 5.81°, 38.6 km/h | 4.63°, 41.9 km/h |
| Swoop2 | 32.5% at 4.32° | 10.7% | 20.8% | 7.14°, 46.6 km/h | 5.98°, 50.4 km/h |
| Tuluaq-19 | 36% at 7.41° | 34.7% | 38.8% | 7.79°, 41.7 km/h | 6.52°, 44.5 km/h |

The angle a design declares is its program's construction (section 8), not
a measurement: a typed plumb point, 38, 40 and 39%, and a typed glide, 10.5,
10 and 7, where this tool's polar glides them at 7.7, 5.9 and 7.4. The
gnuC2-23's agreement, to 0.6% of chord, is closer than either model's
assumptions deserve, so some of it is chance; the rules' 7.5% is not. The
Swoop2's reflex section has a nose-up Cm0 that its designer's 40% plumb
point does not show, and neither balance hangs it where its file does. The
gnuC2-23 is flown with the pilot its section 35 balances, 70 kg on a 4 kg
wing with his own drag; the other two leave section 35 off and are flown
with this tool's, 80 kg on 5 kg, Cx 0.015.

On the default wing at 5° the calage moves from 39.7% to 42.3%. It flies on
the handbook's typed line drag, 0.020, unless asked to fly on its plan's,
and that drag acts where the plan's own does: 3.88 m down with its 12 mm
risers, 2.85 m without them, where the rule has 2.33. Their weight is at
6.18 m with the risers' webbing, and the pilot hangs 1.3° behind plumb.

The gnuC2-23's section 17 asks for the calage at 9.45°, the angle its
designer typed beside the centre of pressure. In the program's own
equations, with the lattice's point in place of the typed one, it is 55.0
to 55.5% rather than 47.9%: at 9.45° the lattice's lift crosses the chord at
27.8%, where a line through the typed point crosses it at 21.6%.

## 5. Written out for the program

An exported design's section 8 gave the program the centre of pressure, to
a whole per cent. The program reads it as the point the pilot hangs plumb
under and sets the attitude from it, asin((Cp − calage)/line height), so it
flew the export at another angle than the balance it came from. It writes
the karabiners' plumb point now, to a hundredth, with the riser the plan
hangs from: the program gives back the balance's attitude.

## 6. What it does not do

- The sections' moment is one Cm0 at every angle, the polar's at zero
  lift, though an XFOIL polar's Cm moves a little with the angle.
- Each riser's strap is counted alone, at a flat plate's 1.98 broadside, as
  the program counts one: three or four straps one behind another shield
  each other by an amount nothing here measures, and a strap forty times as
  long as it is wide makes less drag than a plate without ends.
- The wing is the central section's plane: what the lattice finds spanwise
  is summed into it, and the speed system still turns the wing about the
  karabiners by the risers' geometry (`docs/speed-system.md`).
