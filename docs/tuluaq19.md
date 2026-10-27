# Tuluaq-19: a second complete design

The Swoop2 was the only LEparagliding design this tool had read, and it read
it exactly. That shows the importer is right about the Swoop2. It does not
show it is right about the program, because one file exercises only the
paths that file happens to take.

The **Tuluaq-19** is the second: Crazy Bird's 19 m² wing, drawn by
Laboratori d'envol in LEparagliding 3.25 (files of 20250107), published at
laboratoridenvol.com/projects/Tuluaq with its input, the program's own
output and its cutting files. On file in `data/reference/lep`:

| file | what it is |
| --- | --- |
| `tuluaq19-20250107.lep` | the input, `leparagliding.txt`, with the CRLF line ends it was published with |
| `tuluaq19-gnua.txt` | its section |
| `tuluaq19-lep-out.txt` | the program's own output, which the suite holds the tool to |
| `tuluaq19-cut-parts.tsv` | every piece in its 2D cutting file, measured |

## 1. It crashed the tool

Loaded in the interface, it threw a `TypeError` in the brake geometry. Behind
that were three faults, each a detail of the program the Swoop2 never
exercised.

**A brake anchor at exactly 100% of chord was not found.** The program finds
an anchor by walking the lower surface for the two points either side of
`chord × percent / 100`. Rib 13's chord is 170.21295102283997 cm, and that
times 100 over 100 is 170.21295102284: past the trailing edge, so nothing
brackets it. The program compares in single precision, where the two are
equal. So does the importer now.

**An anchor ahead of the intake stays at the section's origin.** The tip
rib's A anchor is at 0%. The program searches only the lower surface after
the intake, finds nothing there, and leaves the coordinates it started with:
zero, which is the section's own origin, its leading edge. The importer had
put that anchor at the origin of the wing, 4.4 m away, and the lineset came
out 254.47 m against the printed 247.39. It now does what the program does,
and says so in a note on the line geometry.

**The webbing riser was read as a round line made of "daN".** Section 34
gives a rectangular type (`r`) one more column than a round one (`c`), so the
label, strength, material and weight were read one column early. The
program also counts a rectangular riser's frontal area without its loops,
and with them the total came out 0.380 m² against the printed 0.363.

## 2. What reproduces

Held to the program's printed output, as the Swoop2 is:

| | the program's output | the tool | worst |
| --- | --- | --- | --- |
| flat area, span, aspect ratio | 19.00 m², 9.04 m, 4.30 | 19.003, 9.038, 4.299 | |
| projected area, span, aspect ratio | 16.56 m², 7.40 m, 3.31 | 16.561, 7.403, 3.309 | |
| every rib's chord, section thinned 0.9 / 0.8 / 0.1 | section 3 | 18 of 18 | 0.005 cm |
| rib contour lengths, root to tip | section 6 | 4 ribs checked | 0.004 mm |
| φ and χ on every rib, φ up to 7.41° at the tip | section 12 | 18 of 18 | 0.005° |
| all 89 lines' length, cut length, load and type | section 4 | 89 of 89 | 0.049 mm, 0.0050 kg, none |
| lineset 247.39 m, 282.59 m with loops | section 4 | to the printed figure | |
| weight 0.382 kg, frontal area 0.363 m² | section 4 | to the printed figure | |
| metres to buy of each of five types | section 4 | to the printed figure | |
| karabiner 617.12 cm deep, 93.36 cm aft | section 2 | to the printed figure | |
| angle of attack 7.41°, assiette 0.72° | section 2 | to the printed figure | |
| 14 nose rods a side, 17.80 m both sides | section 8 | to the printed figure | |
| nine holes on ribs 1 to 17, none on the tip | its cutting file | area per rib | 0.006 cm² |
| 36 diagonals and 24 straps, 40 diagonal pieces | its input, section 12 | none unread | |
| vault arrow 1.69 m, line height 6.17 m, karabiners to tip 5.46 m, centroid 52.62%, the wing's mass centre 108.38 and 60.32 cm | section 1 | to the printed figure; the arrow is the arc's 2.02 m scaled twice (`docs/gnuc2-23.md`) | |

The holes are checked against the design's own cutting file rather than its
output, which prints no hole areas: each rib's holes, as the tool builds them
from section 4 — the program's 39-sided polygons, as 3.25 drew them — take
out the area the cut rib has removed, to the hundredth of a cm² the file is
written to. (The tool's 48-sided ones were 0.15% off, found on the
gnuC2-23: `docs/gnuc2-23.md`.)

## 3. In the interface

The picker lists it beside the Swoop2 as a complete design: its own planform,
section, anchors, line plan, rods, holes and diagonals rather than a
specification the tool fills in. The interface test loads it there and holds
it to its area, its 18 half-ribs, its 6.17 m hang and its bill of materials:
140.3 m of PPSL65 in 96 pieces and 53.3 m of TSL280 in 18.

Its D row hangs from its C riser, and the tool first read every D line as a
stabilo line — any line to a row other than its riser's was taken for one.
The load model gives the stabilo none of the lift, so the D row, a tenth of
the wing's load in the program's own output, carried nothing in the tool. A
row with no riser of its own is now that row: the D row takes 10.5% of the
load in the tool's model, and only the four lines from the B riser to the A
and C anchors of the tip ribs are stabilo lines.

Its ribs carry their load the way `docs/rib-stress.md` describes, and its own
holes leave room for it: every loaded anchor but the tip rib's A at 0% pulls
inside a fan that reaches the upper seam 10 mm clear of every hole, 24 to 67°
wide as it works.

## 4. What its cutting file says about the tool

The cut-parts table measures every piece in the design's 2D file at its cut
size — panels, ribs, diagonals, straps, the trailing-edge mini-ribs and the
rod pockets — with the seam allowances the design's section 6 sets: 15 mm
along the panels' sides and on the ribs, 25 mm at the leading edge, 10 mm at
the trailing edge.

Its panels, as the tool now cuts them from its file (`lepPanels`), are the
file's: 12.615 and 10.227 m² a side against 12.615 and 10.227, every panel
within 0.011% and every cut line the file's length to 2 mm. The tip panel
was 0.14% over until the program's seam matching, which its section 5 asks
for, was reproduced on the gnuC2-23. Its ribs are cut as its program cuts
them, with its own 15 mm, every one to 0.002% — the tip's, thinned to a
tenth, included; they were within 0.25% on all but the tip. `docs/panels.md`
has how, and what was missing before: where the surfaces part, the skin
tension, the intakes its section 26 closes, its own allowances and the
seam matching.

Its internal structure is cut as its program cuts it: its ten full
diagonals a side, each one piece across all four rows with three parabolic
cut-outs, its 24 straps and its 14 rod pockets, every piece within a part in
ten thousand of its file's (`docs/internal-structure.md`). Its file was drawn
by the program's 3.25, as its header says, which left the seam allowance
whole across each cut-out, and the tool cuts it so: 10.77 m² for the wing
in the bill, 0.30 m² more than 3.30 would cut. Its 16 trailing-edge mini-ribs a
side are built too, as its program drew them, to its file's 4455.32 cm² in
total.
