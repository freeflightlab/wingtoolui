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

**Why the lift coefficient was too high: the wing was flat.** The solve took
the lifting line's flat wing and the handbook's flat finite-span factor. In
its arc — the handbook's ellipse through the Geo 7's published projected
span, 0.77 of its flat one, as the picker builds it — the vortex lattice
gives it seven tenths of the flat wing's lift slope (`arcFactors`,
`docs/environment-and-aero.md` section 6), and the same assumed 6° trims it
at CL 0.59:

| wing | all-up | flat, 6° | in its arc, 6° | certificate |
| --- | --- | --- | --- | --- |
| Geo 7 XS | 55 kg | 24.9 km/h | 29.1 km/h | more than 30 |
| Geo 7 XS | 70 kg | 28.1 km/h | 32.8 km/h | more than 30 |
| Geo 7 L | 95 kg | 28.7 km/h | 33.6 km/h | more than 30 |
| Geo 7 L | 115 kg | 31.6 km/h | 36.9 km/h | more than 30 |

Three of four above the certified 30 km/h, the lightest XS just under, at a
lift coefficient real wings trim at. Nothing was fitted to get there: the
arc is the published one, and the lattice is validated where its answers
are known. Its glide, on the handbook's line drag of 0.020, is 8.0.

## 4. Trimmed from the calage

That solve assumes the angle of attack, 6°, and finds where the risers must
hang for it; the trim lift coefficient follows from the assumed angle, not
from the wing. `trimFromCalage` runs it the other way round: it takes where
the risers hang and returns the angle the wing settles at.

No Geo 7's calage is published. Where built wings hang theirs is on file: the
three complete designs, 32.5, 33 and 36% of the central chord. At 34% the
four cases trim at CL 0.60 to 0.61 flat and 0.51 in the arc:

| wing | all-up | assumed 6°, flat | from 34%, flat | from 34%, in its arc | certificate |
| --- | --- | --- | --- | --- | --- |
| Geo 7 XS | 55 kg | 24.9 km/h | 28.7 km/h | 31.3 km/h | more than 30 |
| Geo 7 XS | 70 kg | 28.1 km/h | 32.3 km/h | 35.2 km/h | more than 30 |
| Geo 7 L | 95 kg | 28.7 km/h | 33.3 km/h | 36.0 km/h | more than 30 |
| Geo 7 L | 115 kg | 31.6 km/h | 36.5 km/h | 39.5 km/h | more than 30 |

In its arc all four are above the certified 30 km/h, and the certificate
bounds the calage: the XS at 55 kg trims above 30 only from a calage forward
of 37.1% — the range the built designs hang in. The sinks, 1.12 to 1.41 m/s
in the arc at 34%, are 0.1 to 0.3 above what a wing of this size does; the
NACA 4415 standing in for the Geo 7's unpublished section is the likeliest
part of that.

This section used to say "at a 42% calage the same four cases trim at CL
0.58 to 0.63, the range real wings use". They did only while the balance
counted the section's pitching moment twice (`docs/departures.md` §5);
counted once, 42% trims them at CL 0.79 to 0.82 flat, 24.9 km/h at the
lightest, and the 42% itself was a guess.

The interface trims from the calage too, when its balance is set to it: the
calage defaults to the design's own on an import, and the angle it gives is
shown beside the one the design declares. The tests that pin the flat
shortfall on the assumed angle — three of four cases below 30 km/h — still
run, so that work on it shows as movement rather than being absorbed
silently, and a second holds the wing in its arc to one of four.

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
