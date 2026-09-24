# The cell intake

A paraglider is a ram-air wing: it holds its shape because air enters the
leading edge and pressurises the cells. Every other model in this project —
the section, the ribs, the cross-ports, the line plan — assumes that has
happened. Nothing modelled the opening that makes it happen.

## 1. Why the intake sits where it does

Air enters at **total pressure only where the flow stagnates**. Away from the
stagnation point the local pressure is lower, and an opening there feeds the
cell at less than total pressure — or, on the suction side, empties it.

So the opening must contain the stagnation point, and the stagnation point
**moves**:

| angle of attack | stagnation point |
| --- | --- |
| 2° (accelerated) | −1.21% chord, lower surface |
| 6° (trim) | −2.74% |
| 12° (slow) | −4.49% |

That is why intakes are cut back along the lower surface rather than being a
hole at the nose. The opening has to span the whole range of stagnation
positions the wing will fly through — 3.3% of chord on this section between 2°
and 12° — and the width of that range is set by the speed system.

**A wing whose intake does not reach its own accelerated stagnation point will
lose pressure at speed**, which is exactly when it can least afford to.

## 2. What the model checks

`buildIntake` reports whether the opening contains the stagnation point at
both ends of the speed range, and by how much. The two failure modes get
**different messages**, because they need different fixes:

- missing the accelerated end → loses pressure at speed, with the bar on
- missing the slow end → loses pressure flown deep, near the stall

`minimumIntake` gives the smallest opening that still covers the envelope.
Intake area is drag, so the useful question is not "is it big enough" but "how
much of it is doing anything". On the test section that minimum is a 5.5%
lower cut, comfortably under the 8–12% real wings use — the difference being
margin for turbulence and collapse recovery.

## 3. Two bugs, and the one that mattered

**Every cell had zero opening area.** Rib spanwise position is `station`, not
`y`, and reading the wrong field gave every cell zero width. The `|| 0` I had
written would have hidden it; the total coming out as **0 cm²** was too
obviously wrong to miss. It now throws instead.

**A wing that failed the slow case was told it "covers the speed range."** The
note was written against `coversAccelerated` alone. That is precisely the
reassuring-and-wrong output this project tries not to produce.

## 4. The bug this work uncovered elsewhere

Writing the stagnation model needed the section's zero-lift angle, and the
test *"it sits at the nose at zero lift"* failed. Investigating showed
`alphaL0Deg` **changing with the angle it was evaluated at** — which is
impossible, since the zero-lift angle is a property of the section.

The cause: `thinAirfoil(airfoil, n = 400)` takes a **sample count**, not an
angle. Both arguments are numbers, and `thinAirfoil(af, 6)` reads like six
degrees. It means six samples.

**The coupled equilibrium solve shipped in the previous round had the same
error**, putting a **9% error into the zero-lift angle** — silently, failing
nothing. Fixed at all three call sites, and the signature now refuses a value
under 20, since a plausible sample count is large and a plausible angle of
attack is small.

A new model requiring an old one to be correct is a good way to find out that
it wasn't.

## 5. The whole family, swept

The hazard is in the signature, not in any one call. Five functions share the
shape `(object, n = large)`:

```
aero      camberLine          n = 200
aero      thinAirfoil       opts = 400
planform  flatArea            n = 400
planform  planformMetrics     n = 400
planform  planformOutline     n = 120
```

A sweep of every call site in `src/`, `tests/` and `tools/` found **no other
live misuse** — the single hit was my own comment describing the bug. But a
signature that admits the mistake will eventually see it, so all five now
refuse a value too small to be a plausible sample count, and say what the
argument actually means.

The property that made the original bug findable is now a test in its own
right: **a section's zero-lift angle does not depend on the angle it is
evaluated at.**

## 6. In the interface

The rib view draws the intake check: whether the opening spans the stagnation
travel, and a red warning when it does not. Both states are exercised by the
interface test, because a warning that has never been seen to appear is not
known to work.
