# What OpenGlider does, and what was taken from it

[OpenGlider](https://github.com/booya-at/OpenGlider) is the other open-source
paraglider design project — a Python library with a FreeCAD workbench, GPL-3,
79 stars, 1,282 commits. I said several sessions ago that I would review it
and did not. This is that review.

## What it has that this does not

| | OpenGlider | here |
| --- | --- | --- |
| **mini-ribs** | modelled, in its own screenshots | **not built** |
| **3D panel method** | VSAERO / `parabem` | lifting line |
| **nonlinear FEM** | `paraFEM`, membrane and truss | none |
| **CFD export** | OBJ for OpenFOAM | OBJ, same choice |
| **CAD** | FreeCAD workbench | OBJ export |
| runs in | Python, FreeCAD, conda | one offline HTML file |

### Mini-ribs — taken

This is the concrete gap. OpenGlider's own screenshots show "testcell with
miniribs" and a demo kite with a central minirib. A modern wing uses them to
hold the nose shape between ribs without the weight and drag of a full one.

They are in the reference data too, and were being read as nothing at all.
**LEP section 12 is "H V and VH ribs", and the Swoop2 carries 124 of them** —
an H rib spans two adjacent ribs at one chord station and holds the surfaces
apart, a V rib is the diagonal this tool already builds, a VH is both. Three
types appear in that one wing.

`parseHVRibs` reads them now, and loading the Swoop2 says so:

> 124 H/V/VH ribs in the file are not built.

**They are read, not built.** The geometry is real work, and inventing it
would be worse than saying the data is present and unused. It is on the
roadmap as the next structural piece.

### The panel method and the FEM — not taken

OpenGlider's roadmap builds on a self-coded VSAERO panel method and an
explicit nonlinear FEM for line forces and deformation. Those are the right
tools for the two things this project cannot do: a proper 3D pressure field,
and collapse behaviour.

Neither is a library to borrow — they are separate projects in Python and
C++. Reimplementing either in a single offline HTML file is not a sensible
trade, and claiming otherwise would be the least defensible thing here.

What this project does instead is say plainly what it cannot predict. See
`docs/certification.md` on collapse.

### OBJ for CFD — convergent

OpenGlider exports OBJ for OpenFOAM. This project chose OBJ for CAD
independently, for its own reasons — it is the only light format carrying
surfaces, polylines and named groups. Arriving at the same answer from a
different requirement is a reasonable sign the choice is right.

## What this has that OpenGlider does not

Worth stating honestly, because the comparison runs both ways: this project
validates against 23 published sizes from four manufacturers with the figures
transcribed separately, checks its own estimates are labelled as estimates,
and runs fourteen stages that include checks for assertions that cannot fail
and for values used outside the unit their name claims.

OpenGlider is a deeper piece of engineering. This one is more careful about
knowing when it is wrong.
