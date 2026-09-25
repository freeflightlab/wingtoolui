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

It is **reported** now rather than rounded away:

> 65 cells is odd, so a cell straddles the centreline. This model puts a rib
> there, so it builds 66.

Supporting a true centre cell would mean changing how stations are generated
and how the wing is mirrored, and it is not done.

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
