# Diagonal ribs

Chapter 7 of the handbook is figures without text, so this is a reconstruction
from the drawings and from what the geometry has to do.

---

## 1. The project already needed them

Every line attachment is a point of drag and a point of load, so modern wings
attach lines to every second or third rib rather than to all of them. The line
plans here already do exactly that — `everyNthRib: 2` has been the default
since line plans were built.

That left a problem the line plan quietly assumed away. **The ribs with no line
on them still carry lift**, and it has to reach the lineset somehow. A diagonal
rib is what carries it: a triangular panel from the attachment point on a
loaded rib, diagonally across the cell, to a line along the upper surface of
the unloaded rib beside it. Load spreads from a line of fabric down to a point.

So diagonals are not an optional refinement. Without them, a wing whose lines
attach every second rib has half its span hanging on nothing — and the tool was
modelling exactly that wing.

---

## 2. The flat pattern is exact

A diagonal is a fan: one apex, and a base curve on the neighbouring rib's
surface. That is a cone, and **a cone is developable** — it flattens with no
distortion at all, unlike the wing's own panels, whose development is only
approximate and has to have its error measured.

The development follows directly. Place the apex, lay each base point at its
true distance from it, and take the angle between successive base points from
the triangle they form:

```
cos(dφ) = (r_k² + r_k₊₁² − s²) / (2 · r_k · r_k₊₁)
```

Every radius and every base segment then comes out exact. Measured on a
synthetic fan and on a real diagonal from a built wing, the worst error is
**4.4 × 10⁻¹⁶ m** — machine precision, and the tolerance is set there rather
than at something discovered empirically. If it ever drifts, the fan is not
being treated as the developable surface it is.

---

## 3. Half the load travels diagonally

Every unloaded rib's lift must reach an attachment point, and the diagonals are
the only route. With lines on every second rib, **half the half-wing's load
travels diagonally**.

That number is a check, not an output. A first implementation returned 25%,
because it applied a row share on top of an already-normalised proximity
weight — dividing the load twice and losing half of it. The load has to arrive
somewhere, so anything other than 50% at `everyNthRib: 2` means it is being
lost or counted twice.

`vribLoads` also reports **load per metre of seam**, which is what decides
whether a seam needs reinforcing: about 2 daN/m on the test wing, rising to
4 daN/m when attachments are spread further apart.

---

## 4. The trade-off, made visible

Fewer attachments means less line drag and fewer anchor points, paid for in
fabric, weight and seam loading:

| lines every | reach | attach ribs | diagonals | extra fabric | load via diagonals | peak seam |
| --- | --- | --- | --- | --- | --- | --- |
| 1 rib | — | 25 | 0 | 0.00 m² | 0% | — |
| 2 ribs | 1 cell | 13 | 48 | 2.68 m² | 50% | 2.1 daN/m |
| 3 ribs | 1 cell | 9 | 32 | 1.79 m² | 67% | 4.1 daN/m |
| 4 ribs | 1 cell | 7 | 24 | 1.34 m² | **50%** | 4.1 daN/m |
| 3 ribs | 2 cells | 9 | 64 | 4.82 m² | 67% | 2.8 daN/m |
| 4 ribs | 2 cells | 7 | 48 | 3.62 m² | 75% | 4.1 daN/m |

The row that matters is **every 4th rib with single-cell diagonals**. It looks
cheapest — fewest diagonals, least fabric — and it is not buildable: a
single-cell diagonal cannot reach the middle of a three-cell gap, so six ribs
end up carrying no load path at all. `unsupportedRibs` names them.

That is a genuine rigging constraint rather than a modelling limit, and it is
where a designer finds out that spreading attachments further requires longer
diagonals. Reaching two cells fixes it and costs 2.7× the fabric of the
unbuildable version.

---

## 5. Not covered

- **H-ribs and VH-ribs.** LEP section 12 carries all three types; only the V
  form is generated. Horizontal straps spread load chordwise rather than
  spanwise and are a different geometry.
- **Diagonal ribs as structure.** They are treated as load paths and cut
  patterns, not as members with stiffness. Whether a diagonal is in tension
  across its whole width, or slack over part of it, is not modelled.
- **The effect on the rib itself.** A diagonal pulls on the rib it lands on,
  and that load is carried by the rib fabric and its reinforcement. The rib
  cut is unchanged here.
- **Cross-ports and their interaction.** Diagonals and cross-ports compete for
  the same region of a rib, and the source treats them together.
