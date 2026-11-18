# Changelog

Each release's version is `package.json`'s; the page shows it beside its
name, and the self-audit fails if this file's newest entry is not it.
`ROADMAP.md` has the detail of every round.

## 1.9.0 — 2026-11-17

The section's own mean line, NACA five-digit sections, and the two-liners'
bridles as Ozone draws them.

**Added**

- NACA five-digit sections, standard and reflexed (`naca5`, `nacaSection`):
  the 1930s mean lines with the camber far forward, on the four-digit
  thickness closed at the trailing edge, from NASA TM-4741's constants. The
  suite holds all nine mean lines to the conditions they were drawn to —
  the maximum camber at 0.05 P, an ideal lift coefficient of 0.3 within 3%,
  and no moment about the quarter chord on the reflexed ones, within
  0.0014. The interface offers the NACA 23015 and the reflexed 23115, and
  says what each code means.

**Fixed**

- Thin-aerofoil theory was worked on the mean of a section's two surfaces,
  which is not its mean line where the thickness is laid perpendicular to
  a sloping one. A section the tool generates carries the line it was built
  on now, and the theory, the chordwise loading and reflex are worked on
  it: the NACA 2412 gives the worked example's -2.077° and -0.0531 exactly,
  where it read -2.115°, and the default 4415 -4.154° and -0.1062, where it
  read -4.275° and -0.1052 — an error that grew with the thickness. On the
  default wing at 5° the trim moves from 34.97 to 35.16 km/h and the calage
  from 41.9% to 42.3%; the A row's pressure share from 36.1% to 35.3%.
  Imported sections, read from their coordinates, do not move.
- `naca4` took five-digit codes and read them as four: '23012' came out 2%
  camber at 30%. It refuses them, and each code goes to its own reader.
- The two-liners' bridles: Ozone's rigging diagrams of the Alpina 5, the
  Zeno 2 and the Lyght, supplied by the user, draw each bridle pair on one
  rib, one tab behind the other along the chord. Four documents said
  neighbouring ribs, or that no drawing was on file. The sheets' names count
  the eight lines under the pairs as anchors: the Alpina 5's canopy has 23 A
  tabs on 15 ribs where the count says 31. Building the bridle level is
  still open, and now specified.

**Documents**

- The certification trims, the Lynx 2 M's derived figures, the pipeline's
  55 sizes and the default wing's balance, with the exact mean line;
  `docs/environment-and-aero.md` §3 on the mean line and §4 on five-digit
  sections.

## 1.8.0 — 2026-11-03

The risers' webbing, and its drag.

**Added**

- This tool's own risers have a width now, and their drag is counted: each
  a strap broadside to the flow at Cd 1.98, as LEparagliding counts one, at
  its own angle to the flow. **Riser webbing width**, under Assumptions, is
  12 mm by default, the main riser webbing of six of the eight wings dated
  from 2020 whose bills of materials the DHV publishes — all of Swing's and
  the Nova Codex, aramid and polyester; the Nova Glitch and a 2025 list that
  does not name its wing have 20 mm. Ten lists are in `RISER_WEBBING`
  (risers.js), each with its address, under the provenance check; 0 leaves
  the risers' drag out, and the Balance table says so. An imported design's
  risers are still its own.
- On the default wing the straps add 0.003 to its lines' 0.009 and move
  their drag's centre from 2.93 to 3.91 m down. It flies on the handbook's
  typed line drag unless asked to fly on its plan's, so its speed and glide
  do not move; its calage at 5° does, from 40.8% to 41.9% of chord.
- The bill of materials says how wide the riser webbing is.

**Documents**

- `docs/loads-and-materials.md` §3, `docs/balance.md`, `docs/hang-point.md`
  and `docs/full-pipeline.md` §6 with the risers counted; the straps in
  tandem, each counted as if alone, are an open item.

## 1.7.0 — 2026-11-02

Each line's own drag, and the section's moment from XFOIL.

**Added**

- Each line's drag coefficient from its own Reynolds number, 1 + 10
  Re^-2/3 on its diameter and the flow square to it — White's correlation,
  as LEparagliding takes it — where every line was 1.1. One coefficient
  typed for every line stays a choice: **Line drag coefficient**, under
  Assumptions. Square to the flow, the gnuC2-23's 95 lines are its
  program's drag to the last digit.
- A line's drag goes as sin³ of its angle to the flow, the cross-flow
  principle's part along the flow, where it went as sin²: 8.5% off the
  gnuC2-23's set at its section 17's 9.45°. Its loops are in its frontal
  length, an imported line's as its program counts them, a spliced loop at
  √2 − 1 of its length.
- An imported design's risers' drag, as its program counts it: a strap
  broadside at Cd 1.98, a round riser as a line. This tool's own plans give
  their webbing no width, so their risers' drag is not counted, and the
  Balance table says so.
- A loaded XFOIL polar's Cm0 and zero-lift angle in the balance, the trim
  and the lattice's angle, where thin-aerofoil theory's were taken whatever
  was loaded; the Balance table names which.
- On the gnuC2-23 at its 4.51° the calage is 32.4%, the rules' 25.5%, and
  its lines' drag is centred within 3 mm of where its program centres it.
  The default wing's lineset Cx is 0.0091 where it was 0.0079, thin lines'
  Cd 1.21 and their loops, and its calage at 5° 40.8%.

**Fixed**

- Loading one imported design after another kept the first one's pilot,
  wing mass and pilot drag: the Swoop2 and the Tuluaq-19 were balanced, and
  their 1.6.0 figures written, with the gnuC2-23's 70 kg pilot on a 4 kg
  wing. Each design starts from the parametric wing's now, its own section
  35 over them, and the gnuC2-23's pilot flies on the drag it gives him,
  Cd 0.6 on 0.438 m², where he had the default Cx 0.015.
- An XFOIL polar that does not reach zero lift — swept from 0°, as many
  are — had its first angle taken for its zero-lift angle, some 4° out on a
  cambered section, and the wing was flown on it: on the suite's polar near
  a NACA 4415's, cut to start at 0°, the default wing at 5° flew 44 km/h
  where the whole polar flies it at 35, its calage 8 points of chord aft.
  Its zero lift is found along its lift slope now, 0.4 points from the
  whole polar's calage, and the panel says so; a polar whose lift does not
  rise with its angle is refused.
- A sheathed line's drag had 5% added that nothing sourced; it is gone.

**Documents**

- `docs/loads-and-materials.md` §3: the line drag model and its check
  against LEparagliding's. `docs/balance.md`: the three designs with their
  own pilots; the default wing's lift centroid 0.51 m below the chord, which
  said 0.48, and the Swoop2's and the Tuluaq-19's 0.53 and 0.39 m, which
  were misrounded.

## 1.6.0 — 2026-10-28

The balance with every force where it acts.

**Added**

- The balance on the wing's polar puts each force where the wing says it
  acts, and takes moments about the karabiners (`balanceWhereForcesAct`):
  the lift on its own line in the arc — the centroid of the vortex lattice
  strips' lift, moved along the flow by the sections' Cm0 on their own
  chords — the profile and induced drag at their own centres, the wing's
  weight at its cloth's mass centre (`wingMassCentre`), the lines' weight
  and drag at theirs from the plan (`lineCentres`), and the pilot below the
  karabiners, free to swing or held plumb. Chapter 4's rules — the lift on
  the central chord at 0.25 − Cm0/CL, the wing's weight a third back, the
  lines half and a third of the way down, the pilot at the karabiners —
  remain a choice: **Forces act** in the Balance panel. With every point
  the rules', the handbook's calage to the micrometre; with the program's
  points, the gnuC2-23's section 17 (`calageFromForces`). The Balance table
  says where each acts, and the section view draws the wing's force and
  mass.
- On the gnuC2-23 at the 4.51° its file declares it hangs the pilot at
  33.0% of chord, where the file hangs him at 33% and the rules at 26.3%;
  its lines' weight is centred within 1.4 mm of where its program centres
  it. A paraglider's quarter-chord line runs back toward its tips, and the
  lattice puts the three designs' lift 2.2 to 5.9 points of chord aft of
  the rule's centre of pressure, 0.38 to 0.60 m below the chord
  (`docs/balance.md`).

**Fixed**

- An exported design's section 8 gave LEparagliding the centre of pressure,
  to a whole per cent, where the program takes the point the pilot hangs
  plumb under and sets the attitude from it: it flew the export at another
  angle than the balance's. It is the karabiners' plumb point now, to a
  hundredth, with the riser the plan hangs from, and the program gives the
  balance's attitude back.

**Documents**

- `docs/balance.md`: the method, what it reproduces, the three designs, and
  what it does not do yet — the sections' moment from an XFOIL polar, the
  risers' drag, a line's drag at an angle as the cross-flow principle has
  it, the wing's rods and reinforcement where they are.

## 1.5.0 — 2026-10-27

OpenGlider, read: its line types, and its sum of the line set by level.

**Added**

- `data/reference/line-stretch.tsv`: OpenGlider's 56 line types — Cousin's
  Vectraline, CTL 900 and Technoline, Liros's LTC, NTSL, TSL, DFL and DSL —
  with their load and elongation measured, credited, in daN. Thirteen of the
  catalogue's lines stretch on their own curves now (`elongationOf`), in the
  length chain and the stretch correction; the generic 3.5 and 5% at the
  rated strength had been 1.5 to 3 times a sheathed Technora line's stretch
  at 5 daN, and 3.6 times a sheathed Dyneema one's. A 3 m TSL 190 main
  measured at 5 daN is 3.7 mm over its sewn length, not 7.6.
- The line set level by level, as the DHV calculates it for EN 926-1:2015
  and NfL 2-565-20 (`strengthByLevel`): each level's strengths after bending,
  both sides, at least 1400 daN and 14 times the weight, every line 20 daN,
  each brake level 150 daN, a branch that has ended counted again above it,
  as OpenGlider's `get_floor_strength` counts it. The Lines group shows
  every level against it.

**Fixed**

- Sized line by line, the tool's line sets fell short of that calculation:
  the default wing's mains came to 1382 daN and its brake's first level to
  82, a DC 40 a side, where the Lynx 2 M's sheet gives 2015 and a PPSL 200 a
  side. The weakest lines of a short level are taken up a size until it holds,
  unless **Size each level to the DHV line calculation** is unticked.
- Bare aramid line was weighed at 0.9 g/m per mm² of its area, a guess;
  Liros's LTC, in OpenGlider's table, comes to 1.11 over nine sizes, and the
  catalogue takes that now. Liros's sheathed lines, 0.955 over 24, confirm
  the 0.98 taken from Edelrid's. A line OpenGlider weighs takes its weight.

**Documents**

- `docs/openglider.md` reviews OpenGlider's code and data, where it had gone
  no further than its README: what was taken, what was not and why — line
  sag under drag is 7 mm at most on a loaded line and adds 27 µm — and four
  slips in it.

## 1.4.0 — 2026-10-27

The balance on the wing's own polar.

**Fixed**

- The balance counted the section's pitching moment twice. The handbook's
  4.2 puts the lift at the centre of pressure, which already carries that
  moment, and adds −q0·Cm again in a seventh term, without the chord; the
  worked example and the author's own program leave it out. Counted once, a
  pilot with nothing below the wing but weight hangs plumb under the centre
  of pressure, to the micrometre. On the default NACA 4415 wing the second
  count had put the calage 6.1 points of chord aft at 5°, and it is where the
  "40 to 45% real wings use" came from: the lift real wings trim at needs 32
  to 36%, where the three complete designs on file hang theirs.
  `printedAeroMoment: true` restores the term as printed.
- A calage forward of the centre of pressure was refused as one a wing could
  not balance at, by the same double count. A wing gliding nose down hangs
  there: the three designs' files hang their pilots at 33, 32.5 and 36% under
  plumb points of 38, 40 and 39%. Refused, the 13 m² Ultralite 5 had its
  lines hung from its anchors' centre. Only the 2012 worksheet's calage is
  refused now, for a glide its own coefficients do not give.
- Two of the suite's sections passed the line height as `lineLengthM`,
  which the balance does not read, and flew on its default 6 m.

**Added**

- **Balance on**: the wing's own polar at the angle (the default), the polar
  trimmed from the calage, or the handbook's typed coefficients. On the polar
  the lift, induced and profile drag are the polar's, in its arc, and the
  centre of pressure the section's Cm0 places on the wing's own lift; the
  loads, the cloth's billow, the intake and the speed system follow the
  angle it flies at, and the speed bar's first row is the balance's trim.
  The balance table says what it was flown on, and when a calage cannot trim
  the wing, why.
- An imported design's own calage, trimmed on this tool's polar, beside the
  angle its file declares: the Tuluaq-19's 36% trims at 7.51° for its 7.41,
  the gnuC2-23's 33% at 5.68° for its 4.51.
- Against the certificates: no Geo 7's calage is published; trimmed in its
  arc from 34%, all four certified cases are above 30 km/h, and the lightest
  only from a calage forward of 37.1%.

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
