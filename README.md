# Paraglider Design Tool

An interactive, browser-based paraglider design tool, built from the **LE
Paraglider Design Handbook** published by [Laboratori
d'envol](https://laboratoridenvol.com/paragliderdesign/index.html) and
validated against production data from three manufacturers.

The handbook is a complete design method, but it is a set of pages, equations
and one FORTRAN listing. This project turns it into something you can drive:
change a number, watch the wing change, and export cutting files — with every
step checked against wings that have actually flown.

---

## Status

**Phase 1 complete and verified. Phase 2 well advanced.**

**574 tests** and a benchmark with regression budgets. The suite is not smoke
testing: every check asserts a value that can be verified independently — an
exact closed-form answer, a conservation property, a manufacturer's published
figure, or a number printed in the source.

---

## Running it

The built tool is a **single HTML file with no dependencies and no network
access**. Open `dist/paraglider-design-tool.html` in any browser — double
clicking works, no server needed.

```bash
python3 build.py           # bundle src/ into dist/paraglider-design-tool.html
node tests/run-tests.js    # 574 checks against known geometry and the sources
node tests/benchmark.js    # timings, scaling, and budget regressions
```

No package manager, no toolchain, nothing to install. Node runs the tests;
Python concatenates files.

---

## What it does

**Geometry.** Planform, aerofoil, arc and twist, through three rotations, to a
full 3D wing. Panels developed flat, ovalized for billow, given seam allowance,
and nested onto a fabric roll.

**Flight.** Longitudinal balance, section and wing polars from thin-aerofoil
theory and lifting line, atmosphere to 20 km, and an accelerated polar across
the speedbar range.

**Lines.** Riser-based cascades with industry naming, brakes with their own
four-level cascade, load from lift distribution through to line tension, line
selection from measured materials, elastic stretch, and line drag fed back
into the balance.

**Interoperability.** Reads and writes `leparagliding.txt`; reads production
line sheets in four manufacturers' formats; imports aerofoils in three.

**Output.** DXF R12 cutting files, true-scale SVG, line schedules, and
reloadable project files.

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
  risers.js        ch.9  speed system, accelerated polar, brake coupling
  atmosphere.js    ISA to 20 km, density, Reynolds and Mach
  aero.js          section polar, lifting line, wing polar
  pressure.js      chordwise loading, row load shares from the section
  loads.js         lift to line tension, materials, sizing, stretch, drag
  lineplan.js      risers, cascade naming, four production sheet formats
  scaling.js       size families: isometric canopy, affine lines and mass
  xfoil.js         export to and import from XFOIL
  export.js        DXF R12, SVG, nesting, fabric estimation
  viewfit.js       fitting drawings and charts to frames

src/ui/            index.html + style.css + app.js
tests/run-tests.js validation suite
tests/benchmark.js performance, scaling and budgets
docs/              nine notes; see below
data/reference/    44 production line sets from nine wings across three
                   manufacturers, six size families (33 sizes, five
                   applications), and a measured 78-line materials table
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
| Canopy isometric scaling, six families | exponent 1.99-2.08 |

---

## Documentation

| file | covers |
| --- | --- |
| `docs/validation.md` | every discrepancy found in the sources, and why |
| `docs/source-map.md` | handbook chapter to implementation |
| `docs/lep-format.md` | LEparagliding interoperability |
| `docs/line-plans.md` | risers, naming, topology inference |
| `docs/loads-and-materials.md` | lift to line tension, kinked strength, drag |
| `docs/scaling.md` | size families, and what does and does not transfer |
| `docs/brakes.md` | brake cascades and engagement |
| `docs/speed-system.md` | risers, accelerated polar, the collapse floor |
| `docs/viewports.md` | fitting, zoom, tabs, the rib view |

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
