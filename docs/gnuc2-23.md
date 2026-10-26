# gnuC2-23: a third complete design

The Swoop2 and the Tuluaq-19 had been read exactly, and between them they
exercise most of what LEparagliding does. Not all of it: each file takes only
the paths its design needs, and a third design took several neither had.

The **gnuC2-23** is Laboratori d'envol's 23 m² wing, 30 cells a side and a
cell of no width at the centre, drawn in LEparagliding 3.28 "Jardins" (files
of 20260429). Its archive, `20260429_gnuC2-23.zip`, was supplied with this
round, with its input, the program's own output, its 2D and 3D drawings —
which its README calls "not edited" — and the program's source. On file in
`data/reference/lep`:

| file | what it is |
| --- | --- |
| `gnuc2-23-20260429.lep` | the input, `leparagliding.txt`, LF line ends, one character in a comment that is not ASCII |
| `gnuc2-23-gnuC2.txt` | its section |
| `gnuc2-23-lep-out.txt` | the program's own output, which the suite holds the tool to |
| `gnuc2-23-cut-parts.tsv` | every piece in its 2D cutting file, measured |

## 1. What it has that the others do not

- **A shark nose.** Section 21's rod type 3: every rib but the tip carries
  two rods, one from the upper surface round the nose to the intake and one
  along the intake on the lower surface, each bent by its own parabola at
  its end (the program's `joncst3s` and `joncst3i`). `lepJoncs` builds both,
  and the pockets beside them.
- **V-ribs as separate strips.** Section 12's type 3, eighteen rows from
  five anchor ribs: a strip from an anchor on the rib's lower surface up to
  the rib beside it, to one side or both (`docs/internal-structure.md`).
- **Pieces between ribs on the lower surface.** 84 of its 93 pieces between
  two ribs have an edge on a rib's lower surface, 57 both, and the program
  draws such an edge straight between its ends rather than along the
  surface: a case its source does not guard.
- **A flat tip rib.** Section 30 thins rib 31 to nothing.
- **3D shaping.** Section 29 cuts every upper panel in two at section point
  73 (`docs/panels.md`).
- **Cells closed on a diagonal.** Section 26's −2 on rib 27: the lower panel
  of cell 26 runs over the whole intake at its outer rib and none at its
  inner, and cells 27 to 30 are closed outright.
- **Three risers** and 40, 40 and 20% of the load on their rows, with the
  stabilo lines from the C riser to the A and B anchors of ribs 29 and 31.

## 2. What reproduces

Held to the program's printed output, as the other two are:

| | the program's output | the tool | worst |
| --- | --- | --- | --- |
| flat area, span, aspect ratio | 23.00 m², 11.98 m, 6.25 | 22.998, 11.985, 6.246 | |
| projected area, span, aspect ratio | 19.60 m², 9.67 m, 4.77 | 19.601, 9.670, 4.771 | |
| every rib's chord | section 3 | 31 of 31 | 0.005 cm |
| rib contour lengths, the flat tip's included | section 6 | 4 ribs checked | 0.004 mm |
| φ and χ on every rib, χ 7.22° at the tip | section 12 | 31 of 31 | 0.005° |
| all 95 lines' length, cut length, load and type | section 4 | 95 of 95 | 0.049 mm, 0.0050 kg, none |
| lineset 274.50 m, 312.42 m with loops | section 4 | to the printed figure | |
| weight 0.526 kg, frontal area 0.481 m² | section 4 | to the printed figure | |
| metres to buy of each of five types | section 4 | to the printed figure | |
| karabiner 723.12 cm deep, 77.76 aft, 21.00 out | section 2 | to the printed figure | |
| angle of attack 4.51°, assiette 0.93° | section 2 | to the printed figure | |
| 30 upper and 30 lower rods, 42.32 m both sides | section 8 | every rod | 0.05 cm |
| 117 internal entries: 6 straps, 93 pieces between ribs, 18 V-ribs | its input, section 12 | none unread | |

The lines, the main parameters and the chords matched on the first load: the
importer needed nothing new for them. The rods, the V-ribs and the pieces on
the lower surface did.

## 3. What it found

**The tip rib's φ.** The tool measures φ, the angle between a rib's plane
and the glide path, from the built rib: the normal to the plane through its
chord and the middle of its lower surface. On a flat rib that point lies on
the chord, the two directions are parallel and their cross product points
anywhere: φ came out 0.70° against the program's 0.01. A section thinned to
nothing now takes its plane from the frame the placement built.

**Every rib's cutting line.** A rib was cut on this tool's offset of its
outline, mitred at the trailing edge. The program moves each point of the
section by the allowance along the mean of its two segments' angles and
closes the line through the trailing edge itself (its 6.11, the same in all
three versions). The mitre's spike had put 2 to 3 cm² on every rib of every
design: 0.03% at the root, 0.35% on this design's rib 30, 2.5% on the
Swoop2's tip. All three files' ribs now come out to 0.002% of their area.
The flat tip rib's line runs out to the nose and back on itself, because the
program reads a point on the chord line as the upper side as far as the
intake; the strip it cuts starts there, 141.03 cm², and the tool's is the
same to 0.001%.

**Holes as the program draws them.** Its ellipses are polygons of 39 sides
before 3.30 and of 60, or what section 37's code 3002 says, after. The
tool's had 48, and every hole of the two designs drawn before 3.30 was 0.15%
off; each rib's now takes out its file's area to the hundredth of a cm² the
file is written to.

**Seam matching.** Section 5's `1000 1.0` — in all three files — is the
program's perfect matching, which stretches each panel's sewing edge back
to its rib's length. Reproduced for this design, it explained the Tuluaq's
tip panel, 0.14% off and unexplained before (`docs/panels.md`).

**The trailing-edge mini-ribs.** They were the last pieces of any design not
built, because the program raises each one's front to meet the billow of
the cloth over it. That billow is its `hautok`: the panel's width at a point,
as cut, standing over the straight line between the ribs as an arc. With it,
this design's 29 come out to its file's rounding, piece by piece — the
first rising 2.25 cm at its front — and the other two designs' 25 and 16,
the Swoop2's 100 holes in them included (`docs/internal-structure.md`,
section 5).

## 4. Against its cutting file

| | pieces | the file, a side | worst piece |
| --- | --- | --- | --- |
| upper panels, front and rear | 60 | 15.5406 m² | 0.007%, 2.5% the tip's front |
| lower panels | 30 | 12.7994 m² | 0.0007%, 0.011% the closed tip cells |
| ribs, its 12 mm allowance on | 31 | 14.7666 m² | 0.0009%, the flat tip |
| their holes, nine a rib | 270 | | 0.005 cm² |
| V-rib strips | 24 | 0.9666 m² | 0.0020% |
| pieces between two ribs | 93 | 4.0095 m² | 0.0027% |
| straps | 6 | 0.1574 m² | 0.0023% |
| rod pockets, upper and lower | 60 | 0.5406 m² | 0.010%, the file's rounding |
| trailing-edge mini-ribs | 29 | 0.7476 m² | 0.0067%, the file's rounding |

The front piece of the tip cell's upper panel runs its edge along the flat
rib to the leading edge and back, and crosses itself; it is held to 3% of the
file's signed area. The lower panels of the four closed tip cells are 0.3 mm
off at the intake's first points, where the program lays the intake out by
itself and joins it to the panel. Every lower panel and rear piece is its
file's length to 0.9 mm, every rib to 0.05 mm.

## 5. In the interface

The picker lists it with the other two. The interface test loads it there
and holds it to its 23.00 m², its 31 half-ribs, its 7.23 m hang, its 60 rods,
its upper panels in two (60 pieces labelled in the panels file) and its bill
of materials: 113.5 m of Line160 in 60 pieces, 94.5 m of Line275 in 26,
41.4 m of rods in 118 — its centre rib's once, where the program's 42.32 m
counts them twice. Its flat tip rib draws on the Rib tab.

The bill weighs its ribs as its program cuts them, 28.80 m² for the wing
with its centre rib once, like its sail and its internal structure: nothing
it has is left with its allowance off. Its 29 trailing-edge mini-ribs a side
are rib cloth too, and their own item: 58 for the wing, 1.50 m².

The Diagonals summary is this tool's model at 51 of its places — the V-rib
strips, and the 27 pieces between ribs that run from an anchor to the rib
beside it. Its other 66 pieces join ribs too, and the summary says that its
findings about ribs held from one side, or not reached at all, are on the
model.

## 6. Not compared

- Section 28 and the program's output section 7, the calage and risers as
  the speed system or trimmers move: the tool does not read section 28.
- Its 3D drawing: the panels and pieces are checked against the 2D cutting
  file, the geometry against the printed output.
- Its section 9, the 3D shaping's ovalization at each rib (d1, d2).
