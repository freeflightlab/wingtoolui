# Flight — the glider through its brakes

The Flight tab flies the design through brake inputs. The inputs are:

- **Brake:** the left brake, the right brake, or both.
- **Travel:** pulled to a travel (35 cm by default).
- **Rate:** over 3 s, 1 s or 0.5 s.
- **Start:** from hands-up trim or on the speed bar.
- **Canopy under the brake:** drooping, as PGSim has it, or rigid (below, "The turn").

The brake is held (12 s by default), then released or kept. The flight first shown is a turn: the right brake to 35 cm in a second, held for about a circle, then let go. All eighteen combinations of start, brake and rate fly in about 20 seconds at the default hold. Each flight plays back in three dimensions and can be recorded to video (WebM, or MP4 where a browser records only that) or saved frame by frame. The models are `src/core/flight.js` and `src/core/brakesection.js`.

It is a rigid-body model: one body, and a canopy that keeps its shape except where the brake pulls it down. A real canopy deforms, folds and spins in ways a rigid one cannot. The model therefore says when a flight has left what it can stand behind, and ends that flight two seconds later.

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
- **The mass.** The canopy's cloth is spread over the strips by area. The air inside the canopy (5.8 kg on the default wing) counts in the mass and inertia, but not in the weight, which the air outside carries. The lines sit at half their height and the pilot at the karabiners, where the balance (`equilibrium.js`) puts the pilot's weight and drag.
- **Apparent mass.** The canopy's apparent masses and inertias follow Barrows (2002) for an arched wing, assembled about the riser midpoint as Heatwole's glidersim does (2022, MIT licence). The steady Munk moment is taken out, because the sections' own moment already holds it. On the default wing the arch's radius is 5.93 m and its semi-angle 49.5°. The apparent masses are 0.9 kg along the chord, 6.9 kg across it and 29.1 kg square to it.
- **Drag of pilot and lines.** As in the balance: coefficients on the wing's area, the lines' drag acting a third of the way down (handbook 4.2).
- **Integration.** Fourth-order Runge–Kutta at 0.01 s, a frame kept every third step: 33⅓ frames a second. Until 1.18 the flight said 30, the rate asked, so the view found each moment's frame a tenth early and never showed a flight's last tenth.
- **The speed bar.** The bar turns the canopy nose down about the C row by the angle the risers give (`alphaChange`, `risers.js`). The bar is pushed out a row at a time, each trim found from the last. It stops at the first row whose trim would leave the wing's lift below the riser model's collapse floor (CL 0.35).
- **Departure.** A flight has departed when a quarter of the span is deep in its stall, when the air meets the canopy at more than 30° or below −10°, or when the sideslip passes 30°. It then ends two seconds later, unless the tab is told to fly on. The extremes reported are only those up to the departure.
- **A spiral dive** is marked from the moment the sink passes 14 m/s (`spiralSinkMS`), the sink EN 926-2 flies its spiral-dive test to. A spiral is still flying, so the flight goes on.

## The turn

**Why a rigid canopy hardly banks.** A paraglider's arch is steep: the outer cells stand at 40° to 60°. Pull the right brake and the right side's sections carry more lift and more drag. The drag yaws the wing right. The extra lift is square to those canted cells, so it points outward and up, nearly through the riser midpoint. It pushes the wing sideways more than it rolls it. Slegers and Costello (2003) found this in a parafoil model: a flat canopy rolls away from the pulled brake, a curved one skids toward it, and the more curved, the more it skids. A paraglider is the curved kind. So a rigid paraglider canopy skids round a turn nearly flat, slipping outward.

**What PGSim adds.** PGSim, the simulator built alongside this tool, takes the pulled side's deformation into account. The brake lines draw the trailing edge down and in toward the hand, and the braked sections roll outboard, tilting their force with them. The tilt acts at the end of a lever as long as the lines, and it is what banks the wing into the turn. PGSim tilts by 0.5 radians for each unit of trailing-edge drop over chord, at most 8°. Flown headless on its own Geo 7 L, with nothing else changed, PGSim without the droop turns as this tool did. Its own figures are in `data/reference/pgsim-turns.tsv`.

**Why 0.3 here.** This tool's brake pulls each anchor straight from the pulley once its free travel is taken up. PGSim reads each trailing edge's travel through the cascade's own angles, from 0.08 m of free travel. For the same hand travel, this tool's trailing edge drops further: at 43 cm on the Geo 7 L by about a third, 0.104 of the chord against 0.079, averaged over the pulled half by area. With PGSim's 0.5 on those drops, the Geo 7 L at 95 kg winds into a spiral at 43 cm, where PGSim's rigid body turns steadily at 23°/s. A droop of 0.3 flies PGSim's rigid-body turn there, and both canopies can be chosen in the tab. Each flight also flies its twin under the other canopy: the chart draws the twin's bank and turn dotted, and the note gives what it did.

**Against PGSim.** Both models fly the Geo 7 L the same way: from trim, the right brake from nothing at 1 s to the travel at 2 s, held. Each figure is the mean turn rate and bank from 8 to 16 s. This tool's Geo 7 L is built from its specification; PGSim's is its own OBJ.

| Weight, travel | PGSim, rigid canopy | This tool, rigid canopy | PGSim, droop, rigid body | PGSim, droop, two bodies | This tool, droop 0.3 |
|---|---|---|---|---|---|
| 95 kg, 25 cm | 11.6°/s, 7° | 8.9°/s, 6° | 17.6°/s, 14° | 17.5°/s, 14° | 12.2°/s, 10° |
| 95 kg, 43 cm | 14.7°/s, 8° | 15.2°/s, 9° | 22.9°/s, 20° | 31.2°/s, 28° | 25.3°/s, 21° |
| 115 kg, 25 cm | 13.0°/s, 9° | 9.9°/s, 8° | 20.1°/s, 18° | 20.3°/s, 19° | 13.6°/s, 12° |
| 115 kg, 43 cm | 16.4°/s, 12° | 17.1°/s, 13° | 26.4°/s, 26° | a spiral | 33.0°/s, 33° |

At 43 cm the two agree: the rigid canopies within 5%, and the drooping one between PGSim's two bodies and its one. At 25 cm this tool turns a quarter to a third less, with or without the droop. Its free travel at the centre is 180 mm against PGSim's 80, and the two models' braked sections are not the same. PGSim's two bodies, the pilot hung on line bundles under the canopy, add a third to the turn at 43 cm and 95 kg, and a spiral at 115 kg. This tool has one body. The interface test flies three of these cases and holds the tool to PGSim's band.

**Against a wing.** No paraglider's measured turn rate against brake travel was found. A turn's shape can still be checked. Ákos, Nagy and Vicsek (2008) measured competition pilots' thermalling circles on 1-second GPS tracks: 20.1 s a circle, 17° of bank, a 26 m radius at 8.7 m/s. A coordinated turn banks to tan φ = V ω / g, and those figures give 15.5° against the measured 17°. This model's held turns bank to that law within 20%, slipping less than 5° (a unit test). The rigid canopy falls short: at 43 cm on the Geo 7 L it banks 9° where its turn needs 12°, slipping 2°. Drooping, it banks 21° where 22° is needed. The Geo 7 L at 95 kg flies such a circle, 18.7°/s at 15° of bank, on 33 cm of one brake alone. Pilots thermal with less, using weight shift and the outer brake as well.

## What it says about the default wing

These figures are for the default design: NACA 4415, 22.3 m² flat, 85.4 kg all up, 1000 m.

- **Hands-up trim.** 35.8 km/h, sink 1.15 m/s, glide 8.61, with the canopy at 5.3° to the flow. The balance, whose hang point was chosen for 5° on the tool's polar, finds 35.2 km/h and glide 8.10. Moving the karabiners 0.1 m forward takes the trim to 4.0°, and 0.1 m aft to 6.6°. The flight's glide is a smooth canopy's: its drag is mfoil's for the sealed section, 0.0069 at this lift where the polar counts 0.0107, and on the polar's figure it would glide at about 8.2. (1.13 put this trim at 32.9 km/h, glide 6.97 and 7.4°. That was its force direction, not the hang point: `stability.md`, section 7.)
- **The default turn.** The right brake to 35 cm in a second, held 12 s: the wing banks into it and has turned 371° by the time the brake is up. Held, it turns at 24 to 37°/s (31°/s on average) and banks 20° to 38° (29°), slipping 1° to 3°. It sinks at up to 3.4 m/s and pulls 1.34 g. Let go, it rolls level, swings 13° past and ends 352° round. With a rigid canopy the same input turns it 142°, at up to 17°/s, banked at most 12°.
- **The bar.** Only 90 of the bar's 150 mm keep the trim above the collapse floor. At 90 mm it flies 46.9 km/h, glide 7.13, with the canopy at 0.2°. At 120 mm there is no trim. The tool's polar runs the full bar to 45.8 km/h. The trim's angle falls faster than the bar turns the canopy: 5.1° over 90 mm, against the bar's 2.8°. That is because the NACA 4415's centre of pressure moves aft as its lift falls, and the swept, washed-in tips carry more of the lift at low angles.
- **Braking on the bar.** Both brakes pulled from the bar over 3 s take the canopy's angle down, to −5.3° at 32 cm, before the wing slows. This is the reason manuals say not to brake while accelerated: the brake's nose-down moment lowers the leading edge toward a collapse.
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
  - Held after that circle, it is in a spiral dive, 14 m/s of sink, a second later, and three seconds after that the rigid model departs from it. The test pilot lets go after the turn. PGSim's two-body Geo 7 L spirals the same way at 115 kg and 43 cm, loaded about as heavily: 4.0 kg a square metre of flat area, this wing 3.8.
  - With a rigid canopy it turned at 8 to 17°/s at 62.5%, banked up to 12°, and skidded.
- **The eighteen at 65 cm all depart.**
  - One brake from hands up departs at 60 cm on the 3 s pull, and at the full 65 cm on the faster pulls.
  - Both brakes from hands up, and every input on the bar, depart once at the full 65 cm.
  - The worst load before departure is 1.89 g, both brakes in 0.5 s on the bar.

  EN 926-2 lets even a class A wing stall or spin from a one-sided input of more than half the travel applied within a second, and a 65 cm pull is the whole travel of a class A wing.
- **The eighteen at the default 35 cm.** From hands up none departs. On the bar the six one-brake flights do, 4.8 to 6.8 s after the start: with the canopy at −2° to −3°, the wing rolls and dives into a turn, slipping outward, until a quarter of its span is deep in the stall. It is the case manuals warn of, braking on the bar. With a rigid canopy none departed.

The left brake is the right brake in a mirror to 1e-8. Both brakes together stay symmetric to 1e-9. Left alone, the trim holds: its speed changes by less than 1e-4 m/s in 4 s. All three are unit tests. The glider's stability derivatives and modes, and the hang point mapped against them, are in `stability.md`. They are taken hands up, where the droop does nothing.

## What it is not

- **A canopy that deforms.** Apart from the droop under the brake, nothing folds, spins as a real canopy does, or recovers as one would. Past a departure the model shows the departure, says so on the video, and stops. The droop is PGSim's description of the pulled side, scaled to this tool's brake. It is not a structural model of the canopy.
- **Six degrees of freedom, not nine.** The pilot cannot swing or twist under the canopy. Gorman and Slegers (2011) compare models that let the payload move for parafoils. PGSim's two bodies turn the Geo 7 L a third faster than its one at 43 cm and 95 kg, and spiral at 115 kg (above).
- **Quasi-steady.** The circulation follows a brake at once. A real wing's lags by about 0.3 s at trim speed (Wagner, with Jones's correction for this aspect ratio). On the 0.5 s pull, the response comes that much early.
- **A brake through its cascade.** Each anchor is pulled straight from the pulley. PGSim reads each trailing edge's travel through the cascade's own angles, and at 25 cm this tool's wing turns a quarter to a third less than PGSim's.
- **One Reynolds number.** The section table is at the trim's, about 1.4 million. Slowing to 25 km/h lowers it to about 1.0 million, which moves a section's maximum lift by a few hundredths.
- **The deflection is an assumption.** The bend's start (65% of the chord), the arc's shape and the cap at 90° are reasoned, not measured. The free travel is the design's own, and the symmetric stall travel follows it.
- **A smooth canopy.** The sections' drag is the sealed section's. The cell openings and the cloth add drag that the balance's polar counts and the flight does not (above).

## In the tab

**Fly** prepares the section table and the trims (0.2 s with a shipped section, about two minutes otherwise) and flies the scenario and its twin under the other canopy, in about three seconds. **All 18** flies every start, brake and rate at the travel, hold, release and canopy set, without twins; one of them shown later gets its twin then. The left view plays the flight. The camera can be behind, beside, in front or on the ground. Behind, it follows the heading 0.8 s late, as a camera flown behind would, so a turn shows as the wing turning across the view. A camera locked to the heading turned with the glider, and only the ground went round.

The view shows the brake at work:

- The pilot's hands come down on the handles as far as each brake is pulled.
- The brake lines run from the pulleys to each anchor's trailing edge where the brake has drawn it, orange once taut.
- Each strip's bent part is drawn on the section's own arc and tinted orange as far as it is bent.
- The track is drawn from above in a corner, north up, with the glider on it pointing along its heading.

Words across the top give the speed, the sink, both brakes in centimetres, the bank, the turn and how far the wing has turned. The canopy is coloured by each strip's state:

| Colour | Strip state |
|---|---|
| Cyan | flying |
| Yellow | past its stall |
| Red | deep in the stall |
| Magenta | lift near nothing, where a real canopy would start to fold |

The handles' travel also shows as bars at either side. A spiral dive and a departure each get a banner. The right view charts bank, pitch, turn, speed, sink and both handles over time, with the departure shaded and the twin's bank and turn dotted. After All 18 it tables what each scenario did.

**Stability** tables the stability derivatives and the modes at both trims, hands up and on the bar, in about half a second. **Hang point** maps the glide and the stability over 35 hang points in about a second. **Planform** builds twenty variants of the design, at other aspect ratios and arcs, and maps them the same way in about two seconds (`stability.md`). **Range** flies the design as built under each of the tool's alternative assumptions, twelve cases in about a second, and shows the range (`ranges.md`). The chart's menu switches between the views that have been run. **Stability .tsv**, **Map .tsv**, **Planform .tsv** and **Range .tsv** save them.

**Record video** plays the flight in real time into a 1280 × 720 video: WebM (VP9 where the browser has it), or MP4 where the browser records only that, as Safari does. **.tsv** saves every frame: position, attitude, rates, speed, sink, load, lift, handles, and the strip counts past their stall and on mfoil's solved table. **All .tsv** saves the eighteen.

## References

- Ákos, Z., Nagy, M., and Vicsek, T. (2008). Comparing bird and human soaring strategies. *PNAS* 105(11), 4139–4143 (arXiv:0902.0312): paragliders' thermalling circles from 1-second GPS tracks, Table 1.
- Barrows, T. M. (2002). Apparent mass of parafoils with spanwise camber. *Journal of Aircraft* 39(3).
- Heatwole, P. F. (2022). *Parametric Paraglider Modeling.* MSc thesis; glidersim (MIT licence, © 2021 Peter Heatwole): Barrows' formulas as code, model 6a's equations of motion, and the XFLR5 braking polars whose stall trend is used here. Its conclusion notes that a canopy of constant shape leaves out how a real wing distorts.
- Lissaman, P. B. S., and Brown, G. J. (1993). Apparent mass effects on parafoil dynamics. AIAA 93-1236.
- Viterna, L. A., and Corrigan, R. D. (1982). Fixed pitch rotor performance of large horizontal axis wind turbines. NASA CP-2230.
- EN 926-2:2013 / LTF 2009, 4.1.4 (symmetric control travel), 4.1.15 (asymmetric control), 4.1.16 (trim-speed spin tendency), 4.1.18 (recovery from a developed spin); DHV's English text of LTF 2009.
- Gorman, C. M., and Slegers, N. J. (2011). Comparison and analysis of multi-body parafoil models with varying degrees of freedom. 21st AIAA Aerodynamic Decelerator Systems Technology Conference.
- Slegers, N., and Costello, M. (2003). Aspects of control for a parafoil and payload system. *Journal of Guidance, Control, and Dynamics* 26(6): roll steering and skid steering, and which the canopy's curvature gives.
- PGSim, the paraglider simulator built in this project: two bodies on tension-only line bundles, the brake through the cascade, and the brake droop used here. Its Geo 7 L turns, flown headless: `data/reference/pgsim-turns.tsv`.
- Parapente Mag's test of the Niviuk Hook 3, size 25: minimum 24 km/h, trim 38, top 52; minimum sink 1.05 m/s; glide 9.3 at 37.5 km/h, as Heatwole (2022) plots it (source/figures/paraglider/demonstration/plot_polars.py).
- Ohio State University wind tunnel, NACA 4415 (NREL/TP-442-6472): `data/reference/naca4415-osu.tsv`.
