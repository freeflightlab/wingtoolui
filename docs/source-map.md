# Source map

Every page of the handbook, where it went, and what state it is in.

Source: <https://laboratoridenvol.com/paragliderdesign/index.html> (revised
2012-07-27). Chapter and section numbers below are the source's own.

| Source page | Covers | Implemented in | State |
| --- | --- | --- | --- |
| `preface.html` | Motivation | — | Context only |
| `platform.html` §1.1 | Planform elements, historical shapes | — | Context only |
| `platform.html` §1.2.1 | Elliptical + linear edge equations | `planform.js` `analyticPlanform`, `planformFromDesignInputs` | Complete |
| `platform.html` §1.2.2 | Discrete station tables | `planform.js` `discretePlanform` | Complete |
| `platform.html` §1.3 | Planform centre of gravity | `planform.js` `planformMetrics` | Complete |
| `airfoils.html` §2.1–2.3 | Aerofoil theory, Joukowsky | — | Context only |
| `airfoils.html` §2.4 | Geometry and parameters | `airfoil.js` `airfoilMetrics` | Complete |
| `airfoils.html` §2.5 | Forces, Cm0 and stability | `equilibrium.js`, `aero.js` `thinAirfoil` | Used by ch.4 |
| `airfoils.html` §2.6 | NACA sections | `airfoil.js` `naca4` | 4-digit, closed TE by default |
| `airfoils.html` §2.7 | Intakes, anchors, rib holes | `airfoil.js` (anchors), `intake.js`, `ribholes.js` | Complete: holes and cross-ports drawn on the Rib tab and cut in the rib DXF |
| `airfoils.html` §2.8–2.10 | XFOIL, XFLR5, fitting | `airfoil.js` `parseAirfoilText`, `xfoil.js` | Selig + Lednicer import; an XFOIL package out and its polar back in; XFLR5 not |
| `voute.html` §3.1 | Arc types a–e | `lobe.js` `buildLobe` | Four of five: (a) circle, (c) ellipse, (d) bionic, (e) a point list; (b) is not built. A published wing is built on (c) through its projected span (`ellipseForProjectedRatio`) |
| `voute.html` §3.2 | Influence of arc shape | `lobe.js` `lobeMetrics` | Metrics reported |
| `voute.html` §3.3 | Washin / washout | `lobe.js` `washinAt` | Three distributions |
| `voute.html` §3.4 | Profile insertion, both rotations | `wing3d.js` `buildWing` | Complete |
| `le.html` §4.1–4.2 | Equilibrium equations | `equilibrium.js` | Complete |
| `le.html` §4.3 | Solving the system | `equilibrium.js` `solveEquilibrium` | Closed form, not iterative |
| `le.html` §4.4 | Worked spreadsheet | `equilibrium.js` legacy mode | Reproduced — see validation §1 |
| `le.html` §4.5 | Simplified graphical method | `equilibrium.js` `simplifiedCalage`, `glideAngleTable` | In the core and the suite; not in the interface |
| `le.html` §4.6 | Empirical methods | — | Judgement, not computation |
| `pspeed.html` | Tuning a prototype's speed | — | Not implemented |
| `flatdevelopment.html` §5.1–5.3 | The LE unrolling method | `flatdev.js` `developPanel` | Complete |
| `flatdevelopment.html` §5.4 | FORTRAN reference listing | `flatdev.js`, `export.js` | Ported — see validation §1 |
| `ovalization.html` §6.1–6.3 | Billow, both directions | `ovalization.js` `solveArc`, `seamEasing` | See validation §1 |
| `ovalization.html` §6.4 | Panel corrections | `ovalization.js` `applyOvalization` | Complete |
| `V-H-ribs.html` | Diagonal rib technology | `vribs.js` | Diagonals placed from the line plan, drawn on the Structure tab and cut in the diagonals DXF; H ribs built in the core only |
| `lines.html` §8.1 | Cascade by weighted centroid | `lines.js` `buildCascade` | Both load cases, in the core and the suite. The interface's cascade is `lineplan.js` `buildLinePlan` |
| `lines.html` §8.2 | Brakes and distribution | `lines.js` `brakeAnchors`, `applyBrakeDistribution` | As §8.1; the interface's brakes are `lineplan.js` `buildBrakePlan` |
| `lines.html` §8.3–8.4 | Elasticity, loads | `loads.js`, `trimdrift.js` | Implemented beyond the source, which has headings only |
| `risers.html` §9.1–9.2 | Risers, 4-riser speed system | `risers.js`, `lineplan.js` (riser layouts) | Riser layouts in the interface; the speed system and accelerated polar in the core and the suite |
| `risers.html` §9.3–9.4 | Trimmers, vario seat | `risers.js` (trimmers) | Trimmers in the core and the suite; no vario seat |
| ch.10 | Materials | `loads.js`, `fabric.js`, `reinforcement.js`, `bom.js` | Lines, cloth, rods, tabs and the bill, from suppliers' figures where they publish them |
| `leparagliding.en.html` | The author's own software | `lep.js`, `leplines.js`, `lepstructure.js` | The format read and written (`docs/lep-format.md`); a design's own ribs, lines, rods and holes computed as its program computes them (validation §2.6), and its internal structure cut as it cuts it (`docs/internal-structure.md`) |
| `gnuLAB2` | Complete example wing | `data/reference/lep` | The Swoop2 stands in: a complete design from the same author, loadable in the interface |
| `glossary.html` | EN/FR/ES/CA glossary | — | Not used |
| `links.html` | References | — | Bibliography |

## Every module, and whether the interface reaches it

The handbook covers ten of the 39 modules in `src/core`. The rest came from
the production data and the standards. "Core and suite" means the code exists
and is tested and nothing in the interface calls it — said here so that a
page describing it is not read as describing the tool.

| module | what it is for | in the interface |
| --- | --- | --- |
| `aero.js` | section polar estimate, lifting line, wing polar | the polar on the Analysis tab |
| `airfoil.js` | NACA 4-digit, coordinate import, metrics | yes |
| `atmosphere.js` | US Standard Atmosphere 1976 to 86 km; Re, Mach, Kn and their flags | Environment panel |
| `bom.js` | bill of materials; mass reconciliation and thread | the bill; the reconciliation is core and suite |
| `compare.js` | two designs side by side | Balance panel, against a remembered design |
| `equilibrium.js` | chapter 4 balance; the coupled solve; trim from the calage | the handbook balance; `solveEquilibriumFromWing` and `trimFromCalage` are core and suite |
| `export.js` | DXF, SVG and printable writers; nesting; a DXF reader | writers and nesting; the reader in the suite and the interface test |
| `fabric.js` | cloth by location | yes |
| `family.js` | a size family from one design | Size family |
| `flatdev.js` | chapter 5 flat development | yes |
| `freebody.js` | the hanging wing as one body under gravity | Balance panel |
| `inflated.js` | the flying shape against the built one | core and suite |
| `intake.js` | the cell opening and its stagnation point | the intake note on the rib view; the rest core and suite |
| `lep.js` | the LEparagliding file, read and written | yes |
| `leplines.js` | an imported design's own geometry and lines | yes |
| `lepstructure.js` | an imported design's diagonals, straps, pieces between ribs and rod pockets, as its program cuts them | the bill and the Diagonals DXF |
| `lineplan.js` | risers and cascade; readers for six makers' sheets | the plan; the sheet readers in the suite and tools |
| `lines.js` | chapter 8's weighted-centroid cascade | core and suite; the interface's cascade is `lineplan.js` |
| `loads.js` | loads, line choice, stretch, length chain, drag, load cases | yes; collapse, gust and envelope cases are core and suite |
| `lobe.js` | chapter 3 arc and washin | yes |
| `marking.js` | registration marks on a cutting file | through the marked Panels DXF |
| `num.js` | numeric helpers | — |
| `ovalization.js` | chapter 6 billow | yes |
| `pairing.js` | interlocking panels before they are packed | through nesting |
| `planform.js` | chapter 1 | yes |
| `pma.js` | the PMA inspection standard | Inspection check, PMA data sheet |
| `pressure.js` | chordwise loading and the rows' shares | the billow from pressure |
| `reinforcement.js` | rods, tabs, reinforcement | yes |
| `ribholes.js` | lightening holes and cross-ports | yes |
| `ribstress.js` | what the rib cloth carries | Rib stress report |
| `risers.js` | speed system, trimmers, accelerated polar, webbing | core and suite |
| `scaling.js` | family scaling laws, the reference library, line per span | the picker's design inputs, the line height law and the line consumption estimate |
| `shaping3d.js` | 3D shaping darts at the leading edge | core and suite |
| `trimdrift.js` | why a wing goes out of trim, and when to check it | Line set & trim, Inspection check |
| `viewfit.js` | fitting a drawing to its frame | yes |
| `vlm.js` | a vortex lattice over the arced wing | core and suite |
| `vribs.js` | diagonals, and H ribs | the diagonals; `buildHRibs` is core and suite |
| `wing3d.js` | chapter 3.4 profile insertion | yes |
| `xfoil.js` | an XFOIL package out, a polar back | XFOIL package, polar import |

---

## Sections the source leaves open

Several places in the handbook are explicitly marked incomplete — `(...)`,
`(in redaction)`, `EN EDICIÓ`, or "to be developed". These are not oversights
in this implementation:

- §1.2 worked parameter example — never filled in
- §1.3 centre-of-gravity correlations — the relationship is described but not given
- §2.2 cylinder in an airflow — placeholder
- §2.6 NACA generation equations — referenced, not printed
- §4.3 analytical solution — "to be developed"; the numerical route is given instead
- §8.3, §8.4 — headings only
- §9.3, §9.4 — headings only
- ch.10 — a list of material names

Where a gap blocks implementation it is noted in `ROADMAP.md`. Where the
standard engineering treatment is unambiguous — the NACA 4-digit equations, for
instance — that is used, and the fact is recorded in the module comment.
