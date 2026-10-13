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
v ...                    7418 vertices, one pool
g upper_surface          quads between rib curves
g lower_surface
g ribs                   closed polyline per rib
g lines_A                polyline per line, and the same line as a tube
g lines_B
g lines_C
g lines_S                the stabilo
g lines_K                the brakes
```

Groups share the vertex pool, which is what makes them **grouped but
independent**: each is separately selectable and hideable, while a rib edge
*is* the panel edge beside it rather than a duplicate sitting on top of it.

Metres. X chordwise, Y spanwise, Z up. About 380 KB for the default wing, of
which a third is the lines as tubes.

The **whole** wing is written, not the half that is modelled — a CAD model of
half a paraglider is a curiosity. The mirrored half has its faces wound the
other way so normals face outwards, and a centre cell is written once because
it belongs to neither half. So is a rib on the centreline, which is its own
mirror image: it used to go in once for each side, two outlines on the same
vertices.

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

The surfaces met at the nose exactly — but the nose was a few straight cuts
across the roundest part of the section.

A wing is built with as few points per surface as the panel work needs, and
they were spread **evenly along the surface**: 50 points on a 2.6 m rib are
55 mm apart, at the nose as everywhere else, where the section turns right
round in a couple of hundred. The outline cut the corner off the leading edge
by 5.3 mm and came out 3.1 mm short round it — in this model, and in every rib
pattern and every panel developed along it.

The export used to paper over that by re-sampling the ribs more finely for
itself, which put more vertices on the same straight facets and left the
patterns as they were.

It is fixed in the wing instead. `resampleSurface` clusters the points at the
nose, and that is how a wing is built unless it is told otherwise: the same
50 points now hold the section to 0.5 mm, with the first three gaps 1.4, 4.2
and 7.0 mm. The model writes the ribs as they are built, and a test holds the
wing unchanged by exporting it.

(The reason once given here for not doing this — that clustering made
ovalization ease both seams of a panel the same way — was a symptom of the
canopy being built inside out, and went with it.)

## The lines are there, and now visible

They were in the file and invisible. OBJ's `l` element is **optional**, and a
great many importers read only faces — so a model with a few hundred polylines
of line cascade opened as a bare sail in most viewers.

Each line is now also swept into a **tube**, which is geometry every viewer
draws.

### At its real diameter

Not a nominal thickness. The diameter comes from the line selection, which
runs 0.43 to 2.50 mm across the catalogue, so the model is to scale: an A line
really is thicker than a brake line and a designer can see which is which.

On the default wing the selection chose four sizes and all four are in the
model:

| chosen | 0.50 | 0.65 | 0.80 | 0.83 mm |
| --- | --- | --- | --- | --- |
| **in the model** | 0.50 | 0.65 | 0.80 | 0.83 mm |

### True scale, and why not to fudge it

At true scale a 0.5 mm line on a 10.3 m span is **1/20,600 of the model** —
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
# True diameters, mm: 0.50, 0.65, 0.80, 0.83
```

`3D line thickness x true` remains for anyone who wants a picture rather than
a model.

**The place to look at the cascade is the isometric view in the tool.** A
picture may use a legible line width; a model may not use a false diameter.

Six-sided tubes: enough to read as round, and 1416 extra faces on the default
wing rather than the several thousand a smooth tube would cost. The file grows
from 271 KB to 383 KB.

The polylines stay — they are the honest path of the line, and Blender, Rhino
and MeshLab all read them. A wing with no line selection still gets tubes, at
a stated nominal diameter.
