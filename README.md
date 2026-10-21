# Paraglider Design Tool

An interactive, browser-based paraglider design tool, built from the **LE
Paraglider Design Handbook** published by [Laboratori
d'envol](https://laboratoridenvol.com/paragliderdesign/index.html) and
validated against production data from six manufacturers.

The handbook is a complete design method, but it is a set of pages, equations
and one FORTRAN listing. This project turns it into something you can drive:
change a number, watch the wing change, and export cutting files — with every
step checked against wings that have actually flown.

---

## Status

**An honest assessment of where this is — what is validated, what is
estimated, what is unexplained, and what a reviewer should check first — is in
[`ASSESSMENT.md`](ASSESSMENT.md).**

**2479 unit checks, and fifteen check stages**, all passing. Phases 1 and 5 are
complete; 2, 3 and 4 have open items listed in `ROADMAP.md`.

The tool takes a wing from planform through to cutting files: geometry,
aerofoil, arc and twist, equilibrium, line plan and risers, loads and line
sizing, rib openings and diagonals, panel development, nesting, and DXF or
printed patterns. It reads and writes LEparagliding files, and it is validated
against the line sheets of **21 wings from five manufacturers**, the published
specifications of **55 sizes**, and Laboratori d'envol's own Swoop2, whose
area, span, chord, cells, ribs and all 93 lines — lengths, loads and types —
it reproduces as the design's own program computes them.

What it is not: certified, tested, or flown. See **Safety** below.

## Running it

**To use the tool**, open `dist/paraglider-design-tool.html` in any browser.
Double-clicking works. It is a single file with no dependencies, no build step
and no network access — nothing leaves the machine.

**To work on it** you need Node 18 or later and Python 3. Nothing else; there
are no packages to install.

```bash
git clone https://github.com/freeflightlab/wingtoolui
cd wingtoolui

npm run doctor      # is this checkout complete? run this first
npm run build       # bundle src/ into dist/paraglider-design-tool.html
npm run check       # everything, fifteen stages, one command
```

**Publishing to GitHub? Read [`PUBLISHING.md`](PUBLISHING.md) first.** Uploading
individual files through the web interface flattens the tree and has broken
the repository twice.

**If anything looks wrong, run `npm run doctor` before anything else.** It
checks the whole tree — layout, every file the manifest promises, every module
the build needs, the reference data, and the Node version — and says what to
do about what it finds. A first user hit a build failure that turned out to be
a stale checkout in an older layout, and the build could only report what it
personally needed.

`npm run check` is the one that matters. Individual stages, if a single one is
being worked on:

| command | what it runs |
| --- | --- |
| `npm test` | 2479 unit checks against known geometry and the sources |
| `npm run test:phase1` | 81 Phase 1 roadmap claims, item by item |
| `npm run test:pipeline` | all 55 published wings through every stage |
| `npm run test:ui` | the interface: every control, every button pressed |
| `npm run test:refs` | every wing in the database against the physics |
| `npm run check:assertions` | checks that cannot fail |
| `npm run check:units` | names that state a unit, used in another |
| `npm run check:references` | names in prose that point at nothing |
| `npm run check:options` | options passed that a function never reads |
| `npm run check:corpus` | every dataset measured, against the model's own constants |
| `npm run check:provenance` | every material figure says where it came from |
| `npm run bench` | timings, scaling, and budget regressions |
| `npm run audit` | the project's claims against its own code |

And two tools that are not tests:

| command | what it does |
| --- | --- |
| `npm run find -- <terms>` | search what already exists, before writing it again |
| `npm run catalogue` | regenerate the reference-database inventory |

The scripts are thin wrappers — `node tools/check.mjs` and the rest work
directly if you prefer.

`check.mjs` runs all fifteen in one command, because six commands meant five got
skipped. The full-pipeline stage carries a **pinned baseline of known
problems**, now zero: treating known problems as failures would make the
command red every run and train everyone to ignore it, while letting the
number drift up silently would be worse. Exceeding the baseline fails.

`phase1-audit.mjs` walks the Phase 1 roadmap rather than the modules: 81
## What it does

**Geometry.** Planform, aerofoil, arc and twist, through three rotations, to a
full 3D wing, with diagonal ribs carrying the span that has no line on it. Panels developed flat, ovalized for billow, given seam allowance,
and nested onto a fabric roll.

**Flight.** Longitudinal balance, section and wing polars from thin-aerofoil
theory and lifting line, atmosphere to 20 km, and an accelerated polar across
the speedbar range.

**Lines.** Riser-based cascades with industry naming and optional merged rows, brakes with their own
four-level cascade, load from lift distribution through to line tension, line
selection from measured materials sized across the speedbar range, elastic
stretch, gust load factors, asymmetric and collapse load cases, and line drag
fed back into the balance.

**Interoperability.** Reads and writes `leparagliding.txt`; reads production
line sheets in four manufacturers' formats; imports aerofoils in three.

**Output.** Printable patterns tiled to A4 or A3 at exactly 1:1, a PMA §6.2.1 data sheet, the record an inspection company needs
for the life of the wing. DXF R12 cutting files for panels, ribs and diagonals — with
registration notches, grain arrows and labels on their own layers — plus
true-scale SVG, line schedules, and reloadable project files.

---

## The interface

Three tabs of live viewports, redrawn on every edit:

| tab | viewports |
| --- | --- |
| **Wing** *(default)* | plan, front arc, section balance, cutting layout |
| **Rib** | one rib at a time, as it is cut, with a selector |
| **Analysis** | polar, atmosphere |

The section and rib views take wheel zoom and drag pan, double-click to reset.
Geometry views hold one scale on both axes; charts use independent axes and
fill their frame. See `docs/viewports.md`.

Geometry colours are the AutoCAD Color Index values the handbook's own
subroutine writes into its DXF, so a wing on screen and the same wing opened
from a `.dxf` look alike.

---

### The Lines view

The cascade, drawn as a rigging diagram: anchors along the span, lines
converging to the maillons, coloured by row. A row can be isolated to follow
one cascade through the plan, and the table beside it lists every line with
its level, length, load and selected material.

This existed only as numbers for most of the project's life. A design tool
that computes a line plan and cannot show it is asking to be trusted on the
one thing a user most wants to check.

**A design can be diffed against a real wing.** Twenty-five Niviuk sizes across five wings are
embedded — measured total line lengths, sail to harness — and selecting one
reports two numbers that mean different things: the **mean offset**, which is
the overall length a designer sets deliberately, and the **shape deviation**,
which is the spread once that offset is removed and is what actually differs.
The rows that carry the wing and the brake are compared each against its own
offset, because makers measure a brake to different points. A Hook 6 loaded
from the picker — its own counts and tip lines, on the ellipse its published
figures give — comes out 87 to 112 mm from its own sheet in shape on its 33
load-bearing anchors (112 to 150 on every second rib), and its brake 94 to
112 mm.

## Architecture

```
src/core/          the maths — 38 modules, pure functions, no DOM, each tested
  num.js           integration, root finding, arc-length helpers
  planform.js      ch.1  elliptical + linear edges, areas, AR, centroid
  airfoil.js       ch.2  NACA 4-digit, coordinate import, surface splitting
  lobe.js          ch.3  arc types, arc-length parameterisation, washin
  wing3d.js        ch.3.4 + 2021 study: three rotations, flow-alignment angles
  equilibrium.js   ch.4  balance, calage, speed, glide; the coupled solve
  flatdev.js       ch.5  triangle-pair unrolling of panels
  ovalization.js   ch.6  billow geometry and panel widening
  vribs.js         ch.7  diagonal and horizontal ribs, development, load path
  lines.js         ch.8  the handbook's weighted-centroid cascade
  lineplan.js      risers and the cascade as production wings build them;
                   readers for five makers' sheets
  loads.js         lift to line tension, materials, sizing, stretch, drag
  trimdrift.js     why a lineset goes out of trim, and when to check it
  pma.js           the PMA inspection standard, and the exchange record
  freebody.js      the hanging wing as one body under gravity
  risers.js        ch.9  speed system, trimmers, accelerated polar
  atmosphere.js    US Standard Atmosphere 1976 to 86 km; Re, Mach, Kn
  aero.js          section polar, lifting line, wing polar
  vlm.js           a vortex lattice over the arced wing
  pressure.js      chordwise loading, row load shares from the section
  intake.js        cell openings, placed against the stagnation point
  inflated.js      the flying shape against the built one
  scaling.js       size families, the reference library, line per span
  family.js        a whole family through the pipeline, sized per size
  ribholes.js      lightening holes and cross-ports
  ribstress.js     what rib cloth carries, and how far tape must reach
  reinforcement.js mylar, dacron, tapes, rods, tabs
  shaping3d.js     darts that let the nose curve in two directions
  fabric.js        cloth by location
  bom.js           bill of materials: roll length, cut length, hardware
  compare.js       two designs side by side, with trades named as trades
  lep.js           the LEparagliding file, read and written
  leplines.js      an imported design's ribs, lines, rods and holes, as its
                   own program computes them
  xfoil.js         export to and import from XFOIL
  export.js        DXF R12, SVG, printable patterns, OBJ, nesting, a DXF reader
  marking.js       notches, grain and labels for a buildable cutting file
  pairing.js       panel orientation, profile packing, nesting diagnosis
  viewfit.js       fitting drawings and charts to frames

src/ui/            index.html + style.css + app.js
tests/             the unit suite, the Phase 1 audit, the full pipeline, the
                   reference sweep, the benchmark
tools/             the other check stages, the interface harness, figures,
                   importers, and readers for legacy sheets
docs/              forty-one notes; see below
data/reference/    143 tables: line sheets of 21 wings from five makers, six
                   of their line-plan drawings transcribed line by line, 55
                   published sizes and the makers' own specifications to check
                   them against, cell counts, the suppliers' line data, PHI's
                   measured 78-line materials table, inspection records, a
                   published riser geometry, fabric schedules and
                   certification reports; and the Swoop2's own files
build.py           bundler
```

Data flows one way:

```
design inputs
   -> planform -> lobe -> wing3d
   |-> flatdev -> ovalization -> seam allowance -> nesting -> DXF/SVG
   |-> aero -> equilibrium -> risers -> accelerated polar
   \-> lineplan -> loads -> line schedule -> line drag --> back into equilibrium
```

---

## Why it is built this way

**The core is ES modules; the deliverable is one file.** The maths is split so
each part can be tested alone. But browsers refuse ES modules over `file://`,
and someone building a wing in a workshop should not need a web server.
`build.py` inlines the modules into one scope — and **fails the build** if two
modules declare the same top-level name, which is the failure mode that
arrangement invites. It has caught real collisions.

**Nothing is recomputed in the interface.** Every number on screen comes from
the core. That is what makes the test suite meaningful: it exercises the same
code the interface uses.

**Tests assert what the algorithms actually guarantee.** Where a method is
exact, the tolerance is machine precision. Where it is approximate, the test
says so and pins the size of the approximation. Several tolerances were
discovered rather than assumed.

**And that reported numbers can move.** A one-sided check is satisfied
perfectly by a metric that is always zero — which is how a broken distortion
measure survived for months. Twenty-six reported quantities are swept against
the inputs they claim to depend on, checking each responds by a meaningful
amount in the right direction.

**Assumptions are named, and guarded.** Where a model is used outside its
evidence the code says so rather than returning a plausible number: scaling
laws report when they are extrapolating, the accelerated polar refuses to
trust a lift curve past its stall, and the collapse floor that governs top
speed is stated as an assumption and inverted from published data.

---

## Validation

fifteen stages, one command:

| stage | catches |
| --- | --- |
| checkout | a tree that is incomplete or in an older layout |
| unit suite | the maths, 2479 checks |
| Phase 1 audit | roadmap claims that have gone stale |
| full pipeline | 55 published wings through every stage |
| interface | features with no button, buttons with no effect |
| reference sweep | wings that parse but describe impossible geometry |
| assertions | checks that cannot fail, which report success |
| units | a value used outside the unit its name claims |
| references | names in comments and documents that point at nothing |
| options | calls that look right, run clean, and do nothing |
| corpus | model constants that have drifted from their data |
| provenance | estimates presented as if they were measurements |
| benchmark | performance regressions |
| self-audit | unused exports, stale numbers in prose, missing files |

The full-pipeline stage is pinned at **zero**. It ran at 3, then 4, then 2, and
the last two went when it was pointed at the full line catalogue instead of the
built-in subset — a validation run using less than the tool does is not
validating the tool.

Every dataset in `data/reference/` is measured, not merely parsed. The
`corpus` stage checks the model's own constants against what the wings say —
`ANCHOR_DENSITY` was six hand-entered Ozone designs when the sheets held 19
designs from four makers, and the anchor search was bounded by a front-row
density range from those six that left out seven of twenty designs. Both are
measured from the sheets now, figure for figure, and so is each design's own
cascade: its riser layout, its counts, its tip lines and its stabilo's line.

## Documentation

| file | covers |
| --- | --- |
| `docs/collecting-reference-data.md` | how to add a wing to the reference database |
| `docs/full-pipeline.md` | every real wing through the whole tool, and what it found |
| `docs/rib-stress.md` | what the rib cloth carries at an anchor, how far the reinforcement must reach, and the sail |
| `docs/intake.md` | the cell opening, and where the flow stagnates |
| `docs/assumptions.md` | which assumptions are the user's, and the bugs found exposing them |
| `docs/comparing.md` | putting two designs side by side, without scoring them |
| `docs/lengths.md` | flying, reference, sewn and cut length — and why they differ |
| `docs/departures.md` | every place the code differs from the handbook, and why |
| `docs/line-sheets.md` | what can be recovered from a maker's published numbers |
| `docs/environment-and-aero.md` | atmosphere, Reynolds number, and the wing polar |
| `docs/validation.md` | every discrepancy found in the sources, and why |
| `docs/source-map.md` | handbook chapter to implementation |
| `docs/lep-format.md` | LEparagliding interoperability |
| `docs/inflated.md` | the built shape against the flying one |
| `docs/shaping.md` | 3D shaping of the nose, and two wrong derivations |
| `docs/risers.md` | riser-aware line plans and split A risers |
| `docs/rods-validated.md` | the Swoop2 rods against its own computed output |
| `docs/free-body.md` | does the whole machine balance as a body in gravity |
| `docs/hang-point.md` | where the wing hangs, and why the calage decides it |
| `docs/line-plans.md` | risers, naming, topology inference |
| `docs/drawn-line-plans.md` | the makers' own line-plan drawings, each wing's own cascade, where rows end, the stabilo |
| `docs/reference-wings.md` | the reference wings against their published figures |
| `docs/openglider.md` | what OpenGlider does, and what was taken from it |
| `docs/certification.md` | what a flight test report does and does not contain |
| `docs/cad-export.md` | the 3D model, and why OBJ rather than STEP or STL |
| `docs/chord-fraction.md` | three places that confused array index with chord |
| `docs/panels.md` | panel development, and whether the wing sews |
| `docs/fabric.md` | cloth by location, and what the tool refuses |
| `docs/line-sets.md` | choosing N line types, and whether a cascade holds trim |
| `docs/loads-and-materials.md` | lift to line tension, kinked strength, drag |
| `docs/niviuk-import.md` | importing a sixth manufacturer, and what its data said |
| `docs/swoop2.md` | validating against the source method's own design |
| `docs/scaling.md` | size families, and what does and does not transfer |
| `docs/brakes.md` | brake cascades and engagement |
| `docs/speed-system.md` | risers, accelerated polar, the collapse floor |
| `docs/viewports.md` | fitting, zoom, tabs, the rib view |
| `docs/diagonal-ribs.md` | diagonal ribs, development, the attachment trade-off |
| `docs/rods.md` | nylon rods, and drawing the structure |
| `docs/construction.md` | rib holes, cross-ports, reinforcement, the bill |
| `docs/nesting.md` | where the material goes, and what does not save it |
| `docs/inspection.md` | the riser, and the PMA standard as a design check |

`ROADMAP.md` carries the phased plan and every open question.

---

## Safety

This implements published design geometry and estimates flight behaviour from
theory. It does not certify a wing, model its behaviour at the edge of the
envelope, or substitute for load testing. A paraglider is an aircraft; a
structural or trim failure is usually not survivable. Treat every output as a
starting point for analysis and testing by someone qualified to do it.

The estimates carry their own warnings — a polar marked `estimated`, a scaling
law that reports when it is extrapolating — but no warning in code makes an
untested wing safe to fly.

---

## Credit and licence

**No licence is set yet** — see `LICENSING.md` for what bears on the choice.
Without one, default copyright applies.

The design method, equations and worked example are the work of **Laboratori
d'envol**, published freely at laboratoridenvol.com, whose software is released
under the GNU GPL. The later rotation and equilibrium studies are by the same
author.

Production line data and line-plan drawings were supplied for validation and
belong to their manufacturers — Ozone, PHI, BGD and UP; Niviuk's and Skywalk's
figures are from their published manuals. They are used here to check
calculations, not redistributed as design material.

This project is an independent implementation. Where it departs from a source
it says so in a comment, and `docs/validation.md` collects those departures in
one place.
