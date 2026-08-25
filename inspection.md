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
`buildRiserAssembly` gives 1.98 m of webbing and 198 g for a three-riser SAGE
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
