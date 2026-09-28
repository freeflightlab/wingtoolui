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

![Diagonal ribs carrying the load from unattached ribs](diagonal-ribs.svg)

*Cyan ribs carry a line; grey ribs do not. Each pink triangle runs from an
attachment point on a loaded rib up to the upper surface of its unloaded
neighbour. Generated from the tool's own geometry by `tools/make-diagrams.mjs`.*

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

## 5. Cutting them

Diagonals cost fabric and have to be cut like anything else. `vribsToDXF`
nests them and writes R12, and they appear in the interface as their own
export.

They nest **separately from the panels**, for a practical reason: diagonals
are usually cut from a different, lighter cloth than the sail, so mixing them
into one layout produces a cutting file nobody can use.

They also nest differently. A sail panel is long and narrow and wants to lie
along the roll; a fan is a wedge. The existing nester copes without changes
because it searches orientations against the real outline rather than the
bounding box, so a wedge turned through 180 degrees interlocks with its
neighbour. On the test wing, 48 diagonals take 4.28 m of a 1.4 m roll at 45%
utilisation.

One number is worth checking every time: the **flat-pattern area equals the
surface area exactly**. A cone develops with no change of area, so 2.68 m² of
diagonal becomes 2.68 m² of pattern. On the wing's own panels that equality is
only approximate. Here it is exact, and it is the same developability property
appearing a third way — after the radii and the base segments.

## 6. In the interface

The **Rib** tab draws the diagonals that touch the selected rib, and a builder
needs both marks: the point where a diagonal's apex lands on a loaded rib, and
the line along which its base is sewn to an unloaded one. The caption counts
both — how many leave this rib, and how many land on it.

`unsupportedRibs` is surfaced in the status bar as a warning, so a rigging
choice that leaves span with no load path is visible while it is being made
rather than discovered later.

---

## 7. Not covered

- **VH-ribs.** LEP section 12 carries all three types; the V and H forms are
  generated, the combined VH form is not.
- **Diagonal ribs as structure.** They are treated as load paths and cut
  patterns, not as members with stiffness. Whether a diagonal is in tension
  across its whole width, or slack over part of it, is not modelled.
- **The effect on the rib itself.** A diagonal pulls on the rib it lands on,
  and that load is carried by the rib fabric and its reinforcement. The rib
  cut is unchanged here.
- **Collision checking between internal parts.** Diagonals, cross-ports and
  lightening holes are each generated correctly and independently, and nothing
  checks that two of them are not asked for on the same part of a rib.
  `checkTabClearance` does exactly this for tabs against lightening holes; the
  equivalent for diagonals does not exist.

---

## 8. What the H form exposed

The H-rib was implemented expecting it to show a development distortion the V
form does not, since a strip between two curves is not generally developable
while a cone always is.

It showed none. Nor, on investigation, did the sail panels it was being
compared against — at any rib spacing from 0.23 m to 4.1 m, on a wing with 9
degrees of washin and a strongly arced lobe. Surfaces that are certainly not
developable were reporting machine precision.

The measure was at fault, not the geometry. Each unrolling step preserves five
of the quadrilateral's six lengths, including **both** diagonals, and
`developmentError` was comparing one of those diagonals. It could not return
anything but zero, and had been doing so since Phase 1 — through the status
line, through the test suite's loose `< 1%` tolerance, and through every
validation run.

Measuring the fourth side instead — the one length the construction actually
gives up — reports 0.0034% on a normal wing, exactly zero on a cylinder and a
cone, and a figure that grows with the twist of a ruled surface. The H form
does carry a small distortion after all, and the V form genuinely carries none.

The test is now two-sided. A measure that only ever returns zero passes any
one-sided check, so it has to be shown reporting something where something is
there.

---

## 9. Is the diagonal actually in tension?

`vribLoads` says where a diagonal's load **goes**: from the anchor at the apex
to the rib along the base. It does not say how the cloth **carries** it, and
that is a different question.

Fabric carries tension and nothing else — no compression, no bending. So load
flows only along lines from the apex that are being pulled. A part of the
triangle whose fibres are not in tension carries nothing at all: it is sewn
in, it adds weight, and it does no work.

### The limit is the angle

A fibre from the apex to a point on the base carries a share of the load
proportional to the cosine of its angle from the load direction. **Past 90
degrees that share is negative** — the fibre would have to push — so it goes
slack. Asserted in both directions: every slack fibre is past 90°, every taut
one is not.

### Width is the lever

| base spread | area | fully taut | worst | max angle |
| --- | --- | --- | --- | --- |
| 8% chord | 0.057 m² | **20 of 20** | 100% taut | 11° |
| 18% | 0.128 m² | 16 of 20 | 75% | 130° |
| 30% | 0.214 m² | 15 of 20 | 67% | 140° |
| 45% | 0.325 m² | 14 of 20 | 58% | 143° |

A narrow diagonal works across its whole width. A wide one is carrying on a
fraction of itself while paying for all of it — nearly six times the fabric at
45% for a triangle that works on 58% of its base.

`checkDiagonalTension` reports the slack area directly, because that is the
number a designer can act on: it is either too wide or anchored in the wrong
place, and both are things they can change.

### A parameter that was silently ignored

My first run gave identical results for every width, because the option is
`baseSpread` and I passed `spread`. The extra key was accepted and dropped,
so four different calls built the same diagonal and the model looked
insensitive to the thing it was measuring.

Same shape as the `demoWing({ cells: 40 })` error two rounds ago and the
`thinAirfoil` one before that: a call that looks right, runs clean, and does
nothing.

---

## 10. Are they buildable?

`buildVRibs` places a diagonal wherever the rule says one goes. It never asked
whether the result is a piece anyone could cut and sew, and on every planform
tried, most are not.

On the test wing, one row of diagonals across 20 cells:

| | |
| --- | --- |
| shortest | **74 mm** |
| longest | **685 mm** |
| spread | 9.2 to 1 |
| flagged | 19 of 20 |

Nobody cuts, marks and sews a 74 mm triangle. It adds two seams and some
weight and carries almost nothing.

### Why the two directions differ

A rib on an arc is tilted, so its thickness has a spanwise component — 98 mm
at mid-span here. A diagonal runs from the **lower** surface of one rib to the
**upper** surface of its neighbour, so that offset adds going inboard and
subtracts going outboard. From rib 4: **675 mm inboard, 346 mm outboard.**

I tried to even that up by sliding the base along the neighbouring rib until
it sat across from the apex. **It cannot work.** `y` varies by about 70 mm
across that rib's whole chord, less than the 98 mm offset it would have to
absorb, so the search runs to the end of the chord and produces 1.7 m
diagonals lying almost flat at 87 degrees from vertical.

The asymmetry is the arc. It is not a placement error and forcing it away
makes things worse.

### So the tool reports rather than pretends

`diagonalGeometry` flags each diagonal that is too short to sew, too long to
support, too shallow to carry its load up into the upper surface, or lopsided
against its opposite number. The Structure view marks the apex of each one in
red.

None of it is fixable inside the diagonal code — the sizes follow from the
planform, the arc and the anchor spacing. What the tool can do is say which
ones are wrong and by how much, so the designer changes the thing that causes
it.

**This is recorded as a known state, not as a passing check.** The placement
rule produces mostly unbuildable diagonals, and writing the test the other way
round would enshrine that.

---

## 11. What actually pulls on a diagonal

`diagonalTension` took the load direction as **apex to base centre** — the
diagonal's own axis. A tension check whose load direction is defined by the
thing it is checking cannot find anything, and it did not: every fibre came
out perfectly aimed, on every wing.

What pulls on a diagonal's apex is the **line** attached there, running down
and inboard to the maillon. Pass `maillon` and that is what is used.

### The sign was backwards too

With the real direction, every fibre came out slack. Cloth can only pull, and
a fibre works by **opposing** the load: the line pulls the apex down, the
fabric runs up to the base and holds it. The check asked whether fibres
aligned *with* the pull. Both answers were wrong and the first one looked
fine.

### What it shows

| | |
| --- | --- |
| spanwise share of the pull | **3% at the root, up to 75% outboard** |
| alignment, worst | **0.00** |
| alignment, best | 0.67 |

An alignment of 1 would be a diagonal pulling straight back against the line,
and **no real diagonal reaches it.** A diagonal spans a cell sideways while
rising from the lower surface to the upper, so its direction is fixed by the
cell width against the section depth — about 0.45 m across and 0.35 m up on
this wing, which is 52 degrees from the pull.

So the figure means little on its own, and my first reading of it — that
below 0.5 a diagonal is carrying load sideways — set a standard nothing could
meet.

The spanwise figure is the point: a diagonal outboard is resisting a pull that
is three quarters sideways. That load was invisible while the direction was
taken as the diagonal's own axis.

This is recorded as a **known state**, not a pass. It agrees with the geometry
check, which flags most of the same pieces as unbuildable.

---

## 12. It is the cell, not the placement

Having measured that the diagonals are badly aimed, the obvious next move was
to place them better. **It gains almost nothing.**

Sweeping the base along the entire chord of the neighbouring rib moves the
alignment from 0.57 to 0.59. The base is already within a couple of per cent
of the best that cell allows.

`achievable` reports that bound — the best any one of the diagonal's own
fibres manages against the same load — and the ratio to the mean is what says
whether the base is well placed:

| base width | mean alignment | best fibre | ratio |
| --- | --- | --- | --- |
| 18% of chord | 0.34 | 0.40 | **87%** |
| 45% of chord | — | — | **73%** |

A wider base necessarily spreads into fabric further from the best direction.
That is the cost of spreading load over more of the rib, and it is a trade
rather than a fault.

### What does work

Narrower cells. They rise as steeply for a shorter reach, so the diagonal
points more against the load:

| cells | mean alignment | best fibre |
| --- | --- | --- |
| 20 | 0.34 | 0.40 |
| 40 | **0.46** | 0.53 |
| 60 | 0.46 | 0.52 |

Both move together, which is what says the cell is doing it rather than the
placement. **A designer whose diagonals are poorly aimed should add cells, not
adjust the base.**

### A bound measured against the wrong thing

My first `achievable` compared the diagonal's rise against its span — the
alignment it would have if the load were straight down. The load is up to
three quarters spanwise, so that bound belonged to a different problem, and
the ratio to it came out near 50% on every wing regardless. A number that does
not move is not measuring anything.

---

## 13. The outboard leg collapses

The size spread was 9.2 to 1 — 74 mm to 685 mm — and it is not random:

| rib | inboard | outboard |
| --- | --- | --- |
| 4 | 675 mm | 346 mm |
| 8 | 661 mm | 155 mm |
| 12 | 531 mm | **75 mm** |

The inboard legs stay large. **The outboard leg shrinks to nothing.**

A rib on an arc is tilted, so its thickness has a spanwise component, and
going outboard that offset *subtracts* from the rib gap. Towards the tip the
dihedral grows while the cells narrow, and the two cancel.

Nobody cuts, marks and sews a 75 mm triangle. It adds two seams and some
weight and carries almost nothing — and the inboard leg at the same rib is
already holding that anchor. Real wings stop placing diagonals before the tip
for exactly this reason. The rule placed them all the way out because it never
looked at what it had made.

### `minLengthM`, and why it is off by default

| limit | placed | skipped | spread | flagged |
| --- | --- | --- | --- | --- |
| 0 | 20 | 0 | 9.2 : 1 | 19 |
| 120 mm | 15 | 5 | **5.4 : 1** | **9** |
| 200 mm | 13 | 7 | 3.0 : 1 | 7 |

At 120 mm the spread nearly halves and the flagged count halves.

**It defaults to 0.** Turning it on changes an existing design without being
asked, and on a row and reach combination I had not checked it left a rib with
nothing holding it. At 200 mm rib 19 loses its support; at 400 mm three ribs
do. `unsupportedRibs` reports it, which is what makes the limit safe to
expose — but it is a choice a designer makes and checks, not a default they
inherit.

The tests caught that when I tried to ship it on by default.

---

## 14. Seam to seam, not across a seam

`buildVRibs` puts the apex on one rib's lower surface and spreads the base
**across the upper panel** of a neighbour — a band of cloth landing in the
middle of a panel rather than on the seam where that panel is sewn to its rib.
Fabric loaded mid-panel pulls the panel out of shape. A seam is where the
structure is.

`buildSeamDiagonals` builds the V: **one bottom seam to the two top seams
either side of it.** The apex sits on rib *i*'s lower surface at the anchor;
the two feet sit on the upper surfaces of ribs *i−1* and *i+1*, at the same
chord station. Every attachment lands on a seam. The inverted form — two
bottom seams to the top seam between them — is the same triangle upside down.

Where a V will not fit because a leg would be too short to sew, the caller is
told **which ribs want an H rib instead** rather than being handed a 75 mm
triangle. On the test wing that is 7 positions of 11.

### It is still not symmetric, and I expected it to be

I built this expecting the V to cancel the asymmetry: the arc's tilt adds to
one leg and subtracts from the other, so taking both sides should even it out.

**It does not.** The legs still differ by up to 4.3 to 1 near the tip, and the
cause is not the arc but **sweep**. The ribs are rotated to follow the swept
leading edge, so a point at 30% chord on rib 9 sits at y = 3.406 where that
rib's station is 3.767 — constant chord-fraction points bunch together going
outboard. Add the offset between a rib's lower surface and its upper, and one
leg grows while the other shrinks.

| | spanwise gap | vertical gap |
| --- | --- | --- |
| apex to inboard foot | 0.476 m | 0.458 m |
| apex to outboard foot | **0.137 m** | **0.043 m** |

So this fixes the attachment and does not fix the asymmetry. `legRatio` is
reported per diagonal rather than left to be discovered, and it is asserted to
be present rather than asserted to be 1.
