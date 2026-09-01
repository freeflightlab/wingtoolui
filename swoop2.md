# Swoop2: validating against the source method's own design

This project implements the Laboratori d'Envol handbook. Their own published
design is therefore the closest thing to ground truth it can have — not
another manufacturer's wing to be compared against, but the method's author
demonstrating the method.

**Swoop2, 18 m², LEP format 3.30p, version 20260829.**

## 1. Every published figure reproduces

The design ships its own computed output in `lep-out.txt`. Read through this
project's LEP importer:

| | imported | published |
| --- | --- | --- |
| flat area | 18.00 m² | 18.00 m² |
| flat span | 10.48 m | 10.48 m |
| root chord | 2.0907 m | 2.0907 m |
| cells | 50 | 50 |
| ribs | 51 | 51 |

**37 sections parse**, including 15 to 39 — the reader had been documented as
covering 1 to 8, and had never been given a file that used the rest.

The line list converts with **all 93 names recognised**, and totals 241.92 m
against a published 239.09 m without loops — 1.2% over, because the sheet
includes the risers that the published figure counts separately.

## 2. Prefix levels count in opposite directions

The valuable finding. Two makers number cascade levels with a prefix, and they
count opposite ways:

```
Advance TAU DLS    1A3 is at the CANOPY,  4AB1 at the riser
LEparagliding      1A1 is the RISER,      4A1  at the canopy
```

LEP follows the **PMA standard**, which counts main lines as level 1. Advance
does not. Neither is wrong — they are conventions — but a parser assuming one
**silently inverts the other**, reporting a riser as an upper line and a
canopy line as a main.

This project's parser assumed Advance's. On the Swoop2 it produced 4 "uppers"
averaging 988 mm and 48 lines at "cascade-4" averaging 775 mm, which is a
cascade upside down.

### Reading the direction from the geometry

`detectPrefixDirection` does not look at the naming at all. A cascade
converges, so **the level nearest the canopy has the most lines and the
shortest ones**. That is a fact about the wing rather than about the
convention, so it works on a sheet that declares nothing:

```
Swoop2       depth 4: 48 lines at  775 mm   ->  riser-first
             depth 1:  4 lines at  988 mm
```

`applyPrefixDirection` relabels accordingly, and a canopy-first sheet passes
through unchanged. Both directions are asserted, along with the case of too
few levels to tell — reported rather than guessed.

## 3. The published loads, and a bug they found

The design also publishes a load in kilograms for every one of its 93 lines.
That tests the load model rather than the importer.

**The load closes at every cascade level** — 25.3 kg per side at levels 1, 2
and 3, and 24.2 at level 4. That is the same invariant this project's own
closure check asserts, here confirmed against the source method's own
arithmetic rather than against itself.

### Ten per cent of the load was going to a row that does not exist

The Swoop2 is a **three-riser** wing. Its published riser loads give:

```
A 38.3%    B 38.3%    C 23.4%
```

The handbook convention is A 35 / B 35 / C 20 / D 10, written for a four-row
wing. Applied unchanged to a three-row wing it returns that table verbatim —
**assigning 10% of the load to a D row the wing does not have**, and leaving
every real row carrying a tenth less than it should.

Renormalised over the rows the wing actually has:

```
A 38.9%    B 38.9%    C 22.2%
```

Within about a point of the published figures, which is what says the
convention is right and the arithmetic was wrong. A four-row wing is left
untouched, and the result reports `renormalised` so the difference is visible
rather than silent.

This is the value of validating against the method's author: the convention
had been checked against four-row wings for the whole project, and every one
of them hid the bug.

## 4. What this does not settle

The geometry reproduces exactly, which validates the importer and the
planform arithmetic. It does **not** validate the aerodynamics, the load
model, or the panel development against this wing — the design publishes its
own line loads and 3D surfaces, and comparing those is the obvious next step.

---

## 5. Reading DXF back, and one thing left unexplained

Comparing panel development against the Swoop2's own cutting file needs a DXF
reader, and this project had never had one. It has **written** DXF since
Phase 1 — panels, ribs, diagonals, marked panels — and every file was checked
by counting the polylines it *meant* to write, which is not the same as
checking what a cutter would find in it.

`parseDXF` closes that. On a synthetic 2 x 3 rectangle it returns an area of
exactly 6. Panels and ribs round-trip with every entity accounted for.

Two bugs on the way, both in the reader:

**It found zero points in every file this tool has ever written.** The writer
emits the classic `POLYLINE` form, where the points live in following `VERTEX`
entities rather than inside the polyline. A reader that only looked inside
found nothing.

**Then it found zero polylines.** The flush refuses to emit while a polyline
is still awaiting vertices, so flushing *before* clearing that flag left every
polyline unpushed and the reader returned only `TEXT`.

### The 3.24x, explained — and it was the reader

The round trip came out **3.24 times** the area that went in, varying from
4.1x to 10.8x per panel. That varying ratio was the clue: a uniform scale
error is uniform.

A classic `POLYLINE` header carries a **mandatory dummy point at the origin**
— DXF calls it the elevation point — before its `VERTEX` entities begin. Read
as a vertex it puts a spurious `(0,0)` into every outline, and a shoelace
polygon with an extra point at the origin encloses a wedge back to it. The
size of that wedge depends on how far the panel sits from the origin, which
is why the ratio varied.

```
nested    17.996100 m2
from DXF  17.996101 m2      0.000005%
```

**The export was correct all along.** The cutting files this project has
produced are fine; the reader written to check them was not. Worth stating
plainly, because for a while there was a number on the table suggesting the
tool's cutting files were three times wrong, and they never were.

The reader now runs against every DXF the interface exports, in the interface
test — verified by breaking the writer and watching it fail.

### What is still not done

The Swoop2's 2D file draws its panels as **83,776 individual LINE segments**,
not polylines. Reconstructing closed outlines from unordered segments is a
graph problem, and comparing development against that file still needs it.
