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
planform arithmetic. It was followed by the comparison this section named as
the next step: the design publishes its own line geometry, loads and 3D
surfaces, and the suite now holds the tool to all of them —

| | against the program's own output | worst |
| --- | --- | --- |
| all 93 lines' lengths, cut lengths and types | `lep-out.txt` | 0.046 mm, 0.049 mm, none differ |
| every line's load | `lep-out.txt` | 0.0049 kg |
| the A anchors | the program's 3D DXF | 0.0060 mm |
| every rib's placement, and undoing it for cutting | the program's geometry | 1e-12 mm |
| φ and χ on every rib | `lep-out.txt`, section 12 | 0.005° |
| rib contour lengths | `lep-out.txt`, section 6 | 0.007 mm |
| karabiner position, angle of attack 4.32°, assiette 1.39° | `lep-out.txt` | to the printed figure |
| lineset weight 0.468 kg, frontal area 0.426 m² | the program's totals | to the printed figure |
| every panel's cut area, upper and lower | its cutting file, measured | 0.04% |

The panels came last. Its cutting file could not be read by joining
segments (section 5), so every piece in it was measured as a closed outline
(`swoop2-cut-parts.tsv`), and the design's own panels, as `lepPanels` cuts
them from its file, are within 0.04% of every one but the tip's upper panel,
which its file draws open: 11.722 and 9.751 m² a side against 11.719 and
9.750. `docs/panels.md` has the four things that took.

Its internal structure is cut the same way: its 13 full diagonals, 15 pieces
between two ribs, 70 straps and 50 rod pockets a side, every one within a
part in ten thousand of its file's, 11.87 m² for the wing
(`docs/internal-structure.md`). What it still does **not** settle is its 25
trailing-edge mini-ribs a side, cut from a billow the tool does not
reproduce, and the aerodynamics: the design publishes no polar to compare a
polar with.

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
nested    23.192465 m2
from DXF  23.192464 m2      0.000003%
```

(That is the suite's round trip, on its 12-cell test wing. The figure here was
17.9961 m², from a wing this page did not name and no set-up now reproduces.)

**The export was correct all along.** The cutting files this project has
produced are fine; the reader written to check them was not. Worth stating
plainly, because for a while there was a number on the table suggesting the
tool's cutting files were three times wrong, and they never were.

The reader runs against the three DXFs the interface exports — ribs, panels
and diagonals — in the interface test. (For a while that block read nothing:
the files it looked for had been cleared by later steps, and it printed "0
exported DXF files read back and valid" as a pass. It captures them at the
first sweep now, and fails if any of the three is missing.)

### Rebuilding outlines from loose segments

`outlinesFromSegments` puts closed outlines back together from unordered
`LINE` entities: endpoints snapped to a tolerance, an adjacency built, loops
walked out of it. Exact on a shuffled square and triangle, and exact on this
project's own panels exploded into shuffled segments and rebuilt: in the suite,
the test wing's 24 panels from 1,920 segments, 24 of 24 with the area to
1e-9 m²; on a wing of the Swoop2's 25 cells a side, 50 of 50 from 2,400.

Where more than two segments meet, the walk **stops rather than guessing**. A
junction is where two outlines touch, and guessing there is how a
reconstruction quietly merges two panels into one.

### And it does not crack the Swoop2, for a reason worth stating

Run against the real file, it finds 1,335 closed loops totalling 0.111 m² —
against the ~18 m² of developed panel that is actually in there. It does not
work, and the connectivity says why:

```
degree 1:   2,009 points      loose ends
degree 2:  54,732 points      clean outline, 75%
degree 3+: 16,463 points      junctions
```

The file draws **everything on one layer** — panel outlines, registration
marks, hole boundaries, seam lines — with shared endpoints. Only 75% of points
join exactly two segments, where a clean set of outlines would be near 100%.
Connectivity alone cannot separate a panel from the marks drawn on it.

Separating them needs either layer information the file does not carry, or
spatial clustering rather than graph walking. That is the honest state:
**the reconstruction is correct and the input is not separable by it.**

The tool is still worth having — it works on any file that draws its cut lines
cleanly, and it is proven against known answers rather than against itself.

The pieces were measured another way, once, for the reference table: from
the file's own frames "for cutting table", by colour, with each piece found
as a face of the drawing's segments rather than by walking from one end.
How, and the checks on it — rib 1 at its section's area plus its allowance
to 0.04% — are in the header of `swoop2-cut-parts.tsv`. That is a
measurement made outside the tool, not something it does.
