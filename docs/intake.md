# The cell intake

A paraglider is a ram-air wing: it holds its shape because air enters the
leading edge and pressurises the cells. Every other model in this project —
the section, the ribs, the cross-ports, the line plan — assumes that has
happened. This is the model of the opening that makes it happen.

## 1. Where the flow stagnates

Air enters at **total pressure only where the flow stagnates**. Away from the
stagnation point the local pressure is lower, and an opening there feeds the
cell at less than total pressure — or, on the suction side, empties it.

The stagnation point **moves**. `stagnationPoint`, on a NACA 4415:

| angle of attack | stagnation point |
| --- | --- |
| 0° | at the nose |
| 2° (on the bar) | 0.12% of chord under it |
| 4° | 0.50% |
| 6° (trim) | 1.16% |
| 8° | 2.12% |
| 10° | 3.38% |
| 12° (slow) | 4.98% |
| 14° | 6.91% |

Three things in that table matter.

**It goes as the square of the angle.** Close to the nose

```
x / c = sin²(α − α_ideal)
```

which is exact for a flat plate, and for an ellipse of any thickness. The
point hardly moves over the fast half of the range and runs away over the slow
half: 0.4% of chord between 2° and 4°, 1.9% between 12° and 14°.

**It is measured from the ideal angle of attack, not from zero lift.** The
ideal angle is where the flow meets the nose head-on: 0.03° on this section,
with zero lift at −4.27°. Below it the stagnation point is on the *upper*
surface.

**So it is at the nose when the wing is fast.** That is why a wing loses
internal pressure on the bar: the stagnation point runs forward past the
opening's upper lip and leaves the opening in accelerating flow.

### What this section used to say

The table here read −1.21%, −2.74%, −4.49% at 2°, 6° and 12°, from
`(α − α_L0) / 2π`: linear, and measured from zero lift. That put the point
two to ten times too far back at the angles a wing flies at, could never put
it on the upper surface, and made an opening look safest exactly where it is
not. The file's own header also had the direction backwards — "at low angle of
attack it sits further back" — above a formula that moved the right way by
the wrong amount.

## 2. What an opening is fed at

`intakeFeed` takes an opening as a signed chord range — negative under the
nose — and an angle of attack. If the opening holds the stagnation point it is
fed at total pressure, Cp 1. If not, it is fed at the pressure at the lip the
stagnation point has passed, which is the highest anywhere on the opening, and
the result names the lip.

Two real openings are in the repository: the handbook's example section opens
from 1.2% to 5.5% of chord along the lower surface (the default here), and the
Swoop2's from 3% to 6%. Neither reaches the nose. Each on its own section:

| angle of attack | 1.2–5.5% on NACA 4415 | 3–6% on the Swoop2's gnuReflex |
| --- | --- | --- |
| 2° | Cp 0.58 | Cp 0.25 |
| 4° | 0.89 | 0.56 |
| 6° | 1.00 | 0.78 |
| 8° | total pressure | 0.93 |
| 10° | total pressure | 1.00 |
| 12° | total pressure | total pressure |
| 14° | 0.99, past the lower lip | 1.00, past the lower lip |

The stagnation point enters the first opening at 6.1° and the second at
10.6°. Below that each is fed from its upper lip, and the pressure there falls
quickly as the wing speeds up. An opening set further back costs pressure at
speed and gains it flown slow; one run forward to the nose is fed at total
pressure throughout and is open where the section most needs its shape.

**Read the figures as a direction, not a measurement.** See section 6.

## 3. A whole wing, and the smallest opening

`buildIntake` does the same for a wing: every cell's opening area, the cells
closed at the tip, and whether the opening holds the stagnation point at both
ends of a speed range. The two ways of failing get **different messages**,
because they need different fixes:

- missing the accelerated end → fed at less than total pressure at speed
- missing the slow end → loses pressure flown deep, near the stall

On the 12-cell test wing an opening from 1% over the nose to 9% under it comes
to 10,254 cm² with the two tip cells closed (11,133 cm² with none closed) and
holds the stagnation point from 2° to 12°.

`minimumIntake` gives the smallest opening that still covers a range, with a
margin of 1% of chord at each end. For 2° to 12° on this section that is from
0.9% over the nose to 6.0% under it — 6.9% of chord. For 4° to 10° the travel
is 2.9% of chord; for 0° to 14° it is 6.9%.

Neither function is on a button. The interface asks `intakeFeed` about the rib
on the page, with the opening the section really has (section 5).

## 4. Bugs found on the way

**Every cell had zero opening area.** Rib spanwise position is `station`, not
`y`, and reading the wrong field gave every cell zero width. A `|| 0` would
have hidden it; the total coming out as **0 cm²** was too obviously wrong to
miss. It now throws instead.

**A wing that failed the slow case was told it "covers the speed range."** The
note was written against `coversAccelerated` alone.

**`thinAirfoil(af, 6)` is six samples, not six degrees.** Writing the first
stagnation model needed the section's zero-lift angle, and it came out
*changing with the angle it was evaluated at* — impossible, since it is a
property of the section. `thinAirfoil(airfoil, n = 400)` takes a sample count.
The coupled equilibrium solve had the same mistake, putting a 9% error into
the zero-lift angle and failing nothing. It was fixed at all three call sites,
and the function now refuses a value under 20: a plausible sample count is
large and a plausible angle of attack is small.

Five functions share the shape `(object, n = large)`:

```
aero      camberLine          n = 200
aero      thinAirfoil       opts = 400
planform  flatArea            n = 400
planform  planformMetrics     n = 400
planform  planformOutline     n = 120
```

A sweep of every call site found no other misuse, and all five now refuse a
value too small to be a sample count. The property that exposed it is a test
in its own right: **a section's zero-lift angle does not depend on the angle
it is evaluated at.**

The test that started this — "it sits at the nose at zero lift" — was itself
wrong, as section 1 says. It is now "it sits at the nose at the ideal angle of
attack", with a second beside it: "and at zero lift, four degrees below that,
it is on the UPPER surface".

## 5. In the interface

The opening is the section's own: **Intake starts** and **Intake ends** under
*Section*, read from the file when a section or a design is imported. It is
drawn in red on the Rib tab and marked on the rib pattern.

**Cell intake against where the flow stagnates**, under *Internal structure*,
adds the check to the rib on the page. A dot marks where the flow stagnates at
trim, and the note under the rib reads, for the default wing's centre rib:

```
intake 1.2–5.5% c: at 5.0° the flow stagnates 0.8% under the nose and the
opening is fed at Cp 0.97; Cp 0.58 three degrees faster, total pressure six
slower (thin-aerofoil, first order)
```

The angle is the rib's own — the wing's, plus that rib's washin — so the
answer changes along the span. The Swoop2's centre rib, at its 4.3°, reads
Cp 0.60, 0.13 three degrees faster and 1.00 six slower.

The interface test reads the note in three states: the section's own opening,
one run forward to the nose (total pressure throughout) and one cut short at
2% (which loses the slow end).

## 6. What it is not

- **First order.** Thin-aerofoil theory: the camber line and the angle of
  attack, with no thickness and no nose radius. The result carries
  `firstOrder: true` and the note in the interface says so.
- **The opening is not in the flow.** The section is treated as closed and the
  pressure is read where the opening is. A nose shaped to hold the stagnation
  point at the opening across the speed range — what a "shark nose" is for —
  is exactly what this cannot see, so it will under-rate such a section at
  speed.
- **Not measured.** Nothing in the repository gives a measured internal
  pressure, so none of the figures in section 2 has been checked against a
  wing. The direction is right — set back, an opening is fed less well fast and
  better slow — and the amounts are an estimate.
- **Not passed on.** Nothing else in the tool takes what the intake is fed
  at. The cross-flow rule assumes 85% of dynamic pressure inside the cell
  (`DEFAULT_CROSSPORT_RULES`), whatever the opening.
