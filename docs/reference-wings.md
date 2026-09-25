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

`published-specs.tsv` now covers 18 sizes across three families — 108 figures,
zero disagreements with the reference data.
