# Flight — the glider through its brakes

The Flight tab flies the design through brake inputs. The inputs are:

- **Brake:** the left brake, the right brake, or both.
- **Travel:** pulled to a travel (35 cm by default).
- **Rate:** over 3 s, 1 s or 0.5 s.
- **Start:** from hands-up trim or on the speed bar.
- **Canopy under the brake:** drooping, as PGSim has it, or rigid (below, "The turn").
- **How the pilot hangs:** fixed under the canopy, one body, or hung on the lines, two (below, "Two bodies").
- **The canopy at low angles:** its rows holding it up, as PGSim has it, or its section alone (below).

The brake is held (12 s by default), then released or kept. The flight first shown is a turn: the right brake to 35 cm in a second, held for about a circle, then let go. All eighteen combinations of start, brake and rate fly in about 20 seconds at the default hold. Each flight plays back in three dimensions and can be recorded to video (WebM, or MP4 where a browser records only that) or saved frame by frame. The models are `src/core/flight.js` and `src/core/brakesection.js`.

It is a rigid-body model: one body, or two with the pilot hung on the lines, and a canopy that keeps its shape except where the brake pulls it down and, at low angles, where its rows hold it up. A real canopy deforms, folds and spins in ways a rigid one cannot. The model therefore says when a flight has left what it can stand behind, and ends that flight two seconds later.

Until 1.18 the default flight was the full 65 cm in a second: a spin entry, which stalled the wing two seconds in. What showed was a straight glide and then "departed". And with no droop, one brake turned the wing at about half the rate and a third of the bank PGSim flies, a skid round nearly flat.

## What carries it

### The section, braked (`brakesection.js`)

A brake does not hinge a flap. It pulls the trailing edge down, and the cloth behind the last line rows bends. The model bends the chord behind 65% into a circular arc. The arc keeps its length, and the surfaces are carried on it. A bend of θ at the trailing edge drops the edge by 0.35 (1 − cos θ)/θ of the chord: 0.061 at 20° and 0.117 at 40°. The drop is capped at 90°, where it is 0.223. Heatwole's Hook 3 model reached a drop of 0.203 at full brake.

The coefficients come from four sources:

- **Solved, 0° to 40°.** mfoil (`mfoil.js`, held to mfoil.py to 3e-13) solves bends of 0, 10, 20, 30 and 40°. Each sweep starts from the angle that converges first, and each solve starts from its neighbour's boundary layer. A failed solve is retried from halfway, then cold, and a cold start further up fills a gap a warm sweep could not cross. The results are smoothed by a local quadratic over ±3°. The jumps where transition moves are a few hundredths of lift and do not belong in a flight simulation. Past 50° mfoil does not converge, because the flow separates off the bend.
- **Beyond 40°.** The bend's increments are fitted angle by angle to the solved levels. Lift follows sin 2θ, which at zero angle reproduces mfoil within 0.04 from 5° to 40°, and stops growing at 45°, as a plain flap's lift does. Drag follows sin³θ, which also comes within 0.01 of the one point mfoil converges at 60°. The moment follows the lift.
- **The stall.** The unbent section stalls where its lift slope falls below 0.3 of the linear slope. That is 15° on the NACA 4415, against the Ohio State tunnel's maximum at 14°. A bend brings the stall earlier by 0.09° a degree, the trend in Heatwole's XFLR5 braking polars: the angle of maximum lift falls 7° over a drop of 0.20 of the chord.
- **Past the stall.** Viterna's extrapolation runs to a flat plate square to the flow (cd 2.0 in two dimensions). The plate's angle is that of the chord from the nose to the bent trailing edge. Its moment comes from a centre of pressure moving from the quarter chord back to the middle. At negative angles, and past the table's −30° to 90°, the table follows the plate's bounded shape, joined to the table's edge. Viterna's own form there divides by the plate's angle: one strip on a 79° bend at −14° read a lift of 198 before this was found. Nothing in the table jumps by more than 0.2 in lift between half degrees, at any angle and any bend (a unit test).

The library's four sections are solved ahead and shipped in `data/reference/brake-sections.tsv`. They are the NACA 2414, 4412, 4415 and 4418, at Re 1.4 million, ncrit 7 and 160 panels. A full table takes about two minutes of solving. The tool uses a shipped table when the design's section is one of these as built, with no reflex and nothing imported, and its trim Reynolds number is within half again of 1.4 million. Otherwise it solves the design's own section, once, with progress shown.

### The glider (`flight.js`)

The glider is one rigid body hung from the riser midpoint, with six degrees of freedom.

- **Aerodynamics.** The slices' lattice (`vlm.js`, as in `slices.md`). The alpha method turns each strip's boundary condition until the strip's lift is its section's at the angle the whole wing leaves it. The lattice is factorised once, with its wake fixed along the trim's flow in the body. Each strip meets its own velocity: the glider's, plus its rotation. Roll, pitch and yaw damping, and the arc's dihedral effect, therefore come out of the lattice rather than from derivatives typed in. Each strip's force is square to the flow at its lifting line: its geometric angle less its induced angle, half the Trefftz plane's wash on it, so the strips' induced drag adds up to the Trefftz plane's (1.14; in 1.13 the direction was the three-quarter chord's, a third more induced drag: `stability.md`, section 7). A strip more than 10° past its stall, or below −15°, has nothing the small-angle lattice can say about it. It meets its own air, and the lattice is only told its lift.
- **The brake.** The handle's travel first takes up each anchor's free travel (`tipFirstSlack`: 180 mm at the centre and 60 mm at the tip by default, both set in the tab). It then pulls that anchor's trailing edge toward the pulley. The drop square to the chord is the pull times the cosine between the line and the section's normal: 0.975 to 0.992 on the default wing, whose brake lines meet the canopy nearly square. Between anchors the drop runs straight from one to the next. Inboard of the first anchor it runs across the centre to the other side's first, and outboard of the last it falls to nothing at the tip. The drop over the chord gives the bend.
- **The canopy under the brake** (1.18, from PGSim). The brake lines pull the trailing edge down and in toward the pilot's hand, and the pulled part of the canopy rolls outboard about its chords: more anhedral where it is pulled. Each strip's force turns about its chord, outboard, by `brakeDroop` (0.3) radians for each unit of its trailing edge's drop over its chord, at most `droopMaxDeg` (8°). Hands up nothing turns; with both brakes both sides turn alike. The next section says why this matters and where 0.3 comes from.
- **The canopy at low angles** (1.19, PGSim's `cmLow`). A rigid cambered section's nose-down moment keeps growing as its lift falls: its centre of pressure runs aft. A pressurised one's does not: as the stagnation point moves onto the upper nose, the nose flattens and the line rows hold the rear of the profile up. Each strip below 3° to its chord, and not deep in its stall, gains 0.8 times the shortfall in radians (at most 0.2) of nose-up moment coefficient, PGSim's figures. Hands up the default wing's strips meet the air above 3°, and nothing changes. On the bar it is what lets the trim reach the bar's end, as a real wing does: the default wing's 120 mm of 150, against 90 mm on its section alone, and the Geo 7 L's full bar (below). The tab keeps the section alone as the other assumption.
- **The mass.** The canopy's cloth is spread over the strips by area. The air inside the canopy (5.8 kg on the default wing) counts in the mass and inertia, but not in the weight, which the air outside carries. The lines sit at half their height and the pilot at the karabiners, where the balance (`equilibrium.js`) puts the pilot's weight and drag.
- **Apparent mass.** The canopy's apparent masses and inertias follow Barrows (2002) for an arched wing, assembled about the riser midpoint as Heatwole's glidersim does (2022, MIT licence). The steady Munk moment is taken out, because the sections' own moment already holds it. On the default wing the arch's radius is 5.93 m and its semi-angle 49.5°. The apparent masses are 0.9 kg along the chord, 6.9 kg across it and 29.1 kg square to it.
- **Drag of pilot and lines.** As in the balance: coefficients on the wing's area, the lines' drag acting a third of the way down (handbook 4.2).
- **Integration.** Fourth-order Runge–Kutta at 0.01 s, a frame kept every third step: 33⅓ frames a second. Until 1.18 the flight said 30, the rate asked, so the view found each moment's frame a tenth early and never showed a flight's last tenth.
- **The speed bar.** The bar turns the canopy nose down about the C row by the angle the risers give (`alphaChange`, `risers.js`). The bar is pushed out a row at a time, each trim found from the last. It stops at the first row whose trim would leave the wing's lift below the riser model's collapse floor (CL 0.35).
- **Departure.** A flight has departed when a quarter of the span is deep in its stall, when the air meets the canopy at more than 30° or below −10°, or when its sideslip passes 30°; with two bodies, also when every line is slack. It then ends two seconds later, unless the tab is told to fly on. The extremes reported are only those up to the departure. The air is read at the canopy itself, at its strips' quarter chords by area (1.19). Until then it was read at the riser midpoint, which is where the pilot is: turning, the canopy flies a circle of its own, six metres in from his, and in a pitch or a spiral the two meet the air very differently. In 1.18 the default wing's both brakes pulled 65 cm in 3 s on the bar were said to depart when the pilot's point met the air at 31°, with the canopy itself below 20° and no strip deep in its stall. In the EN spin test's spiral the canopy's sideslip passes 30° while the pilot's is 9°.
- **A spiral dive** is marked from the moment the sink passes 14 m/s (`spiralSinkMS`), the sink EN 926-2 flies its spiral-dive test to. A spiral is still flying, so the flight goes on.

### Two bodies (1.19, PGSim's default)

- **The canopy** is one body about the riser midpoint: its cloth, the air inside it, the lines and all of its apparent mass.
- **The pilot** is the other, his centre 0.23 m below the karabiners, his inertia a seated box's of 0.5 × 0.45 × 0.9 m.
- **The lines** are one bundle a row (A, B, C, D) on each side, from the row's mean attachment on the canopy to the karabiner. A bundle pulls only while stretched. A side's stiffness is 60 kN/m and its damping 500 N·s/m, every line and the riser in series (PGSim's), shared over the rows as they carry the load: 35, 35, 20 and 10% (handbook 8.1). The harness damps the pilot turning against the canopy: 15, 6 and 12 N·m·s/rad in roll, pitch and yaw (PGSim's).
- **The start** is the one body's trim. The lines are hung at the lengths that hold the canopy there, their pulls through the karabiners adding up to the canopy's own force, and the pilot hangs at rest along his weight and drag. Nothing accelerates, to the trim's own convergence, and left alone it holds the trim to 1e-7 m/s over 4 s (unit tests). PGSim starts its lines unstretched and lets the pilot settle, about 1 km/h off its rigid trim.
- **Twelve degrees of freedom**, the same Runge–Kutta step. A flight takes about as long as one body's: the lattice is most of the work.
- **What it says:** how far the pilot has swung under the canopy, sideways and fore and aft, and twisted; the lines' pull; and which rows are slack, in the view and in the saved table.

Every flight is flown with the pilot hung the other way too, the second twin: the chart draws its bank and turn dashed and the note gives what it did.

## The turn

**Why a rigid canopy hardly banks.** A paraglider's arch is steep: the outer cells stand at 40° to 60°. Pull the right brake and the right side's sections carry more lift and more drag. The drag yaws the wing right. The extra lift is square to those canted cells, so it points outward and up, nearly through the riser midpoint. It pushes the wing sideways more than it rolls it. Slegers and Costello (2003) found this in a parafoil model: a flat canopy rolls away from the pulled brake, a curved one skids toward it, and the more curved, the more it skids. A paraglider is the curved kind. So a rigid paraglider canopy skids round a turn nearly flat, slipping outward.

**What PGSim adds.** PGSim, the simulator built alongside this tool, takes the pulled side's deformation into account. The brake lines draw the trailing edge down and in toward the hand, and the braked sections roll outboard, tilting their force with them. The tilt acts at the end of a lever as long as the lines, and it is what banks the wing into the turn. PGSim tilts by 0.5 radians for each unit of trailing-edge drop over chord, at most 8°. Flown headless on its own Geo 7 L, with nothing else changed, PGSim without the droop turns as this tool did. Its own figures are in `data/reference/pgsim-turns.tsv`.

**Why 0.3 here.** This tool's brake pulls each anchor straight from the pulley once its free travel is taken up. PGSim reads each trailing edge's travel through the cascade's own angles, from 0.08 m of free travel. For the same hand travel, this tool's trailing edge drops further: at 43 cm on the Geo 7 L by about a third, 0.104 of the chord against 0.079, averaged over the pulled half by area. With PGSim's 0.5 on those drops, the Geo 7 L at 95 kg winds into a spiral at 43 cm, where PGSim's rigid body turns steadily at 23°/s. A droop of 0.3 flies PGSim's rigid-body turn there, and both canopies can be chosen in the tab. Each flight also flies its twin under the other canopy: the chart draws the twin's bank and turn dotted, and the note gives what it did.

**Against PGSim.** Both models fly the Geo 7 L the same way: from trim, the right brake from nothing at 1 s to the travel at 2 s, held. Each figure is the mean turn rate and bank from 8 to 16 s. This tool's Geo 7 L is built from its specification; PGSim's is its own OBJ.

| Weight, travel | PGSim, rigid canopy | This tool, rigid canopy | PGSim, droop, one body | PGSim, droop, two bodies | This tool, droop 0.3, one body | This tool, droop 0.3, two bodies |
|---|---|---|---|---|---|---|
| 95 kg, 25 cm | 11.6°/s, 7° | 8.9°/s, 6° | 17.6°/s, 14° | 17.5°/s, 14° | 12.2°/s, 10° | 12.3°/s, 10° |
| 95 kg, 43 cm | 14.7°/s, 8° | 15.2°/s, 9° | 22.9°/s, 20° | 31.2°/s, 28° | 25.3°/s, 21° | 25.9°/s, 22° |
| 115 kg, 25 cm | 13.0°/s, 9° | 9.9°/s, 8° | 20.1°/s, 18° | 20.3°/s, 19° | 13.6°/s, 12° | 13.8°/s, 12° |
| 115 kg, 43 cm | 16.4°/s, 12° | 17.1°/s, 13° | 26.4°/s, 26° | a spiral | 33.0°/s, 33° | 36.1°/s, 37° |

At 43 cm the two agree: the rigid canopies within 5%, and the drooping one between PGSim's two bodies and its one. At 25 cm this tool turns a quarter to a third less, with or without the droop. Its free travel at the centre is 180 mm against PGSim's 80, and the two models' braked sections are not the same. PGSim's two bodies, the pilot hung on line bundles under the canopy, add a third to the turn at 43 cm and 95 kg, and a spiral at 115 kg. This tool's two bodies add 1 to 10% (next section). The interface test flies three of these cases and holds the tool to PGSim's band, with one body and with two.

**Two bodies against one.** On the default wing the default turn flies with two bodies as with one: 380° by the release against 371°, held at 32°/s and 31° of bank on average against 31°/s and 29°. As the brake comes on, the braked side's lift pushes the canopy outward while it is still level, and the pilot hangs 5° to the inside of its axis; held, 1.8° inside; let go, the wing rolls level and swings 17° past. The lines pull 77 to 114 kg and never slacken. On the Geo 7 L this tool's two bodies turn within a tenth of its one (above). PGSim's turn a third faster at 43 cm and 95 kg, and its turn follows the pilot's drop below the karabiners: about 20°/s with none, 31 with 0.23 m, 33 with 0.45 m. This tool's moves from 20.6 to 26.7°/s over the same drops, and from 28.0 to 25.6 as the lines stiffen from 15 to 240 kN/m; stiffened to 240 kN/m, PGSim's falls to 25.7, toward its one body's 22.9. Neither the harness's damping, the karabiners' spacing nor the bundles' layout moves PGSim's. Why the two differ is not found (on the roadmap).

**On the bar.** The lines all meet at the karabiners, so with two bodies the canopy is free to pitch about them: only its own moment holds it, where with one body the pilot's pendulum does. On its section alone the default wing trims on the bar at 90 mm with the canopy at 0.2°, its centre of pressure so far aft that its A's carry 8% of the load (27% hands up). A brake pulled there slackens the A's at 17 to 20 cm, the canopy at −0.2° to −0.8°, and it pitches over on its rear rows, a frontal tuck: every flight on the bar departs, 1.6 to 3.6 s in. The one body flies through both brakes, and on one brake until a quarter of its span stalls, 4.8 to 6.8 s in. PGSim's two bodies fly the Geo 7 L through the same pulls on 60% of its bar with every line taut, the canopy at down to −3.9°: its relief holds the canopy up at low angles. With the relief, the default wing trims at 120 mm, its A's carrying 15%. A brake pulled fast or in a second slackens an A for a moment as it comes on; held, the wing spirals 11 to 14 s in and departs, the one body a second sooner. Both brakes fly through. On the Geo 7 L at its full bar, one brake held at 35 cm slackens an A after 11 s at 38° of bank and the canopy tucks, where the one body and PGSim's two bodies turn on, PGSim's at 25° with its lines taut.

**Against a wing.** No paraglider's measured turn rate against brake travel was found. A turn's shape can still be checked. Ákos, Nagy and Vicsek (2008) measured competition pilots' thermalling circles on 1-second GPS tracks: 20.1 s a circle, 17° of bank, a 26 m radius at 8.7 m/s. A coordinated turn banks to tan φ = V ω / g, and those figures give 15.5° against the measured 17°. This model's held turns bank to that law within 20%, slipping less than 5° (a unit test). The rigid canopy falls short: at 43 cm on the Geo 7 L it banks 9° where its turn needs 12°, slipping 2°. Drooping, it banks 21° where 22° is needed. The Geo 7 L at 95 kg flies such a circle, 18.7°/s at 15° of bank, on 33 cm of one brake alone. Pilots thermal with less, using weight shift and the outer brake as well.

## What it says about the default wing

These figures are for the default design: NACA 4415, 22.3 m² flat, 85.4 kg all up, 1000 m.

- **Hands-up trim.** 35.8 km/h, sink 1.15 m/s, glide 8.61, with the canopy at 5.3° to the flow. The balance, whose hang point was chosen for 5° on the tool's polar, finds 35.2 km/h and glide 8.10. Moving the karabiners 0.1 m forward takes the trim to 4.0°, and 0.1 m aft to 6.6°. The flight's glide is a smooth canopy's: its drag is mfoil's for the sealed section, 0.0069 at this lift where the polar counts 0.0107, and on the polar's figure it would glide at about 8.2. (1.13 put this trim at 32.9 km/h, glide 6.97 and 7.4°. That was its force direction, not the hang point: `stability.md`, section 7.)
- **The default turn.** The right brake to 35 cm in a second, held 12 s: the wing banks into it and has turned 371° by the time the brake is up. Held, it turns at 24 to 37°/s (31°/s on average) and banks 20° to 38° (29°), slipping 1° to 3°. It sinks at up to 3.4 m/s and pulls 1.34 g. Let go, it rolls level, swings 13° past and ends 352° round. With a rigid canopy the same input turns it 142°, at up to 17°/s, banked at most 12°.
- **The bar.** With its rows holding the canopy up at low angles, 120 of the bar's 150 mm keep the trim above the collapse floor. At 120 mm it flies 47.4 km/h, glide 7.04, with the canopy at 0.05°; at 150 mm the trim's lift would be 0.34. On its section alone only 90 mm do, at 46.9 km/h, glide 7.13 and 0.2°, and at 120 mm there is no trim. The tool's polar runs the full bar to 45.8 km/h. Either way the trim's angle falls faster than the bar turns the canopy, 5.1° over 90 mm against the bar's 2.8°: the NACA 4415's centre of pressure moves aft as its lift falls, and the swept, washed-in tips carry more of the lift at low angles.
- **Braking on the bar.** Both brakes pulled to 65 cm from the bar over 3 s take the canopy's angle down to −4.9° at 32 cm before the wing slows; on its section alone, from 90 mm, to −5.8° at 34 cm. This is the reason manuals say not to brake while accelerated: the brake's nose-down moment lowers the leading edge toward a collapse. With two bodies, on the section alone, it is a collapse: above, "On the bar".
- **The steady polar through the brakes.** Holding both brakes and trimming at each travel gives the polar a pilot flies. Both sides droop alike, which turns a little of the lift outward:
  - The glide is unchanged to 10 cm, then slows.
  - The lowest sink is 1.06 m/s at 28.4 km/h, with 25 cm of brake.
  - At 66 cm it flies 22.5 km/h, sinking 1.76 m/s, at CL 1.19.
  - At 67 cm there is no steady glide: this is the steady stall.

  For comparison, Parapente Mag measured a Niviuk Hook 3 (size 25, a wing for advanced beginners) at 24 km/h minimum, 1.05 m/s minimum sink and glide 9.3, as Heatwole's thesis gives the test. With a rigid canopy the lowest sink was 1.04 m/s and the steady stall 69 cm.
- **EN 926-2 symmetric control travel.** Both brakes lowered at 13 cm a second, 65 cm in 5 s, as the standard has it:
  - The first strip stalls at 73 cm and the wing departs at 74 cm, just past the steady stall.
  - The travel follows the free travel: 63 cm at 100/40 mm, 81 at 250/120 mm, 86 at 300/180 mm.
  - For a wing flown at 80 to 100 kg, both the steady and the dynamic figure fall in class A, which asks for more than 60 cm.
  - With a rigid canopy the pull departed at 88 cm, the phugoid (damped at only 0.07, `stability.md`) carrying it 18 cm past its steady stall. 1.13 said 52 cm and class C: that was its force direction.
- **EN 926-2 trim-speed spin tendency.** One control to 25% of the travel over 2 s, held 20 s, then to 62.5%. It does not spin, which is what the test grades: class A.
  - At 25% it turns at 3 to 4°/s.
  - At 62.5% it banks into the turn and keeps tightening. Its first circle takes 8.3 s, at 20 to 86°/s and up to 69° of bank, slipping 2° to 7°, with one strip past its stall at most.
  - Held after that circle, it is in a spiral dive, 14 m/s of sink, a second later, and a quarter of a second after that it departs: on the spiral's inner circle the canopy meets the air 30° from the side, where the pilot's sideslip is 9°. Read at the pilot, until 1.19, the spiral flew on three seconds. Two bodies spiral and depart within a quarter of a second of one. The test pilot lets go after the turn. PGSim's two-body Geo 7 L spirals the same way at 115 kg and 43 cm, loaded about as heavily: 4.0 kg a square metre of flat area, this wing 3.8.
  - With a rigid canopy it turned at 8 to 17°/s at 62.5%, banked up to 12°, and skidded.
- **The eighteen at 65 cm.**
  - One brake from hands up departs at 60 cm on the 3 s pull, and at the full 65 cm on the faster pulls. Both brakes from hands up depart at the full 65 cm.
  - On the bar one brake departs 4.0 to 5.4 s in, a quarter of the span deep in its stall.
  - On the bar both brakes fly through, at up to 1.91 g. The canopy meets the air at down to −8.6°, where PGSim folds a leading edge (−6.5°) and a rigid canopy cannot. On its section alone, from 90 mm, both brakes in a second or less depart. Until 1.19, the air read at the pilot, all eighteen did.

  EN 926-2 lets even a class A wing stall or spin from a one-sided input of more than half the travel applied within a second, and a 65 cm pull is the whole travel of a class A wing.
- **The eighteen at the default 35 cm.** From hands up none departs. On the bar the six one-brake flights wind into a spiral dive 9.6 to 12.2 s after the start, at up to 3.9 g, and depart within a second, the canopy's own sideslip past 30°. With two bodies they spiral 11 to 14 s in. On its section alone, from 90 mm, they depart sooner, 4.8 to 6.8 s in: with the canopy at −2° to −3° the wing rolls and dives into the turn, slipping outward, until a quarter of its span is deep in the stall. It is the case manuals warn of, braking on the bar. With a rigid canopy none departs.

The left brake is the right brake in a mirror to 1e-8. Both brakes together stay symmetric to 1e-9. Left alone, the trim holds: its speed changes by less than 1e-4 m/s in 4 s. All three are unit tests. The glider's stability derivatives and modes, and the hang point mapped against them, are in `stability.md`. They are taken hands up, where the droop does nothing.

## What it is not

- **A canopy that deforms.** Apart from the droop under the brake, nothing folds, spins as a real canopy does, or recovers as one would. Past a departure the model shows the departure, says so on the video, and stops. The droop is PGSim's description of the pulled side, scaled to this tool's brake. It is not a structural model of the canopy.
- **Two bodies at most.** With two the pilot swings and twists under the canopy, but each side's lines are four straight bundles with neither mass nor shape, and the risers do not twist. Gorman and Slegers (2011) compare models that let the payload move for parafoils. PGSim's two bodies turn the Geo 7 L a third faster than its one at 43 cm and 95 kg, and spiral at 115 kg; this tool's add a tenth at most, and why is not found (above).
- **Lines that pull as the rows carry the load.** The two bodies' bundles share a side's stiffness by the rows' load shares at trim, and the start hangs them to hold the canopy's own force. Which rows a real wing loads on the bar was not found measured: PGSim keeps its A's near a third throughout, this tool's fall to 15% (above).
- **Quasi-steady.** The circulation follows a brake at once. A real wing's lags by about 0.3 s at trim speed (Wagner, with Jones's correction for this aspect ratio). On the 0.5 s pull, the response comes that much early.
- **A brake through its cascade.** Each anchor is pulled straight from the pulley. PGSim reads each trailing edge's travel through the cascade's own angles, and at 25 cm this tool's wing turns a quarter to a third less than PGSim's.
- **One Reynolds number.** The section table is at the trim's, about 1.4 million. Slowing to 25 km/h lowers it to about 1.0 million, which moves a section's maximum lift by a few hundredths.
- **The deflection is an assumption.** The bend's start (65% of the chord), the arc's shape and the cap at 90° are reasoned, not measured. The free travel is the design's own, and the symmetric stall travel follows it.
- **A smooth canopy.** The sections' drag is the sealed section's. The cell openings and the cloth add drag that the balance's polar counts and the flight does not (above).

## In the tab

**Fly** prepares the section table and the trims (0.2 s with a shipped section, about two minutes otherwise) and flies the scenario and its two twins, under the other canopy and with the pilot hung the other way, in about four seconds. A flight already flown, as a scenario or as a twin, is not flown again: changing the canopy or how the pilot hangs flies one new flight. **All 18** flies every start, brake and rate at the travel, hold, release, canopy and bodies set, without twins; one of them shown later gets its twins then. Changing the canopy at low angles finds the trims again, from the section table already solved. The left view plays the flight. The camera can be behind, beside, in front or on the ground. Behind, it follows the heading 0.8 s late, as a camera flown behind would, so a turn shows as the wing turning across the view. A camera locked to the heading turned with the glider, and only the ground went round.

The view shows the brake at work:

- The pilot's hands come down on the handles as far as each brake is pulled.
- The brake lines run from the pulleys to each anchor's trailing edge where the brake has drawn it, orange once taut.
- Each strip's bent part is drawn on the section's own arc and tinted orange as far as it is bent.
- The track is drawn from above in a corner, north up, with the glider on it pointing along its heading.
- With two bodies the pilot is drawn on his own body as he hangs, his risers running from his karabiners up to the canopy. The words say how far he has swung under it, sideways and fore and aft, what the lines pull, and which rows are slack.

Words across the top give the speed, the sink, both brakes in centimetres, the bank, the turn and how far the wing has turned. The canopy is coloured by each strip's state:

| Colour | Strip state |
|---|---|
| Cyan | flying |
| Yellow | past its stall |
| Red | deep in the stall |
| Magenta | lift near nothing, where a real canopy would start to fold |

The handles' travel also shows as bars at either side. A spiral dive and a departure each get a banner. The right view charts bank, pitch, turn, speed, sink and both handles over time, with the departure shaded and the twins' bank and turn dotted (the other canopy) and dashed (the pilot hung the other way). After All 18 it tables what each scenario did.

**Stability** tables the stability derivatives and the modes at both trims, hands up and on the bar, in about half a second. **Hang point** maps the glide and the stability over 35 hang points in about a second. **Planform** builds twenty variants of the design, at other aspect ratios and arcs, and maps them the same way in about two seconds (`stability.md`). **Range** flies the design as built under each of the tool's alternative assumptions, twelve cases in about a second, and shows the range (`ranges.md`). The chart's menu switches between the views that have been run. **Stability .tsv**, **Map .tsv**, **Planform .tsv** and **Range .tsv** save them.

**Record video** plays the flight in real time into a 1280 × 720 video: WebM (VP9 where the browser has it), or MP4 where the browser records only that, as Safari does. **.tsv** saves every frame: position, attitude, rates, speed, sink, load, lift, handles, the strip counts past their stall and on mfoil's solved table, and the canopy's own speed and sideslip. With two bodies it adds the pilot's swing and twist, the lines' pull, and how many bundles and which rows are slack. **All .tsv** saves the eighteen.

## References

- Ákos, Z., Nagy, M., and Vicsek, T. (2008). Comparing bird and human soaring strategies. *PNAS* 105(11), 4139–4143 (arXiv:0902.0312): paragliders' thermalling circles from 1-second GPS tracks, Table 1.
- Barrows, T. M. (2002). Apparent mass of parafoils with spanwise camber. *Journal of Aircraft* 39(3).
- Heatwole, P. F. (2022). *Parametric Paraglider Modeling.* MSc thesis; glidersim (MIT licence, © 2021 Peter Heatwole): Barrows' formulas as code, model 6a's equations of motion, and the XFLR5 braking polars whose stall trend is used here. Its conclusion notes that a canopy of constant shape leaves out how a real wing distorts.
- Lissaman, P. B. S., and Brown, G. J. (1993). Apparent mass effects on parafoil dynamics. AIAA 93-1236.
- Viterna, L. A., and Corrigan, R. D. (1982). Fixed pitch rotor performance of large horizontal axis wind turbines. NASA CP-2230.
- EN 926-2:2013 / LTF 2009, 4.1.4 (symmetric control travel), 4.1.15 (asymmetric control), 4.1.16 (trim-speed spin tendency), 4.1.18 (recovery from a developed spin); DHV's English text of LTF 2009.
- Gorman, C. M., and Slegers, N. J. (2011). Comparison and analysis of multi-body parafoil models with varying degrees of freedom. 21st AIAA Aerodynamic Decelerator Systems Technology Conference.
- Slegers, N., and Costello, M. (2003). Aspects of control for a parafoil and payload system. *Journal of Guidance, Control, and Dynamics* 26(6): roll steering and skid steering, and which the canopy's curvature gives.
- PGSim, the paraglider simulator built in this project: the two bodies on tension-only line bundles, the brake droop and the low-angle relief used here, and the brake through the cascade. Its Geo 7 L turns, flown headless: `data/reference/pgsim-turns.tsv`.
- Parapente Mag's test of the Niviuk Hook 3, size 25: minimum 24 km/h, trim 38, top 52; minimum sink 1.05 m/s; glide 9.3 at 37.5 km/h, as Heatwole (2022) plots it (source/figures/paraglider/demonstration/plot_polars.py).
- Ohio State University wind tunnel, NACA 4415 (NREL/TP-442-6472): `data/reference/naca4415-osu.tsv`.
