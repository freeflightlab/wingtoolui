# Operating environment and aerodynamics

Three separate models, with very different levels of trustworthiness. They are
kept apart deliberately so it is always clear which one an answer rests on.

| Layer | Model | Trust |
| --- | --- | --- |
| Atmosphere | U.S. Standard Atmosphere 1976 | **High** — a referenced standard, reproduced to 0.001% |
| 3D wing | Prandtl lifting line over the real planform and twist | **Good** — exact for the elliptical case, classical theory elsewhere |
| Section | Thin-airfoil theory + flat-plate friction correlation | **Low** — no boundary layer. Use XFOIL. |

---

## 1. Atmosphere

**U.S. Standard Atmosphere 1976**, identical to the ICAO standard atmosphere
and ISO 2533 up to 32 km, and defined to 86 km. One referenced model covers
the whole 0–50 km range asked for, rather than a patchwork.

Two things are easy to get wrong, and both are handled explicitly.

**Geopotential vs geometric altitude.** The layer table is defined in
geopotential altitude, which absorbs the variation of gravity with height so
the hydrostatic integral keeps a constant g0. People think in geometric
altitude. The two differ by **390 m at 50 km** — worth 5% in pressure: 79.8 Pa
at 50 km geometric, against 75.9 Pa at the height whose geopotential is 50 km.
Input is geometric; conversion is internal.

**Base pressures are derived, not transcribed.** Each layer's base pressure
comes from integrating the layer below. Hard-coding the published numbers
invites a transcription error that no test would catch, because the test would
be written from the same table. They are computed and then checked:

| Layer base | Derived | Published |
| --- | --- | --- |
| 0 km' | 1.013250e5 | 1.013250e5 |
| 11 km' | 2.263206e4 | 2.263206e4 |
| 20 km' | 5.474889e3 | 5.474889e3 |
| 32 km' | 8.680187e2 | 8.680187e2 |
| 47 km' | 1.109063e2 | 1.109063e2 |
| 51 km' | 6.693887e1 | 6.693887e1 |
| 71 km' | 3.956420e0 | 3.956420e0 |

States match the published table to better than 0.05% everywhere, and to
0.001% at 50 km. Sea-level speed of sound comes out at 340.294 m/s and the
mean free path at 66.3 nm, both matching the standard exactly.

A temperature offset changes density and the transport properties but **not**
pressure — a warm day does not move the pressure at altitude.

Gravity varies with altitude in the model, so required speed scales as
`sqrt(g/rho)`, not `1/sqrt(rho)`. At 10 km gravity is 0.31% below its
sea-level value, so the two scalings differ by half that, 0.16%, in speed.
Small, but it is real and the tests assert the correct form.

### Non-dimensional groups

Reynolds, Mach and Knudsen numbers all use the same reference chord, so they
are mutually consistent. They are reported with warnings attached, because
their job is to say whether the rest of the analysis is even applicable:

- **Kn > 0.001** — slip at the surface; **Kn > 0.01** — continuum aerodynamics
  no longer describes the flow.
- **M > 0.3** — compressibility matters, Prandtl-Glauert applied;
  **M > 0.8** — transonic, and both incompressible and Prandtl-Glauert fail.
- **Re < 200,000** — separation bubbles dominate and the drag correlation
  underestimates; **Re < 30,000** — the correlations mean nothing.

Also reported: equivalent airspeed, dynamic pressure, density ratio, and the
speed needed to hold the trim lift coefficient.

### What the numbers say about 50 km

A 25 m² wing at 85 kg, holding CL 0.6:

| Altitude | Density | Speed needed | Re | Mach |
| --- | --- | --- | --- | --- |
| 0 km | 1.225 | 9.5 m/s | 1.6e6 | 0.028 |
| 20 km | 8.9e-2 | 35 m/s | 5.5e5 | 0.119 |
| 35 km | 8.5e-3 | 114 m/s | 1.6e5 | 0.370 |
| 50 km | 1.0e-3 | **326 m/s** | 4.9e4 | **0.99** |

At 50 km the wing would have to fly at **Mach 0.99** to hold itself up, at a
Reynolds number below 50,000. Neither the section model nor the wing model
applies there, and the tool says so: where a flag says the models fail, the
readout and the balance table print a dash for the glide ratio and the sink,
and say why. The speed stays, because it is what the lift equation asks for
at that density. The atmosphere viewport draws the altitude at which the
required speed reaches Mach 1 as a hard line.

(This page said that before it was true. At 50 km the readout printed glide
8.48 and an L/D of 7.25 beside "incompressible and Prandtl-Glauert models both
fail"; the interface test now holds it to the sentence.)

This is the honest answer to "how does this wing perform at 50 km": it does
not fly there. The model is still useful for the 0–25 km range where
stratospheric parafoil work actually happens.

---

## 2. Lifting line

Prandtl's monoplane equation solved as a Fourier series over the **real**
planform and twist:

```
sum_n A_n sin(n t) [ 4b/(a0 c(t)) + n / sin t ] = alpha(t) - alpha_L0(t)
```

Odd harmonics only, collocated at N points, solved directly.

In the polar, this replaces a hand-typed Oswald factor: span loading, induced
drag and the Oswald factor come out as **results** of the planform, so changing
the taper changes the induced drag — e is 0.960 on the default wing, 0.933
with a 2.0 m tip and 0.978 with a 0.30 m one.

The interface's **balance** does not take it. That is the handbook's
equilibrium, and it still takes the typed "Oswald e" (0.90): typing 0.70 moves
the balance from glide 7.50 to 6.70 — 8.48 to 7.53 with the wing flown flat
(section 6) — and leaves the polar where it was. The balance table shows the
polar's factor beside the typed one so the two can be compared; the solve
that couples them, `solveEquilibriumFromWing`, is in the core and the suite,
not the interface (`docs/full-pipeline.md`, section 6).

The lifting line solves a **flat** wing: its span is straight and its
loading lies in one plane. Section 6 is what the arc does to it.

Validated against the exact elliptical case, where theory gives e = 1 and
`CL_alpha = a0/(1 + a0/(pi AR))`:

| AR | Oswald factor | CL error vs exact |
| --- | --- | --- |
| 4 | 1.000000 | 0.002% |
| 6 | 1.000000 | 0.002% |
| 8 | 1.000000 | 0.002% |
| 12 | 1.000000 | 0.002% |

A rectangular wing of AR 8 comes out at e = 0.937, in the expected range.
Washout correctly unloads the tip and costs total lift.

---

## 3. Section aerodynamics — and why to use XFOIL

**Thin-airfoil theory** gives the zero-lift angle and the pitching moment from
the camber line, exactly, for a thin section:

```
alpha_L0 = -(1/pi) integral (dyc/dx)(cos t - 1) dt
Cm_c/4   =  (pi/4)(A2 - A1) = (1/2) integral (dyc/dx)(cos 2t - cos t) dt
```

Note the **1/2** on the moment, not 1/4 — the `pi/4` prefactor multiplies
coefficients that each already carry a `2/pi`. This was wrong in a first
draft and produced exactly half the correct moment. Checked against the
standard worked example for NACA 2412, which gives alpha_L0 = -2.07 deg and
Cm_c/4 = -0.0531.

Thin-airfoil theory reliably **overpredicts** the moment for a real section:
NACA 4412 measures about -0.093 against a theoretical -0.106. Treat it as a
bound.

**The drag model is the weak link.** Flat-plate skin friction with a form
factor and a crude laminar run. It has no boundary layer, and therefore no
separation bubble — which is exactly what governs a paraglider section at the
Reynolds numbers it flies. It is a floor to design against, never a
prediction, and everything it touches is tagged `source: 'estimated'`.

### XFOIL bridge

XFOIL does have a boundary layer, and it cannot be honestly reimplemented in a
browser. So the tool writes the files XFOIL needs, **at the exact Reynolds and
Mach number the environment model computes**, and reads the polar back:

```
xfoil < xfoil_input.cmd > xfoil_output.out
```

The exported package is a normalised `.dat`, a command script, and a note
recording the conditions. Once a polar is imported the wing analysis uses
measured section data, `source` becomes `'xfoil'`, and only the camber theory
and the lifting line remain modelled.

An imported polar is checked against the current condition. A polar run at sea
level loads perfectly happily and silently gives the wrong answer at 20 km, so
a mismatch in Reynolds or Mach number is flagged.

**Ncrit** defaults to 7 here rather than XFOIL's wind-tunnel 9: free air over
sailcloth transitions earlier. If in doubt, run both and treat the spread as
the uncertainty band.

---

## 4. Reflex

Reflex turns the camber line back up near the trailing edge, trading lift for
a positive pitching moment — the section then resists pitching down instead of
tucking, which is why reflex profiles appear on paragliders at all.

Implemented by decomposing any section into a camber line and a thickness
distribution, modifying the camber aft of a chosen point, and recombining.
That works on an imported section as well as a generated one, and it **leaves
the thickness distribution untouched**, so structural depth and rib geometry
do not change.

On NACA 4412 with reflex from 65% chord:

| Reflex | alpha_L0 | Cm_c/4 |
| --- | --- | --- |
| 0.0% | -4.23 deg | -0.1055 |
| 0.5% | -3.44 deg | -0.0896 |
| 1.0% | -2.65 deg | -0.0737 |
| 1.5% | -1.86 deg | -0.0578 |
| 2.0% | -1.06 deg | -0.0419 |

3% reflex starting at 85% chord takes Cm0 positive (+0.074). The cost is
visible in the same table: the zero-lift angle moves toward zero, so the
section makes less lift at a given angle.

---

## 5. Minimum sink was outside the flyable envelope

The full-pipeline run reported minimum sink of 0.69 to 0.78 m/s on every wing
tested, against a real 0.95 to 1.15. Two of its four known problems were this.

The cause was not the drag. **The polar is very flat past about CL 1.0.** On
the suite's wing (12.25 m span, 2.86 m root, NACA 4415, 95 kg, sea level, alpha 2 to 14) sink falls
from 0.809 m/s at alpha 8 to 0.779 at alpha 12 and rises only to 0.782 at 14,
so an unconstrained search puts the minimum at **CL 1.30 and 23 km/h**. That is
not a flight state. A paraglider's usable lift coefficient is limited by pitch
stability and the collapse floor, not by where the aerofoil finally stalls,
and it loses the front of the wing long before it gets there. (The figures
here were 0.854, 0.820, CL 1.37 and 24 km/h, from a set-up not recorded.)

`maxUsableCL` caps the search, defaulting to 0.9. The reported minimum now
sits where a wing can actually be flown, and the best glide is unchanged —
asserted, because the glide was already right and a fix that moved it would
be trading one error for another.

### What it is not: a profile-drag error

The obvious next suspect was profile drag. The model uses flat-plate skin
friction with a form factor — right for a polished rigid section, optimistic
for fabric that is scalloped between ribs by the billow, seamed at every cell
and open at the nose. Published estimates put a ram-air wing at 1.3 to 2 times
a smooth section.

`surfaceFactor` makes that adjustable, defaulting to **1.0** so nothing
changes for anyone who does not set it. But it cannot be the explanation:

| surface factor | min sink, at the default cap of CL 0.9 | best glide |
| --- | --- | --- |
| 1.0 | 0.831 m/s | 9.41 |
| 2.0 | 0.945 m/s | 8.25 |

(The sink column was 0.809 and 0.920, which is what a cap of 1.0 gives.)

Doubling the profile drag moves sink toward the real figure and moves glide
**away** from it. The glide was already right at 9.4 against a real ~9.5, so
whatever is missing cannot be drag.

### The residual, stated rather than tuned away

Capped at CL 0.9 the model gives 0.83 m/s at 28 km/h. A real wing of this size
min-sinks at about 1.0 m/s at 33 to 35 km/h. Glide is right, so if sink is low
the speed must be low, and if the speed is low at a given wing loading the
lift coefficient must be too high — but lowering the cap further to 0.75 still
only reaches 0.907 m/s at 31 km/h.

So there is a residual of roughly 10% that the cap does not explain and that
profile drag demonstrably is not. It is left as a stated gap rather than
closed by fitting a factor to a number I have asserted from memory: the
project has no published sink polar to calibrate against, and inventing one
would make the model agree with me rather than with a wing.

The lift coefficient *was* too high at every angle, and not by a factor
anyone fitted: the polar's wing was flat. Section 6.

---

## 6. The wing in its arc

The lifting line and the handbook's balance describe a flat wing. A
paraglider flies bent through 50 to 90 degrees from its centre to its tips,
and three things follow that a flat wing has none of: a strip out on the arc
meets the flow at a slant, and lifts less for its angle; its lift is tilted
and the sideways parts cancel; and the wake it sheds is not a flat sheet.
The vortex lattice (`vlm.js`) solves the wing where it is. `arcFactors`
solves it twice — as built, and laid flat with the same chords, sweep and
twist — at two angles, and takes the ratios: of lift slope, of zero-lift
angle, and of induced drag at the same lift. The polar (`wingPolar`) and
the balance (`solveEquilibrium`) apply them to their flat wing when asked,
and the interface asks unless **Fly the wing in its arc** is unticked.

| wing | its tips | lift slope | induced drag at the same lift |
| --- | --- | --- | --- |
| the default | 50° | ×0.80 | ×1.19 |
| the gnuC2-23 | 74° | ×0.75 | ×1.23 |
| the Swoop2 | 74° | ×0.75 | ×1.23 |
| the Tuluaq-19 | 89° | ×0.77 | ×1.24 |
| the 55 published sizes, in the arcs the picker gives them | | ×0.72 to ×0.79 | |

A quarter of the lift gone is 15% more speed at the same angle. On this
section's wing (12.25 m, 95 kg), in an elliptical arc of projected-to-flat
span 0.82, the minimum sink at the cap rises from 0.83 to 0.95 m/s: most of
section 5's residual. Its best glide falls from 9.41 to 8.43 on the
handbook's line drag of 0.020, and is 9.69 on a modern lineset's 0.010. On
the Lynx 2 M, the one wing here with a published polar, in the arc solved to
its published projected area, every figure the derived lift curve gives
comes nearer the published one (`docs/validation.md` §2.7): trim 30.1 →
34.3 km/h against 39, best glide 12.2 → 10.8 against 11, minimum sink 0.69
→ 0.88 m/s against 1.0.

What the arc does not change is the section and the angle. The trim still
comes from an assumed angle of attack (or a typed Cz) unless it is solved
from the calage, and the section's lift curve is thin-aerofoil theory's.
