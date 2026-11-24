# What OpenGlider does, and what was taken from it

[OpenGlider](https://github.com/booya-at/OpenGlider) is the other open-source
paraglider design project — a Python library with a FreeCAD workbench, under
the GNU GPL v3, as this project is. The first review here (sections 4 and 5)
went as far as its README and screenshots. The second read its code and
data: the `develop` branch, version 0.8.1, commit `ccdb7bf` of 2026-02-06:
329 files, 177 of them Python, 31,000 lines — 610 KB in the library, the rest
its FreeCAD workbench and tests. Its other branches are older (`master`
2014, `fem-stuff` 2016, `cpp` 2021). The third, on 2026-11-24, found
`develop` where the second left it, and went back through it for what it
does that this tool's own wings did not: section 2.

## 1. What was taken in 1.5.0

### Its line types: measured stretch, and weights

The one database in it is its line types (`openglider/lines/line_types/`):
56 sizes — Cousin's Vectraline, CTL 900 and Technoline, Liros's LTC, NTSL,
TSL, DFL and DSL — each with a diameter, most with a minimum breaking load,
Liros's with a weight per metre, and each with **its load and elongation
measured**: Liros's at 10 and 30 daN or at break, Cousin's every 5 daN. They
are in `data/reference/line-stretch.tsv` now, credited, in daN where
OpenGlider writes newtons.

This project's stretch was one figure — 3.5% at the rated (kinked) strength
for a bare line, 5% for a sheathed one, in proportion below. Fourteen of
OpenGlider's sizes are lines the catalogue has, at its diameters to 0.1 mm
and, Liros's, its strengths; thirteen have a curve to use. Against them, at
the 5 daN a line is measured at:

| line | generic over measured |
| --- | --- |
| Liros TSL 140 to 380, sheathed Technora | 1.5 to 3.0 times |
| Liros DSL 70, sheathed Dyneema | 3.6 |
| Liros LTC 65 to 200, bare Technora | 0.56 to 1.33 |
| Cousin V12-100, V16-140, Vectran | 1.44, 0.53 |

A 3 m TSL 190 main measured at 5 daN is 3.7 mm over its sewn length, where
the generic said 7.6 — a third of the PMA's ±12 mm band between them. The
length chain and the stretch correction take a line's own curve where it has
one (`elongationOf`), straight between points and on beyond them as
OpenGlider reads its own, and say which (`stretchFrom`).

Their weights check this project's. The catalogue's weights are estimated
from each line's area: 0.98 g/m per mm² sheathed, from Edelrid's data sheets
— Liros's 24 sheathed sizes here come to 0.955, its TSL alone to 0.98 — and
0.9 bare, an estimate with nothing behind it. Liros's bare Technora, LTC,
comes to **1.11** over nine sizes; the catalogue takes that for bare aramid
now, and Edelrid's 8000-U and 8001 were a fifth light. A line OpenGlider
weighs takes its weight, with the estimate kept beside it.

Three of its entries are not used, and say why: Liros's DFL brake lines carry
a placeholder, 0% at 100 daN; its DSL 140 stretches less at 30 daN than at
10; and its Technoline 1830 gives 1.3% at "75 N", nine times its neighbour at
that load — its loads read as daN.

### Its sum of the line set level by level

`LineSet.get_floor_strength` sums the line strengths at each level of the
cascade, and counts a branch that has ended again at every level above it
("EN style"): every cut across the cascade carries the wing. That is the
DHV's **suspension line calculation** for EN 926-1:2015 and NfL 2-565-20: level
1 the lines on the risers, each junction the next; each level's strengths
after bending, both sides, at least **1400 daN and 14 times the maximum
weight**; every line 20 daN; each brake level 150 daN (`strengthByLevel`,
`DHV_LINE_CALCULATION`).

It found something. Sized line by line to its own load at the limit case,
the default wing's mains came to 1382 daN, under the 1400, and its brake's
first level to 82 — a DC 40 a side, where a real wing's is a PPSL 200 a side
on the Lynx 2 M, 424 daN, and its nine mains a side 2015. The line set is
sized to the calculation now unless **Size each level to the DHV line
calculation** is unticked: the weakest lines of a short level are taken up a
size until it holds, and the Lines group shows every level against it. The
three complete designs' own sets hold every level at the strengths their
types are given, their mains 54 to 75 times the weight.

## 2. What was adopted in 1.17.0

### Panels parted at the entry, and cut by edge

OpenGlider's panels are bounded by cuts of named kinds (`Panel.CUT_TYPES`):
`folded` at the entry, `parallel` at the trailing edge, `orthogonal` and
`cut_3d` for design cuts, each with its own allowance in its pattern
configuration — 15 mm at the entry, 10 at the trailing edge, 12 at a design
cut, 10 on the sides. Reading that against this tool's own panels found
what neither of the first two reviews had: **they had no entry at all.** A
wing of this tool's own was developed as two whole surfaces, nose to tail,
so every cell was closed at the nose in its cutting file, and the cloth was
on the wrong surface.

They part at the intake now, as OpenGlider's and LEparagliding's do, with an
allowance for each kind of edge, and the intake's edges hemmed if asked as
`FoldedCut` hems the entry: the side's cutting line mirrored about the fold,
then again as it is, so that folded twice it lies flat (`partedEdges`,
`cutOutline`). On the three complete designs' own ribs, this tool's own
development comes to within 0.8% of every surface of their cutting files,
where it was 2 to 4% short on the upper and 8 to 9% over on the lower on the
same allowances (`docs/panels.md`, section 6).

### Mini-ribs

`MiniRib` is the cell's section at a point across it, blended from its
unballooned shape to its ballooned one by a curve along the chord. This
tool's own wings have trailing-edge mini-ribs now, built so: the section
halfway between the ribs, its front raised to the billow of the tool's own
panels. OpenGlider eases the rise along the whole mini-rib by a quadratic
Bézier; LEparagliding over 6% of chord by a half cosine, at 0.8 or 0.85 of
the billow. Both are offered. Against the three designs' cutting files the
second comes to within 4% of their mini-ribs, and the first 6 to 8% over on
the two whose programs raise them (`docs/internal-structure.md`, section 5).

## 3. What was read and not taken

**Line sag under drag** (`SagMatrix`): each line a taut string under its own
drag, ½ ρ V² c<sub>w</sub> d a metre, sagging q L²/(8F). On the default wing
at trim, no line carrying 5 N or more sags more than 7 mm — the stabilo
line, 4.85 m at 12 N — or grows longer than its chord by more than 27 µm.
Only the four tip lines the load model leaves at 0.1 to 0.4 N would sag
centimetres, and a nearly slack line is not a taut string.

**The line set by force balance** (`LineSet.recalc`, `iterate_target_length`):
its junctions found from the canopy's forces and the lines' lengths, then the
lengths corrected to targets. This tool hangs its plan from the calage and
sizes it by load, and an imported design keeps its program's geometry.

**Ballooning** (`ballooning.py`): a panel's arc between ribs from the extra
width, b/l = sin φ/φ — the relation `ovalization.js` uses, with a chordwise
profile where OpenGlider takes a spline. Its demonstration glider balloons
its upper surface 4 to 5% mid-chord, against this tool's 6% default.

**3D shaping by walking the seam** (`Cut3D`, `Panel.integrate_3d_shaping`):
a design cut's points moved along each seam by the length the 3D surface
has over its flat development there, weighted by a Gaussian of 4 cm
(`sigma_3d_cut`). This tool shapes with darts (`shaping3d.js`), and an
imported design's 3D shaping is its program's.

**Single-skin ribs** (`SingleSkinRib`): the lower surface between attachment
points an arch, a parabola of a set height. This tool builds a single-skin
wing double-surface and says so; the roadmap carries it.

**A mini-rib's share of the cell's billow** (`Cell._child_cells`): the cells
a mini-rib makes are given a ballooning of `l / l_new × (b + ½) − ½`, where
the cloth across the cell, `l (1 + b)`, shared between them gives
`l (1 + b) / l_new − 1`. The two agree only where the mini-rib holds the
cloth at the ribs' straight line, `l_new = l`. This tool's mini-ribs (section
2) are cut pieces, and do not reshape the cells either side.

**The line set's forces as vectors** (`LineSet.calc_forces`): each top line
carries the canopy's force at its anchor projected along it, and each line
below the vector sum of those above along itself, where this tool adds
tensions as numbers. Where the lines above a junction splay, the sum is the
larger by the cosine of their spread — a few per cent on a lower line — and
the anchors' loads, which this tool shares out so that they add up to the
wing's load, are each the canopy's force at the anchor. Both are in the
roadmap.

**The shark-nose and flap features** (FreeCAD workbench, `features.py`): the
lower surface pushed down by up to 3% of chord from 6 to 90% of chord,
peaking at 9%, straight or by a parabola; and the trailing edge turned down
by 1% of chord from 95%. Shape edits with no aerodynamics behind them; the
gnuC2-23's shark nose is its section's own, and this tool's sections can be
any.

**Profiles and balloonings merged along the span** (`profile_merge_curve`,
`ballooning_merge_curve`): each rib's section a blend of several, by a curve
across the span. The three complete designs here are of one section each,
at one thickness but for the tips (the Tuluaq's 0.9, then 0.8 and 0.1), so
nothing here yet asks for it.

**Rib holes, rods and reinforcements** (`rib/elements.py`): holes as
circles and ellipses scaled to the local thickness, a rod a set distance in
from the skin rounding in at its ends, an arc of reinforcement round each
attachment point. The holes here are LEparagliding's polygons, to its files.

**A rib in its arc** (`Rib._aoa_diff`, and Lorenz's note in `docs_old`): a
rib banked β in the arc sees the glide path at atan(cos β / glide ratio) —
the geometry of yawing ribs onto the glide path here (**Align ribs to
flow**).

**Its LEparagliding export** (`leparagliding.txt.template`): a 3.10 file
with most sections fixed at the gnu-A's values. This tool writes 3.30 from
the design.

**Airfoils by conformal map** (`conformal_mapping.py`): Joukowski, Kármán–
Trefftz and van de Vooren sections, with their exact potential flow — a
reference for an inviscid panel code, which this tool does not have; its
thin-aerofoil theory is checked against NACA 2412's worked values.

**Its flattening and meshing** (`vector/projection.py`, `mesh/`): a strip
laid out triangle by triangle, as `flatdev.js` does, and least-squares
conformal maps for meshes this tool does not make.

### What it has wrong

Read closely, five slips, none taken here: its NACA four-digit generator
takes the camber slope aft of the highest point as 2m(p − x)/(1 − p²) where
the definition has (1 − p)²; a `TensionStrap` halves its width twice; the
DSL 140 and Technoline 1830 entries above; and its knot correction
(`LineSet.knots_table`, `get_line_length`), whose one entry takes 2.0 off a
line's length in metres where its seam correction is converted from
millimetres — two metres off the line in its length table, wherever a
`liros.ltc65` pair meets a `liros.ltc65`, and nothing at all for any other
knot.

## 4. The first review, from its README

### What it had that this did not

| | OpenGlider | here |
| --- | --- | --- |
| **mini-ribs** | modelled, in its own screenshots | an imported design's trailing-edge ones as its program cuts them; on a wing of its own, built since 1.17.0 (section 2) |
| **3D panel method** | VSAERO / `parabem` | lifting line |
| **nonlinear FEM** | `paraFEM`, membrane and truss | none |
| **CFD export** | OBJ for OpenFOAM | OBJ, same choice |
| **CAD** | FreeCAD workbench | OBJ export |
| runs in | Python, FreeCAD, conda | one offline HTML file |

#### Mini-ribs — taken

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

#### I wrote the builder twice

There was already a `buildHRibs` in `vribs.js` and I wrote a second one before
noticing. CONTRIBUTING records five functions in this project written twice
for exactly this reason, and `tools/find.mjs` exists to catch it — but it
searches names and doc comments, and that function's comment does not say
"H rib", so it did not surface. Removed, and the file entries now feed the
one that was already there.

#### The panel method — partly taken

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
(a projected span of 9.32 m, ratio 0.93), at 6°:

| | flat | arced |
| --- | --- | --- |
| CL, on its own projected area | 0.458 | **0.432** |
| lift | | **11% less** |
| span efficiency, on its own projected span | 1.015 | **1.043** |

The lift loss a correction factor can approximate. **The efficiency gain it
cannot** — an arced wing sheds a non-planar wake, which is more efficient for
the same reason a winglet is. That is real information the old model could not
produce. (On the flat span the arc's induced drag at the same lift is still
the larger: `arcFactors` takes both into the polar and the balance,
`docs/environment-and-aero.md` section 6.)

Its trailing legs ran from the quarter chord straight downstream. On a strip
at an incidence that lifts them off its surface between the bound vortex and
the control point, and out on an arc they passed the neighbouring strips'
control points at a slant: the system grew ill-conditioned with the angle,
the default wing's circulation ran away above 9°, and the lift the 37° arc
costs came out 16% where it is 11%. The legs run along each strip's edge to
its trailing edge now, and downstream from there, and the Trefftz plane sees
the wake where it leaves.

It said 1.130 until the third complete design was flown on it. The Trefftz
integral took the vertical wash, which is the wash normal to the wake only
where the wake lies flat; out on an arc the wake's trace tilts, and the
sidewash across a tilted piece of it carries drag too. The check that found
it has a known answer of another kind: a wake turned bodily in its own plane
cannot change its drag, and on the vertical wash alone it did. With the
normal wash, the gnuC2-23's span efficiency is 1.21 on its projected span,
not 1.52, and its induced drag a quarter more.

Validated where the answer is known: the lift slope approaches 2 pi at high
aspect ratio (6.154 at AR 200), and an elliptical wing gives a span
efficiency of 1.004.

It came out at **0.503** first — exactly double the induced drag, because the
Trefftz integral is `(rho/2) * integral(Gamma * w)` and the half was missing.
A factor of two in a quantity with a known exact answer is the easiest kind of
error to find, and only because the answer is known.

#### The FEM — not taken

OpenGlider's roadmap builds on a self-coded VSAERO panel method and an
explicit nonlinear FEM for line forces and deformation. Those are the right
tools for the two things this project cannot do: a proper 3D pressure field,
and collapse behaviour.

Neither is a library to borrow — they are separate projects in Python and
C++. Reimplementing either in a single offline HTML file is not a sensible
trade, and claiming otherwise would be the least defensible thing here.

What this project does instead is say plainly what it cannot predict. See
`docs/certification.md` on collapse.

#### OBJ for CFD — convergent

OpenGlider exports OBJ for OpenFOAM. This project chose OBJ for CAD
independently, for its own reasons — it is the only light format carrying
surfaces, polylines and named groups. Arriving at the same answer from a
different requirement is a reasonable sign the choice is right.

## 5. What this has that OpenGlider does not

Worth stating honestly, because the comparison runs both ways: this project
validates against 55 published sizes from five makers, and holds 23 of them, of
four families from Ozone and BGD, to the makers' own tables transcribed
separately, checks its own estimates are labelled as estimates,
and runs fifteen stages that include checks for assertions that cannot fail
and for values used outside the unit their name claims.

OpenGlider is a deeper piece of engineering. This one is more careful about
knowing when it is wrong.
