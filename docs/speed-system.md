# Risers, the speed system and accelerated flight

Everything before this treated the wing as flying at one attitude. It does
not. Pushing the speedbar shortens the front risers more than the rear ones,
rotating the wing nose-down and trading sink for speed — the largest change a
pilot makes to the geometry in flight, and previously unmodelled.

Covers handbook chapter 9, and LEP sections 28 (calage variation) and 33
(detailed risers).

**Where it is.** Everything on this page is in the core (`risers.js`) and held
by the suite. The interface does not run it: its risers are the line plan's
straps, and there is no speed bar, trimmer or accelerated polar to set or
read there yet.

---

## 1. The geometry

The risers hang from one karabiner. The A row attaches near the nose, the rear
row well aft. Shortening A by more than C tips the chord forward by

```
Δα = atan( (dA − dC) / ((xC − xA) × chord) )
```

The denominator is the lever the system works against: a wing whose rear row
sits further aft needs more travel for the same angle change, which the tests
pin directly.

This is a statement about rigging, not aerodynamics. What it produces — a new
angle of attack — goes to the existing equilibrium solver, which already turns
an angle into a speed and a glide ratio.

**Why the brakes move too.** The brake line runs through a pulley on a riser.
When that riser shortens the pulley descends and the brake goes slack, so the
handle has further to travel before anything happens. Mounting the pulley on
the rearmost riser — the one that takes no travel — is why that is where it
usually goes; on a moving riser a 180 mm bar puts 90 mm of slack in the brake,
or 180 mm if the line is rove through and back. This is the reason brake
travel compensation exists.

---

## 2. A guard that turned nonsense into a validation

Speed goes as **1/√Cz**, so the polar is most sensitive to the lift
coefficient exactly where the lift coefficient is least trustworthy.

A linear lift slope fitted around trim, run down through eight degrees of bar,
reaches Cz ≈ 0.10. The solver, asked no questions, duly reported a paraglider
doing **99 km/h**. No paraglider flies at Cz 0.1; a wing at full bar sits
nearer 0.35, and below about 0.25 the linear fit has left the range any
section polar supports.

Rows outside `czRange` are now flagged rather than dropped, and the summary
reports the fastest point the lift model actually supports alongside the end
of the bar. The same run then gives **59.6 km/h** — against a published 58.

The lesson generalises: the failure was not the solver but an input used
outside its evidence, and it looked like an answer.

---

## 3. Validation against a published spec sheet

BGD's Lynx 2 M, flown at 85 kg all-up:

| quantity | published | computed | error |
| --- | --- | --- | --- |
| trim speed | 39 km/h | 37.3 | −4.4% |
| top speed | 58 km/h | 59.6 | +2.8% |
| best glide | 11 | 11.2 | +2% |
| minimum sink | 1.0 m/s | 0.92 | −8% |

Four independent numbers from one manufacturer's spec sheet, none used in
building the model.

Honest caveats: the lift slope and the chordwise anchor positions were chosen,
not measured, and both matter. The top speed figure is the fastest *supported*
point, not the end of the bar. And BGD does not publish its speedway travel,
so 180 mm is an assumption — which is why the module also runs the calculation
backwards.

**Back-solving travel.** Manufacturers publish trim and top speeds far more
often than travel, so `travelForSpeedRange` inverts the polar: reaching the
published 58 km/h needs **122 mm** of travel and **5.9°** of angle change.
Both sit inside the range real systems use — PHI quotes 150–180 mm — which is
a consistency check on the whole chain rather than a coincidence.

---

## 4. Validated against a published speed system

Skywalk's SAGE Pro Guide gives every riser's length at trim **and** at full
bar — the only source here that states a speed system's geometry outright
rather than implying it. Sizes 75 and 85:

| riser | trim | accelerated | shortening | share |
| --- | --- | --- | --- | --- |
| A | 520 mm | 370 mm | 150 mm | 1.000 |
| A2 | 520 mm | 450 mm | 70 mm | **0.467** |
| B | 520 mm | 520 mm | 0 mm | 0.000 |

Two things fall out.

**The stated speedbar travel is the front riser's shortening**, exactly, on
all five sizes — 150 mm on the two small sizes, 170 mm on the three large.
That is the interpretation `travelMM` assumes, and it is now confirmed rather
than assumed.

**The default share is close.** Full travel on the front riser falling
linearly to none at the rear was invented, not measured; it gives 0.500 for the
middle riser where the SAGE measures **0.467**, a 7% difference. The rear riser
does not move at all, as modelled.

---

## 5. Hardware steps, it does not scale

PHI's ALLEGRO light runs 570 mm risers with 150 mm travel on its two smallest
sizes and 600/180 on the other four, across a family whose spans scale
smoothly by 18%. Hardware comes in discrete sizes, so a scaling law is the
wrong shape entirely — `RISER_HARDWARE` is a table, and `hardwareForSize`
looks up the step.

---

## 6. The lift curve, derived rather than fitted

`czAt` was the last hand-fed quantity in the flight model, and the one the
answer is most sensitive to. Everything needed to replace it already existed:
`estimateSectionPolar` gives the section's lift curve and where it stalls,
`liftingLine` corrects for finite span and non-uniform loading, and
`wingPolar` runs both while iterating speed and Reynolds to consistency.
`liftModelFromWing` wires them to the speed system, so the chain runs geometry
in, speed range out.

The second benefit matters as much as the first. The hand-fed version needed a
hand-set `czRange` — two magic numbers chosen from experience — to stop it
extrapolating into nonsense. A derived curve knows where it stalls and where
it was evaluated, so most of the validity range falls out of the same
calculation.

### But the floor does not

Derived from the polar alone, the usable Cz range came out as
**[0.064, 1.627]**, and the accelerated polar duly ran to **87 km/h** on a
wing that does 58.

The arithmetic is right. A rigid wing *can* fly at Cz 0.06. A paraglider
cannot: it is a pressurised fabric structure held open by air entering its
intakes, and the angle of attack that produces a very low lift coefficient is
at or below the point where the leading edge stops being pressurised and the
wing folds. That is the frontal-collapse boundary — **structural, not
aerodynamic** — and nothing in a section polar knows about it.

So the upper bound of the range comes from the stall, and the lower bound is
stated separately as `minFlyingCz`, because it comes from somewhere else.

### Which makes the floor the dominant uncertainty

It cannot be derived here: it depends on intake design, internal pressure and
rib support, none of which this project models. And it *governs* the predicted
top speed — 4.8 km/h per 0.05 of assumed floor on this wing.

So the inference runs the other way. `collapseFloorForTopSpeed` takes a
published top speed and reports the Cz the wing must still be flying at:

| | |
| --- | --- |
| implied Cz at 58 km/h | **0.307** |
| reached at | 75% bar, α −0.5° |
| assumed floor | 0.35 |
| sensitivity | 4.8 km/h per 0.05 |
| verdict | published speed implies a **lower** floor than assumed |

0.307 is a physically sensible collapse threshold, and it is a number a
designer can compare against other wings and against a prototype. The verdict
names the disagreement rather than absorbing it into a fitted constant.

---

## 7. Trimmers

A speedbar shortens the **front** risers. A trimmer lengthens the **rear**
ones. Both tip the wing nose-down and both trade angle of attack for speed,
but they are not the same control: a bar is held and releases to trim, while a
trimmer stays where it is put. That is why paramotor and tandem wings carry
them and most solo free-flight wings do not.

### They add in the shortening, not in the angle

Both act on the same lever — the chordwise distance between front and rear
anchors — from opposite ends, so the shortenings add:

```
Δα = atan( (dA + dT) / ((x_rear − x_front) · chord) )
```

The *angles* therefore do not quite add, because the arctangent is not linear:

| bar | trim | bar alone | trim alone | sum | combined |
| --- | --- | --- | --- | --- | --- |
| 1.0 | 0.0 | −8.70° | — | −8.70° | −8.70° |
| 0.0 | 1.0 | — | −4.38° | −4.38° | −4.38° |
| 1.0 | 1.0 | −8.70° | −4.38° | −13.08° | **−12.93°** |

0.15° of shortfall at full both — small, real, and in the conservative
direction.

### The case worth seeing

A pilot can apply both at once, and **the combination can leave the flyable
envelope when neither control alone does.** On a wing with 120 mm of bar and
60 mm of trimmer:

| setting | α | Cz | flyable |
| --- | --- | --- | --- |
| full bar, trimmers closed | 0.2° | 0.37 | yes |
| trimmers open, no bar | 3.1° | 0.61 | yes |
| both | −2.7° | 0.13 | **no** |

(Against a floor of Cz 0.35. Full bar alone is already close to it.)

`trimEnvelope` sweeps both controls against the collapse floor and flags this
specifically. It also distinguishes it from the case where bar alone already
leaves the envelope — on a wing with 180 mm of travel it does, and that is not
the trimmer's doing.

---

## 8. What has been added since, and what is still not covered

**Rear-riser handles.** `handleGeometry` gives the angle a B or C handle pull
makes — over the same lever the speed system works against, with the opposite
sign — and `handleAgainstBrake` sets it beside the brake travel for the same
change: 56 mm of riser against 165 mm of brake for the same angle, and only
the brake deforms the section. In the core and the tests; not in the
interface.

**The webbing itself.** `buildRiserWebbing` counts the strap and the maillons
of a riser set: for three risers a side at 520 mm, 4.78 m of strap for the
pair — 3.12 m of it the straps to the lines, the rest the speed system's — six
maillons, and 96 g of webbing at 20 g/m. It is in the core and the suite; the
interface's bill counts the straps from the line plan, without the speed
system, and does not weigh them. How a speed-system strap is split from the
main one, and where its pulleys sit, is not modelled.

**What the bar does to the lines.** The load moves **aft** on the bar, not
forward — this page said forward. As the angle of attack falls the A row's
share of the lift goes from 43.8% to 37.9% to 27.6%, slow to trim to fast, and
the D row's from 14.2% to 21.3%. `loadEnvelope` sizes each line over the
flyable range of the bar: `docs/validation.md` §5.1.

**The collapse floor.** Inverted from published data, never predicted.
Predicting it needs internal pressure and rib support modelling.
