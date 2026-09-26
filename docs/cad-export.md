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
