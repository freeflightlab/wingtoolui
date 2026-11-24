# Stability — the derivatives, the modes and the hang point

The Flight tab's **Stability** button judges the trimmed glider by its
stability derivatives, then finds its dynamic modes. **Hang point** maps glide
against stability as the karabiners move, and **Planform** as the aspect ratio
and the arc change. The method comes from a kite paper.
The tool checks both its own aerodynamics and the method against a wind-tunnel
paraglider. The module is `src/core/stability.js`. The wind-tunnel case is in
`tools/windtunnel.mjs` and its unit tests.

## 1. What a kite paper brings to a glider

Poland, Masure, Cayon and Schmehl (2026) design leading-edge inflatable kites.
Their method is the Vortex Step Method: a lifting-line lattice coupled to
two-dimensional polars, which they take from machine-learned surrogates of RANS
solutions. They check it against the TU Delft V3 kite in a wind tunnel. Then
they judge its stability, in §5.5, and study the airfoil, the planform and the
tow point, in §6.

A paraglider is a kite whose tether is its pilot's weight. Seven things carry
over:

- **The derivatives and their criteria.** These are used here exactly as the
  paper defines them (section 2).
- **Where the moments are taken.**
  - A kite turns about its tow point. The paper notes that "kites that rotate
    about a sufficiently low tow point require anhedral for roll stability".
    An aeroplane, which turns about its centre of mass, needs dihedral.
  - A paraglider flies free, so it turns about its centre of mass. That point
    hangs most of a line's length below the canopy, so the arc's anhedral
    steadies it as it does a kite. Here the moments are taken about the centre
    of mass, and also about the karabiners, for comparison with the paper's tow
    point.
- **The modes the paper leaves open.** "A dedicated modal analysis, including
  unsteady aerodynamics, is required to characterize the associated dynamic
  modes" (its §7). The tool's flight model already holds the inertia and the
  apparent mass, so it gets the modal analysis here (section 3).
- **The tow-point study.** For a glider, the tow point is the hang point
  (section 4).
- **The planform study.** The aspect ratio and the arc, each variant a design
  built and flown (section 5).
- **A wind-tunnel paraglider.** The paper's data list carries Belloc's
  wind-tunnel data, which it used to judge the force's direction. The tool
  uses the same data to check itself (section 6).
- **Where a strip's force points.** Following that data led to a correction
  in the tool's own aerodynamics (section 7).

The paper's airfoil study and its surrogates are for inflatable tubes and
single-skin canopies, and do not carry over. Its other practice, section data
at several Reynolds numbers interpolated in log Re, is on the roadmap: the
slices already do this, and the flight model still flies one Reynolds number.

## 2. The derivatives

The paper's quasi-steady rigid-body derivatives are taken at the trim. The six
force and moment coefficients are differenced centrally in five quantities:

- the angle of attack and the sideslip, 0.005 rad either side;
- the roll, pitch and yaw rates, 0.1 rad/s either side.

The rates are made dimensionless as p̂ = pb/2V, q̂ = qc/2V and r̂ = rb/2V. All
are in the body's axes: x forward, y right, z down.

Six criteria judge them:

- **Statically stable:** Cl/β < 0, Cm/α < 0 and Cn/β > 0.
- **Damped:** Cl/p̂, Cm/q̂ and Cn/r̂ all below zero.

The forces are everything aerodynamic on the glider: the canopy's strips, the
pilot's drag and the lines' drag. Rates are applied about the reference point,
with that point's velocity held as the trim's. The coefficients are on the
projected area and span, as the paper's are, with Cl and Cn on the span and Cm
on the mean chord c = S/b. The tool's polar elsewhere is on the flat area.

Halving both steps moves the six criteria by less than 0.5%, which is the
paper's robustness test (a unit test). The lateral and longitudinal
derivatives do not mix, to 1e-8. Moving the reference from the karabiners to
the centre of mass changes the pitch stiffness by exactly the lever.

**The default wing.** About its centre of mass, 0.39 m above the karabiners,
on 20.3 m² and 8.94 m. In brackets, about the karabiners:

| | hands up, 35.8 km/h, 5.3° | on the bar, 90 mm, 46.9 km/h, 0.2° |
| --- | --- | --- |
| roll, Cl/β | −0.077 (−0.103) | −0.061 (−0.086) |
| pitch, Cm/α | −1.37 (−1.51) | −0.54 (−0.64) |
| yaw, Cn/β | +0.055 (+0.056) | +0.027 (+0.028) |
| roll damping, Cl/p̂ | −0.014 (−0.025) | −0.013 (−0.023) |
| pitch damping, Cm/q̂ | −1.57 (−1.75) | −0.45 (−0.56) |
| yaw damping, Cn/r̂ | −0.013 (−0.013) | −0.002 (−0.002) |

All six criteria hold, hands up and on the bar. The bar halves the yaw
stiffness, and takes the pitch stiffness and damping to less than a third.

**The roll derivatives are small**, and that is the arc, not a fault. The
default wing's arc has a radius of 5.93 m, so its centre lies near the centre
of mass. A lift square to an arc points through the arc's centre, so it has
almost no moment there. Rolling about that point turns the arc along itself,
and no strip's angle of attack changes much. In sideslip, the arc's side force
on its own would roll the wing by roughly Cl/β = −0.4. The strips' lift, pointing
through the arc's centre about 0.7 m above the centre of mass, takes most of
that back.

**For comparison, the V3 kite.** The paper trims it at 7.47° with Cm/α =
−2.71 about its tow point. That figure is on the kite's own area and chord, so
only its sign is comparable here.

## 3. The modes

**The method.**

- **Linearisation.** The flight model's equations of motion are differenced
  centrally at the trim (`stabilityJacobian`). The states are the karabiners'
  velocity, the rotation, and the roll and pitch angles: u, v, w, p, q, r, φ
  and θ. Heading and position do not feed back, so they are left out.
- **Two blocks.** The trim is symmetric, so the Jacobian splits into a
  longitudinal block (u, w, q, θ) and a lateral one (v, p, r, φ). The coupling
  between them is 5e-12 of the largest entry hands up, and 1e-10 on the bar.
- **Eigenvalues.** Each block's eigenvalues are found by the classic sequence:
  Parlett and Reinsch's balancing, reduction to Hessenberg form, then Francis's
  double-shift QR. They are checked against two cases:
  - a seventh-degree polynomial's companion matrix, whose roots come back to
    1e-9;
  - an 8 × 8 matrix similar to known blocks.
- **Eigenvectors.** These come by inverse iteration and satisfy A v = λ v to
  1e-8.
- **Naming.** A mode is named by what moves in it:
  - **pitch:** the angle of attack;
  - **phugoid:** speed and pitch angle trading;
  - **Dutch roll:** yaw with sideslip;
  - **roll:** bank;
  - **spiral:** the slow real lateral mode;
  - **subsidence:** any other mode that only dies away.

**A check against the nonlinear model.** Pushed a little from trim, the
nonlinear model follows the linear one. Its pitch and yaw rates stay within 5%
of their peak over 6 s (a unit test).

**The default wing:**

| mode | hands up | on the bar, 90 mm |
| --- | --- | --- |
| pitch | period 2.60 s, damping 0.69, halves in 0.31 s | no oscillation: halves in 0.19 s, and in 0.63 s with the speed |
| phugoid | 6.67 s, 0.07, halves in 10.5 s | 6.42 s, −0.003: doubles in 230 s |
| Dutch roll | 2.41 s, 0.23, halves in 1.1 s | 2.82 s, 0.14, halves in 2.3 s |
| roll | 6.68 s, 0.15, halves in 4.8 s | 7.30 s, 0.26, halves in 3.0 s |

The pitch oscillation is quick and well damped. The phugoid is slow and light,
and on the bar it is neutral: it doubles only over minutes, which a pilot does
not notice. Laterally, both modes oscillate:

- a Dutch roll of yaw and sideslip, period 2.4 s;
- a slower bank oscillation, period 6.7 s, with roll, yaw and bank all
  moving together.

No real spiral root appears. On this wing, the slow lateral motion is that
lightly damped oscillation.

These modes belong to a rigid canopy with six degrees of freedom, so the pilot
cannot swing. No measured paraglider modes were found to compare them with.

## 4. The hang point

The paper's §6.3 moves a kite's tow point and reads the trim, the efficiency
and the three static derivatives. **Hang point** does the same with the
karabiners, on a grid:

- seven positions fore and aft, ±0.3 m (±11.5% of the central chord);
- five heights, ±1 m (longer or shorter lines).

At each point the glider is trimmed and judged. Its wake is laid again where
the trim moves by more than a degree. The 35 points take about a second.

**The default wing:**

| hang point aft, m | −0.3 | −0.2 | −0.1 | 0 | +0.1 | +0.2 | +0.3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| glide | 7.57 | 8.14 | 8.46 | 8.61 | 8.62 | 8.53 | 8.38 |
| canopy's angle | 1.0° | 2.6° | 4.0° | 5.3° | 6.6° | 7.9° | 9.2° |
| pitch, Cm/α | −0.70 | −0.93 | −1.16 | −1.37 | −1.56 | −1.70 | −1.79 |
| yaw, Cn/β | +0.035 | +0.042 | +0.049 | +0.055 | +0.060 | +0.064 | +0.068 |

Raising the hang point (shorter lines) weakens the roll stiffness steadily.
From a metre lower to a metre higher, Cl/β goes −0.135, −0.106, −0.077, −0.048,
−0.018. This is the paper's finding for a kite: "raising the tow point can
eliminate the restoring roll moment" (a unit test).

- **Fore and aft.** The glide peaks 0.1 m aft of the design (8.63, a metre
  lower).
- **One cell goes amber.** 0.3 m forward on half-metre-shorter lines, the
  phugoid diverges.
- **One cell does not glide.** 0.3 m forward on a metre-shorter line, there is
  no steady glide.

The kite and the glider differ here. A kite whose tow point moves aft gains
efficiency but loses pitch and then yaw stability. A glider hung aft gains
pitch and yaw stiffness, because its trim's lift grows with the angle. Its
glide falls only slowly past the best.

## 5. The planform

The paper's §6.2 stretches its kite to a quarter more aspect ratio, and
deepens its anhedral by a quarter, and reads the efficiency and the
derivatives. **Planform** does the same for the design, on a grid of twenty:

- five flat aspect ratios, 0.85 to 1.45 times the design's, at its flat area:
  the span stretched by the root of the factor, the chords and the sweep
  shrunk by it;
- four arcs, the design's projected span over flat span −0.08, −0.04, ±0 and
  +0.04. A circle's projected ratio is that ratio. An ellipse or a bionic lobe
  is deepened by more arrow at the same width, and flattened past its width
  by a wider one at the least arrow that carries the span
  (`lobeWithProjectedRatio`).

**The lines go with the span.** The makers' line heights are a fixed fraction
of the span across aspect ratios as well as across sizes: 0.60 of it on the
PHI Allegro light (AR 6.0), 0.62 on the BGD Lynx 2 (6.2) and the Skywalk SAGE
(6.4), and 0.63 on the default wing (4.7) (`scaling.md`). Held at the design's
length instead, the lines of the longer spans grow short against their arcs,
and the roll stiffness falls with the aspect ratio for that reason alone.

Each variant is built as the design is: its panels, its line plan, and its
hang point from the balance, which trims it at the design's angle on its own
polar. Then it is flown to its trim and judged. Everything else is the
design's: the section, the number of cells, the masses and the line drag's
coefficient. The twenty take about two seconds. The design's own cell is the
Flight tab's trim to the last digit, and the design on show is untouched
(an interface test).

**The default wing**, glide and roll stiffness Cl/β:

| flat AR \ projected span ratio | 0.80 | 0.84 | 0.88 | 0.92 |
| --- | --- | --- | --- | --- |
| 4.0 | 7.49, −0.252 | 7.72, −0.154 | 7.95, −0.074 | 8.18, −0.012 |
| 4.7 | 8.12, −0.280 | 8.36, −0.169 | **8.61, −0.077** | 8.86, −0.006 |
| 5.4 | 8.68, −0.302 | 8.94, −0.180 | 9.21, −0.079 | 9.47, −0.0001 |
| 6.1 | 9.19, −0.321 | 9.47, −0.189 | 9.75, −0.080 | 10.03, +0.005 |
| 6.8 | 9.66, −0.337 | 9.95, −0.196 | 10.25, −0.081 | 10.55, +0.010 |

- **The glide** rises with the aspect ratio, by 0.66 to 0.50 a step of 15%
  at the design's arc, as the induced drag falls. It rises with a flatter arc, about 0.25 for each 0.04,
  as the arc costs less lift. The paper found both for a kite's efficiency.
- **The roll stiffness is the arc's.** With the lines going with the span,
  Cl/β hardly moves with the aspect ratio. It is −0.25 to −0.34 at 0.80 and
  nearly nothing at 0.92, where it turns unstable above an aspect ratio of 6
  (the two red cells).
- **The yaw stiffness grows with the aspect ratio**: Cn/β 0.047 to 0.070 at
  the design's arc. This is the paper's finding for a kite, "greater yaw
  static stability" with a larger aspect ratio. It falls as the arc flattens.
- **The Dutch roll is the deep arc's price at a low aspect ratio.** At AR 4.0
  and 0.80 its damping ratio is −0.016 (the amber cell): a strong roll
  stiffness against a weak yaw stiffness, the classic trade. It is 0.067 at
  the design's aspect ratio and 0.27 at 6.8.
- **The phugoid's damping falls as the glide rises**, 0.10 to 0.04.
  Lanchester's phugoid, whose damping ratio is about 1/(√2 L/D), gives 0.094
  to 0.067.
- **The pitch stiffness per chord grows with the aspect ratio**, Cm/α −0.96
  to −2.64 across the grid, as the chord shrinks under lines that grow with
  the span.

**Where real wings sit.** The eleven families in the reference set whose
makers publish a projected span, or as Niviuk do a projected aspect ratio,
have flat aspect ratios of 4.6 to 6.9 and projected span ratios of 0.77 to
0.82: the Geo 7 deepest at 0.770, the Skin 4 P flattest at 0.824. The map
draws ten of them as rings (the Geo 7 falls off its deep side). They are
their own planforms, not this one stretched. **The default wing, at 0.88, is
flatter than every one of them.** That is why its roll stiffness, −0.077, is
small (section 2). On a real wing's arc, 0.80, this model gives it −0.280,
with a glide of 8.12 rather than 8.61.

The paper's other planform variable, the anhedral, is this map's arc. Its
kite turned better with more anhedral. For a glider the arc's side force
shows here as the roll stiffness; the turn itself is the flight model's
weakest part (`flight.md`).

## 6. Against Belloc's wind tunnel

**The model and its data.**

- **The wing.** Belloc (2015) tested a rigid 1/8 model of a paraglider wing at
  40 m/s, Re 0.92 million on its 0.35 m central chord. The wing has an
  elliptical arc and NACA 23015 sections, with 3° of wash-in at the tips.
  Heatwole's thesis reproduces the geometry, and the tool builds it rib by rib
  as it builds its own wings (`data/reference/belloc-2015-model.tsv`).
  - Areas: flat 0.4467 m², projected 0.3915 m², against Belloc's 0.4462 and
    0.3919 (1/64 of the full-scale wing's).
- **The measurements.** These come in two sets, in
  `data/reference/belloc-2015-tunnel.tsv`:
  - **fairaero:** lift and drag against the angle, as distributed with the
    data the kite paper points to.
  - **figures:** all six coefficients against the angle and the sideslip,
    taken from the vector paths of Heatwole's figures.
- **The two sets are one test.** At equal lift their drag agrees within
  0.0012. The figures' angle is the other set's plus 1.70° per unit of lift,
  rms 0.05°. A shift in proportion to the lift, with the drag untouched, is
  what correcting the angle for the load would give: the model stood on a 1 m
  rod. The figures' angle is the one used here.
- **The sections.** mfoil solves NACA 23015 at the model's Reynolds numbers,
  0.24 to 1.06 million (`belloc-2015-naca23015.tsv`).

**Two of the tool's routes are run on the wing:**

- the slices': the lattice coupled to the polars at each slice's own Reynolds
  number;
- the flight model's: the forces the derivatives are made of.

Moments are about Belloc's point T1. It sits a quarter of the central chord
back from the leading edge and 1 m below it, which is where a pilot hangs at
full scale.

**The results**, against the tunnel and Heatwole's three models of the same
wing. "Lifting line" is this tool's 1.14 force direction; "3/4 chord" is the
one 1.13 used and the paper keeps (both explained in section 7):

| | tunnel | slices (lifting line) | flight (lifting line) | flight (3/4 chord) | AVL | XFLR5 | NLLT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lift slope, a degree, 0 to 10° | 0.0510 | 0.0645 | 0.0648 | 0.0647 | 0.0605 | 0.0595 | 0.0583 |
| zero-lift angle | −0.85° | −1.16° | | | −1.62° | −1.63° | −1.84° |
| drag at no lift | 0.0156 | 0.0075 | 0.0073 | 0.0068 | | | |
| drag's rise, per CL² | 0.0734 | 0.0678 | 0.0683 | 0.0896 | | | |
| Cm/α about T1, a radian | −1.16 | −1.59 | −1.60 | −1.44 | −1.61 | | −1.49 |
| CY/β at 5° (10°) | −0.746 (−0.725) | | −0.704 (−0.760) | | −0.617 (−0.565) | | −0.738 (−0.703) |
| Cl/β about T1 at 5° (10°) | −0.667 (−0.731) | | −0.442 (−0.517) | | −0.477 (−0.578) | | −0.527 (−0.554) |
| Cn/β about T1 at 5° (10°) | +0.320 (+0.499) | | +0.315 (+0.542) | | +0.305 (+0.485) | | +0.346 (+0.534) |

Coefficients are on Belloc's reference: 0.444 m², with all three moments on
0.35 m.

**What agrees:**

- The side force and the yaw stiffness match the tunnel within 10%, at both
  angles.
- The drag's rise with lift matches within 8%, so the lattice's induced drag
  on an arc is right.
- The lift slope and the pitch stiffness are AVL's, within 7% and 1%.

**What does not:**

- **The lift slope is 26% steeper than the tunnel's.** Heatwole found the
  same of AVL, XFLR5 and his lifting line (19%, 17% and 14% steep). He called
  it "difficult to explain", and neither the data's author nor the lifting
  line's had an explanation; nor does this comparison. The tunnel's walls were
  not corrected for. This tool's slope is the steepest of the four because mfoil's
  NACA 23015 steepens between 4° and 8° at these Reynolds numbers.
- **The roll stiffness is 30% weak**, as AVL's and the lifting line's are,
  though the sign is right.
- **The drag at no lift is half the tunnel's.** The sections are smooth
  two-dimensional polars. The model's 0.0156 holds what they do not: its
  surface, its tips, perhaps the rod's tare. A paraglider's own polar carries
  that drag separately.

The unit suite holds the tool to all of this, in its "Belloc's wind-tunnel
paraglider" tests.

## 7. Where a strip's force points

Running Belloc's wing found that both of the tool's routes took a strip's
force in the wrong direction.

**The slices (1.12).** They took the Kutta–Joukowski force on the velocity at
the three-quarter chord, where the lattice sets its boundary condition. That
velocity includes the strip's own bound vortex, which turns the flow there to
lie along the plate. So the force came out square to the plate rather than to
the flow: tilted back by the plate's angle, cl/2π, and a few per cent short.
About T1, Belloc's pitching moment then rose with the angle (+0.16 a radian),
where the tunnel's falls.

**The flight model (1.13).** It took the direction from the angle it reads its
section at, the three-quarter chord's. The trailing legs start close behind
that point, so the downwash there is larger than at the lifting line. That
tilt put the induced drag a third above the Trefftz plane's, on Belloc's wing
and on the default one.

**Now, both** take the direction square to the flow at the lifting line. That
is the strip's geometric angle less its induced angle, and the induced angle
is half the Trefftz plane's wash on it, as Prandtl's lifting line has it
(`trefftzInfluence`). So the strips' induced drag adds up to the Trefftz
plane's, to 0.6% on the slices and 2% in flight (unit tests). The section's
coefficients are still read at the coupling's angle.

The Vortex Step Method takes its direction from the quarter chord in the same
way, after Gaunaa, Li and Pirrung (2026). Its solver notes that the
three-quarter chord's directions "overestimate the induced drag by 20–40%
against the Trefftz plane".

The kite paper chose the other way. In its appendix B it compared the two on
the V3 kite and on Belloc's wing, and kept the three-quarter chord because its
drag came closer to the tunnels'. Its authors wrote that "the reason why the
correction degrades, rather than improves, the drag prediction accuracy is not
yet understood". The table above shows why on Belloc's wing:

- The three-quarter chord's total drag is closer only because its excess
  induced drag, 0.0896 per CL² against the tunnel's 0.0734, stands in for the
  0.008 the smooth sections lack at no lift.
- The lifting line's direction gets the drag's rise with lift and AVL's pitch
  stiffness.

A paraglider's polar counts its parasitic drag on its own: pilot, lines and
canopy. And for a canopy hung 7 m above its pilot, the force's direction is
what sets the trim. So the tool takes the lifting line's direction.

**What it moved on the default wing:**

| | 1.13 | 1.14 |
| --- | --- | --- |
| hands-up trim | 32.9 km/h, glide 6.97, canopy 7.4° | 35.8 km/h, glide 8.61, canopy 5.3° |
| the balance's, for comparison | 35.2 km/h, glide 8.10, 5° | the same |
| bar | 90 of 150 mm, 42.6 km/h | 90 of 150 mm, 46.9 km/h |
| both brakes, steady stall | about 55 cm | 70 cm |
| EN 926-2 symmetric pull over 5 s, departs at | 52 cm | 88 cm |
| slices at 5°: CL, Cm | 0.640, −0.122 | 0.652, −0.100 |

The trim that 1.13 found at 7.4°, and called a finding about the hang point,
was this error. The flight model now trims 0.3° above the balance, whose hang
point was chosen for 5°.

Its glide, 8.61, is a smooth canopy's. The flight's drag is mfoil's for the
sealed section. The balance's polar counts 0.0107 of profile drag at that lift
against mfoil's 0.0069, and on that figure the flight's glide would be about
8.2.

The plain lattice that the polar's arc factors use (`vortexLattice`) still
takes its force from the three-quarter chord. There it enters only as the arched
wing's lift over the flat one's, where the error nearly cancels: 0.804 against
0.809. It is on the roadmap.

## 8. Not covered

- **Quasi-steady.** The derivatives and the modes come from the same rigid,
  quasi-steady model as the flight. They include no circulation lag, no
  canopy deformation and no pilot swing. The paper asks for unsteady
  aerodynamics in a modal analysis, and this one has only the apparent mass.
- **A frozen wake.** The lattice's wake lies along the trim. In sideslip and
  rotation it stays there, which a small perturbation allows.
- **One Reynolds number in flight**, as in `flight.md`.
- **No measured modes.** No measured paraglider modes were found to compare
  with.

## 9. References

- Poland, J. A. W., Masure, C., Cayon, O., and Schmehl, R. (2026).
  Computational aerodynamics for leading-edge inflatable kite design. *Wind
  Energy Science* 11, 4147–4178. doi:10.5194/wes-11-4147-2026 (CC BY 4.0).
  §5.5 for the stability derivatives, §6.2 for the planform, §6.3 for the tow
  point, appendix B for the force's direction.
- The Vortex Step Method, github.com/awegroup/Vortex-Step-Method (MIT licence).
  Its solver's force law and its stability-derivative code, read for this
  release.
- Belloc, H. (2015). Wind tunnel investigation of a rigid paraglider
  reference wing. *Journal of Aircraft* 52(2), 703–708.
  doi:10.2514/1.C032513.
- Heatwole, P. F. (2022). *Parametric Paraglider Modeling.* MSc thesis
  (CC BY 4.0), chapter 9: Belloc's geometry and data, and his AVL, XFLR5
  and lifting-line models of the wing. Source files at
  github.com/pfheatwole/thesis.
- fairaero/Belloc-validation-data, github.com: Belloc's lift and drag, as the
  kite paper's data availability gives them.
- Gaunaa, M., Li, A., and Pirrung, G. (2026), TORQUE: as cited by the Vortex
  Step Method's solver for the quarter-chord direction of the force.
- Barrows, T. M. (2002), and the rest, as in `flight.md`.
