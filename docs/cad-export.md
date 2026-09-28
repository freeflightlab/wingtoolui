# The wing as a 3D model

Every other export in this tool is a flat pattern — what gets cut. This one is
the wing in the air, for CAD.

## Why OBJ

The thing being exported is two surfaces, a set of ribs, and a few hundred
**lines**. That last part decides it.

| format | carries lines | grouping | support | verdict |
| --- | --- | --- | --- | --- |
| **STL** | **no** | none | universal | writes the sail, silently drops the rigging |
| **IGES** | yes | poor | uneven, legacy | no clean way to name parts |
| **STEP** | yes | real assembly tree | excellent | most information, wrong trade here |
| **OBJ** | **yes** | named groups | universal | chosen |

**STL** cannot represent a line at all. Half of a paraglider is its line
cascade, so an STL of one is a sail and nothing else.

**STEP** carries the most information of any of them — true B-rep surfaces and
a real assembly tree — and for a machined part it would be the right answer.
It is the wrong answer here. Writing valid AP214 means emitting a correct
entity graph of cartesian points, b-spline surfaces, faces, shells and product
structure, and any mistake produces a file that opens as nothing. A paraglider
has no parametric feature tree to preserve: its surfaces are ruled between rib
curves, so a mesh loses essentially nothing.

**OBJ** is the only light, universally-read format carrying polygon surfaces
*and* polylines *and* named groups in one plain-text file. Blender, Rhino,
Fusion, FreeCAD, MeshLab and every three.js viewer read it.

## What comes out

```
o Swoop2
v ...                    2299 vertices, one pool
g upper_surface          quads between rib curves
g lower_surface
g ribs                   closed polyline per rib
g lines_A                polyline per line
g lines_B
g lines_C
g lines_D
```

Groups share the vertex pool, which is what makes them **grouped but
independent**: each is separately selectable and hideable, while a rib edge
*is* the panel edge beside it rather than a duplicate sitting on top of it.

Metres. X chordwise, Y spanwise, Z up. About 130 KB for a 24-cell wing.

The **whole** wing is written, not the half that is modelled — a CAD model of
half a paraglider is a curiosity. The mirrored half has its faces wound the
other way so normals face outwards, and a centre cell is written once because
it belongs to neither half.

The spanwise extent is the **projected** span, not the flat one, because this
is the wing flying rather than the pattern.

## Negative zero cost 181 vertices

Mirroring the centreline gives `y = -0`, which prints as `-0.000000` and keys
differently from `0.000000`. The same point was stored twice, so the sharing
quietly failed wherever a vertex sat on the centreline.

Four copies of the trailing-edge point were visible; removing the sign took
**181 vertices** out of the file. A CAD package reading the original sees
coincident vertices and an open edge where there is none.

A test asserts no vertex is written twice, and that `-0.000000` never appears.

---

## A proper leading edge

The surfaces met at the nose exactly — but the nose was one straight cut
across the roundest part of the section.

A wing is built with as few points per surface as the panel work needs, 24 is
typical, and they are spread **evenly along the surface**. On a 2.19 m chord
that put the first station at **2.53% chord**, with 96 mm gaps at the nose and
96 mm gaps in the flat middle. The aerofoil generator itself uses cosine
spacing at 80 points; resampling to 24 threw that clustering away.

The export re-samples the ribs at 60 points with cosine spacing, which
clusters them at both ends:

| | first station | nose gaps |
| --- | --- | --- |
| as built | 2.53% chord | 55, 82 mm |
| in the model | 0.04% chord | 0.9, 2.6 mm |

### Why not fix it in the wing

Because it changes what gets sewn.

Switching cosine spacing on globally made three tests fail, and one was real:
ovalization stopped easing the two seams of a panel in opposite directions —
the deltas went from `+0.087%` against `-0.074%` to both positive. That is an
effect on a cutting file, and I do not yet understand it.

A leading edge in a 3D model is not a reason to change a pattern. The export
asks for the finer sampling; the wing is left alone, and a test asserts the
rib point count is the same before and after exporting.

## The lines are there, and now visible

They were in the file and invisible. OBJ's `l` element is **optional**, and a
great many importers read only faces — so a model with 362 polylines of line
cascade opened as a bare sail in most viewers.

Each line is now also swept into a **tube**, which is geometry every viewer
draws.

### At its real diameter

Not a nominal thickness. The diameter comes from the line selection, which
runs 0.43 to 2.50 mm across the catalogue, so the model is to scale: an A line
really is thicker than a brake line and a designer can see which is which.

On a typical wing the selection chose six sizes and all six are in the model:

| chosen | 0.50 | 0.60 | 0.65 | 0.80 | 0.83 | 1.10 mm |
| --- | --- | --- | --- | --- | --- | --- |
| **in the model** | 0.50 | 0.60 | 0.65 | 0.80 | 0.83 | 1.10 mm |

### True scale, and why not to fudge it

At true scale a 0.5 mm line on a 10.3 m span is **1/20,605 of the model** —
sub-pixel at any sensible zoom. The whole cascade was in the file and the
model still opened looking like a bare sail.

The obvious fix is to draw the lines thicker, and for one round that was the
default. **It was wrong.** A model whose dimensions are not the design's
dimensions is not a model of the design, and anyone measuring it gets the
wrong answer — which is the one thing a CAD export must not do.

So the export is at **true scale**, and you zoom in to see the lines. That is
what a paraglider looks like. The header says so:

```
# Line tubes are drawn 1.0x their true diameter (true scale).
# True diameters, mm: 0.50, 0.60, 0.65, 0.80, 0.83, 1.10
```

`3D line thickness x true` remains for anyone who wants a picture rather than
a model.

**The place to look at the cascade is the isometric view in the tool.** A
picture may use a legible line width; a model may not use a false diameter.

Six-sided tubes: enough to read as round, and 912 extra faces rather than the
several thousand a smooth tube would cost. The file grows from 271 KB to
341 KB.

The polylines stay — they are the honest path of the line, and Blender, Rhino
and MeshLab all read them. A wing with no line selection still gets tubes, at
a stated nominal diameter.
