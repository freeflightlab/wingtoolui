# What OpenGlider does, and what was taken from it

[OpenGlider](https://github.com/booya-at/OpenGlider) is the other open-source
paraglider design project — a Python library with a FreeCAD workbench, GPL-3,
79 stars, 1,282 commits. I said several sessions ago that I would review it
and did not. This is that review.

## What it has that this does not

| | OpenGlider | here |
| --- | --- | --- |
| **mini-ribs** | modelled, in its own screenshots | **not built** on a wing of its own; an imported design's trailing-edge ones as its program cuts them |
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

`parseHVRibs` reads all three kinds now, and leaves none unread:

| type | count | what each row says |
| --- | --- | --- |
| 11 | 70 straps | two adjacent ribs, one anchor row, a width |
| 15 | 39 diagonals | a rib, a row, and which side it goes to |
| 16 | 15 pieces between two ribs | each end a rib and a chord position |

Reading all three the same way had made the first look sensible and the
others nonsense — **type 16 referenced rib 100 on a 26-rib half wing**, and
type 15 had a 60 cm "width". They are different records sharing a section. A
type-16 end is a rib and a chord percentage (rib 4 at 11% to rib 5 at 11%);
the 100 was a percentage. A type-15 row, `15  25 3  1 0  60.0  28.0  85.  2.`,
is rib 25, row 3, and a left/right flag, then its shape: the angles at which
it rises to the next rib from its first and last anchors, the depth of the
cut-out between anchors, and the width of cloth at each.

On loading the Swoop2 the interface now cuts every one of them as its
program does, piece for piece to its cutting file (`docs/internal-structure.md`),
and its trailing-edge mini-ribs too, so the import note has nothing left to
list.
The straps run along the two ribs' lower surfaces at the anchors, 2% of
chord either side. The fifteen pieces between two ribs sit under the upper
surface, at height 100 — exactly the fifteen top straps that the diagonals'
statics asks for, pair for pair. The H-rib builder in `vribs.js` takes the
file's straps too, in the suite, now at the width the program reads; it
models a strap of its own height in the cell, which is not the design's.

### I wrote the builder twice

There was already a `buildHRibs` in `vribs.js` and I wrote a second one before
noticing. CONTRIBUTING records five functions in this project written twice
for exactly this reason, and `tools/find.mjs` exists to catch it — but it
searches names and doc comments, and that function's comment does not say
"H rib", so it did not surface. Removed, and the file entries now feed the
one that was already there.

### The panel method — partly taken

I said a panel method was not a sensible trade in one offline file. That was
right about VSAERO and wrong about the general point, so a **vortex lattice**
is in now.

It is a real step, not a reskin of the lifting line. Prandtl's equation is
solved on a straight flat span; a paraglider is bent through 30 to 40 degrees
of dihedral, and this project was computing on the flat wing and applying a
correction. The lattice puts a horseshoe on every strip **where the strip
really is**, with the strip's own normal, so the arc enters because the
geometry says so.

What that buys, on one wing of 10 m bent into an arc whose tip sits at 37°
(a projected span of 9.32 m, ratio 0.93):

| | flat | arced |
| --- | --- | --- |
| CL | 0.468 | **0.418** |
| span efficiency | 1.020 | **1.052** |

The lift loss a correction factor can approximate. **The efficiency gain it
cannot** — an arced wing sheds a non-planar wake, which is more efficient for
the same reason a winglet is. That is real information the old model could not
produce.

It said 1.130 until the third complete design was flown on it. The Trefftz
integral took the vertical wash, which is the wash normal to the wake only
where the wake lies flat; out on an arc the wake's trace tilts, and the
sidewash across a tilted piece of it carries drag too. The check that found
it has a known answer of another kind: a wake turned bodily in its own plane
cannot change its drag, and on the vertical wash alone it did. With the
normal wash, the gnuC2-23's span efficiency is 1.21 on its projected span,
not 1.52, and its induced drag a quarter more.

Validated where the answer is known: the lift slope approaches 2 pi at high
aspect ratio, and an elliptical wing gives a span efficiency of 1.006.

It came out at **0.503** first — exactly double the induced drag, because the
Trefftz integral is `(rho/2) * integral(Gamma * w)` and the half was missing.
A factor of two in a quantity with a known exact answer is the easiest kind of
error to find, and only because the answer is known.

### The FEM — not taken

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
validates against 55 published sizes from five makers, and holds 23 of them, of
four families from Ozone and BGD, to the makers' own tables transcribed
separately, checks its own estimates are labelled as estimates,
and runs fifteen stages that include checks for assertions that cannot fail
and for values used outside the unit their name claims.

OpenGlider is a deeper piece of engineering. This one is more careful about
knowing when it is wrong.
