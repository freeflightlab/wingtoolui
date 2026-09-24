# LEparagliding interoperability

`leparagliding.txt` is the input format of the author's own FORTRAN design
program, LEparagliding 3.28. Supporting it connects this tool to the reference
implementation and to the large body of published designs built with it.

Specification: the [LEparagliding user
manual](https://www.laboratoridenvol.com/leparagliding/manual.en.html),
section 6.

---

## The governing constraint

The format has **37 sections**. This project models four of them.

| Section | Content | Here |
| --- | --- | --- |
| 1 | Geometry matrix | read + written |
| 2 | Airfoils, air intakes | read + written |
| 3 | Anchor points | read + written |
| 8 | Angle-of-attack and line-length estimate | read + written |
| 4, 5, 6, 7, 9–12, 15–37 | Rib holes, skin tension, seam allowances, marks, lines, V-ribs, colours, nylon rods, mylars, tabs, DXF options, vents, wingtips, calage study, 3D shaping, risers, line tables, XFLR5 export… | **carried through untouched** |

So the design rule is: **never discard what is not understood**. A file is
parsed into an ordered list of sections, each keeping its exact original
lines. Understood sections are additionally decoded; the rest ride along and
are written back byte for byte.

This is what makes the round trip safe. A designer can bring in a real wing,
change the planform here, write it out, and their nylon rod pockets and
diagonal ribs will be exactly as they left them. `writeLep(parseLep(t)) === t`
is asserted on a file containing sections this project has no model for.

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
matrix. The gnuC2-27 file carries 1.03468783, so reading the matrix at face
value understates the wing by 3.5%.

**Whole-wing counts, half-wing matrix.** Section 1 declares cells and ribs for
the *whole* wing, but the matrix lists only one half. A 60-cell wing has 61
ribs and **31 matrix rows**: the centre rib plus thirty out to the tip. Reading
the declared rib count as the row count is the obvious wrong turn, and it fails
loudly here rather than truncating the wing.

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

Checked against **gnuC2-27**, a real 60-cell design published by Laboratori
d'envol:

| | expected | computed from the import |
| --- | --- | --- |
| flat area | 27 m² (the file is named `gnuC2-27`) | **27.00 m²** |
| cells / ribs | 60 / 61 | 60 / 61, 31 matrix rows |
| flat span | — | 12.985 m |
| projected span | — | 10.478 m (80.7% of flat) |
| root chord | — | 2.553 m |

The area is the strong one: it is computed by integrating the imported
planform, so it exercises unit conversion, wing scale and the geometry matrix
together, and it lands on the figure in the wing's own name.

Round-trip drift on the geometry is **0.09 mm**, which is the format's own
resolution — the matrix is written to two decimals in centimetres. It is
asserted at 0.1 mm rather than at machine precision, because that is what the
format can actually carry.

The file also turns out to use the 2021 Z-rotation feature, with yaw angles
rising to 4.33° at the tip. Measured against a glide path at its stated 9.45°
angle of attack, this project's φ diagnostic reports 4.77° of residual
misalignment — the designer applied roughly half of what full alignment would
need, which the study explicitly leaves to their judgement.

---

## Not yet read

Decoded structurally but not mapped into the model: sections 9–11 (the line
cascade matrix, which is richer than this project's centroid method), 12
(V-ribs), 29 (3D shaping), 34 (line characteristics), 35 (the program's own
equilibrium solver inputs). These are all round-trip safe today; reading them
is Phase 2 and 3 work.
