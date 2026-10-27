# Changelog

Each release's version is `package.json`'s; the page shows it beside its
name, and the self-audit fails if this file's newest entry is not it.
`ROADMAP.md` has the detail of every round.

## 1.3.0 — 2026-10-26

The speed system in the interface.

**Added**

- A **Speed system** group: the bar's travel and the trimmers', and the wing
  across the bar on its own lift curve, in its arc, from the angle the
  balance assumes — speed, sink and glide at each position, the ones past the
  collapse floor marked — and where the trimmers take it, alone and with the
  bar, said when each alone flies and the two together do not.
- An imported design's own table of risers and calage (its section 28), as
  the program its file names prints it, and its output's section 1 figures
  in the balance table, as printed and, where the label says otherwise, as
  it says.
- The polar's note says whether the wing flies in its arc.

**Fixed**

- The interface test's stand-in for the page kept every node it ever made —
  6.5 MB a rebuild — and ran out of memory once the panel grew a table. Its
  selectors search the page from its roots, as a browser's do. The page
  itself never held them: in Chromium it keeps 5,505 nodes and 6.5 MB of
  heap after 60 rebuilds.

## 1.2.0 — 2026-10-26

The wing flies in its arc.

**Flight**

- The polar and the balance flew a flat wing: the lifting line's straight
  span and the handbook's flat finite-span factor. They fly the wing in its
  arc now, by the vortex lattice: the wing as built against itself laid
  flat, its lift slope, zero-lift angle and induced drag at the same lift
  (`arcFactors`). A paraglider's arc leaves it 0.72 to 0.80 of the flat
  wing's lift and a fifth to a quarter more induced drag. The interface flies
  it so unless **Fly the wing in its arc** is unticked; the full pipeline
  flies its 55 sizes so.
- Against published figures: at the assumed 6° the Geo 7 trims at CL 0.59
  in its arc, where real wings trim, and three of its four certified cases
  are above 30 km/h, where flat one was; the Lynx 2 M's derived glide is
  10.8 against the published 11, its sink 0.88 against 1.0 and its trim 34.3
  against 39, from 12.2, 0.69 and 30.1 flat.

**Fixed**

- The vortex lattice's trailing legs left each strip at its quarter chord,
  straight downstream. On an arc the system grew ill-conditioned with the
  angle: the default wing's circulation ran away above 9°, and the lift a
  37° arc costs came out 16% where it is 11%. They run along each strip's
  edge to its trailing edge now. 1.1.0's assessment and roadmap quoted the
  16%.
- The lattice left a centre cell — the middle of a wing with an odd number
  of cells — out of the wing it solved.

## 1.1.0 — 2026-10-26

From an audit of the published repository, its code and its documents.

**Licence**

- `LICENSE` is the GNU GPL v3 as the repository carries it, held to its
  checksum. `LICENSING.md`, deleted on GitHub and put back by each release
  since, is gone; the audit fails if it returns.

**Fixed**

- A wing or design name carrying markup ran it, in the status bar and in the
  import box. Both write text, and the page carries a content security
  policy: its one script by its hash, no network.
- A damaged design file threw a raw error from the line reader (19 of 200
  damaged files). Every section the lines take is checked as it is read, and
  an import loads what it can and names the section and line it could not.
- The status bar counted three ribs with no load path on the gnuC2-23 where
  the panel says its own pieces join two of them.
- An import is cut as the program its header names cut it: holes as 39-sided
  polygons before 3.30, a 3.25 file's diagonals, pockets and mini-ribs its
  way, and only what of sections 37 and 38 that program reads. The
  Tuluaq-19's internal structure in the bill is 10.77 m², as its 3.25 drew
  it, where it was 10.48, as 3.30 would cut it.
- `MANIFEST.txt` left out the interface test and its page shim, which two
  check stages run, and `package.json`, which the build reads.
- The speed system's chain from the wing (`acceleratedPolarFromWing`,
  `collapseFloorForTopSpeed`) took the lifting line's coefficient for a
  section's and applied the finite-span factor to it a second time. Flown as
  it is, the Lynx 2's derived trim is 30.1 km/h, not 35.1, and the floor its
  58 km/h implies Cz 0.22, not 0.307.

**Documents**

- The Lynx 2's published flight figures were matched on a lift curve typed by
  hand; the curve derived from the wing gives 30.1 km/h, 43.0, 12.2 and 0.69
  against 39, 58, 11 and 1.0 (`docs/validation.md` §2.7).
- The load cases are their own note, `docs/load-cases.md`.
- The assessment's size and line counts, the notes' count and the reference
  data's size were stale; the audit holds them now. Five roadmap items were
  done or repeated others, and are closed.

**Added**

- The version in the page, this changelog, and a GitHub workflow that builds
  the page, checks it is the one committed, and runs every check stage.

## 1.0.0 — to 2026-10-26

Every release before versioning carried 1.0.0. In outline, by round:

- **to 10-12** — lines, fibres and inspection checked against the makers'
  data; the line catalogue under its right fibre; the PMA inspection check
  against a maker's own record.
- **10-19 to 10-21** — the makers' own line-plan drawings; each picker wing
  hangs from its own cascade; the reference wings' arc an ellipse through
  their projected span.
- **10-21** — the Tuluaq-19, a second complete design, read exactly.
- **10-22** — what a design sews inside its cells, cut as its program cuts it.
- **10-22 to 10-26** — the gnuC2-23, a third complete design; every rib and
  panel cut as its program cuts them.
- **10-26** — the program's longitudinal balance and section 1 figures
  reproduced; the vortex lattice's induced drag on an arc corrected.
