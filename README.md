# Paraglider Design Tool

An interactive, browser-based implementation of the **LE Paraglider Design
Handbook** published by [Laboratori d'envol](https://laboratoridenvol.com/paragliderdesign/index.html)
(Pere Hernàndez i Casellas, revised 2012).

The handbook is a complete design method — planform, sections, arc, balance,
panel development, ovalization, lines — but it is a set of pages, equations and
one FORTRAN listing. This project turns that method into something you can
drive: change a number, see the wing change, and export cutting files.

---

## Status

**Phase 1 complete and reviewed.** The geometry pipeline runs end to end, from
design parameters to nested DXF cutting files. It is covered by **152 tests**
and a **benchmark with regression budgets**. Validation includes the handbook's
worked example, the author's 2021 rotation study, a real published airfoil
checked against the handbook's own table, and a cross-check of the section
generator against an independent NACA generator. See `docs/validation.md` for
every discrepancy found, and `ROADMAP.md` for what is next.

---

## Running it

The built tool is a **single HTML file with no dependencies and no network
access**. Open `dist/paraglider-design-tool.html` in any modern browser —
double-clicking works, no server needed.

To rebuild after changing the source:

```bash
python3 build.py           # bundles src/ into dist/paraglider-design-tool.html
node tests/run-tests.js    # 152 checks against known geometry and the sources
node tests/benchmark.js    # timings, scaling, and budget regressions
```

There is no package manager, no build toolchain and nothing to install. Node is
used only to run the tests; Python only to concatenate files.

---

## Why it is built this way

**The core is ES modules; the deliverable is one file.** The maths is split
into small modules so each can be tested and reasoned about alone. But browsers
refuse to load ES modules from `file://` URLs, and someone building a wing in a
workshop should not need a web server. `build.py` inlines the modules into one
scope — and hard-fails the build if two modules declare the same top-level
name, which is the failure mode that arrangement invites.

**Nothing is recomputed in the UI.** Every number on screen comes from the core
modules. The UI reads state, calls the pipeline, and draws. That is what makes
the test suite meaningful: it exercises the same code the interface uses.

**The tests assert what the algorithms actually guarantee.** Where a method is
exact, the tolerance is machine precision. Where it is approximate, the test
says so and pins the size of the approximation. Several of these tolerances
were discovered rather than assumed — see `docs/validation.md`.

---

## Architecture

```
src/core/          the maths — pure functions, no DOM, individually testable
  num.js           integration, root finding, arc-length helpers
  planform.js      ch.1  elliptical + linear edges, areas, AR, centroid
  airfoil.js       ch.2  NACA 4-digit, coordinate import, surface splitting
  lobe.js          ch.3  arc types, arc-length parameterisation, washin
  wing3d.js        ch.3.4 + 2021 study: three rotations, flow-alignment angles
  equilibrium.js   ch.4  longitudinal balance, calage, speed, glide
  flatdev.js       ch.5  triangle-pair unrolling of panels
  ovalization.js   ch.6  billow geometry and panel widening
  lines.js         ch.8  weighted-centroid line cascade
  export.js        DXF R12, SVG, nesting, fabric estimation

src/ui/            index.html + style.css + app.js  (shell, controls, viewports)
tests/run-tests.js validation suite
tests/benchmark.js performance, scaling and budgets
docs/              source mapping and validation notes
build.py           bundler
dist/              the built tool
```

Data flows one way:

```
design inputs
   → planform          (flat plan, chord distribution)
   → lobe              (the arc the reference line is bent onto)
   → wing3d            (ribs rotated for washin, stood normal to the arc)
   ├→ flatdev          → ovalization → seam allowance → nesting → DXF/SVG
   ├→ equilibrium      → speed, glide, calage
   └→ lines            → cascade geometry and cut lengths
```

---

## What the four viewports show

| Viewport | Shows |
| --- | --- |
| **Plan — flat** | Flat planform, every rib station, and the reference line that gets bent into the arc |
| **Front — arc** | The lobe, ribs seen end-on, and the line cascade converging on the maillon |
| **Section — balance** | Central section at its flight attitude, with intake, anchors, centre of pressure, calage and glide path |
| **Cutting layout** | Panels nested on the fabric roll at the width you set |

The geometry colours are the AutoCAD Color Index values the handbook's own
panel subroutine writes into its DXF output — cyan, green, magenta, yellow —
so a wing on screen and the same wing opened from a `.dxf` look alike.

---

## Exports

- **Panels DXF** — nested cutting file, true R12 (`POLYLINE`/`VERTEX`/`SEQEND`,
  `$ACADVER = AC1009`, units in metres), one layer per panel, seam allowance
  applied
- **Ribs DXF** — every rib projected flat into its own plane, labelled with
  chord and washin
- **Panels SVG** — same layout, dimensioned in millimetres so it plots at
  true size
- **Line lengths CSV** — every cascade segment with its length, plus totals by
  row
- **Project JSON** — every input, reloadable

---

## Safety

This implements published design geometry. It does not certify a wing, model
its behaviour at the edge of the envelope, or substitute for load testing. A
paraglider is an aircraft; a structural or trim failure is usually not
survivable. Treat every output as a starting point for analysis and testing by
someone qualified to do it.

---

## Credit and licence

The design method, equations and worked example are the work of **Laboratori
d'envol**, published freely at laboratoridenvol.com. This project is an
independent implementation of that method. The handbook's own software
(LEparagliding) and the FORTRAN listing in chapter 5 are released under the
GNU GPL. Where this implementation departs from the source it says so in a
comment, and `docs/validation.md` collects those departures in one place.
