# Flight — the glider through its brakes

The Flight tab flies the design through brake inputs. The inputs are:

- **Brake:** the left brake, the right brake, or both.
- **Travel:** pulled to a travel (65 cm by default).
- **Rate:** over 3 s, 1 s or 0.5 s.
- **Start:** from hands-up trim or on the speed bar.

The brake is held, then released or kept. All eighteen combinations fly in about seven seconds. Each flight plays back in three dimensions and can be recorded to video (WebM, or MP4 where a browser records only that) or saved frame by frame. The models are `src/core/flight.js` and `src/core/brakesection.js`.

It is a rigid-body model. It tells you what a canopy that keeps its shape would do. A real canopy deforms, folds and spins in ways a rigid one cannot. The model therefore says when a flight has left what it can stand behind, and ends that flight two seconds later.

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

- **Aerodynamics.** The slices' lattice (`vlm.js`, as in `slices.md`). The alpha method turns each strip's boundary condition until the strip's lift is its section's at the angle the whole wing leaves it. The lattice is factorised once, with its wake fixed along the trim's flow in the body. Each strip meets its own velocity: the glider's, plus its rotation. Roll, pitch and yaw damping, and the arc's dihedral effect, therefore come out of the lattice rather than from derivatives typed in. A strip more than 10° past its stall, or below −15°, has nothing the small-angle lattice can say about it. It meets its own air, and the lattice is only told its lift.
- **The brake.** The handle's travel first takes up each anchor's free travel (`tipFirstSlack`: 180 mm at the centre and 60 mm at the tip by default, both set in the tab). It then pulls that anchor's trailing edge toward the pulley. The drop square to the chord is the pull times the cosine between the line and the section's normal: 0.975 to 0.992 on the default wing, whose brake lines meet the canopy nearly square. Between anchors the drop runs straight from one to the next. Inboard of the first anchor it runs across the centre to the other side's first, and outboard of the last it falls to nothing at the tip. The drop over the chord gives the bend.
- **The mass.** The canopy's cloth is spread over the strips by area. The air inside the canopy (5.8 kg on the default wing) counts in the mass and inertia, but not in the weight, which the air outside carries. The lines sit at half their height and the pilot at the karabiners, where the balance (`equilibrium.js`) puts the pilot's weight and drag.
- **Apparent mass.** The canopy's apparent masses and inertias follow Barrows (2002) for an arched wing, assembled about the riser midpoint as Heatwole's glidersim does (2022, MIT licence). The steady Munk moment is taken out, because the sections' own moment already holds it. On the default wing the arch's radius is 5.93 m and its semi-angle 49.5°. The apparent masses are 0.9 kg along the chord, 6.9 kg across it and 29.1 kg square to it.
- **Drag of pilot and lines.** As in the balance: coefficients on the wing's area, the lines' drag acting a third of the way down (handbook 4.2).
- **Integration.** Fourth-order Runge–Kutta at 0.01 s, recorded 30 times a second.
- **The speed bar.** The bar turns the canopy nose down about the C row by the angle the risers give (`alphaChange`, `risers.js`). The bar is pushed out a row at a time, each trim found from the last. It stops at the first row whose trim would leave the wing's lift below the riser model's collapse floor (CL 0.35).
- **Departure.** A flight has departed when a quarter of the span is deep in its stall, when the air meets the canopy at more than 30° or below −10°, or when the sideslip passes 30°. It then ends two seconds later, unless the tab is told to fly on. The extremes reported are only those up to the departure.

## What it says about the default wing

These figures are for the default design: NACA 4415, 22.3 m² flat, 85.4 kg all up, 1000 m.

- **Hands-up trim.** 32.9 km/h, sink 1.30 m/s, glide 6.97, with the canopy at 7.4° to the flow. The balance assumed 5° and found 35.2 km/h and glide 8.10. The balance's hang point was chosen for 5° on the tool's polar, and the polar's lift is 10% above the lattice's (`slices.md`). With mfoil's moment and the lattice's lift, that hang point trims at 7.4°. Moving the karabiners 0.1 m forward moves the trim to 5.9°.
- **The bar.** Only 90 of the bar's 150 mm keep the trim above the collapse floor. At 90 mm it flies 42.6 km/h with the canopy at 1.7°. At 120 mm the trim's lift would be 0.32. The tool's polar runs the full bar to 45.8 km/h. The difference is the same moment: the NACA 4415's centre of pressure moves aft as its lift falls, and the swept, washed-in tips carry more of the lift at low angles, so the trim angle falls faster than the bar turns the canopy.
- **Braking on the bar.** Both brakes pulled from the bar take the canopy's angle down, to −2.6° at 35 cm, before the wing slows. This is the reason manuals say not to brake while accelerated: the brake's nose-down moment lowers the leading edge toward a collapse.
- **EN 926-2 symmetric control travel.** Both brakes lowered over 5 s: the first strip stalls at 50 cm and the wing departs at 52 cm. For a wing flown at 80 to 100 kg that is class C (45 to 60 cm); class A asks for more than 60. The travel follows the free travel almost cm for cm: 59 cm at 250/120 mm, 64 cm at 300/180 mm.
- **EN 926-2 trim-speed spin tendency.** One control to 25% of the travel over 2 s, held 20 s, then to 62.5%: it does not depart. That is class A. At 25% it turns at 4°/s. At 62.5% it turns at 10 to 17°/s and banks 3 to 10°, skidding at a sideslip of about −10°.
- **The eighteen at 65 cm all depart.** One brake from hands up departs at 45 cm on the 3 s pull, at 58 cm on 1 s, and at the end of the 0.5 s pull. Both brakes from hands up depart at 53 cm on the 3 s pull and at 65 cm on the faster pulls. On the bar the one-brake figures are 49, 64 and 65 cm, and the both-brake figures 64, 65 and 65 cm. The worst load before departure is 1.75 g, both brakes in 0.5 s on the bar. EN 926-2 lets even a class A wing stall or spin from a one-sided input of more than half the travel applied within a second. A 65 cm pull is the whole travel of a class A wing.

The left brake is the right brake in a mirror to 1e-8. Both brakes together stay symmetric to 1e-9. Left alone, the trim holds: its speed changes by less than 1e-4 m/s in 4 s. All three are unit tests.

## What it is not

- **A rigid canopy.** Nothing folds, spins as a real canopy does, or recovers as one would. Past a departure the model shows the departure, says so on the video, and stops.
- **Six degrees of freedom, not nine.** The pilot cannot swing or twist under the canopy. Gorman and Slegers (2011) compare models that let the payload move for parafoils. The pilot's roll under a paraglider is part of how it banks.
- **Quasi-steady.** The circulation follows a brake at once. A real wing's lags by about 0.3 s at trim speed (Wagner, with Jones's correction for this aspect ratio). On the 0.5 s pull, the response comes that much early.
- **The turn may be weak.** Before departure, a one-sided input makes this model yaw and skid more than it banks. On an arched rigid wing, the yaw rate's extra lift on the outer side points outward, and cancels the roll into the turn a flat wing gets (−95 Nm per rad/s). Roll then comes mostly from the sideslip, at 14 Nm a degree. No measured paraglider turn rate against brake travel was found to check it, so read the turn rates as this model's, not a wing's.
- **One Reynolds number.** The section table is at the trim's, about 1.4 million. Slowing to 25 km/h lowers it to about 1.0 million, which moves a section's maximum lift by a few hundredths.
- **The deflection is an assumption.** The bend's start (65% of the chord), the arc's shape and the cap at 90° are reasoned, not measured. The free travel is the design's own, and the symmetric stall travel follows it.

## In the tab

**Fly** prepares the section table and the trims (0.2 s with a shipped section, about two minutes otherwise) and flies the scenario. **All 18** flies every start, brake and rate at the travel, hold and release set. The left view plays the flight. The camera can be behind, beside, in front or on the ground. The canopy is coloured by each strip's state:

| Colour | Strip state |
|---|---|
| Cyan | flying |
| Yellow | past its stall |
| Red | deep in the stall |
| Magenta | lift near nothing, where a real canopy would start to fold |

The handles' travel shows at either side. The right view charts bank, pitch, turn, speed, sink and both handles over time, with the departure shaded. After All 18 it tables what each scenario did.

**Record video** plays the flight in real time into a 1280 × 720 video: WebM (VP9 where the browser has it), or MP4 where the browser records only that, as Safari does. **.tsv** saves every frame: position, attitude, rates, speed, sink, load, lift, handles, and the strip counts past their stall and on mfoil's solved table. **All .tsv** saves the eighteen.

## References

- Barrows, T. M. (2002). Apparent mass of parafoils with spanwise camber. *Journal of Aircraft* 39(3).
- Heatwole, P. F. (2022). *Parametric Paraglider Modeling.* MSc thesis; glidersim (MIT licence, © 2021 Peter Heatwole): Barrows' formulas as code, model 6a's equations of motion, and the XFLR5 braking polars whose stall trend is used here.
- Lissaman, P. B. S., and Brown, G. J. (1993). Apparent mass effects on parafoil dynamics. AIAA 93-1236.
- Viterna, L. A., and Corrigan, R. D. (1982). Fixed pitch rotor performance of large horizontal axis wind turbines. NASA CP-2230.
- EN 926-2:2013 / LTF 2009, 4.1.4 (symmetric control travel), 4.1.15 (asymmetric control), 4.1.16 (trim-speed spin tendency), 4.1.18 (recovery from a developed spin); DHV's English text of LTF 2009.
- Gorman, C. M., and Slegers, N. J. (2011). Comparison and analysis of multi-body parafoil models with varying degrees of freedom. 21st AIAA Aerodynamic Decelerator Systems Technology Conference.
- Ohio State University wind tunnel, NACA 4415 (NREL/TP-442-6472): `data/reference/naca4415-osu.tsv`.
