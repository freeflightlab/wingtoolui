# What a certification flight test actually tells a designer

EN 926-2 flight test reports, from Air Turquoise via para-test.com. Nine were
supplied covering the Tigra, Alta, Alpina 5, Geo 7 and Lynx 2 — three of those
families are already in the reference set.

## 1. They are mostly qualitative, and that is not a flaw

A report is a record of how a wing behaved when a test pilot provoked it:

> Dive forward 0° to 30° / Keeping course — **A**
> Spontaneous in less than 3 s — **A**
> 90° to 180° / Dive or roll angle 15° to 45° — **B**

There is **no polar**. No sink rate, no glide ratio, no speed at a given brake
position. Anyone hoping to calibrate an aerodynamic model against a
certificate will not find the numbers there.

That is not an oversight. The manoeuvres are flown by hand and what is being
recorded is a wing's passive response, which is a behaviour rather than a
measurement.

## 2. Four things in them are quantitative

| | |
| --- | --- |
| **all-up weight** | every wing is flown twice, at the low and high end of its certified range |
| **harness to risers** | measured on the harness used, 43–44 cm across these tests |
| **distance between risers** | 40 cm on the Geo 7 XS, 48 cm on the L |
| **speed bounds** | trim above 30 km/h, minimum below 25, control range above 10 |

The speeds are thresholds rather than values — "more than 30 km/h" — so they
bound a model rather than calibrate it. That turns out to be enough.

The riser separations are worth noting on their own: the tool defaults to
42 cm, and the measured values bracket it.

## 3. What the bounds settled

The tool had a **residual in minimum sink** it could not explain: 0.83 m/s at
the default cap of CL 0.9, where a real wing of that size does about 1.0 —
17% low. (This said 10%, which is what is left with the cap lowered to 0.75,
0.907 m/s, and not the gap at the 0.83 quoted beside it.) Two candidate causes had
already been ruled out by measurement — raising profile drag and modelling the
inflated shape both move sink toward reality and move glide *away* from it,
and the glide was already right at about 9.4.

`sink = V / (L/D)`. Glide right and sink low means the **speed** is low, and a
certificate fixes the speed without reference to anything in this project.

Run at the weights the wings were actually flown at:

| wing | all-up | trim speed | certificate |
| --- | --- | --- | --- |
| Geo 7 XS | 55 kg | 24.9 km/h | more than 30 |
| Geo 7 XS | 70 kg | 28.1 km/h | more than 30 |
| Geo 7 L | 95 kg | 28.7 km/h | more than 30 |
| Geo 7 L | 115 kg | 31.6 km/h | more than 30 |

**Short on three of four.** The mechanism is visible in the same solve: the
model trims at **CL 0.806**, where a real wing trims nearer 0.55 to 0.65. It
is flying too slowly because it is flying at too high a lift coefficient.

Bringing the speed up to the certified minimum, at the same glide, moves sink
from 0.73 to 0.88 m/s — most of the way to the 1.0 a wing of that size does.

## 4. What this does not do

It does not fix it in the solve this section ran. That solve assumes the angle
of attack, 6°, and finds where the risers must hang for it; the trim lift
coefficient follows from the assumed angle, not from the wing.

The core now has the solve the other way round. `trimFromCalage` takes where
the risers hang and returns the angle the wing settles at. At a 42% calage the
same four cases trim at CL 0.58 to 0.63, the range real wings use:

| wing | all-up | assumed 6° | from a 42% calage | sink |
| --- | --- | --- | --- | --- |
| Geo 7 XS | 55 kg | 24.9 km/h | 29.4 km/h | 0.92 m/s |
| Geo 7 XS | 70 kg | 28.1 km/h | 32.8 km/h | 1.02 m/s |
| Geo 7 L | 95 kg | 28.7 km/h | 32.6 km/h | 0.99 m/s |
| Geo 7 L | 115 kg | 31.6 km/h | 35.6 km/h | 1.08 m/s |

Three of four are then above the certified 30 km/h, and the sinks are the 1.0
a wing of that size does. The XS at its lightest is still under, at 29.4.

Neither solve is what the interface runs: its balance takes the typed angle
and coefficients, as the handbook's does. And the test that pins the
shortfall — three of four cases below 30 km/h on the assumed angle — still
runs the assumed angle, so that work on it shows as movement rather than
being absorbed silently.

## 5. On modelling collapse

The reports describe collapse behaviour qualitatively because that is what it
is. A collapse is aerodynamic force driving a deformation which changes the
aerodynamic force, and the geometry is a flexible membrane on flexible lines.
That is a coupled fluid–structure problem, and this project does not have a
credible route to it.

What a certificate does give is the **envelope**: a wing that passes flies at
these weights, at these speeds, with these riser geometries, and recovers
within these bounds. Checking a design against the envelope is achievable and
useful. Predicting where inside it a new design would land is not, and
claiming otherwise would be the least defensible thing in the tool.
