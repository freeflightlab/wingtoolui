# LEparagliding interoperability

`leparagliding.txt` is the input format of the author's own FORTRAN design
program, LEparagliding. Supporting it connects this tool to the reference
implementation and to the large body of published designs built with it.

Specification: the [LEparagliding user
manual](https://www.laboratoridenvol.com/leparagliding/manual.en.html),
section 6. The file in this repository, the Swoop2's, is a 3.30p input.

---

## The governing constraint

The Swoop2's file has **37 sections**, numbered up to 39. This project writes
four of them and reads fourteen.

| Section | Content | Here |
| --- | --- | --- |
| 1 | Geometry matrix | read + written |
| 2 | Airfoils, air intakes | read + written |
| 3 | Anchor points | read + written |
| 8 | Angle-of-attack and line-length estimate | read + written |
| 4 | Airfoil holes | read: the design's own lightening holes |
| 9, 10, 11 | Suspension lines, brakes, ramification lengths | read: the line plan, built as the program builds it |
| 12 | H, V and VH ribs | read: the straps and diagonals, rib by rib |
| 18 | Elastic lines corrections | read: the load and stretch of every line |
| 21 | Nylon rods | read |
| 27 | Special wing tip | read (the angled tip, type 1) |
| 30 | Airfoil thickness modification | read |
| 34 | Lines characteristics table | read: the design's own line types |
| 5–7, 15–17, 19, 20, 22–26, 28, 29, 31–33, 35–39 | Skin tension, sewing allowances, marks, colours, extra rib points, DXF options, mylars, tabs, glue vents, calage variation, 3D shaping, parts separation, detailed risers, the program's own equilibrium solver, XFLR5 export… | **carried through untouched** |

So the design rule is: **never discard what is not understood**. A file is
parsed into an ordered list of sections, each keeping its exact original
lines. Understood sections are additionally decoded; the rest ride along and
are written back byte for byte.

This is what makes the round trip safe. A designer can bring in a real wing,
change the planform here, write it out, and their mylars and marks will be
exactly as they left them. `writeLep(parseLep(t)) === t` is asserted on the
Swoop2's file, sections this project has no model for included.

What is *read* is a complete design: `docs/swoop2.md` sets the result beside
the program's own output, line by line.

---

## Conventions that differ, and must be converted

These are the traps. Each is a silent wrong answer if missed.

**Units.** LEP works in centimetres throughout section 1. This project works in
metres.

**Axes.** LEP uses X spanwise, Y chordwise, and Z *"growing vertical from the
wing to the pilot"* — that is, **downward**. This project uses x chordwise,
y spanwise, z **upward**. So `lepZ = -100 * z`. Getting this wrong produces a
wing arced the wrong way, which still develops into plausible-looking panels.

**Wing scale.** A scale factor in section 1 multiplies the entire geometry
matrix. The Swoop2's file carries 0.847342687, so reading the matrix at face
value overstates the wing by 18% in every length. The lines are scaled by it
too; the risers are not.

**Whole-wing counts, half-wing matrix.** Section 1 declares cells and ribs for
the *whole* wing, but the matrix lists only one half. The Swoop2 has 50 cells,
51 ribs and **26 matrix rows**: the centre rib plus twenty-five out to the
tip. Reading the declared rib count as the row count is the obvious wrong
turn, and it fails loudly here rather than truncating the wing.

An even rib count means a central cell of non-zero width and no rib on the
axis, so the half has exactly `ribCount / 2` rows.

---

## Import

The geometry matrix is discrete per-rib data, which feeds `discretePlanform`
directly. The per-rib **dihedral, washin and Z rotation are used as given**,
not re-derived from this tool's distributions — the file's wing is the wing,
and a recomputed approximation of it would be a different one. `buildWing`
takes an `explicitRibs` array for exactly this.

Anchor positions, air intake extents and line length are also read across, so
an imported design arrives with its own section and line geometry rather than
this tool's defaults.

## Export

Sections 1, 2, 3 and 8 are rewritten from the model. If a file was imported it
is used as the template, so everything else is preserved. Otherwise
`blankLepDocument()` generates a complete valid file, using the manual's own
recommended invariant blocks for sections 19 and 20 and the documented "off"
form for everything that needs a real design decision — rib holes, V-ribs,
colours, rods. Turning those on should be a deliberate act, not a default.

The wing scale is written as 1.0 with the matrix carrying true dimensions.
Preserving an imported scale and dividing the matrix by it would also round
trip, but it makes the file harder to read and invites scaling twice.

---

## Validation

Checked against the **Swoop2**, Laboratori d'envol's 18 m² design, whose input
file and program output are in `data/reference/lep`:

| | the program | computed from the import |
| --- | --- | --- |
| flat area | 18.00 m² | **17.999 m²** |
| cells / ribs | 50 / 51 | 50 / 51, 26 matrix rows |
| flat span | 10.48 m | 10.482 m |
| projected span | | 8.457 m (80.7% of flat) |
| root chord | 2.0907 m | 2.0907 m |
| tip chord, with the special wingtip | 60.78 cm | 60.777 cm |

The area is the strong one: it is computed by integrating the imported
planform, so it exercises unit conversion, wing scale and the geometry matrix
together.

A wing written out and read back keeps its geometry to **0.1 mm**, which is
the format's own resolution — the matrix is written to two decimals in
centimetres. It is asserted at that rather than at machine precision, because
that is what the format can actually carry.

The file uses the 2021 Z-rotation feature, with yaw rising to 4.07° at the
tip, and this tool places every rib where the program does: the rib plane's
angle to the glide path and the local angle of attack agree with the
program's own table to 0.005° on every rib.

(This section used to describe a second file, gnuC2-27. It was checked once,
is not in the repository, and nothing here holds it.)

---

## Not read

Sections 5 to 7 (skin tension, sewing allowances, marks), 22 and 23 (mylars
and tab reinforcements), 26 (glue vents), 28 (calage variation), 29 (3D
shaping), 31 (the newer skin tension module), 33 (detailed risers) and 35 (the
program's own equilibrium solver inputs). All are round-trip safe.
