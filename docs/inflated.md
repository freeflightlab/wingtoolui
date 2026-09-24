# The built shape and the flying shape

Everything this project draws is the **built** wing: flat panels cut to a
pattern, sewn to ribs that hold a chosen aerofoil. What flies is different.
Under pressure the cloth between each pair of ribs bulges into an arc, so the
surface is scalloped rather than smooth, and the section a streamline meets is
not the section the rib was cut to.

That matters because **every measurement in the handbook is of the flying
shape.** A published area, aspect ratio or aerofoil is measured on a wing in
the air. Comparing it against the built geometry compares two different
things.

## 1. What changes

At 6% billow on the upper surface and 2% on the lower:

| | change |
| --- | --- |
| wetted area | **+4.0%** |
| section thickness | +0.82% of chord |
| camber line | +0.11% of chord |

**Area goes up** because a scalloped surface holds more cloth across the same
span. Projected area does not change — the ribs still sit where they sit — but
wetted area does, and that is what carries the skin friction.

**Thickness goes up and camber moves**, and they are separate effects. The
bulge adds to both surfaces, which thickens the section; the upper bulges
*more* because it carries more suction, and that difference is what moves the
camber. With equal billow on both surfaces the section thickens and the camber
does not move — asserted.

## 2. What it does not explain

I built this partly hoping it would account for the missing 10% in minimum
sink. **It does not.**

| | min sink | best glide |
| --- | --- | --- |
| built, smooth | 0.831 m/s | 9.41 |
| inflated, area effect | 0.835 m/s | 9.36 |
| inflated + 1.5 roughness | 0.895 m/s | 8.72 |

The area effect moves sink by **half a percent**. Adding a roughness factor
moves it further but trades glide away at the same rate — exactly as raising
profile drag did when I tried that. Glide was already right, so anything that
lowers it is buying the wrong thing.

So the residual is still not a surface-drag effect, and that is now
established twice by two independent routes rather than assumed once.

## 3. Two effects kept apart

`billowDragPenalty` returns the area effect as a number and the scallop
roughness as a **factor the caller supplies**, defaulting to 1.0 — no penalty.

The area effect is arithmetic: 4% more wetted area is 4% more friction drag.
The roughness is not computable here. It depends on the boundary layer state,
the scallop depth against its own thickness, and the Reynolds number. Rolling
a guess into the first would make a derived quantity and an invented one
indistinguishable in the output.

## 4. What this is

Geometry, not measurement. Nothing here has been checked against a flying
wing, and the result carries `source: 'geometry'` so nothing downstream can
mistake it. Phase 5 items are research; this one produces numbers a person
might trust, so it says plainly where they come from.

## 5. An error worth recording

`solveArc(S, L)` takes the **arc length and the chord it spans**, returning
the radius `R` and rise `f` as fractions. I called it with an options object
and read fields that do not exist, which gave `NaN` thickness on every wing
while the wetted area — computed separately — came out fine.

A half-NaN result is more dangerous than a fully broken one: three of the four
numbers looked right.
