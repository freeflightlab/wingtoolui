# Risers, the speed system and accelerated flight

Everything before this treated the wing as flying at one attitude. It does
not. Pushing the speedbar shortens the front risers more than the rear ones,
rotating the wing nose-down and trading sink for speed — the largest change a
pilot makes to the geometry in flight, and previously unmodelled.

Covers handbook chapter 9, and LEP sections 28 (calage variation) and 33
(detailed risers).

---

## 1. The geometry

The risers hang from one maillon. The A row attaches near the nose, the rear
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

## 4. Hardware steps, it does not scale

PHI's ALLEGRO light runs 570 mm risers with 150 mm travel on its two smallest
sizes and 600/180 on the other four, across a family whose spans scale
smoothly by 18%. Hardware comes in discrete sizes, so a scaling law is the
wrong shape entirely — `RISER_HARDWARE` is a table, and `hardwareForSize`
looks up the step.

---

## 5. Not covered

- **Trimmers**, which change trim angle without the bar and are a separate
  adjustment on many wings.
- **Riser webbing geometry** — the split between main and speed-system
  webbing, the B-handle heights the Alpina 5 advertises as adjustable, and
  the C-handle steering the Geo 7 and Swift 6 carry.
- **The lift slope itself.** The polar is only as good as `czAt`, and the
  guard above exists because that is easy to forget. Deriving it from the
  section, rather than taking it as an input, is the obvious next step.
- **Structural effect of acceleration.** Line loads shift forward under bar,
  which changes what each row carries; `loads.js` still assumes trim.
