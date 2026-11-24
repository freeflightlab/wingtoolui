# Changelog

Each release's version is `package.json`'s; the page shows it beside its
name, and the self-audit fails if this file's newest entry is not it.
`ROADMAP.md` has the detail of every round.

## 1.18.0 — 2026-11-24

In the Flight tab a brake was pulled and the wing seemed to fly straight on.
Two things made it so: the flight first shown was a spin entry, and the
rigid canopy hardly banked. PGSim, the simulator built in this project, was
flown headless on its own Geo 7 L to find out why, and its brake droop is now
the flight's.

**Fixed**

- **One brake banks the wing into its turn.** A rigid paraglider canopy
  skids round nearly flat. The braked side's extra lift is square to its
  canted cells, so it points outward and up, through nearly the riser
  midpoint; only the drag yaws the wing. On the Geo 7 L at 95 kg, 43 cm of
  one brake turned it at 15°/s with 9° of bank. PGSim, with its brake droop
  switched off, does the same: 14.7°/s and 8°. The droop is PGSim's
  description of the pulled canopy: the brake lines draw the trailing edge
  down and in toward the hand, and the braked sections roll outboard about
  their chords, their force with them. It is now the flight's
  (`brakeDroop`, `droopMaxDeg`, `flightDroop`): 0.3 radians a unit of
  trailing-edge drop over chord, at most 8°. PGSim takes 0.5 on its own
  cascade's drop, and this tool's brake drops the trailing edge a third
  further for the same travel. With it, the Geo 7 L turns at 25°/s with 21°
  of bank, between PGSim's one body (23°/s) and its two (31°/s). Hands up
  nothing changes: the trims, the stability and the hang point are as they
  were.
- **The flight first shown is a turn.** It was the full 65 cm in a second,
  held 4 s: a spin entry, which stalled the default wing 2 s in. What showed
  was a straight glide and then "departed". It is now the right brake to
  35 cm in a second, held 12 s and let go: the default wing banks to 29° on
  average, turns at 31°/s and has gone round 371° when the brake is up.
- **The flight's frames were shown a tenth early.** They are kept every
  third step of 0.01 s, 33⅓ a second, and the flight said 30, the rate asked.
  The view found each moment's frame a tenth before it, and never showed a
  flight's last tenth.

**Added**

- **The canopy under the brake**, drooping or rigid, set in the tab. Every
  flight shown is also flown under the other: the chart draws the twin's
  bank and turn dotted, and the note gives what it did. On the default turn
  the rigid canopy goes round 142° at up to 17°/s, banked at most 12°. All
  18 flies no twins, which would double its time for flights its table
  never shows: about 20 s at the default hold.
- **The brake seen at work.** The bent part of each strip is drawn on the
  section's own arc and tinted orange as far as it is bent. The pilot's hands
  come down on the handles. The brake lines run from the pulleys to where
  each trailing edge has been drawn, orange once taut. The track is drawn
  from above in a corner, north up, the glider on it pointing along its
  heading, and the words say how far it has turned and where both brakes
  are. Behind, the camera follows the heading 0.8 s late, so a turn shows as
  the wing turning across the view.
- **A spiral dive is marked** from the moment the sink passes 14 m/s, the
  sink EN 926-2 flies its spiral-dive test to (`spiralSinkMS`), with a banner
  in the view.
- `data/reference/pgsim-turns.tsv`: PGSim's turns on its Geo 7 L at 95 and
  115 kg, 25 and 43 cm of one brake, rigid and two bodies, with and without
  its droop. The interface test flies the tool's Geo 7 L through three of
  them and holds it to PGSim's band.
- Unit tests: the droop is its law and only on the pulled side; hands up it
  changes nothing; drooping, the pulled side rolls the wing toward it; one
  brake banks the wing half again as far as a rigid canopy; a held turn
  banks as the coordinated turn's law asks (tan φ = V ω / g) within 20%,
  slipping under 5°, as pilots' thermalling circles do (Ákos et al. 2008);
  the frames are kept at the rate the flight gives.

**Changed, on the default wing**

- Both brakes droop alike, which turns a little of their lift outward. The
  steady polar's lowest sink is 1.06 m/s, where it was 1.04, and its steady
  stall 67 cm, where it was 70.
- The EN 926-2 symmetric pull departs at 74 cm, where it was 88: the rigid
  canopy's phugoid had carried it 18 cm past its steady stall. Still class A
  for 80 to 100 kg.
- The EN 926-2 trim-speed spin test: still no spin. At 62.5% of the travel it
  now banks into a tightening turn, its first circle in 8.3 s, and held past
  that circle it winds into a spiral dive. PGSim's two-body Geo 7 L does the
  same at 115 kg, loaded about as heavily.
- One brake on the bar at the default 35 cm now departs: the canopy at −2° to
  −3°, the wing rolls and dives into a turn, slipping outward, until a
  quarter of its span is deep in the stall. With a rigid canopy it did not.

**Found**

- PGSim's own turn, without its droop, is this tool's rigid canopy's to 5% at
  43 cm. At 25 cm this tool turns a quarter to a third less than PGSim,
  droop or not: its free travel at the centre is 180 mm against PGSim's 80,
  and the braked sections differ.
- PGSim's two bodies, the pilot hung on line bundles, turn the Geo 7 L a
  third faster than its one at 43 cm and 95 kg, and spiral at 115 kg. This
  tool has one body; the two are on the roadmap, and so is the brake through
  its cascade's own angles, as PGSim reads it.
- No paraglider's measured turn rate against brake travel was found. The
  turn rests on two models' agreement and on the shape of real turns.

## 1.17.0 — 2026-11-24

OpenGlider, reviewed a third time for what it does that this tool's own wings
did not, and two of its features adopted: panels parted at the entry and cut
by edge, and mini-ribs. Reading its panel cuts against this tool's found that
this tool's own wings had no intake in their cutting files at all.

**Fixed**

- **A wing of this tool's own was cut with every cell closed at the nose.**
  Its panels were developed as two whole surfaces, leading edge to trailing
  edge, so the upper and lower panels met at the nose and the cloth was on
  the wrong surface. They part at the intake now, as OpenGlider and
  LEparagliding part theirs. The upper panel runs round the nose to where the
  intake opens and the lower from where it closes; the opening between is no
  panel's (`partedEdges`, `developWing(wing, { intake })`). The 3D view draws
  the two lips.
- On the three complete designs' own ribs, this tool's own development now
  comes to within 0.8% of every surface of their cutting files. On the same
  allowances, developed whole, it was 2 to 4% short on the upper and 8 to 9%
  over on the lower. On the default wing the sail is 52.4 m² as cut, where it
  was 53.5, and 58.2 m of roll, where it was 60.1.
- A pressure-derived billow reads the loading at each point's own chord
  fraction. A parted lower panel starts 5.5% of chord back, and would
  otherwise have read the nose's.
- The leading-edge cloth takes the upper panel's run under the nose, to the
  intake: 8.18 m² of the default wing's upper surface, where it was 7.68.

**Added**

- **An allowance by edge**: the seam allowance at the sides, which is the
  ribs' too, and one each at the intake and the trailing edge, 10 mm each by
  default; corners mitred (`cutOutline`, which replaces `addSeamAllowance`).
- **The intake's edges hemmed**, as OpenGlider's `FoldedCut` cuts the entry:
  folded twice, each side's cutting line mirrored about the fold and then
  repeated, so that the hem lies flat on its sides. A plain allowance folded
  over a side leaning 3° stands 2.0 mm off it. A closed intake is a seam, and
  is not hemmed.
- **Trailing-edge mini-ribs on a wing of this tool's own**, 15% of chord by
  default, one in the middle of every cell but the tip's (`buildMiniRibs`).
  Each is the cell's section halfway between its ribs, as OpenGlider's
  `MiniRib` is. Its front is raised to the billow of the tool's own panels:
  by LEparagliding's rule, 0.85 of it eased back over 6% of chord, or by
  OpenGlider's, all of it eased along the whole mini-rib. On the three
  designs' ribs, the first comes to within 4% of their cutting files'
  mini-ribs, and the second 6 to 8% over on the two whose programs raise
  them. The bill weighs them (1.32 m² and
  53 g on the default wing), the 3D view draws them, and **Mini-ribs DXF**
  cuts them.
- `lerp3` in num.js, shared by the line plan and the panels.

**Found**

- OpenGlider's knot correction subtracts its 2.0 in metres, where its seam
  correction is converted from millimetres: two metres off a line in its
  length table, wherever its one entry matches. It is the fifth slip noted
  in `docs/openglider.md`.
- Hemmed, the three designs' panels come out 0.8 to 2.0% over their cutting
  files, so their programs cut a plain allowance at the front, not a hem.

**Changed**

- The construction notes' comparison of the bill with published weights had
  drifted with the bill's earlier rounds. Measured again, the 43 ordinary
  double-surface sizes come to 60–91% of their published weight.
- The nesting notes' default-wing figures have been measured again for the
  parted panels.

## 1.16.0 — 2026-11-24

The range of results by assumption. Where the tool has more than one sourced
way to find a figure, it now flies the design under every combination and
shows the spread, rather than choosing one.

**Added**

- **Range**, in the Flight tab. The design as built, its lines and
  hang point held, flown under each of the tool's alternative assumptions:
  - the route: the polar (the balance's lifting line) or the lattice (the
    flight model);
  - the section's drag: the handbook's estimate or mfoil's solve;
  - the lines' drag: the typed coefficient or the plan's own lines;
  - on the lattice, the force's direction: the lifting line's, or the kite
    paper's three-quarter chord, drawn dim and kept out of the range.

  That is twelve cases in about a second, each with its trim's angle, speed,
  sink and glide, and the glide drawn on a scale. Below them come the range,
  and a bar for how far each assumption moves the glide. What the tool
  reports, the balance and the flight, are among the cases to the last
  digit. Once it has run, the masthead shows the glide's range beside the
  single figure. **Range .tsv** saves it. `docs/ranges.md`.
- `asBuiltOnPolar` (app.js): the design's calage held, trimmed on the polar
  remade with another line drag or section drag. An imported design hangs
  at its own file's calage.
- `profileDragAt` (aero.js `wingPolar`): another section's drag at each
  station's lift, with the lift and moment kept. `profileDragDelta`
  (flight.js): a drag added to each strip from its lift. `sectionCd` is
  exported.

**Found**

- **On the default wing the glide runs 8.10 to 9.59** across the
  assumptions, at 35.0 to 37.1 km/h and a sink of 1.07 to 1.20 m/s.
- **The lines' drag moves it most**: the plan's own lines, at 0.0119 against
  the typed 0.020, add 0.92. The section's drag comes next: mfoil's for the
  estimate adds 0.44. The route moves it least, 0.12.
- **The balance's 8.10 and the flight's 8.61 differ by the section's drag,
  not the route.** With the same drags, flown as built, the polar and the
  lattice come within 0.04 to 0.20. The polar's 10% more lift at a given
  angle is taken back by a lower trim.
- **The kite paper's force direction** would put the glide at 6.47 to 7.68,
  the trim 2.1 to 2.3° higher.
- **A wing of the class, the Hook 3**, was measured at a glide of 9.3. The
  cases on the plan's lines bracket it, at 8.98 to 9.59, and those on the
  typed figure all fall below.

**Changed**

- The two choices asked about in 1.14 and 1.15 are left to the designer, as
  the designer asked. The typed line drag and the plan's are both flown,
  side by side. The default wing keeps its arc, and the planform map shows
  the published wings' arcs beside it.
- The interface test measures text by its anchor when it checks that a
  table's columns do not run into each other.

## 1.15.0 — 2026-11-23

The rest of the kite paper's design study: the planform. Each variant is
built and flown as the design is. Set beside the published wings, the default
wing's arc is flatter than any of them.

**Added**

- **Planform**, in the Flight tab: the kite paper's planform study (§6.2) for
  a glider. It builds twenty variants of the design: five flat aspect
  ratios, 0.85 to 1.45 times its own at the same area, by four arcs, its
  projected span ratio −0.08 to +0.04. Each is built with its own panels,
  line plan and hang point, as the design is, then trimmed and judged by the
  six criteria and its modes. The lines go with the span, as the makers' do
  across aspect ratios. Each cell gives the glide and the roll stiffness,
  coloured by what holds, and the published families sit on the grid as
  rings. It takes about two seconds. **Planform .tsv** saves it.
- `lobeWithProjectedRatio` (lobe.js): an arc of the same kind at another
  projected span ratio. A circle takes the ratio. An ellipse or a bionic
  lobe takes more arrow at its width, or a wider width at the least arrow.
- `stabilityCell` and `stabilityGridSteps` (stability.js): one point of a
  map, and a map over any points, each its own model.
- `buildModel` (app.js): the design's model, built without drawing it, so
  variants can be built beside the one on show without disturbing it.

**Found**

- **The default wing's arc is flatter than every published wing's.** Its
  projected span is 0.88 of its flat span. The eleven families in the
  reference set that publish one are at 0.77 to 0.82. That is why its roll
  stiffness, −0.077, is small. On a real wing's 0.80 this model gives
  −0.280, and a glide of 8.12 rather than 8.61. The default is unchanged:
  that is the designer's call, and every figure quoted for the default wing
  would move.
- **The roll stiffness is the arc's, not the aspect ratio's.** With lines
  that go with the span, Cl/β hardly moves from AR 4.0 to 6.8. It is −0.25
  to −0.34 at a projected span ratio of 0.80, and turns unstable at 0.92
  above AR 6.
- **The yaw stiffness grows with the aspect ratio**, Cn/β 0.047 to 0.070.
  This is the paper's finding for a kite.
- **A deep arc on a short span leaves the Dutch roll undamped.** At AR 4.0
  and 0.80 its damping ratio is −0.016.
- **The glide rises with the aspect ratio**, 7.95 at AR 4.0 to 10.25 at 6.8
  on the design's arc. The phugoid's damping falls with it, 0.085 to 0.044,
  which is Lanchester's trend.

**Fixed**

- **Colours explained only in a note that was cut off.** A pane's note shows
  two lines. On a pane 600 px wide the hang point's note was cut off halfway
  through amber, before red and grey (measured in a browser). The two slice
  views' and the flight view's colours came at the end of notes of 250 to
  370 characters, and were cut off too. Each map, both slice views
  and the flight view (and so its videos) now draw their own legends. The
  stability table says what stable and damped mean. Every tab's notes, and
  those the slices' and the flight's runs write, now fit their two lines at
  1500 px and three at 420 px, where the panes stack (measured in a
  browser).
- In the Wing tab's section view, the F and m labels sat on the B and C of
  the line rows anchored above them.
- The arc factors' cache held one wing. It holds the last 24 now, so the
  planform's variants do not put the design's own out of it.

## 1.14.0 — 2026-11-23

The glider judged as a kite paper judges a kite: its stability derivatives,
its modes and its hang point. Its aerodynamics are held to Belloc's
wind-tunnel paraglider, which found each strip's force pointing the wrong
way.

**Added**

- **Stability**, in the Flight tab. Poland, Masure, Cayon and Schmehl's
  quasi-steady derivatives (2026, §5.5), at the hands-up trim and on the
  bar. The six coefficients are differenced in α and β (0.005 rad) and in
  the three rates (0.1 rad/s), on the projected area and span, about the
  centre of mass and about the karabiners, and judged by the paper's six
  criteria. Then the flight model is linearised at each trim and its modes
  found: pitch, phugoid, Dutch roll and roll, each with its period, damping
  ratio and time to halve or double. **Stability .tsv** saves both.
  `stability.js`, `docs/stability.md`.
- **Hang point**: the paper's tow-point study (§6.3) for the karabiners. 35
  trims, 0.3 m fore and aft and a metre up and down, each cell giving its
  glide and its canopy's angle, coloured by which criteria and modes hold.
  It takes about a second. **Map .tsv** saves it.
- **Belloc's wind-tunnel paraglider** (Belloc 2015). Its geometry is built
  rib by rib and its NACA 23015 solved with mfoil at the model's Reynolds
  numbers. Its six coefficients come from the tunnel, and from Heatwole's
  AVL, XFLR5 and lifting-line models of it
  (`data/reference/belloc-2015-*.tsv`). Both of the tool's routes, the
  slices and the flight model, are run on it (`tools/windtunnel.mjs`), and
  the unit suite holds them to it.
- **The steady polar through the brakes**: `flightTrim` takes the handles
  held.
- `trefftzInfluence` (vlm.js): each strip's wash in the Trefftz plane from
  every strip's circulation.

**Found**

- **Each strip's force pointed the wrong way, in both routes.**
  - The slices took it on the three-quarter chord's velocity. That velocity
    holds the strip's own bound vortex, so the force came out square to the
    plate, not the flow.
  - The flight model took it on the three-quarter chord's angle. The
    trailing legs start just behind that point, so its downwash is too
    large: the induced drag came out a third above the Trefftz plane's.
  - Both now take it square to the flow at the lifting line, as the Vortex
    Step Method does. The strips' induced drag is the Trefftz plane's, to
    0.6% on the slices and 2% in flight. On Belloc's wing the pitch
    stiffness about the hang point is AVL's: −1.60 a radian against −1.61.
  - The kite paper kept the three-quarter chord, because its drag came
    closer to the tunnels'. On Belloc's wing, that is its excess induced
    drag standing in for the profile drag the smooth sections lack.
- **The default wing's trim was that error.** It now trims at 35.8 km/h,
  glide 8.61, canopy 5.3°, 0.3° above the balance's 5°. The 32.9 km/h and
  7.4° that 1.13 called a finding about the hang point came from the force
  direction. Its steady stall is at 70 cm of brake, and the EN 926-2 pull
  departs at 88 cm: class A, where 1.13 said 52 cm and class C.
- **The default wing is stable and damped** by all six criteria, hands up
  and on the bar.
  - Pitch oscillation: 2.6 s, damping ratio 0.69.
  - Phugoid: 6.7 s at 0.07; neutral on the bar, where it doubles over
    230 s.
  - Dutch roll: 2.4 s at 0.23.
  - Its roll stiffness is small, Cl/β −0.077, because the arc's centre lies
    near the centre of mass.
- **The hang point.** The glide peaks 0.1 m aft of the design. Raising the
  hang point weakens the roll stiffness, as the paper found for a kite's tow
  point. Moving it aft stiffens pitch and yaw, where a kite loses them.
- **Against Belloc's tunnel:**
  - the side force and the yaw stiffness within 10%;
  - the drag's rise with lift within 8%;
  - the lift slope 26% steep. Heatwole found AVL, XFLR5 and his lifting
    line 14 to 19% steep, and could not explain it either;
  - the roll stiffness 30% weak, as AVL's is;
  - the drag at no lift half the tunnel's, from smooth sections.
- **The flight's glide is a smooth canopy's.** On the polar's profile drag
  it would be about 8.2 rather than 8.61.
- The plain lattice (`vortexLattice`) still takes its force at the
  three-quarter chord. It enters the polar only as the arched wing's lift
  over the flat one's, where the error nearly cancels: 0.804 against 0.809.
  It is on the roadmap.

**Fixed**

- On a screen 900 px wide or less, the panes of the one- and two-pane tabs
  were squeezed to between 0 and 60 px tall, and the Flight's chart to
  nothing. The page now scrolls, with each pane under the one before.
- At a phone's width, the stability table's columns ran into each other.
  Its columns, and the eighteen's, now start past the widest entry before
  them (an interface test).

## 1.13.0 — 2026-11-23

The glider flown through its brakes: either brake or both, pulled to 65 cm
over 3, 1 or half a second, from hands up or on the bar; played in 3D and
recorded to video.

**Added**

- **The Flight tab.** A start (hands up, on the bar), a brake (left, right,
  both), a rate (3 s, 1 s, 0.5 s), the travel, how long it is held and
  whether it is released; **Fly**, or **All 18**. The flight plays in 3D
  behind, beside, in front of or below the glider — the canopy coloured by
  each strip's state, the pulled brake lines drawn, the handles' travel and
  the figures on screen — beside a chart of it over time, or a table of all
  eighteen. **Record video** plays it in real time into a 1280 × 720 video, WebM or
  (where the browser records only that) MP4;
  **.tsv** saves it frame by frame. `docs/flight.md`.
- **The flight model** (`flight.js`): the whole glider as one rigid body
  with six degrees of freedom, hung from the riser midpoint; the slices'
  lattice factorised once, every strip on it meeting its own air (the
  glider's velocity and rotation) with the alpha method turning it to its
  braked section's lift; the air inside the canopy in the inertia but not
  the weight; Barrows' apparent mass for an arched canopy, assembled as
  Heatwole's glidersim does, the steady Munk moment taken out; pilot and
  line drag where the balance has them; fourth-order Runge–Kutta at 0.01 s.
  Its own trim by Newton's method; the bar pushed out a row at a time until
  the trim's lift would fall below the collapse floor.
- **The brake as built**: each anchor's free travel first (tip first, 180
  and 60 mm by default, set in the tab), then the pull toward the pulley,
  the drop square to the chord by the cosine between line and section.
- **The braked section** (`brakesection.js`): the chord behind 65% bent
  into an arc of its own length; mfoil on bends of 0 to 40°; the bend's
  increments fitted as sin 2θ and sin³θ beyond; the stall where the lift
  slope falls to 0.3 of its linear value, 0.09° earlier a degree of bend;
  Viterna and a flat plate past it. The library's four NACA sections come
  solved with the tool (`data/reference/brake-sections.tsv`); any other is
  solved in about two minutes.
- **Departure**: a quarter of the span deep in its stall, or the air past
  30° to the canopy, or 30° of sideslip, ends the flight two seconds later,
  with what it did up to then; or, if asked, flies on, labelled.

**Found**

- The model trims the default wing at 32.9 km/h with its canopy at 7.4°,
  where the balance assumed 5° and found 35.2 km/h: the hang point was
  chosen on the polar, whose lift is the lattice's plus 10%.
- On the bar it keeps only 90 of 150 mm above the collapse floor; at 120 mm
  its trim's lift would be 0.32. The NACA 4415's centre of pressure runs aft
  as its lift falls, and the swept, washed-in tips carry more of the lift at
  low angles.
- Its symmetric stall travel, both brakes over 5 s as EN 926-2 flies it, is
  52 cm on the default free travel: class C for 80 to 100 kg. It passes the
  trim-speed spin test. Every one of the eighteen departs at 65 cm.
- Viterna's form divides by the plate's angle, which a bent chord swings
  through zero at negative angles: a tip strip read a lift of 198 and broke
  the flight's symmetry. The plate's bounded shape is used there instead.

## 1.12.0 — 2026-11-18

The wing as its sections: step along the span from tip to tip, each slice's
section solved in its own flow with a viscous panel method, and the slices
put back together into the wing.

**Added**

- **The Slices tab.** Each cell's section in its own flow — the free stream
  across the page, the section turned to the angle the whole wing leaves it
  at, its pressure above it, its displacement thickness laid on it and
  carried into the wake, transition marked — and every slice tip to tip:
  lift, drag and the angle each meets. A slider and arrows step from the
  left tip to the right. Hands up, at the balance's angle, or on full bar.
  `docs/slices.md`.
- **mfoil, in JavaScript** (`mfoil.js`): the method Scirocco implements,
  Krzysztof J. Fidkowski's mfoil (MIT licence, its notice kept), ported from
  the Python Scirocco keeps for its own checks — a linear-vortex panel
  method coupled by Newton's method to an integral boundary layer and wake,
  with Drela's closures and e^N transition. It agrees with mfoil.py to 1e-12
  on six sections from Re 200 000 to 1.5 million and Mach 0.3, and fails
  where it fails (`data/reference/mfoil-sections.tsv`). Each Newton step
  solves for the edge speeds alone, the boundary layer eliminated first by
  substitution, checked against the whole system: ten times mfoil.py's
  speed.
- **The slices put together** (`slices.js`): polars at a few Reynolds
  numbers, swept in angle from each other's boundary layers; the alpha
  method on the lattice, at the speed whose lift is the weight; each slice
  solved at its own angle and Reynolds number and fed back until the
  lattice's lift and the slices' agree within 0.003. `latticeSystem` (vlm.js)
  is the lattice without its solve, which `vortexLattice` now calls.
- **Exports for each slice**: the section as solved (.dat), an XFOIL run,
  an mfoil script, the input Scirocco's analysis server takes, and every
  slice in a table.
- **The Ohio State tunnel's NACA 4415** at Re 1.0 and 1.5 million
  (`data/reference/naca4415-osu.tsv`, NREL/TP-442-6472): mfoil's lift
  within 0.06 of it and its moment within 0.016 from 0° to 6°.

**Found**

- The polar the balance flies has 10% more lift and 20% more induced drag
  than the slices on the default wing at trim, and the lattice alone agrees
  with the slices: Prandtl's lifting line at an aspect ratio of 4.7. Not
  changed here; the roadmap carries it.
- mfoil cannot take a sewn trailing edge — its wake is aimed along the gap's
  normal — so the slices open the section to 1e-4 of the chord, which costs
  0.003 of lift against a sharp edge's, measured on gaps from 4e-3 to 1e-5.
- mfoil judges convergence on the boundary layer's residual alone; the port
  also checks the edge-speed equations, after a warm start that kept the old
  edge speed settled at cl 0.75 where the answer is 0.47. Scirocco's copy of
  mfoil.py tightens Newton's tolerance to 1e-12, the rounding floor, and its
  `set_coords` does not run.

**Fixed**

- The bundler (build.py) left `export` on an `async` function, which the
  page refused, and took a line of a script template that began with
  `import` for a module import.
- A tab's tools could push the page wider than the window; they wrap now.

## 1.11.0 — 2026-11-18

The brake's main line, as every sheet has it, and its cascade fitted to 26
of them.

**Fixed**

- The brake cascade's first junction was at the pulley: three lines a side
  ran down to it from the cascade, and one short line from the pulley to the
  handle. Every sheet on file has one main line instead, from the handle up
  through the pulley to a junction well above it — BGD's `KL1`, 2926 mm on
  the Lynx 2 M, which `docs/brakes.md` read as "a line from the handle up to
  the pulley", and Ozone's `KRU` over `KRL`, 2906 mm from the Geo 7 MS's
  handle mark. Built so, each side's brake came out a fifth to a half over
  its sheet's. `buildBrakePlan` builds the main line from the handle past the
  pulley to its junction, and the three lower middle lines from there; on
  the pipeline's 13 anchors on 6 and 3 middles the Geo 7, Ultralite 5,
  Alpina 5 and Lynx 2 come within 7% of their sheets' brakes, the Zeno 2 14%
  over, where they were 29 to 58% over, and the 55 published sizes run +4%
  (−26 to +31%), where they ran +11% (−22 to +40%).
- The brake's anchors ran from the centre rib to the tip rib, closing
  outboard to a third of their inboard spacing. No wing on file has a brake
  line on either: fitted to the five whose brake ribs are known — the Lynx
  2's sheet, the Geo 7's rigging diagram and the three LEparagliding designs
  — they run from 6.5% of the way out to the tip, counted in ribs, to
  92.5%, the outboard gaps four fifths of the inboard.
- The sheets' brake mains named without a number — the Zeno 2's and the
  Lyght's `KRU` and `KRL`, the Magnum 4's `AR3_U` and `AR3_L` — were passed
  over. Read, the Zeno 2 family's totals are 7.2 to 8.1 m longer (208 pieces,
  not 204), and the line-length law, refitted on them, is 49.62 − 4.91 AR m
  per metre of span (r² 0.944): within 6.2% of every family's own, 7.8% of
  every size, and out of sample 2.2% over the SAGE and 6.5% under the Lynx 2.
  The Magnum 4's written cascade has the three A mains its sheets give, not
  two.
- BGD's `KL1` was read as an upper line 2.9 m long and the `KR` lines as
  mains. A brake's levels come from the paths the sheet states, and `KL` on
  a brake is its main.
- `buildBrakePlan` without a hang point hung from the leading edge — its
  default asked the anchor count for rows — and its `totalLengthMM` took one
  main line away, as though the two handles shared one.
- The controls stage probed "Diagonal reach" on a written cascade the parser
  refuses, so on the plan derived instead, where the reach changes nothing; it
  passed only because an export's anchor solve left gaps, and failed once the
  brakes no longer pushed it to. It probes a cascade that builds now.

**Added**

- `BRAKE_GEOMETRY`: where the brake's junctions go and how much line runs
  under the pulley, fitted to the Geo 7, Ultralite 5, Alpina 5, Zeno 2 and
  Lynx 2 at their own counts and line heights — each side's brake within 9%
  under to 12% over its sheet's, the path to the handle within 2% on each
  size's mean and 6% at any of 205 anchors, and a design left out of the fit
  within 11% under to 14% over. The unit suite builds the Geo 7 MS and the
  Lynx 2 M so and holds them to their sheets.

**Documents**

- `docs/brakes.md` says what the brake is and how it was fitted; the
  pipeline's line totals, the line plans' level split, the Hook 6's brake in
  the picker, and the brake's per-anchor shape (63 to 168 mm from the 16
  sizes it was fitted on, 109 to 199 before) are measured again.

## 1.10.0 — 2026-11-17

The two-liners' bridles, read from the sheets and built.

**Added**

- Bridle pairs (`bridlesPerRow`, and `bridle 8` in a written cascade): a
  row's inner anchors each gather two tabs on their rib, 8% of chord apart
  either side of the row's station, onto one line a bridle's length below
  the sail — 0.087 of the rib's chord, as on the Alpina 5 ML and the Zeno 2
  ML. The junction stands on the line from the rib's top line down through
  the tabs' centre, so the forward bridle comes out the longer, as on every
  pair of the three sheets. The three Ozone two-liners are built with
  theirs, in the pipeline and from the wing picker, and the anchor solve
  builds them on a two-liner with three rows.
- A pair shares its rib's row load: halves under the convention, by the
  chordwise pressure between the tabs otherwise (`bridleSharesFor`). Each
  tab is an attachment point of its own in the totals (`Ab` for the aft
  one), the inspection record and forecast, the tabs, the rib stress and the
  rib drawing, and the openings keep both tabs' rays clear.

**Fixed**

- The sheets' bridle pairs were read as canopy lines, and the line they
  hang from as one more. So the Alpina 5's A row counted 31 anchors where
  its sail has 23 tabs on 15 ribs, the two-liners were built with a rib for
  every bridle, and their linesets came out a third over their sheets. Read
  by line (`resolveBridleLevels`), and built with their own fifteen and
  fourteen A ribs and eight pairs, the Alpina 5 ML's suspension lines come
  to +11% of its sheet's and the Zeno 2 ML's to +10%; across the 55
  published sizes the pipeline runs +11%, where it ran +15%.
- What the corpus said of two-liners followed from the same count, and was
  wrong: they do not taper much harder than three-liners. By rib their
  front-to-rear ratio is 1.25 to 1.75, inside the three-liners' 1.00 to
  2.50, where it read 2.58 to 3.75, and a two-liner on three rows is
  suggested with its front two rows alike, as all three measured are, and
  57% of its front row bridled. Front density on the twenty designs is 0.28
  to 0.90 of the ribs, median 0.45 (0.94 and 0.53), and falls with aspect
  ratio, r = -0.78, which the bridles had hidden.
- Anchor loads were keyed by row and number, so the second tab of a pair
  replaced the first and its rib lost half its A load. They are keyed by the
  line's name, and a row counts once at its rib.
- The sheets' totals columns are read by their headings. The Swift 6's
  brake totals had been taken from its empty E column and never read; on a
  two-liner the columns are attachment points along the chord, and read so
  the Lyght's stabilo lines are found, A13 and B13 on one path.

**Documents**

- The pipeline's line totals and the level-by-level comparison, the
  anchor-density tables, and where the remaining surplus is: the brake
  cascade, the generator's own on every wing, three to nine tenths over the
  sheets' brakes. The rigging diagrams of 1.9.0's note are the Alpina 5's,
  the Lyght's and the Enzo 3's; it named the Zeno 2's, which is not on file.

## 1.9.0 — 2026-11-17

The section's own mean line, NACA five-digit sections, and the two-liners'
bridles as Ozone draws them.

**Added**

- NACA five-digit sections, standard and reflexed (`naca5`, `nacaSection`):
  the 1930s mean lines with the camber far forward, on the four-digit
  thickness closed at the trailing edge, from NASA TM-4741's constants. The
  suite holds all nine mean lines to the conditions they were drawn to —
  the maximum camber at 0.05 P, an ideal lift coefficient of 0.3 within 3%,
  and no moment about the quarter chord on the reflexed ones, within
  0.0014. The interface offers the NACA 23015 and the reflexed 23115, and
  says what each code means.

**Fixed**

- Thin-aerofoil theory was worked on the mean of a section's two surfaces,
  which is not its mean line where the thickness is laid perpendicular to
  a sloping one. A section the tool generates carries the line it was built
  on now, and the theory, the chordwise loading and reflex are worked on
  it: the NACA 2412 gives the worked example's -2.077° and -0.0531 exactly,
  where it read -2.115°, and the default 4415 -4.154° and -0.1062, where it
  read -4.275° and -0.1052 — an error that grew with the thickness. On the
  default wing at 5° the trim moves from 34.97 to 35.16 km/h and the calage
  from 41.9% to 42.3%; the A row's pressure share from 36.1% to 35.3%.
  Imported sections, read from their coordinates, do not move.
- `naca4` took five-digit codes and read them as four: '23012' came out 2%
  camber at 30%. It refuses them, and each code goes to its own reader.
- The two-liners' bridles: Ozone's rigging diagrams of the Alpina 5, the
  Lyght and the Enzo 3, supplied by the user, draw each bridle pair on one
  rib, one tab behind the other along the chord. Four documents said
  neighbouring ribs, or that no drawing was on file. The sheets' names count
  the eight lines under the pairs as anchors: the Alpina 5's canopy has 23 A
  tabs on 15 ribs where the count says 31. Building the bridle level is
  still open, and now specified.

**Documents**

- The certification trims, the Lynx 2 M's derived figures, the pipeline's
  55 sizes and the default wing's balance, with the exact mean line;
  `docs/environment-and-aero.md` §3 on the mean line and §4 on five-digit
  sections.

## 1.8.0 — 2026-11-03

The risers' webbing, and its drag.

**Added**

- This tool's own risers have a width now, and their drag is counted: each
  a strap broadside to the flow at Cd 1.98, as LEparagliding counts one, at
  its own angle to the flow. **Riser webbing width**, under Assumptions, is
  12 mm by default, the main riser webbing of six of the eight wings dated
  from 2020 whose bills of materials the DHV publishes — all of Swing's and
  the Nova Codex, aramid and polyester; the Nova Glitch and a 2025 list that
  does not name its wing have 20 mm. Ten lists are in `RISER_WEBBING`
  (risers.js), each with its address, under the provenance check; 0 leaves
  the risers' drag out, and the Balance table says so. An imported design's
  risers are still its own.
- On the default wing the straps add 0.003 to its lines' 0.009 and move
  their drag's centre from 2.93 to 3.91 m down. It flies on the handbook's
  typed line drag unless asked to fly on its plan's, so its speed and glide
  do not move; its calage at 5° does, from 40.8% to 41.9% of chord.
- The bill of materials says how wide the riser webbing is.

**Documents**

- `docs/loads-and-materials.md` §3, `docs/balance.md`, `docs/hang-point.md`
  and `docs/full-pipeline.md` §6 with the risers counted; the straps in
  tandem, each counted as if alone, are an open item.

## 1.7.0 — 2026-11-02

Each line's own drag, and the section's moment from XFOIL.

**Added**

- Each line's drag coefficient from its own Reynolds number, 1 + 10
  Re^-2/3 on its diameter and the flow square to it — White's correlation,
  as LEparagliding takes it — where every line was 1.1. One coefficient
  typed for every line stays a choice: **Line drag coefficient**, under
  Assumptions. Square to the flow, the gnuC2-23's 95 lines are its
  program's drag to the last digit.
- A line's drag goes as sin³ of its angle to the flow, the cross-flow
  principle's part along the flow, where it went as sin²: 8.5% off the
  gnuC2-23's set at its section 17's 9.45°. Its loops are in its frontal
  length, an imported line's as its program counts them, a spliced loop at
  √2 − 1 of its length.
- An imported design's risers' drag, as its program counts it: a strap
  broadside at Cd 1.98, a round riser as a line. This tool's own plans give
  their webbing no width, so their risers' drag is not counted, and the
  Balance table says so.
- A loaded XFOIL polar's Cm0 and zero-lift angle in the balance, the trim
  and the lattice's angle, where thin-aerofoil theory's were taken whatever
  was loaded; the Balance table names which.
- On the gnuC2-23 at its 4.51° the calage is 32.4%, the rules' 25.5%, and
  its lines' drag is centred within 3 mm of where its program centres it.
  The default wing's lineset Cx is 0.0091 where it was 0.0079, thin lines'
  Cd 1.21 and their loops, and its calage at 5° 40.8%.

**Fixed**

- Loading one imported design after another kept the first one's pilot,
  wing mass and pilot drag: the Swoop2 and the Tuluaq-19 were balanced, and
  their 1.6.0 figures written, with the gnuC2-23's 70 kg pilot on a 4 kg
  wing. Each design starts from the parametric wing's now, its own section
  35 over them, and the gnuC2-23's pilot flies on the drag it gives him,
  Cd 0.6 on 0.438 m², where he had the default Cx 0.015.
- An XFOIL polar that does not reach zero lift — swept from 0°, as many
  are — had its first angle taken for its zero-lift angle, some 4° out on a
  cambered section, and the wing was flown on it: on the suite's polar near
  a NACA 4415's, cut to start at 0°, the default wing at 5° flew 44 km/h
  where the whole polar flies it at 35, its calage 8 points of chord aft.
  Its zero lift is found along its lift slope now, 0.4 points from the
  whole polar's calage, and the panel says so; a polar whose lift does not
  rise with its angle is refused.
- A sheathed line's drag had 5% added that nothing sourced; it is gone.

**Documents**

- `docs/loads-and-materials.md` §3: the line drag model and its check
  against LEparagliding's. `docs/balance.md`: the three designs with their
  own pilots; the default wing's lift centroid 0.51 m below the chord, which
  said 0.48, and the Swoop2's and the Tuluaq-19's 0.53 and 0.39 m, which
  were misrounded.

## 1.6.0 — 2026-10-28

The balance with every force where it acts.

**Added**

- The balance on the wing's polar puts each force where the wing says it
  acts, and takes moments about the karabiners (`balanceWhereForcesAct`):
  the lift on its own line in the arc — the centroid of the vortex lattice
  strips' lift, moved along the flow by the sections' Cm0 on their own
  chords — the profile and induced drag at their own centres, the wing's
  weight at its cloth's mass centre (`wingMassCentre`), the lines' weight
  and drag at theirs from the plan (`lineCentres`), and the pilot below the
  karabiners, free to swing or held plumb. Chapter 4's rules — the lift on
  the central chord at 0.25 − Cm0/CL, the wing's weight a third back, the
  lines half and a third of the way down, the pilot at the karabiners —
  remain a choice: **Forces act** in the Balance panel. With every point
  the rules', the handbook's calage to the micrometre; with the program's
  points, the gnuC2-23's section 17 (`calageFromForces`). The Balance table
  says where each acts, and the section view draws the wing's force and
  mass.
- On the gnuC2-23 at the 4.51° its file declares it hangs the pilot at
  33.0% of chord, where the file hangs him at 33% and the rules at 26.3%;
  its lines' weight is centred within 1.4 mm of where its program centres
  it. A paraglider's quarter-chord line runs back toward its tips, and the
  lattice puts the three designs' lift 2.2 to 5.9 points of chord aft of
  the rule's centre of pressure, 0.38 to 0.60 m below the chord
  (`docs/balance.md`).

**Fixed**

- An exported design's section 8 gave LEparagliding the centre of pressure,
  to a whole per cent, where the program takes the point the pilot hangs
  plumb under and sets the attitude from it: it flew the export at another
  angle than the balance's. It is the karabiners' plumb point now, to a
  hundredth, with the riser the plan hangs from, and the program gives the
  balance's attitude back.

**Documents**

- `docs/balance.md`: the method, what it reproduces, the three designs, and
  what it does not do yet — the sections' moment from an XFOIL polar, the
  risers' drag, a line's drag at an angle as the cross-flow principle has
  it, the wing's rods and reinforcement where they are.

## 1.5.0 — 2026-10-27

OpenGlider, read: its line types, and its sum of the line set by level.

**Added**

- `data/reference/line-stretch.tsv`: OpenGlider's 56 line types — Cousin's
  Vectraline, CTL 900 and Technoline, Liros's LTC, NTSL, TSL, DFL and DSL —
  with their load and elongation measured, credited, in daN. Thirteen of the
  catalogue's lines stretch on their own curves now (`elongationOf`), in the
  length chain and the stretch correction; the generic 3.5 and 5% at the
  rated strength had been 1.5 to 3 times a sheathed Technora line's stretch
  at 5 daN, and 3.6 times a sheathed Dyneema one's. A 3 m TSL 190 main
  measured at 5 daN is 3.7 mm over its sewn length, not 7.6.
- The line set level by level, as the DHV calculates it for EN 926-1:2015
  and NfL 2-565-20 (`strengthByLevel`): each level's strengths after bending,
  both sides, at least 1400 daN and 14 times the weight, every line 20 daN,
  each brake level 150 daN, a branch that has ended counted again above it,
  as OpenGlider's `get_floor_strength` counts it. The Lines group shows
  every level against it.

**Fixed**

- Sized line by line, the tool's line sets fell short of that calculation:
  the default wing's mains came to 1382 daN and its brake's first level to
  82, a DC 40 a side, where the Lynx 2 M's sheet gives 2015 and a PPSL 200 a
  side. The weakest lines of a short level are taken up a size until it holds,
  unless **Size each level to the DHV line calculation** is unticked.
- Bare aramid line was weighed at 0.9 g/m per mm² of its area, a guess;
  Liros's LTC, in OpenGlider's table, comes to 1.11 over nine sizes, and the
  catalogue takes that now. Liros's sheathed lines, 0.955 over 24, confirm
  the 0.98 taken from Edelrid's. A line OpenGlider weighs takes its weight.

**Documents**

- `docs/openglider.md` reviews OpenGlider's code and data, where it had gone
  no further than its README: what was taken, what was not and why — line
  sag under drag is 7 mm at most on a loaded line and adds 27 µm — and four
  slips in it.

## 1.4.0 — 2026-10-27

The balance on the wing's own polar.

**Fixed**

- The balance counted the section's pitching moment twice. The handbook's
  4.2 puts the lift at the centre of pressure, which already carries that
  moment, and adds −q0·Cm again in a seventh term, without the chord; the
  worked example and the author's own program leave it out. Counted once, a
  pilot with nothing below the wing but weight hangs plumb under the centre
  of pressure, to the micrometre. On the default NACA 4415 wing the second
  count had put the calage 6.1 points of chord aft at 5°, and it is where the
  "40 to 45% real wings use" came from: the lift real wings trim at needs 32
  to 36%, where the three complete designs on file hang theirs.
  `printedAeroMoment: true` restores the term as printed.
- A calage forward of the centre of pressure was refused as one a wing could
  not balance at, by the same double count. A wing gliding nose down hangs
  there: the three designs' files hang their pilots at 33, 32.5 and 36% under
  plumb points of 38, 40 and 39%. Refused, the 13 m² Ultralite 5 had its
  lines hung from its anchors' centre. Only the 2012 worksheet's calage is
  refused now, for a glide its own coefficients do not give.
- Two of the suite's sections passed the line height as `lineLengthM`,
  which the balance does not read, and flew on its default 6 m.

**Added**

- **Balance on**: the wing's own polar at the angle (the default), the polar
  trimmed from the calage, or the handbook's typed coefficients. On the polar
  the lift, induced and profile drag are the polar's, in its arc, and the
  centre of pressure the section's Cm0 places on the wing's own lift; the
  loads, the cloth's billow, the intake and the speed system follow the
  angle it flies at, and the speed bar's first row is the balance's trim.
  The balance table says what it was flown on, and when a calage cannot trim
  the wing, why.
- An imported design's own calage, trimmed on this tool's polar, beside the
  angle its file declares: the Tuluaq-19's 36% trims at 7.51° for its 7.41,
  the gnuC2-23's 33% at 5.68° for its 4.51.
- Against the certificates: no Geo 7's calage is published; trimmed in its
  arc from 34%, all four certified cases are above 30 km/h, and the lightest
  only from a calage forward of 37.1%.

## 1.3.0 — 2026-10-26

The speed system in the interface.

**Added**

- A **Speed system** group: the bar's travel and the trimmers', and the wing
  across the bar on its own lift curve, in its arc, from the angle the
  balance assumes — speed, sink and glide at each position, the ones past the
  collapse floor marked — and where the trimmers take it, alone and with the
  bar, said when each alone flies and the two together do not.
- An imported design's own table of risers and calage (its section 28), as
  the program its file names prints it, and its output's section 1 figures
  in the balance table, as printed and, where the label says otherwise, as
  it says.
- The polar's note says whether the wing flies in its arc.

**Fixed**

- The interface test's stand-in for the page kept every node it ever made —
  6.5 MB a rebuild — and ran out of memory once the panel grew a table. Its
  selectors search the page from its roots, as a browser's do. The page
  itself never held them: in Chromium it keeps 5,505 nodes and 6.5 MB of
  heap after 60 rebuilds.

## 1.2.0 — 2026-10-26

The wing flies in its arc.

**Flight**

- The polar and the balance flew a flat wing: the lifting line's straight
  span and the handbook's flat finite-span factor. They fly the wing in its
  arc now, by the vortex lattice: the wing as built against itself laid
  flat, its lift slope, zero-lift angle and induced drag at the same lift
  (`arcFactors`). A paraglider's arc leaves it 0.72 to 0.80 of the flat
  wing's lift and a fifth to a quarter more induced drag. The interface flies
  it so unless **Fly the wing in its arc** is unticked; the full pipeline
  flies its 55 sizes so.
- Against published figures: at the assumed 6° the Geo 7 trims at CL 0.59
  in its arc, where real wings trim, and three of its four certified cases
  are above 30 km/h, where flat one was; the Lynx 2 M's derived glide is
  10.8 against the published 11, its sink 0.88 against 1.0 and its trim 34.3
  against 39, from 12.2, 0.69 and 30.1 flat.

**Fixed**

- The vortex lattice's trailing legs left each strip at its quarter chord,
  straight downstream. On an arc the system grew ill-conditioned with the
  angle: the default wing's circulation ran away above 9°, and the lift a
  37° arc costs came out 16% where it is 11%. They run along each strip's
  edge to its trailing edge now. 1.1.0's assessment and roadmap quoted the
  16%.
- The lattice left a centre cell — the middle of a wing with an odd number
  of cells — out of the wing it solved.

## 1.1.0 — 2026-10-26

From an audit of the published repository, its code and its documents.

**Licence**

- `LICENSE` is the GNU GPL v3 as the repository carries it, held to its
  checksum. `LICENSING.md`, deleted on GitHub and put back by each release
  since, is gone; the audit fails if it returns.

**Fixed**

- A wing or design name carrying markup ran it, in the status bar and in the
  import box. Both write text, and the page carries a content security
  policy: its one script by its hash, no network.
- A damaged design file threw a raw error from the line reader (19 of 200
  damaged files). Every section the lines take is checked as it is read, and
  an import loads what it can and names the section and line it could not.
- The status bar counted three ribs with no load path on the gnuC2-23 where
  the panel says its own pieces join two of them.
- An import is cut as the program its header names cut it: holes as 39-sided
  polygons before 3.30, a 3.25 file's diagonals, pockets and mini-ribs its
  way, and only what of sections 37 and 38 that program reads. The
  Tuluaq-19's internal structure in the bill is 10.77 m², as its 3.25 drew
  it, where it was 10.48, as 3.30 would cut it.
- `MANIFEST.txt` left out the interface test and its page shim, which two
  check stages run, and `package.json`, which the build reads.
- The speed system's chain from the wing (`acceleratedPolarFromWing`,
  `collapseFloorForTopSpeed`) took the lifting line's coefficient for a
  section's and applied the finite-span factor to it a second time. Flown as
  it is, the Lynx 2's derived trim is 30.1 km/h, not 35.1, and the floor its
  58 km/h implies Cz 0.22, not 0.307.

**Documents**

- The Lynx 2's published flight figures were matched on a lift curve typed by
  hand; the curve derived from the wing gives 30.1 km/h, 43.0, 12.2 and 0.69
  against 39, 58, 11 and 1.0 (`docs/validation.md` §2.7).
- The load cases are their own note, `docs/load-cases.md`.
- The assessment's size and line counts, the notes' count and the reference
  data's size were stale; the audit holds them now. Five roadmap items were
  done or repeated others, and are closed.

**Added**

- The version in the page, this changelog, and a GitHub workflow that builds
  the page, checks it is the one committed, and runs every check stage.

## 1.0.0 — to 2026-10-26

Every release before versioning carried 1.0.0. In outline, by round:

- **to 10-12** — lines, fibres and inspection checked against the makers'
  data; the line catalogue under its right fibre; the PMA inspection check
  against a maker's own record.
- **10-19 to 10-21** — the makers' own line-plan drawings; each picker wing
  hangs from its own cascade; the reference wings' arc an ellipse through
  their projected span.
- **10-21** — the Tuluaq-19, a second complete design, read exactly.
- **10-22** — what a design sews inside its cells, cut as its program cuts it.
- **10-22 to 10-26** — the gnuC2-23, a third complete design; every rib and
  panel cut as its program cuts them.
- **10-26** — the program's longitudinal balance and section 1 figures
  reproduced; the vortex lattice's induced drag on an arc corrected.
