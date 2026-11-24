# Slices: the wing as its sections

The Slices tab steps along the span from tip to tip and shows each cell's
section in its own flow: the angle the rest of the wing leaves it at, its
Reynolds number, its pressure, its boundary layer and where it goes
turbulent. Every section is solved with a viscous panel method, and the
slices are put back together into the wing on the vortex lattice, so the
wing's lift, induced and profile drag and moment come from its sections and
not from a correlation.

Two flights: hands up, at the balance's own angle, and accelerated, at the
speed bar's last position the lift curve supports. The default wing takes
about 14 seconds in a browser.

`src/core/mfoil.js` is the section solver; `src/core/slices.js` puts the
slices together; the tab is `drawSliceView`, `drawSpanView` and
`buildSliceTools` in the interface.

---

## 1. The section solver: mfoil, ported

**Scirocco** (github.com/chrislupp/Scirocco, Apache-2.0) is a C++ port of
**mfoil**, Krzysztof J. Fidkowski's Python code (MIT licence), served from two
Docker images: an analysis server and a Kulfan-parameter geometry server.
It keeps mfoil's Python in its `mfoil/` folder as the reference its own
answers are checked against. This tool ports that Python to JavaScript, so
the method runs where the tool runs — in the page, offline. The licence
notice travels with the port, at the top of `mfoil.js`.

The method is Drela's, from XFOIL: a linear-vortex panel method with a
trailing-edge gap panel, an integral boundary layer with his closures for
skin friction, dissipation and the shape factors, a lag equation for the
turbulent shear stress, and e^N transition. mfoil's own contribution is the
coupling: one Newton iteration over the whole system, four unknowns at every
node — momentum and displacement thickness, the amplification factor or root
shear stress, and the edge speed.

The port keeps mfoil's steps, their order and its constants, and differs in
one place: the linear algebra of each Newton step. mfoil hands the whole
sparse system to a direct solver. The boundary-layer equations march, so the
port eliminates their unknowns first, by substitution, and solves a dense
system in the edge speeds alone; the step is the same one. Every step is
checked against the whole system and refined, and a dense solve of the whole
system takes over if it ever fails (`mfSolveGlob`). It solves NACA 2412 at
160 panels in 0.6 s against mfoil.py's 6.2 s on the same machine.

### Held to mfoil.py

`data/reference/mfoil-sections.tsv` holds mfoil.py's results, run from
Scirocco's copy (release 0.2.0, commit ffb09dc) with its own settings. The
port reproduces them to the rounding of the arithmetic:

| case | cl | cd | worst relative difference |
| --- | --- | --- | --- |
| NACA 2412, 2°, Re 1 million | 0.44915 | 0.005774 | 1e-13 |
| NACA 0012, 10°, Re 1 million | 1.07785 | 0.015156 | 9e-13 |
| NACA 4412, 4°, Re 200 000 | 0.90484 | 0.012628 | 9e-13 |
| NACA 2412, 2°, Mach 0.3 | 0.47017 | 0.005974 | 4e-13 |
| the tool's 4415, 3°, Re 1.5 million | 0.77548 | 0.006428 | 9e-13 |
| the tool's 4415, 4°, Re 800 000, 120 panels | 0.92378 | 0.008266 | 3e-13 |

The transition points agree to 1e-14 of the chord, and every intermediate —
the paneling, the inviscid vorticity, the wake, the source influence matrix,
the initial boundary layer, each Newton step — was compared on the way, to
1e-13. A warm start (mfoil's `initbl` off: the next angle from the last
boundary layer) agrees as well, and so do the failures: the NACA 4415 at 12°
and Re 1 million does not converge from cold in either, and a warm march to
13° stops on the same assertion — a negative shear stress — in both.

### What the port adds

- **The edge-speed residual.** mfoil judges convergence on the boundary
  layer's residual alone. A warm start that kept the last solution's edge
  speed — tried, to save iterations — converged on it to cl 0.75 where the
  answer is 0.47: the boundary layer satisfied, the coupling not. The port
  kept mfoil's warm start, and now also requires the edge-speed equations to
  hold at the end (`ueResidual`); at every genuine solution they hold to
  1e-15.
- **A tolerance mfoil can reach.** Scirocco's copy tightened mfoil's Newton
  tolerance to 1e-12 for its own reference runs. That is the rounding floor:
  NACA 0012 at 5° sat at 6e-12 for forty iterations and was reported
  unconverged. The port uses 1e-10, which converged solutions pass in one
  step more.
- **A slice that cycles.** At one angle a solve can cycle — a transition or
  stagnation node switching back and forth — and converge a hair either side.
  The default wing's centre slice did, at 2.5908°, converging at 2.5808° and
  2.6008°. Such a slice is solved 0.02° either side and read between, and the
  slice says so.

Three things in Scirocco's mfoil.py do not run: `set_coords` calls
`X.shape(1)`, so no section can be given by its points (the references here
set them directly, and so does the script this tool exports); the 5-digit
NACA branch calls a list; and the branch for a gap-free trailing edge, which
cannot be reached (see below), keeps the right-hand side of the equation it
replaces.

---

## 2. A sewn trailing edge

A paraglider's trailing edge is sewn shut, and mfoil needs a gap: it aims the
wake along the gap's normal and closes the circulation with a panel across
it. Two coincident end points give no direction, and mfoil.py stops on its
wake assertion for every section this tool builds.

The section is opened for analysis only, to a gap of 1e-4 of the chord, by a
thickness wedge growing linearly from the nose (XFOIL's `TGAP` does the like:
`mfoilOpenTrailingEdge`). What that costs was measured, on the tool's NACA
4415 at 3° and Re 1.5 million:

| gap, of the chord | 4e-3 | 2e-3 | 1e-3 | 5e-4 | 2.5e-4 | 1.25e-4 | 1e-5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cl | 0.8111 | 0.7950 | 0.7864 | 0.7812 | 0.7780 | 0.7760 | 0.7726 |
| cd | 0.00657 | 0.00650 | 0.00646 | 0.00644 | 0.00643 | 0.00643 | 0.00642 |

The lift falls with the gap to a sharp edge's 0.772, steepening near the end;
1e-4 sits 0.003 above it (0.4%), the drag within 0.1%. A sewn edge is not
sharp either: its seam and tape are a few millimetres, 1e-3 of a 2.6 m chord.

A sharp edge solved as such was tried first: the gap panel dropped, the wake
aimed along the edge's bisector, and the vorticity extrapolated across the
edge — the equation mfoil keeps for this case, with its right-hand side and
source terms zeroed as XFOIL zeroes them. It converged to different answers
at different panel counts (cl 0.43, 0.22 and 0.46 at 0°, at 120, 160 and 200
panels), with the upper surface separating at the trailing edge, which no
opened gap does. It was taken out, and the port kept mfoil's code as it is.

---

## 3. Against a wind tunnel

`data/reference/naca4415-osu.tsv` holds the Ohio State tunnel's clean NACA
4415 at Re 1.0 and 1.5 million (NREL/TP-442-6472, 1995). The tunnel's walls
were not corrected for, and its drag is the pressure drag alone, so the lift
and moment are what can be compared. At 1.5 million, from 0° to 6°:

| | the tunnel | mfoil |
| --- | --- | --- |
| lift at 0°, 2.1°, 4.2°, 6.0° | 0.51, 0.70, 0.89, 1.08 | 0.47, 0.70, 0.95, 1.13 |
| lift slope, a degree | 0.095 | 0.110 |
| quarter-chord moment | −0.096 to −0.083 | −0.103 to −0.099 |

The lift is within 0.06 and the moment within 0.016. The slope is a sixth
steeper than the tunnel's, which is what a panel method gives against a
tunnel uncorrected for its walls; above 8° mfoil overpredicts the lift, as
XFOIL-type methods do, and near 11° it stops converging.

---

## 4. Putting the slices together: the alpha method

The lattice knows the three-dimensional flow — the arc, the twist, the
downwash each strip puts on every other — and models each strip as a flat
plate. The section knows the viscous two-dimensional flow. Neither alone is
the wing.

The alpha method (van Dam; Gallay and Laurendeau, 2015) joins them. Each
strip's boundary condition is turned by a correction angle d; the strip's
lattice lift cl then puts its plate at cl / 2π to the local flow, so its
section meets that flow at

    alpha_eff = cl / (2 pi) - d

the geometric angle less the induced one. The section's own lift at that
angle is read, d is moved by the difference over 2π, and the lattice is
solved again. At the end each strip's lattice lift is its section's viscous
lift at the angle the whole wing leaves it; the induced drag is the Trefftz
plane's of that circulation; the profile drag and moment are the sections'.

The coupling asks for many lifts at many angles. A paraglider uses one
section across its span, so polars at a few Reynolds numbers — spaced by a
factor of two over the wing's range, each swept in angle a degree at a time
from its neighbour's boundary layer — give it every value by interpolation.
The speed is the one at which the lift equals the weight, and the Reynolds
numbers move with it. Then every slice is solved on its own at its angle and
Reynolds number, and its own lift goes back into the coupling (a defect
correction: the grid gives the slopes, the slices the values), until the
lattice's lift and the slices' agree within 0.003. On the default wing at
trim, one round takes the difference from 0.0102 to 0.0010.

Each strip's force is the circulation's on the flow across it, square to the
flow at its lifting line: the strip's geometric angle less its induced angle,
half the Trefftz plane's wash on it. The strips' induced drag then adds up to
the Trefftz plane's. Until 1.14 the force was taken on the velocity at the
three-quarter chord, which carries the strip's own bound vortex, so it came
out square to the plate rather than to the flow. Belloc's wind-tunnel
paraglider showed it (`stability.md`, sections 5 and 6).

What the tests hold it to (`slices` in the unit suite): on flat-plate
sections the coupled lattice is the lattice itself, to 1e-12 in circulation;
on a cambered section with a straight lift line each strip's lift is its
section's at its angle, to 1e-4; the lift equals the weight; the two halves
agree; and the induced drag is never below an elliptical wing's on the flat
span.

---

## 5. What it finds on the default wing

| | hands up, 5.00° | full bar, 150 mm, 0.29° |
| --- | --- | --- |
| speed | 36.60 km/h | 46.78 km/h |
| CL | 0.652 | 0.399 |
| CDi | 0.0341 | 0.0132 |
| CDp, the sections | 0.0069 | 0.0071 |
| Cm, central quarter chord | −0.100 | −0.100 |
| the wing alone, L/D | 15.9 | 19.6 |
| sections solved | 24 | 24 |

Coefficients on the flat area; the lines and the pilot are not in them. At
trim the tips meet the air at −0.1° and lift at 0.44, the centre at 2.6°
and 0.72; the most heavily loaded section is 2.4 m out, at 0.76. Reynolds
numbers run from 0.69 million at the tips to 1.67 at the centre. (Before
1.14's force direction the figures were 36.96 km/h, CL 0.640 and Cm −0.122.)

**Against the tool's own polar** at 5°: CL 0.702, CDi 0.0410, CDp 0.0107. The
lattice alone, flat plates at the angle less the section's zero-lift angle,
gives 0.643 by its own force recovery, which still takes the three-quarter
chord's velocity; on the free stream, as the slices now take it, 0.653 — the
slices' 0.652 less a little viscous lift. The polar's 8% more lift and 20%
more induced drag come from its lifting line: Prandtl's lifting line
overstates the lift slope at an aspect ratio of 4.7, which the lattice does
not. Its profile drag is the section estimate's, 0.0107 at that
lift against 0.0069 from mfoil for the smooth section. Nothing in the balance
was changed for this release: it is built and checked on the polar, and the
roadmap carries the question.

---

## 6. What a slice exports

| button | file |
| --- | --- |
| `.dat` | the section as the slices solve it, trailing edge opened, in XFOIL's format |
| XFOIL | a run of the slice on show: repanel, its Reynolds number, ncrit, its angle |
| mfoil | a Python script solving it with mfoil.py, the points set directly |
| Scirocco | what Scirocco's analysis server takes for it |
| All slices | every slice in a table: station, chord, Reynolds number, angle, cl, cd, cm, transition |

The Scirocco file follows the server's own source
(`scirocco/src/philote/philote_discipline.cpp`): the options it is set up
with — the section's coordinates and the panel count — and the inputs `x`
(the nodes' x, then their z), `alpha` in degrees, `Re` and `Ma`; its outputs
are cl, cd and cm. A client sends these over gRPC to port 50051. The
containers were not run for this release — this environment has no Docker —
so the file is written to the server's source and has not been sent to one.

---

## 7. Not covered

- **Symmetric flight only.** The slices are solved on one half and mirrored;
  the brakes, which are not symmetric, come with the flight simulation.
- **The section is closed and smooth.** The cell openings at the nose, the
  cloth's porosity, the billow between ribs and the seams are not in it;
  transition is the tool's `nCrit`, 7 by default.
- **Near the stall** mfoil can stop converging. Such a point is left out of
  the grid and flagged on a slice, never passed off as a result, and nothing
  past the stall is modelled.
- **The polar is not the slices'.** The balance, speed bar and every figure
  elsewhere still fly the lifting-line polar (section 5).
