# Paraglider Design Tool

An interactive, browser-based paraglider design tool, built from the **LE
Paraglider Design Handbook** published by [Laboratori
d'envol](https://laboratoridenvol.com/paragliderdesign/index.html) and
validated against production data from five manufacturers.

The handbook is a complete design method, but it is a set of pages, equations
and one FORTRAN listing. This project turns it into something you can drive:
change a number, watch the wing change, and export cutting files — with every
step checked against wings that have actually flown.

---

## Status

**Phase 1 complete and verified. Phases 2 and 3 well advanced. Phase 4 begun.**

**1444 tests** and a benchmark with regression budgets. The suite is not smoke
testing: every check asserts a value that can be verified independently — an
exact closed-form answer, a conservation property, a manufacturer's published
figure, or a number printed in the source.

---

## Running it

**To use the tool**, open `dist/paraglider-design-tool.html` in any browser.
Double-clicking works. It is a single file with no dependencies, no build step
and no network access — nothing leaves the machine.

**To work on it** you need Node 18 or later and Python 3. Nothing else; there
are no packages to install.

```bash
git clone https://github.com/freeflightlab/wingtoolui
cd wingtoolui

npm run build       # bundle src/ into dist/paraglider-design-tool.html
npm run check       # everything, six stages, one command
```

`npm run check` is the one that matters. Individual stages, if a single one is
being worked on:

| command | what it runs |
| --- | --- |
| `npm test` | 1444 unit checks against known geometry and the sources |
| `npm run test:phase1` | 81 Phase 1 roadmap claims, item by item |
| `npm run test:pipeline` | all 55 published wings through every stage |
| `npm run test:ui` | the interface: every control, every button pressed |
| `npm run bench` | timings, scaling, and budget regressions |
| `npm run audit` | the project's claims against its own code |

And two tools that are not tests:

| command | what it does |
| --- | --- |
| `npm run find -- <terms>` | search what already exists, before writing it again |
| `npm run catalogue` | regenerate the reference-database inventory |

The scripts are thin wrappers — `node tools/check.mjs` and the rest work
directly if you prefer.

`check.mjs` runs all six in one command, because six commands meant five got
skipped. The full-pipeline stage carries a **pinned baseline of 3 known
problems**: treating them as failures would make the command red every run and
train everyone to ignore it, while letting the number drift up silently would
be worse. Exceeding the baseline fails.

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

## Architecture

```
src/core/          the maths — pure functions, no DOM, individually testable
  num.js           integration, root finding, arc-length helpers
  planform.js      ch.1  elliptical + linear edges, areas, AR, centroid
  airfoil.js       ch.2  NACA 4-digit, three import formats, surface splitting
  lobe.js          ch.3  arc types, arc-length parameterisation, washin
  wing3d.js        ch.3.4 + 2021 study: three rotations, flow-alignment angles
  equilibrium.js   ch.4  longitudinal balance, calage, speed, glide
  flatdev.js       ch.5  triangle-pair unrolling of panels
  ovalization.js   ch.6  billow geometry and panel widening
  lines.js         ch.8  weighted-centroid line cascade
  risers.js        ch.9  speed system, trimmers, accelerated polar, brakes
  atmosphere.js    ISA to 20 km, density, Reynolds and Mach
  aero.js          section polar, lifting line, wing polar
  pressure.js      chordwise loading, row load shares from the section
  loads.js         lift to line tension, materials, sizing, stretch, drag
  lineplan.js      risers, cascade naming, four production sheet formats
  scaling.js       size families: isometric canopy, affine lines and mass
  family.js        a whole family through the pipeline, sized per size
  vribs.js         ch.7  diagonal and horizontal ribs, development, load path
  ribholes.js      lightening holes placed around margins and load paths
  reinforcement.js mylar, dacron, tapes, rods, tabs, and the mass gap
  intake.js        cell openings, placed against the stagnation point
  ribstress.js     what rib cloth carries, and how far tape must reach
  compare.js       two designs side by side, with trades named as trades
  bom.js           bill of materials: roll length, cut length, hardware
  xfoil.js         export to and import from XFOIL
  export.js        DXF R12, SVG, nesting, fabric estimation
  marking.js       notches, grain and labels for a buildable cutting file
  pairing.js       panel orientation, profile packing, nesting diagnosis
  viewfit.js       fitting drawings and charts to frames

src/ui/            index.html + style.css + app.js
tests/run-tests.js validation suite
tests/benchmark.js performance, scaling and budgets
tools/             figure generation, and a reader for legacy .xls sheets
docs/              nine notes; see below
data/reference/    44 production line sets from nine wings across four
                   manufacturers, seven size families (38 sizes, five
                   applications), a published speed-system geometry, and a
                   measured 78-line materials table
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

Against the handbook: the chapter 4 worked example reproduced term by term,
including the two moment terms its own spreadsheet omits.

Against the author's later work: the 2021 rotation study's published output
matched on all four angles, and the gnuLAB2 section from the aerofoil table
reproduced to 0.01% on thickness and camber.

Against production data from Ozone, PHI and BGD:

| check | result |
| --- | --- |
| Cascade topology inferred from lengths alone vs BGD's stated topology | 4 of 4 rows exact |
| PHI cascade totals, 42 main-row anchors | close exactly to the millimetre |
| LEP round trip on a real design | byte-identical, 33 unmodelled sections preserved |
| gnuC2-27 flat area recovered from its geometry matrix | 27.00 m² |
| Lynx 2 trim speed / top speed / best glide / min sink | within 3-8% |
| Canopy isometric scaling, seven families | exponent 1.99-2.08 |
| Line-length law on a fourth maker, out of sample | within 0.8% |
| Ozone's own line scaling check, Enzo 3 CCC | 8.8 mm worst against ±20 mm |
| Speed-system riser shares vs Skywalk's published geometry | 0.467 vs 0.500 |
| Collapse envelope vs PHI's most load-critical line | 28.6x vs 28x |

---

## Documentation

| file | covers |
| --- | --- |
| `docs/collecting-reference-data.md` | how to add a wing to the reference database |
| `docs/full-pipeline.md` | every real wing through the whole tool, and what it found |
| `docs/rib-stress.md` | why rib cloth never carries an anchor load |
| `docs/intake.md` | the cell opening, and where the flow stagnates |
| `docs/comparing.md` | putting two designs side by side, without scoring them |
| `docs/lengths.md` | flying, reference, sewn and cut length — and why they differ |
| `docs/departures.md` | every place the code differs from the handbook, and why |
| `docs/line-sheets.md` | what can be recovered from a maker's published numbers |
| `docs/environment-and-aero.md` | atmosphere, Reynolds number, and the wing polar |
| `docs/validation.md` | every discrepancy found in the sources, and why |
| `docs/source-map.md` | handbook chapter to implementation |
| `docs/lep-format.md` | LEparagliding interoperability |
| `docs/line-plans.md` | risers, naming, topology inference |
| `docs/loads-and-materials.md` | lift to line tension, kinked strength, drag |
| `docs/scaling.md` | size families, and what does and does not transfer |
| `docs/brakes.md` | brake cascades and engagement |
| `docs/speed-system.md` | risers, accelerated polar, the collapse floor |
| `docs/viewports.md` | fitting, zoom, tabs, the rib view |
| `docs/diagonal-ribs.md` | diagonal ribs, development, the attachment trade-off |
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

Production line data was supplied for validation and belongs to its
manufacturers — Ozone, PHI and BGD. It is used here to check calculations, not
redistributed as design material.

This project is an independent implementation. Where it departs from a source
it says so in a comment, and `docs/validation.md` collects those departures in
one place.
