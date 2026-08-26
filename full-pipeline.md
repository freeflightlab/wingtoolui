# Running every real wing through the whole tool

The test suite checks modules. The Phase 1 audit checks roadmap claims.
Neither asks the question that matters most:

> Given a real wing, does the **complete pipeline** produce a coherent,
> physically sensible design?

`node tests/full-pipeline.mjs` runs all 38 published sizes from the reference
database through every stage — planform, arc, 3D assembly, development,
nesting, line plan, loads, line selection, length chain, inspection, rib
internals, and flight — and checks the results against each other and against
physics.

**It found four defects that every module test passed.** Each module was right
on its own; they were wrong in company.

---

## 1. The projected span ratio was a square-rooted area ratio

`buildLobe` takes a **span** ratio. `referenceDesignInputs` was giving it
`sqrt(projectedArea / flatArea)`.

Those are unrelated quantities. An arc shortens the span; it also loses the
cosine of the local dihedral from the projected area, and no square root
connects the two. On the PHI Allegro light the published span ratio is 0.794
and the rooted area ratio is 0.926.

**Wrong on every wing in the database, by up to 19.5%.** Now 0.00% across all
38 sizes.

## 2. Anchor density was driven by cell count, inverting the real relationship

Across the seven published families, line consumption per metre of span
correlates with aspect ratio at **r = −0.977**. A high-aspect wing has *more*
cells and *less* line: the Zeno 2 has 78 cells and 15.5 m per metre of span,
the Ultralite 5 has 34 cells and 26.7.

`everyNthRib` drives anchors off the cell count, so the generator had it
exactly backwards. The pipeline caught it as a contradiction nothing else
could see:

```
FAIL  higher aspect ratio has less line drag  (0.00914 vs 0.01242)
```

Higher aspect ratio was coming out with **more** line drag — the opposite of
why high-aspect wings exist. `anchorsForLineLength` solves the density
instead, and the relationship is restored.

## 3. Anchor loads were grouped by anchor index, not by rib

Safe while every row had the same anchor count: anchor 3 of row A and anchor 3
of row C were the same rib. With per-row densities they are not — on a wing
with A:19 B:11 C:6, row C's third anchor is most of the way out the span while
row A's is a third of the way.

Grouped by index, the span load went to ribs that did not carry it. **7 to 12%
of the wing's weight lost on three sizes**, while others closed to 0.01% — the
inconsistency being what made it findable.

Worst closure across all 38 sizes: **12.12% → 0.05%**.

## 4. An unknown layout name was silently absorbed

Three tests passed `RISER_LAYOUTS['A/B']`. That is not a key — the layouts are
`A/B/C+D`, `A/B+C`, `A/B/C/D`, `single`. A destructuring default fires on
`undefined`, so the four-riser default was substituted and **the plan under
test was not the plan described**. Nothing failed.

The check has to happen on the raw options object, before destructuring, since
neither a default nor a sentinel can tell an omission from an explicit
`undefined`. I got that wrong twice before getting it right.

---

## 5. What remains, stated rather than hidden

**Total line length runs +38% against published** (−6% to +85%).

This is a genuine conflict, not an oversight. Hitting a published length and
matching a real wing's topology are, with a three-level cascade,
*incompatible*:

- Real wings run **four** cascade levels. The generator runs three, so its
  lines are longer for the same anchor count.
- Targeting the published length made the solver use far fewer anchors — 7 on
  a Zeno 2 where the real wing has 30. Right metres, wrong wing, and each main
  then carrying four times its proper share until it exceeded the strongest
  line in the materials table.

**Density is the constraint kept**, because density sets the loads and the
loads size the lines. The length follows and is reported. Closing that gap
needs the fourth cascade level, which is now the single most valuable
outstanding item.

**Two wings show 0.69 m/s minimum sink**, below the 0.7 floor set as
physically plausible. Both are the smallest size of a light wing at about
3 kg/m². The polar is marked `estimated`, and this says the estimated profile
drag is optimistic at low Reynolds number.

**One wing, the Zeno 2 L, still cannot size every line** — the highest aspect
ratio in the database with the fewest mains reachable.
