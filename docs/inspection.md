# Inspection, and the riser

## The error this corrects

For most of this project the deepest cascade level was called the **riser**.
That is wrong, and the PMA standard says so plainly:

> **Riser** — textile element between the main lines and the suspension point
> on the harness, via a connecting element.
>
> **Main lines** — lines which are attached directly to the riser connectors.

A riser is a short length of **webbing**. It runs from the karabiner up to the
maillons, and the line cascade starts above it. What the tool was calling
"riser lines" are **main lines**, and the level is now named `main`
throughout.

### Why it matters beyond naming

**Total line length includes the riser.** PMA Figure 4 defines it as the
distance from the sail at the attachment point to the inside of the riser loop
at the harness — `M = L + R`. That is exactly why some manufacturers' length
sheets include risers and some do not, and why comparing two sheets without
knowing which convention each used produces a constant offset of a few hundred
millimetres on every single line. `totalLineLength` carries `includeRisers`
explicitly and names the convention it used.

Checked against Skywalk: the SAGE 75's cascade sums to 6484 mm and its riser
is 520 mm; the published total for a1a is **7004 mm**.

**Risers step between sizes.** They are webbing cut to a length, not geometry
derived from the wing, so a family carries two or three riser lengths across
five sizes rather than five — 520 mm on the two small SAGEs, 540 mm on the
three large. `riserSteps` reports the steps and flags the unusual case of a
family that scales them instead.

**A riser is not one strap.** A three-riser set shares a base and splits into
branches, so its webbing is much less than three times its length.
`buildRiserWebbing` gives 1.98 m of webbing and 198 g for a three-riser SAGE
set including maillons, pulleys and handles — against the 230 g the mass
reconciliation had been assuming.

---

## The inspection standard as a design check

PMA Standard *Periodical Inspection of Paragliders* V 2024.12.1, written by
the manufacturers themselves, and already implemented in `src/core/pma.js`.

I wrote a second module for it before checking, and had to throw it away — the
existing one was more complete, carrying the porosity and tear ratings mine
lacked. The same happened with `buildRiserWebbing`, which I reimplemented as
`buildRiserAssembly` before the audit pointed out both were unused.

Both were caught by the check that every exported function has a caller. What
was genuinely new is the validation below: the standard's worked example had
never been run against the code, and neither had the riser webbing.

A design tool has no business issuing airworthiness certificates. The value is
the other direction: **the standard states in numbers how far a wing may drift
before it is unairworthy**, and those numbers are a check on the design. A
line plan whose lengths cannot be held to within 12 mm in service is a line
plan that will fail inspection.

### Line geometry (§5.5)

```
delta = measured_length + correction_offset - reference_length
```

The **correction offset** is the part worth understanding. A single value
applied to every measurement on the wing, brakes included, it exists because a
lineset shrinks or stretches *together* with age. A wing whose lines have all
shortened by 30 mm is not out of trim — it is uniformly shorter and flies as
designed. What matters is the **spread** around that common drift, and the
offset removes it.

| | limit |
| --- | --- |
| offset | ±1.5% of the longest reference line |
| suspension lines | Δ in [−12, +12] mm |
| brake lines | Δ in [0, +50] mm |

The brake range is **asymmetric**, and deliberately: a brake that has
shortened pulls the trailing edge down in normal flight, while one slightly
long only costs a little travel.

**The standard's worked example (Appendix A) is reproduced exactly** — all 28
deltas match Table 8, and the same eight lines are flagged: A1, A2, A3, A5 and
K1 to K4. That is ground truth written by the people who wrote the standard,
and it is now a permanent test.

One note on the source: the text of Appendix A says the offset is `+38 mm`
while the header of Table 8 says `-38 mm`. The tabulated values are consistent
with **+38**, so the table header is a typo in the standard.

### Line strength (§5.4)

```
minimum_strength_value = value_new × source_coeff × line_coeff
```

| line core | coefficient |
| --- | --- |
| Dyneema | 0.65 |
| Aramid / Technora / Vectran | 0.45 |

The coefficients are a statement about how the materials age. A used Dyneema
line must still hold **65%** of new; an aramid one only 45% — allowed to lose
more because it is expected to, being far more sensitive to UV and flex
fatigue. A standard holding aramid to the Dyneema figure would condemn
serviceable wings.

### And a finding that connects the two

PHI's measured kinked-strength table has a U-135 dropping from 160 daN to
85.6 daN — a retention of **53.5%**, which is *below* the 65% a used Dyneema
line must show at inspection.

**A permanently kinked line can therefore fail inspection while being
otherwise sound.** That is the strongest justification yet for this project's
decision to size lines on kinked strength by default: a design that only works
on unkinked figures is a design that fails its first check.

`inspectionHeadroom` in `pma.js` asks the question at design time — how much
drift is left before a lineset would fail geometry inspection. A line chosen
with no margin fails the moment it ages, and the tool can say so while the
design is still on screen.

---

## Data exchange (§6.2.1)

The standard asks a manufacturer to hand the inspection company, "in a
computable format": line references, materials, sewn lengths, colours,
construction, the new breaking strength of each line, and the total line
length for every attachment point including the trimmer position.

That list is precisely what the design already knows, which makes it the
natural output of the whole project — **the design produces the document that
lets the wing be inspected for the rest of its life.**

Two details the standard is specific about and that are easy to get wrong:

**Sewn length is not cut length.** Figure 6 defines it as the distance between
the *insides of the two loops*. The cut length includes the loops. Publishing
the wrong one understates every line by the loop allowance — 130 mm on the
wings that state it.

**Total line length includes the riser**, with the trimmer at whatever
position the maker specifies. A sheet quoted to the maillon is a different
quantity, and the record says which it is rather than leaving it to be
inferred.

The loop closes neatly: the totals this record publishes are exactly what an
inspector measures against, so a wing built to them passes its own geometry
inspection by definition — which is asserted, because if it did not, one of
the two calculations would be wrong.

A record missing required fields is still produced, but marked `INCOMPLETE` in
the file itself. An inspector receiving it needs to know what is absent rather
than be handed something that looks whole.

---

## The check, against a real wing at last

`lineGeometryCheck` implements the PMA's own inspection: it searches for the
correction offset that brings the most lines inside tolerance and flags what
is left. It had been tested against the standard's **worked example** and
never against a wing anyone had built.

The Enzo 3 sheets are six sizes of a manufacturer's own inspection record —
reference length, specimen as measured, and the difference — so the model can
finally be run on the thing it was written for.

| size | lines | correction offset | out of tolerance |
| --- | --- | --- | --- |
| XXS | 59 | 0 mm | 0 |
| XS | 59 | 0 mm | 0 |
| S | 59 | 0 mm | 0 |
| MS | 59 | 0 mm | 0 |
| ML | 59 | 0 mm | 0 |
| L | 59 | **2 mm** | 0 |

All six pass, against an offset limit of 118 mm the standard would allow. A
correction offset of essentially zero says the wing is built to its own
numbers rather than needing an allowance to pass — and the one size that
needed 2 mm is the one carrying the 14 mm outlier, which is the mechanism
working rather than a coincidence.

## Running it on a design

There is an **Inspection check** button now. It had been possible since the
inspection work to run this and there was never a way to ask.

On a design it checks the plan against itself: whether the line lengths are
internally consistent, not whether a built wing matches them — a design has no
built wing to measure. The distinction is stated in the file it writes.

### The button test earned its keep again

The first version read `l.referenceMM`. The field is `referenceLengthMM`, so
every line came through as `null` and the check failed reading a property of
null. Nothing but pressing the button would have found it: the function was
right, the model was right, and the name between them was wrong.
