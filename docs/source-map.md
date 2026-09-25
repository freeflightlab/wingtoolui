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
| `airfoils.html` §2.5 | Forces, Cm0 and stability | `equilibrium.js` | Used by ch.4 |
| `airfoils.html` §2.6 | NACA sections | `airfoil.js` `naca4` | 4-digit, closed TE by default |
| `airfoils.html` §2.7 | Intakes, anchors, rib holes | `airfoil.js` (intake, anchors) | Holes → Phase 3 |
| `airfoils.html` §2.8–2.10 | XFOIL, XFLR5, fitting | `airfoil.js` `parseAirfoilText` | Selig + Lednicer import |
| `voute.html` §3.1 | Arc types a–e | `lobe.js` `buildLobe` | Complete |
| `voute.html` §3.2 | Influence of arc shape | `lobe.js` `lobeMetrics` | Metrics reported |
| `voute.html` §3.3 | Washin / washout | `lobe.js` `washinAt` | Three distributions |
| `voute.html` §3.4 | Profile insertion, both rotations | `wing3d.js` `buildWing` | Complete |
| `le.html` §4.1–4.2 | Equilibrium equations | `equilibrium.js` | Complete |
| `le.html` §4.3 | Solving the system | `equilibrium.js` `solveEquilibrium` | Closed form, not iterative |
| `le.html` §4.4 | Worked spreadsheet | `equilibrium.js` legacy mode | Reproduced — see validation §2.5 |
| `le.html` §4.5 | Simplified graphical method | `equilibrium.js` `simplifiedCalage`, `glideAngleTable` | Complete |
| `le.html` §4.6 | Empirical methods | — | Judgement, not computation |
| `pspeed.html` | Tuning a prototype's speed | — | Phase 4 |
| `flatdevelopment.html` §5.1–5.3 | The LE unrolling method | `flatdev.js` `developPanel` | Complete |
| `flatdevelopment.html` §5.4 | FORTRAN reference listing | `flatdev.js`, `export.js` | Ported — see validation §2.2, §2.3 |
| `ovalization.html` §6.1–6.3 | Billow, both directions | `ovalization.js` `solveArc`, `seamEasing` | See validation §2.1 |
| `ovalization.html` §6.4 | Panel corrections | `ovalization.js` `applyOvalization` | Complete |
| `V-H-ribs.html` | Diagonal rib technology | — | **Phase 2** — figures only in source |
| `lines.html` §8.1 | Cascade by weighted centroid | `lines.js` `buildCascade` | Both load cases |
| `lines.html` §8.2 | Brakes and distribution | `lines.js` `brakeAnchors`, `applyBrakeDistribution` | Complete |
| `lines.html` §8.3–8.4 | Elasticity, loads | — | **Phase 3** — unwritten in source |
| `risers.html` §9.1–9.2 | Risers, 4-riser speed system | — | **Phase 2** |
| `risers.html` §9.3–9.4 | Trimmers, vario seat | — | **Phase 2** |
| ch.10 | Materials | — | **Phase 3** — names only in source |
| `leparagliding.en.html` | The author's own software | `lep.js` | File format read/written — see `docs/lep-format.md` |
| `gnuLAB2` | Complete example wing | — | **Phase 4** — reference design |
| `glossary.html` | EN/FR/ES/CA glossary | — | Phase 4 — useful for labels |
| `links.html` | References | — | Bibliography |

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
