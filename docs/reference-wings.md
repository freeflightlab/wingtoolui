# The reference wings, against what they claim

`size-families.tsv` is what this project measures everything against, and the
tool loads wings from it as starting points. Two errors in that path went
unnoticed for several rounds because every check was internally consistent.

## Every reference wing had twice its cells

A manufacturer publishes the **total** cell count. `S.cells` is the count for
**one half** — the slider says "Cells per half wing" and the LEP export
doubles it.

The picker bridged the two with:

```js
S.cells = Math.max(8, Math.min(60, Math.round(r.cells / 2) * 2));
```

which rounds to the nearest even number and halves nothing. The `* 2` undoes
the `/ 2`.

| wing | published | built |
| --- | --- | --- |
| Ozone Ultralite 5 | 34 | **68** |
| Ozone Geo 7 | 48 | **96** |
| Ozone Zeno 2 | 78 | **120** (clamped) |
| PHI Allegro light | 72 | **120** (clamped) |

The clamp at 60 per half made it worse than a doubling: four different wings
came out with identical cell counts.

Rib spacing follows the cell count and everything built on the ribs follows
the spacing — panel widths, diagonal sizes, anchor positions. Every reference
wing in the tool was a different wing from the one on the box.

### Why nothing caught it

Every check was internally consistent. The tool agreed with itself all the way
down: 34 half-cells really did give 35 ribs, which really did give 68 panels,
which really did give the right fabric area for a 68-cell wing.

The reference-set check added the same session compared `size-families.tsv`
against the manufacturers' published tables and found **zero disagreements** —
because the data file was right. The error was in reading it.

A check that the built wing has its published cell count is now in the
interface test, verified by restoring the old expression:

```
FAIL Ozone Ultralite 5 17 builds 68 cells; published is 34
```

### The conventions, pinned

Because one was wrong, all of them are now asserted:

| quantity | covers |
| --- | --- |
| span, area | the whole wing |
| ribs, panels, line plan | one half |
| bill of materials | the whole wing, doubled back up |

The bill was checked and is correct — a builder is not ordering half the
cloth.

---

## An odd number of cells cannot be built

Having fixed the doubling, I built every reference wing and compared it with
its published figures end to end, rather than checking components that agree
with each other. That found a second problem.

**The Alpina 5 and the Lynx 2 have 65 cells.** An odd total means a cell
straddles the centreline — a centre *cell*, not a centre rib. The parametric
model always puts a rib at station 0, so it can only build even totals, and it
was quietly building 66 and calling it an Alpina 5.

The LEP format carries the distinction as `centreRib`, and the Swoop2 uses it
(50 cells, centre rib true). The parametric path has no equivalent.

**It is built now.** `centreRib: false` puts no rib on the centreline: the
innermost rib sits half a cell out, and the cell between it and its mirror
straddles the line. `cells` counts the full cells outboard of the centre, so
65 is 32 each side plus the one in the middle.

The Alpina 5 and the Lynx 2 now build their published 65.

### The centre cell is a piece of cloth

Development walks consecutive ribs, and a cell that straddles the centreline
belongs to neither half — so it was missed entirely. A 65-cell wing came out
with 64 cells' worth of panels and nothing said so, which leaves a builder
**two panels short of a wing**.

It is developed against the mirror of the innermost rib. The result is
symmetric about the centreline to machine precision, as wide as the cell
beside it, and closes as flat as any other panel.

| | centre rib | centre cell |
| --- | --- | --- |
| ribs on the half | 33 | 33 |
| innermost station | 0.0000 m | 0.1366 m |
| cells across the wing | 64 | **65** |
| cloth pieces | 128 | **130** |

### The rest of the end-to-end audit

Every wing in `size-families.tsv`, built and compared:

| | |
| --- | --- |
| span | **exact** on all 38 |
| cell count | exact except the two odd ones |
| flat area | within ±2.2% |
| aspect ratio | within ±2.4% |

The area and aspect-ratio differences are the parametric planform
approximating a real shape, which the tool already states as "size only —
these are defaults, not this wing's".

### What a maker does not publish

`published-specs.tsv` covers 23 sizes across four families: **133 published
figures, zero disagreements.**

A dash means the maker does not publish that figure. BGD give area, span,
aspect ratio, cells and projected area but not root chord.

I filled those five chords in from area and span, and the check reported five
disagreements — my arithmetic against an estimate already in the reference
data. **Neither side was a published number.** A cross-check that compares two
guesses is worse than no cross-check, because it reads like evidence.

Five figures are now blank rather than invented, and a test asserts that at
least some are, so the discipline cannot quietly lapse.

### The centre cell through the pipeline

A feature that works in isolation is not one that works downstream. The centre
cell is nested with everything else, paid for in the bill, reaches the cutting
file, leaves the rib count untouched and carries a line plan — asserted, not
assumed, because the missing centre panel was exactly that kind of gap.

---

## The complete design was not in the picker

The Swoop2 was loadable from a button in the **Files** panel, while the
control that says *"Start from a published wing"* offered 55 specifications
and not the one complete design in the library.

Somebody looking for a wing to start from would never have found it.

It is the first entry in the picker now. Every other entry gives a **size**
and leaves the shape to defaults — a specification does not say how elliptical
a leading edge is or what section a wing uses. The Swoop2 brings its own ribs,
its own aerofoils and its own line plan, so it takes the import path instead:

> Swoop2: a complete design from Laboratori d'envol — 50 cells, 51 ribs, its
> own aerofoils and line plan. Not a size to build on: the geometry is the
> wing itself.

Choosing any specification afterwards clears the imported geometry, or the
tool would show a Geo 7 built out of Swoop2 ribs. That is asserted, because
nothing else would have noticed.

The hint under the picker also claimed *"Seven families"* when there were
eleven — it counts them now rather than stating a number that was true once.

### A check that could not fail, again

My first version of the picker test read `globalThis.__selects`, which does
not exist. `sel` was null, the condition short-circuited, and the check could
never have failed.

The replacement walks the created-node registry for an `<option>` carrying the
id — and the first attempt at THAT read `n.tag` where the stub's field is
`n.tagName`, so it found no options at all. It only showed up because the walk
has a guard that fails when it finds nothing.

Both are verified by removing the option and watching the check fail:

```
FAIL the Swoop2 is not an option in the wing picker
```
